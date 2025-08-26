/**
 * Core types and interfaces for the conscious bot architecture
 *
 * @author @darianrosebrook
 */
import { z } from 'zod';
/**
 * Normalized signal from various sources (body, environment, social, etc.)
 */
export declare const SignalSchema: z.ZodObject<{
    type: z.ZodEnum<["health", "hunger", "fatigue", "threat", "social", "memory", "intrusion"]>;
    intensity: z.ZodNumber;
    trend: z.ZodNumber;
    confidence: z.ZodNumber;
    timestamp: z.ZodNumber;
    source: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    type: "social" | "intrusion" | "memory" | "health" | "hunger" | "threat" | "fatigue";
    timestamp: number;
    confidence: number;
    intensity: number;
    trend: number;
    source: string;
    metadata?: Record<string, any> | undefined;
}, {
    type: "social" | "intrusion" | "memory" | "health" | "hunger" | "threat" | "fatigue";
    timestamp: number;
    confidence: number;
    intensity: number;
    trend: number;
    source: string;
    metadata?: Record<string, any> | undefined;
}>;
export type Signal = z.infer<typeof SignalSchema>;
/**
 * Aggregated need scores computed from signals
 */
export declare const NeedScoreSchema: z.ZodObject<{
    type: z.ZodEnum<["safety", "nutrition", "progress", "social", "curiosity", "integrity"]>;
    score: z.ZodNumber;
    trend: z.ZodNumber;
    urgency: z.ZodNumber;
    lastUpdated: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "social" | "progress" | "safety" | "nutrition" | "curiosity" | "integrity";
    lastUpdated: number;
    score: number;
    urgency: number;
    trend: number;
}, {
    type: "social" | "progress" | "safety" | "nutrition" | "curiosity" | "integrity";
    lastUpdated: number;
    score: number;
    urgency: number;
    trend: number;
}>;
export type NeedScore = z.infer<typeof NeedScoreSchema>;
/**
 * Task that requires cognitive processing
 */
export declare const CognitiveTaskSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["planning", "reasoning", "social", "reactive", "exploration"]>;
    priority: z.ZodNumber;
    complexity: z.ZodEnum<["simple", "moderate", "complex"]>;
    context: z.ZodRecord<z.ZodString, z.ZodAny>;
    deadline: z.ZodOptional<z.ZodNumber>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    type: "social" | "planning" | "reasoning" | "reactive" | "exploration";
    id: string;
    context: Record<string, any>;
    priority: number;
    complexity: "moderate" | "simple" | "complex";
    metadata?: Record<string, any> | undefined;
    deadline?: number | undefined;
}, {
    type: "social" | "planning" | "reasoning" | "reactive" | "exploration";
    id: string;
    context: Record<string, any>;
    priority: number;
    complexity: "moderate" | "simple" | "complex";
    metadata?: Record<string, any> | undefined;
    deadline?: number | undefined;
}>;
export type CognitiveTask = z.infer<typeof CognitiveTaskSchema>;
/**
 * Signature of a task for routing decisions
 */
export declare const TaskSignatureSchema: z.ZodObject<{
    symbolicPreconditions: z.ZodNumber;
    socialContent: z.ZodBoolean;
    ambiguousContext: z.ZodBoolean;
    requiresPlanning: z.ZodBoolean;
    timeConstraint: z.ZodNumber;
    riskLevel: z.ZodEnum<["low", "medium", "high"]>;
}, "strip", z.ZodTypeAny, {
    riskLevel: "high" | "medium" | "low";
    symbolicPreconditions: number;
    socialContent: boolean;
    ambiguousContext: boolean;
    requiresPlanning: boolean;
    timeConstraint: number;
}, {
    riskLevel: "high" | "medium" | "low";
    symbolicPreconditions: number;
    socialContent: boolean;
    ambiguousContext: boolean;
    requiresPlanning: boolean;
    timeConstraint: number;
}>;
export type TaskSignature = z.infer<typeof TaskSignatureSchema>;
/**
 * Performance budget for operations
 */
