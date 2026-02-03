/**
 * Completeness Declaration E2E Tests (Phase 2C)
 *
 * Gated behind STERLING_E2E=1 — requires a running Sterling server.
 *
 * Proves:
 * - completenessDeclaration is present in sterlingIdentity after a solve
 * - completenessDeclaration has D7 versioning (completenessVersion=1, kind=structural)
 * - completenessDeclaration is NOT included in bundleHash
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SterlingReasoningService } from '../sterling-reasoning-service';
import { MinecraftCraftingSolver } from '../minecraft-crafting-solver';
import { parseSterlingIdentity, createSolveBundle, computeBundleInput, computeBundleOutput } from '../solve-bundle';

const describeIf = (condition: boolean) =>
  condition ? describe : describe.skip;

const IS_E2E = process.env.STERLING_E2E === '1';

describeIf(IS_E2E)('completeness-declaration-e2e', () => {
  let service: SterlingReasoningService;

  beforeAll(async () => {
    service = new SterlingReasoningService({
      url: process.env.STERLING_WS_URL || 'ws://localhost:8765',
    });
    await service.initialize();
  });

  afterAll(() => {
    service?.destroy();
  });

  // #1: Successful solve: completenessDeclaration present in sterlingIdentity
  it('completenessDeclaration present in sterlingIdentity after solve', async () => {
    // Minimal crafting solve — just need to check metrics
    const result = await service.solve('minecraft', {
      contractVersion: 1,
      solverId: 'minecraft.crafting',
      inventory: { oak_log: 1 },
      goal: { oak_planks: 4 },
      nearbyBlocks: [],
      rules: [
        {
          action: 'craft:oak_planks',
          actionType: 'craft',
          produces: [{ name: 'oak_planks', count: 4 }],
          consumes: [{ name: 'oak_log', count: 1 }],
        },
      ],
      maxNodes: 100,
      useLearning: false,
    });

    const identity = parseSterlingIdentity(result.metrics);
    expect(identity).toBeDefined();
    expect(identity!.completenessDeclaration).toBeDefined();
  });

  // #2: completenessDeclaration has D7 versioning
  it('completenessDeclaration has completenessVersion=1 and kind=structural', async () => {
    const result = await service.solve('minecraft', {
      contractVersion: 1,
      solverId: 'minecraft.crafting',
      inventory: { oak_log: 1 },
      goal: { oak_planks: 4 },
      nearbyBlocks: [],
      rules: [
        {
          action: 'craft:oak_planks',
          actionType: 'craft',
          produces: [{ name: 'oak_planks', count: 4 }],
          consumes: [{ name: 'oak_log', count: 1 }],
        },
      ],
      maxNodes: 100,
      useLearning: false,
    });

    const identity = parseSterlingIdentity(result.metrics);
    const decl = identity?.completenessDeclaration;
    expect(decl).toBeDefined();
    expect(decl!.completenessVersion).toBe(1);
    expect(decl!.kind).toBe('structural');
    // isProofReady should be false until Phase 3
    expect(decl!.isProofReady).toBe(false);
    expect(Array.isArray(decl!.proofMissingReasons)).toBe(true);
  });

  // #3: completenessDeclaration NOT included in bundleHash
  it('completenessDeclaration NOT included in bundleHash', () => {
    // This is a unit-level proof: sterlingIdentity (which contains completenessDeclaration)
    // is excluded from hashableBundlePayload.
    const input = computeBundleInput({
      solverId: 'minecraft.crafting',
      contractVersion: 1,
      definitions: [{ action: 'test' }],
      inventory: { a: 1 },
      goal: { b: 1 },
      nearbyBlocks: [],
    });
    const output = computeBundleOutput({
      planId: 'plan-1',
      solved: true,
      steps: [{ action: 'test' }],
      totalNodes: 10,
      durationMs: 50,
      solutionPathLength: 1,
    });
    const compat = { valid: true, issues: [], checkedAt: Date.now(), definitionCount: 1 };

    // Bundle WITHOUT sterlingIdentity
    const bundle1 = createSolveBundle(input, output, compat);

    // Attach sterlingIdentity with completenessDeclaration
    const outputWithIdentity = {
      ...output,
      sterlingIdentity: {
        traceBundleHash: 'abc123',
        completenessDeclaration: {
          completenessVersion: 1,
          kind: 'structural',
          edgesComplete: true,
        },
      },
    };
    // createSolveBundle excludes sterlingIdentity from hash
    const bundle2 = createSolveBundle(input, outputWithIdentity, compat);

    // bundleHash must be identical
    expect(bundle1.bundleHash).toBe(bundle2.bundleHash);
  });
});
