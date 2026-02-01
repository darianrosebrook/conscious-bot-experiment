# Rig A: Certification Hardening Implementation Plan

**Primitive**: P1 — Deterministic transformation planning (resource → product)

**Status**: Implemented baseline; needs certification hardening

---

## 1. Target invariant (critical boundary)

**"Correctness is provable; learning never changes semantics."**

The system must:
- Pass strict validation on all client-defined rules
- Produce deterministic traces (same input → same output hash)
- Update priors only from execution outcomes, not planned success
- Provide audit-grade explanations for all plan choices

**What this rig proves**: Sterling's crafting domain is certifiably correct, deterministic, and auditable.

---

## 2. Current state (baseline)

- **Working**: Crafting solver produces valid plans for resource → product goals
- **Missing**: Strict rule validation, trace bundle hashing, execution-based credit, explanations
- **Risk**: Rules with invalid preconditions/effects can slip through; learning on planned success

---

## 3. Current code anchors

### 3.1 Rule building and solver flow

**File**: `packages/planning/src/sterling/minecraft-crafting-solver.ts`

Current implementation (lines 62-108):
```ts
// 1. Build rule set from mcData recipe tree
const rules = buildCraftingRules(mcData, goalItem);
if (rules.length === 0) {
  return { solved: false, steps: [], totalNodes: 0, durationMs: 0, error: `No crafting rules found for ${goalItem}` };
}

// 3a. Preflight lint + bundle input capture
const maxNodes = 5000;
const compatReport = lintRules(rules);
const bundleInput = computeBundleInput({
  solverId: this.solverId,
  contractVersion: this.contractVersion,
  definitions: rules,
  inventory,
  goal,
  nearbyBlocks,
});

// 4. Call Sterling
const result = await this.sterlingService.solve(this.sterlingDomain, {
  contractVersion: this.contractVersion,
  solverId: this.solverId,
  inventory,
  goal,
  nearbyBlocks,
  rules,
  maxNodes,
  useLearning: true,
});
```

**Anchor point**: Insert validation gate after `buildCraftingRules()` and before `sterlingService.solve()`.

### 3.2 Rule construction

**File**: `packages/planning/src/sterling/minecraft-crafting-rules.ts`

Lines 58-80: `buildCraftingRules(mcData, goalItem, maxDepth)`
- Recursively traces recipe tree
- Creates `MinecraftCraftingRule` objects
- No validation currently applied
- Returns `MinecraftCraftingRule[]`

**Anchor point**: Rules are built here; validation must happen downstream in solver.

### 3.3 Solve bundle hashing

**File**: `packages/planning/src/sterling/solve-bundle.ts`

Lines 1-80: Existing canonicalization infrastructure
- `canonicalize(value: unknown): string` — deterministic JSON serialization
- `INVENTORY_HASH_CAP = 64` — inventory count capping for hash stability
- Handles `NaN`, `Infinity`, `-0`, `undefined` canonically
- Already implements content-addressed hashing contract

**Anchor point**: Bundle hashing infrastructure exists; need to add validation hash and trace hash to bundles.

### 3.4 Bundle computation

**File**: `packages/planning/src/sterling/minecraft-crafting-solver.ts` (lines 80-91, 115-119)

Currently computes:
- `bundleInput = computeBundleInput({ solverId, contractVersion, definitions, inventory, goal, nearbyBlocks })`
- `bundleOutput = computeBundleOutput({ planId, solved, steps, totalNodes, durationMs, searchHealth })`

**Anchor point**: Add validation report to `bundleInput`; add trace hash to `bundleOutput`.

### 3.5 Execution reporting

**File**: `packages/planning/src/task-integration.ts`

Lines 1-50: Task management system with cognitive stream integration
- Links solver results to task execution
- Reports step success/failure
- Currently no credit assignment hook

**Anchor point**: Add execution outcome reporting hook that calls back to Sterling or memory system for credit assignment.

---

## 4. conscious-bot vs Sterling split

