# Rig D: Multi-Strategy Acquisition Implementation Plan

**Primitive**: P4 — Multi-strategy acquisition (alternative methods, different failure modes)

**Status**: ENRICHED (2026-01-31)
**Implementation**: Not started — spec only

---

## 1. Target invariant (critical boundary)

**"Multiple strategies exist for the same goal; the system chooses based on availability and learns from execution."**

The system must:
- Model multiple operator families that achieve the same subgoal
- Choose strategies based on world-conditioned availability
- Learn "which strategy works here" from execution outcomes
- Handle different failure modes per strategy

**What this rig proves**: Sterling can reason about strategic alternatives, not just sequential steps.

---

## 2. Formal signature

- **Multiple operator families reach same subgoal**: mine+smelt vs trade vs loot vs salvage
- **Costs differ per strategy**: time, risk, resource burn
- **Availability predicates from external world**: "chest nearby", "villager available"
- **Learning updates strategy priors**: "trading works well in this area"

---

## 3. Problem being solved

### 3.1 Current state (single strategy)

Without multi-strategy:
- Planner always uses mine+smelt for iron, even when trading is faster
- No model of alternative acquisition methods
- Execution failures don't inform strategy selection

### 3.2 With multi-strategy

With proper multi-strategy:
- Goal "acquire 10 iron ingots" considers: mine+smelt, loot chest, trade villager, salvage gear
- World state informs availability: "villager nearby with iron trade = trade strategy available"
- Execution outcomes update priors: "trading failed 3x → lower trade prior"

---

## 4. What to investigate before implementing

| Step | Location | What to verify |
|------|----------|----------------|
| Rule building | `packages/planning/src/sterling/minecraft-crafting-rules.ts` | How rules are built from mcData; where to inject strategy-specific rule sets |
| Solve flow | `packages/planning/src/sterling/minecraft-crafting-solver.ts` | Single goal/solve path; where strategy selection would gate rule set |
| World state | `packages/planning/src/task-integration.ts` | `getInventoryForSterling()`; where availability (villager, chest) would be fetched |
| Execution reporting | `packages/planning/src/` or minecraft-interface | Where step success/failure is reported; where to hook prior updates |

**Investigation outcome (verified 2025-01-31):** Single solve path exists. `buildCraftingRules(mcData, goalItem)` (minecraft-crafting-rules.ts:58) produces one rule set per goal; no strategy families. `solveCraftingGoal` (minecraft-crafting-solver.ts:54-63) calls `buildCraftingRules` and passes rules to Sterling; no availability filtering. World state: `sterling-planner.fetchBotContext()` (sterling-planner.ts:129-145) returns inventory + nearbyBlocks; no villager_trade_available or chest_known. Execution reporting: task-integration and reactive-executor emit step events; no strategy-prior update hook. Strategy selection would gate before `sterlingService.solve()` (minecraft-crafting-solver.ts:98); availability would extend fetchBotContext or add availability model.

### 4a. Current code anchors (verified 2025-01-31)

| File | Line(s) | What |
|------|---------|------|
| `packages/planning/src/sterling/minecraft-crafting-rules.ts` | 58, 73-80, 194 | `buildCraftingRules(mcData, goalItem)`: single rule set; `addMineRule`; no strategy families. |
| `packages/planning/src/sterling/minecraft-crafting-solver.ts` | 54-63, 98 | `solveCraftingGoal()`: builds rules, sends to Sterling; no strategy selection or availability filter. |
| `packages/planning/src/task-integration/sterling-planner.ts` | 129-145, 266 | `fetchBotContext()`: inventory + nearbyBlocks; `generateStepsFromSterling()` calls craftingSolver; no availability. |
| `packages/planning/src/sterling/sterling-reasoning-service.ts` | solve() | Sterling receives rules; no strategy priors. |
| `packages/planning/src/reactive-executor/reactive-executor.ts` | step execution | Step success/failure; no prior-update hook. |

**Gap:** No strategy families, availability predicates, or strategy priors. Single rule set per goal; no alternative acquisition methods (trade, loot, salvage).

### 4b. conscious-bot vs Sterling split

