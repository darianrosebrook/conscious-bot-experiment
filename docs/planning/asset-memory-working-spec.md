# Bot Asset Memory with Myelin-Like Reinforcement — Working Spec

Schema ID: `conscious-bot.asset_memory.v0`
Status: Working Spec (executable-spec oriented)
Scope: Bot-side world-entity memory (assets, bases, routes, routines) with evidence-backed claims + L0→L3 myelin ladder + anti-reward-hacking gates.

---

## 1. Preamble

### 1.1 Relationship to Sterling

This spec defines a bot-side memory system for "owned" world entities (workstations, farms, beds, chests, bases, stable people) represented as evidence-backed claims. It deliberately mirrors Sterling's "myelin sheath" idea: repeated reliable interaction patterns should become faster to retrieve and harder to forget, while remaining fail-closed and provenance-driven.

Alignment targets:

- Sterling reference: `sterling.myelin_sheath.v0`
- Sterling reference: `sterling.semantic_working_memory_contract.v0`

Bot asset memory is not Sterling SWM; it is a world-grounded claim store that can (a) improve local planning decisions and (b) provide candidates/signals for Sterling-style corridor extraction (e.g., high-success routines become sheath candidates).

### 1.2 Core tension

1) Persistence: do not lose critical assets (bases, workstations, beds, storage, farms).
2) Plasticity: do not cling to stale/destroyed assets.
3) Anti-reward-hacking: avoid duplicate placement due to uncertainty.

Resolution: treat memory as **claims with evidence**, use **promotion/demotion** through a 4-level myelin ladder (L0→L3), and enforce **budgets + place-vs-reuse gates** at the point of action.

### 1.3 Non-goals

- Not implementing Mineflayer pathfinding, chunk loading, or full perception.
- Not prescribing a persistence backend (SQLite/JSON/artifact store). The schema is designed to support multiple.
- Not modifying Sterling; only mapping contract concepts.

---

## 2. Core Object Model

Everything is a claim, with append-only evidence. All "knowledge" is downstream of evidence, never the other way around.

### 2.1 TypeScript interfaces

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */

export type MyelinLevel = 0 | 1 | 2 | 3;

export type AssetType =
  | 'workstation'
  | 'container'
  | 'farm'
  | 'bed'
  | 'person'
  | 'waypoint'
  | 'base';

export type EvidenceEventType =
  | 'observed'
  | 'verified'
  | 'used'
  | 'placed'
  | 'failed_verify'
  | 'failed_use'
  | 'merged'
  | 'budget_denied'
  | 'execution_failed';

export type SensorMode =
  | 'blockAt'
  | 'entity_lookup'
  | 'container_open'
  | 'interaction'
  | 'planner'
  | 'manual';

export interface Vec3i { x: number; y: number; z: number; }
export interface ChunkPos { cx: number; cz: number; }

export interface AssetLocation {
  dimension: 'overworld' | 'nether' | 'end' | string;
  blockPos: Vec3i;                 // best guess; can drift
  chunkPos: ChunkPos;              // derived from blockPos; used for indexing
  placeId?: string;                // optional: PlaceGraph region node id
  baseId?: string;                 // optional: membership in a base claim
}

export interface VerifyMethod {
  type: 'block_name_match' | 'entity_uuid' | 'container_signature' | 'custom';
  expectedValue: string;           // e.g. 'furnace' for block_name_match
  radius: number;                  // tolerance for drift (blocks)
  customVerifierId?: string;       // when type === 'custom'
}

export interface EvidenceDigest {
  prev?: string;                   // digest of prior entry
  digest: string;                  // digest of this entry
}

export interface EvidenceEntry {
  timestampMs: number;
  tickId: number;
  eventType: EvidenceEventType;
  sensorMode: SensorMode;
  success: boolean;
  details?: Record<string, unknown>;
  chain: EvidenceDigest;           // append-only chain integrity
}

export interface AssetClaim {
  // Identity
  assetId: string;                 // content-addressed: hash(stable identity fields)
  assetType: AssetType;
  subType: string;                 // 'crafting_table' | 'furnace' | 'chest' | ...
  owner: string;                   // bot_id

  // Location anchoring
  location: AssetLocation;

  // Semantics
  tags: string[];                  // canonicalized, stable ordering
  interactRadius: number;
  verifyMethod: VerifyMethod;

  // Evidence ledger
  evidence: EvidenceEntry[];       // append-only, monotonic tickId
  lastVerifiedAtTick: number | null;
  lastUsedAtTick: number | null;
  failureStreak: number;           // consecutive failed_* count
  streakStartLevel: MyelinLevel;   // level when current failure streak began (see §3.3)

  // Derived scores (computed, not authoritative)
  confidence: number;              // 0..1
  value: number;                   // 0..1 (reacquisition cost proxy)
  myelinLevel: MyelinLevel;        // 0..3
}

export interface BaseClaim {
  baseId: string;
  name: string;
  centerPos: Vec3i;
  dimension: string;
  anchorAssets: string[];          // assetIds (bed, crafting_table, chest)
  radius: number;
  assets: string[];                // membership list
  routes: string[];                // routeClaimIds
  discoveredAtTick: number;
  lastVisitAtTick: number;
}

export interface RouteClaim {
  routeId: string;
  fromRegion: string;              // PlaceGraph placeId OR coarse region key
  toAssetId: string;
  waypoints: Vec3i[];
  expectedCostTicks: number;
  successRate: number;
  lastSuccessAtTick: number | null;
  lastFailAtTick: number | null;
  traversalCount: number;
  myelinLevel: MyelinLevel;
}

