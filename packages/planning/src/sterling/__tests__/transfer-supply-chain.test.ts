/**
 * Transfer Test — Supply Chain Procurement (Rig D)
 *
 * Proves the acquisition solver primitive signature is portable.
 * Domain: supply chain procurement (procurement.supplier_selection).
 * Strategies: manufacture, purchase, recycle, barter.
 *
 * ZERO Minecraft imports. Uses only the structural patterns:
 * - {action, actionType, produces, consumes, requires} schema
 * - acq: prefix pattern
 * - CandidateSetDigest computation
 * - Compat linter ACQ_FREE_PRODUCTION check
 * - Strategy ranking with priors
 * - RigDSignals computation
 */

import { describe, it, expect } from 'vitest';
import { canonicalize, contentHash } from '../solve-bundle';
import { lintRules, type LintableRule, type LintContext } from '../compat-linter';

// ── Supply Chain Domain Types (no Minecraft imports) ───────────────────────

type SupplyStrategy = 'manufacture' | 'purchase' | 'recycle' | 'barter';

interface SupplyCandidate {
  strategy: SupplyStrategy;
  item: string;
  estimatedCost: number;
  feasibility: 'available' | 'possible' | 'unknown';
  requires: string[];
}

interface SupplyPrior {
  strategy: SupplyStrategy;
  contextKey: string;
  successRate: number;
  sampleCount: number;
}

// ── Supply Chain Strategy Enumeration ──────────────────────────────────────

function buildSupplyStrategies(
  item: string,
  hasSupplier: boolean,
  hasRecyclableStock: boolean,
  hasBarterPartner: boolean,
): SupplyCandidate[] {
  const candidates: SupplyCandidate[] = [];

  // Manufacture: always possible if raw materials can be sourced
  candidates.push({
    strategy: 'manufacture',
    item,
    estimatedCost: 10,
    feasibility: 'available',
    requires: ['raw_materials', 'factory_capacity'],
  });

  // Purchase: available if supplier exists
  candidates.push({
    strategy: 'purchase',
    item,
    estimatedCost: hasSupplier ? 5 : 20,
    feasibility: hasSupplier ? 'available' : 'unknown',
    requires: ['currency', 'proximity:supplier'],
  });

  // Recycle: available if recyclable stock exists
  if (hasRecyclableStock) {
    candidates.push({
      strategy: 'recycle',
      item,
      estimatedCost: 3,
      feasibility: 'available',
      requires: ['recyclable_stock'],
    });
  }

  // Barter: available if partner exists
  candidates.push({
    strategy: 'barter',
    item,
    estimatedCost: hasBarterPartner ? 4 : 15,
    feasibility: hasBarterPartner ? 'available' : 'unknown',
    requires: ['barter_goods', 'proximity:partner'],
  });

  return candidates;
}

// ── Supply Chain Ranking ──────────────────────────────────────────────────

function rankSupplyStrategies(
  candidates: SupplyCandidate[],
  priors: SupplyPrior[],
): SupplyCandidate[] {
  const priorMap = new Map<string, SupplyPrior>();
  for (const p of priors) {
    priorMap.set(p.strategy, p);
  }

  const scored = candidates.map(c => {
    const prior = priorMap.get(c.strategy);
    const successRate = prior?.successRate ?? 0.5;
    const score = c.estimatedCost * (1 - successRate);
    const scoreMillis = Number.isNaN(score) || !Number.isFinite(score)
      ? Number.MAX_SAFE_INTEGER
      : Math.round(score * 1000);
    return { candidate: c, scoreMillis };
  });

  scored.sort((a, b) => {
    const diff = a.scoreMillis - b.scoreMillis;
    if (diff !== 0) return diff;
    const nameA = a.candidate.strategy;
    const nameB = b.candidate.strategy;
    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
  });

  return scored.map(s => s.candidate);
}

// ── Supply Chain CandidateSetDigest ───────────────────────────────────────

function lexCmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function computeSupplyDigest(candidates: SupplyCandidate[]): string {
  const sorted = [...candidates].sort((a, b) => {
    const cmp1 = lexCmp(a.strategy, b.strategy);
    if (cmp1 !== 0) return cmp1;
    return lexCmp(a.item, b.item);
  });
  const digestInput = sorted.map(c => ({
    strategy: c.strategy,
    item: c.item,
    estimatedCostMillis: Math.round(c.estimatedCost * 1000),
    feasibility: c.feasibility,
    requires: [...c.requires].sort(),
  }));
  return contentHash(canonicalize(digestInput));
}

// ── Supply Chain Rules (acq: prefix pattern) ─────────────────────────────