| Responsibility | Owner | Location |
|----------------|-------|----------|
| Strategy families, mapping to operator sets | conscious-bot | `packages/planning/src/strategies/strategy-families.ts` (new) |
| Availability extraction from world state | conscious-bot | `packages/planning/src/strategies/availability.ts` (new) |
| Strategy selection (availability + priors); filter rules | conscious-bot | `packages/planning/src/strategies/strategy-selector.ts` (new) |
| Prior storage and updates from execution only | conscious-bot | `packages/planning/src/strategies/strategy-priors.ts` (new) |
| Solve with pre-filtered rules | Sterling | Receives rules for selected strategy only |

**Contract:** conscious-bot selects strategy, fetches rules for that strategy, sends to Sterling. Prior updates happen on execution outcome only, not on plan success.

---

## 5. What to implement / change

### 5.1 Strategy representation

**Location**: `packages/planning/src/strategies/` or Sterling domain

- Define strategy families: `mine_smelt`, `trade`, `loot`, `salvage`
- Each strategy has operators with shared subgoal effect
- Strategies have different cost profiles and availability predicates

### 5.2 Availability model

- World state includes availability flags: `villager_trade_available`, `chest_known`, etc.
- Bot provides availability info at solve time
- Strategies are disabled when availability predicates fail

### 5.3 Strategy priors

- Each strategy has a prior (learned preference)
- Priors are updated based on execution outcomes
- Higher prior → lower effective cost → preferred by search

### 5.4 Execution-grounded learning

- On strategy success: boost prior
- On strategy failure: penalize prior
- Context-aware: "trade prior in village biome" vs "trade prior in wilderness"

---

## 6. Where (summary)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Strategy families | Domain rules | Define alternative operators |
| Availability model | World state | Track what strategies are available |
| Strategy priors | Sterling learning | Learned preferences per strategy |
| Execution updates | Planning integration | Report outcomes, update priors |

---

## 7. Implementation pivots

See `RIG_D_MULTI_STRATEGY_APPROACH.md` section 3 for full pivot text. Summary:

| Pivot | Problem | Acceptance |
|-------|---------|------------|
| 1 Prior updates only on execution | Plan success would reinforce hypothetical success | Prior unchanged by plan; only execution updates. |
| 2 Context-keyed priors | Global priors overfit to one biome | Priors differ by biome/area (e.g. plains:village vs cave:mine). |
| 3 Availability from real world state | Fake/stale flags cause wrong selection | Availability from `extractAvailability(worldState)`; no mock flags in production. |
| 4 Bounded priors | Priors drift to 0 or 1 | Prior in [PRIOR_MIN, PRIOR_MAX] (e.g. 0.05, 0.95). |

---

## 8. Transfer surfaces (domain-agnosticism proof)

### 8.1 Supply chain (source selection)

**Surface:** Multiple suppliers for same part; availability (lead time, stock); learning which supplier performs in which region.

- **Strategies:** domestic, import, spot market, salvage
- **Availability:** lead time, stock level, quality certification
- **Priors:** per-region, per-part; updated on delivery success/failure
- **Prove:** Same selection semantics, bounded priors, context-keyed learning

### 8.2 Robotics (tool selection)

**Surface:** Multiple tools achieve same task; availability (tool mounted, calibration); learning which tool works in which workspace.

- **Strategies:** tool_A, tool_B, manual
- **Availability:** tool present, calibrated, workspace clearance
- **Priors:** per-workspace; updated on task success/failure
- **Prove:** Availability-conditioned selection; execution-only prior updates

### 8.3 Minecraft (iron acquisition)

**Surface:** mine_smelt, trade, loot, salvage; villager_nearby, chest_known, ore_visible; biome/area priors.

- **Prove:** Direct mapping to current code anchors; strategy selection before `sterlingService.solve()`.

---

## 9. Concrete certification tests

### Test 1: Strategy availability

```ts
describe('Rig D - strategy availability', () => {
  it('disables strategies with no availability', () => {
    const worldState = createWorldState({ villager_nearby: false });
    const selections = selectStrategy({ item: 'iron_ingot', count: 1 }, worldState, defaultPriors);
    const tradeStrategy = selections.find(s => s.strategyId === 'iron_trade');
    expect(tradeStrategy?.availabilityScore).toBe(0);
    expect(tradeStrategy?.effectiveCost).toBeGreaterThan(100);
  });
});
```

### Test 2: Prior learning on execution only

```ts
describe('Rig D - prior learning on execution only', () => {
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

  it('does not change prior after plan generation', () => {
    const priors = createDefaultPriors();
    const before = getPrior('iron_trade', { biome: 'plains', areaType: 'village' }, priors);
    selectStrategy({ item: 'iron_ingot', count: 1 }, worldState, priors);
    const after = getPrior('iron_trade', { biome: 'plains', areaType: 'village' }, priors);
    expect(after).toBe(before);
  });
});
```

