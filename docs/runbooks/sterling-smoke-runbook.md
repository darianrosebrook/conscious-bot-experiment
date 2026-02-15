# Sterling Smoke Test Runbook

## Purpose
Prove end-to-end Sterling → leaf execution through the full pipeline: expand → materialize → executor → dispatch → verify. Returns a structured proof report with 4 checkpoints demonstrating correlation between Sterling IR expansion and leaf execution.

## What This Proves

**Proves**:
- Given a committed IR digest, Sterling expand returns pre-baked steps
- Steps flow through `materializeSterlingIrSteps` → executor → dispatch → verify
- The full TypeScript pipeline is exercised
- All 4 checkpoints pass: A (expand request/result), B (expansion), C (dispatch), D (verification)

**Does NOT prove**:
- The reduce→digest selection path (Sterling choosing WHICH digest to commit)
- That requires `run-golden-reduce` or a live reduce call (see [golden-run-runbook.md](./golden-run-runbook.md))

## Required Env

```bash
ENABLE_DEV_ENDPOINTS=true
ENABLE_PLANNING_EXECUTOR=1
EXECUTOR_MODE=live
EXECUTOR_LIVE_CONFIRM=YES
STERLING_WS_URL=ws://localhost:8766  # Sterling running and connected
```

## 4-Checkpoint Model

| Checkpoint | Field | What it proves |
|------------|-------|----------------|
| **A (requested)** | `sterling_expand_requested` | `expandByDigest` was called with the correct digest BEFORE any WebSocket I/O |
| **A (result)** | `sterling_expand_result` | The expand call completed (ok/blocked/error/timeout) and we captured timing, step count, retry metadata |
| **B (expansion)** | `expansion` | `materializeSterlingIrSteps` produced executor-ready steps with a plan digest |
| **C (dispatch)** | `execution.dispatched_steps` | Each step was dispatched to the MC interface and got a result |
| **D (verification)** | `execution.verification` | Post-dispatch verification ran (inventory delta, position delta, etc.) |

## Test Variants

### Happy Path (variant=ok, dedupes on repeat)

**Use case**: Quick sanity check that Sterling→leaf pipeline works. Uses fixed stub digest, so repeated runs dedupe.

```bash
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke \
  -H 'Content-Type: application/json' -d '{"variant":"ok"}' | python3 -m json.tool
```

**Expected**:
- `proof_passed: true`
- `all_checkpoints_ok: true`
- Artifact persisted to disk at `artifact_path`
- Repeated runs dedupe (same `task_id` and `run_id`)

---

### Fresh Run (variant=ok_fresh, never dedupes)

**Use case**: Testing executor behavior changes without restarting Sterling. Generates unique digest per run using prefix-wildcard matching.

```bash
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke \
  -H 'Content-Type: application/json' -d '{"variant":"ok_fresh"}' | python3 -m json.tool
```

**Expected**:
- `proof_passed: true`
- Unique `run_id` and `task_id` every call
- Artifact persisted
- Digest format: `smoke_e2e_chat_wait_v1_<12-char-uuid>`
- Sterling's prefix-wildcard resolver matches `smoke_e2e_chat_wait_v1_` and returns base entry's steps

**Why this works**: Unlimited fresh runs without file edits or Sterling restarts. Sterling recognizes prefix wildcards and derives a `plan_bundle_digest` from the base entry.

---

### F2 Test: Unknown Digest (variant=unknown_digest)

**Use case**: Verify fail-closed behavior when digest doesn't exist. Proves early-exit path works (no 45s timeout).

```bash
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke \
  -H 'Content-Type: application/json' -d '{"variant":"unknown_digest"}' | python3 -m json.tool
```

**Expected**:
- `proof_passed: false`
- `A_requested.ok: true` (request was made)
- `A_result.ok: false` (status: blocked)
- `C_dispatch.count: 0` (no steps dispatched)
- `early_exit: true` (returns in ~3s instead of 45s)

---

### F6 Test: Timeout (variant=slow_wait)

**Use case**: Verify timeout classification when expand succeeds but 120s wait exceeds poll timeout (45s).

```bash
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke \
  -H 'Content-Type: application/json' -d '{"variant":"slow_wait"}' | python3 -m json.tool
```

**Expected**:
- `proof_passed: false`
- `timed_out: true`
- Partial checkpoints (A, B may be ok, but timeout before C/D complete)
- Dedupes on repeat (uses fixed digest)

**Fresh variant**: Use `"variant":"slow_wait_fresh"` for unique digest per run.

---

## Response Fields

| Field | Type | Meaning |
|-------|------|---------|
| `proof_passed` | boolean | `true` only when all checkpoints ok AND no timeout (use for CI/dashboards) |
| `all_checkpoints_ok` | boolean | Raw checkpoint aggregation (ignores timeout) |
| `variant` | string | Which variant was used |
| `early_exit` | boolean | Present when expand failed and polling was short-circuited |
| `artifact_path` | string | Path to persisted golden-run artifact on disk |
| `A_requested` | object | Checkpoint A: expand request details |
| `A_result` | object | Checkpoint A: expand result (status, timing, retries) |
| `B_expansion` | object | Checkpoint B: expansion ok/failed |
| `C_dispatch` | object | Checkpoint C: dispatch count and success |
| `D_verification` | object | Checkpoint D: verification status |

