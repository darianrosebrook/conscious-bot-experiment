/**
 * minecraft-data-shim.js — Lightweight API-compatible replacement for minecraft-data
 *
 * In the Vite worker bundle, the real `minecraft-data` package pulls in ~366MB of
 * JSON for every Minecraft version. The worker only needs data for ONE version at
 * runtime. This shim stores data received via postMessage and serves it when
 * prismarine-chunk / prismarine-registry call `require('minecraft-data')(version)`.
 *
 * Must be populated via `minecraftData.setData(version, data)` BEFORE any code
 * calls `minecraftData(version)`. In the worker, this is guaranteed by sending
 * the 'mcData' message before the 'version' message (sequential postMessage).
 *
 * Responsibilities beyond storage:
 * - Reconstructs version comparison operators (>=, >, <, <=) from dataVersion integers
 *   (lost during JSON serialization over Socket.IO)
 * - Reconstructs supportFeature() closure from extracted feature map
 * - Builds derived indices (blocks-by-id, blocksByStateId) from blocksArray
 * - Provides empty stubs for module-level properties that prismarine-block reads
 *   at module evaluation time (legacy.pc.blocks)
 * - Wraps stored data in a diagnostic Proxy that logs once per missing field access
 *
 * @module viewer/meshing/minecraft-data-shim
 */

const dataCache = new Map()

// Track which missing fields have already been warned about (once per field per version)
const warnedFields = new Set()

// Version dataVersion lookup table — populated from server-side extraction.
// Maps version strings (e.g. '1.21.4', '1.16') to dataVersion integers.
// Used by the comparison operators on the version object.
let versionDataVersions = null

function minecraftData (version) {
  const v = normalizeVersion(version)
  if (dataCache.has(v)) return dataCache.get(v)
  throw new Error(
    `[minecraft-data-shim] No data loaded for version '${version}' (normalized: '${v}'). ` +
    `Available versions: [${[...dataCache.keys()].join(', ')}]. ` +
    `Ensure mcData message is sent before version message.`
  )
}

/**
 * Populate the shim with data for a specific version.
 *
 * Reconstructs affordances that are lost during JSON serialization:
 * - version comparison operators (>=, >, <, <=, ==)
 * - supportFeature() closure
 * - blocks-by-id and blocksByStateId derived indices
 *
 * @param {string} version - Minecraft version string (e.g. '1.16.2')
 * @param {object} data - The minecraft-data subset from server extraction
 */
minecraftData.setData = function (version, data) {
  const v = normalizeVersion(version)
  hydrateAffordances(data)
  dataCache.set(v, wrapWithDiagnostics(v, data))
}

/**
 * Store the version→dataVersion lookup table from the server.
 * Must be called before setData() so that version comparison operators work.
 *
 * @param {object} map - { '1.21.4': 4189, '1.16.2': 2578, ... }
 */
minecraftData.setVersionMap = function (map) {
  versionDataVersions = map
}

// ============================================================================
// Module-level stubs — accessed by prismarine-block/registry at import time,
// BEFORE any postMessage handler can run.
// ============================================================================

// prismarine-block/index.js:5-12 reads mcData.legacy.pc.blocks at module top level
// for pre-1.13 block name↔ID conversion. The meshing worker doesn't use legacy
// conversion, so an empty object is safe — lookups return undefined gracefully.
minecraftData.legacy = { pc: { blocks: {} }, bedrock: { blocks: {} } }

// prismarine-registry may probe these
minecraftData.supportFeature = function () { return false }
minecraftData.versions = { pc: [] }

// ============================================================================
// Affordance reconstruction
// ============================================================================

/**
 * Reconstruct methods and derived data that JSON serialization strips.
 *
 * 1. Version comparison operators: >=, >, <, <=, == on the version object
 * 2. supportFeature() closure from the extracted feature map
 * 3. blocks (by ID) index from blocksArray
 * 4. blocksByStateId index from blocksArray
 */
