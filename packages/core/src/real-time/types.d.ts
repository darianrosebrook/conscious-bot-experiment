/**
 * Real-Time Performance Monitoring Types
 *
 * Comprehensive type system for performance tracking, budget enforcement,
 * degradation management, and real-time constraint monitoring.
 *
 * @author @darianrosebrook
 */
import { z } from 'zod';
/**
 * Performance context types that determine budget allocation
 */
export declare enum PerformanceContext {
    EMERGENCY = "emergency",// Combat, falling, lava - 50ms p95
    ROUTINE = "routine",// Exploration, building - 200ms p95
    DELIBERATIVE = "deliberative"
}
/**
 * Performance budget configuration
 */
export declare const BudgetConfigSchema: z.ZodObject<{
    total: z.ZodNumber;
    allocation: z.ZodObject<{
        signalProcessing: z.ZodNumber;
        routing: z.ZodNumber;
        execution: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        signalProcessing: number;
        routing: number;
        execution: number;
    }, {
        signalProcessing: number;
        routing: number;
        execution: number;
    }>;
    triggers: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    allocation: {
        signalProcessing: number;
        routing: number;
        execution: number;
    };
    total: number;
    triggers: string[];
}, {
    allocation: {
        signalProcessing: number;
        routing: number;
        execution: number;
    };
    total: number;
    triggers: string[];
}>;
export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;
/**
 * Complete performance budget framework
 */
export declare const PerformanceBudgetsSchema: z.ZodObject<{
    emergency: z.ZodObject<{
        total: z.ZodNumber;
        allocation: z.ZodObject<{
            signalProcessing: z.ZodNumber;
            routing: z.ZodNumber;
            execution: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            signalProcessing: number;
            routing: number;
            execution: number;
        }, {
            signalProcessing: number;
            routing: number;
            execution: number;
        }>;
        triggers: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        allocation: {
            signalProcessing: number;
            routing: number;
            execution: number;
        };
        total: number;
        triggers: string[];
    }, {
        allocation: {
            signalProcessing: number;
            routing: number;
            execution: number;
        };
        total: number;
        triggers: string[];
    }>;
    routine: z.ZodObject<{
        total: z.ZodNumber;
        allocation: z.ZodObject<{
            signalProcessing: z.ZodNumber;
            routing: z.ZodNumber;
            execution: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            signalProcessing: number;
            routing: number;
            execution: number;
        }, {
            signalProcessing: number;
            routing: number;
            execution: number;
        }>;
        triggers: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        allocation: {
            signalProcessing: number;
            routing: number;
            execution: number;
        };
        total: number;
        triggers: string[];
    }, {
        allocation: {
            signalProcessing: number;
            routing: number;
            execution: number;
        };
        total: number;
        triggers: string[];
    }>;
    deliberative: z.ZodObject<{
        total: z.ZodNumber;
        allocation: z.ZodObject<{
            signalProcessing: z.ZodNumber;
            routing: z.ZodNumber;
            execution: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            signalProcessing: number;
            routing: number;
            execution: number;
        }, {
            signalProcessing: number;
            routing: number;
            execution: number;
        }>;
        triggers: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        allocation: {
            signalProcessing: number;
            routing: number;
            execution: number;
        };
        total: number;
        triggers: string[];
    }, {
        allocation: {
            signalProcessing: number;
            routing: number;
            execution: number;
        };
        total: number;
        triggers: string[];
    }>;
}, "strip", z.ZodTypeAny, {
    emergency: {
        allocation: {
            signalProcessing: number;
            routing: number;
            execution: number;
        };
        total: number;
        triggers: string[];
    };
    routine: {
        allocation: {
            signalProcessing: number;
            routing: number;
            execution: number;
        };
        total: number;
        triggers: string[];
    };
    deliberative: {
        allocation: {
            signalProcessing: number;
            routing: number;
            execution: number;
        };
        total: number;
        triggers: string[];
    };
}, {
    emergency: {
        allocation: {
            signalProcessing: number;
            routing: number;
            execution: number;
        };
        total: number;
        triggers: string[];
    };
    routine: {
        allocation: {
            signalProcessing: number;
            routing: number;
            execution: number;
        };
        total: number;
        triggers: string[];
    };
    deliberative: {
        allocation: {
            signalProcessing: number;
            routing: number;
            execution: number;
        };
        total: number;
        triggers: string[];
    };
}>;
export type PerformanceBudgets = z.infer<typeof PerformanceBudgetsSchema>;
/**
 * Types of cognitive operations being tracked
 */
export declare enum OperationType {
    SIGNAL_PROCESSING = "signal_processing",
    ROUTING_DECISION = "routing_decision",
    CAPABILITY_EXECUTION = "capability_execution",
    MEMORY_OPERATION = "memory_operation",
    PLANNING_OPERATION = "planning_operation",
    LLM_INFERENCE = "llm_inference",
    WORLD_INTERACTION = "world_interaction"
}
/**
 * Cognitive operation being tracked
 */
export declare const CognitiveOperationSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodNativeEnum<typeof OperationType>;
    name: z.ZodString;
    module: z.ZodString;
    priority: z.ZodNumber;
    expectedDuration: z.ZodOptional<z.ZodNumber>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    type: OperationType;
    id: string;
    name: string;
    module: string;
    priority: number;
    metadata?: Record<string, any> | undefined;
    expectedDuration?: number | undefined;
}, {
    type: OperationType;
    id: string;
    name: string;
    module: string;
    priority: number;
    metadata?: Record<string, any> | undefined;
    expectedDuration?: number | undefined;
}>;
export type CognitiveOperation = z.infer<typeof CognitiveOperationSchema>;
/**
 * Operation result with performance data
 */
export declare const OperationResultSchema: z.ZodObject<{
    success: z.ZodBoolean;
    duration: z.ZodNumber;
    resourcesUsed: z.ZodObject<{
        cpu: z.ZodNumber;
        memory: z.ZodNumber;
        network: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        memory: number;
        cpu: number;
        network?: number | undefined;
    }, {
        memory: number;
        cpu: number;
        network?: number | undefined;
    }>;
    errorCode: z.ZodOptional<z.ZodString>;
    errorMessage: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    success: boolean;
    duration: number;
    resourcesUsed: {
        memory: number;
        cpu: number;
        network?: number | undefined;
    };
    metadata?: Record<string, any> | undefined;
    errorCode?: string | undefined;
    errorMessage?: string | undefined;
}, {
    success: boolean;
    duration: number;
    resourcesUsed: {
        memory: number;
        cpu: number;
        network?: number | undefined;
    };
    metadata?: Record<string, any> | undefined;
    errorCode?: string | undefined;
    errorMessage?: string | undefined;
}>;
export type OperationResult = z.infer<typeof OperationResultSchema>;
/**
 * Latency distribution statistics
 */
