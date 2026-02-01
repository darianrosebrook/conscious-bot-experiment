/**
 * P03 Conformance — Furnace Domain Proving Surface
 *
 * Wires the P03ReferenceAdapter with Minecraft furnace fixtures
 * and runs the capsule conformance suite. Proves the reference
 * implementation satisfies all 5 P03 temporal planning invariants
 * for the furnace smelting domain.
 */

import { runP03ConformanceSuite } from '../../../../../../testkits/src/p03';
import { P03ReferenceAdapter } from '../p03-reference-adapter';
import {
  FURNACE_MAX_WAIT_BUCKETS,
  FURNACE_BATCH_THRESHOLD,
  FURNACE_STATE_IDLE,
  FURNACE_STATE_DEADLOCKED,
  FURNACE_SLOTS_STAGGERED,
  FURNACE_NEEDS_ONE,
  FURNACE_BATCH_OPERATORS,
  FURNACE_PARALLEL_SCHEDULE,
  FURNACE_SERIAL_SCHEDULE,
} from '../p03-reference-fixtures';

runP03ConformanceSuite({
  name: 'Minecraft Furnace',

  createAdapter: () =>
    new P03ReferenceAdapter(FURNACE_MAX_WAIT_BUCKETS, FURNACE_BATCH_THRESHOLD),

  idleState: FURNACE_STATE_IDLE,
  deadlockedState: FURNACE_STATE_DEADLOCKED,

  tieBreakSlots: FURNACE_SLOTS_STAGGERED,
  slotType: 'furnace',
  expectedTieBreakWinnerId: 'furnace_a', // lexicographically smallest among readyAt=0

  slotNeeds: FURNACE_NEEDS_ONE,
  batchOperators: FURNACE_BATCH_OPERATORS,
  batchItemType: 'iron_ore',
  largeBatchCount: 64,
  smallBatchCount: 3,

  parallelSchedule: FURNACE_PARALLEL_SCHEDULE,
  parallelMakespan: 32,
  serialSchedule: FURNACE_SERIAL_SCHEDULE,
  serialMakespan: 128,
});
