# Rig C: Temporal Planning with Capacity and Batching — Companion Approach

**Implementation**: Partial — temporal enrichment, time-state, duration-model, capacity-manager, batch-operators exist in `planning/temporal/`

This companion document distills the implementation plan with explicit design decisions, boundaries, **concrete code references**, and implementation construction constraints so implementers cannot easily implement incorrectly. Read alongside `RIG_C_TEMPORAL_PLANNING_PLAN.md`.

---

## 1. Executive summary

Rig C proves **Primitive 3** (Temporal planning with durations, batching, and capacity) by implementing time-aware planning that:

1. Models **action durations** explicitly (smelting takes time)
2. Tracks **resource occupancy** (furnace slots)
3. Prefers **batch-efficient sequences** over naive iteration
4. Minimizes **makespan** (total time), not just action count

**Critical boundary**: Time is modeled explicitly; no schedule deadlocks; batching is preferred.

**Best path:** Add temporal state to conscious-bot first; extend Sterling solve request with `currentTickBucket`, `slots` (readyAt per slot); add duration to rules; implement deadlock prevention in search. Sterling (or conscious-bot wrapper) filters/orders by slot availability.

---

## 2. What must be implemented in conscious-bot vs Sterling

Rig C requires **both** conscious-bot and Sterling changes. Temporal state flows from bot to Sterling; Sterling returns time-annotated steps.

### Implement in conscious-bot (the rig)

| Area | What conscious-bot must implement | Location |
|------|-----------------------------------|----------|
| **Time state** | Current tick bucket, slot readyAt; passed to Sterling. | New: `packages/planning/src/temporal/time-state.ts` |
| **Slot tracking** | Fetch placed furnaces, their occupancy, from world state. | Extend: `packages/planning/src/task-integration.ts`; `world-state-manager` |
| **Duration model** | Map rule actionType to duration (smelt=200 ticks, craft=1). | New: `packages/planning/src/temporal/duration-model.ts` |
| **Batch operators** | Prefer `smelt_batch` over N×`smelt` when building rules. | Extend: `packages/planning/src/sterling/minecraft-crafting-rules.ts` |
| **Deadlock check** | Before solve, verify slots available within horizon. | New: `packages/planning/src/temporal/deadlock-prevention.ts` |
| **Plan validation** | Validate returned steps respect slot availability. | Extend: solver or `task-integration` |

### Implement in Sterling (Python)

| Area | Sterling role | Required for Rig C? |
|------|----------------|---------------------|
| **Time state in request** | Accept `currentTickBucket`, `slots: [{id, readyAtBucket}]`. | **Yes.** |
| **Duration in rules** | Accept `durationTicks` per rule; use in state transition. | **Yes.** |
| **Slot reservation** | When applying rule, advance slot readyAt; check availability. | **Yes.** |
| **Makespan in cost** | Include time cost in A*; prefer shorter makespan. | **Yes.** |

**Contract:** conscious-bot sends temporal state; Sterling returns steps with `startBucket`, `endBucket`; conscious-bot validates no deadlock.

---

## 3. Current code anchors (what exists today)

**Verified 2025-01-31.**

| Location | Line(s) | What |
|----------|---------|------|
| `packages/planning/src/sterling/minecraft-crafting-types.ts` | 31–48 | `MinecraftCraftingRule`: no `durationTicks`. |
| `packages/planning/src/sterling/minecraft-crafting-types.ts` | 54–61 | `MinecraftSolveRequest`: `inventory`, `goal`, `nearbyBlocks`, `rules`. No `currentTickBucket`, `slots`. |
| `packages/planning/src/sterling/minecraft-crafting-solver.ts` | 98–108 | `solve()` receives `inventory`, `goal`, `rules`. No temporal params. |
| `packages/planning/src/task-integration/sterling-planner.ts` | 129–145 | `fetchBotContext()`: fetches inventory + nearbyBlocks from `/state`. No slot state. |
| `packages/planning/src/task-integration.ts` | 84–89 | Delegates to `sterlingPlanner.fetchBotContext()`. |
| `packages/planning/src/world-state/world-state-manager.ts` | 16–27 | `WorldStateSnapshot`: `agentPosition`, `inventory`, `nearbyEntities`, `timeOfDay`. No furnace slots. |

**Exact code to extend (solve request):**

