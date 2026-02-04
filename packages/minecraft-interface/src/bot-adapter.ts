/**
 * BotAdapter: Manages mineflayer bot connection and lifecycle
 *
 * Handles bot creation, connection, event management, and graceful shutdown.
 * Provides a stable interface for the planning system to interact with Minecraft.
 *
 * @author @darianrosebrook
 */

import { Bot, createBot } from 'mineflayer';
import { EventEmitter } from 'events';
import { Vec3 } from 'vec3';
import { BotConfig, BotEvent, BotEventType } from './types';
import { AutomaticSafetyMonitor } from './automatic-safety-monitor';
import { resilientFetch, TTSClient } from '@conscious-bot/core';
import { ActionTranslator } from './action-translator';
import mcData from 'minecraft-data';
import {
  BeliefBus,
  buildEvidenceBatch,
  TICK_INTERVAL_MS,
  EMIT_INTERVAL_MS,
  type BeliefStreamEnvelope,
} from './entity-belief';
import { assessReflexThreats, ReflexArbitrator } from './reflex';
import { isSystemReady, onSystemReady } from './startup-barrier';

/** Module-level monotonic counter for ephemeral stream_id (deterministic, no Date.now()) */
let botInstanceCounter = 0;

export class BotAdapter extends EventEmitter {
  private bot: Bot | null = null;
  private config: BotConfig;
  private reconnectAttempts = 0;
  private isShuttingDown = false;
  private connectionState:
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'spawned' = 'disconnected';
  private safetyMonitor: AutomaticSafetyMonitor | null = null;
  private actionTranslator: any = null;

  // Throttling state
  private lastChatResponse = 0;
  private lastSocialChatResponse = 0;
  private lastEnvironmentalResponse = 0;
  private readonly chatCooldown = 30000; // 30 seconds between autonomous/environmental chat responses
  private readonly socialChatCooldown = 5000; // 5 seconds between player-directed chat responses
  private readonly environmentalCooldown = 15000; // 15 seconds between environmental responses

  // Track intervals and listeners for cleanup on disconnect
  private activeIntervals: NodeJS.Timeout[] = [];
  private listenersAttached = false;
  private lastDeathMessage: string | null = null;
  private lastDeathMessageAt = 0;

  // TTS client (Kokoro-ONNX, optional — fire-and-forget voice output)
  private ttsClient: TTSClient;

  // Entity belief system (replaces per-entity /process POSTs)
  private beliefBus: BeliefBus;
  private beliefTickId = 0;
  private emitSeq = 0;
  private reflexArbitrator: ReflexArbitrator;
  private beliefBusStarted = false;
  private beliefBusPending = false;

  // Performance benchmarking — capped ring buffer for responseTimes
  private static readonly MAX_RESPONSE_TIMES = 200;
  private performanceMetrics = {
    entityScans: 0,
    chatResponses: 0,
    environmentalEvents: 0,
    tasksCreated: 0,
    responseTimes: [] as number[],
    startTime: Date.now(),
  };

  constructor(config: BotConfig) {
    super();
    this.config = config;
    const instanceNonce = ++botInstanceCounter;
    const botId = `bot-${config.username}`;
    const streamId = `${botId}-${instanceNonce}`;
    this.beliefBus = new BeliefBus(botId, streamId);
    this.reflexArbitrator = new ReflexArbitrator();
    this.ttsClient = new TTSClient();

    // Handle error events to prevent unhandled errors
    this.on('error', (error) => {
      console.error('BotAdapter error:', error);
    });
  }

  /**
   * Connect to Minecraft server
   */
  async connect(): Promise<Bot> {
    if (this.bot && this.connectionState !== 'disconnected') {
      throw new Error('Bot is already connected or connecting');
    }

    this.connectionState = 'connecting';
    this.isShuttingDown = false;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 30000); // 30 second timeout

      // Skin: with auth 'microsoft', the account's selected skin is sent via session;
      // with 'offline' the server typically shows a default. Third-party servers often
      // need a skin plugin (e.g. SkinRestorer) to apply skins from the session.
      this.bot = createBot({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        version: this.config.version,
        auth: this.config.auth,
      });

      // Add mcData to the bot for crafting support
      if (this.bot) {
        (this.bot as any).mcData = mcData(this.config.version);
        console.log(`🔧 Added mcData for version ${this.config.version}`);
      }

      this.setupBotEventHandlers();

      this.bot.once('login', () => {
        clearTimeout(timeoutId);
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        this.emitBotEvent('connected', {
          username: this.config.username,
          server: `${this.config.host}:${this.config.port}`,
        });
      });

      this.bot.once('spawn', () => {
        this.connectionState = 'spawned';

        const spawnData: any = {
          gameMode: this.bot?.game?.gameMode,
          dimension: this.bot?.game?.dimension,
        };

        // Only include position if entity exists
        if (this.bot?.entity && this.bot?.entity?.position) {
          spawnData.position = this.bot?.entity?.position?.clone();
        }

        this.emitBotEvent('spawned', spawnData);
        if (!this.bot) {
          reject(new Error('Bot became null before spawn resolved'));
          return;
        }
        resolve(this.bot);
      });

      this.bot.once('error', (error) => {
        clearTimeout(timeoutId);
        this.connectionState = 'disconnected';
        this.emitBotEvent('error', { error: error.message });

        if (!this.isShuttingDown && this.config.autoReconnect) {
          this.attemptReconnect();
        }

        reject(error);
      });

