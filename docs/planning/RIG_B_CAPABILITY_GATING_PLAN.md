# Rig B: Capability Gating and Legality Implementation Plan

**Primitive**: P2 — Capability gating and legality (what actions are permitted)

**Status**: Planned (natural next after Rig A certification)

---

## 1. Target invariant (critical boundary)

**"Sterling never proposes an illegal operator; legality is fail-closed."**

The system must:
- Model capabilities as explicit state (not inferred ad hoc)
- Enable/disable operators based on capability predicates
- Reject any plan containing illegal operators
- Reason about acquiring capabilities as first-class subgoals

**What this rig proves**: Sterling can enforce permissioned operations with fail-closed legality.

---

## 2. Formal signature

- **State includes capability set**: `can_mine_stone`, `can_mine_iron`, `has_furnace`, etc.
- **Operators enabled/disabled by capability predicates**: Preconditions reference capabilities
- **Monotone or partially monotone progression**: Capabilities are acquired, rarely lost
- **Legality checks are fail-closed**: If legality cannot be proven, operator is illegal

---

## 3. Problem being solved

### 3.1 Current state (no capability gating)

Without capability gating:
- Planner can propose "mine iron ore" when bot has wooden pickaxe (will fail at execution)
- No explicit model of tool tiers or station requirements
- Execution failures are blamed on "world state" rather than "capability violation"

### 3.2 With capability gating

With proper capability gating:
- Planner knows iron ore requires stone+ tier tool
- Capability acquisition becomes a subgoal: "need iron pickaxe → need iron ingot → need furnace + iron ore"
- Illegal operators are rejected at plan time, not execution time

---

## 4. What to investigate before implementing

| Step | Location | What to verify |
|------|----------|----------------|
| Rule building | `packages/planning/src/sterling/minecraft-crafting-rules.ts` | addMineRule; where to add requiredCapabilities |
| Rule types | `packages/planning/src/sterling/minecraft-crafting-types.ts` | MinecraftCraftingRule; extend with requiredCapabilities |
| Solver call | `packages/planning/src/sterling/minecraft-crafting-solver.ts` | Where rules are sent to Sterling; pre-filter point |
| Inventory/placement | task-integration | getInventoryForSterling; placed stations source |

**Outcome:** Confirm rule shape extensibility; where to filter before Sterling; capability derivation data source.

---

## 5. What to implement / change

### 5.1 Capability state representation

**Location**: `packages/planning/src/capabilities/`

- Define capability atoms: `can_mine_wood`, `can_mine_stone`, `can_mine_iron`, `can_mine_diamond`, etc.
- Derive capabilities from inventory: "has stone pickaxe → can_mine_iron"
- Capability set is part of planning state, canonically hashed

### 5.2 Operator legality predicates

- Each operator specifies required capabilities
- Legality function: `isLegal(operator, state) → boolean`
- Fail-closed: if any capability check fails, operator is illegal

### 5.3 Capability acquisition operators

- Define operators that grant capabilities: "craft stone pickaxe → grants can_mine_iron"
- These become first-class subgoals when needed capabilities are missing

### 5.4 Sterling integration

- **No Sterling changes.** Legality is enforced in conscious-bot: filter rules before sending; validate plan after return.
- Sterling receives only legal rules; search semantics unchanged.

---

## 6. Where (summary)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Capability atoms | `planning/src/capabilities/` | Define capability vocabulary |
| Capability derivation | `planning/src/capabilities/` | Derive from inventory/stations |
| Rule capability tagging | `planning/src/sterling/` + `capabilities/rule-capability-map.ts` | Tag rules with requiredCapabilities |
| Rule filtering (legality) | `planning/src/sterling/minecraft-crafting-solver.ts` | Filter rules before Sterling; fail-closed |
| Post-solve validation | Same solver | Validate returned plan steps against capabilities |
| Acquisition subgoals | `planning/src/capabilities/` | Generate when no legal rules for goal |

**Note:** Legality is enforced in conscious-bot (pre-filter + post-validate), not in Sterling. Sterling receives only legal rules. See companion approach for conscious-bot vs Sterling split.

---

## 7. Order of work (suggested)

1. **Define capability vocabulary** for Minecraft tool tiers and stations.
2. **Implement capability derivation** from inventory state.
3. **Add capability preconditions** to existing crafting operators.
4. **Add legality check** in Sterling search (fail-closed).
5. **Add acquisition operators** that grant capabilities.
6. **Certification tests**: illegal operators never proposed; capability subgoals work.

---

## 8. Dependencies and risks

- **Rig A certification**: Builds on deterministic operator semantics.
- **Capability explosion**: Too many fine-grained capabilities can bloat state space.
- **Derivation correctness**: Capability derivation must be deterministic and complete.
- **Monotonicity assumption**: Some capabilities can be lost (tool breaks); model carefully.

---

## 9. Definition of "done"

- **No illegal operators**: Search never expands illegal transitions; no illegal operators in output plans.
- **Fail-closed**: Any operator with unverifiable legality is treated as illegal.
- **Subgoal reasoning**: Planner acquires missing capabilities as subgoals.
- **Determinism**: Same state → same capability set → same legality decisions.
- **Tests**: Adversarial operators (claim diamond mining with wooden tier) are rejected.

---

## 10. Cross-references

- **Companion approach**: `RIG_B_CAPABILITY_GATING_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P2)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig B section)
- **Rig A**: Foundation for operator semantics
