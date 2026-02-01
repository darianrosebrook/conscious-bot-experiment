# Rig-Primitive Alignment Analysis
**Date**: 2026-01-31
**Purpose**: Assess alignment between conscious-bot's 11 RIG implementation plans (A-K) and Sterling's 21 capability primitive specifications (P01-P21)

---

## Executive Summary

### Overall Alignment Status

**Strong alignment**: conscious-bot's rig documentation and Sterling's primitive specs demonstrate excellent structural alignment with clear proving boundaries, shared certification gates, and consistent contracts.

**Coverage**: 11 rigs (A-K + I-ext) map to 13 primary primitives (P1-P13, P21). All 11 rigs have detailed implementation plans and companion approaches.

**Critical finding**: The alignment is **implementation-ready** with clear boundaries, but several gaps require attention before implementation can proceed:

1. **Secondary primitive coverage**: Primitives P16-P20 (cross-cutting concerns) are proven across multiple rigs but lack dedicated proving gates in individual rig plans
2. **Transfer envelope specificity**: Most rigs reference transfer tests but lack concrete non-Minecraft surface definitions
3. **Certification harness details**: Rig plans specify "what to prove" but most lack concrete test specifications aligned to Sterling primitive gates
4. **Sterling-conscious-bot contract versioning**: No explicit version alignment between rig I/O and Sterling primitive interface contracts

**Status by track**:
- **Track 1 (Certification)**: Rigs A, B, C — Ready with minor certification harness gaps
- **Track 2 (Belief + Perception)**: Rigs I, I-ext, J — Ready; I-ext has most detailed specification
- **Track 3 (Widening)**: Rigs D, E, F, G, H, K — Plans complete; need certification detail pass

---

## Rig-by-Rig Alignment Analysis

### Rig A: Certification Hardening
**Maps to**: P1 (Deterministic transformation) [primary] + P16, P17, P19, P20 [secondary]

| Aspect | Alignment | Notes |
|--------|-----------|-------|
| **Formal signature** | ✅ Full | Sterling P1: "finite discrete state, typed operators, additive cost, minimal-cost path" matches Rig A plan section 1-2 |
| **Certification gates** | ⚠️ Partial | Rig A lists gates (determinism, validation, credit, explanations) but lacks concrete test specifications. Sterling P1 gates are more precise: "identical request + version → identical trace hash" |
| **Transfer envelope** | ⚠️ Missing | Rig A references "transfer tests" but no concrete non-Minecraft surface defined. Sterling P1 suggests "bill-of-materials assembly; software build graphs" |
| **Footguns alignment** | ✅ Full | Rig A "Current state/Problem" section 3 and Sterling P1 section 8 "Known footguns" align on: implicit state, learning on planned success, untrusted rules |
| **I/O contract** | ⚠️ Partial | Rig A references solve bundles but doesn't specify alignment to Sterling P1 section 9 I/O contract (state_canon, trace_bundle, explanation_bundle) |

**Primary primitives proven**: P1 (resource → product transformation)

**Secondary primitives proven**:
- P16 (State canonicalization): Rig A plan section 4.2 "Trace bundle hashing" + "canonical inventory signature"
- P17 (Execution-grounded credit): Rig A plan section 4.3 "Execution-based credit assignment"
- P19 (Audit explanations): Rig A plan section 4.4 "Audit-grade explanations"
- P20 (Rule injection hardening): Rig A plan section 4.1 "Strict rule validation"

**Critical gaps**:
1. No concrete test specifications for determinism gate (P1 requires "identical trace hash" verification)
2. No transfer surface specified (should define a second proving rig beyond Minecraft crafting)
3. Secondary primitives (P16-P20) lack dedicated certification gates in Rig A plan

**Recommended actions**:
- Add section "5.5 Certification test specifications" with concrete determinism, boundedness, validity tests
- Define a transfer surface (e.g., "software package dependency resolution" or "bill-of-materials assembly")
- Add explicit gates for P16-P20 secondary primitives

---

### Rig B: Capability Gating and Legality
**Maps to**: P2 (Capability gating) [primary] + P16, P19, P20 [secondary]

| Aspect | Alignment | Notes |
|--------|-----------|-------|
| **Formal signature** | ✅ Full | Sterling P2: "state includes capability set; operators enabled/disabled by predicates; fail-closed legality" matches Rig B plan section 1-2 |
| **Certification gates** | ⚠️ Partial | Rig B section 9 "Definition of done" lists gates but lacks test specifications. Sterling P2 requires same gates as P1 plus legality-specific assertions |
| **Transfer envelope** | ⚠️ Missing | Rig B references "transfer tests" but no surface defined. Sterling P2 suggests "permissioned workflows; safety ladders; robotics autonomy levels" |
| **Footguns alignment** | ✅ Full | Rig B plan section 8 "Dependencies and risks" and Sterling P2 "Known footguns" align on capability explosion, derivation correctness, monotonicity |
| **I/O contract** | ⚠️ Partial | Rig B doesn't specify capability set in canonical state format aligned to Sterling P2 I/O contract |

**Primary primitives proven**: P2 (capability gating, fail-closed legality)

**Secondary primitives proven**:
- P16 (State canonicalization): Rig B plan section 5.1 "Capability state representation" with "canonically hashed" capability atoms
- P19 (Audit explanations): Rig B plan section 9 "Explain sacrifices: what was dropped and why"
- P20 (Rule injection hardening): Rig B plan section 5.2 "Fail-closed: if any capability check fails, operator is illegal"

