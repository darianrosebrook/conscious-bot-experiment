/**
 * Plan-Body Interface (PBI) Types and Contracts
 *
 * This module defines the contracts that ensure plans reliably become actions.
 * The PBI provides the "capability discipline" for plan execution, ensuring
 * that every plan step can be validated, executed, and verified.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Core PBI Types
// ============================================================================

/**
 * Intent - Normalized input from planning systems
 */
export interface Intent {
  id: string; // traceability
  source: 'user' | 'system' | 'memory';
  goal: string; // e.g., "AcquireWood"
  context: Record<string, any>; // env snapshot deltas, constraints
  urgency: number; // 0..1
  safety: { allowed: boolean; reason?: string };
  timeBudgetMs?: number; // soft budget
  provenanceRef?: string; // link to raw prompt/log
}

/**
 * PlanStep - Executable atom with preconditions/effects
 */
export interface PlanStep {
  stepId: string;
  type: string; // canonical verb: 'navigate', 'dig_block', 'craft_item', ...
  args: Record<string, any>; // structured arguments
  // For repair/learning:
  preconds?: string[]; // declarative predicates (world/inventory)
  effects?: string[]; // expected post-conditions
  cost?: number; // planner-estimated effort
  priority?: number; // execution priority / deadline handling
  safetyLevel?: 'safe' | 'caution' | 'restricted';
  expectedDurationMs?: number;
  idempotencyKey?: string; // to avoid double-execution
}

/**
 * ActionResult - Result of executing a plan step
 */
export interface ActionResult {
  ok: boolean;
  error?: { code: string; detail?: string; retryable?: boolean };
  startedAt: number;
  endedAt: number;
  observables?: Record<string, any>; // facts for memory/provenance
}

/**
 * CapabilitySpec - Registry entry for executable behaviors
 */
export interface CapabilitySpec {
  name: string; // 'craft_item' | 'build_structure' | ...
  version: string;
  inputSchema: z.ZodSchema<any>;
  guard: (_ctx: ExecutionContext) => boolean;
  runner: (_ctx: ExecutionContext, _args: any) => Promise<ActionResult>;
  acceptance: (_pre: WorldSnapshot, _post: WorldSnapshot) => boolean;
  sla?: {
    p95DurationMs: number;
    successRate: number;
    maxRetries: number;
  };
}

// ============================================================================
// Execution Context and World State
// ============================================================================

/**
 * ExecutionContext - Current state for execution decisions
 */
export interface ExecutionContext {
  threatLevel: number;
  hostileCount: number;
  nearLava: boolean;
  lavaDistance: number;
  resourceValue: number;
  detourDistance: number;
  subgoalUrgency: number;
  estimatedTimeToSubgoal: number;
  commitmentStrength: number;
  timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
  lightLevel: number;
  airLevel: number;
  // Add more context fields as needed
}

/**
 * WorldSnapshot - Point-in-time world state for verification
 */
export interface WorldSnapshot {
  timestamp: number;
  health: number;
  hunger: number;
  energy: number;
  position: { x: number; y: number; z: number };
  inventory: Record<string, number>;
  nearbyBlocks: Array<{ type: string; position: any }>;
  nearbyEntities: Array<{ type: string; position: any; hostile: boolean }>;
  timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
  lightLevel: number;
  airLevel: number;
  // Add more snapshot fields as needed
}

/**
 * WorldState interface for accessing current world information
 */
export interface WorldState {
  getHealth(): number;
  getHunger(): number;
  getEnergy(): number;
  getPosition(): { x: number; y: number; z: number };
  getLightLevel(): number;
  getAir(): number;
  getTimeOfDay(): 'dawn' | 'day' | 'dusk' | 'night';
  hasItem(_itemName: string, _quantity?: number): boolean;
  distanceTo(_target: any): number;
  getThreatLevel(): number;
  getInventory(): Record<string, number>;
  getNearbyResources(): any[];
  getNearbyHostiles(): any[];
}

// ============================================================================
// PBI Validation and Metrics
// ============================================================================

/**
 * PBI Verification Result
 */
export interface PBIVerificationResult {
  checks: {
    registryCheck: boolean;
    schemaCheck: boolean;
    guardCheck: boolean;
    acceptanceCheck: boolean;
  };
  errors: string[];
  warnings: string[];
  errorCode?: PBIErrorCode;
  metrics: {
    ttfaMs?: number;
    stuckDetected: boolean;
    localRetries: number;
  };
}

