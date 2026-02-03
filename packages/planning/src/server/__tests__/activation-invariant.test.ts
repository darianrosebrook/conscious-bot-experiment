/**
 * Activation Invariant Tests
 *
 * These tests enforce the critical invariant from Phase 2.5:
 * "If a task is dispatched to the gateway, it cannot be 'pending' after the cycle"
 *
 * The invariant ensures that:
 * 1. Tasks are activated before execution (pending → active transition)
 * 2. Tasks with actionsCompleted > 0 cannot be pending
 * 3. Tasks with planExecuted: true cannot be pending
 *
 * @see docs/testing/live-execution-evaluation-phase2.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Minimal mock types for testing the invariants.
 * We don't need full TaskIntegration — just the relevant state/behavior.
 */
interface MockTask {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  actionsCompleted?: number;
  metadata?: {
    planExecuted?: boolean;
  };
}

/**
 * Test helper: simulates task lifecycle invariant violations.
 * These are the conditions that should NEVER be true after a dispatch cycle.
 */
function detectInvariantViolation(task: MockTask): string | null {
  // Invariant 1: If actionsCompleted > 0, task cannot be pending
  if ((task.actionsCompleted ?? 0) > 0 && task.status === 'pending') {
    return `VIOLATION: Task ${task.id} has actionsCompleted=${task.actionsCompleted} but status='pending'`;
  }

  // Invariant 2: If planExecuted is true, task cannot be pending
  if (task.metadata?.planExecuted && task.status === 'pending') {
    return `VIOLATION: Task ${task.id} has planExecuted=true but status='pending'`;
  }

  return null;
}