**Critical gaps**:
1. No "conscious-bot vs Sterling split" section despite RIG_DOCUMENTATION_INDEX.md requiring it (see Rig B row: "no Sterling changes" implies client-side enforcement, but this should be explicit)
2. No adversarial test suite specification (Sterling P2 requires proving "illegal operators rejected")
3. No transfer surface defined

**Recommended actions**:
- Add explicit "conscious-bot enforces legality (pre-filter + post-validate), Sterling receives only legal rules" in plan section 5.4
- Add section "5.5 Adversarial test suite" with illegal operator injection tests
- Define transfer surface (e.g., "enterprise approval workflow" or "staged deployment gates")

---

### Rig C: Temporal Planning with Capacity and Batching
**Maps to**: P3 (Temporal planning) [primary] + P16, P17, P18, P19 [secondary]

| Aspect | Alignment | Notes |
|--------|-----------|-------|
| **Formal signature** | ✅ Full | Sterling P3: "actions with duration, resource occupancy, objective includes time, state includes clocks" matches Rig C plan section 1-2 |
| **Certification gates** | ⚠️ Partial | Rig C section 9 lists gates (no deadlocks, batching efficiency, determinism) but lacks concrete test specifications |
| **Transfer envelope** | ⚠️ Missing | No surface defined. Sterling P3 doesn't specify transfer envelope (gap in primitive spec) |
| **Footguns alignment** | ✅ Full | Rig C plan section 8 and Sterling P3 footguns align on: unbounded time, wait loops, concurrency ambiguity |
| **I/O contract** | ⚠️ Partial | Rig C doesn't specify time/capacity fields in canonical state aligned to Sterling I/O contract |

**Primary primitives proven**: P3 (temporal planning, durations, batching, capacity)

**Secondary primitives proven**:
- P16 (State canonicalization): Rig C plan section 5.1 "Time quantization into buckets to prevent state explosion"
- P17 (Execution-grounded credit): Rig C builds on Rig A credit semantics
- P18 (Multi-objective): Rig C plan section 1 "Objective includes time: Minimize makespan, not just action count"
- P19 (Audit explanations): Implied by objective articulation

**Critical gaps**:
1. No concrete test specifications for "no deadlocks" gate (should specify unreachable state detection)
2. Time quantization strategy not detailed (bucket size, overflow handling)
3. Transfer envelope missing (both in rig plan and Sterling P3 spec)

**Recommended actions**:
- Add section "5.5 Time quantization strategy" with bucket size, canonical ordering rules
- Add section "6 Certification test specifications" with deadlock detection, batching efficiency metrics
- Propose transfer surface to Sterling team (e.g., "job shop scheduling" or "cloud resource allocation")

---

### Rig D: Multi-Strategy Acquisition
**Maps to**: P4 (Multi-strategy) [primary] + P17, P18, P19, P20 [secondary]

| Aspect | Alignment | Notes |
|--------|-----------|-------|
| **Formal signature** | ✅ Full | Sterling P4: "multiple operator families, costs differ, availability predicates, learning updates strategy priors" matches Rig D plan section 1-2 |
| **Certification gates** | ⚠️ Partial | Rig D section 9 lists gates but no test specifications. Sterling P4 uses standard gates (P1-style) |
| **Transfer envelope** | ⚠️ Missing | No surface defined. Sterling P4 doesn't specify transfer envelope (gap in primitive spec) |
| **Footguns alignment** | ✅ Full | Rig D plan section 8 aligns with P4 standard footguns plus strategy-specific risks |
| **I/O contract** | ⚠️ Partial | Rig D doesn't specify availability flags in canonical state format |

**Primary primitives proven**: P4 (multi-strategy acquisition, world-conditioned priors)

**Secondary primitives proven**:
- P17 (Execution-grounded credit): Rig D plan section 5.4 "Learning updates strategy priors from execution outcomes"
- P18 (Multi-objective): Rig D plan section 5.1 "Strategies have different cost profiles: time, risk, resource burn"
- P19 (Audit explanations): Implied by strategy choice rationale
- P20 (Rule injection hardening): Rig D plan section 5.3 implies validation of strategy operators

**Critical gaps**:
1. No "conscious-bot vs Sterling split" section (are strategy priors in Sterling or conscious-bot?)
2. No test specifications for "learning updates the strategy prior" gate
3. Transfer envelope missing

**Recommended actions**:
- Add "conscious-bot vs Sterling split" section (recommendation: strategy priors in Sterling, availability extraction in conscious-bot)
- Add certification tests: "repeated failures → strategy prior decreases; successes → prior increases"
- Define transfer surface (e.g., "vendor selection with availability toggles")

---

### Rig E: Hierarchical Planning
**Maps to**: P5 (Hierarchical) [primary] + P16, P17, P19 [secondary]

| Aspect | Alignment | Notes |
|--------|-----------|-------|
| **Formal signature** | ✅ Full | Sterling P5: "macro abstraction layer, micro controller, macro edges invoke sub-solvers, costs incorporate execution feedback" matches Rig E plan |
| **Certification gates** | ⚠️ Partial | Rig E section 9 lists gates but no test specifications |
| **Transfer envelope** | ⚠️ Missing | No surface defined. Sterling P5 doesn't specify transfer envelope (gap) |
| **Footguns alignment** | ✅ Full | Rig E plan section 8 aligns with P5 standard footguns plus hierarchy-specific risks |
| **I/O contract** | ⚠️ Partial | Rig E doesn't specify macro state canonical format or sub-solver invocation contract |

**Primary primitives proven**: P5 (hierarchical planning, macro/micro separation)

**Secondary primitives proven**:
- P16 (State canonicalization): Rig E plan section 5.1 "Macro state is abstract: coarse features, not micro details"
- P17 (Execution-grounded credit): Rig E plan section 5.3 "Micro failures update macro edge costs"
- P19 (Audit explanations): Implied by failure attribution

