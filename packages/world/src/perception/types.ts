/**
 * Perception System Types - Advanced visual perception with confidence tracking
 *
 * Implements human-like visual perception with field of view, occlusion awareness,
 * and confidence decay for authentic embodied intelligence.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';
import { Vec3, Direction, Observation } from '../types';

// ===== CORE PERCEPTION TYPES =====

/**
 * Agent state for perception processing
 */
export const AgentStateSchema = z.object({
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  orientation: z.object({ yaw: z.number(), pitch: z.number() }),
  headDirection: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  eyeHeight: z.number().default(1.62), // Player eye height
  movementVelocity: z
    .object({ x: z.number(), y: z.number(), z: z.number() })
    .optional(),
});

export type AgentState = z.infer<typeof AgentStateSchema>;

/**
 * Field of view configuration
 */
export const FieldOfViewConfigSchema = z.object({
  horizontalFov: z.number().min(10).max(180).default(90), // degrees
  verticalFov: z.number().min(10).max(180).default(60), // degrees
  centralFocusAngle: z.number().min(5).max(60).default(30), // High acuity center
  peripheralAcuity: z.number().min(0.1).max(1).default(0.5), // Reduced peripheral vision
  maxDistance: z.number().positive().default(50), // blocks
});

export type FieldOfViewConfig = z.infer<typeof FieldOfViewConfigSchema>;

/**
 * Visual field representation
 */
export const VisualFieldSchema = z.object({
  centerDirection: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  fovConfig: FieldOfViewConfigSchema,
  rayDirections: z.array(
    z.object({ x: z.number(), y: z.number(), z: z.number() })
  ),
  acuityMap: z.map(z.string(), z.number()), // Direction -> acuity mapping
  lastUpdated: z.number(),
});

export type VisualField = z.infer<typeof VisualFieldSchema>;

// ===== OBJECT RECOGNITION =====

/**
 * Object types that can be recognized
 */
export const ObjectTypeSchema = z.enum([
  'block',
  'entity_player',
  'entity_mob_hostile',
  'entity_mob_neutral',
  'entity_mob_passive',
  'entity_item',
  'structure',
  'unknown',
]);

export type ObjectType = z.infer<typeof ObjectTypeSchema>;

/**
 * Visual features for object recognition
 */
export const VisualFeatureSchema = z.object({
  color: z.string().optional(), // Dominant color
  texture: z.string().optional(), // Texture identifier
  shape: z.enum(['cube', 'humanoid', 'animal', 'irregular']).optional(),
  size: z
    .object({ width: z.number(), height: z.number(), depth: z.number() })
    .optional(),
  animation: z.boolean().default(false), // Is animated/moving
  luminance: z.number().min(0).max(1).optional(), // Light emission
});

export type VisualFeature = z.infer<typeof VisualFeatureSchema>;

/**
 * Recognized object with confidence and metadata
 */
export const RecognizedObjectSchema = z.object({
  id: z.string(),
  type: ObjectTypeSchema,
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),

  // Recognition data
  recognitionConfidence: z.number().min(0).max(1),
  lastSeen: z.number(), // timestamp
  totalObservations: z.number().default(1),

  // Visual characteristics
  appearanceData: z.object({
    blockType: z.string().optional(),
    entityType: z.string().optional(),
    visualFeatures: z.array(VisualFeatureSchema),
  }),

  // Viewing conditions
  viewingConditions: z.object({
    distance: z.number().nonnegative(),
    lightLevel: z.number().min(0).max(15),
    occlusionPercent: z.number().min(0).max(1),
    isInPeriphery: z.boolean(),
    visualAcuity: z.number().min(0).max(1),
  }),

  // Behavioral observations (for entities)
  behaviorPattern: z
    .object({
      movementSpeed: z.number().nonnegative(),
      hostilityLevel: z.number().min(0).max(1),
      interactionHistory: z.array(z.string()),
    })
    .optional(),

  // Confidence tracking
  confidenceHistory: z.array(
    z.object({
      timestamp: z.number(),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
    })
  ),

  // Spatial tracking
  positionHistory: z.array(
    z.object({
      timestamp: z.number(),
      position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
      velocity: z
        .object({ x: z.number(), y: z.number(), z: z.number() })
        .optional(),
    })
  ),
});

