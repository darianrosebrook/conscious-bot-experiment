/**
 * Goal Lifecycle Hooks
 *
 * Minimal hook registry connecting the goal-binding protocol to the
 * execution substrate. Hooks fire on lifecycle events and produce
 * structured effects (same SyncEffect type as the reducer).
 *
 * This is the integration point: TaskIntegration emits events,
 * hooks produce effects, caller applies them.
 *
 * @see docs/internal/goal-binding-protocol.md §I
 */

import type { Task } from '../types/task';
import type { GoalBinding, GoalHoldReason } from './goal-binding-types';
import { reduceTaskEvent, reduceGoalEvent, type SyncEffect, type TaskEvent, type GoalEvent } from './goal-task-sync';
import { checkCompletion, applyCompletionOutcome, type CompletionCheckOutcome } from './completion-checker';
import type { VerifierRegistry, VerificationWorldState } from './verifier-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LifecycleHookResult {
  syncEffects: SyncEffect[];
  completionOutcome?: CompletionCheckOutcome;
}

// ---------------------------------------------------------------------------
// Task status change hook
// ---------------------------------------------------------------------------

/**
 * Hook fired when a task's status changes.
 * Produces sync effects (goal status update) and optionally runs
 * completion verification when the task reaches completion.
 */
export function onTaskStatusChanged(
  task: Task,
  oldStatus: Task['status'],
  newStatus: Task['status'],
  options?: {
    verifierRegistry?: VerifierRegistry;
    worldState?: VerificationWorldState;
  },
): LifecycleHookResult {
  const event: TaskEvent = {
    type: 'task_status_changed',
    taskId: task.id,
    oldStatus,
    newStatus,
  };

  const syncEffects = reduceTaskEvent(event, task);
  let completionOutcome: CompletionCheckOutcome | undefined;

  // Run completion check when task reaches 'completed' status
  if (newStatus === 'completed' && options?.verifierRegistry) {
    completionOutcome = checkCompletion(task, options.verifierRegistry, options.worldState);
  }

  return { syncEffects, completionOutcome };
}

// ---------------------------------------------------------------------------
// Goal action hook
// ---------------------------------------------------------------------------

/**
 * Hook fired when a goal-level action occurs (pause, resume, cancel, reprioritize).
 * Produces task-side effects.
 */
export function onGoalAction(
  event: GoalEvent,
  allTasks: Task[],
): LifecycleHookResult {
  const syncEffects = reduceGoalEvent(event, allTasks);
  return { syncEffects };
}

// ---------------------------------------------------------------------------
// Task progress hook
// ---------------------------------------------------------------------------

/**
 * Hook fired when task progress is updated.
 * Optionally runs completion check when progress reaches 1.0.
 */
export function onTaskProgressUpdated(
  task: Task,
  progress: number,
  options?: {
    verifierRegistry?: VerifierRegistry;
    worldState?: VerificationWorldState;
  },
): LifecycleHookResult {
  const syncEffects = reduceTaskEvent(
    { type: 'task_progress_updated', taskId: task.id, progress },
    task,
  );

  let completionOutcome: CompletionCheckOutcome | undefined;

  // Run completion check when progress hits 100%
  if (progress >= 1.0 && options?.verifierRegistry) {
    completionOutcome = checkCompletion(task, options.verifierRegistry, options.worldState);
  }

  return { syncEffects, completionOutcome };
}

// ---------------------------------------------------------------------------
// Effect applier
// ---------------------------------------------------------------------------

export interface EffectApplierDeps {
  getTask: (taskId: string) => Task | undefined;
  setTask: (task: Task) => void;
  updateGoalStatus?: (goalId: string, status: string, reason?: string) => void;
}

/**
 * Apply a list of sync effects to the store.
 * Returns the number of effects applied (excluding noops).
 */
export function applySyncEffects(
  effects: SyncEffect[],
  deps: EffectApplierDeps,
): number {
  let applied = 0;

  for (const effect of effects) {
    switch (effect.type) {
      case 'update_goal_status': {
        deps.updateGoalStatus?.(effect.goalId, effect.status, effect.reason);
        applied++;
        break;
      }

      case 'update_task_status': {
        const task = deps.getTask(effect.taskId);
        if (task) {
          task.status = effect.status;
          task.metadata.updatedAt = Date.now();
          deps.setTask(task);
          applied++;
        }
        break;
      }

      case 'apply_hold': {
        const task = deps.getTask(effect.taskId);
        if (task) {
          const { applyHold } = require('./goal-binding-normalize');
          applyHold(task, {
            reason: effect.reason,
            heldAt: Date.now(),
            resumeHints: [],
            nextReviewAt: effect.nextReviewAt,
          });
          deps.setTask(task);
          applied++;
        }
        break;
      }

      case 'clear_hold': {
        const task = deps.getTask(effect.taskId);
        if (task) {
          const { clearHold } = require('./goal-binding-normalize');
          clearHold(task);
          deps.setTask(task);
          applied++;
        }
        break;
      }

      case 'noop':
        // No action
        break;

      default:
        break;
    }
  }

  return applied;
}
