# Golden Run Runbook (STIR-510)

## Purpose
Prove end-to-end routing and execution for `sterling_ir` tasks with a durable artifact.

## Required Env
- `ENABLE_DEV_ENDPOINTS=true`
- `STERLING_IR_ROUTING=1` (default)
- `STERLING_WS_URL=ws://localhost:8766`

For executor shadow proof (golden run without Minecraft):
- `ENABLE_PLANNING_EXECUTOR=1`
- `ENABLE_TASK_TYPE_BRIDGE=1` (allows `task_type_craft` etc.; dev/golden only)
- `EXECUTOR_SKIP_READINESS=1` (dev/golden only: start executor without minecraft/memory/dashboard; skip bot/health checks in shadow mode so shadow steps are recorded)

Stage 2 only:
- `STERLING_IDLE_EPISODES_ENABLED=true`
- `STERLING_IDLE_EPISODES_COOLDOWN_MS=300000` (optional)
- `STERLING_IDLE_EPISODES_TIMEOUT_MS=12000` (optional)

## Stage 1: Sink Proof (manual injection)

1. Start Sterling + planning runtime.
2. Inject a task:

```bash
curl -s -X POST http://localhost:3002/api/dev/inject-sterling-ir \
  -H 'Content-Type: application/json' \
  -d '{
    "committed_ir_digest":"<digest>",
    "schema_version":"<schema>",
    "envelope_id":"<optional>",
    "run_id":"<optional>"
  }' | jq
```

Run ID canonicalization (filename-safe)

* `run_id` is treated as an optional label. If provided, it is canonicalized to a filename-safe form (path separators removed, traversal stripped, non `[A-Za-z0-9_-]` replaced, length capped).
* The server returns the canonical `run_id` in the inject response; always use that value to locate the artifact: `artifacts/golden-run/golden-<canonical_run_id>.json`.
* Canonicalization is applied consistently across in-memory report keys and filenames.

3. Verify artifact exists:

Use the `run_id` returned by the endpoint response (canonical), not the raw value you passed.

`artifacts/golden-run/golden-<run_id>.json`

Minimum required fields:
- `task.task_id`
- `task.dedupe_key`
- `expansion.request_id`
- `expansion.status`
- `execution.dispatched_steps[]`
- `execution.verification.status`

Evidence preference: `execution.verification.kind == inventory_delta`.

Example schema (committed, non-runtime):
- `docs/planning/examples/golden-run-report.example.v1.json`

Note: `artifacts/golden-run/**` is runtime output and gitignored.

Fetch artifact via API (dev only):

```bash
curl -s "http://localhost:PORT/api/dev/golden-run-artifact/<run_id>" | jq
```

## Run golden reduce (single-shot proof)

1. Start Sterling (e.g. port 8766). Start planning with env above (including `EXECUTOR_SKIP_READINESS=1` if proving executor without Minecraft).
2. Trigger reduce + inject:

```bash
curl -s -X POST http://localhost:PORT/api/dev/run-golden-reduce \
  -H 'Content-Type: application/json' -d '{}' | jq
```

3. Wait at least one executor poll (default 10s; use `EXECUTOR_POLL_MS` to tune). Then fetch artifact by `inject.run_id`:

```bash
curl -s "http://localhost:PORT/api/dev/golden-run-artifact/<run_id>" | jq
```

Success: `expansion.status === "ok"` and `execution.shadow_steps.length >= 1` (or `execution.executor_blocked_reason` set). `runtime.executor.loop_started === true` when the executor loop is running.

**Copy-paste (planning on 3005):**

```bash
# 1) Start planning (Sterling already on 8766):
ENABLE_DEV_ENDPOINTS=true ENABLE_PLANNING_EXECUTOR=1 ENABLE_TASK_TYPE_BRIDGE=1 \
EXECUTOR_SKIP_READINESS=1 STERLING_WS_URL=ws://localhost:8766 PORT=3005 pnpm run dev

# 2) In another terminal, trigger golden run and capture run_id:
curl -s -X POST http://localhost:3005/api/dev/run-golden-reduce \
  -H "Content-Type: application/json" -d '{}' | jq '.inject.run_id'

# 3) Wait 15–20s for at least one executor cycle, then fetch artifact (replace <run_id>):
curl -s "http://localhost:3005/api/dev/golden-run-artifact/<run_id>" | jq

# 4) Check: expansion.status === "ok", execution.shadow_steps.length >= 1, runtime.executor.loop_started === true
```

**If the artifact API returns 404:** the process on that port may be an older build. You can read the artifact from disk (same run_id): `packages/planning/artifacts/golden-run/golden-<run_id>.json`. Ensure no other process is using the chosen PORT before starting planning so the new code (with artifact GET route and executor/bridge env) is the one that runs.

## Stage 2: Source Proof (idle → Sterling → task)

1. Set `STERLING_IDLE_EPISODES_ENABLED=true` and restart planning runtime.
2. Ensure bot is idle (no runnable tasks).
3. Wait for idle episode to trigger.

Expected outcomes:
- `idle_episode` section present in the golden run report
- `task` created from Sterling reduction
- Expansion + dispatch + verification recorded

## Server banner (evidence-grade, protocol-based)

For expand-by-digest golden runs, the server identity line is fetched over the wire and stored in the artifact. This is **mechanically unavoidable** in the golden path:

- **Sterling** exposes WS command `server_info_v1`; the response is `server_info.result` with `status: "ok"` and `banner_line: "STERLING_SERVER_BANNER file=... git=... supports_expand_by_digest_v1_versioned_key=true"`.
- **Planning** calls `getServerBanner()` on the Sterling client (inject handler and before expansion when runId is set), validates that the banner contains `supports_expand_by_digest_v1_versioned_key=true`, then `recorder.recordServerBanner(runId, banner_line)`.
- **Inject:** If `getServerBanner` is wired (default when Sterling is available), inject returns 503 when the banner is missing or invalid; no injection is recorded.
- **Expansion:** When materializing steps for a golden run, if the banner cannot be fetched or is invalid, expansion returns error and the run is not considered successful.

Missing or invalid banner is a **hard failure**; the artifact will not be produced without a valid `server_banner`. No stdout or harness trick required; works in CI and "Sterling already running elsewhere" topologies.

## Report Schema
Top-level includes:
- `schema_version: "golden_run_report_v1"`
- `run_id`
- `server_banner` (optional; one-line Sterling server identity for evidence)
- `injection` (stage 1)
- `idle_episode` (stage 2)
- `task`
- `expansion`
- `execution`
