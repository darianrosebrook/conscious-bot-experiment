# Rig I: Epistemic Planning — Companion Approach

This companion document distills the implementation plan with design decisions, boundaries, and implementation construction constraints. Read alongside `RIG_I_EPISTEMIC_PLANNING_PLAN.md`.

---

## 1. Executive summary

Rig I proves **Primitive 11** (Epistemic planning / belief-state + active sensing) by implementing a belief-based planner that:

1. Maintains **belief state** over hypotheses (not just world state)
2. Chooses **probes** that maximize information gain (entropy reduction)
3. Reaches **confidence threshold** before committing to actions
4. Handles **belief updates** deterministically given observed evidence

**Critical boundary**: Probe choice is discriminative; the system decides what to measure, not only what to do.

**Best path:** Implement belief state with probability buckets; add probe operators; implement `expectedInformationGain`; add confidence threshold check. Foundation for Rig I-ext entity tracking.

---

## 2. Implementation construction constraints (pivots)

### Pivot 1: Probability buckets only

**Problem:** Continuous probabilities cause non-determinism and state explosion.

**Pivot:** All probabilities in `ProbBucket` (0.0, 0.1, ..., 1.0). `toProbBucket(raw)` for updates.

**Acceptance check:** Belief state has only PROB_BUCKETS values.

---

### Pivot 2: Probe choice by information gain

**Problem:** Random or arbitrary probe choice; not discriminative.

**Pivot:** `selectBestProbe(belief)` returns probe with max `expectedInformationGain`. Tie-break by cost.

**Acceptance check:** Probe that reduces entropy most is chosen.

---

### Pivot 3: Confidence threshold before commit

**Problem:** Committing action with low confidence; wrong hypothesis.

**Pivot:** `hasReachedConfidence(belief, threshold)` true only when max hypothesis prob >= threshold. No action commit until true.

**Acceptance check:** Action not proposed when max prob < 0.8 (default threshold).

---

### Pivot 4: Belief update deterministic

**Problem:** Same evidence yields different belief; tests flake.

**Pivot:** `updateBelief(belief, evidence)` uses `toProbBucket()`; no randomness. Evidence order canonicalized.

**Acceptance check:** Same evidence sequence → identical belief state.

---

### Summary: Acceptance check table

| Pivot | Acceptance check |
|-------|------------------|
| 1 | Probabilities in PROB_BUCKETS only. |
| 2 | Probe choice maximizes information gain. |
| 3 | No commit below confidence threshold. |
| 4 | Belief update deterministic. |

---

## 3. Primary design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Belief representation | Discrete hypothesis set with probability buckets | Prevents continuous state explosion |
| Probability quantization | 10 buckets (0.0, 0.1, ..., 1.0) | Bounded state space; deterministic updates |
| Probe operators | Explicit sensing actions with expected evidence | First-class actions in planning |
| Information gain | Entropy reduction (Shannon) | Standard, principled metric |
| Confidence threshold | Configurable per-goal (default 0.8) | Explicit stopping criterion |

---

## 3. Foundation for Rig I-ext

Rig I provides the **epistemic semantics** that Rig I-ext builds upon:

| Rig I concept | Rig I-ext usage |
|---------------|-----------------|
| Belief update | Entity track confidence updates |
| Probe operators | Active sensing (turn-to, sector-scan) |
| Confidence threshold | Track classification thresholds |
| Entropy tracking | Saliency delta emission criteria |
| Hypothesis collapse | Track termination (lost → evicted) |

**Dependency**: Implement Rig I core semantics before Rig I-ext entity tracking.

---

## 3b. Current code anchors (what exists today)

**Verified 2025-01-31.** No belief state or probe operators exist. Integration points where epistemic semantics would be added:

