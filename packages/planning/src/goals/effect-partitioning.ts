/**
 * Effect Partitioning Helpers
 *
 * Pure functions that partition SyncEffect arrays into self-targeted
 * (hold/clear_hold for a specific task) vs remaining effects, and
 * apply self-targeted effects to an in-memory task object.
 *
 * Used by TaskIntegration.updateTaskStatus to apply hold state
 * atomically with status changes (before the setTask commit).
 *
 * @see docs/internal/goal-binding-protocol.md §I
 */

import type { Task } from '../types/task';
import type { SyncEffect } from './goal-task-sync';
import { applyHold, clearHold } from './goal-binding-normalize';

// ---------------------------------------------------------------------------
// Partition
// ---------------------------------------------------------------------------

export interface PartitionResult {
  /** Hold/clear_hold effects targeting the specified task */
  self: SyncEffect[];
  /** All other effects (cross-task status, goal updates, noops) */
  remaining: SyncEffect[];
}

/**
 * Partition effects into self-targeted hold/clear_hold vs everything else.
 *
 * "Self-targeted" means: effect type is apply_hold or clear_hold AND
 * effect.taskId matches the given taskId.
 */
export function partitionSelfHoldEffects(
  taskId: string,
  effects: SyncEffect[],
): PartitionResult {
  const self: SyncEffect[] = [];
  const remaining: SyncEffect[] = [];

  for (const e of effects) {
    if (
      (e.type === 'apply_hold' || e.type === 'clear_hold') &&
      e.taskId === taskId
    ) {
      self.push(e);
    } else {
      remaining.push(e);
    }
  }

  return { self, remaining };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * Apply self-targeted hold/clear_hold effects to an in-memory task object.
 *
 * This must be called BEFORE taskStore.setTask(task) so the commit
 * includes both the status change and the hold state atomically.
 *
 * @param task - The in-memory task to mutate (must have goalBinding)
 * @param selfEffects - Effects from partitionSelfHoldEffects().self
 * @param now - Current time (injectable for deterministic testing)
 */
export function applySelfHoldEffects(
  task: Task,
  selfEffects: SyncEffect[],
  now?: number,
): void {
  const timestamp = now ?? Date.now();

  for (const e of selfEffects) {
    if (e.type === 'apply_hold') {
      applyHold(task, {
        reason: e.reason,
        heldAt: timestamp,
        resumeHints: [],
        nextReviewAt: e.nextReviewAt,
      });
    } else if (e.type === 'clear_hold') {
      clearHold(task);
    }
  }
}