| Component | conscious-bot | Sterling |
|-----------|---------------|----------|
| **Rule validation** | ✅ Pre-validates rules with schema + semantic checks<br/>Rejects entire solve if validation fails<br/>**Location**: `packages/planning/src/validation/rule-validator.ts` | ⚫ None (receives pre-validated rules)<br/>Sterling never sees invalid rules |
| **Trace hashing** | ✅ Computes canonical hash of solve request/response<br/>Excludes non-deterministic fields (timestamp, planId)<br/>**Location**: Extend `packages/planning/src/sterling/solve-bundle.ts` | ⚫ None (hash computed client-side) |
| **Credit assignment** | ✅ Receives execution reports from task system<br/>Computes credit updates based on step outcomes<br/>**Location**: `packages/planning/src/credit/credit-manager.ts` | 🔄 Optional: Accepts credit updates to adjust edge priors<br/>(Future: may persist learned priors) |
| **Explanations** | ✅ Generates audit explanations from solve metadata<br/>Includes constraints, alternatives, rejection reasons<br/>**Location**: `packages/planning/src/audit/explanation-builder.ts` | ⚫ None (explanations built from returned metadata) |
| **Execution reporting** | ✅ Task executor reports step success/failure<br/>**Location**: `packages/planning/src/task-integration.ts` | ⚫ None (Sterling is stateless per-solve) |

### Contract

**Input contract** (conscious-bot → Sterling):
```ts
interface SterlingCraftingRequest {
  contractVersion: string;
  solverId: string;
  inventory: Record<string, number>;
  goal: Record<string, number>;
  nearbyBlocks: string[];
  rules: MinecraftCraftingRule[];  // PRE-VALIDATED
  maxNodes: number;
  useLearning: boolean;
}
```

**Output contract** (Sterling → conscious-bot):
```ts
interface SterlingCraftingResponse {
  solutionFound: boolean;
  plan: string[];  // Sequence of rule actions
  discoveredNodes: unknown[];
  solutionPath: unknown[];
  expandedNodes: number;
  timeMs: number;
  // Future: searchHealth metrics when Python emits them
}
```

**Validation contract**:
- conscious-bot validates rules before calling Sterling
- If validation fails, conscious-bot returns error without calling Sterling
- Sterling never implements validation (conscious-bot responsibility)

**Credit contract**:
- conscious-bot task executor reports execution outcomes
- conscious-bot credit manager computes prior updates
- Future: conscious-bot sends credit updates to Sterling for persistence

---

## 5. What to implement / change

### 5.1 Strict rule validation (hardening)

**Location**: `packages/planning/src/validation/rule-validator.ts` (NEW FILE)

**What must be implemented:**
- Schema validation using Zod for all `MinecraftCraftingRule` fields
- Boundedness checks: cost ∈ [0, 1000], deltas ∈ [-64, 64], max 1000 rules
- Semantic validation: consumed ≤ required, no negative production, no unknown items
- Fail-closed: any validation error rejects entire rule set

**Function signature:**
```ts
export function validateRules(
  rules: unknown
): { valid: true; rules: MinecraftCraftingRule[] } | { valid: false; error: string; details: ValidationError[] }
```

**Determinism requirements:**
- Validation is deterministic (same rules → same validation result)
- Error messages are stable and actionable
- No dependency on Date.now(), random IDs, or wall-clock time

### 5.2 Trace bundle hashing (determinism proof)

**Location**: Extend `packages/planning/src/sterling/solve-bundle.ts`

**What must be implemented:**
- Add `traceHash` field to `SolveBundleOutput` type
- Compute trace hash from canonical representation of request + response
- Exclude non-deterministic fields: `timestamp`, `checkedAt`, `planId`
- Include deterministic fields: `definitionHash`, `initialStateHash`, `goalHash`, `stepsDigest`, `solved`, `totalNodes`, `durationMs`

**Function signature:**
```ts
export function computeTraceHash(
  bundleInput: SolveBundleInput,
  bundleOutput: SolveBundleOutput
): ContentHash
```

**Determinism requirements:**
- Same request payload + same Sterling version → identical trace hash
- Hash must be stable across Node.js restarts
- Canonicalization follows existing `canonicalize()` contract

