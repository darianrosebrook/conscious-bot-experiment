# Change Impact Map: PR4-PLANNING-OBS-400

## Touched Modules
- `packages/planning/src/modules/planning-endpoints.ts`
  - Add debug-only 400 logging and structured rejection payloads.
  - Request id propagation.
- `packages/planning/src/task-integration.ts`
  - Debug-only ACK gating to retain failing thoughts.
- `packages/cognition/src/intrusive-thought-processor.ts`
  - Log planning bridge 400 response body (truncated + hash).

## Contracts
- Planning ingestion endpoint contract path TBD; resolve before merge.

## Roll-forward / Rollback
- Roll-forward: enable `PLANNING_INGEST_DEBUG_400=1` in local run.
- Rollback: disable flag; remove debug logging + ack gating.
