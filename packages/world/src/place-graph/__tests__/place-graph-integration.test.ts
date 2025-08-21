/**
 * Place Graph Integration Test
 * 
 * Tests the integration of place graph core, place memory, and spatial navigator
 * components for spatial memory and navigation.
 * 
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  PlaceGraphCore, 
  PlaceMemory, 
  SpatialNavigator,
  PlaceType,
  BiomeCategory,
  PlaceFunction,
  SafetyLevel,
  EdgeType,
  Vector3,
} from '../index';

describe('Place Graph Integration', () => {
  let placeGraphCore: PlaceGraphCore;
  let placeMemory: PlaceMemory;
  let spatialNavigator: SpatialNavigator;

  beforeEach(() => {
    placeGraphCore = new PlaceGraphCore();
    placeMemory = new PlaceMemory(placeGraphCore);
    spatialNavigator = new SpatialNavigator(placeGraphCore);
  });

  describe('Place Graph Core', () => {
    it('should add and retrieve places', () => {
      const place = placeGraphCore.addPlace({
        name: 'Home Base',
        type: PlaceType.LOCATION,
        position: { x: 100, y: 64, z: 100 },
        biome: BiomeCategory.PLAINS,
        function: PlaceFunction.HOME,
        safety: SafetyLevel.SAFE,
        landmarks: [
          {
            id: 'landmark-1',
            name: 'Tall Oak Tree',
            position: { x: 105, y: 70, z: 95 },
            type: 'tree',
            description: 'A distinctive tall oak tree',
            visibility: 0.8,
            memorability: 0.7,
          }
        ],
        resources: [
          {
            id: 'resource-1',
            type: 'wood',
            quantity: 100,
            renewable: true,
            position: { x: 105, y: 64, z: 95 },
            description: 'Oak wood from nearby trees',
          }
        ],
        tags: ['home', 'base', 'safe'],
        description: 'Main home base with crafting stations',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        children: [],
        importance: 0.9,
        memorability: 0.8,
        accessibility: 0.9,
      });
      
      expect(place).toBeDefined();
      expect(place.id).toBeDefined();
      
      const retrievedPlace = placeGraphCore.getPlace(place.id);
      expect(retrievedPlace).toBeDefined();
      expect(retrievedPlace?.name).toBe('Home Base');
    });

    it('should create hierarchical place relationships', () => {
      // Create parent place
      const regionPlace = placeGraphCore.addPlace({
        name: 'Forest Region',
        type: PlaceType.REGION,
        position: { x: 500, y: 64, z: 500 },
        biome: BiomeCategory.FOREST,
        function: PlaceFunction.EXPLORATION,
        safety: SafetyLevel.NEUTRAL,
        landmarks: [],
        resources: [],
        tags: ['forest', 'region'],
        description: 'Large forest region with various areas',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        children: [],
        importance: 0.7,
        memorability: 0.6,
        accessibility: 0.7,
      });
      
      // Create child place
      const areaPlace = placeGraphCore.addPlace({
        name: 'Forest Clearing',
        type: PlaceType.AREA,
        position: { x: 550, y: 64, z: 550 },
        biome: BiomeCategory.FOREST,
        function: PlaceFunction.RESOURCE,
        safety: SafetyLevel.SAFE,
        landmarks: [],
        resources: [],
        tags: ['clearing', 'forest'],
        description: 'A clearing in the forest',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        parent: regionPlace.id,
        children: [],
        importance: 0.6,
        memorability: 0.5,
        accessibility: 0.8,
      });
      
      // Create grandchild place
      const locationPlace = placeGraphCore.addPlace({
        name: 'Berry Bush',
        type: PlaceType.POINT,
        position: { x: 555, y: 64, z: 555 },
        biome: BiomeCategory.FOREST,
        function: PlaceFunction.RESOURCE,
        safety: SafetyLevel.SAFE,
        landmarks: [],
        resources: [
          {
            id: 'resource-berries',
            type: 'berries',
            quantity: 20,
            renewable: true,
            position: { x: 555, y: 64, z: 555 },
            description: 'Wild berries that can be harvested',
          }
        ],
        tags: ['berries', 'food'],
        description: 'A bush with edible berries',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        parent: areaPlace.id,
        children: [],
        importance: 0.4,
        memorability: 0.5,
        accessibility: 0.9,
      });
      
      // Check parent-child relationships
      expect(regionPlace.children).toContain(areaPlace.id);
      expect(areaPlace.children).toContain(locationPlace.id);
      
      // Get child places
      const regionChildren = placeGraphCore.getChildPlaces(regionPlace.id);
      expect(regionChildren).toHaveLength(1);
      expect(regionChildren[0].id).toBe(areaPlace.id);
      
      const areaChildren = placeGraphCore.getChildPlaces(areaPlace.id);
      expect(areaChildren).toHaveLength(1);
      expect(areaChildren[0].id).toBe(locationPlace.id);
    });

    it('should connect places with edges', () => {
      // Create two places
      const place1 = placeGraphCore.addPlace({
        name: 'Village',
        type: PlaceType.AREA,
        position: { x: 200, y: 64, z: 200 },
        biome: BiomeCategory.PLAINS,
        function: PlaceFunction.HOME,
        safety: SafetyLevel.SAFE,
        landmarks: [],
        resources: [],
        tags: ['village'],
        description: 'A small village',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        children: [],
        importance: 0.8,
        memorability: 0.7,
        accessibility: 0.9,
      });
      
      const place2 = placeGraphCore.addPlace({
        name: 'Mine',
        type: PlaceType.LOCATION,
        position: { x: 300, y: 40, z: 250 },
        biome: BiomeCategory.UNDERGROUND,
        function: PlaceFunction.RESOURCE,
        safety: SafetyLevel.DANGEROUS,
        landmarks: [],
        resources: [],
        tags: ['mine', 'cave'],
        description: 'A dangerous mine with resources',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        children: [],
        importance: 0.7,
        memorability: 0.8,
        accessibility: 0.4,
      });
      
      // Connect them with an edge
      const edge = placeGraphCore.addEdge({
        source: place1.id,
        target: place2.id,
        type: EdgeType.PATH,
        distance: 150,
        travelTime: 30,
        difficulty: 0.5,
        bidirectional: true,
        description: 'Path from village to mine',
        lastTraversed: Date.now(),
        traversalCount: 1,
        waypoints: [
          { x: 200, y: 64, z: 200 },
          { x: 250, y: 60, z: 225 },
          { x: 300, y: 40, z: 250 },
        ],
      });
      
      expect(edge).toBeDefined();
      expect(edge.id).toBeDefined();
      
      // Check edges for places
      const place1Edges = placeGraphCore.getEdgesForPlace(place1.id);
      expect(place1Edges).toHaveLength(1);
      expect(place1Edges[0].id).toBe(edge.id);
      
      const place2Edges = placeGraphCore.getEdgesForPlace(place2.id);
      expect(place2Edges).toHaveLength(1);
      expect(place2Edges[0].id).toBe(edge.id);
      
      // Check edge between places
      const edgeBetween = placeGraphCore.getEdgeBetweenPlaces(place1.id, place2.id);
      expect(edgeBetween).toBeDefined();
      expect(edgeBetween?.id).toBe(edge.id);
    });
  });

  describe('Place Memory', () => {
    it('should add and retrieve memories for places', () => {
      // Create a place
      const place = placeGraphCore.addPlace({
        name: 'Fishing Spot',
        type: PlaceType.LOCATION,
        position: { x: 400, y: 62, z: 300 },
        biome: BiomeCategory.RIVER,
        function: PlaceFunction.RESOURCE,
        safety: SafetyLevel.SAFE,
        landmarks: [],
        resources: [],
        tags: ['fishing', 'water'],
        description: 'A good spot for fishing',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        children: [],
        importance: 0.6,
        memorability: 0.7,
        accessibility: 0.8,
      });
      
      // Add a memory
      const memory = placeMemory.addMemory(place.id, {
        title: 'First Fishing Trip',
        content: 'Caught five fish here during a sunny afternoon. The water was clear and calm.',
        importance: 0.7,
        emotionalValence: 0.8,
        tags: ['fishing', 'success'],
      });
      
      expect(memory).toBeDefined();
      expect(memory?.id).toBeDefined();
      
      // Retrieve memory
      const retrievedMemory = placeMemory.getMemory(memory!.id);
      expect(retrievedMemory).toBeDefined();
      expect(retrievedMemory?.title).toBe('First Fishing Trip');
      
      // Get memories for place
      const placeMemories = placeMemory.getMemoriesForPlace(place.id);
      expect(placeMemories).toHaveLength(1);
      expect(placeMemories[0].id).toBe(memory!.id);
    });

    it('should recall memories by tag', () => {
      // Create places
      const place1 = placeGraphCore.addPlace({
        name: 'Farm',
        type: PlaceType.AREA,
        position: { x: 600, y: 64, z: 600 },
        biome: BiomeCategory.PLAINS,
        function: PlaceFunction.FARMING,
        safety: SafetyLevel.SAFE,
        landmarks: [],
        resources: [],
        tags: ['farm'],
        description: 'A small farm',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        children: [],
        importance: 0.6,
        memorability: 0.5,
        accessibility: 0.9,
      });
      
      const place2 = placeGraphCore.addPlace({
        name: 'Market',
        type: PlaceType.AREA,
        position: { x: 650, y: 64, z: 650 },
        biome: BiomeCategory.VILLAGE,
        function: PlaceFunction.STORAGE,
        safety: SafetyLevel.SAFE,
        landmarks: [],
        resources: [],
        tags: ['market', 'trading'],
        description: 'A village market',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        children: [],
        importance: 0.7,
        memorability: 0.6,
        accessibility: 0.9,
      });
      
      // Add memories with common tag
      placeMemory.addMemory(place1.id, {
        title: 'Harvesting Wheat',
        content: 'Harvested wheat from the farm fields.',
        tags: ['harvest', 'wheat'],
      });
      
      placeMemory.addMemory(place2.id, {
        title: 'Selling Wheat',
        content: 'Sold wheat at the market for a good price.',
        tags: ['trading', 'wheat'],
      });
      
      // Recall by tag
      const wheatMemories = placeMemory.getMemoriesByTag(['wheat']);
      expect(wheatMemories).toHaveLength(2);
      expect(wheatMemories.map(m => m.title)).toContain('Harvesting Wheat');
      expect(wheatMemories.map(m => m.title)).toContain('Selling Wheat');
      
      const tradingMemories = placeMemory.getMemoriesByTag(['trading']);
      expect(tradingMemories).toHaveLength(1);
      expect(tradingMemories[0].title).toBe('Selling Wheat');
    });

    it('should generate place summaries with memories', () => {
      // Create place with landmarks and resources
      const place = placeGraphCore.addPlace({
        name: 'Mountain Peak',
        type: PlaceType.LOCATION,
        position: { x: 800, y: 120, z: 800 },
        biome: BiomeCategory.MOUNTAINS,
        function: PlaceFunction.LANDMARK,
        safety: SafetyLevel.NEUTRAL,
        landmarks: [
          {
            id: 'landmark-peak',
            name: 'Summit Stone',
            position: { x: 800, y: 125, z: 800 },
            type: 'stone',
            description: 'A distinctive stone at the summit',
            visibility: 0.9,
            memorability: 0.8,
          }
        ],
        resources: [
          {
            id: 'resource-view',
            type: 'view',
            quantity: 1,
            renewable: true,
            position: { x: 800, y: 120, z: 800 },
            description: 'Panoramic view of the surrounding landscape',
          }
        ],
        tags: ['mountain', 'peak', 'view'],
        description: 'The highest point in the region',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        children: [],
        importance: 0.8,
        memorability: 0.9,
        accessibility: 0.4,
      });
      
      // Add memories
      placeMemory.addMemory(place.id, {
        title: 'First Summit',
        content: 'Reached the mountain peak for the first time. The view was breathtaking.',
        importance: 0.8,
        emotionalValence: 0.9,
        tags: ['achievement', 'view'],
      });
      
      // Generate summary
      const summary = placeMemory.generatePlaceSummary(place.id);
      
      expect(summary).toContain('Mountain Peak');
      expect(summary).toContain('Summit Stone');
      expect(summary).toContain('First Summit');
      expect(summary).toContain('view was breathtaking');
    });
  });

  describe('Spatial Navigator', () => {
    it('should find paths between places', () => {
      // Create a network of places
      const home = placeGraphCore.addPlace({
        name: 'Home',
        type: PlaceType.LOCATION,
        position: { x: 100, y: 64, z: 100 },
        biome: BiomeCategory.PLAINS,
        function: PlaceFunction.HOME,
        safety: SafetyLevel.SAFE,
        landmarks: [],
        resources: [],
        tags: ['home'],
        description: 'Home base',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        children: [],
        importance: 0.9,
        memorability: 0.8,
        accessibility: 0.9,
      });
      
      const forest = placeGraphCore.addPlace({
        name: 'Forest',
        type: PlaceType.AREA,
        position: { x: 200, y: 64, z: 150 },
        biome: BiomeCategory.FOREST,
        function: PlaceFunction.RESOURCE,
        safety: SafetyLevel.NEUTRAL,
        landmarks: [],
        resources: [],
        tags: ['forest'],
        description: 'Dense forest',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        children: [],
        importance: 0.6,
        memorability: 0.5,
        accessibility: 0.7,
      });
      
      const cave = placeGraphCore.addPlace({
        name: 'Cave',
        type: PlaceType.LOCATION,
        position: { x: 300, y: 40, z: 200 },
        biome: BiomeCategory.UNDERGROUND,
        function: PlaceFunction.RESOURCE,
        safety: SafetyLevel.DANGEROUS,
        landmarks: [],
        resources: [],
        tags: ['cave'],
        description: 'Dark cave with resources',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        children: [],
        importance: 0.7,
        memorability: 0.8,
        accessibility: 0.4,
      });
      
      // Connect places
      placeGraphCore.addEdge({
        source: home.id,
        target: forest.id,
        type: EdgeType.PATH,
        distance: 120,
        travelTime: 24,
        difficulty: 0.3,
        bidirectional: true,
        description: 'Path from home to forest',
        lastTraversed: Date.now(),
        traversalCount: 5,
        waypoints: [home.position, forest.position],
      });
      
      placeGraphCore.addEdge({
        source: forest.id,
        target: cave.id,
        type: EdgeType.PATH,
        distance: 150,
        travelTime: 40,
        difficulty: 0.7,
        bidirectional: true,
        description: 'Difficult path from forest to cave',
        lastTraversed: Date.now(),
        traversalCount: 2,
        waypoints: [forest.position, cave.position],
      });
      
      // Find path
      const path = spatialNavigator.findPath({
        start: home.id,
        goal: cave.id,
      });
      
      expect(path).toBeDefined();
      expect(path?.places).toHaveLength(3);
      expect(path?.places[0]).toBe(home.id);
      expect(path?.places[1]).toBe(forest.id);
      expect(path?.places[2]).toBe(cave.id);
      expect(path?.edges).toHaveLength(2);
      
      // Check instructions
      expect(path?.instructions).toBeDefined();
      expect(path?.instructions.length).toBeGreaterThan(0);
    });

    it('should find nearest place by function', () => {
      // Create places with different functions
      placeGraphCore.addPlace({
        name: 'Home',
        type: PlaceType.LOCATION,
        position: { x: 100, y: 64, z: 100 },
        biome: BiomeCategory.PLAINS,
        function: PlaceFunction.HOME,
        safety: SafetyLevel.SAFE,
        landmarks: [],
        resources: [],
        tags: [],
        description: '',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        children: [],
        importance: 0.5,
        memorability: 0.5,
        accessibility: 0.5,
      });
      
      placeGraphCore.addPlace({
        name: 'Farm',
        type: PlaceType.AREA,
        position: { x: 200, y: 64, z: 200 },
        biome: BiomeCategory.PLAINS,
        function: PlaceFunction.FARMING,
        safety: SafetyLevel.SAFE,
        landmarks: [],
        resources: [],
        tags: [],
        description: '',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        children: [],
        importance: 0.5,
        memorability: 0.5,
        accessibility: 0.5,
      });
      
      placeGraphCore.addPlace({
        name: 'Storage',
        type: PlaceType.LOCATION,
        position: { x: 150, y: 64, z: 150 },
        biome: BiomeCategory.PLAINS,
        function: PlaceFunction.STORAGE,
        safety: SafetyLevel.SAFE,
        landmarks: [],
        resources: [],
        tags: [],
        description: '',
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        children: [],
        importance: 0.5,
        memorability: 0.5,
        accessibility: 0.5,
      });
      
      // Find nearest storage
      const currentPosition: Vector3 = { x: 120, y: 64, z: 120 };
      const nearestStorage = spatialNavigator.findNearestPlaceByFunction(
        currentPosition,
        PlaceFunction.STORAGE
      );
      
      expect(nearestStorage).toBeDefined();
      expect(nearestStorage?.place.name).toBe('Storage');
      expect(nearestStorage?.place.function).toBe(PlaceFunction.STORAGE);
    });
  });

  describe('Place Discovery', () => {
    it('should discover new places and connect them', () => {
      // Discover a new place
      const discovery = placeGraphCore.discoverPlace(
        { x: 400, y: 64, z: 400 },
        {
          name: 'Meadow',
          type: PlaceType.AREA,
          biome: BiomeCategory.PLAINS,
          function: PlaceFunction.EXPLORATION,
          safety: SafetyLevel.SAFE,
          description: 'A beautiful meadow with flowers',
          tags: ['meadow', 'flowers'],
        }
      );
      
      expect(discovery).toBeDefined();
      expect(discovery.isNew).toBe(true);
      expect(discovery.place.name).toBe('Meadow');
      
      // Discover nearby place
      const discovery2 = placeGraphCore.discoverPlace(
        { x: 450, y: 64, z: 450 },
        {
          name: 'Pond',
          type: PlaceType.LOCATION,
          biome: BiomeCategory.RIVER,
          function: PlaceFunction.RESOURCE,
          safety: SafetyLevel.SAFE,
          description: 'A small pond with fish',
          tags: ['pond', 'water', 'fish'],
        }
      );
      
      expect(discovery2).toBeDefined();
      expect(discovery2.isNew).toBe(true);
      
      // Check if they were automatically connected
      const edges = placeGraphCore.getEdgeBetweenPlaces(
        discovery.place.id,
        discovery2.place.id
      );
      
      expect(edges).toBeDefined();
    });

    it('should update existing places when rediscovered', () => {
      // Discover a place
      const discovery = placeGraphCore.discoverPlace(
        { x: 500, y: 64, z: 500 },
        {
          name: 'Hill',
          type: PlaceType.LOCATION,
          biome: BiomeCategory.PLAINS,
          function: PlaceFunction.LANDMARK,
          safety: SafetyLevel.SAFE,
          description: 'A small hill',
        }
      );
      
      const placeId = discovery.place.id;
      const initialVisitCount = discovery.place.visitCount;
      
      // Rediscover the same place with updated info
      const rediscovery = placeGraphCore.discoverPlace(
        { x: 500, y: 64, z: 500 },
        {
          name: 'Hill',
          description: 'A small hill with a great view',
          landmarks: [
            {
              id: 'landmark-tree',
              name: 'Lone Tree',
              position: { x: 500, y: 70, z: 500 },
              type: 'tree',
              description: 'A single tree at the top of the hill',
              visibility: 0.8,
              memorability: 0.7,
            }
          ],
        }
      );
      
      expect(rediscovery.isNew).toBe(false);
      expect(rediscovery.place.id).toBe(placeId);
      expect(rediscovery.place.visitCount).toBe(initialVisitCount + 1);
      expect(rediscovery.place.description).toBe('A small hill with a great view');
      expect(rediscovery.place.landmarks).toHaveLength(1);
      expect(rediscovery.place.landmarks[0].name).toBe('Lone Tree');
    });
  });
});
