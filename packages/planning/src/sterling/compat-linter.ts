/**
 * Compat Linter
 *
 * Preflight rule validation encoding known Sterling backend hazards.
 * Advisory at runtime (does NOT abort on errors), enforced in CI via
 * test assertions. Returns structured CompatReport with stable error
 * codes for queryability.
 *
 * Fourteen checks:
 * - UNSUPPORTED_ACTION_TYPE: actionType not in {craft, mine, smelt, place}
 * - INVALID_PLACE_ID: place action doesn't match place:<item>
 * - MINE_REQUIRES_NO_INVARIANT: mine rule has requires without consume+produce invariant
 * - MINE_TIERGATED_NO_INVARIANT: mine rule produces tier-gated resource with no invariant
 * - PLACE_ACTION_UNNAMESPACED: place action with no executionMode isolation
 * - INVALID_ITEM_NAME: item name empty or not a string
 * - INVALID_ITEM_COUNT: item count not a positive integer
 * - DUPLICATE_ACTION_ID: two rules share same action ID
 * - PLACE_HAS_CONSUMES: place rule has non-empty consumes (double-decrement)
 * - INVALID_BASE_COST: baseCost defined but not a finite number > 0 and <= 1000
 * - FURNACE_OVERCAPACITY: furnace load rule produces without consuming slot occupancy
 * - TRADE_REQUIRES_ENTITY: acq:trade:* without proximity:villager token
 * - ACQ_FREE_PRODUCTION: acq:* rule with no consumes and no requires
 * - ACQUISITION_NO_VIABLE_STRATEGY: 0 viable candidates (uses candidateCount, not rules.length)
 *
 * Acquisition checks (12-14) are gated behind enableAcqHardening flag OR
 * solverId === 'minecraft.acquisition'. The flag-based gate allows transfer
 * tests to exercise hardening without masquerading as a Minecraft solver.
 *
 * @author @darianrosebrook
 */

import type { CompatReport, CompatIssue } from './solve-bundle-types';
import { SOLVER_IDS } from './solver-ids';

// ============================================================================
// Lintable Types
// ============================================================================

export interface LintableRule {
  action: string;
  actionType: string;
  produces: Array<{ name: string; count: number }>;
  consumes: Array<{ name: string; count: number }>;
  requires: Array<{ name: string; count: number }>;
  /**
   * Optional explicit cost for this rule. When undefined, Sterling applies
   * its own default cost for the action type (typically 1.0 for craft/mine/smelt,
   * backend-determined for place). When defined, must be a finite number > 0
   * and <= MAX_BASE_COST (1000). The linter only validates baseCost when present;
   * omitting it is the normal case for most rules.
   */
  baseCost?: number;
}

export interface LintContext {
  executionMode?: string;
  solverId?: string;
  /**
   * When set, enables acquisition-specific hardening checks (TRADE_REQUIRES_ENTITY,
   * ACQ_FREE_PRODUCTION, ACQUISITION_NO_VIABLE_STRATEGY) regardless of solverId.
   * The acquisition solver and transfer tests both set this to true.
   */
  enableAcqHardening?: boolean;
  /**
   * Number of candidates the coordinator will attempt to dispatch.
   *
   * This is the set of structurally enumerated strategies for the target item
   * (mine, trade, loot, salvage) that have a known domain path — not a
   * feasibility filter. A candidate with `feasibility: 'unknown'` is still
   * dispatchable (the sub-solver may succeed or fail at runtime).
   *
   * Used by ACQUISITION_NO_VIABLE_STRATEGY to distinguish:
   * - candidateCount === 0: no strategy path exists for this item (structural failure)
   * - candidateCount > 0 but rules === []: delegation-driven strategy (mine/craft)
   *   where the child solver handles rules, not the parent
   *
   * When undefined, falls back to rules.length for backwards compatibility.
   */
  candidateCount?: number;
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

const MAX_BASE_COST = 1000;

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

    // INVALID_BASE_COST — only fires when baseCost is explicitly defined
    if (rule.baseCost !== undefined) {
      const cost = rule.baseCost;
      if (
        typeof cost !== 'number' ||
        Number.isNaN(cost) ||
        !Number.isFinite(cost) ||
        cost <= 0 ||
        cost > MAX_BASE_COST
      ) {
        issues.push({
          severity: 'error',
          code: 'INVALID_BASE_COST',
          ruleAction: rule.action,
          message: `baseCost ${cost} is invalid (must be a finite number > 0 and <= ${MAX_BASE_COST})`,
        });
      }
    }

