# @conscious-bot/planning

Planning and goal management system for Conscious Bot.

## Overview

This package provides hierarchical and reactive planning, MCP integration, and an autonomous executor that coordinates with the Minecraft interface and other subsystems.

## Server

- Entry: `src/modular-server.ts`
- Default port: `3002`
- Embedded MCP endpoints mounted at: `http://localhost:3002/mcp`

### Endpoints

- `GET /health` — service health and memory usage
- `GET /planner` — summary of current plan, action queue, and activity flags
- `GET /state` — structured goals/tasks state for dashboards
- `POST /task` — add a new task `{ title, description, type, ... }`
- `GET /tasks` — list current and completed tasks
- `POST /execute` — execute a goal or task `{ type: 'goal'|'task', id }`
- `POST /execute-plan` — execute a concrete plan or a task-derived plan
- `GET/POST /mcp/*` — MCP operations (list/register/promote/run options)

### Autonomous Executor

- Runs every ~10s to discover and execute the highest-priority task.
- Prefers MCP-registered Behavior Tree options and validates results against actual game state.
- Uses inventory-based progress gating and completion checks to avoid "fake completion".
- Injects prerequisite steps (e.g., gather wood) and retries with backoff when needed.
- Dispatches any step with `meta.executable: true` and validates leaf args before dispatch.

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
