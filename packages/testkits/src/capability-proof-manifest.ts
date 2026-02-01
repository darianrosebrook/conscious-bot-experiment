/**
 * Capability Proof Manifest v1 — Primitive-Agnostic
 *
 * Runtime-safe module (no vitest imports). Defines the reusable
 * cross-primitive shape for proof manifests. P21 is the first consumer;
 * future primitives (P3, P15, etc.) reuse the same structure.
 */

// ── Invariant Evidence ──────────────────────────────────────────────

export interface InvariantEvidence {
  /** Canonical invariant id, e.g., "P21A-INV-01" */
  id: string;
  /** Human-readable invariant name, e.g., "determinism" */
  name: string;
  /** One-line description of what the invariant asserts */
  description: string;
  /** Relative path to the suite file that enforces this invariant */
  suiteFile: string;
  /** Names of proving surfaces where this invariant has been certified */
  provingSurfaces: string[];
  /** Current certification status */
  status: 'proven' | 'partial' | 'not_started';
  /** Extension that must be declared for this invariant to activate (null for base) */
  extensionDependency?: string;
  /** Free-text notes */
  notes?: string;
}

// ── Extension Evidence ──────────────────────────────────────────────

export interface ExtensionEvidence {
  /** Extension id, e.g., "risk_components_v1" */
  id: string;
  /** What this extension provides */
  description: string;
  /** Current certification status */
  status: 'proven' | 'partial' | 'not_started';
  /** Surfaces that declare this extension */
  declaringSurfaces: string[];
  /** Invariant IDs that this extension gates */
  activatedInvariants: string[];
  /** What happens if declared but not implemented */
  failClosedRule: string;
}

// ── Capability Proof Manifest ───────────────────────────────────────

export interface CapabilityProofManifest {
  /** Stable capability id, e.g., "p21.a" or "p21.b" */
  capability_id: string;
  /** Semantic contract version */
  contract_version: string;
  /** Suite source metadata */
  suite: {
    /** Relative path to the conformance suite source */
    source: string;
    /** Git-relative path for stable cross-environment references */
    source_ref?: string;
    /** Content hash of suite source — placeholder until CI generates */
    hash?: string;
  };
  /** Reference fixture sets used */
  fixtures: {
    /** Fixture set id, e.g., "mob-domain/v1" */
    id: string;
    /** Content hash — placeholder until CI generates */
    hash?: string;
  }[];
  /** Adapter implementations tested (one per proving surface) */
  adapters: {
    /** Human-readable adapter name, e.g., "Minecraft TrackSet" */
    name: string;
    /** Relative path to the adapter test file */
    path: string;
    /** Git commit at which adapter was last certified */
    git_commit?: string;
  }[];
  /** IDs of proving surfaces that contributed to this manifest */
  proving_surfaces: string[];
  /** Configuration parameters used during certification */
  config: Record<string, unknown>;
  /** Per-invariant evidence */
  invariants: InvariantEvidence[];
  /** Per-extension evidence */
  extensions: ExtensionEvidence[];
  /** Aggregate results */
  results: {
    /** Whether all active invariants passed */
    passed: boolean;
    /** IDs of invariants that passed */
    invariants_passed: string[];
    /** IDs of invariants that failed */
    invariants_failed: string[];
    /** Test runner identity, e.g., "vitest@3.x" */
    runner: string;
    /** Runtime environment descriptor, e.g., "node@22.x / darwin-arm64" */
    runtime?: string;
    /** ISO timestamp of last run */
    timestamp?: string;
  };
}
