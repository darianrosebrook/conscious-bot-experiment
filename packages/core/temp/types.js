"use strict";
/**
 * Real-Time Performance Monitoring Types
 *
 * Comprehensive type system for performance tracking, budget enforcement,
 * degradation management, and real-time constraint monitoring.
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRealTimeConfig = exports.validateBudgetAllocation = exports.validateTrackingSession = exports.validatePerformanceMetrics = exports.RealTimeConfigSchema = exports.DashboardMetricsSchema = exports.PerformanceStatsSchema = exports.PerformanceQuerySchema = exports.AlertEvaluationSchema = exports.AlertSchema = exports.AlertThresholdSchema = exports.PerformanceBaselineSchema = exports.PerformanceAnomalySchema = exports.AdaptiveBudgetConfigSchema = exports.SystemLoadSchema = exports.RecoveryAssessmentSchema = exports.DegradationStateSchema = exports.DegradationStrategySchema = exports.DegradationLevel = exports.BudgetViolationSchema = exports.BudgetStatusSchema = exports.BudgetAllocationSchema = exports.TrackingSessionSchema = exports.PerformanceMetricsSchema = exports.LatencyDistributionSchema = exports.OperationResultSchema = exports.CognitiveOperationSchema = exports.OperationType = exports.PerformanceBudgetsSchema = exports.BudgetConfigSchema = exports.PerformanceContext = void 0;
var zod_1 = require("zod");
// ===== PERFORMANCE CONTEXTS AND BUDGETS =====
/**
 * Performance context types that determine budget allocation
 */
var PerformanceContext;
(function (PerformanceContext) {
    PerformanceContext["EMERGENCY"] = "emergency";
    PerformanceContext["ROUTINE"] = "routine";
    PerformanceContext["DELIBERATIVE"] = "deliberative";
})(PerformanceContext || (exports.PerformanceContext = PerformanceContext = {}));
/**
 * Performance budget configuration
 */
exports.BudgetConfigSchema = zod_1.z.object({
    total: zod_1.z.number().positive(),
    allocation: zod_1.z.object({
        signalProcessing: zod_1.z.number().nonnegative(),
        routing: zod_1.z.number().nonnegative(),
        execution: zod_1.z.number().nonnegative(),
    }),
    triggers: zod_1.z.array(zod_1.z.string()),
});
/**
 * Complete performance budget framework
 */
exports.PerformanceBudgetsSchema = zod_1.z.object({
    emergency: exports.BudgetConfigSchema,
    routine: exports.BudgetConfigSchema,
    deliberative: exports.BudgetConfigSchema,
});
// ===== OPERATIONS AND TRACKING =====
/**
 * Types of cognitive operations being tracked
 */
var OperationType;
(function (OperationType) {
    OperationType["SIGNAL_PROCESSING"] = "signal_processing";
    OperationType["ROUTING_DECISION"] = "routing_decision";
    OperationType["CAPABILITY_EXECUTION"] = "capability_execution";
    OperationType["MEMORY_OPERATION"] = "memory_operation";
    OperationType["PLANNING_OPERATION"] = "planning_operation";
    OperationType["LLM_INFERENCE"] = "llm_inference";
    OperationType["WORLD_INTERACTION"] = "world_interaction";
})(OperationType || (exports.OperationType = OperationType = {}));
/**
 * Cognitive operation being tracked
 */
