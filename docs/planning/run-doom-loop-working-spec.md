WORKING SPEC — Runtime Doom-Loop Breakers (A/B/C/D)

Context / Why this exists
The runtime capture shows a structurally “correct” pipeline (cognition → planning → Sterling → executor → minecraft-interface) that can still fail at the systems level because failures do not reliably produce world-changing recovery behavior. The dominant failure shape is a closed loop: generate task → fail “not found” → retry/backoff → fail → idle → regenerate same task. The agent remains stationary; sensors update, but action selection does not incorporate recovery.

This spec defines four scoped changes that convert common failure signals into bounded recovery actions, bind urgent internal-state observations to goals, and eliminate hardcoded food targets that are invalid in many biomes. It also adds a minimal threat reflex (gated) to prevent “observe threat, do nothing” at low HP.

Non-goals

1. This does not design the full combat system (P1) or full farming/hunting pipelines (P4).
2. This does not change Sterling’s semantic authority boundary beyond adding explicit context injection surfaces and audited binding rules.
3. This does not try to “solve survival.” It tries to eliminate stationary doom loops and unblock sustained-run validation.

Guiding constraints (invariants)
I1. Deterministic, auditable branching: any recovery step injected must be explicitly logged with a reason, attempt index, and bounds.
I2. Fail-closed semantics: if recovery cannot be injected safely, the system must not silently proceed as if it did. Emit an explicit “recovery_injection_failed” diagnostic with cause.
I3. Bounded recovery: recovery must have monotonic attempt indices, capped attempts, and capped movement radius/time.
I4. Sterling remains the semantic authority for “what to do”; TypeScript may measure world state and provide context, but must not silently choose a semantic target unless explicitly configured as a fallback path.
I5. No new hidden routers: new behavior must be visible in (a) trace/provenance artifacts and (b) logs at the same level as normal dispatch decisions.
I6. Safety bias: recovery must not increase risk when threat is above a threshold (bias away from threats; do not wander into danger).

Definitions
“retry_hint”: a structured hint returned by a leaf execution result indicating what class of recovery is appropriate before retrying.
“reposition_or_rescan”: specific retry_hint indicating the agent likely needs to move and/or refresh local observations.
“Synthetic survival goal-prop”: an ephemeral goal binding created only when urgent vitals are detected and no committed goal-prop exists, enabling task creation rather than dropping the thought.
“World context injection”: an explicit payload passed to Sterling that reports measured world facts (e.g., locally available food sources). Sterling uses that context to choose an appropriate lowering.

Deliverables
A) Retry-hint consumption → Recovery step injection (reposition + rescan) — **SHIPPED (Phase 1)**
B) Keep-alive vitals → Sterling reduce re-route (no more dropped_no_goal_prop for urgent vitals) — **SHIPPED (Phase 1)**
C) Food gather lowering becomes biome/world-aware via context injection (remove hardcoded "sweet_berry_bush" dependency)
D) Minimal threat reflex (gated): low HP + threat ≥ medium → retreat-oriented action

A) Retry-hint consumption → Recovery step injection — **SHIPPED**

Goal
If a leaf fails with retry_hint=reposition_or_rescan, the executor injects a first-class recovery step before retrying the same leaf.

Implementation summary (sterling-step-executor.ts)

A1. Detection
When a leaf execution result indicates failure and includes retry_hint=reposition_or_rescan, the executor enters recovery mode for that task. Detection is in the existing retry-hint extraction block (~line 1069).

A2. Recovery step injection
A recovery step is a first-class dispatched step with its own `step_id` (`recovery-${taskId}-${attemptIndex}`), recorded in the golden-run dispatch ledger via `ctx.getGoldenRunRecorder().recordDispatch()`. The step is selected by `buildRecoveryPlan()` based on threat level and failure context:

* **Low/no threat + acquisition leaf (first 2 failures)**: `explore_for_resources` with `resource_tags` targeting the failed item
* **Low/no threat + acquisition leaf (3+ failures)**: `explore_for_resources` WITHOUT `resource_tags` (broadened — avoids single-item fixation)
* **Low/no threat + non-acquisition leaf**: `step_forward_safely` with `distance: 2.0`
* **Medium/high/critical threat**: `retreat_from_threat` with `retreatDistance: 15, safeRadius: 20, useSprint: true`

Threat level is obtained via `ctx.getThreatSnapshot()` (wired through `modular-server.ts` → `threat-hold-bridge.ts`). The threat level set is frozen: `Object.freeze(new Set(['medium', 'high', 'critical']))`.

A3. Bounds
* `RECOVERY_MAX_ACTIONS = 3` — hard cap on executed recovery actions per task
* `maxRepositionRetries = RECOVERY_MAX_ACTIONS + 1` (= 4) — terminal failure after this many reposition retries. The +1 ensures all 3 recovery actions can execute before terminal failure.
* Backoff: `RECOVERY_SHORT_BACKOFF_MS = 5_000` on recovery success, `RECOVERY_LONG_BACKOFF_MS = 60_000` on recovery failure or budget exhaustion
* Budget tracks *executed* recovery actions only (`recoveryActionCount` in task metadata)

A4. Threat-aware mode switching
Threat does NOT block recovery — it switches recovery mode. Medium+ threat → `retreat_from_threat` instead of exploration. This eliminates the need for a `recovery_blocked_by_threat` concept.

A5. Abort signal propagation
Recovery steps receive `ctx.getAbortSignal()` for cancellation propagation, ensuring recovery can be interrupted when the task is cancelled.

A6. Provenance + logging
Every recovery step emits:
* `recovery_step_dispatched` event: `{ taskId, stepId, leaf, mode, args, timestamp }`
* Golden-run dispatch record with `recovery_mode` and `recovery_for_task` fields
* Console log: `[StepExecutor] retry_hint=reposition_or_rescan ... recovery=success|failed|budget_exhausted leaf=... mode=... backoff=...`

Task metadata updated after recovery:
* `repositionRetryCount`, `lastRetryHint`, `nextEligibleAt`, `recoveryActionCount`
* `lastRecoveryOutcome` (success | failed | budget_exhausted)
* `lastRecoveryLeaf`, `lastRecoveryMode`

Tests (8 tests in sterling-step-executor.test.ts)
1. dispatches explore_for_resources for acquire_material failure (low threat)
2. dispatches retreat_from_threat when threat >= medium
3. broadens exploration tags after 2 repeat failures
4. budget exhausted after 3 actions → falls back to long backoff
5. uses step_forward_safely for non-acquisition leaf
6. max reposition retries still terminates task
7. recovery step recorded in golden-run dispatch ledger
8. recovery step propagates abort signal from executor context

Files modified:
* `packages/planning/src/executor/sterling-step-executor.ts` — recovery functions + modified retry block
* `packages/planning/src/executor/sterling-step-executor.types.ts` — `getThreatSnapshot` on context interface
* `packages/planning/src/modular-server.ts` — wire `getThreatSnapshot` into executor context
* `packages/planning/src/executor/__tests__/sterling-step-executor.test.ts` — 8 new tests

B) Keep-alive vitals → Sterling reduce re-route — **SHIPPED**

Goal
Urgent vitals thoughts (low health/food) must produce actionable tasks rather than being dropped with `dropped_no_goal_prop`. Sterling remains the sole semantic authority for `committed_goal_prop_id`.

Key discovery
Sterling's `_select_idle_goal()` (intent_reducer_v1.py:218-270) already handles vitals:
* food ≤ 6 → `("gather", "food")`
* health ≤ 8, no hostiles → `("gather", "food")`
* hostiles nearby → `("navigate", "safety")`

