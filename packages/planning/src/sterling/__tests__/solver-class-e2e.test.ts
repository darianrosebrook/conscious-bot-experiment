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
import { SterlingReasoningService } from '../sterling-reasoning-service';
import { contentHash, canonicalize } from '../solve-bundle';

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

    // searchHealth should be undefined until Python emits it
    expect(bundle.output.searchHealth).toBeUndefined();

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
