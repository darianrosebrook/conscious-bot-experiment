# Task-to-Execution Pipeline: Hardening Recap and Next Steps

**Purpose:** Give reviewers and the next implementer a single place for (1) what was completed and why, (2) how it works with examples, and (3) what remains so the task-to-execution pipeline can be picked up and finished.

**Scope:** Planning package executor path: Sterling steps → `stepToLeafExecution` → validation/allowlist → `mapBTActionToMinecraft` → toolExecutor → golden-run artifact. Focus is avoiding a second semantics layer in TypeScript and making observability safe.

**References:**
- Pattern A handoff (expand + shadow proof): `docs/planning/PATTERN_A_IMPLEMENTATION_HANDOFF.md`
- Golden run runbook: `docs/planning/golden-run-runbook.md`
- Evidence-first review contract: `CLAUDE.md` (conscious-bot repo root)

---

## Session Overview (For Review and Handoff)

This section summarizes what we chose to do, why, and how it looks in code (snippets and diffs). Use it for review and to pick up where we left off.

### Definition of Option A (Canonical)

- **Option A:** Executor-native `meta.args` (plain object) **supplied by the plan author** (e.g. Sterling). The step has `meta.leaf` and `meta.args` set before it reaches the executor; `stepToLeafExecution` returns `argsSource: 'explicit'`. Only Option A steps are live-dispatchable and certifiable.
- **Option A-compat / materialized:** Args produced by the TypeScript normalizer from `produces`/`consumes` (same derivation as the step-to-leaf legacy path). Semantically still derived; not Option A. If such steps were allowed in live without marking, TS would remain the compiler for under-specified plans.

We adopt **Strict Option A** for the long-term boundary: in live and certifying modes, the normalizer is **validation-only**. It does not write `meta.args` when `stepToLeafExecution` would return `argsSource: 'derived'`; it sets `planningIncomplete` so the task does not become live-dispatchable until the plan author emits explicit args. A dev/shadow-only "materialize for legacy" mode may exist behind a flag for compatibility; it must be non-certifiable, metered, and removable.

### Policy Note: How the Normalizer Knows Whether It May Materialize (Gap A)

The normalizer **defaults to strict** (validation-only). It never writes `step.meta.args` for derived steps unless the caller explicitly passes **`allowMaterialize: true`**. Call sites (`finalizeNewTask`, `regenerateSteps`) do not pass options, so they get the default and never materialize. Only dev/shadow-only code paths that intentionally opt in should pass `allowMaterialize: true`; when they do, the normalizer sets `task.metadata.optionACompatUsed = true` so the task is machine-readably non-certifiable and can be metered or forbidden in cert. This avoids needing a central runtime config: the policy is "strict unless explicit opt-in at the call site."

### Policy Note: No TS Materialization in Live

TypeScript is **not** allowed to synthesize executor-native args from `produces`/`consumes` and then treat them as explicit for live dispatch. That would move semantic translation earlier but keep TS as the compiler. In live/cert:

- If the normalizer sees a step that would yield `argsSource: 'derived'`, it sets `task.metadata.planningIncomplete = true` and does **not** write `step.meta.args`.
- The executor continues to block on `argsSource === 'derived'`; steps that never get explicit args from the plan author never dispatch in live.
- Any code path that currently materializes (writes `meta.args` from produces/consumes) in all modes is **transitional** and must be gated (e.g. dev/shadow-only flag) or removed for cert. Artifact and docs should not describe "normalizer materializes and then live dispatches" as the intended contract.

### What We Chose and Why

| Decision | Why |
|----------|-----|
| **Block derived args in live** | So TS never becomes the de facto semantics; only steps with plan-author-supplied `meta.args` (Option A) may dispatch in live. |
| **Fail-closed mapping (strict: true)** | Unmapped tools must surface as `no_mapped_action` and back off, not pretend to be a valid action. |
| **Single Option A choke point (validation-only in live/cert)** | All step mutations run through one normalizer. In live/cert it validates only: if a step would be derived, set `planningIncomplete`; do not write `meta.args`. |
| **Two backoff classes** | Deterministic (5 min) vs transient (30 s) so "everything stuck" does not happen when a transient (e.g. rate limit, bot not spawned) clears. |
| **planningIncomplete = deterministic backoff** | Unknown leaf / cannot materialize does not clear without plan mutation; without a replan loop, retrying every 30s only burns executor cycles. Long backoff (or remove from executor-visible) until replan is implemented. |
| **Recorder eviction + stable fingerprint** | Throttle state and shadow sets are evicted when a run is stale (15 min); payload fingerprint is deep and strips timestamps so idempotency holds. |
| **Null-proto counts as explicit** | Boundaries that use `Object.create(null)` for args are not wrongly blocked in live. |
| **Schema revision + features** | Downstream can detect capabilities without parsing the full artifact. |
| **original_leaf in artifacts** | Evidence preserves what Sterling planned when we rewrite (e.g. dig_block → acquire_material); exit ramp is to move the rewrite upstream. |

### Naming: planningIncomplete vs planning_incomplete

Intentional: **`task.metadata.planningIncomplete`** (camelCase) is the task metadata boolean. **`blockedReason: 'planning_incomplete'`** (snake_case) is the executor block reason string. Both denote the same condition (task has at least one step that could not be Option A). Do not "fix" one to match the other; metadata and reason codes follow different conventions.

### Snippets: Where It Lives

**1. Step-to-leaf: argsSource and plain-object gate**  
`packages/planning/src/modules/step-to-leaf-execution.ts`

```ts
export type ArgsSource = 'explicit' | 'derived';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

if (isPlainObject(meta.args)) {
  return {
    leafName: meta.leaf as string,
    args: meta.args as Record<string, unknown>,
    argsSource: 'explicit',
  };
}
// Legacy fallback: derive from produces/consumes → argsSource: 'derived'
```

**2. Option A normalizer (choke point)**  
`packages/planning/src/modules/step-option-a-normalizer.ts`

Strict policy: in live/cert the normalizer must **not** write `meta.args` when `stepToLeafExecution` would return `argsSource: 'derived'`. It should set `planningIncomplete` and return. Current code may still have a materialize path (writes `meta.args` from produces/consumes); that path must be gated dev/shadow-only or removed for cert. Conceptual validation-only shape:

