/**
 * weather-system.js - Minecraft Weather Effects
 *
 * GPU-accelerated particle system for rain and snow effects:
 * - Rain: Fast vertical streaks with slight angle
 * - Snow: Slower particles with horizontal drift
 * - Thunder: Lightning flashes (screen effect)
 *
 * Weather states from Minecraft:
 * - clear: No precipitation
 * - rain: Rain particles (biome-dependent - snow in cold biomes)
 * - thunder: Rain + lightning flashes
 *
 * Performance optimizations:
 * - Single draw call for all particles (THREE.Points)
 * - GPU-based particle movement via shader
 * - Particles recycle when below ground
 * - Distance-based fade for depth
 *
 * @module prismarine-viewer/lib/weather-system
 * @author @darianrosebrook
 */

import * as THREE from 'three'

// ============================================================================
// CONSTANTS
// ============================================================================

// Particle counts (balance between visuals and performance)
const RAIN_PARTICLE_COUNT = 15000
const SNOW_PARTICLE_COUNT = 8000

// Weather area dimensions (centered on camera)
const WEATHER_AREA_SIZE = 80 // Width/depth of weather area
const WEATHER_HEIGHT = 60 // Height of particle spawn area

// Particle speeds (blocks per second)
const RAIN_SPEED = 25.0
const SNOW_SPEED = 3.0

// Wind effect
const RAIN_WIND_STRENGTH = 2.0
const SNOW_WIND_STRENGTH = 4.0

// Visual properties
const RAIN_PARTICLE_SIZE = 0.15
const SNOW_PARTICLE_SIZE = 0.12
const RAIN_OPACITY = 0.6
const SNOW_OPACITY = 0.8

// Lightning
const LIGHTNING_DURATION = 0.15 // seconds
const LIGHTNING_FADE = 0.3 // seconds

// ============================================================================
// RAIN SHADER
// ============================================================================

const rainVertexShader = `
uniform float time;
uniform float speed;
uniform float windStrength;
uniform vec3 cameraPos;
uniform float areaSize;
uniform float height;

attribute float size;
attribute float offset;  // Random offset for variety

varying float vAlpha;
varying float vDistance;

void main() {
  // Calculate particle position with time-based movement
  vec3 pos = position;

  // Vertical fall with time (loop when below ground)
  float fallDistance = mod(time * speed + offset * height, height);
  pos.y = cameraPos.y + height * 0.5 - fallDistance;

  // Wind drift (slight angle)
  pos.x += sin(time * 0.5 + offset * 10.0) * windStrength * 0.3;
  pos.z += cos(time * 0.3 + offset * 7.0) * windStrength * 0.15;

  // Keep particles within area around camera
  pos.x = cameraPos.x + mod(pos.x - cameraPos.x + areaSize * 0.5, areaSize) - areaSize * 0.5;
  pos.z = cameraPos.z + mod(pos.z - cameraPos.z + areaSize * 0.5, areaSize) - areaSize * 0.5;

  // Calculate distance for fade
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vDistance = -mvPosition.z;

  // Distance-based alpha fade
  float distanceFade = 1.0 - smoothstep(20.0, 60.0, vDistance);
  vAlpha = distanceFade;

  // Size attenuation
  gl_PointSize = size * (200.0 / vDistance);
  gl_PointSize = clamp(gl_PointSize, 1.0, 8.0);

  gl_Position = projectionMatrix * mvPosition;
}
`

const rainFragmentShader = `
uniform vec3 color;
uniform float opacity;

varying float vAlpha;
varying float vDistance;

void main() {
  // Elongated shape for rain streaks
  vec2 center = gl_PointCoord - vec2(0.5);

  // Stretch vertically for rain streak effect
  center.y *= 0.3;

  float dist = length(center);
  float alpha = 1.0 - smoothstep(0.0, 0.5, dist);

  // Apply distance fade
  alpha *= vAlpha * opacity;

  if (alpha < 0.01) discard;

  gl_FragColor = vec4(color, alpha);
}
`

