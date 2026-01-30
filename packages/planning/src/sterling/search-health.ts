/**
 * Search Health Parser & Degeneracy Detector
 *
 * Parses heuristic diagnostics from Sterling's A* search metrics
 * and detects search degeneracy patterns.
 *
 * Degeneracy thresholds:
 * - pctSameH > 0.5 -> "heuristic not discriminating"
 * - hVariance === 0 with nodesExpanded > 10 -> "constant heuristic"
 * - branchingEstimate > 8 + terminationReason === 'max_nodes' → "unguided search blowup"
 *
 * @author @darianrosebrook
 */

import type { SearchHealthMetrics, DegeneracyReport } from './solve-bundle-types';

/**
 * Parse search health metrics from Sterling's raw metrics object.
 *
 * Returns undefined if the required fields are not present,
 * if the version is unknown, or if validation fails.
 */
export function parseSearchHealth(
  metrics: Record<string, unknown> | undefined | null
): SearchHealthMetrics | undefined {
  if (!metrics) return undefined;

  const sh = metrics.searchHealth as Record<string, unknown> | undefined;
  if (!sh) return undefined;

  // Version check: unknown versions are not parsed (forward-compat)
  const version = sh.searchHealthVersion;
  if (version !== undefined && version !== 1) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[SearchHealth] Unknown searchHealthVersion: ${version} — skipping parse`
      );
    }
    return undefined;
  }

  const nodesExpanded = asNumber(sh.nodesExpanded);
  const frontierPeak = asNumber(sh.frontierPeak);
  const hMin = asNumber(sh.hMin);
  const hMax = asNumber(sh.hMax);
  const hMean = asNumber(sh.hMean);
  const hVariance = asNumber(sh.hVariance);
  const fMin = asNumber(sh.fMin);
  const fMax = asNumber(sh.fMax);
  const pctSameH = asNumber(sh.pctSameH);
  const branchingEstimate = asNumber(sh.branchingEstimate);
  const terminationReason = asTerminationReason(sh.terminationReason);

  if (
    nodesExpanded === undefined ||
    frontierPeak === undefined ||
    hMin === undefined ||
    hMax === undefined ||
    hMean === undefined ||
    hVariance === undefined ||
    fMin === undefined ||
    fMax === undefined ||
    pctSameH === undefined ||
    terminationReason === undefined ||
    branchingEstimate === undefined
  ) {
    // Partial-present warning: searchHealth object exists but fields are invalid
    if (process.env.NODE_ENV !== 'production') {
      const presentCount = [
        nodesExpanded, frontierPeak, hMin, hMax, hMean,
        hVariance, fMin, fMax, pctSameH, terminationReason, branchingEstimate,
      ].filter((v) => v !== undefined).length;
      if (presentCount > 0) {
        console.warn(
          `[SearchHealth] Partial fields present (${presentCount}/11) — returning undefined`
        );
      }
    }
    return undefined;
  }

  return {
    nodesExpanded,
    frontierPeak,
    hMin,
    hMax,
    hMean,
    hVariance,
    fMin,
    fMax,
    pctSameH,
    terminationReason,
    branchingEstimate,
    searchHealthVersion: typeof version === 'number' ? version : undefined,
  };
}

/**
 * Detect heuristic degeneracy in search health metrics.
 *
 * A degenerate heuristic provides little guidance to A*, causing
 * the search to degrade toward breadth-first (or worse).
 */
export function detectHeuristicDegeneracy(
  health: SearchHealthMetrics
): DegeneracyReport {
  const reasons: string[] = [];

  if (health.pctSameH > 0.5) {
    reasons.push(
      `heuristic not discriminating: ${(health.pctSameH * 100).toFixed(0)}% of nodes share the modal h value`
    );
  }

  if (health.hVariance === 0 && health.nodesExpanded > 10) {
    reasons.push(
      `constant heuristic: zero h variance across ${health.nodesExpanded} expanded nodes`
    );
  }

  if (health.branchingEstimate > 8 && health.terminationReason === 'max_nodes') {
    reasons.push(
      `unguided search blowup: branching estimate ${health.branchingEstimate.toFixed(1)} with max_nodes termination`
    );
  }

  return {
    isDegenerate: reasons.length > 0,
    reasons,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function asTerminationReason(
  value: unknown
): 'goal_found' | 'max_nodes' | 'frontier_exhausted' | 'error' | undefined {
  if (
    value === 'goal_found' ||
    value === 'max_nodes' ||
    value === 'frontier_exhausted' ||
    value === 'error'
  ) {
    return value;
  }
  return undefined;
}