```ts
// For live/cert: do NOT materialize when result.argsSource === 'derived'
export function materializeStepToOptionA(step: ..., options?: { allowMaterialize?: boolean }): boolean {
  const result = stepToLeafExecution(step);
  if (!result) return false;
  if (result.argsSource === 'explicit') return true;
  if (!options?.allowMaterialize) return false;  // strict: set planningIncomplete, do not write args
  // Legacy compat (dev/shadow only): write step.meta.args = result.args ...
}
export function normalizeTaskStepsToOptionA(task: TaskWithSteps, options?: { allowMaterialize?: boolean }): void {
  // For each step: if materializeStepToOptionA(step, options) is false → task.metadata.planningIncomplete = true
}
```

**3. Where the normalizer runs**  
`packages/planning/src/task-integration.ts`

```ts
// In finalizeNewTask (all addTask paths):
if (task.steps && task.steps.length > 0) {
  normalizeTaskStepsToOptionA(task as TaskWithSteps);
}

// In regenerateSteps, after task.steps = updatedSteps:
normalizeTaskStepsToOptionA(task as TaskWithSteps);
this.taskStore.setTask(task);
```

**3a. Step authors and Option A (6.1 inventory)**

| Step author | Location | Option A? | Notes |
|-------------|----------|-----------|--------|
| **materializeSterlingIrSteps** | task-integration.ts (expandByDigest path) | When backend returns `args` | Builds steps from `response.steps` with `meta.leaf = step.leaf`, `meta.args = step.args`. Contract: `expandByDigest` response type is `steps: Array<{ leaf: string; args: Record<string, unknown> }>`. If Sterling backend emits executor-native args, steps are Option A. Unknown leaves (no mapping in stepToLeafExecution) come from backend; after normalize, task gets `planningIncomplete` and `planningIncompleteReasons` (e.g. `unknown_leaf`). |
| **generateLeafMappedSteps** | sterling-planner.ts (compiler fallback) | Yes when fallback plan has args | Returns steps with `meta.leaf` and `meta.args` from `requirementToFallbackPlan(requirement)`. |
| **Sterling solvers** (crafting, tool progression, building, acquisition) | sterling-planner.ts → toTaskSteps + deriveLeafArgs | Yes at normalizer input | `toTaskSteps(result)` returns steps with `produces`/`consumes`; planner then sets `enrichedMeta.args = deriveLeafArgs(enrichedMeta)`. So steps already have plain-object args when they reach the normalizer (Option A). Normalizer does not materialize; it only validates. |

Unknown-leaf flow: step with `meta.leaf` not handled by `stepToLeafExecution` yields null. Normalizer sets `planningIncomplete` and adds `planningIncompleteReasons` with `reason: 'unknown_leaf'`. Executor checks `task.metadata.planningIncomplete` **before** resolving leaf, so unknown-leaf steps also get deterministic backoff and `recordExecutorBlocked` (no hot-loop). Test: `sterling-step-executor.test.ts` — "unknown leaf: normalize sets planningIncomplete and planningIncompleteReasons; executor blocks with deterministic backoff (no hot-loop)".

**4. Executor: deterministic vs transient backoff**  
`packages/planning/src/executor/sterling-step-executor.ts`

```ts
const DETERMINISTIC_BLOCK_BACKOFF_MS = 300_000; // 5 minutes
const TRANSIENT_BLOCK_BACKOFF_MS = 30_000;     // 30 seconds

// Deterministic (example): planner/materializer must change; condition won't clear without plan mutation
ctx.updateTaskMetadata(task.id, {
  blockedReason: 'derived_args_not_allowed_live',
  nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS,
});
// planning_incomplete is also deterministic (long backoff) unless a replan loop is implemented

// Transient (example): world/runtime must change
ctx.updateTaskMetadata(task.id, {
  blockedReason: 'rate_limited',
  nextEligibleAt: Date.now() + TRANSIENT_BLOCK_BACKOFF_MS,
});
// Same for rig_g_blocked
```

**5. Recorder: eviction and stable fingerprint**  
`packages/planning/src/golden-run-recorder.ts`

```ts
const RUN_STALE_MS = 15 * 60 * 1000; // 15 minutes
const FINGERPRINT_NOISE_KEYS = new Set([
  'dispatched_at', 'observed_at', 'timestamp', 'updated_at', 'created_at',
]);

function stablePayloadFingerprint(value: unknown): string {
  // ... recursive key sort, strip FINGERPRINT_NOISE_KEYS
}

private evictStaleThrottleState(): void {
  const now = Date.now();
  for (const key of this.lastBlockedByKey.keys()) {
    const runId = key.split(':')[0];
    const report = this.runs.get(runId);
    if (!report || now - report.updated_at > RUN_STALE_MS) this.lastBlockedByKey.delete(key);
  }
  // same for shadowObservedStepKeys
}
// Called after every update()
```

**6. Strict mapping on executor path only**  
`packages/planning/src/modules/action-mapping.ts` (default branch when `strict: true` returns `null`); `modular-server.ts` toolExecutor calls `mapBTActionToMinecraft(..., { strict: true })`.

**7. Artifact schema revision**  
`packages/planning/src/golden-run-recorder.ts` — new runs get:

```ts
schema_revision: 1,
features: ['original_leaf', 'blocked_throttle_v1', 'strict_mapping_v1', 'execution_decisions_v1'],
```

### Representative Diffs (Conceptual)

**Diff 1: Live block for derived args (executor)**

```diff
  if (mode === 'live' && leafExec.argsSource === 'derived') {
    ctx.updateTaskMetadata(task.id, {
      blockedReason: 'derived_args_not_allowed_live',
+     nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS,
    });
    if (runId) { ... recordExecutorBlocked(...); }
    return;
  }
```

**Diff 2: Transient backoff for rate_limited and rig_g_blocked**

