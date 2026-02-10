/**
 * Exploration Driveshaft Controller — Idle Behavioral Bootstrap
 *
 * Injects `move_to` tasks when the bot is idle (no_tasks) for too long.
 * Walking creates exhaustion, which drains food, which eventually triggers
 * the hunger reflex — breaking the "no movement → no hunger → no tasks" loop.
 *
 * Design decisions:
 *   - Episode-based hysteresis (distinct from hunger's state-based)
 *   - NOT content-addressed: exploration target is random, so hashing would
 *     produce different IDs every time. proofAccumulator.goalId is instance
 *     identity, not content identity.
 *   - Does NOT call Sterling: locally decidable, like hunger's eat_immediate
 *   - Fail-closed: null/undefined position, health, or food → no fire (P2)
 *
 * @author @darianrosebrook
 */

import { randomUUID } from 'crypto';
import type { CachedBotState } from './bot-state-cache';
import type { IdleReason } from '../modular-server';
import type { ReflexLifecycleEmitter } from './reflex-lifecycle-events';
import type { BaseReflexResult } from './reflex-registry';

// ============================================================================
// Config
// ============================================================================

export interface ExplorationConfig {
  /** Consecutive idle ticks before exploration fires (default: 6 = ~30s at 5s tick) */
  idleTriggerTicks: number;
  /** Consecutive non-idle ticks before resetting idle counter (default: 2 = ~10s) */
  idleResetTicks: number;
  /** Cooldown between exploration injections in ms (default: 120_000 = 2 min) */
  cooldownMs: number;
  /** Minimum health to explore (default: 14 out of 20) */
  minHealth: number;
  /** Minimum food to explore (default: 8 out of 20) */
  minFood: number;
  /** Maximum nearby hostiles to explore (default: 1) */
  maxHostiles: number;
  /** Minimum displacement in blocks (default: 8) */
  minDisplacement: number;
  /** Maximum displacement in blocks (default: 20) */
  maxDisplacement: number;
  /** Lifecycle event emitter */
  emitter?: ReflexLifecycleEmitter;
}

const DEFAULT_CONFIG: ExplorationConfig = {
  idleTriggerTicks: 6,
  idleResetTicks: 2,
  cooldownMs: 120_000,
  minHealth: 14,
  minFood: 8,
  maxHostiles: 1,
  minDisplacement: 8,
  maxDisplacement: 20,
};

// ============================================================================
// Evidence (NOT content-addressed)
// ============================================================================

export interface ExplorationEvidence {
  reflexInstanceId: string;
  triggeredAt: number;
  startPosition: { x: number; y: number; z: number } | null;
  targetPosition: { x: number; y: number; z: number };
  displacement: number;
  idleTicksAtTrigger: number;
  /** Populated on completion via onTaskTerminal */
  endPosition?: { x: number; y: number; z: number } | null;
  outcome?: 'completed' | 'failed' | 'timeout';
  durationMs?: number;
}

// ============================================================================
// Controller
// ============================================================================

