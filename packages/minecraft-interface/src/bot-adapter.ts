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
import { BotConfig, BotEvent, BotEventType } from './types';
import { AutomaticSafetyMonitor } from './automatic-safety-monitor';
import { ActionTranslator } from './action-translator';
import mcData from 'minecraft-data';

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

  constructor(config: BotConfig) {
    super();
    this.config = config;

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
        resolve(this?.bot);
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
        this.emitBotEvent('disconnected', { reason });

        if (!this.isShuttingDown && this.config.autoReconnect) {
          this.attemptReconnect();
        }
      });
    });
  }

  /**
   * Disconnect from server
   */
  async disconnect(): Promise<void> {
    this.isShuttingDown = true;

    if (this.bot) {
      this.bot.quit('Disconnecting');
      this.bot = null;
    }

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
   * Initialize safety monitor
   */
  private initializeSafetyMonitor(): void {
    if (!this.bot) return;

    try {
      // Create action translator for safety monitor
      const actionTranslator = new ActionTranslator(this.bot, {
        actionTimeout: 10000,
        pathfindingTimeout: 15000,
        maxRetries: 3,
      });

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
   * Get safety monitor status
   */
  getSafetyStatus(): any {
    if (!this.safetyMonitor) {
      return { enabled: false };
    }

    return {
      enabled: true,
      ...this.safetyMonitor.getStatus(),
    };
  }

  /**
   * Setup bot event handlers for monitoring
   */
  private setupBotEventHandlers(): void {
    if (!this.bot) return;

    // Health monitoring
    this.bot.on('health', () => {
      this.emitBotEvent('health_changed', {
        health: this.bot?.health,
        food: this.bot?.food,
        saturation: this.bot?.foodSaturation,
      });

      // Log critical health but don't disconnect
      if (this.bot?.health <= 2) {
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
      // Initialize safety monitor after spawn
      this.initializeSafetyMonitor();

      // Set up position monitoring after spawn
      let lastPosition: any = null;
      let positionCheckInterval: NodeJS.Timeout | null = null;
      let inventoryCheckInterval: NodeJS.Timeout | null = null;

      if (this.bot?.entity && this.bot?.entity?.position) {
        lastPosition = this.bot.entity.position.clone();
        positionCheckInterval = setInterval(() => {
          if (!this.bot || this.connectionState !== 'spawned') {
            if (positionCheckInterval) {
              clearInterval(positionCheckInterval);
              positionCheckInterval = null;
            }
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
        }, 1000); // Check every second

        // Set up periodic inventory check
        inventoryCheckInterval = setInterval(() => {
          if (!this.bot || this.connectionState !== 'spawned') {
            if (inventoryCheckInterval) {
              clearInterval(inventoryCheckInterval);
              inventoryCheckInterval = null;
            }
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
        }, 2000); // Check every 2 seconds
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
          await this.processIncomingChat(username, message);
        } catch (error) {
          console.error('❌ Failed to process incoming chat:', error);
        }
      }
    });

    // Entity detection and response
    this.setupEntityDetection();

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

  /**
   * Get current configuration
   */
  getConfig(): BotConfig {
    return { ...this.config };
  }

  /**
   * Initialize the bot with safety monitoring
   */
  private async initializeBot(): Promise<void> {
    if (!this.bot) return;

    // Initialize safety monitor
    if (this.actionTranslator) {
      const actionTranslator =
        new (require('./action-translator').ActionTranslator)(this.bot, {
          actionTimeout: 10000,
          maxRetries: 3,
        });

      this.safetyMonitor = new AutomaticSafetyMonitor(
        this.bot,
        this.actionTranslator,
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
    }
  }

  /**
   * Process incoming chat messages through cognition system
   */
  private async processIncomingChat(
    sender: string,
    message: string
  ): Promise<void> {
    try {
      console.log(`💬 Processing chat from ${sender}: "${message}"`);

      // Send to cognition system for processing
      const cognitionUrl =
        process.env.COGNITION_SERVICE_URL || 'http://localhost:3003';
      const response = await fetch(`${cognitionUrl}/process`, {
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
              x: this.bot.entity.position.x,
              y: this.bot.entity.position.y,
              z: this.bot.entity.position.z,
            },
          },
        }),
      });

      if (response.ok) {
        const result = (await response.json()) as {
          shouldRespond?: boolean;
          response?: string;
          shouldCreateTask?: boolean;
          taskSuggestion?: string;
        };
        console.log(`🧠 Cognition system processed chat:`, result);

        // If cognition system suggests a response, send it
        if (result.shouldRespond && result.response) {
          await this.bot.chat(result.response);
          console.log(`✅ Bot responded: "${result.response}"`);
        }
      } else {
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
   * Set up entity detection and reactive responses
   */
  private setupEntityDetection(): void {
    if (!this.bot) return;

    let lastEntityScan = 0;
    const scanInterval = 5000; // Scan every 5 seconds

    // Monitor entities and detect new/interesting ones
    setInterval(async () => {
      try {
        await this.detectAndRespondToEntities();
      } catch (error) {
        console.error('❌ Entity detection error:', error);
      }
    }, scanInterval);

    console.log('👁️ Entity detection system activated');
  }

  /**
   * Detect nearby entities and trigger appropriate responses
   */
  private async detectAndRespondToEntities(): Promise<void> {
    if (!this.bot || !this.bot.entity) return;

    try {
      // Get nearby entities
      const nearbyEntities = Object.values(this.bot.entities).filter(
        (entity) => {
          const distance = entity.position.distanceTo(this.bot.entity.position);
          return (
            distance <= 15 &&
            entity.name !== 'item' &&
            entity !== this.bot.entity
          );
        }
      );

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
    try {
      const botPos = this.bot.entity.position;
      const distance = entity.position.distanceTo(botPos);

      // Create linguistic thought about the entity
      const entityDescription = this.describeEntity(entity);
      const thought = `I notice a ${entityDescription} ${distance.toFixed(1)} blocks away`;

      console.log(`🧠 Entity thought: "${thought}"`);

      // Send entity detection to cognition system
      const cognitionUrl =
        process.env.COGNITION_SERVICE_URL || 'http://localhost:3003';
      const response = await fetch(`${cognitionUrl}/process`, {
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
      });

      if (response.ok) {
        const result = (await response.json()) as {
          shouldRespond?: boolean;
          response?: string;
          shouldCreateTask?: boolean;
          taskSuggestion?: string;
        };
        console.log(`✅ Entity processed by cognition system:`, result);

        // If cognition suggests a response, execute it
        if (result.shouldRespond && result.response) {
          await this.bot.chat(result.response);
          console.log(`💬 Bot responded to entity: "${result.response}"`);
        }

        // If it's a task-worthy event, add to planner
        if (result.shouldCreateTask && result.taskSuggestion) {
          await this.createTaskFromEntity(entity, result.taskSuggestion);
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

      const response = await fetch(`${planningUrl}/goal`, {
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

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Created task from entity encounter:`, result);
      } else {
        console.log(`⚠️ Failed to create task: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error creating task from entity:', error);
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
          await this.processEnvironmentalEvent('block_break', {
            oldBlock: oldBlock?.name || 'unknown',
            newBlock: newBlock?.name || 'unknown',
            position: newBlock?.position || { x: 0, y: 0, z: 0 },
          });
        } catch (error) {
          console.error('❌ Error processing block break event:', error);
        }
      }
    });

    // Monitor item pickup events - using generic event handler
    this.bot.on('playerCollect' as any, async (collector: any, collected: any) => {
      if (collector === this.bot.entity) {
        try {
          await this.processEnvironmentalEvent('item_pickup', {
            item: collected.name || 'unknown',
            count: collected.count || 1,
            position: collected.position || { x: 0, y: 0, z: 0 },
          });
        } catch (error) {
          console.error('❌ Error processing item pickup event:', error);
        }
      }
    });

    // Monitor health changes using the existing health tracking
    let lastHealth = this.bot.health;
    setInterval(async () => {
      try {
        const currentHealth = this.bot.health;
        const maxHealth = 20; // Default max health in Minecraft

        if (currentHealth < lastHealth) {
          await this.processEnvironmentalEvent('health_loss', {
            previousHealth: lastHealth,
            currentHealth: currentHealth,
            maxHealth: maxHealth,
            damage: lastHealth - currentHealth,
          });
        } else if (currentHealth > lastHealth) {
          await this.processEnvironmentalEvent('health_gain', {
            previousHealth: lastHealth,
            currentHealth: currentHealth,
            maxHealth: maxHealth,
            healing: currentHealth - lastHealth,
          });
        }

        lastHealth = currentHealth;
      } catch (error) {
        console.error('❌ Error processing health event:', error);
      }
    }, 1000); // Check every second

    console.log('🌍 Environmental event detection activated');
  }

  /**
   * Process environmental events and trigger cognitive responses
   */
  private async processEnvironmentalEvent(
    eventType: string,
    eventData: any
  ): Promise<void> {
    try {
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
      const response = await fetch(`${cognitionUrl}/process`, {
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
              x: this.bot.entity.position.x,
              y: this.bot.entity.position.y,
              z: this.bot.entity.position.z,
            },
            ...eventData,
          },
        }),
      });

      if (response.ok) {
        const result = await response.json() as {
          shouldRespond?: boolean;
          response?: string;
          shouldCreateTask?: boolean;
          taskSuggestion?: string;
        };
        console.log(`✅ Environmental event processed:`, result);

        // If cognition suggests a response, execute it
        if (result.shouldRespond && result.response) {
          await this.bot.chat(result.response);
          console.log(
            `💬 Bot responded to environmental event: "${result.response}"`
          );
        }

        // If it's a task-worthy event, add to planner
        if (result.shouldCreateTask && result.taskSuggestion) {
          await this.createTaskFromEnvironmentalEvent(
            eventType,
            eventData,
            result.taskSuggestion
          );
        }
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

      const response = await fetch(`${planningUrl}/goal`, {
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

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Created task from environmental event:`, result);
      } else {
        console.log(`⚠️ Failed to create task: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error creating task from environmental event:', error);
    }
  }
}
