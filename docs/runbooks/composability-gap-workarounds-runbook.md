# Composability Gap Workarounds Runbook

## Purpose
Reference for known composability gaps in the leaf pipeline, their impact on planning and execution, and practical workarounds until proper fixes land.

## Required Env

No special env vars. These workarounds apply to any environment running the full pipeline:
```bash
ENABLE_PLANNING_EXECUTOR=1
EXECUTOR_MODE=live
EXECUTOR_LIVE_CONFIRM=YES
```

## P0 Gaps -- Critical for Basic Gameplay

These gaps cause incorrect behavior or silent failures in common task flows.

### No auto-equip before mining

**Gap**: `acquire_material` digs with whatever tool is currently equipped. Mining stone with bare hands takes 5-10x longer than with a pickaxe.

**Impact**: Mining steps take excessively long or timeout. Plans that assume tool use complete slowly.

**Detection**:
```bash
# Check what bot is holding
curl -s http://localhost:3005/bot/status | jq '.heldItem'

# If null or wrong tool type, equip before mining
```

**Workaround (planner-side)**: Inject `equip_tool` step before any `acquire_material` step:
```typescript
// In step generation, prepend equip_tool
const steps = [
  { action: 'equip_tool', args: { toolType: 'pickaxe' } },
  { action: 'acquire_material', args: { item: 'stone' } },
];
```

**Workaround (manual testing)**:
```bash
# Equip pickaxe first
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"equip_tool","parameters":{"toolType":"pickaxe"}}' | jq

# Then mine
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"acquire_material","parameters":{"item":"stone"}}' | jq
```

**Proper fix (not yet implemented)**: `acquire_material` should check required tool for the target block and auto-equip before digging.

---

### Smelt doesn't check fuel

**Gap**: If inventory has no coal/charcoal, the `smelt` leaf starts the smelting process and stalls waiting for fuel that never arrives.

**Impact**: Smelt step hangs until timeout (default 30s). Task fails with timeout error.

**Detection**:
```bash
# Check inventory for fuel before smelting
curl -s http://localhost:3005/bot/status | jq '.inventory[] | select(.name == "coal" or .name == "charcoal")'
```

**Workaround (planner-side)**: Inject `acquire_material` prereq for fuel:
```typescript
const steps = [
  { action: 'acquire_material', args: { item: 'coal' } },
  { action: 'smelt', args: { input: 'iron_ore', fuel: 'coal' } },
];
```

**Workaround (manual testing)**:
```bash
# Acquire coal first
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"acquire_material","parameters":{"item":"coal"}}' | jq

# Then smelt
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"smelt","parameters":{"input":"iron_ore","fuel":"coal"}}' | jq
```

**Proper fix (not yet implemented)**: `smelt` leaf should check for fuel in inventory and fail-fast with a clear error if missing.

---

### dig_block deprecated but callable

**Gap**: `dig_block` breaks a block but does NOT auto-collect the dropped items. Plans emitting `dig_block` directly (bypassing `stepToLeafExecution` remap) will mine without collecting drops.

**Impact**: Mined items are left on the ground and despawn. Inventory count doesn't increase.

**Detection**:
```bash
# Check if dig_block is being called instead of acquire_material
tail -f packages/planning/logs/planning.log | grep "dig_block"
```

**How the remap works**: `stepToLeafExecution` in `modular-server.ts` automatically remaps `dig_block` → `acquire_material`. This only works when steps flow through the executor. Direct leaf calls bypass this.

**Workaround**: Always use `acquire_material` instead of `dig_block`. It handles both digging AND collecting:
```bash
# Use acquire_material (dig + collect)
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"acquire_material","parameters":{"item":"stone"}}' | jq
```

**Verification note**: `verifyByLeaf` auto-passes `dig_block` steps because the leaf doesn't collect items. This means `dig_block` steps always "succeed" at verification even when items are lost.

---

### Block-to-drop name mismatch in verification

**Gap**: Task step verification checks inventory for the *block* name (e.g., "stone") but the actual drop is different (e.g., "cobblestone"). Verification fails even though the item was collected.

