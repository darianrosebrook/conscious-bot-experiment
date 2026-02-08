import { Vec3 } from 'vec3'
import mcData from 'minecraft-data'

// Tints are loaded lazily because in the worker bundle, minecraft-data is replaced
// by a shim that must be populated via postMessage BEFORE any data access. Top-level
// calls like `mcData('1.16.2')` would fail because postMessage hasn't fired yet at
// module evaluation time.
let tints = null

function getTints () {
  if (tints) return tints
  tints = mcData('1.16.2').tints
  for (const key of Object.keys(tints)) {
    tints[key] = prepareTints(tints[key])
  }
  return tints
}

function prepareTints (tints) {
  const map = new Map()
  const defaultValue = tintToGl(tints.default)
  for (let { keys, color } of tints.data) {
    color = tintToGl(color)
    for (const key of keys) {
      map.set(`${key}`, color)
    }
  }
  return new Proxy(map, {
    get: (target, key) => {
      return target.has(key) ? target.get(key) : defaultValue
    }
  })
}

function tintToGl (tint) {
  const r = (tint >> 16) & 0xff
  const g = (tint >> 8) & 0xff
  const b = tint & 0xff
  return [r / 255, g / 255, b / 255]
}

// Minecraft light curve: maps light level 0-15 to brightness multiplier.
// The shader already applies its own ambient+directional lighting on top of vColor,
// so we use a compressed range to avoid double-darkening. Level 0 gets a high floor
// (0.25) and the curve is gentle (exponent 1.2) so that shadows are visible but
// not crushed when composed with the shader's day/night dimming.
const LIGHT_TABLE = new Float32Array(16)
for (let i = 0; i < 16; i++) {
  LIGHT_TABLE[i] = 0.25 + 0.75 * Math.pow(i / 15, 1.2)
}

function sampleFaceLight (world, cursor, dir) {
  const neighborPos = cursor.offset(dir[0], dir[1], dir[2])
  const blockLight = world.getBlockLight(neighborPos)
  const skyLight = world.getSkyLight(neighborPos)
  const combined = Math.max(blockLight, skyLight)
  return LIGHT_TABLE[combined]
}

const elemFaces = {
  up: {
    dir: [0, 1, 0],
    mask1: [1, 1, 0],
    mask2: [0, 1, 1],
    corners: [
      [0, 1, 1, 0, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 0, 0, 0],
      [1, 1, 0, 1, 0]
    ]
  },
  down: {
    dir: [0, -1, 0],
    mask1: [1, 1, 0],
    mask2: [0, 1, 1],
    corners: [
      [1, 0, 1, 0, 1],
      [0, 0, 1, 1, 1],
      [1, 0, 0, 0, 0],
      [0, 0, 0, 1, 0]
    ]
  },
  east: {
    dir: [1, 0, 0],
    mask1: [1, 1, 0],
    mask2: [1, 0, 1],
    corners: [
      [1, 1, 1, 0, 0],
      [1, 0, 1, 0, 1],
      [1, 1, 0, 1, 0],
      [1, 0, 0, 1, 1]
    ]
  },
  west: {
    dir: [-1, 0, 0],
    mask1: [1, 1, 0],
    mask2: [1, 0, 1],
    corners: [
      [0, 1, 0, 0, 0],
      [0, 0, 0, 0, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 1, 1]
    ]
  },
  north: {
    dir: [0, 0, -1],
    mask1: [1, 0, 1],
    mask2: [0, 1, 1],
    corners: [
      [1, 0, 0, 0, 1],
      [0, 0, 0, 1, 1],
      [1, 1, 0, 0, 0],
      [0, 1, 0, 1, 0]
    ]
  },
  south: {
    dir: [0, 0, 1],
    mask1: [1, 0, 1],
    mask2: [0, 1, 1],
    corners: [
      [0, 0, 1, 0, 1],
      [1, 0, 1, 1, 1],
      [0, 1, 1, 0, 0],
      [1, 1, 1, 1, 0]
    ]
  }
}

function getLiquidRenderHeight (world, block, type) {
  if (!block || block.type !== type) return 1 / 9
  if (block.metadata === 0) { // source block
    const blockAbove = world.getBlock(block.position.offset(0, 1, 0))
    if (blockAbove && blockAbove.type === type) return 1
    return 8 / 9
  }
  return ((block.metadata >= 8 ? 8 : 7 - block.metadata) + 1) / 9
}

