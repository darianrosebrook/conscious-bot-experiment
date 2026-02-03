# Join Keys Pipeline Hardening

**Status**: Implemented
**Date**: 2026-02-02
**Related**: Commit A (per-domain join keys wiring)

## Overview

This document describes the hardening work done on the join keys pipeline after Commit A introduced per-domain storage for `SolveJoinKeys`. The work addresses 6 identified footguns that could cause operational issues or make future changes difficult.

## Context: What Are Join Keys?

Join keys (`SolveJoinKeys`) are identity tokens stored at solve-time and consumed at report-time to construct an audit trail linking:

```
traceBundleHash (Sterling) → bundleHash (CB) → episodeHash (report)
```

This enables:
- Regression detection when plans change
- Episode attribution to specific solve runs
- Cross-system identity correlation

## Problem Statement

Commit A introduced per-domain join keys storage:
- `buildingSolveJoinKeys`
- `craftingSolveJoinKeys`
- `toolProgressionSolveJoinKeys`
- `acquisitionSolveJoinKeys`

While this prevents cross-solver clobbering, review identified 6 footguns:

1. **planId Uniqueness Assumption**: Guard relies on planId being globally unique
2. **Migration Fallback That Never Dies**: Compat paths become permanent
3. **Warning Classification**: Ambiguous "stale keys" warning
4. **Type-Shape Drift**: Linkage construction scattered across code
5. **Test Brittleness**: Tests coupled to exact warning strings
6. **Naming Confusion**: Deprecated field name in compat block

## Solution Summary

### 1. solverId Guard (Cross-Domain Clobber Protection)

**Interface Change** (`solve-bundle-types.ts`):
```typescript
export interface SolveJoinKeys {
  planId: string;
  bundleHash: string;
  traceBundleHash?: string;
  solverId?: string;  // NEW: guards against cross-domain planId collisions
}
```

**Extraction** (`episode-classification.ts`):
```typescript
export function extractSolveJoinKeys(bundle: SolveBundle, planId: string): SolveJoinKeys {
  return {
    planId,
    bundleHash: bundle.bundleHash,
    traceBundleHash: bundle.output.sterlingIdentity?.traceBundleHash,
    solverId: bundle.input.solverId,  // NEW
  };
}
```

**Guard** (`task-integration.ts`):
```typescript
const BUILDING_SOLVER_ID = 'minecraft.building';

const keysForThisPlan = (() => {
  if (!planId || !joinKeys?.planId) return undefined;
  if (joinKeys.planId !== planId) return undefined;
  // If solverId is present, it must match (migration keys lack solverId)
  if (joinKeys.solverId && joinKeys.solverId !== BUILDING_SOLVER_ID) return undefined;
  return joinKeys;
})();
```

### 2. Migration Fallback (Opt-In, Narrowed Scope, Testable)

**Opt-In via Environment Variable**:
```bash
JOIN_KEYS_DEPRECATED_COMPAT=1  # Enable deprecated fallback
DEBUG_JOIN_KEYS_MIGRATION=1    # Enable per-task debug logging
```

**Runtime Functions** (not module-load constants, enables testing without reimport):
```typescript
function isDeprecatedJoinKeysCompatEnabled(): boolean {
  return process.env.JOIN_KEYS_DEPRECATED_COMPAT === '1';
}

function isDebugJoinKeysMigrationEnabled(): boolean {
  return process.env.DEBUG_JOIN_KEYS_MIGRATION === '1';
}
```

**Startup Banner** (emitted at module init when compat enabled):
```
[JoinKeys] Deprecated solveJoinKeys fallback is ENABLED (JOIN_KEYS_DEPRECATED_COMPAT=1). Remove after 2026-02-15.
```

**Narrowed Scope** (task-level checks):
```typescript
function isSafeForDeprecatedFallback(task: Task): boolean {
  if (task.type !== 'building') return false;
  if (!task.metadata.solver?.buildingTemplateId) return false;
  // If any per-domain keys exist, don't use deprecated slot
  if (solver.craftingSolveJoinKeys) return false;
  if (solver.toolProgressionSolveJoinKeys) return false;
  if (solver.acquisitionSolveJoinKeys) return false;
  return true;
}
```

**Shape Sanity Check** (at fallback site):
```typescript
// Require bundleHash presence (core identity field) before accepting deprecated keys
if (deprecated && deprecated.planId === planId && deprecated.bundleHash) {
  joinKeys = deprecated;
  // ...
}
```

