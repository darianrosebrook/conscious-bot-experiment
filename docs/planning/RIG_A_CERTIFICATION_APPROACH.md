# Rig A: Certification Hardening — Companion Approach

**Implementation**: Complete (2026-02-09) — validation gate, trace hashing, credit manager, explanation builder all implemented and wired into crafting solver. 23 certification tests passing.

This companion document distills the implementation plan with explicit design decisions, boundaries, code references, and implementation construction constraints. Read alongside `RIG_A_CERTIFICATION_PLAN.md`.

---

## 1. Executive summary

Rig A certification hardens the existing crafting solver to prove **Primitive 1** (Deterministic transformation planning) with certifiable correctness:

1. **Strict rule validation**: Reject invalid/malicious rule inputs
2. **Trace bundle hashing**: Prove determinism with canonical hashes
3. **Execution-based credit**: Update priors only on execution outcomes
4. **Audit-grade explanations**: Explain plan choices and rejections

**Critical boundary**: Correctness is provable; learning never changes semantics.

**Best path:** Add validation gate before Sterling; add trace hashing in solve-bundle; wire execution reporting; add explanation output. Sterling unchanged; conscious-bot enforces validation and captures bundles.

---

## 2. What must be implemented in conscious-bot vs Sterling

| Area | conscious-bot | Sterling |
|------|---------------|----------|
| Rule validation | Validate rules before solve; reject invalid | Receives pre-validated rules |
| Trace hashing | Compute canonical hash of solve request/response | None |
| Credit | Update priors from execution report only | Optional: edge priors (unchanged by Rig A) |
| Explanations | Generate from solve metadata | None |

**Contract:** conscious-bot validates rules; rejects before Sterling if invalid. Trace hash computed on canonicalized request. Credit updates only from execution outcomes.

---

## 3. Current code anchors

| Location | What |
|----------|------|
| `packages/planning/src/sterling/minecraft-crafting-solver.ts` | 62-107 | `solveCraftingGoal()` builds rules, sends to Sterling. No validation gate. |
| `packages/planning/src/sterling/solve-bundle.ts` | — | Bundle input/output; add canonical hash. |
| `packages/planning/src/sterling/minecraft-crafting-rules.ts` | 59 | `buildCraftingRules()`; rules not validated. |

**Exact code to add (solver, before Sterling call):**
```ts
const validation = validateAndReject(rules);
if ('error' in validation) return { solved: false, error: validation.error, ... };
const rules = validation.rules;
```

---

## 4. Implementation construction constraints (pivots)

### Pivot 1: Validation before Sterling

**Problem:** Invalid rules reach Sterling; crash or wrong plan.

**Pivot:** `validateAndReject(rules)` before `sterlingService.solve()`. Fail-closed.

**Acceptance check:** Malformed rule never reaches Sterling.

---

### Pivot 2: Trace hash excludes non-deterministic fields

**Problem:** Hash includes timestamp, random ids; replay produces different hash.

**Pivot:** `canonicalSerialize()` excludes `timestamp`, `planId`, `checkedAt`. Stable sort for arrays.

**Acceptance check:** Same request (inventory, goal, rules) → identical hash across runs.

---

### Pivot 3: Credit only on execution outcome

**Problem:** Updating priors when plan succeeds reinforces hypothetical; learning wrong.

**Pivot:** Prior updates only in `reportExecutionOutcome()`. Plan success does not trigger update.

**Acceptance check:** Prior unchanged after plan return; changes only after execution report.

---

### Pivot 4: Explanation includes rejection reason

**Problem:** Rejected plan has no rationale; cannot audit.

**Pivot:** When validation fails, `SolveExplanation` includes `rejectionReason`, `failedRuleIds`.

**Acceptance check:** Rejected solve returns explanation with reason.

---

### Summary: Acceptance check table

| Pivot | Acceptance check |
|-------|------------------|
| 1 | Invalid rules never reach Sterling. |
| 2 | Same request → identical trace hash. |
| 3 | Credit only on execution outcome. |
| 4 | Rejection includes explanation. |

