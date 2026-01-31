# Change Impact Map: FEAT-3071

## Modules
- `packages/planning/src/modular-server.ts`: executable dispatch rule and step normalization
- `packages/planning/src/modules/leaf-arg-contracts.ts`: fallback plan generation
- `packages/planning/src/modules/__tests__/leaf-arg-contracts.test.ts`: updated expectations
- `packages/planning/README.md`: execution rule documentation
- `packages/minecraft-interface/src/bot-adapter.ts`: non-blocking cognition posts

## Dependencies
- Minecraft leaf executor must accept `dig_block` with `blockType`
- Planning executor uses strict leaf arg validation

## Roll-forward Strategy
- Deploy with updated executor rule; monitor for blockedReason spikes

## Rollback Strategy
- Reintroduce authority gate if untrusted steps execute unexpectedly

## Operational Notes
- Watch logs for `invalid-args` and `no-executable-plan` increases
