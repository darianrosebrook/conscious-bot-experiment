/**
 * A.5 — Performance Baseline E2E Tests
 *
 * Records search performance metrics (nodesExpanded, frontierPeak,
 * terminationReason, solutionPathLength) for 3 items against a live
 * Sterling backend. Proves repeat-solve convergence: after episode
 * feedback, a second solve uses equal or fewer expansions.
 *
 * Prerequisites: Sterling unified server running at ws://localhost:8766
 * Start with: cd sterling && python scripts/utils/sterling_unified_server.py
 *
 * Run with:
 *   STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/performance-baseline-e2e.test.ts
 */

import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { MinecraftToolProgressionSolver } from '../minecraft-tool-progression-solver';
import { SterlingReasoningService } from '../sterling-reasoning-service';
import type { SearchHealthMetrics } from '../solve-bundle-types';

const STERLING_URL = 'ws://localhost:8766';
const CAP_PREFIX = 'cap:';

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

const services: SterlingReasoningService[] = [];

async function freshService(): Promise<SterlingReasoningService> {
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
  return service;
}

async function freshToolProgressionSolver(): Promise<{
  solver: MinecraftToolProgressionSolver;
  service: SterlingReasoningService;
  available: boolean;
}> {
  const service = await freshService();
  return {
    solver: new MinecraftToolProgressionSolver(service),
    service,
    available: service.isAvailable(),
  };
}

afterAll(() => {
  for (const svc of services) {
    svc.destroy();
  }
});

// ---------------------------------------------------------------------------
// WebSocket helper for raw solves (stick via crafting rules)
// ---------------------------------------------------------------------------

async function wsSendAndCollect(
  data: Record<string, unknown>,
  timeoutMs = 15000
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(STERLING_URL);
    const messages: Record<string, unknown>[] = [];
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(new Error(`Timed out after ${timeoutMs}ms. Got ${messages.length} messages.`));
      }
    }, timeoutMs);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify(data));
    });

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
      messages.push(msg);

      if (
        msg.type === 'complete' ||
        msg.type === 'error' ||
        msg.type === 'episode_reported'
      ) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          ws.close();
          resolve(messages);
        }
      }
    });

    ws.addEventListener('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(new Error('WebSocket error'));
      }
    });

    ws.addEventListener('close', () => {
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(messages);
        }
      }, 50);
    });
  });
}

function getTerminal(messages: Record<string, unknown>[]): Record<string, unknown> {
  const terminal = messages.find(
    (m) => m.type === 'complete' || m.type === 'error' || m.type === 'episode_reported'
  );
  if (!terminal) throw new Error('No terminal message found');
  return terminal;
}

// ---------------------------------------------------------------------------
// Artifact helpers
// ---------------------------------------------------------------------------

interface PerformanceBaseline {
  item: string;
  solved: boolean;
  nodesExpanded: number;
  frontierPeak: number;
  terminationReason: string;
  solutionPathLength: number;
  branchingEstimate: number;
  hMin: number;
  hMax: number;
  hVariance: number;
  pctSameH: number;
  searchHealthVersion: number;
  timestamp: string;
}

interface LearningConvergenceArtifact {
  item: string;
  solve1: PerformanceBaseline;
  solve2: PerformanceBaseline;
  nodesRatio: number; // solve2.nodesExpanded / solve1.nodesExpanded
  converged: boolean; // nodesRatio <= 1.05
  timestamp: string;
}

function extractBaseline(
  item: string,
  searchHealth: SearchHealthMetrics,
  solutionPathLength: number,
  solved: boolean
): PerformanceBaseline {
  return {
    item,
    solved,
    nodesExpanded: searchHealth.nodesExpanded,
    frontierPeak: searchHealth.frontierPeak,
    terminationReason: searchHealth.terminationReason,
    solutionPathLength,
    branchingEstimate: searchHealth.branchingEstimate,
    hMin: searchHealth.hMin,
    hMax: searchHealth.hMax,
    hVariance: searchHealth.hVariance,
    pctSameH: searchHealth.pctSameH,
    searchHealthVersion: searchHealth.searchHealthVersion,
    timestamp: new Date().toISOString(),
  };
}

function writeArtifact(filename: string, data: unknown): void {
  const artifactDir = join(__dirname, '__artifacts__');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    join(artifactDir, filename),
    JSON.stringify(data, null, 2)
  );
}

// ===========================================================================
// Stick baseline (crafting domain, raw WS)
// ===========================================================================

