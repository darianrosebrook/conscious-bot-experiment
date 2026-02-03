# Sterling Integration: Consolidation Opportunities

**Author:** @darianrosebrook
**Date:** 2026-02-02
**Status:** Planning — identifies duplicative effort between conscious-bot and Sterling, proposes migration to Sterling-native features.

> **Core finding:** Conscious-bot uses ~15% of Sterling's capabilities. We treat it as a raw A\* search endpoint over WebSocket, while Sterling provides a full neurosymbolic reasoning substrate with governance, cross-domain bridging, learned value functions, episode replay, and proof-carrying artifacts. We have rebuilt several of these capabilities in TypeScript. This document maps the duplication and proposes a phased consolidation.

---

## What Sterling Actually Is

Sterling describes itself as a **"path-finding system over semantic state space"** — not a language model. Per its README:

| Concept | Definition |
|---------|------------|
| **Nodes** | Meaningful states (UtteranceState, WorldState, summaries/landmarks) |
| **Edges** | Typed moves (operators) |
| **Learning** | Path-level credit assignment (what edges help from what regions) |
| **Memory** | Compression-gated landmarks + durable provenance |
| **Language** | I/O, not cognition (IR intake + explanation only) |

Sterling enforces 11 core constraints (no free-form CoT, explicit state, no hidden routers, oracle separation, etc.) and provides:

- **Cross-domain bridge architecture** with runtime-computed transitions and cost accounting
- **Learned value functions** (TransitionScorer) that reduce search node expansion by 38%+
- **Governance infrastructure** (run intents: dev/certifying/promotion/replay) with fail-closed gates
- **TD-12 certificates** for cryptographic proof of correct reasoning
- **Episode replay** for deterministic regression detection
- **Knowledge graph with memory decay** and usage-based pruning
- **10 capability axes** under active development (partial observability, stochasticity, adversarial robustness, uncertainty calibration, continual learning, transfer/composition, language grounding, safe tool execution, compute governance)

Sterling has demonstrated **29–600x faster** performance than GPT-4 on structured reasoning tasks with 100% solve rates.

## What We Actually Use

We send `{ command: 'solve', domain, inventory, goal, rules, maxNodes }` over WebSocket and get back a solution path. That's it.

| Sterling Capability | Used? | Notes |
|---|---|---|
| A\*/Best-first search | **YES** | All 5 domain solvers |
| Streaming search messages | **YES** | discover, search\_edge, solution\_path |
| Path algebra edge learning | **YES** | Via `report_episode` (fire-and-forget) |
| UtteranceState IR | NO | |
| S/M/P/K/C operator taxonomy | NO | |
| Cross-domain bridges | NO | Each domain is hermetic |
| Learned value functions | NO | Only heuristic scoring |
| Governance (run intents) | NO | |
| Knowledge graph navigation | NO | |
| Memory decay engine | NO | |
| Episode logging / replay | NO | |
| TD-12 certificates / proofs | NO | |
| Self-correction / backtracking | NO | Replans from scratch |

---

## Duplicative Systems Map

### 1. Evidence / Observability Infrastructure

**What we built in TypeScript:**

| File | Purpose |
|------|---------|
| `planning/src/sterling/solve-bundle-types.ts` | SolveBundle type definitions |
| `planning/src/sterling/solve-bundle.ts` | Content-addressed hashing (SHA-256), bundle construction, canonicalization |
| `planning/src/sterling/compat-linter.ts` | 14-check rule linter (UNSUPPORTED\_ACTION\_TYPE, INVALID\_BASE\_COST, etc.) |
| `planning/src/sterling/search-health.ts` | Search health metric parsing, heuristic degeneracy detection |

Our `SolveBundle` computes `definitionHash`, `initialStateHash`, `goalHash`, `stepsDigest`, `bundleHash`, and a `compatReport` — all content-addressed.

**What Sterling already provides natively:**

| File | Purpose |
|------|---------|
| `core/proofs/td12_ms_certificate.py` | TD-12/MS certificates with `certificate_id = sha256(canonical_payload)` |
| `core/reasoning/episode_report.py` | Structured episode reports with failure taxonomy |
| `core/reasoning/episode_logger.py` | Step-by-step episode logging with deterministic artifacts |
| `core/reasoning/episode_loader.py` | Episode replay for regression verification |

Sterling's certificates **bind** sketch\_hash, policy\_hash, closure\_hash, and evidence\_hashes into a single verifiable artifact. They support fail-closed verification and are composable.

**Overlap:** Both systems implement content-addressed evidence with deterministic hashing. Sterling's is more mature (supports replay, promotion gating, and composable proofs). Our SolveBundle is simpler but covers the same ground for our use case.

