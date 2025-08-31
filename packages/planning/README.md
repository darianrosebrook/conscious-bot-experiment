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
- Uses inventory-based progress gating and completion checks to avoid “fake completion”.
- Injects prerequisite steps (e.g., gather wood) and retries with backoff when needed.

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

