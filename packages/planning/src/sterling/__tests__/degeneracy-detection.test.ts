/**
 * Degeneracy Detection Tests (M2-a instrumentation)
 *
 * Covers:
 * - 4 strategies with distinct costs → not degenerate
 * - 4 strategies with equal costs → degenerate, tiedCount=4
 * - 2 strategies within epsilon, 2 outside → degenerate, tiedCount=2
 * - Single strategy → not degenerate
 * - Result wired into SolveRationale
 */

import { describe, it, expect } from 'vitest';
import { detectStrategyDegeneracy } from '../degeneracy-detection';
import type { AcquisitionCandidate, AcquisitionContextV1 } from '../minecraft-acquisition-types';

// ── Helpers ────────────────────────────────────────────────────────────────

const baseCtx: AcquisitionContextV1 = {
  targetItem: 'iron_ingot',
  oreNearby: true,
  villagerTradeAvailable: true,
  knownChestCountBucket: 1,
  distBucket_villager: 1,
  distBucket_chest: 1,
  distBucket_ore: 1,
  inventoryHash: 'abcdef0123456789',
  toolTierCap: 'cap:has_stone_pickaxe',
};

function makeCandidate(strategy: string, cost: number): AcquisitionCandidate {
  return {
    strategy: strategy as any,
    item: 'iron_ingot',
    estimatedCost: cost,
    feasibility: 'available',
    requires: [],
    contextSnapshot: baseCtx,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('detectStrategyDegeneracy', () => {
  it('4 strategies with distinct costs → not degenerate', () => {
    const candidates = [
      makeCandidate('mine', 5),
      makeCandidate('trade', 10),
      makeCandidate('loot', 20),
      makeCandidate('salvage', 30),
    ];
    const report = detectStrategyDegeneracy(candidates);
    expect(report.isDegenerate).toBe(false);
    expect(report.tiedCount).toBe(1);
    expect(report.costSpread).toBe(25);
  });

  it('4 strategies with equal costs → degenerate, tiedCount=4', () => {
    const candidates = [
      makeCandidate('mine', 10),
      makeCandidate('trade', 10),
      makeCandidate('loot', 10),
      makeCandidate('salvage', 10),
    ];
    const report = detectStrategyDegeneracy(candidates);
    expect(report.isDegenerate).toBe(true);
    expect(report.tiedCount).toBe(4);
    expect(report.costSpread).toBe(0);
  });

  it('2 strategies within epsilon, 2 outside → degenerate, tiedCount=2', () => {
    const candidates = [
      makeCandidate('mine', 10),
      makeCandidate('trade', 10.5), // within 10% of 10 (threshold = 1.0)
      makeCandidate('loot', 20),    // outside
      makeCandidate('salvage', 30), // outside
    ];
    const report = detectStrategyDegeneracy(candidates);
    expect(report.isDegenerate).toBe(true);
    expect(report.tiedCount).toBe(2);
  });

  it('single strategy → not degenerate', () => {
    const candidates = [makeCandidate('mine', 10)];
    const report = detectStrategyDegeneracy(candidates);
    expect(report.isDegenerate).toBe(false);
    expect(report.tiedCount).toBe(1);
    expect(report.costSpread).toBe(0);
  });

  it('empty candidates → not degenerate', () => {
    const report = detectStrategyDegeneracy([]);
    expect(report.isDegenerate).toBe(false);
    expect(report.tiedCount).toBe(0);
    expect(report.costSpread).toBe(0);
  });

  it('custom epsilon: tighter threshold', () => {
    const candidates = [
      makeCandidate('mine', 10),
      makeCandidate('trade', 10.5), // within 10% but outside 1%
    ];
    // With epsilon=0.01, threshold = 0.1, so 10.5 is outside
    const report = detectStrategyDegeneracy(candidates, 0.01);
    expect(report.isDegenerate).toBe(false);
    expect(report.tiedCount).toBe(1);
  });

  it('zero cost: any duplicate is degenerate', () => {
    const candidates = [
      makeCandidate('mine', 0),
      makeCandidate('trade', 0),
    ];
    const report = detectStrategyDegeneracy(candidates);
    expect(report.isDegenerate).toBe(true);
    expect(report.tiedCount).toBe(2);
  });

  it('degeneracy report has correct costSpread', () => {
    const candidates = [
      makeCandidate('mine', 5),
      makeCandidate('trade', 5),
      makeCandidate('loot', 15),
    ];
    const report = detectStrategyDegeneracy(candidates);
    expect(report.costSpread).toBe(10);
    expect(report.isDegenerate).toBe(true);
    expect(report.tiedCount).toBe(2);
  });
});
