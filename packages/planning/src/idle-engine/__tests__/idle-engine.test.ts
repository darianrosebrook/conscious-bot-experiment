/**
 * IdleEngine contract tests.
 *
 * These tests fence the public contract of the IdleEngine class:
 *
 * 1. Happy path — Sterling returns an executable result with a non-null
 *    committed_goal_prop_id → requestGoal returns { kind: 'goal', ... }
 *    with a valid task seed.
 *
 * 2. Sterling returns blocked (is_executable=false) → requestGoal returns
 *    { kind: 'no_policy', reason: blockReason }.
 *
 * 3. Sterling returns executable with null committed_goal_prop_id →
 *    { kind: 'no_policy', reason: 'no_committed_goal_prop' }. Edge case
 *    where Sterling's priority ladder returns None (bot is fully healthy).
 *
 * 4. Sterling returns a ReduceError (STERLING_UNAVAILABLE, etc.) →
 *    { kind: 'sterling_unavailable', reason: <code> }.
 *
 * 5. Wall-clock timeout — Sterling doesn't respond within
 *    sterlingReduceTimeoutMs → { kind: 'sterling_unavailable',
 *    reason: 'client_timeout' }.
 *
 * 6. In-flight latch — second requestGoal call while first is pending →
 *    { kind: 'in_flight' } without making a new Sterling request.
 *
 * 7. Cooldown gate (re-up behavior, Decision A) — the cooldown is NOT
 *    started by a successful Sterling response. It is started by
 *    acknowledgeTaskCreated(). A caller that never acknowledges can
 *    retry on the very next tick, even after a successful Sterling
 *    response. This prevents silent dedupe rejections from wasting
 *    the 60s window.
 *
 * 8. Acknowledge starts the cooldown — after acknowledgeTaskCreated(),
 *    the next requestGoal within minIntervalBetweenRequestsMs returns
 *    { kind: 'cooldown', remainingMs }.
 *
 * 9. Task seed shape — the `taskSeed` returned on success has all the
 *    fields that taskIntegration.addTask() and the converter's 5-gate
 *    contract expect: type='sterling_ir', source='autonomous',
 *    metadata.sterling with committedIrDigest + committedGoalPropId,
 *    metadata.goldenRun.source='idle_engine'.
 *
 * Strategy: mock the client with a one-method fake that returns a
 * controllable ReduceResult/ReduceError/timeout. Use vi.useFakeTimers()
 * for deterministic cooldown and timeout testing.
 *
 * @author @darianrosebrook
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdleEngine, type IdleEngineClient } from '../idle-engine';
import type { ExecutorIdleState, BotStateSnapshot } from '../idle-episode-payload';
import type { ReduceResult, ReduceError } from '@conscious-bot/cognition';

// =============================================================================
// Fixtures
// =============================================================================

function makeExecutorState(overrides: Partial<ExecutorIdleState> = {}): ExecutorIdleState {
  return {
    idleReason: 'no_tasks',
    activeTasks: 0,
    eligibleTasks: 0,
    ...overrides,
  };
}

function makeBotState(overrides: Partial<BotStateSnapshot> = {}): BotStateSnapshot {
  return {
    position: { x: 0, y: 64, z: 0 },
    health: 20,
    food: 20,
    biome: 'plains',
    nearbyHostiles: 0,
    inventory: [],
    ...overrides,
  };
}

/**
 * Build a minimal ReduceResult matching the shape Sterling returns on
 * a successful executable reduction. Only fills the fields IdleEngine
 * actually reads; other ReducerResultView fields get plausible defaults.
 *
 * NOTE: we use explicit `in` presence checks rather than `??` for the
 * override defaults because `null` is a semantically meaningful value
 * for `committed_goal_prop_id` (the "executable but no goal committed"
 * edge case in test 3). The `??` operator treats `null` as absent and
 * would silently replace it with the default, masking the edge case.
 */
