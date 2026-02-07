# Pattern A Golden Run — Implementation Handoff

**Purpose:** Give reviewers and the next implementer clear context: what was completed, why those choices were made, how to run and verify, and what to do next. Use this for PR review and to pick up where we left off.

**References:**
- Design and proof boundaries: `docs/planning/PATTERN_A_GOLDEN_RUN_SESSION_OVERVIEW.md`
- Runbook (env, commands): `docs/planning/golden-run-runbook.md`
- Contract: `contracts/sterling-executor.yaml`

---

## 1. What We Completed

### 1.1 Summary

We closed the **executor evidence gap** for Pattern A (expand-by-digest): one golden run now produces an artifact that shows **both** `expansion.status === "ok"` **and** `execution.shadow_steps.length >= 1` in the same run, with no Minecraft or other deps required. That proves reduce → expand → executor acceptance end-to-end across the Sterling boundary (shadow only; action dispatch is a separate milestone).

### 1.2 Change List

| Change | Where | Why |
|--------|--------|-----|
| **Executor starts without dependencies** | `modular-server.ts`, `startup-barrier.ts` | Executor only started when `isSystemReady()` and `readiness.executorReady` were true. With Minecraft/memory/dashboard down, the loop never ran. We needed a dev-only mode where the executor can start anyway so a single developer (or CI) can prove the path with only Sterling + planning. |
| **EXECUTOR_SKIP_READINESS=1** | `modular-server.ts`, `execution-readiness.ts` | When set: (1) `ReadinessMonitor` gets `executionRequired: []` so `executorReady` is true without minecraft. (2) After readiness probe we call `markSystemReady('executor_skip_readiness')` so `tryStartExecutor()` runs. (3) In the autonomous executor callback, when `mode === 'shadow'` and this env is set, we **skip** the bot connection check and the `/health` check so the executor proceeds to task selection and step execution (shadow path). Result: with only Sterling + planning, the executor loop runs and can record a shadow step. |
| **Option B bridge quarantine** | `modular-server.ts`, `task-type-bridge-tripwire.test.ts` | `task_type_craft` is in `TASK_TYPE_BRIDGE_LEAF_NAMES`, not `KNOWN_LEAF_NAMES`. It is only in the allowlist when `ENABLE_TASK_TYPE_BRIDGE=1`. Tripwire test asserts that with the bridge disabled, the allowlist does not contain `minecraft.task_type_craft`. Prevents Option B from becoming the default ABI. |
| **Executor-blocked precedence** | `golden-run-recorder.ts` | When we record a dispatch (shadow or live), we set `executor_blocked_reason` and `executor_blocked_payload` to `undefined` in the same patch. So any successful dispatch clears blocked state; empty dispatch is never ambiguous with a stale blocked reason. |
| **GET golden-run artifact** | `golden-run-recorder.ts`, `planning-endpoints.ts` | Added `getReport(runId)`, `getReportFromDisk(runId)` on the recorder, and **GET `/api/dev/golden-run-artifact/:runId`** so the artifact can be fetched by run_id. Returns 404 if not found. |
| **task_type_craft leaf contract** | `leaf-arg-contracts.ts` | Executor calls `validateLeafArgs(leafName, args, true)` **before** the allowlist check. There was no contract for `task_type_craft`, so validation failed with "unknown leaf" and we never reached the allowlist or `recordShadowDispatch`. Added a permissive contract for `task_type_craft` (validate returns null) so the executor can pass validation and record shadow steps. Documented as Option B bridge only; not for semantic use. |
| **Runbook and overview** | `golden-run-runbook.md`, `PATTERN_A_GOLDEN_RUN_SESSION_OVERVIEW.md` | Runbook: env for executor shadow proof, run-golden-reduce flow, verification via GET artifact, copy-paste for planning on 3005. Overview: design review (Section 11), bridge non-default pivot, precedence invariant, exact commands (Section 12). |

### 1.3 Design Choices (For Reviewers)

