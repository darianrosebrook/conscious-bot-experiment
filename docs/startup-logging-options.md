# Startup Script Logging Options

This document describes the logging modes, environment variables, and tiered logging system available in the conscious-bot startup script and services.

## Startup Script Modes (`scripts/start.js`)

### Output Modes

| Flag | Mode | Description |
|------|------|-------------|
| (default) | `verbose` | Full service output with prefixed lines, build summaries |
| `--quiet` | `quiet` | Minimal output, only errors and success messages |
| `--progress` | `progress` | Progress bars using listr2 (requires `pnpm add -D listr2`) |
| `--debug` | `debug` | Extra verbose, full build output, all subprocess logs |
| `--production` | `production` | Production mode, suppresses debug logs |

### Log Capture Options

| Flag | Description |
|------|-------------|
| `--capture-logs` | Capture startup logs to `run.log` (default: 2 minutes of runtime in verbose mode) |
| `--capture-logs=0` | Capture only startup logs (until "Services are running") |
| `--capture-logs=N` | Capture startup + N seconds of runtime logs |

### Escape Hatches

| Flag | Description |
|------|-------------|
| `--proceed-temporarily="reason"` | Continue startup even if some services fail (for debugging) |
| `--skip-docker` | Skip Docker services (Postgres, Minecraft server) |

## Environment Variables

### Cognition Service

| Variable | Values | Description |
|----------|--------|-------------|
| `COGNITION_LOG_LEVEL` | `normal` (default), `verbose`, `debug` | Controls tiered logging verbosity |

### Other Services

| Variable | Description |
|----------|-------------|
| `FORCE_COLOR` | Set to `1` to enable ANSI colors in subprocesses |
| `NO_COLOR` | Set to `1` to disable all ANSI colors |
| `WORLD_SEED` | Minecraft world seed (Memory service uses default if unset) |
| `MINECRAFT_VERSION` | Minecraft version (default: `1.21.4`) |
| `STERLING_DIR` | Path to Sterling repo (default: `../sterling`) |
| `STERLING_WS_URL` | Sterling WebSocket URL (default: `ws://127.0.0.1:8766`) |

---

## Cognition Tiered Logging System

The cognition service implements a tiered logging system that classifies events to reduce noise while preserving research-critical signals.

### Event Tiers

| Tier | Behavior | Examples |
|------|----------|----------|
| **routine** | Suppressed in `normal` mode | Health checks, state polling, SSE connections |
| **lifecycle** | Always shown | Server start/stop, LLM health, endpoint registration |
| **research** | Always shown | Thought generation, social cognition, LLM calls |
| **error** | Always shown | All errors and warnings |

### Routine Events (Suppressed by Default)

These events are suppressed unless `COGNITION_LOG_LEVEL=verbose`:

**Event Names:**
- `middleware_request` (for routine paths)
- `observation_log`
- `thought_stream_send_ok`

**Routine Paths:**
- `/health`
- `/state`
- `/events`
- `/notes`
- `/api/cognitive-stream/recent`
- `/api/cognitive-stream/actionable`

### Lifecycle Events (Always Shown)

| Event Name | Description |
|------------|-------------|
| `server_started` | Cognition service started |
| `server_endpoints_registered` | Endpoints registered |
| `llm_health_ok` | LLM backend reachable |
| `llm_health_non_ok` | LLM backend returned non-200 |
| `llm_health_unreachable` | LLM backend not reachable |
| `intero_history_loaded` | Intero history loaded from disk |
| `intero_history_load_failed` | Failed to load intero history |
| `social_memory_init_failed` | Social memory initialization failed |
| `process_uncaught_exception` | Uncaught exception |
| `process_unhandled_rejection` | Unhandled promise rejection |

### Research Events (Always Shown)

| Event Name | Description |
|------------|-------------|
| `thought_generation_started` | Thought generation loop started |
| `thought_generation_stopped` | Thought generation loop stopped |
| `thought_generation_error` | Error during thought generation |
| `event_thought_generated` | Thought generated from event |
| `intrusive_thought_recorded` | Intrusive thought received and recorded |
| `intrusive_thought_processing_error` | Error processing intrusive thought |
| `agency_counters` | Agency counter snapshot |
| `llm_generate_error` | LLM generation error |
| `social_consideration_log_failed` | Failed to log social consideration |
| `chat_consideration_log_failed` | Failed to log chat consideration |

---

## Service Log Summarization

The following services implement log summarization to reduce startup noise:

### Memory Service

| Before | After |
|--------|-------|
| 10 individual "Skill registered" lines | 1 summary: `[Memory] Registered 10 skills (...)` |
| 5 endpoint listing lines | 1 summary: `[Memory] Endpoints: /health, /enhanced/*` |

### Planning Service

| Before | After |
|--------|-------|
| 15 individual "Registered leaf" lines | 1 summary: `Registered 15 core leaves in planning` |
| 15 individual MCP option lines | 1 summary: `[Planning] MCP options seeded: 3/3 registered, 3 promoted (...)` |

### Minecraft Interface Service

| Before | After |
|--------|-------|
| 42 individual "Registered leaf" lines | 1 summary: `[Minecraft Interface] Registered 42/42 core leaves` |
| 30+ pathfinder initialization lines | 1 summary: `[NavigationBridge] Pathfinder initialized (version X.X.X)` |

---

## Startup Phases

The startup script executes in this order:

1. **System Requirements** - Check Node.js version, pnpm availability
2. **MLX-LM Sidecar Setup** - Create venv, install dependencies, verify model cache
3. **UMAP Service Setup** - Create venv, install dependencies
4. **Docker Services** - Start Postgres and Minecraft server containers
5. **Cleanup** - Kill existing processes on service ports
6. **Port Availability** - Verify all ports are free
7. **Dependencies** - Run `pnpm install`
8. **Build** - Run `pnpm build` (with summarized output in verbose mode)
9. **Service Startup** - Start services in priority order:
   - Priority 1: Core API
   - Priority 2: Memory, World, MLX-LM Sidecar, Sterling, UMAP Service
   - Priority 3: Cognition
   - Priority 4: Planning
   - Priority 5: Minecraft Interface
   - Priority 7: Dashboard
10. **Health Checks** - Verify all services are healthy
11. **Readiness Broadcast** - Signal all services that system is ready
12. **Optional Services Check** - Check Sterling, Minecraft server, Kokoro TTS

---

## Service Configuration

| Service | Port | Health URL | Dependencies |
|---------|------|------------|--------------|
| Core API | 3007 | `/health` | None |
| Memory | 3001 | `/health` | Core API |
| World | 3004 | `/health` | Core API |
| Cognition | 3003 | `/health` | Core API |
| Planning | 3002 | `/health` | Core API, Memory, World |
| Minecraft Interface | 3005 | `/health` | Core API, Planning |
| MLX-LM Sidecar | 5002 | `/health` | None |
| Dashboard | 3000 | `/` | Core API, Planning, Minecraft Interface |
| Sterling | 8766 | WebSocket | None |
| UMAP Service | 5003 | `/health` | None |

---

## Recommended Usage

### Development (default)
```bash
node scripts/start.js
```

### Quick Testing
```bash
node scripts/start.js --capture-logs=0
```

### Debugging a Service
```bash
node scripts/start.js --proceed-temporarily="debugging minecraft-interface"
```

### Full Verbose Logging
```bash
COGNITION_LOG_LEVEL=verbose node scripts/start.js --debug
```

### CI/Production
```bash
node scripts/start.js --production --capture-logs=0
```
