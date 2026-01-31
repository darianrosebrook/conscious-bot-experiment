# Change Impact Map: NAV-2001

## Touched modules
- `packages/minecraft-interface/src/action-translator.ts`
- `packages/minecraft-interface/src/plan-executor.ts`
- `packages/minecraft-interface/src/threat-perception-manager.ts`
- (optional) `packages/minecraft-interface/src/navigation-bridge.ts`

## Tests
- Add unit tests under `packages/minecraft-interface/src/__tests__/` (new).

## Migrations
- None

## Roll-forward
- Deploy code changes; verify reduced log volume.

## Rollback
- Revert commits; restore previous log behavior.