**Impact**: Steps fail verification and retry or skip unnecessarily. Can cause extra mining runs.

**Known mismatches**:

| Block Name | Actual Drop | Notes |
|------------|-------------|-------|
| `stone` | `cobblestone` | Unless mined with Silk Touch |
| `coal_ore` | `coal` | |
| `diamond_ore` | `diamond` | |
| `lapis_ore` | `lapis_lazuli` | |
| `redstone_ore` | `redstone` | |
| `nether_gold_ore` | `gold_nugget` | |
| `grass_block` | `dirt` | |
| `oak_leaves` | (nothing or sapling) | Random drop |

**Detection**:
```bash
# Look for verification failures on mining steps
tail -f packages/planning/logs/planning.log | grep -E "Verify.*acquire_material.*FAIL"
```

**Workaround (verification-aware)**: `acquire_material` verification uses `getInventoryNamesForVerification(item, isMineStep=true)` which expands to check both the block name and common drop names. If your block-drop pair isn't covered, it will fail.

**Workaround (manual testing)**: Use the drop name directly in the `item` parameter:
```bash
# Use "cobblestone" not "stone" as the item
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"acquire_material","parameters":{"item":"cobblestone"}}' | jq
```

**Proper fix (not yet implemented)**: A block→drop name mapping table in the verification layer.

---

## P1 Gaps -- Quality of Life

These gaps cause inconvenience or suboptimal behavior but don't prevent core functionality.

### Workstation sprawl blocks crafting

**Gap**: `place_workstation` fails with `retryable: true` if there are >=3 crafting tables within 6 blocks of the bot.

**Impact**: Infinite retry loop. Bot keeps trying to place a workstation but can't because the area is already saturated.

**Detection**:
```bash
# Look for repeated place_workstation retries
tail -f packages/planning/logs/planning.log | grep "place_workstation.*retry"

# Check crafting tables nearby (manual)
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"find_resource","parameters":{"blockType":"crafting_table","maxRange":8}}' | jq
```

**Workaround**: Move the bot to a new area before crafting:
```bash
# Move away from crafting table cluster
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"move_to","parameters":{"x":100,"y":64,"z":100}}' | jq

# Then place workstation in new area
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"place_workstation","parameters":{"workstation":"crafting_table"}}' | jq
```

**Workaround (world cleanup)**: Remove excess crafting tables via Minecraft commands:
```
/fill ~-6 ~-1 ~-6 ~6 ~2 ~6 air replace crafting_table
```

**Proper fix (not yet implemented)**: "Remove old workstation" leaf or smarter placement logic that reuses existing tables.

---

### ~~build_structure no material check~~ — RESOLVED (leaf removed)

**Status**: `BuildStructureLeaf` has been deleted. The goal type `'build_structure'` now routes through the Sterling building solver, which emits modular steps (`prepare_site` → `build_module` → `place_feature`). Material pre-checking is handled by the building solver's deficit detection and `replan_building` sentinel.

---

### Construction leaves are stubs

**Gap**: `prepare_site`, `build_module`, `place_feature` return success without performing any world mutation.

**Impact**: Building solver plans execute as no-ops. The bot "builds" but nothing appears in the world.

**Detection**:
```bash
# These leaves always return success immediately
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"prepare_site","parameters":{}}' | jq '.result'
# Returns success but nothing happened in the world
```

**Workaround**: Use `place_block` for individual block placement instead of construction leaves. For complex structures, use sequences of `place_block` steps.

**Proper fix**: Implement real construction logic in each stub leaf.

---

## P2 Gaps -- Future Improvements

These are architectural improvements that would simplify planning and reduce step count.

| Gap | Description | Current Workaround |
|-----|-------------|-------------------|
| **No composite "mine with correct tool"** | `equip_tool` + `acquire_material` could be a single leaf | Planner injects separate `equip_tool` prereq step |
| **No "ensure workstation nearby"** | `craft_recipe` searches but doesn't place; `place_workstation` places but doesn't check existing | Planner injects `place_workstation` before `craft_recipe` |
| **Farming leaves partial coverage** | `till_soil`, `manage_farm` (maintain) verified. `plant_crop` has `blockUpdate` timeout bug. `harvest_crop` needs mature crop test. | Use `manage_farm` with `maintain` action for full cycle |

