# Rig C: Temporal Planning with Capacity and Batching Implementation Plan

**Primitive**: P3 — Temporal planning with durations, batching, and capacity

**Status**: ENRICHED (2026-01-31)

---

## 1. Target invariant (critical boundary)

**"Time is modeled explicitly; no schedule deadlocks; batching is preferred over naive iteration."**

The system must:
- Model action durations and resource occupancy
- Avoid dead schedules (unreachable states due to time/capacity)
- Prefer batch-efficient sequences over repeated individual actions
- Handle parallel capacity (multiple furnaces, slots)

**What this rig proves**: Sterling can reason about time, durations, and capacity constraints.

---

## 2. Formal signature

- **Actions with duration**: Smelting takes 10s; cooking takes 10s
- **Resource occupancy**: Furnace slot is occupied while smelting
- **Objective includes time**: Minimize makespan, not just action count
- **State includes clocks/remaining-time**: Track when resources become available
- **Optional parallel slots**: Multiple furnaces can run concurrently

---

## 3. Current code anchors

### 3.1 `MinecraftCraftingRule` — no `durationTicks`

**File**: `packages/planning/src/sterling/minecraft-crafting-types.ts:30-47`

```ts
export interface MinecraftCraftingRule {
  action: string;
  actionType: 'craft' | 'mine' | 'smelt' | 'place';
  produces: CraftingInventoryItem[];
  consumes: CraftingInventoryItem[];
  requires: CraftingInventoryItem[];
  needsTable: boolean;
  needsFurnace: boolean;
  baseCost: number;
  // MISSING: durationTicks, slotType, batchSize
}
```

**Gap**: No temporal fields. Each rule is treated as instantaneous. Smelting iron ore (200 ticks) is costed the same as crafting planks (instant).

### 3.2 `MinecraftSolveRequest` — no temporal state

**File**: `packages/planning/src/sterling/minecraft-crafting-types.ts:54-61`

```ts
export interface MinecraftSolveRequest {
  inventory: Record<string, number>;
  goal: Record<string, number>;
  nearbyBlocks: string[];
  rules: MinecraftCraftingRule[];
  maxNodes?: number;
  useLearning?: boolean;
  // MISSING: currentTickBucket, slots (ResourceSlot[])
}
```

**Gap**: No temporal state sent to Sterling. Sterling cannot reason about when resources become available.

### 3.3 Solver call — no temporal parameters

**File**: `packages/planning/src/sterling/minecraft-crafting-solver.ts:98-108`

```ts
const result = await this.sterlingService.solve(this.sterlingDomain, {
  contractVersion: this.contractVersion,
  solverId: this.solverId,
  inventory,
  goal,
  nearbyBlocks,
  rules,
  maxNodes,
  useLearning: true,
  // MISSING: currentTickBucket, slots
});
```

**Gap**: Temporal params not passed. Sterling returns steps without `startBucket`/`endBucket` annotations.

### 3.4 Bot context fetching — no slot/placement state

**File**: `packages/planning/src/task-integration.ts:401-411`

```ts
private async fetchBotContext(): Promise<{
  inventory: any[];
  nearbyBlocks: any[];
}> {
  try {
    const stateRes = await this.minecraftRequest('/state', { timeout: 3000 });
    if (!stateRes.ok) return { inventory: [], nearbyBlocks: [] };
    const stateData = (await stateRes.json()) as any;
    const inventory = stateData?.data?.data?.inventory?.items || [];
    const nearbyBlocks = stateData?.data?.worldState?.nearbyBlocks || [];
    return { inventory, nearbyBlocks };
    // MISSING: slot states (furnace readyAt, crafting table availability)
```

**Gap**: Returns inventory and nearby blocks only. No slot state (which furnaces are active, when they finish).

### 3.5 Rule building — no duration tagging or batch operators

**File**: `packages/planning/src/sterling/minecraft-crafting-rules.ts:58-152`

`buildCraftingRules()` recursively traces the recipe tree but does not:
- Tag smelt/cook rules with `durationTicks`
- Generate batch variants (e.g., `smelt_batch_iron_ore`)
- Consider slot types when building rules

### 3.6 World state — no resource slot tracking

**File**: `packages/planning/src/world-state/world-state-manager.ts:15-27`

