/**
 * Dependency-Chain Contract Test
 *
 * Pins the invariant: for any step `craft_recipe(X)` in a solve result,
 * all of X's input materials must either be in the starting inventory
 * or produced by a prior step in the sequence.
 *
 * This is the root-cause test for "craft pickaxe as step 1" loops —
 * if the solver ever returns a craft step before its prerequisites,
 * these tests fail.
 *
 * Uses mocked Sterling responses (same pattern as tool-progression-golden-master.test.ts).
 * Does NOT require a live Sterling backend.
 *
 * Run with: npx vitest run packages/planning/src/sterling/__tests__/dependency-chain-contract.test.ts
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MinecraftToolProgressionSolver } from '../minecraft-tool-progression-solver';
import {
  buildToolProgressionRules,
  filterCapTokens,
} from '../minecraft-tool-progression-rules';
import type { ToolProgressionStep } from '../minecraft-tool-progression-types';
import type { SterlingReasoningService } from '../sterling-reasoning-service';

// ---------------------------------------------------------------------------
// Mock Sterling service
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
    getConnectionNonce: vi.fn().mockReturnValue(1),
    registerDomainDeclaration: vi.fn().mockResolvedValue({ success: true }),
    initialize: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    getHealthStatus: vi.fn().mockReturnValue({ enabled: true }),
    verifyReachability: vi.fn(),
    queryKnowledgeGraph: vi.fn(),
    withFallback: vi.fn(),
    ...overrides,
  } as unknown as SterlingReasoningService;
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/**
 * Core invariant checker: walk the step sequence maintaining a running
 * inventory, and assert that every consume/require is satisfiable.
 *
 * Uses the rule set to look up requires/consumes/produces for each step.
 */
function assertDependencyChainValid(
  steps: ToolProgressionStep[],
  startingInventory: Record<string, number>,
  rules: ReturnType<typeof buildToolProgressionRules>['rules'],
  label: string,
): void {
  const rulesByAction = new Map<string, (typeof rules)[number]>();
  for (const rule of rules) {
    rulesByAction.set(rule.action, rule);
  }

  const inventory: Record<string, number> = { ...startingInventory };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const rule = rulesByAction.get(step.action);
    if (!rule) continue; // degraded steps are covered by other tests

    // Check requires (capability gates)
    for (const req of rule.requires) {
      const have = inventory[req.name] ?? 0;
      expect(
        have,
        `[${label}] Step ${i} '${step.action}' requires '${req.name}' x${req.count} but inventory has ${have}`,
      ).toBeGreaterThanOrEqual(req.count);
    }

    // Check consumes (material inputs)
    for (const consumed of rule.consumes) {
      const have = inventory[consumed.name] ?? 0;
      expect(
        have,
        `[${label}] Step ${i} '${step.action}' consumes '${consumed.name}' x${consumed.count} but inventory has ${have}`,
      ).toBeGreaterThanOrEqual(consumed.count);
    }

    // Apply: consume
    for (const consumed of rule.consumes) {
      inventory[consumed.name] = (inventory[consumed.name] ?? 0) - consumed.count;
    }

    // Apply: produce
    for (const produced of rule.produces) {
      inventory[produced.name] = (inventory[produced.name] ?? 0) + produced.count;
    }
  }
}

/**
 * Assert that a specific action appears before another in the step list.
 */
function assertStepOrder(
  steps: ToolProgressionStep[],
  beforeAction: string,
  afterAction: string,
  label: string,
): void {
  const beforeIdx = steps.findIndex((s) => s.action === beforeAction);
  const afterIdx = steps.findIndex((s) => s.action === afterAction);

  expect(
    beforeIdx,
    `[${label}] Expected '${beforeAction}' to appear in steps`,
  ).toBeGreaterThanOrEqual(0);
  expect(
    afterIdx,
    `[${label}] Expected '${afterAction}' to appear in steps`,
  ).toBeGreaterThanOrEqual(0);
  expect(
    beforeIdx,
    `[${label}] '${beforeAction}' (idx=${beforeIdx}) must come before '${afterAction}' (idx=${afterIdx})`,
  ).toBeLessThan(afterIdx);
}

