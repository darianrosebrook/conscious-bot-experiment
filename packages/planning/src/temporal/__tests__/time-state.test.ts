/**
 * Time State Tests — Bucket Conversion & State Construction
 */

import { describe, it, expect } from 'vitest';
import {
  toTickBucket,
  MINECRAFT_BUCKET_SIZE_TICKS,
  HORIZON_BUCKETS,
  MAX_WAIT_BUCKETS,
  DEFAULT_HORIZON_BUCKETS,
  inferSlotsFromBlocks,
  makeTemporalState,
} from '../time-state';
import { P03ReferenceAdapter } from '../../sterling/primitives/p03/p03-reference-adapter';

const adapter = new P03ReferenceAdapter(100, 8);

describe('toTickBucket', () => {
  it('converts ticks to integer buckets', () => {
    expect(toTickBucket(0)).toBe(0);
    expect(toTickBucket(99)).toBe(0);
    expect(toTickBucket(100)).toBe(1);
    expect(toTickBucket(250)).toBe(2);
  });

  it('always returns integers (floors)', () => {
    for (let ticks = 0; ticks < 1000; ticks += 17) {
      const bucket = toTickBucket(ticks);
      expect(Number.isInteger(bucket)).toBe(true);
      expect(bucket).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses custom bucket size', () => {
    expect(toTickBucket(120, 60)).toBe(2);
    expect(toTickBucket(59, 60)).toBe(0);
  });

  it('deterministic: same input always produces same output', () => {
    const results = Array.from({ length: 50 }, () => toTickBucket(12345));
    expect(results.every((r) => r === results[0])).toBe(true);
  });
});

describe('inferSlotsFromBlocks', () => {
  it('infers furnace slots from nearby blocks', () => {
    const blocks = ['furnace', 'stone', 'furnace', 'crafting_table'];
    const slots = inferSlotsFromBlocks(blocks, 0);
    expect(slots).toHaveLength(3);
    expect(slots.filter((s) => s.type === 'furnace')).toHaveLength(2);
    expect(slots.filter((s) => s.type === 'crafting_table')).toHaveLength(1);
  });

  it('assigns deterministic IDs', () => {
    const blocks = ['furnace', 'furnace', 'smoker'];
    const slots = inferSlotsFromBlocks(blocks, 5);
    expect(slots[0].id).toBe('furnace_0');
    expect(slots[1].id).toBe('furnace_1');
    expect(slots[2].id).toBe('smoker_0');
  });

  it('sets readyAtBucket to currentBucket (pessimistic idle)', () => {
    const blocks = ['furnace', 'blast_furnace'];
    const slots = inferSlotsFromBlocks(blocks, 10);
    expect(slots.every((s) => s.readyAtBucket === 10)).toBe(true);
  });

  it('ignores unknown block types', () => {
    const blocks = ['dirt', 'stone', 'oak_log'];
    const slots = inferSlotsFromBlocks(blocks, 0);
    expect(slots).toHaveLength(0);
  });

  it('handles lit furnace variants', () => {
    const blocks = ['lit_furnace', 'lit_blast_furnace', 'lit_smoker'];
    const slots = inferSlotsFromBlocks(blocks, 0);
    expect(slots).toHaveLength(3);
    expect(slots[0].type).toBe('furnace');
    expect(slots[1].type).toBe('blast_furnace');
    expect(slots[2].type).toBe('smoker');
  });
});

describe('makeTemporalState', () => {
  it('constructs valid P03TemporalStateV1 from ticks', () => {
    const state = makeTemporalState(
      { nowTicks: 500, nearbyBlocks: ['furnace', 'furnace'] },
      adapter,
    );
    expect(state.time.currentBucket).toBe(5);
    expect(state.time.horizonBucket).toBe(105); // 5 + 100
    expect(state.time.bucketSizeTicks).toBe(MINECRAFT_BUCKET_SIZE_TICKS);
    expect(state.slots).toHaveLength(2);
  });

  it('canonicalizes slots (sorted by type, readyAt, id)', () => {
    const state = makeTemporalState(
      {
        nowTicks: 0,
        slotsObserved: [
          { id: 'z_furnace', type: 'furnace', readyAtBucket: 0 },
          { id: 'a_furnace', type: 'furnace', readyAtBucket: 0 },
        ],
      },
      adapter,
    );
    expect(state.slots[0].id).toBe('a_furnace');
    expect(state.slots[1].id).toBe('z_furnace');
  });

  it('uses provided slotsObserved over nearbyBlocks', () => {
    const state = makeTemporalState(
      {
        nowTicks: 0,
        slotsObserved: [
          { id: 'custom_0', type: 'furnace', readyAtBucket: 50 },
        ],
        nearbyBlocks: ['furnace', 'furnace', 'furnace'],
      },
      adapter,
    );
    // Should use slotsObserved, not infer from nearbyBlocks
    expect(state.slots).toHaveLength(1);
    expect(state.slots[0].readyAtBucket).toBe(50);
  });

  it('reordered inputs produce same canonical state', () => {
    const slotsA = [
      { id: 'f_1', type: 'furnace', readyAtBucket: 0 },
      { id: 'f_0', type: 'furnace', readyAtBucket: 0 },
    ];
    const slotsB = [
      { id: 'f_0', type: 'furnace', readyAtBucket: 0 },
      { id: 'f_1', type: 'furnace', readyAtBucket: 0 },
    ];
    const stateA = makeTemporalState({ nowTicks: 0, slotsObserved: slotsA }, adapter);
    const stateB = makeTemporalState({ nowTicks: 0, slotsObserved: slotsB }, adapter);
    expect(JSON.stringify(stateA)).toBe(JSON.stringify(stateB));
  });
});

// ── Constants relationship policy ───────────────────────────────────

describe('temporal constants policy', () => {
  it('HORIZON_BUCKETS and MAX_WAIT_BUCKETS are both positive integers', () => {
    expect(Number.isInteger(HORIZON_BUCKETS)).toBe(true);
    expect(HORIZON_BUCKETS).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_WAIT_BUCKETS)).toBe(true);
    expect(MAX_WAIT_BUCKETS).toBeGreaterThan(0);
  });

  it('HORIZON_BUCKETS and MAX_WAIT_BUCKETS are equal today (policy: allowed to differ)', () => {
    // These two constants are semantically distinct:
    //   HORIZON_BUCKETS  — how far ahead the temporal state extends ("schedule horizon")
    //   MAX_WAIT_BUCKETS — how long we tolerate waiting for a slot ("deadlock wait bound")
    //
    // They are allowed to diverge if a use case demands it. This test documents
    // that they are equal today. If you change one without the other, this test
    // will tell you immediately — update it intentionally with a rationale.
    expect(HORIZON_BUCKETS).toBe(MAX_WAIT_BUCKETS);
  });

  it('deprecated DEFAULT_HORIZON_BUCKETS aliases HORIZON_BUCKETS', () => {
    expect(DEFAULT_HORIZON_BUCKETS).toBe(HORIZON_BUCKETS);
  });

  it('MINECRAFT_BUCKET_SIZE_TICKS is a positive integer', () => {
    expect(Number.isInteger(MINECRAFT_BUCKET_SIZE_TICKS)).toBe(true);
    expect(MINECRAFT_BUCKET_SIZE_TICKS).toBeGreaterThan(0);
  });
});
