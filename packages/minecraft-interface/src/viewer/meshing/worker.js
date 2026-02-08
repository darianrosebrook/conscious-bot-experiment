/* global postMessage self */

import { Vec3 } from 'vec3'
import minecraftDataShim from './minecraft-data-shim.js'
import { World } from './world.js'
import { getSectionGeometry } from './models.js'

let blocksStates = null
let world = null

function sectionKey (x, y, z) {
  return `${x},${y},${z}`
}

const dirtySections = {}

function setSectionDirty (pos, value = true) {
  const x = Math.floor(pos.x / 16) * 16
  const y = Math.floor(pos.y / 16) * 16
  const z = Math.floor(pos.z / 16) * 16
  const chunk = world.getColumn(x, z)
  const key = sectionKey(x, y, z)
  if (!value) {
    delete dirtySections[key]
    postMessage({ type: 'sectionFinished', key })
  } else if (chunk && chunk.sections[Math.floor((y - (chunk.minY ?? 0)) / 16)]) {
    dirtySections[key] = value
  } else {
    postMessage({ type: 'sectionFinished', key })
  }
}

self.onmessage = ({ data }) => {
  if (data.type === 'mcData') {
    // Populate the minecraft-data shim BEFORE World construction.
    // This must arrive before the 'version' message (guaranteed by sequential postMessage).
    // The versionMap must be set first — it's needed by version comparison operators.
    if (data.versionMap) {
      minecraftDataShim.setVersionMap(data.versionMap)
    }
    minecraftDataShim.setData(data.version, data.data)
    // If tints come from a different version (e.g. '1.16.2'), register that too
    if (data.tintsVersion && data.tintsVersion !== data.version) {
      minecraftDataShim.setData(data.tintsVersion, { tints: data.data.tints })
    }
  } else if (data.type === 'version') {
    try {
      world = new World(data.version)
    } catch (e) {
      postMessage({ type: 'workerDebug', msg: `World construction FAILED: ${e.message}`, stack: e.stack })
    }
  } else if (data.type === 'blockStates') {
    blocksStates = data.json
  } else if (data.type === 'dirty') {
    if (!world) { postMessage({ type: 'sectionFinished', key: `${data.x},${data.y},${data.z}` }); return }
    const loc = new Vec3(data.x, data.y, data.z)
    setSectionDirty(loc, data.value)
  } else if (data.type === 'chunk') {
    if (!world) return
    try {
      world.addColumn(data.x, data.z, data.chunk)
    } catch (e) {
      postMessage({ type: 'workerDebug', msg: `Chunk load FAILED (${data.x},${data.z}): ${e.message}`, stack: e.stack })
    }
  } else if (data.type === 'unloadChunk') {
    if (!world) return
    world.removeColumn(data.x, data.z)
  } else if (data.type === 'blockUpdate') {
    if (!world) return
    const loc = new Vec3(data.pos.x, data.pos.y, data.pos.z).floored()
    world.setBlockStateId(loc, data.stateId)
  } else if (data.type === 'reset') {
    world = null
    blocksStates = null
  }
}

setInterval(() => {
  if (world === null || blocksStates === null) return
  const sections = Object.keys(dirtySections)
  if (sections.length === 0) return

  for (const key of sections) {
    let [x, y, z] = key.split(',')
    x = parseInt(x, 10)
    y = parseInt(y, 10)
    z = parseInt(z, 10)
    const chunk = world.getColumn(x, z)
    if (chunk && chunk.sections[Math.floor((y - (chunk.minY ?? 0)) / 16)]) {
      delete dirtySections[key]

      try {
        const geometry = getSectionGeometry(x, y, z, world, blocksStates)
        const transferable = [geometry.positions.buffer, geometry.normals.buffer, geometry.colors.buffer, geometry.uvs.buffer]
        postMessage({ type: 'geometry', key, geometry }, transferable)
      } catch (e) {
        postMessage({ type: 'workerDebug', msg: `getSectionGeometry FAILED for ${key}: ${e.message}`, stack: e.stack })
      }
    }
    postMessage({ type: 'sectionFinished', key })
  }
}, 50)