export interface RoutineClaim {
  routineId: string;
  name: string;
  preconditions: string[];         // human-readable or DSL
  referencedAssetIds: string[];
  stepSkeleton: string[];          // ['move_to', 'verify', 'interact', 'store']
  successRate: number;
  executionCount: number;
  lastExecutedAtTick: number | null;
  myelinLevel: MyelinLevel;
}
```

### 2.2 Identity strategy (content-addressed ids)

Asset identity must be stable under evidence accumulation while preventing phantom duplicates from policy-field drift.

Stable identity fields (and **only** these):

* `assetType`
* `subType`
* `owner`
* `dimension`
* `blockPos` (exact block coordinates)

`assetId = hash(canonical_json(stable_fields))`

Non-identity fields explicitly **excluded** from the hash:

* `tags`, `verifyMethod`, `interactRadius` — policy attributes that may change without affecting identity
* `firstSeenTick`, `firstSeenMs` — temporal; the same block observed at different times must merge into one claim
* `chunkPos` — derived from `blockPos`; including it would be redundant

Rationale: using exact `blockPos` means two assets at different positions always get distinct IDs, even within the same chunk. This is intentional — the "same furnace moved 1 block" scenario is handled by creating a new claim and letting the old one decay via TTL/demotion, not by identity merging.

### 2.3 Evidence ledger (append-only + digest chain)

Evidence is the only authoritative input. All computed fields (confidence/value/myelinLevel) are derived.

Ledger invariants:

* Strictly monotonic tickId **per claim**: `e[i].tickId > e[i-1].tickId` (not globally unique; multiple claims may share a tickId value; see §6.7.4 for multi-emission offset contract)
* Digest chain integrity: `e[i].chain.prev === e[i-1].chain.digest`
* Digest computed over canonical representation of:

  * entry fields (timestampMs, tickId, eventType, sensorMode, success, details)
  * prev digest

Interpretation:

* "Memory edits" are new evidence, not mutation.
* Deletion is disallowed; demotion or expiry is implemented via derived state and index removal.

---

## 3. Promotion/Demotion Thresholds

### 3.1 Semantics by level

* L0 (Episodic): observed once; short TTL; low confidence; not used for critical routing.
* L1 (Verified): at least one successful verification or interaction; verify-on-use required.
* L2 (Owned): placed-by-bot OR repeated uses + separated verifications; slower decay; used for planning.
* L3 (Myelinated): frequent successful use, no recent failures, high value; default attractor; still verify-on-use but not casually forgotten.

### 3.2 Constants

```ts
export const MYELIN_THRESHOLDS = {
  L0_TO_L1: {
    minVerifications: 1,
    minUses: 1,
    mode: 'OR' as const,          // verified OR used
  },

  L1_TO_L2: {
    placedByBotPromotes: true,
    OR: {
      minSuccessfulUses: 3,
      minVerifications: 2,
      minTimeSeparationTicks: 6000,
    },
  },

  L2_TO_L3: {
    minUses: 10,
    recentWindowEntries: 20,
    maxRecentFailures: 0,
    minValueScore: 0.5,
    minSuccessRate: 0.95,
  },

  DEMOTION_FAILURES: {
    L3_TO_L1: { consecutiveFailures: 3 },
    L2_TO_L1: { consecutiveFailures: 2 },
    L1_TO_L0: { consecutiveFailures: 1 },
  },

  DECAY_TTL_TICKS: {
    L0: 72_000,
    L1: 288_000,
    L2: Infinity,
    L3: Infinity,
  },
} as const;
```

### 3.3 Rules

Promotion rules:

* L0->L1: one successful `verified` OR one successful `used` OR one successful `placed`.
  * Rationale: a successful `placed` event implies the bot both observed and created the asset, which is stronger evidence than mere observation. An attempted-but-failed placement does not qualify.
* L1->L2 (two routes, evaluated in priority order):

  * **Ownership path** (checked first): if `placedByBotPromotes` and a successful `placed` by this bot exists, promote to L2 without requiring the Non-placement path.
  * **Non-placement path** (checked only if Ownership path does not apply): >=3 successful `used` + >=2 successful `verified` with first-to-last verification separated by >=6000 ticks.
  * Note: L2 means "owned and retrieval-durable, planning-eligible." It does not grant execution eligibility without verification. All actions still require verify-on-use. See §5.3.
* L2->L3:

  * >=10 successful `used`
  * 0 `failed_verify`/`failed_use` events in last 20 evidence entries (strict by default). Other non-failure event types (e.g., `budget_denied`, `execution_failed`, `merged`) do not count as failures for this check.
  * value >= 0.5
  * successRate >= 0.95

Promotion gating: promotions only run when `failureStreak === 0`. During an active failure streak, the claim cannot be promoted — only demoted or held.

Failure streak increment rule: only `failed_verify` and `failed_use` events (with `success: false`) increment `failureStreak`. The `execution_failed` event type does not increment the streak — it represents a precondition or environmental failure unrelated to asset reliability (see §6.5 failure classification rule). Like `budget_denied`, `merged`, and `observed`, it is a neutral ledger entry with no trust impact.

Failure streak reset rule: `failureStreak` resets to 0 on any evidence entry with `success: true` that represents an actual interaction/verification outcome (`used`, `verified`, `placed`). `observed` and `execution_failed` events do not reset failure streaks — neither passive re-observation nor precondition failures should restore trust.

Demotion rules (two mechanisms):

**Mechanism 1: Streak-based demotion (driven by `failureStreak` + `streakStartLevel`)**

Each demotion rule is evaluated against `streakStartLevel` — the myelin level recorded when the current failure streak began — not the current level. This prevents cascade: if a claim starts a streak at L3, intermediate maintenance demotions (L3->L2) do not cause the L2 or L1 streak rules to fire on subsequent failures. The streak rules are:

* L3->L1 after 3 consecutive failures (from streak start at L3)
* L2->L1 after 2 consecutive failures (from streak start at L2)
* L1->L0 after 1 consecutive failure (from streak start at L1)

`streakStartLevel` is set to the current `myelinLevel` when `failureStreak` transitions from 0 to 1, and reset when `failureStreak` returns to 0 on a successful event.

Example: a claim at L3 receives one `failed_use` -> maintenance demotes it to L2, but `streakStartLevel` remains 3. A second failure occurs -> `streakStartLevel` is still 3, and `failureStreak` is 2, so neither the L3 rule (needs 3) nor the L2 rule (needs `streakStartLevel === 2`) fires. A third failure -> `failureStreak` reaches 3, and the L3->L1 rule fires (because `streakStartLevel === 3`), jumping directly to L1. Without `streakStartLevel`, this same sequence would cascade L3->L2->L1->L0.

**Mechanism 2: L3 maintenance demotion (criteria re-check)**

If a claim is at L3 and the L3 promotion criteria no longer hold (e.g., a `failed_verify` or `failed_use` event appears in the recent 20-entry window, or success rate drops below 0.95), it demotes to L2. This fires after streak-based checks, so it is a no-op if streak-based demotion already lowered the level below L3.

Purpose: a single failure should invalidate L3 status (it is a "high trust" level), but should not cascade to L1/L0 — that requires sustained failure via the streak mechanism.

Decay rules (TTL):

* L0: expire from indices after 72,000 ticks without new evidence
* L1: expire from indices after 288,000 ticks without new evidence
* L2/L3: no TTL expiry, only demotion

"Expire from indices" means the claim becomes inactive for retrieval, but may remain stored for audit/replay.

**TTL refresh (normative):** Any evidence event — including `observed` — advances the claim's last-evidence tick for TTL purposes. Re-observing an existing claim (e.g., the bot walks past a known crafting table) refreshes its TTL window without changing its myelin level or confidence. This prevents passive decay of assets the bot continues to encounter, even if it does not actively use them.

---

## 4. Spatial Indexing Strategy

### 4.1 Indices

Maintain two indices:

* `chunkIndex: Map<string, Set<string>>` where key = `${dimension}:${cx},${cz}`
* `typeIndex: Map<string, Set<string>>` where key includes:

  * assetType
  * subType
  * each tag

### 4.2 Query: findNearest

Signature (conceptual):

* `findNearest({ fromPos, dimension, subType?, tags?, maxChunkRadius, topK })`

Algorithm:

1. Expand concentric chunk rings around bot chunk (0..maxChunkRadius).
2. Gather candidate assetIds from chunkIndex and filter via typeIndex (subType/tags).
3. Rank:

   * distance ASC
   * myelinLevel DESC
   * confidence DESC
   * lastUsedAtTick DESC
4. For top K:

   * attempt lightweight verification using VerifyMethod
   * append evidence verified/failed_verify
   * return first verified usable asset
5. If none verify, return null.

Fail-closed principle:

* For actions requiring existence (use furnace, open chest), treat unverified claims as non-actionable.
* For exploratory hints, L0/L1 can be used as soft priors (not hard commitments).

---

## 5. Anti-Reward-Hacking Constraints

### 5.1 Uniqueness budgets

Budgets are enforced per base and globally by `subType`.

```ts
export const ASSET_BUDGETS: Record<string, { maxPerBase: number; maxGlobal: number }> = {
  bed:            { maxPerBase: 1, maxGlobal: 3 },
  crafting_table: { maxPerBase: 1, maxGlobal: 3 },
  furnace:        { maxPerBase: 2, maxGlobal: 6 },
  blast_furnace:  { maxPerBase: 1, maxGlobal: 3 },
  chest:          { maxPerBase: 4, maxGlobal: 16 },
};
```

### 5.2 Place-vs-reuse gate (must run before any place:* action)

Gate inputs:

* desired subType
* baseId (optional)
* bot pos + dimension
* reuse radius (recommended 16-32 blocks; larger than local scan radius)

Gate procedure:

1. Query memory for same subType within REUSE_SEARCH_RADIUS.
2. If found and verified usable -> `REUSE(existingAssetId)`.
3. If found but not usable -> `REPAIR_OR_RELOCATE(existingAssetId)`; do not place duplicate.
4. If none found:

   * check budgets; if exceeded -> `DENY_BUDGET` (record evidence `budget_denied`)
   * else -> `ALLOW_PLACE`

Placement gate location:

* Must be enforced at the planning-to-execution boundary (LeafFactory/executor), not only within a specific leaf, to protect all planning pathways (reactive, scripted, Sterling-delegated).

### 5.3 Placement establishes ownership, not myelin

**Definitions**: "planning-eligible" means the planner may select the claim as a candidate target for goal-directed behavior. "Execution-eligible" means the executor has verified the affordance at runtime via verify-on-use. Myelin levels affect planner visibility and priority; they never bypass executor verification.

A successful placement by this bot is a privileged evidence event that implies both observation and ownership. It is sufficient to reach L2 ("owned, retrieval-durable, planning-eligible") because:

* The bot physically created the asset — this is stronger evidence than third-party observation.
* L2 status makes the asset durable in retrieval and available for planning, but **does not bypass verify-on-use**. All actions still require verification at execution time.
* Budgets and the place-vs-reuse gate (§5.1, §5.2) already prevent "spray and claim" behavior.

Placement alone is **not** sufficient to reach L3 ("myelinated"). L3 requires:

* >=10 successful `used` events
* zero failures in the recent evidence window
* high success rate and value score

This means: placing an asset creates a durable anchor; making it a trusted default attractor requires demonstrated reliable use over time.

Design note: for beds specifically, L3 should require successful sleep/spawn-set interactions, not mere placement and passive verification. This is enforced by the L3 `minUses` requirement. Telemetry guidance: emit `used` for beds only on successful sleep or spawn-point-set. Mere interaction (e.g., right-clicking a bed during daytime) should emit `verified` or `observed`, not `used`.

---

## 6. Integration Mapping to Existing Infrastructure

This section defines adapters and event hooks so the store can integrate without tight coupling.

### 6.1 PlaceGraph

Use PlaceGraph for coarse region context and fallback search when chunk indexing is incomplete.

```ts
export interface PlaceGraphAdapter {
  getPlaceIdForBlockPos(dimension: string, pos: { x: number; y: number; z: number }): string | null;
  estimateDistancePlaceIds(a: string, b: string): number; // graph distance or heuristic
}
```

AssetClaim.location.placeId can store PlaceGraph node id.

### 6.2 EntityBelief

For `assetType: 'person'`, claims should only be created from stable tracking.

```ts
export interface EntityBeliefAdapter {
  getStableTracks(minConfidence: number): Array<{
    trackId: string;
    entityId: string;
    pos: { x: number; y: number; z: number };
    confidence: number;
    kind: string;
  }>;
}
```

Mapping guidance:

* subType can be villager profession/kind.
* verifyMethod can be entity_uuid (or trackId-based verifier) where possible.

### 6.3 GoalBinding

Goal anchors should be able to reference assetIds to avoid duplicative scanning.

```ts
export interface GoalBindingAdapter {
  bindGoalToAsset(goalId: string, assetId: string): void;
}
```

### 6.4 LeafFactory / executor (primary integration)

All leaf outcomes should produce evidence updates. This is the "truth ingestion" boundary.

```ts
export type LeafName =
  | 'place_workstation'
  | 'craft_recipe'
  | 'smelt'
  | 'sleep'
  | 'open_container'
  | 'place_block'
  | string;