function renderLiquid (world, cursor, texture, type, biome, water, attr) {
  const heights = []
  for (let z = -1; z <= 1; z++) {
    for (let x = -1; x <= 1; x++) {
      heights.push(getLiquidRenderHeight(world, world.getBlock(cursor.offset(x, 0, z)), type))
    }
  }
  const cornerHeights = [
    Math.max(Math.max(heights[0], heights[1]), Math.max(heights[3], heights[4])),
    Math.max(Math.max(heights[1], heights[2]), Math.max(heights[4], heights[5])),
    Math.max(Math.max(heights[3], heights[4]), Math.max(heights[6], heights[7])),
    Math.max(Math.max(heights[4], heights[5]), Math.max(heights[7], heights[8]))
  ]

  for (const face in elemFaces) {
    const { dir, corners } = elemFaces[face]
    const isUp = dir[1] === 1

    const neighbor = world.getBlock(cursor.offset(...dir))
    if (!neighbor) continue
    if (neighbor.type === type) continue
    if ((neighbor.isCube && !isUp) || neighbor.material === 'plant' || neighbor.getProperties().waterlogged) continue
    if (neighbor.position.y < 0) continue

    let tint = [1, 1, 1]
    if (water) {
      let m = 1 // Fake lighting to improve lisibility
      if (Math.abs(dir[0]) > 0) m = 0.75
      else if (Math.abs(dir[2]) > 0) m = 0.85
      tint = getTints().water[biome]
      tint = [tint[0] * m, tint[1] * m, tint[2] * m]
    }

    // Per-block lighting: sample light from the neighbor block this face is exposed to
    const faceLight = sampleFaceLight(world, cursor, dir)
    tint = [tint[0] * faceLight, tint[1] * faceLight, tint[2] * faceLight]

    const u = texture.u
    const v = texture.v
    const su = texture.su
    const sv = texture.sv

    for (const pos of corners) {
      const height = cornerHeights[pos[2] * 2 + pos[0]]
      attr.t_positions.push(
        (pos[0] ? 1 : 0) + (cursor.x & 15) - 8,
        (pos[1] ? height : 0) + (cursor.y & 15) - 8,
        (pos[2] ? 1 : 0) + (cursor.z & 15) - 8)
      attr.t_normals.push(...dir)
      attr.t_uvs.push(pos[3] * su + u, pos[4] * sv * (pos[1] ? 1 : height) + v)
      attr.t_colors.push(tint[0], tint[1], tint[2])
    }
  }
}

function vecadd3 (a, b) {
  if (!b) return a
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function vecsub3 (a, b) {
  if (!b) return a
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function matmul3 (matrix, vector) {
  if (!matrix) return vector
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2]
  ]
}

function matmulmat3 (a, b) {
  const te = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]

  const a11 = a[0][0]; const a12 = a[1][0]; const a13 = a[2][0]
  const a21 = a[0][1]; const a22 = a[1][1]; const a23 = a[2][1]
  const a31 = a[0][2]; const a32 = a[1][2]; const a33 = a[2][2]

  const b11 = b[0][0]; const b12 = b[1][0]; const b13 = b[2][0]
  const b21 = b[0][1]; const b22 = b[1][1]; const b23 = b[2][1]
  const b31 = b[0][2]; const b32 = b[1][2]; const b33 = b[2][2]

  te[0][0] = a11 * b11 + a12 * b21 + a13 * b31
  te[1][0] = a11 * b12 + a12 * b22 + a13 * b32
  te[2][0] = a11 * b13 + a12 * b23 + a13 * b33

  te[0][1] = a21 * b11 + a22 * b21 + a23 * b31
  te[1][1] = a21 * b12 + a22 * b22 + a23 * b32
  te[2][1] = a21 * b13 + a22 * b23 + a23 * b33

  te[0][2] = a31 * b11 + a32 * b21 + a33 * b31
  te[1][2] = a31 * b12 + a32 * b22 + a33 * b32
  te[2][2] = a31 * b13 + a32 * b23 + a33 * b33

  return te
}