**Critical gaps**:
1. No "conscious-bot vs Sterling split" section (critical: where does macro planner live?)
2. No specification for macro/micro boundary contract (what data crosses layers?)
3. Transfer envelope missing

**Recommended actions**:
- Add "conscious-bot vs Sterling split" with explicit macro/micro boundary (recommendation: macro planning in Sterling, micro execution in conscious-bot/Mineflayer)
- Add section "5.5 Macro/Micro contract" specifying data exchange format
- Define transfer surface (e.g., "zone routing with local motion planning")

---

### Rig F: Goal-Conditioned Valuation Under Scarcity
**Maps to**: P6 (Valuation) [primary] + P16, P17, P18, P19 [secondary]

| Aspect | Alignment | Notes |
|--------|-----------|-------|
| **Formal signature** | ✅ Full | Sterling P6: "constrained capacity, utility under goals, value model shifts with goals, learning updates valuations" matches Rig F plan |
| **Certification gates** | ⚠️ Partial | Rig F section 9 lists gates but no test specifications |
| **Transfer envelope** | ⚠️ Missing | No surface defined. Sterling P6 doesn't specify transfer envelope (gap) |
| **Footguns alignment** | ✅ Full | Rig F plan section 8 aligns with P6 standard footguns plus valuation-specific risks |
| **I/O contract** | ⚠️ Partial | Rig F doesn't specify capacity/value representation in canonical state |

**Primary primitives proven**: P6 (goal-conditioned valuation, keep/drop/allocate)

**Secondary primitives proven**:
- P16 (State canonicalization): Rig F plan section 5.1 "Capacity snapshot compressed into counts by category/value class"
- P17 (Execution-grounded credit): Rig F plan section 8 "Value estimates can drift if not grounded in execution"
- P18 (Multi-objective): Rig F plan section 1 "Objective is utility under current goals"
- P19 (Audit explanations): Rig F plan section 5.4 "Every drop/keep decision includes rationale"

**Critical gaps**:
1. No value function specification (how is "value(item, goal)" computed?)
2. No test specifications for "goal change shifts values" gate
3. Transfer envelope missing

**Recommended actions**:
- Add section "5.6 Value function specification" with explicit formula and bucketing rules
- Add certification tests: "same item, different goals → different value; explanations cite goal context"
- Define transfer surface (e.g., "cache eviction with workload-dependent value")

---

### Rig G: Partial-Order Structure
**Maps to**: P7 (Partial-order) [primary] + P16, P17, P19 [secondary]

| Aspect | Alignment | Notes |
|--------|-----------|-------|
| **Formal signature** | ✅ Full | Sterling P7: "operators with nontrivial preconditions, steps commute, partially ordered plan, valid linearization" matches Rig G plan |
| **Certification gates** | ⚠️ Partial | Rig G section 9 lists gates but no test specifications |
| **Transfer envelope** | ⚠️ Missing | No surface defined. Sterling P7 doesn't specify transfer envelope (gap) |
| **Footguns alignment** | ✅ Full | Rig G plan section 8 aligns with P7 standard footguns plus constraint-specific risks |
| **I/O contract** | ⚠️ Partial | Rig G doesn't specify partial-order plan output format (DAG vs list with dependency metadata) |

**Primary primitives proven**: P7 (feasibility under constraints, partial-order structure)

**Secondary primitives proven**:
- P16 (State canonicalization): Rig G plan section 5.1 "Constraint model with support/dependency/reachability"
- P17 (Execution-grounded credit): Builds on Rig A semantics
- P19 (Audit explanations): Implied by feasibility checking rationale

**Critical gaps**:
1. No "conscious-bot vs Sterling split" section (critical: does Sterling emit DAG or conscious-bot constructs it?)
2. No partial-order plan format specification (JSON schema for DAG with ordering edges)
3. Transfer envelope missing

**Recommended actions**:
- Add "conscious-bot vs Sterling split" specifying where partial-order representation lives (recommendation: Sterling emits dependency metadata, conscious-bot constructs DAG)
- Add section "5.5 Partial-order output format" with JSON schema for DAG
- Define transfer surface (e.g., "build pipeline with dependency constraints")

---

### Rig H: Systems Synthesis
**Maps to**: P8 (Systems synthesis) [primary] + P14, P16, P19 [secondary]

| Aspect | Alignment | Notes |
|--------|-----------|-------|
| **Formal signature** | ✅ Full | Sterling P8: "state is partial design, operators add components, evaluation checks spec, goal is spec holds" matches Rig H plan |
| **Certification gates** | ⚠️ Partial | Rig H section 9 lists gates but no test specifications |
| **Transfer envelope** | ⚠️ Missing | No surface defined. Sterling P8 doesn't specify transfer envelope (gap) |
| **Footguns alignment** | ✅ Full | Rig H plan section 8 aligns with P8 standard footguns plus synthesis-specific risks |
| **I/O contract** | ⚠️ Partial | Rig H doesn't specify design state canonical format or spec evaluation contract |

**Primary primitives proven**: P8 (systems synthesis, component composition)

**Secondary primitives proven**:
- P14 (Program-level planning): Rig H plan section 5.1 "Design is a graph structure (nodes = components, edges = connections)"
- P16 (State canonicalization): Rig H plan section 5.1 "State hashing must handle symmetry (rotated designs are equivalent)"
- P19 (Audit explanations): Rig H plan section 5.4 "Motif reuse rationale"

**Critical gaps**:
1. No "conscious-bot vs Sterling split" section (critical: where does design evaluation live?)
2. No specification for deterministic simulator (farm mechanics, redstone logic)
3. Transfer envelope missing

