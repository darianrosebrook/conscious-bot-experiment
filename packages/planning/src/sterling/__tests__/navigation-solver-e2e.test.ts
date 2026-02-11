/**
 * Navigation solver end-to-end test against a live Sterling backend.
 *
 * Instantiates the actual MinecraftNavigationSolver class and validates:
 *  - R2: solveMeta.bundles is populated with correct shape after a real solve
 *  - Contamination regression: sequential solves with different grids produce
 *    different paths (kg.states.clear() must work correctly)
 *  - Declaration certification: navigation solver registers its declaration,
 *    solve succeeds, and registry contains the declaration by digest.
 *
 * Prerequisites: Sterling unified server running at ws://localhost:8766
 * Start with: cd sterling && python scripts/utils/sterling_unified_server.py
 *
 * Run with:
 *   STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/navigation-solver-e2e.test.ts
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MinecraftNavigationSolver } from '../minecraft-navigation-solver';
import { SterlingReasoningService } from '../sterling-reasoning-service';
import { contentHash, canonicalize } from '../solve-bundle';
import {
  BLOCK_TYPE,
  DEFAULT_HAZARD_POLICY,
  computeHazardPolicyId,
  type OccupancyGrid,
  type NavigationSolveResult,
} from '../minecraft-navigation-types';
import {
  computeDeclarationDigest,
  type DomainDeclarationV1,
} from '../domain-declaration';

const STERLING_URL = 'ws://localhost:8766';

// ---------------------------------------------------------------------------
// Environment gate
// ---------------------------------------------------------------------------

const shouldRun = process.env.STERLING_E2E === '1';

function describeIf(condition: boolean) {
  return condition ? describe : describe.skip;
}

// ---------------------------------------------------------------------------
// Fresh connection per test (same pattern as solver-class-e2e.test.ts)
// ---------------------------------------------------------------------------

const services: SterlingReasoningService[] = [];

async function freshSolver(): Promise<{
  solver: MinecraftNavigationSolver;
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
    solver: new MinecraftNavigationSolver(service),
    available: service.isAvailable(),
  };
}

afterAll(() => {
  for (const svc of services) {
    svc.destroy();
  }
});

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

/**
 * Compute grid index in X→Y→Z row-major order.
 * index = ((x * dy) + y) * dz + z
 */
function gridIndex(dy: number, dz: number, x: number, y: number, z: number): number {
  return ((x * dy) + y) * dz + z;
}

/**
 * Build a flat terrain occupancy grid: solid floor at local y=0, air above.
 */
function makeFlatGrid(opts: {
  origin: { x: number; y: number; z: number };
  size: { dx: number; dy: number; dz: number };
}): OccupancyGrid {
  const { origin, size } = opts;
  const { dx, dy, dz } = size;

  const blocks = new Uint8Array(dx * dy * dz); // all air by default
  for (let x = 0; x < dx; x++) {
    for (let z = 0; z < dz; z++) {
      blocks[gridIndex(dy, dz, x, 0, z)] = BLOCK_TYPE.SOLID;
    }
  }

  return { origin, size, blocks };
}

/**
 * Set a block at local coordinates in a grid.
 */
function setBlock(
  grid: OccupancyGrid,
  local: { x: number; y: number; z: number },
  blockType: number,
): void {
  const { dy, dz } = grid.size;
  grid.blocks[gridIndex(dy, dz, local.x, local.y, local.z)] = blockType;
}

/**
 * Check if a solve result's path visits a given world coordinate.
 */
function pathVisits(
  res: NavigationSolveResult,
  p: { x: number; y: number; z: number },
): boolean {
  // Check pathPositions (which is primitives.map(p => p.to))
  if (res.pathPositions.some((q) => q.x === p.x && q.y === p.y && q.z === p.z)) {
    return true;
  }
  // Also check the "from" of the first primitive (the start position)
  if (res.primitives.length > 0) {
    const s = res.primitives[0].from;
    if (s.x === p.x && s.y === p.y && s.z === p.z) return true;
  }
  return false;
}

