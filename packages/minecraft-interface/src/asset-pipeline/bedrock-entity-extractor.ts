/**
 * Bedrock Entity Extractor - Downloads and extracts entity model data from
 * the Mojang/bedrock-samples GitHub repository.
 *
 * The Bedrock resource pack contains the canonical entity geometry definitions
 * (bones, cubes, pivots) that we need for 3D rendering. Java Edition hardcodes
 * these models in Java bytecode, making Bedrock the only machine-readable source.
 *
 * Downloads a ZIP archive of the repo, caches it locally, and extracts:
 *   - resource_pack/models/entity/*.geo.json       (geometry/bone definitions)
 *   - resource_pack/animations/*.animation.json     (animation keyframes)
 *   - resource_pack/entity/*.entity.json            (entity definitions linking geometry → textures)
 *
 * @module asset-pipeline/bedrock-entity-extractor
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yauzl from 'yauzl';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type { DownloadProgressCallback } from './types.js';

const BEDROCK_SAMPLES_ZIP_URL =
  'https://github.com/Mojang/bedrock-samples/archive/refs/heads/main.zip';

const DEFAULT_BEDROCK_CACHE_DIR = path.join(
  os.homedir(),
  '.minecraft-assets-cache',
  'bedrock'
);

/** Metadata file stored alongside the cached ZIP for cache invalidation */
interface BedrockCacheMeta {
  downloadedAt: string;
  etag?: string;
  size: number;
}

/** Result of a bedrock extraction operation */
export interface BedrockExtractionResult {
  /** Parsed geometry files: geometry_id → geometry data */
  geometryFiles: Map<string, BedrockGeometryFile>;
  /** Parsed animation files: animation_id → animation data */
  animationFiles: Map<string, BedrockAnimationFile>;
  /** Parsed entity definition files: entity_id → definition */
  entityDefinitions: Map<string, BedrockEntityDefinition>;
  /** Whether the ZIP was already cached */
  fromCache: boolean;
}

// ============================================================================
// Bedrock Resource Pack File Types
// ============================================================================

/** A single geometry definition from a .geo.json file */
export interface BedrockGeometry {
  description: {
    identifier: string;
    texture_width?: number;
    texture_height?: number;
    visible_bounds_width?: number;
    visible_bounds_height?: number;
    visible_bounds_offset?: [number, number, number];
  };
  bones: BedrockBone[];
}

/** A bone within a geometry definition */
export interface BedrockBone {
  name: string;
  parent?: string;
  pivot?: [number, number, number];
  rotation?: [number, number, number];
  bind_pose_rotation?: [number, number, number];
  mirror?: boolean;
  cubes?: BedrockCube[];
  locators?: Record<string, [number, number, number] | { offset: [number, number, number] }>;
}

/** A cube within a bone */
export interface BedrockCube {
  origin: [number, number, number];
  size: [number, number, number];
  uv: [number, number] | Record<string, { uv: [number, number]; uv_size?: [number, number] }>;
  inflate?: number;
  rotation?: [number, number, number];
  pivot?: [number, number, number];
  mirror?: boolean;
}

/** Parsed .geo.json file (may contain multiple geometries) */
export interface BedrockGeometryFile {
  format_version: string;
  geometries: BedrockGeometry[];
}

/** A single animation from a .animation.json file */
export interface BedrockAnimation {
  loop?: boolean | string;
  animation_length?: number;
  bones?: Record<string, {
    rotation?: unknown;
    position?: unknown;
    scale?: unknown;
  }>;
}

/** Parsed .animation.json file */
export interface BedrockAnimationFile {
  format_version: string;
  animations: Record<string, BedrockAnimation>;
}

/** Entity definition from a .entity.json file */
export interface BedrockEntityDefinition {
  identifier: string;
  min_engine_version?: string;
  materials?: Record<string, string>;
  textures?: Record<string, string>;
  geometry?: Record<string, string>;
  animations?: Record<string, string>;
  scripts?: {
    pre_animation?: string[];
    animate?: Array<string | Record<string, string>>;
    scale?: string;
  };
  render_controllers?: string[];
}

/** Parsed .entity.json file */
interface BedrockEntityFile {
  format_version: string;
  'minecraft:client_entity'?: {
    description: BedrockEntityDefinition;
  };
}

// ============================================================================
// Extractor Class
// ============================================================================

export interface BedrockEntityExtractorOptions {
  /** Cache directory for downloaded ZIP and extracted data */
  cacheDir?: string;
  /** Maximum age of cached ZIP in ms before re-downloading (default: 7 days) */
  maxCacheAgeMs?: number;
}

