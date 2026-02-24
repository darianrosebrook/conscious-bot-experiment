# Runtime Capture Analysis — 2026-02-15/16

## Capture 4 — Post P1-A + P1-B fix (pickup confirm + place_block candidates)

**Capture window**: `00:46:40Z` to `00:53:30Z` (~7 minutes)
**Biome**: Plains/forest (birch/oak/spruce trees)
**Source**: `run.log` (1982 lines)
**Fixes deployed since Capture 3**: P1-A (bounded confirm-pickup loop + micro-shuffle + `pickup_diag` diagnostics), P1-B (floored block coords + REPLACEABLE set + wider candidate search + block grid diagnostics), `LOG_VERIFY_PASSES=1`

---

### Executive Summary

3 task incarnations executed. 0 completed. **The crafting pipeline is now fully functional** — 5/5 craft_recipe calls succeeded AND verified (first capture with 8/8 `verifyInventoryDelta` PASS lines visible via `LOG_VERIFY_PASSES`). Task 1 reached **80% completion** (8/10 steps — highest ever), completing the full material chain for a wooden_pickaxe: birch_log → planks → crafting_table → birch_log → planks → sticks → birch_log → planks. It was blocked at the **final `place_block(crafting_table)` step** by Mineflayer's `blockUpdate` timeout.

The sole remaining P0 blocker is `place_block` failing with `Event blockUpdate did not fire within timeout of 5000ms`. This is NOT the candidate selection issue (P1-B fix worked — positions are found successfully). It's a Mineflayer placement confirmation failure, likely because the bot wasn't looking at the reference block face.

| Task (short ID) | Plan | Steps Reached | Outcome | Failure Point |
|---|---|---|---|---|
| `ling_ir:bc06` | acquire → craft planks → craft table → acquire → craft planks → craft sticks → acquire → craft planks → place table → craft pickaxe (10 steps) | 8/10 (80%) | **FAILED** | `place_block(crafting_table)` — blockUpdate timeout x2 |
| `ling_ir:c7c9` | place table → craft pickaxe (2 steps, reduced) | 0/2 (0%) | **FAILED** | `place_block(crafting_table)` — blockUpdate timeout x3 |
| `ling_ir:0307` | place table → craft pickaxe (2 steps, reduced) | 0/2 (0%) | **FAILED** | `place_block(crafting_table)` — blockUpdate timeout x3 |

---

### Fix Validation

#### P0-A + P0-B (suffix stripping + live inventory): VALIDATED (cumulative)

**8 `[verifyInventoryDelta] PASS` lines emitted** (first capture with `LOG_VERIFY_PASSES=1`):

| Item | Accepted | Before→After | Delta | Settle |
|---|---|---|---|---|
| `birch_log` | `[birch_log,log,wood]` | 0→1 | 1 | 1 poll, 5ms |
| `birch_planks` | `[birch_planks]` | 0→4 | 4 | 1 poll, 5ms |
| `crafting_table:v9` | `[crafting_table]` | 0→1 | 1 | 1 poll, 6ms |
| `birch_log` | `[birch_log,log,wood]` | 0→1 | 1 | 1 poll, 6ms |
| `birch_planks` | `[birch_planks]` | 0→4 | 4 | 1 poll, 5ms |
| `stick:v9` | `[stick]` | 0→4 | 4 | 1 poll, 6ms |
| `birch_log` | `[birch_log,log,wood]` | 0→1 | 1 | 1 poll, 5ms |
| `birch_planks` | `[birch_planks]` | 2→6 | 4 | 1 poll, 6ms |

All settle in 1 poll / 5-6ms. Live HTTP `/inventory` reads return fresh data instantly. Zero verify FAILs.

#### P1-A (pickup confirm loop): PARTIALLY VALIDATED

**1 `pickup_diag` diagnostic emitted** on a failure:
```
[acquire_material] pickup_diag: target=birch_log digPos=(-112.5,84.0,-206.5)
  distAtEnd=12.5 eventFired=false confirmPolls=10 nearbyItemEntities=0 invDelta=none
```

The diagnostic reveals the root cause: `distAtEnd=12.5` — the bot was 12.5 blocks from the dig site, far outside pickup range (~2 blocks). This isn't a timing race; the bot dug a block at height (the tree was tall) and never walked beneath it. The 500ms confirm loop correctly exhausted and reported the failure with actionable data.

