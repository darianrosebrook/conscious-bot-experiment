# LOS Raycast Test Plan

## Scope
- Centralized line-of-sight and FoV checks via `RaycastEngine`.
- Replace omniscient block scans in navigation and environment scanning.

## Unit Tests
- `RaycastEngine.hasLineOfSight` returns false for targets outside FoV.
- `RaycastEngine.hasLineOfSight` returns false for occluded targets.
- `RaycastEngine.sweepOccluders` deduplicates identical hits.

## Integration Tests
- Navigation bridge obstacle detection uses raycast sweep (no radius scan).
- Threat perception only flags entities with LOS.

## E2E Smoke (Optional)
- Bot detects forward obstacles and avoids them.
- Bot does not react to occluded threats behind walls.

## Fixtures & Determinism
- Use synthetic blocks and mock raycast results.
- Fixed yaw/pitch and seed for any simulated world data.

## Flake Controls
- No retries; deterministic mocks.
- Timeouts bounded and measured in tests.