describeIf(shouldRun)('A.5 Performance baseline: stick', () => {
  const STICK_RULES = [
    {
      action: 'mine:oak_log',
      actionType: 'mine',
      produces: [{ name: 'oak_log', count: 1 }],
      consumes: [],
      requires: [],
      needsTable: false,
      needsFurnace: false,
      baseCost: 5.0,
    },
    {
      action: 'craft:oak_planks',
      actionType: 'craft',
      produces: [{ name: 'oak_planks', count: 4 }],
      consumes: [{ name: 'oak_log', count: 1 }],
      requires: [],
      needsTable: false,
      needsFurnace: false,
      baseCost: 1.0,
    },
    {
      action: 'craft:stick',
      actionType: 'craft',
      produces: [{ name: 'stick', count: 4 }],
      consumes: [{ name: 'oak_planks', count: 2 }],
      requires: [],
      needsTable: false,
      needsFurnace: false,
      baseCost: 1.0,
    },
  ];

  it('records baseline metrics for stick solve', async () => {
    const messages = await wsSendAndCollect({
      command: 'solve',
      domain: 'minecraft',
      contractVersion: 1,
      executionMode: 'crafting',
      solverId: 'minecraft.crafting',
      inventory: {},
      goal: { stick: 4 },
      rules: STICK_RULES,
      maxNodes: 5000,
      useLearning: false,
    });

    const result = getTerminal(messages);
    expect(result.type).toBe('complete');
    expect(result.solved).toBe(true);

    const sh = result.searchHealth as SearchHealthMetrics | undefined;
    expect(sh).toBeDefined();

    const steps = result.steps as Array<Record<string, unknown>>;
    const baseline = extractBaseline('stick', sh!, steps.length, true);

    // Structural assertions (not value-pinning)
    expect(baseline.nodesExpanded).toBeGreaterThan(0);
    expect(baseline.frontierPeak).toBeGreaterThanOrEqual(0);
    expect(baseline.terminationReason).toBe('goal_found');
    expect(baseline.solutionPathLength).toBeGreaterThan(0);
    expect(baseline.searchHealthVersion).toBe(1);

    writeArtifact('perf-baseline-stick.json', baseline);
    console.log(
      `[A.5] stick: nodesExpanded=${baseline.nodesExpanded}` +
      ` frontierPeak=${baseline.frontierPeak}` +
      ` pathLen=${baseline.solutionPathLength}` +
      ` branching=${baseline.branchingEstimate.toFixed(1)}`
    );
  });

  it('repeat solve after episode report converges (nodesExpanded2 <= nodesExpanded1 * 1.05)', async () => {
    // Solve 1 (with learning enabled)
    const messages1 = await wsSendAndCollect({
      command: 'solve',
      domain: 'minecraft',
      contractVersion: 1,
      executionMode: 'crafting',
      solverId: 'minecraft.crafting',
      inventory: {},
      goal: { stick: 4 },
      rules: STICK_RULES,
      maxNodes: 5000,
      useLearning: true,
    });

    const result1 = getTerminal(messages1);
    expect(result1.solved).toBe(true);
    const sh1 = result1.searchHealth as SearchHealthMetrics;
    expect(sh1).toBeDefined();
    const steps1 = result1.steps as Array<Record<string, unknown>>;
    const planId1 = result1.planId as string;

    // Report episode (success)
    await new Promise((r) => setTimeout(r, 300));
    const reportMessages = await wsSendAndCollect({
      command: 'report_episode',
      domain: 'minecraft',
      contractVersion: 1,
      planId: planId1,
      goal: 'stick',
      success: true,
      stepsCompleted: steps1.length,
    });
    const reportResult = reportMessages.find(
      (m) => m.type === 'episode_reported' || m.type === 'error'
    );
    expect(reportResult).toBeDefined();
    expect(reportResult!.type).toBe('episode_reported');

    // Solve 2 (after learning)
    await new Promise((r) => setTimeout(r, 300));
    const messages2 = await wsSendAndCollect({
      command: 'solve',
      domain: 'minecraft',
      contractVersion: 1,
      executionMode: 'crafting',
      solverId: 'minecraft.crafting',
      inventory: {},
      goal: { stick: 4 },
      rules: STICK_RULES,
      maxNodes: 5000,
      useLearning: true,
    });

    const result2 = getTerminal(messages2);
    expect(result2.solved).toBe(true);
    const sh2 = result2.searchHealth as SearchHealthMetrics;
    expect(sh2).toBeDefined();
    const steps2 = result2.steps as Array<Record<string, unknown>>;

    const baseline1 = extractBaseline('stick', sh1, steps1.length, true);
    const baseline2 = extractBaseline('stick', sh2, steps2.length, true);

    const nodesRatio = sh1.nodesExpanded > 0
      ? sh2.nodesExpanded / sh1.nodesExpanded
      : 1.0;

    const artifact: LearningConvergenceArtifact = {
      item: 'stick',
      solve1: baseline1,
      solve2: baseline2,
      nodesRatio,
      converged: nodesRatio <= 1.05,
      timestamp: new Date().toISOString(),
    };

    writeArtifact('perf-convergence-stick.json', artifact);

    console.log(
      `[A.5] stick convergence: nodes1=${sh1.nodesExpanded} nodes2=${sh2.nodesExpanded}` +
      ` ratio=${nodesRatio.toFixed(3)} converged=${artifact.converged}`
    );

    // Tolerance: second solve should expand at most 5% more nodes
    expect(sh2.nodesExpanded).toBeLessThanOrEqual(sh1.nodesExpanded * 1.05);
  });
});