// ---------------------------------------------------------------------------
// Realistic Sterling response builders
// ---------------------------------------------------------------------------

/**
 * Build a realistic Sterling solve response for wooden_pickaxe from empty inventory.
 * The path mirrors what Sterling's A* search produces: mine → craft chain → upgrade.
 */
function makeWoodenPickaxeSolveResponse() {
  return {
    solutionFound: true,
    solutionPath: [
      { source: 'S0', target: 'S1' },
      { source: 'S1', target: 'S2' },
      { source: 'S2', target: 'S3' },
      { source: 'S3', target: 'S4' },
      { source: 'S4', target: 'S5' },
      { source: 'S5', target: 'S6' },
      { source: 'S6', target: 'S7' },
      { source: 'S7', target: 'S8' },
    ],
    discoveredNodes: ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
    searchEdges: [
      { source: 'S0', target: 'S1', label: { action: 'tp:mine:oak_log' } },
      { source: 'S1', target: 'S2', label: { action: 'tp:craft:oak_planks' } },
      { source: 'S2', target: 'S3', label: { action: 'tp:craft:oak_planks' } },
      { source: 'S3', target: 'S4', label: { action: 'tp:craft:oak_planks' } },
      { source: 'S4', target: 'S5', label: { action: 'tp:craft:stick' } },
      { source: 'S5', target: 'S6', label: { action: 'tp:craft:crafting_table' } },
      { source: 'S6', target: 'S7', label: { action: 'place:crafting_table' } },
      { source: 'S7', target: 'S8', label: { action: 'tp:upgrade:wooden_pickaxe' } },
    ],
    metrics: { planId: 'tp-contract-wooden' },
    durationMs: 25,
  };
}

/**
 * Build a Sterling solve response for stone_pickaxe tier (assumes wooden tier complete).
 */