function buildSupplyRules(item: string, strategy: SupplyStrategy): LintableRule[] {
  switch (strategy) {
    case 'manufacture':
      return [{
        action: `acq:manufacture:${item}`,
        actionType: 'craft',
        produces: [{ name: item, count: 1 }],
        consumes: [{ name: 'raw_materials', count: 1 }],
        requires: [{ name: 'proximity:factory', count: 1 }],
      }];
    case 'purchase':
      return [{
        action: `acq:purchase:${item}`,
        actionType: 'craft',
        produces: [{ name: item, count: 1 }],
        consumes: [{ name: 'currency', count: 1 }],
        requires: [{ name: 'proximity:supplier', count: 1 }],
      }];
    case 'recycle':
      return [{
        action: `acq:recycle:${item}`,
        actionType: 'craft',
        produces: [{ name: item, count: 1 }],
        consumes: [{ name: 'recyclable_stock', count: 1 }],
        requires: [],
      }];
    case 'barter':
      return [{
        action: `acq:barter:${item}`,
        actionType: 'craft',
        produces: [{ name: item, count: 1 }],
        consumes: [{ name: 'barter_goods', count: 1 }],
        requires: [{ name: 'proximity:partner', count: 1 }],
      }];
  }
}

// ── Supply Chain Signals ─────────────────────────────────────────────────

interface SupplySignals {
  strategyCount: number;
  selectedStrategy: string | null;
  alternativeCount: number;
  candidateSetDigest: string;
  degenerateRanking: boolean;
}

function computeSupplySignals(
  ranked: SupplyCandidate[],
  digest: string,
): SupplySignals {
  if (ranked.length === 0) {
    return { strategyCount: 0, selectedStrategy: null, alternativeCount: 0, candidateSetDigest: digest, degenerateRanking: false };
  }
  const topCost = ranked[0].estimatedCost;
  let tiedCount = 1;
  for (let i = 1; i < ranked.length; i++) {
    if (Math.abs(ranked[i].estimatedCost - topCost) <= topCost * 0.1) tiedCount++;
  }
  return {
    strategyCount: ranked.length,
    selectedStrategy: ranked[0].strategy,
    alternativeCount: ranked.length - 1,
    candidateSetDigest: digest,
    degenerateRanking: tiedCount > 1,
  };
}

// ============================================================================
// Tests
// ============================================================================

// Use enableAcqHardening flag — transfer tests should not masquerade as minecraft.
const ACQ_CONTEXT: LintContext = { enableAcqHardening: true };

describe('Supply Chain Procurement — Strategy Enumeration', () => {
  it('enumerates all strategies when all resources available', () => {
    const candidates = buildSupplyStrategies('widget', true, true, true);
    expect(candidates.length).toBe(4);
    const strategies = candidates.map(c => c.strategy);
    expect(strategies).toContain('manufacture');
    expect(strategies).toContain('purchase');
    expect(strategies).toContain('recycle');
    expect(strategies).toContain('barter');
  });

  it('excludes recycle when no recyclable stock', () => {
    const candidates = buildSupplyStrategies('widget', true, false, true);
    const strategies = candidates.map(c => c.strategy);
    expect(strategies).not.toContain('recycle');
  });

  it('purchase is available when supplier present', () => {
    const candidates = buildSupplyStrategies('widget', true, false, false);
    const purchase = candidates.find(c => c.strategy === 'purchase');
    expect(purchase?.feasibility).toBe('available');
  });

  it('purchase is unknown when no supplier', () => {
    const candidates = buildSupplyStrategies('widget', false, false, false);
    const purchase = candidates.find(c => c.strategy === 'purchase');
    expect(purchase?.feasibility).toBe('unknown');
  });
});

describe('Supply Chain Procurement — Ranking', () => {
  it('lower cost ranks higher', () => {
    const candidates = buildSupplyStrategies('widget', true, true, true);
    const ranked = rankSupplyStrategies(candidates, []);
    // Recycle (3) should be first, then barter (4), then purchase (5), then manufacture (10)
    expect(ranked[0].strategy).toBe('recycle');
  });

  it('priors affect ranking', () => {
    const candidates = buildSupplyStrategies('widget', true, true, true);
    const priors: SupplyPrior[] = [
      { strategy: 'manufacture', contextKey: 'ctx', successRate: 0.9, sampleCount: 10 },
      { strategy: 'recycle', contextKey: 'ctx', successRate: 0.1, sampleCount: 10 },
    ];
    const ranked = rankSupplyStrategies(candidates, priors);
    // Manufacture: 10 * (1-0.9) = 1.0, Recycle: 3 * (1-0.1) = 2.7
    expect(ranked[0].strategy).toBe('manufacture');
  });
});

