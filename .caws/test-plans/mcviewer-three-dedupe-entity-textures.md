# Test Plan: MCVIEW-103 — Three.js Dedupe + Entity Textures

## Unit
- Webpack config resolves `three` to a single alias path.
- Entity name normalization strips `minecraft:` prefix.
- Entity texture URL resolves through `/mc-assets/entity/:version/...`.
- Unknown entity types map to fallback models.

## Integration
- Load viewer, confirm console has no "Multiple instances of Three.js" warning.
- Spawn/observe entities: verify `/mc-assets/entity/:version/...` requests return 200 and models render textured.

## E2E Smoke
- Open viewer, verify common mobs (e.g., bee, bat, cod) render with textures.

## Flake Controls
- Hard reload before validation.
- Observe 60s after load for warnings.
