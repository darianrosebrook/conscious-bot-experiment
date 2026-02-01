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
  | 'budget_denied';

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

Asset identity must be stable under evidence accumulation and minor position drift.

Recommended stable identity fields:

* owner
* assetType + subType
* dimension
* chunkPos (coarse anchoring)
* firstSeenEvidenceDigest (or first event digest)

`assetId = hash(canonical_json(stable_fields))`

Rationale: blockPos can drift by small offsets (player/bot places nearby, pathing corrections). Chunk anchoring helps de-dup and indexing without brittle exact coordinates.

### 2.3 Evidence ledger (append-only + digest chain)

Evidence is the only authoritative input. All computed fields (confidence/value/myelinLevel) are derived.

Ledger invariants:

* Strictly monotonic tickId: `e[i].tickId > e[i-1].tickId`
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
  * 0 `failed_verify`/`failed_use` events in last 20 evidence entries (strict by default). Other non-failure event types (e.g., `budget_denied`, `merged`) do not count as failures for this check.
  * value >= 0.5
  * successRate >= 0.95

Promotion gating: promotions only run when `failureStreak === 0`. During an active failure streak, the claim cannot be promoted — only demoted or held.

Failure streak reset rule: `failureStreak` resets to 0 on any evidence entry with `success: true` that represents an actual interaction/verification outcome (`used`, `verified`, `placed`). `observed` events do not reset failure streaks — passive re-observation of a broken asset should not restore trust.

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

#### Workstation leaves

| leafName | Asset touched | Success eventType | Failure eventType | Attribution source | Success semantics | Gate |
|---|---|---|---|---|---|---|
| `place_workstation` (reuse path) | `workstation:{subType}` | `verified` | `failed_verify` | `result.position` ✅ | Existing workstation found and usable at returned position | — |
| `place_workstation` (place path) | `workstation:{subType}` | `placed` | — (leaf fails, no claim created) | `result.position` ✅ | New workstation placed at returned position; upsert new claim | **place-vs-reuse** |
| `craft_recipe` | `workstation:crafting_table` | `used` | `failed_use` | ⚠ MISSING — needs `result.workstationPos` | Recipe crafted successfully using the workstation at this position | — |
| `smelt` | `workstation:furnace` or `workstation:blast_furnace` | `used` | `failed_use` | ⚠ MISSING — needs `result.furnacePos` | Items smelted successfully using the furnace at this position | — |

Notes:
- `place_workstation` emits two different event types depending on `result.reused` (boolean, ✅ already present). The adapter checks: if `result.reused === true`, emit `verified`; if `result.reused === false`, emit `placed`.
- `craft_recipe` currently searches within 6 blocks and may fall back to inventory 2×2 grid. When using inventory crafting (no workstation), no evidence is emitted. The adapter must check whether a workstation was used. Attribution field needed: `result.workstationPos: {x,y,z} | null`.
- `smelt` currently searches within 6 blocks. Attribution field needed: `result.furnacePos: {x,y,z}`. Subtype detection: check block name at `furnacePos` (furnace vs blast_furnace).

#### Container leaves

| leafName | Asset touched | Success eventType | Failure eventType | Attribution source | Success semantics | Gate |
|---|---|---|---|---|---|---|
| `open_container` | `container:{containerType}` | `used` | `failed_use` | `result.position` ✅ | Container opened and contents read at returned position | — |
| `transfer_items` | `container:{containerType}` | `used` | `failed_use` | ⚠ PARTIAL — `result.sourceContainer` and `result.destinationContainer` are IDs (format `type_x_y_z`), not positions. Parse position from ID or add explicit `result.sourcePos` / `result.destPos`. | Items transferred successfully between containers | — |
| `close_container` | `container:{containerType}` | `verified` | — | `result.containerId` (parseable to position) | Container confirmed closed; lightweight verification | — |

Notes:
- `open_container` already returns `result.position` and `result.containerType` ✅. The `containerId` format `{type}_{x}_{y}_{z}` can be parsed for position, but explicit `position` is preferred.
- `close_container` is a lightweight interaction; `verified` is appropriate (confirms the container still exists and was interactable).
- `transfer_items` touches both source and destination containers. Emit `used` evidence for both if both are asset-tracked containers.

#### Bed leaf

