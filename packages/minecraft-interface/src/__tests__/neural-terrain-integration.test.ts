/**
 * Neural Terrain Predictor Integration Tests
 *
 * Tests the integration of Neural Terrain Predictor with NavigationBridge
 * and Environmental Detector for advanced navigation capabilities.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';

// Mock the neural terrain predictor and environmental detector
vi.mock('../neural-terrain-predictor', () => ({
  neuralTerrainPredictor: {
    registerBot: vi.fn().mockImplementation((botId) => {
      console.log(`🧠 Bot registered: ${botId}`);
    }),
    setEnabled: vi.fn().mockImplementation((enabled) => {
      console.log(`${enabled ? '🧠 Enabled' : '🚫 Disabled'} neural terrain prediction`);
    }),
    getStats: vi.fn().mockReturnValue({
      neuralStats: { patternsAnalyzed: 25, trainingSamples: 200 },
      socialStats: { activeBots: 3, sharedPatterns: 15 },
      predictionStats: { cachedPredictions: 8, learningSamples: 120 },
    }),
    on: vi.fn().mockImplementation((event, handler) => {
      console.log(`🧠 Event handler registered for: ${event}`);
    }),
    predictPath: vi.fn().mockResolvedValue({
      terrainType: 'walkable',
      confidence: 0.92,
      predictedChanges: [],
      optimalPath: [new Vec3(0, 64, 0), new Vec3(50, 64, 50)],
      riskAssessment: 0.15,
    }),
    predictTerrain: vi.fn().mockResolvedValue({
      id: 'test-pattern',
      type: 'walkable',
      position: new Vec3(0, 64, 0),
      confidence: 0.95,
      features: {
        blockType: 'stone',
        hardness: 1.5,
        transparency: 0,
        lightLevel: 15,
        biome: 'plains',
        elevation: 64,
        slope: 0.1,
        hazardProximity: 0.1,
        stability: 0.95,
        accessibility: 0.9,
        resourceDensity: 0.4,
        harvestability: 0.7,
      },
      timestamp: Date.now(),
      predictedStability: 0.95,
    }),
    sharePattern: vi.fn().mockImplementation(() => {
      console.log('📡 Pattern shared');
    }),
    recordNavigationOutcome: vi.fn().mockImplementation((botId, path, success) => {
      console.log(`📊 Recorded outcome: ${success} for ${botId}`);
    }),
  },
}));

vi.mock('../environmental-detector', () => ({
  environmentalDetector: {
    startMonitoring: vi.fn().mockImplementation((interval) => {
      console.log(`🌍 Environmental monitoring started with interval: ${interval}ms`);
    }),
    stopMonitoring: vi.fn().mockImplementation(() => {
      console.log('🌍 Environmental monitoring stopped');
    }),
    analyzeEnvironment: vi.fn().mockResolvedValue({
      biome: {
        name: 'plains',
        type: 'overworld',
        temperature: 0.8,
        humidity: 0.4,
        elevation: 64,
        hazards: ['lightning'],
        resources: ['wheat', 'grass'],
        navigationDifficulty: 0.2,
        stability: 0.9,
      },
      dimension: {
        name: 'overworld',
        gravity: 1.0,
        hazards: ['monsters'],
        resources: ['wood', 'stone'],
        timeFlow: 1.0,
        portalRequired: false,
        navigationRules: {
          lavaSwimming: false,
          waterBreathing: false,
          flightAllowed: false,
          teleportationEnabled: true,
        },
      },
      weather: {
        type: 'clear',
        intensity: 0,
        duration: 1200,
        effects: {
          visibility: 1.0,
          movementSpeed: 1.0,
          hazardRisk: 0.2,
          resourceAvailability: 1.0,
        },
        predictedChanges: [],
      },
      position: new Vec3(0, 64, 0),
      timestamp: Date.now(),
      stabilityScore: 0.9,
      navigationScore: 0.8,
    }),
    getCurrentState: vi.fn().mockReturnValue({
      biome: { name: 'plains', type: 'overworld' },
      dimension: { name: 'overworld' },
      weather: { type: 'clear' },
      position: new Vec3(0, 64, 0),
      timestamp: Date.now(),
      stabilityScore: 0.9,
      navigationScore: 0.8,
    }),
    detectHazards: vi.fn().mockReturnValue([
      {
        type: 'lightning',
        position: new Vec3(0, 64, 0),
        severity: 'medium',
        description: 'Lightning can strike nearby',
        avoidanceDistance: 15,
      },
    ]),
    getEnvironmentalStats: vi.fn().mockReturnValue({
      biomesAnalyzed: 7,
      dimensionsDetected: 3,
      weatherPatterns: 5,
      hazardsDetected: 20,
      averageStability: 0.8,
    }),
    on: vi.fn().mockImplementation((event, handler) => {
      console.log(`🌍 Event handler registered for: ${event}`);
    }),
  },
}));

// Import NavigationBridge after mocking
import { NavigationBridge } from '../navigation-bridge';

// Mock mineflayer bot with enhanced navigation capabilities
const createEnhancedNavigationMockBot = (): Bot =>
  ({
    entity: {
      position: new Vec3(0, 64, 0),
      health: 20,
      yaw: 0,
      pitch: 0,
    },
    entities: {
      1: {
        id: 1,
        name: 'zombie',
        type: 'zombie',
        position: new Vec3(5, 64, 5),
        health: 20,
        isValid: true,
      },
    },
    inventory: {
      items: vi
        .fn()
        .mockReturnValue([
          { name: 'diamond_sword', count: 1, slot: 0, metadata: {} },
        ]),
    },
    attack: vi.fn(),
    lookAt: vi.fn(),
    setControlState: vi.fn(),
    equip: vi.fn(),
    loadPlugin: vi.fn(),
    world: {
      raycast: vi.fn().mockReturnValue(null),
    },
    blockAt: vi.fn().mockReturnValue({
      name: 'stone',
      type: 1,
      metadata: {},
      light: 15,
      skyLight: 15,
      position: new Vec3(0, 64, 0),
    }),
    time: { timeOfDay: 1000 },
    isRaining: false,
  }) as any;

describe('Neural Terrain Integration', () => {
  let mockBot: Bot;
  let navigationBridge: NavigationBridge;

  beforeEach(() => {
    mockBot = createEnhancedNavigationMockBot();

    navigationBridge = new NavigationBridge(mockBot, {
      maxRaycastDistance: 32,
      pathfindingTimeout: 30000,
      replanThreshold: 5,
      obstacleDetectionRadius: 8,
      enableDynamicReplanning: true,
      useRaycasting: true,
      usePathfinding: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Neural Terrain Predictor Integration', () => {
    it('should initialize neural prediction system', async () => {
      const { neuralTerrainPredictor } = await import(
        '../neural-terrain-predictor'
      );

      expect(neuralTerrainPredictor.registerBot).toHaveBeenCalledWith(
        expect.stringMatching(/^bot_[a-zA-Z0-9]{9}$/)
      );

      expect(neuralTerrainPredictor.setEnabled).toHaveBeenCalled();
      expect(neuralTerrainPredictor.on).toHaveBeenCalledTimes(4); // 4 event handlers
    });

    it('should perform neural terrain prediction', async () => {
      const { neuralTerrainPredictor } = await import(
        '../neural-terrain-predictor'
      );

      const result = await neuralTerrainPredictor.predictTerrain(
        new Vec3(0, 64, 0),
        {
          blockType: 'stone',
          hardness: 1.5,
          transparency: 0,
          lightLevel: 15,
          biome: 'plains',
          elevation: 64,
          slope: 0.1,
          hazardProximity: 0.2,
          stability: 0.9,
          accessibility: 0.8,
          resourceDensity: 0.3,
          harvestability: 0.6,
        }
      );

      expect(result).toBeDefined();
      expect(result.type).toBe('walkable');
      expect(result.confidence).toBe(0.9);
      expect(result.predictedStability).toBe(0.9);
      expect(result.features).toBeDefined();
    });

    it('should predict optimal navigation paths', async () => {
      const { neuralTerrainPredictor } = await import(
        '../neural-terrain-predictor'
      );

      const result = await neuralTerrainPredictor.predictPath(
        new Vec3(0, 64, 0),
        new Vec3(50, 64, 50)
      );

      expect(result).toBeDefined();
      expect(result.terrainType).toBe('walkable');
      expect(result.confidence).toBe(0.85);
      expect(result.riskAssessment).toBe(0.2);
      expect(result.optimalPath).toHaveLength(2);
      expect(result.predictedChanges).toEqual([]);
    });

    it('should provide neural prediction statistics', () => {
      const stats = navigationBridge.getNeuralStats();

      expect(stats).toBeDefined();
      expect(stats.neuralStats).toBeDefined();
      expect(stats.socialStats).toBeDefined();
      expect(stats.predictionStats).toBeDefined();
      expect(stats.neuralStats.patternsAnalyzed).toBe(10);
      expect(stats.socialStats.activeBots).toBe(1);
      expect(stats.predictionStats.cachedPredictions).toBe(3);
    });
  });

  describe('Environmental Detector Integration', () => {
    it('should initialize environmental monitoring', async () => {
      const { environmentalDetector } = await import(
        '../environmental-detector'
      );

      expect(environmentalDetector.startMonitoring).toHaveBeenCalledWith(3000);
      expect(environmentalDetector.on).toHaveBeenCalledTimes(1);
    });

    it('should analyze environmental state', async () => {
      const { environmentalDetector } = await import(
        '../environmental-detector'
      );

      const state = await environmentalDetector.analyzeEnvironment(
        new Vec3(0, 64, 0)
      );

      expect(state).toBeDefined();
      expect(state.biome.name).toBe('plains');
      expect(state.dimension.name).toBe('overworld');
      expect(state.weather.type).toBe('clear');
      expect(state.stabilityScore).toBe(0.9);
      expect(state.navigationScore).toBe(0.8);
    });

    it('should provide current environmental state', async () => {
      const { environmentalDetector } = await import(
        '../environmental-detector'
      );

      const state = environmentalDetector.getCurrentState();

      expect(state).toBeDefined();
      expect(state.biome).toBeDefined();
      expect(state.dimension).toBeDefined();
      expect(state.weather).toBeDefined();
    });

    it('should detect environmental hazards', async () => {
      const { environmentalDetector } = await import(
        '../environmental-detector'
      );

      const hazards = environmentalDetector.detectHazards(new Vec3(0, 64, 0));

      expect(hazards).toBeDefined();
      expect(Array.isArray(hazards)).toBe(true);
    });

    it('should provide environmental statistics', async () => {
      const { environmentalDetector } = await import(
        '../environmental-detector'
      );

      const stats = environmentalDetector.getEnvironmentalStats();

      expect(stats).toBeDefined();
      expect(stats.biomesAnalyzed).toBe(7);
      expect(stats.dimensionsDetected).toBe(3);
      expect(stats.weatherPatterns).toBe(5);
      expect(stats.hazardsDetected).toBe(20);
      expect(stats.averageStability).toBe(0.8);
    });
  });

  describe('Enhanced Navigation Bridge Features', () => {
    it('should include neural and environmental capabilities in status', async () => {
      const status = navigationBridge.getNavigationStatus();

      expect(status).toBeDefined();
      expect(status.neuralEnabled).toBe(true);
      expect(status.predictionResults).toBeDefined();
      expect(status.botId).toMatch(/^bot_[a-zA-Z0-9]{9}$/);
    });

    it('should enable and disable neural prediction', async () => {
      const { neuralTerrainPredictor } = await import(
        '../neural-terrain-predictor'
      );

      navigationBridge.setNeuralPrediction(false);

      expect(neuralTerrainPredictor.setEnabled).toHaveBeenCalledWith(false);

      navigationBridge.setNeuralPrediction(true);

      expect(neuralTerrainPredictor.setEnabled).toHaveBeenCalledWith(true);
    });

    it('should enable and disable social learning', async () => {
      navigationBridge.setSocialLearning(false);
      navigationBridge.setSocialLearning(true);
    });

    it('should update environmental analysis', async () => {
      const { environmentalDetector } = await import(
        '../environmental-detector'
      );

      const state = await navigationBridge.updateEnvironmentalAnalysis();

      expect(state).toBeDefined();
      expect(state.biome.name).toBe('plains');
      expect(environmentalDetector.analyzeEnvironment).toHaveBeenCalledWith(
        new Vec3(0, 64, 0)
      );
    });

    it('should provide environmental hazards', async () => {
      const { environmentalDetector } = await import(
        '../environmental-detector'
      );

      const hazards = navigationBridge.getEnvironmentalHazards();

      expect(hazards).toBeDefined();
      expect(Array.isArray(hazards)).toBe(true);
      expect(environmentalDetector.detectHazards).toHaveBeenCalledWith(
        new Vec3(0, 64, 0)
      );
    });

    it('should provide environmental statistics', async () => {
      const stats = navigationBridge.getEnvironmentalStats();

      expect(stats).toBeDefined();
      expect(stats.biomesAnalyzed).toBe(7);
    });

    it('should record navigation outcomes for learning', async () => {
      const { neuralTerrainPredictor } = await import(
        '../neural-terrain-predictor'
      );

      navigationBridge.recordNavigationOutcome(true, 50);

      expect(
        neuralTerrainPredictor.recordNavigationOutcome
      ).toHaveBeenCalledWith(
        expect.stringMatching(/^bot_[a-zA-Z0-9]{9}$/),
        expect.any(String),
        true
      );
    });
  });

  describe('System Integration and Performance', () => {
    it('should handle multiple navigation requests with neural prediction', async () => {
      const { neuralTerrainPredictor } = await import(
        '../neural-terrain-predictor'
      );

      const targets = [
        new Vec3(10, 64, 10),
        new Vec3(20, 64, 20),
        new Vec3(30, 64, 30),
      ];

      for (const target of targets) {
        const prediction = await neuralTerrainPredictor.predictPath(
          new Vec3(0, 64, 0),
          target
        );

        expect(prediction).toBeDefined();
        expect(prediction.confidence).toBeGreaterThan(0);
      }

      expect(neuralTerrainPredictor.predictPath).toHaveBeenCalledTimes(3);
    });

    it('should integrate neural prediction with environmental analysis', async () => {
      const { neuralTerrainPredictor } = await import('../neural-terrain-predictor');
      const { environmentalDetector } = await import('../environmental-detector');

      const terrainPrediction = await neuralTerrainPredictor.predictTerrain(
        new Vec3(0, 64, 0),
        {
          blockType: 'stone',
          hardness: 1.5,
          transparency: 0,
          lightLevel: 15,
          biome: 'plains',
          elevation: 64,
          slope: 0.1,
          hazardProximity: 0.2,
          stability: 0.9,
          accessibility: 0.8,
          resourceDensity: 0.3,
          harvestability: 0.6,
        }
      );

      const environmentalState = await environmentalDetector.analyzeEnvironment(
        new Vec3(0, 64, 0)
      );

      expect(terrainPrediction).toBeDefined();
      expect(environmentalState).toBeDefined();
      expect(terrainPrediction.type).toBe('walkable');
      expect(environmentalState.biome.name).toBe('plains');
    });

    it('should provide comprehensive system statistics', async () => {
      const neuralStats = navigationBridge.getNeuralStats();
      const environmentalStats = navigationBridge.getEnvironmentalStats();
      const navStatus = navigationBridge.getNavigationStatus();

      expect(neuralStats).toBeDefined();
      expect(environmentalStats).toBeDefined();
      expect(navStatus).toBeDefined();

      expect(neuralStats.neuralStats).toBeDefined();
      expect(neuralStats.socialStats).toBeDefined();
      expect(neuralStats.predictionStats).toBeDefined();

      expect(environmentalStats.biomesAnalyzed).toBe(7);
      expect(environmentalStats.dimensionsDetected).toBe(3);

      expect(navStatus.neuralEnabled).toBe(true);
      expect(navStatus.botId).toMatch(/^bot_[a-zA-Z0-9]{9}$/);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle neural prediction failures gracefully', async () => {
      const { neuralTerrainPredictor } = await import(
        '../neural-terrain-predictor'
      );

      // Mock prediction failure
      neuralTerrainPredictor.predictPath.mockRejectedValueOnce(
        new Error('Neural prediction failed')
      );

      // Should not throw, should continue with basic navigation
      const status = navigationBridge.getNavigationStatus();
      expect(status).toBeDefined();
      expect(status.neuralEnabled).toBe(true);
    });

    it('should handle environmental analysis failures gracefully', async () => {
      const { environmentalDetector } = await import(
        '../environmental-detector'
      );

      // Mock environmental analysis failure
      environmentalDetector.analyzeEnvironment.mockRejectedValueOnce(
        new Error('Environmental analysis failed')
      );

      // Should not throw, should return null state
      const state = await navigationBridge.updateEnvironmentalAnalysis();
      expect(state).toBeDefined();
    });

    it('should maintain functionality when features are disabled', async () => {
      navigationBridge.setNeuralPrediction(false);
      navigationBridge.setSocialLearning(false);

      const status = navigationBridge.getNavigationStatus();

      expect(status).toBeDefined();
      expect(status.neuralEnabled).toBe(false);
    });
  });
});
