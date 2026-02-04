/* global THREE */
/**
 * index.js - Prismarine Viewer Client Entry Point
 *
 * This is the main client-side entry point for prismarine-viewer.
 * It replaces the original lib/index.js during the postinstall rebuild.
 *
 * Customizations:
 * 1. POV toggle (F5 key or button) - switch between 1st/3rd person
 * 2. OrbitControls for 3rd person view with mouse rotation
 * 3. Bot mesh rendering when in 3rd person mode
 * 4. Custom texture URLs from /mc-assets for version support beyond 1.21.4
 * 5. Animated texture shader for water/lava/fire animations
 * 6. Procedural sky dome with sun/moon/stars
 *
 * This file is copied to node_modules/prismarine-viewer/lib/index.js
 * by scripts/rebuild-prismarine-viewer.cjs during postinstall.
 *
 * @module prismarine-viewer/lib/index
 * @author @darianrosebrook
 */

global.THREE = require('three')
const TWEEN = require('@tweenjs/tween.js')
require('three/examples/js/controls/OrbitControls')

const { Viewer, Entity } = require('../viewer')
const {
  generateAnimationMap,
  createAnimatedMaterial,
  updateAnimatedMaterial,
  updateDayProgress
} = require('./animated-material-client')
const { createSkyRenderer } = require('./sky-renderer')
const { createWeatherSystem } = require('./weather-system')
const { EntityExtrasManager } = require('./entity-extras')

const io = require('socket.io-client')
const socket = io({
  path: window.location.pathname + 'socket.io'
})

// ============================================================================
// Animated Material State
// ============================================================================
let animatedMaterial = null
let lastAnimationTime = performance.now()
let currentWorldTime = 6000 // Default to noon

// ============================================================================
// Sky Renderer State
// ============================================================================
let skyRenderer = null

// ============================================================================
// Weather System State
// ============================================================================
let weatherSystem = null

// ============================================================================
// Bot Extras State (name tag, cape, shadow for main bot mesh)
// ============================================================================
let botExtrasManager = null
let botUsername = 'Bot' // Will be updated from server

// ============================================================================
// Custom Asset Integration
// ============================================================================
// Use our asset server for textures/blockstates to support MC versions beyond 1.21.4
// The asset server falls back to prismarine-viewer's bundled assets if custom assets
// aren't available for a version.

/**
 * Configure viewer to use custom asset URLs from our asset server.
 * This enables support for newer Minecraft versions and custom animated textures.
 */
function configureCustomAssets (viewer, version) {
  // Point to our asset server - falls back to bundled assets if not found
  if (viewer.world) {
    // Custom texture atlas URL (served by minecraft-interface asset server)
    viewer.world.texturesDataUrl = `/mc-assets/textures/${version}.png`
    console.log(`[viewer] Using custom texture URL: ${viewer.world.texturesDataUrl}`)
  }
}

/**
 * Load blockstates from our custom asset server.
 * Falls back to prismarine-viewer's bundled blockstates if not found.
 */
async function loadCustomBlockStates (version) {
  try {
    const response = await fetch(`/mc-assets/blocksStates/${version}.json`)
    if (response.ok) {
      const data = await response.json()
      console.log(`[viewer] Loaded custom blockstates for ${version}`)
      return data
    }
  } catch (e) {
    console.log(`[viewer] Custom blockstates not found, using bundled: ${e.message}`)
  }
  return null
}

/**
 * Set up animated material to replace the viewer's default material.
 * This enables animated water, lava, and fire textures.
 *
 * @param {Object} blockStates - The loaded blockstates with animation metadata
 */
function setupAnimatedMaterial (blockStates) {
  if (!viewer.world || !viewer.world.material || !viewer.world.material.map) {
    console.log('[viewer] Cannot setup animated material: viewer.world.material.map not ready')
    return
  }

  try {
    const texture = viewer.world.material.map
    const atlasSize = texture.image ? texture.image.width : 1024

    // Generate animation lookup map from blockstates
    const animMap = generateAnimationMap(blockStates, atlasSize)

    // Create the animated material
    animatedMaterial = createAnimatedMaterial(texture, animMap, {
      dayProgress: 0.5, // Start at noon
      ambientLightIntensity: 0.6,
      directionalLightIntensity: 0.5
    })

    // Replace the world's material
    const originalMaterial = viewer.world.material
    viewer.world.material = animatedMaterial

    console.log('[viewer] Animated material enabled - water/lava/fire will animate')

    // Store original for potential cleanup
    viewer.world._originalMaterial = originalMaterial
  } catch (e) {
    console.error('[viewer] Failed to setup animated material:', e)
  }
}

/**
 * Handle world time updates from the server for day/night cycle.
 */
