/**
 * Cognition–Planning Handshake E2E Test
 *
 * Validates the bridge between the cognition service and the planning service:
 *   1. CognitiveStreamClient fetches thoughts from the cognition HTTP endpoint
 *   2. Thoughts with valid Sterling reduction are converted to tasks
 *   3. All reduction guard rails reject malformed/incomplete thoughts
 *   4. Dedup prevents the same digest from producing duplicate tasks
 *
 * Mocks: HTTP endpoint (simulates what cognition serves)
 * Real: CognitiveStreamClient, convertThoughtToTask, reduction validation
 *
 * Run with: npx vitest run packages/planning/src/__tests__/cognition-planning-handshake-e2e.test.ts
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CognitiveStreamClient } from '../modules/cognitive-stream-client';
import type { CognitiveStreamThought } from '../modules/cognitive-stream-client';
import {
  convertThoughtToTask,
  __resetDedupStateForTests,
  type ConvertThoughtToTaskDeps,
} from '../task-integration/thought-to-task-converter';
import type { Task } from '../types/task';
import type { ReductionProvenance } from '@conscious-bot/cognition';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

let digestSeq = 0;

function makeValidReduction(overrides: Partial<ReductionProvenance> = {}): ReductionProvenance {
  digestSeq += 1;
  return {
    sterlingProcessed: true,
    envelopeId: `env_${digestSeq}`,
    reducerResult: {
      committed_goal_prop_id: `prop_${digestSeq}`,
      committed_ir_digest: `digest_${digestSeq}`,
      source_envelope_id: `env_${digestSeq}`,
      is_executable: true,
      is_semantically_empty: false,
      advisory: null,
      grounding: null,
      schema_version: 'v1',
      reducer_version: 'r1',
    },
    isExecutable: true,
    blockReason: null,
    durationMs: 15,
    sterlingError: null,
    ...overrides,
  };
}

function makeThought(overrides: Partial<CognitiveStreamThought> = {}): CognitiveStreamThought {
  digestSeq += 1;
  return {
    id: `thought_${digestSeq}`,
    type: 'planning',
    content: 'I should craft a wooden pickaxe.',
    attribution: 'llm',
    timestamp: Date.now(),
    processed: false,
    convertEligible: true,
    context: {
      emotionalState: 'focused',
      confidence: 0.8,
      cognitiveSystem: 'generator',
    },
    metadata: {
      thoughtType: 'planning',
      llmConfidence: 0.85,
      model: 'gemma3n',
      reduction: makeValidReduction(),
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ConvertThoughtToTaskDeps> = {}): ConvertThoughtToTaskDeps {
  return {
    addTask: vi.fn(async (taskData: Partial<Task>) => ({
      id: `task-${Date.now()}`,
      title: taskData.title || 'Untitled',
      description: taskData.description || '',
      type: taskData.type || 'sterling_ir',
      priority: 0.5,
      urgency: 0.5,
      progress: 0,
      status: 'pending_planning',
      source: 'planner',
      steps: [],
      parameters: taskData.parameters || {},
      metadata: taskData.metadata || ({} as Task['metadata']),
      ...taskData,
    }) as Task),
    markThoughtAsProcessed: vi.fn(async () => {}),
    seenThoughtIds: new Set<string>(),
    trimSeenThoughtIds: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fake HTTP server for CognitiveStreamClient
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

function stubCognitionEndpoint(thoughts: CognitiveStreamThought[]) {
  mockFetch.mockImplementation(async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (urlStr.includes('/api/cognitive-stream/recent')) {
      return {
        ok: true,
        json: async () => ({ success: true, thoughts, count: thoughts.length, timestamp: Date.now() }),
      };
    }
    if (urlStr.includes('/api/cognitive-stream/actionable')) {
      const actionable = thoughts.filter((t) => t.convertEligible && !t.processed);
      return {
        ok: true,
        json: async () => ({ success: true, thoughts: actionable, count: actionable.length, timestamp: Date.now() }),
      };
    }
    if (urlStr.includes('/api/cognitive-stream/ack')) {
      return {
        ok: true,
        json: async () => ({ success: true, ackedCount: 1, requestedCount: 1, mismatchCount: 0 }),
      };
    }
    return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cognition–Planning Handshake E2E', () => {
  beforeEach(() => {
    digestSeq = 0;
    __resetDedupStateForTests();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Stage 1: CognitiveStreamClient fetches thoughts ──

  describe('Stage 1: CognitiveStreamClient → /api/cognitive-stream/recent', () => {
    it('fetches thoughts from the cognition endpoint', async () => {
      const thoughts = [makeThought(), makeThought()];
      stubCognitionEndpoint(thoughts);

      const client = new CognitiveStreamClient({ baseUrl: 'http://localhost:3003' });
      const result = await client.getRecentThoughts();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(thoughts[0].id);
      expect(result[1].metadata.reduction).toBeDefined();
    });

    it('returns empty array when cognition is unavailable', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const client = new CognitiveStreamClient({ baseUrl: 'http://localhost:3003', timeoutMs: 100 });
      const result = await client.getRecentThoughts();

      expect(result).toEqual([]);
    });

    it('returns empty array on non-200 response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'internal error' }),
      });

      const client = new CognitiveStreamClient({ baseUrl: 'http://localhost:3003' });
      const result = await client.getRecentThoughts();

      expect(result).toEqual([]);
    });
  });

  // ── Stage 2: Thought → Task conversion (happy path) ──

  describe('Stage 2: convertThoughtToTask (valid reduction)', () => {
    it('creates sterling_ir task from thought with valid reduction', async () => {
      const thought = makeThought();
      const deps = makeDeps();

      const result = await convertThoughtToTask(thought, deps);

      expect(result.decision).toBe('created');
      expect(result.task).not.toBeNull();
      expect(result.task!.type).toBe('sterling_ir');

      // Verify sterling metadata was preserved
      const sterling = result.task!.metadata?.sterling as Record<string, unknown>;
      expect(sterling).toBeDefined();
      expect(sterling.committedIrDigest).toBe(
        thought.metadata.reduction!.reducerResult!.committed_ir_digest,
      );
      expect(sterling.schemaVersion).toBe('v1');
    });

    it('marks thought as processed after successful conversion', async () => {
      const thought = makeThought();
      const deps = makeDeps();

      await convertThoughtToTask(thought, deps);

      expect(deps.markThoughtAsProcessed).toHaveBeenCalledWith(thought.id);
    });

    it('calls addTask with correct sterling metadata shape', async () => {
      const thought = makeThought();
      const deps = makeDeps();

      await convertThoughtToTask(thought, deps);

      const addTaskCall = (deps.addTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(addTaskCall.type).toBe('sterling_ir');
      expect(addTaskCall.metadata.sterling).toMatchObject({
        committedIrDigest: expect.any(String),
        envelopeId: expect.any(String),
        schemaVersion: 'v1',
        reducerVersion: 'r1',
      });
    });
  });

  // ── Stage 3: Reduction guard rails (fail-closed) ──

  describe('Stage 3: Reduction guard rails', () => {
    it('rejects thought with no reduction metadata', async () => {
      const thought = makeThought({
        metadata: { thoughtType: 'planning', llmConfidence: 0.8, model: 'gemma3n' },
      });
      const deps = makeDeps();

      const result = await convertThoughtToTask(thought, deps);

      expect(result.decision).toBe('dropped_no_reduction');
      expect(result.task).toBeNull();
      expect(deps.addTask).not.toHaveBeenCalled();
    });

    it('rejects thought where sterlingProcessed=false', async () => {
      const thought = makeThought({
        metadata: {
          thoughtType: 'planning',
          llmConfidence: 0.8,
          model: 'gemma3n',
          reduction: makeValidReduction({ sterlingProcessed: false }),
        },
      });
      const deps = makeDeps();

      const result = await convertThoughtToTask(thought, deps);

      expect(result.decision).toBe('dropped_sterling_unavailable');
      expect(result.task).toBeNull();
    });

    it('rejects thought where isExecutable=false', async () => {
      const thought = makeThought({
        metadata: {
          thoughtType: 'planning',
          llmConfidence: 0.8,
          model: 'gemma3n',
          reduction: makeValidReduction({
            isExecutable: false,
            blockReason: 'ambiguous_goal',
          }),
        },
      });
      const deps = makeDeps();

      const result = await convertThoughtToTask(thought, deps);

      expect(result.decision).toBe('dropped_not_executable');
      expect(result.task).toBeNull();
    });

    it('rejects thought with empty committed_ir_digest', async () => {
      const reduction = makeValidReduction();
      (reduction.reducerResult as any).committed_ir_digest = '';
      const thought = makeThought({
        metadata: {
          thoughtType: 'planning',
          llmConfidence: 0.8,
          model: 'gemma3n',
          reduction,
        },
      });
      const deps = makeDeps();

      const result = await convertThoughtToTask(thought, deps);

      expect(result.decision).toBe('dropped_missing_digest');
      expect(result.task).toBeNull();
    });

    it('rejects thought with missing schema_version', async () => {
      const reduction = makeValidReduction();
      (reduction.reducerResult as any).schema_version = '';
      const thought = makeThought({
        metadata: {
          thoughtType: 'planning',
          llmConfidence: 0.8,
          model: 'gemma3n',
          reduction,
        },
      });
      const deps = makeDeps();

      const result = await convertThoughtToTask(thought, deps);

      expect(result.decision).toBe('dropped_missing_schema_version');
      expect(result.task).toBeNull();
    });

    it('rejects semantically empty IR', async () => {
      const reduction = makeValidReduction();
      (reduction.reducerResult as any).is_semantically_empty = true;
      const thought = makeThought({
        metadata: {
          thoughtType: 'planning',
          llmConfidence: 0.8,
          model: 'gemma3n',
          reduction,
        },
      });
      const deps = makeDeps();

      const result = await convertThoughtToTask(thought, deps);

      expect(result.decision).toBe('dropped_semantically_empty');
      expect(result.task).toBeNull();
    });

    it('rejects thought with null committed_goal_prop_id', async () => {
      const reduction = makeValidReduction();
      (reduction.reducerResult as any).committed_goal_prop_id = null;
      const thought = makeThought({
        metadata: {
          thoughtType: 'planning',
          llmConfidence: 0.8,
          model: 'gemma3n',
          reduction,
        },
      });
      const deps = makeDeps();

      const result = await convertThoughtToTask(thought, deps);

      expect(result.decision).toBe('dropped_no_goal_prop');
      expect(result.task).toBeNull();
    });
  });

  // ── Stage 4: Dedup by digest ──

  describe('Stage 4: Digest deduplication', () => {
    it('deduplicates thoughts with the same id', async () => {
      const thought = makeThought();
      const seenThoughtIds = new Set<string>();
      const deps = makeDeps({ seenThoughtIds });

      // First conversion succeeds
      const r1 = await convertThoughtToTask(thought, deps);
      expect(r1.decision).toBe('created');

      // Second conversion with same thought id is dropped
      const r2 = await convertThoughtToTask(thought, deps);
      expect(r2.decision).toBe('dropped_seen');
      expect(r2.task).toBeNull();
    });
  });

  // ── Stage 5: Full round-trip (fetch + convert) ──

  describe('Stage 5: Full round-trip (fetch → convert)', () => {
    it('fetches thoughts from cognition and converts eligible ones to tasks', async () => {
      const validThought = makeThought();
      const noReductionThought = makeThought({
        metadata: { thoughtType: 'observation', llmConfidence: 0.3, model: 'gemma3n' },
      });
      const alreadyProcessed = makeThought({ processed: true });

      stubCognitionEndpoint([validThought, noReductionThought, alreadyProcessed]);

      // Step 1: Fetch
      const client = new CognitiveStreamClient({ baseUrl: 'http://localhost:3003' });
      const thoughts = await client.getRecentThoughts();
      expect(thoughts).toHaveLength(3);

      // Step 2: Convert each
      const deps = makeDeps();
      const results = [];
      for (const thought of thoughts) {
        results.push(await convertThoughtToTask(thought, deps));
      }

      // Only the valid thought should create a task
      const created = results.filter((r) => r.decision === 'created');
      const dropped = results.filter((r) => r.decision !== 'created');

      expect(created).toHaveLength(1);
      expect(created[0].task!.type).toBe('sterling_ir');

      // The dropped ones should have specific rejection reasons
      expect(dropped).toHaveLength(2);
      const decisions = new Set(dropped.map((r) => r.decision));
      expect(decisions.has('dropped_no_reduction')).toBe(true);
    });

    it('handles mixed batch: valid, invalid, and already-seen thoughts', async () => {
      const thought1 = makeThought();
      const thought2 = makeThought();
      // thought3 shares thought1's ID (duplicate)
      const thought3 = { ...makeThought(), id: thought1.id };

      stubCognitionEndpoint([thought1, thought2, thought3]);

      const client = new CognitiveStreamClient({ baseUrl: 'http://localhost:3003' });
      const thoughts = await client.getRecentThoughts();

      const deps = makeDeps();
      const results = [];
      for (const thought of thoughts) {
        results.push(await convertThoughtToTask(thought, deps));
      }

      expect(results[0].decision).toBe('created');
      expect(results[1].decision).toBe('created');
      expect(results[2].decision).toBe('dropped_seen'); // duplicate ID
    });
  });
});