| Location | Line(s) | What |
|----------|---------|------|
| `packages/planning/src/goal-formulation/goal-manager.ts` | 85-119 | `formulateGoals()`: signals → needs → goals → priority. Inject probe-selection step before goalGenerator or extend signalProcessor. |
| `packages/planning/src/goal-formulation/advanced-signal-processor.ts` | 21-33 | `SignalType`: HUNGER, SAFETY_THREAT, etc. Add hypothesis/certainty signals. |
| `packages/planning/src/goal-formulation/homeostasis-monitor.ts` | 46-81 | `sample()`: HomeostasisState. Replace or extend with belief-update semantics. |
| `packages/planning/src/signal-extraction-pipeline.ts` | 89-100 | `extractSignals()`: Evidence extraction. Feed into belief layer. |
| `packages/world/src/perception/confidence-tracker.ts` | 52-75 | `recordObservation()`, confidence decay. Aligns with DECAY; probe operators would call this. |
| `packages/cognition/src/environmental/observation-reasoner.ts` | `reason()` | Single observation → insight. No expectedInformationGain. |
| `packages/minecraft-interface/src/observation-mapper.ts` | 491-530 | `toHomeostasisState()`: Evidence from player. |

**conscious-bot vs Sterling split:** Belief state, probe operators, belief update, entropy tracking live in conscious-bot (new `epistemic/` module). Sterling (optional): epistemic-planning domain with belief distribution in state; probe actions as operators. Implement belief layer in conscious-bot first; Sterling integration when epistemic domain is defined.

---

## 4. Belief state design

### 4.1 Hypothesis representation

```ts
// packages/minecraft-interface/src/epistemic/belief-state.ts

export const PROB_BUCKETS = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] as const;
export type ProbBucket = typeof PROB_BUCKETS[number];

export interface Hypothesis {
  id: string;
  description: string;
  features: Record<string, string | number | boolean>;
}

export interface BeliefState {
  hypotheses: Map<string, ProbBucket>;  // hypothesis_id → probability bucket
  explored: Set<string>;                 // Regions/probes already tried
  totalEntropy: number;                  // Cached entropy value
  lastUpdatedTick: number;
}

export const MAX_HYPOTHESES = 32;  // Bounded hypothesis set
```

### 4.2 Probability bucket conversion

```ts
export function toProbBucket(rawProb: number): ProbBucket {
  const clamped = Math.max(0, Math.min(1, rawProb));
  const index = Math.round(clamped * 10);
  return PROB_BUCKETS[index];
}

export function fromProbBucket(bucket: ProbBucket): number {
  return bucket;
}
```

### 4.3 Entropy calculation

```ts
export function calculateEntropy(belief: BeliefState): number {
  let entropy = 0;
  for (const prob of belief.hypotheses.values()) {
    if (prob > 0 && prob < 1) {
      entropy -= prob * Math.log2(prob) + (1 - prob) * Math.log2(1 - prob);
    }
  }
  return entropy;
}

export function normalizedEntropy(belief: BeliefState): number {
  const maxEntropy = belief.hypotheses.size * 1.0;  // Max when all p=0.5
  return maxEntropy > 0 ? calculateEntropy(belief) / maxEntropy : 0;
}
```

---

## 5. Probe operators

### 5.1 Operator definitions

