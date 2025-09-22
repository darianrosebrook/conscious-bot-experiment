# Change Impact Map: CBOT-4972

## Modules
- `packages/planning/src/goal-formulation/task-bootstrapper.ts` (new): memory/LLM/exploration task synthesis logic.
- `packages/planning/src/integrated-planning-coordinator.ts`: wire bootstrapper into planning pipeline.
- `contracts/needs-decision-interface.yaml`: extend schema with `BootstrapTask` definition for serialized outputs.
- `packages/planning/src/__tests__`: new coverage for bootstrap behaviour.

## Dependencies
- Consumes memory service `/state` endpoint; requires running memory server but degrades gracefully.
- Optional LLM endpoint via `LLM_ENDPOINT`; bootstrapper must tolerate timeout/failure.
- Reuses existing environment integration for inventory/world snapshots.

## Roll-forward Strategy
- Ship behind planner config switch defaulting to enabled; observe `planning_bootstrap_source_count` metric.
- Enable structured logging (`planning.bootstrap.tasks`) in staging to validate payload shape.

## Rollback Strategy
- Toggle planner flag to skip bootstrap; recompiles without touching contracts.
- Remove schema addition only if upstream consumers mis-handle it.

## Operational Notes
- Monitor bootstrap latency against 200ms budget; investigate spikes due to memory/LLM endpoints.
- Alert if LLM endpoint errors exceed 5% over rolling hour (observability follow-up ticket).