export interface LeafOutcomeEvent {
  tickId: number;
  timestampMs: number;
  leafName: LeafName;
  success: boolean;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: string; retryable: boolean; detail?: string };
  botPos: { x: number; y: number; z: number };
  dimension: string;

  // Attribution fields (set by the emission site after leaf.run() returns):
  targetAssetId?: string;          // If the executor resolved a claim before running the leaf
  failureReason?: string;          // Leaf-specific reason code (see §6.6.2)
}

export interface AssetMemoryHooks {
  onLeafOutcome(ev: LeafOutcomeEvent): void;
}
```

Required leaf telemetry augmentation (if missing today):

* For any leaf that "uses" an asset, include the asset position or assetId in result metadata (e.g., furnacePos, chestPos, workstationPos), so evidence can be attributed correctly.

### 6.5 Leaf outcome → evidence mapping table

This table is the canonical reference for the `onLeafOutcome` adapter. It defines, for every asset-touching leaf, exactly what evidence event(s) to emit, where to find the attribution source (position or assetId) in the leaf result, and the success semantics. Leaves not listed here do not touch assets and produce no evidence.

**Reading the table:**

- **leafName**: the string key used in dispatch (matches `LeafOutcomeEvent.leafName`).
- **Asset touched**: `assetType:subType` of the claim to upsert or update.
- **eventType on success / failure**: evidence event(s) to append. A `/` means "this column for success, that column for failure."
- **Attribution source**: the field path in `LeafOutcomeEvent.result` that provides the asset's world position. If marked "⚠ MISSING", the leaf does not currently return this field and must be augmented before integration.
- **Success semantics**: what "success" means for this leaf in terms of evidence quality.
- **Gate**: whether this leaf requires the place-vs-reuse gate (§5.2) before execution.

**Emission precondition (normative):** The adapter must only emit evidence when it has (1) a concrete attribution position or assetId and (2) an interaction outcome that is semantically tied to the asset's existence or usability. If either is missing, emit no evidence. This prevents "phantom failures" where a leaf fails but you don't know which asset it touched.

**Targeted vs search mode (normative):** Leaf outcomes occur in one of two modes, determined by whether the adapter can identify a specific claim that was acted upon:

* **Targeted mode**: the leaf outcome includes a concrete attribution (a `targetAssetId` in the event, or a `result.position` that the adapter can match to an existing claim). The adapter knows *which* claim the outcome applies to. Failures like `block_missing` and `block_mismatch` emit `failed_verify` against that specific claim.
* **Search mode**: the leaf searched a radius and either found something (attribution comes from the result) or found nothing ("none in range"). If the leaf found and interacted with an asset, that is targeted mode for the interaction. If the leaf found nothing, there is no attribution — emit no evidence. Reason codes like `no_bed`, `no_workstation`, and `no_furnace` are search-mode "not found" outcomes — they do not demote any specific claim because no claim was targeted.

The adapter determines mode as follows: if `ev.targetAssetId` is set, or if the result contains a position that matches an existing claim (via chunk index lookup), the outcome is targeted. Otherwise it is search-mode. Search-mode failures with no attribution produce no evidence entries.

**Failure classification rule (normative):** When the adapter has attribution (targeted mode), leaf failure is classified as:

- **(a) Asset invalidity** — the claimed affordance is false at the attributed position (block absent, wrong subtype, destroyed). Emit `failed_verify`. Requires: targeted mode + reason code in the asset-failure set.
- **(b) Asset structural blockage** — the affordance physically exists but is permanently or durably blocked (bed spawn-obstructed by solid blocks). Emit `failed_use`. Requires: targeted mode + reason code in the structural-failure set.
- **(c) Precondition failure** — the failure is unrelated to the asset's existence or usability (missing ingredients, no fuel, inventory full, no recipe match). Emit `execution_failed` (does not affect streaks or L3 maintenance; same exclusion as `budget_denied`).
- **(d) Transient/environmental failure** — the failure is due to external factors that will likely resolve on their own (combat interruption, pathing timeout, chunk unloaded, container temporarily in use by another entity, UI timeout). Emit `execution_failed` or no evidence.

The adapter must inspect `result.failureReason` (see §6.6) to classify failures. If `failureReason` is absent or unrecognized, the safe default is `execution_failed` (not `failed_verify`/`failed_use`). Only emit trust-affecting failure evidence when the reason code explicitly indicates asset invalidity or structural blockage.

**Asset-failure reason codes** (the only codes that produce `failed_verify`; require targeted mode):
`'block_missing'`, `'block_mismatch'`, `'entity_missing'`

**Asset-structural-failure reason codes** (the only codes that produce `failed_use`; require targeted mode):
`'bed_obstructed'`

**Transient/environmental codes** (produce `execution_failed`; formerly trust-affecting, reclassified):
`'container_busy'`, `'workstation_blocked'`, `'ui_timeout'`, `'interrupted'`, `'unreachable'`

Design note: `container_busy` and `workstation_blocked` were originally classified as `failed_use` (asset interaction failure). They are reclassified as transient because in Minecraft these are concurrency/UI states that resolve on their own — a chest being opened by another player or a workstation blocked by a mob are not durable properties of the asset. Emitting `failed_use` for transient states would create noisy demotions of reliable assets.

All other reason codes (including absence of a reason code, and search-mode "not found" codes like `no_bed`, `no_workstation`) produce `execution_failed` or no evidence.

#### Workstation leaves

| leafName | Asset touched | Success eventType | Failure eventType | Attribution source | Success semantics | Gate |
|---|---|---|---|---|---|---|
| `place_workstation` (reuse path) | `workstation:{subType}` | `verified` | (see classification rule) | `result.position` ✅ | Existing workstation found and usable at returned position | — |
| `place_workstation` (place path) | `workstation:{subType}` | `placed` | — (leaf fails, no claim created) | `result.position` ✅ | New workstation placed at returned position; upsert new claim | **place-vs-reuse** |
| `craft_recipe` | `workstation:crafting_table` | `used` | (see classification rule) | ⚠ MISSING — needs `result.workstationPos` | Recipe crafted successfully using the workstation at this position | — |
| `smelt` | `workstation:furnace` or `workstation:blast_furnace` | `used` | (see classification rule) | ⚠ MISSING — needs `result.furnacePos` | Items smelted successfully using the furnace at this position | — |

Notes:
- `place_workstation` emits two different event types depending on `result.reused` (boolean, ✅ already present). The adapter checks: if `result.reused === true`, emit `verified`; if `result.reused === false`, emit `placed`. On failure of the reuse path: if `failureReason` is `block_missing` or `block_mismatch`, emit `failed_verify`. If `failureReason` is `unreachable`, `interrupted`, or absent, emit `execution_failed` (not `failed_verify` — the asset may still exist, the bot just couldn't reach it).
- `craft_recipe` currently searches within 6 blocks and may fall back to inventory 2×2 grid. When using inventory crafting (no workstation), no evidence is emitted. The adapter must check whether a workstation was used. Attribution field needed: `result.workstationPos: {x,y,z} | null`. On failure: `no_recipe`, `missing_ingredients`, `no_fuel` → `execution_failed` (precondition, not asset fault). `no_workstation`, `block_missing` → `failed_verify` (workstation claim invalid). `workstation_blocked` → `failed_use` (asset exists but unusable). `interrupted`, `ui_timeout` → `execution_failed`.
- `smelt` currently searches within 6 blocks. Attribution field needed: `result.furnacePos: {x,y,z}`. Subtype detection: check block name at `furnacePos` (furnace vs blast_furnace). On failure: same classification as `craft_recipe` — only `block_missing`/`block_mismatch` produce `failed_verify`; `no_fuel`/`no_input`/`output_blocked` produce `execution_failed`.

#### Container leaves

| leafName | Asset touched | Success eventType | Failure eventType | Attribution source | Success semantics | Gate |
|---|---|---|---|---|---|---|
| `open_container` | `container:{containerType}` | `used` | (see classification rule) | `result.position` ✅ | Container opened and contents read at returned position | — |
| `transfer_items` | `container:{containerType}` | `used` | (see classification rule) | ⚠ PARTIAL — `result.sourceContainer` and `result.destinationContainer` are IDs (format `type_x_y_z`), not positions. Parse position from ID or add explicit `result.sourcePos` / `result.destPos`. | Items transferred successfully between containers | — |
| `close_container` | `container:{containerType}` | `verified` | — (no trust-affecting failure; close failures are UI state, not asset property) | `result.containerId` (parseable to position) | Container confirmed closed; lightweight verification | — |

Notes:
- `open_container` already returns `result.position` and `result.containerType` ✅. On failure: `block_missing` → `failed_verify`. `container_busy` → `failed_use`. `unreachable`, `inventory_full` → `execution_failed`.
- `close_container` emits `verified` on success. On failure, emit no evidence — close failures are UI state, not asset invalidity.
- `transfer_items` touches both source and destination containers. Emit `used` evidence for both if both are asset-tracked containers. On failure: `block_missing` → `failed_verify` against the missing container. `inventory_full`, `no_space` → `execution_failed`. `interrupted` → `execution_failed`.

#### Bed leaf

| leafName | Asset touched | Success eventType | Failure eventType | Attribution source | Success semantics | Gate |
|---|---|---|---|---|---|---|
| `sleep` (found existing) | `bed:bed` | (see outcome mapping below) | (see outcome mapping below) | `result.bedPosition` ✅ | Outcome depends on `sleepOutcome` reason code | — |
| `sleep` (placed new bed) | `bed:bed` | `placed` then (see outcome mapping) | `placed` then (see outcome mapping) | `result.bedPosition` ✅ | Bed placed first, then sleep outcome mapped separately | **place-vs-reuse** |

**Sleep outcome mapping (normative):** The `sleep` leaf must include a `sleepOutcome` reason code in its result. Mapping:

| `sleepOutcome` | Evidence emitted | Rationale |
|---|---|---|
| `slept` | `used` | Successful sleep — the bed's core affordance worked |
| `spawn_set` | `used` | Spawn point set — equivalent to successful use |
| `daytime` | `verified` | Bed exists and was interacted with, but sleep is time-gated. Does not punish the claim. Resets streak (it's a successful `verified`). |
| `unsafe` | `verified` | Bed exists, but monsters prevent sleep. This is an environmental constraint, not bed unreliability. Does not punish the claim. |
| `no_bed` / `block_missing` | `failed_verify` | The expected bed block is absent at the attributed position |
| `bed_obstructed` | `failed_use` | Bed exists but is physically blocked (spawn-obstruction check fails) |
| `unreachable` / `interrupted` | `execution_failed` | Pathing/environmental failure unrelated to asset reliability |

Notes:
- The `sleep` leaf already returns `result.bedPosition` and `result.placed` (boolean) ✅. It needs the additional `result.sleepOutcome` field (see §6.6).
- When `result.placed === true`, emit `placed` evidence first (upserts claim at L2 via ownership path), then apply the outcome mapping for the sleep attempt.
- The key distinction: `daytime` and `unsafe` confirm the bed exists (emit `verified`), while `no_bed` indicates the affordance claim is invalid (emit `failed_verify`). The previous version incorrectly mapped `unsafe` to `failed_use`, which would demote perfectly reliable beds during hostile nights.

#### Farming leaves

| leafName | Asset touched | Success eventType | Failure eventType | Attribution source | Success semantics | Gate |
|---|---|---|---|---|---|---|
| `till_soil` | `farm:farmland` | `placed` | — (leaf fails, no claim) | `result.position` ✅ | Soil tilled at position; creates new farm-type asset | — |
| `plant_crop` | `farm:{cropType}` | `placed` | — | `result.position` ✅ | Crop planted at position; creates crop-type claim | — |
| `harvest_crop` | `farm:{cropType}` | `used` | `failed_use` | `result.position` ✅ | Mature crop harvested at position | — |
| `manage_farm` | `farm:{cropType}` | (compound) | (compound) | `result.details` (aggregated) | Compound operation; emit per-operation evidence from `details.tilled`, `details.planted`, `details.harvested` counts | — |

Notes:
- **Deferred from initial integration slice.** Farm representation (point-claim vs region-claim) is undecided. The adapter should not emit farm evidence until a representation is committed. The tables and types above are included for completeness and future planning.
- Farm assets are area-based rather than point-based. Individual tile claims may be too granular. Alternative: track farm *regions* as base-level claims with `assetType: 'farm'` and use per-tile evidence as supporting detail.
- `manage_farm` is a compound leaf that internally calls till/plant/harvest. The adapter should either (a) treat it as a single `used` event against a farm region claim, or (b) decompose into per-operation events. Option (a) is recommended for simplicity.
- Farm claims do not require the place-vs-reuse gate (no uniqueness budget constraint on farmland).

#### Interaction leaves (asset-relevant subset)

| leafName | Asset touched | Success eventType | Failure eventType | Attribution source | Success semantics | Gate |
|---|---|---|---|---|---|---|
| `interact_with_block` | varies by `result.blockType` | `verified` | (see classification rule) | `result.position` ✅ | Block interaction confirms existence. Map `blockType` to assetType/subType only for the tracked asset set: crafting_table, furnace, blast_furnace, chest, trapped_chest, hopper, dispenser, bed variants. Non-asset blocks (doors, buttons, levers) produce no evidence. | — |
| `place_block` (when placing budgeted item) | `workstation:{subType}` or `container:{subType}` or `bed:bed` | `placed` | — | `result.position` ✅ | Generic block placement. Only emit evidence when the placed item is a budgeted asset type (crafting_table, furnace, chest, bed, etc.). | **place-vs-reuse** (if budgeted subType) |

Notes:
- `place_block` is a generic leaf. The adapter must inspect `args.item` to determine if the placed block is an asset-tracked type. If `args.item` matches a key in `ASSET_BUDGETS` or is a recognized `subType`, emit `placed` and enforce the gate. Otherwise, no evidence.
- `interact_with_block` provides lightweight verification. The adapter maps `result.blockType` to known asset types: if `blockType` is `crafting_table`/`furnace`/etc., emit `verified` against the matching claim. If no matching claim exists and the block is asset-eligible, upsert a new L0 claim with `observed` evidence.

#### Entity leaves (person-type assets)

| leafName | Asset touched | Success eventType | Failure eventType | Attribution source | Success semantics | Gate |
|---|---|---|---|---|---|---|
| `follow_entity` | `person:{entityType}` | `verified` | `failed_verify` | ⚠ MISSING — needs `result.entityPos` and `result.entityType` | Entity found and followed; confirms existence at position | — |

Notes:
- Person-type claims are only created from stable tracking (§6.2 EntityBeliefAdapter). `follow_entity` can verify an existing claim but should not create new claims — entity sightings during follow are transient.
- `attack_entity`, `sense_hostiles`, and `retreat_from_threat` are combat/sensing leaves that do not create or update asset claims. Hostile mobs are not "assets."

#### Leaves that do NOT emit evidence

The following leaves do not touch tracked assets and produce no evidence events:

| leafName | Reason |
|---|---|
| `move_to` | Movement only; no asset interaction |
| `step_forward_safely` | Movement only |
| `introspect_recipe` | Read-only; no world mutation |
| `manage_inventory` | Inventory only; no world asset |
| `consume_food` | Inventory only |
| `equip_weapon` / `equip_tool` | Inventory only |
| `use_item` | Generic item use; no asset tracking |
| `collect_items` | Dropped item pickup; no placed asset |
| `dig_block` | Block destruction (could emit `failed_verify` if digging a tracked asset, but this is an edge case — see below) |
| `place_torch_if_needed` | Decorative; not budgeted or tracked |
| `find_resource` | Read-only scan |
| `get_light_level` / `sense_hostiles` | Sensing only |
| `chat` / `wait` | No world interaction |
| `build_structure` | Generic construction; not asset-tracked (yet) |
| `control_environment` | Chat commands only |
| `prepare_site` / `build_module` / `place_feature` | Stubs (no world mutation) |
| `operate_piston` / `control_redstone` | Redstone devices; not currently tracked |

Edge case — `dig_block` destroying a tracked asset: if a `dig_block` action destroys a block that matches a known asset claim (e.g., breaking a crafting table), the adapter should emit `failed_verify` against that claim. This requires cross-referencing `dig_block.result.position` + `result.blockType` against the chunk index. This is a low-priority enhancement; initial integration can omit it.

### 6.6 Leaf result augmentation requirements

Based on the mapping table above, the following leaf result types need augmentation before the adapter can attribute evidence correctly. This section covers both **attribution fields** (where is the asset?) and **reason codes** (why did it fail?).

#### 6.6.1 Missing attribution fields

| leafName | Missing field | Type | Source |
|---|---|---|---|
| `craft_recipe` | `workstationPos` | `{x: number, y: number, z: number} \| null` | The position of the crafting table used (null if inventory 2×2 grid) |
| `craft_recipe` | `craftedUsing` | `'workstation' \| 'inventory'` | Explicit flag; alternative to null-checking `workstationPos` |
| `smelt` | `furnacePos` | `{x: number, y: number, z: number}` | The position of the furnace/blast_furnace used |
| `smelt` | `furnaceType` | `'furnace' \| 'blast_furnace'` | Subtype of the furnace used (avoids re-verification in adapter) |
| `sleep` | `sleepOutcome` | `SleepOutcome` (see below) | Reason code for sleep result classification |
| `follow_entity` | `entityPos` | `{x: number, y: number, z: number}` | Last known position of followed entity |
| `follow_entity` | `entityType` | `string` | Entity type (villager, etc.) |
| `transfer_items` | `sourcePos` | `{x: number, y: number, z: number}` | Explicit position (instead of parsing containerId) |
| `transfer_items` | `destPos` | `{x: number, y: number, z: number}` | Explicit position |

All other asset-touching leaves already return the necessary attribution data in their results.

#### 6.6.2 Failure reason codes

The adapter requires a `failureReason` field on failure results for the high-ambiguity leaves. Without it, the adapter cannot distinguish asset failures from precondition failures and must default to `execution_failed` (no trust impact).

```ts
/** Minimal failure reason unions for asset-touching leaves. */