function hydrateAffordances (data) {
  // --- Version comparison operators ---
  if (data.version && typeof data.version === 'object' && versionDataVersions) {
    const selfDV = data.version.dataVersion ?? 0
    const lookup = (other) => {
      const entry = versionDataVersions[other]
      if (entry === undefined) {
        console.warn(`[minecraft-data-shim] Version '${other}' not in versionMap for comparison`)
        return null
      }
      return entry
    }
    data.version['>='] = (other) => { const dv = lookup(other); return dv !== null ? selfDV >= dv : false }
    data.version['>'] = (other) => { const dv = lookup(other); return dv !== null ? selfDV > dv : false }
    data.version['<'] = (other) => { const dv = lookup(other); return dv !== null ? selfDV < dv : false }
    data.version['<='] = (other) => { const dv = lookup(other); return dv !== null ? selfDV <= dv : false }
    data.version['=='] = (other) => { const dv = lookup(other); return dv !== null ? selfDV === dv : false }
  }

  // --- supportFeature closure ---
  if (data._featureMap) {
    const map = data._featureMap
    data.supportFeature = (featureName) => map[featureName] || false
    delete data._featureMap // Clean up transport field
  }

  // --- Derived index: blocks (by numeric ID) ---
  if (data.blocksArray && !data.blocks) {
    data.blocks = {}
    for (const block of data.blocksArray) {
      data.blocks[block.id] = block
    }
  }

  // --- Derived index: blocksByStateId ---
  // Maps every state ID to its parent block. prismarine-block/index.js:125 uses this.
  // ~28k entries for modern versions, derived from blocksArray in O(n) — avoids
  // sending 18.5MB of redundant data over Socket.IO.
  if (data.blocksArray && !data.blocksByStateId) {
    data.blocksByStateId = {}
    for (const block of data.blocksArray) {
      if (typeof block.minStateId === 'number' && typeof block.maxStateId === 'number') {
        for (let s = block.minStateId; s <= block.maxStateId; s++) {
          data.blocksByStateId[s] = block
        }
      }
    }
  }
}

// ============================================================================
// Version normalization
// ============================================================================

function normalizeVersion (version) {
  if (typeof version === 'object' && version.version) {
    return String(version.version)
  }
  return String(version).replace(/^pc_/, '')
}

// ============================================================================
// Diagnostic Proxy
// ============================================================================

/**
 * Wrap a data object in a Proxy that logs a diagnostic warning (once per field)
 * when code accesses a property that wasn't included in the server-side extraction.
 *
 * Turns "undefined is not an object" deep inside prismarine-registry into:
 *   [minecraft-data-shim] mcData('1.21.4').protocol is undefined — add it to mineflayer.js extraction
 */
function wrapWithDiagnostics (version, data) {
  const silentProperties = new Set([
    'then', 'toJSON', 'constructor', 'hasOwnProperty',
    'toString', 'valueOf', 'length', '__proto__',
    Symbol.toPrimitive, Symbol.toStringTag, Symbol.iterator,
  ])

  return new Proxy(data, {
    get (target, prop, receiver) {
      if (prop in target || typeof prop === 'symbol' || silentProperties.has(prop)) {
        return Reflect.get(target, prop, receiver)
      }
      const key = `${version}:${String(prop)}`
      if (!warnedFields.has(key)) {
        warnedFields.add(key)
        console.warn(
          `[minecraft-data-shim] mcData('${version}').${String(prop)} is undefined — ` +
          `add it to the extraction in mineflayer.js socket.emit('mcData', ...)`
        )
      }
      return undefined
    }
  })
}

// Named exports are required for Vite's CJS interop (`getAugmentedNamespace`).
// When CJS code does `require('minecraft-data')`, Vite creates a wrapper object
// and copies named exports to it via `Object.keys(module)`. Properties set on
// the default export function (like `.legacy`) are NOT copied — only named
// exports from the ESM module namespace appear in `Object.keys()`.
//
// Without these, prismarine-block's top-level `mcData.legacy.pc.blocks` throws
// "Cannot read properties of undefined (reading 'pc')".
export const legacy = minecraftData.legacy
export const supportFeature = minecraftData.supportFeature
export const versions = minecraftData.versions
export const setData = minecraftData.setData
export const setVersionMap = minecraftData.setVersionMap

export default minecraftData