exports.CognitiveOperationSchema = zod_1.z.object({
    id: zod_1.z.string(),
    type: zod_1.z.nativeEnum(OperationType),
    name: zod_1.z.string(),
    module: zod_1.z.string(),
    priority: zod_1.z.number().min(0).max(1),
    expectedDuration: zod_1.z.number().positive().optional(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
/**
 * Operation result with performance data
 */
exports.OperationResultSchema = zod_1.z.object({
    success: zod_1.z.boolean(),
    duration: zod_1.z.number().nonnegative(),
    resourcesUsed: zod_1.z.object({
        cpu: zod_1.z.number().nonnegative(),
        memory: zod_1.z.number().nonnegative(),
        network: zod_1.z.number().nonnegative().optional(),
    }),
    errorCode: zod_1.z.string().optional(),
    errorMessage: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
// ===== PERFORMANCE METRICS =====
/**
 * Latency distribution statistics
 */
exports.LatencyDistributionSchema = zod_1.z.object({
    p50: zod_1.z.number().nonnegative(),
    p95: zod_1.z.number().nonnegative(),
    p99: zod_1.z.number().nonnegative(),
    max: zod_1.z.number().nonnegative(),
    mean: zod_1.z.number().nonnegative(),
    stddev: zod_1.z.number().nonnegative(),
    samples: zod_1.z.number().nonnegative(),
});
/**
 * Comprehensive performance metrics
 */
exports.PerformanceMetricsSchema = zod_1.z.object({
    latency: exports.LatencyDistributionSchema,
    throughput: zod_1.z.object({
        operationsPerSecond: zod_1.z.number().nonnegative(),
        requestsProcessed: zod_1.z.number().nonnegative(),
        requestsDropped: zod_1.z.number().nonnegative(),
        queueDepth: zod_1.z.number().nonnegative(),
    }),
    resources: zod_1.z.object({
        cpuUtilization: zod_1.z.number().min(0).max(1),
        memoryUsage: zod_1.z.number().nonnegative(),
        gcPressure: zod_1.z.number().nonnegative(),
        threadUtilization: zod_1.z.number().min(0).max(1),
    }),
    quality: zod_1.z.object({
        successRate: zod_1.z.number().min(0).max(1),
        errorRate: zod_1.z.number().min(0).max(1),
        timeoutRate: zod_1.z.number().min(0).max(1),
        retryRate: zod_1.z.number().min(0).max(1),
    }),
    timestamp: zod_1.z.number(),
});
// ===== TRACKING SESSIONS =====
/**
 * Active performance tracking session
 */
exports.TrackingSessionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    operation: exports.CognitiveOperationSchema,
    context: zod_1.z.nativeEnum(PerformanceContext),
    startTime: zod_1.z.number(),
    budget: zod_1.z.number().positive(),
    checkpoints: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        timestamp: zod_1.z.number(),
        progress: zod_1.z.number().min(0).max(1),
    })),
    warnings: zod_1.z.array(zod_1.z.string()),
    active: zod_1.z.boolean(),
});
// ===== BUDGET MANAGEMENT =====
/**
 * Budget allocation for an operation
 */
exports.BudgetAllocationSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    totalBudget: zod_1.z.number().positive(),
    allocatedBudget: zod_1.z.number().positive(),
    reservedBuffer: zod_1.z.number().nonnegative(),
    context: zod_1.z.nativeEnum(PerformanceContext),
    allocation: zod_1.z.object({
        signalProcessing: zod_1.z.number().nonnegative(),
        routing: zod_1.z.number().nonnegative(),
        execution: zod_1.z.number().nonnegative(),
    }),
    adjustmentFactors: zod_1.z.record(zod_1.z.number()),
    expiryTime: zod_1.z.number(),
});
/**
 * Current budget utilization status
 */
exports.BudgetStatusSchema = zod_1.z.object({
    utilization: zod_1.z.number().min(0),
    remaining: zod_1.z.number().nonnegative(),
    projectedOverrun: zod_1.z.number().nonnegative(),
    warningLevel: zod_1.z.enum(['none', 'low', 'medium', 'high', 'critical']),
    timeRemaining: zod_1.z.number().nonnegative(),
    recommendedAction: zod_1.z.enum(['continue', 'optimize', 'degrade', 'abort']),
});
/**
 * Budget violation details
 */
exports.BudgetViolationSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    operationType: zod_1.z.nativeEnum(OperationType),
    budgetExceeded: zod_1.z.number().positive(),
    actualDuration: zod_1.z.number().positive(),
    allocatedBudget: zod_1.z.number().positive(),
    severity: zod_1.z.enum(['minor', 'moderate', 'major', 'critical']),
    context: zod_1.z.nativeEnum(PerformanceContext),
    timestamp: zod_1.z.number(),
    stackTrace: zod_1.z.string().optional(),
});
// ===== DEGRADATION MANAGEMENT =====
/**
 * Degradation levels for graceful fallback
 */
