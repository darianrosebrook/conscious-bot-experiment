/**
 * P12 Primitive Capsule — Domain-Agnostic Types
 *
 * Defines the contract for invariant maintenance (non-terminal goals;
 * control-by-receding-horizon) as a portable primitive that any domain
 * can implement.
 *
 * Zero Minecraft imports. Zero vitest imports.
 *
 * Core invariants encoded in this capsule:
 *   1. Metrics are integer buckets only (no raw floats in state)
 *   2. Drift projection is deterministic (same state + ticks = same projection)
 *   3. Hazard/external metrics are excluded from drift (set externally, not decayed)
 *   4. Horizon is bounded (MAX_HORIZON_TICKS cap)
 *   5. Maintenance is proactive (scheduled before violations, not after)
 *
 * Field naming conventions (domain-agnostic):
 *   food/fuel/health      -> metric        (abstract measurable resource)
 *   eat/refuel/repair     -> operator      (maintenance action)
 *   tick/step/cycle       -> horizon unit  (discrete time step)
 */

// -- Contract Version --------------------------------------------------------

export type P12ContractVersion = 'p12.v1';

export const P12_CONTRACT_VERSION: P12ContractVersion = 'p12.v1';

// -- Metric Buckets ----------------------------------------------------------

/**
 * Number of discrete buckets per metric.
 * All metric values are integers in [0, NUM_BUCKETS - 1].
 * Bucket 0 is the worst state (depleted/critical).
 * Bucket NUM_BUCKETS-1 is the best state (full/safe).
 */
export const NUM_BUCKETS = 5;

/**
 * Maximum ticks the horizon solver will project forward.
 * Prevents unbounded planning loops.
 */
export const MAX_HORIZON_TICKS = 600;

/**
 * A metric bucket value: integer in [0, NUM_BUCKETS - 1].
 */
export type MetricBucket = 0 | 1 | 2 | 3 | 4;

/**
 * Snap a raw value to a bucket given the metric's range.
 * Pure function — no side effects, deterministic.
 *
 * @param rawValue  The raw domain value (e.g., food 0-20, health 0-20)
 * @param min       Minimum of the raw range (inclusive)
 * @param max       Maximum of the raw range (exclusive upper for bucketing)
 * @returns         Integer bucket in [0, NUM_BUCKETS - 1]
 */
export function toMetricBucket(rawValue: number, min: number, max: number): MetricBucket {
  const clamped = Math.max(min, Math.min(max, rawValue));
  const normalized = (clamped - min) / (max - min);
  const bucket = Math.min(NUM_BUCKETS - 1, Math.floor(normalized * NUM_BUCKETS));
  return bucket as MetricBucket;
}

// -- Metric Slot Definition --------------------------------------------------

/**
 * A metric slot definition describes one measurable resource/condition
 * tracked by the invariant maintenance system.
 *
 * Domain-agnostic: food, fuel, tire_pressure, etc. are all "metric slots."
 */
export interface P12MetricSlotV1 {
  /** Stable identifier for this metric. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Warn threshold (bucket value). Maintenance should start when metric reaches this. */
  readonly warnThreshold: MetricBucket;
  /** Critical threshold (bucket value). Violation if metric reaches this. */
  readonly criticalThreshold: MetricBucket;
  /** Raw value range for bucket conversion. */
  readonly range: { readonly min: number; readonly max: number };
  /**
   * Whether this metric drifts naturally over time.
   * If false, the metric is set externally (e.g., threat from hazard summary).
   */
  readonly drifts: boolean;
}

// -- Invariant Vector --------------------------------------------------------

/**
 * The invariant vector is the full state of all tracked metrics.
 * All values are MetricBucket integers. No raw floats.
 */
export interface P12InvariantVectorV1 {
  /** Metric ID -> bucket value. */
  readonly metrics: Readonly<Record<string, MetricBucket>>;
  /** Tick at which this vector was last updated. */
  readonly lastUpdatedTick: number;
}

// -- Drift Rate --------------------------------------------------------------

/**
 * Per-metric drift rate. Defines how quickly a metric degrades per tick.
 * Only applies to metrics with `drifts: true` in their slot definition.
 *
 * `decayPerTick` is in bucket-fraction units per tick:
 *   e.g., 0.001 means 1 full bucket decays every 1000 ticks.
 */
export interface P12DriftRateV1 {
  /** Which metric this rate applies to. */
  readonly slotId: string;
  /** Bucket-fraction units lost per tick. Must be >= 0. */
  readonly decayPerTick: number;
}

// -- Violation Projection ----------------------------------------------------

/**
 * Projection of when a specific metric will violate its thresholds.
 * Computed by forward-simulating drift from the current state.
 */
export interface P12ViolationProjectionV1 {
  /** Which metric this projection is for. */
  readonly slotId: string;
  /** Current bucket value. */
  readonly currentBucket: MetricBucket;
  /** Projected bucket value at end of horizon. */
  readonly projectedBucket: MetricBucket;
  /** Ticks until warn threshold is reached (null if not within horizon). */
  readonly ticksToWarn: number | null;
  /** Ticks until critical threshold is reached (null if not within horizon). */
  readonly ticksToCritical: number | null;
}

// -- Maintenance Operator ----------------------------------------------------

/**
 * A maintenance operator is a restorative action that improves a metric.
 * Domain-agnostic: eat_food, refuel, replace_tire are all operators.
 */
export interface P12MaintenanceOperatorV1 {
  /** Stable identifier for this operator. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Which metric slot this operator restores. */
  readonly targetSlotId: string;
  /** How many bucket units this operator restores (clamped to NUM_BUCKETS-1). */
  readonly restoreAmount: number;
  /** Cost vector for operator selection trade-offs. */
  readonly cost: P12OperatorCostV1;
}

