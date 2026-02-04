/**
 * Entity Animations Module
 *
 * Provides skeletal animation support for Minecraft entities in the viewer.
 * Uses Three.js AnimationMixer system to animate bones on SkinnedMesh entities.
 *
 * Architecture:
 * 1. Animation clips are defined as keyframe sequences for each bone
 * 2. An AnimationMixer is attached to each entity mesh when spawned
 * 3. Entity velocity/state determines which animation plays
 * 4. Animations cross-fade smoothly during state transitions
 *
 * Supported animations:
 * - Idle (subtle breathing/swaying)
 * - Walk (leg swing, arm swing, body bob)
 * - Run (faster leg swing, more pronounced bob)
 * - Jump (crouch, extend, fall)
 * - Swim (paddle motion)
 * - Attack (arm swing)
 *
 * @module asset-pipeline/entity-animations
 */

import * as THREE from 'three';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Animation state for an entity
 */
export type AnimationState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'fall'
  | 'swim'
  | 'attack'
  | 'hurt'
  | 'death';

/**
 * Entity movement data used to determine animation state
 */
export interface EntityMovementData {
  velocity: THREE.Vector3;
  onGround: boolean;
  inWater: boolean;
  isAttacking: boolean;
  isSneaking: boolean;
  isSprinting: boolean;
}

/**
 * Bone keyframe for animation
 */
export interface BoneKeyframe {
  time: number;
  rotation?: THREE.Euler;
  position?: THREE.Vector3;
}

/**
 * Animation definition for an entity type
 */
export interface EntityAnimationDefinition {
  name: AnimationState;
  duration: number;
  loop: boolean;
  bones: Record<string, BoneKeyframe[]>;
}

/**
 * Managed animation state for a single entity
 */
export interface ManagedEntityAnimation {
  mixer: THREE.AnimationMixer;
  actions: Map<AnimationState, THREE.AnimationAction>;
  currentState: AnimationState;
  mesh: THREE.Object3D;
}

// ============================================================================
// Bone Names (Minecraft Entity Model Standard)
// ============================================================================

/**
 * Standard bone names for biped entities (players, zombies, skeletons, etc.)
 */
export const BIPED_BONES = {
  HEAD: 'head',
  BODY: 'body',
  LEFT_ARM: 'leftArm',
  RIGHT_ARM: 'rightArm',
  LEFT_LEG: 'leftLeg',
  RIGHT_LEG: 'rightLeg',
} as const;

/**
 * Standard bone names for quadruped entities (pigs, cows, sheep, etc.)
 */
export const QUADRUPED_BONES = {
  HEAD: 'head',
  BODY: 'body',
  FRONT_LEFT_LEG: 'leg0',
  FRONT_RIGHT_LEG: 'leg1',
  BACK_LEFT_LEG: 'leg2',
  BACK_RIGHT_LEG: 'leg3',
} as const;

// ============================================================================
// Animation Definitions
// ============================================================================

/**
 * Walk cycle animation for biped entities.
 *
 * Timing: 1 second per full cycle (2 steps)
 * - Legs swing opposite to each other (180° out of phase)
 * - Arms swing opposite to legs (natural walking motion)
 * - Body has subtle vertical bob (highest at mid-step)
 * - Head stays relatively stable
 */
