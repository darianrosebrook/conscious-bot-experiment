# Sterling × Minecraft: Capability Rigs for a General Reasoning Substrate

Purpose

This document replaces “Minecraft domains” with a capability-first proving plan.

Minecraft is treated strictly as an experimental rig. Each rig is designed to prove a certifiable capability primitive in a controlled setting, with auditable traces and explicit invariants. The output of this work is a general reasoning substrate (operators, state canonicalization, learning semantics, audit trail), not a collection of Minecraft-specific domain handlers.

Sterling remains an external Python service providing graph search + learned edge ordering, reasoning over semantic state space. The bot remains the source of Minecraft knowledge at solve time.

---

## Capability primitives

This represents the "capability primitives + transfer envelopes," with toy domains treated only as a convenient proving rig. Each entry has: (1) the primitive, (2) the formal signature (what Sterling must represent/verify), (3) what you prove in the rig, and (4) the transfer envelope (where the same problem-shape recurs). See the [Capability Primitives](./capability-primitives.md) for more details.

The intended goal is a general reasoning substrate rather than a collection of domain handlers.

1. **Deterministic transformation planning (resource → product)**
   Finite discrete state with typed operators having preconditions/effects, additive cost, goal predicate as subset/constraint satisfaction, search for minimal-cost path, with optional learned edge ordering that does not change transition semantics.

2. **Capability gating and legality (what actions are permitted)**
   State includes a capability set; operators are enabled/disabled by capability predicates; monotone or partially monotone capability progression; legality checks are fail-closed.

3. **Temporal planning with durations, batching, and capacity**
   Actions with duration and possible resource occupancy; objective includes time; state includes clocks or remaining-time fields; optionally parallel machines/slots; constraints on concurrency.

4. **Multi-strategy acquisition (alternative methods, different failure modes)**
   Multiple operator families reach the same subgoal; costs differ; some operators have preconditions that come from external availability; learning updates "which strategy works here."

5. **Hierarchical planning (macro policy over micro solvers)**
   Two (or more) abstraction layers; macro nodes represent regions/waypoints/contexts; micro controller handles local execution; macro edges invoke sub-solvers; costs incorporate execution feedback.

6. **Goal-conditioned valuation under scarcity (keep/drop/allocate)**
   Constrained capacity (slots, budget, attention); objective is utility under current goals; value model can shift with goals; learning updates item/action valuations.

7. **Feasibility under constraints and partial-order structure**
   Operators have nontrivial preconditions (support, dependency, reachability); some steps can commute; solution is a partially ordered plan; execution chooses a valid linearization.

8. **Systems synthesis (compose components to satisfy a behavioral spec)**
   State is a partial design; operators add components; evaluation function checks behavior/spec satisfaction (deterministic simulator if possible); goal is "spec holds."

9. **Contingency planning with exogenous events**
   Edges include chosen actions and forced transitions; state includes timeline/hazard triggers; goal includes survivability or invariant preservation; plan may be a policy (conditional branches).

10. **Risk-aware planning (tail risk, not just expected cost)**
    Stochastic outcomes; cost is distributional (e.g., chance constraints P(failure) < ε, CVaR); state includes risk budget; learning updates failure likelihoods.

11. **Epistemic planning (belief-state and active sensing)**
    Nodes represent beliefs (prob distributions or hypothesis sets); edges are probes/tests; transitions update beliefs; goal is confidence threshold or hypothesis collapse; cost is probe expense + risk.

12. **Invariant maintenance (non-terminal goals; control-by-receding-horizon)**
    State includes invariant metrics; drift dynamics; actions restore metrics; goal is to keep invariants within bounds over time (often solved repeatedly as MPC/receding horizon).

13. **Irreversibility and commitment planning**
    Some actions are irreversible or have large rollback cost; objective includes option value; planner must delay commitment until evidence threshold; constraints encode one-way doors.

14. **Program-level planning (search over compressed representations)**
    Plan is a structured program (templates/modules/parameters); edges refine program; compilation maps program → concrete actions; correctness requires compilation validity + constraint satisfaction.

15. **Fault diagnosis and repair (hypotheses → tests → fix)**
    Hypothesis set; test operators reduce entropy; repair operators modify system; goal is "fault isolated + fix validated"; learning ranks tests by information gain.

16. **Representation invariance and state canonicalization**
    Generalization hinges on canonical state hashing, count-capping, symmetry reduction, and "equivalence under irrelevant variation" to prevent brittleness and memory-hungry representations.

17. **Credit assignment tied to execution, not plans**
    Separating hypothesized plans from verified outcomes, then updating priors correctly based on executed success rather than planned success.

18. **Multi-objective optimization and preference articulation**
    Real-world planning requires Pareto handling (time vs risk vs resource burn vs disruption) and a way to surface trade-offs explicitly rather than single scalar cost.

19. **Audit-grade explanations (why this plan, why not that plan)**
    Structured rationales: which constraints bound the choice, which evidence updated beliefs, which alternatives were rejected and why, for trustworthy reasoning verification.