// ============================================================================
// SNOW SHADER
// ============================================================================

const snowVertexShader = `
uniform float time;
uniform float speed;
uniform float windStrength;
uniform vec3 cameraPos;
uniform float areaSize;
uniform float height;

attribute float size;
attribute float offset;

varying float vAlpha;
varying float vRotation;

void main() {
  vec3 pos = position;

  // Slower fall for snow
  float fallDistance = mod(time * speed + offset * height, height);
  pos.y = cameraPos.y + height * 0.5 - fallDistance;

  // Swaying motion (more pronounced than rain)
  float sway = sin(time * 2.0 + offset * 20.0) * windStrength * 0.3;
  float drift = cos(time * 1.5 + offset * 15.0) * windStrength * 0.2;
  pos.x += sway;
  pos.z += drift;

  // Keep particles in area
  pos.x = cameraPos.x + mod(pos.x - cameraPos.x + areaSize * 0.5, areaSize) - areaSize * 0.5;
  pos.z = cameraPos.z + mod(pos.z - cameraPos.z + areaSize * 0.5, areaSize) - areaSize * 0.5;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float distance = -mvPosition.z;

  // Distance fade
  vAlpha = 1.0 - smoothstep(15.0, 50.0, distance);

  // Rotation for variety
  vRotation = offset * 6.28 + time * (0.3 + offset * 0.4);

  // Size with attenuation
  gl_PointSize = size * (150.0 / distance);
  gl_PointSize = clamp(gl_PointSize, 2.0, 12.0);

  gl_Position = projectionMatrix * mvPosition;
}
`

const snowFragmentShader = `
uniform vec3 color;
uniform float opacity;

varying float vAlpha;
varying float vRotation;

void main() {
  // Soft circular shape for snow
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);

  // Soft edge
  float alpha = 1.0 - smoothstep(0.3, 0.5, dist);

  // Slight sparkle effect
  float sparkle = 0.8 + 0.2 * sin(vRotation * 3.0);
  alpha *= sparkle;

  // Apply distance fade
  alpha *= vAlpha * opacity;

  if (alpha < 0.01) discard;

  gl_FragColor = vec4(color, alpha);
}
`

// ============================================================================
// WEATHER SYSTEM CLASS
// ============================================================================

/**
 * WeatherSystem - Manages weather particle effects
 */
class WeatherSystem {
  constructor (scene, camera) {
    this.scene = scene
    this.camera = camera

    // Current weather state
    this.weatherState = 'clear' // 'clear' | 'rain' | 'thunder'
    this.isRaining = false
    this.isSnowing = false
    this.isThundering = false

    // Particle systems
    this.rainSystem = null
    this.snowSystem = null

    // Lightning state
    this.lightningActive = false
    this.lightningTimer = 0
    this.lightningIntensity = 0

    // Transition state
    this.targetIntensity = 0
    this.currentIntensity = 0
    this.transitionSpeed = 0.5 // Per second

    // Create particle systems (hidden initially)
    this.createRainSystem()
    this.createSnowSystem()

    console.log('[weather-system] Weather system initialized')
  }

  /**
   * Create rain particle system
   */
  createRainSystem () {
    const geometry = new THREE.BufferGeometry()

    // Create particle positions
    const positions = new Float32Array(RAIN_PARTICLE_COUNT * 3)
    const sizes = new Float32Array(RAIN_PARTICLE_COUNT)
    const offsets = new Float32Array(RAIN_PARTICLE_COUNT)

    for (let i = 0; i < RAIN_PARTICLE_COUNT; i++) {
      // Random position in weather area
      positions[i * 3] = (Math.random() - 0.5) * WEATHER_AREA_SIZE
      positions[i * 3 + 1] = Math.random() * WEATHER_HEIGHT
      positions[i * 3 + 2] = (Math.random() - 0.5) * WEATHER_AREA_SIZE

      // Random size variation
      sizes[i] = RAIN_PARTICLE_SIZE * (0.8 + Math.random() * 0.4)

      // Random offset for staggered animation
      offsets[i] = Math.random()
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1))

