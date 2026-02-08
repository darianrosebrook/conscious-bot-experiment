/**
 * BlockStates Builder - Processes blockstate and model definitions for the renderer.
 *
 * This module resolves model inheritance, maps texture references to atlas UV coordinates,
 * and produces a format compatible with the viewer's worker.js.
 *
 * The approach is ported from the viewer's modelsBuilder.js.
 *
 * @module asset-pipeline/blockstates-builder
 */

import type {
  ExtractedBlockState,
  ExtractedModel,
  TextureAtlas,
  BlockModelDefinition,
  ResolvedBlockStates,
  ResolvedModel,
  ResolvedTexture,
  ResolvedModelElement,
  TextureUV,
} from './types.js';

/**
 * Cleans up a block/texture name by removing namespace prefixes.
 */
function cleanupBlockName(name: string): string {
  // Handle paths like "block/stone" or "minecraft:block/stone"
  if (name.startsWith('block/') || name.startsWith('minecraft:block/')) {
    return name.split('/')[1];
  }
  if (name.startsWith('minecraft:')) {
    return name.substring('minecraft:'.length);
  }
  return name;
}

/**
 * BlockStatesBuilder processes blockstates and models into renderer-ready format.
 */
export class BlockStatesBuilder {
  private readonly blocksModels: Map<string, BlockModelDefinition>;
  private readonly texturesUV: Record<string, TextureUV>;

  constructor(models: ExtractedModel[], atlas: TextureAtlas) {
    // Build model lookup map
    this.blocksModels = new Map();
    for (const model of models) {
      this.blocksModels.set(model.name, model.data);
    }

    this.texturesUV = atlas.json.textures;
  }

  /**
   * Gets a model definition, resolving parent inheritance.
   */
  private getModel(name: string): ResolvedModel | null {
    const cleanName = cleanupBlockName(name);
    const data = this.blocksModels.get(cleanName) || this.blocksModels.get(`block/${cleanName}`);

    if (!data) {
      return null;
    }

    let model: ResolvedModel = {
      textures: {},
      elements: [],
      ao: true,
    };

    // Copy rotation if present
    if ('x' in data) model.x = data.x as number;
    if ('y' in data) model.y = data.y as number;

    // Resolve parent first (inheritance)
    if (data.parent) {
      const parent = this.getModel(data.parent);
      if (parent) {
        model = { ...parent };
      }
    }

    // Merge textures
    if (data.textures) {
      model.textures = {
        ...model.textures,
        ...JSON.parse(JSON.stringify(data.textures)),
      } as Record<string, ResolvedTexture>;
    }

    // Override elements if present
    if (data.elements) {
      model.elements = JSON.parse(JSON.stringify(data.elements)) as ResolvedModelElement[];
    }

    // Handle ambient occlusion
    if (data.ambientocclusion !== undefined) {
      model.ao = data.ambientocclusion;
    }

    return model;
  }

  /**
   * Resolves texture references in a model to actual UV coordinates.
   */
  private prepareModel(model: ResolvedModel): void {
    // First pass: resolve texture variable references (e.g., #all -> blocks/stone)
    for (const tex in model.textures) {
      let root = model.textures[tex] as unknown as string;
      while (typeof root === 'string' && root.charAt(0) === '#') {
        root = model.textures[root.substring(1)] as unknown as string;
      }
      (model.textures as Record<string, unknown>)[tex] = root;
    }

    // Second pass: resolve texture names to UV coordinates
    for (const tex in model.textures) {
      let name = model.textures[tex] as unknown as string;
      if (typeof name === 'string') {
        name = cleanupBlockName(name);
        const uv = this.texturesUV[name] || this.texturesUV['missing_texture'];
        if (uv) {
          const resolved: ResolvedTexture = {
            ...uv,
            bu: uv.u + 0.5 * uv.su,
            bv: uv.v + 0.5 * uv.sv,
          };
          // Preserve animation data if present
          if (uv.animation) {
            resolved.animation = uv.animation;
          }
          model.textures[tex] = resolved;
        }
      }
    }

    // Third pass: resolve element face textures
    for (const elem of model.elements) {
      for (const sideName of Object.keys(elem.faces)) {
        const face = elem.faces[sideName as keyof typeof elem.faces];
        if (!face) continue;

        const textureRef = face.texture as unknown;
        let resolved: ResolvedTexture | null = null;

        if (typeof textureRef === 'string') {
          if (textureRef.charAt(0) === '#') {
            // Reference to texture variable
            const varName = textureRef.substring(1);
            resolved = model.textures[varName] as ResolvedTexture;
          } else {
            // Direct texture name
            const cleanName = cleanupBlockName(textureRef);
            if (this.texturesUV[cleanName]) {
              const uv = this.texturesUV[cleanName];
              resolved = {
                ...uv,
                bu: uv.u + 0.5 * uv.su,
                bv: uv.v + 0.5 * uv.sv,
              };
              // Preserve animation data
              if (uv.animation) {
                resolved.animation = uv.animation;
              }
            } else if (model.textures[textureRef as string]) {
              resolved = model.textures[textureRef as string] as ResolvedTexture;
            }
          }
        }

        if (!resolved) {
          // Fallback to missing texture
          const uv = this.texturesUV['missing_texture'];
          resolved = { ...uv, bu: uv.u + 0.5 * uv.su, bv: uv.v + 0.5 * uv.sv };
        }

        // Calculate UV adjustments based on face uv or element bounds
        let uv = (face as { uv?: number[] }).uv;
        if (!uv) {
          // Calculate from element bounds (from/to)
          const _from = elem.from;
          const _to = elem.to;

          // UV calculation from Minecraft Overviewer
          const uvMap: Record<string, number[]> = {
            north: [_to[0], 16 - _to[1], _from[0], 16 - _from[1]],
            east: [_from[2], 16 - _to[1], _to[2], 16 - _from[1]],
            south: [_from[0], 16 - _to[1], _to[0], 16 - _from[1]],
            west: [_from[2], 16 - _to[1], _to[2], 16 - _from[1]],
            up: [_from[0], _from[2], _to[0], _to[2]],
            down: [_to[0], _from[2], _from[0], _to[2]],
          };
          uv = uvMap[sideName];
        }

        if (uv && resolved) {
          const su = ((uv[2] - uv[0]) * resolved.su) / 16;
          const sv = ((uv[3] - uv[1]) * resolved.sv) / 16;
          const adjustedTexture: ResolvedTexture = {
            u: resolved.u + (uv[0] * resolved.su) / 16,
            v: resolved.v + (uv[1] * resolved.sv) / 16,
            su,
            sv,
            bu: resolved.bu,
            bv: resolved.bv,
          };
          // Preserve animation data
          if (resolved.animation) {
            adjustedTexture.animation = resolved.animation;
          }
          (face as { texture: ResolvedTexture }).texture = adjustedTexture;
        } else if (resolved) {
          // Deep clone while preserving animation
          const cloned: ResolvedTexture = JSON.parse(JSON.stringify(resolved));
          (face as { texture: ResolvedTexture }).texture = cloned;
        }
      }
    }
  }

