/**
 * MCP Capabilities Type System - Embodied action interface types
 *
 * Defines the complete type system for capability-driven actions with safety constraints,
 * constitutional filtering, and execution monitoring.
 *
 * @author @darianrosebrook
 */
import { z } from 'zod';
/**
 * Risk levels for capability execution
 */
export declare enum RiskLevel {
    MINIMAL = 0,// No potential for harm (e.g., look around)
    LOW = 1,// Minor reversible changes (e.g., place torch)
    MEDIUM = 2,// Significant but contained effects (e.g., mine ore)
    HIGH = 3,// Major irreversible changes (e.g., TNT placement)
    CRITICAL = 4
}
/**
 * Safety tags for capability classification
 */
export type SafetyTag = 'reversible' | 'no_grief' | 'constructive' | 'destructive' | 'resource_gain' | 'resource_cost' | 'affects_others' | 'permanent_change' | 'emergency_use' | 'requires_approval';
/**
 * Precondition types for capability execution
 */
export declare const PreconditionSchema: z.ZodObject<{
    type: z.ZodEnum<["inventory", "spatial", "tool", "environmental", "permission"]>;
    condition: z.ZodString;
    args: z.ZodRecord<z.ZodString, z.ZodAny>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "inventory" | "spatial" | "tool" | "environmental" | "permission";
    condition: string;
    args: Record<string, any>;
    description?: string | undefined;
}, {
    type: "inventory" | "spatial" | "tool" | "environmental" | "permission";
    condition: string;
    args: Record<string, any>;
    description?: string | undefined;
}>;
export type Precondition = z.infer<typeof PreconditionSchema>;
/**
 * Effect types for capability execution results
 */
export declare const EffectSchema: z.ZodObject<{
    type: z.ZodEnum<["world", "inventory", "lighting", "sound", "entity", "structure"]>;
    change: z.ZodString;
    location: z.ZodOptional<z.ZodString>;
    item: z.ZodOptional<z.ZodString>;
    quantity: z.ZodOptional<z.ZodNumber>;
    area: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
    change: string;
    metadata?: Record<string, any> | undefined;
    location?: string | undefined;
    item?: string | undefined;
    quantity?: number | undefined;
    area?: string | undefined;
}, {
    type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
    change: string;
    metadata?: Record<string, any> | undefined;
    location?: string | undefined;
    item?: string | undefined;
    quantity?: number | undefined;
    area?: string | undefined;
}>;
export type Effect = z.infer<typeof EffectSchema>;
/**
 * Core capability specification
 */
