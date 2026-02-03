# Rig F: Goal-Conditioned Valuation Under Scarcity — Companion Approach

**Implementation**: Not started — spec only

This companion document distills the implementation plan with design decisions, boundaries, and implementation construction constraints. Read alongside `RIG_F_VALUATION_SCARCITY_PLAN.md`.

---

## 1. Executive summary

Rig F proves **Primitive 6** (Goal-conditioned valuation under scarcity) by implementing principled keep/drop decisions that:

1. Model **constrained capacity** (inventory slots, storage)
2. **Value items relative to current goals**
3. **Explain** what was sacrificed and why
4. **Shift valuations** when goals change

**Critical boundary**: Choices reflect priorities; sacrifices are explainable.

---

## 2. Implementation construction constraints (pivots)

### Pivot 1: Bounded value scale

**Problem:** Unbounded values cause non-determinism and overflow.

**Pivot:** Value scale 0-10 integer only. `totalValue = round(baseValue * goalRelevance)` clamped to [0,10].

**Acceptance check:** No value > 10 or < 0.

---

### Pivot 2: Drop decision includes rationale

**Problem:** Drop happens without explanation; cannot audit.

**Pivot:** Every `DropDecision` has `explanation` string: "Dropped X because goal Y values Z more."

**Acceptance check:** `selectDrops()` return includes non-empty `explanation`.

---

### Pivot 3: Recalculate on goal change

**Problem:** Goal changes but values stay; wrong drops.

**Pivot:** When goal changes, call `recalculateValuesOnGoalChange()`; use new values for next drop decision.

**Acceptance check:** Iron value higher for crafting_armor goal than for building goal.

---

### Pivot 4: Lowest value dropped first

**Problem:** Random or arbitrary drop order; suboptimal.

**Pivot:** Sort candidates by `value.totalValue` ascending; drop lowest first.

**Acceptance check:** Full inventory, need 1 slot: cobble dropped before diamond.

---

### Summary: Acceptance check table

| Pivot | Acceptance check |
|-------|------------------|
| 1 | Values bounded [0,10]. |
| 2 | Every drop has explanation. |
| 3 | Values recalculate on goal change. |
| 4 | Lowest value dropped first. |

---

## 3. Primary design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Value scale | 0-10 integer buckets | Bounded, deterministic |
| Goal relevance | Multiplier on base value | Simple, interpretable |
| Capacity tracking | Slot count + item count | Matches Minecraft |
| Drop selection | Lowest total value first | Optimal under simple model |
| Explanation | Structured rationale | Auditable |

---

## 3. Capacity model

### 3.1 Capacity state

```ts
// packages/planning/src/valuation/capacity-model.ts

export interface CapacityState {
  inventorySlots: {
    total: number;      // 36 for player
    occupied: number;
    free: number;
  };
  storageSlots: {
    chestSlots: number;
    shulkerSlots: number;
  };
  holdings: Record<string, number>;  // item → count
}

export function getCapacity(inventory: Record<string, number>): CapacityState {
  const occupied = Object.keys(inventory).filter(k => inventory[k] > 0).length;
  return {
    inventorySlots: {
      total: 36,
      occupied,
      free: 36 - occupied,
    },
    storageSlots: {
      chestSlots: 0,  // Populated from world state
      shulkerSlots: 0,
    },
    holdings: inventory,
  };
}

export function isCapacityConstrained(capacity: CapacityState): boolean {
  return capacity.inventorySlots.free <= 0;
}
```

---

## 4. Value function

### 4.1 Base values

```ts
// packages/planning/src/valuation/item-values.ts

export const BASE_VALUES: Record<string, number> = {
  // Common materials (low value)
  cobblestone: 1,
  dirt: 1,
  gravel: 1,
  sand: 2,
  wood: 2,
  
  // Intermediate materials
  coal: 3,
  iron_ore: 4,
  iron_ingot: 5,
  gold_ingot: 5,
  redstone: 4,
  lapis_lazuli: 4,
  
  // Rare materials (high value)
  diamond: 8,
  emerald: 7,
  netherite_ingot: 10,
  
  // Tools and equipment (context-dependent)
  wooden_pickaxe: 2,
  stone_pickaxe: 3,
  iron_pickaxe: 5,
  diamond_pickaxe: 8,
  
  // Food
  bread: 3,
  cooked_beef: 4,
  golden_apple: 7,
};

export function getBaseValue(item: string): number {
  return BASE_VALUES[item] ?? 2;  // Default moderate value
}
```

