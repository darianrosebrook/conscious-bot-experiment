# Next Rigs and Capability Primitives (Dependency Order)

**Source**: [capability-primitives.md](./capability-primitives.md), [sterling-capability-tracker.md](./sterling-capability-tracker.md), [p21-closeout-packet.md](./p21-closeout-packet.md)  
**Last updated**: 2026-02-01  
**Implementation verification**: 2026-02-01 (codebase grep + file listing)

---

## Implementation status verification

Checked the repo to confirm actual implementation state of "next" items (2026-02-01).

| Area | Check | Result |
|------|--------|--------|
| **Rig C** | `FurnaceSchedulingSolver`, `minecraft-furnace`, furnace solver files, temporal enrichment | **No dedicated furnace solver** — but **P03 capsule is defined** in `packages/planning/src/sterling/primitives/p03/` (untracked in git): contract types (`P03TemporalStateV1`, `P03TemporalAdapter`), reference adapter, 5 invariants, 2-domain fixtures (furnace + CI), conformance tests passing. **Temporal enrichment layer implemented** in `packages/planning/src/temporal/` (untracked): 3-mode enrichment (`off`/`local_only`/`sterling_temporal`), duration model, deadlock prevention, batch operators, time-state construction. **Crafting solver integrated** (`minecraft-crafting-solver.ts:116-166`): temporal mode gating, deadlock early-return, payload attachment. **49-test e2e suite** committed (`temporal-crafting-e2e.test.ts`, `dfaec57`). C.1–C.7 FurnaceSchedulingSolver items remain open. |
| **Rig E** | `MacroPlanner`, hierarchical routing, navigate/explore/find | **Partially implemented** — `packages/planning/src/hierarchical/` contains MacroPlanner (Dijkstra), macro-state, feedback store, signals, plus tests (including e2e-macro-micro). Routing wired: `navigate`/`explore`/`find` are in `ROUTABLE_ACTIONS` and route to Rig E via `action-plan-backend.ts`. Planner integration gated: returns blocked sentinel when unconfigured. E.1–E.5 certification items open. |
| **Rig G** | `supportRequirements`, `reachabilityZone`, `scaffold` module type, `transfer-build-scheduling.test.ts` | **DAG pipeline exists** — `constraints/` package has DAG builder, linearization, feasibility checker, partial-order plan, signal computation, execution advisor, all with tests. Building solver wires `RigGMetadata` (signals, commuting pairs, partial-order plan) into task metadata. Missing: `supportRequirements` field, `reachabilityZone`, `scaffold` module type, transfer test. G.1–G.5 certification items open. |
| **P21** | Runtime use of `implementsPrimitives` with `p21.a` / `p21.b` | **Not wired** — `SterlingDomainDeclaration` exists in `packages/planning/src/modules/solve-contract.ts` with `implementsPrimitives: string[]`. No domain (e.g. minecraft-interface) instantiates a declaration with `p21.a` or `p21.b`. Proof manifests and conformance tests use the claim IDs; runtime capability registration is still open. |
| **Transfer tests** | Existing transfer test files | **Only BOM + approval ladder** — `transfer-bom-assembly.test.ts`, `transfer-approval-ladder.test.ts` exist. No `transfer-build-scheduling.test.ts` (G.5), no `transfer-job-shop.test.ts` (C.7), no Rig E transfer test. |

**Conclusion**: Rigs C, E, and G all have partial infrastructure beyond their previous "not started" / "stub only" labels. Priority order remains correct; certification items (C.1–C.7, E.1–E.5, G.1–G.5) are still open.

---

## Current state

- **Track 1**: Rig A (Inventory transformation), Rig B (Capability gating) — **DONE**
- **Track 1, partial**: Rig C (Temporal planning) — P03 capsule + temporal enrichment layer + crafting solver integration; FurnaceSchedulingSolver C.1–C.7 remain
- **Track 2, partial**: Rig E (Hierarchical planning) — macro-planner infrastructure, routing wired, blocked-sentinel fallback
- **Track 2, partial**: Rig G (Feasibility + partial order) — building solver with DAG pipeline, linearization, feasibility checker, Rig G signals
- **Track 2, not started**: Rigs D, F, H, I, J, K
- **Later**: Rigs L, M, N
- **P21**: p21.a certified on 2 surfaces, p21.b on 1 surface; portable-claim items and extensions still open

---

## Dependency order: what to focus on next

### 1. Rig C — Temporal planning (explicit next milestone)

**Tracker**: M4 — "Start Rig C with the spine in place (temporal planning stress test)."

**Why first**: C is the only remaining **Track 1** rig. The tracker states that Track 2 order is "after A–C certified," so C blocks D–K.

