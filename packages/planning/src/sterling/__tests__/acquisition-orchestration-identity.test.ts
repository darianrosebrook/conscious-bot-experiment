/**
 * G1: Rig D parent bundle carries orchestration provenance.
 *
 * Proves that the acquisition solver's parent bundle (the orchestration
 * artifact) is identity-bound to its child solve identities. This closes
 * the gap where strategy-level provenance was not cryptographically linked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contentHash, attachOrchestrationProvenance, createSolveBundle, computeBundleInput, computeBundleOutput } from '../solve-bundle';
import type { SolveBundle } from '../solve-bundle-types';

function makeChildBundle(solverId: string, traceBundleHash?: string): SolveBundle {
  const input = computeBundleInput({
    solverId,
    contractVersion: 1,
    definitions: [{ action: 'mine:oak_log', actionType: 'mine', produces: [{ name: 'oak_log', count: 1 }], consumes: [] }],
    inventory: { oak_log: 1 },
    goal: { oak_log: 1 },
    nearbyBlocks: ['oak_log'],
  });
  const output = computeBundleOutput({
    planId: 'plan-child-1',
    solved: true,
    steps: [{ action: 'mine:oak_log' }],
    totalNodes: 5,
    durationMs: 10,
    solutionPathLength: 1,
  });
  const bundle = createSolveBundle(input, output, { issues: [], version: 'test' });

  // Simulate Sterling identity attachment (normally done by attachSterlingIdentity)
  if (traceBundleHash) {
    bundle.output.sterlingIdentity = {
      traceBundleHash,
      engineCommitment: 'test-engine',
      operatorRegistryHash: 'test-registry',
    };
  }

  return bundle;
}

function makeParentBundle(): SolveBundle {
  const input = computeBundleInput({
    solverId: 'minecraft.acquisition',
    contractVersion: 1,
    definitions: [],
    inventory: { oak_log: 1 },
    goal: { oak_log: 1 },
    nearbyBlocks: [],
  });
  const output = computeBundleOutput({
    planId: 'plan-parent-1',
    solved: true,
    steps: [{ action: 'mine:oak_log' }],
    totalNodes: 5,
    durationMs: 20,
    solutionPathLength: 1,
  });
  return createSolveBundle(input, output, { issues: [], version: 'test' });
}

describe('G1: Acquisition parent bundle orchestration provenance', () => {
  it('parent bundle carries orchestrationProvenance after attachment', () => {
    const parent = makeParentBundle();
    const child1 = makeChildBundle('minecraft.crafting', 'trace_abc123');
    const child2 = makeChildBundle('minecraft.crafting', 'trace_def456');

    attachOrchestrationProvenance(parent, [child1, child2], 'mine', 'cset_digest_789');

    const prov = parent.output.orchestrationProvenance;
    expect(prov).toBeDefined();
    expect(prov!.scope).toBe('orchestration');
    expect(prov!.selectedStrategy).toBe('mine');
    expect(prov!.candidateSetDigest).toBe('cset_digest_789');
  });

  it('childTraceRefs reference correct child identities', () => {
    const parent = makeParentBundle();
    const child1 = makeChildBundle('minecraft.crafting', 'trace_aaa');
    const child2 = makeChildBundle('minecraft.crafting', 'trace_bbb');

    attachOrchestrationProvenance(parent, [child1, child2], 'mine', 'cset_xxx');

    const refs = parent.output.orchestrationProvenance!.childTraceRefs;
    expect(refs).toHaveLength(2);
    expect(refs[0].solverId).toBe('minecraft.crafting');
    expect(refs[0].bundleHash).toBe(child1.bundleHash);
    expect(refs[0].traceBundleHash).toBe('trace_aaa');
    expect(refs[1].traceBundleHash).toBe('trace_bbb');
  });

  it('childTraceRefs handles absent Sterling identity gracefully', () => {
    const parent = makeParentBundle();
    const childNoIdentity = makeChildBundle('minecraft.crafting'); // no Sterling identity

    attachOrchestrationProvenance(parent, [childNoIdentity], 'mine', 'cset_yyy');

    const refs = parent.output.orchestrationProvenance!.childTraceRefs;
    expect(refs).toHaveLength(1);
    expect(refs[0].traceBundleHash).toBeUndefined();
  });

  it('orchestrationHash is deterministic for same inputs', () => {
    const parent1 = makeParentBundle();
    const parent2 = makeParentBundle();
    const child = makeChildBundle('minecraft.crafting', 'trace_det');

    attachOrchestrationProvenance(parent1, [child], 'mine', 'cset_det');
    attachOrchestrationProvenance(parent2, [child], 'mine', 'cset_det');

    expect(parent1.output.orchestrationProvenance!.orchestrationHash)
      .toBe(parent2.output.orchestrationProvenance!.orchestrationHash);
  });

  it('orchestrationHash changes when strategy changes', () => {
    const parent1 = makeParentBundle();
    const parent2 = makeParentBundle();
    const child = makeChildBundle('minecraft.crafting', 'trace_same');

    attachOrchestrationProvenance(parent1, [child], 'mine', 'cset_same');
    attachOrchestrationProvenance(parent2, [child], 'trade', 'cset_same');

    expect(parent1.output.orchestrationProvenance!.orchestrationHash)
      .not.toBe(parent2.output.orchestrationProvenance!.orchestrationHash);
  });

  it('orchestrationHash changes when child trace changes', () => {
    const parent1 = makeParentBundle();
    const parent2 = makeParentBundle();
    const childA = makeChildBundle('minecraft.crafting', 'trace_A');
    const childB = makeChildBundle('minecraft.crafting', 'trace_B');

    attachOrchestrationProvenance(parent1, [childA], 'mine', 'cset_same');
    attachOrchestrationProvenance(parent2, [childB], 'mine', 'cset_same');

    expect(parent1.output.orchestrationProvenance!.orchestrationHash)
      .not.toBe(parent2.output.orchestrationProvenance!.orchestrationHash);
  });

  it('empty child bundles produces valid but empty provenance', () => {
    const parent = makeParentBundle();

    attachOrchestrationProvenance(parent, [], 'mine', 'cset_empty');

    const prov = parent.output.orchestrationProvenance;
    expect(prov).toBeDefined();
    expect(prov!.childTraceRefs).toHaveLength(0);
    expect(prov!.orchestrationHash).toBeTruthy();
  });
});
