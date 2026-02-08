/**
 * Evidence Infrastructure Type Definitions
 *
 * Types for SolveBundle (content-addressed audit trail), CompatReport
 * (preflight rule validation), and SearchHealthMetrics (A* diagnostics).
 *
 * All types are strictly additive — no behavioral change to solve logic.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Content Addressing
// ============================================================================

/** SHA-256 truncated to 16 hex chars (64 bits of collision resistance) */
export type ContentHash = string;

// ============================================================================
// Solve Bundle
// ============================================================================

/** Input snapshot captured before a Sterling solve call */
export interface SolveBundleInput {
  solverId: string;
  executionMode: string | undefined;
  contractVersion: number;
  /** Hash of rules, modules, or domain-specific definition */
  definitionHash: ContentHash;
  /** Hash of inventory + virtual tokens */
  initialStateHash: ContentHash;
  goalHash: ContentHash;
  nearbyBlocksHash: ContentHash;
  codeVersion: string;
  /** Tool progression only */
  tierMatrixVersion?: string;
  /** Rule count or module count */
  definitionCount: number;
  /** Caller-supplied objective weights (undefined if none provided) */
  objectiveWeightsProvided?: ObjectiveWeights;
  /** Always populated: provided values or DEFAULT_OBJECTIVE_WEIGHTS */
  objectiveWeightsEffective: ObjectiveWeights;
  /** Whether weights were explicitly provided or defaulted */
  objectiveWeightsSource: ObjectiveWeightsSource;
  /** Context tokens injected into wire inventory (sorted). Acquisition solver only. */
  contextTokensInjected?: string[];
  /** Content-addressed digest of the executor's leaf contracts.
   *  When contract entries are provided, this is the contract-aware digest
   *  (sensitive to both leaf names and field descriptors).
   *  When only leaf names are provided, this is the names-only digest.
   *  Enables capability handshake with Sterling. */
  leafRegistryDigest?: ContentHash;
  /** Digest of required fields only (non-? fields). Used for gating/compat:
   *  a change here means the minimum safe ABI has changed. */
  leafContractRequiredDigest?: ContentHash;
  /** Digest of all fields (required + optional). Used for observability:
   *  a change here means the contract surface grew (possibly backward-compatible). */
  leafContractFullDigest?: ContentHash;
}

/** Output snapshot captured after a Sterling solve call */
export interface SolveBundleOutput {
  planId: string | null;
  solved: boolean;
  /** Hash of ordered action IDs */
  stepsDigest: ContentHash;
  searchStats: {
    totalNodes: number;
    durationMs: number;
    solutionPathLength: number;
  };
  searchHealth?: SearchHealthMetrics;
  /** Structured explanation of the solve outcome (populated when maxNodes is provided) */
  rationale?: SolveRationale;
  /** Opaque Sterling-provided identities. NOT included in bundleHash. */
  sterlingIdentity?: SterlingIdentity;
}

/** Content-addressed audit trail for a single solve round-trip */
export interface SolveBundle {
  /** Content-addressed: `${solverId}:${bundleHash}` */
  bundleId: string;
  /** SHA-256 of canonicalized {input, output, compatReport} excluding nondeterministic fields */
  bundleHash: ContentHash;
  /** Capture time (excluded from bundleHash) */
  timestamp: number;
  input: SolveBundleInput;
  output: SolveBundleOutput;
  compatReport: CompatReport;
}

// ============================================================================
// Multi-Objective Weights
// ============================================================================

/** Weights for multi-objective optimization (cost/time/risk tradeoff) */
export interface ObjectiveWeights {
  costWeight?: number;
  timeWeight?: number;
  riskWeight?: number;
}

/** Default single-objective weights: cost-only optimization */
export const DEFAULT_OBJECTIVE_WEIGHTS: ObjectiveWeights = {
  costWeight: 1.0,
  timeWeight: 0.0,
  riskWeight: 0.0,
};

/** Whether objective weights were explicitly provided or defaulted */
export type ObjectiveWeightsSource = 'provided' | 'default';

// ============================================================================
// Compat Linter
// ============================================================================

