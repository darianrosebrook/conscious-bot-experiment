# run.log Audit — 2026-02-02

## Run Parameters

| Parameter | Log | Lines |
|-----------|-----|-------|
| Pre-fix | `run.log` | 1620 |
| Post-fix | `post-fix-run.log` | 1046 |

---

## Deliverable A: Hotspot Map

### Pre-fix (`run.log`)

| # | Severity | Component | Count | Signature | Impact |
|---|----------|-----------|-------|-----------|--------|
| 1 | INFO | Dashboard | 26 | `POST /api/ws/cognitive-stream received: {` | Noise — full object dumps on every thought |
| 2 | INFO | Dashboard | 19 | `New thought added to history: {` | Noise — same object dump, different path |
| 3 | INFO | MC Interface | 21 | `Broadcasting position_changed to 0 clients` | Silent drop — broadcasting to no one |
| 4 | INFO | MC Interface | 12 | `Broadcasting health_changed to 0 clients` | Silent drop — broadcasting to no one |
| 5 | INFO | Cognition | 24 | `Processing environmental_awareness request` | Cadence — 24 in ~10 min = ~1 per 25s (expected) |
| 6 | INFO | SafetyMonitor | 5+4 | `Fleeing from threats` / `Emergency response triggered: hostile_nearby` | Safety loop active — zombie within 1 block |
| 7 | INFO | SafetyMonitor | 4 | `Emergency response triggered: critical_threat` (low_health 87.5) | Threat level critical due to health at 20/20 but threatLevel=87.5 |
| 8 | INFO | MC Interface | 4 | `Water environment analysis` | Repeated 4x — noise for a bot not in water |
| 9 | WARN | MC Interface | 1 | `Broadcasting warning to 0 clients` | Single warning broadcast, dropped |
| 10 | ERROR | MC Interface | 1 | `Exited with code 1` | Process crash at end of run |

### Post-fix (`post-fix-run.log`)

| # | Severity | Component | Count | Signature | Impact |
|---|----------|-----------|-------|-----------|--------|
| 1 | **ERROR** | MC Interface | **7** | `Planning cycle error: No plan available for execution` | **Dominant error** — legacy PlanExecutor loop |
| 2 | INFO | MC Interface | 25 | `No world state available for HUD update` | Early startup — world not loaded yet |
| 3 | INFO | ThreatPerception | 62 | `localized threat assessment: 0 threats, level: low` | Cadence — 62 in ~15 min = ~1 per 15s |
| 4 | INFO | Planning | 38+30 | `WorldStateManager poll result` / `no meaningful change` | Cadence — world state polling every ~25s |
| 5 | INFO | MC Interface | 7 | `Starting autonomous planning cycle...` / `Planning cycle ended` | Matches the 7 errors above |
| 6 | INFO | Dashboard | 11 | `POST /api/ws/cognitive-stream received` | Reduced from 26 (pre-fix) — fewer thought broadcasts |
| 7 | INFO | ThreatPerception | 7 | `suppressed 3 LOS logs in last 5000ms (creeper:3)` | Log-of-suppression itself is noise when repeated |
| 8 | INFO | Sterling | 2 | `connection open` | Normal WS connection events |
| 9 | INFO | Cognition | 7 | `Enhanced thought generator has 0 recent thoughts` | Idle — no LLM-generated thoughts |

---

## Deliverable B: Gap Candidates

### Gap 1: Legacy PlanExecutor loop producing 7 errors per run

**Symptom:** `Planning cycle error: No plan available for execution` x7 in post-fix log
**Locus:** `packages/minecraft-interface/src/plan-executor.ts:220` + timer in `server.ts`
**Impact class:** Noise / log pollution — the error is caught and returns gracefully, but it's printed with `console.error` and a full stack trace on every cycle.

| Check | Status |
|-------|--------|
| Unit/integration test that fails if this recurs? | NO — no test asserts on planning cycle error handling |
| Invariant / guardrail? | PARTIAL — returns gracefully but logs at ERROR level |
| Observability hook? | NO — no counter, no structured event |

**Fix options (pick one):**
1. **Disable the legacy planning cycle timer** — if all planning now goes through the planning-service executor, the MC interface timer should be disabled. Add env guard `ENABLE_LEGACY_PLANNING !== '1'`.
2. **Downgrade to debug/info** — if the timer must stay, change `console.error('Planning cycle error:')` to `console.debug()` when the error is "No plan available" (expected idle state).
3. **Suppress when `isLegacyRetired`** — the code already checks `isLegacyRetired` but still throws before reaching the graceful path.

**Recommended:** Option 1. The legacy planner is retired. Kill the timer.

---

### Gap 2: Broadcasting to 0 clients (21+12 = 33 lines pre-fix)

