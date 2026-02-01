/**
 * Temporal Enrichment Bridge Test
 *
 * Proves the integration seam is not inventing new semantics:
 * the temporal state, deadlock results, and batch hints produced
 * by the enrichment entrypoint match P03 fixture expectations.
 */

import { describe, it, expect } from 'vitest';
import { computeTemporalEnrichment, type TemporalMode } from '../temporal-enrichment';
import { P03ReferenceAdapter } from '../../sterling/primitives/p03/p03-reference-adapter';
import {
  FURNACE_MAX_WAIT_BUCKETS,
  FURNACE_BATCH_THRESHOLD,
  FURNACE_BATCH_OPERATORS,
  FURNACE_STATE_IDLE,
  FURNACE_STATE_DEADLOCKED,
} from '../../sterling/primitives/p03/p03-reference-fixtures';
import type { MinecraftCraftingRule } from '../../sterling/minecraft-crafting-types';
import { computeTemporalCost } from '../makespan-objective';

const adapter = new P03ReferenceAdapter(FURNACE_MAX_WAIT_BUCKETS, FURNACE_BATCH_THRESHOLD);

function makeRule(overrides: Partial<MinecraftCraftingRule>): MinecraftCraftingRule {
  return {
    action: 'craft:test',
    actionType: 'craft',
    produces: [],
    consumes: [],
    requires: [],
    needsTable: false,
    needsFurnace: false,
    baseCost: 1,
    ...overrides,
  };
}

// ── Mode: off ──────────────────────────────────────────────────────

describe('TemporalEnrichment mode=off', () => {
  it('returns inert enrichment', () => {
    const enrichment = computeTemporalEnrichment({
      mode: 'off',
      adapter,
      stateInput: { nowTicks: 0 },
      rules: [],
    });
    expect(enrichment.mode).toBe('off');
    expect(enrichment.temporalState).toBeUndefined();
    expect(enrichment.deadlock).toBeUndefined();
  });

  it('enrichRule returns rule unchanged', () => {
    const enrichment = computeTemporalEnrichment({
      mode: 'off',
      adapter,
      stateInput: { nowTicks: 0 },
      rules: [],
    });
    const rule = makeRule({ action: 'smelt:iron_ore', actionType: 'smelt' });
    const enriched = enrichment.enrichRule(rule);
    expect(enriched).toBe(rule); // same reference
  });

  it('batchHint always returns useBatch: false', () => {
    const enrichment = computeTemporalEnrichment({
      mode: 'off',
      adapter,
      stateInput: { nowTicks: 0 },
      rules: [],
    });
    expect(enrichment.batchHint('iron_ore', 64).useBatch).toBe(false);
  });
});

// ── Mode: local_only ───────────────────────────────────────────────

