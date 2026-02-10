# Autonomy Pipeline Hardening — Closeout

**Scope**: Blocked-reason taxonomy, test hermeticity, cross-repo fixture contract, exploration trace, executor health
**Date**: 2026-02-10
**Commits**: `1ab4561` (hardening), `6ee4d16` (Sterling reframe)

---

## A. What Changed

### INV-1: Blocked reason taxonomy is exhaustive and classified

- **Before**: `blocked_intent_resolution_unavailable` was a catch-all that masked 6 distinct failure modes. Unknown reasons silently became unclassified.
- **After**: 29 reasons in `BLOCKED_REASON_REGISTRY` (task-block-evaluator.ts:41-81), each with explicit `classification` (transient / contract_broken / terminal / executor) and `ttlPolicy`. Unknown `blocked_*` reasons fail-fast; unknown non-blocked reasons are retried.
- **Failure mode prevented**: Typo in a new blocked reason silently compiles and gets default-retried forever instead of being classified.
- **Evidence**: `blocked-reason-registry.test.ts` (10 suites), `structural-invariants.test.ts` (5 suites), `blocked-reason-exhaustive-usage.test.ts` (source-scanning test).

### INV-2: No unit test reaches the network

- **Before**: Tests could silently make outbound HTTP requests, causing non-hermetic results and flaky CI.
- **After**: `vitest.setup.ts` blocks `globalThis.fetch` by default. Tests that need network must explicitly opt in.
- **Failure mode prevented**: Test passes locally (Sterling running) but fails in CI (Sterling absent).
- **Evidence**: `vitest.setup.ts` in planning package, all sterling/__tests__ pass without Sterling running.

### INV-3: Bootstrap lowering output is fixture-locked across repos

- **Before**: Sterling's `expand_by_digest_v1.py` and Planning's action mapper could drift independently, breaking the autonomy pipeline at runtime.
- **After**: `bootstrap-lowering-v1.json` is a shared fixture consumed by both `cross-boundary-bootstrap.test.ts` (TypeScript) and `test_expand_by_digest_v1.py` (Python). Changes to either side that break the contract fail the other side's tests.
- **Failure mode prevented**: Sterling changes step shape → Planning's action mapper silently produces null → bot does nothing.
- **Evidence**: `cross-boundary-bootstrap.test.ts` (9 suites), `tests/fixtures/bootstrap-lowering-v1.json` in Sterling repo.

### INV-4: Exploration fallback records audit-grade trace

- **Before**: When Sterling sends `target='exploration_target'`, the exploration fallback fired but produced no trace metadata, making debugging impossible.
- **After**: `explorationTrace` includes `seedInput`, `seed`, `retryCount`, `chosenPos`, `botPos`, `distance`. Loop-avoidance ring buffer prevents "stuck jitter."
- **Failure mode prevented**: Bot loops between two positions with no diagnostic evidence.
- **Evidence**: `exploration-seed.test.ts` (deterministic seed tests), `action-translator.ts:2518-2590`.

### INV-5: Executor startup state is observable

- **Before**: No way to distinguish "executor hasn't started yet" from "executor started and is idle."
- **After**: `/executor/health` endpoint exposes `executorStartState` (starting → running), `uptimeMs`, and task/episode counts.
- **Failure mode prevented**: Operators see "no tasks" and assume a bug when the system is still bootstrapping.
- **Evidence**: `modular-server.ts` health endpoint, observable via `curl /executor/health`.

### INV-6: Goal item type safety

- **Before**: `goalItem ?? ''` pattern masked missing requirement.item with empty string, causing silent failures downstream.
- **After**: Control-flow narrowing with explicit `blocked_crafting_no_goal_item` reason when item is genuinely missing.
- **Failure mode prevented**: Crafting solver receives empty string as goal, returns confusing "no solution found."
- **Evidence**: `task-integration.ts` crafting context block, tested in `expansion-retry.test.ts`.

---

## B. Invariants (must not regress)

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| INV-1 | Every `blocked_*` reason used at runtime is registered and classified | `blocked-reason-exhaustive-usage.test.ts` |
| INV-2 | No unit test reaches the network | `vitest.setup.ts` fetch blockade |
| INV-3 | Bootstrap lowering output is fixture-locked across repos | `cross-boundary-bootstrap.test.ts` + Sterling fixture |
| INV-4 | Exploration fallback records `explorationTrace` when used | `exploration-seed.test.ts` |
| INV-5 | `/executor/health` returns startup state machine | Manual smoke check |
| INV-6 | Missing goal item produces `blocked_crafting_no_goal_item`, not empty string | `expansion-retry.test.ts` |

---