export declare const CapabilitySpecSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    category: z.ZodEnum<["movement", "block_manipulation", "inventory", "social", "combat"]>;
    preconditions: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["inventory", "spatial", "tool", "environmental", "permission"]>;
        condition: z.ZodString;
        args: z.ZodRecord<z.ZodString, z.ZodAny>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "inventory" | "spatial" | "tool" | "environmental" | "permission";
        condition: string;
        args: Record<string, any>;
        description?: string | undefined;
    }, {
        type: "inventory" | "spatial" | "tool" | "environmental" | "permission";
        condition: string;
        args: Record<string, any>;
        description?: string | undefined;
    }>, "many">;
    effects: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["world", "inventory", "lighting", "sound", "entity", "structure"]>;
        change: z.ZodString;
        location: z.ZodOptional<z.ZodString>;
        item: z.ZodOptional<z.ZodString>;
        quantity: z.ZodOptional<z.ZodNumber>;
        area: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
        change: string;
        metadata?: Record<string, any> | undefined;
        location?: string | undefined;
        item?: string | undefined;
        quantity?: number | undefined;
        area?: string | undefined;
    }, {
        type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
        change: string;
        metadata?: Record<string, any> | undefined;
        location?: string | undefined;
        item?: string | undefined;
        quantity?: number | undefined;
        area?: string | undefined;
    }>, "many">;
    costHint: z.ZodNumber;
    durationMs: z.ZodNumber;
    energyCost: z.ZodNumber;
    safetyTags: z.ZodArray<z.ZodString, "many">;
    constitutionalRules: z.ZodArray<z.ZodString, "many">;
    riskLevel: z.ZodNativeEnum<typeof RiskLevel>;
    cooldownMs: z.ZodNumber;
    maxConcurrent: z.ZodNumber;
    dailyLimit: z.ZodOptional<z.ZodNumber>;
    requiresApproval: z.ZodDefault<z.ZodBoolean>;
    enabled: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    enabled: boolean;
    durationMs: number;
    description: string;
    category: "social" | "inventory" | "movement" | "block_manipulation" | "combat";
    preconditions: {
        type: "inventory" | "spatial" | "tool" | "environmental" | "permission";
        condition: string;
        args: Record<string, any>;
        description?: string | undefined;
    }[];
    effects: {
        type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
        change: string;
        metadata?: Record<string, any> | undefined;
        location?: string | undefined;
        item?: string | undefined;
        quantity?: number | undefined;
        area?: string | undefined;
    }[];
    costHint: number;
    energyCost: number;
    safetyTags: string[];
    constitutionalRules: string[];
    riskLevel: RiskLevel;
    cooldownMs: number;
    maxConcurrent: number;
    requiresApproval: boolean;
    dailyLimit?: number | undefined;
}, {
    id: string;
    name: string;
    durationMs: number;
    description: string;
    category: "social" | "inventory" | "movement" | "block_manipulation" | "combat";
    preconditions: {
        type: "inventory" | "spatial" | "tool" | "environmental" | "permission";
        condition: string;
        args: Record<string, any>;
        description?: string | undefined;
    }[];
    effects: {
        type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
        change: string;
        metadata?: Record<string, any> | undefined;
        location?: string | undefined;
        item?: string | undefined;
        quantity?: number | undefined;
        area?: string | undefined;
    }[];
    costHint: number;
    energyCost: number;
    safetyTags: string[];
    constitutionalRules: string[];
    riskLevel: RiskLevel;
    cooldownMs: number;
    maxConcurrent: number;
    enabled?: boolean | undefined;
    dailyLimit?: number | undefined;
    requiresApproval?: boolean | undefined;
}>;
export type CapabilitySpec = z.infer<typeof CapabilitySpecSchema>;
/**
 * Execution request for a specific capability
 */
export declare const ExecutionRequestSchema: z.ZodObject<{
    id: z.ZodString;
    capabilityId: z.ZodString;
    parameters: z.ZodRecord<z.ZodString, z.ZodAny>;
    requestedBy: z.ZodString;
    priority: z.ZodNumber;
    timeout: z.ZodOptional<z.ZodNumber>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    timestamp: number;
    priority: number;
    capabilityId: string;
    parameters: Record<string, any>;
    requestedBy: string;
    metadata?: Record<string, any> | undefined;
    timeout?: number | undefined;
}, {
    id: string;
    timestamp: number;
    priority: number;
    capabilityId: string;
    parameters: Record<string, any>;
    requestedBy: string;
    metadata?: Record<string, any> | undefined;
    timeout?: number | undefined;
}>;
export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;
/**
 * Execution context for validation and monitoring
 */
export declare const ExecutionContextSchema: z.ZodObject<{
    agentPosition: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        z: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        x: number;
        y: number;
        z: number;
    }, {
        x: number;
        y: number;
        z: number;
    }>;
    agentHealth: z.ZodNumber;
    inventory: z.ZodArray<z.ZodObject<{
        item: z.ZodString;
        quantity: z.ZodNumber;
        slot: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        item: string;
        quantity: number;
        slot?: number | undefined;
    }, {
        item: string;
        quantity: number;
        slot?: number | undefined;
    }>, "many">;
    nearbyEntities: z.ZodArray<z.ZodObject<{
        type: z.ZodString;
        position: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
            z: number;
        }, {
            x: number;
            y: number;
            z: number;
        }>;
        distance: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        type: string;
        position: {
            x: number;
            y: number;
            z: number;
        };
        distance: number;
    }, {
        type: string;
        position: {
            x: number;
            y: number;
            z: number;
        };
        distance: number;
    }>, "many">;
    timeOfDay: z.ZodNumber;
    weather: z.ZodEnum<["clear", "rain", "thunder"]>;
    dimension: z.ZodString;
    biome: z.ZodString;
    dangerLevel: z.ZodNumber;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    timestamp: number;
    timeOfDay: number;
    weather: "clear" | "rain" | "thunder";
    biome: string;
    inventory: {
        item: string;
        quantity: number;
        slot?: number | undefined;
    }[];
    nearbyEntities: {
        type: string;
        position: {
            x: number;
            y: number;
            z: number;
        };
        distance: number;
    }[];
    agentPosition: {
        x: number;
        y: number;
        z: number;
    };
    agentHealth: number;
    dimension: string;
    dangerLevel: number;
}, {
    timestamp: number;
    timeOfDay: number;
    weather: "clear" | "rain" | "thunder";
    biome: string;
    inventory: {
        item: string;
        quantity: number;
        slot?: number | undefined;
    }[];
    nearbyEntities: {
        type: string;
        position: {
            x: number;
            y: number;
            z: number;
        };
        distance: number;
    }[];
    agentPosition: {
        x: number;
        y: number;
        z: number;
    };
    agentHealth: number;
    dimension: string;
    dangerLevel: number;
}>;
export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;
/**
 * Execution result with comprehensive metadata
 */