/**
 * Build a default hazard policy with computed ID.
 */
function buildPolicy() {
  const policy = { ...DEFAULT_HAZARD_POLICY };
  policy.hazardPolicyId = computeHazardPolicyId(policy);
  return policy;
}

// ===========================================================================
// R2: Navigation solver E2E — solveMeta evidence against live backend
// ===========================================================================

describeIf(shouldRun)('NavigationSolver — solver-class E2E', () => {
  it('R2: flat grid solve returns coherent primitives and populates solveMeta.bundles', async () => {
    const { solver, available } = await freshSolver();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    // 10x3x5 flat grid: solid floor, 2 layers of air
    const grid = makeFlatGrid({
      origin: { x: 0, y: 0, z: 0 },
      size: { dx: 10, dy: 3, dz: 5 },
    });

    const start = { x: 0, y: 1, z: 2 };
    const goal = { x: 9, y: 1, z: 2 };

    const res = await solver.solveNavigation(
      start, goal, grid, 1, 0, buildPolicy(), { maxNodes: 10000, useLearning: false },
    );

    // -- Solve succeeded --
    expect(res.solved).toBe(true);
    expect(res.primitives.length).toBeGreaterThan(0);
    expect(res.pathPositions.length).toBeGreaterThan(0);

    // -- Primitive chain connectivity --
    for (let i = 1; i < res.primitives.length; i++) {
      const prev = res.primitives[i - 1].to;
      const curr = res.primitives[i].from;
      expect(prev).toEqual(curr);
    }

    // -- Start and goal in path --
    expect(res.primitives[0].from).toEqual(start);
    const lastTo = res.primitives[res.primitives.length - 1].to;
    // Goal metric contract: max(|dx|,|dz|) <= toleranceXZ && |dy| <= toleranceY
    // With toleranceXZ=1, the solver may stop 1 block short of the exact goal.
    expect(Math.max(Math.abs(lastTo.x - goal.x), Math.abs(lastTo.z - goal.z))).toBeLessThanOrEqual(1);
    expect(Math.abs(lastTo.y - goal.y)).toBeLessThanOrEqual(0);

    // -- All primitives have valid actionType --
    for (const p of res.primitives) {
      expect(['walk', 'jump_up', 'descend']).toContain(p.actionType);
      expect(p.action).toMatch(/^(walk|jump_up|descend)_(north|south|east|west)$/);
    }

    // -- Flat grid should only produce walk primitives --
    for (const p of res.primitives) {
      expect(p.actionType).toBe('walk');
    }

    // -- solveMeta bundles (R2 core evidence) --
    expect(res.solveMeta).toBeDefined();
    expect(res.solveMeta!.bundles.length).toBe(1);

    const bundle = res.solveMeta!.bundles[0];

    // Input hashes
    expect(bundle.input.solverId).toBe('minecraft.navigation');
    expect(bundle.input.definitionHash).toMatch(/^[0-9a-f]{16}$/); // grid hash
    expect(bundle.input.initialStateHash).toMatch(/^[0-9a-f]{16}$/); // start hash
    expect(bundle.input.goalHash).toMatch(/^[0-9a-f]{16}$/);

    // Output
    expect(bundle.output.solved).toBe(true);
    expect(bundle.output.stepsDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.output.searchStats.totalNodes).toBeGreaterThan(0);
    expect(bundle.output.searchStats.durationMs).toBeGreaterThanOrEqual(0);
    expect(bundle.output.searchStats.solutionPathLength).toBeGreaterThan(0);

    // Compat report (navigation has no rule-level linting)
    expect(bundle.compatReport.valid).toBe(true);
    expect(bundle.compatReport.issues).toEqual([]);

    // Content-addressed bundleId
    expect(bundle.bundleId).toMatch(/^minecraft\.navigation:[0-9a-f]{16}$/);

    // -- stepsDigest matches recomputed hash --
    // hashSteps() hashes canonicalize(steps.map(s => s.action)) — an array of
    // action strings, not an array of objects.
    const actionStrings = res.primitives.map((p) => p.action);
    const recomputedDigest = contentHash(canonicalize(actionStrings));
    expect(bundle.output.stepsDigest).toBe(recomputedDigest);

    // -- Edge cost: known limitation --
    // Python emits cost on solution_path messages, but SterlingSolutionEdge
    // doesn't carry it (dropped in sterling-client.ts). All costs fall back
    // to 1.0 via (edge as any).cost ?? 1.0. This is acceptable until A2
    // (edge cost propagation) is implemented.
    for (const p of res.primitives) {
      expect(p.cost).toBe(1.0);
    }

    // Export bundle artifact for inspection
    const artifactDir = join(__dirname, '__artifacts__');
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, 'e2e-navigation-flat-bundle.json'),
      JSON.stringify(bundle, null, 2),
    );
  });

  it('regression: sequential solves must not reuse stale grid semantics', async () => {
    // This test validates the kg.states.clear() fix for cross-solve
    // contamination. Two solves use the same coordinate space but different
    // grids. A contaminated solver would route solve 2 through the sentinel
    // coordinate that is now solid.
    const { solver, available } = await freshSolver();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const policy = buildPolicy();
    const solveOpts = { maxNodes: 10000, useLearning: false };

    // -- Solve 1: open corridor, straight path through sentinel --
    const grid1 = makeFlatGrid({
      origin: { x: 0, y: 0, z: 0 },
      size: { dx: 10, dy: 3, dz: 5 },
    });

    const start = { x: 0, y: 1, z: 2 };
    const goal = { x: 9, y: 1, z: 2 };
    const sentinel = { x: 4, y: 1, z: 2 };

    const r1 = await solver.solveNavigation(
      start, goal, grid1, 1, 0, policy, solveOpts,
    );

    expect(r1.solved).toBe(true);
    expect(pathVisits(r1, sentinel)).toBe(true);

    // -- Solve 2: sentinel is SOLID (feet + head), solver must detour --
    const grid2 = makeFlatGrid({
      origin: { x: 0, y: 0, z: 0 },
      size: { dx: 10, dy: 3, dz: 5 },
    });
    // Block sentinel at feet (y=1) and head (y=2)
    setBlock(grid2, { x: 4, y: 1, z: 2 }, BLOCK_TYPE.SOLID);
    setBlock(grid2, { x: 4, y: 2, z: 2 }, BLOCK_TYPE.SOLID);

    const r2 = await solver.solveNavigation(
      start, goal, grid2, 1, 0, policy, solveOpts,
    );

    expect(r2.solved).toBe(true);
    // Sentinel must NOT appear in solve 2's path
    expect(pathVisits(r2, sentinel)).toBe(false);

    // Solver must have detoured off the center lane (z !== 2 somewhere)
    const allPositions = [
      ...(r2.primitives.length > 0 ? [r2.primitives[0].from] : []),
      ...r2.pathPositions,
    ];
    const detoured = allPositions.some((p) => p.z !== 2);
    expect(detoured).toBe(true);
  });

  it('two identical solves produce matching input hashes', async () => {
    const { solver: solver1, available: a1 } = await freshSolver();
    const { solver: solver2, available: a2 } = await freshSolver();

    if (!a1 || !a2) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const grid = makeFlatGrid({
      origin: { x: 0, y: 0, z: 0 },
      size: { dx: 8, dy: 3, dz: 4 },
    });
    const start = { x: 0, y: 1, z: 1 };
    const goal = { x: 7, y: 1, z: 1 };
    const policy = buildPolicy();
    const opts = { maxNodes: 10000, useLearning: false };

    const r1 = await solver1.solveNavigation(start, goal, grid, 1, 0, policy, opts);
    const r2 = await solver2.solveNavigation(start, goal, grid, 1, 0, policy, opts);

    expect(r1.solved).toBe(true);
    expect(r2.solved).toBe(true);

    // Input hashes must be deterministic for same inputs
    const b1 = r1.solveMeta!.bundles[0].input;
    const b2 = r2.solveMeta!.bundles[0].input;

    expect(b1.definitionHash).toBe(b2.definitionHash);
    expect(b1.initialStateHash).toBe(b2.initialStateHash);
    expect(b1.goalHash).toBe(b2.goalHash);

    // NOTE: bundleHash equality is NOT asserted — live solves have
    // nondeterministic output fields (durationMs, planId). Deterministic
    // bundle ID invariant is proven by unit-level tests instead.
  });

  // =========================================================================
  // Declaration certification: navigation solver registers its claim,
  // solve succeeds, and registry contains the declaration by digest.
  // =========================================================================

  it('declaration certification: register → solve → verify registry', async () => {
    const { solver, available } = await freshSolver();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    // 1. Define the navigation solver's declaration
    const navDeclaration: DomainDeclarationV1 = {
      declarationVersion: 1,
      solverId: 'minecraft.navigation',
      contractVersion: 1,
      implementsPrimitives: ['ST-P01'],
      consumesFields: [
        'occupancyGrid',
        'start',
        'goal',
        'toleranceXZ',
        'toleranceY',
        'hazardPolicy',
        'maxNodes',
      ],
      producesFields: [
        'primitives',
        'pathPositions',
        'planId',
        'solveMeta',
      ],
      notes: 'Grid-based A* navigation solver. Phase 1: 4-cardinal walk/jump/descend.',
    };

    const expectedDigest = computeDeclarationDigest(navDeclaration);

    // 2. Register declaration — proves TS and Python agree on digest
    // Access the service from the solver's internal reference
    const service = (solver as any).sterlingService as SterlingReasoningService;
    const regResult = await service.registerDomainDeclaration(
      navDeclaration as unknown as Record<string, unknown>,
    );

    expect(regResult.success).toBe(true);
    expect(regResult.digest).toBe(expectedDigest);

    // 3. Solve a navigation problem — proves the solver works independently
    const grid = makeFlatGrid({
      origin: { x: 0, y: 0, z: 0 },
      size: { dx: 8, dy: 3, dz: 4 },
    });
    const start = { x: 0, y: 1, z: 1 };
    const goal = { x: 7, y: 1, z: 1 };
    const policy = buildPolicy();

    const solveResult = await solver.solveNavigation(
      start, goal, grid, 1, 0, policy, { maxNodes: 10000, useLearning: false },
    );

    expect(solveResult.solved).toBe(true);
    expect(solveResult.solveMeta).toBeDefined();
    expect(solveResult.solveMeta!.bundles.length).toBe(1);

    const bundle = solveResult.solveMeta!.bundles[0];
    expect(bundle.input.solverId).toBe('minecraft.navigation');
    expect(bundle.output.solved).toBe(true);

    // 4. Verify registry still contains the declaration by digest
    const getResult = await service.getDomainDeclaration(expectedDigest);

    expect(getResult.found).toBe(true);
    expect(getResult.digest).toBe(expectedDigest);
    expect(getResult.declaration).toBeDefined();

    // Retrieved declaration matches what we registered
    const retrieved = getResult.declaration!;
    expect(retrieved.solverId).toBe('minecraft.navigation');
    expect(retrieved.implementsPrimitives).toEqual(['ST-P01']);
    expect(retrieved.consumesFields).toEqual(navDeclaration.consumesFields);
    expect(retrieved.producesFields).toEqual(navDeclaration.producesFields);

    // 5. Verify declaration plumbing is orthogonal to solve plumbing:
    //    the solve result has no contamination from declaration ops
    expect(bundle.input.definitionHash).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.input.initialStateHash).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.input.goalHash).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.output.stepsDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.compatReport.valid).toBe(true);
  });
});
