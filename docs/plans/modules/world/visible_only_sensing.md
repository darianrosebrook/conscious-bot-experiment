# Visible-Only Sensing: World Modeling via Ray Casting

Author: @darianrosebrook

## Working Spec

Goal: Maintain an ego-centric world model populated only by blocks actually visible from the bot’s POV.

Method: Cast a bounded set of rays through the voxel grid each sweep; register the first occluding hit along each ray; update an Observed Resources index.

Constraints & invariants

- No chunk peeks: never read blocks behind occluders or outside LOS.
- Deterministic LOS: first solid hit terminates the ray.
- Transparent blocks (water, glass, leaves, tall grass) are pass-through unless configured as occluders.
- Performance budget: ≤ 3–5 ms per sweep; adaptable ray budget under load.
- World model is eventually consistent: only stores last-seen with timestamp; stale entries decay.

Acceptance

- In a test arena, 95%+ of truly visible target blocks (coal/iron/ores/chests/trees) are added within one panoramic sweep.
- False-positives (non-visible due to occlusion) ≤ 1% per sweep.
- Average sweep latency ≤ target budget (configurable).

## Architecture

Perception pipeline (per sweep)

1. Pose snapshot: `eye = bot.entity.position + eyeOffset`, `dir = lookYawPitch`.
2. Frustum sampling: generate view directions within a configurable FOV cone (e.g., 70°) at an angular grid (e.g., Δyaw=2°, Δpitch=2°) or a fixed set of panoramic sectors if doing 360° scans across ticks.
3. Ray traversal (choose one; both supported)
   - Mineflayer raycaster: `bot.world.raycast(eye, dir, maxDist, matcher)`—returns first hit; configure matcher to include/exclude transparency.
   - Custom DDA (Amanatides & Woo) voxel stepping for full control and advanced filters.
4. Hit classification: if `hit.block` is valuable/navigational/hazard, emit Observation with `(type, pos, distance, facing, light, last_seen=now)`.
5. Occlusion discipline: stop at first occluding hit; do not add farther blocks on that ray.
6. Index update: upsert into ObservedResources (keyed by world coords + block id).
7. Decay: reduce confidence for entries not re-seen within sliding windows; evict when confidence < τ.

Notes: For higher throughput, add frustum culling and optionally an octree or chunk-local occupancy to prune distant volumes.

## Algorithms

Ray casting API choice

- Mineflayer native: `bot.world.raycast(eye, dir, max, matcher)`. Treat non-full blocks (levers, etc.) as transparent; post-check if needed.
- Custom DDA (Amanatides & Woo, 1987): efficient voxel traversal visiting voxels front-to-back. Ideal for precise transparency rules and performance.

Sampling strategies

- Fixed FOV grid: N×M rays per sweep (e.g., 35×15 ≈ 525) for one head orientation.
- Panoramic sweep: rotate head ±180° over K ticks; budget rays per tick adaptively.
- Salience-guided: increase density toward recent motion/sound/light changes; decrease in “known empty” regions.

Transparency / occlusion policy

- Occluders: stone, dirt, planks, ore blocks, logs, etc.
- Transparent-pass: water, glass, leaves, tall grass, torches, rails. Stop only on first opaque voxel. Optionally treat leaves as soft occluders when searching for wood.

## Data Contracts

```ts
type BlockId = string; // "minecraft:coal_ore"
type Vec3 = { x: number; y: number; z: number };

interface Observation {
  blockId: BlockId;
  pos: Vec3;             // integer voxel coords
  distance: number;      // meters
  normal?: Vec3;         // surface normal if available
  light?: number;        // optional from world
  confidence: number;    // starts at 1.0; decays if not re-seen
  lastSeen: number;      // ms epoch
  source: 'raycast' | 'dda';
}

interface ObservedResourcesIndex {
  upsert(obs: Observation): void;
  lookupNear(pos: Vec3, r: number, filter?: (b: BlockId)=>boolean): Observation[];
  decay(now: number): void; // exponential decay by age
}
```

- Maintain chunk-local buckets: `Map<chunkKey, Map<blockKey, Observation>>` for O(1) upserts.
- Secondary by-type index: `Map<BlockId, Set<blockKey>>` for nearest-by-type queries.

