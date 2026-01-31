# Rig Documentation Upgrade Guide

This guide documents the engineering rigor applied to Rig I-ext (P21) and how to maintain consistency across all rig companion documents. Use this when creating or updating rig documentation.

---

## Standard structure (P21 / Rig I-ext baseline)

A fully upgraded companion approach document includes:

### 1. Executive summary
- One-paragraph goal
- Critical boundary (invariant)
- **Best path** (recommended implementation sequence)

### 2. Conscious-bot vs Sterling split
- Table: what conscious-bot must implement + file locations
- Table: Sterling role + required for this rig?
- **Contract** between the two (who sends what, who validates)

### 3. Current code anchors
- Exact file paths and line numbers (or line ranges)
- **Exact code to remove/replace/add** (snippets)
- Rule: no vague "update the solver" — specific function, specific change

### 4. Primary design decisions
- Table: Decision | Choice | Rationale

### 5. Implementation construction constraints (pivots)
Each pivot has:
- **Problem:** What goes wrong with naive implementation
- **Pivot:** The correction
- **Implementation:** Code example (or pseudocode)
- **Acceptance check:** Concrete pass/fail criterion

### 6. DO and DO NOT
- Explicit rules with anti-patterns
- Tied to pivots

### 7. Determinism / boundedness rules (non-negotiable)
- What must be deterministic
- What must be bounded
- No floats in canonical paths (use integer buckets where applicable)

### 8. Definition of "done"
- Core boundary criteria
- **Acceptance check table** (all pivots)
- Statement: "All N acceptance checks must pass"

### 9. Certification tests
- Code examples for key tests
- Reference to pivot acceptance checks

### 10. Cross-references
- Plan document, capability primitives, related rigs

---

## Pivot template

```markdown
### Pivot N: [Short name]

**Problem:** [What naive implementation does wrong; why tests flake or boundary is violated]

**Pivot:** [The correction in one sentence]

[Code example or pseudocode]

**Acceptance check:** [Concrete criterion — same X → same Y; or: X is never Y]
```

---

## Rig-specific footgun patterns

| Rig | Common footguns |
|-----|-----------------|
| A (Certification) | Learning changes semantics; trace hashing non-deterministic; validation bypassed |
| B (Capability) | Fail-warn instead of fail-closed; rules sent unfiltered; unknown capability = legal |
| C (Temporal) | Float time; unbounded wait; non-deterministic slot choice; deadlock undetected |
| D (Multi-strategy) | Global priors only; availability not from real state; learning on plan not execution |
| E (Hierarchical) | Macro/micro state mixed; feedback ignored; re-plan on every failure |
| F (Valuation) | Unbounded values; goal change not recalculated; drops without explanation |
| G (Partial-order) | Artificial total ordering; feasibility unchecked; support constraints ignored |
| H (Synthesis) | Non-deterministic simulation; symmetry not canonicalized; unbounded design space |
| I (Epistemic) | Continuous probabilities; probe choice non-discriminative; confidence threshold ignored |
| I-ext (P21) | Tick per scan; float canonicalization; non-deterministic track IDs; bypass reintroduced |
| J (Invariant) | Metric jitter; unbounded horizon; hazard in planning state |
| K (Irreversibility) | Premature commit; option value ignored; verification skipped |

---

## Upgrade checklist

When upgrading a rig document:

- [ ] Add conscious-bot vs Sterling split (or "N/A" with rationale)
- [ ] Add code anchors with exact paths and line context
- [ ] Add "Exact code to add/remove/replace" snippets
- [ ] Add 3–6 implementation construction constraints (pivots)
- [ ] Add acceptance check table
- [ ] Add determinism/boundedness rules
- [ ] Update Definition of done with acceptance check requirement
- [ ] Extend DO/DO NOT with pivot-derived rules
- [ ] Add "Best path" to executive summary

---

## Reference documents

- **Rig I-ext (P21):** `P21_RIG_I_EXT_COMPANION_APPROACH.md` — canonical example
- **Rig B:** `RIG_B_CAPABILITY_GATING_APPROACH.md` — upgraded with split, anchors, pivots
- **Rig C:** `RIG_C_TEMPORAL_PLANNING_APPROACH.md` — upgraded with split, anchors, pivots
