/**
 * Real-Time Performance Monitoring Types
 *
 * Comprehensive type system for performance tracking, budget enforcement,
 * degradation management, and real-time constraint monitoring.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ===== PERFORMANCE CONTEXTS AND BUDGETS =====

/**
 * Performance context types that determine budget allocation
 */
export enum PerformanceContext {
  EMERGENCY = 'emergency', // Combat, falling, lava - 50ms p95
  ROUTINE = 'routine', // Exploration, building - 200ms p95
  DELIBERATIVE = 'deliberative', // Complex planning - 1000ms p95
}

/**
 * Performance budget configuration
 */
export const BudgetConfigSchema = z.object({
  total: z.number().positive(),
  allocation: z.object({
    signalProcessing: z.number().nonnegative(),
    routing: z.number().nonnegative(),
    execution: z.number().nonnegative(),
  }),
  triggers: z.array(z.string()),
});

export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;

/**
 * Complete performance budget framework
 */
export const PerformanceBudgetsSchema = z.object({
  emergency: BudgetConfigSchema,
  routine: BudgetConfigSchema,
  deliberative: BudgetConfigSchema,
});

export type PerformanceBudgets = z.infer<typeof PerformanceBudgetsSchema>;

// ===== OPERATIONS AND TRACKING =====

/**
 * Types of cognitive operations being tracked
 */
export enum OperationType {
  SIGNAL_PROCESSING = 'signal_processing',
  ROUTING_DECISION = 'routing_decision',
  CAPABILITY_EXECUTION = 'capability_execution',
  MEMORY_OPERATION = 'memory_operation',
  PLANNING_OPERATION = 'planning_operation',
  LLM_INFERENCE = 'llm_inference',
  WORLD_INTERACTION = 'world_interaction',
}

/**
 * Cognitive operation being tracked
 */
export const CognitiveOperationSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(OperationType),
  name: z.string(),
  module: z.string(),
  priority: z.number().min(0).max(1),
  expectedDuration: z.number().positive().optional(),
  metadata: z.record(z.any()).optional(),
});

export type CognitiveOperation = z.infer<typeof CognitiveOperationSchema>;

/**
 * Operation result with performance data
 */
