# Test Plan — STIR-510 Golden Run Proof

## Unit
- GoldenRunRecorder: merges updates, writes report file, appends dispatches, handles missing run safely.

## Integration
- Dev injection endpoint: injects sterling_ir task and returns run_id + task_id (manual smoke).
- Expansion recording: materializeSterlingIrSteps records outcome + request_id when run_id present.
- Dispatch recording: executor dispatch writes leaf + args into report when run_id present.
- Verification recording: verification result recorded; inventory delta captured when applicable.

## E2E (manual)
- Stage 1 sink proof: inject digest → expansion ok → leaf executed → verification evidence in report.
- Stage 2 source proof: idle episode → reduction → task created → expansion → execution → report complete.

## Fixtures / Data
- Use real Sterling backend for expansion.
- Choose a stable leaf (prefer `acquire_material`) for verification.

## Flake Controls
- Run with deterministic world seed and stable inventory state.
- Use single inflight idle episode with cooldown.
