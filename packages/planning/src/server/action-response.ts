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
 *
 * P0-A: This module also hoists `toolDiagnostics` from the leaf result to the
 * top-level response, so downstream consumers (loop breaker, golden-run recorder,
 * prereq injector) never need to dig through nesting layers.
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
  /**
   * Hoisted tool diagnostics from the leaf result.
   * Only present when the leaf returned an object with a valid `_diag_version`.
   * Consumers should use this instead of digging through `data` nesting.
   */
  toolDiagnostics?: Record<string, unknown>;
  /** The leaf's own `status` field (e.g. 'success', 'failure'). */
  leafStatus?: string;
  /** The leaf's error code (e.g. 'craft.missingInput'). */
  leafErrorCode?: string;
}

/**
 * Unwrap the "best available leaf result" from any wrapper shape.
 *
 * The MC interface response passes through multiple wrapping layers:
 *   1. _runLeaf: { success, data: { leafResult: { status, error, result: { toolDiagnostics } } } }
 *   2. Direct leaf: { status, error, result: { toolDiagnostics } }
 *   3. Legacy handler: { success, error } (no leaf result or diagnostics)
 *
 * This function identifies the innermost leaf result and extracts diagnostics.
 */
function unwrapLeafResult(rawData: any): {
  leafStatus?: string;
  leafErrorCode?: string;
  toolDiagnostics?: Record<string, unknown>;
} {
  if (!rawData || typeof rawData !== 'object') {
    return {};
  }

  // Path 1: _runLeaf wrapping — { data: { leafResult: { status, result: { toolDiagnostics } } } }
  const wrappedLeaf = rawData.data?.leafResult;
  if (wrappedLeaf && typeof wrappedLeaf === 'object') {
    return {
      leafStatus: wrappedLeaf.status,
      leafErrorCode: wrappedLeaf.error?.code,
      toolDiagnostics: extractValidDiagnostics(wrappedLeaf.result?.toolDiagnostics),
    };
  }

  // Path 2: Direct leaf result — { status, result: { toolDiagnostics } }
  if (rawData.status && ('result' in rawData || 'error' in rawData)) {
    return {
      leafStatus: rawData.status,
      leafErrorCode: rawData.error?.code,
      toolDiagnostics: extractValidDiagnostics(rawData.result?.toolDiagnostics),
    };
  }

  // Path 3: Legacy handler — no leaf result structure
  return {};
}

/** Accept diagnostics only if they have a valid `_diag_version` field. */
function extractValidDiagnostics(candidate: any): Record<string, unknown> | undefined {
  if (candidate && typeof candidate === 'object' && candidate._diag_version != null) {
    return candidate;
  }
  return undefined;
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
    const raw = httpPayload.result ?? null;
    const unwrapped = unwrapLeafResult(raw);
    return {
      ok: false,
      error: httpPayload.error || httpPayload.message || 'Action execution failed',
      data: raw,
      ...unwrapped,
    };
  }

  // Transport success: check leaf-level outcome
  const leafResult = httpPayload.result;

  // No leaf payload — transport succeeded with no leaf result.
  // This can happen for fire-and-forget actions.
  if (leafResult == null) {
    return { ok: true, data: null };
  }

  // Unwrap leaf metadata from whatever nesting shape we received
  const unwrapped = unwrapLeafResult(leafResult);

  // Leaf reports failure via success:false
  if (leafResult.success === false) {
    return {
      ok: false,
      error: extractLeafError(leafResult),
      failureCode: extractFailureCode(leafResult),
      data: leafResult,
      ...unwrapped,
    };
  }

  // Leaf reports failure via status:'failure'
  if (leafResult.status === 'failure') {
    return {
      ok: false,
      error: extractLeafError(leafResult),
      failureCode: extractFailureCode(leafResult),
      data: leafResult,
      ...unwrapped,
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
      ...unwrapped,
    };
  }

  // All checks passed — leaf-level success (also hoist diagnostics for success path)
  return { ok: true, data: leafResult, ...unwrapped };
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
