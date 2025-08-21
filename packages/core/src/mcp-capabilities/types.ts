/**
 * MCP Capabilities Type System - Embodied action interface types
 *
 * Defines the complete type system for capability-driven actions with safety constraints,
 * constitutional filtering, and execution monitoring.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ===== RISK AND SAFETY =====

/**
 * Risk levels for capability execution
 */
export enum RiskLevel {
  MINIMAL = 0, // No potential for harm (e.g., look around)
  LOW = 1, // Minor reversible changes (e.g., place torch)
  MEDIUM = 2, // Significant but contained effects (e.g., mine ore)
  HIGH = 3, // Major irreversible changes (e.g., TNT placement)
  CRITICAL = 4, // Potential for major damage (e.g., lava bucket)
}

/**
 * Safety tags for capability classification
 */
export type SafetyTag =
  | 'reversible' // Action can be undone
  | 'no_grief' // Cannot be used for griefing
  | 'constructive' // Builds rather than destroys
  | 'destructive' // Removes blocks or entities
  | 'resource_gain' // Provides items or materials
  | 'resource_cost' // Consumes items or materials
  | 'affects_others' // May impact other players
  | 'permanent_change' // Creates lasting world changes
  | 'emergency_use' // Only for emergency situations
  | 'requires_approval'; // Needs human oversight

// ===== PRECONDITIONS AND EFFECTS =====

/**
 * Precondition types for capability execution
 */
export const PreconditionSchema = z.object({
  type: z.enum(['inventory', 'spatial', 'tool', 'environmental', 'permission']),
  condition: z.string(),
  args: z.record(z.any()),
  description: z.string().optional(),
});

export type Precondition = z.infer<typeof PreconditionSchema>;

/**
 * Effect types for capability execution results
 */
export const EffectSchema = z.object({
  type: z.enum([
    'world',
    'inventory',
    'lighting',
    'sound',
    'entity',
    'structure',
  ]),
  change: z.string(),
  location: z.string().optional(),
  item: z.string().optional(),
  quantity: z.number().optional(),
  area: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type Effect = z.infer<typeof EffectSchema>;

// ===== CAPABILITY SPECIFICATIONS =====

/**
 * Core capability specification
 */
export const CapabilitySpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum([
    'movement',
    'block_manipulation',
    'inventory',
    'social',
    'combat',
  ]),

  // Execution constraints
  preconditions: z.array(PreconditionSchema),
  effects: z.array(EffectSchema),

  // Planning hints
  costHint: z.number().min(0), // Relative computational/time cost
  durationMs: z.number().min(0), // Expected execution time
  energyCost: z.number().min(0), // In-game stamina/hunger cost

  // Safety and governance
  safetyTags: z.array(z.string()),
  constitutionalRules: z.array(z.string()),
  riskLevel: z.nativeEnum(RiskLevel),

  // Rate limiting
  cooldownMs: z.number().min(0),
  maxConcurrent: z.number().min(1),
  dailyLimit: z.number().positive().optional(),

  // Validation
  requiresApproval: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

export type CapabilitySpec = z.infer<typeof CapabilitySpecSchema>;

// ===== EXECUTION REQUESTS AND RESULTS =====

/**
 * Execution request for a specific capability
 */
export const ExecutionRequestSchema = z.object({
  id: z.string(),
  capabilityId: z.string(),
  parameters: z.record(z.any()),
  requestedBy: z.string(),
  priority: z.number().min(0).max(1),
  timeout: z.number().positive().optional(),
  metadata: z.record(z.any()).optional(),
  timestamp: z.number(),
});

export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

/**
 * Execution context for validation and monitoring
 */
export const ExecutionContextSchema = z.object({
  agentPosition: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  agentHealth: z.number().min(0).max(1),
  inventory: z.array(
    z.object({
      item: z.string(),
      quantity: z.number(),
      slot: z.number().optional(),
    })
  ),
  nearbyEntities: z.array(
    z.object({
      type: z.string(),
      position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
      distance: z.number(),
    })
  ),
  timeOfDay: z.number().min(0).max(24000), // Minecraft time
  weather: z.enum(['clear', 'rain', 'thunder']),
  dimension: z.string(),
  biome: z.string(),
  dangerLevel: z.number().min(0).max(1),
  timestamp: z.number(),
});

export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;

/**
 * Execution result with comprehensive metadata
 */
export const ExecutionResultSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  capabilityId: z.string(),
  success: z.boolean(),

  // Timing and performance
  startTime: z.number(),
  endTime: z.number(),
  duration: z.number(),

  // Results and effects
  effects: z.array(EffectSchema),
  actualCost: z.number().optional(),
  resourcesUsed: z.record(z.number()).optional(),

  // Error handling
  error: z.string().optional(),
  errorCode: z.string().optional(),
  retryCount: z.number().default(0),

  // Monitoring data
  performanceMetrics: z
    .object({
      cpuTime: z.number(),
      memoryUsed: z.number(),
      networkCalls: z.number(),
    })
    .optional(),

  metadata: z.record(z.any()).optional(),
});

export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

// ===== VALIDATION AND APPROVAL =====

/**
 * Validation result for capability execution
 */
