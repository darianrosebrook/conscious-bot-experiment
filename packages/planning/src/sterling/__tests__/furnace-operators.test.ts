/**
 * Furnace Operators — Rule Builder + Linter Tests (C.3)
 *
 * Acceptance:
 * - Rule builder generates typed operators for all four families
 * - Each operator's preconditions enforced
 * - Overcapacity triggers FURNACE_OVERCAPACITY
 * - Valid furnace rules pass linter
 */

import { describe, it, expect } from 'vitest';
import {
  buildFurnaceRules,
  checkSlotPrecondition,
  SMELTABLE_ITEMS,
} from '../minecraft-furnace-rules';
import { lintRules } from '../compat-linter';
import type { LintContext } from '../compat-linter';

describe('buildFurnaceRules (C.3)', () => {
  it('generates four operator families per item', () => {
    const rules = buildFurnaceRules(['iron_ore'], 2);
    expect(rules).toHaveLength(4);

    const families = rules.map((r) => r.operatorFamily);
    expect(families).toContain('load_furnace');
    expect(families).toContain('add_fuel');
    expect(families).toContain('wait_tick');
    expect(families).toContain('retrieve_output');
  });

  it('generates rules for multiple items', () => {
    const rules = buildFurnaceRules(['iron_ore', 'gold_ore'], 2);
    expect(rules).toHaveLength(8); // 4 families * 2 items
  });

  it('ignores unknown items', () => {
    const rules = buildFurnaceRules(['not_a_real_item'], 1);
    expect(rules).toHaveLength(0);
  });

  it('load_furnace rule consumes the input item', () => {
    const rules = buildFurnaceRules(['iron_ore'], 1);
    const loadRule = rules.find((r) => r.operatorFamily === 'load_furnace')!;
    expect(loadRule.consumes).toEqual([{ name: 'iron_ore', count: 1 }]);
    expect(loadRule.produces).toEqual([]);
    expect(loadRule.actionType).toBe('craft');
    expect(loadRule.needsFurnace).toBe(true);
    expect(loadRule.requiresSlotType).toBe('furnace');
  });

  it('add_fuel rule consumes coal', () => {
    const rules = buildFurnaceRules(['iron_ore'], 1);
    const fuelRule = rules.find((r) => r.operatorFamily === 'add_fuel')!;
    expect(fuelRule.consumes).toEqual([{ name: 'coal', count: 1 }]);
    expect(fuelRule.actionType).toBe('craft');
  });

  it('wait_tick rule is smelt type with duration', () => {
    const rules = buildFurnaceRules(['iron_ore'], 1);
    const waitRule = rules.find((r) => r.operatorFamily === 'wait_tick')!;
    expect(waitRule.actionType).toBe('smelt');
    expect(waitRule.durationTicks).toBe(200);
    expect(waitRule.produces).toEqual([{ name: 'smelting:iron_ore', count: 1 }]);
  });

  it('retrieve_output rule produces the smelted item', () => {
    const rules = buildFurnaceRules(['iron_ore'], 1);
    const retrieveRule = rules.find((r) => r.operatorFamily === 'retrieve_output')!;
    expect(retrieveRule.produces).toEqual([{ name: 'iron_ingot', count: 1 }]);
    expect(retrieveRule.consumes).toEqual([{ name: 'smelting:iron_ore', count: 1 }]);
    expect(retrieveRule.actionType).toBe('craft');
  });
});

describe('slot precondition enforcement (C.3)', () => {
  it('load_furnace into occupied slot → overcapacity', () => {
    expect(checkSlotPrecondition(true, 'load_furnace')).toBe(true);
  });

  it('load_furnace into empty slot → allowed', () => {
    expect(checkSlotPrecondition(false, 'load_furnace')).toBe(false);
  });

  it('wait_tick on occupied slot → allowed', () => {
    expect(checkSlotPrecondition(true, 'wait_tick')).toBe(false);
  });

  it('retrieve_output on occupied slot → allowed', () => {
    expect(checkSlotPrecondition(true, 'retrieve_output')).toBe(false);
  });
});

describe('FURNACE_OVERCAPACITY compat-linter check (C.3)', () => {
  const furnaceContext: LintContext = { solverId: 'minecraft.furnace' };
  const craftingContext: LintContext = { solverId: 'minecraft.crafting' };

  it('triggers on furnace load rule with no consumes under furnace solverId', () => {
    const badRule = {
      action: 'furnace:load:iron_ore',
      actionType: 'craft',
      produces: [],
      consumes: [], // Missing consume → overcapacity
      requires: [],
    };
    const report = lintRules([badRule], furnaceContext);
    const overcapacityIssues = report.issues.filter(
      (i) => i.code === 'FURNACE_OVERCAPACITY',
    );
    expect(overcapacityIssues).toHaveLength(1);
    expect(overcapacityIssues[0].severity).toBe('error');
    expect(report.valid).toBe(false);
  });

  it('does NOT trigger for non-furnace solverId', () => {
    const badRule = {
      action: 'furnace:load:iron_ore',
      actionType: 'craft',
      produces: [],
      consumes: [],
      requires: [],
    };
    const report = lintRules([badRule], craftingContext);
    const overcapacityIssues = report.issues.filter(
      (i) => i.code === 'FURNACE_OVERCAPACITY',
    );
    expect(overcapacityIssues).toHaveLength(0);
  });

  it('does NOT trigger when load rule has proper consumes', () => {
    const goodRule = {
      action: 'furnace:load:iron_ore',
      actionType: 'craft',
      produces: [],
      consumes: [{ name: 'iron_ore', count: 1 }],
      requires: [],
    };
    const report = lintRules([goodRule], furnaceContext);
    const overcapacityIssues = report.issues.filter(
      (i) => i.code === 'FURNACE_OVERCAPACITY',
    );
    expect(overcapacityIssues).toHaveLength(0);
  });

  it('valid furnace rules pass linter', () => {
    const rules = buildFurnaceRules(['iron_ore'], 1);
    const report = lintRules(rules, furnaceContext);
    expect(report.valid).toBe(true);
    expect(report.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });
});