**Recommended actions**:
- Add "conscious-bot vs Sterling split" (recommendation: Sterling emits design operators, conscious-bot provides deterministic simulator/evaluator)
- Add section "5.5 Deterministic simulator specification" for farm mechanics
- Define transfer surface (e.g., "workflow automation synthesis")

---

### Rig I: Epistemic Planning
**Maps to**: P11 (Epistemic) [primary] + P17, P19 [secondary]

| Aspect | Alignment | Notes |
|--------|-----------|-------|
| **Formal signature** | ✅ Full | Sterling P11: "belief nodes, probe operators, belief update, confidence threshold, cost is probe expense + risk" matches Rig I plan |
| **Certification gates** | ⚠️ Partial | Rig I section 8 lists gates (discriminative probes, entropy reduction, calibration, determinism) with slightly more detail than other rigs, but still lacks concrete test specifications |
| **Transfer envelope** | ⚠️ Missing | Rig I references "transfer tests" but no surface defined. Sterling P11 suggests "debugging/diagnosis; root cause analysis; fraud investigation" |
| **Footguns alignment** | ✅ Full | Rig I plan section 7 and Sterling P11 footguns align on: beliefs hidden in heuristics, non-replayable updates, lucky finds |
| **I/O contract** | ✅ Full | Rig I plan section 4 specifies BeliefState, ProbeOperator, BeliefUpdate, EntropyTracker types aligned to Sterling P11 I/O contract (observations/evidence input) |

**Primary primitives proven**: P11 (epistemic planning, belief-state, active sensing)

**Secondary primitives proven**:
- P17 (Execution-grounded credit): Rig I plan section 7 "Belief updates deterministically given observed evidence payload from the bot"
- P19 (Audit explanations): Rig I plan section 5 "Probe choice is discriminative, not random exploration"

**Critical gaps**:
1. No concrete test specifications for "entropy reduction per step" gate
2. Belief quantization strategy not detailed (bucket size, overflow handling)
3. Transfer surface not defined

**Recommended actions**:
- Add section "5 Certification test specifications" with concrete entropy reduction measurement
- Add section "4.5 Belief quantization strategy" with bucket rules
- Define transfer surface (e.g., "diagnosis with test selection" or "fraud investigation with probe planning")

---

### Rig I-ext: Entity Belief Tracking and Saliency
**Maps to**: P21 (Entity belief) [primary] + P11, P12, P10, P16, P17, P19 [secondary]

| Aspect | Alignment | Notes |
|--------|-----------|-------|
| **Formal signature** | ✅ Full | Sterling P21: "TrackSet, EvidenceBatch, AttentionBudget, TRACK_UPDATE, DECAY, SALIENCY_DIFF, ACTIVE_SENSE_REQUEST" matches Rig I-ext plan section 1-3 with exact detail |
| **Certification gates** | ✅ Full | Rig I-ext plan section 3.5 specifies concrete gates aligned to Sterling P21 section 5: determinism (tick + EvidenceBatch → hash), boundedness (TRACK_CAP), separation (no raw detections → cognition), uncertainty honesty, anti-ID reliance, event sparsity |
| **Transfer envelope** | ✅ Full | Rig I-ext plan section 10 "Transfer tests" and Sterling P21 section 7 align on: robotics/drones, security monitoring, infrastructure diagnosis |
| **Footguns alignment** | ✅ Full | Rig I-ext plan section 2b "8 pivots" and Sterling P21 section 8 "Known footguns" align on: trusting IDs, mixing provenance into state hash, grid explosion, event jitter, safety via cognition |
| **I/O contract** | ✅ Full | Rig I-ext plan section 3.1 specifies TrackSet canonical form, EvidenceBatch shape, SALIENCY_DIFF output aligned to Sterling P21 section 2 formal signature and section 9 I/O contract |

**Primary primitives proven**: P21 (entity belief maintenance and saliency under partial observability)

**Secondary primitives proven**:
- P11 (Epistemic planning): Rig I-ext plan section 3.3 "Belief update semantics used by entity tracking; active sensing operators shared with Rig I"
- P12 (Invariant maintenance): Rig I-ext plan section 3.3 "Hazard summary from entity tracking feeds into invariant metrics"
- P10 (Risk-aware planning): Rig I-ext plan section 3 "Threat scores produce compressed hazard summary"
- P16 (State canonicalization): Rig I-ext plan section 3.1 "Canonical planning state: bucketed pose, quantized class distribution, deterministic ordering"
- P17 (Execution-grounded credit): Rig I-ext plan section 3.5 "Execution-grounded: log preventability signals; penalize only when preventable"
- P19 (Audit explanations): Rig I-ext plan section 3.1 "Provenance is audit data, not state equivalence; evidence ring buffers in trace bundle"

**Critical gaps**:
- **None identified.** Rig I-ext is the most thoroughly specified rig with the highest alignment to its Sterling primitive.

**Recommended actions**:
- Use Rig I-ext as the template for upgrading other rig plans (especially pivots, acceptance checks, conscious-bot vs Sterling split)
- No gaps requiring action before implementation

**Note**: Rig I-ext is marked "Planned" but has implementation-ready detail level comparable to a specification document, not just a plan. This is the gold standard for the other rigs.

---

### Rig J: Invariant Maintenance
**Maps to**: P12 (Invariant maintenance) [primary] + P17, P18, P19 [secondary]