export declare const LatencyDistributionSchema: z.ZodObject<{
    p50: z.ZodNumber;
    p95: z.ZodNumber;
    p99: z.ZodNumber;
    max: z.ZodNumber;
    mean: z.ZodNumber;
    stddev: z.ZodNumber;
    samples: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    p50: number;
    p95: number;
    p99: number;
    max: number;
    mean: number;
    stddev: number;
    samples: number;
}, {
    p50: number;
    p95: number;
    p99: number;
    max: number;
    mean: number;
    stddev: number;
    samples: number;
}>;
export type LatencyDistribution = z.infer<typeof LatencyDistributionSchema>;
/**
 * Comprehensive performance metrics
 */
export declare const PerformanceMetricsSchema: z.ZodObject<{
    latency: z.ZodObject<{
        p50: z.ZodNumber;
        p95: z.ZodNumber;
        p99: z.ZodNumber;
        max: z.ZodNumber;
        mean: z.ZodNumber;
        stddev: z.ZodNumber;
        samples: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
        stddev: number;
        samples: number;
    }, {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
        stddev: number;
        samples: number;
    }>;
    throughput: z.ZodObject<{
        operationsPerSecond: z.ZodNumber;
        requestsProcessed: z.ZodNumber;
        requestsDropped: z.ZodNumber;
        queueDepth: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        operationsPerSecond: number;
        requestsProcessed: number;
        requestsDropped: number;
        queueDepth: number;
    }, {
        operationsPerSecond: number;
        requestsProcessed: number;
        requestsDropped: number;
        queueDepth: number;
    }>;
    resources: z.ZodObject<{
        cpuUtilization: z.ZodNumber;
        memoryUsage: z.ZodNumber;
        gcPressure: z.ZodNumber;
        threadUtilization: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        cpuUtilization: number;
        memoryUsage: number;
        gcPressure: number;
        threadUtilization: number;
    }, {
        cpuUtilization: number;
        memoryUsage: number;
        gcPressure: number;
        threadUtilization: number;
    }>;
    quality: z.ZodObject<{
        successRate: z.ZodNumber;
        errorRate: z.ZodNumber;
        timeoutRate: z.ZodNumber;
        retryRate: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        successRate: number;
        errorRate: number;
        timeoutRate: number;
        retryRate: number;
    }, {
        successRate: number;
        errorRate: number;
        timeoutRate: number;
        retryRate: number;
    }>;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    timestamp: number;
    latency: {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
        stddev: number;
        samples: number;
    };
    throughput: {
        operationsPerSecond: number;
        requestsProcessed: number;
        requestsDropped: number;
        queueDepth: number;
    };
    resources: {
        cpuUtilization: number;
        memoryUsage: number;
        gcPressure: number;
        threadUtilization: number;
    };
    quality: {
        successRate: number;
        errorRate: number;
        timeoutRate: number;
        retryRate: number;
    };
}, {
    timestamp: number;
    latency: {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
        stddev: number;
        samples: number;
    };
    throughput: {
        operationsPerSecond: number;
        requestsProcessed: number;
        requestsDropped: number;
        queueDepth: number;
    };
    resources: {
        cpuUtilization: number;
        memoryUsage: number;
        gcPressure: number;
        threadUtilization: number;
    };
    quality: {
        successRate: number;
        errorRate: number;
        timeoutRate: number;
        retryRate: number;
    };
}>;
export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;
/**
 * Active performance tracking session
 */
export declare const TrackingSessionSchema: z.ZodObject<{
    id: z.ZodString;
    operation: z.ZodObject<{
        id: z.ZodString;
        type: z.ZodNativeEnum<typeof OperationType>;
        name: z.ZodString;
        module: z.ZodString;
        priority: z.ZodNumber;
        expectedDuration: z.ZodOptional<z.ZodNumber>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        type: OperationType;
        id: string;
        name: string;
        module: string;
        priority: number;
        metadata?: Record<string, any> | undefined;
        expectedDuration?: number | undefined;
    }, {
        type: OperationType;
        id: string;
        name: string;
        module: string;
        priority: number;
        metadata?: Record<string, any> | undefined;
        expectedDuration?: number | undefined;
    }>;
    context: z.ZodNativeEnum<typeof PerformanceContext>;
    startTime: z.ZodNumber;
    budget: z.ZodNumber;
    checkpoints: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        timestamp: z.ZodNumber;
        progress: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        timestamp: number;
        progress: number;
    }, {
        name: string;
        timestamp: number;
        progress: number;
    }>, "many">;
    warnings: z.ZodArray<z.ZodString, "many">;
    active: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    id: string;
    context: PerformanceContext;
    operation: {
        type: OperationType;
        id: string;
        name: string;
        module: string;
        priority: number;
        metadata?: Record<string, any> | undefined;
        expectedDuration?: number | undefined;
    };
    startTime: number;
    budget: number;
    checkpoints: {
        name: string;
        timestamp: number;
        progress: number;
    }[];
    warnings: string[];
    active: boolean;
}, {
    id: string;
    context: PerformanceContext;
    operation: {
        type: OperationType;
        id: string;
        name: string;
        module: string;
        priority: number;
        metadata?: Record<string, any> | undefined;
        expectedDuration?: number | undefined;
    };
    startTime: number;
    budget: number;
    checkpoints: {
        name: string;
        timestamp: number;
        progress: number;
    }[];
    warnings: string[];
    active: boolean;
}>;
export type TrackingSession = z.infer<typeof TrackingSessionSchema>;
/**
 * Budget allocation for an operation
 */
export declare const BudgetAllocationSchema: z.ZodObject<{
    sessionId: z.ZodString;
    totalBudget: z.ZodNumber;
    allocatedBudget: z.ZodNumber;
    reservedBuffer: z.ZodNumber;
    context: z.ZodNativeEnum<typeof PerformanceContext>;
    allocation: z.ZodObject<{
        signalProcessing: z.ZodNumber;
        routing: z.ZodNumber;
        execution: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        signalProcessing: number;
        routing: number;
        execution: number;
    }, {
        signalProcessing: number;
        routing: number;
        execution: number;
    }>;
    adjustmentFactors: z.ZodRecord<z.ZodString, z.ZodNumber>;
    expiryTime: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    allocatedBudget: number;
    context: PerformanceContext;
    totalBudget: number;
    reservedBuffer: number;
    allocation: {
        signalProcessing: number;
        routing: number;
        execution: number;
    };
    adjustmentFactors: Record<string, number>;
    expiryTime: number;
}, {
    sessionId: string;
    allocatedBudget: number;
    context: PerformanceContext;
    totalBudget: number;
    reservedBuffer: number;
    allocation: {
        signalProcessing: number;
        routing: number;
        execution: number;
    };
    adjustmentFactors: Record<string, number>;
    expiryTime: number;
}>;
export type BudgetAllocation = z.infer<typeof BudgetAllocationSchema>;
/**
 * Current budget utilization status
 */
