/**
 * Integration Verification Tests
 *
 * Simple verification tests to ensure our modules can be imported
 * and instantiated correctly, and that the NavigationBridge can
 * be created and used with our new features.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';

// Mock mineflayer bot for testing
const createTestBot = (): Bot =>
  ({
    entity: {
      position: new Vec3(0, 64, 0),
      health: 20,
      yaw: 0,
      pitch: 0,
    },
    entities: {},
    inventory: {
      items: vi.fn().mockReturnValue([]),
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

describe('Integration Verification', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createTestBot();
  });

  describe('Module Import and Export Verification', () => {
    it('should be able to import all modules', async () => {
      // Test importing neural terrain predictor
      const { neuralTerrainPredictor } = await import('../neural-terrain-predictor');

      expect(neuralTerrainPredictor).toBeDefined();
      expect(typeof neuralTerrainPredictor.predictTerrain).toBe('function');
      expect(typeof neuralTerrainPredictor.predictPath).toBe('function');
      expect(typeof neuralTerrainPredictor.getStats).toBe('function');
    });

    it('should be able to import environmental detector', async () => {
      const { environmentalDetector } = await import('../environmental-detector');

      expect(environmentalDetector).toBeDefined();
      expect(typeof environmentalDetector.analyzeEnvironment).toBe('function');
      expect(typeof environmentalDetector.getCurrentState).toBe('function');
      expect(typeof environmentalDetector.detectHazards).toBe('function');
    });

    it('should be able to import NavigationBridge', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      expect(NavigationBridge).toBeDefined();
      expect(typeof NavigationBridge).toBe('function');
    });

    it('should be able to create NavigationBridge instance', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot, {
        maxRaycastDistance: 32,
        pathfindingTimeout: 30000,
        replanThreshold: 5,
        obstacleDetectionRadius: 8,
        enableDynamicReplanning: true,
        useRaycasting: true,
        usePathfinding: true,
      });

      expect(navigationBridge).toBeDefined();
      expect(navigationBridge.bot).toBe(mockBot);
      expect(navigationBridge.maxRaycastDistance).toBe(32);
    });

    it('should have all expected methods on NavigationBridge', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);

      // Check for expected methods
      expect(typeof navigationBridge.getNavigationStatus).toBe('function');
      expect(typeof navigationBridge.getNeuralStats).toBe('function');
      expect(typeof navigationBridge.getEnvironmentalStats).toBe('function');
      expect(typeof navigationBridge.setNeuralPrediction).toBe('function');
      expect(typeof navigationBridge.setSocialLearning).toBe('function');
      expect(typeof navigationBridge.updateEnvironmentalAnalysis).toBe('function');
      expect(typeof navigationBridge.getEnvironmentalHazards).toBe('function');
      expect(typeof navigationBridge.recordNavigationOutcome).toBe('function');
    });

    it('should be able to call NavigationBridge methods without errors', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);

      // These should not throw errors
      expect(() => navigationBridge.getNavigationStatus()).not.toThrow();
      expect(() => navigationBridge.getNeuralStats()).not.toThrow();
      expect(() => navigationBridge.getEnvironmentalStats()).not.toThrow();
      expect(() => navigationBridge.setNeuralPrediction(true)).not.toThrow();
      expect(() => navigationBridge.setSocialLearning(true)).not.toThrow();
      expect(() => navigationBridge.getEnvironmentalHazards()).not.toThrow();
    });

    it('should return navigation status with expected structure', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);
      const status = navigationBridge.getNavigationStatus();

      expect(status).toBeDefined();
      expect(typeof status.isNavigating).toBe('boolean');
      expect(typeof status.neuralEnabled).toBe('boolean');
      expect(status.botId).toMatch(/^bot_[a-zA-Z0-9]{9}$/);
    });

    it('should return neural stats with expected structure', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);
      const stats = navigationBridge.getNeuralStats();

      expect(stats).toBeDefined();
      expect(stats.neuralStats).toBeDefined();
      expect(stats.socialStats).toBeDefined();
      expect(stats.predictionStats).toBeDefined();
      expect(typeof stats.neuralStats.patternsAnalyzed).toBe('number');
      expect(typeof stats.socialStats.activeBots).toBe('number');
      expect(typeof stats.predictionStats.cachedPredictions).toBe('number');
    });

    it('should return environmental stats with expected structure', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);
      const stats = navigationBridge.getEnvironmentalStats();

      expect(stats).toBeDefined();
      expect(typeof stats.biomesAnalyzed).toBe('number');
      expect(typeof stats.dimensionsDetected).toBe('number');
      expect(typeof stats.weatherPatterns).toBe('number');
      expect(typeof stats.hazardsDetected).toBe('number');
      expect(typeof stats.averageStability).toBe('number');
    });

    it('should enable and disable features correctly', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);

      navigationBridge.setNeuralPrediction(false);
      let status = navigationBridge.getNavigationStatus();
      expect(status.neuralEnabled).toBe(false);

      navigationBridge.setNeuralPrediction(true);
      status = navigationBridge.getNavigationStatus();
      expect(status.neuralEnabled).toBe(true);

      navigationBridge.setSocialLearning(false);
      navigationBridge.setSocialLearning(true);
    });

    it('should handle method calls that return promises', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);

      // These should return promises
      await expect(navigationBridge.updateEnvironmentalAnalysis()).resolves.toBeDefined();
    });

    it('should be able to record navigation outcomes', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);

      // This should not throw
      expect(() => navigationBridge.recordNavigationOutcome(true, 50)).not.toThrow();
      expect(() => navigationBridge.recordNavigationOutcome(false, 25)).not.toThrow();
    });

    it('should provide environmental hazards', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);
      const hazards = navigationBridge.getEnvironmentalHazards();

      expect(Array.isArray(hazards)).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);

      // These should not throw errors even if internal calls fail
      expect(() => navigationBridge.getNavigationStatus()).not.toThrow();
      expect(() => navigationBridge.getNeuralStats()).not.toThrow();
      expect(() => navigationBridge.getEnvironmentalStats()).not.toThrow();
    });
  });

  describe('System Integration', () => {
    it('should create all components successfully', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');
      const { neuralTerrainPredictor } = await import('../neural-terrain-predictor');
      const { environmentalDetector } = await import('../environmental-detector');

      const navigationBridge = new NavigationBridge(mockBot);

      expect(navigationBridge).toBeDefined();
      expect(neuralTerrainPredictor).toBeDefined();
      expect(environmentalDetector).toBeDefined();
    });

    it('should provide comprehensive system status', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);

      const navStatus = navigationBridge.getNavigationStatus();
      const neuralStats = navigationBridge.getNeuralStats();
      const environmentalStats = navigationBridge.getEnvironmentalStats();

      expect(navStatus).toBeDefined();
      expect(neuralStats).toBeDefined();
      expect(environmentalStats).toBeDefined();

      // All should have reasonable structure
      expect(typeof navStatus.isNavigating).toBe('boolean');
      expect(typeof neuralStats.neuralStats.patternsAnalyzed).toBe('number');
      expect(typeof environmentalStats.biomesAnalyzed).toBe('number');
    });

    it('should be able to configure all features', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);

      // Enable all features
      navigationBridge.setNeuralPrediction(true);
      navigationBridge.setSocialLearning(true);

      const status = navigationBridge.getNavigationStatus();
      expect(status.neuralEnabled).toBe(true);

      // Disable features
      navigationBridge.setNeuralPrediction(false);
      navigationBridge.setSocialLearning(false);

      const statusAfter = navigationBridge.getNavigationStatus();
      expect(statusAfter.neuralEnabled).toBe(false);
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle multiple rapid method calls', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);

      // Call methods multiple times rapidly
      const startTime = Date.now();
      for (let i = 0; i < 10; i++) {
        navigationBridge.getNavigationStatus();
        navigationBridge.getNeuralStats();
        navigationBridge.getEnvironmentalStats();
      }
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should maintain functionality under load', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);

      // Simulate load
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(navigationBridge.getNavigationStatus());
        promises.push(navigationBridge.getNeuralStats());
        promises.push(navigationBridge.getEnvironmentalStats());
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(15);
      expect(results.every(result => result !== undefined)).toBe(true);
    });

    it('should provide consistent results', async () => {
      const { NavigationBridge } = await import('../navigation-bridge');

      const navigationBridge = new NavigationBridge(mockBot);

      const status1 = navigationBridge.getNavigationStatus();
      const status2 = navigationBridge.getNavigationStatus();
      const stats1 = navigationBridge.getNeuralStats();
      const stats2 = navigationBridge.getNeuralStats();

      // Results should be consistent
      expect(status1.botId).toBe(status2.botId);
      expect(stats1.neuralStats.patternsAnalyzed).toBe(stats2.neuralStats.patternsAnalyzed);
    });
  });
});
