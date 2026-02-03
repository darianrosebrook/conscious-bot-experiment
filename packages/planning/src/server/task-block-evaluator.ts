/**
 * Pure functions for task block state evaluation.
 * Extracted for testability — no side effects, no global state.
 *
 * These functions encapsulate the task selection and TTL logic that was
 * previously inline in autonomousTaskExecutor(). Tests can now verify
 * production code directly instead of reimplementing the logic locally.
 */

export const DEFAULT_BLOCKED_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * TTL policy table: explicit control over which blockedReasons auto-fail.
 * - 'exempt': never auto-fails (requires manual intervention or natural unblock)
 * - 'default': uses DEFAULT_BLOCKED_TTL_MS
 * - number: custom TTL in ms
 *
 * Unknown reasons default to 'default' (conservative: will auto-fail).
 */
export const BLOCKED_REASON_TTL_POLICY: Record<string, 'exempt' | 'default' | number> = {
  waiting_on_prereq: 'exempt',     // Unblocks naturally when prereq completes
  infra_error_tripped: 'exempt',   // Circuit breaker manages this, not TTL
  shadow_mode: 'default',          // Auto-fails after 2 min if mode never switches
  no_executable_plan: 'default',   // Planner issue, eventually fail
  max_retries_exceeded: 'exempt',  // Already terminal, don't double-fail
};

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
const ELIGIBLE_STATUSES = new Set(['active', 'in_progress']);

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