function buildRotationMatrix (axis, degree) {
  const radians = degree / 180 * Math.PI
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)

  const axis0 = { x: 0, y: 1, z: 2 }[axis]
  const axis1 = (axis0 + 1) % 3
  const axis2 = (axis0 + 2) % 3

  const matrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ]

  matrix[axis0][axis0] = 1
  matrix[axis1][axis1] = cos
  matrix[axis1][axis2] = -sin
  matrix[axis2][axis1] = +sin
  matrix[axis2][axis2] = cos

  return matrix
}

function renderElement (world, cursor, element, doAO, attr, globalMatrix, globalShift, block, biome) {
  const cullIfIdentical = block.name.indexOf('glass') >= 0

  for (const face in element.faces) {
    const eFace = element.faces[face]
    const { corners, mask1, mask2 } = elemFaces[face]
    const dir = matmul3(globalMatrix, elemFaces[face].dir)

    if (eFace.cullface) {
      const neighbor = world.getBlock(cursor.plus(new Vec3(...dir)))
      if (!neighbor) continue
      if (cullIfIdentical && neighbor.type === block.type) continue
      if (!neighbor.transparent && neighbor.isCube) continue
    }

    const minx = element.from[0]
    const miny = element.from[1]
    const minz = element.from[2]
    const maxx = element.to[0]
    const maxy = element.to[1]
    const maxz = element.to[2]

    const u = eFace.texture.u
    const v = eFace.texture.v
    const su = eFace.texture.su
    const sv = eFace.texture.sv

    const ndx = Math.floor(attr.positions.length / 3)

    // Per-block lighting: sample light from the neighbor block this face is exposed to
    const faceLight = sampleFaceLight(world, cursor, dir)

    let tint = [1, 1, 1]
    if (eFace.tintindex !== undefined) {
      if (eFace.tintindex === 0) {
        if (block.name === 'redstone_wire') {
          tint = getTints().redstone[`${block.getProperties().power}`]
        } else if (block.name === 'birch_leaves' ||
          block.name === 'spruce_leaves' ||
          block.name === 'lily_pad') {
          tint = getTints().constant[block.name]
        } else if (block.name.includes('leaves') || block.name === 'vine') {
          tint = getTints().foliage[biome]
        } else {
          tint = getTints().grass[biome]
        }
      }
    }

    // UV rotation
    const r = eFace.rotation || 0
    const uvcs = Math.cos(r * Math.PI / 180)
    const uvsn = -Math.sin(r * Math.PI / 180)

    let localMatrix = null
    let localShift = null

    if (element.rotation) {
      localMatrix = buildRotationMatrix(
        element.rotation.axis,
        element.rotation.angle
      )

      localShift = vecsub3(
        element.rotation.origin,
        matmul3(
          localMatrix,
          element.rotation.origin
        )
      )
    }

    const aos = []
    for (const pos of corners) {
      let vertex = [
        (pos[0] ? maxx : minx),
        (pos[1] ? maxy : miny),
        (pos[2] ? maxz : minz)
      ]

      vertex = vecadd3(matmul3(localMatrix, vertex), localShift)
      vertex = vecadd3(matmul3(globalMatrix, vertex), globalShift)
      vertex = vertex.map(v => v / 16)

      attr.positions.push(
        vertex[0] + (cursor.x & 15) - 8,
        vertex[1] + (cursor.y & 15) - 8,
        vertex[2] + (cursor.z & 15) - 8
      )

      attr.normals.push(...dir)

      const baseu = (pos[3] - 0.5) * uvcs - (pos[4] - 0.5) * uvsn + 0.5
      const basev = (pos[3] - 0.5) * uvsn + (pos[4] - 0.5) * uvcs + 0.5
      attr.uvs.push(baseu * su + u, basev * sv + v)

      let light = 1
      if (doAO) {
        const dx = pos[0] * 2 - 1
        const dy = pos[1] * 2 - 1
        const dz = pos[2] * 2 - 1
        const cornerDir = matmul3(globalMatrix, [dx, dy, dz])
        const side1Dir = matmul3(globalMatrix, [dx * mask1[0], dy * mask1[1], dz * mask1[2]])
        const side2Dir = matmul3(globalMatrix, [dx * mask2[0], dy * mask2[1], dz * mask2[2]])
        const side1 = world.getBlock(cursor.offset(...side1Dir))
        const side2 = world.getBlock(cursor.offset(...side2Dir))
        const corner = world.getBlock(cursor.offset(...cornerDir))

        const side1Block = (side1 && side1.isCube) ? 1 : 0
        const side2Block = (side2 && side2.isCube) ? 1 : 0
        const cornerBlock = (corner && corner.isCube) ? 1 : 0

        // TODO: correctly interpolate ao light based on pos (evaluate once for each corner of the block)

        const ao = (side1Block && side2Block) ? 0 : (3 - (side1Block + side2Block + cornerBlock))
        // Softened AO: floor of 0.4 instead of 0.25 to avoid over-darkening
        light = 0.4 + (ao / 3) * 0.6
        aos.push(ao)
      }

      // Multiply per-block lighting into the vertex color
      light *= faceLight

      attr.colors.push(tint[0] * light, tint[1] * light, tint[2] * light)
    }

    if (doAO && aos[0] + aos[3] >= aos[1] + aos[2]) {
      attr.indices.push(
        ndx, ndx + 3, ndx + 2,
        ndx, ndx + 1, ndx + 3
      )
    } else {
      attr.indices.push(
        ndx, ndx + 1, ndx + 2,
        ndx + 2, ndx + 1, ndx + 3
      )
    }
  }
}

