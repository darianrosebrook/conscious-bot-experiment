/**
 * Reflex Registry — Single evaluation entry point for all autonomy reflexes.
 *
 * Collapses the two duplicated injection sites in modular-server.ts
 * (critical preemption + idle evaluation) into one `evaluateTick()` call.
 * Adding a new reflex requires registering it here — zero changes to
 * modular-server.ts wiring.
 *
 * Design decisions:
 *   (P1) Single evaluateTick() — at most one enqueue per tick
 *   (P4) Completion dispatch — routes to correct controller by builderName
 *   (P8) DryRun contract — evaluate yes, enqueue/mutate no
 *
 * @author @darianrosebrook
 */

import type { CachedBotState } from './bot-state-cache';
import type { BotStateCache } from './bot-state-cache';
import type { IdleReason } from '../modular-server';
import type { ReflexLifecycleEvent, EnqueueSkipReasonType } from './reflex-lifecycle-events';
import { tryEnqueueReflexTaskGeneric, type ReflexEnqueueResult } from './reflex-enqueue';

// ============================================================================
// Base Types
// ============================================================================

/**
 * Every controller's evaluate() must return this shape (or null).
 * This is the contract between any reflex controller and the registry.
 */
export interface BaseReflexResult {
  goalKey: string;
  reflexInstanceId: string;
  /** Used for taskProvenance.builder + completion dispatch routing */
  builderName: string;
  taskData: {
    title: string;
    description: string;
    type: string;
    priority: number;
    urgency: number;
    source: 'autonomous';
    steps: Array<{
      id: string;
      label: string;
      done: boolean;
      order: number;
      meta: {
        leaf: string;
        args: Record<string, unknown>;
        executable: boolean;
      };
    }>;
  };
  proofAccumulator?: { goalId: string };
}

/**
 * A registered reflex controller.
 */
export interface RegisteredReflex {
  name: string;
  /** Lower number = higher priority. Evaluated first. */
  priority: number;
  /** Can fire when idleReason === null (not idle)? */
  canPreempt: boolean;
  /** Builder name for completion dispatch routing. Must match BaseReflexResult.builderName. */
  builderName?: string;
  evaluate: (
    botState: CachedBotState,
    idleReason: IdleReason | null,
    opts: { dryRun: boolean },
  ) => Promise<BaseReflexResult | null>;
  onEnqueued: (reflexInstanceId: string, taskId: string, goalId: string) => void;
  onSkipped: (
    reflexInstanceId: string,
    goalId: string,
    reason: EnqueueSkipReasonType,
    existingTaskId?: string,
  ) => void;
  /** (P4) Called when a task produced by this reflex completes/fails. */
  onTaskTerminal?: (task: any, botStateAfter: CachedBotState | null) => void;
}

export interface EvaluateTickResult {
  fired: boolean;
  reflexName?: string;
  taskId?: string;
}

// ============================================================================
// Registry
// ============================================================================

export class ReflexRegistry {
  private reflexes: RegisteredReflex[] = [];
  private botStateCache: BotStateCache;

  constructor(botStateCache: BotStateCache) {
    this.botStateCache = botStateCache;
  }

  /** Register a reflex controller. Sorts by priority (lower = higher). */
  register(reflex: RegisteredReflex): void {
    this.reflexes.push(reflex);
    this.reflexes.sort((a, b) => a.priority - b.priority);
  }

  /** Get all registered reflexes (for diagnostics). */
  getRegistered(): RegisteredReflex[] {
    return [...this.reflexes];
  }

  /**
   * (P1) Single evaluation entry point. Called ONCE per tick.
   * Internally handles both preemption and idle contexts.
   * Enforces "at most one enqueue per tick" — short-circuits after first fire.
   *
   * When not idle (idleReason === null): only canPreempt reflexes are evaluated.
   * When idle: ALL reflexes are evaluated in priority order.
   *
   * (P8) DryRun: evaluate is called normally, but enqueue/guard/emit are skipped.
   * Short-circuits after first non-null evaluate result in dryRun too.
   */
  async evaluateTick(
    idleReason: IdleReason | null,
    addTask: (data: Record<string, unknown>) => Promise<any>,
    getTasks: (filters?: { status?: string[] }) => any[],
    opts: { dryRun: boolean },
  ): Promise<EvaluateTickResult> {
    const botState = await this.botStateCache.get();
    if (!botState) {
      // Fail-closed: unknown state → no fire
      return { fired: false };
    }

    // Determine which reflexes to evaluate based on idle state
    const candidates = idleReason === null
      ? this.reflexes.filter((r) => r.canPreempt)
      : this.reflexes; // All reflexes when idle, already sorted by priority

    for (const reflex of candidates) {
      try {
        const result = await reflex.evaluate(botState, idleReason, { dryRun: opts.dryRun });
        if (!result) continue;

        // In dryRun, short-circuit but don't enqueue
        if (opts.dryRun) {
          return { fired: true, reflexName: reflex.name };
        }

        // Live mode: guard + enqueue
        const enqueueResult = await tryEnqueueReflexTaskGeneric(
          addTask,
          result,
          getTasks,
        );

        if (enqueueResult.kind === 'enqueued') {
          const goalId = result.proofAccumulator?.goalId ?? result.goalKey;
          reflex.onEnqueued(result.reflexInstanceId, enqueueResult.taskId, goalId);
          return { fired: true, reflexName: reflex.name, taskId: enqueueResult.taskId };
        } else {
          const goalId = result.proofAccumulator?.goalId ?? result.goalKey;
          reflex.onSkipped(result.reflexInstanceId, goalId, enqueueResult.reason);
          // Short-circuit: even a skipped result counts as "this tick's reflex attempt"
          return { fired: false, reflexName: reflex.name };
        }
      } catch (error) {
        // Error isolation: one reflex throwing does not prevent next from evaluating
        console.warn(`[ReflexRegistry] ${reflex.name} threw during evaluate:`, error);
        continue;
      }
    }

    return { fired: false };
  }

  /**
   * (P4) Completion dispatch. Called from task lifecycle hook.
   * Routes to the correct controller's onTaskTerminal based on builderName.
   * Unknown builderName is silently ignored (no throw).
   */
  onTaskTerminal(task: any, botStateAfter: CachedBotState | null): void {
    const builder = task?.metadata?.taskProvenance?.builder;
    if (!builder) return;

    for (const reflex of this.reflexes) {
      if (reflex.builderName === builder && reflex.onTaskTerminal) {
        try {
          reflex.onTaskTerminal(task, botStateAfter);
        } catch (error) {
          console.warn(`[ReflexRegistry] ${reflex.name}.onTaskTerminal threw:`, error);
        }
        return; // First match wins
      }
    }
    // Unknown builder — silently ignored
  }
}
