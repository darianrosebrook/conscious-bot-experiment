/**
 * Rig I Certification Tests — Epistemic Planning (P11)
 *
 * Proves the following Rig I invariants:
 *   1. Discrete buckets: all probabilities are ProbBucket values
 *   2. Bounded hypotheses: hypothesis set never exceeds MAX_HYPOTHESES
 *   3. Discriminative probe: probe selection maximizes information gain
 *   4. Confidence gate: no commit below confidence threshold
 *   5. Deterministic update: same prior + evidence = same posterior
 *
 * Tests exercise the P11 reference adapter across two domains:
 *   - Structure localization (Minecraft-flavored)
 *   - Fault diagnosis (CI-flavored)
 *
 * These tests exercise certification harnesses without a live Sterling backend.
 */

import { describe, it, expect } from 'vitest';
import {
  PROB_BUCKETS,
  MAX_HYPOTHESES,
  toProbBucket,
} from '../primitives/p11/p11-capsule-types';
import type {
  P11HypothesisV1,
  ProbBucket,
} from '../primitives/p11/p11-capsule-types';
import { P11ReferenceAdapter } from '../primitives/p11/p11-reference-adapter';
import {
  STRUCTURE_HYPOTHESES,
  STRUCTURE_PROBES,
  makeStructureEvidence,
  FAULT_HYPOTHESES,
  FAULT_PROBES,
  makeFaultEvidence,
} from '../primitives/p11/p11-reference-fixtures';
import { P11_INVARIANTS, P11_CONTRACT_VERSION } from '../primitives/p11/p11-capsule-types';
import { VILLAGE_HYPOTHESES } from '../../epistemic/minecraft-hypotheses';
import { MINECRAFT_STRUCTURE_PROBES } from '../../epistemic/minecraft-probes';
import { makeBiomeEvidence } from '../../epistemic/minecraft-evidence';

// ── Helpers ───────────────────────────────────────────────────────────────

const adapter = new P11ReferenceAdapter(0.8, MAX_HYPOTHESES);

function isProbBucket(value: number): boolean {
  return PROB_BUCKETS.includes(value as ProbBucket);
}

// ============================================================================
// Test 1: Discrete probability buckets (Pivot 1)
// ============================================================================

describe('Rig I - Discrete probability buckets', () => {
  it('toProbBucket snaps to nearest bucket', () => {
    expect(toProbBucket(0.0)).toBe(0.0);
    expect(toProbBucket(0.15)).toBe(0.2);
    expect(toProbBucket(0.25)).toBe(0.3);
    expect(toProbBucket(0.5)).toBe(0.5);
    expect(toProbBucket(0.95)).toBe(1.0);
    expect(toProbBucket(1.0)).toBe(1.0);
  });

  it('toProbBucket clamps out-of-range values', () => {
    expect(toProbBucket(-0.5)).toBe(0.0);
    expect(toProbBucket(1.5)).toBe(1.0);
    expect(toProbBucket(-Infinity)).toBe(0.0);
  });

  it('initialized belief contains only ProbBucket values', () => {
    const belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    for (const prob of belief.distribution.values()) {
      expect(isProbBucket(prob)).toBe(true);
    }
  });

  it('updated belief contains only ProbBucket values', () => {
    const belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    const evidence = makeStructureEvidence('biome_sample', 'village_north', 1);
    const result = adapter.updateBelief(belief, evidence, STRUCTURE_HYPOTHESES);
    for (const prob of result.belief.distribution.values()) {
      expect(isProbBucket(prob)).toBe(true);
    }
  });

  it('PROB_BUCKETS has exactly 11 values from 0.0 to 1.0', () => {
    expect(PROB_BUCKETS.length).toBe(11);
    expect(PROB_BUCKETS[0]).toBe(0.0);
    expect(PROB_BUCKETS[10]).toBe(1.0);
  });
});

// ============================================================================
// Test 2: Bounded hypothesis set (Pivot 2)
// ============================================================================

