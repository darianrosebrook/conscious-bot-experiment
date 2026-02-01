# @conscious-bot/planning

Planning and goal management system for Conscious Bot.

## Overview

This package provides Sterling solver integration (crafting, building, tool progression), deterministic fallback planning for collect/mine, MCP integration, and task/goal management. Legacy planners (HRM, GOAP planTo, HTN, IntegratedPlanningCoordinator) are retired. Sterling solvers plus the deterministic compiler are canonical.

## Architecture

- **Sterling solvers**: craft (Rig A), tool_progression (Rig B), build (Rig G) via `routeActionPlan()` in `modules/action-plan-backend.ts`
- **Deterministic compiler**: collect and mine requirements lowered to `dig_block` steps via `requirementToFallbackPlan()` in `modules/leaf-arg-contracts.ts`
- **Cognitive task routing**: retained from hierarchical-planner via `CognitiveTaskRouter`

## Server

- Entry: `src/modular-server.ts`
- Default port: `3002`
- Embedded MCP endpoints mounted at: `http://localhost:3002/mcp`

### Endpoints

- `GET /health` — service health and memory usage
- `GET/POST /system/ready` — startup readiness barrier
- `GET /planner` — summary of current plan, action queue, and activity flags
- `GET /state` — structured goals/tasks state for dashboards
- `POST /goal` — add a goal with tasks
- `POST /goal/:id/cancel` — cancel a goal
- `POST /task` — add a new task `{ title, description, type, ... }`
- `GET /tasks` — list current and completed tasks
- `POST /execute` — execute a goal or task `{ type: 'goal'|'task', id }`
- `POST /execute-plan` — execute a concrete plan or a task-derived plan
- `POST /autonomous` — trigger autonomous task discovery and execution
- `POST /update-bot-instance` — update bot instance in planning server
- `GET/POST /mcp/*` — MCP operations (list/register/promote/run options)
- `POST /executor/stop` — emergency stop (halts executor loop + aborts in-flight HTTP; optional `EXECUTOR_EMERGENCY_TOKEN` auth)

### Autonomous Executor

The autonomous executor polls every ~10s (`EXECUTOR_POLL_MS`) and drives task execution through the guard pipeline. It is **disabled by default** and gated behind multiple safety layers.

#### Startup gating

The executor does not start unless all three conditions are met simultaneously:

1. `ENABLE_PLANNING_EXECUTOR=1` environment variable is set
2. The planning system reports ready (`isSystemReady()`)
3. The `ReadinessMonitor` confirms required services are reachable (`executorReady`)

If conditions aren't met at startup, the executor defers and starts automatically when readiness changes (via `ReadinessMonitor.onChange` callback). The startup check is atomic — a centralized `tryStartExecutor()` prevents double-start.

#### Execution readiness gate

The `ReadinessMonitor` (in `src/server/execution-readiness.ts`) probes service health at startup and re-probes every 2 minutes:

- **minecraft** — required for executor enablement
- **memory**, **cognition**, **dashboard** — probed for observability; not required

Each service has a tri-state: `up` (2xx), `unhealthy` (non-2xx), `down` (network error). Only state transitions are logged (e.g., `[readiness] minecraft: down → up`), keeping steady-state silent.

#### Guard pipeline

Every step passes through the guard pipeline in this exact order:

| # | Guard | Behavior |
|---|-------|----------|
| 0 | **Geofence** | Fail-closed: blocks if position unknown OR outside fence |
| 1 | **Allowlist** | Terminally blocks unknown leaves (free, no budget consumed) |
| 2 | **Shadow** | Observe without mutating (never throttled) |
| 3 | **Rate limit** | Live-only sliding-window throttle |
| 4 | **Rig G** | Feasibility gate via `startTaskStep` |
| 5 | **Commit** | `record()` + execute (budget consumed only here) |

Shadow mode (`EXECUTOR_MODE=shadow`) never consumes rate-limit budget and never mutates game state.

#### Geofence

When configured, the executor blocks any step where the bot is outside the horizontal bounding box (Chebyshev/square distance). Fail-closed: if bot position is unknown, execution is blocked.

#### Emergency stop

`POST /executor/stop` immediately halts the executor loop and aborts in-flight HTTP requests via `AbortController`. The abort signal is threaded through `mcFetch` → `mcPostJson` → `executeActionWithBotCheck` to reach the actual HTTP boundary. Optionally gated behind `EXECUTOR_EMERGENCY_TOKEN`.

Note: abort cancels outbound HTTP only. If a leaf action has already been dispatched to the MC bot, the bot-side effect may continue.

#### Behavior when enabled

Prefers MCP-registered Behavior Tree options, validates results against actual game state, uses inventory-based progress gating, injects prerequisite steps (e.g., gather wood), retries with backoff. Dispatches any step with `meta.executable: true` and validates leaf args before dispatch.