```ts
// packages/minecraft-interface/src/epistemic/probe-operators.ts

export interface EvidencePayload {
  type: string;
  value: unknown;
  confidence: number;
}

export interface ProbeOperator {
  id: string;
  name: string;
  description: string;
  cost: {
    time: number;      // Ticks to execute
    risk: number;      // Risk exposure (0-1)
    resource: number;  // Resource cost (normalized)
  };
  expectedEvidence: (hypothesis: Hypothesis) => EvidencePayload[];
  applicability: (belief: BeliefState) => boolean;
}

export const PROBE_OPERATORS: ProbeOperator[] = [
  {
    id: 'travel_to_vantage',
    name: 'Travel to vantage point',
    description: 'Move to high ground for better visibility',
    cost: { time: 100, risk: 0.2, resource: 0 },
    expectedEvidence: (h) => [
      { type: 'visual_scan', value: h.features.region, confidence: 0.8 },
    ],
    applicability: (b) => !b.explored.has('vantage'),
  },
  {
    id: 'biome_sample',
    name: 'Sample biome features',
    description: 'Check blocks/mobs for biome identification',
    cost: { time: 50, risk: 0.1, resource: 0 },
    expectedEvidence: (h) => [
      { type: 'biome_indicator', value: h.features.biome, confidence: 0.7 },
    ],
    applicability: () => true,
  },
  {
    id: 'mob_mix_sample',
    name: 'Observe mob types',
    description: 'Check which mobs spawn in area',
    cost: { time: 80, risk: 0.3, resource: 0 },
    expectedEvidence: (h) => [
      { type: 'mob_presence', value: h.features.expected_mobs, confidence: 0.6 },
    ],
    applicability: () => true,
  },
  {
    id: 'terrain_follow',
    name: 'Follow terrain feature',
    description: 'Follow river/path toward expected structure',
    cost: { time: 200, risk: 0.2, resource: 0 },
    expectedEvidence: (h) => [
      { type: 'structure_proximity', value: h.features.structure_type, confidence: 0.5 },
    ],
    applicability: (b) => !b.explored.has('terrain_follow'),
  },
];
```

### 5.2 Information gain calculation

```ts
export function expectedInformationGain(
  probe: ProbeOperator,
  belief: BeliefState
): number {
  const currentEntropy = calculateEntropy(belief);
  
  // Simulate expected posterior entropy
  let expectedPosteriorEntropy = 0;
  let totalWeight = 0;
  
  for (const [hypId, prob] of belief.hypotheses.entries()) {
    const hypothesis = getHypothesis(hypId);
    if (!hypothesis) continue;
    
    const evidence = probe.expectedEvidence(hypothesis);
    const posteriorBelief = simulateUpdate(belief, evidence);
    const posteriorEntropy = calculateEntropy(posteriorBelief);
    
    expectedPosteriorEntropy += prob * posteriorEntropy;
    totalWeight += prob;
  }
  
  if (totalWeight > 0) {
    expectedPosteriorEntropy /= totalWeight;
  }
  
  return currentEntropy - expectedPosteriorEntropy;
}

export function selectBestProbe(belief: BeliefState): ProbeOperator | null {
  const applicable = PROBE_OPERATORS.filter(p => p.applicability(belief));
  if (applicable.length === 0) return null;
  
  let best: ProbeOperator | null = null;
  let bestScore = -Infinity;
  
  for (const probe of applicable) {
    const gain = expectedInformationGain(probe, belief);
    const costPenalty = probe.cost.time * 0.001 + probe.cost.risk * 0.1;
    const score = gain - costPenalty;
    
    if (score > bestScore) {
      bestScore = score;
      best = probe;
    }
  }
  
  return best;
}
```

---

## 6. Belief update

### 6.1 Deterministic update rule

