# Prismarine Viewer Improvements

This document outlines the improvements made to the Minecraft viewer, including the migration from prismarine-viewer's patched client to our own standalone Vite-built viewer.

## Architecture Evolution

### Original Approach (deprecated)
- Patched prismarine-viewer via `pnpm patch` and postinstall scripts
- Injected custom JS files into prismarine-viewer's `node_modules`
- Rebuilt webpack bundles after each change

### Current Approach
- **Standalone viewer** in `src/viewer/` — our own Three.js application
- **Vite build** produces `dist/index.html`, `dist/assets/index-*.js` (~1950KB), `dist/assets/worker-*.js` (~525KB)
- **minecraft-data shim** reduces worker bundle from 255MB to ~525KB by stubbing unused data
- No pnpm patches for the viewer client; prismarine-viewer is only used for its server-side `mineflayer.js` WebSocket relay
- Fully supports **Minecraft 1.21.9** and forward — no version rollback needed

### Build Command
```bash
cd packages/minecraft-interface
NODE_OPTIONS='--max-old-space-size=8192' npx vite build --config src/viewer/vite.config.js
```

---

## Issues Addressed

### 1. T-Pose Mobs and Characters
**Problem**: Entities were showing only basic T-poses without proper animations.

**Solution**:
- Implemented enhanced entity animation updates through the `EnhancedViewer` class
- Added periodic entity position and animation updates (every 100ms)
- Improved entity rendering distance and update frequency
- Added specific handling for player and mob entity types

### 2. No Live Day/Night Cycle
**Problem**: The viewer wasn't updating lighting based on in-game time.

**Solution**:
- Added lighting update system that syncs with world time
- Implemented time synchronization (every 1000ms for lighting, 5000ms for time sync)
- Added automatic lighting level calculation based on day/night cycle
- Enhanced time emission to the viewer for dynamic lighting

### 3. Basic Rendering Quality
**Problem**: Limited view distance and basic rendering options.

**Solution**:
- Increased view distance from default 6 to 8 chunks
- Added first-person view mode for better immersion
- Implemented enhanced viewer configuration options
- Added entity render distance improvements

### 4. Entity Geometry Bugs (bone hierarchy and cube rotation)

**Problem**: Entities rendered with floating, offset, or detached body parts. Two root causes:

#### 4a. Bone Hierarchy: Absolute vs Relative Pivots

Minecraft Bedrock entity models (used in `entities.json`) specify bone pivots as **absolute coordinates**. THREE.js treats `bone.position` as **local to parent**. When bones are added to a parent-child hierarchy, absolute pivots cause position doubling.

Example: an iron golem body at `[0, 24, 0]` under a waist at `[0, 12, 0]` produces world position `[0, 36, 0]` (doubled) instead of the correct `[0, 24, 0]`.

**Fix** (`src/viewer/entities/Entity.js` lines 197-224):
```javascript
// Build a lookup of absolute pivots from the JSON
const absolutePivots = {}
for (const jsonBone of jsonModel.bones) {
  absolutePivots[jsonBone.name] = jsonBone.pivot
    ? new THREE.Vector3(jsonBone.pivot[0], jsonBone.pivot[1], jsonBone.pivot[2])
    : new THREE.Vector3()
}

// Convert absolute pivots to parent-relative positions
for (const jsonBone of jsonModel.bones) {
  if (jsonBone.parent) {
    const childBone = bones[jsonBone.name]
    const parentAbsolute = absolutePivots[jsonBone.parent]
    const childAbsolute = absolutePivots[jsonBone.name]
    childBone.position.copy(childAbsolute).sub(parentAbsolute)
    bones[jsonBone.parent].add(childBone)
  } else {
    rootBones.push(bones[jsonBone.name])
  }
}
```

This bug existed in the original prismarine-viewer code but was masked in THREE.js 0.128 (which prismarine-viewer used). Our viewer uses THREE.js 0.179 where the bind matrix math exposes the error.

#### 4b. Cube Rotation Pivot

Bedrock models allow per-cube rotation (e.g., the chicken body has `rotation: [90, 0, 0]` to orient it horizontally). The rotation should be around the **bone's pivot point**, not around world origin.

**Before** (wrong — rotates around world origin):
```javascript
vecPos = vecPos.applyEuler(cubeRotation)
vecPos = vecPos.sub(bone.position)
vecPos = vecPos.applyEuler(bone.rotation)
vecPos = vecPos.add(bone.position)
```

