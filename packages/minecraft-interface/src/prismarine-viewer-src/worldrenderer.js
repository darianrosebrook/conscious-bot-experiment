/* global Worker */
/**
 * worldrenderer.js - Patched World Renderer
 *
 * This is a patched version of prismarine-viewer's worldrenderer.js that fixes
 * the blockStates race condition by sending blockStates synchronously when
 * pre-loaded via blockStatesData.
 *
 * The original issue: updateTexturesData() loads blockStates via async promise,
 * but chunks are sent to workers immediately. Workers early-return if blocksStates
 * is null, causing terrain to not render.
 *
 * The fix: If blockStatesData is pre-set (by our custom asset loading), send it
 * to workers synchronously in updateTexturesData() instead of loading async.
 *
 * This file is copied to node_modules/prismarine-viewer/viewer/lib/worldrenderer.js
 * by scripts/rebuild-prismarine-viewer.cjs during postinstall.
 *
 * @module prismarine-viewer/viewer/lib/worldrenderer
 * @author @darianrosebrook
 */

const THREE = require('three')
const Vec3 = require('vec3').Vec3
const { loadTexture, loadJSON } = globalThis.isElectron ? require('./utils.electron.js') : require('./utils')
const { EventEmitter } = require('events')
const { dispose3 } = require('./dispose')

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

    // Track whether blockStates have been sent to workers
    this.blockStatesSentToWorkers = false

    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, alphaTest: 0.1 })

    this.workers = []
    for (let i = 0; i < numWorkers; i++) {
      // Node environement needs an absolute path, but browser needs the url of the file
      let src = __dirname
      if (typeof window !== 'undefined') src = 'worker.js'
      else src += '/worker.js'

      const worker = new Worker(src)
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
   *
   * Original behavior: Always load blockStates via async loadJSON, which causes
   * race conditions with chunk loading.
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
    for (let y = 0; y < 256; y += 16) {
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
    for (let y = 0; y < 256; y += 16) {
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

module.exports = { WorldRenderer }
