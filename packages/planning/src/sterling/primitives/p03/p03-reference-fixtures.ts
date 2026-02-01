/**
 * P03 Reference Fixtures — Two Domain Fixture Sets
 *
 * Runtime-safe (no vitest). Pure data, no side effects.
 *
 * Each domain provides:
 * - A set of resource slots with readyAtBucket times
 * - A set of operators with explicit durations
 * - A set of batch operators
 * - Temporal state configurations
 * - Expected behaviors for conformance testing
 *
 * Domain A: Minecraft furnace smelting (the primary Rig C surface)
 * Domain B: CI runner pool scheduling (transfer surface)
 */

import type {
  P03ResourceSlotV1,
  P03OperatorV1,
  P03BatchOperatorV1,
  P03TemporalStateV1,
  P03PlannedStepV1,
  P03SlotNeedV1,
} from './p03-capsule-types';

// ============================================================================
// Domain A: Furnace Smelting (Minecraft-shaped)
// ============================================================================
//
// Furnace smelting in Minecraft:
// - Each furnace is a resource slot of type 'furnace'
// - Smelting 1 item takes 200 ticks (10 seconds at 20 tps)
// - Bucket size: 100 ticks (~5 seconds)
// - So smelting 1 item = 2 buckets
// - Multiple furnaces can run in parallel
// - Batch smelting: load multiple items, duration scales linearly

/** Bucket size for furnace domain: 100 game ticks (~5 seconds). */
export const FURNACE_BUCKET_SIZE_TICKS = 100;

/** Maximum wait horizon for furnace domain. */
export const FURNACE_MAX_WAIT_BUCKETS = 100;

/** Batch threshold for furnace domain. */
export const FURNACE_BATCH_THRESHOLD = 8;

// ── Furnace Slots ───────────────────────────────────────────────────

/** Two idle furnaces, both available now. */
export const FURNACE_SLOTS_IDLE: P03ResourceSlotV1[] = [
  { id: 'furnace_0', type: 'furnace', readyAtBucket: 0 },
  { id: 'furnace_1', type: 'furnace', readyAtBucket: 0 },
];

/** Two furnaces, one busy until bucket 20 (smelting in progress). */
export const FURNACE_SLOTS_ONE_BUSY: P03ResourceSlotV1[] = [
  { id: 'furnace_0', type: 'furnace', readyAtBucket: 0 },
  { id: 'furnace_1', type: 'furnace', readyAtBucket: 20 },
];

/** Two furnaces, both busy far beyond any reasonable horizon. */
export const FURNACE_SLOTS_ALL_BUSY: P03ResourceSlotV1[] = [
  { id: 'furnace_0', type: 'furnace', readyAtBucket: 200 },
  { id: 'furnace_1', type: 'furnace', readyAtBucket: 250 },
];

/** Four furnaces for parallel proof testing. */
export const FURNACE_SLOTS_FOUR: P03ResourceSlotV1[] = [
  { id: 'furnace_0', type: 'furnace', readyAtBucket: 0 },
  { id: 'furnace_1', type: 'furnace', readyAtBucket: 0 },
  { id: 'furnace_2', type: 'furnace', readyAtBucket: 0 },
  { id: 'furnace_3', type: 'furnace', readyAtBucket: 0 },
];

/** Three furnaces with different readyAt, for tie-breaking tests. */
export const FURNACE_SLOTS_STAGGERED: P03ResourceSlotV1[] = [
  { id: 'furnace_b', type: 'furnace', readyAtBucket: 0 },
  { id: 'furnace_a', type: 'furnace', readyAtBucket: 0 },
  { id: 'furnace_c', type: 'furnace', readyAtBucket: 5 },
];

// ── Furnace Operators ───────────────────────────────────────────────

export const FURNACE_OPERATORS: P03OperatorV1[] = [
  {
    opId: 'smelt_iron_ore',
    durationTicks: 200,
    requiresSlotType: 'furnace',
    baseCost: 10,
  },
  {
    opId: 'smelt_gold_ore',
    durationTicks: 200,
    requiresSlotType: 'furnace',
    baseCost: 10,
  },
  {
    opId: 'cook_raw_beef',
    durationTicks: 200,
    requiresSlotType: 'furnace',
    baseCost: 8,
  },
  {
    opId: 'craft_iron_pickaxe',
    durationTicks: 0, // instant
    baseCost: 5,
  },
  {
    opId: 'mine_iron_ore',
    durationTicks: 40,
    baseCost: 3,
  },
  {
    opId: 'place_furnace',
    durationTicks: 5,
    baseCost: 1,
  },
];

