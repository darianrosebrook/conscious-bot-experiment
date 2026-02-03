/**
 * Executor-level circuit breaker for infra errors.
 *
 * When tripped, the executor pauses scheduling for a backoff period.
 * This prevents per-task backoff from masking a global outage
 * (e.g., bot disconnected, network down).
 *
 * Design rationale:
 * - Infra errors are systemic, not task-specific
 * - Per-task backoff would cause every task to independently accumulate retries
 * - Circuit breaker keeps tasks clean; executor health carries the blame
 */

export interface CircuitBreakerState {
  tripped: boolean;
  trippedAt: number | null;
  tripCount: number;
  lastError: string | null;
  resumeAt: number | null;
}

const INITIAL_BACKOFF_MS = 5_000;     // 5 seconds
const MAX_BACKOFF_MS = 60_000;        // 1 minute cap
const RESET_AFTER_SUCCESS_COUNT = 3;  // Reset trip count after 3 consecutive successes

let state: CircuitBreakerState = {
  tripped: false,
  trippedAt: null,
  tripCount: 0,
  lastError: null,
  resumeAt: null,
};

let successStreak = 0;

/**
 * Call when an infra error occurs (outcome='error').
 * Trips the circuit breaker and computes an exponential backoff.
 *
 * @param error - The error message that caused the trip
 * @returns The backoff duration in ms before retry is allowed
 */
export function tripCircuitBreaker(error: string): number {
  successStreak = 0;
  state.tripCount += 1;
  state.tripped = true;
  state.trippedAt = Date.now();
  state.lastError = error;

  // Exponential backoff with cap: 5s, 10s, 20s, 40s, 60s, 60s, ...
  const backoffMs = Math.min(
    INITIAL_BACKOFF_MS * Math.pow(2, state.tripCount - 1),
    MAX_BACKOFF_MS
  );
  state.resumeAt = Date.now() + backoffMs;

  console.warn(
    `[CircuitBreaker] Tripped (count=${state.tripCount}): ${error}. Resume in ${backoffMs}ms`
  );
  return backoffMs;
}

/**
 * Call after a successful action execution.
 * Resets the circuit breaker after RESET_AFTER_SUCCESS_COUNT consecutive successes.
 */
export function recordSuccess(): void {
  successStreak += 1;
  if (successStreak >= RESET_AFTER_SUCCESS_COUNT && state.tripCount > 0) {
    console.log(
      `[CircuitBreaker] Reset after ${successStreak} consecutive successes`
    );
    state.tripCount = 0;
    state.lastError = null;
  }
  // Clear tripped state (allow immediate execution)
  state.tripped = false;
  state.resumeAt = null;
}

/**
 * Check if the circuit breaker is currently blocking execution.
 *
 * Returns true only when:
 * 1. The breaker is tripped, AND
 * 2. We haven't reached the resumeAt time yet
 *
 * Once resumeAt is reached, returns false (half-open state allows retry).
 *
 * @param nowMs - Current timestamp (injectable for testing)
 */
export function isCircuitBreakerOpen(nowMs: number = Date.now()): boolean {
  if (!state.tripped) return false;
  if (state.resumeAt && nowMs >= state.resumeAt) {
    // Backoff expired, allow retry (half-open state)
    return false;
  }
  return true;
}

/**
 * Get current state for diagnostics/dashboard.
 * Returns a copy to prevent external mutation.
 */
export function getCircuitBreakerState(): Readonly<CircuitBreakerState> {
  return { ...state };
}

/**
 * Reset for testing. Not for production use.
 */
export function _resetCircuitBreaker(): void {
  state = {
    tripped: false,
    trippedAt: null,
    tripCount: 0,
    lastError: null,
    resumeAt: null,
  };
  successStreak = 0;
}

/**
 * Get the success streak count (for testing/diagnostics).
 */
export function _getSuccessStreak(): number {
  return successStreak;
}
