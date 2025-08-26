/**
 * Goal Execution Tests
 *
 * Tests for the goal execution pipeline in the Hybrid Arbiter Integration
 * including signal processing, goal generation, and action execution.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  HybridArbiterIntegration,
  HybridArbiterConfig,
  GameStateSnapshot,
  SignalGenerationResult,
} from '../hybrid-arbiter-integration';
import { BotAdapter } from '../bot-adapter';
import { ObservationMapper } from '../observation-mapper';
import { ActionTranslator } from '../action-translator';
import {
  HybridHRMArbiter,
  HRMSignal,
  HRMGoalCandidate,
  HRMPerformanceBudgets,
} from '@conscious-bot/core';

// Mock dependencies
jest.mock('../bot-adapter');
jest.mock('../observation-mapper');
jest.mock('../action-translator');
jest.mock('@conscious-bot/core', () => ({
  HybridHRMArbiter: jest.fn(),
  createLeafContext: jest.fn(),
  LeafFactory: jest.fn(),
}));

describe('Goal Execution Tests', () => {
  let integration: HybridArbiterIntegration;
  let mockBotAdapter: jest.Mocked<BotAdapter>;
  let mockObservationMapper: jest.Mocked<ObservationMapper>;
  let mockActionTranslator: jest.Mocked<ActionTranslator>;
  let mockArbiter: jest.Mocked<HybridHRMArbiter>;
  let mockBot: any;

  const mockConfig: HybridArbiterConfig = {
    pythonHRMConfig: {
      serverUrl: 'http://localhost',
      port: 5000,
    },
    signalProcessingInterval: 1000,
    maxSignalsPerBatch: 10,
    goalExecutionTimeout: 5000,
    maxConcurrentGoals: 3,
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock bot
    mockBot = {
      entity: {
        position: { x: 0, y: 64, z: 0 },
      },
      health: 20,
      food: 20,
      time: { timeOfDay: 6000 },
      inventory: {
        items: () => [],
      },
      entities: {},
      world: {
        getBiome: jest.fn(() => 1), // plains biome
      },
      pathfinder: {
        setMovements: jest.fn(),
        setGoal: jest.fn(),
      },
    };

    // Setup mock bot adapter
    mockBotAdapter = {
      getBot: jest.fn(() => mockBot),
      connect: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
    } as any;

    // Setup mock observation mapper
    mockObservationMapper = {
      generateSignals: jest.fn(() => []),
      getEnhancedHomeostasisState: jest.fn(() => ({})),
    } as any;

    // Setup mock action translator
    mockActionTranslator = {
      executePlanStep: jest.fn(),
    } as any;

    // Setup mock arbiter
    mockArbiter = {
      initialize: jest.fn(() => Promise.resolve(true)),
      processMultipleSignals: jest.fn(() => Promise.resolve([])),
      processHRMSignal: jest.fn(() => Promise.resolve([])),
      getOptimizationStats: jest.fn(() => ({})),
    } as any;

    // Mock the HybridHRMArbiter constructor
    (HybridHRMArbiter as unknown as jest.Mock).mockImplementation(
      () => mockArbiter
    );

    // Create integration instance
    integration = new HybridArbiterIntegration(
      mockConfig,
      mockBotAdapter,
      mockObservationMapper,
      mockActionTranslator
    );
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const result = await integration.initialize();

      expect(result).toBe(true);
      expect(mockArbiter.initialize).toHaveBeenCalled();
    });

    it('should handle initialization failure', async () => {
      mockArbiter.initialize.mockResolvedValue(false);

      const result = await integration.initialize();

      expect(result).toBe(false);
    });

    it('should handle initialization error', async () => {
      mockArbiter.initialize.mockRejectedValue(new Error('Connection failed'));

      const result = await integration.initialize();

      expect(result).toBe(false);
    });
  });

  describe('Signal Processing', () => {
    beforeEach(async () => {
      await integration.initialize();
    });

    it('should generate signals from game state', () => {
      const gameState: GameStateSnapshot = {
        position: { x: 0, y: 64, z: 0 },
        health: 5, // Low health should generate signal
        food: 20,
        lightLevel: 15,
        timeOfDay: 6000,
        weather: 'clear',
        biome: 'plains',
        inventory: [],
        nearbyEntities: [],
        nearbyHostiles: [],
      };

      // Access private method for testing
      const generateSignals = (
        integration as any
      ).generateSignalsFromGameState.bind(integration);
      const signals = generateSignals(gameState);

      expect(signals).toHaveLength(1);
      expect(signals[0].name).toBe('health');
      expect(signals[0].value).toBeGreaterThan(0);
    });

    it('should generate multiple signals for complex state', () => {
      const gameState: GameStateSnapshot = {
        position: { x: 0, y: 64, z: 0 },
        health: 5, // Low health
        food: 5, // Low food
        lightLevel: 3, // Low light
        timeOfDay: 18000, // Night time
        weather: 'clear',
        biome: 'plains',
        inventory: [],
        nearbyEntities: [],
        nearbyHostiles: [{ type: 'zombie', distance: 5 }], // Nearby hostile
      };

      const generateSignals = (
        integration as any
      ).generateSignalsFromGameState.bind(integration);
      const signals = generateSignals(gameState);

      expect(signals.length).toBeGreaterThan(1);

      const signalNames = signals.map((s: HRMSignal) => s.name);
      expect(signalNames).toContain('health');
      expect(signalNames).toContain('hunger');
      expect(signalNames).toContain('lightLevel');
      expect(signalNames).toContain('timeOfDay');
      expect(signalNames).toContain('threatProximity');
    });

    it('should not generate signals for healthy state', () => {
      const gameState: GameStateSnapshot = {
        position: { x: 0, y: 64, z: 0 },
        health: 20, // Full health
        food: 20, // Full food
        lightLevel: 15, // Full light
        timeOfDay: 12000, // Day time
        weather: 'clear',
        biome: 'plains',
        inventory: [{ name: 'iron_pickaxe', count: 1 }], // Has tools
        nearbyEntities: [],
        nearbyHostiles: [],
      };

      const generateSignals = (
        integration as any
      ).generateSignalsFromGameState.bind(integration);
      const signals = generateSignals(gameState);

      expect(signals).toHaveLength(0);
    });
  });

  describe('Goal Execution', () => {
    beforeEach(async () => {
      await integration.initialize();
    });

    it('should convert goal to action plan', async () => {
      const mockGoal: HRMGoalCandidate = {
        id: 'test-goal-1',
        template: {
          name: 'ReachSafeLight',
          needType: 'Safety',
          preconditions: () => true,
          feasibility: () => ({ ok: true }),
          utility: () => 0.8,
          complexity: 0.5,
          timeCritical: true,
          safetyCritical: true,
        },
        priority: 0.8,
        feasibility: { ok: true },
        reasoningTrace: [],
        createdAt: Date.now(),
        estimatedProcessingTime: 1000,
      };

      const convertGoal = (integration as any).convertGoalToActionPlan.bind(
        integration
      );
      const actionPlan = await convertGoal(mockGoal);

      expect(actionPlan).toHaveLength(1);
      expect(actionPlan[0].type).toBe('move');
      expect(actionPlan[0].target).toBe('nearest_light_source');
      expect(actionPlan[0].priority).toBe('high');
    });

    it('should handle unknown goal types', async () => {
      const mockGoal: HRMGoalCandidate = {
        id: 'test-goal-2',
        template: {
          name: 'UnknownGoal',
          needType: 'Safety',
          preconditions: () => true,
          feasibility: () => ({ ok: true }),
          utility: () => 0.5,
          complexity: 0.3,
          timeCritical: false,
          safetyCritical: false,
        },
        priority: 0.5,
        feasibility: { ok: true },
        reasoningTrace: [],
        createdAt: Date.now(),
        estimatedProcessingTime: 500,
      };

      const convertGoal = (integration as any).convertGoalToActionPlan.bind(
        integration
      );
      const actionPlan = await convertGoal(mockGoal);

      expect(actionPlan).toHaveLength(0);
    });

    it('should execute top priority goal', async () => {
      const mockGoals: HRMGoalCandidate[] = [
        {
          id: 'test-goal-3',
          template: {
            name: 'EatFromInventory',
            needType: 'Nutrition',
            preconditions: () => true,
            feasibility: () => ({ ok: true }),
            utility: () => 0.9,
            complexity: 0.2,
            timeCritical: false,
            safetyCritical: false,
          },
          priority: 0.9,
          feasibility: { ok: true },
          reasoningTrace: [],
          createdAt: Date.now(),
          estimatedProcessingTime: 300,
        },
      ];

      // Mock the action executor
      const mockActionExecutor = {
        executeActionPlan: jest.fn(() =>
          Promise.resolve({
            success: true,
            durationMs: 100,
            actionsExecuted: ['consume'],
          })
        ),
      };
      (integration as any).actionExecutor = mockActionExecutor;
      (integration as any).currentGoals = mockGoals;

      const executeTopGoal = (integration as any).executeTopGoal.bind(
        integration
      );
      await executeTopGoal();

      expect(mockActionExecutor.executeActionPlan).toHaveBeenCalled();
    });

    it('should handle goal execution failure', async () => {
      const mockGoals: HRMGoalCandidate[] = [
        {
          id: 'test-goal-4',
          template: {
            name: 'ReachSafeLight',
            needType: 'Safety',
            preconditions: () => true,
            feasibility: () => ({ ok: true }),
            utility: () => 0.8,
            complexity: 0.6,
            timeCritical: true,
            safetyCritical: true,
          },
          priority: 0.8,
          feasibility: { ok: true },
          reasoningTrace: [],
          createdAt: Date.now(),
          estimatedProcessingTime: 800,
        },
      ];

      const mockActionExecutor = {
        executeActionPlan: jest.fn(() =>
          Promise.resolve({
            success: false,
            error: 'Failed to move',
            durationMs: 100,
            actionsExecuted: [],
          })
        ),
      };
      (integration as any).actionExecutor = mockActionExecutor;
      (integration as any).currentGoals = mockGoals;

      const executeTopGoal = (integration as any).executeTopGoal.bind(
        integration
      );
      await executeTopGoal();

      expect(mockActionExecutor.executeActionPlan).toHaveBeenCalled();
    });
  });

  describe('Game State Snapshot', () => {
    beforeEach(async () => {
      await integration.initialize();
    });

    it('should create game state snapshot', async () => {
      const getGameStateSnapshot = (
        integration as any
      ).getGameStateSnapshot.bind(integration);
      const snapshot = await getGameStateSnapshot();

      expect(snapshot).toHaveProperty('position');
      expect(snapshot).toHaveProperty('health');
      expect(snapshot).toHaveProperty('food');
      expect(snapshot).toHaveProperty('lightLevel');
      expect(snapshot).toHaveProperty('timeOfDay');
      expect(snapshot).toHaveProperty('weather');
      expect(snapshot).toHaveProperty('biome');
      expect(snapshot).toHaveProperty('inventory');
      expect(snapshot).toHaveProperty('nearbyEntities');
      expect(snapshot).toHaveProperty('nearbyHostiles');
    });

    it('should handle missing bot gracefully', async () => {
      mockBotAdapter.getBot.mockImplementation(() => {
        throw new Error('Bot is not connected. Connection state: disconnected');
      });

      const getGameStateSnapshot = (
        integration as any
      ).getGameStateSnapshot.bind(integration);

      await expect(getGameStateSnapshot()).rejects.toThrow(
        'No bot available for state snapshot'
      );
    });
  });

  describe('Entity Hostility Detection', () => {
    beforeEach(async () => {
      await integration.initialize();
    });

    it('should identify hostile entities', () => {
      const isHostileEntity = (integration as any).isHostileEntity.bind(
        integration
      );

      expect(isHostileEntity('zombie')).toBe(true);
      expect(isHostileEntity('skeleton')).toBe(true);
      expect(isHostileEntity('creeper')).toBe(true);
      expect(isHostileEntity('spider')).toBe(true);
    });

    it('should identify non-hostile entities', () => {
      const isHostileEntity = (integration as any).isHostileEntity.bind(
        integration
      );

      expect(isHostileEntity('pig')).toBe(false);
      expect(isHostileEntity('cow')).toBe(false);
      expect(isHostileEntity('chicken')).toBe(false);
      expect(isHostileEntity('villager')).toBe(false);
    });
  });

  describe('Integration Lifecycle', () => {
    beforeEach(async () => {
      await integration.initialize();
    });

    it('should start and stop integration', () => {
      const startSpy = jest.spyOn(integration, 'emit');

      integration.start();
      expect(integration.getStatus().isRunning).toBe(true);
      expect(startSpy).toHaveBeenCalledWith('started');

      integration.stop();
      expect(integration.getStatus().isRunning).toBe(false);
      expect(startSpy).toHaveBeenCalledWith('stopped');
    });

    it('should not start if already running', () => {
      integration.start();
      const startSpy = jest.spyOn(console, 'warn');

      integration.start();
      expect(startSpy).toHaveBeenCalledWith(
        '⚠️ Integration is already running'
      );
    });

    it('should provide status information', () => {
      const status = integration.getStatus();

      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('currentGoals');
      expect(status).toHaveProperty('gameStateHistory');
      expect(status).toHaveProperty('optimizationStats');
    });
  });

  describe('Signal Injection', () => {
    beforeEach(async () => {
      await integration.initialize();
      integration.start();
    });

    it('should inject and process signals', () => {
      const mockSignal: HRMSignal = {
        id: 'test-signal',
        name: 'test',
        value: 0.5,
        trend: 0,
        confidence: 0.8,
        provenance: 'body',
        timestamp: Date.now(),
      };

      const injectSpy = jest.spyOn(integration, 'emit');

      integration.injectSignal(mockSignal);

      expect(injectSpy).toHaveBeenCalledWith(
        'signal-injected',
        expect.objectContaining({
          signal: mockSignal,
        })
      );
    });

    it('should not inject signals when not running', () => {
      integration.stop();

      const mockSignal: HRMSignal = {
        id: 'test-signal',
        name: 'test',
        value: 0.5,
        trend: 0,
        confidence: 0.8,
        provenance: 'body',
        timestamp: Date.now(),
      };

      const warnSpy = jest.spyOn(console, 'warn');

      integration.injectSignal(mockSignal);

      expect(warnSpy).toHaveBeenCalledWith(
        '⚠️ Integration not running, cannot inject signal'
      );
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await integration.initialize();
    });

    it('should handle signal processing errors', async () => {
      mockArbiter.processMultipleSignals.mockRejectedValue(
        new Error('Processing failed')
      );

      const processSignals = (integration as any).processGameSignals.bind(
        integration
      );
      const errorSpy = jest.spyOn(integration, 'emit');

      await processSignals();

      expect(errorSpy).toHaveBeenCalledWith('error', expect.any(Error));
    });

    it('should handle goal execution errors', async () => {
      const mockGoals: HRMGoalCandidate[] = [
        {
          id: 'test-goal-5',
          template: {
            name: 'TestGoal',
            needType: 'Safety',
            preconditions: () => true,
            feasibility: () => ({ ok: true }),
            utility: () => 0.8,
            complexity: 0.4,
            timeCritical: false,
            safetyCritical: false,
          },
          priority: 0.8,
          feasibility: { ok: true },
          reasoningTrace: [],
          createdAt: Date.now(),
          estimatedProcessingTime: 600,
        },
      ];

      const mockActionExecutor = {
        executeActionPlan: jest.fn(() =>
          Promise.reject(new Error('Execution failed'))
        ),
      };
      (integration as any).actionExecutor = mockActionExecutor;
      (integration as any).currentGoals = mockGoals;

      const executeTopGoal = (integration as any).executeTopGoal.bind(
        integration
      );
      const errorSpy = jest.spyOn(integration, 'emit');

      await executeTopGoal();

      expect(errorSpy).toHaveBeenCalledWith(
        'goal-failed',
        expect.objectContaining({
          goal: mockGoals[0],
          error: expect.any(Error),
        })
      );
    });
  });
});
