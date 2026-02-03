# Agency Pipeline Regression Contract

Covers the control plane, data plane, and acceptance criteria for the agency
emission subsystem (drive tick, recording fix, INTENT extraction,
thought-to-task converter).

Last updated: 2026-02-02

---

## 1. Metadata Control Plane

### 1.1 Projection Allowlist

`addTask()` rebuilds metadata from scratch. Only keys listed in
`PROPAGATED_META_KEYS` survive from the caller's `taskData.metadata`.
Everything else is silently dropped.

**Invariant**: Adding a new pipeline-critical metadata key requires adding it
to `PROPAGATED_META_KEYS` in `task-integration.ts`. The `satisfies readonly
(keyof Task['metadata'])[]` constraint fails at compile time if the key doesn't
exist on the type.

**Dev observability**: In `NODE_ENV !== 'production'`,
`projectIncomingMetadata()` warns once per key per session when an incoming key
is not in the allowlist and not in the rebuilt-keys set. This is the primary
early-warning for allowlist drift.

**Rebuilt keys** (set by `addTask()` directly, not via projection):
`createdAt`, `updatedAt`, `retryCount`, `maxRetries`, `childTaskIds`, `tags`,
`category`, `solver`.

### 1.2 Origin Envelope

`origin` is stamped by `finalizeNewTask()` after `addTask()` stores the task.
It is immutable after creation.

**Invariant**: `updateTaskMetadata()` must never overwrite `origin`. The
existing code explicitly deletes `origin` from incoming patches before applying.

**Invariant**: When `PLANNING_STRICT_FINALIZE=1`, any new task stored without
`origin` and without `{ allowUnfinalized: true }` emits a console warning from
`TaskStore.setTask()`.

### 1.3 goalKey

`goalKey` is the canonical idempotency key for drive-tick-to-task matching.
Format: `action:target` (lowercase, underscored).

**Invariant**: No stored task may have `goalKey === ''` (empty string). If
`canonicalGoalKey()` returns empty, treat as absent (undefined). This is
enforced at three layers:

1. Converter callsite: `canonicalGoalKey(...) || undefined`
   (`thought-to-task-converter.ts`)
2. Converter thought path: `thought.metadata?.goalKey || undefined`
3. Projection boundary: `projectIncomingMetadata()` coerces `'' → skip`

**Test**: `addTask drops empty-string goalKey (never reaches task.metadata)` in
`task-integration-pipeline.test.ts`.

---

## 2. Sanitizer Guarantees

### 2.1 Goal Tag Extraction

Parser is bounded-scan (no regex backtracking). Max 100-char inner scan.
Fail-closed: unknown actions produce `goal: null` with `failReason` for
debugging.

**Invariant**: `CANONICAL_ACTIONS` allowlist is the single source of truth.
Adding a new action requires updating the set. `ACTION_NORMALIZE_MAP` maps
synonyms to canonical actions. Both are versioned via `NORMALIZE_MAP_VERSION`.

**Invariant**: `extractGoalTag()` never mutates the input text except to strip
the matched tag.

### 2.2 INTENT Extraction

Two-pass parser:

1. **Final line** (compliant): `INTENT: <label>` as the last non-empty line.
   Stripped from output. `intentParse: 'final_line'`.
2. **Inline** (non-compliant): `INTENT: <word>` appearing mid-text. Stripped
   from output to prevent leakage into titles/goalKeys.
   `intentParse: 'inline_noncompliant'`.

**Invariant**: `stripInlineIntent()` preserves newlines. Uses `[^\S\n]`
(horizontal whitespace only) for surrounding match. Never collapses `\n`.
This is **Contract B** (line structure preserved) — the sanitizer does not
normalize multi-line thoughts to single-line.

**Invariant**: Unknown intent labels are stripped from text but produce
`intent: null`. The INTENT line/token is always removed regardless of label
validity.

**Valid labels**: `none`, `explore`, `gather`, `craft`, `shelter`, `food`,
`mine`, `navigate`.

### 2.3 IntentParse Semantics

The `intentParse` field classifies how the INTENT was extracted. Its purpose is
**measurement and hygiene**, not feature gating:

| Value | Meaning | Expected at scale |
|-------|---------|-------------------|
| `'final_line'` | Compliant format. Model emitted `INTENT:` as the final line. | This is the only path you should expect from a well-tuned model. |
| `'inline_noncompliant'` | LLM format violation. Model embedded `INTENT:` mid-sentence. Stripped for hygiene. | Hygiene strip + compliance counter. Not a feature. Do not build downstream logic on this path. |
| `null` | No INTENT token found. | Normal. Does not degrade behavior. Small models rarely emit INTENT. |