function getSectionGeometry (sx, sy, sz, world, blocksStates) {
  const attr = {
    sx: sx + 8,
    sy: sy + 8,
    sz: sz + 8,
    positions: [],
    normals: [],
    colors: [],
    uvs: [],
    t_positions: [],
    t_normals: [],
    t_colors: [],
    t_uvs: [],
    indices: []
  }

  const cursor = new Vec3(0, 0, 0)
  for (cursor.y = sy; cursor.y < sy + 16; cursor.y++) {
    for (cursor.z = sz; cursor.z < sz + 16; cursor.z++) {
      for (cursor.x = sx; cursor.x < sx + 16; cursor.x++) {
        const block = world.getBlock(cursor)
        const biome = block.biome.name
        if (block.variant === undefined) {
          block.variant = getModelVariants(block, blocksStates)
        }

        for (const variant of block.variant) {
          if (!variant || !variant.model) continue

          if (block.name === 'water') {
            renderLiquid(world, cursor, variant.model.textures.particle, block.type, biome, true, attr)
          } else if (block.name === 'lava') {
            renderLiquid(world, cursor, variant.model.textures.particle, block.type, biome, false, attr)
          } else {
            let globalMatrix = null
            let globalShift = null

            for (const axis of ['x', 'y', 'z']) {
              if (axis in variant) {
                if (!globalMatrix) globalMatrix = buildRotationMatrix(axis, -variant[axis])
                else globalMatrix = matmulmat3(globalMatrix, buildRotationMatrix(axis, -variant[axis]))
              }
            }

            if (globalMatrix) {
              globalShift = [8, 8, 8]
              globalShift = vecsub3(globalShift, matmul3(globalMatrix, globalShift))
            }

            for (const element of variant.model.elements) {
              renderElement(world, cursor, element, variant.model.ao, attr, globalMatrix, globalShift, block, biome)
            }
          }
        }
      }
    }
  }

  // Greedy meshing post-pass: merge coplanar UP-facing opaque quads before
  // appending transparent faces. Must run while arrays are still JS arrays.
  const greedyEnabled = typeof globalThis.__GREEDY_MESHING !== 'undefined'
    ? globalThis.__GREEDY_MESHING
    : GREEDY_MESHING
  if (greedyEnabled) {
    greedyMergeUpFaces(attr)
  }

  let ndx = attr.positions.length / 3
  for (let i = 0; i < attr.t_positions.length / 12; i++) {
    attr.indices.push(
      ndx, ndx + 1, ndx + 2,
      ndx + 2, ndx + 1, ndx + 3,
      // back face
      ndx, ndx + 2, ndx + 1,
      ndx + 2, ndx + 3, ndx + 1
    )
    ndx += 4
  }

  attr.positions.push(...attr.t_positions)
  attr.normals.push(...attr.t_normals)
  attr.colors.push(...attr.t_colors)
  attr.uvs.push(...attr.t_uvs)

  delete attr.t_positions
  delete attr.t_normals
  delete attr.t_colors
  delete attr.t_uvs

  attr.positions = new Float32Array(attr.positions)
  attr.normals = new Float32Array(attr.normals)
  attr.colors = new Float32Array(attr.colors)
  attr.uvs = new Float32Array(attr.uvs)

  return attr
}

