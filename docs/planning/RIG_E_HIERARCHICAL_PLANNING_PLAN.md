# Rig E: Hierarchical Planning Implementation Plan

**Primitive**: P5 — Hierarchical planning (macro policy over micro solvers)

**Status**: ENRICHED (2026-01-31)
**Implementation**: Partial — cognitive-router, plan-decomposer, task-network exist in `planning/hierarchical-planner/`

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

**Investigation outcome (verified 2025-01-31):** No macro/micro separation today. `plan-decomposer.ts:10-24` (`decomposeToPlan(goal)`) returns empty steps; stub only. `sterling-planner.ts:147-292` (`generateDynamicSteps`) delegates directly to crafting/toolProgression/building solvers; flat invocation, no macro layer. `task-integration.ts` orchestrates tasks; no macro state. `reactive-executor` executes steps in order; no micro delegation. Feedback: step success/failure flows to task-integration; no macro cost update. Macro plan would sit above sterling-planner (new macroPlanner); micro execution would be invoked by macro edge handler in reactive-executor.

### 4a. Current code anchors (verified 2025-01-31)

| File | Line(s) | What |
|------|---------|------|
| `packages/planning/src/hierarchical-planner/plan-decomposer.ts` | 10-24 | `decomposeToPlan(goal)`: returns empty steps; stub. No macro structure. |
| `packages/planning/src/task-integration/sterling-planner.ts` | 147-292 | `generateDynamicSteps()`: routes to crafting/toolProgression/building solvers; flat, no macro layer. |
| `packages/planning/src/reactive-executor/reactive-executor.ts` | step execution | Executes steps in order; no macro edge → micro delegation. |
| `packages/planning/src/hierarchical-planner/index.ts` | exports | plan-decomposer, cognitive-router, task-network; decomposer is stub. |

**Gap:** No macro state, macro planner, or macro-edge semantics. No feedback from micro to macro costs. Hierarchical separation would require new macro layer above sterling-planner.

### 4b. conscious-bot vs Sterling split

| Responsibility | Owner | Location |
|----------------|-------|----------|
| Macro state (contexts, waypoints) | conscious-bot | `packages/planning/src/hierarchical/macro-state.ts` (new) |
| Macro planner (choose macro structure) | conscious-bot | `packages/planning/src/hierarchical/macro-planner.ts` (new) |
| Macro edge cost updates from micro outcomes | conscious-bot | `packages/planning/src/hierarchical/feedback.ts` (new) |
| Micro delegation (pathfinding, block interaction) | conscious-bot | minecraft-interface + reactive-executor |
| Sub-solve for complex micro tasks (optional) | Sterling | Receives micro subgoal; returns steps |

**Contract:** conscious-bot owns macro layer; invokes Sterling only for micro subproblems when needed. Feedback from execution updates macro edge costs in conscious-bot.

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

## 7. Implementation pivots

| Pivot | Problem | Acceptance |
|-------|---------|------------|
| 1 Macro state is abstract only | Concrete positions in macro state explode search | Macro nodes are context IDs (e.g. at_mine, at_base); no (x,y,z) in macro state. |
| 2 Bounded macro horizon | Unbounded macro depth causes non-termination | MAX_MACRO_DEPTH (e.g. 20); macro planner stops at bound. |
| 3 Deterministic slot ordering | Non-deterministic macro edge order breaks replay | Macro edges sorted by (contextId, targetId) before cost lookup. |
| 4 Feedback only on execution | Updating costs on plan success misattributes | Macro edge cost updated only when micro execution completes (success/failure). |
| 5 Single micro controller per macro edge | Multiple concurrent micro controllers complicate attribution | One active micro task per macro step; completion triggers feedback. |

---

## 8. Transfer surfaces (domain-agnosticism proof)

### 8.1 Logistics (region-level planning)

**Surface:** Macro: regions (warehouse A, port B, store C); micro: local routing within region. Feedback: delivery success/failure updates region-to-region cost.

- **Prove:** Same macro/micro separation; feedback updates macro costs only.

### 8.2 Manufacturing (stage-level planning)

**Surface:** Macro: stages (cut, assemble, finish); micro: machine operations within stage. Feedback: stage failure increases stage cost.

- **Prove:** Same bounded horizon; deterministic slot ordering.

### 8.3 Minecraft (location + activity)

**Surface:** Macro: at_base, at_mine, traveling_to_X; micro: pathfinding, mining, crafting. Feedback: micro failure increases macro edge cost.

- **Prove:** Direct mapping to sterling-planner; macro layer above generateDynamicSteps.