export declare const ExecutionResultSchema: z.ZodObject<{
    id: z.ZodString;
    requestId: z.ZodString;
    capabilityId: z.ZodString;
    success: z.ZodBoolean;
    startTime: z.ZodNumber;
    endTime: z.ZodNumber;
    duration: z.ZodNumber;
    effects: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["world", "inventory", "lighting", "sound", "entity", "structure"]>;
        change: z.ZodString;
        location: z.ZodOptional<z.ZodString>;
        item: z.ZodOptional<z.ZodString>;
        quantity: z.ZodOptional<z.ZodNumber>;
        area: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
        change: string;
        metadata?: Record<string, any> | undefined;
        location?: string | undefined;
        item?: string | undefined;
        quantity?: number | undefined;
        area?: string | undefined;
    }, {
        type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
        change: string;
        metadata?: Record<string, any> | undefined;
        location?: string | undefined;
        item?: string | undefined;
        quantity?: number | undefined;
        area?: string | undefined;
    }>, "many">;
    actualCost: z.ZodOptional<z.ZodNumber>;
    resourcesUsed: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    error: z.ZodOptional<z.ZodString>;
    errorCode: z.ZodOptional<z.ZodString>;
    retryCount: z.ZodDefault<z.ZodNumber>;
    performanceMetrics: z.ZodOptional<z.ZodObject<{
        cpuTime: z.ZodNumber;
        memoryUsed: z.ZodNumber;
        networkCalls: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        cpuTime: number;
        memoryUsed: number;
        networkCalls: number;
    }, {
        cpuTime: number;
        memoryUsed: number;
        networkCalls: number;
    }>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    success: boolean;
    duration: number;
    startTime: number;
    effects: {
        type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
        change: string;
        metadata?: Record<string, any> | undefined;
        location?: string | undefined;
        item?: string | undefined;
        quantity?: number | undefined;
        area?: string | undefined;
    }[];
    requestId: string;
    capabilityId: string;
    endTime: number;
    retryCount: number;
    metadata?: Record<string, any> | undefined;
    error?: string | undefined;
    resourcesUsed?: Record<string, number> | undefined;
    errorCode?: string | undefined;
    actualCost?: number | undefined;
    performanceMetrics?: {
        cpuTime: number;
        memoryUsed: number;
        networkCalls: number;
    } | undefined;
}, {
    id: string;
    success: boolean;
    duration: number;
    startTime: number;
    effects: {
        type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
        change: string;
        metadata?: Record<string, any> | undefined;
        location?: string | undefined;
        item?: string | undefined;
        quantity?: number | undefined;
        area?: string | undefined;
    }[];
    requestId: string;
    capabilityId: string;
    endTime: number;
    metadata?: Record<string, any> | undefined;
    error?: string | undefined;
    resourcesUsed?: Record<string, number> | undefined;
    errorCode?: string | undefined;
    actualCost?: number | undefined;
    retryCount?: number | undefined;
    performanceMetrics?: {
        cpuTime: number;
        memoryUsed: number;
        networkCalls: number;
    } | undefined;
}>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
/**
 * Validation result for capability execution
 */