socket.on('time', (data) => {
  if (data && typeof data.time === 'number') {
    currentWorldTime = data.time

    // Update animated material day/night colors
    if (animatedMaterial) {
      updateDayProgress(animatedMaterial, currentWorldTime)
    }

    // Update sky renderer sun/moon positions
    if (skyRenderer) {
      skyRenderer.setTime(currentWorldTime)
    }
  }
})

/**
 * Handle entity equipment updates from the server.
 * This is emitted when an entity's equipment changes (armor, held items).
 */
socket.on('entityEquipment', (data) => {
  if (!data || !viewer.entities) return

  try {
    // Forward to the entities manager to update equipment meshes
    viewer.entities.update({
      id: data.id,
      equipment: data.equipment
    })
    console.log(`[viewer] Updated equipment for entity ${data.id}`)
  } catch (e) {
    // Ignore equipment update errors
  }
})

/**
 * Handle weather updates from the server.
 * This is emitted when weather changes (clear/rain/thunder).
 */
socket.on('weather', (data) => {
  if (!data || !weatherSystem) return

  try {
    weatherSystem.setWeather(data.state, data.isSnowBiome || false)

    // Dim stars during rain/thunder
    if (skyRenderer) {
      const starBrightness = data.state === 'clear' ? 1.0 : 0.2
      skyRenderer.setStarBrightness(starBrightness)
    }

    console.log(`[viewer] Weather changed to: ${data.state}${data.isSnowBiome ? ' (snow)' : ''}`)
  } catch (e) {
    console.warn('[viewer] Failed to update weather:', e)
  }
})

let firstPositionUpdate = true
let viewMode = 'first' // 'first' | 'third'
let controls = null
let botMesh = null
let lastPos = null
let lastYaw = null
let lastPitch = null
let botVelocity = 0 // For cape animation

const renderer = new THREE.WebGLRenderer()
renderer.setPixelRatio(window.devicePixelRatio || 1)
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const viewer = new Viewer(renderer)

function createOrbitControls () {
  const ctrl = new THREE.OrbitControls(viewer.camera, renderer.domElement)
  ctrl.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE
  }
  ctrl.enableDamping = true
  ctrl.dampingFactor = 0.05
  return ctrl
}

function initOrbitControls () {
  if (controls) return
  controls = createOrbitControls()
  if (lastPos) {
    controls.target.set(lastPos.x, lastPos.y, lastPos.z)
    viewer.camera.position.set(lastPos.x, lastPos.y + 6, lastPos.z + 6)
    controls.update()
  }
}

function destroyOrbitControls () {
  if (controls) {
    controls.dispose()
    controls = null
  }
}

function togglePOV () {
  viewMode = viewMode === 'first' ? 'third' : 'first'
  if (viewMode === 'third') {
    initOrbitControls()
  } else {
    destroyOrbitControls()
  }
  updatePOVButton()
}

function updatePOVButton () {
  const btn = document.getElementById('pov-toggle-btn')
  if (btn) btn.textContent = viewMode === 'first' ? '1st' : '3rd'
}

function createPOVButton () {
  const btn = document.createElement('button')
  btn.id = 'pov-toggle-btn'
  btn.textContent = '1st'
  btn.title = 'Toggle POV (F5): 1st person / 3rd person orbit'
  btn.style.cssText = 'position:fixed;top:8px;right:8px;z-index:9999;padding:6px 10px;' +
    'background:rgba(0,0,0,0.6);color:#fff;border:1px solid #666;border-radius:4px;' +
    'cursor:pointer;font-size:12px;font-family:monospace;'
  btn.addEventListener('click', togglePOV)
  document.body.appendChild(btn)
}

function animate () {
  window.requestAnimationFrame(animate)

  // Update animation time for animated textures (water, lava, fire)
  const now = performance.now()
  const deltaTime = (now - lastAnimationTime) / 1000
  lastAnimationTime = now

  if (animatedMaterial) {
    updateAnimatedMaterial(animatedMaterial, deltaTime)
  }

  // Update sky dome position to follow camera
  if (skyRenderer) {
    skyRenderer.update()

    // Apply lightning flash to sky if active
    if (weatherSystem && weatherSystem.getLightningIntensity() > 0) {
      // Could flash the sky brighter during lightning
      // For now, just track the intensity
    }
  }

  // Update weather particles
  if (weatherSystem) {
    weatherSystem.update(deltaTime)
  }

  // Update bot extras (name tag, cape, shadow)
  if (botExtrasManager && botMesh) {
    const worldPos = new THREE.Vector3()
    botMesh.getWorldPosition(worldPos)
    botExtrasManager.update(viewer.camera, worldPos, deltaTime, Math.min(1, botVelocity / 5))
  }

  if (controls) controls.update()
  viewer.update()
  renderer.render(viewer.scene, viewer.camera)
}
animate()

