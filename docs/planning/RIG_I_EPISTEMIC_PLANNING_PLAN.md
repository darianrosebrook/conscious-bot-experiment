# Rig I: Epistemic Planning Implementation Plan

**Primitive**: P11 — Epistemic planning (belief-state and active sensing)

**Status**: ENRICHED (2025-01-31)
**Implementation**: Partial — P21/Rig I-ext evidence capsule types exist in `planning/sterling/primitives/p21/`

---

## 1. Target invariant (critical boundary)

**"Probe choice is discriminative; the system decides what to measure, not only what to do."**

The system must:
- Maintain belief state over hypotheses (not just world state)
- Choose probes that maximize information gain (entropy reduction)
- Reach confidence threshold before committing to actions
- Handle belief updates deterministically given observed evidence

**What this rig proves**: Sterling can plan over belief space, treating sensing as first-class actions.

---

## 2. Formal signature

- **Belief nodes**: probability distributions or hypothesis sets over unknown state
- **Probe operators**: tests/observations with expected evidence and cost/risk
- **Belief update**: deterministic transition given observed evidence payload
- **Goal**: confidence threshold or hypothesis collapse (e.g., P(target_location) > 0.9)
- **Cost**: probe expense + risk exposure + time

---

## 3. What to investigate before implementing

| Step | Location | What to verify |
|------|----------|----------------|
| Planning flow | `packages/planning/src/` | Where goals become tasks; where epistemic goals would be injected |
| Observation/evidence | minecraft-interface, world | Where observations are produced; evidence extraction points |
| Cognition goal handling | `packages/cognition/src/` | How goals are formed; probe goal arbitration |
| Sterling domain structure | Sterling (Python) | Domain definition; where belief state would be represented |
| Hypothesis space | Minecraft mechanics | Structure localization, biome ID; what hypotheses map to |

**Investigation outcome (verified 2025-01-31):** No belief state or probe operators exist today. Goals flow: GoalManager.formulateGoals (signals → needs → goals → priority) at `goal-formulation/goal-manager.ts:85-119`; AdvancedSignalProcessor.processSignals; HomeostasisMonitor.sample (defaults only); GoalGenerator.generateCandidates; PriorityScorer.rankGoals. Evidence sources: observation-reasoner (cognition), signal-extraction-pipeline (entity_observation type), ConfidenceTracker (world/perception) for uncertainty decay. Epistemic goals would inject at GoalManager or via new probe-selection step before GoalGenerator. Foundation for I-ext: belief update semantics, probe operators (turn-to, sector-scan), confidence threshold, entropy tracking.

### 3a. Current code anchors (verified 2025-01-31)

| File | Line(s) | What |
|------|---------|------|
| `packages/planning/src/goal-formulation/goal-manager.ts` | 85-119 | `formulateGoals(signals, worldState)`: signalProcessor.processSignals → goalGenerator.generateCandidates → priorityScorer.rankGoals. No belief state; no probe selection. |
| `packages/planning/src/goal-formulation/advanced-signal-processor.ts` | 21-33 | `SignalType`: HUNGER, SAFETY_THREAT, etc. `processSignals(signals, homeostasis, worldState)` produces needs. No hypothesis/probability. |
| `packages/planning/src/goal-formulation/homeostasis-monitor.ts` | 46-81 | `sample(partial?)`: returns HomeostasisState (health, hunger, etc.). Uses `Date.now()`; returns defaults if partial absent. No drift model. |
| `packages/planning/src/signal-extraction-pipeline.ts` | 17-26, 89-100 | `SignalType`: entity_observation, environmental_factor. `extractSignals(thought, worldState)` via extractors. Evidence-shaped; no belief update. |
| `packages/world/src/perception/confidence-tracker.ts` | 52-75, 79-99 | `recordObservation()`, `updateConfidenceLevels()`: confidence decay over time. Aligns with DECAY; no probe operators. |
| `packages/cognition/src/environmental/observation-reasoner.ts` | `reason(payload)` | Single observation → insight. No belief state; no expectedInformationGain. |
| `packages/minecraft-interface/src/observation-mapper.ts` | 491-530 | `toHomeostasisState()`: health, hunger, safety from player. Evidence extraction point. |