export const BIPED_WALK_ANIMATION: EntityAnimationDefinition = {
  name: 'walk',
  duration: 1.0,
  loop: true,
  bones: {
    [BIPED_BONES.LEFT_LEG]: [
      { time: 0.0, rotation: new THREE.Euler(0.5, 0, 0) }, // Forward
      { time: 0.25, rotation: new THREE.Euler(0, 0, 0) }, // Center
      { time: 0.5, rotation: new THREE.Euler(-0.5, 0, 0) }, // Back
      { time: 0.75, rotation: new THREE.Euler(0, 0, 0) }, // Center
      { time: 1.0, rotation: new THREE.Euler(0.5, 0, 0) }, // Forward (loop)
    ],
    [BIPED_BONES.RIGHT_LEG]: [
      { time: 0.0, rotation: new THREE.Euler(-0.5, 0, 0) }, // Back
      { time: 0.25, rotation: new THREE.Euler(0, 0, 0) }, // Center
      { time: 0.5, rotation: new THREE.Euler(0.5, 0, 0) }, // Forward
      { time: 0.75, rotation: new THREE.Euler(0, 0, 0) }, // Center
      { time: 1.0, rotation: new THREE.Euler(-0.5, 0, 0) }, // Back (loop)
    ],
    [BIPED_BONES.LEFT_ARM]: [
      { time: 0.0, rotation: new THREE.Euler(-0.4, 0, 0) }, // Back (opposite to left leg)
      { time: 0.25, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.5, rotation: new THREE.Euler(0.4, 0, 0) }, // Forward
      { time: 0.75, rotation: new THREE.Euler(0, 0, 0) },
      { time: 1.0, rotation: new THREE.Euler(-0.4, 0, 0) },
    ],
    [BIPED_BONES.RIGHT_ARM]: [
      { time: 0.0, rotation: new THREE.Euler(0.4, 0, 0) }, // Forward (opposite to right leg)
      { time: 0.25, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.5, rotation: new THREE.Euler(-0.4, 0, 0) }, // Back
      { time: 0.75, rotation: new THREE.Euler(0, 0, 0) },
      { time: 1.0, rotation: new THREE.Euler(0.4, 0, 0) },
    ],
    [BIPED_BONES.BODY]: [
      { time: 0.0, position: new THREE.Vector3(0, 0, 0) },
      { time: 0.25, position: new THREE.Vector3(0, 0.02, 0) }, // Slight bob up
      { time: 0.5, position: new THREE.Vector3(0, 0, 0) },
      { time: 0.75, position: new THREE.Vector3(0, 0.02, 0) }, // Slight bob up
      { time: 1.0, position: new THREE.Vector3(0, 0, 0) },
    ],
  },
};

/**
 * Idle animation for biped entities.
 *
 * Timing: 3 seconds per cycle
 * - Subtle breathing motion (body rises and falls)
 * - Arms hang with slight sway
 * - Head occasional small movements
 */
export const BIPED_IDLE_ANIMATION: EntityAnimationDefinition = {
  name: 'idle',
  duration: 3.0,
  loop: true,
  bones: {
    [BIPED_BONES.BODY]: [
      { time: 0.0, position: new THREE.Vector3(0, 0, 0) },
      { time: 1.5, position: new THREE.Vector3(0, 0.01, 0) }, // Breathe in
      { time: 3.0, position: new THREE.Vector3(0, 0, 0) }, // Breathe out
    ],
    [BIPED_BONES.LEFT_ARM]: [
      { time: 0.0, rotation: new THREE.Euler(0.05, 0, 0.02) },
      { time: 1.5, rotation: new THREE.Euler(-0.05, 0, 0.02) },
      { time: 3.0, rotation: new THREE.Euler(0.05, 0, 0.02) },
    ],
    [BIPED_BONES.RIGHT_ARM]: [
      { time: 0.0, rotation: new THREE.Euler(-0.05, 0, -0.02) },
      { time: 1.5, rotation: new THREE.Euler(0.05, 0, -0.02) },
      { time: 3.0, rotation: new THREE.Euler(-0.05, 0, -0.02) },
    ],
    [BIPED_BONES.HEAD]: [
      { time: 0.0, rotation: new THREE.Euler(0, 0, 0) },
      { time: 1.0, rotation: new THREE.Euler(0.02, 0.05, 0) },
      { time: 2.0, rotation: new THREE.Euler(-0.02, -0.05, 0) },
      { time: 3.0, rotation: new THREE.Euler(0, 0, 0) },
    ],
  },
};

/**
 * Run animation for biped entities.
 *
 * Timing: 0.5 seconds per cycle (faster than walk)
 * - More pronounced leg swing
 * - More arm movement
 * - More body bob
 * - Slight forward lean
 */
