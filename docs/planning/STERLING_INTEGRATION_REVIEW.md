# Sterling Integration Review: Making Rigs Cheaper and More Reliable

**Date**: 2026-02-02
**Last Updated**: 2026-02-03
**Goal**: Identify where leaning into Sterling's native capabilities eliminates duplicated certification work, reduces TypeScript orchestration glue, and turns "it seems to work" into replayable, proof-carrying evidence.
**Reference docs**: [sterling-boundary-contract.md](./sterling-boundary-contract.md), [sterling-capability-tracker.md](./sterling-capability-tracker.md), [capability-primitives.md](./capability-primitives.md)

---

## Implementation Status Summary (2026-02-03)

This section provides an accurate snapshot of what's actually implemented vs what's planned in this document.

### Phase 1: Proof + Replay — 90% Complete

| Deliverable | Status | Evidence |
|---|---|---|
| Sterling returns `trace_bundle_hash`, `engine_commitment`, `operator_registry_hash` | ✅ **Parsing Ready** | `parseSterlingIdentity()` in `solve-bundle.ts:426-454` |
| Sterling returns `completeness_declaration` | ✅ **Parsing Ready** | Forwarded verbatim in `SterlingIdentity.completenessDeclaration` |
| CB stores Sterling identity in `SolveBundleOutput` | ✅ **Implemented** | `SterlingIdentity` type in `solve-bundle-types.ts:196-215` |
| CB sends `bundle_hash` in `report_episode` | ✅ **Implemented** | `base-domain-solver.ts:407` |
| CB sends `trace_bundle_hash` in `report_episode` | ✅ **Implemented** | `base-domain-solver.ts:408` |
| CB sends `outcome_class` in `report_episode` | ✅ **Implemented** | `base-domain-solver.ts:409` — sent when `linkage.outcomeClass` is defined |
| CB sends `engineCommitment`/`operatorRegistryHash` in `report_episode` | ⚠️ **Conditional** | Behind toggle `STERLING_REPORT_IDENTITY_FIELDS=1` (OFF by default); downgrade-on-rejection implemented |
| Sterling returns `episode_hash` in response | ✅ **Parsing Ready** | `EpisodeAck` type defined; parsed in `base-domain-solver.ts:419-425` |
| CB computes `bindingHash` | ✅ **Implemented** | `attachSterlingIdentity()` in `solve-bundle.ts:467-482` |
| Downgrade-on-rejection for identity fields | ✅ **Implemented** | Structured `ReportEpisodeResult` discriminator (`base-domain-solver.ts:80-83`); latch-after-successful-retry (`base-domain-solver.ts:374-376`); tightened detector requires identity field mention (`base-domain-solver.ts:435-456`) |
| Combined classification + linkage helper | ✅ **Implemented** | `buildEpisodeLinkageFromResult()` in `episode-classification.ts:178-215` — returns `{ linkage, classified }` for governance |
| Both requestId formats sent | ✅ **Implemented** | `base-domain-solver.ts:403-405` — sends both `requestId` and `request_id` for migration |
| Both response formats parsed | ✅ **Implemented** | `base-domain-solver.ts:419-425` — parses both `episode_hash`/`episodeHash` and `request_id`/`requestId` |

**Status update (2026-02-03)**: Fixed critical shadowing bug where `task-integration.ts` had a local `buildEpisodeLinkage()` that bypassed Phase 1 identity forwarding. Now imports canonical `buildSterlingEpisodeLinkage()` from `./sterling`. Legacy aliases exist for backward compatibility but deprecated (removal after 2026-03-01).

**Remaining gap**: Solvers should migrate to `buildSterlingEpisodeLinkageFromResult()` for combined classification + linkage to ensure `outcomeClass` is always populated with provenance tracking.

### Phase 2: Domain Declarations — 100% Complete

| Deliverable | Status | Evidence |
|---|---|---|
| `registerDeclaration()` in `BaseDomainSolver` | ✅ **Implemented** | `ensureDeclarationRegistered()` at `base-domain-solver.ts:237-258` |
| Static `DomainDeclarationV1` per solver | ✅ **Implemented** | All 6 solvers have declarations (crafting, building, tool progression, acquisition, furnace, navigation) |
| Registration on connection | ✅ **Implemented** | Connection-scoped via nonce; re-registers after reconnect |
| DEV mode: register + log | ✅ **Implemented** | Non-fatal on failure |
| CERTIFYING mode: register + enforce | ✅ **Implemented** | Throws on failure |
| `structural_only` option | ⚠️ **Partial** | Not yet exposed on `SterlingReasoningService.solve()` parameters |

### Phase 3: Bridge Edges — 0% (Deferred per recommendation)

| Deliverable | Status | Notes |
|---|---|---|
| `BridgeEdge` type | ❌ **Not Started** | Ad-hoc TS orchestration instead |
| Typed bridge definitions | ❌ **Not Started** | Multi-domain plans use `solveMeta.bundles` array |
| Content-addressed bridge identity | ❌ **Not Started** | Per-domain bundles exist but no cross-domain linkage |

**Status**: Deferred per review recommendation. Current TS-level orchestration is sufficient.

### Phase 4: Value Function Efficacy — 0% (Deferred)

| Deliverable | Status | Notes |
|---|---|---|
| Regime B tests | ❌ **Not Started** | Regime A (determinism) tests exist; Regime B needs scenarios with near-tied plans |
| SearchHealth trend measurements | ⚠️ **Partial** | `acquisition-benchmark.test.ts` tracks stability but not improvement |
| Learning improvement proof | ❌ **Not Started** | Requires crafting scenarios where heuristic has room to discriminate |

### Join Keys Pipeline — 100% Complete

| Deliverable | Status | Evidence |
|---|---|---|
| `solverId` in `SolveJoinKeys` | ✅ **Implemented** | `solve-bundle-types.ts`, `episode-classification.ts` |
| `SOLVER_IDS` centralized | ✅ **Implemented** | `solver-ids.ts` |
| Migration fallback (opt-in) | ✅ **Implemented** | `JOIN_KEYS_DEPRECATED_COMPAT=1` env var |
| Warning classification | ✅ **Implemented** | `PLANID_MISMATCH`, `SOLVERID_MISMATCH`, `MISSING_FIELDS` |
| `buildSterlingEpisodeLinkage()` helper | ✅ **Implemented** | `episode-classification.ts` (canonical; legacy alias `buildEpisodeLinkage` deprecated) |
| Bounded warning Set | ✅ **Implemented** | 1000 entries, clear-on-overflow |
| Identity field toggle + latch | ✅ **Implemented** | `STERLING_REPORT_IDENTITY_FIELDS=1`, downgrade-on-rejection |
| Test reset hook | ✅ **Implemented** | `__resetIdentityLatchForTests()` |

### What's Missing to Reach "PR-Ready" per Wire Protocol Change List

1. **Identity forwarding in executor path**: ✅ **FIXED (2026-02-03)** — Fixed shadowing bug where `task-integration.ts` had a local `buildEpisodeLinkage()` that bypassed Phase 1 identity forwarding. Now imports canonical `buildSterlingEpisodeLinkage()` from `./sterling`.
2. **`episode_hash` persistence**: ✅ **IMPLEMENTED (2026-02-03)** — `persistEpisodeAck()` helper stores `episodeHash` in `task.metadata.solver.buildingEpisodeHash` asynchronously (fire-and-forget with `.then()` continuation, re-reads latest task to avoid clobbering concurrent updates). See `task-integration.ts:3185-3210`.
3. **Richer outcome taxonomy**: ✅ **IMPLEMENTED (2026-02-03)** — `buildingSolveResultSubstrate` captured at solve-time (`sterling-planner.ts:745-763`), consumed by executor to classify failures as SEARCH_EXHAUSTED, ILLEGAL_TRANSITION, etc. when solver failed. **Coherence invariant**: Substrate is only used when its `bundleHash` matches the episode's join keys, preventing misclassification when replans clobber substrate. Core rule: success → EXECUTION_SUCCESS; failure + solver failed + coherent → use substrate; failure + (solver succeeded OR incoherent) → EXECUTION_FAILURE. See `task-integration.ts:3307-3345`.
4. **`structural_only` exposure**: Add parameter to `SterlingReasoningService.solve()` — deferred, low priority
5. **Toggle default flip**: Consider enabling `STERLING_REPORT_IDENTITY_FIELDS=1` by default once Sterling confirms acceptance
6. **Coverage warning**: ✅ **ADDED (2026-02-03)** — `BaseDomainSolver.reportEpisode()` now warns (once per latchKey, bounded Set) when `linkage.outcomeClass` is undefined, catching cases where callers construct linkage manually without classification

### Footguns to Watch (Protocol Edge Cases)

1. **Retry idempotency assumption**: The downgrade-on-rejection mechanism assumes Sterling rejects unknown fields *before* mutating/persisting. If that's not true, retry could produce duplicate episodes.
   - **Mitigation**: `requestId`/`request_id` should be an idempotency key on Sterling side; document "schema validation before persistence"
   - **Current state**: CB sends `requestId` as correlation ID, but idempotency is not enforced

2. **Latch scope leakage**: ✅ **FIXED (2026-02-03)** — Latch now keyed by `${solverId}@${contractVersion}` (`base-domain-solver.ts:52-55`). Version bumps automatically re-probe.
   - **Future improvement**: Incorporate `engine_commitment` once reliably available for even finer-grained latch scoping

3. **Classification provenance**: `buildEpisodeLinkageFromResult()` returns `{ linkage, classified }` where `classified.source` is `'structured'` or `'heuristic'`. Governance code should only enforce/learn from `'structured'` classifications.
   - **Current state**: Helper exists; not yet enforced at the Sterling protocol level

4. **Substrate coherence**: Solve result substrate (`buildingSolveResultSubstrate`) captured at solve-time can become stale if replans occur. The coherence check (`substrateIsCoherent`) compares `substrate.bundleHash` against `keysForThisPlan.bundleHash` — substrate is only used when they match.
   - **Why**: Without this check, replan A's substrate could misclassify replan B's failure (e.g., reporting SEARCH_EXHAUSTED when the failure was actually EXECUTION_FAILURE from a different plan).
   - **Fallback**: When incoherent, falls back to binary classification (EXECUTION_SUCCESS/EXECUTION_FAILURE)