function parseProperties (properties) {
  if (typeof properties === 'object') { return properties }

  const json = {}
  for (const prop of properties.split(',')) {
    const [key, value] = prop.split('=')
    json[key] = value
  }
  return json
}

function matchProperties (block, properties) {
  if (!properties) { return true }

  properties = parseProperties(properties)
  const blockProps = block.getProperties()
  if (properties.OR) {
    return properties.OR.some((or) => matchProperties(block, or))
  }
  for (const prop in blockProps) {
    if (typeof properties[prop] === 'string' && !properties[prop].split('|').some((value) => value === blockProps[prop] + '')) {
      return false
    }
  }
  return true
}

function getModelVariants (block, blockStates) {
  // air, cave_air, void_air and so on...
  if (block.name.includes('air')) return []
  const state = blockStates[block.name] ?? blockStates.missing_texture
  if (!state) return []
  if (state.variants) {
    for (const [properties, variant] of Object.entries(state.variants)) {
      if (!matchProperties(block, properties)) continue
      if (variant instanceof Array) return [variant[0]]
      return [variant]
    }
  }
  if (state.multipart) {
    const parts = state.multipart.filter(multipart => matchProperties(block, multipart.when))
    let variants = []
    for (const part of parts) {
      if (part.apply instanceof Array) {
        variants = [...variants, ...part.apply]
      } else {
        variants = [...variants, part.apply]
      }
    }

    return variants
  }

  return []
}

// ============================================================================
// GREEDY MESHING — UP-face merging (Phase 3a)
// ============================================================================

// Feature flag: opt-in via browser console `globalThis.__GREEDY_MESHING = true`
// then reload chunks. Disabled by default for safe rollout.
const GREEDY_MESHING = typeof globalThis.__GREEDY_MESHING !== 'undefined'
  ? globalThis.__GREEDY_MESHING
  : false

/**
 * Greedy-merge coplanar UP-facing quads (normal = 0,1,0) within each Y layer.
 * Only merges quads with identical texture UV tile, tint color, and uniform AO.
 *
 * Operates on the raw attribute arrays in-place: replaces N small quads with
 * fewer large quads. Transparent faces (t_*) are never touched.
 *
 * @param {object} attr - The section geometry attribute object (positions, normals, colors, uvs, indices arrays — still JS arrays, not Float32Array yet)
 */
