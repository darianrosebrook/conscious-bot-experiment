# Task-to-Execution Pipeline: Overview for Review and Handoff

**Purpose:** One document for reviewers and the next implementer: what was done, why we chose it, how it works (with examples), and what to do next. Use this for code review and to resume work without re-deriving context.

**Canonical recap (implementation detail):** `docs/planning/TASK_TO_EXECUTION_PIPELINE_RECAP_AND_NEXT_STEPS.md`

---

## 1. What We Completed (High Level)

### 1.1 Pipeline Hardening (Option A, Backoff, Recorder)

- **Option A boundary:** Only steps with **plan-author-supplied** executor-native `meta.args` (plain object) may dispatch in live. TypeScript does not synthesize args from `produces`/`consumes` for live/cert; the normalizer is **validation-only** (single choke point).
- **Backoff taxonomy:** Deterministic blocks (e.g. derived args, unknown leaf, no_mapped_action) use **5-minute** backoff; transient blocks (rate_limited, rig_g_blocked) use **30-second** backoff. Eligibility respects `nextEligibleAt`, so blocked tasks do not hot-loop.
- **Strict mapping:** On the executor path, `mapBTActionToMinecraft(..., { strict: true })` returns `null` for unmapped tools; executor treats that as `no_mapped_action` and applies deterministic backoff.
- **Recorder:** Throttled and idempotent `recordExecutorBlocked` (5 s window, stable payload fingerprint); eviction of throttle/shadow state when a run is stale (15 min); `original_leaf` in artifacts when step leaf is rewritten (e.g. dig_block → acquire_material); artifact `schema_revision` and `features` for compatibility.

### 1.2 Intent Resolution Pipeline and Three-Digest Truth Model

- **Three-digest truth model:** Every task that passes through the Sterling IR pipeline now carries three content-addressed digests:
  - `expansionDigest` — SHA-256 of the canonical JSON from `expand_by_digest`, never overwritten after expansion.
  - `intentResolutionDigest` — SHA-256 covering only the resolved intent replacement steps (from `resolve_intent_steps`).
  - `executorPlanDigest` — SHA-256 of the canonical JSON of the final step list the executor will run. **Always defined** (unconditional computation), so downstream code never needs to infer "digest absent means check expansion digest."
- **Intent splicing:** `materializeSterlingIrSteps` splices resolved steps into the expansion plan, preserving ordering (non-intent steps like `navigate_to` and `place_block` pass through unchanged; intent leaves like `task_type_craft` are replaced by their resolved equivalents like `craft_recipe`).
- **`didSplice` tracking:** Boolean set true only when replacement steps are actually pushed into `finalSteps`, mirroring production's reference-identity check (`finalSteps !== response.steps`).
- **Golden-run recorder instrumentation:** `GoldenRunReport.expansion` type now includes `executor_plan_digest` and `intent_resolution_digest` fields.
- **Controlled E2E tests (122/122 pass):**
  - Test 1: Mixed plan (navigate_to + task_type_craft + place_block), all intents resolved → verifies splice ordering, three-digest separation, `didSplice: true`.
  - Test 2: Mixed plan with partial resolution (task_type_craft resolved, task_type_mine unresolvable) → verifies craft replaced, mine kept, partial `intentResolutionMeta` shape.

### 1.3 mcData Version Fallback and Live E2E Proof

- **mcData fallback:** `minecraft-data` npm package only supports up to version 1.21.4; bot runs 1.21.9. Added fallback in `getMcData()` (`sterling-planner.ts`) to use 1.21.4 when the requested version returns null. This unblocked the entire Direct Solver pipeline (Path A).
- **Live E2E proof (Direct Solver / Path A):** Task created via `POST /task` → Sterling Rig A → mcData fallback 1.21.9→1.21.4 → crafting solver solved → `craft_recipe { recipe: "oak_planks", qty: 4 }` with `executable: true` → executor dispatched live → task completed in 2083ms. Full observability chain: `craftingPlanId`, `bundleHash`, `traceBundleHash`, `stepsDigest`, `solveJoinKeys`.
- **Two execution pipelines identified:**
  - **Path A (Direct Solver):** `POST /task` → `generateDynamicSteps` → crafting solver → Option A steps → executor dispatch. Proven end-to-end.
  - **Path B (Sterling IR):** thought → reducer → `expand_by_digest` → `resolve_intent_steps` → executor. Intent resolution pipeline wired and tested at unit/integration level; live E2E requires organic thought generation or synthetic `sterling_ir` task.