```ts
// ADD to MinecraftSolveRequest in minecraft-crafting-types.ts
export interface MinecraftSolveRequest {
  inventory: Record<string, number>;
  goal: Record<string, number>;
  nearbyBlocks: string[];
  rules: MinecraftCraftingRule[];
  maxNodes?: number;
  useLearning?: boolean;
  /** Rig C: temporal planning */
  currentTickBucket?: number;
  slots?: Array<{ id: string; type: string; readyAtBucket: number }>;
}

// ADD to MinecraftCraftingRule
durationTicks?: number;  // e.g., smelt=200, craft=1, mine=20
```

---

## 4. Primary design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Time representation | Discrete tick buckets | Prevents state explosion |
| Bucket size | 100 ticks (~5 seconds) | Balances precision vs state space |
| Wait modeling | Implicit via ready_at | Avoids infinite wait states |
| Capacity model | Slot array with ready_at | Clear, deterministic |
| Objective | Weighted: action cost + time cost | Multi-objective (P18) |

---

## 3. Time state representation

### 3.1 Time fields

```ts
// packages/planning/src/temporal/time-state.ts

export const TICK_BUCKET_SIZE = 100;  // ~5 seconds
export const MAX_TIME_BUCKETS = 1000;  // ~50000 ticks max horizon

export interface TimeState {
  currentTickBucket: number;  // Current time in bucket units
  maxHorizonBucket: number;   // Planning horizon limit
}

export function toTickBucket(ticks: number): number {
  return Math.floor(ticks / TICK_BUCKET_SIZE);
}

export function fromTickBucket(bucket: number): number {
  return bucket * TICK_BUCKET_SIZE;
}
```

### 3.2 Resource slot state

```ts
export interface ResourceSlot {
  id: string;
  type: 'furnace' | 'crafting_table' | 'smoker' | 'blast_furnace';
  readyAtBucket: number;  // When slot becomes available
  currentItem?: string;   // What's being processed
  currentCount?: number;  // How many
}

export interface CapacityState {
  slots: ResourceSlot[];
  maxSlots: Record<string, number>;  // e.g., { furnace: 4 }
}

export const DEFAULT_MAX_SLOTS: Record<string, number> = {
  furnace: 8,
  crafting_table: 1,  // Instant, but only one at a time
  smoker: 4,
  blast_furnace: 4,
};
```

### 3.3 Combined temporal state

```ts
export interface TemporalPlanningState {
  inventory: Record<string, number>;
  capabilities: Set<string>;
  time: TimeState;
  capacity: CapacityState;
}

export function hashTemporalState(state: TemporalPlanningState): string {
  // Canonical hash includes time bucket and slot states
  const timeHash = state.time.currentTickBucket;
  const slotsHash = state.capacity.slots
    .map(s => `${s.id}:${s.readyAtBucket}`)
    .sort()
    .join(',');
  const invHash = hashInventory(state.inventory);
  return `${timeHash}|${slotsHash}|${invHash}`;
}
```

---

## 4. Duration model

### 4.1 Operator durations

```ts
// packages/planning/src/temporal/duration-model.ts

export interface OperatorDuration {
  operatorId: string;
  baseDurationTicks: number;
  perItemDurationTicks?: number;  // For batch operations
  slotType?: string;  // Which resource slot is occupied
}

export const OPERATOR_DURATIONS: OperatorDuration[] = [
  // Smelting: 200 ticks (10 seconds) per item
  { operatorId: 'smelt', baseDurationTicks: 0, perItemDurationTicks: 200, slotType: 'furnace' },
  { operatorId: 'smelt_batch', baseDurationTicks: 0, perItemDurationTicks: 200, slotType: 'furnace' },
  
  // Cooking: 200 ticks per item
  { operatorId: 'cook_food', baseDurationTicks: 0, perItemDurationTicks: 200, slotType: 'furnace' },
  
  // Blast furnace: 100 ticks per item (2x speed for ores)
  { operatorId: 'blast_smelt', baseDurationTicks: 0, perItemDurationTicks: 100, slotType: 'blast_furnace' },
  
  // Crafting: instant (1 tick)
  { operatorId: 'craft', baseDurationTicks: 1, slotType: 'crafting_table' },
  
  // Mining: variable, but modeled as instant for planning
  { operatorId: 'mine', baseDurationTicks: 20 },
];

export function getOperatorDuration(operatorId: string, itemCount: number = 1): number {
  const duration = OPERATOR_DURATIONS.find(d => d.operatorId === operatorId);
  if (!duration) return 0;
  
  const base = duration.baseDurationTicks;
  const perItem = (duration.perItemDurationTicks ?? 0) * itemCount;
  return base + perItem;
}
```

---

## 5. Capacity management

### 5.1 Slot availability

