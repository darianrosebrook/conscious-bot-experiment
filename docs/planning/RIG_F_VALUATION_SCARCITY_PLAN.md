# Rig F: Goal-Conditioned Valuation Under Scarcity Implementation Plan

**Primitive**: P6 — Goal-conditioned valuation under scarcity (keep/drop/allocate)

**Status**: Planned (Track 3)

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

**Outcome:** Confirm inventory/capacity data flow; where goal is available; where drop decisions and explanations are emitted.

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

## 7. Order of work (suggested)

1. **Add capacity fields** to world state (slots free, holdings).
2. **Define value function** with goal-conditioned multipliers.
3. **Add drop/store operators** to domain.
4. **Implement allocation logic** in search (prefer keeping high-value).
5. **Add explanation output** for drop decisions.
6. **Certification tests**: drops are optimal; goal changes shift values.

---

## 8. Dependencies and risks

- **Rig A-E**: Builds on operators, legality, temporal, strategies, hierarchy.
- **Value function complexity**: Too complex = hard to explain; too simple = poor decisions.
- **Goal representation**: Must have clear goal structure for value conditioning.
- **Learning drift**: Value estimates can drift if not grounded in execution.

---

## 9. Definition of "done"

- **Capacity-aware**: Planner knows when inventory is constrained.
- **Goal-conditioned values**: Same item has different value per goal.
- **Optimal drops**: Lowest-value items dropped first.
- **Explainable**: Every sacrifice includes rationale.
- **Tests**: Goal change shifts values; explanations are accurate.

---

## 10. Cross-references

- **Companion approach**: `RIG_F_VALUATION_SCARCITY_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P6)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig F section)
