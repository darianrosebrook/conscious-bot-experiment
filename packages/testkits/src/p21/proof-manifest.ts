/**
 * P21-Specific Proof Manifest Generators
 *
 * Runtime-safe (no vitest imports). Populates the primitive-agnostic
 * CapabilityProofManifest with P21-specific invariant descriptions,
 * extension info, and the invariant constant arrays.
 */

import type {
  CapabilityProofManifest,
  InvariantEvidence,
  ExtensionEvidence,
} from '../capability-proof-manifest';

// ── P21-A Invariant Catalog ─────────────────────────────────────────

const P21A_INVARIANT_CATALOG: Omit<InvariantEvidence, 'provingSurfaces' | 'status'>[] = [
  {
    id: 'P21A-INV-01',
    name: 'determinism',
    description: 'Same inputs produce identical snapshots and deltas',
    suiteFile: 'packages/testkits/src/p21/p21a-conformance-suite.ts',
  },
  {
    id: 'P21A-INV-02',
    name: 'boundedness',
    description: 'Track count never exceeds declared trackCap',
    suiteFile: 'packages/testkits/src/p21/p21a-conformance-suite.ts',
  },
  {
    id: 'P21A-INV-03',
    name: 'event_sparsity',
    description: 'Steady state delta rate <= declared sparsity budget',
    suiteFile: 'packages/testkits/src/p21/p21a-conformance-suite.ts',
  },
  {
    id: 'P21A-INV-04',
    name: 'uncertainty_monotonicity',
    description: 'Unobserved track has non-decreasing pUnknown (and non-increasing risk in conservative mode)',
    suiteFile: 'packages/testkits/src/p21/p21a-conformance-suite.ts',
  },
  {
    id: 'P21A-INV-04b',
    name: 'predictive_accountability',
    description: 'Predictive mode requires risk_components_v1 or predictive_model extension',
    suiteFile: 'packages/testkits/src/p21/p21a-conformance-suite.ts',
    extensionDependency: undefined, // mode-gated, not extension-gated
    notes: 'Only activates when mode=predictive',
  },
  {
    id: 'P21A-INV-05',
    name: 'uncertainty_suppression',
    description: 'pUnknown > threshold suppresses classification-derived risk (base: overall riskLevel ≤ low; extension: classificationRisk suppressed, presenceRisk intentionally unconstrained)',
    suiteFile: 'packages/testkits/src/p21/p21a-conformance-suite.ts',
    notes: 'Base contract only constrains classification-derived risk. With risk_components_v1, presence risk may keep riskLevel elevated — this is intentional. Does not constrain overall riskLevel to ≤ low when presence risk is non-zero.',
  },
  {
    id: 'P21A-INV-06',
    name: 'hysteresis',
    description: 'Oscillating proximity produces bounded reclassified delta count',
    suiteFile: 'packages/testkits/src/p21/p21a-conformance-suite.ts',
  },
  {
    id: 'P21A-INV-07',
    name: 'identity_persistence',
    description: 'Occlusion gap followed by reappearance associates to same trackId',
    suiteFile: 'packages/testkits/src/p21/p21a-conformance-suite.ts',
  },
  {
    id: 'P21A-INV-08',
    name: 'new_threat_completeness',
    description: 'Every new_threat delta includes .track payload',
    suiteFile: 'packages/testkits/src/p21/p21a-conformance-suite.ts',
  },
  {
    id: 'P21A-INV-09',
    name: 'features_not_required',
    description: 'Features field does not affect trackId generation',
    suiteFile: 'packages/testkits/src/p21/p21a-conformance-suite.ts',
  },
  {
    id: 'P21A-INV-10',
    name: 'id_robustness',
    description: 'New entityId with same class and position associates to same trackId',
    suiteFile: 'packages/testkits/src/p21/p21a-conformance-suite.ts',
    extensionDependency: 'id_robustness',
    notes: 'Opt-in: only activates when id_robustness extension is declared',
  },
];

// ── P21-B Invariant Catalog ─────────────────────────────────────────

const P21B_INVARIANT_CATALOG: Omit<InvariantEvidence, 'provingSurfaces' | 'status'>[] = [
  {
    id: 'P21B-INV-01',
    name: 'delta_budget',
    description: 'Saliency events per envelope <= declared deltaCap',
    suiteFile: 'packages/testkits/src/p21/p21b-conformance-suite.ts',
  },
  {
    id: 'P21B-INV-02',
    name: 'envelope_determinism',
    description: 'Identical inputs produce byte-identical envelope JSON (single-runtime, Node JSON.stringify with stable construction order)',
    suiteFile: 'packages/testkits/src/p21/p21b-conformance-suite.ts',
    notes: 'Canonicalization boundary: determinism is proven within a single Node runtime via JSON.stringify with stable object construction paths. Cross-runtime transport determinism (requiring sorted-key canonical encoding) is not claimed.',
  },
  {
    id: 'P21B-INV-03',
    name: 'producer_validation',
    description: 'Every new_threat event in envelope includes .track',
    suiteFile: 'packages/testkits/src/p21/p21b-conformance-suite.ts',
  },
  {
    id: 'P21B-INV-04',
    name: 'snapshot_cadence',
    description: 'Snapshot appears within declared snapshotIntervalTicks',
    suiteFile: 'packages/testkits/src/p21/p21b-conformance-suite.ts',
  },
];

