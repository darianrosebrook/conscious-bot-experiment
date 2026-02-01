/**
 * P03 Primitive Capsule — Temporal Planning with Durations, Batching, Capacity
 */

// Capsule types
export {
  P03_CONTRACT_VERSION,
  P03_CANONICALIZATION,
  P03_INVARIANTS,
} from './p03-capsule-types';

export type {
  P03ContractVersion,
  P03TimeStateV1,
  P03ResourceSlotV1,
  P03TemporalStateV1,
  P03OperatorV1,
  P03BatchOperatorV1,
  P03PlannedStepV1,
  P03SolveResultV1,
  P03DeadlockCheckV1,
  P03SlotNeedV1,
  P03TemporalAdapter,
  P03Invariant,
  P03ClaimId,
  P03CapabilityDescriptor,
} from './p03-capsule-types';

// Reference fixtures
export {
  // Furnace domain
  FURNACE_BUCKET_SIZE_TICKS,
  FURNACE_MAX_WAIT_BUCKETS,
  FURNACE_BATCH_THRESHOLD,
  FURNACE_SLOTS_IDLE,
  FURNACE_SLOTS_ONE_BUSY,
  FURNACE_SLOTS_ALL_BUSY,
  FURNACE_SLOTS_FOUR,
  FURNACE_SLOTS_STAGGERED,
  FURNACE_OPERATORS,
  FURNACE_BATCH_OPERATORS,
  FURNACE_STATE_IDLE,
  FURNACE_STATE_ONE_BUSY,
  FURNACE_STATE_DEADLOCKED,
  FURNACE_STATE_FOUR_PARALLEL,
  FURNACE_NEEDS_ONE,
  FURNACE_NEEDS_TWO,
  FURNACE_PARALLEL_SCHEDULE,
  FURNACE_SERIAL_SCHEDULE,
  // CI domain
  CI_BUCKET_SIZE_TICKS,
  CI_MAX_WAIT_BUCKETS,
  CI_BATCH_THRESHOLD,
  CI_SLOTS_IDLE,
  CI_SLOTS_ALL_BUSY,
  CI_SLOTS_STAGGERED,
  CI_OPERATORS,
  CI_BATCH_OPERATORS,
  CI_STATE_IDLE,
  CI_STATE_DEADLOCKED,
  CI_STATE_FOUR_PARALLEL,
  CI_NEEDS_ONE_RUNNER,
  CI_PARALLEL_SCHEDULE,
  CI_SERIAL_SCHEDULE,
} from './p03-reference-fixtures';

// Reference adapter
export { P03ReferenceAdapter } from './p03-reference-adapter';