## C. Cross-Repo Fixture Contract

### Fixture location

| Repo | Path |
|------|------|
| conscious-bot | `packages/planning/src/server/__tests__/fixtures/bootstrap-lowering-v1.json` |
| sterling | `tests/fixtures/bootstrap-lowering-v1.json` |

### How to bump the fixture

1. Edit the fixture in **one** repo.
2. Copy the file to the **other** repo (files must be byte-identical).
3. If adding new fields, bump `schema_version` (e.g., `bootstrap_lowering_v2`).
4. Run tests in both repos:
   - conscious-bot: `npx vitest run packages/planning/src/server/__tests__/cross-boundary-bootstrap.test.ts`
   - sterling: `python -m pytest tests/unit/test_expand_by_digest_v1.py -v`
5. Both must pass before merging either side.

### Shape contract

```
schema_version: string
required_step_keys: ["leaf", "args"]
required_args_keys: ["lowered_from", "theme"]
cases: Record<string, { lemma: string; theme: string; steps: Array<{ leaf: string; args: Record<string, unknown> }> }>
```

---

## D. Known Naming Mismatches

These are `blocked_*` literals used outside the expansion registry taxonomy. They are in separate type-level taxonomies and do NOT need to be in `BLOCKED_REASON_REGISTRY`:

| Literal | Taxonomy | Location | Registry equivalent |
|---------|----------|----------|-------------------|
| `blocked_guard` | `DecisionReason` | thought-to-task-converter.ts | N/A (conversion filter, not expansion) |
| `blocked_not_eligible` | `DecisionReason` | thought-to-task-converter.ts | N/A |
| `blocked_manual_pause` | `HoldAction` | goal-hold-manager.ts | N/A (manual lifecycle) |
| `blocked_on_prereq` | `IdleReason` | modular-server.ts, keep-alive-integration.ts | `waiting_on_prereq` in registry (different scope) |
| `blocked_no_action` | fallback | keep-alive-integration.ts | `no_mapped_action` in registry (same semantic) |

---

## E. Remaining Work

### P0 — Do next

- [ ] **Blocked-reason exhaustive usage test** (closes typo→unclassified hole)
- [ ] **Payload-equivalence snapshot** around exact request sent to Sterling resolver (proves observability changes don't mutate semantic payload)
- [ ] Commit Sterling-side fixture + schema version changes as separate PR

### P1

- [ ] BundleId determinism tests (hash stability, order invariance)
- [ ] Solver-layer unit tests asserting `solveMeta.bundles` shape (per CLAUDE.md R1)
- [ ] Remove `packages/core/temp/` directory (stale compiled JS)
- [ ] Container-leaves null returns: replace `return null` in catch blocks with explicit error types to distinguish "not found" from "operation failed" (`container-leaves.ts:90, 150, 187`)
- [ ] Sterling registry fallback: 4 instances in `certification.py` silently degrade to old hash method — replace with explicit error when registry fails

### P2

- [ ] One live-backend E2E test gated behind `STERLING_E2E=1` (per CLAUDE.md R2)
- [ ] Dashboard panel for `/executor/health`
- [ ] Delete or implement `m2-integration.test.ts` (currently skip'd since initial commit)
- [ ] Server banner: `getServerBanner()` swallows all errors — golden-run path should fail visibly when Sterling is unavailable (`sterling-reasoning-service.ts:260-267`)
- [ ] Audit `?? ''` patterns in solver/intent paths for the goalItem-class bug (`task-management-handler.ts:112, 187, 247`)

### P3

- [ ] Stuck-task watchdog (runtime, orthogonal to TTL work)
- [ ] CI wiring: planning unit tests + sterling unit tests + fixture checks
- [ ] Remove episode-classification legacy aliases after 2026-03-01 (3 instances)
- [ ] Remove solveJoinKeys migration compat after 2026-02-15 (2 instances)
- [ ] Add DomainDeclarationV1 validation at `sterling-reasoning-service.ts:472` cast boundary
- [ ] Replace mock LLM implementations in `llm-skill-composer.ts:308, 663` with proper gating

---

## F. Commands

```bash
# Unit tests (sterling + planning)
npx vitest run packages/planning/src/sterling/__tests__
npx vitest run packages/planning/src/server/__tests__

# Cross-boundary contract
npx vitest run packages/planning/src/server/__tests__/cross-boundary-bootstrap.test.ts

# Blocked-reason registry
npx vitest run packages/planning/src/server/__tests__/blocked-reason-registry.test.ts

# Structural invariants
npx vitest run packages/planning/src/server/__tests__/structural-invariants.test.ts

# Typecheck
npx tsc --noEmit
```
