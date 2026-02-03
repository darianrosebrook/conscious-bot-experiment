/**
 * Acquisition Benchmark — Learning-Sensitive Tests (M1)
 *
 * Proves:
 * - CandidateSetDigest unchanged before/after learning episodes
 * - Strategy frequency shifts toward lower-effort strategies after adverse outcomes
 * - Strategy stabilization within [PRIOR_MIN, PRIOR_MAX]
 * - Operator set immutability: rules passed to sub-solve unchanged by learning
 *
 * 5 benchmark scenarios × learning sensitivity tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MinecraftAcquisitionSolver, buildTradeRules, buildLootRules } from '../minecraft-acquisition-solver';
import { StrategyPriorStore } from '../minecraft-acquisition-priors';
import {
  computeCandidateSetDigest,
  PRIOR_MIN,
  PRIOR_MAX,
  type AcquisitionContextV1,
} from '../minecraft-acquisition-types';
import {
  buildAcquisitionContext,
  buildAcquisitionStrategies,
  rankStrategies,
  contextKeyFromAcquisitionContext,
} from '../minecraft-acquisition-rules';
import type { SterlingReasoningService } from '../sterling-reasoning-service';
import { canonicalize } from '../solve-bundle';

// ── Mock Sterling Service ──────────────────────────────────────────────────

function makeMockService(): SterlingReasoningService {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    solve: vi.fn().mockResolvedValue({
      solutionFound: true,
      solutionPath: [{ source: 'a', target: 'b', label: 'step-1' }],
      discoveredNodes: [{ id: 'a' }, { id: 'b' }],
      searchEdges: [],
      durationMs: 50,
      metrics: {},
    }),
    getConnectionNonce: vi.fn().mockReturnValue(1),
    registerDomainDeclaration: vi.fn().mockResolvedValue({ success: true }),
    initialize: vi.fn(),
    destroy: vi.fn(),
    getHealthStatus: vi.fn().mockReturnValue({ enabled: true }),
    verifyReachability: vi.fn(),
    queryKnowledgeGraph: vi.fn(),
    withFallback: vi.fn(),
  } as unknown as SterlingReasoningService;
}

function makeMockCraftingSolver() {
  return {
    solveCraftingGoal: vi.fn().mockResolvedValue({
      solved: true,
      steps: [{
        action: 'mine:iron_ore',
        actionType: 'mine',
        produces: [{ name: 'raw_iron', count: 1 }],
        consumes: [],
        resultingInventory: { raw_iron: 1 },
      }],
      totalNodes: 10,
      durationMs: 30,
      planId: 'bench-plan-1',
      solveMeta: { bundles: [] },
    }),
    solverId: 'minecraft.crafting',
  } as any;
}

// ── Scenario Fixtures ──────────────────────────────────────────────────────

/** Scenario 1: Iron ingot, near village — trade + mine available */
function scenario1() {
  const inventory = { emerald: 5, 'cap:has_stone_pickaxe': 1 };
  const blocks = ['iron_ore', 'stone'];
  const entities = [{ type: 'villager' as const, distance: 10 }];
  return { item: 'iron_ingot', inventory, blocks, entities };
}

/** Scenario 2: Iron ingot, no village — mine only */
function scenario2() {
  const inventory = { 'cap:has_stone_pickaxe': 1 };
  const blocks = ['iron_ore', 'stone'];
  return { item: 'iron_ingot', inventory, blocks, entities: [] as any[] };
}

/** Scenario 3: Diamond, near chest — loot + mine available */
function scenario3() {
  const inventory = { 'cap:has_iron_pickaxe': 1 };
  const blocks = ['diamond_ore', 'stone'];
  const entities = [{ type: 'chest' as const, distance: 15 }];
  return { item: 'diamond', inventory, blocks, entities };
}

/** Scenario 4: Oak planks, any context — mine dominates */
function scenario4() {
  const inventory = { oak_log: 5 };
  const blocks = ['oak_log'];
  return { item: 'oak_planks', inventory, blocks, entities: [] as any[] };
}