### 1.4 Milestones 6.1–6.4 (Prior Session)

- **6.1 Sterling expansion and unknown leaves:** Documented step authors (materializeSterlingIrSteps, generateLeafMappedSteps, Sterling solvers). Unknown-leaf steps: normalizer sets `planningIncomplete` and `planningIncompleteReasons`; executor checks `planningIncomplete` **before** resolving leaf so unknown-leaf steps get deterministic backoff and `recordExecutorBlocked` (no hot-loop). Test added in `sterling-step-executor.test.ts`.
- **6.2 Loop-closure test:** Integration test asserts that a live dispatch is recorded in the golden-run report (`dispatched_steps.length === 1`, `result` present, `executeTool` called).
- **6.3 recordExecutorBlocked on every early return:** Executor now calls `recordExecutorBlocked` (when `runId` is set) for: unknown leaf, no_mapped_action, navigating_in_progress, task_type_bridge_only_shadow. Recorder reason aligned with `blockedReason`.
- **6.4 execution.decisions[]:** Golden-run report has append-only `execution.decisions` (step_id?, leaf?, reason, ts), appended on each block, dispatch, and shadow dispatch; capped at 200. Feature `execution_decisions_v1` in report `features`.

### 1.3 Lint and Type Fixes (Last Commit)

- **Planning:** `mapBTActionToMinecraft` return type includes optional `timeout`; executor reads `actionResult.metadata.reason` via safe cast; normalizer tests use `StepWithMeta`/`TaskWithMeta`; planner-action-boundary tests add null guards after `mapBTActionToMinecraft`.
- **Cognition:** Sterling-runtime-integration tests use correct `IdleDetectorConfig` shape (`recentTaskConversionWindowMs`, `recentUserCommandWindowMs`); eligibility test mocks match `ReducerResultView` (required fields, `world_snapshot_digest` on grounding, intent in `advisory`).
- **Minecraft-interface:** Asset-server narrows `pvPublicDir` in callback so `path.join` receives `string`.

**Verification:** `pnpm exec tsc --noEmit` and `pnpm run lint` pass at repo root.

---

## 1.4 Cognitive Stream to Task: Required Reduction Shape (API Contract)

Planning's thought-to-task path (TaskIntegration.processActionableThoughts → convertThoughtToTask) only creates a task when the thought has a **reduction** that satisfies the converter contract. Tests (e.g. `thought-to-task-converter.test.ts`) use a full `makeReduction()` shape; manual curl or bot/Sterling payloads must match.

**Required for task creation:**

- `metadata.reduction.sterlingProcessed === true`
- `metadata.reduction.isExecutable === true`
- `metadata.reduction.reducerResult.committed_ir_digest` — non-empty string
- `metadata.reduction.reducerResult.schema_version` — non-empty string

If any of these are missing, `resolveReduction()` returns `dropped_*` (e.g. `dropped_missing_schema_version`) and no task is created. The thought still appears in `/recent` and `/actionable` with `convertEligible: true`, but the converter exits before `addTask`.

**Working curl (forces a thought that will convert to a task):**

```bash
curl -s -X POST "http://localhost:3003/api/cognitive-stream" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "intrusive",
    "content": "I should gather some dirt blocks",
    "attribution": "self",
    "convertEligible": true,
    "context": { "confidence": 0.8, "cognitiveSystem": "debug" },
    "metadata": {
      "reduction": {
        "sterlingProcessed": true,
        "isExecutable": true,
        "envelopeId": "debug-env",
        "reducerResult": {
          "committed_ir_digest": "debug_digest",
          "schema_version": "1"
        }
      }
    }
  }'
```

**Drift:** A payload that omits `reducerResult.schema_version` (e.g. only `committed_ir_digest`) is accepted by cognition and returned by `/recent`/`/actionable`, but the converter drops it with `dropped_missing_schema_version`. Ensure any producer (Sterling, bot, or manual test) includes both `committed_ir_digest` and `schema_version` in `reducerResult`.