```diff
  if (!ctx.canExecuteStep()) {
+   ctx.updateTaskMetadata(task.id, {
+     blockedReason: 'rate_limited',
+     nextEligibleAt: Date.now() + TRANSIENT_BLOCK_BACKOFF_MS,
+   });
    if (runId) { ... recordExecutorBlocked(runId, 'rate_limited', ...); }
    return;
  }
  ...
  if (!stepStarted) {
+   ctx.updateTaskMetadata(task.id, {
+     blockedReason: 'rig_g_blocked',
+     nextEligibleAt: Date.now() + TRANSIENT_BLOCK_BACKOFF_MS,
+   });
    if (runId) { ... recordExecutorBlocked(runId, 'rig_g_blocked', ...); }
    return;
  }
```

**Diff 3: isPlainObject null-proto**

```diff
- return Object.getPrototypeOf(value) === Object.prototype;
+ const proto = Object.getPrototypeOf(value);
+ return proto === Object.prototype || proto === null;
```

**Diff 4: New normalizer and wiring**

- New file: `packages/planning/src/modules/step-option-a-normalizer.ts` (materializeStepToOptionA, normalizeTaskStepsToOptionA).
- task-integration: import normalizer; in `finalizeNewTask` and `regenerateSteps` call `normalizeTaskStepsToOptionA(task as TaskWithSteps)`.

### Tests That Guard the Behavior

- **step-to-leaf-execution.test.ts:** `argsSource` on all results; array not explicit; null-proto is explicit; dig_block has `originalLeaf: 'dig_block'`.
- **step-option-a-normalizer.test.ts:** materialize (when allowed) writes back `meta.args`; normalize sets `planningIncomplete` when a step cannot be Option A. Under strict (live/cert), steps that would be derived must not be materialized; task gets planningIncomplete and executor blocks.
- **sterling-step-executor.test.ts:** blocks in live for derived/sentinel; dispatches in live for explicit Option A only; blocks when `planningIncomplete`. Any test that "materializes produces-only then live dispatches" is legacy-compat only and must be gated or updated for strict (live should block when step had only produces and normalizer did not write args).
- **golden-run-recorder.test.ts:** throttles duplicate `recordExecutorBlocked` within window.
- **Choke-point invariant:** finalizeNewTask path tested in `task-integration-pipeline.test.ts` (normalize called when task has steps). RegenerateSteps is the only other step-mutation site and calls normalize immediately after replacing steps.

### What to Do Next (Pick Up Here)

**Done (implemented):**

- **Strict normalizer:** Normalizer defaults to validation-only; `allowMaterialize` opt-in; `optionACompatUsed` and `planningIncompleteReasons` (bounded) set when applicable. Executor uses **deterministic** backoff for `planning_incomplete`.
- **Choke-point test:** `task-integration-pipeline.test.ts` has "Option A normalizer choke-point invariant" → finalizeNewTask path calls `normalizeTaskStepsToOptionA` when task has steps. RegenerateSteps is a single call site in the same file (normalize called immediately after `task.steps = updatedSteps`).
- **Loop-closure test (6.2):** `sterling-step-executor.test.ts` has "loop-closure integration (artifact-level proof)" → live dispatch is recorded in report (`dispatched_steps.length === 1`, `result` present, `executeTool` called as expected).
- **6.1 Sterling expansion and unknown leaves:** Step-author inventory documented in recap (3a. Step authors and Option A). Unknown-leaf integration test added: normalize sets `planningIncomplete` and `planningIncompleteReasons`; executor checks `planningIncomplete` before leaf resolution so unknown-leaf steps get deterministic backoff and `recordExecutorBlocked` (no hot-loop).

**Clear next steps (in order):**

1. **Optional follow-ups (6.5–6.7)**  
   Artifact keying by taskId (6.5); dig_block rewrite quarantine or move to Sterling (6.6); regeneration Option A safety (6.7). If a replan/regenerate loop is added for planningIncomplete tasks, document it and consider reclassifying planning_incomplete to transient. (6.3 done: recordExecutorBlocked on every early return. 6.4 done: execution.decisions[] append-only, capped at 200.)

**Commands to run before continuing:**

```bash
pnpm --filter planning test -- --run
pnpm --filter planning exec -- tsc --noEmit
```

---

## 1. Risks We Addressed

### 1.1 Two Competing Semantics Layers ("Sterling-light by accretion")

- **Risk:** The executor could accept steps without executor-native args and "make it work" by deriving args from `produces`/`consumes` (e.g. `recipe: output?.name || 'unknown'`). Tests were blessing that behavior, so TS semantics could become the de facto system and Sterling could stay under-specified.
- **Mitigation:** We made "derived args" a first-class, **non-certifiable** mode: `stepToLeafExecution` returns `argsSource: 'explicit' | 'derived'`. In **live** mode we **block** when `argsSource === 'derived'` and when sentinel values (`recipe === 'unknown'`, `input === 'unknown'`) appear. Option A (explicit executor-native args) is required for live dispatch.

### 1.2 Fail-Open Mapping Hiding Gaps

- **Risk:** `mapBTActionToMinecraft` had a `default` branch that returned `{ type: normalizedTool, parameters: args, debug }` for any unknown tool. Unmapped tools were never reported as "no mapping"; they became "some action" and failed later in confusing ways.
- **Mitigation:** We added a **strict** option. When `strict: true` (used on the executor path in `modular-server.ts`), the default case returns `null`. The toolExecutor already handled `!mappedAction` with `metadata.reason: 'no_mapped_action'`; we now treat that as a deterministic block with backoff so the task does not hot-loop.

### 1.3 Deterministic Blocks Hot-Looping

- **Risk:** After blocking (e.g. derived args, invalid args, no_mapped_action), the executor only set `blockedReason` and returned. Task eligibility was based on status (e.g. `pending`/`active`), so the same task could be re-selected every tick and produce repeated blocks and artifact writes.
- **Mitigation:** We set **`nextEligibleAt`** for all deterministic blocks (5-minute backoff). Eligibility logic in `task-block-evaluator.ts` already respects `nextEligibleAt`, so blocked tasks leave the hot path until the backoff expires.

### 1.4 Observability Becoming a Failure Mode

