# Change Impact Map — PLN-418 Abort/Timeout Loop Hardening

## Touched Modules
- `packages/planning/src/world-state/world-state-manager.ts`
- `packages/planning/src/modules/mc-client.ts`
- `packages/planning/src/modular-server.ts`
- `packages/planning/src/modules/__tests__/mc-client.test.ts` (new)
- `packages/planning/src/world-state/__tests__/world-state-manager.test.ts` (new)

## Behavior Changes
- World-state polling is single-flight; overlapping calls are skipped.
- Bot breaker does not open on timeout-only health check failures.
- mc-client timeouts always clear and timeout failures do not retry.

## Risks
- If timeouts are frequent, health checks may return false more often (breaker remains closed).
- Single-flight poll could reduce update frequency if `/state` is consistently slow.

## Rollback Plan
- Revert in-flight guard, breaker gating, and timeout retry changes.
