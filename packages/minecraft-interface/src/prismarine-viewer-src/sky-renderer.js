/**
 * sky-renderer.js - Procedural Minecraft Sky Rendering
 *
 * Creates a dynamic sky dome that responds to Minecraft world time:
 * - Gradient sky colors (horizon to zenith)
 * - Sun position and glow during day
 * - Moon position during night
 * - Procedural star field that fades in at dusk
 * - Smooth day/twilight/night transitions
 *
 * Minecraft time reference:
 * - 0 = sunrise (6:00 AM)
 * - 6000 = noon (12:00 PM)
 * - 12000 = sunset (6:00 PM)
 * - 18000 = midnight (12:00 AM)
 * - 24000 = next sunrise
 *
 * @module prismarine-viewer/lib/sky-renderer
 * @author @darianrosebrook
 */

/* global THREE */

// ============================================================================
// SKY COLOR PALETTES (Minecraft-accurate)
// ============================================================================

// Daytime sky colors
const DAY_HORIZON_COLOR = { r: 0.63, g: 0.78, b: 1.0 }    // Light blue at horizon
const DAY_ZENITH_COLOR = { r: 0.35, g: 0.54, b: 0.92 }    // Deeper blue at top

// Sunset/sunrise colors
const TWILIGHT_HORIZON_COLOR = { r: 1.0, g: 0.55, b: 0.3 }  // Orange-red horizon
const TWILIGHT_ZENITH_COLOR = { r: 0.4, g: 0.35, b: 0.6 }   // Purple-blue zenith

// Night sky colors
const NIGHT_HORIZON_COLOR = { r: 0.05, g: 0.08, b: 0.15 }   // Dark blue horizon
const NIGHT_ZENITH_COLOR = { r: 0.01, g: 0.02, b: 0.05 }    // Nearly black zenith

// Sun and moon colors
const SUN_COLOR = { r: 1.0, g: 0.95, b: 0.8 }
const SUN_GLOW_COLOR = { r: 1.0, g: 0.9, b: 0.6 }
const MOON_COLOR = { r: 0.9, g: 0.9, b: 1.0 }
const MOON_GLOW_COLOR = { r: 0.6, g: 0.7, b: 0.9 }

// ============================================================================
// SKY SHADER CODE
// ============================================================================

const skyVertexShader = `
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const skyFragmentShader = `
uniform float time;           // Minecraft time (0-24000)
uniform vec3 sunDirection;    // Normalized sun direction
uniform vec3 moonDirection;   // Normalized moon direction

// Sky colors
uniform vec3 dayHorizon;
uniform vec3 dayZenith;
uniform vec3 twilightHorizon;
uniform vec3 twilightZenith;
uniform vec3 nightHorizon;
uniform vec3 nightZenith;

// Celestial colors
uniform vec3 sunColor;
uniform vec3 sunGlowColor;
uniform vec3 moonColor;
uniform vec3 moonGlowColor;

// Control parameters
uniform float starBrightness;  // 0 = no stars, 1 = full stars

varying vec3 vWorldPosition;
varying vec2 vUv;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Pseudo-random function for stars
float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Smoothstep for interpolation
float smoothstep01(float t) {
  return t * t * (3.0 - 2.0 * t);
}

// Calculate day progress (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset)
float getDayProgress(float mcTime) {
  // Minecraft time: 0 = 6AM, 6000 = noon, 12000 = 6PM, 18000 = midnight
  // Convert to 0-1 where 0.5 = noon
  float normalized = mod(mcTime, 24000.0) / 24000.0;
  // Shift so 0.5 = noon (6000 MC time)
  return mod(normalized + 0.25, 1.0);
}

// Get sky brightness factor based on time
float getSkyBrightness(float dayProgress) {
  // Day (0.25-0.75): bright
  // Night (0-0.25, 0.75-1): dark
  float distFromNoon = abs(dayProgress - 0.5);
  if (distFromNoon < 0.2) {
    return 1.0; // Full day
  } else if (distFromNoon > 0.35) {
    return 0.0; // Full night
  } else {
    // Twilight transition
    return 1.0 - smoothstep01((distFromNoon - 0.2) / 0.15);
  }
}