- **Risk:** Every `recordExecutorBlocked` call triggered an immediate merge and disk write. Under "bot not spawned" or "rate limited," the executor could write on every tick and create I/O storms and flakiness.
- **Mitigation:** We added **idempotency and throttling** in `GoldenRunRecorder.recordExecutorBlocked`: same `(runId, reason, leaf)` and equivalent payload within a 5-second window skip the write. Shadow dispatch already had step-key dedupe; blocked events now have equivalent protection.

### 1.5 Evidence Losing Plan Semantics (Leaf Rewrites)

- **Risk:** The executor rewrites `dig_block` → `acquire_material` in `stepToLeafExecution`. If artifacts only recorded the executed leaf, we would lose "what Sterling actually planned" and make it hard to remove the rewrite later.
- **Mitigation:** We added **`originalLeaf`** (optional) to `StepToLeafResult` when a rewrite occurs (e.g. `originalLeaf: 'dig_block'`). The executor passes it into `recordExecutorBlocked` payloads and into `recordDispatch` so both blocked and dispatched steps in the artifact preserve the original leaf when applicable.

### 1.6 Explicit-Args Gate Too Weak

- **Risk:** Using `typeof meta.args === 'object' && !Array.isArray(meta.args)` would treat arrays (and other non–plain objects) as "explicit," punching a hole in the live gate.
- **Mitigation:** We use a **plain-object check**: `proto === Object.prototype || proto === null`. Null-proto objects (`Object.create(null)`) count as explicit; arrays and class instances do not. Targeted test documents the null-proto policy.

---

## 1b. Tightenings (Option A Upstream, Backoff Taxonomy, Recorder, Schema)

### Option A Enforced Upstream (Single Choke Point, Validation-Only in Live/Cert)

- **Invariant:** In live and certifying modes, only Option A steps (plan-author-supplied `meta.args`) may dispatch. The normalizer is the single choke point but must be **validation-only** there: it does not synthesize `meta.args` from produces/consumes for live/cert.
- **Behavior:** `normalizeTaskStepsToOptionA(task)` runs after Sterling expansion and after any step mutation (finalizeNewTask, regenerateSteps). For live/cert: if a step would yield `argsSource: 'derived'` (no plain-object `meta.args` or only produces/consumes), the normalizer sets `task.metadata.planningIncomplete = true` and does **not** write `step.meta.args`. The task then never becomes live-dispatchable until the plan author emits explicit args. A dev/shadow-only "materialize for legacy" mode may be gated behind a flag; it is non-certifiable and must be removable.

### Backoff Taxonomy: Deterministic vs Transient

- **Deterministic (planner/materializer must change; condition does not clear without plan mutation):** derived args, sentinel args, invalid args, unknown leaf, task_type_bridge_only_shadow, no_mapped_action, "args must be plain object", **planning_incomplete** → **long backoff** (5 min). Constant: `DETERMINISTIC_BLOCK_BACKOFF_MS = 300_000`. For planning_incomplete, retrying every 30s would only burn executor cycles unless a replan/regenerate loop is implemented; if that is added later, reclassify and document the mechanism.
- **Transient (world/runtime must change):** rate_limited (canExecuteStep), rig_g_blocked (startTaskStep false) → **short backoff** (30 s). Constant: `TRANSIENT_BLOCK_BACKOFF_MS = 30_000`.

### Recorder: Eviction and Stable Fingerprint

- **Unbounded state:** `lastBlockedByKey` and `shadowObservedStepKeys` were never cleared. We now **evict per run** when the run has not been updated for `RUN_STALE_MS` (15 minutes). `evictStaleThrottleState()` runs after every `update()`.
- **Payload fingerprint:** Shallow sort could be defeated by nested objects or key-order differences. We use **stable deep fingerprint**: recursive key sorting, and **strip noise fields** (`dispatched_at`, `observed_at`, `timestamp`, `updated_at`, `created_at`) so timestamp jitter does not defeat idempotency.

### isPlainObject and Null-Prototype

- **Policy:** Null-prototype objects (`Object.create(null)`) are treated as **explicit** so "safe map" patterns and boundaries that produce null-proto args do not incorrectly block live dispatch. Check: `proto === Object.prototype || proto === null`. A targeted test enforces this.

### Artifact Schema Revision

- **Compatibility:** Added `schema_revision: 1` and `features: ['original_leaf', 'blocked_throttle_v1', 'strict_mapping_v1']` to new reports so downstream tools can reason about capability without parsing the whole artifact. `schema_version` remains `golden_run_report_v1`.

### Original-Leaf Exit Ramp

- **Transitional:** Preserving `original_leaf` in artifacts is the right evidence bridge. The **clean exit ramp** is: move the dig_block → acquire_material rewrite into the Sterling materializer (or remove it) once `acquire_material` is a first-class leaf Sterling can emit. Do not let the TS rewrite become permanent; govern when it is allowed vs forbidden and what Sterling is supposed to emit instead.

---

## 2. What We Implemented (Summary Table)

