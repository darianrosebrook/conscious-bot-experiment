/**
 * P03 Primitive Capsule — Domain-Agnostic Types
 *
 * Defines the contract for temporal planning with durations, batching,
 * and capacity as a portable primitive that any domain can implement.
 *
 * Zero Minecraft imports. Zero vitest imports.
 *
 * Core invariants encoded in this capsule:
 *   1. Time is integer buckets only (no floats, no wall-clock)
 *   2. Wait is bounded (no infinite wait states)
 *   3. Slot selection is deterministic (sorted tie-breaking)
 *   4. Batching is preferred over naive iteration (when applicable)
 *   5. Deadlock is detected before solve (capacity check)
 *
 * Field naming conventions (domain-agnostic):
 *   furnace/runner/station -> resourceSlot  (opaque slot type)
 *   smelt/build/test_run   -> operator      (duration-bearing action)
 *   ticks/seconds/minutes  -> buckets       (quantized time unit)
 */

// ── Contract Version ────────────────────────────────────────────────

export type P03ContractVersion = 'p03.v1';

export const P03_CONTRACT_VERSION: P03ContractVersion = 'p03.v1';

// ── Time State ──────────────────────────────────────────────────────

/**
 * Temporal state: current time and planning horizon.
 * All values are integer buckets — never floats, never wall-clock.
 *
 * The domain decides what a "bucket" maps to in real units
 * (e.g., 100 game ticks, 5 seconds, 1 minute) via bucketSizeTicks.
 * The capsule only enforces integer-ness and boundedness.
 */
export interface P03TimeStateV1 {
  /** Current time in integer buckets. Must be >= 0. */
  readonly currentBucket: number;
  /** Hard upper bound for planning. Must be > currentBucket. */
  readonly horizonBucket: number;
  /**
   * Domain-supplied bucket granularity in domain ticks.
   * Used for canonicalization and hash identity.
   * Must be a positive integer constant within a domain.
   */
  readonly bucketSizeTicks: number;
}

// ── Resource Slots ──────────────────────────────────────────────────

/**
 * A resource slot with time-based availability.
 *
 * Slot types are opaque tokens — the domain decides what "furnace",
 * "runner", or "welding_station" means. The capsule only enforces
 * the structural contract (integer readyAt, deterministic ordering).
 */
export interface P03ResourceSlotV1 {
  /** Stable identifier for this slot (deterministic ordering key). */
  readonly id: string;
  /** Opaque slot type token (domain-namespaced). */
  readonly type: string;
  /** Integer bucket when this slot becomes available. */
  readyAtBucket: number;
}

// ── Temporal State (composite) ──────────────────────────────────────

export interface P03TemporalStateV1 {
  readonly time: P03TimeStateV1;
  readonly slots: readonly P03ResourceSlotV1[];
}

// ── Operators ───────────────────────────────────────────────────────

/**
 * An operator with explicit duration and optional capacity requirement.
 *
 * Domain-specific preconditions/effects remain opaque at the capsule
 * boundary. The capsule enforces duration and slot-type declarations.
 */
export interface P03OperatorV1 {
  /** Stable identifier for this operator. */
  readonly opId: string;
  /** Explicit duration in domain ticks. Must be >= 0. */
  readonly durationTicks: number;
  /** If present, the operator must reserve a slot of this type. */
  readonly requiresSlotType?: string;
  /** Base cost for A* (keeps continuity with existing solver patterns). */
  readonly baseCost: number;
}

// ── Batch Operator ──────────────────────────────────────────────────

/**
 * A batch variant of an operator. Batch operators process multiple
 * items in a single slot reservation, reducing total actions.
 *
 * The capsule enforces: when a batch operator exists for an item type
 * and the goal count meets the threshold, the batch operator is
 * preferred over repeated single-item operations.
 */
export interface P03BatchOperatorV1 extends P03OperatorV1 {
  /** Item type this batch operator handles. */
  readonly itemType: string;
  /** Maximum items per batch. */
  readonly maxBatchSize: number;
  /** Per-item duration within the batch (total = base + perItem * (count-1)). */
  readonly perItemDurationTicks: number;
}

// ── Planned Steps (output) ──────────────────────────────────────────

/**
 * A schedule-annotated step in the solution.
 *
 * startBucket and endBucket encode when the step occupies its
 * resource slot. Steps on the same slotId must not overlap.
 */
export interface P03PlannedStepV1 {
  /** Which operator was applied. */
  readonly opId: string;
  /** Integer bucket when this step begins. */
  readonly startBucket: number;
  /** Integer bucket when this step completes. */
  readonly endBucket: number;
  /** Which slot was reserved (if the operator requires one). */
  readonly slotId?: string;
}

// ── Solve Result ────────────────────────────────────────────────────

export interface P03SolveResultV1 {
  /** Ordered sequence of schedule-annotated steps. */
  readonly steps: readonly P03PlannedStepV1[];
  /** Total makespan in buckets (max endBucket - min startBucket). */
  readonly makespanBuckets: number;
}

// ── Deadlock Check ──────────────────────────────────────────────────

/**
 * Result of a pre-solve deadlock check.
 * Deadlock = at least one required slot type has no slot available
 * within the planning horizon.
 */