| Aspect | Alignment | Notes |
|--------|-----------|-------|
| **Formal signature** | ✅ Full | Sterling P12: "state includes invariant metrics + drift, restore actions, solved repeatedly as MPC/receding horizon" matches Rig J plan |
| **Certification gates** | ⚠️ Partial | Rig J section 8 lists gates (proactive scheduling, disruption minimization, explanation, determinism, bounded) but lacks concrete test specifications |
| **Transfer envelope** | ⚠️ Missing | Rig J references "transfer tests" but no surface defined. Sterling P12 doesn't specify transfer envelope (gap in primitive spec) |
| **Footguns alignment** | ✅ Full | Rig J plan section 7 and Sterling P12 standard footguns align on: reactive triggers, no horizon, no explanation |
| **I/O contract** | ⚠️ Partial | Rig J plan section 4.1 specifies InvariantVector, DriftModel, MaintenanceOperator types but doesn't align to Sterling I/O contract format |

**Primary primitives proven**: P12 (invariant maintenance, receding horizon control)

**Secondary primitives proven**:
- P17 (Execution-grounded credit): Rig J plan section 7 "Execution outcomes update priors"
- P18 (Multi-objective): Rig J plan section 1 "Balance maintenance costs against goal disruption"
- P19 (Audit explanations): Rig J plan section 8 "Every maintenance action includes rationale"

**Critical gaps**:
1. No "conscious-bot vs Sterling split" section (critical: where does horizon projection live?)
2. No test specifications for "proactive scheduling before violations" gate
3. Transfer envelope missing

**Recommended actions**:
- Add "conscious-bot vs Sterling split" (recommendation: horizon projection in conscious-bot, maintenance subproblems in Sterling if complex)
- Add certification tests: "maintenance fires T ticks before violation; emergency frequency < baseline"
- Define transfer surface (e.g., "SRE-style SLO maintenance" or "infrastructure hygiene tasks")

---

### Rig K: Irreversibility and Commitment Planning
**Maps to**: P13 (Irreversibility) [primary] + P19, P20 [secondary]

| Aspect | Alignment | Notes |
|--------|-----------|-------|
| **Formal signature** | ✅ Full | Sterling P13: "some actions irreversible, large rollback cost, objective includes option value, constraints encode one-way doors" matches Rig K plan |
| **Certification gates** | ⚠️ Partial | Rig K section 9 lists gates but no test specifications |
| **Transfer envelope** | ⚠️ Missing | No surface defined. Sterling P13 doesn't specify transfer envelope (gap) |
| **Footguns alignment** | ✅ Full | Rig K plan section 8 aligns with P13 standard footguns plus commitment-specific risks |
| **I/O contract** | ⚠️ Partial | Rig K doesn't specify commitment state canonical format |

**Primary primitives proven**: P13 (irreversibility, commitment planning)

**Secondary primitives proven**:
- P19 (Audit explanations): Rig K plan section 5.3 "Verification precedes commitment; threshold rationale"
- P20 (Rule injection hardening): Rig K plan section 1 "Constraints encode one-way doors"

**Critical gaps**:
1. No option value calculation specification (even simplified)
2. No test specifications for "verification precedes commitment" gate
3. Transfer envelope missing

**Recommended actions**:
- Add section "5.6 Option value calculation" with simplified expected-value formula
- Add certification tests: "no premature irreversible steps; verify-then-commit patterns appear"
- Define transfer surface (e.g., "migration cutover with verification gates")

---

## Gap Analysis Matrix

### 1. Primitives with Sterling specs but no conscious-bot rig mapping

| Primitive | Status | Why no rig? | Recommendation |
|-----------|--------|-------------|----------------|
| **P9** (Contingency planning) | Deferred (Rig L planned) | Requires temporal + invariant discipline from C, J | Defer until Track 1-2 complete |
| **P10** (Risk-aware planning) | Deferred (Rig M planned) | Requires stochastic modeling, stricter discipline | Defer until Track 1-2 complete |
| **P14** (Program-level planning) | Partially proven in Rig H | H focuses on systems synthesis; P14 is broader | Add Rig H secondary primitive P14 to index |
| **P15** (Fault diagnosis) | Deferred (Rig N planned) | Requires epistemic + audit foundation | Defer until Track 1-2 complete |
| **P16** (State canonicalization) | Cross-cutting (proven in Rigs A-K) | Not a standalone rig; substrate requirement | Add P16 to secondary primitives for all rigs |
| **P17** (Execution-grounded credit) | Cross-cutting (proven in Rigs A, D, E, F, G, I, I-ext, J) | Not a standalone rig; substrate requirement | Add P17 to secondary primitives |
| **P18** (Multi-objective) | Cross-cutting (proven in Rigs C, D, F, J) | Not a standalone rig; substrate requirement | Add P18 to secondary primitives |
| **P19** (Audit explanations) | Cross-cutting (proven in Rigs A, B, C, D, F, G, H, I, I-ext, J, K) | Not a standalone rig; substrate requirement | Add P19 to secondary primitives |
| **P20** (Adversarial robustness) | Cross-cutting (proven in Rigs A, B, D, K) | Not a standalone rig; substrate requirement | Add P20 to secondary primitives |

**Note**: Primitives P16-P20 are **cross-cutting concerns** that are substrate requirements for all rigs, not standalone capabilities. They should be explicitly listed as "secondary primitives proven" in every relevant rig plan.

---

### 2. Rigs with conscious-bot plans but missing Sterling primitive alignment

**None identified.** All 11 rigs (A-K + I-ext) map to Sterling primitives P1-P13 and P21 as documented in RIG_DOCUMENTATION_INDEX.md and sterling-minecraft-domains.md.

---

### 3. Mismatches in what needs to be proven