| Area | Change | Where | Why |
|------|--------|--------|-----|
| **Step → leaf** | `argsSource: 'explicit' \| 'derived'` | `packages/planning/src/modules/step-to-leaf-execution.ts` | So live mode can reject derived args and artifacts can record certifiability. |
| **Step → leaf** | `isPlainObject(meta.args)` for explicit | Same | Arrays/Dates/subclasses must not count as Option A. |
| **Step → leaf** | `originalLeaf?: string` on rewrite | Same | Preserve Sterling’s leaf in artifact when we rewrite (e.g. dig_block → acquire_material). |
| **Step → leaf** | `SENTINEL_RECIPE`, `SENTINEL_INPUT` exported | Same | Live mode rejects these; tests and executor share one definition. |
| **Executor** | Block in live when `argsSource === 'derived'` | `packages/planning/src/executor/sterling-step-executor.ts` | Enforce Option A for live dispatch. |
| **Executor** | Block in live when `recipe === 'unknown'` or `input === 'unknown'` | Same | Sentinel values indicate missing/fallback args. |
| **Executor** | `nextEligibleAt` for all deterministic blocks | Same | Avoid hot-loop: derived_args, sentinel_args, invalid_args, unknown_leaf, task_type_bridge, no_mapped_action, "args must be plain object". |
| **Executor** | Detect `no_mapped_action` from executeTool result and back off | Same | Mapping gap is deterministic; do not retry every tick. |
| **Executor** | Pass `original_leaf` into recorder for blocks and dispatch | Same | Artifact preserves plan semantics when rewrite occurred. |
| **Action mapping** | `mapBTActionToMinecraft(..., { strict: true })` returns null for unmapped | `packages/planning/src/modules/action-mapping.ts` | Fail-closed on executor path; only executor calls with strict. |
| **Runtime** | toolExecutor calls mapping with `strict: true` | `packages/planning/src/modular-server.ts` | So unmapped tools yield no_mapped_action and backoff. |
| **Recorder** | Throttle + idempotency for `recordExecutorBlocked` | `packages/planning/src/golden-run-recorder.ts` | Same (runId, reason, leaf) + same payload within 5s → skip write. |
| **Recorder** | Evict throttle/shadow state for runs stale > 15 min | Same | Avoid unbounded growth of lastBlockedByKey and shadowObservedStepKeys. |
| **Recorder** | Stable deep fingerprint; strip noise fields | Same | Nested objects and timestamp jitter do not defeat idempotency. |
| **Artifact schema** | `original_leaf` in blocked payload and dispatched_steps | Same | Evidence remains interpretable after rewrites. |
| **Artifact schema** | `schema_revision`, `features` on report | Same | Downstream compatibility handles without v2. |
| **Option A upstream** | `normalizeTaskStepsToOptionA` in finalizeNewTask and regenerateSteps (validation-only in live/cert) | `packages/planning/src/modules/step-option-a-normalizer.ts`, task-integration | Single choke point: in live/cert do not write meta.args when derived; set planningIncomplete. |
| **Executor** | planning_incomplete block with deterministic backoff | sterling-step-executor.ts | Condition does not clear without plan mutation; long backoff unless replan loop exists. |
| **Executor** | rate_limited and rig_g_blocked use TRANSIENT_BLOCK_BACKOFF_MS | Same | Transient blocks: short backoff, task stays visible. |
| **Step → leaf** | Null-proto objects count as explicit | step-to-leaf-execution.ts | `proto === null` in isPlainObject. |
| **Regression guard** | Test: after normalizer materializes step, live dispatches | sterling-step-executor.test.ts | Injected prereq and regenerated steps must have argsSource explicit. |

---

## 3. How It Works (Examples)

### 3.1 Step to Leaf: Explicit vs Derived

**Explicit (Option A) — allowed in live:**

```ts
// Step from Sterling with executor-native args
stepToLeafExecution({
  meta: { leaf: 'craft_recipe', args: { recipe: 'oak_planks', qty: 4 } }
});
// → { leafName: 'craft_recipe', args: { recipe: 'oak_planks', qty: 4 }, argsSource: 'explicit' }
```

**Derived — blocked in live:**

```ts
// Step with only produces/consumes (legacy)
stepToLeafExecution({
  meta: { leaf: 'craft_recipe', produces: [{ name: 'oak_planks', count: 4 }] }
});
// → { leafName: 'craft_recipe', args: { recipe: 'oak_planks', qty: 4 }, argsSource: 'derived' }
// In live mode the executor returns without dispatching and sets blockedReason + nextEligibleAt.
```

**Array args not explicit:**

```ts
stepToLeafExecution({
  meta: { leaf: 'craft_recipe', args: ['oak_planks', 4] } as any
});
// isPlainObject(meta.args) is false → falls through to legacy; result has argsSource: 'derived'.
```

### 3.2 Deterministic Block Backoff

When the executor blocks for a deterministic reason it updates task metadata with both `blockedReason` and `nextEligibleAt`:

```ts
ctx.updateTaskMetadata(task.id, {
  blockedReason: 'derived_args_not_allowed_live',
  nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS, // 5 min
});
```

`task-block-evaluator.ts` treats the task as ineligible while `now < metadata.nextEligibleAt`, so the task is not re-selected until the backoff expires.

### 3.3 Recorder Throttle

First call for a given (runId, reason, leaf) and payload writes. Second call with the same key and equivalent payload within 5 seconds skips the write:

```ts
recorder.recordExecutorBlocked(runId, 'rate_limited', { leaf: 'craft_recipe' });
recorder.recordExecutorBlocked(runId, 'rate_limited', { leaf: 'craft_recipe' });
// Second call does not call update(); report content unchanged.
```

### 3.4 Original Leaf in Artifact

When the step had `meta.leaf: 'dig_block'` and we rewrote to `acquire_material`, the artifact records both:

```json
"executor_blocked_payload": {
  "leaf": "acquire_material",
  "original_leaf": "dig_block",
  "argsSource": "derived"
}
```

So evidence stays tied to what Sterling planned, not only what we executed.

---

## 4. Design Decisions (For Reviewers)

- **Single implementation:** There is one `stepToLeafExecution` in `modules/step-to-leaf-execution.ts` and one `mapBTActionToMinecraft` in `modules/action-mapping.ts`. The executor imports directly from these modules (no barrel). Tests use the same functions.
- **Strict mapping only on executor path:** Only the toolExecutor in `modular-server.ts` calls `mapBTActionToMinecraft(..., { strict: true })`. Other callers do not pass strict.
- **Backoff taxonomy:** Deterministic blocks (5 min) vs transient (30 s) is encoded in constants and applied per block reason. Prevents "everything looks stuck" when a transient clears.
- **Throttle window:** 5 seconds for blocked-event idempotency. Stable deep fingerprint and noise-field stripping keep idempotency effective. Eviction after 15 min run staleness keeps throttle state bounded.
- **Schema:** Artifact remains `schema_version: 'golden_run_report_v1'`. `schema_revision` and `features` are additive compatibility handles. New fields (`original_leaf`, etc.) are additive.
- **Null-proto:** Explicit decision that `Object.create(null)` args count as explicit; test documents it.

---

## 5. Tests Added or Updated

