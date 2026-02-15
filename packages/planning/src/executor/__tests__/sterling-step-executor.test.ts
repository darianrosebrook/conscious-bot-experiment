/**
 * Sterling step executor tests.
 * Mocks context and asserts executeSterlingStep calls toolExecutor with correct (toolName, args).
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeSterlingStep,
  BLOCK_REASONS,
  blockTaskPatch,
  clearBlockedState,
  regenSuccessPatch,
  type SmokePolicyReason,
  type SmokeVerifySkipPatch,
  type SmokeFailNoRegenPatch,
} from '../sterling-step-executor';
import type { SterlingStepExecutorContext } from '../sterling-step-executor.types';
import { GoldenRunRecorder } from '../../golden-run-recorder';
import { normalizeTaskStepsToOptionA } from '../../modules/step-option-a-normalizer';
import { INTENT_LEAVES } from '../../modules/leaf-arg-contracts';

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
      legacyLeafRewriteEnabled: false,
    },
    leafAllowlist: new Set([
      'minecraft.craft_recipe',
      'minecraft.acquire_material',
      'minecraft.smelt',
      'minecraft.place_block',
      'minecraft.place_workstation',
      'minecraft.explore_for_resources',
      'minecraft.step_forward_safely',
      'minecraft.retreat_from_threat',
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

  it('blocks in live when argsSource is derived (e.g. craft_recipe with produces only)', async () => {
    const nextStep = {
      id: 'step-1',
      order: 1,
      label: 'Craft oak planks',
      done: false,
      meta: {
        leaf: 'craft_recipe',
        produces: [{ name: 'oak_planks', count: 4 }],
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
        recordRegenerationAttempt: vi.fn(),
        recordLeafRewriteUsed: vi.fn(),
        recordLoopDetected: vi.fn(),
        markLoopBreakerEvaluated: vi.fn(),
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
      expect.objectContaining({ blockedReason: BLOCK_REASONS.DERIVED_ARGS_NOT_ALLOWED_LIVE })
    );
    expect(recordExecutorBlocked).toHaveBeenCalledWith(
      'run-1',
      BLOCK_REASONS.DERIVED_ARGS_NOT_ALLOWED_LIVE,
      expect.objectContaining({ leaf: 'craft_recipe', argsSource: 'derived' }),
      task.id
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
        recordRegenerationAttempt: vi.fn(),
        recordLeafRewriteUsed: vi.fn(),
        recordLoopDetected: vi.fn(),
        markLoopBreakerEvaluated: vi.fn(),
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
        blockedReason: BLOCK_REASONS.SENTINEL_ARGS_NOT_ALLOWED_LIVE,
      })
    );
    expect(recordExecutorBlocked).toHaveBeenCalledWith(
      'run-1',
      BLOCK_REASONS.SENTINEL_ARGS_NOT_ALLOWED_LIVE,
      expect.objectContaining({ leaf: 'craft_recipe', sentinel: 'recipe' }),
      task.id
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
        recordRegenerationAttempt: vi.fn(),
        recordLeafRewriteUsed: vi.fn(),
        recordLoopDetected: vi.fn(),
        markLoopBreakerEvaluated: vi.fn(),
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
      BLOCK_REASONS.SENTINEL_ARGS_NOT_ALLOWED_LIVE,
      expect.objectContaining({ leaf: 'smelt', sentinel: 'input' }),
      task.id
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
        recordRegenerationAttempt: vi.fn(),
        recordLeafRewriteUsed: vi.fn(),
        recordLoopDetected: vi.fn(),
        markLoopBreakerEvaluated: vi.fn(),
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
        recordRegenerationAttempt: vi.fn(),
        recordLeafRewriteUsed: vi.fn(),
        recordLoopDetected: vi.fn(),
        markLoopBreakerEvaluated: vi.fn(),
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
        blockedReason: BLOCK_REASONS.PLANNING_INCOMPLETE,
        nextEligibleAt: expect.any(Number),
      })
    );
    const updateCall = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(updateCall.nextEligibleAt).toBeGreaterThanOrEqual(now + 299_000);
    expect(updateCall.nextEligibleAt).toBeLessThanOrEqual(now + 301_000);
    expect(recordExecutorBlocked).toHaveBeenCalledWith(
      'run-1',
      BLOCK_REASONS.PLANNING_INCOMPLETE,
      expect.objectContaining({ leaf: expect.any(String) }),
      task.id
    );
  });

  it('unknown leaf: normalize sets planningIncomplete and planningIncompleteReasons; executor blocks with deterministic backoff (no hot-loop)', async () => {
    const task = {
      id: 'task-unknown-leaf',
      title: 'Task with unknown leaf',
      steps: [
        {
          id: 'step-1',
          order: 1,
          meta: { leaf: 'unsupported_leaf_xyz' },
        },
      ],
      metadata: {} as Record<string, unknown>,
    };
    normalizeTaskStepsToOptionA(task);
    expect(task.metadata?.planningIncomplete).toBe(true);
    const reasons = task.metadata?.planningIncompleteReasons as Array<{
      leaf?: string;
      reason: string;
    }>;
    expect(reasons).toHaveLength(1);
    expect(reasons[0].leaf).toBe('unsupported_leaf_xyz');
    expect(reasons[0].reason).toBe('unknown_leaf');

    const nextStep = task.steps![0] as {
      id: string;
      order: number;
      meta: Record<string, unknown>;
    };
    const recordExecutorBlocked = vi.fn();
    const ctx = createMockContext({
      getGoldenRunRecorder: () => ({
        recordExecutorBlocked,
        recordShadowDispatch: vi.fn(),
        recordVerification: vi.fn(),
        recordDispatch: vi.fn(),
        recordRegenerationAttempt: vi.fn(),
        recordLeafRewriteUsed: vi.fn(),
        recordLoopDetected: vi.fn(),
        markLoopBreakerEvaluated: vi.fn(),
      }),
    });
    const now = Date.now();
    await executeSterlingStep(
      { ...task, metadata: { ...task.metadata, goldenRun: { runId: 'run-unknown-leaf' } } },
      nextStep,
      ctx
    );

    expect(ctx.executeTool).not.toHaveBeenCalled();
    expect(ctx.updateTaskMetadata).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({
        blockedReason: BLOCK_REASONS.PLANNING_INCOMPLETE,
        nextEligibleAt: expect.any(Number),
      })
    );
    const updateCall = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(updateCall.nextEligibleAt).toBeGreaterThanOrEqual(now + 299_000);
    expect(updateCall.nextEligibleAt).toBeLessThanOrEqual(now + 301_000);
    expect(recordExecutorBlocked).toHaveBeenCalledWith(
      'run-unknown-leaf',
      BLOCK_REASONS.PLANNING_INCOMPLETE,
      expect.objectContaining({ leaf: 'unsupported_leaf_xyz' }),
      task.id
    );
  });

  describe('dig_block quarantine (6.6)', () => {
    it('live mode with dig_block (rewrite) and legacyLeafRewriteEnabled false blocks with legacy_leaf_rewrite_disabled', async () => {
      const nextStep = {
        id: 'step-1',
        order: 1,
        label: 'Dig oak log',
        done: false,
        meta: { leaf: 'dig_block', produces: [{ name: 'oak_log', count: 1 }] },
      };

      const recordExecutorBlocked = vi.fn();
      const ctx = createMockContext({
        mode: 'live',
        config: {
          ...createMockContext().config,
          legacyLeafRewriteEnabled: false,
        },
        getGoldenRunRecorder: () => ({
          recordExecutorBlocked,
          recordShadowDispatch: vi.fn(),
          recordVerification: vi.fn(),
          recordDispatch: vi.fn(),
          recordRegenerationAttempt: vi.fn(),
          recordLeafRewriteUsed: vi.fn(),
          recordLoopDetected: vi.fn(),
          markLoopBreakerEvaluated: vi.fn(),
        }),
      });

      await executeSterlingStep(
        { ...task, metadata: { goldenRun: { runId: 'run-dig-1' } } },
        nextStep,
        ctx
      );

      expect(ctx.executeTool).not.toHaveBeenCalled();
      expect(ctx.updateTaskMetadata).toHaveBeenCalledWith(
        task.id,
        expect.objectContaining({
          blockedReason: BLOCK_REASONS.LEGACY_LEAF_REWRITE_DISABLED,
          nextEligibleAt: expect.any(Number),
        })
      );
      expect(recordExecutorBlocked).toHaveBeenCalledWith(
        'run-dig-1',
        BLOCK_REASONS.LEGACY_LEAF_REWRITE_DISABLED,
        expect.objectContaining({
          leaf: 'acquire_material',
          original_leaf: 'dig_block',
        }),
        task.id
      );
    });

    it('shadow mode with dig_block records rewrite_used in artifact', async () => {
      const nextStep = {
        id: 'step-1',
        order: 1,
        label: 'Dig oak log',
        done: false,
        meta: { leaf: 'dig_block', produces: [{ name: 'oak_log', count: 1 }] },
      };

      const recorder = new GoldenRunRecorder(
        'artifacts/golden-run-test-dig-block'
      );
      const ctx = createMockContext({
        mode: 'shadow',
        getGoldenRunRecorder: () => recorder,
      });

      await executeSterlingStep(
        { ...task, metadata: { goldenRun: { runId: 'run-dig-shadow' } } },
        nextStep,
        ctx
      );

      expect(ctx.executeTool).not.toHaveBeenCalled();
      const report = recorder.getReport('run-dig-shadow');
      expect(report).not.toBeNull();
      const rewriteDecision = report?.execution?.decisions?.find(
        (d) => d.reason === 'rewrite_used'
      );
      expect(rewriteDecision).toBeDefined();
      expect(rewriteDecision?.leaf).toBe('acquire_material');
    });
  });

  describe('safety preemption handling', () => {
    const navStep = {
      id: 'step-nav',
      order: 1,
      label: 'Acquire material',
      done: false,
      meta: {
        leaf: 'acquire_material',
        args: { item: 'oak_log', quantity: 1 },
        authority: 'sterling',
      },
    };

    it('NAV_PREEMPTED triggers SAFETY_PREEMPTED block with 30s backoff', async () => {
      const ctx = createMockContext({
        executeTool: vi.fn().mockResolvedValue({
          ok: false,
          error: 'NAV_PREEMPTED',
        }),
      });

      await executeSterlingStep(task, navStep, ctx);

      expect(ctx.updateTaskMetadata).toHaveBeenCalledWith(
        task.id,
        expect.objectContaining({
          blockedReason: BLOCK_REASONS.SAFETY_PREEMPTED,
        })
      );
      // Verify 30s backoff (TRANSIENT_BLOCK_BACKOFF_MS)
      const patch = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(patch.nextEligibleAt).toBeGreaterThan(Date.now() - 1000);
    });

    it('NAV_BUSY triggers NAVIGATING_IN_PROGRESS (existing behavior preserved)', async () => {
      const recorder = { recordExecutorBlocked: vi.fn() };
      const ctx = createMockContext({
        executeTool: vi.fn().mockResolvedValue({
          ok: false,
          error: 'NAV_BUSY',
        }),
      });

      const taskWithRun = {
        ...task,
        metadata: { goldenRun: { runId: 'run-nav-busy' } },
      };

      await executeSterlingStep(taskWithRun, navStep, ctx);

      // NAV_BUSY should not set SAFETY_PREEMPTED — it goes through isNavigatingError
      expect(ctx.updateTaskMetadata).not.toHaveBeenCalledWith(
        task.id,
        expect.objectContaining({
          blockedReason: BLOCK_REASONS.SAFETY_PREEMPTED,
        })
      );
    });
  });
});

describe('blocked-state lifecycle helpers', () => {
  it('blockTaskPatch always includes blockedReason and blockedAt', () => {
    const patch = blockTaskPatch(BLOCK_REASONS.RATE_LIMITED);
    expect(patch.blockedReason).toBe(BLOCK_REASONS.RATE_LIMITED);
    expect(typeof patch.blockedAt).toBe('number');
    expect(patch.blockedAt).toBeGreaterThan(0);
  });

  it('blockTaskPatch includes nextEligibleAt when provided', () => {
    const patch = blockTaskPatch(BLOCK_REASONS.RATE_LIMITED, { nextEligibleAt: 99999 });
    expect(patch.nextEligibleAt).toBe(99999);
  });

  it('blockTaskPatch omits nextEligibleAt when not provided', () => {
    const patch = blockTaskPatch(BLOCK_REASONS.RATE_LIMITED);
    expect('nextEligibleAt' in patch).toBe(false);
  });

  it('blockTaskPatch uses opts.now for blockedAt when provided', () => {
    const patch = blockTaskPatch(BLOCK_REASONS.RATE_LIMITED, { now: 42 });
    expect(patch.blockedAt).toBe(42);
  });

  it('clearBlockedState clears blockedReason, blockedAt, and nextEligibleAt', () => {
    const patch = clearBlockedState();
    expect(patch.blockedReason).toBeUndefined();
    expect(patch.blockedAt).toBeUndefined();
    expect(patch.nextEligibleAt).toBeUndefined();
  });

  it('blockTaskPatch preserves blockedAt when same reason re-applied (TTL anchor)', () => {
    const existingMetadata = {
      blockedReason: BLOCK_REASONS.PLANNING_INCOMPLETE,
      blockedAt: 1000,
    };
    const patch = blockTaskPatch(BLOCK_REASONS.PLANNING_INCOMPLETE, {
      existingMetadata,
      now: 5000,
    });
    // Same reason → preserve original blockedAt (TTL anchor stays at 1000)
    expect(patch.blockedAt).toBe(1000);
    expect(patch.blockedReason).toBe(BLOCK_REASONS.PLANNING_INCOMPLETE);
  });

  it('blockTaskPatch resets blockedAt when reason changes', () => {
    const existingMetadata = {
      blockedReason: BLOCK_REASONS.PLANNING_INCOMPLETE,
      blockedAt: 1000,
    };
    const patch = blockTaskPatch(BLOCK_REASONS.RATE_LIMITED, {
      existingMetadata,
      now: 5000,
    });
    // Different reason → new blockedAt
    expect(patch.blockedAt).toBe(5000);
    expect(patch.blockedReason).toBe(BLOCK_REASONS.RATE_LIMITED);
  });

  it('blockTaskPatch sets blockedAt when no existing metadata (first block)', () => {
    const patch = blockTaskPatch(BLOCK_REASONS.RATE_LIMITED, { now: 3000 });
    expect(patch.blockedAt).toBe(3000);
  });

  it('blockTaskPatch sets blockedAt when existingMetadata has no blockedReason (unblocked→blocked)', () => {
    const existingMetadata = { retryCount: 1 };
    const patch = blockTaskPatch(BLOCK_REASONS.RATE_LIMITED, {
      existingMetadata,
      now: 7000,
    });
    expect(patch.blockedAt).toBe(7000);
  });

  it('regenSuccessPatch includes clearBlockedState fields plus regen resets', () => {
    const patch = regenSuccessPatch({
      repairCount: 2,
      stepsDigest: 'digest-abc',
      now: 1000,
    });
    // clearBlockedState fields
    expect(patch.blockedReason).toBeUndefined();
    expect(patch.blockedAt).toBeUndefined();
    expect(patch.nextEligibleAt).toBeUndefined();
    // Regen resets
    expect(patch.retryCount).toBe(0);
    expect(patch.repairCount).toBe(2);
    expect(patch.lastRepairAt).toBe(1000);
    expect(patch.lastStepsDigest).toBe('digest-abc');
    expect(patch.regenDisabledUntil).toBeUndefined();
    expect(patch.regenAttempts).toBe(0);
    // Failure-adjacent fields must also be cleared
    expect(patch.failureCode).toBeUndefined();
    expect(patch.failureError).toBeUndefined();
    expect(patch.regenLastAttemptAt).toBeUndefined();
  });
});

describe('metadata patch semantics: undefined clears fields via spread merge', () => {
  it('spread merge with undefined values overwrites existing keys', () => {
    // This is the contract that clearBlockedState() and regenSuccessPatch() rely on.
    // task-integration.ts line 2282: task.metadata = { ...task.metadata, ...patch }
    const existing = {
      blockedReason: 'rate_limited',
      blockedAt: 1000,
      nextEligibleAt: 2000,
      retryCount: 3,
      someOtherField: 'preserved',
    };
    const patch = clearBlockedState();
    const merged = { ...existing, ...patch };

    // undefined overwrites the key but the key still exists (value is undefined)
    expect(merged.blockedReason).toBeUndefined();
    expect(merged.blockedAt).toBeUndefined();
    expect(merged.nextEligibleAt).toBeUndefined();
    // Non-patched fields are preserved
    expect(merged.retryCount).toBe(3);
    expect(merged.someOtherField).toBe('preserved');
    // The key exists (even though value is undefined)
    expect('blockedReason' in merged).toBe(true);
  });

  it('regenSuccessPatch clears failure-adjacent fields via spread', () => {
    const existing = {
      blockedReason: 'rate_limited',
      blockedAt: 1000,
      failureCode: 'CRAFT_FAILED',
      failureError: 'No materials',
      regenLastAttemptAt: 500,
      retryCount: 5,
      regenAttempts: 2,
    };
    const patch = regenSuccessPatch({
      repairCount: 1,
      stepsDigest: 'digest-xyz',
      now: 2000,
    });
    const merged: Record<string, unknown> = { ...existing, ...patch };

    // Blocked state cleared
    expect(merged.blockedReason).toBeUndefined();
    expect(merged.blockedAt).toBeUndefined();
    // Failure fields cleared
    expect(merged.failureCode).toBeUndefined();
    expect(merged.failureError).toBeUndefined();
    expect(merged.regenLastAttemptAt).toBeUndefined();
    // Counters reset
    expect(merged.retryCount).toBe(0);
    expect(merged.regenAttempts).toBe(0);
    // Regen success values set
    expect(merged.repairCount).toBe(1);
    expect(merged.lastRepairAt).toBe(2000);
    expect(merged.lastStepsDigest).toBe('digest-xyz');
  });
});

describe('blockedAt is always paired with blockedReason', () => {
  const task = {
    id: 'task-blockedAt-1',
    title: 'BlockedAt test',
    steps: [],
    metadata: {} as Record<string, unknown>,
    progress: 0,
  };

  const blockScenarios = [
    {
      name: 'planning_incomplete',
      metadata: { planningIncomplete: true },
      step: { id: 's1', meta: { leaf: 'craft_recipe', args: { recipe: 'oak_planks' } } },
    },
    {
      name: 'derived args',
      metadata: {},
      step: { id: 's1', meta: { leaf: 'craft_recipe', produces: [{ name: 'oak_planks', count: 4 }] } },
    },
    {
      name: 'sentinel recipe',
      metadata: {},
      step: { id: 's1', meta: { leaf: 'craft_recipe', args: { recipe: 'unknown', qty: 1 } } },
    },
    {
      name: 'validation failure (invalid type)',
      metadata: {},
      step: { id: 's1', meta: { leaf: 'craft_recipe', args: { recipe: 123 } } },
    },
    {
      name: 'rate limited',
      metadata: {},
      step: { id: 's1', meta: { leaf: 'craft_recipe', args: { recipe: 'oak_planks' } } },
      ctxOverrides: { canExecuteStep: vi.fn().mockReturnValue(false) },
    },
  ];

  for (const scenario of blockScenarios) {
    it(`${scenario.name}: metadata patch includes both blockedReason and blockedAt`, async () => {
      const ctx = createMockContext(scenario.ctxOverrides || {});
      await executeSterlingStep(
        { ...task, metadata: { ...scenario.metadata } },
        scenario.step as any,
        ctx
      );
      const calls = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls;
      const blockCall = calls.find(
        (c: unknown[]) => (c[1] as Record<string, unknown>)?.blockedReason !== undefined
      );
      expect(blockCall).toBeDefined();
      expect(blockCall![1].blockedAt).toBeDefined();
      expect(typeof blockCall![1].blockedAt).toBe('number');
    });
  }
});

describe('intent leaf rejection (vocabulary boundary)', () => {
  const task = {
    id: 'task-intent-1',
    title: 'Intent leaf test',
    steps: [],
    metadata: {} as Record<string, unknown>,
    progress: 0,
  };

  it('task_type_craft step is flagged as intent_leaf_not_executable by normalizer', () => {
    const taskWithIntentStep = {
      id: 'task-intent-2',
      steps: [
        { id: 's1', meta: { leaf: 'task_type_craft', args: { proposition_id: 'p1', task_type: 'CRAFT' } } },
      ],
      metadata: {} as Record<string, unknown>,
    };
    normalizeTaskStepsToOptionA(taskWithIntentStep);
    expect(taskWithIntentStep.metadata.planningIncomplete).toBe(true);
    const reasons = taskWithIntentStep.metadata.planningIncompleteReasons as Array<{ leaf?: string; reason: string }>;
    expect(reasons).toHaveLength(1);
    expect(reasons[0].reason).toBe('intent_leaf_not_executable');
    expect(reasons[0].leaf).toBe('task_type_craft');
  });

  it('intent leaf with explicit args still gets rejected (args shape is irrelevant for intent leaves)', async () => {
    const nextStep = {
      id: 'step-1',
      order: 1,
      label: 'Intent craft',
      done: false,
      meta: {
        leaf: 'task_type_craft',
        args: { proposition_id: 'p1', task_type: 'CRAFT', predicate_lemma: 'craft' },
      },
    };

    const ctx = createMockContext();
    // Even though step has explicit args, stepToLeafExecution returns null
    // because task_type_craft has no case in the switch
    await executeSterlingStep(task, nextStep, ctx);
    expect(ctx.executeTool).not.toHaveBeenCalled();
  });

  it('no intent leaf is in the default allowlist', () => {
    const ctx = createMockContext();
    for (const intentLeaf of INTENT_LEAVES) {
      expect(ctx.leafAllowlist.has(`minecraft.${intentLeaf}`)).toBe(false);
    }
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
    expect(Array.isArray(report?.execution?.decisions)).toBe(true);
    const dispatchDecision = report?.execution?.decisions?.find(
      (d) => d.reason === 'dispatch'
    );
    expect(dispatchDecision).toBeDefined();
    expect(dispatchDecision?.step_id).toBeDefined();
    expect(dispatchDecision?.leaf).toBe('craft_recipe');
    expect(typeof dispatchDecision?.ts).toBe('number');
  });
});

describe('smoke policy tripwire (metadata assertion)', () => {
  const smokeTask = {
    id: 'task-smoke-tripwire',
    title: 'Smoke tripwire test',
    steps: [],
    metadata: {
      source: 'sterling-smoke',
      noRetry: true,
      no_retry: true,
      disableRegen: true,
      maxRetries: 1,
    } as Record<string, unknown>,
    progress: 0,
  };

  const craftStep = {
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

  it('verify-skip path writes smoke_policy_applied + smoke_policy_reason: skip_verification', async () => {
    // executeTool succeeds (ok: true), but completeTaskStep returns false
    // → verification failed → smoke guard should skip verification and write tripwire
    const ctx = createMockContext({
      executeTool: vi.fn().mockResolvedValue({ ok: true }),
      completeTaskStep: vi.fn().mockResolvedValue(false),
    });

    await executeSterlingStep(smokeTask, craftStep, ctx);

    const metaCalls = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls;
    const tripwireCall = metaCalls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>)?.smoke_policy_applied === true
    );
    expect(tripwireCall).toBeDefined();
    expect(tripwireCall![1]).toEqual(expect.objectContaining({
      smoke_policy_applied: true,
      smoke_policy_reason: 'skip_verification',
      smokeVerifySkipped: true,
    }));
    // Verify the reason is from the narrow type
    const reason: SmokePolicyReason = tripwireCall![1].smoke_policy_reason;
    expect(reason).toBe('skip_verification');
  });

  it('dispatch-error path writes smoke_policy_applied + smoke_policy_reason: fail_no_regen', async () => {
    // executeTool fails (ok: false) → dispatch error → smoke guard should fail fast and write tripwire
    const ctx = createMockContext({
      executeTool: vi.fn().mockResolvedValue({ ok: false, error: 'craft.missingInput' }),
    });

    await executeSterlingStep(smokeTask, craftStep, ctx);

    const metaCalls = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls;
    const tripwireCall = metaCalls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>)?.smoke_policy_applied === true
    );
    expect(tripwireCall).toBeDefined();
    expect(tripwireCall![1]).toEqual(expect.objectContaining({
      smoke_policy_applied: true,
      smoke_policy_reason: 'fail_no_regen',
      smokeNoRetry: true,
    }));
    // Verify fail fast: updateTaskProgress called with 'failed'
    expect(ctx.updateTaskProgress).toHaveBeenCalledWith(
      smokeTask.id,
      smokeTask.progress,
      'failed'
    );
    // Verify the reason is from the narrow type
    const reason: SmokePolicyReason = tripwireCall![1].smoke_policy_reason;
    expect(reason).toBe('fail_no_regen');
  });

  it('non-smoke task does NOT get smoke_policy_applied on verify failure', async () => {
    const normalTask = {
      ...smokeTask,
      id: 'task-normal',
      metadata: {} as Record<string, unknown>,
    };
    const ctx = createMockContext({
      executeTool: vi.fn().mockResolvedValue({ ok: true }),
      completeTaskStep: vi.fn().mockResolvedValue(false),
    });

    await executeSterlingStep(normalTask, craftStep, ctx);

    const metaCalls = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls;
    const tripwireCall = metaCalls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>)?.smoke_policy_applied === true
    );
    expect(tripwireCall).toBeUndefined();
  });

  it('A/B control: without disableRegen, regen IS attempted on max-retry exhaust', async () => {
    // Control: identical to treatment below, but disableRegen is absent.
    // This proves the regen branch IS reachable under these conditions,
    // so the treatment test's non-occurrence is causally due to disableRegen.
    const controlTask = {
      ...smokeTask,
      metadata: {
        source: 'sterling-smoke',
        // disableRegen: intentionally absent
        maxRetries: 1,
        retryCount: 0,
      } as Record<string, unknown>,
    };
    const ctx = createMockContext({
      executeTool: vi.fn().mockResolvedValue({ ok: false, error: 'some_error' }),
      regenerateSteps: vi.fn().mockResolvedValue({ success: false }),
    });

    await executeSterlingStep(controlTask, craftStep, ctx);

    // Without disableRegen, the regen branch fires (repairCount=0 < 2, no cooldown)
    expect(ctx.regenerateSteps).toHaveBeenCalledTimes(1);
  });

  it('A/B treatment: disableRegen prevents regen even when noRetry is absent', async () => {
    // Treatment: identical to control above, but disableRegen is true.
    // regenerateSteps must NOT be called — proving disableRegen has causal impact.
    const treatmentTask = {
      ...smokeTask,
      metadata: {
        source: 'sterling-smoke',
        disableRegen: true,
        maxRetries: 1,
        retryCount: 0,
      } as Record<string, unknown>,
    };
    const ctx = createMockContext({
      executeTool: vi.fn().mockResolvedValue({ ok: false, error: 'some_error' }),
      regenerateSteps: vi.fn().mockResolvedValue({ success: false }),
    });

    await executeSterlingStep(treatmentTask, craftStep, ctx);

    // With disableRegen, the regen branch is skipped
    expect(ctx.regenerateSteps).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Recovery step injection on reposition_or_rescan (Spec A: doom-loop breaker)
// ============================================================================
describe('recovery step injection on reposition_or_rescan', () => {
  const acquireStep = {
    id: 'step-acq',
    order: 1,
    label: 'Acquire sweet berry',
    done: false,
    meta: {
      leaf: 'acquire_material',
      args: { item: 'sweet_berries', count: 1 },
      authority: 'sterling',
    },
  };

  const placeStep = {
    id: 'step-place',
    order: 1,
    label: 'Place block',
    done: false,
    meta: {
      leaf: 'place_block',
      args: { item: 'cobblestone' },
      authority: 'sterling',
    },
  };

  function failWithRepositionHint() {
    return {
      ok: false,
      error: 'no_blocks_found',
      failureCode: 'no_blocks_found',
      toolDiagnostics: {
        _diag_version: 1,
        retry_hint: 'reposition_or_rescan',
        reason_code: 'no_blocks_found',
      },
    };
  }

  it('dispatches explore_for_resources for acquire_material failure (low threat)', async () => {
    const executeTool = vi.fn()
      .mockResolvedValueOnce(failWithRepositionHint())  // original leaf fails
      .mockResolvedValueOnce({ ok: true });              // recovery step succeeds

    const ctx = createMockContext({ executeTool });
    const testTask = { id: 'task-r1', steps: [], metadata: {}, progress: 0 };

    await executeSterlingStep(testTask, acquireStep, ctx);

    // Second executeTool call is the recovery step
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(executeTool).toHaveBeenNthCalledWith(2,
      'minecraft.explore_for_resources',
      expect.objectContaining({
        resource_tags: ['sweet_berries'],
        reason: 'recovery_reposition',
      }),
      undefined,
    );

    // Metadata reflects successful recovery with short backoff
    expect(ctx.updateTaskMetadata).toHaveBeenCalledWith(
      'task-r1',
      expect.objectContaining({
        lastRecoveryOutcome: 'success',
        lastRecoveryLeaf: 'explore_for_resources',
        lastRecoveryMode: 'explore',
        recoveryActionCount: 1,
      }),
    );
    // Short backoff (5s) on success
    const patch = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(patch.nextEligibleAt).toBeLessThanOrEqual(Date.now() + 5_000 + 100);
  });

  it('dispatches retreat_from_threat when threat >= medium', async () => {
    const executeTool = vi.fn()
      .mockResolvedValueOnce(failWithRepositionHint())
      .mockResolvedValueOnce({ ok: true });

    const ctx = createMockContext({
      executeTool,
      getThreatSnapshot: vi.fn().mockResolvedValue({
        overallThreatLevel: 'medium',
        threats: [{ type: 'zombie', distance: 8 }],
      }),
    });
    const testTask = { id: 'task-r2', steps: [], metadata: {}, progress: 0 };

    await executeSterlingStep(testTask, acquireStep, ctx);

    expect(executeTool).toHaveBeenNthCalledWith(2,
      'minecraft.retreat_from_threat',
      expect.objectContaining({ retreatDistance: 15 }),
      undefined,
    );
    expect(ctx.updateTaskMetadata).toHaveBeenCalledWith(
      'task-r2',
      expect.objectContaining({
        lastRecoveryMode: 'retreat',
      }),
    );
  });

  it('broadens exploration tags after 2 repeat failures', async () => {
    const executeTool = vi.fn()
      .mockResolvedValueOnce(failWithRepositionHint())
      .mockResolvedValueOnce({ ok: true });

    const ctx = createMockContext({ executeTool });
    // repositionRetryCount=1 → incremented to 2 (inside budget, past <2 threshold)
    const testTask = {
      id: 'task-r3',
      steps: [],
      metadata: { repositionRetryCount: 1 },
      progress: 0,
    };

    await executeSterlingStep(testTask, acquireStep, ctx);

    // After 2 failures, explore_for_resources called WITHOUT resource_tags
    expect(executeTool).toHaveBeenNthCalledWith(2,
      'minecraft.explore_for_resources',
      expect.objectContaining({ reason: 'recovery_broadened' }),
      undefined,
    );
    // Verify resource_tags is NOT in the args
    const recoveryArgs = executeTool.mock.calls[1][1];
    expect(recoveryArgs.resource_tags).toBeUndefined();
  });

  it('budget exhausted after 3 actions — falls back to long backoff', async () => {
    const executeTool = vi.fn()
      .mockResolvedValueOnce(failWithRepositionHint());

    const ctx = createMockContext({ executeTool });
    const testTask = {
      id: 'task-r4',
      steps: [],
      metadata: { recoveryActionCount: 3 },
      progress: 0,
    };

    await executeSterlingStep(testTask, acquireStep, ctx);

    // No recovery executeTool call — only the original leaf call
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(ctx.updateTaskMetadata).toHaveBeenCalledWith(
      'task-r4',
      expect.objectContaining({
        lastRecoveryOutcome: 'budget_exhausted',
      }),
    );
    // Long backoff (60s)
    const patch = (ctx.updateTaskMetadata as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(patch.nextEligibleAt).toBeGreaterThanOrEqual(Date.now() + 59_000);
  });

  it('uses step_forward_safely for non-acquisition leaf', async () => {
    const executeTool = vi.fn()
      .mockResolvedValueOnce(failWithRepositionHint())
      .mockResolvedValueOnce({ ok: true });

    const ctx = createMockContext({ executeTool });
    const testTask = { id: 'task-r5', steps: [], metadata: {}, progress: 0 };

    await executeSterlingStep(testTask, placeStep, ctx);

    expect(executeTool).toHaveBeenNthCalledWith(2,
      'minecraft.step_forward_safely',
      expect.objectContaining({ distance: 2.0 }),
      undefined,
    );
    expect(ctx.updateTaskMetadata).toHaveBeenCalledWith(
      'task-r5',
      expect.objectContaining({
        lastRecoveryMode: 'reposition',
      }),
    );
  });

  it('max reposition retries still terminates task', async () => {
    const executeTool = vi.fn()
      .mockResolvedValueOnce(failWithRepositionHint());

    const ctx = createMockContext({ executeTool });
    // maxRepositionRetries = RECOVERY_MAX_ACTIONS + 1 = 4
    // repositionRetryCount=3 → repositionRetries = 3 + 1 = 4 >= 4 → task fails
    const testTask = {
      id: 'task-r6',
      steps: [],
      metadata: { repositionRetryCount: 3 },
      progress: 0,
    };

    await executeSterlingStep(testTask, acquireStep, ctx);

    expect(ctx.updateTaskMetadata).toHaveBeenCalledWith(
      'task-r6',
      expect.objectContaining({
        blockedReason: BLOCK_REASONS.MAX_RETRIES_EXCEEDED,
      }),
    );
    expect(ctx.updateTaskProgress).toHaveBeenCalledWith('task-r6', 0, 'failed');
  });

  it('recovery step recorded in golden-run dispatch ledger', async () => {
    const recordDispatch = vi.fn();
    const executeTool = vi.fn()
      .mockResolvedValueOnce(failWithRepositionHint())
      .mockResolvedValueOnce({ ok: true });

    const ctx = createMockContext({
      executeTool,
      getGoldenRunRecorder: () => ({
        recordExecutorBlocked: vi.fn(),
        recordShadowDispatch: vi.fn(),
        recordVerification: vi.fn(),
        recordDispatch,
        recordRegenerationAttempt: vi.fn(),
        recordLeafRewriteUsed: vi.fn(),
        recordLoopDetected: vi.fn(),
        markLoopBreakerEvaluated: vi.fn(),
      }),
    });
    const testTask = {
      id: 'task-r7',
      steps: [],
      metadata: { goldenRun: { runId: 'run-r7' } },
      progress: 0,
    };

    await executeSterlingStep(testTask, acquireStep, ctx);

    // recordDispatch called with recovery step_id prefix
    const recoveryCalls = recordDispatch.mock.calls.filter(
      (c: any[]) => typeof c[1]?.step_id === 'string' && c[1].step_id.startsWith('recovery-')
    );
    expect(recoveryCalls.length).toBeGreaterThanOrEqual(1);
    expect(recoveryCalls[0][1]).toMatchObject({
      leaf: 'explore_for_resources',
      recovery_mode: 'explore',
      recovery_for_task: 'task-r7',
    });
  });

  it('recovery step propagates abort signal from executor context', async () => {
    const abortController = new AbortController();
    const executeTool = vi.fn()
      .mockResolvedValueOnce(failWithRepositionHint())
      .mockResolvedValueOnce({ ok: true });

    const ctx = createMockContext({
      executeTool,
      getAbortSignal: () => abortController.signal,
    });
    const testTask = { id: 'task-r8', steps: [], metadata: {}, progress: 0 };

    await executeSterlingStep(testTask, acquireStep, ctx);

    // Recovery tool call must receive the same abort signal as the executor context
    const recoveryCall = executeTool.mock.calls[1];
    expect(recoveryCall[2]).toBe(abortController.signal);
  });
});
