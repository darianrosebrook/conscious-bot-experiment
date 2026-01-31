# Rig D: Multi-Strategy Acquisition — Companion Approach

This companion document distills the implementation plan with explicit design decisions, boundaries, code references, and implementation construction constraints. Read alongside `RIG_D_MULTI_STRATEGY_PLAN.md`.

---

## 1. Executive summary

Rig D proves **Primitive 4** (Multi-strategy acquisition) by implementing strategic alternatives that:

1. Model **multiple operator families** achieving the same subgoal
2. Choose strategies based on **world-conditioned availability**
3. **Learn** "which strategy works here" from execution outcomes
4. Handle **different failure modes** per strategy

**Critical boundary**: Multiple strategies exist; choice is availability-conditioned and learned.

**Best path:** Define strategy families in conscious-bot; add availability extraction from world state; implement prior storage (context-keyed); wire execution reporting to update priors. Sterling receives rules for selected strategy only; strategy selection happens in conscious-bot before solve.

---

## 2. What must be implemented in conscious-bot vs Sterling

| Area | conscious-bot | Sterling |
|------|---------------|----------|
| Strategy families | Define; map to operator sets | None |
| Availability | Extract from world state; pass to strategy selector | None |
| Strategy selection | Choose strategy by availability + priors; filter rules | Receives pre-filtered rules |
| Prior updates | Update from execution outcomes only | None |
| Learning | Prior storage, context-keyed | Optional: edge priors (separate from strategy) |

**Contract:** conscious-bot selects strategy, fetches rules for that strategy, sends to Sterling. Prior updates happen on **execution outcome**, not on plan success.

---

## 3. Implementation construction constraints (pivots)

### Pivot 1: Prior updates only on execution, not plan success

**Problem:** Updating priors when Sterling returns a plan reinforces hypothetical success; learning is wrong.

**Pivot:** Update priors **only** when execution completes (success or failure). Plan generation does not touch priors.

**Acceptance check:** Prior unchanged after plan generation; changes only after `reportStrategyOutcome()`.

---

### Pivot 2: Context-keyed priors, not global

**Problem:** Global priors overfit to one biome; strategy that works in village fails in cave.

**Pivot:** Store priors per `(biome, areaType)`. Unknown context uses default prior.

**Acceptance check:** Prior for `plains:village` can differ from `cave:mine`.

---

### Pivot 3: Availability from real world state

**Problem:** Fake or stale availability flags cause wrong strategy selection.

**Pivot:** Availability flags come from `extractAvailability(worldState)` with real entity/block data. No mock flags in production path.

**Acceptance check:** `villager_nearby=true` only when world state actually has villager in range.

---

### Pivot 4: Bounded priors

**Problem:** Priors drift to 0 or 1; strategy never reconsidered.

**Pivot:** Clamp priors to [PRIOR_MIN, PRIOR_MAX] (e.g., 0.05, 0.95).

**Acceptance check:** Prior never < 0.05 or > 0.95.

---

### Summary: Acceptance check table

| Pivot | Acceptance check |
|-------|------------------|
| 1 | Prior unchanged by plan; only execution updates. |
| 2 | Priors context-keyed; differ by biome/area. |
| 3 | Availability from real world state. |
| 4 | Priors bounded [0.05, 0.95]. |

---

## 4. Primary design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Strategy representation | Operator families with shared effect | Clear grouping |
| Availability | Flags in world state from bot | Real-time world info |
| Prior storage | Per-strategy, context-keyed | Avoids global over-fitting |
| Learning rate | Conservative (0.1 adjust per outcome) | Stable adaptation |
| Context | Biome + area type | Meaningful for Minecraft |

---

## 3. Strategy families

### 3.1 Strategy family definition

