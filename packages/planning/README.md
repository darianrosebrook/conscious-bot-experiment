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

### Autonomous Executor (Currently Disabled)

The planning package's autonomous executor (which would run every ~10s via `EXECUTOR_POLL_MS`) is **disabled**. Task discovery and execution are driven by:

- **HTTP triggers**: `POST /execute`, `POST /execute-plan`, `POST /autonomous`
- **Minecraft-interface planning cycle**: 15s loop in minecraft-interface (coordinator is a stub; actual planning via Sterling solvers happens when tasks are submitted)

Executor behavior when enabled: prefers MCP-registered Behavior Tree options, validates results against actual game state, uses inventory-based progress gating, injects prerequisite steps (e.g., gather wood), retries with backoff. Dispatches any step with `meta.executable: true` and validates leaf args before dispatch.

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
- `EXECUTOR_POLL_MS` — autonomous executor poll interval when enabled (default `10000`)
- `STRICT_REQUIREMENTS` — when not `false`, only structured `requirementCandidate` produces requirements; regex fallback disabled
- `NODE_ENV`, `DEBUG_ENVIRONMENT` — enable additional environment logging

## Development

Run the planning server in dev mode:

```
pnpm --filter @conscious-bot/planning run dev:server
```

Run tests:

```
pnpm --filter @conscious-bot/planning test
```