### 1.5 Fresh-Server Test: Findings and Fix (GET /tasks visibility)

**Test:** Fresh `pnpm start`, then POST thought with full reduction (section 1.4 curl), wait for thought-poll interval (~30s), then `GET http://localhost:3002/tasks`.

**Observed:**

- No terminal errors. Cognition returned 200 for POST and ack; Planning logged `[CognitiveStream] Fetched 1 actionable thoughts`, `Task added to enhanced integration: I should gather some dirt blocks`, and `[Thought-to-task] Census: fetched=1 converted=1 skipped=0 acked=1`.
- `GET /tasks` returned `current: [], total: 0` even though the task was created.

**Cause:** New sterling_ir tasks from the converter go through `materializeSterlingIrSteps()`. When expansion is blocked or fails (e.g. no steps yet, or solver returns blocked), `addTask` sets `status: 'pending_planning'`. `getActiveTasks()` (used by GET /tasks for "current" tasks) only included `active` and `pending`, so `pending_planning` tasks were omitted.

**Fix:** Include `pending_planning` in `getActiveTasks()` in `task-integration.ts` so GET /tasks shows sterling_ir tasks that are awaiting step expansion. Executor and other eligibility checks still use `isTaskEligible()`, which correctly treats `pending_planning` as not dispatchable.

**Other terminal notes:** Node `--trace-warnings` messages and MLX/Cognition 503s during startup are pre-existing. Duplicate ack log (`Acked 0/1 thoughts`) after the first successful ack is a known harmless race.

---

## 2. Why We Chose This (Decisions and Rationale)

| Decision | Reason |
|----------|--------|
| **Block derived args in live** | So TypeScript never becomes the de facto semantics layer; only plan-author-supplied Option A steps may dispatch in live. |
| **Strict mapping (strict: true on executor path only)** | Unmapped tools must surface as `no_mapped_action` and back off, not be passed through as a generic action and fail later in confusing ways. |
| **Single Option A choke point (validation-only in live/cert)** | All step mutations go through `normalizeTaskStepsToOptionA`. In live/cert it does not write `meta.args` for derived steps; it sets `planningIncomplete` so the task is not live-dispatchable until the plan author emits explicit args. |
| **Two backoff classes (5 min vs 30 s)** | Deterministic conditions (e.g. unknown leaf, no_mapped_action) do not clear without plan change; retrying every 30 s would only burn executor cycles. Transient conditions (rate limit, rig not ready) can clear; short backoff keeps the task visible. |
| **planningIncomplete = deterministic backoff** | Same as above: without a replan loop, long backoff until replan is implemented (then we can reclassify if desired). |
| **Recorder throttle + eviction + stable fingerprint** | Prevents I/O storms when many blocks occur (e.g. "bot not spawned"); eviction keeps throttle state bounded; stripping timestamps from fingerprint keeps idempotency effective. |
| **Null-proto counts as explicit** | Boundaries that use `Object.create(null)` for args are not wrongly blocked in live; one shared `isPlainObject` (proto === Object.prototype \|\| proto === null). |
| **original_leaf in artifacts** | Evidence preserves what Sterling planned when we rewrite (e.g. dig_block → acquire_material); exit ramp is to move the rewrite upstream to Sterling. |
| **execution.decisions[]** | Linear story of blocks and dispatches per run for debugging and audit without parsing full payloads. |

**Naming:** `task.metadata.planningIncomplete` (camelCase) is the task flag; `blockedReason: 'planning_incomplete'` (snake_case) is the executor reason string. Both denote the same condition; conventions differ by layer.

---

## 3. How It Works (Examples)

### 3.1 Option A vs Derived (Step-to-Leaf)

**Explicit (Option A) — allowed in live:**

```ts
stepToLeafExecution({
  meta: { leaf: 'craft_recipe', args: { recipe: 'oak_planks', qty: 4 } }
});
// → { leafName: 'craft_recipe', args: { ... }, argsSource: 'explicit' }
```

**Derived — blocked in live:**

