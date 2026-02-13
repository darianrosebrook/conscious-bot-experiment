# Package Scripts Audit

Audit of `package.json` scripts across the monorepo. Goal: clearer structure, fewer redundant scripts, flag-based behavior where appropriate.

## Root package.json

### Startup (canonical)

| Script | Purpose |
|--------|---------|
| `start` | Full stack via `scripts/start.js` (Docker, sidecars, all services) |
| `dev` | Alias for `start` |
| `dev:all` | Simpler flow via `scripts/dev.js` (no Docker, no sidecars) |
| `dev:services` | Concurrent dev servers only (no install/build) |

**Flags for `start`** (pass after `--`): `--quiet`, `--verbose`, `--debug`, `--production`, `--skip-docker`, `--skip-install`, `--skip-build`, `--capture-logs`, `--capture-logs=N`, `--proceed-temporarily="reason"`.

Examples:
- `pnpm start -- --skip-docker`
- `pnpm start -- --quiet --skip-build`

### Removed (dead or redundant)

| Script | Reason |
|--------|--------|
| `start:quiet`, `start:progress`, `start:debug`, `start:production` | Replaced by `start -- --<flag>` |
| `dev:legacy` | Alias for `dev:services`; use `dev:services` directly |
| `agent:dev` | Dead: `@conscious-bot/agent` package does not exist |
| `core:dev` | Redundant: `dev:services` already runs core |
| `audit:*` (all) | Dead: `docs/audit/` does not exist; no implemented audit runner |
| `clear-cognitive-state:db` | Use `pnpm run clear-cognitive-state -- --db` |
| `moc:dry-run` | Use `pnpm run moc -- --dry-run --no-ai` |
| `e2e:teardown` | Use `pnpm run e2e -- --teardown` |

### Kept (essential)

| Script | Purpose |
|--------|---------|
| `build`, `build:ts` | Turbo build, tsc-only |
| `dev:dashboard`, `dev:minecraft`, etc. | Per-package dev (used by dev:services) |
| `kill`, `status`, `health` | Runtime ops |
| `clear-cognitive-state` | State reset |
| `lint`, `docs:lint`, `test`, `clean`, `type-check` | CI / quality |
| `e2e` | E2E harness |
| `docker:*` | Docker Compose |
| `benchmark:mlx`, `moc`, `test:p21` | Specialized |

### Workspaces

Removed `apps/*` from workspaces (directory does not exist).

## Package-level scripts (post-cull)

### minecraft-interface

- **Dead scripts removed:** test:crafting:advanced/basic/simple/comprehensive, demo:crafting, integration-test, test:integration*, test:planning:*, demo:integration, demo:quick, test:bot*, test:manual, test:curl*, build:simple, sim*, verify:viewer (targets or dist-simple removed in prior cleanup).
- **Consolidated:** standalone:basic/navigation/inventory/crafting and simple:connect/move/turn/jump/chat removed; use `pnpm run standalone -- --scenario=<name>` and `pnpm run simple -- --action=<name>`.
- **Kept:** mc:assets*, build, build:viewer, dev, test, test:run, test:standalone, smoke:tier0/tier1, standalone, simple, test:crafting:unit/integration, dev:server, test:p21, test:viewer, extract-entities.

### core

- **Removed:** Per-file test scripts (test:bot-connection through test:simple-server). Use `pnpm test` or `vitest run src/__tests__/<file>.test.ts`.
- **Kept:** build, dev, test, test:ui, test:run, test:watch, test:coverage, lint, type-check, start, dev:server.

### memory

- **Removed:** test:run (redundant with test).
- **Kept:** build, dev, start, dev:server, test, per-file test scripts, soak:*, lint, type-check.

### planning

- **Removed:** test:run (redundant with test), dev:modular (duplicate of dev:server).
- **Kept:** build, dev, dev:server, dev:watch, smoke, smoke:ts, test, test:golden-run, test:ui, lint, type-check.

### evaluation

- **Removed:** test:run; benchmarks:memory, benchmarks:safety, benchmarks:quick (use `pnpm run benchmarks -- --memory-only` etc.).
- **Kept:** build, test, test:ui, lint, clean, benchmarks.

### dashboard

- **Renamed:** typecheck to type-check (turbo consistency).
- **Kept:** dev, build, preview, lint, lint:fix, type-check, test.

### safety

- **Removed:** security-scan (was no-op echo).
- **Kept:** build, test, test:run, test:watch, lint, type-check.

### mcp-server

- **Removed:** start:server (duplicate of start).
- **Kept:** build, dev, test, start, test:client.

### executor-contracts, world, cognition, testkits

Minimal scripts; no changes in this cull.

## Flag reference (root)

| Task | Command |
|------|---------|
| Quiet startup | `pnpm start -- --quiet` |
| Skip Docker | `pnpm start -- --skip-docker` |
| Fast restart | `pnpm start -- --skip-install --skip-build` |
| Clear DB | `pnpm run clear-cognitive-state -- --db` |
| MOC dry run | `pnpm run moc -- --dry-run --no-ai` |
| E2E teardown | `pnpm run e2e -- --teardown` |

## minecraft-interface flags

| Task | Command |
|------|---------|
| Standalone scenario | `pnpm run standalone -- --scenario=basic` (or navigation, inventory, crafting) |
| Simple action | `pnpm run simple -- --action=connect` (or move, turn, jump, chat) |

## evaluation benchmarks

| Task | Command |
|------|---------|
| Full benchmarks | `pnpm run benchmarks` |
| Memory only | `pnpm run benchmarks -- --memory-only` |
| Safety only | `pnpm run benchmarks -- --safety-only` |
| Quick | `pnpm run benchmarks -- --quick` |
