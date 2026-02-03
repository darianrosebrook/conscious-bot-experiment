# Sprint 0: Contract Surface Map

**Date**: 2026-02-02
**Status**: Audit complete — ready for Sprint 1 implementation
**Scope**: Map exact code locations for Changes A–C from [STERLING_INTEGRATION_REVIEW.md](./STERLING_INTEGRATION_REVIEW.md)
**Integration canaries**: Rig A (crafting) and Rig D (acquisition)

---

## Sterling Side: What Exists Today

### Q1: Does Sterling build a trace bundle per solve?

**Answer: NO.** The eval server returns lightweight `complete` messages with metrics and planId. No `TraceBundleV1` is instantiated.

| What the `complete` message contains today | File | Lines |
|---|---|---|
| `type`, `domain`, `solved`, `steps`, `totalNodes`, `durationMs`, `planId`, `metrics`, `error` | `scripts/utils/sterling_unified_server.py` | 1800–1818 (minecraft), 1929–1947 (building), 2003–2021 (navigation) |
| `metrics.searchHealth` (11 fields + version) | same | Nested in `metrics` dict |

**What the A* loop does produce internally** (raw materials for a trace, not serialized):
- `minecraft_domain.py:756–779`: reconstructs `path_states` and `path_actions` from `came_from` parent pointers
- `minecraft_domain.py:784–809`: builds `action_edge_ids` list (e.g., `f"{path_states[i]}|{action_node_id}"`)
- Stored in `_pending_plans` dict (line 809) by planId for later `report_episode` feedback

**TraceBundleV1 is NOT imported** anywhere in `scripts/eval/` or `scripts/utils/`. The schema exists in `core/contracts/trace_bundle.py` but is not wired into the eval domains.

### Q2: Is there a stable engine commitment / operator registry hash?

**Answer: NO.** Neither is computed or emitted.

- `TraceBundleV1.engine_commitment` (line 340) and `TraceBundleV1.operator_registry_hash` (line 341) are defined in the schema but always `None`
- No git SHA, build digest, or version hash is captured at server startup
- `core/operators/bundle.py:159–175` has operator registry hashing for certified bundles, but the eval server does not use it

### Q3: Does `report_episode` have internal records that can store `external_refs`?

**Answer: PARTIAL.** Pending plans are stored. No extensibility for external refs.

| Component | File | Lines | Notes |
|---|---|---|---|
| Pending plan storage | `minecraft_domain.py` | 465–467 | `_pending_plans[plan_id] = action_edge_ids` |
| Episode handler | `sterling_unified_server.py` | 1289–1297 | Calls `solver.report_episode(planId, goal, success, stepsCompleted)` |
| Episode method | `minecraft_domain.py` | 835–853 | Applies feedback via `kg.apply_episode_result()`, returns minimal ack |
| Episode response shape | same | 843–853 | `{ type, domain, planId, goal, success, stepsCompleted, totalEpisodes }` |
| **planId generation** | `minecraft_domain.py` | 806–808 | `md5(f"{start_hash}:{solution_hash}:{time.time()}")[:16]` — **NOT content-addressed** (includes wall-clock time) |

**No `episode_hash` is computed.** No `external_refs` field exists. No `bundle_hash` storage mechanism.

### Q4: Is `requestId` threaded through solve/report?

**Answer: NO for solve and report_episode. YES for declarations only.**

| Command | requestId extracted? | requestId in response? | File | Lines |
|---|---|---|---|---|
| `register_domain_declaration_v1` | Yes | Yes | `sterling_unified_server.py` | 1110–1182 |
| `get_domain_declaration_v1` | Yes | Yes | same | 1184–1240 |
| `solve` (minecraft) | No | No | same | 1730–1818 |
| `solve` (building) | No | No | same | 1821–1947 |
| `solve` (navigation) | No | No | same | 1950–2021 |
| `report_episode` | No | No | same | 1281–1327 |

---

## Conscious-Bot Side: What Exists Today

### Where SolveBundle is computed and hashed

