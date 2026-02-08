/**
 * equipment-renderer.js - Entity Equipment Rendering System
 *
 * Creates Three.js meshes for armor and held items on entity models.
 * Equipment is attached as children to skeletal bones, so it moves
 * with the entity's animations automatically.
 *
 * Equipment slots (from Minecraft protocol via mineflayer):
 * - [0] = Main hand (held item)
 * - [1] = Off hand
 * - [2] = Boots
 * - [3] = Leggings
 * - [4] = Chestplate
 * - [5] = Helmet
 *
 * @module prismarine-viewer/lib/equipment-renderer
 */

import * as THREE from 'three'

// ============================================================================
// CONSTANTS
// ============================================================================

// Equipment slot indices
const EQUIPMENT_SLOTS = {
  MAIN_HAND: 0,
  OFF_HAND: 1,
  BOOTS: 2,
  LEGGINGS: 3,
  CHESTPLATE: 4,
  HELMET: 5
}

// Bone names for biped entities (matching Entity.js definitions)
const BIPED_BONES = {
  HEAD: 'head',
  BODY: 'body',
  LEFT_ARM: 'leftArm',
  RIGHT_ARM: 'rightArm',
  LEFT_LEG: 'leftLeg',
  RIGHT_LEG: 'rightLeg'
}

// Armor material colors (basic colors - could be enhanced with textures)
const ARMOR_MATERIALS = {
  leather: { color: 0x8B4513, name: 'Leather' },
  chainmail: { color: 0x808080, name: 'Chainmail' },
  iron: { color: 0xC0C0C0, name: 'Iron' },
  gold: { color: 0xFFD700, name: 'Gold' },
  diamond: { color: 0x00FFFF, name: 'Diamond' },
  netherite: { color: 0x4A4A4A, name: 'Netherite' }
}

// Armor material cache: color hex → shared MeshLambertMaterial.
// Prevents duplicate materials (and draw calls) for entities wearing same-color armor.
const armorMaterialCache = {}

// Item type colors for held items (fallback when texture not available)
const ITEM_COLORS = {
  sword: 0xAAAAAA,
  pickaxe: 0x888888,
  axe: 0x8B4513,
  shovel: 0x8B4513,
  hoe: 0x8B4513,
  bow: 0x8B4513,
  shield: 0x00008B,
  default: 0xFF00FF // Magenta for unknown items
}

// ============================================================================
// ARMOR GEOMETRY DEFINITIONS
// ============================================================================

/**
 * Create armor overlay geometry.
 * Armor is a slightly inflated version of the body part it protects.
 *
 * All dimensions are in Minecraft's 1/16 block scale (matching entity scale).
 */
const ARMOR_GEOMETRY = {
  helmet: {
    // Head is 8x8x8 pixels, helmet is 9x9x9 (0.5 pixel inflate on each side)
    width: 9,
    height: 9,
    depth: 9,
    offsetY: 0,
    boneName: BIPED_BONES.HEAD
  },
  chestplate: {
    // Body is 8x12x4, chestplate is 9x12x5
    width: 9,
    height: 12,
    depth: 5,
    offsetY: 0,
    boneName: BIPED_BONES.BODY
  },
  chestplate_arm_left: {
    // Arm is 4x12x4, armor overlay is 5x12x5
    width: 5,
    height: 12,
    depth: 5,
    offsetY: 0,
    boneName: BIPED_BONES.LEFT_ARM
  },
  chestplate_arm_right: {
    width: 5,
    height: 12,
    depth: 5,
    offsetY: 0,
    boneName: BIPED_BONES.RIGHT_ARM
  },
  leggings_body: {
    // Lower body portion
    width: 9,
    height: 5,
    depth: 5,
    offsetY: -6, // Below body center
    boneName: BIPED_BONES.BODY
  },
  leggings_left: {
    // Leg is 4x12x4
    width: 5,
    height: 12,
    depth: 5,
    offsetY: 0,
    boneName: BIPED_BONES.LEFT_LEG
  },
  leggings_right: {
    width: 5,
    height: 12,
    depth: 5,
    offsetY: 0,
    boneName: BIPED_BONES.RIGHT_LEG
  },
  boots_left: {
    // Just the foot portion
    width: 5,
    height: 5,
    depth: 5,
    offsetY: -6, // At bottom of leg
    boneName: BIPED_BONES.LEFT_LEG
  },
  boots_right: {
    width: 5,
    height: 5,
    depth: 5,
    offsetY: -6,
    boneName: BIPED_BONES.RIGHT_LEG
  }
}