### 5.3 Execution-based credit assignment

**Location**: `packages/planning/src/credit/credit-manager.ts` (NEW FILE)

**What must be implemented:**
- Execution report receiver: step index, rule ID, success/failure, actual effect
- Credit computation: reinforce on success (+0.1), penalize on failure (-0.2)
- NO credit on "plan found" without execution
- Audit logging of all credit updates

**Function signatures:**
```ts
export interface ExecutionReport {
  requestHash: ContentHash;
  stepIndex: number;
  ruleId: string;
  success: boolean;
  actualEffect?: Record<string, number>;
  failureReason?: string;
}

export function computeCreditUpdates(
  plan: string[],
  reports: ExecutionReport[]
): CreditUpdate[]

export function applyCreditUpdates(
  updates: CreditUpdate[]
): Promise<void>
```

**Determinism requirements:**
- Credit updates are deterministic for same execution reports
- No credit applied until execution report received
- Credit magnitude is bounded and configurable

### 5.4 Audit-grade explanations

**Location**: `packages/planning/src/audit/explanation-builder.ts` (NEW FILE)

**What must be implemented:**
- Extract constraints from solve metadata and compat report
- Identify bounding constraints (what limited the solution)
- List top N rejected alternatives with rejection reasons
- Link to evidence/experience sources (future: memory system)

**Function signature:**
```ts
export interface SolveExplanation {
  requestHash: ContentHash;
  constraintsSummary: {
    activeConstraints: string[];
    boundingConstraint: string | null;
  };
  validationReport: {
    rulesAccepted: number;
    rulesRejected: number;
    rejectionReasons: string[];
  };
  solutionSummary: {
    found: boolean;
    planLength: number;
    totalNodes: number;
    durationMs: number;
  };
}

export function buildExplanation(
  bundleInput: SolveBundleInput,
  bundleOutput: SolveBundleOutput,
  validationReport: ValidationReport,
  compatReport: CompatReport
): SolveExplanation
```

**Determinism requirements:**
- Explanations are deterministic for same solve data
- No wall-clock timestamps in explanation content
- Rejection reasons are stable and actionable

### 5.5 Integration into solver

**Location**: `packages/planning/src/sterling/minecraft-crafting-solver.ts`

**What must be changed:**

Add validation gate before Sterling call (after line 63):
```ts
// After buildCraftingRules():
const validationResult = validateRules(rules);
if (!validationResult.valid) {
  return {
    solved: false,
    steps: [],
    totalNodes: 0,
    durationMs: 0,
    error: validationResult.error,
    validationErrors: validationResult.details,
  };
}
const validatedRules = validationResult.rules;
```

Add trace hash computation (after line 119):
```ts
// After bundleOutput computation:
const traceHash = computeTraceHash(bundleInput, bundleOutput);
bundleOutput.traceHash = traceHash;
```

Add explanation generation (after line 119):
```ts
const explanation = buildExplanation(
  bundleInput,
  bundleOutput,
  validationResult,
  compatReport
);
```

Return explanation in solve result:
```ts
return {
  solved: true,
  steps: craftingSteps,
  totalNodes: result.discoveredNodes.length,
  durationMs: result.timeMs,
  solveMeta: {
    bundles: [{ input: bundleInput, output: bundleOutput, compatReport }],
    explanation,
  },
};
```

---

## 6. Implementation pivots (footgun prevention)

### Pivot 1: Validation before Sterling, not after

**Problem**: Invalid rules reach Sterling → crash or wrong plan; error reported late.

**Pivot**: Call `validateRules(rules)` immediately after `buildCraftingRules()` and before `sterlingService.solve()`. Fail-closed: validation error = no Sterling call.

**Code example**:
```ts
// packages/planning/src/sterling/minecraft-crafting-solver.ts
const rules = buildCraftingRules(mcData, goalItem);
const validationResult = validateRules(rules);
if (!validationResult.valid) {
  return {
    solved: false,
    error: `Rule validation failed: ${validationResult.error}`,
    validationErrors: validationResult.details,
  };
}
// Only validated rules reach Sterling
const result = await this.sterlingService.solve(this.sterlingDomain, {
  rules: validationResult.rules,
  ...
});
```

