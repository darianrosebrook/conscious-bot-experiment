/**
 * Navigation System Types - D* Lite pathfinding with dynamic replanning
 *
 * Implements robust pathfinding for dynamic Minecraft environments with
 * real-time adaptation to world changes and environmental hazards.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';
import { Vec3 } from '../types';

// ===== CORE NAVIGATION TYPES =====

/**
 * World position with additional navigation metadata
 */
export const WorldPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  timestamp: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type WorldPosition = z.infer<typeof WorldPositionSchema>;

/**
 * Navigation graph node representation
 */
export const GraphNodeSchema = z.object({
  id: z.string(),
  position: WorldPositionSchema,
  walkable: z.boolean(),
  cost: z.number().nonnegative(),
  gValue: z.number().default(Infinity), // Cost from start
  rhsValue: z.number().default(Infinity), // One-step lookahead cost
  key: z.tuple([z.number(), z.number()]).optional(), // Priority queue key
  neighbors: z.array(z.string()).default([]), // Neighbor node IDs
  blocked: z.boolean().default(false),
  hazardLevel: z.number().min(0).max(1).default(0),
  lastUpdated: z.number(),
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;

/**
 * Edge between graph nodes
 */
export const GraphEdgeSchema = z.object({
  from: z.string(), // Source node ID
  to: z.string(), // Destination node ID
  cost: z.number().nonnegative(),
  bidirectional: z.boolean().default(true),
  metadata: z.record(z.any()).optional(),
});

export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

/**
 * D* Lite priority key for vertex ordering
 */
export const PriorityKeySchema = z.tuple([z.number(), z.number()]);
export type PriorityKey = z.infer<typeof PriorityKeySchema>;

// ===== PATH PLANNING TYPES =====

/**
 * Pathfinding request configuration
 */
export const PathPlanningRequestSchema = z.object({
  start: WorldPositionSchema,
  goal: WorldPositionSchema,
  maxDistance: z.number().positive().default(200),
  allowPartialPath: z.boolean().default(true),
  avoidHazards: z.boolean().default(true),
  urgency: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  preferences: z
    .object({
      preferLit: z.boolean().default(true),
      avoidMobs: z.boolean().default(true),
      minimizeVertical: z.boolean().default(false),
      preferSolid: z.boolean().default(true),
      avoidWater: z.boolean().default(false),
      preferLighting: z.boolean().default(true),
      maxDetour: z.number().positive().default(5.0),
    })
    .optional(),
  timeout: z.number().positive().default(50), // ms
});

export type PathPlanningRequest = z.infer<typeof PathPlanningRequestSchema>;

/**
 * Pathfinding result
 */
export const PathPlanningResultSchema = z.object({
  success: z.boolean(),
  path: z.array(WorldPositionSchema),
  waypoints: z.array(WorldPositionSchema),
  totalLength: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
  estimatedCost: z.number().nonnegative(),
  estimatedTime: z.number().nonnegative(),
  planningTime: z.number().nonnegative(), // ms
  nodesExpanded: z.number().nonnegative(),
  reason: z.string().optional(), // Failure reason if unsuccessful
  metadata: z
    .object({
      isPartialPath: z.boolean().default(false),
      goalReached: z.boolean(),
      hazardsAvoided: z.number().default(0),
      optimality: z.number().min(0).max(1).optional(), // Compared to ideal path
    })
    .optional(),
});

export type PathPlanningResult = z.infer<typeof PathPlanningResultSchema>;

/**
 * Path update result for dynamic replanning
 */
export const PathUpdateResultSchema = z.object({
  success: z.boolean(),
  updatedPath: z.array(WorldPositionSchema),
  changesProcessed: z.number().nonnegative(),
  replanTime: z.number().nonnegative(), // ms
  affectedNodes: z.array(z.string()),
  reason: z.string().optional(),
});

export type PathUpdateResult = z.infer<typeof PathUpdateResultSchema>;

// ===== WORLD CHANGE TRACKING =====

/**
 * World change event for dynamic replanning
 */
export const WorldChangeSchema = z.object({
  position: WorldPositionSchema,
  changeType: z.enum([
    'block_added',
    'block_removed',
    'hazard_added',
    'hazard_removed',
  ]),
  blockType: z.string().optional(),
  timestamp: z.number(),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  affectsNavigation: z.boolean().default(true),
});

export type WorldChange = z.infer<typeof WorldChangeSchema>;

/**
 * Block change for graph updates
 */
export const BlockChangeSchema = z.object({
  position: WorldPositionSchema,
  oldBlockType: z.string().optional(),
  newBlockType: z.string(),
  walkable: z.boolean(),
  hazardous: z.boolean().default(false),
  cost: z.number().nonnegative().default(1),
});

export type BlockChange = z.infer<typeof BlockChangeSchema>;

// ===== COST CALCULATION =====

/**
 * Movement cost breakdown
 */
export const MovementCostSchema = z.object({
  baseCost: z.number().nonnegative(),
  hazardPenalty: z.number().nonnegative().default(0),
  lightingPenalty: z.number().nonnegative().default(0),
  mobPenalty: z.number().nonnegative().default(0),
  verticalPenalty: z.number().nonnegative().default(0),
  totalCost: z.number().nonnegative(),
  factors: z.record(z.number()).optional(), // Additional named factors
});

export type MovementCost = z.infer<typeof MovementCostSchema>;

/**
 * Environmental hazard definition
 */
export const EnvironmentalHazardSchema = z.object({
  type: z.enum([
    'lava',
    'void',
    'mob',
    'darkness',
    'water',
    'fall_damage',
    'fire',
  ]),
  position: WorldPositionSchema,
  radius: z.number().nonnegative(),
  severity: z.number().min(0).max(1),
  costMultiplier: z.number().min(1).default(10),
  avoidanceRadius: z.number().nonnegative().optional(),
  timeDecay: z.number().nonnegative().optional(), // ms until hazard expires
});

export type EnvironmentalHazard = z.infer<typeof EnvironmentalHazardSchema>;

/**
 * Cost calculation context
 */
export const CostContextSchema = z.object({
  agentPosition: WorldPositionSchema,
  lightLevel: z.number().min(0).max(15).default(15),
  timeOfDay: z.number().min(0).max(24000).default(6000), // Minecraft ticks
  hazards: z.array(EnvironmentalHazardSchema).default([]),
  mobPositions: z.array(WorldPositionSchema).default([]),
  preferences: z
    .object({
      riskTolerance: z.number().min(0).max(1).default(0.3),
      speedPreference: z.number().min(0).max(1).default(0.7),
      safetyMargin: z.number().nonnegative().default(2),
    })
    .optional(),
});

export type CostContext = z.infer<typeof CostContextSchema>;

// ===== MOVEMENT EXECUTION =====

/**
 * Navigation step for movement execution
 */
export const NavigationStepSchema = z.object({
  position: WorldPositionSchema,
  action: z.enum(['move', 'jump', 'climb', 'swim', 'wait', 'turn']),
  direction: z
    .object({
      yaw: z.number(), // radians
      pitch: z.number(), // radians
    })
    .optional(),
  speed: z.number().min(0).max(1).default(1), // Movement speed multiplier
  duration: z.number().nonnegative().optional(), // ms
  precision: z.number().nonnegative().default(0.5), // Required positioning accuracy
  conditions: z.array(z.string()).default([]), // Prerequisites for step
});

export type NavigationStep = z.infer<typeof NavigationStepSchema>;

/**
 * Obstacle for real-time avoidance
 */
export const ObstacleSchema = z.object({
  position: WorldPositionSchema,
  size: z.object({
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    depth: z.number().nonnegative(),
  }),
  dynamic: z.boolean().default(false), // Moving obstacle
  velocity: z
    .object({ x: z.number(), y: z.number(), z: z.number() })
    .optional(),
  avoidanceRadius: z.number().nonnegative().default(2),
  priority: z.number().min(0).max(1).default(0.5),
});

export type Obstacle = z.infer<typeof ObstacleSchema>;

/**
 * Obstacle avoidance result
 */
export const AvoidanceResultSchema = z.object({
  success: z.boolean(),
  newDirection: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    })
    .optional(),
  speedReduction: z.number().min(0).max(1).default(0),
  requiresReplan: z.boolean().default(false),
  reason: z.string().optional(),
});

