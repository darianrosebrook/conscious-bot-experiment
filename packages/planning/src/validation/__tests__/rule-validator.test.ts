/**
 * Test 1: Rule validation rejection — Rig A Certification (P1)
 *
 * Proves: Invalid rules are rejected before Sterling is called (Pivot 1, 4).
 * Evidence: validateRules returns { valid: false } with actionable error codes.
 */

import { describe, it, expect } from 'vitest';
import { validateRules, MAX_RULE_COUNT, MAX_BASE_COST, MAX_ITEM_DELTA } from '../rule-validator';
import type { MinecraftCraftingRule } from '../../sterling/minecraft-crafting-types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeValidRule(overrides: Partial<MinecraftCraftingRule> = {}): MinecraftCraftingRule {
  return {
    action: 'craft:oak_planks',
    actionType: 'craft',
    produces: [{ name: 'oak_planks', count: 4 }],
    consumes: [{ name: 'oak_log', count: 1 }],
    requires: [],
    needsTable: false,
    needsFurnace: false,
    baseCost: 1.0,
    ...overrides,
  };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('Rig A - Rule validation', () => {
  it('rejects rules with invalid schema (negative cost)', () => {
    const invalidRules = [
      {
        action: 'bad_rule',
        actionType: 'craft',
        produces: [{ name: 'planks', count: 4 }],
        consumes: [{ name: 'wood', count: 1 }],
        requires: [],
        needsTable: false,
        needsFurnace: false,
        baseCost: -1,  // Negative cost — schema violation
      },
    ];

    const result = validateRules(invalidRules);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('Schema validation failed');
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.details[0].code).toBe('SCHEMA_ERROR');
    }
  });

  it('rejects rules with semantic errors (CONSUME_EXCEEDS_REQUIRE)', () => {
    const badRules: MinecraftCraftingRule[] = [{
      action: 'craft:planks',
      actionType: 'craft',
      produces: [{ name: 'planks', count: 4 }],
      consumes: [{ name: 'wood', count: 2 }],  // Consumes 2
      requires: [{ name: 'wood', count: 1 }],  // Only requires 1 — semantic violation
      needsTable: false,
      needsFurnace: false,
      baseCost: 1,
    }];

    const result = validateRules(badRules);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.details.some(d => d.code === 'CONSUME_EXCEEDS_REQUIRE')).toBe(true);
    }
  });

  it('accepts valid rules and returns them unchanged', () => {
    const validRules: MinecraftCraftingRule[] = [
      makeValidRule(),
      makeValidRule({
        action: 'mine:oak_log',
        actionType: 'mine',
        produces: [{ name: 'oak_log', count: 1 }],
        consumes: [],
        baseCost: 5.0,
      }),
    ];

    const result = validateRules(validRules);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.rules).toHaveLength(2);
      expect(result.rules[0].action).toBe('craft:oak_planks');
      expect(result.report.rulesAccepted).toBe(2);
      expect(result.report.rulesRejected).toBe(0);
    }
  });

  it('rejects non-positive production (INVALID_PRODUCTION)', () => {
    const badRules: MinecraftCraftingRule[] = [
      makeValidRule({
        produces: [{ name: 'planks', count: 0 }],  // Zero production
      }),
    ];

    const result = validateRules(badRules);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.details.some(d => d.code === 'INVALID_PRODUCTION')).toBe(true);
    }
  });

  it('rejects unbounded item deltas (UNBOUNDED_DELTA)', () => {
    const badRules: MinecraftCraftingRule[] = [
      makeValidRule({
        produces: [{ name: 'planks', count: MAX_ITEM_DELTA + 1 }],
      }),
    ];

    const result = validateRules(badRules);

    // The Zod schema catches this as a schema error (count max is 64)
    expect(result.valid).toBe(false);
  });

  it('rejects duplicate action IDs (DUPLICATE_ACTION)', () => {
    const dupeRules: MinecraftCraftingRule[] = [
      makeValidRule({ action: 'craft:same' }),
      makeValidRule({ action: 'craft:same' }),  // Duplicate
    ];

    const result = validateRules(dupeRules);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.details.some(d => d.code === 'DUPLICATE_ACTION')).toBe(true);
    }
  });

  it('warns on SELF_LOOP but does not reject', () => {
    const loopRules: MinecraftCraftingRule[] = [
      makeValidRule({
        action: 'craft:weird',
        produces: [{ name: 'iron_ingot', count: 1 }],
        consumes: [{ name: 'iron_ingot', count: 1 }],  // Consumes same item it produces
      }),
    ];

    const result = validateRules(loopRules);

    // SELF_LOOP is a warning, not an error — should still be valid
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.report.warnings.some(w => w.code === 'SELF_LOOP')).toBe(true);
    }
  });

  it('rejects invalid action type via schema', () => {
    const badType = [
      {
        action: 'craft:planks',
        actionType: 'destroy',  // Not in enum
        produces: [{ name: 'planks', count: 4 }],
        consumes: [{ name: 'wood', count: 1 }],
        requires: [],
        needsTable: false,
        needsFurnace: false,
        baseCost: 1,
      },
    ];

    const result = validateRules(badType);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.details[0].code).toBe('SCHEMA_ERROR');
    }
  });

  it('rejects non-array input', () => {
    const result = validateRules('not an array');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('Schema validation failed');
    }
  });
});
