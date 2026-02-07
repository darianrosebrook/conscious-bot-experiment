# Task Flow Diagnostics: Sterling to Executor

**Purpose:** Trace why tasks may appear "dropped" between Sterling expansion and executor visibility. Use this to diagnose and fix task loss.

---

## 1. Flow Summary

```
inject-sterling-ir / run-golden-reduce
  -> addTask(type: sterling_ir, metadata.sterling)
    -> materializeSterlingIrSteps (expandByDigest)
      -> Sterling returns { status, steps, ... }
    -> if outcome === 'ok': steps = response.steps, status = 'pending'
    -> if outcome !== 'ok': steps = [], applyTaskBlock -> status = 'pending_planning'
    -> finalizeNewTask -> taskStore.setTask(task)

Executor cycle:
  -> getActiveTasks()  [filters: status === 'active' || status === 'pending']
  -> eligibleTasks = activeTasks.filter(isTaskEligible)
  -> execute currentTask = eligibleTasks[0]
```

---

## 2. Key Drop Points

| Point | Condition | Result |
|-------|-----------|--------|
| **A. Expansion blocked** | Sterling returns `status: 'blocked'` | Task gets `pending_planning`, steps = [] |
| **B. Expansion error** | Sterling returns `status: 'error'` | Task gets `pending_planning`, steps = [] |
| **C. Empty steps** | Sterling returns `status: 'ok'` but `steps` empty/missing | materializeSterlingIrSteps returns `blocked_invalid_steps_bundle` -> `pending_planning` |
| **D. getActiveTasks filter** | Task status is `pending_planning` | Task is **excluded** from getActiveTasks() |
| **E. Similar-task dedupe** | Same sterling dedupe key already exists | addTask returns existing task; no new task created |

**Critical:** `getActiveTasks()` returns only `status === 'active' || status === 'pending'`. Tasks with `pending_planning` are never visible to the executor.

---

## 3. What to Check When Tasks "Drop"

1. **Golden artifact `expansion` block**
   - `expansion.status`: `ok` | `blocked` | `error`
   - `expansion.blocked_reason`: e.g. `blocked_invalid_steps_bundle`, `blocked_executor_unavailable`, `blocked_missing_digest`
   - `expansion.steps?.length`: Number of steps returned by Sterling

2. **Task status after addTask**
   - If `status === 'pending_planning'`, the task will not appear in getActiveTasks.
   - Check `metadata.sterling?.exec?.state`: `expanded` | `blocked` | `error`
   - Check `metadata.sterling?.exec?.blockedReason` or `error`

3. **Sterling response shape**
   - Sterling must return `{ status: 'ok', steps: [...] }` with at least one step.
   - If `steps` is `undefined`, `null`, or `[]`, materializeSterlingIrSteps treats it as `blocked_invalid_steps_bundle`.

4. **Similar-task dedupe**
   - For sterling_ir, dedupe key is built from `committedIrDigest` + schemaVersion.
   - If inject is called twice with same digest, the second call returns the existing task (no new creation).

---

## 4. Diagnostic Endpoints and Logging

### Existing

- **GET /api/dev/golden-run-artifact/:runId** — Contains `expansion` (status, blocked_reason, steps), `task`, `execution`.
- **Golden recorder** — Records expansion outcome and steps; use artifact to see why a run got pending_planning.
- **GET /api/dev/task-inventory** — Returns `counts` by status, `total`, and `visibleToExecutor` (active + pending). Use to see if tasks exist but are `pending_planning` (invisible to executor). Requires `ENABLE_DEV_ENDPOINTS=true`.

### Recommended Additions

- **Structured logs at inject + addTask** — Log after addTask: `task_id`, `status`, `steps.length`, `expansion.outcome`, `metadata.sterling?.exec?.state`. Makes it easy to grep logs and see what happened.
- **Assertion in golden run** — When expansion.outcome === 'ok', assert `expansion.steps?.length >= 1`. Fails fast if Sterling returns ok with empty steps.

---

## 5. Quick Checklist for "Tasks Dropped"

- [ ] Golden artifact: `expansion.status` — is it `ok`?
- [ ] Golden artifact: `expansion.steps?.length` — is it >= 1?
- [ ] Golden artifact: `expansion.blocked_reason` — what blocked it?
- [ ] Task after inject: `task.status` — is it `pending` (visible) or `pending_planning` (invisible)?
- [ ] getActiveTasks filter: only `active` and `pending` are returned; `pending_planning` is excluded.

---

## 6. Code Touchpoints

| Area | File | Notes |
|------|------|-------|
| getActiveTasks filter | task-integration.ts ~3467 | `.filter(task => task.status === 'active' \|\| task.status === 'pending')` |
| materializeSterlingIrSteps | task-integration.ts ~1895 | Returns blocked/error/ok; empty steps -> blocked_invalid_steps_bundle |
| addTask sterling path | task-integration.ts ~2093 | sterlingExpansion.outcome === 'ok' ? steps : [] |
| applyTaskBlock for blocked/error | task-integration.ts ~2208 | Sets status = pending_planning |
| finalizeNewTask | task-integration.ts ~1395 | Persists via taskStore.setTask |

---

*Author: @darianrosebrook. For task flow debugging.*
