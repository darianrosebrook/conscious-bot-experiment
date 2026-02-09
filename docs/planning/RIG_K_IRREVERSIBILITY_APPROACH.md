# Rig K: Irreversibility and Commitment Planning — Companion Approach

**Implementation**: HARDENING-COMPLETE (2026-02-09) — P13 capsule types, reference adapter, 2-domain fixtures, Minecraft commitment module, 36 certification tests

This companion document distills the implementation plan with design decisions, boundaries, and implementation construction constraints. Read alongside `RIG_K_IRREVERSIBILITY_PLAN.md`.

---

## 1. Executive summary

Rig K proves **Primitive 13** (Irreversibility and commitment planning) by implementing:

1. **Irreversible action modeling** (high rollback cost)
2. **Option value in objective** (flexibility has worth)
3. **Verification before commitment** sequencing
4. **One-way door constraints**

**Critical boundary**: Sterling avoids premature commits; verification precedes irreversible actions.

---

## 2. Implementation construction constraints (pivots)

### Pivot 1: Verification precedes commitment

**Problem:** Irreversible action executed without verification; bad trades locked.

**Pivot:** `enforceVerificationSequencing(plan)` rejects plans where irreversible step appears before required verification. Confidence threshold checked.

**Acceptance check:** Plan with lock_villager_trade before inspect_trade rejected.

---

### Pivot 2: Option value in cost

**Problem:** Commitment cost only; flexibility has no value; premature commits.

**Pivot:** `computeCommitmentCost()` includes `optionValueLoss` for irreversible actions. Objective = baseCost + commitmentPenalty + optionValueLoss.

**Acceptance check:** Irreversible action cost > reversible for same base cost.

---

### Pivot 3: One-way constraints structural

**Problem:** Committed state reversed by accident; planner "undoes" lock.

**Pivot:** `CommitmentState.blockedOperators` updated on commit; planner never proposes blocked operators.

**Acceptance check:** After lock_villager_trade, reroll operator not in valid set.

---

### Pivot 4: Confidence threshold enforced

**Problem:** Verification performed but threshold ignored; commit with low confidence.

**Pivot:** `canCommit(op, verificationState)` checks `getVerificationConfidence(op) >= requiredConfidence`.

**Acceptance check:** Confidence 0.5 with required 0.8 → commit rejected.

---

### Summary: Acceptance check table

| Pivot | Acceptance check |
|-------|------------------|
| 1 | Verification precedes commitment. |
| 2 | Option value in cost. |
| 3 | Blocked operators not proposed. |
| 4 | Confidence threshold enforced. |

---

## 3. Primary design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Irreversibility tag | Operator metadata | Clear, inspectable |
| Commitment cost | Additive objective term | Simple integration |
| Verification threshold | Configurable confidence | Context-dependent |
| Option value | Simplified (branch count) | Tractable |
| Domain | Villager trading first | Clear irreversibility |

---

## 3. Irreversibility model

### 3.1 Operator tagging

```ts
// packages/planning/src/commitment/irreversibility-model.ts

export type ReversibilityClass = 
  | 'fully_reversible'     // Can undo with no cost
  | 'costly_reversible'    // Can undo but expensive
  | 'irreversible';        // Cannot undo

export interface IrreversibilityTag {
  operatorId: string;
  reversibility: ReversibilityClass;
  rollbackCost: number;      // Cost to undo (Infinity for irreversible)
  commitmentCost: number;    // Extra cost in objective for taking this action
  optionValueLost: number;   // Value of foreclosed alternatives
}

export const IRREVERSIBILITY_TAGS: IrreversibilityTag[] = [
  // Fully reversible
  { operatorId: 'pick_up_item', reversibility: 'fully_reversible', rollbackCost: 0, commitmentCost: 0, optionValueLost: 0 },
  { operatorId: 'craft_item', reversibility: 'fully_reversible', rollbackCost: 0, commitmentCost: 0, optionValueLost: 0 },
  
  // Costly reversible
  { operatorId: 'place_block', reversibility: 'costly_reversible', rollbackCost: 5, commitmentCost: 1, optionValueLost: 0 },
  { operatorId: 'enchant_item', reversibility: 'costly_reversible', rollbackCost: 50, commitmentCost: 10, optionValueLost: 5 },
  
  // Irreversible
  { operatorId: 'lock_villager_trade', reversibility: 'irreversible', rollbackCost: Infinity, commitmentCost: 20, optionValueLost: 50 },
  { operatorId: 'level_up_villager', reversibility: 'irreversible', rollbackCost: Infinity, commitmentCost: 15, optionValueLost: 30 },
  { operatorId: 'consume_totem', reversibility: 'irreversible', rollbackCost: Infinity, commitmentCost: 30, optionValueLost: 10 },
  { operatorId: 'break_workstation', reversibility: 'irreversible', rollbackCost: Infinity, commitmentCost: 5, optionValueLost: 20 },
];

export function getIrreversibilityTag(operatorId: string): IrreversibilityTag {
  return IRREVERSIBILITY_TAGS.find(t => t.operatorId === operatorId) ?? {
    operatorId,
    reversibility: 'fully_reversible',
    rollbackCost: 0,
    commitmentCost: 0,
    optionValueLost: 0,
  };
}
```

