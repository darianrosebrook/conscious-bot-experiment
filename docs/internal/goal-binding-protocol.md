# Goal Binding and Activation Protocol v0

Companion to [`long-horizon-build.md`](long-horizon-build.md). That document defines the checkpoint/resume execution substrate (Stages 0–4). This document defines the coordination layer above it: how long-horizon goals get durable identity, activation/hold semantics, completion verification, and deduplication.

## Scope

Applies to goal-bound tasks — currently building goals routed through `MinecraftBuildingSolver`, but the binding layer is goal-type-agnostic. Non-goals for v0: multi-agent goal coordination, inter-goal dependency graphs, aesthetic goal scoring.

## Current architecture (grounding)

The codebase has two parallel systems that don't bind to each other:

| System | Has | Lacks |
|--------|-----|-------|
| **Goal** (`types.ts`, `goal-formulation/`) | `GoalType` enum, `GoalStatus` (PENDING/ACTIVE/COMPLETED/FAILED/SUSPENDED), `priority`/`urgency`/`utility`, `PriorityScorer.rankGoals()`, `parentGoalId`/`subGoals` | Binding to Task IDs, identity key, activation triggers, completion verifier reference |
| **Task** (`task.ts`, `task-integration.ts`) | `parentTaskId`/`childTaskIds`, `priority`/`urgency` (0-1), `blockedReason`, `paused`/`unplannable` states, `source: 'goal'`, `metadata.solver` namespace | Goal instance reference, hold protocol with resume hints, dedup beyond title similarity |

The bridge is thin: a Task can have `source: 'goal'` but carries no reference to which Goal instance produced it. Goals select tasks via priority scoring but don't track which tasks they spawned.

### Existing status and field inventory

**Task statuses**: `pending`, `pending_planning`, `active`, `completed`, `failed`, `paused`, `unplannable`

**Task hold-adjacent fields**: `metadata.blockedReason` (string), `metadata.nextEligibleAt` (number)

**Goal statuses**: `PENDING`, `ACTIVE`, `COMPLETED`, `FAILED`, `SUSPENDED`

**Goal scoring**: `PriorityScorer.rankGoals()` produces `{ urgency, feasibility, opportunityCost, contextBonus, historicalSuccess, resourceConstraint }` breakdown.

**Task management transitions**: `pause` (→ paused), `resume` (paused → pending), `cancel` (→ failed), `prioritize` (same status, priority changes). Defined in explicit transition table.

---

## Design: bind, don't replace

Rather than introducing a third concept, extend both existing types with a binding layer. The goal system formulates intent; the task system executes it; a `goalBinding` on the task is the join key.

### Source of truth contract

**Task is canonical for execution state.** Goal is canonical for strategic intent.

Concretely:
- Task owns: `status`, `progress`, `steps`, `metadata.build` (execution state), `metadata.goalBinding.hold` (hold details)
- Goal owns: `type`, `priority` (strategic importance), `preconditions`, `effects`
- Computed from Task → Goal: When Task status changes, a synchronization reducer updates the corresponding Goal status deterministically:

| Task transition | Goal effect |
|-----------------|-------------|
| `active` → `paused` | Goal → `SUSPENDED` with reason from `hold.reason` |
| `active` → `completed` | Goal → `COMPLETED` only if completion verifier passes |
| `active` → `failed` | Goal → `FAILED` |
| `paused` → `pending` (reactivation) | Goal → `ACTIVE` |
| `pending_planning` (blocked) | Goal stays `ACTIVE` (solver issue, not goal issue) |

- **GoalManager must not maintain competing state.** It reads Task status via the binding to determine goal health. It does not independently track "is this goal done" — that's the verifier's job, triggered through the Task.
- `urgency` is computed once per evaluation cycle by `PriorityScorer` and written to the Task's `urgency` field. Goal.urgency is input to the scorer, not a competing runtime value.

---

## A. Task-side binding (`task.metadata.goalBinding`)

