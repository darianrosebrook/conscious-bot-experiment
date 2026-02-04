/**
 * Skeletal Animation System for Prismarine-Viewer
 *
 * This module provides walk/idle animations for Minecraft entities.
 * It's designed to be injected into prismarine-viewer's entities.js.
 *
 * @module prismarine-viewer-src/animation-system
 */

/* global THREE */

// ============================================================================
// Entity Categories
// ============================================================================

/**
 * Biped entities use humanoid walk cycles (legs + arms swing)
 */
const BIPED_ENTITIES = [
  'player', 'zombie', 'skeleton', 'creeper', 'enderman', 'witch',
  'villager', 'pillager', 'vindicator', 'evoker', 'illusioner',
  'zombie_villager', 'drowned', 'husk', 'stray', 'wither_skeleton',
  'piglin', 'piglin_brute', 'zombified_piglin'
]

/**
 * Quadruped entities use four-legged trot gait
 */
const QUADRUPED_ENTITIES = [
  'pig', 'cow', 'sheep', 'chicken', 'wolf', 'cat', 'ocelot',
  'horse', 'donkey', 'mule', 'fox', 'rabbit', 'goat', 'llama',
  'polar_bear', 'panda', 'bee', 'spider', 'cave_spider'
]

// ============================================================================
// Bone Names (Minecraft Entity Model Standard)
// ============================================================================

/**
 * Standard bone names for biped entities
 */
const BIPED_BONES = {
  HEAD: 'head',
  BODY: 'body',
  LEFT_ARM: 'leftArm',
  RIGHT_ARM: 'rightArm',
  LEFT_LEG: 'leftLeg',
  RIGHT_LEG: 'rightLeg'
}

/**
 * Standard bone names for quadruped entities
 */
const QUADRUPED_BONES = {
  HEAD: 'head',
  BODY: 'body',
  LEG0: 'leg0', // front right
  LEG1: 'leg1', // front left
  LEG2: 'leg2', // back right
  LEG3: 'leg3'  // back left
}

// ============================================================================
// Animation Clip Generation
// ============================================================================

/**
 * Create a QuaternionKeyframeTrack for bone rotation animation.
 *
 * Uses quaternions instead of Euler angles for gimbal-lock-free
 * smooth interpolation between keyframes.
 *
 * @param {string} boneName - Name of the bone to animate
 * @param {Array<{time: number, rotation: {x: number, y: number, z: number}}>} keyframes
 * @returns {THREE.QuaternionKeyframeTrack}
 */
function createBoneRotationTrack (boneName, keyframes) {
  const times = []
  const values = []

  for (const kf of keyframes) {
    times.push(kf.time)
    // Convert Euler to Quaternion for smooth interpolation
    const euler = new THREE.Euler(kf.rotation.x, kf.rotation.y, kf.rotation.z, 'XYZ')
    const quat = new THREE.Quaternion().setFromEuler(euler)
    values.push(quat.x, quat.y, quat.z, quat.w)
  }

  return new THREE.QuaternionKeyframeTrack(
    boneName + '.quaternion',
    times,
    values
  )
}

/**
 * Create walk animation clip for biped entities.
 *
 * Animation timing: 1 second per full cycle (2 steps)
 * - Legs swing ±0.6 radians (about 34°), 180° out of phase
 * - Arms counterswing at ±0.3 radians opposite to same-side leg
 * - Creates natural human-like walking motion
 *
 * @returns {THREE.AnimationClip}
 */