export declare const BudgetStatusSchema: z.ZodObject<{
    utilization: z.ZodNumber;
    remaining: z.ZodNumber;
    projectedOverrun: z.ZodNumber;
    warningLevel: z.ZodEnum<["none", "low", "medium", "high", "critical"]>;
    timeRemaining: z.ZodNumber;
    recommendedAction: z.ZodEnum<["continue", "optimize", "degrade", "abort"]>;
}, "strip", z.ZodTypeAny, {
    utilization: number;
    remaining: number;
    projectedOverrun: number;
    warningLevel: "critical" | "high" | "medium" | "low" | "none";
    timeRemaining: number;
    recommendedAction: "continue" | "optimize" | "degrade" | "abort";
}, {
    utilization: number;
    remaining: number;
    projectedOverrun: number;
    warningLevel: "critical" | "high" | "medium" | "low" | "none";
    timeRemaining: number;
    recommendedAction: "continue" | "optimize" | "degrade" | "abort";
}>;
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;
/**
 * Budget violation details
 */
export declare const BudgetViolationSchema: z.ZodObject<{
    sessionId: z.ZodString;
    operationType: z.ZodNativeEnum<typeof OperationType>;
    budgetExceeded: z.ZodNumber;
    actualDuration: z.ZodNumber;
    allocatedBudget: z.ZodNumber;
    severity: z.ZodEnum<["minor", "moderate", "major", "critical"]>;
    context: z.ZodNativeEnum<typeof PerformanceContext>;
    timestamp: z.ZodNumber;
    stackTrace: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    severity: "critical" | "minor" | "moderate" | "major";
    timestamp: number;
    sessionId: string;
    operationType: OperationType;
    budgetExceeded: number;
    actualDuration: number;
    allocatedBudget: number;
    context: PerformanceContext;
    stackTrace?: string | undefined;
}, {
    severity: "critical" | "minor" | "moderate" | "major";
    timestamp: number;
    sessionId: string;
    operationType: OperationType;
    budgetExceeded: number;
    actualDuration: number;
    allocatedBudget: number;
    context: PerformanceContext;
    stackTrace?: string | undefined;
}>;
export type BudgetViolation = z.infer<typeof BudgetViolationSchema>;
/**
 * Degradation levels for graceful fallback
 */
export declare enum DegradationLevel {
    NONE = 0,// Full functionality
    MINIMAL = 1,// Minor feature reduction
    MODERATE = 2,// Significant capability reduction
    SEVERE = 3,// Emergency functionality only
    CRITICAL = 4
}
/**
 * Degradation strategy specification
 */
export declare const DegradationStrategySchema: z.ZodObject<{
    level: z.ZodNativeEnum<typeof DegradationLevel>;
    actions: z.ZodArray<z.ZodString, "many">;
    expectedImprovement: z.ZodString;
    impactLevel: z.ZodEnum<["low", "medium", "high", "critical"]>;
    estimatedDuration: z.ZodNumber;
    reversible: z.ZodBoolean;
    dependencies: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    level: DegradationLevel;
    actions: string[];
    expectedImprovement: string;
    impactLevel: "critical" | "high" | "medium" | "low";
    estimatedDuration: number;
    reversible: boolean;
    dependencies: string[];
}, {
    level: DegradationLevel;
    actions: string[];
    expectedImprovement: string;
    impactLevel: "critical" | "high" | "medium" | "low";
    estimatedDuration: number;
    reversible: boolean;
    dependencies: string[];
}>;
export type DegradationStrategy = z.infer<typeof DegradationStrategySchema>;
/**
 * Current degradation state
 */
export declare const DegradationStateSchema: z.ZodObject<{
    currentLevel: z.ZodNativeEnum<typeof DegradationLevel>;
    activeStrategies: z.ZodArray<z.ZodObject<{
        level: z.ZodNativeEnum<typeof DegradationLevel>;
        actions: z.ZodArray<z.ZodString, "many">;
        expectedImprovement: z.ZodString;
        impactLevel: z.ZodEnum<["low", "medium", "high", "critical"]>;
        estimatedDuration: z.ZodNumber;
        reversible: z.ZodBoolean;
        dependencies: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        level: DegradationLevel;
        actions: string[];
        expectedImprovement: string;
        impactLevel: "critical" | "high" | "medium" | "low";
        estimatedDuration: number;
        reversible: boolean;
        dependencies: string[];
    }, {
        level: DegradationLevel;
        actions: string[];
        expectedImprovement: string;
        impactLevel: "critical" | "high" | "medium" | "low";
        estimatedDuration: number;
        reversible: boolean;
        dependencies: string[];
    }>, "many">;
    triggeredAt: z.ZodNumber;
    reason: z.ZodString;
    disabledFeatures: z.ZodArray<z.ZodString, "many">;
    performance: z.ZodObject<{
        baselineLatency: z.ZodNumber;
        currentLatency: z.ZodNumber;
        improvement: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        currentLatency: number;
        baselineLatency: number;
        improvement: number;
    }, {
        currentLatency: number;
        baselineLatency: number;
        improvement: number;
    }>;
    recoveryEligible: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    triggeredAt: number;
    currentLevel: DegradationLevel;
    activeStrategies: {
        level: DegradationLevel;
        actions: string[];
        expectedImprovement: string;
        impactLevel: "critical" | "high" | "medium" | "low";
        estimatedDuration: number;
        reversible: boolean;
        dependencies: string[];
    }[];
    reason: string;
    disabledFeatures: string[];
    performance: {
        currentLatency: number;
        baselineLatency: number;
        improvement: number;
    };
    recoveryEligible: boolean;
}, {
    triggeredAt: number;
    currentLevel: DegradationLevel;
    activeStrategies: {
        level: DegradationLevel;
        actions: string[];
        expectedImprovement: string;
        impactLevel: "critical" | "high" | "medium" | "low";
        estimatedDuration: number;
        reversible: boolean;
        dependencies: string[];
    }[];
    reason: string;
    disabledFeatures: string[];
    performance: {
        currentLatency: number;
        baselineLatency: number;
        improvement: number;
    };
    recoveryEligible: boolean;
}>;
export type DegradationState = z.infer<typeof DegradationStateSchema>;
/**
 * Recovery assessment
 */
