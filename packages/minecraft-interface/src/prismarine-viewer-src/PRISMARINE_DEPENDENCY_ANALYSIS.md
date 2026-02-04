# Prismarine Dependency Analysis & Replacement Roadmap

> **Purpose**: Document our reliance on the prismarine ecosystem and outline what we need to fully replace it with custom implementations.

## Executive Summary

The conscious-bot project relies on the **prismarine ecosystem** for Minecraft protocol handling, world representation, and 3D visualization. We've already built a custom asset pipeline that eliminates version lag, but several core dependencies remain. This document catalogs all prismarine dependencies and provides a clear replacement roadmap.

**Current Status**: Hybrid approach
- ✅ **Replaced**: Asset extraction, texture atlases, blockstate processing
- ✅ **Replaced**: Skeletal entity animations (walk/idle cycles)
- ✅ **Replaced**: POV switching and orbit controls
- ✅ **Replaced**: Animated textures (water/lava/fire with frame interpolation)
- ✅ **Replaced**: Day/night lighting cycle (Minecraft-accurate colors)
- ✅ **Replaced**: Entity equipment rendering (armor, held items)
- ✅ **Replaced**: Procedural sky dome (sun/moon/stars)
- ✅ **Working**: Player skins (via Microsoft auth + ONLINE_MODE)
- ✅ **Working**: Custom asset server for MC 1.21.5-1.21.9 textures
- ❌ **Not Started**: Chunk meshing, physics simulation

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

### 2.2 Viewer Source Customizations ✅

**Location**: `packages/minecraft-interface/src/prismarine-viewer-src/`

We maintain our own source files that get injected into prismarine-viewer via pnpm patch and postinstall scripts. This gives us version control, debugging capability, and a clear migration path.

| File | Mechanism | Purpose |
|------|-----------|---------|
| `index.js` | postinstall copy | POV toggle (F5), orbit controls, custom assets, animated material, equipment, sky, weather |
| `animated-material-client.js` | postinstall copy | Custom ShaderMaterial for water/lava/fire animations |
| `equipment-renderer.js` | postinstall copy | Equipment mesh factory for armor/held items |
| `sky-renderer.js` | postinstall copy | Procedural sky dome with sun/moon/stars |
| `weather-system.js` | postinstall copy | GPU-accelerated rain/snow/lightning particles |
| `mineflayer.js` | postinstall copy | Enhanced server-side with equipment/time/weather events |
| `Entity.js` | postinstall copy | Store bone refs in `mesh.userData` for animation lookups |
| `entities.js` | postinstall copy | Skeletal animation + equipment manager integration |
| `viewer.js` | pnpm patch | Render loop with `updateAnimations(deltaTime)` call |
| `animation-system.js` | reference | Standalone animation logic (importable) |

**Patch Application**:
```
pnpm install
  → pnpm patch applies viewer.js
  → postinstall runs rebuild-prismarine-viewer.cjs
    → copies index.js to lib/index.js
    → copies animated-material-client.js to lib/
    → copies equipment-renderer.js to lib/ and viewer/lib/
    → copies sky-renderer.js to lib/
    → copies weather-system.js to lib/
    → copies mineflayer.js to lib/
    → copies Entity.js to viewer/lib/entity/
    → copies entities.js to viewer/lib/
    → webpack rebuilds client bundle with all files
```

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

### 2.6 Entity Equipment Rendering ✅

**Location**: `packages/minecraft-interface/src/prismarine-viewer-src/equipment-renderer.js`

Custom equipment system that renders armor and held items on entity skeletal meshes:

| Slot | Index | Bone Attachment | Visual |
|------|-------|-----------------|--------|
| Helmet | 5 | head bone | 9x9x9 overlay cube |
| Chestplate | 4 | body + arm bones | Torso + arm overlays |
| Leggings | 3 | body + leg bones | Lower body + leg overlays |
| Boots | 2 | leg bones (bottom) | Foot section overlays |
| Main Hand | 0 | rightArm bone | Held item cube |
| Off Hand | 1 | leftArm bone | Held item cube |