**Capability primitives**: **3** (Temporal planning with durations, batching, and capacity), plus already-satisfied 16, 17, 18, 19.

**What exists**:

*P03 capsule* (Step 1 — untracked in git, `packages/planning/src/sterling/primitives/p03/`):
- Contract types: `P03TemporalStateV1`, `P03TemporalAdapter`, `P03PlannedStepV1`, 5 invariants (INV-1–INV-5)
- Reference adapter: `P03ReferenceAdapter` (domain-agnostic, satisfies all 5 invariants)
- Fixtures: furnace smelting domain + CI runner domain
- Conformance tests passing on both domains

*Temporal enrichment layer* (untracked in git, `packages/planning/src/temporal/`):
- `temporal-enrichment.ts` — 3-mode orchestrator (`off`/`local_only`/`sterling_temporal`), returns enrichRule/batchHint closures + deadlock state
- `time-state.ts` — tick-to-bucket conversion, slot inference from nearby blocks, P03 state construction
- `duration-model.ts` — per-action-type durations (craft=0, mine=40, smelt=200, place=5), batch scaling
- `deadlock-prevention.ts` — slot needs derivation + deadlock check (fail-closed)
- `batch-operators.ts` — 5 Minecraft batch operators (threshold=8, maxBatchSize=64)
- 18 unit tests passing (duration-model, deadlock, time-state, enrichment-bridge)

*Crafting solver integration* (`minecraft-crafting-solver.ts:116-166`):
- 3-mode temporal gating, deadlock early-return, temporal payload attachment for `sterling_temporal`
- `enrichRule` annotates rules locally (not sent to Sterling wire)

*E2E test suite* (committed as `dfaec57`):
- `temporal-crafting-e2e.test.ts` — 49 tests across 13 suites (A–M)
- Strict mock validates payload, smelt injection at solver boundary, enrichment call counts per mode

> **Note**: The P03 capsule and temporal module directories are untracked in git. The e2e test was committed. The untracked directories should be committed as part of the next Rig C PR.

**Concrete next steps** (from tracker Rig C section — C.1–C.7 remain open):

| Item | Description |
|------|-------------|
| C.1 | FurnaceSchedulingSolver class extending BaseDomainSolver; solverId = 'minecraft.furnace'; SolveBundle wired. **P03 capsule provides the contract; solver is the adapter.** |
| C.2 | Time-discretized state (furnace slots, fuel remaining, ticks to completion); canonical hash with time buckets |
| C.3 | Operator families: load_furnace, add_fuel, wait_tick, retrieve_output; capacity preconditions; FURNACE_OVERCAPACITY linter check |
| C.4 | Batching proof: prefer load-many then wait once vs load-wait-per-item |
| C.5 | Parallel slot proof: 2 furnaces, 4 items — plan uses both, makespan &lt; sequential |
| C.6 | Golden-master snapshot for furnace payload |
| C.7 | Transfer test: job-shop surface with same slot semantics |

**Rationale in tracker**: "durations/batching/capacity will make heuristic weakness painfully visible; that's desirable because it forces M2 to pay rent."

---

### 2. Rig G — Feasibility + partial order (already started)

**Status**: PARTIAL — building solver with DAG pipeline, linearization, feasibility checking, Rig G signal computation; certification gaps remain.

**What exists beyond the building solver**:
- `constraints/dag-builder.ts` — builds DAG from module `requiresModules`
- `constraints/linearization.ts` — topological linearization with tests
- `constraints/feasibility-checker.ts` — constraint satisfaction validation with tests
- `constraints/partial-order-plan.ts` — `findCommutingPairs()` for independent modules with tests
- `constraints/signals.ts` — `computeRigGSignals()` for feasibility gating
- `constraints/execution-advisor.ts` — `RigGMetadata` type wired into task metadata
- Building solver calls full DAG→linearize→feasibility→commutingPairs→signals pipeline

**Existing vs tracker**: Building already has `requiresModules` (module dependency order) in `minecraft-building-types.ts` and `minecraft-building-rules.ts`; the constraints pipeline processes this into a partial-order plan with feasibility signals. Tracker G.1 asks for a field named `supportRequirements` and an explicit test (wall without foundation rejected). So G.1 is align naming/field + add test; G.2–G.5 are net-new (reachability, partial-order proof test, scaffold type, transfer test).

**Why second**: No other rig depends on G. Finishing G closes primitive **7** (Feasibility under constraints and partial-order structure) and gives a certified "must precede" / partial-order rig before heavier Track 2 work.

**Capability primitives**: **7** (Feasibility under constraints and partial-order structure), plus 16, 17, 19 (already satisfied globally).

