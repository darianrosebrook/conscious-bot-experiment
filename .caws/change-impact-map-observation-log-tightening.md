# Change Impact Map: OBS-2402 Observation Log Tightening

## Touched Modules
- packages/minecraft-interface/src/threat-perception-manager.ts
- packages/minecraft-interface/src/water-navigation-manager.ts
- packages/cognition/src/server.ts (entity observation logging gate)

## Runtime Behavior
- Logs throttled/aggregated; no behavior changes.

## Roll-forward
- Default to reduced logging.

## Rollback
- Set OBSERVATION_LOG_DEBUG=1 or revert changes.