```ts
// packages/planning/src/temporal/capacity-manager.ts

export function findAvailableSlot(
  capacity: CapacityState,
  slotType: string,
  currentBucket: number
): ResourceSlot | null {
  const availableSlots = capacity.slots.filter(
    s => s.type === slotType && s.readyAtBucket <= currentBucket
  );
  
  if (availableSlots.length === 0) return null;
  
  // Return the one that's been ready longest (deterministic tie-breaker)
  return availableSlots.sort((a, b) => a.readyAtBucket - b.readyAtBucket)[0];
}

export function getEarliestAvailableTime(
  capacity: CapacityState,
  slotType: string
): number {
  const slots = capacity.slots.filter(s => s.type === slotType);
  if (slots.length === 0) return Infinity;
  
  return Math.min(...slots.map(s => s.readyAtBucket));
}
```

### 5.2 Slot reservation

```ts
export function reserveSlot(
  capacity: CapacityState,
  slotId: string,
  item: string,
  count: number,
  durationBuckets: number,
  currentBucket: number
): CapacityState {
  const newSlots = capacity.slots.map(s => {
    if (s.id !== slotId) return s;
    return {
      ...s,
      readyAtBucket: currentBucket + durationBuckets,
      currentItem: item,
      currentCount: count,
    };
  });
  
  return { ...capacity, slots: newSlots };
}

export function releaseSlot(
  capacity: CapacityState,
  slotId: string
): CapacityState {
  const newSlots = capacity.slots.map(s => {
    if (s.id !== slotId) return s;
    return {
      ...s,
      currentItem: undefined,
      currentCount: undefined,
    };
  });
  
  return { ...capacity, slots: newSlots };
}
```

---

## 6. Batching semantics

### 6.1 Batch operators

```ts
// packages/planning/src/temporal/batch-operators.ts

export interface BatchOperator {
  id: string;
  name: string;
  itemType: string;
  maxBatchSize: number;
  slotType: string;
  perItemDuration: number;
  preconditions: {
    required_items: Record<string, number>;  // Per item
    required_capabilities: string[];
  };
  effects: {
    consumed: Record<string, number>;  // Per item
    produced: Record<string, number>;  // Per item
  };
}

export const BATCH_OPERATORS: BatchOperator[] = [
  {
    id: 'smelt_iron_batch',
    name: 'Smelt iron ore (batch)',
    itemType: 'iron_ore',
    maxBatchSize: 64,
    slotType: 'furnace',
    perItemDuration: 200,
    preconditions: {
      required_items: { iron_ore: 1, coal: 1 },  // Per item (coal shared)
      required_capabilities: ['has_furnace'],
    },
    effects: {
      consumed: { iron_ore: 1 },
      produced: { iron_ingot: 1 },
    },
  },
  // ... other batch operators
];
```

### 6.2 Batch vs single preference

```ts
export function preferBatchOperator(
  goal: { item: string; count: number },
  currentState: TemporalPlanningState
): { useBatch: boolean; batchSize: number; reason: string } {
  const batchOp = BATCH_OPERATORS.find(b => 
    Object.keys(b.effects.produced).includes(goal.item)
  );
  
  if (!batchOp) {
    return { useBatch: false, batchSize: 1, reason: 'No batch operator available' };
  }
  
  // Check if we have enough input for a batch
  const inputItem = Object.keys(batchOp.preconditions.required_items)[0];
  const available = currentState.inventory[inputItem] ?? 0;
  const batchSize = Math.min(available, batchOp.maxBatchSize, goal.count);
  
  if (batchSize <= 1) {
    return { useBatch: false, batchSize: 1, reason: 'Not enough items for batch' };
  }
  
  return { 
    useBatch: true, 
    batchSize, 
    reason: `Batch ${batchSize} items is more efficient than ${batchSize} individual operations` 
  };
}
```

---

## 7. Makespan objective

### 7.1 Cost function

```ts
// packages/planning/src/temporal/makespan-objective.ts

export interface TemporalCost {
  actionCost: number;      // Traditional action/resource cost
  timeCost: number;        // Time in bucket units
  totalCost: number;       // Weighted combination
}

export const TIME_COST_WEIGHT = 0.1;  // Weight of time in total cost

export function computeTemporalCost(
  actionCost: number,
  durationBuckets: number
): TemporalCost {
  const timeCost = durationBuckets * TIME_COST_WEIGHT;
  return {
    actionCost,
    timeCost,
    totalCost: actionCost + timeCost,
  };
}

export function compareTemporalCosts(a: TemporalCost, b: TemporalCost): number {
  return a.totalCost - b.totalCost;
}
```

### 7.2 Makespan calculation

