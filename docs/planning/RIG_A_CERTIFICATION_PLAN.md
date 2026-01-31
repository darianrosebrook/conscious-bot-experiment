# Rig A: Certification Hardening Implementation Plan

**Primitive**: P1 — Deterministic transformation planning (resource → product)

**Status**: Implemented baseline; needs certification hardening

---

## 1. Target invariant (critical boundary)

**"Correctness is provable; learning never changes semantics."**

The system must:
- Pass strict validation on all client-defined rules
- Produce deterministic traces (same input → same output hash)
- Update priors only from execution outcomes, not planned success
- Provide audit-grade explanations for all plan choices

**What this rig proves**: Sterling's crafting domain is certifiably correct, deterministic, and auditable.

---

## 2. Current state (baseline)

- **Working**: Crafting solver produces valid plans for resource → product goals
- **Missing**: Strict rule validation, trace bundle hashing, execution-based credit, explanations
- **Risk**: Rules with invalid preconditions/effects can slip through; learning on planned success

---

## 3. What to investigate before implementing

| Step | Location | What to verify |
|------|----------|----------------|
| Rule flow | `packages/planning/src/sterling/minecraft-crafting-solver.ts` | Where rules are built and sent to Sterling |
| Solve bundle | `packages/planning/src/sterling/solve-bundle.ts` | Bundle input/output; where to add canonical hash |
| Execution reporting | task-integration, reactive-executor | Where step success/failure is reported |
| Sterling solve handler | Sterling (Python) | Accepts rules; where validation would run (or conscious-bot pre-validates) |

**Outcome:** Confirm rule flow; where validation gate sits (conscious-bot vs Sterling); execution reporting hook.

---

## 4. What to implement / change

### 4.1 Strict rule validation (hardening)

- Schema validation for all rule inputs (preconditions, effects, costs)
- Boundedness checks (cost within limits, count deltas within caps)
- Semantic guards (no self-contradicting rules, no unbounded recursion)
- Fail-closed: invalid rules reject the entire solve request

### 4.2 Trace bundle hashing (determinism proof)

- Hash all solve inputs (rules, state, goal) canonically
- Hash all solve outputs (plan, expansions, trace) canonically
- Same request + same Sterling version → identical trace hash
- Expose trace hash in solve response for verification

### 4.3 Execution-based credit assignment

- Separate "plan found" from "plan executed successfully"
- Update priors only when execution reports step success/failure
- Partial credit: only the responsible segment gets updated
- No reinforcement on hypothetical success

### 4.4 Audit-grade explanations

- For each solve: which constraints bound the solution
- Top competing alternatives and why rejected
- Evidence/experience that shaped priors
- Legality gates considered

---

## 5. Where (summary)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Rule validation | `sterling/domains/crafting/` | Schema + semantic checks |
| Trace hashing | `sterling/core/` | Canonical hash of solve bundles |
| Credit assignment | `planning/src/` | Execution-grounded prior updates |
| Explanations | `sterling/domains/crafting/` | Audit output in solve response |
| Conscious-bot integration | `planning/src/` | Consume explanations, report execution |

---

## 6. Order of work (suggested)

1. **Add rule validation** with schema checks and semantic guards.
2. **Implement trace hashing** with canonical input/output serialization.
3. **Add execution reporting** from conscious-bot to Sterling.
4. **Wire credit assignment** to update priors only on execution outcomes.
5. **Add explanation output** to solve responses.
6. **Certification tests** for determinism, validation rejection, and credit semantics.

---

## 7. Dependencies and risks

- **Sterling changes**: Rule validation and trace hashing require Sterling modifications.
- **Execution reporting**: Conscious-bot must report step outcomes back to Sterling.
- **Backward compatibility**: Existing crafting solves must continue to work during transition.
- **Explanation overhead**: Audit output adds payload size; make optional/configurable.

---

## 8. Definition of "done"

- **Validation**: Invalid rules reject the solve request with specific error.
- **Determinism**: Same request produces identical trace hash across runs.
- **Credit semantics**: Priors update only on execution reports, not plan success.
- **Explanations**: Every solve includes audit output (constraints, alternatives, evidence).
- **Tests**: Certification harness passes all signature, performance, and transfer tests.

---

## 9. Cross-references

- **Companion approach**: `RIG_A_CERTIFICATION_APPROACH.md` (implementation details, signatures, DO/DO NOT)
- **Capability primitives**: `capability-primitives.md` (P1, P16, P17, P19, P20 definitions)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig A section)
- **Sterling docs**: `sterling/README.md` (solve protocol, domain handlers)
