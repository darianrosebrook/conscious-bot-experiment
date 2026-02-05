# Test Plan: MCVIEW-102 — Shader Color Redefinition Fix

## Unit
- Validate animated vertex shader source does not declare `attribute vec3 color` explicitly.
- Validate ShaderMaterial still sets `vertexColors: true`.

## Integration
- Load prismarine viewer with MC 1.21.9.
- Confirm console has no shader compile error mentioning `color` redefinition.
- Confirm no `WebGL: INVALID_OPERATION: useProgram: program not valid` spam after load.

## E2E Smoke
- Open viewer, wait for chunk load, verify terrain is visible.
- Observe animated water/lava/fire for a few seconds to confirm animation still runs.

## Data/Fixtures
- Use existing blockstates and texture atlas for 1.21.9.

## Flake Controls
- Clear cache / hard reload before the run.
- Limit observation to first 60s after load.