    // FURNACE_OVERCAPACITY — gated behind furnace solverId
    // Detects furnace load rules that don't properly track slot occupancy.
    // Fail-closed: if capacity cannot be proven from state, reject.
    if (context?.solverId === SOLVER_IDS.FURNACE) {
      if (
        rule.action.startsWith('furnace:load:') &&
        rule.consumes.length === 0
      ) {
        issues.push({
          severity: 'error',
          code: 'FURNACE_OVERCAPACITY',
          ruleAction: rule.action,
          message: `Furnace load rule must consume an input item to prevent overcapacity (slot double-booking)`,
        });
      }
    }

    // ── Acquisition-specific checks ──
    // Gated behind enableAcqHardening flag OR solverId === 'minecraft.acquisition'.
    // The flag-based gate allows transfer tests to exercise hardening without
    // masquerading as a Minecraft solver.

    const acqHardeningEnabled = context?.enableAcqHardening
      || context?.solverId === SOLVER_IDS.ACQUISITION;

    if (acqHardeningEnabled) {
      // TRADE_REQUIRES_ENTITY — acq:trade:* must have proximity:villager in requires
      if (rule.action.startsWith('acq:trade:')) {
        const hasVillagerProximity = rule.requires.some(
          (r) => r.name === 'proximity:villager'
        );
        if (!hasVillagerProximity) {
          issues.push({
            severity: 'error',
            code: 'TRADE_REQUIRES_ENTITY',
            ruleAction: rule.action,
            message: `Trade rule must require 'proximity:villager' token`,
          });
        }
      }

      // ACQ_FREE_PRODUCTION — structural "no free production" for acq:* rules
      if (rule.action.startsWith('acq:')) {
        if (rule.action.startsWith('acq:trade:')) {
          // Trade must consume at least one currency AND require proximity:villager
          const hasCurrencyConsume = rule.consumes.length > 0;
          const hasVillagerRequire = rule.requires.some(r => r.name === 'proximity:villager');
          if (!hasCurrencyConsume || !hasVillagerRequire) {
            issues.push({
              severity: 'error',
              code: 'ACQ_FREE_PRODUCTION',
              ruleAction: rule.action,
              message: `Trade rule must consume currency and require 'proximity:villager' token`,
            });
          }
        } else if (rule.action.startsWith('acq:loot:')) {
          // Loot must require a container-proximity token.
          // Convention: proximity:container:<kind> (e.g., proximity:container:chest).
          // Prefix check scales to new container types without linter edits.
          const hasContainerRequire = rule.requires.some(
            r => r.name.startsWith('proximity:container:')
          );
          if (!hasContainerRequire) {
            issues.push({
              severity: 'error',
              code: 'ACQ_FREE_PRODUCTION',
              ruleAction: rule.action,
              message: `Loot rule must require a 'proximity:container:<kind>' token (e.g., proximity:container:chest)`,
            });
          }
        } else if (rule.action.startsWith('acq:salvage:')) {
          // Salvage must consume the source item
          if (rule.consumes.length === 0) {
            issues.push({
              severity: 'error',
              code: 'ACQ_FREE_PRODUCTION',
              ruleAction: rule.action,
              message: `Salvage rule must consume the source item being salvaged`,
            });
          }
        } else {
          // Generic acq:* with empty consumes AND empty requires → rejected
          if (rule.consumes.length === 0 && rule.requires.length === 0) {
            issues.push({
              severity: 'error',
              code: 'ACQ_FREE_PRODUCTION',
              ruleAction: rule.action,
              message: `Acquisition rule must consume or require at least one token`,
            });
          }
        }
      }
    }
  }

  // ACQUISITION_NO_VIABLE_STRATEGY
  // Fires when the coordinator has 0 viable candidates. Uses candidateCount from
  // context when provided (coordinator passes it explicitly). Falls back to
  // rules.length for backwards compatibility. This distinction is critical:
  // mine/craft delegation produces 0 rules but is valid (child solver handles them).
  const acqCheckEnabled = context?.enableAcqHardening
    || context?.solverId === SOLVER_IDS.ACQUISITION;
  const effectiveCandidateCount = context?.candidateCount ?? rules.length;
  if (acqCheckEnabled && effectiveCandidateCount === 0) {
    issues.push({
      severity: 'error',
      code: 'ACQUISITION_NO_VIABLE_STRATEGY',
      ruleAction: '*',
      message: 'Acquisition solver has 0 viable candidates — no rules to solve',
    });
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