export declare const ValidationResultSchema: z.ZodObject<{
    approved: z.ZodBoolean;
    reasons: z.ZodArray<z.ZodString, "many">;
    preconditionsPassed: z.ZodBoolean;
    constitutionalApproval: z.ZodBoolean;
    rateLimitApproval: z.ZodBoolean;
    riskAssessment: z.ZodObject<{
        level: z.ZodNativeEnum<typeof RiskLevel>;
        factors: z.ZodArray<z.ZodString, "many">;
        mitigation: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        level: RiskLevel;
        factors: string[];
        mitigation?: string[] | undefined;
    }, {
        level: RiskLevel;
        factors: string[];
        mitigation?: string[] | undefined;
    }>;
    suggestedAlternatives: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    requiredApprovals: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    timestamp: number;
    approved: boolean;
    reasons: string[];
    preconditionsPassed: boolean;
    constitutionalApproval: boolean;
    rateLimitApproval: boolean;
    riskAssessment: {
        level: RiskLevel;
        factors: string[];
        mitigation?: string[] | undefined;
    };
    suggestedAlternatives?: string[] | undefined;
    requiredApprovals?: string[] | undefined;
}, {
    timestamp: number;
    approved: boolean;
    reasons: string[];
    preconditionsPassed: boolean;
    constitutionalApproval: boolean;
    rateLimitApproval: boolean;
    riskAssessment: {
        level: RiskLevel;
        factors: string[];
        mitigation?: string[] | undefined;
    };
    suggestedAlternatives?: string[] | undefined;
    requiredApprovals?: string[] | undefined;
}>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
/**
 * Constitutional decision for ethical filtering
 */
export declare const ConstitutionalDecisionSchema: z.ZodObject<{
    approved: z.ZodBoolean;
    reasoning: z.ZodString;
    violatedRules: z.ZodArray<z.ZodString, "many">;
    severity: z.ZodEnum<["minor", "moderate", "major", "critical"]>;
    suggestedActions: z.ZodArray<z.ZodString, "many">;
    requiresHumanReview: z.ZodBoolean;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    severity: "critical" | "minor" | "moderate" | "major";
    timestamp: number;
    approved: boolean;
    reasoning: string;
    violatedRules: string[];
    suggestedActions: string[];
    requiresHumanReview: boolean;
}, {
    severity: "critical" | "minor" | "moderate" | "major";
    timestamp: number;
    approved: boolean;
    reasoning: string;
    violatedRules: string[];
    suggestedActions: string[];
    requiresHumanReview: boolean;
}>;
export type ConstitutionalDecision = z.infer<typeof ConstitutionalDecisionSchema>;
/**
 * Rate limit configuration
 */
export declare const RateLimitConfigSchema: z.ZodObject<{
    windowMs: z.ZodNumber;
    maxRequests: z.ZodNumber;
    burstAllowance: z.ZodNumber;
    cooldownMs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    cooldownMs: number;
    windowMs: number;
    maxRequests: number;
    burstAllowance: number;
}, {
    cooldownMs: number;
    windowMs: number;
    maxRequests: number;
    burstAllowance: number;
}>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
/**
 * Rate limit status
 */
export declare const RateLimitStatusSchema: z.ZodObject<{
    allowed: z.ZodBoolean;
    remaining: z.ZodNumber;
    resetTime: z.ZodNumber;
    retryAfter: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    remaining: number;
    allowed: boolean;
    resetTime: number;
    reason?: string | undefined;
    retryAfter?: number | undefined;
}, {
    remaining: number;
    allowed: boolean;
    resetTime: number;
    reason?: string | undefined;
    retryAfter?: number | undefined;
}>;
export type RateLimitStatus = z.infer<typeof RateLimitStatusSchema>;
/**
 * Capability query for discovery
 */
export declare const CapabilityQuerySchema: z.ZodObject<{
    category: z.ZodOptional<z.ZodEnum<["movement", "block_manipulation", "inventory", "social", "combat"]>>;
    riskLevel: z.ZodOptional<z.ZodNativeEnum<typeof RiskLevel>>;
    safetyTags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    requiresItems: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    maxDuration: z.ZodOptional<z.ZodNumber>;
    maxCost: z.ZodOptional<z.ZodNumber>;
    searchText: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    category?: "social" | "inventory" | "movement" | "block_manipulation" | "combat" | undefined;
    safetyTags?: string[] | undefined;
    riskLevel?: RiskLevel | undefined;
    requiresItems?: string[] | undefined;
    maxDuration?: number | undefined;
    maxCost?: number | undefined;
    searchText?: string | undefined;
}, {
    category?: "social" | "inventory" | "movement" | "block_manipulation" | "combat" | undefined;
    safetyTags?: string[] | undefined;
    riskLevel?: RiskLevel | undefined;
    requiresItems?: string[] | undefined;
    maxDuration?: number | undefined;
    maxCost?: number | undefined;
    searchText?: string | undefined;
}>;
export type CapabilityQuery = z.infer<typeof CapabilityQuerySchema>;
/**
 * Capability match result
 */