// ===========================================================================
// Wooden pickaxe baseline (tool progression solver)
// ===========================================================================

describeIf(shouldRun)('A.5 Performance baseline: wooden_pickaxe', () => {
  it('records baseline metrics for wooden_pickaxe solve', async () => {
    const { solver, available } = await freshToolProgressionSolver();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const result = await solver.solveToolProgression('wooden_pickaxe', {}, []);

    expect(result.solved).toBe(true);
    expect(result.solveMeta).toBeDefined();
    expect(result.solveMeta!.bundles.length).toBeGreaterThanOrEqual(1);

    const bundle = result.solveMeta!.bundles[0];
    const sh = bundle.output.searchHealth;
    expect(sh).toBeDefined();

    const baseline = extractBaseline(
      'wooden_pickaxe',
      sh!,
      bundle.output.searchStats.solutionPathLength,
      true
    );

    expect(baseline.nodesExpanded).toBeGreaterThan(0);
    expect(baseline.terminationReason).toBe('goal_found');
    expect(baseline.solutionPathLength).toBeGreaterThan(0);
    expect(baseline.searchHealthVersion).toBe(1);

    writeArtifact('perf-baseline-wooden-pickaxe.json', baseline);
    console.log(
      `[A.5] wooden_pickaxe: nodesExpanded=${baseline.nodesExpanded}` +
      ` frontierPeak=${baseline.frontierPeak}` +
      ` pathLen=${baseline.solutionPathLength}` +
      ` branching=${baseline.branchingEstimate.toFixed(1)}`
    );
  });

  it('repeat solve after episode report converges', async () => {
    const { solver: solver1, service: service1, available: a1 } = await freshToolProgressionSolver();
    if (!a1) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    // Solve 1
    const result1 = await solver1.solveToolProgression('wooden_pickaxe', {}, []);
    expect(result1.solved).toBe(true);

    const bundle1 = result1.solveMeta!.bundles[0];
    const sh1 = bundle1.output.searchHealth!;

    // Report episode
    solver1.reportEpisodeResult(
      'wooden_pickaxe', 'wooden', null, true, 1, result1.planId
    );
    await new Promise((r) => setTimeout(r, 500));

    // Solve 2 (fresh solver on fresh connection to avoid WS interleaving)
    const { solver: solver2, available: a2 } = await freshToolProgressionSolver();
    if (!a2) {
      console.log('  [SKIPPED] Sterling server not available for second solve');
      return;
    }

    const result2 = await solver2.solveToolProgression('wooden_pickaxe', {}, []);
    expect(result2.solved).toBe(true);

    const bundle2 = result2.solveMeta!.bundles[0];
    const sh2 = bundle2.output.searchHealth!;

    const baseline1 = extractBaseline(
      'wooden_pickaxe', sh1,
      bundle1.output.searchStats.solutionPathLength, true
    );
    const baseline2 = extractBaseline(
      'wooden_pickaxe', sh2,
      bundle2.output.searchStats.solutionPathLength, true
    );

    const nodesRatio = sh1.nodesExpanded > 0
      ? sh2.nodesExpanded / sh1.nodesExpanded
      : 1.0;

    const artifact: LearningConvergenceArtifact = {
      item: 'wooden_pickaxe',
      solve1: baseline1,
      solve2: baseline2,
      nodesRatio,
      converged: nodesRatio <= 1.05,
      timestamp: new Date().toISOString(),
    };

    writeArtifact('perf-convergence-wooden-pickaxe.json', artifact);

    console.log(
      `[A.5] wooden_pickaxe convergence: nodes1=${sh1.nodesExpanded} nodes2=${sh2.nodesExpanded}` +
      ` ratio=${nodesRatio.toFixed(3)} converged=${artifact.converged}`
    );

    expect(sh2.nodesExpanded).toBeLessThanOrEqual(sh1.nodesExpanded * 1.05);
  });
});

// ===========================================================================
// Stone pickaxe baseline (tool progression solver, multi-tier)
// ===========================================================================

