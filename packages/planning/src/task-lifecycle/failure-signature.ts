/**
 * FailureSignatureV1 — content-addressed failure pattern identity.
 *
 * Content-addressed means: same semantic failure produces same signatureId,
 * regardless of timestamp, task ID, or phrasing variation.
 *
 * TS uses this to decide "when to stop". Sterling uses this (via escalation)
 * to decide "what to do instead".
 *
 * @author @darianrosebrook
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Discriminant: which subsystem produced the failure.
 *
 * - expansion_blocked: Sterling expansion returned blocked/error
 * - executor_error: Executor-level failure (guard pipeline, dispatch)
 * - tool_failure: MC interface tool returned ok=false
 * - prereq_exhausted: Prerequisite injection cap reached
 * - task_terminal: Task lifecycle reached 'failed' state (catch-all terminal surface)
 * - dedup_repeat: Dedup suppression prevented a repeated task (phantom failure for LoopBreaker)
 */
export type FailureCategory =
  | 'expansion_blocked'
  | 'executor_error'
  | 'tool_failure'
  | 'prereq_exhausted'
  | 'task_terminal'
  | 'dedup_repeat';

export interface FailureSignatureV1 {
  _schema: 'failure_signature_v1';
  /** Content-addressed hash of semantic failure fields. 16-char hex. */
  signatureId: string;
  category: FailureCategory;
  /** The leaf/tool name that failed (if applicable). */
  leaf?: string;
  /** Key parameter of the tool step (e.g. target item for collect_items). */
  targetParam?: string;
  /** Structured failure code from the tool or executor. */
  failureCode?: string;
  /** Blocked reason from BLOCKED_REASON_REGISTRY. */
  blockedReason?: string;
  /** CollectDiagnostics.reason_code (for tool failures). */
  diagReasonCode?: string;
  /** Timestamp of first occurrence (NOT included in signatureId hash). */
  firstSeenAt: number;
}

// ---------------------------------------------------------------------------
// Content-addressed identity
// ---------------------------------------------------------------------------

/**
 * Compute content-addressed signatureId.
 *
 * Deterministic: same inputs always produce same output.
 * Timestamp and other non-semantic fields are excluded.
 *
 * The domain prefix 'failure_signature_v1' prevents cross-schema collisions
 * (e.g. a raw SHA of the same tuple used elsewhere won't match).
 */
export function computeSignatureId(
  category: FailureCategory,
  leaf?: string,
  targetParam?: string,
  failureCode?: string,
  blockedReason?: string,
  diagReasonCode?: string,
): string {
  const parts = [
    'failure_signature_v1', // domain prefix
    category,
    leaf ?? '',
    targetParam ?? '',
    failureCode ?? '',
    blockedReason ?? '',
    diagReasonCode ?? '',
  ];
  return createHash('sha256')
    .update(parts.join('\x00'))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Build a FailureSignatureV1 from available context.
 * Pure function — no side effects, no I/O.
 */
export function buildFailureSignature(params: {
  category: FailureCategory;
  leaf?: string;
  targetParam?: string;
  failureCode?: string;
  blockedReason?: string;
  diagReasonCode?: string;
}): FailureSignatureV1 {
  return {
    _schema: 'failure_signature_v1',
    signatureId: computeSignatureId(
      params.category,
      params.leaf,
      params.targetParam,
      params.failureCode,
      params.blockedReason,
      params.diagReasonCode,
    ),
    category: params.category,
    leaf: params.leaf,
    targetParam: params.targetParam,
    failureCode: params.failureCode,
    blockedReason: params.blockedReason,
    diagReasonCode: params.diagReasonCode,
    firstSeenAt: Date.now(),
  };
}