---

## 5. Current state analysis

### 2.1 What works (baseline)

- Crafting solver produces valid plans for resource → product goals
- Sterling integration via WebSocket is functional
- Rule serialization and plan execution work end-to-end

### 2.2 What's missing (certification gaps)

| Gap | Risk | Priority |
|-----|------|----------|
| No schema validation for rules | Invalid rules can crash solver or produce wrong plans | High |
| No trace hashing | Cannot prove determinism; replay tests are weak | High |
| Credit on planned success | Learning reinforces hypothetical, not actual outcomes | High |
| No explanation output | Cannot audit why plan was chosen | Medium |
| Cost bounds not enforced | Untrusted rules can inject extreme costs | Medium |

---

## 6. Strict rule validation

### 6.1 Schema definition

```ts
// packages/planning/src/validation/rule-schema.ts

import { z } from 'zod';

export const InventoryDeltaSchema = z.record(
  z.string().max(64),  // Item name
  z.number().int().min(-64).max(64)  // Delta bounded
);

export const CraftingRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(128),
  preconditions: z.object({
    required_items: InventoryDeltaSchema,
    required_stations: z.array(z.string().max(32)).max(4),
  }),
  effects: z.object({
    consumed: InventoryDeltaSchema,
    produced: InventoryDeltaSchema,
  }),
  cost: z.number().positive().max(1000),
  metadata: z.object({
    source: z.enum(['vanilla', 'modded', 'custom']),
    version: z.string().optional(),
  }).optional(),
});

export const RuleSetSchema = z.array(CraftingRuleSchema).max(1000);

export type CraftingRule = z.infer<typeof CraftingRuleSchema>;
```

### 6.2 Semantic validation

```ts
// packages/planning/src/validation/semantic-checks.ts

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  ruleId: string;
  code: string;
  message: string;
}

export function validateRuleSemantics(rules: CraftingRule[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  for (const rule of rules) {
    // Check: effects cannot consume more than preconditions provide
    for (const [item, consumed] of Object.entries(rule.effects.consumed)) {
      const required = rule.preconditions.required_items[item] ?? 0;
      if (consumed > required) {
        errors.push({
          ruleId: rule.id,
          code: 'CONSUME_EXCEEDS_REQUIRE',
          message: `Rule consumes ${consumed} ${item} but only requires ${required}`,
        });
      }
    }
    
    // Check: no self-contradicting rules (produce what you consume in same rule)
    for (const item of Object.keys(rule.effects.produced)) {
      if (item in rule.effects.consumed) {
        warnings.push({
          ruleId: rule.id,
          code: 'SELF_LOOP',
          message: `Rule both consumes and produces ${item}`,
        });
      }
    }
    
    // Check: produced items are positive
    for (const [item, amount] of Object.entries(rule.effects.produced)) {
      if (amount <= 0) {
        errors.push({
          ruleId: rule.id,
          code: 'INVALID_PRODUCTION',
          message: `Rule produces non-positive amount of ${item}: ${amount}`,
        });
      }
    }
  }
  
  return { valid: errors.length === 0, errors, warnings };
}
```

### 6.3 Fail-closed validation gate

```ts
// packages/planning/src/validation/validation-gate.ts

export function validateAndReject(
  rawRules: unknown
): { rules: CraftingRule[] } | { error: string; details: ValidationError[] } {
  // Step 1: Schema validation
  const schemaResult = RuleSetSchema.safeParse(rawRules);
  if (!schemaResult.success) {
    return {
      error: 'Schema validation failed',
      details: schemaResult.error.errors.map(e => ({
        ruleId: 'unknown',
        code: 'SCHEMA_ERROR',
        message: e.message,
      })),
    };
  }
  
  // Step 2: Semantic validation
  const semanticResult = validateRuleSemantics(schemaResult.data);
  if (!semanticResult.valid) {
    return {
      error: 'Semantic validation failed',
      details: semanticResult.errors,
    };
  }
  
  // Step 3: Boundedness checks
  if (schemaResult.data.length > 1000) {
    return {
      error: 'Rule count exceeds maximum (1000)',
      details: [{ ruleId: 'all', code: 'TOO_MANY_RULES', message: 'Rule set too large' }],
    };
  }
  
  return { rules: schemaResult.data };
}
```

