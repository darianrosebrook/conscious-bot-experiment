/**
 * World Module Types
 *
 * Comprehensive type system for world sensing, navigation, and embodied interaction.
 * Implements visible-only sensing with occlusion discipline and confidence tracking.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ===== BASIC WORLD TYPES =====

/**
 * Block identifier in Minecraft format
 */
export type BlockId = string; // "minecraft:coal_ore"

/**
 * 3D position vector (integer voxel coordinates)
 */
export const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export type Vec3 = z.infer<typeof Vec3Schema>;

/**
 * Floating point direction vector
 */
export const DirectionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export type Direction = z.infer<typeof DirectionSchema>;

/**
 * Yaw and pitch angles in radians
 */
export const OrientationSchema = z.object({
  yaw: z.number(),
  pitch: z.number(),
});

export type Orientation = z.infer<typeof OrientationSchema>;

// ===== OBSERVATION SYSTEM =====

/**
 * A single observation from ray casting
 */
export const ObservationSchema = z.object({
  blockId: z.string(),
  pos: Vec3Schema,
  distance: z.number().nonnegative(),
  normal: Vec3Schema.optional(), // Surface normal if available
  light: z.number().min(0).max(15).optional(), // Minecraft light level 0-15
  confidence: z.number().min(0).max(1), // Starts at 1.0, decays over time
  lastSeen: z.number(), // Timestamp in ms
  source: z.enum(['raycast', 'dda', 'direct']), // How this was observed
  metadata: z.record(z.any()).optional(), // Additional context
});

export type Observation = z.infer<typeof ObservationSchema>;

/**
 * Configuration for ray casting sweeps
 */
export const SensingConfigSchema = z.object({
  maxDistance: z.number().positive().default(64), // Maximum ray distance
  fovDegrees: z.number().positive().default(70), // Field of view in degrees
  angularResolution: z.number().positive().default(2), // Degrees between rays
  panoramicSweep: z.boolean().default(false), // 360° vs focused FOV
  maxRaysPerTick: z.number().positive().default(500), // Performance budget
  tickBudgetMs: z.number().positive().default(5), // Time budget per sweep

  // Block classification
  targetBlocks: z
    .array(z.string())
    .default([
      'minecraft:coal_ore',
      'minecraft:iron_ore',
      'minecraft:gold_ore',
      'minecraft:diamond_ore',
      'minecraft:chest',
      'minecraft:oak_log',
      'minecraft:birch_log',
      'minecraft:spruce_log',
    ]),

  transparentBlocks: z
    .array(z.string())
    .default([
      'minecraft:air',
      'minecraft:cave_air',
      'minecraft:water',
      'minecraft:glass',
      'minecraft:leaves',
      'minecraft:oak_leaves',
      'minecraft:birch_leaves',
      'minecraft:grass',
      'minecraft:tall_grass',
      'minecraft:torch',
      'minecraft:rail',
    ]),

  // Confidence decay
  confidenceDecayRate: z.number().min(0).max(1).default(0.02), // Per minute
  minConfidence: z.number().min(0).max(1).default(0.1), // Eviction threshold
});

export type SensingConfig = z.infer<typeof SensingConfigSchema>;

// ===== RAY CASTING RESULTS =====

/**
 * Result of a single ray cast
 */
export const RaycastHitSchema = z.object({
  position: Vec3Schema,
  intersect: Vec3Schema.optional(), // Exact intersection point
  faceVector: Vec3Schema.optional(), // Normal of hit face
  distance: z.number().nonnegative(),
  blockId: z.string(),
  metadata: z.record(z.any()).optional(),
});

export type RaycastHit = z.infer<typeof RaycastHitSchema>;

/**
 * Sweep result containing all observations from a sensing cycle
 */