| leafName | Asset touched | Success eventType | Failure eventType | Attribution source | Success semantics | Gate |
|---|---|---|---|---|---|---|
| `sleep` (found existing) | `bed:bed` | `used` | `failed_use` | `result.bedPosition` ✅ | Successfully slept or set spawn. Emit `used` only for successful sleep/spawn-set (per §5.3 bed telemetry guidance). Daytime right-click = `verified`. | — |
| `sleep` (placed new bed) | `bed:bed` | `placed` then `used` | `placed` then `failed_use` | `result.bedPosition` ✅ | Bed placed and sleep attempted. Two evidence entries: `placed` (upserts claim), then `used` or `failed_use` depending on sleep outcome. | **place-vs-reuse** |

Notes:
- The `sleep` leaf already returns `result.bedPosition` and `result.placed` (boolean) ✅.
- When `result.placed === true`, emit `placed` evidence first, then `used`/`failed_use` for the sleep attempt. This gives the claim L2 immediately (ownership path) and begins accumulating use evidence toward L3.
- When `result.placed === false` and `result.slept === true`, emit `used`. When `result.slept === false`, emit `failed_use`.
- The `result.placed === false` + `result.slept === false` case (found bed but sleep failed, e.g., monsters nearby) should emit `failed_use`, not `failed_verify` — the bed exists, it just couldn't be used.

#### Farming leaves

| leafName | Asset touched | Success eventType | Failure eventType | Attribution source | Success semantics | Gate |
|---|---|---|---|---|---|---|
| `till_soil` | `farm:farmland` | `placed` | — (leaf fails, no claim) | `result.position` ✅ | Soil tilled at position; creates new farm-type asset | — |
| `plant_crop` | `farm:{cropType}` | `placed` | — | `result.position` ✅ | Crop planted at position; creates crop-type claim | — |
| `harvest_crop` | `farm:{cropType}` | `used` | `failed_use` | `result.position` ✅ | Mature crop harvested at position | — |
| `manage_farm` | `farm:{cropType}` | (compound) | (compound) | `result.details` (aggregated) | Compound operation; emit per-operation evidence from `details.tilled`, `details.planted`, `details.harvested` counts | — |

Notes:
- Farm assets are area-based rather than point-based. Individual tile claims may be too granular. Alternative: track farm *regions* as base-level claims with `assetType: 'farm'` and use per-tile evidence as supporting detail.
- `manage_farm` is a compound leaf that internally calls till/plant/harvest. The adapter should either (a) treat it as a single `used` event against a farm region claim, or (b) decompose into per-operation events. Option (a) is recommended for simplicity.
- Farm claims do not require the place-vs-reuse gate (no uniqueness budget constraint on farmland).

#### Interaction leaves (asset-relevant subset)

| leafName | Asset touched | Success eventType | Failure eventType | Attribution source | Success semantics | Gate |
|---|---|---|---|---|---|---|
| `interact_with_block` | varies by `result.blockType` | `verified` | `failed_verify` | `result.position` ✅ | Block interaction confirms existence. Map `blockType` to assetType/subType if recognized (doors→workstation, containers→container). | — |
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

### 6.6 Attribution augmentation requirements

Based on the mapping table above, the following leaf result types need augmentation before the adapter can attribute evidence correctly:

| leafName | Missing field | Type | Source |
|---|---|---|---|
| `craft_recipe` | `workstationPos` | `{x: number, y: number, z: number} \| null` | The position of the crafting table used (null if inventory 2×2 grid) |
| `smelt` | `furnacePos` | `{x: number, y: number, z: number}` | The position of the furnace/blast_furnace used |
| `follow_entity` | `entityPos` | `{x: number, y: number, z: number}` | Last known position of followed entity |
| `follow_entity` | `entityType` | `string` | Entity type (villager, etc.) |
| `transfer_items` | `sourcePos` | `{x: number, y: number, z: number}` | Explicit position (instead of parsing containerId) |
| `transfer_items` | `destPos` | `{x: number, y: number, z: number}` | Explicit position |

All other asset-touching leaves already return the necessary position data in their results.

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

### 8.2 Test suites (13 suites, 45 tests)

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

Full test source is in `packages/memory/src/asset/__tests__/asset-memory-acceptance.test.ts`.

---

## 9. Implementation Files

Deliverable:

* `docs/planning/asset-memory-working-spec.md` (this document)
* `packages/memory/src/asset/asset-memory-store.ts` (reference implementation)
* `packages/memory/src/asset/__tests__/asset-memory-acceptance.test.ts` (45 acceptance tests)

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

Or via package script:

```sh
pnpm --filter @conscious-bot/memory test:asset-memory
```

Type-check (from repo root):

```sh
npx tsc --noEmit
```
