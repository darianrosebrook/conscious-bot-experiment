# Execution Path Audit — 2026-02-08

## Purpose

This document maps every code path that can cause the bot to perform a world-mutating action in Minecraft. It identifies the canonical path, parallel implementations, dead code, and drift risks.

---

## Canonical Execution Chain

All world mutations must flow through one bottleneck:

```
Trigger (executor/cognition/safety)
  -> HTTP POST to minecraft-interface /action
    -> ActionTranslator.executeAction()
      -> Leaf.run() or direct bot.* call
        -> mineflayer Bot (world mutation)
```

The `/action` endpoint at `packages/minecraft-interface/src/server.ts:1831` is the **single gateway**. The `normalizeActionResponse()` function in `packages/planning/src/server/action-response.ts` is the **single interpreter** for responses from this endpoint.

---

## Active Execution Paths

### PATH 1: Planning Service Autonomous Executor (primary)

```
autonomousTaskExecutor() [modular-server.ts:1626]
  -> setInterval every 10s (gated by ENABLE_PLANNING_EXECUTOR=1)
  -> threat hold evaluation
  -> step selection + guard pipeline (geofence, allowlist, rate limiter)
  -> toolExecutor.execute() [modular-server.ts:581]
    -> executeActionWithBotCheck() [modular-server.ts:676]
      -> normalizeActionResponse() [action-response.ts:30]
      -> HTTP POST /action -> minecraft-interface
```

