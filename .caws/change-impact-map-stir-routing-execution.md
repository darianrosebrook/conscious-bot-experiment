# Change Impact Map: STIR Routing & Sterling Executor Contract

## Touched Modules
- packages/planning/src/task-integration.ts
- packages/planning/src/task-integration/sterling-planner.ts
- packages/planning/src/modules/action-plan-backend.ts
- packages/planning/src/server/task-action-resolver.ts
- packages/planning/src/server/execution-gateway.ts
- packages/planning/src/modules/planning-endpoints.ts
- packages/planning/src/task-integration/__tests__/*
- packages/planning/src/server/__tests__/*
- contracts/sterling-executor.yaml

## Behavior Changes
- `sterling_ir` tasks bypass requirementCandidate routing and `resolveRequirement()`/`routeActionPlan()`.
- Digest-only routing to Sterling executor (Pattern A) with fail-closed behavior.
- No title/description inference for `sterling_ir` routing or execution.
- Dedupe for `sterling_ir` is digest-only (no similarity dedupe).

## Risks
- Routing stalls if Sterling executor is unavailable (intentional fail-closed).
- Accidental boundary drift if legacy resolver paths are re-used.
- Contract mismatch between planning and Sterling executor if schema not aligned.

## Rollback Plan
- Disable `STERLING_IR_ROUTING=1` to revert to strict no-requirement unplannable behavior.
- Preserve digest metadata for auditability even when routing disabled.
