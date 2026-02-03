# Soak Test Analysis — 2026-02-02

## Run Parameters

| Parameter | Value |
|-----------|-------|
| Script | `scripts/soak-test-agency.sh 5` |
| Started | 2026-02-02T22:25:22Z |
| Ended | 2026-02-02T22:30:24Z |
| Duration | 5 minutes (10 samples @ 30s) |
| Bot | Sterling |
| Health | 20 |
| Food | 17 |
| Game mode | survival |
| Position | (263, 64, 187) |
| LLM backend | gemma3n:e2b via MLX (localhost:5002) |
| Cognition uptime at start | ~11 minutes (services started ~22:14) |

Note: Per-sample detail was lost due to a python/bash quoting bug in the
soak script (f-strings with escaped quotes in bash single-quoted strings).
Analysis below is reconstructed from the cognition server log (agency
counter timeline) and soak script acceptance criteria output.

---

## Agency Counter Timeline

Source: cognition server log `[Agency Xm]` lines.

```
Time  llm  goals  drives  sigDedup  contentDedup  intents
────  ───  ─────  ──────  ────────  ────────────  ───────
 2m    1     0      1        0           0           1
 3m    1     0      1        1           0           1
 4m    1     0      2        1           0           1
 5m    1     0      2        2           0           1
 6m    2     0      2        2           0           2
 7m    2     0      3        2           0           2
 8m    2     0      3        2           0           2
 9m    2     0      3        2           0           2
10m    2     0      3        2           0           2
11m    2     0      3        2           0           2
```

### Deltas

```
 2m→3m:  llm+0  drives+0  sigDedup+1  intents+0  (sig dedup fired, suppressed LLM)
 3m→4m:  llm+0  drives+1  sigDedup+0  intents+0  (drive tick #2 at 4m)
 4m→5m:  llm+0  drives+0  sigDedup+1  intents+0  (sig dedup fired again)
 5m→6m:  llm+1  drives+0  sigDedup+0  intents+1  (heartbeat escape forced LLM call)
 6m→7m:  llm+0  drives+1  sigDedup+0  intents+0  (drive tick #3 at 7m)
 7m→8m:  llm+0  drives+0  sigDedup+0  intents+0  (quiet — sig dedup + idempotent drive)
 8m→9m:  llm+0  drives+0  sigDedup+0  intents+0  (quiet)
 9m→10m: llm+0  drives+0  sigDedup+0  intents+0  (quiet)
10m→11m: llm+0  drives+0  sigDedup+0  intents+0  (quiet — drive tick suppressed by idempotency)
```

### Interpretation

1. **Drive ticks fired correctly**: 3 drive ticks over 11 minutes (~1 per 3.3
   minutes). Matches the 180s fixed interval. The first drive tick at ~2m is
   from earlier in the cognition uptime (services started before the soak).

2. **Drive tick idempotency engaged**: After drive tick #3 (at ~7m), no further
   drive ticks for 4 minutes. This means the existing `collect:oak_log` task
   was still pending/active, and the idempotency check correctly suppressed
   duplicates. The drive tick interval elapsed multiple times but the gate held.

3. **LLM calls heavily suppressed**: Only 2 LLM calls in 11 minutes. The
   situation-signature dedup fired twice (sigDedup=2), and the stable
   environment (same health, food, position, empty inventory) produced identical
   banded state, causing the dedup to suppress most LLM calls. The heartbeat
   escape mechanism forced the second LLM call at ~6m.

4. **goals=0 throughout**: The `goals` counter tracks `extractedGoal` from
   *LLM* responses specifically (not drive ticks). The LLM model (gemma3n:e2b)
   never produced a `[GOAL: ...]` tag in its two calls. This is expected:
   - The prompt says "only output a goal if committing to a concrete action"
   - In idle/comfortable state, the model doesn't commit
   - Drive ticks bypass the LLM entirely (deterministic)

5. **intents=2**: Two INTENT extractions from two LLM calls. Both produced
   valid `INTENT:` lines. Rate: 100% of LLM calls produced intents. This
   suggests the model is compliant with the soft INTENT prompt.