20. **Adversarial robustness / "rule injection" hardening**
    Client-defined rules are untrusted input requiring validation, boundedness, and "no untrusted semantics" guarantees for secure agentic integration and plugin ecosystems.

---

## Global invariants (apply to every rig)

These are not “features.” They are certifiability gates that every rig must satisfy.
1.	Deterministic replay
	Same request payload + same Sterling version + same config ⇒ identical trace bundle hash. No hidden randomness unless explicitly modeled as stochastic outcomes.
2.	Typed operators, fail-closed legality
	Every operator has a type, preconditions, and effects. If legality cannot be proven from state + operator, it is treated as illegal (fail-closed).
3.	Canonical state hashing + equivalence reduction
	State hashing must be stable under irrelevant variation. Count capping and symmetry/equivalence classes are required to prevent memory blow-up and preserve transfer.
4.	Learning never changes semantics
	Learning may change ordering/priors and cost estimates if you explicitly model them, but must not invent transitions or silently alter preconditions/effects.
5.	Credit assignment is execution-grounded
	Planner “success” is not reinforcement. Only executed outcomes (step-level success/failure reports) update priors. Partial credit updates only the responsible segment.
6.	Audit-grade explanations
	Every solve emits: constraints that bound the solution, legality gates considered, top competing alternatives and why rejected, and the evidence/experience that shaped priors.
7.	Rule injection hardening
	Client-defined rules/operators are untrusted input. Strict validation, boundedness limits, schema/version gating, and semantic guards are mandatory.
8.	Multi-objective handling is explicit
	If time vs risk vs resource burn tradeoffs exist, represent them explicitly (weighted scalar with declared weights, or Pareto set). Never smuggle objectives into ad hoc heuristics.

### Identity chain and hash coupling (cross-cutting, partially wired)

The three-step identity chain governs how CB and Sterling evidence artifacts reference each other without entangling identity computation. See [STERLING_INTEGRATION_REVIEW.md](./STERLING_INTEGRATION_REVIEW.md) for the full specification.

| Step | When | Identity produced | Computed by | Status |
|---|---|---|---|---|
| A. Solve-time | Sterling returns `complete` | `trace_bundle_hash` | Sterling | **Wired** — emitted in `metrics` alongside `engine_commitment` and `operator_registry_hash` |
| B. Execution-time | CB processes solve result | `bundleHash` | CB | **Wired** — content-addressed `sha256(canonical {input, output, compatReport})` |
| C. Report-time | CB sends `report_episode` | `episode_hash` | Sterling | **Wired** — returned in `episode_reported` response |

**Hash coupling policy**: Sterling's identity hashes are computed from Sterling-native commitments only. CB's `bundleHash` never participates in any Sterling hash computation. The cryptographic link between CB and Sterling evidence is `bindingHash = contentHash("binding:v1:" + traceBundleHash + ":" + bundleHash)`, computed on the CB side for regression tests. `contentHash` is `sha256(utf8(input))` truncated to 16 hex chars; the versioned prefix and colon separator make the encoding unambiguous. See [STERLING_INTEGRATION_REVIEW.md § Hash Coupling Policy](./STERLING_INTEGRATION_REVIEW.md) for rationale.

**Wire-shape lock**: Identity fields (`trace_bundle_hash`, `engine_commitment`, `operator_registry_hash`) live in `result.metrics`, never top-level. CB calls `parseSterlingIdentity(result.metrics)`. Regression test in `solve-bundle.test.ts`.

**Pending items**:
- `completeness_declaration` in `complete` message (Sterling-authored, CB-forwarded verbatim) — additive, Phase 2
- `failure_class` enum in `report_episode` request — additive, Phase 2
- `bindingHash` persistence in SolveBundle output — additive, not yet wired

---

## Capability rig index (what we will prove)

Rigs are grouped as “minimal proving suites.” Each rig targets one or more primitives and has a crisp certification plan: signature tests, performance tests, transfer tests.

### Rig A: Inventory transformation planning
Proves primitives: Deterministic transformation planning (1), Representation invariance and state canonicalization (16), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19), Adversarial robustness / "rule injection" hardening (20)
Status: CONTRACT-CERTIFIED | HARDENING-COMPLETE | E2E-PROVEN `{crafting}`. Certification hardening (A.7-A.11) implemented: fail-closed validation gate, deterministic trace hashing, execution-based credit, audit explanations. 23 certification tests. See [tracker](./sterling-capability-tracker.md) for evidence.

### Rig B: Capability gating and legality
Proves primitives: Capability gating and legality (2), Representation invariance and state canonicalization (16), Audit-grade explanations (19), Adversarial robustness / "rule injection" hardening (20)
Status: CONTRACT-CERTIFIED | PARTIAL E2E `{crafting via per-tier delegation}`. Tier decomposition is TS-only; per-tier crafting solves hit Python.

### Rig C: Temporal planning with capacity and batching
Proves primitives: Temporal planning with durations, batching, and capacity (3), Multi-objective optimization and preference articulation (18), Representation invariance and state canonicalization (16), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19)
Status: CONTRACT-CERTIFIED | E2E: NONE — no furnace/temporal domain in Python. P03 capsule + FurnaceSchedulingSolver (C.1-C.7) all certified.

