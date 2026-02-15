# Receipt-Anchored Verification Runbook

## Purpose
Guide for using and debugging the receipt-anchored verification system, which prevents placement re-dispatch bugs (the "5 cobblestones" problem) by probing world state at exact receipt coordinates instead of re-executing leaves on ambiguous results.

## Required Env

```bash
ENABLE_DEV_ENDPOINTS=true            # enables /api/dev/* endpoints
ENABLE_PLANNING_EXECUTOR=1           # enables executor loop
EXECUTOR_MODE=live                   # live dispatch (not shadow)
EXECUTOR_LIVE_CONFIRM=YES            # confirms live mode
STERLING_WS_URL=ws://localhost:8766  # Sterling connection
MINECRAFT_INTERFACE_PORT=3005        # MC interface port
```

## Background: Why Tri-State Matters

The old binary verification model (pass/fail) caused the **"5 cobblestones" bug**:

```
1. place_block dispatches → cobblestone placed at (10, 64, 20)
2. Verification probes (10, 64, 20) → chunk not loaded → returns null
3. Binary model treats null as FAIL → triggers re-dispatch
4. place_block dispatches AGAIN → second cobblestone placed
5. Repeat until chunk loads → 5 cobblestones placed instead of 1
```

The tri-state model fixes this by distinguishing "can't observe" from "observed wrong block":

| Outcome | Meaning | Action |
|---------|---------|--------|
| `verified` | Probe returns expected block at receipt position | Accept step, move to next |
| `inconclusive` | `blockAt` returns null (chunk not loaded) or no receipt available | Retry probe only (never re-dispatch) |
| `contradicted` | Probe returns different block than expected | Fail verification, trigger re-dispatch |

**Timeout policy**: Inconclusive at timeout → **accept** (not reject). The leaf already confirmed success; inability to observe the result is not evidence of failure.

## Receipt Flow

```
PlaceBlockLeaf.run()
  → { ok: true, data: { blockPlaced: 'cobblestone', position: {x,y,z} } }
        ↓
extractLeafReceipt('place_block', data)          [sterling-step-executor.ts:256]
  → { blockPlaced: 'cobblestone', position: {x,y,z} }
        ↓
step.meta.leafReceipt = receipt                  [sterling-step-executor.ts:786]
  (stored BEFORE toDispatchResult strips data)
        ↓
verifyByLeaf('place_block', args, step)          [task-integration.ts:3688]
        ↓
verifyWithTriState(step, 'cobblestone', timeout) [task-integration.ts:4317]
        ↓
  loop until deadline (500ms intervals):
    verifyPlacementReceipt(step, 'cobblestone')  [task-integration.ts:4292]
        ↓
    probeBlockAt(receipt.position)               [task-integration.ts:4271]
        ↓
    HTTP POST /action { type: 'get_block_at', parameters: { position } }
        ↓
    GetBlockAtLeaf.run()                         [sensing-leaves.ts:660]
        ↓
    bot.blockAt(Vec3(x,y,z))
        ↓
    { name: 'cobblestone' | 'unknown' | 'air' | ... }
        ↓
    verified / inconclusive / contradicted
```

## Which Leaves Use Receipt Verification

