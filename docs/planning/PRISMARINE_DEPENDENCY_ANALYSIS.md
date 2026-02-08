# Prismarine Dependency Analysis & Replacement Roadmap

> **Purpose**: Document our reliance on the prismarine ecosystem and outline what we need to fully replace it with custom implementations.

## Executive Summary

The conscious-bot project relies on the **prismarine ecosystem** for Minecraft protocol handling, world representation, and 3D visualization. We've already built a custom asset pipeline that eliminates version lag, but several core dependencies remain. This document catalogs all prismarine dependencies and provides a clear replacement roadmap.

**Current Status**: Standalone viewer with minimal prismarine-viewer dependency
- ✅ **Replaced**: Asset extraction, texture atlases, blockstate processing
- ✅ **Replaced**: Skeletal entity animations (walk/idle cycles)
- ✅ **Replaced**: POV switching and orbit controls
- ✅ **Replaced**: Animated textures (water/lava/fire with frame interpolation)
- ✅ **Replaced**: Day/night lighting cycle (Minecraft-accurate colors)
- ✅ **Replaced**: Entity bone hierarchy (absolute→relative pivot conversion for THREE.js 0.179)
- ✅ **Replaced**: Cube rotation pivot fix (39 cubes across 13 entity types)
- ✅ **Replaced**: Sky dome (procedural sun/moon/stars)
- ✅ **Replaced**: Weather effects (rain, snow, lightning)
- ✅ **Replaced**: Browser client (standalone Vite-built viewer, no webpack patches)
- ✅ **Working**: Player skins (via Microsoft auth + ONLINE_MODE)
- ✅ **Working**: Custom asset server for MC 1.21.5-1.21.9 textures
- ✅ **Working**: Minecraft 1.21.9 (no version rollback needed)
- ❌ **Not Started**: Physics simulation replacement (keeping prismarine-physics)

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

### 2.2 Standalone Viewer ✅

**Location**: `packages/minecraft-interface/src/viewer/`

We maintain our own standalone viewer built with Vite, replacing the previous approach of patching prismarine-viewer's webpack-built client. This gives us full control over the rendering pipeline, eliminates fragile postinstall/patch workflows, and allows us to use modern THREE.js (0.179).

| Directory | Purpose |
|-----------|---------|
| `entities/Entity.js` | Bedrock model → THREE.js SkinnedMesh with bone hierarchy fix |
| `entities/entities.js` | Entity manager with skeletal animation, fallbacks, frustum culling |
| `entities/entities.json` | Bedrock-format entity geometry definitions (30+ entity types) |
| `effects/sky-renderer.js` | Procedural sky dome with sun, moon, stars |
| `effects/weather-system.js` | Rain, snow, lightning particle systems |
| `renderer/animated-material-client.js` | Custom ShaderMaterial for water/lava/fire |
| `meshing/worker.js` | Web Worker for chunk meshing (~525KB bundle) |
| `meshing/minecraft-data-shim.js` | Stubs unused minecraft-data (255MB→525KB) |
| `client/index.js` | Three.js scene, camera, controls |
| `server/mineflayer.js` | WebSocket relay (bot → browser) |
| `index.js` | Client entry with POV toggle, orbit controls, asset loading |

**Build**:
```bash
cd packages/minecraft-interface
NODE_OPTIONS='--max-old-space-size=8192' npx vite build --config src/viewer/vite.config.js
# Output: dist/index.html, dist/assets/index-*.js (~1950KB), dist/assets/worker-*.js (~525KB)
```

**Key fixes over original prismarine-viewer**:
- **Bone hierarchy**: Converts absolute Bedrock pivots to parent-relative positions for THREE.js 0.179
- **Cube rotation**: Rotates around bone pivot instead of world origin (fixes chicken body, minecarts, arrows)
- **Worker size**: minecraft-data shim reduces bundle from 255MB to ~525KB
- **Camera race condition**: Buffers initial position events for viewer startup

### 2.3 Skeletal Animation System ✅

**Location**: `packages/minecraft-interface/src/asset-pipeline/entity-animations.ts`

Full TypeScript implementation with additional states beyond what's in the patch:

| Animation | Biped | Quadruped | Notes |
|-----------|-------|-----------|-------|
| Idle | ✅ | ✅ | Subtle breathing/sway |
| Walk | ✅ | ✅ | Leg swing, arm counterswing |
| Run | ✅ | ❌ | Faster cycle, forward lean |
| Jump | ✅ | ❌ | Crouch → extend → tuck |
| Fall | ✅ | ❌ | Arms out for balance |

**Supported Entities** (30+):
- Biped: player, zombie, skeleton, creeper, enderman, villager, pillager, etc.
- Quadruped: pig, cow, sheep, wolf, horse, fox, rabbit, etc.

### 2.4 Animated Texture System ✅

**Location**: `packages/minecraft-interface/src/prismarine-viewer-src/animated-material-client.js`

Custom ShaderMaterial that replaces prismarine-viewer's default `MeshLambertMaterial`:

| Feature | Implementation | Notes |
|---------|---------------|-------|
| UV Animation | Fragment shader with time uniform | Offsets UV based on frame timing |
| Frame Interpolation | `mix()` between adjacent frames | Smooth water/lava/fire |
| Day/Night Cycle | Color interpolation uniforms | Minecraft-accurate day/twilight/night colors |
| Animation Map | DataTexture lookup | Encodes frametime, frameCount, frameVStep, flags |

**Shader Uniforms**:
```glsl
uniform sampler2D map;              // Texture atlas
uniform sampler2D animationMap;     // Animation metadata lookup
uniform float time;                 // Updated each frame
uniform float dayProgress;          // 0=midnight, 0.5=noon
uniform vec3 dayAmbientColor;       // White at noon
uniform vec3 nightAmbientColor;     // Blue at midnight
uniform vec3 twilightAmbientColor;  // Orange at dawn/dusk
```

**Integration Flow**:
```
socket.on('version') → loadCustomBlockStates() → setupAnimatedMaterial()
                                                        ↓
                                               generateAnimationMap(blockStates)
                                                        ↓
                                               createAnimatedMaterial(texture, animMap)
                                                        ↓
                                               viewer.world.material = animatedMaterial
                                                        ↓
animate() loop → updateAnimatedMaterial(material, deltaTime)
```

### 2.5 Player Skins ✅

**Mechanism**: Microsoft Authentication + Online Mode

Player skins work through Mojang's session authentication system, not custom loading:

| Component | Setting | Purpose |
|-----------|---------|---------|
| Docker Minecraft | `ONLINE_MODE: "TRUE"` | Validates players via Mojang session servers |
| Bot Config | `auth: 'microsoft'` | Uses Microsoft OAuth for authentication |
| Session Server | `sessionserver.mojang.com` | Provides skin textures during auth |

**How It Works**:
1. Bot connects with `auth: 'microsoft'` → triggers Microsoft OAuth flow
2. Mineflayer exchanges token with Mojang session server
3. Session server validates and provides player UUID + skin URL
4. Minecraft server receives skin data and distributes to all clients
5. Prismarine-viewer receives skin through protocol, no custom code needed

**Requirements**:
- Microsoft account with Minecraft: Java Edition
- Docker running with `ONLINE_MODE=TRUE`
- First-time connection prompts for Microsoft login

### 2.6 Viewer Independence (no patches needed) ✅

The standalone viewer in `src/viewer/` has eliminated the need for pnpm patches to prismarine-viewer's client-side code. The only remaining use of prismarine-viewer is its server-side `mineflayer.js` WebSocket relay, which bridges bot events to the browser. Our viewer connects to this same WebSocket but renders everything with our own code.

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

### 3.2 Entity Rendering (Mostly Complete)

**Current**: Standalone viewer with full entity pipeline

**What We've Built** ✅:
- Skeletal animation system with AnimationMixer per entity
- Walk/idle cycles for bipeds and quadrupeds
- Velocity-based animation state machine
- Smooth crossfade transitions (0.2s)
- Bone hierarchy fix: absolute→relative pivot conversion for THREE.js 0.179
- Cube rotation fix: pivot-centered rotation (fixes chicken, minecarts, arrows, striders)
- Entity fallback system for unknown types (goat→sheep, glow_squid→squid, etc.)
- Frustum culling for entity visibility
- Name tag rendering (canvas-based sprites with distance scaling)
- Shadow projection (simple disc shadow)
- Cape rendering

