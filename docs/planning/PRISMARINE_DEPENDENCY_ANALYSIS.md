# Prismarine Dependency Analysis & Replacement Roadmap

> **Purpose**: Document our reliance on the prismarine ecosystem and outline what we need to fully replace it with custom implementations.

## Executive Summary

The conscious-bot project relies on the **prismarine ecosystem** for Minecraft protocol handling, world representation, and 3D visualization. We've already built a custom asset pipeline that eliminates version lag, but several core dependencies remain. This document catalogs all prismarine dependencies and provides a clear replacement roadmap.

**Current Status**: Hybrid approach
- ✅ **Replaced**: Asset extraction, texture atlases, blockstate processing
- ⏳ **In Progress**: Custom shader system for animations and lighting
- ❌ **Not Started**: Chunk meshing, entity rendering, physics simulation

---

## 1. Dependency Inventory

### 1.1 Direct Dependencies

| Package | Version | Location | Purpose | Replacement Priority |
|---------|---------|----------|---------|---------------------|
| `prismarine-viewer` | 1.33.0 | `packages/minecraft-interface` | 3D world rendering | Medium |
| `mineflayer` | 4.x | `packages/minecraft-interface` | Bot protocol & API | Low (keep) |

### 1.2 Transitive Dependencies (via mineflayer)

| Package | Version | Purpose | Replacement Priority |
|---------|---------|---------|---------------------|
| `prismarine-world` | 3.6.3 | Chunk storage & world queries | Low |
| `prismarine-chunk` | 1.39.0 | Chunk data structures | Low |
| `prismarine-block` | 1.22.0 | Block definitions & states | Low |
| `prismarine-entity` | 2.5.0 | Entity metadata | Low |
| `prismarine-physics` | 1.10.0 | Movement simulation | Medium |
| `prismarine-nbt` | 2.8.0 | NBT parsing | Low |
| `prismarine-item` | 1.17.0 | Item definitions | Low |
| `prismarine-recipe` | 1.3.1 | Crafting recipes | Low |
| `prismarine-biome` | 1.3.0 | Biome definitions | Low |
| `prismarine-windows` | 2.9.0 | Container/inventory windows | Low |
| `prismarine-chat` | 1.12.0 | Chat message parsing | Low |
| `prismarine-registry` | 1.11.0 | MC data registry | Low |
| `prismarine-auth` | 2.7.0 | Authentication | Low |
| `prismarine-realms` | 1.4.1 | Realms support | Low |

### 1.3 Mineflayer Plugins

| Plugin | Prismarine Dependency | Purpose |
|--------|----------------------|---------|
| `mineflayer-pathfinder` | prismarine-physics | A* pathfinding |
| `mineflayer-pvp` | prismarine-registry | Combat system |
| `mineflayer-collectblock` | prismarine-world | Item collection |
| `mineflayer-blockfinder` | prismarine-registry | Block detection |
| `mineflayer-tool` | prismarine-item | Tool selection |
| `mineflayer-auto-eat` | prismarine-item | Hunger management |

---

## 2. What We've Already Replaced

### 2.1 Custom Asset Pipeline ✅

**Location**: `packages/minecraft-interface/src/asset-pipeline/`

| Component | File | Replaces |
|-----------|------|----------|
| Version Resolver | `version-resolver.ts` | `minecraft-assets` version lookup |
| JAR Downloader | `jar-downloader.ts` | `minecraft-assets` bundled textures |
| Asset Extractor | `asset-extractor.ts` | `minecraft-assets` texture extraction |
| Atlas Builder | `atlas-builder.ts` | prismarine-viewer's atlas generation |
| BlockState Builder | `blockstates-builder.ts` | prismarine-viewer's model resolution |
| Animated Material | `animated-material.ts` | prismarine-viewer's basic animation |

