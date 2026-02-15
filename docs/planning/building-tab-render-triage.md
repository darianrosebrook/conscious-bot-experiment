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

## Triage Implementation (Builder-Viewer Texture Fidelity)

Completed per Builder-Viewer texture fidelity triage plan.

### Findings

- **Version propagation:** `mcVersion` flows from Dashboard (viewer-status `executionStatus.bot.server.version`) to BuildingTab to BlockCanvas to `useAtlasMaterial`. No change needed.
- **FACE_CORNERS / UV math:** Builder `FACE_CORNERS` in `mc-asset-block-loader.ts` matches viewer `elemFaces` in `models.js`. For rotation 0, UV formula matches (`baseu * su + u`, `basev * sv + v`).
- **Multipart apply:** Pipeline can output `multipart[].apply` as an array. Loader previously only read `apply.model`; it now handles `Array.isArray(apply) ? apply[0]?.model : apply.model`.
- **Atlas-index:** Pipeline writes `atlas-index.json` when generating assets. Asset-server serves it and can auto-generate. When atlas-index 404s, console warns with the `pnpm mc:assets extract {version}` command.
- **Half-texel inset:** Applied in both `block-geometry-builder.ts` (applyAtlasUVs) and `mc-asset-block-loader.ts` (buildGeometryFromModel) so NearestFilter does not sample at tile boundaries (e.g. grass_block_top vs gravel).

### Changes Made

1. **Diagnostic overlay** (`?diagnostic=1`): Shows asset path, version, atlas-index key count, blockStates key count, and grass_block geometry source (model vs applyAtlasUVs). See `block-canvas.tsx` and `block-canvas.module.scss`.
2. **useAtlasMaterial:** Returns `version`; logs atlas-index 200 (key count) or 404 with extract hint. `flipY = false` for mc-assets path (pipeline UVs use v=0 at image top). `alphaTest: 0.5` on both mc-assets and legacy materials for transparent textures (vegetation, glass, leaves).
3. **mc-asset-block-loader:** `canBuildFromAssets(blockType, blockStates)` for overlay; grass_block logging when resolving model; multipart apply array handling; half-texel inset in `buildGeometryFromModel` (4096 atlas). Per-vertex biome tint colors for faces with `tintindex=0` (plains grass #91BD59).
4. **ambient-occlusion:** `bakeBlockAO()` accepts `vertexCount` parameter for mc-assets models with non-standard vertex counts. `BlockMesh` multiplies AO with existing tint colors.
5. **building-tab-render-triage.md:** This section.

### Success Criteria Met

- Diagnostic overlay (or dev-mode) shows asset path, version, atlas-index status, blockStates keys, and geometry source for grass_block.
- Grass block tops show green grass when mc-assets is used and blockStates/model path is used; half-texel inset avoids boundary sampling.
- Vegetation (short_grass, tall_grass, fern) renders with transparent backgrounds and green biome tint.
- Glass and other semi-transparent blocks render correctly with alpha cutout.
- No WebGL errors in console.

### Verification

1. Open Building tab with `?diagnostic=1`. Confirm overlay shows path, version, counts, and grass_block: model or applyAtlasUVs.
2. With minecraft-interface running and assets extracted for the version, grass_block should use model path and display green top.
3. If grass_block shows applyAtlasUVs, check console for `[mc-asset-block-loader] grass_block:` and `[useAtlasMaterial] atlas-index` to see model resolution and atlas-index status.

---

## Live test results (triage)

**Test:** Building tab with `?diagnostic=1`, mc-assets and minecraft-interface running, version 1.21.9.

**Diagnostic overlay:**

| Field | Value |
|-------|--------|
| path | mc-assets |
| version | 1.21.9 |
| atlas-index keys | 1112 |
| blockStates keys | 1189 |
| grass_block | **model** |

**Observation:** Grass blocks still show **gravel texture on top**; sides show dirt (correct). So:

- Atlas-index and blockStates are loaded.
- Geometry for grass_block comes from **model** (buildBlockGeometryFromAssets), not applyAtlasUVs.
- The bug is not missing atlas-index or fallback path.

**Conclusion:** The wrong texture is being used for the **up** face when building from the model. Either:

1. **Pipeline:** The resolved model for grass_block has the "up" face texture (u, v, su, sv) pointing at the gravel tile in the atlas (e.g. atlas builder or blockstates-builder assigns wrong UVs to `grass_block_top`), or
2. **Atlas layout:** `grass_block_top` and `gravel` are adjacent and a one-tile offset or naming mix-up in the pipeline yields gravel UVs for the top face.

**Recommended next steps:**

1. **Pipeline inspection done:** Fetched blockstates and atlas-index from `~/.minecraft-assets-cache/generated/1.21.9/`. grass_block up face UVs match `grass_block_top` exactly (not gravel). Root cause was V-axis flip (see below).
2. **Atlas builder:** In minecraft-interface asset-pipeline, confirm texture name to atlas position for `grass_block_top` and that blockstates-builder resolves the grass_block model’s `#top` to that texture’s UVs.
3. **Optional:** Add a one-off log in `buildGeometryFromModel` for grass_block’s "up" face: log `face.texture` (u, v, su, sv) to confirm what the builder receives.

**Root cause (confirmed):** Pipeline atlas is built with 2D canvas (v = y / atlasSize), so v=0 at image top. The correct fix is to load the texture with `flipY = false` (in `use-atlas-material.ts`) so GPU v=0 also maps to image top — pipeline UVs then sample the correct atlas row with no per-face math. The initial attempt used `flipY = true` which is backwards: it flips the image so GPU v=0 maps to image bottom, causing pipeline UVs to sample the wrong row (e.g. stone at row 85 would hit row 43 instead).

**Additional fix:** `bakeBlockAO()` (ambient-occlusion.ts) was hardcoded for 24 vertices (standard BoxGeometry). Mc-assets models like `grass_block` have more vertices (40 for grass_block's overlay element), causing WebGL `GL_INVALID_OPERATION: Vertex buffer is not big enough` errors. Fixed by passing `vertexCount` from the geometry's actual position attribute count.

---

## Platform Lowering (completed)

**Goal:** Lower the platform below the build surface so template buildings build on top of the platform, not inside it. Grid at layer 0, platform below, builds start at y=0.

### Y-coordinate layout (after change)

| Y | Content |
|---|---------|
| -2 | Stone base (inside ellipse) |
| -1 | `grass_block` — green top, dirt sides (inside ellipse) |
| 0 | Vegetation (edge band); **build surface** (grid overlay, click plane) |
| 1 | `tall_grass` upper half (when tall_grass); placed blocks start here |

### Changes made

1. **platform-terrain.ts**: Shifted stone to y=-2, grass_block to y=-1, vegetation to y=0/1. Extended ellipse with 3-block padding past grid edges for natural island look.
2. **block-canvas.tsx**: Grid position y=1.02→0.02, click plane y=1→0, camera target y=2→1, camera position [12,10,12]→[14,12,14] for better overview angle.
3. **use-block-placement.ts**: Floor snap y=1→0, floor placement y=2→0 in handleFloorPointerDown, handlePointerMove, and getGhostPosition.

### Verification

- Platform stone/grass visible below the blue grid overlay
- Vegetation renders at grid level with transparent backgrounds
- Block placement on floor starts at y=0 (on the grass surface)
- No WebGL errors; zero type errors