      this.bot.once('end', (reason) => {
        this.connectionState = 'disconnected';
        this.emitBotEvent('disconnected', {
          reason,
          deathMessage:
            this.lastDeathMessage &&
            Date.now() - this.lastDeathMessageAt < 30000
              ? this.lastDeathMessage
              : undefined,
        });

        if (!this.isShuttingDown && this.config.autoReconnect) {
          this.attemptReconnect();
        }
      });
    });
  }

  /**
   * Disconnect from server and clean up all resources
   */
  async disconnect(): Promise<void> {
    this.isShuttingDown = true;

    // Stop safety monitor
    if (this.safetyMonitor) {
      this.safetyMonitor.stop();
      this.safetyMonitor = null;
    }

    // Clear all tracked intervals
    for (const interval of this.activeIntervals) {
      clearInterval(interval);
    }
    this.activeIntervals = [];

    // Remove all bot event listeners to prevent stacking on reconnect
    if (this.bot) {
      this.bot.removeAllListeners();
      this.bot.quit('Disconnecting');
      this.bot = null;
    }

    this.listenersAttached = false;
    this.connectionState = 'disconnected';
    this.emitBotEvent('disconnected', { reason: 'Manual disconnect' });
  }

  /**
   * Get the current bot instance
   */
  getBot(): Bot {
    if (!this.bot) {
      throw new Error(
        `Bot is not connected. Connection state: ${this.connectionState}`
      );
    }
    return this.bot;
  }

  /**
   * Check if bot is connected and spawned
   */
  isReady(): boolean {
    return this.connectionState === 'spawned' && this.bot !== null;
  }

  /**
   * Check if viewer can be started
   */
  canStartViewer(): { canStart: boolean; reason?: string } {
    if (!this.bot) {
      return { canStart: false, reason: 'Bot instance not available' };
    }

    if (this.connectionState !== 'spawned') {
      return {
        canStart: false,
        reason: `Bot not spawned. Current state: ${this.connectionState}`,
      };
    }

    return { canStart: true };
  }

  /**
   * Get current connection state
   */
  getConnectionState(): string {
    return this.connectionState;
  }

  /**
   * Initialize safety monitor with an external ActionTranslator
   * This should be called by PlanExecutor after it creates the shared ActionTranslator
   * to avoid duplicate ActionTranslator/NavigationBridge instances.
   */
  initializeSafetyMonitor(actionTranslator: ActionTranslator): void {
    if (!this.bot) return;

    // Prevent duplicate initialization
    if (this.safetyMonitor) {
      console.log('🛡️ Safety monitor already initialized, skipping');
      return;
    }

    try {
      this.safetyMonitor = new AutomaticSafetyMonitor(
        this.bot,
        actionTranslator,
        {
          healthThreshold: 15,
          checkInterval: 2000,
          autoFleeEnabled: true,
          autoShelterEnabled: true,
          maxFleeDistance: 20,
        }
      );

      // Start automatic safety monitoring
      this.safetyMonitor.start();

      console.log('🛡️ Automatic safety monitoring enabled');

      // Set up safety monitor event handlers
      this.safetyMonitor.on('emergency-response', (data) => {
        this.emitBotEvent('safety_emergency', data);
      });

      this.safetyMonitor.on('emergency-response-failed', (data) => {
        console.error('❌ Safety monitor emergency response failed:', data);
        this.emitBotEvent('safety_emergency_failed', data);
      });
    } catch (error) {
      console.error('Failed to initialize safety monitor:', error);
    }
  }

  /**
   * Get safety monitor status with serializable threat assessment.
   * Returns a JSON-safe object (no Vec3, no BigInt, no class instances).
   *
   * Async because it calls assessThreats() on the ThreatPerceptionManager.
   * Previously sync and spread the raw getStatus() result, which included
   * the full ThreatPerceptionManager (containing RaycastEngine with BigInt
   * fields), causing "Do not know how to serialize a BigInt" on res.json().
   */
  async getSafetyStatus(): Promise<any> {
    if (!this.safetyMonitor) {
      return { enabled: false, overallThreatLevel: 'low', threats: [] };
    }

    const status = this.safetyMonitor.getStatus();
    const assessment = await this.safetyMonitor
      .getThreatManager()
      .assessThreats();

    return {
      enabled: true,
      isMonitoring: status.isMonitoring,
      lastHealth: status.lastHealth,
      overallThreatLevel: assessment.overallThreatLevel,
      threats: assessment.threats.map((t) => ({
        type: t.type,
        distance: t.distance,
        threatLevel: t.threatLevel,
        hasLineOfSight: t.hasLineOfSight,
      })),
      recommendedAction: assessment.recommendedAction,
    };
  }

  /**
   * Record a response time, keeping the buffer capped
   */
  private recordResponseTime(time: number): void {
    this.performanceMetrics.responseTimes.push(time);
    if (
      this.performanceMetrics.responseTimes.length >
      BotAdapter.MAX_RESPONSE_TIMES
    ) {
      this.performanceMetrics.responseTimes =
        this.performanceMetrics.responseTimes.slice(
          -BotAdapter.MAX_RESPONSE_TIMES
        );
    }
  }

  /**
   * Track an interval so it can be cleared on disconnect
   */
  private trackInterval(interval: NodeJS.Timeout): NodeJS.Timeout {
    this.activeIntervals.push(interval);
    return interval;
  }

  /**
   * Setup bot event handlers for monitoring
   */
  private setupBotEventHandlers(): void {
    if (!this.bot) return;

    // Prevent duplicate listener attachment on reconnect
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    // Health monitoring
    this.bot.on('health', () => {
      this.emitBotEvent('health_changed', {
        health: this.bot?.health,
        food: this.bot?.food,
        saturation: this.bot?.foodSaturation,
      });

      // Log critical health but don't disconnect
      if (this.bot?.health != null && this.bot.health <= 2) {
        this.emitBotEvent('warning', {
          message: 'Critical health detected',
          health: this.bot?.health,
        });
      }
    });

    // Inventory monitoring
    let lastInventoryHash = '';

    // Monitor inventory changes using multiple events
    (this.bot as any).on('windowUpdate', () => {
      const currentHash = this.getInventoryHash();
      if (currentHash !== lastInventoryHash) {
        lastInventoryHash = currentHash;
        this.emitBotEvent('inventory_changed', {
          items: this.bot?.inventory?.items().map((item) => ({
            name: item.name,
            count: item.count,
            slot: item.slot,
          })),
        });
      }
    });

    // Also monitor for item pickup and other inventory events
    this.bot.on('playerCollect', () => {
      const currentHash = this.getInventoryHash();
      if (currentHash !== lastInventoryHash) {
        lastInventoryHash = currentHash;
        this.emitBotEvent('inventory_changed', {
          items: this.bot?.inventory?.items().map((item) => ({
            name: item.name,
            count: item.count,
            slot: item.slot,
          })),
        });
      }
    });

    // Monitor for crafting and other inventory operations
    (this.bot as any).on('craft', () => {
      const currentHash = this.getInventoryHash();
      if (currentHash !== lastInventoryHash) {
        lastInventoryHash = currentHash;
        this.emitBotEvent('inventory_changed', {
          items: this.bot?.inventory?.items().map((item) => ({
            name: item.name,
            count: item.count,
            slot: item.slot,
          })),
        });
      }
    });

    // Position monitoring will be set up after bot spawns
    this.bot.once('spawn', () => {
      // NOTE: Safety monitor initialization moved to PlanExecutor.initialize()
      // to share the same ActionTranslator and avoid duplicate NavigationBridge instances

      // Set up position monitoring after spawn
      let lastPosition: any = null;
      let positionCheckInterval: NodeJS.Timeout | null = null;
      let inventoryCheckInterval: NodeJS.Timeout | null = null;

      if (this.bot?.entity && this.bot?.entity?.position) {
        lastPosition = this.bot.entity.position.clone();
        positionCheckInterval = this.trackInterval(
          setInterval(() => {
            if (!this.bot || this.connectionState !== 'spawned') {
              return;
            }

            const currentPosition = this.bot.entity.position;
            if (currentPosition.distanceTo(lastPosition) > 0.5) {
              lastPosition = currentPosition.clone();
              this.emitBotEvent('position_changed', {
                position: currentPosition.clone(),
                dimension: this.bot.game.dimension,
              });
            }
          }, 1000)
        ); // Check every second

        // Set up periodic inventory check
        inventoryCheckInterval = this.trackInterval(
          setInterval(() => {
            if (!this.bot || this.connectionState !== 'spawned') {
              return;
            }

            const currentHash = this.getInventoryHash();
            if (currentHash !== lastInventoryHash) {
              lastInventoryHash = currentHash;
              this.emitBotEvent('inventory_changed', {
                items: this.bot.inventory.items().map((item) => ({
                  name: item.name,
                  count: item.count,
                  slot: item.slot,
                })),
              });
            }
          }, 2000)
        ); // Check every 2 seconds
      }
    });

    // Block breaking
    this.bot.on('diggingCompleted', (block) => {
      this.emitBotEvent('block_broken', {
        blockType: block.name,
        position: block.position.clone(),
        hardness: block.hardness,
      });
    });

    // Item pickup
    this.bot.on('playerCollect', (collector, collected) => {
      if (this.bot && this.bot.entity && collector === this.bot.entity) {
        this.emitBotEvent('item_picked_up', {
          item: collected.metadata?.[8],
          position: collected.position.clone(),
        });
      }
    });

    // Chat monitoring with cognition integration
    this.bot.on('chat', async (username, message) => {
      const isOwnMessage = username === this.config.username;

      // Emit the chat event for other systems
      this.emitBotEvent('chat_message', {
        username,
        message,
        isOwnMessage,
      });

      // Process incoming chat messages through cognition system (but not our own messages)
      if (!isOwnMessage && username !== 'unknown') {
        try {
          void this.processIncomingChat(username, message);
        } catch (error) {
          console.error('❌ Failed to process incoming chat:', error);
        }
      }
    });

    this.bot.on('message', (message) => {
      if (!this.bot) return;
      const text = String((message as any)?.toString?.() ?? message);
      if (this.isDeathMessage(text, this.bot.username)) {
        this.lastDeathMessage = text;
        this.lastDeathMessageAt = Date.now();
      }
    });

    // Entity belief system (replaces per-entity /process POSTs)
    // Gate behind system readiness to avoid work before all services are up
    if (process.env.LEGACY_ENTITY_PROCESS === '1') {
      this.setupEntityDetection();
    } else {
      this.tryStartBeliefBus();
    }

    // Environmental event detection
    this.setupEnvironmentalEventDetection();

    // Error handling
    this.bot.on('error', (error) => {
      this.emitBotEvent('error', {
        error: error.message,
        stack: error.stack,
      });
    });

    // Death handling
    this.bot.on('death', () => {
      const deathData: any = {
        error: 'Bot died',
        health: 0,
      };

      // Only include position if entity exists
      if (this.bot?.entity && this.bot?.entity?.position) {
        deathData.position = this.bot.entity.position.clone();
      }
      if (
        this.lastDeathMessage &&
        Date.now() - this.lastDeathMessageAt < 30000
      ) {
        deathData.deathMessage = this.lastDeathMessage;
      }

      this.emitBotEvent('error', deathData);

      // Don't immediately attempt reconnection on death
      // Let the server handle respawn naturally
      // Only log bot death in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log('Bot died, waiting for respawn...');
      }
    });

    // Respawn handling
    this.bot.on('respawn', () => {
      // Only log bot respawn in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log('Bot respawned successfully');
      }
      this.emitBotEvent('respawned', {
        health: this.bot?.health || 20,
        food: this.bot?.food || 20,
        position: this.bot?.entity?.position?.clone(),
        // Snapshot game tick at respawn for replay-stable dedupe keys.
        // Captured once here so downstream handlers get a consistent value
        // even if handler execution is delayed.
        gameTick: this.bot?.time?.time ?? 0,
      });
    });

    // Kicked handling
    this.bot.on('kicked', (reason) => {
      this.emitBotEvent('error', {
        error: `Kicked from server: ${reason}`,
        reason,
      });
    });
  }

  /**
   * Attempt to reconnect to server
   */
  private async attemptReconnect(): Promise<void> {
    if (
      this.isShuttingDown ||
      this.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff, max 30s

    this.emitBotEvent('error', {
      error: `Reconnection attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${delay}ms`,
    });

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        // Error will be handled by connect() method
      }
    }, delay);
  }

  /**
   * Emit bot event with timestamp
   */
  private emitBotEvent(type: BotEventType, data: any): void {
    const event: BotEvent = {
      type,
      timestamp: Date.now(),
      data,
    };

    this.emit('botEvent', event);
    this.emit(type, data);
  }

  /**
   * Get inventory hash for change detection
   */
  private getInventoryHash(): string {
    if (!this.bot) return '';

    const items = this.bot.inventory
      .items()
      .map((item) => `${item.name}:${item.count}:${item.slot}`)
      .sort()
      .join('|');

    return items;
  }

  /**
   * Get bot status for monitoring
   */
  getStatus(): any {
    if (!this.bot) {
      return {
        connected: false,
        connectionState: this.connectionState,
        reconnectAttempts: this.reconnectAttempts,
      };
    }

    // Check if bot is fully initialized
    if (!this.bot.game) {
      return {
        connected: true,
        connectionState: this.connectionState,
        reconnectAttempts: this.reconnectAttempts,
        username: this.bot.username,
        health: this.bot.health,
        food: this.bot.food,
        gameMode: 'initializing',
        dimension: 'initializing',
        server: {
          host: this.config.host,
          port: this.config.port,
          version: this.bot.version,
          difficulty: 'unknown',
        },
      };
    }

    const status: any = {
      connected: true,
      connectionState: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      username: this.bot.username || 'unknown',
      health: this.bot.health || 0,
      food: this.bot.food || 0,
      gameMode: this.bot.game?.gameMode || 'unknown',
      dimension: this.bot.game?.dimension || 'unknown',
      server: {
        host: this.config.host,
        port: this.config.port,
        version: this.bot.version || 'unknown',
        difficulty: this.bot.game?.difficulty || 'unknown',
      },
    };

    // Only include position if bot is spawned
    if (this.bot?.entity && this.bot?.entity?.position) {
      status.position = this.bot.entity.position.clone();
    }

    return status;
  }

  /**
   * Emergency stop - immediate disconnection
   */
  emergencyStop(): void {
    this.isShuttingDown = true;

    if (this.bot) {
      // Force disconnect without waiting
      this.bot.end();
      this.bot = null;
    }

    this.connectionState = 'disconnected';
    this.emitBotEvent('disconnected', { reason: 'Emergency stop' });
  }

  /**
   * Update bot configuration
   */
  updateConfig(newConfig: Partial<BotConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  private isDeathMessage(text: string, username: string): boolean {
    if (!text || !username) return false;
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      'was slain by',
      'was shot by',
      'was burned to death',
      'went up in flames',
      'tried to swim in lava',
      'hit the ground too hard',
      'fell',
      'drowned',
      'blew up',
      'was blown up',
      'starved',
      'suffocated',
      'was killed by',
      'was pricked to death',
      'was squashed',
      'was withered',
      'fell out of the world',
      'experienced kinetic energy',
      'died',
    ];
    const pattern = new RegExp(
      `\\b${escaped}\\b.*(${patterns.join('|')})`,
      'i'
    );
    return pattern.test(text);
  }

  /**
   * Get current configuration
   */
  getConfig(): BotConfig {
    return { ...this.config };
  }

  /**
   * Sanitize outbound chat text: strip wrapping quotes, collapse whitespace, cap at 256 chars.
   */
  private sanitizeOutboundChat(text: string): string {
    let cleaned = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    // Strip wrapping quotes the LLM sometimes adds (up to 2 layers)
    for (let i = 0; i < 2; i++) {
      if (
        (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'"))
      ) {
        cleaned = cleaned.slice(1, -1).trim();
      } else if (cleaned.startsWith('"') || cleaned.startsWith("'")) {
        cleaned = cleaned.slice(1).trim();
      } else if (cleaned.endsWith('"') || cleaned.endsWith("'")) {
        cleaned = cleaned.slice(0, -1).trim();
      } else {
        break;
      }
    }
    if (cleaned.length > 256) {
      const lastSpace = cleaned.slice(0, 256).lastIndexOf(' ');
      cleaned =
        lastSpace > 180
          ? cleaned.slice(0, lastSpace) + '...'
          : cleaned.slice(0, 253) + '...';
    }
    return cleaned;
  }

  /**
   * Process incoming chat messages through cognition system
   */
  private async processIncomingChat(
    sender: string,
    message: string
  ): Promise<void> {
    if (!this.bot) return;

    try {
      console.log(`💬 Processing chat from ${sender}: "${message}"`);

      // Send to cognition system for processing
      const cognitionUrl =
        process.env.COGNITION_SERVICE_URL || 'http://localhost:3003';
      const response = await resilientFetch(`${cognitionUrl}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'social_interaction',
          content: `Chat from ${sender}: "${message}"`,
          metadata: {
            sender: sender,
            message: message,
            timestamp: Date.now(),
            environment: 'minecraft',
            botPosition: {
              x: this.bot?.entity?.position?.x,
              y: this.bot?.entity?.position?.y,
              z: this.bot?.entity?.position?.z,
            },
            // Cheap sync reads for opportunistic cache freshness in cognition
            botHealth: this.bot?.health,
            botFood: this.bot?.food,
          },
        }),
      });

      if (response?.ok) {
        const result = (await response.json()) as {
          shouldRespond?: boolean;
          response?: string;
          shouldCreateTask?: boolean;
          taskSuggestion?: string;
        };
        console.log(`🧠 Cognition system processed chat:`, result);

        // If cognition system suggests a response, send it (with social cooldown)
        if (result.shouldRespond && result.response) {
          const now = Date.now();
          if (now - this.lastSocialChatResponse >= this.socialChatCooldown) {
            const responseStart = Date.now();
            const sanitizedChat = this.sanitizeOutboundChat(result.response);
            await this.bot?.chat(sanitizedChat);
            if (process.env.TTS_SPEAK_CHAT !== 'false') {
              this.ttsClient.speak(sanitizedChat);
            }
            const responseTime = Date.now() - responseStart;
            this.recordResponseTime(responseTime);
            this.performanceMetrics.chatResponses++;
            console.log(
              `✅ Bot responded: "${result.response}" (${responseTime}ms)`
            );
            this.lastSocialChatResponse = now;
            this.lastChatResponse = now; // Also bump general cooldown to avoid double-talking
          } else {
            console.log(
              `💬 Social chat response throttled (cooldown: ${(this.socialChatCooldown - (now - this.lastSocialChatResponse)) / 1000}s)`
            );
          }
        }

        // If cognition system suggests task creation, create a task
        if (result.shouldCreateTask && result.taskSuggestion) {
          await this.createTaskFromSocialChat(
            sender,
            message,
            result.taskSuggestion
          );
          this.performanceMetrics.tasksCreated++;
        }
      } else if (response) {
        console.log(
          `⚠️ Cognition system chat processing failed: ${response.status}`
        );
      }
    } catch (error) {
      console.error(
        '❌ Failed to process chat through cognition system:',
        error
      );
    }
  }

  /**
   * Set up entity detection and reactive responses with throttling
   */
  private setupEntityDetection(): void {
    if (!this.bot) return;

    const scanInterval = 10000; // Scan every 10 seconds (reduced frequency)

    // Monitor entities and detect new/interesting ones
    this.trackInterval(
      setInterval(async () => {
        try {
          // Only scan if enough time has passed since last scan
          const now = Date.now();
          if (now - this.lastEntityScan < scanInterval) return;

          await this.detectAndRespondToEntities();
          this.lastEntityScan = now;
          this.performanceMetrics.entityScans++;
        } catch (error) {
          console.error('❌ Entity detection error:', error);
        }
      }, 2000)
    ); // Check every 2 seconds but only process every 10 seconds

    console.log('👁️ Entity detection system activated (throttled)');
  }

  /**
   * Try to start BeliefBus loops. Gates behind system readiness.
   * If not ready, marks as pending and will be started when onSystemReady() is called.
   */
  private tryStartBeliefBus(): void {
    if (this.beliefBusStarted) {
      console.log('[BeliefBus] Already started, skipping');
      return;
    }

    if (!isSystemReady()) {
      this.beliefBusPending = true;
      console.log('[BeliefBus] Waiting for system readiness before starting');
      return;
    }

    this.startBeliefBus();
  }

  /**
   * Actually start the BeliefBus loops (called when system is ready).
   */
  private startBeliefBus(): void {
    if (this.beliefBusStarted) return;
    if (!this.bot) {
      console.log('[BeliefBus] No bot available, cannot start');
      return;
    }

    this.beliefBusStarted = true;
    this.beliefBusPending = false;

    this.setupBeliefIngestion();
    this.setupCognitionEmission();

    console.log('[BeliefBus] Started (system ready)');
  }

  /**
   * Called by server.ts when system readiness is received.
   * Starts any pending BeliefBus loops.
   */
  public onSystemReady(): void {
    if (this.beliefBusPending && !this.beliefBusStarted) {
      console.log('[BeliefBus] System ready signal received, starting BeliefBus');
      this.startBeliefBus();
    }
  }

  /**
   * Set up belief ingestion loop (5Hz / 200ms).
   * Builds EvidenceBatch from bot.entities and feeds into BeliefBus.
   */
  private setupBeliefIngestion(): void {
    if (!this.bot) return;

    this.beliefBus.forceSnapshot(); // First snapshot on connect

    this.trackInterval(
      setInterval(() => {
        if (!this.bot?.entity) return;
        try {
          this.beliefTickId++;
          const batch = buildEvidenceBatch(this.bot as any, this.beliefTickId);
          this.beliefBus.ingest(batch);

          // Reflex assessment: read snapshot every tick, act immediately
          const snapshot = this.beliefBus.getCurrentSnapshot();
          const reflexAssessment = assessReflexThreats(snapshot);

          if (reflexAssessment.hasCriticalThreat) {
            this.reflexArbitrator.enterReflexMode(
              `critical_threat:${reflexAssessment.threats[0]?.classLabel}`,
              this.beliefTickId
            );
          }

          this.reflexArbitrator.tickUpdate(this.beliefTickId);
        } catch (error) {
          console.error('[BeliefBus] ingestion error:', error);
        }
      }, TICK_INTERVAL_MS)
    );

    console.log('[BeliefBus] Entity belief ingestion activated (5Hz)');
  }

  /**
   * Set up cognition emission loop (1Hz / 1000ms).
   * Flushes deltas, optionally includes snapshot, sends single POST.
   */
  private setupCognitionEmission(): void {
    if (!this.bot) return;

    this.trackInterval(
      setInterval(async () => {
        if (!this.bot?.entity) return;
        if (!this.beliefBus.hasContent()) return;

        try {
          const envelope = this.beliefBus.buildEnvelope(this.emitSeq++);

          const cognitionUrl =
            process.env.COGNITION_SERVICE_URL || 'http://localhost:3003';
          const response = await resilientFetch(`${cognitionUrl}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(envelope),
            timeoutMs: 10000,
            label: 'cognition/process-belief-envelope',
          });

          if (response?.ok) {
            const result = (await response.json()) as {
              shouldRespond?: boolean;
              response?: string;
              shouldCreateTask?: boolean;
              taskSuggestion?: string;
            };

            if (result.shouldRespond && result.response) {
              const now = Date.now();
              if (now - this.lastChatResponse >= this.chatCooldown) {
                const sanitizedBeliefChat = this.sanitizeOutboundChat(
                  result.response
                );
                await this.bot?.chat(sanitizedBeliefChat);
                if (process.env.TTS_SPEAK_CHAT !== 'false') {
                  this.ttsClient.speak(sanitizedBeliefChat);
                }
                this.lastChatResponse = now;
                this.performanceMetrics.chatResponses++;
              }
            }
          }
        } catch (error) {
          console.error('[BeliefBus] emission error:', error);
        }
      }, EMIT_INTERVAL_MS)
    );

    console.log('[BeliefBus] Cognition emission activated (1Hz)');
  }

  private lastEntityScan = 0;
  private isScanning = false; // INTERMEDIATE FIX: Prevent overlapping scans
  private lastEntityProcessCall = 0; // INTERMEDIATE FIX: Throttle entity /process calls
  private lastEnvironmentalProcessCall = 0; // INTERMEDIATE FIX: Throttle environmental /process calls
  private readonly ENTITY_PROCESS_THROTTLE_MS = 30000; // 30 seconds between entity /process calls
  private readonly ENVIRONMENTAL_PROCESS_THROTTLE_MS = 15000; // 15 seconds between environmental /process calls
  // TODO(rig-I-primitive-21): Remove /process throttling when observation batching is implemented

  /**
   * Detect nearby entities and trigger appropriate responses
   */
  private async detectAndRespondToEntities(): Promise<void> {
    if (!this.bot || !this.bot.entity) return;

    // INTERMEDIATE FIX: Prevent race condition where multiple scans overlap
    // TODO(rig-I-primitive-21): Replace with proper entity observation batching
    if (this.isScanning) {
      return; // Skip if already scanning
    }

    this.isScanning = true;
    try {
      await this._detectAndRespondToEntitiesImpl();
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Internal implementation of entity detection
   */
  private async _detectAndRespondToEntitiesImpl(): Promise<void> {
    if (!this.bot || !this.bot.entity) return;
    const bot = this.bot;

    try {
      // Get nearby entities
      const nearbyEntities = Object.values(bot.entities).filter((entity) => {
        const distance = entity.position.distanceTo(bot.entity.position);
        return (
          distance <= 15 && entity.name !== 'item' && entity !== bot.entity
        );
      });

      if (nearbyEntities.length === 0) return;

      console.log(`👀 Detected ${nearbyEntities.length} nearby entities`);

      // Process each entity for potential reactions
      for (const entity of nearbyEntities) {
        await this.processEntity(entity);
      }
    } catch (error) {
      console.error('❌ Error in entity detection:', error);
    }
  }

  /**
   * Process a single entity and decide if we should react
   */
  private async processEntity(entity: any): Promise<void> {
    if (!this.bot?.entity) return;

    try {
      // INTERMEDIATE FIX: Throttle /process calls to prevent LLM overload
      // TODO(rig-I-primitive-21): Replace with proper entity observation batching
      const now = Date.now();
      if (now - this.lastEntityProcessCall < this.ENTITY_PROCESS_THROTTLE_MS) {
        // Skip this entity - we're throttling /process calls
        return;
      }
      this.lastEntityProcessCall = now;

      const botPos = this.bot.entity.position;
      const distance = entity.position.distanceTo(botPos);

      // Create linguistic thought about the entity
      const entityDescription = this.describeEntity(entity);
      const thought = `I notice a ${entityDescription} ${distance.toFixed(1)} blocks away`;

      console.log(`🧠 Entity thought: "${thought}"`);

      // Send entity detection to cognition system
      const cognitionUrl =
        process.env.COGNITION_SERVICE_URL || 'http://localhost:3003';
      const response = await resilientFetch(`${cognitionUrl}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'environmental_awareness',
          content: thought,
          metadata: {
            entityType: entity.name,
            entityId: entity.id,
            distance: distance,
            position: {
              x: entity.position.x,
              y: entity.position.y,
              z: entity.position.z,
            },
            botPosition: {
              x: botPos.x,
              y: botPos.y,
              z: botPos.z,
            },
            timestamp: Date.now(),
          },
        }),
        timeoutMs: 25000,
        label: 'cognition/process-environmental',
      });

      if (response?.ok) {
        const result = (await response.json()) as {
          shouldRespond?: boolean;
          response?: string;
          shouldCreateTask?: boolean;
          taskSuggestion?: string;
        };
        console.warn(
          `[DEBUG] ✅ Entity processed by cognition system:`,
          result
        );

        // If cognition suggests a response, execute it (with throttling)
        if (result.shouldRespond && result.response) {
          const now = Date.now();
          if (now - this.lastChatResponse >= this.chatCooldown) {
            const responseStart = Date.now();
            const sanitizedEntityChat = this.sanitizeOutboundChat(
              result.response
            );
            await this.bot?.chat(sanitizedEntityChat);
            if (process.env.TTS_SPEAK_CHAT !== 'false') {
              this.ttsClient.speak(sanitizedEntityChat);
            }
            const responseTime = Date.now() - responseStart;
            this.recordResponseTime(responseTime);
            this.performanceMetrics.chatResponses++;
            console.warn(
              `💬 Bot responded to entity: "${result.response}" (${responseTime}ms)`
            );
            this.lastChatResponse = now;
          } else {
            console.warn(
              `💬 Entity response throttled (cooldown: ${(this.chatCooldown - (now - this.lastChatResponse)) / 1000}s)`
            );
          }
        }

        // If it's a task-worthy event, add to planner
        if (result.shouldCreateTask && result.taskSuggestion) {
          await this.createTaskFromEntity(entity, result.taskSuggestion);
          this.performanceMetrics.tasksCreated++;
        }
      }
    } catch (error) {
      console.error('❌ Error processing entity:', error);
    }
  }

  /**
   * Create a descriptive string for an entity
   */
  private describeEntity(entity: any): string {
    const name = entity.name || 'unknown entity';

    // Categorize entity types
    if (name.includes('player') || name === 'player') {
      return 'player';
    } else if (
      name.includes('zombie') ||
      name.includes('skeleton') ||
      name.includes('creeper')
    ) {
      return `hostile mob (${name})`;
    } else if (
      name.includes('cow') ||
      name.includes('sheep') ||
      name.includes('pig')
    ) {
      return `animal (${name})`;
    } else if (name.includes('villager')) {
      return 'villager';
    } else {
      return name;
    }
  }

  /**
   * Create a task from an interesting entity event
   */
  private async createTaskFromEntity(
    entity: any,
    taskSuggestion: string
  ): Promise<void> {
    try {
      const planningUrl =
        process.env.PLANNING_SERVICE_URL || 'http://localhost:3002';

      const response = await resilientFetch(`${planningUrl}/goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Respond to ${entity.name} encounter`,
          description: taskSuggestion,
          priority: 0.7,
          urgency: 0.5,
          tasks: [
            {
              type: 'autonomous',
              description: taskSuggestion,
              priority: 0.7,
              urgency: 0.5,
              parameters: {
                entityId: entity.id,
                entityType: entity.name,
                entityPosition: {
                  x: entity.position.x,
                  y: entity.position.y,
                  z: entity.position.z,
                },
              },
            },
          ],
        }),
      });

      if (response?.ok) {
        const result = await response.json();
        console.warn(`[DEBUG] ✅ Created task from entity encounter:`, result);
      } else if (response) {
        console.warn(`[DEBUG] ⚠️ Failed to create task: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error creating task from entity:', error);
    }
  }

  /**
   * Create a task from a social chat interaction
   */
  private async createTaskFromSocialChat(
    sender: string,
    message: string,
    taskSuggestion: string
  ): Promise<void> {
    try {
      const planningUrl =
        process.env.PLANNING_SERVICE_URL || 'http://localhost:3002';

      const response = await resilientFetch(`${planningUrl}/goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Respond to ${sender}: "${message.slice(0, 50)}"`,
          description: taskSuggestion,
          priority: 0.8,
          urgency: 0.6,
          tasks: [
            {
              type: 'autonomous',
              description: taskSuggestion,
              priority: 0.8,
              urgency: 0.6,
              parameters: {
                sender,
                message,
                source: 'social-chat',
              },
            },
          ],
        }),
      });

      if (response?.ok) {
        const result = await response.json();
        console.log(`✅ Created task from social chat:`, result);
      } else if (response) {
        console.log(
          `⚠️ Failed to create task from social chat: ${response.status}`
        );
      }
    } catch (error) {
      console.error('❌ Error creating task from social chat:', error);
    }
  }

  /**
   * Set up environmental event detection (block changes, item pickups, etc.)
   */
  private setupEnvironmentalEventDetection(): void {
    if (!this.bot) return;

    // Monitor block break events - using generic event handler since mineflayer events vary
    this.bot.on('blockUpdate' as any, async (oldBlock: any, newBlock: any) => {
      if (oldBlock?.type !== newBlock?.type) {
        try {
          // Check if the event is within the observation radius
          if (
            newBlock?.position &&
            this.isWithinObservationRadius(newBlock.position)
          ) {
            void this.processEnvironmentalEvent('block_break', {
              oldBlock: oldBlock?.name || 'unknown',
              newBlock: newBlock?.name || 'unknown',
              position: newBlock?.position || { x: 0, y: 0, z: 0 },
            });
          }
        } catch (error) {
          console.error('❌ Error processing block break event:', error);
        }
      }
    });

    // Monitor item pickup events - using generic event handler
    this.bot.on(
      'playerCollect' as any,
      async (collector: any, collected: any) => {
        if (this.bot && collector === this.bot.entity) {
          try {
            // Check if the event is within the observation radius
            if (
              collected?.position &&
              this.isWithinObservationRadius(collected.position)
            ) {
              void this.processEnvironmentalEvent('item_pickup', {
                item: collected.name || 'unknown',
                count: collected.count || 1,
                position: collected.position || { x: 0, y: 0, z: 0 },
              });
            }
          } catch (error) {
            console.error('❌ Error processing item pickup event:', error);
          }
        }
      }
    );

    // Monitor health changes using the existing health tracking (less frequently)
    let lastHealth = this.bot.health;
    this.trackInterval(
      setInterval(async () => {
        try {
          if (!this.bot) return;
          const currentHealth = this.bot.health;
          const maxHealth = 20; // Default max health in Minecraft

          // Only process significant health changes
          if (Math.abs(currentHealth - lastHealth) >= 2) {
            if (currentHealth < lastHealth) {
              void this.processEnvironmentalEvent('health_loss', {
                previousHealth: lastHealth,
                currentHealth: currentHealth,
                maxHealth: maxHealth,
                damage: lastHealth - currentHealth,
              });
            } else if (currentHealth > lastHealth) {
              void this.processEnvironmentalEvent('health_gain', {
                previousHealth: lastHealth,
                currentHealth: currentHealth,
                maxHealth: maxHealth,
                healing: currentHealth - lastHealth,
              });
            }
            lastHealth = currentHealth;
          }
        } catch (error) {
          console.error('❌ Error processing health event:', error);
        }
      }, 5000)
    ); // Check every 5 seconds, only for significant changes

    console.log('🌍 Environmental event detection activated');
  }

  /**
   * Process environmental events and trigger cognitive responses
   */
  private async processEnvironmentalEvent(
    eventType: string,
    eventData: any
  ): Promise<void> {
    if (!this.bot) return;

    try {
      // INTERMEDIATE FIX: Throttle environmental /process calls to prevent LLM overload
      // TODO(rig-I-primitive-21): Replace with proper observation batching
      const now = Date.now();
      if (
        now - this.lastEnvironmentalProcessCall <
        this.ENVIRONMENTAL_PROCESS_THROTTLE_MS
      ) {
        // Skip this event - we're throttling /process calls
        return;
      }
      this.lastEnvironmentalProcessCall = now;

      // Create a linguistic description of the event
      const eventDescription = this.describeEnvironmentalEvent(
        eventType,
        eventData
      );
      const thought = `Environmental event: ${eventDescription}`;

      console.log(`🌍 ${eventType.toUpperCase()}: ${eventDescription}`);

      // Send to cognition system
      const cognitionUrl =
        process.env.COGNITION_SERVICE_URL || 'http://localhost:3003';
      const response = await resilientFetch(`${cognitionUrl}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'environmental_event',
          content: thought,
          metadata: {
            eventType: eventType,
            eventData: eventData,
            timestamp: Date.now(),
            botPosition: {
              x: this.bot?.entity?.position?.x,
              y: this.bot?.entity?.position?.y,
              z: this.bot?.entity?.position?.z,
            },
            ...eventData,
          },
        }),
        timeoutMs: 25000,
        label: 'cognition/process-environmental-event',
      });

      if (response?.ok) {
        const result = (await response.json()) as {
          shouldRespond?: boolean;
          response?: string;
          shouldCreateTask?: boolean;
          taskSuggestion?: string;
        };
        console.log(`✅ Environmental event processed:`, result);

        // If cognition suggests a response, execute it (with throttling)
        if (result.shouldRespond && result.response) {
          const now = Date.now();
          if (
            now - this.lastEnvironmentalResponse >=
            this.environmentalCooldown
          ) {
            const responseStart = Date.now();
            const sanitizedEnvChat = this.sanitizeOutboundChat(result.response);
            await this.bot?.chat(sanitizedEnvChat);
            if (process.env.TTS_SPEAK_CHAT !== 'false') {
              this.ttsClient.speak(sanitizedEnvChat);
            }
            const responseTime = Date.now() - responseStart;
            this.recordResponseTime(responseTime);
            this.performanceMetrics.chatResponses++;
            console.log(
              `💬 Bot responded to environmental event: "${result.response}" (${responseTime}ms)`
            );
            this.lastEnvironmentalResponse = now;
          } else {
            console.log(
              `💬 Environmental response throttled (cooldown: ${(this.environmentalCooldown - (now - this.lastEnvironmentalResponse)) / 1000}s)`
            );
          }
        }

        // If it's a task-worthy event, add to planner
        if (result.shouldCreateTask && result.taskSuggestion) {
          await this.createTaskFromEnvironmentalEvent(
            eventType,
            eventData,
            result.taskSuggestion
          );
          this.performanceMetrics.tasksCreated++;
        }
        this.performanceMetrics.environmentalEvents++;
      }
    } catch (error) {
      console.error('❌ Error processing environmental event:', error);
    }
  }

  /**
   * Create a descriptive string for an environmental event
   */
  private describeEnvironmentalEvent(
    eventType: string,
    eventData: any
  ): string {
    switch (eventType) {
      case 'block_break':
        return `Block broke: ${eventData.oldBlock} → ${eventData.newBlock} at (${eventData.position.x}, ${eventData.position.y}, ${eventData.position.z})`;

      case 'item_pickup':
        return `Picked up ${eventData.count} × ${eventData.item} at (${eventData.position.x}, ${eventData.position.y}, ${eventData.position.z})`;

      case 'health_loss':
        return `Took ${eventData.damage} damage, health now ${eventData.currentHealth}/${eventData.maxHealth}`;

      case 'health_gain':
        return `Gained ${eventData.healing} health, now ${eventData.currentHealth}/${eventData.maxHealth}`;

      default:
        return `${eventType}: ${JSON.stringify(eventData)}`;
    }
  }

  /**
   * Create a task from an environmental event
   */
  private async createTaskFromEnvironmentalEvent(
    eventType: string,
    eventData: any,
    taskSuggestion: string
  ): Promise<void> {
    try {
      const planningUrl =
        process.env.PLANNING_SERVICE_URL || 'http://localhost:3002';

      const response = await resilientFetch(`${planningUrl}/goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Respond to ${eventType} event`,
          description: taskSuggestion,
          priority: 0.6,
          urgency: 0.4,
          tasks: [
            {
              type: 'autonomous',
              description: taskSuggestion,
              priority: 0.6,
              urgency: 0.4,
              parameters: {
                eventType: eventType,
                eventData: eventData,
                position: eventData.position,
              },
            },
          ],
        }),
      });

      if (response?.ok) {
        const result = await response.json();
        console.warn(
          `[DEBUG] ✅ Created task from environmental event:`,
          result
        );
      } else if (response) {
        console.warn(`[DEBUG] ⚠️ Failed to create task: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error creating task from environmental event:', error);
    }
  }

  /**
   * Get performance metrics for the reactive consciousness system
   */
  getPerformanceMetrics() {
    const uptime = Date.now() - this.performanceMetrics.startTime;
    const avgResponseTime =
      this.performanceMetrics.responseTimes.length > 0
        ? this.performanceMetrics.responseTimes.reduce((a, b) => a + b, 0) /
          this.performanceMetrics.responseTimes.length
        : 0;

    return {
      uptime: Math.round(uptime / 1000), // seconds
      entityScans: this.performanceMetrics.entityScans,
      chatResponses: this.performanceMetrics.chatResponses,
      environmentalEvents: this.performanceMetrics.environmentalEvents,
      tasksCreated: this.performanceMetrics.tasksCreated,
      averageResponseTime: Math.round(avgResponseTime),
      scansPerMinute: Math.round(
        (this.performanceMetrics.entityScans / uptime) * 60000
      ),
      responsesPerMinute: Math.round(
        (this.performanceMetrics.chatResponses / uptime) * 60000
      ),
      eventsPerMinute: Math.round(
        (this.performanceMetrics.environmentalEvents / uptime) * 60000
      ),
      tasksPerMinute: Math.round(
        (this.performanceMetrics.tasksCreated / uptime) * 60000
      ),
      throttling: {
        chatCooldown: this.chatCooldown / 1000,
        environmentalCooldown: this.environmentalCooldown / 1000,
      },
    };
  }

  /**
   * Log performance metrics to console
   */
  logPerformanceMetrics() {
    const metrics = this.getPerformanceMetrics();
    console.warn(`
[DEBUG] 🤖 Reactive Consciousness Performance Report:
══════════════════════════════════════════════════════
⏱️  Uptime: ${metrics.uptime}s
👁️  Entity Scans: ${metrics.entityScans} (${metrics.scansPerMinute}/min)
💬  Chat Responses: ${metrics.chatResponses} (${metrics.responsesPerMinute}/min)
🌍  Environmental Events: ${metrics.environmentalEvents} (${metrics.eventsPerMinute}/min)
📋  Tasks Created: ${metrics.tasksCreated} (${metrics.tasksPerMinute}/min)
⚡  Avg Response Time: ${metrics.averageResponseTime}ms

🚦 Throttling:
   • Chat Cooldown: ${metrics.throttling.chatCooldown}s
   • Environmental Cooldown: ${metrics.throttling.environmentalCooldown}s

[DEBUG] ══════════════════════════════════════════════════════
    `);
  }

  /**
   * Check if a position is within the bot's observation radius
   */
  private isWithinObservationRadius(position: {
    x: number;
    y: number;
    z: number;
  }): boolean {
    if (!this.bot?.entity?.position) {
      return false;
    }

    const botPos = new Vec3(
      this.bot.entity.position.x,
      this.bot.entity.position.y,
      this.bot.entity.position.z
    );
    const eventPos = new Vec3(position.x, position.y, position.z);
    const distance = botPos.distanceTo(eventPos);

    return distance <= this.config.observationRadius;
  }
}