describe('Supply Chain Procurement — CandidateSetDigest', () => {
  it('digest is stable for same inputs', () => {
    const c1 = buildSupplyStrategies('widget', true, true, true);
    const c2 = buildSupplyStrategies('widget', true, true, true);
    expect(computeSupplyDigest(c1)).toBe(computeSupplyDigest(c2));
  });

  it('reordered candidates → same digest', () => {
    const candidates = buildSupplyStrategies('widget', true, true, true);
    const d1 = computeSupplyDigest(candidates);
    const d2 = computeSupplyDigest([...candidates].reverse());
    expect(d1).toBe(d2);
  });

  it('adding a candidate → different digest', () => {
    const c1 = buildSupplyStrategies('widget', true, false, true);
    const c2 = buildSupplyStrategies('widget', true, true, true);
    expect(computeSupplyDigest(c1)).not.toBe(computeSupplyDigest(c2));
  });
});

describe('Supply Chain Procurement — ACQ_FREE_PRODUCTION linter', () => {
  it('manufacture with no consumes AND no requires → ACQ_FREE_PRODUCTION', () => {
    const rules: LintableRule[] = [{
      action: 'acq:manufacture:widget',
      actionType: 'craft',
      produces: [{ name: 'widget', count: 1 }],
      consumes: [], // Missing!
      requires: [], // Missing!
    }];
    const report = lintRules(rules, ACQ_CONTEXT);
    const issue = report.issues.find(i => i.code === 'ACQ_FREE_PRODUCTION');
    expect(issue).toBeDefined();
  });

  it('purchase must consume currency', () => {
    const rules: LintableRule[] = [{
      action: 'acq:purchase:widget',
      actionType: 'craft',
      produces: [{ name: 'widget', count: 1 }],
      consumes: [], // Missing!
      requires: [],
    }];
    const report = lintRules(rules, ACQ_CONTEXT);
    const issue = report.issues.find(i => i.code === 'ACQ_FREE_PRODUCTION');
    expect(issue).toBeDefined();
  });

  it('valid manufacture rule passes', () => {
    const rules = buildSupplyRules('widget', 'manufacture');
    const report = lintRules(rules, ACQ_CONTEXT);
    expect(report.issues.filter(i => i.code === 'ACQ_FREE_PRODUCTION')).toHaveLength(0);
  });

  it('valid purchase rule passes', () => {
    const rules = buildSupplyRules('widget', 'purchase');
    const report = lintRules(rules, ACQ_CONTEXT);
    expect(report.issues.filter(i => i.code === 'ACQ_FREE_PRODUCTION')).toHaveLength(0);
  });

  it('valid recycle rule passes', () => {
    const rules = buildSupplyRules('widget', 'recycle');
    const report = lintRules(rules, ACQ_CONTEXT);
    expect(report.issues.filter(i => i.code === 'ACQ_FREE_PRODUCTION')).toHaveLength(0);
  });

  it('valid barter rule passes', () => {
    const rules = buildSupplyRules('widget', 'barter');
    const report = lintRules(rules, ACQ_CONTEXT);
    expect(report.issues.filter(i => i.code === 'ACQ_FREE_PRODUCTION')).toHaveLength(0);
  });
});

describe('Supply Chain Procurement — Signals', () => {
  it('signals computed correctly with all strategies', () => {
    const candidates = buildSupplyStrategies('widget', true, true, true);
    const ranked = rankSupplyStrategies(candidates, []);
    const digest = computeSupplyDigest(candidates);
    const signals = computeSupplySignals(ranked, digest);

    expect(signals.strategyCount).toBe(4);
    expect(signals.selectedStrategy).toBe('recycle');
    expect(signals.alternativeCount).toBe(3);
    expect(signals.candidateSetDigest).toMatch(/^[0-9a-f]{16}$/);
  });

  it('signals computed correctly with zero strategies', () => {
    const signals = computeSupplySignals([], 'empty');
    expect(signals.strategyCount).toBe(0);
    expect(signals.selectedStrategy).toBeNull();
  });
});

describe('Supply Chain Procurement — SolveBundle Capture', () => {
  it('hashing infrastructure works for non-Minecraft rules', () => {
    const rules = buildSupplyRules('widget', 'manufacture');
    const canonical = canonicalize(rules);
    expect(canonical).toBeTruthy();
    const hash = contentHash(canonical);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('deterministic hashing across calls', () => {
    const rules1 = buildSupplyRules('widget', 'purchase');
    const rules2 = buildSupplyRules('widget', 'purchase');
    expect(canonicalize(rules1)).toBe(canonicalize(rules2));
  });
});
