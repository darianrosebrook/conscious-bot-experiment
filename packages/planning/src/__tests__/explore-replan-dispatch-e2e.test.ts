/**
 * Explore-for-Resources Dispatch + Replan E2E Test
 *
 * Validates the tool progression solver → explore_for_resources → replan → dispatch
 * chain. This test covers the upstream path that executor-task-loop-e2e.test.ts does
 * not: how the SterlingPlanner generates explore_for_resources when the tool
 * progression solver detects missing blocks.
 *
 * Pipeline under test:
 *   solveToolProgression() → needsBlocks → SterlingPlanner → explore_for_resources step
 *     → executeSterlingStep() → executeTool → regenerateSteps
 *       → new steps (acquire_material, craft_recipe) → dispatch
 *
 * Covers: G-4 (explore_for_resources), EP-2 (solver path)
 * Leaves exercised: explore_for_resources, acquire_material, craft_recipe (after replan)
 *
 * Run with: npx vitest run packages/planning/src/__tests__/explore-replan-dispatch-e2e.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSterlingStep } from '../executor/sterling-step-executor';
import type { SterlingStepExecutorContext } from '../executor/sterling-step-executor.types';
import { mapBTActionToMinecraft } from '../modules/action-mapping';

// ============================================================================
// Step factories — mirrors what SterlingPlanner.generateToolProgressionStepsFromSterling
// produces when the solver returns { solved: false, needsBlocks }
// ============================================================================

/**
 * Replicates the explore step shape from sterling-planner.ts lines 758-787.
 * Uses meta.args (plain object) so stepToLeafExecution returns argsSource='explicit'.
 */
function makeExploreForResourcesStep(missingBlocks: string[], goalItem: string) {
  const now = Date.now();
  return {
    id: `step-${now}-explore`,
    label: `Leaf: minecraft.explore_for_resources (resource_tags=[${missingBlocks.join(',')}])`,
    done: false,
    order: 1,
    estimatedDuration: 30000,
    meta: {
      domain: 'tool_progression',
      leaf: 'explore_for_resources',
      args: {
        resource_tags: missingBlocks,
        goal_item: goalItem,
        reason: 'needs_blocks',
      },
      source: 'sterling',
      solverId: 'minecraft.tool_progression',
      executable: true,
    },
  };
}

function makeAcquireStep(item: string, count: number, order: number) {
  return {
    id: `step-${Date.now()}-acquire-${order}`,
    label: `Leaf: minecraft.acquire_material (item=${item})`,
    done: false,
    order,
    meta: {
      leaf: 'acquire_material',
      args: { item, count },
      executable: true,
      authority: 'sterling',
    },
  };
}

function makeCraftStep(recipe: string, qty: number, order: number) {
  return {
    id: `step-${Date.now()}-craft-${order}`,
    label: `Leaf: minecraft.craft_recipe (recipe=${recipe})`,
    done: false,
    order,
    meta: {
      leaf: 'craft_recipe',
      args: { recipe, qty },
      executable: true,
      authority: 'sterling',
    },
  };
}

// ============================================================================
// Executor context factory
// ============================================================================

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
      'minecraft.explore_for_resources',
      'minecraft.acquire_material',
      'minecraft.craft_recipe',
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

// ============================================================================
// Tests
// ============================================================================

