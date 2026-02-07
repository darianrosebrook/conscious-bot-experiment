/**
 * Sterling step executor tests.
 * Mocks context and asserts executeSterlingStep calls toolExecutor with correct (toolName, args).
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSterlingStep } from '../sterling-step-executor';
import type { SterlingStepExecutorContext } from '../sterling-step-executor.types';
import { GoldenRunRecorder } from '../../golden-run-recorder';

function createMockContext(
  overrides: Partial<SterlingStepExecutorContext> = {}
): SterlingStepExecutorContext {
  const mockExecuteTool = vi.fn().mockResolvedValue({ ok: true });
  const mockStartTaskStep = vi.fn().mockResolvedValue(true);
  const mockCompleteTaskStep = vi.fn().mockResolvedValue(true);
  const mockUpdateTaskMetadata = vi.fn();
  const mockRecordStepExecuted = vi.fn();
  const mockCanExecuteStep = vi.fn().mockReturnValue(true);

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
    },
    leafAllowlist: new Set([
      'minecraft.craft_recipe',
      'minecraft.acquire_material',
      'minecraft.smelt',
      'minecraft.place_block',
      'minecraft.place_workstation',
    ]),
    mode: 'live',
    updateTaskMetadata: mockUpdateTaskMetadata,
    startTaskStep: mockStartTaskStep,
    completeTaskStep: mockCompleteTaskStep,
    emit: vi.fn(),
    executeTool: mockExecuteTool,
    canExecuteStep: mockCanExecuteStep,
    recordStepExecuted: mockRecordStepExecuted,
    getAbortSignal: () => undefined,
    getGoldenRunRecorder: () => ({
      recordExecutorBlocked: vi.fn(),
      recordShadowDispatch: vi.fn(),
      recordVerification: vi.fn(),
      recordDispatch: vi.fn(),
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

describe('executeSterlingStep', () => {
  const task = {
    id: 'task-1',
    title: 'Craft wooden pickaxe',
    steps: [],
    metadata: {},
    progress: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches craft_recipe with correct (toolName, args) when step has explicit args', async () => {
    const nextStep = {
      id: 'step-1',
      order: 1,
      label: 'Craft oak planks',
      done: false,
      meta: {
        leaf: 'craft_recipe',
        args: { recipe: 'oak_planks', qty: 4 },
        authority: 'sterling',
      },
    };

    const ctx = createMockContext();
    await executeSterlingStep(task, nextStep, ctx);

    expect(ctx.executeTool).toHaveBeenCalledTimes(1);
    expect(ctx.executeTool).toHaveBeenCalledWith(
      'minecraft.craft_recipe',
      expect.objectContaining({ recipe: 'oak_planks', qty: 4 }),
      undefined
    );
    expect(ctx.startTaskStep).toHaveBeenCalledWith(task.id, nextStep.id);
    expect(ctx.completeTaskStep).toHaveBeenCalledWith(task.id, nextStep.id);
    expect(ctx.recordStepExecuted).toHaveBeenCalledTimes(1);
  });

  it('blocks in live when argsSource is derived (e.g. dig_block with produces)', async () => {
    const nextStep = {
      id: 'step-1',
      order: 1,
      label: 'Dig oak log',
      done: false,
      meta: {
        leaf: 'dig_block',
        produces: [{ name: 'oak_log', count: 1 }],
        authority: 'sterling',
      },
    };

    const recordExecutorBlocked = vi.fn();
    const ctx = createMockContext({
      leafAllowlist: new Set([
        'minecraft.acquire_material',
        'minecraft.craft_recipe',
      ]),
      getGoldenRunRecorder: () => ({
        recordExecutorBlocked,
        recordShadowDispatch: vi.fn(),
        recordVerification: vi.fn(),
        recordDispatch: vi.fn(),
      }),
    });
    await executeSterlingStep(
      { ...task, metadata: { goldenRun: { runId: 'run-1' } } },
      nextStep,
      ctx
    );

    expect(ctx.executeTool).not.toHaveBeenCalled();
    expect(ctx.updateTaskMetadata).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({ blockedReason: 'derived_args_not_allowed_live' })
    );
    expect(recordExecutorBlocked).toHaveBeenCalledWith(
      'run-1',
      'derived_args_not_allowed_live',
      expect.objectContaining({ leaf: 'acquire_material', argsSource: 'derived' })
    );
  });

  it('dispatches acquire_material in live when step has explicit args', async () => {
    const nextStep = {
      id: 'step-1',
      order: 1,
      label: 'Acquire oak log',
      done: false,
      meta: {
        leaf: 'acquire_material',
        args: { item: 'oak_log', count: 1 },
        authority: 'sterling',
      },
    };

    const ctx = createMockContext({
      leafAllowlist: new Set([
        'minecraft.acquire_material',
        'minecraft.craft_recipe',
      ]),
    });
    await executeSterlingStep(task, nextStep, ctx);

    expect(ctx.executeTool).toHaveBeenCalledTimes(1);
    expect(ctx.executeTool).toHaveBeenCalledWith(
      'minecraft.acquire_material',
      expect.objectContaining({ item: 'oak_log', count: 1 }),
      undefined
    );
  });

  it('blocks in live when sentinel recipe (recipe === unknown)', async () => {
    const nextStep = {
      id: 'step-1',
      order: 1,
      label: 'Craft unknown',
      done: false,
      meta: {
        leaf: 'craft_recipe',
        args: { recipe: 'unknown', qty: 1 },
        authority: 'sterling',
      },
    };

    const recordExecutorBlocked = vi.fn();
    const ctx = createMockContext({
      getGoldenRunRecorder: () => ({
        recordExecutorBlocked,
        recordShadowDispatch: vi.fn(),
        recordVerification: vi.fn(),
        recordDispatch: vi.fn(),
      }),
    });
    await executeSterlingStep(
      { ...task, metadata: { goldenRun: { runId: 'run-1' } } },
      nextStep,
      ctx
    );

    expect(ctx.executeTool).not.toHaveBeenCalled();
    expect(ctx.updateTaskMetadata).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({
        blockedReason: 'sentinel_args_not_allowed_live',
      })
    );
    expect(recordExecutorBlocked).toHaveBeenCalledWith(
      'run-1',
      'sentinel_args_not_allowed_live',
      expect.objectContaining({ leaf: 'craft_recipe', sentinel: 'recipe' })
    );
  });

  it('blocks in live when sentinel input (smelt input === unknown)', async () => {
    const nextStep = {
      id: 'step-1',
      order: 1,
      label: 'Smelt unknown',
      done: false,
      meta: {
        leaf: 'smelt',
        args: { input: 'unknown' },
        authority: 'sterling',
      },
    };

    const recordExecutorBlocked = vi.fn();
    const ctx = createMockContext({
      leafAllowlist: new Set(['minecraft.smelt']),
      getGoldenRunRecorder: () => ({
        recordExecutorBlocked,
        recordShadowDispatch: vi.fn(),
        recordVerification: vi.fn(),
        recordDispatch: vi.fn(),
      }),
    });
    await executeSterlingStep(
      { ...task, metadata: { goldenRun: { runId: 'run-1' } } },
      nextStep,
      ctx
    );

    expect(ctx.executeTool).not.toHaveBeenCalled();
    expect(recordExecutorBlocked).toHaveBeenCalledWith(
      'run-1',
      'sentinel_args_not_allowed_live',
      expect.objectContaining({ leaf: 'smelt', sentinel: 'input' })
    );
  });

  it('blocks when leaf is not in allowlist', async () => {
    const nextStep = {
      id: 'step-1',
      order: 1,
      label: 'Craft planks (excluded from allowlist)',
      done: false,
      meta: {
        leaf: 'craft_recipe',
        args: { recipe: 'oak_planks', qty: 4 },
        authority: 'sterling',
      },
    };

    const ctx = createMockContext({
      leafAllowlist: new Set(['minecraft.acquire_material']),
    });
    await executeSterlingStep(task, nextStep, ctx);

    expect(ctx.executeTool).not.toHaveBeenCalled();
    expect(ctx.updateTaskMetadata).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({ blockedReason: 'unknown-leaf:craft_recipe' })
    );
  });

  it('does not dispatch when step has no leaf (stepToLeafExecution returns null)', async () => {
    const nextStep = {
      id: 'step-1',
      order: 1,
      label: 'No leaf',
      done: false,
      meta: { authority: 'sterling' },
    };

    const ctx = createMockContext();
    await executeSterlingStep(task, nextStep, ctx);

    expect(ctx.executeTool).not.toHaveBeenCalled();
  });

  it('blocks when validation fails', async () => {
    const nextStep = {
      id: 'step-1',
      order: 1,
      label: 'Invalid craft',
      done: false,
      meta: {
        leaf: 'craft_recipe',
        args: { recipe: 123 },
        authority: 'sterling',
      },
    };

    const ctx = createMockContext();
    await executeSterlingStep(task, nextStep, ctx);

    expect(ctx.executeTool).not.toHaveBeenCalled();
    expect(ctx.updateTaskMetadata).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({
        blockedReason: expect.stringContaining('invalid-args'),
      })
    );
  });

  it('in shadow mode records shadow dispatch and does not call executeTool', async () => {
    const nextStep = {
      id: 'step-1',
      order: 1,
      label: 'Craft planks',
      done: false,
      meta: {
        leaf: 'craft_recipe',
        args: { recipe: 'oak_planks', qty: 4 },
        authority: 'sterling',
      },
    };

    const recordShadowDispatch = vi.fn();
    const ctx = createMockContext({
      mode: 'shadow',
      getGoldenRunRecorder: () => ({
        recordExecutorBlocked: vi.fn(),
        recordShadowDispatch,
        recordVerification: vi.fn(),
        recordDispatch: vi.fn(),
      }),
    });
    await executeSterlingStep(task, nextStep, ctx);

    expect(ctx.executeTool).not.toHaveBeenCalled();
    expect(ctx.startTaskStep).toHaveBeenCalledWith(task.id, nextStep.id, {
      dryRun: true,
    });
  });

  it('when rate limiter blocks, does not dispatch', async () => {
    const nextStep = {
      id: 'step-1',
      order: 1,
      label: 'Craft planks',
      done: false,
      meta: {
        leaf: 'craft_recipe',
        args: { recipe: 'oak_planks', qty: 4 },
        authority: 'sterling',
      },
    };

    const ctx = createMockContext({
      canExecuteStep: vi.fn().mockReturnValue(false),
    });
    await executeSterlingStep(task, nextStep, ctx);

    expect(ctx.executeTool).not.toHaveBeenCalled();
  });

  it('when step has explicit Option A (plain-object meta.args), live mode dispatches', async () => {
    const nextStep = {
      id: 'step-1',
      order: 1,
      label: 'Craft oak planks',
      done: false,
      meta: {
        leaf: 'craft_recipe',
        args: { recipe: 'oak_planks', qty: 4 },
        authority: 'sterling',
      },
    };

    const ctx = createMockContext();
    await executeSterlingStep(task, nextStep, ctx);

    expect(ctx.executeTool).toHaveBeenCalledTimes(1);
    expect(ctx.executeTool).toHaveBeenCalledWith(
      'minecraft.craft_recipe',
      expect.objectContaining({ recipe: 'oak_planks', qty: 4 }),
      undefined
    );
  });

  it('blocks in live when task has planningIncomplete with deterministic backoff', async () => {
    const nextStep = {
      id: 'step-1',
      order: 1,
      meta: { leaf: 'craft_recipe', args: { recipe: 'oak_planks', qty: 4 } },
    };
    const recordExecutorBlocked = vi.fn();
    const ctx = createMockContext({
      getGoldenRunRecorder: () => ({
        recordExecutorBlocked,
        recordShadowDispatch: vi.fn(),
        recordVerification: vi.fn(),
        recordDispatch: vi.fn(),
      }),
    });
    const now = Date.now();
    await executeSterlingStep(
      { ...task, metadata: { planningIncomplete: true, goldenRun: { runId: 'run-1' } } },
      nextStep,
      ctx
    );

    expect(ctx.executeTool).not.toHaveBeenCalled();
    expect(ctx.updateTaskMetadata).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({
        blockedReason: 'planning_incomplete',
        nextEligibleAt: expect.any(Number),
      })
    );
    const updateCall = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(updateCall.nextEligibleAt).toBeGreaterThanOrEqual(now + 299_000);
    expect(updateCall.nextEligibleAt).toBeLessThanOrEqual(now + 301_000);
    expect(recordExecutorBlocked).toHaveBeenCalledWith(
      'run-1',
      'planning_incomplete',
      expect.objectContaining({ leaf: expect.any(String) })
    );
  });
});

describe('loop-closure integration (artifact-level proof)', () => {
  it('live dispatch is recorded in report: dispatched_steps and result', async () => {
    const runId = 'loop-closure-run-1';
    const recorder = new GoldenRunRecorder(
      'artifacts/golden-run-test-loop-closure'
    );
    const mockExecuteTool = vi.fn().mockResolvedValue({ ok: true });

    const task = {
      id: 'task-loop-1',
      title: 'Craft planks',
      steps: [
        {
          id: 'step-1',
          order: 1,
          meta: {
            leaf: 'craft_recipe',
            args: { recipe: 'oak_planks', qty: 4 },
          },
        },
      ],
      metadata: {
        goldenRun: { runId },
      },
      progress: 0,
    };
    const nextStep = task.steps[0] as {
      id: string;
      order?: number;
      meta?: Record<string, unknown>;
    };

    const ctx = createMockContext({
      executeTool: mockExecuteTool,
      getGoldenRunRecorder: () => recorder,
      toDispatchResult: (r: unknown) =>
        (r as { ok?: boolean })?.ok ? { status: 'ok' } : { status: 'error', error: 'mock' },
    });

    await executeSterlingStep(task, nextStep, ctx);

    expect(mockExecuteTool).toHaveBeenCalledTimes(1);
    expect(mockExecuteTool).toHaveBeenCalledWith(
      'minecraft.craft_recipe',
      expect.objectContaining({ recipe: 'oak_planks', qty: 4 }),
      undefined
    );

    const report = recorder.getReport(runId);
    expect(report).not.toBeNull();
    expect(report?.execution?.dispatched_steps?.length).toBe(1);
    expect(report?.execution?.dispatched_steps?.[0]?.leaf).toBe('craft_recipe');
    expect(report?.execution?.dispatched_steps?.[0]?.result).toBeDefined();
    expect(report?.execution?.dispatched_steps?.[0]?.result?.status).toBe('ok');
  });
});
