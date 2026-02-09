# Rig Documentation Index

This document indexes all rig implementation plans, their relationships, and the standard elements each document must cover to prevent drift between implementations.

---

## Standard documentation elements

Each rig must explicitly address six questions to keep implementations aligned:

| Element | Question | Where it lives | Purpose |
|---------|----------|----------------|---------|
| **Exists now** | What exists today? What works? What is missing? | Plan: Current state / Problem 3.1 | Baseline; avoids re-solving solved problems |
| **Investigate** | What must be verified before implementing? Where are the call sites? | Plan: What to Investigate | Locate exact files, confirm data flow, find reuse points |
| **Implement** | What must be built or changed? | Plan: What to Implement/Change | Scope of work |
| **How** | How should it be implemented? (design, constraints) | Approach: Pivots, DO/DO NOT | Prevents implementation footguns |
| **Where** | In which files/modules? | Plan: Where table; Approach: Code anchors | Unambiguous locations |
| **Why** | Why is this the right boundary? What does it prove? | Plan: Target invariant | Alignment with primitive |

### Plan document (`*_PLAN.md`) — required sections

1. **Target invariant** — Why (critical boundary)
2. **Current state / Problem** — Exists now (what works, what is missing)
3. **What to Investigate** — File paths, call sites, data flow to verify (see P21 for template)
4. **What to Implement/Change** — Scope of work
5. **Where** — Component | Location | Responsibility table
6. **Order of work** — Suggested sequence
7. **Dependencies and risks**
8. **Definition of done**

### Companion approach (`*_APPROACH.md`) — required sections

1. **Executive summary** + Best path
2. **conscious-bot vs Sterling split** — What lives where (or N/A with rationale)
3. **Current code anchors** — Exact file paths, line context, code to add/remove/replace
4. **Implementation construction constraints (pivots)** — Footguns + acceptance checks
5. **DO and DO NOT** — Rules tied to pivots
6. **Determinism / boundedness rules** — Non-negotiable
7. **Definition of done** — With acceptance check table

---

## Documentation status

| Rig | Primitive(s) | Status | Plan | Companion | Implementation |
|-----|--------------|--------|------|-----------|----------------|
| **Rig A** | P1 (Deterministic transformation) | Detailed | `RIG_A_CERTIFICATION_PLAN.md` | `RIG_A_CERTIFICATION_APPROACH.md` | **Implemented** (2026-02-09) |
| **Rig B** | P2 (Capability gating) | Detailed | `RIG_B_CAPABILITY_GATING_PLAN.md` | `RIG_B_CAPABILITY_GATING_APPROACH.md` | **Hardened** (2026-02-09) |
| **Rig C** | P3 (Temporal planning) | Detailed | `RIG_C_TEMPORAL_PLANNING_PLAN.md` | `RIG_C_TEMPORAL_PLANNING_APPROACH.md` | **Hardened** (2026-02-09) |
| **Rig D** | P4 (Multi-strategy) | Detailed | `RIG_D_MULTI_STRATEGY_PLAN.md` | `RIG_D_MULTI_STRATEGY_APPROACH.md` | — |
| **Rig E** | P5 (Hierarchical) | Detailed | `RIG_E_HIERARCHICAL_PLANNING_PLAN.md` | `RIG_E_HIERARCHICAL_PLANNING_APPROACH.md` | — |
| **Rig F** | P6 (Valuation under scarcity) | Detailed | `RIG_F_VALUATION_SCARCITY_PLAN.md` | `RIG_F_VALUATION_SCARCITY_APPROACH.md` | — |
| **Rig G** | P7 (Partial-order) | Detailed | `RIG_G_PARTIAL_ORDER_PLAN.md` | `RIG_G_PARTIAL_ORDER_APPROACH.md` | — |
| **Rig H** | P8 (Systems synthesis) | Detailed | `RIG_H_SYSTEMS_SYNTHESIS_PLAN.md` | `RIG_H_SYSTEMS_SYNTHESIS_APPROACH.md` | **Implemented** (2026-02-09) |
| **Rig I** | P11 (Epistemic planning) | Detailed | `RIG_I_EPISTEMIC_PLANNING_PLAN.md` | `RIG_I_EPISTEMIC_PLANNING_APPROACH.md` | **Implemented** (2026-02-09) |
| **Rig I-ext** | P21 (Entity belief + saliency) | Detailed (priority) | `P21_RIG_I_EXT_IMPLEMENTATION_PLAN.md` | `P21_RIG_I_EXT_COMPANION_APPROACH.md` | **Certified** (p21.a: 2 surfaces, p21.b: 1 surface) |
| **Rig J** | P12 (Invariant maintenance) | Detailed | `RIG_J_INVARIANT_MAINTENANCE_PLAN.md` | `RIG_J_INVARIANT_MAINTENANCE_APPROACH.md` | **Implemented** (2026-02-09) |
| **Rig K** | P13 (Irreversibility) | Detailed | `RIG_K_IRREVERSIBILITY_PLAN.md` | `RIG_K_IRREVERSIBILITY_APPROACH.md` | **Implemented** (2026-02-09) |
| Rig L | P9 (Contingency) | Later | — | — | — |
| Rig M | P10 (Risk-aware) | Later | — | — | — |
| Rig N | P15 (Fault diagnosis) | Later | — | — | — |