function makeStonePickaxeTierResponse() {
  return {
    solutionFound: true,
    solutionPath: [
      { source: 'T0', target: 'T1' },
      { source: 'T1', target: 'T2' },
      { source: 'T2', target: 'T3' },
      { source: 'T3', target: 'T4' },
    ],
    discoveredNodes: ['T0', 'T1', 'T2', 'T3', 'T4'],
    searchEdges: [
      { source: 'T0', target: 'T1', label: { action: 'tp:mine:cobblestone' } },
      { source: 'T1', target: 'T2', label: { action: 'tp:craft:stick' } },
      { source: 'T2', target: 'T3', label: { action: 'place:crafting_table' } },
      { source: 'T3', target: 'T4', label: { action: 'tp:upgrade:stone_pickaxe' } },
    ],
    metrics: { planId: 'tp-contract-stone' },
    durationMs: 15,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Dependency-Chain Contract', () => {
  let service: SterlingReasoningService;
  let solver: MinecraftToolProgressionSolver;

  beforeEach(() => {
    service = createMockService();
    solver = new MinecraftToolProgressionSolver(service);
  });

  // ── wooden_pickaxe, empty inventory ──

  describe('wooden_pickaxe from empty inventory', () => {
    it('mine oak_log appears before any craft step', async () => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeWoodenPickaxeSolveResponse(),
      );

      const result = await solver.solveToolProgression('wooden_pickaxe', {}, []);

      expect(result.solved).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);

      // Mine must come before crafts
      assertStepOrder(result.steps, 'tp:mine:oak_log', 'tp:craft:oak_planks', 'wooden/empty');
      assertStepOrder(result.steps, 'tp:craft:oak_planks', 'tp:craft:stick', 'wooden/empty');
      assertStepOrder(result.steps, 'tp:craft:stick', 'tp:upgrade:wooden_pickaxe', 'wooden/empty');
    });

    it('full dependency chain is satisfiable from empty inventory', async () => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeWoodenPickaxeSolveResponse(),
      );

      const result = await solver.solveToolProgression('wooden_pickaxe', {}, []);
      expect(result.solved).toBe(true);

      const { rules } = buildToolProgressionRules('wooden_pickaxe', 'pickaxe', null, 'wooden', []);

      // Walk the chain from empty inventory — must never violate dependencies
      assertDependencyChainValid(result.steps, {}, rules, 'wooden/empty');
    });

    it('final inventory contains wooden_pickaxe', async () => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeWoodenPickaxeSolveResponse(),
      );

      const result = await solver.solveToolProgression('wooden_pickaxe', {}, []);
      expect(result.solved).toBe(true);

      // The last step's resulting inventory (minus cap: tokens) should contain the pickaxe
      const lastStep = result.steps[result.steps.length - 1];
      const finalInv = filterCapTokens(lastStep.resultingInventory);
      expect(finalInv['wooden_pickaxe']).toBeGreaterThanOrEqual(1);
    });
  });

  // ── wooden_pickaxe, already has materials ──

  describe('wooden_pickaxe with oak_planks + sticks in inventory', () => {
    it('skips already-owned tier (returns solved with empty steps)', async () => {
      // If inventory already has wooden_pickaxe, solver short-circuits
      const result = await solver.solveToolProgression(
        'wooden_pickaxe',
        { wooden_pickaxe: 1 },
        [],
      );

      expect(result.solved).toBe(true);
      expect(result.steps).toEqual([]);
      expect(service.solve).not.toHaveBeenCalled();
    });
  });

  // ── stone_pickaxe, empty inventory ──

  describe('stone_pickaxe from empty inventory', () => {
    it('wooden tier steps appear before stone tier steps', async () => {
      // Multi-tier solve: wooden first, then stone
      (service.solve as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(makeWoodenPickaxeSolveResponse())
        .mockResolvedValueOnce(makeStonePickaxeTierResponse());

      const result = await solver.solveToolProgression(
        'stone_pickaxe',
        {},
        ['stone', 'cobblestone'],
      );

      expect(result.solved).toBe(true);

      // Find indices of key steps
      const woodenUpgradeIdx = result.steps.findIndex(
        (s) => s.action === 'tp:upgrade:wooden_pickaxe',
      );
      const cobbleMineIdx = result.steps.findIndex(
        (s) => s.action === 'tp:mine:cobblestone',
      );
      const stoneUpgradeIdx = result.steps.findIndex(
        (s) => s.action === 'tp:upgrade:stone_pickaxe',
      );

      expect(woodenUpgradeIdx).toBeGreaterThanOrEqual(0);
      expect(cobbleMineIdx).toBeGreaterThanOrEqual(0);
      expect(stoneUpgradeIdx).toBeGreaterThanOrEqual(0);

      // Wooden upgrade must come before cobblestone mining (need wooden pickaxe)
      expect(
        woodenUpgradeIdx,
        'wooden_pickaxe upgrade must precede cobblestone mining',
      ).toBeLessThan(cobbleMineIdx);

      // Cobblestone mining must come before stone upgrade
      expect(
        cobbleMineIdx,
        'cobblestone mining must precede stone_pickaxe upgrade',
      ).toBeLessThan(stoneUpgradeIdx);
    });

    it('full dependency chain is satisfiable across both tiers', async () => {
      (service.solve as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(makeWoodenPickaxeSolveResponse())
        .mockResolvedValueOnce(makeStonePickaxeTierResponse());

      const result = await solver.solveToolProgression(
        'stone_pickaxe',
        {},
        ['stone', 'cobblestone'],
      );

      expect(result.solved).toBe(true);

      // Build combined rules for both tiers
      const { rules: woodRules } = buildToolProgressionRules(
        'wooden_pickaxe', 'pickaxe', null, 'wooden', [],
      );
      const { rules: stoneRules } = buildToolProgressionRules(
        'stone_pickaxe', 'pickaxe', 'wooden', 'stone', ['stone', 'cobblestone'],
      );
      const allRules = [...woodRules, ...stoneRules];

      // Walk from empty inventory across both tiers
      assertDependencyChainValid(result.steps, {}, allRules, 'stone/empty');
    });
  });

  // ── stone_pickaxe, no stone blocks observed → needsBlocks ──

  describe('stone_pickaxe with no observed blocks', () => {
    it('reports needsBlocks when stone is not nearby', async () => {
      // Wooden tier solves fine, but stone tier hits missing blocks
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeWoodenPickaxeSolveResponse(),
      );

      const result = await solver.solveToolProgression(
        'stone_pickaxe',
        {},
        [], // no blocks observed
      );

      expect(result.solved).toBe(false);
      expect(result.needsBlocks).toBeDefined();
      expect(result.needsBlocks!.missingBlocks).toContain('stone');
      expect(result.needsBlocks!.blockedAtTier).toBe('stone');
    });
  });

  // ── craft_recipe never appears before prerequisites (general invariant) ──

  describe('general prerequisite invariant', () => {
    it('no upgrade step appears before its material production steps', async () => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeWoodenPickaxeSolveResponse(),
      );

      const result = await solver.solveToolProgression('wooden_pickaxe', {}, []);
      expect(result.solved).toBe(true);

      // Build rule lookup for consumes
      const { rules } = buildToolProgressionRules(
        'wooden_pickaxe', 'pickaxe', null, 'wooden', [],
      );
      const rulesByAction = new Map(rules.map((r) => [r.action, r]));

      // For every step, verify its consumed materials are available
      const produced = new Set<string>();
      for (const step of result.steps) {
        const rule = rulesByAction.get(step.action);
        if (!rule) continue;

        // Every consumed material must have been produced by a prior step
        // (starting inventory is empty for this test case)
        for (const consumed of rule.consumes) {
          expect(
            produced.has(consumed.name),
            `Step '${step.action}' consumes '${consumed.name}' but it hasn't been produced yet. ` +
              `Produced so far: [${[...produced].join(', ')}]`,
          ).toBe(true);
        }

        // Record what this step produces
        for (const p of rule.produces) {
          produced.add(p.name);
        }
      }
    });

    it('upgrade step is always last in a single-tier solve', async () => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeWoodenPickaxeSolveResponse(),
      );

      const result = await solver.solveToolProgression('wooden_pickaxe', {}, []);
      expect(result.solved).toBe(true);

      const lastStep = result.steps[result.steps.length - 1];
      expect(lastStep.action).toBe('tp:upgrade:wooden_pickaxe');
      expect(lastStep.actionType).toBe('upgrade');
    });
  });

  // ── toTaskSteps preserves dependency order ──

  describe('toTaskSteps preserves dependency order', () => {
    it('task steps maintain prerequisite ordering for executor dispatch', async () => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeWoodenPickaxeSolveResponse(),
      );

      const result = await solver.solveToolProgression('wooden_pickaxe', {}, []);
      expect(result.solved).toBe(true);

      const taskSteps = solver.toTaskSteps(result);
      expect(taskSteps.length).toBeGreaterThan(0);

      // Task step order must match solve step order
      expect(taskSteps[0].order).toBe(1);
      expect(taskSteps[taskSteps.length - 1].order).toBe(taskSteps.length);

      // First task step should be acquire_material (mine oak_log)
      expect(taskSteps[0].meta?.leaf).toBe('acquire_material');

      // Last task step should be craft_recipe (the pickaxe upgrade)
      const lastMeta = taskSteps[taskSteps.length - 1].meta;
      expect(lastMeta?.leaf).toBe('craft_recipe');
      expect((lastMeta?.args as any)?.recipe).toBe('wooden_pickaxe');
    });

    it('task steps have sequential order numbers (no gaps)', async () => {
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeWoodenPickaxeSolveResponse(),
      );

      const result = await solver.solveToolProgression('wooden_pickaxe', {}, []);
      const taskSteps = solver.toTaskSteps(result);

      const orders = taskSteps.map((s) => s.order);
      const expected = taskSteps.map((_, i) => i + 1);
      expect(orders).toEqual(expected);
    });
  });
});
