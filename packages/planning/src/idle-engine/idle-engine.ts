/**
 * IdleEngine — asks Sterling for a goal when the planning executor is idle.
 *
 * Replaces the deleted keep-alive subsystem (see docs/planning/
 * run-doom-loop-working-spec.md Phase 1B closing note for the deletion
 * rationale). The old design layered a parallel LLM-based decision loop
 * on top of the executor's real task pipeline, producing shadow decisions
 * that competed with in-flight operations. IdleEngine is the cauterized
 * replacement:
 *
 * - No LLM call. Sterling's `_select_idle_goal()` is a deterministic
 *   priority ladder (vitals → safety → tool progression → exploration).
 *   IdleEngine is a thin courier that builds the Sterling request payload,
 *   awaits the response, and returns a decision.
 *
 * - No "thoughts." IdleEngine returns a `taskSeed: Partial<Task>` directly
 *   to the caller, which is expected to hand it to `taskIntegration
 *   .addTask()`. There is no cognition-side HTTP round trip and no
 *   thought-to-task converter involvement.
 *
 * - No cross-package type surface. IdleEngine lives entirely in the
 *   planning package. It consumes `SterlingLanguageIOClient` (the
 *   cognition-exported client class) via constructor injection but
 *   exports nothing back to cognition.
 *
 * - One cooldown, one latch, no lease keys or spatial buckets. The
 *   cooldown is anchored to "task creation confirmed," not "Sterling
 *   returned a goal" — the caller signals success via
 *   `acknowledgeTaskCreated(runId)` after `addTask()` resolves. This
 *   prevents silent dedupe rejections from consuming the cooldown budget.
 *
 * - Failure modes are decisions, not exceptions. The return type is a
 *   tagged union (`IdleGoalDecision`) so callers pattern-match rather
 *   than inspect optional fields.
 *
 * Design invariants (preserved from the deleted keep-alive's "pure
 * intention" — these are the parts worth keeping):
 *
 * - I-BOUNDARY-1: Sterling is the semantic authority. IdleEngine never
 *   chooses a goal; it only transports executor/bot state into Sterling
 *   and transports Sterling's decision back out.
 *
 * - I-AUTONOMY-OPTIONAL: "no policy" is a valid response. IdleEngine
 *   does not fabricate a goal when Sterling declines.
 *
 * - I-FIRE-ON-ELIGIBILITY: The caller is responsible for deciding when
 *   to call `requestGoal()`. IdleEngine assumes the executor already
 *   gated on idleReason ∈ {no_tasks, blocked_on_prereq}; it does not
 *   re-check eligibility.
 *
 * @author @darianrosebrook
 */

import {
  buildIdleEpisodePayload,
  type BotStateSnapshot,
  type ExecutorIdleState,
} from './idle-episode-payload';
import type { Task } from '../types/task';
import type {
  SterlingLanguageIOClient,
  ReduceResult,
  ReduceError,
} from '@conscious-bot/cognition';

// =============================================================================
// Public types
// =============================================================================

/**
 * Minimal client surface IdleEngine depends on. Narrowed from the full
 * SterlingLanguageIOClient interface to the one method we actually call,
 * which makes the class trivially mockable in tests.
 */
export interface IdleEngineClient {
  reduce(
    rawText: string,
    options: { modelId?: string; promptDigest?: string }
  ): Promise<ReduceResult | ReduceError>;
}

/**
 * Configuration knobs for IdleEngine. All optional; sensible defaults.
 */
export interface IdleEngineConfig {
  /**
   * Minimum interval between successful task-creation acknowledgements
   * and the next permitted requestGoal() call. NOT anchored to "Sterling
   * returned a goal" — anchored to `acknowledgeTaskCreated()`. If the
   * caller never acknowledges (because addTask returned null or the seed
   * was rejected), the cooldown gate never activates and the next idle
   * tick will retry immediately.
   *
   * Default: 60_000ms (60 seconds). Chosen as a middle ground between
   * "spammy" and "slow to respond to new idle conditions."
   */
  minIntervalBetweenRequestsMs?: number;

  /**
   * Wall-clock timeout for the Sterling `reduce()` call. If Sterling
   * doesn't respond within this window, IdleEngine returns
   * `{ kind: 'sterling_unavailable', reason: 'client_timeout' }` and
   * releases the in-flight latch so the next tick can retry.
   *
   * Default: 12_000ms (12 seconds). Matches the deleted keep-alive's
   * `idleEpisodeTimeoutMs` default for consistency with existing
   * operational expectations.
   */
  sterlingReduceTimeoutMs?: number;

  /**
   * Model ID tag sent to Sterling via the reduce options. Surfaces in
   * language-io provenance. Default: 'idle-episode'.
   */
  modelId?: string;
}

/**
 * Tagged-union result of IdleEngine.requestGoal(). Callers pattern-match
 * on `kind` to decide what to do. All five variants are distinct enough
 * that a switch statement covers every case exhaustively.
 */