**Detailed**: Plan + Companion with pivots, acceptance checks, conscious-bot vs Sterling split.
**Later**: Deferred until Tracks 1-2 are solid.

---

## Documentation coverage matrix

Per-rig checklist: what each document set provides. Use this to identify gaps before implementation.

| Rig | Exists now | Investigate (paths) | Implement | How (pivots) | Where (anchors) | Why (invariant) |
|-----|------------|---------------------|-----------|--------------|-----------------|-----------------|
| A | Plan 2 | Plan 3 | Plan 4 | Approach 4 | Approach 3 | Plan 1 |
| B | Plan 3.1 | Plan 4 (verified) | Plan 5 | Approach 8 | Approach 3 | Plan 1 |
| C | Plan 3 | Plan 3 (verified) | Plan 5 | Approach 6, 9 | Plan 3, Approach 3 | Plan 1 |
| D | Plan 3.1 | Plan 4 (verified 4a) | Plan 5 | Approach 2 | Plan 4a | Plan 1 |
| E | Plan 3.1 | Plan 4 (verified 4a) | Plan 5 | Approach 2 | Plan 4a | Plan 1 |
| F | Plan 3.1 | Plan 4 (verified 4a) | Plan 5 | Approach 2 | Plan 4a | Plan 1 |
| G | Plan 3.1 | Plan 4 (verified 4a) | Plan 5 | Approach 2 | Plan 4a | Plan 1 |
| H | Plan 3.1 | Plan 4 (verified 4a) | Plan 5 | Approach 2 | Plan 4a | Plan 1 |
| I | Plan 2 | Plan 3 (verified 3a) | Plan 5 | Plan 7, Approach 2, 3b | Plan 3a, Approach 3b | Plan 1 |
| I-ext | Plan 1, 1b | Plan 2, 2.1a (verified) | Plan 3 | Approach 6.2 | Approach 3 | Plan 1 |
| J | Plan 2 | Plan 3 (verified 3a) | Plan 5 | Plan 7, Approach 2 | Approach 4 | Plan 1 |
| K | Plan 3.1 | Plan 4 (verified 4a) | Plan 5 | Approach 2 | Plan 4a | Plan 1 |

**Enrichment status (2026-01-31):** All 12 rigs are ENRICHED. Each has: verified investigation outcomes and code anchors (section 4a/4b), conscious-bot vs Sterling split, implementation pivots, transfer surfaces, 5 concrete certification tests, definition of done, implementation files summary. See `RIG_ENRICHMENT_STATUS.md` for status.

**Implementation note (2026-02-09):** Rigs H, J, K, N are CONTRACT-CERTIFIED (TS-local, E2E: NONE). P08 `bounded_motifs`: enforcement applies to instantiation via design-size bounds; `MAX_MOTIFS` is reserved for a future persistent motif library. P15 (Rig N) wraps P11 via constructor injection — all epistemic computation delegated to P11; P15 adds repair/validation sequencing and bounded episode control. CI fixture overrides `confidenceThreshold` to 0.7 (domain parameterization, not capability limitation; P11 ProbBucket discretization with 4 hypotheses). Farm domain uses capsule default 0.8. Evidence manifest: `sterling/__tests__/rig-evidence.json`.

---

## Dependency graph