var DegradationLevel;
(function (DegradationLevel) {
    DegradationLevel[DegradationLevel["NONE"] = 0] = "NONE";
    DegradationLevel[DegradationLevel["MINIMAL"] = 1] = "MINIMAL";
    DegradationLevel[DegradationLevel["MODERATE"] = 2] = "MODERATE";
    DegradationLevel[DegradationLevel["SEVERE"] = 3] = "SEVERE";
    DegradationLevel[DegradationLevel["CRITICAL"] = 4] = "CRITICAL";
})(DegradationLevel || (exports.DegradationLevel = DegradationLevel = {}));
/**
 * Degradation strategy specification
 */
exports.DegradationStrategySchema = zod_1.z.object({
    level: zod_1.z.nativeEnum(DegradationLevel),
    actions: zod_1.z.array(zod_1.z.string()),
    expectedImprovement: zod_1.z.string(),
    impactLevel: zod_1.z.enum(['low', 'medium', 'high', 'critical']),
    estimatedDuration: zod_1.z.number().positive(),
    reversible: zod_1.z.boolean(),
    dependencies: zod_1.z.array(zod_1.z.string()),
});
/**
 * Current degradation state
 */
exports.DegradationStateSchema = zod_1.z.object({
    currentLevel: zod_1.z.nativeEnum(DegradationLevel),
    activeStrategies: zod_1.z.array(exports.DegradationStrategySchema),
    triggeredAt: zod_1.z.number(),
    reason: zod_1.z.string(),
    disabledFeatures: zod_1.z.array(zod_1.z.string()),
    performance: zod_1.z.object({
        baselineLatency: zod_1.z.number(),
        currentLatency: zod_1.z.number(),
        improvement: zod_1.z.number(),
    }),
    recoveryEligible: zod_1.z.boolean(),
});
/**
 * Recovery assessment
 */
exports.RecoveryAssessmentSchema = zod_1.z.object({
    feasible: zod_1.z.boolean(),
    confidence: zod_1.z.number().min(0).max(1),
    estimatedDuration: zod_1.z.number().positive(),
    requiredConditions: zod_1.z.array(zod_1.z.string()),
    risks: zod_1.z.array(zod_1.z.string()),
    recommendedApproach: zod_1.z.enum(['immediate', 'gradual', 'scheduled', 'manual']),
    nextAssessment: zod_1.z.number(),
});
// ===== SYSTEM LOAD AND ADAPTATION =====
/**
 * System load assessment
 */
exports.SystemLoadSchema = zod_1.z.object({
    cpu: zod_1.z.number().min(0).max(1),
    memory: zod_1.z.number().min(0).max(1),
    network: zod_1.z.number().min(0).max(1),
    concurrentOperations: zod_1.z.number().nonnegative(),
    queueDepth: zod_1.z.number().nonnegative(),
    level: zod_1.z.enum(['low', 'medium', 'high', 'critical']),
    timestamp: zod_1.z.number(),
});
/**
 * Adaptive budget configuration
 */
exports.AdaptiveBudgetConfigSchema = zod_1.z.object({
    loadScaling: zod_1.z.object({
        lowLoad: zod_1.z.number().positive(),
        mediumLoad: zod_1.z.number().positive(),
        highLoad: zod_1.z.number().positive(),
        criticalLoad: zod_1.z.number().positive(),
    }),
    contextModifiers: zod_1.z.record(zod_1.z.number()),
    qosGuarantees: zod_1.z.record(zod_1.z.object({
        budgetMultiplier: zod_1.z.number().positive(),
        preemptionPriority: zod_1.z.number().nonnegative().optional(),
        maxDelay: zod_1.z.number().positive().optional(),
    })),
});
// ===== ANOMALY DETECTION =====
/**
 * Performance anomaly detection
 */