function greedyMergeUpFaces (attr) {
  const positions = attr.positions
  const normals = attr.normals
  const colors = attr.colors
  const uvs = attr.uvs

  // Each opaque quad = 4 vertices = 12 position floats.
  // Transparent quads have already been appended; we only process up to the
  // original opaque count tracked before transparent merge.
  const quadCount = positions.length / 12

  if (quadCount === 0) return

  // Identify UP-facing quads (normal Y=1, X=0, Z=0) that are full-block-face
  // candidates for merging. A quad is mergeable if:
  //   - normal is exactly (0, 1, 0)
  //   - all 4 AO corners have the same color (uniform AO)
  //   - it occupies a 1×1 cell in the 16×16 grid at its Y level

  // Group quads by Y layer. Key: Y position (integer). Value: array of quad descriptors.
  const layerQuads = {}

  for (let q = 0; q < quadCount; q++) {
    const base = q * 12 // position offset
    const nbase = q * 12 // normal offset (same stride)

    // Check normal — must be (0, 1, 0) for all 4 vertices
    let isUp = true
    for (let v = 0; v < 4; v++) {
      const ni = nbase + v * 3
      if (normals[ni] !== 0 || normals[ni + 1] !== 1 || normals[ni + 2] !== 0) {
        isUp = false
        break
      }
    }
    if (!isUp) continue

    // Check uniform AO/color: all 4 vertices must have same color
    const cbase = q * 12 // color offset
    const r0 = colors[cbase], g0 = colors[cbase + 1], b0 = colors[cbase + 2]
    let uniformColor = true
    for (let v = 1; v < 4; v++) {
      const ci = cbase + v * 3
      if (colors[ci] !== r0 || colors[ci + 1] !== g0 || colors[ci + 2] !== b0) {
        uniformColor = false
        break
      }
    }
    if (!uniformColor) continue

    // Extract grid position from vertex positions.
    // Positions are in section-local coords: x + (cursor.x & 15) - 8
    // For UP face, corners are at: (minX, Y, maxZ), (maxX, Y, maxZ), (minX, Y, minZ), (maxX, Y, minZ)
    // We need the min corner to identify the grid cell.
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    let y = positions[base + 1] // all 4 corners share same Y for UP face
    for (let v = 0; v < 4; v++) {
      const px = positions[base + v * 3]
      const pz = positions[base + v * 3 + 2]
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (pz < minZ) minZ = pz
      if (pz > maxZ) maxZ = pz
    }

    // Only merge full 1×1 block faces (width=1, depth=1 in section coords)
    const w = maxX - minX
    const d = maxZ - minZ
    if (Math.abs(w - 1) > 0.01 || Math.abs(d - 1) > 0.01) continue

    // Grid cell: offset back to 0..15 range
    const gx = Math.round(minX + 8)
    const gz = Math.round(minZ + 8)
    if (gx < 0 || gx > 15 || gz < 0 || gz > 15) continue

    // Extract UV tile: use the UV of the first vertex to identify the texture tile.
    // We'll store the full UV quad info for reconstruction.
    const ubase = q * 8
    const u0 = uvs[ubase], v0 = uvs[ubase + 1]
    const u1 = uvs[ubase + 2], v1 = uvs[ubase + 3]
    const u2 = uvs[ubase + 4], v2 = uvs[ubase + 5]
    const u3 = uvs[ubase + 6], v3 = uvs[ubase + 7]

    // Compute UV tile span (su, sv) and origin
    // For UP face corners: (0,1), (1,1), (0,0), (1,0) mapped to (u,v)
    // So tile origin = u2,v2 (the 0,0 corner) and span = u3-u2, v0-v2
    const tileU = u2
    const tileV = v2
    const tileSU = u3 - u2
    const tileSV = v0 - v2

    // Build a key for "can these quads merge?" — same Y, color, UV tile
    const colorKey = `${r0.toFixed(4)},${g0.toFixed(4)},${b0.toFixed(4)}`
    const tileKey = `${tileU.toFixed(6)},${tileV.toFixed(6)},${tileSU.toFixed(6)},${tileSV.toFixed(6)}`

    const yKey = y.toFixed(2)
    if (!layerQuads[yKey]) layerQuads[yKey] = []

    layerQuads[yKey].push({
      quadIndex: q,
      gx, gz,
      y,
      r: r0, g: g0, b: b0,
      tileU, tileV, tileSU, tileSV,
      mergeKey: `${colorKey}|${tileKey}`,
      merged: false
    })
  }

  // For each Y layer, run greedy rectangle finding
  const newQuads = [] // replacement quads
  const removedQuadIndices = new Set()

  for (const yKey of Object.keys(layerQuads)) {
    const quads = layerQuads[yKey]

    // Group by merge key
    const groups = {}
    for (const q of quads) {
      if (!groups[q.mergeKey]) groups[q.mergeKey] = []
      groups[q.mergeKey].push(q)
    }

    for (const key of Object.keys(groups)) {
      const group = groups[key]

      // Build 16×16 occupancy grid
      const grid = new Array(16 * 16).fill(null)
      for (const q of group) {
        grid[q.gz * 16 + q.gx] = q
      }

      // Greedy rectangle sweep
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const q = grid[z * 16 + x]
          if (!q || q.merged) continue

          // Extend width (x direction)
          let w = 1
          while (x + w < 16) {
            const neighbor = grid[z * 16 + x + w]
            if (!neighbor || neighbor.merged) break
            w++
          }

          // Extend height (z direction), checking full row width
          let h = 1
          outer:
          while (z + h < 16) {
            for (let dx = 0; dx < w; dx++) {
              const neighbor = grid[(z + h) * 16 + x + dx]
              if (!neighbor || neighbor.merged) break outer
            }
            h++
          }

          // Mark all quads in rectangle as merged
          for (let dz = 0; dz < h; dz++) {
            for (let dx = 0; dx < w; dx++) {
              const mq = grid[(z + dz) * 16 + x + dx]
              mq.merged = true
              removedQuadIndices.add(mq.quadIndex)
            }
          }

          // If only 1 quad, no benefit — skip creating a replacement
          if (w === 1 && h === 1) {
            removedQuadIndices.delete(q.quadIndex)
            continue
          }

          // Create merged quad: positions in section-local coords
          const minX = x - 8
          const maxX = x + w - 8
          const minZ = z - 8
          const maxZ = z + h - 8
          const y = q.y

          // UP face corners: (minX,y,maxZ), (maxX,y,maxZ), (minX,y,minZ), (maxX,y,minZ)
          newQuads.push({
            positions: [
              minX, y, maxZ,
              maxX, y, maxZ,
              minX, y, minZ,
              maxX, y, minZ
            ],
            normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
            colors: [q.r, q.g, q.b, q.r, q.g, q.b, q.r, q.g, q.b, q.r, q.g, q.b],
            // Tile UVs for the merged rectangle — the texture repeats across w×h cells
            uvs: [
              q.tileU, q.tileV + q.tileSV * h,                       // corner 0: (0, h)
              q.tileU + q.tileSU * w, q.tileV + q.tileSV * h,        // corner 1: (w, h)
              q.tileU, q.tileV,                                       // corner 2: (0, 0)
              q.tileU + q.tileSU * w, q.tileV                         // corner 3: (w, 0)
            ]
          })
        }
      }
    }
  }

  if (removedQuadIndices.size === 0) return

  // Rebuild attribute arrays, skipping removed quads and appending new ones.
  // We must also remap indices to preserve AO-aware winding on non-UP quads.
  const beforeQuads = quadCount
  const newPositions = []
  const newNormals = []
  const newColors = []
  const newUvs = []
  const newIndices = []
  const oldIndices = attr.indices

  // Map old quad index → new vertex base offset
  let newVertexBase = 0
  for (let q = 0; q < quadCount; q++) {
    if (removedQuadIndices.has(q)) continue
    const pb = q * 12, nb = q * 12, cb = q * 12, ub = q * 8
    for (let i = 0; i < 12; i++) newPositions.push(positions[pb + i])
    for (let i = 0; i < 12; i++) newNormals.push(normals[nb + i])
    for (let i = 0; i < 12; i++) newColors.push(colors[cb + i])
    for (let i = 0; i < 8; i++) newUvs.push(uvs[ub + i])

    // Preserve original index winding (may be AO-flipped) by remapping
    const oldBase = q * 4
    const idxOffset = q * 6 // 6 indices per quad in the index array
    if (idxOffset + 5 < oldIndices.length) {
      for (let i = 0; i < 6; i++) {
        newIndices.push(oldIndices[idxOffset + i] - oldBase + newVertexBase)
      }
    } else {
      // Fallback: standard winding
      newIndices.push(
        newVertexBase, newVertexBase + 1, newVertexBase + 2,
        newVertexBase + 2, newVertexBase + 1, newVertexBase + 3
      )
    }
    newVertexBase += 4
  }

  // Append merged quads (always standard winding — uniform AO)
  for (const mq of newQuads) {
    newPositions.push(...mq.positions)
    newNormals.push(...mq.normals)
    newColors.push(...mq.colors)
    newUvs.push(...mq.uvs)
    newIndices.push(
      newVertexBase, newVertexBase + 1, newVertexBase + 2,
      newVertexBase + 2, newVertexBase + 1, newVertexBase + 3
    )
    newVertexBase += 4
  }

  // Replace arrays
  attr.positions = newPositions
  attr.normals = newNormals
  attr.colors = newColors
  attr.uvs = newUvs
  attr.indices = newIndices

  const afterQuads = newPositions.length / 12
  if (typeof console !== 'undefined' && beforeQuads !== afterQuads) {
    console.log('Greedy merge:', beforeQuads, '->', afterQuads, '(' + removedQuadIndices.size + ' quads merged into ' + newQuads.length + ')')
  }
}

export { getSectionGeometry }
