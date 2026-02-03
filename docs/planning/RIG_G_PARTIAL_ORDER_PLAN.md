# Rig G: Feasibility Under Constraints and Partial-Order Structure Implementation Plan

**Primitive**: P7 — Feasibility under constraints and partial-order structure

**Status**: ENRICHED (2026-01-31)
**Implementation**: Partial — partial-order-plan, dag-builder, constraint-model, feasibility-checker, linearization exist in `planning/constraints/`

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

**Investigation outcome (verified 2025-01-31):** Plan output is list of steps. `MinecraftBuildingSolver.solveBuildingPlan` (minecraft-building-solver.ts:61-80) returns `BuildingSolveResult` with `steps: BuildingSolveStep[]`; Sterling returns solution path as ordered list. Building domain: `BuildingModule` has `requiresModules` (dependency); `siteState` has `placementFeasible`; no support constraints or partial-order DAG. Execution: reactive-executor (reactive-executor.ts) executes steps in order; no linearization from DAG. World state: world-state-manager (WorldStateSnapshot) has nearbyBlocks; no block placement or support check. Plan format would change from `steps[]` to DAG (nodes + edges); execution would need topological linearization.

### 4a. Current code anchors (verified 2025-01-31)

| File | Line(s) | What |
|------|---------|------|
| `packages/planning/src/sterling/minecraft-building-solver.ts` | 61-80, 68-69 | `solveBuildingPlan()`: returns `steps: []`; Sterling returns ordered steps; no DAG. |
| `packages/planning/src/sterling/minecraft-building-types.ts` | BuildingModule, BuildingSolveStep | `requiresModules` for dependency; step as flat object; no ordering edges. |
| `packages/planning/src/reactive-executor/reactive-executor.ts` | step execution | Executes steps in list order; no partial-order linearization. |
| `packages/planning/src/world-state/world-state-manager.ts` | 16-27 | `WorldStateSnapshot`: nearbyBlocks; no block placement map or support check. |

**Gap:** No partial-order DAG; no support constraints; no feasibility check for floating blocks; execution assumes total order.

### 4b. conscious-bot vs Sterling split

| Responsibility | Owner | Location |
|----------------|-------|----------|
| Constraint model (support, dependency, reachability) | conscious-bot | `packages/planning/src/constraints/constraint-model.ts` (new) |
| Feasibility checker (reject infeasible states) | conscious-bot | `packages/planning/src/constraints/feasibility-checker.ts` (new) |
| Partial-order DAG output (nodes + edges) | conscious-bot or Sterling | `packages/planning/src/sterling/` — extend solve result to DAG |
| Linearization at execution | conscious-bot | `packages/planning/src/reactive-executor/linearizer.ts` (new) |

**Contract:** conscious-bot defines constraints and feasibility; Sterling (or conscious-bot solver) returns DAG; execution layer linearizes to valid order.

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

## 7. Implementation pivots

| Pivot | Problem | Acceptance |
|-------|---------|------------|
| 1 DAG representation only | List + implicit order causes ambiguity | Plan output is DAG (nodes + edges); no total order in output. |
| 2 Deterministic linearization | Non-deterministic order breaks replay | linearize(dag) uses deterministic sort (e.g. node id, then edge order). |
| 3 Support constraints checked before add | Floating blocks in plan cause execution failure | checkFeasibility(step, state) rejects step if support violated. |
| 4 Bounded DAG size | Unbounded DAG causes explosion | MAX_DAG_NODES (e.g. 200); planner stops at bound. |
| 5 Commuting steps not artificially ordered | False ordering reduces flexibility | Steps with no dependency have no edge between them. |

---

## 8. Transfer surfaces (domain-agnosticism proof)

### 8.1 Build systems (dependency DAG)

**Surface:** Compile steps form DAG (A depends on B, C); linearization chooses build order. Support: "link step requires object files."

- **Prove:** Same DAG output; deterministic linearization; feasibility before add.

### 8.2 Assembly (support constraints)

**Surface:** Assembly steps have support (part must be mounted before subpart). Partial order: install base, then sides, then top. Commuting: left/right side order irrelevant.

- **Prove:** Same support check; commuting steps without edge.

### 8.3 Minecraft building (placement DAG)

**Surface:** Place foundation, then walls, then roof. Support: block at (x,y,z) requires block at (x,y-1,z). Commuting: two wall blocks in same layer.

- **Prove:** Direct mapping to BuildingSolveStep; requiresModules as dependency edges.

---

