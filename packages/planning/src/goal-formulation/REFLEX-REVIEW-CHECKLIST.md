# Reflex Infrastructure Review Checklist

Review-ready checklist for the hunger driveshaft (merged) and the next two reflexes (threat + torch). Covers acceptance criteria, failure-mode cards, and operational semantics that matter once multiple reflexes are stacked.

---

## Part 1: Hunger Driveshaft — Acceptance Criteria

### AC-1: Pipeline Exercises Real Goal Formulation
- [ ] `HomeostasisMonitor.sample()` called with computed hunger signal
- [ ] `generateNeeds()` produces SURVIVAL need with `urgency = hunger`
- [ ] `GoalGenerator.generateCandidates()` matches `eat_immediate` template when `urgency > 0.7`
- [ ] `PriorityScorer.rankGoals()` ranks eat goal highest when hungry
- [ ] No bypass of the pipeline (no hardcoded goals or tasks)

### AC-2: Proof Identity Is Content-Addressed
- [ ] Same bot state + same outcome = same `bundle_hash`
- [ ] Different `proof_id` (UUID) does NOT change `bundle_hash`
- [ ] Different `reflexInstanceId` (UUID) does NOT change `bundle_hash`
- [ ] Different timing does NOT change `bundle_hash`
- [ ] Different `task_id` does NOT change `bundle_hash`
- [ ] Different execution result DOES change `bundle_hash`
- [ ] `items_consumed` is sorted before hashing
- [ ] `food_after` and `delta` are `null` (not sentinel `-1`) when after-state unavailable

### AC-3: Verification Is Stricter Than Executor
- [ ] Receipt confirms consumption → pass
- [ ] Food increased AND edible inventory decreased → pass
- [ ] Food increased but no consumption evidence → **FAIL**
- [ ] No food increase and no receipt → **FAIL**
- [ ] After-state fetch failure → **FAIL** with distinct `after_state_unavailable` reason

### AC-4: Hysteresis Prevents Oscillation
- [ ] Fires at T_low (food <= 12), disarms
- [ ] Does NOT fire again until food >= T_high (16)
- [ ] Critical (food <= 5) fires even when `idleReason !== 'no_tasks'`

### AC-5: Shadow Mode Is Side-Effect-Free
- [ ] `dryRun: true` runs full pipeline (accurate shadow logs)
- [ ] `dryRun: true` does NOT disarm hysteresis
- [ ] `dryRun: true` does NOT store accumulators
- [ ] `dryRun: true` does NOT emit `task_planned` (no task will be enqueued)
- [ ] `dryRun: true` still emits `goal_formulated` (shadow observability)
- [ ] Switching from shadow to live does not require food recovery to T_high first

### AC-6: Join Key Is Not Conflated With Identity Key
- [ ] `reflexInstanceId` (UUID) is the accumulator map key
- [ ] `goalKey` (content-hash) is used for dedup/identity only
- [ ] Task metadata carries both `goalKey` and `reflexInstanceId`
- [ ] Completion handler looks up accumulator by `reflexInstanceId`, not `goalKey`

### AC-7: Event Ordering Matches Causality
- [ ] `goal_formulated` emitted during `evaluate()` (trigger time)
- [ ] `task_planned` emitted during `evaluate()` (plan time, live mode only)
- [ ] `task_enqueued` emitted after `addTask()` returns (integration time, real task ID)
- [ ] `goal_verified` emitted during `buildProofBundle()` (completion time)
- [ ] `goal_closed` emitted during `buildProofBundle()` (completion time)

### AC-8: Fail-Closed Integration
- [ ] `ENABLE_AUTONOMY_REFLEXES=false` → no controller instantiated, no behavior change
- [ ] `EXECUTOR_MODE=shadow` → dryRun evaluation, logs only, no task injection
- [ ] Controller throw → caught, logged, executor continues
- [ ] Proof assembly throw → caught, logged, task completion unaffected
- [ ] `getBotState()` failure → graceful skip, no crash

