# Prismarine-Viewer Replacement Analysis

**Date**: 2026-02-03 (updated 2026-02-08)
**Purpose**: Document what it would take to replace prismarine-viewer entirely and analyze the upstream dependency chain.

---

## Executive Summary

**Current State**: We've built a standalone Vite-built viewer (`src/viewer/`) that replaces prismarine-viewer's browser client entirely. The only remaining dependency on prismarine-viewer is its server-side `mineflayer.js` WebSocket relay. We now have:
- Our own Three.js rendering (scene, camera, controls) in `src/viewer/client/`
- Our own chunk meshing worker (~525KB, down from 255MB) in `src/viewer/meshing/`
- Our own entity rendering with bone hierarchy and cube rotation fixes in `src/viewer/entities/`
- Our own sky dome and weather effects in `src/viewer/effects/`
- Our own animated material shader in `src/viewer/renderer/`

**Recommendation**: We have effectively completed Phase 3 (Custom Viewer). The remaining prismarine-viewer dependency is minimal (server-side WebSocket relay only). Minecraft 1.21.9 is fully supported with no version rollback needed.

---

## 1. Current Dependency Chain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONSCIOUS-BOT                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌──────────────────┐    ┌────────────────────────┐  │
│  │  Custom Asset   │    │  prismarine-     │    │     mineflayer         │  │
│  │    Pipeline     │───▶│    viewer        │◀───│   (bot interface)      │  │
│  │                 │    │                  │    │                        │  │
│  │ • JAR extraction│    │ • Three.js scene │    │ • MC protocol impl     │  │
│  │ • Atlas builder │    │ • Worker.js mesh │    │ • World state          │  │
│  │ • Blockstates   │    │ • WebSocket comm │    │ • Entity tracking      │  │
│  │ • Animations    │    │ • Camera/controls│    │ • Events/actions       │  │
│  └─────────────────┘    └──────────────────┘    └────────────────────────┘  │
│           │                      │                         │                 │
│           │                      │                         │                 │
│           ▼                      ▼                         ▼                 │
│  ┌─────────────────┐    ┌──────────────────┐    ┌────────────────────────┐  │
│  │  Mojang APIs    │    │     three.js     │    │  node-minecraft-       │  │
│  │ (version manifest)   │  (WebGL render)  │    │    protocol            │  │
│  └─────────────────┘    └──────────────────┘    └────────────────────────┘  │
│                                  │                         │                 │
│                                  │                         │                 │
│                                  ▼                         ▼                 │
│                         ┌──────────────────┐    ┌────────────────────────┐  │
│                         │    minecraft-    │    │   prismarine-world     │  │
│                         │      data        │    │   prismarine-chunk     │  │
│                         │                  │    │   prismarine-block     │  │
│                         │ (block registry, │    │   prismarine-biome     │  │
│                         │  protocol defs)  │    │   prismarine-entity    │  │
│                         └──────────────────┘    └────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. What We've Already Replaced

| Component | Status | Our Implementation |
|-----------|--------|-------------------|
| Version management | ✅ Replaced | `version-resolver.ts` fetches Mojang manifest |
| Asset source | ✅ Replaced | `jar-downloader.ts` + `asset-extractor.ts` |
| Texture atlas | ✅ Replaced | `atlas-builder.ts` (canvas-based) |
| Blockstate resolution | ✅ Replaced | `blockstates-builder.ts` |
| Animated textures | ✅ Replaced | `animated-material.ts` (custom shader) |
| Asset serving | ✅ Replaced | `asset-server.ts` (Express middleware) |

**Result**: We no longer depend on `minecraft-assets` npm package for new Minecraft versions.

---

## 3. What Prismarine-Viewer Still Provides

### 3.1 Worker.js (Chunk Mesh Building)

**What it does**: Converts block data → Three.js BufferGeometry

```
Chunk Data (from mineflayer)
       ↓
  Parse palette
       ↓
  For each block:
    • Resolve blockstate variant
    • Fetch model definition
    • Build face geometry (6 faces per cube, culled)
    • Map UV coordinates to atlas
    • Add vertex colors (AO, biome tint)
       ↓
  BufferGeometry (positions, normals, uvs, colors)
       ↓
  Transfer to main thread
       ↓
  THREE.Mesh
```

**Complexity to replace**: ~2000 lines of geometry logic, multipart conditions, model inheritance

### 3.2 WebSocket Communication

**What it does**: Relays bot state to browser in real-time

```typescript
// Server side (lib/mineflayer.js)
bot.on('move', () => socket.emit('position', bot.entity.position))
bot.world.on('blockUpdate', (block) => socket.emit('blockUpdate', block))

// Client side
socket.on('position', (pos) => viewer.camera.position.set(pos.x, pos.y, pos.z))
socket.on('blockUpdate', (block) => viewer.world.setBlock(block))
```

