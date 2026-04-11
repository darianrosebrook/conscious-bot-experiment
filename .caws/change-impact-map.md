# Change Impact Map — STIR-510 Golden Run Proof

## Files / Modules
- packages/planning/src/modules/planning-endpoints.ts
  - Add dev-gated injection endpoint.
- packages/planning/src/task-integration.ts
  - Record expansion + verification for golden runs.
- packages/planning/src/modular-server.ts
  - Record dispatch for golden runs.
- packages/planning/src/golden-run-recorder.ts
  - New recorder module.
- packages/planning/src/task-integration/thought-to-task-converter.ts
  - Propagate goldenRun metadata into created tasks.
- scripts/docs-boundary-lint.js
  - No change.

Historical note: this impact map originally listed
packages/planning/src/modules/keep-alive-integration.ts and
packages/cognition/src/keep-alive/keep-alive-controller.ts as idle-episode
trigger surfaces. Both files have been deleted as part of the keep-alive
cauterization (see docs/planning/run-doom-loop-working-spec.md Phase 1B
closing note). The idle-episode emission pathway will be reintroduced in
Phase 2 via a new IdleEngine component in the planning package.

## Data / Artifacts
- artifacts/golden-run/golden-<run_id>.json

## Roll-forward / Rollback
- Roll-forward: enable ENABLE_DEV_ENDPOINTS.
- Rollback: disable env flag or revert new endpoints/recorder.