`WorldStateSnapshot` tracks `agentHealth`, `inventory`, `nearbyEntities`, `timeOfDay` but has no:
- Furnace slot states
- Crafting station occupancy
- Resource readiness timestamps

---

## 4. conscious-bot vs Sterling split

### 4.1 Responsibility table

| Responsibility | Owner | Location |
|---------------|-------|----------|
| Time state construction (tick buckets, slot readyAt) | conscious-bot | `packages/planning/src/temporal/time-state.ts` (new) |
| Duration model per action type | conscious-bot | `packages/planning/src/temporal/duration-model.ts` (new) |
| Capacity management (slot tracking) | conscious-bot | `packages/planning/src/temporal/capacity-manager.ts` (new) |
| Deadlock prevention (pre-solve check) | conscious-bot | `packages/planning/src/temporal/deadlock-prevention.ts` (new) |
| Batch rule generation | conscious-bot | `packages/planning/src/temporal/batch-operators.ts` (new) |
| Makespan cost annotation | conscious-bot | `packages/planning/src/temporal/makespan-objective.ts` (new) |
| Accept `currentTickBucket` + `slots` in solve request | Sterling | Sterling Python solve handler |
| Accept `durationTicks` per rule | Sterling | Sterling Python rule parser |
| Slot reservation in state transitions | Sterling | Sterling A* search |
| Makespan cost in A* objective | Sterling | Sterling cost function |
| Post-solve temporal validation | conscious-bot | `packages/planning/src/sterling/minecraft-crafting-solver.ts` (extend) |

### 4.2 Contract

**Input (conscious-bot -> Sterling)**:

```ts
interface TemporalSolveRequest extends MinecraftSolveRequest {
  currentTickBucket: number;         // integer tick bucket for current time
  slots: ResourceSlot[];             // furnace/station slot states
  // rules now include durationTicks per rule
}
```

**Output (Sterling -> conscious-bot)**:

```ts
interface TemporalSolveStep extends MinecraftSolveStep {
  startBucket: number;    // when this step begins
  endBucket: number;      // when this step completes
  slotId?: string;        // which slot was reserved (if applicable)
}
```

**Invariant**: Same `currentTickBucket` + same `slots` + same `rules` = same schedule (deterministic).

---

## 5. What to implement / change

### 5.1 Time state representation

**File**: `packages/planning/src/temporal/time-state.ts` (new)

```ts
const TICK_BUCKET_SIZE = 100; // 5 seconds at 20 tps

export interface TimeState {
  currentTickBucket: number;   // integer only
  maxHorizonBucket: number;    // upper bound for planning
}

export interface ResourceSlot {
  id: string;                  // e.g., "furnace_0", "furnace_1"
  type: 'furnace' | 'crafting_table' | 'smoker' | 'blast_furnace';
  readyAtBucket: number;       // integer tick bucket when slot becomes free
  currentItem?: string;        // what's being processed
  currentCount?: number;       // batch size in progress
}

export function toTickBucket(ms: number): number {
  return Math.floor(ms / (TICK_BUCKET_SIZE * 50)); // 50ms per tick
}

export function hashTemporalState(time: TimeState, slots: ResourceSlot[]): string {
  const sorted = [...slots].sort((a, b) => a.id.localeCompare(b.id));
  const canonical = JSON.stringify({ t: time.currentTickBucket, s: sorted.map(s => ({ id: s.id, r: s.readyAtBucket })) });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}
```

**Determinism requirements**:
- All time values are integer tick buckets (no floats, no `Date.now()`)
- Slot arrays sorted by `id` before hashing
- `TICK_BUCKET_SIZE` is constant, not configurable at runtime

### 5.2 Duration model

**File**: `packages/planning/src/temporal/duration-model.ts` (new)