---

## 9. Concrete certification tests

### Test 1: Macro state abstract

```ts
describe('Rig E - macro state abstract', () => {
  it('macro nodes are context IDs only', () => {
    const state = createMacroState({ currentContext: 'at_mine', targetContext: 'at_base' });
    expect(state.currentContext).toBe('at_mine');
    expect('x' in state).toBe(false);
    expect('y' in state).toBe(false);
  });
});
```

### Test 2: Bounded macro depth

```ts
describe('Rig E - bounded macro depth', () => {
  it('macro planner stops at MAX_MACRO_DEPTH', () => {
    const plan = runMacroPlanner(goal, worldState, { maxDepth: 20 });
    expect(plan.steps.length).toBeLessThanOrEqual(20);
  });
});
```

### Test 3: Deterministic slot ordering

```ts
describe('Rig E - deterministic slot ordering', () => {
  it('same macro graph yields same edge order', () => {
    const graph = buildMacroGraph(goal);
    const order1 = getMacroEdgeOrder(graph);
    const order2 = getMacroEdgeOrder(graph);
    expect(order1).toEqual(order2);
    expect(order1).toEqual([...order1].sort((a, b) => (a.contextId + a.targetId).localeCompare(b.contextId + b.targetId)));
  });
});
```

### Test 4: Feedback on execution only

```ts
describe('Rig E - feedback on execution only', () => {
  it('macro edge cost unchanged after plan generation', () => {
    const costs = getMacroEdgeCosts();
    runMacroPlanner(goal, worldState);
    expect(getMacroEdgeCosts()).toEqual(costs);
  });

  it('macro edge cost increases after micro failure', () => {
    const costsBefore = getMacroEdgeCost('at_base', 'at_mine');
    reportMicroOutcome({ from: 'at_base', to: 'at_mine', success: false });
    const costsAfter = getMacroEdgeCost('at_base', 'at_mine');
    expect(costsAfter).toBeGreaterThan(costsBefore);
  });
});
```

### Test 5: Micro delegation

```ts
describe('Rig E - micro delegation', () => {
  it('macro step invokes micro controller once', () => {
    const invocations: string[] = [];
    const controller = { execute: (step: MacroStep) => { invocations.push(step.id); return Promise.resolve({ success: true }); } };
    await executeMacroStep({ id: 'go_to_mine', from: 'at_base', to: 'at_mine' }, controller);
    expect(invocations).toEqual(['go_to_mine']);
  });
});
```

---

## 10. Definition of "done" (testable)

- **Macro/micro separation:** Clear boundary; macro state has no concrete positions (Test 1).
- **Bounded horizon:** MAX_MACRO_DEPTH enforced (Test 2).
- **Deterministic ordering:** Same graph yields same edge order (Test 3).
- **Feedback on execution only:** Macro costs update only from micro outcomes (Test 4).
- **Single micro per macro step:** One invocation per macro step (Test 5).
- **Tests:** All 5 certification test blocks pass.

---

## 11. Implementation files summary

| Action | Path |
|--------|------|
| New | `packages/planning/src/hierarchical/macro-state.ts` |
| New | `packages/planning/src/hierarchical/macro-planner.ts` |
| New | `packages/planning/src/hierarchical/feedback.ts` |
| Modify | `packages/planning/src/hierarchical-planner/plan-decomposer.ts` — replace stub with macro planner call |
| Modify | `packages/planning/src/task-integration/sterling-planner.ts` — macro layer above generateDynamicSteps |
| Modify | `packages/planning/src/reactive-executor/reactive-executor.ts` — report micro outcome to feedback |

---

## 12. Order of work (suggested)

1. **Define macro state** with location contexts and activity states.
2. **Define macro edges** that invoke micro controllers.
3. **Implement micro delegation** to Mineflayer for pathfinding.
4. **Add feedback loop** from micro outcomes to macro costs.
5. **Test hierarchical separation**: macro re-plan triggers, micro failure handling.
6. **Certification tests**: macro structure is stable; micro failures update costs.

---

## 13. Dependencies and risks

- **Rig A-D**: Builds on operators, legality, temporal, and strategies.
- **Abstraction granularity**: Too coarse = poor plans; too fine = no benefit.
- **Feedback attribution**: Which macro edge is responsible for micro failure?
- **Layering complexity**: Two-layer adds complexity; three+ layers are risky.

---

## 14. Cross-references

- **Companion approach**: `RIG_E_HIERARCHICAL_PLANNING_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P5)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig E section)
- **Rig A-D**: Foundation layers
