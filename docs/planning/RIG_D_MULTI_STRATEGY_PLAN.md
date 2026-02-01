# Rig D: Multi-Strategy Acquisition Implementation Plan

**Primitive**: P4 — Multi-strategy acquisition (alternative methods, different failure modes)

**Status**: Planned (Track 3, after A-C are solid)

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

## 7. Order of work (suggested)

1. **Define strategy families** for iron acquisition (mine, trade, loot, salvage).
2. **Add availability predicates** to world state.
3. **Implement strategy priors** in Sterling.
4. **Wire execution reporting** to update strategy priors.
5. **Add context awareness** (biome, area type).
6. **Certification tests**: strategies chosen by availability; learning improves selection.

---

## 8. Dependencies and risks

- **Rig A-C**: Builds on operators, legality, and temporal modeling.
- **Availability accuracy**: Bot must provide accurate availability info.
- **Prior drift**: Learning can over-specialize if context isn't captured.
- **Strategy explosion**: Too many fine-grained strategies bloat search space.

---

## 9. Definition of "done"

- **Multiple strategies available**: Solver considers alternatives for same goal.
- **Availability-conditioned**: Unavailable strategies are not proposed.
- **Learning works**: Priors shift based on execution outcomes.
- **Context-aware**: Priors are context-sensitive, not global.
- **Tests**: Strategy selection adapts to availability; failures update priors.

---

## 10. Cross-references

- **Companion approach**: `RIG_D_MULTI_STRATEGY_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P4)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig D section)
- **Rig A-C**: Foundation for operators, legality, temporal