## Performance Budget & Scheduling

- Ray budget: ~400–600 rays per sweep at maxDist 64. Calibrate in-process.
- Adaptive throttle: if sweep > budget, reduce density (increase Δyaw/Δpitch) or split across ticks.
- Early-exit heuristics: stop a ray once distance > configured search radius for current goal.

## Pseudocode (TypeScript)

Mineflayer raycast (fast path)

```ts
const transparent = new Set([
  'minecraft:air','minecraft:cave_air','minecraft:water','minecraft:glass',
  'minecraft:leaves','minecraft:oak_leaves','minecraft:birch_leaves',
  'minecraft:grass','minecraft:tall_grass'
]);

function makeMatcher() {
  return (block: any) => block && !transparent.has(block.name);
}

async function sweepVisible(bot, index, cfg) {
  const eye = bot.entity.position.offset(0, bot.entity.height * 0.9, 0);
  const matcher = makeMatcher();

  for (const dir of sampleFovDirections(bot, cfg)) {
    const hit = bot.world.raycast(eye, dir, cfg.maxDistance, matcher);
    if (!hit) continue;

    const b = bot.blockAt(hit.position);
    if (!b) continue;

    if (cfg.targetBlocks.has(b.name)) {
      index.upsert({
        blockId: b.name,
        pos: hit.position,
        distance: eye.distanceTo(hit.intersect ?? hit.position),
        normal: hit.faceVector,
        confidence: 1.0,
        lastSeen: Date.now(),
        source: 'raycast'
      });
    }
  }
}
```

Custom DDA skeleton

```ts
function traverseVoxelsDDA(eye: Vec3, dir: Vec3, maxDist: number,
                           isOccluder: (b?: any)=>boolean,
                           blockAt: (v: Vec3)=>any): Observation | null {
  // Initialize voxel coords, tMax, tDelta (Amanatides & Woo)
  // Loop while t <= maxDist:
  //  - read blockAt(voxel)
  //  - if isOccluder(block) => return Observation(hit)
  //  - step axis with smallest tMax; increment that tMax by tDelta
  return null;
}
```

## Integration

- Planner: HTN/GOAP query ObservedResourcesIndex (e.g., nearest coal) instead of chunk scans.
- Memory: push observations to episodic memory; promote stable items to semantic GraphRAG.
- Navigation: pass hit positions to pathfinder; path feasibility is handled by navigation.

## Metrics

Sensing quality

- Visible recall: fraction of truly visible target blocks captured after a sweep.
- False occluded hits: detected blocks later found behind an occluder.
- Time-to-first-observation for new targets.

Performance

- Rays per tick (p50/p95), sweep latency (ms), CPU %.
- Adaptive throttling events per minute.

Model utility

- Resource-to-use latency: time from first observation to acting on it.
- Staleness rate: % of observations that expire without re-confirmation.

Instrument with OpenTelemetry spans: `sweep.start → raycast → classify → upsert`.

## Tests & Verification

Unit

- Ray stepping: property-based tests for DDA; visited voxel order matches line math.
- Transparency table: verify pass vs occlude for curated block list.
- Distance capping: rays terminate at maxDist.

Integration (scripted worlds)

- Gallery wall occlusion test: rows of ores behind a solid wall with apertures; only aperture-visible blocks indexed.
- Transparency corridor: glass/leaf tunnel with ore behind; visibility controlled by policy.
- Panorama timing: 360° sweep with fixed ray count; verify budget.
- Non-full block edge cases: levers, buttons—treat transparent or post-check.

Regression

- Fixed seeds and camera paths; replay and assert stable visible recall and sweep latency.

## Roadmap

- Start with Mineflayer raycast + FOV sampling; build index and metrics.
- Add custom DDA for full control and profiling; add salience-guided sampling.
- Add frustum culling and optional octree for wide scenes.
- Explore learning-based gaze control to prioritize productive directions.

## References

- Prismarine/Mineflayer world.raycast notes.
- Amanatides & Woo: A Fast Voxel Traversal Algorithm for Ray Tracing.
- Frustum culling techniques for voxel engines.
- Voxel traversal walkthroughs and reference implementations.
- Mineflayer raycast-based movement plugin feasibility.
