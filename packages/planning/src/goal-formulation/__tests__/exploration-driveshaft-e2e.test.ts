/**
 * Exploration Driveshaft E2E Test
 *
 * Bridges the exploration driveshaft controller to the executor, proving that
 * the controller's output (move_to step) dispatches successfully through the
 * full executor pipeline. The unit tests in exploration-driveshaft-controller.test.ts
 * cover controller internals (ticks, safety gates, hysteresis). This test covers
 * the boundary: controller output → action mapping → executor dispatch.
 *
 * Pipeline under test:
 *   ExplorationDriveshaftController.evaluate() → taskData with move_to step
 *     → mapBTActionToMinecraft('move_to', args) → valid action
 *     → executeSterlingStep() → executeTool('minecraft.move_to', {pos})
 *
 * Covers: G-8 (exploration driveshaft), EP-6
 * Leaves exercised: move_to
 *
 * Run with: npx vitest run packages/planning/src/goal-formulation/__tests__/exploration-driveshaft-e2e.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ExplorationDriveshaftController,
  type ExplorationConfig,
} from '../exploration-driveshaft-controller';
import { RecordingLifecycleEmitter } from '../reflex-lifecycle-events';
import type { CachedBotState } from '../bot-state-cache';
import { executeSterlingStep } from '../../executor/sterling-step-executor';
import type { SterlingStepExecutorContext } from '../../executor/sterling-step-executor.types';
import { mapBTActionToMinecraft } from '../../modules/action-mapping';

// ============================================================================
// Helpers
// ============================================================================

function makeBotState(overrides: Partial<CachedBotState> = {}): CachedBotState {
  return {
    position: { x: 100, y: 64, z: 200 },
    health: 20,
    food: 18,
    inventory: [{ name: 'bread', count: 5 }],
    timeOfDay: 6000,
    biome: 'plains',
    nearbyHostiles: 0,
    nearbyPassives: 2,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ExplorationConfig> = {}): Partial<ExplorationConfig> {
  return {
    idleTriggerTicks: 3,
    idleResetTicks: 2,
    cooldownMs: 5000,
    minHealth: 14,
    minFood: 8,
    maxHostiles: 1,
    minDisplacement: 8,
    maxDisplacement: 20,
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

describe('Exploration Driveshaft E2E', () => {
  let emitter: RecordingLifecycleEmitter;
  let controller: ExplorationDriveshaftController;

  beforeEach(() => {
    emitter = new RecordingLifecycleEmitter();
    controller = new ExplorationDriveshaftController({
      ...makeConfig(),
      emitter,
    });
  });

  // ── Controller output → action mapping contract ──

  describe('Controller output → action mapping', () => {
    it('controller-generated move_to step maps to valid action', async () => {
      for (let i = 0; i < 3; i++) controller.tick(true);

      const result = await controller.evaluate(makeBotState(), 'no_tasks', { dryRun: false });
      expect(result).not.toBeNull();

      const step = result!.taskData.steps[0];
      const action = mapBTActionToMinecraft(step.meta.leaf, step.meta.args);

      expect(action).not.toBeNull();
      expect(action!.type).toBe('move_to');
      expect(action!.parameters._error).toBeUndefined();
      // action-mapping converts args.pos → parameters.target for move_to
      expect(action!.parameters.target).toBeDefined();
    });

    it('move_to args have valid pos coordinates', async () => {
      for (let i = 0; i < 3; i++) controller.tick(true);

      const result = await controller.evaluate(makeBotState(), 'no_tasks', { dryRun: false });
      const step = result!.taskData.steps[0];
      const pos = step.meta.args.pos as { x: number; y: number; z: number };

      expect(typeof pos.x).toBe('number');
      expect(typeof pos.y).toBe('number');
      expect(typeof pos.z).toBe('number');
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.z)).toBe(true);
    });
  });

  // ── Controller output → executor dispatch ──

  describe('Controller output → executor dispatch', () => {
    it('exploration move_to dispatches successfully through executor', async () => {
      for (let i = 0; i < 3; i++) controller.tick(true);

      const result = await controller.evaluate(makeBotState(), 'no_tasks', { dryRun: false });
      expect(result).not.toBeNull();

      const step = result!.taskData.steps[0];
      const ctx = createMockExecutorContext();
      const mockTask = {
        id: 'task-explore-1',
        title: result!.taskData.title,
        steps: result!.taskData.steps,
        metadata: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      await executeSterlingStep(mockTask, step, ctx);

      // Verify dispatch happened
      expect(ctx.executeTool).toHaveBeenCalledTimes(1);
      expect(ctx.executeTool).toHaveBeenCalledWith(
        'minecraft.move_to',
        expect.objectContaining({
          pos: expect.objectContaining({
            x: expect.any(Number),
            y: expect.any(Number),
            z: expect.any(Number),
          }),
        }),
        undefined,
      );
    });

    it('executor completes step after successful dispatch', async () => {
      for (let i = 0; i < 3; i++) controller.tick(true);

      const result = await controller.evaluate(makeBotState(), 'no_tasks', { dryRun: false });
      const step = result!.taskData.steps[0];
      const ctx = createMockExecutorContext();

      await executeSterlingStep(
        {
          id: 'task-explore-1',
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
    it('low health → no task generated → no dispatch possible', async () => {
      for (let i = 0; i < 3; i++) controller.tick(true);

      const result = await controller.evaluate(
        makeBotState({ health: 10 }),
        'no_tasks',
        { dryRun: false },
      );

      expect(result).toBeNull();
      // No task → nothing to dispatch
    });

    it('not idle → no task generated', async () => {
      for (let i = 0; i < 3; i++) controller.tick(true);

      const result = await controller.evaluate(
        makeBotState(),
        'all_in_backoff', // Not 'no_tasks'
        { dryRun: false },
      );

      expect(result).toBeNull();
    });
  });

  // ── Hysteresis: fire once, then cooldown ──

  describe('Hysteresis through executor cycle', () => {
    it('fires once, then cooldown prevents re-fire', async () => {
      for (let i = 0; i < 3; i++) controller.tick(true);

      // First evaluation fires
      const result1 = await controller.evaluate(makeBotState(), 'no_tasks', { dryRun: false });
      expect(result1).not.toBeNull();

      // Dispatch the task
      const step = result1!.taskData.steps[0];
      const ctx = createMockExecutorContext();
      await executeSterlingStep(
        {
          id: 'task-explore-1',
          title: result1!.taskData.title,
          steps: result1!.taskData.steps,
          metadata: { createdAt: Date.now(), updatedAt: Date.now() },
        },
        step,
        ctx,
      );
      expect(ctx.executeTool).toHaveBeenCalledTimes(1);

      // Immediately re-evaluate — should be in cooldown
      for (let i = 0; i < 5; i++) controller.tick(true);
      const result2 = await controller.evaluate(makeBotState(), 'no_tasks', { dryRun: false });
      expect(result2).toBeNull();
    });
  });
});
