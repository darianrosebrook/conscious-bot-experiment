# Custom Minecraft Asset Extraction Pipeline Design

## Overview

This document outlines a long-term solution for dynamically extracting Minecraft assets from game JARs, generating texture atlases and blockStates mappings without depending on upstream prismarine-viewer or minecraft-assets updates.

## Current State

### Dependencies

```
prismarine-viewer (1.33.0)
  └── minecraft-assets (1.9.0, bundled at publish time)
       └── minecraft-jar-extractor (extracts from JAR)
```

### Problems with Current Approach

1. **Version Lag**: minecraft-assets updates lag behind Minecraft releases
2. **Bundled Assets**: prismarine-viewer bundles pre-rendered textures at npm publish time
3. **No Dynamic Generation**: Can't generate assets for new versions on-the-fly
4. **Patch Maintenance**: Requires patching prismarine-viewer for each version gap

## Proposed Solution: Local Asset Pipeline

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Asset Pipeline                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ Version      │    │ JAR          │    │ Asset            │  │
│  │ Resolver     │───►│ Downloader   │───►│ Extractor        │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│         │                                        │              │
│         │                                        ▼              │
│         │            ┌──────────────┐    ┌──────────────────┐  │
│         │            │ Texture      │◄───│ Raw Assets       │  │
│         │            │ Atlas        │    │ (blocks/, etc)   │  │
│         │            └──────────────┘    └──────────────────┘  │
│         │                   │                                   │
│         │                   ▼                                   │
│         │            ┌──────────────┐    ┌──────────────────┐  │
│         └───────────►│ BlockStates  │───►│ Viewer-Ready     │  │
│                      │ Builder      │    │ Assets           │  │
│                      └──────────────┘    └──────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Components

#### 1. Version Resolver (`version-resolver.ts`)

```typescript
interface VersionInfo {
  id: string;           // "1.21.9"
  type: "release" | "snapshot";
  jarUrl: string;       // URL to download client.jar
  sha1: string;         // Verify download
  assetsIndex: string;  // Assets index URL
}

class VersionResolver {
  private manifestUrl = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";

  async getVersion(version: string): Promise<VersionInfo>;
  async getLatestRelease(): Promise<VersionInfo>;
  async listVersions(): Promise<VersionInfo[]>;
}
```

#### 2. JAR Downloader (`jar-downloader.ts`)

```typescript
interface DownloadResult {
  jarPath: string;      // Path to downloaded/cached JAR
  assetsPath: string;   // Path to extracted assets
  version: string;
}

class JarDownloader {
  private cacheDir: string;

  async download(version: VersionInfo): Promise<DownloadResult>;
  async isCached(version: string): Promise<boolean>;
  async clearCache(version?: string): Promise<void>;
}
```

#### 3. Asset Extractor (`asset-extractor.ts`)

```typescript
interface ExtractedAssets {
  blocksDir: string;       // Path to extracted block textures
  blockstates: Record<string, BlockState>;
  models: Record<string, BlockModel>;
  textureIndex: Record<string, string>;  // texture name -> path
}

class AssetExtractor {
  async extract(jarPath: string, outputDir: string): Promise<ExtractedAssets>;

  // Extract specific asset types
  async extractTextures(jarPath: string): Promise<Map<string, Buffer>>;
  async extractBlockstates(jarPath: string): Promise<Record<string, BlockState>>;
  async extractModels(jarPath: string): Promise<Record<string, BlockModel>>;
}
```

#### 4. Texture Atlas Builder (`atlas-builder.ts`)

Uses canvas to create texture atlases compatible with prismarine-viewer.

```typescript
interface TextureAtlas {
  image: Buffer;           // PNG image data
  json: {
    size: number;          // Tile size ratio
    textures: Record<string, TextureCoords>;
  };
}

interface TextureCoords {
  u: number;    // Horizontal UV coordinate
  v: number;    // Vertical UV coordinate
  su: number;   // Horizontal UV size
  sv: number;   // Vertical UV size
}

class AtlasBuilder {
  async build(textures: Map<string, Buffer>): Promise<TextureAtlas>;
}
```

#### 5. BlockStates Builder (`blockstates-builder.ts`)

Converts raw blockstates + models into viewer-ready format.

```typescript
interface ViewerBlockStates {
  [blockName: string]: {
    variants?: Record<string, VariantModel[]>;
    multipart?: MultipartEntry[];
  };
}

class BlockStatesBuilder {
  async build(
    blockstates: Record<string, BlockState>,
    models: Record<string, BlockModel>,
    atlas: TextureAtlas
  ): Promise<ViewerBlockStates>;
}
```

### File Structure

```
packages/minecraft-interface/
├── src/
│   └── asset-pipeline/
│       ├── index.ts                 # Main export
│       ├── version-resolver.ts      # Mojang manifest client
│       ├── jar-downloader.ts        # JAR download + cache
│       ├── asset-extractor.ts       # JAR extraction
│       ├── atlas-builder.ts         # Texture atlas generation
│       ├── blockstates-builder.ts   # BlockStates processing
│       └── types.ts                 # Shared types
├── scripts/
│   ├── generate-textures.cjs        # Current script (interim)
│   └── extract-assets.ts            # New pipeline entry point
└── assets/                          # Generated assets cache
    └── [version]/
        ├── textures.png
        ├── blockstates.json
        └── raw/                     # Raw extracted assets
```

### Integration with prismarine-viewer

