/**
 * Sleep Driveshaft E2E Test
 *
 * Bridges the sleep driveshaft controller to the executor, proving that
 * the controller's output (sleep step) dispatches successfully through the
 * full executor pipeline. The unit tests in sleep-driveshaft-controller.test.ts
 * cover controller internals (night detection, safety gates, hysteresis).
 * This test covers the boundary: controller output → action mapping → executor dispatch.
 *
 * Pipeline under test:
 *   SleepDriveshaftController.evaluate() → taskData with sleep step
 *     → mapBTActionToMinecraft('sleep', args) → valid action
 *     → executeSterlingStep() → executeTool('minecraft.sleep', {placeBed, searchRadius})
 *
 * Covers: G-6 (sleep has no producer — now resolved), EP-9
 * Leaves exercised: sleep
 *
 * Run with: npx vitest run packages/planning/src/goal-formulation/__tests__/sleep-driveshaft-e2e.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SleepDriveshaftController,
  type SleepDriveshaftConfig,
} from '../sleep-driveshaft-controller';
import { RecordingLifecycleEmitter } from '../reflex-lifecycle-events';
import type { CachedBotState } from '../bot-state-cache';
import { executeSterlingStep } from '../../executor/sterling-step-executor';
import type { SterlingStepExecutorContext } from '../../executor/sterling-step-executor.types';
import { mapBTActionToMinecraft } from '../../modules/action-mapping';

// ============================================================================
// Helpers
// ============================================================================

const NIGHT_TICK = 18000;

function makeBotState(overrides: Partial<CachedBotState> = {}): CachedBotState {
  return {
    position: { x: 100, y: 64, z: 200 },
    health: 20,
    food: 18,
    inventory: [{ name: 'bread', count: 5 }],
    timeOfDay: NIGHT_TICK,
    biome: 'plains',
    nearbyHostiles: 0,
    nearbyPassives: 2,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<SleepDriveshaftConfig> = {}): Partial<SleepDriveshaftConfig> {
  return {
    nightStartTick: 12542,
    nightEndTick: 23460,
    maxHostiles: 0,
    bedSearchRadius: 16,
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
      buildingLeaves: new Set(),
      taskTypeBridgeLeafNames: new Set(),
      enableTaskTypeBridge: false,
      legacyLeafRewriteEnabled: false,
    },
    leafAllowlist: new Set([
      'minecraft.sleep',
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

describe('Sleep Driveshaft E2E', () => {
  let emitter: RecordingLifecycleEmitter;
  let controller: SleepDriveshaftController;

  beforeEach(() => {
    emitter = new RecordingLifecycleEmitter();
    controller = new SleepDriveshaftController({
      ...makeConfig(),
      emitter,
    });
  });

  // ── Controller output → action mapping contract ──

  describe('Controller output → action mapping', () => {
    it('controller-generated sleep step maps to valid action', async () => {
      const result = await controller.evaluate(makeBotState(), 'no_tasks', { dryRun: false });
      expect(result).not.toBeNull();

      const step = result!.taskData.steps[0];
      const action = mapBTActionToMinecraft(step.meta.leaf, step.meta.args);

      expect(action).not.toBeNull();
      expect(action!.type).toBe('sleep');
      expect(action!.parameters._error).toBeUndefined();
    });

    it('sleep args carry Stage 1 constraints', async () => {
      const result = await controller.evaluate(makeBotState(), 'no_tasks', { dryRun: false });
      const step = result!.taskData.steps[0];

      expect(step.meta.args.placeBed).toBe(false);
      expect(step.meta.args.searchRadius).toBe(16);
    });
  });

  // ── Controller output → executor dispatch ──

  describe('Controller output → executor dispatch', () => {
    it('sleep step dispatches successfully through executor', async () => {
      const result = await controller.evaluate(makeBotState(), 'no_tasks', { dryRun: false });
      expect(result).not.toBeNull();

      const step = result!.taskData.steps[0];
      const ctx = createMockExecutorContext();
      const mockTask = {
        id: 'task-sleep-1',
        title: result!.taskData.title,
        steps: result!.taskData.steps,
        metadata: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      await executeSterlingStep(mockTask, step, ctx);

      // Verify dispatch happened
      expect(ctx.executeTool).toHaveBeenCalledTimes(1);
      expect(ctx.executeTool).toHaveBeenCalledWith(
        'minecraft.sleep',
        expect.objectContaining({
          placeBed: false,
          searchRadius: 16,
        }),
        undefined,
      );
    });

    it('executor completes step after successful dispatch', async () => {
      const result = await controller.evaluate(makeBotState(), 'no_tasks', { dryRun: false });
      const step = result!.taskData.steps[0];
      const ctx = createMockExecutorContext();

      await executeSterlingStep(
        {
          id: 'task-sleep-1',
          title: result!.taskData.title,
          steps: result!.taskData.steps,
          metadata: { createdAt: Date.now(), updatedAt: Date.now() },
        },
        step,
        ctx,
      );

      expect(ctx.completeTaskStep).toHaveBeenCalled();
    });
  });

  // ── Safety gates prevent dispatch ──

  describe('Safety gates prevent task generation', () => {
    it('daytime → no task generated → no dispatch possible', async () => {
      const result = await controller.evaluate(
        makeBotState({ timeOfDay: 6000 }),
        'no_tasks',
        { dryRun: false },
      );
      expect(result).toBeNull();
    });

    it('hostiles nearby → no task generated', async () => {
      const result = await controller.evaluate(
        makeBotState({ nearbyHostiles: 1 }),
        'no_tasks',
        { dryRun: false },
      );
      expect(result).toBeNull();
    });
  });

  // ── Hysteresis through executor cycle ──

  describe('Hysteresis through executor cycle', () => {
    it('fires once, dispatches, then cooldown prevents re-fire', async () => {
      // First evaluation fires
      const result1 = await controller.evaluate(makeBotState(), 'no_tasks', { dryRun: false });
      expect(result1).not.toBeNull();

      // Dispatch the task
      const step = result1!.taskData.steps[0];
      const ctx = createMockExecutorContext();
      await executeSterlingStep(
        {
          id: 'task-sleep-1',
          title: result1!.taskData.title,
          steps: result1!.taskData.steps,
          metadata: { createdAt: Date.now(), updatedAt: Date.now() },
        },
        step,
        ctx,
      );
      expect(ctx.executeTool).toHaveBeenCalledTimes(1);

      // Immediately re-evaluate — should be blocked (firedThisNight)
      const result2 = await controller.evaluate(makeBotState(), 'no_tasks', { dryRun: false });
      expect(result2).toBeNull();
    });
  });
});
