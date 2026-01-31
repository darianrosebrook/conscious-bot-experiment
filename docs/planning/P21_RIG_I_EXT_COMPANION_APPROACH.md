# Companion Approach for P21 / Rig I-ext

This companion document distills the implementation plan into a recommended, staged approach, with explicit design decisions, boundaries, validation focus, and **concrete code references and signatures** so that implementers cannot easily implement the boundary incorrectly. It is intended to be read alongside `docs/planning/P21_RIG_I_EXT_IMPLEMENTATION_PLAN.md`.

---

## 1. Recommended approach (executive summary)

**Best path:** Ship the Belief Bus first with a strict boundary (no raw detections to cognition), deterministic ticked ingestion, and delta-only cognition payloads. Then add snapshot resync + reflex safety. Defer Stage 2 anti-ID tests and execution-grounded learning until the boundary and event sparsity are proven.

Why: This sequence eliminates observation spam quickly, preserves determinism, and aligns with the core invariant without overbuilding association or learning updates.

---

## 2. Primary design decisions (and why)

1. **TrackSet is the single source of truth.**  
   - All entity/threat state comes from TrackSet or its outputs.  
   - ThreatPerceptionManager becomes either a sensor provider or a TrackSet consumer, not both.

2. **Belief Bus is the boundary component.**  
   - Ingests `EvidenceBatch(tick_id)` only.  
   - Maintains TrackSet.  
   - Emits **SaliencyDeltas** (normal) and **Snapshot** (resync).

3. **Cognition receives deltas + snapshots only.**  
   - No per-entity POSTs.  
   - Versioned request shape or separate endpoint to avoid ambiguous payloads.

4. **Determinism is enforced at the boundary.**  
   - Canonical evidence ordering.  
   - Monotonic tick ID.  
   - Bucketed time and distance fields inside the belief core.

5. **Hazard summary is derived, ephemeral, and bounded.**  
   - Used for reflex and navigation.  
   - If used in planning state, only bucketed, bounded, sorted data are allowed.

---

## 2b. What must be implemented in conscious-bot vs Sterling

Rig I-ext is **proved in the rig** (conscious-bot, Minecraft). Sterling is an external Python service that provides graph search + learned edge ordering over semantic state; the **bot remains the source of Minecraft knowledge at solve time** (see `docs/planning/sterling-minecraft-domains.md`). The perception → belief → delta contract and all proving tasks live in the rig, not in Sterling.

### Implement in conscious-bot (the rig)

All of the following **must** be implemented in the conscious-bot repo. Sterling does not implement the belief layer, entity tracking, or saliency; the rig does.

| Area | What conscious-bot must implement | Location / artifact |
|------|-----------------------------------|----------------------|
| **Belief Bus** | Ingest `EvidenceBatch(tick_id)`; maintain TrackSet (bounded, deterministic); emit SaliencyDeltas + periodic Snapshot. | New: `packages/minecraft-interface/src/entity-belief/` (or `packages/world/src/entity-belief/`). |
| **Evidence ingestion** | Build EvidenceBatch from Minecraft (bot.entities, optional LOS/raycast); **canonical ordering** before passing to Belief Bus; monotonic tick source. | `packages/minecraft-interface/src/entity-belief/evidence-builder.ts`; `packages/minecraft-interface/src/bot-adapter.ts`. |
| **TrackSet operators** | TRACK_UPDATE (association + fusion), DECAY (uncertainty growth), SALIENCY_DIFF (hysteresis + cooldown + warmup), eviction (deterministic). | Same entity-belief module. |
| **Hazard summary** | Derive from TrackSet: bucketed, bounded count, deterministic sort. Consumed by reflex and by local navigation/planning only (see Sterling below). | Same module or `packages/minecraft-interface/src/` (reflex, navigation cost). |
| **Reflex layer** | Consume TrackSet / hazard summary **directly**; immediate evasion/defense; **must not** call Cognition or LLM. | New or existing: `packages/minecraft-interface/src/reflex/` or equivalent. |
| **Cognition path** | Replace per-entity POSTs with **versioned** delta/snapshot payloads only. Add `request_version: 'saliency_delta'`; send batched `saliency_events` and optional `snapshot`. | `packages/minecraft-interface/src/bot-adapter.ts`; `packages/cognition/src/server.ts`; new handler for delta/snapshot. |
| **ThreatPerceptionManager** | Refactor to single source of truth: either (A) sensor provider (feeds EvidenceBatch only) or (B) consumer of TrackSet (no persistent `knownThreats` map). | `packages/minecraft-interface/src/threat-perception-manager.ts`. |
| **Contracts** | Versioned request schema; SaliencyDeltaRequest; TrackSetSnapshot; TrackSummary. | `contracts/cognition-observation.yaml` (or new schema). |
| **Proving tasks** | Persistence under occlusion; saliency gating; association (Stage 1 ID as soft hint, Stage 2 ID-noise harness); active sensing as first-class action; risk propagation (hazard consumed by reflex/navigation); execution-grounded telemetry (no learning updates in boundary milestone). | Unit/integration tests in conscious-bot; certification gates (event sparsity, separation, determinism). |
| **Certification** | Boundedness (TrackSet.size <= TRACK_CAP); event sparsity (events/tick <= MAX after warmup); separation (raw detections never create tasks); determinism (same `(tick_id, EvidenceBatch)` => same hash and deltas). | Tests in `packages/minecraft-interface/src/entity-belief/__tests__/` and integration tests. |

**Summary:** conscious-bot owns the entire perception → belief → delta pipeline, the Belief Bus, reflex safety, and the cognition delta/snapshot API. No part of the belief layer or entity tracking is implemented in Sterling.

### Implement in Sterling (Python)

Sterling is **not** the rig. It provides graph search and learned edge ordering over **state** that the bot sends. For the P21/Rig I-ext **boundary milestone** (no raw detections → cognition, event sparsity, reflex safety), **no changes in Sterling are required.** The rig (conscious-bot) proves the primitive; Sterling does not implement TrackSet, EvidenceBatch, SALIENCY_DIFF, or entity belief.

| Area | Sterling role | Required for boundary milestone? |
|------|----------------|----------------------------------|
| **Belief layer / TrackSet** | None. Sterling does not maintain entity tracks or saliency. | **No.** |
| **Evidence / detections** | None. Sterling does not receive raw detections or EvidenceBatch. | **No.** |
| **Cognition delta/snapshot** | None. Cognition is a conscious-bot service; Sterling is not in the observation path. | **No.** |
| **Hazard summary in planning state** | **Optional / future.** If a Sterling domain reasons about **spatial risk or movement** (e.g. navigation, path planning with hazard avoidance), then Sterling would need to accept a **compact hazard summary** (or equivalent) in the **state** payload and use it in operator costs or preconditions (e.g. avoid high-threat regions). | **No** for current domains (crafting, tool progression, building). **Yes** only if/when a domain is added that plans movement or navigation and must avoid hazard regions; then conscious-bot would include `hazard_regions` (bucketed, bounded) in the state it sends to Sterling, and Sterling’s domain handler would interpret them. |
| **Existing domains** | Crafting, tool progression, building: state = inventory, blocks, etc. No entity or hazard state today. | **No change.** |

**Summary:** For the boundary milestone, implement everything in conscious-bot; leave Sterling unchanged. If later you add a Sterling domain that plans movement/navigation and must respect hazard regions, then (1) conscious-bot adds hazard summary to the state it sends to Sterling for that domain, and (2) Sterling’s domain handler accepts and uses that state (e.g. in cost or preconditions).

### Contract between the two

- **conscious-bot → Sterling:** Today: rules, state (e.g. inventory, blocks), goal. Optional future: state may include `hazard_regions` (or similar) when the domain is movement/navigation; Sterling would then use it in search.
- **Sterling → conscious-bot:** Solution path, steps, metrics. No entity or belief data flows from Sterling to the bot; belief state is entirely owned by conscious-bot.
- **Raw detections:** Never leave conscious-bot. Never sent to Sterling. Only EvidenceBatch (internal to conscious-bot) and Belief Bus outputs (deltas, snapshot, hazard) exist; hazard is consumed locally (reflex, navigation) and optionally in state to Sterling only when a hazard-aware domain exists.

---

## 3. Current code anchors (what exists today)

These are the primary call sites and contracts that currently push raw detections into cognition. **Exact file paths and line numbers** are given so changes can be located and verified.

### 3.1 Minecraft interface — raw entity to cognition