```
                        ┌───────────────────────────────────┐
                        │       Rig A (Certification)        │
                        │   P1: Deterministic transformation │
                        │     Foundation for all rigs        │
                        └──────────────────┬────────────────┘
                                           │
         ┌─────────────────┬───────────────┼───────────────┬─────────────────┐
         │                 │               │               │                 │
         ▼                 ▼               ▼               ▼                 ▼
   ┌───────────┐    ┌───────────┐   ┌───────────┐   ┌───────────┐    ┌───────────┐
   │   Rig B   │    │   Rig I   │   │   Rig J   │   │   Rig D   │    │   Rig F   │
   │ Capability│    │ Epistemic │   │ Invariant │   │Multi-strat│    │ Valuation │
   │    P2     │    │    P11    │   │    P12    │   │    P4     │    │    P6     │
   └─────┬─────┘    └─────┬─────┘   └─────┬─────┘   └─────┬─────┘    └─────┬─────┘
         │                │               │               │                │
         ▼                ▼               │               ▼                │
   ┌───────────┐    ┌───────────┐        │         ┌───────────┐          │
   │   Rig C   │    │  Rig I-ext│◄───────┘         │   Rig E   │          │
   │ Temporal  │    │Entity blf │                  │Hierarchicl│          │
   │    P3     │    │    P21    │                  │    P5     │          │
   └─────┬─────┘    └─────┬─────┘                  └─────┬─────┘          │
         │                │                              │                │
         │                ▼                              ▼                │
         │          ┌───────────┐                 ┌───────────┐          │
         └─────────►│   Rig K   │◄────────────────│   Rig G   │◄─────────┘
                    │Irreversibl│                 │Partial-ord│
                    │    P13    │                 │    P7     │
                    └───────────┘                 └─────┬─────┘
                                                       │
                                                       ▼
                                                 ┌───────────┐
                                                 │   Rig H   │
                                                 │ Synthesis │
                                                 │    P8     │
                                                 └───────────┘

Deferred:
  Rig L (Contingency P9) → depends on K
  Rig M (Risk-aware P10) → depends on I-ext, K
  Rig N (Fault diagnosis P15) → depends on A, I
```

---

## Implementation priority

### Track 1: Certification (tightening what we have)
1. **Rig A** — Certification hardening (determinism, traceability)
2. **Rig B** — Capability gating (fail-closed legality)
3. **Rig C** — Temporal planning (durations, batching, capacity)

### Track 2: Belief + perception (immediate need)
1. **Rig I** — Epistemic planning (probe selection, hypothesis collapse)
2. **Rig I-ext** — Entity belief tracking (solves observation spam)
3. **Rig J** — Invariant maintenance (proactive scheduling)

### Track 3: Representational widening
1. **Rig D** — Multi-strategy (alternative acquisition methods)
2. **Rig E** — Hierarchical planning (macro/micro separation)
3. **Rig F** — Valuation under scarcity (keep/drop decisions)
4. **Rig G** — Partial-order structure (commuting steps)
5. **Rig H** — Systems synthesis (design space search)
6. **Rig K** — Irreversibility (commitment planning)

### Track 4: Deferred (requires stricter modeling)
- **Rig L** — Contingency planning (P9)
- **Rig M** — Risk-aware planning (P10)
- **Rig N** — Fault diagnosis (P15)

---

## What "detailed documentation" means

Rigs with detailed documentation (A, B, C, D, E, F, G, H, I, I-ext, J, K) have:

1. **Implementation plan** (`*_PLAN.md`)
   - Target invariant (critical boundary)
   - Formal signature
   - Problem being solved (current state vs with this rig)
   - What to implement/change
   - Order of work
   - Dependencies and risks
   - Definition of "done"

2. **Companion approach** (`*_APPROACH.md`)
   - Executive summary
   - Design decisions table
   - TypeScript interface/signature definitions
   - Staged delivery (where applicable)
   - DO and DO NOT rules
   - Certification tests with code examples
   - Cross-references to related docs

### Deferred rigs

Rigs L, M, N are deferred and use the **standard template** (8 sections) in `sterling-minecraft-domains.md`. These will be expanded when:
- Tracks 1-2 are solid
- Stricter modeling patterns are established
- Risk/contingency primitives are better understood

---

## Cross-reference map

