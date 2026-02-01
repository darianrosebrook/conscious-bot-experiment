# Rig K: Irreversibility and Commitment Planning Implementation Plan

**Primitive**: P13 — Irreversibility and commitment planning

**Status**: Planned (Track 3)

---

## 1. Target invariant (critical boundary)

**"Sterling avoids premature irreversible steps; it sequences 'verify before commit' actions."**

The system must:
- Model irreversible actions with large rollback cost
- Include option value in objective (preserve flexibility)
- Delay commitment until evidence threshold is met
- Encode one-way doors as constraints

**What this rig proves**: Sterling can reason about commitment and preserve optionality.

---

## 2. Formal signature

- **Some actions are irreversible**: trade locks, resource consumption, structure placement
- **Large rollback cost**: undoing is expensive or impossible
- **Objective includes option value**: flexibility has worth
- **Constraints encode one-way doors**: "once locked, cannot reroll"

---

## 3. Problem being solved

### 3.1 Current state (no commitment modeling)

Without commitment modeling:
- Planner treats all actions as equally reversible
- Premature trade locks waste villager potential
- No "verify before commit" sequencing

### 3.2 With commitment modeling

With proper commitment modeling:
- Planner knows "lock trade" is irreversible
- Verification steps precede commitments: "check trade is good → then lock"
- Option value preserved: "keep villager unlocked while exploring trades"

---

## 4. What to investigate before implementing

| Step | Location | What to verify |
|------|----------|----------------|
| Villager/trade flow | minecraft-interface, planning | Where villager interaction happens; trade lock semantics |
| Operator definitions | Sterling crafting/tool domains | Operator shape; where to add irreversibility tags |
| Plan step order | Sterling solver | Step ordering; where verification-before-commit would be enforced |
| Execution reporting | task-integration, reactive-executor | Step success/failure; where commitment is confirmed |

**Investigation outcome (verified 2025-01-31):** No irreversibility modeling. Villager/trade: `action-translator.ts` (minecraft-interface) has villager/trade logic; no commitment semantics or verification-before-commit. Operators: `MinecraftCraftingRule`, `MinecraftSolveStep` (minecraft-crafting-types.ts) have no `irreversible` tag. Plan step order: Sterling returns ordered steps; no verification-before-commit enforcement. Execution: reactive-executor executes in order; no "check then commit" pattern. Commitment modeling would require operator metadata (`irreversible: boolean`), verification operators, option value in objective, and one-way constraints in domain state.

### 4a. Current code anchors (verified 2025-01-31)

| File | Line(s) | What |
|------|---------|------|
| `packages/planning/src/sterling/minecraft-crafting-types.ts` | 31-48, 64-70 | `MinecraftCraftingRule`, `MinecraftSolveStep`: no `irreversible` or `commitmentCost`. |
| `packages/minecraft-interface/src/action-translator.ts` | villager/trade | Villager interaction; no verification-before-commit or option value. |
| `packages/planning/src/reactive-executor/reactive-executor.ts` | step execution | Executes steps in order; no verification/commit sequencing. |

**Gap:** No irreversibility tags, option value, verification operators, or commitment constraints. Rig K would extend operator metadata and domain state.

---

## 5. What to implement / change

### 5.1 Irreversibility model

**Location**: Sterling domain or `packages/planning/src/commitment/`

- Tag operators as reversible/irreversible
- Irreversible operators have high "commitment cost" in objective
- One-way constraints: state transitions that cannot be undone

### 5.2 Option value

- Option value = value of keeping alternatives open
- Computed as expected value of unexplored branches
- Irreversible actions sacrifice option value

### 5.3 Verification sequencing

- Define verification operators: "check_trade", "preview_result"
- Verification precedes commitment: enforce ordering
- Threshold: only commit when verification confidence > threshold

### 5.4 Commitment constraints

- One-way door constraints in domain model
- State includes commitment flags: "trade_locked", "villager_leveled"
- Planner cannot undo committed states

---

## 6. Where (summary)

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Irreversibility tags | Operator metadata | Mark irreversible actions |
| Option value | Objective function | Include flexibility value |
| Verification operators | Domain rules | Check before commit |
| Commitment constraints | Domain state | Track irreversible state changes |

---

## 7. Order of work (suggested)

1. **Tag operators** as reversible/irreversible.
2. **Add commitment cost** to objective function.
3. **Define verification operators** for villager trading.
4. **Implement one-way constraints** in domain.
5. **Add option value calculation** (simplified).
6. **Certification tests**: verification precedes commitment; premature locks avoided.

---

## 8. Dependencies and risks

- **Rig A-H**: Builds on previous capabilities.
- **Option value complexity**: Full option value calculation is expensive.
- **Verification cost**: Too much verification slows progress.
- **Threshold tuning**: When is "enough" verification?

---

## 9. Definition of "done"

- **No premature commits**: Irreversible actions follow verification.
- **Option value in objective**: Flexibility is valued.
- **One-way constraints work**: Committed states cannot be undone.
- **Verification sequencing**: "Check then commit" patterns appear.
- **Tests**: Villager trading shows verification; premature locks prevented.

---

## 10. Cross-references

- **Companion approach**: `RIG_K_IRREVERSIBILITY_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P13)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig K section)