**Gap:** No BeliefState, ProbeOperator, BeliefUpdate, EntropyTracker, or probe-selection logic. Evidence flows to cognition (observation-reasoner) and planning (signal-extraction-pipeline) but no belief-layer fusion.

---

## 4. conscious-bot vs Sterling split

| Responsibility | Owner | Location |
|----------------|-------|----------|
| BeliefState, hypothesis set, probability buckets | conscious-bot | `packages/minecraft-interface/src/epistemic/belief-state.ts` (new) |
| ProbeOperator definitions (turn-to, sector-scan, biome-sample) | conscious-bot | `packages/minecraft-interface/src/epistemic/probe-operators.ts` (new) |
| BeliefUpdate (evidence → posterior) | conscious-bot | `packages/minecraft-interface/src/epistemic/belief-update.ts` (new) |
| EntropyTracker, probe selection (max information gain) | conscious-bot | `packages/minecraft-interface/src/epistemic/entropy-tracker.ts` (new) |
| Inject probe goals into GoalManager | conscious-bot | `packages/planning/src/goal-formulation/goal-manager.ts` (extend) |
| Epistemic planning domain (belief in state, probe operators) | Sterling | Sterling Python domain (optional) |
| Objective: minimize cost to reach confidence threshold | Sterling | Sterling cost function (optional) |

**Contract:** conscious-bot maintains BeliefState; emits probe goals when entropy exceeds threshold; Sterling (if used) receives belief-augmented state and probe operators. Implement belief layer in conscious-bot first; Sterling integration when epistemic domain is defined.

---

## 5. What to implement / change

### 5.1 Belief layer (new module)

**Location**: `packages/minecraft-interface/src/epistemic/` (or `packages/world/src/epistemic/`)

- `BeliefState`: hypothesis set with probability mass per hypothesis
- `ProbeOperator`: sensing action with expected evidence and cost
- `BeliefUpdate`: deterministic update rule given evidence payload
- `EntropyTracker`: information gain measurement for probe selection

### 5.2 Minecraft-side integration

- Define hypothesis space for target tasks (structure localization, resource search)
- Map probes to Minecraft actions (travel to vantage, biome sampling, mob mix sampling)
- Extract evidence from observations and feed to belief update

### 5.3 Foundation for Rig I-ext

- Belief update semantics used by entity tracking
- Active sensing operators (turn-to, sector-scan) shared with I-ext
- Confidence threshold semantics (when to act vs. when to probe)

### 5.4 Sterling integration

- Define `epistemic-planning` domain in Sterling
- State includes belief distribution + explored regions + probe history
- Operators: probe actions that transition belief state
- Objective: minimize cost to reach confidence threshold

---

## 6. Where (summary)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| BeliefState | `minecraft-interface/src/epistemic/` | Hypothesis distribution |
| ProbeOperator | `minecraft-interface/src/epistemic/` | Sensing action definitions |
| BeliefUpdate | `minecraft-interface/src/epistemic/` | Evidence → belief transition |
| EntropyTracker | `minecraft-interface/src/epistemic/` | Information gain calculation |
| Cognition integration | `cognition/src/` | Probe goal arbitration |
| Sterling domain | `sterling/domains/` | Epistemic planning solves |

---

## 7. Implementation pivots

### Pivot 1: Probability buckets only — no continuous belief

**Problem:** Continuous probabilities cause state explosion and float jitter. Same evidence at slightly different belief states produces different probe choices.

**Pivot:** All belief state uses integer probability buckets (0.0, 0.1, ..., 1.0). `toProbBucket(raw)` at boundary only.

**Code:** See `RIG_I_EPISTEMIC_PLANNING_APPROACH.md` section 4.2.

**Acceptance check:** Same belief state + evidence yields identical posterior. No raw floats in BeliefState.