```
  Broken links fixed:
  - Removed 4 dead references to deleted strategy docs (INTEGRATION_STRATEGY.md, RISK_MANAGEMENT.md, VERIFICATION_FRAMEWORK.md,
  FUTURE_ENHANCEMENTS.md) and the non-existent docs/working_specs/ directory
  - Rewrote the Documentation section to point to current canonical locations (Module Overview, Cognitive Flow, Leaf Execution Pipeline,
  Sterling Capability Tracker, Rig Specs, etc.)
  Inaccurate claims removed:
  - Removed "Enhanced Task Parser" — no source code exists
  - Removed "Emotional Memory LLM Adapter (680 lines)" — no source code exists
  - Removed "95% implementation completion" — unverifiable
  - Removed all per-package completion percentages (85%, 100%) — unverifiable
  - Removed all specific line counts throughout (they were stale by 14-95% and are a maintenance burden)
  - Removed "LLM fine-tuning" reference from the Identity Memory System abstract bullet
  Stale code references fixed:
  - Updated Task Execution Pipeline mermaid diagram: replaced stale line numbers with file names, corrected function locations (e.g.,
  generateDynamicSteps() is in sterling-planner.ts, not task-integration.ts; action filtering uses ROUTABLE_ACTIONS in
  thought-to-task-converter.ts)
  - Removed specific line number references from Thought Type Taxonomy, Cognitive Stream Flow diagram, and Key Code Paths section
  - Updated Fallback Macro Planner section to reference correct file locations (modules/requirements.ts, modules/leaf-arg-contracts.ts,
  task-integration/sterling-planner.ts)
  Diagrams updated:
  - Task Execution Pipeline now reflects actual 4-path architecture (3 Sterling + fallback-macro) instead of 5-path with non-existent
  generateStepsFromCognitive() and generateIntelligentSteps()
  - Removed stale path references
  Theory vs implemented distinction:
  - Added scope note before Background and Motivation clarifying that Background/Experimental Design/Implementation Considerations are
  aspirational while Core Systems/Architecture/Quick Start reflect current codebase
  - Labeled Performance Metrics section as "Performance Targets" with a note they're design targets
  - Labeled Memory System Performance as "Design Targets"
  - Toned down promotional language ("Revolutionary Enhancement" → "Dynamic Thought Generation", removed "(Latest Addition)" markers)
  - Simplified Research Readiness section to be more accurate
  - Cleaned up emoji-heavy headers
  Content corrections:
  - Updated Evaluation Package description to match actual contents (type definitions + thought generator test, not non-existent
  Performance Analyzer/Scenario Manager/Curriculum System)
  - Updated Cognition Package to reflect actual modules (thought-generator, social-cognition module, intrusive-thought-processor,
  llm-output-sanitizer, social-awareness-manager)
  - Updated Planning Package to include Sterling Solvers and Task Integration Pipeline
  - Updated Safety Package to reflect full module contents
  - Updated Next Development Phase to replace "Enhanced Task Parser" with "Sterling Solver Hardening"
✻ Brewed for 12m 14s
❯ What are the Rigs intended for and how does this connect to and utilize Sterling?
⏺ Let me investigate the rig system and its relationship to Sterling.
⏺ Explore(Explore rig system and Sterling)
  ⎿  Done (17 tool uses · 74.0k tokens · 1m 34s)
⏺ Here's the full picture.
  What Rigs Are
  Rigs are capability validation testbenches — each one proves a single planning primitive works end-to-end, from specification through
  Sterling search to bot execution. They're named A through K (with L–N deferred), and each owns a specific reasoning capability like "can
  this agent craft a thing?" or "can it plan actions that have time durations?"
  Each rig has:
  - A formal primitive it proves (from the P1–P21 primitive catalog)
  - Three certification axes: contract (TS types, determinism, linting), E2E (real Sterling solver), and transfer (same invariants on
  non-Minecraft domains)
  - A PLAN doc (what to build) and APPROACH doc (how to build it)
  The Primitive System (P1–P21)
  Primitives are domain-agnostic problem signatures. They describe the shape of a reasoning problem, not its domain:
  ┌───────────┬────────────────────────────────────────────────────────────────────────────┬──────────────────────────────────────────────┐
  │ Primitive │                                 Capability                                 │                   Example                    │
  ├───────────┼────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ P1        │ Deterministic transformation                                               │ state + operators → minimal-cost path        │
  ├───────────┼────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ P2        │ Capability gating                                                          │ actions unlock/disable based on capabilities │
  ├───────────┼────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ P3        │ Temporal planning                                                          │ actions have duration; avoid deadlock        │
  ├───────────┼────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ P4        │ Multi-strategy acquisition                                                 │ multiple approaches to same goal             │
  ├───────────┼────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ P5        │ Hierarchical planning                                                      │ macro decomposition + micro solvers          │
  ├───────────┼────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ P6        │ Valuation under scarcity                                                   │ resource allocation under constraints        │
  ├───────────┼────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ P7        │ Partial-order feasibility                                                  │ dependency DAG; some steps commute           │
  ├───────────┼────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ P8–P13    │ Systems synthesis, epistemic, invariant maintenance, irreversibility, etc. │                                              │
  ├───────────┼────────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────┤
  │ P14–P21   │ Program search, fault diagnosis, audit explanations, entity belief, etc.   │                                              │
  └───────────┴────────────────────────────────────────────────────────────────────────────┴──────────────────────────────────────────────┘
  Each rig implements one or more primitives. For example, Rig A proves P1 (deterministic transformation) via the crafting solver.
  How Rigs Connect to Sterling
  Sterling is a Python A* search server that communicates over WebSocket (ws://localhost:8766). The responsibility split is:
  ┌──────────────┬─────────────────────────────────────────────────┬────────────────────────────────────────────┐
  │    Layer     │           conscious-bot (TypeScript)            │             Sterling (Python)              │
  ├──────────────┼─────────────────────────────────────────────────┼────────────────────────────────────────────┤
  │ Domain rules │ Builds MinecraftCraftingRule[] from mcData      │ Operators in minecraft_domain.py           │
  ├──────────────┼─────────────────────────────────────────────────┼────────────────────────────────────────────┤
  │ Validation   │ Compat linter (14 checks, fail-closed)          │ Trusts contract version                    │
  ├──────────────┼─────────────────────────────────────────────────┼────────────────────────────────────────────┤
  │ Strategy     │ Rig D: strategy ranking, prior filtering        │ Naive A* search                            │
  ├──────────────┼─────────────────────────────────────────────────┼────────────────────────────────────────────┤
  │ Search       │ —                                               │ A* with heuristic, returns steps + metrics │
  ├──────────────┼─────────────────────────────────────────────────┼────────────────────────────────────────────┤
  │ Execution    │ Task → leaf → Mineflayer bot action             │ —                                          │
  ├──────────────┼─────────────────────────────────────────────────┼────────────────────────────────────────────┤
  │ Learning     │ Episode reporting, prior updates (planId-gated) │ Edge cost learning                         │
  └──────────────┴─────────────────────────────────────────────────┴────────────────────────────────────────────┘
  The Data Flow
  Thought-to-Task Pipeline (cognitive thought: "I should craft an iron pickaxe")
      │
      ▼
  Requirement Resolution → maps action to rig
      │     (e.g., 'craft' → Rig A, 'tool_progression' → Rig B)
      ▼
  TS Solver Class (e.g., MinecraftCraftingSolver)
      │  - Loads context: inventory, nearby blocks, mcData
      │  - Builds rules: buildCraftingRules(mcData, goal)
      │  - Lints rules: compat-linter (14 checks)
      │  - Hashes inputs for SolveBundle
      ▼
  Wire Payload → Sterling (WebSocket)
      │  { solverId, inventory, goal, rules, maxNodes, ... }
      ▼
  Sterling Python A* Search
      │  - Expands states from rules
      │  - Returns: steps, planId, searchHealth metrics
      ▼
  Bundle Construction (TS)
      │  - Content-addressed bundleId
      │  - stepsDigest, compatReport, searchHealth
      ▼
  Step Mapping → TaskStep[] with leaf args
      │  (e.g., { leaf: 'craft_recipe', args: { recipe: 'iron_pickaxe' } })
      ▼
  Executor Loop → Mineflayer bot action
      │
      ▼
  Episode Reporting → updates priors only on execution success
  The Six Production Solvers
  ┌──────────────────────────────────────────┬─────┬──────────────────────────────────────────────────────┐
  │                  Solver                  │ Rig │                     What It Does                     │
  ├──────────────────────────────────────────┼─────┼──────────────────────────────────────────────────────┤
  │ MinecraftCraftingSolver                  │ A   │ Crafting rules from mcData recipe tree               │
  ├──────────────────────────────────────────┼─────┼──────────────────────────────────────────────────────┤
  │ MinecraftToolProgressionSolver           │ B   │ Tier decomposition: wooden → stone → iron → diamond  │
  ├──────────────────────────────────────────┼─────┼──────────────────────────────────────────────────────┤
  │ MinecraftAcquisitionSolver               │ D   │ Coordinates mine/craft/trade/loot/salvage strategies │
  ├──────────────────────────────────────────┼─────┼──────────────────────────────────────────────────────┤
  │ MinecraftBuildingSolver                  │ G   │ DAG with support/reachability constraints            │
  ├──────────────────────────────────────────┼─────┼──────────────────────────────────────────────────────┤
  │ MinecraftFurnaceSolver                   │ C   │ Temporal scheduling with duration + furnace slots    │
  ├──────────────────────────────────────────┼─────┼──────────────────────────────────────────────────────┤
  │ MinecraftNavigationSolver + MacroPlanner │ E   │ Route planning with Dijkstra macro layer             │
  └──────────────────────────────────────────┴─────┴──────────────────────────────────────────────────────┘
  Current Implementation Status
  Implemented and certified (varying E2E coverage):
  - Rig A — CONTRACT-CERTIFIED + E2E-PROVEN (crafting)
  - Rig B — CONTRACT-CERTIFIED + PARTIAL E2E (tool progression)
  - Rig C — CONTRACT-CERTIFIED, no E2E yet (furnace scheduling)
  - Rig D — CONTRACT-CERTIFIED + E2E-PROVEN (all 4 acquisition strategies)
  - Rig E — CONTRACT-CERTIFIED, no E2E yet (hierarchical planning)
  - Rig G — CONTRACT-CERTIFIED + PARTIAL E2E (building)
  - P21 (I-ext) — Partial (entity belief/saliency capsule types)
  Spec only (not started):
  - Rigs F, H, I, J, K (valuation, systems synthesis, epistemic, invariant, irreversibility)
  - Rigs L–N deferred to Track 4
  The Quality Contract
  Per CLAUDE.md, every PR touching solver wiring must provide: unit tests asserting solveMeta.bundles shape, a live-backend E2E test
  against real Sterling, a payload-equivalence snapshot proving wire stability, and deterministic bundle ID tests. This ensures
  observability wiring is proven, not just "tests pass."
✻ Worked for 2m 17s
❯ What does sterling's readme say it is? is that backed up with what we're using it for or are we missing a huge opportunity with some
   of the other capabilities that Sterling has and is working towards in their project? e.g.
  @/Users/darianrosebrook/Desktop/Projects/sterling/docs/roadmap/README.md or the main readme?
  ⎿  Read ../sterling/docs/roadmap/README.md (253 lines)
⏺ Let me read Sterling's own documentation to understand what it claims to be and compare that against how conscious-bot uses it.
⏺ Read 2 files (ctrl+o to expand)
⏺ Now let me check how conscious-bot actually uses Sterling — what it sends and what it consumes:
⏺ Explore(Audit Sterling usage in conscious-bot)
  ⎿  Done (35 tool uses · 78.0k tokens · 1m 47s)
⏺ This is a significant finding. Here's the full picture:
  What Sterling Says It Is
  Sterling describes itself as a "path-finding system over semantic state space" — a neurosymbolic reasoning engine that explicitly tries
  to replace LLMs as the reasoning substrate. Its readme opens with "Sterling is NOT a Language Model." The core architecture includes:
  - UtteranceState IR: A structured intermediate representation for language with 5 layers (syntax, semantics, semiotics, pragmatics,
  latent)
  - S/M/P/K/C Operator Taxonomy: Typed reasoning operators (Structural, Meaning, Pragmatic, Knowledge, Control)
  - Cross-Domain Bridge Architecture: Runtime-computed transitions between different reasoning domains with cost accounting
  - Learned Value Functions: A TransitionScorer neural network that learns from past reasoning episodes to guide search
  - Knowledge Graph with Memory Decay: Usage-based pruning and forgetting for long-horizon reasoning
  - Governance & Certification: Run intents (dev/certifying/promotion/replay), fail-closed gates, witness-first governance, deterministic
  episode replay
  - Proof & Verification: TD-12 certificates, cryptographic evidence chains, compositional proofs
  - 11 Core Constraints: No free-form CoT, explicit state, no hidden routers, oracle separation, etc.
  - Cross-domain results: 29-600x faster than GPT-4 on WordNet navigation, 100% solve rate on IR constraint tasks, Rush Hour puzzle solving
  Sterling's roadmap (docs/roadmap/README.md) shows it's working toward 10 capability axes — partial observability, stochasticity,
  adversarial robustness, uncertainty calibration, continual learning, transfer/composition, language grounding, safe tool execution, and
  compute governance.
  What Conscious-Bot Actually Uses
  Conscious-bot treats Sterling as a raw A search endpoint over WebSocket.* Here's the capability matrix:
  ┌────────────────────────────────────────────┬───────┬─────────────────────────────────────────────┐
  │            Sterling Capability             │ Used? │                    Notes                    │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ A*/Best-first search                       │ YES   │ The one thing used — all 5 domain solvers   │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ Streaming search messages                  │ YES   │ discover, search_edge, solution_path        │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ Path algebra edge learning                 │ YES   │ Edge weight updates via report_episode      │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ UtteranceState IR                          │ NO    │ Not used at all                             │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ S/M/P/K/C operator taxonomy                │ NO    │ Not used                                    │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ Cross-domain bridges                       │ NO    │ Each domain is hermetic                     │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ Learned value functions (TransitionScorer) │ NO    │ Only heuristic scoring                      │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ Governance (run intents, certification)    │ NO    │ No role-based access                        │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ Knowledge Graph navigation                 │ NO    │ Sterling maintains internal KG, not queried │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ Memory decay engine                        │ NO    │ Learning persists indefinitely              │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ Episode logging / replay                   │ NO    │ Fire-and-forget reporting                   │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ RGBA compression                           │ NO    │ Not needed                                  │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ Self-correction / backtracking             │ NO    │ Replans from scratch on failure             │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ Proof/verification (TD-12)                 │ NO    │ Not wired                                   │
  ├────────────────────────────────────────────┼───────┼─────────────────────────────────────────────┤
  │ Cross-domain WordNet/Escape/etc.           │ NO    │ Only Minecraft domains                      │
  └────────────────────────────────────────────┴───────┴─────────────────────────────────────────────┘
  The wire protocol is simple: conscious-bot sends { command: 'solve', domain: 'minecraft', inventory, goal, rules, maxNodes } and gets
  back a solution path. That's it.
  The Missed Opportunities
  There are several areas where Sterling's capabilities could substantially benefit conscious-bot:
  1. Cross-Domain Bridges → Multi-step reasoning chains
  Sterling can bridge between domains at runtime. Conscious-bot currently treats crafting, navigation, building, and acquisition as
  hermetic. If bridges were enabled, Sterling could natively handle "navigate to the forest, then gather wood, then craft a pickaxe" as a
  single cross-domain solve rather than requiring the task-integration layer to orchestrate separate solves sequentially.
  2. Learned Value Functions → Faster solves
  Sterling's TransitionScorer learns from past episodes to prioritize fruitful search paths. Conscious-bot only uses heuristic scoring.
  Wiring the value function could reduce node expansion counts significantly (Sterling claims 38% reduction on IR navigation puzzles).
  3. Governance & Certification → Trusted solver output
  Sterling's governance infrastructure (run intents, witness-first gates, fail-closed semantics) is exactly the kind of observability the
  CLAUDE.md evidence-first review contract wants. Conscious-bot built its own SolveBundle/compat-linter observability layer in TypeScript,
  but Sterling already has a more mature version of this in Python (TD-12 certificates, deterministic replay, evidence bundles).
  4. Knowledge Graph → Persistent world knowledge
  Sterling's KG with memory decay could serve as a second memory backend alongside PostgreSQL/pgvector. The KG already implements
  usage-based forgetting, which mirrors conscious-bot's own memory decay manager.
  5. Episode Replay → Regression detection
  Sterling can replay past episodes deterministically to detect if solver behavior has drifted. Conscious-bot currently does episode
  reporting fire-and-forget. Full replay would satisfy the CLAUDE.md requirement for regression evidence.
  6. Self-Correction → Plan repair
  Sterling can backtrack and try alternative paths when it detects dead-ends. Currently conscious-bot replans from scratch when a step
  fails, which is more expensive.
  7. Sterling's Roadmap Capabilities → Future conscious-bot features
  Sterling's Phase C/D work maps directly to conscious-bot's aspirational rigs:
  - Partial observability (Sterling C.1 Mastermind) → Rig I (Epistemic Planning)
  - Stochasticity (Sterling C.2 Slippery Gridworld) → Rig F (Valuation under Scarcity)
  - Safe tool execution (Sterling C.4 Transactional KV) → Rig K (Irreversibility)
  - Continual learning (Sterling D.2 Curriculum) → conscious-bot's curriculum system aspirations
  Summary
  Conscious-bot is using maybe 10-15% of what Sterling offers. The integration is intentionally minimal and additive (per CLAUDE.md
  guidance), but there's a substantial gap between Sterling's ambitions as a "reasoning substrate that replaces LLMs" and conscious-bot's
  usage as "a WebSocket A* solver for Minecraft inventory problems." Whether to close that gap depends on priorities — the current approach
   keeps the two projects loosely coupled, but it means conscious-bot is reimplementing capabilities (observability, learning, governance)
  that Sterling already provides natively.
  ```

