/**
 * Animated Material - Custom Three.js ShaderMaterial for animated Minecraft textures.
 *
 * This material extends the standard Phong shading with support for sprite-sheet
 * based texture animation. Animation data is encoded into lookup textures that
 * the shader samples to determine frame offsets.
 *
 * Architecture:
 * 1. Animation metadata is encoded into a DataTexture (animationMap)
 *    - R: frameCount, G: frametime, B: frameVStep, A: flags
 * 2. Custom frame sequences are encoded into a separate texture (frameSequenceMap)
 *    - Allows non-sequential animations like lava_still [0,1,2,...,19,18,17,...,1]
 * 3. Day/night cycle uses smooth interpolation via dayProgress uniform
 * 4. The fragment shader calculates frame offset and applies lighting
 *
 * @module asset-pipeline/animated-material
 */

import * as THREE from 'three';

// ============================================================================
// Day/Night Color Constants (Minecraft-accurate)
// ============================================================================

/** Minecraft's day ambient light color (full brightness) */
export const DAY_AMBIENT_COLOR = new THREE.Color(0xffffff);
/** Minecraft's night ambient light color (moonlight blue tint) */
export const NIGHT_AMBIENT_COLOR = new THREE.Color(0x4060a0);
/** Minecraft's sunset/sunrise ambient color */
export const TWILIGHT_AMBIENT_COLOR = new THREE.Color(0xffaa66);

/** Minecraft's day directional light (sun) */
export const DAY_DIRECTIONAL_COLOR = new THREE.Color(0xffffee);
/** Minecraft's night directional light (moon) */
export const NIGHT_DIRECTIONAL_COLOR = new THREE.Color(0x6688cc);
/** Minecraft's sunset/sunrise directional (orange sun) */
export const TWILIGHT_DIRECTIONAL_COLOR = new THREE.Color(0xff8844);

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
 * - A channel: flags (bit 0 = interpolate, bit 1 = has custom frame sequence)
 *
 * Frame interpolation blends between adjacent frames for smooth water/lava/fire
 * animations instead of hard frame cuts.
 *
 * Day/night cycle smoothly interpolates between day, twilight, and night colors
 * using the dayProgress uniform (0.0 = midnight, 0.5 = noon, 1.0 = midnight).
 */