```ts
export function calculateMakespan(
  plan: TemporalPlanStep[],
  initialState: TemporalPlanningState
): number {
  let maxEndBucket = initialState.time.currentTickBucket;
  
  for (const step of plan) {
    const endBucket = step.startBucket + step.durationBuckets;
    maxEndBucket = Math.max(maxEndBucket, endBucket);
  }
  
  return maxEndBucket - initialState.time.currentTickBucket;
}
```

---

## 8. Deadlock prevention

### 8.1 Deadlock detection

```ts
// packages/planning/src/temporal/deadlock-prevention.ts

export interface DeadlockCheck {
  isDeadlock: boolean;
  reason?: string;
  blockedResources?: string[];
}

export function checkForDeadlock(
  state: TemporalPlanningState,
  pendingOperations: Array<{ operator: string; slotType: string }>
): DeadlockCheck {
  // Check if any required slot will never become available
  for (const op of pendingOperations) {
    const earliest = getEarliestAvailableTime(state.capacity, op.slotType);
    if (earliest === Infinity) {
      return {
        isDeadlock: true,
        reason: `No ${op.slotType} slots exist`,
        blockedResources: [op.slotType],
      };
    }
    
    if (earliest > state.time.maxHorizonBucket) {
      return {
        isDeadlock: true,
        reason: `${op.slotType} not available within planning horizon`,
        blockedResources: [op.slotType],
      };
    }
  }
  
  return { isDeadlock: false };
}
```

### 8.2 Wait bounding

```ts
export const MAX_WAIT_BUCKETS = 100;  // Max ~500 seconds of waiting

export function boundedWait(
  currentBucket: number,
  targetBucket: number
): { canWait: boolean; waitBuckets: number } {
  const waitBuckets = targetBucket - currentBucket;
  
  if (waitBuckets <= 0) {
    return { canWait: true, waitBuckets: 0 };
  }
  
  if (waitBuckets > MAX_WAIT_BUCKETS) {
    return { canWait: false, waitBuckets };
  }
  
  return { canWait: true, waitBuckets };
}
```

---

## 9. Implementation construction constraints (pivots)

### Pivot 1: Integer tick buckets only — no float time

**Problem:** Using `Date.now()` or raw milliseconds in state creates non-determinism and float jitter.

**Pivot:** All time in planning state is **integer tick buckets**. `currentTickBucket`, `readyAtBucket` are integers. Conversion at boundary only.

```ts
const TICK_BUCKET_SIZE = 100;
function toTickBucket(ms: number): number { return Math.floor(ms / TICK_BUCKET_SIZE); }
```

**Acceptance check:** Same slot state + same operations → identical schedule hash.

---

### Pivot 2: Bounded wait — no infinite wait states

**Problem:** "Wait for slot" can create unbounded state space if not capped.

**Pivot:** `MAX_WAIT_BUCKETS = 100`; planner never schedules wait beyond horizon. If all slots busy beyond horizon, return unsolved.

```ts
if (earliestAvailable > currentTickBucket + MAX_WAIT_BUCKETS) return { solved: false, error: 'Deadlock' };
```

**Acceptance check:** Search never explores states with wait > MAX_WAIT_BUCKETS.

---

### Pivot 3: Slot ordering deterministic for tie-breaking

**Problem:** Multiple slots ready at same bucket; non-deterministic choice causes different plans across runs.

**Pivot:** Sort slots by `(readyAtBucket, id)` before selecting. Same order every time.

```ts
slots.filter(s => s.readyAtBucket <= current).sort((a,b) =>
  a.readyAtBucket !== b.readyAtBucket ? a.readyAtBucket - b.readyAtBucket : a.id.localeCompare(b.id));
```

**Acceptance check:** Same state → same slot chosen for same operation.

---

### Pivot 4: Batch preference enforced at rule-building time

**Problem:** Planner may choose 64×smelt over 1×smelt_batch if rules are presented equally.

**Pivot:** When building rules, add `smelt_batch` with lower cost-per-item; or filter out single-item smelt when batch is available and count >= batch threshold.

```ts
// Prefer batch: if goal count >= 8, add smelt_batch with cost = baseCost * 0.3 per item
if (goalCount >= 8 && hasBatchOperator) rules.push(batchRule);
```

**Acceptance check:** Plan for 64 iron ingots uses batch operators when available.

---

### Pivot 5: Deadlock detection before solve

**Problem:** Sterling may return plan that assumes slot available when it is not.

**Pivot:** Before calling Sterling, check: for each slot type needed, at least one slot has `readyAtBucket <= maxHorizonBucket`. If not, return unsolved with "capacity deadlock."

