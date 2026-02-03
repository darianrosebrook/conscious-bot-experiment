/**
 * Asset Extractor - Extracts textures, blockstates, and models from Minecraft JARs.
 *
 * This module uses yauzl for async ZIP extraction, targeting specific paths
 * within the JAR to extract block textures, blockstate definitions, and block models.
 *
 * @module asset-pipeline/asset-extractor
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yauzl from 'yauzl';
import type {
  AssetExtractorOptions,
  AssetExtractionResult,
  ExtractedTexture,
  ExtractedBlockState,
  ExtractedModel,
  BlockStateDefinition,
  BlockModelDefinition,
  AnimationMeta,
} from './types.js';

/** Raw mcmeta file structure from Minecraft */
interface McmetaFile {
  animation?: {
    frametime?: number;
    frames?: number[];
    interpolate?: boolean;
  };
}

const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.minecraft-assets-cache', 'extracted');

// Paths within the Minecraft JAR
const JAR_PATHS = {
  blockTextures: 'assets/minecraft/textures/block/',
  blockStates: 'assets/minecraft/blockstates/',
  blockModels: 'assets/minecraft/models/block/',
  itemModels: 'assets/minecraft/models/item/',
  // Also useful for parent model resolution
  builtinModels: 'assets/minecraft/models/',
};

/**
 * AssetExtractor handles extracting textures, blockstates, and models from Minecraft JARs.
 */
export class AssetExtractor {
  private readonly outputBaseDir: string;
  private readonly assetTypes: Set<'textures' | 'blockstates' | 'models'>;

  constructor(options: AssetExtractorOptions = {}) {
    this.outputBaseDir = options.outputDir ?? DEFAULT_CACHE_DIR;
    const types = options.assetTypes ?? (['textures', 'blockstates', 'models'] as const);
    this.assetTypes = new Set<'textures' | 'blockstates' | 'models'>(types);
  }

  /**
   * Gets the output directory for a specific version.
   */
  getOutputDir(version: string): string {
    return path.join(this.outputBaseDir, version);
  }

  /**
   * Extracts assets from a Minecraft JAR file.
   *
   * @param jarPath - Path to the downloaded JAR file
   * @param version - Version string for organizing output
   */
  async extract(jarPath: string, version: string): Promise<AssetExtractionResult> {
    const outputDir = this.getOutputDir(version);
    await fs.promises.mkdir(outputDir, { recursive: true });

    const textures: ExtractedTexture[] = [];
    const blockStates: ExtractedBlockState[] = [];
    const models: ExtractedModel[] = [];

    // Store mcmeta files separately for post-processing
    const mcmetaFiles = new Map<string, McmetaFile>();

    // Open the JAR (which is just a ZIP file)
    const zipfile = await this.openZip(jarPath);

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

          // Check if this entry is one we want
          const shouldExtract = this.shouldExtractEntry(entryPath);
          if (!shouldExtract) {
            zipfile.readEntry();
            return;
          }

          // Read the entry
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
              const data = Buffer.concat(chunks);

              // Process based on type
              if (
                this.assetTypes.has('textures') &&
                entryPath.startsWith(JAR_PATHS.blockTextures) &&
                entryPath.endsWith('.png')
              ) {
                const name = path.basename(entryPath, '.png');
                const extractedPath = path.join(outputDir, 'textures', `${name}.png`);
                await this.ensureDir(path.dirname(extractedPath));
                await fs.promises.writeFile(extractedPath, data);
                textures.push({
                  name,
                  jarPath: entryPath,
                  extractedPath,
                  data,
                });
              } else if (
                this.assetTypes.has('textures') &&
                entryPath.startsWith(JAR_PATHS.blockTextures) &&
                entryPath.endsWith('.png.mcmeta')
              ) {
                // Extract animation metadata
                const textureName = path.basename(entryPath, '.png.mcmeta');
                const extractedPath = path.join(outputDir, 'textures', `${textureName}.png.mcmeta`);
                await this.ensureDir(path.dirname(extractedPath));
                await fs.promises.writeFile(extractedPath, data);
                try {
                  const parsed = JSON.parse(data.toString('utf-8')) as McmetaFile;
                  mcmetaFiles.set(textureName, parsed);
                } catch {
                  // Skip malformed mcmeta JSON
                }
              } else if (
                this.assetTypes.has('blockstates') &&
                entryPath.startsWith(JAR_PATHS.blockStates) &&
                entryPath.endsWith('.json')
              ) {
                const name = path.basename(entryPath, '.json');
                const extractedPath = path.join(outputDir, 'blockstates', `${name}.json`);
                await this.ensureDir(path.dirname(extractedPath));
                await fs.promises.writeFile(extractedPath, data);
                try {
                  const parsed = JSON.parse(data.toString('utf-8')) as BlockStateDefinition;
                  blockStates.push({ name, data: parsed });
                } catch {
                  // Skip malformed JSON
                }
              } else if (
                this.assetTypes.has('models') &&
                entryPath.startsWith(JAR_PATHS.builtinModels) &&
                entryPath.endsWith('.json')
              ) {
                // Extract relative path from models directory
                const relativePath = entryPath.substring(JAR_PATHS.builtinModels.length);
                const name = relativePath.replace('.json', '');
                const extractedPath = path.join(outputDir, 'models', relativePath);
                await this.ensureDir(path.dirname(extractedPath));
                await fs.promises.writeFile(extractedPath, data);
                try {
                  const parsed = JSON.parse(data.toString('utf-8')) as BlockModelDefinition;
                  models.push({ name, data: parsed });
                } catch {
                  // Skip malformed JSON
                }
              }
            } catch (error) {
              // Log but don't fail on individual entry errors
              console.warn(`[asset-extractor] Failed to extract ${entryPath}:`, error);
            }

