/**
 * index.js - Prismarine Viewer Client Entry Point
 *
 * This is the main client-side entry point for the viewer.
 * It is bundled by Vite into public/.
 *
 * Customizations:
 * 1. POV toggle (F5 key or button) - switch between 1st/3rd person
 * 2. OrbitControls for 3rd person view with mouse rotation
 * 3. Bot mesh rendering when in 3rd person mode
 * 4. Custom texture URLs from /mc-assets for version support beyond 1.21.4
 * 5. Animated texture shader for water/lava/fire animations
 * 6. Procedural sky dome with sun/moon/stars
 *
 * @module viewer/client/index
 * @author @darianrosebrook
 */

import * as THREE from 'three'
import { WebGLRenderer } from 'three'
globalThis.THREE = THREE
import TWEEN from '@tweenjs/tween.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { Viewer } from '../renderer/viewer.js'
import Entity from '../entities/Entity.js'
import {
  generateAnimationMap,
  createAnimatedMaterial,
  updateAnimatedMaterial,
  updateDayProgress
} from '../effects/animated-material-client.js'
import { createSkyRenderer } from '../effects/sky-renderer.js'
import { createWeatherSystem } from '../effects/weather-system.js'
import { EntityExtrasManager } from '../entities/entity-extras.js'

import io from 'socket.io-client'
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
let botSkinUrl = null // Will be updated from botInfo event
let botCapeUrl = null // Will be updated from botInfo event

// ============================================================================
// Custom Asset Integration
// ============================================================================
// Use our asset server for textures/blockstates to support MC versions beyond 1.21.4
// The asset server falls back to prismarine-viewer's bundled assets if custom assets
// aren't available for a version.

// Asset server runs on minecraft-interface (port 3005), not the viewer (port 3006)
// We need to use the correct port for asset requests
const ASSET_SERVER_PORT = 3005
const ASSET_SERVER_URL = `http://${window.location.hostname}:${ASSET_SERVER_PORT}`
globalThis.__ASSET_SERVER_URL = ASSET_SERVER_URL

/**
 * Configure viewer to use custom asset URLs from our asset server.
 * This enables support for newer Minecraft versions and custom animated textures.
 */
function configureCustomAssets (viewer, version) {
  // Point to our asset server - falls back to bundled assets if not found
  if (viewer.world) {
    // Custom texture atlas URL (served by minecraft-interface asset server on port 3005)
    viewer.world.texturesDataUrl = `${ASSET_SERVER_URL}/mc-assets/textures/${version}.png`
    console.log(`[viewer] Using custom texture URL: ${viewer.world.texturesDataUrl}`)
  }
}

/**
 * Load blockstates from our custom asset server.
 * Falls back to prismarine-viewer's bundled blockstates if not found.
 */
