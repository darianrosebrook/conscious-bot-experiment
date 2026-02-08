/**
 * entity-extras.js - Enhanced Entity Visual Features
 *
 * This module provides additional visual features for entities:
 * 1. Name tags - Floating text labels above entities (billboard style)
 * 2. Capes - Animated back capes for players
 * 3. Shadows - Blob shadows beneath entities
 *
 * All features are designed to be performant and integrate with
 * the existing entity rendering system.
 *
 * @module prismarine-viewer/lib/entity-extras
 * @author @darianrosebrook
 */

import * as THREE from 'three'

// ============================================================================
// CONSTANTS
// ============================================================================

// Name tag settings
const NAME_TAG_HEIGHT_OFFSET = 0.3 // Above entity head
const NAME_TAG_FONT_SIZE = 24
const NAME_TAG_PADDING = 8
const NAME_TAG_BACKGROUND_OPACITY = 0.4
const NAME_TAG_MIN_SCALE = 0.003 // Minimum scale factor
const NAME_TAG_MAX_SCALE = 0.015 // Maximum scale factor
const NAME_TAG_FADE_START = 32 // Start fading at this distance
const NAME_TAG_FADE_END = 64 // Fully transparent at this distance

// Cape settings
const CAPE_WIDTH = 10 / 16 // Minecraft cape width in blocks (10 pixels / 16)
const CAPE_HEIGHT = 16 / 16 // Minecraft cape height in blocks
const CAPE_SEGMENTS = 8 // Segments for cloth simulation
const CAPE_WAVE_SPEED = 3.0
const CAPE_WAVE_AMPLITUDE = 0.15

// Shadow settings
const SHADOW_OPACITY = 0.3
const SHADOW_SIZE_MULTIPLIER = 1.2
const SHADOW_MAX_HEIGHT = 10 // Shadow fades out above this height
const SHADOW_SEGMENTS = 16 // Circle smoothness

// ============================================================================
// NAME TAG RENDERER
// ============================================================================

/**
 * Create a canvas-based name tag texture
 *
 * @param {string} name - The entity's display name
 * @param {object} options - Styling options
 * @returns {object} { canvas, width, height }
 */
function createNameTagCanvas (name, options = {}) {
  const {
    fontSize = NAME_TAG_FONT_SIZE,
    fontFamily = 'Arial, sans-serif',
    textColor = '#FFFFFF',
    backgroundColor = '#000000',
    backgroundOpacity = NAME_TAG_BACKGROUND_OPACITY,
    padding = NAME_TAG_PADDING
  } = options

  // Create canvas to measure text
  const measureCanvas = document.createElement('canvas')
  const measureCtx = measureCanvas.getContext('2d')
  measureCtx.font = `bold ${fontSize}px ${fontFamily}`
  const textMetrics = measureCtx.measureText(name)

  // Calculate canvas dimensions
  const textWidth = Math.ceil(textMetrics.width)
  const textHeight = fontSize
  const canvasWidth = textWidth + padding * 2
  const canvasHeight = textHeight + padding * 2

  // Create the actual canvas
  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  const ctx = canvas.getContext('2d')

  // Draw background (rounded rectangle)
  const radius = 4
  ctx.fillStyle = backgroundColor
  ctx.globalAlpha = backgroundOpacity
  ctx.beginPath()
  ctx.roundRect(0, 0, canvasWidth, canvasHeight, radius)
  ctx.fill()

  // Draw text
  ctx.globalAlpha = 1.0
  ctx.font = `bold ${fontSize}px ${fontFamily}`
  ctx.fillStyle = textColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, canvasWidth / 2, canvasHeight / 2)

  // Add text shadow for better readability
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = 2
  ctx.shadowOffsetX = 1
  ctx.shadowOffsetY = 1
  ctx.fillText(name, canvasWidth / 2, canvasHeight / 2)

  return { canvas, width: canvasWidth, height: canvasHeight }
}

/**
 * NameTagManager - Handles name tag creation and updating
 */
class NameTagManager {
  constructor () {
    this.nameTag = null
    this.material = null
    this.entityHeight = 1.8
  }