---

## 4. Option value model

### 4.1 Option value calculation

```ts
// packages/planning/src/commitment/option-value.ts

export interface OptionValueState {
  availableOptions: string[];  // IDs of uncommitted choices
  lockedOptions: string[];     // IDs of committed choices
}

export function calculateOptionValue(state: OptionValueState): number {
  // Simplified: value = number of available options
  // More sophisticated: expected value of exploring options
  return state.availableOptions.length * 2;  // 2 points per open option
}

export function getOptionValueLoss(
  operatorId: string,
  currentState: OptionValueState
): number {
  const tag = getIrreversibilityTag(operatorId);
  
  if (tag.reversibility !== 'irreversible') {
    return 0;  // No option value lost for reversible actions
  }
  
  // Option value lost = foreclosed alternatives
  return tag.optionValueLost;
}
```

### 4.2 Objective with option value

```ts
export interface CommitmentCost {
  baseCost: number;
  commitmentPenalty: number;
  optionValueLoss: number;
  totalCost: number;
}

export function computeCommitmentCost(
  operator: Operator,
  state: PlanningState
): CommitmentCost {
  const tag = getIrreversibilityTag(operator.id);
  const baseCost = operator.cost;
  const commitmentPenalty = tag.commitmentCost;
  const optionValueLoss = getOptionValueLoss(operator.id, state.optionState);
  
  return {
    baseCost,
    commitmentPenalty,
    optionValueLoss,
    totalCost: baseCost + commitmentPenalty + optionValueLoss,
  };
}
```

---

## 5. Verification operators

### 5.1 Verification definitions

```ts
// packages/planning/src/commitment/verification-operators.ts

export interface VerificationOperator {
  id: string;
  name: string;
  verifies: string[];  // What operator IDs this verification enables
  cost: number;
  confidenceGain: number;  // How much confidence increases (0-1)
}

export const VERIFICATION_OPERATORS: VerificationOperator[] = [
  {
    id: 'inspect_villager_trade',
    name: 'Inspect villager trade offers',
    verifies: ['lock_villager_trade', 'level_up_villager'],
    cost: 2,
    confidenceGain: 0.3,
  },
  {
    id: 'preview_enchantment',
    name: 'Preview enchantment table options',
    verifies: ['enchant_item'],
    cost: 1,
    confidenceGain: 0.5,
  },
  {
    id: 'check_trade_value',
    name: 'Compare trade to known prices',
    verifies: ['lock_villager_trade'],
    cost: 3,
    confidenceGain: 0.4,
  },
];
```

### 5.2 Verification state

```ts
export interface VerificationState {
  verifiedOperators: Map<string, number>;  // operator_id → confidence (0-1)
  verificationsPerformed: string[];
}

export function getVerificationConfidence(
  operatorId: string,
  state: VerificationState
): number {
  return state.verifiedOperators.get(operatorId) ?? 0;
}

export function applyVerification(
  state: VerificationState,
  verificationId: string
): VerificationState {
  const verification = VERIFICATION_OPERATORS.find(v => v.id === verificationId);
  if (!verification) return state;
  
  const newVerified = new Map(state.verifiedOperators);
  for (const operatorId of verification.verifies) {
    const current = newVerified.get(operatorId) ?? 0;
    newVerified.set(operatorId, Math.min(1.0, current + verification.confidenceGain));
  }
  
  return {
    verifiedOperators: newVerified,
    verificationsPerformed: [...state.verificationsPerformed, verificationId],
  };
}
```

---

## 6. Commitment constraints

### 6.1 One-way door constraints

```ts
// packages/planning/src/commitment/commitment-constraints.ts

export interface CommitmentConstraint {
  operatorId: string;
  requiredVerificationConfidence: number;
  blocksOperators: string[];  // Operators that become unavailable after commit
}

export const COMMITMENT_CONSTRAINTS: CommitmentConstraint[] = [
  {
    operatorId: 'lock_villager_trade',
    requiredVerificationConfidence: 0.8,
    blocksOperators: ['reroll_villager_trade', 'break_workstation'],
  },
  {
    operatorId: 'level_up_villager',
    requiredVerificationConfidence: 0.7,
    blocksOperators: ['reroll_villager_trade'],
  },
];

export function canCommit(
  operatorId: string,
  verificationState: VerificationState
): { allowed: boolean; reason?: string } {
  const constraint = COMMITMENT_CONSTRAINTS.find(c => c.operatorId === operatorId);
  if (!constraint) return { allowed: true };
  
  const confidence = getVerificationConfidence(operatorId, verificationState);
  if (confidence < constraint.requiredVerificationConfidence) {
    return {
      allowed: false,
      reason: `Verification confidence ${confidence.toFixed(2)} < required ${constraint.requiredVerificationConfidence}`,
    };
  }
  
  return { allowed: true };
}
```

