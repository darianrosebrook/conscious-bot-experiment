/**
 * GoalKey Queue Scan Guard — Unit Tests
 *
 * Verifies the goalKey-based dedup guard prevents duplicate task injection
 * and correctly handles staleness policy (P3).
 */

import { describe, it, expect, vi } from 'vitest';
import { scanForOutstandingGoalKey } from '../goalkey-guard';

// ============================================================================
// Helpers
// ============================================================================

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {
      goalKey: 'test-goal-key',
    },
    ...overrides,
  };
}

function makeGetTasks(tasks: any[]) {
  return (filters?: { status?: string[] }) => {
    if (filters?.status) {
      return tasks.filter((t) => filters.status!.includes(t.status));
    }
    return tasks;
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('scanForOutstandingGoalKey', () => {
  it('returns clear when no tasks exist', () => {
    const result = scanForOutstandingGoalKey(
      makeGetTasks([]),
      'test-goal-key',
    );
    expect(result).toEqual({ kind: 'clear' });
  });

  it('returns clear when no matching goalKey among pending/active tasks', () => {
    const tasks = [
      makeTask({ metadata: { goalKey: 'different-key' } }),
      makeTask({ metadata: { goalKey: 'another-key' } }),
    ];
    const result = scanForOutstandingGoalKey(
      makeGetTasks(tasks),
      'test-goal-key',
    );
    expect(result).toEqual({ kind: 'clear' });
  });

  it('returns blocked when matching goalKey exists on a pending task', () => {
    const task = makeTask({ status: 'pending' });
    const result = scanForOutstandingGoalKey(
      makeGetTasks([task]),
      'test-goal-key',
    );
    expect(result.kind).toBe('blocked');
    if (result.kind === 'blocked') {
      expect(result.existingTaskId).toBe(task.id);
      expect(result.taskAge).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns blocked when matching goalKey exists on an active task', () => {
    const task = makeTask({ status: 'active' });
    const result = scanForOutstandingGoalKey(
      makeGetTasks([task]),
      'test-goal-key',
    );
    expect(result.kind).toBe('blocked');
    if (result.kind === 'blocked') {
      expect(result.existingTaskId).toBe(task.id);
    }
  });

  it('ignores completed tasks', () => {
    const tasks = [
      makeTask({ status: 'completed', metadata: { goalKey: 'test-goal-key' } }),
    ];
    const result = scanForOutstandingGoalKey(
      makeGetTasks(tasks),
      'test-goal-key',
    );
    expect(result).toEqual({ kind: 'clear' });
  });

  it('ignores failed tasks', () => {
    const tasks = [
      makeTask({ status: 'failed', metadata: { goalKey: 'test-goal-key' } }),
    ];
    const result = scanForOutstandingGoalKey(
      makeGetTasks(tasks),
      'test-goal-key',
    );
    expect(result).toEqual({ kind: 'clear' });
  });

  it('matches by goalKey, not by title or type', () => {
    const tasks = [
      makeTask({
        title: 'Eat food (reflex)',
        type: 'survival',
        metadata: { goalKey: 'different-key' },
      }),
    ];
    const result = scanForOutstandingGoalKey(
      makeGetTasks(tasks),
      'test-goal-key',
    );
    expect(result).toEqual({ kind: 'clear' });
  });

  describe('staleness policy (P3)', () => {
    it('returns clear when matching task is stale (older than staleMs)', () => {
      const staleTask = makeTask({
        status: 'active',
        updatedAt: Date.now() - 600_000, // 10 minutes ago
        createdAt: Date.now() - 600_000,
      });
      const result = scanForOutstandingGoalKey(
        makeGetTasks([staleTask]),
        'test-goal-key',
        { staleMs: 300_000 }, // 5 minutes
      );
      expect(result).toEqual({ kind: 'clear' });
    });

    it('returns blocked when task is within staleMs', () => {
      const freshTask = makeTask({
        status: 'active',
        updatedAt: Date.now() - 60_000, // 1 minute ago
      });
      const result = scanForOutstandingGoalKey(
        makeGetTasks([freshTask]),
        'test-goal-key',
        { staleMs: 300_000 },
      );
      expect(result.kind).toBe('blocked');
    });

    it('calls onStaleEscape callback for stale task bypass', () => {
      const onStaleEscape = vi.fn();
      const staleTask = makeTask({
        id: 'stale-task-123',
        status: 'pending',
        updatedAt: Date.now() - 400_000,
        createdAt: Date.now() - 400_000,
      });
      scanForOutstandingGoalKey(
        makeGetTasks([staleTask]),
        'test-goal-key',
        { staleMs: 300_000, onStaleEscape },
      );
      expect(onStaleEscape).toHaveBeenCalledWith('stale-task-123', expect.any(Number));
      expect(onStaleEscape.mock.calls[0][1]).toBeGreaterThanOrEqual(400_000);
    });

    it('uses default staleMs of 300_000 when not specified', () => {
      // Task is 4 minutes old (within default 5-minute staleMs)
      const task = makeTask({
        status: 'active',
        updatedAt: Date.now() - 240_000,
      });
      const result = scanForOutstandingGoalKey(
        makeGetTasks([task]),
        'test-goal-key',
      );
      expect(result.kind).toBe('blocked');

      // Task is 6 minutes old (exceeds default 5-minute staleMs)
      const staleTask = makeTask({
        status: 'active',
        updatedAt: Date.now() - 360_000,
        createdAt: Date.now() - 360_000,
      });
      const result2 = scanForOutstandingGoalKey(
        makeGetTasks([staleTask]),
        'test-goal-key',
      );
      expect(result2.kind).toBe('clear');
    });
  });

  it('handles tasks with missing metadata gracefully', () => {
    const tasks = [
      { id: 'no-meta', status: 'pending' },
      { id: 'null-meta', status: 'active', metadata: null },
      { id: 'empty-meta', status: 'pending', metadata: {} },
    ];
    const result = scanForOutstandingGoalKey(
      makeGetTasks(tasks),
      'test-goal-key',
    );
    expect(result).toEqual({ kind: 'clear' });
  });

  it('falls back to createdAt when updatedAt is missing', () => {
    const task = makeTask({
      status: 'pending',
      updatedAt: undefined,
      createdAt: Date.now() - 400_000,
    });
    const result = scanForOutstandingGoalKey(
      makeGetTasks([task]),
      'test-goal-key',
      { staleMs: 300_000 },
    );
    // Should be stale (400s > 300s)
    expect(result.kind).toBe('clear');
  });
});
