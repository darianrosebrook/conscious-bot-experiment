/**
 * Minecraft Cognitive Integration
 *
 * Connects the cognitive stream integration to the real Mineflayer bot
 * to enable actual physical actions in the Minecraft world.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { CognitiveStreamIntegration } from './cognitive-stream-integration.js';
import { Bot } from 'mineflayer';

// Import real leaf implementations from core
import {
  MoveToLeaf,
  StepForwardSafelyLeaf,
  DigBlockLeaf,
  PlaceBlockLeaf,
  PlaceTorchIfNeededLeaf,
  RetreatAndBlockLeaf,
  ConsumeFoodLeaf,
  SenseHostilesLeaf,
  GetLightLevelLeaf,
  CraftRecipeLeaf,
} from './leaves/index.js';

export interface MinecraftCognitiveConfig {
  bot: Bot;
  enableRealActions: boolean;
  actionTimeout: number;
  maxRetries: number;
}

/**
 * Integration that connects cognitive stream to real Mineflayer bot
 */
export class MinecraftCognitiveIntegration extends EventEmitter {
  private cognitiveStream: CognitiveStreamIntegration;
  private config: MinecraftCognitiveConfig;
  private isConnected = false;

  constructor(config: MinecraftCognitiveConfig) {
    super();
    this.config = config;
    this.cognitiveStream = new CognitiveStreamIntegration(config.bot);

    // Set up event forwarding
    this.setupEventForwarding();
  }

  /**
   * Initialize the integration with real bot connection
   */
  async initialize(): Promise<void> {
    console.log('🔗 Initializing Minecraft Cognitive Integration...');

    if (!this.config.bot) {
      throw new Error('Mineflayer bot is required for cognitive integration');
    }

    // Wait for bot to be ready
    if (!this.config.bot.entity) {
      console.log('⏳ Waiting for bot to spawn...');
      await new Promise<void>((resolve) => {
        const onSpawn = () => {
          this.config.bot.removeListener('spawn', onSpawn);
          resolve();
        };
        this.config.bot.on('spawn', onSpawn);
      });
    }

    // Initialize cognitive stream with real bot context
    // This already registers all required leaves, so we don't need to register them again
    await this.cognitiveStream.initialize();

    // Set up real bot state monitoring
    this.setupBotStateMonitoring();

    this.isConnected = true;
    console.log('✅ Minecraft Cognitive Integration initialized');
  }

  /**
   * Register real leaf implementations that connect to the actual bot
   * NOTE: This method is deprecated - leaves are now registered by CognitiveStreamIntegration
   */
  private async registerRealLeaves(): Promise<void> {
    console.log(
      '🔧 Skipping duplicate leaf registration - leaves already registered by CognitiveStreamIntegration'
    );
    // Leaves are already registered by CognitiveStreamIntegration.initialize()
    // No need to register them again to avoid "version_exists" errors
  }

  /**
   * Set up real-time bot state monitoring
   */
  private setupBotStateMonitoring(): void {
    if (!this.config.bot || !this.config.bot.entity) {
      console.warn('⚠️ Bot not ready for state monitoring');
      return;
    }

    // Monitor bot position changes
    this.config.bot.on('move', () => {
      this.updateBotStateFromRealBot();
    });

    // Monitor health changes
    this.config.bot.on('health', () => {
      this.updateBotStateFromRealBot();
    });

    // Monitor food changes
    this.config.bot.on('playerCollect', () => {
      this.updateBotStateFromRealBot();
    });

    // Monitor inventory changes
    this.config.bot.on('playerCollect', () => {
      this.updateBotStateFromRealBot();
    });

    // Initial state update
    this.updateBotStateFromRealBot();
  }