| Rig | Primitive | Mismatch | Resolution |
|-----|-----------|----------|------------|
| **Rig A** | P1 | Sterling P1 requires "identical trace hash"; Rig A plan says "determinism" but lacks hash verification test | Add concrete test: "replay same request → assert trace_bundle_hash_v1 === trace_bundle_hash_v2" |
| **Rig B** | P2 | Sterling P2 requires "illegal operators never proposed"; Rig B plan says "fail-closed" but lacks adversarial test suite | Add adversarial tests: "inject operator claiming diamond mining with wooden tier → assert rejection with specific error" |
| **All rigs except I-ext** | P16-P20 | Sterling primitives P16-P20 are cross-cutting; rig plans don't explicitly list them as "secondary primitives proven" | Update all rig plans to list P16-P20 where applicable |
| **All rigs except I-ext** | Transfer envelope | Sterling primitives specify transfer envelopes; rig plans reference "transfer tests" but lack concrete non-Minecraft surfaces | Add "Transfer surface definition" section to each rig plan |

---

## Coverage Analysis

### Primitives Coverage by Rig

| Primitive | Proving Rig(s) | Status | Notes |
|-----------|---------------|--------|-------|
| **P1** | Rig A | Detailed | Primary rig; needs certification harness detail |
| **P2** | Rig B | Detailed | Primary rig; needs adversarial tests |
| **P3** | Rig C | Detailed | Primary rig; needs time quantization spec |
| **P4** | Rig D | Detailed | Primary rig; needs conscious-bot/Sterling split |
| **P5** | Rig E | Detailed | Primary rig; needs macro/micro contract |
| **P6** | Rig F | Detailed | Primary rig; needs value function spec |
| **P7** | Rig G | Detailed | Primary rig; needs partial-order format |
| **P8** | Rig H | Detailed | Primary rig; needs simulator spec |
| **P9** | Rig L | Later (deferred) | Requires C, J foundation |
| **P10** | Rig M, Rig I-ext (secondary) | Later (deferred); I-ext uses for threat | Rig M is later; I-ext proves risk propagation aspect |
| **P11** | Rig I, Rig I-ext (secondary) | Detailed | Primary rig I; I-ext builds on epistemic semantics |
| **P12** | Rig J, Rig I-ext (secondary) | Detailed | Primary rig J; I-ext couples hazard to invariants |
| **P13** | Rig K | Detailed | Primary rig; needs option value spec |
| **P14** | Rig H (secondary) | Detailed | Not standalone; synthesis uses program-level design |
| **P15** | Rig N | Later (deferred) | Requires A, I foundation |
| **P16** | Rigs A, B, C, E, F, G, H (all except D, I, J, K) | Cross-cutting | Substrate requirement; should be explicit in all |
| **P17** | Rigs A, D, E, F, G, I, I-ext, J | Cross-cutting | Substrate requirement; should be explicit in all |
| **P18** | Rigs C, D, F, J | Cross-cutting | Substrate requirement; should be explicit where multi-obj |
| **P19** | Rigs A, B, C, D, F, G, H, I, I-ext, J, K | Cross-cutting | Substrate requirement; should be explicit in all |
| **P20** | Rigs A, B, D, K | Cross-cutting | Substrate requirement; should be explicit where validation |
| **P21** | Rig I-ext | Detailed | Most thoroughly specified rig; implementation-ready |

### Rig Coverage by Track

**Track 1: Certification (tightening what we have)**
- Rig A (P1 + P16, P17, P19, P20): Detailed, needs certification harness
- Rig B (P2 + P16, P19, P20): Detailed, needs adversarial tests
- Rig C (P3 + P16, P17, P18, P19): Detailed, needs time quantization

**Track 2: Belief + perception (immediate need)**
- Rig I (P11 + P17, P19): Detailed, needs certification tests
- Rig I-ext (P21 + P11, P12, P10, P16, P17, P19): Detailed, implementation-ready
- Rig J (P12 + P17, P18, P19): Detailed, needs conscious-bot/Sterling split

**Track 3: Representational widening**
- Rig D (P4 + P17, P18, P19, P20): Detailed, needs conscious-bot/Sterling split
- Rig E (P5 + P16, P17, P19): Detailed, needs macro/micro contract
- Rig F (P6 + P16, P17, P18, P19): Detailed, needs value function spec
- Rig G (P7 + P16, P17, P19): Detailed, needs partial-order format
- Rig H (P8 + P14, P16, P19): Detailed, needs simulator spec
- Rig K (P13 + P19, P20): Detailed, needs option value spec

**Track 4: Deferred (requires stricter modeling)**
- Rig L (P9): Standard template only
- Rig M (P10): Standard template only
- Rig N (P15): Standard template only

---

## Critical Path Items Requiring Alignment BEFORE Implementation

### Priority 1: Blocking items (cannot proceed without these)

1. **Add "conscious-bot vs Sterling split" sections to Rigs B, D, E, F, G, H, J**
   - **Why critical**: Without this, implementation teams won't know where to put code
   - **Affects**: Rigs B (capability enforcement), D (strategy priors), E (macro/micro), F (value function), G (partial-order), H (design evaluation), J (horizon projection)
   - **Action**: Use Rig I-ext section 4b as template; add to each rig plan before Track 3 begins
   - **Owner**: Planning/architecture team
   - **Deadline**: Before Track 3 implementation begins

2. **Define transfer surfaces for all detailed rigs (A-K except I-ext)**
   - **Why critical**: Transfer tests are a certification gate; without concrete surfaces, rigs cannot be certified
   - **Affects**: All rigs A-K (I-ext already has transfer surfaces specified)
   - **Action**: Add section "7 Transfer surface definition" to each rig plan with concrete non-Minecraft domain
   - **Owner**: Planning team + Sterling team (collaborate on transfer envelope alignment)
   - **Deadline**: Before certification tests are written for each track