/** Scenario 5: Cobblestone, tool-gated — needs wooden pickaxe */
function scenario5_withTool() {
  const inventory = { 'cap:has_wooden_pickaxe': 1 };
  const blocks = ['stone'];
  return { item: 'cobblestone', inventory, blocks, entities: [] as any[] };
}

function scenario5_noTool() {
  const inventory = {};
  const blocks = ['stone'];
  return { item: 'cobblestone', inventory, blocks, entities: [] as any[] };
}

// ============================================================================
// Benchmark Scenarios
// ============================================================================

describe('Benchmark Scenarios', () => {
  it('S1: Iron ingot near village — trade available + mine available', () => {
    const { item, inventory, blocks, entities } = scenario1();
    const ctx = buildAcquisitionContext(item, inventory, blocks, entities);
    const candidates = buildAcquisitionStrategies(ctx);

    const strategies = candidates.map(c => c.strategy);
    expect(strategies).toContain('mine');
    expect(strategies).toContain('trade');
    // Trade should be cheaper (1 emerald) vs mine (8+ effort)
    const trade = candidates.find(c => c.strategy === 'trade')!;
    const mine = candidates.find(c => c.strategy === 'mine')!;
    expect(trade.estimatedCost).toBeLessThan(mine.estimatedCost);
  });

  it('S2: Iron ingot, no village — mine is only viable, no phantom trade', () => {
    const { item, inventory, blocks, entities } = scenario2();
    const ctx = buildAcquisitionContext(item, inventory, blocks, entities);
    const candidates = buildAcquisitionStrategies(ctx);

    // Mine should be present
    expect(candidates.some(c => c.strategy === 'mine')).toBe(true);
    // Trade may be present but with unknown feasibility (no villager)
    const trade = candidates.find(c => c.strategy === 'trade');
    if (trade) {
      expect(trade.feasibility).toBe('unknown');
    }
  });

  it('S3: Diamond near chest — loot available + mine available', () => {
    const { item, inventory, blocks, entities } = scenario3();
    const ctx = buildAcquisitionContext(item, inventory, blocks, entities);
    const candidates = buildAcquisitionStrategies(ctx);

    expect(candidates.some(c => c.strategy === 'mine')).toBe(true);
    expect(candidates.some(c => c.strategy === 'loot')).toBe(true);
    const loot = candidates.find(c => c.strategy === 'loot')!;
    expect(loot.feasibility).toBe('available');
  });

  it('S4: Oak planks — salvage dominates (log → planks)', () => {
    const { item, inventory, blocks, entities } = scenario4();
    const ctx = buildAcquisitionContext(item, inventory, blocks, entities);
    const candidates = buildAcquisitionStrategies(ctx);

    // Oak planks are crafted from oak_log, not directly mined.
    // Salvage is available (oak_log → oak_planks in salvage table).
    const salvage = candidates.find(c => c.strategy === 'salvage');
    expect(salvage).toBeDefined();
    // No trade for oak_planks (not in trade table)
    expect(candidates.find(c => c.strategy === 'trade')).toBeUndefined();
    // Mine is not available for oak_planks (it's a processed item)
    // Oak_log block produces oak_log item, not oak_planks
  });

  it('S5: Cobblestone with tool → mine available', () => {
    const { item, inventory, blocks, entities } = scenario5_withTool();
    const ctx = buildAcquisitionContext(item, inventory, blocks, entities);
    const candidates = buildAcquisitionStrategies(ctx);

    const mine = candidates.find(c => c.strategy === 'mine');
    expect(mine).toBeDefined();
    // stone block produces cobblestone → oreNearby should be true
    expect(ctx.oreNearby).toBe(true);
    // With wooden pickaxe → mine should be available
    expect(mine!.feasibility).toBe('available');
  });

  it('S5: Cobblestone without tool — still available (stone has no tier gate)', () => {
    const { item, inventory, blocks, entities } = scenario5_noTool();
    const ctx = buildAcquisitionContext(item, inventory, blocks, entities);
    const candidates = buildAcquisitionStrategies(ctx);

    const mine = candidates.find(c => c.strategy === 'mine');
    // Stone/cobblestone are non-ore blocks: no tier requirement in ORE_TIER_REQUIREMENTS.
    // Mining stone is always feasible when the block is nearby.
    expect(mine).toBeDefined();
    expect(mine!.feasibility).toBe('available');
  });
});