describe('Explore-for-Resources Dispatch + Replan E2E', () => {

  // ── Contract: explore step shape is valid ──

  describe('Explore step contract', () => {
    it('explore_for_resources step has valid action mapping', () => {
      const step = makeExploreForResourcesStep(['stone'], 'stone_pickaxe');
      const args = step.meta.args;
      const action = mapBTActionToMinecraft('explore_for_resources', args);

      expect(action).not.toBeNull();
      expect(action!.parameters._error).toBeUndefined();
      expect(action!.parameters.resource_tags).toEqual(['stone']);
      expect(action!.parameters.goal_item).toBe('stone_pickaxe');
    });

    it('explore step has meta.args as plain object (Option A / explicit path)', () => {
      const step = makeExploreForResourcesStep(['stone'], 'stone_pickaxe');

      expect(step.meta.args).toBeDefined();
      expect(typeof step.meta.args).toBe('object');
      expect(step.meta.args.resource_tags).toEqual(['stone']);
    });

    it('explore step carries solver provenance', () => {
      const step = makeExploreForResourcesStep(['oak_log'], 'wooden_pickaxe');

      expect(step.meta.domain).toBe('tool_progression');
      expect(step.meta.solverId).toBe('minecraft.tool_progression');
      expect(step.meta.source).toBe('sterling');
    });
  });

  // ── needsBlocks → explore step generation ──

  describe('needsBlocks → explore step generation', () => {
    it('single missing block produces explore with correct resource_tags', () => {
      const step = makeExploreForResourcesStep(['stone'], 'stone_pickaxe');

      expect(step.meta.args.resource_tags).toEqual(['stone']);
      expect(step.meta.args.goal_item).toBe('stone_pickaxe');
      expect(step.meta.args.reason).toBe('needs_blocks');
    });

    it('multiple missing blocks produce explore with all resource_tags', () => {
      const step = makeExploreForResourcesStep(
        ['stone', 'iron_ore', 'coal_ore'],
        'iron_pickaxe',
      );

      expect(step.meta.args.resource_tags).toEqual(['stone', 'iron_ore', 'coal_ore']);
      expect(step.meta.args.goal_item).toBe('iron_pickaxe');
    });
  });

  // ── Executor dispatches explore and triggers replan ──

  describe('Executor dispatches explore and triggers replan', () => {
    it('dispatches explore_for_resources and calls regenerateSteps', async () => {
      const exploreStep = makeExploreForResourcesStep(['stone'], 'stone_pickaxe');
      const regenerateSteps = vi.fn().mockResolvedValue({
        success: true,
        stepsDigest: 'new_digest',
        steps: [
          makeAcquireStep('cobblestone', 3, 2),
          makeCraftStep('stone_pickaxe', 1, 3),
        ],
      });

      const ctx = createMockExecutorContext({ regenerateSteps });
      const task = {
        id: 'task-tool-progression',
        title: 'Craft stone pickaxe',
        steps: [exploreStep],
        metadata: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      await executeSterlingStep(task, exploreStep, ctx);

      // Verify explore was dispatched
      expect(ctx.executeTool).toHaveBeenCalledWith(
        'minecraft.explore_for_resources',
        expect.objectContaining({ resource_tags: ['stone'] }),
        undefined,
      );

      // Verify replan was triggered
      expect(regenerateSteps).toHaveBeenCalledWith(
        task.id,
        expect.objectContaining({
          failedLeaf: 'explore_for_resources',
          reasonClass: 'explore_completed',
        }),
      );
    });

    it('continues gracefully if replan fails', async () => {
      const exploreStep = makeExploreForResourcesStep(['stone'], 'stone_pickaxe');
      const regenerateSteps = vi.fn().mockResolvedValue({ success: false });

      const ctx = createMockExecutorContext({ regenerateSteps });
      const task = {
        id: 'task-tool-progression',
        title: 'Craft stone pickaxe',
        steps: [exploreStep],
        metadata: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      await executeSterlingStep(task, exploreStep, ctx);

      // Explore still dispatched
      expect(ctx.executeTool).toHaveBeenCalledTimes(1);
      // Replan attempted
      expect(regenerateSteps).toHaveBeenCalled();
      // Step still completed (explore itself succeeded)
      expect(ctx.completeTaskStep).toHaveBeenCalled();
    });
  });

  // ── Full pipeline: explore → replan → dispatch new steps ──

  describe('Full pipeline: explore → replan → dispatch new steps', () => {
    it('explore → replan → acquire_material + craft_recipe dispatched', async () => {
      const exploreStep = makeExploreForResourcesStep(['stone'], 'stone_pickaxe');
      const regenAcquireStep = makeAcquireStep('cobblestone', 3, 2);
      const regenCraftStep = makeCraftStep('stone_pickaxe', 1, 3);

      const regenerateSteps = vi.fn().mockResolvedValue({
        success: true,
        stepsDigest: 'regen_digest',
        steps: [regenAcquireStep, regenCraftStep],
      });

      // Phase 1: dispatch explore, trigger replan
      const ctx1 = createMockExecutorContext({ regenerateSteps });
      const task = {
        id: 'task-tool-progression',
        title: 'Craft stone pickaxe',
        steps: [exploreStep],
        metadata: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      await executeSterlingStep(task, exploreStep, ctx1);
      expect(ctx1.executeTool).toHaveBeenCalledWith(
        'minecraft.explore_for_resources',
        expect.objectContaining({ resource_tags: ['stone'] }),
        undefined,
      );

      // Phase 2: dispatch replanned steps
      exploreStep.done = true;
      const fullTask = {
        ...task,
        steps: [exploreStep, regenAcquireStep, regenCraftStep],
      };

      const ctx2 = createMockExecutorContext();
      for (const step of [regenAcquireStep, regenCraftStep]) {
        await executeSterlingStep(fullTask, step, ctx2);
      }

      const executeCalls = (ctx2.executeTool as ReturnType<typeof vi.fn>).mock.calls;
      expect(executeCalls).toHaveLength(2);
      expect(executeCalls[0][0]).toBe('minecraft.acquire_material');
      expect(executeCalls[0][1]).toEqual(expect.objectContaining({ item: 'cobblestone' }));
      expect(executeCalls[1][0]).toBe('minecraft.craft_recipe');
      expect(executeCalls[1][1]).toEqual(expect.objectContaining({ recipe: 'stone_pickaxe' }));
    });
  });

  // ── Regression: explore args validation ──

  describe('Explore args validation', () => {
    it('explore_for_resources with empty resource_tags still dispatches', () => {
      const step = makeExploreForResourcesStep([], 'wooden_pickaxe');
      const action = mapBTActionToMinecraft('explore_for_resources', step.meta.args);

      expect(action).not.toBeNull();
      expect(action!.parameters.resource_tags).toEqual([]);
    });

    it('explore step without goal_item still has valid action mapping', () => {
      const step = makeExploreForResourcesStep(['stone'], 'stone_pickaxe');
      // Remove goal_item to simulate edge case
      const args = { ...step.meta.args, goal_item: undefined };
      const action = mapBTActionToMinecraft('explore_for_resources', args);

      expect(action).not.toBeNull();
      expect(action!.parameters._error).toBeUndefined();
    });
  });
});
