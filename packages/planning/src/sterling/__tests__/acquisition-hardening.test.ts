/**
 * Acquisition Hardening Tests — Compat linter checks for acquisition rules.
 *
 * Verifies:
 * - TRADE_REQUIRES_ENTITY: acq:trade:* without proximity:villager token
 * - ACQ_FREE_PRODUCTION: structural "no free production" for all acq:* prefixes
 * - ACQUISITION_NO_VIABLE_STRATEGY: uses candidateCount (not rules.length)
 * - enableAcqHardening flag gates checks without requiring minecraft solverId
 * - Token specificity: trade requires proximity:villager, loot requires proximity:chest
 * - Valid rules pass all checks
 * - Existing 11 checks unaffected
 */

import { describe, it, expect } from 'vitest';
import { lintRules, type LintableRule, type LintContext } from '../compat-linter';

const ACQ_CONTEXT: LintContext = { solverId: 'minecraft.acquisition' };

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTradeRule(overrides: Partial<LintableRule> = {}): LintableRule {
  return {
    action: 'acq:trade:iron_ingot',
    actionType: 'craft',
    produces: [{ name: 'iron_ingot', count: 1 }],
    consumes: [{ name: 'emerald', count: 1 }],
    requires: [{ name: 'proximity:villager', count: 1 }],
    ...overrides,
  };
}

function makeLootRule(overrides: Partial<LintableRule> = {}): LintableRule {
  return {
    action: 'acq:loot:diamond',
    actionType: 'craft',
    produces: [{ name: 'diamond', count: 1 }],
    consumes: [],
    requires: [{ name: 'proximity:chest', count: 1 }],
    ...overrides,
  };
}

function makeSalvageRule(overrides: Partial<LintableRule> = {}): LintableRule {
  return {
    action: 'acq:salvage:iron_ingot:from:iron_sword',
    actionType: 'craft',
    produces: [{ name: 'iron_ingot', count: 2 }],
    consumes: [{ name: 'iron_sword', count: 1 }],
    requires: [],
    ...overrides,
  };
}

function findIssue(report: ReturnType<typeof lintRules>, code: string) {
  return report.issues.find(i => i.code === code);
}

// ── TRADE_REQUIRES_ENTITY ──────────────────────────────────────────────────

describe('TRADE_REQUIRES_ENTITY', () => {
  it('acq:trade with empty requires → error', () => {
    const rule = makeTradeRule({ requires: [] });
    const report = lintRules([rule], ACQ_CONTEXT);
    const issue = findIssue(report, 'TRADE_REQUIRES_ENTITY');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('error');
  });

  it('acq:trade with consumes=[emerald] but no proximity requires → error', () => {
    const rule = makeTradeRule({
      consumes: [{ name: 'emerald', count: 1 }],
      requires: [],
    });
    const report = lintRules([rule], ACQ_CONTEXT);
    expect(findIssue(report, 'TRADE_REQUIRES_ENTITY')).toBeDefined();
  });

  it('acq:trade with consumes=[emerald] + requires=[proximity:villager] → passes', () => {
    const rule = makeTradeRule();
    const report = lintRules([rule], ACQ_CONTEXT);
    expect(findIssue(report, 'TRADE_REQUIRES_ENTITY')).toBeUndefined();
  });

  it('acq:trade with wrong proximity token (proximity:chest) → error', () => {
    const rule = makeTradeRule({
      requires: [{ name: 'proximity:chest', count: 1 }],
    });
    const report = lintRules([rule], ACQ_CONTEXT);
    expect(findIssue(report, 'TRADE_REQUIRES_ENTITY')).toBeDefined();
  });

  it('not triggered for non-acquisition solverId', () => {
    const rule = makeTradeRule({ requires: [] });
    const report = lintRules([rule], { solverId: 'minecraft.crafting' });
    expect(findIssue(report, 'TRADE_REQUIRES_ENTITY')).toBeUndefined();
  });

  it('triggered via enableAcqHardening flag (no solverId needed)', () => {
    const rule = makeTradeRule({ requires: [] });
    const report = lintRules([rule], { enableAcqHardening: true });
    expect(findIssue(report, 'TRADE_REQUIRES_ENTITY')).toBeDefined();
  });
});

