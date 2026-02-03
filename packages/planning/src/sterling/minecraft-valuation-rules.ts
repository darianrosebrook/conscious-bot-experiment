/**
 * Minecraft Valuation Rules (Rig F)
 *
 * Static item classification table, scoring logic, and ruleset builder.
 * First-match-wins linear scan. Exact entries before suffix entries within
 * each class for explicit, digest-bound precedence.
 *
 * @author @darianrosebrook
 */

import { canonicalize, contentHash } from './solve-bundle';
import type {
  ClassificationEntry,
  ValuationRulesetV1,
} from './minecraft-valuation-types';

// ============================================================================
// Ruleset Lint Types
// ============================================================================

export interface RulesetLintIssue {
  readonly code: 'DUPLICATE_EXACT' | 'SUFFIX_SHADOWS_EXACT' | 'DUPLICATE_SUFFIX';
  readonly message: string;
  readonly indices: [number, number];
}

export interface RulesetLintResult {
  readonly clean: boolean;
  readonly issues: RulesetLintIssue[];
}

// ============================================================================
// Default Classification Table (~45 entries, first-match-wins)
// ============================================================================

export const DEFAULT_CLASSIFICATION_TABLE: readonly ClassificationEntry[] = [
  // essential_tool (10000 bp) — exact matches
  { pattern: 'diamond_pickaxe', matchKind: 'exact', class: 'essential_tool', scoreBp: 10000 },
  { pattern: 'iron_pickaxe', matchKind: 'exact', class: 'essential_tool', scoreBp: 10000 },
  { pattern: 'stone_pickaxe', matchKind: 'exact', class: 'essential_tool', scoreBp: 10000 },
  { pattern: 'wooden_pickaxe', matchKind: 'exact', class: 'essential_tool', scoreBp: 10000 },
  { pattern: 'diamond_sword', matchKind: 'exact', class: 'essential_tool', scoreBp: 10000 },
  { pattern: 'iron_sword', matchKind: 'exact', class: 'essential_tool', scoreBp: 10000 },
  { pattern: 'diamond_axe', matchKind: 'exact', class: 'essential_tool', scoreBp: 10000 },
  { pattern: 'iron_axe', matchKind: 'exact', class: 'essential_tool', scoreBp: 10000 },
  { pattern: 'crafting_table', matchKind: 'exact', class: 'essential_tool', scoreBp: 10000 },
  { pattern: 'furnace', matchKind: 'exact', class: 'essential_tool', scoreBp: 10000 },

  // high_value (7500 bp) — exact matches
  { pattern: 'diamond', matchKind: 'exact', class: 'high_value', scoreBp: 7500 },
  { pattern: 'emerald', matchKind: 'exact', class: 'high_value', scoreBp: 7500 },
  { pattern: 'gold_ingot', matchKind: 'exact', class: 'high_value', scoreBp: 7500 },
  { pattern: 'iron_ingot', matchKind: 'exact', class: 'high_value', scoreBp: 7500 },
  { pattern: 'lapis_lazuli', matchKind: 'exact', class: 'high_value', scoreBp: 7500 },
  { pattern: 'redstone', matchKind: 'exact', class: 'high_value', scoreBp: 7500 },
  { pattern: 'ancient_debris', matchKind: 'exact', class: 'high_value', scoreBp: 7500 },

  // medium_value (5000 bp) — exact matches
  { pattern: 'coal', matchKind: 'exact', class: 'medium_value', scoreBp: 5000 },
  { pattern: 'raw_iron', matchKind: 'exact', class: 'medium_value', scoreBp: 5000 },
  { pattern: 'raw_gold', matchKind: 'exact', class: 'medium_value', scoreBp: 5000 },
  { pattern: 'raw_copper', matchKind: 'exact', class: 'medium_value', scoreBp: 5000 },
  { pattern: 'oak_planks', matchKind: 'exact', class: 'medium_value', scoreBp: 5000 },
  { pattern: 'cobblestone', matchKind: 'exact', class: 'medium_value', scoreBp: 5000 },
  { pattern: 'stick', matchKind: 'exact', class: 'medium_value', scoreBp: 5000 },
  { pattern: 'torch', matchKind: 'exact', class: 'medium_value', scoreBp: 5000 },
  { pattern: 'bread', matchKind: 'exact', class: 'medium_value', scoreBp: 5000 },
  { pattern: 'cooked_beef', matchKind: 'exact', class: 'medium_value', scoreBp: 5000 },

  // low_value (2500 bp) — exact then suffix
  { pattern: 'dirt', matchKind: 'exact', class: 'low_value', scoreBp: 2500 },
  { pattern: 'gravel', matchKind: 'exact', class: 'low_value', scoreBp: 2500 },
  { pattern: 'sand', matchKind: 'exact', class: 'low_value', scoreBp: 2500 },
  { pattern: '_log', matchKind: 'suffix', class: 'low_value', scoreBp: 2500 },
  { pattern: '_planks', matchKind: 'suffix', class: 'low_value', scoreBp: 2500 },

  // junk (500 bp) — exact matches
  { pattern: 'rotten_flesh', matchKind: 'exact', class: 'junk', scoreBp: 500 },
  { pattern: 'poisonous_potato', matchKind: 'exact', class: 'junk', scoreBp: 500 },
  { pattern: 'dead_bush', matchKind: 'exact', class: 'junk', scoreBp: 500 },
];

