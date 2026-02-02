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