| Location | Line(s) | What |
|----------|---------|------|
| `packages/minecraft-interface/src/bot-adapter.ts` | 839–864 | `setupEntityDetection()` calls `detectAndRespondToEntities()` every 10s (scanInterval 10000). |
| Same file | 870–895 | `detectAndRespondToEntities()` uses `Object.values(bot.entities)` (unordered), filters by distance <= 15, then **for (const entity of nearbyEntities) { await this.processEntity(entity); }**. |
| Same file | 899–939 | `processEntity(entity: any)` builds a thought string, then **POSTs to `${cognitionUrl}/process`** with `type: 'environmental_awareness'`, `content`, `metadata: { entityType, entityId, distance, position, botPosition, timestamp }`. One HTTP request per entity. |

**Exact code to remove or replace (bot-adapter):**

```ts
// REMOVE or REPLACE: packages/minecraft-interface/src/bot-adapter.ts lines 876-890
const nearbyEntities = Object.values(bot.entities).filter((entity) => {
  const distance = entity.position.distanceTo(bot.entity.position);
  return (
    distance <= 15 && entity.name !== 'item' && entity !== bot.entity
  );
});
// ...
for (const entity of nearbyEntities) {
  await this.processEntity(entity);
}
```

```ts
// REMOVE or BYPASS for environmental path: packages/minecraft-interface/src/bot-adapter.ts lines 915-938
const response = await fetch(`${cognitionUrl}/process`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'environmental_awareness',
    content: thought,
    metadata: {
      entityType: entity.name,
      entityId: entity.id,
      distance: distance,
      position: { x, y, z },
      botPosition: { x, y, z },
      timestamp: Date.now(),
    },
  }),
});
```

**Rule:** After the change, **no loop** over `nearbyEntities` may call `fetch(..., '/process', { type: 'environmental_awareness', ... })` with a **single entity** in the body. The only allowed POSTs for environmental awareness are **batched delta** or **snapshot** payloads with an explicit **request_version** (see contract section).

### 3.2 Cognition service — environmental awareness path

| Location | Line(s) | What |
|----------|---------|------|
| `packages/cognition/src/server.ts` | 1507 | `app.post('/process', ...)` entrypoint. |
| Same file | 1509 | Destructures `{ type, content, metadata }` from `req.body`. |
| Same file | 1563–1576 | `else if (type === 'environmental_awareness')`: builds observation via `buildObservationPayload(rawObservation, rawObservation?.metadata)` (line 375: `function buildObservationPayload(raw, metadata)`). |
| Same file | 1581 | `observationReasoner.reason(observation)` — one LLM (or fallback) call per request. |
| Same file | 1645–1657 | If not generic fallback, POSTs thought to cognitive stream. |
| Same file | 1665–1676 | Response shape: `type: 'environmental_awareness'`, `thought`, `actions`, `fallback`, etc. |

**Exact code to extend (cognition server):**

- **Do not remove** the `type === 'environmental_awareness'` branch until the new path is stable and versioned.
- **Add** a branch that checks for **versioned payload** first, e.g. `req.body.request_version === 'saliency_delta'`. If present, parse `tick_id`, `saliency_events`, optional `snapshot`; call a **delta/snapshot handler** (e.g. `saliencyReasoner.reasonFromDeltas(payload)`) instead of `observationReasoner.reason(observation)`. Do **not** call `observationReasoner.reason` with a single-entity observation when `request_version === 'saliency_delta'`.

**ObservationReasoner (do not change signature for legacy path):**

| Location | Line(s) | What |
|----------|---------|------|
| `packages/cognition/src/environmental/observation-reasoner.ts` | 112 | `async reason(payload: ObservationPayload): Promise<ObservationInsight>`. |
| Same file | 113 | `ObservationPayloadSchema.parse(payload)` — expects single observation with `category`, `bot`, `entity` or `event`, `timestamp`. |

Legacy path continues to use `ObservationPayload` (single entity/snapshot). New path must use a **different** type (e.g. `SaliencyDeltaPayload`) and a separate handler so that implementers cannot accidentally pass raw entity payloads to the delta path.

### 3.3 Contract — current request schema

| Location | What |
|----------|------|
| `contracts/cognition-observation.yaml` | `ObservationRequest`: `required: [type, observation]`, `type: const: environmental_awareness`, `observation: $ref: ObservationPayload`. |
| Same file | `ObservationPayload`: `required: [category, bot, timestamp]`, `entity: EntitySnapshot` (id, name, position, distance, threatLevel, etc.). |

**Current behavior:** One request = one observation = one entity snapshot. No `request_version`; no delta or snapshot schema.

### 3.4 Planning integration

| Location | Line(s) | What |
|----------|---------|------|
| `packages/planning/src/task-integration.ts` | 89–99 | `getActionableThoughts()` filters: `thought.metadata?.fallback === true` → skip. Thoughts still originate from per-entity observations today. |

No change required to this filter for the boundary milestone; the filter remains. The **source** of thoughts (delta-driven vs legacy) will change once bot-adapter sends only deltas/snapshots.

### 3.5 Threat perception — second source of truth

| Location | Line(s) | What |
|----------|---------|------|
| `packages/minecraft-interface/src/threat-perception-manager.ts` | 41 | `private knownThreats = new Map<string, ThreatEntity>();` — persistent threat map. |
| Same file | 86–127 | `assessThreats()`: iterates entities, uses `knownThreats.get(entityId)?.lastSeen`, updates `knownThreats`, LOS via `raycastEngine`. |

**Rule:** After refactor, **either** (A) this class no longer owns `knownThreats` and only produces evidence for EvidenceBatch, **or** (B) it reads from TrackSet/hazard summary and does not maintain its own Map. Code must not have two persistent maps (TrackSet + knownThreats) both used for "what threats exist."

---

## 3.6 DO and DO NOT (implementation rules)

Use these rules to avoid implementing the boundary incorrectly.

**DO:**

- **DO** pass a **monotonic tick identifier** into the belief layer. Obtain it from a single source (e.g. game tick counter or `Math.floor(Date.now() / BUCKET_MS)` at the boundary) and pass it as `tickId` in every `EvidenceBatch`. Never use raw `Date.now()` inside the belief core for ordering or hashing.
- **DO** sort evidence **before** passing to the belief layer. Use a **stable, deterministic** sort key as **integer tuples** (e.g. `distBucket`, then `posBucketX`, then `posBucketY`, then `posBucketZ`, then `kindEnum`). Never pass `Object.values(bot.entities)` or any unsorted array into the belief layer.
- **DO** use **integer buckets only** for all canonical fields (position, distance, velocity). Never use `toFixed()` or float stringification in the deterministic core path.
- **DO** generate **deterministic track IDs** (content-derived or sequential from canonicalized stream). Replaying the same evidence stream must produce identical delta payloads byte-for-byte.
- **DO** send only **single-envelope** payloads to Cognition with **stream contract**: `stream_id`, `seq`, `tick_id`, and both `snapshot` (if present) and `saliency_events` in the same POST. Cognition applies snapshot **before** deltas.
- **DO** add a **reflex path** that reads TrackSet or hazard summary and triggers immediate evasion/defense. This path must **not** call Cognition or the LLM for "threat in range" decisions.
- **DO** define **reflex arbitration**: reflex has priority for N ticks; planner is paused during override; reflex emits events for cognition to interpret.
- **DO** keep hazard summary **derived and ephemeral**: bucketed, bounded count, deterministic sort. Never include in canonical planning state hash unless explicit hazard-aware domain with strict caps.
- **DO** decouple **ingestion cadence** (high-frequency, e.g. 200ms) from **cognition emission cadence** (rate-limited, e.g. 1Hz). Reflex reads every tick; cognition receives batched deltas.
- **DO** add a **CI tripwire** (grep test or lint rule) that fails if any code path sends environmental_awareness to cognition without `request_version: saliency_delta`.

**DO NOT:**

- **DO NOT** call `fetch(url, '/process', { type: 'environmental_awareness', ... })` in a **loop over entities**. After the change, there must be **zero** call sites that POST one entity per request for environmental awareness.
- **DO NOT** iterate `Object.values(bot.entities)` (or any unordered collection) and feed it directly into association. Always canonicalize order first (stable integer key sort).
- **DO NOT** use `Date.now()` or real-time milliseconds inside the belief core for ordering, hashing, or decay. Use only `tickId` and bucketed time.
- **DO NOT** use `toFixed()`, float stringification, or string-based sort keys in the deterministic core. Use integer buckets only.
- **DO NOT** generate track IDs with randomness or first-seen order without deterministic tie-breaker. Track IDs must be reproducible across replays.
- **DO NOT** send **separate POSTs** for deltas and snapshots. Use single envelope with stream contract; cognition applies snapshot before deltas.
- **DO NOT** add a second persistent map for "current threats" or "current entities" that is used for decisions. TrackSet is the single source of truth; ThreatPerceptionManager is either sensor or consumer.
- **DO NOT** route reflexive safety (e.g. "hostile within 3 blocks") through Cognition or the LLM. Reflex must consume TrackSet/hazard directly and act immediately.
- **DO NOT** let reflex and planner fight for control. Define arbitration: reflex override for N ticks, planner paused during override.
- **DO NOT** mutate the `/process` request schema in place without a **version field**. Always require `request_version: 'saliency_delta' | 'legacy_observation'` (or separate path) so that legacy and new payloads are unambiguous.
- **DO NOT** implement full execution-grounded learning updates or active sensing execution in the boundary milestone. Log as telemetry only; execution is a later milestone.
- **DO NOT** add hazard_regions to planner state without explicit hazard-aware domain design with strict caps and stable thresholds.

