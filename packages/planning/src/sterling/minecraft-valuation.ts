/**
 * Minecraft Valuation Solver (Rig F)
 *
 * Pure TS-local certified decision module. Given an inventory snapshot,
 * scarcity budget, and observed context tokens, produces a deterministic,
 * auditable inventory action plan (keep/drop/store per item).
 *
 * No Sterling backend involvement — uses the same content-addressed
 * hashing infrastructure as Rigs C/D.
 *
 * Algorithm:
 * 1. Filter cap: tokens from inventory
 * 2. Lint classification table (informational, recorded in witness)
 * 3. Score all items against classification table
 * 4. Enforce protected items (never dropped/stored)
 * 5. If under budget → keep all
 * 6. If over budget + unknown items → fail-closed (D1)
 * 7. Compute store eligibility from observed tokens
 * 8. Evict lowest-scored items first (drop or store based on proximity)
 *
 * @author @darianrosebrook
 */

import {
  type ReasonCode,
  type LintIssueCode,
  type ValuationInput,
  type ValuationPlanV1,
  type InventoryActionV1,
  type ValuationWitnessV1,
  type SlotModel,
  type UnknownItemPolicy,
  type CountPolicy,
  lexCmp,
  deriveEffectiveInventory,
  computeValuationInputDigest,
  computeDecisionDigest,
  hashInventoryState,
} from './minecraft-valuation-types';

import type { ValuationRulesetV1 } from './minecraft-valuation-types';

import {
  scoreItem,
  buildDefaultRuleset,
  computeRulesetDigest,
  lintClassificationTable,
} from './minecraft-valuation-rules';

// ============================================================================
// Main Entry Point
// ============================================================================