---

## 7. Trace bundle hashing

### 4.1 Canonical serialization

```ts
// packages/planning/src/trace/canonical-hash.ts

import { createHash } from 'crypto';

export interface SolveRequest {
  rules: CraftingRule[];
  initialState: Record<string, number>;
  goal: Record<string, number>;
  config?: Record<string, unknown>;
}

export interface SolveTrace {
  request: SolveRequest;
  result: {
    found: boolean;
    plan: string[];
    nodesExpanded: number;
    timeMs: number;
  };
  sterlingVersion: string;
}

function canonicalSort(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sorted[key] = canonicalSort(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sorted[key] = value.map(v =>
        typeof v === 'object' && v !== null ? canonicalSort(v as Record<string, unknown>) : v
      );
    } else {
      sorted[key] = value;
    }
  }
  return sorted;
}

export function canonicalSerialize(obj: unknown): string {
  if (typeof obj === 'object' && obj !== null) {
    return JSON.stringify(canonicalSort(obj as Record<string, unknown>));
  }
  return JSON.stringify(obj);
}

export function hashSolveRequest(request: SolveRequest): string {
  const canonical = canonicalSerialize({
    rules: request.rules,
    initialState: request.initialState,
    goal: request.goal,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function hashSolveTrace(trace: SolveTrace): string {
  const canonical = canonicalSerialize(trace);
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}
```

### 4.2 Determinism verification

```ts
// packages/planning/src/trace/determinism-check.ts

export interface DeterminismReport {
  requestHash: string;
  traceHashes: string[];
  deterministic: boolean;
  divergencePoint?: string;
}

export async function verifyDeterminism(
  request: SolveRequest,
  runs: number = 3
): Promise<DeterminismReport> {
  const requestHash = hashSolveRequest(request);
  const traceHashes: string[] = [];
  
  for (let i = 0; i < runs; i++) {
    const result = await solveCrafting(request);
    const trace: SolveTrace = {
      request,
      result,
      sterlingVersion: getSterlingVersion(),
    };
    traceHashes.push(hashSolveTrace(trace));
  }
  
  const allSame = traceHashes.every(h => h === traceHashes[0]);
  
  return {
    requestHash,
    traceHashes,
    deterministic: allSame,
    divergencePoint: allSame ? undefined : findDivergence(traceHashes),
  };
}
```

---

## 8. Execution-based credit assignment

### 5.1 Credit semantics

```ts
// packages/planning/src/credit/credit-assignment.ts

export interface PlanStep {
  ruleId: string;
  expectedEffect: Record<string, number>;
}

export interface ExecutionReport {
  stepIndex: number;
  ruleId: string;
  success: boolean;
  actualEffect?: Record<string, number>;
  failureReason?: string;
}

export interface CreditUpdate {
  ruleId: string;
  priorAdjustment: number;  // Positive = reinforce, negative = penalize
  reason: string;
}

export function computeCreditUpdates(
  plan: PlanStep[],
  reports: ExecutionReport[]
): CreditUpdate[] {
  const updates: CreditUpdate[] = [];
  
  for (const report of reports) {
    const step = plan[report.stepIndex];
    if (!step) continue;
    
    if (report.success) {
      // Reinforce only on execution success
      updates.push({
        ruleId: report.ruleId,
        priorAdjustment: 0.1,
        reason: 'Execution success',
      });
    } else {
      // Penalize only on execution failure
      updates.push({
        ruleId: report.ruleId,
        priorAdjustment: -0.2,
        reason: `Execution failure: ${report.failureReason}`,
      });
    }
  }
  
  return updates;
}
```

### 5.2 DO and DO NOT for credit

