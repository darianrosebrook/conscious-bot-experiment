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
});