**Concrete next steps** (from tracker Rig G section — G.1–G.5 remain open):

| Item | Description |
|------|-------------|
| G.1 | Support constraints: modules declare supportRequirements; solver respects partial order; test: wall without foundation rejected |
| G.2 | Reachability: reachabilityZone; test: roof unreachable without scaffolding → plan includes scaffolding |
| G.3 | Partial-order proof: two independent modules, either order valid; golden-master for both linearizations |
| G.4 | Scaffolding reasoning: scaffold module type; place/remove scaffold operators; multi-story requires scaffolding |
| G.5 | Transfer test: construction scheduling or CI pipeline with same "must precede" semantics |

---

### 2b. Rig E — Hierarchical planning (already started)

**Status**: PARTIAL — macro-planner infrastructure exists with routing wired; not domain-integrated.

**What exists**:
- `hierarchical/macro-planner.ts` — MacroPlanner with Dijkstra path planning, context registry, edge cost model (tested)
- `hierarchical/macro-state.ts` — macro path state, edge sessions, outcome tracking (tested)
- `hierarchical/feedback.ts` — cost updates from micro execution outcomes (tested)
- `hierarchical/signals.ts` — Rig E observability instrumentation
- `hierarchical/__tests__/e2e-macro-micro.test.ts` — end-to-end macro→micro decomposition test
- Routing: `navigate`/`explore`/`find` in `ROUTABLE_ACTIONS`, routed to Rig E in `action-plan-backend.ts`
- Planner integration: `sterling-planner.ts` calls hierarchical planner when configured; blocked sentinel fallback otherwise

**Why after G**: Rig E infrastructure is further along than most Track 2 rigs (routing wired, planner functional in tests), but it needs real Minecraft world graph integration to be useful. Can be prioritized alongside or after G depending on gameplay needs.

**Capability primitives**: **5** (Hierarchical planning), plus 16, 17, 19 (already satisfied globally).

**Concrete next steps** (E.1–E.5 — all open):

| Item | Description |
|------|-------------|
| E.1 | Domain ontology integration: wire Minecraft world graph (biome regions, structure locations, resource zones) into MacroPlanner context registry |
| E.2 | Micro-step decomposition: macro edges → concrete Mineflayer movement/interaction steps |
| E.3 | Feedback loop: micro execution outcomes update macro edge costs; test blocked-path replanning |
| E.4 | Golden-master snapshot: deterministic macro plan for fixed world graph + goal |
| E.5 | Transfer test: non-Minecraft navigation surface (floor-plan routing, network topology) |

---

### 3. P21 — Portable claim and extensions (in parallel or after C/G)

**Status**: p21.a on 2 surfaces, p21.b on 1 surface; portable claim and extensions not yet certified.

**Capability primitive**: **21** (Entity belief maintenance and saliency under partial observability).

**Remaining for "portable" claim** (from tracker P21 section):

- Wire `SterlingDomainDeclaration.implementsPrimitives` for runtime P21 claim
- Certify `id_robustness` (INV-10) on at least one surface
- Certify extensions (`risk_components_v1`, `predictive_model`) on at least one surface

**From closeout packet**: Extensions are declaration-gated; no surface declares them yet. A decorrelated proving surface (different tracking strategy) is planned for stronger portability.

---

### 4. Cross-cutting milestones (M1–M3)

These support all rigs and can be done in parallel or woven into C/G:

| Milestone | Purpose |
|-----------|---------|
| **M1** | Learning-sensitive benchmark suite (learning efficacy, not just stability); multiple near-equal plan families; improvement in search effort |
| **M2** | Heuristic degeneracy fix: dependency-aware lower bounds; improve hVariance, reduce pctSameH; helps C and all solvers |
| **M3** | Certification truthfulness gate: explanation schema evolution, multi-objective wire payload, negative tests for credit/learning |

---

## Post-certification order (after A–C certified)

> **Naming clarification**: [RIG_DOCUMENTATION_INDEX.md](./RIG_DOCUMENTATION_INDEX.md) uses
> "Track 2" for belief/perception rigs (I, I-ext, J) and "Track 3" for
> representational widening rigs (D, E, F, G, H, K). The list below is the
> **sequential implementation order** spanning both tracks, ordered by
> dependency and implementation priority. See the index for thematic grouping.

Once Rig C is certified, the tracker specifies this order:

1. **Rig D** — Multi-strategy acquisition (primitives 4, 17, 18, 19, 20) — learning-benchmark candidate
2. **Rig E** — Hierarchical planning certification (5, 16, 17, 19) — infrastructure exists, needs domain integration + certification (E.1–E.5)
3. **Rig F** — Valuation under scarcity (6, 16, 17, 18, 19)
4. **Rig G** — Feasibility certification (7, 16, 17, 19) — DAG pipeline exists, needs certification items (G.1–G.5)
5. **Rig H** — Systems synthesis (8, 14, 16, 19)
6. **Rig I** — Epistemic planning (11, 13, 17, 19)
7. **Rig J** — Invariant maintenance (12, 17, 18, 19)
8. **Rig K** — Irreversibility (13, 19, 20)

**Later**: L (Contingency), M (Risk-aware), N (Fault diagnosis).

---

## Summary: recommended focus order

| Priority | Focus | Primitives | Existing Work | Reason |
|----------|--------|------------|---------------|--------|
| 1 | **Rig C** (Temporal planning) | **3**, 16, 17, 18, 19 | P03 capsule + temporal enrichment + crafting solver integration + 49-test e2e suite | Only remaining Track 1; unblocks Track 2; M4 explicit next; FurnaceSchedulingSolver (C.1–C.7) is the remaining work |
| 2 | **Rig G** (Feasibility + partial order) | **7**, 16, 17, 19 | Building solver + DAG pipeline + Rig G signals | Finish certification (G.1–G.5); substantial infrastructure already in place |
| 2b | **Rig E** (Hierarchical planning) | **5**, 16, 17, 19 | MacroPlanner + routing + blocked sentinel | Infrastructure exists; needs domain integration (E.1–E.5); can interleave with G |
| 3 | **P21** portable claim + extensions | **21** | 2-surface P21-A, 1-surface P21-B | Wire implementsPrimitives; certify id_robustness and extensions |
| 4 | **M2** (Heuristic degeneracy) | — | — | Cross-cutting; makes C and all solvers more effective |
| 5 | **M1**, **M3** | — | — | Learning benchmark and truthfulness gate |
| 6 | **Rig D** then F, H, … | 4, 6, 8, … | — | After A–C certified, per Track 2 order |

**capability-primitives.md** needs no structural change; it already defines all 21 primitives. **sterling-capability-tracker.md** is the source of truth for status and next steps; update it as C.1–C.7, E.1–E.5, G.1–G.5, and P21 items are completed.

---

## Compliance with philosophy and boundary contract

This doc does **not** override [sterling-boundary-contract.md](./sterling-boundary-contract.md) or Sterling's capability philosophy (Sterling repo: `docs/planning/capability_primitives_bundle/philosophy.md`). When implementing the "next" items above, the following rules apply.

### Pipeline order (don't skip to Step 4)

Both documents require: **Step 0** (primitive boundary) → **Step 1** (define capsule) → Step 2 (claims) → Step 3 (fixtures) → **Step 4** (adapter/solver) → Step 5 (registry) → Step 6 (runtime). "Don't skip to Step 4."

- **Rig C**: ~~Before implementing C.1 (FurnaceSchedulingSolver), define the P3 capsule~~ **P03 capsule is defined** (`primitives/p03/`). C.1 (FurnaceSchedulingSolver) is the adapter; it should import and implement the P03 contract types. Align with Sterling's primitive spec: `sterling/docs/planning/capability_primitives_bundle/primitives/P03_*.md`.
- **Rig E**: Before or alongside E.1–E.5, define the **P5 capsule** (hierarchical planning contract, not navigation-specific) per Step 1. Align with Sterling's `primitives/P05_*.md`. The macro-planner infrastructure in `hierarchical/` is the adapter; the capsule lives in `packages/planning/src/sterling/primitives/` and stays domain-agnostic.
- **Rig G**: Before or alongside G.1–G.5, define the **P7 capsule** (feasibility/partial-order contract, not building-specific) per Step 1. Align with Sterling's `primitives/P07_*.md`. Building types (`supportRequirements`, etc.) and the `constraints/` pipeline live in the domain/solver layer; the capsule lives in `packages/planning/src/sterling/primitives/` and stays domain-agnostic.

### Two fixture sets for portability

Philosophy and boundary contract: **two fixture sets** from structurally different domains must pass the same conformance suite for a primitive to be considered domain-agnostic. For Rig C and Rig G, plan for a second proving surface (e.g. job-shop for C, construction/CI for G) in addition to the Minecraft surface; transfer tests alone do not substitute for a second domain's conformance run unless that run uses the same suite.

### Domain ontology stays out of capsules

Terms used in this doc (furnace, building, wall, job-shop, BeliefBus) are **rig/domain scope** only. Capsule types and primitive contracts must not mention domain object models (Rule 1 in both philosophy and boundary contract). Contract types live in `packages/planning/src/sterling/primitives/<id>/` with no domain imports or domain constants.
