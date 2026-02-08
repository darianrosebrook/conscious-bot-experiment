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

import * as THREE from 'three'
import entities from './entities.json'
import { loadTexture } from '../utils/utils.web.js'

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

      // Cube rotation is around the bone pivot, not world origin.
      // Translate to pivot-local, rotate, translate back.
      vecPos = vecPos.sub(bone.position)
      vecPos = vecPos.applyEuler(cubeRotation)
      vecPos = vecPos.applyEuler(bone.rotation)
      vecPos = vecPos.add(bone.position)

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

function getMesh (texture, jsonModel, entityType, skinUrl) {
  const bones = {}
  const bonesByName = {}

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
    bone.name = jsonBone.name
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

  // Build a lookup of absolute pivots from the JSON before modifying bone positions.
  // addCube() above already used these absolute pivots for vertex transforms,
  // so the geometry data is correct.
  const absolutePivots = {}
  for (const jsonBone of jsonModel.bones) {
    absolutePivots[jsonBone.name] = jsonBone.pivot
      ? new THREE.Vector3(jsonBone.pivot[0], jsonBone.pivot[1], jsonBone.pivot[2])
      : new THREE.Vector3()
  }

  // Convert absolute pivots to parent-relative positions BEFORE building
  // the hierarchy. THREE.js treats bone.position as local to parent, so
  // if we leave absolute pivots, child world positions double-count the
  // parent offset (e.g. body at [0,24,0] under waist at [0,12,0] would
  // produce world [0,36,0] instead of [0,24,0]).
  const rootBones = []
  for (const jsonBone of jsonModel.bones) {
    if (jsonBone.parent) {
      const childBone = bones[jsonBone.name]
      const parentAbsolute = absolutePivots[jsonBone.parent]
      const childAbsolute = absolutePivots[jsonBone.name]
      // relative = child_absolute - parent_absolute
      childBone.position.copy(childAbsolute).sub(parentAbsolute)
      bones[jsonBone.parent].add(childBone)
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

  // When a skin URL is provided (Mojang CDN), use it as the cache key and texture source
  // so each player gets their own material. Otherwise use the generic entity texture path.
  const cacheKey = skinUrl || texture
  const textureSource = skinUrl || texture

  let material = materialCache[cacheKey]
  if (!material) {
    material = new THREE.MeshLambertMaterial({ alphaTest: 0.1 })
    material.userData.isCached = true
    materialCache[cacheKey] = material
    loadTexture(textureSource, tex => {
      tex.magFilter = THREE.NearestFilter
      tex.minFilter = THREE.NearestFilter
      tex.flipY = false
      // ClampToEdge so UVs outside [0,1] (e.g. from model mismatch or rounding) do not
      // wrap and show wrong texture regions; avoids stretched/wrong pixels on limbs.
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      material.map = tex
      material.needsUpdate = true
    })
  }

  const mesh = new THREE.SkinnedMesh(geometry, material)
  mesh.add(...rootBones)
  mesh.bind(skeleton)
  mesh.scale.set(1 / 16, 1 / 16, 1 / 16)

  mesh.userData.entityType = entityType
  mesh.userData.bonesByName = bonesByName
  mesh.userData.skeleton = skeleton

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

let _debugEntityTextureLogged = false

class Entity {
  constructor (version, type, scene, skinUrl) {
    const e = entities[type]
    if (!e) throw new Error(`Unknown entity ${type}`)

    this.mesh = new THREE.Object3D()
    this.mesh.userData.entityType = type
    this.mesh.userData.skinnedMeshes = []
    this.mesh.userData.skinUrl = skinUrl || null

    for (const [name, jsonModel] of Object.entries(e.geometry)) {
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
      // Pass skinUrl to getMesh so player entities use their Mojang skin
      const mesh = getMesh(resolvedPath, jsonModel, type, skinUrl)
      this.mesh.add(mesh)

      if (mesh.isSkinnedMesh) {
        this.mesh.userData.skinnedMeshes.push(mesh)
      }
    }
  }
}

export default Entity