**Complexity to replace**: ~500 lines, well-defined protocol

### 3.3 Browser Client

**What it does**: HTML/JS viewer application

- Canvas setup and resize handling
- Input handling (mouse, keyboard)
- POV toggle (first/third person)
- Orbit controls
- Entity rendering

**Complexity to replace**: ~1500 lines, mostly Three.js boilerplate

### 3.4 Three.js Scene Management

**What it does**: Organizes 3D objects, handles rendering

```typescript
scene.add(chunkMeshGroup)
scene.add(entityGroup)
scene.add(ambientLight)
scene.add(directionalLight)
renderer.render(scene, camera)
```

**Complexity to replace**: Would just be writing a new Three.js app

---

## 4. Full Replacement Architecture

If we wanted to eliminate prismarine-viewer entirely:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CUSTOM MINECRAFT VIEWER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        packages/viewer (NEW)                           │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                        │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │ │
│  │  │  chunk-mesher/   │  │   renderer/      │  │    client/           │ │ │
│  │  │                  │  │                  │  │                      │ │ │
│  │  │  • worker.ts     │  │  • scene.ts      │  │  • index.html        │ │ │
│  │  │  • geometry.ts   │  │  • materials.ts  │  │  • app.ts            │ │ │
│  │  │  • culling.ts    │  │  • lighting.ts   │  │  • controls.ts       │ │ │
│  │  │  • ao.ts         │  │  • camera.ts     │  │  • input.ts          │ │ │
│  │  │  • tinting.ts    │  │  • entities.ts   │  │  • ui.ts             │ │ │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────────┘ │ │
│  │           │                     │                      │              │ │
│  │           └─────────────────────┼──────────────────────┘              │ │
│  │                                 │                                     │ │
│  │  ┌──────────────────────────────▼─────────────────────────────────┐  │ │
│  │  │                      comms/                                     │  │ │
│  │  │                                                                 │  │ │
│  │  │  • websocket-server.ts (Node.js, receives mineflayer events)   │  │ │
│  │  │  • websocket-client.ts (Browser, renders updates)              │  │ │
│  │  │  • protocol.ts (message types, serialization)                  │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │              packages/minecraft-interface (EXISTING)                   │ │
│  │                                                                        │ │
│  │  • asset-pipeline/ (already built)                                    │ │
│  │  • mineflayer integration (already built)                             │ │
│  │  • viewer-enhancements.ts (port to new viewer)                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Effort Estimation

### 5.1 Components to Build

| Component | Effort | Lines (est.) | Dependencies |
|-----------|--------|--------------|--------------|
| **Chunk mesher worker** | High | 1500-2000 | three.js, our blockstates |
| **Geometry builder** | High | 800-1200 | - |
| **AO calculation** | Medium | 200-300 | - |
| **Biome tinting** | Low | 100-150 | minecraft-data biomes |
| **Face culling** | Medium | 300-400 | - |
| **Scene manager** | Low | 300-500 | three.js |
| **Material system** | Done | - | our animated-material.ts |
| **Camera controls** | Low | 200-300 | three.js OrbitControls |
| **Entity renderer** | Medium | 500-800 | Entity model JSONs |
| **WebSocket protocol** | Low | 300-400 | ws |
| **Browser client** | Medium | 800-1200 | - |
| **Build system** | Low | 100-200 | vite/esbuild |

**Total estimated effort**: 5000-7500 lines of code, 2-4 weeks full-time

### 5.2 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Geometry bugs (holes, z-fighting) | High | High | Port existing worker.js logic |
| Performance regression | Medium | High | Profile early, use SharedArrayBuffer |
| Animation timing issues | Low | Medium | Already solved in our shader |
| Entity model gaps | High | Low | Fallback to cubes (like now) |
| Browser compatibility | Low | Medium | Stick to WebGL1 baseline |

---

## 6. Upstream Chain: What Else Could Be Replaced?

### 6.1 mineflayer → Custom Protocol Client

**What mineflayer provides**:
- Minecraft protocol implementation (login, encryption, compression)
- World state management (chunks, entities, players)
- Bot actions (movement, block interaction, inventory)
- Plugin system (pathfinder, collectblock, etc.)

**Effort to replace**: 6+ months, 50k+ lines
**Recommendation**: ❌ Keep mineflayer - mature, well-maintained, essential

### 6.2 minecraft-data → Direct Mojang Data

**What minecraft-data provides**:
- Block registry (IDs, names, properties)
- Item registry
- Entity registry
- Protocol definitions
- Biome data

