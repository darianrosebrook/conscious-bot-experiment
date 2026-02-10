/**
 * Reflex Lifecycle Events — Observability for Autonomy Reflexes
 *
 * Typed events for tracking the hunger driveshaft (and future reflexes)
 * through the goal-formulation → task-creation → execution → verification pipeline.
 *
 * Every event carries `reflexInstanceId` (UUID per-emission) so an operator
 * can join all events for a single reflex firing without guessing.
 *
 * Event semantics:
 *   goal_formulated       — pipeline selected a goal (trigger time)
 *   task_planned           — controller decided to inject a task (trigger time, pending ID)
 *   task_enqueued          — addTask() returned a real task ID (integration time)
 *   task_enqueue_skipped   — addTask() did NOT yield a task (dedup, failure, null)
 *   step_completed         — a leaf step finished executing
 *   goal_verified          — proof verification ran (completion time)
 *   goal_closed            — proof bundle assembled, lifecycle done (completion time)
 *
 * Distinct from goals/goal-lifecycle-events.ts which tracks GoalResolver events.
 *
 * @author @darianrosebrook
 */

import type { ContentHash } from '../sterling/solve-bundle-types';

// ============================================================================
// Event Types
// ============================================================================

export type ReflexLifecycleEvent =
  | ReflexGoalFormulatedEvent
  | ReflexTaskPlannedEvent
  | ReflexTaskEnqueuedEvent
  | ReflexTaskEnqueueSkippedEvent
  | ReflexStepCompletedEvent
  | ReflexGoalVerifiedEvent
  | ReflexGoalClosedEvent;

export interface ReflexGoalFormulatedEvent {
  type: 'goal_formulated';
  reflexInstanceId: string;
  goal_id: string;
  need_type: string;
  trigger_digest: ContentHash;
  candidates_digest: ContentHash;
  ts: number;
}

/**
 * Emitted at evaluate() time when the controller decides to inject a task.
 * task_id is a placeholder (`pending-{reflexInstanceId.slice(0,8)}`) because
 * the real ID isn't known until addTask() returns in the integration layer.
 *
 * In shadow mode, this event is NOT emitted — no task will be enqueued.
 * In live mode, a corresponding `task_enqueued` event follows with the real ID.
 */
export interface ReflexTaskPlannedEvent {
  type: 'task_planned';
  reflexInstanceId: string;
  /** Placeholder ID — use reflexInstanceId for joining, not this */
  task_id: string;
  goal_id: string;
  ts: number;
}

/**
 * Emitted after addTask() returns in the integration layer (modular-server.ts).
 * Carries the real task ID assigned by the executor.
 */
export interface ReflexTaskEnqueuedEvent {
  type: 'task_enqueued';
  reflexInstanceId: string;
  /** Real task ID from addTask() response */
  task_id: string;
  goal_id: string;
  ts: number;
}

/**
 * Closed enum of reasons why addTask() did not yield a new task.
 * Emitted by the integration layer when enqueue doesn't produce a real task ID.
 */
export const EnqueueSkipReason = {
  /** findSimilarTask() found an existing pending/active task with same provenance */
  DEDUPED_EXISTING_TASK: 'deduped_existing_task',
  /** addTask() threw an exception */
  ENQUEUE_FAILED: 'enqueue_failed',
  /** addTask() returned null/undefined/no id */
  ENQUEUE_RETURNED_NULL: 'enqueue_returned_null',
} as const;

export type EnqueueSkipReasonType = typeof EnqueueSkipReason[keyof typeof EnqueueSkipReason];

/**
 * Emitted by the integration layer when addTask() does NOT yield a new task ID.
 * Makes "planned but not enqueued" unambiguous — the operator can see WHY.
 *
 * On this event, the integration layer should also evict the accumulator
 * for this reflexInstanceId, since no completion event will ever arrive.
 */
export interface ReflexTaskEnqueueSkippedEvent {
  type: 'task_enqueue_skipped';
  reflexInstanceId: string;
  goal_id: string;
  reason: EnqueueSkipReasonType;
  /** If deduped, the ID of the existing task (if available) */
  existing_task_id?: string;
  ts: number;
}

export interface ReflexStepCompletedEvent {
  type: 'step_completed';
  reflexInstanceId: string;
  task_id: string;
  step_id: string;
  receipt: Record<string, unknown>;
  ts: number;
}

export interface ReflexGoalVerifiedEvent {
  type: 'goal_verified';
  reflexInstanceId: string;
  goal_id: string;
  verification_digest: ContentHash;
  ts: number;
}

export interface ReflexGoalClosedEvent {
  type: 'goal_closed';
  reflexInstanceId: string;
  goal_id: string;
  success: boolean;
  reason: string;
  bundle_hash: ContentHash;
  ts: number;
}

// ============================================================================
// Emitter Interface + Recording Implementation
// ============================================================================

export interface ReflexLifecycleEmitter {
  emit(event: ReflexLifecycleEvent): void;
  getEvents(): ReflexLifecycleEvent[];
}

/**
 * In-memory ring-buffer collector for reflex lifecycle events.
 * Events are append-only with a max capacity to prevent unbounded growth.
 *
 * (P6) Supports `since` + `limit` pagination for the soak harness endpoint.
 */
export class RecordingLifecycleEmitter implements ReflexLifecycleEmitter {
  private events: ReflexLifecycleEvent[] = [];
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  emit(event: ReflexLifecycleEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxSize) {
      // Ring buffer: drop oldest events
      this.events = this.events.slice(-this.maxSize);
    }
  }

  getEvents(): ReflexLifecycleEvent[] {
    return [...this.events];
  }

  /**
   * (P6) Paginated event access for HTTP endpoint.
   * Returns events with ts > since, limited to `limit` entries.
   */
  getEventsSince(since = 0, limit = 100): ReflexLifecycleEvent[] {
    const filtered = this.events.filter((e) => e.ts > since);
    return filtered.slice(0, limit);
  }

  getByType<T extends ReflexLifecycleEvent['type']>(
    type: T,
  ): Extract<ReflexLifecycleEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as any;
  }

  clear(): void {
    this.events = [];
  }
}
