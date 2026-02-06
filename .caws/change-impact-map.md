# Change Impact Map — STIR-510 Golden Run Proof

## Files / Modules
- packages/planning/src/modules/planning-endpoints.ts
  - Add dev-gated injection endpoint.
- packages/planning/src/task-integration.ts
  - Record expansion + verification for golden runs.
- packages/planning/src/modular-server.ts
  - Record dispatch for golden runs.
- packages/planning/src/modules/keep-alive-integration.ts
  - Idle episode → Sterling reduction → thought emission.
- packages/planning/src/golden-run-recorder.ts
  - New recorder module.
- packages/planning/src/task-integration/thought-to-task-converter.ts
  - Propagate goldenRun metadata into created tasks.
- packages/cognition/src/keep-alive/keep-alive-controller.ts (if needed)
  - Optional idle episode trigger hooks (no semantics).
- scripts/docs-boundary-lint.js
  - No change.

## Data / Artifacts
- artifacts/golden-run/golden-<run_id>.json

## Roll-forward / Rollback
- Roll-forward: enable ENABLE_DEV_ENDPOINTS and STERLING_IDLE_EPISODES_ENABLED.
- Rollback: disable env flags or revert new endpoints/recorder.
