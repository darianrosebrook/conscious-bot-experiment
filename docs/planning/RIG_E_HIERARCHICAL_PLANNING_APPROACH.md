# Rig E: Hierarchical Planning — Companion Approach

**Implementation**: Partial — cognitive-router, plan-decomposer, task-network exist in `planning/hierarchical-planner/`

This companion document distills the implementation plan with design decisions, boundaries, and implementation construction constraints. Read alongside `RIG_E_HIERARCHICAL_PLANNING_PLAN.md`.

---

## 1. Executive summary

Rig E proves **Primitive 5** (Hierarchical planning) by implementing layered abstraction that:

1. Separates **macro-level planning** (what to do) from **micro-level execution** (how)
2. Uses **sub-solvers** for local execution within macro contexts
3. Incorporates **execution feedback** into macro costs
4. Avoids re-planning at micro level when macro structure is valid

**Critical boundary**: Macro chooses structure; micro handles execution; failures feed back.

**Best path:** Define macro state (contexts); add macro planner; wire micro controllers; add feedback loop with cost adjustment; use re-plan threshold (N failures) not every failure.

---

## 2. Implementation construction constraints (pivots)

### Pivot 1: Re-plan threshold, not every failure

**Problem:** Re-planning on every micro failure causes thrashing; macro structure may be fine.

**Pivot:** Re-plan only after N consecutive failures on same edge. Default N=3.

**Acceptance check:** Single micro failure does not trigger re-plan.

---

### Pivot 2: Macro state is context-only

**Problem:** Macro state includes positions/details; becomes micro state; no abstraction benefit.

**Pivot:** Macro nodes have `location: LocationContext`, `activity: ActivityState` only. No (x,y,z) or block lists.

**Acceptance check:** Macro plan contains only context strings (at_base, at_mine, traveling), not coordinates.

---

### Pivot 3: Feedback updates cost, not structure

**Problem:** Feedback changes macro graph structure; planner cannot reason about past failures.

**Pivot:** Feedback adjusts `learnedCostAdjustment` on edges. Graph structure unchanged. Search naturally prefers lower-cost edges.

**Acceptance check:** Edge cost increases on failure; graph topology unchanged.

---

### Pivot 4: One controller at a time

**Problem:** Macro and micro both issue actions; conflict or oscillation.

**Pivot:** Micro controller has exclusive control during execution of its edge. Macro planner paused until edge completes or fails.

**Acceptance check:** No interleaved macro/micro action emission.

---

### Summary: Acceptance check table

| Pivot | Acceptance check |
|-------|------------------|
| 1 | Re-plan only after N consecutive failures. |
| 2 | Macro state is context-only. |
| 3 | Feedback updates cost; structure unchanged. |
| 4 | One controller at a time. |

---

## 3. Primary design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layer count | Two (macro + micro) | Simplicity; more layers add complexity |
| Macro state | Context-based (location + activity) | Abstract, manageable |
| Micro controller | Mineflayer + BT | Existing infrastructure |
| Feedback mechanism | Edge cost adjustment | Simple, effective |
| Re-plan trigger | N consecutive micro failures | Avoids thrashing |

---

## 3. Macro state representation

### 3.1 Context nodes

```ts
// packages/planning/src/hierarchical/macro-state.ts

export type LocationContext = 
  | 'at_base'
  | 'at_mine'
  | 'at_farm'
  | 'at_village'
  | 'traveling'
  | 'exploring';

export type ActivityState =
  | 'idle'
  | 'mining'
  | 'farming'
  | 'trading'
  | 'crafting'
  | 'building'
  | 'combat';

export interface MacroNode {
  id: string;
  location: LocationContext;
  activity: ActivityState;
  resources: Record<string, number>;  // Bucketed resource counts
}

export function hashMacroNode(node: MacroNode): string {
  return `${node.location}:${node.activity}:${hashResources(node.resources)}`;
}
```

### 3.2 Macro edges

```ts
export interface MacroEdge {
  id: string;
  from: MacroNode;
  to: MacroNode;
  microController: string;  // Which micro controller handles this transition
  baseCost: number;
  learnedCostAdjustment: number;  // From execution feedback
  expectedDuration: number;  // Tick buckets
}

export function getEffectiveCost(edge: MacroEdge): number {
  return edge.baseCost + edge.learnedCostAdjustment;
}
```

---

## 4. Micro controller integration

### 4.1 Controller interface

