/**
 * Planning and goal management system for conscious bot
 *
 * This package provides:
 * - Goal formulation and homeostasis monitoring
 * - Hierarchical task planning (HTN)
 * - Goal-oriented action planning (GOAP)
 * - Reactive execution and plan repair
 *
 * @author @darianrosebrook
 */

// Goal Formulation
export * from './goal-formulation/homeostasis-monitor';
export * from './goal-formulation/need-generator';
export * from './goal-formulation/goal-manager';
export * from './goal-formulation/utility-calculator';

// Hierarchical Planning (Legacy)
export * from './hierarchical-planner/hierarchical-planner';
export * from './hierarchical-planner/task-network';
export * from './hierarchical-planner/plan-decomposer';

// HRM-Inspired Planning (M3) - Selective exports to avoid conflicts
export {
  CognitiveTaskRouter,
  createCognitiveRouter,
  routeTask,
} from './hierarchical-planner/cognitive-router';

export type {
  TaskType,
  TaskContext,
  RoutingDecision,
  RouterType,
} from './hierarchical-planner/cognitive-router';

export {
  HRMInspiredPlanner,
  createHRMPlanner,
} from './hierarchical-planner/hrm-inspired-planner';

export type {
  Plan as HRMPlan,
  PlanNode as HRMPlanNode,
} from './hierarchical-planner/hrm-inspired-planner';
export {
  IntegratedPlanningSystem,
  createIntegratedPlanningSystem,
  plan as quickPlan,
} from './hierarchical-planner';

// Reactive Execution
export * from './reactive-executor/reactive-executor';
export * from './reactive-executor/goap-planner';
export * from './reactive-executor/plan-repair';

// Integrated Planning Coordinator (M3 - Full Integration)
export {
  IntegratedPlanningCoordinator,
  createIntegratedPlanningCoordinator,
  type PlanningConfiguration,
  type PlanningContext,
  type IntegratedPlanningResult,
} from './integrated-planning-coordinator';

// Types
export * from './types';
