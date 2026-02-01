/**
 * Goal Binding Normalization
 *
 * Canonical mapping between GoalBinding fields and existing Task fields.
 * Ensures no contradictory state between goalBinding.hold and
 * task.metadata.blockedReason / nextEligibleAt.
 *
 * Field ownership:
 * - goalBinding.hold.reason → metadata.blockedReason (mirrored on hold)
 * - goalBinding.hold.nextReviewAt → metadata.nextEligibleAt (mirrored on hold)
 * - On resume: both cleared
 * - manual_pause never maps to blockedReason (it's purely a pause state via status)
 *
 * @see docs/internal/goal-binding-protocol.md §G
 */

import type { Task } from '../types/task';
import type { GoalBinding, GoalHold } from './goal-binding-types';

// ---------------------------------------------------------------------------
// Illegal state detection
// ---------------------------------------------------------------------------

export interface StateViolation {
  rule: string;
  description: string;
}

/**
 * Returns all illegal state combinations found on a goal-bound task.
 * An empty array means the task is consistent.
 */
export function detectIllegalStates(task: Task): StateViolation[] {
  const violations: StateViolation[] = [];
  const binding = task.metadata.goalBinding as GoalBinding | undefined;

  if (!binding) return violations; // non-goal tasks are unchecked

  // Rule 1: paused without hold metadata
  if (task.status === 'paused' && !binding.hold) {
    violations.push({
      rule: 'paused_without_hold',
      description: 'Task status is paused but goalBinding.hold is undefined',
    });
  }

  // Rule 2: active/pending with hold set
  if (
    binding.hold &&
    task.status !== 'paused' &&
    task.status !== 'completed' &&
    task.status !== 'failed'
  ) {
    violations.push({
      rule: 'non_paused_with_hold',
      description: `Task status is ${task.status} but goalBinding.hold is set`,
    });
  }

  // Rule 3: manual_pause mismatch
  if (binding.hold?.reason === 'manual_pause' && task.metadata.blockedReason !== 'manual_pause') {
    violations.push({
      rule: 'manual_pause_mismatch',
      description:
        'goalBinding.hold.reason is manual_pause but metadata.blockedReason does not match',
    });
  }

  // Rule 4: completion threshold met but not completed
  if (binding.completion.consecutivePasses >= 2 && task.status !== 'completed') {
    violations.push({
      rule: 'done_but_not_completed',
      description: `consecutivePasses is ${binding.completion.consecutivePasses} but task status is ${task.status}`,
    });
  }

  // Rule 5: goalKey transitioned but no alias recorded
  // This checks: if goalKeyAliases is empty, goalKey should be the original (no transition happened).
  // If a transition happened, there must be at least one alias.
  // We can't detect "transition happened" without external state, but we can detect the inverse:
  // anchors.siteSignature exists (anchored) but goalKeyAliases is empty → transition wasn't recorded.
  if (binding.anchors.siteSignature && binding.goalKeyAliases.length === 0) {
    violations.push({
      rule: 'anchored_without_alias',
      description:
        'goalBinding.anchors.siteSignature is set (Phase B) but goalKeyAliases is empty — Phase A→B transition was not recorded',
    });
  }

  return violations;
}

/**
 * Asserts no illegal state combinations. Throws on violation.
 * Use in tests and at critical write boundaries.
 */
export function assertConsistentGoalState(task: Task): void {
  const violations = detectIllegalStates(task);
  if (violations.length > 0) {
    const messages = violations.map((v) => `  [${v.rule}] ${v.description}`).join('\n');
    throw new Error(`Goal binding state violations on task ${task.id}:\n${messages}`);
  }
}

// ---------------------------------------------------------------------------
// Normalization: hold → task fields
// ---------------------------------------------------------------------------

/**
 * Synchronize task metadata fields from goalBinding.hold.
 * Call after setting or clearing hold to keep fields consistent.
 * Returns true if any fields were changed.
 */
export function syncHoldToTaskFields(task: Task): boolean {
  const binding = task.metadata.goalBinding as GoalBinding | undefined;
  if (!binding) return false;

  let changed = false;

  if (binding.hold) {
    // manual_pause maps blockedReason = 'manual_pause'
    // other reasons also mirror to blockedReason
    const expectedBlockedReason = binding.hold.reason;
    if (task.metadata.blockedReason !== expectedBlockedReason) {
      task.metadata.blockedReason = expectedBlockedReason;
      changed = true;
    }

    const expectedNextEligible = binding.hold.nextReviewAt;
    if (task.metadata.nextEligibleAt !== expectedNextEligible) {
      task.metadata.nextEligibleAt = expectedNextEligible;
      changed = true;
    }
  } else {
    // No hold — clear mirrored fields
    if (task.metadata.blockedReason !== undefined) {
      task.metadata.blockedReason = undefined;
      changed = true;
    }
    if (task.metadata.nextEligibleAt !== undefined) {
      task.metadata.nextEligibleAt = undefined;
      changed = true;
    }
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Hold lifecycle helpers
// ---------------------------------------------------------------------------

/**
 * Apply a hold to a goal-bound task. Sets hold metadata and mirrors to task fields.
 * Does NOT change task.status — caller is responsible for transitioning to 'paused'.
 */
export function applyHold(task: Task, hold: GoalHold): void {
  const binding = task.metadata.goalBinding as GoalBinding | undefined;
  if (!binding) {
    throw new Error(`Cannot apply hold to task ${task.id}: no goalBinding`);
  }
  binding.hold = hold;
  syncHoldToTaskFields(task);
}

/**
 * Clear a hold from a goal-bound task. Removes hold metadata and clears mirrored fields.
 * Does NOT change task.status — caller is responsible for transitioning from 'paused'.
 */
export function clearHold(task: Task): void {
  const binding = task.metadata.goalBinding as GoalBinding | undefined;
  if (!binding) return;
  binding.hold = undefined;
  syncHoldToTaskFields(task);
}

/**
 * Clone a GoalHold for rollback safety — isolates from future mutations.
 * Shallow clone is sufficient: all fields are primitives except resumeHints
 * (string[]) and holdWitness (flat object), both of which are copied.
 *
 * If GoalHold gains nested structure, deepen the clone here (single edit).
 */
export function cloneHold(hold: GoalHold | undefined): GoalHold | undefined {
  if (!hold) return undefined;
  return {
    ...hold,
    resumeHints: [...hold.resumeHints],
    holdWitness: hold.holdWitness ? { ...hold.holdWitness } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Completion helpers
// ---------------------------------------------------------------------------

/**
 * Record a verification result. Increments consecutivePasses on success, resets on failure.
 */
export function recordVerificationResult(
  task: Task,
  result: { done: boolean; score?: number; blockers?: string[]; evidence?: string[] },
): void {
  const binding = task.metadata.goalBinding as GoalBinding | undefined;
  if (!binding) return;

  binding.completion.lastVerifiedAt = Date.now();
  binding.completion.lastResult = result;

  if (result.done) {
    binding.completion.consecutivePasses++;
  } else {
    binding.completion.consecutivePasses = 0;
  }
}