- **step-to-leaf-execution.test.ts:** All results now expect `argsSource`; added test that `meta.args` as array is not explicit; dig_block expectation includes `originalLeaf: 'dig_block'`.
- **sterling-step-executor.test.ts:** Replaced "dispatches acquire_material when step has dig_block leaf" with "blocks in live when argsSource is derived"; added "dispatches acquire_material in live when step has explicit args"; added "blocks in live when sentinel recipe/input."
- **planner-action-boundary.test.ts:** Strict mode: unmapped tool with `strict: true` returns null; known tool with `strict: true` still returns mapped action.
- **golden-run-recorder.test.ts:** "throttles duplicate recordExecutorBlocked (same runId, reason, leaf) within window."

Run planning tests:

```bash
pnpm --filter planning test -- --run
```

---

## 5a. Acceptance criteria review (discrepancy check)

Use this checklist to confirm the system matches the stated design. Items marked **Done** are implemented and tested; **Gap** means a known shortfall or optional follow-up.

| Criterion | Status | Notes |
|-----------|--------|-------|
| **Strict Option A** — normalizer does not write `meta.args` for derived steps in live/cert; sets `planningIncomplete`. | Done | Default strict; `allowMaterialize` opt-in; call sites do not pass it. |
| **Single choke point** — all step mutations run through `normalizeTaskStepsToOptionA`. | Done | finalizeNewTask and regenerateSteps both call it. Choke-point test covers **finalizeNewTask** path only; **regenerateSteps** is same file and called immediately after `task.steps = updatedSteps` (no separate test). |
| **Executor blocks derived args in live** and sets `nextEligibleAt` (deterministic backoff). | Done | `derived_args_not_allowed_live`, `planning_incomplete`, etc. use `DETERMINISTIC_BLOCK_BACKOFF_MS`. |
| **planningIncomplete = deterministic backoff** (5 min). | Done | Executor uses 5 min; planningIncomplete checked before leaf resolution so unknown-leaf steps get backoff. |
| **Transient backoff** (30 s) for rate_limited and rig_g_blocked. | Done | `TRANSIENT_BLOCK_BACKOFF_MS` in executor. |
| **Eligibility respects nextEligibleAt**. | Done | `task-block-evaluator.ts` `isTaskEligible` returns false when `nowMs < task.metadata.nextEligibleAt`. |
| **Strict mapping on executor path** — `mapBTActionToMinecraft(..., { strict: true })` returns null for unmapped. | Done | toolExecutor in modular-server calls with strict. |
| **recordExecutorBlocked on every early return** when runId set. | Done | 6.3: unknown_leaf, no_mapped_action, navigating_in_progress, task_type_bridge_only_shadow. |
| **execution.decisions[]** append-only, bounded (200). | Done | 6.4: recordExecutorBlocked, recordDispatch, recordShadowDispatch append; cap in update(). |
| **Recorder throttle and eviction** — 5 s idempotency, 15 min stale eviction. | Done | golden-run-recorder. |
| **original_leaf in artifacts** when step leaf is rewritten. | Done | stepToLeafExecution and executor pass original_leaf; recorder stores in payloads. |
| **Choke-point invariant test** — normalize called when task gets steps. | Done | task-integration-pipeline.test.ts: finalizeNewTask path only. **Gap (minor):** no test that **regenerateSteps** path calls normalize; same file, single call site. |
| **Loop-closure test** — live dispatch recorded in report (dispatched_steps, result, executeTool). | Done | sterling-step-executor.test.ts. |
| **Unknown-leaf flow** — planningIncomplete + planningIncompleteReasons; executor backoff, no hot-loop. | Done | Normalizer sets reasons; executor checks planningIncomplete before leaf; test in executor. |
| **Artifact features list** in doc matches code. | Done | Recap snippet 7 updated to include `execution_decisions_v1`. |

**CLAUDE.md (solver observability):** R1–R4 apply to **solver** code (solveMeta.bundles, live backend, payload snapshot). They are out of scope for the task-to-execution pipeline recap; when a PR touches both solver and executor, both the recap criteria above and CLAUDE.md evidence requirements apply.

**Optional not done:** 6.5 (artifact keying by taskId), 6.6 (dig_block quarantine), 6.7 (regeneration Option A safety).

---

## 6. What Remains (Next Steps)

Prioritized so the next session can pick up the pipeline without re-deriving context.

### 6.1 Option A Step Creation (Unblocks Live Dispatch)

- **Status:** Done. Addressed by **step Option A normalizer** (single choke point). `normalizeTaskStepsToOptionA` runs in `finalizeNewTask` and after `regenerateSteps`; it **validates only** (strict default): when a step would yield `argsSource: 'derived'` or unknown leaf, it sets `planningIncomplete` and does not write `meta.args`. (Materialization from produces/consumes is dev/shadow-only behind `allowMaterialize: true`; call sites do not pass it.) Step-author inventory is documented in recap **3a. Step authors and Option A**: materializeSterlingIrSteps passes through expandByDigest `step.leaf`/`step.args` (Option A when backend emits args); generateLeafMappedSteps and Sterling solvers (via deriveLeafArgs in planner) supply args before normalizer. Unknown leaves: normalizer sets `planningIncomplete` and `planningIncompleteReasons`; executor checks `planningIncomplete` before leaf resolution so unknown-leaf steps get deterministic backoff and no hot-loop. Test: "unknown leaf: normalize sets planningIncomplete and planningIncompleteReasons; executor blocks with deterministic backoff (no hot-loop)" in `sterling-step-executor.test.ts`.

### 6.2 Loop-Closure Integration Test

- **Status:** Done. `sterling-step-executor.test.ts` has "loop-closure integration (artifact-level proof)": task with Option A step and `metadata.goldenRun.runId`, real `GoldenRunRecorder`, mocked `executeTool`; after `executeSterlingStep`, assert `getReport(runId).execution.dispatched_steps.length === 1`, `dispatched_steps[0].result` present, and `executeTool` called with expected tool/args.

### 6.3 recordExecutorBlocked on Every Early Return (Optional)

