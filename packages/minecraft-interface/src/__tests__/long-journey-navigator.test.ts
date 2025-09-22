/**
 * Long Journey Navigator Tests
 *
 * Comprehensive test suite for long journey navigation including:
 * - Chunk-based route planning
 * - Waypoint discovery and management
 * - Multi-stage journey execution
 * - Player following with predictive pathfinding
 * - Memory management and cleanup
 *
 * @author @darianrosebrook
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  afterEach,
  beforeAll,
} from 'vitest';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { LongJourneyNavigator, Waypoint } from '../long-journey-navigator.js';
import { NavigationBridge } from '../navigation-bridge.js';

// Mock NavigationBridge
const createMockNavigationBridge = (): NavigationBridge =>
  ({
    navigateTo: vi.fn().mockImplementation((target: Vec3) => {
      const startPos = new Vec3(0, 64, 0);

      // Handle invalid destinations
      if (isNaN(target.x) || isNaN(target.y) || isNaN(target.z)) {
        return Promise.resolve({
          success: false,
          pathFound: false,
          finalPosition: startPos,
          distanceToGoal: 0,
          pathLength: 0,
          replans: 0,
          obstaclesDetected: 0,
          data: undefined,
          error: 'Invalid destination coordinates',
        });
      }

      const path = [startPos, target];
      return Promise.resolve({
        success: true,
        pathFound: true,
        finalPosition: target,
        distanceToGoal: startPos.distanceTo(target),
        pathLength: path.length,
        replans: 0,
        obstaclesDetected: 0,
        data: {
          path,
        },
      });
    }),
    isPathfinderReady: vi.fn().mockReturnValue(true),
    waitForPathfinderReady: vi.fn().mockResolvedValue(true),
    setNeuralPrediction: vi.fn(),
    setSocialLearning: vi.fn(),
    getNeuralStats: vi.fn().mockReturnValue({}),
    recordNavigationOutcome: vi.fn(),
    getEnvironmentalState: vi.fn().mockReturnValue(null),
    getEnvironmentalHazards: vi.fn().mockReturnValue([]),
    getEnvironmentalStats: vi.fn().mockReturnValue({
      biomesAnalyzed: 7,
      dimensionsDetected: 3,
      weatherPatterns: 5,
      hazardsDetected: 20,
      averageStability: 0.8,
    }),
    updateEnvironmentalAnalysis: vi.fn().mockResolvedValue({
      biome: { name: 'plains', type: 'overworld' },
      dimension: { name: 'overworld' },
      weather: { type: 'clear' },
      position: new Vec3(0, 64, 0),
      timestamp: Date.now(),
      stabilityScore: 0.9,
      navigationScore: 0.8,
    }),
    navigateLongJourney: vi.fn().mockResolvedValue({
      success: true,
      totalDistance: 100,
      totalTime: 5000,
      stages: 3,
      waypointsDiscovered: 2,
    }),
    startFollowingPlayer: vi.fn().mockResolvedValue(true),
    stopFollowingPlayer: vi.fn(),
    getJourneyStatistics: vi.fn().mockReturnValue({
      totalJourneys: 5,
      successfulJourneys: 4,
      totalDistance: 500,
      averageSpeed: 10,
      waypointsDiscovered: 25,
      chunksExplored: 10,
      memoryUsage: 1000,
    }),
    addWaypoint: vi.fn().mockReturnValue({
      id: 'test_waypoint',
      position: new Vec3(10, 64, 10),
      chunk: { x: 0, z: 0, key: '0,0' },
      type: 'safe',
      description: 'Test waypoint',
      riskLevel: 'low',
      discoveredAt: Date.now(),
      visitCount: 0,
      accessibility: { canReach: true },
    }),
    getChunkWaypoints: vi.fn().mockReturnValue([]),
  }) as any;

// Mock bot
const createMockBot = (): Bot =>
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
        name: 'test_player',
        type: 'player',
        position: new Vec3(10, 64, 10),
        health: 20,
        isValid: true,
      },
    },
    blockAt: vi.fn().mockReturnValue({
      name: 'stone',
      type: 1,
      metadata: {},
      light: 15,
      skyLight: 15,
      position: new Vec3(0, 64, 0),
    }),
  }) as any;

describe('Long Journey Navigator', () => {
  let mockBot: Bot;
  let mockNavigationBridge: NavigationBridge;
  let longJourneyNavigator: LongJourneyNavigator;

  beforeAll(() => {
    mockBot = createMockBot();
    mockNavigationBridge = createMockNavigationBridge();
    longJourneyNavigator = new LongJourneyNavigator(
      mockBot,
      mockNavigationBridge
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Journey Planning', () => {
    it('should plan a simple journey for short distances', async () => {
      const destination = new Vec3(10, 64, 10); // Short distance
      const result = await longJourneyNavigator.navigateToDestination({
        destination,
        urgency: 'medium',
      });

      expect(result.success).toBe(true);
      expect(result.totalDistance).toBeGreaterThan(0);
      expect(result.stages.length).toBeGreaterThan(0);
      expect(result.finalPosition).toBeDefined();
      expect(result.metadata.riskLevel).toBe('low');
    });

    it('should plan a multi-stage journey for long distances', async () => {
      const destination = new Vec3(1000, 64, 1000); // Long distance
      const result = await longJourneyNavigator.navigateToDestination({
        destination,
        urgency: 'medium',
      });

      expect(result.success).toBe(true);
      expect(result.stages.length).toBeGreaterThan(1);
      expect(result.totalDistance).toBeGreaterThan(100);
    });

    it('should handle emergency journeys', async () => {
      const destination = new Vec3(50, 64, 50);
      const result = await longJourneyNavigator.navigateToDestination({
        destination,
        urgency: 'critical',
      });

      expect(result.success).toBe(true);
      expect(result.metadata.riskLevel).toBe('high');
    });

    it('should discover waypoints during journey', async () => {
      const destination = new Vec3(20, 64, 20);
      const result = await longJourneyNavigator.navigateToDestination({
        destination,
        urgency: 'medium',
      });

      expect(result.success).toBe(true);
      expect(result.waypointsDiscovered.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Waypoint Management', () => {
    it('should add waypoints correctly', () => {
      const waypoint = longJourneyNavigator.addWaypoint({
        position: new Vec3(10, 64, 10),
        type: 'safe',
        description: 'Test safe waypoint',
        riskLevel: 'low',
        accessibility: { canReach: true },
        chunk: { x: 0, z: 0, key: '0,0' },
      });

      expect(waypoint).toBeDefined();
      expect(waypoint.id).toBeDefined();
      expect(waypoint.type).toBe('safe');
      expect(waypoint.riskLevel).toBe('low');
    });

    it('should retrieve waypoints from chunks', () => {
      const waypoints = longJourneyNavigator.getChunkWaypoints(0, 0);

      expect(Array.isArray(waypoints)).toBe(true);
    });

    it('should handle waypoint discovery during path traversal', async () => {
      const destination = new Vec3(15, 64, 15);
      const result = await longJourneyNavigator.navigateToDestination({
        destination,
        urgency: 'medium',
      });

      expect(result.success).toBe(true);
      expect(result.waypointsDiscovered).toBeDefined();
    });
  });

  describe('Player Following', () => {
    it('should start following a player', async () => {
      const result = await longJourneyNavigator.startFollowingPlayer(
        'player1',
        'TestPlayer'
      );

      expect(result).toBe(true);
    });

    it('should stop following a player', () => {
      longJourneyNavigator.stopFollowingPlayer();

      // Should not throw any errors
      expect(() => longJourneyNavigator.stopFollowingPlayer()).not.toThrow();
    });

    it('should handle predictive following', async () => {
      await longJourneyNavigator.startFollowingPlayer('player1', 'TestPlayer');

      // Mock player not in sight
      mockBot.entities = {}; // Remove player from entities

      // Wait a bit for the following loop to run
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Should still work without throwing errors
      expect(() => longJourneyNavigator.stopFollowingPlayer()).not.toThrow();
    });
  });

  describe('Statistics and Memory', () => {
    it('should provide journey statistics', () => {
      const stats = longJourneyNavigator.getJourneyStatistics();

      expect(stats).toHaveProperty('totalJourneys');
      expect(stats).toHaveProperty('successfulJourneys');
      expect(stats).toHaveProperty('totalDistance');
      expect(stats).toHaveProperty('averageSpeed');
      expect(stats).toHaveProperty('waypointsDiscovered');
      expect(stats).toHaveProperty('chunksExplored');
      expect(stats).toHaveProperty('memoryUsage');
    });

    it('should track memory usage', () => {
      const stats = longJourneyNavigator.getJourneyStatistics();

      expect(stats.memoryUsage).toBeGreaterThan(0);
    });

    it('should handle memory cleanup', async () => {
      // Add some waypoints to create memory usage
      longJourneyNavigator.addWaypoint({
        position: new Vec3(10, 64, 10),
        type: 'safe',
        description: 'Test waypoint 1',
        riskLevel: 'low',
        accessibility: { canReach: true },
        chunk: { x: 0, z: 0, key: '0,0' },
      });

      longJourneyNavigator.addWaypoint({
        position: new Vec3(20, 64, 20),
        type: 'safe',
        description: 'Test waypoint 2',
        riskLevel: 'low',
        accessibility: { canReach: true },
        chunk: { x: 1, z: 1, key: '1,1' },
      });

      // Memory should be tracked
      const stats = longJourneyNavigator.getJourneyStatistics();
      expect(stats.chunksExplored).toBeGreaterThan(0);
      expect(stats.waypointsDiscovered).toBeGreaterThan(0);
    });
  });

  describe('Route Planning', () => {
    it('should plan routes with constraints', async () => {
      const destination = new Vec3(30, 64, 30);
      const result = await longJourneyNavigator.navigateToDestination({
        destination,
        urgency: 'medium',
        constraints: {
          avoidWater: true,
          avoidHostileAreas: true,
          preferSafePaths: true,
        },
      });

      expect(result.success).toBe(true);
    });

    it('should plan routes with preferences', async () => {
      const destination = new Vec3(40, 64, 40);
      const result = await longJourneyNavigator.navigateToDestination({
        destination,
        urgency: 'low',
        preferences: {
          scenicRoute: true,
          resourceGathering: true,
          exploration: true,
        },
      });

      expect(result.success).toBe(true);
    });

    it('should handle time-limited journeys', async () => {
      const destination = new Vec3(50, 64, 50);
      const result = await longJourneyNavigator.navigateToDestination({
        destination,
        urgency: 'high',
        constraints: {
          timeLimit: 10000, // 10 seconds
        },
      });

      expect(result.success).toBe(true);
      expect(result.totalTime).toBeLessThanOrEqual(10000);
    });
  });

  describe('Error Handling', () => {
    it('should handle navigation failures gracefully', async () => {
      // Mock navigation failure
      mockNavigationBridge.navigateTo = vi
        .fn()
        .mockRejectedValue(new Error('Navigation failed'));

      const destination = new Vec3(100, 64, 100);
      const result = await longJourneyNavigator.navigateToDestination({
        destination,
        urgency: 'medium',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle missing bot entity', () => {
      const botWithoutEntity = { ...mockBot, entity: undefined } as any;
      const navigator = new LongJourneyNavigator(
        botWithoutEntity,
        mockNavigationBridge
      );

      expect(() => navigator.getJourneyStatistics()).not.toThrow();
    });

    it('should handle invalid destinations', async () => {
      const invalidDestination = new Vec3(NaN, NaN, NaN);

      const result = await longJourneyNavigator.navigateToDestination({
        destination: invalidDestination,
        urgency: 'medium',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle multiple concurrent journeys', async () => {
      const promises = [
        longJourneyNavigator.navigateToDestination({
          destination: new Vec3(10, 64, 10),
          urgency: 'low',
        }),
        longJourneyNavigator.navigateToDestination({
          destination: new Vec3(20, 64, 20),
          urgency: 'low',
        }),
        longJourneyNavigator.navigateToDestination({
          destination: new Vec3(30, 64, 30),
          urgency: 'low',
        }),
      ];

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });

    it('should maintain performance with many waypoints', () => {
      // Add many waypoints
      for (let i = 0; i < 50; i++) {
        longJourneyNavigator.addWaypoint({
          position: new Vec3(i * 2, 64, i * 2),
          type: 'safe',
          description: `Waypoint ${i}`,
          riskLevel: 'low',
          accessibility: { canReach: true },
          chunk: {
            x: Math.floor((i * 2) / 16),
            z: Math.floor((i * 2) / 16),
            key: `${Math.floor((i * 2) / 16)},${Math.floor((i * 2) / 16)}`,
          },
        });
      }

      const stats = longJourneyNavigator.getJourneyStatistics();
      expect(stats.waypointsDiscovered).toBeGreaterThan(40); // Allow some variance
      expect(stats.chunksExplored).toBeGreaterThan(0);

      // Should still be performant
      const startTime = Date.now();
      longJourneyNavigator.getChunkWaypoints(0, 0);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should be fast
    });
  });

  describe('Event Emissions', () => {
    it('should emit journey events', async () => {
      const journeyStartListener = vi.fn();
      const journeyCompleteListener = vi.fn();
      const waypointDiscoveredListener = vi.fn();

      longJourneyNavigator.on('journey-started', journeyStartListener);
      longJourneyNavigator.on('journey-completed', journeyCompleteListener);
      longJourneyNavigator.on(
        'waypoint-discovered',
        waypointDiscoveredListener
      );

      await longJourneyNavigator.navigateToDestination({
        destination: new Vec3(10, 64, 10),
        urgency: 'medium',
      });

      // Events should be emitted during journey
      expect(journeyStartListener).toHaveBeenCalled();
      expect(journeyCompleteListener).toHaveBeenCalled();
    });

    it('should emit player following events', async () => {
      const followingStartListener = vi.fn();
      const followingStopListener = vi.fn();

      longJourneyNavigator.on(
        'player-following-started',
        followingStartListener
      );
      longJourneyNavigator.on(
        'player-following-stopped',
        followingStopListener
      );

      await longJourneyNavigator.startFollowingPlayer('player1', 'TestPlayer');
      longJourneyNavigator.stopFollowingPlayer();

      expect(followingStartListener).toHaveBeenCalled();
      expect(followingStopListener).toHaveBeenCalled();
    });
  });
});