---

## Hash Coupling Policy

This section governs how CB and Sterling evidence artifacts reference each other without entangling identity computation.

**Rule**: Sterling's identity hashes (`trace_bundle_hash`, `episode_hash`, `batch_certificate_hash`) are computed from Sterling-native commitments only. CB's `bundleHash` never participates in any Sterling hash computation.

**Rule**: CB stores Sterling-provided hashes verbatim but does not include them in `bundleHash` computation. Sterling-provided hashes are stored in `SolveBundleOutput` as opaque references.

**Rule**: The cryptographic link between CB evidence and Sterling evidence is a **binding hash** computed on the CB side: `bindingHash = sha256(trace_bundle_hash || bundleHash)`. This is the artifact CB uses for regression tests. It is not sent to Sterling.

**Why**: If `bundleHash` participated in `episode_hash`, Sterling's chain identity would change whenever CB changes canonicalization rules, adds non-semantic fields, or upgrades hashing. That undermines Sterling's internal replay and chain stability. The binding hash gives CB the same cryptographic assurance without cross-system coupling.

**Three-step identity chain**:

| Step | When | Identity produced | Computed by | Inputs |
|---|---|---|---|---|
| A. Solve-time | Sterling returns `complete` | `trace_bundle_hash` | Sterling | Search trace, operator registry, engine commitment |
| B. Execution-time | CB processes solve result | `bundleHash` | CB | `{input, output, compatReport}` canonical JSON |
| C. Report-time | CB sends `report_episode`, Sterling responds | `episode_hash` | Sterling | Prior influence hash, registry hash, result hash, operators used, `trace_bundle_hash` — NOT `bundleHash` |

Sterling stores `bundle_hash` as an `external_ref` alongside the episode record. CB stores `bindingHash = sha256(trace_bundle_hash || bundleHash)` as its proof link.

---

## Review 1: Governance + Proof Artifacts (SolveBundle vs TD-12/MS certs, replay)

### What Sterling has

Sterling's proof artifact chain is deeper than what conscious-bot currently consumes. Three layers exist:

| Sterling artifact | Location | Content-addressed? | What it binds |
|---|---|---|---|
| `MSRunManifestV1` | `core/memory/certification.py` | Yes (`compute_content_hash()`) | Schema closure, policy closure, memory head, index snapshots — everything that was allowed to influence results |
| `MSReportV1` | same | Yes | Rebuild verification: hashes, integrity checks, conflict/budget stats, outcome |
| `MSCertificateV1` | same | Yes (hash over manifest_ref + report_ref + outcome) | Sealed attestation envelope hash-locking manifest + report + outcome |
| `TraceBundleV1` | `core/contracts/trace_bundle.py` | Yes (proof_hash field) | Ordered canonical path (edge_ids, delta_ids, state_ids), goal witness, completeness declaration, decision witnesses |
| `EpisodeHashRecord` | `core/operators/episode_chain.py` | Yes (episode_hash) | Deterministic episode identity: prior_influence_hash, registry_hash, result_hash, operators_used |
| `BatchCertificate` | same | Yes (Merkle root) | Aggregates episodes; append-only chain via previous_batch_hash |
| `H2EvidenceBundle` | `core/proofs/h2_evidence_bundle.py` | Yes (EB-1: content-addressed bundle_id) | Multi-phase verification (integrity → schema → consistency → replay); multi-regime requirement (EB-5) |
| `ExecutionAttestation` | `core/operators/execution_attestation.py` | Yes (verification_digest) | IR change detection, granted capabilities, governance session (no timestamps) |

### What conscious-bot has (Updated 2026-02-03)

| CB artifact | Location | Content-addressed? | What it binds |
|---|---|---|---|
| `SolveBundle` | `solve-bundle-types.ts` | Yes (`bundleHash = sha256(canonical {input, output, compatReport})`) | Input hashes (definition, state, goal, nearbyBlocks), output digest (steps, solved, planId, searchHealth), compat report |
| `CompatReport` | same | Partially (participates in bundleHash; `checkedAt` excluded) | Linter validity, issues, definition count |
| `SearchHealthMetrics` | same | No (optional, not hashed) | 11 A* diagnostic fields |
| `SolveRationale` | same | No (optional, not hashed) | Bounding constraints, search effort, termination, shaping evidence |
| `DomainDeclarationV1` | `domain-declaration.ts` | Yes (content-addressed digest) | Solver claims: primitives, consumed/produced fields, contract version |
| `SterlingIdentity` | `solve-bundle-types.ts:196-215` | No (opaque references from Sterling) | `traceBundleHash`, `engineCommitment`, `operatorRegistryHash`, `completenessDeclaration`, `bindingHash` |
| `EpisodeLinkage` | `solve-bundle-types.ts:274-288` | No (correlation only) | `bundleHash`, `traceBundleHash`, `outcomeClass`, `engineCommitment`, `operatorRegistryHash` |
| `SolveJoinKeys` | `solve-bundle-types.ts` | No (per-domain storage) | `planId`, `bundleHash`, `traceBundleHash`, `solverId`, `engineCommitment`, `operatorRegistryHash` |