```typescript
interface GoalBinding {
  /**
   * Immutable instance ID (random UUID). Never changes.
   * All internal references (parent/child links, event payloads, logs) use this.
   */
  goalInstanceId: string;

  /**
   * Deterministic lookup key for dedup. May change once (Phase A → Phase B).
   * Used only by the resolver for matching incoming intent to existing tasks.
   */
  goalKey: string;

  /**
   * Previous goalKey values from before anchoring.
   * Resolver checks these as aliases during lookup.
   */
  goalKeyAliases: string[];

  /** Which Goal type this task serves */
  goalType: string;

  /** Reference to the Goal.id that spawned this task (if goal-driven) */
  goalId?: string;

  /** Anchors that lock identity once committed (see Phase B identity) */
  anchors: {
    siteSignature?: SiteSignature;
    regionHint?: { x: number; y: number; z: number; r: number };
  };

  /** Hold state (when task is paused/preempted but not abandoned) */
  hold?: {
    reason: GoalHoldReason;
    heldAt: number;
    resumeHints: string[];
    /** Hysteresis: don't re-evaluate before this time */
    nextReviewAt: number;
    /** Emergency hold: minimum metadata captured even without full checkpoint */
    holdWitness?: {
      lastStepId?: string;
      moduleCursor?: number;
      verified: boolean;  // false = safe-stop timed out, conservative rescan needed on resume
    };
  };

  /** Completion verifier reference */
  completion: {
    verifier: string;
    definitionVersion: number;
    lastVerifiedAt?: number;
    /** Number of consecutive verification passes (stability window) */
    consecutivePasses: number;
    lastResult?: {
      done: boolean;
      score?: number;
      blockers?: string[];
      evidence?: string[];
    };
  };

  /** If this task supersedes an older goal instance */
  supersedesInstanceId?: string;
}

type GoalHoldReason =
  | 'preempted'
  | 'unsafe'
  | 'materials_missing'
  | 'manual_pause'  // Hard wall: only explicit user action can resume
  | string;
```

This is additive: existing tasks without `goalBinding` continue to work unchanged.

---

## B. Goal identity rules

Identity uses two layers: an immutable instance ID for internal references, and a deterministic lookup key for dedup.

### Immutable instance ID

`goalInstanceId` is a random UUID assigned at task creation. It never changes. All internal references — parent/child links, event payloads, logs, hold witnesses — use `goalInstanceId`, not `goalKey`. This prevents stale references when the lookup key transitions.

### Lookup key (two phases)

**Phase A — pre-anchor (provisional)**: Before a build site is committed:
```
goalKey = hash(goalType + intentParams + coarseRegion)
```
where `coarseRegion` is the bot's current chunk coordinates (16-block grid). This is "sticky nearby" — two "build shelter" requests from the same area resolve to the same key.

**Phase B — anchored (stable)**: Once `siteSignature` is set (during bootstrap/prepare_site), identity locks. The composition depends on goal type:

| Goal type | Anchored goalKey |
|-----------|-----------------|
| `build_structure` (from template) | `hash(goalType + siteSignature.refCorner + siteSignature.facing + templateDigest)` |
| `build_shelter` | `hash(goalType + siteSignature.refCorner + siteSignature.facing)` — template is an attribute, not identity |

Rationale for shelter: a shelter's template may evolve (quick dirt hut → improved wood → stone). If identity includes `templateDigest`, "improve the same shelter" becomes "new shelter goal." By keying shelter identity to site only, template changes are plan revisions within the same goal instance.

**Transition rule**: Phase A → Phase B happens exactly once, atomically:
1. Compute new anchored goalKey
2. Push current goalKey to `goalKeyAliases`
3. Write new goalKey
4. These three writes must be a single store update (see atomicity below)

The old provisional key remains in `goalKeyAliases` so the resolver can still find this task if a concurrent lookup used the old key.

---

## C. Goal resolver (`resolveOrCreateBuildGoal`)

### Uniqueness invariant

**At most one non-terminal task per (goalType, goalKey).** Non-terminal = status not in {`completed`, `failed`}.

This invariant must be enforced atomically. If the task store is single-process in-memory, use a per-goalKey mutex. If the store may be accessed concurrently (goal tick + user command + reactivation event), use compare-and-swap semantics: "create task only if no non-terminal task exists with this goalKey or goalKeyAliases."