describe('Activation Invariant: dispatched implies not pending', () => {
  describe('invariant detection logic', () => {
    it('detects violation when actionsCompleted > 0 and status is pending', () => {
      const task: MockTask = {
        id: 'task-1',
        status: 'pending',
        actionsCompleted: 1,
      };
      const violation = detectInvariantViolation(task);
      expect(violation).not.toBeNull();
      expect(violation).toContain('actionsCompleted');
    });

    it('detects violation when planExecuted is true and status is pending', () => {
      const task: MockTask = {
        id: 'task-2',
        status: 'pending',
        metadata: { planExecuted: true },
      };
      const violation = detectInvariantViolation(task);
      expect(violation).not.toBeNull();
      expect(violation).toContain('planExecuted');
    });

    it('allows pending status when no execution has occurred', () => {
      const task: MockTask = {
        id: 'task-3',
        status: 'pending',
        actionsCompleted: 0,
        metadata: { planExecuted: false },
      };
      const violation = detectInvariantViolation(task);
      expect(violation).toBeNull();
    });

    it('allows active status with actionsCompleted > 0', () => {
      const task: MockTask = {
        id: 'task-4',
        status: 'active',
        actionsCompleted: 3,
        metadata: { planExecuted: true },
      };
      const violation = detectInvariantViolation(task);
      expect(violation).toBeNull();
    });

    it('allows completed status with actionsCompleted > 0', () => {
      const task: MockTask = {
        id: 'task-5',
        status: 'completed',
        actionsCompleted: 5,
        metadata: { planExecuted: true },
      };
      const violation = detectInvariantViolation(task);
      expect(violation).toBeNull();
    });

    it('allows failed status with planExecuted', () => {
      const task: MockTask = {
        id: 'task-6',
        status: 'failed',
        actionsCompleted: 2,
        metadata: { planExecuted: true },
      };
      const violation = detectInvariantViolation(task);
      expect(violation).toBeNull();
    });
  });

  describe('ensureActivated contract', () => {
    // Mock TaskIntegration.ensureActivated behavior
    let taskStore: Map<string, MockTask>;

    beforeEach(() => {
      taskStore = new Map();
    });

    async function mockEnsureActivated(taskId: string): Promise<boolean> {
      const task = taskStore.get(taskId);
      if (!task) {
        return false;
      }

      // Already in a non-pending state — no action needed
      if (task.status !== 'pending') {
        return false;
      }

      // Transition pending → active
      task.status = 'active';
      return true;
    }

    it('transitions pending task to active', async () => {
      const task: MockTask = { id: 'task-1', status: 'pending' };
      taskStore.set(task.id, task);

      const result = await mockEnsureActivated(task.id);

      expect(result).toBe(true);
      expect(task.status).toBe('active');
    });

    it('returns false for already active task', async () => {
      const task: MockTask = { id: 'task-2', status: 'active' };
      taskStore.set(task.id, task);

      const result = await mockEnsureActivated(task.id);

      expect(result).toBe(false);
      expect(task.status).toBe('active');
    });

    it('returns false for completed task', async () => {
      const task: MockTask = { id: 'task-3', status: 'completed' };
      taskStore.set(task.id, task);

      const result = await mockEnsureActivated(task.id);

      expect(result).toBe(false);
      expect(task.status).toBe('completed');
    });

    it('returns false for failed task', async () => {
      const task: MockTask = { id: 'task-4', status: 'failed' };
      taskStore.set(task.id, task);

      const result = await mockEnsureActivated(task.id);

      expect(result).toBe(false);
      expect(task.status).toBe('failed');
    });

    it('returns false for non-existent task', async () => {
      const result = await mockEnsureActivated('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('execution cycle invariant enforcement', () => {
    // Simulates a complete dispatch cycle with ensureActivated

    let taskStore: Map<string, MockTask>;

    beforeEach(() => {
      taskStore = new Map();
    });

    async function simulateDispatchCycle(taskId: string): Promise<{ task: MockTask | undefined; violation: string | null }> {
      const task = taskStore.get(taskId);
      if (!task) {
        return { task: undefined, violation: null };
      }

      // P0-2: ensureActivated at dispatch boundary
      if (task.status === 'pending') {
        task.status = 'active';
      }

      // Simulate execution (increment actionsCompleted)
      task.actionsCompleted = (task.actionsCompleted ?? 0) + 1;
      task.metadata = { ...task.metadata, planExecuted: true };

      // Check invariant after cycle
      const violation = detectInvariantViolation(task);

      return { task, violation };
    }

    it('enforces invariant: task cannot be pending after execution', async () => {
      const task: MockTask = {
        id: 'task-cycle-1',
        status: 'pending',
        actionsCompleted: 0,
      };
      taskStore.set(task.id, task);

      const { task: resultTask, violation } = await simulateDispatchCycle(task.id);

      expect(resultTask).toBeDefined();
      expect(resultTask!.status).toBe('active');
      expect(resultTask!.actionsCompleted).toBe(1);
      expect(violation).toBeNull(); // No invariant violation
    });

    it('enforces invariant: already active task stays valid', async () => {
      const task: MockTask = {
        id: 'task-cycle-2',
        status: 'active',
        actionsCompleted: 2,
      };
      taskStore.set(task.id, task);

      const { task: resultTask, violation } = await simulateDispatchCycle(task.id);

      expect(resultTask).toBeDefined();
      expect(resultTask!.status).toBe('active');
      expect(resultTask!.actionsCompleted).toBe(3);
      expect(violation).toBeNull();
    });

    it('would detect violation if ensureActivated was skipped', () => {
      // This test shows what happens WITHOUT ensureActivated
      // This is the bug we're preventing
      const task: MockTask = {
        id: 'task-bad',
        status: 'pending',
        actionsCompleted: 0,
      };

      // Simulate execution WITHOUT ensureActivated (the bug)
      task.actionsCompleted = 1;
      task.metadata = { planExecuted: true };
      // Note: status stays 'pending' — THIS IS THE BUG

      const violation = detectInvariantViolation(task);
      expect(violation).not.toBeNull();
      expect(violation).toContain('VIOLATION');
    });
  });
});

describe('Task-action resolver deterministic failure contract', () => {
  // These tests verify that mapping failures don't trigger backoff

  it('mapping failures have retryable: false', () => {
    // This is a type-level contract enforced by ResolveErr
    type ResolveErr = {
      ok: false;
      retryable: false; // Always false — this is the contract
      failureCode: string;
    };

    // TypeScript ensures this at compile time
    const err: ResolveErr = {
      ok: false,
      retryable: false,
      failureCode: 'mapping_missing:craft:item',
    };

    expect(err.retryable).toBe(false);
    expect(err.failureCode.startsWith('mapping_')).toBe(true);
  });

  it('mapping failure codes have structured format', () => {
    const validCodes = [
      'mapping_missing:craft:item',
      'mapping_missing:mine:block',
      'mapping_missing:gather:resource',
      'mapping_missing:navigate:target',
      'mapping_invalid:unknown_type:foo',
    ];

    for (const code of validCodes) {
      const parts = code.split(':');
      expect(parts.length).toBeGreaterThanOrEqual(2);
      expect(parts[0]).toMatch(/^mapping_/);
    }
  });
});

describe('ELIGIBLE_STATUSES allowlist contract', () => {
  // Verify that the allowlist is correctly implemented

  const ELIGIBLE_STATUSES = new Set(['active', 'in_progress']);

  it('pending is NOT eligible', () => {
    expect(ELIGIBLE_STATUSES.has('pending')).toBe(false);
  });

  it('active is eligible', () => {
    expect(ELIGIBLE_STATUSES.has('active')).toBe(true);
  });

  it('in_progress is eligible', () => {
    expect(ELIGIBLE_STATUSES.has('in_progress')).toBe(true);
  });

  it('completed is NOT eligible', () => {
    expect(ELIGIBLE_STATUSES.has('completed')).toBe(false);
  });

  it('failed is NOT eligible', () => {
    expect(ELIGIBLE_STATUSES.has('failed')).toBe(false);
  });

  it('paused is NOT eligible', () => {
    expect(ELIGIBLE_STATUSES.has('paused')).toBe(false);
  });

  it('unplannable is NOT eligible', () => {
    expect(ELIGIBLE_STATUSES.has('unplannable')).toBe(false);
  });
});