### Rig D: Multi-strategy acquisition with environment-conditioned priors
Proves primitives: Multi-strategy acquisition (4), Credit assignment tied to execution, not plans (17), Multi-objective optimization and preference articulation (18), Audit-grade explanations (19), Adversarial robustness / "rule injection" hardening (20) (and optionally Risk-aware planning (10) if risk modeled)
Status: CONTRACT-CERTIFIED | E2E-PROVEN `{mine, trade, loot, salvage}`. All strategies proven via `STERLING_E2E=1` (7/7 tests). mcData threaded from planner.

### Rig E: Hierarchical planning (macro over micro controllers)
Proves primitives: Hierarchical planning (5), Representation invariance and state canonicalization (16), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19)
Status: CONTRACT-CERTIFIED | E2E: NONE — no hierarchical macro planner in Python. World graph builder + edge decomposer + feedback loop all certified.

### Rig F: Goal-conditioned valuation under scarcity
Proves primitives: Goal-conditioned valuation under scarcity (6), Multi-objective optimization and preference articulation (18), Representation invariance and state canonicalization (16), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19)
Status: CONTRACT-CERTIFIED | E2E: NONE (TS-local, no Sterling calls). Pure decision module with content-addressed hashing. 33 unit tests.

### Rig G: Feasibility + partial-order structure planning
Proves primitives: Feasibility under constraints and partial-order structure (7), Representation invariance and state canonicalization (16), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19)
Status: CONTRACT-CERTIFIED | PARTIAL E2E `{building module sequencing}`. Python `building_domain.py` exists. DAG builder, constraint model, partial-order plan are TS additions.

### Rig H: Systems synthesis in a deterministic simulator
Proves primitives: Systems synthesis (8), Program-level planning (14), Representation invariance and state canonicalization (16), Audit-grade explanations (19)
Status: planned (farm layout first; redstone later)

### Rig I: Epistemic planning (belief-state + active sensing)
Proves primitives: Epistemic planning (11), Audit-grade explanations (19), Credit assignment tied to execution, not plans (17) (and Irreversibility and commitment planning (13) if commitment decisions included)
Status: planned (structure localization via probes)

### Rig I-ext: Entity belief tracking and saliency (epistemic + invariant coupling)
Proves primitives: Entity belief maintenance and saliency under partial observability (21), Epistemic planning (11), Invariant maintenance (12), Risk-aware planning (10), Representation invariance and state canonicalization (16), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19)
Status: planned (tracking kernel + delta-gated event bus)

### Rig J: Invariant maintenance (receding horizon control)
Proves primitives: Invariant maintenance (12), Multi-objective optimization and preference articulation (18), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19)
Status: planned (base light/food/tool buffers)

### Rig K: Irreversibility and commitment planning
Proves primitives: 13, 19, 20
Status: planned (villager trade locking + “verify before commit”)

### Rig L: Contingency planning with exogenous events
Proves primitives: Contingency planning with exogenous events (9), Multi-objective optimization and preference articulation (18), Audit-grade explanations (19)
Status: later (nightfall/hunger ticks modeled as forced edges)

### Rig M: Risk-aware planning (tail risk)
Proves primitives: Risk-aware planning (10), Multi-objective optimization and preference articulation (18), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19)
Status: later (chance constraints, CVaR-ish objectives)

### Rig N: Fault diagnosis and repair (hypotheses → tests → fix)
Proves primitives: Fault diagnosis and repair (15), Epistemic planning (11), Audit-grade explanations (19)
Status: later (jammed system diagnosis)

Note: rigs L–N are “later” not because Minecraft can’t do them, but because they require stricter modeling discipline (forced transitions, stochasticity, entropy tracking) and you want A–K certified first.

---

## Standard rig template

Each rig below uses the same structure.

1. Primitive(s) and formal signature
2. Minecraft proving task(s)
3. Required state representation (canonical)
4. Operator families (typed; preconditions/effects)
5. What must be proven (certification gates)
6. Performance measurements
7. Transfer envelope tests
8. Common footguns and how this rig avoids them

---

## Rig A: Inventory transformation planning (resource → product)

A) Primitives and formal signature

Primary: 
- Deterministic transformation planning (1)

Also: 
- Representation invariance and state canonicalization (16), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19), Adversarial robustness / "rule injection" hardening (20)


Signature: 
- finite discrete state, typed operators with preconditions/effects, additive cost, goal predicate as constraint satisfaction, minimal-cost path search; learned edge ordering that does not change transitions.

B) Minecraft proving tasks
1.	Produce target item from inventory via craft/mine/smelt/place.
2.	Produce composite goal (multiple items) to verify subset goal predicate works.
3.	“Substitute allowed” variant to prove catalog-based alternative operators without changing semantics.

C) State representation
Inventory signature with: sorted item counts, zero filtered, count-capped for irrelevant items, and optional “placed station” flags. Canonical hash must be invariant to insertion order and to irrelevant items beyond cap.

