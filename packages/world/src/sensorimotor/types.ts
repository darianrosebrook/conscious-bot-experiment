/**
 * Sensorimotor System Types - Embodied motor control and sensory integration
 *
 * Implements the sensorimotor loop for grounded embodied intelligence with
 * real-time motor control, sensory feedback, and predictive coordination.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ===== CORE SENSORIMOTOR TYPES =====

/**
 * 3D vector for motor control and spatial representation
 */
export const Vector3DSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export type Vector3D = z.infer<typeof Vector3DSchema>;

/**
 * Precise location with orientation for motor actions
 */
export const PreciseLocationSchema = z.object({
  position: Vector3DSchema,
  orientation: z
    .object({
      yaw: z.number(), // Rotation around Y-axis (radians)
      pitch: z.number(), // Rotation around X-axis (radians)
      roll: z.number().optional(), // Rotation around Z-axis (radians)
    })
    .optional(),
  timestamp: z.number(),
  confidence: z.number().min(0).max(1).default(1.0),
});

export type PreciseLocation = z.infer<typeof PreciseLocationSchema>;

/**
 * Motor action types and categories
 */
export const MotorActionTypeSchema = z.enum([
  // Locomotion
  'move_forward',
  'move_backward',
  'strafe_left',
  'strafe_right',
  'turn_left',
  'turn_right',
  'jump',
  'crouch',
  'sprint',
  'swim',
  'climb',
  'stop',

  // Manipulation
  'mine_block',
  'place_block',
  'interact_block',
  'pickup_item',
  'drop_item',
  'use_item',
  'craft_item',
  'wield_tool',

  // Communication
  'chat_message',
  'gesture',
  'look_at',
  'point',

  // Complex actions
  'compound_action',
  'emergency_response',
]);

export type MotorActionType = z.infer<typeof MotorActionTypeSchema>;

/**
 * Motor action command with parameters
 */
export const MotorActionSchema = z.object({
  id: z.string(),
  type: MotorActionTypeSchema,
  parameters: z.record(z.any()),
  priority: z.number().min(0).max(1).default(0.5),
  duration: z.number().nonnegative().optional(), // ms
  startTime: z.number().optional(),
  deadline: z.number().optional(),
  requiredPrecision: z.number().min(0).max(1).default(0.5),
  feedback: z.boolean().default(true),
  metadata: z.record(z.any()).optional(),
});

export type MotorAction = z.infer<typeof MotorActionSchema>;

/**
 * Motor execution context
 */
export const ExecutionContextSchema = z.object({
  currentPosition: PreciseLocationSchema,
  currentVelocity: Vector3DSchema.optional(),
  environmentConditions: z.object({
    lighting: z.number().min(0).max(15).default(15),
    weather: z.enum(['clear', 'rain', 'snow', 'storm']).default('clear'),
    temperature: z.number().default(20), // Celsius
    terrain: z
      .enum(['flat', 'hilly', 'mountainous', 'underwater'])
      .default('flat'),
  }),
  constraints: z.object({
    maxSpeed: z.number().positive().default(4.3),
    maxAcceleration: z.number().positive().default(2.0),
    maxForce: z.number().positive().default(10.0),
    collisionAvoidance: z.boolean().default(true),
  }),
  resources: z.object({
    energy: z.number().min(0).max(1).default(1.0),
    health: z.number().min(0).max(1).default(1.0),
    inventory: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([]),
  }),
});

export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;

// ===== MOTOR CONTROL RESULTS =====

/**
 * Motor execution result
 */