export const BIPED_RUN_ANIMATION: EntityAnimationDefinition = {
  name: 'run',
  duration: 0.5,
  loop: true,
  bones: {
    [BIPED_BONES.LEFT_LEG]: [
      { time: 0.0, rotation: new THREE.Euler(0.8, 0, 0) },
      { time: 0.125, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.25, rotation: new THREE.Euler(-0.8, 0, 0) },
      { time: 0.375, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.5, rotation: new THREE.Euler(0.8, 0, 0) },
    ],
    [BIPED_BONES.RIGHT_LEG]: [
      { time: 0.0, rotation: new THREE.Euler(-0.8, 0, 0) },
      { time: 0.125, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.25, rotation: new THREE.Euler(0.8, 0, 0) },
      { time: 0.375, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.5, rotation: new THREE.Euler(-0.8, 0, 0) },
    ],
    [BIPED_BONES.LEFT_ARM]: [
      { time: 0.0, rotation: new THREE.Euler(-0.7, 0, -0.1) },
      { time: 0.125, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.25, rotation: new THREE.Euler(0.7, 0, -0.1) },
      { time: 0.375, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.5, rotation: new THREE.Euler(-0.7, 0, -0.1) },
    ],
    [BIPED_BONES.RIGHT_ARM]: [
      { time: 0.0, rotation: new THREE.Euler(0.7, 0, 0.1) },
      { time: 0.125, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.25, rotation: new THREE.Euler(-0.7, 0, 0.1) },
      { time: 0.375, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.5, rotation: new THREE.Euler(0.7, 0, 0.1) },
    ],
    [BIPED_BONES.BODY]: [
      { time: 0.0, rotation: new THREE.Euler(0.1, 0, 0), position: new THREE.Vector3(0, 0, 0) },
      { time: 0.125, rotation: new THREE.Euler(0.1, 0, 0), position: new THREE.Vector3(0, 0.04, 0) },
      { time: 0.25, rotation: new THREE.Euler(0.1, 0, 0), position: new THREE.Vector3(0, 0, 0) },
      { time: 0.375, rotation: new THREE.Euler(0.1, 0, 0), position: new THREE.Vector3(0, 0.04, 0) },
      { time: 0.5, rotation: new THREE.Euler(0.1, 0, 0), position: new THREE.Vector3(0, 0, 0) },
    ],
  },
};

/**
 * Jump animation for biped entities.
 *
 * Timing: 0.6 seconds (non-looping)
 * - Crouch preparation
 * - Extend upward
 * - Arms raise
 */
export const BIPED_JUMP_ANIMATION: EntityAnimationDefinition = {
  name: 'jump',
  duration: 0.6,
  loop: false,
  bones: {
    [BIPED_BONES.LEFT_LEG]: [
      { time: 0.0, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.15, rotation: new THREE.Euler(0.3, 0, 0) }, // Crouch
      { time: 0.3, rotation: new THREE.Euler(-0.2, 0, 0) }, // Extend
      { time: 0.6, rotation: new THREE.Euler(0.1, 0, 0) }, // Tuck slightly
    ],
    [BIPED_BONES.RIGHT_LEG]: [
      { time: 0.0, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.15, rotation: new THREE.Euler(0.3, 0, 0) },
      { time: 0.3, rotation: new THREE.Euler(-0.2, 0, 0) },
      { time: 0.6, rotation: new THREE.Euler(0.1, 0, 0) },
    ],
    [BIPED_BONES.LEFT_ARM]: [
      { time: 0.0, rotation: new THREE.Euler(0, 0, 0.1) },
      { time: 0.15, rotation: new THREE.Euler(-0.3, 0, 0.2) },
      { time: 0.3, rotation: new THREE.Euler(-1.2, 0, 0.3) }, // Arms up
      { time: 0.6, rotation: new THREE.Euler(-0.5, 0, 0.2) },
    ],
    [BIPED_BONES.RIGHT_ARM]: [
      { time: 0.0, rotation: new THREE.Euler(0, 0, -0.1) },
      { time: 0.15, rotation: new THREE.Euler(-0.3, 0, -0.2) },
      { time: 0.3, rotation: new THREE.Euler(-1.2, 0, -0.3) },
      { time: 0.6, rotation: new THREE.Euler(-0.5, 0, -0.2) },
    ],
    [BIPED_BONES.BODY]: [
      { time: 0.0, position: new THREE.Vector3(0, 0, 0) },
      { time: 0.15, position: new THREE.Vector3(0, -0.05, 0) }, // Crouch down
      { time: 0.3, position: new THREE.Vector3(0, 0.1, 0) }, // Spring up
      { time: 0.6, position: new THREE.Vector3(0, 0.05, 0) },
    ],
  },
};

