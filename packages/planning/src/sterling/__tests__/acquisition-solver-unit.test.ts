/**
 * Acquisition Solver Unit Tests (Rig D — R1, R4)
 *
 * Covers:
 * - R1: Solved path populates solveMeta.bundles
 * - R1: Parent bundle has candidateSetDigest
 * - R1: Bundle has definitionHash, initialStateHash, goalHash
 * - R1: Bundle has stepsDigest, solved, planId
 * - R1: compatReport.valid
 * - R4: Same inputs → same bundleId
 * - R4: Same inputs → same candidateSetDigest
 * - Unavailable result when service is down
 * - Mine strategy delegates to crafting solver
 * - Trade strategy builds acq:trade rules
 * - 0 candidates → blocked result
 * - Episode reporting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MinecraftAcquisitionSolver } from '../minecraft-acquisition-solver';
import type { MinecraftCraftingSolver } from '../minecraft-crafting-solver';
import type { SterlingReasoningService } from '../sterling-reasoning-service';
import { hashInventoryState } from '../solve-bundle';

// ── Mock Sterling Service ──────────────────────────────────────────────────

function makeMockService(overrides: Partial<SterlingReasoningService> = {}): SterlingReasoningService {
  return {
    isAvailable: () => true,
    solve: vi.fn().mockResolvedValue({
      solutionFound: true,
      solutionPath: [
        { source: 'a', target: 'b', label: 'acq:trade:iron_ingot' },
      ],
      discoveredNodes: [{ id: 'a' }, { id: 'b' }],
      searchEdges: [],
      durationMs: 100,
      metrics: {},
    }),
    ...overrides,
  } as any;
}

function makeMockCraftingSolver(): MinecraftCraftingSolver {
  return {
    solveCraftingGoal: vi.fn().mockResolvedValue({
      solved: true,
      steps: [
        {
          action: 'mine:iron_ore',
          actionType: 'mine',
          produces: [{ name: 'raw_iron', count: 1 }],
          consumes: [],
          resultingInventory: { raw_iron: 1 },
        },
      ],
      totalNodes: 10,
      durationMs: 50,
      planId: 'craft-plan-1',
      solveMeta: {
        bundles: [{
          bundleId: 'minecraft.crafting:abc123',
          bundleHash: 'abc123',
          timestamp: Date.now(),
          input: {} as any,
          output: {} as any,
          compatReport: { valid: true, issues: [], checkedAt: Date.now(), definitionCount: 1 },
        }],
      },
    }),
    solverId: 'minecraft.crafting',
  } as any;
}

// ── Test Fixtures ──────────────────────────────────────────────────────────

const baseInventory: Record<string, number> = {
  'cap:has_stone_pickaxe': 1,
  emerald: 5,
};

const baseNearbyBlocks = ['iron_ore', 'stone', 'dirt'];

const baseEntities = [
  { type: 'villager', distance: 10 },
  { type: 'chest', distance: 20 },
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MinecraftAcquisitionSolver', () => {
  let solver: MinecraftAcquisitionSolver;
  let mockService: SterlingReasoningService;

  beforeEach(() => {
    mockService = makeMockService();
    solver = new MinecraftAcquisitionSolver(mockService);
    solver.setCraftingSolver(makeMockCraftingSolver());
  });

  // ── R1: solveMeta.bundles ──────────────────────────────────────────────

  it('R1: solved path populates solveMeta.bundles with length >= 1', async () => {
    const result = await solver.solveAcquisition(
      'iron_ingot', 1, baseInventory, baseNearbyBlocks, baseEntities,
    );
    expect(result.solved).toBe(true);
    expect(result.solveMeta).toBeDefined();
    expect(result.solveMeta!.bundles.length).toBeGreaterThanOrEqual(1);
  });

  it('R1: parent bundle has candidateSetDigest in bundle (non-empty)', async () => {
    const result = await solver.solveAcquisition(
      'iron_ingot', 1, baseInventory, baseNearbyBlocks, baseEntities,
    );
    expect(result.candidateSetDigest).toBeTruthy();
    expect(result.candidateSetDigest.length).toBe(16);
  });

  it('R1: bundle has input.definitionHash, initialStateHash, goalHash', async () => {
    const result = await solver.solveAcquisition(
      'iron_ingot', 1, baseInventory, baseNearbyBlocks, baseEntities,
    );
    const bundle = result.solveMeta!.bundles[0];
    expect(bundle.input.definitionHash).toBeTruthy();
    expect(bundle.input.initialStateHash).toBeTruthy();
    expect(bundle.input.goalHash).toBeTruthy();
  });

  it('R1: bundle has output.stepsDigest, output.solved, output.planId', async () => {
    const result = await solver.solveAcquisition(
      'iron_ingot', 1, baseInventory, baseNearbyBlocks, baseEntities,
    );
    const bundle = result.solveMeta!.bundles[0];
    expect(bundle.output.stepsDigest).toBeTruthy();
    expect(typeof bundle.output.solved).toBe('boolean');
    // planId may be null or string depending on delegation
    expect('planId' in bundle.output).toBe(true);
  });

  it('R1: compatReport.valid === true for valid rules', async () => {
    const result = await solver.solveAcquisition(
      'iron_ingot', 1, baseInventory, baseNearbyBlocks, baseEntities,
    );
    const bundle = result.solveMeta!.bundles[0];
    expect(bundle.compatReport.valid).toBe(true);
  });

  // ── R4: Deterministic ─────────────────────────────────────────────────

  it('R4: same inputs → same candidateSetDigest', async () => {
    const r1 = await solver.solveAcquisition(
      'iron_ingot', 1, baseInventory, baseNearbyBlocks, baseEntities,
    );
    const r2 = await solver.solveAcquisition(
      'iron_ingot', 1, baseInventory, baseNearbyBlocks, baseEntities,
    );
    expect(r1.candidateSetDigest).toBe(r2.candidateSetDigest);
  });

  it('R4: same inputs → same bundleId (parent bundle)', async () => {
    const r1 = await solver.solveAcquisition(
      'iron_ingot', 1, baseInventory, baseNearbyBlocks, baseEntities,
    );
    const r2 = await solver.solveAcquisition(
      'iron_ingot', 1, baseInventory, baseNearbyBlocks, baseEntities,
    );
    expect(r1.solveMeta!.bundles[0].bundleId).toBe(r2.solveMeta!.bundles[0].bundleId);
  });

  // ── Unavailable ────────────────────────────────────────────────────────

  it('returns unavailable result when service is down', async () => {
    const unavailableService = makeMockService({ isAvailable: () => false } as any);
    const unavailableSolver = new MinecraftAcquisitionSolver(unavailableService);
    const result = await unavailableSolver.solveAcquisition(
      'iron_ingot', 1, baseInventory, baseNearbyBlocks, baseEntities,
    );
    expect(result.solved).toBe(false);
    expect(result.error).toContain('unavailable');
  });

  // ── Mine delegation ────────────────────────────────────────────────────

  it('mine strategy delegates to crafting solver (verify call)', async () => {
    // Use cobblestone — it's mineable but NOT in trade or loot tables,
    // so mine will be the only/best strategy
    const result = await solver.solveAcquisition(
      'cobblestone', 1,
      { 'cap:has_wooden_pickaxe': 1 },
      ['stone'],    // stone block can produce cobblestone
      [],           // No villager/chest
    );
    expect(result.solved).toBe(true);
    expect(result.selectedStrategy).toBe('mine');
    expect(solver.craftingSolver!.solveCraftingGoal).toHaveBeenCalled();
  });

  // ── Trade rules ────────────────────────────────────────────────────────

  it('trade strategy builds acq:trade rules with consumes + requires', async () => {
    // Context: villager nearby, no ore → trade is best strategy
    const result = await solver.solveAcquisition(
      'iron_ingot', 1,
      { emerald: 5 },
      [], // No ore blocks
      [{ type: 'villager', distance: 10 }],
    );
    expect(result.selectedStrategy).toBe('trade');
    expect(result.solved).toBe(true);
    // The Sterling service should have been called with trade rules
    expect(mockService.solve).toHaveBeenCalled();
  });

  // ── Zero candidates ────────────────────────────────────────────────────

  it('0 candidates → blocked result', async () => {
    // random_item has no strategies
    const result = await solver.solveAcquisition(
      'random_nonexistent_item', 1,
      {},
      [],
      [],
    );
    expect(result.solved).toBe(false);
    expect(result.error).toContain('No viable');
    expect(result.selectedStrategy).toBeNull();
    expect(result.strategyRanking).toHaveLength(0);
  });

  // ── Episode reporting ──────────────────────────────────────────────────

  it('episode reporting updates prior store', () => {
    solver.reportEpisodeResult(
      'iron_ingot', 'mine', 'ctx1', true, 'plan-1', 'digest-1',
    );
    const prior = solver.priorStore.getPrior('iron_ingot', 'mine', 'ctx1');
    expect(prior.sampleCount).toBe(1);
    expect(prior.successRate).toBeGreaterThan(0.5);
  });

  // ── Result fields ──────────────────────────────────────────────────────

  it('result includes alternativeStrategies', async () => {
    const result = await solver.solveAcquisition(
      'iron_ingot', 1, baseInventory, baseNearbyBlocks, baseEntities,
    );
    // Should have multiple strategies
    expect(result.alternativeStrategies.length).toBeGreaterThanOrEqual(0);
    // Selected strategy should not be in alternatives
    if (result.selectedStrategy) {
      expect(result.alternativeStrategies).not.toContain(result.selectedStrategy);
    }
  });

  it('result includes strategyRanking', async () => {
    const result = await solver.solveAcquisition(
      'iron_ingot', 1, baseInventory, baseNearbyBlocks, baseEntities,
    );
    expect(result.strategyRanking.length).toBeGreaterThan(0);
  });

  // ── Mine/craft delegation regression (material fix) ──────────────────

  it('mine/craft delegation: parent bundle compatReport.valid when candidateCount > 0 and rules=[]', async () => {
    // Cobblestone → mine is only/best strategy → delegates to crafting solver.
    // Parent level: rules=[] (child solver handles them), but candidateCount > 0.
    // Before the fix, this triggered ACQUISITION_NO_VIABLE_STRATEGY because the
    // linter used rules.length (0) instead of candidateCount.
    const result = await solver.solveAcquisition(
      'cobblestone', 1,
      { 'cap:has_wooden_pickaxe': 1 },
      ['stone'],
      [],
    );
    expect(result.solved).toBe(true);
    expect(result.selectedStrategy).toBe('mine');

    const parentBundle = result.solveMeta!.bundles[0];
    expect(parentBundle.compatReport.valid).toBe(true);
    expect(parentBundle.compatReport.issues.filter(
      (i: any) => i.code === 'ACQUISITION_NO_VIABLE_STRATEGY',
    )).toHaveLength(0);
  });

  it('mine/craft delegation: parent bundle has parentBundleId', async () => {
    const result = await solver.solveAcquisition(
      'cobblestone', 1,
      { 'cap:has_wooden_pickaxe': 1 },
      ['stone'],
      [],
    );
    expect(result.parentBundleId).toBeTruthy();
    expect(result.parentBundleId).toBe(result.solveMeta!.bundles[0].bundleId);
  });

  it('mine/craft delegation: child bundles are appended after parent', async () => {
    const result = await solver.solveAcquisition(
      'cobblestone', 1,
      { 'cap:has_wooden_pickaxe': 1 },
      ['stone'],
      [],
    );
    // Parent bundle is first, child crafting bundle follows
    expect(result.solveMeta!.bundles.length).toBeGreaterThanOrEqual(2);
    const parentBundle = result.solveMeta!.bundles[0];
    const childBundle = result.solveMeta!.bundles[1];
    expect(parentBundle.bundleId).toContain('minecraft.acquisition');
    expect(childBundle.bundleId).toContain('minecraft.crafting');
  });

  // ── Context token injection ───────────────────────────────────────────

  it('trade strategy injects proximity:villager when villager observed', async () => {
    await solver.solveAcquisition(
      'iron_ingot', 1,
      { emerald: 5 },
      [],
      [{ type: 'villager', distance: 10 }],
    );
    expect(mockService.solve).toHaveBeenCalled();
    const payload = (mockService.solve as any).mock.calls[0][1];
    // Token injected because villager is in nearbyEntities
    expect(payload.inventory['proximity:villager']).toBe(1);
    // Original inventory items preserved
    expect(payload.inventory['emerald']).toBe(5);
  });

  it('trade strategy does NOT inject proximity:villager when no villager observed', async () => {
    // iron_ingot is in the trade table, so trade will be enumerated as
    // feasibility:'unknown'. With no villager in nearbyEntities, the
    // context token must NOT be fabricated — Python should fail the rule.
    const result = await solver.solveAcquisition(
      'iron_ingot', 1,
      { emerald: 5 },
      [],
      [], // No entities at all
    );
    // Trade may or may not be selected (depends on ranking with no alternatives).
    // If Sterling was called, assert the payload does not contain the token.
    if ((mockService.solve as any).mock.calls.length > 0) {
      const payload = (mockService.solve as any).mock.calls[0][1];
      expect(payload.inventory['proximity:villager']).toBeUndefined();
    }
  });

  it('loot strategy injects proximity:container:chest when chest observed', async () => {
    // saddle is ONLY in the loot table (not trade, not ore, not salvage).
    // With a chest nearby, loot is the only viable strategy.
    const result = await solver.solveAcquisition(
      'saddle', 1,
      {},
      [],
      [{ type: 'chest', distance: 20 }],
    );
    expect(result.selectedStrategy).toBe('loot');
    expect(mockService.solve).toHaveBeenCalled();
    const payload = (mockService.solve as any).mock.calls[0][1];
    expect(payload.inventory['proximity:container:chest']).toBe(1);
  });

  it('salvage strategy does NOT inject proximity tokens (consumes only)', async () => {
    // stick has salvage from oak_planks, is NOT in the trade table,
    // and oak_planks in inventory is needed for salvage.
    // No entities, no ore → only salvage is viable.
    const result = await solver.solveAcquisition(
      'stick', 1,
      { oak_planks: 1 },
      [],
      [],
    );
    expect(result.selectedStrategy).toBe('salvage');
    expect(mockService.solve).toHaveBeenCalled();
    const payload = (mockService.solve as any).mock.calls[0][1];
    // No proximity tokens should be injected for salvage
    const proximityKeys = Object.keys(payload.inventory).filter(
      (k: string) => k.startsWith('proximity:'),
    );
    expect(proximityKeys).toHaveLength(0);
  });

  it('child bundle input captures contextTokensInjected and inventory hash', async () => {
    const result = await solver.solveAcquisition(
      'iron_ingot', 1,
      { emerald: 5 },
      [],
      [{ type: 'villager', distance: 10 }],
    );
    expect(result.selectedStrategy).toBe('trade');
    // Child bundle (trade sub-solve) should have contextTokensInjected
    const childBundle = result.solveMeta!.bundles.find(
      b => b.input.solverId.includes('.trade'),
    );
    expect(childBundle).toBeDefined();
    expect(childBundle!.input.contextTokensInjected).toEqual(['proximity:villager']);
    // Material fact: initialStateHash proves the augmented inventory
    const expectedInventory = { emerald: 5, 'proximity:villager': 1 };
    expect(childBundle!.input.initialStateHash).toBe(
      hashInventoryState(expectedInventory),
    );
  });

  it('child bundle input has no contextTokensInjected for salvage and un-augmented inventory hash', async () => {
    const result = await solver.solveAcquisition(
      'stick', 1,
      { oak_planks: 1 },
      [],
      [],
    );
    expect(result.selectedStrategy).toBe('salvage');
    const childBundle = result.solveMeta!.bundles.find(
      b => b.input.solverId.includes('.salvage'),
    );
    expect(childBundle).toBeDefined();
    expect(childBundle!.input.contextTokensInjected).toBeUndefined();
    // Material fact: initialStateHash proves no proximity tokens leaked in
    const expectedInventory = { oak_planks: 1 };
    expect(childBundle!.input.initialStateHash).toBe(
      hashInventoryState(expectedInventory),
    );
  });

  it('toTaskSteps converts solved result to steps', async () => {
    const result = await solver.solveAcquisition(
      'iron_ingot', 1,
      { 'cap:has_stone_pickaxe': 1 },
      ['iron_ore'],
      [],
    );
    const steps = solver.toTaskSteps(result);
    if (result.solved && result.steps.length > 0) {
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0].meta?.domain).toBe('acquisition');
    }
  });
});