type CraftSmeltFailureReason =
  | 'no_recipe'            // recipe doesn't exist
  | 'missing_ingredients'  // inventory lacks required items
  | 'no_fuel'              // smelt-only: no fuel in inventory
  | 'no_workstation'       // no workstation found within search radius
  | 'block_missing'        // workstation claim exists but block is absent
  | 'block_mismatch'       // block exists but wrong type
  | 'workstation_blocked'  // workstation exists but interaction blocked
  | 'output_blocked'       // furnace output slot full
  | 'ui_timeout'           // UI interaction timed out
  | 'interrupted';         // combat or abort signal

type ContainerFailureReason =
  | 'block_missing'        // container not found at expected position
  | 'block_mismatch'       // block exists but not a container
  | 'container_busy'       // container in use by another entity
  | 'inventory_full'       // bot inventory cannot accept items
  | 'no_space'             // container has no empty slots
  | 'unreachable'          // cannot path to container
  | 'interrupted';         // combat or abort signal

type SleepOutcome =
  | 'slept'                // successfully slept through night
  | 'spawn_set'            // spawn point set (may not have slept)
  | 'daytime'              // bed exists but not night time
  | 'unsafe'               // monsters nearby prevent sleep
  | 'no_bed'               // no bed found in search radius
  | 'block_missing'        // bed claim exists but block is absent
  | 'bed_obstructed'       // bed exists but spawn-obstruction check fails
  | 'unreachable'          // cannot path to bed
  | 'interrupted';         // combat or abort signal

