/**
 * Atlas Builder - Creates texture atlases from extracted block textures.
 *
 * This module arranges individual block textures into a single atlas image,
 * generating UV coordinate mappings for the renderer. The approach is ported
 * from prismarine-viewer's atlas.js but with TypeScript types and ESM support.
 *
 * @module asset-pipeline/atlas-builder
 */

import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, loadImage } from 'canvas';
import type {
  AtlasBuilderOptions,
  TextureAtlas,
  ExtractedTexture,
  TextureUV,
} from './types.js';

const DEFAULT_TILE_SIZE = 16;
const DEFAULT_MAX_SIZE = 4096;

/**
 * Calculates the next power of two >= n.
 */
function nextPowerOfTwo(n: number): number {
  if (n === 0) return 1;
  n--;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  return n + 1;
}

/**
 * AtlasBuilder creates texture atlases from extracted textures.
 */
export class AtlasBuilder {
  private readonly tileSize: number;
  private readonly maxSize: number;
  private missingTexture: Buffer | null = null;

  constructor(options: AtlasBuilderOptions = {}) {
    this.tileSize = options.tileSize ?? DEFAULT_TILE_SIZE;
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  }

  /**
   * Gets or creates the missing texture placeholder.
   * Uses a magenta/black checkerboard pattern like Minecraft.
   */
  private async getMissingTexture(): Promise<Buffer> {
    if (this.missingTexture) {
      return this.missingTexture;
    }

    // Create a 16x16 magenta/black checkerboard
    const canvas = createCanvas(this.tileSize, this.tileSize);
    const ctx = canvas.getContext('2d');

    const half = this.tileSize / 2;
    ctx.fillStyle = '#f800f8'; // Magenta
    ctx.fillRect(0, 0, half, half);
    ctx.fillRect(half, half, half, half);
    ctx.fillStyle = '#000000'; // Black
    ctx.fillRect(half, 0, half, half);
    ctx.fillRect(0, half, half, half);

    this.missingTexture = canvas.toBuffer('image/png');
    return this.missingTexture;
  }

  /**
   * Builds a texture atlas from extracted textures.
   *
   * For animated textures, we store all frames vertically in the atlas,
   * and include animation metadata in the UV coordinates so the renderer
   * can step through frames over time.
   *
   * @param textures - Array of extracted textures
   */
  async build(textures: ExtractedTexture[]): Promise<TextureAtlas> {
    // Add missing texture at the beginning
    const missingTextureData = await this.getMissingTexture();

    // Separate animated and static textures for layout planning
    const staticTextures = textures.filter((t) => !t.animation);
    const animatedTextures = textures.filter((t) => t.animation);

    // Calculate total tile slots needed
    // Static textures: 1 slot each
    // Animated textures: frameCount slots each (vertical strip)
    const staticSlots = staticTextures.length + 1; // +1 for missing texture
    const animatedSlots = animatedTextures.reduce(
      (sum, t) => sum + (t.animation?.frameCount ?? 1),
      0
    );
    const totalSlots = staticSlots + animatedSlots;

    // Calculate atlas dimensions (power of 2 grid)
    const tilesPerSide = nextPowerOfTwo(Math.ceil(Math.sqrt(totalSlots)));
    const atlasSize = tilesPerSide * this.tileSize;

    if (atlasSize > this.maxSize) {
      throw new Error(
        `Atlas would be ${atlasSize}x${atlasSize}, exceeds max size ${this.maxSize}`
      );
    }

    // Create canvas
    const canvas = createCanvas(atlasSize, atlasSize);
    const ctx = canvas.getContext('2d');

    // UV mapping
    const texturesIndex: Record<string, TextureUV> = {};
    const animatedTextureNames: string[] = [];

    let currentSlot = 0;

    // Helper to get x,y from slot index
    const slotToXY = (slot: number) => ({
      x: (slot % tilesPerSide) * this.tileSize,
      y: Math.floor(slot / tilesPerSide) * this.tileSize,
    });

    // 1. Draw missing texture first
    {
      const { x, y } = slotToXY(currentSlot);
      texturesIndex['missing_texture'] = {
        u: x / atlasSize,
        v: y / atlasSize,
        su: this.tileSize / atlasSize,
        sv: this.tileSize / atlasSize,
      };
      const missingImg = await loadImage(missingTextureData);
      ctx.drawImage(missingImg, x, y, this.tileSize, this.tileSize);
      currentSlot++;
    }

    // 2. Draw static textures
    for (const texture of staticTextures) {
      const { x, y } = slotToXY(currentSlot);

      texturesIndex[texture.name] = {
        u: x / atlasSize,
        v: y / atlasSize,
        su: this.tileSize / atlasSize,
        sv: this.tileSize / atlasSize,
      };

      try {
        const img = await loadImage(texture.data);
        ctx.drawImage(
          img,
          0, 0, this.tileSize, this.tileSize,
          x, y, this.tileSize, this.tileSize
        );
      } catch (error) {
        console.warn(`[atlas-builder] Failed to load texture ${texture.name}, using placeholder`);
        const missingImg = await loadImage(missingTextureData);
        ctx.drawImage(missingImg, x, y, this.tileSize, this.tileSize);
      }

      currentSlot++;
    }

    // 3. Draw animated textures (all frames in a vertical strip)
    for (const texture of animatedTextures) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- animatedTextures are filtered to have animation
      const animation = texture.animation!;
      const frameCount = animation.frameCount;
      const startSlot = currentSlot;
      const { x: startX, y: startY } = slotToXY(startSlot);

      // Calculate frame V step (how much to add to V to get next frame)
      const frameVStep = this.tileSize / atlasSize;

      texturesIndex[texture.name] = {
        u: startX / atlasSize,
        v: startY / atlasSize,
        su: this.tileSize / atlasSize,
        sv: this.tileSize / atlasSize,
        animation: {
          frametime: animation.frametime,
          frames: animation.frames,
          interpolate: animation.interpolate,
          frameCount: frameCount,
          frameVStep: frameVStep,
        },
      };

      animatedTextureNames.push(texture.name);

      try {
        const img = await loadImage(texture.data);

        // Draw each frame to consecutive slots
        for (let frame = 0; frame < frameCount; frame++) {
          const { x, y } = slotToXY(currentSlot);

          // Source is the frame within the vertical sprite sheet
          ctx.drawImage(
            img,
            0, frame * this.tileSize, this.tileSize, this.tileSize, // source
            x, y, this.tileSize, this.tileSize // destination
          );

          currentSlot++;
        }
      } catch (error) {
        console.warn(`[atlas-builder] Failed to load animated texture ${texture.name}, using placeholder`);
        // Draw placeholder for each frame slot
        const missingImg = await loadImage(missingTextureData);
        for (let frame = 0; frame < frameCount; frame++) {
          const { x, y } = slotToXY(currentSlot);
          ctx.drawImage(missingImg, x, y, this.tileSize, this.tileSize);
          currentSlot++;
        }
      }
    }