### Field-by-field mapping: SolveBundle → Sterling certificate/episode

| SolveBundle field | Sterling equivalent | Match quality | Notes |
|---|---|---|---|
| `input.definitionHash` | `MSRunManifestV1.schema_closure_ref` | **Semantic match** | Both capture "what rules/operators were in play." Sterling's is more granular (separate schema closure + policy closure). |
| `input.initialStateHash` | `MSRunManifestV1.index_snapshot_refs` | **Semantic match** | Both capture initial world state. Sterling additionally captures memory head. |
| `input.goalHash` | `TraceBundleV1.goal_witness.goal_predicate_hash` | **Direct equivalent** | Sterling explicitly separates goal predicate from goal satisfaction witness. |
| `output.stepsDigest` | `TraceBundleV1.edge_ids` (canonical path) | **Structural match** | Both capture ordered solution steps. Sterling also preserves decision witnesses at each choice point. |
| `output.solved` | `MSReportV1.outcome.kind == "DECISION"` | **Direct equivalent** | Sterling distinguishes DECISION (solved) from CERTIFIED_FAILURE (proved unsolvable). |
| `output.searchStats` | `TraceBundleV1.path_length` + decision witness count | **Partial** | Sterling's is richer: per-step decision witnesses with candidate scores. |
| `output.searchHealth` | `SearchHealthAccumulator` output (Python) | **Same data** | Already wired end-to-end. TS parses Python's accumulator output. |
| `compatReport` | `ExecutionAttestation.granted_capabilities` | **Conceptual overlap** | Both answer "is this solve legitimate?" Sterling's is post-hoc detection; CB's is preflight validation. Complementary, not redundant. |
| `bundleHash` | (no Sterling equivalent — CB-only artifact) | **Distinct scope** | `bundleHash` captures CB solver behavior. `trace_bundle_hash` captures Sterling search behavior. `episode_hash` captures execution. Three different identity scopes. |
| `compatReport.checkedAt` | (excluded from all Sterling hashes) | **Same pattern** | Both systems exclude timestamps from identity hashes. Sterling is more explicit: `ExecutionAttestation` has no timestamps at all. |
| `SolveRationale` | `SearchDecisionWitnessV1` | **Sterling is richer** | Sterling captures per-step decision reasoning (candidate scores, ordering keys, neural score refs). CB's rationale is solve-level summary. |

### Solve identity vs episode identity: don't conflate them

A solve response returns the identity of the **search trace** (what Sterling calls `TraceBundleV1` / proof hash). An `EpisodeHashRecord` is an **execution-scoped** chain element that should only exist once CB has sent `report_episode`.

