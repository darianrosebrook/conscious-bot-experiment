/**
 * Minecraft Asset Extraction Pipeline
 *
 * This pipeline extracts textures and blockStates directly from Minecraft JARs,
 * eliminating dependency on upstream `minecraft-assets` package updates.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { AssetPipeline } from './asset-pipeline';
 *
 * const pipeline = new AssetPipeline();
 *
 * // Generate assets for a specific version
 * const result = await pipeline.generate('1.21.9');
 * console.log(`Texture atlas: ${result.texturePath}`);
 * console.log(`BlockStates: ${result.blockStatesPath}`);
 * ```
 *
 * ## CLI Usage
 *
 * ```bash
 * pnpm mc:assets extract 1.21.9      # Generate for specific version
 * pnpm mc:assets extract --latest    # Generate for latest release
 * pnpm mc:assets list                # Show cached versions
 * pnpm mc:assets clean               # Clear cache
 * ```
 *
 * ## Express Integration
 *
 * ```typescript
 * import express from 'express';
 * import { createAssetServer } from './asset-pipeline';
 *
 * const app = express();
 * app.use('/mc-assets', createAssetServer({ autoGenerate: true }));
 * ```
 *
 * @module asset-pipeline
 */

// Core pipeline components
export { VersionResolver, getVersionResolver } from './version-resolver.js';
export { JarDownloader, getJarDownloader } from './jar-downloader.js';
export { AssetExtractor, getAssetExtractor } from './asset-extractor.js';
export { AtlasBuilder, getAtlasBuilder } from './atlas-builder.js';
export { BlockStatesBuilder, buildBlockStates } from './blockstates-builder.js';

// Main orchestrator
export { AssetPipeline, getAssetPipeline } from './pipeline.js';
export type { PipelineProgress } from './pipeline.js';

// Express integration
export { createAssetServer, createAssetMiddleware } from './asset-server.js';

// Texture animation support
export {
  animatedVertexShader,
  animatedFragmentShader,
  buildAnimationLookup,
  generateAnimationMap,
  generateAnimationTextures,
  generateFrameSequenceMap,
  createAnimatedMaterial,
  updateAnimatedMaterial,
  updateDayNightCycle,
  worldTimeToDayProgress,
  getDayLightLevel,
  syncLightingWithScene,
  calculateAnimationFrame,
  calculateAnimatedVOffset,
  DAY_AMBIENT_COLOR,
  NIGHT_AMBIENT_COLOR,
  TWILIGHT_AMBIENT_COLOR,
  DAY_DIRECTIONAL_COLOR,
  NIGHT_DIRECTIONAL_COLOR,
  TWILIGHT_DIRECTIONAL_COLOR,
  MAX_SEQUENCE_LENGTH,
  MAX_SEQUENCE_COUNT,
} from './animated-material.js';
export type {
  ClientAnimationData,
  AnimatedMaterialOptions,
  AnimationTextureSet,
} from './animated-material.js';

// Entity skeletal animation support
export {
  EntityAnimationManager,
  getAnimationManager,
  resetAnimationManager,
  createAnimationClip,
  determineAnimationState,
  calculateAnimationSpeed,
  getEntityCategory,
  BIPED_BONES,
  QUADRUPED_BONES,
  BIPED_ENTITIES,
  QUADRUPED_ENTITIES,
  BIPED_IDLE_ANIMATION,
  BIPED_WALK_ANIMATION,
  BIPED_RUN_ANIMATION,
  BIPED_JUMP_ANIMATION,
  BIPED_FALL_ANIMATION,
  QUADRUPED_IDLE_ANIMATION,
  QUADRUPED_WALK_ANIMATION,
} from './entity-animations.js';
export type {
  AnimationState,
  EntityMovementData,
  BoneKeyframe,
  EntityAnimationDefinition,
  ManagedEntityAnimation,
} from './entity-animations.js';

// Viewer integration
export {
  integrateAnimatedMaterial,
  hookRenderLoop,
  setupAnimatedViewer,
} from './viewer-integration.js';
export type {
  ViewerIntegrationOptions,
  ViewerLike,
  IntegrationResult,
} from './viewer-integration.js';

// Types
export type {
  // Mojang API types
  MojangVersionManifest,
  MojangVersionEntry,
  MojangVersionDetails,

  // Version resolver
  ResolvedVersion,
  VersionResolverOptions,

  // JAR downloader
  DownloadProgressCallback,
  JarDownloaderOptions,
  JarDownloadResult,

  // Asset extractor
  AssetExtractorOptions,
  AssetExtractionResult,
  ExtractedTexture,
  ExtractedBlockState,
  ExtractedModel,

  // Block state & model definitions
  BlockStateDefinition,
  BlockStateVariant,
  MultipartCondition,
  MultipartEntry,
  BlockModelDefinition,
  ModelElement,
  ModelFace,

  // Animation types
  AnimationMeta,
  TextureAnimationData,

  // Atlas builder
  AtlasBuilderOptions,
  TextureAtlas,
  TextureUV,

  // BlockStates builder
  ResolvedTexture,
  ResolvedModel,
  ResolvedModelElement,
  ResolvedModelFace,
  ResolvedVariant,
  ResolvedBlockStates,

  // Pipeline
  AssetPipelineOptions,
  GeneratedAssets,
  CachedVersionInfo,

  // Asset server
  AssetServerOptions,
} from './types.js';
