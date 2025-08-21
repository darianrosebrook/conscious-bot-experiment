# Memory and Recall System: Places and Stories

Author: @darianrosebrook

## 1) Architecture Overview

Four interlocking layers:

1. **Spatial Place Graph (topological map)**
   - Named places (nodes) with chunk/block anchors (private to planner)
   - Edges encode paths, costs, and semantic relations
   - Plan on the graph; execute on the grid

2. **Episodic Log (event-sourced)**
   - Append-only stream of "what happened, where, with whom"
   - Consolidates into summaries/reflections; auditable and rebuildable

3. **Semantic Knowledge Graph**
   - Property graph of entities and relations (offers_trade, contains, last_seen_at)
   - GraphRAG retrieval for structure-aware queries

4. **Working Memory (short-term cache)**
   - Recent observations, current goal stack, threats, intent contracts
   - Periodically consolidated into long-term memory

## 2) Spatial Place Graph

### Place types & anchors

- Examples: `HomeBase`, `SpawnBed`, `StorageChest_X`, `Village:Oakfield`, `TradingPost(Armorer_12)`, `CoalVein_7`, `Portal_Overworld_A`, `CaveMouth_South`.
- Store chunk anchors (16×16) and optional block centers.

### Edges & costs

- Edges: `HomeBase —[safe_path, cost=ticks, lit=yes]→ Village:Oakfield`.
- Maintain overlays for distance, light, and mob risk; select per context.

### Place discovery via visible-only sensing

- From ray-casting/dda observations, emit `PlaceCandidate` for beds, chests, workstations, ores, portals, villagers.
- Promote to `Place` upon re-sighting or interaction.
- Villages: cluster co-observed beds/workstations; infer centroid and radius.

## 3) Episodic Memory (Event Sourcing)

```ts
interface Event {
  ts: number;
  actor: string;
  placeId?: string;
  worldAnchor?: { chunk: { cx: number; cz: number }, block?: { x: number; y: number; z: number } };
  kind: 'DISCOVERY'|'TRADE'|'COMBAT'|'DEATH'|'SLEEP'|'BUILD'|'PROMISE'|'SUMMARY';
  payload?: Record<string, any>;
  salience: number; // initial score 0..1
  evidence?: string[]; // obs_ids
}
```

- Append all events; no in-place mutations.
- Consolidation produces derived `SUMMARY` events, e.g., nightly narrative.

## 4) Semantic Knowledge Graph (GraphRAG-first)

Examples:

```
(NPC:Villager#Armorer_12) -[:OFFERS {buy:'stick', sell:'emerald', rate:'1:1', last_seen:ts}]-> (Place:TradingPost)
(Place:StorageChest_X) -[:CONTAINS {item:'iron_ingot', qty:5, ts}] -> (Item:iron_ingot)
(Bot) -[:SLEPT_AT {ts}] -> (Place:SpawnBed)
(CoalVein_7) -[:LOCATED_IN]-> (Region:CaveMouth_South)
```

- Retrieval expands subgraph neighborhoods for the LLM and planners.
- Maintain provenance by storing `eventId` on edges; include in explanations.

## 5) Working Memory

- `recent_observations`: ring buffer of latest observations (≤ N)
- `current_intent`, `subgoals`
- `active_threats`
- `pending_promises` (from 30/100-day contracts)
- Cleared or consolidated on sleep or idle periods.

## 6) Storage Stack

- Graph: Neo4j (or SQLite/Postgres with a graph library) for nodes/edges.
- Episodic log: append-only table with indices by time/place/actor.
- Vector store: optional for narratives/summaries (FTS5/pgvector).
- Anchors: chunk coords per place; block anchors as needed.

## 7) Consolidation, Salience, Forgetting

- Salience per event/place boosted by survival relevance, novelty, recency, social value.
- Consolidation routine:
  - Summarize last K events → narrative text and summary events.
  - Update graph edges (trade rates, chest contents).
  - Decay stale edges (confidence↓) unless re-seen.
- Forgetting: exponential decay with pins for core memories (spawn bed, named bases).

