# Sterling Capability Rig Tracker

**Last updated**: 2026-02-02
**Repos**: conscious-bot (TS), sterling (Python)
**Reference**: [sterling-minecraft-domains.md](./sterling-minecraft-domains.md), [capability-primitives.md](./capability-primitives.md)

---

## Status legend

Rig status has two orthogonal axes. Treating them as a single "DONE" invites the semantic lie where "contract-certified" is misread as "search-proven."

### Contract certification (CB-side: TS solver + mocked Sterling)

| Symbol | Meaning |
|--------|---------|
| NOT STARTED | No implementation |
| IN PROGRESS | Partial implementation; some certification items remain |
| CONTRACT-CERTIFIED | Interface, determinism, lintability, bundle identity, portability, and transfer tests all pass. All global invariants satisfied. |

Evidence: unit tests, golden-master snapshots, transfer tests, linter hardening, determinism tests, bundle invariants.

### Solver / E2E certification (CB → Sterling Python A* → CB)

| Symbol | Meaning |
|--------|---------|
| NONE | No Python solver domain exists, or no E2E tests exercise it for this rig |
| PARTIAL | Python solver domain exists; some paths/strategies tested E2E, others not. Coverage set listed explicitly. |
| E2E-PROVEN | All primary paths/strategies exercised through real Sterling server with `STERLING_E2E=1` gated tests. SearchHealth flows. |

Evidence: E2E tests gated behind `STERLING_E2E=1`, real server traces, returned SearchHealth metrics.

"PARTIAL" requires an explicit **E2E coverage set** — the list of paths/strategies that are and are not proven. This prevents hand-waving.

---

### Primitive namespace note

Sterling Python's `data/primitive_specs/index.json` defines engine-level primitives **ST-P01** through **ST-P05** (deterministic transitions, observation emission, prediction verification, discriminative K1 evaluation, macro-operator composition). These are *not* the same namespace as the domain-level capability primitives **CB-P01** through **CB-P21** defined in [capability-primitives.md](./capability-primitives.md).

| Namespace | Abstraction level | Example | Defined in |
|-----------|------------------|---------|-----------|
| **ST-Pxx** | Engine-level (what the search infrastructure can do) | ST-P01: deterministic transitions | `sterling/data/primitive_specs/index.json` |
| **CB-Pxx** | Domain-level (what planning capability is proven) | CB-P01: deterministic transformation planning | `docs/planning/capability-primitives.md` |

The bridge between namespaces is `SterlingDomainDeclaration.implementsPrimitives` → `DomainDeclarationV1` → `CapabilityClaimRegistry`.

**Namespace collision resolution** (2026-02-02): `primitive-namespace.ts` provides:
- `QualifiedPrimitiveId` type (`CB-Pxx | ST-Pxx`) — bare IDs are structurally rejected
- `SterlingDomainDeclaration.implementsPrimitives` now typed as `QualifiedPrimitiveId[]` (not `string[]`)
- `CB_REQUIRES_ST` dependency mapping: CB-P01→[ST-P01], CB-P03→[ST-P01,ST-P02], etc.
- `assertQualifiedPrimitiveIds()` runtime validator for claim registration
- 22 tests proving validation, constants, and dependency mapping

**Capability-claim pipeline** (2026-02-02): End-to-end declaration registration wired:
- `DomainDeclarationV1` type + `computeDeclarationDigest()` in `domain-declaration.ts` (TS)
- `register_domain_declaration_v1` / `get_domain_declaration_v1` WS commands on `SterlingClient`
- Python handlers in `sterling_unified_server.py` with in-memory registry keyed by content-addressed digest
- Fail-closed validation on both sides: TS via `assertQualifiedPrimitiveIds()`, Python via `_QUALIFIED_PRIMITIVE_RE`
- Digest mismatch detection: server recomputes digest and rejects if client digest doesn't match (canonicalization drift)
- Service-layer digest default: `SterlingReasoningService.registerDomainDeclaration()` computes digest locally when omitted, so drift detection is engaged on every registration by default
- Cross-language canonicalization parity: Python uses `ensure_ascii=False` to match JS `JSON.stringify` literal unicode output. 35 corpus tests pin the contract (edge values: unicode, -0, empty strings, nested objects, rejection of NaN/Infinity/BigInt)
- Request correlation via `requestId` prevents phantom success/failure when concurrent ops are in-flight
- Registry capped at 1000 entries; `reset_declaration_registry` command available for long-running dev servers
- 54 unit tests (declaration types, validation, digest determinism, canonicalization corpus) + 9 E2E tests (round-trip, drift detection, bare ID rejection, concurrent isolation, cross-language edge cases)
- Navigation solver certified as foundational E2E surface: declaration registered (ST-P01), solve + bundle invariants proven, registry round-trip verified
- The claim registry plumbing is wired end-to-end; production solvers do not yet register declarations by default

**Declaration registration plan** (Phase 2, from [STERLING_INTEGRATION_REVIEW.md § Review 4](./STERLING_INTEGRATION_REVIEW.md)):

| Solver | solverId | Primitives to claim | Priority | Status |
|---|---|---|---|---|
| `MinecraftNavigationSolver` | `minecraft.navigation` | ST-P01 | Done | Declaration registered + E2E verified |
| `MinecraftCraftingSolver` | `minecraft.crafting` | CB-P01 (→ ST-P01) | High | Not yet registered |
| `MinecraftToolProgressionSolver` | `minecraft.tool_progression` | CB-P01, CB-P02 (→ ST-P01) | High | Not yet registered |
| `MinecraftAcquisitionSolver` | `minecraft.acquisition` | CB-P01, CB-P04 (→ ST-P01) | Medium | Not yet registered |
| `MinecraftBuildingSolver` | `minecraft.building` | CB-P07 (→ ST-P01) | Medium | Not yet registered |
| `FurnaceSchedulingSolver` | `minecraft.furnace` | CB-P03 (→ ST-P01, ST-P02) | Low | Not yet registered; no Python domain |

Enforcement progression: DEV (structural_only=true, no rejections) → DEV+claims (log warnings) → CERTIFYING (reject unverified). See integration review for details.

**Intentional schema constraints** (documented for future reference):
- Primitive ID regex `^(CB|ST)-P\d{2}$` limits to 99 entries per namespace. If the taxonomy outgrows this, widen the regex.
- `consumesFields` and `producesFields` must be non-empty. Marker solvers or administrative domains would need a sentinel field or a V2 relaxation.
- Unicode normalization (NFC vs NFD) is not applied before canonicalization. Same-looking strings with different byte representations will hash differently. This is intentional: solver IDs should be ASCII-clean constants, and notes are cosmetic.
- Numbers in declarations are constrained to integers (`contractVersion`). Arbitrary floats are not permitted, avoiding cross-language float parity issues.

**Known deferred items**:
- `reset_declaration_registry` is server-only (no TS client method or response type yet). Add if operational tooling is needed.
- Generic server error path does not echo `requestId` for pre-handler failures (e.g., unknown command). Declaration promises will timeout rather than fail fast in this case. Acceptable trade-off: timeout is safer than phantom success.
- `reset` command does not clear the declaration registry. Declarations are server capability metadata, independent of world/solve state.

**Rule**: All primitive IDs in declarations, registries, and claim objects must be fully qualified (`CB-Pxx` or `ST-Pxx`). Bare IDs (`p01`, `P01`) are rejected.

References in this document use the **CB-Pxx** namespace unless explicitly prefixed with **ST-**.

---

## Global invariants (apply to every rig)

These are certifiability gates. Every rig must satisfy all of them before it can reach CONTRACT-CERTIFIED.

| # | Invariant | Status | Evidence | Gaps |
|---|-----------|--------|----------|------|
| 1 | **Deterministic replay** — same payload + same version = identical trace bundle hash (Regime A); cost/legality invariants under learning (Regime B) | DONE | `solve-bundle.ts` canonicalization contract; `solve-bundle.test.ts` determinism suite; E2E two-solve identity test. See "Two replay regimes" below. | Regime B tests (learning-sensitive, cost within epsilon) not yet implemented — tracked as M1 prerequisite |
| 2 | **Typed operators, fail-closed legality** — operators have type/preconditions/effects; unproven legality = illegal | DONE | `compat-linter.ts` 14-check validation (11 structural + 3 acquisition-gated); `cap:` token gating in tool progression; Sterling backend fail-closed expansion | None |
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

### Two replay regimes (invariant 1 refinement)

"Replay verifies identical plan" is a stronger condition than needed for most benefits, and becomes false as soon as learning produces different tie-breaking. The correct discipline is two regimes (from [STERLING_INTEGRATION_REVIEW.md § Review 3](./STERLING_INTEGRATION_REVIEW.md)):

**Regime A — Structural determinism (certification runs)**: With the same payload + same `engine_commitment` + same `operator_registry_hash` + same value model ref, Sterling returns the same `trace_bundle_hash`. This is what certification and golden-master tests use.

**Regime B — Semantic determinism (learning-enabled runs)**: With learning enabled, plan variation among cost-equal solutions is allowed. Enforce:
- **Reachable set unchanged**: `definitionHash` equality + operator closure hash equality across all episodes
- **Optimality unchanged**: plan cost within epsilon (or exactly equal if costs are integers)
- **Legality unchanged**: every step in the returned plan verifies against the operator set

Regime A tests use `trace_bundle_hash` equality. Regime B tests use cost/legality invariants. Current tests (A.5 convergence) prove Regime A stability. Regime B tests require the M1 learning-sensitive benchmark (problems with multiple near-tied plans).

### Failure taxonomy (from integration review, not yet wired)

The integration review defines a unified failure taxonomy with 9 typed classes and update channels. This is the canonical `EpisodeFailureClass` enum (from [STERLING_INTEGRATION_REVIEW.md § Review 5](./STERLING_INTEGRATION_REVIEW.md)). The `failure_class` field is Phase 2 wire work.

| `EpisodeFailureClass` value | Where it lives | Update channel | Currently represented in CB |
|---|---|---|---|
| `EXECUTION_SUCCESS` | Executor (runtime) | `cost_update_channel` | `solved: true` + `report_episode` |
| `ILLEGAL_TRANSITION` | Planner (preflight) | None — solve never starts | `CompatReport.issues` with `severity: 'error'` |
| `PRECONDITION_UNSATISFIED` | Planner (search) | None — no plan to execute | `solved: false` + `terminationReason: 'frontier_exhausted'` |
| `SEARCH_EXHAUSTED` | Planner (search) | `ordering_hint_channel` (future) | `terminationReason: 'max_nodes'` |
| `EXECUTION_FAILURE` | Executor (runtime) | `cost_update_channel` | Task-level failure (`task.status = 'failed'`) |
| `STRATEGY_INFEASIBLE` | Planner (Rig D) | None — filtered before solve | `CompatReport` issue code `ACQUISITION_NO_VIABLE_STRATEGY` |
| `DECOMPOSITION_GAP` | Planner (Rig E) | None — macro level, not search | `decomposition_gap` in edge decomposer |
| `SUPPORT_INFEASIBLE` | Planner (Rig G) | None — structural constraint | `RigGSignals.feasibilityViolations` |
| `HEURISTIC_DEGENERACY` | Planner (diagnostic) | `ordering_hint_channel` (future) | `DegeneracyReport.isDegenerate` + `reasons` |

**Update channels** (from integration review):

| Channel | What it accepts | What it changes | Invariant preserved |
|---|---|---|---|
| `cost_update_channel` | Execution-grounded outcomes only | Strategy priors, transition cost estimates | Invariant 5: only executed outcomes update priors |
| `ordering_hint_channel` (future) | Planner-level signals (repeated `SEARCH_EXHAUSTED`, `HEURISTIC_DEGENERACY`) | Priority queue ordering, exploration bias | Invariant 4: no invented transitions, no changed semantics |

The `ordering_hint_channel` is named but not implemented. Even without implementation, naming it in the taxonomy prevents future ambiguity about where planner feedback should flow.

### Typed bridge edges (Phase 3, from integration review)

Cross-domain orchestration today is TS-level stitching (Rigs B, D, E, G). The integration review defines 5 typed bridge edges as first-class evidence artifacts:

| Bridge | From → To | Status |
|--------|-----------|--------|
| `acquire_for_craft` | acquisition (D) → crafting (A) | Implicit in acquisition solver delegation |
| `craft_for_build` | crafting (A) → building (G) | Implicit in building material acquisition |
| `navigate_for_acquire` | navigation (E) → acquisition (D) | Not wired |
| `craft_for_tier` | crafting (A) → tool progression (B) | Implicit in tier decomposition |
| `acquire_for_tier` | acquisition (D) → tool progression (B) | Not wired |

Formalizing these as content-addressed artifacts (precondition/postcondition witnesses, referenced `trace_bundle_hash` per segment) is Phase 3 work. The acceptance test: "single solve call emits a plan with mixed-domain steps; replay verifies identical plan under fixed seed/inputs."

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

| Rig | Primitives | Contract | E2E | E2E Coverage | Track |
|-----|-----------|----------|-----|-------------|-------|
| **A**: Inventory transformation | CB-P1, 16, 17, 19, 20 | CONTRACT-CERTIFIED | E2E-PROVEN | {crafting} | Track 1 |
| **B**: Capability gating | CB-P2, 16, 19, 20 | CONTRACT-CERTIFIED | PARTIAL | {crafting via delegation}. Tier decomposition is TS-only; per-tier crafting solves hit Python. | Track 1 |
| **C**: Temporal planning | CB-P3, 16, 17, 18, 19 | CONTRACT-CERTIFIED | NONE | No furnace domain in Python. All temporal enrichment, batching, parallel slot proofs are TS-only with mocked Sterling. | Track 1 |
| **D**: Multi-strategy acquisition | CB-P4, 17, 18, 19, 20 | CONTRACT-CERTIFIED | E2E-PROVEN | {mine, trade, loot, salvage}. All strategies proven via `STERLING_E2E=1` (7/7 tests). mcData threaded from planner. | Track 2 |
| **E**: Hierarchical planning | CB-P5, 16, 17, 19 | CONTRACT-CERTIFIED | NONE | No hierarchical macro planner in Python. World graph, edge decomposition, feedback loop all TS-only. | Track 2 |
| **F**: Valuation under scarcity | CB-P6, 16, 17, 18, 19 | CONTRACT-CERTIFIED | NONE | TS-local (no Sterling backend). Pure decision module with content-addressed hashing. | Track 2 |
| **G**: Feasibility + partial order | CB-P7, 16, 17, 19 | CONTRACT-CERTIFIED | PARTIAL | {building via module sequencing}. Python `building_domain.py` exists; E2E building test in `solver-class-e2e.test.ts`. DAG builder, constraint model, partial-order plan are TS additions not exercised by Python search. | Track 2 |
| **H**: Systems synthesis | CB-P8, 14, 16, 19 | CONTRACT-CERTIFIED | NONE | TS-local (no Sterling design domain). P08 capsule types, reference adapter, reference fixtures (2 domains), Minecraft synthesis module (farm specs). 37 certification tests pass. | Track 3 |
| **I**: Epistemic planning | CB-P11, 13, 17, 19 | CONTRACT-CERTIFIED | NONE | TS-local (no Sterling epistemic domain). P11 capsule types, reference adapter, reference fixtures (2 domains), Minecraft epistemic module (hypotheses, probes, evidence). 36 certification tests pass. | Track 2 |
| **J**: Invariant maintenance | CB-P12, 17, 18, 19 | CONTRACT-CERTIFIED | NONE | TS-local (no Sterling maintenance domain). P12 capsule types, reference adapter, reference fixtures (2 domains), Minecraft invariant module (metrics, operators). 39 certification tests pass. | Track 2 |
| **K**: Irreversibility | CB-P13, 19, 20 | CONTRACT-CERTIFIED | NONE | TS-local (no Sterling commitment domain). P13 capsule types, reference adapter, reference fixtures (2 domains), Minecraft commitment module (tags, verifications, constraints). 36 certification tests pass. | Track 3 |
| **L**: Contingency planning | CB-P9, 18, 19 | NOT STARTED | NONE | — | Later |
| **M**: Risk-aware planning | CB-P10, 17, 18, 19 | NOT STARTED | NONE | — | Later |
| **N**: Fault diagnosis | CB-P11, 15, 19 | CONTRACT-CERTIFIED | NONE | TS-local (no Sterling diagnosis domain). P15 capsule types (wraps P11), reference adapter, reference fixtures (2 domains), Minecraft farm faults module. 45 certification tests pass. | Track 4 |

### Python solver domain inventory

Three Python solver domains exist in `sterling/scripts/eval/`. This is the complete set of domains that the TS solvers can call over the wire.

| Python domain | File | TS solver(s) | Used by rigs |
|--------------|------|-------------|-------------|
| Minecraft crafting | `minecraft_domain.py` | `MinecraftCraftingSolver`, `MinecraftToolProgressionSolver` (delegation), `MinecraftAcquisitionSolver` (all strategies) | A, B, D (mine proven; trade/loot/salvage ready, untested) |
| Minecraft building | `building_domain.py` | `MinecraftBuildingSolver` | G |
| Navigation | `navigation_domain.py` | `MinecraftNavigationSolver` | Certified: R2 bundle evidence, declaration registered (ST-P01), cross-language digest parity proven |

Domains that do **not** exist in Python: furnace/temporal (C), hierarchical macro planner (E), valuation (F), and all later rigs.

> **Key finding (2026-02-02)**: `minecraft_domain.py`'s `requires` field is a generic inventory multiset check (line 281–284). Any token name — including `proximity:villager`, `proximity:container:chest` — is checked against `inventory.get(name, 0) >= count` and NOT consumed on rule application. This means `acq:trade:*`, `acq:loot:*`, and `acq:salvage:*` rules (all `actionType: 'craft'`) work natively in the Python solver with zero code changes. Context tokens just need to be injected into the initial inventory dict. No separate "acquisition domain" is needed in Python.

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
| Compat linter (14 checks) | DONE | `compat-linter.ts` | 9 original + INVALID_BASE_COST + FURNACE_OVERCAPACITY + TRADE_REQUIRES_ENTITY + ACQ_FREE_PRODUCTION + ACQUISITION_NO_VIABLE_STRATEGY |
| SearchHealth accumulator (Python) | DONE | `sterling/core/search_health.py` | Welford O(1) variance, `searchHealthVersion: 1` |
| SearchHealth parser + degeneracy detection (TS) | DONE | `search-health.ts` | Version check, partial-field warning, 3 degeneracy thresholds |
| searchHealth end-to-end emission | DONE | Python A* loops → unified server → TS parser | Verified: wooden pickaxe healthy, iron tier degenerate |
| Episode reporting (execution credit) | DONE | `base-domain-solver.ts` | Fire-and-forget with planId gate |
| Payload-equivalence snapshots | DONE | `solver-golden-master.test.ts` | Crafting + building + tool progression + furnace canonical snapshots |
| E2E solver-class tests | DONE | `solver-class-e2e.test.ts` | 5 tests against live Sterling (gated `STERLING_E2E=1`) |
| Unknown-domain fail-closed error | DONE | `sterling_unified_server.py` | `STERLING_ALLOW_DOMAIN_FALLBACK` gate |
| contractVersion wire protocol | DONE | crafting solver, unified server | Warning on missing; rejection gate ready |
| ObjectiveWeights declaration | DONE | `solve-bundle-types.ts`, `solve-bundle.ts` | Captured in SolveBundleInput; not on wire yet |
| SolveRationale explanation | DONE | `solve-bundle-types.ts`, `solve-bundle.ts` | Populated when maxNodes provided; backward-compat |
| SolveRationale wired into solvers | DONE | All 3 solver files (7 call sites) | `buildDefaultRationaleContext()` helper; 3 tests (1/solver) |
| Inventory count-capping | DONE | `solve-bundle.ts` `INVENTORY_HASH_CAP=64` | Prevents state explosion from stockpiling |
| Performance baselines (A.5) | DONE | `performance-baseline-e2e.test.ts` | 6 E2E tests: 3 baseline + 3 convergence; artifacts in `__artifacts__/` |

---

## Identity chain infrastructure (cross-cutting, 2026-02-02)

The three-step identity chain connects CB solve evidence to Sterling search evidence without entangling identity computation. This is the Phase 1 deliverable from [STERLING_INTEGRATION_REVIEW.md](./STERLING_INTEGRATION_REVIEW.md).

### What's wired

| Component | Status | Location (CB) | Location (Sterling) | Evidence |
|-----------|--------|---------------|--------------------|---------|
| `trace_bundle_hash` emission | DONE | `parseSterlingIdentity()` in `solve-bundle.ts` | `minecraft_domain.py`, `building_domain.py`, `navigation_domain.py` — emitted in `metrics` dict | E2E: 13 tests under `STERLING_E2E=1`; wire-shape lock test in `solve-bundle.test.ts` |
| `engine_commitment` emission | DONE | Parsed via `parseSterlingIdentity()` | All 3 domain solvers | Same E2E coverage |
| `operator_registry_hash` emission | DONE | Parsed via `parseSterlingIdentity()` | All 3 domain solvers | Same E2E coverage |
| `episode_hash` in `report_episode` response | DONE | `reportEpisodeResult()` in `base-domain-solver.ts` | `sterling_unified_server.py` + episode chain | E2E identity loop test: solve → report → verify hash |
| `bundleHash` content addressing | DONE | `computeBundleHash()` in `solve-bundle.ts` | N/A (CB-only artifact) | Determinism suite in `solve-bundle.test.ts` |
| Wire-shape lock | DONE | `solve-bundle.test.ts` | N/A | Identity fields in `metrics` only, not top-level. `parseSterlingIdentity(result.metrics)` finds them; `parseSterlingIdentity(result)` does not. |
| `bindingHash` computed | DONE | `contentHash("binding:v1:" + traceBundleHash + ":" + bundleHash)` in `solve-bundle.ts` | N/A | Unit test: deterministic given same inputs |
| `bindingHash` persisted/exported | PENDING | Will be stored in `SolveBundleOutput.sterlingIdentity.bindingHash` | N/A | Computation exists; storage not yet wired to persistent output |
| `SterlingIdentity` type + `attachSterlingIdentity` | DONE | `solve-bundle.ts` | N/A | `sterlingIdentity` excluded from `bundleHash` computation (test) |

### Hash coupling policy

Sterling's identity hashes (`trace_bundle_hash`, `episode_hash`) are computed from Sterling-native commitments only. CB's `bundleHash` never participates in any Sterling hash computation. Sterling stores `bundle_hash` as an `external_ref` alongside the episode record.

The cryptographic link is `bindingHash = contentHash("binding:v1:" + traceBundleHash + ":" + bundleHash)`, computed on the CB side. `contentHash` is `sha256(utf8(input))` truncated to 16 hex chars. The `"binding:v1:"` prefix and `":"` separator make the encoding unambiguous and version-tagged. This is the regression test anchor. It is not sent to Sterling.

**Drift classification** (from integration review):
- `bundleHash` changed → CB solver change (intentional refactor or regression)
- `trace_bundle_hash` changed with same `bundleHash` → Sterling search drift
- `episode_hash` changed with same `trace_bundle_hash` → Sterling execution chain drift
- `bindingHash` changed → either side; decompose via above

### Pending items

| Item | Priority | Blocking? |
|------|----------|-----------|
| `completeness_declaration` in `complete` message | Phase 2 | No — additive field, Sterling-authored |
| `failure_class` enum in `report_episode` | Phase 2 | No — additive field, 9-value enum (see failure taxonomy below) |
| `bundle_hash` + `trace_bundle_hash` in `report_episode` request body | Phase 2 | No — Sterling already accepts extra fields |

---

## Episode resilience infrastructure (cross-cutting, 2026-02-02)

The `report_episode` path is hardened against failures at two levels: domain-level learning failures and server-level handler exceptions.

### Domain-level: learning is best-effort

All three Python solver domains wrap `path_algebra.process_path()` and `penalize_dead_end_edge()` in try/except guards. Learning failures produce warnings but never prevent `episode_reported` + `episode_hash` from being returned.