**What Still Needs Work**:
- Equipment rendering (armor, held items)

**What's Now Working** ✅:
- Player skins (via Microsoft auth + ONLINE_MODE)
- 30+ entity types with correct 3D geometry
- Entities verified on Minecraft 1.21.9

**Remaining Estimate**:
- Lines of code: 200-400 (equipment only)
- Time: 2-3 days
- Complexity: Medium

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

### Phase 1: Foundation ✅ Complete
- [x] Custom asset extraction from Minecraft JARs
- [x] Texture atlas generation with UV mapping
- [x] BlockState and model resolution
- [x] Animated texture shader (interpolation + sequences)
- [x] Day/night lighting interpolation
- [x] Frame sequence lookup for non-sequential animations

### Phase 2: Entity Animation ✅ Complete
- [x] Skeletal animation system architecture
- [x] Biped walk/idle cycles (legs, arms, body)
- [x] Quadruped walk/idle cycles (trot gait)
- [x] Velocity-based animation state machine
- [x] Smooth crossfade transitions
- [x] POV toggle (1st/3rd person)
- [x] Orbit controls for 3rd person view

### Phase 3: Enhanced Rendering (Mostly Complete)
- [x] Animated textures (water, lava, fire, sea lantern, etc.)
- [x] Day/night lighting cycle with smooth transitions
- [x] Player skins (via Microsoft auth)
- [x] Custom asset server for MC 1.21.5-1.21.9
- [x] Custom sky rendering (procedural sun/moon/stars dome)
- [x] Weather effects (rain, snow, lightning particles)
- [x] Entity bone hierarchy fix (absolute→relative pivots for THREE.js 0.179)
- [x] Entity cube rotation fix (pivot-centered rotation for 39 cubes/13 entity types)
- [x] Standalone Vite-built viewer (no webpack patches)
- [x] Worker bundle optimization (255MB→525KB via minecraft-data shim)
- [ ] Block lighting (torch light, redstone)
- [ ] Entity equipment rendering (armor, held items)

### Phase 4: Chunk Meshing (Future)
- [ ] WebWorker-based mesh generation
- [ ] Face culling algorithm
- [ ] Ambient occlusion calculation
- [ ] Multipart model resolver
- [ ] Biome tinting system

### Phase 5: Full Independence (Long-term)
- [ ] Remove prismarine-viewer dependency entirely
- [ ] Custom WebSocket protocol for viewer communication
- [ ] Standalone viewer package (`@conscious-bot/viewer`)

---

## 5. Code Organization Strategy

### 5.1 Directory Structure

Our viewer code is organized in two tiers — the standalone viewer (browser) and the asset pipeline (server):

```
packages/minecraft-interface/src/
├── viewer/                            # Standalone Vite-built viewer (browser-side)
│   ├── index.html                     # Entry HTML
│   ├── index.js                       # Client entry (POV, orbit, assets, animated material)
│   ├── vite.config.js                 # Build config
│   ├── entities/
│   │   ├── Entity.js                  # Bedrock model → SkinnedMesh (bone hierarchy fix)
│   │   ├── entities.js                # Entity manager, animation, fallbacks, culling
│   │   ├── entities.json              # Bedrock-format entity geometry (30+ types)
│   │   ├── entity-extras.js           # Name tags, shadows, capes
│   │   └── equipment-renderer.js      # (in progress)
│   ├── meshing/
│   │   ├── worker.js                  # Web Worker for chunk meshing
│   │   ├── minecraft-data-shim.js     # Stubs unused data (255MB→525KB)
│   │   ├── world.js                   # Chunk mesh management
│   │   └── models.js                  # Block model → geometry
│   ├── effects/
│   │   ├── sky-renderer.js            # Procedural sky dome
│   │   └── weather-system.js          # Rain, snow, lightning
│   ├── renderer/
│   │   └── animated-material-client.js # ShaderMaterial for texture animations
│   ├── client/
│   │   └── index.js                   # Three.js scene, camera, controls
│   ├── server/
│   │   └── mineflayer.js              # WebSocket relay (bot → browser)
│   └── utils/
│       └── utils.web.js               # Texture loading, browser utilities
│
├── asset-pipeline/                    # Server-side asset processing
│   ├── entity-animations.ts           # Skeletal animation system (authoritative)
│   ├── animated-material.ts           # Custom shaders
│   ├── viewer-integration.ts          # Hooks into viewer startup
│   ├── atlas-builder.ts               # Texture atlas (replaces minecraft-assets)
│   ├── blockstates-builder.ts         # Model resolution
│   ├── asset-extractor.ts             # JAR extraction
│   ├── jar-downloader.ts              # Version management
│   ├── version-resolver.ts            # Mojang manifest client
│   ├── asset-server.ts                # Serves custom assets
│   └── pipeline.ts                    # Orchestrates generation
│
└── viewer-enhancements.ts             # Server-side bot↔viewer bridge
```