export interface P03DeadlockCheckV1 {
  /** Whether a capacity deadlock was detected. */
  readonly isDeadlock: boolean;
  /** Human-readable reason (if deadlocked). */
  readonly reason?: string;
  /** Slot types that are blocked beyond horizon. */
  readonly blockedSlotTypes?: readonly string[];
}

// ── Slot Need (input to deadlock check) ─────────────────────────────

export interface P03SlotNeedV1 {
  /** Slot type required. */
  readonly type: string;
  /** Number of simultaneous slots needed. */
  readonly count: number;
}

// ── Canonicalization Contract ────────────────────────────────────────

/**
 * Canonicalization rules for P03 temporal state.
 *
 * These rules are the source of truth for determinism.
 * Any implementation that deviates from these rules fails
 * the integer_buckets and deterministic_slot_choice invariants.
 */
export const P03_CANONICALIZATION = {
  /**
   * Slots are sorted by (type ASC, readyAtBucket ASC, id ASC)
   * before hashing or before solve. This ensures the same
   * physical state always produces the same canonical form.
   */
  slotSortOrder: ['type', 'readyAtBucket', 'id'] as const,

  /**
   * Slot selection tie-breaking order when multiple slots
   * of the same type are available at the same bucket:
   * prefer lowest readyAtBucket, then lexicographically smallest id.
   */
  slotSelectionOrder: ['readyAtBucket', 'id'] as const,

  /**
   * All time fields must be non-negative integers.
   * Floats, NaN, Infinity, and negative values are rejected.
   */
  integerOnly: true,
} as const;

// ── Adapter Interface ───────────────────────────────────────────────

/**
 * Minimal adapter interface that a domain must implement
 * to satisfy P03 conformance.
 *
 * The conformance suite calls these methods and asserts the
 * invariants against the results.
 */
export interface P03TemporalAdapter {
  /**
   * Canonicalize temporal state: sort slots, validate integers.
   * Must be pure and deterministic.
   */
  canonicalize(state: P03TemporalStateV1): P03TemporalStateV1;

  /**
   * Find the best available slot of a given type at a given bucket.
   * Must use deterministic tie-breaking per P03_CANONICALIZATION.
   * Returns undefined if no slot is available.
   */
  findAvailableSlot(
    slots: readonly P03ResourceSlotV1[],
    slotType: string,
    atBucket: number,
  ): P03ResourceSlotV1 | undefined;

  /**
   * Reserve a slot: return new slots array with the specified slot's
   * readyAtBucket advanced. Must be immutable (no mutation of input).
   */
  reserveSlot(
    slots: readonly P03ResourceSlotV1[],
    slotId: string,
    durationBuckets: number,
    currentBucket: number,
  ): P03ResourceSlotV1[];

  /**
   * Check for capacity deadlock before calling the solver.
   * Must return isDeadlock: true if any needed slot type has no
   * slot available within the horizon.
   */
  checkDeadlock(
    needs: readonly P03SlotNeedV1[],
    state: P03TemporalStateV1,
  ): P03DeadlockCheckV1;

  /**
   * Determine whether to prefer a batch operator for a given item type
   * and goal count. Must return useBatch: true when count >= threshold
   * and a matching batch operator exists.
   */
  preferBatch(
    itemType: string,
    goalCount: number,
    batchOperators: readonly P03BatchOperatorV1[],
    batchThreshold: number,
  ): { useBatch: boolean; operator?: P03BatchOperatorV1; batchSize?: number };

  /**
   * Compute the makespan of a schedule (max endBucket - min startBucket).
   */
  computeMakespan(steps: readonly P03PlannedStepV1[]): number;

  /** Maximum wait horizon in buckets. */
  readonly maxWaitBuckets: number;

  /** Batch threshold: minimum goal count to consider batch operators. */
  readonly batchThreshold: number;
}

// ── Invariants ──────────────────────────────────────────────────────

/**
 * P03 conformance invariants.
 * Each maps directly to one of the 5 Rig C certification pivots.
 */
export const P03_INVARIANTS = [
  /** All time values are non-negative integers; no floats in state. */
  'integer_buckets',
  /** No wait exceeds maxWaitBuckets; deadlock returns unsolved. */
  'bounded_wait',
  /** Same state produces same slot choice across repeated calls. */
  'deterministic_slot_choice',
  /** Batch operator preferred when count >= threshold and operator exists. */
  'batch_preference',
  /** Deadlock detected before solve when no slot available within horizon. */
  'deadlock_pre_solve',
] as const;

export type P03Invariant = (typeof P03_INVARIANTS)[number];

// ── Capability Descriptor ───────────────────────────────────────────

export type P03ClaimId = 'p03';

export interface P03CapabilityDescriptor {
  /** Explicit claim identifier. */
  readonly claim_id: P03ClaimId;
  /** Contract version. */
  readonly contract_version: P03ContractVersion;
  /** Which invariants this adapter claims to satisfy. */
  readonly invariants: readonly P03Invariant[];
  /** Maximum wait horizon in buckets. */
  readonly maxWaitBuckets: number;
  /** Batch threshold used by this adapter. */
  readonly batchThreshold: number;
  /** Content hash of conformance suite source (placeholder until CI generates). */
  readonly suite_hash?: string;
}
