/**
 * Viewer Integration - Integrates animated material with the viewer.
 *
 * This module provides functions to:
 * 1. Replace the viewer's MeshPhongMaterial with our animated ShaderMaterial
 * 2. Set up the render loop to update animation time
 * 3. Load and configure the animation map from blockstates
 *
 * Usage:
 * ```typescript
 * import { integrateAnimatedMaterial } from './viewer-integration';
 *
 * // After the viewer is initialized
 * const cleanup = await integrateAnimatedMaterial(viewer, {
 *   blockStatesUrl: '/mc-assets/blocksStates/1.21.9.json',
 *   textureUrl: '/mc-assets/textures/1.21.9.png',
 * });
 *
 * // Later, when done
 * cleanup();
 * ```
 *
 * @module asset-pipeline/viewer-integration
 */

import * as THREE from 'three';
import {
  createAnimatedMaterial,
  generateAnimationMap,
  updateAnimatedMaterial,
  syncLightingWithScene,
} from './animated-material.js';

/**
 * Options for viewer integration.
 */
export interface ViewerIntegrationOptions {
  /** URL to fetch blockstates JSON */
  blockStatesUrl: string;
  /** URL to fetch texture atlas */
  textureUrl: string;
  /** Enable animation (default: true) */
  enableAnimation?: boolean;
  /** Animation speed multiplier (default: 1.0) */
  animationSpeed?: number;
  /** Log debug information */
  debug?: boolean;
}

/**
 * Viewer interface (minimal type for the viewer compatibility).
 */
export interface ViewerLike {
  world: {
    material: THREE.Material;
    scene: THREE.Scene;
  };
  scene: THREE.Scene;
  ambientLight?: THREE.AmbientLight;
  directionalLight?: THREE.DirectionalLight;
}

/**
 * Result of integration, includes cleanup function.
 */
export interface IntegrationResult {
  /** Cleanup function to restore original material */
  cleanup: () => void;
  /** The animated material instance */
  material: THREE.ShaderMaterial;
  /** Animation map texture */
  animationMap: THREE.DataTexture;
  /** Update function to call each frame */
  // eslint-disable-next-line no-unused-vars -- deltaTime parameter used by callers
  update: (deltaTime: number) => void;
}

/**
 * Integrates our animated material with the viewer.
 *
 * This replaces the viewer's default MeshPhongMaterial with our custom
 * ShaderMaterial that supports animated textures.
 *
 * @param viewer - The the viewer instance
 * @param options - Integration options
 * @returns Integration result with cleanup function
 */