export type AvoidanceResult = z.infer<typeof AvoidanceResultSchema>;

// ===== PATH OPTIMIZATION =====

/**
 * Path optimization constraints
 */
export const OptimizationConstraintsSchema = z.object({
  maxDeviation: z.number().nonnegative().default(2), // blocks
  smoothingFactor: z.number().min(0).max(1).default(0.7),
  safetyMargin: z.number().nonnegative().default(1.5), // blocks from hazards
  preserveWaypoints: z.boolean().default(false),
  minimizeVerticalMovement: z.boolean().default(true),
  maxSlope: z.number().nonnegative().default(45), // degrees
});

export type OptimizationConstraints = z.infer<
  typeof OptimizationConstraintsSchema
>;

/**
 * Optimized path result
 */
export const OptimizedPathSchema = z.object({
  waypoints: z.array(WorldPositionSchema),
  smoothed: z.boolean(),
  simplified: z.boolean(),
  safetyChecked: z.boolean(),
  originalLength: z.number().nonnegative(),
  optimizedLength: z.number().nonnegative(),
  improvementRatio: z.number().nonnegative(),
  metadata: z
    .object({
      waypointsRemoved: z.number().nonnegative(),
      hazardsAvoided: z.number().nonnegative(),
      smoothingApplied: z.boolean(),
    })
    .optional(),
});

