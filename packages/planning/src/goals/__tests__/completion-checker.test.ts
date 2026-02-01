/**
 * Completion Checker Tests
 *
 * Evidence for commit 13:
 * - Stability window: 2 consecutive passes required
 * - First pass → 'progressing', not 'completed'
 * - Second pass → 'completed'
 * - Failed verification resets consecutivePasses
 * - Regression: completed task fails → re-opened
 * - No goalBinding → 'skipped'
 * - No verifier → 'skipped'
 * - applyCompletionOutcome mutates task status correctly
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../../types/task';
import type { GoalBinding } from '../goal-binding-types';
import { createGoalBinding } from '../goal-identity';
import {
  VerifierRegistry,
  type VerifierFn,
} from '../verifier-registry';
import {
  checkCompletion,
  applyCompletionOutcome,
  STABILITY_THRESHOLD,
} from '../completion-checker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeShelterTask(opts?: {
  progress?: number;
  status?: Task['status'];
  stepsComplete?: boolean;
  previousPasses?: number;
}): Task {
  const binding = createGoalBinding({
    goalInstanceId: 'inst_cc',
    goalType: 'build_shelter',
    provisionalKey: 'key_cc',
    verifier: 'verify_shelter_v0',
  });

  if (opts?.previousPasses) {
    binding.completion.consecutivePasses = opts.previousPasses;
  }

  const totalSteps = 5;
  const doneCount = opts?.stepsComplete ? totalSteps : 0;

  return {
    id: 'task_cc',
    title: 'Build shelter',
    description: 'test',
    type: 'building',
    priority: 0.5,
    urgency: 0.5,
    progress: opts?.progress ?? 0,
    status: opts?.status ?? 'active',
    source: 'goal',
    steps: Array.from({ length: totalSteps }, (_, i) => ({
      id: `step_${i}`,
      label: `Step ${i}`,
      done: i < doneCount,
      order: i,
      meta: {},
    })),
    parameters: {},
    metadata: {
      createdAt: Date.now() - 10000,
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

function makeRegistry(verifierResult: { done: boolean; blockers?: string[] }): VerifierRegistry {
  const registry = new VerifierRegistry();
  registry.register('verify_shelter_v0', () => verifierResult);
  return registry;
}

function makePlainTask(): Task {
  return {
    id: 'task_plain',
    title: 'Plain',
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
// Stability window
// ---------------------------------------------------------------------------

describe('checkCompletion — stability window', () => {
  it('first pass → progressing (not completed)', () => {
    const task = makeShelterTask({ progress: 1.0, stepsComplete: true });
    const registry = makeRegistry({ done: true });

    const outcome = checkCompletion(task, registry);

    expect(outcome.action).toBe('progressing');
    if (outcome.action === 'progressing') {
      expect(outcome.passes).toBe(1);
      expect(outcome.remaining).toBe(STABILITY_THRESHOLD - 1);
    }
  });

  it('second pass → completed', () => {
    const task = makeShelterTask({
      progress: 1.0,
      stepsComplete: true,
      previousPasses: 1, // Already passed once
    });
    const registry = makeRegistry({ done: true });

    const outcome = checkCompletion(task, registry);

    expect(outcome.action).toBe('completed');
    if (outcome.action === 'completed') {
      expect(outcome.passes).toBe(2);
    }
  });

  it('failure resets consecutive passes', () => {
    const task = makeShelterTask({
      progress: 0.5,
      previousPasses: 1, // Had one pass
    });
    const registry = makeRegistry({ done: false, blockers: ['steps_remaining'] });

    const outcome = checkCompletion(task, registry);

    expect(outcome.action).toBe('failed');
    if (outcome.action === 'failed') {
      expect(outcome.passes).toBe(0); // Reset
    }

    // Verify binding was actually reset
    const binding = task.metadata.goalBinding as GoalBinding;
    expect(binding.completion.consecutivePasses).toBe(0);
  });

  it('STABILITY_THRESHOLD is 2', () => {
    expect(STABILITY_THRESHOLD).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Regression re-open
// ---------------------------------------------------------------------------

describe('checkCompletion — regression', () => {
  it('completed task failing verification → regression', () => {
    const task = makeShelterTask({
      progress: 1.0,
      stepsComplete: true,
      status: 'completed',
      previousPasses: 2,
    });
    const registry = makeRegistry({ done: false, blockers: ['world_shelter_not_found'] });

    const outcome = checkCompletion(task, registry);

    expect(outcome.action).toBe('regression');
    if (outcome.action === 'regression') {
      expect(outcome.previousPasses).toBe(2);
      expect(outcome.blockers).toContain('world_shelter_not_found');
    }
  });

  it('applyCompletionOutcome re-opens regressed task', () => {
    const task = makeShelterTask({
      status: 'completed',
      previousPasses: 2,
    });
    task.metadata.completedAt = Date.now();

    const changed = applyCompletionOutcome(task, {
      action: 'regression',
      taskId: task.id,
      previousPasses: 2,
      blockers: ['world_shelter_not_found'],
    });

    expect(changed).toBe(true);
    expect(task.status).toBe('active');
    expect(task.metadata.completedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// applyCompletionOutcome
// ---------------------------------------------------------------------------

describe('applyCompletionOutcome', () => {
  it('marks task completed on completed outcome', () => {
    const task = makeShelterTask({ status: 'active' });

    const changed = applyCompletionOutcome(task, {
      action: 'completed',
      taskId: task.id,
      passes: 2,
    });

    expect(changed).toBe(true);
    expect(task.status).toBe('completed');
    expect(task.progress).toBe(1.0);
    expect(task.metadata.completedAt).toBeDefined();
    expect(task.metadata.actualDuration).toBeDefined();
  });

  it('no-op for progressing/failed/skipped', () => {
    const task = makeShelterTask({ status: 'active' });

    expect(applyCompletionOutcome(task, {
      action: 'progressing', taskId: task.id, passes: 1, remaining: 1,
    })).toBe(false);

    expect(applyCompletionOutcome(task, {
      action: 'failed', taskId: task.id, passes: 0, blockers: [],
    })).toBe(false);

    expect(applyCompletionOutcome(task, {
      action: 'skipped', taskId: task.id, reason: 'test',
    })).toBe(false);

    expect(task.status).toBe('active');
  });

  it('no-op if already completed', () => {
    const task = makeShelterTask({ status: 'completed' });
    task.metadata.completedAt = 12345;

    const changed = applyCompletionOutcome(task, {
      action: 'completed', taskId: task.id, passes: 2,
    });

    expect(changed).toBe(false);
    expect(task.metadata.completedAt).toBe(12345); // Unchanged
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('checkCompletion — edge cases', () => {
  it('no goalBinding → skipped', () => {
    const task = makePlainTask();
    const registry = makeRegistry({ done: true });

    const outcome = checkCompletion(task, registry);
    expect(outcome.action).toBe('skipped');
  });

  it('no verifier registered → failed with blockers', () => {
    const task = makeShelterTask();
    const registry = new VerifierRegistry(); // Empty — no verifiers

    const outcome = checkCompletion(task, registry);
    expect(outcome.action).toBe('failed');
    if (outcome.action === 'failed') {
      expect(outcome.blockers.some((b) => b.includes('not registered'))).toBe(true);
    }
  });
});