```ts
export interface OperatorDuration {
  operatorId: string;            // e.g., "smelt", "cook", "craft"
  baseDurationTicks: number;     // ticks per single operation
  perItemDurationTicks?: number; // additional ticks per extra item in batch
  slotType?: 'furnace' | 'smoker' | 'blast_furnace';
}

export const OPERATOR_DURATIONS: OperatorDuration[] = [
  { operatorId: 'smelt',       baseDurationTicks: 200, perItemDurationTicks: 200, slotType: 'furnace' },
  { operatorId: 'cook',        baseDurationTicks: 200, perItemDurationTicks: 200, slotType: 'furnace' },
  { operatorId: 'blast_smelt', baseDurationTicks: 100, perItemDurationTicks: 100, slotType: 'blast_furnace' },
  { operatorId: 'smoke',       baseDurationTicks: 100, perItemDurationTicks: 100, slotType: 'smoker' },
  { operatorId: 'craft',       baseDurationTicks: 0 },  // instant
  { operatorId: 'mine',        baseDurationTicks: 40 },  // ~2 seconds average
  { operatorId: 'place',       baseDurationTicks: 5 },   // near-instant
];

export function getOperatorDuration(operatorId: string, itemCount: number = 1): number {
  const def = OPERATOR_DURATIONS.find(d => operatorId.startsWith(d.operatorId));
  if (!def) return 0;
  const base = def.baseDurationTicks;
  const perItem = def.perItemDurationTicks ?? 0;
  return base + perItem * Math.max(0, itemCount - 1);
}
```

**Determinism requirements**:
- Duration lookup is pure (no side effects, no state)
- `OPERATOR_DURATIONS` is a frozen constant array
- `getOperatorDuration` returns same value for same inputs

### 5.3 Capacity management

**File**: `packages/planning/src/temporal/capacity-manager.ts` (new)

```ts
export function findAvailableSlot(
  slots: ResourceSlot[],
  slotType: string,
  atBucket: number
): ResourceSlot | undefined {
  return slots
    .filter(s => s.type === slotType && s.readyAtBucket <= atBucket)
    .sort((a, b) =>
      a.readyAtBucket !== b.readyAtBucket
        ? a.readyAtBucket - b.readyAtBucket
        : a.id.localeCompare(b.id)
    )[0];
}

export function reserveSlot(
  slots: ResourceSlot[],
  slotId: string,
  item: string,
  count: number,
  durationTicks: number,
  currentBucket: number
): ResourceSlot[] {
  return slots.map(s =>
    s.id === slotId
      ? { ...s, readyAtBucket: currentBucket + Math.ceil(durationTicks / TICK_BUCKET_SIZE), currentItem: item, currentCount: count }
      : s
  );
}

export function getEarliestAvailableTime(slots: ResourceSlot[], slotType: string): number {
  const matching = slots.filter(s => s.type === slotType);
  if (matching.length === 0) return Infinity;
  return Math.min(...matching.map(s => s.readyAtBucket));
}
```

**Determinism requirements**:
- Slot selection uses deterministic tie-breaking: `(readyAtBucket, id)`
- `reserveSlot` returns new array (immutable)
- No mutation of input arrays

### 5.4 Deadlock prevention

**File**: `packages/planning/src/temporal/deadlock-prevention.ts` (new)

```ts
const MAX_WAIT_BUCKETS = 100; // maximum horizon for waiting

export interface DeadlockCheck {
  isDeadlock: boolean;
  reason?: string;
  blockedResources?: string[];
}

export function checkForDeadlock(
  slotsNeeded: Array<{ type: string; count: number }>,
  slots: ResourceSlot[],
  currentBucket: number,
  maxHorizonBucket: number
): DeadlockCheck {
  const horizon = Math.min(currentBucket + MAX_WAIT_BUCKETS, maxHorizonBucket);
  const blocked: string[] = [];

  for (const need of slotsNeeded) {
    const available = slots.filter(
      s => s.type === need.type && s.readyAtBucket <= horizon
    );
    if (available.length < need.count) {
      blocked.push(need.type);
    }
  }

  if (blocked.length > 0) {
    return {
      isDeadlock: true,
      reason: `Capacity deadlock: ${blocked.join(', ')} not available within horizon`,
      blockedResources: blocked,
    };
  }
  return { isDeadlock: false };
}
```

### 5.5 Batch operators

**File**: `packages/planning/src/temporal/batch-operators.ts` (new)

```ts
export interface BatchOperator {
  id: string;
  name: string;
  itemType: string;
  maxBatchSize: number;
  slotType: string;
  perItemDuration: number;
  preconditions: Record<string, number>;
  effects: Record<string, number>;
}

export function preferBatchOperator(
  itemType: string,
  goalCount: number,
  availableBatchOps: BatchOperator[]
): { useBatch: boolean; operator?: BatchOperator; batchSize?: number } {
  const BATCH_THRESHOLD = 8;
  if (goalCount < BATCH_THRESHOLD) return { useBatch: false };

  const matching = availableBatchOps.find(op => op.itemType === itemType);
  if (!matching) return { useBatch: false };

  const batchSize = Math.min(goalCount, matching.maxBatchSize);
  return { useBatch: true, operator: matching, batchSize };
}
```