**Anti-pattern (forbidden):**

```ts
// FORBIDDEN: per-entity POST loop
for (const entity of nearbyEntities) {
  await fetch(cognitionUrl + '/process', {
    body: JSON.stringify({ type: 'environmental_awareness', content: thought, metadata: { entityId: entity.id, ... } }),
  });
}

// FORBIDDEN: separate POSTs for deltas and snapshot (can reorder)
await fetch(cognitionUrl + '/process', { body: JSON.stringify({ saliency_events: deltas }) });
await fetch(cognitionUrl + '/process', { body: JSON.stringify({ snapshot }) });

// FORBIDDEN: float stringification in sort key
const key = `${item.position.x.toFixed(1)}:${item.position.y.toFixed(1)}`;
```

**Correct pattern (required):**

```ts
// REQUIRED: single envelope with stream contract
const envelope = {
  request_version: 'saliency_delta',
  stream_id: 'entity_tracker',
  seq: nextSeq++,
  tick_id: currentTickId,
  snapshot: shouldEmitSnapshot ? beliefBus.getCurrentSnapshot() : undefined,
  saliency_events: beliefBus.flushPendingDeltas().slice(0, 32),
};
await fetch(cognitionUrl + '/process', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(envelope),
});

// REQUIRED: integer bucket sort key
const sortKey = [item.distBucket, item.posBucketX, item.posBucketY, item.posBucketZ, item.kindEnum];
```

---

## 3.7 Exact change instructions (by file)

| File | Action | Detail |
|------|--------|--------|
| `packages/minecraft-interface/src/bot-adapter.ts` | **Replace** `detectAndRespondToEntities` body | Stop enumerating entities and calling `processEntity` in a loop. Instead: (1) obtain `tickId` from monotonic source; (2) build `EvidenceBatch` with **canonical ordering** (sort by distance bucket then stable key); (3) call `beliefBus.ingest(batch)`; (4) if `deltas.length > 0`, send one POST with `request_version: 'saliency_delta'`, `tick_id`, `saliency_events`; (5) if snapshot (e.g. on connect or periodic), send one POST with `request_version: 'saliency_delta'`, `snapshot`. |
| Same file | **Remove or bypass** | The `processEntity(entity)` path that POSTs to `/process` with `type: 'environmental_awareness'` and a single entity. Either delete `processEntity` for environmental use or ensure it is never called from the entity-detection loop. |
| Same file | **Add** | Monotonic tick source (e.g. private `tickCounter` incremented each scan, or `Math.floor(Date.now() / 1000)` at call site). Pass this as `tickId` into `buildEvidenceBatch`. |
| `packages/minecraft-interface/src/entity-belief/` (new) | **Add** | `belief-bus.ts` (or equivalent): `BeliefBus` with `ingest(batch: EvidenceBatch): BeliefBusOutput`. Types: `EvidenceBatch`, `EvidenceItem`, `SaliencyDelta`, `Snapshot`, `BeliefBusOutput`. |
| Same package (new) | **Add** | `evidence-builder.ts`: `buildEvidenceBatch(bot: Bot, tickId: number): EvidenceBatch` that collects entities, maps to `EvidenceItem[]`, then **sorts** with `canonicalizeEvidence(items)` (e.g. by `distanceBucket`, then `stableFeatureKey`) before returning. |
| `packages/cognition/src/server.ts` | **Add** branch before legacy | After reading `req.body`, if `req.body.request_version === 'saliency_delta'`, parse `tick_id`, `saliency_events`, optional `snapshot`; call new handler (e.g. `saliencyReasoner.reasonFromDeltas(req.body)`); return; do not call `buildObservationPayload` or `observationReasoner.reason` for this request. |
| Same file | **Keep** | The existing `type === 'environmental_awareness'` branch for legacy payloads until deprecation. |
| `contracts/cognition-observation.yaml` | **Add** schema | New request shape: `request_version: enum [saliency_delta, legacy_observation]`; for `saliency_delta`: `tick_id`, `saliency_events: array of SaliencyDelta`, optional `snapshot: Snapshot`. Document that `saliency_delta` is the preferred path; legacy remains for migration. |
| `packages/minecraft-interface/src/threat-perception-manager.ts` | **Refactor** | Either (A) remove persistent `knownThreats` and expose only evidence (e.g. `toEvidenceItems(): EvidenceItem[]`) for the EvidenceBatch, or (B) replace `knownThreats` usage with a read from TrackSet/hazard summary. No dual source of truth. |

---

## 3.8 Validation checkpoints (how to verify)

Run these checks to ensure the implementation is correct.

1. **No per-entity POSTs for environmental awareness**  
   - Grep: `rg "environmental_awareness" packages/minecraft-interface/src/bot-adapter.ts`  
   - The only occurrence of `environmental_awareness` in the request body must be inside a **single** POST that sends a **batch** (deltas or snapshot), not inside a loop over entities.  
   - Grep: `rg "processEntity" packages/minecraft-interface/src/bot-adapter.ts`  
   - `processEntity` must not be called from `detectAndRespondToEntities` (or the entity-detection path must not POST to cognition per entity).

2. **Versioned request**  
   - Grep: `rg "request_version|saliency_delta" packages/minecraft-interface packages/cognition`  
   - Every POST from bot-adapter for the new path must include `request_version: 'saliency_delta'`.  
   - Cognition server must branch on `request_version === 'saliency_delta'` and not pass delta payloads to `observationReasoner.reason(observation)`.

3. **Canonical ordering**  
   - In `evidence-builder.ts` (or equivalent), there must be an explicit sort before returning `EvidenceBatch.items`.  
   - Grep: `rg "\.sort\(|canonicalizeEvidence" packages/minecraft-interface/src/entity-belief`  
   - No function that builds EvidenceBatch from `bot.entities` may return unsorted items.

4. **Single source of truth**  
   - If ThreatPerceptionManager keeps a map, it must be documented as either (A) sensor-only (feeds EvidenceBatch) or (B) consumer of TrackSet.  
   - Grep: `rg "knownThreats" packages/minecraft-interface/src/threat-perception-manager.ts`  
   - After refactor, either `knownThreats` is removed/replaced by TrackSet read, or it is not used for any decision that could contradict TrackSet.

5. **Determinism (unit test)**  
   - A unit test must call `beliefBus.ingest(batch)` twice with the same `(tickId, items)` (same order) and assert that the two outputs have identical `deltas` (and same TrackSet hash if exposed).  
   - Use a fixed tick source in the test; do not use `Date.now()` inside the belief core in the test.

6. **Reflex path exists**  
   - Grep: `rg "reflex|Reflex|hazard summary|TrackSet" packages/minecraft-interface/src`  
   - There must be a code path that reads TrackSet or hazard summary and performs an immediate safety action (e.g. strafe, block, retreat) without calling Cognition.

---

## 4. Staged delivery (minimum viable sequence)

### Stage 1: Boundary enforcement + spam elimination
- Implement Belief Bus + TrackSet + SALIENCY_DIFF in a new module.
- Bot-adapter builds EvidenceBatch (canonical order, ticked) and feeds Belief Bus.
- Replace per-entity cognition POSTs with **batched delta-only** request.
- Add determinism and event sparsity unit tests.

**Outcome:** Raw detections no longer cross the boundary; cognition load drops sharply.

### Stage 2: Resync + reflex safety
- Emit periodic Snapshots and send on connect.
- Add reflex consumer of TrackSet/hazard for immediate safety actions.

**Outcome:** Cognition stays consistent across drops/restarts, and safety is no longer LLM-gated.

### Stage 3: Association robustness + learning signals
- Add ID-noise harness and occlusion tests (Stage 2 association).  
- Add preventability telemetry (do not apply learning yet).

**Outcome:** Anti-ID reliance is demonstrable; learning loop can be built later without changing the boundary.

