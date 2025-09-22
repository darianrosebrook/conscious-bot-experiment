# Change Impact Map: CBOT-4821

## Modules
- `packages/core/src/arbiter.ts`: integrate enhanced need outputs into decision routing.
- `contracts/needs-decision-interface.yaml`: document internal contract for emitted decision tasks.

## Dependencies
- Relies on existing `AdvancedNeedGenerator`, `PriorityRanker`, and `GoalTemplateManager` APIs; no signature changes.

## Roll-forward Strategy
- Deploy integration with logging + metric counters to monitor task volume.
- Feature flag via config to disable enhanced need scheduling if anomalies detected.

## Rollback Strategy
- Revert arbiter integration block and remove metric/logging if issues arise.
- Maintain contract file (non-breaking) to preserve documentation.

## Operational Notes
- Monitor `arbiter_enhanced_need_task_count` spikes post-deploy.
- Increase debug logging temporarily in staging to inspect task payloads.