export const OperationResultSchema = z.object({
  success: z.boolean(),
  duration: z.number().nonnegative(),
  resourcesUsed: z.object({
    cpu: z.number().nonnegative(),
    memory: z.number().nonnegative(),
    network: z.number().nonnegative().optional(),
  }),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type OperationResult = z.infer<typeof OperationResultSchema>;

// ===== PERFORMANCE METRICS =====

/**
 * Latency distribution statistics
 */
export const LatencyDistributionSchema = z.object({
  p50: z.number().nonnegative(),
  p95: z.number().nonnegative(),
  p99: z.number().nonnegative(),
  max: z.number().nonnegative(),
  mean: z.number().nonnegative(),
  stddev: z.number().nonnegative(),
  samples: z.number().nonnegative(),
});

export type LatencyDistribution = z.infer<typeof LatencyDistributionSchema>;

/**
 * Comprehensive performance metrics
 */
export const PerformanceMetricsSchema = z.object({
  latency: LatencyDistributionSchema,
  throughput: z.object({
    operationsPerSecond: z.number().nonnegative(),
    requestsProcessed: z.number().nonnegative(),
    requestsDropped: z.number().nonnegative(),
    queueDepth: z.number().nonnegative(),
  }),
  resources: z.object({
    cpuUtilization: z.number().min(0).max(1),
    memoryUsage: z.number().nonnegative(),
    gcPressure: z.number().nonnegative(),
    threadUtilization: z.number().min(0).max(1),
  }),
  quality: z.object({
    successRate: z.number().min(0).max(1),
    errorRate: z.number().min(0).max(1),
    timeoutRate: z.number().min(0).max(1),
    retryRate: z.number().min(0).max(1),
  }),
  timestamp: z.number(),
});

export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;

// ===== TRACKING SESSIONS =====

/**
 * Active performance tracking session
 */
export const TrackingSessionSchema = z.object({
  id: z.string(),
  operation: CognitiveOperationSchema,
  context: z.nativeEnum(PerformanceContext),
  startTime: z.number(),
  budget: z.number().positive(),
  checkpoints: z.array(
    z.object({
      name: z.string(),
      timestamp: z.number(),
      progress: z.number().min(0).max(1),
    })
  ),
  warnings: z.array(z.string()),
  active: z.boolean(),
});

export type TrackingSession = z.infer<typeof TrackingSessionSchema>;

// ===== BUDGET MANAGEMENT =====

/**
 * Budget allocation for an operation
 */
export const BudgetAllocationSchema = z.object({
  sessionId: z.string(),
  totalBudget: z.number().positive(),
  allocatedBudget: z.number().positive(),
  reservedBuffer: z.number().nonnegative(),
  context: z.nativeEnum(PerformanceContext),
  allocation: z.object({
    signalProcessing: z.number().nonnegative(),
    routing: z.number().nonnegative(),
    execution: z.number().nonnegative(),
  }),
  adjustmentFactors: z.record(z.number()),
  expiryTime: z.number(),
});

export type BudgetAllocation = z.infer<typeof BudgetAllocationSchema>;

/**
 * Current budget utilization status
 */
export const BudgetStatusSchema = z.object({
  utilization: z.number().min(0),
  remaining: z.number().nonnegative(),
  projectedOverrun: z.number().nonnegative(),
  warningLevel: z.enum(['none', 'low', 'medium', 'high', 'critical']),
  timeRemaining: z.number().nonnegative(),
  recommendedAction: z.enum(['continue', 'optimize', 'degrade', 'abort']),
});

export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;

/**
 * Budget violation details
 */
export const BudgetViolationSchema = z.object({
  sessionId: z.string(),
  operationType: z.nativeEnum(OperationType),
  budgetExceeded: z.number().positive(),
  actualDuration: z.number().positive(),
  allocatedBudget: z.number().positive(),
  severity: z.enum(['minor', 'moderate', 'major', 'critical']),
  context: z.nativeEnum(PerformanceContext),
  timestamp: z.number(),
  stackTrace: z.string().optional(),
});

export type BudgetViolation = z.infer<typeof BudgetViolationSchema>;

// ===== DEGRADATION MANAGEMENT =====

/**
 * Degradation levels for graceful fallback
 */
export enum DegradationLevel {
  NONE = 0, // Full functionality
  MINIMAL = 1, // Minor feature reduction
  MODERATE = 2, // Significant capability reduction
  SEVERE = 3, // Emergency functionality only
  CRITICAL = 4, // Safety-only operation
}

/**
 * Degradation strategy specification
 */
export const DegradationStrategySchema = z.object({
  level: z.nativeEnum(DegradationLevel),
  actions: z.array(z.string()),
  expectedImprovement: z.string(),
  impactLevel: z.enum(['low', 'medium', 'high', 'critical']),
  estimatedDuration: z.number().positive(),
  reversible: z.boolean(),
  dependencies: z.array(z.string()),
});

export type DegradationStrategy = z.infer<typeof DegradationStrategySchema>;

/**
 * Current degradation state
 */
export const DegradationStateSchema = z.object({
  currentLevel: z.nativeEnum(DegradationLevel),
  activeStrategies: z.array(DegradationStrategySchema),
  triggeredAt: z.number(),
  reason: z.string(),
  disabledFeatures: z.array(z.string()),
  performance: z.object({
    baselineLatency: z.number(),
    currentLatency: z.number(),
    improvement: z.number(),
  }),
  recoveryEligible: z.boolean(),
});

export type DegradationState = z.infer<typeof DegradationStateSchema>;

/**
 * Recovery assessment
 */
export const RecoveryAssessmentSchema = z.object({
  feasible: z.boolean(),
  confidence: z.number().min(0).max(1),
  estimatedDuration: z.number().positive(),
  requiredConditions: z.array(z.string()),
  risks: z.array(z.string()),
  recommendedApproach: z.enum(['immediate', 'gradual', 'scheduled', 'manual']),
  nextAssessment: z.number(),
});

export type RecoveryAssessment = z.infer<typeof RecoveryAssessmentSchema>;

// ===== SYSTEM LOAD AND ADAPTATION =====

/**
 * System load assessment
 */
export const SystemLoadSchema = z.object({
  cpu: z.number().min(0).max(1),
  memory: z.number().min(0).max(1),
  network: z.number().min(0).max(1),
  concurrentOperations: z.number().nonnegative(),
  queueDepth: z.number().nonnegative(),
  level: z.enum(['low', 'medium', 'high', 'critical']),
  timestamp: z.number(),
});

export type SystemLoad = z.infer<typeof SystemLoadSchema>;

/**
 * Adaptive budget configuration
 */
export const AdaptiveBudgetConfigSchema = z.object({
  loadScaling: z.object({
    lowLoad: z.number().positive(),
    mediumLoad: z.number().positive(),
    highLoad: z.number().positive(),
    criticalLoad: z.number().positive(),
  }),
  contextModifiers: z.record(z.number()),
  qosGuarantees: z.record(
    z.object({
      budgetMultiplier: z.number().positive(),
      preemptionPriority: z.number().nonnegative().optional(),
      maxDelay: z.number().positive().optional(),
    })
  ),
});

export type AdaptiveBudgetConfig = z.infer<typeof AdaptiveBudgetConfigSchema>;

// ===== ANOMALY DETECTION =====

/**
 * Performance anomaly detection
 */
export const PerformanceAnomalySchema = z.object({
  id: z.string(),
  type: z.enum([
    'latency_spike',
    'throughput_drop',
    'error_burst',
    'resource_spike',
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  operationType: z.nativeEnum(OperationType),
  detectedAt: z.number(),
  duration: z.number().nonnegative(),
  metrics: z.object({
    baseline: z.number(),
    observed: z.number(),
    deviation: z.number(),
    confidence: z.number().min(0).max(1),
  }),
  possibleCauses: z.array(z.string()),
  recommendedActions: z.array(z.string()),
  resolved: z.boolean(),
});

export type PerformanceAnomaly = z.infer<typeof PerformanceAnomalySchema>;

/**
 * Performance baseline for comparison
 */
export const PerformanceBaselineSchema = z.object({
  operationType: z.nativeEnum(OperationType),
  context: z.nativeEnum(PerformanceContext),
  timeWindow: z.object({
    start: z.number(),
    end: z.number(),
  }),
  statistics: LatencyDistributionSchema,
  sampleSize: z.number().positive(),
  confidence: z.number().min(0).max(1),
  lastUpdated: z.number(),
});

export type PerformanceBaseline = z.infer<typeof PerformanceBaselineSchema>;

// ===== ALERTING SYSTEM =====

/**
 * Alert threshold configuration
 */
export const AlertThresholdSchema = z.object({
  name: z.string(),
  metric: z.string(),
  operator: z.enum(['>', '<', '>=', '<=', '==', '!=']),
  value: z.number(),
  window: z.number().positive(),
  severity: z.enum(['info', 'warning', 'critical']),
  enabled: z.boolean(),
});

export type AlertThreshold = z.infer<typeof AlertThresholdSchema>;

/**
 * Performance alert
 */
export const AlertSchema = z.object({
  id: z.string(),
  name: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string(),
  metric: z.string(),
  currentValue: z.number(),
  thresholdValue: z.number(),
  triggeredAt: z.number(),
  resolved: z.boolean(),
  resolvedAt: z.number().optional(),
  acknowledgments: z.array(
    z.object({
      user: z.string(),
      timestamp: z.number(),
      comment: z.string().optional(),
    })
  ),
  escalationLevel: z.number().nonnegative(),
});

export type Alert = z.infer<typeof AlertSchema>;

/**
 * Alert evaluation result
 */
export const AlertEvaluationSchema = z.object({
  thresholdName: z.string(),
  triggered: z.boolean(),
  currentValue: z.number(),
  thresholdValue: z.number(),
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string(),
  metadata: z.record(z.any()).optional(),
});

export type AlertEvaluation = z.infer<typeof AlertEvaluationSchema>;

// ===== MONITORING INTERFACES =====

/**
 * Performance query criteria
 */
export const PerformanceQuerySchema = z.object({
  operationType: z.nativeEnum(OperationType).optional(),
  module: z.string().optional(),
  context: z.nativeEnum(PerformanceContext).optional(),
  timeRange: z
    .object({
      start: z.number(),
      end: z.number(),
    })
    .optional(),
  aggregation: z.enum(['raw', 'minute', 'hour', 'day']).optional(),
  percentiles: z.array(z.number().min(0).max(100)).optional(),
});

export type PerformanceQuery = z.infer<typeof PerformanceQuerySchema>;

/**
 * Performance statistics result
 */
export const PerformanceStatsSchema = z.object({
  operationType: z.nativeEnum(OperationType),
  context: z.nativeEnum(PerformanceContext),
  timeRange: z.object({
    start: z.number(),
    end: z.number(),
  }),
  latency: LatencyDistributionSchema,
  throughput: z.object({
    operationsPerSecond: z.number().nonnegative(),
    totalOperations: z.number().nonnegative(),
    peakOps: z.number().nonnegative(),
  }),
  errors: z.object({
    totalErrors: z.number().nonnegative(),
    errorRate: z.number().min(0).max(1),
    topErrorTypes: z.array(
      z.object({
        type: z.string(),
        count: z.number().nonnegative(),
        percentage: z.number().min(0).max(1),
      })
    ),
  }),
  trends: z.object({
    latencyTrend: z.enum(['improving', 'stable', 'degrading']),
    throughputTrend: z.enum(['increasing', 'stable', 'decreasing']),
    errorTrend: z.enum(['improving', 'stable', 'worsening']),
  }),
});

export type PerformanceStats = z.infer<typeof PerformanceStatsSchema>;

// ===== DASHBOARD AND TELEMETRY =====

/**
 * Real-time dashboard metrics
 */
export const DashboardMetricsSchema = z.object({
  liveIndicators: z.object({
    currentLatency: z.number().nonnegative(),
    budgetUtilization: z.number().min(0).max(1),
    operationsPerSecond: z.number().nonnegative(),
    errorRate: z.number().min(0).max(1),
  }),
  trends: z.object({
    latencyTrend: z.array(
      z.object({
        timestamp: z.number(),
        value: z.number().nonnegative(),
      })
    ),
    throughputTrend: z.array(
      z.object({
        timestamp: z.number(),
        value: z.number().nonnegative(),
      })
    ),
  }),
  healthStatus: z.object({
    overall: z.enum(['healthy', 'warning', 'critical']),
    components: z.array(
      z.object({
        name: z.string(),
        status: z.enum(['healthy', 'warning', 'critical']),
        latency: z.number().nonnegative(),
        errorRate: z.number().min(0).max(1),
      })
    ),
    alerts: z.array(AlertSchema),
    degradationLevel: z.nativeEnum(DegradationLevel),
  }),
});

export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;

// ===== CONFIGURATION =====

/**
 * Real-time monitoring configuration
 */
export const RealTimeConfigSchema = z.object({
  performanceBudgets: PerformanceBudgetsSchema,
  monitoring: z.object({
    samplingRate: z.number().min(0).max(1),
    retentionDays: z.number().positive(),
    aggregationIntervals: z.array(z.number().positive()),
  }),
  alerting: z.object({
    enabled: z.boolean(),
    channels: z.array(z.string()),
    thresholds: z.array(AlertThresholdSchema),
  }),
  degradation: z.object({
    autoDegradationEnabled: z.boolean(),
    recoveryAttemptInterval: z.number().positive(),
    maxDegradationDuration: z.number().positive(),
  }),
  adaptiveBudget: AdaptiveBudgetConfigSchema,
});

export type RealTimeConfig = z.infer<typeof RealTimeConfigSchema>;

// ===== INTERFACES =====

/**
 * Performance tracker interface
 */
export interface IPerformanceTracker {
  startTracking(
    operation: CognitiveOperation,
    context: PerformanceContext
  ): TrackingSession;

  recordCompletion(
    session: TrackingSession,
    result: OperationResult
  ): PerformanceMetrics;

  getPerformanceStats(query: PerformanceQuery): PerformanceStats;

  detectAnomalies(timeWindow: number): PerformanceAnomaly[];
}

/**
 * Budget enforcer interface
 */
export interface IBudgetEnforcer {
  allocateBudget(
    operation: CognitiveOperation,
    context: PerformanceContext
  ): BudgetAllocation;

  monitorBudgetUsage(
    session: TrackingSession,
    allocation: BudgetAllocation
  ): BudgetStatus;

  triggerDegradation(violation: BudgetViolation): DegradationState;

  calculateDynamicBudget(
    baseBudget: BudgetConfig,
    systemLoad: SystemLoad
  ): BudgetConfig;
}

/**
 * Degradation manager interface
 */
export interface IDegradationManager {
  evaluateDegradationStrategy(
    violation: BudgetViolation,
    currentState: DegradationState
  ): DegradationStrategy;

  executeDegradation(strategy: DegradationStrategy): DegradationState;

  assessRecovery(state: DegradationState): RecoveryAssessment;

  restoreOperation(
    state: DegradationState,
    strategy: DegradationStrategy
  ): DegradationState;
}

/**
 * Alerting system interface
 */
export interface IAlertingSystem {
  evaluateAlerts(
    metrics: PerformanceMetrics,
    thresholds: AlertThreshold[]
  ): AlertEvaluation[];

  sendAlert(alert: Alert): Promise<boolean>;

  acknowledgeAlert(alertId: string, user: string, comment?: string): boolean;

  getActiveAlerts(): Alert[];
}

// ===== UTILITY TYPES =====

/**
 * Time window specification
 */
export type TimeWindow = {
  start: number;
  end: number;
  duration: number;
};

/**
 * Granularity for data aggregation
 */
export type Granularity = 'second' | 'minute' | 'hour' | 'day';

/**
 * Component priority for degradation decisions
 */
export type ComponentPriority = {
  name: string;
  priority: number;
  essential: boolean;
};

/**
 * System context for decision making
 */
export type SystemContext = {
  load: SystemLoad;
  activeOperations: number;
  emergencyMode: boolean;
  degradationLevel: DegradationLevel;
  timestamp: number;
};

// Export validation functions
export const validatePerformanceMetrics = (data: unknown): PerformanceMetrics =>
  PerformanceMetricsSchema.parse(data);

export const validateTrackingSession = (data: unknown): TrackingSession =>
  TrackingSessionSchema.parse(data);

export const validateBudgetAllocation = (data: unknown): BudgetAllocation =>
  BudgetAllocationSchema.parse(data);

export const validateRealTimeConfig = (data: unknown): RealTimeConfig =>
  RealTimeConfigSchema.parse(data);
