/**
 * Minecraft Valuation Domain Type Definitions (Rig F)
 *
 * Certified decision module types for inventory valuation under scarcity.
 * Given an inventory snapshot + scarcity budget + observed context tokens,
 * produces a deterministic, auditable inventory action plan (keep/drop/store
 * per item).
 *
 * Key design:
 * - CAP_PREFIX inlined locally (no coupling to tool-progression-types.ts)
 * - Decision digest is order-insensitive (sorted by item, actionType)
 * - Score excluded from decisionDigest (audit-only, in witness)
 * - Whole-stack actions only (count === inventory[item])
 * - All policy knobs (slotModel, unknownItemPolicy, countPolicy) are
 *   explicit versioned constants, bound into the ruleset digest. Changing
 *   the slot abstraction or unknown-item behavior MUST bump the version
 *   string and will invalidate all digests — preventing silent semantic
 *   drift between certification and integration.
 *
 * @author @darianrosebrook
 */

import { canonicalize, contentHash, hashInventoryState } from './solve-bundle';

// ============================================================================
// Constants
// ============================================================================

/**
 * Capability token prefix. Inlined locally to avoid coupling to
 * tool-progression-types.ts and future circular import risk.
 * The value is stable convention across the codebase.
 */
export const CAP_PREFIX = 'cap:' as const;

// ============================================================================
// Reason Codes
// ============================================================================

export type ReasonCode =
  | 'PROTECTED_EXPLICIT'
  | 'PROTECTED_PREFIX'
  | 'ESSENTIAL_TOOL'
  | 'HIGH_VALUE'
  | 'LOW_VALUE_DROP'
  | 'LOW_VALUE_STORE'
  | 'UNKNOWN_ITEM_KEPT'
  | 'UNDER_BUDGET'
  | 'UNKNOWN_ITEM_VALUATION'
  | 'INSUFFICIENT_CAPACITY_PROTECTED'
  | 'UNSUPPORTED_POLICY';

/**
 * Lint issue codes surfaced in the witness. Mirrors `RulesetLintIssue.code`
 * from minecraft-valuation-rules.ts. Defined here so the witness type is
 * self-contained without importing from the rules module.
 */
export type LintIssueCode = 'DUPLICATE_EXACT' | 'SUFFIX_SHADOWS_EXACT' | 'DUPLICATE_SUFFIX';

// ============================================================================
// Classification Types
// ============================================================================

export type MatchKind = 'exact' | 'suffix';

export type ItemClass =
  | 'essential_tool'
  | 'high_value'
  | 'medium_value'
  | 'low_value'
  | 'junk';

export interface ClassificationEntry {
  readonly pattern: string;
  readonly matchKind: MatchKind;
  readonly class: ItemClass;
  readonly scoreBp: number;
}

// ============================================================================
// Policy Knobs (digest-bound, versioned)
// ============================================================================

/**
 * Slot model version. Determines how "occupied slots" is counted.
 *
 * 'distinct-item-keys-v1': count of distinct inventory keys with value > 0,
 * excluding cap: tokens. This is NOT Minecraft's real slot constraint
 * (which involves stack sizes, non-stackables, etc.). The abstraction is
 * documented here so that future integration with real inventory management
 * requires an explicit model bump, not a silent reinterpretation.
 */
export type SlotModel = 'distinct-item-keys-v1';

/**
 * Unknown item policy version. Determines what happens when unscored items
 * exist in an over-budget scenario.
 *
 * 'fail-closed-v1': never drop/store unknown items. If budget can't be met
 * without dropping unknowns → solved:false with UNKNOWN_ITEM_VALUATION.
 * Under-budget unknowns pass through with UNKNOWN_ITEM_KEPT.
 *
 * This is intentionally strict governance. Callers should treat solved:false
 * as recoverable: expand classification table, query item metadata, or defer.
 */
export type UnknownItemPolicy = 'fail-closed-v1';

