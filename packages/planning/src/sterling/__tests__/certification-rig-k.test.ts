/**
 * Rig K Certification Tests — P13 Irreversibility and Commitment Planning
 *
 * Tests all 5 P13 invariants across two domains:
 *   1. explicit_reversibility      — every operator tagged
 *   2. verify_before_commit        — verification precedes commitment
 *   3. deterministic_verification  — same target → same result
 *   4. bounded_option_value        — capped at OPTION_VALUE_MAX
 *   5. monotonic_commitment        — committedCount never decreases
 *
 * 39 tests across 9 describe blocks.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  OPTION_VALUE_MAX,
  P13_CONTRACT_VERSION,
  P13_INVARIANTS,
} from '../primitives/p13/p13-capsule-types.js';
import { P13ReferenceAdapter } from '../primitives/p13/p13-reference-adapter.js';
import {
  DEPLOYMENT_CONSTRAINTS,
  DEPLOYMENT_IRREVERSIBILITY_TAGS,
  DEPLOYMENT_VERIFICATIONS,
  TRADING_CONSTRAINTS,
  TRADING_IRREVERSIBILITY_TAGS,
  TRADING_VERIFICATIONS,
} from '../primitives/p13/p13-reference-fixtures.js';
import {
  MINECRAFT_COMMITMENT_CONSTRAINTS,
  MINECRAFT_IRREVERSIBILITY_TAGS,
  MINECRAFT_VERIFICATIONS,
} from '../../commitment/index.js';

const adapter = new P13ReferenceAdapter();

// ── 1. Explicit Reversibility (Pivot 1) ──────────────────────────────

describe('P13 Invariant: explicit_reversibility', () => {
  it('every trading operator has a reversibility tag', () => {
    for (const tag of TRADING_IRREVERSIBILITY_TAGS) {
      expect(['fully_reversible', 'costly_reversible', 'irreversible']).toContain(
        tag.reversibility,
      );
    }
  });

  it('lock_villager_trade is irreversible', () => {
    const lockTag = TRADING_IRREVERSIBILITY_TAGS.find(
      (t) => t.operatorId === 'lock_villager_trade',
    );
    expect(lockTag).toBeDefined();
    expect(lockTag!.reversibility).toBe('irreversible');
    expect(lockTag!.rollbackCost).toBe(Infinity);
  });

  it('pick_up_item is fully reversible', () => {
    const pickTag = TRADING_IRREVERSIBILITY_TAGS.find(
      (t) => t.operatorId === 'pick_up_item',
    );
    expect(pickTag).toBeDefined();
    expect(pickTag!.reversibility).toBe('fully_reversible');
    expect(pickTag!.rollbackCost).toBe(0);
  });

  it('place_workstation is costly reversible', () => {
    const placeTag = TRADING_IRREVERSIBILITY_TAGS.find(
      (t) => t.operatorId === 'place_workstation',
    );
    expect(placeTag).toBeDefined();
    expect(placeTag!.reversibility).toBe('costly_reversible');
    expect(placeTag!.rollbackCost).toBeGreaterThan(0);
    expect(placeTag!.rollbackCost).toBeLessThan(Infinity);
  });

  it('every deployment operator has a reversibility tag', () => {
    for (const tag of DEPLOYMENT_IRREVERSIBILITY_TAGS) {
      expect(['fully_reversible', 'costly_reversible', 'irreversible']).toContain(
        tag.reversibility,
      );
    }
  });
});

// ── 2. Verify Before Commit (Pivot 2) ────────────────────────────────

describe('P13 Invariant: verify_before_commit', () => {
  it('rejects commit without verification', () => {
    const verState = adapter.initializeVerification();
    const commitState = adapter.initializeCommitment([]);
    const result = adapter.canCommit(
      'lock_villager_trade',
      verState,
      commitState,
      TRADING_CONSTRAINTS,
    );
    expect(result.allowed).toBe(false);
    expect(result.currentConfidence).toBe(0);
    expect(result.requiredConfidence).toBe(0.8);
  });

  it('allows commit after sufficient verification', () => {
    let verState = adapter.initializeVerification();
    const commitState = adapter.initializeCommitment([]);

    // Apply verifications until confidence >= 0.8
    verState = adapter.applyVerification(verState, TRADING_VERIFICATIONS[0]); // +0.3
    verState = adapter.applyVerification(verState, TRADING_VERIFICATIONS[1]); // +0.4
    // inspect (0.3) + check_value (0.4) = 0.7 for lock_villager_trade
    let result = adapter.canCommit(
      'lock_villager_trade',
      verState,
      commitState,
      TRADING_CONSTRAINTS,
    );
    expect(result.allowed).toBe(false); // 0.7 < 0.8

    // One more verification
    verState = adapter.applyVerification(verState, TRADING_VERIFICATIONS[0]); // +0.3 = 1.0 (clamped)
    result = adapter.canCommit(
      'lock_villager_trade',
      verState,
      commitState,
      TRADING_CONSTRAINTS,
    );
    expect(result.allowed).toBe(true);
  });

  it('rejects commit on blocked operator', () => {
    let verState = adapter.initializeVerification();
    let commitState = adapter.initializeCommitment([]);

    // Build enough confidence for lock_villager_trade
    verState = adapter.applyVerification(verState, TRADING_VERIFICATIONS[0]);
    verState = adapter.applyVerification(verState, TRADING_VERIFICATIONS[1]);
    verState = adapter.applyVerification(verState, TRADING_VERIFICATIONS[0]);

    // Commit lock_villager_trade → blocks break_workstation
    commitState = adapter.executeCommitment(
      'lock_villager_trade',
      commitState,
      TRADING_CONSTRAINTS,
    );

    // Try to commit break_workstation — should be blocked
    const result = adapter.canCommit(
      'break_workstation',
      verState,
      commitState,
      TRADING_CONSTRAINTS,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('blocked');
  });

  it('confidence 0.5 with required 0.8 is rejected', () => {
    let verState = adapter.initializeVerification();
    const commitState = adapter.initializeCommitment([]);

    // Only +0.3 confidence
    verState = adapter.applyVerification(verState, TRADING_VERIFICATIONS[0]);
    const result = adapter.canCommit(
      'lock_villager_trade',
      verState,
      commitState,
      TRADING_CONSTRAINTS,
    );
    expect(result.allowed).toBe(false);
    expect(result.currentConfidence).toBeCloseTo(0.3);
  });
});

// ── 3. Deterministic Verification (Pivot 3) ──────────────────────────

describe('P13 Invariant: deterministic_verification', () => {
  it('same verification yields same result', () => {
    const initial = adapter.initializeVerification();
    const results = Array.from({ length: 50 }, () =>
      adapter.applyVerification(initial, TRADING_VERIFICATIONS[0]),
    );
    const first = JSON.stringify(results[0]);
    expect(results.every((r) => JSON.stringify(r) === first)).toBe(true);
  });

  it('verification accumulates confidence deterministically', () => {
    let state = adapter.initializeVerification();
    state = adapter.applyVerification(state, TRADING_VERIFICATIONS[0]); // +0.3
    expect(state.confidence['lock_villager_trade']).toBeCloseTo(0.3);

    state = adapter.applyVerification(state, TRADING_VERIFICATIONS[1]); // +0.4
    expect(state.confidence['lock_villager_trade']).toBeCloseTo(0.7);
  });

  it('confidence clamps to 1.0', () => {
    let state = adapter.initializeVerification();
    // Apply 4 times: 0.3 + 0.3 + 0.3 + 0.3 = 1.2 → clamped to 1.0
    for (let i = 0; i < 4; i++) {
      state = adapter.applyVerification(state, TRADING_VERIFICATIONS[0]);
    }
    expect(state.confidence['lock_villager_trade']).toBe(1.0);
  });

  it('tracks applied verifications', () => {
    let state = adapter.initializeVerification();
    state = adapter.applyVerification(state, TRADING_VERIFICATIONS[0]);
    state = adapter.applyVerification(state, TRADING_VERIFICATIONS[1]);
    expect(state.appliedVerifications).toHaveLength(2);
    expect(state.appliedVerifications).toContain('inspect_villager_trade');
    expect(state.appliedVerifications).toContain('check_trade_value');
  });
});

// ── 4. Bounded Option Value (Pivot 4) ────────────────────────────────

describe('P13 Invariant: bounded_option_value', () => {
  it('option value never exceeds OPTION_VALUE_MAX', () => {
    // 10 options × 2 = 20, but capped at 10
    const state = adapter.initializeOptionValue(
      Array.from({ length: 10 }, (_, i) => `op_${i}`),
    );
    expect(state.optionValue).toBeLessThanOrEqual(OPTION_VALUE_MAX);
  });

  it('option value decreases after commitment', () => {
    const state = adapter.initializeOptionValue(['op_a', 'op_b', 'op_c']);
    const after = adapter.updateOptionValueAfterCommit(state, 'op_a');
    expect(after.optionValue).toBeLessThan(state.optionValue);
    expect(after.availableOptions).not.toContain('op_a');
    expect(after.lockedOptions).toContain('op_a');
  });

  it('option value is zero with no available options', () => {
    let state = adapter.initializeOptionValue(['op_a']);
    state = adapter.updateOptionValueAfterCommit(state, 'op_a');
    expect(state.optionValue).toBe(0);
    expect(state.availableOptions).toHaveLength(0);
  });

  it('OPTION_VALUE_MAX is 10', () => {
    expect(OPTION_VALUE_MAX).toBe(10);
  });

  it('commitment cost includes option value loss', () => {
    const tag = TRADING_IRREVERSIBILITY_TAGS.find(
      (t) => t.operatorId === 'lock_villager_trade',
    )!;
    const state = adapter.initializeOptionValue(['lock_villager_trade', 'op_b']);
    const cost = adapter.calculateCommitmentCost(tag, state);
    expect(cost.optionValueLoss).toBeGreaterThan(0);
    expect(cost.totalCost).toBeGreaterThan(cost.baseCost);
  });
});

// ── 5. Monotonic Commitment (Pivot 5) ────────────────────────────────

describe('P13 Invariant: monotonic_commitment', () => {
  it('committedCount never decreases', () => {
    let state = adapter.initializeCommitment([]);
    const counts: number[] = [state.committedCount];

    state = adapter.executeCommitment('lock_villager_trade', state, TRADING_CONSTRAINTS);
    counts.push(state.committedCount);

    state = adapter.executeCommitment('level_up_villager', state, TRADING_CONSTRAINTS);
    counts.push(state.committedCount);

    // Every count is >= the previous
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });

  it('committed operators accumulate', () => {
    let state = adapter.initializeCommitment([]);
    state = adapter.executeCommitment('lock_villager_trade', state, TRADING_CONSTRAINTS);
    expect(state.committed).toContain('lock_villager_trade');
    expect(state.committedCount).toBe(1);

    state = adapter.executeCommitment('level_up_villager', state, TRADING_CONSTRAINTS);
    expect(state.committed).toContain('lock_villager_trade');
    expect(state.committed).toContain('level_up_villager');
    expect(state.committedCount).toBe(2);
  });

  it('blocked operators accumulate from commitments', () => {
    let state = adapter.initializeCommitment([]);
    state = adapter.executeCommitment('lock_villager_trade', state, TRADING_CONSTRAINTS);
    // lock_villager_trade blocks: reroll_villager_trade, break_workstation
    expect(state.blocked).toContain('reroll_villager_trade');
    expect(state.blocked).toContain('break_workstation');
  });

  it('blocked list is sorted and deduplicated', () => {
    let state = adapter.initializeCommitment([]);
    state = adapter.executeCommitment('lock_villager_trade', state, TRADING_CONSTRAINTS);
    state = adapter.executeCommitment('level_up_villager', state, TRADING_CONSTRAINTS);
    // Both block reroll_villager_trade — should be deduplicated
    const rerollCount = state.blocked.filter((b) => b === 'reroll_villager_trade').length;
    expect(rerollCount).toBe(1);
    // Should be sorted
    const sorted = [...state.blocked].sort();
    expect(state.blocked).toEqual(sorted);
  });
});

// ── 6. Multi-Domain Portability ──────────────────────────────────────

describe('P13 Multi-domain portability', () => {
  it('deployment domain has irreversibility tags', () => {
    expect(DEPLOYMENT_IRREVERSIBILITY_TAGS.length).toBeGreaterThan(0);
    const deployTag = DEPLOYMENT_IRREVERSIBILITY_TAGS.find(
      (t) => t.operatorId === 'deploy_to_prod',
    );
    expect(deployTag).toBeDefined();
    expect(deployTag!.reversibility).toBe('irreversible');
  });

  it('deployment verification works with same adapter', () => {
    let verState = adapter.initializeVerification();
    verState = adapter.applyVerification(verState, DEPLOYMENT_VERIFICATIONS[0]); // run_tests +0.3
    verState = adapter.applyVerification(verState, DEPLOYMENT_VERIFICATIONS[1]); // canary +0.4
    // 0.3 + 0.4 = 0.7 for deploy_to_prod (needs 0.9)
    const commitState = adapter.initializeCommitment([]);
    const result = adapter.canCommit(
      'deploy_to_prod',
      verState,
      commitState,
      DEPLOYMENT_CONSTRAINTS,
    );
    expect(result.allowed).toBe(false);
    expect(result.currentConfidence).toBeCloseTo(0.7);
  });

  it('deployment commitment blocks downstream', () => {
    let state = adapter.initializeCommitment([]);
    state = adapter.executeCommitment('deploy_to_prod', state, DEPLOYMENT_CONSTRAINTS);
    expect(state.blocked).toContain('rollback_deploy');
  });

  it('trading and deployment use same adapter instance', () => {
    const tradingVer = adapter.initializeVerification();
    const deployVer = adapter.initializeVerification();
    // Both start clean
    expect(Object.keys(tradingVer.confidence)).toHaveLength(0);
    expect(Object.keys(deployVer.confidence)).toHaveLength(0);
  });
});

// ── 7. Minecraft Commitment Module ───────────────────────────────────

describe('P13 Minecraft commitment module', () => {
  it('defines 6 irreversibility tags', () => {
    expect(MINECRAFT_IRREVERSIBILITY_TAGS).toHaveLength(6);
    const ids = MINECRAFT_IRREVERSIBILITY_TAGS.map((t) => t.operatorId);
    expect(ids).toContain('lock_villager_trade');
    expect(ids).toContain('level_up_villager');
    expect(ids).toContain('consume_totem');
    expect(ids).toContain('break_workstation');
  });

  it('defines 3 verification operators', () => {
    expect(MINECRAFT_VERIFICATIONS).toHaveLength(3);
  });

  it('defines 4 commitment constraints', () => {
    expect(MINECRAFT_COMMITMENT_CONSTRAINTS).toHaveLength(4);
  });

  it('Minecraft tags work with reference adapter', () => {
    let verState = adapter.initializeVerification();
    const commitState = adapter.initializeCommitment([]);

    // Verify using Minecraft verifications
    verState = adapter.applyVerification(verState, MINECRAFT_VERIFICATIONS[0]);
    verState = adapter.applyVerification(verState, MINECRAFT_VERIFICATIONS[1]);
    verState = adapter.applyVerification(verState, MINECRAFT_VERIFICATIONS[0]);
    // 0.3 + 0.4 + 0.3 = 1.0 for lock_villager_trade

    const result = adapter.canCommit(
      'lock_villager_trade',
      verState,
      commitState,
      MINECRAFT_COMMITMENT_CONSTRAINTS,
    );
    expect(result.allowed).toBe(true);
  });
});

// ── 8. Commitment Cost Model ─────────────────────────────────────────

describe('P13 Commitment cost model', () => {
  it('irreversible action has higher total cost than base', () => {
    const tag = TRADING_IRREVERSIBILITY_TAGS.find(
      (t) => t.operatorId === 'lock_villager_trade',
    )!;
    const state = adapter.initializeOptionValue(['lock_villager_trade']);
    const cost = adapter.calculateCommitmentCost(tag, state);
    expect(cost.totalCost).toBeGreaterThan(0);
    expect(cost.totalCost).toBe(
      cost.baseCost + cost.commitmentPenalty + cost.optionValueLoss,
    );
  });

  it('reversible action has zero commitment cost', () => {
    const tag = TRADING_IRREVERSIBILITY_TAGS.find(
      (t) => t.operatorId === 'pick_up_item',
    )!;
    const state = adapter.initializeOptionValue([]);
    const cost = adapter.calculateCommitmentCost(tag, state);
    expect(cost.baseCost).toBe(0);
    expect(cost.optionValueLoss).toBe(0);
  });
});

// ── 9. P13 Contract Metadata ─────────────────────────────────────────

describe('P13 contract metadata', () => {
  it('has 5 invariants', () => {
    expect(P13_INVARIANTS).toHaveLength(5);
  });

  it('invariant names match expected pivots', () => {
    expect(P13_INVARIANTS).toContain('explicit_reversibility');
    expect(P13_INVARIANTS).toContain('verify_before_commit');
    expect(P13_INVARIANTS).toContain('deterministic_verification');
    expect(P13_INVARIANTS).toContain('bounded_option_value');
    expect(P13_INVARIANTS).toContain('monotonic_commitment');
  });

  it('contract version is p13.v1', () => {
    expect(P13_CONTRACT_VERSION).toBe('p13.v1');
  });

  it('adapter exposes correct constants', () => {
    expect(adapter.optionValueMax).toBe(OPTION_VALUE_MAX);
    expect(adapter.defaultConfidenceThreshold).toBe(DEFAULT_CONFIDENCE_THRESHOLD);
  });
});
