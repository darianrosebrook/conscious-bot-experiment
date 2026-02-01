/**
 * Goal Lifecycle Events — Structured Observability
 *
 * Structured events emitted during goal-binding lifecycle transitions.
 * These events are designed for:
 * - Debugging: trace the full lifecycle of a goal from creation to completion
 * - Monitoring: detect anomalies (stuck holds, drift, activation storms)
 * - Audit: record provenance of every state change
 *
 * Events are passive (no side effects). Callers decide whether to log,
 * emit via EventEmitter, send to a telemetry backend, etc.
 *
 * @see docs/internal/goal-binding-protocol.md §J
 */

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface GoalLifecycleEventBase {
  /** Monotonic event ID (caller assigns) */
  eventId?: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Task ID involved */
  taskId: string;
  /** Goal instance ID (from goalBinding) */
  goalInstanceId?: string;
  /** Goal type */
  goalType?: string;
}

export interface GoalCreatedEvent extends GoalLifecycleEventBase {
  type: 'goal_created';
  goalKey: string;
  verifier: string;
}

export interface GoalResolvedEvent extends GoalLifecycleEventBase {
  type: 'goal_resolved';
  action: 'continue' | 'already_satisfied' | 'created';
  goalKey: string;
  score?: number;
}

export interface GoalAnchoredEvent extends GoalLifecycleEventBase {
  type: 'goal_anchored';
  oldGoalKey: string;
  newGoalKey: string;
  refCorner: { x: number; y: number; z: number };
  facing: string;
}

export interface GoalHoldAppliedEvent extends GoalLifecycleEventBase {
  type: 'goal_hold_applied';
  holdReason: string;
  nextReviewAt: number;
}

export interface GoalHoldClearedEvent extends GoalLifecycleEventBase {
  type: 'goal_hold_cleared';
  previousReason: string;
  wasManual: boolean;
}

export interface GoalActivatedEvent extends GoalLifecycleEventBase {
  type: 'goal_activated';
  relevanceScore: number;
}

export interface GoalPreemptedEvent extends GoalLifecycleEventBase {
  type: 'goal_preempted';
  budgetSteps: number;
  budgetTimeMs: number;
}

export interface GoalVerificationEvent extends GoalLifecycleEventBase {
  type: 'goal_verification';
  verifier: string;
  passed: boolean;
  consecutivePasses: number;
  score?: number;
  blockers?: string[];
}

export interface GoalCompletedEvent extends GoalLifecycleEventBase {
  type: 'goal_completed';
  passes: number;
  durationMs?: number;
}

export interface GoalRegressionEvent extends GoalLifecycleEventBase {
  type: 'goal_regression';
  previousPasses: number;
  blockers: string[];
}

export interface GoalDriftDetectedEvent extends GoalLifecycleEventBase {
  type: 'goal_drift_detected';
  goalId: string;
  expectedGoalStatus: string;
  actualGoalStatus: string;
}

export interface GoalSyncEffectEvent extends GoalLifecycleEventBase {
  type: 'goal_sync_effect';
  effectType: string;
  reason?: string;
}

export type GoalLifecycleEvent =
  | GoalCreatedEvent
  | GoalResolvedEvent
  | GoalAnchoredEvent
  | GoalHoldAppliedEvent
  | GoalHoldClearedEvent
  | GoalActivatedEvent
  | GoalPreemptedEvent
  | GoalVerificationEvent
  | GoalCompletedEvent
  | GoalRegressionEvent
  | GoalDriftDetectedEvent
  | GoalSyncEffectEvent;

// ---------------------------------------------------------------------------
// Event collector
// ---------------------------------------------------------------------------

/**
 * Simple event collector for lifecycle events.
 * Can be used in tests or as a lightweight in-memory log.
 */
export class GoalLifecycleCollector {
  private events: GoalLifecycleEvent[] = [];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  emit(event: GoalLifecycleEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxSize) {
      this.events = this.events.slice(-this.maxSize);
    }
  }

  getAll(): GoalLifecycleEvent[] {
    return [...this.events];
  }

  getByType<T extends GoalLifecycleEvent['type']>(
    type: T,
  ): Extract<GoalLifecycleEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as any;
  }

  getByTask(taskId: string): GoalLifecycleEvent[] {
    return this.events.filter((e) => e.taskId === taskId);
  }

  clear(): void {
    this.events = [];
  }

  get size(): number {
    return this.events.length;
  }
}

// ---------------------------------------------------------------------------
// Event factory helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

export function goalCreatedEvent(
  taskId: string,
  goalInstanceId: string,
  goalType: string,
  goalKey: string,
  verifier: string,
): GoalCreatedEvent {
  return {
    type: 'goal_created',
    timestamp: now(),
    taskId,
    goalInstanceId,
    goalType,
    goalKey,
    verifier,
  };
}

export function goalResolvedEvent(
  taskId: string,
  action: 'continue' | 'already_satisfied' | 'created',
  goalKey: string,
  score?: number,
): GoalResolvedEvent {
  return {
    type: 'goal_resolved',
    timestamp: now(),
    taskId,
    action,
    goalKey,
    score,
  };
}

export function goalVerificationEvent(
  taskId: string,
  goalInstanceId: string,
  verifier: string,
  passed: boolean,
  consecutivePasses: number,
  score?: number,
  blockers?: string[],
): GoalVerificationEvent {
  return {
    type: 'goal_verification',
    timestamp: now(),
    taskId,
    goalInstanceId,
    verifier,
    passed,
    consecutivePasses,
    score,
    blockers,
  };
}

export function goalCompletedEvent(
  taskId: string,
  goalInstanceId: string,
  passes: number,
  durationMs?: number,
): GoalCompletedEvent {
  return {
    type: 'goal_completed',
    timestamp: now(),
    taskId,
    goalInstanceId,
    passes,
    durationMs,
  };
}

export function goalRegressionEvent(
  taskId: string,
  goalInstanceId: string,
  previousPasses: number,
  blockers: string[],
): GoalRegressionEvent {
  return {
    type: 'goal_regression',
    timestamp: now(),
    taskId,
    goalInstanceId,
    previousPasses,
    blockers,
  };
}