export type CompatSeverity = 'error' | 'warning';

export interface CompatIssue {
  severity: CompatSeverity;
  code: string;
  ruleAction: string;
  message: string;
}

export interface CompatReport {
  /** true if zero errors (warnings OK) */
  valid: boolean;
  issues: CompatIssue[];
  /** Lint time (excluded from bundleHash) */
  checkedAt: number;
  definitionCount: number;
}

// ============================================================================
// Search Health
// ============================================================================

export interface SearchHealthMetrics {
  nodesExpanded: number;
  frontierPeak: number;
  hMin: number;
  hMax: number;
  hMean: number;
  hVariance: number;
  fMin: number;
  fMax: number;
  /** Fraction of nodes sharing the modal h value (0..1) */
  pctSameH: number;
  terminationReason: 'goal_found' | 'max_nodes' | 'frontier_exhausted' | 'error';
  branchingEstimate: number;
  /** Protocol version — absent in pre-emission bundles */
  searchHealthVersion?: number;
}

export interface DegeneracyReport {
  isDegenerate: boolean;
  reasons: string[];
}

// ============================================================================
// Solve Rationale (Explanation Infrastructure)
// ============================================================================

/** Structured explanation of a solve outcome — attached to SolveBundleOutput */
export interface SolveRationale {
  boundingConstraints: {
    maxNodes: number;
    objectiveWeightsEffective: ObjectiveWeights;
    objectiveWeightsSource: ObjectiveWeightsSource;
  };
  searchEffort: {
    nodesExpanded: number;
    frontierPeak: number;
    branchingEstimate: number;
  };
  searchTermination: {
    terminationReason: string;
    isDegenerate: boolean;
    degeneracyReasons: string[];
  };
  shapingEvidence: {
    compatValid: boolean;
    issueCount: number;
    errorCodes: string[];
  };
}

// ============================================================================
// Sterling Identity (Solve-Scoped, NOT Included in BundleHash)
// ============================================================================

/**
 * Opaque Sterling-provided identity fields from the solve `complete` message.
 *
 * These fields are attached to SolveBundleOutput AFTER bundle hash computation
 * and are explicitly EXCLUDED from bundleHash in hashableBundlePayload().
 *
 * Three-step identity chain:
 *   (A) traceBundleHash — solve-time (Sterling search identity)
 *   (B) bundleHash — execution-time (CB solver identity)
 *   (C) episodeHash — report-time (execution chain identity)
 *
 * CB computes bindingHash = contentHash("binding:v1:" + traceBundleHash + ":" + bundleHash)
 * as its own regression anchor. Sterling never sees bundleHash in its
 * identity computation.
 */
export interface SterlingIdentity {
  /** Content-addressed hash of Sterling's solve trace. Absent until server emits it. */
  traceBundleHash?: string;
  /** Git SHA or build digest of the Sterling engine at solve time. */
  engineCommitment?: string;
  /** Content hash of the operator/rule set loaded for this domain. */
  operatorRegistryHash?: string;
  /**
   * Sterling-authored completeness declaration (CB forwards verbatim).
   * Typed as Record<string, unknown> until Sterling's payload shape is finalized.
   * Expected fields (not yet enforced): edgesComplete, deltasComplete, domain, etc.
   */
  completenessDeclaration?: Record<string, unknown>;
  /**
   * CB-local regression anchor linking Sterling solve identity to CB bundle identity.
   * Computed as contentHash("binding:v1:" + traceBundleHash + ":" + bundleHash) when both are available.
   * NOT included in bundleHash (lives on sterlingIdentity which is excluded).
   */
  bindingHash?: string;
}

// ============================================================================
// Episode Outcome Classification
// ============================================================================

/**
 * Outcome taxonomy for episode reporting.
 *
 * Includes explicit success classification for analytics/auditability.
 * Failure classes map to Sterling's CertifiedFailureV1 categories.
 * Used in report_episode payloads for domain-specific failure routing.
 */
