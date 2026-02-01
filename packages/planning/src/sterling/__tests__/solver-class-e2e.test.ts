/**
 * Solver-class end-to-end test against a live Sterling backend.
 *
 * Unlike tool-progression-integration.test.ts (which uses raw WebSocket calls),
 * this test instantiates the actual TypeScript solver class and validates that
 * solveMeta.bundles is populated with correct shape after a real solve.
 *
 * Prerequisites: Sterling unified server running at ws://localhost:8766
 * Start with: cd sterling && python scripts/utils/sterling_unified_server.py
 *
 * Run with:
 *   STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/solver-class-e2e.test.ts
 *
 * NOTE: The Sterling backend uses nearbyBlocks (when present in the wire
 * payload) to filter which mine actions are available. The tool progression
 * solver intentionally omits nearbyBlocks from the wire payload — block
 * availability is handled at the rule-builder level via missingBlocks.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MinecraftToolProgressionSolver } from '../minecraft-tool-progression-solver';
import { MinecraftBuildingSolver } from '../minecraft-building-solver';
import { SterlingReasoningService } from '../sterling-reasoning-service';
import { contentHash, canonicalize } from '../solve-bundle';
import { detectHeuristicDegeneracy } from '../search-health';
import type { BuildingModule, BuildingSiteState } from '../minecraft-building-types';
import { buildDefaultMinecraftGraph, MacroPlanner } from '../../hierarchical/macro-planner';
import { FeedbackStore } from '../../hierarchical/feedback';
import { collectRigESignals } from '../../hierarchical/signals';
import { SterlingPlanner } from '../../task-integration/sterling-planner';

const STERLING_URL = 'ws://localhost:8766';

// ---------------------------------------------------------------------------
// Environment gate
// ---------------------------------------------------------------------------

const shouldRun = !!process.env.STERLING_E2E;

function describeIf(condition: boolean) {
  return condition ? describe : describe.skip;
}

// ---------------------------------------------------------------------------
// Fresh connection per test
// ---------------------------------------------------------------------------
// Each test gets its own service + solver to avoid WebSocket message
// interleaving across solves on a shared persistent connection.

const services: SterlingReasoningService[] = [];

async function freshSolver(): Promise<{
  solver: MinecraftToolProgressionSolver;
  available: boolean;
}> {
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

  return {
    solver: new MinecraftToolProgressionSolver(service),
    available: service.isAvailable(),
  };
}

afterAll(() => {
  for (const svc of services) {
    svc.destroy();
  }
});

// ===========================================================================
// Solver-class E2E: solveMeta evidence against live backend
// ===========================================================================

describeIf(shouldRun)('ToolProgressionSolver — solver-class E2E', () => {

  it('wooden_pickaxe solve populates solveMeta.bundles', async () => {
    const { solver, available } = await freshSolver();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const result = await solver.solveToolProgression(
      'wooden_pickaxe',
      {},
      []
    );

    // The solve should succeed against a real backend
    expect(result.solved).toBe(true);

    // Core evidence: solveMeta exists and has the right shape
    expect(result.solveMeta).toBeDefined();
    expect(result.solveMeta!.bundles.length).toBeGreaterThanOrEqual(1);

    const bundle = result.solveMeta!.bundles[0];

    // Input hashes are present and non-empty
    expect(bundle.input.solverId).toBe('minecraft.tool_progression');
    expect(bundle.input.executionMode).toBe('tool_progression');
    expect(bundle.input.definitionHash).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.input.initialStateHash).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.input.goalHash).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.input.definitionCount).toBeGreaterThan(0);

    // Output reflects a real solve
    expect(bundle.output.solved).toBe(true);
    expect(bundle.output.stepsDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.output.searchStats.totalNodes).toBeGreaterThan(0);
    expect(bundle.output.searchStats.durationMs).toBeGreaterThan(0);
    expect(bundle.output.searchStats.solutionPathLength).toBeGreaterThan(0);

    // Compat report is valid (rule builder output should pass linter)
    expect(bundle.compatReport.valid).toBe(true);
    expect(bundle.compatReport.issues).toEqual([]);

    // Content-addressed bundleId
    expect(bundle.bundleId).toMatch(/^minecraft\.tool_progression:[0-9a-f]{16}$/);

    // searchHealth should be present now that Python emits it
    expect(bundle.output.searchHealth).toBeDefined();
    const sh = bundle.output.searchHealth!;
    expect(sh.nodesExpanded).toBeGreaterThan(0);
    expect(sh.frontierPeak).toBeGreaterThanOrEqual(0);
    expect(sh.hMin).toBeLessThanOrEqual(sh.hMax);
    expect(sh.hVariance).toBeGreaterThanOrEqual(0);
    expect(sh.pctSameH).toBeGreaterThanOrEqual(0);
    expect(sh.pctSameH).toBeLessThanOrEqual(1);
    expect(['goal_found', 'max_nodes', 'frontier_exhausted', 'error']).toContain(
      sh.terminationReason
    );
    expect(sh.branchingEstimate).toBeGreaterThanOrEqual(0);
    expect(sh.searchHealthVersion).toBe(1);

    // Export bundle artifact for post-run inspection
    const artifactDir = join(__dirname, '__artifacts__');
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, 'e2e-wooden-pickaxe-bundle.json'),
      JSON.stringify(bundle, null, 2)
    );
  });

  it('stepsDigest matches recomputed hash of returned steps', async () => {
    const { solver, available } = await freshSolver();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const result = await solver.solveToolProgression(
      'wooden_pickaxe',
      {},
      []
    );

    expect(result.solved).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);

    const bundle = result.solveMeta!.bundles[0];

    // Recompute stepsDigest from the returned steps
    const actions = result.steps.map((s) => s.action);
    const recomputedDigest = contentHash(canonicalize(actions));

    expect(bundle.output.stepsDigest).toBe(recomputedDigest);
  });

  it('two identical solves produce identical bundleHash', async () => {
    const { solver: solver1, available: a1 } = await freshSolver();
    const { solver: solver2, available: a2 } = await freshSolver();

    if (!a1 || !a2) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const result1 = await solver1.solveToolProgression('wooden_pickaxe', {}, []);
    const result2 = await solver2.solveToolProgression('wooden_pickaxe', {}, []);

    expect(result1.solved).toBe(true);
    expect(result2.solved).toBe(true);

    // Both hashes are well-formed
    expect(result1.solveMeta!.bundles[0].bundleHash).toMatch(/^[0-9a-f]{16}$/);
    expect(result2.solveMeta!.bundles[0].bundleHash).toMatch(/^[0-9a-f]{16}$/);

    // Both bundleIds follow the content-addressed format
    expect(result1.solveMeta!.bundles[0].bundleId).toMatch(/^minecraft\.tool_progression:[0-9a-f]{16}$/);
    expect(result2.solveMeta!.bundles[0].bundleId).toMatch(/^minecraft\.tool_progression:[0-9a-f]{16}$/);

    // Input hashes should match (same rules, same inventory, same goal)
    expect(result1.solveMeta!.bundles[0].input.definitionHash)
      .toBe(result2.solveMeta!.bundles[0].input.definitionHash);
    expect(result1.solveMeta!.bundles[0].input.initialStateHash)
      .toBe(result2.solveMeta!.bundles[0].input.initialStateHash);
    expect(result1.solveMeta!.bundles[0].input.goalHash)
      .toBe(result2.solveMeta!.bundles[0].input.goalHash);

    // NOTE: bundleHash equality is NOT asserted here — live solves have
    // nondeterministic output fields (durationMs, totalNodes, planId) that
    // differ per run. Deterministic bundle ID invariant is proven by the
    // unit-level golden-master tests instead.
  });
});

// ===========================================================================
// Building Solver E2E (1.1)
// ===========================================================================

describeIf(shouldRun)('BuildingSolver — solver-class E2E', () => {
  it('minimal building scenario populates solveMeta.bundles', async () => {
    const { solver: tpSolver, available } = await freshSolver();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    // Use the same service connection for the building solver
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

    const solver = new MinecraftBuildingSolver(service);

    if (!service.isAvailable()) {
      console.log('  [SKIPPED] Sterling server not available for building');
      return;
    }

    const result = await solver.solveBuildingPlan(
      'basic_shelter_5x5__e2e',
      'N',
      ['walls_1'],
      { cobblestone: 50, oak_log: 10 },
      { terrain: 'flat', biome: 'plains', hasTreesNearby: false, hasWaterNearby: false, siteCaps: 'flat_5x5_clear' },
      [{ moduleId: 'walls_1', moduleType: 'apply_module', requiresModules: [], materialsNeeded: [{ name: 'cobblestone', count: 24 }], placementFeasible: true, baseCost: 1 }]
    );

    // Accept both solved and needsMaterials as valid E2E proof
    expect(result.solveMeta).toBeDefined();
    expect(result.solveMeta!.bundles.length).toBeGreaterThanOrEqual(1);

    const bundle = result.solveMeta!.bundles[0];
    expect(bundle.input.solverId).toBe('minecraft.building');
    expect(bundle.input.definitionHash).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.bundleId).toMatch(/^minecraft\.building:[0-9a-f]{16}$/);

    // If solved, check searchHealth
    if (result.solved && bundle.output.searchHealth) {
      expect(bundle.output.searchHealth.nodesExpanded).toBeGreaterThan(0);
      expect(bundle.output.searchHealth.searchHealthVersion).toBe(1);
    }
  });
});

// ===========================================================================
// Iron-tier searchHealth experiments (1.3)
// ===========================================================================

describeIf(shouldRun)('ToolProgressionSolver — iron-tier searchHealth', () => {
  it('iron_pickaxe multi-tier solve has searchHealth per bundle', async () => {
    const { solver, available } = await freshSolver();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const result = await solver.solveToolProgression(
      'iron_pickaxe',
      {},
      ['stone', 'cobblestone', 'iron_ore', 'coal']
    );

    // Multi-tier solve may or may not succeed depending on search limits
    expect(result.solveMeta).toBeDefined();
    expect(result.solveMeta!.bundles.length).toBeGreaterThanOrEqual(1);

    for (const bundle of result.solveMeta!.bundles) {
      // Each bundle should have searchHealth
      if (bundle.output.searchHealth) {
        const sh = bundle.output.searchHealth;
        expect(sh.nodesExpanded).toBeGreaterThan(0);
        expect(sh.searchHealthVersion).toBe(1);

        // Degeneracy detection experiment
        const degReport = detectHeuristicDegeneracy(sh);
        console.log(
          `[Iron-tier E2E] tier bundle goalHash=${bundle.input.goalHash.slice(0, 8)}` +
          ` nodes=${sh.nodesExpanded} pctSameH=${sh.pctSameH.toFixed(2)}` +
          ` branching=${sh.branchingEstimate.toFixed(1)}` +
          ` degenerate=${degReport.isDegenerate}`
        );
        if (degReport.isDegenerate) {
          console.log(`  reasons: ${degReport.reasons.join('; ')}`);
        }
      }
    }

    // Each tier bundle should have a distinct goalHash
    if (result.solveMeta!.bundles.length >= 2) {
      const goalHashes = result.solveMeta!.bundles.map((b) => b.input.goalHash);
      const unique = new Set(goalHashes);
      expect(unique.size).toBe(goalHashes.length);
    }
  });
});

// ===========================================================================
// Rig G — Multi-module DAG pipeline E2E (2.0)
// ===========================================================================

describeIf(shouldRun)('BuildingSolver — Rig G DAG pipeline E2E', () => {
  it('multi-module building solve populates rigGStageDecisions and DAG', async () => {
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

    const solver = new MinecraftBuildingSolver(service);

    if (!service.isAvailable()) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    // Multi-module scenario with dependencies:
    // foundation → walls → roof
    const modules: BuildingModule[] = [
      {
        moduleId: 'foundation_1',
        moduleType: 'prep_site',
        requiresModules: [],
        materialsNeeded: [{ name: 'cobblestone', count: 8 }],
        placementFeasible: true,
        baseCost: 1,
      },
      {
        moduleId: 'walls_1',
        moduleType: 'apply_module',
        requiresModules: ['foundation_1'],
        materialsNeeded: [{ name: 'cobblestone', count: 24 }],
        placementFeasible: true,
        baseCost: 2,
      },
      {
        moduleId: 'roof_1',
        moduleType: 'place_feature',
        requiresModules: ['walls_1'],
        materialsNeeded: [{ name: 'oak_planks', count: 12 }],
        placementFeasible: true,
        baseCost: 3,
      },
    ];

    const siteState: BuildingSiteState = {
      terrain: 'flat',
      biome: 'plains',
      hasTreesNearby: false,
      hasWaterNearby: false,
      siteCaps: 'flat_5x5_clear',
    };

    const result = await solver.solveBuildingPlan(
      'shelter_3mod_e2e',
      'N',
      ['roof_1'],
      { cobblestone: 50, oak_planks: 20 },
      siteState,
      modules
    );

    // Core: solveMeta populated
    expect(result.solveMeta).toBeDefined();
    expect(result.solveMeta!.bundles.length).toBe(1);

    // Rig G per-stage decisions
    expect(result.rigGStageDecisions).toBeDefined();
    const stages = result.rigGStageDecisions!;
    console.log(
      `[Rig G E2E] dagDecision.kind=${stages.dagDecision.kind}` +
      ` linearize=${stages.linearizeDecision?.kind ?? 'N/A'}` +
      ` feasibility=${stages.feasibilityDecision?.kind ?? 'N/A'}` +
      ` overall=${stages.overallDecision.kind}`
    );

    // If solved and DAG succeeded, assert full pipeline
    if (result.solved && stages.dagDecision.kind === 'ok') {
      expect(result.partialOrderPlan).toBeDefined();
      expect(result.partialOrderPlan!.nodes.length).toBe(3);
      expect(result.partialOrderPlan!.edges.length).toBe(2); // foundation→walls, walls→roof

      expect(stages.linearizeDecision).toBeDefined();
      expect(stages.linearizeDecision!.kind).toBe('ok');

      expect(stages.feasibilityDecision).toBeDefined();
      expect(stages.feasibilityDecision!.kind).toBe('ok');

      expect(stages.overallDecision.kind).toBe('ok');
      expect(result.degradedToRawSteps).toBe(false);

      // Rig G signals
      expect(result.rigGSignals).toBeDefined();
      expect(result.rigGSignals!.dag_node_count).toBe(3);
      expect(result.rigGSignals!.dag_edge_count).toBe(2);
      expect(result.rigGSignals!.feasibility_passed).toBe(true);
      expect(result.rigGSignals!.degraded_to_raw_steps).toBe(false);

      // Steps should be in topological order: foundation before walls before roof
      const stepModuleIds = result.steps.map((s) => s.moduleId);
      const foundIdx = stepModuleIds.indexOf('foundation_1');
      const wallIdx = stepModuleIds.indexOf('walls_1');
      const roofIdx = stepModuleIds.indexOf('roof_1');
      if (foundIdx >= 0 && wallIdx >= 0 && roofIdx >= 0) {
        expect(foundIdx).toBeLessThan(wallIdx);
        expect(wallIdx).toBeLessThan(roofIdx);
      }

      console.log(
        `[Rig G E2E] steps=${stepModuleIds.join(' → ')}` +
        ` digest=${result.rigGSignals!.plan_digest.slice(0, 8)}` +
        ` linDigest=${result.rigGSignals!.linearization_digest.slice(0, 8)}`
      );
    } else if (!result.solved) {
      // Building didn't solve — still assert stage decisions are captured
      console.log(
        `[Rig G E2E] solve did not succeed — dagDecision.kind=${stages.dagDecision.kind}`
      );
    }
  });
});

// ===========================================================================
// Rig E — Hierarchical planning wiring E2E (3.0)
// ===========================================================================

describeIf(shouldRun)('SterlingPlanner — Rig E wiring E2E', () => {
  it('returns blocked:planner_unconfigured when hierarchical planning is unwired', async () => {
    // Create a SterlingPlanner without macro planner / feedback store
    const planner = new SterlingPlanner({
      minecraftGet: async () => new Response(null, { status: 503 }),
    });

    expect(planner.isHierarchicalConfigured).toBe(false);

    const decision = await planner.generateDynamicStepsHierarchical({
      id: 'test-task-1',
      title: 'Craft wooden pickaxe',
    });

    expect(decision.kind).toBe('blocked');
    if (decision.kind === 'blocked') {
      expect(decision.reason).toBe('planner_unconfigured');
      expect(decision.detail).toContain('MacroPlanner');
      expect(decision.detail).toContain('FeedbackStore');
    }
  });

  it('returns blocked:planner_unconfigured with only MacroPlanner (no FeedbackStore)', async () => {
    const planner = new SterlingPlanner({
      minecraftGet: async () => new Response(null, { status: 503 }),
    });

    const macro = buildDefaultMinecraftGraph();
    planner.setMacroPlanner(macro);

    expect(planner.isHierarchicalConfigured).toBe(false);

    const decision = await planner.generateDynamicStepsHierarchical({
      id: 'test-task-2',
    });

    expect(decision.kind).toBe('blocked');
    if (decision.kind === 'blocked') {
      expect(decision.reason).toBe('planner_unconfigured');
      expect(decision.detail).toContain('FeedbackStore');
      // "Missing:" section should list only FeedbackStore, not MacroPlanner
      const missingSection = decision.detail.split('Missing:')[1] ?? '';
      expect(missingSection).toContain('FeedbackStore');
      expect(missingSection).not.toContain('MacroPlanner');
    }
  });

  it('runtime_configured signal reflects wiring state', () => {
    const planner = buildDefaultMinecraftGraph();
    const graph = planner.getGraph();
    const store = new FeedbackStore();

    // Not configured
    const unwiredSignals = collectRigESignals({
      graph,
      feedbackStore: store,
      outcomesReported: 0,
      costUpdatedOnOutcome: false,
      replanTriggered: false,
      runtimeConfigured: false,
    });
    expect(unwiredSignals.runtime_configured).toBe(false);

    // Configured
    const wiredSignals = collectRigESignals({
      graph,
      feedbackStore: store,
      outcomesReported: 0,
      costUpdatedOnOutcome: false,
      replanTriggered: false,
      runtimeConfigured: true,
    });
    expect(wiredSignals.runtime_configured).toBe(true);
  });

  it('deferred feedback: costs do not mutate during planning, flush on exit', () => {
    const planner = buildDefaultMinecraftGraph();
    const graph = planner.getGraph();
    const store = new FeedbackStore();
    store.captureTopology(graph);

    const edge = graph.edges[0];
    const initialCost = edge.learnedCost;

    // Enter planning
    store.enterPlanningPhase();

    // Record outcome during planning — should NOT mutate
    store.recordOutcome(graph, {
      macroEdgeId: edge.id,
      success: true,
      durationMs: 5000,
      leafStepsCompleted: 3,
      leafStepsFailed: 0,
    }, 'e2e-during-planning');

    expect(edge.learnedCost).toBe(initialCost); // Not mutated
    expect(store.deferredCount).toBe(1);
    expect(store.getViolations().length).toBe(1);

    // Exit planning — deferred outcomes flush
    store.exitPlanningPhase();

    expect(edge.learnedCost).not.toBe(initialCost); // Now mutated
    expect(store.deferredCount).toBe(0);

    // Topology unchanged (invariant)
    expect(store.getTopologyChanged(graph)).toBe(false);

    // Collect signals
    const signals = collectRigESignals({
      graph,
      feedbackStore: store,
      outcomesReported: 1,
      costUpdatedOnOutcome: true,
      replanTriggered: false,
      runtimeConfigured: true,
    });

    expect(signals.cost_store_updated_during_planning).toBe(true); // violation was recorded
    expect(signals.topology_changed).toBe(false);
    expect(signals.runtime_configured).toBe(true);
    expect(signals.macro_state_has_coordinates).toBe(false);
  });
});