**Acceptance check**: Malformed rule (negative cost, unbounded delta) never reaches `sterlingService.solve()`.

---

### Pivot 2: Trace hash excludes non-deterministic fields

**Problem**: Hash includes `timestamp`, `planId`, or wall-clock data → replay produces different hash → determinism check fails.

**Pivot**: `computeTraceHash()` excludes `timestamp`, `planId`, `checkedAt`. Uses canonical serialization of only deterministic fields: hashes, solved boolean, metrics.

**Code example**:
```ts
// packages/planning/src/sterling/solve-bundle.ts
export function computeTraceHash(
  bundleInput: SolveBundleInput,
  bundleOutput: SolveBundleOutput
): ContentHash {
  const deterministicTrace = {
    input: {
      definitionHash: bundleInput.definitionHash,
      initialStateHash: bundleInput.initialStateHash,
      goalHash: bundleInput.goalHash,
    },
    output: {
      solved: bundleOutput.solved,
      stepsDigest: bundleOutput.stepsDigest,
      totalNodes: bundleOutput.totalNodes,
      durationMs: bundleOutput.durationMs,
    },
  };
  return hashObject(deterministicTrace);
}
```

**Acceptance check**: Same request (inventory, goal, rules) → identical trace hash across runs, even with different timestamps.

---

### Pivot 3: Credit only on execution outcome, not plan success

**Problem**: Reinforcing rules when plan is found (but not executed) reinforces hypothetical success → learning on wrong signal.

**Pivot**: Prior updates only in `reportExecutionOutcome()`. Plan success does NOT trigger credit update.

**Code example**:
```ts
// FORBIDDEN:
const result = await solver.solveCraftingGoal(...);
if (result.solved) {
  reinforceRules(result.steps);  // DO NOT DO THIS
}

// CORRECT:
const result = await solver.solveCraftingGoal(...);
// ... execute plan ...
for (const report of executionReports) {
  if (report.success) {
    await creditManager.reinforceRule(report.ruleId, 0.1, 'Execution success');
  } else {
    await creditManager.penalizeRule(report.ruleId, -0.2, `Execution failure: ${report.failureReason}`);
  }
}
```

**Acceptance check**: Prior unchanged after `solveCraftingGoal()` returns; changes only after execution reports received.

---

### Pivot 4: Fail-closed validation, not fail-warn

**Problem**: Validation warnings logged but rules still sent to Sterling → subtle bugs creep in.

**Pivot**: Validation errors = reject entire solve. No "warn and continue".

**Code example**:
```ts
// FORBIDDEN:
const validationResult = validateRules(rules);
if (validationResult.warnings.length > 0) {
  console.warn(`Validation warnings: ${validationResult.warnings}`);  // But still proceeds!
}

// CORRECT:
const validationResult = validateRules(rules);
if (!validationResult.valid) {
  return { solved: false, error: validationResult.error, validationErrors: validationResult.details };
}
```

**Acceptance check**: Rule with semantic error (consumes more than required) causes solve to fail before Sterling call.

---

### Pivot 5: Canonical hash includes rule order

**Problem**: Different rule orderings produce different hashes even if semantically equivalent → determinism check fails.

**Pivot**: `hashDefinition()` sorts rules by action name before hashing. Order-independent hash.

**Code example**:
```ts
// packages/planning/src/sterling/solve-bundle.ts
export function hashDefinition(definitions: MinecraftCraftingRule[]): ContentHash {
  // Sort by action to make hash order-independent
  const sortedRules = [...definitions].sort((a, b) => a.action.localeCompare(b.action));
  return hashObject(sortedRules);
}
```

**Acceptance check**: Rules [A, B, C] and [C, B, A] produce identical `definitionHash`.

---

## 6. Order of work (suggested)

1. **Add rule validation** with schema checks and semantic guards.
2. **Implement trace hashing** with canonical input/output serialization.
3. **Add execution reporting** from conscious-bot to Sterling.
4. **Wire credit assignment** to update priors only on execution outcomes.
5. **Add explanation output** to solve responses.
6. **Certification tests** for determinism, validation rejection, and credit semantics.

