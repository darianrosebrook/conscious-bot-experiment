/**
 * Valuation Decision Verifier — Full Verification (Rig F Observability Layer)
 *
 * Server/test-only module: fast checks + hard replay via computeValuationPlan.
 * This module imports the solver — it must NEVER be imported from client/browser code.
 *
 * Import `minecraft-valuation-verifier-fast` instead for client-safe verification.
 *
 * @author @darianrosebrook
 */

import { computeValuationPlan } from './minecraft-valuation';
import {
  runFastChecks,
  buildRecomputedDigests,
  verifyValuationFast,
} from './minecraft-valuation-verifier-fast';
import type {
  ValuationDecisionRecordV1,
  ValuationCheckResult,
  ValuationVerificationResultV1,
} from './minecraft-valuation-record-types';

// Re-export fast verifier so test files can import everything from one place
export { verifyValuationFast } from './minecraft-valuation-verifier-fast';

// ============================================================================
// Public API: Full Verification (server/test only)
// ============================================================================

/**
 * Full verification: fast checks + hard replay. Server/test use only.
 * Imports computeValuationPlan and replays the decision, comparing:
 * - decisionDigest
 * - actions (deep equality)
 * - key witness bindings (policy knobs, slot counts, lint codes)
 *
 * On mismatch, populates replayDiff with the first divergence.
 */
export function verifyValuationFull(
  record: ValuationDecisionRecordV1,
): ValuationVerificationResultV1 {
  const start = performance.now();

  // Run fast checks first
  const fastChecks = runFastChecks(record);

  // Hard replay check: re-run the solver with the same inputs/ruleset
  const replayOutput = computeValuationPlan(record.inputRaw, record.ruleset);
  let replayDiff: { field: string; expected: string; actual: string } | undefined;

  // Compare decisionDigest first (fastest divergence signal)
  let replayPassed = replayOutput.decisionDigest === record.output.decisionDigest;

  if (!replayPassed) {
    replayDiff = {
      field: 'decisionDigest',
      expected: record.output.decisionDigest,
      actual: replayOutput.decisionDigest,
    };
  }

  // If digests match, deep-compare actions for extra confidence
  if (replayPassed) {
    const origActions = JSON.stringify(record.output.actions);
    const replayActions = JSON.stringify(replayOutput.actions);
    if (origActions !== replayActions) {
      replayPassed = false;
      replayDiff = {
        field: 'actions',
        expected: `${record.output.actions.length} actions`,
        actual: `${replayOutput.actions.length} actions (content differs)`,
      };
    }
  }

  // Compare key witness bindings
  if (replayPassed) {
    const origW = record.output.witness;
    const replayW = replayOutput.witness;

    const witnessChecks: [string, unknown, unknown][] = [
      ['witness.slotModel', origW.slotModel, replayW.slotModel],
      ['witness.unknownItemPolicy', origW.unknownItemPolicy, replayW.unknownItemPolicy],
      ['witness.countPolicy', origW.countPolicy, replayW.countPolicy],
      ['witness.occupiedSlotsBefore', origW.occupiedSlotsBefore, replayW.occupiedSlotsBefore],
      ['witness.occupiedSlotsAfter', origW.occupiedSlotsAfter, replayW.occupiedSlotsAfter],
      ['witness.rulesetLintIssueCodes', JSON.stringify(origW.rulesetLintIssueCodes), JSON.stringify(replayW.rulesetLintIssueCodes)],
    ];

    for (const [field, expected, actual] of witnessChecks) {
      if (expected !== actual) {
        replayPassed = false;
        replayDiff = {
          field,
          expected: String(expected),
          actual: String(actual),
        };
        break;
      }
    }
  }

  const replayCheck: ValuationCheckResult = {
    name: 'replayConsistency',
    passed: replayPassed,
    category: 'semantic',
    detail: replayPassed ? undefined : `replay diverged at ${replayDiff?.field}`,
  };

  const allChecks = [...fastChecks, replayCheck];
  const valid = allChecks.every(c => c.passed);
  const durationMs = Math.round(performance.now() - start);

  return {
    verificationVersion: 1,
    valid,
    checks: allChecks,
    recomputedDigests: buildRecomputedDigests(record),
    replayDiff: replayPassed ? undefined : replayDiff,
    durationMs,
  };
}