type PlaceWorkstationFailureReason =
  | 'block_missing'        // reuse target absent
  | 'block_mismatch'       // reuse target wrong type
  | 'unreachable'          // cannot path to placement site
  | 'inventory_missing'    // don't have the block to place
  | 'no_valid_position'    // no suitable placement position found
  | 'sprawl_limit'         // too many same-type blocks nearby
  | 'interrupted';         // combat or abort signal
```

**Adapter classification algorithm:**

```ts
/** Classify a leaf failure reason into an evidence event type.
 *  Returns null if no evidence should be emitted (search-mode, no attribution). */
function classifyFailure(
  failureReason: string | undefined,
  hasAttribution: boolean,           // true if targetAssetId or result position matched a claim
): EvidenceEventType | null {
  // No attribution → search-mode "not found" or unattributable failure → no evidence
  if (!hasAttribution) return null;

  // Asset-invalidity codes → failed_verify (trust-affecting, targeted mode only)
  if (failureReason === 'block_missing' || failureReason === 'block_mismatch' ||
      failureReason === 'entity_missing') {
    return 'failed_verify';
  }
  // Asset-structural-failure codes → failed_use (trust-affecting, targeted mode only)
  if (failureReason === 'bed_obstructed') {
    return 'failed_use';
  }
  // Everything else → execution_failed (non-trust-affecting)
  // This includes: missing_ingredients, no_fuel, inventory_full, no_space,
  // container_busy, workstation_blocked (transient), unreachable, interrupted,
  // ui_timeout, output_blocked, no_recipe, no_workstation, no_bed (search-mode),
  // and any unrecognized/absent reason code.
  return 'execution_failed';
}
```

The safe default is `execution_failed`. Combined with the `hasAttribution` gate, this means:

* A leaf that fails without attribution (e.g., "no furnace found in 6 blocks") produces no evidence at all.
* A leaf that fails with attribution but no reason code produces `execution_failed` (neutral).
* A leaf that fails with attribution + `block_missing` produces `failed_verify` (trust-affecting).

Trust is only decreased when (1) a specific claim was targeted and (2) the leaf explicitly reports that the world contradicts the claim.

### 6.7 Adapter contract: `onLeafOutcome` implementation

This section defines the concrete adapter that sits between the executor dispatch point and the `ReferenceAssetMemoryStore`. It is a pure function (no side effects beyond evidence emission) and is testable with synthetic `LeafOutcomeEvent` inputs.

**Design invariants:**

1. **AssetRef, not nullable assetId.** Emissions use a discriminated `AssetRef` union that is either `{ kind: 'existing', assetId }` or `{ kind: 'upsert', ... }`. This prevents the bug where a second emission after an upsert has `assetId: null` but no upsert data (the "bed placed-then-used" problem).
2. **Two-phase apply with `{claim, created}`.** The wiring loop first processes all `upsert` emissions by calling `store.upsertClaim()`, which returns `{ claim, created: boolean }`. `created=true` means a new claim with auto-observed entry; `created=false` means the claim already existed. Phase 2 uses `created` to determine tick offsets and whether to skip duplicate `observed` emissions.
3. **Hardened resolve with proximity.** `targetAssetId` is validated for subType match, dimension match, and proximity to `botPos` (within `ADAPTER_SANITY_RADIUS = 64` blocks). Position-based fallback uses `store.resolveByPosition()` (read-only, no verify-on-use).
4. **Explicit tick offsets (no implicit hack).** `upsertClaim` auto-creates an `observed` entry at `firstSeenTick` when `created=true`. Follow-up emissions use `tickId + offset` where offset depends on `created` and emission count. This is an explicit wiring contract, not an invisible +1 assumption.
5. **Canonical success via `isSuccessEvent()`.** The `success` field is derived from the event type, not computed ad-hoc.
6. **Upsert-on-success policy.** Documented per leaf: `place_workstation`, `place_block`, `sleep` (when bed placed), `open_container`, and `interact_with_block` may upsert. `craft_recipe` and `smelt` never upsert (they only record evidence against existing claims).
7. **Collision-safe upsertKeys.** Keys include `dimension` and `subType` in addition to position: `prefix:dimension:subType:x,y,z`. Prevents cross-dimension or cross-subtype collisions.
8. **Per-claim tickId monotonicity.** `tickId` is monotonically increasing within each claim's evidence ledger, not globally. The wiring synthesizes local offsets for multi-emission leaf outcomes. See §6.7.4.

#### 6.7.1 Types

```ts
import type {
  EvidenceEventType,
  Vec3i,
  AssetType,
  ReferenceAssetMemoryStore,
} from './asset-memory-store';
import { isSuccessEvent } from './asset-memory-store';

/**
 * AssetRef: discriminated union for emission targets.
 * - 'existing': append evidence to an already-known assetId.
 * - 'upsert': create a new claim if one doesn't exist at this position.
 *   The upsertKey ties follow-up emissions to the same claim.
 */
export type AssetRef =
  | { kind: 'existing'; assetId: string }
  | { kind: 'upsert'; upsertKey: string; assetType: AssetType; subType: string; blockPos: Vec3i; tags: string[] };

/** The output of the adapter: zero or more evidence emission intents. */
export interface EvidenceEmission {
  /** Target claim reference: existing or upsert-new. */
  target: AssetRef;
  /** The evidence event type to emit. */
  eventType: EvidenceEventType;
  /** Additional details to store in the evidence entry. */
  details: Record<string, unknown>;
}