### 4.2 Goal relevance

```ts
export interface Goal {
  id: string;
  type: 'craft' | 'build' | 'explore' | 'trade' | 'survive';
  targetItems?: Record<string, number>;
  targetStructure?: string;
}

export function computeGoalRelevance(item: string, goal: Goal): number {
  if (!goal.targetItems) return 1.0;  // Neutral
  
  if (item in goal.targetItems) {
    return 2.0;  // Directly needed
  }
  
  // Check if item is a precursor
  if (isPrecursorFor(item, Object.keys(goal.targetItems))) {
    return 1.5;  // Indirectly needed
  }
  
  return 0.5;  // Not relevant to current goal
}

function isPrecursorFor(item: string, targets: string[]): boolean {
  // Check crafting recipes
  for (const target of targets) {
    const recipe = getRecipe(target);
    if (recipe?.inputs.includes(item)) return true;
  }
  return false;
}
```

### 4.3 Total value

```ts
export interface ItemValue {
  item: string;
  baseValue: number;
  goalRelevance: number;
  totalValue: number;
  explanation: string;
}

export function computeItemValue(item: string, goal: Goal): ItemValue {
  const baseValue = getBaseValue(item);
  const relevance = computeGoalRelevance(item, goal);
  const totalValue = Math.round(baseValue * relevance);
  
  return {
    item,
    baseValue,
    goalRelevance: relevance,
    totalValue,
    explanation: `Base ${baseValue} × relevance ${relevance.toFixed(1)} = ${totalValue}`,
  };
}
```

---

## 5. Drop selection

### 5.1 Drop candidates

```ts
// packages/planning/src/valuation/drop-selection.ts

export interface DropCandidate {
  item: string;
  count: number;
  value: ItemValue;
  totalStackValue: number;
}

export function getDropCandidates(
  inventory: Record<string, number>,
  goal: Goal
): DropCandidate[] {
  const candidates: DropCandidate[] = [];
  
  for (const [item, count] of Object.entries(inventory)) {
    if (count <= 0) continue;
    
    const value = computeItemValue(item, goal);
    candidates.push({
      item,
      count,
      value,
      totalStackValue: value.totalValue * count,
    });
  }
  
  // Sort by value per item (lowest first = best to drop)
  return candidates.sort((a, b) => a.value.totalValue - b.value.totalValue);
}
```

### 5.2 Drop decision

```ts
export interface DropDecision {
  itemsToDrop: Array<{ item: string; count: number }>;
  slotsFreed: number;
  valuesSacrificed: number;
  explanation: string;
}

export function selectDrops(
  inventory: Record<string, number>,
  goal: Goal,
  slotsNeeded: number
): DropDecision {
  const candidates = getDropCandidates(inventory, goal);
  const itemsToDrop: Array<{ item: string; count: number }> = [];
  let slotsFreed = 0;
  let valuesSacrificed = 0;
  
  for (const candidate of candidates) {
    if (slotsFreed >= slotsNeeded) break;
    
    // Drop entire stack to free the slot
    itemsToDrop.push({ item: candidate.item, count: candidate.count });
    slotsFreed += 1;
    valuesSacrificed += candidate.totalStackValue;
  }
  
  const explanation = itemsToDrop.map(d => 
    `Drop ${d.count}× ${d.item} (value ${computeItemValue(d.item, goal).totalValue})`
  ).join('; ');
  
  return {
    itemsToDrop,
    slotsFreed,
    valuesSacrificed,
    explanation: `${explanation}. Freed ${slotsFreed} slots, sacrificed ${valuesSacrificed} total value.`,
  };
}
```

---

## 6. Goal change handling

### 6.1 Value recalculation