export declare const RecoveryAssessmentSchema: z.ZodObject<{
    feasible: z.ZodBoolean;
    confidence: z.ZodNumber;
    estimatedDuration: z.ZodNumber;
    requiredConditions: z.ZodArray<z.ZodString, "many">;
    risks: z.ZodArray<z.ZodString, "many">;
    recommendedApproach: z.ZodEnum<["immediate", "gradual", "scheduled", "manual"]>;
    nextAssessment: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    estimatedDuration: number;
    feasible: boolean;
    confidence: number;
    requiredConditions: string[];
    risks: string[];
    recommendedApproach: "immediate" | "gradual" | "scheduled" | "manual";
    nextAssessment: number;
}, {
    estimatedDuration: number;
    feasible: boolean;
    confidence: number;
    requiredConditions: string[];
    risks: string[];
    recommendedApproach: "immediate" | "gradual" | "scheduled" | "manual";
    nextAssessment: number;
}>;
export type RecoveryAssessment = z.infer<typeof RecoveryAssessmentSchema>;
/**
 * System load assessment
 */
export declare const SystemLoadSchema: z.ZodObject<{
    cpu: z.ZodNumber;
    memory: z.ZodNumber;
    network: z.ZodNumber;
    concurrentOperations: z.ZodNumber;
    queueDepth: z.ZodNumber;
    level: z.ZodEnum<["low", "medium", "high", "critical"]>;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    timestamp: number;
    queueDepth: number;
    memory: number;
    level: "critical" | "high" | "medium" | "low";
    cpu: number;
    network: number;
    concurrentOperations: number;
}, {
    timestamp: number;
    queueDepth: number;
    memory: number;
    level: "critical" | "high" | "medium" | "low";
    cpu: number;
    network: number;
    concurrentOperations: number;
}>;
export type SystemLoad = z.infer<typeof SystemLoadSchema>;
/**
 * Adaptive budget configuration
 */
export declare const AdaptiveBudgetConfigSchema: z.ZodObject<{
    loadScaling: z.ZodObject<{
        lowLoad: z.ZodNumber;
        mediumLoad: z.ZodNumber;
        highLoad: z.ZodNumber;
        criticalLoad: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        lowLoad: number;
        mediumLoad: number;
        highLoad: number;
        criticalLoad: number;
    }, {
        lowLoad: number;
        mediumLoad: number;
        highLoad: number;
        criticalLoad: number;
    }>;
    contextModifiers: z.ZodRecord<z.ZodString, z.ZodNumber>;
    qosGuarantees: z.ZodRecord<z.ZodString, z.ZodObject<{
        budgetMultiplier: z.ZodNumber;
        preemptionPriority: z.ZodOptional<z.ZodNumber>;
        maxDelay: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        budgetMultiplier: number;
        preemptionPriority?: number | undefined;
        maxDelay?: number | undefined;
    }, {
        budgetMultiplier: number;
        preemptionPriority?: number | undefined;
        maxDelay?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    loadScaling: {
        lowLoad: number;
        mediumLoad: number;
        highLoad: number;
        criticalLoad: number;
    };
    contextModifiers: Record<string, number>;
    qosGuarantees: Record<string, {
        budgetMultiplier: number;
        preemptionPriority?: number | undefined;
        maxDelay?: number | undefined;
    }>;
}, {
    loadScaling: {
        lowLoad: number;
        mediumLoad: number;
        highLoad: number;
        criticalLoad: number;
    };
    contextModifiers: Record<string, number>;
    qosGuarantees: Record<string, {
        budgetMultiplier: number;
        preemptionPriority?: number | undefined;
        maxDelay?: number | undefined;
    }>;
}>;
export type AdaptiveBudgetConfig = z.infer<typeof AdaptiveBudgetConfigSchema>;
/**
 * Performance anomaly detection
 */
export declare const PerformanceAnomalySchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["latency_spike", "throughput_drop", "error_burst", "resource_spike"]>;
    severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
    operationType: z.ZodNativeEnum<typeof OperationType>;
    detectedAt: z.ZodNumber;
    duration: z.ZodNumber;
    metrics: z.ZodObject<{
        baseline: z.ZodNumber;
        observed: z.ZodNumber;
        deviation: z.ZodNumber;
        confidence: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        confidence: number;
        baseline: number;
        observed: number;
        deviation: number;
    }, {
        confidence: number;
        baseline: number;
        observed: number;
        deviation: number;
    }>;
    possibleCauses: z.ZodArray<z.ZodString, "many">;
    recommendedActions: z.ZodArray<z.ZodString, "many">;
    resolved: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    type: "latency_spike" | "throughput_drop" | "error_burst" | "resource_spike";
    id: string;
    severity: "critical" | "high" | "medium" | "low";
    resolved: boolean;
    duration: number;
    operationType: OperationType;
    detectedAt: number;
    metrics: {
        confidence: number;
        baseline: number;
        observed: number;
        deviation: number;
    };
    possibleCauses: string[];
    recommendedActions: string[];
}, {
    type: "latency_spike" | "throughput_drop" | "error_burst" | "resource_spike";
    id: string;
    severity: "critical" | "high" | "medium" | "low";
    resolved: boolean;
    duration: number;
    operationType: OperationType;
    detectedAt: number;
    metrics: {
        confidence: number;
        baseline: number;
        observed: number;
        deviation: number;
    };
    possibleCauses: string[];
    recommendedActions: string[];
}>;
export type PerformanceAnomaly = z.infer<typeof PerformanceAnomalySchema>;
/**
 * Performance baseline for comparison
 */
export declare const PerformanceBaselineSchema: z.ZodObject<{
    operationType: z.ZodNativeEnum<typeof OperationType>;
    context: z.ZodNativeEnum<typeof PerformanceContext>;
    timeWindow: z.ZodObject<{
        start: z.ZodNumber;
        end: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        start: number;
        end: number;
    }, {
        start: number;
        end: number;
    }>;
    statistics: z.ZodObject<{
        p50: z.ZodNumber;
        p95: z.ZodNumber;
        p99: z.ZodNumber;
        max: z.ZodNumber;
        mean: z.ZodNumber;
        stddev: z.ZodNumber;
        samples: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
        stddev: number;
        samples: number;
    }, {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
        stddev: number;
        samples: number;
    }>;
    sampleSize: z.ZodNumber;
    confidence: z.ZodNumber;
    lastUpdated: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    operationType: OperationType;
    context: PerformanceContext;
    timeWindow: {
        start: number;
        end: number;
    };
    statistics: {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
        stddev: number;
        samples: number;
    };
    sampleSize: number;
    lastUpdated: number;
}, {
    confidence: number;
    operationType: OperationType;
    context: PerformanceContext;
    timeWindow: {
        start: number;
        end: number;
    };
    statistics: {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
        stddev: number;
        samples: number;
    };
    sampleSize: number;
    lastUpdated: number;
}>;
export type PerformanceBaseline = z.infer<typeof PerformanceBaselineSchema>;
/**
 * Alert threshold configuration
 */
