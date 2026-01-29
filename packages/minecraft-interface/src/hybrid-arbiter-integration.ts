/**
 * Hybrid Arbiter Integration Bridge
 *
 * Connects the HybridHRMArbiter with the Minecraft interface to enable
 * the full signal→need→goal→plan→action pipeline in the game world.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { Bot } from 'mineflayer';
import {
  HybridHRMArbiter,
  HRMSignal,
  HRMGoalCandidate,
  HRMPerformanceBudgets,
} from '@conscious-bot/core';
import { BotAdapter } from './bot-adapter';
import { ObservationMapper } from './observation-mapper';
import { ActionTranslator } from './action-translator';
import { ActionExecutor } from './action-executor';
import { BotConfig } from './types';
import { createLeafContext, LeafFactory } from '@conscious-bot/core';

export interface HybridArbiterConfig {
  // HRM configuration
  pythonHRMConfig: {
    serverUrl: string;
    port: number;
  };

  // Performance budgets
  performanceBudgets?: Partial<HRMPerformanceBudgets>;

  // Signal processing
  signalProcessingInterval: number; // ms
  maxSignalsPerBatch: number;

  // Goal execution
  goalExecutionTimeout: number; // ms
  maxConcurrentGoals: number;
}

export interface GameStateSnapshot {
  position: { x: number; y: number; z: number };
  health: number;
  food: number;
  lightLevel: number;
  timeOfDay: number;
  weather: string;
  biome: string;
  inventory: Array<{ name: string; count: number }>;
  nearbyEntities: Array<{ type: string; distance: number }>;
  nearbyHostiles: Array<{ type: string; distance: number }>;
}

export interface SignalGenerationResult {
  signals: HRMSignal[];
  gameState: GameStateSnapshot;
  timestamp: number;
}

/**
 * Integration bridge between HybridHRMArbiter and Minecraft interface
 */
export class HybridArbiterIntegration extends EventEmitter {
  private arbiter: HybridHRMArbiter;
  private botAdapter: BotAdapter;
  private observationMapper: ObservationMapper;
  private actionTranslator: ActionTranslator;
  private actionExecutor: ActionExecutor;
  private config: HybridArbiterConfig;

  private isRunning = false;
  private isProcessingSignals = false;
  private signalProcessingInterval?: NodeJS.Timeout;
  private currentGoals: HRMGoalCandidate[] = [];
  private gameStateHistory: GameStateSnapshot[] = [];

  constructor(
    config: HybridArbiterConfig,
    botAdapter: BotAdapter,
    observationMapper: ObservationMapper,
    actionTranslator: ActionTranslator
  ) {
    super();

    this.config = config;
    this.botAdapter = botAdapter;
    this.observationMapper = observationMapper;
    this.actionTranslator = actionTranslator;

    // Initialize the hybrid HRM arbiter
    this.arbiter = new HybridHRMArbiter(
      config.pythonHRMConfig,
      config.performanceBudgets
    );

    // Initialize action executor with leaf factory
    // Use the global leaf factory if available, otherwise create a new one
    const leafFactory =
      (global as any).minecraftLeafFactory || new LeafFactory();
    this.actionExecutor = new ActionExecutor(leafFactory, botAdapter);

    this.setupEventHandlers();
  }

  /**
   * Initialize the integration
   */
  async initialize(): Promise<boolean> {
    console.log('🧠 Initializing Hybrid Arbiter Integration...');

    try {
      // Initialize the arbiter
      const arbiterInitialized = await this.arbiter.initialize();
      if (!arbiterInitialized) {
        console.warn('⚠️ Arbiter initialization failed');
        return false;
      }

      console.log('✅ Hybrid Arbiter Integration initialized successfully');
      return true;
    } catch (error) {
      console.error(
        '❌ Failed to initialize Hybrid Arbiter Integration:',
        error
      );
      return false;
    }
  }