### Pivot 2: Bounded hypothesis set — no unbounded exploration

**Problem:** Unbounded hypothesis sets cause search explosion; planner may explore infinite hypothesis space.

**Pivot:** `MAX_HYPOTHESES = 32`; hypothesis set is capped. Evict lowest-probability when full.

**Acceptance check:** Belief state never exceeds MAX_HYPOTHESES. Eviction is deterministic (lowest prob, then oldest).

### Pivot 3: Probe selection by information gain — no random exploration

**Problem:** Random probe choice wastes resources; "lucky finds" do not generalize.

**Pivot:** `selectProbe(belief, availableProbes)` returns probe with max expected information gain (entropy reduction). Deterministic tie-break: lexicographic by probe id.

**Acceptance check:** Same belief state + probe set yields same probe chosen. Entropy decreases (or stays same) after each informative probe.

### Pivot 4: Confidence threshold before commit — no early action

**Problem:** Acting before confidence is reached causes wasted effort when wrong.

**Pivot:** `hasReachedConfidence(belief, threshold)` must return true before committing to goal-directed action. Default threshold 0.8.

**Acceptance check:** No goal action emitted when confidence < threshold. Probe actions only until threshold.

### Pivot 5: Deterministic belief update — same evidence, same posterior

**Problem:** Non-deterministic updates cause test flakiness; replay fails.

**Pivot:** `beliefUpdate(prior, evidence)` is pure: same prior + evidence → same posterior. No `Date.now()`, no randomness.

**Acceptance check:** 100 runs of same prior + evidence yield identical posterior. Belief update is reproducible.

---

## 8. Transfer surfaces (domain-agnosticism proof)

### 8.1 Diagnostic fault localization

**Surface:** Fault hypotheses, probe actions (run test, check log, inspect component), belief over fault location.

- **State:** Belief over fault hypotheses (component A, B, C; root cause X, Y, Z)
- **Probes:** Run unit test (pass/fail), check error log (message present/absent), inspect config (valid/invalid)
- **Evidence:** Test result, log content, config state
- **Goal:** P(correct_fault) > 0.9 before attempting fix

**Prove:** Same probability buckets, same probe selection by information gain, same confidence threshold semantics.

**Certification gates:**
- Probe choice reduces entropy (measurable)
- No fix attempted before confidence threshold
- Same evidence → same posterior (deterministic)

### 8.2 Medical triage (symptom → diagnosis)

**Surface:** Diagnosis hypotheses, probe actions (lab test, physical exam), belief over conditions.

- **State:** Belief over diagnoses (condition A, B, C)
- **Probes:** Order lab test, perform physical exam, check history
- **Evidence:** Test result, exam finding, history fact
- **Goal:** P(diagnosis) > threshold before treatment

**Prove:** Same bounded hypothesis set, same probe cost/benefit, same confidence calibration.

**Certification gates:**
- Information gain drives probe selection
- No treatment before confidence threshold
- Deterministic belief update

### 8.3 Search and rescue (structure localization)

**Surface:** Location hypotheses, probe actions (sector scan, travel to vantage), belief over target location.

- **State:** Belief over sectors (north, south, east, west; structure type)
- **Probes:** Travel to vantage, sector scan, biome sample
- **Evidence:** Observed biome, mob mix, block pattern
- **Goal:** P(target_in_sector) > 0.9 before committing travel

**Prove:** Same epistemic semantics as Minecraft structure search. Direct mapping to Minecraft probes.

**Certification gates:**
- Probe reduces entropy before goal action
- No long travel before confidence
- Minecraft integration passes same tests

---

## 9. Concrete certification tests

### Test 1: Entropy reduction