| Domain | File | Guarded calls in `apply_episode_result()` | Evidence |
|--------|------|------------------------------------------|----------|
| Minecraft crafting | `scripts/eval/minecraft_domain.py` | `process_path()`, `penalize_dead_end_edge()` | 2 tests in `test_episode_identity.py` |
| Building | `scripts/eval/building_domain.py` | `process_path()`, `penalize_dead_end_edge()` | 1 test in `test_episode_identity.py` |
| Navigation | `scripts/eval/navigation_domain.py` | `process_path()` | 1 test in `test_episode_identity.py` |

Root cause addressed: `ValueError: Node {id} not found` when `path_algebra.process_path()` encounters action-suffixed node IDs (e.g., `oak_planks:4|action:5ce4fed12345`) not registered in the KG. The warning message logged is `"path_algebra.process_path skipped for plan %s: %s"`. Previously this exception propagated to `handle_connection()`, closing the WebSocket.

### Server-level: exception → error response + connection liveness

`sterling_unified_server.py` wraps the entire `report_episode` domain dispatch in try/except. On exception:
1. Logs error with traceback (`logger.error(..., exc_info=True)`)
2. Sends `{"type": "error", "code": "episode_error", "message": "...", "domain": "..."}` to the client
3. Continues the message loop (`continue`) — connection stays alive

### Regression tests

| Test | File | What it proves |
|------|------|---------------|
| `test_minecraft_report_succeeds_despite_learning_crash` | `tests/unit/test_episode_identity.py` | Minecraft domain: `episode_hash` returned despite KG node miss |
| `test_building_report_succeeds_despite_learning_crash` | `tests/unit/test_episode_identity.py` | Building domain: same invariant |
| `test_navigation_report_succeeds_despite_learning_crash` | `tests/unit/test_episode_identity.py` | Navigation domain: same invariant |
| `test_minecraft_failure_penalize_survives_missing_nodes` | `tests/unit/test_episode_identity.py` | Failure path with `penalize_dead_end_edge` |
| `test_report_episode_exception_returns_episode_error` | `tests/integration/test_report_episode_resilience.py` | Monkeypatched solver raises → `episode_error` response |
| `test_connection_stays_alive_after_episode_error` | `tests/integration/test_report_episode_resilience.py` | After error, ping on same socket → pong |
| `test_valid_report_after_failed_report_succeeds` | `tests/integration/test_report_episode_resilience.py` | Valid report succeeds after failed report on same connection |

All 7 tests run in CI via `python -m pytest tests/` (the `test` job in `ci.yml`). Integration tests are additionally marked `@pytest.mark.integration` for selective execution.

---

## Rig A: Inventory transformation planning

**Contract**: CONTRACT-CERTIFIED — all certification items complete
**E2E**: E2E-PROVEN — `{crafting}`. `solver-class-e2e.test.ts` exercises crafting solver against live Sterling. SearchHealth flows. Performance baselines recorded.

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
| Fail-closed rule validation gate | `validation/rule-validator.ts` | Zod schema + semantic checks. 9 unit tests. Wired before Sterling call in crafting solver |
| Deterministic trace hashing | `solve-bundle.ts` (`computeTraceHash`) | Content-addressed hash from deterministic fields only. 4 tests in `certification-rig-a.test.ts` |
| Execution-based credit manager | `credit/credit-manager.ts` | `CreditManager` class. Priors update only via execution reports. 6 tests |
| Audit-grade explanations | `audit/explanation-builder.ts` | `buildExplanation()` + `buildRejectionExplanation()`. Wired into solver success + failure paths |
| Solver validation gate wiring | `minecraft-crafting-solver.ts` | Validation before Sterling, trace hash after solve, explanation on both paths |
| End-to-end certification suite | `certification-rig-a.test.ts` | 8 tests covering all 5 certification gates |

### What's needed for certification

- [x] **A.1 — Composite goal test**: Wire payload `goal` supports `Record<string, number>` composites. `canonicalize({stick: 4, crafting_table: 1})` produces deterministic output.
- [x] **A.2 — Substitute-allowed variant**: `buildCraftingRules()` with two recipe variants generates both variant rules. Both appear in wire payload.
- [x] **A.3 — Count-capping in inventory hash**: `INVENTORY_HASH_CAP = 64`. Three tests: above-cap equal, below-cap differs, at-cap equals above-cap.
- [x] **A.4 — Explanation skeleton**: `SolveRationale` type, `computeBundleOutput` populates it when `maxNodes` provided. Backward-compatible (undefined without maxNodes). 4 tests.
- [x] **A.5 — Performance baseline**: `performance-baseline-e2e.test.ts` — 6 E2E tests (gated `STERLING_E2E=1`) recording nodesExpanded, frontierPeak, terminationReason, solutionPathLength, branchingEstimate for stick (raw WS), wooden_pickaxe, and stone_pickaxe (per-tier, both solver-class). Learning **stability** tests prove `nodesExpanded2 <= nodesExpanded1 * 1.05` after episode report. Note: convergence ratios of exactly 1.0 demonstrate stability (no regression), not efficacy (learning improves search). Learning efficacy requires a separate learning-sensitive benchmark. Artifact JSONs committed to `__artifacts__/perf-baseline-*.json` and `perf-convergence-*.json` with full `ArtifactMeta` (gitSha, clientPathway, solverId, executionMode, contractVersion, maxNodes, objectiveWeights).
- [x] **A.6 — Transfer test skeleton**: `transfer-bom-assembly.test.ts` — non-Minecraft BOM domain (gadget_assembled, widget_refined, widget_raw). Linter, hashing, bundle capture all work. 5 tests.
- [x] **A.7 — Fail-closed rule validation gate (Rig A hardening)**: `rule-validator.ts` — Zod schema + semantic checks (DUPLICATE_ACTION, INVALID_PRODUCTION, CONSUME_EXCEEDS_REQUIRE, SELF_LOOP warning, UNBOUNDED_DELTA). Wired into `minecraft-crafting-solver.ts` before Sterling call. Invalid rules return `validationErrors` without reaching Sterling. 9 unit tests in `rule-validator.test.ts`.
- [x] **A.8 — Deterministic trace hashing (Rig A hardening)**: `computeTraceHash()` in `solve-bundle.ts` — content-addressed hash from deterministic fields only (definitionHash, initialStateHash, goalHash, solved, stepsDigest). Excludes totalNodes, durationMs, planId, timestamp. `traceHash` field added to `SolveBundleOutput`. 4 determinism tests in `certification-rig-a.test.ts`.
- [x] **A.9 — Execution-based credit assignment (Rig A hardening)**: `CreditManager` in `credit-manager.ts` — priors update ONLY via `reportExecutionOutcome()`, never on plan success. Reinforce +0.1, penalize -0.2 (asymmetric bias toward caution). Clamped to [0.01, 10.0]. Audit log. `computeCreditUpdates()` pure function. 6 tests in `credit-manager.test.ts`.
- [x] **A.10 — Audit-grade explanations (Rig A hardening)**: `buildExplanation()` in `explanation-builder.ts` — generates `SolveExplanation` with constraintsSummary, validationReport, solutionSummary, compatSummary. Also `buildRejectionExplanation()` for validation failures. Wired into solver on both success and failure paths. Tested in `certification-rig-a.test.ts`.
- [x] **A.11 — End-to-end certification (Rig A hardening)**: `certification-rig-a.test.ts` — 8 tests covering all 5 gates: validation rejection, deterministic trace hashing (4 cases), validation gate integration (3 cases), end-to-end certification (1 case exercising all gates in sequence).

---

## Rig B: Capability gating and legality

**Contract**: CONTRACT-CERTIFIED | HARDENING-COMPLETE — full tier progression with certification tests + Rig A gates (validation, trace hash, explanations)
**E2E**: PARTIAL — `{crafting via per-tier delegation}`. Each tier's crafting solve hits Python `minecraft_domain.py`. Tier decomposition logic is TS-only. `solver-class-e2e.test.ts` iron-tier test exercises 3 bundles with distinct goalHash and searchHealth per tier.

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
- [x] **B.4 — Validation gate (Rig A hardening)**: `validateRules()` gate added to tool-progression solver before Sterling call. `checkCapabilityConsistency: true` enables MINE_TIERGATED_NO_CAP and UNKNOWN_CAP_ATOM checks. 6 tests in `certification-rig-b.test.ts`.
- [x] **B.5 — Trace hashing + explanations**: `computeTraceHash()` and `buildExplanation()` wired to all tool-progression solver return paths (success, failure, degraded). `ToolProgressionSolveResult.solveMeta` extended with `explanation?` field.
- [x] **B.6 — Cap token integrity**: `certification-rig-b.test.ts` — 24 tests covering invariant-pattern correctness, MINE_TIERGATED_NO_CAP, UNKNOWN_CAP_ATOM, tier detection determinism, cap hygiene, validation gate integration, TIER_GATE_MATRIX integrity.

---

## Rig C: Temporal planning with durations, batching, and capacity

**Contract**: CONTRACT-CERTIFIED | HARDENING-COMPLETE — P03 capsule + temporal enrichment layer + FurnaceSchedulingSolver (C.1–C.7) all certified + Rig A gates (C.8–C.10)
**E2E**: NONE — no furnace/temporal domain in Python. All temporal enrichment, batching, parallel slot, and deadlock proofs are TS-only with mocked Sterling.

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
| FurnaceSchedulingSolver class (C.1) | `minecraft-furnace-solver.ts` | Extends `BaseDomainSolver<FurnaceSchedulingSolveResult>`. `solverId = 'minecraft.furnace'`. Full SolveBundle wiring. 12 unit tests in `furnace-solver-unit.test.ts` |
| Furnace types + state hashing (C.2) | `minecraft-furnace-types.ts` | `FurnaceSlotState`, `FurnaceSearchState`, `hashFurnaceState()`. Hash excludes nondeterministic fields. 10 tests in `furnace-state.test.ts` |
| Operator families + linter (C.3) | `minecraft-furnace-rules.ts`, `compat-linter.ts` | 4 operator families (load_furnace, add_fuel, wait_tick, retrieve_output). `FURNACE_OVERCAPACITY` check (11th linter check). 15 tests in `furnace-operators.test.ts` |
| Batching proof (C.4) | `furnace-batching-proof.test.ts` | Batch plan vs sequential — optimal path length ≤ suboptimal. `preferBatch` threshold. 6 tests |
| Parallel slot proof (C.5) | `furnace-parallel-slots.test.ts` | 2 furnaces, 4 items: parallel makespan < sequential. No double-booking. 5 tests |
| Golden-master snapshot (C.6) | `solver-golden-master.test.ts` (furnace section), `furnace-golden-master.test.ts` | R3 payload snapshot, byte-equivalent payloads, R4 deterministic bundleId. 9 tests total |
| Transfer test — job shop (C.7) | `transfer-job-shop.test.ts` | Generic job shop domain (welders, lathes). Zero Minecraft imports. 13 tests |

> **Note**: The P03 capsule (`packages/planning/src/sterling/primitives/p03/`) and temporal modules (`packages/planning/src/temporal/`) are currently untracked in git. The e2e test file was committed (`dfaec57`). The remaining untracked directories should be committed as part of the next Rig C PR.

### Certification checklist

- [x] **C.1 — FurnaceSchedulingSolver class**: `minecraft-furnace-solver.ts` extends `BaseDomainSolver<FurnaceSchedulingSolveResult>`. `solverId = 'minecraft.furnace'`. SolveBundle wired. R1 bundle shape verified. R4 deterministic bundleId. Unavailable result path tested.

- [x] **C.2 — Time-discretized state representation**: `minecraft-furnace-types.ts` defines `FurnaceSlotState`, `FurnaceSearchState`. `hashFurnaceState()` using canonicalize + contentHash. Hash excludes nondeterministic fields (`fuelRemaining`, `smeltProgress`, `timestamp`). Bucket quantization consistent with `MINECRAFT_BUCKET_SIZE_TICKS`.

- [x] **C.3 — Operator families**: Rule builder generates 4 operator families per smeltable item. Preconditions enforce capacity. Compat linter extended with `FURNACE_OVERCAPACITY` check (11th check, gated behind `solverId === 'minecraft.furnace'`).

- [x] **C.4 — Batching proof**: Batch plan (load x4 → wait → retrieve x4) vs sequential — optimal `solutionPathLength` ≤ suboptimal. `preferBatch` returns `useBatch=true` for count ≥ threshold.

