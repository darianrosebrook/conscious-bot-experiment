/**
 * Sleep Driveshaft Controller — Stage 1: Sleep in Existing Bed
 *
 * Injects `sleep` tasks when the bot is idle at night with no nearby hostiles.
 * Stage 1 only: finds and sleeps in an existing nearby bed — no bed crafting
 * or placement. If no bed is nearby, the sleep leaf returns a graceful failure
 * (`{ success: false, error: { code: 'sleep.noBedFound' } }`).
 *
 * Design decisions:
 *   - Time-based hysteresis: arms at dusk (12542), disarms after sleeping or
 *     at dawn (23460), re-arms at next dusk
 *   - Follows the exploration driveshaft pattern (not hunger — sleep is simpler)
 *   - Does NOT call Sterling: locally decidable
 *   - Fail-closed: undefined timeOfDay → no fire
 *   - Safety preemption: task has navigationPriority: 'normal' — the safety
 *     monitor's 'emergency' lease (priority 2) preempts via NavigationLeaseManager
 *   - Stage 2 (bed crafting/placement) is a separate future producer
 *
 * Night range: Minecraft ticks 12542–23460 (from bot-state-translator.ts:140)
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

export interface SleepDriveshaftConfig {
  /** Minecraft tick at which night begins (default: 12542) */
  nightStartTick: number;
  /** Minecraft tick at which night ends / dawn (default: 23460) */
  nightEndTick: number;
  /** Maximum nearby hostiles allowed (default: 0 — no hostiles) */
  maxHostiles: number;
  /** Search radius for nearby beds in blocks (default: 16) */
  bedSearchRadius: number;
  /** Lifecycle event emitter */
  emitter?: ReflexLifecycleEmitter;
}

const DEFAULT_CONFIG: SleepDriveshaftConfig = {
  nightStartTick: 12542,
  nightEndTick: 23460,
  maxHostiles: 0,
  bedSearchRadius: 16,
};

// ============================================================================
// Controller
// ============================================================================

export class SleepDriveshaftController {
  private config: SleepDriveshaftConfig;
  private emitter?: ReflexLifecycleEmitter;

  /**
   * Hysteresis state:
   *  - armed: true when dusk detected (or initially)
   *  - firedThisNight: set to true after evaluate() emits a task, reset at dawn
   *  - lastNightCycle: tracks which night we're in to prevent double-fire
   */
  private armed = true;
  private firedThisNight = false;
  private lastDawnSeen = false;

  static readonly GOAL_KEY = 'survival:sleep';
  static readonly BUILDER_NAME = 'sleep-driveshaft-controller';

  constructor(config?: Partial<SleepDriveshaftConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.emitter = this.config.emitter;
  }

  /** Check if a Minecraft time tick is during night */
  isNight(timeOfDay: number): boolean {
    return timeOfDay >= this.config.nightStartTick && timeOfDay <= this.config.nightEndTick;
  }

  /** Get hysteresis state (for testing) */
  isArmed(): boolean {
    return this.armed;
  }

  /** Has fired this night cycle? (for testing) */
  hasFiredThisNight(): boolean {
    return this.firedThisNight;
  }

  async evaluate(
    botState: CachedBotState,
    idleReason: IdleReason | null,
    opts: { dryRun: boolean },
  ): Promise<BaseReflexResult | null> {

    // 1. Only fire on true idle (same pattern as exploration driveshaft)
    if (idleReason !== 'no_tasks') return null;

    // 2. Fail-closed: timeOfDay must be defined
    if (botState.timeOfDay === undefined || botState.timeOfDay === null) return null;

    const timeOfDay = botState.timeOfDay;
    const isNightNow = this.isNight(timeOfDay);

    // 3. Dawn detection → reset hysteresis for next night
    if (!isNightNow) {
      if (this.firedThisNight) {
        // Dawn after a night where we fired → reset for next cycle
        this.firedThisNight = false;
        this.armed = true;
      }
      this.lastDawnSeen = true;
      return null;
    }

    // 4. Dusk detection → arm if we've seen dawn since last fire
    if (isNightNow && this.lastDawnSeen) {
      this.lastDawnSeen = false;
      this.armed = true;
    }

    // 5. Hysteresis gate: only fire once per night cycle
    if (!this.armed || this.firedThisNight) return null;

    // 6. Safety gate: no hostiles nearby
    if ((botState.nearbyHostiles ?? 0) > this.config.maxHostiles) return null;

    // 7. Disarm and mark fired (unless dryRun)
    if (!opts.dryRun) {
      this.armed = false;
      this.firedThisNight = true;
    }

    // 8. Per-emission join key
    const reflexInstanceId = randomUUID();
    const goalKey = SleepDriveshaftController.GOAL_KEY;

    // 9. Emit lifecycle events
    this.emitter?.emit({
      type: 'goal_formulated',
      reflexInstanceId,
      goal_id: goalKey,
      need_type: 'survival',
      trigger_digest: '' as any, // Not content-addressed (time-based trigger)
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

    // 10. Return BaseReflexResult with single sleep step
    //     Stage 1: placeBed=false — only find and sleep in existing beds
    return {
      goalKey,
      reflexInstanceId,
      builderName: SleepDriveshaftController.BUILDER_NAME,
      taskData: {
        title: 'Sleep (reflex)',
        description: 'Autonomous sleep reflex: find nearby bed and sleep through the night',
        type: 'survival',
        priority: 40, // Above exploration (30), below hunger when critical
        urgency: 0.3,
        source: 'autonomous',
        steps: [{
          id: `step-sleep-${reflexInstanceId.slice(0, 8)}`,
          label: 'Sleep in nearby bed',
          done: false,
          order: 0,
          meta: {
            leaf: 'sleep',
            args: { placeBed: false, searchRadius: this.config.bedSearchRadius },
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
  }
}
