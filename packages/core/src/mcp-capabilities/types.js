"use strict";
/**
 * MCP Capabilities Type System - Embodied action interface types
 *
 * Defines the complete type system for capability-driven actions with safety constraints,
 * constitutional filtering, and execution monitoring.
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMCPConfig = exports.validateExecutionContext = exports.validateExecutionRequest = exports.validateCapabilitySpec = exports.MCPConfigSchema = exports.CapabilityMetricsSchema = exports.CapabilityMatchSchema = exports.CapabilityQuerySchema = exports.RateLimitStatusSchema = exports.RateLimitConfigSchema = exports.ConstitutionalDecisionSchema = exports.ValidationResultSchema = exports.ExecutionResultSchema = exports.ExecutionContextSchema = exports.ExecutionRequestSchema = exports.CapabilitySpecSchema = exports.EffectSchema = exports.PreconditionSchema = exports.RiskLevel = void 0;
const zod_1 = require("zod");
// ===== RISK AND SAFETY =====
/**
 * Risk levels for capability execution
 */
var RiskLevel;
(function (RiskLevel) {
    RiskLevel[RiskLevel["MINIMAL"] = 0] = "MINIMAL";
    RiskLevel[RiskLevel["LOW"] = 1] = "LOW";
    RiskLevel[RiskLevel["MEDIUM"] = 2] = "MEDIUM";
    RiskLevel[RiskLevel["HIGH"] = 3] = "HIGH";
    RiskLevel[RiskLevel["CRITICAL"] = 4] = "CRITICAL";
})(RiskLevel || (exports.RiskLevel = RiskLevel = {}));
// ===== PRECONDITIONS AND EFFECTS =====
/**
 * Precondition types for capability execution
 */
exports.PreconditionSchema = zod_1.z.object({
    type: zod_1.z.enum(['inventory', 'spatial', 'tool', 'environmental', 'permission']),
    condition: zod_1.z.string(),
    args: zod_1.z.record(zod_1.z.any()),
    description: zod_1.z.string().optional(),
});
/**
 * Effect types for capability execution results
 */
exports.EffectSchema = zod_1.z.object({
    type: zod_1.z.enum([
        'world',
        'inventory',
        'lighting',
        'sound',
        'entity',
        'structure',
    ]),
    change: zod_1.z.string(),
    location: zod_1.z.string().optional(),
    item: zod_1.z.string().optional(),
    quantity: zod_1.z.number().optional(),
    area: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
// ===== CAPABILITY SPECIFICATIONS =====
/**
 * Core capability specification
 */
exports.CapabilitySpecSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    category: zod_1.z.enum([
        'movement',
        'block_manipulation',
        'inventory',
        'social',
        'combat',
    ]),
    // Execution constraints
    preconditions: zod_1.z.array(exports.PreconditionSchema),
    effects: zod_1.z.array(exports.EffectSchema),
    // Planning hints
    costHint: zod_1.z.number().min(0), // Relative computational/time cost
    durationMs: zod_1.z.number().min(0), // Expected execution time
    energyCost: zod_1.z.number().min(0), // In-game stamina/hunger cost
    // Safety and governance
    safetyTags: zod_1.z.array(zod_1.z.string()),
    constitutionalRules: zod_1.z.array(zod_1.z.string()),
    riskLevel: zod_1.z.nativeEnum(RiskLevel),
    // Rate limiting
    cooldownMs: zod_1.z.number().min(0),
    maxConcurrent: zod_1.z.number().min(1),
    dailyLimit: zod_1.z.number().positive().optional(),
    // Validation
    requiresApproval: zod_1.z.boolean().default(false),
    enabled: zod_1.z.boolean().default(true),
});
// ===== EXECUTION REQUESTS AND RESULTS =====
/**
 * Execution request for a specific capability
 */