D) Operators
Craft, mine, smelt, place. Preconditions are purely inventory/station predicates; effects are inventory deltas + station flags. Cost is declared in operator input; validation ensures finite nonnegative cost within bounds.

E) Certification gates

Signature tests: 
- legality (no negative counts), determinism (trace hash stable), boundedness (node cap enforced), rule validation (schema + cost bounds), canonicalization tests.

Learning tests:
- ordering changes only; reachable set and operator semantics unchanged.

Credit assignment:
- only execution reports update priors; planned “solution found” does not.

### F) Performance measurements
Nodes expanded, time-to-first-solution, repeat-solve convergence (expansions drop), plan length optimality under fixed cost model.

G) Transfer tests
Re-run the same primitive with a non-Minecraft surface representation (e.g., “bill of materials assembly” using identical operator schema) to ensure the capability is not Minecraft-specific.

H) Footguns avoided
State explosion via unbounded counts; learning on planned success; untrusted rule injection; implicit station semantics.

Status: CONTRACT-CERTIFIED | HARDENING-COMPLETE | E2E-PROVEN `{crafting}`. All certification items complete (A.1-A.11). Hardening (A.7-A.11) adds: fail-closed validation gate (`rule-validator.ts`), deterministic trace hashing (`computeTraceHash`), execution-based credit (`CreditManager`), audit explanations (`explanation-builder.ts`). 23 certification tests. See [tracker](./sterling-capability-tracker.md#rig-a-inventory-transformation-planning) for evidence.

---

## Rig B: Capability gating and legality

A) Primitives and formal signature

Primary: 
- Capability gating and legality (2)


Also: 
- Representation invariance and state canonicalization (16), Audit-grade explanations (19), Adversarial robustness / "rule injection" hardening (20)

Signature: 
- state includes capability set; operators enabled/disabled by capability predicates; monotone/partially monotone progression; fail-closed legality.

B) Minecraft proving tasks
1.	“Mine iron ore” is illegal until a valid tool tier is acquired.
2.	“Mine diamond ore” illegal until iron tier.
3.	“Smelt ore” illegal until furnace is present/placed (if modeled as a capability).

C) State representation
Capability set is derived and represented explicitly, not inferred ad hoc. Example: can_mine_stone, can_mine_iron, has_station_furnace_available. Hash is sorted capability atoms + relevant inventory signature.

D) Operators
Upgrade operators (craft tool, acquire material). Legality checks refer to capability predicates; the legality function must be deterministic and fail-closed.

E) Certification gates
Negative test suite: adversarial operators claiming they can mine diamond with wooden tier must be rejected.
Proof: solver never proposes illegal operator in output plan and never expands illegal transitions in search.

F) Performance measurements
Planning should explicitly choose capability acquisition as subgoal; measured by “illegal actions proposed” = 0 and by plan minimality given tier graph.

G) Transfer tests
Map the same primitive to a non-Minecraft permission ladder (approval gates) using the same capability predicate mechanism.

H) Footguns avoided
Gating hidden inside heuristics; legality checks that depend on external mutable world without being in state; “soft” legality.

Status: CONTRACT-CERTIFIED | PARTIAL E2E `{crafting via per-tier delegation}`. Tier decomposition TS-only; per-tier crafting solves hit Python.

---

## Rig C: Temporal planning with durations, batching, and capacity

A) Primitives and formal signature

Primary: 
- Temporal planning with durations, batching, and capacity (3)

Also: 
- Multi-objective optimization and preference articulation (18), Representation invariance and state canonicalization (16), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19)

Signature: 
- actions with durations and capacity occupancy; objective includes time; state includes clocks/remaining-time; optional parallel slots.

B) Minecraft proving tasks
1.	Smelt N items with one furnace: batching is better than repeated reload.
2.	Smelt N items with k furnaces: allocate across slots.
3.	Mixed queue: cooking food while smelting ore; choose schedule that minimizes makespan under capacity.

C) State representation
Add time fields: furnace slots with remaining burn, queue states, and “ready at tick” markers. Canonicalization must compress irrelevant timing granularity (e.g., tick buckets) to avoid blow-up.

D) Operators
Load furnace, add fuel, wait, retrieve output. Operators must correctly update occupancy and time. Waiting is explicit (or modeled as “advance clock” with constraints).

E) Certification gates
No schedule deadlocks; no over-capacity occupancy; determinism; legality under capacity.
If you support concurrency, enforce a single semantic model (either explicit parallel actions or encoded as machine slot occupancy with sequential actions).

F) Performance measurements
Makespan reduction vs naive; batching efficiency; stable behavior under repeated episodes.

G) Transfer tests
Same capability on a generic “job shop” scheduling toy surface using identical “slot occupancy” semantics.

H) Footguns avoided
Encoding time as continuous/unbounded; allowing “wait” to become a free loophole; concurrency ambiguity; learning that changes scheduling semantics.

Status: CONTRACT-CERTIFIED | E2E: NONE — no furnace domain in Python. P03 capsule + FurnaceSchedulingSolver (C.1-C.7) all certified.