| Function | File | Lines | What it does |
|---|---|---|---|
| `computeBundleInput()` | `solve-bundle.ts` | 205–235 | Hashes definitions, inventory, goal, nearbyBlocks → produces `SolveBundleInput` |
| `computeBundleOutput()` | `solve-bundle.ts` | 237–296 | Hashes steps → produces `SolveBundleOutput` with stepsDigest, searchStats, optional searchHealth/rationale |
| `createSolveBundle()` | `solve-bundle.ts` | 384–399 | Combines input + output + compatReport → produces `SolveBundle` with content-addressed `bundleId` |
| `hashableBundlePayload()` | `solve-bundle.ts` | 364–376 | **THE exclusive bundleHash contract**: canonicalizes `{input, output, compatReport}` excluding `checkedAt` |
| `canonicalize()` | `solve-bundle.ts` | 67–109 | Sorted keys, NaN rejection, -0 normalization, deterministic JSON |
| `contentHash()` | `solve-bundle.ts` | 111–118 | SHA-256 truncated to 16 hex chars |

**Fields EXCLUDED from bundleHash**: `compatReport.checkedAt`, `SolveBundle.timestamp`.

**Fields INCLUDED in bundleHash**: Everything in `SolveBundleInput`, everything in `SolveBundleOutput` (including optional `searchHealth` and `rationale`), and `compatReport.{valid, issues, definitionCount}`.

### Where Sterling-provided fields can be stored without contaminating bundleHash

**Current state: No mechanism exists.** `SolveBundleOutput` is canonicalized directly in `hashableBundlePayload()`.

**Safe extension point**: Add fields to `SolveBundle` (top-level, not inside `output`) or add a `sterlingIdentity` object to `SolveBundleOutput` and explicitly exclude it in `hashableBundlePayload()`.

**Recommended approach** (minimal diff, explicit exclusion):

```typescript
// In solve-bundle-types.ts — extend SolveBundleOutput:
export interface SolveBundleOutput {
  // ... existing fields ...
  /** Opaque Sterling-provided identities. NOT included in bundleHash. */
  sterlingIdentity?: SterlingIdentity;
}

export interface SterlingIdentity {
  traceBundleHash?: string;
  engineCommitment?: string;
  operatorRegistryHash?: string;
  completenessDeclaration?: CompletenessDeclaration;
}

// In solve-bundle.ts — modify hashableBundlePayload():
function hashableBundlePayload(...): string {
  const { sterlingIdentity, ...hashableOutput } = output;  // EXCLUDE
  const hashableReport = { valid, issues, definitionCount };  // existing exclusion
  return canonicalize({ input, output: hashableOutput, compatReport: hashableReport });
}
```

### Where episode reporting occurs

| Component | File | Lines | Notes |
|---|---|---|---|
| `reportEpisode()` | `base-domain-solver.ts` | 84–108 | Fire-and-forget via `sterlingService.solve()`. Requires `planId`. No response checked. |
| Crafting invocation | `minecraft-crafting-solver.ts` | 309–321 | `reportEpisodeResult(goalItem, success, stepsCompleted, planId)` |
| Tool progression invocation | `minecraft-tool-progression-solver.ts` | 397–417 | Adds `targetTool`, `targetTier`, `failedAtTier`, `failureReason` |
| Acquisition invocation | `minecraft-acquisition-solver.ts` | 298–322 | Updates priors first, then reports with `item`, `strategy`, `contextKey`, `candidateSetDigest` |

**Response handling**: Currently none. The `.catch()` handler logs errors and continues. No response fields are parsed.

### Where `complete` message fields are extracted

| Component | File | Lines | Notes |
|---|---|---|---|
| Service pass-through | `sterling-reasoning-service.ts` | 239–257 | `solve()` delegates to `this.client.solve()` |
| planId extraction | `base-domain-solver.ts` | 72–74 | `result.metrics?.planId` |
| searchHealth extraction | `search-health.ts` | (full file) | `parseSearchHealth(result.metrics)` |
| Crafting bundle assembly | `minecraft-crafting-solver.ts` | 159–271 | Extracts from `result` → calls `computeBundleOutput()` → calls `createSolveBundle()` |

**New fields would be extracted from**: `result.metrics.traceBundleHash`, `result.metrics.engineCommitment`, `result.metrics.operatorRegistryHash`. Attached to `SolveBundleOutput.sterlingIdentity` AFTER bundle creation (does not affect hash).

### E2E test harness points for Rigs A and D

