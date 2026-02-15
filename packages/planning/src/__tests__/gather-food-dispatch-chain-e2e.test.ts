/**
 * Gather-Food Dispatch Chain E2E Test
 *
 * Validates the full idle episode → gather food expansion → step dispatch chain
 * using close-to-life mocks that mirror the real pipeline. This test catches the
 * exact failure pattern seen in live runs: expansion produces steps whose args
 * don't satisfy action mapping requirements (e.g. dig_block without pos).
 *
 * Pipeline under test:
 *   Idle episode (low food/health) → _select_idle_goal → ("gather", "food")
 *     → _lower_gather → [acquire_material, consume_food]
 *       → mapBTActionToMinecraft (each step)
 *         → executeSterlingStep (mock executeTool)
 *
 * The contract fixture (bootstrap-lowering-v1.json) is the source of truth for
 * step shapes. If Sterling's expansion changes, the fixture changes first, then
 * these tests fail — catching contract drift before live runs.
 *
 * Run with: npx vitest run packages/planning/src/__tests__/gather-food-dispatch-chain-e2e.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { mapBTActionToMinecraft } from '../modules/action-mapping';
import {
  convertThoughtToTask,
  __resetDedupStateForTests,
  type ConvertThoughtToTaskDeps,
} from '../task-integration/thought-to-task-converter';
import { TaskIntegration } from '../task-integration';
import { createMockSterlingService } from '../sterling/__tests__/mock-sterling-service';
import {
  executeSterlingStep,
} from '../executor/sterling-step-executor';
import type { SterlingStepExecutorContext } from '../executor/sterling-step-executor.types';
import type { ReductionProvenance } from '@conscious-bot/cognition';
import type { Task } from '../types/task';

// ============================================================================
// Load the shared contract fixture — the single source of truth
// ============================================================================

const FIXTURE_PATH = join(
  __dirname,
  '..',
  'server',
  '__tests__',
  'fixtures',
  'bootstrap-lowering-v1.json',
);
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
const GATHER_FOOD_STEPS = FIXTURE.cases.gather_food.steps as Array<{
  leaf: string;
  args: Record<string, unknown>;
}>;

// ============================================================================
// Mock factories (close-to-life: mimic the actual runtime shapes)
// ============================================================================

let seq = 0;

function makeIdleEpisodeReduction(): ReductionProvenance {
  seq += 1;
  return {
    sterlingProcessed: true,
    envelopeId: `idle_env_${seq}`,
    reducerResult: {
      committed_goal_prop_id: `idle_prop_${seq}`,
      committed_ir_digest: `ling_ir:gather_food_${seq}`,
      source_envelope_id: `idle_env_${seq}`,
      is_executable: true,
      is_semantically_empty: false,
      advisory: null,
      grounding: null,
      schema_version: 'v1',
      reducer_version: 'idle_episode_v1',
    },
    isExecutable: true,
    blockReason: null,
    durationMs: 5,
    sterlingError: null,
  };
}

function makeIdleEpisodeThought() {
  seq += 1;
  return {
    id: `idle_thought_${seq}`,
    type: 'planning' as const,
    content: 'Idle episode (sterling executable)',
    attribution: 'planning_system' as const,
    timestamp: Date.now(),
    processed: false,
    convertEligible: true,
    context: {
      emotionalState: 'neutral',
      confidence: 0.9,
      cognitiveSystem: 'generator' as const,
    },
    metadata: {
      thoughtType: 'planning',
      llmConfidence: 0.9,
      model: 'idle_episode',
      reduction: makeIdleEpisodeReduction(),
    },
  };
}

/**
 * Build a Sterling expansion response that mirrors what expand_by_digest_v1
 * returns for a "gather food" idle episode. Uses the contract fixture steps.
 */