export declare const CapabilityMatchSchema: z.ZodObject<{
    capability: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        category: z.ZodEnum<["movement", "block_manipulation", "inventory", "social", "combat"]>;
        preconditions: z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["inventory", "spatial", "tool", "environmental", "permission"]>;
            condition: z.ZodString;
            args: z.ZodRecord<z.ZodString, z.ZodAny>;
            description: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "inventory" | "spatial" | "tool" | "environmental" | "permission";
            condition: string;
            args: Record<string, any>;
            description?: string | undefined;
        }, {
            type: "inventory" | "spatial" | "tool" | "environmental" | "permission";
            condition: string;
            args: Record<string, any>;
            description?: string | undefined;
        }>, "many">;
        effects: z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["world", "inventory", "lighting", "sound", "entity", "structure"]>;
            change: z.ZodString;
            location: z.ZodOptional<z.ZodString>;
            item: z.ZodOptional<z.ZodString>;
            quantity: z.ZodOptional<z.ZodNumber>;
            area: z.ZodOptional<z.ZodString>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
            change: string;
            metadata?: Record<string, any> | undefined;
            location?: string | undefined;
            item?: string | undefined;
            quantity?: number | undefined;
            area?: string | undefined;
        }, {
            type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
            change: string;
            metadata?: Record<string, any> | undefined;
            location?: string | undefined;
            item?: string | undefined;
            quantity?: number | undefined;
            area?: string | undefined;
        }>, "many">;
        costHint: z.ZodNumber;
        durationMs: z.ZodNumber;
        energyCost: z.ZodNumber;
        safetyTags: z.ZodArray<z.ZodString, "many">;
        constitutionalRules: z.ZodArray<z.ZodString, "many">;
        riskLevel: z.ZodNativeEnum<typeof RiskLevel>;
        cooldownMs: z.ZodNumber;
        maxConcurrent: z.ZodNumber;
        dailyLimit: z.ZodOptional<z.ZodNumber>;
        requiresApproval: z.ZodDefault<z.ZodBoolean>;
        enabled: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        enabled: boolean;
        durationMs: number;
        description: string;
        category: "social" | "inventory" | "movement" | "block_manipulation" | "combat";
        preconditions: {
            type: "inventory" | "spatial" | "tool" | "environmental" | "permission";
            condition: string;
            args: Record<string, any>;
            description?: string | undefined;
        }[];
        effects: {
            type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
            change: string;
            metadata?: Record<string, any> | undefined;
            location?: string | undefined;
            item?: string | undefined;
            quantity?: number | undefined;
            area?: string | undefined;
        }[];
        costHint: number;
        energyCost: number;
        safetyTags: string[];
        constitutionalRules: string[];
        riskLevel: RiskLevel;
        cooldownMs: number;
        maxConcurrent: number;
        requiresApproval: boolean;
        dailyLimit?: number | undefined;
    }, {
        id: string;
        name: string;
        durationMs: number;
        description: string;
        category: "social" | "inventory" | "movement" | "block_manipulation" | "combat";
        preconditions: {
            type: "inventory" | "spatial" | "tool" | "environmental" | "permission";
            condition: string;
            args: Record<string, any>;
            description?: string | undefined;
        }[];
        effects: {
            type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
            change: string;
            metadata?: Record<string, any> | undefined;
            location?: string | undefined;
            item?: string | undefined;
            quantity?: number | undefined;
            area?: string | undefined;
        }[];
        costHint: number;
        energyCost: number;
        safetyTags: string[];
        constitutionalRules: string[];
        riskLevel: RiskLevel;
        cooldownMs: number;
        maxConcurrent: number;
        enabled?: boolean | undefined;
        dailyLimit?: number | undefined;
        requiresApproval?: boolean | undefined;
    }>;
    matchScore: z.ZodNumber;
    matchReasons: z.ZodArray<z.ZodString, "many">;
    available: z.ZodBoolean;
    estimatedCost: z.ZodOptional<z.ZodNumber>;
    lastUsed: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    capability: {
        id: string;
        name: string;
        enabled: boolean;
        durationMs: number;
        description: string;
        category: "social" | "inventory" | "movement" | "block_manipulation" | "combat";
        preconditions: {
            type: "inventory" | "spatial" | "tool" | "environmental" | "permission";
            condition: string;
            args: Record<string, any>;
            description?: string | undefined;
        }[];
        effects: {
            type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
            change: string;
            metadata?: Record<string, any> | undefined;
            location?: string | undefined;
            item?: string | undefined;
            quantity?: number | undefined;
            area?: string | undefined;
        }[];
        costHint: number;
        energyCost: number;
        safetyTags: string[];
        constitutionalRules: string[];
        riskLevel: RiskLevel;
        cooldownMs: number;
        maxConcurrent: number;
        requiresApproval: boolean;
        dailyLimit?: number | undefined;
    };
    matchScore: number;
    matchReasons: string[];
    available: boolean;
    lastUsed?: number | undefined;
    estimatedCost?: number | undefined;
}, {
    capability: {
        id: string;
        name: string;
        durationMs: number;
        description: string;
        category: "social" | "inventory" | "movement" | "block_manipulation" | "combat";
        preconditions: {
            type: "inventory" | "spatial" | "tool" | "environmental" | "permission";
            condition: string;
            args: Record<string, any>;
            description?: string | undefined;
        }[];
        effects: {
            type: "entity" | "inventory" | "world" | "lighting" | "sound" | "structure";
            change: string;
            metadata?: Record<string, any> | undefined;
            location?: string | undefined;
            item?: string | undefined;
            quantity?: number | undefined;
            area?: string | undefined;
        }[];
        costHint: number;
        energyCost: number;
        safetyTags: string[];
        constitutionalRules: string[];
        riskLevel: RiskLevel;
        cooldownMs: number;
        maxConcurrent: number;
        enabled?: boolean | undefined;
        dailyLimit?: number | undefined;
        requiresApproval?: boolean | undefined;
    };
    matchScore: number;
    matchReasons: string[];
    available: boolean;
    lastUsed?: number | undefined;
    estimatedCost?: number | undefined;
}>;
export type CapabilityMatch = z.infer<typeof CapabilityMatchSchema>;
/**
 * Capability execution metrics
 */