## Diagnostic Quick Reference

### Which gap am I hitting?

| Symptom | Likely Gap | Section |
|---------|-----------|---------|
| Mining takes forever | No auto-equip | P0: No auto-equip before mining |
| Smelt hangs then timeouts | No fuel check | P0: Smelt doesn't check fuel |
| Mined items lost on ground | dig_block used | P0: dig_block deprecated |
| Verification fails after mining | Name mismatch | P0: Block→drop name mismatch |
| Workstation placement loops | Too many tables nearby | P1: Workstation sprawl |
| Building does nothing | Stub leaves | P1: Construction stubs |
| ~~Partial structure built~~ | ~~No material pre-check~~ | ~~P1: build_structure no material check~~ (RESOLVED — leaf removed, building solver handles deficit) |

### Check which leaves are stubs

```bash
# Stubs return success without world mutation
grep -n "stub\|// stub\|// TODO" packages/minecraft-interface/src/leaves/construction-leaves.ts
```

## Bugs Fixed (2026-02-01)

These were real composability bugs found through live validation and are now resolved:

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| `acquire_material` digs but doesn't collect | Entity filter checked `e.name === 'item'` only; mineflayer 4.34 uses `e.type === 'item'` | Added `e.type === 'item'` to entity filter |
| `collect_items` walks to items but no pickup | Used `bot.lookAt() + setControlState('forward')` instead of pathfinder | Replaced with `pathfinder.goto(GoalNear(x,y,z,1))` |
| `acquire_material` finds unreachable deep blocks | Search iterated dy from -r to +r, finding blocks 4+ below bot | Capped `MIN_DY = -2` in search loop |
| Inventory delta fallback too narrow | Only checked delta when `itemEntities.length === 0` | Check delta when `collected.length === totalAcquiredBefore` |

These fixes are included in the current codebase. If you encounter similar symptoms, check that you're running the latest build.

## Key Implementation Files

| Component | File |
|-----------|------|
| Step remap (dig_block → acquire_material) | `packages/planning/src/modular-server.ts` → `stepToLeafExecution` |
| Inventory name expansion | `packages/planning/src/task-integration.ts` → `getInventoryNamesForVerification` |
| Workstation proximity check | `packages/minecraft-interface/src/leaves/crafting-leaves.ts` → `PlaceWorkstationLeaf` |
| Construction stubs | `packages/minecraft-interface/src/leaves/construction-leaves.ts` |
| Entity filter fix | `packages/minecraft-interface/src/leaves/interaction-leaves.ts` → `AcquireMaterialLeaf`, `CollectItemsLeaf` |

## Copy-Paste Commands

### Check bot inventory
```bash
curl -s http://localhost:3005/bot/status | jq '.inventory'
```

### Check bot equipped item
```bash
curl -s http://localhost:3005/bot/status | jq '.heldItem'
```

### Equip a tool before mining
```bash
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"equip_tool","parameters":{"toolType":"pickaxe"}}' | jq
```

### Find nearby blocks of a type
```bash
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"find_resource","parameters":{"blockType":"crafting_table","maxRange":8}}' | jq
```

### Check if fuel exists before smelting
```bash
curl -s http://localhost:3005/bot/status | jq '[.inventory[] | select(.name == "coal" or .name == "charcoal")] | length'
```

---

## Related Runbooks

- **[leaf-creation-runbook.md](./leaf-creation-runbook.md)**: Phase 4.2 covers documenting new composability gaps
- **[debugging-leaf-dispatch-runbook.md](./debugging-leaf-dispatch-runbook.md)**: Stage 7 covers leaf execution failures caused by these gaps
- **[receipt-anchored-verification-runbook.md](./receipt-anchored-verification-runbook.md)**: Block→drop name mismatch affects placement verification too

---

*Last updated: 2026-02-14*
*Source: `docs/leaf-execution-pipeline.md` → Known Composability Gaps section, Bugs Fixed section*