// ── Extension Catalog ───────────────────────────────────────────────

const P21_EXTENSION_CATALOG: Omit<ExtensionEvidence, 'declaringSurfaces' | 'status'>[] = [
  {
    id: 'risk_components_v1',
    description: 'Decomposed risk classification (classificationRisk + presenceRisk) with normative combiner. Presence risk is intentionally unconstrained by pUnknown — a nearby entity is still nearby even under classification uncertainty.',
    activatedInvariants: ['P21A-INV-05'],
    failClosedRule: 'If declared but classifyRiskDetailed is not implemented, INV-5 fails with expect(classifier.classifyRiskDetailed).toBeDefined()',
  },
  {
    id: 'id_robustness',
    description: 'Association resilience to entityId changes (same class + position → same trackId)',
    activatedInvariants: ['P21A-INV-10'],
    failClosedRule: 'If declared but association logic does not match, INV-10 assertion fails',
  },
  {
    id: 'predictive_model',
    description: 'Predictive belief mode with risk persistence under uncertainty',
    activatedInvariants: ['P21A-INV-04b'],
    failClosedRule: 'If predictive mode is used without risk_components_v1 or predictive_model declared, INV-4b fails',
  },
];

// ── Generators ──────────────────────────────────────────────────────

/**
 * Generate a P21-A proof manifest with current invariant catalog.
 * Surfaces and status are populated based on the provided adapters.
 */
export function generateP21AManifest(opts: {
  contract_version: string;
  adapters: { name: string; path: string; git_commit?: string }[];
  config: Record<string, unknown>;
  surfaceResults?: Map<string, Set<string>>; // surface name → set of passed invariant IDs
}): CapabilityProofManifest {
  const { contract_version, adapters, config, surfaceResults } = opts;

  const invariants: InvariantEvidence[] = P21A_INVARIANT_CATALOG.map((inv) => {
    const surfaces: string[] = [];
    let status: InvariantEvidence['status'] = 'not_started';

    if (surfaceResults) {
      for (const [surface, passedIds] of surfaceResults) {
        if (passedIds.has(inv.id)) {
          surfaces.push(surface);
        }
      }
      if (surfaces.length > 0) {
        status = surfaces.length >= adapters.length ? 'proven' : 'partial';
      }
    }

    return { ...inv, provingSurfaces: surfaces, status };
  });

  const extensions: ExtensionEvidence[] = P21_EXTENSION_CATALOG.map((ext) => ({
    ...ext,
    declaringSurfaces: [],
    status: 'not_started' as const,
  }));

  const passedIds = invariants.filter((i) => i.status === 'proven').map((i) => i.id);
  const failedIds = invariants.filter((i) => i.status !== 'proven').map((i) => i.id);

  const provingSurfaceIds = surfaceResults ? [...surfaceResults.keys()] : [];

  return {
    capability_id: 'p21.a',
    contract_version,
    suite: {
      source: 'packages/testkits/src/p21/p21a-conformance-suite.ts',
      source_ref: 'packages/testkits/src/p21/p21a-conformance-suite.ts',
    },
    fixtures: [
      { id: 'mob-domain/v1' },
      { id: 'security-domain/v1' },
    ],
    adapters,
    proving_surfaces: provingSurfaceIds,
    config,
    invariants,
    extensions,
    results: {
      passed: failedIds.length === 0,
      invariants_passed: passedIds,
      invariants_failed: failedIds,
      runner: 'vitest@3.x',
    },
  };
}

/**
 * Generate a P21-B proof manifest with current invariant catalog.
 */
export function generateP21BManifest(opts: {
  contract_version: string;
  adapters: { name: string; path: string; git_commit?: string }[];
  config: Record<string, unknown>;
  surfaceResults?: Map<string, Set<string>>;
}): CapabilityProofManifest {
  const { contract_version, adapters, config, surfaceResults } = opts;

  const invariants: InvariantEvidence[] = P21B_INVARIANT_CATALOG.map((inv) => {
    const surfaces: string[] = [];
    let status: InvariantEvidence['status'] = 'not_started';

    if (surfaceResults) {
      for (const [surface, passedIds] of surfaceResults) {
        if (passedIds.has(inv.id)) {
          surfaces.push(surface);
        }
      }
      if (surfaces.length > 0) {
        status = surfaces.length >= adapters.length ? 'proven' : 'partial';
      }
    }

    return { ...inv, provingSurfaces: surfaces, status };
  });

  const passedIds = invariants.filter((i) => i.status === 'proven').map((i) => i.id);
  const failedIds = invariants.filter((i) => i.status !== 'proven').map((i) => i.id);

  const provingSurfaceIds = surfaceResults ? [...surfaceResults.keys()] : [];

  return {
    capability_id: 'p21.b',
    contract_version,
    suite: {
      source: 'packages/testkits/src/p21/p21b-conformance-suite.ts',
      source_ref: 'packages/testkits/src/p21/p21b-conformance-suite.ts',
    },
    fixtures: [
      { id: 'mob-domain/v1' },
    ],
    adapters,
    proving_surfaces: provingSurfaceIds,
    config,
    invariants,
    extensions: [],
    results: {
      passed: failedIds.length === 0,
      invariants_passed: passedIds,
      invariants_failed: failedIds,
      runner: 'vitest@3.x',
    },
  };
}