```ts
stepToLeafExecution({
  meta: { leaf: 'craft_recipe', produces: [{ name: 'oak_planks', count: 4 }] }
});
// → argsSource: 'derived'. Executor sets blockedReason + nextEligibleAt (5 min) and returns.
```

### 3.2 Normalizer (Choke Point)

- **Call sites:** `finalizeNewTask` and `regenerateSteps` in `task-integration.ts` both call `normalizeTaskStepsToOptionA(task)` (no options → strict).
- **Strict behavior:** For each step, if `stepToLeafExecution(step)` would return `argsSource: 'derived'` or unknown leaf, the normalizer sets `task.metadata.planningIncomplete = true` and does **not** write `step.meta.args`. The task is then not live-dispatchable until the plan author supplies explicit args.
- **Opt-in materialize:** Only if a caller passed `allowMaterialize: true` would the normalizer write `meta.args` from produces/consumes; call sites do not pass it. When used, the normalizer sets `task.metadata.optionACompatUsed = true` (non-certifiable, metered).

### 3.3 Executor Early Returns and recordExecutorBlocked

When the executor bails early and `runId` is set, it now consistently:

1. Updates task metadata (`blockedReason`, `nextEligibleAt`).
2. Calls `recordExecutorBlocked(runId, reason, payload)`.

Reasons include: `planning_incomplete`, `unknown_leaf`, `no_mapped_action`, `navigating_in_progress`, `task_type_bridge_only_shadow`, `derived_args_not_allowed_live`, and others. Each appends to `execution.decisions` (capped at 200).

### 3.4 Artifact Shape (Relevant Fields)

```json
{
  "schema_version": "golden_run_report_v1",
  "schema_revision": 1,
  "features": ["original_leaf", "blocked_throttle_v1", "strict_mapping_v1", "execution_decisions_v1"],
  "execution": {
    "dispatched_steps": [...],
    "decisions": [
      { "reason": "planning_incomplete", "leaf": "unknown_leaf_xyz", "ts": 1234567890 },
      { "reason": "dispatch", "step_id": "s1", "ts": 1234567891 }
    ]
  }
}
```

Blocked payloads and dispatched steps can include `original_leaf` when the step leaf was rewritten (e.g. dig_block → acquire_material).

---

## 4. What to Do Next (Pick Up Here)

### 4.1 Verification Before Any New Work

```bash
pnpm --filter planning test -- --run
pnpm exec tsc --noEmit
pnpm run lint
```

### 4.2 Sterling IR Pipeline: Live E2E (Path B)

- **Current state:** Intent resolution is wired and tested at unit/integration level (122/122 tests). Live E2E requires a `sterling_ir` task (created by thought-to-task conversion from cognitive stream). The `resolve_intent_steps` WS command exists on the Sterling side.
- **Next:** Generate an organic thought or post a synthetic thought with full reduction shape (section 1.4 curl) and trace through `materializeSterlingIrSteps` → `resolve_intent_steps` → executor dispatch.

### 4.3 Stuck-Task Re-Plan Trigger

- **Issue:** Tasks with `solver-unsolved` and 0 steps are permanently ineligible (`isTaskEligible` returns false for pending tasks with 0 steps at `task-block-evaluator.ts:134-137`). No re-plan trigger fires when inventory changes.
- **Action:** Add inventory-change listener that re-evaluates solver-unsolved tasks, or implement a replan loop for `planningIncomplete` tasks.

### 4.4 Optional Follow-Ups (6.5–6.7)

- **6.5 Artifact keying by taskId:** Add a way to fetch or index artifact by `taskId` (e.g. task_id → run_id) so "the artifact for this task" is unambiguous.
- **6.6 dig_block → acquire_material quarantine:** Gate the rewrite behind a config flag and fail-closed in live when off, or move the remap into the Sterling materializer and remove it from step-to-leaf-execution.
- **6.7 Regeneration and Option A:** Ensure regeneration outputs Option A steps, or disable regeneration in live until guaranteed, and record a clear block reason when regeneration is not Option A–safe.

### 4.3 If You Add a Replan Loop