| Test file | Lines | What it tests | Where to add new assertions |
|---|---|---|---|
| `solver-class-e2e.test.ts` | 89–155 | Wooden pickaxe: `solveMeta.bundles` shape, input hashes, output solved, searchHealth | After searchHealth assertions: assert `sterlingIdentity.traceBundleHash` defined (when available) |
| `solver-class-e2e.test.ts` | 157–217 | Iron tier: 3 bundles, distinct goalHash, degeneracy detection | Per-tier `traceBundleHash` assertions |
| `acquisition-solver-e2e.test.ts` | 83–155 | Trade strategy: parent + child bundles, context token injection, inventory hash | After context token assertions: child `traceBundleHash` defined |
| `acquisition-solver-e2e.test.ts` | 162–229 | Loot strategy: `proximity:container:chest` token | Same extension point |
| `acquisition-solver-e2e.test.ts` | 309–388 | Mine delegation: nested bundle hierarchy | Parent and child `traceBundleHash` assertions |
| `acquisition-solver-e2e.test.ts` | 522–569 | Deterministic identity: two identical solves → same hashes | Extend with `traceBundleHash` equality (Regime A) |

---

## Backcompat Decision Note

### What happens if Sterling doesn't return `trace_bundle_hash` yet?

**Decision: TS accepts `undefined` and gates strictness behind `executionMode`.**

| Scenario | Behavior |
|---|---|
| `result.metrics.traceBundleHash` absent | `sterlingIdentity.traceBundleHash = undefined`. No error. Bundle creation proceeds normally. |
| `executionMode === 'dev'` | Absence is expected and silent. No warning. |
| `executionMode === 'certifying'` | Absence logged as warning: `"Sterling did not return trace_bundle_hash in certifying mode"`. Non-fatal. |
| `STERLING_E2E=1` test environment | E2E tests assert `traceBundleHash` is defined IF the server version supports it. Use conditional assertions gated on a server capability probe (or tolerate `undefined` with a `TODO` comment until the server change lands). |

**Concrete test pattern**:
```typescript
// In solver-class-e2e.test.ts — conditional until server supports it:
if (bundle.output.sterlingIdentity?.traceBundleHash) {
  expect(bundle.output.sterlingIdentity.traceBundleHash).toMatch(/^[0-9a-f]+$/);
} else {
  // TODO: Remove this branch once sterling_unified_server returns trace_bundle_hash
  expect(bundle.output.sterlingIdentity?.traceBundleHash).toBeUndefined();
}
```

### What happens if `report_episode_ack` doesn't exist yet?

**Decision: TS logs and continues in dev; tests require it in E2E.**

| Scenario | Behavior |
|---|---|
| Sterling returns current format (`{ type: "episode_reported", ... }`) without `episode_hash` | `reportEpisode()` logs `"Sterling did not return episode_hash"` at debug level. Returns `undefined` for episode_hash. |
| Sterling returns new format with `episode_hash` | `reportEpisode()` parses and returns `episode_hash`. CB computes `bindingHash`. |
| `executionMode === 'dev'` | Missing `episode_hash` is non-fatal, no warning. |
| `executionMode === 'certifying'` | Missing `episode_hash` logged as warning. Non-fatal (episode reporting is already fire-and-forget). |
| E2E tests | Currently episode reporting is not asserted in any E2E test (fire-and-forget). New E2E tests that assert `episode_hash` should be gated behind a server capability check or skipped with a clear TODO. |

**Migration path**:
1. First: change `reportEpisode()` from fire-and-forget to returning a promise with parsed response
2. Then: add `episode_hash` parsing when response includes it
3. Then: compute `bindingHash = contentHash(traceBundleHash + bundleHash)` when both hashes are available
4. Finally: add E2E assertions once both server changes (trace_bundle_hash + episode_hash) are deployed

---

## Minimal Shim vs Proper Wiring Decision

**Decision: Minimal shim first.**

The eval domains don't produce `TraceBundleV1` today. Building proper trace bundle wiring requires threading `TraceBundleV1` construction into all three eval domains (`minecraft_domain.py`, `building_domain.py`, `navigation_domain.py`), which is substantial.

**Minimal shim**: Compute `trace_bundle_hash` from an agreed canonical form of existing solve output:

```python
# In sterling_unified_server.py, after A* completes:
import hashlib, json

def compute_trace_bundle_hash_shim(solve_result, rules_hash, goal_hash, initial_state_hash):
    """Minimal solve identity shim until TraceBundleV1 is wired."""
    canonical = json.dumps({
        "definition_hash": rules_hash,
        "initial_state_hash": initial_state_hash,
        "goal_hash": goal_hash,
        "steps": [s.get("action", "") for s in solve_result.get("steps", [])],
        "solved": solve_result.get("solved", False),
        "total_nodes": solve_result.get("totalNodes", 0),
    }, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
```

