# Pattern A Milestone Handoff — Review and Next Steps

**Purpose:** Provide reviewers and intake a detailed overview of what was completed across recent sessions, why those choices were made, how to verify them, and what to do next. Use for PR review, task intake, and continuity.

**References:**
- `PATTERN_A_IMPLEMENTATION_HANDOFF.md` — executor shadow proof, bridge quarantine
- `PATTERN_A_GOLDEN_RUN_SESSION_OVERVIEW.md` — design, leaf fork, precedence invariant
- `RUNTIME_CONFIG_AUDIT.md` — env scatter audit, config pattern priority
- `golden-run-runbook.md` — run commands, env
- Sterling: `docs/working/implementation/expand_by_digest_pattern_a_overview.md`

---

## 1. Executive Summary

We proved **executor acceptance in shadow mode** end-to-end: one golden run produces an artifact with `expansion.status === "ok"` and `execution.shadow_steps.length >= 1` without Minecraft or other dependencies. We then tightened evidence quality (loop_started derivation, shadow idempotency), fenced bypass flags, and introduced a centralized `PlanningRuntimeConfig` plus an env-scatter tripwire. The **next milestone** is **live Option A**: no bypass flags, `EXECUTOR_MODE=live`, Sterling emits `craft_recipe` with executor-native args, planning dispatches `minecraft.craft_recipe` live.

---

## 2. What Was Completed (By Session Theme)

### 2.1 Executor Shadow Proof

**Goal:** One artifact with both expansion ok and executor-observed dispatch.

**Changes:**
- **EXECUTOR_SKIP_READINESS=1:** Start executor without minecraft/memory/dashboard; skip bot/health checks in shadow mode so the loop runs and records shadow steps.
- **Option B bridge quarantine:** `task_type_craft` only in allowlist when `ENABLE_TASK_TYPE_BRIDGE=1`; forbidden in production. Tripwire test asserts allowlist does not contain `minecraft.task_type_craft` when bridge disabled.
- **task_type_craft contract:** Permissive (validate returns null) so executor can record shadow steps; args stored verbatim.
- **Executor-blocked precedence:** When recording any dispatch (shadow or live), clear `executor_blocked_reason` and `executor_blocked_payload` so empty dispatch is never ambiguous with stale blocked state.
- **GET golden-run-artifact:** `GET /api/dev/golden-run-artifact/:runId` fetches artifact by run_id.

**Evidence:** Run `b46d4658-e2b8-4987-8677-5d74334f17e3` shows `expansion.status === "ok"`, `execution.shadow_steps.length >= 1` (originally 8, later idempotency reduces duplicates), `runtime.executor.mode === "shadow"`.

---

### 2.2 Evidence Quality Fixes

**Issue 1: loop_started false while dispatch exists**

Artifacts showed `runtime.executor.loop_started === false` despite `shadow_steps.length > 0`, which contradicts the evidence.

**Fix:** `deriveLoopStarted()` in `golden-run-recorder.ts` — at report read/serialization time, set `loop_started = true` when `(shadow_steps.length + dispatched_steps.length) > 0`. Applied in `getReport()`, `getReportFromDisk()`, and report serialization.

**Rule:** Dispatch evidence implies loop started; artifact cannot contradict itself.

---

**Issue 2: Repeated shadow dispatch of the same step**

The scheduler was re-selecting the same pending step each poll; the recorder stored every observation, producing many duplicate entries for the same `step_id`.

**Fix:** Shadow dispatch idempotency — `recordShadowDispatch()` uses `shadowObservedStepKeys` (Map<runId, Set<stepKey>>). If `(run_id, step_key)` was already recorded, skip. `step_key` = `step_id` when present, else `fallback:{leaf}:{observed_at}`. Each `(run_id, step_id)` is recorded at most once.

---

### 2.3 Fail-Closed Fencing

**EXECUTOR_SKIP_READINESS:** Requires `ENABLE_DEV_ENDPOINTS=true` or `GOLDEN_RUN_MODE=1`; forbidden when `NODE_ENV=production` or `PLANNING_RUN_MODE=production`. Startup validation throws and refuses to start.