export const ValidationResultSchema = z.object({
  approved: z.boolean(),
  reasons: z.array(z.string()),

  // Validation checks
  preconditionsPassed: z.boolean(),
  constitutionalApproval: z.boolean(),
  rateLimitApproval: z.boolean(),
  riskAssessment: z.object({
    level: z.nativeEnum(RiskLevel),
    factors: z.array(z.string()),
    mitigation: z.array(z.string()).optional(),
  }),

  // Recommendations
  suggestedAlternatives: z.array(z.string()).optional(),
  requiredApprovals: z.array(z.string()).optional(),

  timestamp: z.number(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

/**
 * Constitutional decision for ethical filtering
 */
export const ConstitutionalDecisionSchema = z.object({
  approved: z.boolean(),
  reasoning: z.string(),
  violatedRules: z.array(z.string()),
  severity: z.enum(['minor', 'moderate', 'major', 'critical']),
  suggestedActions: z.array(z.string()),
  requiresHumanReview: z.boolean(),
  timestamp: z.number(),
});

export type ConstitutionalDecision = z.infer<
  typeof ConstitutionalDecisionSchema
>;

// ===== RATE LIMITING =====

/**
 * Rate limit configuration
 */
export const RateLimitConfigSchema = z.object({
  windowMs: z.number().positive(), // Time window in milliseconds
  maxRequests: z.number().positive(), // Max requests per window
  burstAllowance: z.number().nonnegative(), // Additional burst capacity
  cooldownMs: z.number().nonnegative(), // Cooldown after limit exceeded
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

/**
 * Rate limit status
 */
export const RateLimitStatusSchema = z.object({
  allowed: z.boolean(),
  remaining: z.number(),
  resetTime: z.number(),
  retryAfter: z.number().optional(),
  reason: z.string().optional(),
});

export type RateLimitStatus = z.infer<typeof RateLimitStatusSchema>;

// ===== CAPABILITY DISCOVERY =====

/**
 * Capability query for discovery
 */
export const CapabilityQuerySchema = z.object({
  category: z
    .enum(['movement', 'block_manipulation', 'inventory', 'social', 'combat'])
    .optional(),
  riskLevel: z.nativeEnum(RiskLevel).optional(),
  safetyTags: z.array(z.string()).optional(),
  requiresItems: z.array(z.string()).optional(),
  maxDuration: z.number().optional(),
  maxCost: z.number().optional(),
  searchText: z.string().optional(),
});

export type CapabilityQuery = z.infer<typeof CapabilityQuerySchema>;

/**
 * Capability match result
 */
export const CapabilityMatchSchema = z.object({
  capability: CapabilitySpecSchema,
  matchScore: z.number().min(0).max(1),
  matchReasons: z.array(z.string()),
  available: z.boolean(),
  estimatedCost: z.number().optional(),
  lastUsed: z.number().optional(),
});

export type CapabilityMatch = z.infer<typeof CapabilityMatchSchema>;

// ===== MONITORING AND TELEMETRY =====

/**
 * Capability execution metrics
 */
export const CapabilityMetricsSchema = z.object({
  // Usage statistics
  totalExecutions: z.number(),
  successfulExecutions: z.number(),
  failedExecutions: z.number(),

  // Performance statistics
  averageLatency: z.number(),
  p95Latency: z.number(),
  maxLatency: z.number(),

  // Rate limiting
  rateLimitViolations: z.number(),

  // Safety metrics
  constitutionalViolations: z.number(),
  riskEventsTriggered: z.number(),

  // Temporal data
  firstUsed: z.number(),
  lastUsed: z.number(),
  peakUsagePeriod: z.string().optional(),
});

export type CapabilityMetrics = z.infer<typeof CapabilityMetricsSchema>;

// ===== CONFIGURATION =====

/**
 * MCP Capabilities module configuration
 */
export const MCPConfigSchema = z.object({
  // General settings
  enabled: z.boolean().default(true),
  maxConcurrentExecutions: z.number().positive().default(5),
  defaultTimeoutMs: z.number().positive().default(5000),

  // Safety settings
  constitutionalCheckingEnabled: z.boolean().default(true),
  riskLevelThreshold: z.nativeEnum(RiskLevel).default(RiskLevel.MEDIUM),
  requireApprovalForHighRisk: z.boolean().default(true),
  emergencyStopEnabled: z.boolean().default(true),

  // Rate limiting
  globalRateLimit: RateLimitConfigSchema,
  defaultCapabilityRateLimit: RateLimitConfigSchema,

  // Monitoring
  metricsEnabled: z.boolean().default(true),
  logAllExecutions: z.boolean().default(true),
  performanceTrackingEnabled: z.boolean().default(true),

  // Recovery and rollback
  rollbackEnabled: z.boolean().default(true),
  maxRollbackAttempts: z.number().positive().default(3),

  // Integration
  arbiterIntegrationEnabled: z.boolean().default(true),
});

export type MCPConfig = z.infer<typeof MCPConfigSchema>;

// ===== CAPABILITY INTERFACES =====

/**
 * Capability executor interface
 */
export interface CapabilityExecutor {
  /**
   * Execute the capability with given parameters
   */
  execute(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<ExecutionResult>;

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
  validatePreconditions(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<boolean>;

  /**
   * Validate execution context for safety
   */
  validateContext(context: ExecutionContext): boolean;

  /**
   * Estimate effects of execution
   */
  predictEffects(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Effect[];
}

// ===== UTILITY TYPES =====

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

// Export validation functions
export const validateCapabilitySpec = (data: unknown): CapabilitySpec =>
  CapabilitySpecSchema.parse(data);

export const validateExecutionRequest = (data: unknown): ExecutionRequest =>
  ExecutionRequestSchema.parse(data);

export const validateExecutionContext = (data: unknown): ExecutionContext =>
  ExecutionContextSchema.parse(data);

export const validateMCPConfig = (data: unknown): MCPConfig =>
  MCPConfigSchema.parse(data);
