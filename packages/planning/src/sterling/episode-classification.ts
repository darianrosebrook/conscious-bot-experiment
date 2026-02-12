/**
 * Episode Outcome Classification (D8)
 *
 * Classifies solve outcomes using structured signals first, with string
 * matching on error messages as an explicitly-marked best-effort fallback.
 *
 * Classification order (first match wins):
 * 1. solved=true → EXECUTION_SUCCESS
 * 2. Compat issues with severity 'error' → ILLEGAL_TRANSITION
 * 3. searchHealth.terminationReason='max_nodes' OR totalNodes >= maxNodes → SEARCH_EXHAUSTED
 * 4. searchHealth.terminationReason='frontier_exhausted' → PRECONDITION_UNSATISFIED
 * 5. BEST_EFFORT: string matching on error field
 * 6. Default → EXECUTION_FAILURE
 *
 * DECOMPOSITION_GAP and SUPPORT_INFEASIBLE are NOT auto-classified.
 * They are set explicitly by Rig E and Rig G solvers when those conditions
 * are detected at a higher level.
 *
 * @author @darianrosebrook
 */

import type {
  EpisodeOutcomeClass,
  ClassifiedOutcome,
  SolveBundle,
  SolveJoinKeys,
  EpisodeLinkage,
  SterlingIdentity,
} from './solve-bundle-types';

// ============================================================================
// Join Key Extraction
// ============================================================================

/**
 * Extract solve-time join keys from a SolveBundle for deferred episode reporting.
 *
 * Stored in task metadata at solve time, then consumed by the reporter at
 * execution time to construct the join triangle:
 *   traceBundleHash → bundleHash → episodeHash
 *
 * Phase 1 identity fields (engineCommitment, operatorRegistryHash) are captured
 * here so reporters can forward them without a bundle store lookup.
 */
export function extractSolveJoinKeys(
  bundle: SolveBundle,
  planId: string,
): SolveJoinKeys {
  const identity = bundle.output.sterlingIdentity;
  return {
    planId,
    bundleHash: bundle.bundleHash,
    traceBundleHash: identity?.traceBundleHash,
    solverId: bundle.input.solverId,
    // Phase 1 identity fields — stored for report-time forwarding
    engineCommitment: identity?.engineCommitment,
    operatorRegistryHash: identity?.operatorRegistryHash,
  };
}

/**
 * Build EpisodeLinkage from join keys and outcome for report_episode.
 *
 * CANONICAL LINKAGE BUILDER — use this instead of constructing linkage manually.
 * This ensures Phase 1 identity fields are properly forwarded.
 *
 * Phase 1 identity fields (engineCommitment, operatorRegistryHash) are read
 * from joinKeys if present (populated by extractSolveJoinKeys at solve-time).
 * Alternatively, pass a separate SterlingIdentity for cases where identity
 * is available but join keys are not (e.g., immediate reporting without
 * task metadata storage).
 *
 * @param joinKeys  - SolveJoinKeys from task metadata (or partial keys object)
 * @param outcome   - Outcome class from classification or execution result
 * @param identity  - Optional Sterling identity override for Phase 1 fields
 */
export function buildSterlingEpisodeLinkage(
  joinKeys: {
    bundleHash?: string;
    traceBundleHash?: string;
    engineCommitment?: string;
    operatorRegistryHash?: string;
  } | undefined,
  outcome: EpisodeOutcomeClass,
  identity?: SterlingIdentity,
): EpisodeLinkage {
  // Phase 1 identity: prefer explicit identity param, fall back to joinKeys
  const engineCommitment = identity?.engineCommitment ?? joinKeys?.engineCommitment;
  const operatorRegistryHash = identity?.operatorRegistryHash ?? joinKeys?.operatorRegistryHash;

  return {
    bundleHash: joinKeys?.bundleHash,
    traceBundleHash: joinKeys?.traceBundleHash,
    outcomeClass: outcome,
    // Phase 1 identity fields — forwarded behind toggle in reportEpisode()
    engineCommitment,
    operatorRegistryHash,
  };
}

// ============================================================================
// Classification
// ============================================================================