---

## Rig D: Multi-strategy acquisition (alternatives, failure modes, world-conditioned priors)

A) Primitives and formal signature

Primary: 
- Multi-strategy acquisition (4)

Also: 
- Credit assignment tied to execution, not plans (17), Multi-objective optimization and preference articulation (18), Audit-grade explanations (19), Adversarial robustness / "rule injection" hardening (20) (and optionally Risk-aware planning (10) if risk modeled)

Signature: 
- multiple operator families reach same subgoal; costs differ; availability predicates from external world; learning updates “which strategy works here.”

B) Minecraft proving tasks
Goal: “Acquire N iron ingots.” Competing strategies: mine+smelt, loot known chest, trade villagers, salvage gear. Availability is dynamic and supplied by the bot as part of the request.

C) State representation
Include strategy-relevant availability flags: known chest count, villager trade availability, nearby ore presence, distance estimates (bucketed), and inventory. Hash must canonicalize these into coarse envelopes rather than raw coordinates.

D) Operators
Operator families per strategy, each with explicit preconditions: “trade requires villager_trade_iron=true,” “loot requires chest_known=true,” etc. Costs reflect time/risk or declared weights.

E) Certification gates
Demonstrate strategy choice (not just sequence). Learning updates the strategy prior from executed outcomes. Hard rule validation so injected “free iron” rules are rejected.

F) Performance measurements
Shift in selected strategy over episodes in the same seeded world; success rate; time-to-goal; number of failed attempts before switching strategy.

G) Transfer tests
Procurement-like toy surface: vendor A vs vendor B vs substitute, with availability toggles and executed success/failure as feedback.

H) Footguns avoided
Treating external availability as implicit and mutable; reinforcing planned success; strategies hidden as heuristic branches rather than first-class operators.

Status: CONTRACT-CERTIFIED | E2E-PROVEN `{mine, trade, loot, salvage}`. All strategies proven via `STERLING_E2E=1`. mcData threaded from planner.

---

## Rig E: Hierarchical planning (macro policy over micro controllers)

A) Primitives and formal signature

Primary: 
- Hierarchical planning (5)

Also: 
- Representation invariance and state canonicalization (16), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19)

Signature: 
- macro abstraction layer; micro controller handles local execution; macro edges invoke sub-solvers; costs incorporate execution feedback.

B) Minecraft proving tasks
1.	Macro navigation: waypoint graph route selection while Mineflayer handles micro path.
2.	Macro build plan: choose template + material acquisition plan; invoke Rig A/C as sub-solvers.

C) State representation
Macro nodes are waypoints/regions with coarse features: biome, danger rating, travel time estimate bucket. Micro details are not in macro state.

D) Operators
Macro travel edges, “invoke sub-solver” edges. Micro failure events (death, stuck, repeated reroutes) update macro edge costs/priors via execution reports.

E) Certification gates
Macro chooses route structure; micro executes. Execution feedback updates macro ordering without changing macro reachability. Failure attribution updates the correct macro edge, not arbitrary edges.

F) Performance measurements
Improved route safety and reduced repeated failures; fewer emergency interventions; lower travel time variance.

G) Transfer tests
Generic “zone routing vs local motion” surface; same macro/micro boundary semantics.

H) Footguns avoided
Leaking micro state into macro hash; non-attributable failures; oscillation due to overreacting to one bad episode.

Status: CONTRACT-CERTIFIED | E2E: NONE — no hierarchical macro planner in Python. World graph builder + edge decomposer + feedback loop all certified.

---

## Rig F: Goal-conditioned valuation under scarcity (keep/drop/allocate)

A) Primitives and formal signature

Primary: 
- Goal-conditioned valuation under scarcity (6)

Also: 
- Multi-objective optimization and preference articulation (18), Representation invariance and state canonicalization (16), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19)

Signature: 
- capacity constraint; utility depends on goals; value model shifts with goals; learning updates valuations.

B) Minecraft proving tasks
Inventory full; bot encounters new item; decide keep/drop/store. Repeat under different active goals: building, mining, nether prep.

C) State representation
Capacity snapshot: slot assignments compressed into counts by category/value class, plus explicit “active goal profile” features. Canonicalization must avoid full slot permutations unless necessary.

D) Operators
Keep item (swap), drop, store to chest (if available), defer pickup. Costs are “sacrificed utility” given current goals.

E) Certification gates
Explain sacrifices: what was dropped and why relative to goals. Demonstrate goal-conditioned reversals (same item kept in one goal context, dropped in another) without inconsistency.

F) Performance measurements
Reduced regret events (missing required items later), reduced thrash (repeated swapping), stable valuations over episodes.

G) Transfer tests
Cache eviction / job scheduling analogy with the same utility model semantics.

H) Footguns avoided
Hardcoded item values; non-explainable trades; slot-permutation state explosion.

Status: CONTRACT-CERTIFIED | E2E: NONE (TS-local, no Sterling calls). Pure decision module with content-addressed hashing. 33 unit tests.

---

