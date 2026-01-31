# Test Plan: SAFE-2002 Safety + Water Log Throttling

## Scope
Verify emergency response, flee, and water navigation logs are throttled and cooldowned.

## Unit
- AutomaticSafetyMonitor: repeated hostile triggers are cooldowned.
- AutomaticSafetyMonitor: water navigation logs throttled.

## Integration
- Safety monitor loop does not spam logs under repeated threats.

## Fixtures / Data
- Mock bot with hostile entity at close range.
- Simulated water environment state.

## Flake controls
- Deterministic clock injection or Date.now shim in tests.
