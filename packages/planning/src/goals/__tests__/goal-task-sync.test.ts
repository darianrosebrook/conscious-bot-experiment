/**
 * Goal ↔ Task Synchronization Reducer Tests
 *
 * Evidence for commit 7:
 * - Task status → Goal status mapping is deterministic
 * - Task events produce correct goal effects (or noop)
 * - Goal events produce correct task effects (hold, pause, resume, cancel)
 * - manual_pause hard wall: goal_resumed cannot clear manual_pause
 * - Terminal tasks are not affected by goal events
 * - Drift detection finds mismatches
 * - Drift resolution produces corrective effects
 * - Reducer is pure: no side effects
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { GoalStatus } from '../../types';
import type { Task } from '../../types/task';
import type { GoalBinding, GoalHold } from '../goal-binding-types';
import { createGoalBinding } from '../goal-identity';
import {
  taskStatusToGoalStatus,
  reduceTaskEvent,
  reduceGoalEvent,
  detectGoalTaskDrift,
  resolveDrift,
  type TaskEvent,
  type GoalEvent,
  type SyncEffect,
} from '../goal-task-sync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: 'Test task',
    description: 'test',
    type: 'building',
    priority: 0.5,
    urgency: 0.5,
    progress: 0,
    status: 'pending',
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
    },
    ...overrides,
  };
}

function makeGoalBoundTask(
  id: string,
  goalId: string,
  status: Task['status'] = 'pending',
  holdReason?: string,
): Task {
  const binding = createGoalBinding({
    goalInstanceId: `inst_${id}`,
    goalType: 'build_shelter',
    provisionalKey: `key_${id}`,
    verifier: 'verify_shelter_v0',
    goalId,
  });

  if (holdReason) {
    binding.hold = {
      reason: holdReason,
      heldAt: Date.now(),
      resumeHints: [],
      nextReviewAt: Date.now() + 300_000,
    };
  }

  return makeTask({
    id,
    status,
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
  });
}

// ---------------------------------------------------------------------------
// taskStatusToGoalStatus
// ---------------------------------------------------------------------------

describe('taskStatusToGoalStatus', () => {
  it('maps pending → PENDING', () => {
    expect(taskStatusToGoalStatus('pending')).toBe(GoalStatus.PENDING);
  });

  it('maps pending_planning → PENDING', () => {
    expect(taskStatusToGoalStatus('pending_planning')).toBe(GoalStatus.PENDING);
  });

  it('maps active → ACTIVE', () => {
    expect(taskStatusToGoalStatus('active')).toBe(GoalStatus.ACTIVE);
  });

  it('maps completed → COMPLETED', () => {
    expect(taskStatusToGoalStatus('completed')).toBe(GoalStatus.COMPLETED);
  });

  it('maps failed → FAILED', () => {
    expect(taskStatusToGoalStatus('failed')).toBe(GoalStatus.FAILED);
  });

  it('maps unplannable → FAILED', () => {
    expect(taskStatusToGoalStatus('unplannable')).toBe(GoalStatus.FAILED);
  });

  it('maps paused → SUSPENDED', () => {
    expect(taskStatusToGoalStatus('paused')).toBe(GoalStatus.SUSPENDED);
  });
});

// ---------------------------------------------------------------------------
// reduceTaskEvent — task_status_changed
// ---------------------------------------------------------------------------

describe('reduceTaskEvent — task_status_changed', () => {
  it('produces goal status update when goalId exists', () => {
    const task = makeGoalBoundTask('t1', 'goal_1', 'active');
    const event: TaskEvent = {
      type: 'task_status_changed',
      taskId: 't1',
      oldStatus: 'pending',
      newStatus: 'active',
    };

    const effects = reduceTaskEvent(event, task);
    expect(effects).toHaveLength(1);
    expect(effects[0]).toEqual({
      type: 'update_goal_status',
      goalId: 'goal_1',
      status: GoalStatus.ACTIVE,
      reason: 'task t1 transitioned to active',
    });
  });

  it('produces noop when task has no goalBinding', () => {
    const task = makeTask({ id: 't1' });
    const event: TaskEvent = {
      type: 'task_status_changed',
      taskId: 't1',
      oldStatus: 'pending',
      newStatus: 'active',
    };

    const effects = reduceTaskEvent(event, task);
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('noop');
  });

  it('produces noop when goalBinding has no goalId', () => {
    const task = makeGoalBoundTask('t1', '', 'active');
    // Remove goalId
    const binding = task.metadata.goalBinding as GoalBinding;
    binding.goalId = undefined;

    const event: TaskEvent = {
      type: 'task_status_changed',
      taskId: 't1',
      oldStatus: 'pending',
      newStatus: 'active',
    };

    const effects = reduceTaskEvent(event, task);
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('noop');
  });

  it('maps task completion to COMPLETED goal status', () => {
    const task = makeGoalBoundTask('t1', 'goal_1', 'completed');
    const event: TaskEvent = {
      type: 'task_status_changed',
      taskId: 't1',
      oldStatus: 'active',
      newStatus: 'completed',
    };

    const effects = reduceTaskEvent(event, task);
    expect(effects[0]).toMatchObject({
      type: 'update_goal_status',
      goalId: 'goal_1',
      status: GoalStatus.COMPLETED,
    });
  });

  it('maps task failure to FAILED goal status', () => {
    const task = makeGoalBoundTask('t1', 'goal_1', 'failed');
    const event: TaskEvent = {
      type: 'task_status_changed',
      taskId: 't1',
      oldStatus: 'active',
      newStatus: 'failed',
    };

    const effects = reduceTaskEvent(event, task);
    expect(effects[0]).toMatchObject({
      type: 'update_goal_status',
      goalId: 'goal_1',
      status: GoalStatus.FAILED,
    });
  });

  it('maps task paused to SUSPENDED goal status', () => {
    const task = makeGoalBoundTask('t1', 'goal_1', 'paused');
    const event: TaskEvent = {
      type: 'task_status_changed',
      taskId: 't1',
      oldStatus: 'active',
      newStatus: 'paused',
    };

    const effects = reduceTaskEvent(event, task);
    expect(effects[0]).toMatchObject({
      type: 'update_goal_status',
      goalId: 'goal_1',
      status: GoalStatus.SUSPENDED,
    });
  });
});

// ---------------------------------------------------------------------------
// reduceTaskEvent — progress and replan
// ---------------------------------------------------------------------------

describe('reduceTaskEvent — progress and replan', () => {
  it('progress update produces noop', () => {
    const task = makeGoalBoundTask('t1', 'goal_1', 'active');
    const effects = reduceTaskEvent(
      { type: 'task_progress_updated', taskId: 't1', progress: 0.5 },
      task,
    );
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('noop');
  });

  it('steps regenerated produces noop', () => {
    const task = makeGoalBoundTask('t1', 'goal_1', 'active');
    const effects = reduceTaskEvent(
      { type: 'task_steps_regenerated', taskId: 't1' },
      task,
    );
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('noop');
  });
});

// ---------------------------------------------------------------------------
// reduceGoalEvent — goal_paused
// ---------------------------------------------------------------------------

describe('reduceGoalEvent — goal_paused', () => {
  it('pauses all non-terminal bound tasks', () => {
    const tasks = [
      makeGoalBoundTask('t1', 'goal_1', 'pending'),
      makeGoalBoundTask('t2', 'goal_1', 'active'),
    ];

    const effects = reduceGoalEvent(
      { type: 'goal_paused', goalId: 'goal_1', reason: 'unsafe' },
      tasks,
    );

    // Each task should get apply_hold + update_task_status
    const holdEffects = effects.filter((e) => e.type === 'apply_hold');
    const statusEffects = effects.filter((e) => e.type === 'update_task_status');
    expect(holdEffects).toHaveLength(2);
    expect(statusEffects).toHaveLength(2);

    for (const e of statusEffects) {
      if (e.type === 'update_task_status') {
        expect(e.status).toBe('paused');
      }
    }
  });

  it('skips already paused tasks', () => {
    const tasks = [
      makeGoalBoundTask('t1', 'goal_1', 'paused'),
    ];

    const effects = reduceGoalEvent(
      { type: 'goal_paused', goalId: 'goal_1', reason: 'unsafe' },
      tasks,
    );

    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('noop');
  });

  it('skips terminal tasks (completed/failed)', () => {
    const tasks = [
      makeGoalBoundTask('t1', 'goal_1', 'completed'),
      makeGoalBoundTask('t2', 'goal_1', 'failed'),
    ];

    const effects = reduceGoalEvent(
      { type: 'goal_paused', goalId: 'goal_1', reason: 'unsafe' },
      tasks,
    );

    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('noop');
  });

  it('returns noop for unbound tasks', () => {
    const tasks = [makeTask({ id: 't1' })]; // No goalBinding

    const effects = reduceGoalEvent(
      { type: 'goal_paused', goalId: 'goal_1', reason: 'unsafe' },
      tasks,
    );

    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('noop');
  });
});

// ---------------------------------------------------------------------------
// reduceGoalEvent — goal_resumed
// ---------------------------------------------------------------------------

describe('reduceGoalEvent — goal_resumed', () => {
  it('resumes paused tasks', () => {
    const tasks = [
      makeGoalBoundTask('t1', 'goal_1', 'paused', 'unsafe'),
    ];

    const effects = reduceGoalEvent(
      { type: 'goal_resumed', goalId: 'goal_1' },
      tasks,
    );

    const clearEffects = effects.filter((e) => e.type === 'clear_hold');
    const statusEffects = effects.filter((e) => e.type === 'update_task_status');
    expect(clearEffects).toHaveLength(1);
    expect(statusEffects).toHaveLength(1);
    if (statusEffects[0].type === 'update_task_status') {
      expect(statusEffects[0].status).toBe('pending');
    }
  });

  it('manual_pause hard wall: cannot auto-resume', () => {
    const tasks = [
      makeGoalBoundTask('t1', 'goal_1', 'paused', 'manual_pause'),
    ];

    const effects = reduceGoalEvent(
      { type: 'goal_resumed', goalId: 'goal_1' },
      tasks,
    );

    // Should produce noop explaining manual_pause cannot be auto-cleared
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('noop');
    if (effects[0].type === 'noop') {
      expect(effects[0].reason).toContain('manual_pause');
    }
  });

  it('skips non-paused tasks', () => {
    const tasks = [
      makeGoalBoundTask('t1', 'goal_1', 'active'),
    ];

    const effects = reduceGoalEvent(
      { type: 'goal_resumed', goalId: 'goal_1' },
      tasks,
    );

    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('noop');
  });
});

// ---------------------------------------------------------------------------
// reduceGoalEvent — goal_cancelled
// ---------------------------------------------------------------------------

describe('reduceGoalEvent — goal_cancelled', () => {
  it('fails all non-terminal bound tasks', () => {
    const tasks = [
      makeGoalBoundTask('t1', 'goal_1', 'pending'),
      makeGoalBoundTask('t2', 'goal_1', 'active'),
      makeGoalBoundTask('t3', 'goal_1', 'paused', 'unsafe'),
    ];

    const effects = reduceGoalEvent(
      { type: 'goal_cancelled', goalId: 'goal_1', reason: 'user cancelled' },
      tasks,
    );

    const statusEffects = effects.filter((e) => e.type === 'update_task_status');
    expect(statusEffects).toHaveLength(3);
    for (const e of statusEffects) {
      if (e.type === 'update_task_status') {
        expect(e.status).toBe('failed');
      }
    }
  });

  it('clears hold on paused tasks before failing', () => {
    const tasks = [
      makeGoalBoundTask('t1', 'goal_1', 'paused', 'unsafe'),
    ];

    const effects = reduceGoalEvent(
      { type: 'goal_cancelled', goalId: 'goal_1', reason: 'user cancelled' },
      tasks,
    );

    // Should have clear_hold before update_task_status
    const clearIdx = effects.findIndex((e) => e.type === 'clear_hold');
    const statusIdx = effects.findIndex((e) => e.type === 'update_task_status');
    expect(clearIdx).toBeGreaterThanOrEqual(0);
    expect(statusIdx).toBeGreaterThanOrEqual(0);
    expect(clearIdx).toBeLessThan(statusIdx);
  });

  it('skips already-terminal tasks', () => {
    const tasks = [
      makeGoalBoundTask('t1', 'goal_1', 'completed'),
      makeGoalBoundTask('t2', 'goal_1', 'failed'),
    ];

    const effects = reduceGoalEvent(
      { type: 'goal_cancelled', goalId: 'goal_1', reason: 'user cancelled' },
      tasks,
    );

    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('noop');
  });
});

// ---------------------------------------------------------------------------
// reduceGoalEvent — goal_reprioritized
// ---------------------------------------------------------------------------

describe('reduceGoalEvent — goal_reprioritized', () => {
  it('produces noop (priority managed separately)', () => {
    const tasks = [makeGoalBoundTask('t1', 'goal_1', 'active')];

    const effects = reduceGoalEvent(
      { type: 'goal_reprioritized', goalId: 'goal_1', priority: 0.9, urgency: 0.8 },
      tasks,
    );

    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('noop');
  });
});

// ---------------------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------------------

describe('detectGoalTaskDrift', () => {
  it('detects task active but goal PENDING', () => {
    const tasks = [makeGoalBoundTask('t1', 'goal_1', 'active')];

    const drift = detectGoalTaskDrift(tasks, (goalId) => {
      if (goalId === 'goal_1') return GoalStatus.PENDING;
      return undefined;
    });

    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({
      taskId: 't1',
      goalId: 'goal_1',
      expectedGoalStatus: GoalStatus.ACTIVE,
      actualGoalStatus: GoalStatus.PENDING,
      taskStatus: 'active',
    });
  });

  it('no drift when statuses match', () => {
    const tasks = [makeGoalBoundTask('t1', 'goal_1', 'active')];

    const drift = detectGoalTaskDrift(tasks, (goalId) => {
      if (goalId === 'goal_1') return GoalStatus.ACTIVE;
      return undefined;
    });

    expect(drift).toHaveLength(0);
  });

  it('skips tasks without goalBinding', () => {
    const tasks = [makeTask({ id: 't1', status: 'active' })];

    const drift = detectGoalTaskDrift(tasks, () => GoalStatus.PENDING);
    expect(drift).toHaveLength(0);
  });

  it('skips tasks whose goal is not found', () => {
    const tasks = [makeGoalBoundTask('t1', 'goal_missing', 'active')];

    const drift = detectGoalTaskDrift(tasks, () => undefined);
    expect(drift).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Drift resolution
// ---------------------------------------------------------------------------

describe('resolveDrift', () => {
  it('produces corrective goal status updates', () => {
    const driftReports = [
      {
        taskId: 't1',
        goalId: 'goal_1',
        expectedGoalStatus: GoalStatus.ACTIVE,
        actualGoalStatus: GoalStatus.PENDING,
        taskStatus: 'active' as const,
      },
    ];

    const effects = resolveDrift(driftReports);
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      type: 'update_goal_status',
      goalId: 'goal_1',
      status: GoalStatus.ACTIVE,
    });
  });

  it('produces one effect per drift report', () => {
    const driftReports = [
      {
        taskId: 't1',
        goalId: 'goal_1',
        expectedGoalStatus: GoalStatus.ACTIVE,
        actualGoalStatus: GoalStatus.PENDING,
        taskStatus: 'active' as const,
      },
      {
        taskId: 't2',
        goalId: 'goal_2',
        expectedGoalStatus: GoalStatus.COMPLETED,
        actualGoalStatus: GoalStatus.ACTIVE,
        taskStatus: 'completed' as const,
      },
    ];

    const effects = resolveDrift(driftReports);
    expect(effects).toHaveLength(2);
  });

  it('empty drift → empty effects', () => {
    expect(resolveDrift([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Reducer purity
// ---------------------------------------------------------------------------

describe('reducer purity', () => {
  it('reduceTaskEvent does not mutate the task', () => {
    const task = makeGoalBoundTask('t1', 'goal_1', 'active');
    const snapshot = JSON.stringify(task);

    reduceTaskEvent(
      { type: 'task_status_changed', taskId: 't1', oldStatus: 'pending', newStatus: 'active' },
      task,
    );

    expect(JSON.stringify(task)).toBe(snapshot);
  });

  it('reduceGoalEvent does not mutate any task', () => {
    const tasks = [
      makeGoalBoundTask('t1', 'goal_1', 'pending'),
      makeGoalBoundTask('t2', 'goal_1', 'active'),
    ];
    const snapshot = JSON.stringify(tasks);

    reduceGoalEvent(
      { type: 'goal_paused', goalId: 'goal_1', reason: 'unsafe' },
      tasks,
    );

    expect(JSON.stringify(tasks)).toBe(snapshot);
  });
});
