/**
 * Type definitions for the Minecraft Asset Extraction Pipeline.
 *
 * This pipeline extracts textures and blockStates directly from Minecraft JARs,
 * eliminating dependency on upstream `minecraft-assets` package updates.
 *
 * @module asset-pipeline/types
 */

// ============================================================================
// Mojang Version Manifest Types
// ============================================================================

/** A single version entry in Mojang's version manifest */
export interface MojangVersionEntry {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  url: string;
  time: string;
  releaseTime: string;
  sha1: string;
  complianceLevel: number;
}

/** The top-level Mojang version manifest structure */
export interface MojangVersionManifest {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: MojangVersionEntry[];
}

/** Detailed version info from the per-version JSON */
export interface MojangVersionDetails {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  downloads: {
    client: {
      sha1: string;
      size: number;
      url: string;
    };
    client_mappings?: {
      sha1: string;
      size: number;
      url: string;
    };
    server?: {
      sha1: string;
      size: number;
      url: string;
    };
  };
  assetIndex: {
    id: string;
    sha1: string;
    size: number;
    totalSize: number;
    url: string;
  };
  assets: string;
  releaseTime: string;
  time: string;
}

// ============================================================================
// Version Resolver Types
// ============================================================================

/** Resolved version information ready for downloading */
export interface ResolvedVersion {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  clientJarUrl: string;
  clientJarSha1: string;
  clientJarSize: number;
  releaseTime: string;
}

/** Options for the version resolver */
export interface VersionResolverOptions {
  /** Cache TTL in milliseconds (default: 1 hour) */
  cacheTtlMs?: number;
  /** Custom manifest URL (for testing) */
  manifestUrl?: string;
}

// ============================================================================
// JAR Downloader Types
// ============================================================================

/** Download progress callback */
// eslint-disable-next-line no-unused-vars -- callback parameters are used by callers
export type DownloadProgressCallback = (downloaded: number, total: number) => void;

/** Options for the JAR downloader */
export interface JarDownloaderOptions {
  /** Directory to cache downloaded JARs */
  cacheDir?: string;
  /** Progress callback */
  onProgress?: DownloadProgressCallback;
  /** Skip SHA1 verification (not recommended) */
  skipVerification?: boolean;
}

/** Result of a JAR download operation */
export interface JarDownloadResult {
  /** Path to the downloaded JAR file */
  jarPath: string;
  /** Whether the JAR was already cached */
  cached: boolean;
  /** Size of the JAR in bytes */
  size: number;
}

// ============================================================================
// Asset Extractor Types
// ============================================================================

/** Options for asset extraction */
export interface AssetExtractorOptions {
  /** Directory to extract assets to */
  outputDir?: string;
  /** Only extract specific asset types */
  assetTypes?: Array<'textures' | 'blockstates' | 'models' | 'entities'>;
}

/** A single extracted entity texture */
export interface ExtractedEntityTexture {
  /** Relative path within entity folder (e.g., "player/wide/steve") */
  relativePath: string;
  /** Full path within JAR (e.g., "assets/minecraft/textures/entity/player/wide/steve.png") */
  jarPath: string;
  /** Path to extracted file */
  extractedPath: string;
  /** Raw PNG buffer */
  data: Buffer;
}

// ============================================================================
// Animation Types (for .mcmeta files)
// ============================================================================

/** Animation metadata from .mcmeta files */
export interface AnimationMeta {
  /** Duration of each frame in game ticks (1 tick = 50ms, default: 1) */
  frametime: number;
  /** Custom frame sequence (if omitted, sequential 0,1,2,...) */
  frames?: number[];
  /** Whether to interpolate between frames (smooth transitions) */
  interpolate?: boolean;
  /** Total number of frames in the texture */
  frameCount: number;
  /** Height of a single frame in pixels */
  frameHeight: number;
}

/** A single extracted texture */
export interface ExtractedTexture {
  /** Name without extension (e.g., "stone", "dirt") */
  name: string;
  /** Full path within JAR (e.g., "assets/minecraft/textures/block/stone.png") */
  jarPath: string;
  /** Path to extracted file */
  extractedPath: string;
  /** Raw PNG buffer */
  data: Buffer;
  /** Animation metadata if this is an animated texture */
  animation?: AnimationMeta;
}