export type OptimizedPath = z.infer<typeof OptimizedPathSchema>;

// ===== NAVIGATION CONFIGURATION =====

/**
 * Navigation system configuration
 */
export const NavigationConfigSchema = z.object({
  dstarLite: z.object({
    searchRadius: z.number().positive().default(100), // blocks
    replanThreshold: z.number().positive().default(5), // blocks of change
    maxComputationTime: z.number().positive().default(50), // ms
    heuristicWeight: z.number().positive().default(1.0),
  }),

  costCalculation: z.object({
    baseMoveCost: z.number().positive().default(1.0),
    diagonalMultiplier: z.number().positive().default(1.414), // sqrt(2)
    verticalMultiplier: z.number().positive().default(2.0),
    jumpCost: z.number().positive().default(3.0),
    swimCost: z.number().positive().default(4.0),
  }),

  hazardCosts: z.object({
    lavaProximity: z.number().positive().default(1000),
    voidFall: z.number().positive().default(10000),
    mobProximity: z.number().positive().default(200),
    darknessPenalty: z.number().positive().default(50),
    waterPenalty: z.number().positive().default(20),
  }),

  optimization: z.object({
    pathSmoothing: z.boolean().default(true),
    lookaheadDistance: z.number().positive().default(20), // blocks
    safetyMargin: z.number().nonnegative().default(2), // blocks
    simplificationEnabled: z.boolean().default(true),
    maxOptimizationTime: z.number().positive().default(20), // ms
  }),

  caching: z.object({
    maxCachedPaths: z.number().positive().default(1000),
    cacheTtl: z.number().positive().default(300000), // 5 minutes
    invalidateOnBlockChange: z.boolean().default(true),
    spatialIndexEnabled: z.boolean().default(true),
  }),

  movement: z.object({
    baseSpeed: z.number().positive().default(4.3), // blocks/second
    jumpHeight: z.number().positive().default(1.25), // blocks
    stepHeight: z.number().positive().default(0.6), // blocks
    collisionRadius: z.number().positive().default(0.3), // blocks
    lookaheadTime: z.number().positive().default(1.0), // seconds
  }),
});

export type NavigationConfig = z.infer<typeof NavigationConfigSchema>;

// ===== PERFORMANCE METRICS =====

/**
 * Navigation performance metrics
 */
export const NavigationMetricsSchema = z.object({
  pathfinding: z.object({
    planningLatency: z.object({
      mean: z.number().nonnegative(),
      p95: z.number().nonnegative(),
      p99: z.number().nonnegative(),
    }),
    replanFrequency: z.number().nonnegative(), // replans per minute
    pathOptimality: z.number().min(0).max(1), // ratio to optimal
    successRate: z.number().min(0).max(1),
  }),

  execution: z.object({
    movementAccuracy: z.number().min(0).max(1), // how closely path followed
    obstacleAvoidanceCount: z.number().nonnegative(),
    replansPerPath: z.number().nonnegative(),
    averagePathLength: z.number().nonnegative(),
    completionRate: z.number().min(0).max(1),
  }),

  efficiency: z.object({
    cacheHitRate: z.number().min(0).max(1),
    computationTimePerUpdate: z.number().nonnegative(), // ms
    memoryUsage: z.number().nonnegative(), // bytes
    graphUpdateLatency: z.number().nonnegative(), // ms
  }),
});

export type NavigationMetrics = z.infer<typeof NavigationMetricsSchema>;

// ===== INTERFACES =====

/**
 * D* Lite pathfinding algorithm interface
 */
export interface IDStarLiteCore {
  initializePath(
    start: WorldPosition,
    goal: WorldPosition,
    graph: any
  ): PathPlanningResult;

  updatePath(changes: WorldChange[]): PathUpdateResult;

  getNextStep(currentPosition: WorldPosition): NavigationStep | null;

  computeShortestPath(): { success: boolean; iterations: number };

  calculateKey(node: GraphNode): PriorityKey;

  updateVertex(node: GraphNode): void;
}

/**
 * Navigation graph interface
 */
export interface INavigationGraph {
  buildGraph(
    worldRegion: any,
    resolution: number
  ): { success: boolean; nodes: number };

  updateGraph(changes: BlockChange[]): {
    success: boolean;
    affectedNodes: string[];
  };

  getNeighbors(nodeId: string): { nodeId: string; cost: number }[];

  calculateEdgeCost(from: string, to: string, context: CostContext): number;

  worldToGraph(
    worldPos: WorldPosition
  ): { nodeId: string; distance: number } | null;

  graphToWorld(nodeId: string): WorldPosition | null;

  getNode(nodeId: string): GraphNode | null;