```ts
describe('Epistemic planning - entropy reduction', () => {
  it('reduces entropy with informative probe', () => {
    const belief = initializeBeliefState(SIMPLE_HYPOTHESES);
    const initialEntropy = calculateEntropy(belief);
    const evidence = { probeId: 'biome_sample', payload: { type: 'biome', value: 'plains', confidence: 0.8 }, observedAtTick: 1 };
    const updated = beliefUpdate(belief, evidence);
    expect(calculateEntropy(updated)).toBeLessThanOrEqual(initialEntropy);
  });

  it('selects probe with max information gain', () => {
    const belief = initializeBeliefState(SIMPLE_HYPOTHESES);
    const probes = ['biome_sample', 'mob_mix_sample', 'block_sample'];
    const selected = selectProbe(belief, probes);
    expect(probes).toContain(selected);
    // Same belief + probes → same selection (deterministic)
    expect(selectProbe(belief, probes)).toBe(selected);
  });
});
```

### Test 2: Confidence threshold

```ts
describe('Epistemic planning - confidence threshold', () => {
  it('does not commit below threshold', () => {
    const belief = createUniformBelief(4); // P=0.25 each
    const result = hasReachedConfidence(belief, 0.8);
    expect(result.reached).toBe(false);
  });

  it('commits when best hypothesis exceeds threshold', () => {
    const belief = createConcentratedBelief('hyp_a', 0.9);
    const result = hasReachedConfidence(belief, 0.8);
    expect(result.reached).toBe(true);
    expect(result.bestHypothesis).toBe('hyp_a');
  });
});
```

### Test 3: Deterministic belief update

```ts
describe('Epistemic planning - deterministic update', () => {
  it('same prior + evidence yields same posterior', () => {
    const prior = initializeBeliefState(SIMPLE_HYPOTHESES);
    const evidence = { probeId: 'p1', payload: { type: 't', value: 'v', confidence: 0.7 }, observedAtTick: 1 };
    const results = Array.from({ length: 100 }, () => beliefUpdate(prior, evidence));
    const first = JSON.stringify(results[0]);
    expect(results.every(r => JSON.stringify(r) === first)).toBe(true);
  });
});
```

### Test 4: Bounded hypothesis set

```ts
describe('Epistemic planning - bounded hypotheses', () => {
  it('never exceeds MAX_HYPOTHESES', () => {
    const hypotheses = Array.from({ length: 50 }, (_, i) => ({ id: `h${i}`, description: `H${i}`, features: {} }));
    const belief = initializeBeliefState(hypotheses);
    expect(belief.hypotheses.size).toBeLessThanOrEqual(MAX_HYPOTHESES);
  });
});
```

---

## 10. Order of work (suggested)

1. **Define BeliefState types** with hypothesis representation and probability buckets.
2. **Implement ProbeOperator** definitions for Minecraft sensing actions.
3. **Build BeliefUpdate** with deterministic evidence-to-belief transitions.
4. **Add EntropyTracker** for probe selection (max information gain).
5. **Wire to Minecraft** with evidence extraction from observations.
6. **Sterling integration** for epistemic planning solves.
7. **Add certification tests** for entropy reduction, calibration, and determinism.

---

## 11. Dependencies and risks

- **Rig A certification**: Epistemic planning builds on deterministic operator semantics.
- **Belief quantization**: Continuous belief space must be bucketed to prevent state explosion.
- **Evidence mapping**: Minecraft observations must map cleanly to evidence payloads.
- **Calibration risk**: Belief confidence should correlate with actual outcomes.

---

## 12. Definition of "done"

- **Discriminative probes**: Probe choice is based on information gain, not random exploration.
- **Entropy reduction**: Each probe reduces belief entropy (measurable).
- **Confidence calibration**: When confidence is high, target is found; when low, more probes needed.
- **Determinism**: Same belief state + evidence yields same updated belief state.
- **Bounded**: Hypothesis set is capped; belief buckets are finite.

---

## 13. Cross-references

- **Companion approach**: `RIG_I_EPISTEMIC_PLANNING_APPROACH.md` (implementation details, signatures, DO/DO NOT)
- **Rig I-ext**: `P21_RIG_I_EXT_IMPLEMENTATION_PLAN.md` (builds on epistemic semantics)
- **Capability primitives**: `capability-primitives.md` (P11 definition)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig I section)
