# Test Plan: MCVIEW-101 — Worker Bundle Fix for 1.21.9

## Unit
- Validate rebuild script selects both index.js and worker.js bundles.
- Validate webpack config contains required polyfills (assert) for worker build.
- Validate version list includes 1.21.9 in bundled minecraft-data.

## Contract
- Health endpoint remains compatible (minecraft-interface-health.yaml).

## Integration
- Start viewer with version 1.21.9 and confirm:
  - worker initializes without error
  - geometry messages emitted
  - terrain renders (no pink boxes for terrain)

## E2E Smoke
- Dashboard viewer loads and shows terrain for 1.21.9 within 10s of connection.

## Data / Fixtures
- Use existing 1.21.9 asset pipeline outputs.
- Use local viewer with cached assets under packages/minecraft-interface/.asset-cache.

## Flake Controls
- Disable retries; if worker init failure occurs, log version and worker.js hash.

## Acceptance Coverage
- A1: Unit + integration log assertion (no 'Do not have data for 1.21.9').
- A2: Integration: geometry messages observed.
- A3: Unit: rebuild artifact timestamp/hash update.
- A4: Regression: 1.21.4 initialization.
