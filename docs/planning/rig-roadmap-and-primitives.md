# Next Rigs and Capability Primitives (Dependency Order)

**Source**: [capability-primitives.md](./capability-primitives.md), [sterling-capability-tracker.md](./sterling-capability-tracker.md), [p21-closeout-packet.md](./p21-closeout-packet.md)  
**Last updated**: 2026-02-01  
**Implementation verification**: 2026-02-01 (codebase grep + file listing)

---

## Implementation status verification

Checked the repo to confirm none of the "next" items below are already done.

| Area | Check | Result |
|------|--------|--------|
| **Rig C** | `FurnaceSchedulingSolver`, `minecraft-furnace`, furnace solver files | **Not present** — no furnace solver in `packages/planning/src/sterling/`. Sterling (Python) has `furnace_placed` / `needs_furnace` in **scripts/eval/minecraft_domain.py** (crafting world model: station precondition for smelting), not in `core/` contracts. That is domain-owned eval code; philosophy and boundary contract allow domain ontology there. Rig C is furnace *scheduling* (durations, batching, parallel slots), a different capability. C.1–C.7 all open. |
| **Rig G** | `supportRequirements`, `reachabilityZone`, `scaffold` module type, `transfer-build-scheduling.test.ts` | **Not present** — Building has `requiresModules` (module dependency order) in `minecraft-building-types.ts` and `minecraft-building-rules.ts`; no `supportRequirements` field, no `reachabilityZone`, no `scaffold` module type, no transfer test for build scheduling. G.1–G.5 all open per tracker. |
| **P21** | Runtime use of `implementsPrimitives` with `p21.a` / `p21.b` | **Not wired** — `SterlingDomainDeclaration` exists in `packages/planning/src/modules/solve-contract.ts` with `implementsPrimitives: string[]`. No domain (e.g. minecraft-interface) instantiates a declaration with `p21.a` or `p21.b`. Proof manifests and conformance tests use the claim IDs; runtime capability registration is still open. |
| **Transfer tests** | Existing transfer test files | **Only BOM + approval ladder** — `transfer-bom-assembly.test.ts`, `transfer-approval-ladder.test.ts` exist. No `transfer-build-scheduling.test.ts` (G.5), no `transfer-job-shop.test.ts` (C.7). |

**Conclusion**: Priority order in this doc is correct; nothing listed as "next" is already implemented.

---

## Current state

- **Track 1**: Rig A (Inventory transformation), Rig B (Capability gating) — **DONE**
- **Track 1, not started**: Rig C (Temporal planning)
- **Track 2, partial**: Rig G (Feasibility + partial order) — P0 building solver stub only
- **Track 2, not started**: Rigs D, E, F, H, I, J, K
- **Later**: Rigs L, M, N
- **P21**: p21.a certified on 2 surfaces, p21.b on 1 surface; portable-claim items and extensions still open

---

## Dependency order: what to focus on next

### 1. Rig C — Temporal planning (explicit next milestone)

**Tracker**: M4 — "Start Rig C with the spine in place (temporal planning stress test)."

**Why first**: C is the only remaining **Track 1** rig. The tracker states that Track 2 order is "after A–C certified," so C blocks D–K.

**Capability primitives**: **3** (Temporal planning with durations, batching, and capacity), plus already-satisfied 16, 17, 18, 19.

**Concrete next steps** (from tracker Rig C section):

| Item | Description |
|------|-------------|
| C.1 | FurnaceSchedulingSolver class extending BaseDomainSolver; solverId = 'minecraft.furnace'; SolveBundle wired |
| C.2 | Time-discretized state (furnace slots, fuel remaining, ticks to completion); canonical hash with time buckets |
| C.3 | Operator families: load_furnace, add_fuel, wait_tick, retrieve_output; capacity preconditions; FURNACE_OVERCAPACITY linter check |
| C.4 | Batching proof: prefer load-many then wait once vs load-wait-per-item |
| C.5 | Parallel slot proof: 2 furnaces, 4 items — plan uses both, makespan &lt; sequential |
| C.6 | Golden-master snapshot for furnace payload |
| C.7 | Transfer test: job-shop surface with same slot semantics |

**Rationale in tracker**: "durations/batching/capacity will make heuristic weakness painfully visible; that's desirable because it forces M2 to pay rent."

---

### 2. Rig G — Feasibility + partial order (already started)

**Status**: PARTIAL — P0 building solver exists; certification gaps remain.

**Existing vs tracker**: Building already has `requiresModules` (module dependency order) in `minecraft-building-types.ts` and `minecraft-building-rules.ts`; Sterling respects that partial order. Tracker G.1 asks for a field named `supportRequirements` and an explicit test (wall without foundation rejected). So G.1 is align naming/field + add test; G.2–G.5 are net-new (reachability, partial-order proof test, scaffold type, transfer test).

