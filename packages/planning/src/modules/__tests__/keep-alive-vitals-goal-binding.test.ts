/**
 * Tests: keep-alive vitals → Sterling reduce re-route (Spec B: doom-loop breaker).
 *
 * Proves that when keep-alive generates a vitals thought (health/food urgent)
 * with null committed_goal_prop_id, the thought is re-routed through Sterling's
 * idle_episode_v1 reducer which produces a real goal-prop.
 *
 * Also proves that dropped_no_goal_prop is transient (not deterministic)
 * for keep-alive source thoughts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  KeepAliveIntegration,
  type ExecutorState,
  type BotState,
} from '../keep-alive-integration';

// ============================================================================
// Mock getDefaultLanguageIOClient (Sterling reduce path)
// ============================================================================

const mockReduce = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(undefined);

vi.mock('@conscious-bot/cognition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@conscious-bot/cognition')>();
  return {
    ...actual,
    getDefaultLanguageIOClient: () => ({
      connect: mockConnect,
      reduce: mockReduce,
    }),
  };
});

// ============================================================================
// Mock fetch (for postThoughtToCognition)
// ============================================================================

const mockFetch = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal('fetch', mockFetch);

// ============================================================================
// Stub controller
// ============================================================================

let thoughtHandler: ((event: any, thought: any) => Promise<void>) | null = null;

function createStubController() {
  const emitter = new EventEmitter();
  // Capture the thought handler when it's registered
  const origOn = emitter.on.bind(emitter);
  emitter.on = ((event: string, handler: any) => {
    if (event === 'thought') {
      thoughtHandler = handler;
    }
    return origOn(event, handler);
  }) as any;

  return Object.assign(emitter, {
    tick: vi.fn().mockResolvedValue({
      ticked: true,
      skipped: false,
      thought: null,
      event: null,
    }),
    getState: vi.fn().mockReturnValue({}),
    getCounters: vi.fn().mockReturnValue({}),
  });
}

// ============================================================================
// Helpers
// ============================================================================

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

function makeUrgentBotState(overrides: Partial<BotState> = {}): BotState {
  return {
    position: { x: 10, y: 64, z: 10 },
    health: 5,
    food: 3,
    inventory: [{ name: 'dirt', count: 12 }],
    biome: 'plains',
    nearbyHostiles: 0,
    ...overrides,
  };
}

function makeNormalBotState(overrides: Partial<BotState> = {}): BotState {
  return {
    position: { x: 10, y: 64, z: 10 },
    health: 20,
    food: 20,
    inventory: [{ name: 'dirt', count: 12 }],
    biome: 'plains',
    nearbyHostiles: 0,
    ...overrides,
  };
}

function makeKeepAliveThought(overrides: Record<string, unknown> = {}) {
  return {
    id: 'thought-vitals-1',
    content: 'I am very hungry and my health is low.',
    rawOutput: 'I am very hungry and my health is low.',
    source: 'keepalive' as const,
    timestamp: Date.now(),
    frameProfile: 'balanced',
    sterlingUsed: true,
    isExecutable: false,
    blockReason: null,
    committedGoalPropId: null,
    committedIrDigest: 'digest_abc',
    envelopeId: 'env_1',
    processingDurationMs: 50,
    groundingPerformed: false,
    groundingResult: null,
    eligibility: {
      convertEligible: true,
      derived: true,
      reasoning: 'vitals urgent',
    },
    ...overrides,
  };
}

function makeSterlingReduceResult(goalPropId: string = 'goal_food_1') {
  return {
    result: {
      committed_goal_prop_id: goalPropId,
      committed_ir_digest: 'vitals_digest_1',
      source_envelope_id: 'vitals_env_1',
      is_executable: true,
      is_semantically_empty: false,
      advisory: null,
      grounding: null,
      schema_version: '1.1.0',
      reducer_version: 'idle-episode-v1',
    },
    envelope: { envelope_id: 'vitals_env_1' },
    durationMs: 100,
  };
}

async function createInitializedIntegration(overrides: Record<string, unknown> = {}) {
  const integration = new KeepAliveIntegration({
    enabled: true,
    enableSterlingIdleEpisodes: false,
    _controllerFactory: createStubController as any,
    cognitionServiceUrl: 'http://localhost:3003',
    idleEpisodeTimeoutMs: 5000,
    ...overrides,
  });
  await integration.initialize();
  return integration;
}

// ============================================================================
// Tests
// ============================================================================

describe('keep-alive vitals → Sterling reduce re-route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    thoughtHandler = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('re-routes vitals thought through Sterling reduce when goal-prop is null', async () => {
    const integration = await createInitializedIntegration();

    // Cache urgent bot state via onIdle
    await integration.onIdle(makeExecutorState(), makeUrgentBotState());

    // Mock Sterling reduce to return executable result with real goal-prop
    mockReduce.mockResolvedValueOnce(makeSterlingReduceResult('goal_food_1'));

    // Trigger onThought via the captured handler
    expect(thoughtHandler).not.toBeNull();
    await thoughtHandler!({}, makeKeepAliveThought());

    // Sterling reduce should have been called
    expect(mockReduce).toHaveBeenCalledTimes(1);
    expect(mockReduce).toHaveBeenCalledWith(
      expect.stringContaining('idle_episode_v1'),
      expect.objectContaining({ promptDigest: 'idle_episode_v1' }),
    );

    // postThoughtToCognition should have been called with vitals_rerouted
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3003/thought-generated',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('vitals_rerouted'),
      }),
    );

    // Parse the posted thought to verify structure
    const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
    expect(body.thought.metadata.vitals_rerouted).toBe(true);
    expect(body.thought.metadata.reduction.reducerResult.committed_goal_prop_id).toBe('goal_food_1');
  });

  it('does not re-route when vitals are normal', async () => {
    const integration = await createInitializedIntegration();

    // Cache NORMAL bot state
    await integration.onIdle(makeExecutorState(), makeNormalBotState());

    await thoughtHandler!({}, makeKeepAliveThought());

    // Sterling reduce should NOT be called for vitals
    expect(mockReduce).not.toHaveBeenCalled();

    // Original thought should still be posted
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not re-route when committed goal-prop already exists', async () => {
    const integration = await createInitializedIntegration();
    await integration.onIdle(makeExecutorState(), makeUrgentBotState());

    // Thought already has a real goal-prop
    await thoughtHandler!({}, makeKeepAliveThought({
      committedGoalPropId: 'real_goal_prop',
    }));

    // No re-route needed — goal-prop exists
    expect(mockReduce).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not re-route when lastBotState is null', async () => {
    const integration = await createInitializedIntegration();

    // Never call onIdle → lastBotState stays null
    await thoughtHandler!({}, makeKeepAliveThought());

    // No vitals re-route without bot state
    expect(mockReduce).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls through gracefully when Sterling reduce fails', async () => {
    const integration = await createInitializedIntegration();
    await integration.onIdle(makeExecutorState(), makeUrgentBotState());

    // Sterling reduce throws
    mockReduce.mockRejectedValueOnce(new Error('connection_refused'));

    await thoughtHandler!({}, makeKeepAliveThought());

    // Original thought should still be posted (not lost)
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
    // Should NOT have vitals_rerouted since reduce failed
    expect(body.thought.metadata.vitals_rerouted).toBeUndefined();
  });

  it('rate-limits vitals reroute to at most once per cooldown window', async () => {
    const integration = await createInitializedIntegration();
    await integration.onIdle(makeExecutorState(), makeUrgentBotState());

    // First reroute: succeeds
    mockReduce.mockResolvedValueOnce(makeSterlingReduceResult('goal_1'));
    await thoughtHandler!({}, makeKeepAliveThought({ id: 'thought-rate-1' }));
    expect(mockReduce).toHaveBeenCalledTimes(1);

    // Second reroute immediately after: should be rate-limited (no Sterling call)
    mockFetch.mockClear();
    await thoughtHandler!({}, makeKeepAliveThought({ id: 'thought-rate-2' }));
    // mockReduce NOT called again — rate limited
    expect(mockReduce).toHaveBeenCalledTimes(1);
    // Original thought still posted (fallthrough)
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
    expect(body.thought.metadata.vitals_rerouted).toBeUndefined();
  });

  it('falls through when Sterling returns non-executable', async () => {
    const integration = await createInitializedIntegration();
    await integration.onIdle(makeExecutorState(), makeUrgentBotState());

    // Sterling returns non-executable result
    const blocked = makeSterlingReduceResult();
    blocked.result.is_executable = false;
    mockReduce.mockResolvedValueOnce(blocked);

    await thoughtHandler!({}, makeKeepAliveThought());

    // Original thought posted (fallthrough)
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
    expect(body.thought.metadata.vitals_rerouted).toBeUndefined();
  });
});

// ============================================================================
// thought-to-task-converter: transient drop for keepalive
// ============================================================================

describe('dropped_no_goal_prop transient for keepalive', () => {
  it('thought not marked as processed when dropped_no_goal_prop + source=keepalive', async () => {
    const { convertThoughtToTask } = await import('../../task-integration/thought-to-task-converter');

    const markThoughtAsProcessed = vi.fn();
    const deps = {
      addTask: vi.fn(),
      markThoughtAsProcessed,
      seenThoughtIds: new Set<string>(),
      trimSeenThoughtIds: vi.fn(),
    };

    // Keepalive thought with Sterling reduction but null goal-prop
    const thought = {
      id: 'keepalive-vitals-1',
      type: 'planning',
      content: 'I am hungry',
      attribution: 'llm',
      timestamp: Date.now(),
      processed: false,
      context: {
        emotionalState: 'stressed',
        confidence: 0.5,
        cognitiveSystem: 'generator',
      },
      metadata: {
        thoughtType: 'planning',
        source: 'keepalive',
        reduction: {
          sterlingProcessed: true,
          envelopeId: 'env_1',
          reducerResult: {
            committed_goal_prop_id: null,
            committed_ir_digest: 'digest_1',
            source_envelope_id: 'env_1',
            is_executable: true,
            is_semantically_empty: false,
            advisory: null,
            grounding: null,
            schema_version: '1.1.0',
            reducer_version: 'keepalive-bridge-v1',
          },
          isExecutable: true,
          blockReason: null,
          durationMs: 10,
          sterlingError: null,
        },
      },
    };

    const result = await convertThoughtToTask(thought as any, deps as any);

    expect(result.decision).toBe('dropped_no_goal_prop');
    // Keepalive thoughts with no goal-prop should NOT be marked as processed
    // (transient — may become re-routable when botState arrives)
    expect(markThoughtAsProcessed).not.toHaveBeenCalled();
  });

  it('non-keepalive thought IS marked as processed when dropped_no_goal_prop', async () => {
    const { convertThoughtToTask } = await import('../../task-integration/thought-to-task-converter');

    const markThoughtAsProcessed = vi.fn();
    const deps = {
      addTask: vi.fn(),
      markThoughtAsProcessed,
      seenThoughtIds: new Set<string>(),
      trimSeenThoughtIds: vi.fn(),
    };

    // Non-keepalive thought with null goal-prop
    const thought = {
      id: 'thought-non-ka',
      type: 'planning',
      content: 'I should build a house',
      attribution: 'llm',
      timestamp: Date.now(),
      processed: false,
      context: {
        emotionalState: 'focused',
        confidence: 0.7,
        cognitiveSystem: 'generator',
      },
      metadata: {
        thoughtType: 'planning',
        source: 'llm',
        reduction: {
          sterlingProcessed: true,
          envelopeId: 'env_2',
          reducerResult: {
            committed_goal_prop_id: null,
            committed_ir_digest: 'digest_2',
            source_envelope_id: 'env_2',
            is_executable: true,
            is_semantically_empty: false,
            advisory: null,
            grounding: null,
            schema_version: '1.1.0',
            reducer_version: 'v1',
          },
          isExecutable: true,
          blockReason: null,
          durationMs: 10,
          sterlingError: null,
        },
      },
    };

    const result = await convertThoughtToTask(thought as any, deps as any);

    expect(result.decision).toBe('dropped_no_goal_prop');
    // Non-keepalive thoughts SHOULD be marked as processed (deterministic)
    expect(markThoughtAsProcessed).toHaveBeenCalledWith('thought-non-ka');
  });

  it('keepalive dropped_no_goal_prop marked processed after TTL expires', async () => {
    const { convertThoughtToTask } = await import('../../task-integration/thought-to-task-converter');

    const markThoughtAsProcessed = vi.fn();
    const deps = {
      addTask: vi.fn(),
      markThoughtAsProcessed,
      seenThoughtIds: new Set<string>(),
      trimSeenThoughtIds: vi.fn(),
    };

    // Keepalive thought older than 2 minutes (TTL expired)
    const thought = {
      id: 'keepalive-old-1',
      type: 'planning',
      content: 'I am hungry',
      attribution: 'llm',
      timestamp: Date.now() - 150_000, // 2.5 minutes ago
      processed: false,
      context: { emotionalState: 'stressed', confidence: 0.5, cognitiveSystem: 'generator' },
      metadata: {
        thoughtType: 'planning',
        source: 'keepalive',
        reduction: {
          sterlingProcessed: true,
          envelopeId: 'env_ttl',
          reducerResult: {
            committed_goal_prop_id: null,
            committed_ir_digest: 'digest_ttl',
            source_envelope_id: 'env_ttl',
            is_executable: true,
            is_semantically_empty: false,
            advisory: null,
            grounding: null,
            schema_version: '1.1.0',
            reducer_version: 'keepalive-bridge-v1',
          },
          isExecutable: true,
          blockReason: null,
          durationMs: 10,
          sterlingError: null,
        },
      },
    };

    const result = await convertThoughtToTask(thought as any, deps as any);

    expect(result.decision).toBe('dropped_no_goal_prop');
    // TTL expired → mark as processed to prevent infinite churn
    expect(markThoughtAsProcessed).toHaveBeenCalledWith('keepalive-old-1');
  });
});