async function loadCustomBlockStates (version) {
  try {
    const response = await fetch(`${ASSET_SERVER_URL}/mc-assets/blocksStates/${version}.json`)
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

  const texture = viewer.world.material.map

  function doSetup () {
    try {
      const atlasSize = texture.image ? texture.image.width : null
      if (!atlasSize) {
        console.warn('[viewer] Animated material: texture.image still null, aborting')
        return
      }

      console.log(`[viewer] Setting up animated material with atlas size ${atlasSize}x${atlasSize}`)

      // Generate animation lookup map from blockstates
      const animMap = generateAnimationMap(blockStates, atlasSize)

      // Create the animated material
      // frameVStep = tileSize / atlasSize gives precise UV step per animation frame
      const tileSize = 16
      animatedMaterial = createAnimatedMaterial(texture, animMap, {
        dayProgress: 0.5, // Start at noon
        ambientLightIntensity: 0.6,
        directionalLightIntensity: 0.5,
        frameVStep: tileSize / atlasSize
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

  // texture.image may not be loaded yet (THREE.TextureLoader is async).
  // Wait for the image to actually load before reading its dimensions.
  if (texture.image && texture.image.width) {
    doSetup()
  } else {
    console.log('[viewer] Waiting for texture atlas image to load...')
    // Poll for texture.image readiness (TextureLoader doesn't expose a reliable callback here)
    let attempts = 0
    const maxAttempts = 100 // 5 seconds at 50ms intervals
    const poll = setInterval(() => {
      attempts++
      if (texture.image && texture.image.width) {
        clearInterval(poll)
        doSetup()
      } else if (attempts >= maxAttempts) {
        clearInterval(poll)
        console.warn('[viewer] Texture atlas image did not load after 5s, using fallback size')
        doSetup()
      }
    }, 50)
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
    // Equipment update applied
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

    // Weather state applied
  } catch (e) {
    console.warn('[viewer] Failed to update weather:', e)
  }
})

// 3rd person orbit pivots around the bot's head (Minecraft player eye height in blocks)
const THIRD_PERSON_HEAD_OFFSET = 1.62

let firstPositionUpdate = true
let viewMode = 'first' // 'first' | 'third'
let controls = null
let botMesh = null
let lastPos = null
let lastYaw = null
let lastPitch = null
let botVelocity = 0 // For cape animation

const renderer = new WebGLRenderer()
renderer.setPixelRatio(window.devicePixelRatio || 1)
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const viewer = new Viewer(renderer)
window.__viewer = viewer

function createOrbitControls () {
  const ctrl = new OrbitControls(viewer.camera, renderer.domElement)
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
    const headY = lastPos.y + THIRD_PERSON_HEAD_OFFSET
    controls.target.set(lastPos.x, headY, lastPos.z)
    viewer.camera.position.set(lastPos.x, headY + 6, lastPos.z + 6)
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
    botSkinUrl = data.skinUrl || null
    botCapeUrl = data.capeUrl || null
    console.log(`[viewer] Bot username: ${botUsername}, skin: ${botSkinUrl ? 'custom' : 'default'}, cape: ${botCapeUrl ? 'yes' : 'none'}`)

    // Update name tag if bot extras already exist
    if (botExtrasManager && botMesh) {
      // Re-setup extras with correct username
      botExtrasManager.dispose()
      botExtrasManager = new EntityExtrasManager()
      botExtrasManager.setup(botMesh, {
        name: botUsername,
        height: 1.8,
        width: 0.6,
        showCape: false, // Model's built-in cape bone handles this when Mojang cape URL exists
        showShadow: true
      })
    }
  }
})

// ============================================================================
// minecraft-data shim: receive server-extracted mcData for worker bundle
// ============================================================================
let pendingMcData = null

socket.on('mcData', (payload) => {
  // mcData received for version
  pendingMcData = payload
})

// Queue for loadChunk events that arrive before viewer is ready
// This fixes a race condition where chunks arrive during async blockStates loading
const pendingChunks = []
let viewerReady = false

// Buffer for position events that arrive before the version handler completes
let pendingPosition = null

// Track whether workers have received blockStates
let workersBlockStatesReady = false

// Register loadChunk listener IMMEDIATELY to avoid missing events during async setup
// Note: viewer.listen() also registers a loadChunk handler, but we only queue here
// and let the viewer's handler process once viewerReady is true
socket.on('loadChunk', ({ x, z, chunk }) => {
  if (!viewerReady) {
    // Queue chunks until viewer is ready - they'll be processed after setup
    pendingChunks.push({ x, z, chunk })
  }
  // Once viewerReady is true, viewer.listen()'s handler will process new chunks
})

// Register position listener IMMEDIATELY to buffer initial position events.
// The server emits position on socket connect, but the async version handler
// (which loads blockstates) hasn't finished yet, so we buffer the position.
socket.on('position', (posData) => {
  if (!viewerReady) {
    pendingPosition = posData
    return
  }
  handlePosition(posData)
})

/**
 * Wait for workers to be ready to process chunks.
 *
 * The race condition occurs because:
 * 1. setVersion() calls updateTexturesData() which loads blockStates async
 * 2. We immediately call viewer.addColumn() for chunks
 * 3. Workers receive chunks but blocksStates === null, so they early-return
 *
 * This function polls for material.map (texture loaded) as a proxy for workers
 * being ready. We also check blockStatesData to ensure it's been set before
 * updateTexturesData() was called.
 *
 * @param {Object} worldRenderer - The viewer's world renderer
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @returns {Promise<void>} Resolves when workers are ready
 */
function waitForWorkersReady (worldRenderer, timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now()

    const check = () => {
      // Check if material.map is loaded (texture ready)
      const textureReady = worldRenderer.material && worldRenderer.material.map

      // If blockStatesData was pre-set, workers received it synchronously
      // Otherwise, we wait for the texture as a proxy (they load in parallel)
      const blockStatesReady = worldRenderer.blockStatesData != null || textureReady

      if (textureReady && blockStatesReady) {
        // Workers ready — texture loaded, blockStates distributed
        workersBlockStatesReady = true
        resolve()
        return
      }

      if (Date.now() - startTime > timeout) {
        console.warn('[viewer] Timeout waiting for workers ready, proceeding anyway')
        console.warn('[viewer]   textureReady:', !!textureReady)
        console.warn('[viewer]   blockStatesData set:', worldRenderer.blockStatesData != null)
        workersBlockStatesReady = true
        resolve()
        return
      }

      // Poll every 50ms (matches worker's setInterval)
      setTimeout(check, 50)
    }

    check()
  })
}

/**
 * Handle a position update from the server.
 * Extracted from the version handler so it can also process buffered positions.
 */
