/**
 * Asset Pipeline Orchestrator - Coordinates the full asset generation workflow.
 *
 * This is the main entry point for generating Minecraft assets from scratch.
 * It coordinates the version resolver, JAR downloader, asset extractor,
 * atlas builder, and blockstates builder.
 *
 * @module asset-pipeline/pipeline
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VersionResolver } from './version-resolver.js';
import { JarDownloader } from './jar-downloader.js';
import { AssetExtractor } from './asset-extractor.js';
import { AtlasBuilder } from './atlas-builder.js';
import { BlockStatesBuilder } from './blockstates-builder.js';
import { BedrockEntityExtractor } from './bedrock-entity-extractor.js';
import { BedrockEntityTransformer } from './bedrock-entity-transformer.js';
import type {
  AssetPipelineOptions,
  GeneratedAssets,
  CachedVersionInfo,
  DownloadProgressCallback,
} from './types.js';

const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.minecraft-assets-cache');

/**
 * Progress events emitted during pipeline execution.
 */
export interface PipelineProgress {
  stage: 'resolving' | 'downloading' | 'extracting' | 'extracting-bedrock-entities' | 'building-atlas' | 'building-blockstates' | 'saving';
  message: string;
  progress?: number; // 0-100
}

/**
 * AssetPipeline orchestrates the full asset generation workflow.
 */
export class AssetPipeline {
  private readonly cacheDir: string;
  private readonly generatedDir: string;
  private readonly versionResolver: VersionResolver;
  private readonly jarDownloader: JarDownloader;
  private readonly assetExtractor: AssetExtractor;
  private readonly atlasBuilder: AtlasBuilder;

  constructor(options: AssetPipelineOptions = {}) {
    this.cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
    this.generatedDir = path.join(this.cacheDir, 'generated');

    this.versionResolver = new VersionResolver(options.versionResolver);
    this.jarDownloader = new JarDownloader({
      cacheDir: path.join(this.cacheDir, 'jars'),
      ...options.jarDownloader,
    });
    this.assetExtractor = new AssetExtractor({
      outputDir: path.join(this.cacheDir, 'extracted'),
      ...options.assetExtractor,
    });
    this.atlasBuilder = new AtlasBuilder(options.atlasBuilder);
  }

  /**
   * Gets the output paths for a version's generated assets.
   */
  getOutputPaths(version: string): { texturePath: string; blockStatesPath: string; entitiesPath: string; rawAssetsPath: string } {
    return {
      texturePath: path.join(this.generatedDir, version, 'textures.png'),
      blockStatesPath: path.join(this.generatedDir, version, 'blockstates.json'),
      entitiesPath: path.join(this.generatedDir, version, 'entities.json'),
      rawAssetsPath: path.join(this.cacheDir, 'extracted', version),
    };
  }

  /**
   * Checks if assets are already generated for a version.
   */
  async isGenerated(version: string): Promise<boolean> {
    const paths = this.getOutputPaths(version);
    return (
      fs.existsSync(paths.texturePath) &&
      fs.existsSync(paths.blockStatesPath)
    );
  }

