/**
 * Tests for solve-bundle.ts
 *
 * Validates canonicalization contract, content-hash determinism,
 * definition hashing, bundle computation, and content-addressed identity.
 */

import { describe, it, expect } from 'vitest';
import {
  canonicalize,
  contentHash,
  CanonicalizeError,
  hashDefinition,
  hashInventoryState,
  hashGoal,
  hashNearbyBlocks,
  hashSteps,
  computeBundleInput,
  computeBundleOutput,
  createSolveBundle,
  INVENTORY_HASH_CAP,
} from '../solve-bundle';
import type { CompatReport, ObjectiveWeights, SearchHealthMetrics } from '../solve-bundle-types';
import { DEFAULT_OBJECTIVE_WEIGHTS } from '../solve-bundle-types';

// ============================================================================
// canonicalize
// ============================================================================

describe('canonicalize', () => {
  it('sorts object keys lexicographically', () => {
    const result = canonicalize({ z: 1, a: 2, m: 3 });
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  it('sorts nested object keys', () => {
    const result = canonicalize({ b: { z: 1, a: 2 }, a: 1 });
    expect(result).toBe('{"a":1,"b":{"a":2,"z":1}}');
  });

  it('preserves array insertion order', () => {
    const result = canonicalize([3, 1, 2]);
    expect(result).toBe('[3,1,2]');
  });

  it('omits undefined values in objects', () => {
    const result = canonicalize({ a: 1, b: undefined, c: 3 });
    expect(result).toBe('{"a":1,"c":3}');
  });

  it('encodes undefined in arrays as null', () => {
    const arr = [1, undefined, 3];
    const result = canonicalize(arr);
    expect(result).toBe('[1,null,3]');
  });

  it('throws CanonicalizeError on NaN', () => {
    expect(() => canonicalize(NaN)).toThrow(CanonicalizeError);
    expect(() => canonicalize(NaN)).toThrow('NaN');
  });

  it('throws CanonicalizeError on Infinity', () => {
    expect(() => canonicalize(Infinity)).toThrow(CanonicalizeError);
    expect(() => canonicalize(-Infinity)).toThrow(CanonicalizeError);
  });

  it('throws CanonicalizeError on function', () => {
    expect(() => canonicalize(() => {})).toThrow(CanonicalizeError);
    expect(() => canonicalize(() => {})).toThrow('Functions');
  });

  it('throws CanonicalizeError on symbol', () => {
    expect(() => canonicalize(Symbol('test'))).toThrow(CanonicalizeError);
  });

  it('throws CanonicalizeError on BigInt', () => {
    expect(() => canonicalize(BigInt(42))).toThrow(CanonicalizeError);
  });

  it('normalizes -0 to 0', () => {
    const result = canonicalize(-0);
    expect(result).toBe('0');
  });

  it('handles null', () => {
    expect(canonicalize(null)).toBe('null');
  });

  it('handles strings', () => {
    expect(canonicalize('hello')).toBe('"hello"');
  });

  it('handles booleans', () => {
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
  });

  it('handles empty object', () => {
    expect(canonicalize({})).toBe('{}');
  });

  it('handles empty array', () => {
    expect(canonicalize([])).toBe('[]');
  });
});

// ============================================================================
// contentHash
// ============================================================================

describe('contentHash', () => {
  it('produces identical hash for identical inputs', () => {
    const h1 = contentHash('test-input');
    const h2 = contentHash('test-input');
    expect(h1).toBe(h2);
  });

  it('produces different hash for different inputs', () => {
    const h1 = contentHash('input-a');
    const h2 = contentHash('input-b');
    expect(h1).not.toBe(h2);
  });

  it('output is exactly 16 hex chars', () => {
    const h = contentHash('any-input');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ============================================================================
// hashDefinition
// ============================================================================

describe('hashDefinition', () => {
  it('produces stable hash across different insertion orders', () => {
    const rulesA = [
      { action: 'craft:stick', produces: [] },
      { action: 'craft:planks', produces: [] },
    ];
    const rulesB = [
      { action: 'craft:planks', produces: [] },
      { action: 'craft:stick', produces: [] },
    ];
    expect(hashDefinition(rulesA)).toBe(hashDefinition(rulesB));
  });

  it('does not mutate the original array', () => {
    const rules = [
      { action: 'b', produces: [] },
      { action: 'a', produces: [] },
    ];
    const original = [...rules];
    hashDefinition(rules);
    expect(rules[0].action).toBe(original[0].action);
    expect(rules[1].action).toBe(original[1].action);
  });

  it('different definitions produce different hashes', () => {
    const rulesA = [{ action: 'craft:stick', produces: [] }];
    const rulesB = [{ action: 'craft:planks', produces: [] }];
    expect(hashDefinition(rulesA)).not.toBe(hashDefinition(rulesB));
  });

  it('sorts by moduleId for building modules', () => {
    const modsA = [
      { moduleId: 'wall', baseCost: 1 },
      { moduleId: 'floor', baseCost: 2 },
    ];
    const modsB = [
      { moduleId: 'floor', baseCost: 2 },
      { moduleId: 'wall', baseCost: 1 },
    ];
    expect(hashDefinition(modsA)).toBe(hashDefinition(modsB));
  });
});

// ============================================================================
// hashInventoryState
// ============================================================================

describe('hashInventoryState', () => {
  it('omits zero-valued entries', () => {
    const inv1 = { oak_log: 3, stick: 0 };
    const inv2 = { oak_log: 3 };
    expect(hashInventoryState(inv1)).toBe(hashInventoryState(inv2));
  });

  it('sorts keys', () => {
    const inv1 = { stick: 2, oak_log: 3 };
    const inv2 = { oak_log: 3, stick: 2 };
    expect(hashInventoryState(inv1)).toBe(hashInventoryState(inv2));
  });

  it('clamps counts above INVENTORY_HASH_CAP to the cap (100 === 200)', () => {
    expect(hashInventoryState({ oak_log: 100 }))
      .toBe(hashInventoryState({ oak_log: 200 }));
  });

  it('distinguishes counts below cap (63 !== 64)', () => {
    expect(hashInventoryState({ oak_log: 63 }))
      .not.toBe(hashInventoryState({ oak_log: 64 }));
  });

  it('treats at-cap equal to above-cap (64 === 65)', () => {
    expect(hashInventoryState({ oak_log: 64 }))
      .toBe(hashInventoryState({ oak_log: 65 }));
  });
});

// ============================================================================
// hashGoal, hashNearbyBlocks, hashSteps
// ============================================================================

describe('hashGoal', () => {
  it('produces deterministic hash', () => {
    const goal = { wooden_pickaxe: 1 };
    expect(hashGoal(goal)).toBe(hashGoal(goal));
  });
});

describe('hashNearbyBlocks', () => {
  it('preserves order (different order = different hash)', () => {
    const h1 = hashNearbyBlocks(['stone', 'dirt']);
    const h2 = hashNearbyBlocks(['dirt', 'stone']);
    expect(h1).not.toBe(h2);
  });
});

describe('hashSteps', () => {
  it('hashes ordered action IDs', () => {
    const steps = [{ action: 'mine:oak_log' }, { action: 'craft:planks' }];
    const h = hashSteps(steps);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ============================================================================
// computeBundleInput
// ============================================================================

describe('computeBundleInput', () => {
  it('computes golden-master hash for known wooden pickaxe rules', () => {
    const input = computeBundleInput({
      solverId: 'minecraft.crafting',
      contractVersion: 1,
      definitions: [
        { action: 'mine:oak_log', actionType: 'mine', produces: [{ name: 'oak_log', count: 1 }], consumes: [], requires: [] },
        { action: 'craft:oak_planks', actionType: 'craft', produces: [{ name: 'oak_planks', count: 4 }], consumes: [{ name: 'oak_log', count: 1 }], requires: [] },
        { action: 'craft:stick', actionType: 'craft', produces: [{ name: 'stick', count: 4 }], consumes: [{ name: 'oak_planks', count: 2 }], requires: [] },
      ],
      inventory: {},
      goal: { wooden_pickaxe: 1 },
      nearbyBlocks: [],
    });

    expect(input.solverId).toBe('minecraft.crafting');
    expect(input.definitionHash).toMatch(/^[0-9a-f]{16}$/);
    expect(input.goalHash).toMatch(/^[0-9a-f]{16}$/);
    expect(input.definitionCount).toBe(3);
    expect(input.codeVersion).toBe('0.1.0');

    // Golden-master: same input must produce same hash
    const input2 = computeBundleInput({
      solverId: 'minecraft.crafting',
      contractVersion: 1,
      definitions: [
        { action: 'mine:oak_log', actionType: 'mine', produces: [{ name: 'oak_log', count: 1 }], consumes: [], requires: [] },
        { action: 'craft:oak_planks', actionType: 'craft', produces: [{ name: 'oak_planks', count: 4 }], consumes: [{ name: 'oak_log', count: 1 }], requires: [] },
        { action: 'craft:stick', actionType: 'craft', produces: [{ name: 'stick', count: 4 }], consumes: [{ name: 'oak_planks', count: 2 }], requires: [] },
      ],
      inventory: {},
      goal: { wooden_pickaxe: 1 },
      nearbyBlocks: [],
    });
    expect(input.definitionHash).toBe(input2.definitionHash);
    expect(input.goalHash).toBe(input2.goalHash);
  });
});

// ============================================================================
// objectiveWeights in computeBundleInput
// ============================================================================

describe('objectiveWeights in computeBundleInput', () => {
  const baseParams = {
    solverId: 'test.solver',
    contractVersion: 1,
    definitions: [{ action: 'craft:test', produces: [] }],
    inventory: {},
    goal: { test: 1 },
    nearbyBlocks: [],
  };

  it('captures provided objectiveWeights correctly', () => {
    const weights: ObjectiveWeights = { costWeight: 0.5, timeWeight: 0.3, riskWeight: 0.2 };
    const input = computeBundleInput({ ...baseParams, objectiveWeights: weights });

    expect(input.objectiveWeightsProvided).toEqual(weights);
    expect(input.objectiveWeightsEffective).toEqual(weights);
    expect(input.objectiveWeightsSource).toBe('provided');
  });

  it('uses DEFAULT_OBJECTIVE_WEIGHTS when objectiveWeights omitted', () => {
    const input = computeBundleInput(baseParams);

    expect(input.objectiveWeightsProvided).toBeUndefined();
    expect(input.objectiveWeightsEffective).toEqual(DEFAULT_OBJECTIVE_WEIGHTS);
    expect(input.objectiveWeightsSource).toBe('default');
  });

  it('DEFAULT_OBJECTIVE_WEIGHTS has expected values', () => {
    expect(DEFAULT_OBJECTIVE_WEIGHTS).toEqual({
      costWeight: 1.0,
      timeWeight: 0.0,
      riskWeight: 0.0,
    });
  });
});

// ============================================================================
// createSolveBundle
// ============================================================================

describe('createSolveBundle', () => {
  const makeInput = () => computeBundleInput({
    solverId: 'minecraft.crafting',
    contractVersion: 1,
    definitions: [{ action: 'craft:stick', produces: [] }],
    inventory: {},
    goal: { stick: 1 },
    nearbyBlocks: [],
  });

  const makeOutput = () => computeBundleOutput({
    planId: 'plan-123',
    solved: true,
    steps: [{ action: 'craft:stick' }],
    totalNodes: 42,
    durationMs: 100,
    solutionPathLength: 1,
  });

  const makeCompatReport = (): CompatReport => ({
    valid: true,
    issues: [],
    checkedAt: Date.now(),
    definitionCount: 1,
  });

  it('bundleId = solverId:bundleHash', () => {
    const bundle = createSolveBundle(makeInput(), makeOutput(), makeCompatReport());
    expect(bundle.bundleId).toBe(`minecraft.crafting:${bundle.bundleHash}`);
  });

  it('bundleHash is exactly 16 hex chars', () => {
    const bundle = createSolveBundle(makeInput(), makeOutput(), makeCompatReport());
    expect(bundle.bundleHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('same input/output/compat produces same bundleHash (determinism)', () => {
    const input = makeInput();
    const output = makeOutput();
    const compat = makeCompatReport();
    const b1 = createSolveBundle(input, output, compat);
    const b2 = createSolveBundle(input, output, compat);
    expect(b1.bundleHash).toBe(b2.bundleHash);
  });

  it('different checkedAt produces same bundleHash (nondeterministic exclusion)', () => {
    const input = makeInput();
    const output = makeOutput();
    const compat1: CompatReport = { valid: true, issues: [], checkedAt: 1000, definitionCount: 1 };
    const compat2: CompatReport = { valid: true, issues: [], checkedAt: 9999, definitionCount: 1 };
    const b1 = createSolveBundle(input, output, compat1);
    const b2 = createSolveBundle(input, output, compat2);
    expect(b1.bundleHash).toBe(b2.bundleHash);
  });

  it('timestamp is excluded from bundleHash', () => {
    const bundle = createSolveBundle(makeInput(), makeOutput(), makeCompatReport());
    expect(bundle.timestamp).toBeGreaterThan(0);
    // The hash doesn't change even though timestamps differ between calls
    const bundle2 = createSolveBundle(makeInput(), makeOutput(), makeCompatReport());
    expect(bundle.bundleHash).toBe(bundle2.bundleHash);
  });
});

// ============================================================================
// computeBundleOutput rationale
// ============================================================================

describe('computeBundleOutput rationale', () => {
  const baseParams = {
    planId: 'plan-rationale-1' as string | null,
    solved: true,
    steps: [{ action: 'craft:stick' }],
    totalNodes: 42,
    durationMs: 100,
    solutionPathLength: 1,
  };

  const sampleSearchHealth: SearchHealthMetrics = {
    nodesExpanded: 42,
    frontierPeak: 20,
    hMin: 0,
    hMax: 10,
    hMean: 5,
    hVariance: 4,
    fMin: 0,
    fMax: 10,
    pctSameH: 0.3,
    terminationReason: 'goal_found',
    branchingEstimate: 3.2,
  };

  it('rationale is undefined when maxNodes not provided (backward compat)', () => {
    const output = computeBundleOutput(baseParams);
    expect(output.rationale).toBeUndefined();
  });

  it('rationale is populated when maxNodes provided', () => {
    const output = computeBundleOutput({
      ...baseParams,
      maxNodes: 5000,
    });

    expect(output.rationale).toBeDefined();
    expect(output.rationale!.boundingConstraints.maxNodes).toBe(5000);
    expect(output.rationale!.boundingConstraints.objectiveWeightsSource).toBe('default');
    expect(output.rationale!.boundingConstraints.objectiveWeightsEffective).toEqual(DEFAULT_OBJECTIVE_WEIGHTS);
  });

  it('rationale with searchHealth data populates searchEffort and termination', () => {
    const output = computeBundleOutput({
      ...baseParams,
      maxNodes: 5000,
      searchHealth: sampleSearchHealth,
      objectiveWeightsEffective: { costWeight: 0.8, timeWeight: 0.2, riskWeight: 0.0 },
      objectiveWeightsSource: 'provided' as const,
    });

    expect(output.rationale).toBeDefined();
    expect(output.rationale!.searchEffort.nodesExpanded).toBe(42);
    expect(output.rationale!.searchEffort.frontierPeak).toBe(20);
    expect(output.rationale!.searchEffort.branchingEstimate).toBe(3.2);
    expect(output.rationale!.searchTermination.terminationReason).toBe('goal_found');
    expect(output.rationale!.searchTermination.isDegenerate).toBe(false);
    expect(output.rationale!.searchTermination.degeneracyReasons).toEqual([]);
  });

  it('objectiveWeightsSource correctly reflects provided vs default', () => {
    const outputProvided = computeBundleOutput({
      ...baseParams,
      maxNodes: 5000,
      objectiveWeightsEffective: { costWeight: 0.5, timeWeight: 0.5 },
      objectiveWeightsSource: 'provided' as const,
    });
    expect(outputProvided.rationale!.boundingConstraints.objectiveWeightsSource).toBe('provided');

    const outputDefault = computeBundleOutput({
      ...baseParams,
      maxNodes: 5000,
    });
    expect(outputDefault.rationale!.boundingConstraints.objectiveWeightsSource).toBe('default');
  });
});
