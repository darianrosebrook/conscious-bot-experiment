/**
 * Temporal Batch Operators — Minecraft Domain Batch Definitions
 *
 * Holds the Minecraft domain's P03BatchOperatorV1 definitions and
 * exposes a batch hint function that delegates to the adapter's
 * preferBatch. No new batch types — uses capsule types only.
 */

import type {
  P03TemporalAdapter,
  P03BatchOperatorV1,
} from '../sterling/primitives/p03/p03-capsule-types';

// ── Minecraft Batch Operators ──────────────────────────────────────

/**
 * Batch operators for the Minecraft furnace domain.
 *
 * Each entry defines a batch variant for a smeltable item type.
 * The capsule enforces: when goalCount >= batchThreshold and a
 * matching operator exists, batch is preferred.
 */
export const MINECRAFT_BATCH_OPERATORS: readonly P03BatchOperatorV1[] = Object.freeze([
  {
    opId: 'smelt_batch_iron_ore',
    durationTicks: 200,
    requiresSlotType: 'furnace',
    baseCost: 3,
    itemType: 'iron_ore',
    maxBatchSize: 64,
    perItemDurationTicks: 200,
  },
  {
    opId: 'smelt_batch_gold_ore',
    durationTicks: 200,
    requiresSlotType: 'furnace',
    baseCost: 3,
    itemType: 'gold_ore',
    maxBatchSize: 64,
    perItemDurationTicks: 200,
  },
  {
    opId: 'cook_batch_raw_beef',
    durationTicks: 200,
    requiresSlotType: 'furnace',
    baseCost: 3,
    itemType: 'raw_beef',
    maxBatchSize: 64,
    perItemDurationTicks: 200,
  },
  {
    opId: 'smelt_batch_raw_iron',
    durationTicks: 200,
    requiresSlotType: 'furnace',
    baseCost: 3,
    itemType: 'raw_iron',
    maxBatchSize: 64,
    perItemDurationTicks: 200,
  },
  {
    opId: 'smelt_batch_sand',
    durationTicks: 200,
    requiresSlotType: 'furnace',
    baseCost: 3,
    itemType: 'sand',
    maxBatchSize: 64,
    perItemDurationTicks: 200,
  },
]);

// ── Batch Hint ─────────────────────────────────────────────────────

export interface BatchHint {
  readonly useBatch: boolean;
  readonly operatorId?: string;
  readonly batchSize?: number;
}

/**
 * Get a batch preference hint for a given item type and goal count.
 *
 * Delegates entirely to the adapter's preferBatch — the threshold
 * and matching logic are owned by the adapter and conformance-proven.
 */
export function getBatchHint(
  adapter: P03TemporalAdapter,
  itemType: string,
  goalCount: number,
  batchOperators: readonly P03BatchOperatorV1[] = MINECRAFT_BATCH_OPERATORS,
): BatchHint {
  const result = adapter.preferBatch(itemType, goalCount, batchOperators, adapter.batchThreshold);
  return {
    useBatch: result.useBatch,
    operatorId: result.operator?.opId,
    batchSize: result.batchSize,
  };
}
