/**
 * Task Management Handler — processes management actions (cancel, prioritize,
 * pause, resume) from explicit Sterling management payloads.
 *
 * Architecture principle: management actions must not be inferred from text.
 * They are accepted only when Sterling emits a contract payload.
 *
 * @author @darianrosebrook
 */

import type { Task } from '../types/task';
import type { TaskStore } from './task-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ManagementDecision =
  | 'applied'
  | 'needs_disambiguation'
  | 'target_not_found'
  | 'invalid_transition'
  | 'error';

export interface SterlingManagementAction {
  action: string;
  target: {
    taskId: string | null;
    committedIrDigest: string | null;
    query: string | null;
  };
  amount: number | null;
}

export interface ManagementResult {
  decision: ManagementDecision;
  action: string;
  targetQuery: string;
  targetId?: string;
  affectedTaskId?: string;
  previousStatus?: string;
  newStatus?: string;
  previousPriority?: number;
  newPriority?: number;
  reason?: string;
  sourceThoughtId?: string;
  candidates?: string[];
}

// ---------------------------------------------------------------------------
// Transition model
// ---------------------------------------------------------------------------

const TRANSITION_TABLE: Record<string, Record<string, Task['status'] | null>> = {
  pause: {
    pending: 'paused',
    active: 'paused',
    paused: null,
    pending_planning: null,
    completed: null,
    failed: null,
    unplannable: null,
  },
  resume: {
    paused: 'pending',
    pending: null,
    active: null,
    pending_planning: null,
    completed: null,
    failed: null,
    unplannable: null,
  },
  cancel: {
    pending: 'failed',
    active: 'failed',
    paused: 'failed',
    pending_planning: 'failed',
    completed: null,
    failed: null,
    unplannable: 'failed',
  },
  prioritize: {
    pending: 'pending',
    active: 'active',
    paused: 'paused',
    pending_planning: 'pending_planning',
    completed: null,
    failed: null,
    unplannable: null,
  },
};

const IMMUTABLE_STATUSES = new Set<Task['status']>(['completed', 'failed']);

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export class TaskManagementHandler {
  constructor(private readonly taskStore: TaskStore) {}

  /**
   * Process a management action from a Sterling payload.
   */
  handle(
    actionInput: SterlingManagementAction,
    sourceThoughtId?: string,
  ): ManagementResult {
    const action = actionInput.action;
    const base: Partial<ManagementResult> = {
      action,
      targetQuery: actionInput.target.query ?? actionInput.target.taskId ?? actionInput.target.committedIrDigest ?? '',
      targetId: actionInput.target.taskId ?? undefined,
      sourceThoughtId,
    };

    try {
      const resolution = this.resolveTarget(actionInput);
      if (resolution.decision !== 'applied') {
        return { ...base, ...resolution } as ManagementResult;
      }

      const task = resolution.task!;
      base.affectedTaskId = task.id;

      const transitions = TRANSITION_TABLE[action];
      if (!transitions) {
        return {
          ...base,
          decision: 'error',
          reason: `unknown management action: ${action}`,
        } as ManagementResult;
      }

      const newStatus = transitions[task.status];
      if (newStatus === null || newStatus === undefined) {
        return {
          ...base,
          decision: 'invalid_transition',
          previousStatus: task.status,
          reason: IMMUTABLE_STATUSES.has(task.status)
            ? `task status '${task.status}' is immutable`
            : `cannot ${action} task in '${task.status}' status`,
        } as ManagementResult;
      }

      if (action === 'prioritize') {
        return this.applyPrioritize(task, actionInput, base);
      }

      const previousStatus = task.status;
      task.status = newStatus;
      task.metadata.updatedAt = Date.now();
      if (newStatus === 'failed' && action === 'cancel') {
        task.metadata.blockedReason = `cancelled via management action (thought: ${sourceThoughtId ?? 'unknown'})`;
      }
      this.taskStore.setTask(task);

      return {
        ...base,
        decision: 'applied',
        previousStatus,
        newStatus,
      } as ManagementResult;
    } catch (err) {
      return {
        ...base,
        decision: 'error',
        reason: String(err),
      } as ManagementResult;
    }
  }

  // -------------------------------------------------------------------------
  // Target resolution
  // -------------------------------------------------------------------------

  private resolveTarget(actionInput: SterlingManagementAction): {
    decision: ManagementDecision;
    task?: Task;
    candidates?: string[];
    reason?: string;
    targetQuery: string;
    action: string;
  } {
    const action = actionInput.action;
    const targetQuery = actionInput.target.query ?? actionInput.target.taskId ?? actionInput.target.committedIrDigest ?? '';

    // Path 1: explicit task ID
    const taskId = actionInput.target.taskId ?? null;
    const digest = actionInput.target.committedIrDigest ?? null;
    let taskById: Task | null = null;
    let taskByDigest: Task | null = null;

    if (taskId) {
      const task = this.taskStore.getTask(taskId);
      if (!task) {
        return {
          decision: 'target_not_found',
          targetQuery,
          action,
          reason: `no task with id '${taskId}'`,
        };
      }
      taskById = task;
    }

    if (digest) {
      const matches = this.taskStore.getTasks().filter(t =>
        (t.metadata as any)?.sterling?.committedIrDigest === digest
      );
      if (matches.length === 0) {
        return {
          decision: 'target_not_found',
          targetQuery,
          action,
          reason: `no tasks with committed_ir_digest '${digest}'`,
        };
      }
      if (matches.length > 1) {
        return {
          decision: 'needs_disambiguation',
          candidates: matches.map(t => t.id),
          targetQuery,
          action,
          reason: `${matches.length} tasks match committed_ir_digest '${digest}'`,
        };
      }
      taskByDigest = matches[0];
    }

    if (taskById && taskByDigest && taskById.id !== taskByDigest.id) {
      return {
        decision: 'needs_disambiguation',
        targetQuery,
        action,
        reason: `conflicting targets: taskId '${taskById.id}' != digest '${taskByDigest.id}'`,
      };
    }

    const resolved = taskById ?? taskByDigest;
    if (resolved) {
      return { decision: 'applied', task: resolved, targetQuery, action };
    }

    // Path 3: query-only is NOT actionable in Phase 3 (explicit target required).
    const query = (actionInput.target.query ?? '').toLowerCase().replace(/_/g, ' ').trim();
    if (!query) {
      return {
        decision: 'target_not_found',
        targetQuery,
        action,
        reason: 'no target identifier or query provided',
      };
    }
    return {
      decision: 'needs_disambiguation',
      targetQuery,
      action,
      reason: `query-only management action requires explicit target reference: '${query}'`,
    };
  }

  // -------------------------------------------------------------------------
  // Prioritize
  // -------------------------------------------------------------------------

  private applyPrioritize(
    task: Task,
    actionInput: SterlingManagementAction,
    base: Partial<ManagementResult>,
  ): ManagementResult {
    const previousPriority = task.priority;
    let newPriority: number;

    if (actionInput.amount !== null) {
      newPriority = Math.max(0, Math.min(1, actionInput.amount));
    } else {
      newPriority = Math.min(1, previousPriority + 0.2);
    }

    task.priority = newPriority;
    task.metadata.updatedAt = Date.now();
    this.taskStore.setTask(task);

    return {
      ...base,
      decision: 'applied',
      previousStatus: task.status,
      newStatus: task.status,
      previousPriority,
      newPriority,
    } as ManagementResult;
  }
}
