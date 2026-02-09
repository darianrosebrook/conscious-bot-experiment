/**
 * P11 Reference Adapter — Domain-Agnostic Implementation
 *
 * A clean, portable implementation of P11EpistemicAdapter that satisfies
 * all 5 conformance invariants. This adapter is domain-agnostic — it
 * operates purely on capsule types with no Minecraft or domain-specific
 * imports.
 *
 * Used by conformance test files to prove the capsule contract is
 * satisfiable across multiple fixture domains (structure search, fault
 * diagnosis, etc.).
 *
 * Zero vitest imports. Zero domain imports.
 */

import type {
  P11EpistemicAdapter,
  P11HypothesisV1,
  P11BeliefStateV1,
  P11ObservedEvidenceV1,
  P11BeliefUpdateResultV1,
  P11ProbeOperatorV1,
  P11InfoGainResultV1,
  P11ConfidenceCheckV1,
  ProbBucket,
} from './p11-capsule-types';

import { toProbBucket, MAX_HYPOTHESES, PROB_BUCKETS } from './p11-capsule-types';

// -- Reference Adapter -------------------------------------------------------

export class P11ReferenceAdapter implements P11EpistemicAdapter {
  readonly defaultThreshold: number;
  readonly maxHypotheses: number;

  constructor(defaultThreshold: number = 0.8, maxHypotheses: number = MAX_HYPOTHESES) {
    this.defaultThreshold = defaultThreshold;
    this.maxHypotheses = maxHypotheses;
  }

  initializeBelief(
    hypotheses: readonly P11HypothesisV1[],
    tick: number,
  ): P11BeliefStateV1 {
    // Cap at maxHypotheses — evict by index (later hypotheses dropped)
    const capped = hypotheses.slice(0, this.maxHypotheses);
    const uniformRaw = capped.length > 0 ? 1.0 / capped.length : 0;
    const uniformBucket = toProbBucket(uniformRaw);

    const distribution = new Map<string, ProbBucket>();
    for (const h of capped) {
      distribution.set(h.id, uniformBucket);
    }

    const belief: P11BeliefStateV1 = {
      distribution,
      explored: new Set(),
      entropy: 0,
      lastUpdatedTick: tick,
    };

    return {
      ...belief,
      entropy: this.calculateEntropy(belief),
    };
  }