### 5.6 Makespan objective

**File**: `packages/planning/src/temporal/makespan-objective.ts` (new)

```ts
export interface TemporalCost {
  actionCost: number;   // base A* cost
  timeCost: number;     // makespan contribution
  totalCost: number;    // weighted sum
}

export function computeTemporalCost(
  baseCost: number,
  durationTicks: number,
  timeWeight: number = 0.3
): TemporalCost {
  const actionCost = baseCost;
  const timeCost = durationTicks;
  const totalCost = actionCost * (1 - timeWeight) + timeCost * timeWeight;
  return { actionCost, timeCost, totalCost };
}

export function calculateMakespan(steps: Array<{ startBucket: number; endBucket: number }>): number {
  if (steps.length === 0) return 0;
  const start = Math.min(...steps.map(s => s.startBucket));
  const end = Math.max(...steps.map(s => s.endBucket));
  return end - start;
}
```

### 5.7 Solver extension

**File**: `packages/planning/src/sterling/minecraft-crafting-solver.ts` (modify)

Extend `solveCraftingGoal()` to:
1. Derive temporal state from bot context (tick buckets, slot states)
2. Run deadlock check before calling Sterling
3. Tag rules with `durationTicks` using duration model
4. Generate batch rule variants when goal count >= threshold
5. Pass temporal parameters to Sterling
6. Validate returned steps have valid `startBucket`/`endBucket`

### 5.8 Type extensions

**File**: `packages/planning/src/sterling/minecraft-crafting-types.ts` (modify)

Add to `MinecraftCraftingRule`:
- `durationTicks?: number`
- `slotType?: string`
- `batchSize?: number`

Add to `MinecraftSolveRequest`:
- `currentTickBucket?: number`
- `slots?: ResourceSlot[]`

### 5.9 Rule building extension

**File**: `packages/planning/src/sterling/minecraft-crafting-rules.ts` (modify)

Extend `buildCraftingRules()` to:
- Tag smelt/cook rules with `durationTicks` from `OPERATOR_DURATIONS`
- Generate `smelt_batch_<item>` rules when batch operators apply
- Set `slotType` on rules that require station slots

---

## 6. Implementation pivots

### Pivot 1: Integer tick buckets only — no float time

**Problem**: Using `Date.now()` or raw milliseconds in state creates non-determinism and float jitter. Same state at slightly different wall-clock times produces different plans.

**Pivot**: All time in planning state is integer tick buckets. `currentTickBucket`, `readyAtBucket` are integers. Conversion happens at the boundary only (when reading from Minecraft).

**Code**:

```ts
const TICK_BUCKET_SIZE = 100;

function toTickBucket(ms: number): number {
  return Math.floor(ms / (TICK_BUCKET_SIZE * 50));
}

// NEVER: currentTime: Date.now()
// ALWAYS: currentTickBucket: toTickBucket(Date.now())
```

**Acceptance check**: Same slot state + same operations produces identical schedule hash. No `Date.now()` or `performance.now()` in any temporal planning module.

### Pivot 2: Bounded wait — no infinite wait states

**Problem**: "Wait for slot" can create unbounded state space if not capped. Sterling could explore millions of "wait 1 more tick" states.

**Pivot**: `MAX_WAIT_BUCKETS = 100`; planner never schedules wait beyond horizon. If all slots are busy beyond horizon, return unsolved with "capacity deadlock."

**Code**:

```ts
const MAX_WAIT_BUCKETS = 100;

if (earliestAvailable > currentTickBucket + MAX_WAIT_BUCKETS) {
  return { solved: false, error: 'Capacity deadlock: all slots busy beyond horizon' };
}
```

**Acceptance check**: Search never explores states with wait > `MAX_WAIT_BUCKETS`. Any solve call with all slots busy beyond horizon returns `solved: false`.

### Pivot 3: Deterministic slot ordering for tie-breaking

**Problem**: Multiple slots ready at same bucket; non-deterministic choice causes different plans across runs.