export async function integrateAnimatedMaterial(
  viewer: ViewerLike,
  options: ViewerIntegrationOptions
): Promise<IntegrationResult> {
  const {
    blockStatesUrl,
    textureUrl,
    enableAnimation = true,
    animationSpeed = 1.0,
    debug = false,
  } = options;

  if (debug) {
    console.log('[viewer-integration] Starting integration...');
    console.log('[viewer-integration] BlockStates URL:', blockStatesUrl);
    console.log('[viewer-integration] Texture URL:', textureUrl);
  }

  // Store original material for cleanup
  const originalMaterial = viewer.world.material;

  // Load blockstates JSON
  const blockStates = await fetchJSON(blockStatesUrl);
  if (debug) {
    console.log(
      '[viewer-integration] Loaded blockstates with',
      Object.keys(blockStates).length,
      'blocks'
    );
  }

  // Load texture atlas
  const textureLoader = new THREE.TextureLoader();
  const texture = await new Promise<THREE.Texture>((resolve, reject) => {
    textureLoader.load(
      textureUrl,
      (tex) => {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.flipY = false;
        tex.generateMipmaps = false;
        resolve(tex);
      },
      undefined,
      reject
    );
  });

  if (debug) {
    console.log(
      '[viewer-integration] Loaded texture atlas:',
      texture.image?.width,
      'x',
      texture.image?.height
    );
  }

  // Generate animation map from blockstates
  const animationMap = enableAnimation
    ? generateAnimationMap(blockStates, texture.image?.width ?? 1024)
    : generateEmptyAnimationMap();

  if (debug) {
    console.log('[viewer-integration] Generated animation map');
  }

  // Create animated material
  const material = createAnimatedMaterial({
    map: texture,
    animationMap,
    ambientLightColor: viewer.ambientLight?.color ?? new THREE.Color(0xffffff),
    ambientLightIntensity: viewer.ambientLight?.intensity ?? 0.6,
    directionalLightColor:
      viewer.directionalLight?.color ?? new THREE.Color(0xffffff),
    directionalLightDirection: viewer.directionalLight?.position
      .clone()
      .normalize() ?? new THREE.Vector3(1, 1, 0.5).normalize(),
    directionalLightIntensity: viewer.directionalLight?.intensity ?? 0.5,
  });

  // Replace the viewer's material
  viewer.world.material = material;

  // Update existing meshes to use new material
  updateSceneMaterials(viewer.world.scene ?? viewer.scene, material);

  if (debug) {
    console.log('[viewer-integration] Material replaced successfully');
  }

  // Create update function for render loop
  let lastTime = Date.now();
  const update = (deltaTimeOverride?: number) => {
    const now = Date.now();
    const deltaTime =
      deltaTimeOverride ?? ((now - lastTime) / 1000) * animationSpeed;
    lastTime = now;

    updateAnimatedMaterial(material, deltaTime);

    // Sync lighting if scene lights changed
    syncLightingWithScene(
      material,
      viewer.ambientLight,
      viewer.directionalLight
    );
  };

  // Cleanup function
  const cleanup = () => {
    viewer.world.material = originalMaterial;
    updateSceneMaterials(
      viewer.world.scene ?? viewer.scene,
      originalMaterial as THREE.Material
    );
    material.dispose();
    animationMap.dispose();
    texture.dispose();

    if (debug) {
      console.log('[viewer-integration] Cleaned up, restored original material');
    }
  };

  return {
    cleanup,
    material,
    animationMap,
    update,
  };
}

/**
 * Creates an empty animation map (no animations).
 */
function generateEmptyAnimationMap(): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 0]),
    1,
    1,
    THREE.RGBAFormat
  );
  texture.needsUpdate = true;
  return texture;
}

/**
 * Updates all meshes in a scene to use a new material.
 */
function updateSceneMaterials(scene: THREE.Scene, material: THREE.Material): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      // Only update world chunk meshes (skip entities, etc.)
      if (object.geometry?.attributes?.uv) {
        object.material = material;
      }
    }
  });
}

/**
 * Fetches and parses JSON from a URL.
 */
async function fetchJSON(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

/**
 * Hook into the viewer's render loop.
 *
 * This patches the viewer to call our update function each frame.
 *
 * @param viewer - The the viewer instance
 * @param integration - The integration result from integrateAnimatedMaterial
 * @returns Cleanup function to remove the hook
 */
export function hookRenderLoop(
  viewer: ViewerLike & { render?: () => void },
  integration: IntegrationResult
): () => void {
  // If viewer has a render method, wrap it
  const originalRender = viewer.render;

  if (typeof originalRender === 'function') {
    // eslint-disable-next-line no-unused-vars -- 'this' needed for proper method binding
    viewer.render = function (this: typeof viewer) {
      integration.update(1 / 60); // Assume 60fps when called from render
      return originalRender.call(this);
    };

    return () => {
      viewer.render = originalRender;
    };
  }

  // Otherwise, set up a timer-based loop (Node.js compatible)
  let running = true;
  let lastTime = Date.now();

  const animate = () => {
    if (!running) return;
    const now = Date.now();
    const deltaTime = (now - lastTime) / 1000;
    lastTime = now;
    integration.update(deltaTime);
    setTimeout(animate, 1000 / 60); // ~60fps
  };

  animate();

  return () => {
    running = false;
  };
}

/**
 * Complete setup for animated textures in the viewer.
 *
 * Combines material integration and render loop hook.
 *
 * @param viewer - The the viewer instance
 * @param options - Integration options
 * @returns Cleanup function
 */
export async function setupAnimatedViewer(
  viewer: ViewerLike & { render?: () => void },
  options: ViewerIntegrationOptions
): Promise<() => void> {
  const integration = await integrateAnimatedMaterial(viewer, options);
  const unhookRender = hookRenderLoop(viewer, integration);

  return () => {
    unhookRender();
    integration.cleanup();
  };
}
