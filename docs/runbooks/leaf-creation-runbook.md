# Adding a New Leaf Runbook

## Purpose
Step-by-step guide to implementing a new leaf action with full pipeline integration, from contract registration to smoke testing.

## Required Env

For smoke testing the new leaf via REST:
```bash
ENABLE_DEV_ENDPOINTS=true            # enables /api/dev/* test endpoints
MINECRAFT_INTERFACE_PORT=3005        # default MC interface port
```

For full Sterling pipeline testing:
```bash
ENABLE_PLANNING_EXECUTOR=1
EXECUTOR_MODE=live
EXECUTOR_LIVE_CONFIRM=YES
STERLING_WS_URL=ws://localhost:8766
```

## Prerequisites

- Node.js environment set up
- Minecraft bot connected and running
- Basic understanding of mineflayer API
- Familiarity with TypeScript

## Implementation Checklist

### Phase 1: Design & Contracts

#### 1.1 Define Leaf Purpose and Permissions

**Questions to answer**:
- What world mutation does this leaf perform?
- What mineflayer bot actions does it use?
- What permissions does it need? (movement, dig, place, craft, container.read, container.write, sense, chat)
- Is it read-only (sense) or mutating?
- What are the failure modes?

**Example**: `harvest_crop`
- **Purpose**: Break mature crop blocks and collect drops
- **Bot actions**: `bot.dig()`, checks crop metadata (age)
- **Permissions**: `['movement', 'dig']`
- **Failure modes**: No mature crops nearby, inventory full, crop not reachable

---

#### 1.2 Define Args Contract

**File**: `packages/planning/src/modules/leaf-arg-contracts.ts`

Add to `CONTRACTS` object:

```typescript
harvest_crop: {
  requiredKeys: [],
  optionalKeys: ['position', 'radius'],
  defaults: { radius: 8 },
}
```

**Rules**:
- `requiredKeys`: Must be present or leaf fails validation
- `optionalKeys`: Can be omitted
- `defaults`: Applied when key is absent or `null`/`undefined`

Add to `KNOWN_LEAVES` set:

```typescript
export const KNOWN_LEAVES = new Set<string>([
  // ... existing leaves
  'harvest_crop',
]);
```

---

#### 1.3 Register Action Contract (MC-side)

**File**: `packages/minecraft-interface/src/action-contract-registry.ts`

Add to `ACTION_CONTRACTS` table:

```typescript
harvest_crop: {
  leafName: 'harvest_crop',
  dispatchMode: 'leaf',
  aliases: {},
  stripKeys: [],
  requiredKeys: [],
},
```

**Dispatch modes**:
- `'leaf'` (default): Route directly to leaf via `dispatchToLeaf`
- `'handler'`: Always route to dedicated handler method (e.g., `craft`, `smelt`)
- `'guarded'`: Check semantic guards; if none fire, dispatch to leaf (e.g., `place_block`)

**Aliases**: Map old param names to new ones
```typescript
aliases: {
  'old_name': 'new_name',  // Caller can use either, leaf sees new_name
}
```

**stripKeys**: Remove deprecated params before dispatch
```typescript
stripKeys: ['exploreOnFail', 'placement'],
```

**requiredKeys**: Enforced before dispatch (fail-closed if missing)
```typescript
requiredKeys: ['recipe'],
```

---

#### 1.4 Add Routing Entry (Planning-side)

**File**: `packages/planning/src/sterling/leaf-routing.ts`

If Sterling solver emits this action type, add to `actionTypeToLeaf`:

```typescript
export function actionTypeToLeaf(actionType: string): string | null {
  // ... existing mappings
  if (actionType === 'harvest') return 'harvest_crop';
  // ...
}
```

**Note**: This is only needed if Sterling solver produces this action type. If the leaf is only called directly (not via solver), skip this step.

---

### Phase 2: Leaf Implementation

#### 2.1 Create Leaf Class

**File**: Choose appropriate file in `packages/minecraft-interface/src/leaves/`:
- `movement-leaves.ts` (navigation, pathfinding)
- `interaction-leaves.ts` (dig, place, consume)
- `sensing-leaves.ts` (read-only world queries)
- `crafting-leaves.ts` (craft, smelt, workstations)
- `container-leaves.ts` (chests, inventory)
- `combat-leaves.ts` (attack, equip, retreat)
- `farming-leaves.ts` (till, plant, harvest)
- `world-interaction-leaves.ts` (doors, redstone, pistons)

**Template**:

```typescript
export class HarvestCropLeaf extends Leaf {
  static readonly spec: LeafSpec = {
    name: 'harvest_crop',
    timeout: 30000,  // ms (default: 10s, movement: 30s, build: 300s)
    retries: 3,      // max retries on failure
    permissions: ['movement', 'dig'],
  };

  async run(
    ctx: LeafContext,
    args: {
      position?: { x: number; y: number; z: number };
      radius?: number;
    }
  ): Promise<LeafResult> {
    const { bot } = ctx;
    const radius = args.radius ?? 8;

    // 1. Validate preconditions
    if (!bot) {
      return this.error('Bot not connected');
    }

    // 2. Perform action
    try {
      const cropBlock = this.findMatureCrop(bot, radius);
      if (!cropBlock) {
        return this.error(`No mature crops found within ${radius} blocks`);
      }

      await bot.dig(cropBlock);

      // 3. Verify success
      const harvestedCount = 1;  // Track actual count
      return this.success({
        harvestedCount,
        position: cropBlock.position,
      });
    } catch (error) {
      return this.error(`Harvest failed: ${error.message}`);
    }
  }

  private findMatureCrop(bot: any, radius: number): any | null {
    // Implementation: expanding shell search, check crop age metadata
    // ...
  }
}
```

**Key methods**:
- `this.success(data?)`: Return success with optional data payload
- `this.error(message)`: Return failure with error message
- `this.log(message)`: Log info (appears in leaf execution logs)

---

#### 2.2 Register Leaf

**File**: `packages/minecraft-interface/src/server.ts`

Add to `registerCoreLeaves` function (line ~773):

```typescript
function registerCoreLeaves(factory: LeafFactory) {
  // ... existing registrations
  factory.register(HarvestCropLeaf);
}
```

---

### Phase 3: Testing

#### 3.1 Write Unit Tests (Optional but Recommended)

**File**: `packages/minecraft-interface/src/leaves/__tests__/farming-leaves.test.ts`

```typescript
describe('HarvestCropLeaf', () => {
  it('should harvest mature wheat', async () => {
    const mockBot = createMockBot();
    const leaf = new HarvestCropLeaf();

    const result = await leaf.run({ bot: mockBot }, { radius: 8 });

    expect(result.status).toBe('ok');
    expect(result.result.harvestedCount).toBeGreaterThan(0);
  });

  it('should fail when no mature crops nearby', async () => {
    const mockBot = createMockBot({ noCrops: true });
    const leaf = new HarvestCropLeaf();

    const result = await leaf.run({ bot: mockBot }, { radius: 8 });

    expect(result.status).toBe('error');
    expect(result.error).toContain('No mature crops found');
  });
});
```

---

#### 3.2 Smoke Test (Live Minecraft)

**Prerequisites**:
- Minecraft server running
- Bot connected
- World state prepared (mature crops placed)

**Docker setup command**:
```bash
# Place mature wheat (age=7)
setblock ~2 ~-1 ~ minecraft:farmland
setblock ~2 ~ ~ minecraft:wheat[age=7]
```

**Smoke test via REST**:

```bash
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "harvest_crop",
    "parameters": {
      "radius": 16
    }
  }' | jq
```

**Success criteria**:
- `status: "success"`
- `result.harvestedCount > 0`
- `duration < 30000` (timeout)
- Wheat block broken in Minecraft world
- Wheat items collected in bot inventory

**Failure signals**:
- `status: "error"` → Check error message
- `error: "No mature crops found"` → Need to place mature wheat (age=7)
- `error: "Bot not connected"` → Start Minecraft bot
- `error: "Timeout"` → Increase `timeout` in `LeafSpec`

---

#### 3.3 Contract Alignment Test

Run planning ↔ MC contract alignment tests:

```bash
cd packages/planning
npm test -- contract-alignment.test.ts
```

**What it checks**:
- Planning `CONTRACTS` and MC `ACTION_CONTRACTS` agree on normalization
- Aliases resolve consistently
- Required keys enforced
- Idempotency (normalize(normalize(x)) === normalize(x))

---

### Phase 4: Integration

#### 4.1 Add to Leaf Inventory Documentation

**File**: `docs/leaf-execution-pipeline.md`

Add to appropriate section (e.g., "Farming Leaves"):

```markdown
#### harvest_crop
- **Class**: `HarvestCropLeaf` (line XXX)
- **Spec**: timeout=30000ms, retries=3, permissions=[movement, dig]
- **Args**: `{ position?, radius? }`
- **Bot actions**: `bot.dig()`, checks crop age/readiness via metadata
- **Task Prerequisites:** [bot connected, mature crop blocks nearby (age=7 for wheat)]
- **Docker Command to set situation:** `setblock ~2 ~-1 ~ minecraft:farmland && setblock ~2 ~ ~ minecraft:wheat[age=7]`
- **Status**: Real implementation
- **confirmed_working**: 2026-02-12 — harvested wheat at (x, y, z), harvestedCount=3
```

---

#### 4.2 Update Known Composability Gaps (if applicable)

**File**: `docs/leaf-execution-pipeline.md` → "Known Composability Gaps" section

