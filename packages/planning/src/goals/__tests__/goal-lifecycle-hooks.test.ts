/**
 * Goal Lifecycle Hooks Tests
 *
 * Evidence for commit 14:
 * - onTaskStatusChanged produces sync effects
 * - onTaskStatusChanged triggers completion check on 'completed'
 * - onGoalAction produces task effects
 * - onTaskProgressUpdated triggers completion check at 100%
 * - applySyncEffects applies effects to store
 * - Hooks are composable (produce effects, don't mutate)
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi } from 'vitest';
import type { Task } from '../../types/task';
import type { GoalBinding } from '../goal-binding-types';
import { GoalStatus } from '../../types';
import { createGoalBinding } from '../goal-identity';
import { VerifierRegistry } from '../verifier-registry';
import {
  onTaskStatusChanged,
  onGoalAction,
  onTaskProgressUpdated,
  applySyncEffects,
  type EffectApplierDeps,
} from '../goal-lifecycle-hooks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGoalTask(
  id: string,
  goalId: string,
  status: Task['status'] = 'active',
  progress: number = 0,
): Task {
  const binding = createGoalBinding({
    goalInstanceId: `inst_${id}`,
    goalType: 'build_shelter',
    provisionalKey: `key_${id}`,
    verifier: 'verify_shelter_v0',
    goalId,
  });

  return {
    id,
    title: 'Build shelter',
    description: 'test',
    type: 'building',
    priority: 0.5,
    urgency: 0.5,
    progress,
    status,
    source: 'goal',
    steps: Array.from({ length: 5 }, (_, i) => ({
      id: `step_${i}`,
      label: `Step ${i}`,
      done: progress >= 1.0 ? true : i < Math.floor(progress * 5),
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

function makePassingRegistry(): VerifierRegistry {
  const reg = new VerifierRegistry();
  reg.register('verify_shelter_v0', () => ({ done: true, score: 1.0, evidence: ['all_pass'] }));
  return reg;
}

function makeFailingRegistry(): VerifierRegistry {
  const reg = new VerifierRegistry();
  reg.register('verify_shelter_v0', () => ({
    done: false,
    blockers: ['steps_remaining'],
  }));
  return reg;
}

// ---------------------------------------------------------------------------
// onTaskStatusChanged
// ---------------------------------------------------------------------------

describe('onTaskStatusChanged', () => {
  it('produces sync effects for goal status update', () => {
    const task = makeGoalTask('t1', 'goal_1', 'active');

    const result = onTaskStatusChanged(task, 'pending', 'active');

    expect(result.syncEffects.length).toBeGreaterThan(0);
    const goalEffect = result.syncEffects.find((e) => e.type === 'update_goal_status');
    expect(goalEffect).toBeDefined();
    if (goalEffect?.type === 'update_goal_status') {
      expect(goalEffect.status).toBe(GoalStatus.ACTIVE);
    }
  });

  it('runs completion check when status → completed', () => {
    const task = makeGoalTask('t1', 'goal_1', 'completed', 1.0);
    const registry = makePassingRegistry();

    const result = onTaskStatusChanged(task, 'active', 'completed', {
      verifierRegistry: registry,
    });

    expect(result.completionOutcome).toBeDefined();
    expect(result.completionOutcome!.action).toBe('progressing'); // First pass
  });

  it('does not run completion check for non-completed transitions', () => {
    const task = makeGoalTask('t1', 'goal_1', 'active');
    const registry = makePassingRegistry();

    const result = onTaskStatusChanged(task, 'pending', 'active', {
      verifierRegistry: registry,
    });

    expect(result.completionOutcome).toBeUndefined();
  });

  it('does not run completion check without registry', () => {
    const task = makeGoalTask('t1', 'goal_1', 'completed', 1.0);

    const result = onTaskStatusChanged(task, 'active', 'completed');

    expect(result.completionOutcome).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// onGoalAction
// ---------------------------------------------------------------------------

describe('onGoalAction', () => {
  it('goal_paused produces task hold + pause effects', () => {
    const tasks = [
      makeGoalTask('t1', 'goal_1', 'active'),
      makeGoalTask('t2', 'goal_1', 'pending'),
    ];

    const result = onGoalAction(
      { type: 'goal_paused', goalId: 'goal_1', reason: 'unsafe' },
      tasks,
    );

    const holdEffects = result.syncEffects.filter((e) => e.type === 'apply_hold');
    const statusEffects = result.syncEffects.filter((e) => e.type === 'update_task_status');
    expect(holdEffects.length).toBeGreaterThanOrEqual(1);
    expect(statusEffects.length).toBeGreaterThanOrEqual(1);
  });

  it('goal_resumed produces task clear + resume effects', () => {
    const task = makeGoalTask('t1', 'goal_1', 'paused');
    // Manually add a non-manual hold
    const binding = task.metadata.goalBinding as GoalBinding;
    binding.hold = {
      reason: 'preempted',
      heldAt: Date.now(),
      resumeHints: [],
      nextReviewAt: Date.now() + 300_000,
    };

    const result = onGoalAction(
      { type: 'goal_resumed', goalId: 'goal_1' },
      [task],
    );

    expect(result.syncEffects.some((e) => e.type === 'clear_hold')).toBe(true);
    expect(result.syncEffects.some((e) => e.type === 'update_task_status')).toBe(true);
  });

  it('goal_cancelled produces fail effects', () => {
    const tasks = [makeGoalTask('t1', 'goal_1', 'active')];

    const result = onGoalAction(
      { type: 'goal_cancelled', goalId: 'goal_1', reason: 'user action' },
      tasks,
    );

    const failEffects = result.syncEffects.filter(
      (e) => e.type === 'update_task_status' && e.status === 'failed',
    );
    expect(failEffects).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// onTaskProgressUpdated
// ---------------------------------------------------------------------------

describe('onTaskProgressUpdated', () => {
  it('runs completion check at progress=1.0', () => {
    const task = makeGoalTask('t1', 'goal_1', 'active', 1.0);
    const registry = makePassingRegistry();

    const result = onTaskProgressUpdated(task, 1.0, { verifierRegistry: registry });

    expect(result.completionOutcome).toBeDefined();
  });

  it('does not run completion check below 1.0', () => {
    const task = makeGoalTask('t1', 'goal_1', 'active', 0.5);
    const registry = makePassingRegistry();

    const result = onTaskProgressUpdated(task, 0.5, { verifierRegistry: registry });

    expect(result.completionOutcome).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// applySyncEffects
// ---------------------------------------------------------------------------

describe('applySyncEffects', () => {
  it('applies update_task_status effects', () => {
    const store = new Map<string, Task>();
    const task = makeGoalTask('t1', 'goal_1', 'active');
    store.set('t1', task);

    const deps: EffectApplierDeps = {
      getTask: (id) => store.get(id),
      setTask: (t) => store.set(t.id, t),
    };

    const applied = applySyncEffects(
      [{ type: 'update_task_status', taskId: 't1', status: 'paused', reason: 'test' }],
      deps,
    );

    expect(applied).toBe(1);
    expect(store.get('t1')!.status).toBe('paused');
  });

  it('applies update_goal_status effects', () => {
    const updateGoalStatus = vi.fn();

    const deps: EffectApplierDeps = {
      getTask: () => undefined,
      setTask: () => {},
      updateGoalStatus,
    };

    const applied = applySyncEffects(
      [{ type: 'update_goal_status', goalId: 'g1', status: GoalStatus.ACTIVE, reason: 'test' }],
      deps,
    );

    expect(applied).toBe(1);
    expect(updateGoalStatus).toHaveBeenCalledWith('g1', GoalStatus.ACTIVE, 'test');
  });

  it('counts noops as 0', () => {
    const deps: EffectApplierDeps = {
      getTask: () => undefined,
      setTask: () => {},
    };

    const applied = applySyncEffects(
      [{ type: 'noop', reason: 'test' }],
      deps,
    );

    expect(applied).toBe(0);
  });

  it('handles multiple effects', () => {
    const store = new Map<string, Task>();
    store.set('t1', makeGoalTask('t1', 'g1', 'active'));
    store.set('t2', makeGoalTask('t2', 'g1', 'pending'));

    const deps: EffectApplierDeps = {
      getTask: (id) => store.get(id),
      setTask: (t) => store.set(t.id, t),
    };

    const applied = applySyncEffects(
      [
        { type: 'update_task_status', taskId: 't1', status: 'paused' },
        { type: 'update_task_status', taskId: 't2', status: 'paused' },
        { type: 'noop', reason: 'skip' },
      ],
      deps,
    );

    expect(applied).toBe(2);
    expect(store.get('t1')!.status).toBe('paused');
    expect(store.get('t2')!.status).toBe('paused');
  });
});