---

## 7. Transfer surfaces (domain-agnosticism proof)

To prove this primitive is domain-agnostic (not Minecraft-specific), implement the same certification gates on at least one of these surfaces:

### 7.1 Bill-of-materials assembly planning

**Surface**: Manufacturing assembly with parts catalog and BOM recipes

- **State**: Parts inventory (screws, brackets, motors, PCBs)
- **Operators**: Assembly steps (attach bracket → screw + bracket → subassembly)
- **Goal**: Assembled product with specific configuration
- **Validation**: BOM rules validated for part compatibility, quantity bounds
- **Determinism**: Same parts inventory + BOM → identical assembly plan hash
- **Credit**: Assembly step success/failure reports update part reliability priors
- **Explanation**: Which parts were rate-limiting; alternative assembly sequences considered

**Prove**: Same validation gates, same trace hashing, same credit semantics, same explanation structure.

### 7.2 Software build graph planning

**Surface**: Software build system with dependency graph and build rules

- **State**: Source files, compiled artifacts, library versions
- **Operators**: Compile, link, package, test steps
- **Goal**: Deployable artifact (binary, container, package)
- **Validation**: Build rules validated for DAG acyclicity, version compatibility, bounded parallelism
- **Determinism**: Same source state + build rules → identical build plan hash
- **Credit**: Build step success/failure reports update rule reliability priors
- **Explanation**: Which dependencies were rate-limiting; alternative build orders rejected

**Prove**: Same determinism contract; same fail-closed validation; same execution-grounded credit.

### 7.3 Data pipeline DAG execution

**Surface**: ETL pipeline with data transformations and dependencies

- **State**: Dataset availability (tables, files, API sources)
- **Operators**: Extract, transform, load, aggregate steps
- **Goal**: Materialized view or aggregated report
- **Validation**: Pipeline rules validated for schema compatibility, data volume bounds, no cycles
- **Determinism**: Same dataset state + pipeline rules → identical execution plan hash
- **Credit**: Step success/failure reports (data quality checks) update transformation reliability
- **Explanation**: Which transformations were bottlenecks; alternative pipeline topologies considered

**Prove**: Same boundedness enforcement; same canonical hashing; same audit trail structure.

---

### Certification gates for transfer surfaces

For each transfer surface, must prove:

1. **Validation gates**: Fail-closed rule validation with schema + semantic checks
2. **Determinism gates**: Same state + rules → identical trace hash (replay test with 5 runs)
3. **Credit gates**: No prior updates on plan success; updates only on execution reports
4. **Explanation gates**: All solves include audit output with constraints, alternatives, rejection reasons
5. **Boundedness gates**: Rule count, operator application depth, search nodes all bounded

If any gate fails on transfer surface, document why and fix or prove it's domain-specific.

---

## 8. Dependencies and risks

- **Sterling changes**: None required for Rig A (conscious-bot enforces validation and hashing)
- **Execution reporting**: Task integration already exists; add credit manager hook
- **Backward compatibility**: Validation is additive; existing solves pass if rules are valid
- **Explanation overhead**: Explanations are computed but optional in response; configurable via flag

---

## 9. Concrete certification tests

### Test 1: Rule validation rejection

```ts
describe('Rig A - Rule validation', () => {
  it('rejects rules with invalid schema', () => {
    const invalidRules = [
      { id: 'not-a-uuid', action: 'bad', cost: -1 }  // Negative cost
    ];

    const result = validateRules(invalidRules);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Schema validation failed');
    expect(result.details[0].code).toBe('INVALID_COST');
  });

  it('rejects rules with semantic errors', () => {
    const badRules: MinecraftCraftingRule[] = [{
      action: 'craft_planks',
      actionType: 'craft',
      produces: [{ item: 'planks', count: 4 }],
      consumes: [{ item: 'wood', count: 2 }],  // Consumes 2
      requires: [{ item: 'wood', count: 1 }],  // Only requires 1 — invalid!
      needsTable: false,
      needsFurnace: false,
      baseCost: 1,
    }];

    const result = validateRules(badRules);

    expect(result.valid).toBe(false);
    expect(result.details[0].code).toBe('CONSUME_EXCEEDS_REQUIRE');
  });

  it('accepts valid rules', () => {
    const validRules: MinecraftCraftingRule[] = [{
      action: 'craft_planks',
      actionType: 'craft',
      produces: [{ item: 'planks', count: 4 }],
      consumes: [{ item: 'wood', count: 1 }],
      requires: [{ item: 'wood', count: 1 }],
      needsTable: false,
      needsFurnace: false,
      baseCost: 1,
    }];

    const result = validateRules(validRules);

    expect(result.valid).toBe(true);
    expect(result.rules).toEqual(validRules);
  });
});
```

