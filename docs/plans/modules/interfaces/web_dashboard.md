# Web Dashboard & Streaming Plan (Next.js)

Author: @darianrosebrook

A shippable plan for a Next.js-based dashboard that displays the bot's activities, stats, worldview, plans, and allows safe operator controls. Includes SSE telemetry, ingest APIs, streaming to YouTube (RTMP), security, performance budgets, and verification.

## Goals

- Real-time visibility: perception, planning, actions, memory events, safety.
- Operator controls: pause/step, approve high-impact actions, intrusion injection, edit Constitution.
- Worldview: Place Graph map, resource observations, current path/goal.
- Streaming: optional RTMP push to YouTube with basic controls and health checks.
- Safe by default: auth, rate-limits, two-person approvals for destructive actions.

## Architecture

- Framework: Next.js (App Router, TypeScript, Tailwind CSS).
- Runtime: nodejs for server routes that handle SSE and process management.
- Telemetry transport: Server-Sent Events (SSE) from server to browser; HTTP ingest from agent to server.
- State: UI consumes SSE feed; minimal client state, server fan-out via an in-process EventEmitter bus.
- Layout: dashboard (cards + table), drill-down pages (world, planning, memory, safety), controls overlay.

### Key Modules

- Ingest API (POST /api/ingest): accepts TelemetryEvent or batches and emits to event bus.
- SSE API (GET /api/stream): multiplexes per-channel SSE events with heartbeat and retry hints.
- Controls API (POST /api/control): pause/step/approve/deny; requires auth + CSRF protection.
- Config API (GET/POST /api/config): read/update live thresholds, router heuristics; requires auth.
- Streaming API (POST /api/youtube): start/stop RTMP via ffmpeg (spawn & kill), status endpoint.
- Event Bus (lib/eventBus): singleton for server broadcasting.

## Data Contracts

```ts
// Telemetry
export type TelemetryEvent = {
  ts: number;                // epoch ms
  channel: string;           // perception | planning | action | memory | safety | social | misc
  data: unknown;             // JSON-serializable payload
}

// Control
export type ControlRequest = {
  action: 'pause'|'step'|'resume'|'approve'|'deny'|'inject_intrusion';
  payload?: Record<string, unknown>;
}

// Streaming
export type StreamingRequest = {
  action: 'start'|'stop'|'status';
  rtmpUrl?: string;          // rtmp://a.rtmp.youtube.com/live2/KEY
  inputUrl?: string;         // e.g., media source, desktop capture URL (future)
}
```

## Pages & Views

- Dashboard (/) – connection status, key stats, rolling event log with filters.
- World (/world) – Place Graph visualization (nodes/edges), current position, waypoints, observed resources.
- Planning (/planning) – current top goals, plan tree, repair vs replan charts, priority factors.
- Memory (/memory) – episodic timeline, semantic graph neighbors, recent reflections.
- Safety (/safety) – reflex activations, safe-mode invocations, constitution violations (should be ~0).
- Controls (/controls) – intrusion input, module toggles, approvals, streaming control panel.

## UI Components

- StatsCard: label/value small cards.
- EventLogTable: virtualized table with channel filters.
- TimelineChart: time-series for latencies (p50/p95/p99), replans/hour, repair:replan.
- GraphView: Place Graph with pan/zoom; node details drawer.
- PlanTree: expandable steps, current action highlight.
- ControlsPanel: signed controls with two-person approval on destructive actions.

## APIs (Expanded)

- POST /api/ingest
  - Auth: shared ingestion token header `x-auth-token`; reject missing/invalid.
  - Body: TelemetryEvent | TelemetryEvent[].
  - Behavior: validates, normalizes (safe defaults), emits on `telemetry` channel.

- GET /api/stream
  - SSE headers; events: `event: <channel>` + `data: JSON`.
  - Heartbeat every 15s; retry hint 3000ms.