**What we already do**:
- Extract blockstates from JARs
- Build our own atlas

**Could additionally do**:
- Parse `blocks.json` from JAR
- Parse `registries.json` from JAR
- Parse protocol from decompiled code

**Effort**: Medium (1-2 weeks per data type)
**Recommendation**: ⚠️ Partial - keep minecraft-data for protocol, use JARs for rendering data

### 6.3 prismarine-* Libraries

| Library | Purpose | Replace? |
|---------|---------|----------|
| prismarine-world | Chunk storage/access | No - tightly coupled to mineflayer |
| prismarine-chunk | Chunk data structures | No - protocol-dependent |
| prismarine-block | Block definitions | Maybe - could use JAR data |
| prismarine-entity | Entity metadata | No - needed for spawning |
| prismarine-nbt | NBT parsing | No - essential format |
| prismarine-biome | Biome definitions | Maybe - in JAR |

---

## 7. Recommended Path Forward

### Phase 1: Maintain Current Architecture (Now)
- ✅ Custom asset pipeline (done)
- ✅ Animated textures (done)
- ✅ Patch for new versions (done)
- Keep prismarine-viewer as rendering backend

### Phase 2: Reduce Patch Surface (Optional)
- Extract worker.js mesh logic into TypeScript module
- Build meshes server-side, send pre-built geometry
- Reduces browser-side complexity
- **Effort**: 2-3 weeks

### Phase 3: Custom Viewer (Only If Needed)
Triggers for this phase:
- prismarine-viewer becomes unmaintained
- Need features PV can't support (VR, mobile, etc.)
- Performance requirements exceed PV capabilities

**If triggered**:
1. Port chunk mesher to TypeScript worker
2. Build minimal Three.js renderer
3. Implement WebSocket protocol
4. Create browser client
5. Migrate viewer-enhancements.ts

### Phase 4: Protocol Independence (Far Future)
Only if mineflayer becomes unmaintained:
- Implement Minecraft protocol directly
- Likely never needed given PrismarineJS community

---

## 8. Key Insights

`★ Insight ─────────────────────────────────────`
**Why Full Replacement Has Diminishing Returns**:

1. **Worker.js is the hard part** - The chunk mesher handles 100+ block variants, multipart rendering (redstone, fences), model inheritance, and AO calculation. This is 2000+ lines of battle-tested geometry code.

2. **Three.js is unavoidable** - Any WebGL renderer will use Three.js or a similar library. Replacing prismarine-viewer doesn't eliminate this dependency.

3. **The asset layer was the real bottleneck** - We solved the actual problem (new MC version support) with our custom pipeline. The rendering layer works fine.

4. **Maintenance burden** - A custom viewer means maintaining geometry code when Minecraft changes block rendering (1.13 flattening, 1.14 lighting changes, etc.).
`─────────────────────────────────────────────────`

---

## 9. Files Reference

### Our Custom Pipeline (Already Built)
```
packages/minecraft-interface/src/asset-pipeline/
├── index.ts                 # Exports
├── types.ts                 # Type definitions (457 lines)
├── version-resolver.ts      # Mojang manifest client
├── jar-downloader.ts        # JAR download + cache
├── asset-extractor.ts       # ZIP extraction (yauzl)
├── atlas-builder.ts         # Texture atlas (canvas)
├── blockstates-builder.ts   # Model resolution
├── animated-material.ts     # Three.js shader
├── viewer-integration.ts    # PV integration hooks
├── asset-server.ts          # Express middleware
└── pipeline.ts              # Orchestrator
```

### Prismarine-Viewer (Would Need Replacement)
```
node_modules/prismarine-viewer/
├── lib/
│   ├── mineflayer.js        # Bot integration
│   └── index.js             # Entry point
├── viewer/lib/
│   ├── viewer.js            # Main viewer class
│   ├── worldrenderer.js     # Chunk management
│   ├── worker.js            # Mesh builder (WebWorker)
│   ├── entities.js          # Entity rendering
│   └── utils.web.js         # Browser utilities
└── public/
    ├── index.html           # Browser client
    ├── index.js             # Bundled client JS
    └── worker.js            # Bundled worker
```

---

## 10. Personal / Custom Skin Loading (Diagnosis)

When the in-browser Prismarine viewer shows the bot, the **player** entity uses a texture path defined in prismarine-viewer’s `entities.json`: `textures/entity/steve`. The client resolves that to:

- **Request**: `GET /mc-assets/entity/{version}/entity/steve.png`  
  (from `Entity.js` → `resolveEntityTexturePath()` → `globalThis.__ASSET_SERVER_URL` + `/mc-assets/entity/${version}/${normalized}.png`).