**PlanningRuntimeConfig** (`planning-runtime-config.ts`):
- Single typed config: `runMode`, `executorMode`, `executorEnabled`, `capabilities.skipReadiness`, `capabilities.taskTypeBridge`.
- `configDigest` — stable hash of non-secret config slice for artifact evidence.
- Startup validation of allowed combinations; throws on invalid.
- `skipReadiness` allowed only when `runMode in {dev,golden}` and (`ENABLE_DEV_ENDPOINTS` or `GOLDEN_RUN_MODE`).
- `taskTypeBridge` allowed only when `runMode in {dev,golden}` and `executorMode === 'shadow'`.

---

### 2.4 Planning Banner and Config Digest in Artifacts

- **planning_banner:** One-line planning identity (run_mode, executor_mode, capabilities, config_digest). Makes artifact self-describing.
- **config_digest:** Redacted digest; must use only allowlisted non-secret keys (no credentials/tokens).
- **runtime.bridge_enabled:** True when Option B bridge is on.
- **runtime.certifiable:** `false` when `bridge_enabled === true`; artifacts with bridge are non-certifiable by definition.

---

### 2.5 Env-Scatter Tripwire

**File:** `packages/planning/src/__tests__/env-scatter-tripwire.test.ts`

**Policy:** Use the tripwire as the guard against new env scatter. CI fails if any non-allowlisted `.ts` under `packages/planning/src` contains `process.env`. Migrate allowlisted modules to config over time; remove paths from allowlist when migrated. Do not add allowlist entries without a migration plan.

**Allowlist:** `planning-runtime-config.ts` (canonical), `modular-server.ts`, `planning-endpoints.ts`, `server-config.ts`, `task-integration.ts`, `**/__tests__/**`, plus exact legacy paths (e.g. `sterling-reasoning-service.ts`, `execution-readiness.ts`). See test file for full list.

---

### 2.6 GET /api/dev/runtime-config

Under `ENABLE_DEV_ENDPOINTS`, returns redacted planning config: run_mode, executor_mode, executor_enabled, capabilities, config_digest. Returns 403 when `NODE_ENV === 'production'`. Enables "what is this server doing?" without reading code or env.

---

### 2.7 Memory Package: MemoryRuntimeConfig

`packages/memory` now has `MemoryRuntimeConfig` — single module reading PORT, PG_*, WORLD_SEED, MEMORY_*, etc. Validates at startup; exports `getMemoryRuntimeConfig()` and `getMemorySystemConfig()`. memory-system, server, vector-database consume config instead of process.env.

---

## 3. Design Choices (For Reviewers)

| Choice | Rationale |
|--------|-----------|
| **Shadow first, action later** | Proving "executor accepts and records a step" does not require Minecraft. Shadow gives that proof; live tool call is a separate milestone. |
| **Option B quarantined** | `task_type_*` is harness-only; Option A (Sterling emits executor-native leaves) is the intended ABI. Bridge behind flag, forbidden in production, tripwire test. |
| **deriveLoopStarted from evidence** | Prevents contradictory artifacts; dispatch evidence implies loop started. |
| **Shadow idempotency** | Prevents artifact bloat from repeated re-select; each step recorded once. |
| **Config digest redacted** | Digest uses only non-secret keys; avoids correlation/guessing from low-entropy secrets. |
| **Tripwire as guard** | Prevents new env scatter; migrate allowlisted modules over time instead of one big migration. |

---

## 4. How to Verify

### 4.1 Unit Tests (Gate Intake)

Run these to confirm behavior is present and regression-free:

```bash
cd packages/planning
pnpm test
```

Key tests:
- **env-scatter-tripwire.test.ts:** No `process.env` outside allowlist.
- **task-type-bridge-tripwire.test.ts:** Bridge disabled => allowlist does not contain `minecraft.task_type_craft`.
- **golden-run-recorder.test.ts:** `deriveLoopStarted` when dispatch exists; shadow idempotency; `recordExecutorBlocked`; `certifiable` when bridge disabled.
- **planning-runtime-config.test.ts** (if present): Config validation, fail-closed on invalid combos.