    const material = new THREE.ShaderMaterial({
      vertexShader: rainVertexShader,
      fragmentShader: rainFragmentShader,
      uniforms: {
        time: { value: 0 },
        speed: { value: RAIN_SPEED },
        windStrength: { value: RAIN_WIND_STRENGTH },
        cameraPos: { value: new THREE.Vector3() },
        areaSize: { value: WEATHER_AREA_SIZE },
        height: { value: WEATHER_HEIGHT },
        color: { value: new THREE.Vector3(0.7, 0.8, 0.9) }, // Light blue-gray
        opacity: { value: RAIN_OPACITY }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })

    this.rainSystem = new THREE.Points(geometry, material)
    this.rainSystem.visible = false
    this.rainSystem.frustumCulled = false // Always render
    this.scene.add(this.rainSystem)
  }

  /**
   * Create snow particle system
   */
  createSnowSystem () {
    const geometry = new THREE.BufferGeometry()

    const positions = new Float32Array(SNOW_PARTICLE_COUNT * 3)
    const sizes = new Float32Array(SNOW_PARTICLE_COUNT)
    const offsets = new Float32Array(SNOW_PARTICLE_COUNT)

    for (let i = 0; i < SNOW_PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * WEATHER_AREA_SIZE
      positions[i * 3 + 1] = Math.random() * WEATHER_HEIGHT
      positions[i * 3 + 2] = (Math.random() - 0.5) * WEATHER_AREA_SIZE

      // Snow has more size variation
      sizes[i] = SNOW_PARTICLE_SIZE * (0.5 + Math.random() * 1.0)
      offsets[i] = Math.random()
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1))

    const material = new THREE.ShaderMaterial({
      vertexShader: snowVertexShader,
      fragmentShader: snowFragmentShader,
      uniforms: {
        time: { value: 0 },
        speed: { value: SNOW_SPEED },
        windStrength: { value: SNOW_WIND_STRENGTH },
        cameraPos: { value: new THREE.Vector3() },
        areaSize: { value: WEATHER_AREA_SIZE },
        height: { value: WEATHER_HEIGHT },
        color: { value: new THREE.Vector3(1.0, 1.0, 1.0) }, // White
        opacity: { value: SNOW_OPACITY }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    })

    this.snowSystem = new THREE.Points(geometry, material)
    this.snowSystem.visible = false
    this.snowSystem.frustumCulled = false
    this.scene.add(this.snowSystem)
  }

  /**
   * Set weather state
   *
   * @param {string} state - 'clear', 'rain', or 'thunder'
   * @param {boolean} isSnowBiome - True if in a cold biome (snow instead of rain)
   */
  setWeather (state, isSnowBiome = false) {
    this.weatherState = state
    this.isThundering = state === 'thunder'

    if (state === 'clear') {
      this.targetIntensity = 0
      this.isRaining = false
      this.isSnowing = false
    } else {
      this.targetIntensity = 1
      if (isSnowBiome) {
        this.isSnowing = true
        this.isRaining = false
      } else {
        this.isRaining = true
        this.isSnowing = false
      }
    }

    console.log(`[weather-system] Weather set to: ${state}${isSnowBiome ? ' (snow)' : ''}`)
  }

  /**
   * Trigger a lightning flash
   */
  triggerLightning () {
    if (!this.isThundering) return

    this.lightningActive = true
    this.lightningTimer = LIGHTNING_DURATION + LIGHTNING_FADE
    this.lightningIntensity = 1.0

    // Lightning flash triggered (no log — fires frequently during storms)
  }

  /**
   * Get current lightning intensity for sky/lighting effects
   *
   * @returns {number} 0 to 1
   */
  getLightningIntensity () {
    return this.lightningIntensity
  }

