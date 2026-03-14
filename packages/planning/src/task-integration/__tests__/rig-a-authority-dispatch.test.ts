/**
 * AC-2.1 Proof: Rig A crafting dispatches through resolve_intent_steps
 * when the authoritative callback is wired, and falls back to direct
 * solveCraftingGoal only when the callback is absent.
 *
 * These tests prove BEHAVIORAL dispatch, not just type conformance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SterlingPlanner } from '../sterling-planner';
import type { ResolveIntentStepsFn } from '../sterling-planner';
import { SOLVER_IDS } from '../../sterling/solver-ids';

// ── Mock minecraft-data ──
const mockMcData = {
  recipes: { 'wooden_pickaxe': [{ result: { id: 1 }, inShape: [[1, 1, 1], [0, 2, 0], [0, 2, 0]] }] },
  items: { 1: { name: 'wooden_pickaxe' }, 2: { name: 'stick' } },
  itemsByName: { 'wooden_pickaxe': { id: 1 }, 'stick': { id: 2 } },
};

// ── Mock bot context ──
const mockBotState = {
  data: {
    data: {
      inventory: { items: [{ name: 'oak_log', count: 5 }] },
    },
    worldState: {
      nearbyBlocks: ['oak_log', 'dirt'],
      nearbyBlockSummary: { counts: { oak_log: 3, dirt: 10 } },
    },
  },
};

function createMockGet() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockBotState),
  });
}

function createMockCraftingSolver() {
  const solveCraftingGoal = vi.fn().mockResolvedValue({
    solved: true,
    steps: [{ action: 'craft:oak_planks', produces: [{ name: 'oak_planks', count: 4 }], consumes: [{ name: 'oak_log', count: 1 }] }],
    totalNodes: 10,
    durationMs: 50,
    planId: 'test-plan-1',
    solveMeta: { bundles: [] },
  });
  return {
    solverId: SOLVER_IDS.CRAFTING,
    sterlingDomain: 'minecraft' as const,
    contractVersion: 1,
    declarationMode: 'dev' as const,
    solveCraftingGoal,
    toTaskSteps: vi.fn().mockReturnValue([
      { id: 'step-1', label: 'craft oak_planks', done: false, order: 1, estimatedDuration: 5000, meta: { leaf: 'craft_recipe', args: { recipe: 'oak_planks', qty: 1 } } },
    ]),
    getDomainDeclaration: vi.fn().mockReturnValue(null),
    isAvailable: vi.fn().mockReturnValue(true),
    ensureDeclarationRegistered: vi.fn().mockResolvedValue(true),
    strictMapping: false,
  };
}

describe('AC-2.1: Rig A authority dispatch', () => {
  let planner: SterlingPlanner;
  let mockGet: ReturnType<typeof createMockGet>;

  beforeEach(() => {
    mockGet = createMockGet();
    planner = new SterlingPlanner({ minecraftGet: mockGet });
    // Inject mcData cache to avoid real minecraft-data require
    (planner as any)._mcDataCache = mockMcData;
  });

  it('uses resolveIntentSteps when callback is wired', async () => {
    const solver = createMockCraftingSolver();
    planner.registerSolver(solver as any);

    const resolveIntentSteps: ResolveIntentStepsFn = vi.fn().mockResolvedValue({
      status: 'ok',
      replacements: [{
        intent_step_index: 0,
        resolved: true,
        steps: [{ leaf: 'craft_recipe', args: { recipe: 'wooden_pickaxe', qty: 1 } }],
      }],
      plan_bundle_digest: 'abc123',
      schema_version: '1.1.0',
    });

    planner.setResolveIntentSteps(resolveIntentSteps);

    const result = await planner.generateDynamicSteps({
      id: 'test-task',
      title: 'Craft wooden pickaxe',
      type: 'craft',
      parameters: {
        requirementCandidate: { kind: 'craft', outputPattern: 'wooden_pickaxe' },
      },
      metadata: {} as any,
    });

    // resolveIntentSteps MUST be called (authoritative path)
    expect(resolveIntentSteps).toHaveBeenCalledTimes(1);
    // solveCraftingGoal MUST NOT be called (legacy path bypassed)
    expect(solver.solveCraftingGoal).not.toHaveBeenCalled();
    // Steps should come from resolve_intent_steps response
    expect(result.steps.length).toBe(1);
    expect(result.steps[0].meta?.leaf).toBe('craft_recipe');
    expect(result.steps[0].meta?.source).toBe('resolve_intent_steps');
  });

  it('falls back to solveCraftingGoal when callback is absent', async () => {
    const solver = createMockCraftingSolver();
    planner.registerSolver(solver as any);

    // Do NOT wire resolveIntentSteps — legacy path should activate
    // planner.setResolveIntentSteps(undefined); // default

    const result = await planner.generateDynamicSteps({
      id: 'test-task',
      title: 'Craft wooden pickaxe',
      type: 'craft',
      parameters: {
        requirementCandidate: { kind: 'craft', outputPattern: 'wooden_pickaxe' },
      },
      metadata: {} as any,
    });

    // solveCraftingGoal MUST be called (legacy/workbench path)
    expect(solver.solveCraftingGoal).toHaveBeenCalledTimes(1);
    // Steps should come from toTaskSteps (legacy mapping)
    expect(result.steps.length).toBe(1);
  });

  it('persists blocked_info into solver metadata on unresolved CRAFT', async () => {
    const solver = createMockCraftingSolver();
    planner.registerSolver(solver as any);

    const resolveIntentSteps: ResolveIntentStepsFn = vi.fn().mockResolvedValue({
      status: 'ok',
      replacements: [{
        intent_step_index: 0,
        resolved: false,
        unresolved_reason: 'no_solution',
        blocked_info: {
          frontier_items: ['oak_log'],
          nearby_blocks_gap: [],
          total_nodes_explored: 5,
        },
      }],
      plan_bundle_digest: '',
      schema_version: '1.1.0',
    });

    planner.setResolveIntentSteps(resolveIntentSteps);

    const taskData: any = {
      id: 'test-task',
      title: 'Craft wooden pickaxe',
      type: 'craft',
      parameters: {
        requirementCandidate: { kind: 'craft', outputPattern: 'wooden_pickaxe' },
      },
      metadata: {},
    };

    const result = await planner.generateDynamicSteps(taskData);

    // No steps (solver couldn't solve)
    expect(result.steps).toHaveLength(0);

    // blocked_info MUST be persisted into solver metadata
    const solverMeta = taskData.metadata?.solver;
    expect(solverMeta).toBeDefined();
    expect(solverMeta.resolvedVia).toBe('resolve_intent_steps');
    expect(solverMeta.unresolvedReason).toBe('no_solution');
    expect(solverMeta.blockedInfo).toEqual({
      frontier_items: ['oak_log'],
      nearby_blocks_gap: [],
      total_nodes_explored: 5,
    });
  });
});