exports.PerformanceAnomalySchema = zod_1.z.object({
    id: zod_1.z.string(),
    type: zod_1.z.enum([
        'latency_spike',
        'throughput_drop',
        'error_burst',
        'resource_spike',
    ]),
    severity: zod_1.z.enum(['low', 'medium', 'high', 'critical']),
    operationType: zod_1.z.nativeEnum(OperationType),
    detectedAt: zod_1.z.number(),
    duration: zod_1.z.number().nonnegative(),
    metrics: zod_1.z.object({
        baseline: zod_1.z.number(),
        observed: zod_1.z.number(),
        deviation: zod_1.z.number(),
        confidence: zod_1.z.number().min(0).max(1),
    }),
    possibleCauses: zod_1.z.array(zod_1.z.string()),
    recommendedActions: zod_1.z.array(zod_1.z.string()),
    resolved: zod_1.z.boolean(),
});
/**
 * Performance baseline for comparison
 */
exports.PerformanceBaselineSchema = zod_1.z.object({
    operationType: zod_1.z.nativeEnum(OperationType),
    context: zod_1.z.nativeEnum(PerformanceContext),
    timeWindow: zod_1.z.object({
        start: zod_1.z.number(),
        end: zod_1.z.number(),
    }),
    statistics: exports.LatencyDistributionSchema,
    sampleSize: zod_1.z.number().positive(),
    confidence: zod_1.z.number().min(0).max(1),
    lastUpdated: zod_1.z.number(),
});
// ===== ALERTING SYSTEM =====
/**
 * Alert threshold configuration
 */
exports.AlertThresholdSchema = zod_1.z.object({
    name: zod_1.z.string(),
    metric: zod_1.z.string(),
    operator: zod_1.z.enum(['>', '<', '>=', '<=', '==', '!=']),
    value: zod_1.z.number(),
    window: zod_1.z.number().positive(),
    severity: zod_1.z.enum(['info', 'warning', 'critical']),
    enabled: zod_1.z.boolean(),
});
/**
 * Performance alert
 */
exports.AlertSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    severity: zod_1.z.enum(['info', 'warning', 'critical']),
    message: zod_1.z.string(),
    metric: zod_1.z.string(),
    currentValue: zod_1.z.number(),
    thresholdValue: zod_1.z.number(),
    triggeredAt: zod_1.z.number(),
    resolved: zod_1.z.boolean(),
    resolvedAt: zod_1.z.number().optional(),
    acknowledgments: zod_1.z.array(zod_1.z.object({
        user: zod_1.z.string(),
        timestamp: zod_1.z.number(),
        comment: zod_1.z.string().optional(),
    })),
    escalationLevel: zod_1.z.number().nonnegative(),
});
/**
 * Alert evaluation result
 */