export type RecognizedObject = z.infer<typeof RecognizedObjectSchema>;

// ===== CONFIDENCE TRACKING =====

/**
 * Confidence decay model
 */
export const ConfidenceDecayModelSchema = z.object({
  baseDecayRate: z.number().min(0).max(1).default(0.002), // per second
  distanceFactor: z.number().min(0).default(0.01), // additional decay per block
  contextSensitivity: z.record(z.number().min(0).max(2)), // object type -> decay multiplier
  refreshThreshold: z.number().min(0).max(1).default(0.3), // Re-observe below this
  pruningThreshold: z.number().min(0).max(1).default(0.1), // Remove below this
});

export type ConfidenceDecayModel = z.infer<typeof ConfidenceDecayModelSchema>;

/**
 * Confidence update result
 */
export const ConfidenceUpdateSchema = z.object({
  objectId: z.string(),
  previousConfidence: z.number().min(0).max(1),
  newConfidence: z.number().min(0).max(1),
  decayAmount: z.number().nonnegative(),
  reason: z.enum([
    'time_decay',
    'distance_decay',
    'occlusion',
    'refresh',
    'new_observation',
  ]),
  timestamp: z.number(),
});

export type ConfidenceUpdate = z.infer<typeof ConfidenceUpdateSchema>;

// ===== PERCEPTION PROCESSING =====

/**
 * Perception configuration
 */
export const PerceptionConfigSchema = z.object({
  fieldOfView: FieldOfViewConfigSchema,
  confidenceDecay: ConfidenceDecayModelSchema,

  // Recognition parameters
  recognition: z.object({
    maxRecognitionChecks: z.number().positive().default(100),
    minimumConfidenceToTrack: z.number().min(0).max(1).default(0.1),
    blockRecognitionEnabled: z.boolean().default(true),
    entityRecognitionEnabled: z.boolean().default(true),
    itemRecognitionEnabled: z.boolean().default(true),
  }),

  // Performance limits
  performance: z.object({
    maxRaysPerFrame: z.number().positive().default(500),
    maxProcessingTimeMs: z.number().positive().default(30),
    adaptiveResolution: z.boolean().default(true),
    cacheEnabled: z.boolean().default(true),
    batchProcessing: z.boolean().default(true),
  }),

  // Object classification
  objectClassification: z.object({
    ores: z.array(z.string()).default(['coal_ore', 'iron_ore', 'diamond_ore']),
    structures: z
      .array(z.string())
      .default(['chest', 'furnace', 'crafting_table']),
    hazards: z.array(z.string()).default(['lava', 'cactus', 'fire']),
    resources: z.array(z.string()).default(['oak_log', 'stone', 'dirt']),
    hostileEntities: z
      .array(z.string())
      .default(['zombie', 'skeleton', 'creeper']),
    neutralEntities: z
      .array(z.string())
      .default(['cow', 'sheep', 'pig', 'chicken']),
  }),
});

export type PerceptionConfig = z.infer<typeof PerceptionConfigSchema>;

/**
 * Perception update result
 */
export const PerceptionUpdateSchema = z.object({
  timestamp: z.number(),
  agentState: AgentStateSchema,

  // Current frame data
  newObservations: z.array(RecognizedObjectSchema),
  updatedObservations: z.array(RecognizedObjectSchema),
  lostObservations: z.array(z.string()), // IDs of objects no longer visible

  // Confidence updates
  confidenceUpdates: z.array(ConfidenceUpdateSchema),

  // Performance metrics
  performance: z.object({
    processingTimeMs: z.number().nonnegative(),
    raysCast: z.number().nonnegative(),
    objectsRecognized: z.number().nonnegative(),
    confidenceUpdatesApplied: z.number().nonnegative(),
    cacheHitRate: z.number().min(0).max(1),
  }),

  // Visual field info
  visualField: VisualFieldSchema,

  // Recognition stats
  recognitionStats: z.object({
    totalTrackedObjects: z.number().nonnegative(),
    highConfidenceObjects: z.number().nonnegative(),
    mediumConfidenceObjects: z.number().nonnegative(),
    lowConfidenceObjects: z.number().nonnegative(),
    averageConfidence: z.number().min(0).max(1),
  }),
});