function makeExecutableReduceResult(overrides: {
  committed_goal_prop_id?: string | null;
  committed_ir_digest?: string;
  blockReason?: string | null;
} = {}): ReduceResult {
  return {
    result: {
      committed_goal_prop_id:
        'committed_goal_prop_id' in overrides
          ? overrides.committed_goal_prop_id!
          : 'prop_gather_food',
      committed_ir_digest:
        'committed_ir_digest' in overrides
          ? overrides.committed_ir_digest!
          : 'ir_digest_abc123',
      source_envelope_id: 'env_test_1',
      is_executable: true,
      is_semantically_empty: false,
      advisory: null,
      grounding: null,
      schema_version: 'sterling.language_reducer_result.v1',
      reducer_version: 'intent_reducer_v1',
    },
    envelope: {
      schema_id: 'sterling.language_io_envelope.v1',
      envelope_id: 'env_test_1',
      prompt_digest: 'idle_episode_v1',
      model_id: 'idle-episode',
      raw_text: 'IDLE_EPISODE_V1\n{...}',
      timestamp_ms: Date.now(),
      world_snapshot_ref: null,
    } as any,
    canConvert: true,
    blockReason: overrides.blockReason ?? null,
    durationMs: 42,
  };
}

function makeBlockedReduceResult(blockReason: string): ReduceResult {
  return {
    result: {
      committed_goal_prop_id: null,
      committed_ir_digest: 'ir_digest_blocked',
      source_envelope_id: 'env_test_1',
      is_executable: false,
      is_semantically_empty: false,
      advisory: null,
      grounding: null,
      schema_version: 'sterling.language_reducer_result.v1',
      reducer_version: 'intent_reducer_v1',
    },
    envelope: {
      schema_id: 'sterling.language_io_envelope.v1',
      envelope_id: 'env_test_1',
      prompt_digest: 'idle_episode_v1',
      model_id: 'idle-episode',
      raw_text: 'IDLE_EPISODE_V1\n{...}',
      timestamp_ms: Date.now(),
      world_snapshot_ref: null,
    } as any,
    canConvert: false,
    blockReason,
    durationMs: 42,
  };
}

function makeReduceError(code: ReduceError['code'], message: string): ReduceError {
  return {
    code,
    message,
    durationMs: 100,
  };
}

/**
 * Client fake: wraps a `vi.fn()` so tests can control the return value
 * per-call. The reduce method returns whatever the mock is configured
 * to return.
 */
function makeClient(): {
  client: IdleEngineClient;
  reduce: ReturnType<typeof vi.fn>;
} {
  const reduce = vi.fn();
  const client: IdleEngineClient = { reduce };
  return { client, reduce };
}

// =============================================================================
// Tests
// =============================================================================

