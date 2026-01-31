# Minecraft Interface Client: Resilience Evaluation

**Purpose**: Evaluate the recent timeout/health-check fixes and whether the system is resilient or brittle. No code changes in this doc; assessment and recommendations only.

---

## 1. What Was Done (Summary)

- **WorldStateManager**: Clear the poll timeout in `finally` so it is always cleared when fetch throws (e.g. abort). Prevents timer leak and ensures `pollInFlight` is reset.
- **checkBotConnectionDetailed**: On timeout (AbortError), retry once after 800 ms before returning `ok: false`. Reduces treating a single slow health response as "bot disconnected."

Both are **local, symptom-level fixes**: they make the health check and poll less prone to false negatives and resource leaks. They do not unify or coordinate how the rest of the stack talks to the Minecraft interface.

---

## 2. Was This the Right Way to Solve It?

**For the immediate failure mode: yes.**

- Timer leak on abort was a real bug; clearing in `finally` is correct.
- One retry on health-check timeout is a reasonable way to avoid "bot disconnected" when the backend is temporarily slow, without changing contracts.

**For the broader failure mode (cascading timeouts, overload, "bot crashes"): only partly.**

- The fixes make the **autonomous executor** and **world poll** more tolerant of transient slowness.
- They do **not** address:
  - Many independent callers hitting the same backend at once (no pooling or coalescing).
  - Inconsistent use of a single resilient client (see below).
  - No backpressure when the backend is clearly overloaded (e.g. back off poll/health frequency after repeated timeouts).

So: **right fix for the symptom; not a full resilience redesign.**

---

## 3. Connection and Task Pooling: Current State

### 3.1 No Single Minecraft Client

Requests to the Minecraft interface (e.g. `localhost:3005`) go through **multiple code paths**:

| Caller | How it calls | Circuit breaker? | Retries? | Timeout |
|--------|--------------|------------------|----------|---------|
| **mc-client** (checkBotConnectionDetailed, mcFetch, mcPostJson, getBotPosition) | mcFetch / mc-client helpers | mc-client (3 failures, 30 s) | 5xx yes; timeout no (then 1 retry at health) | Per-call |
| **task-integration**, **modular-server** (crafting table, etc.) | `serviceClients.minecraft.get()` (core HttpClient) | core HttpClient (5 failures, 30 s) | Yes | Per-call |
| **WorldStateManager** | Raw `fetch(baseUrl + '/state')` | No | No | POLL_TIMEOUT_MS (8 s) |
| **cognitive-thought-processor** | Raw `fetch('http://localhost:3005/health')` | No | No | None |
| **reactive-executor**, **task-reactive-executor**, **minecraft-executor** | Raw `fetch(minecraftUrl + '/health')` | No | No | None |
| **mc-client** (verifyCraftingTask, verifyGatheringTask) | Raw `fetch('http://localhost:3005/inventory')` | No | No | AbortSignal.timeout(5s) |
| **live-stream-integration**, **environment-integration** | Raw fetch to minecraftEndpoint/state | No | No | Varies |
| **mcp-endpoints** | Raw `fetch('http://localhost:3005/leaves')` | No | No | None |

So:

- **Two separate circuit breakers** (mc-client and core HttpClient) that do **not** share state. One can be open while the other keeps sending traffic.
- **Many callers bypass both** and use raw `fetch` with no breaker, no retries, and inconsistent (or no) timeouts.
- **No connection pooling** in the application sense; each call is an independent `fetch()`. (Node/undici may pool by origin; we do not control concurrency or queueing.)

### 3.2 No Request Coalescing

- **World state**: WorldStateManager polls `/state` on an interval. Other code (task-integration, modular-server, live-stream, environment) also calls `/state` (or equivalent) independently. Under load, several `/state` and `/health` requests can be in flight at once.
- There is **no** "single in-flight request for /state" or "reuse last /health result for 500 ms" policy. So we get **thundering herd** when many components wake up at once.

### 3.3 Task / Executor Side

- **Autonomous executor** runs on a timer; each run does a bot health check then may run a task. Health check now has one retry on timeout; circuit breaker (in mc-client) does not open on timeout. So a slow backend no longer immediately causes "Bot connected: false" and a skipped run, but:
- There is **no** backoff: if the backend is consistently slow, we still hit it every timer tick with health + task-related requests.
- **WorldStateManager** and **task-integration** and others are not coordinated: they do not "pause" or slow down when the Minecraft interface is clearly failing or timing out.

