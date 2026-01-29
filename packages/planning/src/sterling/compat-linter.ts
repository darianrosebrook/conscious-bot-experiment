/**
 * Compat Linter
 *
 * Preflight rule validation encoding known Sterling backend hazards.
 * Advisory at runtime (does NOT abort on errors), enforced in CI via
 * test assertions. Returns structured CompatReport with stable error
 * codes for queryability.
 *
 * Nine checks:
 * - UNSUPPORTED_ACTION_TYPE: actionType not in {craft, mine, smelt, place}
 * - INVALID_PLACE_ID: place action doesn't match place:<item>
 * - MINE_REQUIRES_NO_INVARIANT: mine rule has requires without consume+produce invariant
 * - MINE_TIERGATED_NO_INVARIANT: mine rule produces tier-gated resource with no invariant
 * - PLACE_ACTION_UNNAMESPACED: place action with no executionMode isolation
 * - INVALID_ITEM_NAME: item name empty or not a string
 * - INVALID_ITEM_COUNT: item count not a positive integer
 * - DUPLICATE_ACTION_ID: two rules share same action ID
 * - PLACE_HAS_CONSUMES: place rule has non-empty consumes (double-decrement)
 *
 * @author @darianrosebrook
 */

import type { CompatReport, CompatIssue } from './solve-bundle-types';

// ============================================================================
// Lintable Types
// ============================================================================

export interface LintableRule {
  action: string;
  actionType: string;
  produces: Array<{ name: string; count: number }>;
  consumes: Array<{ name: string; count: number }>;
  requires: Array<{ name: string; count: number }>;
}

export interface LintContext {
  executionMode?: string;
  solverId?: string;
}

// ============================================================================
// Known tier-gated resources (items requiring a specific pickaxe tier)
// ============================================================================

const TIER_GATED_PRODUCTS = new Set([
  'cobblestone', 'stone', 'coal',
  'raw_iron', 'iron_ore', 'raw_copper', 'copper_ore', 'lapis_lazuli',
  'raw_gold', 'gold_ore', 'diamond', 'diamond_ore',
  'redstone', 'emerald', 'quartz',
  'ancient_debris', 'obsidian', 'netherite_scrap',
]);

const VALID_ACTION_TYPES = new Set(['craft', 'mine', 'smelt', 'place']);

// ============================================================================
// Linter
// ============================================================================

/**
 * Lint a set of rules for known Sterling backend hazards.
 *
 * Returns a CompatReport. Runtime does NOT abort on errors.
 * In CI, tests assert zero errors for all actual rule builder outputs.
 */
