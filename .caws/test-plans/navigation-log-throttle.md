# Test Plan: NAV-2001 Navigation + Perception Log Throttling

## Scope
Verify navigation gating, debounce behavior, and perception log throttling without changing navigation success semantics.

## Unit
- ActionTranslator: debounce prevents duplicate navigate calls within window.
- ActionTranslator: gating prevents navigateTo when isNavigating is true.
- ThreatPerceptionManager: LOS log throttle aggregates per entity/window.

## Integration
- PlanExecutor: already-navigating error triggers backoff and does not tight-loop.

## E2E smoke
- Manual run: ensure navigation still completes and log volume is reduced in console.

## Fixtures / Data
- Mock Bot with pathfinder stub.
- Fake NavigationBridge status.

## Flake controls
- Deterministic clocks via injected time (Date.now shim or clock helper).