---

## 5. Location choice (world vs minecraft-interface)

**Recommendation:** Start in `packages/minecraft-interface` for speed, but:
- Define TrackSet/EvidenceBatch/SALIENCY_DIFF types in a clean module boundary.
- Keep the API surface free of Minecraft-specific types.

This makes later extraction to `packages/world` or a shared package mechanical.

---

## 6. Contract strategy (minimal, versioned, explicit)

**Principle:** No in-place mutation of `/process` without versioning.

Recommended options:
- **Versioned payload:** `request_version: 'saliency_delta' | 'legacy_observation'`.  
- **Separate endpoints:** `/process/delta`, `/process/legacy`.

Minimum delta payload:
- `tick_id`
- `saliency_events[]` (bounded list)
- optional `snapshot` (compact TrackSet summary on resync)

### 6.1 Contract schema additions (exact shape)

Add to `contracts/cognition-observation.yaml` (or a new schema file referenced from it). Implementers must not accept or send environmental-awareness payloads without a version field.

**New request discriminator (required at top level):**

```yaml
# In the request body for POST /process (environmental path)
request_version:
  type: string
  enum: [saliency_delta, legacy_observation]
  description: "Required. Use saliency_delta for Belief Bus outputs; legacy_observation for existing per-entity payloads during migration."
```

**Saliency-delta request shape (when request_version === 'saliency_delta'):**

```yaml
SaliencyDeltaRequest:
  type: object
  required: [request_version, stream_id, seq, tick_id]
  properties:
    request_version:
      const: saliency_delta
    stream_id:
      type: string
      description: "Identifies the belief stream (e.g., 'entity_tracker'). Cognition discards out-of-order seqs per stream_id."
    seq:
      type: integer
      format: int64
      description: "Monotonic sequence number per stream_id. Cognition applies in order; discards if seq <= last seen."
    tick_id:
      type: integer
      format: int64
      description: "Belief Bus ingestion tick (high-frequency, e.g. 100-250ms interval). Separate from cognition emission cadence."
    snapshot:
      $ref: '#/components/schemas/TrackSetSnapshot'
      description: "When present, cognition applies snapshot BEFORE deltas in the same envelope."
    saliency_events:
      type: array
      maxItems: 32
      items:
        $ref: '#/components/schemas/SaliencyDelta'
      description: "Applied after snapshot (if present). Stable deterministic ordering by (tick_id, track_id, event_type)."

SaliencyDelta:
  type: object
  required: [type, track_id]
  properties:
    type:
      type: string
      enum: [new_threat, track_lost, reclassified, movement_bucket_change]
    track_id:
      type: string
      description: "Deterministic track ID (content-derived or sequential from canonicalized stream)."
    threat_level:
      type: string
      enum: [low, medium, high, critical]
    distance_bucket:
      type: integer
      minimum: 0

TrackSetSnapshot:
  type: object
  required: [tick_id, tracks]
  properties:
    tick_id:
      type: integer
      format: int64
    tracks:
      type: array
      maxItems: 64
      items:
        $ref: '#/components/schemas/TrackSummary'

TrackSummary:
  type: object
  required: [track_id, visibility, threat_level]
  properties:
    track_id:
      type: string
    class_label:
      type: string
    distance_bucket:
      type: integer
    visibility:
      type: string
      enum: [visible, inferred, lost]
    threat_level:
      type: string
      enum: [low, medium, high, critical]
```

**Server behavior:** If `request_version === 'saliency_delta'`, the server must **not** call `buildObservationPayload` or `observationReasoner.reason(observation)` with a single-entity payload. It must route to a delta/snapshot handler that accepts `SaliencyDeltaRequest`. Cognition must apply snapshot (if present) **before** deltas in the same envelope, and must discard out-of-order `seq` values.

---

## 6.2 Implementation construction constraints (8 pivots with acceptance checks)

These address "implementation-shaped footguns" where the plan is conceptually correct but the default code path will still violate the intent. Each pivot has an **acceptance check** that proves correctness.

### Pivot 1: Tick identity and cadence — real sampling clock, not scan iteration

**Problem:** If `tickId` increments per scan (every 10s), belief dynamics (DECAY, lost transitions, warmup) run at 0.1 Hz. Reflex safety is too stale; determinism and sparsity are misleading (sparse because barely observing).

**Pivot:** Decouple **ingestion cadence** from **cognition emission cadence**.

- **Ingest EvidenceBatch at high frequency:** Use the actual game tick, physics tick, or a fast interval (100–250ms).
- **Run SALIENCY_DIFF on every ingest:** Belief Bus updates every tick.
- **Emit cognition-bound deltas under attention budget:** Cognition POST frequency is bounded separately (e.g., at most 1 request per second, containing a bounded batch of deltas accumulated since last emission).
- **Emit snapshots periodically** (e.g., every 5s or on connect).

**Implementation:**

```ts
// High-frequency tick source (NOT the 10s scan interval)
const TICK_INTERVAL_MS = 200; // 5 Hz
let tickId = 0;

setInterval(() => {
  tickId++;
  const batch = buildEvidenceBatch(bot, tickId);
  beliefBus.ingest(batch); // Updates TrackSet every tick
}, TICK_INTERVAL_MS);

// Separate cognition emission (rate-limited)
const EMIT_INTERVAL_MS = 1000; // 1 Hz to cognition
setInterval(() => {
  const pendingDeltas = beliefBus.flushPendingDeltas();
  const snapshot = beliefBus.shouldEmitSnapshot() ? beliefBus.getCurrentSnapshot() : undefined;
  if (pendingDeltas.length > 0 || snapshot) {
    sendToCognition({ stream_id, seq: nextSeq++, tick_id: tickId, snapshot, saliency_events: pendingDeltas });
  }
}, EMIT_INTERVAL_MS);
```

**Acceptance check:** When a hostile closes distance quickly, the belief bus reacts within <250ms even if cognition is rate-limited. Reflex reads from TrackSet every tick and can act immediately.

---

### Pivot 2: Canonicalization uses integer buckets end-to-end, not float formatting

**Problem:** Using `toFixed(1)` and string keys is a determinism trap. Float formatting and upstream float jitter create "new evidence identities" across runs and environments.

**Pivot:** Canonicalize exclusively with **integer buckets**. Never use float stringification in the deterministic core path.

**Implementation:**

```ts
const POS_BUCKET_SIZE = 1;       // 1-block position buckets
const DIST_BUCKET_SIZE = 2;      // 2-block distance buckets
const VEL_BUCKET_SIZE = 0.5;     // velocity buckets

function toPosBucket(v: number): number { return Math.floor(v / POS_BUCKET_SIZE); }
function toDistBucket(d: number): number { return Math.floor(d / DIST_BUCKET_SIZE); }
function toVelBucket(v: number): number { return Math.floor(v / VEL_BUCKET_SIZE); }

interface CanonicalEvidenceKey {
  posBucketX: number;
  posBucketY: number;
  posBucketZ: number;
  distBucket: number;
  kindEnum: number;  // e.g., 0=zombie, 1=skeleton, 2=creeper, ...
}

function toCanonicalKey(item: EvidenceItem): CanonicalEvidenceKey {
  return {
    posBucketX: toPosBucket(item.position.x),
    posBucketY: toPosBucket(item.position.y),
    posBucketZ: toPosBucket(item.position.z),
    distBucket: toDistBucket(item.distanceBucket),  // already bucketed at boundary
    kindEnum: kindToEnum(item.features.name as string),
  };
}

// Stable sort key as tuple of integers (no strings from floats)
function stableSortKey(k: CanonicalEvidenceKey): number[] {
  return [k.distBucket, k.posBucketX, k.posBucketY, k.posBucketZ, k.kindEnum];
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
```

**Acceptance check:** Same entity positions with ±0.02 noise map to the same evidence key and do not generate deltas.

---

### Pivot 3: Track IDs must be deterministic across replay

**Problem:** If track IDs use randomness or "first seen order" without a deterministic tie-breaker, you can have the same TrackSet hash but different delta payloads across replays (because `track_id` differs), breaking cognition resync and making tests flaky.

**Pivot:** Make `track_id` generation deterministic.

**Options:**

- **Deterministic sequential:** Allocate next ID in stable order each tick based on canonicalized evidence stream.
- **Content-derived:** `track_id = hash(firstSeenTick, posBucketX, posBucketY, posBucketZ, kindEnum, disambiguator)`.
- **Stage 1:** `track_id = 'T' + hash(engineId)` when engineId present; fall back to content-derived when absent. Use engineId for ID generation (not association), then Stage 2 ID-noise harness tests without engineId.

