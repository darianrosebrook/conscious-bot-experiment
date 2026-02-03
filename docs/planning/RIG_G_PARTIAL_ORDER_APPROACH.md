# Rig G: Feasibility Under Constraints and Partial-Order Structure — Companion Approach

**Implementation**: Partial — partial-order-plan, dag-builder, constraint-model, feasibility-checker, linearization exist in `planning/constraints/`

This companion document distills the implementation plan with design decisions, boundaries, and implementation construction constraints. Read alongside `RIG_G_PARTIAL_ORDER_PLAN.md`.

---

## 1. Executive summary

Rig G proves **Primitive 7** (Feasibility under constraints and partial-order structure) by implementing:

1. **Nontrivial preconditions** (support, dependency, reachability)
2. **Partial-order plan output** (DAG, not just list)
3. **Commuting step recognition** (independent steps not artificially ordered)
4. **Flexible linearization** at execution time

**Critical boundary**: Sterling avoids impossible sequences; plans allow valid reordering.

---

## 2. Implementation construction constraints (pivots)

### Pivot 1: Feasibility check at expansion

**Problem:** Infeasible steps enter plan; execution fails or produces invalid state.

**Pivot:** Check `checkFeasibility(step, state)` before adding step to plan. Reject if violations exist.

**Acceptance check:** Floating block placement rejected.

---

### Pivot 2: Plan is DAG, not list

**Problem:** Output is total order; no flexibility for commuting steps.

**Pivot:** Plan representation has `orderings: OrderingConstraint[]`; steps without ordering between them commute.

**Acceptance check:** Two independent steps have no ordering edge; linearization can choose either order.

---

### Pivot 3: Support constraints for building

**Problem:** Builder places block in air; invalid Minecraft state.

**Pivot:** `getSupportRequirement()` for gravity-affected blocks; check before place.

**Acceptance check:** Sand placement without block below rejected.

---

### Pivot 4: Deterministic linearization

**Problem:** Topological sort has multiple valid orderings; non-deterministic choice causes flaky tests.

**Pivot:** Sort ready set by step id (or other stable key) before choosing. Same DAG → same linearization.

**Acceptance check:** Same plan DAG → identical linearization across runs.

---

### Summary: Acceptance check table

| Pivot | Acceptance check |
|-------|------------------|
| 1 | Infeasible steps rejected at expansion. |
| 2 | Plan is DAG; commuting steps have no ordering. |
| 3 | Support constraints enforced for building. |
| 4 | Linearization deterministic. |

---

## 3. Primary design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Constraint types | Support, dependency, reachability | Covers Minecraft building |
| Plan representation | DAG with explicit ordering edges | Clear, flexible |
| Feasibility checking | At search expansion | Prevents invalid states |
| Linearization | Topological sort at runtime | Adapts to current state |
| Support model | Block-below required for most | Matches Minecraft physics |

---

## 3. Constraint model

### 3.1 Support constraints

```ts
// packages/planning/src/constraints/support-constraints.ts

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface SupportConstraint {
  blockPosition: Position3D;
  requiresSupportAt: Position3D[];  // Positions that must have solid blocks
  supportType: 'below' | 'adjacent' | 'any';
}

export function checkSupportConstraint(
  constraint: SupportConstraint,
  worldBlocks: Map<string, string>  // position_hash → block_type
): boolean {
  for (const supportPos of constraint.requiresSupportAt) {
    const posHash = hashPosition(supportPos);
    const block = worldBlocks.get(posHash);
    if (!block || block === 'air') {
      return false;  // Support missing
    }
  }
  return true;
}

export function getSupportRequirement(blockType: string, position: Position3D): SupportConstraint {
  // Most blocks require support below
  if (GRAVITY_AFFECTED.includes(blockType)) {
    return {
      blockPosition: position,
      requiresSupportAt: [{ x: position.x, y: position.y - 1, z: position.z }],
      supportType: 'below',
    };
  }
  
  // Torches can attach to walls
  if (blockType === 'torch') {
    return {
      blockPosition: position,
      requiresSupportAt: [
        { x: position.x, y: position.y - 1, z: position.z },  // Floor
        { x: position.x - 1, y: position.y, z: position.z },  // Wall options
        { x: position.x + 1, y: position.y, z: position.z },
        { x: position.x, y: position.y, z: position.z - 1 },
        { x: position.x, y: position.y, z: position.z + 1 },
      ],
      supportType: 'any',  // Any one is sufficient
    };
  }
  
  return {
    blockPosition: position,
    requiresSupportAt: [],
    supportType: 'any',
  };
}

const GRAVITY_AFFECTED = ['sand', 'gravel', 'concrete_powder'];
```

### 3.2 Dependency constraints

```ts
export interface DependencyConstraint {
  operatorId: string;
  requiresCompleted: string[];  // Operator IDs that must be done first
  reason: string;
}

export function getDependencyConstraints(operator: Operator): DependencyConstraint {
  // Example: smelting requires furnace placement
  if (operator.id.startsWith('smelt_')) {
    return {
      operatorId: operator.id,
      requiresCompleted: ['place_furnace'],
      reason: 'Smelting requires furnace to be placed',
    };
  }
  
  return {
    operatorId: operator.id,
    requiresCompleted: [],
    reason: '',
  };
}
```