// ============================================================================
// Default Ruleset Constants
// ============================================================================

export const DEFAULT_STORE_PROXIMITY_PREFIX = 'proximity:container:';
export const DEFAULT_STORE_MIN_SCORE_BP = 3000;

// ============================================================================
// Scoring
// ============================================================================

/**
 * Score an item against a classification table.
 *
 * Linear scan, first match wins:
 * - Exact: pattern === itemName
 * - Suffix: itemName.endsWith(pattern)
 *
 * Returns scoreBp on match, null on no match (unknown item).
 */
export function scoreItem(
  itemName: string,
  table: readonly ClassificationEntry[],
): number | null {
  for (const entry of table) {
    if (entry.matchKind === 'exact') {
      if (entry.pattern === itemName) return entry.scoreBp;
    } else {
      // suffix
      if (itemName.endsWith(entry.pattern)) return entry.scoreBp;
    }
  }
  return null;
}

// ============================================================================
// Ruleset Builder
// ============================================================================

/**
 * Build the default valuation ruleset.
 *
 * All policy knobs are explicit and versioned. Changing any of these
 * values changes the rulesetDigest and invalidates all downstream digests.
 */
export function buildDefaultRuleset(): ValuationRulesetV1 {
  return {
    classificationTable: [...DEFAULT_CLASSIFICATION_TABLE],
    storeProximityPrefix: DEFAULT_STORE_PROXIMITY_PREFIX,
    storeMinScoreBp: DEFAULT_STORE_MIN_SCORE_BP,
    slotModel: 'distinct-item-keys-v1',
    unknownItemPolicy: 'fail-closed-v1',
    countPolicy: 'whole-stack-v1',
  };
}

/**
 * Compute content-addressed digest of a ruleset.
 * All policy knobs that affect outcomes are included (slotModel,
 * unknownItemPolicy, countPolicy, classificationTable, store config).
 */
export function computeRulesetDigest(ruleset: ValuationRulesetV1): string {
  return contentHash(canonicalize(ruleset));
}

// ============================================================================
// Ruleset Linting
// ============================================================================

/**
 * Lint a classification table for shadowing hazards.
 *
 * First-match-wins ordering means that earlier entries shadow later ones.
 * This function detects:
 * - DUPLICATE_EXACT: two exact entries with the same pattern (second is dead)
 * - SUFFIX_SHADOWS_EXACT: a suffix entry earlier in the table that would
 *   match an exact entry later (the exact entry is dead)
 * - DUPLICATE_SUFFIX: two suffix entries with the same pattern (second is dead)
 *
 * The lint result is informational — it does not block plan computation.
 * `rulesetLintClean` is recorded in the witness for audit purposes.
 */
export function lintClassificationTable(
  table: readonly ClassificationEntry[],
): RulesetLintResult {
  const issues: RulesetLintIssue[] = [];

  for (let i = 0; i < table.length; i++) {
    for (let j = i + 1; j < table.length; j++) {
      const earlier = table[i];
      const later = table[j];

      // DUPLICATE_EXACT: same exact pattern appears twice
      if (
        earlier.matchKind === 'exact' &&
        later.matchKind === 'exact' &&
        earlier.pattern === later.pattern
      ) {
        issues.push({
          code: 'DUPLICATE_EXACT',
          message: `Exact pattern "${later.pattern}" at index ${j} is shadowed by identical exact pattern at index ${i}`,
          indices: [i, j],
        });
      }

      // SUFFIX_SHADOWS_EXACT: suffix entry shadows a later exact entry
      if (
        earlier.matchKind === 'suffix' &&
        later.matchKind === 'exact' &&
        later.pattern.endsWith(earlier.pattern)
      ) {
        issues.push({
          code: 'SUFFIX_SHADOWS_EXACT',
          message: `Suffix pattern "${earlier.pattern}" at index ${i} shadows exact pattern "${later.pattern}" at index ${j}`,
          indices: [i, j],
        });
      }

      // DUPLICATE_SUFFIX: same suffix pattern appears twice
      if (
        earlier.matchKind === 'suffix' &&
        later.matchKind === 'suffix' &&
        earlier.pattern === later.pattern
      ) {
        issues.push({
          code: 'DUPLICATE_SUFFIX',
          message: `Suffix pattern "${later.pattern}" at index ${j} is shadowed by identical suffix pattern at index ${i}`,
          indices: [i, j],
        });
      }
    }
  }

  return { clean: issues.length === 0, issues };
}
