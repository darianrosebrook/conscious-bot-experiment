/**
 * Task Management Handler Tests (Sterling payloads).
 */

import { describe, it, expect } from 'vitest';
import { TaskManagementHandler, type SterlingManagementAction } from '../task-management-handler';
import { TaskStore } from '../task-store';
import type { Task } from '../../types/task';

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: 'test task',
    description: 'a test task',
    type: 'sterling_ir',
    priority: 0.5,
    urgency: 0.5,
    progress: 0,
    status: 'active',
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
      category: 'sterling_ir',
      sterling: {
        committedIrDigest: 'digest_1',
      },
    } as any,
    ...overrides,
  };
}

function makeAction(overrides: Partial<SterlingManagementAction>): SterlingManagementAction {
  return {
    action: 'cancel',
    target: {
      taskId: null,
      committedIrDigest: null,
      query: null,
    },
    amount: null,
    ...overrides,
  };
}

function storeWithTasks(...tasks: Task[]): TaskStore {
  const store = new TaskStore();
  for (const t of tasks) store.setTask(t);
  return store;
}

describe('TaskManagementHandler (Sterling payload)', () => {
  it('cancels task by explicit id', () => {
    const task = makeTask({ id: 'task_abc', status: 'active' });
    const store = storeWithTasks(task);
    const handler = new TaskManagementHandler(store);

    const result = handler.handle(
      makeAction({ action: 'cancel', target: { taskId: 'task_abc', committedIrDigest: null, query: null } }),
      'thought_1'
    );

    expect(result.decision).toBe('applied');
    expect(result.affectedTaskId).toBe('task_abc');
    expect(result.previousStatus).toBe('active');
    expect(result.newStatus).toBe('failed');
    expect(result.sourceThoughtId).toBe('thought_1');
    expect(store.getTask('task_abc')!.status).toBe('failed');
  });

  it('resolves by committed_ir_digest when provided', () => {
    const task = makeTask({ id: 'task_1', status: 'active' });
    const store = storeWithTasks(task);
    const handler = new TaskManagementHandler(store);

    const result = handler.handle(
      makeAction({ action: 'cancel', target: { taskId: null, committedIrDigest: 'digest_1', query: null } })
    );

    expect(result.decision).toBe('applied');
    expect(result.affectedTaskId).toBe('task_1');
  });

  it('returns target_not_found for unknown id', () => {
    const store = storeWithTasks(makeTask({ id: 'task_abc' }));
    const handler = new TaskManagementHandler(store);

    const result = handler.handle(
      makeAction({ action: 'cancel', target: { taskId: 'nonexistent', committedIrDigest: null, query: null } })
    );

    expect(result.decision).toBe('target_not_found');
    expect(result.reason).toContain('nonexistent');
  });

  it('query-only target does not auto-apply (needs_disambiguation)', () => {
    const task = makeTask({ id: 'task_1', title: 'mine iron ore', status: 'active' });
    const store = storeWithTasks(task);
    const handler = new TaskManagementHandler(store);

    const result = handler.handle(
      makeAction({ action: 'cancel', target: { taskId: null, committedIrDigest: null, query: 'mine_iron_ore' } })
    );

    expect(result.decision).toBe('needs_disambiguation');
  });

  it('query-only target never mutates even if multiple tasks match', () => {
    const task1 = makeTask({ id: 'task_1', title: 'mine iron ore', status: 'active' });
    const task2 = makeTask({ id: 'task_2', title: 'mine iron blocks', status: 'pending' });
    const store = storeWithTasks(task1, task2);
    const handler = new TaskManagementHandler(store);

    const result = handler.handle(
      makeAction({ action: 'cancel', target: { taskId: null, committedIrDigest: null, query: 'mine_iron' } })
    );

    expect(result.decision).toBe('needs_disambiguation');
    expect(result.candidates).toBeUndefined();
  });

  it('prioritize clamps to 0..1 when amount provided', () => {
    const task = makeTask({ id: 'task_1', priority: 0.1 });
    const store = storeWithTasks(task);
    const handler = new TaskManagementHandler(store);

    const result = handler.handle(
      makeAction({ action: 'prioritize', amount: 2, target: { taskId: 'task_1', committedIrDigest: null, query: null } })
    );

    expect(result.decision).toBe('applied');
    expect(store.getTask('task_1')!.priority).toBe(1);
  });

  it('rejects invalid transition for completed tasks', () => {
    const task = makeTask({ id: 'task_1', status: 'completed' });
    const store = storeWithTasks(task);
    const handler = new TaskManagementHandler(store);

    const result = handler.handle(
      makeAction({ action: 'pause', target: { taskId: 'task_1', committedIrDigest: null, query: null } })
    );

    expect(result.decision).toBe('invalid_transition');
  });

  it('fails closed on conflicting taskId and committedIrDigest', () => {
    const taskA = makeTask({
      id: 'task_a',
      status: 'active',
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'sterling_ir',
        sterling: { committedIrDigest: 'digest_a' },
      } as any,
    });
    const taskB = makeTask({
      id: 'task_b',
      status: 'active',
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'sterling_ir',
        sterling: { committedIrDigest: 'digest_b' },
      } as any,
    });
    const store = storeWithTasks(taskA, taskB);
    const handler = new TaskManagementHandler(store);

    const result = handler.handle(
      makeAction({
        action: 'cancel',
        target: { taskId: 'task_a', committedIrDigest: 'digest_b', query: null },
      })
    );

    expect(result.decision).toBe('needs_disambiguation');
  });
});