describe('IdleEngine.requestGoal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('1. Happy path', () => {
    it('returns kind=goal with task seed when Sterling returns executable', async () => {
      const { client, reduce } = makeClient();
      reduce.mockResolvedValueOnce(
        makeExecutableReduceResult({
          committed_goal_prop_id: 'prop_craft_wooden_pickaxe',
          committed_ir_digest: 'ir_craft_wooden',
        })
      );
      const engine = new IdleEngine(client);

      const decision = await engine.requestGoal(makeExecutorState(), makeBotState());

      expect(decision.kind).toBe('goal');
      if (decision.kind === 'goal') {
        expect(decision.committedGoalPropId).toBe('prop_craft_wooden_pickaxe');
        expect(decision.committedIrDigest).toBe('ir_craft_wooden');
        expect(decision.runId).toContain('idle_engine_');
        expect(decision.runId).toContain('no_tasks');
        expect(decision.taskSeed).toBeDefined();
      }

      // Sterling was called exactly once with the expected options.
      expect(reduce).toHaveBeenCalledTimes(1);
      const [rawText, options] = reduce.mock.calls[0];
      expect(rawText).toMatch(/^IDLE_EPISODE_V1\n/);
      expect(options).toEqual({
        modelId: 'idle-episode',
        promptDigest: 'idle_episode_v1',
      });
    });
  });

  describe('2. Sterling returns blocked (is_executable=false)', () => {
    it('returns kind=no_policy with the blockReason', async () => {
      const { client, reduce } = makeClient();
      reduce.mockResolvedValueOnce(makeBlockedReduceResult('blocked_no_action'));
      const engine = new IdleEngine(client);

      const decision = await engine.requestGoal(makeExecutorState(), makeBotState());

      expect(decision.kind).toBe('no_policy');
      if (decision.kind === 'no_policy') {
        expect(decision.reason).toBe('blocked_no_action');
        expect(decision.runId).toContain('idle_engine_');
      }
    });
  });

  describe('3. Sterling returns executable with null committed_goal_prop_id', () => {
    it('returns kind=no_policy with reason=no_committed_goal_prop', async () => {
      // Edge case: Sterling says is_executable=true but didn't commit a
      // goal. Happens when the priority ladder returns None (bot is
      // fully equipped, no threats, no vitals urgency).
      const { client, reduce } = makeClient();
      reduce.mockResolvedValueOnce(
        makeExecutableReduceResult({ committed_goal_prop_id: null })
      );
      const engine = new IdleEngine(client);

      const decision = await engine.requestGoal(makeExecutorState(), makeBotState());

      expect(decision.kind).toBe('no_policy');
      if (decision.kind === 'no_policy') {
        expect(decision.reason).toBe('no_committed_goal_prop');
      }
    });
  });

  describe('4. Sterling returns a ReduceError', () => {
    it('returns kind=sterling_unavailable with the error code', async () => {
      const { client, reduce } = makeClient();
      reduce.mockResolvedValueOnce(
        makeReduceError('STERLING_UNAVAILABLE', 'backend not connected')
      );
      const engine = new IdleEngine(client);

      const decision = await engine.requestGoal(makeExecutorState(), makeBotState());

      expect(decision.kind).toBe('sterling_unavailable');
      if (decision.kind === 'sterling_unavailable') {
        expect(decision.reason).toBe('STERLING_UNAVAILABLE');
      }
    });

    it('handles STERLING_TIMEOUT the same way', async () => {
      const { client, reduce } = makeClient();
      reduce.mockResolvedValueOnce(
        makeReduceError('STERLING_TIMEOUT', 'server-side timeout')
      );
      const engine = new IdleEngine(client);

      const decision = await engine.requestGoal(makeExecutorState(), makeBotState());

      expect(decision.kind).toBe('sterling_unavailable');
      if (decision.kind === 'sterling_unavailable') {
        expect(decision.reason).toBe('STERLING_TIMEOUT');
      }
    });
  });

  describe('5. Wall-clock timeout', () => {
    it('returns kind=sterling_unavailable with reason=client_timeout when Sterling hangs', async () => {
      const { client, reduce } = makeClient();
      // Create a promise that never resolves — simulates Sterling hanging.
      reduce.mockImplementationOnce(() => new Promise(() => {}));
      const engine = new IdleEngine(client, { sterlingReduceTimeoutMs: 5000 });

      const promise = engine.requestGoal(makeExecutorState(), makeBotState());

      // Attach a rejection handler BEFORE advancing timers so the
      // rejection is observed synchronously with the timer fire.
      // Advance fake-time past the timeout — this triggers the race
      // rejection, which the catch block in requestGoal converts to
      // a sterling_unavailable decision.
      await vi.advanceTimersByTimeAsync(5001);

      const decision = await promise;
      expect(decision.kind).toBe('sterling_unavailable');
      if (decision.kind === 'sterling_unavailable') {
        expect(decision.reason).toBe('client_timeout');
      }
    });
  });

  describe('6. In-flight latch', () => {
    it('returns kind=in_flight for concurrent calls while a previous request is pending', async () => {
      const { client, reduce } = makeClient();
      // First call hangs forever so we can observe the in-flight state.
      reduce.mockImplementationOnce(() => new Promise(() => {}));
      const engine = new IdleEngine(client);

      // Start first request (don't await — it will hang).
      const firstPromise = engine.requestGoal(makeExecutorState(), makeBotState());
      // Let the microtask queue run so `this.inFlight = true` takes effect.
      await Promise.resolve();

      // Second call while the first is still pending.
      const secondDecision = await engine.requestGoal(makeExecutorState(), makeBotState());
      expect(secondDecision.kind).toBe('in_flight');

      // Sterling was only called once (for the first request), not twice.
      expect(reduce).toHaveBeenCalledTimes(1);

      // Clean up the dangling first promise — advance past its timeout.
      // Default timeout is 12000ms.
      await vi.advanceTimersByTimeAsync(13000);
      const firstDecision = await firstPromise;
      expect(firstDecision.kind).toBe('sterling_unavailable');
    });
  });

  describe('7. Cooldown gate (re-up behavior — Decision A)', () => {
    it('does NOT start cooldown on Sterling success alone', async () => {
      // Core re-up property: after a successful Sterling response,
      // the next requestGoal MUST still be allowed if the caller
      // never acknowledged. This lets the caller retry when addTask()
      // returns null (silent dedupe) without being blocked for 60s.
      const { client, reduce } = makeClient();
      reduce
        .mockResolvedValueOnce(makeExecutableReduceResult({ committed_goal_prop_id: 'prop_1' }))
        .mockResolvedValueOnce(makeExecutableReduceResult({ committed_goal_prop_id: 'prop_2' }));
      const engine = new IdleEngine(client);

      const first = await engine.requestGoal(makeExecutorState(), makeBotState());
      expect(first.kind).toBe('goal');

      // IMPORTANT: do NOT call acknowledgeTaskCreated — simulate the
      // "caller got a goal but addTask returned null" scenario.

      // Second call immediately after. Should NOT be rate-limited.
      const second = await engine.requestGoal(makeExecutorState(), makeBotState());
      expect(second.kind).toBe('goal');
      if (second.kind === 'goal') {
        expect(second.committedGoalPropId).toBe('prop_2');
      }
      expect(reduce).toHaveBeenCalledTimes(2);
    });

    it('does NOT start cooldown on no_policy / sterling_unavailable', async () => {
      const { client, reduce } = makeClient();
      reduce
        .mockResolvedValueOnce(makeBlockedReduceResult('blocked_no_action'))
        .mockResolvedValueOnce(makeReduceError('STERLING_UNAVAILABLE', 'down'));
      const engine = new IdleEngine(client);

      const first = await engine.requestGoal(makeExecutorState(), makeBotState());
      expect(first.kind).toBe('no_policy');

      // Immediate retry should be allowed.
      const second = await engine.requestGoal(makeExecutorState(), makeBotState());
      expect(second.kind).toBe('sterling_unavailable');
      expect(reduce).toHaveBeenCalledTimes(2);
    });
  });

  describe('8. Acknowledge starts the cooldown', () => {
    it('returns kind=cooldown when requestGoal is called within the interval after acknowledge', async () => {
      const { client, reduce } = makeClient();
      reduce
        .mockResolvedValueOnce(makeExecutableReduceResult({ committed_goal_prop_id: 'prop_1' }))
        .mockResolvedValueOnce(makeExecutableReduceResult({ committed_goal_prop_id: 'prop_2' }));
      const engine = new IdleEngine(client, { minIntervalBetweenRequestsMs: 60_000 });

      const first = await engine.requestGoal(makeExecutorState(), makeBotState());
      expect(first.kind).toBe('goal');
      if (first.kind === 'goal') {
        engine.acknowledgeTaskCreated(first.runId);
      }

      // Advance clock by 30s — still inside the 60s cooldown.
      await vi.advanceTimersByTimeAsync(30_000);

      const second = await engine.requestGoal(makeExecutorState(), makeBotState());
      expect(second.kind).toBe('cooldown');
      if (second.kind === 'cooldown') {
        // Approximately 30s remaining (60s minus 30s elapsed).
        expect(second.remainingMs).toBeGreaterThan(29_000);
        expect(second.remainingMs).toBeLessThanOrEqual(30_000);
      }

      // Sterling was only called once — the second requestGoal returned
      // cooldown without hitting the client.
      expect(reduce).toHaveBeenCalledTimes(1);
    });

    it('allows the next request after the cooldown interval elapses', async () => {
      const { client, reduce } = makeClient();
      reduce
        .mockResolvedValueOnce(makeExecutableReduceResult({ committed_goal_prop_id: 'prop_1' }))
        .mockResolvedValueOnce(makeExecutableReduceResult({ committed_goal_prop_id: 'prop_2' }));
      const engine = new IdleEngine(client, { minIntervalBetweenRequestsMs: 60_000 });

      const first = await engine.requestGoal(makeExecutorState(), makeBotState());
      if (first.kind === 'goal') engine.acknowledgeTaskCreated(first.runId);

      // Advance past the cooldown.
      await vi.advanceTimersByTimeAsync(60_001);

      const second = await engine.requestGoal(makeExecutorState(), makeBotState());
      expect(second.kind).toBe('goal');
      expect(reduce).toHaveBeenCalledTimes(2);
    });
  });

  describe('9. Task seed shape', () => {
    it('returns a task seed with sterling_ir type, autonomous source, and correct metadata', async () => {
      const { client, reduce } = makeClient();
      reduce.mockResolvedValueOnce(
        makeExecutableReduceResult({
          committed_goal_prop_id: 'prop_craft_wooden_pickaxe',
          committed_ir_digest: 'ir_craft_wooden_abc',
        })
      );
      const engine = new IdleEngine(client);

      const decision = await engine.requestGoal(makeExecutorState(), makeBotState());
      expect(decision.kind).toBe('goal');
      if (decision.kind !== 'goal') return; // type narrow

      const seed = decision.taskSeed;

      // Task.type discriminator — must be 'sterling_ir' so the
      // task-integration pipeline routes through the Sterling-IR path.
      expect(seed.type).toBe('sterling_ir');

      // Task.source — 'autonomous' is the existing union value.
      // 'idle_engine' lives in metadata.goldenRun.source for provenance.
      expect(seed.source).toBe('autonomous');

      // Sterling provenance in metadata.sterling.
      expect(seed.metadata?.sterling?.committedIrDigest).toBe('ir_craft_wooden_abc');
      expect(seed.metadata?.sterling?.committedGoalPropId).toBe('prop_craft_wooden_pickaxe');
      expect(seed.metadata?.sterling?.schemaVersion).toBe(
        'sterling.language_reducer_result.v1'
      );
      expect(seed.metadata?.sterling?.reducerVersion).toBe('intent_reducer_v1');

      // Golden-run linkage with the grep-friendly 'idle_engine' source tag.
      expect(seed.metadata?.goldenRun?.source).toBe('idle_engine');
      expect(seed.metadata?.goldenRun?.runId).toBe(decision.runId);
      expect(seed.metadata?.goldenRun?.requestedAt).toBeGreaterThan(0);

      // Tags list includes 'idle_engine' for dashboard filtering.
      expect(seed.metadata?.tags).toContain('idle_engine');
      expect(seed.metadata?.tags).toContain('autonomous');
    });
  });
});

describe('IdleEngine.getCooldownRemainingMs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 before any acknowledge call', () => {
    const { client } = makeClient();
    const engine = new IdleEngine(client);
    expect(engine.getCooldownRemainingMs()).toBe(0);
  });

  it('returns the remaining ms after an acknowledge', async () => {
    const { client } = makeClient();
    const engine = new IdleEngine(client, { minIntervalBetweenRequestsMs: 60_000 });
    engine.acknowledgeTaskCreated('test-run');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(engine.getCooldownRemainingMs()).toBeGreaterThan(39_000);
    expect(engine.getCooldownRemainingMs()).toBeLessThanOrEqual(40_000);
  });

  it('returns 0 once the cooldown has elapsed', async () => {
    const { client } = makeClient();
    const engine = new IdleEngine(client, { minIntervalBetweenRequestsMs: 60_000 });
    engine.acknowledgeTaskCreated('test-run');
    await vi.advanceTimersByTimeAsync(60_001);
    expect(engine.getCooldownRemainingMs()).toBe(0);
  });
});
