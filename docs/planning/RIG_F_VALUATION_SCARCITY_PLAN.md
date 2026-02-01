# Rig F: Goal-Conditioned Valuation Under Scarcity Implementation Plan

**Primitive**: P6 — Goal-conditioned valuation under scarcity (keep/drop/allocate)

**Status**: ENRICHED (2026-01-31)

---

## 1. Target invariant (critical boundary)

**"Choices reflect current priorities; sacrifices are explainable."**

The system must:
- Model constrained capacity (inventory slots, storage, attention)
- Value items/actions relative to current goals
- Explain what was sacrificed and why
- Shift valuations when goals change

**What this rig proves**: Sterling can make principled keep/drop/allocate decisions under resource constraints.

---

## 2. Formal signature

- **Constrained capacity**: inventory slots, storage containers, budget limits
- **Objective is utility under current goals**: "diamonds valuable for enchanting goal"
- **Value model can shift with goals**: same item, different utility per goal
- **Learning updates item/action valuations**: experience-driven value estimates

---

## 3. Problem being solved

### 3.1 Current state (no valuation model)

Without valuation:
- Bot hoards everything or drops randomly
- No model of "this is valuable for my current goal"
- Inventory fills with low-value items, preventing high-value pickups

### 3.2 With valuation under scarcity

With proper valuation:
- Current goal "build iron armor" → iron ingots are high value, cobblestone is low
- When inventory is full, bot can explain: "dropped 32 cobble to pick up 8 iron"
- Goal changes to "build base" → cobblestone value increases, iron value decreases

---

## 4. What to investigate before implementing

| Step | Location | What to verify |
|------|----------|----------------|
| Inventory state | `packages/planning/src/task-integration.ts` | How inventory is passed to Sterling; slot count available |
| Goal context | Cognition / planning integration | Where current goal is known; how to pass goal for value conditioning |
| Drop/gather flow | minecraft-interface, planning | Where inventory-full decisions happen; where drop would be triggered |
| Solve output | Sterling solve response | Where to attach drop rationale; explanation extension point |

**Investigation outcome (verified 2025-01-31):** No goal-conditioned valuation. Inventory: `sterling-planner.fetchBotContext()` (sterling-planner.ts:129-145) returns `inventory` (items array); `task-integration.buildInventoryIndex()` (task-integration.ts:298-302) builds `Record<string, number>`. No slot count or capacity model. Goal context: `taskData.metadata` and `resolveRequirement(taskData)` (task-integration) carry goal; no value function. Drop/gather: `modular-server.ts` and `inventory-helpers` have `analyzeCraftingResources`; no drop operator or rationale. Solve output: Sterling returns steps; no drop rationale extension. Capacity would extend world state; value function would sit in planning layer; drop operators would be new domain rules.

### 4a. Current code anchors (verified 2025-01-31)

| File | Line(s) | What |
|------|---------|------|
| `packages/planning/src/task-integration/sterling-planner.ts` | 129-145, 249-256 | `fetchBotContext()`: inventory array; `generateStepsFromSterling()`: inventory from botCtx or metadata. No slot count. |
| `packages/planning/src/task-integration.ts` | 298-302 | `buildInventoryIndex(inventory)`: maps items to `Record<string, number>`. No capacity. |
| `packages/planning/src/modular-server.ts` | 985-999, 1038-1060 | `analyzeCraftingResources(inventory)`: wood/log analysis; no drop logic or value function. |
| `packages/planning/src/modules/mc-client.ts` | 251-270 | `fetchInventory()`: inventory from `/inventory`; no capacity or goal context. |

**Gap:** No capacity model (slots free), no goal-conditioned value function, no drop/keep operators, no explanation output. Valuation would require new `valuation/` module and domain extension.

### 4b. conscious-bot vs Sterling split

| Responsibility | Owner | Location |
|----------------|-------|----------|
| Capacity model (slots free, holdings) | conscious-bot | `packages/planning/src/valuation/capacity-model.ts` (new) |
| Goal-conditioned value function | conscious-bot | `packages/planning/src/valuation/value-function.ts` (new) |
| Drop/keep operators and rationale | conscious-bot | `packages/planning/src/valuation/drop-rationale.ts` (new) |
| Pass goal + capacity to Sterling | conscious-bot | Extend fetchBotContext / solve payload |
| Solve with capacity constraints (optional) | Sterling | Receives capacity + goal; returns steps + drop rationale |

**Contract:** conscious-bot extracts capacity and goal; computes or passes value conditioning; Sterling (if used) returns steps and optional drop rationale. Explanation is conscious-bot responsibility.

---

## 5. What to implement / change

### 5.1 Capacity model

**Location**: `packages/planning/src/valuation/` or world state

- Track available capacity: `inventory_slots_free`, `chest_slots_free`
- Track current holdings by item type
- Capacity constraints are part of planning state

### 5.2 Goal-conditioned value function

- Define value function: `value(item, goal) → number`
- Base value (intrinsic) + goal-relevance multiplier
- Values are bucketed (0-10 scale) to prevent state explosion

### 5.3 Keep/drop/allocate decisions

- When capacity is constrained, planner considers drop/store actions
- Drop lowest-value items first
- Allocation considers goal utility, not just item rarity

### 5.4 Explanation output

- Every drop/keep decision includes rationale
- "Dropped X because goal Y values Z more"
- Explanation is part of plan audit trail

---

## 6. Where (summary)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Capacity model | World state | Track slots, holdings |
| Value function | Planning layer | Goal-conditioned item values |
| Drop/keep operators | Domain rules | Actions for inventory management |
| Explanations | Solve output | Rationale for sacrifices |

