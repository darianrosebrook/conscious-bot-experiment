# E2E Bundle Artifacts

This directory contains golden bundle artifacts from solver-class E2E tests.

## Committed Artifacts

- `e2e-wooden-pickaxe-bundle.json` — Bundle from `wooden_pickaxe` solve against a live Sterling backend. Used for determinism verification: two runs should produce identical `stepsDigest` and `input.*Hash` fields.

### Performance baselines (A.5)

- `perf-baseline-stick.json` — Search metrics for stick crafting (nodesExpanded, frontierPeak, terminationReason, solutionPathLength, branchingEstimate).
- `perf-baseline-wooden-pickaxe.json` — Search metrics for wooden_pickaxe tool progression.
- `perf-baseline-stone-pickaxe.json` — Per-tier search metrics for stone_pickaxe (wooden_tier + stone_tier).
- `perf-convergence-stick.json` — Learning convergence proof: solve1 vs solve2 node counts after episode report.
- `perf-convergence-wooden-pickaxe.json` — Learning convergence for wooden_pickaxe.
- `perf-convergence-stone-pickaxe.json` — Per-tier learning convergence for stone_pickaxe.

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
# Solver-class E2E (bundle evidence)
STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/solver-class-e2e.test.ts

# Performance baselines (A.5)
STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/performance-baseline-e2e.test.ts
```
