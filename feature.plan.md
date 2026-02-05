# Feature Plan: MCVIEW-103 — Three.js Dedupe + Entity Textures

## Design Sketch
- Webpack resolves all `three` imports to a single path to avoid duplicate globals.
- Normalize entity names (strip `minecraft:`) before entity lookup.
- Rebuild viewer bundle and verify warnings/textures.

## Test Matrix
- Unit:
  - webpack alias for `three` is set
  - entity name normalization applied
- Integration:
  - no multiple-Three.js warning
  - entity textures render
- E2E Smoke:
  - observe textured entities in viewer

## Data Plan
- Use existing prismarine-viewer public textures.

## Observability Plan
- Console warning check for duplicate Three.js.
- Log missing entity texture names if encountered.
