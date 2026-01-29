/**
 * Tests for compat-linter.ts
 *
 * Validates all 9 linter checks, regression gates against actual rule
 * builder outputs, and lintGoal validation.
 */

import { describe, it, expect } from 'vitest';
import { lintRules, lintGoal } from '../compat-linter';
import type { LintableRule, LintContext } from '../compat-linter';
import { buildToolProgressionRules } from '../minecraft-tool-progression-rules';

// ============================================================================
// Helpers
// ============================================================================

function makeRule(overrides: Partial<LintableRule> = {}): LintableRule {
  return {
    action: 'craft:test',
    actionType: 'craft',
    produces: [{ name: 'test_item', count: 1 }],
    consumes: [{ name: 'raw_material', count: 1 }],
    requires: [],
    ...overrides,
  };
}

function findIssueByCode(
  rules: LintableRule[],
  code: string,
  context?: LintContext
) {
  const report = lintRules(rules, context);
  return report.issues.find((i) => i.code === code);
}

// ============================================================================
// Individual check tests
// ============================================================================

describe('lintRules', () => {
  // --- UNSUPPORTED_ACTION_TYPE ---
  describe('UNSUPPORTED_ACTION_TYPE', () => {
    it('flags unknown action type', () => {
      const rule = makeRule({ actionType: 'upgrade' });
      const issue = findIssueByCode([rule], 'UNSUPPORTED_ACTION_TYPE');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('error');
    });

    it('accepts valid action types', () => {
      for (const type of ['craft', 'mine', 'smelt', 'place']) {
        const rule = makeRule({
          actionType: type,
          action: type === 'place' ? 'place:test' : `${type}:test`,
          consumes: type === 'place' ? [] : [{ name: 'raw', count: 1 }],
        });
        const issue = findIssueByCode([rule], 'UNSUPPORTED_ACTION_TYPE');
        expect(issue).toBeUndefined();
      }
    });
  });

  // --- INVALID_PLACE_ID ---
  describe('INVALID_PLACE_ID', () => {
    it('flags place action not matching place:<item>', () => {
      const rule = makeRule({
        actionType: 'place',
        action: 'tp:place:crafting_table',
        consumes: [],
      });
      const issue = findIssueByCode([rule], 'INVALID_PLACE_ID');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('error');
    });

    it('accepts valid place:<item> format', () => {
      const rule = makeRule({
        actionType: 'place',
        action: 'place:crafting_table',
        consumes: [],
      });
      const issue = findIssueByCode([rule], 'INVALID_PLACE_ID');
      expect(issue).toBeUndefined();
    });
  });

  // --- MINE_REQUIRES_NO_INVARIANT ---
  describe('MINE_REQUIRES_NO_INVARIANT', () => {
    it('flags mine rule with requires but no consume+produce invariant', () => {
      const rule = makeRule({
        action: 'mine:iron_ore',
        actionType: 'mine',
        produces: [{ name: 'raw_iron', count: 1 }],
        consumes: [],
        requires: [{ name: 'cap:has_stone_pickaxe', count: 1 }],
      });
      const issue = findIssueByCode([rule], 'MINE_REQUIRES_NO_INVARIANT');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('error');
    });

    it('accepts mine rule with proper invariant', () => {
      const rule = makeRule({
        action: 'mine:iron_ore',
        actionType: 'mine',
        produces: [
          { name: 'raw_iron', count: 1 },
          { name: 'cap:has_stone_pickaxe', count: 1 },
        ],
        consumes: [{ name: 'cap:has_stone_pickaxe', count: 1 }],
        requires: [{ name: 'cap:has_stone_pickaxe', count: 1 }],
      });
      const issue = findIssueByCode([rule], 'MINE_REQUIRES_NO_INVARIANT');
      expect(issue).toBeUndefined();
    });
  });

  // --- MINE_TIERGATED_NO_INVARIANT ---
  describe('MINE_TIERGATED_NO_INVARIANT', () => {
    it('flags mine rule producing tier-gated resource with no cap: invariant', () => {
      const rule = makeRule({
        action: 'mine:cobblestone',
        actionType: 'mine',
        produces: [{ name: 'cobblestone', count: 4 }],
        consumes: [],
        requires: [],
      });
      const issue = findIssueByCode([rule], 'MINE_TIERGATED_NO_INVARIANT');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('error');
    });

    it('accepts mine rule producing tier-gated resource with invariant', () => {
      const rule = makeRule({
        action: 'tp:mine:cobblestone',
        actionType: 'mine',
        produces: [
          { name: 'cobblestone', count: 4 },
          { name: 'cap:has_wooden_pickaxe', count: 1 },
        ],
        consumes: [{ name: 'cap:has_wooden_pickaxe', count: 1 }],
        requires: [{ name: 'cap:has_wooden_pickaxe', count: 1 }],
      });
      const issue = findIssueByCode([rule], 'MINE_TIERGATED_NO_INVARIANT');
      expect(issue).toBeUndefined();
    });

    it('does not flag mine rule for non-tier-gated product', () => {
      const rule = makeRule({
        action: 'mine:oak_log',
        actionType: 'mine',
        produces: [{ name: 'oak_log', count: 3 }],
        consumes: [],
        requires: [],
      });
      const issue = findIssueByCode([rule], 'MINE_TIERGATED_NO_INVARIANT');
      expect(issue).toBeUndefined();
    });
  });

  // --- PLACE_ACTION_UNNAMESPACED ---
  describe('PLACE_ACTION_UNNAMESPACED', () => {
    it('warns when place action has no executionMode isolation', () => {
      const rule = makeRule({
        actionType: 'place',
        action: 'place:crafting_table',
        consumes: [],
      });
      const issue = findIssueByCode([rule], 'PLACE_ACTION_UNNAMESPACED');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('warning');
    });

    it('does not warn when executionMode is provided', () => {
      const rule = makeRule({
        actionType: 'place',
        action: 'place:crafting_table',
        consumes: [],
      });
      const issue = findIssueByCode(
        [rule],
        'PLACE_ACTION_UNNAMESPACED',
        { executionMode: 'tool_progression' }
      );
      expect(issue).toBeUndefined();
    });

    it('does not warn when solverId is provided', () => {
      const rule = makeRule({
        actionType: 'place',
        action: 'place:crafting_table',
        consumes: [],
      });
      const issue = findIssueByCode(
        [rule],
        'PLACE_ACTION_UNNAMESPACED',
        { solverId: 'minecraft.tool_progression' }
      );
      expect(issue).toBeUndefined();
    });
  });

  // --- INVALID_ITEM_NAME ---
  describe('INVALID_ITEM_NAME', () => {
    it('flags empty item name', () => {
      const rule = makeRule({
        produces: [{ name: '', count: 1 }],
      });
      const issue = findIssueByCode([rule], 'INVALID_ITEM_NAME');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('error');
    });
  });

  // --- INVALID_ITEM_COUNT ---
  describe('INVALID_ITEM_COUNT', () => {
    it('flags zero count', () => {
      const rule = makeRule({
        produces: [{ name: 'test', count: 0 }],
      });
      const issue = findIssueByCode([rule], 'INVALID_ITEM_COUNT');
      expect(issue).toBeDefined();
    });

    it('flags negative count', () => {
      const rule = makeRule({
        produces: [{ name: 'test', count: -1 }],
      });
      const issue = findIssueByCode([rule], 'INVALID_ITEM_COUNT');
      expect(issue).toBeDefined();
    });

    it('flags fractional count', () => {
      const rule = makeRule({
        produces: [{ name: 'test', count: 1.5 }],
      });
      const issue = findIssueByCode([rule], 'INVALID_ITEM_COUNT');
      expect(issue).toBeDefined();
    });
  });

  // --- DUPLICATE_ACTION_ID ---
  describe('DUPLICATE_ACTION_ID', () => {
    it('flags duplicate action IDs', () => {
      const rules = [
        makeRule({ action: 'craft:test' }),
        makeRule({ action: 'craft:test' }),
      ];
      const issue = findIssueByCode(rules, 'DUPLICATE_ACTION_ID');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('error');
    });
  });

  // --- PLACE_HAS_CONSUMES ---
  describe('PLACE_HAS_CONSUMES', () => {
    it('flags place rule with non-empty consumes', () => {
      const rule = makeRule({
        actionType: 'place',
        action: 'place:crafting_table',
        consumes: [{ name: 'crafting_table', count: 1 }],
      });
      const issue = findIssueByCode([rule], 'PLACE_HAS_CONSUMES');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('error');
    });

    it('accepts place rule with empty consumes', () => {
      const rule = makeRule({
        actionType: 'place',
        action: 'place:crafting_table',
        consumes: [],
      });
      const issue = findIssueByCode([rule], 'PLACE_HAS_CONSUMES');
      expect(issue).toBeUndefined();
    });
  });

  // --- Report shape ---
  describe('report shape', () => {
    it('returns valid: true for clean rules', () => {
      const report = lintRules([makeRule()]);
      expect(report.valid).toBe(true);
      expect(report.issues).toHaveLength(0);
      expect(report.checkedAt).toBeGreaterThan(0);
      expect(report.definitionCount).toBe(1);
    });

    it('returns valid: false when errors present', () => {
      const rule = makeRule({ actionType: 'invalid' });
      const report = lintRules([rule]);
      expect(report.valid).toBe(false);
    });

    it('returns valid: true when only warnings present', () => {
      const rule = makeRule({
        actionType: 'place',
        action: 'place:test',
        consumes: [],
      });
      // No context -> PLACE_ACTION_UNNAMESPACED warning
      const report = lintRules([rule]);
      expect(report.issues.some((i) => i.severity === 'warning')).toBe(true);
      expect(report.issues.some((i) => i.severity === 'error')).toBe(false);
      expect(report.valid).toBe(true);
    });
  });
});

