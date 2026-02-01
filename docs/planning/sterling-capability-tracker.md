# Sterling Capability Rig Tracker

**Last updated**: 2026-02-01
**Repos**: conscious-bot (TS), sterling (Python)
**Reference**: [sterling-minecraft-domains.md](./sterling-minecraft-domains.md), [capability-primitives.md](./capability-primitives.md)

---

## Status legend

| Symbol | Meaning |
|--------|---------|
| DONE | Implemented, tested, verified end-to-end |
| PARTIAL | Baseline exists, certification gaps remain |
| NOT STARTED | No implementation |

---

## Global invariants (apply to every rig)

These are certifiability gates. Every rig must satisfy all of them before it can be marked DONE.

| # | Invariant | Status | Evidence | Gaps |
|---|-----------|--------|----------|------|
| 1 | **Deterministic replay** — same payload + same version = identical trace bundle hash | DONE | `solve-bundle.ts` canonicalization contract; `solve-bundle.test.ts` determinism suite; E2E two-solve identity test | None |
| 2 | **Typed operators, fail-closed legality** — operators have type/preconditions/effects; unproven legality = illegal | DONE | `compat-linter.ts` 10-check validation; `cap:` token gating in tool progression; Sterling backend fail-closed expansion | None |
| 3 | **Canonical state hashing + equivalence reduction** — stable under irrelevant variation; count-capping; symmetry | DONE | `hashInventoryState()` zero-omission + key sorting + count-capping (`INVENTORY_HASH_CAP=64`); `hashDefinition()` order-invariant; 3 unit tests prove cap semantics | Symmetry reduction only in building `siteCaps` (acceptable for current rigs) |
| 4 | **Learning never changes semantics** — ordering/priors only; no invented transitions | DONE | Rules frozen at solve time; path algebra weights update per episode; reachable set unchanged; **negative test**: wire payload byte-equivalent before and after `reportEpisodeResult()` (2 tests in `solver-golden-master.test.ts`) | None |
| 5 | **Credit assignment is execution-grounded** — only executed outcomes update priors | DONE | `BaseDomainSolver.reportEpisode()` requires planId from executed solve; per-tier tracking in tool progression; **negative tests**: `solveCraftingGoal()` on solved and unsolved paths never calls `reportEpisodeResult()` or sends `report_episode` message (2 tests in `solver-golden-master.test.ts`) | None |
| 6 | **Audit-grade explanations** — constraints that bound the choice, search effort, evidence that shaped priors | DONE | `SolveRationale` type in `solve-bundle-types.ts` with `boundingConstraints`, `searchEffort`, `searchTermination`, `shapingEvidence`. Populated by `computeBundleOutput()` when `maxNodes` provided. Wired into all 3 solvers (7 call sites) via `buildDefaultRationaleContext()`. 4 unit tests + 3 solver integration tests. | Full "why not that plan" requires per-alternative rationale (future work). Current MVP surfaces constraints, search effort, termination reason, and degeneracy detection. |
| 7 | **Rule injection hardening** — untrusted input validation, boundedness, schema gating | DONE | `compat-linter.ts` validates action types, item names/counts, place IDs, duplicates, tier-gated invariants, **baseCost caps** (`INVALID_BASE_COST` check: NaN, Infinity, <=0, >1000). 9 unit tests for cost caps. | None |
| 8 | **Multi-objective handling is explicit** — no smuggled objectives in ad hoc heuristics | DONE (declaration) | `ObjectiveWeights` interface (`costWeight`, `timeWeight`, `riskWeight`), `DEFAULT_OBJECTIVE_WEIGHTS` constant (`{1.0, 0.0, 0.0}`), `ObjectiveWeightsSource` type. `computeBundleInput()` captures provided vs default weights. 3 unit tests. | Solvers don't pass weights to Sterling wire payload yet (declaration-only; no wire change). Multi-objective optimization in A* is future work. |

### Acceptance criteria for global invariant completion

- [x] **Count-capping** (invariant 3): `hashInventoryState()` caps item counts above 64 (`INVENTORY_HASH_CAP`). `{oak_log: 100}` === `{oak_log: 200}`, `{oak_log: 63}` !== `{oak_log: 64}`, `{oak_log: 64}` === `{oak_log: 65}`.
- [x] **Learning-semantics negative test** (invariant 4): Two tests prove wire payload is byte-equivalent across repeated solves and after learning events (`reportEpisodeResult` does not contaminate subsequent payloads).
- [x] **Credit negative test** (invariant 5): Two tests prove `solveCraftingGoal()` never internally calls `reportEpisodeResult()` on either solved or unsolved paths. Spy on the method + verify no `report_episode` command in service calls.
- [x] **Explanation infrastructure** (invariant 6): `SolveRationale` type with structured fields: `boundingConstraints` (maxNodes, objectiveWeights), `searchEffort` (nodesExpanded, frontierPeak, branchingEstimate — direct from searchHealth, no derived arithmetic), `searchTermination` (terminationReason, degeneracy), `shapingEvidence` (compat validity/issues).
- [x] **Cost caps** (invariant 7): `INVALID_BASE_COST` check in `compat-linter.ts`. `MAX_BASE_COST = 1000`. Rejects NaN, Infinity, -Infinity, 0, negatives, above-max. 9 tests.
- [x] **Multi-objective declaration** (invariant 8): `ObjectiveWeights` with `costWeight?`, `timeWeight?`, `riskWeight?`. `DEFAULT_OBJECTIVE_WEIGHTS = {1.0, 0.0, 0.0}`. `SolveBundleInput` captures `objectiveWeightsProvided`, `objectiveWeightsEffective`, `objectiveWeightsSource`. 3 tests.

---

## Sterling capability infrastructure (2026-02-01)

Sterling's capability absorption pipeline infrastructure (Layers 1–5) is now implemented. This provides the type system and runtime machinery for Steps 1–6 of the absorption pipeline described in [sterling-boundary-contract.md](./sterling-boundary-contract.md).

| Component | Sterling type | Key feature |
|-----------|-------------|-------------|
| Primitive specs | `PrimitiveSpecV1` + `PrimitiveRegistry` | Data-driven obligation documents; P01–P05 factories; loads from `data/primitive_specs/index.json` |
| Capability descriptors | `CapabilityDescriptorV1` | Per-primitive, content-addressed; `(primitive_id, contract_version)` versioned keys |
| Capability claims | `CapabilityClaimRegistry` | `(domain_id, primitive_id, contract_version)` triple; registry hash from VERIFIED entries only |
| Conformance suite descriptors | `ConformanceSuiteV1` | Content-addressed with `suite_impl_ref` code identity binding |
| Domain declarations | `DomainDeclarationV1` | Long-lived capability commitment; binds primitive claims to a domain |
| Domain sessions | `DomainSessionV1` | Ephemeral session attachment; KG ref, operator pack; NOT content-addressed |
| Runtime routing | `_check_primitive_eligibility()` | Proof-backed by default (structural + VERIFIED claims); `structural_only=True` opt-in |
| Anti-leak CI | `test_domain_coupling_prevention.py` | AST-based: import boundary, no hardcoded dicts, structural flag alignment, no-isinstance routing |