### AC-9: Golden-Run Evidence
- [ ] `recordReflexProof()` uses deep merge (does not clobber sibling `execution` fields)
- [ ] Proof bundle appears at `execution.reflex_proof` in golden-run artifact
- [ ] Bundle includes both identity (hashed) and evidence (runtime) layers

### AC-10: Traceability / Joinability

Every reflex-emitted lifecycle event includes `reflexInstanceId` so an operator can follow a thread from trigger → queue → dispatch → completion → proof without guessing.

- [ ] Every lifecycle event type carries `reflexInstanceId`
- [ ] Task metadata includes `reflexInstanceId` and `goalKey` at creation time and remains unchanged through dispatch
- [ ] Golden-run artifact includes enough information to join:
  - injected task id
  - `reflexInstanceId`
  - dispatched leaf + args digest (or step digest)
  - proof bundle hash
- [ ] Event semantics are unambiguous:
  - `task_planned` at evaluate() — intent, pending ID
  - `task_enqueued` after `addTask()` returns — fact, real task ID
  - `task_enqueue_skipped` when `addTask()` fails/dedupes/returns null — explicit failure
  - `goal_verified` / `goal_closed` at completion — outcome
- [ ] All events for a single reflex firing share the same `reflexInstanceId` (tested)
- [ ] `emitTaskEnqueued()` method bridges controller → integration layer
- [ ] `emitTaskEnqueueSkipped()` emits skip event with reason AND evicts accumulator
- [ ] `EnqueueSkipReason` enum: `deduped_existing_task` (reserved for future pre-check), `enqueue_failed`, `enqueue_returned_null`
- [ ] Missing `task_enqueued` after `task_planned` is unambiguous (operator checks for `task_enqueue_skipped`)
- [ ] `tryEnqueueReflexTask()` returns discriminated `ReflexEnqueueResult`: `{ kind: 'enqueued', taskId }` | `{ kind: 'skipped', reason }` — structural mutual exclusion (no boolean guard needed)
- [ ] Both injection sites (critical + idle) use `tryEnqueueReflexTask()` — no inline try/catch/if chains
- [ ] Every `task_planned` is mechanically followed by exactly one of: `task_enqueued` | `task_enqueue_skipped` (7 regression tests in `reflex-enqueue.test.ts`)

### AC-11: Fault Injection Invariants

Failures must not leave sticky state (armed/disarmed, orphan accumulators, or repeated injections).

- [ ] If `getBotState()` returns usable data but pipeline returns null (no food, threshold not met), controller does NOT:
  - disarm
  - store accumulators
  - emit misleading lifecycle events (no `goal_formulated` or `task_planned` unless reflex fires)
- [ ] If `buildProofBundle` receives null after-state (getBotState failure at completion):
  - records `after_state_unavailable` reason
  - overrides execution result to `error`
  - still cleans up accumulator (not wedged)
  - still emits `goal_closed` with `success=false`
- [ ] If proof verification fails:
  - bundle records `execution.result: 'error'` even if executor step completed
  - `goal_closed` emits with `success=false` and exact reason from `VerificationReason` enum
- [ ] Repeated null evaluations (N ticks above threshold) do not leak lifecycle events

### AC-12: Restart / Duplication Safety

- [ ] Hysteresis prevents double-injection within same controller lifecycle (at most 1 result before disarming)
- [ ] Fresh controller (simulating restart) re-fires — dedup is at integration layer via `findSimilarTask()` title match
- [ ] Single executor instance constraint is documented; multi-instance is NOT supported
- [ ] Rapid evaluations at T_low produce exactly 1 result before disarming