If your leaf has known limitations, document them:

```markdown
### P1 -- Quality of life

| Gap | Description | Impact | Mitigation |
|-----|-------------|--------|------------|
| **harvest_crop doesn't replant** | Harvests crops but doesn't replant seeds | Farmland left empty after harvest | Use `manage_farm` with `maintain` action instead |
```

---

### Phase 5: Verification Strategy

Choose verification mode based on leaf behavior:

#### inventory_delta (default for dig/collect/craft leaves)
- Checks inventory before/after for expected item count
- **Limitation**: Block→drop name mismatch (stone → cobblestone) causes false negatives
- **Fix**: Use drop name in verification, or add block→drop mapping table

#### receipt_anchored (placement leaves: place_block, place_torch)
- Leaf returns `{ position, blockPlaced }` in result data
- Verifier probes `get_block_at(position)` to confirm block exists
- **Tri-state outcome**: verified | inconclusive (chunk not loaded) | contradicted
- **Why**: Prevents "5 cobblestones" bug (re-dispatch on inconclusive)

#### position_delta (movement leaves: move_to, step_forward_safely)
- Checks bot position before/after
- Verifies bot moved within tolerance range

#### none (read-only sensing leaves)
- No verification needed (get_light_level, sense_hostiles)

**To enable receipt-anchored verification**:

1. Return receipt in leaf:
```typescript
return this.success({
  blockPlaced: 'wheat',
  position: cropBlock.position,
});
```

2. Add to `extractLeafReceipt` in `packages/planning/src/executor/sterling-step-executor.ts`:
```typescript
if (leafName === 'harvest_crop' && data.position) {
  return { blockBroken: data.blockPlaced, position: data.position };
}
```

3. Add to `verifyByLeaf` in `packages/planning/src/task-integration.ts`:
```typescript
if (leaf === 'harvest_crop' && step.meta.leafReceipt?.position) {
  return this.verifyWithTriState(step, 'air', 5000);
}
```

---

## Quick Reference

### Files to Edit

| File | Purpose |
|------|---------|
| `packages/planning/src/modules/leaf-arg-contracts.ts` | Args contract + KNOWN_LEAVES |
| `packages/minecraft-interface/src/action-contract-registry.ts` | MC-side contract + routing |
| `packages/planning/src/sterling/leaf-routing.ts` | Sterling action type → leaf name (optional) |
| `packages/minecraft-interface/src/leaves/<category>-leaves.ts` | Leaf implementation |
| `packages/minecraft-interface/src/server.ts` | Register leaf in factory |
| `docs/leaf-execution-pipeline.md` | Documentation + smoke test details |

---

## Common Pitfalls

### Forgot to add to KNOWN_LEAVES
**Error**: `Unknown leaf: harvest_crop` during step execution
**Fix**: Add to `KNOWN_LEAVES` set in `leaf-arg-contracts.ts`

### Mismatched param names (planning vs MC)
**Error**: Leaf receives `undefined` for args, or args not normalized
**Fix**: Add alias in `ACTION_CONTRACTS.aliases` or ensure consistent naming

### Leaf times out but bot is still working
**Error**: `status: "timeout"` but action completes after timeout
**Fix**: Increase `timeout` in `LeafSpec` (movement: 30s, build: 300s)

### Verification fails even though leaf succeeded
**Error**: `D_verification.ok: false` in smoke test
**Fix**: Check block→drop name mismatch, or switch to receipt-anchored verification

### Leaf called but not registered
**Error**: `Leaf not found: harvest_crop`
**Fix**: Add `factory.register(HarvestCropLeaf)` in `registerCoreLeaves`

---

## Copy-Paste Commands

### Run contract alignment tests
```bash
cd packages/planning && npm test -- contract-alignment.test.ts
```

### Smoke test new leaf via REST
```bash
curl -s -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "your_leaf_name",
    "parameters": {}
  }' | jq
```

### Check leaf registered in factory
```bash
grep -n "factory.register" packages/minecraft-interface/src/server.ts | grep YourLeafClass
```

### Verify args contract exists
```bash
grep -A5 "your_leaf_name:" packages/planning/src/modules/leaf-arg-contracts.ts
```

---

## Related Runbooks

- **[sterling-smoke-runbook.md](./sterling-smoke-runbook.md)**: Test end-to-end Sterling → leaf pipeline
- **[debugging-leaf-dispatch-runbook.md](./debugging-leaf-dispatch-runbook.md)**: Diagnose dispatch failures
- **[receipt-anchored-verification-runbook.md](./receipt-anchored-verification-runbook.md)**: When to use receipt verification

---

*Last updated: 2026-02-12*
*Source: `docs/leaf-execution-pipeline.md` → Leaf Inventory, Action Contract Registry, Solver → Leaf Routing sections*