```ts
// packages/planning/src/strategies/strategy-families.ts

export interface StrategyFamily {
  id: string;
  name: string;
  targetEffect: Record<string, number>;  // What this strategy produces
  operators: string[];                    // Operators in this family
  defaultPrior: number;                   // Initial preference (0-1)
  contextKeys: string[];                  // What context affects this strategy
}

export const STRATEGY_FAMILIES: StrategyFamily[] = [
  {
    id: 'iron_mine_smelt',
    name: 'Mine and smelt iron',
    targetEffect: { iron_ingot: 1 },
    operators: ['mine_iron_ore', 'smelt_iron'],
    defaultPrior: 0.5,
    contextKeys: ['biome', 'ore_visibility'],
  },
  {
    id: 'iron_trade',
    name: 'Trade for iron',
    targetEffect: { iron_ingot: 1 },
    operators: ['find_villager', 'trade_iron'],
    defaultPrior: 0.3,
    contextKeys: ['biome', 'villager_nearby'],
  },
  {
    id: 'iron_loot',
    name: 'Loot iron from chests',
    targetEffect: { iron_ingot: 1 },
    operators: ['find_chest', 'loot_chest'],
    defaultPrior: 0.2,
    contextKeys: ['structure_type', 'chest_known'],
  },
  {
    id: 'iron_salvage',
    name: 'Salvage iron from gear',
    targetEffect: { iron_ingot: 1 },
    operators: ['identify_iron_gear', 'smelt_gear'],
    defaultPrior: 0.1,
    contextKeys: ['inventory_gear'],
  },
];
```

### 3.2 Strategy selection

```ts
export interface StrategySelection {
  strategyId: string;
  effectiveCost: number;
  availabilityScore: number;
  priorScore: number;
  reason: string;
}

export function selectStrategy(
  goal: { item: string; count: number },
  worldState: WorldState,
  priors: StrategyPriors
): StrategySelection[] {
  const candidates = STRATEGY_FAMILIES.filter(f =>
    Object.keys(f.targetEffect).includes(goal.item)
  );
  
  const selections: StrategySelection[] = candidates.map(family => {
    const availability = computeAvailability(family, worldState);
    const prior = getPrior(family.id, worldState.context, priors);
    const effectiveCost = computeEffectiveCost(family, availability, prior);
    
    return {
      strategyId: family.id,
      effectiveCost,
      availabilityScore: availability,
      priorScore: prior,
      reason: explainSelection(family, availability, prior),
    };
  });
  
  // Sort by effective cost (lower is better)
  return selections.sort((a, b) => a.effectiveCost - b.effectiveCost);
}
```

---

## 4. Availability model

### 4.1 Availability flags

```ts
// packages/planning/src/strategies/availability.ts

export interface AvailabilityFlags {
  // Trading
  villager_nearby: boolean;
  villager_has_trade: boolean;
  emeralds_available: number;
  
  // Looting
  chest_known: boolean;
  chest_distance_bucket: number;
  structure_type: string | null;
  
  // Mining
  ore_visible: boolean;
  ore_distance_bucket: number;
  has_required_tool: boolean;
  
  // Salvage
  iron_gear_in_inventory: number;
}

export function extractAvailability(worldState: WorldState): AvailabilityFlags {
  return {
    villager_nearby: worldState.nearbyEntities.some(e => e.type === 'villager'),
    villager_has_trade: worldState.villagerTrades?.some(t => t.result === 'iron_ingot') ?? false,
    emeralds_available: worldState.inventory['emerald'] ?? 0,
    chest_known: worldState.knownContainers.length > 0,
    chest_distance_bucket: Math.min(...worldState.knownContainers.map(c => c.distanceBucket)) || 99,
    structure_type: worldState.nearestStructure?.type ?? null,
    ore_visible: worldState.visibleBlocks.some(b => b.type === 'iron_ore'),
    ore_distance_bucket: Math.min(...worldState.visibleBlocks.filter(b => b.type === 'iron_ore').map(b => b.distanceBucket)) || 99,
    has_required_tool: worldState.capabilities.has('can_harvest_iron'),
    iron_gear_in_inventory: countIronGear(worldState.inventory),
  };
}
```

### 4.2 Availability scoring