**What this means for conscious-bot**: When wiring `SterlingDomainDeclaration.implementsPrimitives` for runtime claims, the target Sterling types are `DomainDeclarationV1` (for the declaration) and `CapabilityClaimRegistry` (for claim registration). The `required_primitives` field on `SterlingOptions` drives proof-backed routing at the engine level.

---

## Rig status summary

| Rig | Primitives | Status | Track |
|-----|-----------|--------|-------|
| **A**: Inventory transformation | 1, 16, 17, 19, 20 | DONE (all certification items complete including A.5 performance baselines) | Track 1 |
| **B**: Capability gating | 2, 16, 19, 20 | DONE (full tier progression + certification tests) | Track 1 |
| **C**: Temporal planning | 3, 16, 17, 18, 19 | PARTIAL (P03 capsule + temporal enrichment layer + crafting solver integration; FurnaceSchedulingSolver C.1–C.7 remain) | Track 1 |
| **D**: Multi-strategy acquisition (learning-benchmark candidate) | 4, 17, 18, 19, 20 | NOT STARTED | Track 2 |
| **E**: Hierarchical planning | 5, 16, 17, 19 | PARTIAL (macro-planner wired, not domain-integrated) | Track 2 |
| **F**: Valuation under scarcity | 6, 16, 17, 18, 19 | NOT STARTED | Track 2 |
| **G**: Feasibility + partial order | 7, 16, 17, 19 | PARTIAL (DAG pipeline + building solver; certification gaps G.1–G.5) | Track 2 |
| **H**: Systems synthesis | 8, 14, 16, 19 | NOT STARTED | Track 2 |
| **I**: Epistemic planning | 11, 13, 17, 19 | NOT STARTED | Track 2 |
| **J**: Invariant maintenance | 12, 17, 18, 19 | NOT STARTED | Track 2 |
| **K**: Irreversibility | 13, 19, 20 | NOT STARTED | Track 2 |
| **L**: Contingency planning | 9, 18, 19 | NOT STARTED | Later |
| **M**: Risk-aware planning | 10, 17, 18, 19 | NOT STARTED | Later |
| **N**: Fault diagnosis | 11, 15, 19 | NOT STARTED | Later |

---

## Goal Action → Rig Routing Reference

