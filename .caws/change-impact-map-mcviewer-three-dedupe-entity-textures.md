# Change Impact Map: MCVIEW-103 — Three.js Dedupe + Entity Textures

## Touched Modules
- packages/minecraft-interface/src/prismarine-viewer-src/webpack.config.js
- packages/minecraft-interface/src/prismarine-viewer-src/entities.js
- packages/minecraft-interface/scripts/rebuild-prismarine-viewer.cjs (bundle rebuild)

## Runtime/Build Impact
- Viewer bundle rebuilt to dedupe Three.js.
- Entity mesh creation uses normalized names.

## Data/Migrations
- None.

## Roll-forward / Rollback
- Roll-forward: rebuild viewer bundle and reload.
- Rollback: revert alias + normalization and rebuild bundles.
