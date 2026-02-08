/**
 * Pure functions for task block state evaluation.
 * Extracted for testability — no side effects, no global state.
 *
 * These functions encapsulate the task selection and TTL logic that was
 * previously inline in autonomousTaskExecutor(). Tests can now verify
 * production code directly instead of reimplementing the logic locally.
 */

export const DEFAULT_BLOCKED_TTL_MS = 2 * 60 * 1000; // 2 minutes

// ============================================================================
// Blocked Reason Registry — SINGLE SOURCE OF TRUTH
// ============================================================================
//
// Every known blocked reason is defined HERE. TTL policy, transient/contract-
// broken classification, and retry eligibility are all DERIVED from this object.
//
// To add a new blocked reason:
// 1. Add it to BLOCKED_REASON_REGISTRY below
// 2. Set classification: 'transient' | 'contract_broken' | 'terminal' | 'executor'
// 3. Set ttlPolicy: 'exempt' | 'default' | <number ms>
// 4. The alignment test will verify consistency automatically
//
// DO NOT add reasons to BLOCKED_REASON_TTL_POLICY or TRANSIENT_EXPANSION_REASONS
// directly — they are derived from this registry.
// ============================================================================

export type BlockedReasonClassification =
  | 'transient'        // Infrastructure will change — retry via nextEligibleAt
  | 'contract_broken'  // Task data is malformed — fail fast, no retry
  | 'terminal'         // Already terminal — don't double-fail
  | 'executor';        // Executor-managed lifecycle (prereqs, circuit breaker, shadow)

interface BlockedReasonEntry {
  classification: BlockedReasonClassification;
  ttlPolicy: 'exempt' | 'default' | number;
  description: string;
}

export const BLOCKED_REASON_REGISTRY: Record<string, BlockedReasonEntry> = {
  // ── Executor-managed reasons ──
  waiting_on_prereq:       { classification: 'executor', ttlPolicy: 'exempt',  description: 'Unblocks naturally when prereq completes' },
  infra_error_tripped:     { classification: 'executor', ttlPolicy: 'exempt',  description: 'Circuit breaker manages this, not TTL' },
  shadow_mode:             { classification: 'executor', ttlPolicy: 'default', description: 'Auto-fails after 2 min if mode never switches' },
  no_executable_plan:      { classification: 'executor', ttlPolicy: 'default', description: 'Planner issue, eventually fail' },
  max_retries_exceeded:    { classification: 'terminal', ttlPolicy: 'exempt',  description: 'Already terminal, dont double-fail' },

  // ── Transient expansion reasons (managed by retryExpansion via nextEligibleAt) ──
  blocked_digest_unknown:        { classification: 'transient', ttlPolicy: 'exempt', description: 'Sterling restarted, digest may re-register' },
  blocked_executor_unavailable:  { classification: 'transient', ttlPolicy: 'exempt', description: 'Sterling temporarily down' },
  blocked_executor_error:        { classification: 'transient', ttlPolicy: 'exempt', description: 'Sterling returned error (transient infra issue)' },
  rig_e_solver_unimplemented:    { classification: 'transient', ttlPolicy: 'exempt', description: 'Solver not yet deployed, may appear later' },
  unresolved_intents:            { classification: 'transient', ttlPolicy: 'exempt', description: 'Managed by intent re-resolution trigger' },

  // ── Intent resolution reasons (P0-6) ──
  blocked_intent_resolution_unavailable: { classification: 'transient', ttlPolicy: 'exempt', description: 'Resolver prerequisites missing or Sterling unreachable — scheduled retry' },
  blocked_unresolved_intents:            { classification: 'transient', ttlPolicy: 'exempt', description: 'Sterling solver could not lower intent leaves — retry with fresh world state' },
  blocked_intent_resolution_disabled:    { classification: 'contract_broken', ttlPolicy: 60_000, description: '60s then fail — STERLING_INTENT_RESOLVE=0 disables resolution by config' },
  blocked_undispatchable_steps:          { classification: 'contract_broken', ttlPolicy: 30_000, description: '30s then fail — resolved steps fail executor dispatch contract' },
  no_mapped_action:                      { classification: 'executor', ttlPolicy: 'default', description: 'Executor leaf has no action mapping — already blocked at execution' },

  // ── Contract-broken expansion reasons (fail fast, no retry) ──
  blocked_missing_digest:          { classification: 'contract_broken', ttlPolicy: 30_000, description: '30s then fail — task data malformed' },
  blocked_missing_schema_version:  { classification: 'contract_broken', ttlPolicy: 30_000, description: '30s then fail — task data malformed' },
  blocked_routing_disabled:        { classification: 'contract_broken', ttlPolicy: 30_000, description: '30s then fail — config explicitly disabled' },
  blocked_invalid_steps_bundle:    { classification: 'contract_broken', ttlPolicy: 30_000, description: '30s then fail — Sterling returned invalid shape' },
  blocked_envelope_id_mismatch:    { classification: 'contract_broken', ttlPolicy: 30_000, description: '30s then fail — integrity check failed' },

  // ── Terminal expansion reasons ──
  expansion_retries_exhausted: { classification: 'terminal', ttlPolicy: 'exempt', description: 'Already terminal, dont double-fail' },
};

/**
 * TTL policy table — DERIVED from BLOCKED_REASON_REGISTRY.
 * Do not edit directly; add entries to the registry above.
 */
export const BLOCKED_REASON_TTL_POLICY: Record<string, 'exempt' | 'default' | number> =
  Object.fromEntries(
    Object.entries(BLOCKED_REASON_REGISTRY).map(([reason, entry]) => [reason, entry.ttlPolicy])
  );