export declare const PerformanceBudgetSchema: z.ZodObject<{
    context: z.ZodEnum<["emergency", "routine", "deliberative"]>;
    total: z.ZodNumber;
    allocated: z.ZodNumber;
    remaining: z.ZodNumber;
    breakdown: z.ZodObject<{
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
}, "strip", z.ZodTypeAny, {
    context: "emergency" | "routine" | "deliberative";
    remaining: number;
    total: number;
    allocated: number;
    breakdown: {
        signalProcessing: number;
        routing: number;
        execution: number;
    };
}, {
    context: "emergency" | "routine" | "deliberative";
    remaining: number;
    total: number;
    allocated: number;
    breakdown: {
        signalProcessing: number;
        routing: number;
        execution: number;
    };
}>;
export type PerformanceBudget = z.infer<typeof PerformanceBudgetSchema>;
/**
 * Performance metrics for monitoring
 */
export declare const PerformanceMetricsSchema: z.ZodObject<{
    latency: z.ZodObject<{
        p50: z.ZodNumber;
        p95: z.ZodNumber;
        p99: z.ZodNumber;
        max: z.ZodNumber;
        mean: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
    }, {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
    }>;
    throughput: z.ZodObject<{
        operationsPerSecond: z.ZodNumber;
        queueDepth: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        operationsPerSecond: number;
        queueDepth: number;
    }, {
        operationsPerSecond: number;
        queueDepth: number;
    }>;
    resources: z.ZodObject<{
        cpuUtilization: z.ZodNumber;
        memoryUsage: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        cpuUtilization: number;
        memoryUsage: number;
    }, {
        cpuUtilization: number;
        memoryUsage: number;
    }>;
    quality: z.ZodObject<{
        successRate: z.ZodNumber;
        errorRate: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        successRate: number;
        errorRate: number;
    }, {
        successRate: number;
        errorRate: number;
    }>;
}, "strip", z.ZodTypeAny, {
    latency: {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
    };
    throughput: {
        operationsPerSecond: number;
        queueDepth: number;
    };
    resources: {
        cpuUtilization: number;
        memoryUsage: number;
    };
    quality: {
        successRate: number;
        errorRate: number;
    };
}, {
    latency: {
        p50: number;
        p95: number;
        p99: number;
        max: number;
        mean: number;
    };
    throughput: {
        operationsPerSecond: number;
        queueDepth: number;
    };
    resources: {
        cpuUtilization: number;
        memoryUsage: number;
    };
    quality: {
        successRate: number;
        errorRate: number;
    };
}>;
export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;
/**
 * Available cognitive modules for task processing
 */
export declare enum ModuleType {
    HRM = "hrm",// Hierarchical Reasoning Model
    LLM = "llm",// Large Language Model
    GOAP = "goap",// Goal-Oriented Action Planning
    REFLEX = "reflex"
}
/**
 * Routing decision for cognitive tasks
 */
export declare const RoutingDecisionSchema: z.ZodObject<{
    selectedModule: z.ZodNativeEnum<typeof ModuleType>;
    confidence: z.ZodNumber;
    reasoning: z.ZodString;
    alternatives: z.ZodArray<z.ZodObject<{
        module: z.ZodNativeEnum<typeof ModuleType>;
        score: z.ZodNumber;
        reason: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        module: ModuleType;
        score: number;
    }, {
        reason: string;
        module: ModuleType;
        score: number;
    }>, "many">;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    timestamp: number;
    confidence: number;
    reasoning: string;
    selectedModule: ModuleType;
    alternatives: {
        reason: string;
        module: ModuleType;
        score: number;
    }[];
}, {
    timestamp: number;
    confidence: number;
    reasoning: string;
    selectedModule: ModuleType;
    alternatives: {
        reason: string;
        module: ModuleType;
        score: number;
    }[];
}>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
/**
 * Preemption priorities for task interruption
 */
export declare enum PreemptionPriority {
    EMERGENCY_REFLEX = 0,// Immediate danger (fall, lava, attack)
    SAFETY_INTERRUPT = 1,// Safety violations, health critical
    GOAL_COMPLETION = 2,// Active goal execution
    EXPLORATION = 3,// Curiosity-driven behavior
    IDLE_PROCESSING = 4
}
/**
 * Preemption decision and execution plan
 */
export declare const PreemptionDecisionSchema: z.ZodObject<{
    shouldPreempt: z.ZodBoolean;
    priority: z.ZodNativeEnum<typeof PreemptionPriority>;
    currentTask: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["planning", "reasoning", "social", "reactive", "exploration"]>;
        priority: z.ZodNumber;
        complexity: z.ZodEnum<["simple", "moderate", "complex"]>;
        context: z.ZodRecord<z.ZodString, z.ZodAny>;
        deadline: z.ZodOptional<z.ZodNumber>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        type: "social" | "planning" | "reasoning" | "reactive" | "exploration";
        id: string;
        context: Record<string, any>;
        priority: number;
        complexity: "moderate" | "simple" | "complex";
        metadata?: Record<string, any> | undefined;
        deadline?: number | undefined;
    }, {
        type: "social" | "planning" | "reasoning" | "reactive" | "exploration";
        id: string;
        context: Record<string, any>;
        priority: number;
        complexity: "moderate" | "simple" | "complex";
        metadata?: Record<string, any> | undefined;
        deadline?: number | undefined;
    }>>;
    incomingTask: z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["planning", "reasoning", "social", "reactive", "exploration"]>;
        priority: z.ZodNumber;
        complexity: z.ZodEnum<["simple", "moderate", "complex"]>;
        context: z.ZodRecord<z.ZodString, z.ZodAny>;
        deadline: z.ZodOptional<z.ZodNumber>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        type: "social" | "planning" | "reasoning" | "reactive" | "exploration";
        id: string;
        context: Record<string, any>;
        priority: number;
        complexity: "moderate" | "simple" | "complex";
        metadata?: Record<string, any> | undefined;
        deadline?: number | undefined;
    }, {
        type: "social" | "planning" | "reasoning" | "reactive" | "exploration";
        id: string;
        context: Record<string, any>;
        priority: number;
        complexity: "moderate" | "simple" | "complex";
        metadata?: Record<string, any> | undefined;
        deadline?: number | undefined;
    }>;
    preservationRequired: z.ZodBoolean;
    reasoning: z.ZodString;
    estimatedCost: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    priority: PreemptionPriority;
    estimatedCost: number;
    reasoning: string;
    shouldPreempt: boolean;
    incomingTask: {
        type: "social" | "planning" | "reasoning" | "reactive" | "exploration";
        id: string;
        context: Record<string, any>;
        priority: number;
        complexity: "moderate" | "simple" | "complex";
        metadata?: Record<string, any> | undefined;
        deadline?: number | undefined;
    };
    preservationRequired: boolean;
    currentTask?: {
        type: "social" | "planning" | "reasoning" | "reactive" | "exploration";
        id: string;
        context: Record<string, any>;
        priority: number;
        complexity: "moderate" | "simple" | "complex";
        metadata?: Record<string, any> | undefined;
        deadline?: number | undefined;
    } | undefined;
}, {
    priority: PreemptionPriority;
    estimatedCost: number;
    reasoning: string;
    shouldPreempt: boolean;
    incomingTask: {
        type: "social" | "planning" | "reasoning" | "reactive" | "exploration";
        id: string;
        context: Record<string, any>;
        priority: number;
        complexity: "moderate" | "simple" | "complex";
        metadata?: Record<string, any> | undefined;
        deadline?: number | undefined;
    };
    preservationRequired: boolean;
    currentTask?: {
        type: "social" | "planning" | "reasoning" | "reactive" | "exploration";
        id: string;
        context: Record<string, any>;
        priority: number;
        complexity: "moderate" | "simple" | "complex";
        metadata?: Record<string, any> | undefined;
        deadline?: number | undefined;
    } | undefined;
}>;
export type PreemptionDecision = z.infer<typeof PreemptionDecisionSchema>;
/**
 * Safety violation types
 */
