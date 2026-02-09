/**
 * Rule Validator — Rig A Certification Hardening (P1)
 *
 * Fail-closed validation gate for MinecraftCraftingRule sets.
 * Runs schema validation (via Zod) and semantic checks before rules
 * reach Sterling. If any error is found, the entire rule set is rejected
 * and Sterling is never called.
 *
 * This is distinct from the compat-linter (compat-linter.ts), which is
 * advisory and doesn't abort solves. The rule validator is the hard gate.
 *
 * Semantic checks:
 *   - CONSUME_EXCEEDS_REQUIRE: rule consumes more of an item than it requires
 *   - SELF_LOOP: rule both consumes and produces the same item (warning)
 *   - INVALID_PRODUCTION: produces count ≤ 0
 *   - NEGATIVE_COST: baseCost ≤ 0
 *   - UNBOUNDED_COST: baseCost > 1000
 *   - UNBOUNDED_DELTA: item count outside [-64, 64]
 *   - TOO_MANY_RULES: rule set exceeds 1000 rules
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';
import type { MinecraftCraftingRule, CraftingInventoryItem } from '../sterling/minecraft-crafting-types';

// ============================================================================
// Constants
// ============================================================================

/** Maximum allowed rules in a single solve request */
export const MAX_RULE_COUNT = 1000;

/** Maximum allowed baseCost value */
export const MAX_BASE_COST = 1000;

/** Maximum absolute value for item counts (production/consumption deltas) */
export const MAX_ITEM_DELTA = 64;

// ============================================================================
// Validation Types
// ============================================================================

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationError {
  severity: ValidationSeverity;
  code: string;
  ruleAction: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  rulesAccepted: number;
  rulesRejected: number;
}

export type ValidateRulesResult =
  | { valid: true; rules: MinecraftCraftingRule[]; report: ValidationReport }
  | { valid: false; error: string; details: ValidationError[]; report: ValidationReport };

// ============================================================================
// Zod Schemas
// ============================================================================

const InventoryItemSchema = z.object({
  name: z.string().min(1).max(128),
  count: z.number().int().min(-MAX_ITEM_DELTA).max(MAX_ITEM_DELTA),
});

const CraftingRuleSchema = z.object({
  action: z.string().min(1).max(256),
  actionType: z.enum(['craft', 'mine', 'smelt', 'place']),
  produces: z.array(InventoryItemSchema).max(16),
  consumes: z.array(InventoryItemSchema).max(16),
  requires: z.array(InventoryItemSchema).max(16),
  needsTable: z.boolean(),
  needsFurnace: z.boolean(),
  baseCost: z.number().positive().max(MAX_BASE_COST),
  // Optional temporal fields (Rig C)
  durationTicks: z.number().int().nonnegative().optional(),
  requiresSlotType: z.string().optional(),
});

const RuleSetSchema = z.array(CraftingRuleSchema).max(MAX_RULE_COUNT);

// ============================================================================
// Semantic Validation
// ============================================================================

/**
 * Run semantic checks on a structurally valid rule set.
 *
 * These checks catch logical errors that the Zod schema cannot express,
 * such as consuming more than required or producing non-positive amounts.
 */
