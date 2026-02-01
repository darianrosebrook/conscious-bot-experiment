/**
 * Task Management Handler Tests
 *
 * Covers:
 * - ID-based target resolution (authoritative)
 * - Slug-based target resolution (assistive, single-candidate only)
 * - Ambiguous target → needs_disambiguation (no mutation)
 * - Explicit transition model (pause, resume, cancel, prioritize)
 * - Immutable statuses (completed, failed) → invalid_transition
 * - Prioritize guards (clamped 0..1, default +0.2 boost)
 * - Provenance tracking (sourceThoughtId)
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { TaskManagementHandler } from '../task-management-handler';
import { TaskStore } from '../task-store';
import type { Task } from '../../types/task';
import type { GoalTagV1 } from '@conscious-bot/cognition';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: 'test task',
    description: 'a test task',
    type: 'mining',
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
      category: 'resource_gathering',
    },
    ...overrides,
  };
}

function makeGoal(overrides: Partial<GoalTagV1>): GoalTagV1 {
  return {
    version: 1,
    action: 'cancel',
    target: '',
    targetId: null,
    amount: null,
    raw: '[GOAL: cancel]',
    ...overrides,
  };
}

function storeWithTasks(...tasks: Task[]): TaskStore {
  const store = new TaskStore();
  for (const t of tasks) store.setTask(t);
  return store;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskManagementHandler', () => {
  // =========================================================================
  // ID-based resolution
  // =========================================================================

  describe('ID-based target resolution', () => {
    it('cancels task by explicit id', () => {
      const task = makeTask({ id: 'task_abc', status: 'active' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const result = handler.handle(
        makeGoal({ action: 'cancel', targetId: 'task_abc' }),
        'thought_1'
      );

      expect(result.decision).toBe('applied');
      expect(result.affectedTaskId).toBe('task_abc');
      expect(result.previousStatus).toBe('active');
      expect(result.newStatus).toBe('failed');
      expect(result.sourceThoughtId).toBe('thought_1');

      // Task actually mutated in store
      expect(store.getTask('task_abc')!.status).toBe('failed');
    });

    it('returns target_not_found for unknown id', () => {
      const store = storeWithTasks(makeTask({ id: 'task_abc' }));
      const handler = new TaskManagementHandler(store);

      const result = handler.handle(
        makeGoal({ action: 'cancel', targetId: 'nonexistent' }),
      );

      expect(result.decision).toBe('target_not_found');
      expect(result.reason).toContain('nonexistent');
    });
  });

  // =========================================================================
  // Slug-based resolution
  // =========================================================================

  describe('Slug-based target resolution', () => {
    it('resolves single candidate by slug match', () => {
      const task = makeTask({
        id: 'task_1',
        title: 'mine iron ore',
        status: 'active',
      });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const result = handler.handle(
        makeGoal({ action: 'cancel', target: 'mine_iron_ore' }),
      );

      expect(result.decision).toBe('applied');
      expect(result.affectedTaskId).toBe('task_1');
    });

    it('returns target_not_found when no slug matches', () => {
      const task = makeTask({
        id: 'task_1',
        title: 'mine iron ore',
        status: 'active',
      });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const result = handler.handle(
        makeGoal({ action: 'cancel', target: 'build_house' }),
      );

      expect(result.decision).toBe('target_not_found');
    });

    it('returns target_not_found when no query provided', () => {
      const store = storeWithTasks(makeTask({ id: 'task_1' }));
      const handler = new TaskManagementHandler(store);

      const result = handler.handle(
        makeGoal({ action: 'cancel', target: '', targetId: null }),
      );

      expect(result.decision).toBe('target_not_found');
      expect(result.reason).toContain('no target');
    });
  });

  // =========================================================================
  // Stop-the-line regression: Ambiguous target → no mutation
  // =========================================================================

  describe('Ambiguous target → needs_disambiguation (no mutation)', () => {
    it('returns needs_disambiguation with candidate IDs when multiple tasks match', () => {
      const task1 = makeTask({
        id: 'task_1',
        title: 'mine iron ore',
        status: 'active',
      });
      const task2 = makeTask({
        id: 'task_2',
        title: 'mine iron blocks',
        status: 'pending',
      });
      const store = storeWithTasks(task1, task2);
      const handler = new TaskManagementHandler(store);

      const result = handler.handle(
        makeGoal({ action: 'cancel', target: 'mine_iron' }),
      );

      expect(result.decision).toBe('needs_disambiguation');
      expect(result.candidates).toBeDefined();
      expect(result.candidates!.length).toBe(2);
      expect(result.candidates).toContain('task_1');
      expect(result.candidates).toContain('task_2');

      // Neither task was mutated
      expect(store.getTask('task_1')!.status).toBe('active');
      expect(store.getTask('task_2')!.status).toBe('pending');
    });

    it('ignores completed/failed tasks in slug matching', () => {
      const task1 = makeTask({
        id: 'task_1',
        title: 'mine iron ore',
        status: 'completed',
      });
      const task2 = makeTask({
        id: 'task_2',
        title: 'mine iron blocks',
        status: 'active',
      });
      const store = storeWithTasks(task1, task2);
      const handler = new TaskManagementHandler(store);

      const result = handler.handle(
        makeGoal({ action: 'cancel', target: 'mine_iron' }),
      );

      // Only 1 active candidate → applied, not disambiguation
      expect(result.decision).toBe('applied');
      expect(result.affectedTaskId).toBe('task_2');
    });
  });

  // =========================================================================
  // Transition model
  // =========================================================================

  describe('Explicit transition model', () => {
    it('pause: active → paused', () => {
      const task = makeTask({ id: 't', status: 'active' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'pause', targetId: 't' }));
      expect(r.decision).toBe('applied');
      expect(r.previousStatus).toBe('active');
      expect(r.newStatus).toBe('paused');
      expect(store.getTask('t')!.status).toBe('paused');
    });

    it('pause: pending → paused', () => {
      const task = makeTask({ id: 't', status: 'pending' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'pause', targetId: 't' }));
      expect(r.decision).toBe('applied');
      expect(r.newStatus).toBe('paused');
    });

    it('resume: paused → pending', () => {
      const task = makeTask({ id: 't', status: 'paused' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'resume', targetId: 't' }));
      expect(r.decision).toBe('applied');
      expect(r.previousStatus).toBe('paused');
      expect(r.newStatus).toBe('pending');
      expect(store.getTask('t')!.status).toBe('pending');
    });

    it('cancel: active → failed', () => {
      const task = makeTask({ id: 't', status: 'active' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'cancel', targetId: 't' }), 'th_1');
      expect(r.decision).toBe('applied');
      expect(r.previousStatus).toBe('active');
      expect(r.newStatus).toBe('failed');

      const updated = store.getTask('t')!;
      expect(updated.status).toBe('failed');
      expect(updated.metadata.blockedReason).toContain('cancelled');
      expect(updated.metadata.blockedReason).toContain('th_1');
    });

    it('cancel: pending_planning → failed', () => {
      const task = makeTask({ id: 't', status: 'pending_planning' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'cancel', targetId: 't' }));
      expect(r.decision).toBe('applied');
      expect(r.newStatus).toBe('failed');
    });

    it('cancel: paused → failed', () => {
      const task = makeTask({ id: 't', status: 'paused' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'cancel', targetId: 't' }));
      expect(r.decision).toBe('applied');
      expect(r.newStatus).toBe('failed');
    });
  });

  // =========================================================================
  // Stop-the-line regression: Immutable statuses
  // =========================================================================

  describe('Immutable statuses → invalid_transition', () => {
    it('completed task rejects cancel', () => {
      const task = makeTask({ id: 't_done', status: 'completed' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'cancel', targetId: 't_done' }));
      expect(r.decision).toBe('invalid_transition');
      expect(r.previousStatus).toBe('completed');
      expect(r.reason).toContain('immutable');

      // Task remains completed
      expect(store.getTask('t_done')!.status).toBe('completed');
    });

    it('failed task rejects pause', () => {
      const task = makeTask({ id: 't_fail', status: 'failed' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'pause', targetId: 't_fail' }));
      expect(r.decision).toBe('invalid_transition');
      expect(r.previousStatus).toBe('failed');

      expect(store.getTask('t_fail')!.status).toBe('failed');
    });

    it('completed task rejects prioritize', () => {
      const task = makeTask({ id: 't_done', status: 'completed' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'prioritize', targetId: 't_done' }));
      expect(r.decision).toBe('invalid_transition');
    });

    it('completed task rejects resume', () => {
      const task = makeTask({ id: 't_done', status: 'completed' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'resume', targetId: 't_done' }));
      expect(r.decision).toBe('invalid_transition');
    });
  });

  // =========================================================================
  // Invalid transitions (non-immutable)
  // =========================================================================

  describe('Invalid transitions (non-immutable)', () => {
    it('resume on non-paused task → invalid_transition', () => {
      const task = makeTask({ id: 't', status: 'active' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'resume', targetId: 't' }));
      expect(r.decision).toBe('invalid_transition');
      expect(r.reason).toContain('cannot resume');
    });

    it('pause on already paused task → invalid_transition', () => {
      const task = makeTask({ id: 't', status: 'paused' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'pause', targetId: 't' }));
      expect(r.decision).toBe('invalid_transition');
    });
  });

  // =========================================================================
  // Prioritize
  // =========================================================================

  describe('Prioritize', () => {
    it('default boost: +0.2', () => {
      const task = makeTask({ id: 't', status: 'active', priority: 0.5 });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'prioritize', targetId: 't' }));
      expect(r.decision).toBe('applied');
      expect(r.previousPriority).toBe(0.5);
      expect(r.newPriority).toBeCloseTo(0.7);
      expect(store.getTask('t')!.priority).toBeCloseTo(0.7);
    });

    it('explicit amount sets priority directly', () => {
      const task = makeTask({ id: 't', status: 'active', priority: 0.3 });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(
        makeGoal({ action: 'prioritize', targetId: 't', amount: 0.9 })
      );
      expect(r.decision).toBe('applied');
      expect(r.previousPriority).toBe(0.3);
      expect(r.newPriority).toBeCloseTo(0.9);
    });

    it('clamped to [0, 1] — high value', () => {
      const task = makeTask({ id: 't', status: 'active', priority: 0.5 });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(
        makeGoal({ action: 'prioritize', targetId: 't', amount: 5.0 })
      );
      expect(r.newPriority).toBe(1);
    });

    it('clamped to [0, 1] — negative value', () => {
      const task = makeTask({ id: 't', status: 'active', priority: 0.5 });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(
        makeGoal({ action: 'prioritize', targetId: 't', amount: -1.0 })
      );
      expect(r.newPriority).toBe(0);
    });

    it('default boost clamped at 1', () => {
      const task = makeTask({ id: 't', status: 'active', priority: 0.95 });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'prioritize', targetId: 't' }));
      expect(r.newPriority).toBe(1);
    });

    it('records previousPriority and newPriority for audit', () => {
      const task = makeTask({ id: 't', status: 'pending', priority: 0.4 });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'prioritize', targetId: 't' }));
      expect(r.previousPriority).toBeDefined();
      expect(r.newPriority).toBeDefined();
      expect(typeof r.previousPriority).toBe('number');
      expect(typeof r.newPriority).toBe('number');
    });
  });

  // =========================================================================
  // Provenance tracking
  // =========================================================================

  describe('Provenance', () => {
    it('records sourceThoughtId on result', () => {
      const task = makeTask({ id: 't', status: 'active' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(
        makeGoal({ action: 'cancel', targetId: 't' }),
        'thought_abc_123'
      );

      expect(r.sourceThoughtId).toBe('thought_abc_123');
    });

    it('includes sourceThoughtId=undefined when not provided', () => {
      const task = makeTask({ id: 't', status: 'active' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(makeGoal({ action: 'cancel', targetId: 't' }));
      expect(r.sourceThoughtId).toBeUndefined();
    });
  });

  // =========================================================================
  // Unknown action
  // =========================================================================

  describe('Unknown management action', () => {
    it('returns error for unknown action', () => {
      const task = makeTask({ id: 't', status: 'active' });
      const store = storeWithTasks(task);
      const handler = new TaskManagementHandler(store);

      const r = handler.handle(
        makeGoal({ action: 'teleport', targetId: 't' })
      );

      expect(r.decision).toBe('error');
      expect(r.reason).toContain('unknown management action');
    });
  });
});