Phase 4 intent-to-task fallback, if built, should be justified by *measured
scarcity of goal tags* (counter ratio `goalTags / llmCalls`), not by the
presence of intent labels.

### 2.4 Pipeline Order

```
stripCodeFences -> stripWrappingQuotes -> stripSystemPromptLeaks
  -> extractGoalTag -> extractIntent -> truncateDegeneration
  -> stripTrailingGarbage -> normalizeWhitespace
```

Goal extraction before INTENT extraction. Both before degeneration detection
and whitespace normalization.

---

## 3. Drive Tick Contract

### 3.1 Safety Gates

All gates must pass for a drive tick to fire:

- `health >= 16`
- `food >= 16`
- `hostiles === 0`
- `gameMode !== 'creative' && gameMode !== 'spectator'`
- Timer elapsed: `Date.now() - _lastDriveTickMs >= DRIVE_TICK_INTERVAL_MS`
  (180s fixed, no jitter in v1)

**Invariant**: Drive tick NEVER fires in creative or spectator mode.

**Invariant**: Drive tick NEVER fires when health < 16, food < 16, or
hostiles > 0.

### 3.2 Idempotency

Before emitting a goal, drive tick checks for existing pending/active tasks
with a matching `goalKey`.

**Invariant**: A drive tick is suppressed if a task with the same
`(action, target)` is pending or active AND (has been pending < 5 minutes OR
has non-zero progress).

**Stuck-timeout**: Tasks pending > 5 minutes with 0 progress are treated as
blocked and do not suppress new drive ticks.

### 3.3 Drive Selection Priority

1. Empty inventory / no logs -> `collect oak_log 8`
2. Night approaching + no shelter -> `build basic_shelter 1`
3. Has logs, no crafting table -> `craft crafting_table 1`
4. Has crafting table, no pickaxe -> `craft wooden_pickaxe 1`
5. Low log stock (< 16) -> `collect oak_log 8`
6. Default -> `explore nearby 1`

### 3.4 Output Shape

Drive tick thoughts have:

- `cognitiveSystem: 'drive-tick'`
- `metadata.extractedGoalSource: 'drive-tick'`
- `metadata.extractedGoal`: populated via `buildGoalTagV1()`
- `novelty: 'high'`, `convertEligible: true`
- `tags: ['drive-tick', 'autonomous', <category>]`

---

## 4. Recording Fix Contract

### 4.1 Content Dedup Behavior

When content dedup fires (similar thought detected):

- Thought is tagged `novelty: 'low'`, `convertEligible: false`
- Thought is recorded to local `thoughtHistory` (never discarded)
- Task-worthy low-novelty thoughts (have extractedGoal) are always broadcast
- Non-task-worthy low-novelty thoughts broadcast at 1-per-5 rate (counter-based)
- Broadcast copies have `metadata.fallback: true` for downstream filtering

**Invariant**: `convertEligible: false` thoughts are never converted to tasks
by the converter.

### 4.2 Novelty Markers

- `'high'`: Fresh LLM call or drive tick
- `'medium'`: Heartbeat-escape LLM call
- `'low'`: Content dedup fallback or situation-signature dedup fallback

### 4.3 convertEligible

Set to `true` only when:

- Drive tick emitted the thought
- LLM output produced `extractedGoal`
- `extractedIntent` is present and non-`'none'`

All other thoughts default to `false` or `undefined`.

---

## 5. Agency Counters

Fields tracked in `EnhancedThoughtGenerator._counters`:

| Counter | Incremented when | Log label |
|---------|------------------|-----------|
| `llmCalls` | LLM `generateInternalThought()` is called | `llm=` |
| `goalTags` | `extractedGoal` present on LLM response | `goals=` |
| `driveTicks` | Drive tick fires | `drives=` |
| `signatureSuppressions` | Situation-signature dedup fires (same banded state) | `sigDedup=` |
| `contentSuppressions` | Content dedup fires (similar thought detected) | `contentDedup=` |
| `intentExtractions` | `extractedIntent` non-null and non-`'none'` | `intents=` |
| `lowNoveltyRecorded` | Low-novelty thought pushed to local history | (not logged) |
| `lowNoveltyBroadcast` | Low-novelty thought emitted to stream | (not logged) |
| `startedAtMs` | Session start timestamp (reset on `resetAgencyCounters()`) | uptime calc |

Logged every 60 seconds by the cognition server periodic loop:
```
[Agency {uptimeMin}m] llm=N goals=N drives=N sigDedup=N contentDedup=N intents=N
```

**Invariant**: Counters are monotonically increasing within a session.
`resetAgencyCounters()` is the only way to reset them.

---

## 6. Security Surfaces

### 6.1 Dev-Only convertEligible Injection