**Implementation (content-derived):**

```ts
function deriveTrackId(firstSeenTick: number, key: CanonicalEvidenceKey, disambiguator: number): string {
  const input = [firstSeenTick, key.posBucketX, key.posBucketY, key.posBucketZ, key.kindEnum, disambiguator].join(':');
  return 'T' + simpleHash(input).toString(16).slice(0, 8);
}

// disambiguator increments if multiple tracks have same (firstSeenTick, key) in the same tick
```

**Acceptance check:** Replaying the same `EvidenceBatch` stream produces **identical** `SaliencyDelta` payloads byte-for-byte (including `track_id` and event ordering).

---

### Pivot 4: Delta ordering and batching — single POST with stream contract, not multiple POSTs

**Problem:** Separate POSTs for deltas and snapshots can reorder (network jitter, retries, concurrent requests). Cognition can apply deltas against the wrong baseline.

**Pivot:** Treat emissions like an event-sourced stream. Single POST shape per emission with `stream_id`, `seq`, `tick_id`.

**Stream contract:**

- `stream_id`: Identifies the belief stream (e.g., `'entity_tracker'`).
- `seq`: Monotonic sequence number per `stream_id`. Cognition discards if `seq <= lastSeenSeq`.
- `tick_id`: Belief Bus ingestion tick (high-frequency).
- `snapshot`: When present, cognition applies **before** deltas in the same envelope.
- `saliency_events`: Applied **after** snapshot.

**Implementation:**

```ts
interface BeliefStreamEnvelope {
  request_version: 'saliency_delta';
  stream_id: string;
  seq: number;
  tick_id: number;
  snapshot?: Snapshot;
  saliency_events: SaliencyDelta[];
}

// Single POST per emission
async function emitToCognition(envelope: BeliefStreamEnvelope): Promise<void> {
  await fetch(`${cognitionUrl}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  });
}
```

**Cognition applies:**

```ts
function applyEnvelope(envelope: BeliefStreamEnvelope, state: CognitionBeliefState): void {
  if (envelope.seq <= state.lastSeq[envelope.stream_id]) {
    console.warn(`Discarding out-of-order seq ${envelope.seq}`);
    return;
  }
  state.lastSeq[envelope.stream_id] = envelope.seq;
  if (envelope.snapshot) {
    state.tracks = rebuildFromSnapshot(envelope.snapshot);  // Apply snapshot first
  }
  for (const delta of envelope.saliency_events) {
    applyDelta(delta, state);  // Apply deltas second
  }
}
```

**Acceptance check:** If the network delivers packets out of order, cognition does not regress or hallucinate stale tracks.

---

### Pivot 5: "No bypass" needs enforcement, not just guidance

**Problem:** Without a guardrail, bypasses will eventually be reintroduced (debug feature, innocent helper calling `/process` directly, etc.).

**Pivot:** Add a mechanical tripwire.

**Implementation:**

```ts
// In CI test or pre-commit hook
// packages/minecraft-interface/src/__tests__/no-raw-observation-bypass.test.ts

import { execSync } from 'child_process';

describe('No raw observation bypass', () => {
  it('must not send environmental_awareness without request_version: saliency_delta', () => {
    // Grep for any POST to /process with type: environmental_awareness
    const result = execSync(
      `rg -l "environmental_awareness" packages/minecraft-interface/src --type ts || true`,
      { encoding: 'utf-8' }
    );
    const files = result.trim().split('\n').filter(Boolean);

    for (const file of files) {
      const content = require('fs').readFileSync(file, 'utf-8');
      // If file mentions environmental_awareness, it must also have request_version: 'saliency_delta'
      if (content.includes("type: 'environmental_awareness'") || content.includes('type: "environmental_awareness"')) {
        expect(content).toMatch(/request_version.*saliency_delta/);
      }
    }
  });
});
```

**Acceptance check:** Any attempt to reintroduce per-entity `/process` calls (without `request_version: saliency_delta`) fails CI immediately.

---

### Pivot 6: Reflex safety arbitration — reflex and planner must not fight

**Problem:** If reflex directly controls movement/combat while planning/executor is also issuing actions, you get oscillation or deadlocks ("planner says forward, reflex says back up").

**Pivot:** Define a simple arbitration policy.

- **Reflex has priority** for a bounded time window ("reflex override for N ticks").
- **Planner pauses** or receives a "blocked by safety" signal during override.
- **Reflex emits a typed event** that cognition/planning can interpret ("entered reflex mode: threat critical-close").

**Implementation:**

```ts
interface ReflexOverrideState {
  active: boolean;
  reason: string;
  expiresAtTick: number;
}

class ReflexArbitrator {
  private override: ReflexOverrideState = { active: false, reason: '', expiresAtTick: 0 };
  private readonly OVERRIDE_DURATION_TICKS = 10; // ~2s at 5Hz

  enterReflexMode(reason: string, currentTick: number): void {
    this.override = {
      active: true,
      reason,
      expiresAtTick: currentTick + this.OVERRIDE_DURATION_TICKS,
    };
    this.emitReflexEvent({ type: 'reflex_entered', reason, tick: currentTick });
  }

  tickUpdate(currentTick: number): void {
    if (this.override.active && currentTick >= this.override.expiresAtTick) {
      this.override.active = false;
      this.emitReflexEvent({ type: 'reflex_exited', tick: currentTick });
    }
  }

  isPlannerBlocked(): boolean {
    return this.override.active;
  }

  private emitReflexEvent(event: { type: string; reason?: string; tick: number }): void {
    // Log to telemetry; optionally include in next cognition envelope
    console.log(`[Reflex] ${event.type}: ${event.reason ?? ''}`);
  }
}

// In planner/executor
if (reflexArbitrator.isPlannerBlocked()) {
  console.log('[Planner] Paused: reflex override active');
  return; // Skip planning actions this tick
}
```

**Acceptance check:** Under sustained threat, the bot behaves coherently (one controller is in charge at a time), and planning resumes after threat exits.

---

### Pivot 7: Stage separation — active sensing and learning are telemetry-only in boundary milestone

**Problem:** ACTIVE_SENSE_REQUEST and "execution-grounded updates" tend to creep in and add noise before the core boundary is proven.

**Pivot:** Treat both as typed outputs with **telemetry-only semantics** in the first milestone.

- **ACTIVE_SENSE_REQUEST:** Emitted but **not executed** until Stage 3, or executed only in a minimal deterministic way (turn-to, single scan) without involving cognition.
- **Preventability telemetry:** Logged (track existed? confidence? hazard? LOS? time since last seen?); **no learning updates** until after event sparsity and separation are certified.

**Implementation:**

```ts
// ACTIVE_SENSE_REQUEST is emitted but flagged as telemetry-only
interface ActiveSenseRequest {
  type: 'turn_to' | 'sector_scan' | 'move_to_vantage';
  target: { bearing?: number; region?: string; position?: { x: number; y: number; z: number } };
  telemetryOnly: boolean; // true in Stage 1; false in Stage 3
}

// In Belief Bus
function emitActiveSenseRequest(req: ActiveSenseRequest): void {
  if (req.telemetryOnly) {
    console.log(`[Telemetry] ActiveSenseRequest: ${JSON.stringify(req)}`);
    return; // Do not execute
  }
  executeActiveSense(req);
}

// Preventability telemetry (no learning in Stage 1)
interface PreventabilitySignal {
  deathTick: number;
  trackExisted: boolean;
  trackConfidence: number;
  hazardWarningActive: boolean;
  losAtDeath: boolean;
  ticksSinceLastSeen: number;
}

function logPreventability(signal: PreventabilitySignal): void {
  console.log(`[Telemetry] Preventability: ${JSON.stringify(signal)}`);
  // Stage 1: log only; Stage 3: feed to learning loop
}
```

**Acceptance check:** First milestone produces stable sparse deltas without needing active sensing or learning to "fix" it.

---

### Pivot 8: Hazard summary is structurally excluded from canonical planning state

**Problem:** Someone "just adds hazard_regions to planner state" and search explodes due to jitter and combinatorics.

**Pivot:** Make the exclusion **structural**.

- **Hazard summary is a runtime control input** for local navigation/reflex only.
- **Never include in canonical planning state hash** unless a dedicated, separately-bucketed hazard field type is created for a specific Sterling domain with strict caps and stable thresholds.

**Implementation:**

```ts
// Hazard summary type: derived, ephemeral, NOT part of canonical state
interface HazardSummary {
  regions: Array<{
    centerBucket: { x: number; y: number; z: number };
    radiusBucket: number;
    threatLevel: 'low' | 'medium' | 'high' | 'critical';
  }>;
  derivedAtTick: number;
}