The problem was routing: keep-alive thoughts went through the LLM natural-language path → no `[GOAL:]` tag → null goal-prop → dropped. The fix re-routes through Sterling's structured `idle_episode_v1` reducer.

Implementation summary (keep-alive-integration.ts)

B1. Detection — `detectUrgentVitals()`
Checks `lastBotState` (cached in `onIdle()`) against thresholds:
* `HEALTH_URGENT_THRESHOLD = 8`
* `FOOD_URGENT_THRESHOLD = 6`
Returns `{ health, food, nearbyHostiles }` or `null` if not urgent.

B2. Re-routing — `trySterlingVitalsReduce()`
When `onThought()` receives a thought with null `committed_goal_prop_id` AND vitals are urgent:
1. Build a structured `idle_episode_v1` payload with canonicalized bot state
2. Call `client.reduce(rawText, { promptDigest: 'idle_episode_v1' })`
3. If Sterling returns an executable result with a real `committed_goal_prop_id`, post the rerouted thought to cognition with `vitals_rerouted: true`
4. If Sterling fails or returns non-executable, fall through to original thought posting

**No synthetic goal-prop fabrication**: Sterling mints the real `committed_goal_prop_id`. TypeScript re-routes the request, not the answer.

B3. Deterministic provenance
* Run ID: `keepalive-vitals:${thought.id}` (deterministic, not UUID)
* Payload canonicalization: inventory sorted, position floored to integers
* Posted thought includes `metadata.vitals_rerouted: true` and full `reduction` provenance

B4. Rate limiting — `VITALS_REROUTE_COOLDOWN_MS = 30_000`
Prevents Sterling spam during sustained low vitals. At most one vitals reroute per 30-second window.

B5. Transient drops — `dropped_no_goal_prop` for keepalive (thought-to-task-converter.ts)
When a keepalive thought is dropped with `dropped_no_goal_prop`:
* It is NOT immediately marked as processed (transient — may succeed on retry when botState arrives)
* Bounded by TTL only: `KEEPALIVE_DROP_TTL_MS = 120_000` (2 minutes)
* First-seen time tracked in process-local `keepaliveDropRegistry` (Map<thoughtId, firstSeenAt>)
* Registry has hard cap of 100 entries with oldest-first eviction
* No metadata mutation on the thought object (doesn't persist across HTTP fetches)
* Defensive timestamp normalization: handles numeric, ISO string, undefined, and NaN timestamps

Non-keepalive thoughts with `dropped_no_goal_prop` are still marked as processed immediately (deterministic).

B6. Provenance logging
* `[KeepAliveIntegration] keepalive_vitals_bound: goalPropId=... health=... food=... hostiles=...`
* `[KeepAliveIntegration] vitals thought rerouted via Sterling reduce`
* `[KeepAliveIntegration] vitals_reduce: not executable (...)`

Tests (12 tests in keep-alive-vitals-goal-binding.test.ts)
1. re-routes vitals thought through Sterling reduce when goal-prop is null
2. does not re-route when vitals are normal
3. does not re-route when committed goal-prop already exists
4. does not re-route when lastBotState is null
5. falls through gracefully when Sterling reduce fails
6. rate-limits vitals reroute to at most once per cooldown window
7. falls through when Sterling returns non-executable
8. thought not marked as processed when dropped_no_goal_prop + source=keepalive
9. non-keepalive thought IS marked as processed when dropped_no_goal_prop
10. keepalive dropped_no_goal_prop marked processed after TTL expires
11. handles non-numeric thought.timestamp defensively (treats as "now")
12. handles ISO string timestamp correctly

Files modified:
* `packages/planning/src/modules/keep-alive-integration.ts` — vitals detection, Sterling re-route, rate limiting
* `packages/planning/src/task-integration/thought-to-task-converter.ts` — transient drop with TTL-only bounding + process-local registry
* `packages/planning/src/modules/__tests__/keep-alive-vitals-goal-binding.test.ts` — 12 tests (new file)

C) Food gather lowering becomes biome/world-aware via context injection

