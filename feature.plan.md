# Feature Plan: PR4-PLANNING-OBS-400

## Risk Tier
2

## Design Sketch
- Planning `/task` endpoint
  - Extract/assign request id (`x-request-id`), echo back in response header.
  - On 400 in debug mode (`PLANNING_INGEST_DEBUG_400=1`):
    - Log structured request shape (keys, key presence booleans, content-type, body size).
    - Return 400 with debug details (missing fields, reason code).
- Cognition planning bridge
  - On non-2xx: read response body (truncated), hash, log URL + status + hash.
- Task integration
  - Debug-only ACK gating for thoughts that fail closed (bounded retries per thought id).

## Test Matrix
- Unit
  - Debug flag off: 400 response does not include validation details.
  - Debug flag on: 400 response includes missing fields and request id.
  - Logs contain no free-text content.
  - Request id propagated via header.
- Integration
  - Malformed planning request → 400 + debug logs (flag on).
  - Valid planning request → 2xx.
- E2E smoke
  - Cognition non-2xx → log includes URL, status, response hash.

## Data Plan
- No new persisted data.
- Request id generated per request if missing.
- Debug state: in-memory retry counter for ACK deferral.

## Observability Plan
- Logs (debug only)
  - `planning.thought_ingest.request` with key presence.
  - `planning.thought_ingest.reject` with missing fields.
  - `cognition.planning_bridge.error` with response hash.
- Metrics (if available)
  - `planning_thought_ingest_400_total{reason_code}`
  - `planning_thought_ingest_missing_field_total{field}`
