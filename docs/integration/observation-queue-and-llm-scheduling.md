# Observation Queue and LLM Scheduling

Design for culling stale queued observations and how all LLM call sites (Ollama/MLX) interact with the single backend.

## 1. Observation queue: culling stale

### Problem

We serialize observation LLM calls (one at a time) so MLX is not overloaded. If multiple observations arrive while one is in flight, they wait in order (FIFO). By the time we finish the first and run the second, the second (and third, fourth) may be **stale**: the world state has moved on, and the newest observation is more relevant for timely insight.

### Policy: latest-wins when draining

When the worker is free and there are N pending observations:

1. **Take the newest** (by enqueue time) and run `observationReasoner.reason(observation)` for that one only.
2. **Resolve all others** (stale) with a **stale fallback**: same shape as a normal insight but `fallback: true`, `error: 'stale'`, and thought text from the existing fallback builder (entity/event summary). No LLM call for stale items.
3. Run the selected observation through the LLM; resolve its promise with the real insight.
4. If more pending remain after this run, drain again (take newest of the remainder). In practice we only ever run **one** per drain and resolve the rest as stale, so the queue is cleared in one go: one LLM call, N-1 stale fallbacks.

So: **one** observation gets a real LLM result; **all others** in that batch get a fast fallback response so the HTTP client gets a timely 200 and can display "I notice X (stale, superseded by newer)." or the same fallback text we use for errors.

### Queue shape

- **Pending**: list of `{ observation, resolve, reject, createdAt }`. Enqueue on POST /process (environmental_awareness).
- **Drain**: if running, return; if pending.length === 0, return. Set running = true. Sort pending by `createdAt` descending; pick `newest = pending[0]`; the rest are `stale`. For each stale item, call `observationReasoner.getStaleFallback(stale.observation, observationId)` and resolve that item's promise with that insight. Clear pending (or remove all). Run `observationReasoner.reason(newest.observation)`, resolve newest's promise with the result. Set running = false. If pending is non-empty (e.g. new arrivals during the run), drain again.

### Staleness vs timeout

- **Stale**: we explicitly skip the LLM and return fallback because a newer observation is being run instead.
- **Timeout**: the LLM call for the observation we did run exceeded the observation timeout; we already have fallback for that path. Stale is orthogonal: we never start the LLM for stale items.

---

## 2. How other calls to the chat/LLM service queue

All Cognition LLM use goes through **LLMInterface** (and subclasses like MemoryAwareLLMInterface). Each component holds a reference to an LLM interface and calls `generateResponse` / `callOllama` when needed. There is **no** shared queue or scheduler in TypeScript; concurrency is only limited by:

1. **MLX sidecar**: one `_gpu_lock`, so only one generate runs at a time. Every call to the same MLX process (observation, chat, intrusive thought, social, ReAct, etc.) serializes at the backend.
2. **Observation mutex/queue** (our addition): we serialize observation calls and now cull stale so only the newest runs per batch.

So today:

- **Observation** (environmental_awareness): serialized in Cognition; queue with latest-wins; one LLM call at a time for observations.
- **Intrusion** (POST /process type `intrusion`): calls `intrusiveThoughtProcessor.processIntrusiveThought`; that path uses LLM. No queue; if observation and intrusion fire together, they both hit MLX and serialize there.
- **Social** (POST /process type `social_interaction`): goes to conversation/social flow; uses LLM. No queue.
- **Environmental event** (POST /process type `environmental_event`): separate from environmental_awareness; can call LLM. No queue.
- **ReAct / thought-generator / conversation-manager / theory-of-mind / etc.**: each calls `llm.generateResponse` when needed. No shared queue.

So **all** of these ultimately hit the same Ollama/MLX endpoint and are serialized at the **backend** (single process, single lock). They do **not** queue in the Node process; they run concurrently until they hit the sidecar, and the sidecar runs them one at a time. So:

- We **do not** run them in parallel: MLX runs one request at a time.
- We **can** run them in parallel from Node’s perspective (multiple in-flight HTTP requests to MLX), but MLX will queue them and serve one by one; the others wait and may timeout on the client side (e.g. 45s or 25s).

### Do we need a global LLM queue or lanes?

- **Option A – Global single queue**: All LLM call sites enqueue to one queue; one worker pulls and runs. Pros: predictable ordering, no overload. Cons: chat/intrusion could be delayed by a long observation queue; need priority or fairness.
- **Option B – Lanes by type**: Observation lane (latest-wins, one at a time), Chat lane (FIFO, one at a time), Intrusion lane (one at a time), etc. MLX still serializes globally, so we’d need a **global** lock across lanes when calling MLX, and each lane could have its own policy (e.g. observation: latest-wins; chat: FIFO). That gives us controlled policies per type without one giant queue.
- **Option C – Keep current + observation queue only**: Leave other call sites as-is (they hit MLX and serialize at the backend). Only observation gets a queue with latest-wins in Cognition. Simplest; we already avoid observation overload and cull stale. If chat or intrusion time out under load, we can add lanes or a global queue later. 

---

## 3. Summary

| Call site              | Queuing today              | Policy / note                                      |
|------------------------|----------------------------|----------------------------------------------------|
| Observation (env awareness) | Yes (Cognition)            | Serialized; latest-wins when draining; stale get fallback. |
| Intrusion              | No                         | Hits MLX directly; serialized at backend.          |
| Social interaction     | No                         | Hits MLX directly; serialized at backend.          |
| Environmental event    | No                         | Hits MLX directly; serialized at backend.          |
| ReAct / thought-gen / etc. | No                    | Hit MLX directly; serialized at backend.          |

- **Observation**: queue with cull-stale (latest-wins) and public stale fallback so HTTP clients get a quick 200 for stale items.
- **Others**: no Node-side queue; MLX single-thread serializes. Optional future work: global LLM scheduler or lanes if we see bottlenecks.

For a full dataflow of how data enters the MLX sidecar, how it is prioritized and routed back, and how user chat and thought externalization work, see **mlx-sidecar-dataflow-and-scheduler.md**.

---

## 4. Implementation (Cognition)

- **ObservationReasoner**: public `getStaleFallback(payload, observationId)` returns an `ObservationInsight` with `fallback: true`, `error: 'stale'`, and thought text from the existing fallback builder (no LLM call).
- **Server**: `observationQueue` (array of `{ observation, resolve, reject, createdAt }`), `drainObservationQueue()`, and `enqueueObservation(observation)`. POST /process (environmental_awareness) calls `enqueueObservation(observation)` and awaits the returned promise. On drain, newest is run through `observationReasoner.reason()`; all others are resolved with `observationReasoner.getStaleFallback()` so the HTTP handler gets a timely 200 for every request.