### 4.2 Golden Run (Manual Proof)

Prerequisites: Sterling on 8766, planning port free (e.g. 3005).

```bash
cd packages/planning

PORT=3005 \
ENABLE_DEV_ENDPOINTS=true \
ENABLE_TASK_TYPE_BRIDGE=1 \
ENABLE_PLANNING_EXECUTOR=1 \
EXECUTOR_SKIP_READINESS=1 \
GOLDEN_RUN_MODE=1 \
pnpm run dev
```

In another terminal:

```bash
curl -s -X POST http://127.0.0.1:3005/api/dev/run-golden-reduce \
  -H "Content-Type: application/json" -d '{}' | jq '.inject.run_id'

sleep 18

curl -s "http://127.0.0.1:3005/api/dev/golden-run-artifact/<run_id>" | jq
```

**Success criteria:**
- `expansion.status === "ok"`
- `expansion.steps` has at least one step with `leaf` and `args`
- `execution.shadow_steps.length >= 1` (idempotent, so each step_id once)
- `runtime.executor.loop_started === true` (derived when dispatch exists)
- `planning_banner` and `config_digest` present
- `runtime.bridge_enabled === true` when Option B used; `runtime.certifiable === false` in that case

---

## 5. Next Milestone: Live Option A

**Goal:** Prove live tool execution with no bypass flags.

### 5.1 Acceptance Criteria

- No `EXECUTOR_SKIP_READINESS`
- No `ENABLE_TASK_TYPE_BRIDGE`
- `EXECUTOR_MODE=live`
- Sterling emits `leaf: "craft_recipe"` with args `{ recipe: "<string>" }` (executor-native)
- Planning dispatches `minecraft.craft_recipe` live
- Tool invoked and outcome recorded (acceptance is "tool called + result recorded," not "Minecraft succeeded" — resource preconditions may fail)

### 5.2 Required Changes

| Layer | Change |
|-------|--------|
| **Sterling** | Add mapping so materializer emits `craft_recipe` with `{ recipe: string }` instead of (or in addition to) `task_type_craft` with proposition metadata. See `expand_by_digest_v1.py` / `materialize_steps_from_ir`. |
| **Planning** | Consume `craft_recipe` from expand; no TS-side translation. Allowlist already has `craft_recipe`; `validateLeafArgs('craft_recipe', { recipe })` contract exists. |
| **Executor** | Live path: call `minecraft.craft_recipe` with `recipe` arg; record in `dispatched_steps`. |
| **Env** | Remove skip-readiness and bridge flags from run; use `EXECUTOR_MODE=live`. |

### 5.3 Constraint

TS should not translate lemma/proposition metadata into executor leaves. The only permissible TS-side mapping is namespace + dispatch (e.g. `minecraft.${leaf}`) plus validation against the stable arg contract. Semantics stay in Sterling.

### 5.4 Unit Tests for Intake

To ensure the next milestone is recognized and not dropped:

1. **Test: expand returns craft_recipe when Sterling configured for Option A**
   - Mock or stub Sterling expand response with `leaf: "craft_recipe"`, `args: { recipe: "wooden_pickaxe" }`.
   - Assert planning passes step to executor without translation.

2. **Test: executor dispatches craft_recipe in live mode**
   - With `EXECUTOR_MODE=live`, mock minecraft adapter.
   - Assert `minecraft.craft_recipe` called with correct args and result recorded in `dispatched_steps`.

3. **Test: bypass flags forbidden in live Option A run**
   - Assert startup fails (or config rejects) when `EXECUTOR_MODE=live` and `EXECUTOR_SKIP_READINESS=1` or `ENABLE_TASK_TYPE_BRIDGE=1`.

---

## 6. Code Touchpoints