// ── ACQ_FREE_PRODUCTION ────────────────────────────────────────────────────

describe('ACQ_FREE_PRODUCTION', () => {
  // Trade
  it('acq:trade with empty consumes → ACQ_FREE_PRODUCTION error', () => {
    const rule = makeTradeRule({
      consumes: [],
      requires: [{ name: 'proximity:villager', count: 1 }],
    });
    const report = lintRules([rule], ACQ_CONTEXT);
    expect(findIssue(report, 'ACQ_FREE_PRODUCTION')).toBeDefined();
  });

  it('acq:trade with consumes but no proximity → ACQ_FREE_PRODUCTION error', () => {
    const rule = makeTradeRule({
      consumes: [{ name: 'emerald', count: 1 }],
      requires: [],
    });
    const report = lintRules([rule], ACQ_CONTEXT);
    expect(findIssue(report, 'ACQ_FREE_PRODUCTION')).toBeDefined();
  });

  it('acq:trade with consumes=[emerald] + requires=[proximity:villager] → passes', () => {
    const rule = makeTradeRule();
    const report = lintRules([rule], ACQ_CONTEXT);
    expect(findIssue(report, 'ACQ_FREE_PRODUCTION')).toBeUndefined();
  });

  // Loot
  it('acq:loot with no requires → ACQ_FREE_PRODUCTION error', () => {
    const rule = makeLootRule({ requires: [] });
    const report = lintRules([rule], ACQ_CONTEXT);
    expect(findIssue(report, 'ACQ_FREE_PRODUCTION')).toBeDefined();
  });

  it('acq:loot with requires=[proximity:chest] → passes', () => {
    const rule = makeLootRule();
    const report = lintRules([rule], ACQ_CONTEXT);
    expect(findIssue(report, 'ACQ_FREE_PRODUCTION')).toBeUndefined();
  });

  it('acq:loot with wrong proximity token (proximity:villager) → ACQ_FREE_PRODUCTION error', () => {
    const rule = makeLootRule({
      requires: [{ name: 'proximity:villager', count: 1 }],
    });
    const report = lintRules([rule], ACQ_CONTEXT);
    expect(findIssue(report, 'ACQ_FREE_PRODUCTION')).toBeDefined();
  });

  // Salvage
  it('acq:salvage with empty consumes → ACQ_FREE_PRODUCTION error', () => {
    const rule = makeSalvageRule({ consumes: [] });
    const report = lintRules([rule], ACQ_CONTEXT);
    expect(findIssue(report, 'ACQ_FREE_PRODUCTION')).toBeDefined();
  });

  it('acq:salvage with consumes=[iron_sword] → passes', () => {
    const rule = makeSalvageRule();
    const report = lintRules([rule], ACQ_CONTEXT);
    expect(findIssue(report, 'ACQ_FREE_PRODUCTION')).toBeUndefined();
  });

  // Generic acq:*
  it('generic acq:* with empty consumes AND empty requires → error', () => {
    const rule: LintableRule = {
      action: 'acq:custom:thing',
      actionType: 'craft',
      produces: [{ name: 'thing', count: 1 }],
      consumes: [],
      requires: [],
    };
    const report = lintRules([rule], ACQ_CONTEXT);
    expect(findIssue(report, 'ACQ_FREE_PRODUCTION')).toBeDefined();
  });
});

// ── ACQUISITION_NO_VIABLE_STRATEGY ────────────────────────────────────────