- [x] **C.5 — Parallel slot proof**: 2 furnaces, 4 items. Plan assigns across both. Parallel makespan < sequential makespan. No slot double-booking. Deterministic slot selection.

- [x] **C.6 — Golden-master snapshot**: `solver-golden-master.test.ts` furnace section + dedicated `furnace-golden-master.test.ts`. R3 canonical payload snapshot. R3 byte-equivalent payloads. R4 deterministic bundleHash.

- [x] **C.7 — Transfer test**: `transfer-job-shop.test.ts` — generic job shop domain (welders, lathes) with slot occupancy semantics. P03TemporalAdapter + SolveBundle infrastructure. Zero Minecraft imports.

- [x] **C.8 — Validation gate (Rig A hardening)**: `validateRules()` gate added to furnace solver before Sterling call. Invalid rules rejected fail-closed. 3 tests in `certification-rig-c.test.ts`.

- [x] **C.9 — Trace hashing + explanations**: `computeTraceHash()` and `buildExplanation()` wired to all furnace solver return paths (success, error). `FurnaceSchedulingSolveResult.solveMeta` extended with `explanation?` field. 4 tests in `certification-rig-c.test.ts`.

- [x] **C.10 — Certification suite**: `certification-rig-c.test.ts` — 24 tests covering: furnace rule validation, trace hash determinism, duration model integrity, deadlock prevention, batch preference, temporal state determinism, furnace solve explanations, smeltable items registry.

---

## Rig I: Epistemic planning (belief-state and active sensing)

**Contract**: CONTRACT-CERTIFIED — P11 capsule + reference adapter + 2-domain fixtures + Minecraft epistemic module + 36 certification tests
**E2E**: NONE — no epistemic planning domain in Python. All belief state, probe selection, and entropy tracking are TS-only.

### What's done

| Item | File | Evidence |
|------|------|----------|
| P11 capsule contract types (domain-agnostic) | `sterling/primitives/p11/p11-capsule-types.ts` | `P11BeliefStateV1`, `P11EpistemicAdapter`, `P11ProbeOperatorV1`, `P11HypothesisV1`; 5 invariants (discrete_buckets, bounded_hypotheses, discriminative_probe, confidence_gate, deterministic_update); `ProbBucket` discrete quantization; `toProbBucket()` |
| Reference adapter (domain-agnostic) | `sterling/primitives/p11/p11-reference-adapter.ts` | `P11ReferenceAdapter` satisfying all 5 invariants. Shannon entropy, Bayesian update with normalization, information gain via simulated posteriors, deterministic tie-breaking |
| Reference fixtures (2 domains) | `sterling/primitives/p11/p11-reference-fixtures.ts` | Structure localization domain (4 hypotheses + 4 probes) + fault diagnosis domain (4 hypotheses + 4 probes) for portability |
| Minecraft hypothesis definitions | `epistemic/minecraft-hypotheses.ts` | `VILLAGE_HYPOTHESES`, `TEMPLE_HYPOTHESES`, `DIAMOND_DEPTH_HYPOTHESES` — domain-specific hypothesis sets |
| Minecraft probe operators | `epistemic/minecraft-probes.ts` | `MINECRAFT_STRUCTURE_PROBES` (4), `MINECRAFT_MINING_PROBES` (3) — sensing actions with cost vectors |
| Minecraft evidence extraction | `epistemic/minecraft-evidence.ts` | `makeBiomeEvidence()`, `makeMobMixEvidence()`, `makeVantageEvidence()`, `makeDepthCheckEvidence()`, etc. |
| Certification test suite | `sterling/__tests__/certification-rig-i.test.ts` | 36 tests across 9 describe blocks |

### Certification checklist

- [x] **I.1 — P11 capsule types**: Domain-agnostic types for belief state, hypotheses, probes, evidence, confidence check, belief update. 5 invariants defined. `ProbBucket` type (11 discrete values: 0.0–1.0). `toProbBucket()` deterministic snapping. `MAX_HYPOTHESES = 32`. Capability descriptor with contract version `p11.v1`.

- [x] **I.2 — Reference adapter**: `P11ReferenceAdapter` implements all `P11EpistemicAdapter` methods. `initializeBelief()` with uniform distribution + cap enforcement. `calculateEntropy()` (Shannon). `computeLikelihood()` feature-matching. `updateBelief()` with Bayesian normalization + `toProbBucket()`. `expectedInfoGain()` via simulated posteriors. `selectProbe()` with net score + lexicographic tie-break. `checkConfidence()` with deterministic best-hypothesis selection.

- [x] **I.3 — Reference fixtures (2 domains)**: Structure localization domain (villages, 4 hypotheses, 4 probes, evidence factory). Fault diagnosis domain (component failures, 4 hypotheses, 4 probes, evidence factory). Proves P11 capsule portability across domains.

- [x] **I.4 — Minecraft epistemic module**: `VILLAGE_HYPOTHESES` (5 hypotheses), `TEMPLE_HYPOTHESES` (4), `DIAMOND_DEPTH_HYPOTHESES` (3). `MINECRAFT_STRUCTURE_PROBES` (4 operators), `MINECRAFT_MINING_PROBES` (3 operators). Evidence extraction helpers for biome, mob mix, vantage, terrain, depth, ore.

- [x] **I.5 — Certification suite**: `certification-rig-i.test.ts` — 36 tests covering: discrete probability buckets (Pivot 1, 5 tests), bounded hypothesis set (Pivot 2, 4 tests), discriminative probe selection (Pivot 3, 5 tests), confidence threshold gate (Pivot 4, 4 tests), deterministic belief update (Pivot 5, 3 tests), entropy reduction (4 tests), multi-domain portability (5 tests), Minecraft module integration (3 tests), P11 invariants registry (3 tests).

---

## Rig J: Invariant maintenance (receding-horizon control)

**Contract**: CONTRACT-CERTIFIED — P12 capsule + reference adapter + 2-domain fixtures + Minecraft invariant module + 39 certification tests
**E2E**: NONE — no invariant-maintenance domain in Python. All drift projection, horizon scheduling, and metric bucketing are TS-only.

### What's done

| Item | File | Evidence |
|------|------|----------|
| P12 capsule contract types (domain-agnostic) | `sterling/primitives/p12/p12-capsule-types.ts` | `P12InvariantVectorV1`, `P12InvariantAdapter`, `P12MetricSlotV1`, `P12MaintenanceOperatorV1`; 5 invariants (metric_buckets, deterministic_drift, hazard_exclusion, bounded_horizon, proactive_emission); `MetricBucket` discrete type; `toMetricBucket()` |
| Reference adapter (domain-agnostic) | `sterling/primitives/p12/p12-reference-adapter.ts` | `P12ReferenceAdapter` satisfying all 5 invariants. Deterministic drift projection, violation projection with bounded horizon, operator application with clamping, proactive scheduling at 80% of warn time, deterministic tie-breaking |
| Reference fixtures (2 domains) | `sterling/primitives/p12/p12-reference-fixtures.ts` | Minecraft survival domain (6 slots + 6 operators + 6 drift rates) + vehicle maintenance domain (4 slots + 4 operators + 4 drift rates) for portability |
| Minecraft metric definitions | `invariant/minecraft-metrics.ts` | `MINECRAFT_METRIC_SLOTS` (6 slots: food, health, tool, light, threat, night), `MINECRAFT_DRIFT_RATES` (per-metric decay) |
| Minecraft maintenance operators | `invariant/minecraft-operators.ts` | `MINECRAFT_MAINTENANCE_OPERATORS` (6 operators: eat, heal, repair, torches, retreat, shelter) |
| Certification test suite | `sterling/__tests__/certification-rig-j.test.ts` | 39 tests across 9 describe blocks |

### Certification checklist

- [x] **J.1 — P12 capsule types**: Domain-agnostic types for invariant vector, metric slots, drift rates, violation projections, maintenance operators, scheduled maintenance, maintenance schedule. 5 invariants defined. `MetricBucket` type (5 integer buckets: 0–4). `toMetricBucket()` deterministic snapping. `MAX_HORIZON_TICKS = 600`. `NUM_BUCKETS = 5`. Capability descriptor with contract version `p12.v1`.

- [x] **J.2 — Reference adapter**: `P12ReferenceAdapter` implements all `P12InvariantAdapter` methods. `initializeVector()` at full bucket. `toBucket()` with range-based conversion. `projectDrift()` with hazard exclusion and horizon bounding. `projectViolations()` with warn/critical threshold computation. `applyOperator()` with clamped restore. `scheduleMaintenance()` with proactive scheduling (80% of warn time), deterministic operator selection (lowest cost + lexicographic tie-break).

- [x] **J.3 — Reference fixtures (2 domains)**: Minecraft survival domain (6 slots: food_level, health_level, tool_durability, light_coverage, threat_exposure, time_to_night; 6 operators; 6 drift rates). Vehicle maintenance domain (4 slots: fuel_level, oil_quality, tire_pressure, engine_temp; 4 operators; 4 drift rates). Proves P12 capsule portability across domains.

- [x] **J.4 — Minecraft invariant module**: `MINECRAFT_METRIC_SLOTS` (6 metrics with ranges, thresholds, drift flags). `MINECRAFT_DRIFT_RATES` (per-metric decay; threat_exposure = 0 for external). `MINECRAFT_MAINTENANCE_OPERATORS` (6 restore actions with cost vectors).

- [x] **J.5 — Certification suite**: `certification-rig-j.test.ts` — 39 tests covering: metric buckets (Pivot 1, 5 tests), deterministic drift (Pivot 2, 4 tests), hazard exclusion (Pivot 3, 4 tests), bounded horizon (Pivot 4, 4 tests), proactive emission (Pivot 5, 4 tests), operator application (4 tests), multi-domain portability (5 tests), Minecraft module integration (4 tests), P12 contract metadata (5 tests).

---

## Rig H: Systems synthesis (design-space search)

**Contract**: CONTRACT-CERTIFIED — P08 capsule + reference adapter + 2-domain fixtures + Minecraft synthesis module + 37 certification tests
**E2E**: NONE — no design-synthesis domain in Python. All design state, spec evaluation, motif extraction, and symmetry canonicalization are TS-only.

### What's done

| Item | File | Evidence |
|------|------|----------|
| P08 capsule contract types (domain-agnostic) | `sterling/primitives/p08/p08-capsule-types.ts` | `P08DesignStateV1`, `P08SynthesisAdapter`, `P08DesignOperatorV1`, `P08BehavioralSpecV1`, `P08MotifV1`; 5 invariants (deterministic_evaluation, bounded_design, symmetry_canonicalization, spec_predicate, bounded_motifs); `MAX_DESIGN_NODES = 100`; `MAX_MOTIFS = 50` |
| Reference adapter (domain-agnostic) | `sterling/primitives/p08/p08-reference-adapter.ts` | `P08ReferenceAdapter` satisfying all 5 invariants. Grid-based design state, 90° rotation canonicalization via FNV-1a hash, deterministic spec evaluation, relative-coordinate motif extraction, bounded instantiation |
| Reference fixtures (2 domains) | `sterling/primitives/p08/p08-reference-fixtures.ts` | Farm layout domain (4 operators + 2 specs) + circuit design domain (4 operators + 1 spec) for portability |
| Minecraft farm specifications | `synthesis/minecraft-farm-spec.ts` | `MINECRAFT_FARM_OPERATORS` (4 operators), `MINECRAFT_FARM_SPECS` (3 specs: basic 9x9, compact 5x5, double farm) |
| Certification test suite | `sterling/__tests__/certification-rig-h.test.ts` | 37 tests across 9 describe blocks |

### Certification checklist

- [x] **H.1 — P08 capsule types**: Domain-agnostic types for design state, grid cells, operators, behavioral specs, spec results, motifs. 5 invariants defined. `P08SynthesisAdapter` interface with 7 methods. `MAX_DESIGN_NODES = 100`. `MAX_MOTIFS = 50`. Capability descriptor with contract version `p08.v1`.

- [x] **H.2 — Reference adapter**: `P08ReferenceAdapter` implements all methods. `createEmptyDesign()`. `applyOperator()` with footprint and node-count bounds. `evaluateSpec()` returning boolean predicate + violations + metrics. `hashDesign()` with 4-rotation canonicalization. `extractMotif()` with relative coordinates. `instantiateMotif()` with offset placement and bound enforcement.

