/**
 * Periodic Review Backstop
 *
 * Passive review function called periodically (e.g., every 60s) to catch:
 * - Stale holds: holds whose nextReviewAt has passed
 * - Goal-task drift: mismatches between Task.status and Goal.status
 * - Orphaned holds: holds on tasks that are no longer goal-bound
 *
 * The review is pure: it produces effects/reports, not mutations.
 * The caller applies the effects.
 *
 * @see docs/internal/goal-binding-protocol.md §F
 */

import type { Task } from '../types/task';
import type { GoalBinding } from './goal-binding-types';
import { isHoldDueForReview, isManuallyPaused } from './goal-hold-manager';
import { detectGoalTaskDrift, resolveDrift, type DriftReport, type SyncEffect } from './goal-task-sync';
import { GoalStatus } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default review interval (60 seconds) */
export const DEFAULT_REVIEW_INTERVAL_MS = 60 * 1000;

/** Max stale holds processed per review cycle */
export const MAX_STALE_HOLDS_PER_CYCLE = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StaleHoldReport {
  taskId: string;
  holdReason: string;
  heldAt: number;
  nextReviewAt: number;
  overdueMs: number;
  isManualPause: boolean;
}

export interface ReviewResult {
  /** Timestamp of the review */
  reviewedAt: number;
  /** Stale holds found */
  staleHolds: StaleHoldReport[];
  /** Goal-task drift detected */
  driftReports: DriftReport[];
  /** Corrective effects to apply */
  effects: SyncEffect[];
  /** Number of tasks scanned */
  tasksScanned: number;
}

// ---------------------------------------------------------------------------
// Review function
// ---------------------------------------------------------------------------

/**
 * Run a periodic review of all goal-bound tasks.
 *
 * @param allTasks - All tasks in the store
 * @param getGoalStatus - Callback to look up Goal.status by goalId
 * @param now - Current time (injectable for testing)
 */
export function runPeriodicReview(
  allTasks: Task[],
  getGoalStatus: (goalId: string) => GoalStatus | undefined,
  now?: number,
): ReviewResult {
  const currentTime = now ?? Date.now();
  const staleHolds: StaleHoldReport[] = [];
  const effects: SyncEffect[] = [];
  let tasksScanned = 0;

  // Phase 1: Find stale holds
  for (const task of allTasks) {
    const binding = task.metadata.goalBinding as GoalBinding | undefined;
    if (!binding) continue;
    tasksScanned++;

    if (binding.hold && isHoldDueForReview(task, currentTime)) {
      const overdueMs = currentTime - binding.hold.nextReviewAt;
      staleHolds.push({
        taskId: task.id,
        holdReason: binding.hold.reason,
        heldAt: binding.hold.heldAt,
        nextReviewAt: binding.hold.nextReviewAt,
        overdueMs,
        isManualPause: isManuallyPaused(task),
      });
    }
  }

  // Cap stale holds processed per cycle
  const processedHolds = staleHolds.slice(0, MAX_STALE_HOLDS_PER_CYCLE);

  // Phase 2: Produce effects for non-manual stale holds
  for (const report of processedHolds) {
    if (report.isManualPause) {
      // manual_pause is never auto-cleared — log it but don't produce effects
      effects.push({
        type: 'noop',
        reason: `task ${report.taskId} has manual_pause — requires explicit user action`,
      });
    } else {
      // Stale automated hold: suggest clearing it so the task can be reconsidered
      effects.push({
        type: 'clear_hold',
        taskId: report.taskId,
      });
      effects.push({
        type: 'update_task_status',
        taskId: report.taskId,
        status: 'pending',
        reason: `stale hold (${report.holdReason}) overdue by ${Math.round(report.overdueMs / 1000)}s`,
      });
    }
  }

  // Phase 3: Detect and resolve goal-task drift
  const driftReports = detectGoalTaskDrift(allTasks, getGoalStatus);
  const driftEffects = resolveDrift(driftReports);
  effects.push(...driftEffects);

  return {
    reviewedAt: currentTime,
    staleHolds,
    driftReports,
    effects,
    tasksScanned,
  };
}