// ============================================================================
// EQUIPMENT MESH CREATION
// ============================================================================

/**
 * Detect armor material from item name
 * @param {string} itemName - e.g., 'diamond_helmet', 'iron_chestplate'
 * @returns {object} Material definition with color
 */
function detectArmorMaterial (itemName) {
  if (!itemName) return ARMOR_MATERIALS.iron

  const name = itemName.toLowerCase()
  for (const [material, def] of Object.entries(ARMOR_MATERIALS)) {
    if (name.includes(material)) {
      return def
    }
  }
  return ARMOR_MATERIALS.iron // Default to iron
}

/**
 * Detect item type for held item color
 * @param {string} itemName - e.g., 'diamond_sword', 'wooden_pickaxe'
 * @returns {number} Color hex value
 */
function detectItemColor (itemName) {
  if (!itemName) return ITEM_COLORS.default

  const name = itemName.toLowerCase()
  for (const [type, color] of Object.entries(ITEM_COLORS)) {
    if (name.includes(type)) {
      return color
    }
  }

  // Check for armor material colors in tools
  for (const [material, def] of Object.entries(ARMOR_MATERIALS)) {
    if (name.includes(material)) {
      return def.color
    }
  }

  return ITEM_COLORS.default
}

/**
 * Create a single armor piece mesh
 * @param {object} geoDef - Geometry definition from ARMOR_GEOMETRY
 * @param {number} color - Hex color for the material
 * @returns {THREE.Mesh}
 */
function createArmorPieceMesh (geoDef, color) {
  const geometry = new THREE.BoxGeometry(
    geoDef.width / 16,
    geoDef.height / 16,
    geoDef.depth / 16
  )

  // Offset geometry so it's centered on the bone
  geometry.translate(0, geoDef.offsetY / 16, 0)

  const cacheKey = String(color)
  let material = armorMaterialCache[cacheKey]
  if (!material) {
    material = new THREE.MeshLambertMaterial({
      color: color,
      transparent: true,
      opacity: 0.9,
      emissive: color,
      emissiveIntensity: 0.1
    })
    material.userData.isCached = true
    armorMaterialCache[cacheKey] = material
  }

  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.isEquipment = true
  mesh.userData.equipmentType = 'armor'

  return mesh
}

/**
 * Create helmet mesh
 * @param {object} item - Mineflayer Item object
 * @returns {THREE.Mesh}
 */
function createHelmetMesh (item) {
  const material = detectArmorMaterial(item?.name)
  return createArmorPieceMesh(ARMOR_GEOMETRY.helmet, material.color)
}

/**
 * Create chestplate meshes (body + arms)
 * @param {object} item - Mineflayer Item object
 * @returns {object} { body, leftArm, rightArm }
 */
function createChestplateMeshes (item) {
  const material = detectArmorMaterial(item?.name)
  return {
    body: createArmorPieceMesh(ARMOR_GEOMETRY.chestplate, material.color),
    leftArm: createArmorPieceMesh(ARMOR_GEOMETRY.chestplate_arm_left, material.color),
    rightArm: createArmorPieceMesh(ARMOR_GEOMETRY.chestplate_arm_right, material.color)
  }
}

/**
 * Create leggings meshes (body + legs)
 * @param {object} item - Mineflayer Item object
 * @returns {object} { body, leftLeg, rightLeg }
 */
