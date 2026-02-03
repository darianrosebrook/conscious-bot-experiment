/**
 * Episode Classification Tests
 *
 * Proves classifyOutcome() uses structured signals first (D8),
 * with string matching as explicitly-marked best-effort fallback.
 * Also proves outcomeClassSource provenance is correct.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyOutcome,
  extractSolveJoinKeys,
  buildSterlingEpisodeLinkage,
  buildSterlingEpisodeLinkageFromResult,
  // Test legacy aliases still work
  buildEpisodeLinkage,
  buildEpisodeLinkageFromResult,
} from '../episode-classification';
import type { SolveBundle, SterlingIdentity } from '../solve-bundle-types';

describe('classifyOutcome', () => {
  // #1: solved=true → EXECUTION_SUCCESS (structured)
  it('solved=true → EXECUTION_SUCCESS', () => {
    const result = classifyOutcome({ solved: true });
    expect(result.outcomeClass).toBe('EXECUTION_SUCCESS');
    expect(result.source).toBe('structured');
  });

  // Solved takes priority over all other signals
  it('solved=true overrides compat errors', () => {
    const result = classifyOutcome(
      { solved: true },
      { compatIssues: [{ code: 'E001', severity: 'error' }] },
    );
    expect(result.outcomeClass).toBe('EXECUTION_SUCCESS');
    expect(result.source).toBe('structured');
  });

  // #2: compat error → ILLEGAL_TRANSITION (structured)
  it('compat error issues → ILLEGAL_TRANSITION', () => {
    const result = classifyOutcome(
      { solved: false },
      { compatIssues: [{ code: 'E001', severity: 'error' }] },
    );
    expect(result.outcomeClass).toBe('ILLEGAL_TRANSITION');
    expect(result.source).toBe('structured');
  });

  // Warnings don't trigger ILLEGAL_TRANSITION
  it('compat warning issues → not ILLEGAL_TRANSITION', () => {
    const result = classifyOutcome(
      { solved: false },
      { compatIssues: [{ code: 'W001', severity: 'warning' }] },
    );
    expect(result.outcomeClass).toBe('EXECUTION_FAILURE');
    expect(result.source).toBe('structured');
  });

  // #3: terminationReason='max_nodes' → SEARCH_EXHAUSTED (structured)
  it('terminationReason=max_nodes → SEARCH_EXHAUSTED', () => {
    const result = classifyOutcome({
      solved: false,
      searchHealth: { terminationReason: 'max_nodes' },
    });
    expect(result.outcomeClass).toBe('SEARCH_EXHAUSTED');
    expect(result.source).toBe('structured');
  });

  // #4: totalNodes >= maxNodes → SEARCH_EXHAUSTED (structured)
  it('totalNodes >= maxNodes → SEARCH_EXHAUSTED', () => {
    const result = classifyOutcome(
      { solved: false, totalNodes: 5000 },
      { maxNodes: 5000 },
    );
    expect(result.outcomeClass).toBe('SEARCH_EXHAUSTED');
    expect(result.source).toBe('structured');
  });

  it('totalNodes exceeding maxNodes → SEARCH_EXHAUSTED', () => {
    const result = classifyOutcome(
      { solved: false, totalNodes: 6000 },
      { maxNodes: 5000 },
    );
    expect(result.outcomeClass).toBe('SEARCH_EXHAUSTED');
    expect(result.source).toBe('structured');
  });

  // totalNodes below maxNodes → not SEARCH_EXHAUSTED
  it('totalNodes below maxNodes → falls through', () => {
    const result = classifyOutcome(
      { solved: false, totalNodes: 100 },
      { maxNodes: 5000 },
    );
    expect(result.outcomeClass).toBe('EXECUTION_FAILURE');
    expect(result.source).toBe('structured');
  });

  // #5: terminationReason='frontier_exhausted' → PRECONDITION_UNSATISFIED (structured)
  it('terminationReason=frontier_exhausted → PRECONDITION_UNSATISFIED', () => {
    const result = classifyOutcome({
      solved: false,
      searchHealth: { terminationReason: 'frontier_exhausted' },
    });
    expect(result.outcomeClass).toBe('PRECONDITION_UNSATISFIED');
    expect(result.source).toBe('structured');
  });

  // #6: error containing 'deadlock' → STRATEGY_INFEASIBLE (heuristic)
  it('error="temporal deadlock" → STRATEGY_INFEASIBLE (heuristic)', () => {
    const result = classifyOutcome({
      solved: false,
      error: 'temporal deadlock detected',
    });
    expect(result.outcomeClass).toBe('STRATEGY_INFEASIBLE');
    expect(result.source).toBe('heuristic');
  });

  it('error="infeasible goal" → STRATEGY_INFEASIBLE (heuristic)', () => {
    const result = classifyOutcome({
      solved: false,
      error: 'infeasible goal state',
    });
    expect(result.outcomeClass).toBe('STRATEGY_INFEASIBLE');
    expect(result.source).toBe('heuristic');
  });

  // error containing 'degenera' → HEURISTIC_DEGENERACY (heuristic)
  it('error="heuristic degeneracy" → HEURISTIC_DEGENERACY (heuristic)', () => {
    const result = classifyOutcome({
      solved: false,
      error: 'search space shows degeneracy in h-values',
    });
    expect(result.outcomeClass).toBe('HEURISTIC_DEGENERACY');
    expect(result.source).toBe('heuristic');
  });

  // #7: no error, not solved → EXECUTION_FAILURE (structured — no heuristic was attempted)
  it('no error, not solved → EXECUTION_FAILURE', () => {
    const result = classifyOutcome({ solved: false });
    expect(result.outcomeClass).toBe('EXECUTION_FAILURE');
    expect(result.source).toBe('structured');
  });

  // Unknown error string → EXECUTION_FAILURE (structured — heuristic didn't match)
  it('unknown error string → EXECUTION_FAILURE', () => {
    const result = classifyOutcome({ solved: false, error: 'something unexpected happened' });
    expect(result.outcomeClass).toBe('EXECUTION_FAILURE');
    expect(result.source).toBe('structured');
  });

  // Priority: compat error beats search exhausted
  it('compat error takes priority over search exhaustion', () => {
    const result = classifyOutcome(
      {
        solved: false,
        searchHealth: { terminationReason: 'max_nodes' },
      },
      {
        compatIssues: [{ code: 'E001', severity: 'error' }],
      },
    );
    expect(result.outcomeClass).toBe('ILLEGAL_TRANSITION');
    expect(result.source).toBe('structured');
  });

  // Source provenance: only string-matching paths are 'heuristic'
  it('all structured paths return source=structured', () => {
    const structuredCases = [
      classifyOutcome({ solved: true }),
      classifyOutcome({ solved: false }, { compatIssues: [{ code: 'E', severity: 'error' }] }),
      classifyOutcome({ solved: false, searchHealth: { terminationReason: 'max_nodes' } }),
      classifyOutcome({ solved: false, totalNodes: 100 }, { maxNodes: 50 }),
      classifyOutcome({ solved: false, searchHealth: { terminationReason: 'frontier_exhausted' } }),
      classifyOutcome({ solved: false }),
    ];
    for (const c of structuredCases) {
      expect(c.source).toBe('structured');
    }
  });

  it('all heuristic paths return source=heuristic', () => {
    const heuristicCases = [
      classifyOutcome({ solved: false, error: 'deadlock' }),
      classifyOutcome({ solved: false, error: 'infeasible' }),
      classifyOutcome({ solved: false, error: 'degeneracy' }),
    ];
    for (const c of heuristicCases) {
      expect(c.source).toBe('heuristic');
    }
  });
});

// ============================================================================
// extractSolveJoinKeys tests
// ============================================================================

describe('extractSolveJoinKeys', () => {
  const makeMockBundle = (bundleHash: string, traceBundleHash?: string): SolveBundle => ({
    bundleId: 'test-bundle-id',
    bundleHash,
    timestamp: Date.now(),
    input: {
      solverId: 'test.solver',
      contractVersion: 1,
      definitionHash: 'def-hash',
      initialStateHash: 'state-hash',
      goalHash: 'goal-hash',
    },
    output: {
      planId: 'plan-123',
      solved: true,
      stepsDigest: 'steps-digest',
      durationMs: 100,
      solutionPathLength: 5,
      totalNodes: 50,
      sterlingIdentity: traceBundleHash ? { traceBundleHash } : undefined,
    },
    compatReport: { valid: true, ruleCount: 10, issues: [] },
  });

  it('extracts bundleHash and planId from a bundle', () => {
    const bundle = makeMockBundle('abc123');
    const result = extractSolveJoinKeys(bundle, 'plan-id-1');

    expect(result.planId).toBe('plan-id-1');
    expect(result.bundleHash).toBe('abc123');
  });

  it('extracts traceBundleHash from sterlingIdentity when present', () => {
    const bundle = makeMockBundle('abc123', 'trace-456');
    const result = extractSolveJoinKeys(bundle, 'plan-id-2');

    expect(result.planId).toBe('plan-id-2');
    expect(result.bundleHash).toBe('abc123');
    expect(result.traceBundleHash).toBe('trace-456');
  });

  it('returns traceBundleHash as undefined when sterlingIdentity is absent', () => {
    const bundle = makeMockBundle('abc123');
    const result = extractSolveJoinKeys(bundle, 'plan-id-3');

    expect(result.planId).toBe('plan-id-3');
    expect(result.bundleHash).toBe('abc123');
    expect(result.traceBundleHash).toBeUndefined();
  });

  it('preserves planId identity — same inputs produce same planId in output', () => {
    const bundle = makeMockBundle('hash-same');
    const result1 = extractSolveJoinKeys(bundle, 'same-plan');
    const result2 = extractSolveJoinKeys(bundle, 'same-plan');

    expect(result1.planId).toBe(result2.planId);
    expect(result1.bundleHash).toBe(result2.bundleHash);
  });

  it('different planIds produce different join keys', () => {
    const bundle = makeMockBundle('hash-shared');
    const result1 = extractSolveJoinKeys(bundle, 'plan-A');
    const result2 = extractSolveJoinKeys(bundle, 'plan-B');

    expect(result1.planId).toBe('plan-A');
    expect(result2.planId).toBe('plan-B');
    // bundleHash is the same since it comes from the bundle
    expect(result1.bundleHash).toBe(result2.bundleHash);
  });

  it('extracts solverId from bundle input', () => {
    const bundle = makeMockBundle('hash-123');
    const result = extractSolveJoinKeys(bundle, 'plan-X');

    expect(result.solverId).toBe('test.solver');
  });

  it('solverId is undefined when bundle.input.solverId is undefined', () => {
    const bundle = makeMockBundle('hash-456');
    // @ts-expect-error Testing undefined solverId scenario
    bundle.input.solverId = undefined;
    const result = extractSolveJoinKeys(bundle, 'plan-Y');

    expect(result.solverId).toBeUndefined();
  });

  it('extracts Phase 1 identity fields from sterlingIdentity', () => {
    const bundle = makeMockBundle('hash-phase1', 'trace-abc');
    bundle.output.sterlingIdentity = {
      traceBundleHash: 'trace-abc',
      engineCommitment: 'engine-v1.2.3',
      operatorRegistryHash: 'registry-xyz',
    };
    const result = extractSolveJoinKeys(bundle, 'plan-phase1');

    expect(result.traceBundleHash).toBe('trace-abc');
    expect(result.engineCommitment).toBe('engine-v1.2.3');
    expect(result.operatorRegistryHash).toBe('registry-xyz');
  });

  it('Phase 1 identity fields are undefined when sterlingIdentity lacks them', () => {
    const bundle = makeMockBundle('hash-partial');
    bundle.output.sterlingIdentity = { traceBundleHash: 'trace-only' };
    const result = extractSolveJoinKeys(bundle, 'plan-partial');

    expect(result.traceBundleHash).toBe('trace-only');
    expect(result.engineCommitment).toBeUndefined();
    expect(result.operatorRegistryHash).toBeUndefined();
  });
});

// ============================================================================
// buildEpisodeLinkage tests (Phase 1 identity chain)
// ============================================================================

describe('buildEpisodeLinkage', () => {
  it('builds linkage from join keys and outcome', () => {
    const joinKeys = { bundleHash: 'bundle-hash-123', traceBundleHash: 'trace-hash-456' };
    const linkage = buildEpisodeLinkage(joinKeys, 'EXECUTION_SUCCESS');

    expect(linkage.bundleHash).toBe('bundle-hash-123');
    expect(linkage.traceBundleHash).toBe('trace-hash-456');
    expect(linkage.outcomeClass).toBe('EXECUTION_SUCCESS');
  });

  it('handles undefined join keys', () => {
    const linkage = buildEpisodeLinkage(undefined, 'EXECUTION_FAILURE');

    expect(linkage.bundleHash).toBeUndefined();
    expect(linkage.traceBundleHash).toBeUndefined();
    expect(linkage.outcomeClass).toBe('EXECUTION_FAILURE');
  });

  it('handles partial join keys (bundleHash only)', () => {
    const joinKeys = { bundleHash: 'bundle-only' };
    const linkage = buildEpisodeLinkage(joinKeys, 'SEARCH_EXHAUSTED');

    expect(linkage.bundleHash).toBe('bundle-only');
    expect(linkage.traceBundleHash).toBeUndefined();
    expect(linkage.outcomeClass).toBe('SEARCH_EXHAUSTED');
  });

  it('includes Phase 1 identity fields when sterling identity is provided', () => {
    const joinKeys = { bundleHash: 'b-123', traceBundleHash: 't-456' };
    const identity: SterlingIdentity = {
      traceBundleHash: 't-456',
      engineCommitment: 'engine-commit-abc',
      operatorRegistryHash: 'registry-hash-xyz',
    };
    const linkage = buildEpisodeLinkage(joinKeys, 'EXECUTION_SUCCESS', identity);

    expect(linkage.bundleHash).toBe('b-123');
    expect(linkage.traceBundleHash).toBe('t-456');
    expect(linkage.outcomeClass).toBe('EXECUTION_SUCCESS');
    expect(linkage.engineCommitment).toBe('engine-commit-abc');
    expect(linkage.operatorRegistryHash).toBe('registry-hash-xyz');
  });

  it('omits Phase 1 identity fields when sterling identity is undefined', () => {
    const joinKeys = { bundleHash: 'b-789' };
    const linkage = buildEpisodeLinkage(joinKeys, 'EXECUTION_SUCCESS', undefined);

    expect(linkage.bundleHash).toBe('b-789');
    expect(linkage.engineCommitment).toBeUndefined();
    expect(linkage.operatorRegistryHash).toBeUndefined();
  });

  it('handles partial sterling identity (only engineCommitment)', () => {
    const joinKeys = { bundleHash: 'partial-test' };
    const identity: SterlingIdentity = {
      engineCommitment: 'engine-only',
      // no operatorRegistryHash
    };
    const linkage = buildEpisodeLinkage(joinKeys, 'EXECUTION_SUCCESS', identity);

    expect(linkage.engineCommitment).toBe('engine-only');
    expect(linkage.operatorRegistryHash).toBeUndefined();
  });

  it('extracts Phase 1 identity from joinKeys when identity param is undefined', () => {
    // This is the "closed loop" case: identity was stored in joinKeys at solve-time
    const joinKeys = {
      bundleHash: 'b-closed-loop',
      traceBundleHash: 't-closed-loop',
      engineCommitment: 'engine-from-keys',
      operatorRegistryHash: 'registry-from-keys',
    };
    const linkage = buildEpisodeLinkage(joinKeys, 'EXECUTION_SUCCESS');

    expect(linkage.bundleHash).toBe('b-closed-loop');
    expect(linkage.traceBundleHash).toBe('t-closed-loop');
    expect(linkage.engineCommitment).toBe('engine-from-keys');
    expect(linkage.operatorRegistryHash).toBe('registry-from-keys');
  });

  it('identity param overrides joinKeys Phase 1 fields when both present', () => {
    const joinKeys = {
      bundleHash: 'b-override',
      engineCommitment: 'old-engine',
      operatorRegistryHash: 'old-registry',
    };
    const identity: SterlingIdentity = {
      engineCommitment: 'new-engine',
      operatorRegistryHash: 'new-registry',
    };
    const linkage = buildEpisodeLinkage(joinKeys, 'EXECUTION_SUCCESS', identity);

    // identity param takes precedence
    expect(linkage.engineCommitment).toBe('new-engine');
    expect(linkage.operatorRegistryHash).toBe('new-registry');
  });

  it('falls back to joinKeys Phase 1 fields when identity param has partial fields', () => {
    const joinKeys = {
      bundleHash: 'b-fallback',
      engineCommitment: 'engine-from-keys',
      operatorRegistryHash: 'registry-from-keys',
    };
    const identity: SterlingIdentity = {
      engineCommitment: 'new-engine-only',
      // no operatorRegistryHash — falls back to joinKeys
    };
    const linkage = buildEpisodeLinkage(joinKeys, 'EXECUTION_SUCCESS', identity);

    expect(linkage.engineCommitment).toBe('new-engine-only');
    expect(linkage.operatorRegistryHash).toBe('registry-from-keys');
  });

  it('all outcome classes are correctly forwarded', () => {
    const outcomes: Array<import('../solve-bundle-types').EpisodeOutcomeClass> = [
      'EXECUTION_SUCCESS',
      'EXECUTION_FAILURE',
      'ILLEGAL_TRANSITION',
      'PRECONDITION_UNSATISFIED',
      'SEARCH_EXHAUSTED',
      'STRATEGY_INFEASIBLE',
      'DECOMPOSITION_GAP',
      'SUPPORT_INFEASIBLE',
      'HEURISTIC_DEGENERACY',
      'UNCLASSIFIED',
    ];

    for (const outcome of outcomes) {
      const linkage = buildEpisodeLinkage({ bundleHash: 'test' }, outcome);
      expect(linkage.outcomeClass).toBe(outcome);
    }
  });
});

// ============================================================================
// buildEpisodeLinkageFromResult tests (combined classification + linkage)
// ============================================================================

describe('buildEpisodeLinkageFromResult', () => {
  it('classifies and builds linkage in one call (success case)', () => {
    const joinKeys = { bundleHash: 'b-combined', traceBundleHash: 't-combined' };
    const result = { solved: true };

    const { linkage, classified } = buildEpisodeLinkageFromResult(joinKeys, result);

    expect(linkage.bundleHash).toBe('b-combined');
    expect(linkage.traceBundleHash).toBe('t-combined');
    expect(linkage.outcomeClass).toBe('EXECUTION_SUCCESS');
    expect(classified.outcomeClass).toBe('EXECUTION_SUCCESS');
    expect(classified.source).toBe('structured');
  });

  it('classifies and builds linkage in one call (search exhausted)', () => {
    const joinKeys = { bundleHash: 'b-exhausted' };
    const result = { solved: false, searchHealth: { terminationReason: 'max_nodes' } };

    const { linkage, classified } = buildEpisodeLinkageFromResult(joinKeys, result);

    expect(linkage.outcomeClass).toBe('SEARCH_EXHAUSTED');
    expect(classified.outcomeClass).toBe('SEARCH_EXHAUSTED');
    expect(classified.source).toBe('structured');
  });

  it('uses opts for classification (compat errors)', () => {
    const joinKeys = { bundleHash: 'b-compat' };
    const result = { solved: false };
    const opts = { compatIssues: [{ code: 'E001', severity: 'error' }] };

    const { linkage, classified } = buildEpisodeLinkageFromResult(joinKeys, result, opts);

    expect(linkage.outcomeClass).toBe('ILLEGAL_TRANSITION');
    expect(classified.outcomeClass).toBe('ILLEGAL_TRANSITION');
    expect(classified.source).toBe('structured');
  });

  it('uses opts for classification (maxNodes budget)', () => {
    const joinKeys = { bundleHash: 'b-nodes' };
    const result = { solved: false, totalNodes: 5000 };
    const opts = { maxNodes: 3000 };

    const { linkage, classified } = buildEpisodeLinkageFromResult(joinKeys, result, opts);

    expect(linkage.outcomeClass).toBe('SEARCH_EXHAUSTED');
    expect(classified.outcomeClass).toBe('SEARCH_EXHAUSTED');
  });

  it('includes Phase 1 identity from explicit identity param', () => {
    const joinKeys = { bundleHash: 'b-identity' };
    const result = { solved: true };
    const identity: SterlingIdentity = {
      engineCommitment: 'engine-from-result',
      operatorRegistryHash: 'registry-from-result',
    };

    const { linkage } = buildEpisodeLinkageFromResult(joinKeys, result, undefined, identity);

    expect(linkage.engineCommitment).toBe('engine-from-result');
    expect(linkage.operatorRegistryHash).toBe('registry-from-result');
  });

  it('falls back to joinKeys for Phase 1 identity when identity param is undefined', () => {
    const joinKeys = {
      bundleHash: 'b-fallback',
      engineCommitment: 'engine-from-keys',
      operatorRegistryHash: 'registry-from-keys',
    };
    const result = { solved: true };

    const { linkage } = buildEpisodeLinkageFromResult(joinKeys, result);

    expect(linkage.engineCommitment).toBe('engine-from-keys');
    expect(linkage.operatorRegistryHash).toBe('registry-from-keys');
  });

  it('returns heuristic source for string-matched classifications', () => {
    const joinKeys = { bundleHash: 'b-heuristic' };
    const result = { solved: false, error: 'temporal deadlock detected' };

    const { linkage, classified } = buildEpisodeLinkageFromResult(joinKeys, result);

    expect(linkage.outcomeClass).toBe('STRATEGY_INFEASIBLE');
    expect(classified.outcomeClass).toBe('STRATEGY_INFEASIBLE');
    expect(classified.source).toBe('heuristic');
  });

  it('handles undefined joinKeys gracefully', () => {
    const result = { solved: false };

    const { linkage, classified } = buildEpisodeLinkageFromResult(undefined, result);

    expect(linkage.bundleHash).toBeUndefined();
    expect(linkage.outcomeClass).toBe('EXECUTION_FAILURE');
    expect(classified.outcomeClass).toBe('EXECUTION_FAILURE');
  });

  it('provides provenance for governance decisions', () => {
    // This test documents that the returned classified object contains
    // source info that can be used to restrict learning/enforcement
    // to structured classifications only
    const joinKeys = { bundleHash: 'b-governance' };

    // Structured classification — safe for learning
    const structuredResult = { solved: true };
    const { classified: structuredClassified } = buildEpisodeLinkageFromResult(
      joinKeys,
      structuredResult,
    );
    expect(structuredClassified.source).toBe('structured');

    // Heuristic classification — telemetry only
    const heuristicResult = { solved: false, error: 'infeasible constraint' };
    const { classified: heuristicClassified } = buildEpisodeLinkageFromResult(
      joinKeys,
      heuristicResult,
    );
    expect(heuristicClassified.source).toBe('heuristic');
  });
});