  /**
   * Update cognitive stream state from real bot
   */
  private updateBotStateFromRealBot(): void {
    if (!this.config.bot || !this.config.bot.entity) {
      return;
    }

    const botState = {
      position: {
        x: Math.round(this.config.bot.entity.position.x),
        y: Math.round(this.config.bot.entity.position.y),
        z: Math.round(this.config.bot.entity.position.z),
      },
      health: this.config.bot.health || 20,
      food: this.config.bot.food || 20,
      inventory: this.getInventoryState(),
      currentTask: this.determineCurrentTask(),
    };

    // Update cognitive stream with real bot state
    this.cognitiveStream.updateBotState(botState);
  }

  /**
   * Get inventory state from real bot
   */
  private getInventoryState(): Record<string, number> {
    if (!this.config.bot || !this.config.bot.inventory) {
      return {};
    }

    const inventory: Record<string, number> = {};

    // Count items by name
    for (const item of this.config.bot.inventory.items()) {
      const itemName = item.name;
      inventory[itemName] = (inventory[itemName] || 0) + item.count;
    }

    return inventory;
  }

  /**
   * Determine current task based on bot state
   */
  private determineCurrentTask(): string {
    if (!this.config.bot) {
      return 'unknown';
    }

    // Analyze bot state to determine current task
    const position = this.config.bot.entity?.position;
    const health = this.config.bot.health || 20;
    const food = this.config.bot.food || 20;

    if (health < 5) {
      return 'critical survival';
    } else if (health < 10) {
      return 'surviving';
    } else if (food < 5) {
      return 'finding food';
    } else if (position && position.y < 64) {
      return 'mining underground';
    } else {
      return 'exploring surface';
    }
  }

  /**
   * Set up event forwarding between cognitive stream and bot
   */
  private setupEventForwarding(): void {
    // Forward cognitive stream events
    this.cognitiveStream.on('goalIdentified', (event) => {
      this.emit('goalIdentified', event);
    });

    this.cognitiveStream.on('planGenerated', (event) => {
      this.emit('planGenerated', event);
    });

    this.cognitiveStream.on('planExecuted', (event) => {
      this.emit('planExecuted', event);
    });

    // Forward bot events to cognitive stream
    this.config.bot.on('error', (error) => {
      this.emit('botError', { error: error.message });
    });

    this.config.bot.on('kicked', (reason) => {
      this.emit('botKicked', { reason });
    });
  }

  /**
   * Execute a planning cycle with real bot actions
   */
  async executePlanningCycle(goal: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Minecraft Cognitive Integration not initialized');
    }

    console.log(`🎯 Executing planning cycle for goal: ${goal}`);

    // Execute planning cycle through cognitive stream
    await this.cognitiveStream.executePlanningCycle(goal);
  }

  /**
   * Get current bot state
   */
  getBotState(): any {
    return this.cognitiveStream.getBotState();
  }

  /**
   * Get active goals
   */
  getActiveGoals(): string[] {
    return this.cognitiveStream.getActiveGoals();
  }

  /**
   * Get cognitive stream events
   */
  getCognitiveStream(): any[] {
    return this.cognitiveStream.getCognitiveStream();
  }

  /**
   * Get MCP capabilities status
   */
  async getMCPCapabilitiesStatus(): Promise<any> {
    return this.cognitiveStream.getMCPCapabilitiesStatus();
  }

  /**
   * Get MCP registry for external access
   */
  getMCPRegistry(): any {
    return this.cognitiveStream.getMCPRegistry();
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    console.log('🔌 Disconnecting Minecraft Cognitive Integration...');

    this.isConnected = false;

    // Remove event listeners
    this.removeAllListeners();

    console.log('✅ Minecraft Cognitive Integration disconnected');
  }
}

/**
 * Create a Minecraft Cognitive Integration instance
 */
export async function createMinecraftCognitiveIntegration(
  bot: Bot,
  config: Partial<MinecraftCognitiveConfig> = {}
): Promise<MinecraftCognitiveIntegration> {
  const fullConfig: MinecraftCognitiveConfig = {
    bot,
    enableRealActions: true,
    actionTimeout: 30000,
    maxRetries: 3,
    ...config,
  };

  const integration = new MinecraftCognitiveIntegration(fullConfig);
  await integration.initialize();

  return integration;
}