3. **Add cross-cutting primitives (P16-P20) to rig plans as "secondary primitives proven"**
   - **Why critical**: Certification harness must prove these gates; without explicit listing, they'll be missed
   - **Affects**: All rigs (each rig proves a subset of P16-P20)
   - **Action**: Update RIG_DOCUMENTATION_INDEX.md and each rig plan section 1 "Target invariant" to list secondary primitives
   - **Owner**: Planning team
   - **Deadline**: Before certification tests are written

### Priority 2: High-value items (should complete before implementation to avoid rework)

4. **Add concrete certification test specifications to all rig plans (use Rig I-ext as template)**
   - **Why high-value**: Without concrete tests, "certification" is subjective; precise specs prevent drift
   - **Affects**: Rigs A-K (all except I-ext)
   - **Action**: Add section "6 Certification test specifications" with concrete assertions aligned to Sterling primitive gates
   - **Template**: Rig I-ext section 3.5 "Testing and certification"
   - **Owner**: Planning team
   - **Deadline**: Before Track 1 implementation begins (use iterative upgrade: Track 1 rigs first, then Track 2, then Track 3)

5. **Define canonical state formats aligned to Sterling I/O contract (sections 4 + 9 in primitive specs)**
   - **Why high-value**: State format changes are expensive; align before implementation to avoid migration
   - **Affects**: Rigs C (time/capacity), D (availability), E (macro state), F (capacity/value), G (partial-order), H (design state), J (invariant vector), K (commitment state)
   - **Action**: Add section "5.X Canonical state format" with JSON schema or TypeScript interface aligned to Sterling primitive section 9 I/O contract
   - **Owner**: Planning team + Sterling team
   - **Deadline**: Before Track 2 implementation begins

6. **Version-align contracts between conscious-bot and Sterling primitive I/O**
   - **Why high-value**: Version mismatch causes subtle bugs; explicit alignment prevents contract drift
   - **Affects**: All rigs (especially those with Sterling solve calls: A, C, E, H)
   - **Action**: Create contract version alignment document mapping conscious-bot request/response types to Sterling primitive I/O contract sections
   - **Owner**: Contracts team + Sterling team
   - **Deadline**: Before Track 1 implementation begins

### Priority 3: Polish items (improve quality but not blocking)

7. **Add DO/DO NOT rules to all rig approaches (Tracks 2-3)**
   - **Why polish**: Prevents implementation footguns; Rig I-ext has this, others are missing
   - **Affects**: Rig approaches for D, E, F, G, H, J, K (Tracks 2-3)
   - **Action**: Add section "5 DO and DO NOT" with rules aligned to primitive footguns (use Rig I-ext companion as template)
   - **Owner**: Planning team
   - **Deadline**: During implementation (can be added per-rig as needed)

8. **Add "Current code anchors" to rig approaches (Tracks 2-3)**
   - **Why polish**: RIG_DOCUMENTATION_INDEX.md notes Rigs D-K lack code anchors; adds traceability
   - **Affects**: Rig approaches for D, E, F, G, H, J, K
   - **Action**: Add section "3 Current code anchors" with file paths, line refs, code snippets (use Rig I-ext companion as template)
   - **Owner**: Implementation team (during work)
   - **Deadline**: During implementation

---

## Recommendations by Role

### For Planning Team

**Immediate actions**:
1. Use Rig I-ext as the gold standard template for all rig upgrades
2. Add "conscious-bot vs Sterling split" sections to Rigs B, D, E, F, G, H, J using Rig I-ext section 4b as template
3. Update RIG_DOCUMENTATION_INDEX.md to list P16-P20 as secondary primitives for relevant rigs
4. Define transfer surfaces for Rigs A-K (collaborate with Sterling team on alignment to primitive section 7 transfer envelopes)

**Before Track 1 implementation**:
5. Add certification test specifications to Rigs A, B, C using Rig I-ext section 3.5 as template
6. Create contract version alignment document for conscious-bot ↔ Sterling primitive I/O

**Before Track 2 implementation**:
7. Add certification test specifications to Rigs I, I-ext (already done), J
8. Define canonical state formats for Rigs C, J aligned to Sterling I/O contracts

**Before Track 3 implementation**:
9. Add certification test specifications to Rigs D, E, F, G, H, K
10. Define canonical state formats for Rigs D, E, F, G, H, K aligned to Sterling I/O contracts

### For Sterling Team

**Immediate actions**:
1. Review conscious-bot transfer surface proposals and align to primitive section 7 transfer envelopes
2. Add missing transfer envelopes to primitives P3, P4, P5, P6, P7, P8, P12, P13 (currently gaps)
3. Confirm contract version alignment for primitives P1-P13, P21 (section 9 I/O contract)

**Before Track 1 implementation**:
4. Provide feedback on Rig A, B, C canonical state formats and certification test specifications

**Before Track 2 implementation**:
5. Provide feedback on Rig I, I-ext (already well-aligned), J canonical state formats

**Before Track 3 implementation**:
6. Provide feedback on Rigs D, E, F, G, H, K canonical state formats

### For Implementation Team

**Before starting each rig**:
1. Read both the rig plan and the Sterling primitive spec to confirm alignment
2. Verify "conscious-bot vs Sterling split" section exists and is clear
3. Check that canonical state format is defined and aligned to Sterling I/O contract
4. Review certification test specifications to understand "done" criteria

**During implementation**:
5. Add "Current code anchors" to rig approach documents as you identify integration points
6. Flag any misalignment between rig plan and Sterling primitive spec immediately

**After implementation**:
7. Run certification tests aligned to Sterling primitive gates
8. Run transfer tests on defined non-Minecraft surface
9. Document any deviations from plan and update rig approach document

