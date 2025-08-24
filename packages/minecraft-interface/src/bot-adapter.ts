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
          gameMode: this.bot!.game.gameMode,
          dimension: this.bot!.game.dimension,
        };

        // Only include position if entity exists
        if (this.bot && this.bot.entity && this.bot.entity.position) {
          spawnData.position = this.bot.entity.position.clone();
        }

        this.emitBotEvent('spawned', spawnData);
        resolve(this.bot!);
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
   * Setup bot event handlers for monitoring
   */
  private setupBotEventHandlers(): void {
    if (!this.bot) return;

    // Health monitoring
    this.bot.on('health', () => {
      this.emitBotEvent('health_changed', {
        health: this.bot!.health,
        food: this.bot!.food,
        saturation: this.bot!.foodSaturation,
      });

      // Log critical health but don't disconnect
      if (this.bot!.health <= 2) {
        this.emitBotEvent('warning', {
          message: 'Critical health detected',
          health: this.bot!.health,
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
          items: this.bot!.inventory.items().map((item) => ({
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
          items: this.bot!.inventory.items().map((item) => ({
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
          items: this.bot!.inventory.items().map((item) => ({
            name: item.name,
            count: item.count,
            slot: item.slot,
          })),
        });
      }
    });

    // Position monitoring will be set up after bot spawns
    this.bot.once('spawn', () => {
      // Set up position monitoring after spawn
      let lastPosition: any = null;
      let positionCheckInterval: NodeJS.Timeout | null = null;
      let inventoryCheckInterval: NodeJS.Timeout | null = null;

      if (this.bot && this.bot.entity && this.bot.entity.position) {
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

    // Chat monitoring
    this.bot.on('chat', (username, message) => {
      this.emitBotEvent('chat_message', {
        username,
        message,
        isOwnMessage: username === this.config.username,
      });
    });

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
      if (this.bot && this.bot.entity && this.bot.entity.position) {
        deathData.position = this.bot.entity.position.clone();
      }

      this.emitBotEvent('error', deathData);
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

    const status: any = {
      connected: true,
      connectionState: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      username: this.bot.username,
      health: this.bot.health,
      food: this.bot.food,
      gameMode: this.bot.game.gameMode,
      dimension: this.bot.game.dimension,
      server: {
        host: this.config.host,
        port: this.config.port,
        version: this.bot.version,
        difficulty: this.bot.game.difficulty,
      },
    };

    // Only include position if bot is spawned
    if (this.bot.entity && this.bot.entity.position) {
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
}