The **asset server** (`asset-server.ts`) serves entity textures under `GET /mc-assets/entity/:version/*`. For `steve.png` it:

1. Tries **generated** paths under the pipeline’s `rawAssetsPath` (e.g. `entity/steve.png`, or `entity/player/wide/steve.png` / `entity/player/slim/steve.png` via `playerSkinCandidates`).
2. Falls back to **bundled** assets from prismarine-viewer’s `public` dir:  
   `pvPublicDir/textures/{version}/entity/...` (same flat path and `player/wide|slim/steve.png` candidates).

So the custom skin is only used if a **steve.png** (or `player/wide/steve.png` / `player/slim/steve.png`) file exists in either the generated output or prismarine-viewer’s `public/textures/{version}/entity/...`.

**How the skin gets there**

- Script: `packages/minecraft-interface/scripts/inject-entity-textures.cjs`
- It copies your PNG to prismarine-viewer’s `public/textures/{version}/entity/player/wide/steve.png` and `.../slim/steve.png`, and to fallback versions (e.g. 1.16.4) when those dirs exist.
- **Postinstall** (`rebuild-prismarine-viewer.cjs`) runs this script in the **background** and only passes `--custom-skin` if `~/Downloads/createdSkin.png` **already exists** at install time. If the file was added later, or postinstall stderr was discarded (`2>/dev/null`), the custom skin is never injected.

**Why your personal texture might not load**

1. **Skin not injected** – `createdSkin.png` was not present (or not at `~/Downloads/createdSkin.png`) when you ran `pnpm install`, so the inject never ran with `--custom-skin`.
2. **Inject ran in background** – Postinstall runs the inject detached with `stdio: 'ignore'`, so it may fail or run after the process exits; you don’t see errors.
3. **Wrong prismarine-viewer copy (pnpm)** – Inject uses `require.resolve('prismarine-viewer/package.json')`; the app may resolve a different copy, so the skin is written to a different `public/` than the one the server uses.

**Fix: run the inject script manually**

From repo root (or `packages/minecraft-interface`):

```bash
cd packages/minecraft-interface
node scripts/inject-entity-textures.cjs 1.21.9 --custom-skin /Users/darianrosebrook/Downloads/createdSkin.png
```

Use the same Minecraft version as your bot (e.g. `MINECRAFT_VERSION` or default 1.21.9). Then restart the minecraft-interface server and reload the viewer. The asset server will serve the injected file from prismarine-viewer’s `public/textures/{version}/entity/player/wide/steve.png` (or slim) as **bundled** fallback.

**Optional: use env for custom skin path**

When running the rebuild (e.g. after adding the skin file), set `CUSTOM_SKIN_PATH` so the inject runs synchronously and uses your path:

```bash
CUSTOM_SKIN_PATH=/Users/darianrosebrook/Downloads/createdSkin.png node scripts/rebuild-prismarine-viewer.cjs
```

Or run the inject script directly (no rebuild needed if viewer is already built):

```bash
node scripts/inject-entity-textures.cjs 1.21.9 --custom-skin /Users/darianrosebrook/Downloads/createdSkin.png
```

---

## 11. Decision Matrix

| Scenario | Recommended Action |
|----------|-------------------|
| New MC version not in PV | Use our asset pipeline (current approach) |
| PV has rendering bug | Patch or work around |
| Need animated textures | Use our ShaderMaterial (done) |
| PV unmaintained for 1+ year | Begin Phase 3 (custom viewer) |
| Need VR/AR support | Custom viewer with WebXR |
| Need mobile support | Custom viewer with touch controls |
| Performance issues | Profile first, consider Phase 2 |

---

## Conclusion

**The standalone viewer migration is effectively complete.** We have replaced prismarine-viewer's browser client with our own Vite-built viewer in `src/viewer/`. The only remaining prismarine-viewer dependency is the server-side WebSocket relay (`mineflayer.js`), which is a thin event bridge.

**Key wins from the migration**:
- **No version rollback**: Minecraft 1.21.9 fully supported, no need to fall back to 1.21.4
- **No fragile patches**: Eliminated pnpm patch + webpack rebuild workflow
- **Fixed entity geometry**: Bone hierarchy (absolute→relative pivots) and cube rotation (pivot-centered) bugs fixed — these existed in the original prismarine-viewer and were never fixed upstream
- **Small bundles**: Worker reduced from 255MB to 525KB via minecraft-data shim
- **Modern THREE.js**: Using 0.179 instead of prismarine-viewer's 0.128

**The remaining prismarine-viewer dependency** (server-side WebSocket relay) could be replaced with ~200 lines of custom code if needed, but provides no immediate benefit since it works correctly.
