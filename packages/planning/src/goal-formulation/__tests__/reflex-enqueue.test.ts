/**
 * Regression tests for tryEnqueueReflexTask — the integration-layer helper
 * that structurally guarantees "one task_planned → exactly one terminal event."
 *
 * These tests exercise the helper in isolation (no modular-server boot required)
 * and verify the discriminated result under each scenario:
 *   1. addTask() succeeds with .id → { kind: 'enqueued', taskId }
 *   2. addTask() throws → { kind: 'skipped', reason: ENQUEUE_FAILED, error }
 *   3. addTask() returns null/object-without-id → { kind: 'skipped', reason: ENQUEUE_RETURNED_NULL }
 *
 * The double-emit bug this prevents: if addTask() throws, reflexTask stays null,
 * and a subsequent `if (!reflexTask)` check would emit a second skip event.
 * The discriminated result makes that structurally impossible.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { tryEnqueueReflexTask } from '../reflex-enqueue';
import { EnqueueSkipReason } from '../reflex-lifecycle-events';
import type { HungerDriveshaftResult } from '../hunger-driveshaft-controller';

// ============================================================================
// Minimal stub — just enough to satisfy tryEnqueueReflexTask's interface
// ============================================================================

function makeStubReflexResult(overrides?: Partial<HungerDriveshaftResult>): HungerDriveshaftResult {
  return {
    goal: {} as any,
    taskData: {
      title: 'Eat food (reflex)',
      description: 'test',
      type: 'survival',
      priority: 0.9,
      urgency: 0.75,
      source: 'autonomous',
      steps: [{
        id: 'step-1',
        label: 'Consume food',
        done: false,
        order: 0,
        meta: { leaf: 'consume_food', args: { food_type: 'any', amount: 1 }, executable: true },
      }],
    },
    goalKey: 'test-goal-key',
    reflexInstanceId: 'test-reflex-id-1234',
    proofAccumulator: {} as any,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('tryEnqueueReflexTask', () => {
  it('returns enqueued with taskId when addTask succeeds', async () => {
    const addTask = async () => ({ id: 'task-42', status: 'pending' });
    const result = await tryEnqueueReflexTask(addTask, makeStubReflexResult());

    expect(result.kind).toBe('enqueued');
    if (result.kind === 'enqueued') {
      expect(result.taskId).toBe('task-42');
    }
  });

  it('returns skipped with ENQUEUE_FAILED when addTask throws', async () => {
    const addTask = async () => { throw new Error('connection refused'); };
    const result = await tryEnqueueReflexTask(addTask, makeStubReflexResult());

    expect(result.kind).toBe('skipped');
    if (result.kind === 'skipped') {
      expect(result.reason).toBe(EnqueueSkipReason.ENQUEUE_FAILED);
    }
  });

  it('preserves thrown error for diagnostic logging on ENQUEUE_FAILED', async () => {
    const thrownError = new Error('connection refused');
    const addTask = async () => { throw thrownError; };
    const result = await tryEnqueueReflexTask(addTask, makeStubReflexResult());

    expect(result.kind).toBe('skipped');
    if (result.kind === 'skipped') {
      expect(result.error).toBe(thrownError);
      expect((result.error as Error).message).toBe('connection refused');
    }
  });

  it('does not include error field on ENQUEUE_RETURNED_NULL', async () => {
    const addTask = async () => null;
    const result = await tryEnqueueReflexTask(addTask, makeStubReflexResult());

    expect(result.kind).toBe('skipped');
    if (result.kind === 'skipped') {
      expect(result.reason).toBe(EnqueueSkipReason.ENQUEUE_RETURNED_NULL);
      expect(result.error).toBeUndefined();
    }
  });

  it('returns skipped with ENQUEUE_RETURNED_NULL when addTask returns object without .id', async () => {
    // Shape drift: addTask returns something truthy but missing .id
    const addTask = async () => ({ status: 'pending', name: 'some task' });
    const result = await tryEnqueueReflexTask(addTask, makeStubReflexResult());

    expect(result.kind).toBe('skipped');
    if (result.kind === 'skipped') {
      expect(result.reason).toBe(EnqueueSkipReason.ENQUEUE_RETURNED_NULL);
    }
  });

  it('returns skipped with ENQUEUE_RETURNED_NULL when addTask returns undefined', async () => {
    const addTask = async () => undefined;
    const result = await tryEnqueueReflexTask(addTask, makeStubReflexResult());

    expect(result.kind).toBe('skipped');
    if (result.kind === 'skipped') {
      expect(result.reason).toBe(EnqueueSkipReason.ENQUEUE_RETURNED_NULL);
    }
  });

  it('never returns two results (structural mutual exclusion)', async () => {
    // This is the regression test for the double-emit bug.
    // The old code would emit ENQUEUE_FAILED in catch, then fall through
    // to emit ENQUEUE_RETURNED_NULL because reflexTask was still null.
    // The discriminated result makes this impossible — one call, one result.
    const addTask = async () => { throw new Error('boom'); };
    const result = await tryEnqueueReflexTask(addTask, makeStubReflexResult());

    // Result is a single object, not an array — structurally one outcome
    expect(result.kind).toBe('skipped');
    expect(result).toHaveProperty('reason');
    expect(result).not.toHaveProperty('taskId');
  });

  it('passes reflexResult metadata through to addTask', async () => {
    let captured: Record<string, unknown> | null = null;
    const addTask = async (data: Record<string, unknown>) => {
      captured = data;
      return { id: 'task-99' };
    };

    const reflexResult = makeStubReflexResult({
      goalKey: 'my-goal-key',
      reflexInstanceId: 'my-reflex-id',
    });

    await tryEnqueueReflexTask(addTask, reflexResult);

    expect(captured).not.toBeNull();
    const metadata = (captured as any).metadata;
    expect(metadata.goalKey).toBe('my-goal-key');
    expect(metadata.reflexInstanceId).toBe('my-reflex-id');
    expect(metadata.taskProvenance.builder).toBe('hunger-driveshaft-controller');
    expect(metadata.taskProvenance.source).toBe('reflex');
  });
});