---

## Appendix: Rig-Primitive Mapping Table

| Rig | Primary Primitive(s) | Secondary Primitives | Sterling Spec | conscious-bot Plan | conscious-bot Approach | Alignment Status |
|-----|---------------------|---------------------|---------------|-------------------|----------------------|-----------------|
| **A** | P1 (Deterministic transformation) | P16, P17, P19, P20 | P01_deterministic_transformation_planning_resource_product.md | RIG_A_CERTIFICATION_PLAN.md | RIG_A_CERTIFICATION_APPROACH.md | ⚠️ Partial (needs tests, transfer) |
| **B** | P2 (Capability gating) | P16, P19, P20 | P02_capability_gating_and_legality_what_actions_are_permitted.md | RIG_B_CAPABILITY_GATING_PLAN.md | RIG_B_CAPABILITY_GATING_APPROACH.md | ⚠️ Partial (needs split, tests, transfer) |
| **C** | P3 (Temporal planning) | P16, P17, P18, P19 | P03_temporal_planning_with_durations_batching_and_capacity.md | RIG_C_TEMPORAL_PLANNING_PLAN.md | RIG_C_TEMPORAL_PLANNING_APPROACH.md | ⚠️ Partial (needs quantization, tests, transfer) |
| **D** | P4 (Multi-strategy) | P17, P18, P19, P20 | P04_multi_strategy_acquisition_alternative_methods_different_fai.md | RIG_D_MULTI_STRATEGY_PLAN.md | RIG_D_MULTI_STRATEGY_APPROACH.md | ⚠️ Partial (needs split, tests, transfer) |
| **E** | P5 (Hierarchical) | P16, P17, P19 | P05_hierarchical_planning_macro_policy_over_micro_solvers.md | RIG_E_HIERARCHICAL_PLANNING_PLAN.md | RIG_E_HIERARCHICAL_PLANNING_APPROACH.md | ⚠️ Partial (needs split, contract, transfer) |
| **F** | P6 (Valuation) | P16, P17, P18, P19 | P06_goal_conditioned_valuation_under_scarcity_keep_drop_allocate.md | RIG_F_VALUATION_SCARCITY_PLAN.md | RIG_F_VALUATION_SCARCITY_APPROACH.md | ⚠️ Partial (needs value spec, tests, transfer) |
| **G** | P7 (Partial-order) | P16, P17, P19 | P07_feasibility_under_constraints_and_partial_order_structure.md | RIG_G_PARTIAL_ORDER_PLAN.md | RIG_G_PARTIAL_ORDER_APPROACH.md | ⚠️ Partial (needs split, format, transfer) |
| **H** | P8 (Systems synthesis) | P14, P16, P19 | P08_systems_synthesis_compose_components_to_satisfy_a_behavioral.md | RIG_H_SYSTEMS_SYNTHESIS_PLAN.md | RIG_H_SYSTEMS_SYNTHESIS_APPROACH.md | ⚠️ Partial (needs split, simulator, transfer) |
| **I** | P11 (Epistemic) | P17, P19 | P11_epistemic_planning_belief_state_and_active_sensing.md | RIG_I_EPISTEMIC_PLANNING_PLAN.md | RIG_I_EPISTEMIC_PLANNING_APPROACH.md | ⚠️ Partial (needs tests, quantization, transfer) |
| **I-ext** | P21 (Entity belief) | P11, P12, P10, P16, P17, P19 | P21_entity_belief_maintenance_and_saliency.md | P21_RIG_I_EXT_IMPLEMENTATION_PLAN.md | P21_RIG_I_EXT_COMPANION_APPROACH.md | ✅ Full (implementation-ready) |
| **J** | P12 (Invariant maintenance) | P17, P18, P19 | P12_invariant_maintenance_non_terminal_goals_control_by_receding.md | RIG_J_INVARIANT_MAINTENANCE_PLAN.md | RIG_J_INVARIANT_MAINTENANCE_APPROACH.md | ⚠️ Partial (needs split, tests, transfer) |
| **K** | P13 (Irreversibility) | P19, P20 | P13_irreversibility_and_commitment_planning.md | RIG_K_IRREVERSIBILITY_PLAN.md | RIG_K_IRREVERSIBILITY_APPROACH.md | ⚠️ Partial (needs option spec, tests, transfer) |
| **L** | P9 (Contingency) | P18, P19 | P09_contingency_planning_with_exogenous_events.md | (standard template in sterling-minecraft-domains.md) | — | Later (deferred) |
| **M** | P10 (Risk-aware) | P17, P18, P19 | P10_risk_aware_planning_tail_risk_not_just_expected_cost.md | (standard template in sterling-minecraft-domains.md) | — | Later (deferred) |
| **N** | P15 (Fault diagnosis) | P11, P19 | P15_fault_diagnosis_and_repair_hypotheses_tests_fix.md | (standard template in sterling-minecraft-domains.md) | — | Later (deferred) |

**Legend**:
- ✅ Full: Implementation-ready; all aspects aligned
- ⚠️ Partial: Plan exists with good alignment but missing key details (see gaps)
- Later: Deferred until foundation work complete

---

## Document Metadata

**Version**: 1.0
**Author**: Claude (Sonnet 4.5)
**Date**: 2026-01-31
**Files analyzed**:
- conscious-bot: 11 rig plans, 2 rig approaches, RIG_DOCUMENTATION_INDEX.md, sterling-minecraft-domains.md
- Sterling: 21 capability primitive specs (P01-P21)

**Next actions**:
1. Review with planning team
2. Address Priority 1 blocking items before Track 1 implementation
3. Use as checklist during rig upgrades and implementation
