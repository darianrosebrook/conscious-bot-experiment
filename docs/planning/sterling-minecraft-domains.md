# Sterling × Minecraft: Capability Rigs for a General Reasoning Substrate

Purpose

This document replaces “Minecraft domains” with a capability-first proving plan.

Minecraft is treated strictly as an experimental rig. Each rig is designed to prove a certifiable capability primitive in a controlled setting, with auditable traces and explicit invariants. The output of this work is a general reasoning substrate (operators, state canonicalization, learning semantics, audit trail), not a collection of Minecraft-specific domain handlers.

Sterling remains an external Python service providing graph search + learned edge ordering, reasoning over semantic state space. The bot remains the source of Minecraft knowledge at solve time.

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

---

## Capability rig index (what we will prove)

Rigs are grouped as “minimal proving suites.” Each rig targets one or more primitives and has a crisp certification plan: signature tests, performance tests, transfer tests.

### Rig A: Inventory transformation planning
Proves primitives: 1, 16, 17, 19, 20
Status: implemented baseline (crafting), needs certification harness tightening

### Rig B: Capability gating and legality
Proves primitives: 2, 16, 19, 20
Status: planned (tool tiers + station gating)

### Rig C: Temporal planning with capacity and batching
Proves primitives: 3, 18, 16, 17, 19
Status: planned (furnaces + burn time + parallel slots)

### Rig D: Multi-strategy acquisition with environment-conditioned priors
Proves primitives: 4, 17, 18, 19, 20 (and optionally 10 if risk modeled)
Status: planned (mine vs trade vs loot vs substitute)

### Rig E: Hierarchical planning (macro over micro controllers)
Proves primitives: 5, 16, 17, 19
Status: planned (waypoints macro + Mineflayer micro)

### Rig F: Goal-conditioned valuation under scarcity
Proves primitives: 6, 18, 16, 17, 19
Status: planned (keep/drop/store given goals)

### Rig G: Feasibility + partial-order structure planning
Proves primitives: 7, 16, 17, 19
Status: planned (shelter build sequencing under support/reachability constraints)

### Rig H: Systems synthesis in a deterministic simulator
Proves primitives: 8, 14, 16, 19
Status: planned (farm layout first; redstone later)

### Rig I: Epistemic planning (belief-state + active sensing)
Proves primitives: 11, 19, 17 (and 13 if commitment decisions included)
Status: planned (structure localization via probes)

### Rig J: Invariant maintenance (receding horizon control)
Proves primitives: 12, 18, 17, 19
Status: planned (base light/food/tool buffers)

### Rig K: Irreversibility and commitment planning
Proves primitives: 13, 19, 20
Status: planned (villager trade locking + “verify before commit”)

### Rig L: Contingency planning with exogenous events
Proves primitives: 9, 18, 19
Status: later (nightfall/hunger ticks modeled as forced edges)

### Rig M: Risk-aware planning (tail risk)
Proves primitives: 10, 18, 17, 19
Status: later (chance constraints, CVaR-ish objectives)

### Rig N: Fault diagnosis and repair (hypotheses → tests → fix)
Proves primitives: 15, 11, 19
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
- 1 deterministic transformation planning

Also: 
- 16 canonicalization, 17 execution-grounded credit, 19 audit explanations, 20 rule hardening


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

Status: Implemented baseline. Next work is certification hardening: strict validation, trace bundle hashing, and execution-based credit updates.

---

## Rig B: Capability gating and legality

A) Primitives and formal signature

Primary: 
- 2 capability gating and legality


Also: 
- 16, 19, 20

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

Status: Planned. This is the natural next rig after A.

---

## Rig C: Temporal planning with durations, batching, and capacity

A) Primitives and formal signature

Primary: 
- 3 temporal planning

Also: 
- 18 multi-objective clarity (time), 16, 17, 19

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

Status: Planned. Comes after B if you want “smelting chains” as a certified capability, not just a domain.

---

## Rig D: Multi-strategy acquisition (alternatives, failure modes, world-conditioned priors)

A) Primitives and formal signature

Primary: 
- 4 multi-strategy acquisition

Also: 
- 17, 18, 19, 20 (and optionally 10 if risk modeled)

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

Status: Planned.

---

## Rig E: Hierarchical planning (macro policy over micro controllers)

A) Primitives and formal signature

Primary: 
- 5 hierarchical planning

Also: 
- 16, 17, 19

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

Status: Planned.

---

## Rig F: Goal-conditioned valuation under scarcity (keep/drop/allocate)

A) Primitives and formal signature

Primary: 
- 6 valuation under scarcity

Also: 
- 18, 16, 17, 19

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

Status: Planned.

---

## Rig G: Feasibility under constraints and partial-order structure (build sequencing)

A) Primitives and formal signature

Primary: 
- 7 feasibility + partial order

Also: 
- 16, 17, 19 (and 14 if you move to program-level templates)

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

Status: Planned.

---

## Rig H: Systems synthesis (compose components to satisfy a behavioral spec)

A) Primitives and formal signature

Primary: 
- 8 synthesis

Also: 
- 14 compressed planning, 16, 19

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
- 11 epistemic planning

Also: 
- 19, 17 (and 13 if you include commitments)

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

## Rig J: Invariant maintenance (non-terminal goals; receding horizon)

A) Primitives and formal signature

Primary: 
- 12 invariant maintenance

Also: 
- 18, 17, 19

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
- 13 irreversibility

Also: 
- 19, 20

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
- 9 contingency planning

Also: 
- 18, 19

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
- 10 risk-aware

Also: 
- 18, 17, 19

Signature: 
- stochastic outcomes; chance constraints or distributional objective; risk budget; learning updates failure likelihoods.

B) Minecraft proving tasks
Lava mining vs safer alternatives; nether traversal routes. Model death probability from execution history; enforce P(death)<ε for high-value loadouts.

Status: Later.

---

## Rig N: Fault diagnosis and repair

A) Primitives and formal signature

Primary: 
- 15 diagnosis/repair

Also: 
- 11 epistemic, 19

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
5. Rig K (irreversibility)

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