```ts
export function recalculateValuesOnGoalChange(
  inventory: Record<string, number>,
  oldGoal: Goal,
  newGoal: Goal
): { item: string; oldValue: number; newValue: number; change: number }[] {
  const changes: { item: string; oldValue: number; newValue: number; change: number }[] = [];
  
  for (const item of Object.keys(inventory)) {
    const oldValue = computeItemValue(item, oldGoal).totalValue;
    const newValue = computeItemValue(item, newGoal).totalValue;
    
    if (oldValue !== newValue) {
      changes.push({ item, oldValue, newValue, change: newValue - oldValue });
    }
  }
  
  return changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}
```

---

## 7. Explanation output

### 7.1 Structured explanation

```ts
export interface ValuationExplanation {
  currentGoal: Goal;
  capacityState: CapacityState;
  dropsSelected: DropDecision | null;
  valueChangesFromGoalShift: { item: string; oldValue: number; newValue: number }[];
  rationale: string;
}

export function explainValuation(
  inventory: Record<string, number>,
  goal: Goal,
  dropsNeeded: number
): ValuationExplanation {
  const capacity = getCapacity(inventory);
  const drops = dropsNeeded > 0 ? selectDrops(inventory, goal, dropsNeeded) : null;
  
  let rationale = `Goal: ${goal.type}`;
  if (drops) {
    rationale += `. ${drops.explanation}`;
  } else {
    rationale += `. No drops needed (${capacity.inventorySlots.free} slots free).`;
  }
  
  return {
    currentGoal: goal,
    capacityState: capacity,
    dropsSelected: drops,
    valueChangesFromGoalShift: [],
    rationale,
  };
}
```

---

## 8. DO and DO NOT

**DO:**
- **DO** use bounded value scale (0-10).
- **DO** include goal relevance in value calculation.
- **DO** drop lowest-value items first.
- **DO** explain every drop with rationale.
- **DO** recalculate values when goals change.

**DO NOT:**
- **DO NOT** use unbounded value functions.
- **DO NOT** drop items without considering current goal.
- **DO NOT** make drop decisions without explanation.
- **DO NOT** ignore goal changes (values should shift).

---

## 9. Certification tests

### 9.1 Goal-conditioned values

```ts
describe('Goal-conditioned valuation', () => {
  it('values iron higher for crafting iron armor goal', () => {
    const craftingGoal: Goal = { id: '1', type: 'craft', targetItems: { iron_chestplate: 1 } };
    const buildingGoal: Goal = { id: '2', type: 'build', targetItems: { cobblestone: 64 } };
    
    const ironCraftValue = computeItemValue('iron_ingot', craftingGoal).totalValue;
    const ironBuildValue = computeItemValue('iron_ingot', buildingGoal).totalValue;
    
    expect(ironCraftValue).toBeGreaterThan(ironBuildValue);
  });
});
```

### 9.2 Optimal drops

```ts
describe('Drop selection', () => {
  it('drops lowest-value items first', () => {
    const inventory = { cobblestone: 64, diamond: 10, dirt: 32 };
    const goal: Goal = { id: '1', type: 'craft', targetItems: { diamond_pickaxe: 1 } };
    
    const drops = selectDrops(inventory, goal, 2);
    
    // Should drop dirt and cobblestone, not diamond
    const droppedItems = drops.itemsToDrop.map(d => d.item);
    expect(droppedItems).toContain('dirt');
    expect(droppedItems).toContain('cobblestone');
    expect(droppedItems).not.toContain('diamond');
  });
});
```

---

## 11. Definition of "done"

### Core boundary criteria

- **Goal-conditioned:** Same item different value per goal.
- **Optimal drops:** Lowest value dropped first.
- **Explainable:** Every drop has rationale.
- **Goal shift:** Values recalculate on change.
- **Bounded:** Values in [0,10].

### Acceptance checks (4 pivots)

All 4 pivot acceptance checks must pass.

---

## 11. Cross-references

- **Implementation plan**: `RIG_F_VALUATION_SCARCITY_PLAN.md`
- **Capability primitives**: `capability-primitives.md` (P6)
- **Sterling domains**: `sterling-minecraft-domains.md` (Rig F section)