/**
 * Count policy version. Determines whether actions are whole-stack or partial.
 *
 * 'whole-stack-v1': action.count === inventory[item] for all action types.
 * No partial drops/stores. Slot accounting is trivially correct: one action
 * per item key. Adding partial-stack support requires bumping this version,
 * which changes digests, invariants, tests, and reason code semantics.
 */
export type CountPolicy = 'whole-stack-v1';

// ============================================================================
// Ruleset
// ============================================================================

export interface ValuationRulesetV1 {
  readonly classificationTable: ClassificationEntry[];
  readonly storeProximityPrefix: string;
  readonly storeMinScoreBp: number;
  /**
   * How "occupied slots" is counted. Bound into rulesetDigest.
   * Changing this value changes all digests downstream.
   */
  readonly slotModel: SlotModel;
  /**
   * What happens when unknown items exist in an over-budget scenario.
   * Bound into rulesetDigest. Callers must handle solved:false as recoverable.
   */
  readonly unknownItemPolicy: UnknownItemPolicy;
  /**
   * Whether actions are whole-stack or partial. Bound into rulesetDigest.
   * Currently always 'whole-stack-v1'.
   */
  readonly countPolicy: CountPolicy;
}

// ============================================================================
// Input / Output Types
// ============================================================================

export interface ValuationInput {
  readonly inventory: Record<string, number>;
  readonly slotBudget: number;
  readonly protectedItems: string[];
  readonly protectedPrefixes: string[];
  readonly observedTokens: string[];
}

export interface InventoryActionV1 {
  readonly actionType: 'keep' | 'drop' | 'store';
  readonly item: string;
  readonly count: number;
  /**
   * Whether count represents the full stack or a partial amount.
   * Currently always 'all' (whole-stack-v1 policy). When partial-stack
   * support is added, 'some' will indicate count < inventory[item].
   */
  readonly countBasis: 'all' | 'some';
  readonly reasonCodes: ReasonCode[];
  readonly score: number | null;
}

export interface ValuationWitnessV1 {
  readonly version: 1;
  /** How slots were counted — prevents silent reinterpretation of budget semantics */
  readonly slotModel: SlotModel;
  /** How unknown items were handled — prevents retry confusion on solved:false */
  readonly unknownItemPolicy: UnknownItemPolicy;
  /** Whether actions are whole-stack or partial — prevents digest invalidation on upgrade */
  readonly countPolicy: CountPolicy;
  readonly occupiedSlotsBefore: number;
  readonly occupiedSlotsAfter: number;
  readonly slotBudget: number;
  readonly unknownItems: string[];
  readonly protectedItems: string[];
  readonly nonSlotTokensExcluded: string[];
  readonly rulesetDigest: string;
  /** Whether a store-eligible context token was found in observedTokens */
  readonly storeEligible: boolean;
  /** The lexicographically-min matching store proximity token, if any (stable under permutation) */
  readonly storeTokenMatched: string | undefined;
  /** Whether the ruleset classification table passed lint (no shadowing hazards) */
  readonly rulesetLintClean: boolean;
  /**
   * Deduped issue codes that fired during lint (empty when rulesetLintClean is true).
   * Tells callers *what* to fix without re-running lint or inspecting the ruleset.
   */
  readonly rulesetLintIssueCodes: LintIssueCode[];
  readonly perItemScores: Record<string, number | null>;
  readonly droppedItems: string[];
  readonly storedItems: string[];
  readonly keptItems: string[];
}

export interface ValuationPlanV1 {
  readonly solved: boolean;
  readonly error?: string;
  readonly inventoryStateHash: string;
  readonly valuationInputDigest: string;
  readonly decisionDigest: string;
  readonly actions: InventoryActionV1[];
  readonly witness: ValuationWitnessV1;
}

// ============================================================================
// Hashing Utilities
// ============================================================================

/**
 * Environment-insensitive lexicographic string comparison.
 * Avoids localeCompare which can vary across ICU/locale data.
 * Same pattern as acquisition-types.ts.
 */