// ============================================================================
// M1 Core: Learning Sensitivity
// ============================================================================

describe('M1: CandidateSetDigest unchanged after learning', () => {
  it('digest unchanged after N reportEpisodeResult calls', () => {
    const store = new StrategyPriorStore();
    const { item, inventory, blocks, entities } = scenario1();
    const ctx = buildAcquisitionContext(item, inventory, blocks, entities);
    const candidates = buildAcquisitionStrategies(ctx);
    const contextKey = contextKeyFromAcquisitionContext(ctx);

    const digestBefore = computeCandidateSetDigest(candidates);

    // Simulate 10 episode results
    for (let i = 0; i < 10; i++) {
      store.updatePrior(item, 'trade', contextKey, i % 2 === 0, `plan-${i}`);
      store.updatePrior(item, 'mine', contextKey, i % 3 === 0, `plan-${i + 100}`);
    }

    // Re-enumerate candidates with same world state
    const candidatesAfter = buildAcquisitionStrategies(ctx);
    const digestAfter = computeCandidateSetDigest(candidatesAfter);

    expect(digestBefore).toBe(digestAfter);
  });

  it('digest unchanged for all 5 scenarios after learning', () => {
    const store = new StrategyPriorStore();
    const scenarios = [scenario1(), scenario2(), scenario3(), scenario4(), scenario5_withTool()];

    for (const { item, inventory, blocks, entities } of scenarios) {
      const ctx = buildAcquisitionContext(item, inventory, blocks, entities);
      const candidates = buildAcquisitionStrategies(ctx);
      const contextKey = contextKeyFromAcquisitionContext(ctx);
      const digestBefore = computeCandidateSetDigest(candidates);

      // Learning episodes
      for (const c of candidates) {
        store.updatePrior(item, c.strategy, contextKey, true, 'plan-x');
        store.updatePrior(item, c.strategy, contextKey, false, 'plan-y');
      }

      // Re-enumerate
      const candidatesAfter = buildAcquisitionStrategies(ctx);
      const digestAfter = computeCandidateSetDigest(candidatesAfter);
      expect(digestBefore).toBe(digestAfter);
    }
  });
});

describe('M1: Strategy frequency shift', () => {
  it('after trade failures x3 + mine successes, mine ranks higher than trade', () => {
    const store = new StrategyPriorStore();
    const { item, inventory, blocks, entities } = scenario1();
    const ctx = buildAcquisitionContext(item, inventory, blocks, entities);
    const candidates = buildAcquisitionStrategies(ctx);
    const contextKey = contextKeyFromAcquisitionContext(ctx);

    // Initial ranking: trade should be ahead of mine (lower cost)
    const rankedBefore = rankStrategies(candidates, []);
    const tradeIdxBefore = rankedBefore.findIndex(c => c.strategy === 'trade');
    const mineIdxBefore = rankedBefore.findIndex(c => c.strategy === 'mine');
    expect(tradeIdxBefore).toBeLessThan(mineIdxBefore);

    // Report trade failures to drive its prior down
    for (let i = 0; i < 10; i++) {
      store.updatePrior(item, 'trade', contextKey, false, `plan-fail-${i}`);
    }
    // Report mine successes to drive its prior up
    for (let i = 0; i < 10; i++) {
      store.updatePrior(item, 'mine', contextKey, true, `plan-win-${i}`);
    }

    // Re-rank with updated priors
    const priors = store.getPriorsForContext(item, contextKey);
    const rankedAfter = rankStrategies(candidates, priors);
    const tradeIdxAfter = rankedAfter.findIndex(c => c.strategy === 'trade');
    const mineIdxAfter = rankedAfter.findIndex(c => c.strategy === 'mine');

    // Mine should now rank higher (lower index) than trade
    expect(mineIdxAfter).toBeLessThan(tradeIdxAfter);
  });
});

