/**
 * Entity.js - Modified for skeletal animation support
 *
 * Changes from original prismarine-viewer:
 * 1. getMesh() accepts entityType parameter
 * 2. Stores bone names in mesh.userData.bonesByName
 * 3. Stores skeleton reference in mesh.userData.skeleton
 * 4. Stores initial bone rotations for animation reset
 * 5. Entity class tracks skinned meshes for animation
 *
 * @module viewer/entities/Entity
 */

/* global THREE */

const entities = require('./entities.json')
const { loadTexture } = globalThis.isElectron ? require('../utils/utils.electron.js') : require('../utils/utils.web')

// Material cache: same texture path → shared MeshLambertMaterial.
// Textures are already cached in utils.web.js; this avoids creating duplicate
// materials (and therefore duplicate draw calls) for entities with the same skin.
const materialCache = {}

const elemFaces = {
  up: {
    dir: [0, 1, 0],
    u0: [0, 0, 1],
    v0: [0, 0, 0],
    u1: [1, 0, 1],
    v1: [0, 0, 1],
    corners: [
      [0, 1, 1, 0, 0],
      [1, 1, 1, 1, 0],
      [0, 1, 0, 0, 1],
      [1, 1, 0, 1, 1]
    ]
  },
  down: {
    dir: [0, -1, 0],
    u0: [1, 0, 1],
    v0: [0, 0, 0],
    u1: [2, 0, 1],
    v1: [0, 0, 1],
    corners: [
      [1, 0, 1, 0, 0],
      [0, 0, 1, 1, 0],
      [1, 0, 0, 0, 1],
      [0, 0, 0, 1, 1]
    ]
  },
  east: {
    dir: [1, 0, 0],
    u0: [0, 0, 0],
    v0: [0, 0, 1],
    u1: [0, 0, 1],
    v1: [0, 1, 1],
    corners: [
      [1, 1, 1, 0, 0],
      [1, 0, 1, 0, 1],
      [1, 1, 0, 1, 0],
      [1, 0, 0, 1, 1]
    ]
  },
  west: {
    dir: [-1, 0, 0],
    u0: [1, 0, 1],
    v0: [0, 0, 1],
    u1: [1, 0, 2],
    v1: [0, 1, 1],
    corners: [
      [0, 1, 0, 0, 0],
      [0, 0, 0, 0, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 1, 1]
    ]
  },
  north: {
    dir: [0, 0, -1],
    u0: [0, 0, 1],
    v0: [0, 0, 1],
    u1: [1, 0, 1],
    v1: [0, 1, 1],
    corners: [
      [1, 0, 0, 0, 1],
      [0, 0, 0, 1, 1],
      [1, 1, 0, 0, 0],
      [0, 1, 0, 1, 0]
    ]
  },
  south: {
    dir: [0, 0, 1],
    u0: [1, 0, 2],
    v0: [0, 0, 1],
    u1: [2, 0, 2],
    v1: [0, 1, 1],
    corners: [
      [0, 0, 1, 0, 1],
      [1, 0, 1, 1, 1],
      [0, 1, 1, 0, 0],
      [1, 1, 1, 1, 0]
    ]
  }
}

