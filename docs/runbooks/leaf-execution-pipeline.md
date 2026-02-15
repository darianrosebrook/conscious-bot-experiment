# Leaf Execution Pipeline: Full Inventory & End-to-End Flows

> Reference document for auditing and validating every leaf in the system.
> Each leaf has a `confirmed_working` date indicating the last time its end-to-end
> flow was validated (or `NOT VERIFIED` if untested).

---

## Table of Contents

1. [Pipeline Overview](#pipeline-overview)
2. [Execution Rigs](#execution-rigs)
3. [Solver → Leaf Routing](#solver--leaf-routing)
4. [Leaf Inventory](#leaf-inventory)
   - [Movement](#movement-leaves)
   - [Interaction](#interaction-leaves)
   - [Sensing](#sensing-leaves)
   - [Crafting](#crafting-leaves)
   - [Container](#container-leaves)
   - [Combat](#combat-leaves)
   - [Farming](#farming-leaves)
   - [World Interaction](#world-interaction-leaves)
   - [Construction (P0 Stubs)](#construction-leaves-p0-stubs)
5. [Known Composability Gaps](#known-composability-gaps)
6. [Key File Index](#key-file-index)

---

## Pipeline Overview

### Service Port Map

| Service              | Port | Endpoints                |
|----------------------|------|--------------------------|
| Dashboard            | 3000 | Static + WebSocket       |
| Memory               | 3001 | /memories, /query        |
| Planning             | 3002 | /solve, /solve-navigation, /task |
| Cognition            | 3003 | /think, /reflect         |
| World                | 3004 | /state, /entities        |
| Minecraft Interface  | 3005 | /action, /world-scan     |
| Viewer               | 3006 | WebSocket stream         |
| Core API             | 3007 | /api/*                   |
| Sterling             | 8766 | WebSocket (solve/report) |

```
User Intent / Thought
        |
[TaskIntegration.addTask]  ................  task-integration.ts:1108
        |
[SterlingPlanner.generateDynamicSteps]  ...  sterling-planner.ts
        |
   +----+----+
   |         |
Sterling   Fallback
Solver     Planner
   |         |
   +----+----+
        |
  TaskStep[] with meta.leaf + meta.args
        |
[autonomousTaskExecutor loop]  ............  modular-server.ts:1477
        |
[stepToLeafExecution]  ....................  modular-server.ts:915
        |
[validateLeafArgs]  .......................  leaf-arg-contracts.ts:127
        |
[Guard pipeline]
  0. Geofence (fail-closed)
  1. Allowlist (block unknown leaves)
  2. Shadow mode (observe, no mutate)
  3. Rate limiter
  4. Rig G (feasibility gate)
  5. Commit (execute)
  6. Post-dispatch: NAV_PREEMPTED → SAFETY_PREEMPTED (30s backoff)
  7. Post-dispatch: NAV_BUSY → NAVIGATING_IN_PROGRESS (no retry)
        |
[toolExecutor.execute]  ...................  modular-server.ts:2020
        |
HTTP POST /action --> minecraft-interface:3005
        |
[POST /action handler]  ...................  server.ts:1581
        |
[ActionTranslator.executeAction]  .........  action-translator.ts:949
        |
[LeafFactory.get(leafName)]  ..............  server.ts:889 (global)
        |
[leaf.run(ctx, args)]  ....................  <leaf-file>:<line>
        |
Mineflayer bot actions
        |
LeafResult { status, result, metrics }
        |
HTTP 200 JSON response
        |
[taskIntegration.completeTaskStep]  .......  task-integration.ts
  or retry logic
```

---

## Execution Rigs

Only **Rig G** is implemented. Rig A/B/C are referenced in naming but have no code.

| Rig | File | Purpose |
|-----|------|---------|
| **Rig G** | `packages/planning/src/constraints/execution-advisor.ts` | Fail-closed feasibility gate: version check, feasibility pass/fail, parallelism budget (1-3), reorderable step pairs, replan trigger |

Rig G decision output:

```typescript
{
  shouldProceed: boolean;
  blockReason?: string;
  suggestedParallelism: number;  // 1-3
  reorderableStepPairs: Array;
  shouldReplan: boolean;
  replanReason?: string;
}
```

---

## Solver -> Leaf Routing

**Shared routing**: `packages/planning/src/sterling/leaf-routing.ts`

### actionTypeToLeaf (line 40)

| Solver Action Type | Leaf Name | Notes |
|-------------------|-----------|-------|
| `mine` | `acquire_material` | Atomic dig + collect |
| `craft` | `craft_recipe` | |
| `smelt` | `smelt` | |
| `place:<workstation>` | `place_workstation` | crafting_table, furnace, blast_furnace |
| `place:<other>` | `place_block` | |
| `upgrade` | `craft_recipe` | Tool-progression only (line 59) |

### Action Contract Registry (MC-side dispatch)

**File**: `packages/minecraft-interface/src/action-contract-registry.ts`

The `ACTION_CONTRACTS` table is the single source of truth for MC-side action→leaf routing,
parameter normalization (aliases, defaults, strip/deprecated keys), and dispatch mode selection.
All normalization is data-driven — no switch statements.

#### Dispatch modes

| Mode | Behavior | Actions |
|------|----------|---------|
| `'leaf'` (default) | Route directly to leaf via `dispatchToLeaf` | `acquire_material`, `consume_food`, `collect_items`, `sleep`, `find_resource`, `equip_tool`, `introspect_recipe`, `place_workstation`, `place_torch`, `get_block_at` |
| `'handler'` | Always route to dedicated handler method | `craft`, `craft_item`, `smelt`, `smelt_item` |
| `'guarded'` | Check semantic guards; if none fire, dispatch to leaf | `place_block`, `collect_items_enhanced` |

#### Parameter normalization (aliases)

| Action Type | Alias | Notes |
|-------------|-------|-------|
| `acquire_material` | `blockType` → `item` | Leaf expects `item` |
| `place_block` | `block_type` → `item` | Leaf expects `item`; `placement`, `count` stripped |
| `collect_items_enhanced` | `item` → `itemName`, `maxSearchTime` → `timeout` | Routes to `collect_items` leaf; `exploreOnFail` stripped |
| `collect_items` | `item` → `itemName` | |
| `craft` / `craft_item` | `item` → `recipe`, `quantity` → `qty` | Default `qty: 1` |
| `smelt` / `smelt_item` | `item` → `input`, `quantity` → `qty` | Default `fuel: 'coal'` |

#### Semantic guards (guarded dispatch)

| Guard | Condition | Routes to |
|-------|-----------|-----------|
| `place_block` multi-block | `placement` set and not `'around_player'` | `executePlaceBlock` handler |
| `place_block` count > 1 | `count > 1` | `executePlaceBlock` handler |
| `collect_items_enhanced` explore | `exploreOnFail === true` | `executeCollectItemsEnhanced` handler |

#### Normalization semantics

- **Null-as-absent**: `null` and `undefined` are treated identically as "not provided" for alias targets and defaults. Callers cannot use `null` to clear a value.
- **Alias source cleanup**: Non-canonical alias source keys are always deleted from output, even if null/undefined.
- **Alias conflict resolution**: If both source and target keys are meaningfully set, the target wins, the source is deleted, and a warning is emitted.
- **requiredKeys**: Enforced in all dispatch paths (Phase 1, Phase 2 legacy, handler-mode). Missing keys cause immediate fail-closed rejection before the leaf runs.
- **Idempotent**: `normalizeActionParams(normalizeActionParams(x)) === normalizeActionParams(x)`

### Fallback planner: requirementToFallbackPlan (leaf-arg-contracts.ts:175)

| Requirement Kind | Leaf Emitted | Args Shape |
|-----------------|--------------|------------|
| `collect` | `acquire_material` | `{ item, count: 1 }` |
| `mine` | `acquire_material` | `{ item, count: 1 }` |
| `craft` | `craft_recipe` | `{ recipe, qty }` |
| `build` | `build_module` | `{ moduleId }` |

### stepToLeafExecution switch (modular-server.ts:915)

| Step Leaf | Dispatched As | Args Derivation |
|-----------|--------------|-----------------|
| `dig_block` | `acquire_material` | Legacy remap: `{ item: produces[0].name }` |
| `craft_recipe` | `craft_recipe` | `{ recipe: produces[0].name, qty }` |
| `smelt` | `smelt` | `{ input: consumes[0].name }` |
| `place_workstation` | `place_workstation` | `{ workstation }` |
| `place_block` | `place_block` | `{ item: consumes[0].name }` |
| `acquire_material` | `acquire_material` | `{ item, count }` from meta.item/produces/blockType |
| `prepare_site` | `prepare_site` | `{ moduleId, ...meta.args }` |
| `build_module` | `build_module` | `{ moduleId, ...meta.args }` |
| `place_feature` | `place_feature` | `{ moduleId, ...meta.args }` |
| `building_step` | `building_step` | `{ moduleId, ...meta.args }` |
| *(others)* | *(passthrough)* | Pre-derived from `meta.args` at step creation |

---

## Leaf Inventory

### Movement Leaves

**File**: `packages/minecraft-interface/src/leaves/movement-leaves.ts`

#### move_to
- **Class**: `MoveToLeaf` (line 55)
- **Spec**: timeout=30000ms, retries=2, permissions=[movement]
- **Args**: `{ pos: {x,y,z}, goal?, safe?, timeout? }`
- **Bot actions**: `bot.pathfinder.setGoal()`, stuck detection (0.5 blocks / 6s), dynamic timeout by distance
- **Task Prerequisites:** [bot connected]
- **Docker Command to set situation:** `# no setup needed`
- **Status**: Real implementation. **NOTE**: REST dispatch uses legacy D* Lite NavigationBridge (`LEGACY_ONLY` set in action-translator.ts:955). MoveToLeaf exists but is bypassed for `move_to`/`navigate` action types. Use `{"type":"navigate","parameters":{"x":0,"y":64,"z":303}}` format.
- **confirmed_working**: 2026-02-01 — via legacy navigate handler: targetReached=true, pathLength=21, 553ms planning. Leaf itself not exercised via REST.

#### step_forward_safely
- **Class**: `StepForwardSafelyLeaf` (line 263)
- **Spec**: timeout=5000ms, retries=1, permissions=[movement]
- **Args**: `{ distance?, checkLight? }`
- **Bot actions**: `bot.pathfinder.setGoal()`, light level check (>=8), collision detection
- **Task Prerequisites:** [bot connected]
- **Docker Command to set situation:** `# no setup needed`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — moved ~3 blocks forward, returned newPosition + lightLevel=15, 409ms duration

#### follow_entity
- **Class**: `FollowEntityLeaf` (line 390)
- **Spec**: timeout=30000ms, retries=1, permissions=[movement]
- **Args**: `{ entityId, range?, timeout? }`
- **Bot actions**: `bot.pathfinder.setGoal(GoalFollow)`, polling-based proximity check
- **Task Prerequisites:** [bot connected, pathfinder loaded, target entity visible]
- **Docker Command to set situation:** `summon pig ~ ~ ~5 {NoAI:1b}`
- **Status**: Real implementation
- **confirmed_working**: NOT VERIFIED

---

### Interaction Leaves

**File**: `packages/minecraft-interface/src/leaves/interaction-leaves.ts`

#### dig_block
- **Class**: `DigBlockLeaf` (line 649)
- **Spec**: timeout=10000ms, retries=2, permissions=[dig]
- **Args**: `{ pos?: {x,y,z}, blockType?: string, expect?: string, tool?: string }`
- **Bot actions**: `bot.dig()`, `bot.equip()`, expanding cube search (r=1..10), line-of-sight check. Does NOT pathfind to blocks or collect drops.
- **Task Prerequisites:** [bot connected, breakable block within line-of-sight and reach]
- **Docker Command to set situation:** `setblock ~3 ~ ~ minecraft:stone && give Sterling stone_pickaxe 1`
- **Status**: Real implementation. **DEPRECATED** -- does NOT collect dropped items or pathfind. Use `acquire_material` instead. `stepToLeafExecution` in modular-server.ts remaps `dig_block` → `acquire_material` at dispatch time.
- **confirmed_working**: NOT VERIFIED (deprecated, remapped to acquire_material)

#### acquire_material
- **Class**: `AcquireMaterialLeaf` (line 942)
- **Spec**: timeout=30000ms, retries=1, permissions=[dig, movement]
- **Args**: `{ item: string, count?: number (1-8), tool?: string }`
- **Bot actions**: Composite: expanding cube search (r=1..10) -> pathfind to within reach if >4 blocks (GoalNear range=3) -> `bot.dig()` -> playerCollect event listener (2s timeout) -> if no auto-collect, walk toward dig site at ground level -> inventory delta check (authoritative). Repeats up to `count` times. Reports partial success if some collected.
- **Pathfinding**: Uses real mineflayer-pathfinder GoalNear (not SimpleGoalNear stubs). If pathfinding fails, still attempts dig (block may be reachable).
- **Drop collection**: Uses `playerCollect` event as primary pickup signal, with walk-to-dig-site fallback and inventory delta as authoritative confirmation. Handles blocks that drop different items (stone→cobblestone, etc).
- **Task Prerequisites:** [bot connected]
- **Docker Command to set situation:** `# needs breakable blocks nearby`
- **Status**: Real implementation (replaces dig_block + collect_items pattern)
- **confirmed_working**: 2026-02-01 — Fixed collection bug (was using entity-walk, now uses playerCollect event + inventory delta + walk-to-drop fallback). count=3: 3/3 acquired in 7.6s. count=5 in sparse area: 3/5 (correct — only 3 trees in range). Inventory delta always matches reported count.

#### place_block
- **Class**: `PlaceBlockLeaf` (line ~1240)
- **Spec**: timeout=8000ms, retries=1, permissions=[place]
- **Args**: `{ item: string, against?: {x,y,z}, pos?: {x,y,z} }`
- **Bot actions**: `bot.equip()`, `bot.placeBlock()`, reference-block face vector logic
- **Task Prerequisites:** [bot connected, block item in inventory, solid reference block nearby for face placement]
- **Docker Command to set situation:** `give Sterling cobblestone 64`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-02 — placed cobblestone at (1, 64, 305) in 297ms. Requires `item` param (not blockType).

#### place_torch_if_needed
- **Class**: `PlaceTorchIfNeededLeaf` (line 66)
- **Spec**: timeout=10000ms, retries=1, permissions=[place]
- **Args**: `{ interval?, lightThreshold?, position? }`
- **Bot actions**: `bot.equip()`, `bot.placeBlock()`, conditional on light level, tracks last 50 torch positions
- **Task Prerequisites:** [bot connected, torch in inventory, solid block nearby for placement]
- **Docker Command to set situation:** `give Sterling torch 64 && time set midnight`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — lightLevel=15, torchPlaced=false (correct: no torch needed in daylight). Leaf functional, needs nighttime test for actual placement.

#### place_torch
- **Class**: `PlaceTorchLeaf` (interaction-leaves.ts)
- **Spec**: timeout=5000ms, retries=1, permissions=[place]
- **Args**: `{ position? }` — optional, defaults to bot position
- **Bot actions**: `bot.equip()`, `bot.placeBlock()` — unconditional (no light level checks)
- **Design rationale**: Proves multi-step inventory→world chain without ambient light dependency. Used in Tier B smoke chain (`tb_craft_build_torch`).
- **Task Prerequisites:** [bot connected, torch in inventory, solid block nearby]
- **Docker Command to set situation:** `give Sterling torch 32`
- **Status**: Real implementation (new)
- **Receipt-verified**: Yes — returns `{ torchPlaced, position }` for receipt-anchored verification

#### retreat_and_block
- **Class**: `RetreatAndBlockLeaf` (line 385)
- **Spec**: timeout=15000ms, retries=1, permissions=[movement, place]
- **Args**: `{ retreatDistance?, blockType?, checkLight? }`
- **Bot actions**: `bot.pathfinder.goto()`, `bot.placeBlock()`, finds safe retreat position
- **Task Prerequisites:** [bot connected, cobblestone or shield in inventory for blocking]
- **Docker Command to set situation:** `give Sterling cobblestone 16 && give Sterling shield 1 && summon zombie ~ ~ ~5 {NoAI:1b}`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-02 — retreated to safe position (-2.36, 65, 309.78) in 88ms. Blocking not triggered (no shield equipped).

#### consume_food
- **Class**: `ConsumeFoodLeaf` (line ~1488)
- **Spec**: timeout=10000ms, retries=2, permissions=[container.read]
- **Args**: `{ food_type?, amount?, until_saturation? }`
- **Bot actions**: `bot.equip()`, `bot.consume()`, food whitelist, checks `bot.food`/`bot.foodSaturation`
- **Task Prerequisites:** [bot connected, food item in inventory, bot.food < 20 for actual consumption]
- **Docker Command to set situation:** `give Sterling bread 16 && effect give Sterling minecraft:hunger 30 5`
- **Status**: Real implementation — returns success but consumed 0 items when food=10/20. May need hunger threshold tuning or the food item naming doesn't match bot's `cooked_beef` inventory name.
- **confirmed_working**: 2026-02-02 — responds with success but itemsConsumed=0 when food=10. Needs investigation: may not eat unless food < threshold.
- **Reflex pipeline**: This leaf is the terminal action for the hunger driveshaft reflex (SC-29 in execution proof ledger). The reflex controller injects a single-step task with `{ leaf: 'consume_food', args: {} }` — empty args because the leaf's `isFoodItem()` handles food selection internally. See `hunger-driveshaft-controller.ts` and smoke tests S1–S9.

#### sleep
- **Class**: `SleepLeaf` (line ~1709)
- **Spec**: timeout=30000ms, retries=1, permissions=[movement, place]
- **Args**: `{ force?, searchRadius?, placeBed? }`
- **Bot actions**: `bot.sleep()`, `bot.placeBlock()`, time-of-day check (12542-23459), bed search/placement
- **Task Prerequisites:** [bot connected, nighttime (MC ticks 12542-23459), bed in inventory or bed block nearby]
- **Docker Command to set situation:** `give Sterling red_bed 1 && time set night`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — correctly refuses during daytime: "Cannot sleep during the day (time: 1146)". Needs nighttime test for actual sleep.

#### collect_items
- **Class**: `CollectItemsLeaf` (line ~1915)
- **Spec**: timeout=30000ms, retries=1, permissions=[movement]
- **Args**: `{ itemName?: string, radius?: number (1-32), maxItems?: number (1-64), timeout?: number }`
- **Bot actions**: `pathfinder.goto(GoalNear)`, walks to dropped item entities for auto-pickup
- **Task Prerequisites:** [bot connected, dropped item entities on ground nearby, inventory space available]
- **Docker Command to set situation:** `summon item ~ ~1 ~ {Item:{id:"minecraft:diamond",Count:3}} && summon item ~2 ~1 ~ {Item:{id:"minecraft:iron_ingot",Count:5}}`
- **Status**: Real implementation — fixed 2026-02-02 to use pathfinder instead of broken setControlState
- **confirmed_working**: 2026-02-02 — collected 5 items (2 oak_log, 3 diamond, 5 iron_ingot, 1 oak_sapling) from ground in 7.4s. Inventory verified.

---

### Sensing Leaves

**File**: `packages/minecraft-interface/src/leaves/sensing-leaves.ts`

#### sense_hostiles
- **Class**: `SenseHostilesLeaf` (line 45)
- **Spec**: timeout=2000ms, retries=0, permissions=[sense]
- **Args**: `{ radius?, includePassive? }`
- **Bot actions**: Read-only scan of `bot.entities`
- **Task Prerequisites:** [bot connected]
- **Docker Command to set situation:** `# no setup needed — read-only`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — returns hostiles=[], count=0, nearestDistance=-1 when no mobs nearby

#### chat
- **Class**: `ChatLeaf` (line 270)
- **Spec**: timeout=1000ms, retries=0, permissions=[chat]
- **Args**: `{ message: string, target? }`
- **Bot actions**: `bot.chat()`, caps message at 256 chars
- **Task Prerequisites:** [bot connected]
- **Docker Command to set situation:** `# no setup needed`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — sends message, returns messageSent + timestamp

#### wait
- **Class**: `WaitLeaf` (line 395)
- **Spec**: timeout=300000ms, retries=0, permissions=[sense]
- **Args**: `{ ms: number, checkAbort? }`
- **Bot actions**: None (setTimeout only), abortable via `ctx.abortSignal`, max 5 min
- **Task Prerequisites:** [bot connected]
- **Docker Command to set situation:** `# no setup needed`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — waited 500ms, returned waitedMs=500, aborted=false

#### get_light_level
- **Class**: `GetLightLevelLeaf` (line 539)
- **Spec**: timeout=1000ms, retries=0, permissions=[sense]
- **Args**: `{ position? }`
- **Bot actions**: Read-only `bot.world.getLight()`, safe threshold = 8
- **Task Prerequisites:** [bot connected]
- **Docker Command to set situation:** `# no setup needed — read-only`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — returned lightLevel=15 (daylight), isSafe=true at bot position

#### get_block_at
- **Class**: `GetBlockAtLeaf` (sensing-leaves.ts)
- **Spec**: timeout=1000ms, retries=0, permissions=[sense]
- **Args**: `{ position: { x, y, z } }` — required
- **Bot actions**: Read-only `bot.blockAt(Vec3)`. Returns `{ name: 'unknown' }` for unloaded chunks (inconclusive signal).
- **Design rationale**: Sensing primitive for receipt-anchored verification. After a placement leaf reports success, the verifier probes the exact claimed coordinate to confirm the block is actually there.
- **Task Prerequisites:** [bot connected]
- **Docker Command to set situation:** `# no setup needed — read-only`
- **Status**: Real implementation (new)

#### find_resource
- **Class**: `FindResourceLeaf` (line 660)
- **Spec**: timeout=5000ms, retries=0, permissions=[sense]
- **Args**: `{ blockType: string, radius?, maxResults?, partialMatch? }`
- **Bot actions**: Read-only expanding-shell search via `bot.blockAt()`, sorted by distance
- **Task Prerequisites:** [bot connected]
- **Docker Command to set situation:** `# no setup needed — read-only`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — found 5 `_log` blocks within radius=16, nearest at distance=5.39

---

### Crafting Leaves

**File**: `packages/minecraft-interface/src/leaves/crafting-leaves.ts`

#### craft_recipe
- **Class**: `CraftRecipeLeaf` (line 271)
- **Spec**: timeout=30000ms, retries=2, permissions=[craft]
- **Args**: `{ recipe: string, qty?: number, timeoutMs? }`
- **Bot actions**: `bot.recipesFor()`, `bot.craft()`, finds crafting_table within 6 blocks (isStandableAdjacent + hasLineOfSight), verifies inventory delta
- **Limitation**: Does NOT place a crafting table if none found -- relies on planner injecting `place_workstation` first. Dynamic prereq injection in modular-server.ts handles this.
- **Task Prerequisites:** [bot connected, recipe ingredients in inventory, crafting_table nearby if recipe requires one]
- **Docker Command to set situation:** `give Sterling oak_planks 8 && give Sterling stick 4 && setblock ~2 ~ ~ minecraft:crafting_table`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — Full chain verified: oak_planks (4 from 1 log, 9ms), sticks (4 from 2 planks), crafting_table (1 from 4 planks), wooden_pickaxe (1 from 3 planks + 2 sticks, requires nearby crafting_table). All inventory deltas verified. 2x2 recipes work without table, 3x3 requires placed crafting_table.

#### smelt
- **Class**: `SmeltLeaf` (line 472)
- **Spec**: timeout=90000ms, retries=1, permissions=[craft, container.read, container.write]
- **Args**: `{ input: string, fuel?, qty?, timeoutMs? }`
- **Bot actions**: `bot.openFurnace()` -> `furnace.putFuel()` -> `furnace.putInput()` -> poll for output -> `furnace.takeOutput()` -> `furnace.close()`
- **Limitation**: Poll-based output detection (1s interval). Timeout scales by qty (12s/item + 10s overhead, min 30s). deriveOutputName map covers raw ores, common foods, cobblestone/sand.
- **Task Prerequisites:** [bot connected, furnace placed nearby, input items in inventory, fuel (coal/charcoal) in inventory]
- **Docker Command to set situation:** `setblock ~2 ~ ~ minecraft:furnace && give Sterling raw_iron 3 && give Sterling coal 8`
- **Status**: Real implementation (fixed stub: putFuel/putInput/takeOutput now called)
- **confirmed_working**: 2026-02-01 — smelted raw_iron -> iron_ingot (1 coal consumed). Inventory verified: raw_ironx2 + iron_ingotx1 + coalx7. Requires nearby furnace (use place_workstation first).

#### place_workstation
- **Class**: `PlaceWorkstationLeaf` (line 739)
- **Spec**: timeout=8000ms, retries=1, permissions=[place]
- **Args**: `{ workstation: string }` (crafting_table | furnace | blast_furnace)
- **Bot actions**: `bot.equip()`, `bot.placeBlock()`, reuses existing workstations if usable, sprawl check (fails if >=3 within 6 blocks)
- **Limitation**: Sprawl detection can cause infinite retry if area already has workstations. No "remove old workstation" leaf exists.
- **Task Prerequisites:** [bot connected, workstation item in inventory, <3 same-type workstations within 6 blocks]
- **Docker Command to set situation:** `give Sterling crafting_table 1`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — placed crafting_table and furnace. crafting_table at (11.5, 64, 307.5) 549ms; furnace at (202.5, 90, 200.5) on stone platform. Fails on uneven terrain ("No suitable placement position"). Param name is `workstation` not `workstationType`.

#### introspect_recipe
- **Class**: `IntrospectRecipeLeaf` (line 951)
- **Spec**: timeout=5000ms, retries=0, permissions=[sense]
- **Args**: `{ output: string }`
- **Bot actions**: Read-only `bot.recipesFor()`, returns inputs and requiresTable flag
- **Task Prerequisites:** [bot connected]
- **Docker Command to set situation:** `# no setup needed — read-only`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — returned crafting_table recipe: requiresTable=false, inputs=[] (note: inputs empty may be mcData issue)

---

### Container Leaves

**File**: `packages/minecraft-interface/src/leaves/container-leaves.ts`

#### open_container
- **Class**: `OpenContainerLeaf` (line 723)
- **Spec**: timeout=10000ms, retries=2, permissions=[container.read]
- **Args**: `{ position?: {x,y,z}, containerType?, radius? }`
- **Bot actions**: `bot.openChest()`, `bot.openFurnace()`, auto-pathfinds if >2 blocks away
- **Task Prerequisites:** [bot connected, container block placed nearby (chest/furnace/hopper/barrel)]
- **Docker Command to set situation:** `setblock ~2 ~ ~ minecraft:chest`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — correctly errors "No container found within 16 blocks" when no chest nearby. Needs chest placement test.

#### transfer_items
- **Class**: `TransferItemsLeaf` (line 964)
- **Spec**: timeout=15000ms, retries=2, permissions=[container.read, container.write]
- **Args**: `{ source?, destination?, mode? }`
- **Bot actions**: `window.transferItem()`, modes: take, put, swap, withdraw, deposit, all
- **Task Prerequisites:** [bot connected, container window currently open (run open_container first), items in source]
- **Docker Command to set situation:** `setblock ~2 ~ ~ minecraft:chest && give Sterling apple 10`
- **Status**: Real implementation
- **confirmed_working**: NOT VERIFIED — requires open container window

#### close_container
- **Class**: `CloseContainerLeaf` (line 1187)
- **Spec**: timeout=5000ms, retries=1, permissions=[container.read]
- **Args**: `{ containerId?, waitForItems? }`
- **Bot actions**: `window.close()`, uses ContainerManager tracking
- **Task Prerequisites:** [bot connected, container window currently open]
- **Docker Command to set situation:** `setblock ~2 ~ ~ minecraft:chest`
- **Status**: Real implementation
- **confirmed_working**: NOT VERIFIED — requires open container window

#### manage_inventory
- **Class**: `InventoryManagementLeaf` (line 1292)
- **Spec**: timeout=30000ms, retries=1, permissions=[container.read, container.write]
- **Args**: `{ action: string, keepItems?, maxStackSize? }`
- **Bot actions**: `bot.toss()`, actions: sort, compact, drop_unwanted, keep_essentials, organize
- **Task Prerequisites:** [bot connected, items in inventory]
- **Docker Command to set situation:** `give Sterling apple 5 && give Sterling bread 3 && give Sterling cobblestone 32 && give Sterling diamond_sword 1`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — sort: processed=10, compact: processed=10, stacksCompacted=0. Valid actions: sort, compact, drop_unwanted, keep_essentials, organize.

---

### Combat Leaves

**File**: `packages/minecraft-interface/src/leaves/combat-leaves.ts`

#### attack_entity
- **Class**: `AttackEntityLeaf` (line 137)
- **Spec**: timeout=60000ms, retries=3, permissions=[movement, dig]
- **Args**: `{ entityId?, radius?, duration?, retreatHealth? }`
- **Bot actions**: `bot.attack()`, `bot.lookAt()`, monitors health/distance, retreats if health < threshold
- **Task Prerequisites:** [bot connected, hostile or target entity within radius]
- **Docker Command to set situation:** `summon zombie ~ ~ ~3 {NoAI:1b} && give Sterling iron_sword 1`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — killed NoAI zombie in 10s. target health=0, combatDuration=10015ms, damageDealt=0 (reporting bug?). Spawned via `execute at Sterling run summon zombie ~2 ~ ~ {NoAI:1b}`.

#### equip_weapon
- **Class**: `EquipWeaponLeaf` (line 411)
- **Spec**: timeout=5000ms, retries=1, permissions=[container.read]
- **Args**: `{ preferredType?, fallbackToHand? }`
- **Bot actions**: `bot.equip()`, `bot.unequip()`, priority: diamond > iron > stone > wooden
- **Task Prerequisites:** [bot connected, weapon in inventory (sword/axe/bow/crossbow)]
- **Docker Command to set situation:** `give Sterling iron_sword 1 && give Sterling diamond_sword 1`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-02 — equipped wooden_sword, weaponType=any, slot=38. Tier priority works (diamond > iron > stone > wooden).

#### retreat_from_threat
- **Class**: `RetreatFromThreatLeaf` (line 570)
- **Spec**: timeout=30000ms, retries=2, permissions=[movement]
- **Args**: `{ retreatDistance?, safeRadius?, useSprint? }`
- **Bot actions**: `bot.setControlState()`, calculates retreat direction away from threat center
- **Task Prerequisites:** [bot connected, hostile entity nearby for meaningful retreat]
- **Docker Command to set situation:** `summon zombie ~ ~ ~3 {NoAI:1b} && summon skeleton ~2 ~ ~3 {NoAI:1b}`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — threatsDetected=0, retreated=false, returned safePosition. Leaf handles no-threat case correctly.

#### use_item
- **Class**: `UseItemLeaf` (line 820)
- **Spec**: timeout=10000ms, retries=1, permissions=[container.read]
- **Args**: `{ item: string, quantity?, hand? }`
- **Bot actions**: `bot.equip()`, `bot.activateItem()`, hand: main or off-hand
- **Task Prerequisites:** [bot connected, specified item in inventory]
- **Docker Command to set situation:** `give Sterling ender_pearl 3`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — used stick: itemUsed="stick", quantityUsed=1, effect="item_activated"

#### equip_tool
- **Class**: `EquipToolLeaf` (line 990)
- **Spec**: timeout=5000ms, retries=1, permissions=[container.read]
- **Args**: `{ material?, toolType?, fallbackToHand? }`
- **Bot actions**: `bot.equip()`, tier priority: netherite > diamond > iron > stone > golden > wooden
- **Task Prerequisites:** [bot connected, tool in inventory matching toolType/material]
- **Docker Command to set situation:** `give Sterling iron_pickaxe 1 && give Sterling stone_axe 1 && give Sterling diamond_shovel 1`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-02 — equipped wooden_pickaxe by `toolType:"pickaxe"`, tier=wooden, slot=39. Also works by `material:"wood"` → auto-selects axe.

---

### Farming Leaves

**File**: `packages/minecraft-interface/src/leaves/farming-leaves.ts`

#### till_soil
- **Class**: `TillSoilLeaf` (line 169)
- **Spec**: timeout=30000ms, retries=3, permissions=[movement, dig, place]
- **Args**: `{ position?, radius? }`
- **Bot actions**: `bot.equip()` (hoe), `bot.activateBlock()`, requires hoe in inventory
- **Task Prerequisites:** [bot connected, hoe in inventory, tillable soil nearby (grass_block/dirt/coarse_dirt)]
- **Docker Command to set situation:** `give Sterling wooden_hoe 1 && setblock ~2 ~-1 ~ minecraft:dirt`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — tilled farmland at (9.5, 63, 307.5) using wooden_hoe. Requires hoe in inventory and dirt/grass blocks nearby.

#### plant_crop
- **Class**: `PlantCropLeaf` (line 325)
- **Spec**: timeout=20000ms, retries=3, permissions=[movement, container.read, container.write]
- **Args**: `{ position?, cropType?, radius? }`
- **Bot actions**: `bot.placeBlock()`, checks empty farmland, seed mapping (wheat/carrots/potatoes/beetroots)
- **Task Prerequisites:** [bot connected, seeds in inventory, farmland block nearby (preferably hydrated)]
- **Docker Command to set situation:** `give Sterling wheat_seeds 16 && setblock ~2 ~-1 ~ minecraft:farmland[moisture=7] && setblock ~1 ~-1 ~1 minecraft:water`
- **Status**: Real implementation — timed out waiting for blockUpdate event after placing seeds. May need water nearby for farmland to accept seeds, or blockUpdate event not firing correctly.
- **confirmed_working**: 2026-02-02 — FAILED: `blockUpdate:(-2, 64, 305) did not fire within timeout of 5000ms`. Till works but seed placement may require hydrated farmland.

#### harvest_crop
- **Class**: `HarvestCropLeaf` (line 550)
- **Spec**: timeout=30000ms, retries=3, permissions=[movement, dig]
- **Args**: `{ position?, radius? }`
- **Bot actions**: `bot.dig()`, checks crop age/readiness via metadata
- **Task Prerequisites:** [bot connected, mature crop blocks nearby (age=7 for wheat/carrots/potatoes, age=3 for beetroots)]
- **Docker Command to set situation:** `setblock ~2 ~-1 ~ minecraft:farmland && setblock ~2 ~ ~ minecraft:wheat[age=7]`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — correctly errors "No mature crops found within 8 blocks". Needs mature wheat test.

#### manage_farm
- **Class**: `ManageFarmLeaf` (line 728)
- **Spec**: timeout=120000ms, retries=3, permissions=[movement, dig, place, container.read, container.write]
- **Args**: `{ action?, cropType?, radius?, maxOperations? }`
- **Bot actions**: Composite -- calls till/plant/harvest leaves internally. Actions: till, plant, harvest, maintain (prioritized combo)
- **Task Prerequisites:** [bot connected, hoe in inventory, seeds in inventory (for plant/maintain), tillable soil or crops nearby]
- **Docker Command to set situation:** `give Sterling diamond_hoe 1 && give Sterling wheat_seeds 20 && setblock ~2 ~-1 ~ minecraft:dirt && setblock ~3 ~-1 ~ minecraft:dirt`
- **Status**: Real implementation (composite)
- **confirmed_working**: 2026-02-01 — maintain action: operationsCompleted=10, tilled=10, planted=0, harvested=0. Composite leaf successfully delegates to till sub-operations.

---

### World Interaction Leaves

**File**: `packages/minecraft-interface/src/leaves/world-interaction-leaves.ts`

#### interact_with_block
- **Class**: `InteractWithBlockLeaf` (line 177)
- **Spec**: timeout=10000ms, retries=3, permissions=[movement]
- **Args**: `{ position: {x,y,z}, interactionType?, radius? }`
- **Bot actions**: `bot.activateBlock()`, `bot.openContainer()`, handles buttons/levers/doors/containers
- **Task Prerequisites:** [bot connected, interactive block nearby (door/lever/button/chest)]
- **Docker Command to set situation:** `setblock ~2 ~ ~ minecraft:lever && setblock ~3 ~ ~ minecraft:oak_door[half=lower] && setblock ~3 ~1 ~ minecraft:oak_door[half=upper]`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-01 — correctly errors "No interactive blocks found within 16 blocks" when no interactive blocks nearby. Needs door/lever/button test.

#### operate_piston
- **Class**: `OperatePistonLeaf` (line 388)
- **Spec**: timeout=15000ms, retries=3, permissions=[movement]
- **Args**: `{ position: {x,y,z}, action?, powerSource? }`
- **Bot actions**: `bot.activateBlock()`, reads piston state from metadata, finds nearby power source
- **Task Prerequisites:** [bot connected, piston block at position, nearby power source (lever/button/redstone)]
- **Docker Command to set situation:** `setblock ~2 ~ ~ minecraft:piston[facing=north] && setblock ~2 ~-1 ~ minecraft:lever`
- **Status**: Real implementation
- **confirmed_working**: NOT VERIFIED

#### control_redstone
- **Class**: `ControlRedstoneLeaf` (line 629)
- **Spec**: timeout=20000ms, retries=3, permissions=[movement]
- **Args**: `{ action: string, targetPosition?, powerSource?, radius? }`
- **Bot actions**: `bot.activateBlock()`, actions: power_on, power_off, toggle, pulse
- **Task Prerequisites:** [bot connected, redstone-powered device nearby (lamp/piston/door), power source nearby (lever/button)]
- **Docker Command to set situation:** `setblock ~2 ~ ~ minecraft:redstone_lamp && setblock ~2 ~1 ~ minecraft:lever`
- **Status**: Real implementation
- **confirmed_working**: NOT VERIFIED

#### ~~build_structure~~ — REMOVED
- **Status**: `BuildStructureLeaf` class deleted. Replaced by modular building system.
- Goal type `'build_structure'` routes through Sterling building solver → `prepare_site` → `build_module` → `place_feature`.
- See `building-solver-dispatch-chain-e2e.test.ts` for dispatch proof.

#### control_environment
- **Class**: `EnvironmentalControlLeaf` (line 1295)
- **Spec**: timeout=10000ms, retries=2, permissions=[movement, chat]
- **Args**: `{ action: string, time?, weather? }`
- **Bot actions**: `bot.chat()` with /time, /weather commands
- **Limitation**: Requires server operator or cheats enabled.
- **Task Prerequisites:** [bot connected, bot has operator permissions or cheats enabled on server]
- **Docker Command to set situation:** `op Sterling`
- **Status**: Real implementation (requires op)
- **confirmed_working**: NOT VERIFIED

---

### Construction Leaves (P0 Stubs)

**File**: `packages/minecraft-interface/src/leaves/construction-leaves.ts`

These are intentional stubs. They log intent and return success without mutating the world.
All have `permissions: ['sense']` to prevent accidental mutation.

#### prepare_site
- **Class**: `PrepareSiteLeaf` (line 31)
- **Spec**: timeout=5000ms, retries=0, permissions=[sense]
- **Args**: `{ moduleId: string }`
- **Bot actions**: None (logs intent, returns `{ stub: true }`)
- **Task Prerequisites:** [bot connected — stub, no actual world requirements]
- **Docker Command to set situation:** `# no setup needed — P0 stub`
- **Status**: P0 STUB -- no world mutation
- **confirmed_working**: N/A (stub)

#### build_module
- **Class**: `BuildModuleLeaf` (line 108)
- **Spec**: timeout=10000ms, retries=0, permissions=[sense, container.read]
- **Args**: `{ moduleId: string, moduleType?, materials? }`
- **Bot actions**: Read-only inventory check, reports `wouldConsume` and `missingMaterials` as telemetry
- **Task Prerequisites:** [bot connected — stub reads inventory only, no actual build]
- **Docker Command to set situation:** `give Sterling cobblestone 64 && give Sterling oak_planks 32`
- **Status**: P0 STUB -- no world mutation (read-only inventory check)
- **confirmed_working**: N/A (stub)

#### place_feature
- **Class**: `PlaceFeatureLeaf` (line 239)
- **Spec**: timeout=8000ms, retries=0, permissions=[sense, container.read]
- **Args**: `{ moduleId: string, materials? }`
- **Bot actions**: Read-only inventory check, reports `wouldConsume` and `missingMaterials` as telemetry
- **Task Prerequisites:** [bot connected — stub reads inventory only, no actual placement]
- **Docker Command to set situation:** `give Sterling oak_door 4 && give Sterling torch 16`
- **Status**: P0 STUB -- no world mutation (read-only inventory check)
- **confirmed_working**: N/A (stub)

---

## Sterling→Leaf Correlation Proof

### 4-Checkpoint Model

The smoke endpoint (`POST /api/dev/sterling-smoke`) proves that Sterling drove leaf execution
through the full pipeline: expand → materialize → executor → dispatch → verify. It returns
a structured proof report with 4 checkpoints:

| Checkpoint | Field | What it proves |
|------------|-------|----------------|
| **A (requested)** | `sterling_expand_requested` | `expandByDigest` was called with the correct digest BEFORE any WebSocket I/O |
| **A (result)** | `sterling_expand_result` | The expand call completed (ok/blocked/error/timeout) and we captured timing, step count, retry metadata |
| **B (expansion)** | `expansion` | `materializeSterlingIrSteps` produced executor-ready steps with a plan digest |
| **C (dispatch)** | `execution.dispatched_steps` | Each step was dispatched to the MC interface and got a result |
| **D (verification)** | `execution.verification` | Post-dispatch verification ran (inventory delta, position delta, etc.) |

### What the stub approach proves vs. does NOT prove

- **Proves**: Given a committed IR digest, Sterling expand returns pre-baked steps,
  and those steps flow through `materializeSterlingIrSteps` → executor → dispatch → verify.
  The full TypeScript pipeline is exercised.
- **Does NOT prove**: The reduce→digest selection path (Sterling choosing WHICH digest to commit).
  That requires `run-golden-reduce` or a live reduce call.

### Smoke Endpoint

```
POST /api/dev/sterling-smoke
Content-Type: application/json

{ "variant": "ok" }              # default — uses stub digest (happy path, dedupes on repeat)
{ "variant": "ok_fresh" }        # generates unique digest per run (never dedupes, prefix-wildcard)
{ "variant": "unknown_digest" }  # F2 test — uses non-existent digest (blocked failure)
{ "variant": "slow_wait" }       # F6 test — expand ok, 120s wait exceeds poll timeout
{ "variant": "slow_wait_fresh" } # F6 test, unique per run (never dedupes)
```

**Prerequisites**:
- `ENABLE_DEV_ENDPOINTS=true`
- `ENABLE_PLANNING_EXECUTOR=1`
- `EXECUTOR_MODE=live`
- `EXECUTOR_LIVE_CONFIRM=YES`
- Sterling running and connected (ws://localhost:8766)

**Response fields**:
- `proof_passed`: `true` only when all checkpoints ok AND no timeout (use for CI/dashboards)
- `all_checkpoints_ok`: raw checkpoint aggregation (ignores timeout)
- `variant`: which variant was used
- `early_exit`: present when expand failed and polling was short-circuited
- `artifact_path`: path to persisted golden-run artifact on disk

**Fresh run** (variant=ok_fresh, prefix-wildcard, never dedupes):

```bash
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke \
  -H 'Content-Type: application/json' -d '{"variant":"ok_fresh"}' | python3 -m json.tool
```

Expected: `proof_passed: true`, unique `run_id` and `task_id` every call, artifact persisted.
The endpoint generates `smoke_e2e_chat_wait_v1_<12-char-uuid>` as the digest. Sterling's
prefix-wildcard resolver matches `smoke_e2e_chat_wait_v1_` and returns the base entry's steps
with a derived `plan_bundle_digest`. This gives unlimited fresh runs without file edits or restarts.

**Happy path** (variant=ok, stub loaded):

```bash
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke \
  -H 'Content-Type: application/json' -d '{"variant":"ok"}' | python3 -m json.tool
```

Expected: `proof_passed: true`, `all_checkpoints_ok: true`, artifact persisted to disk.

**F2 test** (variant=unknown_digest, no restart needed):

```bash
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke \
  -H 'Content-Type: application/json' -d '{"variant":"unknown_digest"}' | python3 -m json.tool
```

Expected: `proof_passed: false`, `A_requested.ok: true`, `A_result.ok: false` (status: blocked),
`C_dispatch.count: 0`, `early_exit: true` (returns in ~3s instead of 45s).

### Failure Modes

| # | Failure | Signal | Endpoint behavior |
|---|---------|--------|-------------------|
| F1 | Sterling not connected | No WebSocket | 503 `sterling_not_connected` |
| F2 | Digest unknown (use variant=unknown_digest) | A_result.status='blocked' | 200, proof with `C_dispatch.count: 0`, `early_exit: true` |
| F3 | Stub loaded but steps malformed | A_result.status='blocked' | 200, proof with `A_result.ok: false` |
| F4 | Expansion ok but executor disabled | B_expansion.ok=true, C_dispatch.count=0 | 200, proof with `C_dispatch.ok: false` |
| F5 | Dispatch ok but verification fails | A-C ok, D fails | 200, proof with `D_verification.ok: false` |
| F6 | Timeout (45s) | Partial checkpoints | 200, proof with `timed_out: true` |

### Golden-Run Artifact Fields

The smoke run writes a golden-run artifact with these additional fields:

- `sterling_expand_requested`: Recorded BEFORE the WebSocket call to `expandByDigest`
- `sterling_expand_result`: Recorded AFTER the call completes (ok/blocked/error/timeout)
  - `attempt_count`: number of ingest retries (0 = no retries)
  - `final_request_id`: WS-level request_id used for the final call (differs from `request_id` when retries occurred)

These are separate from the existing `expansion` field, which captures the full expansion
details for the executor. The new fields capture the request-response pair for evidence.

Timeout classification: the WS client resolves timeouts as `{ status: 'error', error: 'Expand timeout after Nms' }`.
The recording layer detects this pattern and sets `status: 'timeout'` for accurate classification.

---

## Receipt-Anchored Verification

### Architecture

Placement leaves (`place_block`, `place_torch`, `place_torch_if_needed`, `place_workstation`) return rich receipts in `actionResult.data` containing the exact position and block type placed. The executor extracts these receipts via `extractLeafReceipt()` and stores them on `step.meta.leafReceipt` before `toDispatchResult()` strips the data.

The verifier (`verifyByLeaf` in `task-integration.ts`) then uses `get_block_at` to probe the exact coordinate from the receipt, producing a **tri-state outcome**:

| Outcome | Meaning | Action |
|---------|---------|--------|
| `verified` | Probe returns expected block at receipt position | Accept step, move to next |
| `inconclusive` | `blockAt` returns null (chunk not loaded) or no receipt available | Retry probe only (never re-dispatch) |
| `contradicted` | Probe returns different block than expected | Fail verification, trigger re-dispatch |

### Why tri-state matters

The old binary model (pass/fail) caused the "5 cobblestones" bug: when verification was inconclusive (chunk not loaded), it returned `false`, which triggered re-dispatch. Each re-dispatch placed another block, corrupting the world state. The tri-state model ensures **probe-only retries** on inconclusive results — the leaf is never called again unless the world state actively contradicts the claim.

### Receipt flow

```
PlaceBlockLeaf.run() → { ok: true, data: { blockPlaced: 'cobblestone', position: {x,y,z} } }
    ↓
extractLeafReceipt('place_block', data) → { blockPlaced: 'cobblestone', position: {x,y,z} }
    ↓
step.meta.leafReceipt = receipt  (stored before toDispatchResult strips data)
    ↓
verifyByLeaf('place_block', args, step)
    ↓
probeBlockAt(receipt.position) → get_block_at leaf → { name: 'cobblestone' | 'unknown' }
    ↓
verifyWithTriState(step, 'cobblestone', timeout) → verified | inconclusive | contradicted
```

### Timeout policy

Inconclusive timeout → **accept** (not reject). Rationale: the leaf already confirmed success; inability to observe the result is not evidence of failure. Re-dispatching on "can't observe" is worse than accepting an unverified success.

---

## Known Composability Gaps

### P0 -- Critical for basic gameplay

| Gap | Description | Impact | Mitigation |
|-----|-------------|--------|------------|
| **No auto-equip before mining** | `acquire_material` digs with whatever tool is currently equipped. Mining stone with bare hands is extremely slow. | Mining takes 5-10x longer | Planner should inject `equip_tool` before mine steps |
| **Smelt doesn't check fuel** | If inventory has no coal/charcoal, smelting starts and stalls | Smelt step hangs until timeout | Need prerequisite fuel check or `acquire_material` prereq for coal |
| **dig_block deprecated but callable** | Plans emitting `dig_block` directly (not via stepToLeafExecution remap) will mine without collecting drops | Items lost on ground | stepToLeafExecution remaps dig_block -> acquire_material, but direct leaf calls bypass this |
| **Block→drop name mismatch in verification** | Task step verification checks inventory for the *block* name (e.g., "stone") but the actual drop is different (e.g., "cobblestone"). Verification fails even though the item was collected. | Steps fail verification and retry/skip unnecessarily | Need a block→drop name mapping table, or verify by inventory delta instead of item name match |

### P1 -- Quality of life

| Gap | Description | Impact | Mitigation |
|-----|-------------|--------|------------|
| **Workstation sprawl blocks crafting** | `place_workstation` fails if >=3 crafting tables within 6 blocks (retryable=true) | Infinite retry loop | Need "remove old workstation" leaf or smarter placement |
| ~~**build_structure no material check**~~ | ~~May attempt to place blocks not in inventory~~ | ~~Placement fails silently~~ | RESOLVED — leaf removed, building solver handles deficit via `replan_building` |
| **Construction leaves are stubs** | `prepare_site`, `build_module`, `place_feature` return success without world mutation | Building solver plans execute as no-ops | Implement real construction logic |

### P2 -- Future improvements

| Gap | Description |
|-----|-------------|
| **No composite "mine with correct tool"** | Separate `equip_tool` + `acquire_material` could be a single leaf |
| **No "ensure workstation nearby"** | `craft_recipe` searches but doesn't place; `place_workstation` places but doesn't check if already exists |
| **Farming leaves partial coverage** | till_soil, manage_farm (maintain) verified. plant_crop has blockUpdate timeout bug. harvest_crop needs mature crop test. |

### Bugs Fixed (2026-02-01)

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| **acquire_material digs but doesn't collect** | Entity filter checked `e.name === 'item'` only. In mineflayer 4.34, dropped items have `e.type === 'item'` (not `e.name`). Filter missed all item entities. | Added `e.type === 'item'` to entity filter in both `AcquireMaterialLeaf` and `CollectItemsLeaf` |
| **collect_items walks to items but no pickup** | Used `bot.lookAt() + setControlState('forward')` — can't navigate around obstacles, doesn't reliably reach within pickup range (1 block). | Replaced with `pathfinder.goto(GoalNear(x,y,z,1))` — same pattern as working `executePickup` in action-translator.ts |
| **acquire_material finds unreachable deep blocks** | Expanding cube search iterated all dy from -r to +r, finding blocks 4+ below bot that drop items into unreachable holes. | Capped `MIN_DY = -2` in search loop — only digs within 2 blocks below feet |
| **Inventory delta fallback too narrow** | Only checked inventory delta when `itemEntities.length === 0`, missing cases where entities existed but couldn't be reached. | Check delta when `collected.length === totalAcquiredBefore` (no items collected this iteration) |

---

## Key File Index

| Component | File | Key Functions / Lines |
|-----------|------|-----------------------|
| Task creation | `packages/planning/src/task-integration.ts` | `addTask` (1108) |
| Step generation | `packages/planning/src/task-integration/sterling-planner.ts` | `generateDynamicSteps`, `generateLeafMappedSteps` (456) |
| Fallback planner | `packages/planning/src/modules/leaf-arg-contracts.ts` | `requirementToFallbackPlan` (175), `validateLeafArgs` (127) |
| Leaf arg contracts | `packages/planning/src/modules/leaf-arg-contracts.ts` | `CONTRACTS`, `KNOWN_LEAVES` |
| Leaf routing | `packages/planning/src/sterling/leaf-routing.ts` | `actionTypeToLeaf` (40), `actionTypeToLeafExtended` (58) |
| Crafting solver | `packages/planning/src/sterling/minecraft-crafting-solver.ts` | `solveCraftingGoal` (116), `toTaskSteps` (276) |
| Tool-progression solver | `packages/planning/src/sterling/minecraft-tool-progression-solver.ts` | `solveToolProgression` (101), `toTaskSteps` (370) |
| Building solver | `packages/planning/src/sterling/minecraft-building-solver.ts` | `solveBuildingPlan` (70), `toTaskStepsWithReplan` (354) |
| Executor loop | `packages/planning/src/modular-server.ts` | `autonomousTaskExecutor` (1477), `stepToLeafExecution` (915) |
| Guard pipeline | `packages/planning/src/server/autonomous-executor.ts` | `evaluateGuards`, `GeofenceConfig`, `emergencyStopExecutor` |
| Execution advisor (Rig G) | `packages/planning/src/constraints/execution-advisor.ts` | `computeExecutionAdvice` |
| Known leaf names | `packages/planning/src/modular-server.ts` | `KNOWN_LEAF_NAMES` (221-272) |
| MC action endpoint | `packages/minecraft-interface/src/server.ts` | POST `/action` (1581) |
| Action contract registry | `packages/minecraft-interface/src/action-contract-registry.ts` | `ACTION_CONTRACTS`, `normalizeActionParams`, `resolveLeafName`, `buildActionTypeToLeafMap` |
| Action dispatcher | `packages/minecraft-interface/src/action-translator.ts` | `executeAction` (949), `dispatchToLeaf`, `dispatchToLeafLegacy`, `_runLeaf` |
| Navigation lease | `packages/minecraft-interface/src/navigation-lease-manager.ts` | `acquire` (TTL, preempt reason), `withLease` (preemptResult), `isBusy` (lazy TTL check) |
| Reflex arbitrator | `packages/minecraft-interface/src/reflex/reflex-arbitrator.ts` | `enterReflexMode` (severity), `exitReflexModeEarly`, `isPlannerBlocked` |
| Step executor | `packages/planning/src/executor/sterling-step-executor.ts` | `BLOCK_REASONS.SAFETY_PREEMPTED`, `isSafetyPreemptedError`, `isNavigatingError` |
| Contract alignment tests | `packages/planning/src/modules/__tests__/contract-alignment.test.ts` | Cross-boundary normalization agreement (planning ↔ MC) |
| Leaf registration | `packages/minecraft-interface/src/server.ts` | `registerCoreLeaves` (773) |
| Movement leaves | `packages/minecraft-interface/src/leaves/movement-leaves.ts` | 3 leaves |
| Interaction leaves | `packages/minecraft-interface/src/leaves/interaction-leaves.ts` | 8 leaves |
| Sensing leaves | `packages/minecraft-interface/src/leaves/sensing-leaves.ts` | 5 leaves |
| Crafting leaves | `packages/minecraft-interface/src/leaves/crafting-leaves.ts` | 4 leaves |
| Container leaves | `packages/minecraft-interface/src/leaves/container-leaves.ts` | 4 leaves |
| Combat leaves | `packages/minecraft-interface/src/leaves/combat-leaves.ts` | 5 leaves |
| Farming leaves | `packages/minecraft-interface/src/leaves/farming-leaves.ts` | 4 leaves |
| World interaction leaves | `packages/minecraft-interface/src/leaves/world-interaction-leaves.ts` | 5 leaves |
| Construction leaves (stubs) | `packages/minecraft-interface/src/leaves/construction-leaves.ts` | 3 leaves |

---

*Last updated: 2026-02-09*
*Total leaves: 41 (37 real + 1 simplified + 3 P0 stubs)*