**Integration-layer dedup (not controller-level — documented, not unit-tested):**
- [ ] Before injecting, `addTask()` calls `findSimilarTask()` for exact title match among pending/active tasks
- [ ] Queue scan guard: check for active tasks with `taskProvenance.builder === 'hunger-driveshaft-controller'` before injection
- [ ] On `addTask()` exception: `tryEnqueueReflexTask` returns `{ kind: 'skipped', reason: ENQUEUE_FAILED }` → caller emits skip + evicts accumulator
- [ ] On `addTask()` returning null/no id: `tryEnqueueReflexTask` returns `{ kind: 'skipped', reason: ENQUEUE_RETURNED_NULL }` → caller emits skip + evicts accumulator
- [ ] Mutual exclusion is structural (discriminated union return), not stateful (no boolean guard) — double-emit is impossible without writing obviously wrong code

**Architectural decisions (documented, not implemented):**
- [ ] **Dedup key direction:** Current dedup uses title-based `findSimilarTask()` inside `addTask()`. Future direction: add explicit pre-check via `findSimilarTask()` or metadata-based `dedupeKey` (e.g., `taskProvenance.builder + goalKey`) *before* calling `addTask()`, so we can emit `DEDUPED_EXISTING_TASK` with `existing_task_id`. Until implemented, `DEDUPED_EXISTING_TASK` is reserved in `EnqueueSkipReason` but NOT emitted at runtime — only `ENQUEUE_RETURNED_NULL` and `ENQUEUE_FAILED` are used. If `addTask()` internally deduplicates and returns null, it surfaces as `ENQUEUE_RETURNED_NULL` (honest about what we observed, not what we inferred).
- [ ] **Shadow-mode `task_planned` emit rule:** Current decision: dryRun does NOT emit `task_planned` (no false promises). Alternative: emit with `will_enqueue: false` flag for full shadow observability. Either is defensible; the choice must be consistent across all reflexes.
- [ ] **Skip as terminal event:** `task_enqueue_skipped` is a terminal event for the reflex lifecycle (no `goal_closed` follows). This is intentional: no proof bundle exists because no task was executed. Future direction: add `goal_aborted` event that mirrors `goal_closed` shape but without `bundle_hash`, for "why did this reflex not produce a proof?" queries. Current contract: a reflex firing is terminal if it either closes (proof built) OR enqueue-skips (no task ran).
- [ ] **Accounting invariant:** Per time window, `task_planned_count == task_enqueued_count + task_enqueue_skipped_count`. If this breaks, there is a missing terminal event emission. Not yet enforced in code; candidates: runtime assertion in `RecordingLifecycleEmitter`, or a periodic health-check log.

### AC-13: Critical Response SLO (Once Priority Exists)

Deferred until executor supports priority lanes or soft pause. Tracked as Gap-1.

- [ ] When `food <= criticalThreshold`, the reflex task begins execution within X ticks or Y seconds (TBD)
- [ ] Under backlog, reflex task is ordered ahead of non-critical tasks
- [ ] If executor is rate-limited or circuit-breaker-open, reflex produces explicit "not executed" evidence reason

### AC-14: Tick Budget + Call Count

Deferred until stacking reflex #2. Tracked as Gap-4.

- [ ] Per executor tick: `getBotState()` is called at most once (snapshot cache), regardless of number of reflexes
- [ ] Reflex evaluation time budget: p95 < 10ms per reflex on dev hardware
- [ ] Proof assembly does not block tick loop

### AC-15: Verification Reason Exhaustiveness

- [ ] Verification failure reasons are a closed `VerificationReason` enum (no freeform strings)
- [ ] Each failure-mode test asserts the exact enum value (not just "fails")
- [ ] `after_state_unavailable` is distinct from `no_food_increase_or_consumption_evidence`
- [ ] `ALL_VERIFICATION_REASONS` array covers every enum member
- [ ] Exhaustiveness test asserts every enum value is exercised by at least one test case

---

## Part 2: Known Operational Gaps (Flagged for Review)

### Gap-1: "Critical Preemption" Is Injection, Not True Preemption

**Current behavior:** When food <= criticalThreshold and executor has eligible tasks, we inject a reflex task via `addTask()`. But the executor picks tasks by priority/FIFO ordering, so the reflex task may sit behind a long backlog.