  /**
   * Create or update name tag for entity
   *
   * @param {string} name - Display name
   * @param {number} entityHeight - Height of the entity
   * @param {object} options - Styling options
   * @returns {THREE.Sprite} The name tag sprite
   */
  create (name, entityHeight = 1.8, options = {}) {
    if (!name) return null

    this.entityHeight = entityHeight

    // Create canvas texture
    const { canvas, width, height } = createNameTagCanvas(name, options)

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter

    // Create sprite material
    this.material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false, // Always render on top
      depthWrite: false
    })

    // Create sprite
    this.nameTag = new THREE.Sprite(this.material)

    // Set initial scale based on canvas aspect ratio.
    // Scale converts canvas pixels to world units; aspect preserves proportions.
    const aspect = width / height
    const baseHeight = 0.4 // World-unit height of the tag
    this.nameTag.scale.set(baseHeight * aspect, baseHeight, 1)

    // Position above entity head
    this.nameTag.position.y = entityHeight + NAME_TAG_HEIGHT_OFFSET

    // Store dimensions for distance-based scaling
    this.nameTag.userData.baseScale = { x: this.nameTag.scale.x, y: this.nameTag.scale.y }
    this.nameTag.userData.isNameTag = true

    return this.nameTag
  }

  /**
   * Update name tag to face camera and scale with distance
   *
   * @param {THREE.Camera} camera - The viewer camera
   * @param {THREE.Vector3} entityPosition - Entity world position
   */
  update (camera, entityPosition) {
    if (!this.nameTag) return

    // Calculate distance to camera
    const distance = camera.position.distanceTo(entityPosition)

    // Grow slightly with distance so the tag stays readable from far away.
    // At distance 0-8 blocks the tag is its base size; at 64+ it's 2× base.
    const baseScale = this.nameTag.userData.baseScale
    const distGrowth = 1 + Math.min(1, Math.max(0, (distance - 8) / 56))
    this.nameTag.scale.set(
      baseScale.x * distGrowth,
      baseScale.y * distGrowth,
      1
    )

    // Fade based on distance
    if (distance > NAME_TAG_FADE_START) {
      const fadeProgress = (distance - NAME_TAG_FADE_START) / (NAME_TAG_FADE_END - NAME_TAG_FADE_START)
      this.material.opacity = Math.max(0, 1 - fadeProgress)
    } else {
      this.material.opacity = 1
    }
  }

  /**
   * Dispose of name tag resources
   */
  dispose () {
    if (this.material) {
      if (this.material.map) {
        this.material.map.dispose()
      }
      this.material.dispose()
    }
    this.nameTag = null
    this.material = null
  }
}

// ============================================================================
// CAPE RENDERER
// ============================================================================

/**
 * Cape vertex shader - Handles cloth wave animation
 */
const capeVertexShader = `
uniform float time;
uniform float velocity;
uniform float waveAmplitude;

varying vec2 vUv;
varying float vWave;

void main() {
  vUv = uv;

  // Wave effect increases down the cape (higher Y in UV = lower on cape)
  float waveStrength = uv.y * uv.y; // Quadratic for natural cloth feel

  // Multiple wave frequencies for realism
  float wave1 = sin(time * 3.0 + uv.y * 6.0) * 0.5;
  float wave2 = sin(time * 5.0 + uv.y * 10.0 + uv.x * 2.0) * 0.25;
  float wave3 = sin(time * 2.0 + uv.x * 4.0) * 0.25;

  float totalWave = (wave1 + wave2 + wave3) * waveStrength * waveAmplitude;

  // Velocity affects wave intensity
  totalWave *= (0.5 + velocity * 0.5);

  // Store wave for fragment shader (affects shading)
  vWave = totalWave;

  // Apply wave to Z position (forward/back movement)
  vec3 pos = position;
  pos.z += totalWave;

  // Slight X movement for more dynamic feel
  pos.x += sin(time * 4.0 + uv.y * 8.0) * waveStrength * waveAmplitude * 0.3;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

/**
 * Cape fragment shader - Simple shading with wave-based lighting
 */
const capeFragmentShader = `
uniform sampler2D capeTexture;
uniform vec3 baseColor;
uniform float opacity;

varying vec2 vUv;
varying float vWave;