### 3.3 Reachability constraints

```ts
export interface ReachabilityConstraint {
  position: Position3D;
  maxReach: number;  // Blocks (default 4.5 for player)
  requiresLineOfSight: boolean;
}

export function checkReachability(
  playerPosition: Position3D,
  targetPosition: Position3D,
  constraint: ReachabilityConstraint,
  worldBlocks: Map<string, string>
): boolean {
  const distance = euclideanDistance(playerPosition, targetPosition);
  if (distance > constraint.maxReach) return false;
  
  if (constraint.requiresLineOfSight) {
    return hasLineOfSight(playerPosition, targetPosition, worldBlocks);
  }
  
  return true;
}
```

---

## 4. Partial-order representation

### 4.1 Plan DAG

```ts
// packages/planning/src/constraints/partial-order-plan.ts

export interface PlanStep {
  id: string;
  operator: Operator;
  parameters: Record<string, unknown>;
}

export interface OrderingConstraint {
  before: string;  // Step ID
  after: string;   // Step ID
  reason: string;
}

export interface PartialOrderPlan {
  steps: Map<string, PlanStep>;
  orderings: OrderingConstraint[];
  
  // Derived
  adjacencyList: Map<string, string[]>;  // step_id → successors
}

export function buildPartialOrderPlan(
  steps: PlanStep[],
  orderings: OrderingConstraint[]
): PartialOrderPlan {
  const stepMap = new Map(steps.map(s => [s.id, s]));
  const adjacencyList = new Map<string, string[]>();
  
  // Initialize adjacency list
  for (const step of steps) {
    adjacencyList.set(step.id, []);
  }
  
  // Add edges
  for (const ordering of orderings) {
    const successors = adjacencyList.get(ordering.before) ?? [];
    successors.push(ordering.after);
    adjacencyList.set(ordering.before, successors);
  }
  
  return { steps: stepMap, orderings, adjacencyList };
}
```

### 4.2 Commuting detection

```ts
export function areStepsCommuting(stepA: PlanStep, stepB: PlanStep): boolean {
  // Steps commute if neither affects the other's preconditions
  const aEffects = getEffects(stepA.operator);
  const bEffects = getEffects(stepB.operator);
  const aPreconditions = getPreconditions(stepA.operator);
  const bPreconditions = getPreconditions(stepB.operator);
  
  // Check if A's effects affect B's preconditions
  const aAffectsB = Object.keys(aEffects).some(k => k in bPreconditions);
  const bAffectsA = Object.keys(bEffects).some(k => k in aPreconditions);
  
  return !aAffectsB && !bAffectsA;
}

export function findCommutingPairs(plan: PartialOrderPlan): Array<[string, string]> {
  const commuting: Array<[string, string]> = [];
  const steps = Array.from(plan.steps.values());
  
  for (let i = 0; i < steps.length; i++) {
    for (let j = i + 1; j < steps.length; j++) {
      if (areStepsCommuting(steps[i], steps[j])) {
        // Check if there's no ordering between them
        const hasOrdering = plan.orderings.some(
          o => (o.before === steps[i].id && o.after === steps[j].id) ||
               (o.before === steps[j].id && o.after === steps[i].id)
        );
        if (!hasOrdering) {
          commuting.push([steps[i].id, steps[j].id]);
        }
      }
    }
  }
  
  return commuting;
}
```

---

## 5. Feasibility checking

### 5.1 Feasibility gate

```ts
// packages/planning/src/constraints/feasibility-checker.ts

export interface FeasibilityResult {
  feasible: boolean;
  violations: FeasibilityViolation[];
}

export interface FeasibilityViolation {
  constraintType: 'support' | 'dependency' | 'reachability';
  stepId: string;
  description: string;
}

export function checkFeasibility(
  step: PlanStep,
  currentState: PlanningState,
  completedSteps: Set<string>
): FeasibilityResult {
  const violations: FeasibilityViolation[] = [];
  
  // Check support constraints
  if (step.operator.type === 'place_block') {
    const position = step.parameters.position as Position3D;
    const blockType = step.parameters.blockType as string;
    const support = getSupportRequirement(blockType, position);
    
    if (!checkSupportConstraint(support, currentState.worldBlocks)) {
      violations.push({
        constraintType: 'support',
        stepId: step.id,
        description: `Cannot place ${blockType} at ${JSON.stringify(position)}: support missing`,
      });
    }
  }
  
  // Check dependency constraints
  const deps = getDependencyConstraints(step.operator);
  for (const required of deps.requiresCompleted) {
    if (!completedSteps.has(required)) {
      violations.push({
        constraintType: 'dependency',
        stepId: step.id,
        description: `${step.operator.id} requires ${required} to be completed first`,
      });
    }
  }
  
  // Check reachability
  if (step.parameters.targetPosition) {
    const reachable = checkReachability(
      currentState.playerPosition,
      step.parameters.targetPosition as Position3D,
      { position: step.parameters.targetPosition as Position3D, maxReach: 4.5, requiresLineOfSight: true },
      currentState.worldBlocks
    );
    if (!reachable) {
      violations.push({
        constraintType: 'reachability',
        stepId: step.id,
        description: `Target position not reachable from current player position`,
      });
    }
  }
  
  return {
    feasible: violations.length === 0,
    violations,
  };
}
```