- **EXECUTOR_SKIP_READINESS** is dev/golden-only and forbidden in production. Runbook states this; no runtime assertion was added to avoid breaking existing dev setups.
- **Skip bot/health only in shadow + skip-readiness.** In live mode we never skip those checks. In shadow mode with skip-readiness we skip them so the executor can reach shadow-dispatch recording without a real bot.
- **Option B (task_type_* leaves) is explicitly non-default.** Gate: `ENABLE_TASK_TYPE_BRIDGE=1`; flag forbidden in production. Option A (Sterling emits executor-native leaves) is the intended long-term ABI; Option B exists only to close the executor evidence gap.
- **task_type_craft contract is permissive by design.** We do not encode Sterling’s arg shape in TS; we only allow the leaf so the executor can record shadow dispatch. Args are stored verbatim in the artifact for evidence.

---

## 2. Why We Chose This Path

- **Single proof artifact:** Until one run showed both "expansion ok" and "executor observed a step," every debugging session risked log archaeology. The artifact is the single source of truth.
- **Shadow first, action later:** Proving "executor accepts and records a step" does not require Minecraft or tool execution. Shadow mode gives that proof; "action proven" (live tool call + outcome) is a separate milestone (see overview Section 11 item 3).
- **Bridge quarantined:** Allowing `task_type_craft` in the executor could have led to TS interpreting `predicate_lemma` / proposition metadata (Sterling-light trap). By gating it behind a flag and a tripwire test, we keep Option B timeboxed and Option A the target.
- **Precedence invariant:** A single `executor_blocked_reason` field could be ambiguous (inject-time vs executor-loop vs later clear). Clearing it whenever we record a dispatch makes "no dispatch" always explained and avoids last-writer-wins confusion.
- **Server start with tsx:** Planning is run via `pnpm run dev` (which uses `tsx`). Using `node --import ts-node/register` failed with `ERR_MODULE_NOT_FOUND` for `./modules/server-config` because Node ESM does not resolve `.ts`. The runbook and handoff use `pnpm run dev` from `packages/planning`.

---

## 3. Proof: One Successful Golden Run

After the above changes (including the `task_type_craft` contract), we ran the full flow with clean port 3005 and obtained the following.

**Run ID:** `b46d4658-e2b8-4987-8677-5d74334f17e3`

**Artifact checks:**

- `expansion.status` === `"ok"`
- `expansion.steps`: one step, `leaf: "task_type_craft"`, `args`: `{ proposition_id, task_type: "CRAFT", predicate_lemma: "craft", routing_domain: "planning" }`
- `execution.shadow_steps.length` === **2** (>= 1)
- `runtime.executor.enabled` === `true`, `runtime.executor.mode` === `"shadow"`
- `server_banner` present (Sterling banner with `supports_expand_by_digest_v1_versioned_key=true`)
- `execution.verification.kind` === `"trace_only"`, `detail.reason` === `"shadow_mode"`

**Excerpt (structure only):**

```json
{
  "schema_version": "golden_run_report_v1",
  "run_id": "b46d4658-e2b8-4987-8677-5d74334f17e3",
  "expansion": {
    "status": "ok",
    "steps": [
      {
        "id": "sterling-step-1",
        "leaf": "task_type_craft",
        "order": 1,
        "args": {
          "proposition_id": "prop_4116481c6dc1a508",
          "task_type": "CRAFT",
          "predicate_lemma": "craft",
          "routing_domain": "planning"
        }
      }
    ]
  },
  "execution": {
    "dispatched_steps": [],
    "shadow_steps": [
      { "step_id": "sterling-step-1", "leaf": "task_type_craft", "args": { ... }, "observed_at": 1770434331878 },
      { "step_id": "sterling-step-1", "leaf": "task_type_craft", "args": { ... }, "observed_at": 1770434341880 }
    ],
    "verification": { "status": "skipped", "kind": "trace_only", "detail": { "reason": "shadow_mode", "leaf": "task_type_craft" } }
  },
  "runtime": {
    "executor": { "enabled": true, "mode": "shadow", "loop_started": false, "enable_planning_executor_env": "1" }
  }
}
```

This run proves **dispatch acceptance** (executor observed and recorded the step in shadow). It does **not** prove action (no live tool call).

---

## 4. How to Run and Verify

### 4.1 Prerequisites