**Consolidation path:** Emit SolveBundle data as a Sterling-native `EpisodeReport` or `TD12MSCertificateV1` instead of a parallel TypeScript artifact. This would give us replay, promotion gating, and regression detection for free.

---

### 2. Learning / Credit Assignment

**What we built:**

| File | Purpose |
|------|---------|
| `planning/src/sterling/minecraft-acquisition-priors.ts` | In-memory EMA (α=0.2) strategy priors keyed by (item, strategy, contextKey) |
| `planning/src/sterling/base-domain-solver.ts` | `reportEpisode()` — fire-and-forget POST to Sterling |

Our `StrategyPriorStore` maintains per-strategy success rates to bias acquisition candidate selection. Episode reports are sent to Sterling but responses are ignored.

**What Sterling already provides:**

| Component | Purpose |
|-----------|---------|
| Path algebra edge learning | Action-edge weights updated from successful episodes |
| Operator induction (`promotion_lane.py`) | Learns new operators from episode evidence |
| Episode selection (`episode_select.py`) | Selects exemplar episodes for training |
| TransitionScorer | Neural value function trained on past episodes |

Sterling's path algebra already learns edge weights per action — the same thing our EMA priors do, but inside the search. Sterling also learns *structurally* via the TransitionScorer, which reduces node expansion counts.

**Overlap:** Both systems maintain learned priors for strategy ranking. Ours is in-memory TypeScript; Sterling's is in-process Python with persistence.

**Consolidation path:** Query Sterling's learned edge weights back instead of maintaining a parallel prior store. Wire `report_episode` responses to update conscious-bot's solver routing, closing the feedback loop.

---

### 3. Memory Decay

**What we built:**

| File | Purpose |
|------|---------|
| `memory/src/memory-decay-manager.ts` | Usage-based decay with access patterns (recent/frequent/occasional/rare/forgotten), importance-based retention, configurable profiles per memory type |
| `memory/src/sharp-wave-ripple-manager.ts` | Two-phase consolidation: awake tagging + sleep-phase replay with temporal compression and neural competition |

**What Sterling already provides:**

| File | Purpose |
|------|---------|
| `core/kg/decay.py` | Usage-based KG node decay with UsageKind tags (SUCCESS\_PATH, EXPLORED, NEGATIVE\_EVIDENCE) |
| `core/memory/landmark_registry.py` | Compression-gated landmarks with auto-pruning (keep top 80% when full) |
| `core/memory/landmark_gate.py` | Verification gates (oracle-independence, require\_verification) |

**Overlap:** Both implement usage-based forgetting. Ours is richer (neuroscience-inspired SWR, emotional/spatial/social decay profiles). Sterling's is simpler but integrated into the search loop.

**Consolidation path:** These are *complementary*, not duplicative. Our memory decay handles episodic/semantic/emotional memories in PostgreSQL. Sterling's handles search-graph knowledge. No immediate merge needed, but a shared decay policy interface could prevent drift.

---

### 4. Governance / Quality Gates

**What we built:**

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Evidence-First Review Contract: R1 (solver unit evidence), R2 (live E2E), R3 (payload snapshot), R4 (deterministic bundle IDs) |

Our governance is **documentation-only** — a reviewer checklist. There is no runtime enforcement.

**What Sterling already provides:**

| File | Purpose |
|------|---------|
| `core/governance/run_intent.py` | RunIntent enum (DEV/CERTIFYING/PROMOTION/REPLAY) with `is_strict` property |
| `core/induction/promotion_lane.py` | FenceWitness, RegressionFenceError, gated promotion (shadow → promotion → certified) |
| `core/proofs/td12_ms_certificate.py` | Fail-closed certificate verification |

Sterling's governance is **runtime-enforced**: missing dependencies raise exceptions in certifying mode; empty evidence fails gates; witnesses are structured IRs that tests assert on.

**Overlap:** Our CLAUDE.md requirements (deterministic IDs, payload stability, execution evidence) are exactly what Sterling's governance enforces at runtime.

**Consolidation path:** Run conscious-bot solver tests under Sterling's `RunIntent.CERTIFYING` mode. This would replace our review checklist with runtime gates — if evidence is missing, the test fails, not just the review.

---

### 5. Multi-Step Orchestration / Cross-Domain Solving

**What we built:**

| File | Purpose |
|------|---------|
| `planning/src/task-integration.ts` | Task store, lifecycle management, solver routing |
| `planning/src/task-integration/sterling-planner.ts` | `generateDynamicSteps()` routes requirements to domain solvers |
| `planning/src/hierarchical-planner/` | Dijkstra macro planner over abstract contexts |