/**
 * Classify a solve outcome into an EpisodeOutcomeClass with provenance.
 *
 * Returns a ClassifiedOutcome with `source` indicating whether the
 * classification came from structured signals ('structured') or
 * best-effort string matching ('heuristic').
 *
 * Consumers should treat 'heuristic' classifications as provisional —
 * learning signals and hard enforcement should only use 'structured' sources.
 *
 * @param result - Solve result with solved flag, optional error, totalNodes, searchHealth
 * @param opts   - Optional maxNodes budget and compat issues from preflight lint
 */
export function classifyOutcome(
  result: {
    solved: boolean;
    error?: string;
    totalNodes?: number;
    searchHealth?: { terminationReason?: string };
  },
  opts?: {
    maxNodes?: number;
    compatIssues?: Array<{ code: string; severity: string }>;
  },
): ClassifiedOutcome {
  // 1. Success
  if (result.solved) return { outcomeClass: 'EXECUTION_SUCCESS', source: 'structured' };

  // 2. Preflight compat errors → illegal transition
  if (opts?.compatIssues) {
    const hasCompatError = opts.compatIssues.some(
      (issue) => issue.severity === 'error',
    );
    if (hasCompatError) return { outcomeClass: 'ILLEGAL_TRANSITION', source: 'structured' };
  }

  // 3. Search exhausted (structured signal or numeric check)
  if (result.searchHealth?.terminationReason === 'max_nodes') {
    return { outcomeClass: 'SEARCH_EXHAUSTED', source: 'structured' };
  }
  if (
    opts?.maxNodes !== undefined &&
    result.totalNodes !== undefined &&
    result.totalNodes >= opts.maxNodes
  ) {
    return { outcomeClass: 'SEARCH_EXHAUSTED', source: 'structured' };
  }

  // 4. Frontier exhausted → precondition unsatisfied
  if (result.searchHealth?.terminationReason === 'frontier_exhausted') {
    return { outcomeClass: 'PRECONDITION_UNSATISFIED', source: 'structured' };
  }

  // 5. BEST_EFFORT: string matching on error field
  // Explicitly marked: these patterns are heuristic, not contract.
  if (result.error) {
    const lower = result.error.toLowerCase();
    if (lower.includes('infeasible') || lower.includes('deadlock')) {
      return { outcomeClass: 'STRATEGY_INFEASIBLE', source: 'heuristic' };
    }
    if (lower.includes('degenera')) {
      return { outcomeClass: 'HEURISTIC_DEGENERACY', source: 'heuristic' };
    }
  }

  // 6. Default
  return { outcomeClass: 'EXECUTION_FAILURE', source: 'structured' };
}

// ============================================================================
// Combined Linkage + Classification Helper
// ============================================================================

/**
 * Build EpisodeLinkage with classification in one call.
 *
 * CANONICAL LINKAGE + CLASSIFICATION BUILDER — use this when you have solve result details.
 * This helper ensures solvers can't accidentally forget to classify outcomes.
 * It calls classifyOutcome() internally and returns both the linkage and
 * the classified outcome for logging/governance purposes.
 *
 * Use this when you have a solve result and want to construct linkage for
 * episode reporting without manually threading classification through.
 *
 * @param joinKeys - SolveJoinKeys from task metadata
 * @param result   - Solve result for classification
 * @param opts     - Classification options (maxNodes, compatIssues)
 * @param identity - Optional Sterling identity override
 * @returns { linkage, classified } for reporting and logging
 */
export function buildSterlingEpisodeLinkageFromResult(
  joinKeys: {
    bundleHash?: string;
    traceBundleHash?: string;
    engineCommitment?: string;
    operatorRegistryHash?: string;
  } | undefined,
  result: {
    solved: boolean;
    error?: string;
    totalNodes?: number;
    searchHealth?: { terminationReason?: string };
  },
  opts?: {
    maxNodes?: number;
    compatIssues?: Array<{ code: string; severity: string }>;
  },
  identity?: SterlingIdentity,
): { linkage: EpisodeLinkage; classified: ClassifiedOutcome } {
  const classified = classifyOutcome(result, opts);
  const linkage = buildSterlingEpisodeLinkage(joinKeys, classified.outcomeClass, identity);
  return { linkage, classified };
}