function handlePosition ({ pos, addMesh, yaw, pitch }) {
  lastPos = pos
  lastYaw = yaw
  lastPitch = pitch

  if (viewMode === 'third') {
    initOrbitControls()
    const headY = pos.y + THIRD_PERSON_HEAD_OFFSET
    controls.target.set(pos.x, headY, pos.z)
    if (firstPositionUpdate && pos.y > 0) {
      viewer.camera.position.set(pos.x, headY + 6, pos.z + 6)
      controls.update()
      firstPositionUpdate = false
    }
  } else if (yaw !== undefined && pitch !== undefined) {
    destroyOrbitControls()
    viewer.setFirstPersonCamera(pos, yaw, pitch)
  }

  if (addMesh) {
    if (!botMesh) {
      const textureVersion = globalThis.__MC_VERSION || '1.21.9'
      botMesh = new Entity(textureVersion, 'player', viewer.scene, botSkinUrl, botCapeUrl).mesh
      viewer.scene.add(botMesh)

      // Set up entity extras (name tag, cape, shadow) for bot mesh
      botExtrasManager = new EntityExtrasManager()
      botExtrasManager.setup(botMesh, {
        name: botUsername,
        height: 1.8,
        width: 0.6,
        showCape: false, // Model's built-in cape bone handles this when Mojang cape URL exists
        showShadow: true
      })
      // Bot extras initialized
    }

    // Calculate velocity for cape animation
    if (lastPos) {
      const dx = pos.x - lastPos.x
      const dz = pos.z - lastPos.z
      botVelocity = Math.sqrt(dx * dx + dz * dz) / 0.05 // Approximate velocity
    }

    new TWEEN.Tween(botMesh.position).to({ x: pos.x, y: pos.y, z: pos.z }, 50).start()
    if (yaw !== undefined) {
      // Mineflayer yaw: 0=north(-Z), PI=south(+Z). Model face points -Z at rotation.y=0.
      // Conventions match — apply yaw directly.
      const da = (yaw - botMesh.rotation.y) % (Math.PI * 2)
      const dy = 2 * da % (Math.PI * 2) - da
      new TWEEN.Tween(botMesh.rotation).to({ y: botMesh.rotation.y + dy }, 50).start()
    }
  }
}

socket.on('version', async (version) => {
  console.log(`[viewer] Initializing version ${version}`)
  globalThis.__MC_VERSION = version

  // Configure custom asset URLs before setting version
  configureCustomAssets(viewer, version)

  // Try to load custom blockstates first
  const customBlockStates = await loadCustomBlockStates(version)
  if (customBlockStates && viewer.world) {
    // CRITICAL: Set blockStatesData BEFORE setVersion() so updateTexturesData()
    // can send it to workers synchronously instead of loading async
    viewer.world.blockStatesData = customBlockStates
  }

  // Pass mcData to worldrenderer so it can forward to workers before version message
  if (pendingMcData && viewer.world) {
    viewer.world.mcDataPayload = pendingMcData
  }

  if (!viewer.setVersion(version)) {
    return false
  }

  // CRITICAL FIX: Wait for workers to receive blockStates before processing chunks
  // This prevents the race condition where chunks arrive before blockStates
  await waitForWorkersReady(viewer.world)

  // Set up animated material after texture loads
  // The material.map is now guaranteed to be ready from waitForWorkersReady
  if (customBlockStates) {
    setupAnimatedMaterial(customBlockStates)
  }

  // Initialize sky renderer after viewer is set up
  if (!skyRenderer) {
    skyRenderer = createSkyRenderer(viewer.scene, viewer.camera)
    skyRenderer.setTime(currentWorldTime)
  }

  // Initialize weather system
  if (!weatherSystem) {
    weatherSystem = createWeatherSystem(viewer.scene, viewer.camera)
  }

  firstPositionUpdate = true
  if (!globalThis.__ASSET_SERVER_URL) {
    console.warn(
      '[viewer] __ASSET_SERVER_URL not set - entity textures may load from bundled assets only; custom skins may not work'
    )
  }
  viewer.listen(socket)

  // Mark viewer as ready and process any queued chunks
  // Workers are now GUARANTEED to have blockStates loaded
  viewerReady = true
  if (pendingChunks.length > 0) {
    console.log(`[viewer] Processing ${pendingChunks.length} queued chunks`)
    for (const { x, z, chunk } of pendingChunks) {
      viewer.addColumn(x, z, chunk)
    }
    pendingChunks.length = 0 // Clear the queue
  }

  // Set camera reference on entities manager for name tag updates
  if (viewer.entities && viewer.entities.setCamera) {
    viewer.entities.setCamera(viewer.camera)
  }

  createPOVButton()

  console.log('[viewer] Ready')

  // Process buffered position event (sent by server before async setup completed)
  if (pendingPosition) {
    handlePosition(pendingPosition)
    pendingPosition = null
  }
})
