# Multi-Step Scenarios: Design Requirements & Capability Gaps

> Companion document to [leaf-execution-pipeline.md](./leaf-execution-pipeline.md).
> Defines composite scenarios the bot must handle, the capabilities that unlock them,
> and the infrastructure changes required to wire them end-to-end.

---

## Table of Contents

1. [Scenario Inventory](#scenario-inventory)
2. [Scenario Details](#scenario-details)
   - [S1: Hunt → Cook → Eat](#s1-hunt--cook--eat)
   - [S2: Threat Interrupt → Flee → Resume](#s2-threat-interrupt--flee--resume)
   - [S3: Tool Progression (multi-tier)](#s3-tool-progression-multi-tier)
   - [S4: Craft with Missing Prereqs](#s4-craft-with-missing-prereqs)
   - [S5: Mine Ore → Smelt → Craft Tool](#s5-mine-ore--smelt--craft-tool)
   - [S6: Build Shelter at Nightfall](#s6-build-shelter-at-nightfall)
   - [S7: Farm Lifecycle](#s7-farm-lifecycle)
   - [S8: Explore → Assess → Gather](#s8-explore--assess--gather)
   - [S9: Sterling-Powered Navigation](#s9-sterling-powered-navigation)
   - [S10: Centralized Dispatch Validation](#s10-centralized-dispatch-validation)
3. [Capability Primitives](#capability-primitives)
4. [Infrastructure Components](#infrastructure-components)
5. [Gap Matrix](#gap-matrix)
6. [Implementation Priority](#implementation-priority)

---

## Scenario Inventory

| ID | Scenario | Status | Blocking Gaps |
|----|----------|--------|---------------|
| S1 | Hunt → Cook → Eat | **Blocked** | No passive mob targeting, no `hunt` requirement kind |
| S2 | Threat Interrupt → Flee → Resume | **Partially wired** | Threat→hold bridge missing, executor has no health checks |
| S3 | Tool Progression (multi-tier) | **Working** | Sterling solver produces correct chains; verified end-to-end |
| S4 | Craft with Missing Prereqs | **Working** | Dynamic prereq injection handles up to 3 levels deep |
| S5 | Mine Ore → Smelt → Craft | **Partially working** | Smelt verified; mine→smelt chain untested as single task |
| S6 | Build Shelter at Nightfall | **Blocked** | Construction leaves are stubs; no time-triggered task creation |
| S7 | Farm Lifecycle | **Partially working** | Till works; plant_crop has blockUpdate bug; harvest needs mature crops |
| S8 | Explore → Assess → Gather | **Not designed** | No composite explore-then-gather flow |
| S9 | Sterling-Powered Navigation | **Phase 1 implemented** | Sterling navigation domain with occupancy grid solver; 4-cardinal movement (walk/jump/descend) |
| S10 | Centralized Dispatch Validation | **Implemented** | All action types verified to route correctly through Action Contract Registry |

---

## Scenario Details

### S1: Hunt → Cook → Eat

**User intent**: "I'm hungry, I need food"

**Required chain**:
```
find_resource(cow/pig/chicken)     ← sensing leaf (EXISTS)
  → move_to(animal_position)       ← movement leaf (EXISTS)
  → attack_entity(animal_id)       ← combat leaf (BLOCKED: passive filter)
  → collect_items(raw_beef)        ← interaction leaf (EXISTS)
  → place_workstation(furnace)     ← crafting leaf (EXISTS, verified)
  → smelt(raw_beef → cooked_beef)  ← crafting leaf (EXISTS, verified)
  → consume_food(cooked_beef)      ← interaction leaf (EXISTS, verified)
```

**What works today**:
- Steps 5-7 (furnace placement, smelting, eating) are fully verified
- `find_resource` can locate animals (partial-match on entity scan)
- `collect_items` can pick up dropped items

**What's broken**:

| Gap | Component | Fix Required |
|-----|-----------|-------------|
| `attack_entity` rejects passive mobs | `combat-leaves.ts:53-79` — `isHostileEntity()` hardcoded allowlist | Add `targetFilter` arg: `'hostile'` (default), `'passive'`, `'any'`. When `'passive'` or `'any'`, skip hostile check. |
| No `hunt` requirement kind | `requirements.ts` — TaskRequirement union | Add `hunt: { target: string, quantity: number }` to the union |
| No routing for hunt intent | `thought-to-task-converter.ts:57-60` — `ROUTABLE_ACTIONS` | Add `'hunt'`, `'kill'`, `'attack'` to routable set, map to task type `'gathering'` |
| No hunt→step planner | `leaf-arg-contracts.ts` — `requirementToFallbackPlan()` | Add `hunt` case that emits: `find_resource` → `move_to` → `attack_entity({targetFilter:'passive'})` → `collect_items` |
| No food→cook orchestration | Missing composite | Either: (a) new `acquire_food` composite leaf, or (b) planner emits hunt + smelt + eat steps |
| Dead BT definition | `food_pipeline_starter.json` — 3 selector branches (meat/bread/berry) | Wire BT runner to execute this definition when food goal is active |

**Unlock dependencies**:
- **Capability primitive**: `target.passive` — permission to attack non-hostile entities
- **Requirement kind**: `hunt` in `requirements.ts`
- **Leaf change**: `attack_entity` `targetFilter` parameter
- **Planner change**: Fallback plan for `hunt` requirement

**Test setup**:
```bash
# Summon passive animal + give furnace materials
execute at Sterling run summon cow ~5 ~ ~ {NoAI:1b}
give Sterling coal 8
give Sterling furnace 1
```

---

### S2: Threat Interrupt → Flee → Resume

**User intent**: Bot is gathering wood when a zombie attacks; it should flee, then resume gathering.

**Required flow**:
```
[Gathering task active, executing acquire_material steps]
  ↓
ThreatPerceptionManager detects zombie    ← EXISTS (threat-perception-manager.ts)
  → overallThreatLevel = 'high'
  → recommendedAction = 'flee'
  ↓
BRIDGE (MISSING): threat signal → goal hold
  → GoalHoldManager.requestHold(task, 'unsafe')    ← EXISTS but never called by threats
  → PreemptionBudget: 3 steps / 5s to wind down    ← EXISTS (preemption-budget.ts)
  → Task status → 'paused'
  ↓
Safety reflex OR new flee task executes
  → retreat_from_threat / emergency_retreat    ← EXISTS (combat-leaves.ts, safety-reflexes.ts)
  ↓
Threat clears (zombie dead or out of range)
  → PeriodicReview checks 'unsafe' hold every 5 min    ← EXISTS (periodic-review.ts)
  → GoalHoldManager.requestClearHold(task, 'unsafe')   ← EXISTS but never triggered
  → Task status → 'pending' → executor resumes
  ↓
[Gathering task resumes from last incomplete step]
```

**What works today**:
- Task pause/resume state machine (`pending` ↔ `paused` via hold system)
- GoalHoldManager with `'unsafe'` reason (designed for this exact case)
- PreemptionBudget (3 steps / 5s graceful shutdown)
- ThreatPerceptionManager with threat level assessment
- Safety reflexes (emergency_eat, emergency_retreat, emergency_light, emergency_surface)
- PeriodicReview for stale hold cleanup (5-min interval)

**What's missing — the bridge**:

| Gap | Component | Fix Required |
|-----|-----------|-------------|
| No threat→hold signal | Between `threat-perception-manager.ts` and `goal-hold-manager.ts` | Add `onThreatLevelChanged` callback in executor loop; when level >= `'high'`, call `requestHold(activeTask, 'unsafe')` |
| Executor has no health/threat check | `modular-server.ts` — `autonomousTaskExecutor()` loop | Add per-step guard: before executing next step, query threat level. If >= threshold, pause task and yield to safety reflex. |
| Safety reflexes unsynchronized | `safety-reflexes.ts` runs independently of executor | Reflexes must acquire an execution lock. While reflex holds lock, executor must not dispatch leaf actions. |
| No resume-after-clear | `periodic-review.ts` reviews holds but doesn't re-trigger executor | After clearing `'unsafe'` hold, emit event that executor loop picks up to resume task. Current `onChange` readiness callback could work. |
| No threat events to cognition | Cognition service has no threat event types | Add `'threat_detected'` and `'threat_cleared'` to `event-driven-thought-generator.ts` event types |

**Unlock dependencies**:
- **Infrastructure**: Threat→hold bridge function (new ~50 lines in modular-server.ts)
- **Infrastructure**: Executor per-step threat guard (new ~20 lines in executor loop)
- **Infrastructure**: Execution lock for reflex/executor coordination
- **Rig G extension**: Feasibility signal should include `threatLevel` as a block condition

**Test setup**:
```bash
# Give bot a task, then spawn threat mid-execution
give Sterling stone_axe 1
# (create gather wood task via API)
# Wait 5s, then:
execute at Sterling run summon zombie ~3 ~ ~ {NoAI:0b}
```

---

### S3: Tool Progression (multi-tier)

**User intent**: "I need a diamond pickaxe"

**Required chain**:
```
mine oak_log (hand)          → acquire_material
craft oak_planks             → craft_recipe
craft sticks                 → craft_recipe
craft crafting_table         → craft_recipe
place crafting_table         → place_workstation
craft wooden_pickaxe         → craft_recipe
mine cobblestone (wooden)    → acquire_material
craft stone_pickaxe          → craft_recipe
mine iron_ore (stone)        → acquire_material
place furnace                → place_workstation
smelt raw_iron → iron_ingot  → smelt
craft iron_pickaxe           → craft_recipe
mine diamond_ore (iron)      → acquire_material
craft diamond_pickaxe        → craft_recipe
```

**Status**: **Working end-to-end via Sterling solver.**

- **Solver**: `MinecraftToolProgressionSolver` generates tier-gated step chains
- **Capability gating**: Virtual `cap:has_<tier>_pickaxe` tokens in Sterling search state
- **Leaf routing**: `mine` → `acquire_material`, `craft` → `craft_recipe`, `smelt` → `smelt`
- **Verified leaves**: acquire_material, craft_recipe, place_workstation, smelt, equip_tool
- **Dispatch**: All actions route through the Action Contract Registry (`action-contract-registry.ts`). `acquire_material` uses `dispatchToLeaf` with LOS filtering (bot won't dig underground past surface). `craft`/`smelt` use dedicated handlers with contract-driven normalization (`item` → `recipe`/`input`, `quantity` → `qty`). Parameter aliases, defaults, and requiredKeys enforced consistently across all paths.

**Remaining issues**:

| Issue | Details |
|-------|---------|
| No auto-equip before mining | `acquire_material` digs with whatever is held. Mining stone bare-handed is 5-10x slower. Planner should inject `equip_tool` before mine steps, or `acquire_material` should auto-equip best available tool. |
| Block→drop name mismatch in verification | Step expects "stone" in inventory but drop is "cobblestone". Verification fails even though item was collected. Need `ORE_DROP_MAP` (exists in `minecraft-tool-progression-types.ts:88-112`) wired into verification. |
| Workstation sprawl after many tiers | Each tier may place a new crafting_table. After 3+ tables within 6 blocks, `place_workstation` fails sprawl check. |

**Test setup**:
```bash
# Fresh bot near trees, no inventory — full progression test
clear Sterling
tp Sterling ~ 64 ~
```

---

### S4: Craft with Missing Prereqs

**User intent**: "Craft a wooden pickaxe" (bot has no materials)

**Required chain**:
```
[Planner detects: need oak_planks + sticks for wooden_pickaxe]
  → inject acquire_material(oak_log) prereq     ← dynamic injection (EXISTS)
  → acquire_material(oak_log) × N
  → craft_recipe(oak_planks)
  → craft_recipe(stick)
  → [detect: recipe needs crafting_table]
  → inject place_workstation(crafting_table)     ← workstation injection (EXISTS)
  → craft_recipe(crafting_table) OR place from inventory
  → craft_recipe(wooden_pickaxe)
```

**Status**: **Working via dynamic prereq injection.**

- **Injection cap**: 3 prereq injections per task (`modular-server.ts:776`)
- **Workstation injection**: Detects crafting_table need, injects craft or place step (`modular-server.ts:700-710`)
- **Blocker tagging**: Prereq tasks tagged `['dynamic', 'crafting']`

**Remaining issues**:

| Issue | Details |
|-------|---------|
| Injection depth limit | Cap of 3 may be too low for deep chains (e.g., need to mine logs → craft planks → craft sticks → craft table → craft pickaxe = 4 injections) |
| No feedback to original task | Parent task waits with `blockedReason: 'waiting_on_prereq'` but no retry scheduling after prereq completes |

---

### S5: Mine Ore → Smelt → Craft Tool

**User intent**: "Make an iron pickaxe" (bot has stone pickaxe, near iron ore)

**Required chain**:
```
equip_tool(pickaxe, stone)           ← combat leaf (verified)
acquire_material(iron_ore) × 3      ← interaction leaf (verified)
place_workstation(furnace)           ← crafting leaf (verified)
smelt(raw_iron → iron_ingot) × 3    ← crafting leaf (verified)
craft_recipe(iron_pickaxe)           ← crafting leaf (verified)
```

**Status**: **All leaves verified individually. Chain untested as single task.**

- Sterling tool-progression solver generates this exact sequence
- Each leaf works in isolation
- The gap is testing the full chain as one task with real executor loop
- `acquire_material` now uses LOS filtering via centralized dispatch — bot won't dig underground past surface
- `smelt` handler normalizes `{ item, quantity }` → `{ input, qty, fuel }` via Action Contract Registry before calling SmeltLeaf
- All dispatch paths enforce `requiredKeys` (fail-closed) and thread `AbortSignal` for per-request cancellation

**Remaining issues**:

| Issue | Details |
|-------|---------|
| Smelt is sequential (12s/item) | 3 iron ingots = ~36s+ of furnace time. Executor must handle long-running steps without timing out the task. |
| Fuel not checked before smelting | Smelt leaf doesn't verify fuel in inventory. If no coal, it stalls until timeout. Default fuel (`coal`) is injected by contract defaults but not validated against inventory. |
| `ORE_DROP_MAP` not used in verification | `iron_ore` → `raw_iron` mapping exists (`minecraft-tool-progression-types.ts:88`) but verification checks for `iron_ore` in inventory, not `raw_iron`. |

**Test setup**:
```bash
give Sterling stone_pickaxe 1
give Sterling coal 8
setblock ~5 ~ ~ minecraft:iron_ore
setblock ~5 ~1 ~ minecraft:iron_ore
setblock ~5 ~-1 ~ minecraft:iron_ore
```

---

### S6: Build Shelter at Nightfall

**User intent**: Bot detects night approaching, builds a basic shelter.

**Required chain**:
```
[Time check: MC ticks approaching 12542]      ← get_light_level / environment data
  → acquire_material(cobblestone) × 20        ← interaction leaf (verified)
  → acquire_material(oak_log) × 4             ← interaction leaf (verified)
  → craft_recipe(oak_planks)                   ← crafting leaf (verified)
  → craft_recipe(oak_door)                     ← crafting leaf (needs verification)
  → build_module(house, ...)                    ← construction leaf (P0 stub — no world mutation)
  → place_block(door)                          ← interaction leaf (verified)
  → sleep(placeBed: true)                      ← interaction leaf (needs night test)
```

**Status**: **Blocked — construction leaves are stubs.**

| Gap | Component | Fix Required |
|-----|-----------|-------------|
| `build_structure` leaf removed (replaced by `build_module`) | `construction-leaves.ts` | Goal type `build_structure` routes to building solver → `prepare_site` → `build_module` → `place_feature` |
| Construction stubs (`prepare_site`, `build_module`, `place_feature`) | `construction-leaves.ts` | P0 stubs return success without world mutation. Need real implementations. |
| No time-triggered task creation | No component watches MC time and creates tasks proactively | Need a `TimeAwareGoalGenerator` that emits shelter goals when dusk approaches |
| No shelter BT wired | `shelter_basic.json` exists but BT runner isn't active for this scenario | Wire BT definition to goal activation |

**Existing BT definition** (`shelter_basic.json`):
- Sequence: assess light → find/build shelter → place door → verify enclosed

**Test setup**:
```bash
give Sterling cobblestone 64
give Sterling oak_planks 16
give Sterling oak_door 1
give Sterling red_bed 1
time set 11000
```

---

### S7: Farm Lifecycle

**User intent**: "Set up a wheat farm and harvest it"

**Required chain**:
```
acquire_material(oak_log)             ← for crafting hoe
craft_recipe(oak_planks)
craft_recipe(stick)
craft_recipe(wooden_hoe)
find_resource(water)                  ← sensing leaf (exists)
find_resource(dirt/grass_block)       ← sensing leaf (exists)
till_soil(radius: 4)                  ← farming leaf (verified)
plant_crop(wheat_seeds)               ← farming leaf (BUGGED: blockUpdate timeout)
[wait ~20 min for crops to grow]
harvest_crop(radius: 4)              ← farming leaf (needs mature crop test)
collect_items(wheat)                  ← interaction leaf (verified)
manage_farm(maintain)                 ← farming leaf (verified for till phase)
```

**Status**: **Partially working — plant_crop has a bug.**

| Gap | Component | Fix Required |
|-----|-----------|-------------|
| `plant_crop` blockUpdate timeout | `farming-leaves.ts:325` | `blockUpdate` event may not fire for seed placement. Needs investigation: try removing the event wait, or check if farmland needs hydration first. |
| No water proximity check | `plant_crop` doesn't verify water within 4 blocks of farmland | Seeds placed on dry farmland may revert to dirt. Add water check or document limitation. |
| No long-wait orchestration | Crop growth takes real-time minutes | Need a "check back later" pattern: create task, mark as `waiting`, revisit after growth time. |
| `harvest_crop` untested with mature crops | Only tested error case ("no mature crops") | Need `setblock ~2 ~1 ~ minecraft:wheat[age=7]` test |

**Test setup**:
```bash
give Sterling wooden_hoe 1
give Sterling wheat_seeds 16
# Create hydrated farmland
setblock ~2 ~-1 ~2 minecraft:water
setblock ~1 ~-1 ~ minecraft:farmland[moisture=7]
setblock ~2 ~-1 ~ minecraft:farmland[moisture=7]
setblock ~3 ~-1 ~ minecraft:farmland[moisture=7]
```

---

### S8: Explore → Assess → Gather

**User intent**: "Find iron and bring some back"

**Required chain**:
```
find_resource(iron_ore, radius: 32)    ← sensing leaf (verified)
move_to(iron_position)                 ← movement leaf (verified)
equip_tool(pickaxe, stone)             ← combat leaf (verified)
acquire_material(iron_ore) × N         ← interaction leaf (verified)
move_to(home_position)                 ← movement leaf (verified)
```

**Status**: **Not designed as a composite flow.** All individual leaves work.

- `collect_items` basic mode (no `exploreOnFail`) routes through leaf via centralized dispatch; spiral exploration still uses handler when `exploreOnFail=true`
- `collect_items_enhanced` aliases `item` → `itemName` via contract registry; `exploreOnFail` stripped with deprecation warning when routing to leaf

| Gap | Component | Fix Required |
|-----|-----------|-------------|
| No `explore` requirement → step plan | `requirementToFallbackPlan()` has no `explore` case | Add fallback: `find_resource` → `move_to` → `acquire_material` |
| No "home" position concept | Bot has no base/home location stored | Need a `home` position in world state or memory |
| No return-trip planning | Planner doesn't add "go back" steps | Need explicit return step or a `round_trip` composite |

---

### S9: Sterling-Powered Navigation

**Status**: Phase 1 implemented. 4-cardinal movement (walk/jump_up/descend) with occupancy grid solver.

**User intent**: Bot needs to move from A to B across terrain that includes ledges, gaps, hazards, and elevation changes.

**Problem statement**: The current navigation stack is broken. Three layers fight each other:

1. **D* Lite** (`world/src/navigation/dstar-lite-core.ts`) — plans paths but `determineAction()` is a stub that only checks Y-delta. Returns `'jump'` if dy > 0.5, `'move'` otherwise. No terrain awareness.
2. **MockNavigationSystem** (`navigation-bridge.ts:90-116`) — `planPath()` returns a **straight line** of 20 interpolated points regardless of terrain. Walls, lava, cliffs are invisible to it.
3. **mineflayer-pathfinder** (A*) — the only layer that actually pathfinds, but it's hamstrung: `canDig=false`, `scafoldingBlocks=[]`, and receives goals from the two broken layers above.

Result: the bot cannot reliably climb 1-block ledges, jump 2-block gaps, or choose between "go around" vs "jump across." `SimpleGoalNear` and `SimpleGoalBlock` in `action-translator.ts:22-84` are stubs with `heuristic() → 0` and `isEnd() → false` — they never guide pathfinding or signal arrival.

#### Architecture (Implemented)

**Occupancy grid approach** (escape game pattern, not rule-list pattern): TypeScript sends a compact 3D uint8 occupancy grid to Sterling. Python generates neighbors on-demand via `get_legal_moves()` against the grid — no pre-enumerated rule list.

**Single execution mode**: The planner emits exactly ONE `sterling_navigate` TaskStep per navigation requirement. The leaf owns: scan → solve → execute → verify → replan.

```
Task: "move to (10, 68, 280)"
  │
  ├─ Executor dispatches ONE sterling_navigate step
  │   └─ POST /action → mc-interface (port 3005)
  │       └─ SterlingNavigateLeaf.run()
  │           │
  │           ├─ POST /solve-navigation → Planning (port 3002)
  │           │   └─ NavigationSolver.solveNavigation()
  │           │       ├─ GET /world-scan → mc-interface (port 3005)
  │           │       │   └─ Returns occupancy grid (base64 uint8, X→Y→Z order)
  │           │       │
  │           │       ├─ sterlingService.solve('navigation', {...})
  │           │       │   → Sterling (port 8766)
  │           │       │   └─ Python A* solver with on-demand neighbors
  │           │       │
  │           │       └─ Return solve result + SolveBundle
  │           │
  │           ├─ Execute micro-primitives sequentially
  │           ├─ Before each primitive: check abortSignal (Phase 1)
  │           │   (Phase 2: threat→hold bridge, not yet implemented)
  │           ├─ After each primitive: verify position (L∞ block distance)
  │           └─ On deviation > 2: internal replan (bounded by maxReplans)
```

#### Phase 1 Movement Primitives (4-Cardinal Only)

| Operation | Cost | Preconditions | Effect |
|-----------|------|---------------|--------|
| `walk_{N/S/E/W}` | 1.0 | feet+head passable, floor solid | Move 1 block horizontally |
| `jump_up_{N/S/E/W}` | 2.0 | takeoff head clearance, landing feet+head passable, landing floor solid | Move 1 block horizontally + 1 up |
| `descend_{N/S/E/W}` | 0.8 | forward feet+head passable, fall-through passable, landing floor solid | Move 1 block horizontally + 1 down |

**Not in Phase 1**: diagonal, sprint, swim, climb, fall_2+. Each addition requires re-proving heuristic admissibility.

#### Admissible Heuristic (Coupled-Move Aware)

```
d   = |dx| + |dz|          (horizontal L1 distance)
dy  = goal_y - y
up  = max(dy, 0)
down = max(-dy, 0)

If dy >= 0:  h = 2.0 * up + 1.0 * max(0, d - up)
If dy <  0:  h = 0.8 * down + 1.0 * max(0, d - down)
```

Each vertical move also covers 1 horizontal step ("coupled move"). The heuristic accounts for this coupling to avoid overestimation.

#### Hazard Policy (Injected, Not Hardcoded)

```typescript
interface NavigationHazardPolicy {
  hazardPolicyId: string;   // content-addressed hash
  version: number;
  riskMode: 'cautious' | 'normal' | 'aggressive';
  penalties: Record<string, number>;  // hazard_type → cost penalty
  maxReplans: number;       // hard cap per invocation (default 3)
  scanMargin: number;       // blocks beyond straight-line to scan
  replanEscalation: 'expand_scan' | 'downgrade_primitives' | 'safe_mode' | 'fail';
}
```

Default penalties: `lava_adjacent: 100`, `cliff_lethal: 50`, `hostile_zone: 20`, `cactus: 15`, `deep_water: 8`, `dark_area: 5`.

#### Goal Metric Contract

Both the Python solver `is_goal()` and the leaf arrival check use the same formula:

```
arrived = max(|dx|, |dz|) <= toleranceXZ  &&  |dy| <= toleranceY
```

Default: `toleranceXZ=1, toleranceY=0` (stand on target block column at target Y level).

#### Canonical Scan Owner

**Planning server owns the scan→solve pipeline** (Option A). The leaf does NOT call `bot.blockAt()` directly for scan purposes. Flow:

1. Leaf → `POST /solve-navigation` to Planning (port 3002)
2. Planning → `GET /world-scan` to mc-interface (port 3005)
3. Planning builds occupancy grid → calls Sterling (port 8766)
4. Planning returns primitives → Leaf executes

Block classification is done exclusively by the `/world-scan` endpoint in mc-interface. No other code path may independently classify blocks for navigation — this prevents drift between scan margins or classification rules.

#### Occupancy Grid Encoding (contractVersion: 1)

- Block types: `0=air, 1=solid, 2=water, 3=lava, 4=ladder, 5=hazard`
- Linearization: X→Y→Z row-major. `index = ((lx * dy_size) + ly) * dz_size + lz`
- Transport: raw `Uint8Array` bytes → base64 string

**Phase 1 passability contract (enforced in all three layers):**
- TypeScript `isPassable()`: returns `true` only for `BLOCK_TYPE.AIR` (0)
- Python `_is_passable()`: returns `True` only for `BLOCK_AIR` (0)
- Water (2) and ladder (4) are encoded in the grid but treated as **impassable** until swim/climb primitives are added in Phase 5
- Adding a new passable type requires updating both Python and TypeScript simultaneously

#### Solve Payload

```typescript
{
  command: 'solve',
  domain: 'navigation',
  contractVersion: 1,
  solverId: 'minecraft.navigation',
  occupancyGrid: {
    origin: { x: -20, y: 60, z: 290 },
    size: { dx: 40, dy: 12, dz: 40 },
    blocks: '...base64-encoded uint8 array...',
  },
  start: { x: -16, y: 64, z: 300 },
  goal: { x: 10, y: 68, z: 280 },
  toleranceXZ: 1,
  toleranceY: 0,
  hazardPolicy: { ... },
  maxNodes: 10000,
  useLearning: true,
}
```

#### Files

| File | Package | Description |
|------|---------|-------------|
| `minecraft-navigation-types.ts` | planning/sterling | Types, grid utilities, heuristic, hazard policy |
| `minecraft-navigation-solver.ts` | planning/sterling | `MinecraftNavigationSolver extends BaseDomainSolver` |
| `navigation_domain.py` | sterling | Python `NavigationState` + `NavigationSterlingStreaming` solver |
| `movement-leaves.ts` | mc-interface/leaves | `SterlingNavigateLeaf` — scan→solve→execute→verify→replan |
| `server.ts` | mc-interface | `/world-scan` endpoint — occupancy grid from bot.blockAt() |
| `modular-server.ts` | planning | `/solve-navigation` endpoint, leaf routing, allowlist |
| `leaf-routing.ts` | planning/sterling | `navigate` → `sterling_navigate` mapping |
| `sterling-bootstrap.ts` | planning/server | `MinecraftNavigationSolver` initialization |

#### What This Replaces

| Current Component | Problem | Sterling Replacement |
|------------------|---------|---------------------|
| D* Lite `determineAction()` | Stub: only checks Y-delta | Sterling A* with occupancy grid + movement primitives |
| `MockNavigationSystem.planPath()` | Returns straight line through walls | Sterling on-demand neighbor generation against real terrain |
| `SimpleGoalNear/SimpleGoalBlock` | `heuristic()→0`, `isEnd()→false` | Admissible piecewise heuristic + L∞ goal metric |
| mineflayer-pathfinder (constrained) | `canDig=false`, `scafoldingBlocks=[]` | Sterling plans jump/descend sequences; pathfinder as 1-block actuator only |
| Stuck detection (6s poll) | Retries same impossible goal | Bounded replan with escalation (expand scan → downgrade → fail) |

#### What This Unlocks

- **1-block ledge climbing**: `jump_up` operation explicitly plans the jump
- **Hazard avoidance**: Lava/cliff/hostile zones get high cost → A* routes around them
- **Optimal path choice**: "go around the hill" vs "jump over the gap" — A* picks lowest total cost
- **Learning**: Sterling's path algebra remembers which routes worked, improving over time
- **Replanning**: Bounded replan loop (max 3) with escalation strategy

#### Future Phases

- **Phase 2**: Threat→Hold bridge (parallel with Phase 1 validation)
- **Phase 3**: Manual integration testing on flat terrain
- **Phase 4**: Vertical terrain + hazard avoidance testing
- **Phase 5**: Replace legacy navigation stack; add diagonal/sprint/swim primitives (requires heuristic re-proof)

**Test setup**:
```bash
# Flat terrain: walk 10 blocks north
# 1-block ledge: setblock ~5 ~ ~ stone && setblock ~5 ~1 ~ stone → navigate to top
# Lava avoidance: place lava in direct path → verify bot routes around
# Threat interrupt: spawn zombie during navigation → observe hold + resume
```

---

### S10: Centralized Dispatch Validation

**Purpose**: Verify that all action types route correctly through the Action Contract Registry and that parameter normalization is consistent across all dispatch paths.

**Status**: **Implemented and tested (376 MC tests pass).**

The Action Contract Registry (`action-contract-registry.ts`) is the single source of truth for:
- Action type → leaf name routing
- Parameter aliasing (e.g., `block_type` → `item`, `item` → `input`)
- Deprecated/stripped key handling
- Default value injection
- Required key enforcement (fail-closed)
- Dispatch mode selection (`leaf` / `handler` / `guarded`)

#### Dispatch architecture

```
POST /action { type, parameters }
    │
    ├─ Phase 1: Contract-driven dispatch
    │   ├─ ACTION_CONTRACTS[action.type] → contract
    │   ├─ dispatchMode: 'handler' → Phase 2 (dedicated handler)
    │   ├─ dispatchMode: 'guarded' → semantic guards → leaf or handler
    │   ├─ dispatchMode: 'leaf' → normalizeActionParams → dispatchToLeaf
    │   └─ normalizeActionParams: aliases → strip → defaults → requiredKeys
    │
    ├─ Phase 2: Legacy switch (dedicated handlers)
    │   ├─ craft/craft_item → executeCraftItem (normalizes, calls leaf)
    │   ├─ smelt/smelt_item → executeSmeltItem (normalizes, calls leaf)
    │   ├─ prepare_site/build_module/place_feature → dispatchToLeafLegacy
    │   └─ move_to/navigate → legacy D* Lite handler
    │
    └─ Shared: _runLeaf(leafName, requestedActionType, params, timeout, signal)
```

#### Behavioral changes from centralization

| Action | Before | After |
|--------|--------|-------|
| `acquire_material` | Hardcoded handler | Leaf with LOS filtering |
| `place_block` (single) | Hardcoded 12-angle search | Leaf with 6-adjacent auto-placement |
| `place_block` (pattern/multi) | Hardcoded handler | Still handler (semantic guard) |
| `consume_food` | Name-heuristic handler | Leaf with explicit `isFoodItem()` |
| `collect_items_enhanced` (basic) | Pickup-only handler | Leaf with pathfind-to-entity |
| `collect_items_enhanced` (explore) | Handler with spiral exploration | Still handler (semantic guard) |
| `smelt` | Handler passing wrong param names | Handler with contract normalization |
| `craft` | Handler with manual param mapping | Handler with contract normalization |

#### Test coverage

| Test file | Tests | Coverage |
|-----------|-------|---------|
| `action-contract-registry.test.ts` | 41 | Aliases, defaults, requiredKeys, null handling, idempotency, craft/smelt aliases |
| `action-dispatch-contract.test.ts` | 55 | Routing, guards, normalization proof, handler normalization, abort propagation, legacy requiredKeys |
| `contract-alignment.test.ts` | 4 | Cross-boundary planning ↔ MC normalization agreement |

---

## Capability Primitives

These are the atomic permissions and capabilities that gate scenario execution.

### Existing Capabilities (Leaf Permissions)

| Capability | Used By | Description |
|------------|---------|-------------|
| `movement` | move_to, follow_entity, step_forward, retreat, pathfinding leaves | Bot can change position |
| `dig` | dig_block, acquire_material, harvest_crop | Bot can break blocks |
| `place` | place_block, place_workstation, place_torch, build_module | Bot can place blocks |
| `craft` | craft_recipe, smelt | Bot can use crafting/furnace interfaces |
| `sense` | sense_hostiles, find_resource, get_light_level, introspect_recipe | Bot can read world state |
| `container.read` | open_container, manage_inventory, equip_weapon, equip_tool | Bot can read container/inventory |
| `container.write` | transfer_items, manage_inventory | Bot can modify container contents |
| `chat` | chat, control_environment | Bot can send chat messages |

### Missing Capabilities (Required by Scenarios)

| Capability | Needed For | Description |
|------------|-----------|-------------|
| `target.passive` | S1 (Hunt) | Permission to target non-hostile entities (cows, pigs, chickens) |
| `interrupt` | S2 (Threat Flee) | Permission to pause active task and yield to safety system |
| `time.awareness` | S6 (Shelter) | Ability to create tasks based on MC time-of-day |
| `spatial.home` | S8 (Explore) | Knowledge of home/base position for return trips |
| `navigate.sterling` | S9 (Navigation) | Sterling-backed pathfinding with cost-based movement selection |
| `navigate.hazard_aware` | S9 (Navigation) | Lava/cliff/mob avoidance via high-cost penalty nodes |
| `navigate.vertical` | S9 (Navigation) | Jump, climb, descend operations as first-class movement primitives |

---

## Infrastructure Components

### Existing (Available for Wiring)

| Component | File | What It Does | Used By Scenarios |
|-----------|------|-------------|-------------------|
| **GoalHoldManager** | `goals/goal-hold-manager.ts` | Pause/resume tasks with typed reasons (`unsafe`, `preempted`, `materials_missing`) | S2 |
| **PreemptionBudget** | `goals/preemption-budget.ts` | 3-step / 5s graceful shutdown after preemption signal | S2 |
| **PeriodicReview** | `goals/periodic-review.ts` | Reviews stale holds every 5 minutes, clears `unsafe` when safe | S2 |
| **ThreatPerceptionManager** | `mc-interface/threat-perception-manager.ts` | Detects hostiles, calculates threat level, recommends action | S2 |
| **SafetyReflexes** | `reactive-executor/safety-reflexes.ts` | Fixed emergency responses (eat, retreat, light, surface) | S2 |
| **AutomaticSafetyMonitor** | `mc-interface/automatic-safety-monitor.ts` | Watches bot health, triggers emergency responses | S2 |
| **BehaviorTreeRunner** | `behavior-trees/BehaviorTreeRunner.ts` | Executes BT JSON definitions with conditions, sequences, selectors | S1, S6 |
| **Dynamic Prereq Injection** | `modular-server.ts:730-810` | Detects missing craft/mine inputs and injects prereq tasks | S3, S4, S5 |
| **ORE_DROP_MAP** | `sterling/minecraft-tool-progression-types.ts:88` | Block→drop name mapping (stone→cobblestone, iron_ore→raw_iron) | S3, S5 |
| **Rig G Advisor** | `constraints/execution-advisor.ts` | Fail-closed feasibility gate, parallelism hints, reorderable pairs | S3, S6 |
| **Guard Pipeline** | `server/autonomous-executor.ts:138-177` | Geofence → allowlist → shadow/live → rate limit → Rig G | All |
| **Sterling A* Solver** | `sterling/sterling-reasoning-service.ts` | Generic domain-agnostic A* search with path-algebra learning | S9 |
| **BaseDomainSolver** | `sterling/base-domain-solver.ts` | Abstract solver base class with SolveBundle observability | S9 |
| **NavigationBridge** | `mc-interface/navigation-bridge.ts` | Bot movement execution (D* Lite + pathfinder) — to be replaced | S9 |
| **Path Algebra Engine** | `sterling/kg/path_algebra.py` | Edge-weighted learning (usage, recency, novelty) for A* priority | S9 |

### Missing (Must Be Built)

| Component | Needed By | Description | Estimated Scope |
|-----------|-----------|-------------|-----------------|
| **Threat→Hold Bridge** | S2 | Function that calls `requestHold(task, 'unsafe')` when threat level crosses threshold | ~50 lines in modular-server.ts |
| **Executor Health Guard** | S2 | Per-step check in executor loop: query threat level before dispatching next leaf | ~20 lines in executor loop |
| **Execution Lock** | S2 | Mutex between safety reflexes and executor — only one controls the bot at a time | ~80 lines, new file or extend autonomous-executor.ts |
| **Hunt Requirement Kind** | S1 | `hunt: { target, quantity }` in TaskRequirement union + routing + fallback plan | ~60 lines across 3 files |
| **Passive Mob Targeting** | S1 | `targetFilter` arg on `attack_entity` + `isTargetable()` function replacing `isHostileEntity()` | ~30 lines in combat-leaves.ts |
| **Time-Aware Goal Generator** | S6 | Watches MC time, creates shelter/sleep goals when dusk approaches | ~100 lines, new module |
| **Home Position Store** | S8 | Persistent home/base location in memory service | ~30 lines + memory API call |
| **Verification Drop Mapper** | S3, S5 | Wire `ORE_DROP_MAP` into step verification so "mine stone" accepts "cobblestone" in inventory | ~40 lines in task-integration.ts |
| ~~**Navigation Domain Types**~~ | S9 | ✅ Built: `minecraft-navigation-types.ts` — occupancy grid, hazard policy, movement costs, heuristic |
| ~~**Navigation Solver**~~ | S9 | ✅ Built: `minecraft-navigation-solver.ts` — `MinecraftNavigationSolver extends BaseDomainSolver` |
| ~~**Python Navigation Domain**~~ | S9 | ✅ Built: `navigation_domain.py` — `NavigationState` with on-demand neighbor generation |
| ~~**Sterling Navigate Leaf**~~ | S9 | ✅ Built: `SterlingNavigateLeaf` in `movement-leaves.ts` — scan→solve→execute→verify→replan |
| ~~**World Scan API**~~ | S9 | ✅ Built: `GET /world-scan` endpoint in mc-interface `server.ts` |
| **Threat→Hold Bridge** | S9, S2 | Wire `onThreatLevelChanged` → `requestHold()` in modular-server.ts (~50 lines) |

---

## Gap Matrix

Cross-reference of scenarios vs. infrastructure gaps.

| Gap | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 |
|-----|----|----|----|----|----|----|----|----|-----|
| Passive mob targeting | **X** | | | | | | | | |
| Hunt requirement kind | **X** | | | | | | | | |
| Threat→hold bridge | | **X** | | | | | | | |
| Executor health guard | | **X** | | | | | | | |
| Execution lock (reflex/executor) | | **X** | | | | | | | |
| Auto-equip before mining | | | **X** | | **X** | | | | |
| Verification drop mapper | | | **X** | | **X** | | | | |
| Construction leaf impl | | | | | | **X** | | | |
| Time-aware goal generator | | | | | | **X** | | | |
| plant_crop blockUpdate fix | | | | | | | **X** | | |
| Explore→gather composite | | | | | | | | **X** | |
| Home position store | | | | | | | | **X** | |
| Smelt fuel pre-check | | | | | **X** | | | | |
| Navigation domain (Sterling) | | | | | | | | | **X** |
| Navigation rule builder | | | | | | | | | **X** |
| Python navigation backend | | | | | | | | | **X** |
| Sterling navigate leaf | | | | | | | | | **X** |
| World scan API | | | | | | | | | **X** |

---

## Implementation Priority

### P0 — Unlocks core survival loop

1. **Threat→Hold Bridge + Executor Health Guard** (S2)
   - Without this, the bot dies to any hostile mob while executing tasks
   - All infrastructure exists; just needs wiring (~70 lines)
   - Files: `modular-server.ts` (executor loop), `threat-perception-manager.ts` (callback)

2. **Sterling Navigation Domain** (S9) — ✅ Phase 1 implemented
   - Sterling navigation solver, occupancy grid, SterlingNavigateLeaf, /world-scan endpoint
   - 4-cardinal movement: walk (1.0), jump_up (2.0), descend (0.8)
   - Remaining: integration testing, threat→hold bridge, legacy stack replacement
   - See [S9 detailed design](#s9-sterling-powered-navigation)

3. **Verification Drop Mapper** (S3, S5)
   - Steps fail verification even when items were collected (stone→cobblestone)
   - `ORE_DROP_MAP` already exists; wire it into `completeTaskStep` verification
   - Files: `task-integration.ts`, import from `minecraft-tool-progression-types.ts`

4. **Auto-equip before mining** (S3, S5)
   - Mining bare-handed is 5-10x slower; wastes time on every gather task
   - Option A: `acquire_material` auto-equips best tool (leaf-level, ~20 lines)
   - Option B: Planner injects `equip_tool` step before each mine step (planner-level)

### P1 — Unlocks food autonomy

5. **Passive mob targeting** (S1)
   - Add `targetFilter` arg to `attack_entity` leaf (~30 lines in combat-leaves.ts)
   - Gate behind `target.passive` capability if needed for safety

6. **Hunt requirement kind + routing** (S1)
   - Add to `requirements.ts`, `thought-to-task-converter.ts`, `leaf-arg-contracts.ts`
   - Fallback plan: `find_resource` → `move_to` → `attack_entity` → `collect_items`
   - Optionally wire `food_pipeline_starter.json` BT definition

### P2 — Quality of life

7. **plant_crop blockUpdate fix** (S7)
   - Investigate whether blockUpdate fires for seed placement
   - May need to remove event wait or add hydrated farmland check

8. **Execution lock for reflexes** (S2)
   - Prevents executor and safety reflexes from fighting over bot control
   - More robust than just pausing — ensures clean handoff

9. **Smelt fuel pre-check** (S5)
   - Check for fuel before calling `openFurnace()` to avoid silent stalls
   - If no fuel, fail fast with actionable error

### P3 — Advanced scenarios

10. **Time-aware goal generator** (S6) — shelter at nightfall
11. **Construction leaf implementations** (S6) — real block placement
12. **Home position store** (S8) — return-trip planning
13. **Explore→gather composite** (S8) — multi-phase exploration

---

## BT Definitions Available (Not Yet Wired)

These JSON behavior tree definitions exist in `packages/planning/src/behavior-trees/definitions/` and define multi-step scenarios, but the BT runner isn't activated for autonomous task execution.

| BT Definition | Scenario | Steps |
|---------------|----------|-------|
| `food_pipeline_starter.json` | S1 | assess_biome → selector(meat/bread/berry) → consume → verify |
| `shelter_basic.json` | S6 | assess_light → find/build shelter → place_door → verify |
| `emergency_retreat_and_block.json` | S2 | sense_hostiles → retreat → place_block → wait |
| `ore_ladder_iron.json` | S5 | equip_check → find_ore → mine_sequence → collect → verify |
| `chop_tree_safe.json` | S3/S4 | ensure_axe(→craft_axe BT) → check_light → chop → collect |
| `craft_tool_tiered.json` | S3 | material_check → craft_sequence → verify_tool |
| `smelt_iron_basic.json` | S5 | check_furnace → load → wait → retrieve → verify |

**Activation path**: BehaviorTreeRunner (`BehaviorTreeRunner.ts:278`) supports `loadBehaviorTree()` from JSON. These could be wired as execution strategies when Sterling solver isn't available, or as the primary executor for scenarios where Sterling has no domain model (hunt, shelter).

---

*Last updated: 2026-02-01*
*Companion to: [leaf-execution-pipeline.md](./leaf-execution-pipeline.md)*