---

## 7. Implementation pivots

| Pivot | Problem | Acceptance |
|-------|---------|------------|
| 1 Value buckets only | Raw values cause state explosion | value(item, goal) returns integer bucket (e.g. 0-10). |
| 2 Bounded hypothesis set | Too many goals bloat value table | Max N active goals (e.g. 5); value undefined for others. |
| 3 Drop rationale required | Silent drops are unexplainable | Every drop decision includes rationale (item, goal, value). |
| 4 Capacity from real state | Fake capacity causes wrong drops | slots_free from real inventory; no mock in production. |
| 5 Deterministic value for same (item, goal) | Non-determinism breaks replay | Same (item, goal) yields same value bucket. |

---

## 8. Transfer surfaces (domain-agnosticism proof)

### 8.1 Warehouse (slot allocation)

**Surface:** Limited shelf slots; value per SKU depends on current orders (goal). Drop lowest-value SKU when full; rationale: "dropped X to make room for Y (order Z)."

- **Prove:** Same value buckets, capacity from real state, drop rationale.

### 8.2 Cache eviction (memory allocation)

**Surface:** Limited cache slots; value per entry depends on current query pattern (goal). Evict lowest-value entry; rationale: "evicted key X (value N) for key Y (query Z)."

- **Prove:** Same bounded hypothesis set; deterministic value for same (item, goal).

### 8.3 Minecraft (inventory slots)

**Surface:** 36 slots; value per item depends on current task (build armor, build base). Drop cobble when full to pick up iron; rationale: "dropped 32 cobble (goal: iron armor) to pick up 8 iron."

- **Prove:** Direct mapping to fetchBotContext; capacity from buildInventoryIndex extension.

---

## 9. Concrete certification tests

### Test 1: Value buckets

```ts
describe('Rig F - value buckets', () => {
  it('value returns integer bucket in [0, VALUE_MAX]', () => {
    const v = value('iron_ingot', { goalId: 'build_armor' });
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(VALUE_MAX);
  });

  it('same (item, goal) yields same value', () => {
    expect(value('iron_ingot', { goalId: 'build_armor' })).toBe(value('iron_ingot', { goalId: 'build_armor' }));
  });
});
```

### Test 2: Capacity from real state

```ts
describe('Rig F - capacity from real state', () => {
  it('slots_free from inventory length', () => {
    const inv = buildInventoryIndex([{ name: 'cobblestone', count: 32 }]);
    const cap = buildCapacityModel(inv, { maxSlots: 36 });
    expect(cap.slotsFree).toBe(35);
  });
});
```

### Test 3: Drop rationale required

```ts
describe('Rig F - drop rationale required', () => {
  it('every drop decision includes rationale', () => {
    const decision = decideDrop({ inventory: fullInv, goal: { goalId: 'build_armor' }, capacity: cap });
    expect(decision.rationale).toBeDefined();
    expect(decision.rationale).toContain('dropped');
    expect(decision.rationale).toMatch(/goal|value/);
  });
});
```

### Test 4: Goal-conditioned value shift

```ts
describe('Rig F - goal-conditioned value shift', () => {
  it('same item has different value per goal', () => {
    const vArmor = value('cobblestone', { goalId: 'build_armor' });
    const vBase = value('cobblestone', { goalId: 'build_base' });
    expect(vBase).toBeGreaterThan(vArmor);
  });
});
```

### Test 5: Bounded hypothesis set

```ts
describe('Rig F - bounded hypothesis set', () => {
  it('value undefined for goal beyond MAX_ACTIVE_GOALS', () => {
    const goals = Array.from({ length: 10 }, (_, i) => ({ goalId: `goal_${i}` }));
    setActiveGoals(goals.slice(0, 5));
    expect(value('iron_ingot', goals[6])).toBeUndefined();
  });
});
```

---

## 10. Definition of "done" (testable)

- **Capacity-aware:** Planner knows slots free (Test 2).
- **Goal-conditioned values:** Same item different value per goal (Test 4).
- **Value buckets:** Integer, bounded, deterministic (Test 1).
- **Drop rationale:** Every drop includes rationale (Test 3).
- **Bounded goals:** Max N active goals for value (Test 5).
- **Tests:** All 5 certification test blocks pass.

---

## 11. Implementation files summary

| Action | Path |
|--------|------|
| New | `packages/planning/src/valuation/capacity-model.ts` |
| New | `packages/planning/src/valuation/value-function.ts` |
| New | `packages/planning/src/valuation/drop-rationale.ts` |
| Modify | `packages/planning/src/task-integration/sterling-planner.ts` — pass capacity + goal to solve |
| Modify | `packages/planning/src/task-integration.ts` — extend buildInventoryIndex with slot count |
| Modify | `packages/planning/src/modular-server.ts` — hook drop decisions with rationale |

---

## 12. Order of work (suggested)

1. **Add capacity fields** to world state (slots free, holdings).
2. **Define value function** with goal-conditioned multipliers.
3. **Add drop/store operators** to domain.
4. **Implement allocation logic** in search (prefer keeping high-value).
5. **Add explanation output** for drop decisions.
6. **Certification tests**: drops are optimal; goal changes shift values.

---

## 13. Dependencies and risks

- **Rig A-E**: Builds on operators, legality, temporal, strategies, hierarchy.
- **Value function complexity**: Too complex = hard to explain; too simple = poor decisions.
- **Goal representation**: Must have clear goal structure for value conditioning.
- **Learning drift**: Value estimates can drift if not grounded in execution.

---

## 14. Cross-references

- **Companion approach**: `RIG_F_VALUATION_SCARCITY_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P6)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig F section)