// Used by reflex and navigation; NOT passed to Sterling unless a hazard-aware domain exists
function computeHazardSummary(trackSet: TrackSet): HazardSummary {
  const regions = trackSet.tracks
    .filter(t => t.threatLevel === 'high' || t.threatLevel === 'critical')
    .map(t => ({
      centerBucket: { x: t.posBucketX, y: t.posBucketY, z: t.posBucketZ },
      radiusBucket: 2,
      threatLevel: t.threatLevel,
    }));
  return { regions: regions.slice(0, 8), derivedAtTick: trackSet.lastTick }; // Bounded
}

// In planner state builder: DO NOT include hazard
function buildPlanningState(worldState: WorldState): PlanningState {
  return {
    inventory: worldState.inventory,
    nearbyBlocks: worldState.nearbyBlocks,
    // hazard: computeHazardSummary(...),  // <-- NEVER add this unless explicit hazard-aware domain
  };
}
```

**If a Sterling domain later needs hazard:**

```ts
// Create a dedicated hazard-aware domain state type with strict caps
interface HazardAwareDomainState extends BaseDomainState {
  hazard_regions: Array<{
    center: { x: number; y: number; z: number }; // Integer buckets only
    radius: number; // Integer bucket
    threat: 0 | 1 | 2 | 3; // Enum, not string
  }>;
}
// maxItems: 4; strictly bucketed; no floats in hash
```

**Acceptance check:** Adding hazard avoidance does not increase canonical state cardinality beyond a bounded factor (e.g., at most 4 regions × 4 threat levels = 16× factor).

---

### Summary: Acceptance check table

| Pivot | Acceptance check |
|-------|------------------|
| 1. Tick cadence | Belief Bus reacts to closing hostile in <250ms; reflex reads every tick. |
| 2. Integer buckets | Same positions with ±0.02 noise → same evidence key, no deltas. |
| 3. Deterministic track IDs | Replaying same EvidenceBatch stream → identical SaliencyDelta byte-for-byte. |
| 4. Stream contract | Out-of-order network delivery → cognition does not regress or hallucinate. |
| 5. No bypass enforcement | Per-entity `/process` call without `request_version` → CI fails. |
| 6. Reflex arbitration | Sustained threat → one controller at a time; planner resumes after threat exits. |
| 7. Stage separation | Stage 1 produces stable sparse deltas without active sensing or learning. |
| 8. Hazard exclusion | Hazard avoidance → state cardinality increase bounded (≤16× factor). |

---

## 7. Determinism and boundedness rules (non-negotiable)

- **Canonical ordering:** EvidenceBatch must be deterministically sorted before association.  
- **Tick-only time:** Belief core uses `tick_id`, no wall-clock ms.  
- **Track caps:** TrackSet size is bounded; eviction deterministic.  
- **Hysteresis + warmup:** Event emission stabilizes after first K ticks.  
- **Distance buckets only:** No raw floats in saliency thresholds or canonical hashes.

---

## 8. What to investigate first (short list)

1. All call sites of Cognition `/process` with `environmental_awareness`.  
2. Whether any components bypass the bot-adapter path with raw detections.  
3. ThreatPerceptionManager usage and whether it is a second source of truth.  
4. Canonical tick source in Minecraft interface (game tick vs bucketed time).

---

## 9. Test focus (proof of invariant)

**Unit (Belief Bus):**
- Same `(tick_id, EvidenceBatch)` stream => same TrackSet hash and deltas.
- Track cap enforcement and deterministic eviction.
- Decay behavior and uncertainty growth.
- Hysteresis + warmup: no repeated deltas in stable scenes.

**Integration:**
- Bot-adapter no longer sends per-entity POSTs.
- Only versioned delta/snapshot payloads reach cognition.

**Certification targets:**
- Event sparsity after warmup.  
- Separation invariant: raw detections never enter cognition/planning.

---

## 10. Practical risks and mitigations

- **Risk:** Dual world models (TrackSet + ThreatPerceptionManager).  
  **Mitigation:** Refactor to single ownership; enforce via code path audits.

- **Risk:** Non-determinism from unordered entity lists.  
  **Mitigation:** Stable sort + tick-bucketed time.

- **Risk:** Cognition drift on dropped delta packets.  
  **Mitigation:** Periodic snapshots + on-connect snapshot.

---

## 11. Definition of "done" for the boundary milestone

### Core boundary criteria

- **No raw detections to cognition:** `processEntity()` per-entity POSTs are removed or bypassed for environmental awareness.
- **Versioned stream contract payloads only:** Cognition receives `saliency_delta` requests with `stream_id`, `seq`, `tick_id`, and applies snapshot **before** deltas in the same envelope.
- **Deterministic belief outputs:** same `(tick_id, EvidenceBatch)` stream yields identical TrackSet hash and identical delta payloads byte-for-byte (including track IDs and event ordering).
- **Event sparsity validated:** stable scenes emit near-zero deltas after warmup.
- **Reflex safety decoupled:** immediate threat responses rely on TrackSet/hazard, not cognition; reflex has priority over planner during override.

### Implementation construction acceptance checks (8 pivots)

| # | Pivot | Acceptance check |
|---|-------|------------------|
| 1 | Tick cadence | Belief Bus reacts to closing hostile in <250ms even if cognition is rate-limited. |
| 2 | Integer buckets | Same positions with ±0.02 noise map to same evidence key, no deltas. |
| 3 | Deterministic track IDs | Replaying same EvidenceBatch stream produces identical SaliencyDelta bytes. |
| 4 | Stream contract | Out-of-order network delivery does not regress or hallucinate stale tracks. |
| 5 | Bypass enforcement | Per-entity `/process` call without `request_version` fails CI immediately. |
| 6 | Reflex arbitration | Sustained threat results in coherent behavior (one controller at a time). |
| 7 | Stage separation | Stage 1 produces stable sparse deltas without active sensing or learning. |
| 8 | Hazard exclusion | Hazard avoidance does not increase canonical state cardinality beyond bounded factor. |

**All 8 acceptance checks must pass before the boundary milestone is considered "done."**

---

## 12. Proposed interfaces and signatures (new code shape)

These are concrete signatures and file paths so implementers can add the right types and functions in the right places. Align with the contract schema in section 6.1 (e.g. `track_id` in JSON vs `trackId` in TypeScript is a naming convention choice; keep one consistent).

### 12.1 Belief Bus (new module)

**File:** `packages/minecraft-interface/src/entity-belief/belief-bus.ts`  
**Exports:** Types for evidence, tracks, deltas, snapshots, and the BeliefBus interface.

**Key design (per Pivot 1, 2, 3, 4):**
- High-frequency ingest (100–250ms) is separate from cognition emission (rate-limited, e.g. 1Hz).
- All canonical fields are **integer buckets** (no float stringification).
- Track IDs are **deterministic** (content-derived or sequential from canonicalized stream).
- Stream contract: `stream_id`, `seq`, `tick_id`, snapshot before deltas.

```ts
// packages/minecraft-interface/src/entity-belief/belief-bus.ts

// ============================================================================
// Constants (Pivot 2: integer buckets)
// ============================================================================

export const POS_BUCKET_SIZE = 1;      // 1-block position buckets
export const DIST_BUCKET_SIZE = 2;     // 2-block distance buckets
export const TRACK_CAP = 64;
export const MAX_SALIENCY_EVENTS_PER_TICK = 32;
export const TICK_INTERVAL_MS = 200;   // 5 Hz ingestion (Pivot 1)
export const EMIT_INTERVAL_MS = 1000;  // 1 Hz cognition emission (Pivot 1)
export const SNAPSHOT_INTERVAL_TICKS = 25; // Every ~5s at 5Hz

// ============================================================================
// Canonical key (Pivot 2: integer buckets only, no floats)
// ============================================================================

export interface CanonicalEvidenceKey {
  posBucketX: number;
  posBucketY: number;
  posBucketZ: number;
  distBucket: number;
  kindEnum: number; // e.g., 0=zombie, 1=skeleton, etc.
}

// ============================================================================
// Evidence types
// ============================================================================

export interface EvidenceBatch {
  tickId: number;
  items: EvidenceItem[];
}

export interface EvidenceItem {
  kind: 'entity' | 'event';
  /** Integer buckets (Pivot 2); NOT raw floats. */
  posBucketX: number;
  posBucketY: number;
  posBucketZ: number;
  distBucket: number;
  los: 'visible' | 'occluded' | 'unknown';
  /** Optional engine id: soft hint only (Pivot 3); used for ID seeding in Stage 1. */
  engineId?: string | number;
  kindEnum: number;
  features: Record<string, string | number | boolean>;
}

