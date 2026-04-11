# Plan — STIR-510 Golden Run Proof

> **SUPERSEDED — archived for history.** Stage 2 of this plan (lines 10–15)
> was built around `KeepAliveIntegration`, which has been deleted as part
> of the keep-alive cauterization work. The idle-episode emission pathway
> will be reintroduced in Phase 2 via a new `IdleEngine` component. The
> golden-run recording infrastructure (Stage 1) is unaffected. Do not use
> Stage 2 as a reference for current planning-package architecture; see
> docs/planning/run-doom-loop-working-spec.md for the cauterization
> rationale and the Phase 2 regrowth plan.

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
