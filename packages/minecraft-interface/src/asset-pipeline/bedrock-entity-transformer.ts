/**
 * Bedrock Entity Transformer - Converts extracted Bedrock resource pack data
 * into our viewer's entities.json format.
 *
 * The transformation stitches together three separate Bedrock file types:
 *   1. Entity definitions (.entity.json) → links entity ID to geometry ID, texture path, animations
 *   2. Geometry files (.geo.json) → bone hierarchies with cubes (the 3D model)
 *   3. Animation files (.animation.json) → keyframe animation data
 *
 * Output format matches what Entity.js expects:
 *   {
 *     "chicken": {
 *       "identifier": "minecraft:chicken",
 *       "textures": { "default": "textures/entity/chicken" },
 *       "geometry": {
 *         "default": { "texturewidth": 64, "textureheight": 32, "bones": [...] }
 *       },
 *       "animations": { ... }
 *     }
 *   }
 *
 * @module asset-pipeline/bedrock-entity-transformer
 */

import type {
  BedrockExtractionResult,
  BedrockGeometry,
  BedrockGeometryFile,
  BedrockAnimation,
  BedrockAnimationFile,
  BedrockEntityDefinition,
  BedrockBone,
  BedrockCube,
} from './bedrock-entity-extractor.js';

// ============================================================================
// Output Types (matching our entities.json format consumed by Entity.js)
// ============================================================================

/** A cube in our output format */
interface OutputCube {
  origin: [number, number, number];
  size: [number, number, number];
  uv: [number, number] | Record<string, { uv: [number, number]; uv_size?: [number, number] }>;
  inflate?: number;
  rotation?: [number, number, number];
  pivot?: [number, number, number];
  mirror?: boolean;
}

/** A bone in our output format */
interface OutputBone {
  name: string;
  parent?: string;
  pivot?: [number, number, number];
  rotation?: [number, number, number];
  bind_pose_rotation?: [number, number, number];
  mirror?: boolean;
  cubes?: OutputCube[];
}

/** Geometry variant in our output format */
interface OutputGeometry {
  texturewidth?: number;
  textureheight?: number;
  visible_bounds_width?: number;
  visible_bounds_height?: number;
  visible_bounds_offset?: [number, number, number];
  bones: OutputBone[];
}

/** Animation bone data */
interface OutputAnimationBone {
  rotation?: unknown;
  position?: unknown;
  scale?: unknown;
}

/** Animation in our output format */
interface OutputAnimation {
  loop?: boolean | string;
  animation_length?: number;
  bones?: Record<string, OutputAnimationBone>;
}

/** A complete entity entry in our output format */
export interface OutputEntity {
  identifier: string;
  min_engine_version?: string;
  materials?: Record<string, string>;
  textures: Record<string, string>;
  geometry: Record<string, OutputGeometry>;
  animations?: Record<string, OutputAnimation>;
  scripts?: {
    pre_animation?: string[];
    animate?: Array<string | Record<string, string>>;
    scale?: string;
  };
  render_controllers?: string[];
}

/** The complete entities.json output */
export type EntitiesJson = Record<string, OutputEntity>;

// ============================================================================
// Transformer Options & Class
// ============================================================================

export interface BedrockEntityTransformerOptions {
  /** If true, include animations in the output (default: true) */
  includeAnimations?: boolean;
  /** If true, log warnings for missing geometry/animation references (default: true) */
  verbose?: boolean;
}

export class BedrockEntityTransformer {
  private readonly includeAnimations: boolean;
  private readonly verbose: boolean;

  constructor(options: BedrockEntityTransformerOptions = {}) {
    this.includeAnimations = options.includeAnimations ?? true;
    this.verbose = options.verbose ?? true;
  }