  getAllNodes(): GraphNode[];

  clear(): void;
}

/**
 * Dynamic cost calculator interface
 */
export interface ICostCalculator {
  calculateCost(
    from: WorldPosition,
    to: WorldPosition,
    context: CostContext
  ): MovementCost;

  applyHazardPenalties(
    baseCost: number,
    hazards: EnvironmentalHazard[]
  ): number;

  calculateLightingCost(lightLevel: number, timeOfDay: number): number;

  calculateThreatCost(
    position: WorldPosition,
    mobPositions: WorldPosition[]
  ): number;

  updateHazards(hazards: EnvironmentalHazard[]): void;
}

/**
 * Path optimizer interface
 */
export interface IPathOptimizer {
  optimizePath(
    rawPath: WorldPosition[],
    constraints: OptimizationConstraints
  ): OptimizedPath;

  smoothPath(path: WorldPosition[], smoothingFactor: number): WorldPosition[];

  simplifyPath(
    path: WorldPosition[],
    clearanceCheck: (from: WorldPosition, to: WorldPosition) => boolean
  ): WorldPosition[];

  addSafetyMargins(
    path: WorldPosition[],
    hazards: EnvironmentalHazard[],
    margin: number
  ): WorldPosition[];
}

/**
 * Movement executor interface
 */
export interface IMovementExecutor {
  executePath(
    path: OptimizedPath
  ): Promise<{ success: boolean; reason?: string }>;

  handleObstacleAvoidance(
    currentStep: NavigationStep,
    obstacles: Obstacle[]
  ): AvoidanceResult;

  adjustMovementSpeed(baseSpeed: number, conditions: any): number;

  executePrecisePositioning(
    target: WorldPosition,
    tolerance: number
  ): Promise<{ success: boolean; finalPosition: WorldPosition }>;

  getCurrentPosition(): WorldPosition;

  stop(): void;
}

// ===== UTILITY FUNCTIONS =====

/**
 * Calculate Euclidean distance between two positions
 */
export function euclideanDistance(a: WorldPosition, b: WorldPosition): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate Manhattan distance between two positions
 */
export function manhattanDistance(a: WorldPosition, b: WorldPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

/**
 * Check if two positions are adjacent (within one block)
 */
export function areAdjacent(a: WorldPosition, b: WorldPosition): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const dz = Math.abs(a.z - b.z);
  return dx <= 1 && dy <= 1 && dz <= 1 && dx + dy + dz > 0;
}

/**
 * Generate unique node ID from position
 */
export function positionToNodeId(pos: WorldPosition): string {
  return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
}

/**
 * Parse node ID back to position
 */
export function nodeIdToPosition(nodeId: string): WorldPosition | null {
  const parts = nodeId.split(',');
  if (parts.length !== 3) return null;

  const x = parseInt(parts[0]);
  const y = parseInt(parts[1]);
  const z = parseInt(parts[2]);

  if (isNaN(x) || isNaN(y) || isNaN(z)) return null;

  return { x, y, z };
}

/**
 * Compare two priority keys for D* Lite ordering
 */
export function compareKeys(k1: PriorityKey, k2: PriorityKey): number {
  if (k1[0] < k2[0]) return -1;
  if (k1[0] > k2[0]) return 1;
  if (k1[1] < k2[1]) return -1;
  if (k1[1] > k2[1]) return 1;
  return 0;
}

/**
 * Check if a position is within bounds
 */
export function isValidPosition(
  pos: WorldPosition,
  bounds?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  }
): boolean {
  if (!bounds) return true;

  return (
    pos.x >= bounds.minX &&
    pos.x <= bounds.maxX &&
    pos.y >= bounds.minY &&
    pos.y <= bounds.maxY &&
    pos.z >= bounds.minZ &&
    pos.z <= bounds.maxZ
  );
}

/**
 * Calculate movement direction vector
 */
export function getMovementDirection(
  from: WorldPosition,
  to: WorldPosition
): {
  x: number;
  y: number;
  z: number;
} {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (length === 0) return { x: 0, y: 0, z: 0 };

  return {
    x: dx / length,
    y: dy / length,
    z: dz / length,
  };
}

// Export validation functions
export const validateWorldPosition = (data: unknown): WorldPosition =>
  WorldPositionSchema.parse(data);

export const validateNavigationConfig = (data: unknown): NavigationConfig =>
  NavigationConfigSchema.parse(data);

export const validatePathPlanningRequest = (
  data: unknown
): PathPlanningRequest => PathPlanningRequestSchema.parse(data);

export const validatePathPlanningResult = (data: unknown): PathPlanningResult =>
  PathPlanningResultSchema.parse(data);

export const validateNavigationStep = (data: unknown): NavigationStep =>
  NavigationStepSchema.parse(data);