/**
 * Fall animation for biped entities.
 *
 * Timing: 0.3 seconds looping
 * - Arms out for balance
 * - Legs slightly spread
 */
export const BIPED_FALL_ANIMATION: EntityAnimationDefinition = {
  name: 'fall',
  duration: 0.3,
  loop: true,
  bones: {
    [BIPED_BONES.LEFT_ARM]: [
      { time: 0.0, rotation: new THREE.Euler(-0.3, 0, 0.8) },
      { time: 0.15, rotation: new THREE.Euler(-0.3, 0, 0.9) },
      { time: 0.3, rotation: new THREE.Euler(-0.3, 0, 0.8) },
    ],
    [BIPED_BONES.RIGHT_ARM]: [
      { time: 0.0, rotation: new THREE.Euler(-0.3, 0, -0.8) },
      { time: 0.15, rotation: new THREE.Euler(-0.3, 0, -0.9) },
      { time: 0.3, rotation: new THREE.Euler(-0.3, 0, -0.8) },
    ],
    [BIPED_BONES.LEFT_LEG]: [
      { time: 0.0, rotation: new THREE.Euler(0.1, 0, 0.1) },
      { time: 0.3, rotation: new THREE.Euler(0.1, 0, 0.1) },
    ],
    [BIPED_BONES.RIGHT_LEG]: [
      { time: 0.0, rotation: new THREE.Euler(0.1, 0, -0.1) },
      { time: 0.3, rotation: new THREE.Euler(0.1, 0, -0.1) },
    ],
  },
};

/**
 * Walk animation for quadruped entities (pigs, cows, etc.)
 *
 * Timing: 0.8 seconds per cycle
 * - Diagonal leg pairs move together (front-left with back-right)
 * - Creates natural four-legged gait
 */
export const QUADRUPED_WALK_ANIMATION: EntityAnimationDefinition = {
  name: 'walk',
  duration: 0.8,
  loop: true,
  bones: {
    [QUADRUPED_BONES.FRONT_LEFT_LEG]: [
      { time: 0.0, rotation: new THREE.Euler(0.4, 0, 0) },
      { time: 0.2, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.4, rotation: new THREE.Euler(-0.4, 0, 0) },
      { time: 0.6, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.8, rotation: new THREE.Euler(0.4, 0, 0) },
    ],
    [QUADRUPED_BONES.BACK_RIGHT_LEG]: [
      { time: 0.0, rotation: new THREE.Euler(0.4, 0, 0) }, // Same as front-left
      { time: 0.2, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.4, rotation: new THREE.Euler(-0.4, 0, 0) },
      { time: 0.6, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.8, rotation: new THREE.Euler(0.4, 0, 0) },
    ],
    [QUADRUPED_BONES.FRONT_RIGHT_LEG]: [
      { time: 0.0, rotation: new THREE.Euler(-0.4, 0, 0) }, // Opposite phase
      { time: 0.2, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.4, rotation: new THREE.Euler(0.4, 0, 0) },
      { time: 0.6, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.8, rotation: new THREE.Euler(-0.4, 0, 0) },
    ],
    [QUADRUPED_BONES.BACK_LEFT_LEG]: [
      { time: 0.0, rotation: new THREE.Euler(-0.4, 0, 0) }, // Same as front-right
      { time: 0.2, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.4, rotation: new THREE.Euler(0.4, 0, 0) },
      { time: 0.6, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.8, rotation: new THREE.Euler(-0.4, 0, 0) },
    ],
    [QUADRUPED_BONES.HEAD]: [
      { time: 0.0, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.2, rotation: new THREE.Euler(0, 0.02, 0) },
      { time: 0.4, rotation: new THREE.Euler(0, 0, 0) },
      { time: 0.6, rotation: new THREE.Euler(0, -0.02, 0) },
      { time: 0.8, rotation: new THREE.Euler(0, 0, 0) },
    ],
  },
};

