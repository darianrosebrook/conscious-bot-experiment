# Change Impact Map: COG-LOG-1001

## Touched Modules
- `packages/cognition/src/server.ts`
- Potentially `packages/cognition/src/server-utils/*` (if adding log helper)

## Behavior
- Logging output only; no API or business logic changes.

## Data/Migrations
- None.

## Roll-forward
- Deploy as normal; log format changes are backward compatible.

## Rollback
- Revert logging changes in cognition server.

## Contracts
- No OpenAPI/GraphQL/Proto/Pact changes.
