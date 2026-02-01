/**
 * Hierarchical Planning Module
 *
 * Retains CognitiveTaskRouter for task routing decisions.
 * Legacy planners (HRM, HTN, IntegratedPlanningSystem) have been retired.
 * New hierarchical macro/micro planning lives in ../hierarchical/.
 *
 * @author @darianrosebrook
 */

// Export cognitive router components (retained)
export {
  CognitiveTaskRouter,
  createCognitiveRouter,
  routeTask,
} from './cognitive-router';

export type {
  TaskType,
  TaskContext,
  RoutingDecision,
  RouterType,
} from './cognitive-router';

// Legacy exports removed:
// - HierarchicalPlanner (HTN decompose) — deleted
// - HRMInspiredPlanner, createHRMPlanner — deleted
// - IntegratedPlanningSystem, createIntegratedPlanningSystem, quickPlan — deleted
// - HTNPlanner — deleted
export * from './task-network';
export { decomposeToPlan } from './plan-decomposer';

// Re-export Rig E hierarchical planning primitives
export * from '../hierarchical';
