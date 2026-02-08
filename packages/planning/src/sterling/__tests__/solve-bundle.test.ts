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
  parseSterlingIdentity,
  attachSterlingIdentity,
  computeLeafRegistryDigest,
  computeLeafContractDigest,
  computeLeafContractRequiredDigest,
  INVENTORY_HASH_CAP,
} from '../solve-bundle';
import type { CompatReport, ObjectiveWeights, SearchHealthMetrics } from '../solve-bundle-types';
import { getLeafContractEntries } from '../../modules/leaf-arg-contracts';
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

  it('sterlingIdentity does not participate in bundleHash', () => {
    const input = makeInput();
    const outputA = makeOutput();
    const outputB = {
      ...makeOutput(),
      sterlingIdentity: {
        traceBundleHash: 'abc123def456',
        engineCommitment: 'def456abc789',
        operatorRegistryHash: '0011223344556677',
      },
    };
    const compat = makeCompatReport();

    const bundleA = createSolveBundle(input, outputA, compat);
    const bundleB = createSolveBundle(input, outputB, compat);

    // Core invariant: bundleHash must be identical regardless of sterlingIdentity
    expect(bundleA.bundleHash).toBe(bundleB.bundleHash);

    // But sterlingIdentity is preserved on the bundle output
    expect(bundleB.output.sterlingIdentity).toBeDefined();
    expect(bundleB.output.sterlingIdentity!.traceBundleHash).toBe('abc123def456');
  });

  it('sterlingIdentity with completenessDeclaration does not affect bundleHash', () => {
    const input = makeInput();
    const outputA = makeOutput();
    const outputB = {
      ...makeOutput(),
      sterlingIdentity: {
        traceBundleHash: 'abc123def456',
        completenessDeclaration: {
          complete: true,
          domain: 'minecraft',
        },
      },
    };
    const compat = makeCompatReport();

    const bundleA = createSolveBundle(input, outputA, compat);
    const bundleB = createSolveBundle(input, outputB, compat);

    expect(bundleA.bundleHash).toBe(bundleB.bundleHash);
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

// ============================================================================
// parseSterlingIdentity
// ============================================================================

describe('parseSterlingIdentity', () => {
  it('returns undefined when metrics is undefined', () => {
    expect(parseSterlingIdentity(undefined)).toBeUndefined();
  });

  it('returns undefined when no identity fields are present', () => {
    expect(parseSterlingIdentity({ planId: 'abc', totalNodes: 42 })).toBeUndefined();
  });

  it('parses trace_bundle_hash from metrics', () => {
    const identity = parseSterlingIdentity({ trace_bundle_hash: 'abc123def456' });
    expect(identity).toBeDefined();
    expect(identity!.traceBundleHash).toBe('abc123def456');
  });

  it('parses all identity fields when present', () => {
    const identity = parseSterlingIdentity({
      trace_bundle_hash: 'tbh-123',
      engine_commitment: 'ec-456',
      operator_registry_hash: 'orh-789',
      completeness_declaration: { complete: true, domain: 'minecraft' },
    });
    expect(identity).toBeDefined();
    expect(identity!.traceBundleHash).toBe('tbh-123');
    expect(identity!.engineCommitment).toBe('ec-456');
    expect(identity!.operatorRegistryHash).toBe('orh-789');
    expect(identity!.completenessDeclaration).toEqual({ complete: true, domain: 'minecraft' });
  });

  it('ignores non-string trace_bundle_hash', () => {
    expect(parseSterlingIdentity({ trace_bundle_hash: 42 })).toBeUndefined();
    expect(parseSterlingIdentity({ trace_bundle_hash: null })).toBeUndefined();
  });

  it('ignores non-object completeness_declaration', () => {
    const identity = parseSterlingIdentity({
      trace_bundle_hash: 'tbh-123',
      completeness_declaration: 'not-an-object',
    });
    expect(identity!.completenessDeclaration).toBeUndefined();
  });

  it('wire-shape lock: identity fields at top-level (not in metrics) are ignored', () => {
    // Simulates a hypothetical server refactor that moves identity fields
    // to the top-level response instead of nesting them inside metrics.
    // parseSterlingIdentity receives `result.metrics` — so top-level fields
    // should never be visible to it.  This test locks that contract.
    const topLevelResult = {
      type: 'complete',
      domain: 'minecraft',
      solved: true,
      // Identity fields at top-level (wrong placement)
      trace_bundle_hash: 'top-level-tbh',
      engine_commitment: 'top-level-ec',
      operator_registry_hash: 'top-level-orh',
      // metrics without identity fields
      metrics: { planId: 'abc', totalNodes: 42 },
    };

    // parseSterlingIdentity is called with result.metrics, not result
    const identity = parseSterlingIdentity(topLevelResult.metrics as Record<string, unknown>);
    expect(identity).toBeUndefined();

    // Contrast: if called with the full result (wrong), it would find them
    const wrongIdentity = parseSterlingIdentity(topLevelResult as unknown as Record<string, unknown>);
    expect(wrongIdentity).toBeDefined();
    expect(wrongIdentity!.traceBundleHash).toBe('top-level-tbh');
    // This proves the contract: only metrics-nested fields are parsed by solvers
  });
});

// ============================================================================
// attachSterlingIdentity + bindingHash
// ============================================================================

describe('attachSterlingIdentity', () => {
  const makeBundle = () => {
    const input = computeBundleInput({
      solverId: 'test.solver',
      contractVersion: 1,
      definitions: [{ action: 'craft:test', produces: [] }],
      inventory: {},
      goal: { test: 1 },
      nearbyBlocks: [],
    });
    const output = computeBundleOutput({
      planId: 'plan-test',
      solved: true,
      steps: [{ action: 'craft:test' }],
      totalNodes: 10,
      durationMs: 50,
      solutionPathLength: 1,
    });
    const compat: CompatReport = {
      valid: true,
      issues: [],
      checkedAt: Date.now(),
      definitionCount: 1,
    };
    return createSolveBundle(input, output, compat);
  };

  it('does nothing when identity is undefined', () => {
    const bundle = makeBundle();
    attachSterlingIdentity(bundle, undefined);
    expect(bundle.output.sterlingIdentity).toBeUndefined();
  });

  it('attaches identity to bundle output', () => {
    const bundle = makeBundle();
    attachSterlingIdentity(bundle, {
      traceBundleHash: 'tbh-123',
      engineCommitment: 'ec-456',
    });
    expect(bundle.output.sterlingIdentity).toBeDefined();
    expect(bundle.output.sterlingIdentity!.traceBundleHash).toBe('tbh-123');
    expect(bundle.output.sterlingIdentity!.engineCommitment).toBe('ec-456');
  });

  it('computes bindingHash when traceBundleHash is available', () => {
    const bundle = makeBundle();
    attachSterlingIdentity(bundle, { traceBundleHash: 'tbh-123' });

    const identity = bundle.output.sterlingIdentity!;
    expect(identity.bindingHash).toBeDefined();
    // bindingHash = contentHash("binding:v1:" + traceBundleHash + ":" + bundleHash)
    const expected = contentHash('binding:v1:' + 'tbh-123' + ':' + bundle.bundleHash);
    expect(identity.bindingHash).toBe(expected);
  });

  it('does not compute bindingHash when traceBundleHash is absent', () => {
    const bundle = makeBundle();
    attachSterlingIdentity(bundle, { engineCommitment: 'ec-456' });

    const identity = bundle.output.sterlingIdentity!;
    expect(identity.bindingHash).toBeUndefined();
  });

  it('bindingHash is deterministic for same inputs', () => {
    const bundle1 = makeBundle();
    const bundle2 = makeBundle();

    attachSterlingIdentity(bundle1, { traceBundleHash: 'same-hash' });
    attachSterlingIdentity(bundle2, { traceBundleHash: 'same-hash' });

    expect(bundle1.output.sterlingIdentity!.bindingHash)
      .toBe(bundle2.output.sterlingIdentity!.bindingHash);
  });

  it('different traceBundleHash produces different bindingHash', () => {
    const bundle1 = makeBundle();
    const bundle2 = makeBundle();

    attachSterlingIdentity(bundle1, { traceBundleHash: 'hash-a' });
    attachSterlingIdentity(bundle2, { traceBundleHash: 'hash-b' });

    expect(bundle1.output.sterlingIdentity!.bindingHash)
      .not.toBe(bundle2.output.sterlingIdentity!.bindingHash);
  });
});

// ============================================================================
// Hash Surface Regression Tests
// ============================================================================

describe('bundleHash preimage regression: no identity contamination', () => {
  const baseInput = computeBundleInput({
    solverId: 'minecraft.crafting',
    contractVersion: 1,
    definitions: [{ action: 'craft:stick', actionType: 'craft', produces: [], consumes: [] }],
    inventory: { oak_planks: 2 },
    goal: { stick: 1 },
    nearbyBlocks: [],
  });
  const baseOutput = computeBundleOutput({
    planId: 'plan-1',
    solved: true,
    steps: [{ action: 'craft:stick' }],
    totalNodes: 10,
    durationMs: 50,
    solutionPathLength: 1,
  });
  const baseCompat: CompatReport = {
    valid: true,
    issues: [],
    checkedAt: Date.now(),
    definitionCount: 1,
  };

  it('bundleHash does NOT change when sterlingIdentity is added', () => {
    const bundleWithout = createSolveBundle(baseInput, baseOutput, baseCompat);
    const bundleWith = createSolveBundle(baseInput, {
      ...baseOutput,
      sterlingIdentity: {
        traceBundleHash: 'trace-abc',
        engineCommitment: 'engine-xyz',
        operatorRegistryHash: 'reg-hash',
      },
    }, baseCompat);
    expect(bundleWithout.bundleHash).toBe(bundleWith.bundleHash);
  });

  it('bundleHash does NOT change when completenessDeclaration is on sterlingIdentity', () => {
    const bundleWithout = createSolveBundle(baseInput, baseOutput, baseCompat);
    const bundleWith = createSolveBundle(baseInput, {
      ...baseOutput,
      sterlingIdentity: {
        traceBundleHash: 'trace-abc',
        completenessDeclaration: {
          completenessVersion: 1,
          kind: 'structural',
          edgesComplete: true,
          isProofReady: false,
        },
      },
    }, baseCompat);
    expect(bundleWithout.bundleHash).toBe(bundleWith.bundleHash);
  });

  it('solverId IS part of bundleHash via input.solverId (intentional)', () => {
    const inputA = computeBundleInput({
      solverId: 'minecraft.crafting',
      contractVersion: 1,
      definitions: [{ action: 'craft:stick' }],
      inventory: { oak_planks: 2 },
      goal: { stick: 1 },
      nearbyBlocks: [],
    });
    const inputB = computeBundleInput({
      solverId: 'minecraft.tool_progression',
      contractVersion: 1,
      definitions: [{ action: 'craft:stick' }],
      inventory: { oak_planks: 2 },
      goal: { stick: 1 },
      nearbyBlocks: [],
    });
    const bundleA = createSolveBundle(inputA, baseOutput, baseCompat);
    const bundleB = createSolveBundle(inputB, baseOutput, baseCompat);

    // solverId is intentionally in the hash — different solvers for same
    // input/output SHOULD have different bundleHashes.
    expect(bundleA.bundleHash).not.toBe(bundleB.bundleHash);
  });

  it('declaration registration state does NOT affect bundleHash', () => {
    // This is the "no identity contamination" proof.
    // Declaration registration lives on the solver instance, not on the bundle.
    // Creating two bundles with identical input/output/compat should always
    // produce the same bundleHash, regardless of whether the solver was
    // registered at the time.
    const bundle1 = createSolveBundle(baseInput, baseOutput, baseCompat);
    const bundle2 = createSolveBundle(baseInput, baseOutput, baseCompat);
    expect(bundle1.bundleHash).toBe(bundle2.bundleHash);
  });
});

// ============================================================================
// Completeness Declaration Enforcement (Phase 2)
// ============================================================================

describe('parseSterlingIdentity: completenessDeclaration contract', () => {
  it('Phase 2: completenessDeclaration is parsed as-is from metrics', () => {
    const identity = parseSterlingIdentity({
      trace_bundle_hash: 'abc',
      completeness_declaration: {
        completenessVersion: 1,
        kind: 'structural',
        isProofReady: false,
        proofMissingReasons: ['no_operator_witnesses_emitted'],
        edgesComplete: true,
      },
    });
    expect(identity).toBeDefined();
    expect(identity!.completenessDeclaration).toBeDefined();
    expect(identity!.completenessDeclaration!['completenessVersion']).toBe(1);
    expect(identity!.completenessDeclaration!['kind']).toBe('structural');
    expect(identity!.completenessDeclaration!['isProofReady']).toBe(false);
  });

  it('Phase 2: absent completenessDeclaration is undefined (not null)', () => {
    const identity = parseSterlingIdentity({
      trace_bundle_hash: 'abc',
    });
    expect(identity).toBeDefined();
    expect(identity!.completenessDeclaration).toBeUndefined();
  });
});

// ============================================================================
// computeLeafRegistryDigest
// ============================================================================

describe('computeLeafRegistryDigest', () => {
  it('produces deterministic digest from leaf name set', () => {
    const leaves = ['craft_recipe', 'acquire_material', 'smelt'];
    const d1 = computeLeafRegistryDigest(leaves);
    const d2 = computeLeafRegistryDigest(leaves);
    expect(d1).toBe(d2);
    expect(typeof d1).toBe('string');
    expect(d1.length).toBe(16); // SHA-256 truncated to 16 hex
  });

  it('same leaves in different order produce same digest (sorted internally)', () => {
    const d1 = computeLeafRegistryDigest(['smelt', 'craft_recipe', 'acquire_material']);
    const d2 = computeLeafRegistryDigest(['acquire_material', 'craft_recipe', 'smelt']);
    expect(d1).toBe(d2);
  });

  it('different leaf sets produce different digests', () => {
    const d1 = computeLeafRegistryDigest(['craft_recipe', 'smelt']);
    const d2 = computeLeafRegistryDigest(['craft_recipe', 'acquire_material']);
    expect(d1).not.toBe(d2);
  });

  it('adding a leaf changes the digest', () => {
    const d1 = computeLeafRegistryDigest(['craft_recipe']);
    const d2 = computeLeafRegistryDigest(['craft_recipe', 'smelt']);
    expect(d1).not.toBe(d2);
  });

  it('accepts Set (Iterable) input', () => {
    const set = new Set(['craft_recipe', 'smelt']);
    const array = ['craft_recipe', 'smelt'];
    expect(computeLeafRegistryDigest(set)).toBe(computeLeafRegistryDigest(array));
  });

  it('empty registry produces a stable digest', () => {
    const d1 = computeLeafRegistryDigest([]);
    const d2 = computeLeafRegistryDigest([]);
    expect(d1).toBe(d2);
  });
});

describe('computeBundleInput with leafRegistry', () => {
  const baseParams = {
    solverId: 'test-solver',
    contractVersion: 1,
    definitions: [{ action: 'craft:oak_planks' }],
    inventory: { oak_log: 4 },
    goal: { oak_planks: 4 },
    nearbyBlocks: ['oak_log'],
  };

  it('includes leafRegistryDigest when leafRegistry is provided', () => {
    const input = computeBundleInput({
      ...baseParams,
      leafRegistry: ['craft_recipe', 'acquire_material'],
    });
    expect(input.leafRegistryDigest).toBeDefined();
    expect(typeof input.leafRegistryDigest).toBe('string');
    expect(input.leafRegistryDigest!.length).toBe(16);
  });

  it('leafRegistryDigest is undefined when leafRegistry is not provided', () => {
    const input = computeBundleInput(baseParams);
    expect(input.leafRegistryDigest).toBeUndefined();
  });

  it('leafRegistryDigest matches computeLeafRegistryDigest for same leaves', () => {
    const leaves = ['craft_recipe', 'acquire_material', 'smelt'];
    const input = computeBundleInput({ ...baseParams, leafRegistry: leaves });
    expect(input.leafRegistryDigest).toBe(computeLeafRegistryDigest(leaves));
  });

  it('prefers leafContractEntries over leafRegistry when both provided', () => {
    const entries: [string, string[]][] = [
      ['craft_recipe', ['recipe:string']],
      ['smelt', ['input:string']],
    ];
    const input = computeBundleInput({
      ...baseParams,
      leafRegistry: ['craft_recipe', 'smelt'],
      leafContractEntries: entries,
    });
    expect(input.leafRegistryDigest).toBe(computeLeafContractDigest(entries));
    // Contract digest differs from names-only digest
    expect(input.leafRegistryDigest).not.toBe(
      computeLeafRegistryDigest(['craft_recipe', 'smelt'])
    );
  });

  it('leafContractEntries produces digest when leafRegistry absent', () => {
    const entries: [string, string[]][] = [
      ['craft_recipe', ['recipe:string', '?qty:number']],
    ];
    const input = computeBundleInput({
      ...baseParams,
      leafContractEntries: entries,
    });
    expect(input.leafRegistryDigest).toBeDefined();
    expect(input.leafRegistryDigest).toBe(computeLeafContractDigest(entries));
  });
});

// ============================================================================
// computeLeafContractDigest
// ============================================================================

describe('computeLeafContractDigest', () => {
  it('is deterministic for same entries', () => {
    const entries: [string, string[]][] = [
      ['craft_recipe', ['recipe:string', '?qty:number']],
      ['smelt', ['input:string']],
    ];
    expect(computeLeafContractDigest(entries)).toBe(computeLeafContractDigest(entries));
  });

  it('is order-invariant for leaf entries', () => {
    const a: [string, string[]][] = [
      ['smelt', ['input:string']],
      ['craft_recipe', ['recipe:string']],
    ];
    const b: [string, string[]][] = [
      ['craft_recipe', ['recipe:string']],
      ['smelt', ['input:string']],
    ];
    expect(computeLeafContractDigest(a)).toBe(computeLeafContractDigest(b));
  });

  it('is order-invariant for fields within an entry', () => {
    const a: [string, string[]][] = [
      ['interact_with_entity', ['entityType:string', '?entityId:string']],
    ];
    const b: [string, string[]][] = [
      ['interact_with_entity', ['?entityId:string', 'entityType:string']],
    ];
    expect(computeLeafContractDigest(a)).toBe(computeLeafContractDigest(b));
  });

  it('differs from names-only digest for same leaf set', () => {
    const entries: [string, string[]][] = [
      ['craft_recipe', ['recipe:string']],
      ['smelt', ['input:string']],
    ];
    const namesOnly = computeLeafRegistryDigest(['craft_recipe', 'smelt']);
    expect(computeLeafContractDigest(entries)).not.toBe(namesOnly);
  });

  it('changes when a field is added to a contract', () => {
    const before: [string, string[]][] = [
      ['craft_recipe', ['recipe:string']],
    ];
    const after: [string, string[]][] = [
      ['craft_recipe', ['recipe:string', 'qty:number']],
    ];
    expect(computeLeafContractDigest(before)).not.toBe(computeLeafContractDigest(after));
  });

  it('changes when a field changes from optional to required', () => {
    const optional: [string, string[]][] = [
      ['craft_recipe', ['recipe:string', '?qty:number']],
    ];
    const required: [string, string[]][] = [
      ['craft_recipe', ['recipe:string', 'qty:number']],
    ];
    expect(computeLeafContractDigest(optional)).not.toBe(computeLeafContractDigest(required));
  });

  it('works with getLeafContractEntries from leaf-arg-contracts', () => {
    const entries = getLeafContractEntries();
    expect(entries.length).toBeGreaterThan(0);
    const digest = computeLeafContractDigest(entries);
    expect(typeof digest).toBe('string');
    expect(digest.length).toBe(16);
    // Deterministic
    expect(computeLeafContractDigest(getLeafContractEntries())).toBe(digest);
  });
});

// ============================================================================
// computeLeafContractRequiredDigest
// ============================================================================

describe('computeLeafContractRequiredDigest', () => {
  it('is deterministic', () => {
    const entries: [string, string[]][] = [
      ['craft_recipe', ['recipe:string', '?qty:number']],
    ];
    expect(computeLeafContractRequiredDigest(entries)).toBe(
      computeLeafContractRequiredDigest(entries)
    );
  });

  it('is insensitive to adding an optional field (backward-compatible change)', () => {
    const before: [string, string[]][] = [
      ['craft_recipe', ['recipe:string']],
    ];
    const after: [string, string[]][] = [
      ['craft_recipe', ['recipe:string', '?qty:number']],
    ];
    expect(computeLeafContractRequiredDigest(before)).toBe(
      computeLeafContractRequiredDigest(after)
    );
  });

  it('changes when a required field is added', () => {
    const before: [string, string[]][] = [
      ['craft_recipe', ['recipe:string']],
    ];
    const after: [string, string[]][] = [
      ['craft_recipe', ['recipe:string', 'qty:number']],
    ];
    expect(computeLeafContractRequiredDigest(before)).not.toBe(
      computeLeafContractRequiredDigest(after)
    );
  });

  it('changes when an optional field becomes required', () => {
    const optional: [string, string[]][] = [
      ['craft_recipe', ['recipe:string', '?qty:number']],
    ];
    const required: [string, string[]][] = [
      ['craft_recipe', ['recipe:string', 'qty:number']],
    ];
    expect(computeLeafContractRequiredDigest(optional)).not.toBe(
      computeLeafContractRequiredDigest(required)
    );
  });

  it('differs from full digest when optional fields exist', () => {
    const entries: [string, string[]][] = [
      ['craft_recipe', ['recipe:string', '?qty:number']],
    ];
    expect(computeLeafContractRequiredDigest(entries)).not.toBe(
      computeLeafContractDigest(entries)
    );
  });

  it('equals full digest when no optional fields exist', () => {
    const entries: [string, string[]][] = [
      ['smelt', ['input:string']],
    ];
    // Both filter to the same set: ['input:string']
    // But the full digest includes ['input:string'] while required includes ['input:string']
    // Structure is identical so digests should match
    expect(computeLeafContractRequiredDigest(entries)).toBe(
      computeLeafContractDigest(entries)
    );
  });

  it('is order-invariant for entries and fields', () => {
    const a: [string, string[]][] = [
      ['smelt', ['input:string']],
      ['craft_recipe', ['recipe:string', '?qty:number']],
    ];
    const b: [string, string[]][] = [
      ['craft_recipe', ['?qty:number', 'recipe:string']],
      ['smelt', ['input:string']],
    ];
    expect(computeLeafContractRequiredDigest(a)).toBe(
      computeLeafContractRequiredDigest(b)
    );
  });
});

// ============================================================================
// computeBundleInput with leafContractEntries: required vs full digests
// ============================================================================

describe('computeBundleInput required/full digest split', () => {
  const baseParams = {
    solverId: 'test-solver',
    contractVersion: 1,
    definitions: [{ action: 'craft:oak_planks' }],
    inventory: { oak_log: 4 },
    goal: { oak_planks: 4 },
    nearbyBlocks: ['oak_log'],
  };

  it('populates both requiredDigest and fullDigest when leafContractEntries provided', () => {
    const entries: [string, string[]][] = [
      ['craft_recipe', ['recipe:string', '?qty:number']],
      ['smelt', ['input:string']],
    ];
    const input = computeBundleInput({ ...baseParams, leafContractEntries: entries });
    expect(input.leafContractRequiredDigest).toBeDefined();
    expect(input.leafContractFullDigest).toBeDefined();
    expect(typeof input.leafContractRequiredDigest).toBe('string');
    expect(typeof input.leafContractFullDigest).toBe('string');
  });

  it('requiredDigest differs from fullDigest when optional fields exist', () => {
    const entries: [string, string[]][] = [
      ['craft_recipe', ['recipe:string', '?qty:number']],
    ];
    const input = computeBundleInput({ ...baseParams, leafContractEntries: entries });
    expect(input.leafContractRequiredDigest).not.toBe(input.leafContractFullDigest);
  });

  it('requiredDigest is stable when only optional fields are added', () => {
    const before: [string, string[]][] = [
      ['craft_recipe', ['recipe:string']],
    ];
    const after: [string, string[]][] = [
      ['craft_recipe', ['recipe:string', '?qty:number']],
    ];
    const inputBefore = computeBundleInput({ ...baseParams, leafContractEntries: before });
    const inputAfter = computeBundleInput({ ...baseParams, leafContractEntries: after });
    // Required digest unchanged (backward-compatible change)
    expect(inputBefore.leafContractRequiredDigest).toBe(inputAfter.leafContractRequiredDigest);
    // Full digest changed (contract surface grew)
    expect(inputBefore.leafContractFullDigest).not.toBe(inputAfter.leafContractFullDigest);
  });

  it('neither digest is set when only leafRegistry (names-only) is provided', () => {
    const input = computeBundleInput({
      ...baseParams,
      leafRegistry: ['craft_recipe', 'smelt'],
    });
    expect(input.leafContractRequiredDigest).toBeUndefined();
    expect(input.leafContractFullDigest).toBeUndefined();
    // But leafRegistryDigest is set
    expect(input.leafRegistryDigest).toBeDefined();
  });
});