### Test 3: Bounded priors

```ts
describe('Rig D - bounded priors', () => {
  it('clamps priors to [PRIOR_MIN, PRIOR_MAX]', () => {
    let priors = createDefaultPriors();
    for (let i = 0; i < 50; i++) {
      priors = reportStrategyOutcome({ strategyId: 'iron_trade', context: { biome: 'plains', areaType: 'village' }, startTick: 0, endTick: 10, success: false, itemsAcquired: 0 }, priors);
    }
    const p = getPrior('iron_trade', { biome: 'plains', areaType: 'village' }, priors);
    expect(p).toBeGreaterThanOrEqual(PRIOR_MIN);
    expect(p).toBeLessThanOrEqual(PRIOR_MAX);
  });
});
```

### Test 4: Context-keyed priors

```ts
describe('Rig D - context-keyed priors', () => {
  it('allows different priors per context', () => {
    let priors = createDefaultPriors();
    priors = reportStrategyOutcome({ strategyId: 'iron_trade', context: { biome: 'plains', areaType: 'village' }, startTick: 0, endTick: 10, success: true, itemsAcquired: 10 }, priors);
    priors = reportStrategyOutcome({ strategyId: 'iron_trade', context: { biome: 'cave', areaType: 'mine' }, startTick: 0, endTick: 100, success: false, itemsAcquired: 0 }, priors);
    const villagePrior = getPrior('iron_trade', { biome: 'plains', areaType: 'village' }, priors);
    const cavePrior = getPrior('iron_trade', { biome: 'cave', areaType: 'mine' }, priors);
    expect(villagePrior).toBeGreaterThan(cavePrior);
  });
});
```

### Test 5: Availability from world state

```ts
describe('Rig D - availability from world state', () => {
  it('villager_nearby true only when entity in world state', () => {
    const withVillager = createWorldState({ nearbyEntities: [{ type: 'villager' }] });
    const withoutVillager = createWorldState({ nearbyEntities: [] });
    expect(extractAvailability(withVillager).villager_nearby).toBe(true);
    expect(extractAvailability(withoutVillager).villager_nearby).toBe(false);
  });
});
```

---

## 10. Definition of "done" (testable)

- **Multiple strategies available:** Solver considers alternatives for same goal.
- **Availability-conditioned:** Unavailable strategies are not proposed.
- **Learning on execution only:** Priors shift only from execution outcomes (Tests 2, 4).
- **Context-aware:** Priors are context-sensitive, not global (Test 4).
- **Bounded priors:** Priors in [PRIOR_MIN, PRIOR_MAX] (Test 3).
- **Tests:** All 5 certification test blocks pass; pivot acceptance table satisfied.

---

## 11. Implementation files summary

| Action | Path |
|--------|------|
| New | `packages/planning/src/strategies/strategy-families.ts` |
| New | `packages/planning/src/strategies/availability.ts` |
| New | `packages/planning/src/strategies/strategy-priors.ts` |
| New | `packages/planning/src/strategies/execution-tracking.ts` |
| Modify | `packages/planning/src/task-integration/sterling-planner.ts` — call strategy selector before solve |
| Modify | `packages/planning/src/sterling/minecraft-crafting-solver.ts` — accept pre-filtered rules |
| Modify | `packages/planning/src/reactive-executor/reactive-executor.ts` — report strategy outcome hook |

---

## 12. Order of work (suggested)

1. **Define strategy families** for iron acquisition (mine, trade, loot, salvage).
2. **Add availability predicates** to world state.
3. **Implement strategy priors** in Sterling.
4. **Wire execution reporting** to update strategy priors.
5. **Add context awareness** (biome, area type).
6. **Certification tests**: strategies chosen by availability; learning improves selection.

---

## 13. Dependencies and risks

- **Rig A-C**: Builds on operators, legality, and temporal modeling.
- **Availability accuracy**: Bot must provide accurate availability info.
- **Prior drift**: Learning can over-specialize if context isn't captured.
- **Strategy explosion**: Too many fine-grained strategies bloat search space.

---

## 14. Cross-references

- **Companion approach**: `RIG_D_MULTI_STRATEGY_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P4)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig D section)
- **Rig A-C**: Foundation for operators, legality, temporal