// ============================================================================
// Regression gate: actual rule builder outputs
// ============================================================================

describe('regression gate: actual rule builders', () => {
  it('wooden_pickaxe rules pass with zero errors', () => {
    const { rules } = buildToolProgressionRules(
      'wooden_pickaxe', 'pickaxe', null, 'wooden', []
    );
    const report = lintRules(rules, {
      executionMode: 'tool_progression',
      solverId: 'minecraft.tool_progression',
    });
    const errors = report.issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('stone_pickaxe rules pass with zero errors', () => {
    const { rules } = buildToolProgressionRules(
      'stone_pickaxe', 'pickaxe', 'wooden', 'stone', ['stone']
    );
    const report = lintRules(rules, {
      executionMode: 'tool_progression',
      solverId: 'minecraft.tool_progression',
    });
    const errors = report.issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('iron_pickaxe rules pass with zero errors', () => {
    const { rules } = buildToolProgressionRules(
      'iron_pickaxe', 'pickaxe', 'stone', 'iron', ['iron_ore', 'coal_ore']
    );
    const report = lintRules(rules, {
      executionMode: 'tool_progression',
      solverId: 'minecraft.tool_progression',
    });
    const errors = report.issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});

// ============================================================================
// lintGoal
// ============================================================================

describe('lintGoal', () => {
  it('accepts {wooden_pickaxe: 1}', () => {
    const issues = lintGoal({ wooden_pickaxe: 1 });
    expect(issues).toHaveLength(0);
  });

  it('rejects cap: tokens in goal', () => {
    const issues = lintGoal({ 'cap:has_wooden_pickaxe': 1 });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].code).toBe('INVALID_ITEM_NAME');
  });

  it('rejects zero count', () => {
    const issues = lintGoal({ wooden_pickaxe: 0 });
    expect(issues.some((i) => i.code === 'INVALID_ITEM_COUNT')).toBe(true);
  });

  it('rejects negative count', () => {
    const issues = lintGoal({ wooden_pickaxe: -1 });
    expect(issues.some((i) => i.code === 'INVALID_ITEM_COUNT')).toBe(true);
  });
});