  /**
   * Transform extracted Bedrock data into our entities.json format.
   */
  transform(extraction: BedrockExtractionResult): EntitiesJson {
    const { geometryFiles, animationFiles, entityDefinitions } = extraction;

    // Build a flat geometry lookup: geometry_id → BedrockGeometry
    const geometryLookup = new Map<string, BedrockGeometry>();
    for (const [_key, file] of geometryFiles) {
      for (const geo of file.geometries) {
        if (geo.description?.identifier) {
          geometryLookup.set(geo.description.identifier, geo);
        }
      }
    }

    // Build a flat animation lookup: animation_id → BedrockAnimation
    const animationLookup = new Map<string, BedrockAnimation>();
    for (const [_key, file] of animationFiles) {
      for (const [animId, anim] of Object.entries(file.animations)) {
        animationLookup.set(animId, anim);
      }
    }

    const output: EntitiesJson = {};
    let processed = 0;
    let skipped = 0;

    for (const [entityId, definition] of entityDefinitions) {
      const entityName = this.extractEntityName(entityId);
      if (!entityName) {
        if (this.verbose) {
          console.warn(`[bedrock-transformer] Skipping entity with no name: ${entityId}`);
        }
        skipped++;
        continue;
      }

      const entity = this.transformEntity(entityName, definition, geometryLookup, animationLookup);
      if (entity) {
        output[entityName] = entity;
        processed++;
      } else {
        skipped++;
      }
    }

    console.log(
      `[bedrock-transformer] Transformed ${processed} entities, skipped ${skipped}`
    );

    return output;
  }

  /**
   * Extract the short entity name from a full identifier.
   * e.g., "minecraft:chicken" → "chicken"
   */
  private extractEntityName(identifier: string): string | null {
    const parts = identifier.split(':');
    const name = parts.length > 1 ? parts[1] : parts[0];
    return name || null;
  }

  /**
   * Transform a single entity definition into our output format.
   */
  private transformEntity(
    entityName: string,
    definition: BedrockEntityDefinition,
    geometryLookup: Map<string, BedrockGeometry>,
    animationLookup: Map<string, BedrockAnimation>
  ): OutputEntity | null {
    // Resolve geometry references
    const geometryEntries: Record<string, OutputGeometry> = {};
    let hasGeometry = false;

    if (definition.geometry) {
      for (const [variantName, geoRef] of Object.entries(definition.geometry)) {
        const geo = this.resolveGeometry(geoRef, geometryLookup);
        if (geo) {
          geometryEntries[variantName] = this.transformGeometry(geo);
          hasGeometry = true;
        } else if (this.verbose) {
          console.warn(
            `[bedrock-transformer] ${entityName}: geometry ref "${geoRef}" not found`
          );
        }
      }
    }

    if (!hasGeometry) {
      if (this.verbose) {
        console.warn(`[bedrock-transformer] ${entityName}: no valid geometry found, skipping`);
      }
      return null;
    }

    // Resolve textures (keep paths as-is; Entity.js handles resolution)
    const textures: Record<string, string> = {};
    if (definition.textures) {
      for (const [name, texPath] of Object.entries(definition.textures)) {
        textures[name] = texPath;
      }
    }

    const entity: OutputEntity = {
      identifier: definition.identifier,
      textures,
      geometry: geometryEntries,
    };

    // Optional fields
    if (definition.min_engine_version) {
      entity.min_engine_version = definition.min_engine_version;
    }
    if (definition.materials) {
      entity.materials = definition.materials;
    }

    // Resolve animations
    if (this.includeAnimations && definition.animations) {
      const animations: Record<string, OutputAnimation> = {};
      for (const [animName, animRef] of Object.entries(definition.animations)) {
        const anim = animationLookup.get(animRef);
        if (anim) {
          animations[animName] = this.transformAnimation(anim);
        }
        // Missing animations are common (many reference controller animations
        // that aren't in the resource pack), so don't warn
      }
      if (Object.keys(animations).length > 0) {
        entity.animations = animations;
      }
    }

    // Scripts and render controllers
    if (definition.scripts) {
      entity.scripts = definition.scripts;
    }
    if (definition.render_controllers) {
      entity.render_controllers = definition.render_controllers;
    }

    return entity;
  }

