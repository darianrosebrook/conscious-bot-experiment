/**
 * Protocol effects drain serialization tests.
 *
 * Verifies:
 * A. Metadata effect failure (applySyncEffects throws) does not prevent status effects
 * B. Global serialization: back-to-back batches execute in strict order
 * C. Async caller waits behind prior batch before continuing
 *
 * These tests call private methods via (ti as any) to isolate drain behavior
 * without requiring full goal-binding setup.
 *
 * @author @darianrosebrook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external dependencies before importing TaskIntegration
vi.mock('@conscious-bot/core', () => ({
  createServiceClients: () => ({
    minecraft: {
      get: vi.fn().mockRejectedValue(new Error('mock: no minecraft')),
    },
    cognition: {
      get: vi.fn().mockRejectedValue(new Error('mock: no cognition')),
    },
    planning: {
      get: vi.fn().mockRejectedValue(new Error('mock: no planning')),
    },
    memory: {
      get: vi.fn().mockRejectedValue(new Error('mock: no memory')),
    },
    dashboard: {
      get: vi.fn().mockRejectedValue(new Error('mock: no dashboard')),
    },
  }),
}));

vi.mock('../../modules/cognitive-stream-client', () => ({
  CognitiveStreamClient: class {
    getRecentThoughts() { return Promise.resolve([]); }
    getActionableThoughts() { return Promise.resolve([]); }
  },
}));

vi.mock('../../modules/cognition-outbox', () => ({
  CognitionOutbox: class {
    start() {}
    stop() {}
    enqueue() {}
  },
}));

// Suppress global fetch calls
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

import { TaskIntegration } from '../../task-integration';
import type { SyncEffect } from '../../goals/goal-task-sync';
import type { Task } from '../../types/task';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedTask(ti: TaskIntegration, overrides: Partial<Task> = {}): Task {
  const id = overrides.id || `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const task: Task = {
    id,
    title: 'drain test task',
    description: '',
    type: 'general',
    priority: 0.5,
    urgency: 0.5,
    progress: 0,
    status: 'active',
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
    ...overrides,
  };
  // Directly inject into the store via the internal taskStore
  (ti as any).taskStore.setTask(task);
  return task;
}

// ---------------------------------------------------------------------------
// A. Metadata effect failure does not prevent status effects
// ---------------------------------------------------------------------------

describe('Protocol effects drain: containment', () => {
  let ti: TaskIntegration;

  beforeEach(() => {
    ti = new TaskIntegration();
  });

  it('status effects still apply when applySyncEffects throws', async () => {
    // Seed a task that the status effect will target
    const task = seedTask(ti, { id: 'target-1', status: 'active' });

    // Build effects: one metadata effect (apply_hold) that will cause
    // applySyncEffects to exercise the store, and one status effect.
    // We'll make the deps.getTask throw for the hold target to simulate failure.
    //
    // The cleanest way: construct effects where the metadata effect targets
    // a non-existent task (applySyncEffects won't throw, just skip it),
    // so instead we mock the imported applySyncEffects to throw.

    // Use the internal method directly with effects that include both types
    const effects: SyncEffect[] = [
      // This apply_hold targets a non-existent task — in normal code it would
      // just be skipped, but we want to test the try/catch. We'll spy on
      // applySyncEffects to make it throw.
      { type: 'apply_hold', taskId: 'nonexistent', reason: 'preempted', nextReviewAt: Date.now() + 60000 },
      { type: 'update_task_status', taskId: 'target-1', status: 'completed' },
    ];

    // Spy on the imported applySyncEffects by replacing it on the module
    const goalHooksModule = await import('../../goals/goal-lifecycle-hooks');
    const originalApply = goalHooksModule.applySyncEffects;
    const applySpy = vi.spyOn(goalHooksModule, 'applySyncEffects').mockImplementation(() => {
      throw new Error('simulated applySyncEffects failure');
    });

    const consoleSpy = vi.spyOn(console, 'error');

    const count = await (ti as any).applyGoalProtocolEffects(effects);

    // Status effect should still have been applied
    const updatedTask = (ti as any).taskStore.getTask('target-1');
    expect(updatedTask.status).toBe('completed');

    // Count reflects only the status effect (metadata effect threw)
    expect(count).toBe(1);

    // Error was logged with structured context
    const syncFailCalls = consoleSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('applySyncEffects failed')
    );
    expect(syncFailCalls.length).toBe(1);
    expect(syncFailCalls[0][1]).toMatchObject({
      effectTypes: ['apply_hold'],
      effectCount: 1,
      mayBePartial: true,
      errorName: 'Error',
    });

    applySpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// B. Global serialization: back-to-back batches execute in strict order
// ---------------------------------------------------------------------------

describe('Protocol effects drain: serialization', () => {
  let ti: TaskIntegration;

  beforeEach(() => {
    ti = new TaskIntegration();
  });

  it('back-to-back scheduled batches execute in strict order', async () => {
    const task = seedTask(ti, { id: 'order-1', status: 'active' });
    const callOrder: string[] = [];

    // Spy on updateTaskStatus to record call order
    const originalUpdate = (ti as any).updateTaskStatus.bind(ti);
    vi.spyOn(ti as any, 'updateTaskStatus').mockImplementation(
      async (...args: unknown[]) => {
        const [taskId, status, opts] = args as [string, string, any];
        callOrder.push(`${taskId}:${status}`);
        return originalUpdate(taskId, status, opts);
      }
    );

    // Schedule two batches without awaiting the first
    const batch1: SyncEffect[] = [
      { type: 'update_task_status', taskId: 'order-1', status: 'paused' },
    ];
    const batch2: SyncEffect[] = [
      { type: 'update_task_status', taskId: 'order-1', status: 'active' },
    ];

    const p1 = (ti as any).scheduleGoalProtocolEffects(batch1);
    const p2 = (ti as any).scheduleGoalProtocolEffects(batch2);

    // Both must complete
    await Promise.all([p1, p2]);

    // Strict ordering: batch1 before batch2
    expect(callOrder).toEqual(['order-1:paused', 'order-1:active']);

    // Final state reflects batch2 (last writer wins)
    const finalTask = (ti as any).taskStore.getTask('order-1');
    expect(finalTask.status).toBe('active');
  });

  it('empty effects array does not touch the drain', async () => {
    // Record the drain reference before the call
    const drainBefore = (ti as any).protocolEffectsDrain;

    const result = await (ti as any).scheduleGoalProtocolEffects([]);

    expect(result).toBe(0);
    // Drain should be the same object reference (not advanced)
    expect((ti as any).protocolEffectsDrain).toBe(drainBefore);
  });
});

// ---------------------------------------------------------------------------
// C. Async caller waits behind prior batch
// ---------------------------------------------------------------------------

describe('Protocol effects drain: async caller ordering', () => {
  let ti: TaskIntegration;

  beforeEach(() => {
    ti = new TaskIntegration();
  });

  it('awaited schedule waits behind previously queued batch', async () => {
    seedTask(ti, { id: 'async-1', status: 'active' });
    const timeline: string[] = [];

    const originalUpdate = (ti as any).updateTaskStatus.bind(ti);
    vi.spyOn(ti as any, 'updateTaskStatus').mockImplementation(
      async (...args: unknown[]) => {
        const [taskId, status, opts] = args as [string, string, any];
        timeline.push(`start:${taskId}:${status}`);
        // Simulate async work with a small delay on the first batch
        if (status === 'paused') {
          await new Promise((r) => setTimeout(r, 20));
        }
        await originalUpdate(taskId, status, opts);
        timeline.push(`end:${taskId}:${status}`);
      }
    );

    // Fire batch 1 onto the drain (not awaited — simulates sync caller)
    void (ti as any).scheduleGoalProtocolEffects([
      { type: 'update_task_status', taskId: 'async-1', status: 'paused' } as SyncEffect,
    ]);

    // Batch 2 awaited (simulates async caller like updateTaskStatus)
    await (ti as any).scheduleGoalProtocolEffects([
      { type: 'update_task_status', taskId: 'async-1', status: 'active' } as SyncEffect,
    ]);

    // Batch 1 must fully complete before batch 2 starts
    expect(timeline).toEqual([
      'start:async-1:paused',
      'end:async-1:paused',
      'start:async-1:active',
      'end:async-1:active',
    ]);
  });
});
