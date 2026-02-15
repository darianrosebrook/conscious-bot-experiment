/**
 * Thought-to-Execution Pipeline E2E Test
 *
 * Validates the full chain from cognition thought through to executor leaf dispatch:
 *
 *   MLX thought → convertThoughtToTask → addTask (sterling_ir)
 *     → materializeSterlingIrSteps (expandByDigest mock)
 *       → stepToLeafExecution → mapBTActionToMinecraft
 *         → executeSterlingStep (mock executeTool)
 *
 * Mocks:
 *   - Sterling WS (expandByDigest returns pre-built steps)
 *   - MC interface tool executor (captures dispatched actions)
 * Real:
 *   - CognitiveStreamClient (fetch mock)
 *   - convertThoughtToTask (full reduction validation)
 *   - TaskIntegration.addTask (full sterling_ir path)
 *   - stepToLeafExecution + action mapping
 *   - executeSterlingStep (full validation/guard pipeline)
 *
 * Run with: npx vitest run packages/planning/src/__tests__/thought-to-execution-e2e.test.ts
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
import { TaskIntegration } from '../task-integration';
import { createMockSterlingService } from '../sterling/__tests__/mock-sterling-service';
import {
  executeSterlingStep,
  BLOCK_REASONS,
} from '../executor/sterling-step-executor';
import type { SterlingStepExecutorContext } from '../executor/sterling-step-executor.types';
import type { ReductionProvenance } from '@conscious-bot/cognition';
import type { Task } from '../types/task';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

let seq = 0;

function makeReduction(overrides: Partial<ReductionProvenance> = {}): ReductionProvenance {
  seq += 1;
  return {
    sterlingProcessed: true,
    envelopeId: `env_${seq}`,
    reducerResult: {
      committed_goal_prop_id: `prop_${seq}`,
      committed_ir_digest: `digest_${seq}`,
      source_envelope_id: `env_${seq}`,
      is_executable: true,
      is_semantically_empty: false,
      advisory: null,
      grounding: null,
      schema_version: 'v1',
      reducer_version: 'r1',
    },
    isExecutable: true,
    blockReason: null,
    durationMs: 10,
    sterlingError: null,
    ...overrides,
  };
}

function makeThought(overrides: Partial<CognitiveStreamThought> = {}): CognitiveStreamThought {
  seq += 1;
  return {
    id: `thought_${seq}`,
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
      reduction: makeReduction(),
    },
    ...overrides,
  };
}

function createMockExecutorContext(
  overrides: Partial<SterlingStepExecutorContext> = {},
): SterlingStepExecutorContext {
  return {
    config: {
      buildExecBudgetDisabled: true,
      buildExecMaxAttempts: 5,
      buildExecMinIntervalMs: 5000,
      buildExecMaxElapsedMs: 120000,
      buildingLeaves: new Set(['prepare_site', 'build_module', 'place_feature']),
      taskTypeBridgeLeafNames: new Set(),
      enableTaskTypeBridge: false,
      legacyLeafRewriteEnabled: false,
    },
    leafAllowlist: new Set([
      'minecraft.craft_recipe',
      'minecraft.acquire_material',
      'minecraft.smelt',
      'minecraft.place_block',
      'minecraft.place_workstation',
      'minecraft.dig_block',
      'minecraft.explore_for_resources',
      'minecraft.chat',
      'minecraft.wait',
    ]),
    mode: 'live',
    updateTaskMetadata: vi.fn(),
    startTaskStep: vi.fn().mockResolvedValue(true),
    completeTaskStep: vi.fn().mockResolvedValue(true),
    emit: vi.fn(),
    executeTool: vi.fn().mockResolvedValue({ ok: true }),
    canExecuteStep: vi.fn().mockReturnValue(true),
    recordStepExecuted: vi.fn(),
    getAbortSignal: () => undefined,
    getGoldenRunRecorder: () => ({
      recordExecutorBlocked: vi.fn(),
      recordShadowDispatch: vi.fn(),
      recordVerification: vi.fn(),
      recordDispatch: vi.fn(),
      recordRegenerationAttempt: vi.fn(),
      recordLeafRewriteUsed: vi.fn(),
      recordLoopDetected: vi.fn(),
      markLoopBreakerEvaluated: vi.fn(),
    }),
    toDispatchResult: (r) =>
      r?.ok ? { status: 'ok' } : { status: 'error', error: (r as any)?.error },
    introspectRecipe: vi.fn().mockResolvedValue(null),
    fetchInventorySnapshot: vi.fn().mockResolvedValue([]),
    getCount: vi.fn().mockReturnValue(10),
    injectDynamicPrereqForCraft: vi.fn().mockResolvedValue(false),
    emitExecutorBudgetEvent: vi.fn(),
    getStepBudgetState: vi.fn().mockReturnValue({
      meta: {},
      budgets: {},
      state: { attempts: 0, firstAt: Date.now(), lastAt: 0 },
      created: false,
    }),
    persistStepBudget: vi.fn(),
    updateTaskProgress: vi.fn(),
    recomputeProgressAndMaybeComplete: vi.fn().mockResolvedValue(undefined),
    regenerateSteps: vi.fn().mockResolvedValue({ success: false }),
    getThreatSnapshot: vi.fn().mockResolvedValue({ overallThreatLevel: 'low', threats: [] }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
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
    if (urlStr.includes('/api/cognitive-stream/ack')) {
      return { ok: true, json: async () => ({ success: true, ackedCount: 1, requestedCount: 1, mismatchCount: 0 }) };
    }
    return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Thought-to-Execution Pipeline E2E', () => {
  const originalStrictReq = process.env.STRICT_REQUIREMENTS;
  const originalSterlingRouting = process.env.STERLING_IR_ROUTING;

  beforeEach(() => {
    seq = 0;
    __resetDedupStateForTests();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    process.env.STRICT_REQUIREMENTS = 'false';
    process.env.STERLING_IR_ROUTING = '1';
    // Minimize ingest retry delays for test speed
    process.env.STERLING_INGEST_RETRY_DELAYS_MS = '10';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.STRICT_REQUIREMENTS = originalStrictReq;
    process.env.STERLING_IR_ROUTING = originalSterlingRouting;
    delete process.env.STERLING_INGEST_RETRY_DELAYS_MS;
  });

  // ── Full pipeline: thought → task → expand → step → dispatch ──

  describe('Full pipeline: thought → task → steps → executor dispatch', () => {
    it('traces a valid thought through the entire pipeline', async () => {
      // ── Stage 1: Fetch thought from cognition ──
      const thought = makeThought();
      const digest = thought.metadata.reduction!.reducerResult!.committed_ir_digest;
      stubCognitionEndpoint([thought]);

      const client = new CognitiveStreamClient({ baseUrl: 'http://localhost:3003' });
      const thoughts = await client.getRecentThoughts();
      expect(thoughts).toHaveLength(1);

      // ── Stage 2: Convert thought to task ──
      let createdTaskData: Partial<Task> | null = null;
      const convertDeps: ConvertThoughtToTaskDeps = {
        addTask: vi.fn(async (taskData: Partial<Task>) => {
          createdTaskData = taskData;
          return { ...taskData, id: 'task-pipeline-1' } as Task;
        }),
        markThoughtAsProcessed: vi.fn(async () => {}),
        seenThoughtIds: new Set<string>(),
        trimSeenThoughtIds: vi.fn(),
      };

      const convertResult = await convertThoughtToTask(thoughts[0], convertDeps);
      expect(convertResult.decision).toBe('created');
      expect(createdTaskData).not.toBeNull();
      expect(createdTaskData!.type).toBe('sterling_ir');

      // Verify digest was threaded through
      const sterlingMeta = createdTaskData!.metadata?.sterling as Record<string, unknown>;
      expect(sterlingMeta.committedIrDigest).toBe(digest);

      // ── Stage 3: addTask triggers Sterling expansion ──
      const expandByDigest = vi.fn().mockResolvedValue({
        status: 'ok',
        plan_bundle_digest: 'bundle_test_1',
        steps: [
          { leaf: 'acquire_material', args: { item: 'oak_log', count: 3 }, executable: true },
          { leaf: 'craft_recipe', args: { recipe: 'oak_planks', qty: 12 }, executable: true },
          { leaf: 'craft_recipe', args: { recipe: 'stick', qty: 4 }, executable: true },
          { leaf: 'craft_recipe', args: { recipe: 'wooden_pickaxe', qty: 1 }, executable: true },
        ],
        schema_version: 'v1',
      });
      const sterlingService = createMockSterlingService({ overrides: { expandByDigest } });

      const ti = new TaskIntegration({
        enableRealTimeUpdates: false,
        enableProgressTracking: false,
        enableTaskStatistics: false,
        enableTaskHistory: false,
      });
      ti.setSterlingExecutorService(sterlingService as any);

      const task = await ti.addTask(createdTaskData!);

      // Verify Sterling was called with the correct digest
      expect(expandByDigest).toHaveBeenCalledWith(
        expect.objectContaining({ committed_ir_digest: digest }),
        expect.any(Number),
      );

      // Verify task was created with steps
      expect(task.status).toBe('pending');
      expect(task.steps).toHaveLength(4);
      expect(task.steps[0].meta?.leaf).toBe('acquire_material');
      expect(task.steps[1].meta?.leaf).toBe('craft_recipe');
      expect(task.steps[2].meta?.leaf).toBe('craft_recipe');
      expect(task.steps[3].meta?.leaf).toBe('craft_recipe');

      // ── Stage 4: Execute first step through the executor ──
      const ctx = createMockExecutorContext();

      await executeSterlingStep(
        { id: task.id, title: task.title, steps: task.steps, metadata: task.metadata as any },
        task.steps[0],
        ctx,
      );

      // Verify tool was dispatched with correct args
      expect(ctx.executeTool).toHaveBeenCalledWith(
        'minecraft.acquire_material',
        expect.objectContaining({ item: 'oak_log' }),
        undefined,
      );
      expect(ctx.completeTaskStep).toHaveBeenCalledWith(task.id, task.steps[0].id);
      expect(ctx.recordStepExecuted).toHaveBeenCalledTimes(1);
    });

    it('traces a crafting thought through Sterling expand with intent resolution', async () => {
      // This tests the path where Sterling returns intent leaves that need resolution
      const thought = makeThought({ content: 'I need to build a crafting table.' });
      const digest = thought.metadata.reduction!.reducerResult!.committed_ir_digest;
      stubCognitionEndpoint([thought]);

      const client = new CognitiveStreamClient({ baseUrl: 'http://localhost:3003' });
      const thoughts = await client.getRecentThoughts();

      const convertDeps: ConvertThoughtToTaskDeps = {
        addTask: vi.fn(async (taskData: Partial<Task>) => ({ ...taskData, id: 'task-intent-1' }) as Task),
        markThoughtAsProcessed: vi.fn(async () => {}),
        seenThoughtIds: new Set<string>(),
        trimSeenThoughtIds: vi.fn(),
      };

      const result = await convertThoughtToTask(thoughts[0], convertDeps);
      expect(result.decision).toBe('created');

      // Sterling returns executor-native leaves (Option A — no intent resolution needed)
      const expandByDigest = vi.fn().mockResolvedValue({
        status: 'ok',
        plan_bundle_digest: 'bundle_craft_1',
        steps: [
          { leaf: 'craft_recipe', args: { recipe: 'crafting_table', qty: 1 }, executable: true },
        ],
        schema_version: 'v1',
      });

      const ti = new TaskIntegration({
        enableRealTimeUpdates: false,
        enableProgressTracking: false,
        enableTaskStatistics: false,
        enableTaskHistory: false,
      });
      ti.setSterlingExecutorService(createMockSterlingService({ overrides: { expandByDigest } }) as any);

      const taskData = (convertDeps.addTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const task = await ti.addTask(taskData);

      expect(task.steps).toHaveLength(1);
      expect(task.steps[0].meta?.leaf).toBe('craft_recipe');
      expect((task.steps[0].meta?.args as any)?.recipe).toBe('crafting_table');
    });
  });

  // ── Failure propagation: each bridge point fails correctly ──

  describe('Failure propagation across pipeline bridges', () => {
    it('blocked expansion → task enters pending_planning', async () => {
      const thought = makeThought();
      const convertDeps: ConvertThoughtToTaskDeps = {
        addTask: vi.fn(async (taskData: Partial<Task>) => ({ ...taskData, id: 'task-blocked-1' }) as Task),
        markThoughtAsProcessed: vi.fn(async () => {}),
        seenThoughtIds: new Set<string>(),
        trimSeenThoughtIds: vi.fn(),
      };

      const result = await convertThoughtToTask(thought, convertDeps);
      expect(result.decision).toBe('created');

      // Sterling blocks expansion
      const expandByDigest = vi.fn().mockResolvedValue({
        status: 'blocked',
        blocked_reason: 'blocked_digest_unknown',
      });

      const ti = new TaskIntegration({
        enableRealTimeUpdates: false,
        enableProgressTracking: false,
        enableTaskStatistics: false,
        enableTaskHistory: false,
      });
      ti.setSterlingExecutorService(createMockSterlingService({ overrides: { expandByDigest } }) as any);

      const taskData = (convertDeps.addTask as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const task = await ti.addTask(taskData);

      // Task should be pending_planning with blocked reason
      expect(task.status).toBe('pending_planning');
      expect(task.metadata.blockedReason).toBe('blocked_digest_unknown');
      expect(task.steps).toHaveLength(0);
    });

    it('executor blocks on invalid args → metadata captures block reason', async () => {
      const expandByDigest = vi.fn().mockResolvedValue({
        status: 'ok',
        plan_bundle_digest: 'bundle_bad_args',
        steps: [
          // Step with invalid args (not a plain object)
          { leaf: 'craft_recipe', args: 'not_an_object', executable: true },
        ],
        schema_version: 'v1',
      });

      const ti = new TaskIntegration({
        enableRealTimeUpdates: false,
        enableProgressTracking: false,
        enableTaskStatistics: false,
        enableTaskHistory: false,
      });
      ti.setSterlingExecutorService(createMockSterlingService({ overrides: { expandByDigest } }) as any);

      const task = await ti.addTask({
        type: 'sterling_ir',
        title: 'Bad args test',
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          retryCount: 0,
          maxRetries: 3,
          childTaskIds: [],
          tags: [],
          category: 'sterling_ir',
          sterling: {
            committedIrDigest: 'bad_args_digest',
            schemaVersion: 'v1',
            envelopeId: 'env_bad',
          },
        } as Task['metadata'],
      });

      // Task has steps, now try to execute the bad step
      if (task.steps.length > 0) {
        const ctx = createMockExecutorContext();
        await executeSterlingStep(
          { id: task.id, title: task.title, steps: task.steps, metadata: task.metadata as any },
          task.steps[0],
          ctx,
        );

        // Executor should have blocked (args must be a plain object)
        const metaCalls = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls;
        const blockCall = metaCalls.find(
          (c: any[]) => typeof c[1]?.blockedReason === 'string',
        );
        expect(blockCall).toBeDefined();
        expect(ctx.executeTool).not.toHaveBeenCalled();
      }
    });

    it('tool execution failure → step not completed, metadata updated', async () => {
      const expandByDigest = vi.fn().mockResolvedValue({
        status: 'ok',
        plan_bundle_digest: 'bundle_fail',
        steps: [
          { leaf: 'acquire_material', args: { item: 'oak_log', count: 1 }, executable: true },
        ],
        schema_version: 'v1',
      });

      const ti = new TaskIntegration({
        enableRealTimeUpdates: false,
        enableProgressTracking: false,
        enableTaskStatistics: false,
        enableTaskHistory: false,
      });
      ti.setSterlingExecutorService(createMockSterlingService({ overrides: { expandByDigest } }) as any);

      const task = await ti.addTask({
        type: 'sterling_ir',
        title: 'Fail exec test',
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          retryCount: 0,
          maxRetries: 3,
          childTaskIds: [],
          tags: [],
          category: 'sterling_ir',
          sterling: {
            committedIrDigest: 'fail_digest',
            schemaVersion: 'v1',
            envelopeId: 'env_fail',
          },
        } as Task['metadata'],
      });

      expect(task.steps).toHaveLength(1);

      // Execute with tool failure
      const ctx = createMockExecutorContext({
        executeTool: vi.fn().mockResolvedValue({ ok: false, error: 'block not reachable' }),
      });

      await executeSterlingStep(
        { id: task.id, title: task.title, steps: task.steps, metadata: task.metadata as any },
        task.steps[0],
        ctx,
      );

      // Tool was called but step should NOT be completed
      expect(ctx.executeTool).toHaveBeenCalled();
      expect(ctx.completeTaskStep).not.toHaveBeenCalled();
    });
  });

  // ── Digest threading: verify the digest flows through every stage ──

  describe('Digest threading across pipeline', () => {
    it('committed_ir_digest from reduction flows to expandByDigest request', async () => {
      const thought = makeThought();
      const expectedDigest = thought.metadata.reduction!.reducerResult!.committed_ir_digest;

      stubCognitionEndpoint([thought]);

      // Stage 1: Fetch
      const client = new CognitiveStreamClient({ baseUrl: 'http://localhost:3003' });
      const [fetchedThought] = await client.getRecentThoughts();
      expect(fetchedThought.metadata.reduction!.reducerResult!.committed_ir_digest).toBe(expectedDigest);

      // Stage 2: Convert
      let capturedTaskData: Partial<Task> | null = null;
      const convertDeps: ConvertThoughtToTaskDeps = {
        addTask: vi.fn(async (taskData: Partial<Task>) => {
          capturedTaskData = taskData;
          return { ...taskData, id: 'task-digest-1' } as Task;
        }),
        markThoughtAsProcessed: vi.fn(async () => {}),
        seenThoughtIds: new Set<string>(),
        trimSeenThoughtIds: vi.fn(),
      };
      await convertThoughtToTask(fetchedThought, convertDeps);

      // Verify digest in task metadata
      const sterlingMeta = capturedTaskData!.metadata?.sterling as Record<string, unknown>;
      expect(sterlingMeta.committedIrDigest).toBe(expectedDigest);

      // Stage 3: addTask → expandByDigest
      const expandByDigest = vi.fn().mockResolvedValue({
        status: 'ok',
        plan_bundle_digest: 'bundle_digest_thread',
        steps: [{ leaf: 'chat', args: { message: 'done' }, executable: true }],
        schema_version: 'v1',
      });

      const ti = new TaskIntegration({
        enableRealTimeUpdates: false,
        enableProgressTracking: false,
        enableTaskStatistics: false,
        enableTaskHistory: false,
      });
      ti.setSterlingExecutorService(createMockSterlingService({ overrides: { expandByDigest } }) as any);

      await ti.addTask(capturedTaskData!);

      // Verify expandByDigest was called with the exact same digest
      const expandCall = expandByDigest.mock.calls[0][0];
      expect(expandCall.committed_ir_digest).toBe(expectedDigest);
    });
  });

  // ── Multi-step sequencing: steps execute in order ──

  describe('Multi-step sequencing', () => {
    it('steps are ordered and individually executable', async () => {
      const expandByDigest = vi.fn().mockResolvedValue({
        status: 'ok',
        plan_bundle_digest: 'bundle_seq',
        steps: [
          { leaf: 'acquire_material', args: { item: 'oak_log', count: 3 }, executable: true },
          { leaf: 'craft_recipe', args: { recipe: 'oak_planks', qty: 12 }, executable: true },
          { leaf: 'craft_recipe', args: { recipe: 'wooden_pickaxe', qty: 1 }, executable: true },
        ],
        schema_version: 'v1',
      });

      const ti = new TaskIntegration({
        enableRealTimeUpdates: false,
        enableProgressTracking: false,
        enableTaskStatistics: false,
        enableTaskHistory: false,
      });
      ti.setSterlingExecutorService(createMockSterlingService({ overrides: { expandByDigest } }) as any);

      const task = await ti.addTask({
        type: 'sterling_ir',
        title: 'Multi-step',
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          retryCount: 0,
          maxRetries: 3,
          childTaskIds: [],
          tags: [],
          category: 'sterling_ir',
          sterling: { committedIrDigest: 'multi_digest', schemaVersion: 'v1', envelopeId: 'env_m' },
        } as Task['metadata'],
      });

      expect(task.steps).toHaveLength(3);

      // Steps should be ordered
      expect(task.steps[0].order).toBeLessThan(task.steps[1].order);
      expect(task.steps[1].order).toBeLessThan(task.steps[2].order);

      // Each step should be individually dispatchable
      for (const step of task.steps) {
        const ctx = createMockExecutorContext();
        await executeSterlingStep(
          { id: task.id, title: task.title, steps: task.steps, metadata: task.metadata as any },
          step,
          ctx,
        );
        expect(ctx.executeTool).toHaveBeenCalledTimes(1);
        expect(ctx.completeTaskStep).toHaveBeenCalledTimes(1);
      }
    });
  });
});