**DO:**
- **DO** update priors only when execution reports are received.
- **DO** apply credit to the specific rule that succeeded/failed.
- **DO** log credit updates with reasons for auditability.

**DO NOT:**
- **DO NOT** reinforce on "plan found" without execution.
- **DO NOT** penalize rules for failures caused by world state changes.
- **DO NOT** apply credit without execution evidence.

```ts
// FORBIDDEN: Credit on plan success
if (planResult.found) {
  reinforceRules(planResult.plan);  // DO NOT DO THIS
}

// CORRECT: Credit on execution report
for (const report of executionReports) {
  if (report.success) {
    reinforceRule(report.ruleId, 0.1, 'Execution success');
  }
}
```

---

## 9. Audit-grade explanations

### 6.1 Explanation structure

```ts
// packages/planning/src/audit/explanation.ts

export interface SolveExplanation {
  requestHash: string;
  constraintsSummary: {
    activeConstraints: string[];
    boundingConstraint: string | null;  // Which constraint limited the solution
  };
  alternativesConsidered: Array<{
    planSummary: string;
    cost: number;
    rejectionReason: string;
  }>;
  priorInfluence: {
    rulesWithPriorBoost: string[];
    experienceSource: string;  // e.g., "10 successful executions"
  };
  legalityGates: Array<{
    ruleId: string;
    gate: string;
    passed: boolean;
  }>;
}
```

### 6.2 Explanation generation

```ts
export function generateExplanation(
  request: SolveRequest,
  result: SolveResult,
  searchLog: SearchLog
): SolveExplanation {
  return {
    requestHash: hashSolveRequest(request),
    constraintsSummary: {
      activeConstraints: extractActiveConstraints(request, searchLog),
      boundingConstraint: findBoundingConstraint(searchLog),
    },
    alternativesConsidered: searchLog.rejectedPlans.slice(0, 3).map(alt => ({
      planSummary: summarizePlan(alt.plan),
      cost: alt.cost,
      rejectionReason: alt.rejectionReason,
    })),
    priorInfluence: {
      rulesWithPriorBoost: searchLog.rulesWithModifiedPriors,
      experienceSource: searchLog.experienceSummary,
    },
    legalityGates: searchLog.legalityChecks.map(check => ({
      ruleId: check.ruleId,
      gate: check.gateName,
      passed: check.passed,
    })),
  };
}
```

---

## 10. Sterling integration changes

### 7.1 Solve request with validation

```ts
// packages/planning/src/sterling/crafting-solver.ts

export async function solveCraftingGoal(
  rawRules: unknown,
  initialState: Record<string, number>,
  goal: Record<string, number>
): Promise<SolveResult> {
  // Step 1: Validate rules (fail-closed)
  const validationResult = validateAndReject(rawRules);
  if ('error' in validationResult) {
    return {
      found: false,
      error: validationResult.error,
      validationErrors: validationResult.details,
    };
  }
  
  // Step 2: Build solve request
  const request: SolveRequest = {
    rules: validationResult.rules,
    initialState,
    goal,
  };
  
  // Step 3: Hash for determinism tracking
  const requestHash = hashSolveRequest(request);
  
  // Step 4: Solve via Sterling
  const sterlingResult = await sterlingService.solve(request);
  
  // Step 5: Build trace and explanation
  const trace: SolveTrace = {
    request,
    result: sterlingResult,
    sterlingVersion: getSterlingVersion(),
  };
  const traceHash = hashSolveTrace(trace);
  const explanation = generateExplanation(request, sterlingResult, sterlingResult.searchLog);
  
  return {
    found: sterlingResult.found,
    plan: sterlingResult.plan,
    requestHash,
    traceHash,
    explanation,
  };
}
```

### 7.2 Execution reporting

```ts
// packages/planning/src/sterling/execution-reporter.ts

export async function reportExecution(
  requestHash: string,
  reports: ExecutionReport[]
): Promise<void> {
  const updates = computeCreditUpdates(getPlanForRequest(requestHash), reports);
  
  for (const update of updates) {
    await sterlingService.updatePrior(update.ruleId, update.priorAdjustment);
    console.log(`[Credit] ${update.ruleId}: ${update.priorAdjustment} (${update.reason})`);
  }
}
```

