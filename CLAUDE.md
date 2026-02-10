# claude.md — Evidence-First Review Contract (Sterling / Planning)

## Why this file exists

Our current test posture produces a lot of “green” without proving that the new observability layer (SolveBundle, Compat Linter, SearchHealth parsing) is exercised end-to-end. This document is a reviewer instruction set: when you review PRs in this area, require *evidence artifacts* and *contract snapshots*, not just “tests pass.”

Scope: `packages/planning/src/sterling/**`, `packages/planning/src/modules/**`, and solver wiring in `minecraft-*-solver.ts`.

Non-goal: rewriting solver logic or changing Sterling backend semantics. Changes should be additive unless explicitly stated.

---

## Reviewer stance

Do not accept “all tests pass” as evidence for observability. Passing tests can still bypass the new code paths.

You must ask:

1) Did any test actually execute the solver code that populates `solveMeta.bundles`?
2) Did any test run a solver class against a live Sterling backend and validate the bundle output?
3) Did we prove that outbound solve payloads are unchanged (or intentionally changed) using a payload-equivalence snapshot?

If any answer is “no,” provide the missing evidence before approval.

---

## Hard requirements for merging observability work

### R1. Solver-layer execution evidence (unit-level)

At least one test must call each solver’s public solve method and assert that `solveMeta.bundles` exists with correct shape.

Minimum assertions per solver:

- `minecraft-crafting-solver.ts`: after a mocked solve returning `solutionFound: true`, verify:
  - `result.solveMeta?.bundles.length === 1`
  - bundle has `input.definitionHash`, `input.initialStateHash`, `input.goalHash`
  - bundle has `output.stepsDigest`, `output.solved === true`, `output.planId` equals extracted planId
  - `compatReport.valid === true` (or expected issues if testing the linter)

- `minecraft-building-solver.ts`: after a mocked “modules-style” solve, verify:
  - `result.solveMeta?.bundles.length === 1`
  - `compatReport.ruleCount === 0` and `compatReport.valid === true`
  - definition hashing is present (do not accept “empty definition” bundles)

- `minecraft-tool-progression-solver.ts`: after a mocked decomposed run, verify:
  - `result.solveMeta?.bundles.length === number_of_tiers_solved`
  - each tier bundle has distinct `goalHash` and distinct `stepsDigest`
  - each tier bundle’s compat report is present and `valid === true`

Important: these tests must drive the solver down the “solved” path. If mocks return `solutionFound: false` and the solver early-returns, the bundle wiring is not proven.

### R2. Live-backend end-to-end evidence (integration-level)

At least one integration test must instantiate the actual solver class and call it against the Sterling backend (WebSocket server), then assert on `solveMeta`.

This is different from the existing raw-WebSocket integration tests, which bypass TypeScript solver code entirely.

**Starting Sterling:** Sterling lives at `../sterling` (sibling directory). Start it before running E2E tests:

```bash
cd ../sterling && source .venv/bin/activate && python scripts/utils/sterling_unified_server.py &
# Wait for "Waiting for connections..." then return to conscious-bot
cd ../conscious-bot
```

Or use the E2E script which starts Sterling automatically: `bash scripts/run-e2e.sh`

Minimum required integration test:

- Name: `sterling/__tests__/tool-progression-solver-e2e.test.ts` (or similar)
- Setup: create a real `SterlingReasoningService` configured to the local WS URL
- Execute: `MinecraftToolProgressionSolver.solveToolProgression(...)`
- Assert:
  - `result.solveMeta?.bundles.length >= 1`
  - bundle input hashes are non-empty strings
  - bundle output `stepsDigest` matches the returned steps (recompute hash locally and compare)
  - bundle output `durationMs`, `solutionPathLength`, `totalNodes` match (or are consistent with) backend-provided metrics
  - if `searchHealth` is absent, assert it's `undefined` (not present), and this is an expected pre-Python-change behavior

These tests are gated behind `STERLING_E2E=1` so they don't fail in environments where Sterling hasn't been started yet. To run them:

### R3. Payload-equivalence regression snapshot (contract-level)

Add a test that captures the exact outbound solve payload sent to `sterlingService.solve()` and asserts that it is canonicalized-equal to a committed snapshot.

Goal: prove that observability wiring did not mutate what Sterling sees.

Minimum:

- For crafting and tool progression, intercept `sterlingService.solve` mock calls.
- Snapshot the payload (rules, inventory, goal, nearbyBlocks, domain, executionMode/solverId if included).
- Assert against a stable snapshot using canonicalized JSON (sorted keys, stable ordering).
- If payload changes are intentional, the snapshot update must be accompanied by a written rationale in the PR description.

### R4. Deterministic bundle ID contract

Bundle identity must be content-addressed (not timestamp-addressed). Evidence required:

- unit tests show: same inputs/outputs produce same bundleId
- nondeterministic fields (`timestamp`, `checkedAt`) are excluded from the bundleId hash
- changing rule order does not change `definitionHash` if rules are semantically identical (hashDefinition sorts a copy)
- changing step order *does* change `stepsDigest`

---

## What reviewers should ask for in PR descriptions

Every PR that modifies solver wiring or evidence infrastructure must include:

1) A short “Evidence added” section that names the specific tests that exercise:
   - solver-layer `solveMeta`
   - live-backend solver e2e
   - payload-equivalence snapshot

2) One concrete sample SolveBundle JSON excerpt (small; redact noisy arrays) showing:
   - `input` hashes
   - `output.stepsDigest`
   - `compatReport.valid`
   - `output.searchHealth` presence/absence (explicitly noted)

3) If the PR changes the linter, include:
   - the new issue codes
   - an example rule that triggers each new code

“tests pass” without these artifacts is insufficient.

---

## Evidence-first checklist for reviewers

Use this checklist during review:

- [ ] Do we have a unit test that asserts `solveMeta.bundles` for each solver?
- [ ] Do we have at least one solver-class integration test against the live backend?
- [ ] Do we have a payload snapshot test proving outbound payload stability?
- [ ] Are bundle IDs content-addressed and deterministic?
- [ ] Is canonicalization contract explicitly tested for edge cases (NaN, -0, undefined)?
- [ ] Are linter checks aligned with real backend hazards (mine requires bypass, place parsing quirks)?
- [ ] Are search health metrics treated as optional until Python emits them?
- [ ] If any behavior changed, is it documented as intentional and tested?

---

## Known gaps and how to treat them

- `searchHealth` is currently dead until Python emits it. That is acceptable only if:
  - parser returns `undefined` safely
  - there is a tracked follow-up issue/PR for Python emission
  - e2e tests explicitly assert `undefined` until the Python change lands

- Some test suites in this repo fail pre-existing unrelated tests. That is acceptable only if:
  - PR includes a scoped test run command that demonstrates all `sterling/**` and `planning/**` tests pass
  - PR explicitly lists the unrelated failing suites by path

---

## Commands reviewers can run

Unit (sterling/planning only):
- `npx vitest run packages/planning/src/sterling/__tests__`
- `npx vitest run packages/planning/src/modules/__tests__`

Typecheck:
- `npx tsc --noEmit`

E2E (start Sterling first, then run with the gate enabled):
```bash
# Terminal 1: start Sterling (lives at ../sterling — we own it)
cd ../sterling && source .venv/bin/activate && python scripts/utils/sterling_unified_server.py

# Terminal 2: run E2E tests
STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/tool-progression-solver-e2e.test.ts
STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/solver-class-e2e.test.ts
STERLING_E2E=1 npx vitest run packages/planning/src/sterling/__tests__/performance-baseline-e2e.test.ts
```

Or use the all-in-one script that starts Sterling automatically:
```bash
bash scripts/run-e2e.sh
```

---

## Style constraints

- Prefer additive changes.
- If adding a check that can block development, gate it behind strict modes or test-only assertions.
- Evidence artifacts should be small and stable; avoid snapshotting huge rule arrays unless canonicalized and minimized.