**Pivot**: Sort slots by `(readyAtBucket, id)` before selecting. Same order every time, regardless of insertion order.

**Code**:

```ts
const selected = slots
  .filter(s => s.readyAtBucket <= currentBucket)
  .sort((a, b) =>
    a.readyAtBucket !== b.readyAtBucket
      ? a.readyAtBucket - b.readyAtBucket
      : a.id.localeCompare(b.id)
  )[0];
```

**Acceptance check**: Same state produces same slot chosen for same operation, across 100 repeated runs.

### Pivot 4: Batch preference enforced at rule-building time

**Problem**: Planner may choose 64x individual smelt operations over 1x smelt_batch if both rules are presented with equal cost.

**Pivot**: When building rules, add `smelt_batch` with lower cost-per-item; filter out single-item smelt when batch is available and count >= batch threshold (8).

**Code**:

```ts
if (goalCount >= 8 && hasBatchOperator) {
  // Add batch rule with lower per-item cost
  rules.push({
    ...baseSmeltRule,
    action: `smelt_batch:${itemType}`,
    baseCost: baseSmeltRule.baseCost * 0.3,
    batchSize: Math.min(goalCount, 64),
    durationTicks: getOperatorDuration('smelt', Math.min(goalCount, 64)),
  });
}
```

**Acceptance check**: Plan for 64 iron ingots uses batch operators when batch rules are available. Plan cost is lower than 64x individual smelt.

### Pivot 5: Deadlock detection before solve

**Problem**: Sterling may search extensively before discovering that no slot becomes available within the horizon, wasting computation.

**Pivot**: Before calling Sterling, check: for each slot type needed, at least one slot has `readyAtBucket <= maxHorizonBucket`. If not, return unsolved with "capacity deadlock."

**Code**:

```ts
const deadlock = checkForDeadlock(slotsNeeded, slots, currentBucket, maxHorizonBucket);
if (deadlock.isDeadlock) {
  return {
    solved: false,
    error: deadlock.reason,
    blockedResources: deadlock.blockedResources,
  };
}
```

**Acceptance check**: No Sterling call is made when all furnace slots are busy beyond horizon. Deadlock detection returns in < 1ms.

---

## 7. Transfer surfaces (domain-agnosticism proof)

### 7.1 CI/CD Pipeline Scheduling

**Surface**: Build jobs with duration, shared runners as capacity slots, batch test suites.

- **State**: Runner pool with `readyAtBucket` per runner; job queue with dependencies
- **Actions with duration**: Build job (5 min), test suite (10 min), deploy (3 min)
- **Resource occupancy**: Runner slot occupied during job execution
- **Batching**: Batch small test suites into single runner job (lower overhead)
- **Deadlock**: All runners busy beyond pipeline deadline = pipeline timeout
- **Makespan**: Minimize total pipeline time, not just job count

**Prove**: Same integer buckets, same bounded wait, same batch preference, same deadlock detection.

**Certification gates**:
- Pipeline with 4 runners schedules parallel test suites
- Batch test suites are preferred over individual runs for 20+ suites
- Pipeline returns timeout when all runners busy beyond deadline

### 7.2 Manufacturing Assembly Line

**Surface**: Station durations, parallel stations, batch operations.

- **State**: Station slots (welding, painting, assembly) with completion times
- **Actions with duration**: Welding (30 min), painting (45 min), assembly (15 min)
- **Resource occupancy**: Station occupied during operation
- **Batching**: Batch similar parts at same station (setup cost amortized)
- **Deadlock**: Blocked station = no units can proceed through line
- **Makespan**: Minimize throughput time for batch of units

**Prove**: Same slot reservation semantics, same capacity management, same batch threshold logic.

**Certification gates**:
- 4-station parallel welding reduces makespan vs 1-station
- Batch of 20 parts uses batch operators when available
- Assembly line halts declared when all stations of a type are blocked

### 7.3 Cloud Resource Orchestration

**Surface**: VM provisioning durations, pool capacity, batch deployments.

- **State**: VM pool with availability times; provisioning queue
- **Actions with duration**: Provision VM (2 min), deploy service (30s), health check (10s)
- **Resource occupancy**: VM slot occupied during provisioning
- **Batching**: Batch deploy to multiple VMs simultaneously
- **Deadlock**: Pool exhausted beyond scaling limit = deployment blocked
- **Makespan**: Minimize deployment window across all regions