function createBipedWalkClip () {
  const tracks = []
  const duration = 1.0
  const amplitude = 0.6 // Radians - leg swing amount

  // Left leg - swings forward then back
  tracks.push(createBoneRotationTrack(BIPED_BONES.LEFT_LEG, [
    { time: 0.0, rotation: { x: amplitude, y: 0, z: 0 } },
    { time: 0.25, rotation: { x: 0, y: 0, z: 0 } },
    { time: 0.5, rotation: { x: -amplitude, y: 0, z: 0 } },
    { time: 0.75, rotation: { x: 0, y: 0, z: 0 } },
    { time: 1.0, rotation: { x: amplitude, y: 0, z: 0 } }
  ]))

  // Right leg - opposite phase
  tracks.push(createBoneRotationTrack(BIPED_BONES.RIGHT_LEG, [
    { time: 0.0, rotation: { x: -amplitude, y: 0, z: 0 } },
    { time: 0.25, rotation: { x: 0, y: 0, z: 0 } },
    { time: 0.5, rotation: { x: amplitude, y: 0, z: 0 } },
    { time: 0.75, rotation: { x: 0, y: 0, z: 0 } },
    { time: 1.0, rotation: { x: -amplitude, y: 0, z: 0 } }
  ]))

  // Left arm - opposite to left leg (natural walking motion)
  tracks.push(createBoneRotationTrack(BIPED_BONES.LEFT_ARM, [
    { time: 0.0, rotation: { x: -amplitude * 0.5, y: 0, z: 0 } },
    { time: 0.25, rotation: { x: 0, y: 0, z: 0 } },
    { time: 0.5, rotation: { x: amplitude * 0.5, y: 0, z: 0 } },
    { time: 0.75, rotation: { x: 0, y: 0, z: 0 } },
    { time: 1.0, rotation: { x: -amplitude * 0.5, y: 0, z: 0 } }
  ]))

  // Right arm - opposite to right leg
  tracks.push(createBoneRotationTrack(BIPED_BONES.RIGHT_ARM, [
    { time: 0.0, rotation: { x: amplitude * 0.5, y: 0, z: 0 } },
    { time: 0.25, rotation: { x: 0, y: 0, z: 0 } },
    { time: 0.5, rotation: { x: -amplitude * 0.5, y: 0, z: 0 } },
    { time: 0.75, rotation: { x: 0, y: 0, z: 0 } },
    { time: 1.0, rotation: { x: amplitude * 0.5, y: 0, z: 0 } }
  ]))

  return new THREE.AnimationClip('walk', duration, tracks)
}

/**
 * Create idle animation clip for biped entities.
 *
 * Animation timing: 2 seconds per cycle
 * - Subtle body sway (breathing simulation)
 * - Arms hang with slight movement
 * - Very subtle to avoid looking robotic when standing
 *
 * @returns {THREE.AnimationClip}
 */
function createBipedIdleClip () {
  const tracks = []
  const duration = 2.0
  const breathAmplitude = 0.02 // Very subtle

  // Subtle body sway
  tracks.push(createBoneRotationTrack(BIPED_BONES.BODY, [
    { time: 0.0, rotation: { x: 0, y: 0, z: 0 } },
    { time: 1.0, rotation: { x: breathAmplitude, y: 0, z: 0 } },
    { time: 2.0, rotation: { x: 0, y: 0, z: 0 } }
  ]))

  // Arms at rest with slight movement
  tracks.push(createBoneRotationTrack(BIPED_BONES.LEFT_ARM, [
    { time: 0.0, rotation: { x: 0, y: 0, z: 0.05 } },
    { time: 1.0, rotation: { x: 0, y: 0, z: 0.08 } },
    { time: 2.0, rotation: { x: 0, y: 0, z: 0.05 } }
  ]))

  tracks.push(createBoneRotationTrack(BIPED_BONES.RIGHT_ARM, [
    { time: 0.0, rotation: { x: 0, y: 0, z: -0.05 } },
    { time: 1.0, rotation: { x: 0, y: 0, z: -0.08 } },
    { time: 2.0, rotation: { x: 0, y: 0, z: -0.05 } }
  ]))

  return new THREE.AnimationClip('idle', duration, tracks)
}

/**
 * Create walk animation clip for quadruped entities.
 *
 * Animation timing: 1 second per cycle
 * - Uses trot gait: diagonal leg pairs move together
 * - Front-right + back-left swing together
 * - Front-left + back-right swing together (opposite phase)
 *
 * @returns {THREE.AnimationClip}
 */
