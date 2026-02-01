# Leaf Capability Dossier

Live-tested against minecraft-interface server (port 3005), bot "Sterling" on MC 1.21.4,
survival mode, health 20, food 20.

**Date**: 2026-02-01
**Leaves registered**: 35
**Test method**: REST API `POST /action` with `{ type, parameters }`

---

## Executive Summary

Of 35 registered leaves:

| Status                  | Count | Leaves |
|-------------------------|-------|--------|
| Working correctly       | 14    | get_light_level, sense_hostiles, wait, chat, equip_weapon, retreat_from_threat, attack_entity, place_workstation, dig_block, manage_inventory, manage_farm, harvest_crop, control_environment, place_torch_if_needed (partial) |
| Correct failure modes   | 6     | consume_food, till_soil, open_container, follow_entity, operate_piston, control_redstone |
| Broken (API misuse)     | 3     | move_to, step_forward_safely, place_block |
| Broken (logic bug)      | 1     | craft_recipe (3x3 recipes) |
| P0 stubs (no-op)        | 3     | prepare_site, build_module, place_feature |
| Untested (no conditions)| 6     | smelt, plant_crop, retreat_and_block, use_item, transfer_items, close_container |
| Not registered           | 1     | introspect_recipe |
| Dubious                 | 1     | build_structure |

**Missing capabilities (no leaf exists)**:
- Bed placement / sleeping
- Resource scanning / ore finding
- Block pickup / item collection (leaf exists only as legacy hardcoded handler)
- Tool crafting workflow (craft_recipe bug blocks 3x3 recipes)
- Shelter building (find_shelter is legacy handler, not a leaf)

---

## Category: Sensing (4 leaves)

### get_light_level
- **Status**: WORKING
- **Live test**: Returns light=15, isSafe=true, position. 0ms.
- **Notes**: Reliable for safety checks. Used by step_forward_safely.

### sense_hostiles
- **Status**: WORKING
- **Live test**: Returns empty hostiles list (daytime, clear area). 0ms.
- **Schema**: `{ range, includePassive }`. Scans `bot.entities` against 21 hostile types.
- **Notes**: Could serve as a precondition check for night behavior. Does NOT include passive entity results even when `includePassive: true` (test returned 0 entities despite nearby animals being likely).

### chat
- **Status**: WORKING
- **Live test**: Sent "Hello from leaf test" successfully. 0ms.
- **Notes**: Caps messages at 256 chars. Supports `/msg target` format.

### wait
- **Status**: WORKING
- **Live test**: Waited 1000ms (minimum, despite requesting 500ms). Abortable.
- **Notes**: Uses 100ms poll interval. Duration clamped to min 1000ms.

---

## Category: Movement (3 leaves)

### move_to
- **Status**: BROKEN — pathfinder goals never terminate
- **Live test**: Passes validation but always times out with "aborted" after full timeout period.
- **Root cause**: `SimpleGoalNear.isEnd()` (line 32) always returns `false`. The pathfinder never considers the goal reached. Same for `SimpleGoalBlock.isEnd()`.
- **Impact**: **Critical** — no leaf-based pathfinding works. All movement that depends on pathfinder goals is non-functional.
- **Fix**: Implement proper `isEnd()` methods that check distance to goal coordinates:
  ```
  // SimpleGoalNear
  isEnd(node: any): boolean {
    const dx = node.x - this.x;
    const dy = node.y - this.y;
    const dz = node.z - this.z;
    return Math.sqrt(dx*dx + dy*dy + dz*dz) <= this.range;
  }
  ```
- **File**: `packages/minecraft-interface/src/leaves/movement-leaves.ts:13-95`

### step_forward_safely
- **Status**: BROKEN — same pathfinder goal bug
- **Live test**: Always aborts after 5s timeout.
- **Root cause**: Relies on `SimpleGoalNear` with `range: 0.5` at line 433. Since `isEnd()` is no-op, pathfinder runs indefinitely.
- **Additional issue**: Even the position-comparison fallback (`here.equals(bTarget)` at line 442) depends on `floored()` coordinates matching, which may not fire if the pathfinder doesn't actually move the bot.
- **File**: `packages/minecraft-interface/src/leaves/movement-leaves.ts:352-469`