If tasks with `planningIncomplete` get a replan/regenerate loop that can fix them, consider reclassifying `planning_incomplete` from deterministic to transient and document the mechanism.

### 4.4 Evidence / CLAUDE.md

For **solver** observability (solveMeta.bundles, live backend, payload snapshot), see `CLAUDE.md` R1–R4 in the repo root. Those apply to solver code; the pipeline recap and this overview cover the **task-to-execution** path (executor, normalizer, recorder, artifact).

---

## 5. File Map (Where to Look)

| Path | Role |
|------|------|
| `packages/planning/src/modules/step-to-leaf-execution.ts` | argsSource, isPlainObject (null-proto), originalLeaf, sentinels. |
| `packages/planning/src/modules/step-option-a-normalizer.ts` | materializeStepToOptionA, normalizeTaskStepsToOptionA; planningIncomplete. |
| `packages/planning/src/modules/action-mapping.ts` | mapBTActionToMinecraft; strict => null for unmapped. |
| `packages/planning/src/executor/sterling-step-executor.ts` | planningIncomplete check before leaf; backoff; recordExecutorBlocked on early returns. |
| `packages/planning/src/golden-run-recorder.ts` | Throttle, eviction, fingerprint; execution.decisions; schema_revision, features; executor_plan_digest, intent_resolution_digest in expansion. |
| `packages/planning/src/task-integration.ts` | finalizeNewTask / regenerateSteps call normalizeTaskStepsToOptionA; materializeSterlingIrSteps with intent splicing and three-digest model (executorPlanDigest always defined). |
| `packages/planning/src/task-integration/sterling-planner.ts` | Sterling solver wiring; getMcData() with version fallback (1.21.9→1.21.4). |
| `packages/planning/src/modular-server.ts` | toolExecutor uses mapBTActionToMinecraft(..., { strict: true }). |
| `packages/planning/src/server/task-block-evaluator.ts` | isTaskEligible respects nextEligibleAt; returns false for pending tasks with 0 steps. |
| `packages/planning/src/sterling/solve-bundle.ts` | canonicalize() used by three-digest model for content-addressed hashing. |

---

## 6. Acceptance Checklist (For Reviewers)

Use this to confirm behavior matches the design.

- [ ] **Strict Option A** — Normalizer does not write `meta.args` for derived steps in live/cert; sets `planningIncomplete`. Call sites do not pass `allowMaterialize`.
- [ ] **Single choke point** — All step mutations go through `normalizeTaskStepsToOptionA` (finalizeNewTask and regenerateSteps).
- [ ] **Executor blocks derived args in live** and sets `nextEligibleAt` (5 min) for deterministic blocks.
- [ ] **planningIncomplete** uses deterministic backoff; executor checks it before leaf resolution (unknown-leaf steps get backoff, no hot-loop).
- [ ] **Transient backoff** (30 s) for rate_limited and rig_g_blocked.
- [ ] **Eligibility** respects `nextEligibleAt` (task-block-evaluator).
- [ ] **Strict mapping** on executor path only; unmapped tools yield `no_mapped_action` and backoff.
- [ ] **recordExecutorBlocked** called on every early return when runId is set (unknown_leaf, no_mapped_action, navigating_in_progress, task_type_bridge_only_shadow, etc.).
- [ ] **execution.decisions[]** append-only, capped at 200; present in report when feature `execution_decisions_v1` is set.
- [ ] **Recorder** throttle (5 s), eviction (15 min stale), stable fingerprint (noise fields stripped).
- [ ] **original_leaf** in artifact when step leaf is rewritten.
- [ ] **Tests:** Choke-point (finalizeNewTask path), loop-closure (dispatch in report), unknown-leaf (planningIncomplete + backoff), golden-run decisions order.
- [ ] **Lint and typecheck** pass (`pnpm run lint`, `pnpm exec tsc --noEmit`).

---

## 7. Commit and Push (Done)

Latest commit on `main`: lint and type fixes; pipeline Option A recap; execution.decisions and golden-run artifacts; TASK_TO_EXECUTION_PIPELINE_RECAP_AND_NEXT_STEPS.md added; EXPAND_BY_DIGEST_NEXT_MILESTONE.md removed. Pushed to origin.
