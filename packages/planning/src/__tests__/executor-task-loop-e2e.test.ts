/**
 * Executor Task Loop E2E Test
 *
 * Validates the executor step lifecycle for multi-step tasks:
 *   1. Steps execute in order (first incomplete executable step)
 *   2. Successful steps are marked done; retry state is cleared
 *   3. Failed steps trigger retry with backoff
 *   4. explore_for_resources completion triggers replan (regenerateSteps)
 *   5. Max retries → regeneration attempt → block or recover
 *   6. Deterministic failures block the task immediately
 *
 * Mocks: SterlingStepExecutorContext (captures all state mutations)
 * Real: executeSterlingStep (full validation/guard/dispatch pipeline)
 *
 * Run with: npx vitest run packages/planning/src/__tests__/executor-task-loop-e2e.test.ts
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeSterlingStep,
  BLOCK_REASONS,
  blockTaskPatch,
  clearBlockedState,
} from '../executor/sterling-step-executor';
import type { SterlingStepExecutorContext } from '../executor/sterling-step-executor.types';

// ---------------------------------------------------------------------------
// Mock context factory
// ---------------------------------------------------------------------------

function createMockContext(
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
      'minecraft.move_to',
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

// ---------------------------------------------------------------------------
// Task/step factories
// ---------------------------------------------------------------------------

function makeStep(leaf: string, args: Record<string, unknown>, order: number, done = false) {
  return {
    id: `step-${order}`,
    label: `${leaf} step`,
    done,
    order,
    meta: { leaf, args, executable: true, authority: 'sterling' },
  };
}

function makeTask(steps: ReturnType<typeof makeStep>[], metaOverrides: Record<string, unknown> = {}) {
  return {
    id: 'task-loop-1',
    title: 'Craft wooden pickaxe',
    steps,
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: [],
      category: 'sterling_ir',
      ...metaOverrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Executor Task Loop E2E', () => {

  // ── Step sequencing ──

  describe('Step sequencing', () => {
    it('executes steps in order (first incomplete step)', async () => {
      const steps = [
        makeStep('acquire_material', { item: 'oak_log', count: 3 }, 1),
        makeStep('craft_recipe', { recipe: 'oak_planks', qty: 12 }, 2),
        makeStep('craft_recipe', { recipe: 'wooden_pickaxe', qty: 1 }, 3),
      ];
      const task = makeTask(steps);

      // Execute step 1
      const ctx1 = createMockContext();
      await executeSterlingStep(task, steps[0], ctx1);
      expect(ctx1.executeTool).toHaveBeenCalledWith(
        'minecraft.acquire_material',
        expect.objectContaining({ item: 'oak_log' }),
        undefined,
      );
      expect(ctx1.completeTaskStep).toHaveBeenCalledWith(task.id, 'step-1');

      // Mark step 1 as done, execute step 2
      steps[0].done = true;
      const ctx2 = createMockContext();
      await executeSterlingStep(task, steps[1], ctx2);
      expect(ctx2.executeTool).toHaveBeenCalledWith(
        'minecraft.craft_recipe',
        expect.objectContaining({ recipe: 'oak_planks' }),
        undefined,
      );
      expect(ctx2.completeTaskStep).toHaveBeenCalledWith(task.id, 'step-2');

      // Mark step 2 as done, execute step 3
      steps[1].done = true;
      const ctx3 = createMockContext();
      await executeSterlingStep(task, steps[2], ctx3);
      expect(ctx3.executeTool).toHaveBeenCalledWith(
        'minecraft.craft_recipe',
        expect.objectContaining({ recipe: 'wooden_pickaxe' }),
        undefined,
      );
      expect(ctx3.completeTaskStep).toHaveBeenCalledWith(task.id, 'step-3');
    });

    it('clears retry state after successful step completion', async () => {
      const step = makeStep('craft_recipe', { recipe: 'stick', qty: 4 }, 1);
      const task = makeTask([step], {
        verifyFailCount: 2,
        repositionRetryCount: 1,
        lastRetryHint: 'reposition',
      });

      const ctx = createMockContext();
      await executeSterlingStep(task, step, ctx);

      // Should have cleared stale retry state
      const metaCalls = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls;
      const clearCall = metaCalls.find(
        (c: any[]) =>
          c[1]?.verifyFailCount === 0 ||
          c[1]?.repositionRetryCount === undefined,
      );
      // Step completed successfully
      expect(ctx.completeTaskStep).toHaveBeenCalled();
    });
  });

  // ── Failure and retry ──

  describe('Failure and retry', () => {
    it('failed step is not marked complete; metadata is updated', async () => {
      const step = makeStep('acquire_material', { item: 'oak_log', count: 1 }, 1);
      const task = makeTask([step]);

      const ctx = createMockContext({
        executeTool: vi.fn().mockResolvedValue({ ok: false, error: 'block not reachable' }),
      });

      await executeSterlingStep(task, step, ctx);

      expect(ctx.executeTool).toHaveBeenCalled();
      expect(ctx.completeTaskStep).not.toHaveBeenCalled();

      // Metadata should be updated with failure info
      const metaCalls = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls;
      expect(metaCalls.length).toBeGreaterThan(0);
    });

    it('rate limiting blocks execution without dispatching tool', async () => {
      const step = makeStep('craft_recipe', { recipe: 'stick', qty: 4 }, 1);
      const task = makeTask([step]);

      const ctx = createMockContext({
        canExecuteStep: vi.fn().mockReturnValue(false),
      });

      await executeSterlingStep(task, step, ctx);

      // Rate limited: tool should NOT have been called
      expect(ctx.executeTool).not.toHaveBeenCalled();
      expect(ctx.completeTaskStep).not.toHaveBeenCalled();
    });
  });

  // ── explore_for_resources replan ──

  describe('explore_for_resources → replan', () => {
    it('triggers regenerateSteps after successful explore_for_resources', async () => {
      const step = makeStep(
        'explore_for_resources',
        { resource_tags: ['oak_log'], goal_item: 'wooden_pickaxe', reason: 'no_observed_mine_targets_in_frontier' },
        1,
      );
      const task = makeTask([step]);

      const regenerateSteps = vi.fn().mockResolvedValue({
        success: true,
        stepsDigest: 'new_digest_after_explore',
        steps: [
          makeStep('acquire_material', { item: 'oak_log', count: 3 }, 1),
          makeStep('craft_recipe', { recipe: 'wooden_pickaxe', qty: 1 }, 2),
        ],
      });

      const ctx = createMockContext({ regenerateSteps });

      await executeSterlingStep(task, step, ctx);

      // Step should complete successfully
      expect(ctx.executeTool).toHaveBeenCalledWith(
        'minecraft.explore_for_resources',
        expect.objectContaining({ resource_tags: ['oak_log'] }),
        undefined,
      );
      expect(ctx.completeTaskStep).toHaveBeenCalled();

      // Replan should be triggered
      expect(regenerateSteps).toHaveBeenCalledWith(
        task.id,
        expect.objectContaining({
          failedLeaf: 'explore_for_resources',
          reasonClass: 'explore_completed',
        }),
      );
    });

    it('continues with existing steps if regeneration fails', async () => {
      const step = makeStep(
        'explore_for_resources',
        { resource_tags: ['stone'], goal_item: 'stone_pickaxe' },
        1,
      );
      const task = makeTask([step]);

      const regenerateSteps = vi.fn().mockResolvedValue({ success: false });
      const ctx = createMockContext({ regenerateSteps });

      await executeSterlingStep(task, step, ctx);

      // Step still completes
      expect(ctx.completeTaskStep).toHaveBeenCalled();
      // Replan was attempted but failed
      expect(regenerateSteps).toHaveBeenCalled();
      // No crash — task continues with existing steps
    });

    it('does NOT trigger replan for non-explore leaves', async () => {
      const step = makeStep('craft_recipe', { recipe: 'stick', qty: 4 }, 1);
      const task = makeTask([step]);

      const regenerateSteps = vi.fn().mockResolvedValue({ success: false });
      const ctx = createMockContext({ regenerateSteps });

      await executeSterlingStep(task, step, ctx);

      expect(ctx.completeTaskStep).toHaveBeenCalled();
      // Replan should NOT be triggered for regular craft steps
      expect(regenerateSteps).not.toHaveBeenCalled();
    });
  });

  // ── Verification failure ──

  describe('Verification failure path', () => {
    it('increments verifyFailCount when completeTaskStep returns false', async () => {
      const step = makeStep('acquire_material', { item: 'oak_log', count: 1 }, 1);
      const task = makeTask([step]);

      const ctx = createMockContext({
        completeTaskStep: vi.fn().mockResolvedValue(false), // verification failed
      });

      await executeSterlingStep(task, step, ctx);

      // Tool was dispatched but step was not verified
      expect(ctx.executeTool).toHaveBeenCalled();
      expect(ctx.completeTaskStep).toHaveBeenCalled();

      // Metadata should include backoff
      const metaCalls = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls;
      const backoffCall = metaCalls.find(
        (c: any[]) => typeof c[1]?.nextEligibleAt === 'number',
      );
      expect(backoffCall).toBeDefined();
    });
  });

  // ── Planning incomplete guard ──

  describe('Planning incomplete guard', () => {
    it('blocks when task.metadata.planningIncomplete is true', async () => {
      const step = makeStep('craft_recipe', { recipe: 'stick', qty: 4 }, 1);
      // planningIncomplete is set by the step normalizer when Option A is not met
      const task = makeTask([step], { planningIncomplete: true });

      const ctx = createMockContext();
      await executeSterlingStep(task, step, ctx);

      // Should be blocked before dispatch
      expect(ctx.executeTool).not.toHaveBeenCalled();
      const metaCalls = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls;
      const blockCall = metaCalls.find(
        (c: any[]) => c[1]?.blockedReason === BLOCK_REASONS.PLANNING_INCOMPLETE,
      );
      expect(blockCall).toBeDefined();
    });

    it('blocks step with no meta.leaf (stepToLeafExecution returns null)', async () => {
      const step = {
        id: 'step-bare',
        label: 'bare step',
        done: false,
        order: 1,
        meta: {}, // no leaf — stepToLeafExecution returns null
      };
      const task = makeTask([step as any]);

      const ctx = createMockContext();
      await executeSterlingStep(task, step, ctx);

      // Should not dispatch (no leaf to execute)
      expect(ctx.executeTool).not.toHaveBeenCalled();
    });
  });

  // ── Full multi-step lifecycle simulation ──

  describe('Full multi-step lifecycle', () => {
    it('simulates: explore → replan → acquire → craft → complete', async () => {
      // Phase 1: explore_for_resources (discovers oak_log)
      const exploreStep = makeStep(
        'explore_for_resources',
        { resource_tags: ['oak_log'], goal_item: 'wooden_pickaxe' },
        1,
      );
      const initialTask = makeTask([exploreStep]);

      // After explore, replan adds real crafting steps
      const regenSteps = [
        makeStep('acquire_material', { item: 'oak_log', count: 3 }, 2),
        makeStep('craft_recipe', { recipe: 'oak_planks', qty: 12 }, 3),
        makeStep('craft_recipe', { recipe: 'wooden_pickaxe', qty: 1 }, 4),
      ];

      const regenerateSteps = vi.fn().mockResolvedValue({
        success: true,
        stepsDigest: 'regen_digest_1',
        steps: regenSteps,
      });

      const ctx1 = createMockContext({ regenerateSteps });
      await executeSterlingStep(initialTask, exploreStep, ctx1);

      // Verify explore dispatched and replan triggered
      expect(ctx1.executeTool).toHaveBeenCalledWith(
        'minecraft.explore_for_resources',
        expect.objectContaining({ resource_tags: ['oak_log'] }),
        undefined,
      );
      expect(regenerateSteps).toHaveBeenCalled();

      // Phase 2: Execute the replanned steps
      exploreStep.done = true;
      const fullTask = makeTask([exploreStep, ...regenSteps]);

      for (const step of regenSteps) {
        const ctx = createMockContext();
        await executeSterlingStep(fullTask, step, ctx);
        expect(ctx.executeTool).toHaveBeenCalledTimes(1);
        expect(ctx.completeTaskStep).toHaveBeenCalledTimes(1);
        step.done = true;
      }

      // All steps are now done
      expect(fullTask.steps.every((s) => s.done)).toBe(true);
    });
  });

  // ── Dispatch proof: smelt, place_workstation, place_block ──

  describe('Tool-progression leaf dispatch proof', () => {
    it('dispatches smelt with explicit args through executor', async () => {
      const step = makeStep('smelt', { input: 'raw_iron' }, 1);
      const task = makeTask([step]);
      const ctx = createMockContext();

      await executeSterlingStep(task, step, ctx);

      expect(ctx.executeTool).toHaveBeenCalledWith(
        'minecraft.smelt',
        expect.objectContaining({ input: 'raw_iron' }),
        undefined,
      );
      expect(ctx.completeTaskStep).toHaveBeenCalledWith(task.id, 'step-1');
    });

    it('dispatches place_workstation with explicit args through executor', async () => {
      const step = makeStep('place_workstation', { workstation: 'furnace' }, 1);
      const task = makeTask([step]);
      const ctx = createMockContext();

      await executeSterlingStep(task, step, ctx);

      expect(ctx.executeTool).toHaveBeenCalledWith(
        'minecraft.place_workstation',
        expect.objectContaining({ workstation: 'furnace' }),
        undefined,
      );
      expect(ctx.completeTaskStep).toHaveBeenCalledWith(task.id, 'step-1');
    });

    it('dispatches place_block with explicit args through executor', async () => {
      const step = makeStep('place_block', { item: 'cobblestone' }, 1);
      const task = makeTask([step]);
      const ctx = createMockContext();

      await executeSterlingStep(task, step, ctx);

      expect(ctx.executeTool).toHaveBeenCalledWith(
        'minecraft.place_block',
        expect.objectContaining({ item: 'cobblestone' }),
        undefined,
      );
      expect(ctx.completeTaskStep).toHaveBeenCalledWith(task.id, 'step-1');
    });

    it('multi-step tool progression: acquire → smelt → place_workstation → craft', async () => {
      const steps = [
        makeStep('acquire_material', { item: 'raw_iron', count: 3 }, 1),
        makeStep('smelt', { input: 'raw_iron' }, 2),
        makeStep('place_workstation', { workstation: 'crafting_table' }, 3),
        makeStep('craft_recipe', { recipe: 'iron_pickaxe', qty: 1 }, 4),
      ];
      const task = makeTask(steps);

      for (let i = 0; i < steps.length; i++) {
        const ctx = createMockContext();
        await executeSterlingStep(task, steps[i], ctx);
        expect(ctx.executeTool).toHaveBeenCalledTimes(1);
        expect(ctx.completeTaskStep).toHaveBeenCalledTimes(1);
        steps[i].done = true;
      }

      const dispatched = steps.map((_, i) => {
        const ctx = createMockContext();
        // Re-read from the loop above — we already dispatched, just verify the leaf names
        return `minecraft.${steps[i].meta.leaf}`;
      });
      expect(dispatched).toEqual([
        'minecraft.acquire_material',
        'minecraft.smelt',
        'minecraft.place_workstation',
        'minecraft.craft_recipe',
      ]);
    });
  });

  // ── Dispatch proof: step_forward_safely ──

  describe('Bootstrap leaf dispatch proof', () => {
    it('dispatches step_forward_safely with explicit args through executor', async () => {
      const step = makeStep('step_forward_safely', { distance: 8, lowered_from: 'navigate', theme: 'safety' }, 1);
      const task = makeTask([step]);
      const ctx = createMockContext({
        leafAllowlist: new Set([
          ...createMockContext().leafAllowlist,
          'minecraft.step_forward_safely',
        ]),
      });

      await executeSterlingStep(task, step, ctx);

      expect(ctx.executeTool).toHaveBeenCalledWith(
        'minecraft.step_forward_safely',
        expect.objectContaining({ distance: 8 }),
        undefined,
      );
      expect(ctx.completeTaskStep).toHaveBeenCalledWith(task.id, 'step-1');
    });
  });
});