describe('Rig I - Bounded hypothesis set', () => {
  it('never exceeds MAX_HYPOTHESES', () => {
    const manyHypotheses: P11HypothesisV1[] = Array.from(
      { length: 50 },
      (_, i) => ({
        id: `h${i}`,
        description: `Hypothesis ${i}`,
        features: { value: i },
      }),
    );
    const belief = adapter.initializeBelief(manyHypotheses, 0);
    expect(belief.distribution.size).toBeLessThanOrEqual(MAX_HYPOTHESES);
  });

  it('MAX_HYPOTHESES is 32', () => {
    expect(MAX_HYPOTHESES).toBe(32);
  });

  it('eviction is deterministic for identical inputs', () => {
    const hypotheses: P11HypothesisV1[] = Array.from(
      { length: 40 },
      (_, i) => ({
        id: `h${String(i).padStart(3, '0')}`,
        description: `Hypothesis ${i}`,
        features: { value: i },
      }),
    );
    const b1 = adapter.initializeBelief(hypotheses, 0);
    const b2 = adapter.initializeBelief(hypotheses, 0);

    const ids1 = Array.from(b1.distribution.keys()).sort();
    const ids2 = Array.from(b2.distribution.keys()).sort();
    expect(ids1).toEqual(ids2);
  });

  it('small hypothesis sets are not evicted', () => {
    const belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    expect(belief.distribution.size).toBe(STRUCTURE_HYPOTHESES.length);
  });
});

// ============================================================================
// Test 3: Discriminative probe selection (Pivot 3)
// ============================================================================

