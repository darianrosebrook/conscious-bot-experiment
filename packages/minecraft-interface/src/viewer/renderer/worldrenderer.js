/**
 * worldrenderer.js - Patched World Renderer
 *
 * This is a patched version of prismarine-viewer's worldrenderer.js that fixes
 * the blockStates race condition by sending blockStates synchronously when
 * pre-loaded via blockStatesData.
 *
 * @module viewer/renderer/worldrenderer
 * @author @darianrosebrook
 */

import * as THREE from 'three'
import { Vec3 } from 'vec3'
import { loadTexture, loadJSON } from '../utils/utils.web.js'
import { EventEmitter } from 'events'
import { dispose3 } from '../utils/dispose.js'

function mod (x, n) {
  return ((x % n) + n) % n
}

class WorldRenderer {
  constructor (scene, numWorkers = 4) {
    this.sectionMeshs = {}
    this.active = false
    this.version = undefined
    this.scene = scene
    this.loadedChunks = {}
    this.sectionsOutstanding = new Set()
    this.renderUpdateEmitter = new EventEmitter()
    this.blockStatesData = undefined
    this.texturesDataUrl = undefined
    this.mcDataPayload = null

    // Track whether blockStates have been sent to workers
    this.blockStatesSentToWorkers = false

    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, alphaTest: 0.1 })

    this.workers = []
    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker(
        new URL('../meshing/worker.js', import.meta.url),
        { type: 'module' }
      )
      worker.onmessage = ({ data }) => {
        if (data.type === 'geometry') {
          let mesh = this.sectionMeshs[data.key]
          if (mesh) {
            this.scene.remove(mesh)
            dispose3(mesh)
            delete this.sectionMeshs[data.key]
          }

          const chunkCoords = data.key.split(',')
          if (!this.loadedChunks[chunkCoords[0] + ',' + chunkCoords[2]]) return

          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.BufferAttribute(data.geometry.positions, 3))
          geometry.setAttribute('normal', new THREE.BufferAttribute(data.geometry.normals, 3))
          geometry.setAttribute('color', new THREE.BufferAttribute(data.geometry.colors, 3))
          geometry.setAttribute('uv', new THREE.BufferAttribute(data.geometry.uvs, 2))
          geometry.setIndex(data.geometry.indices)

          mesh = new THREE.Mesh(geometry, this.material)
          mesh.position.set(data.geometry.sx, data.geometry.sy, data.geometry.sz)
          this.sectionMeshs[data.key] = mesh
          this.scene.add(mesh)
        } else if (data.type === 'sectionFinished') {
          this.sectionsOutstanding.delete(data.key)
          this.renderUpdateEmitter.emit('update')
        } else if (data.type === 'workerDebug') {
          console.log(`[worker ${i}]`, data.msg)
          if (data.stack) console.error(`[worker ${i}]`, data.stack)
        }
      }
      if (worker.on) worker.on('message', (data) => { worker.onmessage({ data }) })
      this.workers.push(worker)
    }
  }

  resetWorld () {
    this.active = false
    this.blockStatesSentToWorkers = false
    for (const mesh of Object.values(this.sectionMeshs)) {
      this.scene.remove(mesh)
    }
    this.sectionMeshs = {}
    for (const worker of this.workers) {
      worker.postMessage({ type: 'reset' })
    }
  }

  setVersion (version) {
    this.version = version
    this.resetWorld()
    this.active = true

    // INVARIANT: mcDataPayload must be set before setVersion() is called.
    // Without it, workers will crash when prismarine-chunk/registry try to read
    // from the minecraft-data shim before it's been hydrated.
    if (!this.mcDataPayload) {
      console.error(
        '[worldrenderer] FATAL: setVersion() called without mcDataPayload. ' +
        'Workers will crash — the minecraft-data shim has no data to serve. ' +
        'Ensure socket "mcData" event is received and viewer.world.mcDataPayload ' +
        'is set before calling setVersion().'
      )
      return false
    }

    // Send mcData to workers BEFORE version — the shim must be populated
    // before `new World(version)` triggers `require('minecraft-data')(version)`
    for (const worker of this.workers) {
      worker.postMessage({ type: 'mcData', ...this.mcDataPayload })
    }
    console.log('[worldrenderer] Sent mcData to workers')

    for (const worker of this.workers) {
      worker.postMessage({ type: 'version', version })
    }

    this.updateTexturesData()
  }

  /**
   * ENHANCED: Load textures and blockStates, with synchronous blockStates support.
   *
   * If blockStatesData is pre-set (by custom asset loading in index.js), send it
   * to workers immediately and synchronously. This eliminates the race condition
   * where chunks arrive before blockStates are loaded.
   */
  updateTexturesData () {
    // Load texture (this is always async, but material.map being set is our "ready" signal)
    loadTexture(this.texturesDataUrl || `textures/${this.version}.png`, texture => {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.flipY = false
      this.material.map = texture
      this.material.needsUpdate = true
      console.log('[worldrenderer] Texture loaded')
    })

    // ENHANCED: If blockStatesData is pre-set, send to workers synchronously
    if (this.blockStatesData) {
      console.log('[worldrenderer] BlockStates pre-loaded, sending to workers synchronously')
      for (const worker of this.workers) {
        worker.postMessage({ type: 'blockStates', json: this.blockStatesData })
      }
      this.blockStatesSentToWorkers = true
      console.log('[worldrenderer] BlockStates sent to workers (sync path)')
      return // Skip async load
    }

    // Original async path for fallback (when blockStatesData is not pre-set)
    console.log('[worldrenderer] BlockStates not pre-loaded, loading async (original path)')
    const loadBlockStates = () => {
      return new Promise(resolve => {
        return loadJSON(`blocksStates/${this.version}.json`, resolve)
      })
    }
    loadBlockStates().then((blockStates) => {
      for (const worker of this.workers) {
        worker.postMessage({ type: 'blockStates', json: blockStates })
      }
      this.blockStatesSentToWorkers = true
      console.log('[worldrenderer] BlockStates sent to workers (async path)')
    })
  }

  addColumn (x, z, chunk) {
    this.loadedChunks[`${x},${z}`] = true
    for (const worker of this.workers) {
      worker.postMessage({ type: 'chunk', x, z, chunk })
    }
    // Post-1.18 worlds extend from minY=-64 to minY+worldHeight=320.
    // Parse the chunk JSON to discover actual Y range, falling back to legacy 0..255.
    // Cache values for removeColumn to use.
    if (this.minY === undefined) {
      try {
        const parsed = typeof chunk === 'string' ? JSON.parse(chunk) : chunk
        if (typeof parsed.minY === 'number') this.minY = parsed.minY
        if (typeof parsed.worldHeight === 'number') this.worldHeight = parsed.worldHeight
      } catch (_) { /* fallback to defaults */ }
    }
    const minY = this.minY ?? 0
    const worldHeight = this.worldHeight ?? 256
    for (let y = minY; y < minY + worldHeight; y += 16) {
      const loc = new Vec3(x, y, z)
      this.setSectionDirty(loc)
      this.setSectionDirty(loc.offset(-16, 0, 0))
      this.setSectionDirty(loc.offset(16, 0, 0))
      this.setSectionDirty(loc.offset(0, 0, -16))
      this.setSectionDirty(loc.offset(0, 0, 16))
    }
  }

  removeColumn (x, z) {
    delete this.loadedChunks[`${x},${z}`]
    for (const worker of this.workers) {
      worker.postMessage({ type: 'unloadChunk', x, z })
    }
    // Use same Y range as addColumn (post-1.18 worlds have minY=-64, worldHeight=384)
    const minY = this.minY ?? 0
    const worldHeight = this.worldHeight ?? 256
    for (let y = minY; y < minY + worldHeight; y += 16) {
      this.setSectionDirty(new Vec3(x, y, z), false)
      const key = `${x},${y},${z}`
      const mesh = this.sectionMeshs[key]
      if (mesh) {
        this.scene.remove(mesh)
        dispose3(mesh)
      }
      delete this.sectionMeshs[key]
    }
  }

  setBlockStateId (pos, stateId) {
    for (const worker of this.workers) {
      worker.postMessage({ type: 'blockUpdate', pos, stateId })
    }
    this.setSectionDirty(pos)
    if ((pos.x & 15) === 0) this.setSectionDirty(pos.offset(-16, 0, 0))
    if ((pos.x & 15) === 15) this.setSectionDirty(pos.offset(16, 0, 0))
    if ((pos.y & 15) === 0) this.setSectionDirty(pos.offset(0, -16, 0))
    if ((pos.y & 15) === 15) this.setSectionDirty(pos.offset(0, 16, 0))
    if ((pos.z & 15) === 0) this.setSectionDirty(pos.offset(0, 0, -16))
    if ((pos.z & 15) === 15) this.setSectionDirty(pos.offset(0, 0, 16))
  }

  setSectionDirty (pos, value = true) {
    // Dispatch sections to workers based on position
    // This guarantees uniformity accross workers and that a given section
    // is always dispatched to the same worker
    const hash = mod(Math.floor(pos.x / 16) + Math.floor(pos.y / 16) + Math.floor(pos.z / 16), this.workers.length)
    this.workers[hash].postMessage({ type: 'dirty', x: pos.x, y: pos.y, z: pos.z, value })
    this.sectionsOutstanding.add(`${Math.floor(pos.x / 16) * 16},${Math.floor(pos.y / 16) * 16},${Math.floor(pos.z / 16) * 16}`)
  }

  // Listen for chunk rendering updates emitted if a worker finished a render and resolve if the number
  // of sections not rendered are 0
  waitForChunksToRender () {
    return new Promise((resolve, reject) => {
      if (Array.from(this.sectionsOutstanding).length === 0) {
        resolve()
        return
      }

      const updateHandler = () => {
        if (this.sectionsOutstanding.size === 0) {
          this.renderUpdateEmitter.removeListener('update', updateHandler)
          resolve()
        }
      }
      this.renderUpdateEmitter.on('update', updateHandler)
    })
  }
}

export { WorldRenderer }
