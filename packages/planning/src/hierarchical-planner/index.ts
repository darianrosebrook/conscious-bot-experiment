/**
 * Hierarchical Planning Module
 *
 * Retains CognitiveTaskRouter for task routing decisions.
 * Legacy planners (HRM, HTN, IntegratedPlanningSystem) have been retired.
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
// - task-network, plan-decomposer — retained as standalone files
export * from './task-network';
export * from './plan-decomposer';