export function lintRules(rules: LintableRule[], context?: LintContext): CompatReport {
  const issues: CompatIssue[] = [];
  const seenActions = new Set<string>();

  for (const rule of rules) {
    // UNSUPPORTED_ACTION_TYPE
    if (!VALID_ACTION_TYPES.has(rule.actionType)) {
      issues.push({
        severity: 'error',
        code: 'UNSUPPORTED_ACTION_TYPE',
        ruleAction: rule.action,
        message: `actionType '${rule.actionType}' not in {craft, mine, smelt, place}`,
      });
    }

    // DUPLICATE_ACTION_ID
    if (seenActions.has(rule.action)) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_ACTION_ID',
        ruleAction: rule.action,
        message: `Duplicate action ID '${rule.action}'`,
      });
    }
    seenActions.add(rule.action);

    // INVALID_PLACE_ID
    if (rule.actionType === 'place') {
      if (!rule.action.match(/^place:[a-z_]+$/)) {
        issues.push({
          severity: 'error',
          code: 'INVALID_PLACE_ID',
          ruleAction: rule.action,
          message: `Place action must match 'place:<item>', got '${rule.action}'`,
        });
      }
    }

    // PLACE_HAS_CONSUMES
    if (rule.actionType === 'place' && rule.consumes.length > 0) {
      issues.push({
        severity: 'error',
        code: 'PLACE_HAS_CONSUMES',
        ruleAction: rule.action,
        message: `Place rule has non-empty consumes (Sterling internally decrements the placed item — double-decrement risk)`,
      });
    }

    // PLACE_ACTION_UNNAMESPACED
    if (rule.actionType === 'place' && rule.action.startsWith('place:')) {
      if (!context?.executionMode && !context?.solverId) {
        issues.push({
          severity: 'warning',
          code: 'PLACE_ACTION_UNNAMESPACED',
          ruleAction: rule.action,
          message: `Place action in solve with no executionMode/solverId isolation — known cross-contamination risk`,
        });
      }
    }

    // MINE_REQUIRES_NO_INVARIANT
    if (rule.actionType === 'mine' && rule.requires.length > 0) {
      for (const req of rule.requires) {
        const hasConsumeInvariant = rule.consumes.some(
          (c) => c.name === req.name && c.count === req.count
        );
        const hasProduceInvariant = rule.produces.some(
          (p) => p.name === req.name && p.count === req.count
        );
        if (!hasConsumeInvariant || !hasProduceInvariant) {
          issues.push({
            severity: 'error',
            code: 'MINE_REQUIRES_NO_INVARIANT',
            ruleAction: rule.action,
            message: `Mine rule has requires '${req.name}' without consume+produce invariant pair (Sterling skips requires for mine rules)`,
          });
        }
      }
    }

    // MINE_TIERGATED_NO_INVARIANT
    if (rule.actionType === 'mine') {
      const producesTierGated = rule.produces.some(
        (p) => TIER_GATED_PRODUCTS.has(p.name)
      );
      if (producesTierGated) {
        // Check that the rule has at least one cap: invariant pair
        const hasAnyInvariant = rule.consumes.some((c) =>
          c.name.startsWith('cap:') &&
          rule.produces.some((p) => p.name === c.name && p.count === c.count)
        );
        if (!hasAnyInvariant) {
          issues.push({
            severity: 'error',
            code: 'MINE_TIERGATED_NO_INVARIANT',
            ruleAction: rule.action,
            message: `Mine rule produces tier-gated resource but has no cap: invariant pair`,
          });
        }
      }
    }

    // Validate all items in produces, consumes, requires
    const allItems = [
      ...rule.produces.map((item) => ({ ...item, field: 'produces' })),
      ...rule.consumes.map((item) => ({ ...item, field: 'consumes' })),
      ...rule.requires.map((item) => ({ ...item, field: 'requires' })),
    ];

    for (const item of allItems) {
      // INVALID_ITEM_NAME
      if (typeof item.name !== 'string' || item.name === '') {
        issues.push({
          severity: 'error',
          code: 'INVALID_ITEM_NAME',
          ruleAction: rule.action,
          message: `Item in ${item.field} has invalid name: ${JSON.stringify(item.name)}`,
        });
      }

      // INVALID_ITEM_COUNT
      if (typeof item.count !== 'number' || !Number.isInteger(item.count) || item.count <= 0) {
        issues.push({
          severity: 'error',
          code: 'INVALID_ITEM_COUNT',
          ruleAction: rule.action,
          message: `Item '${item.name}' in ${item.field} has invalid count: ${item.count} (must be positive integer)`,
        });
      }
    }
  }

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    valid: !hasErrors,
    issues,
    checkedAt: Date.now(),
    definitionCount: rules.length,
  };
}

/**
 * Lint a goal record for known hazards.
 *
 * Rejects cap: tokens in goals (virtual tokens should not be solve goals).
 */
export function lintGoal(goal: Record<string, number>): CompatIssue[] {
  const issues: CompatIssue[] = [];

  for (const [name, count] of Object.entries(goal)) {
    if (name.startsWith('cap:')) {
      issues.push({
        severity: 'error',
        code: 'INVALID_ITEM_NAME',
        ruleAction: 'goal',
        message: `Goal contains virtual capability token '${name}' — cap: tokens must not be solve goals`,
      });
    }

    if (typeof name !== 'string' || name === '') {
      issues.push({
        severity: 'error',
        code: 'INVALID_ITEM_NAME',
        ruleAction: 'goal',
        message: `Goal has invalid item name: ${JSON.stringify(name)}`,
      });
    }

    if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) {
      issues.push({
        severity: 'error',
        code: 'INVALID_ITEM_COUNT',
        ruleAction: 'goal',
        message: `Goal item '${name}' has invalid count: ${count}`,
      });
    }
  }

  return issues;
}