export class BedrockEntityExtractor {
  private readonly cacheDir: string;
  private readonly maxCacheAgeMs: number;

  constructor(options: BedrockEntityExtractorOptions = {}) {
    this.cacheDir = options.cacheDir ?? DEFAULT_BEDROCK_CACHE_DIR;
    this.maxCacheAgeMs = options.maxCacheAgeMs ?? 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  private get zipPath(): string {
    return path.join(this.cacheDir, 'bedrock-samples-main.zip');
  }

  private get metaPath(): string {
    return path.join(this.cacheDir, 'cache-meta.json');
  }

  private get extractedDir(): string {
    return path.join(this.cacheDir, 'extracted');
  }

  /**
   * Check if the cached ZIP is still valid.
   */
  async isCacheValid(): Promise<boolean> {
    if (!fs.existsSync(this.zipPath) || !fs.existsSync(this.metaPath)) {
      return false;
    }
    try {
      const meta: BedrockCacheMeta = JSON.parse(
        await fs.promises.readFile(this.metaPath, 'utf-8')
      );
      const age = Date.now() - new Date(meta.downloadedAt).getTime();
      return age < this.maxCacheAgeMs;
    } catch {
      return false;
    }
  }

  /**
   * Downloads the bedrock-samples ZIP from GitHub.
   * Uses temp-file + atomic rename pattern from jar-downloader.
   */
  async download(
    onProgress?: DownloadProgressCallback
  ): Promise<{ zipPath: string; cached: boolean }> {
    // Check cache
    if (await this.isCacheValid()) {
      return { zipPath: this.zipPath, cached: true };
    }

    await fs.promises.mkdir(this.cacheDir, { recursive: true });
    const tempPath = `${this.zipPath}.download`;

    try {
      const response = await fetch(BEDROCK_SAMPLES_ZIP_URL);
      if (!response.ok) {
        throw new Error(
          `Failed to download bedrock-samples: ${response.status} ${response.statusText}`
        );
      }

      const contentLength = parseInt(
        response.headers.get('content-length') || '0',
        10
      );
      const etag = response.headers.get('etag') || undefined;

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const fileStream = fs.createWriteStream(tempPath);
      let downloaded = 0;

      const reader = response.body.getReader();
      const nodeStream = new Readable({
        async read() {
          const { done, value } = await reader.read();
          if (done) {
            this.push(null);
          } else {
            downloaded += value.length;
            if (onProgress && contentLength > 0) {
              onProgress(downloaded, contentLength);
            }
            this.push(Buffer.from(value));
          }
        },
      });

      await pipeline(nodeStream, fileStream);

      // Atomic rename
      await fs.promises.rename(tempPath, this.zipPath);

      // Write cache metadata
      const stats = fs.statSync(this.zipPath);
      const meta: BedrockCacheMeta = {
        downloadedAt: new Date().toISOString(),
        etag,
        size: stats.size,
      };
      await fs.promises.writeFile(this.metaPath, JSON.stringify(meta, null, 2));

      return { zipPath: this.zipPath, cached: false };
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath).catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Extracts entity-related files from the bedrock-samples ZIP.
   * Only extracts the 3 directories we need (models/entity, animations, entity definitions).
   */
  async extract(
    onProgress?: DownloadProgressCallback
  ): Promise<BedrockExtractionResult> {
    // Download if needed
    const { cached } = await this.download(onProgress);

    // Parse directly from the ZIP — no need to extract to disk
    const geometryFiles = new Map<string, BedrockGeometryFile>();
    const animationFiles = new Map<string, BedrockAnimationFile>();
    const entityDefinitions = new Map<string, BedrockEntityDefinition>();

    const zipfile = await this.openZip(this.zipPath);

    // The ZIP contains a top-level directory: bedrock-samples-main/
    const PREFIX = 'bedrock-samples-main/resource_pack/';
    const GEO_PREFIX = `${PREFIX}models/entity/`;
    const ANIM_PREFIX = `${PREFIX}animations/`;
    const ENTITY_PREFIX = `${PREFIX}entity/`;

    try {
      await new Promise<void>((resolve, reject) => {
        zipfile.on('error', reject);
        zipfile.on('end', resolve);

        zipfile.on('entry', (entry: yauzl.Entry) => {
          const entryPath = entry.fileName;

          // Skip directories
          if (entryPath.endsWith('/')) {
            zipfile.readEntry();
            return;
          }

          const isGeo = entryPath.startsWith(GEO_PREFIX) && entryPath.endsWith('.geo.json');
          const isAnim = entryPath.startsWith(ANIM_PREFIX) && entryPath.endsWith('.animation.json');
          const isEntity = entryPath.startsWith(ENTITY_PREFIX) && entryPath.endsWith('.entity.json');

          if (!isGeo && !isAnim && !isEntity) {
            zipfile.readEntry();
            return;
          }

          zipfile.openReadStream(entry, async (err, readStream) => {
            if (err || !readStream) {
              zipfile.readEntry();
              return;
            }

            try {
              const chunks: Buffer[] = [];
              for await (const chunk of readStream) {
                chunks.push(chunk);
              }
              const text = Buffer.concat(chunks).toString('utf-8');
              const parsed = JSON.parse(text);

              if (isGeo) {
                this.processGeometryFile(parsed, geometryFiles);
              } else if (isAnim) {
                this.processAnimationFile(parsed, animationFiles);
              } else if (isEntity) {
                this.processEntityFile(parsed, entityDefinitions);
              }
            } catch (error) {
              const basename = path.basename(entryPath);
              console.warn(`[bedrock-extractor] Failed to parse ${basename}:`, error);
            }

            zipfile.readEntry();
          });
        });

        zipfile.readEntry();
      });
    } finally {
      zipfile.close();
    }

    console.log(
      `[bedrock-extractor] Extracted ${geometryFiles.size} geometry files, ` +
      `${animationFiles.size} animation files, ` +
      `${entityDefinitions.size} entity definitions`
    );

    return { geometryFiles, animationFiles, entityDefinitions, fromCache: cached };
  }

  /**
   * Process a .geo.json file, extracting all geometry definitions.
   * Handles both modern (minecraft:geometry array) and legacy (geometry.NAME key) formats.
   */
  private processGeometryFile(
    parsed: Record<string, unknown>,
    geometryFiles: Map<string, BedrockGeometryFile>
  ): void {
    const formatVersion = (parsed.format_version as string) || '1.12.0';

    // Modern format: { "format_version": "1.12.0", "minecraft:geometry": [...] }
    if (Array.isArray(parsed['minecraft:geometry'])) {
      const geometries = parsed['minecraft:geometry'] as BedrockGeometry[];
      for (const geo of geometries) {
        if (geo.description?.identifier) {
          geometryFiles.set(geo.description.identifier, {
            format_version: formatVersion,
            geometries: [geo],
          });
        }
      }
      return;
    }

    // Legacy format: { "geometry.chicken": { bones: [...] }, ... }
    for (const [key, value] of Object.entries(parsed)) {
      if (key.startsWith('geometry.') && value && typeof value === 'object') {
        const legacyGeo = value as Record<string, unknown>;
        const geo: BedrockGeometry = {
          description: {
            identifier: key,
            texture_width: (legacyGeo.texturewidth as number) || undefined,
            texture_height: (legacyGeo.textureheight as number) || undefined,
            visible_bounds_width: legacyGeo.visible_bounds_width as number | undefined,
            visible_bounds_height: legacyGeo.visible_bounds_height as number | undefined,
          },
          bones: (legacyGeo.bones as BedrockBone[]) || [],
        };
        geometryFiles.set(key, {
          format_version: formatVersion,
          geometries: [geo],
        });
      }
    }
  }

  /**
   * Process a .animation.json file, extracting all animations.
   */
  private processAnimationFile(
    parsed: Record<string, unknown>,
    animationFiles: Map<string, BedrockAnimationFile>
  ): void {
    const formatVersion = (parsed.format_version as string) || '1.8.0';
    const animations = (parsed.animations as Record<string, BedrockAnimation>) || {};

    // Store the whole file keyed by each animation name for lookup
    for (const animId of Object.keys(animations)) {
      animationFiles.set(animId, {
        format_version: formatVersion,
        animations: { [animId]: animations[animId] },
      });
    }
  }

  /**
   * Process a .entity.json file, extracting the entity definition.
   */
  private processEntityFile(
    parsed: BedrockEntityFile,
    entityDefinitions: Map<string, BedrockEntityDefinition>
  ): void {
    const desc = parsed['minecraft:client_entity']?.description;
    if (!desc?.identifier) return;

    entityDefinitions.set(desc.identifier, desc);
  }

  /**
   * Opens a ZIP file for reading.
   */
  private openZip(zipPath: string): Promise<yauzl.ZipFile> {
    return new Promise((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) reject(err);
        else if (!zipfile) reject(new Error('Failed to open ZIP file'));
        else resolve(zipfile);
      });
    });
  }

  /**
   * Clears the bedrock cache.
   */
  async clearCache(): Promise<void> {
    if (fs.existsSync(this.cacheDir)) {
      await fs.promises.rm(this.cacheDir, { recursive: true, force: true });
    }
  }
}