**Prove**: Same temporal state model, same deadlock detection, same batch preference enforcement.

**Certification gates**:
- 4-region parallel deployment uses all available VMs
- Batch deployment preferred for 10+ instances
- Deployment blocked when pool capacity exhausted

---

## 8. Concrete certification tests

### Test 1: Deadlock prevention

```ts
describe('Temporal planning - deadlock prevention', () => {
  it('detects deadlock when all furnace slots busy beyond horizon', () => {
    const slots: ResourceSlot[] = [
      { id: 'furnace_0', type: 'furnace', readyAtBucket: 200 },
      { id: 'furnace_1', type: 'furnace', readyAtBucket: 250 },
    ];
    const currentBucket = 10;
    const maxHorizon = 110; // MAX_WAIT_BUCKETS = 100

    const result = checkForDeadlock(
      [{ type: 'furnace', count: 1 }],
      slots,
      currentBucket,
      maxHorizon
    );

    expect(result.isDeadlock).toBe(true);
    expect(result.blockedResources).toContain('furnace');
  });

  it('allows solve when slot becomes available within horizon', () => {
    const slots: ResourceSlot[] = [
      { id: 'furnace_0', type: 'furnace', readyAtBucket: 50 },
      { id: 'furnace_1', type: 'furnace', readyAtBucket: 200 },
    ];
    const currentBucket = 10;
    const maxHorizon = 110;

    const result = checkForDeadlock(
      [{ type: 'furnace', count: 1 }],
      slots,
      currentBucket,
      maxHorizon
    );

    expect(result.isDeadlock).toBe(false);
  });
});
```

### Test 2: Batch preference

```ts
describe('Temporal planning - batch preference', () => {
  it('prefers batch operator for large quantities', () => {
    const batchOps: BatchOperator[] = [
      {
        id: 'smelt_batch_iron_ore',
        name: 'Batch Smelt Iron',
        itemType: 'iron_ore',
        maxBatchSize: 64,
        slotType: 'furnace',
        perItemDuration: 200,
        preconditions: { iron_ore: 8 },
        effects: { iron_ingot: 8 },
      },
    ];

    const result = preferBatchOperator('iron_ore', 64, batchOps);

    expect(result.useBatch).toBe(true);
    expect(result.batchSize).toBe(64);
    expect(result.operator?.id).toBe('smelt_batch_iron_ore');
  });

  it('does not batch below threshold', () => {
    const batchOps: BatchOperator[] = [
      { id: 'smelt_batch_iron_ore', name: 'Batch Smelt', itemType: 'iron_ore', maxBatchSize: 64, slotType: 'furnace', perItemDuration: 200, preconditions: {}, effects: {} },
    ];

    const result = preferBatchOperator('iron_ore', 3, batchOps);
    expect(result.useBatch).toBe(false);
  });
});
```

### Test 3: Makespan minimization

```ts
describe('Temporal planning - makespan minimization', () => {
  it('parallel furnaces reduce makespan vs sequential', () => {
    // 4 furnaces smelting 64 items (16 per furnace) vs 1 furnace smelting 64
    const parallelSteps = [
      { startBucket: 0, endBucket: 32 },  // furnace_0: 16 items
      { startBucket: 0, endBucket: 32 },  // furnace_1: 16 items
      { startBucket: 0, endBucket: 32 },  // furnace_2: 16 items
      { startBucket: 0, endBucket: 32 },  // furnace_3: 16 items
    ];
    const serialSteps = [
      { startBucket: 0, endBucket: 128 }, // furnace_0: 64 items
    ];

    const parallelMakespan = calculateMakespan(parallelSteps);
    const serialMakespan = calculateMakespan(serialSteps);

    expect(parallelMakespan).toBeLessThan(serialMakespan);
    expect(parallelMakespan).toBe(32);
    expect(serialMakespan).toBe(128);
  });

  it('temporal cost weights makespan into objective', () => {
    const instant = computeTemporalCost(10, 0, 0.3);     // craft: instant
    const slow = computeTemporalCost(10, 200, 0.3);       // smelt: 200 ticks

    expect(slow.totalCost).toBeGreaterThan(instant.totalCost);
    expect(instant.timeCost).toBe(0);
    expect(slow.timeCost).toBe(200);
  });
});
```

