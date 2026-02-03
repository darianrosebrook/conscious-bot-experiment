/**
 * Valuation Decision Record Types (Rig F Observability Layer)
 *
 * Content-addressed decision records for inventory valuation.
 * Separates decision identity (content-addressed decisionId) from
 * event occurrence (unique eventId per emission).
 *
 * Key design:
 * - decisionId = "valuation:${decisionHash}" — same inputs+outputs = same id
 * - eventId = "valuation_event:${timestamp}:${seq}" — unique per emission
 * - Full ruleset embedded in record for self-contained replay
 * - rulesetDigest is a redundant binding (already in hash payload via output)
 * - inputRaw, timestamp, correlation excluded from decisionHash
 *
 * @author @darianrosebrook
 */

import { canonicalize, contentHash } from './solve-bundle';
import {
  type ValuationInput,
  type ValuationPlanV1,
  type ValuationRulesetV1,
  deriveEffectiveInventory,
  lexCmp,
} from './minecraft-valuation-types';
import { computeRulesetDigest } from './minecraft-valuation-rules';

// ============================================================================
// Types
// ============================================================================

/** Canonical input: the single normalization applied once, used for hashing and display */
export interface ValuationInputCanonicalV1 {
  readonly effectiveInventory: Record<string, number>;
  readonly excludedCapTokens: string[];
  readonly slotBudget: number;
  readonly protectedItems: string[];
  readonly protectedPrefixes: string[];
  readonly observedTokens: string[];
}

/** Content-addressed decision artifact */
export interface ValuationDecisionRecordV1 {
  readonly recordVersion: 1;
  readonly decisionId: string;
  readonly decisionHash: string;
  readonly inputCanonical: ValuationInputCanonicalV1;
  readonly inputRaw: ValuationInput;
  readonly ruleset: ValuationRulesetV1;
  readonly rulesetDigest: string;
  readonly output: ValuationPlanV1;
}

/** Caller correlation context */
export interface ValuationCorrelation {
  readonly taskId?: string;
  readonly tickId?: number;
  readonly plannerCycleId?: string;
}

/** Per-emission event wrapper (unique per occurrence, never deduped away) */
export interface ValuationEventV1 {
  readonly eventVersion: 1;
  readonly eventId: string;
  readonly decisionId: string;
  readonly timestamp: number;
  /** Monotonic counter within a single emitter instance (for ordering). */
  readonly emitterSeq: number;
  readonly correlation: ValuationCorrelation;
  readonly decision: ValuationDecisionRecordV1;
}

/** Individual check result within a verification */
export interface ValuationCheckResult {
  readonly name: string;
  readonly passed: boolean;
  readonly category: 'hash-integrity' | 'semantic';
  readonly detail?: string;
}

/** Result of verifying a decision record */
export interface ValuationVerificationResultV1 {
  readonly verificationVersion: 1;
  readonly valid: boolean;
  readonly checks: ValuationCheckResult[];
  readonly recomputedDigests: {
    valuationInputDigest: string;
    decisionDigest: string;
    inventoryStateHash: string;
  };
  readonly replayDiff?: {
    field: string;
    expected: string;
    actual: string;
  };
  readonly durationMs: number;
}

/** Known failure modes for dashboard aggregation */
export type ValuationFailureMode =
  | 'UNKNOWN_ITEM_VALUATION'
  | 'INSUFFICIENT_CAPACITY_PROTECTED'
  | 'UNSUPPORTED_POLICY'
  | 'DIGEST_MISMATCH';

/** SSE event envelope */
export interface ValuationUpdateEvent {
  readonly event: 'valuationDecisionRecorded' | 'valuationVerified';
  readonly data:
    | ValuationEventV1
    | { eventId: string; decisionId: string; verification: ValuationVerificationResultV1 };
  readonly timestamp: number;
}

// ============================================================================
// Event ID generation (UUID-based, collision-resistant across restarts)
// ============================================================================

/** Monotonic sequence for ordering events within a single emitter instance. */
let emitterSeq = 0;

function nextEventId(): string {
  emitterSeq++;
  return `valuation_event:${crypto.randomUUID()}`;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Canonicalize raw input into the single hashing/display structure.
 * Uses deriveEffectiveInventory for inventory normalization (same as solver).
 * Arrays are sorted and deduped to prevent permutation-based divergence.
 */
export function canonicalizeInput(input: ValuationInput): ValuationInputCanonicalV1 {
  const { effective, excludedCapTokens } = deriveEffectiveInventory(input.inventory);
  const sortDedupe = (arr: readonly string[]) => [...new Set(arr)].sort(lexCmp);
  return {
    effectiveInventory: effective,
    excludedCapTokens,
    slotBudget: input.slotBudget,
    protectedItems: sortDedupe(input.protectedItems),
    protectedPrefixes: sortDedupe(input.protectedPrefixes),
    observedTokens: sortDedupe(input.observedTokens),
  };
}

/**
 * Build the hash payload for decision identity.
 * Includes: recordVersion, inputCanonical, rulesetDigest, output.
 * Excludes: inputRaw (debug-only), timestamp, correlation.
 */
function computeDecisionHash(
  inputCanonical: ValuationInputCanonicalV1,
  rulesetDigest: string,
  output: ValuationPlanV1,
): string {
  return contentHash(canonicalize({
    recordVersion: 1,
    inputCanonical,
    rulesetDigest,
    output,
  }));
}

/**
 * Create a content-addressed decision record.
 * The decisionId is deterministic: same inputs+outputs always produce the same id.
 */
export function createDecisionRecord(
  input: ValuationInput,
  ruleset: ValuationRulesetV1,
  rulesetDigest: string,
  output: ValuationPlanV1,
): ValuationDecisionRecordV1 {
  const inputCanonical = canonicalizeInput(input);
  const decisionHash = computeDecisionHash(inputCanonical, rulesetDigest, output);
  return {
    recordVersion: 1,
    decisionId: `valuation:${decisionHash}`,
    decisionHash,
    inputCanonical,
    inputRaw: input,
    ruleset,
    rulesetDigest,
    output,
  };
}

/**
 * Create a unique event wrapping a decision.
 * eventId is unique per call (monotonic timestamp + sequence).
 * The same decision emitted twice produces two distinct events.
 */
export function createValuationEvent(
  decision: ValuationDecisionRecordV1,
  correlation: ValuationCorrelation,
): ValuationEventV1 {
  return {
    eventVersion: 1,
    eventId: nextEventId(),
    decisionId: decision.decisionId,
    timestamp: Date.now(),
    emitterSeq,
    correlation,
    decision,
  };
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { computeRulesetDigest };
