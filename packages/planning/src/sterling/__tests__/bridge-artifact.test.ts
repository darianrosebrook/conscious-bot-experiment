/**
 * M3: Bridge artifact tests.
 *
 * Proves:
 * 1. acquire_for_craft bridge carries correct segment refs, witnesses, and hash
 * 2. craft_for_build bridge carries correct deficit → resolution witnesses
 * 3. Bridge hash is deterministic (same inputs → same hash)
 * 4. Bridge hash changes when witnesses change (content sensitivity)
 * 5. Bridge hash changes when segment refs change (solver sensitivity)
 * 6. Replay: same bridge can be verified from the same inputs
 * 7. Failure attribution: bridge carries enough info to distinguish upstream
 *    failure, bridge contract violation, and downstream failure
 */

import { describe, it, expect } from 'vitest';
import {
  buildAcquireForCraftBridge,
  buildCraftForBuildBridge,
  segmentRefFromBundle,
} from '../bridge-artifact';
import {
  computeBundleInput,
  computeBundleOutput,
  createSolveBundle,
  attachSterlingIdentity,
} from '../solve-bundle';
import type { SolveBundle } from '../solve-bundle-types';

// ── Helpers ──

function makeBundle(solverId: string, opts?: { solved?: boolean; planId?: string; trace?: string }): SolveBundle {
  const input = computeBundleInput({
    solverId,
    contractVersion: 1,
    definitions: [{ action: 'test', produces: [{ name: 'test', count: 1 }], consumes: [] }],
    inventory: { test: 1 },
    goal: { test: 1 },
    nearbyBlocks: [],
  });
  const output = computeBundleOutput({
    planId: opts?.planId ?? `plan-${solverId}`,
    solved: opts?.solved ?? true,
    steps: [{ action: 'test' }],
    totalNodes: 5,
    durationMs: 10,
    solutionPathLength: 1,
  });
  const bundle = createSolveBundle(input, output, { issues: [], version: 'test' });
  if (opts?.trace) {
    attachSterlingIdentity(bundle, {
      traceBundleHash: opts.trace,
      engineCommitment: 'test-engine',
      operatorRegistryHash: 'test-registry',
    });
  }
  return bundle;
}

// ── acquire_for_craft ──

describe('M3: acquire_for_craft bridge', () => {
  it('carries correct segment refs and witnesses', () => {
    const upstream = makeBundle('minecraft.acquisition', { trace: 'trace_acq' });
    const downstream = makeBundle('minecraft.crafting', { trace: 'trace_craft' });

    const bridge = buildAcquireForCraftBridge(
      upstream,
      downstream,
      { oak_log: 3 },          // acquired
      { oak_log: 3, stick: 2 }, // required by crafting
    );

    expect(bridge.kind).toBe('acquire_for_craft');
    expect(bridge.semanticsVersion).toBe('1.0.0');
    expect(bridge.bridgeHash).toBeTruthy();

    // Upstream ref
    expect(bridge.upstreamRef.solverId).toBe('minecraft.acquisition');
    expect(bridge.upstreamRef.bundleHash).toBe(upstream.bundleHash);
    expect(bridge.upstreamRef.traceBundleHash).toBe('trace_acq');

    // Downstream ref
    expect(bridge.downstreamRef.solverId).toBe('minecraft.crafting');
    expect(bridge.downstreamRef.bundleHash).toBe(downstream.bundleHash);
    expect(bridge.downstreamRef.traceBundleHash).toBe('trace_craft');

    // Precondition: what crafting needs
    expect(bridge.precondition.kind).toBe('items_available');
    expect(bridge.precondition.requiredItems).toEqual({ oak_log: 3, stick: 2 });
    expect(bridge.precondition.witnessHash).toBeTruthy();

    // Postcondition: what acquisition produced
    expect(bridge.postcondition.kind).toBe('items_produced');
    expect(bridge.postcondition.producedItems).toEqual({ oak_log: 3 });
    expect(bridge.postcondition.solved).toBe(true);
  });

  it('hash is deterministic', () => {
    const upstream = makeBundle('minecraft.acquisition');
    const downstream = makeBundle('minecraft.crafting');

    const b1 = buildAcquireForCraftBridge(upstream, downstream, { oak_log: 3 }, { oak_log: 3 });
    const b2 = buildAcquireForCraftBridge(upstream, downstream, { oak_log: 3 }, { oak_log: 3 });

    expect(b1.bridgeHash).toBe(b2.bridgeHash);
  });

  it('hash changes when acquired items change', () => {
    const upstream = makeBundle('minecraft.acquisition');
    const downstream = makeBundle('minecraft.crafting');

    const b1 = buildAcquireForCraftBridge(upstream, downstream, { oak_log: 3 }, { oak_log: 3 });
    const b2 = buildAcquireForCraftBridge(upstream, downstream, { oak_log: 5 }, { oak_log: 3 });

    expect(b1.bridgeHash).not.toBe(b2.bridgeHash);
  });

  it('hash changes when upstream bundle changes', () => {
    const upstream1 = makeBundle('minecraft.acquisition', { planId: 'plan-1' });
    const upstream2 = makeBundle('minecraft.acquisition', { planId: 'plan-2' });
    const downstream = makeBundle('minecraft.crafting');

    const b1 = buildAcquireForCraftBridge(upstream1, downstream, { oak_log: 3 }, { oak_log: 3 });
    const b2 = buildAcquireForCraftBridge(upstream2, downstream, { oak_log: 3 }, { oak_log: 3 });

    // Different planId → different bundleHash → different bridgeHash
    expect(b1.bridgeHash).not.toBe(b2.bridgeHash);
  });

  it('carries capability decisions when provided', () => {
    const upstream = makeBundle('minecraft.acquisition');
    const downstream = makeBundle('minecraft.crafting');

    const upDecision = {
      declarationDigest: 'digest_acq',
      solverId: 'minecraft.acquisition',
      proofStatus: 'structural' as const,
      requiredPrimitives: ['CB-P01', 'CB-P04'],
      warnings: [],
    };

    const bridge = buildAcquireForCraftBridge(
      upstream, downstream, { oak_log: 3 }, { oak_log: 3 },
      { upstreamDecision: upDecision },
    );

    expect(bridge.upstreamDecision).toBeDefined();
    expect(bridge.upstreamDecision!.solverId).toBe('minecraft.acquisition');
    expect(bridge.downstreamDecision).toBeUndefined();
  });
});