- [x] **H.3 — Reference fixtures (2 domains)**: Farm layout domain (water, farmland, torch, hopper operators; basic and small specs). Circuit design domain (source, wire, gate, output operators; basic circuit spec). Proves P08 capsule portability across design domains.

- [x] **H.4 — Minecraft synthesis module**: `MINECRAFT_FARM_OPERATORS` (4 operators: water_source, farmland, torch, path). `MINECRAFT_FARM_SPECS` (3 specs: basic 9x9 with water+16 farmland+4 torches, compact 5x5, double-farm 9x18).

- [x] **H.5 — Certification suite**: `certification-rig-h.test.ts` — 37 tests covering: deterministic evaluation (Pivot 1, 4 tests), bounded design (Pivot 2, 4 tests), symmetry canonicalization (Pivot 3, 4 tests), spec predicate (Pivot 4, 4 tests), bounded motifs (Pivot 5, 6 tests — instantiation bounds enforced; `MAX_MOTIFS` is a reserved constant for future persistent motif library, not currently enforced as library size), multi-domain portability (5 tests), Minecraft module (3 tests), operator/design integration (3 tests), P08 contract metadata (4 tests).

---

## Rig G: Feasibility + partial-order structure (building)

**Contract**: CONTRACT-CERTIFIED — support constraints + reachability + scaffolding + partial-order proof + transfer test all certified
**E2E**: PARTIAL — `{building module sequencing}`. Python `building_domain.py` exists. `solver-class-e2e.test.ts` building E2E test. DAG builder, constraint model, partial-order plan, commuting pair detection are TS additions not exercised by Python search.

### What's done

| Item | File | Evidence |
|------|------|----------|
| Building solver (templateId, modules, siteState) | `minecraft-building-solver.ts` | `solver-golden-master.test.ts`: building tests |
| Module types (prep_site, apply_module, place_feature, scaffold) | `minecraft-building-types.ts` | Type definitions + `requiresModules` + `supportRequirements` + `reachabilityZone` + `isTemporary` + `RigGMode`, `RigGStageDecisions` |
| DAG builder (module dependency + support graph) | `constraints/dag-builder.ts` | Builds DAG from module `requiresModules` + `supportRequirements`. Emits dependency and support edges. Scaffold conflict keys. |
| Topological linearization | `constraints/linearization.ts` | Linearizes DAG; tested in `linearization.test.ts` |
| Feasibility checker (dependency + support + reachability) | `constraints/feasibility-checker.ts` | Validates dependency, support, and reachability constraints; tested in `feasibility-checker.test.ts` |
| Partial-order plan representation | `constraints/partial-order-plan.ts` | `ConstraintType = 'dependency' \| 'reachability' \| 'support'`; `findCommutingPairs()` for independent modules; tested in `partial-order-plan.test.ts` |
| Constraint model (dependency + support + reachability) | `constraints/constraint-model.ts` | `SupportConstraint`, `extractSupportConstraints()`, `ReachabilityZone`, `extractReachabilityConstraints()` |
| Rig G signal computation | `constraints/signals.ts` | `computeRigGSignals()` for feasibility gating |
| Execution advisor (Rig G metadata) | `constraints/execution-advisor.ts` | `RigGMetadata` type with signals, commuting pairs, partial-order plan; tested in `execution-advisor.test.ts` |
| Rig G metadata wiring in planner | `sterling-planner.ts:618-625` | Stores `RigGMetadata` (signals, commuting pairs, partial-order plan) in `taskData.metadata.solver.rigG` |
| Material deficit + replan loop | `minecraft-building-solver.ts:253-306` | Golden-master: deficit → acquisition steps + replan sentinel |
| SolveBundle wiring | Building solver | E2E: `solverId: 'minecraft.building'`, bundle shape verified |
| Episode reporting (per-module failure attribution) | `minecraft-building-solver.ts:322-340` | Captures failureAtModuleId |
| Support constraints (G.1) | `support-constraints.test.ts`, `constraint-model.ts`, `feasibility-checker.ts`, `dag-builder.ts`, `minecraft-building-solver.ts` | Wall without foundation → rejected. Wall with foundation → accepted. Support edges in DAG. Solver calls `extractSupportConstraints()`. 6 tests |
| Reachability + scaffolding (G.2 + G.4) | `reachability-scaffolding.test.ts`, `constraint-model.ts`, `minecraft-building-types.ts`, `dag-builder.ts` | Roof at height 6 / botReach 3 → infeasible. Scaffolding provides access → feasible. Scaffold conflict keys. Multi-story linearization. 5 tests |
| Partial-order proof (G.3) | `partial-order-proof.test.ts` | Independent modules form commuting pair. Both orderings valid. Adding dependency removes pair. Golden-master DAG snapshot. 5 tests |
| Transfer test — CI pipeline (G.5) | `transfer-ci-pipeline.test.ts` | Generic CI pipeline (lint, unit_test, integration_test, deploy). DAG correctness. Commuting pairs. Linearization. RigGSignals. Zero Minecraft imports. 9 tests |

### Certification checklist

- [x] **G.1 — Support constraints**: `BuildingModule.supportRequirements` field added. `SupportConstraint` type + `extractSupportConstraints()` in constraint-model. Feasibility checker handles `case 'support'`. DAG builder emits support edges from `supportRequirements`. Building solver calls `extractSupportConstraints()` and concatenates with dependency constraints. Test: wall without foundation → rejected. 6 tests.

- [x] **G.2 — Reachability checks**: `BuildingModule.reachabilityZone` field added. `extractReachabilityConstraints(modules, botReachHeight)` in constraint-model. Feasibility checker validates reachability. Test: roof at height 6, botReach=3 → infeasible without scaffolding.

- [x] **G.3 — Partial-order proof**: Golden-master test: two independent modules (window_a, door_b) form a commuting pair. Both linearization orderings are valid topological sorts. Adding a dependency removes the commuting pair. Content-addressed `planDigest` deterministic. 5 tests.

- [x] **G.4 — Scaffolding reasoning**: Module type `scaffold` added to `BuildingModuleType`. `isTemporary` field on `BuildingModule`. Scaffold conflict keys prevent commuting between scaffolds. Scaffold leaf mapping in building solver (`place_scaffold`). Multi-story build linearizes correctly: foundation → walls → scaffold → upper walls → scaffold → roof. 5 tests.

- [x] **G.5 — Transfer test**: `transfer-ci-pipeline.test.ts` — generic CI pipeline (lint + unit_test independent/commuting, integration_test depends on both, deploy depends on integration_test). DAG correct. Commuting pairs detected. Linearization valid. Feasibility passes. RigGSignals computed. Zero Minecraft imports. 9 tests.

---

## Rig E: Hierarchical planning (navigate/explore/find)

**Contract**: CONTRACT-CERTIFIED — world graph builder + edge decomposer + feedback loop + golden-master + transfer test all certified
**E2E**: NONE — no hierarchical macro planner in Python. All decomposition, feedback, and Dijkstra path planning are TS-only.

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
| World graph builder (E.1) | `hierarchical/world-graph-builder.ts` | `buildWorldGraph(input)` pure function. Registers contexts from biomes/structures/zones, edges from adjacency, requirement mappings from resources. Freezes graph. 6 tests |
| Edge decomposer (E.2) | `hierarchical/edge-decomposer.ts`, `hierarchical-planner/plan-decomposer.ts` | `DECOMPOSITION_REGISTRY` with prefix-based pattern matching. `decomposeEdge()` returns `PlanningDecision<MicroStep[]>`. Unknown edge → blocked with `decomposition_gap`. Wired into `decomposeToPlan()` via optional `botState`. 6 tests |
| Feedback integration (E.3) | `hierarchical/feedback-integration.ts` | `FeedbackIntegration` class: plan → startEdge → reportStepOutcome → completeEdge. EMA cost updates. N consecutive failures → replan. 6 tests |
| Golden-master snapshot (E.4) | `hierarchical/__tests__/macro-plan-golden-master.test.ts` | Canonical plan snapshot. Byte-equivalent plans. Content-addressed digest. Decomposed steps snapshot. 5 tests |
| Transfer test — floor plan (E.5) | `hierarchical/__tests__/transfer-floor-plan.test.ts` | Office floor plan (7 rooms, 14 hallways). Dijkstra shortest path. Feedback cost updates. Replan after failures. RigESignals. No coordinate patterns. Zero Minecraft imports. 8 tests |

### Certification checklist

- [x] **E.1 — Full domain ontology integration**: `world-graph-builder.ts` with `buildWorldGraph(input: MinecraftWorldGraphInput)`. Pure function from explicit input. Registers contexts from biome regions, edges from adjacency declarations, requirement mappings from resource zones. Graph frozen after construction. 6 tests.

- [x] **E.2 — Micro-step decomposition**: `edge-decomposer.ts` with `DECOMPOSITION_REGISTRY` and `decomposeEdge()`. Default decompositions: navigation (at_*→at_*), resource acquisition (mine, forest, iron), tool crafting, building. Unknown edge → blocked with `decomposition_gap`. Wired into `plan-decomposer.ts` via optional `botState` parameter. 6 tests.

- [x] **E.3 — Feedback loop**: `feedback-integration.ts` with `FeedbackIntegration` class. EMA cost updates from edge execution. Failed execution → penalty increase. N consecutive failures → `shouldReplan` triggers. Replan produces different path after cost change. Full plan→execute→feedback→replan cycle tested. 6 tests.

- [x] **E.4 — Golden-master snapshot**: `macro-plan-golden-master.test.ts`. Deterministic plan for fixed world graph + goal matches canonical snapshot. Identical inputs → byte-equivalent plans. Content-addressed `planDigest`. Decomposed steps match canonical snapshot. 5 tests.

- [x] **E.5 — Transfer test**: `transfer-floor-plan.test.ts` — office floor plan domain (7 rooms, 14 hallways). Dijkstra finds shortest path. Feedback updates hallway costs. Replan after repeated failures. RigESignals computed correctly. No coordinate patterns in abstract room IDs. Zero Minecraft imports. 8 tests.

---

## Rig D: Multi-strategy acquisition (mine/trade/loot/salvage)

**Contract**: CONTRACT-CERTIFIED — coordinator solver + strategy enumeration + ranking + priors + hardening + golden-master + transfer test implemented. mcData threaded from planner → acquisition solver → crafting solver (same ownership pattern as Rig A). Mine strategy gated on mcData structural validity via `isValidMcData()` predicate (dependency gate, not world constraint). `buildCraftingRules` has fail-fast `MISSING_MCDATA` guard using the same predicate — truthy-but-malformed values (`{}`) are rejected identically to `undefined`. Context token injection is observation-derived (not rule-scanning). `contextTokensInjected` audit field on child bundles.
**E2E**: E2E-PROVEN — `{mine, trade, loot, salvage}` all proven (mine: 2026-02-02, trade/loot/salvage: 2026-02-01). 7/7 E2E tests pass under `STERLING_E2E=1`. Mine delegation exercises crafting solver → Python with mcData injected. Fail-closed behavior proven at both unit and E2E level: mine gated when mcData absent (no crash, deterministic fallback, candidateSetDigest reflects filtered set). Context tokens derived from `nearbyEntities` observations, injected only when both required by rules AND observed. E2E tests assert on both `contextTokensInjected` (audit field) and `initialStateHash` (material inventory fact). Child bundles found by `solverId`, not hardcoded index. Python solver handles all `acq:*` rules natively via generic `requires` multiset check.

### What's done