Goal
Eliminate the hardcoded food target selection that repeatedly chooses unavailable items (e.g., sweet_berry_bush outside taiga), by making “gather food” lowering depend on measured local availability.

Decision (default approach)
Implement “context injection + Sterling chooses” as the primary path, because it preserves the semantic boundary: TS measures; Sterling decides.

Fallback (explicitly optional)
Allow an emergency TS-side override only behind an explicit “BOUNDARY_ESCALATION_ALLOWLIST” flag, used solely to keep the agent alive if Sterling-side context selection is blocked.

Behavior specification
C1. World context: available food sources
TypeScript gathers a structured list of locally available food sources. Sources may include:

* Blocks: berry bushes, crops, etc.
* Entities: animals (for hunting) — even if hunting is not yet implemented, presence should be detectable
* Inventory: any edible items already held

C2. Canonical representation
The context payload must be canonicalizable and auditable:

* Stable ordering (sorted)
* Explicit radius used, timestamp, and world snapshot identifiers if available
* No hidden computed heuristics; just measurements

C3. Passing context to Sterling
When requesting lowering for gather(food), include this context. Sterling’s lowering chooses a target from the provided availability set (or emits “need exploration” if none).

C4. “Need exploration” output
If no local food sources exist, Sterling should produce a task that explicitly requests exploration/reposition to find food sources. This dovetails with A (retry-hint recovery) and ensures the system moves rather than re-asking for impossible food.

C5. Wire in existing priority list
If you already maintain a TS priority list, treat it as a sensor-query ordering (what to look for first), not the semantic chooser. The chooser is Sterling.

Acceptance criteria
C-AC1. In a biome without sweet berry bushes, gather(food) does not repeatedly dispatch sweet_berry_bush acquisition.
C-AC2. If food sources exist locally, gather(food) selects one that exists (as measured by the context).
C-AC3. If no food sources exist locally, the system produces an explicit exploration-oriented task (not repeated retries of an unavailable target).
C-AC4. Context payload appears in provenance/traces for the lowering decision, so you can explain “why did Sterling pick X?”

Targeted edits

* TS world-sensing layer: function to collect “available food sources” from nearby scans + inventory
* Task integration / Sterling request payload: add optional world_context field
* Sterling lowering code for gather(food): accept context; choose from available set; emit “need exploration” when empty
* Trace bundle: include the context digest or canonical payload so it is auditable

Tests

* Unit (Sterling): lowering chooses from provided context set; empty set yields exploration request
* Integration: simulated world context with no berries yields non-berry plan
* Regression: ensure context absence preserves old behavior only when explicitly allowed (so you don’t silently reintroduce hardcoding)

Failure-mode cards

* FM-C1: Boundary erosion (TS starts “choosing”) → Mitigation: TS only reports availability; Sterling chooses; TS override gated and logged.
* FM-C2: Context lies (stale scan) → Mitigation: rescan step in A; include scan timestamp/radius; treat stale contexts as low-confidence and prefer exploration.

D) Minimal threat reflex (gated)

Goal
Prevent obvious “stand still and die” behavior in the presence of meaningful threat signals when HP is low, without waiting for the full combat system.

Scope
A minimal reflex only. This is not combat; it is “retreat / create space / avoid threats.” It must be gated behind a feature flag and treated as P1-partial.

Behavior specification
D1. Trigger
If threatLevel ≥ medium AND health ≤ HP_THRESHOLD, emit a retreat-oriented action/goal.

D2. Action
Prefer existing retreat leaves if they exist; if not, create a minimal “move away from threat vector” behavior that uses navigation primitives you already trust.

D3. Interaction with A
If a task is in recovery injection and threat triggers, threat reflex may preempt recovery to avoid wandering under threat.

D4. Provenance
Log explicitly:

* threat_reflex_triggered: { threat, health, location, decision }
* threat_reflex_action_dispatched: { leaf, args }

Acceptance criteria
D-AC1. In a harness where threat ≥ medium and HP below threshold, the agent attempts to increase distance from the threat rather than remaining stationary.
D-AC2. Reflex is bounded (no infinite fleeing): max flee duration or distance, after which it re-evaluates.
D-AC3. Gated: reflex behavior is inactive when the flag is off; no silent behavior change.

Targeted edits

* Threat perception integration point where threat events are currently logged but not acted on
* Planning producer layer for survival/threat reflex emissions
* Config/flags surface for enabling the reflex

Tests

* Unit: trigger conditions produce retreat emission
* Integration: simulated threat event results in retreat dispatch event in trace

Cross-cutting verification plan

1. Unit-level verification

* A: retry_hint → recovery injection ordering and bounds
* B: synthetic goal binding + dedupe
* C: lowering selection based on provided context
* D: trigger logic gated by flag

2. Golden-run / provenance verification
   Extend the golden-run recorder (or equivalent provenance chain) to record these new event types so you can prove:

* Recovery was injected for the correct reason, with the correct bounds
* Vitals were bound to a goal (or skipped for a logged reason)
* Context was passed and influenced lowering choice
* Threat reflex triggered under defined conditions

3. Runtime harness acceptance
   Run the same “debug + capture logs” harness you’ve been using and check these measurable outcomes:

* No repeated identical gather(food) task cycles when the target is unavailable
* No keep-alive vitals drops due to missing goal props
* At least one reposition occurs after a rescan-capable failure
* Under threat+low HP, bot attempts to create space (when gated on)

Rollout / sequencing (minimize confounds)

Phase 1: A + B — **COMPLETE**
Shipped in commits:
* `51e193f` feat(executor): inject recovery step before retry on reposition_or_rescan
* `a0e5f1e` feat(keepalive): re-route urgent vitals through Sterling reduce
* `346e8f8` fix(planning): align tests with relaxed contracts
Breaks "stationary doom loops" generically and ensures vitals become actionable. Establishes a stable control loop for later changes.

Phase 2: C — PENDING
Rationale: removes the dominant semantic repetition for food tasks; pairs well with A's ability to reposition/rescan.

Phase 3: D (gated) — PENDING
Rationale: adds survival safety; easiest to mis-tune, so add after you can reliably move/rescan and have good observability.

Telemetry (Phase 1 — structured logs, not counters)

Phase 1 uses structured console logs for observability. Formal counters deferred to Phase 2+.

A observability:
* `[StepExecutor] retry_hint=reposition_or_rescan ... recovery=success|failed|budget_exhausted`
* `recovery_step_dispatched` event on executor emitter
* Golden-run dispatch records with `recovery_mode`, `recovery_for_task`
* Task metadata: `lastRecoveryOutcome`, `lastRecoveryLeaf`, `lastRecoveryMode`, `recoveryActionCount`

B observability:
* `[KeepAliveIntegration] keepalive_vitals_bound: goalPropId=... health=... food=... hostiles=...`
* `[KeepAliveIntegration] vitals thought rerouted via Sterling reduce`
* `[Thought→Task]` structured log with `decision: dropped_no_goal_prop` (target: zero for keepalive source)
* Posted thought `metadata.vitals_rerouted: true` with full reduction provenance

Future counters (Phase 2+):
C: food_context_injected_total, food_context_empty_total, gather_food_selected_from_context_total, gather_food_fallback_used_total (should be 0 unless explicitly enabled)
D: threat_reflex_triggered_total, threat_reflex_actions_total

Open questions you do not need to answer before starting (but should log explicitly)

* Exact threshold tuning (HP_THRESHOLD, threat level mapping) — acceptable to start conservative and adjust with captured evidence.
* Exact scan radii and time bounds — same approach: begin with safe bounds, then iterate.