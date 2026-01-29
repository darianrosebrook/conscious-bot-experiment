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
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
// Service lifecycle
// ---------------------------------------------------------------------------

let service: SterlingReasoningService;
let solver: MinecraftToolProgressionSolver;
let serviceAvailable = false;

beforeAll(async () => {
  if (!shouldRun) return;

  service = new SterlingReasoningService({
    url: STERLING_URL,
    enabled: true,
    solveTimeout: 30000,
    connectTimeout: 5000,
    maxReconnectAttempts: 1,
  });

  await service.initialize();

  // Give the connection a moment to establish
  await new Promise((r) => setTimeout(r, 1000));

  serviceAvailable = service.isAvailable();

  if (!serviceAvailable) {
    console.warn(
      '\n⚠️  Sterling server not reachable at ' + STERLING_URL + '.\n' +
      '   Solver-class E2E tests will be skipped.\n'
    );
  }

  solver = new MinecraftToolProgressionSolver(service);

  // Diagnostic: verify with the exact same rules the solver class would send
  if (serviceAvailable) {
    const { buildToolProgressionRules } = await import('../minecraft-tool-progression-rules');
    const { rules } = buildToolProgressionRules('wooden_pickaxe', 'pickaxe', null, 'wooden', []);

    // Test 1: raw solve with useLearning: false (like integration tests)
    const rawResult1 = await service.solve('minecraft', {
      command: 'solve',
      domain: 'minecraft',
      contractVersion: 1,
      executionMode: 'tool_progression',
      solverId: 'minecraft.tool_progression',
      inventory: {},
      goal: { wooden_pickaxe: 1 },
      rules,
      maxNodes: 5000,
      useLearning: false,
    });
    console.log('[E2E setup] Raw solve (learning=false):',
      'solutionFound:', rawResult1.solutionFound,
      'nodes:', rawResult1.discoveredNodes.length,
      'path:', rawResult1.solutionPath.length
    );

    // Test 2: same but useLearning: true (like the solver class does)
    const rawResult2 = await service.solve('minecraft', {
      command: 'solve',
      domain: 'minecraft',
      contractVersion: 1,
      executionMode: 'tool_progression',
      solverId: 'minecraft.tool_progression',
      inventory: {},
      goal: { wooden_pickaxe: 1 },
      rules,
      maxNodes: 5000,
      useLearning: true,
    });
    console.log('[E2E setup] Raw solve (learning=true):',
      'solutionFound:', rawResult2.solutionFound,
      'nodes:', rawResult2.discoveredNodes.length,
      'path:', rawResult2.solutionPath.length
    );

    // Allow any remaining backend messages to flush before test solves
    await new Promise(r => setTimeout(r, 500));
  }
});

afterAll(async () => {
  if (service) {
    service.destroy();
  }
});

// ===========================================================================
// Solver-class E2E: solveMeta evidence against live backend
// ===========================================================================

describeIf(shouldRun)('ToolProgressionSolver — solver-class E2E', () => {

  it('wooden_pickaxe solve populates solveMeta.bundles', async () => {
    if (!serviceAvailable) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    // Capture what the solver sends to Sterling + full result
    const originalSolve = service.solve.bind(service);
    vi.spyOn(service, 'solve').mockImplementation(async (domain, params, onStep) => {
      console.log('[E2E diagnostic] Solver sends domain:', domain);
      console.log('[E2E diagnostic] rules count:', (params?.rules as unknown[])?.length ?? 'no rules');
      console.log('[E2E diagnostic] goal:', JSON.stringify(params?.goal));
      const clientResult = await originalSolve(domain, params, onStep);
      console.log('[E2E diagnostic] Client result:',
        'solutionFound:', clientResult.solutionFound,
        'nodes:', clientResult.discoveredNodes.length,
        'path:', clientResult.solutionPath.length,
        'edges:', clientResult.searchEdges.length,
        'error:', clientResult.error,
        'durationMs:', clientResult.durationMs
      );
      return clientResult;
    });

    const result = await solver.solveToolProgression(
      'wooden_pickaxe',
      {},
      [] // wooden tier needs no nearbyBlocks
    );

    // Restore
    vi.restoreAllMocks();

    // Diagnostics: if the solve fails, log why before asserting
    if (!result.solved) {
      console.log('[E2E diagnostic] solved=false');
      console.log('  error:', result.error);
      console.log('  totalNodes:', result.totalNodes);
      console.log('  steps:', result.steps?.length);
      console.log('  solveMeta bundles:', result.solveMeta?.bundles?.length);
      if (result.solveMeta?.bundles?.[0]) {
        const b = result.solveMeta.bundles[0];
        console.log('  bundle.output.solved:', b.output.solved);
        console.log('  bundle.output.searchStats:', JSON.stringify(b.output.searchStats));
      }
    }

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
  });

  it('stepsDigest matches recomputed hash of returned steps', async () => {
    if (!serviceAvailable) {
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
    if (!serviceAvailable) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const result1 = await solver.solveToolProgression('wooden_pickaxe', {}, []);
    const result2 = await solver.solveToolProgression('wooden_pickaxe', {}, []);

    expect(result1.solved).toBe(true);
    expect(result2.solved).toBe(true);

    // If Sterling returns the same solution path, bundleHash should match.
    // If Sterling's learning causes different paths, the hashes will differ
    // — that's acceptable, but we still verify hashes are well-formed.
    expect(result1.solveMeta!.bundles[0].bundleHash).toMatch(/^[0-9a-f]{16}$/);
    expect(result2.solveMeta!.bundles[0].bundleHash).toMatch(/^[0-9a-f]{16}$/);

    // If same steps, same hash
    if (
      result1.solveMeta!.bundles[0].output.stepsDigest ===
      result2.solveMeta!.bundles[0].output.stepsDigest
    ) {
      expect(result1.solveMeta!.bundles[0].bundleHash)
        .toBe(result2.solveMeta!.bundles[0].bundleHash);
    }
  });
});
