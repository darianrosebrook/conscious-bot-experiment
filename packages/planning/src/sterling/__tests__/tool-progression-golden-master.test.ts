/**
 * Golden-master tests for the Tool Progression solver.
 *
 * Locks external behavior (label format, payload shape, cap: filtering,
 * needsBlocks early-exit, tier detection) so regressions are caught.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MinecraftToolProgressionSolver } from '../minecraft-tool-progression-solver';
import type { ToolProgressionSolveResult } from '../minecraft-tool-progression-types';
import { CAP_PREFIX, TIER_GATE_MATRIX, TOOL_TIERS } from '../minecraft-tool-progression-types';
import {
  buildToolProgressionRules,
  detectCurrentTier,
  parseToolName,
  validateInventoryInput,
  filterCapTokens,
  filterCapTokenItems,
} from '../minecraft-tool-progression-rules';
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
// Rule Builder Tests
// ===========================================================================

describe('buildToolProgressionRules', () => {
  it('generates wood-only rules for wooden_pickaxe from no tier', () => {
    const { rules, missingBlocks } = buildToolProgressionRules(
      'wooden_pickaxe', 'pickaxe', null, 'wooden', []
    );

    expect(missingBlocks).toEqual([]);
    expect(rules.length).toBeGreaterThan(0);

    // Must include: mine oak_log, craft planks, craft sticks, craft crafting_table, place crafting_table, upgrade
    const actionIds = rules.map(r => r.action);
    expect(actionIds).toContain('tp:mine:oak_log');
    expect(actionIds).toContain('tp:craft:oak_planks');
    expect(actionIds).toContain('tp:craft:stick');
    expect(actionIds).toContain('tp:craft:crafting_table');
    expect(actionIds).toContain('place:crafting_table');
    expect(actionIds).toContain('tp:upgrade:wooden_pickaxe');

    // All actions have tp: prefix EXCEPT place: actions
    // (Sterling's apply_rule parses place action IDs via split(":", 1)
    // requiring 'place:<item>' format without tp: prefix)
    for (const rule of rules) {
      expect(rule.action).toMatch(/^(tp:|place:)/);
    }
  });

  it('generates stone upgrade rules with cap: gate on wooden pickaxe', () => {
    const { rules } = buildToolProgressionRules(
      'stone_pickaxe', 'pickaxe', 'wooden', 'stone', ['stone', 'cobblestone']
    );

    // Must include cobblestone mining gated by cap:has_wooden_pickaxe
    const mineRule = rules.find(r => r.action === 'tp:mine:cobblestone');
    expect(mineRule).toBeDefined();
    expect(mineRule!.requires).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: `${CAP_PREFIX}has_wooden_pickaxe` }),
      ])
    );
  });

  it('reports missing blocks when stone is not nearby for stone tier', () => {
    const { missingBlocks } = buildToolProgressionRules(
      'stone_pickaxe', 'pickaxe', 'wooden', 'stone', [] // empty nearbyBlocks
    );

    expect(missingBlocks).toContain('stone');
  });

  it('generates iron upgrade rules including smelting and furnace', () => {
    const { rules } = buildToolProgressionRules(
      'iron_pickaxe', 'pickaxe', 'stone', 'iron', ['iron_ore']
    );

    const actionIds = rules.map(r => r.action);
    expect(actionIds).toContain('tp:mine:iron_ore');
    expect(actionIds).toContain('tp:craft:furnace');
    expect(actionIds).toContain('place:furnace');
    expect(actionIds).toContain('tp:smelt:iron_ingot');
    expect(actionIds).toContain('tp:upgrade:iron_pickaxe');

    // Smelting requires furnace capability
    const smeltRule = rules.find(r => r.action === 'tp:smelt:iron_ingot');
    expect(smeltRule).toBeDefined();
    expect(smeltRule!.requires).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: `${CAP_PREFIX}has_furnace` }),
      ])
    );
    // Smelting consumes raw_iron and coal
    expect(smeltRule!.consumes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'raw_iron' }),
        expect.objectContaining({ name: 'coal' }),
      ])
    );
  });

  it('reports missing iron_ore when not in nearbyBlocks for iron tier', () => {
    const { missingBlocks } = buildToolProgressionRules(
      'iron_pickaxe', 'pickaxe', 'stone', 'iron', [] // no iron_ore nearby
    );

    expect(missingBlocks).toContain('iron_ore');
  });

  it('generates multi-tier rules from null to stone', () => {
    const { rules } = buildToolProgressionRules(
      'stone_pickaxe', 'pickaxe', null, 'stone', ['stone']
    );

    const actionIds = rules.map(r => r.action);
    // Must include wooden tier rules AND stone tier rules
    expect(actionIds).toContain('tp:mine:oak_log');
    expect(actionIds).toContain('tp:upgrade:wooden_pickaxe');
    expect(actionIds).toContain('tp:mine:cobblestone');
    expect(actionIds).toContain('tp:upgrade:stone_pickaxe');
  });

  it('upgrade rule produces cap: tokens for tier capabilities', () => {
    const { rules } = buildToolProgressionRules(
      'wooden_pickaxe', 'pickaxe', null, 'wooden', []
    );

    const upgradeRule = rules.find(r => r.action === 'tp:upgrade:wooden_pickaxe');
    expect(upgradeRule).toBeDefined();

    // Produces the tool item
    expect(upgradeRule!.produces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'wooden_pickaxe', count: 1 }),
      ])
    );

    // Produces capability tokens
    const capProduces = upgradeRule!.produces.filter(p => p.name.startsWith(CAP_PREFIX));
    expect(capProduces.length).toBeGreaterThan(0);
    expect(capProduces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: `${CAP_PREFIX}has_wooden_pickaxe` }),
      ])
    );

    // Includes can_mine capabilities from tier gate matrix
    for (const block of TIER_GATE_MATRIX.wooden) {
      expect(capProduces).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: `${CAP_PREFIX}can_mine_${block}` }),
        ])
      );
    }
  });
});

// ===========================================================================
// Tier Detection Tests
// ===========================================================================

describe('detectCurrentTier', () => {
  it('returns null for empty inventory', () => {
    expect(detectCurrentTier({})).toBeNull();
  });

  it('returns null for inventory with no pickaxe', () => {
    expect(detectCurrentTier({ oak_log: 5, cobblestone: 10 })).toBeNull();
  });

  it('returns wooden for wooden_pickaxe', () => {
    expect(detectCurrentTier({ wooden_pickaxe: 1 })).toBe('wooden');
  });

  it('returns best tier when multiple pickaxes present', () => {
    expect(detectCurrentTier({
      wooden_pickaxe: 1,
      stone_pickaxe: 1,
      iron_pickaxe: 1,
    })).toBe('iron');
  });

  it('returns diamond for diamond_pickaxe', () => {
    expect(detectCurrentTier({ diamond_pickaxe: 1 })).toBe('diamond');
  });

  it('ignores pickaxes with count 0', () => {
    expect(detectCurrentTier({ iron_pickaxe: 0, stone_pickaxe: 1 })).toBe('stone');
  });
});

// ===========================================================================
// parseToolName Tests
// ===========================================================================

describe('parseToolName', () => {
  it('parses iron_pickaxe correctly', () => {
    expect(parseToolName('iron_pickaxe')).toEqual({ tier: 'iron', toolType: 'pickaxe' });
  });

  it('parses wooden_axe correctly', () => {
    expect(parseToolName('wooden_axe')).toEqual({ tier: 'wooden', toolType: 'axe' });
  });

  it('parses diamond_sword correctly', () => {
    expect(parseToolName('diamond_sword')).toEqual({ tier: 'diamond', toolType: 'sword' });
  });

  it('returns null for unknown tool', () => {
    expect(parseToolName('netherite_pickaxe')).toBeNull();
  });

  it('returns null for non-tool item', () => {
    expect(parseToolName('oak_log')).toBeNull();
  });
});

// ===========================================================================
// Cap Token Guardrails
// ===========================================================================

describe('cap: token guardrails', () => {
  it('validateInventoryInput throws on cap: prefix keys', () => {
    expect(() =>
      validateInventoryInput({ 'cap:has_wooden_pickaxe': 1, oak_log: 3 })
    ).toThrow(/virtual capability token/);
  });

  it('validateInventoryInput accepts normal inventory', () => {
    expect(() =>
      validateInventoryInput({ wooden_pickaxe: 1, oak_log: 3 })
    ).not.toThrow();
  });

  it('filterCapTokens removes cap: keys', () => {
    const filtered = filterCapTokens({
      oak_log: 3,
      'cap:has_wooden_pickaxe': 1,
      cobblestone: 5,
      'cap:can_mine_stone': 1,
    });
    expect(filtered).toEqual({ oak_log: 3, cobblestone: 5 });
  });

  it('filterCapTokenItems removes cap: items', () => {
    const filtered = filterCapTokenItems([
      { name: 'wooden_pickaxe', count: 1 },
      { name: 'cap:has_wooden_pickaxe', count: 1 },
      { name: 'cap:can_mine_stone', count: 1 },
    ]);
    expect(filtered).toEqual([{ name: 'wooden_pickaxe', count: 1 }]);
  });
});

// ===========================================================================
// Solver Tests
// ===========================================================================

describe('MinecraftToolProgressionSolver', () => {
  let service: SterlingReasoningService;
  let solver: MinecraftToolProgressionSolver;

  beforeEach(() => {
    service = createMockService();
    solver = new MinecraftToolProgressionSolver(service);
  });

  // ---- Identity ----

  it('exposes correct solverId and sterlingDomain', () => {
    expect(solver.solverId).toBe('minecraft.tool_progression');
    expect(solver.sterlingDomain).toBe('minecraft');
    expect(solver.contractVersion).toBe(1);
  });

  // ---- Unavailable ----

  it('returns unavailable result when service is down', async () => {
    (service.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await solver.solveToolProgression('iron_pickaxe', {}, []);

    expect(result.solved).toBe(false);
    expect(result.error).toBe('Sterling reasoning service unavailable');
    expect(result.steps).toEqual([]);
  });

  // ---- Unknown tool ----

  it('returns error for unknown tool name', async () => {
    const result = await solver.solveToolProgression('netherite_pickaxe', {}, []);

    expect(result.solved).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });

  // ---- Already have target ----

  it('returns solved with empty steps when already at target tier', async () => {
    const result = await solver.solveToolProgression(
      'iron_pickaxe',
      { iron_pickaxe: 1 },
      []
    );

    expect(result.solved).toBe(true);
    expect(result.steps).toEqual([]);
    expect(result.targetTier).toBe('iron');
    expect(result.currentTier).toBe('iron');
    // Should not call Sterling at all
    expect(service.solve).not.toHaveBeenCalled();
  });

  it('returns solved when current tier is higher than target', async () => {
    const result = await solver.solveToolProgression(
      'stone_pickaxe',
      { diamond_pickaxe: 1 },
      []
    );

    expect(result.solved).toBe(true);
    expect(result.currentTier).toBe('diamond');
    expect(result.targetTier).toBe('stone');
  });

  // ---- needsBlocks early-exit ----

  it('returns needsBlocks when required blocks are not nearby', async () => {
    const result = await solver.solveToolProgression(
      'stone_pickaxe',
      { wooden_pickaxe: 1 },
      [] // no stone nearby
    );

    expect(result.solved).toBe(false);
    expect(result.needsBlocks).toBeDefined();
    expect(result.needsBlocks!.missingBlocks).toContain('stone');
    expect(result.needsBlocks!.blockedAtTier).toBe('stone');
    expect(result.needsBlocks!.currentTier).toBe('wooden');
    // Should not call Sterling — early exit before solve
    expect(service.solve).not.toHaveBeenCalled();
  });

  it('returns needsBlocks for iron_ore when missing', async () => {
    const result = await solver.solveToolProgression(
      'iron_pickaxe',
      { stone_pickaxe: 1 },
      ['stone'] // has stone but not iron_ore
    );

    expect(result.solved).toBe(false);
    expect(result.needsBlocks).toBeDefined();
    expect(result.needsBlocks!.missingBlocks).toContain('iron_ore');
    expect(result.needsBlocks!.blockedAtTier).toBe('iron');
  });

  // ---- planId from Sterling ----

  it('returns planId from Sterling metrics', async () => {
    (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      solutionFound: true,
      solutionPath: [],
      discoveredNodes: [],
      searchEdges: [],
      metrics: { planId: 'tp-plan-789' },
      durationMs: 30,
    });

    const result = await solver.solveToolProgression(
      'wooden_pickaxe',
      {},
      []
    );

    expect(result.planId).toBe('tp-plan-789');
  });

  // ---- solve call payload ----

  it('sends correct payload to Sterling with tp: prefixed rules', async () => {
    await solver.solveToolProgression(
      'wooden_pickaxe',
      {},
      []
    );

    expect(service.solve).toHaveBeenCalledTimes(1);
    const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('minecraft'); // sterlingDomain
    expect(call[1]).toMatchObject({
      command: 'solve',
      domain: 'minecraft',
      contractVersion: 1,
      executionMode: 'tool_progression',
      solverId: 'minecraft.tool_progression',
      maxNodes: 5000,
      useLearning: true,
    });

    // Rules should all have tp: or place: prefix
    const rules = call[1].rules as Array<{ action: string }>;
    for (const rule of rules) {
      expect(rule.action).toMatch(/^(tp:|place:)/);
    }

    // Goal should be the target tool
    expect(call[1].goal).toEqual({ wooden_pickaxe: 1 });
  });

  // ---- toTaskSteps label format ----

  it('toTaskSteps produces correct labels for mine+craft+upgrade steps', () => {
    const result: ToolProgressionSolveResult = {
      solved: true,
      steps: [
        {
          action: 'tp:mine:oak_log',
          actionType: 'mine',
          produces: [{ name: 'oak_log', count: 1 }],
          consumes: [],
          resultingInventory: { oak_log: 1 },
        },
        {
          action: 'tp:craft:oak_planks',
          actionType: 'craft',
          produces: [{ name: 'oak_planks', count: 4 }],
          consumes: [{ name: 'oak_log', count: 1 }],
          resultingInventory: { oak_planks: 4 },
        },
        {
          action: 'tp:craft:stick',
          actionType: 'craft',
          produces: [{ name: 'stick', count: 4 }],
          consumes: [{ name: 'oak_planks', count: 2 }],
          resultingInventory: { oak_planks: 2, stick: 4 },
        },
        {
          action: 'tp:upgrade:wooden_pickaxe',
          actionType: 'upgrade',
          produces: [{ name: 'wooden_pickaxe', count: 1 }],
          consumes: [{ name: 'oak_planks', count: 3 }, { name: 'stick', count: 2 }],
          resultingInventory: { wooden_pickaxe: 1 },
        },
      ],
      totalNodes: 20,
      durationMs: 50,
      targetTier: 'wooden',
      currentTier: null,
      targetTool: 'wooden_pickaxe',
    };

    const steps = solver.toTaskSteps(result);

    expect(steps).toHaveLength(4);
    expect(steps[0].label).toBe('Leaf: minecraft.dig_block (blockType=oak_log, count=1)');
    expect(steps[1].label).toBe('Leaf: minecraft.craft_recipe (recipe=oak_planks, qty=4)');
    expect(steps[2].label).toBe('Leaf: minecraft.craft_recipe (recipe=stick, qty=4)');
    expect(steps[3].label).toBe('Leaf: minecraft.craft_recipe (recipe=wooden_pickaxe, qty=1)');

    // Order is 1-based sequential
    expect(steps.map(s => s.order)).toEqual([1, 2, 3, 4]);
    // All start not done
    expect(steps.every(s => s.done === false)).toBe(true);
    // Meta includes domain
    expect(steps[0].meta).toMatchObject({
      domain: 'tool_progression',
      leaf: 'dig_block',
      targetTool: 'wooden_pickaxe',
    });
    // Duration estimates
    expect(steps[0].estimatedDuration).toBe(5000);  // mine
    expect(steps[1].estimatedDuration).toBe(2000);  // craft
    expect(steps[3].estimatedDuration).toBe(2000);  // upgrade (uses craft duration)
  });

  it('toTaskSteps produces correct labels for smelt and place steps', () => {
    const result: ToolProgressionSolveResult = {
      solved: true,
      steps: [
        {
          action: 'tp:place:furnace',
          actionType: 'place',
          produces: [],
          consumes: [{ name: 'furnace', count: 1 }],
          resultingInventory: {},
        },
        {
          action: 'tp:smelt:iron_ingot',
          actionType: 'smelt',
          produces: [{ name: 'iron_ingot', count: 1 }],
          consumes: [{ name: 'raw_iron', count: 1 }, { name: 'coal', count: 1 }],
          resultingInventory: { iron_ingot: 1 },
        },
      ],
      totalNodes: 15,
      durationMs: 40,
      targetTier: 'iron',
      currentTier: 'stone',
      targetTool: 'iron_pickaxe',
    };

    const steps = solver.toTaskSteps(result);

    expect(steps).toHaveLength(2);
    expect(steps[0].label).toBe('Leaf: minecraft.place_block (blockType=furnace)');
    expect(steps[1].label).toBe('Leaf: minecraft.smelt (item=iron_ingot)');
    expect(steps[0].estimatedDuration).toBe(1000);  // place
    expect(steps[1].estimatedDuration).toBe(15000); // smelt
  });

  it('toTaskSteps returns empty array for unsolved result', () => {
    const result: ToolProgressionSolveResult = {
      solved: false,
      steps: [],
      totalNodes: 0,
      durationMs: 0,
      error: 'No solution',
    };
    expect(solver.toTaskSteps(result)).toEqual([]);
  });

  // ---- Steps have no cap: tokens ----

  it('toTaskSteps contains no cap: tokens in labels or inventory', () => {
    const result: ToolProgressionSolveResult = {
      solved: true,
      steps: [
        {
          action: 'tp:upgrade:wooden_pickaxe',
          actionType: 'upgrade',
          // cap: tokens should already be filtered by mapSolutionToSteps,
          // but verify toTaskSteps doesn't leak them in labels
          produces: [{ name: 'wooden_pickaxe', count: 1 }],
          consumes: [{ name: 'oak_planks', count: 3 }, { name: 'stick', count: 2 }],
          resultingInventory: { wooden_pickaxe: 1 },
        },
      ],
      totalNodes: 5,
      durationMs: 10,
      targetTool: 'wooden_pickaxe',
    };

    const steps = solver.toTaskSteps(result);

    for (const step of steps) {
      expect(step.label).not.toContain('cap:');
    }
  });

  // ---- reportEpisodeResult ----

  it('reportEpisodeResult sends correct payload with planId', () => {
    solver.reportEpisodeResult(
      'iron_pickaxe', 'iron', 'wooden', true, 2, 'tp-plan-789'
    );

    expect(service.solve).toHaveBeenCalledTimes(1);
    const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('minecraft');
    expect(call[1]).toMatchObject({
      command: 'report_episode',
      domain: 'minecraft',
      contractVersion: 1,
      planId: 'tp-plan-789',
      targetTool: 'iron_pickaxe',
      targetTier: 'iron',
      currentTier: 'wooden',
      success: true,
      tiersCompleted: 2,
    });
  });

  it('reportEpisodeResult skips when planId is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    solver.reportEpisodeResult(
      'iron_pickaxe', 'iron', 'wooden', true, 2
    );

    expect(service.solve).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing planId')
    );

    warnSpy.mockRestore();
  });

  it('reportEpisodeResult includes failure info when provided', () => {
    solver.reportEpisodeResult(
      'iron_pickaxe', 'iron', 'wooden', false, 1,
      'tp-plan-789', 'stone', 'cobblestone not found'
    );

    const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toMatchObject({
      planId: 'tp-plan-789',
      success: false,
      tiersCompleted: 1,
      failedAtTier: 'stone',
      failureReason: 'cobblestone not found',
    });
  });

  // ===========================================================================
  // solveMeta evidence — proves bundle wiring runs on every solve path
  // ===========================================================================

  describe('solveMeta bundle attachment', () => {
    it('single-tier solved path attaches solveMeta with 1 bundle', async () => {
      // Mock a solved wooden_pickaxe result with a solutionPath
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [
          { source: 'S0', target: 'S1' },
          { source: 'S1', target: 'S2' },
        ],
        discoveredNodes: ['S0', 'S1', 'S2'],
        searchEdges: [
          { source: 'S0', target: 'S1', label: { action: 'tp:mine:oak_log' } },
          { source: 'S1', target: 'S2', label: { action: 'tp:upgrade:wooden_pickaxe' } },
        ],
        metrics: { planId: 'tp-plan-wood' },
        durationMs: 25,
      });

      const result = await solver.solveToolProgression('wooden_pickaxe', {}, []);

      expect(result.solved).toBe(true);
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(1);

      const bundle = result.solveMeta!.bundles[0];
      // Input
      expect(bundle.input.solverId).toBe('minecraft.tool_progression');
      expect(bundle.input.executionMode).toBe('tool_progression');
      expect(bundle.input.definitionHash).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.input.initialStateHash).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.input.goalHash).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.input.definitionCount).toBeGreaterThan(0);
      expect(bundle.input.tierMatrixVersion).toBe('1.20.0');

      // Output
      expect(bundle.output.solved).toBe(true);
      expect(bundle.output.planId).toBe('tp-plan-wood');
      expect(bundle.output.stepsDigest).toMatch(/^[0-9a-f]{16}$/);
      expect(bundle.output.searchStats.totalNodes).toBe(3);

      // Compat
      expect(bundle.compatReport.valid).toBe(true);
      expect(bundle.bundleId).toMatch(/^minecraft\.tool_progression:[0-9a-f]{16}$/);
    });

    it('unsolved path attaches solveMeta with solved=false', async () => {
      // Default mock returns solutionFound: false
      const result = await solver.solveToolProgression('wooden_pickaxe', {}, []);

      expect(result.solved).toBe(false);
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(1);

      const bundle = result.solveMeta!.bundles[0];
      expect(bundle.output.solved).toBe(false);
      expect(bundle.output.searchStats.solutionPathLength).toBe(0);
      expect(bundle.bundleId).toMatch(/^minecraft\.tool_progression:[0-9a-f]{16}$/);
    });

    it('multi-tier solve produces one bundle per tier', async () => {
      // Solve null -> stone = 2 tiers (wooden + stone)
      // Tier 1: wooden_pickaxe — solved
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [{ source: 'W0', target: 'W1' }],
        discoveredNodes: ['W0', 'W1'],
        searchEdges: [
          { source: 'W0', target: 'W1', label: { action: 'tp:upgrade:wooden_pickaxe' } },
        ],
        metrics: { planId: 'tp-plan-w' },
        durationMs: 10,
      });
      // Tier 2: stone_pickaxe — solved
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [{ source: 'S0', target: 'S1' }],
        discoveredNodes: ['S0', 'S1'],
        searchEdges: [
          { source: 'S0', target: 'S1', label: { action: 'tp:upgrade:stone_pickaxe' } },
        ],
        metrics: { planId: 'tp-plan-s' },
        durationMs: 15,
      });

      const result = await solver.solveToolProgression(
        'stone_pickaxe', {}, ['stone', 'cobblestone']
      );

      expect(result.solved).toBe(true);
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(2);

      // Each tier bundle has distinct goalHash
      const [b0, b1] = result.solveMeta!.bundles;
      expect(b0.input.goalHash).not.toBe(b1.input.goalHash);
      // Each has distinct stepsDigest (different actions)
      expect(b0.output.stepsDigest).not.toBe(b1.output.stepsDigest);
      // Both valid
      expect(b0.compatReport.valid).toBe(true);
      expect(b1.compatReport.valid).toBe(true);
    });

    it('needsBlocks early-exit includes previously accumulated bundles', async () => {
      // Tier 1 (wooden) solves, then tier 2 (stone) hits needsBlocks
      (service.solve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        solutionFound: true,
        solutionPath: [{ source: 'W0', target: 'W1' }],
        discoveredNodes: ['W0', 'W1'],
        searchEdges: [
          { source: 'W0', target: 'W1', label: { action: 'tp:upgrade:wooden_pickaxe' } },
        ],
        metrics: { planId: 'tp-plan-partial' },
        durationMs: 10,
      });

      // Stone needs blocks — no stone nearby
      const result = await solver.solveToolProgression(
        'stone_pickaxe', {}, [] // no stone blocks nearby
      );

      expect(result.solved).toBe(false);
      expect(result.needsBlocks).toBeDefined();
      // Bundle from the completed wooden tier should still be present
      expect(result.solveMeta).toBeDefined();
      expect(result.solveMeta!.bundles).toHaveLength(1);
      expect(result.solveMeta!.bundles[0].output.solved).toBe(true);
    });

    it('bundle IDs are deterministic for same inputs/outputs', async () => {
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

      const result1 = await solver.solveToolProgression('wooden_pickaxe', {}, []);
      const result2 = await solver.solveToolProgression('wooden_pickaxe', {}, []);

      expect(result1.solveMeta!.bundles[0].bundleHash)
        .toBe(result2.solveMeta!.bundles[0].bundleHash);
    });
  });

  // ===========================================================================
  // Payload-equivalence snapshot — proves outbound payload stability
  // ===========================================================================

  describe('outbound payload stability', () => {
    it('wooden_pickaxe solve payload matches canonical snapshot', async () => {
      await solver.solveToolProgression('wooden_pickaxe', {}, []);

      expect(service.solve).toHaveBeenCalledTimes(1);
      const call = (service.solve as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];

      // Capture the payload fields that Sterling sees
      const stablePayload = {
        command: payload.command,
        domain: payload.domain,
        contractVersion: payload.contractVersion,
        executionMode: payload.executionMode,
        tierMatrixVersion: payload.tierMatrixVersion,
        solverId: payload.solverId,
        inventory: payload.inventory,
        goal: payload.goal,
        nearbyBlocks: payload.nearbyBlocks,
        rules: payload.rules,
        maxNodes: payload.maxNodes,
        useLearning: payload.useLearning,
      };

      const snapshot = canonicalize(stablePayload);
      expect(snapshot).toMatchSnapshot();
    });
  });
});

// ===========================================================================
// Tier Gate Matrix Tests
// ===========================================================================

describe('TIER_GATE_MATRIX', () => {
  it('wooden tier unlocks stone and coal_ore', () => {
    expect(TIER_GATE_MATRIX.wooden).toContain('stone');
    expect(TIER_GATE_MATRIX.wooden).toContain('cobblestone');
    expect(TIER_GATE_MATRIX.wooden).toContain('coal_ore');
  });

  it('stone tier unlocks iron_ore and lapis_ore', () => {
    expect(TIER_GATE_MATRIX.stone).toContain('iron_ore');
    expect(TIER_GATE_MATRIX.stone).toContain('lapis_ore');
  });

  it('iron tier unlocks diamond_ore and gold_ore', () => {
    expect(TIER_GATE_MATRIX.iron).toContain('diamond_ore');
    expect(TIER_GATE_MATRIX.iron).toContain('gold_ore');
    expect(TIER_GATE_MATRIX.iron).toContain('redstone_ore');
    expect(TIER_GATE_MATRIX.iron).toContain('emerald_ore');
  });

  it('diamond tier unlocks obsidian and ancient_debris', () => {
    expect(TIER_GATE_MATRIX.diamond).toContain('obsidian');
    expect(TIER_GATE_MATRIX.diamond).toContain('ancient_debris');
  });

  it('all four tiers are present', () => {
    expect(Object.keys(TIER_GATE_MATRIX)).toEqual(
      expect.arrayContaining(['wooden', 'stone', 'iron', 'diamond'])
    );
  });

  it('TOOL_TIERS is ordered from lowest to highest', () => {
    expect(TOOL_TIERS).toEqual(['wooden', 'stone', 'iron', 'diamond']);
  });
});
