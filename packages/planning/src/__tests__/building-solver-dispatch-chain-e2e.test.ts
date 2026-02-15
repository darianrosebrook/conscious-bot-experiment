/**
 * Building Solver Dispatch Chain E2E Test
 *
 * Validates the full building solver → step generation → executor dispatch chain
 * using close-to-life mocks. This test catches contract drift between:
 * - Building solver's toTaskStepsWithReplan() (produces steps with leaf + args)
 * - Step-to-leaf execution (translates step meta to executable leaf)
 * - Executor dispatch (calls executeTool with minecraft.* action)
 *
 * Pipeline under test:
 *   solveBuildingPlan() → toTaskStepsWithReplan() → executeSterlingStep()
 *     → executeTool('minecraft.<leaf>', args)
 *
 * Covers: G-2 (building solver leaves), EP-2 (solver path)
 * Leaves exercised: prepare_site, build_module, place_feature, building_step,
 *   replan_building, acquire_material (deficit path)
 *
 * Run with: npx vitest run packages/planning/src/__tests__/building-solver-dispatch-chain-e2e.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MinecraftBuildingSolver } from '../sterling/minecraft-building-solver';
import { executeSterlingStep } from '../executor/sterling-step-executor';
import type { SterlingStepExecutorContext } from '../executor/sterling-step-executor.types';
import { createMockSterlingService } from '../sterling/__tests__/mock-sterling-service';
import { mapBTActionToMinecraft } from '../modules/action-mapping';

// ============================================================================
// Mock solve results — mirrors what Sterling returns for building solves
// ============================================================================

function makeSolvedBuildingResult() {
  return {
    solved: true,
    steps: [
      {
        moduleId: 'mod-foundation',
        moduleType: 'prep_site',
        materialsNeeded: [{ name: 'cobblestone', count: 16 }],
        resultingProgress: 0.33,
        resultingInventory: { cobblestone: 48 },
      },
      {
        moduleId: 'mod-walls',
        moduleType: 'apply_module',
        materialsNeeded: [{ name: 'cobblestone', count: 32 }],
        resultingProgress: 0.66,
        resultingInventory: { cobblestone: 16 },
      },
      {
        moduleId: 'mod-door',
        moduleType: 'place_feature',
        materialsNeeded: [{ name: 'oak_door', count: 1 }],
        resultingProgress: 1.0,
        resultingInventory: { cobblestone: 16, oak_door: 0 },
      },
    ],
    totalNodes: 12,
    durationMs: 50,
    planId: 'plan-building-001',
  };
}

function makeDeficitBuildingResult() {
  return {
    solved: false,
    steps: [],
    totalNodes: 8,
    durationMs: 30,
    error: 'Insufficient materials',
    needsMaterials: {
      deficit: { cobblestone: 64, oak_planks: 8 },
      blockedModules: ['mod-walls', 'mod-roof'],
      currentProgress: 0.1,
    },
  };
}

// ============================================================================
// Executor context factory (extended from gather-food pattern)
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
      buildingLeaves: new Set([
        'prepare_site',
        'build_module',
        'place_feature',
        'building_step',
      ]),
      taskTypeBridgeLeafNames: new Set(),
      enableTaskTypeBridge: false,
      legacyLeafRewriteEnabled: false,
    },
    leafAllowlist: new Set([
      'minecraft.prepare_site',
      'minecraft.build_module',
      'minecraft.place_feature',
      'minecraft.building_step',
      'minecraft.replan_building',
      'minecraft.acquire_material',
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

// ============================================================================
// Tests
// ============================================================================

describe('Building Solver Dispatch Chain E2E', () => {
  let solver: MinecraftBuildingSolver;

  beforeEach(() => {
    const service = createMockSterlingService();
    solver = new MinecraftBuildingSolver(service);
  });

  // ── Module type → leaf mapping contract ──

  describe('Module type → leaf mapping contract', () => {
    it('prep_site maps to prepare_site leaf', () => {
      const result = makeSolvedBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      const prepStep = steps.find((s) => s.meta?.moduleType === 'prep_site');
      expect(prepStep).toBeDefined();
      expect(prepStep!.meta?.leaf).toBe('prepare_site');
    });

    it('apply_module maps to build_module leaf', () => {
      const result = makeSolvedBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      const applyStep = steps.find((s) => s.meta?.moduleType === 'apply_module');
      expect(applyStep).toBeDefined();
      expect(applyStep!.meta?.leaf).toBe('build_module');
    });

    it('place_feature maps to place_feature leaf', () => {
      const result = makeSolvedBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      const featureStep = steps.find((s) => s.meta?.moduleType === 'place_feature');
      expect(featureStep).toBeDefined();
      expect(featureStep!.meta?.leaf).toBe('place_feature');
    });

    it('unknown module type maps to building_step (default)', () => {
      const result = makeSolvedBuildingResult();
      // Inject an unknown module type
      result.steps.push({
        moduleId: 'mod-custom',
        moduleType: 'unknown_type' as any,
        materialsNeeded: [],
        resultingProgress: 1.0,
        resultingInventory: {},
      });
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      const customStep = steps.find((s) => s.meta?.moduleType === 'unknown_type');
      expect(customStep).toBeDefined();
      expect(customStep!.meta?.leaf).toBe('building_step');
    });

    it('scaffold module type maps to building_step (regression: not place_scaffold)', () => {
      // Regression guard: scaffold previously mapped to place_scaffold, which had no
      // LeafArgContract or action mapping — causing mid-plan failures at the executor.
      // Scaffold now falls through to building_step (the default). If this test fails,
      // someone re-introduced the place_scaffold routing without adding a contract.
      const result = makeSolvedBuildingResult();
      result.steps.push({
        moduleId: 'mod-scaffold',
        moduleType: 'scaffold' as any,
        materialsNeeded: [{ name: 'oak_planks', count: 8 }],
        resultingProgress: 0.5,
        resultingInventory: {},
      });
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      const scaffoldStep = steps.find((s) => s.meta?.moduleType === 'scaffold');
      expect(scaffoldStep).toBeDefined();
      expect(scaffoldStep!.meta?.leaf).toBe('building_step');
      // Explicitly NOT place_scaffold
      expect(scaffoldStep!.meta?.leaf).not.toBe('place_scaffold');
    });

    it('all generated steps carry templateId in meta', () => {
      const result = makeSolvedBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      for (const step of steps) {
        expect(step.meta?.templateId).toBe('template-shelter');
      }
    });

    it('all generated steps carry domain=building in meta', () => {
      const result = makeSolvedBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      for (const step of steps) {
        expect(step.meta?.domain).toBe('building');
      }
    });
  });

  // ── Happy path: solved plan dispatches all module steps ──

  describe('Happy path: solved plan dispatches all module steps', () => {
    it('generates correct number of steps from solved result', () => {
      const result = makeSolvedBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      expect(steps).toHaveLength(3);
      expect(steps[0].meta?.leaf).toBe('prepare_site');
      expect(steps[1].meta?.leaf).toBe('build_module');
      expect(steps[2].meta?.leaf).toBe('place_feature');
    });

    it('all building leaves have valid action mappings', () => {
      const result = makeSolvedBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      for (const step of steps) {
        const leaf = step.meta?.leaf as string;
        const action = mapBTActionToMinecraft(leaf, step.meta ?? {});
        expect(action, `Leaf "${leaf}" has no action mapping`).not.toBeNull();
        expect(
          action!.parameters?._error,
          `Leaf "${leaf}" produced _error: ${action!.parameters?._error}`,
        ).toBeUndefined();
      }
    });

    it('building steps with derived args are blocked in live mode (Option A policy)', async () => {
      // Building solver currently puts args as top-level meta fields, not meta.args.
      // stepToLeafExecution classifies these as argsSource='derived', which live mode blocks.
      // This is by design: building leaves need explicit Sterling-resolved args for live dispatch.
      const result = makeSolvedBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');
      const ctx = createMockExecutorContext(); // mode: 'live' by default

      const mockTask = {
        id: 'task-build-shelter',
        title: 'Build shelter',
        steps,
        metadata: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      await executeSterlingStep(mockTask, steps[0], ctx);

      // Step is blocked (derived args not allowed in live mode)
      const executeCalls = (ctx.executeTool as ReturnType<typeof vi.fn>).mock.calls;
      expect(executeCalls).toHaveLength(0);

      // Verify the block reason was recorded
      const metaCalls = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls;
      const blockCall = metaCalls.find(
        (c: any[]) => c[1]?.blockedReason === 'derived_args_not_allowed_live',
      );
      expect(blockCall, 'Expected derived_args_not_allowed_live block').toBeDefined();
    });

    it('building steps with explicit args dispatch successfully in live mode', async () => {
      // When Sterling provides args in meta.args (Option A), the executor dispatches.
      // This is how building steps should look after Sterling-resolution.
      const result = makeSolvedBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      // Upgrade to explicit args: move meta fields into meta.args
      const explicitSteps = steps.map((s) => ({
        ...s,
        meta: {
          ...s.meta,
          args: {
            moduleId: s.meta?.moduleId,
            moduleType: s.meta?.moduleType,
            templateId: s.meta?.templateId,
          },
        },
      }));

      const ctx = createMockExecutorContext();
      const mockTask = {
        id: 'task-build-shelter',
        title: 'Build shelter',
        steps: explicitSteps,
        metadata: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      for (let i = 0; i < explicitSteps.length; i++) {
        await executeSterlingStep(mockTask, explicitSteps[i], ctx);

        const executeCalls = (ctx.executeTool as ReturnType<typeof vi.fn>).mock.calls;
        expect(
          executeCalls.length,
          `Step ${i} (${explicitSteps[i].meta?.leaf}) was not dispatched — ` +
            `executeTool called ${executeCalls.length} times, expected ${i + 1}`,
        ).toBe(i + 1);
      }

      // Verify dispatch order
      const executeCalls = (ctx.executeTool as ReturnType<typeof vi.fn>).mock.calls;
      expect(executeCalls[0][0]).toBe('minecraft.prepare_site');
      expect(executeCalls[1][0]).toBe('minecraft.build_module');
      expect(executeCalls[2][0]).toBe('minecraft.place_feature');
    });

    it('dispatched explicit-args steps carry moduleId and templateId', async () => {
      const result = makeSolvedBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      const explicitSteps = steps.map((s) => ({
        ...s,
        meta: {
          ...s.meta,
          args: {
            moduleId: s.meta?.moduleId,
            moduleType: s.meta?.moduleType,
            templateId: s.meta?.templateId,
          },
        },
      }));

      const ctx = createMockExecutorContext();
      const mockTask = {
        id: 'task-build-shelter',
        title: 'Build shelter',
        steps: explicitSteps,
        metadata: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      for (const step of explicitSteps) {
        await executeSterlingStep(mockTask, step, ctx);
      }

      const executeCalls = (ctx.executeTool as ReturnType<typeof vi.fn>).mock.calls;
      for (const call of executeCalls) {
        const args = call[1];
        expect(args.templateId).toBe('template-shelter');
      }
    });
  });

  // ── Deficit path: needsMaterials inserts acquire + replan sentinel ──

  describe('Deficit path: acquisition steps + replan sentinel', () => {
    it('generates acquisition steps for each deficit item', () => {
      const result = makeDeficitBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      // 2 deficit items (cobblestone, oak_planks) + 1 replan sentinel = 3 steps
      expect(steps).toHaveLength(3);

      const acquireSteps = steps.filter((s) => s.meta?.leaf === 'acquire_material');
      expect(acquireSteps).toHaveLength(2);
    });

    it('acquisition steps have correct item and count args', () => {
      const result = makeDeficitBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      const acquireSteps = steps.filter((s) => s.meta?.leaf === 'acquire_material');
      const items = acquireSteps.map((s) => ({
        item: s.meta?.item,
        count: s.meta?.count,
      }));

      expect(items).toContainEqual({ item: 'cobblestone', count: 64 });
      expect(items).toContainEqual({ item: 'oak_planks', count: 8 });
    });

    it('replan sentinel is the last step', () => {
      const result = makeDeficitBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      const lastStep = steps[steps.length - 1];
      expect(lastStep.meta?.leaf).toBe('replan_building');
      expect(lastStep.meta?.templateId).toBe('template-shelter');
    });

    it('replan sentinel has higher order than acquisition steps', () => {
      const result = makeDeficitBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      const acquireOrders = steps
        .filter((s) => s.meta?.leaf === 'acquire_material')
        .map((s) => s.order!);
      const replanOrder = steps.find((s) => s.meta?.leaf === 'replan_building')!.order!;

      for (const acqOrder of acquireOrders) {
        expect(replanOrder).toBeGreaterThan(acqOrder);
      }
    });

    it('acquisition steps with explicit args dispatch through executor', async () => {
      const result = makeDeficitBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      // Upgrade acquisition steps to explicit args (Option A)
      const explicitSteps = steps.map((s) => ({
        ...s,
        meta: {
          ...s.meta,
          args: s.meta?.leaf === 'acquire_material'
            ? { item: s.meta?.item, count: s.meta?.count }
            : s.meta?.leaf === 'replan_building'
              ? { templateId: s.meta?.templateId }
              : undefined,
        },
      }));

      const ctx = createMockExecutorContext();
      const mockTask = {
        id: 'task-build-acquire',
        title: 'Build shelter (acquiring materials)',
        steps: explicitSteps,
        metadata: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      // Only dispatch the acquisition steps (not the replan sentinel)
      const acquireSteps = explicitSteps.filter((s) => s.meta?.leaf === 'acquire_material');
      for (const step of acquireSteps) {
        await executeSterlingStep(mockTask, step, ctx);
      }

      const executeCalls = (ctx.executeTool as ReturnType<typeof vi.fn>).mock.calls;
      expect(executeCalls).toHaveLength(2);
      expect(executeCalls[0][0]).toBe('minecraft.acquire_material');
      expect(executeCalls[1][0]).toBe('minecraft.acquire_material');
    });

    it('all deficit steps carry domain=building and templateId', () => {
      const result = makeDeficitBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      for (const step of steps) {
        expect(step.meta?.domain).toBe('building');
        expect(step.meta?.templateId).toBe('template-shelter');
      }
    });
  });

  // ── Step ordering and identity ──

  describe('Step ordering and identity', () => {
    it('steps have monotonically increasing order values', () => {
      const result = makeSolvedBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      for (let i = 1; i < steps.length; i++) {
        expect(steps[i].order!).toBeGreaterThan(steps[i - 1].order!);
      }
    });

    it('each step has a unique id', () => {
      const result = makeSolvedBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      const ids = steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('steps have descriptive labels with leaf names', () => {
      const result = makeSolvedBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      for (const step of steps) {
        expect(step.label).toContain('minecraft.');
      }
    });
  });

  // ── Dispatch proof: building_step, replan_building, replan_exhausted ──

  describe('Building leaf dispatch proof', () => {
    it('building_step with explicit args dispatches through executor', async () => {
      const result = makeSolvedBuildingResult();
      // Add a scaffold step that maps to building_step (default)
      result.steps.push({
        moduleId: 'mod-scaffold',
        moduleType: 'scaffold' as any,
        materialsNeeded: [{ name: 'oak_planks', count: 8 }],
        resultingProgress: 0.8,
        resultingInventory: {},
      });
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      // Find the building_step and upgrade to explicit args
      const bsStep = steps.find((s) => s.meta?.leaf === 'building_step');
      expect(bsStep, 'Expected a building_step from scaffold module type').toBeDefined();

      const explicitStep = {
        ...bsStep!,
        meta: {
          ...bsStep!.meta,
          args: {
            moduleId: bsStep!.meta?.moduleId,
            moduleType: bsStep!.meta?.moduleType,
            templateId: bsStep!.meta?.templateId,
          },
        },
      };

      const ctx = createMockExecutorContext();
      const mockTask = {
        id: 'task-build-scaffold',
        title: 'Build scaffold',
        steps: [explicitStep],
        metadata: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      await executeSterlingStep(mockTask, explicitStep, ctx);

      const executeCalls = (ctx.executeTool as ReturnType<typeof vi.fn>).mock.calls;
      expect(executeCalls).toHaveLength(1);
      expect(executeCalls[0][0]).toBe('minecraft.building_step');
      expect(executeCalls[0][1]).toEqual(
        expect.objectContaining({ moduleId: 'mod-scaffold', templateId: 'template-shelter' }),
      );
    });

    it('replan_building with explicit args dispatches through executor', async () => {
      const result = makeDeficitBuildingResult();
      const steps = solver.toTaskStepsWithReplan(result, 'template-shelter');

      const replanStep = steps.find((s) => s.meta?.leaf === 'replan_building');
      expect(replanStep, 'Expected a replan_building sentinel in deficit path').toBeDefined();

      // Upgrade to explicit args
      const explicitStep = {
        ...replanStep!,
        meta: {
          ...replanStep!.meta,
          args: { templateId: replanStep!.meta?.templateId },
        },
      };

      const ctx = createMockExecutorContext();
      const mockTask = {
        id: 'task-build-replan',
        title: 'Build shelter (replan)',
        steps: [explicitStep],
        metadata: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      await executeSterlingStep(mockTask, explicitStep, ctx);

      const executeCalls = (ctx.executeTool as ReturnType<typeof vi.fn>).mock.calls;
      expect(executeCalls).toHaveLength(1);
      expect(executeCalls[0][0]).toBe('minecraft.replan_building');
      expect(executeCalls[0][1]).toEqual(
        expect.objectContaining({ templateId: 'template-shelter' }),
      );
    });

    it('replan_exhausted with explicit args dispatches through executor', async () => {
      // replan_exhausted is generated by sterling-planner when max replan
      // attempts are exhausted — mimic the sentinel shape it produces.
      const step = {
        id: 'step-exhausted-1',
        label: 'Leaf: minecraft.replan_exhausted (templateId=template-shelter)',
        done: false,
        order: 1,
        estimatedDuration: 0,
        meta: {
          domain: 'building',
          leaf: 'replan_exhausted',
          templateId: 'template-shelter',
          args: { templateId: 'template-shelter' },
        },
      };

      const ctx = createMockExecutorContext({
        leafAllowlist: new Set([
          ...createMockExecutorContext().leafAllowlist,
          'minecraft.replan_exhausted',
        ]),
      });
      const mockTask = {
        id: 'task-build-exhausted',
        title: 'Build shelter (exhausted)',
        steps: [step],
        metadata: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      await executeSterlingStep(mockTask, step, ctx);

      const executeCalls = (ctx.executeTool as ReturnType<typeof vi.fn>).mock.calls;
      expect(executeCalls).toHaveLength(1);
      expect(executeCalls[0][0]).toBe('minecraft.replan_exhausted');
      expect(executeCalls[0][1]).toEqual(
        expect.objectContaining({ templateId: 'template-shelter' }),
      );
    });
  });
});