function createLeggingsMeshes (item) {
  const material = detectArmorMaterial(item?.name)
  return {
    body: createArmorPieceMesh(ARMOR_GEOMETRY.leggings_body, material.color),
    leftLeg: createArmorPieceMesh(ARMOR_GEOMETRY.leggings_left, material.color),
    rightLeg: createArmorPieceMesh(ARMOR_GEOMETRY.leggings_right, material.color)
  }
}

/**
 * Create boots meshes
 * @param {object} item - Mineflayer Item object
 * @returns {object} { leftBoot, rightBoot }
 */
function createBootsMeshes (item) {
  const material = detectArmorMaterial(item?.name)
  return {
    leftBoot: createArmorPieceMesh(ARMOR_GEOMETRY.boots_left, material.color),
    rightBoot: createArmorPieceMesh(ARMOR_GEOMETRY.boots_right, material.color)
  }
}

/**
 * Create held item mesh (simplified cube representation)
 * @param {object} item - Mineflayer Item object
 * @param {boolean} isOffhand - Whether this is the off-hand item
 * @returns {THREE.Mesh}
 */
function createHeldItemMesh (item, isOffhand = false) {
  if (!item) return null

  const color = detectItemColor(item.name)

  // Create a simple box to represent the item
  // Could be enhanced with actual item sprites/models later
  const geometry = new THREE.BoxGeometry(
    2 / 16, // Width
    10 / 16, // Height (like a sword)
    2 / 16 // Depth
  )

  // Offset to appear held in hand
  geometry.translate(0, -4 / 16, 0)

  const material = new THREE.MeshLambertMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.1
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.isEquipment = true
  mesh.userData.equipmentType = 'held_item'
  mesh.userData.isOffhand = isOffhand

  // Rotate to look like it's being held
  mesh.rotation.x = Math.PI / 6 // Slight forward tilt
  mesh.rotation.z = isOffhand ? -Math.PI / 4 : Math.PI / 4

  return mesh
}

// ============================================================================
// EQUIPMENT MANAGER
// ============================================================================

/**
 * EquipmentManager - Manages equipment meshes for a single entity
 *
 * Handles creation, updating, and disposal of armor and held item meshes.
 * Equipment meshes are attached to bones so they animate with the entity.
 */
class EquipmentManager {
  constructor () {
    // Track current equipment meshes by slot
    this.meshes = {
      [EQUIPMENT_SLOTS.HELMET]: null,
      [EQUIPMENT_SLOTS.CHESTPLATE]: null,
      [EQUIPMENT_SLOTS.LEGGINGS]: null,
      [EQUIPMENT_SLOTS.BOOTS]: null,
      [EQUIPMENT_SLOTS.MAIN_HAND]: null,
      [EQUIPMENT_SLOTS.OFF_HAND]: null
    }

    // Store equipment items for comparison
    this.currentEquipment = new Array(6).fill(null)
  }

  /**
   * Check if equipment has changed
   * @param {Array} newEquipment - New equipment array from entity
   * @returns {boolean}
   */
  hasChanged (newEquipment) {
    if (!newEquipment) return false

    for (let i = 0; i < 6; i++) {
      const oldItem = this.currentEquipment[i]
      const newItem = newEquipment[i]

      // Both null - no change
      if (!oldItem && !newItem) continue

      // One is null, other isn't - changed
      if (!oldItem || !newItem) return true

      // Compare item names/types
      if (oldItem.name !== newItem.name) return true
      if (oldItem.count !== newItem.count) return true
    }

    return false
  }

  /**
   * Update equipment for an entity
   * @param {THREE.Object3D} entityMesh - The entity's root mesh
   * @param {Array} equipment - Equipment array from mineflayer entity
   */
  update (entityMesh, equipment) {
    if (!equipment || !entityMesh) return

    // Find bones in the entity mesh
    const bones = this.findBones(entityMesh)
    if (!bones) return

    // Update each equipment slot
    this.updateHelmet(bones, equipment[EQUIPMENT_SLOTS.HELMET])
    this.updateChestplate(bones, equipment[EQUIPMENT_SLOTS.CHESTPLATE])
    this.updateLeggings(bones, equipment[EQUIPMENT_SLOTS.LEGGINGS])
    this.updateBoots(bones, equipment[EQUIPMENT_SLOTS.BOOTS])
    this.updateHeldItem(bones, equipment[EQUIPMENT_SLOTS.MAIN_HAND], false)
    this.updateHeldItem(bones, equipment[EQUIPMENT_SLOTS.OFF_HAND], true)

    // Store current equipment
    this.currentEquipment = [...equipment]
  }

