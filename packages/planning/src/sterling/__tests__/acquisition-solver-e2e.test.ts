/**
 * Acquisition Solver E2E Test — Rig D strategies against live Sterling Python.
 *
 * Prerequisites: Sterling unified server running at ws://localhost:8766
 * Start with: cd sterling && python scripts/utils/sterling_unified_server.py
 *
 * Run with:
 *   STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/acquisition-solver-e2e.test.ts
 *
 * Key insight: minecraft_domain.py's `requires` field is a generic inventory
 * multiset check (line 281–284). Tokens like proximity:villager are checked
 * against inventory.get(name, 0) >= count and NOT consumed. The acquisition
 * solver injects these context tokens into the wire inventory before calling
 * Sterling, so acq:trade:*, acq:loot:*, and acq:salvage:* rules work natively
 * with zero Python changes.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MinecraftAcquisitionSolver, buildTradeRules, buildLootRules, buildSalvageRules } from '../minecraft-acquisition-solver';
import { MinecraftCraftingSolver } from '../minecraft-crafting-solver';
import { SterlingReasoningService } from '../sterling-reasoning-service';
import { contentHash, canonicalize, hashInventoryState } from '../solve-bundle';

const STERLING_URL = 'ws://localhost:8766';

// ---------------------------------------------------------------------------
// Environment gate
// ---------------------------------------------------------------------------

const shouldRun = !!process.env.STERLING_E2E;

function describeIf(condition: boolean) {
  return condition ? describe : describe.skip;
}

// ---------------------------------------------------------------------------
// Fresh service per test
// ---------------------------------------------------------------------------

const services: SterlingReasoningService[] = [];

async function freshService(): Promise<{ service: SterlingReasoningService; available: boolean }> {
  const service = new SterlingReasoningService({
    url: STERLING_URL,
    enabled: true,
    solveTimeout: 30000,
    connectTimeout: 5000,
    maxReconnectAttempts: 1,
  });

  await service.initialize();
  await new Promise((r) => setTimeout(r, 500));
  services.push(service);

  return { service, available: service.isAvailable() };
}

afterAll(() => {
  for (const svc of services) {
    svc.destroy();
  }
});

// ===========================================================================
// Trade strategy E2E
// ===========================================================================

describeIf(shouldRun)('AcquisitionSolver — trade strategy E2E', () => {
  it('trade:iron_ingot solves with proximity:villager context token', async () => {
    const { service, available } = await freshService();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const solver = new MinecraftAcquisitionSolver(service);
    // No crafting solver needed — trade dispatches directly to Sterling
    const result = await solver.solveAcquisition(
      'iron_ingot', 1,
      { emerald: 5 },
      [],
      [{ type: 'villager', distance: 10 }],
    );

    expect(result.selectedStrategy).toBe('trade');
    expect(result.solved).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);

    // solveMeta populated
    expect(result.solveMeta).toBeDefined();
    expect(result.solveMeta!.bundles.length).toBeGreaterThanOrEqual(1);

    // Parent bundle shape
    const parentBundle = result.solveMeta!.bundles[0];
    expect(parentBundle.input.solverId).toBe('minecraft.acquisition');
    expect(parentBundle.input.definitionHash).toMatch(/^[0-9a-f]{16}$/);
    expect(parentBundle.bundleId).toContain('minecraft.acquisition');
    expect(parentBundle.compatReport.valid).toBe(true);

    // Child bundle (trade sub-solve) — find by solverId, not hardcoded index
    const tradeChild = result.solveMeta!.bundles.find(
      b => b.input.solverId.includes('minecraft.acquisition.trade'),
    );
    expect(tradeChild).toBeDefined();
    expect(tradeChild!.output.solved).toBe(true);

    // Context token audit: child bundle input must reflect observation-derived injection.
    // proximity:villager should be present because a villager entity was passed in.
    expect(tradeChild!.input.contextTokensInjected).toEqual(['proximity:villager']);

    // Material fact: initialStateHash must match the augmented inventory
    // (original inventory + injected context token).
    const expectedTradeInventory = { emerald: 5, 'proximity:villager': 1 };
    expect(tradeChild!.input.initialStateHash).toBe(
      hashInventoryState(expectedTradeInventory),
    );

    // searchHealth should flow from Python
    if (tradeChild!.output.searchHealth) {
      const sh = tradeChild!.output.searchHealth;
      expect(sh.nodesExpanded).toBeGreaterThan(0);
      expect(sh.searchHealthVersion).toBe(1);
      console.log(
        `[Trade E2E] nodes=${sh.nodesExpanded} ` +
        `pctSameH=${sh.pctSameH?.toFixed(2)} ` +
        `termination=${sh.terminationReason}`,
      );
    }

    // candidateSetDigest present
    expect(result.candidateSetDigest).toMatch(/^[0-9a-f]{16}$/);

    // Export artifact
    const artifactDir = join(__dirname, '__artifacts__');
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, 'e2e-acquisition-trade.json'),
      JSON.stringify(result.solveMeta, null, 2),
    );
  });
});

// ===========================================================================
// Loot strategy E2E
// ===========================================================================

describeIf(shouldRun)('AcquisitionSolver — loot strategy E2E', () => {
  it('loot:saddle solves with proximity:container:chest context token', async () => {
    const { service, available } = await freshService();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const solver = new MinecraftAcquisitionSolver(service);

    // saddle is only in loot table — no trade/mine/salvage.
    const result = await solver.solveAcquisition(
      'saddle', 1,
      {},
      [],
      [{ type: 'chest', distance: 15 }],
    );

    expect(result.selectedStrategy).toBe('loot');
    expect(result.solved).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);

    // solveMeta populated
    expect(result.solveMeta).toBeDefined();
    expect(result.solveMeta!.bundles.length).toBeGreaterThanOrEqual(1);

    // Parent bundle
    const parentBundle = result.solveMeta!.bundles[0];
    expect(parentBundle.compatReport.valid).toBe(true);

    // Child bundle (loot sub-solve) — find by solverId, not hardcoded index
    const lootChild = result.solveMeta!.bundles.find(
      b => b.input.solverId.includes('minecraft.acquisition.loot'),
    );
    expect(lootChild).toBeDefined();
    expect(lootChild!.output.solved).toBe(true);

    // Context token audit: proximity:container:chest should be present
    // because a chest entity was passed in nearbyEntities.
    expect(lootChild!.input.contextTokensInjected).toEqual(['proximity:container:chest']);

    // Material fact: initialStateHash must match augmented inventory.
    // Loot: empty base inventory + injected proximity:container:chest.
    const expectedLootInventory = { 'proximity:container:chest': 1 };
    expect(lootChild!.input.initialStateHash).toBe(
      hashInventoryState(expectedLootInventory),
    );

    if (lootChild!.output.searchHealth) {
      const sh = lootChild!.output.searchHealth;
      expect(sh.nodesExpanded).toBeGreaterThan(0);
      console.log(
        `[Loot E2E] nodes=${sh.nodesExpanded} ` +
        `termination=${sh.terminationReason}`,
      );
    }

    expect(result.candidateSetDigest).toMatch(/^[0-9a-f]{16}$/);

    // Export artifact
    const artifactDir = join(__dirname, '__artifacts__');
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, 'e2e-acquisition-loot.json'),
      JSON.stringify(result.solveMeta, null, 2),
    );
  });
});

// ===========================================================================
// Salvage strategy E2E
// ===========================================================================

describeIf(shouldRun)('AcquisitionSolver — salvage strategy E2E', () => {
  it('salvage:stick solves consuming oak_planks', async () => {
    const { service, available } = await freshService();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const solver = new MinecraftAcquisitionSolver(service);

    // stick has salvage from oak_planks, not in trade table.
    // No entities, no ore → only salvage viable.
    const result = await solver.solveAcquisition(
      'stick', 1,
      { oak_planks: 2 },
      [],
      [],
    );

    expect(result.selectedStrategy).toBe('salvage');
    expect(result.solved).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);

    // solveMeta populated
    expect(result.solveMeta).toBeDefined();
    expect(result.solveMeta!.bundles.length).toBeGreaterThanOrEqual(1);

    // Parent bundle
    const parentBundle = result.solveMeta!.bundles[0];
    expect(parentBundle.compatReport.valid).toBe(true);

    // Child bundle (salvage sub-solve) — find by solverId, not hardcoded index
    const salvageChild = result.solveMeta!.bundles.find(
      b => b.input.solverId.includes('minecraft.acquisition.salvage'),
    );
    expect(salvageChild).toBeDefined();
    expect(salvageChild!.output.solved).toBe(true);

    // Context token audit: salvage rules have no proximity: requires,
    // so no context tokens should have been injected (no entities passed either).
    expect(salvageChild!.input.contextTokensInjected).toBeUndefined();

    // Material fact: initialStateHash must match the un-augmented inventory.
    // No proximity tokens injected — inventory is exactly what was passed.
    const expectedSalvageInventory = { oak_planks: 2 };
    expect(salvageChild!.input.initialStateHash).toBe(
      hashInventoryState(expectedSalvageInventory),
    );

    if (salvageChild!.output.searchHealth) {
      const sh = salvageChild!.output.searchHealth;
      expect(sh.nodesExpanded).toBeGreaterThan(0);
      console.log(
        `[Salvage E2E] nodes=${sh.nodesExpanded} ` +
        `termination=${sh.terminationReason}`,
      );
    }

    expect(result.candidateSetDigest).toMatch(/^[0-9a-f]{16}$/);

    // Export artifact
    const artifactDir = join(__dirname, '__artifacts__');
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, 'e2e-acquisition-salvage.json'),
      JSON.stringify(result.solveMeta, null, 2),
    );
  });
});

// ===========================================================================
// Mine delegation E2E (exercises crafting solver → Python)
// ===========================================================================

describeIf(shouldRun)('AcquisitionSolver — mine delegation E2E', () => {
  it('mine:cobblestone selects mine strategy; delegation fails gracefully without mcData', async () => {
    // Known limitation: mine/craft delegation requires mcData (from minecraft-data
    // package) to build crafting rules. When mcData is null, buildCraftingRules
    // crashes. The acquisition solver catches this and returns solved=false with
    // an error message. This test proves:
    // 1. Strategy selection works correctly (mine is selected)
    // 2. Error handling is graceful (no throw, structured error result)
    // 3. Parent bundle is still emitted with valid structure
    //
    // Full mine E2E requires mcData injection, which is out of scope for
    // the acquisition solver layer. See unit tests for the mocked mine path.
    const { service, available } = await freshService();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const craftingSolver = new MinecraftCraftingSolver(service);
    const solver = new MinecraftAcquisitionSolver(service);
    solver.setCraftingSolver(craftingSolver);

    const result = await solver.solveAcquisition(
      'cobblestone', 1,
      { 'cap:has_wooden_pickaxe': 1 },
      ['stone'],
      [],
    );

    // Strategy selection is correct regardless of solve outcome
    expect(result.selectedStrategy).toBe('mine');

    // Mine delegation without mcData → graceful failure
    expect(result.solved).toBe(false);
    expect(result.error).toBeDefined();

    // Parent bundle still emitted
    expect(result.solveMeta).toBeDefined();
    expect(result.solveMeta!.bundles.length).toBeGreaterThanOrEqual(1);

    const parentBundle = result.solveMeta!.bundles[0];
    expect(parentBundle.bundleId).toContain('minecraft.acquisition');
    // Parent compat is valid — the linter checks the acquisition rules, not crafting
    expect(parentBundle.compatReport.valid).toBe(true);

    // candidateSetDigest still computed (strategy enumeration succeeded)
    expect(result.candidateSetDigest).toMatch(/^[0-9a-f]{16}$/);

    console.log(
      `[Mine E2E] strategy=${result.selectedStrategy} ` +
      `solved=${result.solved} error="${result.error}"`,
    );

    // Export artifact
    const artifactDir = join(__dirname, '__artifacts__');
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, 'e2e-acquisition-mine.json'),
      JSON.stringify(result.solveMeta, null, 2),
    );
  });
});

// ===========================================================================
// Multi-strategy: same item, different contexts → different strategies
// ===========================================================================

describeIf(shouldRun)('AcquisitionSolver — multi-strategy context sensitivity E2E', () => {
  it('iron_ingot near village selects trade; saddle near chest selects loot', async () => {
    // Both scenarios use strategies that dispatch through dispatchSterlingRules
    // (trade + loot), so both solve against live Sterling without mcData.
    const { service: svc1, available: a1 } = await freshService();
    const { service: svc2, available: a2 } = await freshService();
    if (!a1 || !a2) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    // Scenario A: village context — trade iron_ingot
    const solverA = new MinecraftAcquisitionSolver(svc1);
    const resultA = await solverA.solveAcquisition(
      'iron_ingot', 1,
      { emerald: 5 },
      [],
      [{ type: 'villager', distance: 10 }],
    );

    // Scenario B: dungeon context — loot saddle from chest
    const solverB = new MinecraftAcquisitionSolver(svc2);
    const resultB = await solverB.solveAcquisition(
      'saddle', 1,
      {},
      [],
      [{ type: 'chest', distance: 15 }],
    );

    // Both should solve
    expect(resultA.solved).toBe(true);
    expect(resultB.solved).toBe(true);

    // Different strategies selected
    expect(resultA.selectedStrategy).toBe('trade');
    expect(resultB.selectedStrategy).toBe('loot');

    // Both have valid bundles
    expect(resultA.solveMeta!.bundles[0].compatReport.valid).toBe(true);
    expect(resultB.solveMeta!.bundles[0].compatReport.valid).toBe(true);

    // Context token audit + inventory hash: trade scenario
    const tradeChild = resultA.solveMeta!.bundles.find(
      b => b.input.solverId.includes('.trade'),
    );
    expect(tradeChild).toBeDefined();
    expect(tradeChild!.input.contextTokensInjected).toEqual(['proximity:villager']);
    const expectedTradeInv = { emerald: 5, 'proximity:villager': 1 };
    expect(tradeChild!.input.initialStateHash).toBe(
      hashInventoryState(expectedTradeInv),
    );

    // Context token audit + inventory hash: loot scenario
    const lootChild = resultB.solveMeta!.bundles.find(
      b => b.input.solverId.includes('.loot'),
    );
    expect(lootChild).toBeDefined();
    expect(lootChild!.input.contextTokensInjected).toEqual(['proximity:container:chest']);
    const expectedLootInv = { 'proximity:container:chest': 1 };
    expect(lootChild!.input.initialStateHash).toBe(
      hashInventoryState(expectedLootInv),
    );

    // candidateSetDigest differs (different item + different world state)
    expect(resultA.candidateSetDigest).not.toBe(resultB.candidateSetDigest);

    console.log(
      `[Multi-strategy E2E] ` +
      `tradeStrategy=${resultA.selectedStrategy} lootStrategy=${resultB.selectedStrategy} ` +
      `digestA=${resultA.candidateSetDigest.slice(0, 8)} digestB=${resultB.candidateSetDigest.slice(0, 8)}`,
    );
  });
});

// ===========================================================================
// Deterministic bundleId across trade solves
// ===========================================================================

describeIf(shouldRun)('AcquisitionSolver — deterministic identity E2E', () => {
  it('two identical trade solves produce identical input hashes', async () => {
    const { service: svc1, available: a1 } = await freshService();
    const { service: svc2, available: a2 } = await freshService();
    if (!a1 || !a2) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const solver1 = new MinecraftAcquisitionSolver(svc1);
    const solver2 = new MinecraftAcquisitionSolver(svc2);

    const inv = { emerald: 5 };
    const blocks: string[] = [];
    const entities = [{ type: 'villager' as const, distance: 10 }];

    const r1 = await solver1.solveAcquisition('iron_ingot', 1, inv, blocks, entities);
    const r2 = await solver2.solveAcquisition('iron_ingot', 1, inv, blocks, entities);

    expect(r1.solved).toBe(true);
    expect(r2.solved).toBe(true);

    // Same candidate set digest
    expect(r1.candidateSetDigest).toBe(r2.candidateSetDigest);

    // Same input hashes on parent bundle
    const b1 = r1.solveMeta!.bundles[0].input;
    const b2 = r2.solveMeta!.bundles[0].input;
    expect(b1.definitionHash).toBe(b2.definitionHash);
    expect(b1.initialStateHash).toBe(b2.initialStateHash);
    expect(b1.goalHash).toBe(b2.goalHash);

    // Context token audit: both child bundles should have identical contextTokensInjected
    // and identical initialStateHash (proving same augmented inventory was sent).
    const child1 = r1.solveMeta!.bundles.find(
      b => b.input.solverId.includes('.trade'),
    );
    const child2 = r2.solveMeta!.bundles.find(
      b => b.input.solverId.includes('.trade'),
    );
    if (child1 && child2) {
      expect(child1.input.contextTokensInjected)
        .toEqual(child2.input.contextTokensInjected);
      expect(child1.input.initialStateHash)
        .toBe(child2.input.initialStateHash);
    }
  });
});