## 9. Concrete certification tests

### Test 1: DAG output

```ts
describe('Rig G - DAG output', () => {
  it('plan has nodes and edges, not just list', () => {
    const plan = solveBuildingPlan(goal, worldState);
    expect(plan.nodes).toBeDefined();
    expect(plan.edges).toBeDefined();
    expect(Array.isArray(plan.nodes)).toBe(true);
    expect(Array.isArray(plan.edges)).toBe(true);
  });

  it('every edge references existing nodes', () => {
    const plan = solveBuildingPlan(goal, worldState);
    const nodeIds = new Set(plan.nodes.map(n => n.id));
    plan.edges.forEach(e => {
      expect(nodeIds.has(e.from)).toBe(true);
      expect(nodeIds.has(e.to)).toBe(true);
    });
  });
});
```

### Test 2: Deterministic linearization

```ts
describe('Rig G - deterministic linearization', () => {
  it('same DAG yields same linearization', () => {
    const dag = buildDag(goal);
    const order1 = linearize(dag);
    const order2 = linearize(dag);
    expect(order1).toEqual(order2);
  });

  it('linearization is topological', () => {
    const dag = buildDag(goal);
    const order = linearize(dag);
    const indexOf = (id: string) => order.findIndex(n => n.id === id);
    dag.edges.forEach(e => {
      expect(indexOf(e.from)).toBeLessThan(indexOf(e.to));
    });
  });
});
```

### Test 3: Feasibility rejects support violation

```ts
describe('Rig G - feasibility support', () => {
  it('rejects step when support missing', () => {
    const state = { placedBlocks: new Set() };
    const step = { place: { x: 0, y: 1, z: 0 } }; // requires (0,0,0)
    expect(checkFeasibility(step, state)).toBe(false);
  });
});
```

### Test 4: Bounded DAG size

```ts
describe('Rig G - bounded DAG', () => {
  it('plan has at most MAX_DAG_NODES nodes', () => {
    const plan = solveBuildingPlan(largeGoal, worldState);
    expect(plan.nodes.length).toBeLessThanOrEqual(MAX_DAG_NODES);
  });
});
```

### Test 5: Commuting steps

```ts
describe('Rig G - commuting steps', () => {
  it('independent steps have no edge', () => {
    const dag = buildDag(goal); // craft_torch, craft_pickaxe
    const torchId = dag.nodes.find(n => n.action === 'craft_torch')?.id;
    const pickId = dag.nodes.find(n => n.action === 'craft_pickaxe')?.id;
    const hasEdge = dag.edges.some(e => (e.from === torchId && e.to === pickId) || (e.from === pickId && e.to === torchId));
    expect(hasEdge).toBe(false);
  });
});
```

---

## 10. Definition of "done" (testable)

- **Feasibility enforced:** Impossible sequences rejected (Test 3).
- **Partial-order output:** Plans are DAGs (Test 1).
- **Deterministic linearization:** Same DAG same order (Test 2).
- **Bounded:** DAG size at most MAX_DAG_NODES (Test 4).
- **Commuting recognized:** Independent steps not artificially ordered (Test 5).
- **Tests:** All 5 certification test blocks pass.

---

## 11. Implementation files summary

| Action | Path |
|--------|------|
| New | `packages/planning/src/constraints/constraint-model.ts` |
| New | `packages/planning/src/constraints/feasibility-checker.ts` |
| New | `packages/planning/src/reactive-executor/linearizer.ts` |
| Modify | `packages/planning/src/sterling/minecraft-building-solver.ts` — return DAG |
| Modify | `packages/planning/src/sterling/minecraft-building-types.ts` — DAG types |
| Modify | `packages/planning/src/reactive-executor/reactive-executor.ts` — linearize before execute |

---

## 12. Order of work (suggested)

1. **Define constraint types**: support, dependency, reachability.
2. **Implement feasibility checking** for building domain.
3. **Modify solver output** to produce DAG instead of list.
4. **Add linearization logic** in execution layer.
5. **Certification tests**: impossible sequences rejected; commuting steps flexible.

---

## 13. Dependencies and risks

- **Rig A-F**: Builds on previous capabilities.
- **Constraint complexity**: Too many constraints = intractable; too few = infeasible plans.
- **DAG representation**: Execution layer must handle DAG, not just list.
- **Support geometry**: Minecraft support rules are complex (gravity, etc.).

---

## 14. Cross-references

- **Companion approach**: `RIG_G_PARTIAL_ORDER_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P7)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig G section)