```ts
// packages/minecraft-interface/src/epistemic/belief-update.ts

export interface ObservedEvidence {
  probeId: string;
  payload: EvidencePayload;
  observedAtTick: number;
}

export function updateBelief(
  prior: BeliefState,
  evidence: ObservedEvidence
): BeliefState {
  const posterior = new Map<string, ProbBucket>();
  
  for (const [hypId, priorProb] of prior.hypotheses.entries()) {
    const hypothesis = getHypothesis(hypId);
    if (!hypothesis) {
      posterior.set(hypId, priorProb);
      continue;
    }
    
    // Compute likelihood of evidence given hypothesis
    const likelihood = computeLikelihood(hypothesis, evidence);
    
    // Bayes update (simplified for discrete buckets)
    const unnormalizedPosterior = fromProbBucket(priorProb) * likelihood;
    posterior.set(hypId, toProbBucket(unnormalizedPosterior));
  }
  
  // Normalize
  const total = Array.from(posterior.values()).reduce((s, p) => s + p, 0);
  if (total > 0) {
    for (const [hypId, prob] of posterior.entries()) {
      posterior.set(hypId, toProbBucket(prob / total));
    }
  }
  
  return {
    hypotheses: posterior,
    explored: new Set([...prior.explored, evidence.probeId]),
    totalEntropy: calculateEntropy({ ...prior, hypotheses: posterior }),
    lastUpdatedTick: evidence.observedAtTick,
  };
}

function computeLikelihood(hypothesis: Hypothesis, evidence: ObservedEvidence): number {
  // Compare evidence with hypothesis features
  const expected = hypothesis.features[evidence.payload.type];
  const observed = evidence.payload.value;
  
  if (expected === observed) {
    return evidence.payload.confidence;
  } else if (expected === undefined) {
    return 0.5;  // Uninformative
  } else {
    return 1 - evidence.payload.confidence;
  }
}
```

### 6.2 Confidence threshold check

```ts
export function hasReachedConfidence(
  belief: BeliefState,
  threshold: number = 0.8
): { reached: boolean; bestHypothesis: string | null; confidence: number } {
  let bestHypId: string | null = null;
  let bestProb: number = 0;
  
  for (const [hypId, prob] of belief.hypotheses.entries()) {
    if (prob > bestProb) {
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
```

---

## 7. Minecraft integration

### 7.1 Structure localization example

```ts
// Example: Locate a village

const VILLAGE_HYPOTHESES: Hypothesis[] = [
  { id: 'village_north', description: 'Village to the north', features: { region: 'north', biome: 'plains', expected_mobs: ['villager'] } },
  { id: 'village_south', description: 'Village to the south', features: { region: 'south', biome: 'plains', expected_mobs: ['villager'] } },
  { id: 'village_east', description: 'Village to the east', features: { region: 'east', biome: 'desert', expected_mobs: ['villager'] } },
  { id: 'no_village', description: 'No village in range', features: { region: 'none', biome: 'any', expected_mobs: [] } },
];

function initializeVillageSearch(): BeliefState {
  const hypotheses = new Map<string, ProbBucket>();
  const uniformProb = toProbBucket(1 / VILLAGE_HYPOTHESES.length);
  
  for (const h of VILLAGE_HYPOTHESES) {
    hypotheses.set(h.id, uniformProb);
  }
  
  return {
    hypotheses,
    explored: new Set(),
    totalEntropy: calculateEntropy({ hypotheses } as BeliefState),
    lastUpdatedTick: 0,
  };
}
```

### 7.2 Evidence extraction from Minecraft observations

```ts
export function extractEvidence(
  probeId: string,
  botObservations: unknown,
  tick: number
): ObservedEvidence {
  switch (probeId) {
    case 'biome_sample':
      return {
        probeId,
        payload: {
          type: 'biome_indicator',
          value: extractBiomeFromBlocks(botObservations),
          confidence: 0.7,
        },
        observedAtTick: tick,
      };
    case 'mob_mix_sample':
      return {
        probeId,
        payload: {
          type: 'mob_presence',
          value: extractMobTypesFromEntities(botObservations),
          confidence: 0.6,
        },
        observedAtTick: tick,
      };
    // ... other probe types
    default:
      return {
        probeId,
        payload: { type: 'unknown', value: null, confidence: 0 },
        observedAtTick: tick,
      };
  }
}
```

---

## 8. DO and DO NOT

**DO:**
- **DO** use discrete probability buckets (0.0, 0.1, ..., 1.0) for belief state.
- **DO** select probes based on expected information gain, not random exploration.
- **DO** update beliefs deterministically given evidence (same prior + evidence → same posterior).
- **DO** bound the hypothesis set (MAX_HYPOTHESES).
- **DO** track explored probes to avoid redundant sensing.

