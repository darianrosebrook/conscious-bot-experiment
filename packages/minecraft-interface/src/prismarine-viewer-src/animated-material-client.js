/**
 * Animated Material - Client-side Three.js ShaderMaterial for animated Minecraft textures.
 *
 * This is a bundled version of the animated-material.ts for client-side use.
 * It provides animated water/lava/fire textures with frame interpolation and
 * smooth day/night lighting transitions.
 *
 * @module prismarine-viewer-src/animated-material-client
 * @author @darianrosebrook
 */

/* global THREE */

// ============================================================================
// Day/Night Color Constants (Minecraft-accurate)
// ============================================================================

const DAY_AMBIENT_COLOR = new THREE.Color(0xffffff)
const NIGHT_AMBIENT_COLOR = new THREE.Color(0x4060a0)
const TWILIGHT_AMBIENT_COLOR = new THREE.Color(0xffaa66)

const DAY_DIRECTIONAL_COLOR = new THREE.Color(0xffffee)
const NIGHT_DIRECTIONAL_COLOR = new THREE.Color(0x6688cc)
const TWILIGHT_DIRECTIONAL_COLOR = new THREE.Color(0xff8844)

// ============================================================================
// Shader Code
// ============================================================================

const animatedVertexShader = `
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
`

const animatedFragmentShader = `
  precision highp float;

  uniform sampler2D map;
  uniform sampler2D animationMap;
  uniform float time;
  uniform float animationMapSize;
  uniform float dayProgress;
  uniform vec3 dayAmbientColor;
  uniform vec3 nightAmbientColor;
  uniform vec3 twilightAmbientColor;
  uniform vec3 dayDirectionalColor;
  uniform vec3 nightDirectionalColor;
  uniform vec3 twilightDirectionalColor;
  uniform vec3 ambientLightColor;
  uniform float ambientLightIntensity;
  uniform vec3 directionalLightColor;
  uniform vec3 directionalLightDirection;
  uniform float directionalLightIntensity;
  uniform float alphaTest;

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  vec3 interpolateDayNightColor(vec3 dayColor, vec3 twilightColor, vec3 nightColor, float progress) {
    float distFromNoon = abs(progress - 0.5);
    float twilightWidth = 0.1;
    float nightThreshold = 0.35;

    if (distFromNoon < twilightWidth) {
      return dayColor;
    } else if (distFromNoon > nightThreshold) {
      return nightColor;
    } else {
      float t = (distFromNoon - twilightWidth) / (nightThreshold - twilightWidth);
      t = smoothstep(0.0, 1.0, t);
      if (t < 0.5) {
        return mix(dayColor, twilightColor, t * 2.0);
      } else {
        return mix(twilightColor, nightColor, (t - 0.5) * 2.0);
      }
    }
  }

  vec4 getAnimationData(vec2 uv) {
    vec4 data = texture2D(animationMap, uv);
    float frameCount = data.r * 255.0;
    float frametimeMs = data.g * 255.0 * 50.0;
    float frameVStep = data.b;
    float flags = data.a * 255.0;
    return vec4(frameCount, frametimeMs, frameVStep, flags);
  }

  vec4 sampleAnimatedTexture(vec2 uv, vec4 animData) {
    float frameCount = animData.x;
    float frametimeMs = animData.y;
    float frameVStep = animData.z;
    float flags = animData.w;

    if (frameCount <= 1.0) {
      return texture2D(map, uv);
    }

    bool shouldInterpolate = mod(flags, 2.0) >= 1.0;

    float timeMs = time * 1000.0;
    float cycleTime = frameCount * frametimeMs;
    float timeInCycle = mod(timeMs, cycleTime);
    float exactFrame = timeInCycle / frametimeMs;

    if (shouldInterpolate) {
      float frame1 = floor(exactFrame);
      float frame2 = mod(frame1 + 1.0, frameCount);
      float blendFactor = fract(exactFrame);

      vec2 uv1 = vec2(uv.x, uv.y + frame1 * frameVStep);
      vec2 uv2 = vec2(uv.x, uv.y + frame2 * frameVStep);

      vec4 color1 = texture2D(map, uv1);
      vec4 color2 = texture2D(map, uv2);

      return mix(color1, color2, blendFactor);
    } else {
      float frame = floor(exactFrame);
      float vOffset = frame * frameVStep;
      return texture2D(map, vec2(uv.x, uv.y + vOffset));
    }
  }

  void main() {
    vec4 animData = getAnimationData(vUv);
    vec4 texColor = sampleAnimatedTexture(vUv, animData);

    if (texColor.a < alphaTest) discard;

    vec3 baseColor = texColor.rgb * vColor;

    vec3 currentAmbientColor = interpolateDayNightColor(
      dayAmbientColor, twilightAmbientColor, nightAmbientColor, dayProgress
    );
    vec3 currentDirectionalColor = interpolateDayNightColor(
      dayDirectionalColor, twilightDirectionalColor, nightDirectionalColor, dayProgress
    );

    vec3 normal = normalize(vNormal);

    vec3 effectiveAmbient = mix(currentAmbientColor, ambientLightColor,
      step(0.001, length(ambientLightColor - vec3(1.0))));
    vec3 ambient = effectiveAmbient * ambientLightIntensity * baseColor;

    vec3 effectiveDirectional = mix(currentDirectionalColor, directionalLightColor,
      step(0.001, length(directionalLightColor - vec3(1.0))));
    float NdotL = max(dot(normal, directionalLightDirection), 0.0);
    vec3 diffuse = effectiveDirectional * directionalLightIntensity * baseColor * NdotL;

    vec3 finalColor = ambient + diffuse;

    gl_FragColor = vec4(finalColor, texColor.a);
  }
`