**Removal Tracking**:
```typescript
// Issue: [CB-XXX] Remove after 2026-02-15 if no migration logs observed
```

### 3. Warning Classification

Warnings are now explicitly classified:

| Reason | Classification | Rationale |
|--------|----------------|-----------|
| `planId mismatch` | expected under replans | Normal when task is replanned |
| `solverId mismatch` | **unexpected** | Cross-domain clobber or corruption |
| `buildingPlanId missing` | **unexpected** | Data integrity issue |
| `joinKeys.planId missing` | **unexpected** | Data integrity issue |

**Example Output**:
```
[Building] Omitting linkage hashes (expected under replans): planId mismatch (keys.planId=plan-A, buildingPlanId=plan-B)
[Building] Omitting linkage hashes (unexpected): solverId mismatch (got minecraft.crafting)
```

### 4. Linkage Builder Extraction

Single function for linkage construction:
```typescript
function buildEpisodeLinkage(
  joinKeys: { bundleHash?: string; traceBundleHash?: string } | undefined,
  success: boolean,
): EpisodeLinkage {
  return {
    bundleHash: joinKeys?.bundleHash,
    traceBundleHash: joinKeys?.traceBundleHash,
    outcomeClass: success ? 'EXECUTION_SUCCESS' : 'EXECUTION_FAILURE',
  };
}
```

### 5. Bounded Warning Set with Multi-Domain Support (Memory Leak Prevention + Cross-Domain Isolation)

Warning suppression is keyed by `(taskId, domain, reasonCategory)` so:
- More severe conditions (solverId mismatch) aren't masked by earlier benign warnings (planId mismatch)
- Different domains can emit warnings independently without cross-contamination

**Category is determined at the detection site** (not via string matching in the helper) to avoid classification drift if log text is refactored. **Structured context** provides category-specific data for production debugging:

```typescript
type EpisodeDomain = 'building' | 'crafting' | 'tool_progression' | 'acquisition';
type StaleKeysReasonCategory = 'PLANID_MISMATCH' | 'SOLVERID_MISMATCH' | 'MISSING_FIELDS';

/** Structured context for stale keys warnings — category-specific for production debugging */
type StaleKeysContext =
  | { taskId: string; domain: EpisodeDomain; category: 'PLANID_MISMATCH'; severity: string; planId: string; keysPlanId: string }
  | { taskId: string; domain: EpisodeDomain; category: 'SOLVERID_MISMATCH'; severity: string; planId: string | undefined; gotSolverId: string; expectedSolverId: string }
  | { taskId: string; domain: EpisodeDomain; category: 'MISSING_FIELDS'; severity: string; planIdPresent: boolean; keysPlanIdPresent: boolean };

const _warnedStaleKeys = new Set<string>();
const WARNED_STALE_KEYS_MAX = 1000;

// Helper is kept dumb — context passed from detection site
function warnStaleKeysOnce(
  reason: string,
  context: StaleKeysContext,
): void {
  const warnKey = `${context.taskId}:${context.domain}:${context.category}`;
  if (_warnedStaleKeys.has(warnKey)) return;
  if (_warnedStaleKeys.size >= WARNED_STALE_KEYS_MAX) {
    _warnedStaleKeys.clear();
  }
  _warnedStaleKeys.add(warnKey);

  // Capitalize domain for log prefix
  const domainLabel = context.domain.charAt(0).toUpperCase() + context.domain.slice(1).replace('_', ' ');
  console.warn(`[${domainLabel}] Omitting linkage hashes (${context.severity}): ${reason}`, context);
}

/**
 * Select join keys for episode reporting if they match the current plan and solver.
 * Core guard against cross-domain clobber and stale keys from replans.
 */
function selectJoinKeysForPlan(
  planId: string | undefined,
  joinKeys: { planId?: string; solverId?: string; bundleHash?: string; traceBundleHash?: string } | undefined,
  expectedSolverId: string,
): { bundleHash?: string; traceBundleHash?: string } | undefined {
  if (!planId || !joinKeys?.planId) return undefined;
  if (joinKeys.planId !== planId) return undefined;
  if (joinKeys.solverId && joinKeys.solverId !== expectedSolverId) return undefined;
  return joinKeys;
}

// Usage in reporter:
const keysForThisPlan = selectJoinKeysForPlan(planId, joinKeys, SOLVER_IDS.BUILDING);

// At detection site — context determined here with category-specific fields + domain
if (!planId) {
  reason = 'buildingPlanId missing';
  context = {
    taskId: task.id,
    domain: 'building',  // NEW: domain included
    category: 'MISSING_FIELDS',
    severity: 'unexpected',
    planIdPresent: false,
    keysPlanIdPresent: !!joinKeys.planId,
  };
} // etc.

warnStaleKeysOnce(reason, context);
```

