# Prismarine-Viewer Custom Source

This directory contains all customizations to prismarine-viewer.
Files here are copied to `node_modules/prismarine-viewer/` during postinstall.

## Why This Exists

The prismarine-viewer package has several limitations we address:
1. **BlockStates race condition** - Terrain doesn't render because chunks arrive before blockStates
2. **No skeletal animations** - Entities "glide" without leg/arm movement
3. **No POV switching** - Locked to first-person view
4. **No orbit controls** - Can't orbit around the bot in 3rd person
5. **Version lag** - Bundled textures only go up to MC 1.21.4
6. **No animated textures** - Water/lava/fire are static
7. **No sky/weather** - Missing procedural sky dome and weather particles

## Architecture

```
prismarine-viewer-src/
├── README.md                    # This file
│
├── Core Fixes
│   ├── index.js                 # Client entry (POV, orbit, custom assets, waitForWorkersReady)
│   ├── worldrenderer.js         # Sync blockStates to prevent race condition
│   └── version.js               # Dynamic version support with fallback
│
├── Entity System
│   ├── Entity.js                # Modified mesh creation (stores bone refs)
│   ├── entities.js              # Animation system + entity manager
│   ├── equipment-renderer.js    # Armor/held item meshes
│   └── entity-extras.js         # Name tags, capes, shadows
│
├── Visual Enhancements
│   ├── animated-material-client.js  # Water/lava/fire animation shader
│   ├── sky-renderer.js              # Procedural sky dome (sun/moon/stars)
│   └── weather-system.js            # Rain/snow/lightning particles
│
├── Server-Side
│   └── mineflayer.js            # Bot integration, equipment/time events
│
└── Reference (not copied)
    └── animation-system.js      # Pure animation logic (TypeScript reference)
```

## The BlockStates Race Condition Fix

### The Problem

The original prismarine-viewer has a race condition where terrain doesn't render:

1. `socket.on('version')` fires
2. `viewer.setVersion()` → calls `updateTexturesData()` which loads blockStates async
3. `viewer.listen(socket)` registers loadChunk handler
4. We process queued chunks via `viewer.addColumn()`
5. **Worker receives chunks but `blocksStates === null`** → returns early in 50ms interval
6. By the time blockStates arrive, dirty sections may be gone

### The Fix

Two changes work together:

1. **index.js** - `waitForWorkersReady()`:
   - Polls until `material.map` is loaded (texture ready)
   - If blockStatesData was pre-set, workers received it synchronously
   - Only processes queued chunks after workers are confirmed ready

2. **worldrenderer.js** - Sync blockStates:
   - If `blockStatesData` is pre-set, sends to workers immediately (sync)
   - Skips the async `loadJSON` promise chain that causes the race
   - Workers have blockStates before any chunks arrive

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

## How Files Are Applied

All files are copied by `scripts/rebuild-prismarine-viewer.cjs` during postinstall:

| Source File | Destination(s) | Purpose |
|-------------|----------------|---------|
| index.js | lib/index.js | Main entry with POV toggle |
| mineflayer.js | lib/mineflayer.js | Server-side events |
| worldrenderer.js | viewer/lib/worldrenderer.js | Sync blockStates fix |
| version.js | viewer/lib/version.js | Dynamic version support |
| entities.js | viewer/lib/entities.js | Animation manager |
| Entity.js | viewer/lib/entity/Entity.js | Bone storage |
| equipment-renderer.js | lib/ + viewer/lib/ | Armor rendering |
| entity-extras.js | lib/ + viewer/lib/ | Name tags, capes |
| animated-material-client.js | lib/ | Animation shader |
| sky-renderer.js | lib/ | Procedural sky |
| weather-system.js | lib/ | Weather particles |

## Adding a New MC Version

1. Update `version.js` supportedVersions array
2. Run `pnpm mc:assets extract <version>` to generate assets
3. Verify with `curl http://localhost:3005/mc-assets/status`

For versions beyond the list, the viewer will:
1. Try to find a fallback in the same major version family
2. Warn in console if using fallback
3. Error if no fallback available

## Verification

Run the verification script to check all patches are applied:

```bash
node scripts/verify-viewer-setup.cjs
```

This checks:
- All source files are copied to correct destinations
- Patched files contain our signatures
- Webpack bundle includes our customizations
- Version support is properly configured

## Common Issues

### Terrain not rendering
- Check browser console for "Workers ready" message
- Verify blockStates loaded before chunks
- Check `/mc-assets/status` for asset availability

### Entity animations not playing
- Ensure `viewer.update()` is called each frame
- Check `entities.updateAnimations(deltaTime)` is wired

### New version shows pink terrain
- Version not in supportedVersions list
- Assets not generated for version
- Run asset extraction pipeline: `pnpm mc:assets extract <version>`

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

## TypeScript Reference

The authoritative TypeScript implementation lives in:
```
src/asset-pipeline/entity-animations.ts
```

This contains the same logic with full typing, documentation, and additional
animation states (run, jump, fall) that aren't yet wired into the patch.