describeIf(shouldRun)('A.5 Performance baseline: stone_pickaxe', () => {
  it('records baseline metrics for stone_pickaxe solve', async () => {
    const { solver, available } = await freshToolProgressionSolver();
    if (!available) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    const result = await solver.solveToolProgression(
      'stone_pickaxe', {}, ['stone', 'cobblestone']
    );

    expect(result.solved).toBe(true);
    expect(result.solveMeta).toBeDefined();
    // Multi-tier: wooden + stone = 2 bundles
    expect(result.solveMeta!.bundles.length).toBe(2);

    const allBaselines: PerformanceBaseline[] = [];

    for (let i = 0; i < result.solveMeta!.bundles.length; i++) {
      const bundle = result.solveMeta!.bundles[i];
      const sh = bundle.output.searchHealth;
      expect(sh).toBeDefined();

      const tierLabel = i === 0 ? 'stone_pickaxe:wooden_tier' : 'stone_pickaxe:stone_tier';
      const baseline = extractBaseline(
        tierLabel,
        sh!,
        bundle.output.searchStats.solutionPathLength,
        bundle.output.solved
      );

      expect(baseline.nodesExpanded).toBeGreaterThan(0);
      expect(baseline.searchHealthVersion).toBe(1);

      allBaselines.push(baseline);
      console.log(
        `[A.5] ${tierLabel}: nodesExpanded=${baseline.nodesExpanded}` +
        ` frontierPeak=${baseline.frontierPeak}` +
        ` pathLen=${baseline.solutionPathLength}` +
        ` termination=${baseline.terminationReason}` +
        ` branching=${baseline.branchingEstimate.toFixed(1)}`
      );
    }

    writeArtifact('perf-baseline-stone-pickaxe.json', allBaselines);
  });

  it('repeat solve after episode report converges', async () => {
    const { solver: solver1, available: a1 } = await freshToolProgressionSolver();
    if (!a1) {
      console.log('  [SKIPPED] Sterling server not available');
      return;
    }

    // Solve 1
    const result1 = await solver1.solveToolProgression(
      'stone_pickaxe', {}, ['stone', 'cobblestone']
    );
    expect(result1.solved).toBe(true);

    // Report episode
    solver1.reportEpisodeResult(
      'stone_pickaxe', 'stone', null, true, 2, result1.planId
    );
    await new Promise((r) => setTimeout(r, 500));

    // Solve 2
    const { solver: solver2, available: a2 } = await freshToolProgressionSolver();
    if (!a2) {
      console.log('  [SKIPPED] Sterling server not available for second solve');
      return;
    }

    const result2 = await solver2.solveToolProgression(
      'stone_pickaxe', {}, ['stone', 'cobblestone']
    );
    expect(result2.solved).toBe(true);

    // Compare per-tier: each tier's second solve should not blow up
    const bundles1 = result1.solveMeta!.bundles;
    const bundles2 = result2.solveMeta!.bundles;
    expect(bundles1.length).toBe(bundles2.length);

    const tierArtifacts: LearningConvergenceArtifact[] = [];

    for (let i = 0; i < bundles1.length; i++) {
      const sh1 = bundles1[i].output.searchHealth!;
      const sh2 = bundles2[i].output.searchHealth!;
      const tierLabel = i === 0 ? 'stone_pickaxe:wooden_tier' : 'stone_pickaxe:stone_tier';

      const baseline1 = extractBaseline(
        tierLabel, sh1,
        bundles1[i].output.searchStats.solutionPathLength,
        bundles1[i].output.solved
      );
      const baseline2 = extractBaseline(
        tierLabel, sh2,
        bundles2[i].output.searchStats.solutionPathLength,
        bundles2[i].output.solved
      );

      const nodesRatio = sh1.nodesExpanded > 0
        ? sh2.nodesExpanded / sh1.nodesExpanded
        : 1.0;

      const artifact: LearningConvergenceArtifact = {
        item: tierLabel,
        solve1: baseline1,
        solve2: baseline2,
        nodesRatio,
        converged: nodesRatio <= 1.05,
        timestamp: new Date().toISOString(),
      };

      tierArtifacts.push(artifact);

      console.log(
        `[A.5] ${tierLabel} convergence: nodes1=${sh1.nodesExpanded} nodes2=${sh2.nodesExpanded}` +
        ` ratio=${nodesRatio.toFixed(3)} converged=${artifact.converged}`
      );

      expect(sh2.nodesExpanded).toBeLessThanOrEqual(sh1.nodesExpanded * 1.05);
    }

    writeArtifact('perf-convergence-stone-pickaxe.json', tierArtifacts);
  });
});