export const SweepResultSchema = z.object({
  observations: z.array(ObservationSchema),
  raysCast: z.number().nonnegative(),
  duration: z.number().nonnegative(), // ms
  timestamp: z.number(),
  pose: z.object({
    position: Vec3Schema,
    orientation: OrientationSchema,
  }),
  performance: z.object({
    raysPerSecond: z.number().nonnegative(),
    avgRayDistance: z.number().nonnegative(),
    hitRate: z.number().min(0).max(1), // Fraction of rays that hit something
  }),
});

export type SweepResult = z.infer<typeof SweepResultSchema>;

// ===== OBSERVED RESOURCES INDEX =====

/**
 * Spatial indexing key for observations
 */
export type ChunkKey = string; // "x,z"
export type BlockKey = string; // "x,y,z"

/**
 * Query parameters for spatial lookups
 */
export const SpatialQuerySchema = z.object({
  center: Vec3Schema,
  radius: z.number().positive(),
  blockTypes: z.array(z.string()).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  maxAge: z.number().positive().optional(), // ms
});

export type SpatialQuery = z.infer<typeof SpatialQuerySchema>;

/**
 * Statistics for the observed resources index
 */
export const IndexStatsSchema = z.object({
  totalObservations: z.number().nonnegative(),
  uniqueBlocks: z.number().nonnegative(),
  chunksActive: z.number().nonnegative(),
  averageConfidence: z.number().min(0).max(1),
  oldestObservation: z.number(),
  newestObservation: z.number(),
  memoryUsageBytes: z.number().nonnegative(),
});

export type IndexStats = z.infer<typeof IndexStatsSchema>;

// ===== PERFORMANCE MONITORING =====

/**
 * Performance metrics for sensing operations
 */
export const SensingPerformanceSchema = z.object({
  sweepsCompleted: z.number().nonnegative(),
  totalRaysCast: z.number().nonnegative(),
  averageSweepDuration: z.number().nonnegative(),
  p95SweepDuration: z.number().nonnegative(),
  budgetViolations: z.number().nonnegative(),
  adaptiveThrottles: z.number().nonnegative(),

  quality: z.object({
    visibleRecall: z.number().min(0).max(1), // Fraction of visible targets found
    falseOcclusionRate: z.number().min(0).max(1), // Incorrectly detected behind walls
    timeToFirstObservation: z.number().nonnegative(), // ms for new targets
  }),

  index: z.object({
    stalenessRate: z.number().min(0).max(1), // Observations expiring without refresh
    resourceToUseLatency: z.number().nonnegative(), // ms from observation to action
    evictionsPerMinute: z.number().nonnegative(),
  }),
});

export type SensingPerformance = z.infer<typeof SensingPerformanceSchema>;

// ===== SENSING EVENTS =====

/**
 * Events emitted by the sensing system
 */
export interface SensingEvents {
  'sweep-started': [{ timestamp: number; rayBudget: number }];
  'sweep-completed': [SweepResult];
  'observation-added': [Observation];
  'observation-updated': [Observation, Observation]; // old, new
  'observation-expired': [Observation];
  'budget-exceeded': [{ duration: number; budget: number }];
  'adaptive-throttle': [{ oldResolution: number; newResolution: number }];
  'index-stats': [IndexStats];
}

// ===== RAY TRAVERSAL ALGORITHMS =====

/**
 * DDA (Digital Differential Analyzer) ray stepping state
 */
export const DDAStateSchema = z.object({
  current: Vec3Schema, // Current voxel
  tMax: Vec3Schema, // Next t values for each axis
  tDelta: Vec3Schema, // t step size for each axis
  step: Vec3Schema, // Step direction (-1, 0, or 1) for each axis
  distance: z.number().nonnegative(),
});

export type DDAState = z.infer<typeof DDAStateSchema>;

/**
 * Ray traversal configuration
 */
export const RayTraversalConfigSchema = z.object({
  algorithm: z.enum(['mineflayer', 'dda']),
  maxSteps: z.number().positive().default(128), // DDA step limit
  earlyExit: z.boolean().default(true), // Stop at first occluder
  recordPath: z.boolean().default(false), // Store visited voxels
});

export type RayTraversalConfig = z.infer<typeof RayTraversalConfigSchema>;