This table maps canonical goal actions (from the sanitizer's `CANONICAL_ACTIONS` allowlist) to their requirement kind, target rig, and routability status.

**Contract**: `ROUTABLE_ACTIONS` in `thought-to-task-converter.ts` must be a strict subset of actions that `resolveRequirement` + `routeActionPlan` can handle. Unroutable actions produce no task — they exist for cognitive observability only.

| Canonical Action | Requirement Kind | Rig | Routable | Status |
|---|---|---|---|---|
| `collect` | `collect` | Compiler | Yes | Working |
| `mine` | `mine` | Compiler | Yes | Working |
| `craft` | `craft` | A (Inventory Transform) | Yes | Working |
| `build` | `build` | G (Feasibility) | Yes | Working (DAG pipeline; G.1–G.5 certification gaps). Building leaves (`prepare_site`, `build_module`, `place_feature`) reachable via `executeLeafAction()`. |
| `gather` | `collect` | Compiler | Yes | Working |
| `smelt` | `craft` (furnace) | Future: C (Temporal) | Yes | Direct handler via `executeSmeltItem()` + LeafFactory `smelt` leaf. Future: Rig C temporal scheduling. |
| `repair` | `build` (maintenance) | Future: J (Invariant Maint.) | Yes (fallback) | Rig G fallback |
| `find` | `find` | E (Hierarchical) | Yes | Rig E routed (blocked sentinel if unconfigured) |
| `explore` | `explore` | E (Hierarchical) | Yes | Rig E routed (blocked sentinel if unconfigured) |
| `navigate` | `navigate` | E (Hierarchical) | Yes | Rig E routed (blocked sentinel if unconfigured) |
| `check` | — | N/A (sensing) | **No** | No task |
| `continue` | — | N/A (meta-action) | **No** | No task |

---

## P21: Entity belief maintenance and saliency

**Status**: PARTIAL → `p21.a` portable (2 surfaces), `p21.b` certified (1 surface)
**Closeout**: [p21-closeout-packet.md](./p21-closeout-packet.md)

### Architecture (post capsule-pivots refactor)

P21 is split into two conformance layers:

- **P21-A (Track Maintenance)**: 9 invariants (+ 1 opt-in `id_robustness`) governing adapter-internal state management. Tested via `runP21AConformanceSuite` in `@conscious-bot/testkits`.
- **P21-B (Emission Protocol)**: 4 invariants governing how deltas are packaged into envelopes. Tested via `runP21BConformanceSuite` in `@conscious-bot/testkits`.

Key extensions:
- **Belief mode** (`conservative` | `predictive`): conservative mode suppresses risk under uncertainty (current Minecraft behavior); predictive mode allows risk to persist.
- **`classifyRiskDetailed`**: optional method on `P21RiskClassifier` that decomposes risk into `classificationRisk` and `presenceRisk`, enabling finer-grained conformance assertions.
- **`hysteresisBudget`**: configurable (was hard-coded to 4); each domain declares its tolerance.
- **`id_robustness`**: opt-in invariant (INV-10) asserting same class+position with new entityId associates to same trackId. Not yet certified on any surface.

### What's done

| Item | File | Evidence |
|------|------|----------|
| Capsule types (domain-agnostic) | `sterling/primitives/p21/p21-capsule-types.ts` | Zero Minecraft imports; P21-A/P21-B split; `P21BeliefMode`, `P21RiskDetail`, `P21EmissionAdapter` |
| Reference fixtures (2 domains) | `sterling/primitives/p21/p21-reference-fixtures.ts` | Mob-domain + security-monitoring |
| P21-A conformance suite (9+1 invariants) | `@conscious-bot/testkits/src/p21/p21a-conformance-suite.ts` | Parameterized test factory; mode-aware monotonicity; configurable hysteresis |
| P21-B conformance suite (4 invariants) | `@conscious-bot/testkits/src/p21/p21b-conformance-suite.ts` | delta_budget, envelope_determinism, producer_validation, snapshot_cadence |
| Contract drift detector | `sterling/primitives/p21/p21-contract-equivalence.test.ts` | YAML↔capsule shape match |
| Minecraft adapter (P21-A) | `entity-belief/__tests__/p21-conformance-minecraft.test.ts` | Passes all 9 P21-A invariants (conservative mode, hysteresisBudget=4) |
| Minecraft adapter (P21-B) | `entity-belief/__tests__/p21b-conformance-minecraft.test.ts` | Passes all 4 P21-B invariants (deltaCap=32, snapshotIntervalTicks=25) |
| Reference Security adapter (P21-A) | `testkits/src/p21/__tests__/p21a-reference-security.test.ts` | Second surface: 9 P21-A invariants (security domain, conservative mode) |
| Type equivalence | `entity-belief/__tests__/p21-type-equivalence.test.ts` | ThreatLevel ↔ P21RiskLevel, RiskClassifier ↔ P21RiskClassifier |
| Import guard | `testkits/src/__tests__/no-production-import.test.ts` | Prevents testkits imports in production code |
| Boundary milestone | `entity-belief/__tests__/p21-boundary-milestone.test.ts` | 12 DOD tests |

### Field name mapping (capsule <-> rig)

| Capsule (domain-agnostic) | Rig (Minecraft) |
|---------------------------|-----------------|
| `proximityBucket` | `distBucket` |
| `riskLevel` | `threatLevel` |
| `riskClasses` | `HOSTILE_KINDS` |
| `classifyRisk` | `classifyThreat` |
| `entityId` | `engineId` |
| `classEnum` | `kindEnum` |
| `classLabel` | `kind` |

### What's needed for "portable" claim

- [x] At least one non-Minecraft adapter passes the P21-A conformance suite — Reference Security Domain (Tranche 2)
- [x] P21-B Minecraft emission adapter (wrapping BeliefBus) wired to `runP21BConformanceSuite` — (Tranche 2)
- [ ] `SterlingDomainDeclaration.implementsPrimitives` wired for runtime P21 claim — **Sterling-side infrastructure ready**: `DomainDeclarationV1` + `CapabilityClaimRegistry` with versioned keys are implemented. Remaining work is on the conscious-bot side to create declaration instances and register claims.
- [ ] `id_robustness` (INV-10) certified on at least one surface
- [ ] Extensions (`risk_components_v1`, `predictive_model`) certified on at least one surface

---

## Next milestones (post Rig A certification)

These are the highest-leverage follow-ons implied by the A.5 baseline + interpretation pass. They are intentionally separated from "Rig done" criteria so we don't accidentally certify "stability" as "learning efficacy."

- [ ] **M1 — Learning-sensitive benchmark suite (learning efficacy, not just stability)**
  - **Goal**: make "learning helps" testable with a measurable gradient while keeping semantics unchanged.
  - **Design requirements**:
    - Multiple near-equal plan families (so preference/ordering matters).
    - Repeated exposure to a consistent outcome signal (so a single episode isn't drowned out).
    - Improvement is visible in **search effort** (nodesExpanded/frontierPeak), not in "cheating" semantics.
  - **Candidate shapes**:
    - Substitute-rich crafting (two legal branches with meaningfully different costs).
    - Multi-strategy acquisition (mine vs trade vs loot) with equivalent goal validity but different effort profiles.
  - **Acceptance**: Over N episodes, `nodesExpanded` and/or `frontierPeak` trends downward (or strategy frequency shifts toward lower-effort plans) while the reachable transition set is provably unchanged.

- [ ] **M2 — Heuristic degeneracy fix (dependency-aware lower bounds)**
  - **Goal**: move from near-binary "done/not-done" heuristics to cost-to-go structure that buys real search efficiency.
  - **Direction**: prerequisite-graph lower bounds (relaxed planning over a dependency DAG, pattern DB over subgoals, or equivalent admissible/near-admissible approximation).
  - **Target improvements (observable in SearchHealth)**:
    - `hVariance` increases meaningfully.
    - `pctSameH` drops sharply (aim well below 0.5 on nontrivial solves).
    - `nodesExpanded` and `frontierPeak` decrease for equal `solutionPathLength` and termination reason.

- [ ] **M3 — Preserve "certification truthfulness" as a first-class gate**
  - **Goal**: keep the standard established in A.5 ("stability ≠ efficacy") as new rigs add complexity.
  - **Scope**:
    - Explanation schema evolution (structured evidence fields, not prose; consider "why not that plan" as v2).
    - Multi-objective wiring (ObjectiveWeights on the Sterling wire payload, plus tests that weights are explicitly declared and never smuggled).
    - Negative tests around credit assignment / learning semantics as new domains expand.

- [ ] **M4 — Start Rig C with the spine in place (temporal planning stress test)**
  - **Goal**: durations/batching/capacity will make heuristic weakness painfully visible; that's desirable because it forces M2 to "pay rent."
  - **Acceptance**: Rig C reaches its first certified sub-slice (C.1–C.3) with baseline artifacts emitted using the same harness shape as A.5.

---

## Observability infrastructure (cross-cutting)

Completed in the P0–P2 hardening sprint (2026-01-29). This underpins every rig.

| Component | Status | Files | Notes |
|-----------|--------|-------|-------|
| SolveBundle content-addressed audit trail | DONE | `solve-bundle.ts`, `solve-bundle-types.ts` | Deterministic `bundleId = solverId:bundleHash` |
| Canonicalization contract | DONE | `solve-bundle.ts` `canonicalize()` | Sorted keys, NaN rejection, -0 normalization |
| Compat linter (10 checks) | DONE | `compat-linter.ts` | 9 original + INVALID_BASE_COST |
| SearchHealth accumulator (Python) | DONE | `sterling/core/search_health.py` | Welford O(1) variance, `searchHealthVersion: 1` |
| SearchHealth parser + degeneracy detection (TS) | DONE | `search-health.ts` | Version check, partial-field warning, 3 degeneracy thresholds |
| searchHealth end-to-end emission | DONE | Python A* loops → unified server → TS parser | Verified: wooden pickaxe healthy, iron tier degenerate |
| Episode reporting (execution credit) | DONE | `base-domain-solver.ts` | Fire-and-forget with planId gate |
| Payload-equivalence snapshots | DONE | `solver-golden-master.test.ts` | Crafting + building + tool progression canonical snapshots |
| E2E solver-class tests | DONE | `solver-class-e2e.test.ts` | 5 tests against live Sterling (gated `STERLING_E2E=1`) |
| Unknown-domain fail-closed error | DONE | `sterling_unified_server.py` | `STERLING_ALLOW_DOMAIN_FALLBACK` gate |
| contractVersion wire protocol | DONE | crafting solver, unified server | Warning on missing; rejection gate ready |
| ObjectiveWeights declaration | DONE | `solve-bundle-types.ts`, `solve-bundle.ts` | Captured in SolveBundleInput; not on wire yet |
| SolveRationale explanation | DONE | `solve-bundle-types.ts`, `solve-bundle.ts` | Populated when maxNodes provided; backward-compat |
| SolveRationale wired into solvers | DONE | All 3 solver files (7 call sites) | `buildDefaultRationaleContext()` helper; 3 tests (1/solver) |
| Inventory count-capping | DONE | `solve-bundle.ts` `INVENTORY_HASH_CAP=64` | Prevents state explosion from stockpiling |
| Performance baselines (A.5) | DONE | `performance-baseline-e2e.test.ts` | 6 E2E tests: 3 baseline + 3 convergence; artifacts in `__artifacts__/` |

---

## Rig A: Inventory transformation planning

**Status**: DONE — all certification items complete

### What's done

| Item | File | Evidence |
|------|------|----------|
| Crafting solver (solve → planId → step mapping) | `minecraft-crafting-solver.ts` | `solver-golden-master.test.ts`: solveMeta bundle shape, solved/unsolved paths |
| Rule builder from mcData recipe tree | `minecraft-crafting-rules.ts` | Golden-master tests verify rule generation |
| SolveBundle wiring (input hashes, output digest, compat report) | `minecraft-crafting-solver.ts:80-93`, `solve-bundle.ts` | Unit + E2E: `bundleId` format, determinism, content addressing |
| Compat linter preflight (10 checks) | `compat-linter.ts` | `compat-linter.test.ts`: 39 tests |
| Episode reporting | `minecraft-crafting-solver.ts:183-195` | `base-domain-solver.test.ts`: envelope, planId gate |
| Payload-equivalence snapshot | `solver-golden-master.test.ts` | Canonical JSON snapshot with `contractVersion` + `solverId` |
| searchHealth in bundles | `search-health.ts`, `solve-bundle.ts` | E2E: `searchHealth.nodesExpanded > 0` verified |
| Count-capping in inventory hash | `solve-bundle.ts` | `INVENTORY_HASH_CAP=64`, 3 unit tests |
| Composite goal format proof | `solver-golden-master.test.ts` | Wire `goal` field supports `Record<string, number>` multi-item goals |
| Recipe variant rules | `solver-golden-master.test.ts` | `buildCraftingRules` generates variant rules, both appear in wire payload |
| Transfer test (BOM assembly) | `transfer-bom-assembly.test.ts` | Non-Minecraft domain: linter, hashing, bundle capture, canonicalization (5 tests) |
| Explanation skeleton | `solve-bundle-types.ts`, `solve-bundle.ts` | `SolveRationale` populated when maxNodes provided (4 tests) |

### What's needed for certification

- [x] **A.1 — Composite goal test**: Wire payload `goal` supports `Record<string, number>` composites. `canonicalize({stick: 4, crafting_table: 1})` produces deterministic output.
- [x] **A.2 — Substitute-allowed variant**: `buildCraftingRules()` with two recipe variants generates both variant rules. Both appear in wire payload.
- [x] **A.3 — Count-capping in inventory hash**: `INVENTORY_HASH_CAP = 64`. Three tests: above-cap equal, below-cap differs, at-cap equals above-cap.
- [x] **A.4 — Explanation skeleton**: `SolveRationale` type, `computeBundleOutput` populates it when `maxNodes` provided. Backward-compatible (undefined without maxNodes). 4 tests.
- [x] **A.5 — Performance baseline**: `performance-baseline-e2e.test.ts` — 6 E2E tests (gated `STERLING_E2E=1`) recording nodesExpanded, frontierPeak, terminationReason, solutionPathLength, branchingEstimate for stick (raw WS), wooden_pickaxe, and stone_pickaxe (per-tier, both solver-class). Learning **stability** tests prove `nodesExpanded2 <= nodesExpanded1 * 1.05` after episode report. Note: convergence ratios of exactly 1.0 demonstrate stability (no regression), not efficacy (learning improves search). Learning efficacy requires a separate learning-sensitive benchmark. Artifact JSONs committed to `__artifacts__/perf-baseline-*.json` and `perf-convergence-*.json` with full `ArtifactMeta` (gitSha, clientPathway, solverId, executionMode, contractVersion, maxNodes, objectiveWeights).
- [x] **A.6 — Transfer test skeleton**: `transfer-bom-assembly.test.ts` — non-Minecraft BOM domain (gadget_assembled, widget_refined, widget_raw). Linter, hashing, bundle capture all work. 5 tests.

---

## Rig B: Capability gating and legality

**Status**: DONE — full tier progression with certification tests

### What's done

| Item | File | Evidence |
|------|------|----------|
| Tier decomposition solver (wooden → stone → iron → diamond) | `minecraft-tool-progression-solver.ts` | E2E: wooden pickaxe solves in 93 nodes, 8 steps |
| Capability token infrastructure (`cap:has_{tier}_pickaxe`) | `minecraft-tool-progression-types.ts:40-86` | `TIER_GATE_MATRIX` frozen by Minecraft 1.20 harvest levels |
| Rule generation with tier gates | `minecraft-tool-progression-rules.ts` | `tool-progression-golden-master.test.ts`: 51 tests |
| Fail-closed legality (mine requires cap: token) | `compat-linter.ts` MINE_TIERGATED_NO_INVARIANT | Integration test: stone blocked without wooden pickaxe cap |
| Missing-blocks early exit (honest partial observability) | `minecraft-tool-progression-solver.ts` | Golden-master: `missingBlocks` reported when stone not nearby |
| Per-tier SolveBundle (distinct goalHash per tier) | `solver-class-e2e.test.ts` iron-tier test | E2E: 3 bundles with distinct goalHash, searchHealth per tier |
| Learning isolation (`tp:` action prefix + executionMode) | Types + rules | Integration test: tp: namespace, executionMode='tool_progression' |
| Episode reporting (per-tier success/failure) | `minecraft-tool-progression-solver.ts:325-345` | Unit tests in base-domain-solver |
| Degeneracy detection at iron tier | `search-health.ts` + E2E | E2E: iron tier flags 98-100% pctSameH, constant heuristic |
| Adversarial negative (wrong cap token) | `compat-linter.test.ts` | Documents structural linter limitation: wrong cap token not detected (semantic gap) |
| Path-walk legality proof | `tool-progression-golden-master.test.ts` | Walks mock solution, accumulates inventory, asserts every requires/consumes satisfied |
| Transfer test (approval ladder) | `transfer-approval-ladder.test.ts` | Non-Minecraft clearance levels: linter, hashing, bundle capture (5 tests) |

### Certification checklist

- [x] **B.1 — Adversarial negative test**: Wrong cap token (stone instead of wooden) — structural linter satisfied, semantic error not caught. Documented limitation.
- [x] **B.2 — Solver never proposes illegal transition**: Path-walk accumulates inventory, asserts all requires/consumes have sufficient counts at every step. Final inventory contains target tool.
- [x] **B.3 — Transfer test**: `transfer-approval-ladder.test.ts` — clearance levels (intern → associate) using cap: tokens. 5 tests.

---

## Rig C: Temporal planning with durations, batching, and capacity

**Status**: PARTIAL — P03 capsule defined + temporal enrichment layer integrated into crafting solver; FurnaceSchedulingSolver (C.1–C.7) not yet started

### What's done

| Item | File | Evidence |
|------|------|----------|
| P03 capsule contract types (domain-agnostic) | `sterling/primitives/p03/p03-capsule-types.ts` | `P03TemporalStateV1`, `P03TemporalAdapter`, `P03PlannedStepV1`; 5 invariants (INV-1 through INV-5); canonical ordering for deterministic hashing |
| Reference adapter (domain-agnostic) | `sterling/primitives/p03/p03-reference-adapter.ts` | `P03ReferenceAdapter` satisfying all 5 invariants |
| Reference fixtures (2 domains) | `sterling/primitives/p03/p03-reference-fixtures.ts` | Furnace smelting domain + CI runner domain for portability |
| Conformance suite — furnace | `sterling/primitives/p03/__tests__/p03-conformance-furnace.test.ts` | Passes all 5 P03 invariants on furnace domain |
| Conformance suite — CI | `sterling/primitives/p03/__tests__/p03-conformance-ci.test.ts` | Passes all 5 P03 invariants on CI runner domain |
| Temporal enrichment orchestrator | `temporal/temporal-enrichment.ts` | `computeTemporalEnrichment()` — 3 modes (`off`, `local_only`, `sterling_temporal`); returns enrichRule/batchHint closures + deadlock state |
| Time-state construction | `temporal/time-state.ts` | `makeTemporalState()`, `inferSlotsFromBlocks()`, `toTickBucket()`; MINECRAFT_BUCKET_SIZE_TICKS=100, HORIZON_BUCKETS=100 |
| Duration model | `temporal/duration-model.ts` | `annotateRuleWithDuration()`, `computeDurationTicks()`; per-action-type table (craft=0, mine=40, smelt=200, place=5); batch scaling formula |
| Deadlock prevention | `temporal/deadlock-prevention.ts` | `deriveSlotNeeds()`, `checkDeadlockForRules()`; fail-closed: `needsFurnace=true` implies furnace slot need |
| Batch operators | `temporal/batch-operators.ts` | `getBatchHint()`, `MINECRAFT_BATCH_OPERATORS` (5 operators, threshold=8, maxBatchSize=64) |
| Crafting solver temporal integration | `minecraft-crafting-solver.ts:116-166` | 3-mode gating, enrichment closures, deadlock early-return, temporal payload attachment to Sterling wire |
| Temporal e2e test suite (49 tests) | `sterling/__tests__/temporal-crafting-e2e.test.ts` | Suites A–M: mode gating, enrichment, temporal fields, duration annotations, deadlock detection, batch hints, round-trip, adapter reuse, slot ordering, strict mock validation, smelt injection, edge cases, enrichment call counts |
| Temporal unit tests | `temporal/__tests__/` | duration-model (6 tests), deadlock-prevention (4 tests), time-state (5 tests), enrichment-bridge (3 tests) |

> **Note**: The P03 capsule (`packages/planning/src/sterling/primitives/p03/`) and temporal modules (`packages/planning/src/temporal/`) are currently untracked in git. The e2e test file was committed (`dfaec57`). The remaining untracked directories should be committed as part of the next Rig C PR.

### What's needed

C.1–C.7 are the **FurnaceSchedulingSolver** certification items. The temporal enrichment layer (above) is prerequisite infrastructure; these items build the dedicated furnace solver on top of it.

- [ ] **C.1 — FurnaceSchedulingSolver class**: Extends `BaseDomainSolver`. Accepts furnace count, fuel inventory, smelt queue. Calls Sterling with time-aware rules.
  - **Acceptance**: `minecraft-furnace-solver.ts` exists. Extends `BaseDomainSolver<FurnaceSolveResult>`. `solverId = 'minecraft.furnace'`. SolveBundle wired.

- [ ] **C.2 — Time-discretized state representation**: State includes furnace slots (each with item, fuel remaining, ticks to completion). Canonical hash compresses timing into buckets.
  - **Acceptance**: `minecraft-furnace-types.ts` defines `FurnaceSlotState`, `FurnaceSearchState`. Hash function defined. Bucket granularity documented.

- [ ] **C.3 — Operator families**: `load_furnace`, `add_fuel`, `wait_tick`, `retrieve_output`. Preconditions enforce capacity (slot not occupied). Effects update slot state + clock.
  - **Acceptance**: Rule builder generates typed operators. Compat linter extended with `FURNACE_OVERCAPACITY` check.

- [ ] **C.4 — Batching proof**: Sterling prefers loading multiple items before waiting, rather than load-wait-retrieve-repeat.
  - **Acceptance**: Unit test: 4 items + 1 furnace. Optimal plan loads+fuels, then waits once. Suboptimal plan waits per item. Assert `solutionPathLength` optimal <= suboptimal.

- [ ] **C.5 — Parallel slot proof**: With k=2 furnaces and 4 items, Sterling allocates across both.
  - **Acceptance**: E2E or unit test: 2 furnaces, 4 iron ore. Plan uses both slots. Makespan < sequential.

- [ ] **C.6 — Golden-master snapshot**: Outbound payload captured and snapshotted.
  - **Acceptance**: `solver-golden-master.test.ts` furnace section with canonical payload snapshot.

- [ ] **C.7 — Transfer test**: Generic "job shop" scheduling surface with slot occupancy semantics.
  - **Acceptance**: `transfer-job-shop.test.ts` using furnace solver with non-Minecraft job/machine rules.

---

## Rig G: Feasibility + partial-order structure (building)

**Status**: PARTIAL — building solver with DAG pipeline; certification gaps G.1–G.5 remain

### What's done

| Item | File | Evidence |
|------|------|----------|
| Building solver (templateId, modules, siteState) | `minecraft-building-solver.ts` | `solver-golden-master.test.ts`: building tests |
| Module types (prep_site, apply_module, place_feature) | `minecraft-building-types.ts` | Type definitions + `requiresModules` field + `RigGMode`, `RigGStageDecisions` |
| DAG builder (module dependency graph) | `constraints/dag-builder.ts` | Builds DAG from module `requiresModules` |
| Topological linearization | `constraints/linearization.ts` | Linearizes DAG; tested in `linearization.test.ts` |
| Feasibility checker | `constraints/feasibility-checker.ts` | Validates constraint satisfaction; tested in `feasibility-checker.test.ts` |
| Partial-order plan representation | `constraints/partial-order-plan.ts` | `findCommutingPairs()` for independent modules; tested in `partial-order-plan.test.ts` |
| Rig G signal computation | `constraints/signals.ts` | `computeRigGSignals()` for feasibility gating |
| Execution advisor (Rig G metadata) | `constraints/execution-advisor.ts` | `RigGMetadata` type with signals, commuting pairs, partial-order plan; tested in `execution-advisor.test.ts` |
| Rig G metadata wiring in planner | `sterling-planner.ts:618-625` | Stores `RigGMetadata` (signals, commuting pairs, partial-order plan) in `taskData.metadata.solver.rigG` |
| Material deficit + replan loop | `minecraft-building-solver.ts:253-306` | Golden-master: deficit → acquisition steps + replan sentinel |
| SolveBundle wiring | Building solver | E2E: `solverId: 'minecraft.building'`, bundle shape verified |
| Episode reporting (per-module failure attribution) | `minecraft-building-solver.ts:322-340` | Captures failureAtModuleId |

### What's needed for certification

- [ ] **G.1 — Support constraints**: Modules declare `supportRequirements` (e.g., walls require foundation). Solver respects partial order.
  - **Acceptance**: `BuildingModule.supportRequirements` field added. Rule builder emits preconditions. Test: wall module without foundation → rejected by Sterling (no valid plan).

- [ ] **G.2 — Reachability checks**: Bot must be able to physically reach placement location. Modules declare `reachabilityZone`.
  - **Acceptance**: Type + rule builder extension. Test: roof module unreachable without scaffolding → plan includes scaffolding step.

- [ ] **G.3 — Partial-order proof**: Two independent modules (e.g., east wall, west wall) can execute in either order. Solver emits a plan where both orders are valid linearizations.
  - **Acceptance**: Golden-master test: two modules with no mutual `requiresModules`. Assert both orderings produce valid plans (or assert solution path doesn't enforce unnecessary ordering).

- [ ] **G.4 — Scaffolding reasoning**: Temporary structures placed to enable otherwise-unreachable modules, then optionally removed.
  - **Acceptance**: Module type `scaffold` added. Rule builder generates place+remove scaffold operators. Test: multi-story build requires scaffolding.

- [ ] **G.5 — Transfer test**: Construction scheduling or CI pipeline surface with same "must precede" constraint semantics.
  - **Acceptance**: `transfer-build-scheduling.test.ts` with generic task graph, dependency constraints. Same solver, different surface.

---

## Rig E: Hierarchical planning (navigate/explore/find)

**Status**: PARTIAL — macro-planner infrastructure wired; not fully domain-integrated

### What's done

| Item | File | Evidence |
|------|------|----------|
| MacroPlanner class (Dijkstra path planning) | `hierarchical/macro-planner.ts` | Context registry, edge cost model, path computation; tested in `macro-planner.test.ts` |
| Macro state management | `hierarchical/macro-state.ts` | Macro path state, edge sessions, outcome tracking; tested in `macro-state.test.ts` and `macro-edge-session.test.ts` |
| Feedback store (cost updates from micro execution) | `hierarchical/feedback.ts` | Cost updates propagated from micro step outcomes; tested in `feedback.test.ts` |
| Rig E signal instrumentation | `hierarchical/signals.ts` | Observability signals for hierarchical planner |
| E2E macro-micro integration test | `hierarchical/__tests__/e2e-macro-micro.test.ts` | End-to-end test of macro→micro decomposition |
| Routing wired (navigate, explore, find) | `action-plan-backend.ts:111-136` | All three requirement kinds → `requiredRig: 'E'`, `backend: 'sterling'` |
| Planner integration with configuration gate | `sterling-planner.ts:369-417` | Calls `generateDynamicStepsHierarchical()` when configured; returns blocked sentinel otherwise |
| Actions in ROUTABLE_ACTIONS | `thought-to-task-converter.ts:57-60` | `navigate`, `explore`, `find` all routable; tasks created for these goals |
| Rig E step provenance tagging | `sterling-planner.ts:379-388` | Steps tagged with `source: 'rig-e-macro'`, `macroEdgeId`, `contextTarget`, `macroPlanDigest` |

### What's needed for certification

- [ ] **E.1 — Full domain ontology integration**: Wire Minecraft world graph (biome regions, structure locations, resource zones) into MacroPlanner context registry.
  - **Acceptance**: MacroPlanner produces real navigation plans using actual Minecraft world topology, not synthetic test graphs.

- [ ] **E.2 — Micro-step decomposition**: Macro edges decompose into concrete Mineflayer movement/interaction steps.
  - **Acceptance**: Each macro edge produces executable micro-steps that the PlanExecutor can run.

- [ ] **E.3 — Feedback loop**: Micro execution outcomes update macro edge costs for future planning.
  - **Acceptance**: Failed or slow macro edges have increased costs in subsequent plans. Test: block a path, re-plan routes around it.

- [ ] **E.4 — Golden-master snapshot**: Outbound macro plan payload captured and snapshotted.
  - **Acceptance**: Deterministic plan for a fixed world graph + goal.

- [ ] **E.5 — Transfer test**: Non-Minecraft navigation surface (e.g., floor-plan routing, network topology).
  - **Acceptance**: Same MacroPlanner, different domain graph. Conformance suite passes on both surfaces.

---

## Rigs D, F, H–N: Not started

These rigs are documented in [sterling-minecraft-domains.md](./sterling-minecraft-domains.md) with full rig templates. Implementation follows Track 2 (D–K) and Later (L–N) priority ordering.

### Post-certification order (after A–C certified):

> **Note**: This is the sequential implementation order for all remaining rigs,
> spanning Tracks 2 and 3 from [RIG_DOCUMENTATION_INDEX.md](./RIG_DOCUMENTATION_INDEX.md).
> The index organizes rigs by thematic track (Track 2 = belief/perception,
> Track 3 = representational widening); this list orders them by dependency
> and implementation priority within those tracks.

1. **Rig D** — Multi-strategy acquisition (mine vs trade vs loot) — primary candidate for a learning-sensitive benchmark (multiple legal strategies, stable outcome signal)
2. **Rig E** — Hierarchical planning certification (see above for existing work)
3. **Rig F** — Valuation under scarcity (keep/drop/store)
4. **Rig G** — Feasibility certification (see above for existing work)
5. **Rig H** — Systems synthesis (farm layout first)
6. **Rig I** — Epistemic planning (structure localization)
7. **Rig J** — Invariant maintenance (base upkeep loops)
8. **Rig K** — Irreversibility (villager trades)

### Later (requires A–K certified):
9. **Rig L** — Contingency planning (nightfall/hunger)
10. **Rig M** — Risk-aware planning (lava, nether)
11. **Rig N** — Fault diagnosis (jammed systems)

---

## What "done" means for a rig

A rig is certified when it passes all three test categories:

1. **Signature tests** — Legality, determinism, boundedness, canonicalization, validation/hardening. All global invariants satisfied.
2. **Performance tests** — Search effort is bounded and stable across repeat solves (no regression). Learning does not alter semantics. Note: current baselines prove stability, not learning efficacy. Learning-sensitive benchmarks (problems with multiple near-tied plans) are a separate milestone.
3. **Transfer tests** — Same formal signature runs on at least one non-Minecraft surface with the same invariants and harness.

---

## Recently completed work

### Rig C Temporal Enrichment Layer + E2E Test Suite (2026-02-01)

Built and tested the temporal enrichment pipeline that integrates P03 temporal planning into the crafting solver. This is prerequisite infrastructure for the FurnaceSchedulingSolver (C.1–C.7).

**Temporal modules** (untracked — `packages/planning/src/temporal/`):
- `temporal-enrichment.ts` — `computeTemporalEnrichment()` orchestrator: 3 modes (`off` → inert, `local_only` → enrichment without wire changes, `sterling_temporal` → full temporal payload). Returns `enrichRule`/`batchHint` closures + deadlock state.
- `time-state.ts` — `makeTemporalState()` converts domain ticks to P03 integer buckets. `inferSlotsFromBlocks()` for pessimistic-idle slot inference from nearby blocks. Constants: `MINECRAFT_BUCKET_SIZE_TICKS=100`, `HORIZON_BUCKETS=100`.
- `duration-model.ts` — Per-action-type duration table (craft=0, mine=40, smelt=200, place=5 ticks). Batch scaling: `base + perItem * (count-1)`.
- `deadlock-prevention.ts` — `deriveSlotNeeds()` + `checkDeadlockForRules()`. Fail-closed: `needsFurnace=true` implies furnace slot need even without duration model mapping.
- `batch-operators.ts` — `getBatchHint()` delegates to `adapter.preferBatch()`. `MINECRAFT_BATCH_OPERATORS`: 5 operators (iron_ore, gold_ore, raw_beef, raw_iron, sand), maxBatchSize=64, threshold=8.
- Unit tests: duration-model (6), deadlock-prevention (4), time-state (5), enrichment-bridge (3) — 18 tests total.

**Crafting solver integration** (`minecraft-crafting-solver.ts:116-166`):
- 3-mode temporal gating in `solveCraftingGoal()`
- Deadlock detection short-circuits solver (service.solve NOT called when deadlocked)
- Temporal payload fields attached for `sterling_temporal` mode only
- `enrichRule` closure annotates rules with `durationTicks`/`requiresSlotType` (local only, not sent to Sterling)

**E2E test suite** (`temporal-crafting-e2e.test.ts` — committed as `dfaec57`):
- 49 tests across 13 suites (A–M):
  - A: Baseline mode=off (3 tests)
  - B: local_only enrichment (3 tests)
  - C: sterling_temporal wire fields (3 tests)
  - D: Temporal state construction (3 tests)
  - E: Duration annotations per action type (6 tests)
  - F: Deadlock detection incl. smelt injection via `vi.spyOn(ruleBuilderModule)` (5 tests)
  - G: Batch hints (5 tests)
  - H: Full pipeline round-trip (3 tests)
  - I: Adapter reuse across solves (2 tests)
  - J: Canonical slot ordering (3 tests)
  - K: Strict mock validates payload (4 tests) — `createStrictMockService()` + `makeDerivedResponse()`
  - L: mapSolutionToSteps edge cases (3 tests)
  - M: Enrichment entrypoint call counts per mode (3 tests)
- Strict mock validates: goal matches, rule actions present, consumes/produces correct, temporal fields present/absent per mode, no annotation leakage to wire
- Smelt injection at solver boundary via `vi.spyOn(ruleBuilderModule, 'buildCraftingRules')` (not monkeypatch)

**Files**: 7 new source files (temporal/), 1 new test file (committed), 1 modified solver file
**Verification**: 49/49 e2e tests passed, 320/320 sterling+temporal tests passed, 0 TS errors

### Phase 0: Action Dispatch Boundary Alignment (2026-02-01)

Fixed the split-brain dispatcher architecture where `mapBTActionToMinecraft` emitted action types that `executeAction()` could not handle, causing "Unknown action type" errors at runtime.

**Problem**: The `/action` endpoint calls `executeAction()` directly, but `executeAction` only had `case 'craft_item'` while `mapBTActionToMinecraft('craft_recipe')` emits `type: 'craft'`. Similarly, `smelt` had no handler, and building leaves (`prepare_site`, `build_module`, `place_feature`) were registered in LeafFactory but unreachable from `executeAction`.

**Commit 0a — Contract mismatch fixes**:
- Added `case 'craft':` fall-through to `case 'craft_item':` in `executeAction`
- Added `executeSmeltItem()` handler for `smelt` / `smelt_item` types via LeafFactory `smelt` leaf
- Added `executeLeafAction()` generic handler for building leaves (`prepare_site`, `build_module`, `place_feature`)
- Extracted `createLeafContext()` shared helper (was ~30 lines duplicated in `executeCraftItem` and `executeDigBlock`)

**Commit 0b — LeafFactory-first dispatch**:
- Added `ACTION_TYPE_TO_LEAF` normalization map (`craft` → `craft_recipe`, `smelt` → `smelt`, etc.)
- Restructured `executeAction` to try LeafFactory lookup before falling through to hardcoded switch cases
- Placeholder leaves fall through to hardcoded handlers (no behavioral change for existing code paths)

**Commit 0c — Boundary conformance tests**:
- `planner-action-boundary.test.ts` — 51 tests verifying every planner-emitted action type is accepted by `executeAction`
- `action-dispatch-contract.test.ts` — 24 tests verifying dispatch mechanics (craft alias, smelt handler, building leaves, LeafFactory-first priority, placeholder fallthrough)
- Documented known boundary gaps: `move_and_gather` → `gather_resources` and `explore_area` → `move_random` (cognitive-reflection mappings, not solver outputs)

**Files changed**: `action-translator.ts`, `action-mapping.ts`, `types.ts` (modified); 2 new test files
**Verification**: 75/75 tests passed across both packages, 0 TS errors

### A.5 Performance Baselines + Tightening (2026-01-30)

**A.5 Performance baseline E2E tests**:
- New file: `performance-baseline-e2e.test.ts` — 6 tests gated behind `STERLING_E2E=1`
- 3 baseline tests (stick via raw WS, wooden_pickaxe and stone_pickaxe via solver-class): record `nodesExpanded`, `frontierPeak`, `terminationReason`, `solutionPathLength`, `branchingEstimate` per solve
- 3 stability tests: solve → episode report → re-solve, assert `nodesExpanded2 <= nodesExpanded1 * 1.05` (proves no regression; does not prove learning efficacy)
- Stone pickaxe records per-tier metrics (wooden_tier + stone_tier separately)
- Artifacts committed to `__artifacts__/perf-baseline-*.json` and `perf-convergence-*.json` with full `ArtifactMeta` (gitSha, clientPathway, solverId, executionMode, contractVersion, maxNodes, objectiveWeights)
- Fixed E2E convergence harness to read `result.metrics.searchHealth` (raw WS and solver-class payload shape) and re-generated committed artifacts.
- Sequential execution (`describe.sequential`) prevents file-write races
- No `durationMs` assertions (nondeterministic)
- Key finding: solver-class heuristic shows `pctSameH ≈ 0.98–0.995` (near-degenerate). Heuristic has insufficient resolution for single-key goals — A\* degrades to near-uniform-cost search. Primary improvement lever: dependency-aware cost lower bounds.

**Interpretation findings (from committed artifacts)**:
- The solver-class heuristic is close to binary on these problems: very high `pctSameH` with near-zero variance implies A\* behaves close to uniform-cost search (the open set grows, but the heuristic does not meaningfully rank candidates).
- Stone-tier runs inflate `frontierPeak` relative to `nodesExpanded`, consistent with branching under weak discrimination (open set swells because many nodes tie on h).
- "Convergence" artifacts with ratios at 1.0 should be read as **stability/no-regression**. They do not demonstrate learning efficacy on these tasks; learning-sensitive benchmarks are required for that claim.
- Stick is a weak comparator (tiny operator set, tiny sample size). It's useful as a smoke test for wiring, not as an efficiency benchmark.

**Tightening changes**:
- `buildDefaultRationaleContext()` accepts optional `objectiveWeights` override
- Helper removed from public `index.ts` exports (internal to sterling package)
- Rationale tests tightened: `issueCount === 0` and `objectiveWeightsSource === 'default'` symmetrically across all 3 solvers
- Verified hash stability under irrelevant variation: `CompatReport.checkedAt` does not affect bundle hashing (changing timestamps must not change `bundleHash`).
- Fix D tracker entry clarified (linter-context tests, not server fallback)

**Files changed**: 1 new test file, 5 modified files
**Verification**: 216/216 unit tests passed, 6 E2E tests correctly skipped (gated), 0 TS errors

### Paper-Cut Fixes + Milestone 2: Rationale Wiring (2026-01-30)

**Paper-cut fixes (4 items)**:
- Fix A: SearchHealth spec (`sterling-search-health-spec.md`) aligned with implementation — `terminationReason` enum, `searchHealthVersion: 1` in example, parser behavior section added.
- Fix B: `INVENTORY_HASH_CAP` doc comment expanded with semantic boundary warning (audit-only, not for correctness-critical memoization).
- Fix C: `baseCost` optional semantics clarified — `undefined` means "Sterling default cost." Doc comment on `LintableRule.baseCost`. Module doc updated to "Ten checks."
- Fix D: Unknown-context linter behavior tests added to `compat-linter.test.ts` — 3 tests proving structural checks apply under unknown `solverId`/`executionMode` context. These validate linter behavior, not the WS server's `unknown_domain` error response (which requires a gated E2E test at the `SterlingClient` boundary).

**Milestone 2: Wire SolveRationale into real solver bundles**:
- Added `buildDefaultRationaleContext()` helper to `solve-bundle.ts` — takes `{ compatReport, maxNodes, objectiveWeights? }`, returns the 4 rationale fields. Optional `objectiveWeights` override prevents future clobbering when solvers supply non-default weights.
- Wired into all 7 `computeBundleOutput()` call sites across 3 solvers:
  - `minecraft-crafting-solver.ts`: 2 call sites, `maxNodes=5000`
  - `minecraft-building-solver.ts`: 3 call sites, `maxNodes=2000`
  - `minecraft-tool-progression-solver.ts`: 2 call sites, `maxNodes=5000`
- Extracted `maxNodes` literal to a local constant in each solver (no more magic numbers in solve calls vs. rationale).
- 3 new tests (1/solver) in golden-master files: assert `rationale` is defined, `maxNodes` matches solver constant, `compatValid` matches compat report, `issueCount === 0`, `objectiveWeightsSource === 'default'`.
- Helper is internal to the sterling package (not re-exported from `index.ts`). Solvers import directly from `./solve-bundle`.

**Files changed**: 7 modified (3 solvers, solve-bundle.ts, index.ts, 2 golden-master test files)
**Test delta**: 213 → 216 (+3 new rationale tests)
**Verification**: 216/216 passed, 0 errors in sterling/planning TypeScript scope

### Certification Hardening Sprint (2026-01-30)

Closed all 6 global invariant gaps and certified Rigs A+B with transfer tests and adversarial negatives.

**Phase 1 — Global invariants (6 items)**:
- Invariant 3: `INVENTORY_HASH_CAP = 64` in `hashInventoryState()`. 3 tests.
- Invariant 7: `INVALID_BASE_COST` linter check (10th check). `MAX_BASE_COST = 1000`. `baseCost?` on `LintableRule`. 9 tests.
- Invariant 5: Credit assignment negative tests — `solveCraftingGoal()` never calls `reportEpisodeResult()` or sends `report_episode`. 2 tests.
- Invariant 4: Client payload statelessness tests — wire payload byte-equivalent across solves and after learning events. 2 tests.
- Invariant 8: `ObjectiveWeights`, `DEFAULT_OBJECTIVE_WEIGHTS`, `ObjectiveWeightsSource`. Captured in `SolveBundleInput`. 3 tests.
- Invariant 6: `SolveRationale` type with `boundingConstraints`, `searchEffort`, `searchTermination`, `shapingEvidence`. Populated in `computeBundleOutput()` when `maxNodes` provided. 4 tests.

**Phase 2 — Rig certification (5 items)**:
- A.1+A.2: Composite goal + recipe variant tests. 3 tests in `solver-golden-master.test.ts`.
- A.3 (A.6): `transfer-bom-assembly.test.ts` — non-Minecraft BOM domain. 5 tests. NEW FILE.
- B.1: Adversarial negative — wrong cap token documents structural linter limitation. 1 test.
- B.2: Path-walk legality proof — accumulates inventory, verifies all gates. 1 test.
- B.3: `transfer-approval-ladder.test.ts` — non-Minecraft clearance levels. 5 tests. NEW FILE.

**Files changed**: 8 modified, 2 created
**Test delta**: 177 → 210 (+33 new test cases)
**Verification**: 210/210 passed, 0 errors in sterling/planning TypeScript scope

### P0/P1/P2 Observability Sprint (2026-01-29)

This sprint implemented the observability infrastructure that underpins all rigs:

#### Python (sterling repo)
- `core/search_health.py` — SearchHealthAccumulator (Welford O(1) variance, TerminationReason enum, `searchHealthVersion: 1`)
- `tests/unit/test_search_health_accumulator.py` — 20 unit tests
- `scripts/eval/minecraft_domain.py` — A* loop instrumented with `on_pop`, `on_generate`, `on_enqueue`
- `scripts/eval/building_domain.py` — A* loop instrumented (same pattern)
- `scripts/utils/sterling_unified_server.py` — searchHealth in complete messages, fail-closed unknown-domain errors, contractVersion warning/rejection gate

#### TypeScript (conscious-bot repo)
- `solve-bundle-types.ts` — `terminationReason` updated to `'goal_found' | 'max_nodes' | 'frontier_exhausted' | 'error'`; `searchHealthVersion` added
- `search-health.ts` — Version check, partial-field warning, updated enum parser
- `solve-bundle.ts` — Sets `searchHealthVersion: 1` on defined searchHealth
- `search-health.test.ts` — 19 tests (version check, partial fields, old enum rejection)
- `solver-class-e2e.test.ts` — searchHealth `toBeDefined()` assertions, building E2E, iron-tier degeneracy experiment
- `minecraft-crafting-solver.ts` — `contractVersion` + `solverId` in wire payload
- `solver-golden-master.test.ts` — Updated crafting snapshot with new fields
- `sterling-client.ts` — `unknown_domain` error code handling
- `types.ts` — Error code/domain fields, domain union members

#### Verification results (2026-01-29)
- Python unit tests: **20/20 passed**
- TS sterling tests: **177/177 passed** (8 test files)
- TS typecheck: **0 errors** in sterling/planning scope
- E2E (live Sterling): **5/5 passed** — searchHealth flowing end-to-end, iron-tier degeneracy detected

---

## Stale docs to update

- [x] `docs/planning/sterling-search-health-spec.md` line 3: Updated to "Implemented (2026-01-29)" with divergence notes.

---

## Verification commands

```bash
# Python unit tests (sterling repo)
cd /Users/darianrosebrook/Desktop/Projects/sterling
python -m pytest tests/unit/test_search_health_accumulator.py -v

# TS unit tests (no server needed)
cd /Users/darianrosebrook/Desktop/Projects/conscious-bot
npx vitest run packages/planning/src/sterling/__tests__/

# TS typecheck
npx tsc --noEmit

# E2E (requires Sterling server on ws://localhost:8766)
cd /Users/darianrosebrook/Desktop/Projects/sterling
python scripts/utils/sterling_unified_server.py &
cd /Users/darianrosebrook/Desktop/Projects/conscious-bot
STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/solver-class-e2e.test.ts
```