---

### Test 2: Deterministic trace hashing

```ts
describe('Rig A - Trace determinism', () => {
  it('produces identical trace hash across runs', async () => {
    const solver = new MinecraftCraftingSolver(sterlingService, mcData);
    const inventory = { wood: 10, cobblestone: 32 };
    const goal = 'wooden_pickaxe';

    const traces: string[] = [];

    for (let i = 0; i < 5; i++) {
      const result = await solver.solveCraftingGoal(goal, inventory, []);
      traces.push(result.solveMeta.bundles[0].output.traceHash);
    }

    // All traces must be identical
    expect(new Set(traces).size).toBe(1);
    expect(traces[0]).toMatch(/^[a-f0-9]{16}$/);  // Valid hex hash
  });

  it('trace hash is independent of timestamp', async () => {
    const solver = new MinecraftCraftingSolver(sterlingService, mcData);

    const result1 = await solver.solveCraftingGoal('planks', { wood: 5 }, []);
    await new Promise(resolve => setTimeout(resolve, 100));  // Wait
    const result2 = await solver.solveCraftingGoal('planks', { wood: 5 }, []);

    const hash1 = result1.solveMeta.bundles[0].output.traceHash;
    const hash2 = result2.solveMeta.bundles[0].output.traceHash;

    expect(hash1).toBe(hash2);  // Must be identical despite time gap
  });

  it('trace hash changes with different inputs', async () => {
    const solver = new MinecraftCraftingSolver(sterlingService, mcData);

    const result1 = await solver.solveCraftingGoal('planks', { wood: 5 }, []);
    const result2 = await solver.solveCraftingGoal('planks', { wood: 10 }, []);

    const hash1 = result1.solveMeta.bundles[0].output.traceHash;
    const hash2 = result2.solveMeta.bundles[0].output.traceHash;

    expect(hash1).not.toBe(hash2);  // Different inventory → different hash
  });
});
```

---

### Test 3: Credit assignment semantics

```ts
describe('Rig A - Credit assignment', () => {
  it('does not update priors on plan success without execution', async () => {
    const creditManager = new CreditManager();
    const solver = new MinecraftCraftingSolver(sterlingService, mcData);

    const priorsBefore = await creditManager.getPriors();

    const result = await solver.solveCraftingGoal('planks', { wood: 5 }, []);
    expect(result.solved).toBe(true);

    // No execution report sent — priors should be unchanged
    const priorsAfter = await creditManager.getPriors();
    expect(priorsAfter).toEqual(priorsBefore);
  });

  it('updates priors only on execution report', async () => {
    const creditManager = new CreditManager();
    const solver = new MinecraftCraftingSolver(sterlingService, mcData);

    const result = await solver.solveCraftingGoal('planks', { wood: 5 }, []);
    const requestHash = result.solveMeta.bundles[0].input.definitionHash;

    const priorsBefore = await creditManager.getPrior('craft_planks');

    // Report execution success
    await creditManager.reportExecutionOutcome(requestHash, [
      { stepIndex: 0, ruleId: 'craft_planks', success: true }
    ]);

    const priorsAfter = await creditManager.getPrior('craft_planks');

    expect(priorsAfter).toBeGreaterThan(priorsBefore);  // Reinforced
  });

  it('penalizes priors on execution failure', async () => {
    const creditManager = new CreditManager();
    const solver = new MinecraftCraftingSolver(sterlingService, mcData);

    const result = await solver.solveCraftingGoal('iron_ingot', { iron_ore: 1 }, ['furnace']);
    const requestHash = result.solveMeta.bundles[0].input.definitionHash;

    const priorsBefore = await creditManager.getPrior('smelt_iron_ore');

    // Report execution failure
    await creditManager.reportExecutionOutcome(requestHash, [
      { stepIndex: 0, ruleId: 'smelt_iron_ore', success: false, failureReason: 'No fuel' }
    ]);

    const priorsAfter = await creditManager.getPrior('smelt_iron_ore');

    expect(priorsAfter).toBeLessThan(priorsBefore);  // Penalized
  });
});
```