**Symptom:** `Broadcasting position_changed to 0 clients` x21, `Broadcasting health_changed to 0 clients` x12
**Locus:** MC Interface WebSocket broadcast logic
**Impact class:** Silent drop — data is computed but sent to nobody

| Check | Status |
|-------|--------|
| Unit/integration test? | NO |
| Invariant / guardrail? | NO — broadcasts regardless of client count |
| Observability? | Has count in message, but no structured counter |

**Fix:** Gate broadcasts behind `if (clients.size > 0)`. This is pure waste reduction — no semantic change.

---

### Gap 3: `No world state available for HUD update` x25 (post-fix)

**Symptom:** Repeated 25 times during startup before world state is loaded
**Locus:** MC Interface HUD update timer
**Impact class:** Noise — startup-only, stops once world loads

| Check | Status |
|-------|--------|
| Unit/integration test? | NO |
| Invariant / guardrail? | NO — timer runs unconditionally |
| Observability? | Message itself is the only indicator |

**Fix:** Either delay the HUD timer until world state is available, or downgrade to `console.debug()` after the first occurrence.

---

### Gap 4: ThreatPerception log suppression logging is itself noisy

**Symptom:** `suppressed 3 LOS logs in last 5000ms (creeper:3)` x7
**Locus:** `packages/minecraft-interface/src/...` threat perception module
**Impact class:** Meta-noise — the suppression message defeats its own purpose when repeated

| Check | Status |
|-------|--------|
| Test? | NO |
| Invariant? | Not needed |
| Observability? | The message IS the observability, but it's too frequent |

**Fix:** Rate-limit the suppression message itself (log at most once per 30s).

---

### Gap 5: `Successfully sent message to 0 connections` x8-9 (both logs)

**Symptom:** Dashboard/cognitive-stream WS broadcasting to 0 connections
**Locus:** Cognitive stream broadcast in dashboard API
**Impact class:** Same as Gap 2 — waste + noise

**Fix:** Same pattern — gate behind `connections.size > 0`.

---

### ~~Gap 6: Critical threat level from low_health when health=20~~ — FALSE ALARM

**Symptom:** `threatLevel: 'critical'`, `threats: [{ type: 'low_health', distance: 0, threatLevel: 87.5 }]`
**Investigation result:** NOT a bug. The `health: 20` in the log refers to the *max health* field, not current health. The bot was fighting a zombie at close range (pre-fix log shows `hostile_nearby` at distance 0.78). The threat manager correctly triggers `low_health` only at `botHealth <= 6` (30%), and computes `threatLevel = (20 - botHealth) / 20 * 100`. A `threatLevel: 87.5` corresponds to `botHealth = 2.5` (12.5% health) — the bot was nearly dead.

No fix needed.

---

### Gap 7: Object dumps in logs (JSON pretty-print)

**Symptom:** 200+ lines of raw `console.log(object)` fragments across both logs — closing braces, field values, ANSI color codes
**Locus:** Dashboard, Cognition, WorldStateManager — everywhere that does `console.log('prefix', object)`
**Impact class:** Noise — makes audit harder, inflates log volume

**Fix:** Migrate high-frequency log sites to `console.log('prefix', JSON.stringify(object))` one-liner, or structured logging with a logger that controls verbosity.

---

## Before/After Comparison

| Metric | Pre-fix | Post-fix | Delta |
|--------|---------|----------|-------|
| Total lines | 1620 | 1046 | -35% |
| ERROR lines | 1 | 7 | +6 (legacy planner noise) |
| WARN lines | 1 | 7 | +6 (stack traces from legacy planner) |
| Unique clusters | 836 | 314 | -62% |
| Dominant error | Process exit code 1 | Legacy planner "no plan" | Changed character |
| Broadcast-to-0 | 33 | 9 | -73% |
| Safety false alarm | 4 (critical_threat at health=20) | 0 | Fixed or not triggered |

---

## Priority Backlog

| Priority | Gap | Fix | Test | Invariant |
|----------|-----|-----|------|-----------|
| P0 | #1 Legacy planner error loop | Disable timer or env-gate | Assert no ERROR lines from planExecutor in soak | Timer disabled when `ENABLE_LEGACY_PLANNING !== '1'` |
| ~~P1~~ | ~~#6 Health=20 flagged as critical~~ | False alarm — bot was at 2.5 health, not 20 | N/A | N/A |
| P2 | #2 Broadcast to 0 clients | Gate behind `clients.size > 0` | N/A (waste reduction) | N/A |
| P2 | #3 HUD update before world ready | Delay timer or downgrade log | N/A | N/A |
| P3 | #4 Suppression meta-noise | Rate-limit suppression message | N/A | N/A |
| P3 | #5 WS broadcast to 0 connections | Gate behind `connections.size > 0` | N/A | N/A |
| P3 | #7 Object dumps | Structured logging migration | N/A | N/A |
