# Change Impact Map: EXEC-2403 Building Budgeted Execution

## Touched Modules
- packages/planning/src/modular-server.ts

## Runtime Behavior
- Building leaf execution is rate-limited and capped by attempts/time budget.
- Budget events are sent to dashboard stream.

## Roll-forward
- Default budgets enabled.

## Rollback
- Set BUILD_EXEC_BUDGET_DISABLED=1 to bypass checks.