  /**
   * Find bones in an entity mesh
   * @param {THREE.Object3D} entityMesh
   * @returns {object|null} Map of bone names to THREE.Bone
   */
  findBones (entityMesh) {
    let bones = null

    entityMesh.traverse((child) => {
      if (child.isSkinnedMesh && child.userData.bonesByName) {
        bones = child.userData.bonesByName
      }
    })

    return bones
  }

  /**
   * Update helmet equipment
   */
  updateHelmet (bones, item) {
    const headBone = bones[BIPED_BONES.HEAD]
    if (!headBone) return

    // Remove old helmet
    if (this.meshes[EQUIPMENT_SLOTS.HELMET]) {
      headBone.remove(this.meshes[EQUIPMENT_SLOTS.HELMET])
      this.disposeMesh(this.meshes[EQUIPMENT_SLOTS.HELMET])
      this.meshes[EQUIPMENT_SLOTS.HELMET] = null
    }

    // Add new helmet if present
    if (item) {
      const mesh = createHelmetMesh(item)
      headBone.add(mesh)
      this.meshes[EQUIPMENT_SLOTS.HELMET] = mesh
    }
  }

  /**
   * Update chestplate equipment
   */
  updateChestplate (bones, item) {
    const slot = EQUIPMENT_SLOTS.CHESTPLATE

    // Remove old chestplate pieces
    if (this.meshes[slot]) {
      const { body, leftArm, rightArm } = this.meshes[slot]
      if (body && bones[BIPED_BONES.BODY]) {
        bones[BIPED_BONES.BODY].remove(body)
        this.disposeMesh(body)
      }
      if (leftArm && bones[BIPED_BONES.LEFT_ARM]) {
        bones[BIPED_BONES.LEFT_ARM].remove(leftArm)
        this.disposeMesh(leftArm)
      }
      if (rightArm && bones[BIPED_BONES.RIGHT_ARM]) {
        bones[BIPED_BONES.RIGHT_ARM].remove(rightArm)
        this.disposeMesh(rightArm)
      }
      this.meshes[slot] = null
    }

    // Add new chestplate if present
    if (item) {
      const meshes = createChestplateMeshes(item)
      if (bones[BIPED_BONES.BODY]) bones[BIPED_BONES.BODY].add(meshes.body)
      if (bones[BIPED_BONES.LEFT_ARM]) bones[BIPED_BONES.LEFT_ARM].add(meshes.leftArm)
      if (bones[BIPED_BONES.RIGHT_ARM]) bones[BIPED_BONES.RIGHT_ARM].add(meshes.rightArm)
      this.meshes[slot] = meshes
    }
  }

  /**
   * Update leggings equipment
   */
  updateLeggings (bones, item) {
    const slot = EQUIPMENT_SLOTS.LEGGINGS

    // Remove old leggings pieces
    if (this.meshes[slot]) {
      const { body, leftLeg, rightLeg } = this.meshes[slot]
      if (body && bones[BIPED_BONES.BODY]) {
        bones[BIPED_BONES.BODY].remove(body)
        this.disposeMesh(body)
      }
      if (leftLeg && bones[BIPED_BONES.LEFT_LEG]) {
        bones[BIPED_BONES.LEFT_LEG].remove(leftLeg)
        this.disposeMesh(leftLeg)
      }
      if (rightLeg && bones[BIPED_BONES.RIGHT_LEG]) {
        bones[BIPED_BONES.RIGHT_LEG].remove(rightLeg)
        this.disposeMesh(rightLeg)
      }
      this.meshes[slot] = null
    }

    // Add new leggings if present
    if (item) {
      const meshes = createLeggingsMeshes(item)
      if (bones[BIPED_BONES.BODY]) bones[BIPED_BONES.BODY].add(meshes.body)
      if (bones[BIPED_BONES.LEFT_LEG]) bones[BIPED_BONES.LEFT_LEG].add(meshes.leftLeg)
      if (bones[BIPED_BONES.RIGHT_LEG]) bones[BIPED_BONES.RIGHT_LEG].add(meshes.rightLeg)
      this.meshes[slot] = meshes
    }
  }