| Area | File(s) |
|------|---------|
| Planning config, validation | `planning-runtime-config.ts` |
| Golden run recorder, loop_started, idempotency | `golden-run-recorder.ts` |
| Executor, bridge allowlist, shadow dispatch | `modular-server.ts` |
| Leaf contracts, craft_recipe | `modules/leaf-arg-contracts.ts` |
| Env scatter tripwire | `__tests__/env-scatter-tripwire.test.ts` |
| Bridge tripwire | `__tests__/task-type-bridge-tripwire.test.ts` |
| GET artifact, run-golden-reduce, runtime-config | `modules/planning-endpoints.ts` |
| Sterling expand materializer | Sterling: `core/linguistics/expand_by_digest_v1.py` |

---

## 7. Remaining Config Migration (Per Audit)

Per `RUNTIME_CONFIG_AUDIT.md`, priority order:

1. **memory** — MemoryRuntimeConfig done.
2. **cognition** — CognitionRuntimeConfig (control-plane flags, service URLs).
3. **minecraft-interface** — MinecraftInterfaceRuntimeConfig.
4. **planning** — Extend config for remaining reads in modular-server, task-integration.
5. **core**, **dashboard** — Lower priority.

Tripwire ensures no new scatter in planning; migrate allowlisted modules over time.

---

## 8. Live Executor Dispatch Path Review (craft_recipe)

**Purpose:** Trace the live dispatch path for `craft_recipe` and identify failure modes so the first live run is self-explaining.

### 8.1 Path Trace

1. **modular-server.ts** (autonomous executor):
   - Selects step with `leaf: craft_recipe`, `args: { recipe: string }` (from Sterling Option A or TS materializer).
   - `toolName = minecraft.${leafExec.leafName}` → `minecraft.craft_recipe`.
   - Guards: allowlist (`KNOWN_LEAF_NAMES`), Option B bridge (task_type_* only in shadow), shadow vs live branch.
   - Live path: `startTaskStep()` (Rig G gate) → `recordDispatch()` → `toolExecutor.execute(toolName, leafExec.args)`.

2. **toolExecutor** (modular-server.ts ~555):
   - `mapBTActionToMinecraft('minecraft.craft_recipe', args)` → `{ type: 'craft', parameters: { item: args.recipe || args.item, quantity: args.qty || args.quantity || 1 } }`.
   - If `MCP_ONLY=true`: returns `ok: false` with `mcp_only_disabled` (no tool execution).
   - Else: `executeActionWithBotCheck(mappedAction, taskId)`.

3. **executeActionWithBotCheck** (modular-server.ts ~701):
   - Calls `executeTaskViaGateway` or `executeViaGateway` with `{ type: 'craft', parameters: { item, quantity } }`.

4. **execution-gateway.ts**:
   - `resolveMode()`: returns `live` only when `EXECUTOR_MODE=live` **and** `EXECUTOR_LIVE_CONFIRM=YES`. Otherwise `shadow`.
   - Shadow: returns immediately with `outcome: 'shadow'`, `ok: false`.
   - Live: `checkBotConnectionDetailed()` → if bot not connected, returns `outcome: 'error'`.
   - Live + bot connected: `mcPostJson` to minecraft-interface `/action` with `{ type: 'craft', parameters: { item, quantity } }`.

5. **minecraft-interface** (action-translator, action-contract-registry):
   - Receives `type: 'craft'`; registry maps `craft` → `craft_recipe` leaf.
   - Aliases: `item` → `recipe`, `quantity` → `qty`.
   - Dispatches to `craftRecipeLeaf.run(context, { recipe, qty, timeoutMs })`.

6. **crafting-leaves.ts** (craft_recipe leaf):
   - Runs actual crafting via bot API; returns `{ status: 'success', result }` or `{ status: 'failure', error }`.

7. **recordDispatch** (golden-run-recorder.ts):
   - Records `{ step_id, leaf, args, dispatched_at }`. Does **not** record tool result (actionResult).

### 8.2 Most Likely Failure Modes for First Live Run

