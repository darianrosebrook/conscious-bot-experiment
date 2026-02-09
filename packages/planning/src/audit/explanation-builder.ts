/**
 * Explanation Builder — Rig A Certification Hardening (P1)
 *
 * Generates audit-grade explanations from solve metadata. Every solve
 * (successful or rejected) produces a SolveExplanation that documents:
 *
 *   - What constraints were active and which was bounding
 *   - Validation report (rules accepted/rejected, reasons)
 *   - Solution summary (found, length, nodes, duration)
 *   - Rejection reasons when validation fails
 *
 * Determinism: explanations are deterministic for the same solve data.
 * No wall-clock timestamps in explanation content (timestamps live in
 * the enclosing SolveBundle, not the explanation).
 *
 * @author @darianrosebrook
 */

import type {
  SolveBundleInput,
  SolveBundleOutput,
  CompatReport,
  ContentHash,
} from '../sterling/solve-bundle-types';
import type { ValidationReport } from '../validation/rule-validator';

// ============================================================================
// Types
// ============================================================================

/** Audit-grade explanation attached to a solve result */
export interface SolveExplanation {
  /** Content hash linking this explanation to its solve request */
  requestHash: ContentHash;

  /** Summary of constraints that shaped the solve */
  constraintsSummary: {
    /** Constraints that were active during the solve */
    activeConstraints: string[];
    /** The constraint that was the binding limit (null if unconstrained) */
    boundingConstraint: string | null;
  };

  /** Rule validation results */
  validationReport: {
    rulesAccepted: number;
    rulesRejected: number;
    /** Stable, actionable rejection reasons (empty when all rules pass) */
    rejectionReasons: string[];
  };

  /** Summary of the solve outcome */
  solutionSummary: {
    found: boolean;
    planLength: number;
    totalNodes: number;
    durationMs: number;
  };

  /** Compat linter findings (from preflight lint, not certification validation) */
  compatSummary: {
    valid: boolean;
    issueCount: number;
    errorCodes: string[];
  };
}

// ============================================================================
// Builder
// ============================================================================

/**
 * Build an audit-grade explanation from solve metadata.
 *
 * Called after both validation and solve completion. For rejected solves
 * (validation failure), `bundleOutput` fields reflect the failure state
 * (solved=false, stepsDigest of empty array, etc.).
 */
export function buildExplanation(
  bundleInput: SolveBundleInput,
  bundleOutput: SolveBundleOutput,
  validationReport: ValidationReport | undefined,
  compatReport: CompatReport,
): SolveExplanation {
  // Derive active constraints from solve metadata
  const activeConstraints: string[] = [];
  let boundingConstraint: string | null = null;

  // maxNodes constraint (from rationale if available)
  if (bundleOutput.rationale) {
    const r = bundleOutput.rationale;
    activeConstraints.push(`maxNodes=${r.boundingConstraints.maxNodes}`);

    if (r.searchTermination.terminationReason === 'max_nodes') {
      boundingConstraint = `maxNodes (search terminated after ${r.searchEffort.nodesExpanded} nodes)`;
    }

    if (r.searchTermination.terminationReason === 'frontier_exhausted') {
      boundingConstraint = 'frontier exhausted (no more states to explore)';
    }

    if (r.searchTermination.isDegenerate) {
      activeConstraints.push(
        `degeneracy: ${r.searchTermination.degeneracyReasons.join('; ')}`,
      );
    }
  }

  // Definition count constraint
  activeConstraints.push(`definitionCount=${bundleInput.definitionCount}`);

  // Compat issues as constraints
  if (!compatReport.valid) {
    activeConstraints.push(
      `compatErrors=${compatReport.issues.filter(i => i.severity === 'error').length}`,
    );
  }

  // Validation rejection reasons
  const rejectionReasons: string[] = [];
  if (validationReport && !validationReport.valid) {
    for (const err of validationReport.errors) {
      rejectionReasons.push(`${err.code}: ${err.message} (rule: ${err.ruleAction})`);
    }
    if (!boundingConstraint) {
      boundingConstraint = 'rule validation failed (solve rejected before Sterling)';
    }
  }

  return {
    requestHash: bundleInput.definitionHash,
    constraintsSummary: {
      activeConstraints,
      boundingConstraint,
    },
    validationReport: {
      rulesAccepted: validationReport?.rulesAccepted ?? bundleInput.definitionCount,
      rulesRejected: validationReport?.rulesRejected ?? 0,
      rejectionReasons,
    },
    solutionSummary: {
      found: bundleOutput.solved,
      planLength: bundleOutput.searchStats.solutionPathLength,
      totalNodes: bundleOutput.searchStats.totalNodes,
      durationMs: bundleOutput.searchStats.durationMs,
    },
    compatSummary: {
      valid: compatReport.valid,
      issueCount: compatReport.issues.length,
      errorCodes: compatReport.issues
        .filter(i => i.severity === 'error')
        .map(i => i.code),
    },
  };
}

/**
 * Build an explanation for a solve that was rejected at validation time
 * (Sterling was never called). Uses zero-valued output fields.
 */
export function buildRejectionExplanation(
  bundleInput: SolveBundleInput,
  validationReport: ValidationReport,
  compatReport: CompatReport,
): SolveExplanation {
  const dummyOutput: SolveBundleOutput = {
    planId: null,
    solved: false,
    stepsDigest: '',
    searchStats: {
      totalNodes: 0,
      durationMs: 0,
      solutionPathLength: 0,
    },
  };

  return buildExplanation(bundleInput, dummyOutput, validationReport, compatReport);
}
