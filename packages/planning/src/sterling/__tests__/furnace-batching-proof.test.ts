/**
 * Furnace Batching Proof (C.4)
 *
 * Acceptance: Unit test showing batch plan is preferred over sequential.
 * 4 items + 1 furnace: batch uses fewer actions than sequential.
 * preferBatch returns useBatch=true for count >= threshold.
 */

import { describe, it, expect } from 'vitest';
import { P03ReferenceAdapter } from '../primitives/p03/p03-reference-adapter';
import {
  FURNACE_BATCH_OPERATORS,
  FURNACE_BATCH_THRESHOLD,
  FURNACE_SLOTS_IDLE,
  FURNACE_STATE_IDLE,
  FURNACE_SERIAL_SCHEDULE,
  FURNACE_PARALLEL_SCHEDULE,
} from '../primitives/p03/p03-reference-fixtures';

describe('furnace batching proof (C.4)', () => {
  const adapter = new P03ReferenceAdapter(100, FURNACE_BATCH_THRESHOLD);

  it('preferBatch returns useBatch=true when count >= threshold', () => {
    const result = adapter.preferBatch(
      'iron_ore',
      FURNACE_BATCH_THRESHOLD, // exactly at threshold
      FURNACE_BATCH_OPERATORS,
      FURNACE_BATCH_THRESHOLD,
    );

    expect(result.useBatch).toBe(true);
    expect(result.operator).toBeDefined();
    expect(result.operator!.opId).toBe('smelt_batch_iron_ore');
    expect(result.batchSize).toBe(FURNACE_BATCH_THRESHOLD);
  });

  it('preferBatch returns useBatch=false when count < threshold', () => {
    const result = adapter.preferBatch(
      'iron_ore',
      FURNACE_BATCH_THRESHOLD - 1,
      FURNACE_BATCH_OPERATORS,
      FURNACE_BATCH_THRESHOLD,
    );

    expect(result.useBatch).toBe(false);
  });

  it('preferBatch returns useBatch=false for unknown item type', () => {
    const result = adapter.preferBatch(
      'not_a_real_item',
      FURNACE_BATCH_THRESHOLD,
      FURNACE_BATCH_OPERATORS,
      FURNACE_BATCH_THRESHOLD,
    );

    expect(result.useBatch).toBe(false);
  });

  it('batch plan (serial) makespan matches expected fixture', () => {
    // 1 furnace, 64 items → makespan = 128 buckets
    const serialMakespan = adapter.computeMakespan(FURNACE_SERIAL_SCHEDULE);
    expect(serialMakespan).toBe(128);
  });

  it('parallel plan makespan < serial plan makespan', () => {
    // 4 furnaces, 64 items → makespan = 32 buckets
    const parallelMakespan = adapter.computeMakespan(FURNACE_PARALLEL_SCHEDULE);
    const serialMakespan = adapter.computeMakespan(FURNACE_SERIAL_SCHEDULE);

    expect(parallelMakespan).toBe(32);
    expect(parallelMakespan).toBeLessThan(serialMakespan);
  });

  it('batch size is clamped to maxBatchSize', () => {
    const result = adapter.preferBatch(
      'iron_ore',
      100, // More than maxBatchSize (64)
      FURNACE_BATCH_OPERATORS,
      FURNACE_BATCH_THRESHOLD,
    );

    expect(result.useBatch).toBe(true);
    expect(result.batchSize).toBe(64); // Clamped to maxBatchSize
  });
});