// ===== FRUSTUM AND SAMPLING =====

/**
 * Camera frustum for view culling
 */
export const FrustumSchema = z.object({
  position: Vec3Schema,
  orientation: OrientationSchema,
  fovRadians: z.number().positive(),
  nearPlane: z.number().positive(),
  farPlane: z.number().positive(),
});

export type Frustum = z.infer<typeof FrustumSchema>;

/**
 * Ray sampling strategy
 */
export const SamplingStrategySchema = z.object({
  type: z.enum(['grid', 'panoramic', 'salience_guided']),
  density: z.number().positive(), // Rays per solid angle
  adaptive: z.boolean().default(true), // Adjust density based on performance

  // Grid sampling
  gridResolution: z
    .object({
      yawSteps: z.number().positive(),
      pitchSteps: z.number().positive(),
    })
    .optional(),

  // Panoramic sampling
  panoramicSectors: z.number().positive().optional(),

  // Salience-guided sampling
  salienceDecay: z.number().min(0).max(1).optional(),
  motionBonus: z.number().nonnegative().optional(),
});

export type SamplingStrategy = z.infer<typeof SamplingStrategySchema>;

// ===== INTERFACES =====

/**
 * Observed resources spatial index interface
 */
export interface IObservedResourcesIndex {
  /**
   * Add or update an observation
   */
  upsert(observation: Observation): void;

  /**
   * Find observations near a position
   */
  lookupNear(query: SpatialQuery): Observation[];

  /**
   * Find nearest observation of specific block types
   */
  findNearest(
    position: Vec3,
    blockTypes: string[],
    maxDistance?: number
  ): Observation | null;

  /**
   * Decay confidence for old observations
   */
  decay(currentTime: number): { expired: number; updated: number };

  /**
   * Get index statistics
   */
  getStats(): IndexStats;

  /**
   * Clear all observations (for testing)
   */
  clear(): void;
}

/**
 * Ray casting engine interface
 */
export interface IRaycastEngine {
  /**
   * Cast a single ray and return hit information
   */
  raycast(
    origin: Vec3,
    direction: Direction,
    maxDistance: number,
    config?: RayTraversalConfig
  ): RaycastHit | null;

  /**
   * Cast multiple rays in a sweep pattern
   */
  sweep(
    origin: Vec3,
    orientation: Orientation,
    config: SensingConfig
  ): Promise<SweepResult>;

  /**
   * Check if a block type is transparent for ray traversal
   */
  isTransparent(blockId: string): boolean;

  /**
   * Update transparency configuration
   */
  setTransparentBlocks(blockIds: string[]): void;
}

/**
 * Visible-only sensing system interface
 */
export interface IVisibleSensing {
  /**
   * Perform a sensing sweep from current bot position
   */
  performSweep(): Promise<SweepResult>;

  /**
   * Get all observations from the index
   */
  getObservations(query?: SpatialQuery): Observation[];

  /**
   * Find nearest resource of given types
   */
  findNearestResource(
    blockTypes: string[],
    maxDistance?: number
  ): Observation | null;

  /**
   * Update sensing configuration
   */
  updateConfig(config: Partial<SensingConfig>): void;

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): SensingPerformance;

  /**
   * Start/stop continuous sensing
   */
  startContinuousSensing(intervalMs: number): void;
  stopContinuousSensing(): void;
}

// ===== UTILITY FUNCTIONS =====

/**
 * Convert world coordinates to chunk key
 */
export function worldToChunkKey(pos: Vec3): ChunkKey {
  const chunkX = Math.floor(pos.x / 16);
  const chunkZ = Math.floor(pos.z / 16);
  return `${chunkX},${chunkZ}`;
}

/**
 * Convert world coordinates to block key
 */
export function worldToBlockKey(pos: Vec3): BlockKey {
  return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
}

/**
 * Calculate distance between two positions
 */
export function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Normalize a direction vector
 */