  /**
   * Update boots equipment
   */
  updateBoots (bones, item) {
    const slot = EQUIPMENT_SLOTS.BOOTS

    // Remove old boots
    if (this.meshes[slot]) {
      const { leftBoot, rightBoot } = this.meshes[slot]
      if (leftBoot && bones[BIPED_BONES.LEFT_LEG]) {
        bones[BIPED_BONES.LEFT_LEG].remove(leftBoot)
        this.disposeMesh(leftBoot)
      }
      if (rightBoot && bones[BIPED_BONES.RIGHT_LEG]) {
        bones[BIPED_BONES.RIGHT_LEG].remove(rightBoot)
        this.disposeMesh(rightBoot)
      }
      this.meshes[slot] = null
    }

    // Add new boots if present
    if (item) {
      const meshes = createBootsMeshes(item)
      if (bones[BIPED_BONES.LEFT_LEG]) bones[BIPED_BONES.LEFT_LEG].add(meshes.leftBoot)
      if (bones[BIPED_BONES.RIGHT_LEG]) bones[BIPED_BONES.RIGHT_LEG].add(meshes.rightBoot)
      this.meshes[slot] = meshes
    }
  }

  /**
   * Update held item (main hand or off hand)
   */
  updateHeldItem (bones, item, isOffhand) {
    const slot = isOffhand ? EQUIPMENT_SLOTS.OFF_HAND : EQUIPMENT_SLOTS.MAIN_HAND
    const boneName = isOffhand ? BIPED_BONES.LEFT_ARM : BIPED_BONES.RIGHT_ARM
    const bone = bones[boneName]

    if (!bone) return

    // Remove old held item
    if (this.meshes[slot]) {
      bone.remove(this.meshes[slot])
      this.disposeMesh(this.meshes[slot])
      this.meshes[slot] = null
    }

    // Add new held item if present
    if (item) {
      const mesh = createHeldItemMesh(item, isOffhand)
      if (mesh) {
        bone.add(mesh)
        this.meshes[slot] = mesh
      }
    }
  }

  /**
   * Dispose of a mesh and its resources
   */
  disposeMesh (mesh) {
    if (!mesh) return

    if (mesh.geometry) mesh.geometry.dispose()
    if (mesh.material && !mesh.material.userData.isCached) {
      if (mesh.material.map) mesh.material.map.dispose()
      mesh.material.dispose()
    }
  }

  /**
   * Dispose all equipment meshes
   */
  dispose () {
    for (const slot of Object.values(EQUIPMENT_SLOTS)) {
      const meshOrMeshes = this.meshes[slot]
      if (!meshOrMeshes) continue

      if (meshOrMeshes instanceof THREE.Mesh) {
        this.disposeMesh(meshOrMeshes)
      } else if (typeof meshOrMeshes === 'object') {
        // Multi-mesh equipment (chestplate, leggings, boots)
        for (const mesh of Object.values(meshOrMeshes)) {
          this.disposeMesh(mesh)
        }
      }
    }

    this.meshes = {}
    this.currentEquipment = []
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  EQUIPMENT_SLOTS,
  BIPED_BONES,
  ARMOR_MATERIALS,
  EquipmentManager,
  createHelmetMesh,
  createChestplateMeshes,
  createLeggingsMeshes,
  createBootsMeshes,
  createHeldItemMesh,
  detectArmorMaterial,
  detectItemColor
}
