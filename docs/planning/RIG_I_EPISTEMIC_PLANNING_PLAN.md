# Rig I: Epistemic Planning Implementation Plan

**Primitive**: P11 — Epistemic planning (belief-state and active sensing)

**Status**: Planned (foundation for Rig I-ext entity belief tracking)

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

**Outcome:** Confirm evidence flow; where belief state is updated; where probe selection integrates.

---

## 4. What to implement / change

### 4.1 Belief layer (new module)

**Location**: `packages/minecraft-interface/src/epistemic/` (or `packages/world/src/epistemic/`)

- `BeliefState`: hypothesis set with probability mass per hypothesis
- `ProbeOperator`: sensing action with expected evidence and cost
- `BeliefUpdate`: deterministic update rule given evidence payload
- `EntropyTracker`: information gain measurement for probe selection

### 4.2 Minecraft-side integration

- Define hypothesis space for target tasks (structure localization, resource search)
- Map probes to Minecraft actions (travel to vantage, biome sampling, mob mix sampling)
- Extract evidence from observations and feed to belief update

### 4.3 Foundation for Rig I-ext

- Belief update semantics used by entity tracking
- Active sensing operators (turn-to, sector-scan) shared with I-ext
- Confidence threshold semantics (when to act vs. when to probe)

### 4.4 Sterling integration

- Define `epistemic-planning` domain in Sterling
- State includes belief distribution + explored regions + probe history
- Operators: probe actions that transition belief state
- Objective: minimize cost to reach confidence threshold

---

## 5. Where (summary)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| BeliefState | `minecraft-interface/src/epistemic/` | Hypothesis distribution |
| ProbeOperator | `minecraft-interface/src/epistemic/` | Sensing action definitions |
| BeliefUpdate | `minecraft-interface/src/epistemic/` | Evidence → belief transition |
| EntropyTracker | `minecraft-interface/src/epistemic/` | Information gain calculation |
| Cognition integration | `cognition/src/` | Probe goal arbitration |
| Sterling domain | `sterling/domains/` | Epistemic planning solves |

---

## 6. Order of work (suggested)

1. **Define BeliefState types** with hypothesis representation and probability buckets.
2. **Implement ProbeOperator** definitions for Minecraft sensing actions.
3. **Build BeliefUpdate** with deterministic evidence-to-belief transitions.
4. **Add EntropyTracker** for probe selection (max information gain).
5. **Wire to Minecraft** with evidence extraction from observations.
6. **Sterling integration** for epistemic planning solves.
7. **Add certification tests** for entropy reduction, calibration, and determinism.

---

## 7. Dependencies and risks

- **Rig A certification**: Epistemic planning builds on deterministic operator semantics.
- **Belief quantization**: Continuous belief space must be bucketed to prevent state explosion.
- **Evidence mapping**: Minecraft observations must map cleanly to evidence payloads.
- **Calibration risk**: Belief confidence should correlate with actual outcomes.

---

## 8. Definition of "done"

- **Discriminative probes**: Probe choice is based on information gain, not random exploration.
- **Entropy reduction**: Each probe reduces belief entropy (measurable).
- **Confidence calibration**: When confidence is high, target is found; when low, more probes needed.
- **Determinism**: Same belief state + evidence yields same updated belief state.
- **Bounded**: Hypothesis set is capped; belief buckets are finite.

---

## 9. Cross-references

- **Companion approach**: `RIG_I_EPISTEMIC_PLANNING_APPROACH.md` (implementation details, signatures, DO/DO NOT)
- **Rig I-ext**: `P21_RIG_I_EXT_IMPLEMENTATION_PLAN.md` (builds on epistemic semantics)
- **Capability primitives**: `capability-primitives.md` (P11 definition)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig I section)