// ============================================================================
// SKY COLOR CALCULATION
// ============================================================================

vec3 getSkyColor(vec3 direction, float dayProgress) {
  // Vertical gradient factor (0 = horizon, 1 = zenith)
  float zenithFactor = max(0.0, direction.y);
  zenithFactor = pow(zenithFactor, 0.5); // Softer gradient

  // Calculate time-based interpolation
  float distFromNoon = abs(dayProgress - 0.5);

  vec3 horizonColor;
  vec3 zenithColor;

  if (distFromNoon < 0.15) {
    // Day
    horizonColor = dayHorizon;
    zenithColor = dayZenith;
  } else if (distFromNoon > 0.35) {
    // Night
    horizonColor = nightHorizon;
    zenithColor = nightZenith;
  } else {
    // Twilight - interpolate
    float t = (distFromNoon - 0.15) / 0.2;
    t = smoothstep01(t);

    if (t < 0.5) {
      // Day to twilight
      float tt = t * 2.0;
      horizonColor = mix(dayHorizon, twilightHorizon, tt);
      zenithColor = mix(dayZenith, twilightZenith, tt);
    } else {
      // Twilight to night
      float tt = (t - 0.5) * 2.0;
      horizonColor = mix(twilightHorizon, nightHorizon, tt);
      zenithColor = mix(twilightZenith, nightZenith, tt);
    }
  }

  return mix(horizonColor, zenithColor, zenithFactor);
}

// ============================================================================
// CELESTIAL BODIES
// ============================================================================

float getSunDisc(vec3 direction, vec3 sunDir) {
  float sunDot = dot(normalize(direction), sunDir);

  // Sun disc (sharp edge)
  float sunDisc = smoothstep(0.9995, 0.9998, sunDot);

  // Sun glow (soft halo)
  float sunGlow = pow(max(0.0, sunDot), 64.0) * 0.5;

  return sunDisc + sunGlow;
}

float getMoonDisc(vec3 direction, vec3 moonDir) {
  float moonDot = dot(normalize(direction), moonDir);

  // Moon disc (slightly larger than sun)
  float moonDisc = smoothstep(0.9993, 0.9997, moonDot);

  // Moon glow (softer than sun)
  float moonGlow = pow(max(0.0, moonDot), 32.0) * 0.3;

  return moonDisc + moonGlow;
}

// ============================================================================
// STAR FIELD
// ============================================================================

float getStars(vec3 direction) {
  // Project direction to spherical coordinates for star lookup
  vec2 starCoord = vec2(
    atan(direction.z, direction.x) * 10.0,
    asin(clamp(direction.y, -1.0, 1.0)) * 10.0
  );

  // Generate star field
  float starField = 0.0;

  // Layer 1: bright stars (sparse)
  vec2 gridPos1 = floor(starCoord * 3.0);
  float rand1 = random(gridPos1);
  if (rand1 > 0.97) {
    vec2 cellPos = fract(starCoord * 3.0);
    float dist = length(cellPos - vec2(0.5));
    starField += smoothstep(0.08, 0.0, dist) * (rand1 - 0.97) * 30.0;
  }

  // Layer 2: medium stars
  vec2 gridPos2 = floor(starCoord * 8.0);
  float rand2 = random(gridPos2 + vec2(42.0, 17.0));
  if (rand2 > 0.95) {
    vec2 cellPos = fract(starCoord * 8.0);
    float dist = length(cellPos - vec2(0.5));
    starField += smoothstep(0.05, 0.0, dist) * (rand2 - 0.95) * 15.0;
  }

  // Layer 3: dim stars (many)
  vec2 gridPos3 = floor(starCoord * 20.0);
  float rand3 = random(gridPos3 + vec2(13.0, 89.0));
  if (rand3 > 0.92) {
    vec2 cellPos = fract(starCoord * 20.0);
    float dist = length(cellPos - vec2(0.5));
    starField += smoothstep(0.03, 0.0, dist) * (rand3 - 0.92) * 8.0;
  }

  // Only show stars above horizon
  starField *= smoothstep(-0.1, 0.1, direction.y);

  return clamp(starField, 0.0, 1.0);
}