**Impact:** The name "preemption" is misleading. The reflex task competes with existing tasks, it doesn't interrupt them.

**Mitigations (increasing invasiveness):**
1. **Priority boost:** Set reflex task priority higher than any normal task (e.g., `priority: 1.0, urgency: 1.0`). The executor already sorts by priority. This may be sufficient if priority values are respected.
2. **Dedicated reflex lane:** Check a small in-memory "reflex queue" before the normal task queue each tick. Hard-capped at 1-2 entries.
3. **Soft pause:** Mark current task `blocked_by_preemption`, execute reflex, resume. Required for threat reflexes where timing matters.

**Review framing:** "Critical injection is allowed outside the idle gate; true queue preemption is a follow-on."

**Related AC:** AC-13 (Critical Response SLO)

### Gap-2: task_planned Uses Placeholder Task ID — RESOLVED

**Status:** Resolved via `task_planned` + `task_enqueued` split.

- `task_planned` emits at evaluate() time with `pending-{reflexInstanceId.slice(0,8)}`
- `task_enqueued` emits after `addTask()` returns with real task ID
- Both carry `reflexInstanceId` for joining
- In shadow mode, `task_planned` is NOT emitted (no task will be enqueued)

**Related AC:** AC-10 (Traceability / Joinability)

### Gap-3: No Cross-Process / Restart Dedup

**Current behavior:** Hysteresis and accumulators are in-memory only. On restart, `armed` resets to `true` and the bot may re-inject the same semantic goal.

**Natural dedup already in place:** `taskIntegration.addTask()` calls `findSimilarTask()` which checks for exact title match among pending/active tasks. Since all hunger reflexes emit `title: 'Eat food (reflex)'`, duplicate injection will be caught if the first task hasn't completed yet.

**Remaining gap:** If the first task completed (or failed) and the bot restarts before food recovers, a new injection is correct behavior (the bot is still hungry). The real risk is rapid restart loops creating N tasks before any complete.

**Additional mitigations:**
1. **Queue scan guard:** Before injecting, check `taskIntegration.getActiveTasks()` for any task with `metadata.taskProvenance.builder === 'hunger-driveshaft-controller'`.
2. **Dedupe lease:** Store `goalKey` with short TTL in a shared store (if multi-process).

**Constraint documented:** Single executor instance only; multi-instance is unsupported and guarded.

**Related AC:** AC-12 (Restart / Duplication Safety)

### Gap-4: Multiple getBotState() Calls Per Tick

**Current behavior:** Up to 3 calls per tick: keep-alive, critical preemption check, idle evaluation. Plus another on task completion.

**Impact:** Performance overhead and I/O flake amplification. Acceptable with 1 reflex, problematic with 3+.

**Mitigation:** Per-tick snapshot cache scoped to the executor loop iteration. Fetch once, reuse for all hooks. Still keep try/catch boundaries.

**Related AC:** AC-14 (Tick Budget + Call Count)

### Gap-5: Homeostasis Polarity Is Documented But Not Enforced

**Current behavior:** Polarity contract is in JSDoc comments on `HomeostasisState`. Nothing prevents a future translator from getting it backwards.

**Mitigation (deferred):** Add a compile-time or test-time assertion that validates polarity alignment between translator outputs and need-generator expectations. E.g., a test that asserts `translateBotState({food: 0}).hunger === 1.0` (deficit polarity) and `translateBotState({health: 20}).health === 1.0` (satisfaction polarity).

---

## Part 3: Threat Reflex — Design Card

### Available Infrastructure

**Goal template:** `flee_immediate` (NeedType.SAFETY)
- Conditions: `need.urgency > 0.8` AND `worldState.getThreatLevel() > 0.5`
- Produces GoalType.SAFETY goal: "Escape immediate threat"

