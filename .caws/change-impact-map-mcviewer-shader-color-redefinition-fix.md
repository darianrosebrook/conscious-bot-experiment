# Change Impact Map: MCVIEW-102 — Shader Color Redefinition Fix

## Touched Modules
- packages/minecraft-interface/src/prismarine-viewer-src/animated-material-client.js
- packages/minecraft-interface/scripts/rebuild-prismarine-viewer.cjs (bundle rebuild only)

## Runtime/Build Impact
- Viewer bundle needs rebuild to propagate shader changes.
- No worker changes expected.

## Data/Migrations
- None.

## Roll-forward / Rollback
- Roll-forward: rebuild viewer bundle and redeploy static assets.
- Rollback: revert shader change and rebuild bundles.