describe('ACQUISITION_NO_VIABLE_STRATEGY', () => {
  it('candidateCount=0 with acquisition solverId → error', () => {
    const report = lintRules([], { ...ACQ_CONTEXT, candidateCount: 0 });
    expect(findIssue(report, 'ACQUISITION_NO_VIABLE_STRATEGY')).toBeDefined();
    expect(report.valid).toBe(false);
  });

  it('empty rules but candidateCount > 0 → no error (mine/craft delegation)', () => {
    // This is the material fix: mine/craft delegation produces 0 rules but
    // is valid because the child solver handles them. candidateCount reflects
    // the coordinator's enumeration, not the delegated rule count.
    const report = lintRules([], { ...ACQ_CONTEXT, candidateCount: 3 });
    expect(findIssue(report, 'ACQUISITION_NO_VIABLE_STRATEGY')).toBeUndefined();
    expect(report.valid).toBe(true);
  });

  it('falls back to rules.length when candidateCount not provided', () => {
    // Backwards compatibility: no candidateCount → uses rules.length
    const report = lintRules([], ACQ_CONTEXT);
    expect(findIssue(report, 'ACQUISITION_NO_VIABLE_STRATEGY')).toBeDefined();
  });

  it('non-empty rule set → no error', () => {
    const report = lintRules([makeTradeRule()], ACQ_CONTEXT);
    expect(findIssue(report, 'ACQUISITION_NO_VIABLE_STRATEGY')).toBeUndefined();
  });

  it('empty rule set with non-acquisition solverId → no error', () => {
    const report = lintRules([], { solverId: 'minecraft.crafting' });
    expect(findIssue(report, 'ACQUISITION_NO_VIABLE_STRATEGY')).toBeUndefined();
  });

  it('empty rule set with no context → no error', () => {
    const report = lintRules([]);
    expect(findIssue(report, 'ACQUISITION_NO_VIABLE_STRATEGY')).toBeUndefined();
  });

  it('triggered via enableAcqHardening flag', () => {
    const report = lintRules([], { enableAcqHardening: true, candidateCount: 0 });
    expect(findIssue(report, 'ACQUISITION_NO_VIABLE_STRATEGY')).toBeDefined();
  });
});

// ── Existing checks unaffected ─────────────────────────────────────────────

describe('Existing checks unaffected by acquisition additions', () => {
  it('UNSUPPORTED_ACTION_TYPE still fires for unknown types', () => {
    const rule: LintableRule = {
      action: 'test',
      actionType: 'unknown',
      produces: [{ name: 'a', count: 1 }],
      consumes: [],
      requires: [],
    };
    const report = lintRules([rule]);
    expect(findIssue(report, 'UNSUPPORTED_ACTION_TYPE')).toBeDefined();
  });

  it('DUPLICATE_ACTION_ID still fires', () => {
    const rule: LintableRule = {
      action: 'craft:test',
      actionType: 'craft',
      produces: [{ name: 'a', count: 1 }],
      consumes: [],
      requires: [],
    };
    const report = lintRules([rule, rule]);
    expect(findIssue(report, 'DUPLICATE_ACTION_ID')).toBeDefined();
  });

  it('INVALID_ITEM_NAME still fires', () => {
    const rule: LintableRule = {
      action: 'craft:test',
      actionType: 'craft',
      produces: [{ name: '', count: 1 }],
      consumes: [],
      requires: [],
    };
    const report = lintRules([rule]);
    expect(findIssue(report, 'INVALID_ITEM_NAME')).toBeDefined();
  });

  it('INVALID_ITEM_COUNT still fires', () => {
    const rule: LintableRule = {
      action: 'craft:test',
      actionType: 'craft',
      produces: [{ name: 'a', count: -1 }],
      consumes: [],
      requires: [],
    };
    const report = lintRules([rule]);
    expect(findIssue(report, 'INVALID_ITEM_COUNT')).toBeDefined();
  });

  it('valid non-acquisition rules remain valid', () => {
    const rule: LintableRule = {
      action: 'craft:oak_planks',
      actionType: 'craft',
      produces: [{ name: 'oak_planks', count: 4 }],
      consumes: [{ name: 'oak_log', count: 1 }],
      requires: [],
    };
    const report = lintRules([rule]);
    expect(report.valid).toBe(true);
    expect(report.issues).toHaveLength(0);
  });
});

// ── Full valid rule sets ───────────────────────────────────────────────────

describe('Full valid acquisition rule sets', () => {
  it('valid trade + loot + salvage rules → all pass', () => {
    const rules = [makeTradeRule(), makeLootRule(), makeSalvageRule()];
    const report = lintRules(rules, ACQ_CONTEXT);
    expect(report.valid).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it('report.definitionCount matches rule count', () => {
    const rules = [makeTradeRule(), makeLootRule()];
    const report = lintRules(rules, ACQ_CONTEXT);
    expect(report.definitionCount).toBe(2);
  });
});