export declare const CapabilityMetricsSchema: z.ZodObject<{
    totalExecutions: z.ZodNumber;
    successfulExecutions: z.ZodNumber;
    failedExecutions: z.ZodNumber;
    averageLatency: z.ZodNumber;
    p95Latency: z.ZodNumber;
    maxLatency: z.ZodNumber;
    rateLimitViolations: z.ZodNumber;
    constitutionalViolations: z.ZodNumber;
    riskEventsTriggered: z.ZodNumber;
    firstUsed: z.ZodNumber;
    lastUsed: z.ZodNumber;
    peakUsagePeriod: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageLatency: number;
    p95Latency: number;
    maxLatency: number;
    rateLimitViolations: number;
    constitutionalViolations: number;
    riskEventsTriggered: number;
    firstUsed: number;
    lastUsed: number;
    peakUsagePeriod?: string | undefined;
}, {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageLatency: number;
    p95Latency: number;
    maxLatency: number;
    rateLimitViolations: number;
    constitutionalViolations: number;
    riskEventsTriggered: number;
    firstUsed: number;
    lastUsed: number;
    peakUsagePeriod?: string | undefined;
}>;
export type CapabilityMetrics = z.infer<typeof CapabilityMetricsSchema>;
/**
 * MCP Capabilities module configuration
 */
