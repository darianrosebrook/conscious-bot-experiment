/**
 * Task Management Handler — processes management actions (cancel, prioritize,
 * pause, resume) from parsed goal tags.
 *
 * Architecture principle: A management action must never apply without an
 * unambiguous target. ID-based resolution is authoritative; title-based
 * matching is assistive only (single-candidate + stable slug match).
 * Ambiguous resolution → `needs_disambiguation` result, not silent no-op.
 *
 * Every mutation is recorded with provenance (source thought ID, previous
 * state, new state).
 *
 * @author @darianrosebrook
 */

import type { GoalTagV1 } from '@conscious-bot/cognition';
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

/**
 * Explicit transition table for management actions.
 * Immutable statuses (completed, failed) reject all management actions.
 */
const TRANSITION_TABLE: Record<string, Record<string, Task['status'] | null>> = {
  pause: {
    pending: 'paused',
    active: 'paused',
    paused: null,           // already paused → invalid
    pending_planning: null,
    completed: null,
    failed: null,
    unplannable: null,
  },
  resume: {
    paused: 'pending',
    pending: null,          // already pending → invalid
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
    pending: 'pending',     // stays in same status, priority changes
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
// Slug helper
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export class TaskManagementHandler {
  constructor(private readonly taskStore: TaskStore) {}

  /**
   * Process a management action from a parsed goal tag.
   */
  handle(
    goal: GoalTagV1,
    sourceThoughtId?: string,
  ): ManagementResult {
    const action = goal.action;
    const base: Partial<ManagementResult> = {
      action,
      targetQuery: goal.target || '',
      targetId: goal.targetId ?? undefined,
      sourceThoughtId,
    };

    try {
      // Resolve target task
      const resolution = this.resolveTarget(goal);
      if (resolution.decision !== 'applied') {
        return { ...base, ...resolution } as ManagementResult;
      }

      const task = resolution.task!;
      base.affectedTaskId = task.id;

      // Check transition validity
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

      // Apply mutation
      if (action === 'prioritize') {
        return this.applyPrioritize(task, goal, base);
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

  private resolveTarget(goal: GoalTagV1): {
    decision: ManagementDecision;
    task?: Task;
    candidates?: string[];
    reason?: string;
    targetQuery: string;
    action: string;
  } {
    const action = goal.action;
    const targetQuery = goal.target || '';

    // Path 1: explicit ID
    if (goal.targetId) {
      const task = this.taskStore.getTask(goal.targetId);
      if (!task) {
        return {
          decision: 'target_not_found',
          targetQuery,
          action,
          reason: `no task with id '${goal.targetId}'`,
        };
      }
      return { decision: 'applied', task, targetQuery, action };
    }

    // Path 2: slug-based matching (single-candidate only)
    const query = targetQuery.toLowerCase().replace(/_/g, ' ').trim();
    if (!query) {
      return {
        decision: 'target_not_found',
        targetQuery,
        action,
        reason: 'no target identifier or query provided',
      };
    }

    const querySlug = slugify(query);
    const manageable = this.taskStore.getTasks({
      status: ['pending', 'active', 'paused', 'pending_planning'],
    });

    const candidates: Task[] = [];
    for (const task of manageable) {
      if (task.id === query || task.id === querySlug) {
        candidates.push(task);
        continue;
      }
      const titleSlug = slugify(task.title);
      if (titleSlug === querySlug) {
        candidates.push(task);
        continue;
      }
      // Partial match: slug contains query
      if (titleSlug.includes(querySlug) || querySlug.includes(titleSlug)) {
        candidates.push(task);
      }
    }

    if (candidates.length === 0) {
      return {
        decision: 'target_not_found',
        targetQuery,
        action,
        reason: `no matching tasks for query '${query}'`,
      };
    }

    if (candidates.length === 1) {
      return { decision: 'applied', task: candidates[0], targetQuery, action };
    }

    return {
      decision: 'needs_disambiguation',
      candidates: candidates.map(t => t.id),
      targetQuery,
      action,
      reason: `${candidates.length} candidates match '${query}': ${candidates.map(t => t.id).join(', ')}`,
    };
  }

  // -------------------------------------------------------------------------
  // Prioritize
  // -------------------------------------------------------------------------

  private applyPrioritize(
    task: Task,
    goal: GoalTagV1,
    base: Partial<ManagementResult>,
  ): ManagementResult {
    const previousPriority = task.priority;
    let newPriority: number;

    if (goal.amount !== null) {
      // Explicit amount sets priority directly (clamped 0..1)
      newPriority = Math.max(0, Math.min(1, goal.amount));
    } else {
      // Default boost: increase by 0.2, clamped to 1
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