**acquire_material: 3 successes / 1 pickup failure / 1 abort = 60% success rate** (same as C3 — pickup fix didn't help this specific failure mode which is about distance, not timing).

#### P1-B (place_block candidate selection): VALIDATED

**"No suitable placement position nearby" did NOT occur** — the floored coordinates + REPLACEABLE set + wider search successfully found placement positions. The `[place_block] No suitable position` diagnostic never fired. All failures are now at the Mineflayer API level (blockUpdate timeout), not candidate selection.

---

### Failure Category

#### F1. `place_block` blockUpdate Timeout — SOLE P0 BLOCKER

**Impact**: 8/8 place_block attempts failed. Killed all 3 tasks. The only thing between the bot and a completed wooden_pickaxe.

**Error** (identical all 8 times):
```
Event blockUpdate:(-114, 79, -206) did not fire within timeout of 5000ms
```

**Analysis**: Mineflayer's `bot.placeBlock(refBlock, faceVec)` sends a placement packet and waits for the server to confirm via a `blockUpdate` event. The event never fires, suggesting the server silently rejected the placement. Most likely cause: the bot wasn't facing the reference block when `placeBlock` was called (Minecraft requires the client to be looking at the target face).

**Post-capture fixes applied (not yet validated)**:
1. Added `bot.lookAt(refCenter)` before `bot.placeBlock()` — ensures the bot faces the reference block
2. Added try/catch around `placeBlock` with post-timeout verification: if the blockUpdate times out but `bot.blockAt(target)` shows the item was placed, treat as success
3. Added `placement_diag` structured logging on failure: item, target pos, ref block, face vector, distance, current block at target

---

### Timeline (Condensed)

```
00:46:40  System startup
00:47:00  Task ling_ir:bc06 created (10-step wooden_pickaxe plan)
00:47:10  acquire_material(birch_log) FAIL — abort timeout (15s)
00:47:30  acquire_material(birch_log) FAIL — pickup_failed_after_dig (dist=12.5)
00:47:45  acquire_material(birch_log) SUCCESS → 10%
00:47:50  craft_recipe(birch_planks) SUCCESS, verify PASS (5ms) → 20%
00:47:55  craft_recipe(crafting_table:v9) SUCCESS, verify PASS (6ms) → 30%
00:48:10  acquire_material(birch_log) SUCCESS → 40%
00:48:15  craft_recipe(birch_planks) SUCCESS, verify PASS (5ms) → 50%
00:48:20  craft_recipe(stick:v9) SUCCESS, verify PASS (6ms) → 60%
00:48:40  acquire_material(birch_log) SUCCESS → 70%
00:48:45  craft_recipe(birch_planks) SUCCESS, verify PASS (6ms) → 80%
00:48:50  place_block(crafting_table) FAIL — blockUpdate timeout (5s)
00:49:00  place_block(crafting_table) FAIL — blockUpdate timeout (5s)
00:49:05  Task ling_ir:bc06 FAILED at 80%
00:52:04  Task ling_ir:c7c9 created (2-step plan: place + craft)
00:52:04  place_block x3 FAIL → FAILED at 0%
00:52:40  Task ling_ir:0307 created (2-step plan: place + craft)
00:53:05  place_block x3 FAIL → FAILED at 0%
00:53:10  LoopBreaker:shadow fired (3 occurrences)
00:53:30  Session idle, dedup cooldown active
```

---

### Priority Fix Recommendations (Updated)

| Priority | Issue | Impact | Fix Applied | Status |
|---|---|---|---|---|
| ~~P0-A~~ | `:v\d+` suffix | ~~Blocks crafting~~ | Suffix stripping | **FIXED (C2+)** |
| ~~P0-B~~ | Stale inventory | ~~100% verify FAIL~~ | Live HTTP reads | **FIXED (C3+)** |
| **P0-C** | `place_block` blockUpdate timeout | Blocks table placement → blocks all tool crafting | `lookAt` + timeout recovery + diagnostics | Applied, needs validation |
| **P1** | `pickup_failed_after_dig` (distance, not timing) | 40% acquire_material failure rate | Bot needs to walk to drop after digging high blocks | Open |
| **P2** | LoopBreaker still shadow-only | Detects but doesn't prevent doom loops | Enforcement mode | Deferred |

---

---

## Capture 3 — Post P0-A + P0-B fix (suffix stripping + live inventory reads)

**Capture window**: `20:41:14Z` to `20:48:10Z` (~7 minutes)
**Biome**: Plains/forest (birch trees)
**Source**: `run.log` (2042 lines)
**Fixes deployed since Capture 2**: P0-B — removed stale `worldStateManager` cached inventory provider, added 500ms settle barrier in `verifyInventoryDelta`. Verification now reads live from HTTP `/inventory`.

---

### Executive Summary

4 task incarnations executed. 2 exploration tasks completed, 2 Sterling craft plans failed. **P0-A and P0-B are both validated: zero `verifyInventoryDelta` FAIL lines in the entire log.** All 5 craft_recipe calls succeeded at the Minecraft layer AND passed verification silently (no settle needed — live HTTP reads returned fresh data on the first poll). Tasks advanced through craft steps without friction.

The remaining blockers are **gameplay-layer failures** — `pickup_failed_after_dig` (60% failure rate on acquire_material) and `place_block` unable to find placement position — not verification or planning bugs.

| Task (short ID) | Plan | Steps Reached | Outcome | Failure Point |
|---|---|---|---|---|
| `ling_ir:6323` | acquire birch_log → craft → … (10 steps) | 0/10 (0%) | **FAILED** | `acquire_material(birch_log)` — 4 consecutive fails (no_path, abort, abort, pickup_failed) |
| Explore: move_to (-466, 345) | 1 step | 1/1 (100%) | **COMPLETED** | D* Lite nav: 21 steps, 2679ms |
| `ling_ir:1be2` | craft planks → craft table → acquire → craft planks → craft stick → acquire → … (9 steps) | 5/9 (56%) | **FAILED** | `acquire_material(birch_log)` step 6 — `pickup_failed_after_dig` after 1 retry |
| `ling_ir:480a` | acquire → craft planks → place table → craft pickaxe (4 steps, reduced) | 2/4 (50%) | **FAILED** | `place_block(crafting_table)` — 3x "No suitable placement position nearby" |

**Success rate**: 2/4 tasks completed (exploration only; 0 craft plans completed end-to-end)

---

### P0-A + P0-B Fix Validation

#### P0-A (variant suffix stripping): VALIDATED

Sterling emits `:v9` suffixes this session. Stripping works at both boundaries:

```
[StepDispatch] args={"recipe":"crafting_table:v9","qty":1}
[toolExecutor] → craft_recipe args={"recipe":"crafting_table","qty":1,"_recipe_raw":"crafting_table:v9"}
```

The `accepted=` arrays in verification START lines show clean names:
```
[Verify:acquire_material] START item=birch_log accepted=[birch_log,log,wood]
```

No `:v\d+` suffix leaks into any accepted list.

#### P0-B (live inventory reads + settle barrier): VALIDATED

**Zero `[verifyInventoryDelta] FAIL` lines in the entire 2042-line log.** This is the first capture with zero craft verification failures.

Evidence of the fix working — the craft→verify→advance sequence for each craft step:

| Line | Event | Result |
|------|-------|--------|
| 1071 | `craft_recipe(birch_planks)` status=success (50ms) | MC OK |
| 1073 | `[toolExecutor] ← craft_recipe ok (53ms)` | |
| 1074 | `/inventory endpoint called` | Live HTTP read |
| 1077 | `Task progress updated: 11%` | **Verify PASSED — step advanced** |
| | | |
| 1127 | `craft_recipe(crafting_table)` status=success (193ms) | MC OK |
| 1129 | `[toolExecutor] ← craft_recipe ok (196ms)` | |
| 1130 | `/inventory endpoint called` | Live HTTP read |
| 1133 | `Task progress updated: 22%` | **Verify PASSED — step advanced** |
| | | |
| 1416 | `craft_recipe(birch_planks)` status=success (51ms) | MC OK |
| 1418 | `[toolExecutor] ← craft_recipe ok (56ms)` | |
| 1419 | `/inventory endpoint called` | Live HTTP read |
| 1422 | `Task progress updated: 44%` | **Verify PASSED — step advanced** |
| | | |
| 1477 | `craft_recipe(stick)` status=success (98ms) | MC OK |
| 1479 | `[toolExecutor] ← craft_recipe ok (102ms)` | |
| 1480 | `/inventory endpoint called` | Live HTTP read |
| 1483 | `Task progress updated: 56%` | **Verify PASSED — step advanced** |
| | | |
| 1805 | `craft_recipe(birch_planks)` status=success (49ms) | MC OK |
| 1807 | `[toolExecutor] ← craft_recipe ok (52ms)` | |
| 1808 | `/inventory endpoint called` | Live HTTP read |
| 1811 | `Task progress updated: 50%` | **Verify PASSED — step advanced** |

**5/5 craft_recipe calls verified successfully. 0 settle polls needed** (the live HTTP `/inventory` endpoint returned fresh data on the first read — the settle barrier was not activated). 37 total `/inventory` HTTP endpoint calls observed, confirming the cached provider is fully bypassed.

Compare to Capture 2: every craft verify showed `before=0 after=0` FAIL. Compare to Capture 1: every craft verify showed `:v10` suffix mismatch FAIL. Both bugs are eliminated.

---

### Remaining Failure Categories

#### F1. `pickup_failed_after_dig` — DOMINANT FAILURE (persists from Capture 2)

**Impact**: 5 failures out of 8 `acquire_material` attempts (63% failure rate). Killed task `ling_ir:6323` at 0% and task `ling_ir:1be2` at 56%.

Evidence:
```
[MC/leaf] acquire_material status=failure duration=14012ms reason=pickup_failed_after_dig
  block_broken=true acquire_material_count=0
```

The bot breaks the birch_log block (block_broken=true) but fails to collect the dropped item. This is the **highest-impact remaining issue**: if acquire_material had even 80% reliability, task `ling_ir:1be2` (which reached 56% with 5/5 crafts verified) would likely have completed a wooden_pickaxe.

#### F2. `place_block` — "No suitable placement position nearby" (NEW)

**Impact**: 3 consecutive failures, killed task `ling_ir:480a` at 50%

Evidence:
```
[toolExecutor] → place_block args={"block_type":"crafting_table","count":1,"placement":"around_player"}
[leaf-dispatch] deprecated param 'placement' for place_block → place_block
[MC/leaf] place_block status=failure duration=0ms
[toolExecutor] ← place_block FAIL (5ms) error=No suitable placement position nearby
```

The bot was at position (-472.7, 71, 349.6) and the `place_block` leaf couldn't find a suitable adjacent block face. The deprecated `placement: "around_player"` parameter is being sent but may not be correctly interpreted. Duration=0ms suggests the leaf rejected immediately without attempting placement.

#### F3. `no_path_to_block` + abort timeouts — MODERATE

**Impact**: 3 of 4 first-attempt acquire_material failures on task `ling_ir:6323`

Evidence:
```
[toolExecutor] ← acquire_material FAIL (13044ms) error=Digging aborted reason=no_path_to_block
[toolExecutor] ← acquire_material FAIL (15056ms) error=This operation was aborted
```

The bot found birch_log blocks but couldn't navigate to them. This may be terrain-related (the bot position suggests flat plains, but nearby blocks might be obstructed).

---

### Loop Detection

Two LoopBreaker signatures triggered:

1. `signatureId=a3cbcb71e955ad37` (3 occurrences) — the three Sterling craft plans that all attempted wooden_pickaxe and failed at different stages.
2. `signatureId=6ff845505d2fa93d` (3 occurrences) — dedup phantom entries from idle-episode thoughts suppressed by cooldown.

The 120s dedup cooldown correctly prevented immediate task re-creation after the third plan failure. The session ended in idle state with no active tasks.

---

### Phase 1 + P0-A + P0-B Fix Validation (Cumulative)

| Fix | Evidence in Capture 3 | Status |
|---|---|---|
| **P0-A: `:v\d+` suffix stripping** | `accepted=[birch_log,log,wood]`, `_recipe_raw=crafting_table:v9` | **VALIDATED** |
| **P0-B: Live inventory reads** | 37 HTTP `/inventory` calls, 0 verify FAILs, 5/5 craft verifies pass | **VALIDATED** |
| **P0-B: Settle barrier** | Not needed — live reads returned fresh data on first poll | **VALIDATED (not activated)** |
| Recovery state cleared on success | No stale recovery metadata | Likely working |
| Vitals header alignment | Not exercised (health=20 throughout) | Untested |
| Threat policy | 4-8 entities fail LOS checks, level=low, no action taken | Working as expected |
| Dedup cooldown | 120s cooldown blocks rapid task re-creation | **VALIDATED** |

---

### Priority Fix Recommendations (Updated from Capture 2)

| Priority | Issue | Impact | Fix Location | Status |
|---|---|---|---|---|
| ~~**P0-A**~~ | ~~`:v\d+` suffix mismatch~~ | ~~Blocks all crafting~~ | ~~verifyInventoryDelta~~ | **FIXED + VALIDATED** |
| ~~**P0-B**~~ | ~~Stale inventory snapshot~~ | ~~100% verify failure rate~~ | ~~inventory provider~~ | **FIXED + VALIDATED** |
| **P1** | `pickup_failed_after_dig` (63% failure rate) | Blocks acquire_material, kills multi-step plans | `acquire_material` leaf — improve post-dig item collection | Open |
| **P1** | `place_block` "No suitable position" | Kills plans at table placement step | `place_block` leaf — position finding logic | Open |
| **P2** | `no_path_to_block` / abort timeouts | Wastes retries on acquire_material | Pathfinding or search radius tuning | Open |
| **P3** | LoopBreaker still shadow-only | Detects loops but doesn't prevent re-creation | LoopBreaker enforcement mode | Deferred |

---

### Timeline (Condensed)

```
20:41:14  System startup begins
20:41:20  All services healthy (10/10)
20:42:14  Task ling_ir:6323 created (10-step plan: wooden_pickaxe)
20:42:20  acquire_material(birch_log) FAIL — no_path_to_block (13s)
20:42:37  acquire_material(birch_log) FAIL — abort timeout (15s)
20:42:54  acquire_material(birch_log) FAIL — abort timeout (15s)
20:43:05  acquire_material(birch_log) FAIL — pickup_failed_after_dig (10s)
20:43:06  Task ling_ir:6323 FAILED at 0%
20:43:15  Explore task created → move_to (-466, 345)
20:43:18  Explore COMPLETED (2679ms, D* Lite 21 steps)
20:43:50  Task ling_ir:1be2 created (9-step plan: wooden_pickaxe)
20:43:54  craft_recipe(birch_planks) MC OK (50ms), verify PASS → 11%
20:44:00  craft_recipe(crafting_table:v9) MC OK (193ms), verify PASS → 22%
20:44:10  acquire_material(birch_log) FAIL — pickup_failed_after_dig (14s)
20:44:25  acquire_material(birch_log) FAIL — pickup_failed_after_dig (7.5s)
20:44:37  acquire_material(birch_log) SUCCESS (3770ms) → 33%
20:44:42  craft_recipe(birch_planks) MC OK (51ms), verify PASS → 44%
20:44:50  craft_recipe(stick:v9) MC OK (98ms), verify PASS → 56%
20:45:05  acquire_material(birch_log) FAIL — pickup_failed_after_dig (11s)
20:45:06  Task ling_ir:1be2 FAILED at 56%
20:46:50  Task ling_ir:480a created (4-step plan, reduced from inventory)
20:47:05  acquire_material(birch_log) SUCCESS (6744ms) → 25%
20:47:10  craft_recipe(birch_planks) MC OK (49ms), verify PASS → 50%
20:47:14  place_block(crafting_table) FAIL — "No suitable placement position" (5ms)
20:47:39  place_block(crafting_table) FAIL — retry (6ms)
20:47:45  place_block(crafting_table) FAIL — retry (4ms)
20:47:51  Task ling_ir:480a FAILED at 50% — LoopBreaker:shadow 3 occurrences
20:48:01  Session idle, no active tasks. Dedup cooldown blocks retry.
20:48:10  Capture ends
```

---

---

## Capture 2 — Post P0-A fix (variant suffix stripping)

**Capture window**: ~19:20Z to ~19:55Z (~35 minutes)
**Biome**: Plains/forest (oak trees)
**Source**: `run.log` (4395 lines)
**Fixes deployed since Capture 1**: P0-A — `:v\d+` suffix stripping in `getInventoryNamesForVerification` and `buildInventoryIndex`

---

### Executive Summary

4 task incarnations executed. 0 completed, 2 failed, 2 blocked/stalled. The P0-A suffix fix is **validated** — `accepted=` arrays now show stripped names (`[crafting_table]` not `[crafting_table:v11]`), and all 4 craft calls succeeded at the Minecraft layer. The `:v10` cascade (craft → verify FAIL → retry → no_recipe_available) is **eliminated**.

However, a new dominant failure emerged: **every `verifyInventoryDelta` call returns FAIL** with `before=0 after=0`, even for non-suffixed items. The inventory snapshot is consistently one step behind actual inventory state. This is a stale-snapshot timing bug (promoted to new P0-B).

Despite 0% verification pass rate, the task executor treats verify FAILs as non-blocking warnings and advances steps. Task `ling_ir:901e` reached **60% completion** (6/10 steps) — the furthest any multi-step plan has progressed.

| Task (short ID) | Plan | Steps Reached | Outcome | Failure Point |
|---|---|---|---|---|
| `ling_ir:552d` | explore_for_resources (1 step) | 1/1 | **FAILED** | 37/37 waypoints explored, 0 target blocks found (treeless area) |
| `ling_ir:97de` | acquire → craft → … (10 steps) | 1/10 (0%) | **FAILED** | `acquire_material(oak_log)` — 3x `pickup_failed_after_dig` |
| `ling_ir:901e` | acquire → craft planks → craft table → … (10 steps) | 7/10 (60%) | **BLOCKED** | `acquire_material(oak_log)` — `no_blocks_found` (oak trees mined out) |
| `ling_ir:7815` | acquire → craft → … (4 steps, reduced from inventory) | 1/4 (0%) | **STALLED** | `acquire_material(oak_log)` — `no_blocks_found`, recovery explore failed |

**Success rate**: 0/4 tasks completed (but 60% progress on best task — significant improvement)

---

### P0-A Fix Validation

**Status: FIXED.** The variant suffix stripping is working at both layers:

1. **Craft dispatch**: `:v11` stripped before sending to Minecraft
   ```
   [toolExecutor] → craft_recipe args={"recipe":"crafting_table","qty":1,"_recipe_raw":"crafting_table:v11"}
   ```

2. **Verification accepted list**: Suffix stripped in `getInventoryNamesForVerification`
   ```
   [verifyInventoryDelta] FAIL item=crafting_table:v11 accepted=[crafting_table] ...
   [verifyInventoryDelta] FAIL item=stick:v11 accepted=[stick] ...
   ```
   The `accepted=` array shows `[crafting_table]` not `[crafting_table:v11]`. Compare to Capture 1 where it showed `accepted=[stick:v10]`.

3. **Cascade eliminated**: No `no_recipe_available` failures caused by ingredient consumption from verify-FAIL retries. All 4 craft_recipe calls succeeded on first attempt.

**Note**: Sterling variant numbering bumped from `:v10` to `:v11` between captures.

---

### Failure Categories

#### F1. Stale Inventory Snapshot — NEW DOMINANT FAILURE (was F5 in Capture 1, now P0-B)

**Impact**: 100% verification failure rate (0 PASSes in entire 4395-line log)
**Root cause**: `verifyInventoryDelta` reads inventory immediately after craft completes, but the snapshot is consistently one step behind actual state. The `inventoryKeys` field reveals the lag:

| Craft Operation | Expected in Inventory | inventoryKeys Shows |
|---|---|---|
| `craft_recipe(oak_planks)` | oak_planks | `[oak_log]` (input, not output) |
| `craft_recipe(crafting_table)` | crafting_table | `[oak_planks]` (previous output) |
| `craft_recipe(oak_planks)` 2nd | oak_planks | `[crafting_table,oak_log]` |
| `craft_recipe(stick)` | stick | `[crafting_table,oak_planks]` |

Evidence:
```
[verifyInventoryDelta] FAIL item=oak_planks accepted=[oak_planks] before=0 after=0 delta=0 need=1
  hasSnapshot=true breakdown=[oak_planks(before=0,after=0)] inventoryKeys=[oak_log]
```

The Minecraft layer confirms every craft succeeded (`status=success`, `craft_recipe_duration_ms` of 39-207ms). The `WorldStateManager.inventoryCount` increments correctly (0→1→2→3→4). But the verification snapshot reads pre-craft state.

**Classification**: Race condition between craft completion and inventory snapshot capture. The system advances steps despite verify FAILs (non-blocking), which is why the plan still progresses.

**Fix scope**: Add a short delay (100-200ms) before the post-craft inventory poll in `verifyInventoryDelta`, or await an inventory-change event from mineflayer before snapshotting.

---

#### F2. `pickup_failed_after_dig` — HIGH IMPACT

**Impact**: 3 consecutive failures on task `ling_ir:97de`, causing task termination at 0%
**Root cause**: The bot breaks oak_log blocks (block_broken events confirmed) but fails to collect the dropped items. `acquire_material_count = 0` after each dig.

Evidence:
```
[MC/leaf] acquire_material status=failure duration=3762ms reason=pickup_failed_after_dig
  block_broken=true acquire_material_count=0
```

Three consecutive failures exhaust retries, killing the task before any crafting can begin.

**Classification**: Item pickup reliability issue. The bot navigates to the block, digs it, but doesn't walk to the dropped item or the item despawns/falls somewhere inaccessible.

**Fix scope**: The `acquire_material` leaf should add a small movement toward the drop position after digging, or retry pickup with a wider collection radius.

---

#### F3. Resource Depletion (`no_blocks_found`) — MODERATE IMPACT

**Impact**: Task `ling_ir:901e` blocked at 60% progress, task `ling_ir:7815` stalled at 0%
**Root cause**: After the bot mines nearby oak trees (steps 1, 4), no more `oak_log` blocks exist within the 32-block search radius. The recovery `explore_for_resources` finds 3 items on first attempt but zero on second (29/29 waypoints, 0 items).

Evidence:
```
[MC/leaf] acquire_material status=failure reason=no_blocks_found target=oak_log search_radius=32
```

**Classification**: Environmental exhaustion. The bot depleted local resources and has no long-range exploration to find new trees. The broadened recovery passes `resource_tags: undefined` and `targetItems: undefined`, searching for nothing specific.

**Fix scope**: Recovery explore should inherit the target item name (`oak_log`) from the failed step. The search radius could also expand progressively (32 → 64 → 128).

---

#### F4. Exploration in Treeless Area — MODERATE IMPACT

**Impact**: Task `ling_ir:552d` failed after 3 full spiral explorations (37/37 waypoints each), 0 items found
**Root cause**: Bot spawned at (-354.5, 82, -1168.5) in an area with no trees. All exploration cycles completed without finding any of the 12 target log types. Required manual player teleport to move bot near oak trees.

**Classification**: Spawn-location problem. The bot has no mechanism to detect "this area has no resources" and move to a fundamentally different location.

**Status**: Resolved by manual teleport. Not a code bug — a strategic planning gap.

---

#### F5. Keepalive Thought Dropped (`dropped_no_goal_prop`) — RECURRING

**Impact**: 2 dropped thoughts across the session
**Root cause**: Same as Capture 1 — keepalive thoughts have `committed_goal_prop_id = null`.
**Status**: Acceptable at current health levels (health=20 throughout).

---

#### F6. Pathfind Timeout — LOW IMPACT

**Impact**: 1 pathfind timeout, bot attempted dig anyway
**Root cause**: `"Took too long to decide path to goal!"` — D* Lite planner exceeded time budget.

Evidence:
```
[AcquireMaterial] Pathfind failed (Took to long to decide path to goal!), attempting dig anyway
```

**Status**: Non-blocking — the bot fell through to direct dig, which succeeded.

---

### Success Events

#### S1. Craft Pipeline (task `ling_ir:901e` — 60% completion)

The longest successful execution chain observed:
1. `acquire_material(oak_log)` — SUCCESS (3762ms harvest)
2. `craft_recipe(oak_planks)` — MC SUCCESS (62ms), verify FAIL (stale snapshot)
3. `craft_recipe(crafting_table:v11)` — MC SUCCESS (206ms), verify FAIL
4. `acquire_material(oak_log)` — SUCCESS, verify FAIL
5. `craft_recipe(oak_planks)` — MC SUCCESS (39ms), verify FAIL
6. `craft_recipe(stick:v11)` — MC SUCCESS (89ms), verify FAIL
7. `acquire_material(oak_log)` — BLOCKED (no_blocks_found)

Inventory grew from 0 to 4 items. All crafts produced correct outputs. The plan was 2 steps from completing a `wooden_pickaxe` — blocked only by resource depletion.

#### S2. Recovery Exploration

The `reposition_or_rescan` recovery mechanism worked once: found 3 items after 1 waypoint when the first `no_blocks_found` occurred. This is the first evidence of the recovery system successfully finding resources.

#### S3. Dedup Cooldown

The `suppressed_dedup` mechanism correctly prevented immediate re-creation of failed task categories (120s cooldown). This avoided rapid-fire task incarnation that would consume the same depleted resources.

---

### Loop Detection

No LoopBreaker signatures triggered in this capture. The dedup cooldown (120s) appears to be preventing the rapid task re-creation that previously generated loop signatures.

---

### Phase 1 + P0-A Fix Validation

| Fix | Evidence in Capture | Status |
|---|---|---|
| **P0-A: `:v\d+` suffix stripping** | `accepted=[crafting_table]` not `[crafting_table:v11]` | **VALIDATED** — suffix stripped correctly |
| **P0-A: Cascade elimination** | No `no_recipe_available` from consumed inputs | **VALIDATED** — retries don't waste ingredients |
| Recovery state cleared on success | No stale recovery metadata observed | Likely working |
| Rate limiter stamped before call | No duplicate vitals reroutes | Likely working (vitals healthy) |
| Timestamp floor | No immediate TTL expiry | Likely working |
| Vitals header alignment | Not exercised (health=20 throughout) | Untested |
| Threat policy | Threats detected but low-level, no action taken | Working as expected |

---

### Priority Fix Recommendations (Updated)

| Priority | Issue | Impact | Fix Location |
|---|---|---|---|
| **P0-B** | F1: Stale inventory snapshot (before=0 after=0 on every craft) | 100% verify failure rate, blocks reliable step advancement | `verifyInventoryDelta` — add delay or await inventory event |
| **P1** | F2: `pickup_failed_after_dig` (block broken, item not collected) | Blocks acquire_material, killed 1 task | `acquire_material` leaf — improve post-dig item collection |
| **P1** | F3: Resource depletion with no effective recovery | Blocked best task at 60% | Recovery explore — pass target item name, expand search radius |
| **P2** | F4: No strategic relocation from resource-dead areas | Requires manual teleport | Planning layer — detect empty-area signal |
| **P3** | F6: Pathfind timeout on some navigation | Non-blocking, falls through to direct dig | Pathfinder timeout tuning |

---

### Timeline (Condensed)

```
~19:20    System startup, bot at (-354.5, 82, -1168.5) — treeless area
~19:22    Task ling_ir:552d created (explore_for_resources)
~19:23    Explore spiral 1: 37/37 waypoints, 0 items
~19:26    Explore spiral 2: 37/37 waypoints, 0 items
~19:29    Explore spiral 3: 37/37 waypoints, 0 items
~19:32    Task ling_ir:552d FAILED at 0%
~19:33    Dedup cooldown blocks immediate retry
~19:37    Manual teleport: bot moved to (-340.5, 88, -1163) near oak trees
~19:38    Task ling_ir:97de created (10-step plan: wooden_pickaxe)
~19:38    acquire_material(oak_log) — pathfind timeout, dig anyway
~19:39    acquire_material(oak_log) FAIL — pickup_failed_after_dig (3 consecutive)
~19:40    Task ling_ir:97de FAILED at 0%
~19:42    Task ling_ir:901e created (10-step plan: wooden_pickaxe)
~19:42    acquire_material(oak_log) SUCCESS — harvest_complete 3762ms
~19:43    craft_recipe(oak_planks) MC SUCCESS (62ms), verify FAIL (stale snapshot)
~19:43    craft_recipe(crafting_table:v11) MC SUCCESS (206ms), verify FAIL
~19:44    acquire_material(oak_log) SUCCESS, verify FAIL
~19:44    craft_recipe(oak_planks) MC SUCCESS (39ms), verify FAIL
~19:45    craft_recipe(stick:v11) MC SUCCESS (89ms), verify FAIL
~19:45    Task ling_ir:901e at 60% — step 7 acquire_material(oak_log)
~19:46    acquire_material FAIL — no_blocks_found (oak trees mined out)
~19:46    Recovery explore: found 3 items at 1st waypoint
~19:47    acquire_material retry FAIL — no_blocks_found again
~19:47    Broadened recovery: 29/29 waypoints, 0 items (target undefined)
~19:48    Task ling_ir:901e BLOCKED at 60% — blocked_on_prereq
~19:50    Task ling_ir:7815 created (4 steps, reduced from existing inventory)
~19:50    acquire_material(oak_log) FAIL — no_blocks_found
~19:51    Recovery explore failed, 60s backoff
~19:55    Session stalled — no oak_log in range, inventoryCount=4
```

---

---

## Capture 1 — Pre-P0-A fix (baseline)

**Capture window**: `18:40:03Z` to `18:49:36Z` (~9.5 minutes)
**Biome**: Snowy taiga
**Source**: `run.log` (2639 lines)

---

### Executive Summary

5 task incarnations executed. 1 completed, 4 failed. The bot successfully chopped wood, crafted planks, crafted a crafting table, placed the table, and escaped a creeper — but **most multi-step plans fail at crafting verification or navigation**.

| Task (short ID) | Plan | Steps Reached | Outcome | Failure Point |
|---|---|---|---|---|
| `ling_ir:2084` | gather → craft planks → craft table → … (10 steps) | 3/10 (20%) | **FAILED** | `craft_recipe(crafting_table)` — no_recipe_available |
| `ling_ir:acf9` | craft planks → craft sticks → … (6 steps) | 2/6 (17%) | **FAILED** | `craft_recipe(stick)` — verification `:v10` mismatch, then no_recipe_available |
| `ling_ir:18e1` | gather → craft planks → place table → craft pickaxe (4 steps) | 4/4 (75%) | **FAILED** | `craft_recipe(wooden_pickaxe)` — table_nearby=true but workstation=false |
| `ling_ir:d20b` | explore (1 step) | 1/1 | **COMPLETED** | N/A (flee interruption but completed) |
| `ling_ir:05df` | explore (1 step) | 1/1 (0%) | **FAILED** | `move_to` — stuck (0 blocks moved in 6s), 3 retries exhausted |

**Success rate**: 1/5 tasks (20%)

---

### Failure Categories

#### F1. Variant Suffix Mismatch (`:v10`) — DOMINANT FAILURE

**Impact**: ~30 verification FAILs, 3 step verification failures, cascaded into 2 task terminations
**Root cause**: Sterling emits recipe identifiers with variant suffixes (`stick:v10`, `crafting_table:v10`, `wooden_pickaxe:v10`). The tool executor correctly strips the suffix when calling Minecraft (craft succeeds), but `verifyInventoryDelta` looks for the suffixed name in inventory and never finds it.

Evidence:
```
[verifyInventoryDelta] FAIL item=stick:v10 accepted=[stick:v10] before=0 after=0 delta=0 need=1
  → inventoryKeys=[spruce_planks, crafting_table, stick]
```
The item `stick` IS in inventory — but the verifier searches for `stick:v10`.

Same pattern for:
- `crafting_table:v10` (inventory has `crafting_table`) — 5 FAIL logs
- `wooden_pickaxe:v10` (inventory has `wooden_pickaxe`) — 5 FAIL logs
- `spruce_planks` (no suffix, but snapshot timing issue — 0 in both before/after) — 4 FAIL logs

**Classification**: Contract mismatch between Sterling recipe naming and Minecraft inventory naming. The executor already strips `:v10` for the craft call but the verifier doesn't strip it for the inventory check.

**Fix applied**: `getInventoryNamesForVerification` and `buildInventoryIndex` now strip `:v\d+` suffixes. **Validated in Capture 2.**

---

#### F2. Workstation Interaction Gap — HIGH IMPACT

**Impact**: 3 consecutive `no_recipe_available` failures on `wooden_pickaxe`, causing task termination at 75% progress
**Root cause**: The `craft_recipe` leaf checks `workstation=false` even when `table_nearby=true`. For 3x3 grid recipes (pickaxe, etc.), the bot needs to "open" the crafting table as a workstation — but there is no explicit "use workstation" step in the plan, and the leaf doesn't auto-open nearby tables.

Evidence:
```
[MC/leaf] craft_recipe status=failure duration=0ms reason=no_recipe_available workstation=false table_nearby=true
```

**Classification**: Cascade effect of F1. The craft leaf already handles workstation lookup correctly (`bot.recipesFor(id, null, null, tableBlock)`). The `no_recipe_available` in Capture 1 was caused by ingredients being consumed during the verify-FAIL retry cascade. **Not reproduced in Capture 2** after P0-A fix.

---

#### F3. Navigation Stuck — MODERATE IMPACT

**Impact**: 4 `move_to` failures, 1 task termination
**Root cause**: D* Lite pathfinder detects 0 blocks moved in 6s and declares "stuck."

Evidence:
```
[Minecraft Interface] Stuck detected: moved 0.00 blocks in 6s, 10.1 blocks from target
[ActionTranslator] D* Lite navigation failed: Stuck: insufficient movement progress
```

**Classification**: Pathfinding limitation. Not reproduced in Capture 2 (different terrain/biome).

---

#### F4. Keepalive Thought Dropped (`dropped_no_goal_prop`) — RECURRING

**Impact**: 3 dropped thoughts across the session
**Status**: Acceptable at current health levels. Reproduced in Capture 2 (2 drops).

---

#### F5. Inventory Snapshot Timing — LOW IMPACT (promoted to P0-B in Capture 2)

**Impact**: ~4 verification FAILs on `spruce_planks` (non-suffixed)
**Root cause**: The craft executes successfully at the MC layer, but the inventory snapshot is stale.

Evidence:
```
[verifyInventoryDelta] FAIL item=spruce_planks accepted=[spruce_planks] before=0 after=0 delta=0 need=1
  → inventoryKeys=[spruce_log]
```

**Classification**: Race condition. Was masked by F1 in Capture 1. Now the **dominant failure** in Capture 2 after F1 was fixed.

---

#### F6. `acquire_material` Abort/Timeout — MODERATE IMPACT

**Impact**: 2 timeout events (15s abort), 1 `pickup_failed_after_dig`

Evidence:
```
[toolExecutor] ← acquire_material FAIL (15004ms) error=This operation was aborted
[MC/leaf] acquire_material status=failure duration=22733ms reason=pickup_failed_after_dig
```

**Classification**: Timeout too aggressive for wood chopping. Partially reproduced in Capture 2 as `pickup_failed_after_dig`.

---

### Success Events (Capture 1)

- **S1. Wood Acquisition**: Bot can reliably chop spruce trees (2-3 attempts)
- **S2. Crafting**: `spruce_planks`, `crafting_table`, `stick` all succeeded at MC layer
- **S3. Block Placement**: `place_block(crafting_table)` succeeded
- **S4. Creeper Escape**: Flee triggered at 2.7 blocks, health dropped to 17.45 then recovered to 20
- **S5. Exploration**: `move_to` succeeded with flee interruption

---

### Phase 1 Fix Validation (Capture 1)

| Fix | Evidence | Status |
|---|---|---|
| Recovery state cleared on success | No stale recovery metadata | Likely working |
| Rate limiter stamped before call | No duplicate vitals reroutes | Likely working |
| Timestamp floor | No immediate TTL expiry | Likely working |
| Vitals header alignment | Not exercised (health=20) | Untested |
| Threat policy (medium removed) | No retreat under medium threat | Untested |
| Effect evidence checking | No recovery steps dispatched | Untested |

---

### Priority Fix Recommendations (Capture 1 — now superseded by Capture 2)

| Priority | Issue | Impact | Fix Location | Status |
|---|---|---|---|---|
| ~~**P0**~~ | ~~F1: `:v10` suffix not stripped~~ | ~~Blocks all multi-step crafting~~ | ~~verifyInventoryDelta~~ | **FIXED** |
| ~~**P0**~~ | ~~F2: Workstation not opened~~ | ~~Blocks pickaxe crafting~~ | ~~craft_recipe leaf~~ | **Cascade of F1 — resolved** |
| **P1** | F3: Navigation stuck | Blocks exploration | ActionTranslator | Open (not reproduced in C2) |
| **P2** | F6: 15s timeout too short | Causes retries | Executor timeout | Open |
| ~~**P3**~~ | ~~F5: Snapshot timing~~ | ~~Soft failure~~ | ~~verifyInventoryDelta~~ | **Promoted to P0-B** |

---

### Timeline (Condensed — Capture 1)

```
18:40:03  System startup begins
18:41:32  Bot connected, executor initializes
18:41:44  Task ling_ir:2084 created (10-step plan: gather → craft → build tools)
18:41:59  acquire_material(spruce_log) FAIL — 15s abort timeout
18:42:22  acquire_material(spruce_log) FAIL — pickup_failed_after_dig + abort
18:42:29  acquire_material(spruce_log) SUCCESS (3rd attempt)
18:42:33  craft_recipe(spruce_planks) ok — verification FAIL (snapshot timing)
18:42:44  craft_recipe(crafting_table:v10) ok at MC — verification FAIL (:v10 mismatch) x5
18:43:04  craft_recipe(crafting_table) FAIL — no_recipe_available (inputs consumed)
18:43:06  Task ling_ir:2084 FAILED at 20%
18:43:40  Keepalive-17 dropped (no goal prop)
18:43:44  Task ling_ir:acf9 created (6-step plan)
18:43:54  craft_recipe(stick:v10) ok at MC — verification FAIL (:v10 mismatch) x8
18:44:46  craft_recipe(stick) FAIL — no_recipe_available (not near table)
18:45:04  Task ling_ir:acf9 FAILED at 17% (3 retries exhausted)
18:45:38  Task ling_ir:18e1 created (4-step plan: gather → planks → place table → pickaxe)
18:45:48  acquire_material(spruce_log) SUCCESS
18:45:56  craft_recipe(spruce_planks) ok — verification FAIL (timing)
18:46:04  place_block(crafting_table) SUCCESS — verification inconclusive, accepted
18:46:24  craft_recipe(wooden_pickaxe:v10) ok at MC — verification FAIL (:v10) x5
18:46:44  craft_recipe(wooden_pickaxe) FAIL — no_recipe (table_nearby but workstation=false)
18:47:04  Task ling_ir:18e1 FAILED at 75% — LoopBreaker:shadow detects 3-occurrence loop
18:47:38  Task ling_ir:d20b created (1-step explore)
18:47:59  move_to FAIL — 15s abort timeout, stuck
18:48:06  Creeper detected at 6 blocks — high_threat, no emergency action
18:48:09  Creeper at 2.7 blocks — flee triggered, health drops to 17.45
18:48:14  Flee completed, task ling_ir:d20b COMPLETED at 100%
18:48:44  Task ling_ir:05df created (1-step explore)
18:48:51  move_to — bot moves 10.1 blocks then gets stuck
18:49:01  move_to FAIL — 15s abort timeout
18:49:10  move_to retry FAIL — 6s stuck detection
18:49:30  Task ling_ir:05df FAILED at 0% (3 retries exhausted)
18:49:34  Session ends with no active tasks
```