- **Status:** Done. Audited `sterling-step-executor.ts` and added `recordExecutorBlocked` where it was missing (when `runId` is set): (1) **unknown leaf** — when `stepToLeafExecution` returns null (task does not have planningIncomplete but step leaf is unmapped), record `unknown_leaf` with leaf name; (2) **no_mapped_action** — after executeTool returns metadata.reason `no_mapped_action`, record `no_mapped_action` with leaf/args; (3) **navigating_in_progress** — when `isNavigatingError(actionResult?.error)` bails, record `navigating_in_progress` with leaf and error; (4) **task_type_bridge_only_shadow** — recorder reason was `invalid_args`, changed to `task_type_bridge_only_shadow` to match `blockedReason`. Throttling in GoldenRunRecorder remains so I/O stays bounded.

### 6.4 execution.decisions[] (Optional)

- **Status:** Done. Added append-only `execution.decisions` to `GoldenRunReport`: type `ExecutionDecision` with `step_id?`, `leaf?`, `reason`, `ts`. Appended on each `recordExecutorBlocked` (reason + leaf/step_id from payload), `recordDispatch` (reason `'dispatch'`), and `recordShadowDispatch` (reason `'shadow'`). Capped at 200 entries per run (trim in `update()` after merge). Feature flag `execution_decisions_v1` in new reports. Tests: existing blocked test asserts one decision entry; new test "appends execution.decisions in order for block then dispatch then block" asserts linear story.

### 6.5 Artifact Keying by taskId (Optional)

- **Issue:** Artifacts are keyed by `runId`; execution and dedupe can be keyed by `taskId`. Confusion when dedupe reuses a runId or when fetching "the artifact for this task."
- **Action:** Add "fetch artifact by taskId" or a `task_id → run_id` index in the recorder so the right artifact can be loaded for the executing task.

### 6.6 dig_block → acquire_material Quarantine (Optional)

- **Issue:** The rewrite is semantic translation (Sterling says dig_block, TS runs acquire_material). It is preserved in artifacts via `original_leaf`, but the rewrite itself could be gated behind a legacy flag or moved upstream to Sterling so TS never changes leaf identity.
- **Action:** If desired, gate the rewrite behind a config flag and fail-closed in live when the flag is off; or move the remap into the Sterling materializer and remove it from step-to-leaf-execution.

### 6.7 Regeneration and Option A (Optional)

- **Issue:** After retries, `regenerateSteps` can produce new steps. If those steps are legacy-shaped (produces/consumes, no `meta.args`), live mode will block them and the task can be stuck in a block–regenerate–block loop.
- **Action:** Either require regeneration to output Option A `meta.args`, or disable regeneration in live until that is guaranteed, and record a clear block reason when regeneration is not Option A–safe.

---

## 7. File Map (Quick Reference)

| Path | Role |
|------|------|
| `packages/planning/src/modules/step-to-leaf-execution.ts` | Step meta → leaf + args + argsSource + originalLeaf; isPlainObject (null-proto allowed); sentinels. |
| `packages/planning/src/modules/step-option-a-normalizer.ts` | materializeStepToOptionA, normalizeTaskStepsToOptionA; single choke point for Option A / planningIncomplete. |
| `packages/planning/src/modules/action-mapping.ts` | mapBTActionToMinecraft(tool, args, options?); strict => null for unmapped. |
| `packages/planning/src/modules/leaf-arg-contracts.ts` | validateLeafArgs, normalizeLeafArgs. |
| `packages/planning/src/executor/sterling-step-executor.ts` | executeSterlingStep: planningIncomplete check; stepToLeaf → validate → allowlist → shadow/live → executeTool; deterministic vs transient backoff; original_leaf in payloads. |
| `packages/planning/src/executor/sterling-step-executor.types.ts` | Context and config types for the executor. |
| `packages/planning/src/golden-run-recorder.ts` | GoldenRunReport (schema_revision, features); recordExecutorBlocked (throttle + stable fingerprint + evict stale); recordDispatch; recordShadowDispatch. |
| `packages/planning/src/task-integration.ts` | finalizeNewTask calls normalizeTaskStepsToOptionA; regenerateSteps calls normalizeTaskStepsToOptionA after updating steps. |
| `packages/planning/src/modular-server.ts` | buildSterlingStepExecutorContext; toolExecutor.execute with mapBTActionToMinecraft(..., { strict: true }); autonomous loop calling executeSterlingStep. |
| `packages/planning/src/server/task-block-evaluator.ts` | isTaskEligible: respects metadata.nextEligibleAt. |

---

## 8. Commands for Review and Continuation

```bash
# Run all planning tests
pnpm --filter planning test -- --run

# Run only executor and step-to-leaf tests
pnpm --filter planning test -- --run src/executor/__tests__/sterling-step-executor.test.ts src/modules/__tests__/step-to-leaf-execution.test.ts src/__tests__/golden-run-recorder.test.ts

# Typecheck
pnpm --filter planning exec -- tsc --noEmit
```

To pick up the pipeline: 6.1–6.4 are done. Three-digest truth model is wired and tested (122/122 tests). Direct Solver (Path A) proven end-to-end with live bot. Next priorities: Sterling IR live E2E (Path B), stuck-task re-plan trigger, optionally 6.5–6.7.

---

## 9. Full pipeline wiring (planning to bot)

The pipeline from task steps to the Minecraft/bot interface is wired end-to-end. Chain:

1. **Autonomous executor** (`modular-server.ts`): Gets active tasks, filters by `isTaskEligible` (respects `metadata.nextEligibleAt`), picks highest-priority task. If task has executable steps (`hasExecutablePlan`), finds first `!done && isExecutableStep(s)` step; if `stepToLeafExecution(nextStep)` returns a leaf, builds `buildSterlingStepExecutorContext()` and calls **executeSterlingStep(currentTask, nextStep, sterlingCtx)**.
2. **executeSterlingStep**: Checks `planningIncomplete` (then backoff/recordExecutorBlocked), resolves leaf, validates, allowlist, mode (shadow/live). In live, calls **ctx.executeTool(toolName, args, signal)**.
3. **Context executeTool** (from `buildSterlingStepExecutorContext`): Calls **toolExecutor.execute(toolName, args, signal)**.
4. **toolExecutor.execute**: Normalizes tool name, **mapBTActionToMinecraft(normalizedTool, args, { strict: true })**. If unmapped returns `no_mapped_action`. If not `MCP_ONLY`, calls **executeActionWithBotCheck(mappedAction, taskId, signal)**.
5. **executeActionWithBotCheck**: **executeTaskViaGateway(taskId, action, signal)** (or executeViaGateway with origin `executor`).
6. **executeViaGateway**: Resolves **EXECUTOR_MODE** (default `shadow`). In live: **checkBotConnectionDetailed()**, then **mcPostJson('/action', { type, parameters }, timeout, signal)** to **MINECRAFT_ENDPOINT** (default `http://localhost:3005`).