/**
 * Idle animation for quadruped entities
 */
export const QUADRUPED_IDLE_ANIMATION: EntityAnimationDefinition = {
  name: 'idle',
  duration: 4.0,
  loop: true,
  bones: {
    [QUADRUPED_BONES.HEAD]: [
      { time: 0.0, rotation: new THREE.Euler(0, 0, 0) },
      { time: 1.0, rotation: new THREE.Euler(0.1, 0.1, 0) }, // Look around
      { time: 2.0, rotation: new THREE.Euler(-0.05, 0, 0) },
      { time: 3.0, rotation: new THREE.Euler(0.1, -0.1, 0) },
      { time: 4.0, rotation: new THREE.Euler(0, 0, 0) },
    ],
    [QUADRUPED_BONES.BODY]: [
      { time: 0.0, position: new THREE.Vector3(0, 0, 0) },
      { time: 2.0, position: new THREE.Vector3(0, 0.005, 0) }, // Breathing
      { time: 4.0, position: new THREE.Vector3(0, 0, 0) },
    ],
  },
};

// ============================================================================
// Animation Clip Generation
// ============================================================================

/**
 * Converts an EntityAnimationDefinition to a Three.js AnimationClip.
 *
 * This transforms our declarative keyframe format into Three.js's
 * track-based animation system.
 *
 * @param definition - The animation definition
 * @returns Three.js AnimationClip ready for use with AnimationMixer
 */
export function createAnimationClip(
  definition: EntityAnimationDefinition
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];

  for (const [boneName, keyframes] of Object.entries(definition.bones)) {
    // Separate rotation and position keyframes
    const rotationTimes: number[] = [];
    const rotationValues: number[] = [];
    const positionTimes: number[] = [];
    const positionValues: number[] = [];

    for (const kf of keyframes) {
      if (kf.rotation) {
        rotationTimes.push(kf.time);
        // Convert Euler to Quaternion for smooth interpolation
        const quat = new THREE.Quaternion().setFromEuler(kf.rotation);
        rotationValues.push(quat.x, quat.y, quat.z, quat.w);
      }
      if (kf.position) {
        positionTimes.push(kf.time);
        positionValues.push(kf.position.x, kf.position.y, kf.position.z);
      }
    }

    // Create rotation track if we have rotation keyframes
    if (rotationTimes.length > 0) {
      const rotationTrack = new THREE.QuaternionKeyframeTrack(
        `${boneName}.quaternion`,
        rotationTimes,
        rotationValues
      );
      tracks.push(rotationTrack);
    }

    // Create position track if we have position keyframes
    if (positionTimes.length > 0) {
      const positionTrack = new THREE.VectorKeyframeTrack(
        `${boneName}.position`,
        positionTimes,
        positionValues
      );
      tracks.push(positionTrack);
    }
  }

  return new THREE.AnimationClip(definition.name, definition.duration, tracks);
}

// ============================================================================
// Entity Type Classification
// ============================================================================

/**
 * Biped entity types (players, humanoid mobs)
 */
export const BIPED_ENTITIES = new Set([
  'player',
  'zombie',
  'skeleton',
  'creeper',
  'enderman',
  'villager',
  'pillager',
  'vindicator',
  'witch',
  'evoker',
  'illusioner',
  'zombie_villager',
  'husk',
  'drowned',
  'stray',
  'wither_skeleton',
  'piglin',
  'piglin_brute',
  'zombified_piglin',
]);

/**
 * Quadruped entity types (four-legged animals)
 */
export const QUADRUPED_ENTITIES = new Set([
  'pig',
  'cow',
  'sheep',
  'horse',
  'donkey',
  'mule',
  'llama',
  'trader_llama',
  'wolf',
  'fox',
  'cat',
  'ocelot',
  'rabbit',
  'polar_bear',
  'panda',
  'mooshroom',
  'goat',
  'camel',
]);

/**
 * Determines the entity category for animation purposes
 */