            zipfile.readEntry();
          });
        });

        // Start reading entries
        zipfile.readEntry();
      });
    } finally {
      zipfile.close();
    }

    // Post-process: attach animation metadata to textures
    await this.attachAnimationMetadata(textures, mcmetaFiles);

    return {
      version,
      textures,
      blockStates,
      models,
      rawAssetsDir: outputDir,
    };
  }

  /**
   * Attaches animation metadata from mcmeta files to their corresponding textures.
   * Also calculates frame count based on texture height.
   */
  private async attachAnimationMetadata(
    textures: ExtractedTexture[],
    mcmetaFiles: Map<string, McmetaFile>
  ): Promise<void> {
    const { loadImage } = await import('canvas');

    for (const texture of textures) {
      const mcmeta = mcmetaFiles.get(texture.name);
      if (!mcmeta?.animation) continue;

      try {
        // Load the image to get its dimensions
        const img = await loadImage(texture.data);
        const width = img.width;
        const height = img.height;

        // Animated textures are stored as vertical sprite sheets
        // Each frame is typically 16x16, so frame count = height / width
        const frameHeight = width; // Assuming square frames (16x16)
        const frameCount = Math.floor(height / frameHeight);

        if (frameCount <= 1) {
          // Not actually animated (or single frame)
          continue;
        }

        const animation: AnimationMeta = {
          frametime: mcmeta.animation.frametime ?? 1,
          frameCount,
          frameHeight,
          interpolate: mcmeta.animation.interpolate,
        };

        // Include custom frame sequence if specified
        if (mcmeta.animation.frames && mcmeta.animation.frames.length > 0) {
          animation.frames = mcmeta.animation.frames;
        }

        texture.animation = animation;
      } catch (error) {
        console.warn(`[asset-extractor] Failed to parse animation for ${texture.name}:`, error);
      }
    }
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
   * Determines if an entry should be extracted based on configuration.
   */
  private shouldExtractEntry(entryPath: string): boolean {
    if (this.assetTypes.has('textures')) {
      if (entryPath.startsWith(JAR_PATHS.blockTextures)) {
        // Extract both .png textures and .png.mcmeta animation files
        if (entryPath.endsWith('.png') || entryPath.endsWith('.png.mcmeta')) {
          return true;
        }
      }
    }
    if (this.assetTypes.has('blockstates')) {
      if (entryPath.startsWith(JAR_PATHS.blockStates) && entryPath.endsWith('.json')) {
        return true;
      }
    }
    if (this.assetTypes.has('models')) {
      if (entryPath.startsWith(JAR_PATHS.builtinModels) && entryPath.endsWith('.json')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Ensures a directory exists.
   */
  private async ensureDir(dirPath: string): Promise<void> {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }

  /**
   * Checks if assets are already extracted for a version.
   */
  async isExtracted(version: string): Promise<boolean> {
    const outputDir = this.getOutputDir(version);
    const texturesDir = path.join(outputDir, 'textures');
    const blockstatesDir = path.join(outputDir, 'blockstates');
    const modelsDir = path.join(outputDir, 'models');

    // Check if all required directories exist and have content
    const checks: boolean[] = [];

    if (this.assetTypes.has('textures')) {
      checks.push(
        fs.existsSync(texturesDir) &&
          (await fs.promises.readdir(texturesDir)).some((f) => f.endsWith('.png'))
      );
    }
    if (this.assetTypes.has('blockstates')) {
      checks.push(
        fs.existsSync(blockstatesDir) &&
          (await fs.promises.readdir(blockstatesDir)).some((f) => f.endsWith('.json'))
      );
    }
    if (this.assetTypes.has('models')) {
      checks.push(
        fs.existsSync(modelsDir) &&
          (await fs.promises.readdir(modelsDir)).length > 0
      );
    }

    return checks.length > 0 && checks.every(Boolean);
  }

  /**
   * Loads previously extracted assets from disk.
   */
  async loadExtracted(version: string): Promise<AssetExtractionResult> {
    const outputDir = this.getOutputDir(version);
    const textures: ExtractedTexture[] = [];
    const blockStates: ExtractedBlockState[] = [];
    const models: ExtractedModel[] = [];

    // Collect mcmeta files for post-processing
    const mcmetaFiles = new Map<string, McmetaFile>();

    // Load textures
    const texturesDir = path.join(outputDir, 'textures');
    if (fs.existsSync(texturesDir)) {
      const files = await fs.promises.readdir(texturesDir);

      // First pass: load mcmeta files
      for (const file of files) {
        if (file.endsWith('.png.mcmeta')) {
          const textureName = file.replace('.png.mcmeta', '');
          try {
            const data = await fs.promises.readFile(path.join(texturesDir, file), 'utf-8');
            const parsed = JSON.parse(data) as McmetaFile;
            mcmetaFiles.set(textureName, parsed);
          } catch {
            // Skip malformed mcmeta
          }
        }
      }

      // Second pass: load textures
      for (const file of files) {
        if (file.endsWith('.png') && !file.endsWith('.mcmeta')) {
          const name = file.replace('.png', '');
          const extractedPath = path.join(texturesDir, file);
          const data = await fs.promises.readFile(extractedPath);
          textures.push({
            name,
            jarPath: `assets/minecraft/textures/block/${file}`,
            extractedPath,
            data,
          });
        }
      }

      // Attach animation metadata
      await this.attachAnimationMetadata(textures, mcmetaFiles);
    }

    // Load blockstates
    const blockstatesDir = path.join(outputDir, 'blockstates');
    if (fs.existsSync(blockstatesDir)) {
      const files = await fs.promises.readdir(blockstatesDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const name = file.replace('.json', '');
          const data = await fs.promises.readFile(path.join(blockstatesDir, file), 'utf-8');
          try {
            blockStates.push({ name, data: JSON.parse(data) as BlockStateDefinition });
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }

    // Load models (recursively)
    const modelsDir = path.join(outputDir, 'models');
    if (fs.existsSync(modelsDir)) {
      await this.loadModelsRecursive(modelsDir, '', models);
    }

    return {
      version,
      textures,
      blockStates,
      models,
      rawAssetsDir: outputDir,
    };
  }

  /**
   * Recursively loads models from a directory.
   */
  private async loadModelsRecursive(
    baseDir: string,
    relativePath: string,
    models: ExtractedModel[]
  ): Promise<void> {
    const currentDir = path.join(baseDir, relativePath);
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await this.loadModelsRecursive(baseDir, entryRelativePath, models);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const name = entryRelativePath.replace('.json', '');
        const data = await fs.promises.readFile(path.join(currentDir, entry.name), 'utf-8');
        try {
          models.push({ name, data: JSON.parse(data) as BlockModelDefinition });
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }

  /**
   * Removes extracted assets for a version.
   */
  async removeExtracted(version: string): Promise<void> {
    const outputDir = this.getOutputDir(version);
    if (fs.existsSync(outputDir)) {
      await fs.promises.rm(outputDir, { recursive: true, force: true });
    }
  }

  /**
   * Lists all extracted versions.
   */
  async listExtracted(): Promise<string[]> {
    if (!fs.existsSync(this.outputBaseDir)) {
      return [];
    }

    const entries = await fs.promises.readdir(this.outputBaseDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }
}

// Default singleton instance
let defaultExtractor: AssetExtractor | null = null;

/**
 * Gets the default AssetExtractor instance.
 */
export function getAssetExtractor(options?: AssetExtractorOptions): AssetExtractor {
  if (!defaultExtractor || options) {
    defaultExtractor = new AssetExtractor(options);
  }
  return defaultExtractor;
}