exports.AlertEvaluationSchema = zod_1.z.object({
    thresholdName: zod_1.z.string(),
    triggered: zod_1.z.boolean(),
    currentValue: zod_1.z.number(),
    thresholdValue: zod_1.z.number(),
    severity: zod_1.z.enum(['info', 'warning', 'critical']),
    message: zod_1.z.string(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
// ===== MONITORING INTERFACES =====
/**
 * Performance query criteria
 */
exports.PerformanceQuerySchema = zod_1.z.object({
    operationType: zod_1.z.nativeEnum(OperationType).optional(),
    module: zod_1.z.string().optional(),
    context: zod_1.z.nativeEnum(PerformanceContext).optional(),
    timeRange: zod_1.z
        .object({
        start: zod_1.z.number(),
        end: zod_1.z.number(),
    })
        .optional(),
    aggregation: zod_1.z.enum(['raw', 'minute', 'hour', 'day']).optional(),
    percentiles: zod_1.z.array(zod_1.z.number().min(0).max(100)).optional(),
});
/**
 * Performance statistics result
 */
exports.PerformanceStatsSchema = zod_1.z.object({
    operationType: zod_1.z.nativeEnum(OperationType),
    context: zod_1.z.nativeEnum(PerformanceContext),
    timeRange: zod_1.z.object({
        start: zod_1.z.number(),
        end: zod_1.z.number(),
    }),
    latency: exports.LatencyDistributionSchema,
    throughput: zod_1.z.object({
        operationsPerSecond: zod_1.z.number().nonnegative(),
        totalOperations: zod_1.z.number().nonnegative(),
        peakOps: zod_1.z.number().nonnegative(),
    }),
    errors: zod_1.z.object({
        totalErrors: zod_1.z.number().nonnegative(),
        errorRate: zod_1.z.number().min(0).max(1),
        topErrorTypes: zod_1.z.array(zod_1.z.object({
            type: zod_1.z.string(),
            count: zod_1.z.number().nonnegative(),
            percentage: zod_1.z.number().min(0).max(1),
        })),
    }),
    trends: zod_1.z.object({
        latencyTrend: zod_1.z.enum(['improving', 'stable', 'degrading']),
        throughputTrend: zod_1.z.enum(['increasing', 'stable', 'decreasing']),
        errorTrend: zod_1.z.enum(['improving', 'stable', 'worsening']),
    }),
});
// ===== DASHBOARD AND TELEMETRY =====
/**
 * Real-time dashboard metrics
 */
exports.DashboardMetricsSchema = zod_1.z.object({
    liveIndicators: zod_1.z.object({
        currentLatency: zod_1.z.number().nonnegative(),
        budgetUtilization: zod_1.z.number().min(0).max(1),
        operationsPerSecond: zod_1.z.number().nonnegative(),
        errorRate: zod_1.z.number().min(0).max(1),
    }),
    trends: zod_1.z.object({
        latencyTrend: zod_1.z.array(zod_1.z.object({
            timestamp: zod_1.z.number(),
            value: zod_1.z.number().nonnegative(),
        })),
        throughputTrend: zod_1.z.array(zod_1.z.object({
            timestamp: zod_1.z.number(),
            value: zod_1.z.number().nonnegative(),
        })),
    }),
    healthStatus: zod_1.z.object({
        overall: zod_1.z.enum(['healthy', 'warning', 'critical']),
        components: zod_1.z.array(zod_1.z.object({
            name: zod_1.z.string(),
            status: zod_1.z.enum(['healthy', 'warning', 'critical']),
            latency: zod_1.z.number().nonnegative(),
            errorRate: zod_1.z.number().min(0).max(1),
        })),
        alerts: zod_1.z.array(exports.AlertSchema),
        degradationLevel: zod_1.z.nativeEnum(DegradationLevel),
    }),
});
// ===== CONFIGURATION =====
/**
 * Real-time monitoring configuration
 */
exports.RealTimeConfigSchema = zod_1.z.object({
    performanceBudgets: exports.PerformanceBudgetsSchema,
    monitoring: zod_1.z.object({
        samplingRate: zod_1.z.number().min(0).max(1),
        retentionDays: zod_1.z.number().positive(),
        aggregationIntervals: zod_1.z.array(zod_1.z.number().positive()),
    }),
    alerting: zod_1.z.object({
        enabled: zod_1.z.boolean(),
        channels: zod_1.z.array(zod_1.z.string()),
        thresholds: zod_1.z.array(exports.AlertThresholdSchema),
    }),
    degradation: zod_1.z.object({
        autoDegradationEnabled: zod_1.z.boolean(),
        recoveryAttemptInterval: zod_1.z.number().positive(),
        maxDegradationDuration: zod_1.z.number().positive(),
    }),
    adaptiveBudget: exports.AdaptiveBudgetConfigSchema,
});
// Export validation functions
var validatePerformanceMetrics = function (data) {
    return exports.PerformanceMetricsSchema.parse(data);
};
exports.validatePerformanceMetrics = validatePerformanceMetrics;
var validateTrackingSession = function (data) {
    return exports.TrackingSessionSchema.parse(data);
};
exports.validateTrackingSession = validateTrackingSession;
var validateBudgetAllocation = function (data) {
    return exports.BudgetAllocationSchema.parse(data);
};
exports.validateBudgetAllocation = validateBudgetAllocation;
var validateRealTimeConfig = function (data) {
    return exports.RealTimeConfigSchema.parse(data);
};
exports.validateRealTimeConfig = validateRealTimeConfig;
