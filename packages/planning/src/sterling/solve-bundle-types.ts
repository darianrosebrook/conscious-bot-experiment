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
  terminationReason: 'goal' | 'max_nodes' | 'no_solution';
  branchingEstimate: number;
}

export interface DegeneracyReport {
  isDegenerate: boolean;
  reasons: string[];
}
