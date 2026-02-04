# Prismarine-Viewer Source Customizations

This directory contains our customizations to prismarine-viewer that get applied via pnpm patch and postinstall scripts.

## Why This Exists

The prismarine-viewer package has several limitations we address:
1. **No skeletal animations** - Entities "glide" without leg/arm movement
2. **No POV switching** - Locked to first-person view
3. **No orbit controls** - Can't orbit around the bot in 3rd person
4. **Version lag** - Bundled textures only go up to MC 1.21.4
5. **No animated textures** - Water/lava/fire are static

We inject our customizations directly into the viewer's client-side JavaScript.

## Architecture

```
prismarine-viewer-src/
├── README.md                    # This file
├── index.js                     # Client entry point (POV, orbit, custom assets)
├── Entity.js                    # Modified entity mesh creation (stores bone refs)
├── entities.js                  # Animation system + entity manager
├── viewer.js                    # Render loop integration
└── animation-system.js          # Pure animation logic (no viewer deps)
```

## Custom Asset Integration

The `index.js` client entry point connects to our asset server (`/mc-assets/*`) for:
- **Textures**: `/mc-assets/textures/{version}.png` - Custom generated atlases
- **BlockStates**: `/mc-assets/blocksStates/{version}.json` - Block model/UV data

This enables:
1. Support for MC versions beyond prismarine-viewer's bundled 1.21.4
2. Custom texture atlases with animation metadata
3. Fallback to bundled assets when custom assets aren't available

The asset server is mounted at `/mc-assets` in the minecraft-interface server (see `server.ts`).
Assets are generated via `pnpm mc:assets extract <version>` and cached in `~/.minecraft-assets-cache/`.

## Two Patch Mechanisms

### 1. pnpm patch (automatic)
Applied automatically during `pnpm install`. Patches:
- `viewer/lib/entity/Entity.js`
- `viewer/lib/entities.js`
- `viewer/lib/viewer.js`

Patch file: `/patches/prismarine-viewer@1.33.0.patch`

### 2. postinstall copy (rebuild script)
Copies `index.js` during the webpack rebuild. This replaces the entire
client entry point to add POV switching and orbit controls.

Script: `scripts/rebuild-prismarine-viewer.cjs`
Source: `patches/prismarine-viewer-lib-index.patched.js` (symlinked from here)

## How It Works

1. **Entity.js** - When creating entity meshes:
   - Stores bone names in `mesh.userData.bonesByName` for animation lookups
   - Stores skeleton reference in `mesh.userData.skeleton`
   - Passes entity type through to track which animation category to use

2. **entities.js** - The Entities manager:
   - Creates `AnimationMixer` per entity when spawned
   - Calculates velocity from position updates
   - Transitions between idle/walk based on movement speed
   - Provides `updateAnimations(deltaTime)` for the render loop

3. **viewer.js** - The main viewer:
   - Calls `entities.updateAnimations(deltaTime)` every frame
   - Tracks delta time for smooth animation timing

4. **animation-system.js** - Standalone animation logic:
   - Entity category detection (biped vs quadruped)
   - Animation clip creation with QuaternionKeyframeTrack
   - Walk cycle definitions (legs, arms, body bob)
   - Idle animations (breathing, subtle sway)

## Applying Changes

The patch is automatically applied when running `pnpm install`. The patch file lives at:
```
/patches/prismarine-viewer@1.33.0.patch
```

To regenerate the patch after modifying these source files:
```bash
# 1. Start a fresh patch session
pnpm patch prismarine-viewer@1.33.0

# 2. Copy our source files over the patch directory
cp src/prismarine-viewer-src/Entity.js node_modules/.pnpm_patches/prismarine-viewer@1.33.0/viewer/lib/entity/
cp src/prismarine-viewer-src/entities.js node_modules/.pnpm_patches/prismarine-viewer@1.33.0/viewer/lib/
cp src/prismarine-viewer-src/viewer.js node_modules/.pnpm_patches/prismarine-viewer@1.33.0/viewer/lib/

# 3. Commit the patch
pnpm patch-commit 'node_modules/.pnpm_patches/prismarine-viewer@1.33.0'
```

## Supported Entities

### Biped (humanoid walk cycle)
player, zombie, skeleton, creeper, enderman, witch, villager, pillager,
vindicator, evoker, illusioner, zombie_villager, drowned, husk, stray,
wither_skeleton, piglin, piglin_brute, zombified_piglin

### Quadruped (four-legged trot)
pig, cow, sheep, chicken, wolf, cat, ocelot, horse, donkey, mule, fox,
rabbit, goat, llama, polar_bear, panda, bee, spider, cave_spider

## Animation Details

### Biped Walk Cycle (1 second per cycle)
- Legs swing ±0.6 radians, 180° out of phase
- Arms counterswing at ±0.3 radians (opposite to same-side leg)
- 0.2s crossfade when transitioning to/from idle

### Quadruped Walk Cycle (1 second per cycle)
- Diagonal leg pairs move together (trot gait)
- Front-left + back-right swing together
- Front-right + back-left swing together (opposite phase)

### Idle Animations
- Biped: 2s cycle, subtle body sway and arm movement
- Quadruped: 3s cycle, subtle head movement

## TypeScript Source

The authoritative TypeScript implementation lives in:
```
src/asset-pipeline/entity-animations.ts
```

This contains the same logic with full typing, documentation, and additional
animation states (run, jump, fall) that aren't yet wired into the patch.