**Benefits Achieved**:
- Support for Minecraft 1.21.5+ (beyond prismarine-viewer's 1.21.4 limit)
- Custom frame sequences for non-sequential animations (lava, fire)
- Smooth day/night lighting interpolation
- Direct JAR extraction eliminates NPM package version lag

### 2.2 Viewer Patches ✅

**Location**: `patches/prismarine-viewer@1.33.0.patch`

| Patch | Purpose |
|-------|---------|
| Entity.js | Graceful handling of unknown entities (trader_llama, glow_squid) |
| version.js | Extended version support (1.21.5 - 1.21.9) |
| webpack.config.js | Browser compatibility fixes |

---

## 3. What Still Needs Replacement

### 3.1 Chunk Meshing (High Effort)

**Current**: prismarine-viewer's `worker.js` (~2000 lines)

**Functionality**:
```
┌─────────────────────────────────────────────────────┐
│                 Chunk Meshing Pipeline              │
├─────────────────────────────────────────────────────┤
│  Input: Chunk data (palette + block states)         │
│         ↓                                           │
│  1. Parse block palette from chunk                  │
│  2. For each block position (16×384×16):            │
│     a. Resolve blockstate → model variant           │
│     b. Check neighbor blocks for face culling       │
│     c. Generate face vertices (with rotation)       │
│     d. Calculate ambient occlusion per vertex       │
│     e. Apply biome tinting (grass, leaves, water)   │
│     f. Map UV coordinates to atlas position         │
│         ↓                                           │
│  Output: BufferGeometry (positions, normals, uvs)   │
└─────────────────────────────────────────────────────┘
```

**Replacement Estimate**:
- Lines of code: 2500-4000
- Time: 2-3 weeks
- Complexity: High (multipart models, redstone states, fence connections)

**Key Challenges**:
- Multipart model resolution (fences, walls, redstone)
- Ambient occlusion calculation (8 neighbors per vertex)
- Face culling optimization (only render visible faces)
- Biome color interpolation (smooth transitions)

### 3.2 Entity Rendering (Medium Effort)

**Current**: prismarine-viewer's entity system

**Functionality**:
- Load entity models (JSON format)
- Apply textures and animations
- Handle equipment rendering (armor, held items)
- Player skin loading and capes

**Replacement Estimate**:
- Lines of code: 1000-1500
- Time: 1-2 weeks
- Complexity: Medium

**Key Challenges**:
- Skeletal animation system
- Equipment layering
- Name tag rendering
- Shadow projection

### 3.3 World Renderer Integration (Medium Effort)

**Current**: prismarine-viewer's main viewer class

**Functionality**:
- Scene management (Three.js)
- Camera controls (orbit, first-person)
- Chunk loading/unloading based on distance
- Fog and sky rendering
- Debug overlays (F3 screen)

**Replacement Estimate**:
- Lines of code: 800-1200
- Time: 1 week
- Complexity: Medium

### 3.4 Physics Simulation (Low Priority)

**Current**: prismarine-physics (via mineflayer-pathfinder)

**Functionality**:
- Gravity and jumping
- Collision detection
- Swimming and climbing
- Sprint and sneak modifiers

**Recommendation**: Keep using prismarine-physics. It's well-tested and pathfinding depends on accurate physics. Replacing it provides no benefit.

---

## 4. Replacement Roadmap

### Phase 1: Foundation (Current) ✅
- [x] Custom asset extraction from Minecraft JARs
- [x] Texture atlas generation with UV mapping
- [x] BlockState and model resolution
- [x] Animated texture shader (interpolation + sequences)
- [x] Day/night lighting interpolation

### Phase 2: Enhanced Rendering (Next)
- [ ] Custom sky rendering (sun/moon position, stars)
- [ ] Weather effects (rain, snow particles)
- [ ] Block lighting (torch light, redstone)
- [ ] Water/lava special rendering (transparency, flow)

### Phase 3: Chunk Meshing (Future)
- [ ] WebWorker-based mesh generation
- [ ] Face culling algorithm
- [ ] Ambient occlusion calculation
- [ ] Multipart model resolver
- [ ] Biome tinting system

### Phase 4: Entity System (Future)
- [ ] Entity model loader
- [ ] Skeletal animation system
- [ ] Equipment rendering
- [ ] Player skins and capes

### Phase 5: Full Independence (Long-term)
- [ ] Remove prismarine-viewer dependency entirely
- [ ] Custom WebSocket protocol for viewer communication
- [ ] Standalone viewer package

---

## 5. Code Locations Reference

### Current Prismarine Usage

```
packages/minecraft-interface/
├── bin/mc-viewer.ts                    # import { mineflayer as createViewer } from 'prismarine-viewer'
├── src/server.ts                       # import { mineflayer as startMineflayerViewer } from 'prismarine-viewer'
└── src/viewer-enhancements.ts          # Wraps prismarine-viewer with custom features
```

### Custom Replacements

```
packages/minecraft-interface/src/asset-pipeline/
├── animated-material.ts                # Custom Three.js shader (replaces basic animation)
├── atlas-builder.ts                    # Texture atlas (replaces minecraft-assets)
├── blockstates-builder.ts              # Model resolution (replaces viewer's loader)
├── asset-extractor.ts                  # JAR extraction (replaces minecraft-assets)
├── jar-downloader.ts                   # Version management (replaces minecraft-assets)
├── version-resolver.ts                 # Mojang manifest client
├── viewer-integration.ts               # Hooks into prismarine-viewer
├── asset-server.ts                     # Serves custom assets
└── pipeline.ts                         # Orchestrates generation
```

---

## 6. Decision Matrix

| Component | Replace? | Reason |
|-----------|----------|--------|
| Asset extraction | ✅ Yes | Version independence, done |
| Texture atlases | ✅ Yes | Custom animations, done |
| Animated materials | ✅ Yes | Frame sequences, day/night, done |
| Chunk meshing | ⏳ Maybe | High effort, prismarine-viewer works |
| Entity rendering | ⏳ Maybe | Medium effort, nice-to-have |
| Physics | ❌ No | Works well, pathfinding depends on it |
| Protocol handling | ❌ No | mineflayer is excellent, no benefit |
| World storage | ❌ No | prismarine-world is solid |

---

## 7. API Surface to Replace

If we fully replace prismarine-viewer, we need to implement these interfaces:

### 7.1 Viewer Class

```typescript
interface CustomViewer {
  // Initialization
  constructor(bot: Bot, options: ViewerOptions);

  // Lifecycle
  start(): Promise<void>;
  stop(): void;

  // Rendering
  render(): void;
  setFirstPersonCamera(entity: Entity): void;
  setThirdPersonCamera(entity: Entity, distance: number): void;

  // World updates
  updateBlock(position: Vec3, stateId: number): void;
  loadChunk(chunk: Chunk): void;
  unloadChunk(x: number, z: number): void;

  // Entity updates
  addEntity(entity: Entity): void;
  removeEntity(entityId: number): void;
  updateEntity(entity: Entity): void;

  // Time/lighting
  setTime(time: number): void;
  setWeather(weather: 'clear' | 'rain' | 'thunder'): void;
}
```

### 7.2 Mesh Generator

```typescript
interface ChunkMeshGenerator {
  // Generate mesh for a chunk
  generateMesh(
    chunk: Chunk,
    neighbors: NeighborChunks
  ): BufferGeometry;

  // Update single block
  updateBlock(
    mesh: BufferGeometry,
    position: Vec3,
    stateId: number,
    neighbors: Block[]
  ): void;
}
```

### 7.3 Entity Renderer

```typescript
interface EntityRenderer {
  // Create entity mesh
  createEntityMesh(entity: Entity): Object3D;

  // Update entity state
  updateEntityMesh(
    mesh: Object3D,
    entity: Entity,
    deltaTime: number
  ): void;

  // Equipment
  setEquipment(
    mesh: Object3D,
    slot: EquipmentSlot,
    item: Item | null
  ): void;
}
```

---

## 8. Risk Assessment

### 8.1 Risks of Keeping prismarine-viewer

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Version lag | High | Medium | Custom asset pipeline (done) |
| Unknown entities | Medium | Low | Patch system (done) |
| Breaking changes | Low | High | Pin version, test updates |
| Abandonment | Low | High | We have replacement path |

### 8.2 Risks of Full Replacement

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Bugs in meshing | High | High | Extensive testing needed |
| Performance regression | Medium | High | Profile and optimize |
| Development time | Certain | Medium | Prioritize incrementally |
| Maintenance burden | High | Medium | Good documentation |

---

## 9. Recommendations

### Short-term (Now)
1. **Keep prismarine-viewer** for chunk meshing and entity rendering
2. **Continue enhancing** our custom shader system
3. **Maintain patches** for version support and bug fixes

### Medium-term (3-6 months)
1. **Evaluate** if chunk meshing replacement is needed
2. **Consider** custom entity rendering if prismarine-viewer limits us
3. **Document** any additional pain points

### Long-term (6-12 months)
1. **Decide** on full replacement based on maintenance burden
2. **If replacing**, start with chunk meshing (highest value)
3. **Maintain backward compatibility** during transition

---

## 10. Appendix: File Sizes

Current prismarine-viewer footprint:

```
node_modules/prismarine-viewer/
├── viewer/                     # 2.1 MB (bundled JS)
├── public/                     # 15 MB (textures, models)
└── lib/                        # 500 KB (source)

Total: ~18 MB
```

Our custom asset pipeline:

```
packages/minecraft-interface/src/asset-pipeline/
├── *.ts                        # 45 KB (source)
└── dist/                       # Generated per-version
    └── 1.21.4/
        ├── terrain.png         # 1-4 MB (atlas)
        └── blockstates.json    # 2-5 MB (models)
```

---

*Last updated: 2026-02-04*
*Author: Claude Code*