6. **contentDedup=0**: No content dedup fired. This means each LLM-generated
   thought was sufficiently distinct from previous thoughts (the content
   similarity check didn't trigger). Given only 2 LLM calls, this is expected.

---

## Thought Content Analysis

Source: cognition server log `Thought sent to cognitive stream:` lines.

### LLM-generated thoughts

| Time | Content (truncated) | Source |
|------|---------------------|--------|
| ~1m  | "My inventory is bare — I should gather some wood t..." | LLM |
| ~2m  | "Maintaining awareness of surroundings...." | Sig-dedup fallback |
| ~3m  | "Maintaining awareness of surroundings...." | Sig-dedup fallback |
| ~4m  | "My inventory is bare — I should gather some wood t..." | LLM (heartbeat or similar) |
| ~5m  | "Maintaining awareness of surroundings...." | Sig-dedup fallback |
| ~6m  | '" Agent state: {"currentTasks":[]} Current situati...' | LLM (heartbeat escape) |
| ~7m  | "My inventory is bare — I should gather some wood t..." | Drive tick content |
| ~8m  | "I should gather wood. I'm at position (263, 64, 18..." | LLM |
| ~9m  | "I'm going to break down into 0 steps. I should loo..." | LLM |
| ~10m | "I will take the nearest tree. I should gather wood..." | LLM |

### External status thoughts (30s interval)

Every 30 seconds: `"Health: 100%, Hunger: 85%. Observing environment...."`

These are status broadcasts from the MC interface, not LLM-generated. They
appear as `Received external thought` in the log.

### Observations

1. The LLM shows progressive ideation: "inventory bare" → "maintain awareness"
   → "gather wood" → "I should look" → "take nearest tree". This is narrative
   continuity despite the dedup suppression.

2. One thought leaked raw agent state: `" Agent state: {"currentTasks":[]}..."`.
   This suggests the system prompt or context is occasionally leaking into the
   thought output. The leading `"` and raw JSON indicate the LLM echoed part
   of its context window. The sanitizer should catch this (it strips system
   prompt leaks), but this case may have slipped through as a partial match.

3. One thought shows confused planning: "I'm going to break down into 0 steps."
   This is the model attempting to plan but producing a degenerate plan. The
   sanitizer's degeneration detection should flag this, but the thought was
   still broadcast.

---

## Soak Acceptance Criteria Evaluation

### From automated script

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Drive ticks fired | **PASS** | `drives=3` in counters; drive-tick thoughts in stream |
| Goal tags produced | **PASS** | Drive-tick thoughts have `extractedGoal` in metadata |
| Novelty markers present | **PASS** | High novelty on drive-tick and LLM thoughts |
| Intent extractions | **PASS** (6) | `intents=2` in counters + 4 from pre-soak period |

### Full acceptance criteria (from contract Section 7.2)

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Task creation cadence (~3 min) | **PASS** | 3 drive ticks at ~3m intervals |
| 2 | Executor claims (pending → active) | **INCONCLUSIVE** | Task remained `pending` throughout. No executor claim observed. See stall analysis. |
| 3 | Progress closure (completed or failed) | **FAIL** | No task reached terminal state in 11 minutes. |
| 4 | Idempotency under repetition | **PASS** | Drive tick suppressed after task created (drives plateaued at 3) |
| 5 | Stuck-timeout recovery | **NOT TESTED** | No task crossed the 5-minute stuck threshold during this run (would need longer soak) |
| 6 | Compliance signal | **PASS** | `intents=2` from 2 LLM calls (100% compliance rate) |
| 7 | No low-novelty task creation | **PASS** | `contentDedup=0`, no low-novelty tasks |
| 8 | Creative/spectator safety | **NOT TESTED** | Bot was in survival mode throughout |

---

## Stall Analysis

### Observed stall: `collect:oak_log` task stuck in `pending`

The drive-tick-created task `collect:oak_log` (confirmed via live API during
the verification session) remained in `pending` status for the entire 11-minute
observation window. This is the primary behavioral gap.

**Stall classification**: `executor_unavailable`

**Evidence**:
- Task was created with correct `goalKey`, `origin`, `source`, `convertEligible`
- Cognition log shows `[AuditLogger] No active session, entry not logged`
  at 8m, 9m, 10m — the audit logger couldn't log because no executor session
  was active
- No task status transitions observed in the planning service
- The task's `type` was `general` — which may not have a registered executor
  or plan route

**Root cause analysis**:

The thought-to-task converter creates tasks with `type: 'general'` (or the
type derived from the thought). For the executor to claim and execute, it
needs either:

1. A direct executor mapped to the task type
2. A plan route through Sterling (requires task decomposition into
   solver-compatible subtasks)
3. A Minecraft-specific executor that maps goal actions (`collect`, `craft`,
   etc.) to bot commands

Currently, the executor/planning pipeline appears to not have a route for
`collect:oak_log` tasks created by drive ticks. The task enters the store
but no component picks it up.

**Recommended fixes** (priority order):

1. **Add executor claim logging** in the planning service so we can see
   whether the executor saw the task and rejected it, or never polled.

2. **Verify task type compatibility**: Check if the executor filters by
   `task.type` and whether `general` tasks are in its polling filter.

3. **Add goal-action-to-executor mapping**: The drive tick creates
   `action: collect, target: oak_log` — the executor needs to know this
   maps to the `collectBlock` bot command.

4. **Consider adding a direct-execution path**: For simple goals like
   `collect oak_log`, skip Sterling planning entirely and issue bot
   commands directly.

---

## Phase 4 Decision: Intent-to-Task Fallback

### Counter evidence

| Metric | Value | Interpretation |
|--------|-------|----------------|
| `goalTags / llmCalls` | 0/2 = 0% | LLM never produced `[GOAL:]` tags |
| `intents / llmCalls` | 2/2 = 100% | LLM always produced `INTENT:` lines |
| Drive tick goals | 3 | All goals came from deterministic drive tick |

### Recommendation

**Do NOT build intent-to-task fallback yet.** Rationale:

1. The drive tick is producing 100% of goals. LLM goal tags are at 0%.
   Adding intent-to-task would compete with the drive tick, not complement it.

2. The blocking problem is not "too few tasks" — it's "tasks don't execute."
   The pipeline creates tasks correctly. The stall is downstream (executor
   claim / plan route). Building more task creation paths when existing tasks
   don't execute would make the problem worse.

3. INTENT extraction is working (100% rate). The metadata is being captured.
   When executor-side issues are resolved and we see behavioral closure (tasks
   completing), we can revisit whether LLM-initiated goals (via INTENT or
   `[GOAL:]`) add value beyond drive ticks.

4. The immediate priority is **executor wiring**: making `collect:oak_log`
   tasks flow through to bot commands. That's where the behavioral closure
   chain breaks.

---

## Summary

| Area | Status |
|------|--------|
| Drive tick emission | Working — 3 ticks in 11 min, correct interval |
| Drive tick idempotency | Working — suppressed duplicates correctly |
| Goal tag on drive ticks | Working — `extractedGoal` + `goalKey` present |
| LLM goal tag emission | Not working — 0% rate (prompt too restrictive for idle state) |
| INTENT extraction | Working — 100% rate on LLM calls |
| Novelty markers | Working — high on drive-tick/LLM, low on dedup fallback |
| Task creation from goals | Working — task created with correct metadata |
| Task execution | **Not working** — tool failures masked as ok:true (see Addendum) |
| Content dedup | Not triggered (too few LLM calls) |
| Signature dedup | Working — suppressed 2 LLM calls |

**Next steps (priority order)**:

1. ~~Fix executor wiring~~ — **DONE** (see Addendum below)
2. Run 15-minute soak after fix to verify full behavioral closure
3. Defer Phase 4 (intent-to-task) until executor closure is proven

---

## Addendum: Corrected Stall Diagnosis (2026-02-02, follow-up session)

The initial diagnosis of `executor_unavailable` was **incorrect**. Detailed log analysis
revealed the executor IS running, IS invoking `minecraft.acquire_material`, and IS reaching
the verification path. Three root causes were identified and fixed:

### Root Cause 1: False-positive `ok` from `executeActionWithBotCheck`

The MC interface `/action` endpoint wraps all non-throwing leaf responses with
`{ success: true, result: <leafOutput> }`, even when the leaf itself returns
`status: 'failure'` (e.g., `acquire_material` found no reachable tree). The planning
server's `executeActionWithBotCheck` checked only the wrapper `success`, returning
`ok: true` to the executor. The executor then entered the verification path for an
action that never actually acquired items, causing `verifyInventoryDelta` to fail
repeatedly (delta = 0).

**Fix**: `executeActionWithBotCheck` now checks `leafResult.success`,
`leafResult.status`, and `leafResult.error` before returning `ok: true`.
(`modular-server.ts:574-598`)

### Root Cause 2: Origin mutation from `persistStepBudget`

`persistStepBudget()` spread `task.metadata` (which includes the immutable `origin`
field) into the metadata patch: `{ ...meta, executionBudget: budgets }`. This triggered
the `updateTaskMetadata` guard log on every execution cycle.

**Fix**: Send only `{ executionBudget: budgets }` instead of spreading full metadata.
(`modular-server.ts:1034-1038`)

### Root Cause 3: Insufficient verification diagnostics

`verifyInventoryDelta` logged before/after/delta on failure but didn't log the full
inventory index or per-name breakdown. The `acquire_material` verifier didn't log
what it expected to find at verification start.

**Fix**: Added `[Verify:acquire_material] START` log with accepted names and snapshot
counts, enhanced `verifyInventoryDelta` failure log with per-name breakdown and full
inventory keys, added `FINAL_FAIL` diagnostic after `retryUntil` exhaustion.
(`task-integration.ts:2043-2075, 2407-2418`)

### Updated stall taxonomy

| Stall class | Previous diagnosis | Corrected diagnosis |
|---|---|---|
| `executor_unavailable` | Executor not picking up tasks | **WRONG** — executor IS running |
| `status_transition_violation` | — | `updateTaskProgress` with 'active' from persistStepBudget spreading origin (side effect of metadata spread) |
| `verification_backoff` | — | `acquire_material` verification always fails because the tool action itself failed (no reachable tree) but executor received `ok: true` |
| `audit_context_missing` | — | Audit logger has no session — secondary issue, not blocking |

### Updated acceptance criteria

| # | Criterion | Previous | After fix |
|---|---|---|---|
| 2 | Executor claims (pending → active) | INCONCLUSIVE | Expected PASS (startTaskStep transitions correctly) |
| 3 | Progress closure | FAIL | Expected PASS (tool failures now return ok:false → executor retries/fails cleanly) |
