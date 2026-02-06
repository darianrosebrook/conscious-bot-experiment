# Plan — STIR-510 Golden Run Proof

## Design Sketch
Sequence (Stage 1):
1) Dev endpoint injects `sterling_ir` task (digest + schema).
2) TaskIntegration.addTask → materializeSterlingIrSteps → expandByDigest.
3) Executor dispatches leaf; verification runs.
4) GoldenRunRecorder writes artifact.

Sequence (Stage 2):
1) KeepAliveIntegration detects idle (no_tasks).
2) Sterling idle episode reduction via Language IO transport.
3) Thought posted to cognition with reduction + convertEligible.
4) TaskIntegration converts thought → task → expansion → dispatch → verification.
5) GoldenRunRecorder writes artifact including idle episode.

## Test Matrix
- Unit: GoldenRunRecorder merge + file write.
- Integration: dev injection endpoint + expansion recording + dispatch/verification recording.
- Manual E2E: sink proof, then source proof.

## Data Plan
- Golden run reports written under `artifacts/golden-run/`.
- Report fields: run_id, injection/task, idle_episode, expansion, execution.

## Observability Plan
- Structured logs: injection, expansion, dispatch, verification.
- Golden run report as durable evidence artifact.
