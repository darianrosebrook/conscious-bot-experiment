# Test Plan: COG-LOG-1001 Logging Coherence

## Scope
Logging refactor in `packages/cognition/src/server.ts` only. No behavioral changes.

## Unit
- Verify log helper formats fields consistently (subsystem/event/tags) [A1, A3].
- Verify error logging path includes error message and subsystem [A3].

## Integration
- Start cognition server and trigger a sample request; confirm middleware log emits operationType and success flag [A2].
- Trigger thought generation and ensure structured logs are emitted (no emoji prefixes) [A1].

## E2E Smoke
- Not required (no UI changes). Documented N/A.

## A11y
- Not required (no UI changes). Documented N/A.

## Mutation
- Not required for Tier 3; no new logic beyond logging helpers. Documented N/A.

## Fixtures/Data
- Use existing mock state in server; no new fixtures.

## Flake Controls
- Avoid timing-sensitive assertions; assert presence of required fields rather than exact timestamps.