export function getEntityCategory(
  entityType: string
): 'biped' | 'quadruped' | 'other' {
  if (BIPED_ENTITIES.has(entityType)) return 'biped';
  if (QUADRUPED_ENTITIES.has(entityType)) return 'quadruped';
  return 'other';
}

// ============================================================================
// Animation State Machine
// ============================================================================

/**
 * Determines which animation state an entity should be in based on movement.
 *
 * Priority order:
 * 1. Attack (if attacking)
 * 2. Jump/Fall (if not on ground)
 * 3. Swim (if in water)
 * 4. Run (if sprinting)
 * 5. Walk (if moving)
 * 6. Idle (default)
 *
 * @param movement - Current entity movement data
 * @returns The animation state the entity should be in
 */
export function determineAnimationState(
  movement: EntityMovementData
): AnimationState {
  const speed = Math.sqrt(
    movement.velocity.x ** 2 + movement.velocity.z ** 2
  );

  // Check attack first (highest priority)
  if (movement.isAttacking) {
    return 'attack';
  }

  // Check airborne states
  if (!movement.onGround) {
    if (movement.velocity.y > 0.1) {
      return 'jump';
    }
    return 'fall';
  }

  // Check water
  if (movement.inWater) {
    return 'swim';
  }

  // Check movement speed
  if (speed > 0.1) {
    if (movement.isSprinting && speed > 0.2) {
      return 'run';
    }
    return 'walk';
  }

  return 'idle';
}

/**
 * Calculates animation playback speed based on entity velocity.
 * Faster movement = faster animation.
 *
 * @param velocity - Entity velocity vector
 * @param baseSpeed - Base animation speed (1.0 = normal)
 * @returns Adjusted playback speed
 */
export function calculateAnimationSpeed(
  velocity: THREE.Vector3,
  baseSpeed: number = 1.0
): number {
  const horizontalSpeed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2);

  // Scale animation speed with movement speed
  // Walking speed ~0.1, running ~0.25
  const speedMultiplier = Math.max(0.5, Math.min(2.0, horizontalSpeed * 5));

  return baseSpeed * speedMultiplier;
}

// ============================================================================
// Animation Manager
// ============================================================================

/**
 * Manages skeletal animations for all entities in the scene.
 *
 * Responsibilities:
 * - Create AnimationMixer for each entity
 * - Determine and apply correct animation based on movement
 * - Handle smooth transitions between animations
 * - Update all mixers each frame
 */
export class EntityAnimationManager {
  private managedEntities: Map<number, ManagedEntityAnimation> = new Map();
  private bipedClips: Map<AnimationState, THREE.AnimationClip> = new Map();
  private quadrupedClips: Map<AnimationState, THREE.AnimationClip> = new Map();
  private crossFadeDuration: number = 0.2; // seconds

  constructor() {
    this.initializeClips();
  }

  /**
   * Pre-generate all animation clips
   */
  private initializeClips(): void {
    // Biped animations
    this.bipedClips.set('idle', createAnimationClip(BIPED_IDLE_ANIMATION));
    this.bipedClips.set('walk', createAnimationClip(BIPED_WALK_ANIMATION));
    this.bipedClips.set('run', createAnimationClip(BIPED_RUN_ANIMATION));
    this.bipedClips.set('jump', createAnimationClip(BIPED_JUMP_ANIMATION));
    this.bipedClips.set('fall', createAnimationClip(BIPED_FALL_ANIMATION));

    // Quadruped animations
    this.quadrupedClips.set('idle', createAnimationClip(QUADRUPED_IDLE_ANIMATION));
    this.quadrupedClips.set('walk', createAnimationClip(QUADRUPED_WALK_ANIMATION));
  }