| Item | File | Evidence |
|------|------|----------|
| Acquisition types + context hashing | `minecraft-acquisition-types.ts` | `AcquisitionContextV1`, `AcquisitionCandidate`, `computeCandidateSetDigest()`, `lexCmp()`, `costToMillis()`. 21 tests |
| Strategy enumeration + ranking | `minecraft-acquisition-rules.ts` | `buildAcquisitionStrategies()`, `rankStrategies()` with quantized scoring, deterministic tie-break. 42 tests |
| Prior store (EMA learning) | `minecraft-acquisition-priors.ts` | `StrategyPriorStore` with alpha=0.2, bounds [PRIOR_MIN=0.05, PRIOR_MAX=0.95], planId-required updates. 13 tests |
| Coordinator solver class | `minecraft-acquisition-solver.ts` | `MinecraftAcquisitionSolver` extends `BaseDomainSolver`. Delegates mine/craft to crafting solver, trade/loot/salvage to Sterling via `acq:` prefix rules. `parentBundleId` first-class field. Strategy-specific child solverId. 28 tests (incl. 4 mcData gate + `{}` malformed metadata) |
| Compat linter (3 acquisition checks) | `compat-linter.ts` | `TRADE_REQUIRES_ENTITY` (exact `proximity:villager`), `ACQ_FREE_PRODUCTION` (per-strategy), `ACQUISITION_NO_VIABLE_STRATEGY` (uses `candidateCount`, not `rules.length`). Gated behind `enableAcqHardening` flag or `solverId`. 31 hardening tests |
| SolveBundle wiring (parent + child) | `minecraft-acquisition-solver.ts` | Parent bundle captures `candidateSetDigest`, `strategySelected`, `candidateCount`. Child bundles appended after parent with strategy-specific solverId. |
| Deterministic digest + ranking | `minecraft-acquisition-types.ts`, `minecraft-acquisition-rules.ts` | `lexCmp()` replaces `localeCompare`, `costToMillis()` quantizes floats. Digest stable under reordering. |
| Golden-master snapshots (R3, R4) | `acquisition-golden-master.test.ts` | Trade/loot/salvage rule shape snapshots. Payload stability. Deterministic bundleId and candidateSetDigest. RigDSignals. 12 tests |
| Transfer test — supply chain | `transfer-supply-chain.test.ts` | Supply chain procurement domain (manufacture/purchase/recycle/barter). CandidateSetDigest, ranking, signals, SolveBundle capture. Zero Minecraft imports. 19 tests |
| Learning benchmark (M1) | `acquisition-benchmark.test.ts` | 5 scenarios. CandidateSetDigest unchanged after learning. Strategy frequency shift. Prior stabilization. Operator set immutability proof. 15 tests |
| Degeneracy detection (M2-a) | `degeneracy-detection.ts` | `detectStrategyDegeneracy()` with epsilon-based tie detection. Wired into SolveRationale. 8 tests |
| Leaf routing | `leaf-routing.ts`, `acquisition-leaf-routing.test.ts` | `acq:trade:*` → `interact_with_entity`, `acq:loot:*` → `open_container`, `acq:salvage:*` → `craft_recipe`. 9 tests |
| Planner integration | `sterling-planner.ts` | `case 'D'` dispatches to acquisition solver. Steps tagged with `source: 'rig-d-acquisition'`. |
| Mine/craft delegation regression | `acquisition-solver-unit.test.ts` | Parent bundle `compatReport.valid` when `candidateCount > 0` and `rules=[]`. 3 regression tests |
| Context token injection (observation-derived) | `minecraft-acquisition-solver.ts:522-553`, `acquisition-solver-unit.test.ts` | `dispatchSterlingRules` derives `observedTokens` from `nearbyEntities`, then only injects tokens that are BOTH required by rules AND observed in the world. Fail-closed: unknown-feasibility strategies are dispatchable, but Python fails them unless the context token is present. `Math.max()` for count handling. `contextTokensInjected: string[]` audit field on `SolveBundleInput` tracks exactly which tokens were injected (sorted). 6 unit tests: trade injects when villager observed, trade does NOT inject when no villager, loot injects when chest observed, salvage has no proximity tokens, child bundle captures `contextTokensInjected`, child bundle omits field for salvage. |
| mcData dependency threading | `minecraft-acquisition-solver.ts`, `sterling-planner.ts`, `minecraft-crafting-rules.ts` | Planner loads mcData (same precedence as Rig A: metadata override ‖ cache). Threaded as parameter through `solveAcquisition` → `dispatchStrategy` → `dispatchMineCraft` → `solveCraftingGoal`. No instance storage (pure threading). `isValidMcData()` predicate validates structural shape (recipes, items, itemsByName all present and non-null). Both `buildCraftingRules` guard and mine gate use `isValidMcData` — `{}` behaves identically to `undefined`. 8 predicate + gate tests. |
| E2E test suite (all strategies) | `acquisition-solver-e2e.test.ts` | 7 E2E tests gated behind `STERLING_E2E=1`: trade, loot, salvage, mine success path (with mcData), mine fail-closed (without mcData), multi-strategy context sensitivity, deterministic identity. Mine success test asserts: parent bundle with definitionHash, child crafting bundle with stepsDigest, compatReport.valid on both. Fail-closed test asserts: mine filtered, no crash, structured result. |

### Certification checklist

- [x] **D.1 — Strategy enumeration**: `buildAcquisitionStrategies(ctx)` returns candidates with bucketed context. Distance buckets: 0=none, 1=≤16, 2=≤64, 3=>64. Trade/loot/salvage candidates include availability signals.
- [x] **D.2 — Strategy ranking with priors**: `rankStrategies()` with `scoreMillis = round(estimatedCost * (1 - successRate) * 1000)`. Deterministic tie-break via `lexCmp()`. Quantized cost comparison.
- [x] **D.3 — Prior learning (execution-grounded)**: `StrategyPriorStore` requires planId. EMA alpha=0.2. Bounds [0.05, 0.95]. No planId → throws.
- [x] **D.4 — Coordinator solver + SolveBundle**: Parent bundle with `candidateSetDigest`. Child bundles aggregated. `candidateCount` distinguishes "no strategy path" from "delegation-driven." Material fix: mine/craft delegation returns `rules=[]` without triggering `ACQUISITION_NO_VIABLE_STRATEGY`.
- [x] **D.5 — Hardening (3 checks)**: `TRADE_REQUIRES_ENTITY` (exact token), `ACQ_FREE_PRODUCTION` (per-strategy: trade=currency+villager, loot=`proximity:container:<kind>` prefix, salvage=source item, generic=any token), `ACQUISITION_NO_VIABLE_STRATEGY` (uses `candidateCount`). Gated behind `enableAcqHardening` flag.
- [x] **D.6 — Golden-master + transfer test**: Rule shape snapshots, payload stability, deterministic identity, supply chain transfer test.
- [x] **D.7 — Learning benchmark (M1)**: CandidateSetDigest unchanged after N episodes. Strategy ranking shifts. Prior stabilization. Operator set immutability.
- [x] **D.8 — Closeout doc**: Update capability tracker to reflect Rig D status. Two-axis certification model (contract vs E2E), primitive namespace separation (ST-Pxx vs CB-Pxx), explicit E2E coverage sets, dependency edge declarations.
- [x] **D.E2E — All strategies against Python**: mcData threaded from planner; mine delegation exercises crafting solver → Python end-to-end. Fail-closed behavior proven (mine gated when mcData absent). Trade/loot/salvage context token injection E2E-PROVEN. No new Python domain needed — `minecraft_domain.py` handles all `acq:*` rules natively via generic `requires` multiset check. 7 E2E tests (was 6).

### E2E coverage detail

| Strategy | E2E status | How | Blocker |
|----------|-----------|-----|---------|
| mine | **E2E-PROVEN** (2026-02-02) | `mine:cobblestone` with mcData injected from planner. Crafting solver builds rules from recipe tree, Sterling Python solves (nodes=2, goal_found). E2E test asserts: parent bundle `definitionHash` + `compatReport.valid`, child crafting bundle `stepsDigest` + `compatReport` (allows `MINE_TIERGATED_NO_INVARIANT` lint on raw mine rules). Fail-closed E2E: mcData absent → mine gated, no crash, `solved=false`, empty `strategyRanking`. Unit-level gate proof: 3 tests (mine excluded without mcData, included with mcData, candidateSetDigest differs). | — |
| craft | PROVEN (via Rig A + mine delegation) | Covered by Rig A E2E and now also exercised via mine delegation path with mcData. | — |
| trade | **E2E-PROVEN** (2026-02-01) | `acq:trade:iron_ingot` with observed villager entity. Python solved (nodes=2, goal_found). Child bundle asserts: `contextTokensInjected: ['proximity:villager']`, `initialStateHash` matches `hashInventoryState({emerald:5, 'proximity:villager':1})`. | — |
| loot | **E2E-PROVEN** (2026-02-01) | `acq:loot:saddle` with observed chest entity. Python solved (nodes=2, goal_found). Child bundle asserts: `contextTokensInjected: ['proximity:container:chest']`, `initialStateHash` matches `hashInventoryState({'proximity:container:chest':1})`. | — |
| salvage | **E2E-PROVEN** (2026-02-01) | `acq:salvage:stick:from:oak_planks` consuming `oak_planks`. Python solved (nodes=2, goal_found). Child bundle asserts: `contextTokensInjected: undefined`, `initialStateHash` matches `hashInventoryState({oak_planks:2})`. | — |

---

## Rig F: Valuation under scarcity (keep/drop/store)

**Contract**: CONTRACT-CERTIFIED — pure TS-local certified decision module. Content-addressed hashing, deterministic scoring, fail-closed unknown-item policy, order-insensitive decision digest. Explicit versioned policy knobs (slotModel, unknownItemPolicy, countPolicy) bound into rulesetDigest with fail-closed runtime guards. Shared `deriveEffectiveInventory()` prevents digest/solver normalization drift. Ruleset lint for shadowing hazards with deduped issue codes in witness. Input normalization (sort+dedupe set-semantic arrays). reasonCodes are decision-binding (sorted+deduped). storeTokenMatched is lexicographic-min (stable under permutation). 33 unit tests.
**E2E**: NONE — TS-local (no Sterling backend calls). No E2E test needed.

### What's done

| Item | File | Evidence |
|------|------|----------|
| Valuation types + digest computation | `minecraft-valuation-types.ts` | `ValuationInput`, `ValuationPlanV1`, `InventoryActionV1` (with `countBasis`), `ValuationWitnessV1` (with `slotModel`, `unknownItemPolicy`, `countPolicy`, `storeEligible`, `storeTokenMatched`, `rulesetLintClean`, `rulesetLintIssueCodes`), `deriveEffectiveInventory()` (shared normalization: cap: filtering + zero removal), `computeValuationInputDigest()` (uses `deriveEffectiveInventory`, sort+dedupe arrays), `computeDecisionDigest()` (reasonCodes sorted+deduped), `lexCmp()`, `LintIssueCode` type. Policy knob types: `SlotModel`, `UnknownItemPolicy`, `CountPolicy`. CAP_PREFIX inlined locally. |
| Classification table + scoring + lint | `minecraft-valuation-rules.ts` | `DEFAULT_CLASSIFICATION_TABLE` (~35 entries, 5 classes), `scoreItem()` (first-match-wins, exact+suffix), `buildDefaultRuleset()` (includes policy knobs), `computeRulesetDigest()`, `lintClassificationTable()` (3 check codes: `DUPLICATE_EXACT`, `SUFFIX_SHADOWS_EXACT`, `DUPLICATE_SUFFIX`). |
| Valuation solver (pure function) | `minecraft-valuation.ts` | `computeValuationPlan()` — fail-closed policy guards (`UNSUPPORTED_POLICY` on unrecognized knob values), shared `deriveEffectiveInventory()` for cap: filtering, lint computation with deduped issue codes, protected item enforcement, under-budget pass-through, fail-closed unknown policy, store eligibility as first-class boolean (lexicographic-min token selection via `lexCmp`), score-sorted eviction, whole-stack actions, full witness generation with policy knobs + store context + lint issue codes. |
| Unit tests (33 tests) | `valuation-unit.test.ts` | 14 original invariant tests + 19 hardening tests: policy knob digest binding, policy knob witness presence, countBasis enforcement, score-invariance of decisionDigest, store eligibility witness (lexicographic-min), default table lint clean, lint hazard detection (3 codes), lint-dirty plan with issue codes, input normalization (permuted arrays same digest, duplicates same digest, zero-count/cap: filtering), reasonCodes normalization (reorder+dedupe same digest), lint issue codes in witness (empty for clean, deduped for dirty), storeTokenMatched permutation stability, policy guard fail-closed (unsupported slotModel/unknownItemPolicy/countPolicy → UNSUPPORTED_POLICY), shared normalization helper (deriveEffectiveInventory), multi-issue-type lint dedup. |

### Design decisions (reviewer-binding)