export const FURNACE_BATCH_OPERATORS: P03BatchOperatorV1[] = [
  {
    opId: 'smelt_batch_iron_ore',
    durationTicks: 200,
    requiresSlotType: 'furnace',
    baseCost: 3, // lower per-item cost incentivizes batching
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
];

// ── Furnace Temporal States ─────────────────────────────────────────

export const FURNACE_STATE_IDLE: P03TemporalStateV1 = {
  time: {
    currentBucket: 0,
    horizonBucket: FURNACE_MAX_WAIT_BUCKETS,
    bucketSizeTicks: FURNACE_BUCKET_SIZE_TICKS,
  },
  slots: FURNACE_SLOTS_IDLE,
};

export const FURNACE_STATE_ONE_BUSY: P03TemporalStateV1 = {
  time: {
    currentBucket: 10,
    horizonBucket: 10 + FURNACE_MAX_WAIT_BUCKETS,
    bucketSizeTicks: FURNACE_BUCKET_SIZE_TICKS,
  },
  slots: FURNACE_SLOTS_ONE_BUSY,
};

export const FURNACE_STATE_DEADLOCKED: P03TemporalStateV1 = {
  time: {
    currentBucket: 10,
    horizonBucket: 10 + FURNACE_MAX_WAIT_BUCKETS,
    bucketSizeTicks: FURNACE_BUCKET_SIZE_TICKS,
  },
  slots: FURNACE_SLOTS_ALL_BUSY,
};

export const FURNACE_STATE_FOUR_PARALLEL: P03TemporalStateV1 = {
  time: {
    currentBucket: 0,
    horizonBucket: FURNACE_MAX_WAIT_BUCKETS,
    bucketSizeTicks: FURNACE_BUCKET_SIZE_TICKS,
  },
  slots: FURNACE_SLOTS_FOUR,
};

// ── Furnace Slot Needs ──────────────────────────────────────────────

export const FURNACE_NEEDS_ONE: P03SlotNeedV1[] = [
  { type: 'furnace', count: 1 },
];

export const FURNACE_NEEDS_TWO: P03SlotNeedV1[] = [
  { type: 'furnace', count: 2 },
];

// ── Furnace Expected Schedules ──────────────────────────────────────

/**
 * Expected: 4 furnaces each process 16 items => makespan = 32 buckets.
 * (16 items * 2 buckets/item = 32 buckets per furnace, all in parallel)
 */
export const FURNACE_PARALLEL_SCHEDULE: P03PlannedStepV1[] = [
  { opId: 'smelt_batch_iron_ore', startBucket: 0, endBucket: 32, slotId: 'furnace_0' },
  { opId: 'smelt_batch_iron_ore', startBucket: 0, endBucket: 32, slotId: 'furnace_1' },
  { opId: 'smelt_batch_iron_ore', startBucket: 0, endBucket: 32, slotId: 'furnace_2' },
  { opId: 'smelt_batch_iron_ore', startBucket: 0, endBucket: 32, slotId: 'furnace_3' },
];

/** Expected: 1 furnace processes all 64 items => makespan = 128 buckets. */
export const FURNACE_SERIAL_SCHEDULE: P03PlannedStepV1[] = [
  { opId: 'smelt_batch_iron_ore', startBucket: 0, endBucket: 128, slotId: 'furnace_0' },
];

// ============================================================================
// Domain B: CI Runner Pool (Transfer Surface)
// ============================================================================
//
// CI/CD pipeline scheduling:
// - Each runner is a resource slot of type 'runner'
// - Test suites have durations (build: 5 min, test: 10 min, deploy: 3 min)
// - Bucket size: 60 ticks (1 minute per bucket)
// - Multiple runners can execute in parallel
// - Batch test suites: run multiple suites on one runner

/** Bucket size for CI domain: 60 seconds (1 minute). */
export const CI_BUCKET_SIZE_TICKS = 60;

/** Maximum wait horizon for CI domain (pipeline timeout). */
export const CI_MAX_WAIT_BUCKETS = 30;

/** Batch threshold for CI domain. */
export const CI_BATCH_THRESHOLD = 4;

// ── CI Runner Slots ─────────────────────────────────────────────────

/** Four idle runners. */
export const CI_SLOTS_IDLE: P03ResourceSlotV1[] = [
  { id: 'runner_0', type: 'runner', readyAtBucket: 0 },
  { id: 'runner_1', type: 'runner', readyAtBucket: 0 },
  { id: 'runner_2', type: 'runner', readyAtBucket: 0 },
  { id: 'runner_3', type: 'runner', readyAtBucket: 0 },
];

/** All runners busy far beyond pipeline timeout. */
export const CI_SLOTS_ALL_BUSY: P03ResourceSlotV1[] = [
  { id: 'runner_0', type: 'runner', readyAtBucket: 50 },
  { id: 'runner_1', type: 'runner', readyAtBucket: 55 },
  { id: 'runner_2', type: 'runner', readyAtBucket: 60 },
  { id: 'runner_3', type: 'runner', readyAtBucket: 45 },
];

/** Two runners, one available soon. */
export const CI_SLOTS_STAGGERED: P03ResourceSlotV1[] = [
  { id: 'runner_a', type: 'runner', readyAtBucket: 0 },
  { id: 'runner_b', type: 'runner', readyAtBucket: 0 },
  { id: 'runner_c', type: 'runner', readyAtBucket: 10 },
];

// ── CI Operators ────────────────────────────────────────────────────

export const CI_OPERATORS: P03OperatorV1[] = [
  {
    opId: 'build_project',
    durationTicks: 300, // 5 minutes
    requiresSlotType: 'runner',
    baseCost: 10,
  },
  {
    opId: 'run_test_suite',
    durationTicks: 600, // 10 minutes
    requiresSlotType: 'runner',
    baseCost: 15,
  },
  {
    opId: 'deploy_service',
    durationTicks: 180, // 3 minutes
    requiresSlotType: 'runner',
    baseCost: 8,
  },
  {
    opId: 'lint_check',
    durationTicks: 0, // instant (local)
    baseCost: 1,
  },
];

export const CI_BATCH_OPERATORS: P03BatchOperatorV1[] = [
  {
    opId: 'run_test_batch',
    durationTicks: 600,
    requiresSlotType: 'runner',
    baseCost: 5, // lower per-suite cost incentivizes batching
    itemType: 'test_suite',
    maxBatchSize: 20,
    perItemDurationTicks: 300, // 5 min per additional suite in batch
  },
];

// ── CI Temporal States ──────────────────────────────────────────────

export const CI_STATE_IDLE: P03TemporalStateV1 = {
  time: {
    currentBucket: 0,
    horizonBucket: CI_MAX_WAIT_BUCKETS,
    bucketSizeTicks: CI_BUCKET_SIZE_TICKS,
  },
  slots: CI_SLOTS_IDLE,
};

export const CI_STATE_DEADLOCKED: P03TemporalStateV1 = {
  time: {
    currentBucket: 10,
    horizonBucket: 10 + CI_MAX_WAIT_BUCKETS,
    bucketSizeTicks: CI_BUCKET_SIZE_TICKS,
  },
  slots: CI_SLOTS_ALL_BUSY,
};

export const CI_STATE_FOUR_PARALLEL: P03TemporalStateV1 = {
  time: {
    currentBucket: 0,
    horizonBucket: CI_MAX_WAIT_BUCKETS,
    bucketSizeTicks: CI_BUCKET_SIZE_TICKS,
  },
  slots: CI_SLOTS_IDLE,
};

// ── CI Slot Needs ───────────────────────────────────────────────────

export const CI_NEEDS_ONE_RUNNER: P03SlotNeedV1[] = [
  { type: 'runner', count: 1 },
];

// ── CI Expected Schedules ───────────────────────────────────────────

/**
 * Expected: 4 runners run test suites in parallel.
 * Each runs 5 suites in batch (10 buckets each) => makespan = 10 buckets.
 */
export const CI_PARALLEL_SCHEDULE: P03PlannedStepV1[] = [
  { opId: 'run_test_batch', startBucket: 0, endBucket: 10, slotId: 'runner_0' },
  { opId: 'run_test_batch', startBucket: 0, endBucket: 10, slotId: 'runner_1' },
  { opId: 'run_test_batch', startBucket: 0, endBucket: 10, slotId: 'runner_2' },
  { opId: 'run_test_batch', startBucket: 0, endBucket: 10, slotId: 'runner_3' },
];

/** Expected: 1 runner runs all 20 suites serially => makespan = 40 buckets. */
export const CI_SERIAL_SCHEDULE: P03PlannedStepV1[] = [
  { opId: 'run_test_batch', startBucket: 0, endBucket: 40, slotId: 'runner_0' },
];