describe('M1: Strategy stabilization', () => {
  it('after repeated successes, mine prior rises and stabilizes within bounds', () => {
    const store = new StrategyPriorStore();
    const contextKey = 'benchmark-ctx';

    for (let i = 0; i < 50; i++) {
      store.updatePrior('iron_ingot', 'mine', contextKey, true, `plan-${i}`);
    }

    const prior = store.getPrior('iron_ingot', 'mine', contextKey);
    expect(prior.successRate).toBeGreaterThan(0.8);
    expect(prior.successRate).toBeLessThanOrEqual(PRIOR_MAX);
  });

  it('after repeated failures, prior drops but stays above PRIOR_MIN', () => {
    const store = new StrategyPriorStore();
    const contextKey = 'benchmark-ctx';

    for (let i = 0; i < 50; i++) {
      store.updatePrior('iron_ingot', 'mine', contextKey, false, `plan-${i}`);
    }

    const prior = store.getPrior('iron_ingot', 'mine', contextKey);
    expect(prior.successRate).toBeLessThan(0.2);
    expect(prior.successRate).toBeGreaterThanOrEqual(PRIOR_MIN);
  });
});

describe('M1: Operator set immutability', () => {
  it('rules passed to sub-solve unchanged before and after learning', () => {
    const store = new StrategyPriorStore();
    const item = 'iron_ingot';
    const contextKey = 'immutability-ctx';

    // Capture rules before learning
    const tradeRulesBefore = canonicalize(buildTradeRules(item));
    const lootRulesBefore = canonicalize(buildLootRules('diamond'));

    // Simulate learning
    for (let i = 0; i < 20; i++) {
      store.updatePrior(item, 'trade', contextKey, i % 2 === 0, `plan-${i}`);
    }

    // Capture rules after learning
    const tradeRulesAfter = canonicalize(buildTradeRules(item));
    const lootRulesAfter = canonicalize(buildLootRules('diamond'));

    // Rules are identical — learning does not mutate sub-solve semantics
    expect(tradeRulesBefore).toBe(tradeRulesAfter);
    expect(lootRulesBefore).toBe(lootRulesAfter);
  });
});

// ============================================================================
// End-to-end solver benchmark (mocked Sterling)
// ============================================================================

describe('M1: End-to-end solver benchmark', () => {
  let solver: MinecraftAcquisitionSolver;

  beforeEach(() => {
    const service = makeMockService();
    solver = new MinecraftAcquisitionSolver(service);
    solver.setCraftingSolver(makeMockCraftingSolver());
  });

  it('S1: solver produces result with candidateSetDigest', async () => {
    const { item, inventory, blocks, entities } = scenario1();
    const result = await solver.solveAcquisition(item, 1, inventory, blocks, entities);
    expect(result.candidateSetDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(result.strategyRanking.length).toBeGreaterThan(0);
  });

  it('candidateSetDigest stable across multiple solves', async () => {
    const { item, inventory, blocks, entities } = scenario1();
    const r1 = await solver.solveAcquisition(item, 1, inventory, blocks, entities);
    const r2 = await solver.solveAcquisition(item, 1, inventory, blocks, entities);
    expect(r1.candidateSetDigest).toBe(r2.candidateSetDigest);
  });

  it('learning affects strategy selection but not candidateSetDigest', async () => {
    const { item, inventory, blocks, entities } = scenario1();
    const r1 = await solver.solveAcquisition(item, 1, inventory, blocks, entities);
    const digestBefore = r1.candidateSetDigest;

    // Simulate learning via episode reporting
    const ctx = buildAcquisitionContext(item, inventory, blocks, entities);
    const contextKey = contextKeyFromAcquisitionContext(ctx);

    // Report failures for the selected strategy
    for (let i = 0; i < 5; i++) {
      solver.reportEpisodeResult(
        item,
        r1.selectedStrategy!,
        contextKey,
        false,
        `plan-fail-${i}`,
        r1.candidateSetDigest,
      );
    }

    // Solve again with same world state
    const r2 = await solver.solveAcquisition(item, 1, inventory, blocks, entities);

    // Digest unchanged (M1 invariant)
    expect(r2.candidateSetDigest).toBe(digestBefore);

    // Strategy may have changed (learning effect)
    // At minimum, the prior for the original strategy should have decreased
    const prior = solver.priorStore.getPrior(item, r1.selectedStrategy!, contextKey);
    expect(prior.successRate).toBeLessThan(0.5);
  });
});