  /**
   * Get current weather intensity for dimming stars/etc
   *
   * @returns {number} 0 to 1
   */
  getWeatherIntensity () {
    return this.currentIntensity
  }

  /**
   * Update weather system
   *
   * @param {number} deltaTime - Time since last update in seconds
   */
  update (deltaTime) {
    // Smooth intensity transition
    if (this.currentIntensity < this.targetIntensity) {
      this.currentIntensity = Math.min(
        this.targetIntensity,
        this.currentIntensity + deltaTime * this.transitionSpeed
      )
    } else if (this.currentIntensity > this.targetIntensity) {
      this.currentIntensity = Math.max(
        this.targetIntensity,
        this.currentIntensity - deltaTime * this.transitionSpeed
      )
    }

    // Update visibility based on intensity
    const showRain = this.isRaining && this.currentIntensity > 0.01
    const showSnow = this.isSnowing && this.currentIntensity > 0.01

    this.rainSystem.visible = showRain
    this.snowSystem.visible = showSnow

    // Update camera position uniform
    const cameraPos = this.camera.position

    // Update rain
    if (showRain) {
      const rainUniforms = this.rainSystem.material.uniforms
      rainUniforms.time.value += deltaTime
      rainUniforms.cameraPos.value.copy(cameraPos)
      rainUniforms.opacity.value = RAIN_OPACITY * this.currentIntensity
    }

    // Update snow
    if (showSnow) {
      const snowUniforms = this.snowSystem.material.uniforms
      snowUniforms.time.value += deltaTime
      snowUniforms.cameraPos.value.copy(cameraPos)
      snowUniforms.opacity.value = SNOW_OPACITY * this.currentIntensity
    }

    // Update lightning
    if (this.lightningActive) {
      this.lightningTimer -= deltaTime

      if (this.lightningTimer <= 0) {
        this.lightningActive = false
        this.lightningIntensity = 0
      } else if (this.lightningTimer < LIGHTNING_FADE) {
        // Fade out
        this.lightningIntensity = this.lightningTimer / LIGHTNING_FADE
      }
    }

    // Random lightning during thunderstorm
    if (this.isThundering && !this.lightningActive && this.currentIntensity > 0.5) {
      // Small chance of lightning each frame
      if (Math.random() < deltaTime * 0.033) { // ~3.3% chance per second (~30s intervals)
        this.triggerLightning()
      }
    }
  }

  /**
   * Set wind strength for particle drift
   *
   * @param {number} strength - Wind strength multiplier
   */
  setWindStrength (strength) {
    if (this.rainSystem) {
      this.rainSystem.material.uniforms.windStrength.value = RAIN_WIND_STRENGTH * strength
    }
    if (this.snowSystem) {
      this.snowSystem.material.uniforms.windStrength.value = SNOW_WIND_STRENGTH * strength
    }
  }

  /**
   * Dispose weather system resources
   */
  dispose () {
    if (this.rainSystem) {
      this.scene.remove(this.rainSystem)
      this.rainSystem.geometry.dispose()
      this.rainSystem.material.dispose()
      this.rainSystem = null
    }

    if (this.snowSystem) {
      this.scene.remove(this.snowSystem)
      this.snowSystem.geometry.dispose()
      this.snowSystem.material.dispose()
      this.snowSystem = null
    }

    console.log('[weather-system] Weather system disposed')
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a weather system instance
 *
 * @param {THREE.Scene} scene - The Three.js scene
 * @param {THREE.Camera} camera - The camera (for particle positioning)
 * @returns {WeatherSystem}
 */
function createWeatherSystem (scene, camera) {
  return new WeatherSystem(scene, camera)
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  WeatherSystem,
  createWeatherSystem,
  RAIN_PARTICLE_COUNT,
  SNOW_PARTICLE_COUNT,
  WEATHER_AREA_SIZE,
  WEATHER_HEIGHT,
  RAIN_SPEED,
  SNOW_SPEED
}