So: **no real connection or task pooling**; multiple independent clients and no shared backpressure.

---

## 4. Resilient vs Brittle

### 4.1 What Is Resilient

- **mc-client**: Circuit breaker, retries for 5xx, timeout not treated as circuit-opening, health check retry on timeout. Clear timeout cleanup in mcFetch.
- **core HttpClient**: Circuit breaker and retries for serviceClients.minecraft.get().
- **WorldStateManager**: `pollInFlight` prevents overlapping polls; timeout cleared in `finally`; keeps last snapshot on failure (stale-while-revalidate).
- **Autonomous executor**: Does not open circuit on timeout; skips run when bot check fails after retry, instead of crashing.

### 4.2 What Is Brittle

- **Fragmented client**: Many callers bypass the resilient path (mc-client or core HttpClient). A single slow or failing Minecraft interface can cause:
  - Timeouts and "This operation was aborted" in multiple places.
  - Some code seeing circuit open, others not (two breakers).
  - Raw fetch callers with no retries and no backoff.
- **No backpressure**: No global or per-endpoint "we are seeing many timeouts / 5xx, slow down" policy. Poll and health check intervals do not increase under failure.
- **No request coalescing**: Concurrent `/state` and `/health` from multiple components increase load and chance of timeouts.
- **Hardcoded URLs**: Several raw `fetch('http://localhost:3005/...')` callers; if MINECRAFT_ENDPOINT is used elsewhere, these stay tied to 3005.

**Verdict**: The **autonomous executor path** (health check + task execution) and **world poll** are more resilient than before. The **system as a whole** is still **brittle**: under load or backend slowness, many independent callers will keep sending requests, time out in different ways, and never coordinate to reduce load.

---

## 5. Better Approaches (Recommendations)

1. **Single Minecraft client**
   - Route **all** Minecraft interface requests through one module (e.g. mc-client or a thin wrapper around it).
   - That module should use one circuit breaker, one retry/backoff policy, and one timeout policy (from timeout-policy.ts). Deprecate or remove the duplicate circuit breaker in core HttpClient for Minecraft, or make it delegate to planning’s client.

2. **WorldStateManager via mcFetch**
   - Have WorldStateManager call `mcFetch(baseUrl + '/state')` (or a mc-client helper) instead of raw `fetch`. Then world poll respects the same circuit breaker and retry/timeout behavior as the rest of planning.

3. **Optional request coalescing**
   - For idempotent reads (e.g. `/health`, `/state`): if a request is in flight, wait for it (or reuse result if fresh enough) instead of starting a new one. Reduces concurrent load and thundering herd.

4. **Backpressure**
   - When the Minecraft client sees repeated timeouts or 5xx (e.g. N in the last M seconds), increase poll interval and/or health-check interval (exponential backoff) until success resumes. Expose "degraded" so the autonomous executor can log or skip work without treating the bot as disconnected.

5. **Replace raw fetch callers**
   - cognitive-thought-processor, reactive-executor, task-reactive-executor, minecraft-executor, live-stream-integration, environment-integration, mcp-endpoints, and the verifyCraftingTask/verifyGatheringTask paths in mc-client should use the single Minecraft client (or its helpers) instead of raw fetch to localhost:3005.

6. **Configuration**
   - All Minecraft endpoint URLs should come from one place (e.g. MC_ENDPOINT or MINECRAFT_ENDPOINT); remove hardcoded `http://localhost:3005` in planning and, where applicable, in core.

---

## 6. Conclusion

- The **recent changes** (timer cleanup, health-check retry on timeout) are **correct and appropriate** for the bugs they fix and improve resilience of the autonomous executor and world poll.
- They do **not** by themselves make the system resilient: **connection and task pooling** are effectively absent, and **many callers bypass the resilient client**.
- A **better long-term approach** is: one Minecraft client, all traffic through it, optional coalescing and backpressure, and WorldStateManager (and others) moved onto that client. This document’s recommendations outline that path without prescribing a specific implementation order.