  /**
   * Resolve a geometry reference to an actual geometry definition.
   * Handles both direct ID matches and partial matches.
   *
   * Entity definitions reference geometry by ID like "geometry.chicken"
   * which maps to a .geo.json with identifier "geometry.chicken".
   */
  private resolveGeometry(
    geoRef: string,
    geometryLookup: Map<string, BedrockGeometry>
  ): BedrockGeometry | null {
    // Direct match
    if (geometryLookup.has(geoRef)) {
      return geometryLookup.get(geoRef)!;
    }

    // Try with "geometry." prefix if not already present
    if (!geoRef.startsWith('geometry.')) {
      const prefixed = `geometry.${geoRef}`;
      if (geometryLookup.has(prefixed)) {
        return geometryLookup.get(prefixed)!;
      }
    }

    return null;
  }

  /**
   * Transform a Bedrock geometry into our output format.
   * The Bedrock format stores texture dimensions in description;
   * our format stores them at the geometry level (texturewidth/textureheight).
   */
  private transformGeometry(geo: BedrockGeometry): OutputGeometry {
    const output: OutputGeometry = {
      bones: geo.bones.map((bone) => this.transformBone(bone)),
    };

    if (geo.description.texture_width) {
      output.texturewidth = geo.description.texture_width;
    }
    if (geo.description.texture_height) {
      output.textureheight = geo.description.texture_height;
    }
    if (geo.description.visible_bounds_width) {
      output.visible_bounds_width = geo.description.visible_bounds_width;
    }
    if (geo.description.visible_bounds_height) {
      output.visible_bounds_height = geo.description.visible_bounds_height;
    }
    if (geo.description.visible_bounds_offset) {
      output.visible_bounds_offset = geo.description.visible_bounds_offset;
    }

    return output;
  }

  /**
   * Transform a single bone.
   */
  private transformBone(bone: BedrockBone): OutputBone {
    const output: OutputBone = {
      name: bone.name,
    };

    if (bone.parent) output.parent = bone.parent;
    if (bone.pivot) output.pivot = bone.pivot;
    if (bone.rotation) output.rotation = bone.rotation;
    if (bone.bind_pose_rotation) output.bind_pose_rotation = bone.bind_pose_rotation;
    if (bone.mirror) output.mirror = bone.mirror;

    if (bone.cubes && bone.cubes.length > 0) {
      output.cubes = bone.cubes.map((cube) => this.transformCube(cube));
    }

    return output;
  }

  /**
   * Transform a single cube.
   */
  private transformCube(cube: BedrockCube): OutputCube {
    const output: OutputCube = {
      origin: cube.origin,
      size: cube.size,
      uv: cube.uv,
    };

    if (cube.inflate !== undefined) output.inflate = cube.inflate;
    if (cube.rotation) output.rotation = cube.rotation;
    if (cube.pivot) output.pivot = cube.pivot;
    if (cube.mirror) output.mirror = cube.mirror;

    return output;
  }

  /**
   * Transform an animation definition.
   */
  private transformAnimation(anim: BedrockAnimation): OutputAnimation {
    const output: OutputAnimation = {};

    if (anim.loop !== undefined) output.loop = anim.loop;
    if (anim.animation_length !== undefined) output.animation_length = anim.animation_length;

    if (anim.bones) {
      output.bones = {};
      for (const [boneName, boneData] of Object.entries(anim.bones)) {
        const boneOutput: OutputAnimationBone = {};
        if (boneData.rotation !== undefined) boneOutput.rotation = boneData.rotation;
        if (boneData.position !== undefined) boneOutput.position = boneData.position;
        if (boneData.scale !== undefined) boneOutput.scale = boneData.scale;
        output.bones[boneName] = boneOutput;
      }
    }

    return output;
  }
}