- Sterling running (e.g. WebSocket on 8766).
- Port for planning free (e.g. 3005). If something else is bound, free it first: `lsof -ti :3005 | xargs kill -9 2>/dev/null; sleep 2`.

### 4.2 Start Planning

From **`packages/planning`** (so `tsx` resolves modules correctly):

```bash
cd packages/planning

PORT=3005 \
ENABLE_DEV_ENDPOINTS=true \
ENABLE_TASK_TYPE_BRIDGE=1 \
ENABLE_PLANNING_EXECUTOR=1 \
EXECUTOR_SKIP_READINESS=1 \
markSystemReady=1 \
skipBotChecks=1 \
pnpm run dev
```

Wait until you see something like: `[Server] Planning system server running on port 3005`.

### 4.3 Trigger Golden Run and Fetch Artifact

In another terminal:

```bash
# 1) Trigger run-golden-reduce and capture run_id
curl -s -X POST http://127.0.0.1:3005/api/dev/run-golden-reduce \
  -H "Content-Type: application/json" -d '{}' | jq '.inject.run_id'

# 2) Wait at least one executor poll (15–20s is safe; default poll 10s)
sleep 18

# 3) Fetch artifact (replace <run_id> with the value from step 1)
curl -s "http://127.0.0.1:3005/api/dev/golden-run-artifact/<run_id>" | jq
```

### 4.4 Success Criteria

- `expansion.status === "ok"`
- `expansion.steps` has at least one step with `leaf` and `args`
- `runtime.executor.enabled === true`
- Either `execution.shadow_steps.length >= 1` **or** `execution.executor_blocked_reason` set (empty dispatch must be explained)
- `server_banner` present

If the artifact API returns 404, the process on that port may be an older build. You can read from disk: `packages/planning/artifacts/golden-run/golden-<run_id>.json`. Ensure the chosen PORT is free before starting planning so the process with the artifact GET route and executor/bridge env is the one that runs.

---

## 5. What to Do Next

Ordered by leverage (aligned with overview Section 2 and 12.5).

1. **Leaf vocabulary:** Decide Option A (map Sterling to executor-native leaves and args) vs Option B timebox. Option A is the intended ABI; Option B is quarantined and for evidence only. See overview Section 3 and 11.
2. **Make "no dispatch" always explain itself:** Already partially done (precedence + blocked reason). Optional: add append-only `execution.events[]` for evidence-grade ordering (overview Section 11 item 2).
3. **Args verbatim / fail-closed:** Currently `step.args ?? {}`. Consider recording args verbatim and failing closed if `step.args` is undefined or non-object; optionally store `raw_steps[]` and `normalized_steps[]` (overview Section 2 step 3).
4. **Cert-grade tightening:** After executor proof is accepted: strict expansion (missing goal / unknown lemma → empty steps, fail closed); require `envelope_id` when registry entry has one; disable default-steps escape hatch for cert runs; mark dev fallback runs with `expansion.mode: "dev_fallback"` (overview Section 2 step 5, Section 11 item 6).
5. **Registry persistence:** Pattern A registry is in-process. For queued tasks, restarts, or delayed execution, persist registry or committed IR behind Sterling; avoid ad hoc TS-side re-reduce or IR storage (overview Section 4).

---

## 6. Code Touchpoints (Quick Reference)

| Area | File(s) |
|------|--------|
| Executor skip readiness, bridge allowlist, shadow dispatch | `packages/planning/src/modular-server.ts` |
| Executor-blocked precedence when recording dispatch | `packages/planning/src/golden-run-recorder.ts` |
| task_type_craft contract (permissive for bridge) | `packages/planning/src/modules/leaf-arg-contracts.ts` |
| Bridge tripwire test | `packages/planning/src/__tests__/task-type-bridge-tripwire.test.ts` |
| GET artifact, run-golden-reduce | `packages/planning/src/modules/planning-endpoints.ts` |
| Runbook, overview | `docs/planning/golden-run-runbook.md`, `docs/planning/PATTERN_A_GOLDEN_RUN_SESSION_OVERVIEW.md` |

---

*Author: @darianrosebrook. For review and handoff.*
