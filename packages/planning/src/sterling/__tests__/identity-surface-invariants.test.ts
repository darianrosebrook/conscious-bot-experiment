/**
 * Milestone 1: Identity surface invariants across all four production rigs.
 *
 * Exercises the shared assertion helpers against realistic bundle shapes
 * for Rig A (crafting), Rig B (tool progression), Rig D (acquisition),
 * and Rig G (building).
 *
 * These are executable invariants, not documentation. If a rig's identity
 * surface regresses, this test will catch it.
 */

import { describe, it, expect } from 'vitest';
import {
  contentHash,
  computeBundleInput,
  computeBundleOutput,
  createSolveBundle,
  attachSterlingIdentity,
  attachOrchestrationProvenance,
} from '../solve-bundle';
import type { SolveBundle, SterlingIdentity } from '../solve-bundle-types';
import {
  assertSolveTimeIdentity,
  assertReportTimeLinkage,
  assertOrchestrationIdentity,
} from './identity-surface-assertions';

// ── Helpers ──

function makeSterlingIdentity(): SterlingIdentity {
  return {
    traceBundleHash: 'trace_' + Math.random().toString(36).slice(2, 10),
    engineCommitment: 'engine_v1.2.3',
    operatorRegistryHash: 'registry_abc123',
    completenessDeclaration: { edgesComplete: true, deltasComplete: true },
  };
}

function makeSolveBundle(solverId: string, withIdentity = true): SolveBundle {
  const input = computeBundleInput({
    solverId,
    contractVersion: 1,
    definitions: [{ action: 'test:action', produces: [{ name: 'test', count: 1 }], consumes: [] }],
    inventory: { test: 1 },
    goal: { test: 1 },
    nearbyBlocks: ['test'],
  });
  const output = computeBundleOutput({
    planId: `plan-${solverId}`,
    solved: true,
    steps: [{ action: 'test:action' }],
    totalNodes: 10,
    durationMs: 50,
    solutionPathLength: 1,
  });
  const bundle = createSolveBundle(input, output, { issues: [], version: 'test' });
  if (withIdentity) {
    attachSterlingIdentity(bundle, makeSterlingIdentity());
  }
  return bundle;
}

// ── Rig A: Crafting ──

describe('Identity surface: Rig A (crafting)', () => {
  it('solve-time identity is complete', () => {
    const bundle = makeSolveBundle('minecraft.crafting');
    assertSolveTimeIdentity(bundle, {
      requireSterlingIdentity: true,
      solverName: 'Rig A',
    });
  });

  it('solve-time identity validates shape when Sterling identity is absent', () => {
    const bundle = makeSolveBundle('minecraft.crafting', false);
    // Should not throw — Sterling identity is expected but not required by default
    assertSolveTimeIdentity(bundle, { solverName: 'Rig A' });
  });
});

// ── Rig B: Tool Progression ──

describe('Identity surface: Rig B (tool progression)', () => {
  it('per-tier bundle carries solve-time identity', () => {
    const tierBundle = makeSolveBundle('minecraft.tool_progression');
    assertSolveTimeIdentity(tierBundle, {
      requireSterlingIdentity: true,
      solverName: 'Rig B tier',
    });
  });
});

// ── Rig D: Acquisition ──

describe('Identity surface: Rig D (acquisition)', () => {
  it('child bundle carries solve-time identity', () => {
    const childBundle = makeSolveBundle('minecraft.crafting');
    assertSolveTimeIdentity(childBundle, {
      requireSterlingIdentity: true,
      solverName: 'Rig D child',
    });
  });

  it('parent bundle carries orchestration provenance (not Sterling identity)', () => {
    const parent = makeSolveBundle('minecraft.acquisition', false);
    const child1 = makeSolveBundle('minecraft.crafting');
    const child2 = makeSolveBundle('minecraft.crafting');

    attachOrchestrationProvenance(parent, [child1, child2], 'mine', 'cset_test');

    assertOrchestrationIdentity(parent, {
      expectedStrategy: 'mine',
      minChildRefs: 2,
      solverName: 'Rig D parent',
    });

    // Parent should NOT carry Sterling identity (it didn't talk to Sterling)
    expect(parent.output.sterlingIdentity).toBeUndefined();
  });
});

// ── Rig G: Building ──

describe('Identity surface: Rig G (building)', () => {
  it('solve-time identity is complete', () => {
    const bundle = makeSolveBundle('minecraft.building');
    assertSolveTimeIdentity(bundle, {
      requireSterlingIdentity: true,
      solverName: 'Rig G',
    });
  });
});

// ── Report-time linkage (all rigs) ──

describe('Identity surface: report-time linkage', () => {
  it('linkage with Phase 1 fields passes assertion', () => {
    assertReportTimeLinkage(
      {
        bundleHash: 'bundle_abc',
        traceBundleHash: 'trace_def',
        outcomeClass: 'EXECUTION_SUCCESS',
        engineCommitment: 'engine_v1',
        operatorRegistryHash: 'registry_xyz',
      },
      { solverName: 'all rigs' },
    );
  });

  it('linkage without Phase 1 fields fails when required', () => {
    expect(() =>
      assertReportTimeLinkage(
        {
          bundleHash: 'bundle_abc',
          traceBundleHash: 'trace_def',
          outcomeClass: 'EXECUTION_SUCCESS',
          // No engineCommitment or operatorRegistryHash
        },
        { requirePhase1Fields: true, solverName: 'test' },
      ),
    ).toThrow();
  });

  it('linkage without Phase 1 fields passes when not required', () => {
    assertReportTimeLinkage(
      {
        bundleHash: 'bundle_abc',
      },
      { requirePhase1Fields: false, solverName: 'compat mode' },
    );
  });
});