// ============================================================================
// Delta and snapshot types
// ============================================================================

export type SaliencyDeltaType =
  | 'new_threat'
  | 'track_lost'
  | 'reclassified'
  | 'movement_bucket_change';

export interface SaliencyDelta {
  type: SaliencyDeltaType;
  /** Deterministic track ID (Pivot 3); same replay => same ID. */
  trackId: string;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  distBucket: number;
}

export interface TrackSummary {
  trackId: string;
  classLabel: string;
  posBucketX: number;
  posBucketY: number;
  posBucketZ: number;
  distBucket: number;
  visibility: 'visible' | 'inferred' | 'lost';
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface Snapshot {
  tickId: number;
  tracks: TrackSummary[];
}

// ============================================================================
// Stream envelope (Pivot 4: single POST with stream contract)
// ============================================================================

export interface BeliefStreamEnvelope {
  request_version: 'saliency_delta';
  stream_id: string;
  seq: number;       // Monotonic per stream_id; cognition discards out-of-order
  tick_id: number;
  snapshot?: Snapshot;        // Applied BEFORE deltas if present
  saliency_events: SaliencyDelta[];  // Applied AFTER snapshot
}

// ============================================================================
// Belief Bus interface
// ============================================================================

export interface BeliefBusOutput {
  /** Deltas emitted this tick (may be empty). */
  deltas: SaliencyDelta[];
  /** Snapshot if emit interval reached or on connect. */
  snapshot?: Snapshot;
}

export interface BeliefBus {
  /**
   * Ingest evidence batch (high-frequency, every TICK_INTERVAL_MS).
   * Deterministic: same (tickId, items) order => same TrackSet hash and deltas.
   * Items MUST be canonicalized (integer buckets, stable sort) before calling.
   */
  ingest(batch: EvidenceBatch): BeliefBusOutput;

  /**
   * Flush pending deltas for cognition emission (called at EMIT_INTERVAL_MS).
   * Returns deltas accumulated since last flush; clears pending buffer.
   */
  flushPendingDeltas(): SaliencyDelta[];

  /** Returns true if snapshot should be emitted this emission cycle. */
  shouldEmitSnapshot(): boolean;