---

### Test 4: Solver integration (validation gate)

```ts
describe('Rig A - Solver integration', () => {
  it('solver rejects invalid rules before Sterling call', async () => {
    const solver = new MinecraftCraftingSolver(sterlingService, mcData);
    const sterlingCallSpy = jest.spyOn(sterlingService, 'solve');

    // Inject invalid rule via mock
    jest.spyOn(solver as any, 'buildCraftingRules').mockReturnValue([
      { action: 'bad_rule', cost: -1 }  // Invalid
    ]);

    const result = await solver.solveCraftingGoal('planks', { wood: 5 }, []);

    expect(result.solved).toBe(false);
    expect(result.error).toContain('Rule validation failed');
    expect(sterlingCallSpy).not.toHaveBeenCalled();  // Sterling never called
  });

  it('solver includes explanation in successful solve', async () => {
    const solver = new MinecraftCraftingSolver(sterlingService, mcData);

    const result = await solver.solveCraftingGoal('planks', { wood: 5 }, []);

    expect(result.solved).toBe(true);
    expect(result.solveMeta.explanation).toBeDefined();
    expect(result.solveMeta.explanation.requestHash).toBeDefined();
    expect(result.solveMeta.explanation.constraintsSummary).toBeDefined();
    expect(result.solveMeta.explanation.validationReport).toBeDefined();
  });
});
```

---

### Test 5: End-to-end certification

```ts
describe('Rig A - End-to-end certification', () => {
  it('certifies all gates on Minecraft crafting', async () => {
    const solver = new MinecraftCraftingSolver(sterlingService, mcData);
    const creditManager = new CreditManager();

    // Gate 1: Validation
    const invalidResult = await solver.solveCraftingGoal('planks', {}, []);
    expect(invalidResult.solved).toBe(false);  // No wood

    // Gate 2: Determinism
    const traces = [];
    for (let i = 0; i < 3; i++) {
      const result = await solver.solveCraftingGoal('planks', { wood: 10 }, []);
      traces.push(result.solveMeta.bundles[0].output.traceHash);
    }
    expect(new Set(traces).size).toBe(1);

    // Gate 3: Credit semantics
    const result = await solver.solveCraftingGoal('planks', { wood: 10 }, []);
    const priorBefore = await creditManager.getPrior('craft_planks');
    await creditManager.reportExecutionOutcome(
      result.solveMeta.bundles[0].input.definitionHash,
      [{ stepIndex: 0, ruleId: 'craft_planks', success: true }]
    );
    const priorAfter = await creditManager.getPrior('craft_planks');
    expect(priorAfter).toBeGreaterThan(priorBefore);

    // Gate 4: Explanations
    expect(result.solveMeta.explanation).toBeDefined();
    expect(result.solveMeta.explanation.solutionSummary.found).toBe(true);
  });
});
```

---

## 10. Definition of "done"

### 10.1 Core boundary criteria

- **Validation gates**: Invalid rules reject solve before Sterling call; fail-closed
- **Determinism gates**: Same request → identical trace hash across runs (5 replay test)
- **Credit semantics**: Priors update only on execution reports; no updates on plan success
- **Explanations**: Every solve includes audit output with constraints, validation report, solution summary
- **Boundedness**: Rule count ≤ 1000, costs ≤ 1000, deltas ≤ 64, maxNodes enforced