export declare const SafetyViolationSchema: z.ZodObject<{
    type: z.ZodEnum<["budget_exceeded", "infinite_loop", "memory_leak", "unsafe_operation"]>;
    severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
    description: z.ZodString;
    timestamp: z.ZodNumber;
    context: z.ZodRecord<z.ZodString, z.ZodAny>;
    suggestedAction: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "budget_exceeded" | "infinite_loop" | "memory_leak" | "unsafe_operation";
    severity: "critical" | "high" | "medium" | "low";
    timestamp: number;
    context: Record<string, any>;
    description: string;
    suggestedAction: string;
}, {
    type: "budget_exceeded" | "infinite_loop" | "memory_leak" | "unsafe_operation";
    severity: "critical" | "high" | "medium" | "low";
    timestamp: number;
    context: Record<string, any>;
    description: string;
    suggestedAction: string;
}>;
export type SafetyViolation = z.infer<typeof SafetyViolationSchema>;
/**
 * System degradation levels
 */
export declare enum DegradationLevel {
    NONE = 0,// Full functionality
    MINIMAL = 1,// Minor feature reduction
    MODERATE = 2,// Significant capability reduction  
    SEVERE = 3,// Emergency functionality only
    CRITICAL = 4
}
/**
 * Health assessment result
 */
