# End-to-End Execution Proof Ledger (Sterling → Planning → Leaf)

Purpose: certify that the execution pipeline is not only "working," but "provably working under scrutiny," with reproducible steps and evidence artifacts.

Scope: dev-only proof rig centered on `POST /api/dev/sterling-smoke` and golden-run artifacts.

Non-goals: proving reduce→digest selection correctness (separate proof), proving real-world MC semantics beyond the verification rig, benchmarking performance.

---

## Status taxonomy (use exactly one per scenario)

* **OBSERVED_PASS**: ran it, captured artifacts, all acceptance criteria satisfied.
* **OBSERVED_FAIL**: ran it, captured artifacts, at least one acceptance criterion failed.
* **BLOCKED_ENV**: could not run due to explicit missing dependency / access / safety constraint. Must state what's missing and the shortest unblock path.
* **BY_INSPECTION_ONLY**: allowed only if the scenario is genuinely non-executable in your environment (e.g., requires prod hardware) and you still want to document expected behavior. If it's executable after a restart, it is NOT "by inspection."
* **NOT_RUN**: not attempted.

## Hard rules

* If "Restart required" is checked, then restarting is part of the test. Refusing to restart means the scenario remains NOT_RUN/BLOCKED_ENV, not "pass."
* No artifact path, no pass. If the Evidence bundle section is empty, the scenario cannot be used as evidence.
* Any scenario marked OBSERVED_PASS must include a completed Preconditions section. If restart is required to satisfy Preconditions, restart is part of the scenario steps.

## Checkpoint meanings (for reviewers)

* **A_requested**: recorder captured request before WS I/O
* **A_result**: recorder captured terminal expand outcome (ok/blocked/error/timeout) + retry metadata
* **B_expansion**: executor-ready steps materialized + executor plan digest
* **C_dispatch**: steps dispatched to leaf interface and returned results
* **D_verification**: post-dispatch verification executed and produced status/kind

---

# Scenario Cards

---

## SC-1: Fresh Happy Path (non-dedupe, full pipeline)

**Scenario ID**: SC-1
**Scenario name**: SMOKE_OK_FRESH
**Component boundary**: Planning ↔ Sterling ↔ Executor ↔ Leaf ↔ Verification
**Intent**: Prove the full expand→materialize→dispatch→verification chain completes with a fresh (non-dedupe-cached) digest, end-to-end.
**Risk covered**: Silent pipeline bypass — if Sterling expand is wired but executor never dispatches, or if dispatch succeeds but verification is dead code, this scenario would fail.