function dot (a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function addCube (attr, boneId, bone, cube, texWidth = 64, texHeight = 64) {
  const cubeRotation = new THREE.Euler(0, 0, 0)
  if (cube.rotation) {
    cubeRotation.x = -cube.rotation[0] * Math.PI / 180
    cubeRotation.y = -cube.rotation[1] * Math.PI / 180
    cubeRotation.z = -cube.rotation[2] * Math.PI / 180
  }
  for (const { dir, corners, u0, v0, u1, v1 } of Object.values(elemFaces)) {
    const ndx = Math.floor(attr.positions.length / 3)

    for (const pos of corners) {
      const u = (cube.uv[0] + dot(pos[3] ? u1 : u0, cube.size)) / texWidth
      const v = (cube.uv[1] + dot(pos[4] ? v1 : v0, cube.size)) / texHeight

      const inflate = cube.inflate ? cube.inflate : 0
      let vecPos = new THREE.Vector3(
        cube.origin[0] + pos[0] * cube.size[0] + (pos[0] ? inflate : -inflate),
        cube.origin[1] + pos[1] * cube.size[1] + (pos[1] ? inflate : -inflate),
        cube.origin[2] + pos[2] * cube.size[2] + (pos[2] ? inflate : -inflate)
      )

      // Apply cube-level rotation around the cube's own pivot (per-cube, not per-bone)
      vecPos = vecPos.applyEuler(cubeRotation)
      // Convert from model-space to bone-local space.
      // Do NOT apply bone.rotation here — the skeleton system applies bone
      // rotations at render time via the skinning pass. Baking bone rotation
      // into the geometry causes a double-transform: once baked, once by GPU skinning.
      vecPos = vecPos.sub(bone.position)

      attr.positions.push(vecPos.x, vecPos.y, vecPos.z)
      attr.normals.push(...dir)
      attr.uvs.push(u, v)
      attr.skinIndices.push(boneId, 0, 0, 0)
      attr.skinWeights.push(1, 0, 0, 0)
    }

    attr.indices.push(
      ndx, ndx + 1, ndx + 2,
      ndx + 2, ndx + 1, ndx + 3
    )
  }
}

/**
 * Create a mesh for an entity model.
 *
 * MODIFIED: Now accepts entityType and stores animation data in userData.
 *
 * @param {string} texture - Path to the texture file
 * @param {object} jsonModel - The entity model definition
 * @param {string} entityType - The Minecraft entity type (e.g., 'zombie')
 * @returns {THREE.SkinnedMesh}
 */
function getMesh (texture, jsonModel, entityType) {
  const bones = {}
  const bonesByName = {} // Named lookup for animation system

  // Some entities in entities.json have undefined texturewidth/textureheight
  // (bat, player, sheep, snow_golem, villager, wandering_trader).
  // Default to 64x64 which is the standard Minecraft entity texture size.
  const texWidth = jsonModel.texturewidth || 64
  const texHeight = jsonModel.textureheight || 64

  const geoData = {
    positions: [],
    normals: [],
    uvs: [],
    indices: [],
    skinIndices: [],
    skinWeights: []
  }
  let i = 0
  for (const jsonBone of jsonModel.bones) {
    const bone = new THREE.Bone()
    bone.name = jsonBone.name // Store bone name for animation lookups
    if (jsonBone.pivot) {
      bone.position.x = jsonBone.pivot[0]
      bone.position.y = jsonBone.pivot[1]
      bone.position.z = jsonBone.pivot[2]
    }
    if (jsonBone.bind_pose_rotation) {
      bone.rotation.x = -jsonBone.bind_pose_rotation[0] * Math.PI / 180
      bone.rotation.y = -jsonBone.bind_pose_rotation[1] * Math.PI / 180
      bone.rotation.z = -jsonBone.bind_pose_rotation[2] * Math.PI / 180
    } else if (jsonBone.rotation) {
      bone.rotation.x = -jsonBone.rotation[0] * Math.PI / 180
      bone.rotation.y = -jsonBone.rotation[1] * Math.PI / 180
      bone.rotation.z = -jsonBone.rotation[2] * Math.PI / 180
    }
    // Store initial rotation for animation reset
    bone.userData.initialRotation = {
      x: bone.rotation.x,
      y: bone.rotation.y,
      z: bone.rotation.z
    }
    bones[jsonBone.name] = bone
    bonesByName[jsonBone.name] = bone

    if (jsonBone.cubes) {
      for (const cube of jsonBone.cubes) {
        addCube(geoData, i, bone, cube, texWidth, texHeight)
      }
    }
    i++
  }

  // Store absolute pivots before the parenting pass. Once we start making
  // child positions relative to their parents, the .position values change,
  // so deep chains (e.g. cat: body → tail1 → tail2) would subtract an
  // already-modified parent position instead of the original absolute pivot.
  const absolutePivots = {}
  for (const jsonBone of jsonModel.bones) {
    absolutePivots[jsonBone.name] = bones[jsonBone.name].position.clone()
  }

  const rootBones = []
  for (const jsonBone of jsonModel.bones) {
    if (jsonBone.parent) {
      bones[jsonBone.parent].add(bones[jsonBone.name])
      // Convert absolute model-space pivot to parent-relative position.
      // Use stored absolute pivots so this works at any hierarchy depth.
      bones[jsonBone.name].position.copy(
        absolutePivots[jsonBone.name].clone().sub(absolutePivots[jsonBone.parent])
      )
    } else {
      rootBones.push(bones[jsonBone.name])
    }
  }

  const skeleton = new THREE.Skeleton(Object.values(bones))

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(geoData.positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(geoData.normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(geoData.uvs, 2))
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(geoData.skinIndices, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(geoData.skinWeights, 4))
  geometry.setIndex(geoData.indices)

  // Reuse material for entities sharing the same texture to reduce draw calls.
  // Each entity still gets its own geometry, so UV rescaling is per-instance.
  let material = materialCache[texture]
  if (!material) {
    material = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.1 })
    material.userData.isCached = true
    materialCache[texture] = material
    // First time: load texture and configure the shared material
    loadTexture(texture, tex => {
      tex.magFilter = THREE.NearestFilter
      tex.minFilter = THREE.NearestFilter
      tex.flipY = false
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.RepeatWrapping
      material.map = tex
      material.needsUpdate = true
    })
  }

  const mesh = new THREE.SkinnedMesh(geometry, material)
  mesh.add(...rootBones)
  // Force world matrix computation for the entire bone hierarchy before
  // binding. bind() snapshots each bone's world matrix to compute
  // inverseBindMatrices; without this, child bones may have stale matrices
  // because add() does not trigger automatic recalculation.
  mesh.updateMatrixWorld(true)
  mesh.bind(skeleton)
  mesh.scale.set(1 / 16, 1 / 16, 1 / 16)

  // Shift geometry so the entity's feet sit on y=0 (ground plane).
  // Bedrock models define y=0 at the world origin, not the entity's feet,
  // so without this offset entities float above the ground.
  geometry.computeBoundingBox()
  if (geometry.boundingBox) {
    const yShift = -geometry.boundingBox.min.y
    const posAttr = geometry.getAttribute('position')
    for (let j = 0; j < posAttr.count; j++) {
      posAttr.setY(j, posAttr.getY(j) + yShift)
    }
    posAttr.needsUpdate = true
    geometry.boundingBox = null // Invalidate cached bounding box
  }

  // Store animation-relevant data in userData for the animation system
  mesh.userData.entityType = entityType
  mesh.userData.bonesByName = bonesByName
  mesh.userData.skeleton = skeleton

  // UV rescaling runs per-geometry (each entity has its own BufferGeometry).
  // For cached textures, loadTexture fires the callback synchronously so the
  // image dimensions are immediately available. For uncached textures, the
  // callback fires asynchronously and we rescale UVs at that point.
  loadTexture(texture, tex => {
    const img = tex.image
    if (img && (img.width !== texWidth || img.height !== texHeight)) {
      const uScale = texWidth / img.width
      const vScale = texHeight / img.height
      const uvAttr = geometry.getAttribute('uv')
      if (uvAttr) {
        for (let j = 0; j < uvAttr.count; j++) {
          uvAttr.setX(j, uvAttr.getX(j) * uScale)
          uvAttr.setY(j, uvAttr.getY(j) * vScale)
        }
        uvAttr.needsUpdate = true
      }
    }
  })

  return mesh
}