  /**
   * Resolves a model name to a fully prepared model.
   */
  private resolveModel(name: string): ResolvedModel {
    const model = this.getModel(name);
    if (!model) {
      // Return a simple cube with missing texture
      return this.createMissingModel();
    }
    this.prepareModel(model);
    return model;
  }

  /**
   * Creates a simple cube model with missing texture for unknown models.
   */
  private createMissingModel(): ResolvedModel {
    const uv = this.texturesUV['missing_texture'];
    const tex: ResolvedTexture = { ...uv, bu: uv.u + 0.5 * uv.su, bv: uv.v + 0.5 * uv.sv };

    return {
      textures: { all: tex },
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: {
            down: { texture: tex },
            up: { texture: tex },
            north: { texture: tex },
            south: { texture: tex },
            west: { texture: tex },
            east: { texture: tex },
          },
        },
      ],
      ao: true,
    };
  }

  /**
   * Builds the complete blockstates object for the renderer.
   */
  build(blockStates: ExtractedBlockState[]): ResolvedBlockStates {
    const result: ResolvedBlockStates = {};

    // Add missing_texture block for fallback
    const missingUV = this.texturesUV['missing_texture'];
    const missingTex: ResolvedTexture = {
      ...missingUV,
      bu: missingUV.u + 0.5 * missingUV.su,
      bv: missingUV.v + 0.5 * missingUV.sv,
    };

    result['missing_texture'] = {
      variants: {
        normal: {
          model: {
            textures: { all: missingTex },
            elements: [
              {
                from: [0, 0, 0],
                to: [16, 16, 16],
                faces: {
                  down: { texture: missingTex },
                  up: { texture: missingTex },
                  north: { texture: missingTex },
                  south: { texture: missingTex },
                  west: { texture: missingTex },
                  east: { texture: missingTex },
                },
              },
            ],
            ao: true,
          },
        },
      },
    };

    // Process each blockstate
    for (const blockState of blockStates) {
      const block = blockState.data;
      if (!block) continue;

      const resolvedBlock: ResolvedBlockStates[string] = {};

      // Handle variants
      if (block.variants) {
        resolvedBlock.variants = {};
        for (const [variantKey, variant] of Object.entries(block.variants)) {
          if (Array.isArray(variant)) {
            resolvedBlock.variants[variantKey] = variant.map((v) => ({
              model: this.resolveModel(v.model),
              x: v.x,
              y: v.y,
              uvlock: v.uvlock,
              weight: v.weight,
            }));
          } else {
            resolvedBlock.variants[variantKey] = {
              model: this.resolveModel(variant.model),
              x: variant.x,
              y: variant.y,
              uvlock: variant.uvlock,
              weight: variant.weight,
            };
          }
        }
      }

      // Handle multipart
      if (block.multipart) {
        resolvedBlock.multipart = block.multipart.map((part) => {
          const apply = part.apply;
          return {
            when: part.when,
            apply: Array.isArray(apply)
              ? apply.map((v) => ({
                  model: this.resolveModel(v.model),
                  x: v.x,
                  y: v.y,
                  uvlock: v.uvlock,
                  weight: v.weight,
                }))
              : {
                  model: this.resolveModel(apply.model),
                  x: apply.x,
                  y: apply.y,
                  uvlock: apply.uvlock,
                  weight: apply.weight,
                },
          };
        });
      }

      result[blockState.name] = resolvedBlock;
    }

    return result;
  }
}

/**
 * Convenience function to build blockstates from extracted assets and atlas.
 */
export function buildBlockStates(
  blockStates: ExtractedBlockState[],
  models: ExtractedModel[],
  atlas: TextureAtlas
): ResolvedBlockStates {
  const builder = new BlockStatesBuilder(models, atlas);
  return builder.build(blockStates);
}
