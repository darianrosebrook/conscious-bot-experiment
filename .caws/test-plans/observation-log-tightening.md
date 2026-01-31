# Test Plan: Observation Log Tightening (OBS-2402)

## Unit
- ThreatPerception LOS logs throttle per entity/window [A1]
- Water navigation summary logs emit once per strategy window [A2]
- Verbose entity metadata dumps suppressed when OBSERVATION_LOG_DEBUG != 1 [A3]

## Integration
- Run bot in water with stable strategy; confirm summary log rate stays bounded
- Trigger repeated LOS checks; confirm aggregated/suppressed logs

## E2E (optional)
- 30s log capture and count repeated observation patterns

## Data/Fixtures
- Synthetic bot state with repeated LOS checks
- Water navigation state with stable strategy

## Flake Controls
- Use deterministic throttle windows in tests