function validateSemantics(rules: MinecraftCraftingRule[]): ValidationError[] {
  const issues: ValidationError[] = [];
  const seenActions = new Set<string>();

  for (const rule of rules) {
    // DUPLICATE_ACTION: two rules share the same action key
    if (seenActions.has(rule.action)) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_ACTION',
        ruleAction: rule.action,
        message: `Duplicate action ID '${rule.action}'`,
      });
    }
    seenActions.add(rule.action);

    // INVALID_PRODUCTION: produces count must be positive
    for (const item of rule.produces) {
      if (item.count <= 0) {
        issues.push({
          severity: 'error',
          code: 'INVALID_PRODUCTION',
          ruleAction: rule.action,
          message: `Produces non-positive amount of '${item.name}': ${item.count}`,
        });
      }
    }

    // CONSUME_EXCEEDS_REQUIRE: consumes more than requires for the same item
    // Only applies when the rule has requires entries — mine rules with requires
    // must have consume+produce invariants (checked by compat-linter), but the
    // certification validator catches the general case.
    if (rule.requires.length > 0) {
      const requireMap = new Map<string, number>();
      for (const req of rule.requires) {
        requireMap.set(req.name, (requireMap.get(req.name) ?? 0) + req.count);
      }

      for (const consumed of rule.consumes) {
        const required = requireMap.get(consumed.name) ?? 0;
        // Skip cap: tokens (virtual invariant tokens, not real inventory)
        if (consumed.name.startsWith('cap:')) continue;
        if (consumed.count > required && required > 0) {
          issues.push({
            severity: 'error',
            code: 'CONSUME_EXCEEDS_REQUIRE',
            ruleAction: rule.action,
            message: `Consumes ${consumed.count} '${consumed.name}' but only requires ${required}`,
          });
        }
      }
    }

    // SELF_LOOP: produces and consumes the same item (warning — can be valid
    // for invariant pairs like cap: tokens, but flagged for awareness)
    const producedNames = new Set(rule.produces.map(p => p.name));
    for (const consumed of rule.consumes) {
      if (producedNames.has(consumed.name) && !consumed.name.startsWith('cap:')) {
        issues.push({
          severity: 'warning',
          code: 'SELF_LOOP',
          ruleAction: rule.action,
          message: `Rule both consumes and produces '${consumed.name}'`,
        });
      }
    }

    // UNBOUNDED_DELTA: item counts outside safe range
    const allItems = [...rule.produces, ...rule.consumes, ...rule.requires];
    for (const item of allItems) {
      if (Math.abs(item.count) > MAX_ITEM_DELTA) {
        issues.push({
          severity: 'error',
          code: 'UNBOUNDED_DELTA',
          ruleAction: rule.action,
          message: `Item '${item.name}' has count ${item.count} outside [-${MAX_ITEM_DELTA}, ${MAX_ITEM_DELTA}]`,
        });
      }
    }
  }

  return issues;
}

// ============================================================================
// Capability-Consistency Validation (Rig B Hardening)
// ============================================================================

/**
 * Known tier-gated resources — items that require a specific pickaxe tier to mine.
 * Sourced from TIER_GATE_MATRIX in minecraft-tool-progression-types.ts.
 * Kept inline here to avoid circular dependency.
 */
const TIER_GATED_PRODUCTS = new Set([
  'cobblestone', 'stone', 'coal',
  'raw_iron', 'iron_ore', 'raw_copper', 'copper_ore', 'lapis_lazuli',
  'raw_gold', 'gold_ore', 'diamond', 'diamond_ore',
  'redstone', 'emerald', 'quartz',
  'ancient_debris', 'obsidian', 'netherite_scrap',
]);

/**
 * Known cap: token prefixes that form valid capability atoms.
 * Unknown prefixes are rejected as UNKNOWN_CAP_ATOM.
 */
const KNOWN_CAP_PREFIXES = [
  'cap:has_',
  'cap:can_mine_',
] as const;

/**
 * Validate capability-consistency for rules that use cap: tokens.
 * These checks are Rig B hardening — they enforce that capability tokens
 * are used correctly in the invariant pattern.
 *
 * Checks:
 *   - MINE_TIERGATED_NO_CAP: mine rule produces tier-gated resource but has
 *     no cap: invariant pair (Sterling can't enforce the requirement)
 *   - UNKNOWN_CAP_ATOM: cap: token doesn't match any known prefix pattern
 */
function validateCapabilityConsistency(rules: MinecraftCraftingRule[]): ValidationError[] {
  const issues: ValidationError[] = [];

  for (const rule of rules) {
    // MINE_TIERGATED_NO_CAP: mine rule produces tier-gated resource without cap: invariant
    if (rule.actionType === 'mine') {
      const producesTierGated = rule.produces.some(
        p => TIER_GATED_PRODUCTS.has(p.name)
      );
      if (producesTierGated) {
        const hasCapInvariant = rule.consumes.some(c =>
          c.name.startsWith('cap:') &&
          rule.produces.some(p => p.name === c.name && p.count === c.count)
        );
        if (!hasCapInvariant) {
          issues.push({
            severity: 'error',
            code: 'MINE_TIERGATED_NO_CAP',
            ruleAction: rule.action,
            message: `Mine rule produces tier-gated resource but has no cap: invariant pair — Sterling cannot enforce capability gate`,
          });
        }
      }
    }

    // UNKNOWN_CAP_ATOM: cap: tokens that don't match known prefixes
    const allItems = [...rule.produces, ...rule.consumes, ...rule.requires];
    for (const item of allItems) {
      if (item.name.startsWith('cap:')) {
        const matchesKnown = KNOWN_CAP_PREFIXES.some(prefix =>
          item.name.startsWith(prefix)
        );
        if (!matchesKnown) {
          issues.push({
            severity: 'error',
            code: 'UNKNOWN_CAP_ATOM',
            ruleAction: rule.action,
            message: `Unknown capability atom '${item.name}' — must match known prefix (${KNOWN_CAP_PREFIXES.join(', ')})`,
          });
        }
      }
    }
  }

  return issues;
}