### 10.2 Implementation construction acceptance checks (5 pivots)

| # | Pivot | Acceptance check |
|---|-------|------------------|
| 1 | Validation before Sterling | Invalid rules never reach `sterlingService.solve()` |
| 2 | Trace hash deterministic | Same request → identical hash (timestamp excluded) |
| 3 | Credit on execution only | Prior unchanged by plan; only execution updates |
| 4 | Fail-closed validation | Semantic error → solve fails before Sterling |
| 5 | Canonical rule hash | Rules [A, B, C] and [C, B, A] → identical hash |

**All 5 acceptance checks must pass.**

### 10.3 Concrete test validation

All 5 test suites pass:
- ✅ Test 1: Rule validation rejection (3 test cases)
- ✅ Test 2: Deterministic trace hashing (3 test cases)
- ✅ Test 3: Credit assignment semantics (3 test cases)
- ✅ Test 4: Solver integration (2 test cases)
- ✅ Test 5: End-to-end certification (1 test case)

Total: 12 test cases covering all pivots and gates.

### 10.4 Transfer surface validation

- **Test on at least one transfer surface** (BOM assembly, build graph, or data pipeline)
- **Prove same gates**: Determinism, validation, credit, explanations work identically
- **Document delta**: If any semantic differences exist on transfer surface, document why

---

## 11. Cross-references

- **Companion approach**: `RIG_A_CERTIFICATION_APPROACH.md` (detailed code examples, signatures, DO/DO NOT patterns)
- **Capability primitives**: `capability-primitives.md` (P1, P16, P17, P19, P20 definitions)
- **Sterling primitive spec**: `/Users/darianrosebrook/Desktop/Projects/sterling/docs/planning/capability_primitives_bundle/primitives/P01_deterministic_transformation_planning_resource_product.md`
- **Rig definitions**: `sterling-minecraft-domains.md` (Rig A section)
- **Enrichment guide**: `RIG_DOCUMENTATION_ENRICHMENT_GUIDE.md` (template and quality checklist)
- **Enrichment status**: `RIG_ENRICHMENT_STATUS.md` (Track 1 roadmap)

---

## 12. Implementation files summary

### New files to create

1. **`packages/planning/src/validation/rule-validator.ts`**
   - `validateRules(rules: unknown)` — schema + semantic validation
   - `ValidationError` type, `ValidationReport` type
   - Zod schemas for `MinecraftCraftingRule`

2. **`packages/planning/src/credit/credit-manager.ts`**
   - `CreditManager` class with `reportExecutionOutcome()`, `getPrior()`, `applyCreditUpdates()`
   - `ExecutionReport` type, `CreditUpdate` type

3. **`packages/planning/src/audit/explanation-builder.ts`**
   - `buildExplanation()` function
   - `SolveExplanation` type with constraints, validation, solution summary

### Files to modify

1. **`packages/planning/src/sterling/minecraft-crafting-solver.ts`**
   - Add validation gate after `buildCraftingRules()` (line 63)
   - Add trace hash computation after `bundleOutput` (line 119)
   - Add explanation generation
   - Return explanation in `solveMeta`

2. **`packages/planning/src/sterling/solve-bundle.ts`**
   - Add `computeTraceHash()` function
   - Extend `SolveBundleOutput` type with `traceHash` field
   - Ensure `hashDefinition()` sorts rules before hashing

3. **`packages/planning/src/sterling/solve-bundle-types.ts`**
   - Add `SolveExplanation` type
   - Add `traceHash` to `SolveBundleOutput`
   - Add `explanation` to solve result metadata

### Test files to create

1. **`packages/planning/src/validation/__tests__/rule-validator.test.ts`**
   - Test 1: Rule validation rejection (3 cases)

2. **`packages/planning/src/credit/__tests__/credit-manager.test.ts`**
   - Test 3: Credit assignment semantics (3 cases)

3. **`packages/planning/src/sterling/__tests__/certification-e2e.test.ts`**
   - Test 2: Deterministic trace hashing (3 cases)
   - Test 4: Solver integration (2 cases)
   - Test 5: End-to-end certification (1 case)