/** A single extracted blockstate definition */
export interface ExtractedBlockState {
  /** Block name (e.g., "stone", "oak_planks") */
  name: string;
  /** Parsed JSON content */
  data: BlockStateDefinition;
}

/** A single extracted model definition */
export interface ExtractedModel {
  /** Model name (e.g., "cube_all", "stone") */
  name: string;
  /** Parsed JSON content */
  data: BlockModelDefinition;
}

/** Result of asset extraction */
export interface AssetExtractionResult {
  version: string;
  textures: ExtractedTexture[];
  blockStates: ExtractedBlockState[];
  models: ExtractedModel[];
  /** Entity textures extracted from JAR */
  entityTextures: ExtractedEntityTexture[];
  /** Directory where raw assets were extracted */
  rawAssetsDir: string;
}

// ============================================================================
// Block State & Model Definition Types
// ============================================================================

/** A variant in a blockstate definition */
export interface BlockStateVariant {
  model: string;
  x?: number;
  y?: number;
  uvlock?: boolean;
  weight?: number;
}

/** A multipart condition in a blockstate definition */
export interface MultipartCondition {
  [property: string]: string | boolean | number;
}

/** A multipart entry in a blockstate definition */
export interface MultipartEntry {
  when?: MultipartCondition | { OR: MultipartCondition[] };
  apply: BlockStateVariant | BlockStateVariant[];
}

/** Blockstate definition JSON structure */
export interface BlockStateDefinition {
  variants?: {
    [variant: string]: BlockStateVariant | BlockStateVariant[];
  };
  multipart?: MultipartEntry[];
}

/** Face definition in a block model element */
export interface ModelFace {
  uv?: [number, number, number, number];
  texture: string;
  cullface?: 'down' | 'up' | 'north' | 'south' | 'west' | 'east';
  rotation?: number;
  tintindex?: number;
}

/** Element definition in a block model */
export interface ModelElement {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: {
    origin: [number, number, number];
    axis: 'x' | 'y' | 'z';
    angle: number;
    rescale?: boolean;
  };
  shade?: boolean;
  faces: {
    down?: ModelFace;
    up?: ModelFace;
    north?: ModelFace;
    south?: ModelFace;
    west?: ModelFace;
    east?: ModelFace;
  };
}

/** Block model definition JSON structure */
export interface BlockModelDefinition {
  parent?: string;
  ambientocclusion?: boolean;
  textures?: {
    [key: string]: string;
  };
  elements?: ModelElement[];
  display?: {
    [position: string]: {
      rotation?: [number, number, number];
      translation?: [number, number, number];
      scale?: [number, number, number];
    };
  };
}

// ============================================================================
// Atlas Builder Types
// ============================================================================

/** UV coordinates for a texture in the atlas */
export interface TextureUV {
  /** U coordinate (0-1) */
  u: number;
  /** V coordinate (0-1) */
  v: number;
  /** U size (0-1) */
  su: number;
  /** V size (0-1) */
  sv: number;
  /** Animation data if this texture is animated */
  animation?: TextureAnimationData;
}

/** Animation data stored with texture UV coordinates */
export interface TextureAnimationData {
  /** Duration of each frame in game ticks (1 tick = 50ms) */
  frametime: number;
  /** Custom frame sequence (if omitted, sequential 0,1,2,...) */
  frames?: number[];
  /** Whether to interpolate between frames */
  interpolate?: boolean;
  /** Total number of frames */
  frameCount: number;
  /** V offset per frame (normalized, for stepping through sprite sheet) */
  frameVStep: number;
}

/** Options for atlas building */
export interface AtlasBuilderOptions {
  /** Tile size in pixels (default: 16) */
  tileSize?: number;
  /** Maximum atlas dimension (default: 4096) */
  maxSize?: number;
}