export const MotorExecutionResultSchema = z.object({
  actionId: z.string(),
  success: z.boolean(),
  executionTime: z.number().nonnegative(), // ms
  actualDuration: z.number().nonnegative().optional(), // ms
  finalPosition: PreciseLocationSchema.optional(),
  achievedPrecision: z.number().min(0).max(1).optional(),
  performanceMetrics: z
    .object({
      efficiency: z.number().min(0).max(1),
      accuracy: z.number().min(0).max(1),
      smoothness: z.number().min(0).max(1),
      energyUsed: z.number().nonnegative(),
    })
    .optional(),
  feedback: z.any().optional(),
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export type MotorExecutionResult = z.infer<typeof MotorExecutionResultSchema>;

/**
 * Coordination strategy for multiple actions
 */
export const CoordinationStrategySchema = z.object({
  type: z.enum(['sequential', 'parallel', 'interleaved', 'conditional']),
  timing: z.object({
    synchronization: z.boolean().default(false),
    timingTolerance: z.number().nonnegative().default(10), // ms
    priority: z.enum(['time', 'accuracy', 'efficiency']).default('time'),
  }),
  conflictResolution: z.enum([
    'priority_based',
    'resource_sharing',
    'temporal_separation',
    'preemption',
  ]),
  adaptability: z.number().min(0).max(1).default(0.5),
});

export type CoordinationStrategy = z.infer<typeof CoordinationStrategySchema>;

/**
 * Coordination execution result
 */
export const CoordinationResultSchema = z.object({
  success: z.boolean(),
  coordinatedActions: z.array(z.string()), // Action IDs
  totalExecutionTime: z.number().nonnegative(),
  coordination: z.object({
    synchronizationAccuracy: z.number().min(0).max(1),
    conflictsResolved: z.number().nonnegative(),
    resourceUtilization: z.number().min(0).max(1),
  }),
  individualResults: z.array(MotorExecutionResultSchema),
  coordinationMetrics: z
    .object({
      temporalPrecision: z.number().min(0).max(1),
      spatialCoordination: z.number().min(0).max(1),
      overallEfficiency: z.number().min(0).max(1),
    })
    .optional(),
});

export type CoordinationResult = z.infer<typeof CoordinationResultSchema>;

// ===== SENSORY FEEDBACK TYPES =====

/**
 * Raw sensory data from environment
 */
export const RawSensoryDataSchema = z.object({
  timestamp: z.number(),
  source: z.enum([
    'visual',
    'auditory',
    'tactile',
    'proprioceptive',
    'environmental',
  ]),
  data: z.record(z.any()),
  quality: z.number().min(0).max(1).default(1.0),
  latency: z.number().nonnegative().default(0), // ms
});

export type RawSensoryData = z.infer<typeof RawSensoryDataSchema>;

/**
 * Processed sensory feedback
 */
export const ProcessedFeedbackSchema = z.object({
  actionId: z.string(),
  feedbackType: z.enum([
    'action_confirmation',
    'outcome_verification',
    'error_detection',
    'performance_assessment',
    'environmental_change',
  ]),
  confidence: z.number().min(0).max(1),
  relevance: z.number().min(0).max(1),
  interpretation: z.object({
    success: z.boolean(),
    accuracy: z.number().min(0).max(1).optional(),
    deviation: z.number().nonnegative().optional(),
    unexpectedOutcomes: z.array(z.string()).default([]),
  }),
  learningSignal: z
    .object({
      predictionError: z.number(),
      adjustmentRequired: z.boolean(),
      learningWeight: z.number().min(0).max(1),
    })
    .optional(),
  timestamp: z.number(),
});

export type ProcessedFeedback = z.infer<typeof ProcessedFeedbackSchema>;

/**
 * Motor adjustment based on feedback
 */
export const MotorAdjustmentResultSchema = z.object({
  actionId: z.string(),
  adjustmentType: z.enum([
    'correction',
    'compensation',
    'recalibration',
    'abort',
  ]),
  adjustmentMagnitude: z.number().nonnegative(),
  success: z.boolean(),
  newParameters: z.record(z.any()).optional(),
  estimatedImprovement: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1),
  timestamp: z.number(),
});

export type MotorAdjustmentResult = z.infer<typeof MotorAdjustmentResultSchema>;

// ===== PREDICTION AND LEARNING =====

/**
 * Sensory prediction for motor action
 */
export const SensoryPredictionSchema = z.object({
  actionId: z.string(),
  predictedOutcomes: z.array(
    z.object({
      outcome: z.string(),
      probability: z.number().min(0).max(1),
      confidence: z.number().min(0).max(1),
      timeToOutcome: z.number().nonnegative(), // ms
    })
  ),
  predictedSensations: z.array(
    z.object({
      sensation: z.string(),
      intensity: z.number().min(0).max(1),
      timing: z.number().nonnegative(), // ms from action start
      modality: z.enum(['visual', 'auditory', 'tactile', 'proprioceptive']),
    })
  ),
  predictionConfidence: z.number().min(0).max(1),
  uncertaintyFactors: z.array(z.string()).default([]),
  timestamp: z.number(),
});

export type SensoryPrediction = z.infer<typeof SensoryPredictionSchema>;

/**
 * Observed outcome for prediction comparison
 */
export const ObservedOutcomeSchema = z.object({
  actionId: z.string(),
  actualOutcomes: z.array(
    z.object({
      outcome: z.string(),
      occurred: z.boolean(),
      timing: z.number().nonnegative().optional(), // ms
      intensity: z.number().min(0).max(1).optional(),
    })
  ),
  actualSensations: z.array(
    z.object({
      sensation: z.string(),
      intensity: z.number().min(0).max(1),
      timing: z.number().nonnegative(),
      modality: z.enum(['visual', 'auditory', 'tactile', 'proprioceptive']),
    })
  ),
  unexpectedEvents: z.array(z.string()).default([]),
  observationQuality: z.number().min(0).max(1),
  timestamp: z.number(),
});

export type ObservedOutcome = z.infer<typeof ObservedOutcomeSchema>;

/**
 * Discrepancy analysis between prediction and observation
 */
export const DiscrepancyAnalysisSchema = z.object({
  actionId: z.string(),
  predictionAccuracy: z.number().min(0).max(1),
  majorDiscrepancies: z.array(
    z.object({
      type: z.enum([
        'false_positive',
        'false_negative',
        'timing_error',
        'intensity_error',
      ]),
      description: z.string(),
      severity: z.number().min(0).max(1),
      potentialCauses: z.array(z.string()),
    })
  ),
  learningOpportunities: z.array(
    z.object({
      modelComponent: z.string(),
      adjustmentType: z.string(),
      expectedImprovement: z.number().min(0).max(1),
    })
  ),
  overallDiscrepancyMagnitude: z.number().nonnegative(),
  timestamp: z.number(),
});

export type DiscrepancyAnalysis = z.infer<typeof DiscrepancyAnalysisSchema>;

// ===== EMERGENCY AND SAFETY =====

/**
 * Emergency response types
 */
export const EmergencyTypeSchema = z.enum([
  'collision_imminent',
  'fall_danger',
  'hostile_mob',
  'environmental_hazard',
  'equipment_failure',
  'health_critical',
  'navigation_failure',
  'system_overload',
]);

export type EmergencyType = z.infer<typeof EmergencyTypeSchema>;

/**
 * Emergency response result
 */
export const EmergencyResponseResultSchema = z.object({
  emergencyType: EmergencyTypeSchema,
  responseTime: z.number().nonnegative(), // ms
  success: z.boolean(),
  actionsExecuted: z.array(z.string()),
  safetyStatus: z.enum(['safe', 'caution', 'danger', 'critical']),
  recoveryPlan: z
    .object({
      steps: z.array(z.string()),
      estimatedTime: z.number().nonnegative(),
      successProbability: z.number().min(0).max(1),
    })
    .optional(),
  timestamp: z.number(),
});

export type EmergencyResponseResult = z.infer<
  typeof EmergencyResponseResultSchema
>;

// ===== CONFIGURATION =====

/**
 * Sensorimotor system configuration
 */
export const SensorimotorConfigSchema = z.object({
  motorControl: z.object({
    controlFrequency: z.number().positive().default(50), // Hz
    precisionThreshold: z.number().positive().default(0.1), // blocks
    timingTolerance: z.number().positive().default(10), // ms
    maxRetries: z.number().nonnegative().default(3),
  }),

  movementParameters: z.object({
    maxSpeed: z.number().positive().default(4.3), // blocks/second
    acceleration: z.number().positive().default(2.0), // blocks/second²
    turningSpeed: z.number().positive().default(90), // degrees/second
    jumpHeight: z.number().positive().default(1.25), // blocks
    stepHeight: z.number().positive().default(0.6), // blocks
  }),

  coordination: z.object({
    conflictResolution: z
      .enum(['priority_based', 'resource_sharing', 'temporal_separation'])
      .default('priority_based'),
    timingSynchronization: z.boolean().default(true),
    feedbackIntegration: z
      .enum(['real_time', 'batch', 'adaptive'])
      .default('real_time'),
    coordinationTimeout: z.number().positive().default(5000), // ms
  }),

  feedbackProcessing: z.object({
    bufferDuration: z.number().positive().default(100), // ms
    processingFrequency: z.number().positive().default(20), // Hz
    learningRate: z.number().positive().default(0.01),
    confidenceThreshold: z.number().min(0).max(1).default(0.7),
  }),

  prediction: z.object({
    predictionHorizon: z.number().positive().default(500), // ms
    modelUpdateFrequency: z.number().positive().default(1), // Hz
    predictionConfidenceThreshold: z.number().min(0).max(1).default(0.6),
    maxPredictionAge: z.number().positive().default(1000), // ms
  }),

  performance: z.object({
    latencyMonitoring: z.boolean().default(true),
    efficiencyTracking: z.boolean().default(true),
    calibrationFrequency: z.number().positive().default(3600), // seconds
    performanceLogging: z.boolean().default(true),
  }),

  safety: z.object({
    emergencyResponseTime: z.number().positive().default(5), // ms
    collisionAvoidance: z.boolean().default(true),
    safetyMargin: z.number().nonnegative().default(0.5), // blocks
    automaticRecovery: z.boolean().default(true),
    boundaryEnforcement: z.boolean().default(true),
  }),
});

export type SensorimotorConfig = z.infer<typeof SensorimotorConfigSchema>;

// ===== PERFORMANCE METRICS =====

/**
 * Sensorimotor performance metrics
 */
export const SensorimotorMetricsSchema = z.object({
  motorControl: z.object({
    executionLatency: z.object({
      mean: z.number().nonnegative(),
      p95: z.number().nonnegative(),
      p99: z.number().nonnegative(),
    }),
    successRate: z.number().min(0).max(1),
    precisionAccuracy: z.number().min(0).max(1),
    energyEfficiency: z.number().min(0).max(1),
  }),

  coordination: z.object({
    synchronizationAccuracy: z.number().min(0).max(1),
    conflictResolutionTime: z.number().nonnegative(), // ms
    multiActionSuccessRate: z.number().min(0).max(1),
    resourceUtilization: z.number().min(0).max(1),
  }),

  feedback: z.object({
    feedbackLatency: z.number().nonnegative(), // ms
    predictionAccuracy: z.number().min(0).max(1),
    learningRate: z.number().min(0).max(1),
    adaptationSpeed: z.number().min(0).max(1),
  }),

  safety: z.object({
    emergencyResponseTime: z.number().nonnegative(), // ms
    hazardDetectionRate: z.number().min(0).max(1),
    recoverySuccessRate: z.number().min(0).max(1),
    safetyViolations: z.number().nonnegative(),
  }),
});

export type SensorimotorMetrics = z.infer<typeof SensorimotorMetricsSchema>;

// ===== INTERFACES =====

/**
 * Motor controller interface
 */
export interface IMotorController {
  executeMotorAction(
    action: MotorAction,
    context: ExecutionContext
  ): Promise<MotorExecutionResult>;

  coordinateActionSequence(
    actions: MotorAction[],
    strategy: CoordinationStrategy
  ): Promise<CoordinationResult>;

  adjustMotorAction(
    actionId: string,
    feedback: ProcessedFeedback
  ): MotorAdjustmentResult;

  executeEmergencyResponse(
    emergencyType: EmergencyType,
    currentState: any
  ): Promise<EmergencyResponseResult>;

  calibrateMotorResponses(environmentConditions: any): Promise<void>;

  getCurrentState(): any;
  stop(): void;
}

/**
 * Sensory feedback processor interface
 */
export interface ISensoryFeedbackProcessor {
  processFeedback(actionId: string, rawData: RawSensoryData): ProcessedFeedback;

  detectOutcomeDiscrepancies(
    prediction: SensoryPrediction,
    outcome: ObservedOutcome
  ): DiscrepancyAnalysis;

  integrateMultimodalFeedback(
    visualFeedback: any,
    proprioceptiveFeedback: any,
    environmentalFeedback: any
  ): any;

  learnFromFeedback(feedbackHistory: ProcessedFeedback[]): Promise<void>;

  getProcessingStatistics(): any;
}

/**
 * Action executor interface
 */
export interface IActionExecutor {
  executeMovement(
    movementCommand: any,
    parameters: any
  ): Promise<MotorExecutionResult>;

  executeManipulation(
    manipulationAction: any,
    targetLocation: PreciseLocation
  ): Promise<MotorExecutionResult>;

  executeCommunication(
    communicationAction: any,
    context: any
  ): Promise<MotorExecutionResult>;

  executeCompoundAction(
    compoundAction: any,
    strategy: CoordinationStrategy
  ): Promise<MotorExecutionResult>;

  getCurrentCapabilities(): string[];
  isCapable(actionType: MotorActionType): boolean;
}

/**
 * Sensorimotor predictor interface
 */
export interface ISensorimotorPredictor {
  predictSensoryOutcome(
    action: MotorAction,
    currentState: any
  ): SensoryPrediction;

  updatePredictiveModel(
    prediction: SensoryPrediction,
    outcome: ObservedOutcome
  ): Promise<void>;

  predictOptimalMotorParameters(desiredOutcome: any, constraints: any): any;

  simulateActionSequence(actions: MotorAction[], parameters: any): Promise<any>;

  getPredictionAccuracy(): number;
}

// ===== UTILITY FUNCTIONS =====

/**
 * Calculate distance between two 3D points
 */
export function calculateDistance(a: Vector3D, b: Vector3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Normalize a 3D vector
 */
export function normalize(vector: Vector3D): Vector3D {
  const length = Math.sqrt(
    vector.x * vector.x + vector.y * vector.y + vector.z * vector.z
  );
  if (length === 0) return { x: 0, y: 0, z: 0 };
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

/**
 * Calculate motor action priority based on context
 */
export function calculateActionPriority(
  action: MotorAction,
  context: ExecutionContext
): number {
  let priority = action.priority;

  // Emergency actions get highest priority
  if (action.type === 'emergency_response') {
    priority = 1.0;
  }

  // Adjust for deadline pressure
  if (action.deadline) {
    const timeRemaining = action.deadline - Date.now();
    const urgencyFactor = Math.max(0, 1 - timeRemaining / 5000); // 5 second baseline
    priority = Math.min(1.0, priority + urgencyFactor * 0.3);
  }

  // Adjust for resource constraints
  if (context.resources.energy < 0.2) {
    // Low energy reduces non-essential action priority
    if (!['emergency_response', 'stop'].includes(action.type)) {
      priority *= 0.7;
    }
  }

  return Math.max(0, Math.min(1, priority));
}

/**
 * Estimate motor action duration
 */
export function estimateActionDuration(
  action: MotorAction,
  context: ExecutionContext
): number {
  // Base durations by action type (ms)
  const baseDurations: Record<string, number> = {
    move_forward: 100,
    move_backward: 120,
    strafe_left: 110,
    strafe_right: 110,
    turn_left: 200,
    turn_right: 200,
    jump: 300,
    crouch: 100,
    sprint: 50,
    swim: 150,
    climb: 500,
    stop: 50,
    mine_block: 1000,
    place_block: 200,
    interact_block: 150,
    pickup_item: 100,
    drop_item: 100,
    use_item: 300,
    craft_item: 500,
    wield_tool: 200,
    chat_message: 1000,
    gesture: 500,
    look_at: 100,
    point: 300,
    compound_action: 2000,
    emergency_response: 100,
  };

  let duration = baseDurations[action.type] || 500;

  // Adjust for environmental conditions
  if (context.environmentConditions.weather === 'rain') {
    duration *= 1.2; // 20% slower in rain
  }

  if (context.environmentConditions.lighting < 7) {
    duration *= 1.1; // 10% slower in darkness
  }

  // Adjust for precision requirements
  if (action.requiredPrecision > 0.8) {
    duration *= 1.5; // 50% longer for high precision
  }

  return Math.max(50, duration); // Minimum 50ms
}

/**
 * Check if two motor actions conflict
 */
export function actionsConflict(
  action1: MotorAction,
  action2: MotorAction
): boolean {
  // Movement actions generally conflict with each other
  const movementActions = [
    'move_forward',
    'move_backward',
    'strafe_left',
    'strafe_right',
    'turn_left',
    'turn_right',
    'jump',
    'crouch',
    'sprint',
    'swim',
    'climb',
  ];

  if (
    movementActions.includes(action1.type) &&
    movementActions.includes(action2.type)
  ) {
    return action1.type !== action2.type;
  }

  // Tool/hand actions conflict
  const handActions = [
    'mine_block',
    'place_block',
    'interact_block',
    'pickup_item',
    'drop_item',
    'use_item',
    'wield_tool',
  ];

  if (
    handActions.includes(action1.type) &&
    handActions.includes(action2.type)
  ) {
    return true;
  }

  // Communication actions can generally run with others
  return false;
}

// Export validation functions
export const validateMotorAction = (data: unknown): MotorAction =>
  MotorActionSchema.parse(data);

export const validateExecutionContext = (data: unknown): ExecutionContext =>
  ExecutionContextSchema.parse(data);

export const validateSensorimotorConfig = (data: unknown): SensorimotorConfig =>
  SensorimotorConfigSchema.parse(data);

export const validateMotorExecutionResult = (
  data: unknown
): MotorExecutionResult => MotorExecutionResultSchema.parse(data);

export const validateProcessedFeedback = (data: unknown): ProcessedFeedback =>
  ProcessedFeedbackSchema.parse(data);
