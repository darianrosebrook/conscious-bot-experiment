/**
 * Goal Hold Manager
 *
 * Manages the hold lifecycle for goal-bound tasks, enforcing:
 * - manual_pause as an absolute hard wall (cannot be auto-cleared)
 * - Hold reason validation
 * - Proper hold → task field synchronization
 * - Preemption budget awareness (commit 9 will add budget tracking)
 *
 * This module is the sole authority for applying/clearing holds on
 * goal-bound tasks. Direct mutation of binding.hold is discouraged;
 * callers should use this manager.
 *
 * @see docs/internal/goal-binding-protocol.md §D
 */

import type { Task } from '../types/task';
import type { GoalBinding, GoalHold, GoalHoldReason, HoldWitness } from './goal-binding-types';
import { applyHold, clearHold, syncHoldToTaskFields } from './goal-binding-normalize';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default review interval for automated holds (5 minutes) */
export const DEFAULT_REVIEW_INTERVAL_MS = 5 * 60 * 1000;

/** Review interval for manual pause — 0 means no automatic review */
export const MANUAL_PAUSE_REVIEW_INTERVAL_MS = 0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HoldOutcome =
  | { action: 'applied'; taskId: string; reason: GoalHoldReason }
  | { action: 'already_held'; taskId: string; existingReason: GoalHoldReason }
  | { action: 'rejected'; taskId: string; reason: string }
  | { action: 'not_goal_bound'; taskId: string };

export type ClearOutcome =
  | { action: 'cleared'; taskId: string; previousReason: GoalHoldReason }
  | { action: 'blocked_manual_pause'; taskId: string }
  | { action: 'no_hold'; taskId: string }
  | { action: 'not_goal_bound'; taskId: string };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Well-known hold reasons */
const KNOWN_REASONS: Set<GoalHoldReason> = new Set([
  'preempted',
  'unsafe',
  'materials_missing',
  'manual_pause',
]);

/**
 * Validate a hold reason. Known reasons pass; unknown reasons pass with a
 * warning (the type allows arbitrary strings via `(string & {})`).
 */
export function isKnownHoldReason(reason: GoalHoldReason): boolean {
  return KNOWN_REASONS.has(reason);
}

// ---------------------------------------------------------------------------
// Hold Manager
// ---------------------------------------------------------------------------

/**
 * Apply a hold to a goal-bound task.
 *
 * Rules:
 * - Task must have goalBinding
 * - Task must not be in a terminal state (completed/failed)
 * - If task already has a hold, returns 'already_held'
 * - manual_pause gets a nextReviewAt of 0 (never auto-reviewed)
 * - Other reasons get DEFAULT_REVIEW_INTERVAL_MS
 *
 * Does NOT change task.status — the caller must set status='paused'.
 */
export function requestHold(
  task: Task,
  reason: GoalHoldReason,
  options?: {
    resumeHints?: string[];
    nextReviewAt?: number;
    holdWitness?: HoldWitness;
  },
): HoldOutcome {
  const binding = task.metadata.goalBinding as GoalBinding | undefined;
  if (!binding) {
    return { action: 'not_goal_bound', taskId: task.id };
  }

  // Terminal tasks cannot be held
  if (task.status === 'completed' || task.status === 'failed') {
    return {
      action: 'rejected',
      taskId: task.id,
      reason: `task is in terminal state: ${task.status}`,
    };
  }

  // Already held
  if (binding.hold) {
    return {
      action: 'already_held',
      taskId: task.id,
      existingReason: binding.hold.reason,
    };
  }

  const now = Date.now();
  const nextReviewAt = options?.nextReviewAt ??
    (reason === 'manual_pause'
      ? now + (MANUAL_PAUSE_REVIEW_INTERVAL_MS || Number.MAX_SAFE_INTEGER) // effectively never
      : now + DEFAULT_REVIEW_INTERVAL_MS);

  const hold: GoalHold = {
    reason,
    heldAt: now,
    resumeHints: options?.resumeHints ?? [],
    nextReviewAt,
    holdWitness: options?.holdWitness,
  };

  applyHold(task, hold);

  return { action: 'applied', taskId: task.id, reason };
}

/**
 * Request clearing a hold from a goal-bound task.
 *
 * **Hard wall**: If the hold reason is 'manual_pause', this function
 * REFUSES to clear it unless `forceManual` is true. The manual_pause
 * hard wall cannot be overridden by automated processes (activation
 * reactor, goal_resumed, periodic review).
 *
 * Does NOT change task.status — the caller must set status back.
 *
 * @param forceManual - Set to true ONLY for explicit user/operator action.
 *   Never set this from automated code paths.
 */
export function requestClearHold(
  task: Task,
  options?: { forceManual?: boolean },
): ClearOutcome {
  const binding = task.metadata.goalBinding as GoalBinding | undefined;
  if (!binding) {
    return { action: 'not_goal_bound', taskId: task.id };
  }

  if (!binding.hold) {
    return { action: 'no_hold', taskId: task.id };
  }

  // manual_pause hard wall
  if (binding.hold.reason === 'manual_pause' && !options?.forceManual) {
    return { action: 'blocked_manual_pause', taskId: task.id };
  }

  const previousReason = binding.hold.reason;
  clearHold(task);

  return { action: 'cleared', taskId: task.id, previousReason };
}

/**
 * Check if a task's hold is due for review.
 * Returns true if the hold's nextReviewAt has passed.
 */
export function isHoldDueForReview(task: Task, now?: number): boolean {
  const binding = task.metadata.goalBinding as GoalBinding | undefined;
  if (!binding?.hold) return false;

  const currentTime = now ?? Date.now();
  return currentTime >= binding.hold.nextReviewAt;
}

/**
 * Check if a task has a manual_pause hold.
 */
export function isManuallyPaused(task: Task): boolean {
  const binding = task.metadata.goalBinding as GoalBinding | undefined;
  return binding?.hold?.reason === 'manual_pause';
}

/**
 * Extend a hold's review time (snooze).
 * Does not change the hold reason or other fields.
 */
export function extendHoldReview(
  task: Task,
  additionalMs: number,
): boolean {
  const binding = task.metadata.goalBinding as GoalBinding | undefined;
  if (!binding?.hold) return false;

  binding.hold.nextReviewAt = Date.now() + additionalMs;
  syncHoldToTaskFields(task);
  return true;
}