/** Result of atlas building */
export interface TextureAtlas {
  /** PNG image buffer */
  image: Buffer;
  /** Atlas width in pixels */
  width: number;
  /** Atlas height in pixels */
  height: number;
  /** Number of textures in atlas */
  textureCount: number;
  /** Number of animated textures */
  animatedTextureCount: number;
  /** UV mapping for each texture */
  json: {
    /** Normalized tile size (tileSize / atlasSize) */
    size: number;
    /** Map of texture name to UV coordinates */
    textures: Record<string, TextureUV>;
    /** List of animated texture names for quick lookup */
    animatedTextures: string[];
  };
}

// ============================================================================
// BlockStates Builder Types
// ============================================================================

/** Resolved texture with UV coordinates for renderer */
export interface ResolvedTexture extends TextureUV {
  /** Base U for animation frames */
  bu: number;
  /** Base V for animation frames */
  bv: number;
}

/** Resolved model face with UV coordinates */
export interface ResolvedModelFace {
  texture: ResolvedTexture;
  cullface?: string;
  rotation?: number;
  tintindex?: number;
}

/** Resolved model element ready for rendering */
export interface ResolvedModelElement {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: {
    origin: [number, number, number];
    axis: 'x' | 'y' | 'z';
    angle: number;
    rescale?: boolean;
  };
  shade?: boolean;
  faces: Record<string, ResolvedModelFace>;
}

/** Resolved model ready for the renderer */
export interface ResolvedModel {
  textures: Record<string, ResolvedTexture>;
  elements: ResolvedModelElement[];
  ao: boolean;
  x?: number;
  y?: number;
}

/** Resolved variant with embedded model data */
export interface ResolvedVariant {
  model: ResolvedModel;
  x?: number;
  y?: number;
  uvlock?: boolean;
  weight?: number;
}

/** Resolved blockstates ready for the renderer */
export interface ResolvedBlockStates {
  [blockName: string]: {
    variants?: {
      [variant: string]: ResolvedVariant | ResolvedVariant[];
    };
    multipart?: Array<{
      when?: MultipartCondition | { OR: MultipartCondition[] };
      apply: ResolvedVariant | ResolvedVariant[];
    }>;
  };
}

// ============================================================================
// Pipeline Types
// ============================================================================

/** Options for the asset pipeline */
export interface AssetPipelineOptions {
  /** Base cache directory (default: ~/.minecraft-assets-cache) */
  cacheDir?: string;
  /** Version resolver options */
  versionResolver?: VersionResolverOptions;
  /** JAR downloader options */
  jarDownloader?: JarDownloaderOptions;
  /** Asset extractor options */
  assetExtractor?: AssetExtractorOptions;
  /** Atlas builder options */
  atlasBuilder?: AtlasBuilderOptions;
}

/** Result of running the full pipeline */
export interface GeneratedAssets {
  version: string;
  /** Path to the generated texture atlas PNG */
  texturePath: string;
  /** Path to the generated blockStates JSON */
  blockStatesPath: string;
  /** Path to the raw extracted assets */
  rawAssetsPath: string;
  /** Whether assets were freshly generated or loaded from cache */
  fromCache: boolean;
  /** Generation timestamp */
  generatedAt: Date;
  /** Atlas metadata */
  atlasInfo: {
    width: number;
    height: number;
    textureCount: number;
  };
}

/** Cached version info for listing */
export interface CachedVersionInfo {
  version: string;
  texturePath: string;
  blockStatesPath: string;
  generatedAt: Date;
  size: number;
}

// ============================================================================
// Asset Server Types
// ============================================================================

/** Options for the asset server middleware */
export interface AssetServerOptions {
  /** Route prefix (default: /mc-assets) */
  routePrefix?: string;
  /** Pipeline instance (will create one if not provided) */
  pipeline?: AssetPipelineOptions;
  /** Enable auto-generation for missing versions */
  autoGenerate?: boolean;
  /** Fallback to viewer's bundled assets */
  fallbackToBundled?: boolean;
  /** Path to a custom skin PNG to serve in place of steve.png */
  customSkinPath?: string;
}