### Resolution algorithm

When intent arrives (from goal formulation, user command, or autonomous policy):

```
1. Acquire lock/lease for goalKey (or CAS guard)
2. Compute provisional goalKey from intent + context
3. Search existing tasks:
   - Exact match: goalKey OR any entry in goalKeyAliases
   - Fuzzy: same goalType + status in {pending, active, paused, pending_planning} + proximity
4. Score candidates:
   - Anchor match: exact siteSignature match → score 1.0
   - Proximity: distance to siteSignature.position → 1.0 at 0m, 0.0 at 128m (linear decay)
   - Progress: moduleCursor / totalModules (prefer continuing advanced builds)
   - Recency: lastWorkedAt within 30min → +0.1 bonus
5. If best score > 0.6 → return existing taskId ("continue")
6. If candidate is completed AND within spatial scope (see below):
   - Run completion verifier
   - If still done → return "already satisfied" (no new task)
   - If regressed → reactivate with hold.reason = 'regression_detected'
7. Else → create new task with goalBinding, optionally set supersedesInstanceId
8. Release lock
```

### Spatial scope for "already satisfied"

The verifier must be bounded to prevent false positives (e.g. "there exists a shelter 100m away" shouldn't satisfy a new "build shelter here" intent).

| Goal state | Spatial scope |
|------------|---------------|
| Provisional (no siteSignature) | 32m radius from bot position |
| Anchored | `siteSignature.footprintBounds` + 8-block margin |

A completed shelter at 80m does not satisfy a new "build shelter" request at the bot's current location. The resolver must check proximity before running the verifier.

---

## D. Activation policy

### Event-driven triggers (preferred, low-cost)

| Event | Action |
|-------|--------|
| `materials_acquired` (subtask completed) | Re-score held goals with `reason: 'materials_missing'`; reactivate if materials now sufficient |
| `dusk_approaching` (time signal) | Re-score held shelter goals; urgency spike if no verified shelter exists |
| `threat_resolved` (hostile clear) | Re-score held goals with `reason: 'unsafe'`; reactivate if area now safe |
| `world_drift_detected` (block change near site) | If completed shelter goal, run verifier; if regressed, reactivate as repair |
| `subtask_completed` (child task done) | Check parent task's blockedReason; clear block if dependency met |

These integrate with the existing `taskLifecycleEvent` emission system. A small activation reactor subscribes to lifecycle events and re-scores held goals.

### Periodic review (backstop)

Each held goal has `nextReviewAt`. On every Nth executor tick (configurable, default every 60 ticks):
- Sample held goals whose `nextReviewAt <= now`
- Run lightweight feasibility check (inventory sufficient? site reachable? daylight?)
- If feasible → reactivate (transition `paused` → `pending`)
- If not feasible → advance `nextReviewAt` by backoff interval (5min, 15min, 30min cap)

### Activation budgets (prevents storms)

Without quotas, broad events (dusk, materials acquired) can trigger bursts of reactivation + plan + fail + hold loops, especially before the action boundary is fully stable.

| Budget | Limit | Scope |
|--------|-------|-------|
| Goals reconsidered per tick | 3 | Across all held goals |
| Goals reactivated per minute | 2 | Across all goal types |
| Repeated-reason backoff | Escalating: 5min → 15min → 30min → 60min (cap) | Per goalInstanceId per hold reason |

If a goal is held for the same reason 3 times within an hour, it enters extended cooldown (60min review interval) and emits a `goal_activation_exhausted` lifecycle event for observability.

### Manual pause is a hard wall

If `hold.reason === 'manual_pause'`, the activation reactor **must not** re-score or reactivate the task. Only an explicit user action (management handler `resume` command) can transition it back.

This rule is enforced in one place: the activation reactor's eligibility check. The check is:
```
eligible = hold.reason !== 'manual_pause' && now >= hold.nextReviewAt
```

No event trigger, no periodic review, no urgency spike can override `manual_pause`.

### Hysteresis

Once a goal is held, it cannot be re-evaluated for activation until `nextReviewAt`. This prevents thrash when conditions flicker (e.g. materials consumed and re-gathered repeatedly).

---

## E. Hold protocol (preemption)

### Preemption budget

When a higher-urgency need preempts a building task, the system has a bounded window to reach a safe stop:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Max steps to attempt safe stop | 3 | Enough to finish a placement, not enough to delay the urgent need |
| Max time for safe stop | 5 seconds | Hard wall; after this, emergency hold fires |
| Minimum hold metadata | `{ lastStepId, moduleCursor, verified: false }` | Always written, even if verification didn't complete |

### Protocol

```
1. Signal preemption to executor
2. Attempt safe stop (up to 3 steps or 5 seconds):
   a. If at checkpoint boundary → run checkpoint (verified: true)
   b. If mid-module → attempt to complete current step, then capture partial state
   c. If timeout → emergency hold with verified: false
3. Write hold metadata:
   - If verified: full checkpoint data, holdWitness.verified = true
   - If not verified: holdWitness = { lastStepId, moduleCursor, verified: false }
4. Transition task: active → paused
5. Set goalBinding.hold:
   - reason: derived from preemption cause
   - heldAt: Date.now()
   - resumeHints: derived from checkpoint or holdWitness state
   - nextReviewAt: computed from reason
6. Synchronize Goal status: Goal → SUSPENDED
```

### Resume after unverified hold

When the resume algorithm (defined in `long-horizon-build.md` Stage 2) encounters `holdWitness.verified === false`:
- It must run a **conservative rescan**: full witness-based module verification, not just in-flight step reconciliation
- It must not trust the `moduleCursor` from the hold witness as "module N-1 is definitely complete"
- Instead, it should verify module N-1 completion before deciding whether to continue or repair

This is the cost of emergency holds: resume is more expensive because less state was verified at hold time.

---

## F. Completion verifier (`verify_shelter_v0`)

For building goals, "done" is a satisfaction predicate run against world state, not "all steps executed."

### Spatial bounds

All verifier checks are bounded by `siteSignature.footprintBounds` + 8-block margin. No check scans beyond this boundary. This prevents false positives from nearby structures and bounds computational cost.

### Hard requirements (binary, all must pass for `done: true`)

| Requirement | Check | Bound |
|-------------|-------|-------|
| Enclosure | At least one enclosed volume within footprint. Method: from interior probe positions (derived from module witnesses), BFS outward checking for openings. If BFS exhausts search space within footprint without finding an exit → enclosed. BFS depth capped at footprint diagonal length. | footprintBounds |
| Roof | Blocks overhead covering the enclosed area. For each interior probe, check column upward (up to 8 blocks) for first non-air block. | footprintBounds height + 8 |
| Entrance | At least one navigable opening. Check doorway volume from Access invariant (2-high column at declared entrance). | Entrance position ± 3 blocks |
| Spawn safety | Light level at interior probes ≥ 8 OR all interior probes have solid block above within 4 blocks (dark but enclosed = safe from spawns). If world API doesn't expose light level, fall back to solid-above check only. | Interior probes only |

### Soft requirements (contribute to `score`, not blockers)

| Requirement | Check | Score contribution |
|-------------|-------|--------------------|
| Bed placed | `stationRegistry` has a bed entry or bed block found at interior probes | +0.15 |
| Storage | Chest in stationRegistry or found at interior probes | +0.1 |
| Workstations | Crafting table + furnace in stationRegistry and reachable (distance ≤ 4 blocks) | +0.1 |
| Template fidelity | `completedModules.length / totalModules` | +0.15 |

### Structural existence vs. navigational reachability

**Existence checks dominate for completion.** "Does this block exist at this position?" is deterministic and cheap. "Can the bot path to this block?" is noisy (transient mobs, water, orientation-dependent).

Reachability is used only for:
- Entrance check (hard requirement): is the doorway volume passable? This is a block-type check (air), not a pathfinding check.
- Workstation reachability (soft requirement): simple distance check (≤ 4 blocks), not full pathfinding.

Full pathfinding is never used in the v0 verifier. If a future version needs it, it must be gated behind a "navigational reachability" flag that is soft-only and has its own stability window.

### Output

```typescript
{ done: boolean, score: number, blockers: string[], evidence: string[] }
```

### Completion stability

- `done` requires `completion.consecutivePasses >= 2` before the task transitions to `completed`
- On periodic review (or `world_drift_detected`), re-verify cheaply. Reset `consecutivePasses` to 0 if verification fails.
- If a previously-completed task's verification fails → transition back to `active` with `hold.reason = 'regression_detected'`, generate repair work package, reset `consecutivePasses`
- Stability window prevents transient passes (e.g. a mob temporarily clearing a doorway) from marking done prematurely

---

## G. Field ownership and normalization

The goalBinding layer adds fields that overlap with existing Task fields. Without clear ownership, you get contradictory state (`blockedReason` says one thing, `hold.reason` says another).

### Canonical mapping

| Fact | Owner | Derived field | Synchronization rule |
|------|-------|---------------|----------------------|
| "Why is this task not running?" | `goalBinding.hold.reason` (if goal-bound) or `metadata.blockedReason` (if not) | `metadata.blockedReason` mirrors hold.reason for goal-bound tasks | On hold: `blockedReason = hold.reason`. On resume: clear `blockedReason`. |
| "When can we re-check?" | `goalBinding.hold.nextReviewAt` | `metadata.nextEligibleAt` mirrors hold.nextReviewAt | On hold: `nextEligibleAt = hold.nextReviewAt`. On resume: clear both. |
| Task urgency | `Task.urgency` (written by PriorityScorer) | — | PriorityScorer reads Goal.urgency as input, writes Task.urgency as output. Only one write path. |
| Task priority | `Task.priority` (can be updated by management handler) | — | Goal.priority is strategic input to scorer. Task.priority is the runtime value. |
| "Is this paused?" | `Task.status === 'paused'` | — | goalBinding.hold exists iff status === paused. On resume: clear hold AND set status = pending. |

### Illegal state combinations (tested)

These combinations must be asserted impossible in tests:

- `status === 'paused'` AND `goalBinding.hold === undefined` (paused without hold metadata)
- `status === 'active'` AND `goalBinding.hold !== undefined` (active but claims to be held)
- `goalBinding.hold.reason === 'manual_pause'` AND `blockedReason !== 'manual_pause'` (mismatch)
- `goalBinding.completion.consecutivePasses >= 2` AND `status !== 'completed'` (done but not marked)
- `goalBinding.goalKey !== goalBinding.goalKeyAliases[last]` AND `goalBinding.goalKeyAliases.length === 0` (key transitioned but no alias recorded)

---

## Acceptance tests

### Identity

- **goalInstanceId stability**: Create goal-bound task, anchor it (Phase A → B), verify `goalInstanceId` unchanged
- **goalKey transition**: Verify old key appears in `goalKeyAliases` after anchoring
- **Resolver finds by alias**: Create task with Phase A key, transition to Phase B, look up by Phase A key → found
- **Shelter identity excludes template**: Two shelter tasks at same site with different templates → same goalKey (same goal instance)
- **Structure identity includes template**: Two structure tasks at same site with different templates → different goalKeys

### Dedup and concurrency

- **Dedup**: "build shelter" twice in same area → continues same task (same goalKey)
- **Atomic resolve**: Two simultaneous "build shelter" intents → exactly one task created (test with concurrent calls)
- **Uniqueness invariant**: After resolution, assert at most one non-terminal task per (goalType, goalKey)

### Already satisfied

- **Spatial scope**: Completed shelter at 80m + new "build shelter" at bot position → new task (not "already satisfied")
- **In-scope satisfaction**: Completed shelter at 10m + new "build shelter" near it → verifier passes → no new task
- **Regression detection**: Completed shelter + creeper damage + "build shelter" → verifier fails → reactivates existing

### Activation

- **Event trigger**: Hold for materials → subtask completes → reactivated within next tick
- **Manual pause wall**: Hold with `manual_pause` → dusk event fires → task stays paused
- **Budget enforcement**: 5 held goals + broad event → at most 3 reconsidered, at most 2 reactivated
- **Repeated-reason escalation**: Hold for `unsafe` 3 times in 1 hour → nextReviewAt escalates to 60min
- **Periodic backstop**: Hold without events → nextReviewAt arrives → lightweight check runs → reactivated if feasible

### Hold protocol

- **Safe stop**: Preempt between modules → full checkpoint captured, holdWitness.verified = true
- **Emergency hold**: Preempt mid-module, safe stop times out → holdWitness.verified = false, minimum metadata written
- **Resume after unverified hold**: Conservative rescan runs, module N-1 re-verified before continuing
- **Preemption budget**: Safe stop completes within 3 steps / 5 seconds

### Completion

- **Stability window**: Shelter passes verification once → not yet completed. Passes again → completed.
- **Regression re-opens**: Completed shelter → damage → verification fails → status back to active, consecutivePasses reset
- **Verifier bounds**: Verifier checks only within footprintBounds + 8 margin (no scanning beyond)

### State consistency

- All illegal state combinations from §G produce assertion failures
- Task pause/resume cycles maintain field synchronization (blockedReason, nextEligibleAt, hold)
- Goal status tracks Task status per synchronization reducer table

---

## Failure-mode cards

| Failure | Cause | Mitigation |
|---------|-------|------------|
| Goal duplication | Repeated intent spawns parallel tasks | Atomic `resolveOrCreateBuildGoal` with per-goalKey lock + uniqueness invariant |
| Stale goalKey references | Phase A → B transition invalidates cached keys | `goalInstanceId` (immutable) for all internal refs; `goalKeyAliases` for resolver lookup |
| Zombie goal | Held goal never reactivates because no event fires | Periodic review backstop with `nextReviewAt`; backoff cap (60min max) prevents indefinite sleep |
| Done thrash | Completion flickers between pass/fail on transient conditions | Stability window (2 consecutive passes); verifier uses existence checks over reachability |
| False continuation | New intent incorrectly matched to distant existing goal | Proximity scoring with 128m decay; spatial scope rules for "already satisfied" |
| Regression blindness | Completed shelter damaged but no re-check triggered | `world_drift_detected` event + periodic re-verification of completed goals near bot |
| Disobedient resume | System overrides user's explicit pause | `manual_pause` hard wall: activation reactor eligibility check excludes it unconditionally |
| Activation storm | Broad event reactivates many goals simultaneously | Per-tick (3) and per-minute (2) activation budgets; repeated-reason escalation |
| Contradictory state | blockedReason says X, hold.reason says Y | Field ownership contract + illegal state combination tests |
| Emergency hold data loss | Preemption times out, partial state unverified | holdWitness with `verified: false`; resume forces conservative rescan |
| Status divergence | Goal says ACTIVE, Task says paused | Synchronization reducer: Task transitions always update Goal status; GoalManager reads, doesn't compete |
| Verifier explosion | BFS/scan runs unbounded | All checks bounded by footprintBounds + 8; BFS depth capped at footprint diagonal |

---

## File map

### New files

| File | Purpose |
|------|---------|
| `packages/planning/src/building/goal-resolver.ts` | `resolveOrCreateBuildGoal()`, goalKey computation (phase A/B), candidate scoring, atomic lock |
| `packages/planning/src/building/activation-reactor.ts` | Event-driven reactivation + periodic review + budget enforcement + manual_pause wall |
| `packages/planning/src/building/shelter-verifier.ts` | `verify_shelter_v0()`, hard/soft requirement checks, footprint-bounded, existence-first |
| `packages/planning/src/building/goal-task-sync.ts` | Task → Goal synchronization reducer, illegal state assertions |

### Modified files

| File | Changes |
|------|---------|
| `packages/planning/src/types/task.ts` | Add `metadata.goalBinding` namespace (GoalBinding, GoalHoldReason types) |
| `packages/planning/src/task-integration.ts` | Goal resolver integration in `addTask()` for goal-bound tasks, hold protocol in status transitions, field synchronization on pause/resume |
| `packages/planning/src/goal-formulation/goal-manager.ts` | Emit goalId when spawning tasks, read Task status via binding instead of maintaining competing state |