**Fallback template:** `build_defenses` (NeedType.SAFETY)
- Conditions: `need.urgency > 0.5` AND `worldState.hasItem('blocks', 10)`

**Available leaves:**
- `attack_entity` — `{?entityId, ?radius, ?duration, ?retreatHealth}` — has built-in retreat at low health
- `move_to` — `{?target, ?pos, ?distance}` — navigation for flee
- No dedicated `flee` leaf exists

**WorldState signals needed:**
- `getThreatLevel()` — must be derived from `nearbyHostiles` (translator already computes safety)
- `getHealth()` — already mapped

### Proposed Controller: ThreatDriveshaftController

```
Trigger: safety <= 0.4 (need urgency = 1 - safety >= 0.6)
         AND nearbyHostiles > 0
Critical: safety <= 0.2 (preempts even with backlog)
Reset: safety >= 0.7 (no hostiles for sustained period)

Pipeline: homeostasis → generateNeeds() → SAFETY need → flee_immediate template
          → single-step task: { leaf: 'move_to', args: { distance: 32 } }

Proof identity: trigger.safety, trigger.hostile_count, execution.result
Evidence: specific hostile entities, positions, timing
```

### Failure-Mode Card

| Failure | Cause | Impact | Mitigation |
|---------|-------|--------|------------|
| Flee fires during combat | Hostile detected while attack_entity is running | Competing tasks: flee vs fight | Soft pause of combat task, or priority-based: flee > fight when health < retreatHealth |
| Oscillation: flee → hostiles follow → flee again | Hysteresis too tight | Infinite flee loop, bot runs forever | Wider hysteresis gap (T_low=0.4, T_high=0.7) + max flee count per window |
| False positive: passive mob near hostile | nearbyHostiles counts all hostile-tagged mobs | Flee from distant zombies | Add distance weighting to threat signal, or require hostiles within 16 blocks |
| Flee into danger | move_to picks random direction | Could flee toward more hostiles | Directional flee: move away from hostile centroid (requires leaf enhancement) |
| Proof verification: "did we actually flee?" | No inventory delta like food consumption | Harder to verify than eating | Verify position delta > threshold AND safety improved. Receipt: distance traveled |

### Two-Key Pattern Application

- `goalKey = contentHash(canonicalize({ need_type: 'safety', template: 'flee_immediate' }))` — stable
- `reflexInstanceId = randomUUID()` — per-emission join key
- Accumulator stores: trigger safety, hostile count, position before
- Proof verification: position delta > 16 blocks OR no hostiles in range after

### Verification Reason Enum (Threat-Specific)

```
POSITION_DELTA_SUFFICIENT    — moved > 16 blocks from trigger position
SAFETY_IMPROVED              — safety signal increased after execution
NO_POSITION_CHANGE           — bot didn't move (flee failed)
SAFETY_NOT_IMPROVED          — still threatened after execution
AFTER_STATE_UNAVAILABLE      — getBotState failed at completion
```

---

## Part 4: Torch Reflex — Design Card

### Available Infrastructure

**NO dedicated torch goal template exists.** Closest:
- `explore_redstone` checks `getLightLevel() > 0.5` but is for automation, not safety
- `build_defenses` targets `LightLevel: 15` but requires 10 blocks

**Available leaves:**
- `place_torch_if_needed` — `{?lightThreshold, ?position}` — conditional placement
- `place_torch` — `{?position}` — unconditional placement

**WorldState signals needed:**
- `getLightLevel()` — must be derived from bot state (NOT currently in `getBotState()` output)
- This is a **blocker**: the Minecraft interface `/state` endpoint does not return light level

### Proposed Controller: TorchDriveshaftController

```
Trigger: lightLevel <= 7 (mob spawning threshold in Minecraft)
         AND has torch in inventory
Critical: lightLevel <= 3 AND night time (preempts)
Reset: lightLevel >= 10

Pipeline: homeostasis → generateNeeds() → SAFETY need (via low safety from darkness)
          → NEW template: 'place_light_source'
          → single-step task: { leaf: 'place_torch_if_needed', args: { lightThreshold: 7 } }

Proof identity: trigger.light_level, preconditions.has_torch, execution.result
Evidence: position, time_of_day, torch_count_before/after
```