/**
 * Set of transient expansion reasons — DERIVED from BLOCKED_REASON_REGISTRY.
 * Used by retryExpansion to determine whether to retry or fail immediately.
 */
export const TRANSIENT_EXPANSION_REASONS: ReadonlySet<string> = new Set(
  Object.entries(BLOCKED_REASON_REGISTRY)
    .filter(([, entry]) => entry.classification === 'transient')
    .map(([reason]) => reason)
);

/**
 * Set of contract-broken expansion reasons — DERIVED from BLOCKED_REASON_REGISTRY.
 */
export const CONTRACT_BROKEN_REASONS: ReadonlySet<string> = new Set(
  Object.entries(BLOCKED_REASON_REGISTRY)
    .filter(([, entry]) => entry.classification === 'contract_broken')
    .map(([reason]) => reason)
);

/**
 * Normalize a blocked reason from Sterling to a known registry reason.
 *
 * If the reason is already in the registry, returns it as-is.
 * If unknown, normalizes to 'blocked_executor_error' (transient, retryable)
 * and returns the original as `originalReason` for traceability.
 *
 * This prevents unknown Sterling reasons from falling through to the default
 * 2-min TTL auto-fail — they get treated as transient infrastructure issues instead.
 */
export function normalizeBlockedReason(reason: string): {
  reason: string;
  originalReason?: string;
} {
  if (BLOCKED_REASON_REGISTRY[reason]) {
    return { reason };
  }
  // Unknown reason → normalize to transient umbrella, preserve detail
  return { reason: 'blocked_executor_error', originalReason: reason };
}

export interface TaskBlockState {
  shouldUnblock: boolean;
  shouldFail: boolean;
  failReason?: string;
}

/**
 * Task type for block evaluation functions.
 * Minimal interface to avoid coupling to TaskIntegration types.
 */
export interface BlockEvaluableTask {
  status?: string;
  steps?: Array<unknown>;
  metadata?: {
    blockedReason?: string;
    blockedAt?: number;
    nextEligibleAt?: number;
  };
}

/**
 * Evaluate whether a shadow-blocked task should be unblocked.
 * Returns true only when mode is 'live' AND task has blockedReason='shadow_mode'.
 */
export function shouldAutoUnblockTask(
  task: BlockEvaluableTask,
  currentMode: 'live' | 'shadow'
): boolean {
  return currentMode === 'live' && task.metadata?.blockedReason === 'shadow_mode';
}

/**
 * Evaluate whether a blocked task should be auto-failed due to TTL expiry.
 * Uses the TTL policy table to determine behavior per blockedReason.
 *
 * @param task - The task to evaluate
 * @param nowMs - Current timestamp in ms (injectable for testing)
 * @param defaultTtlMs - Default TTL for 'default' policy reasons
 * @returns TaskBlockState indicating what action (if any) should be taken
 */
export function evaluateTaskBlockState(
  task: BlockEvaluableTask,
  nowMs: number,
  defaultTtlMs: number = DEFAULT_BLOCKED_TTL_MS
): TaskBlockState {
  const { blockedReason, blockedAt } = task.metadata ?? {};

  // Not blocked — no action needed
  if (!blockedReason || !blockedAt) {
    return { shouldUnblock: false, shouldFail: false };
  }

  // Look up TTL policy for this reason
  const policy = BLOCKED_REASON_TTL_POLICY[blockedReason] ?? 'default';

  // Exempt reasons never auto-fail
  if (policy === 'exempt') {
    return { shouldUnblock: false, shouldFail: false };
  }

  // Determine effective TTL
  const ttlMs = policy === 'default' ? defaultTtlMs : policy;

  // Check TTL
  const elapsedMs = nowMs - blockedAt;
  if (elapsedMs > ttlMs) {
    return {
      shouldUnblock: false,
      shouldFail: true,
      failReason: `blocked-ttl-exceeded:${blockedReason}`,
    };
  }

  return { shouldUnblock: false, shouldFail: false };
}

/**
 * Status allowlist: only these statuses are ever eligible for execution.
 * Using an allowlist is safer than a denylist — new statuses must be
 * explicitly opted in rather than accidentally being executable.
 */
// Pending tasks are created before first execution attempt; the autonomous executor
// must be able to pick them up once they have executable steps attached.
const ELIGIBLE_STATUSES = new Set(['pending', 'active', 'in_progress']);

/**
 * Determine if a task is eligible for execution.
 * A task is eligible if:
 * 1. Status is in the allowlist (active, in_progress)
 * 2. Not blocked (no blockedReason)
 * 3. Not in exponential backoff (nextEligibleAt not in the future)
 *
 * @param task - The task to evaluate
 * @param nowMs - Current timestamp in ms (injectable for testing)
 * @returns true if the task can be executed this cycle
 */
export function isTaskEligible(
  task: BlockEvaluableTask,
  nowMs: number
): boolean {
  // Status must be in allowlist
  if (!ELIGIBLE_STATUSES.has(task.status ?? '')) {
    return false;
  }
  // Pending tasks must have steps attached; otherwise they are "not yet planned"
  // and should not be selected for execution (prevents noisy no-op blocking).
  if ((task.status ?? '') === 'pending') {
    if (!Array.isArray(task.steps) || task.steps.length === 0) {
      return false;
    }
  }
  // Must not be blocked
  if (task.metadata?.blockedReason) {
    return false;
  }
  // Must not be in backoff
  if (task.metadata?.nextEligibleAt && nowMs < task.metadata.nextEligibleAt) {
    return false;
  }
  return true;
}
