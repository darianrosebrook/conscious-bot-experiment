/**
 * Planning bootstrap with optional dependency injection
 *
 * Creates planning components with optional overrides for testing.
 * If overrides are not provided, instantiates defaults.
 *
 * @author @darianrosebrook
 */

import type { ITaskIntegration } from '../interfaces/task-integration';
import type { IGoalManager } from '../interfaces/goal-manager';
import type { IReactiveExecutor } from '../interfaces/reactive-executor';
import { TaskIntegration } from '../task-integration';
import { GoalManager } from '../goal-formulation/goal-manager';
import { ReactiveExecutor } from '../reactive-executor/reactive-executor';

export interface PlanningBootstrapOverrides {
  taskIntegration?: ITaskIntegration;
  goalManager?: IGoalManager;
  reactiveExecutor?: IReactiveExecutor;
}

export interface PlanningBootstrapConfig {
  taskIntegration?: ConstructorParameters<typeof TaskIntegration>[0];
}

export interface PlanningBootstrapResult {
  taskIntegration: ITaskIntegration;
  goalManager: IGoalManager;
  reactiveExecutor: IReactiveExecutor;
}

const DEFAULT_TASK_CONFIG = {
  enableRealTimeUpdates: true,
  enableProgressTracking: true,
  enableTaskStatistics: true,
  enableTaskHistory: true,
  maxTaskHistory: 1000,
  progressUpdateInterval: 5000,
  dashboardEndpoint: 'http://localhost:3000',
  enableActionVerification: true,
  actionVerificationTimeout: 10000,
};

/**
 * Create planning components with optional overrides.
 * Enables tests to inject mocks via overrides.
 */
export function createPlanningBootstrap(
  overrides?: PlanningBootstrapOverrides,
  config?: PlanningBootstrapConfig
): PlanningBootstrapResult {
  const taskIntegration =
    overrides?.taskIntegration ??
    new TaskIntegration({ ...DEFAULT_TASK_CONFIG, ...config?.taskIntegration });

  const goalManager = overrides?.goalManager ?? new GoalManager();
  const reactiveExecutor =
    overrides?.reactiveExecutor ?? new ReactiveExecutor();

  return { taskIntegration, goalManager, reactiveExecutor };
}