#### Phase 1: Shadow Assets (Current)

Generate assets and inject into prismarine-viewer's public folder:

```typescript
async function injectAssets(version: string) {
  const assets = await pipeline.generate(version);
  const pvRoot = require.resolve('prismarine-viewer/package.json');
  const publicDir = path.join(path.dirname(pvRoot), 'public');

  fs.writeFileSync(
    path.join(publicDir, 'textures', `${version}.png`),
    assets.atlas.image
  );
  fs.writeFileSync(
    path.join(publicDir, 'blocksStates', `${version}.json`),
    JSON.stringify(assets.blockstates)
  );
}
```

#### Phase 2: Custom Asset Server

Serve assets from our own directory, bypassing prismarine-viewer's bundled assets:

```typescript
// In minecraft-interface server
app.use('/mc-assets', express.static(assetCacheDir));

// Modify viewer to use custom asset URL
worldRenderer.texturesDataUrl = '/mc-assets/textures';
worldRenderer.blockStatesUrl = '/mc-assets/blocksStates';
```

#### Phase 3: Replace prismarine-viewer Renderer

Eventually replace prismarine-viewer's WorldRenderer with our own implementation that:
- Uses our asset pipeline directly
- Supports dynamic version switching
- Has better error handling for missing textures

### CLI Interface

```bash
# Extract assets for a specific version
pnpm mc:assets extract 1.21.9

# Extract latest release
pnpm mc:assets extract --latest

# List cached versions
pnpm mc:assets list

# Clear cache
pnpm mc:assets clean

# Generate for multiple versions
pnpm mc:assets extract 1.21.5,1.21.6,1.21.7,1.21.8,1.21.9
```

### Automatic Updates

Hook into the bot startup to check for new versions:

```typescript
// In bot initialization
const currentVersion = bot.version; // e.g., "1.21.9"
const cachedVersions = await assetPipeline.listCached();

if (!cachedVersions.includes(currentVersion)) {
  console.log(`Generating assets for ${currentVersion}...`);
  await assetPipeline.generate(currentVersion);
}
```

### Caching Strategy

1. **Version-based cache key**: Assets are cached per Minecraft version
2. **JAR caching**: Downloaded JARs are cached to avoid re-downloading
3. **Incremental extraction**: Only extract what's needed (textures only, or full assets)
4. **Cache invalidation**: Based on JAR SHA1 hash from version manifest

### Error Handling

```typescript
class AssetPipelineError extends Error {
  constructor(
    message: string,
    public phase: 'resolve' | 'download' | 'extract' | 'build',
    public version: string,
    public cause?: Error
  ) {
    super(message);
  }
}

// Graceful fallback
async function getAssets(version: string): Promise<Assets> {
  try {
    return await pipeline.generate(version);
  } catch (err) {
    const fallback = findClosestVersion(version);
    console.warn(`Failed to generate ${version}, falling back to ${fallback}`);
    return await pipeline.generate(fallback);
  }
}
```

## Implementation Plan

### Phase 1: Core Pipeline (1-2 days)
- [ ] Implement VersionResolver
- [ ] Implement JarDownloader with caching
- [ ] Implement AssetExtractor using JSZip or yauzl
- [ ] Port atlas generation from prismarine-viewer

### Phase 2: Integration (1 day)
- [ ] Replace generate-textures.cjs with new pipeline
- [ ] Add CLI commands
- [ ] Auto-generation on bot startup

### Phase 3: Custom Asset Serving (1 day)
- [ ] Separate asset server endpoint
- [ ] Modify worldrenderer patch to use custom URLs
- [ ] Version switching support

### Phase 4: Renderer Independence (Future)
- [ ] Fork/rewrite WorldRenderer
- [ ] Remove prismarine-viewer dependency
- [ ] Direct integration with our viewer

## Dependencies

New dependencies needed:
- `yauzl` or `jszip` - ZIP/JAR extraction
- `canvas` - Already present for atlas generation
- `node-fetch` or native fetch - HTTP requests

## Testing Strategy

1. **Unit tests**: Each component in isolation
2. **Integration tests**: Full pipeline for known versions
3. **Snapshot tests**: Compare generated assets with known-good outputs
4. **Version matrix**: Test against multiple Minecraft versions

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Mojang changes JAR structure | Version-specific extractors |
| Large JAR downloads | Caching, parallel download |
| blockstates format changes | Schema versioning |
| Canvas compatibility | Fallback to sharp if needed |

## Success Metrics

1. Support any Minecraft version without upstream updates
2. Asset generation < 30 seconds for new version
3. No manual intervention for new Minecraft releases
4. Same visual quality as upstream prismarine-viewer

---

## Appendix: Asset Format Reference

### Texture Atlas Format
```
{size}.png - Power of 2 dimensions (e.g., 1024x1024)
Each texture is 16x16 pixels in the atlas
Textures are arranged in a grid, indexed left-to-right, top-to-bottom
```

### BlockStates JSON Format
```json
{
  "stone": {
    "variants": {
      "": [{ "model": { "textures": {...}, "elements": [...] } }]
    }
  },
  "oak_fence": {
    "multipart": [
      { "apply": { "model": {...} }, "when": { "north": "true" } }
    ]
  }
}
```

Sources:
- [PrismarineJS/minecraft-jar-extractor](https://github.com/PrismarineJS/minecraft-jar-extractor)
- [Mojang Version Manifest](https://launchermeta.mojang.com/mc/game/version_manifest_v2.json)
