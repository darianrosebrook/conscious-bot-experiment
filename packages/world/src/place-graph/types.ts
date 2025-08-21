/**
 * Types for place graph system
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Core Place Graph Types
// ============================================================================

/**
 * 3D vector position
 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Spatial bounds (axis-aligned bounding box)
 */
export interface Bounds {
  min: Vector3;
  max: Vector3;
}

/**
 * Cardinal and ordinal directions
 */
export enum Direction {
  NORTH = 'north',
  NORTHEAST = 'northeast',
  EAST = 'east',
  SOUTHEAST = 'southeast',
  SOUTH = 'south',
  SOUTHWEST = 'southwest',
  WEST = 'west',
  NORTHWEST = 'northwest',
  UP = 'up',
  DOWN = 'down',
}

/**
 * Hierarchical place types from largest to smallest
 */
export enum PlaceType {
  WORLD = 'world',
  REGION = 'region',
  AREA = 'area',
  LOCATION = 'location',
  POINT = 'point',
}

/**
 * Biome categories for environmental context
 */
export enum BiomeCategory {
  FOREST = 'forest',
  PLAINS = 'plains',
  MOUNTAINS = 'mountains',
  DESERT = 'desert',
  OCEAN = 'ocean',
  RIVER = 'river',
  SWAMP = 'swamp',
  SNOWY = 'snowy',
  UNDERGROUND = 'underground',
  NETHER = 'nether',
  END = 'end',
  VILLAGE = 'village',
  STRUCTURE = 'structure',
}

/**
 * Functional categories for places
 */
export enum PlaceFunction {
  HOME = 'home',
  RESOURCE = 'resource',
  CRAFTING = 'crafting',
  STORAGE = 'storage',
  FARMING = 'farming',
  DEFENSE = 'defense',
  LANDMARK = 'landmark',
  TRANSIT = 'transit',
  EXPLORATION = 'exploration',
  UNKNOWN = 'unknown',
}

/**
 * Place safety assessment
 */
export enum SafetyLevel {
  SAFE = 'safe',
  NEUTRAL = 'neutral',
  DANGEROUS = 'dangerous',
  UNKNOWN = 'unknown',
}

/**
 * Edge connection types between places
 */
export enum EdgeType {
  PATH = 'path',
  ROAD = 'road',
  TUNNEL = 'tunnel',
  BRIDGE = 'bridge',
  DOOR = 'door',
  PORTAL = 'portal',
  CONTAINS = 'contains', // Hierarchical relationship
  BORDERS = 'borders', // Adjacent areas
  VISIBLE = 'visible', // Line of sight
}

/**
 * Place node in the spatial graph
 */
export interface PlaceNode {
  id: string;
  name: string;
  type: PlaceType;
  position: Vector3; // Center position
  bounds?: Bounds; // Spatial extent
  biome: BiomeCategory;
  function: PlaceFunction;
  safety: SafetyLevel;
  landmarks: Landmark[];
  resources: Resource[];
  tags: string[];
  description: string;
  firstVisit: number;
  lastVisit: number;
  visitCount: number;
  parent?: string; // Parent place ID (hierarchical)
  children: string[]; // Child place IDs (hierarchical)
  importance: number; // 0-1, for navigation and memory
  memorability: number; // 0-1, for episodic recall
  accessibility: number; // 0-1, how easy to reach
}

/**
 * Edge connecting places in the graph
 */
export interface PlaceEdge {
  id: string;
  source: string; // Source place ID
  target: string; // Target place ID
  type: EdgeType;
  distance: number; // Blocks
  travelTime: number; // Estimated seconds
  difficulty: number; // 0-1, how hard to traverse
  bidirectional: boolean;
  description: string;
  lastTraversed: number;
  traversalCount: number;
  waypoints: Vector3[]; // Key points along path
}

/**
 * Landmark within a place
 */
export interface Landmark {
  id: string;
  name: string;
  position: Vector3;
  type: string;
  description: string;
  visibility: number; // 0-1, how visible from a distance
  memorability: number; // 0-1, how memorable
}

/**
 * Resource available at a place
 */
export interface Resource {
  id: string;
  type: string;
  quantity: number; // Estimated amount
  renewable: boolean;
  lastHarvested?: number;
  position: Vector3;
  description: string;
}

/**
 * Path finding parameters
 */
