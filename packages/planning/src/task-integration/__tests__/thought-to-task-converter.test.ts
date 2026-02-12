/**
 * Thought-to-task converter tests (Sterling reduction path only).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  convertThoughtToTask,
  type ConvertThoughtToTaskDeps,
} from '../thought-to-task-converter';
import type { CognitiveStreamThought } from '../../modules/cognitive-stream-client';
import type { Task } from '../../types/task';
import type { ReductionProvenance } from '@conscious-bot/cognition';
import { TaskManagementHandler } from '../task-management-handler';
import { TaskStore } from '../task-store';

let idCounter = 0;
let digestCounter = 0;

function makeReduction(overrides: Partial<ReductionProvenance> = {}): ReductionProvenance {
  digestCounter += 1;
  const digest = `digest_${digestCounter}`;
  return {
    sterlingProcessed: true,
    envelopeId: 'env_1',
    reducerResult: {
      committed_goal_prop_id: 'prop_1',
      committed_ir_digest: digest,
      source_envelope_id: 'env_1',
      is_executable: true,
      is_semantically_empty: false,
      advisory: null,
      grounding: null,
      schema_version: 'v1',
      reducer_version: 'r1',
    },
    isExecutable: true,
    blockReason: null,
    durationMs: 12,
    sterlingError: null,
    ...overrides,
  };
}

function makeThought(overrides: Partial<CognitiveStreamThought> = {}): CognitiveStreamThought {
  idCounter++;
  return {
    id: `thought_${idCounter}`,
    type: 'planning',
    content: 'I should craft a crafting table.',
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
      llmConfidence: 0.8,
      model: 'gemma3n',
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ConvertThoughtToTaskDeps> = {}): ConvertThoughtToTaskDeps {
  return {
    addTask: vi.fn(async (taskData: Partial<Task>) => taskData as Task),
    markThoughtAsProcessed: vi.fn(async () => {}),
    seenThoughtIds: new Set<string>(),
    trimSeenThoughtIds: vi.fn(),
    ...overrides,
  };
}

describe('convertThoughtToTask (Sterling reduction)', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it('fails closed when reduction is missing', async () => {
    const deps = makeDeps();
    const thought = makeThought({ metadata: { thoughtType: 'planning' } });

    const result = await convertThoughtToTask(thought, deps);
    expect(result.task).toBeNull();
    expect(result.decision).toBe('dropped_no_reduction');
  });

  it('fails closed when sterlingProcessed=false', async () => {
    const deps = makeDeps();
    const thought = makeThought({
      metadata: { thoughtType: 'planning', reduction: makeReduction({ sterlingProcessed: false }) },
    });

    const result = await convertThoughtToTask(thought, deps);
    expect(result.task).toBeNull();
    expect(result.decision).toBe('dropped_sterling_unavailable');
  });

  it('fails closed when isExecutable=false', async () => {
    const deps = makeDeps();
    const thought = makeThought({
      metadata: { thoughtType: 'planning', reduction: makeReduction({ isExecutable: false, blockReason: 'nope' }) },
    });

    const result = await convertThoughtToTask(thought, deps);
    expect(result.task).toBeNull();
    expect(result.decision).toBe('dropped_not_executable');
  });

  it('fails closed when committed_ir_digest missing', async () => {
    const deps = makeDeps();
    const reduction = makeReduction({ reducerResult: { ...makeReduction().reducerResult!, committed_ir_digest: '' } });
    const thought = makeThought({ metadata: { thoughtType: 'planning', reduction } });

    const result = await convertThoughtToTask(thought, deps);
    expect(result.task).toBeNull();
    expect(result.decision).toBe('dropped_missing_digest');
  });

  it('creates task when reduction ok and digest present', async () => {
    const deps = makeDeps();
    const thought = makeThought({
      metadata: { thoughtType: 'planning', reduction: makeReduction() },
    });

    const result = await convertThoughtToTask(thought, deps);
    expect(result.task).toBeDefined();
    expect(result.decision).toBe('created');
    expect(result.task?.metadata?.sterling?.committedIrDigest).toBeTruthy();
  });

  it('dedupes by committed_ir_digest', async () => {
    const deps = makeDeps();
    const reduction = makeReduction();
    const thoughtA = makeThought({ metadata: { thoughtType: 'planning', reduction } });
    const thoughtB = makeThought({ metadata: { thoughtType: 'planning', reduction } });

    const first = await convertThoughtToTask(thoughtA, deps);
    const second = await convertThoughtToTask(thoughtB, deps);

    expect(first.decision).toBe('created');
    expect(second.decision).toBe('suppressed_dedup');
  });

  it('ignores legacy extractedGoal even if present', async () => {
    const deps = makeDeps();
    const thought = makeThought({
      metadata: {
        thoughtType: 'planning',
        reduction: makeReduction({ isExecutable: false }),
        // legacy field should not affect conversion
        extractedGoal: { action: 'mine', target: 'iron', amount: 3 },
      } as any,
    });

    const result = await convertThoughtToTask(thought, deps);
    expect(result.task).toBeNull();
    expect(result.decision).toBe('dropped_not_executable');
  });

  it('dispatches explicit Sterling management action', async () => {
    const store = new TaskStore();
    store.setTask({
      id: 'task_1',
      title: 'test',
      description: 'test',
      type: 'sterling_ir',
      priority: 0.5,
      urgency: 0.5,
      progress: 0,
      status: 'active',
      source: 'autonomous',
      steps: [],
      parameters: {},
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'sterling_ir',
      },
    });

    const handler = new TaskManagementHandler(store);
    const deps = makeDeps({ managementHandler: handler });
    const reduction = makeReduction({
      reducerResult: {
        ...makeReduction().reducerResult!,
        management_action: { action: 'cancel', target: { task_id: 'task_1' } },
      } as any,
    });

    const thought = makeThought({
      metadata: { thoughtType: 'planning', reduction },
    });

    const result = await convertThoughtToTask(thought, deps);
    expect(result.decision).toBe('management_applied');
    expect(store.getTask('task_1')?.status).toBe('failed');
  });

  // ── Diagnostic instrumentation tests (Upgrade 3) ──

  describe('[Thought→Task] structured log emission', () => {
    it('emits structured log on successful creation', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const deps = makeDeps();
      const thought = makeThought({
        metadata: { thoughtType: 'planning', reduction: makeReduction() },
      });

      await convertThoughtToTask(thought, deps);

      const diagLog = spy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0] === '[Thought→Task]'
      );
      expect(diagLog).toBeDefined();

      const payload = JSON.parse(diagLog![1] as string);
      expect(payload).toHaveProperty('_diag_version', 1);
      expect(payload).toHaveProperty('thought_id');
      expect(payload).toHaveProperty('decision', 'created');
      expect(payload).toHaveProperty('has_committed_ir_digest', true);
      expect(payload).toHaveProperty('reducer_is_executable', true);
      expect(payload).toHaveProperty('sterling_processed', true);

      spy.mockRestore();
    });

    it('emits structured log when dropped as not executable', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const deps = makeDeps();
      const thought = makeThought({
        metadata: {
          thoughtType: 'planning',
          reduction: makeReduction({ isExecutable: false }),
        },
      });

      await convertThoughtToTask(thought, deps);

      const diagLog = spy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0] === '[Thought→Task]'
      );
      expect(diagLog).toBeDefined();

      const payload = JSON.parse(diagLog![1] as string);
      expect(payload).toHaveProperty('decision', 'dropped_not_executable');
      expect(payload).toHaveProperty('reducer_is_executable', false);

      spy.mockRestore();
    });

    it('emits structured log for dedup suppression', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const deps = makeDeps();
      const reduction = makeReduction();
      // First call creates the task
      const thought1 = makeThought({
        metadata: { thoughtType: 'planning', reduction },
      });
      await convertThoughtToTask(thought1, deps);

      // Second call with same digest should be suppressed
      const thought2 = makeThought({
        metadata: { thoughtType: 'planning', reduction },
      });
      await convertThoughtToTask(thought2, deps);

      const diagLogs = spy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0] === '[Thought→Task]'
      );
      // Should have 2 logs: one 'created', one 'suppressed_dedup'
      expect(diagLogs.length).toBeGreaterThanOrEqual(2);

      const lastPayload = JSON.parse(diagLogs[diagLogs.length - 1]![1] as string);
      expect(lastPayload).toHaveProperty('decision', 'suppressed_dedup');

      spy.mockRestore();
    });
  });
});