| Failure mode | Where | Symptom | How to make self-explaining |
|--------------|-------|---------|-----------------------------|
| **MCP_ONLY=true** | toolExecutor | Returns before gateway; `ok: false`, `mcp_only_disabled`. | Add to artifact: `execution.dispatched_steps[i].blocked_reason` or record tool attempt with `result: { status: 'blocked', reason: 'mcp_only' }`. |
| **EXECUTOR_LIVE_CONFIRM missing** | execution-gateway | `resolveMode()` returns `shadow`; gateway blocks before POST. | Record gateway outcome in artifact; if `outcome === 'shadow'`, include `reason: 'EXECUTOR_LIVE_CONFIRM not YES'`. |
| **Readiness ordering** | startup-barrier, execution-readiness | Executor never starts; `executorReady` false. | Artifact already has `runtime.executor.enabled`; add `readiness.blocked_reason` if executor not started. |
| **Bot not connected** | execution-gateway | `checkBotConnectionDetailed()` fails; `outcome: 'error'`. | Record `execution.dispatched_steps[i].result: { status: 'error', error: 'Bot not connected' }` when gateway fails before POST. |
| **Tool name mismatch** | action-mapping vs minecraft-interface | Planning sends `type: 'craft'`; minecraft expects `craft` → `craft_recipe`. Aligned. | N/A if aligned. |
| **Args mismatch** | action-mapping | `item` vs `recipe`: planning sends `item: args.recipe`; minecraft aliases `item` → `recipe`. Aligned. | N/A if aligned. |
| **startTaskStep blocks (Rig G)** | task-integration | Returns `false`; executor never calls toolExecutor. | Record `executor_blocked_reason: 'rig_g_infeasible'` or similar when startTaskStep fails. |
| **introspectRecipe / injectDynamicPrereqForCraft** | modular-server | For craft_recipe, pre-checks recipe inputs; if missing, injects prerequisite and returns without executing. | Record in artifact when step is deferred for prerequisite; e.g. `execution.deferred_steps` or `blocked_reason: 'prerequisite_injected'`. |
| **Rate limiter** | modular-server | `stepRateLimiter.canExecute()` returns false; executor skips. | Record when rate-limited; e.g. `executor_blocked_reason: 'rate_limited'`. |
| **Retry / backoff loops** | modular-server | `actionResult.ok` false → retry with backoff; craft failure → `injectDynamicPrereqForCraft`. | Record `dispatched_steps[i].result` with `status`, `attempt`, `error`; make attempts explicit. |
| **Step completion semantics** | task-integration | `completeTaskStep` may fail (e.g. verification); step marked done or not. | Record `result.verification_failed` or similar when step executed but verification failed. |

### 8.3 Artifact Shape for Live Proof

**Current:** `dispatched_steps[i]` has `{ step_id, leaf, args, dispatched_at }`. No tool result.

**Required for live proof:**

- `execution.dispatched_steps[i].result`: `{ status: 'ok' | 'error', error?: string, failureCode?: string, attempts?: number }`.
- When gateway blocks before POST: record a dispatch with `result: { status: 'blocked', reason: 'shadow' | 'bot_disconnected' | 'mcp_only' }` so empty dispatched_steps is never ambiguous.
- When tool fails: record dispatch with `result: { status: 'error', error, attempts }` so reviewers see "tool was attempted, result was X."

**Invariant:** In live mode, every dispatched step must end with a recorded result object. Success or failure is acceptable; the existence of a result proves the loop closed.

### 8.4 Recommended Next Edits (In Order)

1. **Sterling Option A materializer** — Emit `craft_recipe` with `{ recipe: string }` instead of `task_type_craft` with proposition metadata. This is the architecture pivot.
2. **Planning fail-closed on args** — Remove `args ?? {}` for live; block step and record `executor_blocked_reason` if `step.args` missing or non-object.
3. **recordDispatchWithResult** — Extend recorder to accept optional `result`; pass `actionResult` from executor to recorder after toolExecutor.execute returns.
4. **Prove one live dispatch** — Run with no bypass flags, EXECUTOR_MODE=live, EXECUTOR_LIVE_CONFIRM=YES, MCP_ONLY=false, minecraft-interface up, bot connected.
5. **Intake gates** — "No bypass in live" (config validation); "No TS semantic translation" (unit test).

---

*Author: @darianrosebrook. For review and handoff.*
