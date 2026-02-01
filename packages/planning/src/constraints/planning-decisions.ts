/**
 * Shared discriminated-union pattern for planning-stage results.
 *
 * Every planning function that can fail returns PlanningDecision<T>
 * instead of throwing or returning empty arrays. Callers log the
 * reason and detail in structured telemetry.
 *
 * @author @darianrosebrook
 */

/** Discriminated union for any planning-stage result. */
export type PlanningDecision<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'blocked'; reason: BlockedReason; detail: string }
  | { kind: 'error'; reason: ErrorReason; detail: string; cause?: unknown };

export type BlockedReason =
  | 'infeasible_dependency'
  | 'infeasible_reachability'
  | 'bound_exceeded'
  | 'unknown_context'
  | 'no_macro_path'
  | 'ontology_gap'
  | 'schema_mismatch'
  | 'planner_unconfigured';

export type ErrorReason =
  | 'cycle_detected'
  | 'serialization_error'
  | 'invariant_violation';