```ts
// packages/planning/src/hierarchical/micro-controller.ts

export interface MicroControllerResult {
  success: boolean;
  actualCost: number;
  actualDuration: number;
  failureReason?: string;
  partialProgress?: number;  // 0-1, how far before failure
}

export interface MicroController {
  id: string;
  name: string;
  
  /** Check if this controller can handle the transition */
  canHandle(from: MacroNode, to: MacroNode): boolean;
  
  /** Execute the transition */
  execute(from: MacroNode, to: MacroNode): Promise<MicroControllerResult>;
  
  /** Estimate cost/duration */
  estimate(from: MacroNode, to: MacroNode): { cost: number; duration: number };
}
```

### 4.2 Controller registry

```ts
export const MICRO_CONTROLLERS: MicroController[] = [
  {
    id: 'pathfinder',
    name: 'Mineflayer Pathfinder',
    canHandle: (from, to) => from.location !== to.location,
    execute: async (from, to) => {
      // Delegate to Mineflayer pathfinding
      return await mineflayerPathfind(from, to);
    },
    estimate: (from, to) => ({
      cost: estimatePathCost(from.location, to.location),
      duration: estimatePathDuration(from.location, to.location),
    }),
  },
  {
    id: 'mining_controller',
    name: 'Mining BT',
    canHandle: (from, to) => to.activity === 'mining',
    execute: async (from, to) => {
      // Delegate to mining behavior tree
      return await executeMiningBT(to);
    },
    estimate: () => ({ cost: 10, duration: 50 }),
  },
  // ... other controllers
];

export function findController(from: MacroNode, to: MacroNode): MicroController | null {
  return MICRO_CONTROLLERS.find(c => c.canHandle(from, to)) ?? null;
}
```

---

## 5. Feedback loop

### 5.1 Feedback collection

```ts
// packages/planning/src/hierarchical/feedback.ts

export interface MacroEdgeFeedback {
  edgeId: string;
  executionResult: MicroControllerResult;
  timestamp: number;
}

export interface FeedbackStore {
  history: MacroEdgeFeedback[];
  costAdjustments: Map<string, number>;
  failureCounts: Map<string, number>;
}
```

### 5.2 Cost adjustment

```ts
export const FEEDBACK_LEARNING_RATE = 0.2;
export const MAX_COST_ADJUSTMENT = 50;
export const FAILURE_PENALTY = 10;

export function updateCostFromFeedback(
  store: FeedbackStore,
  feedback: MacroEdgeFeedback
): FeedbackStore {
  const current = store.costAdjustments.get(feedback.edgeId) ?? 0;
  
  let adjustment: number;
  if (feedback.executionResult.success) {
    // If faster than expected, reduce cost; if slower, increase
    const expectedCost = getExpectedCost(feedback.edgeId);
    const ratio = feedback.executionResult.actualCost / expectedCost;
    adjustment = (ratio - 1) * FEEDBACK_LEARNING_RATE * expectedCost;
  } else {
    // Failure increases cost
    adjustment = FAILURE_PENALTY;
    
    // Track consecutive failures
    const failCount = (store.failureCounts.get(feedback.edgeId) ?? 0) + 1;
    store.failureCounts.set(feedback.edgeId, failCount);
  }
  
  const newAdjustment = Math.max(
    -MAX_COST_ADJUSTMENT,
    Math.min(MAX_COST_ADJUSTMENT, current + adjustment)
  );
  
  store.costAdjustments.set(feedback.edgeId, newAdjustment);
  
  return store;
}
```

### 5.3 Re-plan trigger

```ts
export const REPLAN_FAILURE_THRESHOLD = 3;

export function shouldReplan(
  currentEdge: MacroEdge,
  store: FeedbackStore
): boolean {
  const failCount = store.failureCounts.get(currentEdge.id) ?? 0;
  return failCount >= REPLAN_FAILURE_THRESHOLD;
}

export function resetFailureCount(edgeId: string, store: FeedbackStore): void {
  store.failureCounts.set(edgeId, 0);
}
```

---

## 6. Macro planner

### 6.1 Macro planning interface

```ts
// packages/planning/src/hierarchical/macro-planner.ts

export interface MacroPlan {
  nodes: MacroNode[];
  edges: MacroEdge[];
  totalCost: number;
  estimatedDuration: number;
}

export interface MacroPlanRequest {
  currentNode: MacroNode;
  goalCondition: (node: MacroNode) => boolean;
  feedbackStore: FeedbackStore;
}

export async function planMacro(request: MacroPlanRequest): Promise<MacroPlan | null> {
  // Use Sterling or A* over macro graph
  const graph = buildMacroGraph(request.currentNode, request.feedbackStore);
  const path = searchMacroPath(graph, request.currentNode, request.goalCondition);
  
  if (!path) return null;
  
  return {
    nodes: path.nodes,
    edges: path.edges,
    totalCost: path.edges.reduce((sum, e) => sum + getEffectiveCost(e), 0),
    estimatedDuration: path.edges.reduce((sum, e) => sum + e.expectedDuration, 0),
  };
}
```