/**
 * PBI Acceptance Criteria
 */
export interface PBIAcceptanceCriteria {
  ttfaMs: number; // Time-to-First-Action
  completionRate: number; // % of steps that complete or fail explicitly
  localRetries: number; // Max local retries before escalation
  stuckTimeoutMs: number; // Timeout for stuckness detection
}

/**
 * Execution Health Metrics
 */
export interface ExecutionHealthMetrics {
  // Timing
  ttfaP50: number;
  ttfaP95: number;

  // Throughput
  actionsPerSecond: number;

  // Reliability
  planRepairRate: number; // repairs per plan
  localRetrySuccessRate: number;
  stepsPerSuccess: number;

  // Failure modes
  timeoutsPerHour: number;
  stuckLoopsPerHour: number;

  // Capability health
  capabilitySLAs: Record<
    string,
    {
      successRate: number;
      avgDurationMs: number;
      lastNFailures: string[];
    }
  >;

  // Memory impact
  methodUplift: Record<string, number>; // Δ success rate after updates
  hazardRecallRate: number; // % emergencies avoided by learning
}

// ============================================================================
// PBI Error Types
// ============================================================================

export class PBIError extends Error {
  constructor(
    public _code: string,
    message: string,
    public _stepId?: string,
    public _capability?: string,
    public _context?: any
  ) {
    super(message);
    this.name = 'PBIError';
  }

  // Getter for code field to allow access as error.code
  get code(): string {
    return this._code;
  }
}

export enum PBIErrorCode {
  SCHEMA_VIOLATION = 'schema_violation',
  CAPABILITY_UNAVAILABLE = 'capability_unavailable',
  ACCEPTANCE_FAILED = 'acceptance_failed',
  EXECUTION_TIMEOUT = 'execution_timeout',
  UNKNOWN_VERB = 'unknown_verb',
  GUARD_FAILED = 'guard_failed',
  TTFA_EXCEEDED = 'ttfa_exceeded',
  STUCK_DETECTED = 'stuck_detected',
  DOUBLE_DISPATCH = 'double_dispatch',
  PRECOND_UNMET = 'precond_unmet',
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const IntentSchema = z.object({
  id: z.string(),
  source: z.enum(['user', 'system', 'memory']),
  goal: z.string(),
  context: z.record(z.any()),
  urgency: z.number().min(0).max(1),
  safety: z.object({
    allowed: z.boolean(),
    reason: z.string().optional(),
  }),
  timeBudgetMs: z.number().optional(),
  provenanceRef: z.string().optional(),
});

export const PlanStepSchema = z.object({
  stepId: z.string(),
  type: z.string(),
  args: z.record(z.any()),
  preconds: z.array(z.string()).optional(),
  effects: z.array(z.string()).optional(),
  cost: z.number().optional(),
  priority: z.number().optional(),
  safetyLevel: z.enum(['safe', 'caution', 'restricted']).optional(),
  expectedDurationMs: z.number().optional(),
  idempotencyKey: z.string().optional(),
});

export const ActionResultSchema = z.object({
  ok: z.boolean(),
  error: z
    .object({
      code: z.string(),
      detail: z.string().optional(),
      retryable: z.boolean().optional(),
    })
    .optional(),
  startedAt: z.number(),
  endedAt: z.number(),
  observables: z.record(z.any()).optional(),
});

// ============================================================================
// Type Guards and Utilities
// ============================================================================

export function isIntent(obj: any): obj is Intent {
  return IntentSchema.safeParse(obj).success;
}

export function isPlanStep(obj: any): obj is PlanStep {
  return PlanStepSchema.safeParse(obj).success;
}

export function isActionResult(obj: any): obj is ActionResult {
  return ActionResultSchema.safeParse(obj).success;
}

export function isPBIError(error: any): error is PBIError {
  return error instanceof PBIError;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_PBI_ACCEPTANCE: PBIAcceptanceCriteria = {
  ttfaMs: 2000, // 2 seconds
  completionRate: 0.95, // 95%
  localRetries: 2,
  stuckTimeoutMs: 3000, // 3 seconds
};

export const CANONICAL_VERBS = [
  'navigate',
  'dig_block',
  'craft_item',
  'consume_food',
  'place_block',
  'build_structure',
  'gather',
  'explore',
  'mine',
  'move_forward',
  'flee',
  'pillar_up',
  'eat_food',
] as const;

export type CanonicalVerb = (typeof CANONICAL_VERBS)[number];
