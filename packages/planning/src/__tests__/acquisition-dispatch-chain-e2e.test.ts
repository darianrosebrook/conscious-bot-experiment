/**
 * Acquisition Solver Dispatch Chain E2E Test
 *
 * Validates the full acquisition solver → step generation → executor dispatch chain
 * using close-to-life mocks. This test catches contract drift between:
 * - Acquisition solver's toTaskSteps() (produces steps with leaf + args)
 * - Leaf routing (acq:trade:* → interact_with_entity, acq:loot:* → open_container)
 * - Executor dispatch (calls executeTool with minecraft.* action)
 *
 * Pipeline under test:
 *   solveAcquisition() → toTaskSteps() → executeSterlingStep()
 *     → executeTool('minecraft.<leaf>', args)
 *
 * Covers: G-3 (acquisition solver strategies), EP-8 (acquisition solver path)
 * Leaves exercised: interact_with_entity (trade), open_container (loot)
 *
 * Run with: npx vitest run packages/planning/src/__tests__/acquisition-dispatch-chain-e2e.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { MinecraftAcquisitionSolver } from '../sterling/minecraft-acquisition-solver';
import { executeSterlingStep } from '../executor/sterling-step-executor';
import type { SterlingStepExecutorContext } from '../executor/sterling-step-executor.types';
import { createMockSterlingService } from '../sterling/__tests__/mock-sterling-service';
import { KNOWN_LEAVES, INTENT_LEAVES } from '../modules/leaf-arg-contracts';
import { buildLeafAllowlist } from '../modular-server';

// ============================================================================
// Mock solve results — mirrors what Sterling returns for acquisition solves
// ============================================================================

function makeTradeSolveResponse() {
  return {
    solutionFound: true,
    solutionPath: [
      { source: 'state-0', target: 'state-1', label: 'acq:trade:iron_ingot' },
    ],
    discoveredNodes: [{ id: 'state-0' }, { id: 'state-1' }],
    searchEdges: [],
    durationMs: 42,
    metrics: {},
  };
}

function makeLootSolveResponse() {
  return {
    solutionFound: true,
    solutionPath: [
      { source: 'state-0', target: 'state-1', label: 'acq:loot:saddle' },
    ],
    discoveredNodes: [{ id: 'state-0' }, { id: 'state-1' }],
    searchEdges: [],
    durationMs: 35,
    metrics: {},
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
    leafAllowlist: buildLeafAllowlist(KNOWN_LEAVES, INTENT_LEAVES, false),
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

function makeTask(steps: any[]) {
  return {
    id: 'task-acq-e2e',
    title: 'Acquisition dispatch chain E2E',
    steps,
    metadata: { createdAt: Date.now(), updatedAt: Date.now() },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Acquisition Solver Dispatch Chain E2E', () => {

  // ── Trade strategy: acq:trade:* → interact_with_entity ──

  describe('Trade strategy → interact_with_entity dispatch', () => {

    it('trade solve produces interact_with_entity leaf with entityType arg', async () => {
      const service = createMockSterlingService({
        solveResponse: makeTradeSolveResponse(),
      });
      const solver = new MinecraftAcquisitionSolver(service);

      const result = await solver.solveAcquisition(
        'iron_ingot', 1,
        { emerald: 5 },
        [],
        [{ type: 'villager', distance: 10 }],
      );

      expect(result.solved).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);

      // Convert to task steps
      const taskSteps = solver.toTaskSteps(result);
      expect(taskSteps.length).toBeGreaterThan(0);

      // Verify leaf routing: acq:trade:iron_ingot → interact_with_entity
      const tradeStep = taskSteps[0];
      expect(tradeStep.meta?.leaf).toBe('interact_with_entity');

      // Verify args satisfy contract (entityType required, resolver-style)
      expect(tradeStep.meta?.args).toEqual(
        expect.objectContaining({ entityType: 'villager' }),
      );
    });

    it('trade step dispatches executeTool with minecraft.interact_with_entity', async () => {
      const service = createMockSterlingService({
        solveResponse: makeTradeSolveResponse(),
      });
      const solver = new MinecraftAcquisitionSolver(service);

      const result = await solver.solveAcquisition(
        'iron_ingot', 1,
        { emerald: 5 },
        [],
        [{ type: 'villager', distance: 10 }],
      );

      const taskSteps = solver.toTaskSteps(result);
      const step = taskSteps[0];
      const task = makeTask(taskSteps);
      const ctx = createMockExecutorContext();

      await executeSterlingStep(task, step, ctx);

      expect(ctx.executeTool).toHaveBeenCalledWith(
        'minecraft.interact_with_entity',
        expect.objectContaining({ entityType: 'villager' }),
        undefined,
      );
    });
  });

  // ── Loot strategy: acq:loot:* → open_container ──

  describe('Loot strategy → open_container dispatch', () => {

    it('loot solve produces open_container leaf with containerType arg', async () => {
      const service = createMockSterlingService({
        solveResponse: makeLootSolveResponse(),
      });
      const solver = new MinecraftAcquisitionSolver(service);

      const result = await solver.solveAcquisition(
        'saddle', 1,
        {},
        [],
        [{ type: 'chest', distance: 15 }],
      );

      expect(result.solved).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);

      // Convert to task steps
      const taskSteps = solver.toTaskSteps(result);
      expect(taskSteps.length).toBeGreaterThan(0);

      // Verify leaf routing: acq:loot:saddle → open_container
      const lootStep = taskSteps[0];
      expect(lootStep.meta?.leaf).toBe('open_container');

      // Verify args satisfy contract (containerType, resolver-style)
      expect(lootStep.meta?.args).toEqual(
        expect.objectContaining({ containerType: 'chest' }),
      );
    });

    it('loot step dispatches executeTool with minecraft.open_container', async () => {
      const service = createMockSterlingService({
        solveResponse: makeLootSolveResponse(),
      });
      const solver = new MinecraftAcquisitionSolver(service);

      const result = await solver.solveAcquisition(
        'saddle', 1,
        {},
        [],
        [{ type: 'chest', distance: 15 }],
      );

      const taskSteps = solver.toTaskSteps(result);
      const step = taskSteps[0];
      const task = makeTask(taskSteps);
      const ctx = createMockExecutorContext();

      await executeSterlingStep(task, step, ctx);

      expect(ctx.executeTool).toHaveBeenCalledWith(
        'minecraft.open_container',
        expect.objectContaining({ containerType: 'chest' }),
        undefined,
      );
    });
  });

  // ── Contract alignment: args are valid per LeafArgContract ──

  describe('Contract alignment', () => {
    it('trade step args pass interact_with_entity contract validation', async () => {
      const service = createMockSterlingService({
        solveResponse: makeTradeSolveResponse(),
      });
      const solver = new MinecraftAcquisitionSolver(service);

      const result = await solver.solveAcquisition(
        'iron_ingot', 1,
        { emerald: 5 },
        [],
        [{ type: 'villager', distance: 10 }],
      );

      const taskSteps = solver.toTaskSteps(result);
      const args = taskSteps[0].meta?.args as Record<string, unknown> ?? {};

      // entityType is required by contract
      expect(args.entityType).toBe('villager');
      expect(typeof args.entityType).toBe('string');
    });

    it('loot step args pass open_container contract validation', async () => {
      const service = createMockSterlingService({
        solveResponse: makeLootSolveResponse(),
      });
      const solver = new MinecraftAcquisitionSolver(service);

      const result = await solver.solveAcquisition(
        'saddle', 1,
        {},
        [],
        [{ type: 'chest', distance: 15 }],
      );

      const taskSteps = solver.toTaskSteps(result);
      const args = taskSteps[0].meta?.args as Record<string, unknown> ?? {};

      // containerType satisfies open_container contract
      expect(args.containerType).toBe('chest');
    });
  });
});