function resolveEntityTexturePath (version, texturePath) {
  const normalized = texturePath
    .replace(/^textures\//, '')
    .replace(/^entity\//, '')
  if (globalThis.__ASSET_SERVER_URL) {
    return `${globalThis.__ASSET_SERVER_URL}/mc-assets/entity/${version}/${normalized}.png`
  }
  return texturePath.replace('textures', 'textures/' + version) + '.png'
}

// Diagnostic: set globalThis.__VIEWER_DEBUG_ENTITY_TEXTURES = true to log first entity texture resolution
let _debugEntityTextureLogged = false

/**
 * Entity class - creates a mesh from entity model definitions.
 *
 * MODIFIED: Now tracks skinned meshes for animation system.
 */
class Entity {
  constructor (version, type, scene) {
    const e = entities[type]
    if (!e) throw new Error(`Unknown entity ${type}`)

    this.mesh = new THREE.Object3D()
    this.mesh.userData.entityType = type
    this.mesh.userData.skinnedMeshes = []

    for (const [name, jsonModel] of Object.entries(e.geometry)) {
      // Look up texture by geometry key name; fall back to 'default' or first available texture
      const texture = e.textures[name] || e.textures['default'] || Object.values(e.textures)[0]
      if (!texture) continue
      const resolvedPath = resolveEntityTexturePath(version, texture)
      if (globalThis.__VIEWER_DEBUG_ENTITY_TEXTURES && !_debugEntityTextureLogged) {
        _debugEntityTextureLogged = true
        console.log(
          '[viewer] Entity texture: __ASSET_SERVER_URL=' +
            (globalThis.__ASSET_SERVER_URL ? 'set' : 'unset') +
            ', resolved=' +
            resolvedPath
        )
      }
      const mesh = getMesh(resolvedPath, jsonModel, type)
      /* const skeletonHelper = new THREE.SkeletonHelper( mesh )
      skeletonHelper.material.linewidth = 2
      scene.add( skeletonHelper ) */
      this.mesh.add(mesh)

      // Track skinned meshes for animation system
      if (mesh.isSkinnedMesh) {
        this.mesh.userData.skinnedMeshes.push(mesh)
      }
    }
  }
}

module.exports = Entity
