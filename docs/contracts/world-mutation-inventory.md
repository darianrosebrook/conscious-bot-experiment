# World Mutation Call-Site Inventory — 2026-02-08

## Purpose

Complete inventory of every code path that can mutate the Minecraft world. Used to enforce **Invariant E0**: every world-mutating action must flow through a single bottleneck with guards, arbitration, normalization, and audit.

---

## ActionTranslator Construction Sites

| # | File | Line | Instance | Used By |
|---|------|------|----------|---------|
| 1 | `minecraft-interface/src/server.ts` | 1900 | Global cached on `(global)._cachedActionTranslator` | `/action` endpoint (all HTTP callers) |
| 2 | `minecraft-interface/src/plan-executor.ts` | 121 | `this.actionTranslator` on PlanExecutor | SafetyMonitor (via `botAdapter.initializeSafetyMonitor()`) |
| 3 | `minecraft-interface/src/standalone.ts` | 39 | `this.actionTranslator` | Standalone testing interface (non-prod) |
| 4 | `minecraft-interface/src/__tests__/action-dispatch-contract.test.ts` | 148 | Test-only | Test harness |

**Production instances: 2** (#1 and #2). This is the dual-instance risk.

---

## Direct `/action` HTTP Callers (bypass planning guards)

| # | File | Line | Origin | Goes Through Guards? |
|---|------|------|--------|---------------------|
| 1 | `planning/src/modular-server.ts` | 581 | `executeActionWithBotCheck()` → `mcPostJson('/action')` | **YES** — geofence, rate limit, threat holds, shadow mode |
| 2 | `cognition/src/intrusive-thought-processor.ts` | 1327 | ~~`fetch(minecraftEndpoint/action)`~~ → `fetch(planningEndpoint/task)` | **YES** — routed through planning service |
| 3 | `planning/src/reactive-executor/minecraft-executor.ts` | 338 | `fetch(minecraftInterfaceUrl/action)` | **NO** |
| 4 | `planning/src/reactive-executor/reactive-executor.ts` | 1085 | `fetch(minecraftUrl/action)` — craftTask | **NO** |
| 5 | `planning/src/reactive-executor/reactive-executor.ts` | 1111 | `fetch(minecraftUrl/action)` — moveTask | **NO** |
| 6 | `planning/src/reactive-executor/reactive-executor.ts` | 1140 | `fetch(minecraftUrl/action)` — gatherTask | **NO** |
| 7 | `planning/src/reactive-executor/reactive-executor.ts` | 1169 | `fetch(minecraftUrl/action)` — exploreTask | **NO** |
| 8 | `planning/src/reactive-executor/reactive-executor.ts` | 1201 | `fetch(minecraftUrl/action)` — genericAction | **NO** |
| 9 | `planning/src/reactive-executor/reactive-executor.ts` | 1532 | `fetch(minecraftUrl/action)` — fallback | **NO** |
| 10 | `memory/src/server.ts` | 361 | `/action` route (memory service) | N/A — separate service, receives actions |

**Unguarded callers: 8** (#2–#9). Only the autonomous executor path (#1) applies guards.

---

## Direct ActionTranslator.executeAction() Callers (bypass `/action` endpoint entirely)

| # | File | Line | Context |
|---|------|------|---------|
| 1 | `minecraft-interface/src/server.ts` | 1963 | `/action` endpoint handler (canonical) |
| 2 | `minecraft-interface/src/automatic-safety-monitor.ts` | 354, 364, 389 | Safety flee/shelter (uses PlanExecutor's instance) |
| 3 | `minecraft-interface/src/action-executor.ts` | 64 | Dead code — never instantiated in prod |
| 4 | `minecraft-interface/src/standalone-simple.ts` | 727+ | Non-prod standalone interface |

**Production bypass: 1** (#2 — safety monitor). Uses a different ActionTranslator instance than `/action`.

---

## Legacy/Dead Execution Paths

| # | Path | File | Line | Status |
|---|------|------|------|--------|
| 1 | `executeTask()` — deprecated stub | `planning/src/modules/mc-client.ts` | 327 | **RETIRED** — returns error immediately, no network call |
| 2 | `/execute-scenario` — returns 410 Gone | `minecraft-interface/src/server.ts` | 2155 | **RETIRED** — clean 410 stub, no error logging |
| 3 | `autonomousTaskExecutor` fallback → `executeTask()` | `planning/src/modular-server.ts` | — | **RETIRED** — falls through to leaf mapping |
| 4 | `ActionExecutor.executeActionPlan()` | `minecraft-interface/src/action-executor.ts` | 46 | **DEAD** — exported but never instantiated |
| 5 | `runMinecraftScenario()` | `minecraft-interface/src/index.ts` | 171 | **DEAD** — uses stub coordinator |

**Impact of dead paths:** #1→#2→#3 chain has been retired (endpoint returns 410, stub returns error immediately). No error logging. #4 and #5 are inert.

---

## Direct bot.* Mutation Calls

All legitimate `bot.dig`, `bot.placeBlock`, `bot.craft`, `bot.equip`, `bot.consume`, `bot.toss`, `bot.activateItem`, `bot.pathfinder.*` calls are inside:

| Location | Role | Acceptable? |
|----------|------|-------------|
| `minecraft-interface/src/action-translator.ts` | ActionTranslator methods | **YES** — canonical mutation point |
| `minecraft-interface/src/navigation-bridge.ts` | NavigationBridge (owned by ActionTranslator) | **YES** — pathfinder operations |
| `minecraft-interface/src/leaves/*.ts` | Leaf implementations (farming, movement, interaction, crafting, combat, container) | **YES** — called via LeafFactory from ActionTranslator |
| `minecraft-interface/src/standalone-simple.ts` | Standalone non-prod interface | **OK** — explicitly non-production |
| `core/src/leaves/*.ts` | Core leaf implementations (movement, interaction, crafting) | **RISK** — parallel implementations, could shadow MC interface leaves |
| `core/src/debug-demo.ts` | Demo script | **OK** — non-production |
| `core/src/fix-action-aborts.ts` | Fix script | **OK** — non-production |

**Risk: `core/src/leaves/`** contains parallel leaf implementations that could be accidentally imported instead of `minecraft-interface/src/leaves/`. The MC interface versions are registered at runtime and take precedence, but the `core` versions exist and compile.

---

## Summary: What Needs to Change

### Dual ActionTranslator (HIGH)
- 2 production instances (server.ts global + plan-executor.ts)
- Both own NavigationBridge → pathfinder contention
- **Fix:** Singleton + navigation lease

### Unguarded /action Callers (HIGH)
- 8 callers bypass all planning guards
- Intrusive thought processor, reactive executor, minecraft executor
- **Fix:** Route through ExecutionGateway or disable under executor

### Dead Paths (MEDIUM)
- `executeTask()` → `/execute-scenario` chain: always fails, produces 7 errors/run
- **Fix:** Remove call edge, retire endpoint

### Core Leaf Duplication (LOW)
- `core/src/leaves/` has parallel implementations
- MC interface versions take precedence at runtime
- **Fix:** Remove or mark abstract