## 8) Query Patterns

- Where’s home? `(Bot)-[:SLEPT_AT]->(SpawnBed)` → place handle + anchor.
- Where to trade sticks for emeralds? Filter villagers by role and recent offers; rank by recency/path cost.
- What happened last night? Episodic roll-up.
- Where did I last die and what did I drop? `DEATH` then pickup events; surface place + path.

## 9) Interfaces (Sketch)

```ts
// Places (topological)
getPlaceByType(type: 'SpawnBed'|'TradingPost'|'Chest'): Place[]
nearestPlace(type: string, constraints?: Constraints): Place

// Episodic
aappendEvent(e: Event): void
timeline(params: {from?: number; to?: number; placeId?: string; actor?: string; kind?: Event['kind']}): Event[]

// Graph (semantic)
upsertEdge(subject: NodeId, relation: string, object: NodeId, props?: Record<string, any>)
neighbors(node: NodeId, relation?: string, depth?: number): Subgraph

// Composite queries
findTrade(params: {want: string; give: string}): Place[]
lastSeen(entityId: string): { place: Place, ts: number }
```

## 10) Metrics & Tests

Accuracy / utility

- Recall@k for place queries (e.g., nearest chest with iron).
- Multi-hop QA F1 on templated graph questions (trades, resources near biome X).
- Episodic coverage: fraction of key events captured.
- Staleness rate: % of edges whose confidence decayed before refresh.

Behavioral

- Path success from place recall (success/time vs. naive search).
- Trade success after recall (time to emeralds vs. baseline).
- Narrative coherence (rubric on summaries; show reflection impact).

Performance

- Query latency p50/p95 for graph, episodic, composite queries.
- Memory growth and GC effectiveness (evictions per period).

Tests

- Fixture worlds: verify visible-only promotion to Place; edge updates after trades; decay after absence.
- Time-slice replays: event log → rebuild graph/place graph; diffs must match live state.

## 11) Module Integration

- Perception: ray-casting populates PlaceCandidates → Places (chunk anchors).
- Planning: HTN/GOAP query Place Graph and GraphRAG outputs.
- LLM: uses episodic/graph snippets for explanations and the 30/100-day intent contracts.

## 12) Minimal Schemas (SQL/Graph)

### SQL (episodic)
```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,
  place_id TEXT,
  chunk_cx INTEGER,
  chunk_cz INTEGER,
  block_x INTEGER,
  block_y INTEGER,
  block_z INTEGER,
  kind TEXT NOT NULL,
  payload JSON,
  salience REAL NOT NULL,
  evidence JSON
);
CREATE INDEX idx_events_ts ON events(ts);
CREATE INDEX idx_events_place ON events(place_id);
CREATE INDEX idx_events_kind ON events(kind);
```

### Graph (property model)
```ts
// Node
{ id, type: 'Place'|'NPC'|'Item'|'Region'|'Bot', props: {...} }
// Edge
{ id, from: NodeId, rel: string, to: NodeId, props: { ts, confidence, eventId?, ... } }
```

### Chunk anchor
```ts
interface ChunkAnchor { cx: number; cz: number }
interface BlockAnchor { x: number; y: number; z: number }
```

## 13) Retrieval Prompt (GraphRAG-first)

```
System: You are the agent’s memory router. Prefer graph facts over guesses.
User: Where can I quickly get emeralds?
Context:
- Graph facts: OFFERS edges: Villager Armorer_12 buys sticks at TradingPost_Oakfield (rate 1:1; last_seen D+2)
- Places: HomeBase (lit paths), StorageChest_X (sticks: 64)
- Distances: HomeBase→TradingPost_Oakfield: 240m (lit)
Instruction:
- Return top 2 places with justification (edges + events). Avoid stale edges with confidence<0.5.
```

## 14) Success Criteria

- Place Graph supports reliable navigation and multi-hop queries.
- Episodic log can rebuild Place/Graph state via replay.
- GraphRAG retrieval yields correct, explainable answers.
- Working memory remains bounded; consolidation maintains coherence.
