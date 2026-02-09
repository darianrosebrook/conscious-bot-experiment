/**
 * viewer.js - Main viewer class with animation loop integration
 *
 * This file provides the main Viewer class that orchestrates:
 * - Three.js scene setup (camera, lights)
 * - World rendering (chunks, blocks)
 * - Entity management (spawning, animation)
 * - Event handling (clicks, keyboard)
 *
 * MODIFIED: Added animation timing and updateAnimations() call in update()
 *
 * @module viewer/renderer/viewer
 */

import * as THREE from 'three'
import TWEEN from '@tweenjs/tween.js'
import { WorldRenderer } from './worldrenderer.js'
import { Entities } from '../entities/entities.js'
import { Primitives } from './primitives.js'
import { getVersion } from '../utils/version.js'
import { Vec3 } from 'vec3'

class Viewer {
  constructor (renderer) {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('lightblue')

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.9)
    this.scene.add(this.ambientLight)

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.6)
    this.directionalLight.position.set(1, 1, 0.5).normalize()
    this.directionalLight.castShadow = true
    this.scene.add(this.directionalLight)

    const size = renderer.getSize(new THREE.Vector2())
    this.camera = new THREE.PerspectiveCamera(75, size.x / size.y, 0.1, 1000)

    this.world = new WorldRenderer(this.scene)
    this.entities = new Entities(this.scene)
    this.primitives = new Primitives(this.scene, this.camera)

    this.domElement = renderer.domElement
    this.playerHeight = 1.6
    this.isSneaking = false

    // Animation timing
    this.lastAnimationTime = performance.now()
  }

  resetAll () {
    this.world.resetWorld()
    this.entities.clear()
    this.primitives.clear()
  }

  setVersion (version) {
    version = getVersion(version)
    if (version === null) {
      const msg = `${version} is not supported`
      window.alert(msg)
      console.log(msg)
      return false
    }
    console.log('Using version: ' + version)
    this.version = version
    if (this.world.setVersion(version) === false) {
      return false
    }
    this.entities.clear()
    this.primitives.clear()
    return true
  }

  addColumn (x, z, chunk) {
    this.world.addColumn(x, z, chunk)
  }

  removeColumn (x, z) {
    this.world.removeColumn(x, z)
  }

  setBlockStateId (pos, stateId) {
    this.world.setBlockStateId(pos, stateId)
  }

  updateEntity (e) {
    this.entities.update(e)
  }

  updatePrimitive (p) {
    this.primitives.update(p)
  }

  setFirstPersonCamera (pos, yaw, pitch) {
    if (pos) {
      let y = pos.y + this.playerHeight
      if (this.isSneaking) y -= 0.3
      new TWEEN.Tween(this.camera.position).to({ x: pos.x, y, z: pos.z }, 50).start()
    }
    this.camera.rotation.set(pitch, yaw, 0, 'ZYX')
  }

  listen (emitter) {
    emitter.on('entity', (e) => {
      this.updateEntity(e)
    })

    emitter.on('primitive', (p) => {
      this.updatePrimitive(p)
    })

    emitter.on('loadChunk', ({ x, z, chunk }) => {
      this.addColumn(x, z, chunk)
    })

    emitter.on('unloadChunk', ({ x, z }) => {
      this.removeColumn(x, z)
    })

    emitter.on('blockUpdate', ({ pos, stateId }) => {
      this.setBlockStateId(new Vec3(pos.x, pos.y, pos.z), stateId)
    })

    this.domElement.addEventListener('pointerdown', (evt) => {
      const raycaster = new THREE.Raycaster()
      const mouse = new THREE.Vector2()
      mouse.x = (evt.clientX / this.domElement.clientWidth) * 2 - 1
      mouse.y = -(evt.clientY / this.domElement.clientHeight) * 2 + 1
      raycaster.setFromCamera(mouse, this.camera)
      const ray = raycaster.ray
      emitter.emit('mouseClick', { origin: ray.origin, direction: ray.direction, button: evt.button })
    })
  }

  /**
   * Main update loop - called every frame.
   *
   * MODIFIED: Now updates entity skeletal animations in addition to TWEEN.
   */
  update () {
    TWEEN.update()

    // Update entity skeletal animations
    const now = performance.now()
    const deltaTime = (now - this.lastAnimationTime) / 1000 // Convert to seconds
    this.lastAnimationTime = now

    if (this.entities && this.entities.updateAnimations) {
      this.entities.updateAnimations(deltaTime)
    }
  }

  async waitForChunksToRender () {
    await this.world.waitForChunksToRender()
  }
}

export { Viewer }