export declare const HealthAssessmentSchema: z.ZodObject<{
    overall: z.ZodEnum<["healthy", "degraded", "critical"]>;
    degradationLevel: z.ZodNativeEnum<typeof DegradationLevel>;
    violations: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["budget_exceeded", "infinite_loop", "memory_leak", "unsafe_operation"]>;
        severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
        description: z.ZodString;
        timestamp: z.ZodNumber;
        context: z.ZodRecord<z.ZodString, z.ZodAny>;
        suggestedAction: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "budget_exceeded" | "infinite_loop" | "memory_leak" | "unsafe_operation";
        severity: "critical" | "high" | "medium" | "low";
        timestamp: number;
        context: Record<string, any>;
        description: string;
        suggestedAction: string;
    }, {
        type: "budget_exceeded" | "infinite_loop" | "memory_leak" | "unsafe_operation";
        severity: "critical" | "high" | "medium" | "low";
        timestamp: number;
        context: Record<string, any>;
        description: string;
        suggestedAction: string;
    }>, "many">;
    recommendations: z.ZodArray<z.ZodString, "many">;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    timestamp: number;
    overall: "critical" | "healthy" | "degraded";
    degradationLevel: DegradationLevel;
    recommendations: string[];
    violations: {
        type: "budget_exceeded" | "infinite_loop" | "memory_leak" | "unsafe_operation";
        severity: "critical" | "high" | "medium" | "low";
        timestamp: number;
        context: Record<string, any>;
        description: string;
        suggestedAction: string;
    }[];
}, {
    timestamp: number;
    overall: "critical" | "healthy" | "degraded";
    degradationLevel: DegradationLevel;
    recommendations: string[];
    violations: {
        type: "budget_exceeded" | "infinite_loop" | "memory_leak" | "unsafe_operation";
        severity: "critical" | "high" | "medium" | "low";
        timestamp: number;
        context: Record<string, any>;
        description: string;
        suggestedAction: string;
    }[];
}>;
export type HealthAssessment = z.infer<typeof HealthAssessmentSchema>;
/**
 * Arbiter configuration
 */
export declare const ArbiterConfigSchema: z.ZodObject<{
    performanceBudgets: z.ZodObject<{
        emergency: z.ZodNumber;
        routine: z.ZodNumber;
        deliberative: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        emergency: number;
        routine: number;
        deliberative: number;
    }, {
        emergency: number;
        routine: number;
        deliberative: number;
    }>;
    preemptionEnabled: z.ZodBoolean;
    safeModeEnabled: z.ZodBoolean;
    monitoringEnabled: z.ZodBoolean;
    debugMode: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    performanceBudgets: {
        emergency: number;
        routine: number;
        deliberative: number;
    };
    preemptionEnabled: boolean;
    safeModeEnabled: boolean;
    monitoringEnabled: boolean;
    debugMode: boolean;
}, {
    performanceBudgets: {
        emergency: number;
        routine: number;
        deliberative: number;
    };
    preemptionEnabled: boolean;
    safeModeEnabled: boolean;
    monitoringEnabled: boolean;
    debugMode: boolean;
}>;
export type ArbiterConfig = z.infer<typeof ArbiterConfigSchema>;
/**
 * System events for module communication
 */
export interface SystemEvents {
    'signal-received': [Signal];
    'needs-updated': [NeedScore[]];
    'task-routed': [{
        task: CognitiveTask;
        decision: RoutingDecision;
    }];
    'preemption-triggered': [PreemptionDecision];
    'safety-violation': [SafetyViolation];
    'degradation-changed': [DegradationLevel];
    'performance-update': [PerformanceMetrics];
}
/**
 * Result wrapper for operations that can fail
 */
export type Result<T, E = Error> = {
    success: true;
    data: T;
} | {
    success: false;
    error: E;
};
/**
 * Timestamped value for historical tracking
 */
export interface Timestamped<T> {
    value: T;
    timestamp: number;
}
/**
 * Bounded history for performance-sensitive collections
 */
export declare class BoundedHistory<T> {
    private maxSize;
    private items;
    constructor(maxSize?: number);
    add(value: T): void;
    getRecent(count?: number): Timestamped<T>[];
    getSince(timestamp: number): Timestamped<T>[];
    clear(): void;
    size(): number;
}
export declare const validateSignal: (data: unknown) => Signal;
export declare const validateCognitiveTask: (data: unknown) => CognitiveTask;
export declare const validatePerformanceBudget: (data: unknown) => PerformanceBudget;
export declare const validateArbiterConfig: (data: unknown) => ArbiterConfig;
//# sourceMappingURL=types.d.ts.map