// ============================================================================
// MAIN
// ============================================================================

void main() {
  vec3 direction = normalize(vWorldPosition);
  float dayProgress = getDayProgress(time);
  float brightness = getSkyBrightness(dayProgress);

  // Base sky color
  vec3 color = getSkyColor(direction, dayProgress);

  // Add sun (visible during day)
  float sunIntensity = getSunDisc(direction, sunDirection) * brightness;
  color = mix(color, sunColor, sunIntensity * 0.8);
  color += sunGlowColor * sunIntensity * 0.3;

  // Add moon (visible during night)
  float nightFactor = 1.0 - brightness;
  float moonIntensity = getMoonDisc(direction, moonDirection) * nightFactor;
  color = mix(color, moonColor, moonIntensity * 0.7);
  color += moonGlowColor * moonIntensity * 0.2;

  // Add stars (fade in at night)
  float stars = getStars(direction) * starBrightness * nightFactor;
  color += vec3(stars);

  gl_FragColor = vec4(color, 1.0);
}
`

// ============================================================================
// SKY RENDERER CLASS
// ============================================================================

/**
 * SkyRenderer - Manages the procedural sky dome
 */
class SkyRenderer {
  constructor (scene, camera) {
    this.scene = scene
    this.camera = camera
    this.skyMesh = null
    this.skyMaterial = null
    this.currentTime = 6000 // Default to noon

    this.createSkyDome()
  }

  /**
   * Create the sky dome mesh with shader material
   */
  createSkyDome () {
    // Large sphere that surrounds the scene
    // Using IcosahedronGeometry for more uniform vertex distribution
    const geometry = new THREE.IcosahedronGeometry(800, 3)

    // Calculate initial sun/moon directions
    const sunDir = this.calculateSunDirection(this.currentTime)
    const moonDir = this.calculateMoonDirection(this.currentTime)

    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      uniforms: {
        time: { value: this.currentTime },
        sunDirection: { value: sunDir },
        moonDirection: { value: moonDir },

        // Day colors
        dayHorizon: { value: new THREE.Vector3(DAY_HORIZON_COLOR.r, DAY_HORIZON_COLOR.g, DAY_HORIZON_COLOR.b) },
        dayZenith: { value: new THREE.Vector3(DAY_ZENITH_COLOR.r, DAY_ZENITH_COLOR.g, DAY_ZENITH_COLOR.b) },

        // Twilight colors
        twilightHorizon: { value: new THREE.Vector3(TWILIGHT_HORIZON_COLOR.r, TWILIGHT_HORIZON_COLOR.g, TWILIGHT_HORIZON_COLOR.b) },
        twilightZenith: { value: new THREE.Vector3(TWILIGHT_ZENITH_COLOR.r, TWILIGHT_ZENITH_COLOR.g, TWILIGHT_ZENITH_COLOR.b) },

        // Night colors
        nightHorizon: { value: new THREE.Vector3(NIGHT_HORIZON_COLOR.r, NIGHT_HORIZON_COLOR.g, NIGHT_HORIZON_COLOR.b) },
        nightZenith: { value: new THREE.Vector3(NIGHT_ZENITH_COLOR.r, NIGHT_ZENITH_COLOR.g, NIGHT_ZENITH_COLOR.b) },

        // Celestial colors
        sunColor: { value: new THREE.Vector3(SUN_COLOR.r, SUN_COLOR.g, SUN_COLOR.b) },
        sunGlowColor: { value: new THREE.Vector3(SUN_GLOW_COLOR.r, SUN_GLOW_COLOR.g, SUN_GLOW_COLOR.b) },
        moonColor: { value: new THREE.Vector3(MOON_COLOR.r, MOON_COLOR.g, MOON_COLOR.b) },
        moonGlowColor: { value: new THREE.Vector3(MOON_GLOW_COLOR.r, MOON_GLOW_COLOR.g, MOON_GLOW_COLOR.b) },

        // Star brightness
        starBrightness: { value: 1.0 }
      },
      side: THREE.BackSide, // Render inside of sphere
      depthWrite: false // Sky should not write to depth buffer
    })

    this.skyMesh = new THREE.Mesh(geometry, this.skyMaterial)
    this.skyMesh.renderOrder = -1000 // Render first (behind everything)

    // Add to scene
    this.scene.add(this.skyMesh)

    // Remove the default background color
    this.scene.background = null

    console.log('[sky-renderer] Sky dome created')
  }

  /**
   * Calculate sun direction based on Minecraft time
   * Sun rises in east (+X), sets in west (-X)
   *
   * @param {number} time - Minecraft time (0-24000)
   * @returns {THREE.Vector3} Normalized sun direction
   */
  calculateSunDirection (time) {
    // Minecraft time: 0 = 6AM (sunrise), 6000 = noon, 12000 = 6PM (sunset), 18000 = midnight
    // Convert to angle: 0 = sunrise (east), PI/2 = noon (overhead), PI = sunset (west)
    const normalizedTime = (time % 24000) / 24000
    const angle = normalizedTime * Math.PI * 2 - Math.PI / 2 // Offset so noon is overhead

    // Sun moves in the XY plane (east-west arc)
    const x = Math.cos(angle)
    const y = Math.sin(angle)
    const z = 0.1 // Slight tilt for visual interest

    return new THREE.Vector3(x, y, z).normalize()
  }

  /**
   * Calculate moon direction (opposite to sun)
   *
   * @param {number} time - Minecraft time (0-24000)
   * @returns {THREE.Vector3} Normalized moon direction
   */
  calculateMoonDirection (time) {
    const sunDir = this.calculateSunDirection(time)
    // Moon is opposite to sun
    return new THREE.Vector3(-sunDir.x, -sunDir.y, -sunDir.z)
  }

  /**
   * Update sky based on Minecraft world time
   *
   * @param {number} time - Minecraft time (0-24000)
   */
  setTime (time) {
    this.currentTime = time

    if (!this.skyMaterial) return

    // Update uniforms
    this.skyMaterial.uniforms.time.value = time
    this.skyMaterial.uniforms.sunDirection.value.copy(this.calculateSunDirection(time))
    this.skyMaterial.uniforms.moonDirection.value.copy(this.calculateMoonDirection(time))
  }

  /**
   * Update sky dome position to follow camera
   * Call this in the render loop
   */
  update () {
    if (!this.skyMesh || !this.camera) return

    // Keep sky dome centered on camera
    this.skyMesh.position.copy(this.camera.position)
  }

  /**
   * Set star brightness (for weather effects like overcast)
   *
   * @param {number} brightness - 0 to 1
   */
  setStarBrightness (brightness) {
    if (this.skyMaterial) {
      this.skyMaterial.uniforms.starBrightness.value = brightness
    }
  }

  /**
   * Dispose of sky resources
   */
  dispose () {
    if (this.skyMesh) {
      this.scene.remove(this.skyMesh)
      if (this.skyMesh.geometry) this.skyMesh.geometry.dispose()
      if (this.skyMaterial) this.skyMaterial.dispose()
      this.skyMesh = null
      this.skyMaterial = null
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a sky renderer instance
 *
 * @param {THREE.Scene} scene - The Three.js scene
 * @param {THREE.Camera} camera - The camera (for positioning sky dome)
 * @returns {SkyRenderer}
 */
function createSkyRenderer (scene, camera) {
  return new SkyRenderer(scene, camera)
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  SkyRenderer,
  createSkyRenderer,
  // Export color constants for potential customization
  DAY_HORIZON_COLOR,
  DAY_ZENITH_COLOR,
  TWILIGHT_HORIZON_COLOR,
  TWILIGHT_ZENITH_COLOR,
  NIGHT_HORIZON_COLOR,
  NIGHT_ZENITH_COLOR,
  SUN_COLOR,
  MOON_COLOR
}