Today, a multi-domain task like "craft iron pickaxe" is orchestrated in TypeScript:
1. `task-integration` analyzes the requirement
2. `sterling-planner` routes to tool-progression solver (dependencies)
3. Each solver calls Sterling independently (hermetic domains)
4. Results are stitched back into a `TaskStep[]` array

**What Sterling already provides:**

| File | Purpose |
|------|---------|
| `core/reasoning/staged_search.py` | Two-stage cross-domain search (DiscourseWorld → LandmarkWorld → TargetWorld) |
| `core/worlds/landmarks.py` | LandmarkWorldAdapter with bridge transitions, cost accounting, hysteresis |

Sterling can **natively bridge between domains** at search time. A single solve could traverse minecraft.crafting → minecraft.navigation → minecraft.crafting without returning to TypeScript for orchestration.

**Overlap:** Our task-integration layer manually orchestrates what Sterling's bridge architecture does automatically.

**Consolidation path:** Register Minecraft domains as Sterling WorldAdapters with bridge landmarks between them. A single `solve` call could handle "go to the forest, chop wood, come back, craft a pickaxe" as one search problem. This would eliminate the task-integration multi-solver orchestration code for Sterling-routable tasks.

---

### 6. Plan Repair / Backtracking

**What we built:**

| File | Purpose |
|------|---------|
| `planning/src/hierarchical-planner/feedback-integration.ts` | Replan after 3 consecutive failures; cost updates to macro edges |

We replan from scratch when steps fail. No in-solve backtracking.

**What Sterling already provides:**

Sterling's self-correction subsystem monitors confidence and backtracks within a single solve episode. Its operator induction learns from failures to avoid repeating mistakes.

**Overlap:** Both systems replan on failure, but Sterling can backtrack *within* a solve while we always start fresh.

**Consolidation path:** Use Sterling's self-correction for in-solve recovery. Reserve our replan logic for cases where the world state has changed (e.g., inventory lost, mob attack) and a fresh solve is genuinely needed.

---

## Consolidation Phases

### Phase 1: Close the Feedback Loop (Low effort, high value)

**Goal:** Stop treating Sterling as fire-and-forget. Consume learning state.

1. **Wire episode report responses** — `report_episode` currently ignores Sterling's response. Start consuming the returned learning state to update local routing decisions.
2. **Query learned edge weights** — Before solving, ask Sterling for its current edge weights on the target domain. Use these to inform solver selection and fallback ordering.
3. **Replace StrategyPriorStore** — Migrate acquisition strategy priors from in-memory TypeScript EMA to Sterling's path algebra. One fewer state store to maintain.

**Files affected:**
- `planning/src/sterling/base-domain-solver.ts` (consume report\_episode response)
- `planning/src/sterling/minecraft-acquisition-priors.ts` (deprecate)
- `planning/src/sterling/minecraft-acquisition-solver.ts` (query Sterling priors)

---

### Phase 2: Unify Evidence Infrastructure (Medium effort, high value)

**Goal:** Replace our parallel SolveBundle system with Sterling-native evidence.

1. **Emit EpisodeReports instead of SolveBundles** — Map our `SolveBundleInput`/`SolveBundleOutput` to Sterling's `EpisodeReport` schema. Keep the compat linter (Sterling doesn't have Minecraft-specific rule validation).
2. **Enable episode replay** — Use Sterling's `EpisodeLoader` to replay past solves for regression detection. This satisfies CLAUDE.md R3 (payload equivalence) automatically.
3. **Run solver tests under CERTIFYING intent** — Replace review-checklist governance with runtime-enforced gates.

**Files affected:**
- `planning/src/sterling/solve-bundle.ts` (emit Sterling-native format)
- `planning/src/sterling/solve-bundle-types.ts` (align with Sterling schemas)
- `planning/src/sterling/search-health.ts` (consume Sterling-native metrics)
- Test files (add `RunIntent.CERTIFYING` test wrappers)

**Files preserved:**
- `planning/src/sterling/compat-linter.ts` (Minecraft-specific; no Sterling equivalent)

---

### Phase 3: Enable Cross-Domain Bridges (High effort, high value)

**Goal:** Let Sterling handle multi-domain orchestration natively.

1. **Register Minecraft domains as WorldAdapters** — Each of our 5 solvers (crafting, building, navigation, acquisition, furnace) becomes a Sterling world with an `OperatorSignature` set.
2. **Define bridge landmarks** — Create landmarks between domains (e.g., "has\_materials" bridges navigation → crafting; "at\_location" bridges crafting → navigation).
3. **Single-solve multi-domain tasks** — A single Sterling `solve` call traverses domains via bridges instead of conscious-bot orchestrating sequential solver calls.
4. **Deprecate multi-solver orchestration** — Retire the `generateDynamicStepsHierarchical()` flow for Sterling-bridgeable tasks. Keep it as fallback for non-Sterling tasks.

