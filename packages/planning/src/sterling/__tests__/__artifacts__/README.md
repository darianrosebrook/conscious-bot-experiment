# E2E Bundle Artifacts

This directory contains golden bundle artifacts from solver-class E2E tests.

## Committed Artifacts

- `e2e-wooden-pickaxe-bundle.json` — Bundle from `wooden_pickaxe` solve against a live Sterling backend. Used for determinism verification: two runs should produce identical `stepsDigest` and `input.*Hash` fields.

### Performance baselines (A.5)

- `perf-baseline-stick.json` — Search metrics for stick crafting via **raw WebSocket** (minimal 3-rule operator set, not MinecraftCraftingSolver). Useful as a floor/health check, not directly comparable to solver-class baselines due to different client pathway and operator count.
- `perf-baseline-wooden-pickaxe.json` — Search metrics for wooden_pickaxe via **MinecraftToolProgressionSolver** (full solver-class bundle pipeline).
- `perf-baseline-stone-pickaxe.json` — Per-tier search metrics for stone_pickaxe (wooden_tier + stone_tier) via **MinecraftToolProgressionSolver**.
- `perf-convergence-stick.json` — Learning stability check: solve1 vs solve2 node counts after episode report (raw WebSocket pathway).
- `perf-convergence-wooden-pickaxe.json` — Learning stability check for wooden_pickaxe (solver-class pathway).
- `perf-convergence-stone-pickaxe.json` — Per-tier learning stability check for stone_pickaxe.

#### Interpreting convergence artifacts

Convergence artifacts demonstrate **stability** (no regression after episode reporting), not **efficacy** (learning improves search). A `nodesRatio` of exactly 1.0 means the episode report had no observable effect on the subsequent solve — the search is deterministic and the learning update did not alter tie-breaking or node ordering for these problems. This is the expected baseline behavior; learning efficacy evidence requires a separate learning-sensitive benchmark with problems that have multiple near-tied plans.

#### Interpreting heuristic metrics

For solver-class items (wooden_pickaxe, stone_pickaxe), the baselines show `hMin=0, hMax=1, pctSameH≈0.98–0.995`. This indicates the heuristic has insufficient resolution relative to the goal representation — it effectively returns a binary "goal satisfied / not satisfied" signal, so A\* degrades toward uniform-cost search. The solver succeeds because problems are small enough for brute-force expansion within the node budget. Improving heuristic resolution (e.g., dependency-aware cost lower bounds) is the primary lever for scaling to larger items. A successful heuristic improvement should show up as reduced `nodesExpanded`, increased `hVariance`, and reduced `frontierPeak`, while `solutionPathLength` stays the same or improves.

The stick baseline shows wider heuristic range (`hMin=0, hMax=4, hVariance=3.0`) because it operates on a 3-rule operator set with quantity-structured goals, not because raw WebSocket gets a fundamentally different heuristic. With only 4 nodes expanded, the heuristic statistics are too small a sample to be meaningful as a quality comparator.

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
