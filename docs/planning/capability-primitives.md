# Sterling Enabled Capabilities for Conscious Bot
This represents the “capability primitives + transfer envelopes,” with toy domains treated only as a convenient proving rig. Each entry has: (1) the primitive, (2) the formal signature (what Sterling must represent/verify), (3) what you prove in the rig, and (4) the transfer envelope (where the same problem-shape recurs).

The intended goal is a general reasoning substrate rather than a collection of domain handlers.

---

 ### Capability primitive 1: Deterministic transformation planning (resource → product)
Formal signature: finite discrete state; typed operators with preconditions/effects; additive cost; goal predicate as subset/constraint satisfaction; search for minimal-cost path; optional learned edge ordering that does not change transition semantics.
Prove in the rig: “given state + operator set, find a valid minimal plan; return a traceable, executable path; repeat solves converge to stable shortcuts without breaking correctness.”
Transfer envelope: bill-of-materials assembly planning; software build graphs and packaging; data pipeline DAG execution (when deterministic); configuration rollout sequences; “make vs buy vs substitute” within constrained catalogs.

---

 ### Capability primitive 2: Capability gating and legality (what actions are permitted)
Formal signature: state includes a capability set; operators are enabled/disabled by capability predicates; monotone or partially monotone capability progression; legality checks are fail-closed.
Prove in the rig: “Sterling never proposes an illegal operator; it can reason about acquiring capabilities as first-class subgoals.”
Transfer envelope: permissioned enterprise workflows; safety certification ladders; staged rollout gates; robotics autonomy levels; regulated operations where approval unlocks actions.

---

 ### Capability primitive 3: Temporal planning with durations, batching, and capacity
Formal signature: actions with duration and possible resource occupancy; objective includes time; state includes clocks or remaining-time fields; optionally parallel machines/slots; constraints on concurrency.
Prove in the rig: “Sterling can model time-consuming steps, prefer batch-efficient sequences, and avoid dead schedules.”
Transfer envelope: manufacturing/heat-treatment/curing; kitchen/fulfillment operations; ML pipelines with long-running jobs; ETL orchestration with queues; incident mitigation plans with ‘wait for stabilization’ phases.

---

 ### Capability primitive 4: Multi-strategy acquisition (alternative methods, different failure modes)
Formal signature: multiple operator families reach the same subgoal; costs differ; some operators have preconditions that come from external availability; learning updates “which strategy works here.”
Prove in the rig: “Sterling can choose among strategies, not just sequences, and adapt the strategy prior from experience.”
Transfer envelope: procurement (vendors, substitutions, lead times); staffing (hire vs contract vs internal); data acquisition (instrument vs scrape vs partner); operational workarounds (rollback vs hotfix vs feature flag).

---

 ### Capability primitive 5: Hierarchical planning (macro policy over micro solvers)
Formal signature: two (or more) abstraction layers; macro nodes represent regions/waypoints/contexts; micro controller handles local execution; macro edges invoke sub-solvers; costs incorporate execution feedback.
Prove in the rig: “Sterling chooses the right high-level route/plan structure while delegating low-level details; failures feed back into macro costs.”
Transfer envelope: warehouse robotics (zone routing vs local motion); driving (route vs lane); network routing (AS/path vs packet); program synthesis (choose template then compile); organizational planning (initiative selection vs task execution).

---

 ### Capability primitive 6: Goal-conditioned valuation under scarcity (keep/drop/allocate)
Formal signature: constrained capacity (slots, budget, attention); objective is utility under current goals; value model can shift with goals; learning updates item/action valuations.
Prove in the rig: “Sterling’s choices reflect priorities; it can explain what it sacrificed and why.”
Transfer envelope: cache eviction; budget allocation; portfolio selection; triage queues; compute/job scheduling with limited capacity; backlog prioritization in product/engineering.

---

 ### Capability primitive 7: Feasibility under constraints and partial-order structure
Formal signature: operators have nontrivial preconditions (support, dependency, reachability); some steps can commute; solution is a partially ordered plan; execution chooses a valid linearization.
Prove in the rig: “Sterling avoids impossible sequences and learns stable partial orders that reduce rework.”
Transfer envelope: construction scheduling; CI/CD release pipelines; data migrations; complex onboarding (IT/legal/provisioning); regulated procedures with required ordering.

---

 ### Capability primitive 8: Systems synthesis (compose components to satisfy a behavioral spec)
Formal signature: state is a partial design; operators add components; evaluation function checks behavior/spec satisfaction (deterministic simulator if possible); goal is “spec holds.”
Prove in the rig: “Sterling can search a design space, not just a trajectory space; it can reuse motifs and detect near-misses.”
Transfer envelope: workflow automation (triggers/conditions/actions); configuration synthesis; dataflow graph construction; policy-as-code generation; UI state machine synthesis; circuit-like problems broadly.

---

 ### Capability primitive 9: Contingency planning with exogenous events
Formal signature: edges include chosen actions and forced transitions; state includes timeline/hazard triggers; goal includes survivability or invariant preservation; plan may be a policy (conditional branches).
Prove in the rig: “Sterling anticipates predictable external transitions and chooses actions that remain safe under them.”
Transfer envelope: SRE (autoscaling, incident escalation); robotics safety (interrupt/resume); finance risk events; operations planning around deadlines; supply chain disruptions with known probabilities.