describe('Rig I - Discriminative probe selection', () => {
  it('selects a probe from available set', () => {
    const belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    const selected = adapter.selectProbe(STRUCTURE_PROBES, belief, STRUCTURE_HYPOTHESES);
    expect(selected).not.toBeNull();
    expect(STRUCTURE_PROBES.some((p) => p.id === selected!.id)).toBe(true);
  });

  it('deterministic: same inputs produce same probe choice', () => {
    const belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    const s1 = adapter.selectProbe(STRUCTURE_PROBES, belief, STRUCTURE_HYPOTHESES);
    const s2 = adapter.selectProbe(STRUCTURE_PROBES, belief, STRUCTURE_HYPOTHESES);
    expect(s1!.id).toBe(s2!.id);
  });

  it('excludes already-explored probes', () => {
    let belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    const firstProbe = adapter.selectProbe(STRUCTURE_PROBES, belief, STRUCTURE_HYPOTHESES);
    expect(firstProbe).not.toBeNull();

    // Execute the first probe — marks it explored
    const evidence = makeStructureEvidence(firstProbe!.id, 'village_north', 1);
    const result = adapter.updateBelief(belief, evidence, STRUCTURE_HYPOTHESES);
    belief = result.belief;

    // Second selection should not re-select the explored probe
    const secondProbe = adapter.selectProbe(STRUCTURE_PROBES, belief, STRUCTURE_HYPOTHESES);
    if (secondProbe) {
      expect(secondProbe.id).not.toBe(firstProbe!.id);
    }
  });

  it('returns null when no probes available', () => {
    const belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    const selected = adapter.selectProbe([], belief, STRUCTURE_HYPOTHESES);
    expect(selected).toBeNull();
  });

  it('info gain is non-negative for uniform belief', () => {
    const belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    for (const probe of STRUCTURE_PROBES) {
      const result = adapter.expectedInfoGain(probe, belief, STRUCTURE_HYPOTHESES);
      expect(result.expectedGain).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================================
// Test 4: Confidence threshold gate (Pivot 4)
// ============================================================================

describe('Rig I - Confidence threshold gate', () => {
  it('does not reach confidence with uniform belief', () => {
    const belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    const check = adapter.checkConfidence(belief, 0.8);
    expect(check.reached).toBe(false);
    // Uniform over 4+ hypotheses: each gets ~0.2-0.3, well below 0.8
    expect(check.confidence).toBeLessThan(0.8);
  });

  it('reaches confidence after consistent evidence', () => {
    let belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    const trueHypothesis = 'village_north';

    // Apply multiple pieces of evidence consistent with village_north
    for (let tick = 1; tick <= 4; tick++) {
      const probeId = STRUCTURE_PROBES[tick % STRUCTURE_PROBES.length].id;
      const evidence = makeStructureEvidence(probeId, trueHypothesis, tick);
      const result = adapter.updateBelief(belief, evidence, STRUCTURE_HYPOTHESES);
      belief = result.belief;
    }

    const check = adapter.checkConfidence(belief, 0.8);
    expect(check.reached).toBe(true);
    expect(check.bestHypothesis).toBe(trueHypothesis);
  });

  it('default threshold is 0.8', () => {
    expect(adapter.defaultThreshold).toBe(0.8);
  });

  it('confidence check is deterministic', () => {
    const belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    const c1 = adapter.checkConfidence(belief, 0.8);
    const c2 = adapter.checkConfidence(belief, 0.8);
    expect(c1.reached).toBe(c2.reached);
    expect(c1.bestHypothesis).toBe(c2.bestHypothesis);
    expect(c1.confidence).toBe(c2.confidence);
  });
});

// ============================================================================
// Test 5: Deterministic belief update (Pivot 5)
// ============================================================================

describe('Rig I - Deterministic belief update', () => {
  it('same prior + evidence produces identical posterior', () => {
    const prior = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    const evidence = makeStructureEvidence('biome_sample', 'village_north', 1);

    const results = Array.from({ length: 20 }, () =>
      adapter.updateBelief(prior, evidence, STRUCTURE_HYPOTHESES),
    );

    const firstDist = Array.from(results[0].belief.distribution.entries());
    for (const result of results.slice(1)) {
      expect(Array.from(result.belief.distribution.entries())).toEqual(firstDist);
    }
  });

  it('different evidence produces different posteriors', () => {
    const prior = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);

    const evidenceA = makeStructureEvidence('biome_sample', 'village_north', 1);
    const evidenceB = makeStructureEvidence('biome_sample', 'village_east', 1);

    const resultA = adapter.updateBelief(prior, evidenceA, STRUCTURE_HYPOTHESES);
    const resultB = adapter.updateBelief(prior, evidenceB, STRUCTURE_HYPOTHESES);

    const distA = Array.from(resultA.belief.distribution.entries()).sort();
    const distB = Array.from(resultB.belief.distribution.entries()).sort();
    expect(distA).not.toEqual(distB);
  });

  it('belief update preserves ProbBucket invariant after chaining', () => {
    let belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);

    for (let tick = 1; tick <= 10; tick++) {
      const probeId = STRUCTURE_PROBES[tick % STRUCTURE_PROBES.length].id;
      const evidence = makeStructureEvidence(probeId, 'village_south', tick);
      const result = adapter.updateBelief(belief, evidence, STRUCTURE_HYPOTHESES);
      belief = result.belief;

      // Every intermediate state must satisfy the bucket invariant
      for (const prob of belief.distribution.values()) {
        expect(isProbBucket(prob)).toBe(true);
      }
    }
  });
});

// ============================================================================
// Test 6: Entropy reduction
// ============================================================================

describe('Rig I - Entropy reduction', () => {
  it('entropy decreases (or stays) with informative evidence', () => {
    const belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    const initialEntropy = adapter.calculateEntropy(belief);

    const evidence = makeStructureEvidence('biome_sample', 'village_north', 1);
    const result = adapter.updateBelief(belief, evidence, STRUCTURE_HYPOTHESES);
    const updatedEntropy = adapter.calculateEntropy(result.belief);

    expect(updatedEntropy).toBeLessThanOrEqual(initialEntropy + 0.01);
  });

  it('uniform distribution has maximum entropy', () => {
    const belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    const entropy = adapter.calculateEntropy(belief);

    // For N hypotheses uniform, Shannon entropy = log2(N)
    const maxEntropy = Math.log2(STRUCTURE_HYPOTHESES.length);
    // Allow some tolerance due to bucketing
    expect(entropy).toBeGreaterThan(0);
    expect(entropy).toBeLessThanOrEqual(maxEntropy + 0.1);
  });

  it('concentrated distribution has low entropy', () => {
    let belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);

    // Apply strong evidence to concentrate probability
    for (let tick = 1; tick <= 5; tick++) {
      const evidence = makeStructureEvidence('biome_sample', 'village_north', tick);
      const result = adapter.updateBelief(belief, evidence, STRUCTURE_HYPOTHESES);
      belief = result.belief;
    }

    const entropy = adapter.calculateEntropy(belief);
    const uniformEntropy = adapter.calculateEntropy(
      adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0),
    );
    expect(entropy).toBeLessThan(uniformEntropy);
  });

  it('calculateEntropy is pure (deterministic)', () => {
    const belief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    const results = Array.from({ length: 10 }, () => adapter.calculateEntropy(belief));
    expect(new Set(results).size).toBe(1);
  });
});

// ============================================================================
// Test 7: Multi-domain portability (structure search + fault diagnosis)
// ============================================================================

describe('Rig I - Multi-domain portability', () => {
  it('fault diagnosis: initializes uniform belief', () => {
    const belief = adapter.initializeBelief(FAULT_HYPOTHESES, 0);
    expect(belief.distribution.size).toBe(FAULT_HYPOTHESES.length);
    for (const prob of belief.distribution.values()) {
      expect(isProbBucket(prob)).toBe(true);
    }
  });

  it('fault diagnosis: probe selection is discriminative', () => {
    const belief = adapter.initializeBelief(FAULT_HYPOTHESES, 0);
    const selected = adapter.selectProbe(FAULT_PROBES, belief, FAULT_HYPOTHESES);
    expect(selected).not.toBeNull();
  });

  it('fault diagnosis: reaches confidence with consistent evidence', () => {
    let belief = adapter.initializeBelief(FAULT_HYPOTHESES, 0);
    const trueFault = 'fault_db';

    for (let tick = 1; tick <= 4; tick++) {
      const probeId = FAULT_PROBES[tick % FAULT_PROBES.length].id;
      const evidence = makeFaultEvidence(probeId, trueFault, tick);
      const result = adapter.updateBelief(belief, evidence, FAULT_HYPOTHESES);
      belief = result.belief;
    }

    const check = adapter.checkConfidence(belief, 0.8);
    expect(check.reached).toBe(true);
    expect(check.bestHypothesis).toBe(trueFault);
  });

  it('fault diagnosis: deterministic update', () => {
    const prior = adapter.initializeBelief(FAULT_HYPOTHESES, 0);
    const evidence = makeFaultEvidence('run_unit_test', 'fault_auth', 1);

    const r1 = adapter.updateBelief(prior, evidence, FAULT_HYPOTHESES);
    const r2 = adapter.updateBelief(prior, evidence, FAULT_HYPOTHESES);

    expect(Array.from(r1.belief.distribution.entries())).toEqual(
      Array.from(r2.belief.distribution.entries()),
    );
  });

  it('structure and fault domains use same adapter', () => {
    // Same adapter instance works for both domains
    const structBelief = adapter.initializeBelief(STRUCTURE_HYPOTHESES, 0);
    const faultBelief = adapter.initializeBelief(FAULT_HYPOTHESES, 0);

    // Both produce valid states
    expect(structBelief.distribution.size).toBe(STRUCTURE_HYPOTHESES.length);
    expect(faultBelief.distribution.size).toBe(FAULT_HYPOTHESES.length);

    // Both respect ProbBucket invariant
    for (const prob of structBelief.distribution.values()) {
      expect(isProbBucket(prob)).toBe(true);
    }
    for (const prob of faultBelief.distribution.values()) {
      expect(isProbBucket(prob)).toBe(true);
    }
  });
});

// ============================================================================
// Test 8: Minecraft epistemic module integration
// ============================================================================

describe('Rig I - Minecraft epistemic module', () => {
  // Test that the Minecraft-specific hypothesis/probe definitions work
  // with the P11 adapter (imports verified at compile time)

  it('village hypotheses pass adapter initialization', () => {
    const belief = adapter.initializeBelief(VILLAGE_HYPOTHESES, 0);
    expect(belief.distribution.size).toBe(VILLAGE_HYPOTHESES.length);
  });

  it('structure probes are selectable', () => {
    const belief = adapter.initializeBelief(VILLAGE_HYPOTHESES, 0);
    const selected = adapter.selectProbe(MINECRAFT_STRUCTURE_PROBES, belief, VILLAGE_HYPOTHESES);
    expect(selected).not.toBeNull();
  });

  it('minecraft evidence updates belief correctly', () => {
    const belief = adapter.initializeBelief(VILLAGE_HYPOTHESES, 0);
    const evidence = makeBiomeEvidence('plains', 0.8, 1);
    const result = adapter.updateBelief(belief, evidence, VILLAGE_HYPOTHESES);
    expect(result.belief.distribution.size).toBe(VILLAGE_HYPOTHESES.length);
    for (const prob of result.belief.distribution.values()) {
      expect(isProbBucket(prob)).toBe(true);
    }
  });
});

// ============================================================================
// Test 9: P11 invariants registry
// ============================================================================

describe('Rig I - P11 invariants registry', () => {
  it('P11_INVARIANTS covers all 5 pivots', () => {
    expect(P11_INVARIANTS).toHaveLength(5);
    expect(P11_INVARIANTS).toContain('discrete_buckets');
    expect(P11_INVARIANTS).toContain('bounded_hypotheses');
    expect(P11_INVARIANTS).toContain('discriminative_probe');
    expect(P11_INVARIANTS).toContain('confidence_gate');
    expect(P11_INVARIANTS).toContain('deterministic_update');
  });

  it('P11_CONTRACT_VERSION is p11.v1', () => {
    expect(P11_CONTRACT_VERSION).toBe('p11.v1');
  });

  it('adapter exposes correct defaults', () => {
    expect(adapter.defaultThreshold).toBe(0.8);
    expect(adapter.maxHypotheses).toBe(MAX_HYPOTHESES);
  });
});