export const animatedFragmentShader = /* glsl */ `
  precision highp float;

  // Texture uniforms
  uniform sampler2D map;              // Main texture atlas
  uniform sampler2D animationMap;     // Animation lookup texture
  uniform sampler2D frameSequenceMap; // Custom frame sequence lookup (for lava, etc.)

  // Animation uniforms
  uniform float time;                 // Current time in seconds
  uniform float animationMapSize;     // Size of animation lookup texture
  uniform vec2 atlasSize;             // Atlas dimensions for UV calculation
  uniform float frameSequenceWidth;   // Width of frame sequence texture (max frames)

  // Day/night cycle uniforms
  uniform float dayProgress;          // 0.0 = midnight, 0.5 = noon, 1.0 = midnight
  uniform vec3 dayAmbientColor;       // Ambient color at noon
  uniform vec3 nightAmbientColor;     // Ambient color at midnight
  uniform vec3 twilightAmbientColor;  // Ambient color at dawn/dusk
  uniform vec3 dayDirectionalColor;   // Sun color at noon
  uniform vec3 nightDirectionalColor; // Moon color at midnight
  uniform vec3 twilightDirectionalColor; // Sun color at dawn/dusk

  // Lighting uniforms (computed from day/night interpolation)
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
   * Smoothly interpolates between day, twilight, and night colors.
   *
   * Minecraft day cycle:
   * - 0.0 (0 ticks):     Midnight
   * - 0.25 (6000 ticks): Dawn/Sunrise
   * - 0.5 (12000 ticks): Noon
   * - 0.75 (18000 ticks): Dusk/Sunset
   * - 1.0 (24000 ticks): Midnight
   *
   * We use smooth blending with wider twilight zones for natural transitions.
   */
  vec3 interpolateDayNightColor(vec3 dayColor, vec3 twilightColor, vec3 nightColor, float progress) {
    // Convert progress to a position where 0=midnight, 0.5=noon
    // and calculate how "day" vs "night" vs "twilight" we are

    // Distance from noon (0.5) - ranges from 0 at noon to 0.5 at midnight
    float distFromNoon = abs(progress - 0.5);

    // Twilight zones around 0.25 (dawn) and 0.75 (dusk)
    // We use smooth transitions over ~0.1 of the cycle
    float twilightWidth = 0.1;
    float nightThreshold = 0.35;  // When it becomes fully night

    if (distFromNoon < twilightWidth) {
      // Close to noon - pure day
      return dayColor;
    } else if (distFromNoon > nightThreshold) {
      // Deep night - pure night
      return nightColor;
    } else {
      // Twilight zone - smooth transition
      // Map [twilightWidth, nightThreshold] to [0, 1]
      float t = (distFromNoon - twilightWidth) / (nightThreshold - twilightWidth);

      // Use smoothstep for natural transition
      t = smoothstep(0.0, 1.0, t);

      // First half: day -> twilight, Second half: twilight -> night
      if (t < 0.5) {
        return mix(dayColor, twilightColor, t * 2.0);
      } else {
        return mix(twilightColor, nightColor, (t - 0.5) * 2.0);
      }
    }
  }

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
   * Looks up the actual frame index from the frame sequence texture.
   * Used for non-sequential animations like lava_still [0,1,2,...,19,18,17,...,1]
   *
   * @param sequenceIndex - Which animation sequence (row in the texture)
   * @param frameInSequence - Which frame in the sequence to look up
   * @return The actual texture frame index to sample
   */
  float lookupFrameSequence(float sequenceIndex, float frameInSequence) {
    // Frame sequence texture: each row is one animation's frame sequence
    // X = frame position in sequence, Y = animation sequence index
    // Value = actual frame number to display
    vec2 seqUV = vec2(
      (frameInSequence + 0.5) / frameSequenceWidth,
      (sequenceIndex + 0.5) / 256.0  // Max 256 different animated textures
    );
    vec4 seqData = texture2D(frameSequenceMap, seqUV);
    return seqData.r * 255.0;  // Frame index stored in R channel
  }

  /**
   * Samples the animated texture with optional frame interpolation and
   * custom frame sequence support.
   *
   * Supports two animation modes:
   * 1. Sequential: frames 0,1,2,3... (default)
   * 2. Custom sequence: any order like [0,1,2,19,18,17,16...] (lava_still)
   *
   * When interpolate flag is set (water, lava, fire), blends between
   * adjacent frames for smooth flowing animation instead of hard cuts.
   *
   * @param uv - Base UV coordinate
   * @param animData - Animation parameters (frameCount, frametimeMs, frameVStep, flags)
   * @param sequenceIndex - Index into frame sequence texture (for custom sequences)
   * @return Sampled and potentially interpolated texture color
   */
  vec4 sampleAnimatedTexture(vec2 uv, vec4 animData, float sequenceIndex) {
    float frameCount = animData.x;
    float frametimeMs = animData.y;
    float frameVStep = animData.z;
    float flags = animData.w;

    // No animation if frameCount is 0 or 1
    if (frameCount <= 1.0) {
      return texture2D(map, uv);
    }

    // Check flags: bit 0 = interpolate, bit 1 = has custom sequence
    bool shouldInterpolate = mod(flags, 2.0) >= 1.0;
    bool hasCustomSequence = mod(floor(flags / 2.0), 2.0) >= 1.0;

    // Calculate frame timing
    float timeMs = time * 1000.0;
    float cycleTime = frameCount * frametimeMs;
    float timeInCycle = mod(timeMs, cycleTime);
    float exactFrame = timeInCycle / frametimeMs;

    if (shouldInterpolate) {
      // Smooth interpolation: blend between current and next frame
      float seqFrame1 = floor(exactFrame);
      float seqFrame2 = mod(seqFrame1 + 1.0, frameCount);
      float blendFactor = fract(exactFrame);

      // Get actual frame indices (may differ from sequence position if custom)
      float actualFrame1 = seqFrame1;
      float actualFrame2 = seqFrame2;
      if (hasCustomSequence && sequenceIndex >= 0.0) {
        actualFrame1 = lookupFrameSequence(sequenceIndex, seqFrame1);
        actualFrame2 = lookupFrameSequence(sequenceIndex, seqFrame2);
      }

      // Calculate UV offsets for both frames
      vec2 uv1 = vec2(uv.x, uv.y + actualFrame1 * frameVStep);
      vec2 uv2 = vec2(uv.x, uv.y + actualFrame2 * frameVStep);

      // Sample both frames and blend
      vec4 color1 = texture2D(map, uv1);
      vec4 color2 = texture2D(map, uv2);

      return mix(color1, color2, blendFactor);
    } else {
      // Hard frame cut
      float seqFrame = floor(exactFrame);

      // Get actual frame index
      float actualFrame = seqFrame;
      if (hasCustomSequence && sequenceIndex >= 0.0) {
        actualFrame = lookupFrameSequence(sequenceIndex, seqFrame);
      }

      float vOffset = actualFrame * frameVStep;
      return texture2D(map, vec2(uv.x, uv.y + vOffset));
    }
  }

  void main() {
    // Get animation data for this UV region
    vec4 animData = getAnimationData(vUv);

    // TODO: In the future, we could encode sequence index in the animation map
    // For now, pass -1.0 to indicate no custom sequence lookup needed
    // (Custom sequences are handled by pre-encoding the sequence index)
    float sequenceIndex = -1.0;

    // Sample texture with animation (includes interpolation if flagged)
    vec4 texColor = sampleAnimatedTexture(vUv, animData, sequenceIndex);

    // Alpha test - discard transparent pixels
    if (texColor.a < alphaTest) discard;

    // Apply vertex color (biome tinting + ambient occlusion)
    vec3 baseColor = texColor.rgb * vColor;

    // Calculate day/night interpolated lighting colors
    vec3 currentAmbientColor = interpolateDayNightColor(
      dayAmbientColor, twilightAmbientColor, nightAmbientColor, dayProgress
    );
    vec3 currentDirectionalColor = interpolateDayNightColor(
      dayDirectionalColor, twilightDirectionalColor, nightDirectionalColor, dayProgress
    );

    // Phong-style lighting with day/night colors
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    // Ambient component - blends with manual override if provided
    vec3 effectiveAmbient = mix(currentAmbientColor, ambientLightColor,
      step(0.001, length(ambientLightColor - vec3(1.0)))); // Use override if not default white
    vec3 ambient = effectiveAmbient * ambientLightIntensity * baseColor;

    // Diffuse component (Lambert)
    vec3 effectiveDirectional = mix(currentDirectionalColor, directionalLightColor,
      step(0.001, length(directionalLightColor - vec3(1.0))));
    float NdotL = max(dot(normal, directionalLightDirection), 0.0);
    vec3 diffuse = effectiveDirectional * directionalLightIntensity * baseColor * NdotL;

    // Specular component (Blinn-Phong)
    vec3 halfDir = normalize(directionalLightDirection + viewDir);
    float NdotH = max(dot(normal, halfDir), 0.0);
    float spec = pow(NdotH, shininess) * specularStrength;
    vec3 specular = effectiveDirectional * spec * NdotL;

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
  /** Frame sequence lookup texture (for custom sequences) */
  frameSequenceMap?: THREE.DataTexture;
  /** Day/night progress (0.0 = midnight, 0.5 = noon, 1.0 = midnight) */
  dayProgress?: number;
  /** Ambient light color (overrides day/night interpolation if not white) */
  ambientLightColor?: THREE.Color;
  /** Ambient light intensity */
  ambientLightIntensity?: number;
  /** Directional light color (overrides day/night interpolation if not white) */
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

/** Maximum number of frames in a custom sequence */
export const MAX_SEQUENCE_LENGTH = 64;

/** Maximum number of animated textures with custom sequences */
export const MAX_SEQUENCE_COUNT = 256;

/**
 * Result of generating animation textures.
 */
export interface AnimationTextureSet {
  /** Animation lookup texture (R=frameCount, G=frametime, B=frameVStep, A=flags) */
  animationMap: THREE.DataTexture;
  /** Frame sequence lookup texture (for non-sequential animations) */
  frameSequenceMap: THREE.DataTexture;
  /** Number of animations with custom sequences */
  customSequenceCount: number;
}

/**
 * Generates both the animation lookup texture and frame sequence texture.
 *
 * The animation map encodes per-UV animation parameters.
 * The frame sequence map encodes custom frame orders for non-sequential animations.
 *
 * @param blockStates - The resolved blockstates JSON with animation data
 * @param atlasSize - Size of the texture atlas (e.g., 1024)
 * @returns Both textures needed for animation
 */
export function generateAnimationTextures(
  blockStates: Record<string, unknown>,
  atlasSize: number
): AnimationTextureSet {
  const animations = buildAnimationLookup(blockStates);

  // Generate the main animation map
  const animationMap = generateAnimationMapFromLookup(animations, atlasSize);

  // Generate the frame sequence map for custom sequences
  const { texture: frameSequenceMap, count: customSequenceCount } =
    generateFrameSequenceMap(animations);

  return {
    animationMap,
    frameSequenceMap,
    customSequenceCount,
  };
}

/**
 * Generates a frame sequence lookup texture for non-sequential animations.
 *
 * Layout: 2D texture where:
 * - Each row is one animation's frame sequence
 * - X coordinate = position in sequence (0 to MAX_SEQUENCE_LENGTH-1)
 * - Y coordinate = sequence index (assigned to each animation with custom frames)
 * - R channel = actual frame number to display
 *
 * @param animations - Animation lookup map
 * @returns Frame sequence texture and count of custom sequences
 */
export function generateFrameSequenceMap(
  animations: Map<string, ClientAnimationData>
): { texture: THREE.DataTexture; count: number } {
  // Create RGBA data for the frame sequence map
  const data = new Uint8Array(MAX_SEQUENCE_LENGTH * MAX_SEQUENCE_COUNT * 4);
  data.fill(0);

  let sequenceIndex = 0;

  for (const anim of animations.values()) {
    if (anim.frames && anim.frames.length > 0) {
      // This animation has a custom frame sequence
      for (let i = 0; i < Math.min(anim.frames.length, MAX_SEQUENCE_LENGTH); i++) {
        const idx = (sequenceIndex * MAX_SEQUENCE_LENGTH + i) * 4;
        data[idx + 0] = anim.frames[i]; // R = frame index
        data[idx + 1] = 0; // G unused
        data[idx + 2] = 0; // B unused
        data[idx + 3] = 255; // A = valid entry
      }
      sequenceIndex++;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    MAX_SEQUENCE_LENGTH,
    MAX_SEQUENCE_COUNT,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );

  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return { texture, count: sequenceIndex };
}

/**
 * Generates an animation lookup texture from blockstates data.
 *
 * The texture encodes animation parameters at each UV position:
 * - R: frameCount (0-255)
 * - G: frametime in ticks (0-255, where 255 = 12.75 seconds)
 * - B: frameVStep (0-1 normalized)
 * - A: flags (bit 0 = interpolate, bit 1 = has custom sequence)
 *
 * @param blockStates - The resolved blockstates JSON with animation data
 * @param atlasSize - Size of the texture atlas (e.g., 1024)
 * @returns DataTexture for use in the shader
 */
export function generateAnimationMap(
  blockStates: Record<string, unknown>,
  atlasSize: number
): THREE.DataTexture {
  const animations = buildAnimationLookup(blockStates);
  return generateAnimationMapFromLookup(animations, atlasSize);
}

/**
 * Internal: generates animation map from pre-built lookup.
 */
function generateAnimationMapFromLookup(
  animations: Map<string, ClientAnimationData>,
  atlasSize: number
): THREE.DataTexture {
  // Create RGBA data array for the animation map
  // We use a smaller resolution than the atlas since animation regions
  // typically span multiple pixels
  const mapSize = Math.min(atlasSize, 256); // 256x256 is sufficient
  const data = new Uint8Array(mapSize * mapSize * 4);

  // Initialize with zeros (no animation)
  data.fill(0);

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

        // A: flags (bit 0 = interpolate, bit 1 = has custom sequence)
        let flags = 0;
        if (anim.interpolate) flags |= 1;
        if (anim.frames && anim.frames.length > 0) flags |= 2;
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
 * that supports animated textures via UV offset based on time, with:
 * - Frame interpolation for smooth water/lava animations
 * - Custom frame sequence support for non-sequential animations
 * - Smooth day/night lighting transitions
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
    frameSequenceMap,
    dayProgress = 0.5, // Default to noon
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

  // Create a 1x1 dummy frame sequence map if none provided
  const defaultSeqMap = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 0]),
    1,
    1,
    THREE.RGBAFormat
  );
  defaultSeqMap.needsUpdate = true;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      // Texture uniforms
      map: { value: map },
      animationMap: { value: animationMap ?? defaultAnimMap },
      frameSequenceMap: { value: frameSequenceMap ?? defaultSeqMap },

      // Animation uniforms
      time: { value: 0 },
      animationMapSize: { value: animationMap ? 256 : 1 },
      atlasSize: { value: new THREE.Vector2(map.image?.width ?? 1024, map.image?.height ?? 1024) },
      frameSequenceWidth: { value: MAX_SEQUENCE_LENGTH },

      // Day/night cycle uniforms
      dayProgress: { value: dayProgress },
      dayAmbientColor: { value: DAY_AMBIENT_COLOR.clone() },
      nightAmbientColor: { value: NIGHT_AMBIENT_COLOR.clone() },
      twilightAmbientColor: { value: TWILIGHT_AMBIENT_COLOR.clone() },
      dayDirectionalColor: { value: DAY_DIRECTIONAL_COLOR.clone() },
      nightDirectionalColor: { value: NIGHT_DIRECTIONAL_COLOR.clone() },
      twilightDirectionalColor: { value: TWILIGHT_DIRECTIONAL_COLOR.clone() },

      // Lighting uniforms (can override day/night interpolation)
      ambientLightColor: { value: ambientLightColor },
      ambientLightIntensity: { value: ambientLightIntensity },
      directionalLightColor: { value: directionalLightColor },
      directionalLightDirection: { value: directionalLightDirection },
      directionalLightIntensity: { value: directionalLightIntensity },

      // Material properties
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
 * Updates the day/night progress for smooth lighting transitions.
 *
 * Minecraft day cycle:
 * - 0 ticks (0.0): Midnight - darkest
 * - 6000 ticks (0.25): Dawn/Sunrise - orange tint
 * - 12000 ticks (0.5): Noon - brightest
 * - 18000 ticks (0.75): Dusk/Sunset - orange tint
 * - 24000 ticks (1.0): Midnight - back to dark
 *
 * @param material - The animated material
 * @param worldTime - Minecraft world time in ticks (0-24000)
 */
export function updateDayNightCycle(
  material: THREE.ShaderMaterial,
  worldTime: number
): void {
  if (material.uniforms.dayProgress) {
    // Normalize to 0-1 range
    const progress = (worldTime % 24000) / 24000;
    material.uniforms.dayProgress.value = progress;
  }
}

/**
 * Converts Minecraft world time to day progress (0-1).
 *
 * @param worldTime - Minecraft world time in ticks
 * @returns Progress value (0.0 = midnight, 0.5 = noon)
 */
export function worldTimeToDayProgress(worldTime: number): number {
  return (worldTime % 24000) / 24000;
}

/**
 * Gets the current light level multiplier based on day progress.
 * Useful for calculating ambient occlusion or shadow intensity.
 *
 * @param dayProgress - Day progress (0-1)
 * @returns Light level (0.2 at night, 1.0 at noon)
 */
export function getDayLightLevel(dayProgress: number): number {
  // Distance from noon (0.5)
  const distFromNoon = Math.abs(dayProgress - 0.5);

  // Smooth transition using cosine
  const lightLevel = Math.cos(distFromNoon * Math.PI * 2) * 0.4 + 0.6;

  // Clamp to reasonable range (0.2 for moonlight, 1.0 for full sun)
  return Math.max(0.2, Math.min(1.0, lightLevel));
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