// ============================================================================
// Animation Map Generation
// ============================================================================

/**
 * Generates an animation lookup texture from blockstates data.
 *
 * @param {Object} blockStates - The resolved blockstates JSON
 * @param {number} atlasSize - Size of the texture atlas
 * @returns {THREE.DataTexture} Animation lookup texture
 */
function generateAnimationMap (blockStates, atlasSize) {
  const animations = buildAnimationLookup(blockStates)
  const mapSize = Math.min(atlasSize, 256)
  const data = new Uint8Array(mapSize * mapSize * 4)
  data.fill(0)

  for (const anim of animations.values()) {
    const startX = Math.floor(anim.u * mapSize)
    const startY = Math.floor(anim.v * mapSize)
    const endX = Math.ceil((anim.u + anim.su) * mapSize)
    const endY = Math.ceil((anim.v + anim.sv) * mapSize)

    for (let y = startY; y < endY && y < mapSize; y++) {
      for (let x = startX; x < endX && x < mapSize; x++) {
        const idx = (y * mapSize + x) * 4
        data[idx + 0] = Math.min(255, anim.frameCount)
        data[idx + 1] = Math.min(255, anim.frametime)
        data[idx + 2] = Math.floor(anim.frameVStep * 255)
        let flags = 0
        if (anim.interpolate) flags |= 1
        if (anim.frames && anim.frames.length > 0) flags |= 2
        data[idx + 3] = flags
      }
    }
  }

  const texture = new THREE.DataTexture(
    data,
    mapSize,
    mapSize,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  )
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true

  return texture
}

/**
 * Builds animation lookup from blockstates data.
 *
 * @param {Object} blockStates - The resolved blockstates JSON
 * @returns {Map} Map of animation data keyed by UV coordinates
 */
function buildAnimationLookup (blockStates) {
  const animations = new Map()

  for (const blockData of Object.values(blockStates)) {
    if (blockData.variants) {
      for (const variant of Object.values(blockData.variants)) {
        extractAnimationsFromVariant(variant, animations)
      }
    }
    if (blockData.multipart) {
      for (const part of blockData.multipart) {
        extractAnimationsFromVariant(part.apply, animations)
      }
    }
  }

  return animations
}

