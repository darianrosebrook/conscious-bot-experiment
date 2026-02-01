/**
 * Activation Reactor
 *
 * Event-driven reactor that decides which goal-bound tasks to activate
 * based on relevance scoring, budgets, and hysteresis.
 *
 * Budgets (per tick / per minute):
 * - MAX_RECONSIDER_PER_TICK: max 3 goals evaluated per tick
 * - MAX_REACTIVATE_PER_MINUTE: max 2 goals reactivated per minute
 *
 * Hysteresis:
 * - After a task is deactivated (paused), it enters a cooldown period
 *   (REACTIVATION_COOLDOWN_MS) before it can be reconsidered.
 * - This prevents activation storms (rapid pause/resume cycles).
 *
 * The reactor is passive (called per tick), not a background loop.
 * The caller (executor, periodic reconciler) drives the reactor.
 *
 * @see docs/internal/goal-binding-protocol.md §F
 */

import type { Task } from '../types/task';
import type { GoalBinding } from './goal-binding-types';
import { isManuallyPaused } from './goal-hold-manager';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max goals reconsidered per reactor tick */
export const MAX_RECONSIDER_PER_TICK = 3;

/** Max goals reactivated per minute */
export const MAX_REACTIVATE_PER_MINUTE = 2;

/** Cooldown after deactivation before reactivation (30 seconds) */
export const REACTIVATION_COOLDOWN_MS = 30 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivationContext {
  /** Current bot position */
  botPosition: { x: number; y: number; z: number };
  /** Current time (injectable for testing) */
  now?: number;
  /** Active task IDs (tasks currently being worked on) */
  activeTaskIds: Set<string>;
}

export interface ActivationCandidate {
  task: Task;
  binding: GoalBinding;
  relevanceScore: number;
}

export type ActivationDecision =
  | { action: 'activate'; taskId: string; reason: string }
  | { action: 'skip'; taskId: string; reason: string };

export interface ReactorTickResult {
  considered: number;
  activated: string[];
  skipped: Array<{ taskId: string; reason: string }>;
  budgetExhausted: boolean;
}

// ---------------------------------------------------------------------------
// Relevance scoring
// ---------------------------------------------------------------------------

/**
 * Compute relevance score for a paused/pending goal-bound task.
 * Higher score = more relevant = should be activated first.
 *
 * Factors:
 * - Priority (0-1, weight 0.4)
 * - Urgency (0-1, weight 0.3)
 * - Progress (0-1, weight 0.2) — prefer tasks closer to completion
 * - Proximity (0-1, weight 0.1) — prefer nearby goals
 */
export function computeRelevance(
  task: Task,
  binding: GoalBinding,
  ctx: ActivationContext,
): number {
  const proximity = computeProximityScore(binding, ctx.botPosition);
  return (
    task.priority * 0.4 +
    task.urgency * 0.3 +
    task.progress * 0.2 +
    proximity * 0.1
  );
}

function computeProximityScore(
  binding: GoalBinding,
  botPosition: { x: number; y: number; z: number },
): number {
  const MAX_DIST = 128;
  let pos: { x: number; y: number; z: number } | undefined;

  if (binding.anchors.siteSignature) {
    pos = binding.anchors.siteSignature.position;
  } else if (binding.anchors.regionHint) {
    pos = binding.anchors.regionHint;
  }

  if (!pos) return 0;

  const dx = pos.x - botPosition.x;
  const dy = pos.y - botPosition.y;
  const dz = pos.z - botPosition.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return Math.max(0, 1 - dist / MAX_DIST);
}

// ---------------------------------------------------------------------------
// Reactor state
// ---------------------------------------------------------------------------

export class ActivationReactor {
  /** Tracks when tasks were last deactivated (for cooldown) */
  private deactivatedAt = new Map<string, number>();

  /** Tracks reactivation timestamps for rate limiting */
  private reactivationLog: number[] = [];

