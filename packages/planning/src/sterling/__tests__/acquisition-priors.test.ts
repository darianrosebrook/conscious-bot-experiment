/**
 * Acquisition Priors — Strategy prior store tests.
 *
 * Covers:
 * - Default prior = 0.5
 * - Success increases prior
 * - Failure decreases prior
 * - Bounds enforced: [PRIOR_MIN, PRIOR_MAX]
 * - Deterministic results
 * - planId required (throws without it)
 * - EMA smoothing
 */

import { describe, it, expect } from 'vitest';
import { StrategyPriorStore } from '../minecraft-acquisition-priors';
import { PRIOR_MIN, PRIOR_MAX } from '../minecraft-acquisition-types';

describe('StrategyPriorStore', () => {
  it('default prior = 0.5', () => {
    const store = new StrategyPriorStore();
    const prior = store.getPrior('iron_ingot', 'mine', 'ctx1');
    expect(prior.successRate).toBe(0.5);
    expect(prior.sampleCount).toBe(0);
  });

  it('successful update increases prior', () => {
    const store = new StrategyPriorStore();
    const before = store.getPrior('iron_ingot', 'mine', 'ctx1');
    store.updatePrior('iron_ingot', 'mine', 'ctx1', true, 'plan-1');
    const after = store.getPrior('iron_ingot', 'mine', 'ctx1');
    expect(after.successRate).toBeGreaterThan(before.successRate);
  });

  it('failed update decreases prior', () => {
    const store = new StrategyPriorStore();
    const before = store.getPrior('iron_ingot', 'mine', 'ctx1');
    store.updatePrior('iron_ingot', 'mine', 'ctx1', false, 'plan-1');
    const after = store.getPrior('iron_ingot', 'mine', 'ctx1');
    expect(after.successRate).toBeLessThan(before.successRate);
  });

  it('bounds enforced: never below PRIOR_MIN', () => {
    const store = new StrategyPriorStore();
    // Many failures should drive prior down but not below PRIOR_MIN
    for (let i = 0; i < 100; i++) {
      store.updatePrior('iron_ingot', 'mine', 'ctx1', false, `plan-${i}`);
    }
    const prior = store.getPrior('iron_ingot', 'mine', 'ctx1');
    expect(prior.successRate).toBeGreaterThanOrEqual(PRIOR_MIN);
  });

  it('bounds enforced: never above PRIOR_MAX', () => {
    const store = new StrategyPriorStore();
    // Many successes should drive prior up but not above PRIOR_MAX
    for (let i = 0; i < 100; i++) {
      store.updatePrior('iron_ingot', 'mine', 'ctx1', true, `plan-${i}`);
    }
    const prior = store.getPrior('iron_ingot', 'mine', 'ctx1');
    expect(prior.successRate).toBeLessThanOrEqual(PRIOR_MAX);
  });

  it('same inputs → same prior (deterministic)', () => {
    const store1 = new StrategyPriorStore();
    const store2 = new StrategyPriorStore();

    store1.updatePrior('iron_ingot', 'mine', 'ctx1', true, 'plan-1');
    store2.updatePrior('iron_ingot', 'mine', 'ctx1', true, 'plan-1');

    expect(store1.getPrior('iron_ingot', 'mine', 'ctx1').successRate)
      .toBe(store2.getPrior('iron_ingot', 'mine', 'ctx1').successRate);
  });

  it('updatePrior without planId → throws', () => {
    const store = new StrategyPriorStore();
    expect(() =>
      store.updatePrior('iron_ingot', 'mine', 'ctx1', true, '')
    ).toThrow('planId');
  });

  it('EMA smoothing: single failure does not crash prior to floor', () => {
    const store = new StrategyPriorStore();
    // Start with a few successes
    store.updatePrior('iron_ingot', 'mine', 'ctx1', true, 'plan-1');
    store.updatePrior('iron_ingot', 'mine', 'ctx1', true, 'plan-2');
    store.updatePrior('iron_ingot', 'mine', 'ctx1', true, 'plan-3');

    const beforeFailure = store.getPrior('iron_ingot', 'mine', 'ctx1');
    store.updatePrior('iron_ingot', 'mine', 'ctx1', false, 'plan-4');
    const afterFailure = store.getPrior('iron_ingot', 'mine', 'ctx1');

    // Prior should decrease but still be well above PRIOR_MIN
    expect(afterFailure.successRate).toBeLessThan(beforeFailure.successRate);
    expect(afterFailure.successRate).toBeGreaterThan(0.3);
  });

  it('tracks sample count correctly', () => {
    const store = new StrategyPriorStore();
    store.updatePrior('iron_ingot', 'mine', 'ctx1', true, 'plan-1');
    store.updatePrior('iron_ingot', 'mine', 'ctx1', false, 'plan-2');
    store.updatePrior('iron_ingot', 'mine', 'ctx1', true, 'plan-3');

    const prior = store.getPrior('iron_ingot', 'mine', 'ctx1');
    expect(prior.sampleCount).toBe(3);
  });

  it('different strategies tracked independently', () => {
    const store = new StrategyPriorStore();
    store.updatePrior('iron_ingot', 'mine', 'ctx1', true, 'plan-1');
    store.updatePrior('iron_ingot', 'trade', 'ctx1', false, 'plan-2');

    const minePrior = store.getPrior('iron_ingot', 'mine', 'ctx1');
    const tradePrior = store.getPrior('iron_ingot', 'trade', 'ctx1');

    expect(minePrior.successRate).toBeGreaterThan(tradePrior.successRate);
  });

  it('different contexts tracked independently', () => {
    const store = new StrategyPriorStore();
    store.updatePrior('iron_ingot', 'mine', 'village', true, 'plan-1');
    store.updatePrior('iron_ingot', 'mine', 'cave', false, 'plan-2');

    const village = store.getPrior('iron_ingot', 'mine', 'village');
    const cave = store.getPrior('iron_ingot', 'mine', 'cave');

    expect(village.successRate).toBeGreaterThan(cave.successRate);
  });

  it('getPriorsForContext returns only observed strategies', () => {
    const store = new StrategyPriorStore();
    store.updatePrior('iron_ingot', 'mine', 'ctx1', true, 'plan-1');
    store.updatePrior('iron_ingot', 'trade', 'ctx1', false, 'plan-2');

    const priors = store.getPriorsForContext('iron_ingot', 'ctx1');
    expect(priors).toHaveLength(2);
    expect(priors.map(p => p.strategy).sort()).toEqual(['mine', 'trade']);
  });

  it('clear removes all priors', () => {
    const store = new StrategyPriorStore();
    store.updatePrior('iron_ingot', 'mine', 'ctx1', true, 'plan-1');
    expect(store.size).toBe(1);
    store.clear();
    expect(store.size).toBe(0);
    expect(store.getPrior('iron_ingot', 'mine', 'ctx1').sampleCount).toBe(0);
  });
});