    return {
      image: canvas.toBuffer('image/png'),
      width: atlasSize,
      height: atlasSize,
      textureCount: staticTextures.length + animatedTextures.length + 1,
      animatedTextureCount: animatedTextures.length,
      json: {
        size: this.tileSize / atlasSize,
        textures: texturesIndex,
        animatedTextures: animatedTextureNames,
      },
    };
  }

  /**
   * Builds an atlas from a directory of PNG files.
   * Convenience method for working with extracted assets.
   *
   * @param texturesDir - Directory containing .png texture files
   */
  async buildFromDirectory(texturesDir: string): Promise<TextureAtlas> {
    const files = await fs.promises.readdir(texturesDir);
    const textures: ExtractedTexture[] = [];

    for (const file of files) {
      if (!file.endsWith('.png')) continue;

      const name = file.replace('.png', '');
      const filePath = path.join(texturesDir, file);
      const data = await fs.promises.readFile(filePath);

      textures.push({
        name,
        jarPath: `assets/minecraft/textures/block/${file}`,
        extractedPath: filePath,
        data,
      });
    }

    return this.build(textures);
  }

  /**
   * Saves an atlas to disk.
   *
   * @param atlas - The built atlas
   * @param outputPath - Path for the output PNG file
   */
  async saveAtlas(atlas: TextureAtlas, outputPath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.promises.writeFile(outputPath, atlas.image);
  }

  /**
   * Saves the atlas JSON metadata to disk.
   *
   * @param atlas - The built atlas
   * @param outputPath - Path for the output JSON file
   */
  async saveAtlasJson(atlas: TextureAtlas, outputPath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.promises.writeFile(outputPath, JSON.stringify(atlas.json, null, 2));
  }
}

// Default singleton instance
let defaultBuilder: AtlasBuilder | null = null;

/**
 * Gets the default AtlasBuilder instance.
 */
export function getAtlasBuilder(options?: AtlasBuilderOptions): AtlasBuilder {
  if (!defaultBuilder || options) {
    defaultBuilder = new AtlasBuilder(options);
  }
  return defaultBuilder;
}