  calculateEntropy(belief: P11BeliefStateV1): number {
    // Shannon entropy over the probability distribution
    // First normalize to get a proper distribution
    const probs: number[] = Array.from(belief.distribution.values());
    const total = probs.reduce((s, p) => s + p, 0);
    if (total === 0) return 0;

    let entropy = 0;
    for (const prob of probs) {
      const p = prob / total;
      if (p > 0 && p < 1) {
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }

  computeLikelihood(
    hypothesis: P11HypothesisV1,
    evidence: P11ObservedEvidenceV1,
  ): number {
    // Compare evidence with hypothesis features
    const expected = hypothesis.features[evidence.payload.type];
    const observed = evidence.payload.value;

    if (expected === observed) {
      return evidence.payload.confidence;
    } else if (expected === undefined) {
      return 0.5; // Uninformative — evidence type not relevant to hypothesis
    } else {
      return 1 - evidence.payload.confidence;
    }
  }

  updateBelief(
    prior: P11BeliefStateV1,
    evidence: P11ObservedEvidenceV1,
    hypotheses: readonly P11HypothesisV1[],
  ): P11BeliefUpdateResultV1 {
    const hypMap = new Map<string, P11HypothesisV1>();
    for (const h of hypotheses) {
      hypMap.set(h.id, h);
    }

    // Compute unnormalized posterior
    const unnormalized = new Map<string, number>();
    for (const [hypId, priorProb] of prior.distribution.entries()) {
      const hypothesis = hypMap.get(hypId);
      if (!hypothesis) {
        unnormalized.set(hypId, priorProb);
        continue;
      }
      const likelihood = this.computeLikelihood(hypothesis, evidence);
      unnormalized.set(hypId, priorProb * likelihood);
    }

    // Normalize
    const total = Array.from(unnormalized.values()).reduce((s, p) => s + p, 0);
    const posterior = new Map<string, ProbBucket>();
    for (const [hypId, rawProb] of unnormalized.entries()) {
      posterior.set(hypId, toProbBucket(total > 0 ? rawProb / total : 0));
    }

    // Enforce MAX_HYPOTHESES with deterministic eviction
    const evicted: string[] = [];
    if (posterior.size > this.maxHypotheses) {
      // Sort by (probability ASC, then hypothesis ID ASC for tie-break)
      const sorted = Array.from(posterior.entries()).sort((a, b) => {
        const probCmp = a[1] - b[1];
        if (probCmp !== 0) return probCmp;
        return a[0].localeCompare(b[0]);
      });
      while (sorted.length > this.maxHypotheses) {
        const [evictId] = sorted.shift()!;
        posterior.delete(evictId);
        evicted.push(evictId);
      }
    }

    const newExplored = new Set(prior.explored);
    newExplored.add(evidence.probeId);

    const belief: P11BeliefStateV1 = {
      distribution: posterior,
      explored: newExplored,
      entropy: 0,
      lastUpdatedTick: evidence.observedAtTick,
    };

    return {
      belief: {
        ...belief,
        entropy: this.calculateEntropy(belief),
      },
      evicted,
    };
  }

  expectedInfoGain(
    probe: P11ProbeOperatorV1,
    belief: P11BeliefStateV1,
    hypotheses: readonly P11HypothesisV1[],
  ): P11InfoGainResultV1 {
    const currentEntropy = this.calculateEntropy(belief);

    // Compute expected posterior entropy by weighting over hypotheses
    const hypMap = new Map<string, P11HypothesisV1>();
    for (const h of hypotheses) {
      hypMap.set(h.id, h);
    }

    // Normalize current distribution for weighting
    const probs = Array.from(belief.distribution.entries());
    const totalProb = probs.reduce((s, [, p]) => s + p, 0);

    let expectedPosteriorEntropy = 0;

    if (totalProb > 0) {
      for (const [hypId, prob] of probs) {
        const weight = prob / totalProb;
        if (weight === 0) continue;

        const hypothesis = hypMap.get(hypId);
        if (!hypothesis) continue;

        // Simulate: what if evidence confirms this hypothesis?
        const simulatedEvidence: P11ObservedEvidenceV1 = {
          probeId: probe.id,
          payload: {
            type: Object.keys(hypothesis.features)[0] ?? 'unknown',
            value: Object.values(hypothesis.features)[0] ?? '',
            confidence: 0.7,
          },
          observedAtTick: belief.lastUpdatedTick,
        };

        const updateResult = this.updateBelief(belief, simulatedEvidence, hypotheses);
        const posteriorEntropy = this.calculateEntropy(updateResult.belief);
        expectedPosteriorEntropy += weight * posteriorEntropy;
      }
    }

    const expectedGain = currentEntropy - expectedPosteriorEntropy;
    const costPenalty = probe.cost.timeTicks * 0.001 + probe.cost.risk * 0.1;
    const netScore = expectedGain - costPenalty;

    return {
      probeId: probe.id,
      expectedGain,
      netScore,
    };
  }

  selectProbe(
    probes: readonly P11ProbeOperatorV1[],
    belief: P11BeliefStateV1,
    hypotheses: readonly P11HypothesisV1[],
  ): P11ProbeOperatorV1 | null {
    if (probes.length === 0) return null;

    // Filter out already-explored probes
    const available = probes.filter((p) => !belief.explored.has(p.id));
    if (available.length === 0) return null;

    // Compute info gain for each
    const scored = available.map((probe) => ({
      probe,
      result: this.expectedInfoGain(probe, belief, hypotheses),
    }));

    // Sort by netScore DESC, then lexicographic probe ID ASC for tie-break
    scored.sort((a, b) => {
      const scoreCmp = b.result.netScore - a.result.netScore;
      if (Math.abs(scoreCmp) > 1e-10) return scoreCmp;
      return a.probe.id.localeCompare(b.probe.id);
    });

    return scored[0].probe;
  }

  checkConfidence(
    belief: P11BeliefStateV1,
    threshold: number,
  ): P11ConfidenceCheckV1 {
    let bestHypId: string | null = null;
    let bestProb: ProbBucket = 0.0 as ProbBucket;

    for (const [hypId, prob] of belief.distribution.entries()) {
      if (prob > bestProb || (prob === bestProb && (bestHypId === null || hypId < bestHypId))) {
        bestProb = prob;
        bestHypId = hypId;
      }
    }

    return {
      reached: bestProb >= threshold,
      bestHypothesis: bestHypId,
      confidence: bestProb,
    };
  }
}