export declare const MCPConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    maxConcurrentExecutions: z.ZodDefault<z.ZodNumber>;
    defaultTimeoutMs: z.ZodDefault<z.ZodNumber>;
    constitutionalCheckingEnabled: z.ZodDefault<z.ZodBoolean>;
    riskLevelThreshold: z.ZodDefault<z.ZodNativeEnum<typeof RiskLevel>>;
    requireApprovalForHighRisk: z.ZodDefault<z.ZodBoolean>;
    emergencyStopEnabled: z.ZodDefault<z.ZodBoolean>;
    globalRateLimit: z.ZodObject<{
        windowMs: z.ZodNumber;
        maxRequests: z.ZodNumber;
        burstAllowance: z.ZodNumber;
        cooldownMs: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        cooldownMs: number;
        windowMs: number;
        maxRequests: number;
        burstAllowance: number;
    }, {
        cooldownMs: number;
        windowMs: number;
        maxRequests: number;
        burstAllowance: number;
    }>;
    defaultCapabilityRateLimit: z.ZodObject<{
        windowMs: z.ZodNumber;
        maxRequests: z.ZodNumber;
        burstAllowance: z.ZodNumber;
        cooldownMs: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        cooldownMs: number;
        windowMs: number;
        maxRequests: number;
        burstAllowance: number;
    }, {
        cooldownMs: number;
        windowMs: number;
        maxRequests: number;
        burstAllowance: number;
    }>;
    metricsEnabled: z.ZodDefault<z.ZodBoolean>;
    logAllExecutions: z.ZodDefault<z.ZodBoolean>;
    performanceTrackingEnabled: z.ZodDefault<z.ZodBoolean>;
    rollbackEnabled: z.ZodDefault<z.ZodBoolean>;
    maxRollbackAttempts: z.ZodDefault<z.ZodNumber>;
    arbiterIntegrationEnabled: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    maxConcurrentExecutions: number;
    defaultTimeoutMs: number;
    constitutionalCheckingEnabled: boolean;
    riskLevelThreshold: RiskLevel;
    requireApprovalForHighRisk: boolean;
    emergencyStopEnabled: boolean;
    globalRateLimit: {
        cooldownMs: number;
        windowMs: number;
        maxRequests: number;
        burstAllowance: number;
    };
    defaultCapabilityRateLimit: {
        cooldownMs: number;
        windowMs: number;
        maxRequests: number;
        burstAllowance: number;
    };
    metricsEnabled: boolean;
    logAllExecutions: boolean;
    performanceTrackingEnabled: boolean;
    rollbackEnabled: boolean;
    maxRollbackAttempts: number;
    arbiterIntegrationEnabled: boolean;
}, {
    globalRateLimit: {
        cooldownMs: number;
        windowMs: number;
        maxRequests: number;
        burstAllowance: number;
    };
    defaultCapabilityRateLimit: {
        cooldownMs: number;
        windowMs: number;
        maxRequests: number;
        burstAllowance: number;
    };
    enabled?: boolean | undefined;
    maxConcurrentExecutions?: number | undefined;
    defaultTimeoutMs?: number | undefined;
    constitutionalCheckingEnabled?: boolean | undefined;
    riskLevelThreshold?: RiskLevel | undefined;
    requireApprovalForHighRisk?: boolean | undefined;
    emergencyStopEnabled?: boolean | undefined;
    metricsEnabled?: boolean | undefined;
    logAllExecutions?: boolean | undefined;
    performanceTrackingEnabled?: boolean | undefined;
    rollbackEnabled?: boolean | undefined;
    maxRollbackAttempts?: number | undefined;
    arbiterIntegrationEnabled?: boolean | undefined;
}>;
export type MCPConfig = z.infer<typeof MCPConfigSchema>;
/**
 * Capability executor interface
 */
export interface CapabilityExecutor {
    /**
     * Execute the capability with given parameters
     */
    execute(request: ExecutionRequest, context: ExecutionContext): Promise<ExecutionResult>;
    /**
     * Estimate execution cost for planning
     */
    estimateCost(request: ExecutionRequest, context: ExecutionContext): number;
    /**
     * Check if capability can be executed in current context
     */
    canExecute(request: ExecutionRequest, context: ExecutionContext): boolean;
    /**
     * Cancel ongoing execution if possible
     */
    cancel?(executionId: string): Promise<boolean>;
}
/**
 * Capability validator interface
 */
export interface CapabilityValidator {
    /**
     * Validate execution request against preconditions
     */
    validatePreconditions(request: ExecutionRequest, context: ExecutionContext): Promise<boolean>;
    /**
     * Validate execution context for safety
     */
    validateContext(context: ExecutionContext): boolean;
    /**
     * Estimate effects of execution
     */
    predictEffects(request: ExecutionRequest, context: ExecutionContext): Effect[];
}
/**
 * Registration result for new capabilities
 */
export interface RegistrationResult {
    success: boolean;
    capabilityId: string;
    message: string;
    warnings?: string[];
}
/**
 * Rollback result for failed executions
 */
export interface RollbackResult {
    success: boolean;
    executionId: string;
    actionsReversed: number;
    message: string;
}
export declare const validateCapabilitySpec: (data: unknown) => CapabilitySpec;
export declare const validateExecutionRequest: (data: unknown) => ExecutionRequest;
export declare const validateExecutionContext: (data: unknown) => ExecutionContext;
export declare const validateMCPConfig: (data: unknown) => MCPConfig;
//# sourceMappingURL=types.d.ts.map