### Prerequisites (Before Implementation)

1. **Light level observable:** Add `lightLevel` to `getBotState()` return type and Minecraft interface `/state` endpoint
2. **Goal template:** Add `place_light_source` template to `GoalGenerator` for `NeedType.SAFETY`
3. **Bot-state translator:** Add `lightLevel` → homeostasis mapping (affects safety signal)

### Failure-Mode Card

| Failure | Cause | Impact | Mitigation |
|---------|-------|--------|------------|
| Torch spam | Light level fluctuates near threshold | Places torches every tick | Hysteresis (T_low=7, T_high=10) + cooldown after placement |
| No torches in inventory | Trigger fires but precondition fails | Wasted pipeline evaluation | Precondition gate before pipeline (like hunger's food check) |
| Underground mining conflict | Torch placement interrupts dig_block sequence | Task interference | Priority: torch < mining unless lightLevel <= 3 |
| Proof verification: "did light improve?" | Light level not in receipt | Can't verify placement worked | Verify: light level after > light level before, OR torch count decreased |
| Light level not available | `/state` endpoint doesn't return it | Controller can never fire | **BLOCKER** — must add to Minecraft interface first |

### Two-Key Pattern Application

- `goalKey = contentHash(canonicalize({ need_type: 'safety', template: 'place_light_source' }))` — stable
- `reflexInstanceId = randomUUID()` — per-emission join key
- Accumulator stores: trigger light level, torch count before, position
- Proof verification: torch count decreased AND (light level increased OR receipt confirms placement)

### Verification Reason Enum (Torch-Specific)

```
TORCH_COUNT_DECREASED        — inventory confirms torch was placed
LIGHT_LEVEL_IMPROVED         — light level increased after placement
NO_TORCH_DECREASE            — torch count unchanged (placement failed)
LIGHT_LEVEL_NOT_IMPROVED     — still dark after execution
AFTER_STATE_UNAVAILABLE      — getBotState failed at completion
```

---

## Part 5: Shared Reflex Infrastructure Needs

### Before Stacking Reflex #2

1. **Queue scan guard** — Before any reflex injects a task, scan active tasks for matching `taskProvenance.builder`. Prevents double-injection without requiring external state. (AC-12)

2. **Per-tick botState cache** — Fetch `getBotState()` once per executor tick, share across all reflex evaluations. Reduces I/O from O(N reflexes) to O(1). (AC-14)

3. **Reflex registry** — Instead of N separate `if (global.reflex_X)` blocks in modular-server.ts, create a `ReflexRegistry` that iterates registered controllers. Each controller implements a common `evaluate(botState, idleReason, opts)` interface (they already do).

### Before Layer 3 (Periodic Goal Formulation)

4. **Goal pump tick** — Periodic (not idle-only) call to:
   - Snapshot bot state
   - Translate to homeostasis
   - Run `GoalManager.formulateGoals()` (full pipeline)
   - Emit candidate goals report artifact
   - Only inject tasks for "locally decidable" goals (eat, flee, torch)
   - All other goals flow through cognition → Sterling pathway

5. **Polarity enforcement test** — Compile-time or test-time assertion that translator polarity matches need-generator expectations.

6. **Threat signal translation** — Extend `translateBotState()` with threat-level computation (currently only affects `safety` indirectly). The `WorldState.getThreatLevel()` method needs a direct source.

---

## Part 6: Operational Runbook

### Shadow Validation

```bash
ENABLE_AUTONOMY_REFLEXES=true EXECUTOR_MODE=shadow npm start
```

1. Confirm `GET /reflexes/hunger/status` returns `{ initialized: true, armed: true }`
2. Force food low (or wait for natural drain)
3. Confirm logs show `[Reflex:shadow] Would inject task` without disarming
4. Confirm `GET /reflexes/hunger/status` still shows `armed: true` (dryRun preserved state)
5. Confirm NO `task_planned` events in shadow mode (dryRun does not emit task events)
6. Confirm `goal_formulated` events ARE emitted in shadow mode (shadow observability)

### Live Validation

```bash
ENABLE_AUTONOMY_REFLEXES=true EXECUTOR_MODE=live npm start
```

1. Force food <= 5 with edible inventory
2. Confirm `[Reflex] Hunger driveshaft injected task` log appears
3. Confirm task has `metadata.taskProvenance.builder === 'hunger-driveshaft-controller'`
4. Confirm task has both `metadata.goalKey` and `metadata.reflexInstanceId`
5. Confirm lifecycle events follow: `goal_formulated` → `task_planned` → `task_enqueued` → ... → `goal_verified` → `goal_closed`
6. Confirm all lifecycle events share the same `reflexInstanceId`
7. Confirm `task_enqueued` carries the real task ID (not `pending-*`)
8. Wait for task completion
9. Confirm `[Reflex] Proof bundle assembled` log with hash and verification status
10. If golden run active: confirm `execution.reflex_proof` in artifact

### Critical Preemption Validation

1. Start with eligible tasks in backlog + food <= 5
2. Confirm `[Reflex:CRITICAL] Hunger preemption injected task` log appears
3. Confirm injected task enters the queue (may not execute immediately — see Gap-1)

### Fault Injection Validation

1. Simulate `getBotState()` returning no food items with food=5
2. Confirm NO lifecycle events emitted (no `goal_formulated`, no `task_planned`)
3. Confirm controller remains armed
4. Simulate task completion with `getBotState()` failure (null after-state)
5. Confirm proof bundle records `after_state_unavailable` reason
6. Confirm accumulator is cleaned up (not wedged for future emissions)

### Rollback

```bash
ENABLE_AUTONOMY_REFLEXES=false npm start
# OR simply omit the env var (default is off)
```

No other behavior changes. Controller is never instantiated.

### Debug Homeostasis

```bash
ENABLE_AUTONOMY_REFLEXES=true DEBUG_HOMEOSTASIS=true npm start
```

Logs computed homeostasis vector each idle tick:
```
[Reflex:debug] Homeostasis vector: {"health":0.8,"hunger":0.75,"safety":0.5,"energy":0.53,"defensiveReadiness":0.6}
```

Verify that hunger urgency crosses the `eat_immediate` gate exactly when food < 6.

---

## Part 7: Test Coverage Matrix

| AC | Test File | Test Count | Status |
|----|-----------|------------|--------|
| AC-1 | hunger-driveshaft-controller.test.ts | 7 | Passing |
| AC-2 | hunger-driveshaft-controller.test.ts | 9 | Passing |
| AC-3, AC-15 | hunger-driveshaft-controller.test.ts | 10 | Passing |
| AC-4 | hunger-driveshaft-controller.test.ts | 2 | Passing |
| AC-5 | hunger-driveshaft-controller.test.ts | 4 | Passing |
| AC-6 | hunger-driveshaft-controller.test.ts | 2 | Passing |
| AC-7, AC-10 | hunger-driveshaft-controller.test.ts | 10 | Passing |
| AC-8 | modular-server.ts (integration) | — | Manual |
| AC-9 | golden-run-recorder (existing) | — | Passing |
| AC-11 | hunger-driveshaft-controller.test.ts | 5 | Passing |
| AC-12 | hunger-driveshaft-controller.test.ts | 4 | Passing |
| AC-13 | — | — | Deferred (Gap-1) |
| AC-14 | — | — | Deferred (Gap-4) |
| Enqueue | reflex-enqueue.test.ts | 8 | Passing |
| Translator | bot-state-translator.test.ts | 32 | Passing |
| **Total** | | **112** | **All passing** |