exports.ExecutionRequestSchema = zod_1.z.object({
    id: zod_1.z.string(),
    capabilityId: zod_1.z.string(),
    parameters: zod_1.z.record(zod_1.z.any()),
    requestedBy: zod_1.z.string(),
    priority: zod_1.z.number().min(0).max(1),
    timeout: zod_1.z.number().positive().optional(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
    timestamp: zod_1.z.number(),
});
/**
 * Execution context for validation and monitoring
 */
exports.ExecutionContextSchema = zod_1.z.object({
    agentPosition: zod_1.z.object({
        x: zod_1.z.number(),
        y: zod_1.z.number(),
        z: zod_1.z.number(),
    }),
    agentHealth: zod_1.z.number().min(0).max(1),
    inventory: zod_1.z.array(zod_1.z.object({
        item: zod_1.z.string(),
        quantity: zod_1.z.number(),
        slot: zod_1.z.number().optional(),
    })),
    nearbyEntities: zod_1.z.array(zod_1.z.object({
        type: zod_1.z.string(),
        position: zod_1.z.object({ x: zod_1.z.number(), y: zod_1.z.number(), z: zod_1.z.number() }),
        distance: zod_1.z.number(),
    })),
    timeOfDay: zod_1.z.number().min(0).max(24000), // Minecraft time
    weather: zod_1.z.enum(['clear', 'rain', 'thunder']),
    dimension: zod_1.z.string(),
    biome: zod_1.z.string(),
    dangerLevel: zod_1.z.number().min(0).max(1),
    timestamp: zod_1.z.number(),
});
/**
 * Execution result with comprehensive metadata
 */
exports.ExecutionResultSchema = zod_1.z.object({
    id: zod_1.z.string(),
    requestId: zod_1.z.string(),
    capabilityId: zod_1.z.string(),
    success: zod_1.z.boolean(),
    // Timing and performance
    startTime: zod_1.z.number(),
    endTime: zod_1.z.number(),
    duration: zod_1.z.number(),
    // Results and effects
    effects: zod_1.z.array(exports.EffectSchema),
    actualCost: zod_1.z.number().optional(),
    resourcesUsed: zod_1.z.record(zod_1.z.number()).optional(),
    // Error handling
    error: zod_1.z.string().optional(),
    errorCode: zod_1.z.string().optional(),
    retryCount: zod_1.z.number().default(0),
    // Monitoring data
    performanceMetrics: zod_1.z
        .object({
        cpuTime: zod_1.z.number(),
        memoryUsed: zod_1.z.number(),
        networkCalls: zod_1.z.number(),
    })
        .optional(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
// ===== VALIDATION AND APPROVAL =====
/**
 * Validation result for capability execution
 */
exports.ValidationResultSchema = zod_1.z.object({
    approved: zod_1.z.boolean(),
    reasons: zod_1.z.array(zod_1.z.string()),
    // Validation checks
    preconditionsPassed: zod_1.z.boolean(),
    constitutionalApproval: zod_1.z.boolean(),
    rateLimitApproval: zod_1.z.boolean(),
    riskAssessment: zod_1.z.object({
        level: zod_1.z.nativeEnum(RiskLevel),
        factors: zod_1.z.array(zod_1.z.string()),
        mitigation: zod_1.z.array(zod_1.z.string()).optional(),
    }),
    // Recommendations
    suggestedAlternatives: zod_1.z.array(zod_1.z.string()).optional(),
    requiredApprovals: zod_1.z.array(zod_1.z.string()).optional(),
    timestamp: zod_1.z.number(),
});
/**
 * Constitutional decision for ethical filtering
 */
exports.ConstitutionalDecisionSchema = zod_1.z.object({
    approved: zod_1.z.boolean(),
    reasoning: zod_1.z.string(),
    violatedRules: zod_1.z.array(zod_1.z.string()),
    severity: zod_1.z.enum(['minor', 'moderate', 'major', 'critical']),
    suggestedActions: zod_1.z.array(zod_1.z.string()),
    requiresHumanReview: zod_1.z.boolean(),
    timestamp: zod_1.z.number(),
});
// ===== RATE LIMITING =====
/**
 * Rate limit configuration
 */
exports.RateLimitConfigSchema = zod_1.z.object({
    windowMs: zod_1.z.number().positive(), // Time window in milliseconds
    maxRequests: zod_1.z.number().positive(), // Max requests per window
    burstAllowance: zod_1.z.number().nonnegative(), // Additional burst capacity
    cooldownMs: zod_1.z.number().nonnegative(), // Cooldown after limit exceeded
});
/**
 * Rate limit status
 */
exports.RateLimitStatusSchema = zod_1.z.object({
    allowed: zod_1.z.boolean(),
    remaining: zod_1.z.number(),
    resetTime: zod_1.z.number(),
    retryAfter: zod_1.z.number().optional(),
    reason: zod_1.z.string().optional(),
});
// ===== CAPABILITY DISCOVERY =====
/**
 * Capability query for discovery
 */
exports.CapabilityQuerySchema = zod_1.z.object({
    category: zod_1.z
        .enum(['movement', 'block_manipulation', 'inventory', 'social', 'combat'])
        .optional(),
    riskLevel: zod_1.z.nativeEnum(RiskLevel).optional(),
    safetyTags: zod_1.z.array(zod_1.z.string()).optional(),
    requiresItems: zod_1.z.array(zod_1.z.string()).optional(),
    maxDuration: zod_1.z.number().optional(),
    maxCost: zod_1.z.number().optional(),
    searchText: zod_1.z.string().optional(),
});
/**
 * Capability match result
 */
exports.CapabilityMatchSchema = zod_1.z.object({
    capability: exports.CapabilitySpecSchema,
    matchScore: zod_1.z.number().min(0).max(1),
    matchReasons: zod_1.z.array(zod_1.z.string()),
    available: zod_1.z.boolean(),
    estimatedCost: zod_1.z.number().optional(),
    lastUsed: zod_1.z.number().optional(),
});
// ===== MONITORING AND TELEMETRY =====
/**
 * Capability execution metrics
 */
exports.CapabilityMetricsSchema = zod_1.z.object({
    // Usage statistics
    totalExecutions: zod_1.z.number(),
    successfulExecutions: zod_1.z.number(),
    failedExecutions: zod_1.z.number(),
    // Performance statistics
    averageLatency: zod_1.z.number(),
    p95Latency: zod_1.z.number(),
    maxLatency: zod_1.z.number(),
    // Rate limiting
    rateLimitViolations: zod_1.z.number(),
    // Safety metrics
    constitutionalViolations: zod_1.z.number(),
    riskEventsTriggered: zod_1.z.number(),
    // Temporal data
    firstUsed: zod_1.z.number(),
    lastUsed: zod_1.z.number(),
    peakUsagePeriod: zod_1.z.string().optional(),
});
// ===== CONFIGURATION =====
/**
 * MCP Capabilities module configuration
 */
exports.MCPConfigSchema = zod_1.z.object({
    // General settings
    enabled: zod_1.z.boolean().default(true),
    maxConcurrentExecutions: zod_1.z.number().positive().default(5),
    defaultTimeoutMs: zod_1.z.number().positive().default(5000),
    // Safety settings
    constitutionalCheckingEnabled: zod_1.z.boolean().default(true),
    riskLevelThreshold: zod_1.z.nativeEnum(RiskLevel).default(RiskLevel.MEDIUM),
    requireApprovalForHighRisk: zod_1.z.boolean().default(true),
    emergencyStopEnabled: zod_1.z.boolean().default(true),
    // Rate limiting
    globalRateLimit: exports.RateLimitConfigSchema,
    defaultCapabilityRateLimit: exports.RateLimitConfigSchema,
    // Monitoring
    metricsEnabled: zod_1.z.boolean().default(true),
    logAllExecutions: zod_1.z.boolean().default(true),
    performanceTrackingEnabled: zod_1.z.boolean().default(true),
    // Recovery and rollback
    rollbackEnabled: zod_1.z.boolean().default(true),
    maxRollbackAttempts: zod_1.z.number().positive().default(3),
    // Integration
    arbiterIntegrationEnabled: zod_1.z.boolean().default(true),
});
// Export validation functions
const validateCapabilitySpec = (data) => exports.CapabilitySpecSchema.parse(data);
exports.validateCapabilitySpec = validateCapabilitySpec;
const validateExecutionRequest = (data) => exports.ExecutionRequestSchema.parse(data);
exports.validateExecutionRequest = validateExecutionRequest;
const validateExecutionContext = (data) => exports.ExecutionContextSchema.parse(data);
exports.validateExecutionContext = validateExecutionContext;
const validateMCPConfig = (data) => exports.MCPConfigSchema.parse(data);
exports.validateMCPConfig = validateMCPConfig;
//# sourceMappingURL=types.js.map