export function lexCmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Derive the effective inventory the solver reasons over: non-cap: keys
 * with count > 0. Both the digest function and the solver's filtering step
 * call this, preventing "what the solver reasons over" from drifting away
 * from "what the digest claims was reasoned over."
 *
 * Also returns the excluded cap: tokens for witness recording.
 */
export function deriveEffectiveInventory(
  raw: Record<string, number>,
): { effective: Record<string, number>; excludedCapTokens: string[] } {
  const effective: Record<string, number> = {};
  const excludedCapTokens: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith(CAP_PREFIX)) {
      excludedCapTokens.push(key);
    } else if (value > 0) {
      effective[key] = value;
    }
  }
  excludedCapTokens.sort(lexCmp);
  return { effective, excludedCapTokens };
}

/**
 * Compute a content-addressed digest binding all valuation inputs + rulesetDigest.
 *
 * This ensures that any change to the input (inventory, budget, protected items,
 * observed tokens) or the ruleset produces a different digest.
 *
 * NORMALIZATION: Set-semantic arrays (protectedItems, protectedPrefixes,
 * observedTokens) are sorted and deduped before hashing so that permuted
 * inputs that carry the same meaning produce identical digests. Inventory
 * normalization uses `deriveEffectiveInventory()` — the same function the
 * solver uses — so the digest always reflects the effective inventory the
 * solver reasons over.
 */
export function computeValuationInputDigest(
  input: ValuationInput,
  rulesetDigest: string,
): string {
  const sortDedupe = (arr: readonly string[]) => [...new Set(arr)].sort(lexCmp);
  const { effective } = deriveEffectiveInventory(input.inventory);

  const normalizedInput = {
    inventory: effective,
    slotBudget: input.slotBudget,
    protectedItems: sortDedupe(input.protectedItems),
    protectedPrefixes: sortDedupe(input.protectedPrefixes),
    observedTokens: sortDedupe(input.observedTokens),
    rulesetDigest,
  };
  return contentHash(canonicalize(normalizedInput));
}

/**
 * Compute order-insensitive decision digest.
 *
 * INVARIANT: DecisionDigest binds executor-relevant action metadata.
 *
 * What affects the digest:
 *   - valuationInputDigest (binds all inputs + rulesetDigest)
 *   - action.actionType, action.item, action.count, action.countBasis
 *   - action.reasonCodes (sorted + deduped — these carry executor-relevant
 *     semantics, e.g. PROTECTED_EXPLICIT vs UNDER_BUDGET)
 *
 * What does NOT affect the digest:
 *   - action.score (scoring rationale lives in witness perItemScores)
 *
 * Why reasonCodes are decision-binding: Codes like LOW_VALUE_DROP vs
 * LOW_VALUE_STORE carry distinct executor semantics (drop vs store).
 * PROTECTED_EXPLICIT marks items that must survive even under budget
 * pressure. These are not mere explanations — they influence downstream
 * behavior. Score is excluded because it's a numeric artifact of the
 * classification table that doesn't change what the executor does.
 *
 * Normalization: reasonCodes are sorted lexicographically and deduped
 * before hashing, so a harmless reorder or accidental duplicate in
 * construction doesn't fork the digest.
 *
 * Actions are sorted by (item, actionType) via lexCmp before hashing.
 * Permuted action arrays produce identical digests.
 */
export function computeDecisionDigest(
  valuationInputDigest: string,
  actions: InventoryActionV1[],
): string {
  const sortedStrippedActions = [...actions]
    .sort((a, b) => {
      const cmp1 = lexCmp(a.item, b.item);
      if (cmp1 !== 0) return cmp1;
      return lexCmp(a.actionType, b.actionType);
    })
    .map(({ actionType, item, count, countBasis, reasonCodes }) => ({
      actionType,
      item,
      count,
      countBasis,
      reasonCodes: [...new Set(reasonCodes)].sort(lexCmp),
    }));
  return contentHash(canonicalize({ valuationInputDigest, actions: sortedStrippedActions }));
}

// Re-export hashInventoryState for convenience
export { hashInventoryState };
