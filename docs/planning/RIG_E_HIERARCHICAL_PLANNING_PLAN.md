# Rig E: Hierarchical Planning Implementation Plan

**Primitive**: P5 — Hierarchical planning (macro policy over micro solvers)

**Status**: Planned (Track 3, after A-D)

---

## 1. Target invariant (critical boundary)

**"Macro planner chooses structure; micro controllers handle execution; failures feed back into macro costs."**

The system must:
- Separate macro-level planning (what to do) from micro-level execution (how to do it)
- Use sub-solvers for local execution within macro regions
- Incorporate execution feedback into macro costs
- Avoid re-planning at micro level when macro structure is valid

**What this rig proves**: Sterling can plan hierarchically with layered abstraction.

---

## 2. Formal signature

- **Two or more abstraction layers**: macro (regions/waypoints) and micro (local actions)
- **Macro nodes represent contexts**: "at_base", "at_mine", "traveling_to_X"
- **Micro controller handles local execution**: Mineflayer pathfinding, combat, etc.
- **Macro edges invoke sub-solvers**: "mine_iron_at_location" delegates to micro
- **Costs incorporate execution feedback**: failed micro execution increases macro edge cost

---

## 3. Problem being solved

### 3.1 Current state (flat planning)

Without hierarchical planning:
- Planner reasons about every block placement and step
- Long-horizon goals explode the search space
- No separation between "go to mine" and "mine specific blocks"

### 3.2 With hierarchical planning

With proper hierarchy:
- Macro plan: "go to mine → mine iron → return to base → smelt"
- Micro execution: Mineflayer handles pathfinding within each macro step
- Failures at micro level feed back: "mine_iron failed → increase mine_iron cost"

---

## 4. What to investigate before implementing

| Step | Location | What to verify |
|------|----------|----------------|
| Planning flow | `packages/planning/src/task-integration.ts` | How goals become tasks; where macro plan would sit |
| Solver delegation | `packages/planning/src/sterling/` | Solver invocation; where macro edges would delegate |
| Execution loop | `packages/planning/src/reactive-executor/` or minecraft-interface | Step execution; where micro controller is invoked |
| Feedback path | task-integration, modular-server | Where step success/failure is reported |
| Hierarchical planner | `packages/planning/src/hierarchical-planner/` | Existing HTN/plan decomposer; reuse vs extend |

**Outcome:** Confirm where macro plan is produced; where micro execution is invoked; where feedback is reported.

---

## 5. What to implement / change

### 5.1 Macro state representation

**Location**: Sterling domain or `packages/planning/src/hierarchical/`

- Define macro nodes: location contexts, activity states
- Define macro edges: transitions between contexts (invoke micro solvers)
- Macro state is abstract: "at_mine" not "at position (X, Y, Z)"

### 5.2 Micro controller integration

- Mineflayer handles pathfinding, block interaction, combat
- Micro controller is invoked by macro edge execution
- Micro controller reports success/failure/cost to macro layer

### 5.3 Feedback loop

- Execution success: macro edge cost stays same or decreases
- Execution failure: macro edge cost increases
- Repeated failures: macro planner chooses different route

### 5.4 Sub-solver delegation

- Macro edges can invoke Sterling sub-solves for complex micro tasks
- Or delegate to simpler heuristic controllers
- Clear interface between macro and micro layers

---

## 6. Where (summary)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Macro state | Sterling domain | Abstract context representation |
| Macro planner | Sterling solver | Choose macro structure |
| Micro controller | Mineflayer / BT | Execute within macro context |
| Feedback integration | Planning layer | Update macro costs from micro outcomes |

---

## 7. Order of work (suggested)

1. **Define macro state** with location contexts and activity states.
2. **Define macro edges** that invoke micro controllers.
3. **Implement micro delegation** to Mineflayer for pathfinding.
4. **Add feedback loop** from micro outcomes to macro costs.
5. **Test hierarchical separation**: macro re-plan triggers, micro failure handling.
6. **Certification tests**: macro structure is stable; micro failures update costs.

---

## 8. Dependencies and risks

- **Rig A-D**: Builds on operators, legality, temporal, and strategies.
- **Abstraction granularity**: Too coarse = poor plans; too fine = no benefit.
- **Feedback attribution**: Which macro edge is responsible for micro failure?
- **Layering complexity**: Two-layer adds complexity; three+ layers are risky.

---

## 9. Definition of "done"

- **Macro/micro separation**: Clear boundary between layers.
- **Sub-solver delegation**: Micro controllers handle local execution.
- **Feedback works**: Micro failures increase macro edge costs.
- **Efficiency**: Long-horizon goals are tractable (don't plan every block).
- **Tests**: Macro re-plans when micro repeatedly fails; hierarchical beats flat.

---

## 10. Cross-references

- **Companion approach**: `RIG_E_HIERARCHICAL_PLANNING_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P5)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig E section)
- **Rig A-D**: Foundation layers
