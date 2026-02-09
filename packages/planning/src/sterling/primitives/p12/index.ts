/**
 * P12 Primitive — Invariant Maintenance (Receding-Horizon Control)
 *
 * Barrel export for all P12 capsule types, reference adapter, and fixtures.
 */

// Capsule types and constants
export {
  MAX_HORIZON_TICKS,
  NUM_BUCKETS,
  P12_CONTRACT_VERSION,
  P12_INVARIANTS,
  toMetricBucket,
} from './p12-capsule-types.js';

export type {
  MetricBucket,
  P12CapabilityDescriptor,
  P12ClaimId,
  P12ContractVersion,
  P12DriftRateV1,
  P12Invariant,
  P12InvariantAdapter,
  P12InvariantVectorV1,
  P12MaintenanceOperatorV1,
  P12MaintenanceScheduleV1,
  P12MetricSlotV1,
  P12OperatorCostV1,
  P12ScheduledMaintenanceV1,
  P12ViolationProjectionV1,
} from './p12-capsule-types.js';

// Reference adapter
export { P12ReferenceAdapter } from './p12-reference-adapter.js';

// Reference fixtures — two domains for portability proof
export {
  SURVIVAL_DRIFT_RATES,
  SURVIVAL_OPERATORS,
  SURVIVAL_SLOTS,
  VEHICLE_DRIFT_RATES,
  VEHICLE_OPERATORS,
  VEHICLE_SLOTS,
} from './p12-reference-fixtures.js';
