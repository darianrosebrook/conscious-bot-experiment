/**
 * Goal ↔ Task Synchronization Reducer
 *
 * Deterministic, pure reducer that maps Task status transitions to Goal
 * status changes and vice versa.
 *
 * Design: Task is canonical for execution state; Goal is canonical for
 * strategic intent. This reducer is the sole translation layer between them.
 *
 * The reducer is pure: (state, event) → effects. The caller (event listener,
 * periodic reconciler) is responsible for applying the effects.
 *
 * @see docs/internal/goal-binding-protocol.md §E
 */

import type { Task } from '../types/task';
import type { GoalBinding, GoalHoldReason } from './goal-binding-types';
import { GoalStatus } from '../types';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/**
 * Events emitted by the task execution layer.
 * The reducer consumes these to produce goal-side effects.
 */
export type TaskEvent =
  | { type: 'task_status_changed'; taskId: string; oldStatus: Task['status']; newStatus: Task['status'] }
  | { type: 'task_progress_updated'; taskId: string; progress: number }
  | { type: 'task_steps_regenerated'; taskId: string };

/**
 * Events emitted by the goal management layer.
 * The reducer consumes these to produce task-side effects.
 */
export type GoalEvent =
  | { type: 'goal_paused'; goalId: string; reason: GoalHoldReason }
  | { type: 'goal_resumed'; goalId: string }
  | { type: 'goal_cancelled'; goalId: string; reason: string }
  | { type: 'goal_reprioritized'; goalId: string; priority: number; urgency: number };

// ---------------------------------------------------------------------------
// Effect types
// ---------------------------------------------------------------------------

/**
 * Effects produced by the reducer. The caller applies these to the store.
 * Effects are deterministic and ordered — apply in sequence.
 */
export type SyncEffect =
  | { type: 'update_goal_status'; goalId: string; status: GoalStatus; reason?: string }
  | { type: 'update_task_status'; taskId: string; status: Task['status']; reason?: string }
  | { type: 'apply_hold'; taskId: string; reason: GoalHoldReason; nextReviewAt: number }
  | { type: 'clear_hold'; taskId: string }
  | { type: 'update_goal_priority'; goalId: string; priority: number; urgency: number }
  | { type: 'noop'; reason: string };

// ---------------------------------------------------------------------------
// Task → Goal status mapping
// ---------------------------------------------------------------------------

/**
 * Map a Task status to the corresponding Goal status.
 * This is the canonical direction: Task executes, Goal reflects.
 */
export function taskStatusToGoalStatus(taskStatus: Task['status']): GoalStatus {
  switch (taskStatus) {
    case 'pending':
    case 'pending_planning':
      return GoalStatus.PENDING;
    case 'active':
      return GoalStatus.ACTIVE;
    case 'completed':
      return GoalStatus.COMPLETED;
    case 'failed':
    case 'unplannable':
      return GoalStatus.FAILED;
    case 'paused':
      return GoalStatus.SUSPENDED;
    default:
      return GoalStatus.PENDING;
  }
}

// ---------------------------------------------------------------------------
// Core reducer: Task events → Goal effects
// ---------------------------------------------------------------------------

/**
 * Reduce a task event into goal-side effects.
 *
 * @param event - The task event
 * @param task - Current task state (must have goalBinding)
 * @returns Array of effects to apply (may be empty)
 */
export function reduceTaskEvent(
  event: TaskEvent,
  task: Task,
): SyncEffect[] {
  const binding = task.metadata.goalBinding as GoalBinding | undefined;
  if (!binding) {
    return [{ type: 'noop', reason: 'task has no goalBinding' }];
  }

  const goalId = binding.goalId;

  switch (event.type) {
    case 'task_status_changed': {
      const effects: SyncEffect[] = [];

      // Only produce goal status update if we have a goalId to target
      if (goalId) {
        const newGoalStatus = taskStatusToGoalStatus(event.newStatus);
        effects.push({
          type: 'update_goal_status',
          goalId,
          status: newGoalStatus,
          reason: `task ${event.taskId} transitioned to ${event.newStatus}`,
        });
      }

      // If task is paused, it must have been through applyHold —
      // the hold lifecycle is managed separately (commit 8).
      // No additional effects needed here.

      // If task completed, the completion verifier runs separately
      // (commit 12-13). No additional effects needed here.

      return effects.length > 0 ? effects : [{ type: 'noop', reason: 'no goalId on binding' }];
    }

    case 'task_progress_updated': {
      // Progress updates don't change goal status directly.
      // They may trigger completion checks downstream but that's
      // handled by the verifier pipeline (commit 12-13).
      return [{ type: 'noop', reason: 'progress does not change goal status' }];
    }

    case 'task_steps_regenerated': {
      // Replan doesn't change goal status. The task stays active.
      return [{ type: 'noop', reason: 'step regeneration does not change goal status' }];
    }

    default:
      return [{ type: 'noop', reason: 'unknown task event type' }];
  }
}

// ---------------------------------------------------------------------------
// Core reducer: Goal events → Task effects
// ---------------------------------------------------------------------------

/**
 * Reduce a goal event into task-side effects.
 *
 * @param event - The goal event
 * @param tasks - All tasks bound to this goal (via goalBinding.goalId)
 * @returns Array of effects to apply (may be empty)
 */