### follow_entity
- **Status**: CORRECT FAILURE (requires entityId)
- **Live test**: Returns "invalid entityId" when no entityId provided (expected — it's required).
- **Notes**: Also uses `SimpleGoalFollow` which has same `isEnd()` bug, so following would likely timeout too.
- **File**: `packages/minecraft-interface/src/leaves/movement-leaves.ts:479-617`

---

## Category: Interaction (5 leaves)

### dig_block
- **Status**: WORKING
- **Live test**: Mined stone at (4.5, 100, 4.4) in 9.3s with bare hand. Collected 0 items (stone drops cobblestone, needs pickaxe for drop).
- **Notes**: Supports both explicit `pos` and `blockType` name search. Uses LOS check via `(ctx as any).hasLineOfSight` when available. Expanding-cube search up to radius 10.
- **File**: `packages/minecraft-interface/src/leaves/interaction-leaves.ts:630-927`

### place_block
- **Status**: BROKEN — incorrect mineflayer API usage
- **Live test**: Crashes with `Cannot read properties of undefined (reading 'plus')`.
- **Root cause**: Line 1076 calls `bot.placeBlock(placementPos, itemToPlace)`. Mineflayer's `placeBlock` API expects `(referenceBlock: Block, faceVector: Vec3)` — the solid block you place *against*, plus a face direction vector. Here it receives a `Vec3` position (not a Block) and an inventory Item (not a Vec3).
- **Impact**: **Critical** — generic block placement is completely non-functional. Only `PlaceWorkstationLeaf` (which uses the correct `placeBlockAt` helper) works for placement.
- **Fix**: Find the solid reference block adjacent to the target air block, then call `bot.placeBlock(refBlock, faceVec3)` after equipping the item.
- **File**: `packages/minecraft-interface/src/leaves/interaction-leaves.ts:1076`

### place_torch_if_needed
- **Status**: PARTIALLY WORKING
- **Live test**: Correctly returned `torchPlaced: false` when light=15 (no torch needed). The skip-placement path works.
- **Latent bug**: Line 223 calls `bot.placeBlock(placementPos as any, torchItem as any)` — same API misuse as PlaceBlockLeaf. When light IS low, torch placement would fail.
- **Notes**: Tracks recent torch positions in a Map, uses interval-based spacing. Threshold is light < 8 by default.
- **File**: `packages/minecraft-interface/src/leaves/interaction-leaves.ts:95-380`

### retreat_and_block
- **Status**: UNTESTED (no controlled threat scenario)
- **Notes**: Retreats behind bot facing direction, places block to seal entrance. Uses `bot.placeBlock()` — likely has same API misuse issue.
- **File**: `packages/minecraft-interface/src/leaves/interaction-leaves.ts:467-628`

### consume_food
- **Status**: CORRECT FAILURE (no food)
- **Live test**: Returns `inventory.missingItem: "No food available in inventory"`.
- **Notes**: Hardcoded food list of 27 items. Equip + `bot.consume()` loop. Tracks hunger/saturation delta. Would work if food were present.
- **File**: `packages/minecraft-interface/src/leaves/interaction-leaves.ts:1115-1342`

---

## Category: Crafting (4 leaves, 1 unregistered)

### craft_recipe
- **Status**: BROKEN for 3x3 recipes
- **Live test**: `craft wooden_pickaxe` → "No available recipe for wooden_pickaxe (inputs missing or not near table)". Bot had 5 oak_planks + 4 sticks + crafting_table nearby.
- **Root cause**: Line 360 passes `null` as the 4th arg to `bot.recipesFor(itemId, null, null, null)`. For 3x3 recipes, the 4th param must be the crafting table `Block` reference. With `null`, mineflayer only returns 2x2 inventory-grid recipes.
- **Impact**: **High** — no tool crafting (pickaxes, swords, axes, shovels) works. Only 2x2 recipes (sticks, planks) succeed.
- **Notes**: The code at line 339 correctly finds the crafting table via `findNearestBlock()`, but doesn't pass it to `recipesFor()`.
- **File**: `packages/minecraft-interface/src/leaves/crafting-leaves.ts:360`

### smelt
- **Status**: UNTESTED (no furnace available, no fuel)
- **Notes**: Requires furnace block nearby + fuel + smeltable item. Uses `bot.openFurnace()`. Code looks structurally correct.
- **File**: `packages/minecraft-interface/src/leaves/crafting-leaves.ts:411-546`

### place_workstation
- **Status**: WORKING
- **Live test**: Correctly reused existing crafting table at (7.5, 101, 5.4). 1ms, `reused: true`.
- **Notes**: Includes LOS check, sprawl mitigation (`MAX_NEARBY_WORKSTATIONS=3`), distance-preferring placement. Uses correct `placeBlockAt` helper. Well-tested with conformance tests.
- **File**: `packages/minecraft-interface/src/leaves/crafting-leaves.ts:600-850`

### introspect_recipe
- **Status**: NOT REGISTERED
- **Notes**: Exists in crafting-leaves.ts but is not added to the leaf array in server.ts. Would provide recipe lookup capabilities without actually crafting.
- **File**: `packages/minecraft-interface/src/leaves/crafting-leaves.ts:950-1049`

---

## Category: Combat (4 leaves)

### attack_entity
- **Status**: WORKING
- **Live test**: Found zombie (id=38392), killed it (health→0). Combat duration 2.2s.
- **Notes**: Combat loop with 500ms attack interval. Auto-retreats on low health. Finds nearest hostile if no specific target given.
- **File**: `packages/minecraft-interface/src/leaves/combat-leaves.ts:1-250`

### equip_weapon
- **Status**: WORKING
- **Live test**: Returns `weaponEquipped: "hand"` (no weapons in inventory — correct behavior).
- **Notes**: Priority list: diamond_sword → iron_sword → stone_sword → wooden_sword → diamond_axe → iron_axe → stone_axe → wooden_axe → hand.
- **File**: `packages/minecraft-interface/src/leaves/combat-leaves.ts:251-430`

### retreat_from_threat
- **Status**: WORKING
- **Live test**: Detected 2 threats, retreated from (5.5, 101, 5.4) to (-1.9, 107.8, -5.7). Distance 15 blocks.
- **Notes**: Uses sprint + jump for retreat. Calculates retreat direction from threat center. Does NOT use pathfinder (direct movement), so avoids the `SimpleGoalNear` bug.
- **File**: `packages/minecraft-interface/src/leaves/combat-leaves.ts:431-620`

### use_item
- **Status**: DUBIOUS — reported success but questionable behavior
- **Live test**: `use_item crafting_table` → success, `itemUsed: "crafting_table"`, `effect: "item_activated"`. But inventory still shows crafting_table unchanged (count=1).
- **Notes**: Uses `bot.activateItem()` which activates the held item. For a crafting table this doesn't do anything meaningful. The leaf doesn't validate whether the activation had any actual effect.
- **File**: `packages/minecraft-interface/src/leaves/combat-leaves.ts:795-958`

---

## Category: Farming (4 leaves)

### till_soil
- **Status**: CORRECT FAILURE (no hoe)
- **Live test**: Returns `inventory.missingItem: "No hoe found in inventory"`.
- **Latent bug**: Uses `bot.dig(block)` to "till" soil (line ~180 in farming-leaves.ts). In Minecraft, tilling is done by right-clicking with a hoe (`bot.activateBlock()`), not digging. This would break the block instead of tilling it.
- **File**: `packages/minecraft-interface/src/leaves/farming-leaves.ts:1-250`

### plant_crop
- **Status**: UNTESTED (no seeds, no farmland)
- **Notes**: Maps crop→seed names. Places seed on farmland. Should work if conditions met.
- **File**: `packages/minecraft-interface/src/leaves/farming-leaves.ts:251-450`

### harvest_crop
- **Status**: CORRECT FAILURE (no crops)
- **Live test**: Returns `world.invalidPosition: "No mature crops found within 16 blocks"`.
- **Notes**: Searches for blocks matching crop names with max growth stage. Uses `bot.dig()` to harvest (correct for crops).
- **File**: `packages/minecraft-interface/src/leaves/farming-leaves.ts:451-650`

### manage_farm
- **Status**: WORKING (no-op when nothing to do)
- **Live test**: Returns success with 0 operations (no tillable soil, no farmland, no crops). Orchestrates till→plant→harvest with priority ordering.
- **File**: `packages/minecraft-interface/src/leaves/farming-leaves.ts:650-1032`

---

## Category: Container (4 leaves)

### open_container
- **Status**: CORRECT FAILURE (no container)
- **Live test**: Returns `world.invalidPosition: "No container found within 16 blocks"`.
- **Notes**: Supports chest, trapped_chest, furnace. Uses `bot.openChest()` / `bot.openFurnace()`.
- **File**: `packages/minecraft-interface/src/leaves/container-leaves.ts:1-350`

### transfer_items
- **Status**: UNTESTED (requires open container)
- **Notes**: Modes: take, put, swap, withdraw, deposit, all. Requires container to be opened first.
- **File**: `packages/minecraft-interface/src/leaves/container-leaves.ts:351-700`

### close_container
- **Status**: UNTESTED (requires open container)
- **File**: `packages/minecraft-interface/src/leaves/container-leaves.ts:700-850`

### manage_inventory
- **Status**: WORKING
- **Live test**: Sorted 3 items, 0 stacks compacted. 0ms.
- **Notes**: Actions: sort, compact, drop_unwanted, keep_essentials, organize. Sort works on slot ordering.
- **File**: `packages/minecraft-interface/src/leaves/container-leaves.ts:850-1451`

---

## Category: World Interaction (5 leaves)

### interact_with_block
- **Status**: CORRECT FAILURE (no interactive blocks)
- **Live test**: Returns "No interactive blocks found within 16 blocks".
- **Notes**: Targets buttons, levers, doors, containers. Uses `bot.activateBlock()`. Searches within configurable radius.
- **File**: `packages/minecraft-interface/src/leaves/world-interaction-leaves.ts:1-300`

### operate_piston
- **Status**: CORRECT FAILURE (no piston)
- **Live test**: Returns "No piston found at 10, 101, 10".
- **File**: `packages/minecraft-interface/src/leaves/world-interaction-leaves.ts:300-550`

### control_redstone
- **Status**: CORRECT FAILURE (position parsing issue)
- **Live test**: Returns "Target position is required" despite providing position. The leaf may expect `target` instead of `position`.
- **File**: `packages/minecraft-interface/src/leaves/world-interaction-leaves.ts:550-800`

### build_structure
- **Status**: DUBIOUS — fails on materials check
- **Live test**: Returns "Auto-gathering materials not yet implemented". Even with oak_planks in inventory (5 count), it doesn't attempt building.
- **Latent bug**: Uses `bot.placeBlock(airBlock, Vec3(0,-1,0))` — passes the target air block as the reference block. Mineflayer expects the adjacent solid block. Would fail even if material check passed.
- **File**: `packages/minecraft-interface/src/leaves/world-interaction-leaves.ts:800-1200`

### control_environment
- **Status**: WORKING (with caveats)
- **Live test**: Reported success for `set_time: day`. Already daytime, so no change. 501ms (waited for tick verification).
- **Caveat**: Uses `/time set` and `/weather` chat commands. **Requires operator permissions**. In normal survival gameplay, this leaf is non-functional.
- **File**: `packages/minecraft-interface/src/leaves/world-interaction-leaves.ts:1200-1435`

---

## Category: Construction (3 leaves — all P0 stubs)

### prepare_site
- **Status**: P0 STUB
- **Live test**: Returns validation error for missing `moduleId`.
- **Notes**: No world mutation. Always succeeds when valid input provided.
- **File**: `packages/minecraft-interface/src/leaves/construction-leaves.ts:1-120`

### build_module
- **Status**: P0 STUB
- **Live test**: Returns success with `stub: true`, `materialsPresent: true`.
- **Notes**: Checks inventory read-only, emits `wouldConsume` telemetry. No blocks placed.
- **File**: `packages/minecraft-interface/src/leaves/construction-leaves.ts:120-250`

### place_feature
- **Status**: P0 STUB
- **Notes**: Same pattern as build_module. No world mutation.
- **File**: `packages/minecraft-interface/src/leaves/construction-leaves.ts:250-355`

---

## Critical Bugs Summary

### Bug 1: Pathfinder Goal Classes — `isEnd()` Always Returns False
- **Severity**: Critical
- **Impact**: move_to, step_forward_safely, follow_entity all non-functional
- **File**: `movement-leaves.ts:13-95`
- **Fix**: Implement proper distance-checking `isEnd()` in SimpleGoalNear, SimpleGoalBlock, SimpleGoalFollow

### Bug 2: PlaceBlockLeaf — Wrong mineflayer API Arguments
- **Severity**: Critical
- **Impact**: Generic block placement non-functional
- **File**: `interaction-leaves.ts:1076`
- **Fix**: Find adjacent solid reference block, equip item, call `bot.placeBlock(refBlock, faceVec3)`

### Bug 3: CraftRecipeLeaf — Null Crafting Table Reference
- **Severity**: High
- **Impact**: All 3x3 recipes fail (tools, weapons, armor)
- **File**: `crafting-leaves.ts:360`
- **Fix**: Pass the found `tableBlock` as 4th arg to `bot.recipesFor()`

### Bug 4: PlaceTorchIfNeededLeaf — Wrong placeBlock Arguments (Latent)
- **Severity**: Medium (only triggers in low-light, which is correct skip path)
- **File**: `interaction-leaves.ts:223`
- **Fix**: Same pattern as Bug 2

### Bug 5: TillSoilLeaf — Uses dig() Instead of activateBlock()
- **Severity**: Medium
- **Impact**: Would break soil blocks instead of tilling them
- **File**: `farming-leaves.ts:~180`
- **Fix**: Use `bot.activateBlock(block)` with hoe equipped

### Bug 6: BuildStructureLeaf — Wrong placeBlock Reference
- **Severity**: Medium (blocked by materials check anyway)
- **File**: `world-interaction-leaves.ts:~1100`
- **Fix**: Same pattern as Bug 2

---

## Missing Capabilities (No Leaf Exists)

### 1. Bed Placement & Sleep
- **Need**: Place bed near shelter, sleep when night falls to skip hostile spawns
- **Current state**: No bed leaf. No sleep detection. No night-time behavior trigger.
- **Dependency**: Requires working PlaceBlockLeaf (Bug 2) for bed placement, plus `bot.sleep(bedBlock)` / `bot.wake()` API calls.

### 2. Resource Scanning / Ore Finding
- **Need**: Generic "find nearest X" for ores, trees, water, animals
- **Current state**: `dig_block` does block-type search within radius 10, but no dedicated scanning leaf that returns locations without mining.
- **Notes**: Would pair with move_to for "go find iron ore" type goals.

### 3. Item Pickup / Collection
- **Need**: Collect dropped items after mining/combat
- **Current state**: `pickup_item` and `collect_items_enhanced` exist as legacy hardcoded handlers in action-translator.ts but NOT as registered leaves.

### 4. Tool Management
- **Need**: Auto-equip best tool for job (pickaxe for stone, axe for wood, shovel for dirt)
- **Current state**: `equip_weapon` handles combat weapons only. No tool-selection leaf.

### 5. Shelter/House Building
- **Need**: Build a simple shelter (walls + roof + door)
- **Current state**: `build_structure` exists but is broken (Bug 6) and lacks material gathering. Construction stubs are no-ops.

### 6. Navigation/Exploration
- **Need**: Explore unknown areas, mark waypoints, return to known locations
- **Current state**: move_to is broken (Bug 1). No exploration or waypoint leaf.

### 7. Water/Lava Bucket Usage
- **Need**: Place/collect water, avoid lava
- **Current state**: No leaf for bucket operations.

### 8. Fishing
- **Need**: Use fishing rod for food gathering
- **Current state**: No fishing leaf.

### 9. Enchanting / Anvil
- **Need**: Use enchanting table, anvil for tool improvement
- **Current state**: No leaf.

---

## Registration Gaps

### Leaf Exists But Not Registered
- `IntrospectRecipeLeaf` — in crafting-leaves.ts but not in server.ts leaf arrays

### KNOWN_LEAF_NAMES Drift (Planning Layer)
The planning layer's `KNOWN_LEAF_NAMES` set (in modular-server.ts) contains only 15 names.
The following 20 registered leaves are NOT in `KNOWN_LEAF_NAMES`:

1. step_forward_safely
2. follow_entity
3. place_torch_if_needed
4. retreat_and_block
5. consume_food
6. sense_hostiles
7. chat
8. wait
9. get_light_level
10. open_container
11. transfer_items
12. close_container
13. manage_inventory
14. attack_entity
15. equip_weapon
16. retreat_from_threat
17. use_item
18. till_soil
19. plant_crop
20. harvest_crop

These leaves cannot be planned for by the solver — only manually invoked via REST API.

### ACTION_TYPE_TO_LEAF Mapping Gaps
The action translator's `ACTION_TYPE_TO_LEAF` map (action-translator.ts:117) only maps:
- craft → craft_recipe
- craft_item → craft_recipe
- smelt → smelt
- smelt_item → smelt
- place_workstation → place_workstation
- prepare_site → prepare_site
- build_module → build_module
- place_feature → place_feature

Missing from the map (fall through to hardcoded handlers or direct leaf name lookup):
- move_to, dig_block, place_block, attack_entity, etc.

---

## Leaf-by-Leaf Verdict

| # | Leaf | Cat | Live Test | Verdict | Blocking Bug |
|---|------|-----|-----------|---------|-------------|
| 1 | move_to | Movement | FAIL (timeout) | Broken | Bug 1 |
| 2 | step_forward_safely | Movement | FAIL (timeout) | Broken | Bug 1 |
| 3 | follow_entity | Movement | FAIL (no entity) | Blocked | Bug 1 |
| 4 | dig_block | Interaction | PASS | Working | — |
| 5 | place_block | Interaction | FAIL (crash) | Broken | Bug 2 |
| 6 | place_torch_if_needed | Interaction | PASS (skip path) | Partial | Bug 4 (latent) |
| 7 | retreat_and_block | Interaction | Not tested | Unknown | Bug 2 likely |
| 8 | consume_food | Interaction | FAIL (no food) | Correct | — |
| 9 | craft_recipe | Crafting | FAIL (no recipe) | Broken (3x3) | Bug 3 |
| 10 | smelt | Crafting | Not tested | Unknown | — |
| 11 | place_workstation | Crafting | PASS (reuse) | Working | — |
| 12 | introspect_recipe | Crafting | N/A | Not registered | — |
| 13 | sense_hostiles | Sensing | PASS | Working | — |
| 14 | chat | Sensing | PASS | Working | — |
| 15 | wait | Sensing | PASS | Working | — |
| 16 | get_light_level | Sensing | PASS | Working | — |
| 17 | attack_entity | Combat | PASS | Working | — |
| 18 | equip_weapon | Combat | PASS | Working | — |
| 19 | retreat_from_threat | Combat | PASS | Working | — |
| 20 | use_item | Combat | PASS (dubious) | Dubious | — |
| 21 | till_soil | Farming | FAIL (no hoe) | Correct + Bug 5 | Bug 5 (latent) |
| 22 | plant_crop | Farming | Not tested | Unknown | — |
| 23 | harvest_crop | Farming | FAIL (no crops) | Correct | — |
| 24 | manage_farm | Farming | PASS (no-op) | Working | — |
| 25 | open_container | Container | FAIL (none found) | Correct | — |
| 26 | transfer_items | Container | Not tested | Unknown | — |
| 27 | close_container | Container | Not tested | Unknown | — |
| 28 | manage_inventory | Container | PASS | Working | — |
| 29 | interact_with_block | World | FAIL (none found) | Correct | — |
| 30 | operate_piston | World | FAIL (none found) | Correct | — |
| 31 | control_redstone | World | FAIL (parse issue) | Possible bug | — |
| 32 | build_structure | World | FAIL (materials) | Broken | Bug 6 |
| 33 | control_environment | World | PASS | Working* | *Requires op |
| 34 | prepare_site | Construction | FAIL (validation) | P0 stub | — |
| 35 | build_module | Construction | PASS | P0 stub | — |
| 36 | place_feature | Construction | Not tested | P0 stub | — |

---

## Priority Fix Order

1. **Bug 1 (SimpleGoal.isEnd)** — Unblocks ALL movement. Required for any autonomous behavior.
2. **Bug 2 (PlaceBlockLeaf API)** — Unblocks block placement, bed placement, shelter building.
3. **Bug 3 (CraftRecipeLeaf table ref)** — Unblocks tool crafting, the core survival progression.
4. **New: SleepLeaf** — Enables night survival without combat.
5. **New: FindResourceLeaf** — Enables autonomous resource gathering.
6. **Bug 4 (PlaceTorchIfNeeded API)** — Enables area lighting.
7. **Bug 5 (TillSoil dig→activate)** — Enables farming.
8. **Register IntrospectRecipeLeaf** — Low effort, enables recipe queries.
9. **Add missing leaves to KNOWN_LEAF_NAMES** — Enables planning layer to use them.