```ts
export function computeAvailability(
  family: StrategyFamily,
  worldState: WorldState
): number {
  const flags = extractAvailability(worldState);
  
  switch (family.id) {
    case 'iron_mine_smelt':
      if (!flags.has_required_tool) return 0;  // Cannot use
      if (flags.ore_visible) return 1.0;
      return 0.5;  // Possible but not visible
      
    case 'iron_trade':
      if (!flags.villager_nearby) return 0;
      if (!flags.villager_has_trade) return 0.2;
      if (flags.emeralds_available < 1) return 0.1;
      return 1.0;
      
    case 'iron_loot':
      if (!flags.chest_known) return 0;
      return Math.max(0, 1 - flags.chest_distance_bucket * 0.1);
      
    case 'iron_salvage':
      if (flags.iron_gear_in_inventory < 1) return 0;
      return Math.min(1, flags.iron_gear_in_inventory * 0.2);
      
    default:
      return 0.5;
  }
}
```

---

## 5. Strategy priors

### 5.1 Prior storage

```ts
// packages/planning/src/strategies/strategy-priors.ts

export interface ContextKey {
  biome: string;
  areaType: string;  // 'village', 'cave', 'surface', 'structure'
}

export interface StrategyPriors {
  global: Record<string, number>;  // strategy_id → prior
  contextual: Map<string, Record<string, number>>;  // context_hash → { strategy_id → prior }
}

function hashContext(context: ContextKey): string {
  return `${context.biome}:${context.areaType}`;
}

export function getPrior(
  strategyId: string,
  context: ContextKey,
  priors: StrategyPriors
): number {
  const contextHash = hashContext(context);
  const contextPriors = priors.contextual.get(contextHash);
  
  if (contextPriors && strategyId in contextPriors) {
    return contextPriors[strategyId];
  }
  
  return priors.global[strategyId] ?? 0.5;
}
```

### 5.2 Prior updates

```ts
export const PRIOR_LEARNING_RATE = 0.1;
export const PRIOR_MIN = 0.05;
export const PRIOR_MAX = 0.95;

export interface ExecutionOutcome {
  strategyId: string;
  context: ContextKey;
  success: boolean;
  cost: number;  // Actual cost incurred
  expectedCost: number;  // What was expected
}

export function updatePrior(
  priors: StrategyPriors,
  outcome: ExecutionOutcome
): StrategyPriors {
  const contextHash = hashContext(outcome.context);
  const currentPrior = getPrior(outcome.strategyId, outcome.context, priors);
  
  // Adjust based on success/failure
  let adjustment = 0;
  if (outcome.success) {
    // Boost prior if successful, especially if cheaper than expected
    const costRatio = outcome.expectedCost / Math.max(outcome.cost, 1);
    adjustment = PRIOR_LEARNING_RATE * Math.min(costRatio, 2);
  } else {
    // Penalize prior on failure
    adjustment = -PRIOR_LEARNING_RATE * 2;
  }
  
  const newPrior = Math.max(PRIOR_MIN, Math.min(PRIOR_MAX, currentPrior + adjustment));
  
  // Update contextual priors
  const newContextual = new Map(priors.contextual);
  const contextPriors = { ...(newContextual.get(contextHash) ?? {}) };
  contextPriors[outcome.strategyId] = newPrior;
  newContextual.set(contextHash, contextPriors);
  
  return {
    global: priors.global,
    contextual: newContextual,
  };
}
```

---

## 6. Effective cost computation

### 6.1 Cost model