This gives solve identity immediately, with the guarantee that:
- Same inputs + same search behavior → same hash (deterministic)
- Different search behavior → different hash (discriminating)
- The shim can be replaced with a real `TraceBundleV1.content_hash()` later without breaking CB

**Engine commitment shim**: Compute once at server startup:

```python
# In sterling_unified_server.py, at module level:
import subprocess
try:
    ENGINE_COMMITMENT = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=os.path.dirname(__file__),
        stderr=subprocess.DEVNULL
    ).decode().strip()[:16]
except Exception:
    ENGINE_COMMITMENT = "unknown"
```

**Operator registry hash shim**: Compute per-domain from the rules/operators loaded:

```python
# In minecraft_domain.py, after rules are loaded:
def compute_operator_registry_hash(self):
    """Content hash of loaded operator set for drift detection."""
    ops = sorted(self.kg.get_operators(), key=lambda o: o["id"])
    canonical = json.dumps(ops, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
```

---

## Exact Edit Targets (Sprint 1 Implementation Map)

### Change A: `solve` response additions

| Repo | File | Function/Location | Change |
|---|---|---|---|
| Sterling | `scripts/utils/sterling_unified_server.py:1800–1818` | Minecraft `complete` message | Add `trace_bundle_hash`, `engine_commitment`, `operator_registry_hash` to response dict |
| Sterling | `scripts/utils/sterling_unified_server.py:1929–1947` | Building `complete` message | Same |
| Sterling | `scripts/utils/sterling_unified_server.py:2003–2021` | Navigation `complete` message | Same |
| Sterling | `scripts/eval/minecraft_domain.py` (new method) | After A* completion | Add `compute_trace_bundle_hash_shim()` |
| Sterling | `scripts/eval/building_domain.py` (new method) | After A* completion | Same |
| Sterling | `scripts/eval/navigation_domain.py` (new method) | After A* completion | Same |
| Sterling | `scripts/utils/sterling_unified_server.py` (module-level) | Server startup | Add `ENGINE_COMMITMENT` computation |
| CB | `packages/planning/src/sterling/solve-bundle-types.ts` | `SolveBundleOutput` interface | Add `sterlingIdentity?: SterlingIdentity` |
| CB | `packages/planning/src/sterling/solve-bundle-types.ts` | New interface | Add `SterlingIdentity` type |
| CB | `packages/planning/src/sterling/solve-bundle.ts:364–376` | `hashableBundlePayload()` | Destructure out `sterlingIdentity` before canonicalizing |
| CB | `packages/planning/src/sterling/minecraft-crafting-solver.ts:159–271` | Bundle assembly | Parse `sterlingIdentity` from `result.metrics`, attach after bundle creation |
| CB | `packages/planning/src/sterling/minecraft-tool-progression-solver.ts` | Bundle assembly | Same |
| CB | `packages/planning/src/sterling/minecraft-acquisition-solver.ts` | Bundle assembly | Same |
| CB | `packages/planning/src/sterling/minecraft-building-solver.ts` | Bundle assembly | Same |
| CB | `packages/planning/src/sterling/minecraft-navigation-solver.ts` | Bundle assembly | Same |

### Change B: `report_episode` additions

| Repo | File | Function/Location | Change |
|---|---|---|---|
| CB | `packages/planning/src/sterling/solve-bundle-types.ts` | New type | Add `EpisodeFailureClass` enum |
| CB | `packages/planning/src/sterling/base-domain-solver.ts:84–108` | `reportEpisode()` | Add `bundle_hash`, `trace_bundle_hash`, `failure_class`, `requestId` to payload. Change from fire-and-forget to returning parsed response. |
| CB | `packages/planning/src/sterling/base-domain-solver.ts` (new function) | Failure classification | Add `classifyFailure()` function deriving class from `terminationReason`, `compatReport`, executor outcome |
| Sterling | `scripts/utils/sterling_unified_server.py:1281–1327` | `report_episode` handler | Extract `requestId`, `bundle_hash`, `trace_bundle_hash`, `failure_class`. Thread `requestId` to response. |
| Sterling | `scripts/eval/minecraft_domain.py:835–853` | `report_episode()` method | Accept + store `bundle_hash` as metadata alongside pending plan. Return `requestId` in response. |