| Document | References |
|----------|------------|
| `capability-primitives.md` | All primitives P1-P21 |
| `sterling-minecraft-domains.md` | All rigs A-N (standard template) |
| **Rig A (Certification)** | |
| `RIG_A_CERTIFICATION_PLAN.md` | Rig A plan |
| `RIG_A_CERTIFICATION_APPROACH.md` | Rig A detailed approach |
| **Rig B (Capability Gating)** | |
| `RIG_B_CAPABILITY_GATING_PLAN.md` | Rig B plan |
| `RIG_B_CAPABILITY_GATING_APPROACH.md` | Rig B detailed approach |
| **Rig C (Temporal Planning)** | |
| `RIG_C_TEMPORAL_PLANNING_PLAN.md` | Rig C plan |
| `RIG_C_TEMPORAL_PLANNING_APPROACH.md` | Rig C detailed approach |
| **Rig D (Multi-Strategy)** | |
| `RIG_D_MULTI_STRATEGY_PLAN.md` | Rig D plan |
| `RIG_D_MULTI_STRATEGY_APPROACH.md` | Rig D detailed approach |
| **Rig E (Hierarchical)** | |
| `RIG_E_HIERARCHICAL_PLANNING_PLAN.md` | Rig E plan |
| `RIG_E_HIERARCHICAL_PLANNING_APPROACH.md` | Rig E detailed approach |
| **Rig F (Valuation)** | |
| `RIG_F_VALUATION_SCARCITY_PLAN.md` | Rig F plan |
| `RIG_F_VALUATION_SCARCITY_APPROACH.md` | Rig F detailed approach |
| **Rig G (Partial-Order)** | |
| `RIG_G_PARTIAL_ORDER_PLAN.md` | Rig G plan |
| `RIG_G_PARTIAL_ORDER_APPROACH.md` | Rig G detailed approach |
| **Rig H (Systems Synthesis)** | |
| `RIG_H_SYSTEMS_SYNTHESIS_PLAN.md` | Rig H plan |
| `RIG_H_SYSTEMS_SYNTHESIS_APPROACH.md` | Rig H detailed approach |
| **Rig I (Epistemic)** | |
| `RIG_I_EPISTEMIC_PLANNING_PLAN.md` | Rig I plan |
| `RIG_I_EPISTEMIC_PLANNING_APPROACH.md` | Rig I detailed approach |
| **Rig I-ext (Entity Belief)** | |
| `P21_RIG_I_EXT_IMPLEMENTATION_PLAN.md` | I-ext plan, pivots summary |
| `P21_RIG_I_EXT_COMPANION_APPROACH.md` | I-ext detailed approach, 8 pivots |
| **Rig J (Invariant Maintenance)** | |
| `RIG_J_INVARIANT_MAINTENANCE_PLAN.md` | Rig J plan |
| `RIG_J_INVARIANT_MAINTENANCE_APPROACH.md` | Rig J detailed approach |
| **Rig K (Irreversibility)** | |
| `RIG_K_IRREVERSIBILITY_PLAN.md` | Rig K plan |
| `RIG_K_IRREVERSIBILITY_APPROACH.md` | Rig K detailed approach |

---

## Documentation coverage

### Fully documented with P21-level rigor (12 rigs)
All rigs in Tracks 1-3 have implementation plans and companion approaches with:
- conscious-bot vs Sterling split
- Implementation construction constraints (pivots)
- Acceptance check tables
- Determinism rules

- **Track 1**: A, B, C
- **Track 2**: I, I-ext, J
- **Track 3**: D, E, F, G, H, K

See `RIG_DOCUMENTATION_UPGRADE_GUIDE.md` for the upgrade pattern and quality criteria.

### Related documents

| Document | Purpose |
|----------|---------|
| `RIG_DOCUMENTATION_UPGRADE_GUIDE.md` | Upgrade pattern, pivot template, footgun patterns |
| `capability-primitives.md` | Primitive definitions P1-P21 |
| `sterling-minecraft-domains.md` | Rig index, global invariants, standard template |

### Deferred (3 rigs)
Rigs L, M, N remain at standard template level. Expand when:
1. **Immediate implementation** — The rig is next in priority
2. **Foundation work complete** — Tracks 1-2 are certified
3. **Risk modeling mature** — Contingency/risk patterns established

### Quality criteria
Each detailed documentation set includes:
- Critical boundary/invariant
- TypeScript signatures
- DO/DO NOT rules
- Certification tests
- Cross-references