```ts
export interface StrategyCosts {
  baseCost: number;      // Intrinsic cost of strategy
  availabilityPenalty: number;  // Penalty for low availability
  priorBonus: number;    // Bonus for high prior
}

export function computeEffectiveCost(
  family: StrategyFamily,
  availability: number,
  prior: number
): number {
  const baseCost = getBaseCost(family);
  
  // Low availability = high penalty
  const availabilityPenalty = availability < 0.1 ? 1000 : (1 - availability) * 10;
  
  // High prior = lower cost
  const priorBonus = prior * 5;
  
  return baseCost + availabilityPenalty - priorBonus;
}

function getBaseCost(family: StrategyFamily): number {
  switch (family.id) {
    case 'iron_mine_smelt': return 10;  // Reliable but time-consuming
    case 'iron_trade': return 5;        // Fast if available
    case 'iron_loot': return 3;         // Cheapest if known
    case 'iron_salvage': return 8;      // Moderate
    default: return 10;
  }
}
```

---

## 7. Execution reporting

### 7.1 Outcome tracking

```ts
// packages/planning/src/strategies/execution-tracking.ts

export interface StrategyExecutionRecord {
  strategyId: string;
  context: ContextKey;
  startTick: number;
  endTick: number;
  success: boolean;
  itemsAcquired: number;
  failureReason?: string;
}

export function reportStrategyOutcome(
  record: StrategyExecutionRecord,
  priors: StrategyPriors
): StrategyPriors {
  const outcome: ExecutionOutcome = {
    strategyId: record.strategyId,
    context: record.context,
    success: record.success,
    cost: record.endTick - record.startTick,
    expectedCost: getExpectedCost(record.strategyId),
  };
  
  return updatePrior(priors, outcome);
}
```

---

## 8. DO and DO NOT

**DO:**
- **DO** model multiple strategies for the same goal.
- **DO** use availability flags from real world state.
- **DO** learn priors from execution outcomes, not plan success.
- **DO** use context (biome, area type) in prior storage.
- **DO** bound priors to prevent over-fitting.

**DO NOT:**
- **DO NOT** use global priors only (context matters).
- **DO NOT** update priors on plan generation (only execution).
- **DO NOT** allow unavailable strategies to be selected.
- **DO NOT** let priors drift to extremes (0 or 1).

---

## 9. Certification tests

### 9.1 Strategy availability

```ts
describe('Strategy availability', () => {
  it('disables strategies with no availability', () => {
    const worldState = createWorldState({ villager_nearby: false });
    const selections = selectStrategy({ item: 'iron_ingot', count: 1 }, worldState, defaultPriors);
    
    const tradeStrategy = selections.find(s => s.strategyId === 'iron_trade');
    expect(tradeStrategy?.availabilityScore).toBe(0);
    expect(tradeStrategy?.effectiveCost).toBeGreaterThan(100);  // Effectively disabled
  });
});
```

### 9.2 Prior learning

```ts
describe('Strategy prior learning', () => {
  it('boosts prior on successful execution', () => {
    const initialPriors = createDefaultPriors();
    const initialPrior = getPrior('iron_trade', { biome: 'plains', areaType: 'village' }, initialPriors);
    
    const updatedPriors = reportStrategyOutcome({
      strategyId: 'iron_trade',
      context: { biome: 'plains', areaType: 'village' },
      startTick: 0,
      endTick: 100,
      success: true,
      itemsAcquired: 10,
    }, initialPriors);
    
    const newPrior = getPrior('iron_trade', { biome: 'plains', areaType: 'village' }, updatedPriors);
    expect(newPrior).toBeGreaterThan(initialPrior);
  });
});
```

---

## 11. Definition of "done"

### Core boundary criteria

- **Multiple strategies:** Solver considers alternatives for same goal.
- **Availability-conditioned:** Unavailable strategies disabled.
- **Context-aware priors:** Priors vary by biome/area.
- **Learning on execution only:** Priors shift only from execution outcomes.
- **Bounded priors:** Priors in [0.05, 0.95].

### Acceptance checks (4 pivots)

All 4 pivot acceptance checks must pass.

---

## 11. Cross-references

- **Implementation plan**: `RIG_D_MULTI_STRATEGY_PLAN.md`
- **Rig A-C**: Foundation layers
- **Capability primitives**: `capability-primitives.md` (P4)
- **Sterling domains**: `sterling-minecraft-domains.md` (Rig D section)