/** Evidence retention limits */
const EVIDENCE_MAX_SIZE = 50;
const EVIDENCE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class ExplorationDriveshaftController {
  private config: ExplorationConfig;
  private armed = true;
  private lastFiredAt = 0;
  private consecutiveIdleTicks = 0;
  private consecutiveNonIdleTicks = 0;
  private evidence = new Map<string, ExplorationEvidence>();
  private emitter?: ReflexLifecycleEmitter;

  /** Static goalKey — only one exploration wander can be outstanding at a time */
  static readonly GOAL_KEY = 'explore:wander';
  static readonly BUILDER_NAME = 'exploration-driveshaft-controller';

  constructor(config?: Partial<ExplorationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.emitter = this.config.emitter;
  }

  // ──────────────────────────────────────────────
  // Tick tracking
  // ──────────────────────────────────────────────

  /**
   * Called every executor tick (even when evaluate isn't called).
   * Tracks consecutive idle/non-idle ticks and handles cooldown re-arming.
   */
  tick(isIdle: boolean): void {
    if (isIdle) {
      this.consecutiveIdleTicks++;
      this.consecutiveNonIdleTicks = 0;
    } else {
      this.consecutiveNonIdleTicks++;
      if (this.consecutiveNonIdleTicks >= this.config.idleResetTicks) {
        this.consecutiveIdleTicks = 0;
      }
    }

    // Re-arm when cooldown elapsed
    if (!this.armed && this.lastFiredAt > 0) {
      if (Date.now() - this.lastFiredAt >= this.config.cooldownMs) {
        this.armed = true;
      }
    }
  }

  // ──────────────────────────────────────────────
  // Evaluate
  // ──────────────────────────────────────────────

  async evaluate(
    botState: CachedBotState,
    idleReason: IdleReason | null,
    opts: { dryRun: boolean },
  ): Promise<BaseReflexResult | null> {
    this.evictStaleEvidence();

    // 1. Only fire on no_tasks
    if (idleReason !== 'no_tasks') return null;

    // 2. (P2) Fail-closed: require position, health, food all defined
    if (botState.position === undefined) return null;
    if (botState.health === undefined) return null;
    if (botState.food === undefined) return null;

    // 3. Hysteresis gate
    if (!this.armed) return null;

    // 4. Idle tick threshold
    if (this.consecutiveIdleTicks < this.config.idleTriggerTicks) return null;

    // 5. Safety gates
    if (botState.health < this.config.minHealth) return null;
    if (botState.food < this.config.minFood) return null;
    if ((botState.nearbyHostiles ?? 0) > this.config.maxHostiles) return null;

    // 6. Compute random target
    const angle = Math.random() * 2 * Math.PI;
    const dist = this.config.minDisplacement +
      Math.random() * (this.config.maxDisplacement - this.config.minDisplacement);
    const target = {
      x: Math.round(botState.position.x + Math.cos(angle) * dist),
      y: botState.position.y,
      z: Math.round(botState.position.z + Math.sin(angle) * dist),
    };

    // 7. Static goalKey
    const goalKey = ExplorationDriveshaftController.GOAL_KEY;

    // 8. Per-emission join key
    const reflexInstanceId = randomUUID();

    // 9. Disarm (unless dryRun)
    if (!opts.dryRun) {
      this.armed = false;
      this.lastFiredAt = Date.now();
    }

    // 10. Store evidence (unless dryRun)
    if (!opts.dryRun) {
      this.evidence.set(reflexInstanceId, {
        reflexInstanceId,
        triggeredAt: Date.now(),
        startPosition: botState.position ? { ...botState.position } : null,
        targetPosition: target,
        displacement: dist,
        idleTicksAtTrigger: this.consecutiveIdleTicks,
      });
    }

    // 11. Emit lifecycle events
    this.emitter?.emit({
      type: 'goal_formulated',
      reflexInstanceId,
      goal_id: goalKey, // Instance identity, NOT content-addressed
      need_type: 'exploration',
      trigger_digest: '' as any, // Not content-addressed
      candidates_digest: '' as any,
      ts: Date.now(),
    });

    if (!opts.dryRun) {
      this.emitter?.emit({
        type: 'task_planned',
        reflexInstanceId,
        task_id: `pending-${reflexInstanceId.slice(0, 8)}`,
        goal_id: goalKey,
        ts: Date.now(),
      });
    }

    // 12. Return BaseReflexResult with single move_to step
    return {
      goalKey,
      reflexInstanceId,
      builderName: ExplorationDriveshaftController.BUILDER_NAME,
      taskData: {
        title: `Explore: move to (${target.x}, ${target.z})`,
        description: `Autonomous exploration: move to random nearby position to create exhaustion`,
        type: 'exploration',
        priority: 30, // Low priority — hunger and safety outrank
        urgency: 0.2,
        source: 'autonomous',
        steps: [{
          id: `step-explore-${reflexInstanceId.slice(0, 8)}`,
          label: `Move to (${target.x}, ${target.z})`,
          done: false,
          order: 0,
          meta: {
            leaf: 'move_to',
            args: { pos: { x: target.x, y: target.y, z: target.z } },
            executable: true,
          },
        }],
      },
      proofAccumulator: { goalId: goalKey },
    };
  }

  // ──────────────────────────────────────────────
  // Lifecycle event bridges
  // ──────────────────────────────────────────────

  emitTaskEnqueued(reflexInstanceId: string, taskId: string, goalId: string): void {
    this.emitter?.emit({
      type: 'task_enqueued',
      reflexInstanceId,
      task_id: taskId,
      goal_id: goalId,
      ts: Date.now(),
    });
  }

  emitTaskEnqueueSkipped(
    reflexInstanceId: string,
    goalId: string,
    reason: string,
    existingTaskId?: string,
  ): void {
    this.emitter?.emit({
      type: 'task_enqueue_skipped',
      reflexInstanceId,
      goal_id: goalId,
      reason: reason as any,
      existing_task_id: existingTaskId,
      ts: Date.now(),
    });

    // Evict evidence since no completion will arrive
    this.evidence.delete(reflexInstanceId);
  }

  // ──────────────────────────────────────────────
  // Task terminal handler
  // ──────────────────────────────────────────────

  onTaskTerminal(task: any, botStateAfter: CachedBotState | null): void {
    const reflexInstanceId = task?.metadata?.reflexInstanceId as string | undefined;
    if (!reflexInstanceId) return;

    const ev = this.evidence.get(reflexInstanceId);
    if (!ev) return;

    ev.endPosition = botStateAfter?.position ? { ...botStateAfter.position } : null;
    ev.outcome = task.status === 'completed' ? 'completed' : 'failed';
    ev.durationMs = Date.now() - ev.triggeredAt;

    // Evidence stays in map for golden-run recording; evicted by TTL or capacity
  }

  // ──────────────────────────────────────────────
  // Evidence access
  // ──────────────────────────────────────────────

  getEvidence(reflexInstanceId: string): ExplorationEvidence | undefined {
    return this.evidence.get(reflexInstanceId);
  }

  getAllEvidence(): ExplorationEvidence[] {
    return [...this.evidence.values()];
  }

  /**
   * Remove evidence by reflexInstanceId. Called after golden-run recording.
   */
  evictEvidence(reflexInstanceId: string): void {
    this.evidence.delete(reflexInstanceId);
  }

  // ──────────────────────────────────────────────
  // Diagnostics
  // ──────────────────────────────────────────────

  isArmed(): boolean {
    return this.armed;
  }

  getIdleTicks(): number {
    return this.consecutiveIdleTicks;
  }

  getConfig(): ExplorationConfig {
    return { ...this.config };
  }

  // ──────────────────────────────────────────────
  // Evidence retention (P6)
  // ──────────────────────────────────────────────

  private evictStaleEvidence(): void {
    const now = Date.now();
    for (const [key, ev] of this.evidence) {
      if (now - ev.triggeredAt > EVIDENCE_TTL_MS) {
        this.evidence.delete(key);
      }
    }
    // Enforce max size: evict oldest first
    if (this.evidence.size > EVIDENCE_MAX_SIZE) {
      const entries = [...this.evidence.entries()]
        .sort((a, b) => a[1].triggeredAt - b[1].triggeredAt);
      const toEvict = entries.length - EVIDENCE_MAX_SIZE;
      for (let i = 0; i < toEvict; i++) {
        this.evidence.delete(entries[i][0]);
      }
    }
  }
}
