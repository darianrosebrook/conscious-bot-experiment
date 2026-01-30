/**
 * Centralized timeout constants and failure-classification utility.
 *
 * Every module that issues an outbound request should import its timeout
 * from here instead of scattering magic numbers.
 */

/** World-state polling (bot /state endpoint). */
export const POLL_TIMEOUT_MS = 8_000;

/** Cognition side-effect dispatches (thought acks, lifecycle events). */
export const SIDE_EFFECT_TIMEOUT_MS = 3_000;

/** Individual leaf / action execution timeout. */
export const ACTION_TIMEOUT_MS = 15_000;

/** Lightweight bot health probe. */
export const HEALTH_CHECK_TIMEOUT_MS = 3_000;

export type FailureKind =
  | 'timeout'
  | 'server_error'
  | 'client_error'
  | 'network_error'
  | 'unknown';

/**
 * Classify an error (or HTTP status) into a coarse failure category.
 *
 * Used by mc-client to decide whether an error should trip the circuit
 * breaker (server/network errors) or be treated as transient (timeouts)
 * or a caller bug (4xx).
 */
export function classifyFailure(err: unknown, httpStatus?: number): FailureKind {
  // HTTP status takes precedence when available
  if (httpStatus !== undefined) {
    if (httpStatus >= 500) return 'server_error';
    if (httpStatus >= 400) return 'client_error';
  }

  if (err instanceof Error) {
    const name = err.name;
    const msg = err.message;

    // AbortError is raised by AbortController.abort() — typically a timeout
    if (name === 'AbortError' || name === 'TimeoutError') return 'timeout';

    // Node / undici network errors
    if (
      msg.includes('ECONNREFUSED') ||
      msg.includes('ECONNRESET') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('fetch failed')
    ) {
      return 'network_error';
    }
  }

  return 'unknown';
}