### Test 4: Deterministic slot selection

```ts
describe('Temporal planning - deterministic slot selection', () => {
  it('selects same slot across repeated runs', () => {
    const slots: ResourceSlot[] = [
      { id: 'furnace_b', type: 'furnace', readyAtBucket: 0 },
      { id: 'furnace_a', type: 'furnace', readyAtBucket: 0 },
      { id: 'furnace_c', type: 'furnace', readyAtBucket: 0 },
    ];

    const results = Array.from({ length: 100 }, () =>
      findAvailableSlot(slots, 'furnace', 0)
    );

    // All should select furnace_a (alphabetically first with same readyAt)
    expect(results.every(r => r?.id === 'furnace_a')).toBe(true);
  });

  it('produces identical temporal state hash for same inputs', () => {
    const time: TimeState = { currentTickBucket: 10, maxHorizonBucket: 110 };
    const slots: ResourceSlot[] = [
      { id: 'furnace_1', type: 'furnace', readyAtBucket: 50 },
      { id: 'furnace_0', type: 'furnace', readyAtBucket: 0 },
    ];

    const hash1 = hashTemporalState(time, slots);
    const hash2 = hashTemporalState(time, [...slots].reverse());

    expect(hash1).toBe(hash2); // sorted by id before hashing
  });
});
```

### Test 5: Sterling integration (end-to-end)

```ts
describe('Temporal planning - Sterling integration', () => {
  it('passes temporal parameters to Sterling solve', async () => {
    const solver = new MinecraftCraftingSolver(sterlingService);
    const solveSpy = vi.spyOn(sterlingService, 'solve');

    await solver.solveCraftingGoal('iron_ingot', [{ name: 'iron_ore', count: 64 }], mcData, ['furnace']);

    const payload = solveSpy.mock.calls[0]?.[1];
    expect(payload.currentTickBucket).toBeDefined();
    expect(typeof payload.currentTickBucket).toBe('number');
    expect(Number.isInteger(payload.currentTickBucket)).toBe(true);
    expect(payload.slots).toBeDefined();
    expect(Array.isArray(payload.slots)).toBe(true);
  });

  it('returns unsolved when deadlock detected (no Sterling call)', async () => {
    const solver = new MinecraftCraftingSolver(sterlingService);
    const solveSpy = vi.spyOn(sterlingService, 'solve');

    // All furnaces busy far in the future
    vi.spyOn(solver as any, 'getSlotStates').mockReturnValue([
      { id: 'furnace_0', type: 'furnace', readyAtBucket: 9999 },
    ]);

    const result = await solver.solveCraftingGoal('iron_ingot', [{ name: 'iron_ore', count: 1 }], mcData, []);

    expect(result.solved).toBe(false);
    expect(solveSpy).not.toHaveBeenCalled(); // deadlock prevented Sterling call
  });

  it('validates temporal consistency of returned plan', async () => {
    const solver = new MinecraftCraftingSolver(sterlingService);
    vi.spyOn(sterlingService, 'solve').mockResolvedValue({
      solutionFound: true,
      steps: [
        { action: 'smelt:iron_ore', startBucket: 0, endBucket: 20, slotId: 'furnace_0' },
        { action: 'smelt:iron_ore', startBucket: 0, endBucket: 20, slotId: 'furnace_1' },
      ],
    });

    const result = await solver.solveCraftingGoal('iron_ingot', [{ name: 'iron_ore', count: 2 }], mcData, ['furnace']);

    // Steps should not overlap on same slot
    if (result.solved && result.steps) {
      const bySlot = new Map<string, Array<{ start: number; end: number }>>();
      for (const step of result.steps) {
        const slot = (step as any).slotId;
        if (slot) {
          const existing = bySlot.get(slot) || [];
          for (const prev of existing) {
            expect(step.startBucket >= prev.end || step.endBucket <= prev.start).toBe(true);
          }
          existing.push({ start: step.startBucket, end: step.endBucket });
          bySlot.set(slot, existing);
        }
      }
    }
  });
});
```

---

## 9. Definition of "done"

### 9.1 Core boundary criteria