  /** Get current TrackSet as snapshot (for reflex layer reading every tick). */
  getCurrentSnapshot(): Snapshot | null;
}
export const MAX_SALIENCY_EVENTS_PER_TICK = 32;
```

### 12.2 Evidence builder (canonical ordering with integer buckets)

**File:** `packages/minecraft-interface/src/entity-belief/evidence-builder.ts`  
**Rule:** Must use **integer buckets only** (Pivot 2); must sort before returning; never return unsorted items; no float stringification.

```ts
// packages/minecraft-interface/src/entity-belief/evidence-builder.ts

import { Bot } from 'mineflayer';
import {
  EvidenceBatch,
  EvidenceItem,
  POS_BUCKET_SIZE,
  DIST_BUCKET_SIZE,
} from './belief-bus';

// ============================================================================
// Integer bucket conversion (Pivot 2: no floats in canonical core)
// ============================================================================

function toPosBucket(v: number): number {
  return Math.floor(v / POS_BUCKET_SIZE);
}

function toDistBucket(d: number): number {
  return Math.floor(d / DIST_BUCKET_SIZE);
}

const KIND_ENUM_MAP: Record<string, number> = {
  zombie: 0, skeleton: 1, creeper: 2, spider: 3, enderman: 4,
  husk: 5, drowned: 6, witch: 7, pillager: 8, vindicator: 9,
  unknown: 99,
};

function kindToEnum(name: string): number {
  return KIND_ENUM_MAP[name.toLowerCase()] ?? KIND_ENUM_MAP.unknown;
}

// ============================================================================
// Stable sort key (Pivot 2: tuple of integers, no string from floats)
// ============================================================================

function stableSortKey(item: EvidenceItem): number[] {
  return [item.distBucket, item.posBucketX, item.posBucketY, item.posBucketZ, item.kindEnum];
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** MUST be called before passing items to BeliefBus; otherwise determinism is broken. */
export function canonicalizeEvidence(items: EvidenceItem[]): EvidenceItem[] {
  return [...items].sort((a, b) => compareKeys(stableSortKey(a), stableSortKey(b)));
}

// ============================================================================
// Build evidence batch (integer buckets, canonical order)
// ============================================================================

export function buildEvidenceBatch(bot: Bot, tickId: number): EvidenceBatch {
  const entities = Object.values(bot.entities).filter(
    (e) =>
      e !== bot.entity &&
      e.name !== 'item' &&
      bot.entity.position.distanceTo(e.position) <= 15
  );

  const items: EvidenceItem[] = entities.map((entity) => {
    const distance = bot.entity!.position.distanceTo(entity.position);
    return {
      kind: 'entity',
      // Integer buckets only (Pivot 2)
      posBucketX: toPosBucket(entity.position.x),
      posBucketY: toPosBucket(entity.position.y),
      posBucketZ: toPosBucket(entity.position.z),
      distBucket: toDistBucket(distance),
      los: 'unknown',
      engineId: entity.id,  // Soft hint (Pivot 3); used for ID seeding in Stage 1
      kindEnum: kindToEnum(entity.name ?? entity.type ?? 'unknown'),
      features: { name: entity.name ?? entity.type ?? 'unknown' },
    };
  });

  return { tickId, items: canonicalizeEvidence(items) };
}
```

### 12.3 Bot-adapter wiring (decoupled tick/emission cadence)

**File:** `packages/minecraft-interface/src/bot-adapter.ts`  
**Key design (Pivots 1, 4, 6):**
- High-frequency **ingest** (every 200ms, 5Hz) separate from **cognition emission** (every 1000ms, 1Hz).
- Single POST per emission with **stream contract** (`stream_id`, `seq`, `tick_id`, snapshot before deltas).
- Reflex reads from TrackSet every tick (immediate); planner respects reflex arbitration.

```ts
// packages/minecraft-interface/src/bot-adapter.ts (target shape)

import {
  buildEvidenceBatch,
  BeliefBus,
  BeliefStreamEnvelope,
  TICK_INTERVAL_MS,
  EMIT_INTERVAL_MS,
} from './entity-belief';
import { ReflexArbitrator } from './reflex/reflex-arbitrator';

class BotAdapter {
  private beliefBus: BeliefBus;
  private reflexArbitrator: ReflexArbitrator;
  private tickId = 0;
  private seq = 0;
  private readonly STREAM_ID = 'entity_tracker';

  // ============================================================================
  // High-frequency ingestion loop (Pivot 1: 5Hz)
  // ============================================================================

  private setupHighFrequencyIngestion(): void {
    setInterval(() => {
      if (!this.bot?.entity) return;
      this.tickId++;
      const batch = buildEvidenceBatch(this.bot, this.tickId);
      this.beliefBus.ingest(batch);  // Update TrackSet every tick

      // Reflex reads every tick and can act immediately (Pivot 6)
      const snapshot = this.beliefBus.getCurrentSnapshot();
      this.applyReflexSafety(snapshot);
      this.reflexArbitrator.tickUpdate(this.tickId);
    }, TICK_INTERVAL_MS);
  }

  // ============================================================================
  // Rate-limited cognition emission loop (Pivot 1: 1Hz)
  // ============================================================================

  private setupCognitionEmission(): void {
    setInterval(async () => {
      if (!this.bot?.entity) return;
      const pendingDeltas = this.beliefBus.flushPendingDeltas();
      const snapshot = this.beliefBus.shouldEmitSnapshot()
        ? this.beliefBus.getCurrentSnapshot()
        : undefined;

      if (pendingDeltas.length === 0 && !snapshot) return;

      // Single POST with stream contract (Pivot 4)
      const envelope: BeliefStreamEnvelope = {
        request_version: 'saliency_delta',
        stream_id: this.STREAM_ID,
        seq: this.seq++,
        tick_id: this.tickId,
        snapshot: snapshot ?? undefined,
        saliency_events: pendingDeltas.slice(0, 32),  // Bounded
      };

      const cognitionUrl = process.env.COGNITION_SERVICE_URL ?? 'http://localhost:3003';
      await fetch(`${cognitionUrl}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      });
    }, EMIT_INTERVAL_MS);
  }

  // ============================================================================
  // Reflex safety (Pivot 6: arbitration with planner)
  // ============================================================================

  private applyReflexSafety(snapshot: Snapshot | null): void {
    if (!snapshot?.tracks) return;
    const criticalClose = snapshot.tracks.filter(
      (t) => t.threatLevel === 'critical' && t.distBucket <= 2
    );
    if (criticalClose.length > 0) {
      this.reflexArbitrator.enterReflexMode('threat_critical_close', this.tickId);
      this.executeReflexEvasion();
    }
  }

  private executeReflexEvasion(): void {
    // Immediate strafe/block/retreat; does NOT call cognition
    console.log('[Reflex] Executing evasion');
  }
}
```

**Required:**
- `beliefBus: BeliefBus` must be injected or created in constructor.
- `reflexArbitrator: ReflexArbitrator` manages priority between reflex and planner (Pivot 6).
- **No** `for (const entity of nearbyEntities) { await this.processEntity(entity); }` in the environmental path.
- **No** separate POSTs for snapshot and deltas; single envelope with stream contract.

**Acceptance check:** When a hostile closes distance quickly, the belief bus reacts within <250ms (reflex reads every 200ms); cognition receives batched deltas at 1Hz; network reorder does not cause regression (seq + snapshot-before-deltas).

### 12.4 Cognition server (versioned branch with stream contract)

**File:** `packages/cognition/src/server.ts`  
**Key design (Pivot 4):**
- Track last `seq` per `stream_id`; discard out-of-order.
- Apply `snapshot` **before** `saliency_events` in the same envelope.
- Never call legacy `observationReasoner.reason()` for versioned payloads.

```ts
// packages/cognition/src/server.ts

import { SaliencyReasonerState, applySaliencyEnvelope } from './environmental/saliency-reasoner';

// State per stream (maintained in memory or injected)
const saliencyState: SaliencyReasonerState = {
  lastSeq: {},          // { [stream_id]: number }
  tracks: new Map(),    // Current belief about tracks
};

// Add this branch at the start of the /process handler (before line 1563)
if (req.body?.request_version === 'saliency_delta') {
  const envelope = req.body as BeliefStreamEnvelope;

  // Pivot 4: Discard out-of-order seq
  const lastSeq = saliencyState.lastSeq[envelope.stream_id] ?? -1;
  if (envelope.seq <= lastSeq) {
    console.warn(`Discarding out-of-order seq ${envelope.seq} for stream ${envelope.stream_id}`);
    res.json({ processed: false, reason: 'out_of_order_seq' });
    return;
  }
  saliencyState.lastSeq[envelope.stream_id] = envelope.seq;

  // Apply envelope: snapshot first, then deltas (Pivot 4)
  const result = await applySaliencyEnvelope(envelope, saliencyState);
  res.json(result);
  return;
}
```

**New handler (new file):**  
**File:** `packages/cognition/src/environmental/saliency-reasoner.ts`

```ts
// packages/cognition/src/environmental/saliency-reasoner.ts

import { BeliefStreamEnvelope, SaliencyDelta, Snapshot, TrackSummary } from '../../../minecraft-interface/src/entity-belief';

export interface SaliencyReasonerState {
  lastSeq: Record<string, number>;
  tracks: Map<string, TrackSummary>;
}

export interface SaliencyReasonerResult {
  processed: boolean;
  type: 'environmental_awareness';
  request_version: 'saliency_delta';
  stream_id: string;
  seq: number;
  tick_id: number;
  thought: { text: string; source: 'saliency_delta' };
  actions: { shouldRespond: boolean; shouldCreateTask: boolean; response?: string; tasks: unknown[] };
  timestamp: number;
}

/**
 * Apply envelope: snapshot BEFORE deltas (Pivot 4).
 * Cognition state is rebuilt from snapshot if present, then deltas applied in order.
 */
export async function applySaliencyEnvelope(
  envelope: BeliefStreamEnvelope,
  state: SaliencyReasonerState
): Promise<SaliencyReasonerResult> {
  // Step 1: Apply snapshot if present (resets tracks)
  if (envelope.snapshot) {
    state.tracks.clear();
    for (const track of envelope.snapshot.tracks) {
      state.tracks.set(track.trackId, track);
    }
  }

  // Step 2: Apply deltas in order
  for (const delta of envelope.saliency_events) {
    applyDelta(delta, state);
  }

  // Step 3: Generate thought from current belief state
  const threats = Array.from(state.tracks.values()).filter(t => t.threatLevel === 'high' || t.threatLevel === 'critical');
  const thought = generateSaliencyThought(threats, envelope.tick_id);

  return {
    processed: true,
    type: 'environmental_awareness',
    request_version: 'saliency_delta',
    stream_id: envelope.stream_id,
    seq: envelope.seq,
    tick_id: envelope.tick_id,
    thought,
    actions: determineActions(threats),
    timestamp: Date.now(),
  };
}

function applyDelta(delta: SaliencyDelta, state: SaliencyReasonerState): void {
  switch (delta.type) {
    case 'new_threat':
      state.tracks.set(delta.trackId, {
        trackId: delta.trackId,
        classLabel: 'unknown',
        posBucketX: 0, posBucketY: 0, posBucketZ: 0,  // Would be in full payload
        distBucket: delta.distBucket,
        visibility: 'visible',
        threatLevel: delta.threatLevel,
      });
      break;
    case 'track_lost':
      state.tracks.delete(delta.trackId);
      break;
    case 'reclassified':
    case 'movement_bucket_change':
      const existing = state.tracks.get(delta.trackId);
      if (existing) {
        state.tracks.set(delta.trackId, { ...existing, threatLevel: delta.threatLevel, distBucket: delta.distBucket });
      }
      break;
  }
}

function generateSaliencyThought(threats: TrackSummary[], tickId: number): { text: string; source: 'saliency_delta' } {
  if (threats.length === 0) {
    return { text: `Tick ${tickId}: No significant threats.`, source: 'saliency_delta' };
  }
  const summary = threats.map(t => `${t.classLabel}(${t.threatLevel})`).join(', ');
  return { text: `Tick ${tickId}: Awareness of threats: ${summary}`, source: 'saliency_delta' };
}

function determineActions(threats: TrackSummary[]): { shouldRespond: boolean; shouldCreateTask: boolean; response?: string; tasks: unknown[] } {
  const critical = threats.filter(t => t.threatLevel === 'critical');
  return {
    shouldRespond: critical.length > 0,
    shouldCreateTask: critical.length > 0 && critical.some(t => t.distBucket <= 4),
    tasks: [],
  };
}
```

The server must **not** call `buildObservationPayload` or `observationReasoner.reason(observation)` when `request_version === 'saliency_delta'`.

### 12.5 Threat perception refactor

**File:** `packages/minecraft-interface/src/threat-perception-manager.ts`  
**Option A (sensor provider):** Remove or stop maintaining `knownThreats` for decision-making; expose only evidence for the EvidenceBatch:

```ts
export function toThreatEvidence(threats: ThreatEntity[]): EvidenceItem[] {
  return threats.map((t) => ({
    kind: 'entity',
    position: { x: t.position.x, y: t.position.y, z: t.position.z },
    distanceBucket: toDistanceBucket(t.distance),
    los: t.hasLineOfSight ? 'visible' : 'occluded',
    features: { type: t.type, threatLevel: t.threatLevel },
  }));
}
```

**Option B (consumer):** Replace reads from `knownThreats` with a function that takes TrackSet or Snapshot:

```ts
export function summarizeThreats(snapshot: Snapshot): { threats: ThreatEntity[]; overallThreatLevel: string } {
  const threats = snapshot.tracks
    .filter((t) => t.threatLevel === 'high' || t.threatLevel === 'critical')
    .map((t) => ({ ...t, lastSeen: Date.now(), distance: t.distanceBucket, hasLineOfSight: t.visibility === 'visible' }));
  return { threats, overallThreatLevel: deriveOverallLevel(threats) };
}
```

### 12.6 Reflex consumer (immediate safety path)

**File:** `packages/minecraft-interface/src/reflex/reflex-safety.ts` (or `packages/minecraft-interface/src/reflex-safety.ts`)  
**Rule:** Must not call Cognition or LLM. Must read only TrackSet/Snapshot or hazard summary.

```ts
export function applyReflexSafety(snapshot: Snapshot | null): void {
  if (!snapshot?.tracks?.length) return;
  const critical = snapshot.tracks.filter(
    (t) => t.threatLevel === 'critical' && t.distanceBucket <= 4
  );
  if (critical.length > 0) {
    // Immediate action: strafe, block, retreat (implement using bot controls)
    executeReflexEvasion();
  }
}
```

---

**Definition of done (boundary milestone):**

- No raw detections cross into cognition or planning.  
- Cognition receives only versioned delta/snapshot payloads for environmental awareness.  
- Stable scene => near-zero deltas after warmup.  
- TrackSet deterministic with fixed input stream.  
- Reflex path exists and does not depend on cognition.