`POST /thoughts` with `convertEligible` in request body is honored only when
`NODE_ENV !== 'production'` (`server.ts:1788`). This allows live testing of
strict-mode gating without modifying the thought generator.

**Invariant**: In production, `convertEligible` in the request body is ignored.

**Deployment policy**: Staging environments that share data or are externally
accessible must run with `NODE_ENV=production` to disable this bypass. If an
alternative is needed, gate on an explicit env flag
(`ALLOW_DEV_THOUGHT_INJECTION=1`) instead of `NODE_ENV` — but the current
`NODE_ENV` gate is acceptable as long as staging follows production config.

**Scope**: This bypass only affects `convertEligible`. No other thought fields
(`goalKey`, `extractedGoal`, `novelty`) are injectable via this path.

### 6.2 INTENT Parsing

INTENT labels are validated against a fixed allowlist (`VALID_INTENTS`).
Unknown labels produce `intent: null`. The INTENT token is always stripped from
output text, preventing injection of arbitrary labels into downstream display
or goalKey computation.

**Invariant**: The INTENT parser never promotes an unknown label to a non-null
intent. Fail-closed.

**Invariant**: `intentParse: 'inline_noncompliant'` is a compliance
measurement, not a feature flag. Do not build downstream behavior branching
on this value. It exists so you can measure model format compliance over time
and decide whether prompt tuning is needed.

### 6.3 Dropped Metadata Key Warning

In dev mode, `projectIncomingMetadata()` warns when incoming metadata keys are
dropped. This prevents accidental data loss when new pipelines add metadata
fields but forget to update the allowlist.

Rate-limited: one warning per key per session (via `_warnedDroppedKeys` set).

---

## 7. Soak Test

### 7.1 Setup

- All services running (`scripts/start.js`)
- Bot connected to Minecraft server in survival mode
- Stable environment: health 20, food 20, no hostiles
- Duration: 10-15 minutes

Run: `./scripts/soak-test-agency.sh 12`

Results: `docs/testing/soak-results/soak-<timestamp>.log`

### 7.2 Acceptance Criteria

A successful soak must demonstrate:

1. **Task creation cadence**: Drive ticks produce tasks at ~3 min intervals.
   `counters.driveTicks > 0` and `counters.goalTags > 0`.

2. **Executor claims**: At least one drive-tick task transitions from `pending`
   to `active`. If no executor claim signal exists, verify at minimum that
   tasks don't all remain in `pending` indefinitely.

3. **Progress closure**: At least one task reaches `completed` or `failed`
   (not stuck in pending forever).

4. **Idempotency under repetition**: No duplicate tasks for the same `goalKey`
   while one is active/pending with progress.

5. **Stuck-timeout recovery**: If a task stalls (0 progress > 5 min), the next
   drive tick creates a new task for the same goal.

6. **Compliance signal**: `intentExtractions > 0` or explicit observation that
   model does not emit INTENT (expected for small models like gemma3n:e2b).

7. **No low-novelty task creation**: Zero tasks with `convertEligible: false`
   in the task store.

8. **Creative/spectator safety**: If tested in creative mode,
   `counters.driveTicks === 0`.

### 7.3 Stall Taxonomy

When tasks don't reach terminal states, classify by root cause:

| Stall class | Diagnosis | Resolution |
|-------------|-----------|------------|
| `unplannable` | Task type has no plan route (no Sterling backend or no requirement) | Add plan route or mark task type as self-executing |
| `blocked_reason` | `blockedReason` present + `blockedAt` stamped | Check Rig G gate, prerequisite injection |
| `executor_unavailable` | No executor registered or executor not polling | Verify executor startup, check service connectivity |
| `goalKey_missing` | Task created without `goalKey` → dedup fails, executor can't match | Fix converter/drive-tick to always set goalKey |
| `convertEligible_gate` | `convertEligible: false` thought incorrectly blocked | Check novelty tagging, ensure drive-tick sets `convertEligible: true` |
| `stuck_pending` | Task has 0 progress after 5+ minutes, no blockedReason | Bug: executor sees task but doesn't claim. Add executor claim logging. |

---

## 8. Test Commands

```bash
# Unit tests
npx vitest run packages/cognition/src/__tests__/
npx vitest run packages/planning/src/task-integration/

# Specific test files
npx vitest run packages/cognition/src/__tests__/drive-tick.test.ts
npx vitest run packages/cognition/src/__tests__/intent-extraction.test.ts
npx vitest run packages/cognition/src/__tests__/llm-output-sanitizer.test.ts

# Typecheck
npx tsc --noEmit -p packages/cognition/tsconfig.json
npx tsc --noEmit -p packages/planning/tsconfig.json

# Soak test (requires live environment)
./scripts/soak-test-agency.sh 12
```