### 6.2 State after commitment

```ts
export interface CommitmentState {
  committedActions: string[];
  blockedOperators: Set<string>;
  optionState: OptionValueState;
}

export function applyCommitment(
  state: CommitmentState,
  operatorId: string
): CommitmentState {
  const constraint = COMMITMENT_CONSTRAINTS.find(c => c.operatorId === operatorId);
  
  const newBlocked = new Set(state.blockedOperators);
  if (constraint) {
    for (const blocked of constraint.blocksOperators) {
      newBlocked.add(blocked);
    }
  }
  
  return {
    committedActions: [...state.committedActions, operatorId],
    blockedOperators: newBlocked,
    optionState: {
      availableOptions: state.optionState.availableOptions.filter(o => !newBlocked.has(o)),
      lockedOptions: [...state.optionState.lockedOptions, operatorId],
    },
  };
}
```

---

## 7. Verification sequencing

### 7.1 Enforced ordering

```ts
export function enforceVerificationSequencing(
  plan: PlanStep[],
  verificationState: VerificationState
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  let currentVerification = verificationState;
  
  for (const step of plan) {
    const tag = getIrreversibilityTag(step.operator.id);
    
    if (tag.reversibility === 'irreversible') {
      const canDo = canCommit(step.operator.id, currentVerification);
      if (!canDo.allowed) {
        violations.push(`${step.operator.id}: ${canDo.reason}`);
      }
    }
    
    // Track verification steps
    if (isVerificationOperator(step.operator.id)) {
      currentVerification = applyVerification(currentVerification, step.operator.id);
    }
  }
  
  return { valid: violations.length === 0, violations };
}

function isVerificationOperator(operatorId: string): boolean {
  return VERIFICATION_OPERATORS.some(v => v.id === operatorId);
}
```

---

## 8. DO and DO NOT

**DO:**
- **DO** tag irreversible operators explicitly.
- **DO** include commitment cost in objective.
- **DO** require verification before irreversible actions.
- **DO** track blocked operators after commitment.
- **DO** calculate option value loss.

**DO NOT:**
- **DO NOT** treat irreversibility as just a cost (use constraints).
- **DO NOT** allow premature commits without verification.
- **DO NOT** let learned priors override verification requirements.
- **DO NOT** skip option value in objective.

---

## 9. Certification tests

### 9.1 Verification before commitment

```ts
describe('Verification sequencing', () => {
  it('requires verification before lock_villager_trade', () => {
    const plan = [
      { operator: { id: 'lock_villager_trade' } },  // No prior verification
    ];
    
    const result = enforceVerificationSequencing(plan, emptyVerificationState());
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toContain('Verification confidence');
  });
  
  it('allows commit after sufficient verification', () => {
    const plan = [
      { operator: { id: 'inspect_villager_trade' } },
      { operator: { id: 'check_trade_value' } },
      { operator: { id: 'lock_villager_trade' } },
    ];
    
    const result = enforceVerificationSequencing(plan, emptyVerificationState());
    expect(result.valid).toBe(true);
  });
});
```

### 9.2 Option value in cost

```ts
describe('Option value', () => {
  it('includes option value loss in cost', () => {
    const state = createState({ availableOptions: ['reroll', 'level_up', 'lock'] });
    const costWithOptions = computeCommitmentCost(
      { id: 'lock_villager_trade', cost: 5 },
      state
    );
    
    expect(costWithOptions.optionValueLoss).toBeGreaterThan(0);
    expect(costWithOptions.totalCost).toBeGreaterThan(costWithOptions.baseCost);
  });
});
```

---

## 11. Definition of "done"

### Core boundary criteria

- **No premature commits:** Irreversible actions require verification.
- **Option value in objective:** Flexibility valued.
- **One-way constraints:** Blocked operators not proposed.
- **Confidence threshold:** Verified confidence >= required.

### Acceptance checks (4 pivots)

All 4 pivot acceptance checks must pass.

---

## 11. Cross-references

- **Implementation plan**: `RIG_K_IRREVERSIBILITY_PLAN.md`
- **Capability primitives**: `capability-primitives.md` (P13)
- **Sterling domains**: `sterling-minecraft-domains.md` (Rig K section)