// ============================================================================
// Validation Options
// ============================================================================

export interface ValidateRulesOptions {
  /**
   * When true, run Rig B capability-consistency checks:
   * - MINE_TIERGATED_NO_CAP: mine rule for tier-gated resource without cap: invariant
   * - UNKNOWN_CAP_ATOM: unrecognized cap: token prefix
   *
   * Default: false (Rig A crafting rules don't use cap: tokens)
   */
  checkCapabilityConsistency?: boolean;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Validate a rule set with schema + semantic checks. Fail-closed.
 *
 * Returns either validated rules or a rejection with error details.
 * When validation fails, Sterling is never called.
 *
 * Usage in solver:
 * ```ts
 * const validation = validateRules(rules);
 * if (!validation.valid) {
 *   return { solved: false, error: validation.error, validationErrors: validation.details };
 * }
 * const validatedRules = validation.rules;
 * ```
 */
export function validateRules(rules: unknown, options?: ValidateRulesOptions): ValidateRulesResult {
  // Step 1: Schema validation via Zod
  const parseResult = RuleSetSchema.safeParse(rules);
  if (!parseResult.success) {
    const zodErrors: ValidationError[] = parseResult.error.errors.map(e => ({
      severity: 'error' as const,
      code: 'SCHEMA_ERROR',
      ruleAction: String(e.path[0] ?? 'unknown'),
      message: `${e.path.join('.')}: ${e.message}`,
    }));

    const report: ValidationReport = {
      valid: false,
      errors: zodErrors,
      warnings: [],
      rulesAccepted: 0,
      rulesRejected: Array.isArray(rules) ? rules.length : 1,
    };

    return {
      valid: false,
      error: `Schema validation failed: ${zodErrors.length} error(s)`,
      details: zodErrors,
      report,
    };
  }

  const validRules = parseResult.data as MinecraftCraftingRule[];

  // Step 2: Boundedness check (rule count — already enforced by Zod .max(),
  // but explicit check for clarity)
  if (validRules.length > MAX_RULE_COUNT) {
    const error: ValidationError = {
      severity: 'error',
      code: 'TOO_MANY_RULES',
      ruleAction: '*',
      message: `Rule set has ${validRules.length} rules, exceeding maximum of ${MAX_RULE_COUNT}`,
    };
    const report: ValidationReport = {
      valid: false,
      errors: [error],
      warnings: [],
      rulesAccepted: 0,
      rulesRejected: validRules.length,
    };
    return { valid: false, error: error.message, details: [error], report };
  }

  // Step 3: Semantic validation
  const semanticIssues = validateSemantics(validRules);

  // Step 3b: Capability-consistency validation (Rig B hardening, opt-in)
  if (options?.checkCapabilityConsistency) {
    semanticIssues.push(...validateCapabilityConsistency(validRules));
  }

  const errors = semanticIssues.filter(i => i.severity === 'error');
  const warnings = semanticIssues.filter(i => i.severity === 'warning');

  const report: ValidationReport = {
    valid: errors.length === 0,
    errors,
    warnings,
    rulesAccepted: errors.length === 0 ? validRules.length : 0,
    rulesRejected: errors.length === 0 ? 0 : validRules.length,
  };

  if (errors.length > 0) {
    return {
      valid: false,
      error: `Semantic validation failed: ${errors.map(e => `${e.code} (${e.ruleAction})`).join(', ')}`,
      details: errors,
      report,
    };
  }

  return { valid: true, rules: validRules, report };
}