```ts
const canProceed = slotTypesNeeded.every(t => slots.some(s => s.type === t && s.readyAtBucket <= horizon));
if (!canProceed) return { solved: false, error: 'Capacity deadlock' };
```

**Acceptance check:** No plan returned when all furnace slots busy beyond horizon.

---

### Summary: Acceptance check table

| Pivot | Acceptance check |
|-------|------------------|
| 1. Integer buckets | Same slot state → identical schedule hash. |
| 2. Bounded wait | No wait > MAX_WAIT_BUCKETS. |
| 3. Deterministic slot choice | Same state → same slot chosen. |
| 4. Batch preference | Multi-item goals use batch operators. |
| 5. Deadlock detection | No plan when capacity deadlock. |

---

## 10. DO and DO NOT

**DO:**
- **DO** use discrete integer tick buckets (not continuous time).
- **DO** model slot occupancy explicitly with `readyAtBucket`.
- **DO** prefer batch operations over single-item iteration.
- **DO** include time cost in objective function.
- **DO** bound wait times (MAX_WAIT_BUCKETS).
- **DO** sort slots deterministically for tie-breaking.

**DO NOT:**
- **DO NOT** use `Date.now()` or raw ms in planning state.
- **DO NOT** allow unbounded "wait" states.
- **DO NOT** break ties non-deterministically.
- **DO NOT** ignore deadlock (check before solve).

---

## 10. Determinism rules (non-negotiable)

- **Time:** Integer tick buckets only; no floats in state.
- **Slot choice:** Sort by (readyAtBucket, id) for deterministic tie-break.
- **Wait bound:** MAX_WAIT_BUCKETS enforced; no unbounded wait.
- **Deadlock:** Check before solve; never return plan that assumes unavailable slot.

---

## 11. Certification tests

### 11.1 No deadlock test

```ts
describe('Temporal planning deadlock prevention', () => {
  it('prevents scheduling deadlocks', () => {
    const state = createTemporalState({ furnaceSlots: 1, allBusy: true });
    const check = checkForDeadlock(state, [{ operator: 'smelt', slotType: 'furnace' }]);
    
    // Should not be deadlock if slot will become available
    if (state.capacity.slots[0].readyAtBucket < state.time.maxHorizonBucket) {
      expect(check.isDeadlock).toBe(false);
    }
  });
});
```

### 11.2 Batching preference test

```ts
describe('Batching preference', () => {
  it('prefers batch operations over iteration', () => {
    const state = createTemporalState({ inventory: { iron_ore: 64, coal: 64 } });
    const goal = { item: 'iron_ingot', count: 64 };
    
    const result = preferBatchOperator(goal, state);
    expect(result.useBatch).toBe(true);
    expect(result.batchSize).toBe(64);
  });
});
```

### 11.3 Makespan minimization test

```ts
describe('Makespan minimization', () => {
  it('prefers faster schedules', () => {
    const state = createTemporalState({ furnaceSlots: 4 });
    
    // Plan with 4 parallel furnaces should be faster than 1
    const parallelMakespan = calculateMakespanForPlan(state, { furnacesUsed: 4, items: 64 });
    const serialMakespan = calculateMakespanForPlan(state, { furnacesUsed: 1, items: 64 });
    
    expect(parallelMakespan).toBeLessThan(serialMakespan);
  });
});
```

---

## 12. Definition of "done" for boundary milestone

### Core boundary criteria

- **No deadlocks:** Search never enters unreachable states; deadlock check before solve.
- **Batching efficiency:** Plans prefer batch operations when available.
- **Makespan awareness:** Time cost in objective; faster schedules preferred.
- **Determinism:** Same state + time → identical schedule (integer buckets, deterministic slot choice).
- **Bounded waits:** No wait > MAX_WAIT_BUCKETS.

### Implementation construction acceptance checks (5 pivots)

| # | Pivot | Acceptance check |
|---|-------|------------------|
| 1 | Integer buckets | Same slot state → identical schedule hash. |
| 2 | Bounded wait | No wait > MAX_WAIT_BUCKETS. |
| 3 | Deterministic slot choice | Same state → same slot chosen. |
| 4 | Batch preference | Multi-item goals use batch operators. |
| 5 | Deadlock detection | No plan when capacity deadlock. |

**All 5 acceptance checks must pass before the boundary milestone is "done."**

---

## 12. Cross-references

- **Implementation plan**: `RIG_C_TEMPORAL_PLANNING_PLAN.md`
- **Rig A, B**: Foundation for operators and legality
- **Capability primitives**: `capability-primitives.md` (P3)
- **Sterling domains**: `sterling-minecraft-domains.md` (Rig C section)