export function computeValuationPlan(
  input: ValuationInput,
  ruleset?: ValuationRulesetV1,
): ValuationPlanV1 {
  // 1. Build ruleset and compute its digest
  const effectiveRuleset = ruleset ?? buildDefaultRuleset();
  const rulesetDigest = computeRulesetDigest(effectiveRuleset);

  // 1b. Fail-closed policy guards: reject unsupported policy knob values.
  // TypeScript's union types prevent this at compile time, but `as any` casts
  // or runtime data can bypass the type system. These guards turn "digest says X
  // but behavior is Y" into an explicit failure.
  if (effectiveRuleset.slotModel !== 'distinct-item-keys-v1') {
    const witness = buildMinimalErrorWitness(input, effectiveRuleset, rulesetDigest);
    return makeErrorPlan(input, 'UNSUPPORTED_POLICY', rulesetDigest, witness, '');
  }
  if (effectiveRuleset.unknownItemPolicy !== 'fail-closed-v1') {
    const witness = buildMinimalErrorWitness(input, effectiveRuleset, rulesetDigest);
    return makeErrorPlan(input, 'UNSUPPORTED_POLICY', rulesetDigest, witness, '');
  }
  if (effectiveRuleset.countPolicy !== 'whole-stack-v1') {
    const witness = buildMinimalErrorWitness(input, effectiveRuleset, rulesetDigest);
    return makeErrorPlan(input, 'UNSUPPORTED_POLICY', rulesetDigest, witness, '');
  }

  // 2. Lint the classification table (informational, does not block)
  const lintResult = lintClassificationTable(effectiveRuleset.classificationTable);
  const rulesetLintIssueCodes: LintIssueCode[] = [...new Set(lintResult.issues.map(i => i.code))].sort(lexCmp);

  // 3. Filter cap: tokens from inventory using shared normalization helper.
  // deriveEffectiveInventory is the same function used by computeValuationInputDigest,
  // preventing drift between "what the solver reasons over" and "what the digest binds."
  const { effective: filteredInventory, excludedCapTokens: nonSlotTokensExcluded } =
    deriveEffectiveInventory(input.inventory);

  // 4. Compute inventory state hash
  const inventoryStateHash = hashInventoryState(filteredInventory);

  // 5. Count occupied slots (distinct keys with value > 0)
  const occupiedSlotsBefore = Object.entries(filteredInventory)
    .filter(([, v]) => v > 0).length;

  // 6. Score every item
  const perItemScores: Record<string, number | null> = {};
  for (const key of Object.keys(filteredInventory)) {
    perItemScores[key] = scoreItem(key, effectiveRuleset.classificationTable);
  }

  // 7. Identify protected items
  const protectedSet = new Set<string>();
  const protectedReasonMap = new Map<string, ReasonCode>();
  for (const item of Object.keys(filteredInventory)) {
    if (input.protectedItems.includes(item)) {
      protectedSet.add(item);
      protectedReasonMap.set(item, 'PROTECTED_EXPLICIT');
    } else {
      for (const prefix of input.protectedPrefixes) {
        if (item.startsWith(prefix)) {
          protectedSet.add(item);
          protectedReasonMap.set(item, 'PROTECTED_PREFIX');
          break;
        }
      }
    }
  }

  const protectedItemsList = [...protectedSet].sort(lexCmp);

  // 8. Compute store eligibility (first-class, not derived inline)
  // Pick lexicographically-min matching token for determinism under permutation.
  const matchingStoreTokens = input.observedTokens
    .filter(t => t.startsWith(effectiveRuleset.storeProximityPrefix))
    .sort(lexCmp);
  const storeTokenMatched = matchingStoreTokens.length > 0 ? matchingStoreTokens[0] : undefined;
  const storeEligible = storeTokenMatched !== undefined;

  // Shared witness context for all paths
  const witnessCtx: WitnessContext = {
    slotModel: effectiveRuleset.slotModel,
    unknownItemPolicy: effectiveRuleset.unknownItemPolicy,
    countPolicy: effectiveRuleset.countPolicy,
    slotBudget: input.slotBudget,
    nonSlotTokensExcluded,
    rulesetDigest,
    storeEligible,
    storeTokenMatched,
    rulesetLintClean: lintResult.clean,
    rulesetLintIssueCodes,
    perItemScores,
    protectedItems: protectedItemsList,
  };

  // 9. Check protected slots vs budget
  const protectedSlots = protectedItemsList
    .filter(item => (filteredInventory[item] ?? 0) > 0).length;

  if (protectedSlots > input.slotBudget) {
    return makeErrorPlan(
      input,
      'INSUFFICIENT_CAPACITY_PROTECTED',
      rulesetDigest,
      buildWitness({
        ...witnessCtx,
        occupiedSlotsBefore,
        occupiedSlotsAfter: occupiedSlotsBefore,
        unknownItems: [],
        droppedItems: [],
        storedItems: [],
        keptItems: Object.keys(filteredInventory).filter(k => (filteredInventory[k] ?? 0) > 0).sort(lexCmp),
      }),
      inventoryStateHash,
    );
  }

  // 10. Under-budget: all items get 'keep'
  if (occupiedSlotsBefore <= input.slotBudget) {
    const actions: InventoryActionV1[] = [];
    for (const [item, count] of Object.entries(filteredInventory)) {
      if (count <= 0) continue;
      const score = perItemScores[item] ?? null;
      const reasonCodes: ReasonCode[] = ['UNDER_BUDGET'];
      if (protectedReasonMap.has(item)) {
        reasonCodes.push(protectedReasonMap.get(item)!);
      }
      if (score === null) {
        reasonCodes.push('UNKNOWN_ITEM_KEPT');
      } else {
        reasonCodes.push(scoreToReasonCode(score));
      }
      actions.push({ actionType: 'keep', item, count, countBasis: 'all', reasonCodes, score });
    }

    const keptItems = actions.map(a => a.item).sort(lexCmp);
    const witness = buildWitness({
      ...witnessCtx,
      occupiedSlotsBefore,
      occupiedSlotsAfter: occupiedSlotsBefore,
      unknownItems: Object.keys(filteredInventory)
        .filter(k => perItemScores[k] === null && (filteredInventory[k] ?? 0) > 0)
        .sort(lexCmp),
      droppedItems: [],
      storedItems: [],
      keptItems,
    });

    const valuationInputDigest = computeValuationInputDigest(input, rulesetDigest);
    const decisionDigest = computeDecisionDigest(valuationInputDigest, actions);

    return {
      solved: true,
      inventoryStateHash,
      valuationInputDigest,
      decisionDigest,
      actions,
      witness,
    };
  }

  // 11. Over-budget: check for unknown items (fail-closed D1)
  const unknownItems = Object.keys(filteredInventory)
    .filter(k => perItemScores[k] === null && !protectedSet.has(k) && (filteredInventory[k] ?? 0) > 0)
    .sort(lexCmp);

  if (unknownItems.length > 0) {
    return makeErrorPlan(
      input,
      'UNKNOWN_ITEM_VALUATION',
      rulesetDigest,
      buildWitness({
        ...witnessCtx,
        occupiedSlotsBefore,
        occupiedSlotsAfter: occupiedSlotsBefore,
        unknownItems,
        droppedItems: [],
        storedItems: [],
        keptItems: Object.keys(filteredInventory).filter(k => (filteredInventory[k] ?? 0) > 0).sort(lexCmp),
      }),
      inventoryStateHash,
    );
  }

  // 12. Sort non-protected items by score ascending, ties by lexCmp(item)
  const evictable = Object.keys(filteredInventory)
    .filter(k => !protectedSet.has(k) && (filteredInventory[k] ?? 0) > 0)
    .sort((a, b) => {
      const sa = perItemScores[a]!;
      const sb = perItemScores[b]!;
      if (sa !== sb) return sa - sb;
      return lexCmp(a, b);
    });

  let currentSlots = occupiedSlotsBefore;
  const evictedActions: InventoryActionV1[] = [];
  const droppedItems: string[] = [];
  const storedItems: string[] = [];
  const evictedSet = new Set<string>();

  for (const item of evictable) {
    if (currentSlots <= input.slotBudget) break;

    const score = perItemScores[item]!;
    const count = filteredInventory[item];

    if (storeEligible && score >= effectiveRuleset.storeMinScoreBp) {
      evictedActions.push({
        actionType: 'store',
        item,
        count,
        countBasis: 'all',
        reasonCodes: ['LOW_VALUE_STORE'],
        score,
      });
      storedItems.push(item);
    } else {
      evictedActions.push({
        actionType: 'drop',
        item,
        count,
        countBasis: 'all',
        reasonCodes: ['LOW_VALUE_DROP'],
        score,
      });
      droppedItems.push(item);
    }
    evictedSet.add(item);
    currentSlots--;
  }

  // 13. Remaining non-evicted items get 'keep'
  const keepActions: InventoryActionV1[] = [];
  for (const [item, count] of Object.entries(filteredInventory)) {
    if (count <= 0) continue;
    if (evictedSet.has(item)) continue;

    const score = perItemScores[item] ?? null;
    const reasonCodes: ReasonCode[] = [];
    if (protectedReasonMap.has(item)) {
      reasonCodes.push(protectedReasonMap.get(item)!);
    }
    if (score !== null) {
      reasonCodes.push(scoreToReasonCode(score));
    }
    keepActions.push({ actionType: 'keep', item, count, countBasis: 'all', reasonCodes, score });
  }

  const allActions = [...evictedActions, ...keepActions];
  const keptItems = keepActions.map(a => a.item).sort(lexCmp);

  // 14. Build witness
  const witness = buildWitness({
    ...witnessCtx,
    occupiedSlotsBefore,
    occupiedSlotsAfter: currentSlots,
    unknownItems: [],
    droppedItems: droppedItems.sort(lexCmp),
    storedItems: storedItems.sort(lexCmp),
    keptItems,
  });

  // 15-16. Compute digests
  const valuationInputDigest = computeValuationInputDigest(input, rulesetDigest);
  const decisionDigest = computeDecisionDigest(valuationInputDigest, allActions);

  return {
    solved: true,
    inventoryStateHash,
    valuationInputDigest,
    decisionDigest,
    actions: allActions,
    witness,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function scoreToReasonCode(score: number): ReasonCode {
  if (score >= 10000) return 'ESSENTIAL_TOOL';
  if (score >= 7500) return 'HIGH_VALUE';
  // Medium and below don't get a scoring reason on keep
  return 'HIGH_VALUE';
}

/** Shared witness context fields that don't change between code paths */
interface WitnessContext {
  slotModel: SlotModel;
  unknownItemPolicy: UnknownItemPolicy;
  countPolicy: CountPolicy;
  slotBudget: number;
  nonSlotTokensExcluded: string[];
  rulesetDigest: string;
  storeEligible: boolean;
  storeTokenMatched: string | undefined;
  rulesetLintClean: boolean;
  rulesetLintIssueCodes: LintIssueCode[];
  perItemScores: Record<string, number | null>;
  protectedItems: string[];
}

function buildWitness(params: WitnessContext & {
  occupiedSlotsBefore: number;
  occupiedSlotsAfter: number;
  unknownItems: string[];
  droppedItems: string[];
  storedItems: string[];
  keptItems: string[];
}): ValuationWitnessV1 {
  return {
    version: 1,
    slotModel: params.slotModel,
    unknownItemPolicy: params.unknownItemPolicy,
    countPolicy: params.countPolicy,
    occupiedSlotsBefore: params.occupiedSlotsBefore,
    occupiedSlotsAfter: params.occupiedSlotsAfter,
    slotBudget: params.slotBudget,
    unknownItems: params.unknownItems,
    protectedItems: params.protectedItems,
    nonSlotTokensExcluded: params.nonSlotTokensExcluded,
    rulesetDigest: params.rulesetDigest,
    storeEligible: params.storeEligible,
    storeTokenMatched: params.storeTokenMatched,
    rulesetLintClean: params.rulesetLintClean,
    rulesetLintIssueCodes: params.rulesetLintIssueCodes,
    perItemScores: params.perItemScores,
    droppedItems: params.droppedItems,
    storedItems: params.storedItems,
    keptItems: params.keptItems,
  };
}

/**
 * Build a minimal witness for early-exit error paths (e.g. unsupported policy).
 * The solver hasn't filtered inventory or scored items yet, so most fields
 * are empty/default. The witness still records the policy knobs and ruleset
 * digest so callers can diagnose which knob was unsupported.
 */
function buildMinimalErrorWitness(
  input: ValuationInput,
  ruleset: ValuationRulesetV1,
  rulesetDigest: string,
): ValuationWitnessV1 {
  return {
    version: 1,
    slotModel: ruleset.slotModel,
    unknownItemPolicy: ruleset.unknownItemPolicy,
    countPolicy: ruleset.countPolicy,
    occupiedSlotsBefore: 0,
    occupiedSlotsAfter: 0,
    slotBudget: input.slotBudget,
    unknownItems: [],
    protectedItems: [],
    nonSlotTokensExcluded: [],
    rulesetDigest,
    storeEligible: false,
    storeTokenMatched: undefined,
    rulesetLintClean: true,
    rulesetLintIssueCodes: [],
    perItemScores: {},
    droppedItems: [],
    storedItems: [],
    keptItems: [],
  };
}

function makeErrorPlan(
  input: ValuationInput,
  errorCode: ReasonCode,
  rulesetDigest: string,
  witness: ValuationWitnessV1,
  inventoryStateHash: string,
): ValuationPlanV1 {
  const valuationInputDigest = computeValuationInputDigest(input, rulesetDigest);
  const decisionDigest = computeDecisionDigest(valuationInputDigest, []);

  return {
    solved: false,
    error: errorCode,
    inventoryStateHash,
    valuationInputDigest,
    decisionDigest,
    actions: [],
    witness,
  };
}
