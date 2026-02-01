/* global THREE */
/**
 * Prismarine Viewer Client - Patched for POV switcher and right-click orbit.
 * @author @darianrosebrook
 */

global.THREE = require('three')
const TWEEN = require('@tweenjs/tween.js')
require('three/examples/js/controls/OrbitControls')

const { Viewer, Entity } = require('../viewer')

const io = require('socket.io-client')
const socket = io({
  path: window.location.pathname + 'socket.io'
})

let firstPositionUpdate = true
let viewMode = 'first' // 'first' | 'third'
let controls = null
let botMesh = null
let lastPos = null
let lastYaw = null
let lastPitch = null

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

socket.on('version', (version) => {
  if (!viewer.setVersion(version)) {
    return false
  }

  firstPositionUpdate = true
  viewer.listen(socket)
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
