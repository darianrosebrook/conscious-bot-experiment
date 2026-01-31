# Feature Plan: Executable Dispatch + Fallback Planning Hardening

## Design Sketch

Sequence (executor cycle):

1) Task loaded → normalize step authority + executability defaults
2) Select next step where meta.executable === true
3) Validate leaf args (strict) → execute leaf
4) On failure: backoff + blockedReason

Pseudo-contract:

| Field | Rule |
| --- | --- |
| meta.executable | true ⇒ dispatchable |
| meta.leaf | default meta.executable=true if missing |
| meta.authority | optional, used only for logging |

## Test Matrix

- Unit
  - Executable selection ignores authority (A1)
  - Fallback plan for collect/mine emits N dig_block steps (A2)
  - Leaf arg normalization + strict validation
- Integration
  - Planning task with executable steps dispatches via minecraft tool executor
- E2E smoke
  - Sterling present vs absent (fallback path)

## Data Plan

- Fixtures: requirement kinds (collect/mine/craft/build) with quantity edge cases
- Seed data: none (in-memory task creation)

## Observability Plan

- Logs: executor dispatch source/leaf, fallback plan choice
- Metrics: executor_dispatch_count, fallback_plan_count

---

# Feature Plan: EXEC-2403 Building Budgeted Execution

## Design Sketch
```
Executor
  -> detect building leaf
  -> check per-step budget + min interval
  -> emit dashboard event on limit
```

## Test Matrix
- **Unit**: budget exhaustion blocks step (A1)
- **Unit**: rate limit defers step + nextEligibleAt (A2)
- **Integration**: dashboard stream event emitted (A3)

## Data Plan
- Mock task with building steps and fixed timestamps.

## Observability Plan
- Dashboard stream event: executor_budget

---

# Feature Plan: PLN-418 Abort/Timeout Loop Hardening

## Design Sketch

Sequence (health + world-state):

1) WorldStateManager pollOnce checks in-flight guard → skips if busy
2) Fetch /state with timeout → always clear timeout → update snapshot
3) checkBotConnectionDetailed returns { ok, failureKind }
4) Planner opens breaker only on non-timeout failures

## Test Matrix

- Unit
  - WorldStateManager does not overlap polls (A1)
  - checkBotConnectionDetailed returns timeout failure kind (A2)
  - mcFetch clears timeout + no retry on timeout (A3)
- Integration
  - Planner breaker remains closed on timeout-only health checks (A2)

## Data Plan

- Mock fetch with AbortError injection and delayed resolution.

## Observability Plan

- Logs: poll skipped (in-flight), health failure kind