**Components**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Equipment Rendering Pipeline                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Server (mineflayer.js)                 Client (entities.js)         │
│  ─────────────────────                  ─────────────────────        │
│  bot._client.on('entity_equipment')  →  socket.on('entityEquipment') │
│        ↓                                       ↓                     │
│  serializeEquipment(entity.equipment)    EquipmentManager.update()   │
│        ↓                                       ↓                     │
│  socket.emit('entityEquipment', data)    findBones() → attach meshes │
│                                                ↓                     │
│                                          Armor overlay cubes         │
│                                          Held item cubes             │
│                                          (animate with skeleton)     │
└─────────────────────────────────────────────────────────────────────┘
```

**Features**:
- Armor material detection (leather, chainmail, iron, gold, diamond, netherite)
- Automatic color assignment based on item name
- Equipment meshes attached to bones → animate with walk/idle cycles
- Proper disposal on entity despawn
- Change detection to minimize updates

### 2.7 Procedural Sky Rendering ✅

**Location**: `packages/minecraft-interface/src/prismarine-viewer-src/sky-renderer.js`

Procedural sky dome with dynamic celestial bodies:

| Feature | Implementation | Notes |
|---------|---------------|-------|
| Sky gradient | Fragment shader | Horizon→zenith color blend |
| Sun | Disc + glow in shader | Position from MC time |
| Moon | Disc + glow in shader | Opposite sun position |
| Stars | Procedural noise | Multi-layer star field |
| Day/night | Smooth transitions | Matches material shader |

**Minecraft Time Mapping**:
```
MC Time    Real Time     Sky State
───────    ──────────    ─────────
0          6:00 AM       Sunrise (sun at horizon)
6000       12:00 PM      Noon (sun overhead)
12000      6:00 PM       Sunset (sun at horizon)
18000      12:00 AM      Midnight (moon overhead)
```

**Shader Uniforms**:
- `time`: Minecraft tick (0-24000)
- `sunDirection`: Normalized vec3 for sun disc
- `moonDirection`: Normalized vec3 for moon disc
- `day/twilight/nightHorizon`: Horizon colors for each phase
- `day/twilight/nightZenith`: Zenith colors for each phase
- `starBrightness`: 0-1 for overcast weather

**Integration Points**:
- Sky dome follows camera (always surrounds viewer)
- `socket.on('time')` updates sun/moon positions
- Renders first (behind everything) via `renderOrder: -1000`

### 2.8 Weather Particle System ✅

**Location**: `packages/minecraft-interface/src/prismarine-viewer-src/weather-system.js`

GPU-accelerated particle system for rain and snow effects:

| Feature | Implementation | Notes |
|---------|---------------|-------|
| Rain | 15000 particles, vertical streaks | Fast vertical fall with wind drift |
| Snow | 8000 particles, soft circles | Slow fall with swaying motion |
| Lightning | Intensity system | Random flashes during thunderstorms |
| Transitions | Smooth fade | 0.5 seconds between weather states |

**Particle Shader Approach**:
```glsl
// Rain: Time-based vertical fall with wrapping
float fallDistance = mod(time * speed + offset * height, height);
pos.y = cameraPos.y + height * 0.5 - fallDistance;

// Keep particles in area around camera (no pop-in)
pos.x = cameraPos.x + mod(pos.x - cameraPos.x + areaSize * 0.5, areaSize) - areaSize * 0.5;
```

**Weather States from Minecraft**:
- `clear`: No precipitation, full star brightness
- `rain`: Rain or snow particles (biome-dependent), dimmed stars
- `thunder`: Rain + random lightning flashes

**Integration Flow**:
```
Server (mineflayer.js)                 Client (index.js)
─────────────────────                  ─────────────────────
bot.on('weatherUpdate')           →    socket.on('weather')
       ↓                                      ↓
emitWeather(state)                      weatherSystem.setWeather()
       ↓                                      ↓
socket.emit('weather', {...})           skyRenderer.setStarBrightness()
                                              ↓
                                        animate() → weatherSystem.update(dt)
