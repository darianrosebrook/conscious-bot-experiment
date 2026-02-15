# Building Tab 3D Renderer Triage

Triage document for the Building tab's texture rendering issues. The live viewer (Prismarine) renders textures correctly; the Building tab shows magenta/chaotic placeholder textures on placed blocks and platform terrain.

## Layer Structure (Platform Terrain)

The procedural platform uses three vertical layers:

| Y | Block Type | Description |
|---|------------|-------------|
| 0 | `stone` | Base layer (inside ellipse) |
| 1 | `grass_block` | **Full grass layer** — green top, dirt sides (inside ellipse) |
| 2 | `grass` / `fern` / `tall_grass` (lower) | Vegetation (edge band only) |
| 3 | `tall_grass` (upper) | Tall grass top half (when tall_grass) |

**Source:** `packages/dashboard/src/lib/platform-terrain.ts`

The "full grass layer" is `grass_block` at y=1. If it appears grey/cobblestone or magenta instead of green, the texture pipeline is failing for that block type.

## Rendering Pipeline (Block Canvas)

```mermaid
flowchart TD
    subgraph Load["Asset Loading (useAtlasMaterial)"]
        A[loadAtlas] --> B{loadMcAssets OK?}
        B -->|yes| C[Texture + blockStates + atlas-index]
        B -->|no| D[loadLegacyAtlas]
        D --> E[/atlas/blocks-atlas-index.json + /block_textures/*.png]
    end

    subgraph Geometry["Geometry Creation (createBlockGeometry)"]
        C --> F{blockStates available?}
        F -->|yes| G[buildBlockGeometryFromAssets]
        F -->|no| H[applyAtlasUVs fallback]
        G --> I{Model found?}
        I -->|yes| J[buildGeometryFromModel - UVs from blockStates]
        I -->|no| H
        H --> K[resolveBlockTextures + atlasIndex.textures]
        K --> L{atlasIndex.textures has entry?}
        L -->|yes| M[Correct UVs]
        L -->|no| N[DEFAULT_ATLAS_ENTRY 0,0 = missing texture]
    end

    subgraph Render["Rendering"]
        J --> O[BlockMesh / PlatformTerrain]
        M --> O
        N --> O
    end
```

## Data Flow Summary

1. **useAtlasMaterial** loads texture atlas + blockStates + atlas-index
2. **createBlockGeometry** (per block) tries:
   - `buildBlockGeometryFromAssets` when blockStates exists (uses model UVs from asset pipeline)
   - Falls back to `applyAtlasUVs` when model not found (uses atlasIndex.textures)
3. **applyAtlasUVs** needs `atlasIndex.textures[textureName]` — if atlas-index 404s, `textures = {}`, so all fallbacks use `(0,0)` = missing texture (magenta)

## Diagnosis Checklist

### 1. Which asset path is active?

| Condition | Result |
|-----------|--------|
| minecraft-interface running on 3005 | mc-assets (texture + blockStates + atlas-index) |
| minecraft-interface not running | Legacy (/atlas/ + /block_textures/) |

**Check:** Browser Network tab for `/api/mc-assets/textures/1.21.4.png` — 200 = mc-assets, 404/fail = legacy.

### 2. Atlas-index availability (mc-assets path only)

| Condition | Result |
|-----------|--------|
| `/api/mc-assets/atlas-index/1.21.4.json` 200 | atlasIndex.textures populated |
| 404 | atlasIndex.textures = {} — all applyAtlasUVs fallbacks use (0,0) = magenta |

**Check:** Network tab for atlas-index request. If 404, run `pnpm mc:assets extract 1.21.4` in minecraft-interface.

### 3. BlockStates format compatibility

The mc-asset-block-loader expects:
- `blockStates[blockName]` (e.g. `blockStates["grass_block"]`)
- `state.variants[key].model` = resolved model with `elements[].faces[].texture = { u, v, su, sv }`
- `state.multipart[0].apply.model` for multipart blocks (apply may be object or array)

The BlockStatesBuilder produces this format. Mismatch would cause `buildBlockGeometryFromAssets` to return null for more blocks than expected.

### 4. Vegetation blocks (grass, fern, tall_grass)

These use "cross" models (two intersecting quads). If the blockStates model format differs or the cross model isn't resolved, `buildBlockGeometryFromAssets` returns null. Then `applyAtlasUVs` is used — which needs atlas-index. If atlas-index is empty, vegetation shows magenta.

### 5. Block name / texture name mapping

`resolveBlockTextures` returns names like `grass_block_top`, `grass_block_side`, `dirt` for grass_block. The atlas-index must use the same keys. Asset pipeline uses `cleanupBlockName` which strips `block/` — so keys are `grass_block_top`, `cobblestone`, etc.

## Likely Root Causes (Prioritized)

1. **Atlas-index 404** — When mc-assets loads texture + blockStates but atlas-index fails, `atlasIndex.textures = {}`. Every block that falls back to `applyAtlasUVs` gets (0,0) = missing texture.
2. **mc-assets not running** — Fallback to legacy. Legacy atlas may be incomplete or use different texture names.
3. **buildBlockGeometryFromAssets returns null** — For vegetation (cross models) or blocks with non-standard models. Forces applyAtlasUVs path.
4. **blockStates structure mismatch** — e.g. multipart.apply as array vs object; variant keys; model nesting.

## Verification Commands

```bash
# Ensure assets are generated (minecraft-interface)
cd packages/minecraft-interface && pnpm mc:assets extract 1.21.4

# Check generated files exist
ls -la ~/.minecraft-assets-cache/generated/1.21.4/
# Expect: textures.png, blockstates.json, atlas-index.json
```

## Next Steps for Fix

1. Add console logging in `useAtlasMaterial` to report which path (mc-assets vs legacy) and whether atlas-index loaded.
2. If atlas-index 404: ensure pipeline writes it and asset-server serves it; or derive atlas-index from blockStates when unavailable.
3. If buildBlockGeometryFromAssets returns null for grass_block: inspect blockStates structure for that block.
4. Add a diagnostic overlay or dev-mode indicator showing: asset path, atlas-index keys count, blockStates keys count.