/** Resolved attribution: a specific claim was identified for this outcome. */
export interface Attribution {
  assetId: string;
  blockPos: Vec3i;
  assetType: AssetType;
  subType: string;
}
```

#### 6.7.2 Leaf-specific extractors

Each asset-touching leaf has an extractor that reads its result and returns zero or more `EvidenceEmission` intents. Extractors are keyed by `leafName` and called by the adapter's main dispatch.

**Attribution resolution contract:** `resolve(pos, subType)` is passed to each extractor. It finds a matching existing claim using (1) `targetAssetId` if set and valid, or (2) position-based spatial lookup. `resolveByTargetId(subType)` is a variant that uses only `targetAssetId` without requiring a position — for targeted-mode flows where the leaf doesn't report a result position.

**Upsert-on-success policy (normative):**

| Leaf | Upserts on success? | Rationale |
|---|---|---|
| `place_workstation` | Yes (placed or reused-unknown) | Creates/tracks the workstation |
| `place_block` | Yes (budgeted types only) | Creates a claim for the placed block |
| `sleep` | Yes (when bed was placed) | Tracks the new bed |
| `open_container` | Yes (unknown container) | Discovers and tracks containers |
| `interact_with_block` | Yes (unknown tracked block) | Passive discovery of world blocks |
| `craft_recipe` | **No** | Only records evidence against known claims |
| `smelt` | **No** | Only records evidence against known claims |

Rationale for "no upsert" on `craft_recipe`/`smelt`: these leaves interact with workstations that should have been discovered by `place_workstation`, `interact_with_block`, or the place-vs-reuse gate. If the workstation is unknown, the evidence is unattributable and dropped. This prevents phantom claims from noisy position data.

```ts
/** Maps leafName → extractor. Leaves not in this map produce no evidence. */
const LEAF_EXTRACTORS: Record<string, (
  ev: LeafOutcomeEvent,
  resolve: (pos: Vec3i, subType: string) => Attribution | null,
  resolveByTargetId: (subType: string) => Attribution | null,
) => EvidenceEmission[]> = {

  place_workstation(ev, resolve, resolveByTargetId) {
    if (!ev.success) {
      // Failure: classify using reason code + attribution
      // Use position if available, otherwise try targetAssetId
      const pos = ev.result?.position as Vec3i | undefined;
      const subType = ev.args.workstation as string;
      const attr = pos ? resolve(pos, subType) : resolveByTargetId(subType);
      const classified = classifyFailure(ev.failureReason, attr !== null);
      if (!classified || !attr) return [];
      return [{
        target: { kind: 'existing', assetId: attr.assetId },
        eventType: classified,
        details: { leaf: 'place_workstation', failureReason: ev.failureReason },
      }];
    }
    const pos = ev.result!.position as Vec3i;
    const subType = ev.args.workstation as string;
    const reused = ev.result!.reused as boolean;
    if (reused) {
      const attr = resolve(pos, subType);
      if (attr) {
        return [{
          target: { kind: 'existing', assetId: attr.assetId },
          eventType: 'verified',
          details: { leaf: 'place_workstation', reused: true },
        }];
      }
      // Reused but unknown → upsert as verified (passive discovery)
      return [{
        target: { kind: 'upsert', upsertKey: `pw:${ev.dimension}:${subType}:${pos.x},${pos.y},${pos.z}`, assetType: 'workstation', subType, blockPos: pos, tags: [] },
        eventType: 'verified',
        details: { leaf: 'place_workstation', reused: true },
      }];
    }
    // Place path: upsert new claim with placed event
    return [{
      target: { kind: 'upsert', upsertKey: `pw:${ev.dimension}:${subType}:${pos.x},${pos.y},${pos.z}`, assetType: 'workstation', subType, blockPos: pos, tags: [] },
      eventType: 'placed',
      details: { leaf: 'place_workstation' },
    }];
  },

  craft_recipe(ev, resolve, resolveByTargetId) {
    // Attribution: prefer result.workstationPos, fall back to targetAssetId
    const pos = ev.result?.workstationPos as Vec3i | undefined;
    const attr = pos
      ? resolve(pos, 'crafting_table')
      : resolveByTargetId('crafting_table');
    if (!attr) return [];  // Inventory crafting or unknown workstation → no evidence
    if (ev.success) {
      return [{
        target: { kind: 'existing', assetId: attr.assetId },
        eventType: 'used',
        details: { leaf: 'craft_recipe', recipe: ev.args.recipe },
      }];
    }
    const classified = classifyFailure(ev.failureReason, true);
    if (!classified) return [];
    return [{
      target: { kind: 'existing', assetId: attr.assetId },
      eventType: classified,
      details: { leaf: 'craft_recipe', failureReason: ev.failureReason },
    }];
  },

  smelt(ev, resolve, resolveByTargetId) {
    const pos = ev.result?.furnacePos as Vec3i | undefined;
    const furnaceType = (ev.result?.furnaceType as string) ?? 'furnace';
    const attr = pos
      ? resolve(pos, furnaceType)
      : resolveByTargetId(furnaceType);
    if (!attr) return [];
    if (ev.success) {
      return [{
        target: { kind: 'existing', assetId: attr.assetId },
        eventType: 'used',
        details: { leaf: 'smelt', input: ev.args.input },
      }];
    }
    const classified = classifyFailure(ev.failureReason, true);
    if (!classified) return [];
    return [{
      target: { kind: 'existing', assetId: attr.assetId },
      eventType: classified,
      details: { leaf: 'smelt', failureReason: ev.failureReason },
    }];
  },

  sleep(ev, resolve) {
    const bedPos = ev.result?.bedPosition as Vec3i | undefined;
    if (!bedPos) return [];
    const attr = resolve(bedPos, 'bed');
    const placed = ev.result?.placed as boolean;
    const sleepOutcome = ev.result?.sleepOutcome as string | undefined;
    const emissions: EvidenceEmission[] = [];

    // Upsert key for two-phase apply: ties placed + follow-up emissions together
    const upsertKey = `bed:${ev.dimension}:bed:${bedPos.x},${bedPos.y},${bedPos.z}`;

    // If bed was placed, emit placed event (upsert new claim in phase 1)
    if (placed) {
      emissions.push({
        target: { kind: 'upsert', upsertKey, assetType: 'bed', subType: 'bed', blockPos: bedPos, tags: ['safety'] },
        eventType: 'placed',
        details: { leaf: 'sleep', placed: true },
      });
    }

    // Map sleepOutcome to evidence event (see §6.5 bed outcome mapping).
    // For the target: use existing attribution if available, otherwise reference
    // the upsert from above via upsertKey. If neither exists, emit nothing.
    const target: AssetRef | null = attr
      ? { kind: 'existing', assetId: attr.assetId }
      : placed
        ? { kind: 'upsert', upsertKey, assetType: 'bed', subType: 'bed', blockPos: bedPos, tags: ['safety'] }
        : null;

    if (!target) return emissions;  // No attribution, no upsert → outcome evidence dropped

    switch (sleepOutcome) {
      case 'slept':
      case 'spawn_set':
        emissions.push({ target, eventType: 'used', details: { leaf: 'sleep', sleepOutcome } });
        break;
      case 'daytime':
      case 'unsafe':
        emissions.push({ target, eventType: 'verified', details: { leaf: 'sleep', sleepOutcome } });
        break;
      case 'block_missing':
        // Only against existing claims — if we just placed it, block_missing is contradictory
        if (attr) emissions.push({ target: { kind: 'existing', assetId: attr.assetId }, eventType: 'failed_verify', details: { leaf: 'sleep', sleepOutcome } });
        break;
      case 'bed_obstructed':
        if (attr) emissions.push({ target: { kind: 'existing', assetId: attr.assetId }, eventType: 'failed_use', details: { leaf: 'sleep', sleepOutcome } });
        break;
      default:
        // unreachable, interrupted → execution_failed against existing claims only
        if (attr) emissions.push({ target: { kind: 'existing', assetId: attr.assetId }, eventType: 'execution_failed', details: { leaf: 'sleep', sleepOutcome } });
        break;
    }
    return emissions;
  },

  open_container(ev, resolve) {
    const pos = ev.result?.position as Vec3i | undefined;
    if (!pos) return [];
    const containerType = (ev.result?.containerType as string) ?? 'chest';
    const attr = resolve(pos, containerType);
    if (ev.success) {
      if (!attr) {
        // Unknown container on success → upsert (passive discovery)
        return [{
          target: { kind: 'upsert', upsertKey: `oc:${ev.dimension}:${containerType}:${pos.x},${pos.y},${pos.z}`, assetType: 'container', subType: containerType, blockPos: pos, tags: ['storage'] },
          eventType: 'used',
          details: { leaf: 'open_container' },
        }];
      }
      return [{
        target: { kind: 'existing', assetId: attr.assetId },
        eventType: 'used',
        details: { leaf: 'open_container' },
      }];
    }
    const classified = classifyFailure(ev.failureReason, attr !== null);
    if (!classified || !attr) return [];
    return [{
      target: { kind: 'existing', assetId: attr.assetId },
      eventType: classified,
      details: { leaf: 'open_container', failureReason: ev.failureReason },
    }];
  },

  interact_with_block(ev, resolve) {
    if (!ev.success) return []; // Interaction failures are too ambiguous without reason codes
    const pos = ev.result?.position as Vec3i | undefined;
    const blockType = ev.result?.blockType as string | undefined;
    if (!pos || !blockType) return [];
    // Only emit for tracked asset block types
    const TRACKED: Record<string, { assetType: AssetType; subType: string }> = {
      crafting_table: { assetType: 'workstation', subType: 'crafting_table' },
      furnace: { assetType: 'workstation', subType: 'furnace' },
      blast_furnace: { assetType: 'workstation', subType: 'blast_furnace' },
      chest: { assetType: 'container', subType: 'chest' },
      trapped_chest: { assetType: 'container', subType: 'trapped_chest' },
      hopper: { assetType: 'container', subType: 'hopper' },
      dispenser: { assetType: 'container', subType: 'dispenser' },
    };
    const tracked = TRACKED[blockType];
    if (!tracked) return [];
    const attr = resolve(pos, tracked.subType);
    if (attr) {
      return [{
        target: { kind: 'existing', assetId: attr.assetId },
        eventType: 'verified',
        details: { leaf: 'interact_with_block', blockType },
      }];
    }
    // Unknown tracked block → upsert as observed (passive discovery)
    return [{
      target: { kind: 'upsert', upsertKey: `ib:${ev.dimension}:${tracked.subType}:${pos.x},${pos.y},${pos.z}`, ...tracked, blockPos: pos, tags: [] },
      eventType: 'observed',
      details: { leaf: 'interact_with_block', blockType },
    }];
  },

  place_block(ev) {
    if (!ev.success) return [];
    const pos = ev.result?.position as Vec3i | undefined;
    const item = ev.args?.item as string | undefined;
    if (!pos || !item) return [];
    // Only emit for budgeted asset types
    const BUDGETED: Record<string, { assetType: AssetType; subType: string }> = {
      crafting_table: { assetType: 'workstation', subType: 'crafting_table' },
      furnace: { assetType: 'workstation', subType: 'furnace' },
      blast_furnace: { assetType: 'workstation', subType: 'blast_furnace' },
      chest: { assetType: 'container', subType: 'chest' },
    };
    // Also match bed variants
    if (item.endsWith('_bed') || item === 'bed') {
      return [{
        target: { kind: 'upsert', upsertKey: `pb:${ev.dimension}:bed:${pos.x},${pos.y},${pos.z}`, assetType: 'bed', subType: 'bed', blockPos: pos, tags: ['safety'] },
        eventType: 'placed',
        details: { leaf: 'place_block', item },
      }];
    }
    const budgeted = BUDGETED[item];
    if (!budgeted) return [];
    return [{
      target: { kind: 'upsert', upsertKey: `pb:${ev.dimension}:${budgeted.subType}:${pos.x},${pos.y},${pos.z}`, ...budgeted, blockPos: pos, tags: [] },
      eventType: 'placed',
      details: { leaf: 'place_block', item },
    }];
  },
};
```

#### 6.7.3 Main adapter function

```ts
/** Maximum distance (blocks) between bot position and claim position for
 *  targetAssetId-based attribution to be valid. Prevents stale targetAssetIds
 *  from misattributing outcomes to distant claims. Set conservatively above
 *  typical interact radius to tolerate pathing drift, but low enough to
 *  reject cross-base misattribution. */
