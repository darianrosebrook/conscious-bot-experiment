/**
 * Shared identity-surface assertion helper for Milestone 1.
 *
 * Defines what MUST be present at solve time and report time for each
 * production solver, and what is allowed to be absent only under explicit
 * compatibility mode.
 *
 * Usage:
 *   assertSolveTimeIdentity(bundle)        — after solve
 *   assertReportTimeLinkage(linkage)        — before report_episode
 *   assertOrchestrationIdentity(bundle)     — for orchestration bundles (Rig D parent)
 */

import { expect } from 'vitest';
import type { SolveBundle, SterlingIdentity, OrchestrationProvenance } from '../solve-bundle-types';
import type { EpisodeLinkage } from '../solve-bundle-types';

/**
 * Assert that a solve bundle carries the required identity fields at solve time.
 *
 * Required (must be present for any production solver):
 * - bundleHash (CB-local)
 * - bundleId (CB-local)
 *
 * Expected (should be present when Sterling is reachable):
 * - sterlingIdentity.traceBundleHash
 * - sterlingIdentity.engineCommitment
 * - sterlingIdentity.operatorRegistryHash
 * - sterlingIdentity.bindingHash (computed from traceBundleHash + bundleHash)
 *
 * Optional (present only when server emits):
 * - sterlingIdentity.completenessDeclaration
 */
export function assertSolveTimeIdentity(
  bundle: SolveBundle,
  options?: {
    /** When true, Sterling identity fields are required (not just expected). Default: false */
    requireSterlingIdentity?: boolean;
    /** Solver name for error messages */
    solverName?: string;
  },
): void {
  const label = options?.solverName ? `[${options.solverName}]` : '';

  // CB-local identity (always required)
  expect(bundle.bundleHash, `${label} bundleHash must be present`).toBeTruthy();
  expect(bundle.bundleId, `${label} bundleId must be present`).toBeTruthy();
  expect(bundle.bundleId).toContain(':'); // format: solverId:bundleHash

  const identity = bundle.output.sterlingIdentity;

  if (options?.requireSterlingIdentity) {
    expect(identity, `${label} sterlingIdentity required but absent`).toBeDefined();
    expect(identity!.traceBundleHash, `${label} traceBundleHash required`).toBeTruthy();
    expect(identity!.engineCommitment, `${label} engineCommitment required`).toBeTruthy();
    expect(identity!.operatorRegistryHash, `${label} operatorRegistryHash required`).toBeTruthy();
    expect(identity!.bindingHash, `${label} bindingHash required`).toBeTruthy();
  } else if (identity) {
    // If present, validate shape
    if (identity.traceBundleHash) {
      expect(typeof identity.traceBundleHash).toBe('string');
      expect(identity.bindingHash, `${label} bindingHash should be computed when traceBundleHash is present`).toBeTruthy();
    }
    if (identity.engineCommitment) {
      expect(typeof identity.engineCommitment).toBe('string');
    }
    if (identity.operatorRegistryHash) {
      expect(typeof identity.operatorRegistryHash).toBe('string');
    }
  }
}

/**
 * Assert that report-time linkage carries the required fields.
 *
 * Required (always):
 * - bundleHash
 *
 * Expected (default-on after G3):
 * - traceBundleHash
 * - outcomeClass
 * - engineCommitment
 * - operatorRegistryHash
 */
export function assertReportTimeLinkage(
  linkage: EpisodeLinkage,
  options?: {
    /** When true, Phase 1 identity fields are required. Default: true (G3 default-on) */
    requirePhase1Fields?: boolean;
    solverName?: string;
  },
): void {
  const label = options?.solverName ? `[${options.solverName}]` : '';
  const requirePhase1 = options?.requirePhase1Fields ?? true;

  expect(linkage.bundleHash, `${label} bundleHash must be present in report linkage`).toBeTruthy();

  if (linkage.traceBundleHash) {
    expect(typeof linkage.traceBundleHash).toBe('string');
  }

  if (linkage.outcomeClass) {
    expect(typeof linkage.outcomeClass).toBe('string');
  }

  if (requirePhase1) {
    expect(linkage.engineCommitment, `${label} engineCommitment expected (G3 default-on)`).toBeTruthy();
    expect(linkage.operatorRegistryHash, `${label} operatorRegistryHash expected (G3 default-on)`).toBeTruthy();
  }
}

/**
 * Assert that an orchestration bundle (e.g. Rig D parent) carries
 * orchestration provenance instead of Sterling identity.
 */
export function assertOrchestrationIdentity(
  bundle: SolveBundle,
  options?: {
    expectedStrategy?: string;
    minChildRefs?: number;
    solverName?: string;
  },
): void {
  const label = options?.solverName ? `[${options.solverName}]` : '';
  const prov = bundle.output.orchestrationProvenance;

  expect(prov, `${label} orchestrationProvenance must be present on orchestration bundle`).toBeDefined();
  expect(prov!.scope).toBe('orchestration');
  expect(prov!.orchestrationHash, `${label} orchestrationHash must be computed`).toBeTruthy();
  expect(prov!.candidateSetDigest, `${label} candidateSetDigest must be present`).toBeTruthy();

  if (options?.expectedStrategy) {
    expect(prov!.selectedStrategy).toBe(options.expectedStrategy);
  }

  if (options?.minChildRefs !== undefined) {
    expect(prov!.childTraceRefs.length).toBeGreaterThanOrEqual(options.minChildRefs);
  }

  // Each child ref should have at minimum solverId and bundleHash
  for (const ref of prov!.childTraceRefs) {
    expect(ref.solverId, `${label} child ref solverId`).toBeTruthy();
    expect(ref.bundleHash, `${label} child ref bundleHash`).toBeTruthy();
  }
}