---

 ### Capability primitive 10: Risk-aware planning (tail risk, not just expected cost)
Formal signature: stochastic outcomes; cost is distributional (e.g., chance constraints P(failure) < ε, CVaR); state includes risk budget; learning updates failure likelihoods.
Prove in the rig: “Sterling prefers robust plans when stakes are high, and it can trade speed for safety in a principled way.”
Transfer envelope: safety-critical autonomy; security response; compliance workflows; finance; healthcare protocols; anywhere catastrophic failure dominates the objective.

---

 ### Capability primitive 11: Epistemic planning (belief-state and active sensing)
Formal signature: nodes represent beliefs (prob distributions or hypothesis sets); edges are probes/tests; transitions update beliefs; goal is confidence threshold or hypothesis collapse; cost is probe expense + risk.
Prove in the rig: “Sterling can decide what to measure next, not only what to do next.”
Transfer envelope: debugging/diagnosis; scientific experimentation; user research planning; fraud investigation; exploratory data analysis; root cause analysis for complex systems.

---

 ### Capability primitive 12: Invariant maintenance (non-terminal goals; control-by-receding-horizon)
Formal signature: state includes invariant metrics; drift dynamics; actions restore metrics; goal is to keep invariants within bounds over time (often solved repeatedly as MPC/receding horizon).
Prove in the rig: “Sterling moves from reactive to proactive: it schedules upkeep to prevent emergencies.”
Transfer envelope: SLO/SRE maintenance; security hygiene; data quality; preventive maintenance; operational compliance; “keep the system healthy” loops.

---

 ### Capability primitive 13: Irreversibility and commitment planning
Formal signature: some actions are irreversible or have large rollback cost; objective includes option value; planner must delay commitment until evidence threshold; constraints encode one-way doors.
Prove in the rig: “Sterling avoids premature irreversible steps; it sequences ‘verify before commit’ actions.”
Transfer envelope: migrations/cutovers; vendor contracts; hiring/org changes; security key rotations; high-stakes approvals; policy changes.

---

 ### Capability primitive 14: Program-level planning (search over compressed representations)
Formal signature: plan is a structured program (templates/modules/parameters); edges refine program; compilation maps program → concrete actions; correctness requires compilation validity + constraint satisfaction.
Prove in the rig: “Sterling stays tractable by searching in a compressed space; it can justify template choice and parameterization.”
Transfer envelope: infrastructure design; build/layout planning; automation workflows; code refactors; UI layout generation; many synthesis problems where atomistic search explodes.

---

 ### Capability primitive 15: Fault diagnosis and repair (hypotheses → tests → fix)
Formal signature: hypothesis set; test operators reduce entropy; repair operators modify system; goal is “fault isolated + fix validated”; learning ranks tests by information gain.
Prove in the rig: “Sterling chooses discriminative tests first; minimizes time-to-isolation; validates fixes.”
Transfer envelope: debugging production incidents; hardware troubleshooting; data pipeline validation; QA triage; customer support escalation trees.

---

 ### Capability primitive 16: Representation invariance and state canonicalization
Why it matters: generalization hinges on canonical state hashing, count-capping, symmetry reduction, and “equivalence under irrelevant variation.” Without this, every domain becomes brittle and memory-hungry.
Transfer envelope: any domain where raw state is high-dimensional (logs, inventories, graphs, documents) but decisions depend on a compressed invariant.

---

 ### Capability primitive 17: Credit assignment tied to execution, not plans
Why it matters: you already saw the trap: reinforcing “planned success” instead of “executed success.” This is a general capability: separating hypothesized plans from verified outcomes, then updating priors correctly.
Transfer envelope: automation systems, agents operating with unreliable actuators/APIs, robotics, ops runbooks.

---

 ### Capability primitive 18: Multi-objective optimization and preference articulation
Why it matters: real-world planning is rarely single scalar cost. You need Pareto handling (time vs risk vs resource burn vs disruption) and a way to surface trade-offs.
Transfer envelope: policy decisions, scheduling, procurement, incident response, UI/UX workflow automation.

---

 ### Capability primitive 19: Audit-grade explanations (why this plan, why not that plan)
Why it matters: if Sterling is a proving ground for trustworthy reasoning, you want structured rationales: which constraints bound the choice, which evidence updated beliefs, which alternatives were rejected and why.
Transfer envelope: compliance, safety, enterprise adoption, debugging, model governance.

---

 ### Capability primitive 20: Adversarial robustness / “rule injection” hardening
Why it matters: many domains are client-defined at solve time. You need input validation, boundedness, and “no untrusted semantics” guarantees.
Transfer envelope: any agentic integration, plugin ecosystems, multi-tenant planners.

---

We will treat each primitive as a “certifiable capability,” you can define a minimal proving suite per primitive:
	1.	Signature tests: does it satisfy the formal constraints (legality, boundedness, determinism)?
	2.	Performance tests: does it improve over episodes without destabilizing correctness?
	3.	Transfer tests: same primitive, different surface domain, same invariants.