const ADAPTER_SANITY_RADIUS = 64;

/**
 * Resolve attribution for a leaf outcome.
 * Uses two strategies:
 * 1. targetAssetId (fast path): validated for subType, dimension, and proximity.
 * 2. Position-based lookup (slow path): resolveByPosition with subType filter.
 */
function makeResolvers(
  ev: LeafOutcomeEvent,
  store: ReferenceAssetMemoryStore,
): {
  resolve: (pos: Vec3i, subType: string) => Attribution | null;
  resolveByTargetId: (subType: string) => Attribution | null;
} {
  const resolveByTargetId = (subType: string): Attribution | null => {
    if (!ev.targetAssetId) return null;
    const claim = store.get(ev.targetAssetId);
    if (!claim) return null;
    // Validate subType match — prevents misattribution when targetAssetId
    // references a different asset type (e.g., furnace targeted but bed found)
    if (claim.subType !== subType) return null;
    // Validate dimension match
    if (claim.location.dimension !== ev.dimension) return null;
    // Validate proximity: claim must be within sanity radius of bot position.
    // Uses floored botPos for block-coordinate comparison.
    const botBlock: Vec3i = {
      x: Math.floor(ev.botPos.x),
      y: Math.floor(ev.botPos.y),
      z: Math.floor(ev.botPos.z),
    };
    if (dist(botBlock, claim.location.blockPos) > ADAPTER_SANITY_RADIUS) return null;
    return {
      assetId: claim.assetId,
      blockPos: claim.location.blockPos,
      assetType: claim.assetType,
      subType: claim.subType,
    };
  };

  const resolve = (pos: Vec3i, subType: string): Attribution | null => {
    // Fast path: validated targetAssetId
    const byTarget = resolveByTargetId(subType);
    if (byTarget) return byTarget;
    // Slow path: position-based lookup (read-only, no verify-on-use)
    const found = store.resolveByPosition({
      dimension: ev.dimension,
      pos,
      subType,
      maxDistance: 2,  // tight match: within 2 blocks of reported position
    });
    if (found) {
      return {
        assetId: found.assetId,
        blockPos: found.location.blockPos,
        assetType: found.assetType,
        subType: found.subType,
      };
    }
    return null;
  };

  return { resolve, resolveByTargetId };
}

/** The main adapter entry point. Called once per leaf outcome.
 *  Returns evidence emissions for the store to execute. */
export function processLeafOutcome(
  ev: LeafOutcomeEvent,
  store: ReferenceAssetMemoryStore,
): EvidenceEmission[] {
  const extractor = LEAF_EXTRACTORS[ev.leafName];
  if (!extractor) return [];  // Leaf not tracked → no evidence

  const { resolve, resolveByTargetId } = makeResolvers(ev, store);
  return extractor(ev, resolve, resolveByTargetId);
}
```

#### 6.7.4 Wiring at the dispatch point (two-phase apply)

The adapter is wired at `ActionTranslator.executeLeafAction()` (line 1364), after `leaf.run()` returns. Emissions are applied in two phases:

**Phase 1**: Process all `upsert`-targeted emissions. For each unique `upsertKey`, call `store.upsertClaim()` once. The store returns `{ claim, created }`: `created=true` means a new claim was made with an auto-appended `observed` entry at `firstSeenTick`; `created=false` means the claim already existed and no new evidence was appended. Record `{ assetId, created }` in an `upsertMap`.

**Phase 2**: Process all remaining emissions. For `upsert` refs with `eventType === 'observed'` and `created === true`, skip — the store already wrote the `observed` entry. For all other emissions, compute tick offsets:
- If `created === true`, use `baseOffset = 1` (follow-up after the auto-observed entry).
- If `created === false`, use `baseOffset = 0` (no auto-observed was appended).
- Additional emissions to the same claim increment the offset for monotonicity.

```ts
// In ActionTranslator.executeLeafAction():
const result = await leaf.run(context, { ...action.parameters, timeoutMs: timeout });

// Build LeafOutcomeEvent from result
const leafOutcome: LeafOutcomeEvent = {
  tickId: getCurrentTick(),
  timestampMs: Date.now(),
  leafName: action.type,
  success: result.status === 'success',
  args: action.parameters,
  result: result.result as Record<string, unknown> | undefined,
  error: result.error
    ? { code: result.error.code, retryable: result.error.retryable, detail: result.error.detail }
    : undefined,
  botPos: {
    x: this.bot.entity.position.x,
    y: this.bot.entity.position.y,
    z: this.bot.entity.position.z,
  },
  dimension: this.bot.game?.dimension ?? 'overworld',
  targetAssetId: action.parameters._targetAssetId as string | undefined,
  failureReason: (result.result as any)?.failureReason ?? result.error?.code,
};

// Get emissions from adapter
const emissions = processLeafOutcome(leafOutcome, assetMemoryStore);

// ── Phase 1: Create upserts ──
// Collect unique upsertKeys → { assetId, created }
const upsertMap = new Map<string, { assetId: string; created: boolean }>();
for (const em of emissions) {
  if (em.target.kind !== 'upsert') continue;
  if (upsertMap.has(em.target.upsertKey)) continue;  // Already processed
  const { claim, created } = assetMemoryStore.upsertClaim({
    assetType: em.target.assetType,
    subType: em.target.subType,
    owner: botId,
    location: {
      dimension: leafOutcome.dimension,
      blockPos: em.target.blockPos,
      chunkPos: chunkFromPos(em.target.blockPos),
    },
    tags: em.target.tags,
    interactRadius: 6,
    verifyMethod: { type: 'block_name_match', expectedValue: em.target.subType, radius: 1 },
    firstSeenTick: leafOutcome.tickId,
    firstSeenMs: leafOutcome.timestampMs,
  });
  upsertMap.set(em.target.upsertKey, { assetId: claim.assetId, created });
}

// ── Phase 2: Apply evidence ──
// Track tick offsets per claim for monotonicity within a single leaf outcome.
const tickOffsets = new Map<string, number>();  // assetId → next tick offset