void main() {
  // Sample texture if available
  vec4 texColor = texture2D(capeTexture, vUv);

  // Mix texture with base color
  vec3 color = mix(baseColor, texColor.rgb, texColor.a);

  // Add subtle shading based on wave (simulates cloth folds)
  float shade = 0.8 + vWave * 0.4;
  color *= shade;

  gl_FragColor = vec4(color, opacity);
}
`

/**
 * CapeManager - Handles cape creation and animation
 */
class CapeManager {
  constructor () {
    this.cape = null
    this.material = null
    this.velocity = 0
  }

  /**
   * Create cape mesh
   *
   * @param {THREE.Color|number} color - Cape color
   * @param {THREE.Texture} texture - Optional cape texture
   * @returns {THREE.Mesh} The cape mesh
   */
  create (color = 0x3366cc, texture = null) {
    // Create plane geometry for cape
    const geometry = new THREE.PlaneGeometry(
      CAPE_WIDTH,
      CAPE_HEIGHT,
      CAPE_SEGMENTS,
      CAPE_SEGMENTS * 2
    )

    // Create default white texture if none provided
    const defaultTexture = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1, 1,
      THREE.RGBAFormat
    )
    defaultTexture.needsUpdate = true

    // Create shader material
    this.material = new THREE.ShaderMaterial({
      vertexShader: capeVertexShader,
      fragmentShader: capeFragmentShader,
      uniforms: {
        time: { value: 0 },
        velocity: { value: 0 },
        waveAmplitude: { value: CAPE_WAVE_AMPLITUDE },
        capeTexture: { value: texture || defaultTexture },
        baseColor: { value: new THREE.Color(color) },
        opacity: { value: 1.0 }
      },
      transparent: true,
      side: THREE.DoubleSide
    })

    // Create mesh
    this.cape = new THREE.Mesh(geometry, this.material)

    // Rotate to hang down from back
    this.cape.rotation.x = Math.PI * 0.1 // Slight angle outward

    // Position on back (adjusted for player model)
    this.cape.position.set(0, 0.9, -0.15) // Behind the body

    this.cape.userData.isCape = true

    return this.cape
  }

  /**
   * Update cape animation
   *
   * @param {number} deltaTime - Time since last update
   * @param {number} velocity - Entity movement speed (0-1)
   */
  update (deltaTime, velocity = 0) {
    if (!this.cape || !this.material) return

    // Smooth velocity transition
    this.velocity = this.velocity * 0.9 + velocity * 0.1

    // Update uniforms
    this.material.uniforms.time.value += deltaTime * CAPE_WAVE_SPEED
    this.material.uniforms.velocity.value = this.velocity

    // Increase wave amplitude with velocity
    this.material.uniforms.waveAmplitude.value = CAPE_WAVE_AMPLITUDE * (1 + this.velocity)

    // Tilt cape based on velocity (leans back when running)
    this.cape.rotation.x = Math.PI * 0.1 + this.velocity * 0.3
  }

  /**
   * Set cape texture
   *
   * @param {THREE.Texture} texture - Cape texture
   */
  setTexture (texture) {
    if (this.material) {
      this.material.uniforms.capeTexture.value = texture
    }
  }

  /**
   * Set cape color
   *
   * @param {THREE.Color|number} color - Cape color
   */
  setColor (color) {
    if (this.material) {
      this.material.uniforms.baseColor.value = new THREE.Color(color)
    }
  }

  /**
   * Dispose of cape resources
   */
  dispose () {
    if (this.cape) {
      this.cape.geometry.dispose()
    }
    if (this.material) {
      this.material.dispose()
    }
    this.cape = null
    this.material = null
  }
}

// ============================================================================
// SHADOW RENDERER
// ============================================================================

/**
 * ShadowManager - Handles blob shadow creation and updating
 */
class ShadowManager {
  constructor () {
    this.shadow = null
    this.material = null
  }

  /**
   * Create blob shadow
   *
   * @param {number} entityWidth - Width of the entity
   * @param {number} entityDepth - Depth of the entity (defaults to width)
   * @returns {THREE.Mesh} The shadow mesh
   */
  create (entityWidth = 0.6, entityDepth = null) {
    const width = entityWidth * SHADOW_SIZE_MULTIPLIER
    const depth = (entityDepth || entityWidth) * SHADOW_SIZE_MULTIPLIER

    // Create ellipse geometry
    const geometry = new THREE.CircleGeometry(0.5, SHADOW_SEGMENTS)

    // Scale to ellipse
    geometry.scale(width, depth, 1)

    // Rotate to lay flat on ground
    geometry.rotateX(-Math.PI / 2)

    // Create gradient texture for soft edges
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')

    // Radial gradient
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)')
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.5)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)

    const texture = new THREE.CanvasTexture(canvas)

    // Create material
    this.material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: SHADOW_OPACITY,
      depthWrite: false // Prevent z-fighting
    })

    // Create mesh
    this.shadow = new THREE.Mesh(geometry, this.material)

    // Position slightly above ground to prevent z-fighting
    this.shadow.position.y = 0.01

    // Render order to draw shadows first
    this.shadow.renderOrder = -100

    this.shadow.userData.isShadow = true

    return this.shadow
  }

  /**
   * Update shadow based on entity position
   *
   * @param {THREE.Vector3} entityPosition - Entity world position
   * @param {number} groundY - Y position of the ground (optional, defaults to 0)
   */
  update (entityPosition, groundY = 0) {
    if (!this.shadow || !this.material) return

    // Calculate height above ground
    const heightAboveGround = entityPosition.y - groundY

    // Fade shadow with height
    const fadeProgress = Math.min(1, heightAboveGround / SHADOW_MAX_HEIGHT)
    this.material.opacity = SHADOW_OPACITY * (1 - fadeProgress * fadeProgress)

    // Scale shadow with height (further = smaller shadow due to light angle)
    const scale = 1 - fadeProgress * 0.3
    this.shadow.scale.set(scale, scale, scale)

    // Position shadow on ground below entity
    // Note: The shadow is a child of the entity, so we just need to offset Y
    this.shadow.position.y = groundY - entityPosition.y + 0.01
  }

  /**
   * Dispose of shadow resources
   */
  dispose () {
    if (this.shadow) {
      this.shadow.geometry.dispose()
    }
    if (this.material) {
      if (this.material.map) {
        this.material.map.dispose()
      }
      this.material.dispose()
    }
    this.shadow = null
    this.material = null
  }
}

// ============================================================================
// ENTITY EXTRAS MANAGER
// ============================================================================

/**
 * EntityExtrasManager - Combines name tag, cape, and shadow for an entity
 */
class EntityExtrasManager {
  constructor () {
    this.nameTagManager = new NameTagManager()
    this.capeManager = new CapeManager()
    this.shadowManager = new ShadowManager()

    this.hasNameTag = false
    this.hasCape = false
    this.hasShadow = false
  }

  /**
   * Set up all extras for an entity
   *
   * @param {THREE.Object3D} entityMesh - The entity's mesh
   * @param {object} options - Configuration options
   * @param {string} options.name - Display name for name tag
   * @param {number} options.height - Entity height
   * @param {number} options.width - Entity width
   * @param {boolean} options.showCape - Whether to show cape
   * @param {number} options.capeColor - Cape color
   * @param {boolean} options.showShadow - Whether to show shadow
   */
  setup (entityMesh, options = {}) {
    const {
      name,
      height = 1.8,
      width = 0.6,
      showCape = false,
      capeColor = 0x3366cc,
      showShadow = true
    } = options

    // Name tag
    if (name) {
      const nameTag = this.nameTagManager.create(name, height)
      if (nameTag) {
        entityMesh.add(nameTag)
        this.hasNameTag = true
      }
    }

    // Cape (only for players typically)
    if (showCape) {
      const cape = this.capeManager.create(capeColor)
      if (cape) {
        // Find body bone to attach cape
        let bodyBone = null
        entityMesh.traverse((child) => {
          if (child.userData && child.userData.bonesByName && child.userData.bonesByName.body) {
            bodyBone = child.userData.bonesByName.body
          }
        })

        if (bodyBone) {
          bodyBone.add(cape)
        } else {
          entityMesh.add(cape)
        }
        this.hasCape = true
      }
    }

    // Shadow
    if (showShadow) {
      const shadow = this.shadowManager.create(width)
      if (shadow) {
        entityMesh.add(shadow)
        this.hasShadow = true
      }
    }
  }

  /**
   * Update all extras
   *
   * @param {THREE.Camera} camera - The viewer camera
   * @param {THREE.Vector3} entityPosition - Entity world position
   * @param {number} deltaTime - Time since last update
   * @param {number} velocity - Entity movement speed (0-1)
   */
  update (camera, entityPosition, deltaTime, velocity = 0) {
    if (this.hasNameTag) {
      this.nameTagManager.update(camera, entityPosition)
    }

    if (this.hasCape) {
      this.capeManager.update(deltaTime, velocity)
    }

    if (this.hasShadow) {
      this.shadowManager.update(entityPosition)
    }
  }

  /**
   * Dispose of all extras
   */
  dispose () {
    this.nameTagManager.dispose()
    this.capeManager.dispose()
    this.shadowManager.dispose()

    this.hasNameTag = false
    this.hasCape = false
    this.hasShadow = false
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  NameTagManager,
  CapeManager,
  ShadowManager,
  EntityExtrasManager,
  createNameTagCanvas,
  NAME_TAG_HEIGHT_OFFSET,
  NAME_TAG_FADE_START,
  NAME_TAG_FADE_END,
  CAPE_WIDTH,
  CAPE_HEIGHT,
  CAPE_WAVE_SPEED,
  SHADOW_OPACITY,
  SHADOW_MAX_HEIGHT
}