export interface PathFindingOptions {
  start: string; // Start place ID
  goal: string; // Goal place ID
  prioritizeSafety?: boolean;
  prioritizeSpeed?: boolean;
  maxDifficulty?: number;
  avoidPlaces?: string[];
  preferPlaces?: string[];
  maxDetour?: number; // How far off direct path willing to go
}

/**
 * Navigation path result
 */
export interface NavigationPath {
  places: string[]; // Sequence of place IDs
  edges: string[]; // Sequence of edge IDs
  totalDistance: number;
  estimatedTime: number;
  difficulty: number;
  safety: number; // 0-1, overall safety
  waypoints: Vector3[];
  instructions: NavigationInstruction[];
}

/**
 * Navigation instruction step
 */
export interface NavigationInstruction {
  type: 'move' | 'turn' | 'climb' | 'enter' | 'exit' | 'cross';
  direction?: Direction;
  distance?: number;
  target?: string;
  landmark?: string;
  description: string;
}

/**
 * Spatial query options
 */
export interface SpatialQuery {
  center?: Vector3;
  placeId?: string;
  radius?: number;
  bounds?: Bounds;
  types?: PlaceType[];
  biomes?: BiomeCategory[];
  functions?: PlaceFunction[];
  minSafety?: SafetyLevel;
  withResources?: string[];
  withTags?: string[];
  sortBy?: 'distance' | 'importance' | 'visitCount' | 'lastVisit';
  limit?: number;
}

/**
 * Place graph configuration
 */
export interface PlaceGraphConfig {
  minPlaceDistance: number; // Minimum blocks between places
  maxPlacesPerRegion: number;
  maxPlacesPerArea: number;
  maxPlacesTotal: number;
  autoCreatePlaces: boolean;
  autoConnectPlaces: boolean;
  autoUpdateOnVisit: boolean;
  memorabilityDecayRate: number;
  importanceThreshold: number;
  landmarkVisibilityThreshold: number;
}

/**
 * Place discovery result
 */
export interface PlaceDiscovery {
  place: PlaceNode;
  isNew: boolean;
  similarPlaces: string[];
  parentPlace?: string;
  childPlaces: string[];
  nearbyLandmarks: Landmark[];
  connectingEdges: PlaceEdge[];
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const Vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const BoundsSchema = z.object({
  min: Vector3Schema,
  max: Vector3Schema,
});

export const LandmarkSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: Vector3Schema,
  type: z.string(),
  description: z.string(),
  visibility: z.number().min(0).max(1),
  memorability: z.number().min(0).max(1),
});

export const ResourceSchema = z.object({
  id: z.string(),
  type: z.string(),
  quantity: z.number(),
  renewable: z.boolean(),
  lastHarvested: z.number().optional(),
  position: Vector3Schema,
  description: z.string(),
});

export const PlaceNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.nativeEnum(PlaceType),
  position: Vector3Schema,
  bounds: BoundsSchema.optional(),
  biome: z.nativeEnum(BiomeCategory),
  function: z.nativeEnum(PlaceFunction),
  safety: z.nativeEnum(SafetyLevel),
  landmarks: z.array(LandmarkSchema),
  resources: z.array(ResourceSchema),
  tags: z.array(z.string()),
  description: z.string(),
  firstVisit: z.number(),
  lastVisit: z.number(),
  visitCount: z.number(),
  parent: z.string().optional(),
  children: z.array(z.string()),
  importance: z.number().min(0).max(1),
  memorability: z.number().min(0).max(1),
  accessibility: z.number().min(0).max(1),
});

export const PlaceEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.nativeEnum(EdgeType),
  distance: z.number(),
  travelTime: z.number(),
  difficulty: z.number().min(0).max(1),
  bidirectional: z.boolean(),
  description: z.string(),
  lastTraversed: z.number(),
  traversalCount: z.number(),
  waypoints: z.array(Vector3Schema),
});

export const NavigationInstructionSchema = z.object({
  type: z.enum(['move', 'turn', 'climb', 'enter', 'exit', 'cross']),
  direction: z.nativeEnum(Direction).optional(),
  distance: z.number().optional(),
  target: z.string().optional(),
  landmark: z.string().optional(),
  description: z.string(),
});

export const NavigationPathSchema = z.object({
  places: z.array(z.string()),
  edges: z.array(z.string()),
  totalDistance: z.number(),
  estimatedTime: z.number(),
  difficulty: z.number(),
  safety: z.number().min(0).max(1),
  waypoints: z.array(Vector3Schema),
  instructions: z.array(NavigationInstructionSchema),
});
