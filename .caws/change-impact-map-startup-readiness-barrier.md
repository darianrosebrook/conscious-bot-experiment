# Change Impact Map: SYS-2401 Startup Readiness Barrier

## Touched Modules
- scripts/start.js (readiness broadcast)
- packages/planning/src/modular-server.ts (executor start gate)
- packages/planning/src/world-state/world-state-manager.ts (poll gate)
- packages/planning/src/modules/planning-endpoints.ts (readiness endpoint)
- packages/minecraft-interface/src/server.ts (autonomous loop gate)
- packages/world/src/server.ts (polling gate + readiness endpoint)
- packages/core/src/server.ts (readiness endpoint)
- packages/memory/src/server.ts (readiness endpoint)
- packages/cognition/src/server.ts (readiness endpoint)

## Runtime Behavior
- Startup waits for health checks, then signals readiness.
- Planning + world + minecraft-interface delay periodic loops until ready.

## Roll-forward
- Deploy with readiness enabled by default in start script.

## Rollback
- Set SYSTEM_READY_ON_BOOT=1 to bypass gating.
- Revert readiness endpoint changes.
