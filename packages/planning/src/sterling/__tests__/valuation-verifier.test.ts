/**
 * Valuation Verifier Tests (Rig F Observability Layer)
 *
 * Tests proving:
 * - Fast path happy (valid record passes all fast checks)
 * - Full path happy (valid record passes all checks including replay)
 * - Tampered digest detection for each hash-integrity check
 * - Replay consistency (same input → matching output)
 * - Replay with mutated ruleset → replayConsistency fails + replayDiff
 * - recomputedDigests always populated
 * - Check categories correctly assigned
 * - verifyValuationFast does NOT run replay check
 * - Replay compares witness key bindings
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { computeValuationPlan } from '../minecraft-valuation';
import type { ValuationInput } from '../minecraft-valuation-types';
import {
  buildDefaultRuleset,
  computeRulesetDigest,
} from '../minecraft-valuation-rules';
import {
  createDecisionRecord,
  type ValuationDecisionRecordV1,
} from '../minecraft-valuation-record-types';
import {
  verifyValuationFast,
  verifyValuationFull,
} from '../minecraft-valuation-verifier-full';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ValuationInput> = {}): ValuationInput {
  return {
    inventory: { dirt: 1, cobblestone: 1, diamond: 1 },
    slotBudget: 10,
    protectedItems: [],
    protectedPrefixes: [],
    observedTokens: [],
    ...overrides,
  };
}

function makeValidRecord(inputOverrides: Partial<ValuationInput> = {}): ValuationDecisionRecordV1 {
  const input = makeInput(inputOverrides);
  const ruleset = buildDefaultRuleset();
  const rulesetDigest = computeRulesetDigest(ruleset);
  const output = computeValuationPlan(input, ruleset);
  return createDecisionRecord(input, ruleset, rulesetDigest, output);
}

/** Create a tampered copy of a record with specific field mutations */
function tamperRecord(
  record: ValuationDecisionRecordV1,
  mutations: Partial<ValuationDecisionRecordV1>,
): ValuationDecisionRecordV1 {
  return { ...record, ...mutations };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Rig F: Valuation Verifier', () => {

  // #1 — Fast path happy
  it('valid record passes all fast checks', () => {
    const record = makeValidRecord();
    const result = verifyValuationFast(record);
    expect(result.valid).toBe(true);
    expect(result.checks.length).toBe(5);
    expect(result.checks.every(c => c.passed)).toBe(true);
    expect(result.verificationVersion).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  // #2 — Full path happy
  it('valid record passes all checks (full)', () => {
    const record = makeValidRecord();
    const result = verifyValuationFull(record);
    expect(result.valid).toBe(true);
    expect(result.checks.length).toBe(6); // 5 fast + 1 replay
    expect(result.checks.every(c => c.passed)).toBe(true);
    expect(result.replayDiff).toBeUndefined();
  });

  // #3 — Tampered decisionDigest
  it('tampered decisionDigest → decisionDigestMatch fails (hash-integrity)', () => {
    const record = makeValidRecord();
    const tampered = tamperRecord(record, {
      output: { ...record.output, decisionDigest: 'deadbeef12345678' },
    });
    const result = verifyValuationFast(tampered);
    expect(result.valid).toBe(false);

    const failedCheck = result.checks.find(c => c.name === 'decisionDigestMatch');
    expect(failedCheck).toBeDefined();
    expect(failedCheck!.passed).toBe(false);
    expect(failedCheck!.category).toBe('hash-integrity');
    expect(failedCheck!.detail).toContain('deadbeef12345678');
  });

  // #4 — Tampered inventoryStateHash
  it('tampered inventoryStateHash → inventoryStateHashMatch fails', () => {
    const record = makeValidRecord();
    const tampered = tamperRecord(record, {
      output: { ...record.output, inventoryStateHash: 'badhash123456789' },
    });
    const result = verifyValuationFast(tampered);
    expect(result.valid).toBe(false);

    const failedCheck = result.checks.find(c => c.name === 'inventoryStateHashMatch');
    expect(failedCheck).toBeDefined();
    expect(failedCheck!.passed).toBe(false);
    expect(failedCheck!.category).toBe('hash-integrity');
  });

  // #5 — Tampered decisionHash
  it('tampered decisionHash → recordHashIntegrity fails', () => {
    const record = makeValidRecord();
    const tampered = tamperRecord(record, {
      decisionHash: 'corruptedhash123',
    });
    const result = verifyValuationFast(tampered);
    expect(result.valid).toBe(false);

    const failedCheck = result.checks.find(c => c.name === 'recordHashIntegrity');
    expect(failedCheck).toBeDefined();
    expect(failedCheck!.passed).toBe(false);
    expect(failedCheck!.category).toBe('hash-integrity');
  });

  // #6 — Tampered rulesetDigest vs embedded ruleset
  it('tampered rulesetDigest → rulesetDigestMatch fails', () => {
    const record = makeValidRecord();
    const tampered = tamperRecord(record, {
      rulesetDigest: 'wrongdigest12345',
    });
    const result = verifyValuationFast(tampered);

    const failedCheck = result.checks.find(c => c.name === 'rulesetDigestMatch');
    expect(failedCheck).toBeDefined();
    expect(failedCheck!.passed).toBe(false);
    expect(failedCheck!.category).toBe('hash-integrity');
  });

  // #7 — Replay consistency: same input → matching output
  it('replay consistency: same input produces matching output', () => {
    const record = makeValidRecord();
    const result = verifyValuationFull(record);

    const replayCheck = result.checks.find(c => c.name === 'replayConsistency');
    expect(replayCheck).toBeDefined();
    expect(replayCheck!.passed).toBe(true);
    expect(replayCheck!.category).toBe('semantic');
    expect(result.replayDiff).toBeUndefined();
  });

  // #8 — Replay with mutated ruleset → replayConsistency fails + replayDiff
  it('replay with mutated ruleset → replayConsistency fails + replayDiff populated', () => {
    // Create a record with default ruleset, then mutate the embedded ruleset
    // so replay produces different output
    const input = makeInput({
      inventory: { dirt: 5, cobblestone: 3, diamond: 1, sand: 2 },
      slotBudget: 2,
    });
    const ruleset = buildDefaultRuleset();
    const rulesetDigest = computeRulesetDigest(ruleset);
    const output = computeValuationPlan(input, ruleset);
    const record = createDecisionRecord(input, ruleset, rulesetDigest, output);

    // Mutate the embedded ruleset: change store score threshold
    // This makes replay produce different actions (store vs drop)
    const mutatedRuleset = {
      ...ruleset,
      storeMinScoreBp: 0, // Store everything instead of dropping
    };
    const tampered: ValuationDecisionRecordV1 = {
      ...record,
      ruleset: mutatedRuleset,
    };

    const result = verifyValuationFull(tampered);

    const replayCheck = result.checks.find(c => c.name === 'replayConsistency');
    expect(replayCheck).toBeDefined();
    expect(replayCheck!.passed).toBe(false);
    expect(replayCheck!.category).toBe('semantic');
    expect(result.replayDiff).toBeDefined();
    expect(result.replayDiff!.field).toBeDefined();
  });

  // #9 — recomputedDigests always populated
  it('recomputedDigests always populated (even on failure)', () => {
    const record = makeValidRecord();
    const tampered = tamperRecord(record, {
      decisionHash: 'corruptedhash123',
    });
    const result = verifyValuationFast(tampered);
    expect(result.valid).toBe(false);
    expect(result.recomputedDigests).toBeDefined();
    expect(result.recomputedDigests.valuationInputDigest).toBeDefined();
    expect(typeof result.recomputedDigests.valuationInputDigest).toBe('string');
    expect(result.recomputedDigests.decisionDigest).toBeDefined();
    expect(typeof result.recomputedDigests.decisionDigest).toBe('string');
    expect(result.recomputedDigests.inventoryStateHash).toBeDefined();
    expect(typeof result.recomputedDigests.inventoryStateHash).toBe('string');
  });

  // #10 — Check categories correctly assigned
  it('check categories are correctly assigned (hash-integrity vs semantic)', () => {
    const record = makeValidRecord();
    const fastResult = verifyValuationFast(record);
    const fullResult = verifyValuationFull(record);

    // All fast checks are hash-integrity
    for (const check of fastResult.checks) {
      expect(check.category).toBe('hash-integrity');
    }

    // Full verification has 5 hash-integrity + 1 semantic
    const hashChecks = fullResult.checks.filter(c => c.category === 'hash-integrity');
    const semanticChecks = fullResult.checks.filter(c => c.category === 'semantic');
    expect(hashChecks.length).toBe(5);
    expect(semanticChecks.length).toBe(1);
    expect(semanticChecks[0].name).toBe('replayConsistency');
  });

  // #11 — verifyValuationFast does NOT run replay check
  it('verifyValuationFast does NOT run replay check', () => {
    const record = makeValidRecord();
    const result = verifyValuationFast(record);

    const checkNames = result.checks.map(c => c.name);
    expect(checkNames).not.toContain('replayConsistency');
    expect(checkNames).toContain('inputDigestMatch');
    expect(checkNames).toContain('decisionDigestMatch');
    expect(checkNames).toContain('inventoryStateHashMatch');
    expect(checkNames).toContain('recordHashIntegrity');
    expect(checkNames).toContain('rulesetDigestMatch');
    expect(result.checks.length).toBe(5);
  });

  // #12 — Replay compares witness key bindings
  it('replay compares witness key bindings (policy knobs, slot counts)', () => {
    const record = makeValidRecord();
    const result = verifyValuationFull(record);

    // Valid record should pass — witness bindings match
    const replayCheck = result.checks.find(c => c.name === 'replayConsistency');
    expect(replayCheck!.passed).toBe(true);

    // Verify the record has the witness fields that replay checks
    expect(record.output.witness.slotModel).toBe('distinct-item-keys-v1');
    expect(record.output.witness.unknownItemPolicy).toBe('fail-closed-v1');
    expect(record.output.witness.countPolicy).toBe('whole-stack-v1');
    expect(typeof record.output.witness.occupiedSlotsBefore).toBe('number');
    expect(typeof record.output.witness.occupiedSlotsAfter).toBe('number');
  });

  // Additional: over-budget scenario with stores passes verification
  it('over-budget scenario with store eligibility passes full verification', () => {
    const record = makeValidRecord({
      inventory: { dirt: 5, cobblestone: 3, diamond: 1, coal: 2, sand: 4 },
      slotBudget: 2,
      observedTokens: ['proximity:container:chest_1'],
    });
    expect(record.output.solved).toBe(true);
    expect(record.output.actions.some(a => a.actionType === 'store')).toBe(true);

    const result = verifyValuationFull(record);
    expect(result.valid).toBe(true);
  });

  // Additional: error plan passes verification
  it('error plan (solved:false) passes full verification', () => {
    const record = makeValidRecord({
      inventory: { dirt: 1, cobblestone: 1, mystery_ore: 1 },
      slotBudget: 1,
    });
    expect(record.output.solved).toBe(false);

    const result = verifyValuationFull(record);
    expect(result.valid).toBe(true);
  });
});