export type IdleGoalDecision =
  | {
      kind: 'goal';
      /** Deterministic run ID for golden-run linkage and acknowledge(). */
      runId: string;
      /**
       * Task seed to pass to `taskIntegration.addTask()`. Type is
       * `Partial<Task>` because addTask() fills in id, createdAt, etc.
       */
      taskSeed: Partial<Task>;
      /** Sterling-committed goal prop identifier (for logging). */
      committedGoalPropId: string;
      /** Sterling-committed IR digest (for logging). */
      committedIrDigest: string;
    }
  | {
      kind: 'no_policy';
      /** Reason from Sterling (e.g., 'no_committed_goal_prop', blockReason). */
      reason: string;
      /** Run ID even on failure — useful for diagnostic tracing. */
      runId: string;
    }
  | {
      kind: 'sterling_unavailable';
      /** Error code from ReduceError, or 'client_timeout' on wall-clock. */
      reason: string;
      /** Run ID for diagnostic tracing. */
      runId: string;
    }
  | {
      kind: 'in_flight';
      /** Placeholder; no runId because no new request was made. */
    }
  | {
      kind: 'cooldown';
      /** Milliseconds remaining until the next request is permitted. */
      remainingMs: number;
    };

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_CONFIG: Required<IdleEngineConfig> = {
  minIntervalBetweenRequestsMs: 60_000,
  sterlingReduceTimeoutMs: 12_000,
  modelId: 'idle-episode',
};

// =============================================================================
// Class
// =============================================================================

/**
 * IdleEngine main class. Hold one instance per planning executor.
 *
 * State is minimal: an in-flight latch (set for the duration of a single
 * requestGoal() call) and a last-success timestamp (set by the caller via
 * acknowledgeTaskCreated(), read by the cooldown gate).
 */
export class IdleEngine {
  private readonly client: IdleEngineClient;
  private readonly config: Required<IdleEngineConfig>;

  /**
   * True while a requestGoal() call is in flight (Sterling reduce in
   * progress). Serialized: concurrent requestGoal() calls return
   * `{ kind: 'in_flight' }` without starting a new Sterling request.
   */
  private inFlight = false;

  /**
   * Timestamp of the most recent successful task-creation acknowledgement.
   * Starts at 0 so the first request is always allowed through the
   * cooldown gate. Updated by `acknowledgeTaskCreated()` — NOT by
   * requestGoal() success.
   */
  private lastAcknowledgedAt = 0;

  constructor(client: IdleEngineClient, config: IdleEngineConfig = {}) {
    this.client = client;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Request a goal from Sterling based on current executor/bot state.
   *
   * Returns a tagged-union decision. The caller MUST:
   * - Pattern-match on `decision.kind` to handle all 5 variants
   * - On `kind === 'goal'`: pass `decision.taskSeed` to addTask() and
   *   then call `acknowledgeTaskCreated(decision.runId)` iff the task
   *   was actually created (addTask returned a non-null Task)
   * - On any other kind: do nothing (or log for observability)
   *
   * The caller MUST NOT call acknowledgeTaskCreated for non-`goal`
   * decisions — doing so would falsely start the cooldown on a failure
   * and block the next retry for 60 seconds.
   */
  async requestGoal(
    executorState: ExecutorIdleState,
    botState: BotStateSnapshot
  ): Promise<IdleGoalDecision> {
    // 1. In-flight latch: if a previous call is still running, bail out
    //    immediately. No runId because no new Sterling request was made.
    if (this.inFlight) {
      return { kind: 'in_flight' };
    }

    // 2. Cooldown gate: if we recently acknowledged a successful task
    //    creation, wait until `minIntervalBetweenRequestsMs` has elapsed.
    //    On first-ever call, `lastAcknowledgedAt === 0` and `elapsed`
    //    will be huge, so the gate passes.
    const now = Date.now();
    const elapsed = now - this.lastAcknowledgedAt;
    if (this.lastAcknowledgedAt > 0 && elapsed < this.config.minIntervalBetweenRequestsMs) {
      return {
        kind: 'cooldown',
        remainingMs: this.config.minIntervalBetweenRequestsMs - elapsed,
      };
    }

    // 3. Build the payload. Pure function; cannot fail.
    const { rawText, runId } = buildIdleEpisodePayload(executorState, botState, now);

    // 4. Send to Sterling with a wall-clock timeout. The in-flight latch
    //    is set before the await and cleared in finally so it releases
    //    on every exit path including thrown exceptions.
    this.inFlight = true;
    try {
      const result = await this.reduceWithTimeout(rawText, this.config.sterlingReduceTimeoutMs);

      // 5. Classify the Sterling response into a decision.
      //    ReduceError is distinguished from ReduceResult by the presence
      //    of the `code` field.
      if ('code' in result) {
        return {
          kind: 'sterling_unavailable',
          reason: result.code,
          runId,
        };
      }

      // ReduceResult path — check the reducer view for executability.
      const reducer = result.result;

      if (!reducer.is_executable) {
        return {
          kind: 'no_policy',
          reason: result.blockReason ?? 'not_executable',
          runId,
        };
      }

      if (reducer.committed_goal_prop_id === null) {
        // Edge case: Sterling says executable but didn't commit a
        // goal prop. Happens when Sterling recognizes the episode but
        // its priority ladder returned None (bot is fully healthy,
        // no threats, fully equipped — nothing to do). Not an error;
        // just no policy available.
        return {
          kind: 'no_policy',
          reason: 'no_committed_goal_prop',
          runId,
        };
      }

      // 6. Success path: build the task seed with Sterling provenance
      //    and golden-run linkage. Task.source='autonomous' (the existing
      //    convention from Task type union); metadata.goldenRun.source
      //    ='idle_engine' (the grep-friendly provenance tag).
      return {
        kind: 'goal',
        runId,
        committedGoalPropId: reducer.committed_goal_prop_id,
        committedIrDigest: reducer.committed_ir_digest,
        taskSeed: {
          type: 'sterling_ir',
          source: 'autonomous',
          title: `Idle goal ${reducer.committed_goal_prop_id}`,
          description: `Autonomous task requested by IdleEngine from Sterling idle_episode_v1 reducer`,
          metadata: {
            createdAt: now,
            updatedAt: now,
            retryCount: 0,
            maxRetries: 3,
            childTaskIds: [],
            tags: ['autonomous', 'idle_engine'],
            category: 'autonomous',
            sterling: {
              committedIrDigest: reducer.committed_ir_digest,
              committedGoalPropId: reducer.committed_goal_prop_id,
              envelopeId: result.envelope.envelope_id,
              schemaVersion: reducer.schema_version,
              reducerVersion: reducer.reducer_version,
            },
            goldenRun: {
              runId,
              requestedAt: now,
              source: 'idle_engine',
            },
          } as Task['metadata'],
        },
      };
    } catch (error) {
      // The reduceWithTimeout helper converts wall-clock timeouts to a
      // thrown Error with message 'idle_engine_timeout'. Any other
      // exception here is an unexpected failure from the client itself.
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'idle_engine_timeout') {
        return {
          kind: 'sterling_unavailable',
          reason: 'client_timeout',
          runId,
        };
      }
      return {
        kind: 'sterling_unavailable',
        reason: message,
        runId,
      };
    } finally {
      // Always release the in-flight latch, regardless of exit path.
      this.inFlight = false;
    }
  }