function makeGatherFoodExpansionResponse() {
  return {
    status: 'ok',
    plan_bundle_digest: `bundle_gather_food_${seq}`,
    steps: GATHER_FOOD_STEPS.map((step) => ({
      leaf: step.leaf,
      args: { ...step.args },
      executable: true,
    })),
    schema_version: 'v1',
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
      buildingLeaves: new Set(),
      taskTypeBridgeLeafNames: new Set(),
      enableTaskTypeBridge: false,
      legacyLeafRewriteEnabled: false,
    },
    leafAllowlist: new Set([
      'minecraft.acquire_material',
      'minecraft.consume_food',
      'minecraft.find_resource',
      'minecraft.dig_block',
      'minecraft.collect_items',
      'minecraft.craft_recipe',
      'minecraft.move_to',
      'minecraft.move_forward',
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
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Gather-Food Dispatch Chain E2E', () => {
  const originalSterlingRouting = process.env.STERLING_IR_ROUTING;

  beforeEach(() => {
    seq = 0;
    __resetDedupStateForTests();
    process.env.STERLING_IR_ROUTING = '1';
    process.env.STERLING_INGEST_RETRY_DELAYS_MS = '10';
  });

  afterEach(() => {
    process.env.STERLING_IR_ROUTING = originalSterlingRouting;
    delete process.env.STERLING_INGEST_RETRY_DELAYS_MS;
  });

  // ── Contract: fixture steps are all dispatchable ──

  describe('Fixture step dispatch contract', () => {
    it('every gather-food fixture step maps to a dispatchable action (no _error)', () => {
      for (const step of GATHER_FOOD_STEPS) {
        const action = mapBTActionToMinecraft(step.leaf, step.args);
        expect(action, `Leaf "${step.leaf}" has no action mapping`).not.toBeNull();
        expect(
          action!.parameters?._error,
          `Leaf "${step.leaf}" produced _error: ${action!.parameters?._error}. ` +
          `This means the expansion args don't satisfy action-mapping requirements. ` +
          `Fix the expansion in _lower_gather or update action-mapping.`,
        ).toBeUndefined();
      }
    });

    it('fixture step count matches expected gather-food chain length', () => {
      // 2 steps: acquire_material (find+dig+collect) → consume_food
      expect(GATHER_FOOD_STEPS).toHaveLength(2);
      expect(GATHER_FOOD_STEPS[0].leaf).toBe('acquire_material');
      expect(GATHER_FOOD_STEPS[1].leaf).toBe('consume_food');
    });

    it('acquire_material step has valid item arg for AcquireMaterialLeaf', () => {
      const acquireStep = GATHER_FOOD_STEPS[0];
      expect(acquireStep.args.item).toBe('sweet_berry_bush');
      expect(acquireStep.args.count).toBe(1);
    });
  });

  // ── Full pipeline: idle episode → expand → dispatch all steps ──

  describe('Full pipeline: idle episode → gather food → dispatch', () => {
    it('traces idle episode through expansion to successful dispatch of all steps', async () => {
      // ── Stage 1: Create idle episode thought (mimics _select_idle_goal) ──
      const thought = makeIdleEpisodeThought();
      const digest = thought.metadata.reduction!.reducerResult!.committed_ir_digest;

      // ── Stage 2: Convert thought → sterling_ir task ──
      let createdTaskData: Partial<Task> | null = null;
      const convertDeps: ConvertThoughtToTaskDeps = {
        addTask: vi.fn(async (taskData: Partial<Task>) => {
          createdTaskData = taskData;
          return { ...taskData, id: 'task-gather-food-1' } as Task;
        }),
        markThoughtAsProcessed: vi.fn(async () => {}),
        seenThoughtIds: new Set<string>(),
        trimSeenThoughtIds: vi.fn(),
      };

      const convertResult = await convertThoughtToTask(thought, convertDeps);
      expect(convertResult.decision).toBe('created');
      expect(createdTaskData).not.toBeNull();
      expect(createdTaskData!.type).toBe('sterling_ir');

      // ── Stage 3: TaskIntegration.addTask → Sterling expandByDigest ──
      const expandByDigest = vi.fn().mockResolvedValue(makeGatherFoodExpansionResponse());
      const sterlingService = createMockSterlingService({ overrides: { expandByDigest } });

      const ti = new TaskIntegration({
        enableRealTimeUpdates: false,
        enableProgressTracking: false,
        enableTaskStatistics: false,
        enableTaskHistory: false,
      });
      ti.setSterlingExecutorService(sterlingService as any);

      const task = await ti.addTask(createdTaskData!);

      // Verify expansion was called
      expect(expandByDigest).toHaveBeenCalledWith(
        expect.objectContaining({ committed_ir_digest: digest }),
        expect.any(Number),
      );

      // Verify task has the right steps
      expect(task.steps).toHaveLength(GATHER_FOOD_STEPS.length);
      for (let i = 0; i < GATHER_FOOD_STEPS.length; i++) {
        expect(task.steps[i].meta?.leaf).toBe(GATHER_FOOD_STEPS[i].leaf);
      }

      // ── Stage 4: Execute each step through the executor ──
      const ctx = createMockExecutorContext();

      for (let i = 0; i < task.steps.length; i++) {
        const step = task.steps[i];
        await executeSterlingStep(
          { id: task.id, title: task.title, steps: task.steps, metadata: task.metadata as any },
          step,
          ctx,
        );

        // Verify tool was dispatched (not blocked)
        const executeCalls = (ctx.executeTool as ReturnType<typeof vi.fn>).mock.calls;
        expect(
          executeCalls.length,
          `Step ${i} (${step.meta?.leaf}) was not dispatched — ` +
          `executeTool was called ${executeCalls.length} times but expected ${i + 1}`,
        ).toBe(i + 1);
      }

      // ── Stage 5: Verify dispatch details ──
      const executeCalls = (ctx.executeTool as ReturnType<typeof vi.fn>).mock.calls;

      // Step 0: acquire_material dispatched with item=sweet_berry_bush
      expect(executeCalls[0][0]).toBe('minecraft.acquire_material');
      expect(executeCalls[0][1]).toEqual(
        expect.objectContaining({ item: 'sweet_berry_bush' }),
      );

      // Step 1: consume_food dispatched
      expect(executeCalls[1][0]).toBe('minecraft.consume_food');
    });

    it('executor does NOT block any gather-food step with _error marker', async () => {
      // This is a regression guard: if someone changes the expansion to use
      // dig_block without pos again, this test catches it at the executor level.
      const expandByDigest = vi.fn().mockResolvedValue(makeGatherFoodExpansionResponse());
      const ti = new TaskIntegration({
        enableRealTimeUpdates: false,
        enableProgressTracking: false,
        enableTaskStatistics: false,
        enableTaskHistory: false,
      });
      ti.setSterlingExecutorService(
        createMockSterlingService({ overrides: { expandByDigest } }) as any,
      );

      const task = await ti.addTask({
        type: 'sterling_ir',
        title: 'Idle episode (sterling executable)',
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          retryCount: 0,
          maxRetries: 3,
          childTaskIds: [],
          tags: [],
          category: 'sterling_ir',
          sterling: {
            committedIrDigest: 'ling_ir:gather_food_regression',
            schemaVersion: 'v1',
            envelopeId: 'env_regression',
          },
        } as Task['metadata'],
      });

      const ctx = createMockExecutorContext();

      for (const step of task.steps) {
        await executeSterlingStep(
          { id: task.id, title: task.title, steps: task.steps, metadata: task.metadata as any },
          step,
          ctx,
        );
      }

      // No step should have been blocked
      const metaCalls = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls;
      const blockCalls = metaCalls.filter(
        (c: any[]) => typeof c[1]?.blockedReason === 'string',
      );
      expect(
        blockCalls,
        `${blockCalls.length} step(s) were blocked: ${blockCalls.map((c: any[]) => c[1].blockedReason).join(', ')}`,
      ).toHaveLength(0);

      // Every step was dispatched
      expect(ctx.executeTool).toHaveBeenCalledTimes(task.steps.length);
    });
  });

  // ── Regression: dig_block without pos MUST fail ──

  describe('Regression: dig_block without pos is not dispatchable', () => {
    it('dig_block with only blockType produces _error marker', () => {
      // This pins the invariant that dig_block is position-required.
      // If someone tries to use dig_block in gather expansion again, this test
      // documents exactly why it fails.
      const action = mapBTActionToMinecraft('dig_block', {
        blockType: 'sweet_berry_bush',
        lowered_from: 'gather',
        theme: 'food',
      });
      expect(action).not.toBeNull();
      expect(action!.parameters._error).toBe('missing_required_arg:pos');
    });

    it('dig_block WITH pos is dispatchable', () => {
      const action = mapBTActionToMinecraft('dig_block', {
        blockType: 'sweet_berry_bush',
        pos: { x: 10, y: 64, z: 20 },
      });
      expect(action).not.toBeNull();
      expect(action!.parameters._error).toBeUndefined();
      expect(action!.parameters.pos).toEqual({ x: 10, y: 64, z: 20 });
    });
  });
});