### Fallback-Macro Planner

When Sterling solvers cannot handle a task (e.g., free-form cognitive thoughts like "gather wood"), the fallback-macro planner produces executable steps:

- Resolves task requirements via `resolveRequirement()` (collect, mine, craft, build, tool_progression)
- Maps requirements to validated fallback plans via `requirementToFallbackPlan()` in `modules/leaf-arg-contracts.ts`
- Emits steps with `meta.authority: 'fallback-macro'` and `meta.executable: true`
- Collect/mine plans emit multiple `dig_block` steps (capped) to match quantity
- Craft plans are single-step; the executor's prereq injection handles missing materials via recipe introspection at execution time
- Pre-execution arg validation in strict mode rejects unknown leaves via `KNOWN_LEAVES` allowlist

### Thought-to-Task Pipeline

Cognitive thoughts are converted to actionable tasks with structured requirement extraction:

1. **Goal tags** — the LLM is prompted to emit `[GOAL: collect oak_log 8]` tags; these take priority over keyword heuristics
2. **Keyword heuristics** — content-based classification (gather/craft/mine/build/explore/farm)
3. **LLM structured extraction** — when heuristics say "general" and no goal tag exists, the cognition service's MLX adapter extracts `{kind, target, quantity}` from ambiguous text
4. Each path produces a `requirementCandidate` in `task.parameters`; `resolveRequirement()` maps it to the canonical `TaskRequirement` shape

### Authority and Execution

- Steps execute when `meta.executable === true` (authority is for tracing/auditing only)
- Sterling steps set `meta.source = 'sterling'`; the executor normalizes this to `meta.authority` for logging
- `validateLeafArgs(leaf, args, strictMode=true)` at the executor boundary rejects unknown leaves
- Prerequisite injection for craft steps: if materials are missing, `injectDynamicPrereqForCraft()` creates a gathering subtask (capped at 3 attempts per task via `metadata.prereqInjectionCount`)

### Inventory-Gated Progress

Progress and completion are computed using real inventory snapshots from the Minecraft Interface:

- Gather: counts items matching patterns (e.g., `oak_log`, `_log`).
- Mine: counts mined resource patterns (e.g., `iron_ore`).
- Craft: verifies crafted outputs (e.g., `wooden_pickaxe`) and estimates progress from proxy materials if output isn’t present.

### MCP Integration

- Behavior Tree options are registered at startup; MCP tools are listed and invoked via the embedded MCP.
- When an MCP option is suitable, the executor runs it and then re-checks inventory to gate completion.

## Configuration

Environment variables:

- `PORT` — planning server port (default `3002`)
- `MCP_ONLY` — when `true`, disallow direct `/action` fallback and use MCP exclusively
- `STRICT_REQUIREMENTS` — when not `false`, only structured `requirementCandidate` produces requirements; regex fallback disabled
- `NODE_ENV`, `DEBUG_ENVIRONMENT` — enable additional environment logging

Executor variables:

- `ENABLE_PLANNING_EXECUTOR` — `1` to enable the autonomous executor (default: disabled)
- `EXECUTOR_MODE` — `shadow` (observe only, default) or `live` (mutates game state)
- `EXECUTOR_LIVE_CONFIRM` — must be `YES` to actually enable live mode (safety interlock)
- `EXECUTOR_POLL_MS` — executor poll interval in ms (default `10000`)
- `EXECUTOR_MAX_STEPS_PER_MINUTE` — sliding-window rate limit (default `6`)
- `EXECUTOR_FAILURE_COOLDOWN_MS` — cooldown after step failure (default `10000`)
- `EXECUTOR_MAX_BACKOFF_MS` — max exponential backoff on executor errors (default `60000`)
- `EXECUTOR_GEOFENCE_CENTER` — geofence center as `x,z` or `x,y,z` (unset = disabled)
- `EXECUTOR_GEOFENCE_RADIUS` — Chebyshev (square) radius in blocks (default `100`)
- `EXECUTOR_GEOFENCE_Y_RANGE` — optional vertical constraint as `min,max` (fail-closed if set but Y unknown)
- `EXECUTOR_EMERGENCY_TOKEN` — bearer token for `/executor/stop` endpoint (unset = no auth required)

Service endpoint overrides (used by readiness probes):

- `MINECRAFT_ENDPOINT` — minecraft interface URL (default `http://localhost:3005`)
- `MEMORY_ENDPOINT` — memory service URL (default `http://localhost:3001`)
- `COGNITION_ENDPOINT` — cognition service URL (default `http://localhost:3003`)
- `DASHBOARD_ENDPOINT` — dashboard URL (default `http://localhost:3000`)

## Development

Run the planning server in dev mode:

```
pnpm --filter @conscious-bot/planning run dev:server
```

Run tests:

```
pnpm --filter @conscious-bot/planning test
```
