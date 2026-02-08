/**
 * Path B integration test: idle episode → thought → resolveReduction → task creation.
 *
 * Tests the full idle-episode-to-task chain with mocked Sterling responses,
 * verifying the 5-gate fail-closed behavior of resolveReduction and the
 * dedupe lease preventing duplicate tasks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  convertThoughtToTask,
  type ConvertThoughtToTaskDeps,
} from '../thought-to-task-converter';
import type { CognitiveStreamThought } from '../../modules/cognitive-stream-client';
import type { Task } from '../../types/task';
import type { ReductionProvenance } from '@conscious-bot/cognition';

let idCounter = 0;
// Use globally unique digest values (never collide across tests) because the
// converter's recentDigestHashes is a module-level singleton that persists.
let digestCounter = 0;
const testRunId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

beforeEach(() => {
  idCounter = 0;
  // digestCounter is NOT reset — ensures globally unique digests across tests
  // since recentDigestHashes is a module-level singleton that persists.
});

function makeReduction(overrides: Partial<ReductionProvenance> = {}): ReductionProvenance {
  digestCounter += 1;
  const digest = `idle_digest_${testRunId}_${digestCounter}`;
  return {
    sterlingProcessed: true,
    envelopeId: `env_idle_${digestCounter}`,
    reducerResult: {
      committed_goal_prop_id: 'prop_idle',
      committed_ir_digest: digest,
      source_envelope_id: `env_idle_${digestCounter}`,
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

function makeIdleThought(overrides: Partial<CognitiveStreamThought> = {}): CognitiveStreamThought {
  idCounter++;
  return {
    id: `idle-episode-${idCounter}`,
    type: 'observation',
    content: 'Idle episode (sterling executable)',
    attribution: 'system',
    timestamp: Date.now(),
    processed: false,
    context: {
      emotionalState: 'neutral',
      confidence: 0.5,
      cognitiveSystem: 'keepalive',
    },
    metadata: {
      thoughtType: 'idle-episode',
      reduction: makeReduction(),
      goldenRun: { runId: 'run-1', requestedAt: Date.now(), source: 'idle_episode' },
    } as any,
    convertEligible: true,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ConvertThoughtToTaskDeps> = {}): ConvertThoughtToTaskDeps {
  return {
    addTask: vi.fn(async (taskData: Partial<Task>) => ({
      ...taskData,
      id: taskData.id || `task-${Date.now()}`,
      status: taskData.type === 'sterling_ir' ? 'pending_planning' : 'pending',
    } as Task)),
    markThoughtAsProcessed: vi.fn(async () => {}),
    seenThoughtIds: new Set<string>(),
    trimSeenThoughtIds: vi.fn(),
    ...overrides,
  };
}

describe('Path B: idle episode → thought → task (integration)', () => {
  describe('positive: full chain', () => {
    it('creates a sterling_ir task from an idle episode thought with valid reduction', async () => {
      const deps = makeDeps();
      const thought = makeIdleThought();

      const result = await convertThoughtToTask(thought, deps);

      expect(result.decision).toBe('created');
      expect(result.task).not.toBeNull();
      expect(deps.addTask).toHaveBeenCalledOnce();

      const taskData = (deps.addTask as any).mock.calls[0][0] as Partial<Task>;
      expect(taskData.type).toBe('sterling_ir');
      expect(taskData.source).toBe('autonomous');
      expect(taskData.metadata?.sterling).toBeDefined();
      expect((taskData.metadata?.sterling as any)?.committedIrDigest).toMatch(/^idle_digest_/);
      expect((taskData.metadata?.sterling as any)?.schemaVersion).toBe('v1');
    });

    it('passes committed_ir_digest and schema_version through to task metadata', async () => {
      const deps = makeDeps();
      const thought = makeIdleThought();

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('created');
      expect(result.task).not.toBeNull();

      const taskData = (deps.addTask as any).mock.calls[0][0] as Partial<Task>;
      const sterling = taskData.metadata?.sterling as any;
      expect(sterling.committedIrDigest).toBeTruthy();
      expect(sterling.schemaVersion).toBe('v1');
    });
  });

  describe('negative: fail-closed on missing digest', () => {
    it('drops thought when committed_ir_digest is missing', async () => {
      const deps = makeDeps();
      const reduction = makeReduction();
      (reduction.reducerResult as any).committed_ir_digest = '';

      const thought = makeIdleThought({
        metadata: {
          thoughtType: 'idle-episode',
          reduction,
        } as any,
        convertEligible: true,
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('dropped_missing_digest');
      expect(result.task).toBeNull();
      expect(deps.addTask).not.toHaveBeenCalled();
    });
  });

  describe('negative: fail-closed on missing schema_version', () => {
    it('drops thought when schema_version is missing', async () => {
      const deps = makeDeps();
      const reduction = makeReduction();
      (reduction.reducerResult as any).schema_version = '';

      const thought = makeIdleThought({
        metadata: {
          thoughtType: 'idle-episode',
          reduction,
        } as any,
        convertEligible: true,
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('dropped_missing_schema_version');
      expect(result.task).toBeNull();
      expect(deps.addTask).not.toHaveBeenCalled();
    });
  });

  describe('negative: fail-closed on not executable', () => {
    it('drops thought when is_executable=false', async () => {
      const deps = makeDeps();
      const reduction = makeReduction({
        isExecutable: false,
        blockReason: 'blocked_no_action',
      });
      (reduction.reducerResult as any).is_executable = false;

      const thought = makeIdleThought({
        metadata: {
          thoughtType: 'idle-episode',
          reduction,
        } as any,
        convertEligible: true,
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('dropped_not_executable');
      expect(result.task).toBeNull();
      expect(deps.addTask).not.toHaveBeenCalled();
    });
  });

  describe('dedupe: no duplicate tasks across two idle ticks', () => {
    it('second conversion of same thought ID is deduped via seenThoughtIds', async () => {
      const deps = makeDeps();
      const thought = makeIdleThought();

      const result1 = await convertThoughtToTask(thought, deps);
      expect(result1.decision).toBe('created');

      // Same thought processed again — seenThoughtIds catches it
      const result2 = await convertThoughtToTask(thought, deps);
      expect(result2.decision).toBe('dropped_seen');
      expect(result2.task).toBeNull();
      expect(deps.addTask).toHaveBeenCalledTimes(1); // Only once
    });

    it('different thoughts with same digest are suppressed by digest dedup window', async () => {
      const deps = makeDeps();
      // Use a fixed unique digest for this test
      const sharedDigest = `shared_dedup_test_${testRunId}`;
      const baseResult = {
        committed_goal_prop_id: 'prop_idle',
        committed_ir_digest: sharedDigest,
        source_envelope_id: 'env_dedup',
        is_executable: true,
        is_semantically_empty: false,
        advisory: null,
        grounding: null,
        schema_version: 'v1',
        reducer_version: 'r1',
      };

      // First thought — creates task
      const thought1 = makeIdleThought({
        metadata: {
          thoughtType: 'idle-episode',
          reduction: makeReduction({ reducerResult: baseResult }),
        } as any,
        convertEligible: true,
      });
      const result1 = await convertThoughtToTask(thought1, deps);
      expect(result1.decision).toBe('created');

      // Second thought — different ID but same committed_ir_digest + schema_version
      const thought2 = makeIdleThought({
        metadata: {
          thoughtType: 'idle-episode',
          reduction: makeReduction({ reducerResult: baseResult }),
        } as any,
        convertEligible: true,
      });
      const result2 = await convertThoughtToTask(thought2, deps);
      expect(result2.decision).toBe('suppressed_dedup');
      expect(result2.task).toBeNull();
      expect(deps.addTask).toHaveBeenCalledTimes(1);
    });

    it('thoughts with distinct digests both create tasks', async () => {
      const deps = makeDeps();
      // Each makeIdleThought increments digestCounter, producing unique digests
      const thought1 = makeIdleThought();
      const result1 = await convertThoughtToTask(thought1, deps);
      expect(result1.decision).toBe('created');

      const thought2 = makeIdleThought();
      const result2 = await convertThoughtToTask(thought2, deps);
      expect(result2.decision).toBe('created');
      expect(deps.addTask).toHaveBeenCalledTimes(2);
    });
  });

  describe('gate order verification', () => {
    it('sterlingProcessed=false rejects before checking digest', async () => {
      const deps = makeDeps();
      const reduction = makeReduction({ sterlingProcessed: false });
      (reduction.reducerResult as any).committed_ir_digest = ''; // Also invalid

      const thought = makeIdleThought({
        metadata: {
          thoughtType: 'idle-episode',
          reduction,
        } as any,
        convertEligible: true,
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('dropped_sterling_unavailable');
    });

    it('isExecutable=false rejects before checking digest', async () => {
      const deps = makeDeps();
      const reduction = makeReduction({ isExecutable: false });
      (reduction.reducerResult as any).committed_ir_digest = ''; // Also invalid

      const thought = makeIdleThought({
        metadata: {
          thoughtType: 'idle-episode',
          reduction,
        } as any,
        convertEligible: true,
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('dropped_not_executable');
    });
  });
});
