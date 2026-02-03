/**
 * Normalizes the raw HTTP response from the MC interface /action endpoint
 * into a stable { ok, error?, data?, failureCode? } shape.
 *
 * Contract: the planning server must never surface ok:true unless the
 * leaf-level outcome is "success". The MC interface wraps all non-throwing
 * responses with { success: true, result: <leafPayload> }, so transport
 * success !== domain success.
 *
 * This normalizer is the single source of truth for action-result
 * interpretation. All executor code paths that consume /action responses
 * must route through this function.
 */

export interface NormalizedActionResponse {
  /** True only when the leaf-level outcome is success. */
  ok: boolean;
  /** Human-readable error string when ok is false. */
  error?: string;
  /** Structured failure code from the leaf (e.g. 'acquire.noneCollected'). */
  failureCode?: string;
  /** The leaf-level result payload (whatever the leaf returned). */
  data: any;
}

/**
 * @param httpPayload  The parsed JSON body from the MC interface /action endpoint.
 *                     Expected shape: { success: boolean, result?: any, error?: string, message?: string }
 */
export function normalizeActionResponse(httpPayload: any): NormalizedActionResponse {
  if (!httpPayload) {
    return { ok: false, error: 'Empty response from MC interface', data: null };
  }

  // Transport failure: MC interface returned success:false (HTTP handler caught an error)
  if (!httpPayload.success) {
    return {
      ok: false,
      error: httpPayload.error || httpPayload.message || 'Action execution failed',
      data: httpPayload.result ?? null,
    };
  }

  // Transport success: check leaf-level outcome
  const leafResult = httpPayload.result;

  // No leaf payload — transport succeeded with no leaf result.
  // This can happen for fire-and-forget actions.
  if (leafResult == null) {
    return { ok: true, data: null };
  }

  // Leaf reports failure via success:false
  if (leafResult.success === false) {
    return {
      ok: false,
      error: extractLeafError(leafResult),
      failureCode: extractFailureCode(leafResult),
      data: leafResult,
    };
  }

  // Leaf reports failure via status:'failure'
  if (leafResult.status === 'failure') {
    return {
      ok: false,
      error: extractLeafError(leafResult),
      failureCode: extractFailureCode(leafResult),
      data: leafResult,
    };
  }

  // Leaf has an error field but no explicit success indicator — treat as failure.
  // This catches leaves that only set error without setting success:false.
  if (leafResult.error && leafResult.success !== true && leafResult.status !== 'success') {
    return {
      ok: false,
      error: extractLeafError(leafResult),
      failureCode: extractFailureCode(leafResult),
      data: leafResult,
    };
  }

  // All checks passed — leaf-level success
  return { ok: true, data: leafResult };
}

/** Extract a human-readable error string from a leaf result. */
function extractLeafError(leafResult: any): string {
  if (typeof leafResult.error === 'string') return leafResult.error;
  if (leafResult.error?.detail) return leafResult.error.detail;
  if (leafResult.error?.message) return leafResult.error.message;
  if (leafResult.message) return leafResult.message;
  return 'Leaf action failed';
}

/** Extract a structured failure code from a leaf result (if present). */
function extractFailureCode(leafResult: any): string | undefined {
  return leafResult.error?.code ?? leafResult.failureCode ?? undefined;
}