Returning something called `episode_hash` at solve time would either lie (it isn't an episode) or force Sterling to mint episode-like identifiers for unexecuted plans, breaking credit assignment invariant 5 ("only executed outcomes update priors") and confusing replay semantics.

The correct identity chain:

| Phase | Identity | Produced when | Computed from |
|---|---|---|---|
| Solve-time | `trace_bundle_hash` | Sterling returns `complete` | Search trace, operator registry, engine commitment |
| Execution-time | `bundleHash` | CB processes solve result + linter | `{input, output, compatReport}` canonical JSON |
| Report-time | `episode_hash` | Sterling responds to `report_episode` | Sterling-native commitments + `trace_bundle_hash` |

### Completeness declarations: Sterling-authored, CB-forwarded

CB cannot independently substantiate proof completeness claims — Sterling is the solver-of-record. Rather than adding a CB-authored "completeness" field (which risks becoming aspirational or stale), treat `CompletenessDeclarationV1` as an upstream-provided field:

- Sterling returns `completeness_declaration` alongside `trace_bundle_hash` in the `complete` message
- CB stores it verbatim in `SolveBundleOutput`
- CB uses it in CI assertions and gating (e.g., "this bundle has a complete proof")
- CB never authors or modifies completeness claims

### Decision: Replace SolveBundle or embed it?

**Recommendation: Embed SolveBundle into Sterling episode report via external reference.**

Rationale:
1. SolveBundle is the right granularity for the TypeScript side — it captures what the TS solver did, which is complementary to what Sterling's search engine did.
2. Replacing SolveBundle with MSCertificateV1 would require TS to parse Sterling's full certification chain, which is complex and couples CB to Sterling internals.
3. The integration point is `external_refs` on the episode record: Sterling stores `{ cb_solve_bundle_hash: bundleHash }` alongside the episode, but does NOT include it in `episode_hash` computation (see Hash Coupling Policy above).

### What constitutes "drift" vs "allowed change" for replay

Sterling's `TraceBundleV1` has explicit drift detection fields (GOV-7):
- `proof_spec_id` + `proof_spec_version`: versioned proof contract
- `engine_commitment`: engine version hash
- `operator_registry_hash`: operator set identity

Drift classification: if `engine_commitment` or `operator_registry_hash` changed between replay and original, it's `IMPLEMENTATION_DRIFT`. If `proof_hash` diverges with identical commitments, it's `PROOF_HASH_MISMATCH` (a real bug).

CB can now classify drift using the three identity hashes:
- `bundleHash` changed → **CB solver change** (intentional refactor or regression)
- `trace_bundle_hash` changed with same `bundleHash` → **Sterling search drift** (engine update, heuristic change, or non-determinism bug)
- `episode_hash` changed with same `trace_bundle_hash` → **Sterling execution chain drift** (chain linkage or prior influence change)
- `bindingHash` changed → either side changed; decompose via the above

---

## Review 2: Cross-Domain Bridging (WorldAdapters / landmarks / staged search)

### What Sterling has

Sterling's bridge architecture lives in `core/recursion/`:

**Adapter protocols** (`adapters.py`):
- `StateGraphWalkAdapterV1`: `get_children(node_digest)` → deterministic state graph traversal
- `ClosureAdapterV1`: `get_dependencies(artifact_digest)` → closure verification
- `RegistryResolveAdapterV1`: `ladder_keys()` → deterministic registry lookup

**Recursion levels**:
- `rc2_walk.py`: 2-level decomposition (macro/micro)
- `rc4_closure.py`: 4-level closure (artifact dependency verification)
- `rc9_resolve.py`: 9-level resolution (full recursion)

**Landmarks** (`core/memory/`):
- `LandmarkNode`: checkpoint in state space
- `LandmarkRegistry`: landmark storage and lookup
- `LandmarkGate`: gating conditions at landmarks
- `LandmarkExtractor`: automated landmark extraction from traces

### What conscious-bot does today

Multi-domain tasks are stitched in TypeScript:
1. `sterling-planner.ts` dispatches to domain-specific solvers
2. Each solver makes independent `service.solve()` calls
3. Results are stitched back into task steps
4. No inter-domain communication during search

Current multi-domain patterns:
- **Rig B** (tool progression): TS decomposes into tiers → per-tier crafting solve → stitch
- **Rig D** (acquisition): TS enumerates strategies → per-strategy solve → stitch
- **Rig E** (hierarchical): TS macro planner → per-edge micro decomposition → stitch
- **Rig G** (building): TS DAG builder → per-module solve → stitch

### Bridge feasibility analysis

**Question**: Can we represent "navigate→acquire→craft→place" as one solve without losing determinism + legality gates?

**Assessment: Not yet, but the path is clearer than it looks.**

Sterling's `StateGraphWalkAdapterV1` already supports cross-domain edges: `get_children()` returns `WalkChildLinkV1` with `operator_id` and `operator_version`. A "bridge operator" would be an operator whose `operator_id` references a different domain's solver.

**What's missing (blocking reasons)**:

1. **Domain isolation in the Python solver**: `minecraft_domain.py`, `building_domain.py`, and `navigation_domain.py` are independent A* instances. There is no mechanism to compose them into a single search space. Sterling's engine could do this (the adapter protocol supports it), but the Minecraft eval domains don't use it.

2. **State representation mismatch**: Crafting state is an inventory multiset. Building state is a module dependency graph. Navigation state is a position + waypoint set. These have no common state type. A bridge needs a "lifted" state that projects into each domain.

3. **Legality gate composition**: Each domain has its own legality gates (cap: tokens for tool progression, support constraints for building, reachability for navigation). A single search would need to compose these gates, which risks either:
   - Over-constraining (false infeasibility when one domain's gate falsely blocks another domain's operator)
   - Under-constraining (missing a cross-domain interaction)

4. **Partial execution feedback**: Sterling's `rc2_walk` supports plan repair via `get_children()` on intermediate states. But the CB solvers currently don't expose intermediate states — they return complete plans.

**What's not blocking**:

- **Admissibility**: Cross-domain cost composition is straightforward (additive costs across domains). Sterling's A* handles this natively.
- **Determinism**: If bridge operators have deterministic preconditions/effects (they must), cross-domain search inherits determinism from single-domain search.
- **Evidence**: SolveBundle already captures per-solve evidence. Cross-domain bundles would be a sequence of per-domain bundles with bridge operators linking them.

### Verdict

**Not ready for a single-call cross-domain solve.** The blocking issue is domain isolation in the Python solver layer. The adapter protocol supports it architecturally, but the eval domains don't use it, and the state representation mismatch requires non-trivial design work.

**What to do instead (cheaper, higher-leverage)**:

Define 3–5 "typed bridge edges" as TS-level orchestration contracts. Each bridge edge is a **first-class evidence artifact** with content-addressed identity:

| Bridge | From domain | To domain | Contract |
|---|---|---|---|
| `acquire_for_craft` | acquisition (D) | crafting (A) | Precond: item identified + strategy ranked. Effect: item in inventory. |
| `craft_for_build` | crafting (A) | building (G) | Precond: recipe + materials. Effect: module materials available. |
| `navigate_for_acquire` | navigation (E) | acquisition (D) | Precond: target location known. Effect: at location with context tokens. |
| `craft_for_tier` | crafting (A) | tool progression (B) | Precond: lower tier tool. Effect: higher tier capability. |
| `acquire_for_tier` | acquisition (D) | tool progression (B) | Precond: materials available via strategy. Effect: tool crafted. |

**Each bridge edge stores**:
- Precondition witness (content-addressed hashes of relevant state projections)
- Referenced solve artifacts (`trace_bundle_hash` and/or `bundleHash` from each domain segment)
- Postcondition witness (content-addressed hashes)
- Bridge semantics version (for evolution tracking)

This turns orchestration glue into something replayable and auditable — and later convertible into a Sterling operator when/if state types are unified.

**Acceptance test for future single-call solve**: "Single solve call emits a plan with mixed-domain steps; replay verifies identical plan under fixed seed/inputs; per-domain legality gates are individually verifiable from the composite trace."

---

## Review 3: Learned Value Functions / TransitionScorer Integration

### What Sterling has

Sterling's TD-λ learning infrastructure (`core/td/`):

**Environment** (`td/env.py`):
- `WordNetEnv`: deterministic MDP for KG navigation
- Hash-based seeded neighbor selection (reproducibility)
- `InvalidActionError` for strict masking (no "stay in place" fallback)

**Action space** (`td/action_space.py`):
- `TD_ALLOWED_OPERATOR_IDS = [0,1,2,3,5]` (5 operators × 16 ranks = 80 actions)
- Content-addressed: `action_space_hash`, `operator_vocab_hash`, `neighbor_policy_hash`
- Canonical neighbor policy = `"bfs_order"` (stable, data-load-order independent)

**Candidate scorer** (`td/candidate_scorer.py`):
- `CandidateScorer`: neural ranker scoring `(state, operator, candidate)` tuples
- Input: `concat(f_state[63], op_onehot[5], f_candidate[63], delta[9])` = 140 dims
- Solves rank-prediction identifiability

**Value model checkpoints** (`core/value/adapters.py`):
- `INTENT_AWARE_V81`: IntentAwareTransitionScorer (51-dim, base MLP)
- `DISTILLED_V85`: DistilledValueModelV85 (51-dim, residual MLP + multi-task heads)
- `LATENT_V75`: LatentValueModelV2 (IR_LATENT_V1 input, Transformer encoder)
- `STRUCTURAL`: Simple FC layers
- `strict_mode` enforcement for certification runs (fail-closed)

### What conscious-bot uses today (Updated 2026-02-03)

Episode reporting now includes identity linkage (`BaseDomainSolver.reportEpisode()`):
- Sends `report_episode` WS command with planId + outcome + `bundle_hash` + `trace_bundle_hash`
- Conditionally sends `engineCommitment` + `operatorRegistryHash` (behind `STERLING_REPORT_IDENTITY_FIELDS=1` toggle)
- Receives and parses `episode_hash` from response
- No structured feedback into search behavior (fire-and-forget pattern unchanged)
- Learning stability proven (invariant 4): wire payloads unchanged after episode reports
- No value function inference on the TS side

### Training signal requirements

Sterling's value functions require:
- **Data**: `(state, operator, candidate, reward)` tuples from executed trajectories
- **Labels**: TD targets computed from bootstrapped returns (temporal-difference learning)
- **Guarantee**: Learning only reorders exploration (priority queue scoring), never invents transitions. This is structurally enforced: operators are frozen at solve time; the value function only affects expansion order.

### How inference is applied during search

- **Priority queue scoring**: Value function scores are used as tie-breakers when `f(n)` values are equal. This is the primary mechanism.
- **Pruning behavior**: No hard pruning. Value functions affect ordering only. The reachable set is provably unchanged (invariant 4).
- **Non-determinism sources**: Model weight initialization (controlled by checkpoint loading), float precision (mitigated by quantized scoring). No other sources.

### Two replay regimes

"Replay verifies identical plan" is a stronger condition than needed for most benefits, and becomes false as soon as learning produces different tie-breaking. The correct discipline is two regimes:

**Regime A — Structural determinism (certification runs)**:
With the same payload + same `engine_commitment` + same `operator_registry_hash` + same value model ref, Sterling returns the same `trace_bundle_hash`. This is what you want for certification and golden-master tests.

**Regime B — Semantic determinism (learning-enabled runs)**:
With learning enabled, plan variation among cost-equal solutions is allowed. Enforce:
- **Reachable set unchanged**: `definitionHash` equality + operator closure hash equality across all episodes
- **Optimality unchanged**: plan cost within epsilon (or exactly equal if costs are integers) — cost-equal alternatives are acceptable
- **Legality unchanged**: every step in the returned plan verifies against the operator set

This prevents "learning improved search" from becoming "flaky deterministic tests." Regime A tests use `trace_bundle_hash` equality. Regime B tests use cost/legality invariants.

### Learning Efficacy Harness Spec

**Plugs into existing rig metrics via milestone M1** (already defined in tracker).

**Domain**: Acquisition (Rig D) with multiple near-equal plan families.

**Setup**:
1. Define 3 acquisition scenarios where mine/trade/loot all achieve the same goal with similar costs (within 20%)
2. Run each scenario 10 times with episode reporting enabled
3. After each episode, record `nodesExpanded`, `frontierPeak`, strategy frequency

**Measurement**:
- **Primary metric**: `nodesExpanded` trend over episodes (must decrease or plateau)
- **Secondary metric**: `frontierPeak` trend (should decrease as better ordering reduces open set)
- **Safety invariant (Regime B)**: Reachable transition set unchanged (assert via `definitionHash` equality across all episodes), plan cost within epsilon, all steps legal
- **Strategy frequency**: Track which strategy wins the ranking. If value function is helping, the "better" strategy should win more often over time.

**Acceptance**: Over 10 episodes:
1. `nodesExpanded_episode10 / nodesExpanded_episode1 < 0.9` (at least 10% improvement) OR strategy frequency shifts toward lower-effort plans
2. `definitionHash` identical across all episodes (reachable set unchanged)
3. Plan costs non-increasing (within float tolerance) — learning never makes plans more expensive
4. All episodes produce valid SolveBundles with `searchHealth`

**What exists vs what's needed**:
- **Exists**: `acquisition-benchmark.test.ts` (15 tests) proves operator set immutability and prior stabilization. `performance-baseline-e2e.test.ts` proves stability (convergence ratio = 1.0).
- **Needed**: A Regime B test that proves convergence ratio < 1.0 on a problem with multiple near-tied plans. This requires crafting scenarios where the heuristic has room to discriminate (current scenarios have near-degenerate heuristics: `pctSameH ≈ 0.98`).

---

## Review 4: Domain Declarations + Primitive Claim Routing as Rig Identity

### What Sterling has

The full pipeline is implemented on the Sterling side:

| Component | Status | Key mechanism |
|---|---|---|
| `PrimitiveSpecV1` + `PrimitiveRegistry` | Implemented | Data-driven obligation documents; P01–P05 factories |
| `CapabilityDescriptorV1` | Implemented | Per-primitive, content-addressed |
| `CapabilityClaimRegistry` | Implemented | `(domain_id, primitive_id, contract_version)` triple; hash from VERIFIED entries only |
| `ConformanceSuiteV1` | Implemented | Content-addressed with `suite_impl_ref` code identity binding |
| `DomainDeclarationV1` (Python) | Implemented | Long-lived capability commitment |
| `DomainSessionV1` | Implemented | Ephemeral session attachment |
| `_check_primitive_eligibility()` | Implemented | Proof-backed routing: structural + VERIFIED claims |

### What conscious-bot has

| Component | Status | Location |
|---|---|---|
| `DomainDeclarationV1` (TS) | ✅ Implemented | `domain-declaration.ts` |
| `QualifiedPrimitiveId` type | ✅ Implemented | `primitive-namespace.ts` |
| `CB_REQUIRES_ST` dependency mapping | ✅ Implemented | `primitive-namespace.ts` |
| `register_domain_declaration_v1` WS command | ✅ Implemented | Both sides |
| Cross-language digest parity | ✅ Proven | 35 corpus tests |
| Navigation solver declaration | ✅ Registered + verified | E2E tests |
| **Production solver declarations** | ✅ **Implemented** | All 6 solvers have static declarations; `ensureDeclarationRegistered()` wired |
| `ensureDeclarationRegistered()` | ✅ Implemented | `base-domain-solver.ts:237-258` |
| Connection-scoped registration | ✅ Implemented | Re-registers after reconnect via nonce |
| Mode-aware failure handling | ✅ Implemented | DEV = log + continue; CERTIFYING = throw |

### How `required_primitives` gates routing at runtime

Sterling's `_check_primitive_eligibility()` in the engine:
1. Loads `PrimitiveRegistry` (structural requirements: which flags must be set)
2. If `structural_only=True` on `SterlingOptions`: checks structural flags only (Level 1)
3. If `structural_only=False` (default): additionally checks `CapabilityClaimRegistry` for VERIFIED claims with matching `(domain_id, primitive_id, contract_version)`
4. Failure modes under strict intent: **hard fail** — solve request rejected before search begins

### Whether Sterling's primitive spec registry is extendable

`PrimitiveRegistry` loads from `data/primitive_specs/index.json`. Current entries: ST-P01 through ST-P05. The registry is designed to be extended:
- New entries added to `index.json`
- Factory functions create `PrimitiveSpecV1` instances
- No hardcoded limits beyond the regex `^(CB|ST)-P\d{2}$`

However, the engine-level specs (ST-Pxx) are distinct from domain-level primitives (CB-Pxx). Conscious-bot should NOT add CB-Pxx entries to Sterling's `PrimitiveRegistry`. Instead, CB-Pxx primitives are claims registered via `CapabilityClaimRegistry` that reference ST-Pxx requirements.

### Rig → Claim → Routing integration plan

**Which solvers should register `DomainDeclarationV1` by default**:

| Solver | solverId | Primitives to claim | Enforcement mode | Priority |
|---|---|---|---|---|
| `MinecraftCraftingSolver` | `minecraft.crafting` | CB-P01 (→ ST-P01) | DEV (structural_only initially) | High — foundational |
| `MinecraftToolProgressionSolver` | `minecraft.tool_progression` | CB-P01, CB-P02 (→ ST-P01) | DEV | High — depends on crafting |
| `MinecraftAcquisitionSolver` | `minecraft.acquisition` | CB-P01, CB-P04 (→ ST-P01) | DEV | Medium — delegates to crafting |
| `MinecraftBuildingSolver` | `minecraft.building` | CB-P07 (→ ST-P01) | DEV | Medium — partial E2E |
| `MinecraftNavigationSolver` | `minecraft.navigation` | (ST-P01 already registered) | DEV → CERTIFYING | Done (E2E proven) |
| `FurnaceSchedulingSolver` | `minecraft.furnace` | CB-P03 (→ ST-P01, ST-P02) | DEV | Low — no Python domain |

**Enforcement mode progression**:
1. **DEV** (now): declarations registered, routing uses `structural_only=True`. No solve rejections.
2. **DEV + claim verification** (next): declarations registered, routing checks VERIFIED claims but logs warnings instead of rejecting.
3. **CERTIFYING** (later): routing rejects unverified claims. Only for solvers with full E2E coverage.

**Production behavior when proof is missing**:
- **Recommended**: Structural-only opt-in by default (`SterlingOptions.structural_only = true`). Solvers opt into proof-backed routing explicitly when they have VERIFIED claims.
- **Hard fail**: Only in CI/certification environments where `STERLING_STRICT_ROUTING=1`.

### What needs to happen

1. ~~Add `registerDeclaration()` call to `BaseDomainSolver.connect()` (or equivalent setup method)~~ ✅ **DONE** — `ensureDeclarationRegistered()` in `base-domain-solver.ts`
2. ~~Each solver defines its `DomainDeclarationV1` as a static constant~~ ✅ **DONE** — All 6 solvers have declarations
3. ~~Registration happens on connection, before first solve~~ ✅ **DONE** — Connection-scoped via nonce
4. ~~Failed registration is non-fatal in DEV mode (log + continue)~~ ✅ **DONE** — Mode-aware handling implemented
5. Add `structural_only` option to `SterlingReasoningService.solve()` parameters — **Remaining**

---

## Review 5: Episode Logging Schema + Failure Taxonomy Alignment

### What Sterling has

**Episode chain** (`episode_chain.py`):
- `EpisodeHashRecord`: content-addressed episode identity with `prior_influence_hash`, `registry_hash`, `result_hash`, `operators_used`
- `BatchCertificate`: Merkle root over episode hashes
- `EpisodeProvenanceIndex`: by_operator index, episode_to_certs index

**Failure taxonomy** (`memory/failure.py`, `certification.py`):
- `CertifiedFailureV1`: deterministic failure with typed failure codes, causal facts, remediation hints
- `MSReportV1.outcome`: sum type `DECISION | CERTIFIED_FAILURE`

**Trace-level failure** (`trace_bundle.py`):
- `CompletenessDeclarationV1.is_proof_ready`: structural completeness check
- GOV-7 drift classification: `IMPLEMENTATION_DRIFT` vs `PROOF_HASH_MISMATCH`

### What conscious-bot has (Updated 2026-02-03)

Episode reporting now includes identity linkage:
- `BaseDomainSolver.reportEpisode()`: sends `{ command: 'report_episode', planId, outcome, metrics, bundle_hash, trace_bundle_hash, ... }` over WS
- **Identity fields**: `bundle_hash` and `trace_bundle_hash` always sent when available
- **Phase 1 fields**: `engineCommitment` and `operatorRegistryHash` conditionally sent (behind `STERLING_REPORT_IDENTITY_FIELDS=1` toggle)
- **Downgrade-on-rejection**: If Sterling rejects unknown fields, identity fields are dropped for that solverId
- **Failure taxonomy defined**: `EpisodeOutcomeClass` enum exists (`EXECUTION_SUCCESS`, `EXECUTION_FAILURE`, `SEARCH_EXHAUSTED`, etc.)
- **Failure taxonomy NOT wired**: `classifyOutcome()` exists but result is not sent in `report_episode` payload
- Rig G has `failureAtModuleId` (building-specific)
- Rig D has strategy-level failure tracking (no viable strategy, mine gated without mcData)

### Unified failure taxonomy

| Failure class | Where it "lives" | Sterling equivalent | CB current representation | Affects learning? |
|---|---|---|---|---|
| **Illegal transition** | Planner (preflight) | `OperatorIRVerifier` rejection | `CompatReport.issues` with `severity: 'error'` | No — solve never starts |
| **Precondition unsatisfied** | Planner (search) | `CertifiedFailureV1` with causal facts | `solved: false` + `terminationReason: 'frontier_exhausted'` | No — no plan to execute |
| **Search exhausted** | Planner (search) | `terminationReason: 'max_nodes'` | `SearchHealthMetrics.terminationReason: 'max_nodes'` | No — no plan to execute |
| **World drift** | Executor (runtime) | `IMPLEMENTATION_DRIFT` via `engine_commitment` mismatch | Not represented — executor doesn't detect this | Should not — plan was valid when emitted |
| **Execution failure** | Executor (runtime) | `ExecutionAttestation` stale if IR modified | Task-level failure (`task.status = 'failed'`) | Yes — negative credit via `cost_update_channel` |
| **Strategy infeasible** | Planner (Rig D) | `CertifiedFailureV1` with `ACQUISITION_NO_VIABLE_STRATEGY` | `CompatReport` issue code | No — filtered before solve |
| **Decomposition gap** | Planner (Rig E) | No direct equivalent | `decomposition_gap` in edge decomposer | No — macro level, not search |
| **Support infeasible** | Planner (Rig G) | No direct equivalent | `RigGSignals.feasibilityViolations` | No — structural constraint |
| **Heuristic degeneracy** | Planner (diagnostic) | SearchHealth anomaly detection | `DegeneracyReport.isDegenerate` + `reasons` | Diagnostic only — see `ordering_hint_channel` |

### Learning update channels

"Only `EXECUTION_FAILURE` updates priors" is correct as a first gate and matches global invariant 5. The nuance worth naming now (to prevent future "we hacked it into priors" accidents) is that planner-level negative evidence should be able to update **heuristics** without updating **transition costs**:

| Channel | What it accepts | What it changes | Invariant preserved |
|---|---|---|---|
| `cost_update_channel` | Execution-grounded outcomes only | Strategy priors, transition cost estimates | Invariant 5: only executed outcomes update priors |
| `ordering_hint_channel` | Planner-level signals (repeated `SEARCH_EXHAUSTED`, `HEURISTIC_DEGENERACY`) | Priority queue ordering, exploration bias | Invariant 4: no invented transitions, no changed semantics |

Example: repeated `SEARCH_EXHAUSTED` under bounded `maxNodes` might indicate a poorly-informed heuristic, not that the strategy is wrong. The `ordering_hint_channel` can accept this signal to adjust exploration priority without violating credit assignment.

Even if `ordering_hint_channel` is not implemented now, naming it in the taxonomy prevents future ambiguity about where planner feedback should flow.

### What to align

1. **Add `failure_class` field to `report_episode`**: ✅ **Implemented** — `EpisodeOutcomeClass` type, `classifyOutcome()`, `buildEpisodeLinkage()`, and `buildEpisodeLinkageFromResult()` all exist. `reportEpisode()` sends `outcome_class` when `linkage.outcomeClass` is defined (`base-domain-solver.ts:409`). **Adoption remaining**: Ensure all solver call sites use `buildEpisodeLinkageFromResult()` to guarantee classification.

2. **Add `causal_facts` to episode reports**: ❌ **Not started** — For `EXECUTION_FAILURE`, include `{ failureAtStep, expectedState, actualState }`. For `STRATEGY_INFEASIBLE`, include `{ filteredStrategies, filterReasons }`. This maps to `CertifiedFailureV1.causal_facts`.

3. **Tag each failure class with its update channel**: ✅ **Documented** — `EXECUTION_FAILURE` → `cost_update_channel`. `SEARCH_EXHAUSTED` + `HEURISTIC_DEGENERACY` → `ordering_hint_channel` (future). All others → no update. This is documented but channels not implemented.

---

## Review 6: Checkpoint/Resume as a General Primitive

### What Sterling has

**Landmarks** (`core/memory/`):
- `LandmarkNode`: checkpoint in state space with identity and metadata
- `LandmarkRegistry`: persistent storage with lookup by digest
- `LandmarkGate`: conditional activation at landmarks
- `LandmarkExtractor`: automated extraction from traces (identifies "important" states)

**Witnesses** (`core/recursion/witness.py`):
- `WitnessEnvelopeV1`: content-addressed proof with `schema_version`, `rc_id`, `payload`
- `emit_witness_v1()`: atomically stores witness and returns reference + digest

**Resumable search**: Sterling's adapter protocols (`get_children()`) support incremental expansion, which enables resuming from a previously reached state. However, there is no explicit "checkpoint/resume" API — it's implicit in the adapter-based search model.

### What conscious-bot has

Building checkpoint is the most developed pattern:
- Module witness: each building module has a completion attestation
- Bounded verification: `feasibility-checker.ts` validates constraints at each step
- Resume/repair: `minecraft-building-solver.ts:253-306` handles material deficit → replan

Tool progression has implicit checkpoints:
- Per-tier solve results persist
- If a higher tier fails, lower tier results are retained
- No explicit witness/attestation

### Checkpoint primitive extraction

**Minimal interface** (generalizing from building + tool progression patterns):

```typescript
interface CheckpointPrimitive<TState, TWitness> {
  /** Capture current progress as a content-addressed witness */
  createWitness(state: TState): TWitness & { witnessDigest: ContentHash };

  /** Verify a previously captured witness against current state */
  verifyWitness(witness: TWitness, currentState: TState): {
    valid: boolean;
    driftReasons: string[];
  };

  /** Determine whether to resume from checkpoint or repair/replan */
  decideResume(witness: TWitness, currentState: TState): {
    action: 'resume' | 'repair' | 'replan';
    resumeFromStep?: number;
    repairPlan?: RepairSpec;
  };

  /** Generate repair steps if checkpoint is partially valid */
  generateRepair(witness: TWitness, currentState: TState): RepairSpec;
}
```

**Existing implementations mapped to this interface**:

| Domain | createWitness | verifyWitness | decideResume | generateRepair |
|---|---|---|---|---|
| Building (G) | Module completion attestation | Feasibility checker | Material deficit → replan, structure intact → resume | Deficit → acquisition steps |
| Tool progression (B) | Per-tier solve result | Tier capability check | Lower tiers done → resume higher tier | Re-solve missing tier |
| Acquisition (D) | Strategy ranking + prior state | Context token check (entities still present?) | Context changed → re-rank; same context → resume | Re-enumerate strategies |
| Navigation (E) | Macro path + edge completion | Path still valid (costs unchanged?) | Edge failed → replan with feedback | Macro replanner with updated costs |

**Mapping to Sterling landmarks**:
- `createWitness` → `LandmarkExtractor` identifies checkpoint-worthy states; `emit_witness_v1` stores them
- `verifyWitness` → `LandmarkGate` checks conditions at stored landmarks
- `decideResume` → Not directly in Sterling; this is control-plane logic that should stay in CB
- `generateRepair` → Sterling's `rc2_walk.get_children()` from a landmark state

**What to do**: Define `CheckpointPrimitive<TState, TWitness>` as a TypeScript interface in `packages/planning/src/sterling/`. Implement it for building first (it's closest to complete), then tool progression. Don't try to push this into Sterling as a native primitive — checkpoint semantics are domain-specific (what counts as "repairable" vs "must replan" differs per domain). Sterling provides the storage and verification machinery; CB provides the decision logic.

---

## Review 7: Goal Binding as the Control Plane Above Sterling

### The boundary

This is the most important review item to get right, because it determines what Sterling must never do.

**Sterling is**: a deterministic solver + evidence producer. Given a problem definition (state, operators, goal, constraints), it produces a plan + proof artifacts.

**Goal binding is**: the orchestration layer that decides what problems to give Sterling, when to re-solve, and how to manage task lifecycle. This stays in conscious-bot.

### Control-plane boundary contract

**Events that CAN trigger re-solves**:

| Event | Who decides | What happens |
|---|---|---|
| Task created (goal activated) | Goal binding (CB) | New solve request dispatched to Sterling |
| Execution failure at a step | Task executor (CB) | Re-solve with updated state |
| World state changed significantly | Perception (CB) | Re-solve with new state (if active task affected) |
| Prior updated after episode | Learning (Sterling + CB) | Next solve benefits from updated ordering |
| Strategy ranking changed | Acquisition coordinator (CB, Rig D) | Re-rank and possibly re-solve |
| Macro path cost updated | Feedback integration (CB, Rig E) | Re-plan macro path, then re-solve affected edges |
| Material deficit detected | Building solver (CB, Rig G) | Acquisition sub-solve, then resume |

**Events that MUST NOT trigger re-solves**:

| Event | Why not |
|---|---|
| Manual pause (human hard wall) | Human override is authoritative. No automated re-solve until unpause. |
| Goal on hold (hysteresis) | Hold semantics prevent re-activation oscillation. Hold timer must expire first. |
| Dedup collision (same goal already active) | Prevents resource waste. The existing solve covers the goal. |
| Sterling connection lost | Fail-safe: task enters blocked state with `solver_unavailable` reason. No retry loop. |
| Declaration registration failure | Non-fatal in DEV mode. Solve proceeds without proof-backed routing. |

### Activation invariants Sterling must not sabotage

| Invariant | What it means | How Sterling could break it |
|---|---|---|
| Manual pause hard wall | `isPaused()` check before any action execution | If Sterling sends unsolicited "execute now" commands. **Mitigation**: Sterling never initiates execution — it responds to queries. |
| Hysteresis budget | Goal activation requires hysteresis counter to expire | If Sterling's learning updates cause rapid goal re-evaluation. **Mitigation**: Learning updates go to prior stores, not goal activation logic. Prior stores don't trigger re-evaluation. |
| Origin immutability | `task.metadata.origin` cannot be overwritten after creation | If Sterling returns metadata that CB naively merges into task. **Mitigation**: `finalizeNewTask()` stamps origin once. Sterling results go into `solveMeta`, not `metadata`. |
| Blocked state uniformity | `blockedReason + blockedAt` set atomically via `applyTaskBlock()` | If Sterling errors leave task in inconsistent state. **Mitigation**: `applyTaskBlock()` is called in CB regardless of Sterling result. Sterling errors produce `solver_unavailable` block, not unblocked tasks. |

### Exact events list (for documentation)

**Sterling → CB (responses only, never initiations)**:
- `complete`: solve result with plan, metrics, searchHealth, `trace_bundle_hash`, `engine_commitment`, `operator_registry_hash`, optional `completeness_declaration`
- `error`: solve failure with error code
- `register_domain_declaration_v1_response`: declaration registered
- `get_domain_declaration_v1_response`: declaration retrieved
- `report_episode_response`: episode registered, includes `episode_hash`

**CB → Sterling (all solve-related commands)**:
- `solve`: problem definition
- `report_episode`: execution feedback with `bundle_hash`, `trace_bundle_hash`, `failure_class`, `requestId`
- `register_domain_declaration_v1`: capability claim
- `reset`: clear solve state (not declarations)

Sterling never sends unprompted messages. All communication is request-response. This is the fundamental invariant that protects goal binding autonomy.

---

## Review 8: Action/Leaf Boundary Completeness (Bonus)

### Current state

Phase 0 alignment work (2026-02-01) fixed the split-brain dispatcher:
- `ACTION_TYPE_TO_LEAF` normalization map handles aliases (`craft` → `craft_recipe`, `smelt` → `smelt`)
- LeafFactory-first dispatch with fallthrough to hardcoded handlers
- 51 boundary conformance tests + 24 dispatch contract tests

### Verified execution paths

| Solver-emitted action | Leaf handler | Postcondition check | Status |
|---|---|---|---|
| `craft` / `craft_item` / `craft_recipe` | `executeCraftItem()` via LeafFactory `craft_recipe` | Inventory contains product | Verified |
| `smelt` / `smelt_item` | `executeSmeltItem()` via LeafFactory `smelt` | Inventory contains smelted item | Verified |
| `mine` / `dig_block` | `executeDigBlock()` | Block removed + drop in inventory | Verified |
| `place` / `place_block` | `executePlaceBlock()` | Block placed at position | Verified |
| `prepare_site` | `executeLeafAction()` → LeafFactory | Site cleared | Verified |
| `build_module` | `executeLeafAction()` → LeafFactory | Module placed | Verified |
| `place_feature` | `executeLeafAction()` → LeafFactory | Feature placed | Verified |
| `move_to` / `navigate` | `executeMoveToPosition()` | Bot at target position | Verified |
| `interact_with_entity` | `executeInteractWithEntity()` | Trade completed | Verified (Rig D trade) |
| `open_container` | `executeOpenContainer()` | Loot retrieved | Verified (Rig D loot) |

### Known gaps

| Action type | Source | Handler exists? | Postcondition check? |
|---|---|---|---|
| `move_and_gather` | Cognitive reflection mapping | `gather_resources` handler exists | No formal postcondition |
| `explore_area` | Cognitive reflection mapping | `move_random` handler exists | No formal postcondition |
| `place_scaffold` | Rig G building solver | LeafFactory leaf mapped | No real implementation (placeholder) |
| `remove_scaffold` | Rig G building solver | Not mapped | Not implemented |

These gaps are acceptable: `move_and_gather` and `explore_area` are cognitive-reflection mappings (not solver outputs), and scaffolding is a Rig G future item.

---

## Sequencing Recommendation

Based on this review, the highest-leverage sequence for reducing rigging pain:

### Phase 1: Lock down proof + replay (Reviews 1 + 5)

**Deliverables**:
1. ✅ Sterling returns `trace_bundle_hash`, `engine_commitment`, `operator_registry_hash` in `complete` message — **Parsing implemented**
2. ✅ Sterling returns `completeness_declaration` in `complete` message (Sterling-authored) — **Parsing implemented**
3. ✅ CB sends `bundle_hash`, `trace_bundle_hash`, `outcome_class` in `report_episode` — **Implemented** (sent when `linkage.outcomeClass` defined; use `buildEpisodeLinkageFromResult()` to ensure)
4. ✅ Sterling returns `episode_hash` in `report_episode` response — **Parsing implemented**
5. ✅ CB computes and stores `bindingHash = sha256(trace_bundle_hash || bundleHash)` — **Implemented in `attachSterlingIdentity()`**

**Why first**: This turns future rig work into evidence plumbing. Every subsequent rig gets replay-based regression tests "for free" because the evidence chain is complete and the three identity scopes (solve / execution / episode) are cleanly separated.

### Phase 2: Wire declarations/claims for rig identity (Review 4)

**Deliverables**:
1. ✅ `registerDeclaration()` in `BaseDomainSolver` setup — **Implemented as `ensureDeclarationRegistered()`**
2. ✅ Static `DomainDeclarationV1` per solver — **All 6 solvers have declarations**
3. ⚠️ `structural_only` option on `SterlingReasoningService.solve()` — **Not yet exposed**
4. ✅ DEV mode: register + log; CERTIFYING mode: register + enforce — **Implemented**

**Why second**: Makes rig identity first-class. A rig becomes "the suite that proves a claim," and runtime routing becomes proof-backed by default. Reduces manual verification overhead.

### Phase 3: Define typed bridge edges (Review 2)

**Deliverables**:
1. `BridgeEdge` type with content-addressed identity, precondition/postcondition witnesses, referenced solve artifacts, and semantics version
2. 3–5 concrete bridge definitions (acquire→craft, craft→build, navigate→acquire, craft→tier, acquire→tier)
3. SolveBundle + trace_bundle_hash evidence per domain segment in multi-domain plans

**Why third**: This determines whether future investment goes into TS orchestration rigs or Sterling-native bridging. Even if the answer is "TS orchestration for now," the contracts are formalized and the evidence is replayable.

### Phase 4: Value function efficacy (Review 3)

**Deliverables**:
1. Learning-sensitive benchmark with multiple near-tied plans (Regime B tests)
2. SearchHealth trend measurements over episodes
3. Proof that reachable set + optimality are unchanged (cost within epsilon, all steps legal)

**Why last**: Requires replay discipline (Phase 1) and measurement infrastructure to be trustworthy. Without proof + replay, you can't distinguish "learning helped" from "got lucky."

### What to defer

- **Cross-domain single-call solve** (Review 2 full version): blocked on Python domain isolation. Typed bridge edges are the cheaper alternative.
- **Checkpoint primitive formalization** (Review 6): building pattern works; generalize when a second domain needs it.
- **Goal binding documentation** (Review 7): the boundary is already well-maintained. Document it explicitly but don't build new infrastructure.
- **`ordering_hint_channel`** (Review 5): name it now, implement when heuristic improvement (M2) is active.

---

## The Single Concrete Output

**What becomes the canonical certification artifact?**

**Answer: SolveBundle stays as CB's canonical artifact. It links to Sterling's evidence via `trace_bundle_hash` (received at solve time) and `episode_hash` (received at report time), but they remain independent identity scopes.**

SolveBundle is the right abstraction for CB because:
1. It captures what the TS solver did (input hashes, compat report, rationale) — information Sterling doesn't have
2. It's already content-addressed and deterministic
3. Every rig already produces them
4. The integration cost is small (receive `trace_bundle_hash` from `complete`, store it; send `bundle_hash` in `report_episode`, receive `episode_hash`)

Sterling's `MSCertificateV1` / `TraceBundleV1` are the right abstractions for Sterling's internal proof chain. CB doesn't need to parse or produce them. The bridge is:
- `trace_bundle_hash` links a SolveBundle to the Sterling search that produced it
- `episode_hash` links an execution report to the Sterling episode chain
- `bindingHash = sha256(trace_bundle_hash || bundleHash)` is CB's regression test anchor

### Minimal integration path for deterministic replay-based regression tests

1. Sterling returns `trace_bundle_hash` + `engine_commitment` + `operator_registry_hash` in `complete` (Python change)
2. CB stores `trace_bundle_hash` in `SolveBundleOutput` (TS change: one field)
3. CB sends `bundle_hash` + `trace_bundle_hash` in `report_episode` (TS change: two fields)
4. Sterling returns `episode_hash` in `report_episode` response (Python change)
5. CB computes `bindingHash = sha256(trace_bundle_hash || bundleHash)` and stores it (TS change: one computation)

**Regression test matrix**:

| What changed | `bundleHash` | `trace_bundle_hash` | `bindingHash` | Diagnosis |
|---|---|---|---|---|
| Nothing | Same | Same | Same | Deterministic replay confirmed |
| CB solver refactor | Changed | Same | Changed | CB serialization or logic change |
| Sterling engine update | Same | Changed | Changed | Sterling search behavior changed |
| Both | Changed | Changed | Changed | Decompose via individual hashes |
| Learning (Regime B) | Same | May differ | May differ | Expected — verify cost/legality invariants instead |

This gives deterministic replay-based regression tests for Rigs A, B, C, D, G with approximately 5 small changes across both repos.

---

## PR-Ready Wire Protocol Change List

### Change A: `solve` response additions (Sterling → CB)

**Status**: ✅ **Parsing Implemented** (2026-02-03)

**Python file**: `sterling/scripts/utils/sterling_unified_server.py`

Expected `complete` message shape (Python implementation TBD):

```python
complete_msg = {
    "type": "complete",
    "domain": domain,
    "solved": solved,
    "metrics": { ... },  # existing
    # NEW fields (CB parsing ready):
    "trace_bundle_hash": trace_bundle.content_hash(),   # content-addressed solve identity
    "engine_commitment": engine.commitment_hash(),       # server version hash
    "operator_registry_hash": registry.content_hash(),   # operator set identity
    "completeness_declaration": trace_bundle.completeness.to_dict() if trace_bundle.completeness else None,
}
```

**CB file**: `packages/planning/src/sterling/solve-bundle.ts`

✅ **Implemented**: `parseSterlingIdentity()` at lines 426-454 parses all fields from `metrics` object.

**CB file**: `packages/planning/src/sterling/solve-bundle-types.ts`

✅ **Implemented**: `SterlingIdentity` interface at lines 196-215:

```typescript
export interface SterlingIdentity {
  /** Content-addressed solve identity from Sterling (opaque, not included in bundleHash) */
  traceBundleHash?: string;
  /** Sterling server version hash for drift detection */
  engineCommitment?: string;
  /** Sterling operator set identity for drift detection */
  operatorRegistryHash?: string;
  /** Sterling-authored completeness declaration (forwarded verbatim, not CB-authored) */
  completenessDeclaration?: Record<string, unknown>;
  /** CB-computed binding hash: sha256(traceBundleHash || bundleHash) */
  bindingHash?: string;
}
```

**Acceptance tests (TS)**:
- ✅ `solve-bundle.test.ts`: new fields stored but excluded from `bundleHash` computation
- ✅ `solve-bundle.test.ts`: `parseSterlingIdentity()` tests for all field parsing
- `solver-class-e2e.test.ts`: `traceBundleHash` is a non-empty string on successful solve (requires Sterling to emit)

**Acceptance tests (Python)**:
- `test_unified_server.py`: `complete` message includes `trace_bundle_hash` field
- `test_unified_server.py`: `trace_bundle_hash` is deterministic for same payload + same engine state

### Change B: `report_episode` request additions (CB → Sterling)

**Status**: ⚠️ **Partially Implemented** (2026-02-03)

**CB file**: `packages/planning/src/sterling/base-domain-solver.ts`

Current implementation (`reportEpisode()` at lines 383-428):

```typescript
const reportMsg = {
  command: 'report_episode',
  requestId: generateRequestId(),     // ✅ Implemented
  request_id: requestId,              // ✅ Both formats sent for migration
  planId,
  outcome,
  metrics,
  // Identity linkage (always sent when available):
  bundle_hash: linkage.bundleHash,              // ✅ Implemented
  trace_bundle_hash: linkage.traceBundleHash,   // ✅ Implemented
  // Phase 1 fields (conditional, behind toggle):
  engine_commitment: linkage.engineCommitment,       // ⚠️ Conditional (STERLING_REPORT_IDENTITY_FIELDS=1)
  operator_registry_hash: linkage.operatorRegistryHash, // ⚠️ Conditional
  // NOT YET IMPLEMENTED:
  // failure_class: classifyFailure(outcome, solveBundle),  // ❌ Missing
};
```

**CB file**: `packages/planning/src/sterling/solve-bundle-types.ts`

Failure class enum exists (lines 228-238):

```typescript
export type EpisodeOutcomeClass =
  | 'EXECUTION_SUCCESS'
  | 'EXECUTION_FAILURE'
  | 'SEARCH_EXHAUSTED'
  | 'PRECONDITION_UNSATISFIED'
  | 'STRATEGY_INFEASIBLE'
  | 'DECOMPOSITION_GAP'
  | 'SUPPORT_INFEASIBLE'
  | 'HEURISTIC_DEGENERACY';
```

**Remaining work**:
1. Wire `classifyOutcome()` result into `reportEpisode()` payload as `outcome_class` or `failure_class`
2. Python side: accept new field and store appropriately

**Acceptance tests (TS)**:
- ✅ `base-domain-solver.test.ts`: `report_episode` message includes `bundle_hash`, `trace_bundle_hash`, `requestId`
- ❌ `base-domain-solver.test.ts`: `failure_class` assertions — NOT YET IMPLEMENTED

**Acceptance tests (Python)**:
- `test_unified_server.py`: `report_episode` with `bundle_hash` stores it in `external_refs`, not in episode hash inputs
- `test_unified_server.py`: same `report_episode` content produces same `episode_hash` regardless of `bundle_hash` value (hash coupling test)

### Change C: `report_episode` response additions (Sterling → CB)

**Status**: ✅ **Parsing Implemented** (2026-02-03)

**Python file**: `sterling/scripts/utils/sterling_unified_server.py`

Expected response shape (Python implementation TBD):

```python
response = {
    "type": "report_episode_ack",
    "requestId": msg.get("requestId"),
    "episode_hash": episode_record.episode_hash,
}
```

**CB file**: `packages/planning/src/sterling/base-domain-solver.ts`

✅ **Implemented**: Response parsing at lines 419-425:

```typescript
// Parse episode_hash from response (supports both camelCase and snake_case)
const episodeHash = ack?.metrics?.episode_hash ?? ack?.metrics?.episodeHash;
const responseRequestId = ack?.metrics?.request_id ?? ack?.metrics?.requestId;
return {
  episodeHash,
  requestId: responseRequestId,
};
```

**CB file**: `packages/planning/src/sterling/solve-bundle.ts`

✅ **Implemented**: `attachSterlingIdentity()` at lines 467-482 computes `bindingHash`:

```typescript
export function attachSterlingIdentity(
  bundle: SolveBundle,
  sterlingIdentity: SterlingIdentity | undefined,
): SolveBundle {
  if (!sterlingIdentity) return bundle;

  // Compute binding hash if we have both sides
  const bindingHash = sterlingIdentity.traceBundleHash
    ? contentHash(sterlingIdentity.traceBundleHash + bundle.bundleHash)
    : undefined;

  return {
    ...bundle,
    output: {
      ...bundle.output,
      sterlingIdentity: { ...sterlingIdentity, bindingHash },
    },
  };
}
```

**Acceptance tests (TS)**:
- ✅ `base-domain-solver.test.ts`: `reportEpisode()` returns parsed response with `episodeHash`
- ✅ `solve-bundle.test.ts`: `bindingHash` is deterministic given same `traceBundleHash` + `bundleHash`
- `solver-class-e2e.test.ts` (Regime A): two identical solves produce identical `traceBundleHash`; two identical episode reports produce identical `episode_hash` (requires Sterling to emit)

**Acceptance tests (Python)**:
- `test_unified_server.py`: `report_episode_ack` includes `episode_hash`
- `test_unified_server.py`: `episode_hash` includes `trace_bundle_hash` but not `bundle_hash` in its computation

### Change D: `executionMode` alignment (naming)

**Not introducing `governance_mode`**. Use the existing `executionMode` field on the wire payload and extend its value set:

```typescript
export type ExecutionMode = 'dev' | 'certifying' | 'replay';
```

This aligns with Sterling's run-intent concept and CB's existing nomenclature. `executionMode` already exists on `SolveBundleInput` and the wire payload. Sterling maps `executionMode` to its internal run-intent classification.

**CB file**: `packages/planning/src/sterling/solve-bundle-types.ts`

Type the existing field:

```typescript
executionMode: ExecutionMode | string;  // string for backward compat with existing solver-specific modes
```

**Acceptance tests**:
- `solve-bundle.test.ts`: `executionMode: 'certifying'` included in `bundleHash` (already true — `executionMode` participates in input hash)
- No Python change needed: existing `executionMode` field on wire payload already forwarded

### Invariant preservation

All changes preserve existing tracker invariants:

| Invariant | How preserved |
|---|---|
| #1 Deterministic replay | `traceBundleHash` equality is the Regime A test; `bundleHash` computation unchanged |
| #2 Fail-closed legality | No change to compat linter or operator validation |
| #3 Canonical state hashing | No change to `hashInventoryState()` or `hashDefinition()` |
| #4 Learning never changes semantics | `bundle_hash` excluded from `episode_hash`; episode identity is Sterling-native |
| #5 Credit assignment execution-grounded | `episode_hash` only minted on `report_episode` (execution-scoped), never on `complete` (solve-scoped) |
| #6 Audit-grade explanations | `completenessDeclaration` forwarded from Sterling adds proof-completeness gating |
| #7 Rule injection hardening | No change to compat linter |
| #8 Multi-objective explicit | No change to `ObjectiveWeights` handling |

---

## Join Keys Pipeline Hardening (2026-02-02)

Per-domain `SolveJoinKeys` storage was implemented in Commit A. Subsequent hardening addressed 6 operational footguns. Full details in [JOIN_KEYS_PIPELINE_HARDENING.md](./JOIN_KEYS_PIPELINE_HARDENING.md).

### Summary of Changes

| Footgun | Solution | Status |
|---|---|---|
| planId uniqueness assumption | Added `solverId` to `SolveJoinKeys`; guard checks solver matches | ✅ Implemented |
| Migration fallback that never dies | Opt-in via `JOIN_KEYS_DEPRECATED_COMPAT=1` env; startup banner; removal tracked | ✅ Implemented |
| Warning classification ambiguity | Explicit categories: planId mismatch = expected; solverId mismatch = unexpected | ✅ Implemented |
| Type-shape drift in linkage | Extracted `buildEpisodeLinkage()` as single source of truth | ✅ Implemented |
| Memory leak in warning Set | Bounded to 1000 entries; keyed by `(taskId, category)` | ✅ Implemented |
| Test brittleness | Structured reason codes at detection site; semantic assertions | ✅ Implemented |

### Follow-Up Items (Documented, Not Blocking)

1. ~~**Centralize solver IDs**: Create `solver-ids.ts` to prevent drift between producer/planner/reporter~~ ✅ **DONE** — `solver-ids.ts` created with `SOLVER_IDS` constant
2. **Roll out solverId guard to other domains**: Currently only in `reportBuildingEpisode()` — Infrastructure ready with `selectJoinKeysForPlan()` helper
3. **Remove migration compat after 2026-02-15**: If no `JOIN_KEYS_DEPRECATED_COMPAT=1` usage observed

### Relevant Files

- `packages/planning/src/sterling/solve-bundle-types.ts`: `SolveJoinKeys.solverId`
- `packages/planning/src/sterling/episode-classification.ts`: `extractSolveJoinKeys()` populates solverId
- `packages/planning/src/task-integration.ts`: solverId guard, migration fallback, warning classification
- `packages/planning/src/task-integration/__tests__/task-integration-pipeline.test.ts`: 91 tests including compat coverage
