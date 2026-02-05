# Change Impact Map: MCVIEW-101

## Touched Modules
- packages/minecraft-interface/scripts/rebuild-prismarine-viewer.cjs
- node_modules/prismarine-viewer/webpack.config.js (via patch/rebuild)
- node_modules/prismarine-viewer/public/worker.js (generated)

## Expected Behavior Changes
- Worker bundle rebuilt and includes minecraft-data for 1.21.9.
- Worker initialization no longer throws for 1.21.9.
- Terrain meshing resumes.

## Roll-forward / Rollback
- Roll-forward: rebuild prismarine-viewer bundles (index.js + worker.js).
- Rollback: revert rebuild script + worker bundle, temporarily pin viewer to 1.21.4.

## Risks
- Bundler polyfill changes could affect worker size/perf.
- Worker rebuild failures could break postinstall.
