/**
 * Constraints Module — Partial-Order Plans, Feasibility, Linearization
 *
 * @author @darianrosebrook
 */

// Decision vocabulary (shared across planning subsystems)
export type {
  PlanningDecision,
  BlockedReason,
  ErrorReason,
} from './planning-decisions';

// Core DAG types
export {
  PARTIAL_ORDER_SCHEMA_VERSION,
  MAX_DAG_NODES,
  computeNodeId,
  computePlanDigest,
} from './partial-order-plan';
export type {
  PlanNode,
  PlanEdge,
  ConstraintType,
  PartialOrderPlan,
  RigGSignals,
} from './partial-order-plan';

// Linearization
export { linearize } from './linearization';
export type { LinearizationResult } from './linearization';

// DAG builder
export { buildDagFromModules, findCommutingPairs } from './dag-builder';
export type { CommutingPair } from './dag-builder';

// Constraint model
export {
  extractDependencyConstraints,
  extractSupportConstraints,
  extractReachabilityConstraints,
} from './constraint-model';
export type {
  DependencyConstraint,
  ReachabilityConstraint,
  SupportConstraint,
  PlanConstraint,
  SupportRequirement,
  ReachabilityZone,
} from './constraint-model';

// Feasibility checker
export { checkFeasibility } from './feasibility-checker';
export type {
  FeasibilityViolation,
  FeasibilityResult,
} from './feasibility-checker';

// Signals
export { computeRigGSignals } from './signals';
export type { ComputeRigGSignalsInput } from './signals';
