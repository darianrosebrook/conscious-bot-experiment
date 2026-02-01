/**
 * Planning and goal management system for conscious bot
 *
 * This package provides:
 * - Goal formulation and homeostasis monitoring
 * - Cognitive task routing
 * - Sterling solver integration (crafting, building, tool progression)
 * - Reactive execution with safety reflexes
 * - Capability-aware action plan routing
 *
 * Legacy planners (HRM, GOAP planTo, HTN decompose, IntegratedPlanningCoordinator)
 * have been retired. Sterling solvers + deterministic compiler are canonical.
 *
 * @author @darianrosebrook
 */

// Goal Formulation
export * from './goal-formulation/homeostasis-monitor';
export * from './goal-formulation/need-generator';
export * from './goal-formulation/goal-manager';
export { GoalManager as EnhancedGoalManager } from './goal-formulation/goal-manager';
export * from './goal-formulation/utility-calculator';

// Cognitive Task Routing (retained from hierarchical-planner)
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

// Behavior Trees
export {
  BehaviorTreeRunner,
  BTNodeStatus,
  BTNodeType,
  type BTNode,
  type BTTick,
  type BTRunResult,
  type BTRunOptions,
} from './behavior-trees/BehaviorTreeRunner';

// Reactive Execution
export * from './reactive-executor/reactive-executor';
/** @deprecated Use ReactiveExecutor */
export { ReactiveExecutor as EnhancedReactiveExecutor } from './reactive-executor/reactive-executor';

// Safety Reflexes (extracted from GOAP planner)
export {
  SafetyReflexes,
  type ExecutionSnapshot,
  type SafetyAction,
  type ReflexMCPBus,
} from './reactive-executor/safety-reflexes';

// Capability-aware routing
export {
  routeActionPlan,
  type CapabilityRoute,
  type PlanBackend,
} from './modules/action-plan-backend';
export type { RouteOptions } from './modules/action-plan-backend';

// Solve contract types
export type {
  SolveInput,
  SolveOutput,
  FailureContext,
  RepairInput,
  CompilerConstraints,
  SterlingDomainDeclaration,
} from './modules/solve-contract';

// Types
export * from './types.js';

// Cognitive Thought Processing
export {
  CognitiveThoughtProcessor,
  type CognitiveThought,
  type CognitiveThoughtProcessorConfig,
} from './cognitive-thought-processor';

// Sterling reasoning integration
export { SterlingReasoningService } from './sterling';
export type {
  SterlingReasoningConfig,
  ReachabilityResult,
  KGTraversalResult,
} from './sterling';

// Sterling Minecraft crafting domain
export { MinecraftCraftingSolver } from './sterling';
export {
  buildCraftingRules,
  inventoryToRecord,
  goalFromTaskRequirement,
} from './sterling';
export type {
  MinecraftCraftingRule,
  CraftingInventory,
  CraftingInventoryItem,
  MinecraftSolveRequest,
  MinecraftSolveStep,
  MinecraftCraftingSolveResult,
} from './sterling';

// Additional exports for minecraft-interface compatibility
export type { PlanStep, HomeostasisState, PlanningContext } from './types';

// Interfaces and bootstrap for dependency injection
export type {
  ITaskIntegration,
  IGoalManager,
  IReactiveExecutor,
} from './interfaces';
export { createPlanningBootstrap } from './modules/planning-bootstrap';

// Task integration and integrations (used by modular-server; backward-compat aliases)
export {
  TaskIntegration,
  type TaskIntegrationConfig,
} from './task-integration';
/** @deprecated Use TaskIntegration */
export { TaskIntegration as EnhancedTaskIntegration } from './task-integration';
/** @deprecated Use TaskIntegrationConfig */
export type { TaskIntegrationConfig as EnhancedTaskIntegrationConfig } from './task-integration';