  /**
   * Start the signal processing loop
   */
  start(): void {
    if (this.isRunning) {
      console.warn('⚠️ Integration is already running');
      return;
    }

    this.isRunning = true;

    // Start periodic signal processing with concurrency guard
    this.signalProcessingInterval = setInterval(async () => {
      if (this.isProcessingSignals) return;
      this.isProcessingSignals = true;
      try {
        await this.processGameSignals();
      } finally {
        this.isProcessingSignals = false;
      }
    }, this.config.signalProcessingInterval);

    console.log('🚀 Hybrid Arbiter Integration started');
    this.emit('started');
  }

  /**
   * Stop the signal processing loop
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.isProcessingSignals = false;

    if (this.signalProcessingInterval) {
      clearInterval(this.signalProcessingInterval);
      this.signalProcessingInterval = undefined;
    }

    console.log('🛑 Hybrid Arbiter Integration stopped');
    this.emit('stopped');
  }

  /**
   * Process game signals and generate goals
   */
  private async processGameSignals(): Promise<void> {
    try {
      // Get current game state
      const gameState = await this.getGameStateSnapshot();
      this.gameStateHistory.push(gameState);

      // Keep only recent history
      if (this.gameStateHistory.length > 100) {
        this.gameStateHistory = this.gameStateHistory.slice(-50);
      }

      // Generate signals from game state
      const signals = this.generateSignalsFromGameState(gameState);

      if (signals.length === 0) {
        return; // No signals to process
      }

      // Create leaf context for the arbiter
      const bot = this.botAdapter.getBot();
      if (!bot) {
        console.warn('⚠️ No bot available for context creation');
        return;
      }

      const context = createLeafContext(bot as any);

      // Process signals through the arbiter
      const goals = await this.arbiter.processMultipleSignals(signals, context);

      // Update current goals
      this.currentGoals = goals.slice(0, this.config.maxConcurrentGoals);

      // Execute top priority goal if we have one
      if (this.currentGoals.length > 0) {
        await this.executeTopGoal();
      }

      // Emit events for monitoring
      this.emit('signals-processed', {
        signals,
        goals: this.currentGoals,
        gameState,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('❌ Error processing game signals:', error);
      this.emit('error', error);
    }
  }

  /**
   * Generate signals from current game state
   */
  private generateSignalsFromGameState(
    gameState: GameStateSnapshot
  ): HRMSignal[] {
    const signals: HRMSignal[] = [];
    const now = Date.now();

    // Health signals
    if (gameState.health < 10) {
      signals.push({
        id: `health-${now}`,
        name: 'health',
        value: 1 - gameState.health / 20, // Higher value = more urgent
        trend: 0,
        confidence: 0.9,
        provenance: 'body',
        timestamp: now,
      });
    }

    // Hunger signals
    if (gameState.food < 10) {
      signals.push({
        id: `hunger-${now}`,
        name: 'hunger',
        value: 1 - gameState.food / 20,
        trend: 0,
        confidence: 0.9,
        provenance: 'body',
        timestamp: now,
      });
    }

    // Light level signals
    if (gameState.lightLevel < 8) {
      signals.push({
        id: `light-${now}`,
        name: 'lightLevel',
        value: 1 - gameState.lightLevel / 15,
        trend: 0,
        confidence: 0.8,
        provenance: 'env',
        timestamp: now,
      });
    }

    // Threat signals
    if (gameState.nearbyHostiles.length > 0) {
      const closestHostile = Math.min(
        ...gameState.nearbyHostiles.map((h) => h.distance)
      );
      signals.push({
        id: `threat-${now}`,
        name: 'threatProximity',
        value: Math.max(0, 1 - closestHostile / 32), // Closer = higher threat
        trend: 0,
        confidence: 0.8,
        provenance: 'env',
        timestamp: now,
      });
    }

    // Time-based signals
    if (gameState.timeOfDay > 18000 || gameState.timeOfDay < 6000) {
      signals.push({
        id: `night-${now}`,
        name: 'timeOfDay',
        value: 0.7, // Night time urgency
        trend: 0,
        confidence: 0.9,
        provenance: 'env',
        timestamp: now,
      });
    }

    // Tool deficit signals
    const hasPickaxe = gameState.inventory.some((item) =>
      item.name.includes('pickaxe')
    );
    if (!hasPickaxe) {
      signals.push({
        id: `tool-${now}`,
        name: 'toolDeficit',
        value: 0.6,
        trend: 0,
        confidence: 0.8,
        provenance: 'memory',
        timestamp: now,
      });
    }

    return signals;
  }

  /**
   * Execute the top priority goal
   */
  private async executeTopGoal(): Promise<void> {
    if (this.currentGoals.length === 0) {
      return;
    }

    const topGoal = this.currentGoals[0];

    try {
      console.log(
        `🎯 Executing goal: ${topGoal.template.name} (priority: ${topGoal.priority.toFixed(2)})`
      );

      // Convert goal to action plan
      const actionPlan = await this.convertGoalToActionPlan(topGoal);

      if (actionPlan && actionPlan.length > 0) {
        // Execute the action plan
        await this.executeActionPlan(actionPlan);

        console.log(`✅ Goal completed: ${topGoal.template.name}`);
        this.emit('goal-completed', topGoal);
      } else {
        console.warn(
          `⚠️ No action plan generated for goal: ${topGoal.template.name}`
        );
      }
    } catch (error) {
      console.error(
        `❌ Failed to execute goal ${topGoal.template.name}:`,
        error
      );
      this.emit('goal-failed', { goal: topGoal, error });
    }
  }

  /**
   * Convert a goal to an action plan
   */
  private async convertGoalToActionPlan(
    goal: HRMGoalCandidate
  ): Promise<any[]> {
    // This is a simplified conversion - in a full implementation,
    // you would use the goal's plan property and convert it to
    // concrete Minecraft actions

    const actionPlan: any[] = [];

    switch (goal.template.name) {
      case 'ReachSafeLight':
        actionPlan.push({
          type: 'move',
          target: 'nearest_light_source',
          priority: 'high',
        });
        break;

      case 'ReturnToBase':
        actionPlan.push({
          type: 'move',
          target: 'home_base',
          priority: 'high',
        });
        break;

      case 'EatFromInventory':
        actionPlan.push({
          type: 'consume',
          item: 'food',
          priority: 'medium',
        });
        break;

      case 'UpgradePickaxe':
        actionPlan.push({
          type: 'craft',
          item: 'iron_pickaxe',
          priority: 'medium',
        });
        break;

      case 'VisitVillage':
        actionPlan.push({
          type: 'move',
          target: 'nearest_village',
          priority: 'low',
        });
        break;

      case 'ScoutNewArea':
        actionPlan.push({
          type: 'explore',
          direction: 'random',
          priority: 'low',
        });
        break;

      default:
        console.warn(`Unknown goal type: ${goal.template.name}`);
    }

    return actionPlan;
  }

  /**
   * Execute an action plan
   */
  private async executeActionPlan(actionPlan: any[]): Promise<void> {
    try {
      const result = await this.actionExecutor.executeActionPlan(actionPlan);

      if (result.success) {
        console.log(
          `✅ Action plan executed successfully in ${result.durationMs}ms`
        );
        console.log(
          `   Actions executed: ${result.actionsExecuted.join(', ')}`
        );
      } else {
        console.warn(`⚠️ Action plan failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Error executing action plan:`, error);
    }
  }

  /**
   * Get current game state snapshot
   */
  private async getGameStateSnapshot(): Promise<GameStateSnapshot> {
    const bot = this.botAdapter.getBot();
    if (!bot) {
      throw new Error('No bot available for state snapshot');
    }

    const position = bot.entity?.position || { x: 0, y: 64, z: 0 };
    const health = bot.health || 20;
    const food = bot.food || 20;

    // Get light level from world
    let lightLevel = 15;
    try {
      const pos = bot.entity.position.floored();
      const worldLight = (bot.world as any).getLight?.(pos);
      if (typeof worldLight === 'number') {
        lightLevel = worldLight;
      }
    } catch {
      // fallback to 15
    }

    // Get time of day
    const timeOfDay = bot.time.timeOfDay || 6000;

    // Get weather from bot state
    const weather: string = bot.isRaining ? 'rain' : 'clear';

    // Get biome via world API + minecraft-data lookup
    let biome = 'plains';
    try {
      const pos = bot.entity.position;
      const biomeId = (bot.world as any).getBiome?.(pos);
      if (typeof biomeId === 'number') {
        const mcDataModule = await import('minecraft-data');
        const mcDataFn = mcDataModule.default || mcDataModule;
        if (typeof mcDataFn === 'function') {
          const mcData = mcDataFn(bot.version);
          const biomeData = mcData.biomes?.[biomeId] ?? mcData.biomesByName?.plains;
          if (biomeData?.name) {
            biome = biomeData.name;
          }
        }
      }
    } catch {
      // fallback to 'plains'
    }

    // Get inventory
    const inventory = bot.inventory.items().map((item) => ({
      name: item.name,
      count: item.count,
    }));

    // Get nearby entities (simplified)
    const nearbyEntities: Array<{ type: string; distance: number }> = [];
    const nearbyHostiles: Array<{ type: string; distance: number }> = [];

    try {
      for (const [id, entity] of Object.entries(bot.entities)) {
        if (entity === bot.entity) continue;

        const distance = bot.entity.position.distanceTo(entity.position);
        if (distance <= 32) {
          const entityInfo = { type: entity.type, distance };
          nearbyEntities.push(entityInfo);

          // Check if hostile
          if (this.isHostileEntity(entity.type)) {
            nearbyHostiles.push(entityInfo);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to get nearby entities:', error);
    }

    return {
      position: { x: position.x, y: position.y, z: position.z },
      health,
      food,
      lightLevel,
      timeOfDay,
      weather,
      biome,
      inventory,
      nearbyEntities,
      nearbyHostiles,
    };
  }

  /**
   * Check if an entity type is hostile
   */
  private isHostileEntity(entityType: string): boolean {
    const hostileTypes = [
      'zombie',
      'skeleton',
      'spider',
      'creeper',
      'enderman',
      'witch',
      'slime',
      'ghast',
      'blaze',
      'magma_cube',
    ];
    return hostileTypes.includes(entityType);
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    // Handle bot events
    this.botAdapter.on('connected', () => {
      console.log('🤖 Bot connected - starting integration');
      this.start();
    });

    this.botAdapter.on('disconnected', () => {
      console.log('🤖 Bot disconnected - stopping integration');
      this.stop();
    });
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    currentGoals: number;
    gameStateHistory: number;
    optimizationStats: any;
  } {
    return {
      isRunning: this.isRunning,
      currentGoals: this.currentGoals.length,
      gameStateHistory: this.gameStateHistory.length,
      optimizationStats: this.arbiter.getOptimizationStats(),
    };
  }

  /**
   * Manually inject a signal
   */
  injectSignal(signal: HRMSignal): void {
    if (!this.isRunning) {
      console.warn('⚠️ Integration not running, cannot inject signal');
      return;
    }

    // Process the signal immediately
    this.processInjectedSignal(signal);
  }

  /**
   * Process an injected signal
   */
  private async processInjectedSignal(signal: HRMSignal): Promise<void> {
    try {
      const bot = this.botAdapter.getBot();
      if (!bot) {
        console.warn('⚠️ No bot available for signal processing');
        return;
      }

      const context = createLeafContext(bot as any);
      const goals = await this.arbiter.processHRMSignal(signal, context);

      console.log(`🎯 Injected signal generated ${goals.length} goals`);

      // Update current goals
      this.currentGoals = goals.slice(0, this.config.maxConcurrentGoals);

      this.emit('signal-injected', { signal, goals: this.currentGoals });
    } catch (error) {
      console.error('❌ Error processing injected signal:', error);
    }
  }
}
