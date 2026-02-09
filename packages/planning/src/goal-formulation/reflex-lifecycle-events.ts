/**
 * Reflex Lifecycle Events — Observability for Autonomy Reflexes
 *
 * Typed events for tracking the hunger driveshaft (and future reflexes)
 * through the goal-formulation → task-creation → execution → verification pipeline.
 *
 * Distinct from goals/goal-lifecycle-events.ts which tracks GoalResolver events.
 * These events track the reflex pipeline specifically.
 *
 * @author @darianrosebrook
 */

import type { ContentHash } from '../sterling/solve-bundle-types';

// ============================================================================
// Event Types
// ============================================================================

export type ReflexLifecycleEvent =
  | ReflexGoalFormulatedEvent
  | ReflexTaskCreatedEvent
  | ReflexStepCompletedEvent
  | ReflexGoalVerifiedEvent
  | ReflexGoalClosedEvent;

export interface ReflexGoalFormulatedEvent {
  type: 'goal_formulated';
  goal_id: string;
  need_type: string;
  trigger_digest: ContentHash;
  candidates_digest: ContentHash;
  ts: number;
}

export interface ReflexTaskCreatedEvent {
  type: 'task_created';
  task_id: string;
  goal_id: string;
  ts: number;
}

export interface ReflexStepCompletedEvent {
  type: 'step_completed';
  task_id: string;
  step_id: string;
  receipt: Record<string, unknown>;
  ts: number;
}

export interface ReflexGoalVerifiedEvent {
  type: 'goal_verified';
  goal_id: string;
  verification_digest: ContentHash;
  ts: number;
}

export interface ReflexGoalClosedEvent {
  type: 'goal_closed';
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
 * In-memory bounded collector for reflex lifecycle events.
 * Events are append-only with a max capacity to prevent unbounded growth.
 */
export class RecordingLifecycleEmitter implements ReflexLifecycleEmitter {
  private events: ReflexLifecycleEvent[] = [];
  private maxSize: number;

  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  emit(event: ReflexLifecycleEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxSize) {
      this.events = this.events.slice(-this.maxSize);
    }
  }

  getEvents(): ReflexLifecycleEvent[] {
    return [...this.events];
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
