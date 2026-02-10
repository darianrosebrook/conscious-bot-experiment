/**
 * Regression test: idle episodes fire even when blocked tasks are present.
 *
 * Proves that the "one bad task stalls autonomy" failure mode is locked down:
 * - idleReason='blocked_on_prereq' passes the eligibility gate
 * - idleReason='blocked_on_prereq' bypasses the pending-planning suppression
 * - idleReason='no_tasks' is still eligible (baseline)
 * - Other idle reasons (backoff, circuit_breaker) are correctly suppressed
 *
 * Hermetic: uses injected stub controller — no network, no LLM calls.
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  KeepAliveIntegration,
  type ExecutorState,
  type BotState,
} from '../keep-alive-integration';

// ============================================================================
// Stub controller: emits deterministic tick results, no network
// ============================================================================

function createStubController() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    tick: vi.fn().mockResolvedValue({
      ticked: true,
      skipped: false,
      thought: {
        id: 'stub-thought',
        content: 'stub thought content',
        source: 'keepalive',
        timestamp: Date.now(),
        isExecutable: false,
        eligibility: { convertEligible: false, derived: true, reasoning: 'stub' },
        sterlingUsed: false,
        rawOutput: 'stub',
        groundingPerformed: false,
        groundingResult: { pass: false, reason: 'stub', referencedFacts: [], violations: [] },
        committedGoalPropId: null,
        frameProfile: 'balanced',
        processingDurationMs: 0,
      },
      event: {
        type: 'keepalive_thought',
        timestamp_ms: Date.now(),
        payload: {
          thought_id: 'stub-thought',
          source: 'keepalive',
          convert_eligible: false,
          derived: true,
          goal_present: false,
          grounding_pass: false,
          reasoning: 'stub',
        },
      },
    }),
  });
}

// ============================================================================
// Helpers
// ============================================================================

const MINIMAL_BOT_STATE: BotState = {
  position: { x: 0, y: 64, z: 0 },
  health: 20,
  food: 20,
  inventory: [],
};

function makeExecutorState(overrides: Partial<ExecutorState> = {}): ExecutorState {
  return {
    activeTasks: 0,
    eligibleTasks: 0,
    idleReason: 'no_tasks',
    circuitBreakerOpen: false,
    lastUserCommand: 0,
    recentTaskConversions: 0,
    ...overrides,
  };
}

function createHermeticIntegration(overrides: Record<string, unknown> = {}) {
  return new KeepAliveIntegration({
    enabled: true,
    enableSterlingIdleEpisodes: false,
    _controllerFactory: createStubController as any,
    ...overrides,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('idle episode eligibility (regression)', () => {
  it('returns null for idleReason=backoff (ineligible)', async () => {
    const integration = createHermeticIntegration();
    await integration.initialize();
    const result = await integration.onIdle(
      makeExecutorState({ idleReason: 'backoff' }),
      MINIMAL_BOT_STATE,
    );
    expect(result).toBeNull();
  });

  it('returns null for idleReason=circuit_breaker (ineligible)', async () => {
    const integration = createHermeticIntegration();
    await integration.initialize();
    const result = await integration.onIdle(
      makeExecutorState({ idleReason: 'circuit_breaker' }),
      MINIMAL_BOT_STATE,
    );
    expect(result).toBeNull();
  });

  it('returns null for idleReason=manual_pause (ineligible)', async () => {
    const integration = createHermeticIntegration();
    await integration.initialize();
    const result = await integration.onIdle(
      makeExecutorState({ idleReason: 'manual_pause' }),
      MINIMAL_BOT_STATE,
    );
    expect(result).toBeNull();
  });

  it('returns null for null idleReason (ineligible)', async () => {
    const integration = createHermeticIntegration();
    await integration.initialize();
    const result = await integration.onIdle(
      makeExecutorState({ idleReason: null }),
      MINIMAL_BOT_STATE,
    );
    expect(result).toBeNull();
  });

  // ── The critical regression cases ──

  it('idleReason=no_tasks passes eligibility gate (baseline)', async () => {
    const integration = createHermeticIntegration();
    await integration.initialize();
    const result = await integration.onIdle(
      makeExecutorState({ idleReason: 'no_tasks' }),
      MINIMAL_BOT_STATE,
    );
    // Stub controller returns a non-null tick result
    expect(result).not.toBeNull();
    expect(result!.ticked).toBe(true);
  });

  it('idleReason=blocked_on_prereq passes eligibility gate (regression)', async () => {
    const integration = createHermeticIntegration();
    await integration.initialize();
    const result = await integration.onIdle(
      makeExecutorState({
        idleReason: 'blocked_on_prereq',
        blockedTasks: [
          { taskId: 'craft-1', blockedReason: 'waiting_on_prereq' },
        ],
      }),
      MINIMAL_BOT_STATE,
    );
    // Must NOT be null — blocked_on_prereq is eligible
    expect(result).not.toBeNull();
    expect(result!.ticked).toBe(true);
  });
});

describe('idle episode pending-planning suppression bypass', () => {
  it('blocked_on_prereq bypasses pending-planning suppression', async () => {
    const integration = createHermeticIntegration({
      enableSterlingIdleEpisodes: true,
      idleEpisodeCooldownMs: 0,
      idleEpisodeTimeoutMs: 1000,
    });
    await integration.initialize();

    // Spy on trySterlingIdleEpisode AFTER initialize so controller exists
    const spy = vi.spyOn(integration as any, 'trySterlingIdleEpisode')
      .mockResolvedValue('suppressed_in_flight');

    await integration.onIdle(
      makeExecutorState({
        idleReason: 'blocked_on_prereq',
        pendingPlanningSterlingIrCount: 1, // Would suppress non-blocked reasons
        blockedTasks: [
          { taskId: 'craft-1', blockedReason: 'waiting_on_prereq' },
        ],
      }),
      MINIMAL_BOT_STATE,
    );

    // If the pending-planning gate incorrectly suppressed blocked_on_prereq,
    // trySterlingIdleEpisode would never be called.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('no_tasks IS suppressed when pending-planning tasks exist', async () => {
    const integration = createHermeticIntegration({
      enableSterlingIdleEpisodes: true,
      idleEpisodeCooldownMs: 0,
    });
    await integration.initialize();

    const spy = vi.spyOn(integration as any, 'trySterlingIdleEpisode');

    const result = await integration.onIdle(
      makeExecutorState({
        idleReason: 'no_tasks',
        pendingPlanningSterlingIrCount: 2, // Should suppress for no_tasks
      }),
      MINIMAL_BOT_STATE,
    );

    // Should be suppressed — trySterlingIdleEpisode should NOT be called
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
