# E2E Bundle Artifacts

This directory contains golden bundle artifacts from solver-class E2E tests.

## Committed Artifacts

- `e2e-wooden-pickaxe-bundle.json` — Bundle from `wooden_pickaxe` solve against a live Sterling backend. Used for determinism verification: two runs should produce identical `stepsDigest` and `input.*Hash` fields.

## Regeneration

```bash
# Start Sterling server
cd /path/to/sterling
python scripts/utils/sterling_unified_server.py &

# Run E2E test (generates artifact)
cd /path/to/conscious-bot
STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/solver-class-e2e.test.ts
```

## Verification Criteria

After regeneration, verify:
1. **Deterministic hashes**: Run twice. `stepsDigest`, `definitionHash`, `initialStateHash`, `goalHash` must be identical across runs.
2. **Content-addressed bundleId**: `bundleId` format is `minecraft.tool_progression:<16-hex-chars>`.
3. **Compat report**: `compatReport.valid === true`, `issues === []`.
4. **searchHealth presence**: After Python instrumentation (P0.4), `output.searchHealth` should be present with `searchHealthVersion: 1`.

## Nondeterministic Fields

These fields vary between runs and are excluded from `bundleHash`:
- `timestamp` — bundle creation time
- `compatReport.checkedAt` — lint time
- `output.searchStats.durationMs` — wall-clock solve duration
- `output.searchStats.totalNodes` — may vary if Sterling's learning weights differ
- `output.planId` — contains timestamp in hash

## CI Stance

E2E tests are gated behind `STERLING_E2E=1` and require a running Sterling server. Current stance: **local-only execution**.

Blocking follow-up: CI integration requires a Sterling Docker container or service. Until then, evidence is the committed artifact from local runs.

To verify locally:
```bash
STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/solver-class-e2e.test.ts
```