function extractAnimationsFromVariant (variant, animations) {
  const variants = Array.isArray(variant) ? variant : [variant]

  for (const v of variants) {
    const model = v && v.model
    if (!model || !model.textures) continue

    for (const [texName, texData] of Object.entries(model.textures)) {
      if (texData.animation && texData.u !== undefined) {
        const key = `${texData.u.toFixed(6)},${(texData.v || 0).toFixed(6)}`

        if (!animations.has(key)) {
          animations.set(key, {
            name: texName,
            u: texData.u,
            v: texData.v || 0,
            su: texData.su || 0.0625,
            sv: texData.sv || 0.0625,
            frametime: texData.animation.frametime,
            frameCount: texData.animation.frameCount,
            frameVStep: texData.animation.frameVStep,
            frames: texData.animation.frames,
            interpolate: texData.animation.interpolate
          })
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
 * @param {THREE.Texture} map - The texture atlas
 * @param {THREE.DataTexture} animationMap - Animation lookup texture
 * @param {Object} options - Additional options
 * @returns {THREE.ShaderMaterial} Configured shader material
 */
function createAnimatedMaterial (map, animationMap, options = {}) {
  const defaultAnimMap = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 0]),
    1,
    1,
    THREE.RGBAFormat
  )
  defaultAnimMap.needsUpdate = true

  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      animationMap: { value: animationMap || defaultAnimMap },
      time: { value: 0 },
      animationMapSize: { value: animationMap ? 256 : 1 },
      dayProgress: { value: options.dayProgress || 0.5 },
      dayAmbientColor: { value: DAY_AMBIENT_COLOR.clone() },
      nightAmbientColor: { value: NIGHT_AMBIENT_COLOR.clone() },
      twilightAmbientColor: { value: TWILIGHT_AMBIENT_COLOR.clone() },
      dayDirectionalColor: { value: DAY_DIRECTIONAL_COLOR.clone() },
      nightDirectionalColor: { value: NIGHT_DIRECTIONAL_COLOR.clone() },
      twilightDirectionalColor: { value: TWILIGHT_DIRECTIONAL_COLOR.clone() },
      ambientLightColor: { value: options.ambientLightColor || new THREE.Color(0xffffff) },
      ambientLightIntensity: { value: options.ambientLightIntensity || 0.6 },
      directionalLightColor: { value: options.directionalLightColor || new THREE.Color(0xffffff) },
      directionalLightDirection: { value: options.directionalLightDirection || new THREE.Vector3(1, 1, 0.5).normalize() },
      directionalLightIntensity: { value: options.directionalLightIntensity || 0.5 },
      alphaTest: { value: options.alphaTest || 0.1 }
    },
    vertexShader: animatedVertexShader,
    fragmentShader: animatedFragmentShader,
    transparent: true,
    side: THREE.FrontSide,
    vertexColors: true
  })

  return material
}

/**
 * Updates the time uniform for animation.
 *
 * @param {THREE.ShaderMaterial} material - The animated material
 * @param {number} deltaTime - Time since last frame in seconds
 */
function updateAnimatedMaterial (material, deltaTime) {
  if (material.uniforms && material.uniforms.time) {
    material.uniforms.time.value += deltaTime
  }
}

/**
 * Updates the day progress uniform for day/night cycle.
 *
 * @param {THREE.ShaderMaterial} material - The animated material
 * @param {number} worldTime - Minecraft world time (0-24000)
 */
function updateDayProgress (material, worldTime) {
  if (material.uniforms && material.uniforms.dayProgress) {
    // Convert world time to day progress (0 = midnight, 0.5 = noon)
    material.uniforms.dayProgress.value = (worldTime % 24000) / 24000
  }
}

// Export for use in index.js
module.exports = {
  generateAnimationMap,
  buildAnimationLookup,
  createAnimatedMaterial,
  updateAnimatedMaterial,
  updateDayProgress,
  DAY_AMBIENT_COLOR,
  NIGHT_AMBIENT_COLOR,
  TWILIGHT_AMBIENT_COLOR
}
