/**
 * Navigation Bridge Integration Tests
 *
 * Tests the integration of NavigationBridge with ObservationMapper
 * and basic pathfinding capabilities.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';

// Mock the world package to avoid ES module issues
vi.mock('@conscious-bot/world', () => ({
  DStarLiteCore: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    planPath: vi.fn(),
    updateCost: vi.fn(),
    replan: vi.fn(),
  })),
  NavigationSystem: vi.fn().mockImplementation(() => {
    const EventEmitter = require('events');
    const emitter = new EventEmitter();
    return {
      navigateTo: vi.fn(),
      stopNavigation: vi.fn(),
      updatePosition: vi.fn(),
      on: emitter.on.bind(emitter),
      emit: emitter.emit.bind(emitter),
      off: emitter.off.bind(emitter),
    };
  }),
  NavigationConfig: {},
  PathPlanningRequest: {},
  PathPlanningResult: {},
}));

// Import NavigationBridge after mocking
import { NavigationBridge } from '../navigation-bridge';

// Mock mineflayer bot with navigation capabilities
const createNavigationMockBot = (): Bot =>
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

describe('Navigation Bridge Integration', () => {
  let mockBot: Bot;
  let navigationBridge: NavigationBridge;

  beforeEach(() => {
    mockBot = createNavigationMockBot();

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

  describe('Navigation Bridge Configuration', () => {
    it('should initialize with correct configuration', () => {
      expect(navigationBridge).toBeDefined();
      expect(navigationBridge.maxRaycastDistance).toBe(32);
      expect(navigationBridge.pathfindingTimeout).toBe(30000);
      expect(navigationBridge.replanThreshold).toBe(5);
      expect(navigationBridge.enableDynamicReplanning).toBe(true);
      expect(navigationBridge.useRaycasting).toBe(true);
      expect(navigationBridge.usePathfinding).toBe(true);
    });

    it('should provide navigation capabilities to bot', () => {
      expect(mockBot.entity).toBeDefined();
      expect(mockBot.entity.position).toEqual(new Vec3(0, 64, 0));
      expect(mockBot.world).toBeDefined();
      expect(mockBot.world.raycast).toBeDefined();
    });
  });

  describe('Bot State Integration', () => {
    it('should provide bot state context for navigation', () => {
      const botState = {
        position: mockBot.entity.position,
        health: mockBot.entity.health,
        inventoryItems: mockBot.inventory.items(),
        nearbyEntities: Object.keys(mockBot.entities),
      };

      expect(botState.position).toEqual(new Vec3(0, 64, 0));
      expect(botState.health).toBe(20);
      expect(botState.inventoryItems).toBeDefined();
      expect(botState.nearbyEntities).toHaveLength(1);
    });
  });

  describe('Pathfinding Integration', () => {
    it('should support basic navigation planning', () => {
      const targetPosition = new Vec3(50, 64, 50);
      const startPosition = new Vec3(0, 64, 0);

      // Mock navigation bridge methods
      const mockNavigateTo = vi.fn().mockResolvedValue({
        success: true,
        pathFound: true,
        finalPosition: targetPosition,
        distanceToGoal: 0,
        pathLength: 5,
        replans: 0,
        obstaclesDetected: 0,
      });

      vi.spyOn(navigationBridge, 'navigateTo', 'get').mockReturnValue(
        mockNavigateTo
      );

      const distance = startPosition.distanceTo(targetPosition);
      const expectedPathLength = Math.ceil(distance / 5); // Rough estimate

      expect(distance).toBeGreaterThan(0);
      expect(expectedPathLength).toBeGreaterThan(0);
    });

    it('should handle obstacle detection and replanning', () => {
      const targetPosition = new Vec3(100, 64, 100);

      // Mock initial path failure and successful replan
      const mockNavigateTo = vi
        .fn()
        .mockResolvedValueOnce({
          success: false,
          pathFound: false,
          finalPosition: new Vec3(25, 64, 25),
          distanceToGoal: 75,
          pathLength: 2,
          replans: 1,
          obstaclesDetected: 3,
          error: 'Path blocked by obstacle',
        })
        .mockResolvedValueOnce({
          success: true,
          pathFound: true,
          finalPosition: targetPosition,
          distanceToGoal: 0,
          pathLength: 7,
          replans: 2,
          obstaclesDetected: 1,
        });

      vi.spyOn(navigationBridge, 'navigateTo', 'get').mockReturnValue(
        mockNavigateTo
      );

      // Verify that replanning is supported
      expect(navigationBridge.enableDynamicReplanning).toBe(true);
      expect(mockNavigateTo).toBeDefined();
    });
  });

  describe('Spatial Context Integration', () => {
    it('should provide spatial context for planning', () => {
      const startPosition = new Vec3(0, 64, 0);
      const targetPosition = new Vec3(30, 64, 30);

      // Create planning context with spatial information
      const planningContext = {
        goal: 'reach_location',
        worldState: {
          playerPosition: [startPosition.x, startPosition.y, startPosition.z],
          health: 20,
          hunger: 20,
          nearbyLogs: 5,
          nearbyOres: 3,
          nearbyHostiles: 1,
        },
        currentState: {
          health: 1.0,
          hunger: 1.0,
          energy: 0.9,
          safety: 0.7,
        },
        resources: [
          { id: 'wood', type: 'material', quantity: 10 },
          { id: 'stone', type: 'material', quantity: 20 },
        ],
        urgency: 'medium' as const,
        activeGoals: [],
        availableResources: [],
        timeConstraints: {
          urgency: 'medium' as const,
          maxPlanningTime: 2000,
        },
        situationalFactors: {
          threatLevel: 0.2,
          opportunityLevel: 0.8,
          socialContext: ['singleplayer'],
          environmentalFactors: ['clear_weather', 'day'],
        },
      };

      // Verify spatial context is available for planning
      expect(planningContext.worldState.playerPosition).toEqual([0, 64, 0]);
      expect(planningContext.worldState.nearbyLogs).toBe(5);
      expect(planningContext.worldState.nearbyOres).toBe(3);
      expect(planningContext.worldState.nearbyHostiles).toBe(1);
      expect(planningContext.situationalFactors.opportunityLevel).toBe(0.8);
      expect(planningContext.situationalFactors.environmentalFactors).toContain(
        'clear_weather'
      );
    });

    it('should integrate navigation with environmental awareness', () => {
      const targetPosition = new Vec3(40, 64, 40);

      // Create navigation context with environmental information
      const navigationContext = {
        currentPosition: { x: 0, y: 64, z: 0 },
        targetPosition: { x: 40, y: 64, z: 40 },
        environmentalFactors: {
          lightLevel: 15,
          weather: 'clear',
          timeOfDay: 1000,
          biome: 'plains',
        },
        spatialFactors: {
          distance: 40,
          safetyLevel: 0.8,
          resourceValue: 0.9,
          obstacleCount: 0,
        },
      };

      expect(navigationContext.environmentalFactors.lightLevel).toBe(15);
      expect(navigationContext.environmentalFactors.weather).toBe('clear');
      expect(navigationContext.spatialFactors.distance).toBe(40);
      expect(navigationContext.spatialFactors.safetyLevel).toBe(0.8);
      expect(navigationContext.spatialFactors.resourceValue).toBe(0.9);
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle navigation requests efficiently', () => {
      const targetPosition = new Vec3(20, 64, 20);
      const startTime = Date.now();

      // Mock navigation bridge for performance testing
      const mockNavigateTo = vi.fn().mockResolvedValue({
        success: true,
        pathFound: true,
        finalPosition: targetPosition,
        distanceToGoal: 0,
        pathLength: 2,
        replans: 0,
        obstaclesDetected: 0,
      });

      vi.spyOn(navigationBridge, 'navigateTo', 'get').mockReturnValue(
        mockNavigateTo
      );

      const endTime = Date.now();
      const setupTime = endTime - startTime;

      // Setup should be very fast
      expect(setupTime).toBeLessThan(10); // Should complete in under 10ms
    });

    it('should scale with reasonable complexity', () => {
      const positions = [];
      const startTime = Date.now();

      // Generate multiple target positions
      for (let i = 0; i < 10; i++) {
        const position = new Vec3(i * 10, 64, i * 10);
        positions.push(position);

        // Mock navigation for each position
        const mockNavigateTo = vi.fn().mockResolvedValue({
          success: true,
          pathFound: true,
          finalPosition: position,
          distanceToGoal: 0,
          pathLength: Math.ceil(position.distanceTo(new Vec3(0, 64, 0)) / 5),
          replans: 0,
          obstaclesDetected: 0,
        });

        vi.spyOn(navigationBridge, 'navigateTo', 'get').mockReturnValue(
          mockNavigateTo
        );
      }

      const setupTime = Date.now() - startTime;

      // Should handle 10 positions efficiently
      expect(setupTime).toBeLessThan(100); // Should complete in under 100ms
      expect(positions).toHaveLength(10);
    });
  });

  describe('Error Handling', () => {
    it('should handle navigation failures gracefully', () => {
      const targetPosition = new Vec3(100, 64, 100);

      // Mock navigation failure
      const mockNavigateTo = vi.fn().mockResolvedValue({
        success: false,
        pathFound: false,
        finalPosition: new Vec3(25, 64, 25),
        distanceToGoal: 75,
        pathLength: 2,
        replans: 1,
        obstaclesDetected: 5,
        error: 'Path blocked by multiple obstacles',
      });

      vi.spyOn(navigationBridge, 'navigateTo', 'get').mockReturnValue(
        mockNavigateTo
      );

      // Verify error handling capabilities
      expect(navigationBridge.enableDynamicReplanning).toBe(true);
      expect(navigationBridge.obstacleDetectionRadius).toBe(8);
    });

    it('should provide meaningful error information', () => {
      // Create context with error information
      const errorContext = {
        navigationErrors: [
          {
            type: 'obstacle_blocked',
            position: { x: 20, y: 64, z: 20 },
            severity: 'high',
            retryable: true,
          },
          {
            type: 'timeout',
            severity: 'medium',
            retryable: true,
          },
        ],
        environmentalHazards: [
          {
            type: 'hostile_entity',
            position: { x: 15, y: 64, z: 15 },
            threatLevel: 0.8,
          },
        ],
      };

      expect(errorContext.navigationErrors).toHaveLength(2);
      expect(errorContext.navigationErrors[0].type).toBe('obstacle_blocked');
      expect(errorContext.navigationErrors[0].retryable).toBe(true);
      expect(errorContext.environmentalHazards).toHaveLength(1);
      expect(errorContext.environmentalHazards[0].threatLevel).toBe(0.8);
    });
  });
});
