/**
 * Environmental Detector Tests
 *
 * Tests the Environmental Detector functionality for biome, dimension,
 * weather, and hazard detection.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Vec3 } from 'vec3';

// Import environmental detector after mocking
import { environmentalDetector } from '../environmental-detector';

describe('Environmental Detector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Biome Detection and Analysis', () => {
    it('should detect and analyze different biomes', async () => {
      const plainsState = await environmentalDetector.analyzeEnvironment(
        new Vec3(0, 64, 0)
      );
      const forestState = await environmentalDetector.analyzeEnvironment(
        new Vec3(100, 70, 100)
      );
      const desertState = await environmentalDetector.analyzeEnvironment(
        new Vec3(200, 70, 200)
      );
      const mountainState = await environmentalDetector.analyzeEnvironment(
        new Vec3(300, 120, 300)
      );
      const oceanState = await environmentalDetector.analyzeEnvironment(
        new Vec3(400, 50, 400)
      );

      expect(plainsState.biome.name).toBe('plains');
      expect(forestState.biome.name).toBe('forest');
      expect(desertState.biome.name).toBe('desert');
      expect(mountainState.biome.name).toBe('mountains');
      expect(oceanState.biome.name).toBe('ocean');

      expect(plainsState.biome.type).toBe('overworld');
      expect(forestState.biome.type).toBe('overworld');
      expect(desertState.biome.type).toBe('overworld');
      expect(mountainState.biome.type).toBe('overworld');
      expect(oceanState.biome.type).toBe('overworld');
    });

    it('should provide biome-specific characteristics', async () => {
      const state = await environmentalDetector.analyzeEnvironment(
        new Vec3(0, 64, 0)
      );

      expect(state.biome.temperature).toBeGreaterThanOrEqual(-1);
      expect(state.biome.temperature).toBeLessThanOrEqual(1);
      expect(state.biome.humidity).toBeGreaterThanOrEqual(0);
      expect(state.biome.humidity).toBeLessThanOrEqual(1);
      expect(state.biome.elevation).toBeGreaterThan(0);
      expect(state.biome.navigationDifficulty).toBeGreaterThanOrEqual(0);
      expect(state.biome.navigationDifficulty).toBeLessThanOrEqual(1);
      expect(state.biome.stability).toBeGreaterThanOrEqual(0);
      expect(state.biome.stability).toBeLessThanOrEqual(1);
    });

    it('should identify biome-specific hazards', async () => {
      const plainsHazards = environmentalDetector.detectHazards(
        new Vec3(0, 64, 0)
      );
      const mountainHazards = environmentalDetector.detectHazards(
        new Vec3(300, 120, 300)
      );

      expect(Array.isArray(plainsHazards)).toBe(true);
      expect(Array.isArray(mountainHazards)).toBe(true);

      // Plains should have fewer hazards than mountains
      expect(plainsHazards.length).toBeLessThanOrEqual(mountainHazards.length);
    });

    it('should track biome-specific resources', async () => {
      const state = await environmentalDetector.analyzeEnvironment(
        new Vec3(0, 64, 0)
      );

      expect(state.biome.resources).toBeDefined();
      expect(Array.isArray(state.biome.resources)).toBe(true);
      expect(state.biome.resources.length).toBeGreaterThan(0);
    });
  });

  describe('Dimension Detection', () => {
    it('should detect overworld characteristics', async () => {
      const state = await environmentalDetector.analyzeEnvironment(
        new Vec3(0, 64, 0)
      );

      expect(state.dimension.name).toBe('overworld');
      expect(state.dimension.gravity).toBe(1.0);
      expect(state.dimension.portalRequired).toBe(false);
      expect(state.dimension.navigationRules.flightAllowed).toBe(false);
      expect(state.dimension.navigationRules.teleportationEnabled).toBe(true);
    });

    it('should identify dimension-specific hazards', async () => {
      const state = await environmentalDetector.analyzeEnvironment(
        new Vec3(0, 64, 0)
      );

      expect(state.dimension.hazards).toBeDefined();
      expect(Array.isArray(state.dimension.hazards)).toBe(true);
      expect(state.dimension.hazards.length).toBeGreaterThan(0);
    });

    it('should track dimension-specific resources', async () => {
      const state = await environmentalDetector.analyzeEnvironment(
        new Vec3(0, 64, 0)
      );

      expect(state.dimension.resources).toBeDefined();
      expect(Array.isArray(state.dimension.resources)).toBe(true);
      expect(state.dimension.resources.length).toBeGreaterThan(0);
    });
  });

  describe('Weather Analysis', () => {
    it('should analyze weather conditions', async () => {
      const state = await environmentalDetector.analyzeEnvironment(
        new Vec3(0, 64, 0)
      );

      expect(state.weather.type).toBeDefined();
      expect(['clear', 'rain', 'snow', 'storm', 'fog']).toContain(
        state.weather.type
      );
      expect(state.weather.intensity).toBeGreaterThanOrEqual(0);
      expect(state.weather.intensity).toBeLessThanOrEqual(1);
      expect(state.weather.duration).toBeGreaterThan(0);
    });

    it('should provide weather effects on navigation', async () => {
      const state = await environmentalDetector.analyzeEnvironment(
        new Vec3(0, 64, 0)
      );

      expect(state.weather.effects).toBeDefined();
      expect(state.weather.effects.visibility).toBeGreaterThanOrEqual(0);
      expect(state.weather.effects.visibility).toBeLessThanOrEqual(1);
      expect(state.weather.effects.movementSpeed).toBeGreaterThanOrEqual(0);
      expect(state.weather.effects.movementSpeed).toBeLessThanOrEqual(1);
      expect(state.weather.effects.hazardRisk).toBeGreaterThanOrEqual(0);
      expect(state.weather.effects.hazardRisk).toBeLessThanOrEqual(1);
      expect(state.weather.effects.resourceAvailability).toBeGreaterThanOrEqual(
        0
      );
      expect(state.weather.effects.resourceAvailability).toBeLessThanOrEqual(1);
    });

    it('should predict weather changes', async () => {
      const state = await environmentalDetector.analyzeEnvironment(
        new Vec3(0, 64, 0)
      );

      expect(state.weather.predictedChanges).toBeDefined();
      expect(Array.isArray(state.weather.predictedChanges)).toBe(true);
    });
  });

  describe('Environmental State Integration', () => {
    it('should calculate overall stability scores', async () => {
      const state = await environmentalDetector.analyzeEnvironment(
        new Vec3(0, 64, 0)
      );

      expect(state.stabilityScore).toBeGreaterThanOrEqual(0);
      expect(state.stabilityScore).toBeLessThanOrEqual(1);
      expect(state.navigationScore).toBeGreaterThanOrEqual(0);
      expect(state.navigationScore).toBeLessThanOrEqual(1);
    });

    it('should provide current environmental state', () => {
      const currentState = environmentalDetector.getCurrentState();

      expect(currentState).toBeDefined();
      expect(currentState.biome).toBeDefined();
      expect(currentState.dimension).toBeDefined();
      expect(currentState.weather).toBeDefined();
      expect(currentState.stabilityScore).toBeGreaterThanOrEqual(0);
      expect(currentState.navigationScore).toBeGreaterThanOrEqual(0);
    });

    it('should track environmental statistics', () => {
      const stats = environmentalDetector.getEnvironmentalStats();

      expect(stats).toBeDefined();
      expect(stats.biomesAnalyzed).toBeGreaterThan(0);
      expect(stats.dimensionsDetected).toBeGreaterThan(0);
      expect(stats.weatherPatterns).toBeGreaterThanOrEqual(0);
      expect(stats.hazardsDetected).toBeGreaterThan(0);
      expect(stats.averageStability).toBeGreaterThanOrEqual(0);
      expect(stats.averageStability).toBeLessThanOrEqual(1);
    });

    it('should handle position-based environmental analysis', async () => {
      const positions = [
        new Vec3(0, 64, 0), // Plains
        new Vec3(100, 70, 100), // Forest
        new Vec3(200, 70, 200), // Desert
        new Vec3(300, 120, 300), // Mountains
        new Vec3(400, 50, 400), // Ocean
      ];

      for (const position of positions) {
        const state = await environmentalDetector.analyzeEnvironment(position);

        expect(state).toBeDefined();
        expect(state.position).toEqual(position);
        expect(state.biome.name).toBeDefined();
        expect(state.dimension.name).toBeDefined();
        expect(state.weather.type).toBeDefined();
        expect(state.stabilityScore).toBeGreaterThanOrEqual(0);
        expect(state.navigationScore).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Hazard Detection', () => {
    it('should detect environmental hazards at positions', () => {
      const hazards = environmentalDetector.detectHazards(new Vec3(0, 64, 0));

      expect(hazards).toBeDefined();
      expect(Array.isArray(hazards)).toBe(true);

      // Each hazard should have required properties
      hazards.forEach((hazard) => {
        expect(hazard.type).toBeDefined();
        expect(hazard.position).toBeDefined();
        expect(hazard.severity).toMatch(/^(low|medium|high)$/);
        expect(hazard.description).toBeDefined();
        expect(hazard.avoidanceDistance).toBeGreaterThan(0);
      });
    });

    it('should provide hazard-specific information', () => {
      const hazards = environmentalDetector.detectHazards(new Vec3(0, 64, 0));

      hazards.forEach((hazard) => {
        expect(hazard.type).toBeDefined();
        expect(hazard.severity).toMatch(/^(low|medium|high)$/);
        expect(hazard.description).toBeDefined();
        expect(typeof hazard.avoidanceDistance).toBe('number');
        expect(hazard.avoidanceDistance).toBeGreaterThan(0);
      });
    });

    it('should handle different hazard severities', () => {
      const hazards = environmentalDetector.detectHazards(new Vec3(0, 64, 0));

      const severities = hazards.map((h) => h.severity);
      expect(severities).toContain('low');
      expect(severities).toContain('medium');
      expect(severities).toContain('high');
    });
  });

  describe('System Monitoring and Control', () => {
    it('should start and stop monitoring', () => {
      environmentalDetector.startMonitoring(5000);
      environmentalDetector.stopMonitoring();

      // Should be able to restart monitoring
      environmentalDetector.startMonitoring(3000);
    });

    it('should provide environmental state updates', async () => {
      const initialState = await environmentalDetector.analyzeEnvironment(
        new Vec3(0, 64, 0)
      );
      const updatedState = await environmentalDetector.analyzeEnvironment(
        new Vec3(100, 64, 100)
      );

      expect(initialState).toBeDefined();
      expect(updatedState).toBeDefined();
      expect(initialState.position).not.toEqual(updatedState.position);
    });

    it('should handle environmental state continuity', () => {
      const currentState = environmentalDetector.getCurrentState();

      expect(currentState).toBeDefined();
      expect(currentState.biome).toBeDefined();
      expect(currentState.dimension).toBeDefined();
      expect(currentState.weather).toBeDefined();
    });
  });

  describe('Performance and Efficiency', () => {
    it('should handle multiple environmental analyses efficiently', async () => {
      const startTime = Date.now();

      const positions = Array.from(
        { length: 5 },
        (_, i) => new Vec3(i * 50, 64, i * 50)
      );

      for (const position of positions) {
        await environmentalDetector.analyzeEnvironment(position);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete 5 analyses in reasonable time
      expect(totalTime).toBeLessThan(1000); // Less than 1 second for 5 analyses
    });

    it('should provide consistent environmental data', async () => {
      const position = new Vec3(0, 64, 0);

      const state1 = await environmentalDetector.analyzeEnvironment(position);
      const state2 = await environmentalDetector.analyzeEnvironment(position);

      // Same position should generally have similar environmental characteristics
      expect(state1.biome.name).toBe(state2.biome.name);
      expect(state1.dimension.name).toBe(state2.dimension.name);
      expect(state1.weather.type).toBe(state2.weather.type);
    });

    it('should maintain environmental state accuracy', async () => {
      const position = new Vec3(100, 70, 100); // Forest position

      const state = await environmentalDetector.analyzeEnvironment(position);

      expect(state).toBeDefined();
      expect(state.biome.name).toBe('forest');
      expect(state.biome.hazards).toContain('dense_vegetation');
      expect(state.biome.hazards).toContain('wildlife');
      expect(state.biome.resources).toContain('wood');
    });
  });
});