### 5.2 Migration Status

The previous three-tier strategy (Patches → Enhancements → Replacement) has been superseded. We have completed the migration to a standalone viewer:

| Previous Tier | Status | Current State |
|---------------|--------|---------------|
| **Tier 1: Patches** | ✅ Eliminated | No pnpm patches needed for viewer client |
| **Tier 2: Enhancements** | ✅ Active | Asset pipeline, viewer-enhancements.ts |
| **Tier 3: Replacement** | ✅ Complete | `src/viewer/` is the standalone viewer |

### 5.3 Current Prismarine Usage

Prismarine-viewer is only used for its server-side WebSocket relay:

```
packages/minecraft-interface/
├── bin/mc-viewer.ts                    # import { mineflayer as createViewer } from 'prismarine-viewer'
├── src/server.ts                       # import { mineflayer as startMineflayerViewer } from 'prismarine-viewer'
└── src/viewer-enhancements.ts          # Wraps prismarine-viewer with custom features
```

The browser-side rendering is entirely our own code in `src/viewer/`.

### 5.4 Viewer Build Workflow

```bash
# Build the standalone viewer
cd packages/minecraft-interface
NODE_OPTIONS='--max-old-space-size=8192' npx vite build --config src/viewer/vite.config.js

# Output:
#   dist/index.html
#   dist/assets/index-*.js   (~1950KB)
#   dist/assets/worker-*.js  (~525KB)
```

No patch regeneration is needed — edit files directly in `src/viewer/` and rebuild.

---

## 6. Decision Matrix

| Component | Status | Reason |
|-----------|--------|--------|
| Asset extraction | ✅ Done | Version independence achieved |
| Texture atlases | ✅ Done | Custom animations working |
| Animated materials | ✅ Done | Frame interpolation, day/night working |
| Skeletal animations | ✅ Done | Walk/idle cycles for 30+ entities |
| POV switching | ✅ Done | 1st/3rd person with orbit controls |
| Custom asset server | ✅ Done | MC 1.21.5-1.21.9 support |
| Player skins | ✅ Done | Via Microsoft auth (no code needed) |
| Day/night cycle | ✅ Done | Smooth color interpolation |
| Sky dome | ✅ Done | Procedural sun/moon/stars |
| Weather effects | ✅ Done | Rain, snow, lightning |
| Entity bone hierarchy | ✅ Done | Absolute→relative pivot fix for THREE.js 0.179 |
| Entity cube rotation | ✅ Done | Pivot-centered rotation (13 entity types) |
| Standalone viewer | ✅ Done | Vite-built, no webpack patches needed |
| Worker optimization | ✅ Done | 255MB→525KB via minecraft-data shim |
| Entity equipment | ⏳ Next | Armor, held items needed |
| Physics | ❌ Keep | Pathfinding depends on it |
| Protocol handling | ❌ Keep | mineflayer is excellent |
| World storage | ❌ Keep | prismarine-world is solid |

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

*Last updated: 2026-02-08*
*Author: Claude Code*
