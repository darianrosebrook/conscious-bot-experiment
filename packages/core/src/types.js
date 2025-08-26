"use strict";
/**
 * Core types and interfaces for the conscious bot architecture
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateArbiterConfig = exports.validatePerformanceBudget = exports.validateCognitiveTask = exports.validateSignal = exports.BoundedHistory = exports.ArbiterConfigSchema = exports.HealthAssessmentSchema = exports.DegradationLevel = exports.SafetyViolationSchema = exports.PreemptionDecisionSchema = exports.PreemptionPriority = exports.RoutingDecisionSchema = exports.ModuleType = exports.PerformanceMetricsSchema = exports.PerformanceBudgetSchema = exports.TaskSignatureSchema = exports.CognitiveTaskSchema = exports.NeedScoreSchema = exports.SignalSchema = void 0;
const zod_1 = require("zod");
// ===== SIGNAL SYSTEM =====
/**
 * Normalized signal from various sources (body, environment, social, etc.)
 */
exports.SignalSchema = zod_1.z.object({
    type: zod_1.z.enum(['health', 'hunger', 'fatigue', 'threat', 'social', 'memory', 'intrusion']),
    intensity: zod_1.z.number().min(0).max(1),
    trend: zod_1.z.number().min(-1).max(1), // Rate of change
    confidence: zod_1.z.number().min(0).max(1),
    timestamp: zod_1.z.number(),
    source: zod_1.z.string(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
/**
 * Aggregated need scores computed from signals
 */
exports.NeedScoreSchema = zod_1.z.object({
    type: zod_1.z.enum(['safety', 'nutrition', 'progress', 'social', 'curiosity', 'integrity']),
    score: zod_1.z.number().min(0).max(1),
    trend: zod_1.z.number().min(-1).max(1),
    urgency: zod_1.z.number().min(0).max(1),
    lastUpdated: zod_1.z.number(),
});
// ===== COGNITIVE TASKS =====
/**
 * Task that requires cognitive processing
 */
exports.CognitiveTaskSchema = zod_1.z.object({
    id: zod_1.z.string(),
    type: zod_1.z.enum(['planning', 'reasoning', 'social', 'reactive', 'exploration']),
    priority: zod_1.z.number().min(0).max(1),
    complexity: zod_1.z.enum(['simple', 'moderate', 'complex']),
    context: zod_1.z.record(zod_1.z.any()),
    deadline: zod_1.z.number().optional(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
/**
 * Signature of a task for routing decisions
 */
exports.TaskSignatureSchema = zod_1.z.object({
    symbolicPreconditions: zod_1.z.number().min(0).max(1),
    socialContent: zod_1.z.boolean(),
    ambiguousContext: zod_1.z.boolean(),
    requiresPlanning: zod_1.z.boolean(),
    timeConstraint: zod_1.z.number(), // ms
    riskLevel: zod_1.z.enum(['low', 'medium', 'high']),
});
// ===== PERFORMANCE BUDGETS =====
/**
 * Performance budget for operations
 */
exports.PerformanceBudgetSchema = zod_1.z.object({
    context: zod_1.z.enum(['emergency', 'routine', 'deliberative']),
    total: zod_1.z.number().positive(), // Total budget in ms
    allocated: zod_1.z.number().nonnegative(), // Already allocated time
    remaining: zod_1.z.number().nonnegative(), // Remaining time
    breakdown: zod_1.z.object({
        signalProcessing: zod_1.z.number().nonnegative(),
        routing: zod_1.z.number().nonnegative(),
        execution: zod_1.z.number().nonnegative(),
    }),
});
/**
 * Performance metrics for monitoring
 */
exports.PerformanceMetricsSchema = zod_1.z.object({
    latency: zod_1.z.object({
        p50: zod_1.z.number().nonnegative(),
        p95: zod_1.z.number().nonnegative(),
        p99: zod_1.z.number().nonnegative(),
        max: zod_1.z.number().nonnegative(),
        mean: zod_1.z.number().nonnegative(),
    }),
    throughput: zod_1.z.object({
        operationsPerSecond: zod_1.z.number().nonnegative(),
        queueDepth: zod_1.z.number().nonnegative(),
    }),
    resources: zod_1.z.object({
        cpuUtilization: zod_1.z.number().min(0).max(1),
        memoryUsage: zod_1.z.number().nonnegative(), // MB
    }),
    quality: zod_1.z.object({
        successRate: zod_1.z.number().min(0).max(1),
        errorRate: zod_1.z.number().min(0).max(1),
    }),
});
// ===== MODULE SYSTEM =====
/**
 * Available cognitive modules for task processing
 */
var ModuleType;
(function (ModuleType) {
    ModuleType["HRM"] = "hrm";
    ModuleType["LLM"] = "llm";
    ModuleType["GOAP"] = "goap";
    ModuleType["REFLEX"] = "reflex";
})(ModuleType || (exports.ModuleType = ModuleType = {}));
/**
 * Routing decision for cognitive tasks
 */
exports.RoutingDecisionSchema = zod_1.z.object({
    selectedModule: zod_1.z.nativeEnum(ModuleType),
    confidence: zod_1.z.number().min(0).max(1),
    reasoning: zod_1.z.string(),
    alternatives: zod_1.z.array(zod_1.z.object({
        module: zod_1.z.nativeEnum(ModuleType),
        score: zod_1.z.number().min(0).max(1),
        reason: zod_1.z.string(),
    })),
    timestamp: zod_1.z.number(),
});
// ===== PREEMPTION SYSTEM =====
/**
 * Preemption priorities for task interruption
 */
var PreemptionPriority;
(function (PreemptionPriority) {
    PreemptionPriority[PreemptionPriority["EMERGENCY_REFLEX"] = 0] = "EMERGENCY_REFLEX";
    PreemptionPriority[PreemptionPriority["SAFETY_INTERRUPT"] = 1] = "SAFETY_INTERRUPT";
    PreemptionPriority[PreemptionPriority["GOAL_COMPLETION"] = 2] = "GOAL_COMPLETION";
    PreemptionPriority[PreemptionPriority["EXPLORATION"] = 3] = "EXPLORATION";
    PreemptionPriority[PreemptionPriority["IDLE_PROCESSING"] = 4] = "IDLE_PROCESSING";
})(PreemptionPriority || (exports.PreemptionPriority = PreemptionPriority = {}));
/**
 * Preemption decision and execution plan
 */
exports.PreemptionDecisionSchema = zod_1.z.object({
    shouldPreempt: zod_1.z.boolean(),
    priority: zod_1.z.nativeEnum(PreemptionPriority),
    currentTask: exports.CognitiveTaskSchema.optional(),
    incomingTask: exports.CognitiveTaskSchema,
    preservationRequired: zod_1.z.boolean(),
    reasoning: zod_1.z.string(),
    estimatedCost: zod_1.z.number().nonnegative(), // ms
});
// ===== SAFETY & DEGRADATION =====
/**
 * Safety violation types
 */
exports.SafetyViolationSchema = zod_1.z.object({
    type: zod_1.z.enum(['budget_exceeded', 'infinite_loop', 'memory_leak', 'unsafe_operation']),
    severity: zod_1.z.enum(['low', 'medium', 'high', 'critical']),
    description: zod_1.z.string(),
    timestamp: zod_1.z.number(),
    context: zod_1.z.record(zod_1.z.any()),
    suggestedAction: zod_1.z.string(),
});
/**
 * System degradation levels
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
 * Health assessment result
 */
exports.HealthAssessmentSchema = zod_1.z.object({
    overall: zod_1.z.enum(['healthy', 'degraded', 'critical']),
    degradationLevel: zod_1.z.nativeEnum(DegradationLevel),
    violations: zod_1.z.array(exports.SafetyViolationSchema),
    recommendations: zod_1.z.array(zod_1.z.string()),
    timestamp: zod_1.z.number(),
});
// ===== CONFIGURATION =====
/**
 * Arbiter configuration
 */
exports.ArbiterConfigSchema = zod_1.z.object({
    performanceBudgets: zod_1.z.object({
        emergency: zod_1.z.number().positive(), // ms
        routine: zod_1.z.number().positive(), // ms
        deliberative: zod_1.z.number().positive(), // ms
    }),
    preemptionEnabled: zod_1.z.boolean(),
    safeModeEnabled: zod_1.z.boolean(),
    monitoringEnabled: zod_1.z.boolean(),
    debugMode: zod_1.z.boolean(),
});
/**
 * Bounded history for performance-sensitive collections
 */
class BoundedHistory {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.items = [];
    }
    add(value) {
        this.items.push({ value, timestamp: Date.now() });
        if (this.items.length > this.maxSize) {
            this.items.shift();
        }
    }
    getRecent(count = 10) {
        return this.items.slice(-count);
    }
    getSince(timestamp) {
        return this.items.filter(item => item.timestamp >= timestamp);
    }
    clear() {
        this.items = [];
    }
    size() {
        return this.items.length;
    }
}
exports.BoundedHistory = BoundedHistory;
// Export validation functions
const validateSignal = (data) => exports.SignalSchema.parse(data);
exports.validateSignal = validateSignal;
const validateCognitiveTask = (data) => exports.CognitiveTaskSchema.parse(data);
exports.validateCognitiveTask = validateCognitiveTask;
const validatePerformanceBudget = (data) => exports.PerformanceBudgetSchema.parse(data);
exports.validatePerformanceBudget = validatePerformanceBudget;
const validateArbiterConfig = (data) => exports.ArbiterConfigSchema.parse(data);
exports.validateArbiterConfig = validateArbiterConfig;
//# sourceMappingURL=types.js.map