## Rig G: Feasibility under constraints and partial-order structure (build sequencing)

A) Primitives and formal signature

Primary: 
- Feasibility under constraints and partial-order structure (7)

Also: 
- Representation invariance and state canonicalization (16), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19) (and Program-level planning (14) if you move to program-level templates)

Signature: 
- operators with nontrivial preconditions (support, reachability); steps commute; solution is a partially ordered plan or a plan robust to valid linearizations.

B) Minecraft proving tasks
Build a minimal shelter: foundation, walls, roof, door, light. Constraints: support, reachability, no mid-air placement, minimal scaffolding.

C) State representation
Use program-level progress flags rather than raw voxel sets as the primary search state (even in the “feasibility” rig). Include terrain/site signature coarse summary, progress mask, and material deficits.

D) Operators
Module placement steps with strong preconditions; optional “prepare site” steps. Compilation emits block placements executed by micro controller.

E) Certification gates
Never proposes impossible placements; respects support constraints; learns stable build partial order; credit assignment penalizes the module that failed.

F) Performance measurements
Reduced repositioning steps; fewer failed placements; convergence to stable sequencing.

G) Transfer tests
Construction scheduling / CI pipeline ordering surface, same “must precede” constraints.

H) Footguns avoided
Block-level state explosion; hiding feasibility in executor; reinforcing plans that fail during placement.

Status: CONTRACT-CERTIFIED | PARTIAL E2E `{building module sequencing}`. Python `building_domain.py` exists. DAG builder, constraints, partial-order plan are TS additions.

---

## Rig H: Systems synthesis (compose components to satisfy a behavioral spec)

A) Primitives and formal signature

Primary: 
- Systems synthesis (8)

Also: 
- Program-level planning (14), Representation invariance and state canonicalization (16), Audit-grade explanations (19)

Signature: 
- state is partial design; operators add components; deterministic evaluation checks spec; goal is “spec holds.”

B) Minecraft proving tasks
Start with farm layout synthesis (deterministic constraints) before redstone. Example: “maximize planted tiles under irrigation constraint with bounded area.”

C) State representation
Partial design representation (placed features, parameters) not raw blocks. Canonicalization uses symmetry reduction (rotations/reflections) where valid.

D) Operators
Add water source, till/plant region, set dimensions, place boundary. Evaluation function checks hydration coverage and completion.

E) Certification gates
Find a design that satisfies spec; reuse motifs; near-miss repair steps; determinism under same spec.

F) Performance measurements
Search tractability, improvement over episodes (motif reuse), and solution quality (coverage, cost).

G) Transfer tests
Workflow automation synthesis surface (triggers/conditions/actions) with deterministic evaluator.

H) Footguns avoided
Trying redstone too early (simulator complexity); atomistic placement; no symmetry handling.

Status: Planned (farm first; redstone later).

---

## Rig I: Epistemic planning (belief-state, active sensing)

A) Primitives and formal signature

Primary: 
- Epistemic planning (11)

Also: 
- Audit-grade explanations (19), Credit assignment tied to execution, not plans (17) (and Irreversibility and commitment planning (13) if you include commitments)

Signature: 
- belief nodes; probe operators; belief update; goal is confidence threshold or hypothesis collapse.

B) Minecraft proving tasks
Locate structure/resource without known location (village/fortress). Probes: travel to vantage, biome sampling, mob mix sampling, follow terrain features.

C) State representation
Belief map compressed into region buckets: probability mass per region, explored mask, last probe times, evidence features. Hash should be stable under irrelevant sensory noise (bucket probabilities).

D) Operators
Probe actions with explicit expected evidence and cost/risk. Transition updates beliefs deterministically given observed evidence payload from the bot.

E) Certification gates
Entropy reduction per step; probe choice is discriminative; reaching confidence threshold faster than baseline exploration.

F) Performance measurements
Time-to-localization, probes count, risk exposure, belief calibration (when found, confidence was high).

G) Transfer tests
Diagnosis toy surface: hypothesis set + tests; same belief update and confidence threshold semantics.

H) Footguns avoided
Beliefs hidden inside heuristics; non-replayable updates; reinforcing “lucky finds” rather than information gain.

Status: Planned.

---

## Rig I-ext: Entity belief tracking and saliency (epistemic + invariant coupling)

A) Primitives and formal signature

Primary:
- Entity belief maintenance and saliency under partial observability (21)

Also:
- Epistemic planning (11), Invariant maintenance (12), Risk-aware planning (10), Representation invariance and state canonicalization (16), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19)

Signature:
- TrackSet: bounded set of track hypotheses (track_id; class belief distribution incl. unknown; kinematic belief with uncertainty; last_seen bucket; visibility mode {visible/inferred/lost}; derived threat/opportunity scores with declared weights)
- EvidenceBatch: time-stamped evidence with sensor metadata (FOV/LOS, distance, occlusion markers) and association features
- AttentionBudget: explicit compute + sensing budgets (attention is modeled, not implicit)
- Operators: TRACK_UPDATE (deterministic association + fusion), DECAY (uncertainty growth; confidence drifts toward unknown), SALIENCY_DIFF (bounded typed deltas with hysteresis + cooldown), ACTIVE_SENSE_REQUEST (turn/scan/reacquire), FIELD_SYNTHESIZE (optional; emits compressed hazard regions, not full grids)