This ensures:
- Same task can emit both "planId mismatch" and "solverId mismatch" warnings
- **Different domains can emit warnings independently** (building vs crafting don't mask each other)
- Bounded to 1000 entries, clear-on-overflow
- No unbounded memory growth in long-lived processes
- Category classification cannot drift with log text changes
- Production logs include structured context for debugging (all relevant IDs in one object)
- **Reusable `selectJoinKeysForPlan` helper** for symmetric hardening across domains

### 6. Test Robustness

Tests now assert semantics, not exact strings:
```typescript
// Assert linkage semantics only
expect(linkageArg.bundleHash).toBeUndefined();  // omitted due to stale
expect(linkageArg.outcomeClass).toBe('EXECUTION_SUCCESS');

// Assert warning contains both planIds (semantic check)
const staleWarnings = warnSpy.mock.calls.filter(
  (call) => call[0].includes('plan-A') && call[0].includes('plan-B')
);
expect(staleWarnings.length).toBeGreaterThan(0);
```

## Files Modified

| File | Changes |
|------|---------|
| `packages/planning/src/sterling/solve-bundle-types.ts` | Added `solverId?: string` to `SolveJoinKeys` |
| `packages/planning/src/sterling/episode-classification.ts` | Populate `solverId` from bundle, added tests |
| `packages/planning/src/sterling/solver-ids.ts` | **NEW**: Centralized `SOLVER_IDS` constants for all solvers |
| `packages/planning/src/sterling/minecraft-*-solver.ts` | Import and use `SOLVER_IDS.*` instead of string literals |
| `packages/planning/src/sterling/compat-linter.ts` | Import and use `SOLVER_IDS.*` for solverId checks |
| `packages/planning/src/task-integration.ts` | solverId guard, migration fallback, classified warnings, linkage builder, bounded Set, domain-aware warning key, `selectJoinKeysForPlan` helper |
| `packages/planning/src/task-integration/sterling-planner.ts` | Import and use `SOLVER_IDS.*` for solver registry lookups |
| `packages/planning/src/task-integration/__tests__/task-integration-pipeline.test.ts` | Robust assertions, new test cases |
| `packages/planning/src/sterling/base-domain-solver.ts` | Phase 1 identity field toggle, once-per-solverId observability logging, extended `reportEpisode()` to forward `engineCommitment` and `operatorRegistryHash` behind `STERLING_REPORT_IDENTITY_FIELDS` toggle |
| `packages/planning/src/sterling/episode-classification.ts` | Added `buildEpisodeLinkage()` helper for constructing report payloads with Phase 1 identity fields |
| `packages/planning/src/sterling/__tests__/episode-classification.test.ts` | Tests for `buildEpisodeLinkage()` including Phase 1 identity field forwarding |
| `packages/planning/src/sterling/minecraft-building-solver.ts` | Added Phase 1 identity field observability logging |
| `packages/planning/src/sterling/minecraft-crafting-solver.ts` | Added Phase 1 identity field observability logging |

## Test Coverage

New test cases in `task-integration-pipeline.test.ts`:
1. `solverId mismatch` → hashes omitted, warning classified as "unexpected"
2. `does NOT use deprecated solveJoinKeys when compat is disabled (default)` → verifies compat is off by default
3. `uses deprecated solveJoinKeys when compat is ENABLED` → verifies fallback works when enabled
4. `does NOT use deprecated fallback when other per-domain keys exist` → verifies narrowed scope
5. `buildingPlanId missing` → classified as "unexpected"
6. `planId mismatch` → classified as "expected under replans"

New test cases in `episode-classification.test.ts`:
7. `extracts solverId from bundle input`
8. `solverId is undefined when bundle.input.solverId is undefined`

**Test Pattern for Compat**: Since compat check is a runtime function (not module-load constant), tests can toggle `process.env.JOIN_KEYS_DEPRECATED_COMPAT` at runtime without module reimport gymnastics.

## Verification Commands

```bash
# Run affected tests
npx vitest run packages/planning/src/task-integration/__tests__/task-integration-pipeline.test.ts
npx vitest run packages/planning/src/sterling/__tests__/episode-classification.test.ts

# Full regression
npx vitest run packages/planning/src/sterling/__tests__ packages/planning/src/task-integration/__tests__

# Type check
npx tsc --noEmit
```

## Future Work

### Tracked for Later

1. **Multi-Plan Keys Storage**: If replans become common and executions lag solves, consider storing join keys by planId (bounded map of last 2-3) rather than single slot. This would allow linking execution to non-latest plans.

2. **Migration Fallback Removal**: After 2026-02-15, if no migration logs observed:
   - Remove `isDeprecatedJoinKeysCompatEnabled()` and related code
   - Remove `solveJoinKeys` field from `TaskMetadata` type
   - Remove `isSafeForDeprecatedFallback` function

3. ~~**Centralize Solver IDs**~~: ✅ **DONE** (2026-02-02). Created `packages/planning/src/sterling/solver-ids.ts` with `SOLVER_IDS` constant object. All solver classes, planners, and reporters now import from this single source of truth.

4. **Roll Out solverId Guard to Other Domains**: Infrastructure is ready with:
   - `selectJoinKeysForPlan()` helper extracted for reuse
   - Multi-domain warning suppression key `(taskId, domain, category)`
   - `EpisodeDomain` type for type safety

   When episode reporters are added for other domains (crafting, tool progression, acquisition), apply the same pattern using:
   - Domain-specific `*SolveJoinKeys` from task metadata
   - Domain-specific `*PlanId` from task metadata
   - `SOLVER_IDS.*` for expected solver ID
   - `domain: 'crafting' | 'tool_progression' | 'acquisition'` in warning context

5. **Tighten Deprecated Fallback Heuristic**: `isSafeForDeprecatedFallback()` could additionally require at least one building-specific signal beyond `task.type === 'building'` (e.g., a step with `meta.domain === 'building'`). This reduces risk if tasks get mis-typed or misrouted.

6. ~~**Phase 1 Identity Chain Pre-wiring**~~: ✅ **DONE** (2026-02-03). CB now:
   - **LatchKey scoping** (2026-02-03): Latch now keyed by `${solverId}@${contractVersion}` (not just solverId). Version bumps automatically re-probe Sterling. All three bounded Sets use consistent `ByLatchKey` naming.
   - Parses `engineCommitment` and `operatorRegistryHash` from solve responses (via `parseSterlingIdentity`)
   - Stores them in `SolveJoinKeys` alongside `bundleHash`/`traceBundleHash` (closed loop: solve → store → report)
   - Added `engineCommitment` and `operatorRegistryHash` to both `SolveJoinKeys` and `EpisodeLinkage` interfaces
   - Added `buildEpisodeLinkage()` helper — single canonical place for linkage construction
   - Forwards new fields on `report_episode` **behind toggle** (`STERLING_REPORT_IDENTITY_FIELDS=1`, default OFF)
   - **Downgrade-on-rejection**: If Sterling rejects unknown fields:
     - **Identity-specific detection**: Only triggers retry if error mentions `engine_commitment` or `operator_registry_hash` (avoids retry tax on unrelated schema errors)
     - Retries once without identity fields
     - Only latches if retry succeeds (positive evidence that dropping fields fixed it)
     - Preserves actual error hint in warning log for debugging
     - Latch bounded to 256 entries (clear-on-overflow)
   - **Wire compatibility**: Sends both `requestId` and `request_id` during migration; parses both `episode_hash`/`episodeHash` and `request_id`/`requestId` from responses
   - Added once-per-latchKey observability logging for identity field presence/absence (latchKey = `${solverId}@${contractVersion}`)
   - Behavior remains identical against older Sterling versions (graceful degradation)
   - **Latch lifetime**: Persists until process restart. If Sterling is upgraded mid-process, restart CB to re-probe.
   - **Test reset hook**: `__resetIdentityLatchForTests()` available to prevent cross-test coupling

7. ~~**Episode Hash Persistence**~~: ✅ **DONE** (2026-02-03). CB now:
   - Parses `episode_hash` from `report_episode` ack (type: `EpisodeAck`)
   - `persistEpisodeAck()` helper stores it in `task.metadata.solver.{domain}EpisodeHash` asynchronously
   - Fire-and-forget pattern: uses `.then()` continuation to avoid blocking hot path
   - Re-reads latest task before writing to avoid clobbering concurrent updates
   - Domain→slot mapping via `EPISODE_HASH_SLOT` constant for cleaner signature

8. ~~**Richer Outcome Taxonomy via Substrate**~~: ✅ **DONE** (2026-02-03). CB now:
   - Captures `buildingSolveResultSubstrate` at solve-time with identity fields (`planId`, `bundleHash`)
   - Stores solve outcome (`solved`, `error`, `totalNodes`, `searchHealth`, `compatIssues`)
   - **Coherence check**: Substrate only used when `substrate.bundleHash === keysForThisPlan.bundleHash`
   - Classification boundary: success → EXECUTION_SUCCESS; failure + solver failed + coherent → use `buildEpisodeLinkageFromResult()`; else → EXECUTION_FAILURE
   - Debug logging gated behind `STERLING_EPISODE_DEBUG=1` environment variable
   - `compatIssues` explicitly mapped to stable `{ code, severity }` shape (max 10 issues)

### Operational Checklist

- [ ] Monitor for `[JoinKeys]` logs in production
- [ ] Track `solverId mismatch (unexpected)` warnings — investigate if seen
- [ ] Confirm no `JOIN_KEYS_DEPRECATED_COMPAT=1` needed after migration window
- [ ] Remove compat code after 2026-02-15
- [ ] Enable `STERLING_REPORT_IDENTITY_FIELDS=1` once Sterling confirms acceptance
- [ ] Monitor `[Sterling] Identity fields for <solverId>` logs to confirm field presence

### Logging Semantics

**Startup Banner** (emitted at module init time when `JOIN_KEYS_DEPRECATED_COMPAT=1`):
```
[JoinKeys] Deprecated solveJoinKeys fallback is ENABLED (JOIN_KEYS_DEPRECATED_COMPAT=1). Remove after 2026-02-15.
```
This logs even if no tasks exercise the fallback. Intentional: makes compat path visible in logs.

**Fallback Exercised** (emitted once per process on first actual use):
```
[JoinKeys] Migration fallback exercised: task=task-123, planId=plan-A
```

**Phase 1 Identity Field Status** (emitted once per latchKey on first solve with identity parsing):
```
[Sterling] Identity fields for minecraft.building: all present (traceBundleHash, engineCommitment, operatorRegistryHash)
[Sterling] Identity fields for minecraft.crafting: none present (server may be pre-Phase-1)
[Sterling] Identity fields for minecraft.navigation: present=[traceBundleHash], absent=[engineCommitment, operatorRegistryHash]
```
This helps diagnose whether Sterling is emitting identity fields without spamming logs.

**Identity Fields Rejected (Downgrade)** (emitted once per latchKey when Sterling rejects unknown fields):
```
[Sterling] Identity fields rejected for minecraft.building — downgrading to core linkage only. Hint: validation error: unknown field engine_commitment. Toggle STERLING_REPORT_IDENTITY_FIELDS=0 or wait for server upgrade.
```
This makes misconfiguration visible and confirms the retry succeeded without identity fields.

## Risk Assessment

| Change | Risk | Notes |
|--------|------|-------|
| Add solverId | Low | Additive field, backward compatible |
| solverId guard | Low | Only blocks when solverId present + mismatched |
| Migration fallback | Low | Opt-in via env, narrowed scope, removal tracked |
| Warning classification | Low | Informational only, no behavior change |
| Linkage builder | Low | Pure refactor, same semantics |
| Bounded Set | Low | Prevents memory leak, clear-on-overflow is conservative |
| Phase 1 identity fields | Low | Toggle default OFF, no egress change until enabled |
| Identity observability logging | Low | Once-per-latchKey, informational only |
| Downgrade-on-rejection | Low | Retry logic is transparent; worst case = two network calls |
| Episode hash persistence | Low | Fire-and-forget continuation; re-reads task to avoid clobbering |
| Solve result substrate | Low | Captured at solve-time; coherence-checked before use |
| Substrate coherence check | Low | Conservative: incoherent → falls back to binary classification |
| LatchKey scoping | Low | Version-aware; bumps automatically re-probe Sterling |

## What This Does NOT Change

- No changes to Sterling/Python
- No changes to bundle hash computation
- No new per-domain fields (already done in Commit A)
- No changes to writer side (already using per-domain)