export function reduceGoalEvent(
  event: GoalEvent,
  tasks: Task[],
): SyncEffect[] {
  // Find tasks bound to this goal
  const boundTasks = tasks.filter((t) => {
    const binding = t.metadata.goalBinding as GoalBinding | undefined;
    return binding?.goalId === event.goalId;
  });

  if (boundTasks.length === 0) {
    return [{ type: 'noop', reason: `no tasks bound to goal ${event.goalId}` }];
  }

  // Terminal statuses that cannot be changed
  const TERMINAL: Set<Task['status']> = new Set(['completed', 'failed']);

  switch (event.type) {
    case 'goal_paused': {
      const effects: SyncEffect[] = [];
      const now = Date.now();
      const reviewAt = now + 5 * 60 * 1000; // 5 minute review window

      for (const task of boundTasks) {
        if (TERMINAL.has(task.status)) continue;
        if (task.status === 'paused') continue; // Already paused

        effects.push({
          type: 'apply_hold',
          taskId: task.id,
          reason: event.reason,
          nextReviewAt: reviewAt,
        });
        effects.push({
          type: 'update_task_status',
          taskId: task.id,
          status: 'paused',
          reason: `goal ${event.goalId} paused: ${event.reason}`,
        });
      }

      return effects.length > 0 ? effects : [{ type: 'noop', reason: 'all tasks already paused or terminal' }];
    }

    case 'goal_resumed': {
      const effects: SyncEffect[] = [];

      for (const task of boundTasks) {
        if (task.status !== 'paused') continue;

        // Check for manual_pause hard wall
        const binding = task.metadata.goalBinding as GoalBinding | undefined;
        if (binding?.hold?.reason === 'manual_pause') {
          // manual_pause cannot be cleared by goal_resumed —
          // it requires explicit manual intervention
          effects.push({
            type: 'noop',
            reason: `task ${task.id} has manual_pause — cannot auto-resume`,
          });
          continue;
        }

        effects.push({ type: 'clear_hold', taskId: task.id });
        effects.push({
          type: 'update_task_status',
          taskId: task.id,
          status: 'pending',
          reason: `goal ${event.goalId} resumed`,
        });
      }

      return effects.length > 0 ? effects : [{ type: 'noop', reason: 'no tasks to resume' }];
    }

    case 'goal_cancelled': {
      const effects: SyncEffect[] = [];

      for (const task of boundTasks) {
        if (TERMINAL.has(task.status)) continue;

        // Clear any hold before failing
        const binding = task.metadata.goalBinding as GoalBinding | undefined;
        if (binding?.hold) {
          effects.push({ type: 'clear_hold', taskId: task.id });
        }

        effects.push({
          type: 'update_task_status',
          taskId: task.id,
          status: 'failed',
          reason: `goal ${event.goalId} cancelled: ${event.reason}`,
        });
      }

      return effects.length > 0 ? effects : [{ type: 'noop', reason: 'all tasks already terminal' }];
    }

    case 'goal_reprioritized': {
      // Goal reprioritization doesn't change task status,
      // but callers may want to propagate priority to tasks.
      // We signal this as a noop since task priority is managed separately.
      return [{
        type: 'noop',
        reason: 'goal reprioritization does not change task status (priority managed separately)',
      }];
    }

    default:
      return [{ type: 'noop', reason: 'unknown goal event type' }];
  }
}

// ---------------------------------------------------------------------------
// Reconciliation: detect drift between Goal and Task
// ---------------------------------------------------------------------------

export interface DriftReport {
  taskId: string;
  goalId: string;
  expectedGoalStatus: GoalStatus;
  actualGoalStatus: GoalStatus;
  taskStatus: Task['status'];
}

/**
 * Detect drift between Task.status and Goal.status.
 * Returns a list of tasks whose bound goal is out of sync.
 *
 * The caller can use this to produce corrective effects.
 * Intended for periodic reconciliation (e.g., every 60s).
 */
export function detectGoalTaskDrift(
  tasks: Task[],
  getGoalStatus: (goalId: string) => GoalStatus | undefined,
): DriftReport[] {
  const drift: DriftReport[] = [];

  for (const task of tasks) {
    const binding = task.metadata.goalBinding as GoalBinding | undefined;
    if (!binding?.goalId) continue;

    const actualGoalStatus = getGoalStatus(binding.goalId);
    if (actualGoalStatus === undefined) continue; // Goal not found — not drift, just orphaned

    const expectedGoalStatus = taskStatusToGoalStatus(task.status);

    if (expectedGoalStatus !== actualGoalStatus) {
      drift.push({
        taskId: task.id,
        goalId: binding.goalId,
        expectedGoalStatus,
        actualGoalStatus,
        taskStatus: task.status,
      });
    }
  }

  return drift;
}

/**
 * Produce corrective effects to resolve drift.
 * Task is canonical — goal status is corrected to match.
 */
export function resolveDrift(driftReports: DriftReport[]): SyncEffect[] {
  return driftReports.map((report) => ({
    type: 'update_goal_status' as const,
    goalId: report.goalId,
    status: report.expectedGoalStatus,
    reason: `drift correction: task ${report.taskId} is ${report.taskStatus}, goal was ${report.actualGoalStatus}`,
  }));
}