**Why second**: No other rig depends on G. Finishing G closes primitive **7** (Feasibility under constraints and partial-order structure) and gives a certified "must precede" / partial-order rig before heavier Track 2 work.

**Capability primitives**: **7** (Feasibility under constraints and partial-order structure), plus 16, 17, 19 (already satisfied globally).

**Concrete next steps** (from tracker Rig G section):

| Item | Description |
|------|-------------|
| G.1 | Support constraints: modules declare supportRequirements; solver respects partial order; test: wall without foundation rejected |
| G.2 | Reachability: reachabilityZone; test: roof unreachable without scaffolding → plan includes scaffolding |
| G.3 | Partial-order proof: two independent modules, either order valid; golden-master for both linearizations |
| G.4 | Scaffolding reasoning: scaffold module type; place/remove scaffold operators; multi-story requires scaffolding |
| G.5 | Transfer test: construction scheduling or CI pipeline with same "must precede" semantics |

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

## Track 2 order (after A–C certified)

Once Rig C is certified, the tracker specifies this order:

1. **Rig D** — Multi-strategy acquisition (primitives 4, 17, 18, 19, 20) — learning-benchmark candidate  
2. **Rig E** — Hierarchical planning (5, 16, 17, 19)  
3. **Rig F** — Valuation under scarcity (6, 16, 17, 18, 19)  
4. **Rig G** — Feasibility hardening (7, 16, 17, 19) — complete if not done earlier  
5. **Rig H** — Systems synthesis (8, 14, 16, 19)  
6. **Rig I** — Epistemic planning (11, 13, 17, 19)  
7. **Rig J** — Invariant maintenance (12, 17, 18, 19)  
8. **Rig K** — Irreversibility (13, 19, 20)  

**Later**: L (Contingency), M (Risk-aware), N (Fault diagnosis).

---

## Summary: recommended focus order

| Priority | Focus | Primitives | Reason |
|----------|--------|------------|--------|
| 1 | **Rig C** (Temporal planning) | **3**, 16, 17, 18, 19 | Only remaining Track 1; unblocks Track 2; M4 explicit next |
| 2 | **Rig G** (Feasibility + partial order) | **7**, 16, 17, 19 | Already PARTIAL; finish certification |
| 3 | **P21** portable claim + extensions | **21** | Wire implementsPrimitives; certify id_robustness and extensions |
| 4 | **M2** (Heuristic degeneracy) | — | Cross-cutting; makes C and all solvers more effective |
| 5 | **M1**, **M3** | — | Learning benchmark and truthfulness gate |
| 6 | **Rig D** then E, F, … | 4, 5, 6, … | After A–C certified, per Track 2 order |

**capability-primitives.md** needs no structural change; it already defines all 21 primitives. **sterling-capability-tracker.md** is the source of truth for status and next steps; update it as C.1–C.7, G.1–G.5, and P21 items are completed.

---

## Compliance with philosophy and boundary contract

This doc does **not** override [sterling-boundary-contract.md](./sterling-boundary-contract.md) or Sterling's capability philosophy (Sterling repo: `docs/planning/capability_primitives_bundle/philosophy.md`). When implementing the "next" items above, the following rules apply.

### Pipeline order (don't skip to Step 4)

Both documents require: **Step 0** (primitive boundary) → **Step 1** (define capsule) → Step 2 (claims) → Step 3 (fixtures) → **Step 4** (adapter/solver) → Step 5 (registry) → Step 6 (runtime). "Don't skip to Step 4."

- **Rig C**: Before implementing C.1 (FurnaceSchedulingSolver), define the **P3 capsule** (domain-agnostic contract types, invariants, conformance suite) per Step 1. Align with Sterling's primitive spec: `sterling/docs/planning/capability_primitives_bundle/primitives/P03_*.md`. The furnace solver is the adapter; the capsule is the contract.
- **Rig G**: Before or alongside G.1–G.5, define the **P7 capsule** (feasibility/partial-order contract, not building-specific) per Step 1. Align with Sterling's `primitives/P07_*.md`. Building types (`supportRequirements`, etc.) live in the domain/solver layer; the capsule lives in `packages/planning/src/sterling/primitives/` and stays domain-agnostic.

### Two fixture sets for portability

Philosophy and boundary contract: **two fixture sets** from structurally different domains must pass the same conformance suite for a primitive to be considered domain-agnostic. For Rig C and Rig G, plan for a second proving surface (e.g. job-shop for C, construction/CI for G) in addition to the Minecraft surface; transfer tests alone do not substitute for a second domain's conformance run unless that run uses the same suite.

### Domain ontology stays out of capsules

Terms used in this doc (furnace, building, wall, job-shop, BeliefBus) are **rig/domain scope** only. Capsule types and primitive contracts must not mention domain object models (Rule 1 in both philosophy and boundary contract). Contract types live in `packages/planning/src/sterling/primitives/<id>/` with no domain imports or domain constants.