  /**
   * Generates assets for a Minecraft version.
   *
   * @param version - Version string (e.g., "1.21.4") or "latest"
   * @param options - Generation options
   * @returns Generated asset info
   */
  async generate(
    version: string,
    options: {
      force?: boolean;
      ensureRawAssets?: string[];
      // eslint-disable-next-line no-unused-vars -- callback parameter used by callers
      onProgress?: (progress: PipelineProgress) => void;
      onDownloadProgress?: DownloadProgressCallback;
    } = {}
  ): Promise<GeneratedAssets> {
    const { force = false, ensureRawAssets = [], onProgress, onDownloadProgress } = options;

    // Stage 1: Resolve version
    onProgress?.({ stage: 'resolving', message: `Resolving version ${version}...` });
    const resolved = await this.versionResolver.resolve(version);
    const versionId = resolved.id;

    const paths = this.getOutputPaths(versionId);
    const metaPath = path.join(this.generatedDir, versionId, 'meta.json');
    await fs.promises.mkdir(path.dirname(paths.texturePath), { recursive: true });
    const lockPath = path.join(this.generatedDir, versionId, '.generate.lock');
    const lockAcquired = await this.acquireGenerationLock(lockPath);
    if (!lockAcquired) {
      throw new Error(`Timed out waiting for generation lock: ${versionId}`);
    }
    const missingRawAssets = ensureRawAssets.some((subdir) => {
      const targetDir = path.join(paths.rawAssetsPath, subdir);
      if (!fs.existsSync(targetDir)) return true;
      try {
        return fs.readdirSync(targetDir).length === 0;
      } catch {
        return true;
      }
    });
    let metaEnsures: string[] | null = null;
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));
        metaEnsures = Array.isArray(meta.ensureRawAssets) ? meta.ensureRawAssets : null;
      } catch {
        metaEnsures = null;
      }
    }
    const ensureMismatch =
      ensureRawAssets.length > 0 &&
      (!metaEnsures || ensureRawAssets.some((asset) => !metaEnsures.includes(asset)));
    const shouldForce = force || missingRawAssets || ensureMismatch;

    // Check if already generated
    try {
      if (!shouldForce && (await this.isGenerated(versionId))) {
        const cachedPaths = this.getOutputPaths(versionId);
        const stats = await fs.promises.stat(cachedPaths.texturePath);
        return {
          version: versionId,
          texturePath: cachedPaths.texturePath,
          blockStatesPath: cachedPaths.blockStatesPath,
          rawAssetsPath: cachedPaths.rawAssetsPath,
          fromCache: true,
          generatedAt: stats.mtime,
          atlasInfo: await this.getAtlasInfo(versionId),
        };
      }

    // Stage 2: Download JAR
    onProgress?.({ stage: 'downloading', message: `Downloading Minecraft ${versionId} client...` });
    const jarResult = await this.jarDownloader.download(resolved, (downloaded, total) => {
      const progress = Math.round((downloaded / total) * 100);
      onProgress?.({
        stage: 'downloading',
        message: `Downloading: ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`,
        progress,
      });
      onDownloadProgress?.(downloaded, total);
    });

    // Stage 3: Extract assets
    onProgress?.({ stage: 'extracting', message: 'Extracting assets from JAR...' });
    const extracted = await this.assetExtractor.extract(jarResult.jarPath, versionId);

    // Stage 3.5: Extract Bedrock entity models
    onProgress?.({ stage: 'extracting-bedrock-entities', message: 'Extracting Bedrock entity models...' });
    try {
      const bedrockExtractor = new BedrockEntityExtractor({
        cacheDir: path.join(this.cacheDir, 'bedrock'),
      });
      const bedrockResult = await bedrockExtractor.extract((downloaded, total) => {
        const progress = Math.round((downloaded / total) * 100);
        onProgress?.({
          stage: 'extracting-bedrock-entities',
          message: `Downloading Bedrock entity data: ${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`,
          progress,
        });
      });

      const transformer = new BedrockEntityTransformer({ verbose: false });
      const entitiesJson = transformer.transform(bedrockResult);
      await fs.promises.writeFile(
        paths.entitiesPath,
        JSON.stringify(entitiesJson, null, 2)
      );
    } catch (bedrockError) {
      // Non-fatal: if Bedrock extraction fails, the viewer falls back to bundled entities.json
      console.warn('[asset-pipeline] Bedrock entity extraction failed (non-fatal):', bedrockError);
    }

    // Stage 4: Build texture atlas
    onProgress?.({ stage: 'building-atlas', message: `Building texture atlas (${extracted.textures.length} textures)...` });
    const atlas = await this.atlasBuilder.build(extracted.textures);

    // Stage 5: Build blockstates
    onProgress?.({ stage: 'building-blockstates', message: `Processing ${extracted.blockStates.length} block states...` });
    const blockStatesBuilder = new BlockStatesBuilder(extracted.models, atlas);
    const blockStates = blockStatesBuilder.build(extracted.blockStates);

    // Stage 6: Save results
    onProgress?.({ stage: 'saving', message: 'Saving generated assets...' });
    await fs.promises.mkdir(path.dirname(paths.texturePath), { recursive: true });
    await fs.promises.writeFile(paths.texturePath, atlas.image);
    await fs.promises.writeFile(paths.blockStatesPath, JSON.stringify(blockStates));
    await fs.promises.writeFile(
      metaPath,
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        atlasInfo: {
          width: atlas.width,
          height: atlas.height,
          textureCount: atlas.textureCount,
        },
        ensureRawAssets,
      })
    );

    return {
      version: versionId,
      texturePath: paths.texturePath,
      blockStatesPath: paths.blockStatesPath,
      rawAssetsPath: paths.rawAssetsPath,
      fromCache: false,
      generatedAt: new Date(),
      atlasInfo: {
        width: atlas.width,
        height: atlas.height,
        textureCount: atlas.textureCount,
      },
    };
    } finally {
      await this.releaseGenerationLock(lockPath);
    }
  }

  /**
   * Gets atlas info for a cached version.
   */
  private async getAtlasInfo(version: string): Promise<{ width: number; height: number; textureCount: number }> {
    // Try to read from a metadata file if it exists
    const metaPath = path.join(this.generatedDir, version, 'meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));
        return meta.atlasInfo;
      } catch {
        // Fall through to default
      }
    }

    // Default fallback
    return { width: 0, height: 0, textureCount: 0 };
  }

  /**
   * Lists all cached/generated versions.
   */
  async listCached(): Promise<CachedVersionInfo[]> {
    if (!fs.existsSync(this.generatedDir)) {
      return [];
    }

    const entries = await fs.promises.readdir(this.generatedDir, { withFileTypes: true });
    const versions: CachedVersionInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const version = entry.name;
      const paths = this.getOutputPaths(version);

      if (fs.existsSync(paths.texturePath) && fs.existsSync(paths.blockStatesPath)) {
        const stats = await fs.promises.stat(paths.texturePath);
        const blockStatesStats = await fs.promises.stat(paths.blockStatesPath);

        versions.push({
          version,
          texturePath: paths.texturePath,
          blockStatesPath: paths.blockStatesPath,
          generatedAt: stats.mtime,
          size: stats.size + blockStatesStats.size,
        });
      }
    }

    return versions.sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
  }

  /**
   * Clears generated assets for a specific version or all versions.
   */
  async clearCache(version?: string): Promise<void> {
    if (version) {
      const versionDir = path.join(this.generatedDir, version);
      if (fs.existsSync(versionDir)) {
        await fs.promises.rm(versionDir, { recursive: true, force: true });
      }
      // Also clear extracted assets
      await this.assetExtractor.removeExtracted(version);
    } else {
      // Clear all generated
      if (fs.existsSync(this.generatedDir)) {
        await fs.promises.rm(this.generatedDir, { recursive: true, force: true });
      }
      // Clear all extracted
      const extracted = await this.assetExtractor.listExtracted();
      for (const v of extracted) {
        await this.assetExtractor.removeExtracted(v);
      }
    }
  }

  /**
   * Injects generated assets into the viewer's public directory.
   * This allows the viewer to use our generated assets.
   *
   * @param version - Version to inject
   * @param pvPublicDir - Path to the viewer's public directory
   */
  async injectIntoViewer(version: string, pvPublicDir: string): Promise<void> {
    if (!(await this.isGenerated(version))) {
      throw new Error(`Assets not generated for version ${version}`);
    }

    const paths = this.getOutputPaths(version);

    // Copy texture atlas
    const texturesDest = path.join(pvPublicDir, 'textures', `${version}.png`);
    await fs.promises.mkdir(path.dirname(texturesDest), { recursive: true });
    await fs.promises.copyFile(paths.texturePath, texturesDest);

    // Copy blockstates
    const blockStatesDest = path.join(pvPublicDir, 'blocksStates', `${version}.json`);
    await fs.promises.mkdir(path.dirname(blockStatesDest), { recursive: true });
    await fs.promises.copyFile(paths.blockStatesPath, blockStatesDest);
  }

  private async acquireGenerationLock(lockPath: string, timeoutMs: number = 60000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const fd = fs.openSync(lockPath, 'wx');
        fs.closeSync(fd);
        return true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw err;
        }
      }

      try {
        const stats = await fs.promises.stat(lockPath);
        const ageMs = Date.now() - stats.mtimeMs;
        if (ageMs > 15 * 60 * 1000) {
          await fs.promises.unlink(lockPath);
          continue;
        }
      } catch {
        // Ignore stat/unlink errors and keep waiting.
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  }

  private async releaseGenerationLock(lockPath: string): Promise<void> {
    try {
      await fs.promises.unlink(lockPath);
    } catch {
      // Ignore - lock may have been cleaned up.
    }
  }

  /**
   * Gets the version resolver for direct access.
   */
  getVersionResolver(): VersionResolver {
    return this.versionResolver;
  }

  /**
   * Gets the JAR downloader for direct access.
   */
  getJarDownloader(): JarDownloader {
    return this.jarDownloader;
  }

  /**
   * Gets the asset extractor for direct access.
   */
  getAssetExtractor(): AssetExtractor {
    return this.assetExtractor;
  }
}

// Default singleton instance
let defaultPipeline: AssetPipeline | null = null;

/**
 * Gets the default AssetPipeline instance.
 */
export function getAssetPipeline(options?: AssetPipelineOptions): AssetPipeline {
  if (!defaultPipeline || options) {
    defaultPipeline = new AssetPipeline(options);
  }
  return defaultPipeline;
}