**Default mode:** Shadow (logs but doesn't execute). Live requires `EXECUTOR_MODE=live` + `EXECUTOR_LIVE_CONFIRM=YES`.

### PATH 2: Safety Monitor (reactive/reflex)

```
AutomaticSafetyMonitor [automatic-safety-monitor.ts:98]
  -> setInterval every 2s + bot events (health, entityMoved)
  -> threat detection -> triggerEmergencyResponse()
    -> actionTranslator.executeAction({ type: 'navigate', ... })
      -> NavigationBridge -> bot.pathfinder
```

**Note:** This uses a **separate** ActionTranslator instance from the one at the `/action` endpoint. Both have their own NavigationBridge. If both try to navigate simultaneously, they will conflict on `bot.pathfinder`. This is the highest-priority drift risk.

### PATH 3: Cognition Intrusive Thought Processor (guarded)

```
IntrusiveThoughtProcessor [intrusive-thought-processor.ts:1325]
  -> thought pipeline triggers executeDirectAction()
  -> POST planningEndpoint/task (planning service)
    -> enters planning queue with origin: cognition:intrusive-thought
    -> subject to executor guards (geofence, rate limiter, threat holds, shadow mode)
```

**Status:** Previously bypassed all planning guards by posting directly to MC interface `/action`. Now routes through the planning service's `POST /task` endpoint, where actions enter the normal executor pipeline with full guard coverage. The `minecraftEndpoint` config field is deprecated.

### PATH 4: Direct chat

```
POST /chat [server.ts:1340]
  -> bot.chat(message) directly
```

Benign — chat is not a world-mutating action in the same sense.

---

## Dead / Legacy Paths (should be removed or disabled)

### DEAD 1: PlanExecutor / `/execute-scenario` — **RETIRED**

```
POST /execute-scenario [server.ts:2155]
  -> Returns 410 Gone (retired stub)
```

**Previous behavior:** `PlanExecutor` was constructed without a `planningCoordinator`, causing `executePlanningCycle` to always error with "No planning coordinator." This produced 7 ERROR lines per soak run.

**Current status (2026-02-08):** Endpoint now returns a clean `410 Gone` response with `{ retired: true, message: 'Planning execution flows through the planning service (port 3002).' }`. No error logging, no stack trace. The `executeTask()` caller in `mc-client.ts:327` is a deprecated stub that returns an error immediately without hitting the network.

### DEAD 2: ActionExecutor (action-executor.ts)

```
ActionExecutor.executeActionPlan() [action-executor.ts:46]
  -> Uses LeafFactory to dispatch
  -> craft and consume are STUBS (just call waitLeaf.run())
```

**Status:** Exported from `index.ts` but never instantiated in production `server.ts`.

**Recommendation:** Remove or mark with `@deprecated`.

### DEAD 3: StandaloneSimpleInterface / SimulatedMinecraftInterface

**Status:** Not used in production. Standalone is for manual testing, simulation is for `/test-simulation`.

**Recommendation:** Keep but clearly mark as non-production.

### DEAD 4: Autonomous executor `executeTask()` fallback — **RETIRED**

```
executeTask(currentTask) [mc-client.ts:327]
  -> Returns error immediately: "executeTask is retired"
```

Previously sent tasks to the dead `/execute-scenario` endpoint. Now a deprecated stub that returns an error without hitting the network. The autonomous executor falls through to leaf mapping.

---

## Drift Risks

### RISK 1: Dual ActionTranslator Instances — **MITIGATED**

~~Two separate `ActionTranslator` instances exist. Both own a `NavigationBridge` with `bot.pathfinder`. Concurrent navigation will cause pathfinder state corruption.~~

**Resolved:** Singleton shared via `action-translator-singleton.ts`.

**Mitigated:** Navigation lease (ref-counted, priority-based) enforced inside `executeNavigate()` and all 5 direct `pathfinder.goto()` call sites in `action-translator.ts` (via `withNavLease()`). Safety monitor propagates lease context (`navLeaseHolder`, `navigationPriority`) through action parameters instead of pre-acquiring — prevents self-blocking where emergency flee would NAV_BUSY itself.

**Hardened (2026-02-08):** Lease now has passive TTL auto-expiry (default 60s) checked lazily on `acquire()` and `isBusy` — prevents deadlocks from unhandled rejections mid-navigation. Emergency preemption sets `lastPreemptReason` on the lease manager, enabling callers to distinguish `NAV_PREEMPTED` (safety emergency) from `NAV_BUSY` (simple contention). The step executor maps `NAV_PREEMPTED` to `SAFETY_PREEMPTED` block reason with 30s backoff instead of blind retry. BeliefBus is now wired to SafetyMonitor via `setBeliefSystem()`, eliminating duplicate entity scanning. Reflex overrides scale by threat severity: critical=15 ticks (~3s), high/default=10 ticks (~2s), and can be cancelled early via `exitReflexModeEarly()`.

**Residual:** 3 `pathfinder.goto()` calls in `interaction-leaves.ts` are not yet lease-gated. These run inside `dispatchToLeaf()` during action execution, so they're serialized at the action level but don't hold the nav lease. A drift guard prevents new `pathfinder.goto()` calls from appearing in other files.

### RISK 2: Intrusive Thought Processor Bypasses Guards — **RESOLVED**

~~Cognition's `IntrusiveThoughtProcessor` can POST directly to `/action` without passing through the planning service's guards.~~

**Resolution:** `executeDirectAction()` now routes through `POST planningEndpoint/task` instead of `POST minecraftEndpoint/action`. The `minecraftEndpoint` config field is deprecated. `rg "fetch(.*\/action" packages/cognition` returns no matches.

### RISK 3: Multiple Fallback Chains in Autonomous Executor (MEDIUM)

The `autonomousTaskExecutor` has 5+ fallback paths for action dispatch:
1. Sterling step -> toolExecutor -> `/action`
2. executeTask -> `/execute-scenario` (dead)
3. Leaf mapping -> toolExecutor -> `/action`
4. Action mapping -> executeActionWithBotCheck -> `/action`
5. Goal execution -> reactiveExecutor

The first chain that succeeds wins. If chain ordering changes or a "dead" chain starts returning unexpected results, behavior shifts silently.

**Fix:** Reduce to a single canonical chain. Remove fallbacks to dead endpoints.

### RISK 4: Leaf Registry Duplication (LOW)

Leaves exist in both `packages/core/src/leaves/` and `packages/minecraft-interface/src/leaves/`. The MC interface versions are registered at runtime and override core versions. But if an import accidentally pulls from `core` instead of `minecraft-interface`, a different (possibly stale) implementation runs.

**Fix:** Remove leaf implementations from `core` or make them explicitly abstract/interface-only.

---

## Recommended Cleanup Priority

| Priority | Action | Files | Status |
|----------|--------|-------|--------|
| P0 | Retire /execute-scenario endpoint + remove executeTask() call edge | server.ts, modular-server.ts, mc-client.ts | **DONE** — endpoint returns 410, executeTask() is a deprecated stub, autonomous executor falls through to leaf mapping |
| P0 | Share ActionTranslator instance between PlanExecutor and /action endpoint | action-translator-singleton.ts, server.ts, plan-executor.ts | **DONE** — singleton registered by PlanExecutor, /action prefers singleton with fallback |
| P0 | Navigation lease to prevent concurrent pathfinder corruption | action-translator.ts, automatic-safety-monitor.ts | **DONE** — ref-counted lease with emergency preemption; safety monitor propagates lease context through action params (no self-blocking); executeNavigate enforces lease |
| P1 | Gate intrusive thought execution behind executor guards OR disable when executor is active | intrusive-thought-processor.ts | **DONE** — executeDirectAction() routes through planning service POST /task instead of direct MC /action; minecraftEndpoint config deprecated |
| P1 | ExecutionGateway: single sanctioned path for planning-side /action calls | execution-gateway.ts, reactive-executor.ts, minecraft-executor.ts, modular-server.ts | **DONE** — gateway applies bot check + mode gating + normalizeActionResponse + audit; all 7 reactive-executor direct fetch calls replaced; executeActionWithBotCheck delegates to gateway; nav lease enforced in executeNavigate |
| P1 | Fix SafetyMonitor ↔ lease self-blocking + lease reentrancy | action-translator.ts, automatic-safety-monitor.ts | **DONE** — lease is ref-counted; safety monitor passes `navLeaseHolder`/`navigationPriority` through action params; `executeNavigate` reads from params; emergency preempt force-clears refcount |
| P2 | Mark ActionExecutor as @deprecated | action-executor.ts | Open |
| P2 | Consolidate autonomous executor fallback chains into one canonical path | modular-server.ts | Open |
| P3 | Remove or abstract leaf implementations from core package | packages/core/src/leaves/ | Open |
