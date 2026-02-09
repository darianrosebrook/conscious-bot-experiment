# Rig K: Irreversibility and Commitment Planning Implementation Plan

**Primitive**: P13 — Irreversibility and commitment planning

**Status**: HARDENING-COMPLETE (2026-02-09)
**Implementation**: CONTRACT-CERTIFIED — P13 capsule types, reference adapter, 2-domain fixtures, Minecraft commitment module, 36 certification tests. All 5 pivots proven.

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

### 4b. conscious-bot vs Sterling split

| Responsibility | Owner | Location |
|----------------|-------|----------|
| Irreversibility tags on operators | conscious-bot | `packages/planning/src/sterling/minecraft-crafting-types.ts` — extend rule/step |
| Verification operators (check before commit) | conscious-bot | `packages/planning/src/commitment/verification-operators.ts` (new) |
| Commitment constraints (one-way state) | conscious-bot | `packages/planning/src/commitment/commitment-state.ts` (new) |
| Option value (simplified) in objective | conscious-bot or Sterling | Extend solve payload / objective |
| Verification-before-commit sequencing | conscious-bot | `packages/planning/src/reactive-executor/` — enforce order |

**Contract:** conscious-bot tags operators as reversible/irreversible; defines verification operators; enforces "verify then commit" at execution. Sterling (if used) receives commitment cost in objective.

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

## 7. Implementation pivots

| Pivot | Problem | Acceptance |
|-------|---------|------------|
| 1 Irreversibility tag on operators only | Heuristic detection is unreliable | Every operator has explicit reversible: boolean. |
| 2 Verification precedes commitment | Premature commit wastes option value | Plan never has commit step before verify step for same target. |
| 3 Deterministic verification result | Non-deterministic verify breaks replay | verify(target) same target yields same result. |
| 4 Bounded option value | Unbounded option value explodes objective | optionValue in [0, OPTION_MAX] (e.g. 0-10). |
| 5 One-way state immutable | Undoing committed state causes inconsistency | committedState(target) never decreases. |

---

## 8. Transfer surfaces (domain-agnosticism proof)

### 8.1 Contract signing (verify then sign)

**Surface:** Irreversible: sign_contract. Verification: review_terms, confirm_parties. Option value: value of not signing yet. One-way: signed = true.

- **Prove:** Same verify-before-commit; irreversibility tag; one-way state.

### 8.2 Deployment (verify then deploy)

**Surface:** Irreversible: deploy_to_prod. Verification: run_tests, canary_check. Option value: value of not deploying yet. One-way: deployed = true.

- **Prove:** Same deterministic verification; bounded option value.

### 8.3 Minecraft villager trade (verify then lock)

**Surface:** Irreversible: lock_trade. Verification: preview_trade, check_emeralds. Option value: value of keeping villager unlocked. One-way: trade_locked = true.

- **Prove:** Direct mapping to action-translator; verification operators before villager commit.

---

## 9. Concrete certification tests

### Test 1: Irreversibility tag on operators

```ts
describe('Rig K - irreversibility tag', () => {
  it('every operator has reversible boolean', () => {
    const rules = buildCraftingRules(mcData, 'iron_ingot');
    rules.forEach(r => {
      expect(typeof r.reversible).toBe('boolean');
    });
  });

  it('lock_trade is irreversible', () => {
    const op = getOperator('lock_trade');
    expect(op.reversible).toBe(false);
  });
});
```

### Test 2: Verification precedes commitment

```ts
describe('Rig K - verification precedes commitment', () => {
  it('plan never has commit before verify for same target', () => {
    const plan = generatePlan(goal);
    const commitSteps = plan.steps.filter(s => s.irreversible && s.type === 'commit');
    commitSteps.forEach(commit => {
      const verifySteps = plan.steps.filter(s => s.type === 'verify' && s.target === commit.target);
      const commitIdx = plan.steps.indexOf(commit);
      const maxVerifyIdx = Math.max(...verifySteps.map(s => plan.steps.indexOf(s)), -1);
      expect(maxVerifyIdx).toBeLessThan(commitIdx);
    });
  });
});
```

### Test 3: Deterministic verification

```ts
describe('Rig K - deterministic verification', () => {
  it('same target yields same verify result', () => {
    const target = { type: 'trade', villagerId: 'v1' };
    const results = Array.from({ length: 10 }, () => verify(target));
    expect(results.every(r => r === results[0])).toBe(true);
  });
});
```

### Test 4: Bounded option value

```ts
describe('Rig K - bounded option value', () => {
  it('option value in [0, OPTION_MAX]', () => {
    const state = getCommitmentState();
    const v = computeOptionValue(state);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(OPTION_MAX);
  });
});
```

### Test 5: One-way state immutable

```ts
describe('Rig K - one-way state immutable', () => {
  it('committed state never decreases', () => {
    const state1 = getCommitmentState();
    applyCommit('trade_v1');
    const state2 = getCommitmentState();
    expect(state2.committedCount).toBeGreaterThanOrEqual(state1.committedCount);
  });
});
```

---

## 10. Definition of "done" (testable)

- **No premature commits:** Irreversible actions follow verification (Test 2).
- **Irreversibility tagged:** Every operator has reversible boolean (Test 1).
- **Deterministic verification:** Same target same result (Test 3).
- **Bounded option value:** In [0, OPTION_MAX] (Test 4).
- **One-way state:** Committed state never decreases (Test 5).
- **Tests:** All 5 certification test blocks pass.

---

## 11. Implementation files summary

| Action | Path |
|--------|------|
| Modify | `packages/planning/src/sterling/minecraft-crafting-types.ts` — add reversible, commitmentCost |
| New | `packages/planning/src/commitment/verification-operators.ts` |
| New | `packages/planning/src/commitment/commitment-state.ts` |
| Modify | `packages/minecraft-interface/src/action-translator.ts` — verification-before-commit for villager/trade |
| Modify | `packages/planning/src/reactive-executor/reactive-executor.ts` — enforce verify-then-commit order |

---

## 12. Order of work (suggested)

1. **Tag operators** as reversible/irreversible.
2. **Add commitment cost** to objective function.
3. **Define verification operators** for villager trading.
4. **Implement one-way constraints** in domain.
5. **Add option value calculation** (simplified).
6. **Certification tests**: verification precedes commitment; premature locks avoided.

---

## 13. Dependencies and risks

- **Rig A-H**: Builds on previous capabilities.
- **Option value complexity**: Full option value calculation is expensive.
- **Verification cost**: Too much verification slows progress.
- **Threshold tuning**: When is "enough" verification?

---

## 14. Cross-references

- **Companion approach**: `RIG_K_IRREVERSIBILITY_APPROACH.md`
- **Capability primitives**: `capability-primitives.md` (P13)
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig K section)