for (const em of emissions) {
  // Resolve the target assetId and created flag
  let assetId: string;
  let wasCreated = false;
  if (em.target.kind === 'existing') {
    assetId = em.target.assetId;
  } else {
    const resolved = upsertMap.get(em.target.upsertKey);
    if (!resolved) continue;  // Should not happen; defensive
    assetId = resolved.assetId;
    wasCreated = resolved.created;
  }

  // For upsert targets: if eventType is 'observed' AND the upsert actually
  // created a new claim, skip — the store already wrote the observed entry.
  // If created=false (existing claim returned), the observed was NOT written,
  // so we must NOT skip it.
  if (em.target.kind === 'upsert' && em.eventType === 'observed' && wasCreated) continue;

  // Compute tick offset — must clamp against the claim's current ledger head.
  // This handles cases where leafOutcome.tickId is behind the claim's last
  // evidence tick (e.g., delayed processing, multi-emission from earlier ticks).
  const baseOffset = wasCreated ? 1 : 0;
  const priorOffset = tickOffsets.get(assetId) ?? 0;
  const lastTick = assetMemoryStore.lastEvidenceTick(assetId);
  const ledgerClamp = lastTick === -Infinity ? 0 : Math.max(0, (lastTick + 1) - leafOutcome.tickId);
  const offset = Math.max(baseOffset, priorOffset, ledgerClamp);
  tickOffsets.set(assetId, offset + 1);

  assetMemoryStore.appendEvidence(assetId, {
    timestampMs: leafOutcome.timestampMs + offset,
    tickId: leafOutcome.tickId + offset,
    eventType: em.eventType,
    success: isSuccessEvent(em.eventType),
    details: em.details,
  });
}
```

**Why `tickId + offset`?** The store enforces strictly monotonic `tickId` **per claim** (not globally). When `created=true`, `upsertClaim` consumes `firstSeenTick` for the auto-observed entry, so follow-up evidence must use `firstSeenTick + n`. When `created=false`, no auto-observed was appended, so the wiring can use the base tick directly. The `tickOffsets` map handles multiple emissions to the same claim in a single leaf outcome (e.g., bed placed + used).

**Ledger-head clamping (normative):** The offset computation must also clamp against the claim's current ledger head via `store.lastEvidenceTick(assetId)`. This prevents `non_monotonic_tick` errors when `leafOutcome.tickId` is behind the claim's last evidence tick (e.g., the claim was updated by a concurrent path, or the same leaf outcome is retried). The `lastEvidenceTick()` accessor returns the last evidence tick for a known claim or `-Infinity` for unknown claims, making the clamp a no-op when the claim is new.

**Scope of monotonicity (normative):** `tickId` is a monotonically increasing **per-claim** ordering key. It is not a global clock. Multiple claims can share the same `tickId` value without violating the monotonicity invariant, because each claim's ledger is independently ordered. The wiring may synthesize local `tickId` offsets (`+1`, `+2`, ...) for multiple emissions produced by a single leaf outcome. If global chronological ordering is needed in the future, use the `(assetId, tickId)` pair or introduce a separate monotonic `eventSeq` per claim.

#### 6.7.5 Leaf augmentation summary: fields to add

For the adapter to work, these fields must be added to leaf results (minimal set):

| Leaf | Field | How to populate |
|---|---|---|
| `craft_recipe` | `result.workstationPos: Vec3 \| null` | Set to the crafting table position found by `findNearestBlock()`, or null if using inventory 2×2 |
| `smelt` | `result.furnacePos: Vec3` | Set to the furnace position found by `findNearestBlock()` |
| `smelt` | `result.furnaceType: string` | Set to the block name at `furnacePos` |
| `sleep` | `result.sleepOutcome: string` | Map existing error codes: `sleep.notNight`→`'daytime'`, `sleep.failed`→`'unsafe'` (if monsters) or `'bed_obstructed'` (if obstruction), `world.invalidPosition`→`'no_bed'`; success with `slept:true`→`'slept'` |
| All failure paths | `result.failureReason: string` | Set to the applicable reason code from §6.6.2 unions |

Optional: `action.parameters._targetAssetId` can be set by the planner when it resolves a claim via `findNearest` before dispatching (e.g., "use the furnace at asset_abc123"). This enables targeted mode for higher-fidelity failure attribution. If not set, the adapter falls back to position-based resolution.

#### 6.7.6 Transient vs structural failure classification (normative)

This section tightens the language around failure categorization from §6.6.2.

**Structural failures** (trust-affecting): The world contradicts the claim's existence or physical integrity. These justify `failed_verify` or `failed_use`:
- `block_missing`: The expected block is not present at the claimed position.
- `block_mismatch`: A block exists but is not the expected type (e.g., dirt where furnace should be).
- `entity_missing`: The expected entity is not present.
- `bed_obstructed`: The bed exists but has permanent spawn-obstruction (blocks above it).

**Transient failures** (non-trust-affecting): Environmental or timing conditions that resolve without action on the asset. These map to `execution_failed`:
- `container_busy`: Container is being accessed by another entity. Resolves on its own.
- `workstation_blocked`: Workstation UI interaction blocked (Minecraft mechanic). Resolves on retry.
- `ui_timeout`: UI interaction timed out. Resolves on retry.
- `daytime`: Not nighttime. Resolves naturally.
- `unsafe`: Monsters nearby. Resolves when monsters are cleared.

**Precondition failures** (non-trust-affecting): The bot's state prevents the action. These map to `execution_failed`:
- `missing_ingredients`, `no_fuel`, `no_recipe`: Inventory preconditions not met.
- `inventory_full`, `no_space`, `output_blocked`: Storage preconditions not met.
- `inventory_missing`, `no_valid_position`, `sprawl_limit`: Placement preconditions not met.
- `unreachable`: Pathing precondition not met.
- `interrupted`: External interruption (combat, abort signal).

**Environmental failures** (no evidence): The asset was never found or referenced. These produce zero evidence entries:
- `no_workstation`, `no_bed`: Search-mode "not found" — no claim was referenced.
- Any failure with no attribution (no `targetAssetId` and no matching position).

---

## 7. Sterling Alignment

### 7.1 Bot levels <-> Sterling statuses (conceptual mapping)

| Bot Level | Sterling status (conceptual) | Semantics                               |
| --------- | ---------------------------- | --------------------------------------- |
| L0        | Frontier                     | raw observation; not authoritative      |
| L1        | Shadow                       | evidence-backed; requires verify-on-use |
| L2        | Committed (weak)             | participates in routing/planning        |
| L3        | Committed + sheath candidate | default attractor; corridor candidate   |

### 7.2 Contract alignment (requirements)

* Deterministic identity: assetId is content-addressed from stable identity fields.
* Append-only provenance: evidence forms a digest chain.
* Demotion != deletion: fidelity changes without erasing meaning.
* Fail-closed verify-on-use: execution consumes only verified affordances for critical actions.
* Place-vs-reuse gate: prevents duplicate placement reward hacks by making reuse the default.

### 7.3 RoutineClaim -> corridor candidate mapping

When a RoutineClaim reaches L3 and meets success criteria, it is eligible for corridor extraction.

```ts
export interface RoutineToCorridorMapping {
  routineId: string;
  preconditionsDigest: string;     // hash(normalized preconditions)
  entryStateDigest: string;        // hash(coarse entry state)
  exitStateDigest: string;         // hash(coarse exit state)
  operatorSteps: Array<{ operatorId: string; argsDigest: string }>;
  evidenceRootDigest: string;      // hash(evidence chain root)
}
```

Eligibility gate:

* `routine.myelinLevel === 3`
* `routine.successRate >= 0.95`
* `routine.executionCount >= 10`

Immutability rule:

* Once promoted to a corridor artifact, it is immutable. Drift does not mutate; it triggers new candidate generation.

---

## 8. Acceptance Tests

Tests are executable with Vitest using the reference store in Section 8.1. They also serve as acceptance criteria for a real implementation.

### 8.1 Reference implementation

The reference implementation lives at `packages/memory/src/asset/asset-memory-store.ts` and is imported by the test file at `packages/memory/src/asset/__tests__/asset-memory-acceptance.test.ts`.

### 8.2 Test suites (23 suites, 84 tests)

| Suite | Name | Tests |
| ----- | ---- | ----- |
| A | AssetClaim lifecycle | 5 |
| B | Place-vs-reuse gate | 4 |
| C | Uniqueness budgets | 3 |
| D | Spatial indexing | 3 |
| E | Evidence ledger integrity | 3 |
| F | Promotion only on use | 3 |
| G | Memory-first leaf integration (contract) | 4 |
| H | Decay and TTL | 3 |
| I | BaseClaim management (contract) | 3 |
| J | RouteClaim lifecycle (contract) | 4 |
| K | RoutineClaim lifecycle (contract) | 4 |
| L | RoutineClaim -> corridor promotion (contract) | 3 |
| M | Spec-lock: event taxonomy invariants | 3 |
| N | Failure classification contract | 7 |
| O | resolveByPosition (read-only spatial lookup) | 5 |
| P | isSuccessEvent (canonical success mapping) | 5 |
| Q | upsertClaim.created contract | 4 |
| R | Two-phase apply regression | 5 |
| S | Identity hash invariants | 3 |
| T | lastEvidenceTick and tick clamping | 3 |
| U | TTL refresh via observed on existing claim | 2 |
| V | resolveByPosition assetType filter | 3 |
| W | UpsertKey collision safety (identity boundary) | 2 |

Full test source is in `packages/memory/src/asset/__tests__/asset-memory-acceptance.test.ts`.

---

## 9. Implementation Files

Deliverable:

* `docs/planning/asset-memory-working-spec.md` (this document)
* `packages/memory/src/asset/asset-memory-store.ts` (reference implementation)
* `packages/memory/src/asset/__tests__/asset-memory-acceptance.test.ts` (84 acceptance tests)

Future implementation targets (not in scope here; planning only):

* `packages/memory/src/asset/asset-claim-types.ts`
* `packages/memory/src/asset/promotion-engine.ts`
* `packages/memory/src/asset/evidence-ledger.ts`
* `packages/memory/src/asset/budgets.ts`
* `packages/memory/src/asset/base-claim.ts`
* `packages/memory/src/asset/route-claim.ts`
* `packages/memory/src/asset/routine-claim.ts`
* `packages/minecraft-interface/src/leaves/*` (augment result telemetry for asset attribution)
* `packages/planning/src/task-integration/*` (enforce place-vs-reuse gate at boundary)

---

## 10. Verification (spec quality gates)

1. Interfaces are concrete and compile if extracted into `.ts` (e.g., `tsc --noEmit`).
2. Thresholds are numeric and explicit.
3. Evidence ledger is append-only with digest chaining.
4. Retrieval ranking is explicit and deterministic.
5. Anti-reward-hacking is enforced at the boundary (place-vs-reuse + budgets).
6. Sterling mapping is explicit, including routine->corridor eligibility.
7. Acceptance tests are full `describe/it/expect` blocks and runnable with the reference store.

### 10.1 Commands

From repository root:

```sh
npx vitest run packages/memory/src/asset/__tests__/asset-memory-acceptance.test.ts
```

From `packages/memory`:

```sh
npx vitest run src/asset/__tests__/asset-memory-acceptance.test.ts
```

Or via package script (from anywhere):

```sh
pnpm --filter @conscious-bot/memory test:asset-memory
```

From `packages/memory`:

```sh
pnpm test:asset-memory
```

**Important:** Running `npx vitest run packages/memory/...` from within `packages/memory` will fail with "No test files found" because the package-local vitest config includes `src/**/*.{test,spec}.ts` — the `packages/memory/` prefix falls outside that glob. Always use the repo-root or package-local forms shown above.

Type-check (from repo root):

```sh
npx tsc --noEmit
```