export function normalize(dir: Direction): Direction {
  const mag = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
  if (mag === 0) return { x: 0, y: 0, z: 1 }; // Default forward
  return { x: dir.x / mag, y: dir.y / mag, z: dir.z / mag };
}

/**
 * Convert yaw/pitch to direction vector
 */
export function orientationToDirection(orientation: Orientation): Direction {
  const { yaw, pitch } = orientation;
  return {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: -Math.sin(pitch),
    z: Math.cos(yaw) * Math.cos(pitch),
  };
}

/**
 * Check if position is within frustum
 */
export function isInFrustum(position: Vec3, frustum: Frustum): boolean {
  const toPos = {
    x: position.x - frustum.position.x,
    y: position.y - frustum.position.y,
    z: position.z - frustum.position.z,
  };

  const distance = Math.sqrt(
    toPos.x * toPos.x + toPos.y * toPos.y + toPos.z * toPos.z
  );
  if (distance < frustum.nearPlane || distance > frustum.farPlane) {
    return false;
  }

  const forward = orientationToDirection(frustum.orientation);
  const dot =
    (toPos.x * forward.x + toPos.y * forward.y + toPos.z * forward.z) /
    distance;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

  return angle <= frustum.fovRadians / 2;
}

// Export validation functions
export const validateObservation = (data: unknown): Observation =>
  ObservationSchema.parse(data);

export const validateSensingConfig = (data: unknown): SensingConfig =>
  SensingConfigSchema.parse(data);

export const validateSweepResult = (data: unknown): SweepResult =>
  SweepResultSchema.parse(data);

// Re-export types from other modules for convenience
export type {
  WorldPosition,
  PathPlanningRequest,
  NavigationConfig,
} from './navigation/types';
export type { PerceptionConfig } from './perception/types';
export type { SensorimotorConfig } from './sensorimotor/types';

// Define missing types that tests expect
export interface VisualQuery {
  position: Vec3;
  radius: number;
  targetTypes?: string[];
  observerPosition?: Vec3;
  maxDistance?: number;
}

export interface ActionRequest {
  id: string;
  type:
    | 'move_forward'
    | 'move_backward'
    | 'strafe_left'
    | 'strafe_right'
    | 'turn_left'
    | 'turn_right'
    | 'jump'
    | 'crouch'
    | 'sprint'
    | 'swim'
    | 'climb'
    | 'stop'
    | 'mine_block'
    | 'place_block'
    | 'interact_block'
    | 'pickup_item'
    | 'drop_item'
    | 'use_item'
    | 'craft_item'
    | 'wield_tool'
    | 'chat_message'
    | 'gesture'
    | 'look_at'
    | 'point'
    | 'compound_action'
    | 'emergency_response';
  parameters: Record<string, any>;
  priority: number;
  requiredPrecision: number;
  timeout: number;
  feedback: boolean;
}

export interface RaycastConfig {
  maxDistance: number;
  transparent: string[];
}

export interface PerceptionResult {
  detectedObjects: Array<{
    worldPosition: Vec3;
    classification: {
      primary: string;
    };
    confidence: number;
  }>;
  overallConfidence: number;
  processingTime: number;
  fieldCoverage: number;
}

export interface PathPlanningResult {
  success: boolean;
  path: Vec3[];
  waypoints: Vec3[];
  totalLength: number;
  estimatedCost: number;
  estimatedTime: number;
  planningTime: number;
  nodesExpanded: number;
  reason?: string;
  metadata: {
    isPartialPath: boolean;
    goalReached: boolean;
    hazardsAvoided: number;
    optimality?: number;
  };
}

export interface ActionResult {
  success: boolean;
  actionId: string;
  executionTime: number;
  errors: string[];
  warnings: string[];
  actualDuration?: number;
  finalPosition?: {
    timestamp: number;
    confidence: number;
    position: Vec3;
    orientation?: Orientation;
  };
  achievedPrecision?: number;
  performanceMetrics?: {
    latency: number;
    throughput: number;
    resourceUsage: number;
  };
  result?: Record<string, any>;
  feedback?: string;
}