**Status**: [x] OBSERVED_PASS ☐ OBSERVED_FAIL ☐ BLOCKED_ENV ☐ BY_INSPECTION_ONLY ☐ NOT_RUN
**Last run timestamp**: 2026-02-09T01:54:54Z
**Runner**: Claude Code (agent, third audit session)
**Commits**:
* conscious-bot: `c70821b` (+ uncommitted: golden-run-recorder.ts, task-integration.ts, planning-endpoints.ts, docs/*)
* sterling: `b6ddd889` (+ uncommitted: config/smoke-expansion-stubs.json, scripts/utils/sterling_unified_server.py)

### Preconditions

Restart required: [x] Yes ☐ No
If Yes, restart runbook used: [x] "port kill" [x] start.js ☐ docker compose ☐ other

Services required UP:
* [x] Planning health OK → `curl http://localhost:3002/health` → `{"status":"healthy"}`
* [x] Sterling reachable → WS on :8766 responding, banner guard passes
* [x] Executor loop started → log line `[Planning] Starting executor — system ready and dependencies reachable` captured ~80s after readiness trigger
* [x] Minecraft interface reachable → port 3005 healthy, bot spawned (BotSterling, survival, overworld)
* [x] Dev endpoints enabled → `ENABLE_DEV_ENDPOINTS=true` in .env

Known startup hazards:
* **Hazard**: ReadinessMonitor re-probe interval is 120s. If initial probe runs before MC is healthy, executor won't start for ~2min. **Mitigation**: Wait for `[Planning] Starting executor` log line before running smoke. In this session, executor started ~80s after `POST /system/ready`.

### Steps to execute

1. Kill all service processes: `lsof -ti:3000,3001,3002,3003,3004,3005,3007,5002,8766 | xargs kill -9`
2. Start services: `node scripts/start.js --skip-install --skip-build`
3. Trigger readiness: `curl -X POST http://localhost:3002/system/ready`
4. Wait for executor start (check logs for `Starting executor` — up to 120s after readiness)
5. Run (twice, back-to-back):

```bash
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke -H 'Content-Type: application/json' -d '{"variant":"ok_fresh"}' | tee /tmp/sterling-smoke-ok-fresh-run1.json | python3 -m json.tool
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke -H 'Content-Type: application/json' -d '{"variant":"ok_fresh"}' | tee /tmp/sterling-smoke-ok-fresh-run2.json | python3 -m json.tool
```

Command transcript:
* Request capture: `/tmp/sterling-smoke-ok-fresh-run1.json` (run 1), `/tmp/sterling-smoke-ok-fresh-run2.json` (run 2)
* Response capture: same files (tee'd)
* Log snippet: `/tmp/start-services.log` (contains executor startup confirmation)

### Acceptance Criteria

**AC1**: Response indicates proof success.
* Signal: `proof_passed === true`
* Source: response JSON
* Threshold: exact
* Must hold: [x] Yes ☐ No
* **Observed**: `true` (both runs)

**AC2**: All checkpoints structurally OK.
* Signal: `all_checkpoints_ok === true`
* Source: response JSON
* Threshold: exact
* Must hold: [x] Yes ☐ No
* **Observed**: `true` (both runs)

**AC3**: Expansion produced steps.
* Signal: `A_result.status === "ok"` AND `A_result.step_count > 0`
* Source: response JSON + golden artifact
* Threshold: exact
* Must hold: [x] Yes ☐ No
* **Observed**: status=`ok`, step_count=`2`, elapsed_ms=`2` (run A), `1` (run B)

**AC4**: Dispatch executed every expanded step.
* Signal: `C_dispatch.count === B_expansion.step_count` AND every step result is `ok`
* Source: response JSON + golden artifact (`execution.dispatched_steps`)
* Threshold: exact
* Must hold: [x] Yes ☐ No
* **Observed**: count=`2`, steps: `chat`=ok, `wait`=ok (both runs)

**AC5**: Verification ran and passed.
* Signal: `D_verification.ok === true`
* Source: response JSON + golden artifact
* Threshold: exact
* Must hold: [x] Yes ☐ No
* **Observed**: status=`verified`, kind=`trace_only` (both runs)

**AC6**: Artifact persisted to disk with minimum evidence fields.
* Signal: file exists; includes `sterling_expand_requested`, `sterling_expand_result`, `expansion`, `execution.dispatched_steps`, `execution.verification`
* Source: filesystem + artifact JSON
* Threshold: exact (all 5 fields present)
* Must hold: [x] Yes ☐ No
* **Observed**: Run A 3587 bytes, Run B 3647 bytes on disk. All 5 fields present. `request_id` consistent across requested/result/expansion (`sterling_exec_1770601987387_jav77y` for run A).

**AC7**: Freshness demonstrated (two runs, no dedupe).
* Signal: `run_id` differs; `digest` differs; `artifact_path` differs; both `proof_passed === true`; `dedupe_hit` absent
* Source: two response JSON captures + two artifacts
* Threshold: exact
* Must hold: [x] Yes ☐ No
* **Observed**: Run A digest `smoke_e2e_chat_wait_v1_5b25e2f18fac`, run B digest `smoke_e2e_chat_wait_v1_73373b6676aa`. Distinct run_ids, task_ids, artifacts. No `dedupe_hit` field in either response.

### Evidence Bundle

Response JSON:
* Run A: `/tmp/sterling-smoke-ok-fresh-run1.json`
* Run B: `/tmp/sterling-smoke-ok-fresh-run2.json`

Golden-run artifacts:
* Run A: `packages/planning/artifacts/golden-run/golden-a1f7b435-19d0-441b-aff5-7605013bba95.json` — 3587 bytes, 2026-02-08T17:53 local
* Run B: `packages/planning/artifacts/golden-run/golden-3907e81d-2ffd-4488-91ab-5898579b7885.json` — 3647 bytes, 2026-02-08T17:53 local

Run A:
* run_id: `a1f7b435-19d0-441b-aff5-7605013bba95`
* artifact: `golden-a1f7b435-19d0-441b-aff5-7605013bba95.json`
Run B:
* run_id: `3907e81d-2ffd-4488-91ab-5898579b7885`
* artifact: `golden-3907e81d-2ffd-4488-91ab-5898579b7885.json`

### Observed Result

* run_id (A): `a1f7b435-19d0-441b-aff5-7605013bba95`
* run_id (B): `3907e81d-2ffd-4488-91ab-5898579b7885`
* scenario variant: `ok_fresh` (prefix-wildcard, generates unique digest per run)
* proof_passed: `true` (both)
* timed_out: `false` (both)
* dispatch_count: `2` (both)
* verification status/kind: `verified` / `trace_only` (both)
* plan_bundle_digest (A): `smoke_e2e_v1_static_a7de624cfadd` (sha256-derived suffix from prefix-wildcard)
* request_id correlation (A): `sterling_exec_1770601987387_jav77y` — same across `sterling_expand_requested`, `sterling_expand_result`, `expansion`
* attempt_count: `0` (no retries, both runs)
* endpoint elapsed: 18.6s (A), 18.6s (B) — polling overhead dominates; expand itself 2ms/1ms

### Deviations / Anomalies

* No deviations. Both runs passed on first attempt after waiting for executor start (~80s after readiness trigger). No timeout issues this session.

### Closeout

* [x] Promote to "known-good" list
* ☐ Needs follow-up fix
* ☐ Needs stronger instrumentation

---

## SC-2: Unknown Digest Blocked (F2, early-exit)

**Scenario ID**: SC-2
**Scenario name**: SMOKE_F2_UNKNOWN_DIGEST
**Component boundary**: Planning ↔ Sterling (expand lookup fails) → early exit
**Intent**: Prove the "blocked_digest_unknown" path is reported correctly, returns quickly (no 45s wait), and produces no dispatch.
**Risk covered**: If the early-exit path is broken, unknown digests would cause 45s timeouts with misleading partial evidence. If block classification is wrong, dashboards/CI would misdiagnose the failure.

**Status**: [x] OBSERVED_PASS ☐ OBSERVED_FAIL ☐ BLOCKED_ENV ☐ BY_INSPECTION_ONLY ☐ NOT_RUN
**Last run timestamp**: 2026-02-09T01:54:54Z
**Runner**: Claude Code (agent, third audit session)
**Commits**: same as SC-1

### Preconditions

Restart required: ☐ Yes [x] No (same service lifetime as SC-1)

Services required UP:
* [x] Planning health OK
* [x] Sterling reachable
* [x] Executor loop started (not strictly required — this scenario early-exits before executor is consulted)
* ☐ Minecraft interface reachable (not required)
* [x] Dev endpoints enabled

Known startup hazards: none (this scenario works even if executor hasn't started)

### Steps to execute

1. (Services already running from SC-1)
2. Run:

```bash
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke -H 'Content-Type: application/json' -d '{"variant":"unknown_digest"}' | tee /tmp/sterling-smoke-unknown-audit.json | python3 -m json.tool
```

Command transcript:
* Response capture: `/tmp/sterling-smoke-unknown-audit.json`

### Acceptance Criteria

**AC1**: Controlled failure (not system breakage).
* Signal: `proof_passed === false` AND `A_requested.ok === true`
* Source: response JSON
* Threshold: exact
* Must hold: [x] Yes ☐ No
* **Observed**: `proof_passed: false`, `A_requested.ok: true`

**AC2**: Block reason is correct and explicit.
* Signal: `A_result.status === "blocked"` AND `A_result.blocked_reason === "blocked_digest_unknown"`
* Source: response JSON + artifact
* Threshold: exact
* Must hold: [x] Yes ☐ No
* **Observed**: status=`blocked`, blocked_reason=`blocked_digest_unknown`

**AC3**: No dispatch occurs.
* Signal: `C_dispatch.count === 0`
* Source: response JSON + artifact
* Threshold: exact
* Must hold: [x] Yes ☐ No
* **Observed**: `0`

**AC4**: Early-exit actually happened.
* Signal: `early_exit === true` OR elapsed_ms < 5000 (incompatible with full 45s polling)
* Source: response JSON
* Threshold: elapsed_ms < 5000
* Must hold: [x] Yes ☐ No
* **Observed**: `early_exit: true`, elapsed_ms=`2064`

**AC5**: Artifact persisted with A_requested + A_result.
* Signal: file exists; `sterling_expand_requested` and `sterling_expand_result` fields present
* Source: filesystem + artifact JSON
* Threshold: exact
* Must hold: [x] Yes ☐ No
* **Observed**: 2706 bytes on disk. Both fields present.

### Evidence Bundle

Response JSON: `/tmp/sterling-smoke-unknown-audit.json`
Golden-run artifact: `packages/planning/artifacts/golden-run/golden-7c57f1ff-0c9d-4661-b05a-65352b884cc1.json` — 2706 bytes, 2026-02-08T17:54 local

### Observed Result

* run_id: `7c57f1ff-0c9d-4661-b05a-65352b884cc1`
* scenario variant: `unknown_digest`
* proof_passed: `false`
* timed_out: `false`
* early_exit: `true`
* dispatch_count: `0`
* verification status/kind: N/A (never reached)
* blocked reason: `blocked_digest_unknown`
* A_result.elapsed_ms: `1505` (includes Sterling ingest retry delays: 500ms + 1000ms default)
* Total elapsed: `2064ms` (500ms pre-poll backoff + 1505ms Sterling retry + overhead)

### Deviations / Anomalies

* The 1505ms A_result.elapsed_ms is expected — Sterling retries the unknown digest twice (500ms + 1000ms configurable delays) before giving up. Not a bug; it's the ingest propagation gap retry mechanism working correctly for a genuinely unknown digest.

### Closeout

* [x] Promote to "known-good" list
* ☐ Needs follow-up fix
* ☐ Needs stronger instrumentation

---

## SC-3: True Poll Timeout (F6, partial progress)

**Scenario ID**: SC-3
**Scenario name**: SMOKE_F6_TRUE_POLL_TIMEOUT
**Component boundary**: Planning ↔ Sterling ↔ Executor ↔ Leaf (wait step exceeds timeout)
**Intent**: Prove the system reports timeout correctly while preserving partial progress evidence. Expansion succeeds, dispatch begins, but the 120s wait step can't complete within the poll timeout.
**Risk covered**: If timeout reporting is broken, long-running tasks would return misleading "all ok" results. If partial progress isn't captured, timeouts would be indistinguishable from total failures.

**Status**: [x] OBSERVED_PASS ☐ OBSERVED_FAIL ☐ BLOCKED_ENV ☐ BY_INSPECTION_ONLY ☐ NOT_RUN
**Last run timestamp**: 2026-02-09T01:54:54Z
**Runner**: Claude Code (agent, third audit session)
**Commits**: same as SC-1

### Preconditions

Restart required: ☐ Yes [x] No (same service lifetime)

Services required UP:
* [x] Planning health OK
* [x] Sterling reachable
* [x] Executor loop started
* [x] Minecraft interface reachable (required for chat leaf dispatch)
* [x] Dev endpoints enabled

Known startup hazards: none (executor confirmed running from SC-1)

### Steps to execute

1. (Services already running from SC-1)
2. Run:

```bash
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke -H 'Content-Type: application/json' -d '{"variant":"slow_wait","poll_timeout_ms":10000}' | tee /tmp/sterling-smoke-slow-wait-audit.json | python3 -m json.tool
```

Command transcript:
* Response capture: `/tmp/sterling-smoke-slow-wait-audit.json`

### Acceptance Criteria

**AC1**: Proof marked failed because of timeout, not earlier checkpoint failure.
* Signal: `timed_out === true` AND `proof_passed === false`
* Source: response JSON
* Threshold: exact
* Must hold: [x] Yes ☐ No
* **Observed**: `timed_out: true`, `proof_passed: false`

**AC2**: Expansion succeeded (timeout is downstream).
* Signal: `A_result.status === "ok"` AND `B_expansion.ok === true` AND `B_expansion.step_count > 0`
* Source: response JSON + artifact
* Threshold: exact
* Must hold: [x] Yes ☐ No
* **Observed**: A_result status=`ok`, B_expansion ok=`true`, step_count=`2`

**AC3**: Partial dispatch is visible and consistent.
* Signal: `0 < C_dispatch.count < B_expansion.step_count`
* Source: response JSON + artifact
* Threshold: exact inequality
* Must hold: [x] Yes ☐ No
* **Observed**: C_dispatch.count=`1` (chat ok), B_expansion.step_count=`2`. 1 < 2 ✓

**AC4**: Artifact captures partial dispatch evidence.
* Signal: `execution.dispatched_steps` contains completed subset with results
* Source: artifact JSON
* Threshold: exact (at least 1 step with result)
* Must hold: [x] Yes ☐ No
* **Observed**: 1 dispatched step: `chat` with result `ok`. Wait step still running at timeout.

**AC5**: Timeout bound is controlled.
* Signal: `elapsed_ms` consistent with `poll_timeout_ms` (allowing ≤5s overhead for pre-poll + poll interval + processing)
* Source: response JSON
* Threshold: elapsed_ms ≤ poll_timeout_ms + 5000
* Must hold: [x] Yes ☐ No
* **Observed**: elapsed_ms=`12571`, poll_timeout_ms=`10000`. 12571 ≤ 15000 ✓

### Evidence Bundle

Response JSON: `/tmp/sterling-smoke-slow-wait-audit.json`
Golden-run artifact: `packages/planning/artifacts/golden-run/golden-b9e5f85c-d0b5-491e-a69c-86ff8965eb05.json` — 3558 bytes, 2026-02-08T17:54 local

### Observed Result

* run_id: `b9e5f85c-d0b5-491e-a69c-86ff8965eb05`
* scenario variant: `slow_wait` with `poll_timeout_ms: 10000`
* proof_passed: `false`
* timed_out: `true`
* dispatch_count: `1` (of 2 expanded)
* verification status/kind: `verified` / `trace_only` (from completed chat step)
* task_status at timeout: `active`
* all_checkpoints_ok: `true` — completed portion was correct. Semantics: `proof_passed = all_checkpoints_ok && !timed_out`. The distinction is intentional.

### Deviations / Anomalies

* `all_checkpoints_ok: true` despite timeout. This is correct: the completed portion (chat dispatched, verified) was all ok. The timeout means the proof is incomplete, not that what was observed was wrong.

### Closeout

* [x] Promote to "known-good" list
* ☐ Needs follow-up fix
* ☐ Needs stronger instrumentation

---

## SC-4: Verification Failure (F5, dispatch ok but verification fails)

**Scenario ID**: SC-4
**Scenario name**: SMOKE_F5_VERIFICATION_FAIL
**Component boundary**: Executor ↔ Leaf ↔ Verification (verification rejects post-dispatch state)
**Intent**: Demonstrate that verification can produce a failing status with concrete evidence, not just "trace_only."
**Risk covered**: If verification is always "verified/trace_only," it's not proving anything about world-state correctness. A failing verification proves the verifier is actually checking.

**Status**: ☐ OBSERVED_PASS ☐ OBSERVED_FAIL [x] BLOCKED_ENV ☐ BY_INSPECTION_ONLY ☐ NOT_RUN
**Last run timestamp**: N/A
**Runner**: N/A
**Commits**: N/A

### Preconditions

Restart required: ☐ Yes ☐ No
**Missing prerequisite**: No smoke variant exists that produces a verifiable world-state claim that can deterministically fail. Current leaves (`chat`, `wait`) always return `verified/trace_only` because they don't modify observable world state.

**Shortest unblock path**: Add a stub variant (e.g., `verification_fail`) that expands to a step with verifiable world-state expectations (e.g., `acquire_material` targeting a non-existent block). The step would dispatch successfully but verification would fail because the expected inventory delta didn't occur. This requires either:
* A mock verifier in the smoke endpoint (pure dev-only, no MC dependency)
* A controlled Minecraft world state (non-deterministic, not suitable for smoke rig)

### Acceptance Criteria

**AC1**: Expansion and dispatch succeed (failure is downstream).
* Signal: `A_result.status === "ok"` AND `C_dispatch.ok === true`
* Must hold: ☐ Yes ☐ No

**AC2**: Verification reports failure.
* Signal: `D_verification.ok === false` AND `D_verification.status !== "verified"`
* Must hold: ☐ Yes ☐ No

**AC3**: proof_passed is false.
* Signal: `proof_passed === false`
* Must hold: ☐ Yes ☐ No

**AC4**: Artifact includes verification failure details.
* Signal: `execution.verification.status === "failed"` with `detail` populated
* Must hold: ☐ Yes ☐ No

### Evidence Bundle

N/A — not executed.

### Closeout

* ☐ Promote to "known-good" list
* [x] Needs follow-up fix — add `verification_fail` smoke variant with mock verifier
* ☐ Needs stronger instrumentation

---

## SC-5: Sterling Unreachable (F1, guarded 503)

**Scenario ID**: SC-5
**Scenario name**: SMOKE_F1_STERLING_UNREACHABLE
**Component boundary**: Planning → Sterling (connection fails) → 503 guard
**Intent**: Verify the endpoint fails fast and returns structured 503 when Sterling is unreachable.
**Risk covered**: If the guard is broken, smoke tests would hang or create orphaned tasks when Sterling is down.

**Status**: ☐ OBSERVED_PASS ☐ OBSERVED_FAIL [x] BLOCKED_ENV ☐ BY_INSPECTION_ONLY ☐ NOT_RUN
**Last run timestamp**: N/A
**Runner**: N/A
**Commits**: N/A

### Preconditions

Restart required: [x] Yes ☐ No
**Missing prerequisite**: Requires Sterling to be unreachable while planning stays up. Killing Sterling via `kill -9` caused the planning service to also terminate (start.js orchestrator dependency chain). SIGSTOP left the TCP connection open, so the banner check hangs instead of failing.

**Shortest unblock path**: Restart planning with `STERLING_WS_URL=ws://localhost:19999` (unused port). This makes the initial WS connection fail, so `getServerBanner` returns null. Run curl, verify 503, then restart with correct URL. This is a dedicated restart — cannot be combined with other scenarios in the same service lifetime.

### Acceptance Criteria

**AC1**: HTTP status is 503.
* Signal: HTTP response status code `503`
* Must hold: ☐ Yes ☐ No

**AC2**: Error message is explicit.
* Signal: JSON body includes `error: "sterling_not_connected"`
* Must hold: ☐ Yes ☐ No

**AC3**: No task created.
* Signal: No `task_id` in response; guard fires before `addTask`
* Source: response JSON (no task_id field) + code inspection (`planning-endpoints.ts:1722` is before `addTask` at line 1773)
* Must hold: ☐ Yes ☐ No

**AC4**: No misleading artifact path.
* Signal: No `artifact_path` in 503 response
* Must hold: ☐ Yes ☐ No

### Evidence Bundle

N/A — not executed.

### Closeout

* ☐ Promote to "known-good" list
* [x] Needs follow-up fix — schedule dedicated restart test for F1
* ☐ Needs stronger instrumentation

---

## SC-6: Unknown Leaf Blocked (executor fail-closed)

**Scenario ID**: SC-6
**Scenario name**: SMOKE_UNKNOWN_LEAF_BLOCKED
**Component boundary**: Executor → Leaf allowlist (executor rejects unknown leaf name)
**Intent**: Prove the executor's fail-closed behavior when a step's leaf is not in the allowlist.
**Risk covered**: If unknown leaves are silently skipped or passed through, the executor could dispatch unsafe or undefined operations.

**Status**: ☐ OBSERVED_PASS ☐ OBSERVED_FAIL [x] BLOCKED_ENV ☐ BY_INSPECTION_ONLY ☐ NOT_RUN
**Last run timestamp**: N/A
**Runner**: N/A
**Commits**: N/A

### Preconditions

**Missing prerequisite**: No smoke variant exists that expands to a non-allowlisted leaf. Current stubs use `chat` + `wait` which are allowlisted. Evidence of this behavior exists in test fixtures (`golden-block-only-run.json` has `executor_blocked_reason: "unknown_leaf"`) but not from a live smoke run.

**Shortest unblock path**: Add a stub variant (e.g., `unknown_leaf`) with steps `[{ "leaf": "teleport_to_nether", "args": {} }]` — a leaf name that doesn't exist in the allowlist. Sterling will expand successfully but the executor should block at dispatch time with `unknown_leaf`.

### Acceptance Criteria

**AC1**: Executor declares block with specific reason.
* Signal: `execution.executor_blocked_reason === "unknown_leaf"`
* Source: golden artifact JSON
* Must hold: ☐ Yes ☐ No

**AC2**: Block payload identifies the missing leaf.
* Signal: payload includes the leaf name
* Source: golden artifact JSON
* Must hold: ☐ Yes ☐ No

**AC3**: No dispatch occurs.
* Signal: `execution.dispatched_steps.length === 0`
* Source: golden artifact JSON
* Must hold: ☐ Yes ☐ No

### Evidence Bundle

N/A — not executed.

### Closeout

* ☐ Promote to "known-good" list
* [x] Needs follow-up fix — add `unknown_leaf` smoke variant
* ☐ Needs stronger instrumentation

---

## SC-7: Shadow-Mode Suppression (decision recorded, no dispatch)

**Scenario ID**: SC-7
**Scenario name**: SMOKE_SHADOW_MODE
**Component boundary**: Executor → Guard pipeline (shadow mode suppresses dispatch)
**Intent**: Prove the system records the decision and stays fail-closed (no side effects) when a step is intentionally shadowed.
**Risk covered**: If shadow mode leaks through to dispatch, "observation only" runs would mutate world state.

**Status**: ☐ OBSERVED_PASS ☐ OBSERVED_FAIL [x] BLOCKED_ENV ☐ BY_INSPECTION_ONLY ☐ NOT_RUN
**Last run timestamp**: N/A
**Runner**: N/A
**Commits**: N/A

### Preconditions

**Missing prerequisite**: Shadow mode is configured at the executor level, not per-variant. To test via smoke endpoint, either:
* Add a `shadow_mode` env var override in the smoke endpoint that temporarily enables shadow mode for the duration of the smoke run
* Or add a smoke variant parameter that tells the executor to treat this specific task as shadow-only

Evidence of shadow behavior exists in test fixtures (`execution.decisions[*].reason === "shadow"`, `verification.status === "skipped"`) but not from a live smoke run.

**Shortest unblock path**: Add a `shadow` parameter to the smoke endpoint body that sets `metadata.executionMode: "shadow"` on the task. The executor reads this metadata and records decisions without dispatching.

### Acceptance Criteria

**AC1**: Decision recorded as shadow.
* Signal: `execution.decisions[*].reason` includes `shadow`
* Source: golden artifact JSON
* Must hold: ☐ Yes ☐ No

**AC2**: No dispatch occurs.
* Signal: `execution.dispatched_steps.length === 0`
* Source: artifact JSON
* Must hold: ☐ Yes ☐ No

**AC3**: Verification explicitly skipped.
* Signal: `execution.verification.status === "skipped"` AND `execution.verification.detail.reason === "shadow_mode"`
* Source: artifact JSON
* Must hold: ☐ Yes ☐ No

### Evidence Bundle

N/A — not executed.

### Closeout

* ☐ Promote to "known-good" list
* [x] Needs follow-up fix — add shadow-mode smoke parameter
* ☐ Needs stronger instrumentation

---

# Responsibility Rules

1. If a scenario's Preconditions include a restart/stop/start action, the restart is part of the test. The executor of the scenario is responsible for performing it or explicitly marking BLOCKED_ENV with the exact missing capability.

2. BY_INSPECTION_ONLY is NOT permitted if the scenario is executable after a restart. Use BLOCKED_ENV instead, with the specific missing dependency.

3. Any claim of "PASS" in a review packet must point to an OBSERVED_PASS scenario entry and a persisted artifact on disk. For pure guard behaviors (503 responses), the captured HTTP output counts as the artifact.

4. BLOCKED_ENV entries must include:
   * The exact missing capability
   * The shortest unblock path (specific steps, not vague "needs investigation")
   * Whether unblocking requires code changes (follow-up fix) or only environment changes (CI step)

---

# Ledger Lint Checklist

For each scenario card, verify:

* ☐ Status is set (exactly one checkbox)
* ☐ If OBSERVED_PASS: all AC "Must hold: Yes" items have "Observed" values
* ☐ If OBSERVED_*: Evidence Bundle has response JSON path and artifact path
* ☐ If OBSERVED_*: Artifact file stats (size + mtime) are populated
* ☐ If BLOCKED_ENV: "Missing prerequisite" and "Shortest unblock path" are populated
* ☐ Commits section is populated
* ☐ Closeout decision is set

---

# Test Suite Verification

```
npx vitest run packages/planning/src/
→ 132 passed | 8 skipped (140 files)
→ 2633 passed | 54 skipped (2687 tests)
→ 0 failures
→ Duration: 13.81s
→ Run at: 2026-02-09T01:57:02Z (third audit, after full restart + all scenario runs)
```

---

# Summary Matrix

| ID | Scenario | Status | Artifact | Closeout |
|----|----------|--------|----------|----------|
| SC-1 | Fresh Happy Path | OBSERVED_PASS | `golden-a1f7b435-*.json`, `golden-3907e81d-*.json` | known-good |
| SC-2 | Unknown Digest Blocked | OBSERVED_PASS | `golden-7c57f1ff-*.json` | known-good |
| SC-3 | True Poll Timeout | OBSERVED_PASS | `golden-b9e5f85c-*.json` | known-good |
| SC-4 | Verification Failure | BLOCKED_ENV | N/A | needs variant + mock verifier |
| SC-5 | Sterling Unreachable | BLOCKED_ENV | N/A | needs dedicated restart test |
| SC-6 | Unknown Leaf Blocked | BLOCKED_ENV | N/A | needs `unknown_leaf` variant |
| SC-7 | Shadow-Mode Suppression | BLOCKED_ENV | N/A | needs shadow-mode parameter |