**After** (correct — rotates around bone pivot):
```javascript
vecPos = vecPos.sub(bone.position)
vecPos = vecPos.applyEuler(cubeRotation)
vecPos = vecPos.applyEuler(bone.rotation)
vecPos = vecPos.add(bone.position)
```

This affected 39 cubes across 13 entity types: chicken, all minecarts, arrows, striders, and projectiles. The original prismarine-viewer code had this same bug.

### 5. Worker Bundle Size (255MB)

**Problem**: The Vite-built worker included the full `minecraft-data` package (every version's block/item/entity data), producing a 255MB bundle.

**Fix**: Created `src/viewer/meshing/minecraft-data-shim.js` that stubs out unused data tables and only retains the block/biome data needed for chunk meshing. Result: ~525KB worker bundle.

### 6. Camera Position Race Condition

**Problem**: Camera stuck at (0,0,0) on initial load because `position` events arrived before the viewer was ready.

**Fix**: Buffer initial position events in `mineflayer.js` and replay them once the viewer client connects.

---

## Technical Implementation

### Enhanced Viewer Module (`viewer-enhancements.ts`)

The `EnhancedViewer` class provides:

```typescript
interface ViewerEnhancementOptions {
  enableEntityAnimation?: boolean;    // Enable entity animation updates
  enableLightingUpdates?: boolean;    // Enable lighting/time updates
  enableTimeSync?: boolean;           // Enable time synchronization
  entityUpdateInterval?: number;      // Entity update frequency (ms)
  lightingUpdateInterval?: number;    // Lighting update frequency (ms)
  timeSyncInterval?: number;          // Time sync frequency (ms)
}
```

### Key Features

1. **Entity Animation System**
   - Updates entity positions every 100ms
   - Emits entity events for better rendering
   - Handles player and mob entities specifically
   - Provides smooth animation transitions

2. **Lighting and Time System**
   - Syncs with world time for day/night cycles
   - Calculates lighting levels automatically
   - Updates lighting every 1000ms
   - Provides time synchronization every 5000ms

3. **Sky Dome and Weather**
   - Procedural sky with sun, moon, and stars
   - Rain and snow particle systems
   - Lightning effects with configurable frequency
   - Smooth day/night color transitions

4. **Frustum Culling**
   - Entity visibility culling based on camera frustum
   - Reduces draw calls for scenes with many entities

5. **Error Handling**
   - Graceful error handling for entity updates
   - Non-critical error suppression
   - Robust error recovery

### Configuration Options

The enhanced viewer supports the following configuration:

```typescript
const enhancedViewer = applyViewerEnhancements(bot, {
  enableEntityAnimation: true,        // Enable entity animations
  enableLightingUpdates: true,        // Enable lighting updates
  enableTimeSync: true,               // Enable time sync
  entityUpdateInterval: 100,          // 100ms entity updates
  lightingUpdateInterval: 1000,       // 1000ms lighting updates
  timeSyncInterval: 5000,             // 5000ms time sync
});
```

## Usage

### Server Integration

The enhanced viewer is automatically applied when starting the viewer through the server:

```typescript
// Enhanced viewer configuration
startMineflayerViewer(bot, {
  port: port,
  firstPerson: true,
  viewDistance: 8,                    // Increased view distance
  prefix: '',                         // Clean URLs
});

// Apply enhanced features
const enhancedViewer = applyViewerEnhancements(bot, {
  enableEntityAnimation: true,
  enableLightingUpdates: true,
  enableTimeSync: true,
});
```

### Standalone Viewer

The standalone viewer script (`mc-viewer.ts`) also includes these improvements:

```bash
# Run standalone viewer with enhancements
pnpm run mc-viewer
```

## Performance Considerations

- **Entity Updates**: 100ms intervals provide smooth animation without performance impact
- **Lighting Updates**: 1000ms intervals balance visual quality with performance
- **Time Sync**: 5000ms intervals provide accurate time without overhead
- **Worker Bundle**: ~525KB (down from 255MB) via minecraft-data shim
- **Main Bundle**: ~1950KB (Three.js + viewer code)
- **Error Handling**: Non-critical errors are suppressed to prevent log spam

## Monitoring and Debugging

The enhanced viewer provides status monitoring:

```typescript
const status = enhancedViewer.getStatus();
console.log('Enhanced viewer status:', status);
```

Event listeners for debugging:

```typescript
enhancedViewer.on('started', () => {
  console.log('Enhanced viewer features activated');
});

enhancedViewer.on('error', (error) => {
  console.warn('Enhanced viewer error:', error.type, error.error?.message);
});
```

## POV Switcher and Right-Click Orbit

The viewer client includes a POV switcher and right-click orbit controls:

- **POV toggle**: Click the "1st" / "3rd" button (top-right) or press F5 to switch between first-person (camera follows bot) and third-person (orbit around bot).
- **Right-click orbit**: In third-person mode, both left-click and right-click drag orbit the camera around the bot. Middle-click scrolls (dolly/zoom).
- **Third-person orbit**: Camera orbits around bot position with smooth damping.

These controls are implemented in our standalone viewer (`src/viewer/index.js`), not via a prismarine-viewer patch.

## Viewer Source Structure

The viewer source lives in `src/viewer/` and is built with Vite:

```
src/viewer/
├── index.html              # Entry HTML
├── index.js                # Client entry (POV, orbit, custom assets, animated material)
├── vite.config.js          # Vite build config
├── entities/
│   ├── Entity.js           # Bedrock model → THREE.js SkinnedMesh (bone hierarchy fix)
│   ├── entities.js         # Entity manager with animation, fallbacks, frustum culling
│   ├── entities.json       # Bedrock-format entity geometry definitions
│   ├── entity-extras.js    # Name tags, shadows, capes
│   └── equipment-renderer.js
├── meshing/
│   ├── worker.js           # Web Worker entry for chunk meshing
│   ├── world.js            # Chunk mesh management
│   ├── models.js           # Block model → geometry
│   ├── atlas.js            # Texture atlas loader
│   ├── minecraft-data-shim.js  # Stubs unused data (keeps bundle small)
│   └── modelsBuilder.js    # Model variant resolution
├── effects/
│   ├── sky-renderer.js     # Procedural sky dome
│   └── weather-system.js   # Rain, snow, lightning
├── renderer/
│   └── animated-material-client.js  # Custom ShaderMaterial for texture animations
├── client/
│   └── index.js            # Camera, controls, Three.js scene setup
├── server/
│   └── mineflayer.js       # WebSocket relay (bot → browser)
└── utils/
    └── utils.web.js        # Texture loading, browser utilities
```

## Future Improvements

Potential enhancements for future versions:

1. **Advanced Lighting**: Dynamic shadows and ambient occlusion
2. **Performance Optimization**: Greedy meshing, instanced rendering
3. **Mobile Support**: Touch controls and mobile-optimized rendering
4. **Entity equipment**: Armor, held items rendering

## Troubleshooting

### Common Issues

1. **Entities Still in T-Pose**
   - Check that `enableEntityAnimation` is enabled
   - Verify entity update interval is set correctly
   - Check browser console for entity update errors

2. **No Day/Night Cycle**
   - Ensure `enableLightingUpdates` is enabled
   - Check that world time is being received
   - Verify lighting update interval is set

3. **Entities Floating or Detached**
   - Ensure `Entity.js` has the absolute-to-relative pivot conversion
   - Ensure cube rotation is applied around bone pivot, not world origin
   - Check `entities.json` for correct bone parent-child relationships

4. **Performance Issues**
   - Reduce update intervals if needed
   - Disable non-essential features
   - Check for excessive entity count

### Debug Commands

```typescript
// Check enhanced viewer status
console.log(bot.enhancedViewer?.getStatus());

// Manually trigger entity updates
bot.enhancedViewer?.emit('entityAnimation', entity);

// Check world time
console.log('World time:', bot.world?.time);
```

## Version Compatibility

- **Mineflayer**: 4.32.0+
- **Node.js**: 18.0.0+
- **TypeScript**: 5.9.2+
- **THREE.js**: 0.179 (bundled in viewer)
- **Minecraft**: 1.8.8 - 1.21.9 (via custom asset pipeline, no version rollback needed)

Minecraft 1.21.9 is fully supported. We do not need to roll back to 1.21.4 or any earlier version. The custom asset pipeline extracts textures and blockstates directly from Minecraft JARs, so new versions can be supported as soon as they release.

---

## Author

@darianrosebrook
