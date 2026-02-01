/**
 * Completion Checker
 *
 * Orchestrates the completion stability window:
 * - Runs the registered verifier for a goal-bound task
 * - Tracks consecutive passes via GoalBinding.completion.consecutivePasses
 * - Requires STABILITY_THRESHOLD consecutive passes before marking completed
 * - Regression: if a completed task fails verification, re-opens it
 *
 * @see docs/internal/goal-binding-protocol.md §H
 */

import type { Task } from '../types/task';
import type { GoalBinding, GoalCompletionResult } from './goal-binding-types';
import { recordVerificationResult } from './goal-binding-normalize';
import type { VerifierRegistry, VerificationWorldState } from './verifier-registry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of consecutive verification passes required for completion */
export const STABILITY_THRESHOLD = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CompletionCheckOutcome =
  | { action: 'completed'; taskId: string; passes: number }
  | { action: 'progressing'; taskId: string; passes: number; remaining: number }
  | { action: 'failed'; taskId: string; passes: number; blockers: string[] }
  | { action: 'regression'; taskId: string; previousPasses: number; blockers: string[] }
  | { action: 'skipped'; taskId: string; reason: string };

// ---------------------------------------------------------------------------
// Completion checker
// ---------------------------------------------------------------------------

/**
 * Run a completion check on a goal-bound task.
 *
 * @param task - The task to check (must have goalBinding with a verifier)
 * @param registry - Verifier registry to look up the verifier function
 * @param worldState - Optional world state for verifiers that need it
 * @returns The outcome of the check
 */
export function checkCompletion(
  task: Task,
  registry: VerifierRegistry,
  worldState?: VerificationWorldState,
): CompletionCheckOutcome {
  const binding = task.metadata.goalBinding as GoalBinding | undefined;
  if (!binding) {
    return { action: 'skipped', taskId: task.id, reason: 'no goalBinding' };
  }

  const verifierName = binding.completion.verifier;
  if (!verifierName) {
    return { action: 'skipped', taskId: task.id, reason: 'no verifier specified' };
  }

  // Run the verifier
  const result = registry.verify(verifierName, task, worldState);

  // Record the result (updates consecutivePasses)
  const previousPasses = binding.completion.consecutivePasses;
  recordVerificationResult(task, result);

  if (result.done) {
    if (binding.completion.consecutivePasses >= STABILITY_THRESHOLD) {
      return {
        action: 'completed',
        taskId: task.id,
        passes: binding.completion.consecutivePasses,
      };
    }
    return {
      action: 'progressing',
      taskId: task.id,
      passes: binding.completion.consecutivePasses,
      remaining: STABILITY_THRESHOLD - binding.completion.consecutivePasses,
    };
  }

  // Verification failed
  if (task.status === 'completed' && previousPasses >= STABILITY_THRESHOLD) {
    // Regression: task was completed but now fails verification
    return {
      action: 'regression',
      taskId: task.id,
      previousPasses,
      blockers: result.blockers ?? ['verification_failed'],
    };
  }

  return {
    action: 'failed',
    taskId: task.id,
    passes: binding.completion.consecutivePasses,
    blockers: result.blockers ?? ['verification_failed'],
  };
}

/**
 * Apply a completion check outcome to the task.
 * Mutates task.status based on the outcome.
 *
 * @returns true if the task status was changed
 */
export function applyCompletionOutcome(
  task: Task,
  outcome: CompletionCheckOutcome,
): boolean {
  switch (outcome.action) {
    case 'completed': {
      if (task.status !== 'completed') {
        task.status = 'completed';
        task.progress = 1.0;
        task.metadata.completedAt = Date.now();
        task.metadata.actualDuration =
          task.metadata.completedAt - (task.metadata.startedAt || task.metadata.createdAt);
        return true;
      }
      return false;
    }

    case 'regression': {
      if (task.status === 'completed') {
        // Re-open the task
        task.status = 'active';
        task.metadata.completedAt = undefined;
        task.metadata.actualDuration = undefined;
        return true;
      }
      return false;
    }

    case 'progressing':
    case 'failed':
    case 'skipped':
      return false;

    default:
      return false;
  }
}