describe('TemporalEnrichment mode=local_only', () => {
  it('constructs temporal state matching fixture expectations', () => {
    const enrichment = computeTemporalEnrichment({
      mode: 'local_only',
      adapter,
      stateInput: {
        nowTicks: 0,
        slotsObserved: FURNACE_STATE_IDLE.slots,
        bucketSizeTicks: FURNACE_STATE_IDLE.time.bucketSizeTicks,
        horizonBuckets: FURNACE_MAX_WAIT_BUCKETS,
      },
      rules: [],
    });
    expect(enrichment.temporalState).toBeDefined();
    expect(enrichment.temporalState!.time.currentBucket).toBe(0);
    expect(enrichment.temporalState!.time.horizonBucket).toBe(FURNACE_MAX_WAIT_BUCKETS);
    expect(enrichment.temporalState!.time.bucketSizeTicks).toBe(
      FURNACE_STATE_IDLE.time.bucketSizeTicks,
    );
  });

  it('detects deadlock with deadlocked fixture', () => {
    const enrichment = computeTemporalEnrichment({
      mode: 'local_only',
      adapter,
      stateInput: {
        nowTicks: 10 * FURNACE_STATE_DEADLOCKED.time.bucketSizeTicks,
        slotsObserved: FURNACE_STATE_DEADLOCKED.slots,
        bucketSizeTicks: FURNACE_STATE_DEADLOCKED.time.bucketSizeTicks,
        horizonBuckets: FURNACE_MAX_WAIT_BUCKETS,
      },
      rules: [makeRule({ action: 'smelt:iron_ore', actionType: 'smelt' })],
    });
    expect(enrichment.deadlock).toBeDefined();
    expect(enrichment.deadlock!.isDeadlock).toBe(true);
    expect(enrichment.deadlock!.blockedSlotTypes).toContain('furnace');
  });

  it('no deadlock with idle fixture', () => {
    const enrichment = computeTemporalEnrichment({
      mode: 'local_only',
      adapter,
      stateInput: {
        nowTicks: 0,
        slotsObserved: FURNACE_STATE_IDLE.slots,
        bucketSizeTicks: FURNACE_STATE_IDLE.time.bucketSizeTicks,
        horizonBuckets: FURNACE_MAX_WAIT_BUCKETS,
      },
      rules: [makeRule({ action: 'smelt:iron_ore', actionType: 'smelt' })],
    });
    expect(enrichment.deadlock).toBeDefined();
    expect(enrichment.deadlock!.isDeadlock).toBe(false);
  });

  it('enrichRule annotates smelt with duration and slot type', () => {
    const enrichment = computeTemporalEnrichment({
      mode: 'local_only',
      adapter,
      stateInput: { nowTicks: 0, slotsObserved: FURNACE_STATE_IDLE.slots },
      rules: [],
    });
    const rule = makeRule({ action: 'smelt:iron_ore', actionType: 'smelt' });
    const enriched = enrichment.enrichRule(rule);
    expect(enriched.durationTicks).toBe(200);
    expect(enriched.requiresSlotType).toBe('furnace');
    // Original fields preserved
    expect(enriched.action).toBe('smelt:iron_ore');
    expect(enriched.baseCost).toBe(1);
  });

  it('enrichRule leaves craft rules with zero duration', () => {
    const enrichment = computeTemporalEnrichment({
      mode: 'local_only',
      adapter,
      stateInput: { nowTicks: 0, slotsObserved: FURNACE_STATE_IDLE.slots },
      rules: [],
    });
    const rule = makeRule({ action: 'craft:oak_planks', actionType: 'craft' });
    const enriched = enrichment.enrichRule(rule);
    expect(enriched.durationTicks).toBe(0);
    expect(enriched.requiresSlotType).toBeUndefined();
  });

  it('batchHint returns useBatch for large counts with furnace operators', () => {
    const enrichment = computeTemporalEnrichment({
      mode: 'local_only',
      adapter,
      stateInput: { nowTicks: 0, slotsObserved: FURNACE_STATE_IDLE.slots },
      rules: [],
      batchOperators: FURNACE_BATCH_OPERATORS,
    });
    const hint = enrichment.batchHint('iron_ore', 64);
    expect(hint.useBatch).toBe(true);
    expect(hint.batchSize).toBe(64);
  });

  it('batchHint returns useBatch=false below threshold', () => {
    const enrichment = computeTemporalEnrichment({
      mode: 'local_only',
      adapter,
      stateInput: { nowTicks: 0, slotsObserved: FURNACE_STATE_IDLE.slots },
      rules: [],
      batchOperators: FURNACE_BATCH_OPERATORS,
    });
    const hint = enrichment.batchHint('iron_ore', 3);
    expect(hint.useBatch).toBe(false);
  });
});

// ── Mode: sterling_temporal ────────────────────────────────────────

describe('TemporalEnrichment mode=sterling_temporal', () => {
  it('produces same enrichment shape as local_only', () => {
    const localEnrichment = computeTemporalEnrichment({
      mode: 'local_only',
      adapter,
      stateInput: { nowTicks: 0, slotsObserved: FURNACE_STATE_IDLE.slots },
      rules: [makeRule({ action: 'smelt:iron_ore', actionType: 'smelt' })],
      batchOperators: FURNACE_BATCH_OPERATORS,
    });
    const sterlingEnrichment = computeTemporalEnrichment({
      mode: 'sterling_temporal',
      adapter,
      stateInput: { nowTicks: 0, slotsObserved: FURNACE_STATE_IDLE.slots },
      rules: [makeRule({ action: 'smelt:iron_ore', actionType: 'smelt' })],
      batchOperators: FURNACE_BATCH_OPERATORS,
    });

    // Same state, same deadlock, same batch hints
    expect(sterlingEnrichment.temporalState).toBeDefined();
    expect(sterlingEnrichment.deadlock?.isDeadlock).toBe(localEnrichment.deadlock?.isDeadlock);
    // Mode differs
    expect(sterlingEnrichment.mode).toBe('sterling_temporal');
    expect(localEnrichment.mode).toBe('local_only');
  });
});

// ── computeTemporalCost ────────────────────────────────────────────

describe('computeTemporalCost', () => {
  it('instant actions have zero time cost', () => {
    const cost = computeTemporalCost(10, 0, 0.3);
    expect(cost.timeCost).toBe(0);
    expect(cost.totalCost).toBe(7); // 10 * 0.7 + 0 * 0.3
  });

  it('slow actions have higher total cost', () => {
    const instant = computeTemporalCost(10, 0, 0.3);
    const slow = computeTemporalCost(10, 200, 0.3);
    expect(slow.totalCost).toBeGreaterThan(instant.totalCost);
    expect(slow.timeCost).toBe(200);
  });

  it('timeWeight=0 ignores duration entirely', () => {
    const cost = computeTemporalCost(10, 9999, 0);
    expect(cost.totalCost).toBe(10);
  });

  it('timeWeight=1 ignores base cost entirely', () => {
    const cost = computeTemporalCost(9999, 200, 1);
    expect(cost.totalCost).toBe(200);
  });
});