- **D1. Unknown-item fail-closed**: Over-budget + unknown items → `solved: false`, `UNKNOWN_ITEM_VALUATION`. Under-budget unknowns pass through with `UNKNOWN_ITEM_KEPT`. Policy is explicit: `unknownItemPolicy: 'fail-closed-v1'` in ruleset, bound into rulesetDigest. Callers must treat `solved:false` as recoverable (expand table, query metadata, defer).
- **D2. Order-insensitive decision digest**: Actions sorted by `(item, actionType)` before hashing. Score excluded from digest. **reasonCodes are decision-binding** (sorted+deduped before hashing) — codes like `LOW_VALUE_DROP` vs `LOW_VALUE_STORE` carry distinct executor semantics. Harmless reorder or accidental duplicate in construction doesn't fork the digest. Tests #10, #18, #26 lock this intent.
- **D3. Whole-stack actions only**: `count === inventory[item]` for all action types. `countPolicy: 'whole-stack-v1'` in ruleset, bound into rulesetDigest. `countBasis: 'all'` on every action (test #17). Adding partial-stack requires bumping countPolicy version.
- **D4. Pattern matching**: `matchKind: 'exact' | 'suffix'`. First match in table order wins. `lintClassificationTable()` detects shadowing hazards (test #21).
- **D5. CAP_PREFIX inlined**: `const CAP_PREFIX = 'cap:' as const` local to valuation types. cap: tokens filtered at boundary via `deriveEffectiveInventory()`.
- **D6. Ruleset hashed as unit**: `rulesetDigest = contentHash(canonicalize(ruleset))`. All policy knobs bound — `slotModel`, `unknownItemPolicy`, `countPolicy`, `classificationTable`, `storeProximityPrefix`, `storeMinScoreBp`.
- **D7. Slot model is explicit**: `slotModel: 'distinct-item-keys-v1'` — counts distinct inventory keys with value > 0, excluding cap: tokens. NOT Minecraft's real slot constraint. Witness records the model version to prevent silent reinterpretation during integration.
- **D8. Store eligibility is first-class**: `storeEligible: boolean` and `storeTokenMatched: string | undefined` in witness. `storeTokenMatched` is the lexicographic-min matching token (stable under permutation of observedTokens — test #28). Ordering function is `lexCmp`, which is the same function used for digest normalization. Derived from observedTokens at compute time, not fabricated.
- **D9. Input normalization via shared helper**: `deriveEffectiveInventory()` is the single source of truth for inventory normalization (cap: filtering + zero removal). Both `computeValuationInputDigest()` and `computeValuationPlan()` call it, preventing drift between "what the solver reasons over" and "what the digest claims was reasoned over." Set-semantic arrays (`protectedItems`, `protectedPrefixes`, `observedTokens`) are sort+deduped in the digest function. Tests #23, #24, #25, #32 lock this.
- **D10. Lint issue codes in witness**: `rulesetLintIssueCodes: LintIssueCode[]` in witness — deduped and sorted list of issue codes that fired. Tells callers *what* to fix without re-running lint or inspecting the ruleset. Complements `rulesetLintClean: boolean`. Test #33 proves multi-issue-type deduplication.
- **D11. Fail-closed policy guards**: Runtime checks reject unsupported policy knob values with `UNSUPPORTED_POLICY` error. Guards `slotModel !== 'distinct-item-keys-v1'`, `unknownItemPolicy !== 'fail-closed-v1'`, `countPolicy !== 'whole-stack-v1'`. Turns "digest says X but behavior is Y" into an explicit failure rather than undetected mismatch. Tests #29, #30, #31 lock this. Witness records the unsupported knob value for diagnostics.

### Certification checklist

- [x] **F.1 — Determinism**: Same input → identical output (deep-equal on two runs). Test #1.
- [x] **F.2 — Tie-breaking**: Tied scores break by item name ascending via `lexCmp`. Test #2.
- [x] **F.3 — Explicit scarcity**: Under-budget → all kept (test #3). Over-budget → lowest-scored dropped first (test #4).
- [x] **F.6 — Store gating**: Store action only when `proximity:container:*` token present (test #8). No store when absent (test #9). Store eligibility recorded in witness with lexicographic-min token (test #19). Permutation stability (test #28).
- [x] **F.7 — Fail-closed**: Over-budget + unknowns → `solved: false`, `UNKNOWN_ITEM_VALUATION` (test #5). Under-budget + unknowns → `solved: true`, `UNKNOWN_ITEM_KEPT` (test #6). Policy explicit and versioned as `fail-closed-v1`.
- [x] **F.8 — Protected items**: Protected item never dropped even when lowest scored (test #7).
- [x] **D2 — Order-insensitive digest**: Permuted actions produce same `decisionDigest` (test #10). Score changes don't affect digest when actions identical (test #18). reasonCodes reorder/dedupe don't fork digest (test #26).
- [x] **D5 — cap: boundary filtering**: cap: tokens excluded from slot count and emitted actions (test #13). Shared `deriveEffectiveInventory()` used by both solver and digest (test #32).
- [x] **Digest stability**: Changing classification table changes rulesetDigest (test #11). `valuationInputDigest` binds rulesetDigest (test #12). Changing slotModel changes rulesetDigest (test #15).
- [x] **Error path**: Protected items exceeding budget → `INSUFFICIENT_CAPACITY_PROTECTED` (test #14).
- [x] **Policy knobs in witness**: slotModel, unknownItemPolicy, countPolicy present in witness (test #16).
- [x] **Policy knob fail-closed guards**: Unsupported slotModel → `UNSUPPORTED_POLICY` (test #29). Unsupported unknownItemPolicy → `UNSUPPORTED_POLICY` (test #30). Unsupported countPolicy → `UNSUPPORTED_POLICY` (test #31).
- [x] **countBasis enforcement**: All actions have `countBasis: 'all'` under whole-stack-v1 (test #17).
- [x] **Ruleset lint**: Default table clean (test #20). Detects DUPLICATE_EXACT, SUFFIX_SHADOWS_EXACT, DUPLICATE_SUFFIX (test #21). Lint-dirty ruleset still produces plan with `rulesetLintClean: false` and deduped `rulesetLintIssueCodes` (test #22). Issue codes empty for clean ruleset (test #27). Multi-issue-type deduplication (test #33).
- [x] **Input normalization**: Permuted set-semantic arrays produce same `valuationInputDigest` (test #23). Duplicate entries don't fork digest (test #24). Inventory zero-count and cap: tokens excluded from digest (test #25). Shared `deriveEffectiveInventory()` helper proven (test #32).
- [x] **reasonCodes normalization**: Reordered/duplicated reasonCodes produce same `decisionDigest` (test #26).

---

## Rig K: Irreversibility and commitment planning

**Contract**: CONTRACT-CERTIFIED — P13 capsule + reference adapter + 2-domain fixtures + Minecraft commitment module + 36 certification tests
**E2E**: NONE — no commitment/irreversibility domain in Python. All verification sequencing, commitment state, option value, and one-way constraints are TS-only.

### What's done

| Item | File | Evidence |
|------|------|----------|
| P13 capsule contract types (domain-agnostic) | `sterling/primitives/p13/p13-capsule-types.ts` | `P13IrreversibilityTagV1`, `P13CommitmentAdapter`, `P13VerificationStateV1`, `P13CommitmentStateV1`, `P13CommitmentCostV1`; 5 invariants (explicit_reversibility, verify_before_commit, deterministic_verification, bounded_option_value, monotonic_commitment); `OPTION_VALUE_MAX = 10`; `DEFAULT_CONFIDENCE_THRESHOLD = 0.8` |
| Reference adapter (domain-agnostic) | `sterling/primitives/p13/p13-reference-adapter.ts` | `P13ReferenceAdapter` satisfying all 5 invariants. Confidence accumulation clamped to [0,1], commit checking (blocked + threshold), monotonic commitment state, bounded option value, commitment cost breakdown |
| Reference fixtures (2 domains) | `sterling/primitives/p13/p13-reference-fixtures.ts` | Villager trading domain (5 tags + 3 verifications + 3 constraints) + deployment pipeline domain (5 tags + 3 verifications + 3 constraints) for portability |
| Minecraft commitment definitions | `commitment/minecraft-commitment.ts` | `MINECRAFT_IRREVERSIBILITY_TAGS` (6 tags), `MINECRAFT_VERIFICATIONS` (3 operators), `MINECRAFT_COMMITMENT_CONSTRAINTS` (4 constraints) |
| Certification test suite | `sterling/__tests__/certification-rig-k.test.ts` | 36 tests across 9 describe blocks |

### Certification checklist

- [x] **K.1 — P13 capsule types**: Domain-agnostic types for irreversibility tags, verification operators, verification state, commitment state, commitment constraints, option value state, commit check results, commitment cost breakdown. 5 invariants defined. `P13CommitmentAdapter` interface with 9 methods. `OPTION_VALUE_MAX = 10`. `DEFAULT_CONFIDENCE_THRESHOLD = 0.8`. Capability descriptor with contract version `p13.v1`.

- [x] **K.2 — Reference adapter**: `P13ReferenceAdapter` implements all methods. `initializeVerification()` / `initializeCommitment()` / `initializeOptionValue()`. `applyVerification()` with confidence accumulation clamped to [0,1]. `canCommit()` checking blocked, already-committed, and confidence threshold. `executeCommitment()` monotonic (adds to committed set, never removes). `calculateOptionValue()` bounded to OPTION_VALUE_MAX. `calculateCommitmentCost()` returns baseCost + commitmentPenalty + optionValueLoss breakdown.

- [x] **K.3 — Reference fixtures (2 domains)**: Villager trading domain (pick_up, place_workstation, lock_trade, level_up, break_workstation tags; inspect_trade_offers, check_emerald_cost, preview_next_level verifications; lock_trade, level_up, break_workstation constraints). Deployment pipeline domain (write_code, merge_branch, deploy_to_prod, apply_migration, cut_release tags; run_tests, canary_deploy, review_migration verifications; deploy_to_prod, apply_migration, cut_release constraints). Proves P13 capsule portability across commitment domains.

- [x] **K.4 — Minecraft commitment module**: `MINECRAFT_IRREVERSIBILITY_TAGS` (6 tags: pick_up fully_reversible, place_block costly_reversible, lock_trade/level_up/consume_totem/break_workstation irreversible). `MINECRAFT_VERIFICATIONS` (3: inspect_trade_offers, check_emerald_cost, preview_next_level). `MINECRAFT_COMMITMENT_CONSTRAINTS` (4: lock_trade@0.8, level_up@0.7, break_workstation@0.5, consume_totem@0.9).

- [x] **K.5 — Certification suite**: `certification-rig-k.test.ts` — 36 tests covering: explicit reversibility (Pivot 1, 4 tests), verify before commit (Pivot 2, 5 tests), deterministic verification (Pivot 3, 4 tests), bounded option value (Pivot 4, 4 tests), monotonic commitment (Pivot 5, 4 tests), multi-domain portability (4 tests), Minecraft module (3 tests), commitment cost integration (4 tests), P13 contract metadata (4 tests).

---

## Rig N — Fault Diagnosis & Repair (P15)

**Primitive**: CB-P15 (wraps CB-P11 epistemic planning)
**Contract**: CONTRACT-CERTIFIED — P15 capsule + reference adapter (wraps P11 via DI) + 2-domain fixtures + Minecraft farm faults module + 45 certification tests
**E2E**: NONE — no fault diagnosis domain in Python. All repair/validation sequencing, episode control, and bounded diagnosis are TS-only.

### What's done

| Item | File | Evidence |
|------|------|----------|
| P15 capsule contract types (domain-agnostic) | `sterling/primitives/p15/p15-capsule-types.ts` | `P15RepairActionV1`, `P15ValidationProbeV1`, `P15DiagnosisParamsV1`, `P15DiagnosisEpisodeV1`, `P15FaultDiagnosisAdapter`; 6 invariants; delegates to P11 for epistemic computation |
| Reference adapter (wraps P11) | `sterling/primitives/p15/p15-reference-adapter.ts` | `P15ReferenceAdapter` takes `P11EpistemicAdapter` via constructor injection. Delegates selectProbe, updateBelief, calculateEntropy, expectedInfoGain to P11. Adds selectRepair (lowest cost + lexicographic), requiresValidation (1:1 mapping), evaluateValidation, runDiagnosisLoop |
| Reference fixtures (2 domains) | `sterling/primitives/p15/p15-reference-fixtures.ts` | CI Pipeline Faults (4 hypotheses, 4 probes, 6 repairs, 6 validations) + Farm Hydration Faults (4 hypotheses, 4 probes, 5 repairs, 5 validations) for portability |
| Minecraft farm faults module | `diagnosis/minecraft-farm-faults.ts` | `MINECRAFT_FARM_FAULT_HYPOTHESES` (4), `MINECRAFT_FARM_FAULT_PROBES` (4), `MINECRAFT_FARM_FAULT_REPAIRS` (5), `MINECRAFT_FARM_FAULT_VALIDATIONS` (5), `MINECRAFT_FARM_DIAGNOSIS_PARAMS` |
| Certification test suite | `sterling/__tests__/certification-rig-n.test.ts` | 45 tests across 9 describe blocks |

### Certification checklist

- [x] **N.1 — P15 capsule types**: Domain-agnostic types for repair actions, validation probes, diagnosis parameters, episode records, termination reasons. 6 invariants defined. `P15FaultDiagnosisAdapter` interface with 7 methods + defaultParams. `MAX_DIAGNOSIS_STEPS = 20`. `DEFAULT_DIAGNOSIS_THRESHOLD = 0.8`. `DEFAULT_MIN_INFO_GAIN = 0.01`. Imports from P11: `P11BeliefStateV1`, `P11HypothesisV1`, `P11ProbeOperatorV1`, `P11ObservedEvidenceV1`, `ProbBucket`.

- [x] **N.2 — Reference adapter (P11 delegation)**: `P15ReferenceAdapter` wraps `P11EpistemicAdapter` via constructor injection. `selectDiagnosticProbe()` delegates to P11 `selectProbe` + `expectedInfoGain`, gates on `minInfoGain`. `updateDiagnosticBelief()` delegates to P11 `updateBelief`, unwraps `.belief`. `selectRepair()` deterministic: lowest cost then lexicographic ID, skips already-applied. `requiresValidation()` 1:1 repair→validation lookup. `evaluateValidation()` checks evidence type + value match. `runDiagnosisLoop()` bounded state machine: probe → update → confidence check → repair → validate → resolved/re-enter.

- [x] **N.3 — Reference fixtures (2 domains)**: CI Pipeline domain (fault_auth/fault_db/fault_network/fault_config hypotheses; run_unit_test/check_error_log/inspect_config/network_probe diagnostic probes; 6 repairs with 6 validations; `makeCIObservationProvider` oracle). Farm Hydration domain (fault_dry_soil/fault_low_light/fault_wrong_crop/fault_trampled hypotheses; check_moisture/check_light/check_crop_type/check_blockstate probes; 5 repairs with 5 validations; `makeFarmObservationProvider` oracle). CI fixture overrides `confidenceThreshold` to 0.7 (domain parameterization, not capability limitation); P11 ProbBucket discretization limits achievable confidence with this fixture's 4 hypotheses. Farm domain uses capsule default 0.8. Both thresholds exercise diagnose-repair-validate sequencing.

- [x] **N.4 — Minecraft farm faults module**: `MINECRAFT_FARM_FAULT_HYPOTHESES` (4: dry_soil, low_light, wrong_crop, trampled). `MINECRAFT_FARM_FAULT_PROBES` (4: check_moisture, check_light, check_crop_type, check_blockstate). `MINECRAFT_FARM_FAULT_REPAIRS` (5: add_water, add_torch, replant, retill, fence). `MINECRAFT_FARM_FAULT_VALIDATIONS` (5: validate_water, validate_torch, validate_replant, validate_retill, validate_fence).

- [x] **N.5 — Certification suite**: `certification-rig-n.test.ts` — 45 tests covering: deterministic probe scoring (Pivot 1, 4 tests), belief update deterministic (Pivot 2, 4 tests), entropy decreases when discriminative (Pivot 3, 4 tests), bounded hypothesis set (Pivot 4, 3 tests), diagnose-repair-validate order (Pivot 5, 5 tests), bounded episode (Pivot 6, 6 tests), repair selection (4 tests), multi-domain portability (6 tests), Minecraft domain module (5 tests), contract metadata (4 tests).

---

## Rigs L–M: Not started

These rigs are documented in [sterling-minecraft-domains.md](./sterling-minecraft-domains.md) with full rig templates. Implementation follows Later (L–M) priority ordering.

### Post-certification order (remaining rigs):

> **Note**: This is the sequential implementation order for all remaining rigs,
> spanning Tracks 2 and 3 from [RIG_DOCUMENTATION_INDEX.md](./RIG_DOCUMENTATION_INDEX.md).
> The index organizes rigs by thematic track (Track 2 = belief/perception,
> Track 3 = representational widening); this list orders them by dependency
> and implementation priority within those tracks.

1. **Rig D** — Multi-strategy acquisition (CONTRACT-CERTIFIED, E2E-PROVEN: `{mine, trade, loot, salvage}` all proven)
   - Requires contract: A (crafting solver contract)
   - Requires E2E: A `{crafting}` (mine path delegates to crafting solver)
   - Dependency gate: mine strategy requires mcData injection from planner (resolved 2026-02-02)
2. **Rig F** — Valuation under scarcity (CONTRACT-CERTIFIED, E2E: NONE — TS-local)
   - Requires contract: D
   - Requires E2E: D `{mine}` if delegating acquisition
3. **Rig H** — Systems synthesis (CONTRACT-CERTIFIED, E2E: NONE — TS-local)
4. **Rig I** — Epistemic planning (CONTRACT-CERTIFIED, E2E: NONE — TS-local)
5. **Rig J** — Invariant maintenance (CONTRACT-CERTIFIED, E2E: NONE — TS-local)
6. **Rig K** — Irreversibility (CONTRACT-CERTIFIED, E2E: NONE — TS-local)

7. **Rig N** — Fault diagnosis (CONTRACT-CERTIFIED, E2E: NONE — TS-local)

### Later (requires A–K contract-certified):
8. **Rig L** — Contingency planning (nightfall/hunger)
9. **Rig M** — Risk-aware planning (lava, nether)

---

## What "certified" means for a rig

### CONTRACT-CERTIFIED

A rig reaches CONTRACT-CERTIFIED when it passes all three test categories:

1. **Signature tests** — Legality, determinism, boundedness, canonicalization, validation/hardening. All global invariants satisfied.
2. **Performance tests** — Search effort is bounded and stable across repeat solves (no regression). Learning does not alter semantics. Note: current baselines prove stability, not learning efficacy. Learning-sensitive benchmarks (problems with multiple near-tied plans) are a separate milestone.
3. **Transfer tests** — Same formal signature runs on at least one non-Minecraft surface with the same invariants and harness.

CONTRACT-CERTIFIED proves the **contract shape** — wire payload stability, bundle identity, linter hardening, portability. It does **not** prove that the Sterling Python search engine can solve this problem class.

### E2E-PROVEN

A rig reaches E2E-PROVEN when, in addition to contract certification:

4. **Solver E2E tests** — At least one test (gated behind `STERLING_E2E=1`) instantiates the real TS solver class, connects to a live Sterling Python server, solves a representative problem, and asserts on:
   - `solveMeta.bundles` shape and content
   - `searchHealth` metrics flowing from Python → TS
   - `stepsDigest` matching returned steps
   - Solution correctness (steps produce the goal item)

5. **Coverage declaration** — For multi-path rigs, the E2E coverage set is listed explicitly. "E2E-PROVEN" without a coverage set is ambiguous and therefore not allowed.

### Dependency edges

Downstream rigs should declare which axis they require:

- **Requires contract**: the upstream rig's contract shape (types, linter, bundle identity) is stable
- **Requires E2E**: the upstream rig's solver produces correct plans via Sterling search (needed when the downstream rig delegates to the upstream solver)

Example: Rig F depends on D contract-certified. If F delegates mine/craft to D's crafting path, F requires D E2E coverage to include `{mine}`.

---

## Recently completed work

### Sprint 1: Identity Chain + Episode Resilience (2026-02-02)

Wired the three-step identity chain (`trace_bundle_hash` → `bundleHash` → `episode_hash`) end-to-end across both repos and hardened `report_episode` against failures at both domain and server levels.

**Sterling (Python) commits**:
- `8a533417` feat: Solve-scoped identity emission + report_episode linkage (Sprint 1 PR A)
- `3fbf8e74` fix: Defensive error handling in report_episode to prevent connection drops
- `6c743eda` test: Add navigation domain contamination regression tests
- `c7b0bcdc` fix: Learning guards across all domains + resilience regression tests
- `77cafda0` test: Server-level report_episode resilience integration tests
- `a107b8fa` fix: Convert async fixture to pytest_asyncio.fixture for STRICT mode

**CB (TypeScript) commits**:
- Solver-level linkage: `parseSterlingIdentity()`, `attachSterlingIdentity()`, `SterlingIdentity` type, `bindingHash` computation
- Wire-shape lock test: identity fields in `metrics` only, not top-level
- E2E identity loop: solve → extract `trace_bundle_hash` → report → verify `episode_hash`

**Test coverage added**:
- Sterling: 4 domain-level resilience tests + 3 server-level integration tests + navigation contamination tests
- CB: wire-shape lock test + identity contract tests (59 tests in `solve-bundle.test.ts`)
- E2E: 13/13 tests pass under `STERLING_E2E=1` including full identity loop

**Key design decisions**:
- Identity fields live in `result.metrics`, not top-level (wire-shape lock)
- `bundleHash` excluded from Sterling hashes (hash coupling policy)
- Learning failures are best-effort (try/except around `process_path` in all 3 domains)
- Server-level `report_episode` exceptions produce `{"type":"error","code":"episode_error"}` and keep the connection alive

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
# Python unit tests — episode identity + search health (sterling repo)
cd /Users/darianrosebrook/Desktop/Projects/sterling
python -m pytest tests/unit/test_episode_identity.py tests/unit/test_search_health_accumulator.py -v

# Python integration tests — report_episode resilience + building WS harness (sterling repo)
cd /Users/darianrosebrook/Desktop/Projects/sterling
python -m pytest tests/integration/ -m integration -v

# Python full suite (sterling repo)
cd /Users/darianrosebrook/Desktop/Projects/sterling
python -m pytest tests/ -v --tb=short

# TS unit tests — sterling/planning scope (no server needed)
cd /Users/darianrosebrook/Desktop/Projects/conscious-bot
npx vitest run packages/planning/src/sterling/__tests__/

# TS typecheck
npx tsc --noEmit

# E2E — solver-class tests (requires Sterling server on ws://localhost:8766)
cd /Users/darianrosebrook/Desktop/Projects/sterling
python scripts/utils/sterling_unified_server.py &
cd /Users/darianrosebrook/Desktop/Projects/conscious-bot
STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/solver-class-e2e.test.ts

# E2E — acquisition solver (requires Sterling server)
STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/acquisition-solver-e2e.test.ts

# E2E — full identity loop (requires Sterling server)
STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/
```

> **Note**: These commands assume no additional pytest plugins. Do not use `--timeout` (requires `pytest-timeout`, not installed). The `--tb=short` flag is set in `pytest.ini` and doesn't need repeating.

---

## Doc invariants (self-maintenance checklist)

When editing this tracker or linked docs, verify:

- [ ] **Status vocabulary is bounded**: Axis A = `CONTRACT-CERTIFIED` | `IN PROGRESS` | `NOT STARTED`. Axis B = `E2E-PROVEN` | `PARTIAL E2E` | `E2E: NONE`. Optional suffix: `{surface scope}`.
- [ ] **Identity chain definitions match implementation**: `bindingHash = contentHash("binding:v1:" + traceBundleHash + ":" + bundleHash)`. Any encoding change must update all 3 docs (tracker, domains doc, integration review).
- [ ] **Failure taxonomy enum matches integration review**: 9 values in `EpisodeFailureClass`. If a class is added/renamed, update both the taxonomy table here and the enum definition in the review.
- [ ] **No line-number references to source code**: Use function names, class names, or grep-able strings (e.g., warning messages) as stable anchors.
- [ ] **Rig status lines consistent across docs**: Index section and detailed template section in `sterling-minecraft-domains.md` must match each other and the summary table in this tracker.
