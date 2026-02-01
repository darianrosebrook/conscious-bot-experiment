/**
 * Goal Hold Manager Tests
 *
 * Evidence for commit 8:
 * - requestHold applies hold with correct fields
 * - requestHold rejects terminal tasks
 * - requestHold returns already_held for double-hold
 * - requestClearHold clears non-manual holds
 * - **manual_pause hard wall**: requestClearHold refuses to clear manual_pause
 * - manual_pause can be cleared with forceManual=true
 * - Hold field sync: blockedReason and nextEligibleAt mirror hold
 * - isHoldDueForReview checks nextReviewAt
 * - isManuallyPaused detects manual_pause
 * - extendHoldReview snoozes the review time
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../../types/task';
import type { GoalBinding, GoalHold } from '../goal-binding-types';
import { createGoalBinding } from '../goal-identity';
import { detectIllegalStates } from '../goal-binding-normalize';
import {
  requestHold,
  requestClearHold,
  isHoldDueForReview,
  isManuallyPaused,
  extendHoldReview,
  isKnownHoldReason,
  DEFAULT_REVIEW_INTERVAL_MS,
} from '../goal-hold-manager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGoalTask(
  id: string,
  status: Task['status'] = 'active',
): Task {
  const binding = createGoalBinding({
    goalInstanceId: `inst_${id}`,
    goalType: 'build_shelter',
    provisionalKey: `key_${id}`,
    verifier: 'verify_shelter_v0',
  });

  return {
    id,
    title: 'Test task',
    description: 'test',
    type: 'building',
    priority: 0.5,
    urgency: 0.5,
    progress: 0,
    status,
    source: 'goal',
    steps: [],
    parameters: {},
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: [],
      category: 'building',
      goalBinding: binding,
    },
  };
}

function makePlainTask(id: string): Task {
  return {
    id,
    title: 'Plain task',
    description: 'test',
    type: 'general',
    priority: 0.5,
    urgency: 0.5,
    progress: 0,
    status: 'pending',
    source: 'manual',
    steps: [],
    parameters: {},
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: [],
      category: 'general',
    },
  };
}

// ---------------------------------------------------------------------------
// requestHold
// ---------------------------------------------------------------------------

describe('requestHold', () => {
  it('applies hold with correct fields', () => {
    const task = makeGoalTask('t1', 'active');
    const result = requestHold(task, 'unsafe', {
      resumeHints: ['wait for safety'],
    });

    expect(result.action).toBe('applied');
    if (result.action === 'applied') {
      expect(result.reason).toBe('unsafe');
    }

    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold).toBeDefined();
    expect(binding.hold!.reason).toBe('unsafe');
    expect(binding.hold!.resumeHints).toEqual(['wait for safety']);
    expect(binding.hold!.heldAt).toBeGreaterThan(0);
  });

  it('sets default review interval for non-manual holds', () => {
    const task = makeGoalTask('t1', 'active');
    const before = Date.now();
    requestHold(task, 'preempted');

    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold!.nextReviewAt).toBeGreaterThanOrEqual(
      before + DEFAULT_REVIEW_INTERVAL_MS
    );
  });

  it('manual_pause gets effectively infinite review interval', () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'manual_pause');

    const binding = task.metadata.goalBinding as GoalBinding;
    // nextReviewAt should be very far in the future
    expect(binding.hold!.nextReviewAt).toBeGreaterThan(Date.now() + 1000 * 60 * 60 * 24 * 365);
  });

  it('mirrors hold to task metadata fields', () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'materials_missing');

    expect(task.metadata.blockedReason).toBe('materials_missing');
    expect(task.metadata.nextEligibleAt).toBeDefined();
  });

  it('rejects terminal tasks (completed)', () => {
    const task = makeGoalTask('t1', 'completed');
    const result = requestHold(task, 'unsafe');

    expect(result.action).toBe('rejected');
    if (result.action === 'rejected') {
      expect(result.reason).toContain('terminal');
    }
  });

  it('rejects terminal tasks (failed)', () => {
    const task = makeGoalTask('t1', 'failed');
    const result = requestHold(task, 'unsafe');

    expect(result.action).toBe('rejected');
  });

  it('returns already_held for double-hold', () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'unsafe');
    const result = requestHold(task, 'preempted');

    expect(result.action).toBe('already_held');
    if (result.action === 'already_held') {
      expect(result.existingReason).toBe('unsafe');
    }
  });

  it('returns not_goal_bound for plain tasks', () => {
    const task = makePlainTask('t1');
    const result = requestHold(task, 'unsafe');

    expect(result.action).toBe('not_goal_bound');
  });

  it('accepts holdWitness', () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'preempted', {
      holdWitness: { lastStepId: 'step_3', moduleCursor: 2, verified: true },
    });

    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold!.holdWitness).toEqual({
      lastStepId: 'step_3',
      moduleCursor: 2,
      verified: true,
    });
  });
});

// ---------------------------------------------------------------------------
// requestClearHold
// ---------------------------------------------------------------------------

describe('requestClearHold', () => {
  it('clears non-manual holds', () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'unsafe');

    // Simulate caller setting status to paused
    task.status = 'paused';

    const result = requestClearHold(task);
    expect(result.action).toBe('cleared');
    if (result.action === 'cleared') {
      expect(result.previousReason).toBe('unsafe');
    }

    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold).toBeUndefined();
    expect(task.metadata.blockedReason).toBeUndefined();
    expect(task.metadata.nextEligibleAt).toBeUndefined();
  });

  it('HARD WALL: refuses to clear manual_pause without forceManual', () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'manual_pause');
    task.status = 'paused';

    const result = requestClearHold(task);
    expect(result.action).toBe('blocked_manual_pause');

    // Hold is still in place
    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold).toBeDefined();
    expect(binding.hold!.reason).toBe('manual_pause');
  });

  it('HARD WALL: automated path cannot override manual_pause', () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'manual_pause');
    task.status = 'paused';

    // Simulate activation reactor trying to clear
    const result1 = requestClearHold(task);
    expect(result1.action).toBe('blocked_manual_pause');

    // Simulate goal_resumed trying to clear
    const result2 = requestClearHold(task);
    expect(result2.action).toBe('blocked_manual_pause');

    // Hold remains
    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold!.reason).toBe('manual_pause');
  });

  it('manual_pause can be cleared with forceManual=true', () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'manual_pause');
    task.status = 'paused';

    const result = requestClearHold(task, { forceManual: true });
    expect(result.action).toBe('cleared');
    if (result.action === 'cleared') {
      expect(result.previousReason).toBe('manual_pause');
    }

    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold).toBeUndefined();
  });

  it('returns no_hold when no hold exists', () => {
    const task = makeGoalTask('t1', 'active');
    const result = requestClearHold(task);
    expect(result.action).toBe('no_hold');
  });

  it('returns not_goal_bound for plain tasks', () => {
    const task = makePlainTask('t1');
    const result = requestClearHold(task);
    expect(result.action).toBe('not_goal_bound');
  });
});

// ---------------------------------------------------------------------------
// Hold lifecycle: apply + set paused → clear + resume
// ---------------------------------------------------------------------------

describe('hold lifecycle', () => {
  it('full cycle: apply → paused → clear → pending', () => {
    const task = makeGoalTask('t1', 'active');

    // Apply hold
    const holdResult = requestHold(task, 'preempted');
    expect(holdResult.action).toBe('applied');
    task.status = 'paused';

    // Verify consistency
    expect(detectIllegalStates(task)).toEqual([]);

    // Clear hold
    const clearResult = requestClearHold(task);
    expect(clearResult.action).toBe('cleared');
    task.status = 'pending';

    // Verify fields cleared
    expect(task.metadata.blockedReason).toBeUndefined();
    expect(task.metadata.nextEligibleAt).toBeUndefined();
  });

  it('manual_pause lifecycle: apply → paused → forceManual clear → pending', () => {
    const task = makeGoalTask('t1', 'active');

    // Apply manual pause
    requestHold(task, 'manual_pause');
    task.status = 'paused';
    expect(task.metadata.blockedReason).toBe('manual_pause');

    // Verify consistency (manual_pause requires blockedReason match)
    expect(detectIllegalStates(task)).toEqual([]);

    // Automated clear is blocked
    expect(requestClearHold(task).action).toBe('blocked_manual_pause');

    // Manual clear succeeds
    expect(requestClearHold(task, { forceManual: true }).action).toBe('cleared');
    task.status = 'pending';
    expect(task.metadata.blockedReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isHoldDueForReview
// ---------------------------------------------------------------------------

describe('isHoldDueForReview', () => {
  it('returns true when nextReviewAt has passed', () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'preempted', { nextReviewAt: Date.now() - 1000 });

    expect(isHoldDueForReview(task)).toBe(true);
  });

  it('returns false when nextReviewAt is in the future', () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'preempted', { nextReviewAt: Date.now() + 60_000 });

    expect(isHoldDueForReview(task)).toBe(false);
  });

  it('returns false when no hold exists', () => {
    const task = makeGoalTask('t1', 'active');
    expect(isHoldDueForReview(task)).toBe(false);
  });

  it('manual_pause is effectively never due for review', () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'manual_pause');

    expect(isHoldDueForReview(task)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isManuallyPaused
// ---------------------------------------------------------------------------

describe('isManuallyPaused', () => {
  it('returns true for manual_pause hold', () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'manual_pause');
    expect(isManuallyPaused(task)).toBe(true);
  });

  it('returns false for non-manual holds', () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'unsafe');
    expect(isManuallyPaused(task)).toBe(false);
  });

  it('returns false when no hold', () => {
    const task = makeGoalTask('t1', 'active');
    expect(isManuallyPaused(task)).toBe(false);
  });

  it('returns false for plain tasks', () => {
    const task = makePlainTask('t1');
    expect(isManuallyPaused(task)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extendHoldReview
// ---------------------------------------------------------------------------

describe('extendHoldReview', () => {
  it('extends review time by specified duration', () => {
    const task = makeGoalTask('t1', 'active');
    requestHold(task, 'preempted', { nextReviewAt: Date.now() + 1000 });

    const before = Date.now();
    const result = extendHoldReview(task, 60_000);
    expect(result).toBe(true);

    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.hold!.nextReviewAt).toBeGreaterThanOrEqual(before + 60_000);
  });

  it('returns false when no hold exists', () => {
    const task = makeGoalTask('t1', 'active');
    expect(extendHoldReview(task, 60_000)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isKnownHoldReason
// ---------------------------------------------------------------------------

describe('isKnownHoldReason', () => {
  it('recognizes standard reasons', () => {
    expect(isKnownHoldReason('preempted')).toBe(true);
    expect(isKnownHoldReason('unsafe')).toBe(true);
    expect(isKnownHoldReason('materials_missing')).toBe(true);
    expect(isKnownHoldReason('manual_pause')).toBe(true);
  });

  it('rejects unknown reasons', () => {
    expect(isKnownHoldReason('custom_reason')).toBe(false);
  });
});