**Files affected:**
- New: Sterling WorldAdapter implementations for each Minecraft domain (Python, in sterling repo)
- New: Bridge landmark definitions (Python, in sterling repo)
- `planning/src/task-integration/sterling-planner.ts` (route to single cross-domain solve)
- `planning/src/task-integration.ts` (simplify orchestration)

**Prerequisite:** Sterling Phase C/D work (capability axes) should be sufficiently mature.

---

### Phase 4: Wire Value Functions (Medium effort, medium value)

**Goal:** Use Sterling's learned TransitionScorer to improve search efficiency.

1. **Enable value function scoring** — Sterling already trains TransitionScorer on past episodes. Our solvers currently don't request value-guided search.
2. **Pass `useLearning: true` with value function context** — Provide structural features (inventory complexity, goal distance, step count) that the scorer can use.
3. **Measure node expansion reduction** — Sterling claims 38% reduction on IR navigation; measure the actual improvement on Minecraft domains.

**Files affected:**
- `core/src/sterling/sterling-client.ts` (add value function request params)
- `planning/src/sterling/base-domain-solver.ts` (pass structural features)
- Sterling backend (enable scorer for Minecraft domains)

---

## What NOT to Consolidate

Some systems are complementary, not duplicative:

| System | Reason to Keep Separate |
|--------|------------------------|
| **Memory decay (PostgreSQL)** | Handles episodic/semantic/emotional memories — a different domain than Sterling's search-graph decay |
| **SWR tagging** | Neuroscience-inspired consolidation for long-term memory — Sterling has no equivalent |
| **Thought-to-task converter** | Bridges LLM cognition to planning — Sterling doesn't handle natural language intent parsing |
| **Leaf execution / Mineflayer** | Physical bot actions — outside Sterling's scope |
| **Dashboard / cognitive stream** | UI and monitoring — outside Sterling's scope |
| **Compat linter** | Minecraft-specific rule validation — Sterling trusts contractVersion, doesn't validate domain rules |

---

## Alignment with Sterling's Roadmap

Sterling's roadmap phases map to conscious-bot's aspirational rigs:

| Sterling Phase | Capability Axis | Conscious-Bot Rig | Opportunity |
|---|---|---|---|
| C.1 Mastermind | Partial observability | Rig I (Epistemic) | Belief-state search for unknown world state |
| C.2 Slippery Gridworld | Stochasticity | Rig F (Valuation/Scarcity) | Probabilistic resource planning |
| C.3 Poisoned Curriculum | Adversarial robustness | — | Rule injection hardening (already in compat linter) |
| C.4 Transactional KV Store | Safe tool execution | Rig K (Irreversibility) | Two-phase commit for irreversible actions |
| D.1 Ambiguous Goals | Uncertainty calibration | — | Multi-interpretation goal handling |
| D.2 Curriculum Stream | Continual learning | Curriculum system | Progressive skill development |
| D.3 Isomorphic Pairs | Transfer/composition | Rig transfer tests | Same invariants across domains |
| E Governance Realization | Evidence infrastructure | CLAUDE.md contract | Runtime enforcement of evidence requirements |

As Sterling matures these axes, we should adopt them as the backing implementation for the corresponding rigs rather than building parallel infrastructure.

---

## Decision Points

Before starting consolidation, the following decisions need to be made:

1. **Phase 1 timing** — Can we close the feedback loop now, or does Sterling's `report_episode` response format need changes first?
2. **Phase 2 schema alignment** — Should we adopt Sterling's `EpisodeReport` schema directly, or define a mapping layer?
3. **Phase 3 WorldAdapter ownership** — Do Minecraft WorldAdapters live in the sterling repo or in conscious-bot?
4. **Testing strategy** — Can `RunIntent.CERTIFYING` tests run in CI without a live Sterling server, or do they need the E2E environment?
5. **Fallback policy** — When Sterling is unavailable, how much of the consolidated functionality degrades vs. fails?

---

## References

- **Sterling README:** `../sterling/README.md` — Full architecture and capabilities
- **Sterling CLAUDE.md:** `../sterling/CLAUDE.md` — Governance modes, fail-closed rules, development patterns
- **Sterling Roadmap:** `../sterling/docs/roadmap/README.md` — Phase A–E work ordering and capability axes
- **Conscious-Bot CLAUDE.md:** `./CLAUDE.md` — Evidence-First Review Contract
- **Sterling Capability Tracker:** `docs/planning/sterling-capability-tracker.md` — Live solver status
- **Rig Documentation:** `docs/planning/RIG_*.md` — Phased capability specifications A–K
