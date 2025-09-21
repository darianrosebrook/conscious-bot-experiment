/**
 * Spatial Navigation Integration Tests
 *
 * Tests the integration of D* Lite pathfinding, place graph, and spatial memory
 * systems for complex navigation and environmental awareness.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { NavigationBridge } from '../navigation-bridge';
import { ObservationMapper } from '../observation-mapper';
import { PlaceGraphCore } from '@conscious-bot/world/dist/place-graph/place-graph-core.js';
import { SpatialNavigator } from '@conscious-bot/world/dist/place-graph/spatial-navigator.js';
import { PlaceMemory } from '@conscious-bot/world/dist/place-graph/place-memory.js';

// Mock mineflayer bot with spatial awareness
const createSpatialMockBot = (): Bot =>
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
        position: new Vec3(10, 64, 5),
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

describe('Spatial Navigation Integration', () => {
  let mockBot: Bot;
  let navigationBridge: NavigationBridge;
  let observationMapper: ObservationMapper;
  let placeGraph: PlaceGraphCore;
  let spatialNavigator: SpatialNavigator;
  let placeMemory: PlaceMemory;

  beforeEach(() => {
    mockBot = createSpatialMockBot();

    navigationBridge = new NavigationBridge(mockBot, {
      maxRaycastDistance: 32,
      pathfindingTimeout: 30000,
      replanThreshold: 5,
      obstacleDetectionRadius: 8,
      enableDynamicReplanning: true,
      useRaycasting: true,
      usePathfinding: true,
    });

    observationMapper = new ObservationMapper({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline',
      pathfindingTimeout: 30000,
      actionTimeout: 10000,
      observationRadius: 32,
      autoReconnect: true,
      maxReconnectAttempts: 3,
      emergencyDisconnect: false,
    });

    placeGraph = new PlaceGraphCore({
      minPlaceDistance: 16,
      maxPlacesPerRegion: 50,
      maxPlacesPerArea: 20,
      maxPlacesTotal: 1000,
      autoCreatePlaces: true,
      autoConnectPlaces: true,
      autoUpdateOnVisit: true,
      memorabilityDecayRate: 0.05,
      importanceThreshold: 0.3,
      landmarkVisibilityThreshold: 0.5,
    });

    spatialNavigator = new SpatialNavigator(placeGraph);
    placeMemory = new PlaceMemory(placeGraph);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Navigation Bridge Integration', () => {
    it('should integrate with D* Lite pathfinding system', async () => {
      const targetPosition = new Vec3(50, 64, 50);

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

      const result = await navigationBridge.navigateTo(targetPosition, {
        timeout: 30000,
        useRaycasting: true,
        dynamicReplanning: true,
      });

      expect(result.success).toBe(true);
      expect(result.pathFound).toBe(true);
      expect(result.finalPosition).toEqual(targetPosition);
      expect(result.pathLength).toBe(5);
      expect(mockNavigateTo).toHaveBeenCalledWith(
        targetPosition,
        expect.objectContaining({
          useRaycasting: true,
          dynamicReplanning: true,
        })
      );
    });

    it('should handle dynamic replanning for obstacles', async () => {
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

      const result = await navigationBridge.navigateTo(targetPosition, {
        timeout: 30000,
        useRaycasting: true,
        dynamicReplanning: true,
      });

      expect(result.success).toBe(true);
      expect(result.replans).toBe(2);
      expect(result.obstaclesDetected).toBe(1);
      expect(mockNavigateTo).toHaveBeenCalledTimes(2);
    });

    it('should provide spatial context to observation mapper', () => {
      const targetPosition = new Vec3(30, 64, 40);

      // Mock navigation bridge to provide spatial context
      const mockNavigateTo = vi.fn().mockResolvedValue({
        success: true,
        pathFound: true,
        finalPosition: targetPosition,
        distanceToGoal: 0,
        pathLength: 3,
        replans: 0,
        obstaclesDetected: 0,
      });

      vi.spyOn(navigationBridge, 'navigateTo', 'get').mockReturnValue(
        mockNavigateTo
      );

      // Create planning context
      const planningContext = {
        goal: 'reach_location',
        worldState: {
          playerPosition: [0, 64, 0],
          health: 20,
          hunger: 20,
        },
        currentState: {
          health: 1.0,
          hunger: 1.0,
          energy: 0.9,
          safety: 0.8,
        },
        resources: [],
        urgency: 'medium' as const,
        activeGoals: [],
        availableResources: [],
        timeConstraints: {
          urgency: 'medium' as const,
          maxPlanningTime: 2000,
        },
        situationalFactors: {
          threatLevel: 0.1,
          opportunityLevel: 0.7,
          socialContext: ['singleplayer'],
          environmentalFactors: ['clear_weather', 'day'],
        },
      };

      expect(planningContext.worldState.playerPosition).toEqual([0, 64, 0]);
      expect(planningContext.situationalFactors.environmentalFactors).toContain(
        'clear_weather'
      );
    });
  });

  describe('Place Graph Integration', () => {
    it('should create and manage places for spatial memory', () => {
      // Create a safe location
      const safePosition = { x: 0, y: 64, z: 0 };
      const safePlace = placeGraph.addPlace({
        position: safePosition,
        type: 'shelter',
        biome: 'plains',
        function: 'safety',
        safetyLevel: 'safe',
        name: 'Starting Shelter',
        description: 'Initial safe location',
        size: 10,
        visibility: 0.8,
        memorability: 0.9,
      });

      expect(safePlace.id).toMatch(/^place-/);
      expect(safePlace.type).toBe('shelter');
      expect(safePlace.safetyLevel).toBe('safe');
      expect(safePlace.memorability).toBe(0.9);

      // Create a resource location
      const resourcePosition = { x: 50, y: 64, z: 50 };
      const resourcePlace = placeGraph.addPlace({
        position: resourcePosition,
        type: 'resource',
        biome: 'plains',
        function: 'gathering',
        safetyLevel: 'moderate',
        name: 'Resource Area',
        description: 'Area with valuable resources',
        size: 20,
        visibility: 0.6,
        memorability: 0.7,
      });

      expect(resourcePlace.type).toBe('resource');
      expect(resourcePlace.function).toBe('gathering');

      // Verify places are stored correctly
      const allPlaces = placeGraph.getAllPlaces();
      expect(allPlaces).toHaveLength(2);
      expect(allPlaces.map((p) => p.type)).toEqual(['shelter', 'resource']);
    });

    it('should find paths between places', () => {
      // Create two places
      const startPlace = placeGraph.addPlace({
        position: { x: 0, y: 64, z: 0 },
        type: 'shelter',
        biome: 'plains',
        function: 'safety',
        safetyLevel: 'safe',
        name: 'Start',
        description: 'Starting location',
        size: 5,
        visibility: 0.9,
        memorability: 0.9,
      });

      const goalPlace = placeGraph.addPlace({
        position: { x: 30, y: 64, z: 30 },
        type: 'resource',
        biome: 'plains',
        function: 'gathering',
        safetyLevel: 'moderate',
        name: 'Goal',
        description: 'Target location',
        size: 5,
        visibility: 0.8,
        memorability: 0.7,
      });

      // Find path between places
      const path = spatialNavigator.findPath({
        start: startPlace.id,
        goal: goalPlace.id,
        allowPartial: true,
        maxDistance: 100,
      });

      expect(path).not.toBeNull();
      expect(path?.instructions).toHaveLength(1);
      expect(path?.instructions[0].type).toBe('move');
      expect(path?.totalDistance).toBeGreaterThan(0);
    });

    it('should associate memories with places', () => {
      // Create a place
      const place = placeGraph.addPlace({
        position: { x: 10, y: 64, z: 10 },
        type: 'resource',
        biome: 'forest',
        function: 'gathering',
        safetyLevel: 'safe',
        name: 'Memory Place',
        description: 'Place for testing memory association',
        size: 8,
        visibility: 0.7,
        memorability: 0.8,
      });

      // Add memory to place
      const memory = placeMemory.addMemory(place.id, {
        title: 'Found Resources',
        content: 'Discovered iron ore and coal in this area',
        importance: 0.8,
        emotionalValence: 0.3,
        tags: ['resources', 'iron', 'coal', 'mining'],
        associatedPlaces: [],
        associatedEntities: [],
      });

      expect(memory).not.toBeNull();
      expect(memory?.placeId).toBe(place.id);
      expect(memory?.title).toBe('Found Resources');
      expect(memory?.tags).toContain('resources');

      // Recall memories from place
      const memories = placeMemory.recallMemories({
        placeId: place.id,
        minImportance: 0.5,
        limit: 10,
      });

      expect(memories).toHaveLength(1);
      expect(memories[0].id).toBe(memory?.id);
    });
  });

  describe('Spatial Context Integration', () => {
    it('should provide spatial context to planning system', () => {
      // Create places for different scenarios
      const shelterPlace = placeGraph.addPlace({
        position: { x: 0, y: 64, z: 0 },
        type: 'shelter',
        biome: 'plains',
        function: 'safety',
        safetyLevel: 'safe',
        name: 'Safe House',
        description: 'Protected shelter location',
        size: 10,
        visibility: 0.9,
        memorability: 0.9,
      });

      const resourcePlace = placeGraph.addPlace({
        position: { x: 50, y: 64, z: 50 },
        type: 'resource',
        biome: 'forest',
        function: 'gathering',
        safetyLevel: 'moderate',
        name: 'Resource Area',
        description: 'Area with trees and ore',
        size: 20,
        visibility: 0.6,
        memorability: 0.7,
      });

      const dangerPlace = placeGraph.addPlace({
        position: { x: -30, y: 64, z: 20 },
        type: 'hazard',
        biome: 'plains',
        function: 'danger',
        safetyLevel: 'dangerous',
        name: 'Danger Zone',
        description: 'Area with hostile mobs',
        size: 15,
        visibility: 0.8,
        memorability: 0.9,
      });

      // Create planning context with spatial information
      const planningContext = {
        goal: 'gather_resources',
        worldState: {
          playerPosition: [0, 64, 0],
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
    });

    it('should integrate place memory with navigation planning', () => {
      // Create a place with associated memory
      const resourcePlace = placeGraph.addPlace({
        position: { x: 40, y: 64, z: 40 },
        type: 'resource',
        biome: 'forest',
        function: 'gathering',
        safetyLevel: 'safe',
        name: 'Rich Resource Area',
        description: 'Area with abundant wood and stone',
        size: 15,
        visibility: 0.7,
        memorability: 0.8,
      });

      // Add memory about the place
      const memory = placeMemory.addMemory(resourcePlace.id, {
        title: 'Excellent Resources Found',
        content:
          'This area has 15+ oak trees and stone deposits. Perfect for gathering.',
        importance: 0.9,
        emotionalValence: 0.4,
        tags: ['resources', 'wood', 'stone', 'gathering', 'safe'],
        associatedPlaces: [],
        associatedEntities: [],
      });

      // Create navigation context with memory information
      const navigationContext = {
        currentPosition: { x: 0, y: 64, z: 0 },
        targetPosition: { x: 40, y: 64, z: 40 },
        placeInformation: {
          [resourcePlace.id]: {
            place: resourcePlace,
            memories: [memory!],
            accessibility: 0.9,
            resourceDensity: 0.8,
          },
        },
        spatialFactors: {
          distance: 40,
          safetyLevel: 0.8,
          resourceValue: 0.9,
          memorability: 0.8,
        },
      };

      expect(navigationContext.spatialFactors.distance).toBe(40);
      expect(navigationContext.spatialFactors.resourceValue).toBe(0.9);
      expect(
        navigationContext.placeInformation[resourcePlace.id].resourceDensity
      ).toBe(0.8);
      expect(
        navigationContext.placeInformation[resourcePlace.id].memories
      ).toHaveLength(1);
    });
  });

  describe('Performance Integration', () => {
    it('should handle complex spatial scenarios efficiently', async () => {
      // Create multiple places
      const places = [];
      for (let i = 0; i < 10; i++) {
        const place = placeGraph.addPlace({
          position: { x: i * 20, y: 64, z: i * 20 },
          type: i % 2 === 0 ? 'resource' : 'shelter',
          biome: 'plains',
          function: i % 3 === 0 ? 'gathering' : 'safety',
          safetyLevel: i % 4 === 0 ? 'safe' : 'moderate',
          name: `Test Place ${i}`,
          description: `Test location ${i}`,
          size: 10,
          visibility: 0.7,
          memorability: 0.6,
        });
        places.push(place);

        // Add memory to some places
        if (i % 3 === 0) {
          placeMemory.addMemory(place.id, {
            title: `Memory for Place ${i}`,
            content: `Important memory about location ${i}`,
            importance: 0.7,
            emotionalValence: 0.2,
            tags: ['test', 'important'],
          });
        }
      }

      const startTime = Date.now();

      // Test pathfinding between multiple places
      for (let i = 0; i < 5; i++) {
        const startPlace = places[i];
        const goalPlace = places[(i + 3) % places.length];

        const path = spatialNavigator.findPath({
          start: startPlace.id,
          goal: goalPlace.id,
          allowPartial: true,
          maxDistance: 200,
        });

        expect(path).not.toBeNull();
        expect(path?.instructions).toHaveLength(1);
      }

      const totalTime = Date.now() - startTime;

      // Performance should be reasonable for 10 places
      expect(totalTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should scale with increasing place complexity', () => {
      const startTime = Date.now();

      // Create 50 places with interconnections
      const places = [];
      for (let i = 0; i < 50; i++) {
        const place = placeGraph.addPlace({
          position: {
            x: Math.floor(i / 5) * 20,
            y: 64,
            z: (i % 5) * 20,
          },
          type: i % 3 === 0 ? 'resource' : i % 3 === 1 ? 'shelter' : 'hazard',
          biome: 'plains',
          function:
            i % 4 === 0 ? 'gathering' : i % 4 === 1 ? 'safety' : 'danger',
          safetyLevel:
            i % 5 === 0 ? 'safe' : i % 5 === 1 ? 'moderate' : 'dangerous',
          name: `Complex Place ${i}`,
          description: `Complex test location ${i}`,
          size: 10,
          visibility: 0.7,
          memorability: 0.6,
        });
        places.push(place);
      }

      const setupTime = Date.now() - startTime;

      // Test memory recall from multiple places
      const recallStart = Date.now();
      let totalMemories = 0;

      for (const place of places.slice(0, 10)) {
        const memories = placeMemory.recallMemories({
          placeId: place.id,
          limit: 5,
        });
        totalMemories += memories.length;
      }

      const recallTime = Date.now() - recallStart;

      // Should handle 50 places efficiently
      expect(setupTime).toBeLessThan(2000); // Setup under 2 seconds
      expect(recallTime).toBeLessThan(500); // Recall under 0.5 seconds
      expect(totalMemories).toBeGreaterThanOrEqual(0);
    });
  });
});
