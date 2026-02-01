/**
 * P03 Conformance — CI Runner Domain Proving Surface
 *
 * Wires the P03ReferenceAdapter with CI runner pool fixtures
 * and runs the capsule conformance suite. Proves the reference
 * implementation satisfies all 5 P03 temporal planning invariants
 * for the CI/CD pipeline scheduling domain.
 *
 * This is the transfer surface — proving the same adapter works
 * across a completely different domain with different slot types,
 * bucket sizes, and batch thresholds.
 */

import { runP03ConformanceSuite } from '../../../../../../testkits/src/p03';
import { P03ReferenceAdapter } from '../p03-reference-adapter';
import {
  CI_MAX_WAIT_BUCKETS,
  CI_BATCH_THRESHOLD,
  CI_STATE_IDLE,
  CI_STATE_DEADLOCKED,
  CI_SLOTS_STAGGERED,
  CI_NEEDS_ONE_RUNNER,
  CI_BATCH_OPERATORS,
  CI_PARALLEL_SCHEDULE,
  CI_SERIAL_SCHEDULE,
} from '../p03-reference-fixtures';

runP03ConformanceSuite({
  name: 'CI Runner Pool',

  createAdapter: () =>
    new P03ReferenceAdapter(CI_MAX_WAIT_BUCKETS, CI_BATCH_THRESHOLD),

  idleState: CI_STATE_IDLE,
  deadlockedState: CI_STATE_DEADLOCKED,

  tieBreakSlots: CI_SLOTS_STAGGERED,
  slotType: 'runner',
  expectedTieBreakWinnerId: 'runner_a', // lexicographically smallest among readyAt=0

  slotNeeds: CI_NEEDS_ONE_RUNNER,
  batchOperators: CI_BATCH_OPERATORS,
  batchItemType: 'test_suite',
  largeBatchCount: 20,
  smallBatchCount: 2,

  parallelSchedule: CI_PARALLEL_SCHEDULE,
  parallelMakespan: 10,
  serialSchedule: CI_SERIAL_SCHEDULE,
  serialMakespan: 40,
});
