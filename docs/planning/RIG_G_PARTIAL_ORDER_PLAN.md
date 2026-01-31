# Rig G: Feasibility Under Constraints and Partial-Order Structure Implementation Plan

**Primitive**: P7 — Feasibility under constraints and partial-order structure

**Status**: Planned (Track 3)

---

## 1. Target invariant (critical boundary)

**"Sterling avoids impossible sequences and produces partially ordered plans that allow valid linearizations."**

The system must:
- Model nontrivial preconditions (support, dependency, reachability)
- Recognize when steps can commute (no ordering required)
- Output partially ordered plans, not just total orderings
- Execution chooses a valid linearization

**What this rig proves**: Sterling can reason about feasibility constraints and flexible execution order.

---

## 2. Formal signature

- **Operators have nontrivial preconditions**: support constraints, dependency, reachability
- **Some steps can commute**: "craft torch" and "mine coal" have no ordering dependency
- **Solution is a partially ordered plan**: DAG of steps with ordering constraints
- **Execution chooses valid linearization**: any topological sort is valid

---

## 3. Problem being solved

### 3.1 Current state (total ordering only)

Without partial-order:
- Planner produces a single sequence even when order doesn't matter
- Building tasks impose false ordering (must place block A before B, even if independent)
- No model of support constraints (can't place floating blocks)

### 3.2 With partial-order

With proper partial-order:
- Plan is a DAG: "place foundation" → "place walls" → "place roof"
- Independent steps can be reordered by execution: "craft torch" and "craft pickaxe" commute
- Impossible sequences (floating blocks) are rejected at plan time

---

## 4. What to investigate before implementing

| Step | Location | What to verify |
|------|----------|----------------|
| Plan output | `packages/planning/src/sterling/` | Solve result shape; steps as list today; where DAG would replace |
| Building solver | `minecraft-building-solver.ts` | Building domain; support/placement constraints today |
| Execution | `packages/planning/src/reactive-executor/` | How steps are executed; order dependency; where linearization happens |
| World state | world-state-manager, minecraft-interface | Block placement state; support check data source |

**Outcome:** Confirm plan output format; where building constraints live; where execution order is determined.

---

## 5. What to implement / change

### 5.1 Constraint model

**Location**: Sterling domain or `packages/planning/src/constraints/`

- Define support constraints: "block at (X, Y, Z) requires support at (X, Y-1, Z)"
- Define dependency constraints: "smelt iron requires furnace placed"
- Define reachability constraints: "can only interact with blocks within reach"

### 5.2 Partial-order representation

- Plan is a DAG, not a list
- Edges represent ordering constraints
- Nodes without edges can be executed in any order

### 5.3 Feasibility checking

- Before adding step to plan, check all preconditions
- Support constraints checked geometrically
- Dependency constraints checked via state

### 5.4 Linearization at execution

- Execution layer receives DAG
- Chooses valid topological sort based on current state
- Can adapt order opportunistically (if one branch is blocked, try another)

---

## 6. Where (summary)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Constraint model | Domain rules | Define support, dependency, reachability |
| Partial-order output | Sterling solver | Output DAG instead of list |
| Feasibility checker | Search | Reject infeasible states |
| Linearization | Execution layer | Choose valid order at runtime |

---

## 7. Order of work (suggested)

1. **Define constraint types**: support, dependency, reachability.
2. **Implement feasibility checking** for building domain.
3. **Modify solver output** to produce DAG instead of list.
4. **Add linearization logic** in execution layer.
5. **Certification tests**: impossible sequences rejected; commuting steps flexible.

---

## 8. Dependencies and risks

- **Rig A-F**: Builds on previous capabilities.
- **Constraint complexity**: Too many constraints = intractable; too few = infeasible plans.
- **DAG representation**: Execution layer must handle DAG, not just list.
- **Support geometry**: Minecraft support rules are complex (gravity, etc.).

---

## 9. Definition of "done"

- **Feasibility enforced**: Impossible sequences never in output.
- **Partial-order output**: Plans are DAGs with explicit ordering constraints.
- **Commuting recognized**: Independent steps are not artificially ordered.
- **Execution flexibility**: Runtime can choose any valid linearization.
- **Tests**: Building constraints work; commuting steps are flexible.

---

## 10. Cross-references

- **Companion approach**: `RIG_G_PARTIAL_ORDER_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P7)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig G section)