export declare const AlertThresholdSchema: z.ZodObject<{
    name: z.ZodString;
    metric: z.ZodString;
    operator: z.ZodEnum<[">", "<", ">=", "<=", "==", "!="]>;
    value: z.ZodNumber;
    window: z.ZodNumber;
    severity: z.ZodEnum<["info", "warning", "critical"]>;
    enabled: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    value: number;
    name: string;
    severity: "info" | "warning" | "critical";
    metric: string;
    operator: ">" | "<" | ">=" | "<=" | "==" | "!=";
    window: number;
    enabled: boolean;
}, {
    value: number;
    name: string;
    severity: "info" | "warning" | "critical";
    metric: string;
    operator: ">" | "<" | ">=" | "<=" | "==" | "!=";
    window: number;
    enabled: boolean;
}>;
export type AlertThreshold = z.infer<typeof AlertThresholdSchema>;
/**
 * Performance alert
 */
export declare const AlertSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    severity: z.ZodEnum<["info", "warning", "critical"]>;
    message: z.ZodString;
    metric: z.ZodString;
    currentValue: z.ZodNumber;
    thresholdValue: z.ZodNumber;
    triggeredAt: z.ZodNumber;
    resolved: z.ZodBoolean;
    resolvedAt: z.ZodOptional<z.ZodNumber>;
    acknowledgments: z.ZodArray<z.ZodObject<{
        user: z.ZodString;
        timestamp: z.ZodNumber;
        comment: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        user: string;
        timestamp: number;
        comment?: string | undefined;
    }, {
        user: string;
        timestamp: number;
        comment?: string | undefined;
    }>, "many">;
    escalationLevel: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    message: string;
    id: string;
    name: string;
    severity: "info" | "warning" | "critical";
    metric: string;
    currentValue: number;
    thresholdValue: number;
    triggeredAt: number;
    resolved: boolean;
    acknowledgments: {
        user: string;
        timestamp: number;
        comment?: string | undefined;
    }[];
    escalationLevel: number;
    resolvedAt?: number | undefined;
}, {
    message: string;
    id: string;
    name: string;
    severity: "info" | "warning" | "critical";
    metric: string;
    currentValue: number;
    thresholdValue: number;
    triggeredAt: number;
    resolved: boolean;
    acknowledgments: {
        user: string;
        timestamp: number;
        comment?: string | undefined;
    }[];
    escalationLevel: number;
    resolvedAt?: number | undefined;
}>;
export type Alert = z.infer<typeof AlertSchema>;
/**
 * Alert evaluation result
 */
export declare const AlertEvaluationSchema: z.ZodObject<{
    thresholdName: z.ZodString;
    triggered: z.ZodBoolean;
    currentValue: z.ZodNumber;
    thresholdValue: z.ZodNumber;
    severity: z.ZodEnum<["info", "warning", "critical"]>;
    message: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    message: string;
    severity: "info" | "warning" | "critical";
    currentValue: number;
    thresholdValue: number;
    thresholdName: string;
    triggered: boolean;
    metadata?: Record<string, any> | undefined;
}, {
    message: string;
    severity: "info" | "warning" | "critical";
    currentValue: number;
    thresholdValue: number;
    thresholdName: string;
    triggered: boolean;
    metadata?: Record<string, any> | undefined;
}>;
export type AlertEvaluation = z.infer<typeof AlertEvaluationSchema>;
/**
 * Performance query criteria
 */
export declare const PerformanceQuerySchema: z.ZodObject<{
    operationType: z.ZodOptional<z.ZodNativeEnum<typeof OperationType>>;
    module: z.ZodOptional<z.ZodString>;
    context: z.ZodOptional<z.ZodNativeEnum<typeof PerformanceContext>>;
    timeRange: z.ZodOptional<z.ZodObject<{
        start: z.ZodNumber;
        end: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        start: number;
        end: number;
    }, {
        start: number;
        end: number;
    }>>;
    aggregation: z.ZodOptional<z.ZodEnum<["raw", "minute", "hour", "day"]>>;
    percentiles: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
}, "strip", z.ZodTypeAny, {
    timeRange?: {
        start: number;
        end: number;
    } | undefined;
    operationType?: OperationType | undefined;
    context?: PerformanceContext | undefined;
    module?: string | undefined;
    aggregation?: "raw" | "minute" | "hour" | "day" | undefined;
    percentiles?: number[] | undefined;
}, {
    timeRange?: {
        start: number;
        end: number;
    } | undefined;
    operationType?: OperationType | undefined;
    context?: PerformanceContext | undefined;
    module?: string | undefined;
    aggregation?: "raw" | "minute" | "hour" | "day" | undefined;
    percentiles?: number[] | undefined;
}>;
export type PerformanceQuery = z.infer<typeof PerformanceQuerySchema>;
/**
 * Performance statistics result
 */