window.addEventListener('resize', () => {
  viewer.camera.aspect = window.innerWidth / window.innerHeight
  viewer.camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

window.addEventListener('keydown', (e) => {
  if (e.code === 'F5') {
    e.preventDefault()
    togglePOV()
  }
})

/**
 * Handle bot info from the server (username for name tag)
 */
socket.on('botInfo', (data) => {
  if (data && data.username) {
    botUsername = data.username
    console.log(`[viewer] Bot username: ${botUsername}`)

    // Update name tag if bot extras already exist
    if (botExtrasManager && botMesh) {
      // Re-setup extras with correct username
      botExtrasManager.dispose()
      botExtrasManager = new EntityExtrasManager()
      botExtrasManager.setup(botMesh, {
        name: botUsername,
        height: 1.8,
        width: 0.6,
        showCape: true,
        capeColor: 0x2244aa,
        showShadow: true
      })
    }
  }
})

socket.on('version', async (version) => {
  console.log(`[viewer] Received version: ${version}`)

  // Configure custom asset URLs before setting version
  configureCustomAssets(viewer, version)

  // Try to load custom blockstates first
  const customBlockStates = await loadCustomBlockStates(version)
  if (customBlockStates && viewer.world) {
    viewer.world.blockStatesData = customBlockStates
    console.log(`[viewer] Using custom blockstates with ${Object.keys(customBlockStates).length} blocks`)
  }

  if (!viewer.setVersion(version)) {
    return false
  }

  // Set up animated material after texture loads
  // The material.map may not be ready immediately, so we wait for it
  if (customBlockStates) {
    const checkAndSetupMaterial = () => {
      if (viewer.world && viewer.world.material && viewer.world.material.map) {
        setupAnimatedMaterial(customBlockStates)
      } else {
        // Retry after a short delay while texture loads
        setTimeout(checkAndSetupMaterial, 100)
      }
    }
    // Start checking after a small initial delay
    setTimeout(checkAndSetupMaterial, 200)
  }

  // Initialize sky renderer after viewer is set up
  if (!skyRenderer) {
    skyRenderer = createSkyRenderer(viewer.scene, viewer.camera)
    skyRenderer.setTime(currentWorldTime)
    console.log('[viewer] Sky renderer initialized')
  }

  // Initialize weather system
  if (!weatherSystem) {
    weatherSystem = createWeatherSystem(viewer.scene, viewer.camera)
    console.log('[viewer] Weather system initialized')
  }

  firstPositionUpdate = true
  viewer.listen(socket)

  // Set camera reference on entities manager for name tag updates
  if (viewer.entities && viewer.entities.setCamera) {
    viewer.entities.setCamera(viewer.camera)
  }

  createPOVButton()

  socket.on('position', ({ pos, addMesh, yaw, pitch }) => {
    lastPos = pos
    lastYaw = yaw
    lastPitch = pitch

    if (viewMode === 'third') {
      initOrbitControls()
      controls.target.set(pos.x, pos.y, pos.z)
      if (firstPositionUpdate && pos.y > 0) {
        viewer.camera.position.set(pos.x, pos.y + 6, pos.z + 6)
        controls.update()
        firstPositionUpdate = false
      }
    } else if (yaw !== undefined && pitch !== undefined) {
      destroyOrbitControls()
      viewer.setFirstPersonCamera(pos, yaw, pitch)
    }

    if (addMesh) {
      if (!botMesh) {
        botMesh = new Entity('1.16.4', 'player', viewer.scene).mesh
        viewer.scene.add(botMesh)

        // Set up entity extras (name tag, cape, shadow) for bot mesh
        botExtrasManager = new EntityExtrasManager()
        botExtrasManager.setup(botMesh, {
          name: botUsername,
          height: 1.8,
          width: 0.6,
          showCape: true,
          capeColor: 0x2244aa,
          showShadow: true
        })
        console.log(`[viewer] Bot extras initialized for ${botUsername}`)
      }

      // Calculate velocity for cape animation
      if (lastPos) {
        const dx = pos.x - lastPos.x
        const dz = pos.z - lastPos.z
        botVelocity = Math.sqrt(dx * dx + dz * dz) / 0.05 // Approximate velocity
      }

      new TWEEN.Tween(botMesh.position).to({ x: pos.x, y: pos.y, z: pos.z }, 50).start()
      if (yaw !== undefined) {
        const da = (yaw - botMesh.rotation.y) % (Math.PI * 2)
        const dy = 2 * da % (Math.PI * 2) - da
        new TWEEN.Tween(botMesh.rotation).to({ y: botMesh.rotation.y + dy }, 50).start()
      }
    }
  })
})