export type EpisodeOutcomeClass =
  | 'EXECUTION_SUCCESS'
  | 'ILLEGAL_TRANSITION'
  | 'PRECONDITION_UNSATISFIED'
  | 'SEARCH_EXHAUSTED'
  | 'EXECUTION_FAILURE'
  | 'STRATEGY_INFEASIBLE'
  | 'DECOMPOSITION_GAP'
  | 'SUPPORT_INFEASIBLE'
  | 'HEURISTIC_DEGENERACY'
  | 'UNCLASSIFIED';

/**
 * How the outcome class was determined.
 * - 'structured': from typed fields (solved, searchHealth, compat issues)
 * - 'heuristic': from best-effort string matching on error messages
 *
 * Consumers should treat 'heuristic' classifications as provisional.
 * Learning signals and hard enforcement should only use 'structured' sources.
 */
export type OutcomeClassSource = 'structured' | 'heuristic';

/**
 * Classified outcome with provenance — tells consumers whether the
 * classification came from structured signals or best-effort heuristics.
 */
export interface ClassifiedOutcome {
  outcomeClass: EpisodeOutcomeClass;
  source: OutcomeClassSource;
}

// ============================================================================
// Episode Linkage (shared across all solver reportEpisodeResult signatures)
// ============================================================================

/**
 * Identity linkage payload sent with report_episode.
 *
 * Exported here as the single source of truth so that solver
 * reportEpisodeResult signatures cannot drift.
 *
 * Phase 1 identity chain fields (engineCommitment, operatorRegistryHash)
 * are gated behind STERLING_REPORT_IDENTITY_FIELDS env var. CB parses and
 * stores them from solve responses; forwarding on report_episode requires
 * Sterling to accept the fields (default OFF until confirmed).
 */
export interface EpisodeLinkage {
  bundleHash?: string;
  traceBundleHash?: string;
  outcomeClass?: EpisodeOutcomeClass;
  /**
   * Sterling engine version at solve time. Forwarded behind toggle.
   * Phase 1: parsed from solve response, stored in SterlingIdentity.
   */
  engineCommitment?: string;
  /**
   * Content hash of operator/rule set loaded at solve time. Forwarded behind toggle.
   * Phase 1: parsed from solve response, stored in SterlingIdentity.
   */
  operatorRegistryHash?: string;
}

// ============================================================================
// Solve Join Keys (deferred episode reporting)
// ============================================================================

/**
 * Solve-time identity keys for deferred episode reporting.
 * Stored in task metadata at solve time. Consumed at report time.
 *
 * Phase 1 identity fields (engineCommitment, operatorRegistryHash) are stored
 * here so reporters can forward them without a bundle store lookup.
 */
export interface SolveJoinKeys {
  /** planId that produced these keys — used to match keys to the correct episode */
  planId: string;
  /** Content-addressed CB bundle identity */
  bundleHash: string;
  /** Sterling solve trace identity (absent until server emits it) */
  traceBundleHash?: string;
  /** Solver that produced these keys — guards against cross-domain planId collisions */
  solverId?: string;
  // ── Phase 1 identity fields (stored for report-time forwarding) ──
  /** Sterling engine version at solve time. Forwarded behind toggle. */
  engineCommitment?: string;
  /** Content hash of operator/rule set loaded at solve time. Forwarded behind toggle. */
  operatorRegistryHash?: string;
}

// ============================================================================
// Episode Ack (report_episode response)
// ============================================================================

/**
 * Parsed response from Sterling's report_episode_ack.
 * episode_hash is minted at report-time (not solve-time).
 */
export interface EpisodeAck {
  /** Content-addressed episode identity from Sterling. Absent until server emits it. */
  episodeHash?: string;
  /** Echoed requestId for correlation. */
  requestId?: string;
}

// ============================================================================
// Execution Mode
// ============================================================================

/**
 * Execution mode for Sterling solve calls.
 *
 * - 'dev': default development mode, relaxed validation
 * - 'certifying': strict mode requiring trace_bundle_hash presence
 * - 'replay': replay mode for deterministic reproduction (Regime A)
 */
export type ExecutionMode = 'dev' | 'certifying' | 'replay';
