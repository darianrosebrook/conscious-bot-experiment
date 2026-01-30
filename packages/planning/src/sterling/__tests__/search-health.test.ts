/**
 * Tests for search-health.ts
 *
 * Validates parseSearchHealth and detectHeuristicDegeneracy.
 */

import { describe, it, expect } from 'vitest';
import { parseSearchHealth, detectHeuristicDegeneracy } from '../search-health';
import type { SearchHealthMetrics } from '../solve-bundle-types';

// ============================================================================
// parseSearchHealth
// ============================================================================

describe('parseSearchHealth', () => {
  const validMetrics = {
    searchHealth: {
      nodesExpanded: 100,
      frontierPeak: 50,
      hMin: 0,
      hMax: 10,
      hMean: 5.0,
      hVariance: 2.5,
      fMin: 0,
      fMax: 15,
      pctSameH: 0.3,
      terminationReason: 'goal_found',
      branchingEstimate: 3.5,
    },
  };

  it('parses valid metrics', () => {
    const result = parseSearchHealth(validMetrics);
    expect(result).toBeDefined();
    expect(result!.nodesExpanded).toBe(100);
    expect(result!.frontierPeak).toBe(50);
    expect(result!.hMin).toBe(0);
    expect(result!.hMax).toBe(10);
    expect(result!.hMean).toBe(5.0);
    expect(result!.hVariance).toBe(2.5);
    expect(result!.fMin).toBe(0);
    expect(result!.fMax).toBe(15);
    expect(result!.pctSameH).toBe(0.3);
    expect(result!.terminationReason).toBe('goal_found');
    expect(result!.branchingEstimate).toBe(3.5);
  });

  it('returns undefined for null input', () => {
    expect(parseSearchHealth(null)).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(parseSearchHealth(undefined)).toBeUndefined();
  });

  it('returns undefined when searchHealth key is missing', () => {
    expect(parseSearchHealth({ otherKey: 42 })).toBeUndefined();
  });

  it('returns undefined when a required field is missing', () => {
    const incomplete = {
      searchHealth: {
        nodesExpanded: 100,
        // missing other fields
      },
    };
    expect(parseSearchHealth(incomplete)).toBeUndefined();
  });

  it('returns undefined for invalid terminationReason', () => {
    const bad = {
      searchHealth: {
        ...validMetrics.searchHealth,
        terminationReason: 'invalid',
      },
    };
    expect(parseSearchHealth(bad)).toBeUndefined();
  });

  it('returns undefined for NaN field', () => {
    const bad = {
      searchHealth: {
        ...validMetrics.searchHealth,
        hMean: NaN,
      },
    };
    expect(parseSearchHealth(bad)).toBeUndefined();
  });

  it('returns undefined for unknown searchHealthVersion', () => {
    const bad = {
      searchHealth: {
        ...validMetrics.searchHealth,
        searchHealthVersion: 2,
      },
    };
    expect(parseSearchHealth(bad)).toBeUndefined();
  });

  it('parses successfully with searchHealthVersion: 1', () => {
    const good = {
      searchHealth: {
        ...validMetrics.searchHealth,
        searchHealthVersion: 1,
      },
    };
    const result = parseSearchHealth(good);
    expect(result).toBeDefined();
    expect(result!.searchHealthVersion).toBe(1);
  });

  it('returns undefined with partial fields present (warns in non-production)', () => {
    const partial = {
      searchHealth: {
        nodesExpanded: 100,
        frontierPeak: 50,
        // missing hMin, hMax, hMean, hVariance, fMin, fMax, pctSameH, terminationReason, branchingEstimate
      },
    };
    expect(parseSearchHealth(partial)).toBeUndefined();
  });

  it('accepts old enum values as invalid (goal, no_solution)', () => {
    const oldGoal = {
      searchHealth: {
        ...validMetrics.searchHealth,
        terminationReason: 'goal',
      },
    };
    expect(parseSearchHealth(oldGoal)).toBeUndefined();

    const oldNoSolution = {
      searchHealth: {
        ...validMetrics.searchHealth,
        terminationReason: 'no_solution',
      },
    };
    expect(parseSearchHealth(oldNoSolution)).toBeUndefined();
  });

  it('accepts all new terminationReason values', () => {
    for (const reason of ['goal_found', 'max_nodes', 'frontier_exhausted', 'error']) {
      const metrics = {
        searchHealth: {
          ...validMetrics.searchHealth,
          terminationReason: reason,
        },
      };
      const result = parseSearchHealth(metrics);
      expect(result).toBeDefined();
      expect(result!.terminationReason).toBe(reason);
    }
  });
});

// ============================================================================
// detectHeuristicDegeneracy
// ============================================================================

describe('detectHeuristicDegeneracy', () => {
  const healthyMetrics: SearchHealthMetrics = {
    nodesExpanded: 100,
    frontierPeak: 50,
    hMin: 0,
    hMax: 10,
    hMean: 5.0,
    hVariance: 2.5,
    fMin: 0,
    fMax: 15,
    pctSameH: 0.2,
    terminationReason: 'goal_found',
    branchingEstimate: 3.5,
  };

  it('reports healthy for well-behaved search', () => {
    const report = detectHeuristicDegeneracy(healthyMetrics);
    expect(report.isDegenerate).toBe(false);
    expect(report.reasons).toHaveLength(0);
  });

  it('detects high pctSameH (heuristic not discriminating)', () => {
    const report = detectHeuristicDegeneracy({
      ...healthyMetrics,
      pctSameH: 0.8,
    });
    expect(report.isDegenerate).toBe(true);
    expect(report.reasons.some((r) => r.includes('not discriminating'))).toBe(true);
  });

  it('detects zero variance with many nodes (constant heuristic)', () => {
    const report = detectHeuristicDegeneracy({
      ...healthyMetrics,
      hVariance: 0,
      nodesExpanded: 50,
    });
    expect(report.isDegenerate).toBe(true);
    expect(report.reasons.some((r) => r.includes('constant heuristic'))).toBe(true);
  });

  it('does not flag zero variance with few nodes', () => {
    const report = detectHeuristicDegeneracy({
      ...healthyMetrics,
      hVariance: 0,
      nodesExpanded: 5,
    });
    expect(report.reasons.some((r) => r.includes('constant heuristic'))).toBe(false);
  });

  it('detects high branching + max_nodes termination (unguided blowup)', () => {
    const report = detectHeuristicDegeneracy({
      ...healthyMetrics,
      branchingEstimate: 12,
      terminationReason: 'max_nodes',
    });
    expect(report.isDegenerate).toBe(true);
    expect(report.reasons.some((r) => r.includes('unguided search blowup'))).toBe(true);
  });

  it('does not flag high branching with goal termination', () => {
    const report = detectHeuristicDegeneracy({
      ...healthyMetrics,
      branchingEstimate: 12,
      terminationReason: 'goal_found',
    });
    expect(report.reasons.some((r) => r.includes('unguided search blowup'))).toBe(false);
  });

  it('accumulates multiple reasons', () => {
    const report = detectHeuristicDegeneracy({
      ...healthyMetrics,
      pctSameH: 0.8,
      hVariance: 0,
      nodesExpanded: 50,
      branchingEstimate: 12,
      terminationReason: 'max_nodes',
    });
    expect(report.isDegenerate).toBe(true);
    expect(report.reasons.length).toBe(3);
  });
});