  /**
   * Register an entity for animation management.
   *
   * @param entityId - Unique entity ID
   * @param mesh - The entity's Three.js mesh (should be SkinnedMesh)
   * @param entityType - Minecraft entity type string
   */
  registerEntity(
    entityId: number,
    mesh: THREE.Object3D,
    entityType: string
  ): void {
    if (this.managedEntities.has(entityId)) {
      return; // Already registered
    }

    const category = getEntityCategory(entityType);
    if (category === 'other') {
      return; // No animation support for this entity type
    }

    const mixer = new THREE.AnimationMixer(mesh);
    const actions = new Map<AnimationState, THREE.AnimationAction>();
    const clips = category === 'biped' ? this.bipedClips : this.quadrupedClips;

    // Create actions for all available clips
    for (const [state, clip] of clips.entries()) {
      const action = mixer.clipAction(clip);

      // Configure looping
      const definition =
        category === 'biped'
          ? this.getBipedDefinition(state)
          : this.getQuadrupedDefinition(state);

      if (definition && !definition.loop) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }

      actions.set(state, action);
    }

    // Start with idle animation
    const idleAction = actions.get('idle');
    if (idleAction) {
      idleAction.play();
    }

    this.managedEntities.set(entityId, {
      mixer,
      actions,
      currentState: 'idle',
      mesh,
    });
  }

  /**
   * Unregister an entity (when despawned)
   */
  unregisterEntity(entityId: number): void {
    const managed = this.managedEntities.get(entityId);
    if (managed) {
      managed.mixer.stopAllAction();
      this.managedEntities.delete(entityId);
    }
  }

  /**
   * Update animation state for an entity based on its movement.
   *
   * @param entityId - Entity ID
   * @param movement - Current movement data
   */
  updateEntityState(entityId: number, movement: EntityMovementData): void {
    const managed = this.managedEntities.get(entityId);
    if (!managed) return;

    const newState = determineAnimationState(movement);

    if (newState !== managed.currentState) {
      this.transitionToState(managed, newState);
    }

    // Adjust playback speed based on velocity
    const currentAction = managed.actions.get(managed.currentState);
    if (currentAction && (newState === 'walk' || newState === 'run')) {
      currentAction.timeScale = calculateAnimationSpeed(movement.velocity);
    }
  }

  /**
   * Smoothly transition to a new animation state
   */
  private transitionToState(
    managed: ManagedEntityAnimation,
    newState: AnimationState
  ): void {
    const oldAction = managed.actions.get(managed.currentState);
    const newAction = managed.actions.get(newState);

    if (!newAction) return;

    if (oldAction) {
      // Cross-fade from old to new
      oldAction.fadeOut(this.crossFadeDuration);
    }

    newAction.reset();
    newAction.fadeIn(this.crossFadeDuration);
    newAction.play();

    managed.currentState = newState;
  }

  /**
   * Update all animation mixers. Call this every frame.
   *
   * @param deltaTime - Time since last frame in seconds
   */
  update(deltaTime: number): void {
    for (const managed of this.managedEntities.values()) {
      managed.mixer.update(deltaTime);
    }
  }

  /**
   * Get the number of managed entities
   */
  getManagedCount(): number {
    return this.managedEntities.size;
  }

  /**
   * Check if an entity is being managed
   */
  isManaged(entityId: number): boolean {
    return this.managedEntities.has(entityId);
  }

  private getBipedDefinition(
    state: AnimationState
  ): EntityAnimationDefinition | undefined {
    switch (state) {
      case 'idle':
        return BIPED_IDLE_ANIMATION;
      case 'walk':
        return BIPED_WALK_ANIMATION;
      case 'run':
        return BIPED_RUN_ANIMATION;
      case 'jump':
        return BIPED_JUMP_ANIMATION;
      case 'fall':
        return BIPED_FALL_ANIMATION;
      default:
        return undefined;
    }
  }

  private getQuadrupedDefinition(
    state: AnimationState
  ): EntityAnimationDefinition | undefined {
    switch (state) {
      case 'idle':
        return QUADRUPED_IDLE_ANIMATION;
      case 'walk':
        return QUADRUPED_WALK_ANIMATION;
      default:
        return undefined;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let animationManager: EntityAnimationManager | null = null;

/**
 * Get the global entity animation manager instance.
 * Creates one if it doesn't exist.
 */
export function getAnimationManager(): EntityAnimationManager {
  if (!animationManager) {
    animationManager = new EntityAnimationManager();
  }
  return animationManager;
}

/**
 * Reset the animation manager (useful for testing)
 */
export function resetAnimationManager(): void {
  animationManager = null;
}