### Change C: `report_episode` response additions

| Repo | File | Function/Location | Change |
|---|---|---|---|
| Sterling | `scripts/eval/minecraft_domain.py:843–853` | `report_episode()` return dict | Add `episode_hash` (content-addressed from episode content), add `requestId` passthrough |
| Sterling | `scripts/eval/building_domain.py` | `report_episode()` return dict | Same |
| CB | `packages/planning/src/sterling/base-domain-solver.ts` | `reportEpisode()` | Parse `episode_hash` from response. Compute `bindingHash = contentHash(traceBundleHash + bundleHash)` when both available. |

### Change D: `executionMode` alignment

| Repo | File | Function/Location | Change |
|---|---|---|---|
| CB | `packages/planning/src/sterling/solve-bundle-types.ts` | `SolveBundleInput.executionMode` | Add `ExecutionMode` type: `'dev' \| 'certifying' \| 'replay'` (existing field, new union type) |

---

## Failing Test Shells (Sprint 0 Exit Criteria — COMMITTED)

These tests are committed and expected to fail until Sprint 1 implementation lands.

**Type stubs committed to** `solve-bundle-types.ts`: `SterlingIdentity`, `CompletenessDeclaration`, `EpisodeFailureClass`, `ExecutionMode`.
**Hash exclusion committed to** `solve-bundle.ts`: `hashableBundlePayload()` now destructures out `sterlingIdentity` before canonicalizing.
**Test 2 passes now** (unit-level, no server dependency). Tests 1, 3, 4 require Sprint 1 server + solver changes.

### Test 1: Sterling identity fields present in solve response (E2E, gated)

**File**: `packages/planning/src/sterling/__tests__/solver-class-e2e.test.ts`

```typescript
it('solve response includes sterling identity fields', async () => {
  // This test WILL FAIL until Sterling server returns trace_bundle_hash
  const result = await solver.solveToolProgression('wooden_pickaxe', {}, []);
  const bundle = result.solveMeta!.bundles[0];

  // Solve-scoped identity (from Sterling complete message)
  expect(bundle.output.sterlingIdentity).toBeDefined();
  expect(bundle.output.sterlingIdentity!.traceBundleHash).toMatch(/^[0-9a-f]+$/);
  expect(bundle.output.sterlingIdentity!.engineCommitment).toBeDefined();
  expect(bundle.output.sterlingIdentity!.operatorRegistryHash).toBeDefined();
});
```

### Test 2: Sterling identity does NOT contaminate bundleHash

**File**: `packages/planning/src/sterling/__tests__/solve-bundle.test.ts`

```typescript
it('sterlingIdentity does not participate in bundleHash', () => {
  const input = makeMockBundleInput();
  const outputA = makeMockBundleOutput();
  const outputB = { ...outputA, sterlingIdentity: {
    traceBundleHash: 'abc123',
    engineCommitment: 'def456',
  }};
  const compat = makeMockCompatReport();

  const bundleA = createSolveBundle(input, outputA, compat);
  const bundleB = createSolveBundle(input, outputB, compat);

  expect(bundleA.bundleHash).toBe(bundleB.bundleHash);
});
```

### Test 3: Regime A replay — same payload produces same trace_bundle_hash (E2E, gated)

**File**: `packages/planning/src/sterling/__tests__/solver-class-e2e.test.ts`

```typescript
it('Regime A: identical solves produce identical trace_bundle_hash', async () => {
  const result1 = await solver.solveToolProgression('wooden_pickaxe', {}, []);
  const result2 = await solver.solveToolProgression('wooden_pickaxe', {}, []);

  const hash1 = result1.solveMeta!.bundles[0].output.sterlingIdentity?.traceBundleHash;
  const hash2 = result2.solveMeta!.bundles[0].output.sterlingIdentity?.traceBundleHash;

  // Both must be defined (fails until server returns them)
  expect(hash1).toBeDefined();
  expect(hash2).toBeDefined();
  // Structural determinism: same inputs → same trace identity
  expect(hash1).toBe(hash2);
});
```

### Test 4: episode_hash returned from report_episode (E2E, gated)

**File**: `packages/planning/src/sterling/__tests__/solver-class-e2e.test.ts`