### 6.2 Macro execution loop

```ts
export async function executeMacroPlan(
  plan: MacroPlan,
  feedbackStore: FeedbackStore
): Promise<{ success: boolean; feedback: FeedbackStore }> {
  let currentStore = feedbackStore;
  
  for (const edge of plan.edges) {
    const controller = findController(edge.from, edge.to);
    if (!controller) {
      return { success: false, feedback: currentStore };
    }
    
    const result = await controller.execute(edge.from, edge.to);
    
    currentStore = updateCostFromFeedback(currentStore, {
      edgeId: edge.id,
      executionResult: result,
      timestamp: Date.now(),
    });
    
    if (!result.success) {
      // Check if we should re-plan
      if (shouldReplan(edge, currentStore)) {
        console.log(`Re-planning due to repeated failures on edge ${edge.id}`);
        return { success: false, feedback: currentStore };
      }
      
      // Retry or continue based on partial progress
      if ((result.partialProgress ?? 0) < 0.5) {
        return { success: false, feedback: currentStore };
      }
    } else {
      // Reset failure count on success
      resetFailureCount(edge.id, currentStore);
    }
  }
  
  return { success: true, feedback: currentStore };
}
```

---

## 7. Sub-solver delegation

### 7.1 Sterling sub-solves

```ts
// Some macro edges invoke Sterling for complex micro planning

export interface SubSolveRequest {
  edgeId: string;
  domain: string;  // Sterling domain
  initialState: unknown;
  goal: unknown;
}

export async function delegateToSterling(
  request: SubSolveRequest
): Promise<MicroControllerResult> {
  const result = await sterlingSolve(request.domain, request.initialState, request.goal);
  
  if (!result.found) {
    return { success: false, actualCost: 0, actualDuration: 0, failureReason: 'No plan found' };
  }
  
  // Execute the Sterling plan
  const execution = await executeSterlingPlan(result.plan);
  return execution;
}
```

---

## 8. DO and DO NOT

**DO:**
- **DO** keep macro state abstract (contexts, not positions).
- **DO** delegate local execution to micro controllers.
- **DO** update edge costs based on execution feedback.
- **DO** re-plan when micro repeatedly fails.
- **DO** limit to two layers (macro + micro).

**DO NOT:**
- **DO NOT** plan every block/step at macro level.
- **DO NOT** ignore micro feedback (costs should adapt).
- **DO NOT** re-plan on every failure (use threshold).
- **DO NOT** mix macro and micro state representations.

---

## 9. Certification tests

### 9.1 Layer separation

```ts
describe('Hierarchical layer separation', () => {
  it('macro plan contains only context transitions', () => {
    const plan = planMacro({
      currentNode: createMacroNode('at_base', 'idle'),
      goalCondition: n => n.resources['iron_ingot'] >= 10,
      feedbackStore: emptyStore(),
    });
    
    // Macro nodes should be contexts, not positions
    for (const node of plan.nodes) {
      expect(['at_base', 'at_mine', 'traveling']).toContain(node.location);
    }
  });
});
```

### 9.2 Feedback updates

```ts
describe('Feedback loop', () => {
  it('increases edge cost on failure', () => {
    const store = emptyStore();
    const edge = createMacroEdge('base_to_mine');
    const initialCost = getEffectiveCost(edge);
    
    const updatedStore = updateCostFromFeedback(store, {
      edgeId: edge.id,
      executionResult: { success: false, actualCost: 0, actualDuration: 0 },
      timestamp: Date.now(),
    });
    
    const adjustedEdge = { ...edge, learnedCostAdjustment: updatedStore.costAdjustments.get(edge.id) ?? 0 };
    expect(getEffectiveCost(adjustedEdge)).toBeGreaterThan(initialCost);
  });
});
```

---

## 11. Definition of "done"

### Core boundary criteria

- **Layer separation:** Macro state is context-only; micro handles execution.
- **Sub-solver delegation:** Micro controllers have exclusive control during edge execution.
- **Feedback:** Costs adapt; structure unchanged.
- **Re-plan threshold:** N consecutive failures trigger re-plan.

### Acceptance checks (4 pivots)

All 4 pivot acceptance checks must pass.

---

## 11. Cross-references

- **Implementation plan**: `RIG_E_HIERARCHICAL_PLANNING_PLAN.md`
- **Rig A-D**: Foundation layers
- **Capability primitives**: `capability-primitives.md` (P5)
- **Sterling domains**: `sterling-minecraft-domains.md` (Rig E section)