export declare const PerformanceStatsSchema: z.ZodObject<{
    operationType: z.ZodNativeEnum<typeof OperationType>;
    context: z.ZodNativeEnum<typeof PerformanceContext>;
    timeRange: z.ZodObject<{
        start: z.ZodNumber;
        end: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        start: number;
        end: number;
    }, {
        start: number;
        end: number;
    }>;
    latency: z.ZodObject<{
        p50: z.ZodNumber;
        p95: z.ZodNumber;
        p99: z.ZodNumber;
        max: z.ZodNumber;
        mean: z.ZodNumber;
        stddev: z.ZodNumber;
        samples: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
        stddev: number;
        samples: number;
    }, {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
        stddev: number;
        samples: number;
    }>;
    throughput: z.ZodObject<{
        operationsPerSecond: z.ZodNumber;
        totalOperations: z.ZodNumber;
        peakOps: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        operationsPerSecond: number;
        totalOperations: number;
        peakOps: number;
    }, {
        operationsPerSecond: number;
        totalOperations: number;
        peakOps: number;
    }>;
    errors: z.ZodObject<{
        totalErrors: z.ZodNumber;
        errorRate: z.ZodNumber;
        topErrorTypes: z.ZodArray<z.ZodObject<{
            type: z.ZodString;
            count: z.ZodNumber;
            percentage: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            type: string;
            count: number;
            percentage: number;
        }, {
            type: string;
            count: number;
            percentage: number;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        errorRate: number;
        totalErrors: number;
        topErrorTypes: {
            type: string;
            count: number;
            percentage: number;
        }[];
    }, {
        errorRate: number;
        totalErrors: number;
        topErrorTypes: {
            type: string;
            count: number;
            percentage: number;
        }[];
    }>;
    trends: z.ZodObject<{
        latencyTrend: z.ZodEnum<["improving", "stable", "degrading"]>;
        throughputTrend: z.ZodEnum<["increasing", "stable", "decreasing"]>;
        errorTrend: z.ZodEnum<["improving", "stable", "worsening"]>;
    }, "strip", z.ZodTypeAny, {
        latencyTrend: "improving" | "stable" | "degrading";
        throughputTrend: "stable" | "increasing" | "decreasing";
        errorTrend: "improving" | "stable" | "worsening";
    }, {
        latencyTrend: "improving" | "stable" | "degrading";
        throughputTrend: "stable" | "increasing" | "decreasing";
        errorTrend: "improving" | "stable" | "worsening";
    }>;
}, "strip", z.ZodTypeAny, {
    latency: {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
        stddev: number;
        samples: number;
    };
    throughput: {
        operationsPerSecond: number;
        totalOperations: number;
        peakOps: number;
    };
    timeRange: {
        start: number;
        end: number;
    };
    trends: {
        latencyTrend: "improving" | "stable" | "degrading";
        throughputTrend: "stable" | "increasing" | "decreasing";
        errorTrend: "improving" | "stable" | "worsening";
    };
    operationType: OperationType;
    context: PerformanceContext;
    errors: {
        errorRate: number;
        totalErrors: number;
        topErrorTypes: {
            type: string;
            count: number;
            percentage: number;
        }[];
    };
}, {
    latency: {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
        stddev: number;
        samples: number;
    };
    throughput: {
        operationsPerSecond: number;
        totalOperations: number;
        peakOps: number;
    };
    timeRange: {
        start: number;
        end: number;
    };
    trends: {
        latencyTrend: "improving" | "stable" | "degrading";
        throughputTrend: "stable" | "increasing" | "decreasing";
        errorTrend: "improving" | "stable" | "worsening";
    };
    operationType: OperationType;
    context: PerformanceContext;
    errors: {
        errorRate: number;
        totalErrors: number;
        topErrorTypes: {
            type: string;
            count: number;
            percentage: number;
        }[];
    };
}>;
export type PerformanceStats = z.infer<typeof PerformanceStatsSchema>;
/**
 * Real-time dashboard metrics
 */
export declare const DashboardMetricsSchema: z.ZodObject<{
    liveIndicators: z.ZodObject<{
        currentLatency: z.ZodNumber;
        budgetUtilization: z.ZodNumber;
        operationsPerSecond: z.ZodNumber;
        errorRate: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        operationsPerSecond: number;
        errorRate: number;
        currentLatency: number;
        budgetUtilization: number;
    }, {
        operationsPerSecond: number;
        errorRate: number;
        currentLatency: number;
        budgetUtilization: number;
    }>;
    trends: z.ZodObject<{
        latencyTrend: z.ZodArray<z.ZodObject<{
            timestamp: z.ZodNumber;
            value: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            value: number;
            timestamp: number;
        }, {
            value: number;
            timestamp: number;
        }>, "many">;
        throughputTrend: z.ZodArray<z.ZodObject<{
            timestamp: z.ZodNumber;
            value: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            value: number;
            timestamp: number;
        }, {
            value: number;
            timestamp: number;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        latencyTrend: {
            value: number;
            timestamp: number;
        }[];
        throughputTrend: {
            value: number;
            timestamp: number;
        }[];
    }, {
        latencyTrend: {
            value: number;
            timestamp: number;
        }[];
        throughputTrend: {
            value: number;
            timestamp: number;
        }[];
    }>;
    healthStatus: z.ZodObject<{
        overall: z.ZodEnum<["healthy", "warning", "critical"]>;
        components: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            status: z.ZodEnum<["healthy", "warning", "critical"]>;
            latency: z.ZodNumber;
            errorRate: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            status: "warning" | "critical" | "healthy";
            name: string;
            latency: number;
            errorRate: number;
        }, {
            status: "warning" | "critical" | "healthy";
            name: string;
            latency: number;
            errorRate: number;
        }>, "many">;
        alerts: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            severity: z.ZodEnum<["info", "warning", "critical"]>;
            message: z.ZodString;
            metric: z.ZodString;
            currentValue: z.ZodNumber;
            thresholdValue: z.ZodNumber;
            triggeredAt: z.ZodNumber;
            resolved: z.ZodBoolean;
            resolvedAt: z.ZodOptional<z.ZodNumber>;
            acknowledgments: z.ZodArray<z.ZodObject<{
                user: z.ZodString;
                timestamp: z.ZodNumber;
                comment: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                user: string;
                timestamp: number;
                comment?: string | undefined;
            }, {
                user: string;
                timestamp: number;
                comment?: string | undefined;
            }>, "many">;
            escalationLevel: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            message: string;
            id: string;
            name: string;
            severity: "info" | "warning" | "critical";
            metric: string;
            currentValue: number;
            thresholdValue: number;
            triggeredAt: number;
            resolved: boolean;
            acknowledgments: {
                user: string;
                timestamp: number;
                comment?: string | undefined;
            }[];
            escalationLevel: number;
            resolvedAt?: number | undefined;
        }, {
            message: string;
            id: string;
            name: string;
            severity: "info" | "warning" | "critical";
            metric: string;
            currentValue: number;
            thresholdValue: number;
            triggeredAt: number;
            resolved: boolean;
            acknowledgments: {
                user: string;
                timestamp: number;
                comment?: string | undefined;
            }[];
            escalationLevel: number;
            resolvedAt?: number | undefined;
        }>, "many">;
        degradationLevel: z.ZodNativeEnum<typeof DegradationLevel>;
    }, "strip", z.ZodTypeAny, {
        overall: "warning" | "critical" | "healthy";
        components: {
            status: "warning" | "critical" | "healthy";
            name: string;
            latency: number;
            errorRate: number;
        }[];
        alerts: {
            message: string;
            id: string;
            name: string;
            severity: "info" | "warning" | "critical";
            metric: string;
            currentValue: number;
            thresholdValue: number;
            triggeredAt: number;
            resolved: boolean;
            acknowledgments: {
                user: string;
                timestamp: number;
                comment?: string | undefined;
            }[];
            escalationLevel: number;
            resolvedAt?: number | undefined;
        }[];
        degradationLevel: DegradationLevel;
    }, {
        overall: "warning" | "critical" | "healthy";
        components: {
            status: "warning" | "critical" | "healthy";
            name: string;
            latency: number;
            errorRate: number;
        }[];
        alerts: {
            message: string;
            id: string;
            name: string;
            severity: "info" | "warning" | "critical";
            metric: string;
            currentValue: number;
            thresholdValue: number;
            triggeredAt: number;
            resolved: boolean;
            acknowledgments: {
                user: string;
                timestamp: number;
                comment?: string | undefined;
            }[];
            escalationLevel: number;
            resolvedAt?: number | undefined;
        }[];
        degradationLevel: DegradationLevel;
    }>;
}, "strip", z.ZodTypeAny, {
    liveIndicators: {
        operationsPerSecond: number;
        errorRate: number;
        currentLatency: number;
        budgetUtilization: number;
    };
    trends: {
        latencyTrend: {
            value: number;
            timestamp: number;
        }[];
        throughputTrend: {
            value: number;
            timestamp: number;
        }[];
    };
    healthStatus: {
        overall: "warning" | "critical" | "healthy";
        components: {
            status: "warning" | "critical" | "healthy";
            name: string;
            latency: number;
            errorRate: number;
        }[];
        alerts: {
            message: string;
            id: string;
            name: string;
            severity: "info" | "warning" | "critical";
            metric: string;
            currentValue: number;
            thresholdValue: number;
            triggeredAt: number;
            resolved: boolean;
            acknowledgments: {
                user: string;
                timestamp: number;
                comment?: string | undefined;
            }[];
            escalationLevel: number;
            resolvedAt?: number | undefined;
        }[];
        degradationLevel: DegradationLevel;
    };
}, {
    liveIndicators: {
        operationsPerSecond: number;
        errorRate: number;
        currentLatency: number;
        budgetUtilization: number;
    };
    trends: {
        latencyTrend: {
            value: number;
            timestamp: number;
        }[];
        throughputTrend: {
            value: number;
            timestamp: number;
        }[];
    };
    healthStatus: {
        overall: "warning" | "critical" | "healthy";
        components: {
            status: "warning" | "critical" | "healthy";
            name: string;
            latency: number;
            errorRate: number;
        }[];
        alerts: {
            message: string;
            id: string;
            name: string;
            severity: "info" | "warning" | "critical";
            metric: string;
            currentValue: number;
            thresholdValue: number;
            triggeredAt: number;
            resolved: boolean;
            acknowledgments: {
                user: string;
                timestamp: number;
                comment?: string | undefined;
            }[];
            escalationLevel: number;
            resolvedAt?: number | undefined;
        }[];
        degradationLevel: DegradationLevel;
    };
}>;
export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;
/**
 * Real-time monitoring configuration
 */
