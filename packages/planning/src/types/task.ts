/**
 * Task and task-integration types.
 * Single source of truth for Task, TaskProgress, TaskStatistics, and config.
 *
 * @author @darianrosebrook
 */

import type { TaskStep } from './task-step';
import type { GoalBinding } from '../goals/goal-binding-types';

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
    blockedAt?: number;
    /**
     * Failure code from the last failed action (Phase 2.5 execution hardening).
     * Used for failure taxonomy: deterministic failures (mapping_*, postcondition_*)
     * are non-retryable; transient failures (timeout, stuck) may retry.
     * @see isDeterministicFailure() in task-action-resolver.ts
     */
    failureCode?: string;
    /**
     * Error details from the last failed action.
     * Includes message, stack, and any structured error data.
     */
    failureError?: {
      message?: string;
      code?: string;
      detail?: string;
      [key: string]: unknown;
    };
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
    /** Canonical goal key (action:target) for exact-match idempotency in drive tick */
    goalKey?: string;
    /** Sub-task dedup key — executor-created subtasks use this for idempotency */
    subtaskKey?: string;
    /** Provenance trail: which builder/converter/source created this task */
    taskProvenance?: {
      builder: string;
      source: string;
      actionType?: string;
      [key: string]: unknown;
    };
    /** Immutable origin envelope, stamped by finalizeNewTask(). Do NOT set in callers. */
    origin?: {
      kind: string;
      name?: string;
      parentTaskId?: string;
      parentGoalKey?: string;
      createdAt: number;
    };
    /** Tag-stripped display title (computed on read if missing) */
    titleDisplay?: string;
    /** Tag-stripped display description (computed on read if missing) */
    descriptionDisplay?: string;
    /**
     * Goal binding — join key between Goal (strategic intent) and Task (execution).
     * Present only on goal-bound tasks. Non-goal tasks leave this undefined.
     * @see docs/internal/goal-binding-protocol.md
     */
    goalBinding?: GoalBinding;
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
      /** Acquisition solver plan ID */
      acquisitionPlanId?: string;
      /**
       * Solve-time join keys for deferred episode reporting.
       * @deprecated Use per-domain keys (buildingSolveJoinKeys, etc.) to prevent cross-solver clobbering.
       */
      solveJoinKeys?: import('../sterling/solve-bundle-types').SolveJoinKeys;
      /** Building solver join keys (isolated from other solvers) */
      buildingSolveJoinKeys?: import('../sterling/solve-bundle-types').SolveJoinKeys;
      /** Crafting solver join keys */
      craftingSolveJoinKeys?: import('../sterling/solve-bundle-types').SolveJoinKeys;
      /** Tool progression solver join keys */
      toolProgressionSolveJoinKeys?: import('../sterling/solve-bundle-types').SolveJoinKeys;
      /** Acquisition solver join keys */
      acquisitionSolveJoinKeys?: import('../sterling/solve-bundle-types').SolveJoinKeys;

      // ────────────────────────────────────────────────────────────────────
      // Episode hash slots (Gap 1: persist episode_hash from report_episode ack)
      // ────────────────────────────────────────────────────────────────────

      /** Last episode hash returned by Sterling for building domain */
      buildingEpisodeHash?: string;
      /** Last episode hash returned by Sterling for crafting domain */
      craftingEpisodeHash?: string;
      /** Last episode hash returned by Sterling for tool progression domain */
      toolProgressionEpisodeHash?: string;
      /** Last episode hash returned by Sterling for acquisition domain */
      acquisitionEpisodeHash?: string;

      // ────────────────────────────────────────────────────────────────────
      // Solve result substrate (Gap 3: richer outcome taxonomy in executor path)
      // Stored at solve-time, consumed at report-time for classification
      // ────────────────────────────────────────────────────────────────────

      /**
       * Building solver outcome substrate for deferred classification.
       * Captured at solve-time; used by executor to classify failures richer than binary.
       *
       * COHERENCE INVARIANT: Only consumed when `bundleHash` matches the episode's
       * join keys. Prevents misclassifying replan A's failure as replan B's outcome.
       */
      buildingSolveResultSubstrate?: {
        /** Identity fields for coherence check — must match episode's join keys */
        planId?: string;
        bundleHash?: string;
        /** Solve outcome */
        solved: boolean;
        error?: string;
        totalNodes?: number;
        searchHealth?: { terminationReason?: string };
        /** Classification options snapshot */
        opts?: {
          maxNodes?: number;
          compatIssues?: Array<{ code: string; severity: string }>;
        };
        capturedAt: number;
      };

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
  /**
   * When true, thought-to-task conversion requires convertEligible === true (fail-closed).
   * When false (default), only convertEligible === false blocks — undefined is eligible.
   * Enable once all producers reliably emit the field.
   */
  strictConvertEligibility: boolean;
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
  strictConvertEligibility: false,
};