```

**Performance Optimizations**:
- Single draw call per particle system (THREE.Points)
- GPU-based particle movement via uniforms
- Distance-based fade for depth perception
- Particles recycle when falling below ground

### 2.9 Viewer Patches (pnpm) ✅

**Location**: `patches/prismarine-viewer@1.33.0.patch`

The pnpm patch file is auto-generated from our source files. Contains diffs for:
- `viewer/lib/entity/Entity.js` - Bone storage for animation
- `viewer/lib/entities.js` - Animation system injection
- `viewer/lib/viewer.js` - Render loop integration

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

### 3.2 Entity Rendering (Partially Complete)

**Current**: Hybrid - prismarine-viewer base + our animation system

**What We've Built** ✅:
- Skeletal animation system with AnimationMixer per entity
- Walk/idle cycles for bipeds and quadrupeds
- Velocity-based animation state machine
- Smooth crossfade transitions (0.2s)
- Run/jump/fall animations (TypeScript, not yet in patch)

**What Still Needs Work**:
- Equipment rendering (armor, held items)
- Cape rendering
- Name tag rendering
- Shadow projection

**What's Now Working** ✅:
- Player skins (via Microsoft auth + ONLINE_MODE)

**Remaining Estimate**:
- Lines of code: 400-600
- Time: 3-5 days
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
- [x] Entity equipment rendering (armor, held items)
- [x] Custom sky rendering (sun/moon position, stars)
- [x] Weather effects (rain, snow, lightning particles)
- [ ] Block lighting (torch light, redstone)

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

Our migration code is organized into three tiers:

```
packages/minecraft-interface/src/
├── prismarine-viewer-src/          # Tier 1: Direct patches (JS, injected into viewer)
│   ├── README.md                   # Documentation + regeneration instructions
│   ├── index.js                    # Client entry (POV, orbit, custom assets, animated material)
│   ├── animated-material-client.js # Custom ShaderMaterial for texture animations
│   ├── Entity.js                   # Bone storage for animations
│   ├── entities.js                 # Animation system + entity manager
│   ├── viewer.js                   # Render loop integration
│   └── animation-system.js         # Standalone animation logic
│
├── asset-pipeline/                 # Tier 2: TypeScript enhancements (server-side)
│   ├── entity-animations.ts        # Full animation system (authoritative)
│   ├── animated-material.ts        # Custom shaders
│   ├── viewer-integration.ts       # Hooks into prismarine-viewer
│   └── ...                         # Asset extraction, atlas, etc.
│
└── custom-viewer/                  # Tier 3: Future full replacement (not started)
    ├── index.ts                    # Entry point
    ├── renderer/                   # Three.js scene management
    ├── meshing/                    # Chunk mesh generation
    ├── entities/                   # Entity rendering
    └── shaders/                    # GLSL shaders
```

### 5.2 Three-Tier Migration Strategy

| Tier | Purpose | When to Use |
|------|---------|-------------|
| **Tier 1: Patches** | Minimal changes to prismarine-viewer | Small fixes, feature injection |
| **Tier 2: Enhancements** | TypeScript code that integrates with viewer | Complex logic, server-side processing |
| **Tier 3: Replacement** | Full custom implementation | When prismarine-viewer is deprecated |

### 5.3 Current Prismarine Usage

```
packages/minecraft-interface/
├── bin/mc-viewer.ts                    # import { mineflayer as createViewer } from 'prismarine-viewer'
├── src/server.ts                       # import { mineflayer as startMineflayerViewer } from 'prismarine-viewer'
└── src/viewer-enhancements.ts          # Wraps prismarine-viewer with custom features
```

### 5.4 Custom Replacements (Asset Pipeline)

```
packages/minecraft-interface/src/asset-pipeline/
├── animated-material.ts                # Custom Three.js shader (replaces basic animation)
├── entity-animations.ts                # Skeletal animation system
├── atlas-builder.ts                    # Texture atlas (replaces minecraft-assets)
├── blockstates-builder.ts              # Model resolution (replaces viewer's loader)
├── asset-extractor.ts                  # JAR extraction (replaces minecraft-assets)
├── jar-downloader.ts                   # Version management (replaces minecraft-assets)
├── version-resolver.ts                 # Mojang manifest client
├── viewer-integration.ts               # Hooks into prismarine-viewer
├── asset-server.ts                     # Serves custom assets
└── pipeline.ts                         # Orchestrates generation
```

### 5.5 Patch Regeneration Workflow

When modifying viewer customizations:

```bash
# 1. Edit source files in prismarine-viewer-src/
vim src/prismarine-viewer-src/entities.js

# 2. Start a fresh patch session
pnpm patch prismarine-viewer@1.33.0

# 3. Copy source files to patch directory
cp src/prismarine-viewer-src/Entity.js \
   node_modules/.pnpm_patches/prismarine-viewer@1.33.0/viewer/lib/entity/
cp src/prismarine-viewer-src/entities.js \
   node_modules/.pnpm_patches/prismarine-viewer@1.33.0/viewer/lib/
cp src/prismarine-viewer-src/viewer.js \
   node_modules/.pnpm_patches/prismarine-viewer@1.33.0/viewer/lib/

# 4. Commit the patch
pnpm patch-commit 'node_modules/.pnpm_patches/prismarine-viewer@1.33.0'

# 5. Verify
pnpm install
```

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
| Entity equipment | ✅ Done | Armor, held items on skeletal meshes |
| Procedural sky | ✅ Done | Sun/moon/stars with day/night cycle |
| Chunk meshing | ⏳ Maybe | High effort, current solution works |
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

*Last updated: 2026-02-04*
*Author: Claude Code*
