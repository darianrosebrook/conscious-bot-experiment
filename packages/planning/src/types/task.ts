/**
 * Task and task-integration types.
 * Single source of truth for Task, TaskProgress, TaskStatistics, and config.
 *
 * @author @darianrosebrook
 */

import type { TaskStep } from './task-step';

export type { TaskStep } from './task-step';

export interface Task {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: number;
  urgency: number;
  progress: number;
  status:
    | 'pending'
    | 'pending_planning'
    | 'active'
    | 'completed'
    | 'failed'
    | 'paused'
    | 'unplannable';
  source: 'planner' | 'goal' | 'intrusive' | 'autonomous' | 'manual';
  steps: TaskStep[];
  parameters: Record<string, any>;
  metadata: {
    createdAt: number;
    updatedAt: number;
    startedAt?: number;
    completedAt?: number;
    estimatedDuration?: number;
    actualDuration?: number;
    retryCount: number;
    maxRetries: number;
    lastRetry?: number;
    parentTaskId?: string;
    childTaskIds: string[];
    tags: string[];
    category: string;
    requirement?: any;
    nextEligibleAt?: number;
    blockedReason?: string;
    prereqInjectionCount?: number;
    lastBindingFailure?: {
      stepId: string;
      order: number;
      leaf?: string;
      authority?: string;
      at: number;
    };
    repairCount?: number;
    lastRepairAt?: number;
    lastStepsDigest?: string;
    pendingPlanningTicks?: number;
    /** Tag-stripped display title (computed on read if missing) */
    titleDisplay?: string;
    /** Tag-stripped display description (computed on read if missing) */
    descriptionDisplay?: string;
    /**
     * Solver-produced metadata namespace.
     * All solver outputs (Rig G signals, building plan IDs, Rig E macro data, etc.)
     * are stored here. addTask() merges this namespace generically so new solver
     * outputs don't require key-by-key propagation.
     */
    solver?: {
      /** Rig G feasibility metadata (versioned, fail-closed on unknown version) */
      rigG?: import('../constraints/execution-advisor').RigGMetadata;
      /** Building solver plan ID */
      buildingPlanId?: string;
      /** Building solver template ID */
      buildingTemplateId?: string;
      /** Crafting solver plan ID */
      craftingPlanId?: string;
      /** Tool progression solver plan ID */
      toolProgressionPlanId?: string;
      /** Rig G gate already checked for this task */
      rigGChecked?: boolean;
      /** Suggested parallelism from Rig G ready-set analysis */
      suggestedParallelism?: number;
      /** Rig G replan attempt count */
      replanAttempts?: number;
      /** Rig G replan in-flight marker */
      rigGReplan?: {
        inFlight: boolean;
        attempt: number;
        scheduledAt: number;
      };
      /** Steps digest for detecting identical replans */
      stepsDigest?: string;
      /** Building replan count */
      buildingReplanCount?: number;
      /** Additional solver-specific fields */
      [key: string]: unknown;
    };
  };
}

export interface TaskProgress {
  taskId: string;
  progress: number;
  currentStep: number;
  completedSteps: number;
  totalSteps: number;
  status: Task['status'];
  timestamp: number;
}

export interface TaskStatistics {
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageCompletionTime: number;
  successRate: number;
  tasksByCategory: Record<string, number>;
  tasksBySource: Record<string, number>;
}

export type VerificationStatus = 'verified' | 'skipped' | 'failed';

export interface ActionVerification {
  taskId: string;
  stepId: string;
  actionType: string;
  expectedResult: any;
  actualResult?: any;
  verified: boolean;
  status: VerificationStatus;
  timestamp: number;
}

export type StepSnapshot = {
  position?: { x: number; y: number; z: number };
  food?: number;
  health?: number;
  inventoryTotal?: number;
  inventoryByName?: Record<string, number>;
  ts: number;
};

export interface TaskIntegrationConfig {
  enableRealTimeUpdates: boolean;
  enableProgressTracking: boolean;
  enableTaskStatistics: boolean;
  enableTaskHistory: boolean;
  maxTaskHistory: number;
  progressUpdateInterval: number;
  dashboardEndpoint: string;
  minecraftEndpoint?: string;
  enableActionVerification: boolean;
  actionVerificationTimeout: number;
}

export const DEFAULT_TASK_INTEGRATION_CONFIG: TaskIntegrationConfig = {
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