export declare const RealTimeConfigSchema: z.ZodObject<{
    performanceBudgets: z.ZodObject<{
        emergency: z.ZodObject<{
            total: z.ZodNumber;
            allocation: z.ZodObject<{
                signalProcessing: z.ZodNumber;
                routing: z.ZodNumber;
                execution: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                signalProcessing: number;
                routing: number;
                execution: number;
            }, {
                signalProcessing: number;
                routing: number;
                execution: number;
            }>;
            triggers: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        }, {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        }>;
        routine: z.ZodObject<{
            total: z.ZodNumber;
            allocation: z.ZodObject<{
                signalProcessing: z.ZodNumber;
                routing: z.ZodNumber;
                execution: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                signalProcessing: number;
                routing: number;
                execution: number;
            }, {
                signalProcessing: number;
                routing: number;
                execution: number;
            }>;
            triggers: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        }, {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        }>;
        deliberative: z.ZodObject<{
            total: z.ZodNumber;
            allocation: z.ZodObject<{
                signalProcessing: z.ZodNumber;
                routing: z.ZodNumber;
                execution: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                signalProcessing: number;
                routing: number;
                execution: number;
            }, {
                signalProcessing: number;
                routing: number;
                execution: number;
            }>;
            triggers: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        }, {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        }>;
    }, "strip", z.ZodTypeAny, {
        emergency: {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        };
        routine: {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        };
        deliberative: {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        };
    }, {
        emergency: {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        };
        routine: {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        };
        deliberative: {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        };
    }>;
    monitoring: z.ZodObject<{
        samplingRate: z.ZodNumber;
        retentionDays: z.ZodNumber;
        aggregationIntervals: z.ZodArray<z.ZodNumber, "many">;
    }, "strip", z.ZodTypeAny, {
        samplingRate: number;
        retentionDays: number;
        aggregationIntervals: number[];
    }, {
        samplingRate: number;
        retentionDays: number;
        aggregationIntervals: number[];
    }>;
    alerting: z.ZodObject<{
        enabled: z.ZodBoolean;
        channels: z.ZodArray<z.ZodString, "many">;
        thresholds: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            metric: z.ZodString;
            operator: z.ZodEnum<[">", "<", ">=", "<=", "==", "!="]>;
            value: z.ZodNumber;
            window: z.ZodNumber;
            severity: z.ZodEnum<["info", "warning", "critical"]>;
            enabled: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            value: number;
            name: string;
            severity: "info" | "warning" | "critical";
            metric: string;
            operator: ">" | "<" | ">=" | "<=" | "==" | "!=";
            window: number;
            enabled: boolean;
        }, {
            value: number;
            name: string;
            severity: "info" | "warning" | "critical";
            metric: string;
            operator: ">" | "<" | ">=" | "<=" | "==" | "!=";
            window: number;
            enabled: boolean;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        channels: string[];
        thresholds: {
            value: number;
            name: string;
            severity: "info" | "warning" | "critical";
            metric: string;
            operator: ">" | "<" | ">=" | "<=" | "==" | "!=";
            window: number;
            enabled: boolean;
        }[];
    }, {
        enabled: boolean;
        channels: string[];
        thresholds: {
            value: number;
            name: string;
            severity: "info" | "warning" | "critical";
            metric: string;
            operator: ">" | "<" | ">=" | "<=" | "==" | "!=";
            window: number;
            enabled: boolean;
        }[];
    }>;
    degradation: z.ZodObject<{
        autoDegradationEnabled: z.ZodBoolean;
        recoveryAttemptInterval: z.ZodNumber;
        maxDegradationDuration: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        autoDegradationEnabled: boolean;
        recoveryAttemptInterval: number;
        maxDegradationDuration: number;
    }, {
        autoDegradationEnabled: boolean;
        recoveryAttemptInterval: number;
        maxDegradationDuration: number;
    }>;
    adaptiveBudget: z.ZodObject<{
        loadScaling: z.ZodObject<{
            lowLoad: z.ZodNumber;
            mediumLoad: z.ZodNumber;
            highLoad: z.ZodNumber;
            criticalLoad: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            lowLoad: number;
            mediumLoad: number;
            highLoad: number;
            criticalLoad: number;
        }, {
            lowLoad: number;
            mediumLoad: number;
            highLoad: number;
            criticalLoad: number;
        }>;
        contextModifiers: z.ZodRecord<z.ZodString, z.ZodNumber>;
        qosGuarantees: z.ZodRecord<z.ZodString, z.ZodObject<{
            budgetMultiplier: z.ZodNumber;
            preemptionPriority: z.ZodOptional<z.ZodNumber>;
            maxDelay: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            budgetMultiplier: number;
            preemptionPriority?: number | undefined;
            maxDelay?: number | undefined;
        }, {
            budgetMultiplier: number;
            preemptionPriority?: number | undefined;
            maxDelay?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        loadScaling: {
            lowLoad: number;
            mediumLoad: number;
            highLoad: number;
            criticalLoad: number;
        };
        contextModifiers: Record<string, number>;
        qosGuarantees: Record<string, {
            budgetMultiplier: number;
            preemptionPriority?: number | undefined;
            maxDelay?: number | undefined;
        }>;
    }, {
        loadScaling: {
            lowLoad: number;
            mediumLoad: number;
            highLoad: number;
            criticalLoad: number;
        };
        contextModifiers: Record<string, number>;
        qosGuarantees: Record<string, {
            budgetMultiplier: number;
            preemptionPriority?: number | undefined;
            maxDelay?: number | undefined;
        }>;
    }>;
}, "strip", z.ZodTypeAny, {
    performanceBudgets: {
        emergency: {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        };
        routine: {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        };
        deliberative: {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        };
    };
    monitoring: {
        samplingRate: number;
        retentionDays: number;
        aggregationIntervals: number[];
    };
    alerting: {
        enabled: boolean;
        channels: string[];
        thresholds: {
            value: number;
            name: string;
            severity: "info" | "warning" | "critical";
            metric: string;
            operator: ">" | "<" | ">=" | "<=" | "==" | "!=";
            window: number;
            enabled: boolean;
        }[];
    };
    degradation: {
        autoDegradationEnabled: boolean;
        recoveryAttemptInterval: number;
        maxDegradationDuration: number;
    };
    adaptiveBudget: {
        loadScaling: {
            lowLoad: number;
            mediumLoad: number;
            highLoad: number;
            criticalLoad: number;
        };
        contextModifiers: Record<string, number>;
        qosGuarantees: Record<string, {
            budgetMultiplier: number;
            preemptionPriority?: number | undefined;
            maxDelay?: number | undefined;
        }>;
    };
}, {
    performanceBudgets: {
        emergency: {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        };
        routine: {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        };
        deliberative: {
            allocation: {
                signalProcessing: number;
                routing: number;
                execution: number;
            };
            total: number;
            triggers: string[];
        };
    };
    monitoring: {
        samplingRate: number;
        retentionDays: number;
        aggregationIntervals: number[];
    };
    alerting: {
        enabled: boolean;
        channels: string[];
        thresholds: {
            value: number;
            name: string;
            severity: "info" | "warning" | "critical";
            metric: string;
            operator: ">" | "<" | ">=" | "<=" | "==" | "!=";
            window: number;
            enabled: boolean;
        }[];
    };
    degradation: {
        autoDegradationEnabled: boolean;
        recoveryAttemptInterval: number;
        maxDegradationDuration: number;
    };
    adaptiveBudget: {
        loadScaling: {
            lowLoad: number;
            mediumLoad: number;
            highLoad: number;
            criticalLoad: number;
        };
        contextModifiers: Record<string, number>;
        qosGuarantees: Record<string, {
            budgetMultiplier: number;
            preemptionPriority?: number | undefined;
            maxDelay?: number | undefined;
        }>;
    };
}>;
export type RealTimeConfig = z.infer<typeof RealTimeConfigSchema>;
/**
 * Performance tracker interface
 */
export interface IPerformanceTracker {
    startTracking(operation: CognitiveOperation, context: PerformanceContext): TrackingSession;
    recordCompletion(session: TrackingSession, result: OperationResult): PerformanceMetrics;
    getPerformanceStats(query: PerformanceQuery): PerformanceStats;
    detectAnomalies(timeWindow: number): PerformanceAnomaly[];
}
/**
 * Budget enforcer interface
 */
export interface IBudgetEnforcer {
    allocateBudget(operation: CognitiveOperation, context: PerformanceContext): BudgetAllocation;
    monitorBudgetUsage(session: TrackingSession, allocation: BudgetAllocation): BudgetStatus;
    triggerDegradation(violation: BudgetViolation): DegradationState;
    calculateDynamicBudget(baseBudget: BudgetConfig, systemLoad: SystemLoad): BudgetConfig;
}
/**
 * Degradation manager interface
 */
export interface IDegradationManager {
    evaluateDegradationStrategy(violation: BudgetViolation, currentState: DegradationState): DegradationStrategy;
    executeDegradation(strategy: DegradationStrategy): DegradationState;
    assessRecovery(state: DegradationState): RecoveryAssessment;
    restoreOperation(state: DegradationState, strategy: DegradationStrategy): DegradationState;
}
/**
 * Alerting system interface
 */
export interface IAlertingSystem {
    evaluateAlerts(metrics: PerformanceMetrics, thresholds: AlertThreshold[]): AlertEvaluation[];
    sendAlert(alert: Alert): Promise<boolean>;
    acknowledgeAlert(alertId: string, user: string, comment?: string): boolean;
    getActiveAlerts(): Alert[];
}
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
export declare const validatePerformanceMetrics: (data: unknown) => PerformanceMetrics;
export declare const validateTrackingSession: (data: unknown) => TrackingSession;
export declare const validateBudgetAllocation: (data: unknown) => BudgetAllocation;
export declare const validateRealTimeConfig: (data: unknown) => RealTimeConfig;
//# sourceMappingURL=types.d.ts.map