---

## 11. Certification tests

### 8.1 Validation rejection test

```ts
describe('Rule validation', () => {
  it('rejects rules with invalid schema', () => {
    const invalidRules = [{ id: 'not-a-uuid', cost: -1 }];
    const result = validateAndReject(invalidRules);
    expect('error' in result).toBe(true);
    expect(result.error).toContain('Schema validation failed');
  });
  
  it('rejects rules with semantic errors', () => {
    const badRules = [{
      id: crypto.randomUUID(),
      name: 'Bad rule',
      preconditions: { required_items: { wood: 1 }, required_stations: [] },
      effects: { consumed: { wood: 2 }, produced: { plank: 4 } },  // Consumes more than required
      cost: 1,
    }];
    const result = validateAndReject(badRules);
    expect('error' in result).toBe(true);
    expect(result.details[0].code).toBe('CONSUME_EXCEEDS_REQUIRE');
  });
});
```

### 8.2 Determinism test

```ts
describe('Trace determinism', () => {
  it('produces identical trace hash across runs', async () => {
    const request = createTestRequest();
    const report = await verifyDeterminism(request, 5);
    expect(report.deterministic).toBe(true);
    expect(new Set(report.traceHashes).size).toBe(1);
  });
});
```

### 8.3 Credit semantics test

```ts
describe('Credit assignment', () => {
  it('does not update priors on plan success without execution', async () => {
    const priorsBefore = await getPriors();
    const result = await solveCraftingGoal(testRules, testState, testGoal);
    expect(result.found).toBe(true);
    
    // No execution report sent
    const priorsAfter = await getPriors();
    expect(priorsAfter).toEqual(priorsBefore);  // Priors unchanged
  });
  
  it('updates priors only on execution report', async () => {
    const result = await solveCraftingGoal(testRules, testState, testGoal);
    const priorsBefore = await getPriors();
    
    await reportExecution(result.requestHash, [
      { stepIndex: 0, ruleId: result.plan[0], success: true },
    ]);
    
    const priorsAfter = await getPriors();
    expect(priorsAfter[result.plan[0]]).toBeGreaterThan(priorsBefore[result.plan[0]]);
  });
});
```

### 8.4 Explanation completeness test

```ts
describe('Audit explanations', () => {
  it('includes all required explanation fields', async () => {
    const result = await solveCraftingGoal(testRules, testState, testGoal);
    expect(result.explanation).toBeDefined();
    expect(result.explanation.requestHash).toBe(result.requestHash);
    expect(result.explanation.constraintsSummary).toBeDefined();
    expect(result.explanation.alternativesConsidered).toBeDefined();
    expect(result.explanation.legalityGates).toBeDefined();
  });
});
```

---

## 12. Definition of "done" for certification milestone

### Core boundary criteria

- **Validation:** Invalid rules reject solve; never reach Sterling.
- **Determinism:** Same request → identical trace hash.
- **Credit semantics:** Priors update only on execution reports.
- **Explanations:** Every solve/rejection includes rationale.

### Implementation construction acceptance checks (4 pivots)

| # | Pivot | Acceptance check |
|---|-------|------------------|
| 1 | Validation before Sterling | Invalid rules never reach Sterling. |
| 2 | Trace hash deterministic | Same request → identical hash. |
| 3 | Credit on execution only | Prior unchanged by plan; only execution updates. |
| 4 | Rejection explanation | Rejection includes reason. |

**All 4 acceptance checks must pass.**

---

## 13. Cross-references

- **Implementation plan**: `RIG_A_CERTIFICATION_PLAN.md`
- **Capability primitives**: `capability-primitives.md` (P1, P16, P17, P19, P20)
- **Sterling domains**: `sterling-minecraft-domains.md` (Rig A section)
- **Sterling README**: `sterling/README.md` (solve protocol)