**DO NOT:**
- **DO NOT** use continuous probabilities in planning state (causes state explosion).
- **DO NOT** reinforce "lucky finds" without principled information gain.
- **DO NOT** hide belief updates inside heuristics (must be explicit, replayable).
- **DO NOT** allow unbounded hypothesis sets.
- **DO NOT** use non-deterministic evidence extraction (must be reproducible).

---

## 9. Certification gates

### 9.1 Entropy reduction test

```ts
describe('Epistemic planning entropy reduction', () => {
  it('reduces entropy with each informative probe', () => {
    let belief = initializeVillageSearch();
    const initialEntropy = belief.totalEntropy;
    
    // Execute a probe
    const probe = selectBestProbe(belief);
    expect(probe).not.toBeNull();
    
    const evidence = mockEvidenceFor(probe!.id, 'village_north');
    belief = updateBelief(belief, evidence);
    
    expect(belief.totalEntropy).toBeLessThan(initialEntropy);
  });
});
```

### 9.2 Discriminative probe selection test

```ts
describe('Probe selection is discriminative', () => {
  it('selects probe with highest information gain', () => {
    const belief = initializeVillageSearch();
    
    // Calculate info gain for all probes
    const gains = PROBE_OPERATORS
      .filter(p => p.applicability(belief))
      .map(p => ({ probe: p, gain: expectedInformationGain(p, belief) }));
    
    const selected = selectBestProbe(belief);
    const selectedGain = gains.find(g => g.probe.id === selected?.id)?.gain ?? 0;
    const maxGain = Math.max(...gains.map(g => g.gain));
    
    // Selected probe should have highest (or near-highest) gain
    expect(selectedGain).toBeGreaterThanOrEqual(maxGain * 0.9);
  });
});
```

### 9.3 Confidence calibration test

```ts
describe('Confidence calibration', () => {
  it('reaches correct hypothesis when confidence is high', () => {
    let belief = initializeVillageSearch();
    const trueHypothesis = 'village_north';
    
    // Simulate probes with evidence consistent with true hypothesis
    while (!hasReachedConfidence(belief, 0.8).reached) {
      const probe = selectBestProbe(belief);
      if (!probe) break;
      
      const evidence = mockEvidenceFor(probe.id, trueHypothesis);
      belief = updateBelief(belief, evidence);
    }
    
    const result = hasReachedConfidence(belief, 0.8);
    expect(result.reached).toBe(true);
    expect(result.bestHypothesis).toBe(trueHypothesis);
  });
});
```

### 9.4 Determinism test

```ts
describe('Belief update determinism', () => {
  it('produces identical posterior for identical inputs', () => {
    const prior = initializeVillageSearch();
    const evidence = mockEvidenceFor('biome_sample', 'village_north');
    
    const posterior1 = updateBelief(prior, evidence);
    const posterior2 = updateBelief(prior, evidence);
    
    // Same prior + evidence → identical posterior
    expect(Array.from(posterior1.hypotheses.entries())).toEqual(
      Array.from(posterior2.hypotheses.entries())
    );
    expect(posterior1.totalEntropy).toBe(posterior2.totalEntropy);
  });
});
```

---

## 10. Definition of "done" for boundary milestone

### Core boundary criteria

- **Discriminative probes:** Probe selection based on information gain.
- **Entropy reduction:** Each probe reduces belief entropy.
- **Confidence threshold:** No action commit until threshold met.
- **Determinism:** Same evidence → same belief update.

### Acceptance checks (4 pivots)

All 4 pivot acceptance checks must pass.

---

## 11. Cross-references

- **Implementation plan**: `RIG_I_EPISTEMIC_PLANNING_PLAN.md`
- **Rig I-ext**: `P21_RIG_I_EXT_IMPLEMENTATION_PLAN.md`, `P21_RIG_I_EXT_COMPANION_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P11)
- **Sterling domains**: `sterling-minecraft-domains.md` (Rig I section)