| Leaf | Receipt Fields | Expected Block | Special Cases |
|------|---------------|----------------|---------------|
| `place_block` | `position`, `blockPlaced` | `args.item ?? args.blockType ?? 'crafting_table'` | None |
| `place_torch` | `position`, `torchPlaced` | `'torch'` | None |
| `place_torch_if_needed` | `position`, `torchPlaced` | `'torch'` | If `torchPlaced: false`, auto-accept (torch wasn't needed) |
| `place_workstation` | `position`, `workstation`, `reused` | `args.workstation ?? 'crafting_table'` | If `reused: true`, auto-accept (no placement to verify) |

All other leaves use different verification modes:

| Verification Mode | Leaves |
|-------------------|--------|
| `inventory_delta` | `acquire_material`, `craft_recipe`, `smelt`, `pickup_item`, `collect_items`, `consume_food` |
| `position_delta` | `move_to`, `step_forward_safely`, `follow_entity` |
| `none` (auto-pass) | `sense_hostiles`, `get_light_level`, `get_block_at`, `wait`, `chat`, `introspect_recipe`, stubs |

## Debugging Receipt Verification Failures

### Symptom: D_verification.ok: false on placement step

**Step 1: Check the golden-run artifact**

```bash
# Find latest artifact
ls -t packages/planning/artifacts/golden-run/*.json | head -1

# Inspect verification details
cat <artifact_path> | jq '.execution.verification'

# Check the specific step
cat <artifact_path> | jq '.execution.dispatched_steps[] | select(.meta.leaf == "place_block")'
```

**Step 2: Check if leafReceipt was stored**

```bash
cat <artifact_path> | jq '.execution.dispatched_steps[] | select(.meta.leaf == "place_block") | .meta.leafReceipt'
```

- If `null` → Receipt extraction failed. Check `extractLeafReceipt` cases.
- If present → Receipt was stored. Check probe results.

**Step 3: Probe the position manually**

```bash
# Use the position from the receipt
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "get_block_at",
    "parameters": {
      "position": { "x": 10, "y": 64, "z": 20 }
    }
  }' | jq
```

Possible results:
- `name: "cobblestone"` → Block is there. Verification should have passed. Check `canonicalItemId` name mismatch.
- `name: "unknown"` → Chunk not loaded. This is the inconclusive case.
- `name: "air"` → Block not placed. This is the contradicted case.
- `name: "stone"` → Wrong block. Name mismatch between what leaf placed and what was expected.

---

### Symptom: Inconclusive verification loops (never resolves)

**Cause**: Chunk at receipt position never loads. The bot may be too far from the placement site, or the Minecraft server hasn't sent the chunk data.

**Diagnosis**:
```bash
# Check bot position vs receipt position
curl -s http://localhost:3005/bot/status | jq '.position'

# Compare with receipt position from artifact
cat <artifact_path> | jq '.execution.dispatched_steps[] | .meta.leafReceipt.position'
```

If the bot is >128 blocks away from the receipt position, the chunk won't be loaded.

**Fix**: This should resolve via the timeout policy (accept after timeout). If it doesn't:
- Check `actionVerificationTimeout` config (default: 10s, capped to 10s in `verifyWithTriState`)
- Verify `verifyWithTriState` timeout loop is functioning (check for early returns)

---

### Symptom: "5 cobblestones" bug (re-dispatch on inconclusive)

**Cause**: Binary verification is being used instead of tri-state, or the tri-state path is bypassed.

**Diagnosis**:
```bash
# Check if multiple dispatch entries exist for the same step
cat <artifact_path> | jq '[.execution.dispatched_steps[] | select(.meta.leaf == "place_block")] | length'
```

If count > 1 for the same step, re-dispatch occurred.

**Fix**:
- Ensure the leaf is in the `verifyByLeaf` switch and routes to `verifyWithTriState`
- Check that `extractLeafReceipt` returns a valid receipt for the leaf
- Verify `step.meta.leafReceipt` is set before verification runs

---

### Symptom: Block name mismatch (placed "cobblestone" but expected "stone")

**Cause**: The `expectedBlock` parameter passed to `verifyWithTriState` doesn't match the Minecraft block name at that position.

**Diagnosis**:
```bash
# Check what canonicalItemId returns for the expected block
# Look in executor logs for the verification call
tail -f packages/planning/logs/planning.log | grep "Verify.*place_block"
```

**Common mismatches**:
- `stone` (block) vs `cobblestone` (drop when mined)
- `oak_log` vs `oak_wood`
- `wheat` (crop block) vs `wheat_seeds` (item)

**Fix**: The `expectedBlock` in `verifyByLeaf` uses `args.item ?? args.blockType`. Ensure the arg matches the Minecraft block name, not the item/drop name.

---

### Symptom: place_torch_if_needed always passes verification

**Expected behavior**: If `torchPlaced: false` in the receipt, verification auto-accepts. The torch wasn't needed (light level was sufficient), so there's nothing to verify.

**If this is unexpected**: Check the leaf's light threshold logic. The leaf decides whether to place based on `get_light_level` at the target position.

---

### Symptom: place_workstation always passes verification

**Expected behavior**: If `reused: true` in the receipt, verification auto-accepts. An existing workstation was reused, so no block was placed.

**If this is unexpected**: Check `place_workstation` leaf logic for the reuse proximity check (default: 6 blocks).

## Adding Receipt Verification to a New Leaf

If you're implementing a new placement leaf that modifies world state at a known coordinate, follow these steps:

### Step 1: Return receipt data from the leaf

```typescript
// In your leaf's run() method:
return {
  status: 'success',
  result: {
    blockPlaced: 'your_block_name',  // Must match Minecraft block name
    position: { x, y, z },           // Exact placement coordinate
  },
  metrics: { ... },
};
```

### Step 2: Add extraction case

**File**: `packages/planning/src/executor/sterling-step-executor.ts`

Add to `extractLeafReceipt` switch:

```typescript
case 'your_leaf_name':
  if (data.position && data.blockPlaced)
    return { position: data.position, blockPlaced: data.blockPlaced };
  return null;
```

### Step 3: Add verification case

**File**: `packages/planning/src/task-integration.ts`

Add to `verifyByLeaf` switch:

```typescript
case 'your_leaf_name': {
  const expected = this.canonicalItemId(args.item ?? 'expected_block');
  return this.verifyWithTriState(step, expected, timeout);
}
```

### Step 4: Test the full cycle

```bash
# 1. Dispatch the leaf
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"your_leaf_name","parameters":{"item":"cobblestone","position":{"x":10,"y":64,"z":20}}}' | jq

# 2. Verify receipt was stored (check step metadata in executor logs)
tail -f packages/planning/logs/planning.log | grep leafReceipt

# 3. Probe the position manually
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"get_block_at","parameters":{"position":{"x":10,"y":64,"z":20}}}' | jq

# 4. Run smoke test to verify full pipeline
curl -s -X POST http://localhost:3002/api/dev/sterling-smoke \
  -H 'Content-Type: application/json' -d '{"variant":"ok_fresh"}' | jq '.D_verification'
```

## Key Implementation Files

| Component | File | Function / Line |
|-----------|------|-----------------|
| Receipt extraction | `packages/planning/src/executor/sterling-step-executor.ts` | `extractLeafReceipt` (line 256) |
| Receipt storage | `packages/planning/src/executor/sterling-step-executor.ts` | Receipt attachment block (line 786) |
| Verification dispatcher | `packages/planning/src/task-integration.ts` | `verifyByLeaf` (line 3688) |
| Tri-state loop | `packages/planning/src/task-integration.ts` | `verifyWithTriState` (line 4317) |
| Placement probe | `packages/planning/src/task-integration.ts` | `verifyPlacementReceipt` (line 4292) |
| Block-at HTTP wrapper | `packages/planning/src/task-integration.ts` | `probeBlockAt` (line 4271) |
| get_block_at leaf | `packages/minecraft-interface/src/leaves/sensing-leaves.ts` | `GetBlockAtLeaf` (line 660) |

## Copy-Paste Commands

### Probe a block at coordinates
```bash
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"get_block_at","parameters":{"position":{"x":10,"y":64,"z":20}}}' | jq '.result.name'
```

### Check verification result in artifact
```bash
cat <artifact_path> | jq '.execution.verification'
```

### Check leafReceipt on dispatched steps
```bash
cat <artifact_path> | jq '.execution.dispatched_steps[] | {leaf: .meta.leaf, receipt: .meta.leafReceipt}'
```

### Count re-dispatches per leaf (detect "5 cobblestones" bug)
```bash
cat <artifact_path> | jq '[.execution.dispatched_steps[] | .meta.leaf] | group_by(.) | map({leaf: .[0], count: length}) | .[]'
```

### Follow verification logs
```bash
tail -f packages/planning/logs/planning.log | grep -E "(Verify|verif|triState|inconclusive|contradicted)"
```

---

## Related Runbooks

- **[sterling-smoke-runbook.md](./sterling-smoke-runbook.md)**: Test full Sterling → leaf pipeline (D_verification checkpoint covers this)
- **[leaf-creation-runbook.md](./leaf-creation-runbook.md)**: Phase 5 covers verification strategy selection
- **[debugging-leaf-dispatch-runbook.md](./debugging-leaf-dispatch-runbook.md)**: Stage 8 covers verification failures broadly

---

*Last updated: 2026-02-12*
*Source: `docs/leaf-execution-pipeline.md` → Receipt-Anchored Verification section; `packages/planning/src/task-integration.ts` → verifyByLeaf, verifyWithTriState, verifyPlacementReceipt, probeBlockAt*