Critical boundary: this rig proves the perception → belief → delta contract, not a specific filter algorithm.

B) Minecraft proving tasks

1) Persistence under occlusion
Entity enters FOV, leaves behind wall, reappears. Must maintain a single track with decayed uncertainty (no "novel spawn" spam).

2) Association under ID noise (anti-cheat harness)
Disable or perturb engine entity IDs in the evidence payload for a subset of trials; association must rely on kinematics + features, not ID equality.

3) Saliency gating
Stable entity for N ticks produces ~0 downstream events after warmup. Only meaningful deltas (closing distance, reclassification, sudden appearance/loss) propagate.

4) Active sensing as first-class action
If a high-threat track transitions to inferred/lost below threshold, emit a reacquire query (turn/scan/relocate) instead of silently proceeding.

5) Risk propagation and avoidance
Threat scores produce a compressed hazard summary consumed by navigation/planning (avoid hot zones without LLM-per-tick interpretation).

6) Execution-grounded updates
If death occurs, only penalize tracking when pre-death evidence indicates a preventable miss (track existed + high confidence + risk budget violation). Otherwise mark cause as unobserved/unknown (no noisy blame).

C) State representation

Canonical planning state must remain compact:
- Track canonical form: bucketed pose; bucketed velocity; class distribution quantized; recency tier (bucketed last_seen); visibility enum; threat/opportunity buckets
- Deterministic ordering: sort tracks by track_id for hashing/iteration
- Boundedness: cap track count; evict lowest priority (threat×recency×relevance) first

Important: provenance is audit data, not state equivalence. Keep evidence ring buffers in the trace bundle, but exclude raw evidence/provenance IDs from the planning state hash.

D) Operators

Evidence ingestion: FOV scan batches, targeted LOS raycast confirmations, proximity/attack events (as evidence), optional audio cues.
Belief updates: deterministic association, filter update, decay, merge/split rules (bounded), eviction (policy-driven).
Sensing actions (edges): turn-to(bearing), sector-scan(region), move-to-vantage(position), all explicitly budgeted.

E) Certification gates

Boundedness: TrackSet.size <= TRACK_CAP always; eviction is deterministic under ties.
Event sparsity: after warmup, events/tick <= MAX_EVENTS_PER_TICK in stable scenes (with hysteresis + cooldowns).
Uncertainty honesty: when unobserved, class confidence drifts toward unknown and pose uncertainty grows.
Separation: raw detections never directly create tasks; only SALIENCY_DIFF outputs cross into cognition/planning.
Determinism: identical evidence streams (after canonical ordering + timestamp bucketing) yield identical TrackSet hash and identical emitted events.
Anti-ID reliance: association accuracy remains above baseline under ID perturbation harness.

F) Performance measurements

- Track identity persistence (reappearance association rate)
- Event efficiency (events per tick after warmup)
- Reacquire success rate (lost high-threat tracks recovered via sensing queries)
- Safety outcomes (deaths preceded by ignored hazard summary; false positives from stale tracks)
- Attribution precision (penalties applied only when evidence supports preventability)

G) Transfer tests

Robotics surface: tracks from cone sensors; active sensing as gimbal/path commands; same decay/saliency semantics.
Security monitoring: actors across intermittent camera coverage; PTZ reacquire as sensing actions; stable scenes emit ~0.
Infrastructure diagnosis: services/incidents as tracks; probes as evidence; decay by staleness; diagnostic queries as active sensing.

H) Footguns avoided

- Trusting external IDs as ground truth (explicit ID-noise proving task).
- Mixing audit provenance into canonical state hashing (trace-only provenance).
- Full-grid risk fields in planning state (use compressed hazard regions).
- Event storms from threshold jitter (hysteresis + cooldown gates).
- Penalizing "unknown cause" failures (execution-grounded preventability check).

Status: Planned. Conceptually placed after Rig I, but depends on Rig J's invariant semantics.

---

## Rig J: Invariant maintenance (non-terminal goals; receding horizon)

A) Primitives and formal signature

Primary: 
- Invariant maintenance (12)

Also: 
- Multi-objective optimization and preference articulation (18), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19)

Signature: 
- state includes invariant metrics + drift; actions restore; solved repeatedly as MPC/receding horizon.

B) Minecraft proving tasks
Maintain base: light coverage threshold, food buffer, tool durability, door integrity. Drift: night cycles, consumption, mob damage.

C) State representation
Invariant vector: light_coverage, food_buffer, tool_health, perimeter_gaps, plus time-to-night. Hash canonicalizes continuous metrics into buckets.

D) Operators
Maintenance actions: craft torches, place torches, cook food, repair wall, replace tool. Costs include disruption to current tasks and resource burn.

E) Certification gates
Reduction in emergency frequency; proactive actions scheduled before violations; stable maintenance cycles.