export interface P12OperatorCostV1 {
  /** Resource cost (normalized 0..1). 0 = free. */
  readonly resource: number;
  /** Disruption to current goal (0..1). 0 = no interruption. */
  readonly disruption: number;
  /** Risk exposure during the action (0..1). 0 = safe. */
  readonly risk: number;
}

// -- Scheduled Maintenance ---------------------------------------------------

/**
 * A single scheduled maintenance action in the horizon plan.
 */
export interface P12ScheduledMaintenanceV1 {
  /** The operator to execute. */
  readonly operatorId: string;
  /** Tick at which to execute (absolute game tick). */
  readonly scheduledAtTick: number;
  /** Human-readable reason for scheduling this action. */
  readonly reason: string;
  /** The violation projection that triggered this scheduling. */
  readonly projectedViolation: P12ViolationProjectionV1;
  /** Total cost (sum of cost components). */
  readonly totalCost: number;
}

/**
 * A complete maintenance schedule over the horizon window.
 */
export interface P12MaintenanceScheduleV1 {
  /** Tick at which this schedule was computed. */
  readonly currentTick: number;
  /** How far ahead this schedule projects (capped at MAX_HORIZON_TICKS). */
  readonly horizonTicks: number;
  /** Ordered list of scheduled maintenance actions. */
  readonly scheduled: readonly P12ScheduledMaintenanceV1[];
  /** Human-readable explanation of the schedule. */
  readonly explanation: string;
}

// -- Adapter Interface -------------------------------------------------------

/**
 * Minimal adapter interface that a domain must implement
 * to satisfy P12 conformance.
 *
 * All pure methods must be deterministic (no side effects).
 */
export interface P12InvariantAdapter {
  /**
   * Initialize an invariant vector with all metrics at their full bucket.
   * Pure and deterministic.
   */
  initializeVector(
    slots: readonly P12MetricSlotV1[],
    tick: number,
  ): P12InvariantVectorV1;

  /**
   * Convert a raw domain value to a metric bucket for a given slot.
   * Must use toMetricBucket() with the slot's range.
   */
  toBucket(slot: P12MetricSlotV1, rawValue: number): MetricBucket;

  /**
   * Project drift forward by the given number of ticks.
   * Must be deterministic: same vector + ticks = same projection.
   * Must only decay metrics with drifts: true.
   * Must clamp projected values to [0, NUM_BUCKETS - 1].
   * Must not project beyond MAX_HORIZON_TICKS.
   */
  projectDrift(
    vector: P12InvariantVectorV1,
    driftRates: readonly P12DriftRateV1[],
    ticks: number,
  ): P12InvariantVectorV1;

  /**
   * Project when each metric will violate its thresholds within the horizon.
   * Must be deterministic.
   * Must respect MAX_HORIZON_TICKS.
   */
  projectViolations(
    vector: P12InvariantVectorV1,
    slots: readonly P12MetricSlotV1[],
    driftRates: readonly P12DriftRateV1[],
    horizonTicks: number,
  ): readonly P12ViolationProjectionV1[];

  /**
   * Apply a maintenance operator to a vector, restoring the target metric.
   * Returns the updated vector with the metric clamped to [0, NUM_BUCKETS-1].
   * Must be deterministic.
   */
  applyOperator(
    vector: P12InvariantVectorV1,
    operator: P12MaintenanceOperatorV1,
    tick: number,
  ): P12InvariantVectorV1;

  /**
   * Schedule proactive maintenance over the horizon window.
   * Must schedule actions BEFORE violations (proactive, not reactive).
   * Must use deterministic operator selection (lowest total cost, tie-break by ID).
   * Must not schedule beyond MAX_HORIZON_TICKS.
   */
  scheduleMaintenance(
    vector: P12InvariantVectorV1,
    slots: readonly P12MetricSlotV1[],
    driftRates: readonly P12DriftRateV1[],
    operators: readonly P12MaintenanceOperatorV1[],
    horizonTicks: number,
  ): P12MaintenanceScheduleV1;

  /** Maximum horizon ticks this adapter supports. */
  readonly maxHorizonTicks: number;

  /** Number of buckets per metric. */
  readonly numBuckets: number;
}

// -- Invariants --------------------------------------------------------------

/**
 * P12 conformance invariants.
 * Each maps directly to one of the 5 Rig J certification pivots.
 */
export const P12_INVARIANTS = [
  /** All metric values are integer buckets in [0, NUM_BUCKETS-1]; no raw floats. */
  'metric_buckets',
  /** Drift projection is deterministic: same state + ticks = identical projection. */
  'deterministic_drift',
  /** External metrics (drifts: false) are excluded from drift projection. */
  'hazard_exclusion',
  /** Horizon is bounded: no projection beyond MAX_HORIZON_TICKS. */
  'bounded_horizon',
  /** Maintenance is proactive: scheduled before violations, not after. */
  'proactive_emission',
] as const;

export type P12Invariant = (typeof P12_INVARIANTS)[number];

// -- Capability Descriptor ---------------------------------------------------

export type P12ClaimId = 'p12';

export interface P12CapabilityDescriptor {
  /** Explicit claim identifier. */
  readonly claim_id: P12ClaimId;
  /** Contract version. */
  readonly contract_version: P12ContractVersion;
  /** Which invariants this adapter claims to satisfy. */
  readonly invariants: readonly P12Invariant[];
  /** Maximum horizon ticks. */
  readonly maxHorizonTicks: number;
  /** Number of buckets per metric. */
  readonly numBuckets: number;
  /** Content hash of conformance suite source (placeholder until CI generates). */
  readonly suite_hash?: string;
}