function createQuadrupedWalkClip () {
  const tracks = []
  const duration = 1.0
  const amplitude = 0.5

  // Diagonal pairs move together (like a trotting animal)
  // Front right + back left
  tracks.push(createBoneRotationTrack(QUADRUPED_BONES.LEG0, [
    { time: 0.0, rotation: { x: amplitude, y: 0, z: 0 } },
    { time: 0.5, rotation: { x: -amplitude, y: 0, z: 0 } },
    { time: 1.0, rotation: { x: amplitude, y: 0, z: 0 } }
  ]))

  tracks.push(createBoneRotationTrack(QUADRUPED_BONES.LEG3, [
    { time: 0.0, rotation: { x: amplitude, y: 0, z: 0 } },
    { time: 0.5, rotation: { x: -amplitude, y: 0, z: 0 } },
    { time: 1.0, rotation: { x: amplitude, y: 0, z: 0 } }
  ]))

  // Front left + back right (opposite phase)
  tracks.push(createBoneRotationTrack(QUADRUPED_BONES.LEG1, [
    { time: 0.0, rotation: { x: -amplitude, y: 0, z: 0 } },
    { time: 0.5, rotation: { x: amplitude, y: 0, z: 0 } },
    { time: 1.0, rotation: { x: -amplitude, y: 0, z: 0 } }
  ]))

  tracks.push(createBoneRotationTrack(QUADRUPED_BONES.LEG2, [
    { time: 0.0, rotation: { x: -amplitude, y: 0, z: 0 } },
    { time: 0.5, rotation: { x: amplitude, y: 0, z: 0 } },
    { time: 1.0, rotation: { x: -amplitude, y: 0, z: 0 } }
  ]))

  return new THREE.AnimationClip('walk', duration, tracks)
}

/**
 * Create idle animation for quadruped entities.
 *
 * Animation timing: 3 seconds per cycle
 * - Subtle head movement (looking around)
 * - Very minimal to avoid looking restless
 *
 * @returns {THREE.AnimationClip}
 */
function createQuadrupedIdleClip () {
  const tracks = []
  const duration = 3.0

  // Subtle head movement
  tracks.push(createBoneRotationTrack(QUADRUPED_BONES.HEAD, [
    { time: 0.0, rotation: { x: 0, y: 0, z: 0 } },
    { time: 1.5, rotation: { x: 0.05, y: 0.1, z: 0 } },
    { time: 3.0, rotation: { x: 0, y: 0, z: 0 } }
  ]))

  return new THREE.AnimationClip('idle', duration, tracks)
}

// ============================================================================
// Entity Category Detection
// ============================================================================

/**
 * Determine entity category for animation selection.
 *
 * @param {string} entityType - Minecraft entity type (e.g., 'zombie', 'pig')
 * @returns {'biped' | 'quadruped' | 'unknown'}
 */
function getEntityCategory (entityType) {
  if (!entityType) return 'unknown'
  const type = entityType.toLowerCase().replace('minecraft:', '')
  if (BIPED_ENTITIES.includes(type)) return 'biped'
  if (QUADRUPED_ENTITIES.includes(type)) return 'quadruped'
  return 'unknown'
}

/**
 * Calculate animation speed based on movement velocity.
 *
 * Minecraft walking speed is ~4.3 blocks/sec, running ~5.6.
 * We scale animation speed proportionally.
 *
 * @param {{x: number, y: number, z: number}} velocity - Entity velocity
 * @returns {number} Animation speed multiplier (0 = idle, 1 = normal walk)
 */
function calculateAnimationSpeed (velocity) {
  const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z)
  // Walking speed ~4.3 blocks/sec, running ~5.6
  if (horizontalSpeed < 0.1) return 0 // Idle
  if (horizontalSpeed < 4.5) return horizontalSpeed / 4.3 // Normal walk speed
  return horizontalSpeed / 4.3 // Scale with speed
}

// ============================================================================
// Exports (for use in entities.js)
// ============================================================================

module.exports = {
  // Constants
  BIPED_ENTITIES,
  QUADRUPED_ENTITIES,
  BIPED_BONES,
  QUADRUPED_BONES,

  // Clip generators
  createBoneRotationTrack,
  createBipedWalkClip,
  createBipedIdleClip,
  createQuadrupedWalkClip,
  createQuadrupedIdleClip,

  // Utilities
  getEntityCategory,
  calculateAnimationSpeed
}
