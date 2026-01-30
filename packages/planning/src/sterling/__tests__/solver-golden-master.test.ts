/**
 * Golden-master tests for crafting and building solvers.
 *
 * These lock the external behavior (label format, episode payload shape)
 * BEFORE the BaseDomainSolver extraction so any regression is caught.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MinecraftCraftingSolver } from '../minecraft-crafting-solver';
import { MinecraftBuildingSolver } from '../minecraft-building-solver';
import type { MinecraftCraftingSolveResult } from '../minecraft-crafting-types';
import type { BuildingSolveResult } from '../minecraft-building-types';
import type { SterlingReasoningService } from '../sterling-reasoning-service';
import { canonicalize } from '../solve-bundle';

// ---------------------------------------------------------------------------
// Mock SterlingReasoningService
// ---------------------------------------------------------------------------

function createMockService(overrides?: Partial<SterlingReasoningService>) {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    solve: vi.fn().mockResolvedValue({
      solutionFound: false,
      solutionPath: [],
      discoveredNodes: [],
      searchEdges: [],
      metrics: {},
      durationMs: 0,
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    getHealthStatus: vi.fn().mockReturnValue({ enabled: true }),
    verifyReachability: vi.fn(),
    queryKnowledgeGraph: vi.fn(),
    withFallback: vi.fn(),
    ...overrides,
  } as unknown as SterlingReasoningService;
}

// ===========================================================================
// Crafting Solver
// ===========================================================================

describe('MinecraftCraftingSolver — golden-master', () => {
  let service: SterlingReasoningService;
  let solver: MinecraftCraftingSolver;

  beforeEach(() => {
    service = createMockService();
    solver = new MinecraftCraftingSolver(service);
  });

  // ---- toTaskSteps label format ----

  it('toTaskSteps produces correct labels for a 3-step mine+craft+craft result', () => {
    const result: MinecraftCraftingSolveResult = {
      solved: true,
      steps: [
        {
          action: 'mine:oak_log',
          actionType: 'mine',
          produces: [{ name: 'oak_log', count: 3 }],
          consumes: [],
          resultingInventory: { oak_log: 3 },
        },
        {
          action: 'craft:oak_planks',
          actionType: 'craft',
          produces: [{ name: 'oak_planks', count: 4 }],
          consumes: [{ name: 'oak_log', count: 1 }],
          resultingInventory: { oak_log: 2, oak_planks: 4 },
        },
        {
          action: 'craft:stick',
          actionType: 'craft',
          produces: [{ name: 'stick', count: 4 }],
          consumes: [{ name: 'oak_planks', count: 2 }],
          resultingInventory: { oak_log: 2, oak_planks: 2, stick: 4 },
        },
      ],
      totalNodes: 42,
      durationMs: 100,
    };

    const steps = solver.toTaskSteps(result);

    expect(steps).toHaveLength(3);
    expect(steps[0].label).toBe(
      'Leaf: minecraft.dig_block (blockType=oak_log, count=3)'
    );
    expect(steps[1].label).toBe(
      'Leaf: minecraft.craft_recipe (recipe=oak_planks, qty=4)'
    );
    expect(steps[2].label).toBe(
      'Leaf: minecraft.craft_recipe (recipe=stick, qty=4)'
    );

    // Order is 1-based sequential
    expect(steps.map((s) => s.order)).toEqual([1, 2, 3]);
    // All start not done
    expect(steps.every((s) => s.done === false)).toBe(true);
    // Duration estimates
    expect(steps[0].estimatedDuration).toBe(5000); // mine
    expect(steps[1].estimatedDuration).toBe(2000); // craft
    expect(steps[2].estimatedDuration).toBe(2000); // craft
  });

  it('toTaskSteps returns empty array for unsolved result', () => {
    const result: MinecraftCraftingSolveResult = {
      solved: false,
      steps: [],
      totalNodes: 0,
      durationMs: 0,
      error: 'No solution',
    };
    expect(solver.toTaskSteps(result)).toEqual([]);
  });

  // ---- solveCraftingGoal returns planId ----

  it('solveCraftingGoal returns planId from Sterling metrics', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [],
      discoveredNodes: [],
      searchEdges: [],
      metrics: { planId: 'plan-abc-123' },
      durationMs: 50,
    });

    const mcData = { itemsByName: {}, recipes: {}, items: {} };
    const result = await solver.solveCraftingGoal('wooden_pickaxe', [], mcData, []);

    expect(result.planId).toBe('plan-abc-123');
  });

  // ---- reportEpisodeResult payload shape ----

  it('reportEpisodeResult sends correct payload with explicit planId', () => {
    solver.reportEpisodeResult('wooden_pickaxe', true, 3, 'plan-abc-123');

    expect(service.solve).toHaveBeenCalledTimes(1);

    const reportCall = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(reportCall[0]).toBe('minecraft');
    expect(reportCall[1]).toMatchObject({
      command: 'report_episode',
      domain: 'minecraft',
      planId: 'plan-abc-123',
      goal: 'wooden_pickaxe',
      success: true,
      stepsCompleted: 3,
    });
  });

  it('reportEpisodeResult skips when planId is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    solver.reportEpisodeResult('wooden_pickaxe', true, 3);

    // No solve call — report was skipped
    expect(service.solve).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing planId')
    );

    warnSpy.mockRestore();
  });

  // ---- unavailable result ----

  it('returns unavailable result when service is down', async () => {
    (service.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await solver.solveCraftingGoal('stick', [], {}, []);

    expect(result.solved).toBe(false);
    expect(result.error).toBe('Sterling reasoning service unavailable');
    expect(result.steps).toEqual([]);
  });

  // ===========================================================================
  // solveMeta evidence — proves bundle wiring runs on every solve path
  // ===========================================================================

  describe('solveMeta bundle attachment', () => {
    // Minimal mcData that generates at least one crafting rule for "stick"
    const mcData = {
      itemsByName: {
        stick: { id: 1, name: 'stick' },
        oak_planks: { id: 2, name: 'oak_planks' },
      },
      items: {
        1: { id: 1, name: 'stick' },
        2: { id: 2, name: 'oak_planks' },
      },
      recipes: {
        1: [
          {
            result: { id: 1, count: 4 },
            ingredients: [2, 2],
          },
        ],
      },
    };

    it('solved path attaches solveMeta with correct bundle shape', async () => {
      // Mock a solved result with a solutionPath edge so mapSolutionToSteps runs
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [{ source: 'A', target: 'B' }],
        discoveredNodes: ['A', 'B'],
        searchEdges: [{ source: 'A', target: 'B', label: { action: 'craft:stick' } }],
        metrics: { planId: 'plan-solved-1' },
        durationMs: 42,
      });

      const result = await solver.solveCraftingGoal('stick', [], mcData, []);

      expect(result.solved).toBe(true);
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(1);

      const bundle = result.solveMeta!.bundles[0];
      // Input hashes
      expect(bundle.input.solverId).toBe('minecraft.crafting');
      expect(bundle.input.definitionHash).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.input.initialStateHash).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.input.goalHash).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.input.definitionCount).toBeGreaterThan(0);

      // Output
      expect(bundle.output.solved).toBe(true);
      expect(bundle.output.planId).toBe('plan-solved-1');
      expect(bundle.output.stepsDigest).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.output.searchStats.totalNodes).toBe(2);
      expect(bundle.output.searchStats.durationMs).toBe(42);

      // Compat report
      expect(bundle.compatReport.valid).toBe(true);

      // Content-addressed bundleId
      expect(bundle.bundleId).toMatch(/^minecraft\.crafting:[0-9a-f]{16}$/);
    });

    it('unsolved path attaches solveMeta with solved=false', async () => {
      // Default mock returns solutionFound: false
      const result = await solver.solveCraftingGoal('stick', [], mcData, []);

      expect(result.solved).toBe(false);
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(1);

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.output.solved).toBe(false);
      expect(bundle.output.stepsDigest).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.output.searchStats.solutionPathLength).toBe(0);
      expect(bundle.compatReport.valid).toBe(true);
      expect(bundle.bundleId).toMatch(/^minecraft\.crafting:[0-9a-f]{16}$/);
    });

    it('bundle ID is deterministic for same inputs/outputs', async () => {
      const mockResponse = {
        solutionFound: false,
        solutionPath: [],
        discoveredNodes: [],
        searchEdges: [],
        metrics: {},
        durationMs: 0,
      };

      (service.solve as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce(mockResponse);

      const result1 = await solver.solveCraftingGoal('stick', [], mcData, []);
      const result2 = await solver.solveCraftingGoal('stick', [], mcData, []);

      expect(result1.solveMeta!.bundles[0].bundleHash)
        .toBe(result2.solveMeta!.bundles[0].bundleHash);
    });
  });

  // ===========================================================================
  // Payload-equivalence snapshot — proves outbound payload stability
  // ===========================================================================

  describe('outbound payload stability', () => {
    const mcData = {
      itemsByName: {
        stick: { id: 1, name: 'stick' },
        oak_planks: { id: 2, name: 'oak_planks' },
      },
      items: {
        1: { id: 1, name: 'stick' },
        2: { id: 2, name: 'oak_planks' },
      },
      recipes: {
        1: [
          {
            result: { id: 1, count: 4 },
            ingredients: [2, 2],
          },
        ],
      },
    };

    it('solve payload matches canonical snapshot', async () => {
      await solver.solveCraftingGoal('stick', [], mcData, ['oak_log']);

      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];

      // Capture the payload fields that Sterling sees
      const stablePayload = {
        contractVersion: payload.contractVersion,
        solverId: payload.solverId,
        inventory: payload.inventory,
        goal: payload.goal,
        nearbyBlocks: payload.nearbyBlocks,
        rules: payload.rules,
        maxNodes: payload.maxNodes,
        useLearning: payload.useLearning,
      };

      // Canonical snapshot — if this changes, the diff proves intentionality
      const snapshot = canonicalize(stablePayload);
      expect(snapshot).toMatchSnapshot();
    });
  });
});

// ===========================================================================
// Building Solver
// ===========================================================================

describe('MinecraftBuildingSolver — golden-master', () => {
  let service: SterlingReasoningService;
  let solver: MinecraftBuildingSolver;

  beforeEach(() => {
    service = createMockService();
    solver = new MinecraftBuildingSolver(service);
  });

  // ---- toTaskSteps label format ----

  it('toTaskSteps produces correct labels for a 3-step building result', () => {
    const result: BuildingSolveResult = {
      solved: true,
      steps: [
        {
          moduleId: 'site_prep_1',
          moduleType: 'prep_site',
          materialsNeeded: [],
          resultingProgress: 1,
          resultingInventory: {},
        },
        {
          moduleId: 'walls_1',
          moduleType: 'apply_module',
          materialsNeeded: [
            { name: 'cobblestone', count: 24 },
            { name: 'oak_log', count: 4 },
          ],
          resultingProgress: 2,
          resultingInventory: {},
        },
        {
          moduleId: 'door_1',
          moduleType: 'place_feature',
          materialsNeeded: [{ name: 'oak_door', count: 1 }],
          resultingProgress: 3,
          resultingInventory: {},
        },
      ],
      totalNodes: 10,
      durationMs: 30,
    };

    const steps = solver.toTaskSteps(result);

    expect(steps).toHaveLength(3);
    expect(steps[0].label).toBe(
      'Leaf: minecraft.prepare_site (module=site_prep_1)'
    );
    expect(steps[1].label).toBe(
      'Leaf: minecraft.build_module (module=walls_1, materials=cobblestonex24, oak_logx4)'
    );
    expect(steps[2].label).toBe(
      'Leaf: minecraft.place_feature (module=door_1)'
    );

    expect(steps.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(steps[0].estimatedDuration).toBe(10000); // prep_site
    expect(steps[1].estimatedDuration).toBe(20000); // apply_module
    expect(steps[2].estimatedDuration).toBe(5000); // place_feature
  });

  // ---- toTaskStepsWithReplan deficit path ----

  it('toTaskStepsWithReplan inserts acquisition steps + replan sentinel for deficit', () => {
    const result: BuildingSolveResult = {
      solved: false,
      steps: [],
      totalNodes: 5,
      durationMs: 20,
      needsMaterials: {
        deficit: { cobblestone: 12, oak_log: 2 },
        blockedModules: ['walls_1'],
        currentProgress: 0,
      },
    };

    const steps = solver.toTaskStepsWithReplan(result, 'basic_shelter_5x5__p0stub');

    // 2 acquisition steps + 1 replan sentinel
    expect(steps).toHaveLength(3);

    expect(steps[0].label).toBe(
      'Leaf: minecraft.acquire_material (item=cobblestone, count=12)'
    );
    expect(steps[0].meta).toMatchObject({
      domain: 'building',
      leaf: 'acquire_material',
      item: 'cobblestone',
      count: 12,
      templateId: 'basic_shelter_5x5__p0stub',
    });

    expect(steps[1].label).toBe(
      'Leaf: minecraft.acquire_material (item=oak_log, count=2)'
    );

    expect(steps[2].label).toBe(
      'Leaf: minecraft.replan_building (templateId=basic_shelter_5x5__p0stub)'
    );
    expect(steps[2].meta).toMatchObject({
      domain: 'building',
      leaf: 'replan_building',
      templateId: 'basic_shelter_5x5__p0stub',
    });

    expect(steps.map((s) => s.order)).toEqual([1, 2, 3]);
  });

  // ---- toTaskStepsWithReplan normal path ----

  it('toTaskStepsWithReplan produces building steps when solved', () => {
    const result: BuildingSolveResult = {
      solved: true,
      steps: [
        {
          moduleId: 'floor_1',
          moduleType: 'apply_module',
          materialsNeeded: [{ name: 'cobblestone', count: 25 }],
          resultingProgress: 1,
          resultingInventory: {},
        },
      ],
      totalNodes: 8,
      durationMs: 25,
    };

    const steps = solver.toTaskStepsWithReplan(result, 'basic_shelter_5x5');

    expect(steps).toHaveLength(1);
    expect(steps[0].label).toBe(
      'Leaf: minecraft.build_module (module=floor_1, materials=cobblestonex25)'
    );
    expect(steps[0].meta).toMatchObject({
      domain: 'building',
      leaf: 'build_module',
      moduleId: 'floor_1',
      moduleType: 'apply_module',
      templateId: 'basic_shelter_5x5',
    });
  });

  // ---- solveBuildingPlan returns planId ----

  it('solveBuildingPlan returns planId from Sterling metrics', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [],
      discoveredNodes: [],
      searchEdges: [],
      metrics: { planId: 'bld-plan-456', steps: [] },
      durationMs: 40,
    });

    const result = await solver.solveBuildingPlan(
      'basic_shelter_5x5',
      'N',
      ['walls_1'],
      { cobblestone: 50 },
      { terrain: 'flat', biome: 'plains', hasTreesNearby: true, hasWaterNearby: false, siteCaps: 'flat_5x5_clear' },
      [{ moduleId: 'walls_1', moduleType: 'apply_module', requiresModules: [], materialsNeeded: [], placementFeasible: true, baseCost: 1 }]
    );

    expect(result.planId).toBe('bld-plan-456');
  });

  // ---- reportEpisodeResult payload shape ----

  it('reportEpisodeResult sends correct payload with explicit planId', () => {
    solver.reportEpisodeResult(
      'basic_shelter_5x5',
      true,
      ['walls_1'],
      undefined,
      undefined,
      'bld-plan-456',
      true
    );

    expect(service.solve).toHaveBeenCalledTimes(1);

    const reportCall = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(reportCall[0]).toBe('building');
    expect(reportCall[1]).toMatchObject({
      command: 'report_episode',
      domain: 'building',
      contractVersion: 1,
      planId: 'bld-plan-456',
      templateId: 'basic_shelter_5x5',
      success: true,
      executedModuleIds: ['walls_1'],
      isStub: true,
    });
  });

  // ---- unavailable result ----

  it('returns unavailable result when service is down', async () => {
    (service.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await solver.solveBuildingPlan(
      'basic_shelter_5x5',
      'N',
      ['walls_1'],
      {},
      { terrain: 'flat', biome: 'plains', hasTreesNearby: false, hasWaterNearby: false, siteCaps: 'flat_5x5_clear' },
      [{ moduleId: 'walls_1', moduleType: 'apply_module', requiresModules: [], materialsNeeded: [], placementFeasible: true, baseCost: 1 }]
    );

    expect(result.solved).toBe(false);
    expect(result.error).toBe('Sterling reasoning service unavailable');
    expect(result.steps).toEqual([]);
  });

  // ===========================================================================
  // solveMeta evidence — proves bundle wiring runs on every solve path
  // ===========================================================================

  describe('solveMeta bundle attachment', () => {
    const modules = [
      { moduleId: 'walls_1', moduleType: 'apply_module' as const, requiresModules: [], materialsNeeded: [{ name: 'cobblestone', count: 24 }], placementFeasible: true, baseCost: 1 },
    ];
    const siteState = { terrain: 'flat' as const, biome: 'plains', hasTreesNearby: false, hasWaterNearby: false, siteCaps: 'flat_5x5_clear' };

    it('solved path attaches solveMeta with correct bundle shape', async () => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [{ source: 'S0', target: 'S1' }],
        discoveredNodes: ['S0', 'S1'],
        searchEdges: [],
        metrics: {
          planId: 'bld-plan-solved',
          steps: [{ moduleId: 'walls_1', moduleType: 'apply_module', materialsNeeded: [{ name: 'cobblestone', count: 24 }], resultingProgress: 1, resultingInventory: {} }],
        },
        durationMs: 30,
      });

      const result = await solver.solveBuildingPlan(
        'basic_shelter_5x5', 'N', ['walls_1'], { cobblestone: 50 }, siteState, modules
      );

      expect(result.solved).toBe(true);
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(1);

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.input.solverId).toBe('minecraft.building');
      expect(bundle.input.definitionHash).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.input.definitionCount).toBe(1);
      expect(bundle.output.solved).toBe(true);
      expect(bundle.output.planId).toBe('bld-plan-solved');
      expect(bundle.compatReport.valid).toBe(true);
      expect(bundle.compatReport.definitionCount).toBe(1);
      // Building uses modules, not rules — ruleCount should be module count
      expect(bundle.compatReport.issues).toEqual([]);
      expect(bundle.bundleId).toMatch(/^minecraft\.building:[0-9a-f]{16}$/);
    });

    it('unsolved path attaches solveMeta with solved=false', async () => {
      // Default mock returns solutionFound: false
      const result = await solver.solveBuildingPlan(
        'basic_shelter_5x5', 'N', ['walls_1'], {}, siteState, modules
      );

      expect(result.solved).toBe(false);
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(1);

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.output.solved).toBe(false);
      expect(bundle.output.searchStats.solutionPathLength).toBe(0);
      expect(bundle.bundleId).toMatch(/^minecraft\.building:[0-9a-f]{16}$/);
    });

    it('needsMaterials path attaches solveMeta with solved=false', async () => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: false,
        solutionPath: [],
        discoveredNodes: ['S0'],
        searchEdges: [],
        metrics: {
          planId: 'bld-plan-deficit',
          needsMaterials: { deficit: { cobblestone: 12 }, blockedModules: ['walls_1'], currentProgress: 0 },
        },
        durationMs: 10,
      });

      const result = await solver.solveBuildingPlan(
        'basic_shelter_5x5', 'N', ['walls_1'], {}, siteState, modules
      );

      expect(result.solved).toBe(false);
      expect(result.needsMaterials).toBeDefined();
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(1);

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.output.solved).toBe(false);
      expect(bundle.bundleId).toMatch(/^minecraft\.building:[0-9a-f]{16}$/);
    });
  });

  // ===========================================================================
  // Payload-equivalence snapshot — proves outbound payload stability
  // ===========================================================================

  describe('outbound payload stability', () => {
    it('solve payload matches canonical snapshot', async () => {
      const modules = [
        { moduleId: 'walls_1', moduleType: 'apply_module' as const, requiresModules: [], materialsNeeded: [], placementFeasible: true, baseCost: 1 },
      ];
      const siteState = { terrain: 'flat' as const, biome: 'plains', hasTreesNearby: false, hasWaterNearby: false, siteCaps: 'flat_5x5_clear' };

      await solver.solveBuildingPlan(
        'basic_shelter_5x5', 'N', ['walls_1'], { cobblestone: 50 }, siteState, modules
      );

      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];

      // Capture the payload fields that Sterling sees.
      // NOTE: command and domain are excluded — SterlingClient injects those.
      const stablePayload = {
        contractVersion: payload.contractVersion,
        templateId: payload.templateId,
        facing: payload.facing,
        goalModules: payload.goalModules,
        inventory: payload.inventory,
        siteState: payload.siteState,
        modules: payload.modules,
        maxNodes: payload.maxNodes,
        useLearning: payload.useLearning,
      };

      const snapshot = canonicalize(stablePayload);
      expect(snapshot).toMatchSnapshot();
    });
  });
});
