# Feature Plan: COG-LOG-1001 Logging Coherence

## Design Sketch
- Introduce a small server logger helper (or use existing logger) to emit structured logs with fields:
  - `event`, `subsystem`, `category`, `tags`, `context`, `error`.
- Replace ad-hoc `console.log/warn/error` in `server.ts` with the helper.
- Middleware logging emits a structured entry with `operationType`, `success`, `statusCode`, `durationMs`, `path`, and `method`.

## Test Matrix
- Unit: verify log helper shapes and error serialization [A1, A3].
- Integration: server emits middleware log and thought generation log [A1, A2].
- E2E: N/A.
- A11y: N/A.

## Data Plan
- No new data. Use existing runtime state. Avoid logging PII.

## Observability Plan
- Logs:
  - `cognition_server_start` / `cognition_server_stop`
  - `thought_generation_started` / `thought_generation_error`
  - `middleware_request`
- Metrics/traces: unchanged.