- **No deadlocks**: Search never enters unreachable states due to time/capacity. Deadlock check runs before every Sterling call. (Pivot 2, Pivot 5)
- **Batching efficiency**: Plans prefer batch operations over iteration when goal count >= 8. (Pivot 4)
- **Makespan awareness**: Objective includes time; faster schedules are preferred over slower ones with same action count.
- **Determinism**: Same state + time -> same schedule. Slot tie-breaking is deterministic. (Pivot 1, Pivot 3)
- **Bounded**: Horizon window is finite (`MAX_WAIT_BUCKETS`); no unbounded wait states. (Pivot 2)

### 9.2 Acceptance checklist (references pivots)

| Check | Pivot | Test | Pass criteria |
|-------|-------|------|---------------|
| Integer tick buckets only | Pivot 1 | Test 4 | No float time in temporal state; hash is identical for same inputs |
| Wait bounded | Pivot 2 | Test 1 | Deadlock detected when all slots busy beyond horizon |
| Slot ordering deterministic | Pivot 3 | Test 4 | Same slot chosen 100/100 times for same state |
| Batch preferred | Pivot 4 | Test 2 | `useBatch: true` for goal count >= 8 |
| Deadlock before solve | Pivot 5 | Test 5 | No Sterling call when deadlock detected |
| Makespan reduced | - | Test 3 | Parallel makespan < serial makespan |

### 9.3 Transfer surface requirement

- At least one transfer surface (CI/CD, manufacturing, or cloud) must have a working certification test proving the same temporal semantics apply outside Minecraft.

---

## 10. Dependencies and risks

- **Rig A, B**: Builds on deterministic operators and capability gating.
- **Time quantization**: Too fine = state explosion; too coarse = scheduling inaccuracy. `TICK_BUCKET_SIZE = 100` is a reasonable default.
- **Concurrency model**: Must choose either explicit parallel actions or sequential with slot encoding.
- **Wait explosion**: Bounded by `MAX_WAIT_BUCKETS = 100`.
- **Sterling changes required**: Sterling must accept temporal params and return annotated steps. Until Sterling supports temporal fields, conscious-bot can still use temporal semantics locally for deadlock prevention and batch preference.

---

## 11. Implementation files summary

### New files (6)

| File | Purpose |
|------|---------|
| `packages/planning/src/temporal/time-state.ts` | TimeState, ResourceSlot types, toTickBucket, hashTemporalState |
| `packages/planning/src/temporal/duration-model.ts` | OperatorDuration, OPERATOR_DURATIONS, getOperatorDuration |
| `packages/planning/src/temporal/capacity-manager.ts` | findAvailableSlot, reserveSlot, getEarliestAvailableTime |
| `packages/planning/src/temporal/deadlock-prevention.ts` | DeadlockCheck, checkForDeadlock, MAX_WAIT_BUCKETS |
| `packages/planning/src/temporal/batch-operators.ts` | BatchOperator, preferBatchOperator, BATCH_THRESHOLD |
| `packages/planning/src/temporal/makespan-objective.ts` | TemporalCost, computeTemporalCost, calculateMakespan |

### Modified files (3)

| File | Change |
|------|--------|
| `packages/planning/src/sterling/minecraft-crafting-types.ts` | Add `durationTicks`, `slotType`, `batchSize` to rule; add `currentTickBucket`, `slots` to request |
| `packages/planning/src/sterling/minecraft-crafting-rules.ts` | Tag smelt/cook rules with duration; generate batch rule variants |
| `packages/planning/src/sterling/minecraft-crafting-solver.ts` | Derive temporal state, deadlock check, pass temporal params, post-validate |

### Test files (3)

| File | Covers |
|------|--------|
| `packages/planning/src/temporal/__tests__/time-state.test.ts` | Tick bucket conversion, temporal state hashing, determinism |
| `packages/planning/src/temporal/__tests__/capacity-manager.test.ts` | Slot finding, reservation, earliest available time |
| `packages/planning/src/temporal/__tests__/deadlock-prevention.test.ts` | Deadlock detection, bounded wait, capacity constraints |

---

## 12. Cross-references

- **Companion approach**: `RIG_C_TEMPORAL_PLANNING_APPROACH.md` (detailed pivots, interfaces, DO/DO NOT)
- **Capability primitives**: `capability-primitives.md` (P3)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig C section)
- **Rig A, B**: Foundation for operators and legality
- **Enrichment guide**: `RIG_DOCUMENTATION_ENRICHMENT_GUIDE.md`