- POST /api/control
  - Auth: operator JWT/session; CSRF token for browser clients.
  - Body: ControlRequest; routes to internal broker (e.g., webhook to bot, or MQ).
  - Two-person rule: destructive actions require a second approval entry.

- GET/POST /api/config
  - Read/update runtime configuration (budgets, router thresholds) with audit logging.

- POST /api/youtube
  - Body: `{ action: 'start'|'stop'|'status', rtmpUrl?, inputUrl? }`.
  - Start: spawn ffmpeg process and store pid; Stop: kill pid; Status: report running/healthy.
  - Logging: record start/stop, args (sans secrets), exit codes.

## Streaming (YouTube RTMP)

- Process manager: encapsulate ffmpeg spawn with guards, PID store, and health checks (stderr parsing).
- Recommended command baseline:
  - `ffmpeg -re -i <inputUrl> -c:v libx264 -preset veryfast -b:v 4500k -c:a aac -b:a 160k -f flv <rtmpUrl>`
- Secrets: runtime-configured via env (`YOUTUBE_RTMP_URL`), never commit.
- Future inputs: screen capture, canvas render (map/overlays), agent POV proxy.

## Security & Privacy

- Ingest token (`INGEST_TOKEN`) required; rate-limit /api/ingest (IP + token buckets).
- Restrict CORS to trusted origins; `SameSite=Lax` for cookies; CSRF on control/config POSTs.
- Operator auth (NextAuth or custom) – roles: viewer, operator, admin.
- Two-person approval for destructive actions; detailed audit trail.
- Anonymize PII in chat logs; redact secrets from telemetry.

## Performance Budgets

- SSE: sustain ≥ 100 events/sec per instance; batch-ingest coalescing on server.
- Ingest route: ≤ 5 ms p95 parsing + emit under normal load; backpressure with 429 on overload.
- UI: main thread idle ≥ 60% during steady streaming; virtualize long tables; avoid heavy reflows.
- Memory: cap event log to rolling window (e.g., 1–5k rows) with indexed filters.

## Telemetry & Metrics

- Frontend: Web Vitals (CLS/LCP/INP) and custom counters for dropped SSE messages.
- Backend: OTel spans for ingest, broadcast, SSE delivery; error rates; process health for ffmpeg.
- Dashboards: loop-time, replan latency, repair:replan, safe-mode, SSE throughput, ingest p95.

## Testing & Verification

- Unit: schema validation for TelemetryEvent; SSE writer unit test; ffmpeg arg sanitizer.
- Integration: Playwright tests covering dashboard render, SSE updates, control flows.
- Contract: ensure SSE events and ingest payloads match contracts; golden snapshots for plan tree.
- Load: k6/Artillery for /api/ingest; browser SSE soak test; ensure no memory leaks.
- Security: authZ matrix tests; CSRF checks; rate-limit behavior; two-person approval flows.

## Configuration

- `.env.local`
  - `INGEST_TOKEN=...`
  - `OPERATOR_SECRET=...` (if using simple token auth)
  - `YOUTUBE_RTMP_URL=rtmp://a.rtmp.youtube.com/live2/KEY`
  - `STREAM_INPUT_URL=file:/path/to/input.mp4`

## Implementation Outline

- Wire auth middleware for operator routes; token guard for ingest.
- Build Controls API and UI with two-person approval queue.
- Add status widgets and filters; charts for planning/safety metrics.
- Implement Place Graph view with a simple canvas/SVG; integrate when graph telemetry is available.
- Add ffmpeg manager service; expose start/stop/status; surface health in UI.
- Add OTel instrumentation on APIs; forward traces to Langfuse.

## Integration Points

- Bot → /api/ingest with TelemetryEvent batches.
- UI → /api/stream for live updates.
- Controls → bot broker (HTTP or MQ) via server-side hooks.
- Streaming → external RTMP target (YouTube); optional POV source from bot.
