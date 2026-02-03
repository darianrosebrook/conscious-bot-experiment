/**
 * Valuation Decision Verifier — Fast Checks (Rig F Observability Layer)
 *
 * Client-safe module: digest recomputation only. No solver import.
 * 5 hash-integrity checks, zero semantic checks.
 *
 * Import this module (not the full verifier) from any code path that
 * may end up in a browser bundle — it guarantees no transitive import
 * of `./minecraft-valuation` (the solver).
 *
 * @author @darianrosebrook
 */

import { canonicalize, contentHash } from './solve-bundle';
import {
  computeValuationInputDigest,
  computeDecisionDigest,
  hashInventoryState,
} from './minecraft-valuation-types';
import { computeRulesetDigest } from './minecraft-valuation-rules';
import type {
  ValuationDecisionRecordV1,
  ValuationCheckResult,
  ValuationVerificationResultV1,
} from './minecraft-valuation-record-types';

// ============================================================================
// Fast Checks (hash-integrity, client-safe)
// ============================================================================

function checkInputDigestMatch(record: ValuationDecisionRecordV1): ValuationCheckResult {
  const recomputed = computeValuationInputDigest(record.inputRaw, record.rulesetDigest);
  const passed = recomputed === record.output.valuationInputDigest;
  return {
    name: 'inputDigestMatch',
    passed,
    category: 'hash-integrity',
    detail: passed ? undefined : `expected ${record.output.valuationInputDigest}, got ${recomputed}`,
  };
}

function checkDecisionDigestMatch(record: ValuationDecisionRecordV1): ValuationCheckResult {
  const recomputedInputDigest = computeValuationInputDigest(record.inputRaw, record.rulesetDigest);
  const recomputed = computeDecisionDigest(recomputedInputDigest, record.output.actions);
  const passed = recomputed === record.output.decisionDigest;
  return {
    name: 'decisionDigestMatch',
    passed,
    category: 'hash-integrity',
    detail: passed ? undefined : `expected ${record.output.decisionDigest}, got ${recomputed}`,
  };
}

function checkInventoryStateHashMatch(record: ValuationDecisionRecordV1): ValuationCheckResult {
  const recomputed = hashInventoryState(record.inputCanonical.effectiveInventory);
  const passed = recomputed === record.output.inventoryStateHash;
  return {
    name: 'inventoryStateHashMatch',
    passed,
    category: 'hash-integrity',
    detail: passed ? undefined : `expected ${record.output.inventoryStateHash}, got ${recomputed}`,
  };
}

function checkRecordHashIntegrity(record: ValuationDecisionRecordV1): ValuationCheckResult {
  const recomputed = contentHash(canonicalize({
    recordVersion: 1,
    inputCanonical: record.inputCanonical,
    rulesetDigest: record.rulesetDigest,
    output: record.output,
  }));
  const passed = recomputed === record.decisionHash;
  return {
    name: 'recordHashIntegrity',
    passed,
    category: 'hash-integrity',
    detail: passed ? undefined : `expected ${record.decisionHash}, got ${recomputed}`,
  };
}

function checkRulesetDigestMatch(record: ValuationDecisionRecordV1): ValuationCheckResult {
  const recomputed = computeRulesetDigest(record.ruleset);
  const passed = recomputed === record.rulesetDigest;
  return {
    name: 'rulesetDigestMatch',
    passed,
    category: 'hash-integrity',
    detail: passed ? undefined : `expected ${record.rulesetDigest}, got ${recomputed}`,
  };
}

/** Run all 5 fast checks (hash-integrity category). Exported for full verifier reuse. */
export function runFastChecks(record: ValuationDecisionRecordV1): ValuationCheckResult[] {
  return [
    checkInputDigestMatch(record),
    checkDecisionDigestMatch(record),
    checkInventoryStateHashMatch(record),
    checkRecordHashIntegrity(record),
    checkRulesetDigestMatch(record),
  ];
}

/** Recompute all digests for diagnostic comparison. Exported for full verifier reuse. */
export function buildRecomputedDigests(record: ValuationDecisionRecordV1) {
  const valuationInputDigest = computeValuationInputDigest(record.inputRaw, record.rulesetDigest);
  const decisionDigest = computeDecisionDigest(valuationInputDigest, record.output.actions);
  const inventoryStateHash = hashInventoryState(record.inputCanonical.effectiveInventory);
  return { valuationInputDigest, decisionDigest, inventoryStateHash };
}

// ============================================================================
// Public API: Fast Verification (client-safe)
// ============================================================================

/**
 * Fast checks only: digest recomputation. Safe for client-side use.
 * Does NOT import or call the solver. 5 hash-integrity checks.
 */
export function verifyValuationFast(
  record: ValuationDecisionRecordV1,
): ValuationVerificationResultV1 {
  const start = performance.now();
  const checks = runFastChecks(record);
  const valid = checks.every(c => c.passed);
  const durationMs = Math.round(performance.now() - start);
  return {
    verificationVersion: 1,
    valid,
    checks,
    recomputedDigests: buildRecomputedDigests(record),
    durationMs,
  };
}