export type PerceptionUpdate = z.infer<typeof PerceptionUpdateSchema>;

// ===== SPATIAL AWARENESS =====

/**
 * Spatial area for queries
 */
export const SpatialAreaSchema = z.object({
  center: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  radius: z.number().positive(),
  includeVertical: z.boolean().default(true),
  minConfidence: z.number().min(0).max(1).optional(),
});

export type SpatialArea = z.infer<typeof SpatialAreaSchema>;

/**
 * Perceptual awareness of an area
 */
export const PerceptualAwarenessSchema = z.object({
  queryArea: SpatialAreaSchema,
  timestamp: z.number(),

  // Objects in the area
  visibleObjects: z.array(RecognizedObjectSchema),
  rememberedObjects: z.array(RecognizedObjectSchema), // Previously seen but not currently visible

  // Coverage information
  coverage: z.object({
    totalAreaQueried: z.number().nonnegative(),
    directlyObservableArea: z.number().nonnegative(),
    occludedArea: z.number().nonnegative(),
    coveragePercentage: z.number().min(0).max(1),
  }),

  // Confidence information
  overallConfidence: z.number().min(0).max(1),
  stalenessFactors: z.record(z.number()), // area -> staleness

  // Exploration recommendations
  explorationPriority: z.number().min(0).max(1),
  suggestedViewpoints: z.array(
    z.object({
      position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
      expectedCoverage: z.number().min(0).max(1),
      accessibilityRating: z.number().min(0).max(1),
    })
  ),
});

export type PerceptualAwareness = z.infer<typeof PerceptualAwarenessSchema>;

// ===== ATTENTION AND FOCUS =====

/**
 * Visual stimulus requiring attention
 */
export const VisualStimulusSchema = z.object({
  id: z.string(),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  type: z.enum([
    'movement',
    'new_object',
    'color_change',
    'light_change',
    'sound_visual',
  ]),
  intensity: z.number().min(0).max(1),
  duration: z.number().nonnegative(), // ms
  novelty: z.number().min(0).max(1), // How new/unexpected is this
});

export type VisualStimulus = z.infer<typeof VisualStimulusSchema>;

/**
 * Attention model for managing focus
 */
export const AttentionModelSchema = z.object({
  bottomUpWeight: z.number().min(0).max(1).default(0.3), // Stimulus-driven attention
  topDownWeight: z.number().min(0).max(1).default(0.7), // Goal-driven attention
  inhibitionOfReturn: z.boolean().default(true), // Avoid returning to recently attended locations
  attentionSpan: z.number().positive().default(3000), // ms
  maxSimultaneousTargets: z.number().positive().default(3),
});

export type AttentionModel = z.infer<typeof AttentionModelSchema>;

/**
 * Attention allocation result
 */
export const AttentionAllocationSchema = z.object({
  timestamp: z.number(),
  primaryFocus: z.object({
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    objectId: z.string().optional(),
    attentionWeight: z.number().min(0).max(1),
    reason: z.string(),
  }),
  secondaryTargets: z.array(
    z.object({
      position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
      objectId: z.string().optional(),
      attentionWeight: z.number().min(0).max(1),
      reason: z.string(),
    })
  ),
  suppressedStimuli: z.array(z.string()), // IDs of ignored stimuli
  attentionHistory: z.array(
    z.object({
      timestamp: z.number(),
      target: z.object({ x: z.number(), y: z.number(), z: z.number() }),
      duration: z.number().nonnegative(),
    })
  ),
});

export type AttentionAllocation = z.infer<typeof AttentionAllocationSchema>;

// ===== INTERFACES =====

/**
 * Visual field manager interface
 */
export interface IVisualFieldManager {
  updateVisualField(
    headDirection: Direction,
    fieldOfView: FieldOfViewConfig
  ): VisualField;

  calculateVisualAcuity(
    objectPosition: Vec3,
    gazeCenter: Vec3,
    visualField: VisualField
  ): number;

  isWithinFieldOfView(objectPosition: Vec3, visualField: VisualField): boolean;

  manageVisualAttention(
    stimuli: VisualStimulus[],
    attentionModel: AttentionModel
  ): AttentionAllocation;
}

