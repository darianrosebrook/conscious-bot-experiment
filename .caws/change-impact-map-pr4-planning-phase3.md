# Change Impact Map: PR4 Phase 3 Planning Migration

> **SUPERSEDED — archived for history.** The keep-alive-integration.ts
> file listed below (line 9) was deleted in the keep-alive cauterization
> work that followed this PR (see
> docs/planning/run-doom-loop-working-spec.md Phase 1B closing note).
> This document is retained as a historical decision record; do not use
> it as a reference for current planning-package architecture. The
> idle-episode emission pathway it documents will be replaced in Phase 2
> by a new IdleEngine component.

## Touched Modules
- packages/planning/src/task-integration/thought-to-task-converter.ts
- packages/planning/src/task-integration/task-management-handler.ts
- packages/planning/src/task-integration.ts
- packages/planning/src/task-integration/task-store.ts
- packages/planning/src/modules/cognitive-stream-client.ts
- packages/planning/src/modules/keep-alive-integration.ts
- packages/planning/src/modular-server.ts
- packages/planning/src/task-integration/__tests__/thought-to-task-converter.test.ts
- packages/planning/src/task-integration/__tests__/goal-protocol-integration.test.ts
- packages/planning/src/task-integration/__tests__/task-management-handler.test.ts
- packages/planning/src/__tests__/legacy-planner-guards.test.ts
- packages/planning/src/task-integration/__tests__/task-integration-pipeline.test.ts

## Behavior Changes
- Task conversion requires Sterling reduction with `committed_ir_digest`.
- No local semantic parsing, goal tags, or keyword fallback.
- Task dedupe/identity uses `committed_ir_digest`.
- Execution routing uses Pattern A: generic Sterling IR tasks resolved by digest downstream.

## Risks
- Reduced task creation when Sterling is unavailable (intentional fail-closed).
- Existing executor routing may expect action types; now must resolve via digest.
- Legacy management actions disabled until Sterling emits explicit payloads.

## Rollback Plan
- Set `PLANNING_STRICT_STERLING_TASKS=false` to halt conversion.
- Re-enable legacy conversion only if explicitly approved (not default).
