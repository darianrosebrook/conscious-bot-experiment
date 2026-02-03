/**
 * Valuation Unit Tests (Rig F — F.1–F.9 + digest contracts + hardening)
 *
 * Tests covering:
 * - F.1: Determinism (same input → identical output)
 * - F.2: Tie-breaking (by item name ascending)
 * - F.3: Explicit scarcity (under-budget: all kept; over-budget: lowest dropped)
 * - F.6: Store gating (proximity token required, lexicographic-min token)
 * - F.7: Fail-closed (unknown items in over-budget → error)
 * - F.8: Protected items never dropped
 * - D2: Order-insensitive decision digest, reasonCodes decision-binding
 * - D5: cap: token boundary filtering
 * - Digest stability, binding, score-invariance, input normalization
 * - Policy knob binding (slotModel, unknownItemPolicy, countPolicy)
 * - Policy knob fail-closed guards (UNSUPPORTED_POLICY)
 * - Ruleset lint (shadowing hazards, issue codes in witness)
 * - Store eligibility witness fields
 * - countBasis on all actions
 * - Shared normalization (deriveEffectiveInventory)
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { computeValuationPlan } from '../minecraft-valuation';
import {
  computeDecisionDigest,
  computeValuationInputDigest,
  deriveEffectiveInventory,
  type ValuationInput,
  type ValuationRulesetV1,
  type InventoryActionV1,
} from '../minecraft-valuation-types';
import {
  buildDefaultRuleset,
  computeRulesetDigest,
  lintClassificationTable,
} from '../minecraft-valuation-rules';

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

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Rig F: Valuation under scarcity', () => {

  // #1 — F.1 determinism
  it('same input produces identical output (run twice, deep-equal)', () => {
    const input = makeInput({
      inventory: { dirt: 10, cobblestone: 5, diamond: 3, rotten_flesh: 2 },
      slotBudget: 2,
    });
    const plan1 = computeValuationPlan(input);
    const plan2 = computeValuationPlan(input);
    expect(plan1).toStrictEqual(plan2);
  });

  // #2 — F.2 tie-break
  it('tied scores break by item name ascending', () => {
    // Both dirt and gravel are low_value (2500). With budget=1, both need eviction
    // but only one can stay. 'dirt' < 'gravel' lexicographically, so dirt is evicted first.
    const input = makeInput({
      inventory: { dirt: 1, gravel: 1, diamond: 1 },
      slotBudget: 2,
    });
    const plan = computeValuationPlan(input);
    expect(plan.solved).toBe(true);

    const dropped = plan.actions.filter(a => a.actionType === 'drop');
    expect(dropped.length).toBe(1);
    expect(dropped[0].item).toBe('dirt'); // 'dirt' < 'gravel', evicted first
  });

  // #3 — F.3 under-budget: all items kept, no drops
  it('under-budget: all items kept, no drops', () => {
    const input = makeInput({
      inventory: { dirt: 10, cobblestone: 5, diamond: 3 },
      slotBudget: 10,
    });
    const plan = computeValuationPlan(input);
    expect(plan.solved).toBe(true);
    expect(plan.actions.every(a => a.actionType === 'keep')).toBe(true);
    expect(plan.actions.length).toBe(3);
    expect(plan.witness.droppedItems).toStrictEqual([]);
    expect(plan.witness.storedItems).toStrictEqual([]);
    // Under-budget items get UNDER_BUDGET reason
    for (const action of plan.actions) {
      expect(action.reasonCodes).toContain('UNDER_BUDGET');
    }
  });

  // #4 — F.3 + scoring: over-budget, lowest-scored items dropped first
  it('over-budget: lowest-scored items dropped first', () => {
    // rotten_flesh=500, dirt=2500, cobblestone=5000, diamond=7500
    const input = makeInput({
      inventory: { rotten_flesh: 1, dirt: 1, cobblestone: 1, diamond: 1 },
      slotBudget: 2,
    });
    const plan = computeValuationPlan(input);
    expect(plan.solved).toBe(true);

    const dropped = plan.actions
      .filter(a => a.actionType === 'drop')
      .map(a => a.item)
      .sort();
    expect(dropped).toStrictEqual(['dirt', 'rotten_flesh']);

    const kept = plan.actions
      .filter(a => a.actionType === 'keep')
      .map(a => a.item)
      .sort();
    expect(kept).toStrictEqual(['cobblestone', 'diamond']);
  });

  // #5 — F.7 strict fail-closed: over-budget + unknowns → error
  it('over-budget with unknowns → solved:false, UNKNOWN_ITEM_VALUATION', () => {
    const input = makeInput({
      inventory: { dirt: 1, mystery_item: 1, diamond: 1 },
      slotBudget: 2,
    });
    const plan = computeValuationPlan(input);
    expect(plan.solved).toBe(false);
    expect(plan.error).toBe('UNKNOWN_ITEM_VALUATION');
    expect(plan.actions).toStrictEqual([]);
    expect(plan.witness.unknownItems).toContain('mystery_item');
  });

  // #6 — F.7 under-budget pass-through: unknowns kept with UNKNOWN_ITEM_KEPT
  it('under-budget with unknowns → solved:true, unknowns kept with UNKNOWN_ITEM_KEPT', () => {
    const input = makeInput({
      inventory: { mystery_item: 1, diamond: 1 },
      slotBudget: 10,
    });
    const plan = computeValuationPlan(input);
    expect(plan.solved).toBe(true);

    const mysteryAction = plan.actions.find(a => a.item === 'mystery_item');
    expect(mysteryAction).toBeDefined();
    expect(mysteryAction!.actionType).toBe('keep');
    expect(mysteryAction!.reasonCodes).toContain('UNKNOWN_ITEM_KEPT');
    expect(mysteryAction!.score).toBeNull();
  });

  // #7 — F.8 protected item never dropped even when lowest scored
  it('protected item never dropped even when lowest scored', () => {
    // rotten_flesh is junk (500) but protected — should survive
    const input = makeInput({
      inventory: { rotten_flesh: 1, dirt: 1, diamond: 1 },
      slotBudget: 2,
      protectedItems: ['rotten_flesh'],
    });
    const plan = computeValuationPlan(input);
    expect(plan.solved).toBe(true);

    const fleshAction = plan.actions.find(a => a.item === 'rotten_flesh');
    expect(fleshAction).toBeDefined();
    expect(fleshAction!.actionType).toBe('keep');
    expect(fleshAction!.reasonCodes).toContain('PROTECTED_EXPLICIT');

    // dirt should be dropped instead
    const dirtAction = plan.actions.find(a => a.item === 'dirt');
    expect(dirtAction).toBeDefined();
    expect(dirtAction!.actionType).toBe('drop');
  });

  // #8 — F.6 store gating: store action when proximity token present
  it('store action only when proximity:container:* token present', () => {
    // cobblestone=5000 which is >= DEFAULT_STORE_MIN_SCORE_BP (3000)
    const input = makeInput({
      inventory: { cobblestone: 1, diamond: 1 },
      slotBudget: 1,
      observedTokens: ['proximity:container:chest'],
    });
    const plan = computeValuationPlan(input);
    expect(plan.solved).toBe(true);

    const storeAction = plan.actions.find(a => a.actionType === 'store');
    expect(storeAction).toBeDefined();
    expect(storeAction!.item).toBe('cobblestone');
    expect(storeAction!.reasonCodes).toContain('LOW_VALUE_STORE');
  });

  // #9 — F.6 negative: no store when proximity token absent
  it('no store action when proximity token absent', () => {
    const input = makeInput({
      inventory: { cobblestone: 1, diamond: 1 },
      slotBudget: 1,
      observedTokens: [],
    });
    const plan = computeValuationPlan(input);
    expect(plan.solved).toBe(true);

    const storeAction = plan.actions.find(a => a.actionType === 'store');
    expect(storeAction).toBeUndefined();

    // cobblestone should be dropped instead
    const dropAction = plan.actions.find(a => a.actionType === 'drop');
    expect(dropAction).toBeDefined();
    expect(dropAction!.item).toBe('cobblestone');
  });

  // #10 — D2 order-insensitive digest
  it('permuted action array produces same decisionDigest', () => {
    const ruleset = buildDefaultRuleset();
    const rulesetDigest = computeRulesetDigest(ruleset);
    const input = makeInput();
    const valuationInputDigest = computeValuationInputDigest(input, rulesetDigest);

    const actionsA: InventoryActionV1[] = [
      { actionType: 'keep', item: 'diamond', count: 1, countBasis: 'all', reasonCodes: ['HIGH_VALUE'], score: 7500 },
      { actionType: 'drop', item: 'dirt', count: 1, countBasis: 'all', reasonCodes: ['LOW_VALUE_DROP'], score: 2500 },
      { actionType: 'keep', item: 'cobblestone', count: 1, countBasis: 'all', reasonCodes: ['HIGH_VALUE'], score: 5000 },
    ];

    const actionsB: InventoryActionV1[] = [
      { actionType: 'drop', item: 'dirt', count: 1, countBasis: 'all', reasonCodes: ['LOW_VALUE_DROP'], score: 2500 },
      { actionType: 'keep', item: 'cobblestone', count: 1, countBasis: 'all', reasonCodes: ['HIGH_VALUE'], score: 5000 },
      { actionType: 'keep', item: 'diamond', count: 1, countBasis: 'all', reasonCodes: ['HIGH_VALUE'], score: 7500 },
    ];

    const digestA = computeDecisionDigest(valuationInputDigest, actionsA);
    const digestB = computeDecisionDigest(valuationInputDigest, actionsB);
    expect(digestA).toBe(digestB);
  });

  // #11 — Digest stability: changing classification table changes rulesetDigest
  it('changing classification table changes rulesetDigest', () => {
    const rulesetA = buildDefaultRuleset();
    const rulesetB: ValuationRulesetV1 = {
      ...rulesetA,
      classificationTable: [
        ...rulesetA.classificationTable,
        { pattern: 'netherite_ingot', matchKind: 'exact' as const, class: 'high_value' as const, scoreBp: 9000 },
      ],
    };

    const digestA = computeRulesetDigest(rulesetA);
    const digestB = computeRulesetDigest(rulesetB);
    expect(digestA).not.toBe(digestB);
  });

  // #12 — valuationInputDigest binds rulesetDigest
  it('valuationInputDigest binds rulesetDigest (different ruleset → different input digest)', () => {
    const input = makeInput();
    const rulesetA = buildDefaultRuleset();
    const rulesetB: ValuationRulesetV1 = {
      ...rulesetA,
      storeMinScoreBp: 9999,
    };

    const digestA = computeValuationInputDigest(input, computeRulesetDigest(rulesetA));
    const digestB = computeValuationInputDigest(input, computeRulesetDigest(rulesetB));
    expect(digestA).not.toBe(digestB);
  });

  // #13 — D5 cap: tokens excluded from slot count and emitted actions
  it('cap: tokens excluded from slot count and emitted actions', () => {
    const input = makeInput({
      inventory: {
        'cap:has_wooden_pickaxe': 1,
        'cap:has_stone_pickaxe': 1,
        dirt: 1,
        diamond: 1,
      },
      slotBudget: 10,
    });
    const plan = computeValuationPlan(input);
    expect(plan.solved).toBe(true);

    // cap: tokens should not appear in actions
    const capActions = plan.actions.filter(a => a.item.startsWith('cap:'));
    expect(capActions.length).toBe(0);

    // Only dirt and diamond should have actions
    expect(plan.actions.length).toBe(2);

    // Witness should record excluded tokens
    expect(plan.witness.nonSlotTokensExcluded).toContain('cap:has_wooden_pickaxe');
    expect(plan.witness.nonSlotTokensExcluded).toContain('cap:has_stone_pickaxe');

    // Occupied slots should only count non-cap items
    expect(plan.witness.occupiedSlotsBefore).toBe(2);
  });

  // #14 — Protected items exceeding budget → error
  it('protected items exceeding budget → solved:false, INSUFFICIENT_CAPACITY_PROTECTED', () => {
    const input = makeInput({
      inventory: { diamond: 1, iron_ingot: 1, gold_ingot: 1 },
      slotBudget: 2,
      protectedItems: ['diamond', 'iron_ingot', 'gold_ingot'],
    });
    const plan = computeValuationPlan(input);
    expect(plan.solved).toBe(false);
    expect(plan.error).toBe('INSUFFICIENT_CAPACITY_PROTECTED');
    expect(plan.actions).toStrictEqual([]);
    expect(plan.witness.protectedItems).toStrictEqual(['diamond', 'gold_ingot', 'iron_ingot']);
  });

  // ── Hardening tests (policy knobs, lint, digest intent) ─────────────────

  // #15 — Policy knobs bound in rulesetDigest: changing slotModel changes digest
  it('changing slotModel changes rulesetDigest', () => {
    const rulesetA = buildDefaultRuleset();
    // Simulate a hypothetical future slot model by casting
    const rulesetB: ValuationRulesetV1 = {
      ...rulesetA,
      slotModel: 'distinct-item-keys-v1' as any, // same value → same digest
    };
    const rulesetC = {
      ...rulesetA,
      slotModel: 'stack-aware-v2' as any, // different value → different digest
    };

    expect(computeRulesetDigest(rulesetA)).toBe(computeRulesetDigest(rulesetB));
    expect(computeRulesetDigest(rulesetA)).not.toBe(computeRulesetDigest(rulesetC));
  });

  // #16 — Policy knobs appear in witness
  it('witness contains policy knobs (slotModel, unknownItemPolicy, countPolicy)', () => {
    const input = makeInput();
    const plan = computeValuationPlan(input);
    expect(plan.witness.slotModel).toBe('distinct-item-keys-v1');
    expect(plan.witness.unknownItemPolicy).toBe('fail-closed-v1');
    expect(plan.witness.countPolicy).toBe('whole-stack-v1');
  });

  // #17 — countBasis is 'all' on every action (whole-stack-v1 enforcement)
  it('all actions have countBasis "all" under whole-stack-v1 policy', () => {
    const input = makeInput({
      inventory: { rotten_flesh: 1, cobblestone: 1, diamond: 1 },
      slotBudget: 2,
      observedTokens: ['proximity:container:chest'],
    });
    const plan = computeValuationPlan(input);
    expect(plan.solved).toBe(true);
    for (const action of plan.actions) {
      expect(action.countBasis).toBe('all');
    }
  });

  // #18 — Score/reason changes don't affect decisionDigest when actions are identical
  it('score changes do not affect decisionDigest if action identity is unchanged', () => {
    const ruleset = buildDefaultRuleset();
    const rulesetDigest = computeRulesetDigest(ruleset);
    const input = makeInput();
    const valuationInputDigest = computeValuationInputDigest(input, rulesetDigest);

    const actionsWithScore100: InventoryActionV1[] = [
      { actionType: 'keep', item: 'diamond', count: 1, countBasis: 'all', reasonCodes: ['HIGH_VALUE'], score: 100 },
      { actionType: 'drop', item: 'dirt', count: 1, countBasis: 'all', reasonCodes: ['LOW_VALUE_DROP'], score: 50 },
    ];

    const actionsWithScore9999: InventoryActionV1[] = [
      { actionType: 'keep', item: 'diamond', count: 1, countBasis: 'all', reasonCodes: ['HIGH_VALUE'], score: 9999 },
      { actionType: 'drop', item: 'dirt', count: 1, countBasis: 'all', reasonCodes: ['LOW_VALUE_DROP'], score: 1 },
    ];

    const digestA = computeDecisionDigest(valuationInputDigest, actionsWithScore100);
    const digestB = computeDecisionDigest(valuationInputDigest, actionsWithScore9999);
    expect(digestA).toBe(digestB);
  });

  // #19 — Store eligibility witness fields (lexicographic-min token)
  it('witness records storeEligible and storeTokenMatched (lexicographic-min)', () => {
    // 'barrel' < 'chest' lexicographically, so barrel is picked regardless of array order
    const inputWithStore = makeInput({
      inventory: { cobblestone: 1, diamond: 1 },
      slotBudget: 1,
      observedTokens: ['proximity:container:chest', 'proximity:container:barrel'],
    });
    const planWith = computeValuationPlan(inputWithStore);
    expect(planWith.witness.storeEligible).toBe(true);
    expect(planWith.witness.storeTokenMatched).toBe('proximity:container:barrel');

    // Reverse order → same result
    const inputReversed = makeInput({
      inventory: { cobblestone: 1, diamond: 1 },
      slotBudget: 1,
      observedTokens: ['proximity:container:barrel', 'proximity:container:chest'],
    });
    const planReversed = computeValuationPlan(inputReversed);
    expect(planReversed.witness.storeTokenMatched).toBe('proximity:container:barrel');

    const inputWithout = makeInput({
      inventory: { cobblestone: 1, diamond: 1 },
      slotBudget: 1,
      observedTokens: [],
    });
    const planWithout = computeValuationPlan(inputWithout);
    expect(planWithout.witness.storeEligible).toBe(false);
    expect(planWithout.witness.storeTokenMatched).toBeUndefined();
  });

  // #20 — Ruleset lint: default table is clean
  it('default classification table passes lint (no shadowing)', () => {
    const ruleset = buildDefaultRuleset();
    const lintResult = lintClassificationTable(ruleset.classificationTable);
    expect(lintResult.clean).toBe(true);
    expect(lintResult.issues).toStrictEqual([]);

    // Witness records it
    const plan = computeValuationPlan(makeInput());
    expect(plan.witness.rulesetLintClean).toBe(true);
  });

  // #21 — Ruleset lint detects shadowing hazards
  it('lint detects duplicate exact, suffix-shadows-exact, and duplicate suffix', () => {
    // DUPLICATE_EXACT: two exact entries for 'dirt'
    const dupExact = lintClassificationTable([
      { pattern: 'dirt', matchKind: 'exact', class: 'low_value', scoreBp: 2500 },
      { pattern: 'dirt', matchKind: 'exact', class: 'junk', scoreBp: 500 },
    ]);
    expect(dupExact.clean).toBe(false);
    expect(dupExact.issues[0].code).toBe('DUPLICATE_EXACT');

    // SUFFIX_SHADOWS_EXACT: suffix '_log' before exact 'oak_log'
    const suffixShadows = lintClassificationTable([
      { pattern: '_log', matchKind: 'suffix', class: 'low_value', scoreBp: 2500 },
      { pattern: 'oak_log', matchKind: 'exact', class: 'medium_value', scoreBp: 5000 },
    ]);
    expect(suffixShadows.clean).toBe(false);
    expect(suffixShadows.issues[0].code).toBe('SUFFIX_SHADOWS_EXACT');

    // DUPLICATE_SUFFIX: same suffix pattern twice
    const dupSuffix = lintClassificationTable([
      { pattern: '_log', matchKind: 'suffix', class: 'low_value', scoreBp: 2500 },
      { pattern: '_log', matchKind: 'suffix', class: 'medium_value', scoreBp: 5000 },
    ]);
    expect(dupSuffix.clean).toBe(false);
    expect(dupSuffix.issues[0].code).toBe('DUPLICATE_SUFFIX');
  });

  // #22 — Lint-dirty ruleset still produces a plan (informational, not blocking)
  it('lint-dirty ruleset produces plan with rulesetLintClean=false and issue codes', () => {
    const dirtyRuleset: ValuationRulesetV1 = {
      classificationTable: [
        { pattern: 'dirt', matchKind: 'exact', class: 'low_value', scoreBp: 2500 },
        { pattern: 'dirt', matchKind: 'exact', class: 'junk', scoreBp: 500 },
        { pattern: 'diamond', matchKind: 'exact', class: 'high_value', scoreBp: 7500 },
      ],
      storeProximityPrefix: 'proximity:container:',
      storeMinScoreBp: 3000,
      slotModel: 'distinct-item-keys-v1',
      unknownItemPolicy: 'fail-closed-v1',
      countPolicy: 'whole-stack-v1',
    };

    const input = makeInput({
      inventory: { dirt: 1, diamond: 1 },
      slotBudget: 10,
    });
    const plan = computeValuationPlan(input, dirtyRuleset);
    expect(plan.solved).toBe(true);
    expect(plan.witness.rulesetLintClean).toBe(false);
    expect(plan.witness.rulesetLintIssueCodes).toStrictEqual(['DUPLICATE_EXACT']);
  });

  // #23 — Permuted input arrays produce same valuationInputDigest
  it('permuted protectedItems/observedTokens produce same valuationInputDigest', () => {
    const ruleset = buildDefaultRuleset();
    const rulesetDigest = computeRulesetDigest(ruleset);

    const inputA = makeInput({
      protectedItems: ['diamond', 'iron_ingot', 'cobblestone'],
      protectedPrefixes: ['diamond_', 'iron_'],
      observedTokens: ['proximity:container:chest', 'proximity:mob:zombie'],
    });
    const inputB = makeInput({
      protectedItems: ['cobblestone', 'diamond', 'iron_ingot'],
      protectedPrefixes: ['iron_', 'diamond_'],
      observedTokens: ['proximity:mob:zombie', 'proximity:container:chest'],
    });

    const digestA = computeValuationInputDigest(inputA, rulesetDigest);
    const digestB = computeValuationInputDigest(inputB, rulesetDigest);
    expect(digestA).toBe(digestB);
  });

  // #24 — Duplicate input array entries don't fork the digest
  it('duplicate entries in protectedItems/observedTokens produce same digest as deduped', () => {
    const ruleset = buildDefaultRuleset();
    const rulesetDigest = computeRulesetDigest(ruleset);

    const inputClean = makeInput({
      protectedItems: ['diamond'],
      observedTokens: ['proximity:container:chest'],
    });
    const inputDuped = makeInput({
      protectedItems: ['diamond', 'diamond'],
      observedTokens: ['proximity:container:chest', 'proximity:container:chest'],
    });

    const digestClean = computeValuationInputDigest(inputClean, rulesetDigest);
    const digestDuped = computeValuationInputDigest(inputDuped, rulesetDigest);
    expect(digestClean).toBe(digestDuped);
  });

  // #25 — Inventory zero-count and cap: tokens don't affect input digest
  it('inventory zero-count entries and cap: tokens excluded from input digest', () => {
    const ruleset = buildDefaultRuleset();
    const rulesetDigest = computeRulesetDigest(ruleset);

    const inputClean = makeInput({
      inventory: { dirt: 1, diamond: 3 },
    });
    const inputWithNoise = makeInput({
      inventory: { dirt: 1, diamond: 3, cobblestone: 0, 'cap:has_pickaxe': 1 },
    });

    const digestClean = computeValuationInputDigest(inputClean, rulesetDigest);
    const digestNoisy = computeValuationInputDigest(inputWithNoise, rulesetDigest);
    expect(digestClean).toBe(digestNoisy);
  });

  // #26 — reasonCodes normalization: duplicate/reordered codes don't fork decisionDigest
  it('duplicate/reordered reasonCodes produce same decisionDigest', () => {
    const ruleset = buildDefaultRuleset();
    const rulesetDigest = computeRulesetDigest(ruleset);
    const input = makeInput();
    const valuationInputDigest = computeValuationInputDigest(input, rulesetDigest);

    const actionsNormal: InventoryActionV1[] = [
      { actionType: 'keep', item: 'diamond', count: 1, countBasis: 'all', reasonCodes: ['UNDER_BUDGET', 'HIGH_VALUE'], score: 7500 },
    ];
    const actionsReordered: InventoryActionV1[] = [
      { actionType: 'keep', item: 'diamond', count: 1, countBasis: 'all', reasonCodes: ['HIGH_VALUE', 'UNDER_BUDGET'], score: 7500 },
    ];
    const actionsDuped: InventoryActionV1[] = [
      { actionType: 'keep', item: 'diamond', count: 1, countBasis: 'all', reasonCodes: ['UNDER_BUDGET', 'HIGH_VALUE', 'UNDER_BUDGET'], score: 7500 },
    ];

    const digestNormal = computeDecisionDigest(valuationInputDigest, actionsNormal);
    const digestReordered = computeDecisionDigest(valuationInputDigest, actionsReordered);
    const digestDuped = computeDecisionDigest(valuationInputDigest, actionsDuped);
    expect(digestNormal).toBe(digestReordered);
    expect(digestNormal).toBe(digestDuped);
  });

  // #27 — rulesetLintIssueCodes is empty for clean ruleset
  it('witness rulesetLintIssueCodes is empty for clean default ruleset', () => {
    const plan = computeValuationPlan(makeInput());
    expect(plan.witness.rulesetLintIssueCodes).toStrictEqual([]);
  });

  // #28 — storeTokenMatched stable under permuted observedTokens
  it('storeTokenMatched is lexicographic-min regardless of observedTokens order', () => {
    const orderings = [
      ['proximity:container:zzz', 'proximity:container:aaa', 'proximity:container:mmm'],
      ['proximity:container:aaa', 'proximity:container:mmm', 'proximity:container:zzz'],
      ['proximity:container:mmm', 'proximity:container:zzz', 'proximity:container:aaa'],
    ];

    for (const tokens of orderings) {
      const input = makeInput({
        inventory: { cobblestone: 1, diamond: 1 },
        slotBudget: 1,
        observedTokens: tokens,
      });
      const plan = computeValuationPlan(input);
      expect(plan.witness.storeTokenMatched).toBe('proximity:container:aaa');
    }
  });

  // ── Policy guard tests (fail-closed on unsupported knobs) ──────────────

  // #29 — Unsupported slotModel → UNSUPPORTED_POLICY
  it('unsupported slotModel → solved:false, UNSUPPORTED_POLICY', () => {
    const badRuleset = {
      ...buildDefaultRuleset(),
      slotModel: 'stack-aware-v2' as any,
    };
    const plan = computeValuationPlan(makeInput(), badRuleset);
    expect(plan.solved).toBe(false);
    expect(plan.error).toBe('UNSUPPORTED_POLICY');
    expect(plan.actions).toStrictEqual([]);
    // Witness records the unsupported knob value for diagnostics
    expect(plan.witness.slotModel).toBe('stack-aware-v2');
  });

  // #30 — Unsupported unknownItemPolicy → UNSUPPORTED_POLICY
  it('unsupported unknownItemPolicy → solved:false, UNSUPPORTED_POLICY', () => {
    const badRuleset = {
      ...buildDefaultRuleset(),
      unknownItemPolicy: 'best-effort-v1' as any,
    };
    const plan = computeValuationPlan(makeInput(), badRuleset);
    expect(plan.solved).toBe(false);
    expect(plan.error).toBe('UNSUPPORTED_POLICY');
    expect(plan.witness.unknownItemPolicy).toBe('best-effort-v1');
  });

  // #31 — Unsupported countPolicy → UNSUPPORTED_POLICY
  it('unsupported countPolicy → solved:false, UNSUPPORTED_POLICY', () => {
    const badRuleset = {
      ...buildDefaultRuleset(),
      countPolicy: 'partial-stack-v2' as any,
    };
    const plan = computeValuationPlan(makeInput(), badRuleset);
    expect(plan.solved).toBe(false);
    expect(plan.error).toBe('UNSUPPORTED_POLICY');
    expect(plan.witness.countPolicy).toBe('partial-stack-v2');
  });

  // ── Shared normalization proof ─────────────────────────────────────────

  // #32 — deriveEffectiveInventory filters cap: and zeros, solver uses same function
  it('deriveEffectiveInventory filters cap: tokens and zero-count entries', () => {
    const raw = {
      'cap:has_pickaxe': 1,
      'cap:has_sword': 1,
      dirt: 5,
      diamond: 3,
      cobblestone: 0,
      gravel: 0,
    };
    const { effective, excludedCapTokens } = deriveEffectiveInventory(raw);

    // Only non-cap, non-zero items remain
    expect(Object.keys(effective).sort()).toStrictEqual(['diamond', 'dirt']);
    expect(effective['dirt']).toBe(5);
    expect(effective['diamond']).toBe(3);

    // cap: tokens recorded and sorted
    expect(excludedCapTokens).toStrictEqual(['cap:has_pickaxe', 'cap:has_sword']);
  });

  // #33 — Lint-dirty ruleset with multiple issue types reports deduped codes
  it('witness rulesetLintIssueCodes are deduped across multiple issues of same type', () => {
    const dirtyRuleset: ValuationRulesetV1 = {
      classificationTable: [
        { pattern: 'dirt', matchKind: 'exact', class: 'low_value', scoreBp: 2500 },
        { pattern: 'dirt', matchKind: 'exact', class: 'junk', scoreBp: 500 },
        // Two suffix patterns that shadow later exact entries
        { pattern: '_log', matchKind: 'suffix', class: 'low_value', scoreBp: 2500 },
        { pattern: 'oak_log', matchKind: 'exact', class: 'medium_value', scoreBp: 5000 },
        { pattern: 'birch_log', matchKind: 'exact', class: 'medium_value', scoreBp: 5000 },
        { pattern: 'diamond', matchKind: 'exact', class: 'high_value', scoreBp: 7500 },
      ],
      storeProximityPrefix: 'proximity:container:',
      storeMinScoreBp: 3000,
      slotModel: 'distinct-item-keys-v1',
      unknownItemPolicy: 'fail-closed-v1',
      countPolicy: 'whole-stack-v1',
    };

    const input = makeInput({
      inventory: { dirt: 1, diamond: 1 },
      slotBudget: 10,
    });
    const plan = computeValuationPlan(input, dirtyRuleset);
    expect(plan.witness.rulesetLintClean).toBe(false);
    // DUPLICATE_EXACT + SUFFIX_SHADOWS_EXACT (deduped, sorted)
    expect(plan.witness.rulesetLintIssueCodes).toStrictEqual([
      'DUPLICATE_EXACT',
      'SUFFIX_SHADOWS_EXACT',
    ]);
  });
});