/**
 * Object recognition interface
 */
export interface IObjectRecognition {
  recognizeObjects(
    observations: Observation[],
    viewingConditions: Map<string, any>,
    config: PerceptionConfig
  ): RecognizedObject[];

  calculateRecognitionConfidence(object: any, viewingConditions: any): number;

  trackObjectPersistence(
    newObservations: RecognizedObject[],
    previousTracking: Map<string, RecognizedObject>
  ): Map<string, RecognizedObject>;

  identifyEntities(
    entityObservations: any[],
    behavioralContext: any
  ): RecognizedObject[];
}

/**
 * Confidence tracker interface
 */
export interface IConfidenceTracker {
  recordObservation(
    observation: RecognizedObject,
    initialConfidence: number
  ): RecognizedObject;

  updateConfidenceLevels(
    trackedObjects: Map<string, RecognizedObject>,
    timeElapsed: number,
    decayModel: ConfidenceDecayModel
  ): ConfidenceUpdate[];

  refreshObservation(
    objectId: string,
    newObservation: RecognizedObject,
    trackedObjects: Map<string, RecognizedObject>
  ): RecognizedObject;

  pruneStaleObservations(
    trackedObjects: Map<string, RecognizedObject>,
    minimumConfidence: number
  ): string[];
}

/**
 * Perception integration interface
 */
export interface IPerceptionIntegration {
  updatePerception(
    agentState: AgentState,
    config: PerceptionConfig
  ): Promise<PerceptionUpdate>;

  queryPerceptualAwareness(
    queryArea: SpatialArea,
    confidenceThreshold?: number
  ): PerceptualAwareness;

  getTrackedObjects(
    filter?: (obj: RecognizedObject) => boolean
  ): RecognizedObject[];

  identifyPerceptionGaps(
    currentKnowledge: Map<string, RecognizedObject>,
    explorationGoals: any[]
  ): SpatialArea[];
}

// ===== UTILITY FUNCTIONS =====

/**
 * Calculate angular distance between two directions
 */
export function angularDistance(dir1: Direction, dir2: Direction): number {
  const dot = dir1.x * dir2.x + dir1.y * dir2.y + dir1.z * dir2.z;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

/**
 * Convert field of view degrees to radians
 */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Check if a position is within a cone of vision
 */
export function isInVisionCone(
  objectPos: Vec3,
  eyePos: Vec3,
  lookDirection: Direction,
  fovRadians: number
): boolean {
  const toObject = {
    x: objectPos.x - eyePos.x,
    y: objectPos.y - eyePos.y,
    z: objectPos.z - eyePos.z,
  };

  const distance = Math.sqrt(
    toObject.x ** 2 + toObject.y ** 2 + toObject.z ** 2
  );
  if (distance === 0) return true;

  const normalizedDir = {
    x: toObject.x / distance,
    y: toObject.y / distance,
    z: toObject.z / distance,
  };

  const angle = angularDistance(normalizedDir, lookDirection);
  return angle <= fovRadians / 2;
}

/**
 * Calculate visual acuity based on distance from gaze center
 */
export function calculateAcuity(
  angleFomCenter: number,
  centralFocusAngle: number,
  peripheralAcuity: number
): number {
  const centralRadius = degreesToRadians(centralFocusAngle / 2);

  if (angleFomCenter <= centralRadius) {
    return 1.0; // Full acuity in central vision
  }

  // Linear falloff to peripheral acuity
  const peripheralRadius = degreesToRadians(90); // Max peripheral vision
  const falloffFactor =
    (angleFomCenter - centralRadius) / (peripheralRadius - centralRadius);

  return Math.max(
    peripheralAcuity,
    1.0 - falloffFactor * (1.0 - peripheralAcuity)
  );
}

// Export validation functions
export const validateAgentState = (data: unknown): AgentState =>
  AgentStateSchema.parse(data);

export const validatePerceptionConfig = (data: unknown): PerceptionConfig =>
  PerceptionConfigSchema.parse(data);

export const validateRecognizedObject = (data: unknown): RecognizedObject =>
  RecognizedObjectSchema.parse(data);

export const validatePerceptionUpdate = (data: unknown): PerceptionUpdate =>
  PerceptionUpdateSchema.parse(data);
