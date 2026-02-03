/**
 * Animated Material - Custom Three.js ShaderMaterial for animated Minecraft textures.
 *
 * This material extends the standard Phong shading with support for sprite-sheet
 * based texture animation. Animation data is encoded into a lookup texture that
 * the shader samples to determine frame offsets.
 *
 * Architecture:
 * 1. Animation metadata is encoded into a DataTexture (animationMap)
 * 2. The fragment shader checks if the current UV falls within an animated region
 * 3. If animated, it calculates the frame offset based on time and frametime
 * 4. The offset is applied to the V coordinate to select the correct frame
 *
 * @module asset-pipeline/animated-material
 */

import * as THREE from 'three';

// ============================================================================
// Shader Code
// ============================================================================

/**
 * Vertex shader for animated block textures.
 *
 * Passes through standard vertex attributes. The fragment shader handles
 * all animation logic since UV animation is a per-pixel operation.
 */
export const animatedVertexShader = /* glsl */ `
  // Three.js provides these automatically:
  // attribute vec3 position;
  // attribute vec3 normal;
  // attribute vec2 uv;
  // uniform mat4 modelViewMatrix;
  // uniform mat4 projectionMatrix;
  // uniform mat3 normalMatrix;

  // Custom attribute for vertex colors (tinting + AO)
  attribute vec3 color;

  // Varyings to pass to fragment shader
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vColor = color;
    vNormal = normalize(normalMatrix * normal);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Fragment shader for animated block textures.
 *
 * Implements Phong-like shading with animated UV lookup.
 * Animation regions are defined in the animationMap texture:
 * - R channel: frameCount (0 = not animated)
 * - G channel: frametime in ticks (scaled)
 * - B channel: frameVStep (scaled)
 * - A channel: flags (interpolate, etc.)
 */
export const animatedFragmentShader = /* glsl */ `
  precision highp float;

  // Texture uniforms
  uniform sampler2D map;              // Main texture atlas
  uniform sampler2D animationMap;     // Animation lookup texture

  // Animation uniforms
  uniform float time;                 // Current time in seconds
  uniform float animationMapSize;     // Size of animation lookup texture
  uniform vec2 atlasSize;             // Atlas dimensions for UV calculation

  // Lighting uniforms
  uniform vec3 ambientLightColor;
  uniform float ambientLightIntensity;
  uniform vec3 directionalLightColor;
  uniform vec3 directionalLightDirection;
  uniform float directionalLightIntensity;

  // Material properties
  uniform float specularStrength;
  uniform float shininess;
  uniform float alphaTest;

  // Varyings from vertex shader
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  /**
   * Decodes animation data from the lookup texture.
   * Returns vec4(frameCount, frametimeMs, frameVStep, flags)
   */
  vec4 getAnimationData(vec2 uv) {
    // Sample the animation map at the UV position
    // The animation map is aligned with the atlas - same UV space
    vec4 data = texture2D(animationMap, uv);

    // Decode: stored as normalized values, need to scale back
    float frameCount = data.r * 255.0;
    float frametimeMs = data.g * 255.0 * 50.0;  // ticks * 50ms
    float frameVStep = data.b;                   // Already normalized
    float flags = data.a * 255.0;

    return vec4(frameCount, frametimeMs, frameVStep, flags);
  }

  /**
   * Calculates the animated UV offset for a texture.
   */
  vec2 animateUV(vec2 uv, vec4 animData) {
    float frameCount = animData.x;
    float frametimeMs = animData.y;
    float frameVStep = animData.z;

    // No animation if frameCount is 0 or 1
    if (frameCount <= 1.0) {
      return uv;
    }

    // Calculate current frame based on time
    float timeMs = time * 1000.0;
    float cycleTime = frameCount * frametimeMs;
    float timeInCycle = mod(timeMs, cycleTime);
    float frameIndex = floor(timeInCycle / frametimeMs);

    // Apply V offset for current frame
    float vOffset = frameIndex * frameVStep;

    return vec2(uv.x, uv.y + vOffset);
  }

  void main() {
    // Get animation data for this UV region
    vec4 animData = getAnimationData(vUv);

    // Calculate potentially animated UV
    vec2 animatedUv = animateUV(vUv, animData);

    // Sample the texture
    vec4 texColor = texture2D(map, animatedUv);

    // Alpha test - discard transparent pixels
    if (texColor.a < alphaTest) discard;

    // Apply vertex color (biome tinting + ambient occlusion)
    vec3 baseColor = texColor.rgb * vColor;

    // Phong-style lighting
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    // Ambient component
    vec3 ambient = ambientLightColor * ambientLightIntensity * baseColor;

    // Diffuse component (Lambert)
    float NdotL = max(dot(normal, directionalLightDirection), 0.0);
    vec3 diffuse = directionalLightColor * directionalLightIntensity * baseColor * NdotL;

    // Specular component (Blinn-Phong)
    vec3 halfDir = normalize(directionalLightDirection + viewDir);
    float NdotH = max(dot(normal, halfDir), 0.0);
    float spec = pow(NdotH, shininess) * specularStrength;
    vec3 specular = directionalLightColor * spec * NdotL;

    // Final color
    vec3 finalColor = ambient + diffuse + specular;

    gl_FragColor = vec4(finalColor, texColor.a);
  }
