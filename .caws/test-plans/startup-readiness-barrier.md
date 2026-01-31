# Test Plan: Startup Readiness Barrier (SYS-2401)

## Unit
- Readiness gate flips from false to true on POST /system/ready [A1]
- Planning executor does not start when readiness is false [A2]
- World polling is skipped when readiness is false [A3]
- Minecraft interface delays autonomous loop until readiness is true [A4]

## Integration
- `scripts/start.js` waits for health checks, then POSTs /system/ready to ready-enabled services [A1]
- Repeated /system/ready calls are idempotent (no duplicate executor intervals) [INV]

## E2E (optional)
- Start full stack, verify no autonomous executor logs before readiness broadcast [A2]
- Observe readiness broadcast logs after all services are healthy [A1]

## Data/Fixtures
- Use local services; no external calls required.

## Flake Controls
- Use deterministic readiness gate; avoid timing-sensitive assertions by checking log presence only after broadcast.