F) Performance measurements
Invariant violation rate, emergency interventions, resource burn, disruption time.

G) Transfer tests
SRE-style maintenance surface (SLO hygiene tasks) with identical drift/restore semantics.

H) Footguns avoided
Turning maintenance into a pile of reactive triggers; no horizon; no explanation for why a maintenance action preempted a goal task.

Status: Planned.

---

## Rig K: Irreversibility and commitment planning

A) Primitives and formal signature

Primary: 
- Irreversibility and commitment planning (13)

Also: 
- Audit-grade explanations (19), Adversarial robustness / "rule injection" hardening (20)

Signature: 
- some actions irreversible or expensive rollback; planner must delay commitment until verification; one-way door constraints.

B) Minecraft proving tasks
Villager trade locking: reroll vs lock; curing timing; leveling commits; workstation placement. Also “commit to base location” if you choose to model it.

C) State representation
Commitment state: which trades locked, villager levels, available rerolls, and irreversible actions remaining. Canonicalization must capture “option value remaining.”

D) Operators
Verify (probe trades), reroll (break workstation), lock (trade/level), cure, and stop conditions (“do not proceed until evidence threshold met”).

E) Certification gates
No premature irreversible steps; “verify before commit” plans appear; fewer irreversible-regret episodes under repeated trials.

F) Performance measurements
Time-to-target trade, irreversible mistakes rate, number of rerolls, resource burn.

G) Transfer tests
Migration/cutover toy surface: verification gates before irreversible steps.

H) Footguns avoided
Treating irreversibility as just a cost; allowing learned priors to override required verification.

Status: Planned.

---

## Rig L: Contingency planning with exogenous events (policy planning)

A) Primitives and formal signature

Primary: 
- Contingency planning with exogenous events (9)

Also: 
- Multi-objective optimization and preference articulation (18), Audit-grade explanations (19)

Signature: 
- chosen actions and forced transitions; hazard triggers; policy/branching; goal includes survivability/invariants.

B) Minecraft proving tasks
Plan mining trip while anticipating nightfall and hunger ticks. Forced transitions are modeled explicitly (time triggers).

C) Requirements
This rig only makes sense once you have temporal modeling discipline from Rig C and invariant discipline from Rig J.

Status: Later.

---

## Rig M: Risk-aware planning (tail risk)

A) Primitives and formal signature

Primary: 
- Risk-aware planning (10)

Also: 
- Multi-objective optimization and preference articulation (18), Credit assignment tied to execution, not plans (17), Audit-grade explanations (19)

Signature: 
- stochastic outcomes; chance constraints or distributional objective; risk budget; learning updates failure likelihoods.

B) Minecraft proving tasks
Lava mining vs safer alternatives; nether traversal routes. Model death probability from execution history; enforce P(death)<ε for high-value loadouts.

Status: Later.

---

## Rig N: Fault diagnosis and repair

A) Primitives and formal signature

Primary: 
- Fault diagnosis and repair (15)

Also: 
- Epistemic planning (11), Audit-grade explanations (19)

Signature: 
- hypothesis set; tests reduce entropy; repair operators; validation step.

B) Minecraft proving tasks
Diagnose jammed item transport or failing farm hydration. Tests: inspect, sample flow, isolate module; repair; re-test.

Status: Later.

---

## Implementation priority (capability-first)

Track 1 (tightening what you already have):
1.	Rig A certification hardening (validation, canonicalization, trace hashing, execution credit, explanations)
2.	Rig B (capability gating)
3.	Rig C (temporal + capacity)

Track 2 (widening representational power once A–C are solid):

1. Rig D (multi-strategy acquisition)
2. Rig E (hierarchical macro/micro)
3. Rig I (epistemic)
4. Rig J (invariant maintenance)
5. Rig I-ext (entity belief tracking)
6. Rig K (irreversibility)

Later (policy, risk, diagnosis):
- Rig L → Rig M → Rig N

This ordering is chosen to keep substrate invariants from drifting: temporal and legality foundations (A–C) prevent you from building later rigs on ambiguous semantics.

---

## What “done” means for a rig

A rig is not “done” when it returns a plan once. It’s done when it passes:

1.	Signature tests

Legality, determinism, boundedness, canonicalization, validation/hardening.

2.	Performance tests

Repeat solves improve (fewer expansions / faster completion) without destabilizing correctness. Learning does not alter semantics.

3.	Transfer tests

Same formal signature runs on at least one non-Minecraft surface (or a second distinct Minecraft surface) with the same invariants and harness.

---

## Architecture

```
EnhancedTaskIntegration                Sterling (Python, external)
  generateDynamicSteps()               +---------------------------+
        |                              | ws://localhost:8766       |
        v                              |                           |
  MinecraftCraftingSolver              | Domain handler receives:  |
   .solveCraftingGoal()  --- WS -----> |   rules[], state, goal   |
        |                              | Returns:                  |
        v                              |   discover, search_edge,  |
  TaskStep[] with leaf annotations     |   solution_path, complete |
        |                              +---------------------------+
        v
  BT / Leaf execution
```