  /**
   * Run one reactor tick.
   *
   * Evaluates paused/pending goal-bound tasks and decides which to activate,
   * respecting budgets and cooldowns.
   *
   * @param allTasks - All tasks in the store
   * @param ctx - Activation context (bot position, current time, active tasks)
   * @returns Tick result with decisions
   */
  tick(allTasks: Task[], ctx: ActivationContext): ReactorTickResult {
    const now = ctx.now ?? Date.now();
    const result: ReactorTickResult = {
      considered: 0,
      activated: [],
      skipped: [],
      budgetExhausted: false,
    };

    // Prune old reactivation log entries (older than 1 minute)
    this.reactivationLog = this.reactivationLog.filter(
      (t) => now - t < 60_000
    );

    // Collect candidates: paused or pending goal-bound tasks not currently active
    const candidates = this.collectCandidates(allTasks, ctx, now);

    // Sort by relevance (highest first)
    candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Evaluate up to MAX_RECONSIDER_PER_TICK candidates
    for (const candidate of candidates) {
      if (result.considered >= MAX_RECONSIDER_PER_TICK) {
        result.budgetExhausted = true;
        break;
      }

      result.considered++;
      const decision = this.evaluateCandidate(candidate, now);

      if (decision.action === 'activate') {
        result.activated.push(candidate.task.id);
        this.reactivationLog.push(now);
      } else {
        result.skipped.push({ taskId: candidate.task.id, reason: decision.reason });
      }
    }

    return result;
  }

  /**
   * Record that a task was deactivated (paused/held).
   * Starts the cooldown timer.
   */
  recordDeactivation(taskId: string, now?: number): void {
    this.deactivatedAt.set(taskId, now ?? Date.now());
  }

  /**
   * Clear deactivation record (e.g., on task completion/failure).
   */
  clearDeactivation(taskId: string): void {
    this.deactivatedAt.delete(taskId);
  }

  /**
   * Check reactivation budget: how many reactivations remain this minute.
   */
  remainingReactivations(now?: number): number {
    const currentTime = now ?? Date.now();
    const recent = this.reactivationLog.filter(
      (t) => currentTime - t < 60_000
    );
    return Math.max(0, MAX_REACTIVATE_PER_MINUTE - recent.length);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private collectCandidates(
    allTasks: Task[],
    ctx: ActivationContext,
    now: number,
  ): ActivationCandidate[] {
    const candidates: ActivationCandidate[] = [];

    for (const task of allTasks) {
      const binding = task.metadata.goalBinding as GoalBinding | undefined;
      if (!binding) continue;

      // Only consider paused or pending tasks
      if (task.status !== 'paused' && task.status !== 'pending') continue;

      // Skip already-active tasks
      if (ctx.activeTaskIds.has(task.id)) continue;

      // Skip manually paused tasks (hard wall)
      if (isManuallyPaused(task)) continue;

      // Skip tasks in cooldown
      const deactivatedTime = this.deactivatedAt.get(task.id);
      if (deactivatedTime && now - deactivatedTime < REACTIVATION_COOLDOWN_MS) {
        continue;
      }

      const relevanceScore = computeRelevance(task, binding, ctx);
      candidates.push({ task, binding, relevanceScore });
    }

    return candidates;
  }

  private evaluateCandidate(
    candidate: ActivationCandidate,
    now: number,
  ): ActivationDecision {
    // Check reactivation rate limit
    const recentCount = this.reactivationLog.filter(
      (t) => now - t < 60_000
    ).length;
    if (recentCount >= MAX_REACTIVATE_PER_MINUTE) {
      return {
        action: 'skip',
        taskId: candidate.task.id,
        reason: 'reactivation rate limit exceeded',
      };
    }

    // Check hold nextReviewAt — only activate if review is due
    if (candidate.binding.hold) {
      if (now < candidate.binding.hold.nextReviewAt) {
        return {
          action: 'skip',
          taskId: candidate.task.id,
          reason: 'hold not yet due for review',
        };
      }
    }

    return {
      action: 'activate',
      taskId: candidate.task.id,
      reason: `relevance=${candidate.relevanceScore.toFixed(3)}`,
    };
  }
}