So wiring is complete. To **test the full pipeline** (planning to real bot):

- **Bot / MC interface** running and reachable at `MINECRAFT_ENDPOINT` (default `http://localhost:3005`).
- **EXECUTOR_MODE=live** and **EXECUTOR_LIVE_CONFIRM=YES** so the gateway dispatches (not shadow).
- **MCP_ONLY** unset or `false` so toolExecutor uses the direct `/action` path (not MCP-only block).
- **ENABLE_PLANNING_EXECUTOR=1** so the autonomous loop runs.
- Task with Option A steps (or shadow-first proof per `docs/planning/golden-run-runbook.md`).

Recommended: run **shadow proof first** (runbook: `run-golden-reduce`, artifact with `execution.shadow_steps` or `executor_blocked_reason`), then enable live + bot for a single task and confirm one step reaches the bot.

---

## 10. Three-Digest Truth Model (Intent Resolution Pipeline)

### Architecture

The Sterling IR pipeline (`materializeSterlingIrSteps`) now produces three content-addressed digests:

```
expand_by_digest_v1  →  intent steps  [task_type_craft, {proposition_id, lemma}]
        ↓                              expansionDigest (SHA-256, never overwritten)
resolve_intent_steps  →  executable steps  [craft_recipe, {recipe: "oak_planks", qty: 4}]
        ↓                              intentResolutionDigest (SHA-256, resolved steps only)
splice into final plan  →  finalSteps  [navigate_to, craft_recipe, place_block]
                                       executorPlanDigest (SHA-256, always defined)
```

| Digest | Scope | When computed | Mutability |
|--------|-------|---------------|------------|
| `expansionDigest` | Raw expansion output from `expand_by_digest` | After expansion response | Never overwritten |
| `intentResolutionDigest` | Only the resolved intent replacement steps | After `resolve_intent_steps` | Never overwritten |
| `executorPlanDigest` | Full final step list the executor will run | Always, unconditionally | Recomputed if steps change |

**Key invariant:** `executorPlanDigest` is always defined. It represents "what will run." When no intent splice occurred, it equals the hash of the expansion steps directly (same content, same canonical form). This eliminates brittle inference of "digest absent means check expansion digest."

### Intent Splicing

`materializeSterlingIrSteps` walks the expansion plan:
- Non-intent steps (e.g. `navigate_to`, `place_block`) pass through unchanged.
- Intent leaves (e.g. `task_type_craft`) are replaced by their resolved equivalents (e.g. `craft_recipe { recipe: "oak_planks", qty: 4 }`).
- A `didSplice` boolean tracks whether any replacement actually occurred.
- `replacementMap` tracks per-intent-index → resolved steps for partial resolution scenarios.

### Canonicalization

All digests use `canonicalize()` from `sterling/solve-bundle.ts` for deterministic JSON serialization (sorted keys, stable ordering). The digest input is `finalSteps.map(s => ({ leaf: s.leaf, args: s.args }))` — only the leaf name and args, not metadata or ordering hints.

### Golden-Run Recorder

`GoldenRunReport.expansion` type now includes:
- `executor_plan_digest?: string` — SHA-256 of the final step list
- `intent_resolution_digest?: string` — SHA-256 of resolved intent steps only

Production code writes these via the recorder after intent resolution completes.

---

## 11. Live E2E Proof: Direct Solver (Path A)

### Test Setup

- `pnpm start` with all 10 services (planning, cognition, minecraft-interface, sterling, etc.)
- Bot given 16 oak_log via `rcon-cli "give BotSterling oak_log 16"`
- Task posted: `POST /task` with `{ title: "Craft 4 oak planks", requirementCandidate: { type: "craft", item: "oak_planks", count: 4 } }`

### Result

Task completed end-to-end through the Direct Solver pipeline:

```
POST /task → generateDynamicSteps → mcData fallback (1.21.9→1.21.4)
  → MinecraftCraftingSolver → craft_recipe { recipe: "oak_planks", qty: 4 }
  → normalizeTaskStepsToOptionA (argsSource: explicit) → executor dispatch
  → bot crafts oak_planks → task completed (2083ms)
```

Evidence:
- `craftingPlanId: "f3ca2bcd943f8c83"`
- Step: `craft_recipe { recipe: "oak_planks", qty: 4 }` with `meta.executable: true`
- Full observability: `bundleHash`, `traceBundleHash`, `stepsDigest`, `solveJoinKeys`
- `requirement.have: 4, requirement.needed: 0` → task completed

### mcData Version Fallback

`minecraft-data` npm package returns null for version 1.21.9 (only supports up to 1.21.4). `getMcData()` in `sterling-planner.ts` now falls back:

```ts
this._mcDataCache = mcDataLoader(requestedVersion);
if (!this._mcDataCache) {
  const fallback = '1.21.4';
  console.warn(`minecraft-data has no data for ${requestedVersion}, falling back to ${fallback}`);
  this._mcDataCache = mcDataLoader(fallback);
}
```

### Known Gaps

- **Path B (Sterling IR) live E2E not yet proven:** Requires `sterling_ir` task from thought-to-task conversion.
- **Stuck tasks:** Tasks with `solver-unsolved` and 0 steps are permanently ineligible — no re-plan trigger when inventory changes (`task-block-evaluator.ts:134-137`).
- **Goal endpoint:** `POST /goal` doesn't call `inferRequirementFromEndpointParams`, so tasks created via goals get `requirement: null` and route to `unplannable`. Use `POST /task` with `requirementCandidate` instead.