---

## 6. Linearization at execution

### 6.1 Topological sort

```ts
// packages/planning/src/constraints/linearization.ts

export function topologicalSort(plan: PartialOrderPlan): string[] {
  const inDegree = new Map<string, number>();
  const result: string[] = [];
  const queue: string[] = [];
  
  // Initialize in-degrees
  for (const stepId of plan.steps.keys()) {
    inDegree.set(stepId, 0);
  }
  for (const ordering of plan.orderings) {
    inDegree.set(ordering.after, (inDegree.get(ordering.after) ?? 0) + 1);
  }
  
  // Find initial nodes (in-degree 0)
  for (const [stepId, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(stepId);
  }
  
  // Kahn's algorithm
  while (queue.length > 0) {
    // Sort queue for determinism
    queue.sort();
    const current = queue.shift()!;
    result.push(current);
    
    for (const successor of plan.adjacencyList.get(current) ?? []) {
      const newDegree = (inDegree.get(successor) ?? 1) - 1;
      inDegree.set(successor, newDegree);
      if (newDegree === 0) queue.push(successor);
    }
  }
  
  return result;
}
```

### 6.2 Adaptive linearization

```ts
export function adaptiveLinearize(
  plan: PartialOrderPlan,
  currentState: PlanningState
): string[] {
  const result: string[] = [];
  const completed = new Set<string>();
  const remaining = new Set(plan.steps.keys());
  
  while (remaining.size > 0) {
    // Find all steps that are ready (predecessors completed)
    const ready = Array.from(remaining).filter(stepId => {
      const predecessors = plan.orderings
        .filter(o => o.after === stepId)
        .map(o => o.before);
      return predecessors.every(p => completed.has(p));
    });
    
    if (ready.length === 0) {
      throw new Error('Cycle detected in plan or no ready steps');
    }
    
    // Choose based on current state (e.g., closest position first)
    const chosen = selectBestReady(ready, plan, currentState);
    result.push(chosen);
    completed.add(chosen);
    remaining.delete(chosen);
  }
  
  return result;
}

function selectBestReady(
  ready: string[],
  plan: PartialOrderPlan,
  state: PlanningState
): string {
  // Default: alphabetical for determinism
  ready.sort();
  return ready[0];
}
```

---

## 7. DO and DO NOT

**DO:**
- **DO** check feasibility at search expansion.
- **DO** output plans as DAGs with explicit ordering.
- **DO** recognize commuting steps (no false orderings).
- **DO** allow runtime linearization flexibility.

**DO NOT:**
- **DO NOT** impose artificial total orderings.
- **DO NOT** skip feasibility checks (leads to invalid plans).
- **DO NOT** ignore support constraints for building.
- **DO NOT** create cyclic dependencies.

---

## 8. Certification tests

### 8.1 Feasibility enforcement

```ts
describe('Feasibility checking', () => {
  it('rejects floating block placement', () => {
    const step: PlanStep = {
      id: 'place_stone',
      operator: { id: 'place_block', type: 'place_block' },
      parameters: { blockType: 'stone', position: { x: 0, y: 10, z: 0 } },
    };
    const state = createState({ worldBlocks: new Map() });  // No support below
    
    const result = checkFeasibility(step, state, new Set());
    expect(result.feasible).toBe(false);
    expect(result.violations[0].constraintType).toBe('support');
  });
});
```

### 8.2 Commuting recognition

```ts
describe('Commuting steps', () => {
  it('identifies independent steps as commuting', () => {
    const stepA: PlanStep = { id: 'a', operator: { id: 'craft_torch' }, parameters: {} };
    const stepB: PlanStep = { id: 'b', operator: { id: 'craft_pickaxe' }, parameters: {} };
    
    expect(areStepsCommuting(stepA, stepB)).toBe(true);
  });
});
```

---

## 10. Definition of "done"

### Core boundary criteria

- **Feasibility enforced:** Impossible sequences rejected.
- **Partial-order output:** Plans are DAGs.
- **Commuting recognized:** Independent steps not ordered.
- **Deterministic linearization:** Same DAG → same order.

### Acceptance checks (4 pivots)

All 4 pivot acceptance checks must pass.

---

## 10. Cross-references

- **Implementation plan**: `RIG_G_PARTIAL_ORDER_PLAN.md`
- **Capability primitives**: `capability-primitives.md` (P7)
- **Sterling domains**: `sterling-minecraft-domains.md` (Rig G section)
