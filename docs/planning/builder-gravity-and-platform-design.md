# Builder: Gravity Block Simulation + Platform Floor Design

Investigation and design for (1) gravity block fall simulation and (2) platform floor with grass/stone base and decorative vegetation.

---

## 1. Gravity Block Simulation

### Minecraft Gravity Blocks

| Block | Falls | Notes |
|-------|-------|-------|
| sand | yes | Turns to item if lands on partial block |
| red_sand | yes | Same as sand |
| gravel | yes | Same as sand |
| concrete_powder | yes | Converts to concrete if touching water |
| anvil | yes | Damages if falls on entities |
| dragon_egg | yes | Teleports on impact |
| pointed_dripstone | yes | Breaks if landing on non-solid |
| scaffolding | yes | Special climb behavior |
| suspicious_sand | yes | Same as sand |
| suspicious_gravel | yes | Same as gravel |

### Minecraft Fall Logic (Simplified)

1. When a gravity block is placed or loses support below it, it becomes a falling entity.
2. It falls one block per tick until it hits something.
3. On landing: if the block below is full solid, it places as a block; otherwise it breaks into a dropped item.
4. Partial blocks (slabs, torches, etc.) cause the block to break.

### What We Would Need

#### Option A: Instant Simulation (No Animation)

On placement of a gravity block:

1. Check if block is gravity-affected (`sand`, `gravel`, `red_sand`, etc.).
2. If so, scan downward from placement Y to 0 (or grid bottom).
3. For each candidate landing Y:
   - Check if (x, y-1, z) has solid support.
   - "Solid" = full block (not slab, torch, lantern, etc.) or y-1 === -1 (treat as void — block breaks).
4. Move the block to the landing position.
5. If landing on partial block: remove the block (it "breaks") — optionally could show a brief feedback.

**Implementation points:**

- New module: `packages/dashboard/src/lib/gravity-simulator.ts`
- `isGravityBlock(blockType: string): boolean`
- `getSolidSupport(blockAt: (pos) => Block | null): boolean` — block below is full cube
- `simulateFall(pos: Vec3, blockType: string, blockIndex: Set<string>, getBlockAt: (pos) => PlacedBlock | null): Vec3 | 'break'`
- Hook into `placeBlock` in building-store: after adding block, if gravity block, run simulation and either move or remove.

#### Option B: Animated Fall

Same logic as A, but:

- Show falling block entity (simple mesh sliding down) over ~200–400ms.
- On completion, place block at final position.
- More complex: need to track "falling" state in UI, avoid placement conflicts during fall.

**Recommendation:** Start with Option A. Add animation later if desired.

### Block Support Classification

We need a "full block" check for landing:

- Full blocks: `stone`, `dirt`, `grass_block`, `sand`, `gravel`, `cobblestone`, `planks`, etc.
- Partial blocks: `*_slab`, `torch`, `lantern`, `redstone_torch`, `carpet`, `snow` (layer < 8), etc.
- Non-solid: `air`, `water`, `lava`, `grass`, `fern`, `tall_grass` (these don't support gravity blocks).

### Edge Cases

- **Stack of sand:** Place one sand at y=5. It falls to y=0. Place another at y=5 — it falls and lands on the first sand at y=0. Need to process placement in order; if we batch-place, we'd need to simulate in sequence.
- **Concrete powder:** Skip for now — would need water interaction.
- **Drag-place line of sand:** Each position in the line could be placed sequentially with simulated fall. Order matters (top-down placement).

---

## 2. Platform Floor + Decorative Vegetation

### Current State

- **Grid:** `Grid` from drei at `position={[gridSize.x/2, 0, gridSize.z/2]}`, `args={[gridSize.x, gridSize.z]}
- **Floor:** Invisible click plane at y=-0.001 for placement.
- **No terrain:** No grass or stone blocks; the grid is the only visual floor.

### Desired Design

> "A floating slice of a platform" — grass + stone floor, grid overlay on top, small grass and tall grass in a non-uniform oval around the edge.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Terrain Layer (y=0) — "base" blocks, not user-editable          │
│  - stone (or dirt) for base                                      │
│  - grass_block on top for top surface                            │
│  - Extent: full grid or an oval region                           │
└─────────────────────────────────────────────────────────────────┘
                              +
┌─────────────────────────────────────────────────────────────────┐
│  Vegetation Layer (y=1) — decorative, non-uniform                 │
│  - grass, fern, tall_grass along oval edge                       │
│  - Sparse, random-ish placement                                   │
└─────────────────────────────────────────────────────────────────┘
                              +
┌─────────────────────────────────────────────────────────────────┐
│  Grid Overlay — semi-transparent, on top for clarity             │
│  - Same Grid component, but at y=0.01 or similar so it renders    │
│    above the terrain                                             │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Approaches

#### Approach A: Terrain as Placed Blocks

- Add terrain blocks to the store as "ground" or "locked" blocks.
- User cannot erase them; they’re always present.
- Separate `terrainBlocks` from `blocks` in the store, or a `terrainBlocks` slice that’s always merged.
- Pros: Reuses existing rendering; terrain is in the same system.
- Cons: Need to distinguish terrain from user blocks in solve, export, etc.

#### Approach B: Procedural Terrain Layer (Not in Store)

- Render terrain as a separate mesh layer (e.g. InstancedMesh for grass_block, stone).
- Terrain is computed from grid size + oval shape; not stored as PlacedBlocks.
- Click plane and placement logic unchanged: user still places blocks at y=0 and above.
- Grid overlay at y=0.01 or with a slight offset so it renders above blocks.
- Pros: Clean separation; no solve/export impact.
- Cons: Need to coordinate placement — user can place on top of terrain at y=0.

#### Approach C: Default Template + "Ground" Flag

- Add a "ground" boolean to PlacedBlock: `ground?: boolean`.
- On load, apply a "platform" template that fills y=0 with grass_block + stone.
- Ground blocks are excluded from solve export or marked as "prep" only.
- User can erase or overwrite if desired; or we treat ground as non-erasable.

**Recommendation:** Approach B for the initial version — procedural terrain layer rendered separately, with grid overlay. Keeps the store simple and avoids export/solve complexity.

### Oval Shape

```ts
// Pseudo-code for oval boundary
function isInOval(x: number, z: number, cx: number, cz: number, rx: number, rz: number): boolean {
  if (rx === 0 || rz === 0) return true;
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return dx * dx + dz * dz <= 1;
}

// For edge band: inner ellipse vs outer ellipse
// Vegetation: only in band where innerRadius < dist < outerRadius
function isInEdgeBand(x, z, cx, cz, innerRx, innerRz, outerRx, outerRz): boolean {
  const d = (x - cx) ** 2 / (cx ** 2) + (z - cz) ** 2 / (cz ** 2); // simplified
  // ...
}
```

### Block Models Needed

| Block | Model | Status | Notes |
|-------|-------|--------|------|
| grass | cross (block/grass) | in blocks_models.json | Need texture in block_textures |
| fern | cross (block/fern) | in blocks_models.json | Need texture |
| tall_grass | 2-block (bottom + top) | tall_grass_bottom, tall_grass_top | Need textures |
| large_fern | 2-block | large_fern_bottom, large_fern_top | Need textures |

**Textures:** `grass.png`, `fern.png`, `tall_grass_bottom.png`, `tall_grass_top.png` — these come from the JAR. The asset pipeline extracts them. If using mc-assets, they should be available when the blockStates JSON includes these blocks. The block-texture-resolver would need to handle them; the texture names for cross models are typically `grass`, `fern`, `tall_grass` (with variants).

**Block categories:** Add a "vegetation" or "decorational" category with `grass`, `fern`, `tall_grass`, `large_fern` if we want users to place them manually. For the procedural platform, we only need to render them — no picker needed.

### Grid Overlay

- Current Grid is at y=0. With terrain blocks at y=0, the grid would be at the same level or slightly below.
- Options: (1) Raise Grid to y=0.02 so it renders above blocks; (2) Use a thinner grid or different material; (3) Keep grid as-is but ensure terrain blocks don’t occlude it.
- The drei `Grid` component: check if it has a `position` or `height` prop. Raising to y=0.02 should work.

---

## Summary: Implementation Order

1. **Gravity simulation (Option A):** Add `gravity-simulator.ts`, wire into `placeBlock`/`placeBlocks`.
2. **Platform terrain:** Add procedural terrain layer (stone + grass_block) in block-canvas, oval shape.
3. **Vegetation:** Add procedural grass/fern in oval edge band.
4. **Grid overlay:** Raise Grid slightly or adjust for visibility.
5. **Plant block models:** Add `grass`, `fern`, `tall_grass`, `large_fern` to categories and texture resolver if needed for manual placement.

---

## References

- [Minecraft Falling Block Wiki](https://minecraft.wiki/w/Falling_Block)
- `packages/dashboard/src/components/building/block-canvas.tsx` — Grid, floor plane, block rendering
- `packages/dashboard/src/stores/building-store.ts` — placeBlock, placement flow
- `packages/dashboard/public/blocks_models.json` — grass, fern, tall_grass models