```typescript
it('report_episode returns episode_hash', async () => {
  const result = await solver.solveToolProgression('wooden_pickaxe', {}, []);
  const planId = result.solveMeta!.bundles[0].output.planId;

  // This test WILL FAIL until reportEpisode returns parsed response
  const episodeResult = await solver.reportEpisodeResult(
    'wooden_pickaxe', true, 8, planId
  );

  expect(episodeResult).toBeDefined();
  expect(episodeResult!.episodeHash).toMatch(/^[0-9a-f]+$/);
});
```

### Test 5: Hash coupling — bundle_hash does NOT affect episode_hash (Python unit test)

**File**: `sterling/tests/unit/test_episode_identity.py` (new)

```python
def test_bundle_hash_does_not_affect_episode_hash():
    """CB's bundle_hash must not participate in Sterling's episode_hash."""
    episode_a = report_episode(plan_id="abc", success=True, bundle_hash="hash_a")
    episode_b = report_episode(plan_id="abc", success=True, bundle_hash="hash_b")

    assert episode_a["episode_hash"] == episode_b["episode_hash"]
    # external_refs differ, but episode identity is unchanged
    assert episode_a.get("external_refs", {}).get("cb_solve_bundle_hash") == "hash_a"
    assert episode_b.get("external_refs", {}).get("cb_solve_bundle_hash") == "hash_b"
```

---

## Sprint 0 Exit Criteria Checklist

- [x] Contract surface map produced (this document)
- [x] Exact Sterling functions/files identified for Changes A–C
- [x] Exact TS functions/files identified for SolveBundleOutput + reportEpisode changes
- [x] Backcompat decisions documented (undefined acceptance, gated strictness)
- [x] Minimal shim vs proper wiring decision made (shim first)
- [x] Failing test sketches written (5 tests covering identity, hash coupling, replay, episode)
- [x] Failing tests committed (Sprint 1 prerequisite — implement type stubs + test shells)

---

## Sprint 1 PR B — CB Side (IMPLEMENTED)

PR B (conscious-bot side) is implemented. Changes:

### Types (solve-bundle-types.ts)
- `SterlingIdentity`: traceBundleHash, engineCommitment, operatorRegistryHash, completenessDeclaration (typed as `Record<string, unknown>` until Sterling shape finalized), bindingHash
- `EpisodeOutcomeClass`: 9-member union (includes `EXECUTION_SUCCESS`)
- `EpisodeAck`: parsed report_episode response (episodeHash, requestId)
- `ExecutionMode`: `'dev' | 'certifying' | 'replay'`

### Bundle infrastructure (solve-bundle.ts)
- `hashableBundlePayload()`: excludes `sterlingIdentity` from canonicalization
- `parseSterlingIdentity()`: extracts identity fields from Sterling metrics
- `attachSterlingIdentity()`: attaches identity + computes bindingHash

### Base solver (base-domain-solver.ts)
- `reportEpisode()`: upgraded from fire-and-forget to `async → Promise<EpisodeAck | undefined>`
- Sends: requestId, bundle_hash, trace_bundle_hash, outcome_class
- Parses: episode_hash, requestId from response

### All 6 solvers wired
- crafting, tool-progression, building, navigation, acquisition, furnace
- Each solver: imports `parseSterlingIdentity` + `attachSterlingIdentity`, calls after every `createSolveBundle`
- Each `reportEpisodeResult`: now `async → Promise<EpisodeAck | undefined>`

### Tests (12 new, 795 total passing)
- `parseSterlingIdentity`: 6 tests (undefined, no fields, all fields, type guards)
- `attachSterlingIdentity`: 6 tests (undefined noop, attaches, bindingHash computation, determinism, discrimination)
- `sterlingIdentity` hash exclusion: 2 tests (basic + with completeness declaration)
- E2E: 3 tests gated behind STERLING_E2E (identity fields, Regime A, episode_hash)

### What remains for Sprint 1 PR A (Sterling side)
1. `complete` message: emit `trace_bundle_hash`, `engine_commitment`, `operator_registry_hash`
2. `report_episode` handler: accept `requestId`, `bundle_hash`, `trace_bundle_hash`, `outcome_class`; store bundle_hash as external_ref
3. `report_episode_ack` response: return `episode_hash`, echo `requestId`
4. Hash coupling test: same episode + same trace_bundle_hash → identical episode_hash regardless of bundle_hash