## Failure Modes

| # | Failure | Signal | Endpoint behavior |
|---|---------|--------|-------------------|
| **F1** | Sterling not connected | No WebSocket | 503 `sterling_not_connected` |
| **F2** | Digest unknown | `A_result.status='blocked'` | 200, proof with `C_dispatch.count: 0`, `early_exit: true` |
| **F3** | Stub loaded but steps malformed | `A_result.status='blocked'` | 200, proof with `A_result.ok: false` |
| **F4** | Expansion ok but executor disabled | `B_expansion.ok=true`, `C_dispatch.count=0` | 200, proof with `C_dispatch.ok: false` |
| **F5** | Dispatch ok but verification fails | A-C ok, D fails | 200, proof with `D_verification.ok: false` |
| **F6** | Timeout (45s) | Partial checkpoints | 200, proof with `timed_out: true` |

## Golden-Run Artifact Fields

The smoke run writes a golden-run artifact with these fields:

### Sterling Expand Evidence
- `sterling_expand_requested`: Recorded BEFORE the WebSocket call to `expandByDigest`
- `sterling_expand_result`: Recorded AFTER the call completes (ok/blocked/error/timeout)
  - `attempt_count`: number of ingest retries (0 = no retries)
  - `final_request_id`: WS-level request_id used for the final call (differs from `request_id` when retries occurred)

### Timeout Classification
The WS client resolves timeouts as `{ status: 'error', error: 'Expand timeout after Nms' }`.
The recording layer detects this pattern and sets `status: 'timeout'` for accurate classification.

### Full Artifact Schema
These are separate from the existing `expansion` field (which captures full expansion details for the executor). The new fields capture the request-response pair for evidence.

Artifact location: `artifacts/golden-run/golden-<run_id>.json`

## Debugging Tips

### Smoke test returns 503 "sterling_not_connected"
**Cause**: Sterling WebSocket not available.

**Fix**:
```bash
# Check Sterling is running
curl -s http://localhost:8766/health

# Verify STERLING_WS_URL in planning env
echo $STERLING_WS_URL  # should be ws://localhost:8766
```

---

### proof_passed: false, early_exit: true
**Cause**: Expand failed (F2/F3). Check `A_result.status` and `A_result.error`.

**Diagnosis**:
```bash
# Check A_result in response
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke \
  -H 'Content-Type: application/json' -d '{"variant":"ok"}' | jq '.A_result'

# Common causes:
# - status: "blocked" → digest not found (expected for variant=unknown_digest)
# - status: "error" → Sterling internal error or malformed steps
```

---

### proof_passed: false, timed_out: true
**Cause**: Executor poll timeout (45s) exceeded.

**Diagnosis**:
- Check if executor is running: `runtime.executor.loop_started === true` in response
- Verify `ENABLE_PLANNING_EXECUTOR=1` and `EXECUTOR_MODE=live`
- Increase `EXECUTOR_POLL_MS` if executor is slow (default: 10s)

---

### C_dispatch.count: 0 but B_expansion.ok: true
**Cause**: Executor disabled or not polling (F4).

**Fix**:
```bash
# Ensure executor env vars are set
ENABLE_PLANNING_EXECUTOR=1
EXECUTOR_MODE=live
EXECUTOR_LIVE_CONFIRM=YES
```

---

### D_verification.ok: false
**Cause**: Post-dispatch verification failed (F5). Steps dispatched but world state doesn't match expectations.

**Diagnosis**:
- Read artifact at `artifact_path`
- Check `execution.verification.kind` (inventory_delta, position_delta, receipt_anchored)
- Check `execution.verification.details` for specific failure reason

---

## Copy-Paste Commands

### Quick sanity check (uses fixed digest, dedupes)
```bash
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke \
  -H 'Content-Type: application/json' -d '{"variant":"ok"}' | jq '.proof_passed'
```

### Fresh run for executor testing (never dedupes)
```bash
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke \
  -H 'Content-Type: application/json' -d '{"variant":"ok_fresh"}' | jq '.'
```

### Test unknown digest fail-closed behavior
```bash
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke \
  -H 'Content-Type: application/json' -d '{"variant":"unknown_digest"}' | jq '.early_exit'
```

### Extract artifact path for deeper inspection
```bash
ARTIFACT=$(curl -s -X POST http://localhost:3002/api/dev/sterling-smoke \
  -H 'Content-Type: application/json' -d '{"variant":"ok_fresh"}' | jq -r '.artifact_path')
cat "$ARTIFACT" | jq '.execution.dispatched_steps'
```

---

## Related Runbooks

- **[golden-run-runbook.md](./golden-run-runbook.md)**: Full end-to-end proof including idle episodes and reduce→digest selection
- **[leaf-creation-runbook.md](./leaf-creation-runbook.md)**: Step-by-step guide to implementing new leaves
- **[debugging-leaf-dispatch-runbook.md](./debugging-leaf-dispatch-runbook.md)**: Trace points and failure mode diagnostics
- **[receipt-anchored-verification-runbook.md](./receipt-anchored-verification-runbook.md)**: Tri-state verification for placement leaves

---

*Last updated: 2026-02-12*
*Source: `docs/leaf-execution-pipeline.md` → Sterling→Leaf Correlation Proof section*