`;

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Animation metadata structure for client-side lookup.
 */
export interface ClientAnimationData {
  /** Texture name */
  name: string;
  /** Base U coordinate in atlas (0-1) */
  u: number;
  /** Base V coordinate in atlas (0-1) */
  v: number;
  /** Tile size in UV space */
  su: number;
  /** Tile size in UV space */
  sv: number;
  /** Frame time in game ticks (1 tick = 50ms) */
  frametime: number;
  /** Total frame count */
  frameCount: number;
  /** V step per frame (normalized) */
  frameVStep: number;
  /** Custom frame sequence (optional) */
  frames?: number[];
  /** Whether to interpolate between frames */
  interpolate?: boolean;
}

/**
 * Options for creating the animated material.
 */
export interface AnimatedMaterialOptions {
  /** Texture atlas */
  map: THREE.Texture;
  /** Animation lookup texture (generated from blockstates) */
  animationMap?: THREE.DataTexture;
  /** Ambient light color */
  ambientLightColor?: THREE.Color;
  /** Ambient light intensity */
  ambientLightIntensity?: number;
  /** Directional light color */
  directionalLightColor?: THREE.Color;
  /** Directional light direction (normalized) */
  directionalLightDirection?: THREE.Vector3;
  /** Directional light intensity */
  directionalLightIntensity?: number;
  /** Specular highlight strength */
  specularStrength?: number;
  /** Shininess exponent */
  shininess?: number;
  /** Alpha test threshold */
  alphaTest?: number;
}

// ============================================================================
// Animation Map Generation
// ============================================================================

/**
 * Generates an animation lookup texture from blockstates data.
 *
 * The texture encodes animation parameters at each UV position:
 * - R: frameCount (0-255)
 * - G: frametime in ticks (0-255, where 255 = 12.75 seconds)
 * - B: frameVStep (0-1 normalized)
 * - A: flags (bit 0 = interpolate)
 *
 * @param blockStates - The resolved blockstates JSON with animation data
 * @param atlasSize - Size of the texture atlas (e.g., 1024)
 * @returns DataTexture for use in the shader
 */
export function generateAnimationMap(
  blockStates: Record<string, unknown>,
  atlasSize: number
): THREE.DataTexture {
  // Create RGBA data array for the animation map
  // We use a smaller resolution than the atlas since animation regions
  // typically span multiple pixels
  const mapSize = Math.min(atlasSize, 256); // 256x256 is sufficient
  const data = new Uint8Array(mapSize * mapSize * 4);

  // Initialize with zeros (no animation)
  data.fill(0);

  // Collect all animation data from blockstates
  const animations = buildAnimationLookup(blockStates);

  // Write animation data to the texture
  for (const anim of animations.values()) {
    // Calculate pixel region in the animation map
    const startX = Math.floor(anim.u * mapSize);
    const startY = Math.floor(anim.v * mapSize);
    const endX = Math.ceil((anim.u + anim.su) * mapSize);
    const endY = Math.ceil((anim.v + anim.sv) * mapSize);

    // Fill the region with animation parameters
    for (let y = startY; y < endY && y < mapSize; y++) {
      for (let x = startX; x < endX && x < mapSize; x++) {
        const idx = (y * mapSize + x) * 4;

        // R: frameCount (clamped to 255)
        data[idx + 0] = Math.min(255, anim.frameCount);

        // G: frametime in ticks (clamped to 255)
        data[idx + 1] = Math.min(255, anim.frametime);

        // B: frameVStep (normalized 0-1, stored as 0-255)
        data[idx + 2] = Math.floor(anim.frameVStep * 255);

        // A: flags
        let flags = 0;
        if (anim.interpolate) flags |= 1;
        data[idx + 3] = flags;
      }
    }
  }

  // Create the DataTexture
  const texture = new THREE.DataTexture(
    data,
    mapSize,
    mapSize,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );

  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return texture;
}

/**
 * Creates the animation metadata lookup table from blockstates.
 *
 * @param blockStates - The resolved blockstates JSON with animation data
 * @returns Map of animation data keyed by UV coordinate string
 */
export function buildAnimationLookup(
  blockStates: Record<string, unknown>
): Map<string, ClientAnimationData> {
  const animations = new Map<string, ClientAnimationData>();

  // Walk through all blockstates and collect animation data
  for (const blockData of Object.values(blockStates)) {
    const block = blockData as {
      variants?: Record<string, unknown>;
      multipart?: Array<{ apply: unknown }>;
    };

    // Process variants
    if (block.variants) {
      for (const variant of Object.values(block.variants)) {
        extractAnimationsFromVariant(variant, animations);
      }
    }

    // Process multipart
    if (block.multipart) {
      for (const part of block.multipart) {
        extractAnimationsFromVariant(part.apply, animations);
      }
    }
  }

  return animations;
}

/**
 * Extracts animation data from a variant or multipart apply.
 */
function extractAnimationsFromVariant(
  variant: unknown,
  animations: Map<string, ClientAnimationData>
): void {
  const variants = Array.isArray(variant) ? variant : [variant];

  for (const v of variants) {
    const model = (v as { model?: { textures?: Record<string, unknown> } })
      .model;
    if (!model?.textures) continue;

    for (const [texName, texData] of Object.entries(model.textures)) {
      const tex = texData as {
        u?: number;
        v?: number;
        su?: number;
        sv?: number;
        animation?: {
          frametime: number;
          frameCount: number;
          frameVStep: number;
          frames?: number[];
          interpolate?: boolean;
        };
      };

      if (tex.animation && tex.u !== undefined) {
        // Use UV as key (textures at same position share animation)
        const key = `${tex.u.toFixed(6)},${tex.v?.toFixed(6)}`;

        if (!animations.has(key)) {
          animations.set(key, {
            name: texName,
            u: tex.u,
            v: tex.v ?? 0,
            su: tex.su ?? 0.0625,
            sv: tex.sv ?? 0.0625,
            frametime: tex.animation.frametime,
            frameCount: tex.animation.frameCount,
            frameVStep: tex.animation.frameVStep,
            frames: tex.animation.frames,
            interpolate: tex.animation.interpolate,
          });
        }
      }
    }
  }
}

// ============================================================================
// Material Creation
// ============================================================================

/**
 * Creates an animated ShaderMaterial for Minecraft block rendering.
 *
 * This material replaces THREE.MeshPhongMaterial with a custom shader
 * that supports animated textures via UV offset based on time.
 *
 * @param options - Material configuration options
 * @returns Configured ShaderMaterial
 */
export function createAnimatedMaterial(
  options: AnimatedMaterialOptions
): THREE.ShaderMaterial {
  const {
    map,
    animationMap,
    ambientLightColor = new THREE.Color(0xffffff),
    ambientLightIntensity = 0.6,
    directionalLightColor = new THREE.Color(0xffffff),
    directionalLightDirection = new THREE.Vector3(1, 1, 0.5).normalize(),
    directionalLightIntensity = 0.5,
    specularStrength = 0.1,
    shininess = 15,
    alphaTest = 0.1,
  } = options;

  // Create a 1x1 dummy animation map if none provided
  const defaultAnimMap = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 0]),
    1,
    1,
    THREE.RGBAFormat
  );
  defaultAnimMap.needsUpdate = true;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      animationMap: { value: animationMap ?? defaultAnimMap },
      time: { value: 0 },
      animationMapSize: { value: animationMap ? 256 : 1 },
      atlasSize: { value: new THREE.Vector2(map.image?.width ?? 1024, map.image?.height ?? 1024) },
      ambientLightColor: { value: ambientLightColor },
      ambientLightIntensity: { value: ambientLightIntensity },
      directionalLightColor: { value: directionalLightColor },
      directionalLightDirection: { value: directionalLightDirection },
      directionalLightIntensity: { value: directionalLightIntensity },
      specularStrength: { value: specularStrength },
      shininess: { value: shininess },
      alphaTest: { value: alphaTest },
    },
    vertexShader: animatedVertexShader,
    fragmentShader: animatedFragmentShader,
    transparent: true,
    side: THREE.FrontSide,
    vertexColors: true,
  });

  return material;
}

/**
 * Updates the time uniform for animation.
 * Call this in your render loop.
 *
 * @param material - The animated material
 * @param deltaTime - Time since last frame in seconds
 */
export function updateAnimatedMaterial(
  material: THREE.ShaderMaterial,
  deltaTime: number
): void {
  if (material.uniforms.time) {
    material.uniforms.time.value += deltaTime;
  }
}

/**
 * Updates lighting uniforms to sync with scene lighting.
 *
 * @param material - The animated material
 * @param ambientLight - Three.js AmbientLight
 * @param directionalLight - Three.js DirectionalLight
 */
export function syncLightingWithScene(
  material: THREE.ShaderMaterial,
  ambientLight?: THREE.AmbientLight,
  directionalLight?: THREE.DirectionalLight
): void {
  if (ambientLight && material.uniforms.ambientLightColor) {
    material.uniforms.ambientLightColor.value.copy(ambientLight.color);
    material.uniforms.ambientLightIntensity.value = ambientLight.intensity;
  }

  if (directionalLight && material.uniforms.directionalLightColor) {
    material.uniforms.directionalLightColor.value.copy(directionalLight.color);
    material.uniforms.directionalLightIntensity.value =
      directionalLight.intensity;
    material.uniforms.directionalLightDirection.value
      .copy(directionalLight.position)
      .normalize();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculates the current frame for an animated texture (CPU-side).
 *
 * @param animation - Animation data
 * @param timeMs - Current time in milliseconds
 * @returns Current frame index (0-based)
 */
export function calculateAnimationFrame(
  animation: ClientAnimationData,
  timeMs: number
): number {
  // Convert frametime from ticks to milliseconds (1 tick = 50ms)
  const frameTimeMs = animation.frametime * 50;
  const totalFrames = animation.frames?.length ?? animation.frameCount;

  // Calculate which frame we're on
  const cycleTime = totalFrames * frameTimeMs;
  const timeInCycle = timeMs % cycleTime;
  const frameIndex = Math.floor(timeInCycle / frameTimeMs);

  // If custom frame sequence, look up the actual frame
  if (animation.frames && animation.frames.length > 0) {
    return animation.frames[frameIndex % animation.frames.length];
  }

  return frameIndex % animation.frameCount;
}

/**
 * Calculates interpolated UV offset for smooth animation (CPU-side).
 *
 * @param animation - Animation data
 * @param timeMs - Current time in milliseconds
 * @returns V offset to add to base UV coordinate
 */
export function calculateAnimatedVOffset(
  animation: ClientAnimationData,
  timeMs: number
): number {
  const frame = calculateAnimationFrame(animation, timeMs);
  return frame * animation.frameVStep;
}

// ============================================================================
// Export Types for External Use
// ============================================================================

export type { THREE };
