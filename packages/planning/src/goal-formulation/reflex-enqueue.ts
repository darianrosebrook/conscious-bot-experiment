/**
 * Reflex Enqueue Helper — Structural Mutual Exclusion for Terminal Events
 *
 * Extracted from modular-server.ts so that:
 *   1. The "one task_planned → one terminal event" invariant is testable
 *      without importing the entire server bootstrap
 *   2. The discriminated union return type makes double-emit structurally
 *      impossible (no boolean guards, no fall-through)
 *
 * @author @darianrosebrook
 */

import { EnqueueSkipReason, type EnqueueSkipReasonType } from './reflex-lifecycle-events';
import type { HungerDriveshaftResult } from './hunger-driveshaft-controller';
import type { BaseReflexResult } from './reflex-registry';
import { scanForOutstandingGoalKey } from './goalkey-guard';

// ============================================================================
// Discriminated Result Type
// ============================================================================

/**
 * Discriminated result from attempting to enqueue a reflex task.
 * Exactly one variant per attempt — no ambiguity, no double-emit.
 *
 * - `enqueued`: addTask() succeeded and returned a usable task ID
 * - `skipped`: addTask() threw, returned null, or returned an object without .id
 *
 * The `error` field on `skipped` preserves the caught exception for logging
 * without exposing it in the event stream (which uses the closed vocabulary).
 */
export type ReflexEnqueueResult =
  | { kind: 'enqueued'; taskId: string }
  | { kind: 'skipped'; reason: EnqueueSkipReasonType; error?: unknown };

// ============================================================================
// Helper
// ============================================================================

/**
 * Attempt to enqueue a reflex task via addTask(), returning a discriminated result.
 *
 * This helper exists to make the "one planned → one terminal event" invariant
 * structural rather than stateful. The caller emits exactly one terminal event
 * based on `result.kind` — there is no boolean guard to accidentally bypass.
 *
 * @param addTask - The task integration's addTask function (dependency-injected)
 * @param reflexResult - The result from HungerDriveshaftController.evaluate()
 */
export async function tryEnqueueReflexTask(
  addTask: (data: Record<string, unknown>) => Promise<any>,
  reflexResult: HungerDriveshaftResult,
): Promise<ReflexEnqueueResult> {
  let task: any;
  try {
    task = await addTask({
      ...reflexResult.taskData,
      metadata: {
        taskProvenance: {
          builder: 'hunger-driveshaft-controller',
          source: 'reflex',
          goalKey: reflexResult.goalKey,
          reflexInstanceId: reflexResult.reflexInstanceId,
        },
        goalKey: reflexResult.goalKey,
        reflexInstanceId: reflexResult.reflexInstanceId,
      },
    });
  } catch (err) {
    return { kind: 'skipped', reason: EnqueueSkipReason.ENQUEUE_FAILED, error: err };
  }

  if (task?.id) {
    return { kind: 'enqueued', taskId: task.id };
  }
  return { kind: 'skipped', reason: EnqueueSkipReason.ENQUEUE_RETURNED_NULL };
}

// ============================================================================
// Generic Helper (for ReflexRegistry)
// ============================================================================

/**
 * Generic version of tryEnqueueReflexTask that works with any BaseReflexResult.
 * Integrates the goalKey guard before enqueue, preventing duplicate task injection.
 *
 * @param addTask - The task integration's addTask function
 * @param result - A BaseReflexResult from any reflex controller
 * @param getTasks - Task store query function for goalKey guard
 * @param staleMs - Optional staleness threshold for the goalKey guard
 */
export async function tryEnqueueReflexTaskGeneric(
  addTask: (data: Record<string, unknown>) => Promise<any>,
  result: BaseReflexResult,
  getTasks: (filters?: { status?: string[] }) => any[],
  staleMs?: number,
): Promise<ReflexEnqueueResult> {
  // GoalKey guard: check for outstanding tasks with the same goalKey
  const guardResult = scanForOutstandingGoalKey(getTasks, result.goalKey, { staleMs });
  if (guardResult.kind === 'blocked') {
    return {
      kind: 'skipped',
      reason: EnqueueSkipReason.DEDUPED_EXISTING_TASK,
    };
  }

  let task: any;
  try {
    task = await addTask({
      ...result.taskData,
      metadata: {
        taskProvenance: {
          builder: result.builderName,
          source: 'reflex',
          goalKey: result.goalKey,
          reflexInstanceId: result.reflexInstanceId,
        },
        goalKey: result.goalKey,
        reflexInstanceId: result.reflexInstanceId,
      },
    });
  } catch (err) {
    return { kind: 'skipped', reason: EnqueueSkipReason.ENQUEUE_FAILED, error: err };
  }

  if (task?.id) {
    return { kind: 'enqueued', taskId: task.id };
  }
  return { kind: 'skipped', reason: EnqueueSkipReason.ENQUEUE_RETURNED_NULL };
}