  /**
   * Acknowledge that the task seed from a previous `requestGoal()`
   * decision was successfully added to the planning task list. Starts
   * the cooldown timer.
   *
   * Callers MUST only call this after `taskIntegration.addTask()`
   * returns a non-null Task. Calling it on any other path (including
   * null returns, errors, or `kind !== 'goal'` decisions) falsely
   * starts the cooldown and blocks the next retry for
   * `minIntervalBetweenRequestsMs` — potentially catastrophic if the
   * caller is in a silent-dedupe loop.
   *
   * The runId parameter is currently only used for symmetry with
   * future multi-request tracking and for caller-side logging. The
   * implementation does not verify that the runId matches the most
   * recent requestGoal() call — if the caller acknowledges a stale
   * runId, the cooldown still starts. This is intentional: we trust
   * the caller to only acknowledge real successes.
   */
  acknowledgeTaskCreated(_runId: string): void {
    this.lastAcknowledgedAt = Date.now();
  }

  /**
   * Reset the cooldown and in-flight state. For test use only.
   *
   * @internal
   */
  __resetForTests(): void {
    this.inFlight = false;
    this.lastAcknowledgedAt = 0;
  }

  /**
   * Current cooldown remaining, in milliseconds. Returns 0 if the gate
   * would pass right now. For diagnostics.
   */
  getCooldownRemainingMs(): number {
    if (this.lastAcknowledgedAt === 0) return 0;
    const elapsed = Date.now() - this.lastAcknowledgedAt;
    return Math.max(0, this.config.minIntervalBetweenRequestsMs - elapsed);
  }

  // =============================================================================
  // Private helpers
  // =============================================================================

  /**
   * Wrap the client reduce call in a Promise.race against a wall-clock
   * timeout. On timeout, throws an Error with message 'idle_engine_timeout'
   * which the caller catches and converts to a `sterling_unavailable`
   * decision.
   *
   * We don't use an AbortController here because the client's reduce()
   * method doesn't currently support cancellation — the underlying
   * Sterling request will continue running in the background until it
   * completes or Sterling's own server-side timeout kicks in. This is
   * acceptable because (a) Sterling is idempotent for idle_episode_v1
   * requests and (b) the next IdleEngine cycle will simply race a new
   * request against the still-running old one via the in-flight latch.
   */
  private async reduceWithTimeout(
    rawText: string,
    timeoutMs: number
  ): Promise<ReduceResult | ReduceError> {
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('idle_engine_timeout')), timeoutMs);
    });
    try {
      const result = await Promise.race([
        this.client.reduce(rawText, {
          modelId: this.config.modelId,
          promptDigest: 'idle_episode_v1',
        }),
        timeoutPromise,
      ]);
      return result;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}