// ── craft_for_build ──

describe('M3: craft_for_build bridge', () => {
  it('carries correct deficit → resolution witnesses', () => {
    const upstream = makeBundle('minecraft.crafting', { trace: 'trace_craft' });
    const downstream = makeBundle('minecraft.building', { trace: 'trace_build', solved: false });

    const bridge = buildCraftForBuildBridge(
      upstream,
      downstream,
      { cobblestone: 12, oak_planks: 6 },   // produced by crafting
      { cobblestone: 12, oak_planks: 6 },    // deficit declared by building
    );

    expect(bridge.kind).toBe('craft_for_build');

    // Precondition: deficit that building declared
    expect(bridge.precondition.kind).toBe('material_deficit_resolved');
    expect(bridge.precondition.requiredItems).toEqual({ cobblestone: 12, oak_planks: 6 });

    // Postcondition: what crafting produced
    expect(bridge.postcondition.kind).toBe('items_produced');
    expect(bridge.postcondition.producedItems).toEqual({ cobblestone: 12, oak_planks: 6 });
    expect(bridge.postcondition.solved).toBe(true);

    // Downstream ref points to the building solve that declared the deficit
    expect(bridge.downstreamRef.solverId).toBe('minecraft.building');
    expect(bridge.downstreamRef.traceBundleHash).toBe('trace_build');
  });

  it('hash is deterministic', () => {
    const upstream = makeBundle('minecraft.crafting');
    const downstream = makeBundle('minecraft.building');

    const b1 = buildCraftForBuildBridge(upstream, downstream, { cobblestone: 12 }, { cobblestone: 12 });
    const b2 = buildCraftForBuildBridge(upstream, downstream, { cobblestone: 12 }, { cobblestone: 12 });

    expect(b1.bridgeHash).toBe(b2.bridgeHash);
  });

  it('hash changes when deficit changes', () => {
    const upstream = makeBundle('minecraft.crafting');
    const downstream = makeBundle('minecraft.building');

    const b1 = buildCraftForBuildBridge(upstream, downstream, { cobblestone: 12 }, { cobblestone: 12 });
    const b2 = buildCraftForBuildBridge(upstream, downstream, { cobblestone: 12 }, { cobblestone: 24 });

    expect(b1.bridgeHash).not.toBe(b2.bridgeHash);
  });

  it('failure attribution: upstream solved=false distinguishes acquisition failure', () => {
    const upstream = makeBundle('minecraft.crafting', { solved: false });
    const downstream = makeBundle('minecraft.building');

    const bridge = buildCraftForBuildBridge(upstream, downstream, {}, { cobblestone: 12 });

    // Bridge exists but postcondition shows upstream failed
    expect(bridge.postcondition.solved).toBe(false);
    expect(bridge.postcondition.producedItems).toEqual({});
    // Bridge hash still computable — failure is typed, not an exception
    expect(bridge.bridgeHash).toBeTruthy();
  });
});

// ── segmentRefFromBundle ──

describe('segmentRefFromBundle', () => {
  it('extracts all fields from bundle with Sterling identity', () => {
    const bundle = makeBundle('minecraft.crafting', { trace: 'trace_abc', planId: 'plan-42' });
    const ref = segmentRefFromBundle(bundle);

    expect(ref.solverId).toBe('minecraft.crafting');
    expect(ref.bundleHash).toBe(bundle.bundleHash);
    expect(ref.traceBundleHash).toBe('trace_abc');
    expect(ref.planId).toBe('plan-42');
  });

  it('handles absent Sterling identity gracefully', () => {
    const bundle = makeBundle('minecraft.crafting');
    const ref = segmentRefFromBundle(bundle);

    expect(ref.solverId).toBe('minecraft.crafting');
    expect(ref.bundleHash).toBeTruthy();
    expect(ref.traceBundleHash).toBeUndefined();
  });
});
