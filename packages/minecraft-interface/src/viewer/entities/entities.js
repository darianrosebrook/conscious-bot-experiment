/**
 * entities.js - Entity manager with skeletal animation support
 *
 * This file manages all entities in the Three.js scene, handling:
 * - Entity spawning and despawning
 * - Position/rotation interpolation via TWEEN
 * - Skeletal animation (walk/idle cycles)
 *
 * @module prismarine-viewer/lib/entities
 */

const THREE = require('three');
const TWEEN = require('@tweenjs/tween.js');

const Entity = require('./Entity');
const { dispose3 } = require('../utils/dispose');
const { EquipmentManager } = require('./equipment-renderer');
const { EntityExtrasManager } = require('./entity-extras');

const { createCanvas } = require('canvas');

// ============================================================================
// SKELETAL ANIMATION SYSTEM
// ============================================================================

// Entity categories for animation selection
const BIPED_ENTITIES = [
  'player',
  'zombie',
  'skeleton',
  'enderman',
  'zombie_villager',
  'drowned',
  'husk',
  'stray',
  'wither_skeleton',
];

const QUADRUPED_ENTITIES = [
  'pig',
  'cow',
  'sheep',
  'wolf',
  'cat',
  'ocelot',
  'horse',
  'donkey',
  'mule',
  'fox',
  'rabbit',
  'goat',
  'llama',
  'polar_bear',
  'panda',
  'bee',
];

// Entities with only 2 legs that use quadruped-style bone naming (leg0/leg1)
const BIPED_QUADRUPED_ENTITIES = [
  'chicken',
  'iron_golem',
  'villager',
  'vindicator',
  'evoker',
];

// Multi-legged entities that need special handling
const MULTI_LEGGED_ENTITIES = [
  'spider',
  'cave_spider',
];

// Map from canonical leg0-leg3 names to actual bone names per entity type.
// null = uses standard leg0/leg1/leg2/leg3 naming (no mapping needed).
const QUADRUPED_BONE_MAP = {
  cat: { leg0: 'backLegL', leg1: 'backLegR', leg2: 'frontLegL', leg3: 'frontLegR' },
  ocelot: { leg0: 'backLegL', leg1: 'backLegR', leg2: 'frontLegL', leg3: 'frontLegR' },
};

// Map from canonical biped bone names to actual bone names per entity type.
// entities.json uses inconsistent naming across entities: some use camelCase
// (leftArm), some use lowercase (leftarm), some use leg0/leg1 for legs.
const BIPED_BONE_MAP = {
  // Piglin family uses all-lowercase bone names
  piglin:           { leftArm: 'leftarm', rightArm: 'rightarm', leftLeg: 'leftleg', rightLeg: 'rightleg' },
  piglin_brute:     { leftArm: 'leftarm', rightArm: 'rightarm', leftLeg: 'leftleg', rightLeg: 'rightleg' },
  zombified_piglin: { leftArm: 'leftarm', rightArm: 'rightarm', leftLeg: 'leftleg', rightLeg: 'rightleg' },
  // Pillager: lowercase arms, standard legs
  pillager:         { leftArm: 'leftarm', rightArm: 'rightarm', leftLeg: 'leftLeg', rightLeg: 'rightLeg' },
};

// Standard bone names for bipeds (default mapping)
const BIPED_BONES = {
  HEAD: 'head',
  BODY: 'body',
  LEFT_ARM: 'leftArm',
  RIGHT_ARM: 'rightArm',
  LEFT_LEG: 'leftLeg',
  RIGHT_LEG: 'rightLeg',
};

// Standard bone names for quadrupeds
const QUADRUPED_BONES = {
  HEAD: 'head',
  BODY: 'body',
  LEG0: 'leg0', // front right
  LEG1: 'leg1', // front left
  LEG2: 'leg2', // back right
  LEG3: 'leg3', // back left
};

/**
 * Create a QuaternionKeyframeTrack for bone rotation animation
 */
function createBoneRotationTrack(boneName, keyframes) {
  const times = [];
  const values = [];

  for (const kf of keyframes) {
    times.push(kf.time);
    // Convert Euler to Quaternion for smooth interpolation
    const euler = new THREE.Euler(
      kf.rotation.x,
      kf.rotation.y,
      kf.rotation.z,
      'XYZ'
    );
    const quat = new THREE.Quaternion().setFromEuler(euler);
    values.push(quat.x, quat.y, quat.z, quat.w);
  }

  return new THREE.QuaternionKeyframeTrack(
    boneName + '.quaternion',
    times,
    values
  );
}

/**
 * Create walk animation clip for biped entities.
 * Resolves actual bone names per entity type and only creates tracks for
 * bones that exist on the mesh — prevents THREE.PropertyBinding warnings.
 *
 * @param {string} entityType - The entity type for bone name lookup
 * @param {object} bonesByName - Map of bone names that actually exist on this mesh
 */
function createBipedWalkClip(entityType, bonesByName) {
  const tracks = [];
  const duration = 1.0; // 1 second per full cycle
  const amplitude = 0.6; // Radians - leg swing amount

  // Resolve actual bone names for this entity type
  const map = BIPED_BONE_MAP[entityType];
  const leftLeg = map ? map.leftLeg : BIPED_BONES.LEFT_LEG;
  const rightLeg = map ? map.rightLeg : BIPED_BONES.RIGHT_LEG;
  const leftArm = map ? map.leftArm : BIPED_BONES.LEFT_ARM;
  const rightArm = map ? map.rightArm : BIPED_BONES.RIGHT_ARM;

  // Left leg - swings forward then back
  if (bonesByName[leftLeg]) {
    tracks.push(
      createBoneRotationTrack(leftLeg, [
        { time: 0.0, rotation: { x: amplitude, y: 0, z: 0 } },
        { time: 0.25, rotation: { x: 0, y: 0, z: 0 } },
        { time: 0.5, rotation: { x: -amplitude, y: 0, z: 0 } },
        { time: 0.75, rotation: { x: 0, y: 0, z: 0 } },
        { time: 1.0, rotation: { x: amplitude, y: 0, z: 0 } },
      ])
    );
  }

  // Right leg - opposite phase
  if (bonesByName[rightLeg]) {
    tracks.push(
      createBoneRotationTrack(rightLeg, [
        { time: 0.0, rotation: { x: -amplitude, y: 0, z: 0 } },
        { time: 0.25, rotation: { x: 0, y: 0, z: 0 } },
        { time: 0.5, rotation: { x: amplitude, y: 0, z: 0 } },
        { time: 0.75, rotation: { x: 0, y: 0, z: 0 } },
        { time: 1.0, rotation: { x: -amplitude, y: 0, z: 0 } },
      ])
    );
  }

  // Left arm - opposite to left leg (natural walking motion)
  if (bonesByName[leftArm]) {
    tracks.push(
      createBoneRotationTrack(leftArm, [
        { time: 0.0, rotation: { x: -amplitude * 0.5, y: 0, z: 0 } },
        { time: 0.25, rotation: { x: 0, y: 0, z: 0 } },
        { time: 0.5, rotation: { x: amplitude * 0.5, y: 0, z: 0 } },
        { time: 0.75, rotation: { x: 0, y: 0, z: 0 } },
        { time: 1.0, rotation: { x: -amplitude * 0.5, y: 0, z: 0 } },
      ])
    );
  }

  // Right arm - opposite to right leg
  if (bonesByName[rightArm]) {
    tracks.push(
      createBoneRotationTrack(rightArm, [
        { time: 0.0, rotation: { x: amplitude * 0.5, y: 0, z: 0 } },
        { time: 0.25, rotation: { x: 0, y: 0, z: 0 } },
        { time: 0.5, rotation: { x: -amplitude * 0.5, y: 0, z: 0 } },
        { time: 0.75, rotation: { x: 0, y: 0, z: 0 } },
        { time: 1.0, rotation: { x: amplitude * 0.5, y: 0, z: 0 } },
      ])
    );
  }

  return new THREE.AnimationClip('walk', duration, tracks);
}

/**
 * Create idle animation clip for biped entities (subtle breathing/swaying).
 * Only creates tracks for bones that exist on this mesh.
 *
 * @param {string} entityType - The entity type for bone name lookup
 * @param {object} bonesByName - Map of bone names that actually exist on this mesh
 */
function createBipedIdleClip(entityType, bonesByName) {
  const tracks = [];
  const duration = 2.0; // Slower, more relaxed
  const breathAmplitude = 0.02; // Very subtle

  // Resolve actual bone names
  const map = BIPED_BONE_MAP[entityType];
  const leftArm = map ? map.leftArm : BIPED_BONES.LEFT_ARM;
  const rightArm = map ? map.rightArm : BIPED_BONES.RIGHT_ARM;

  // Subtle body sway
  if (bonesByName[BIPED_BONES.BODY]) {
    tracks.push(
      createBoneRotationTrack(BIPED_BONES.BODY, [
        { time: 0.0, rotation: { x: 0, y: 0, z: 0 } },
        { time: 1.0, rotation: { x: breathAmplitude, y: 0, z: 0 } },
        { time: 2.0, rotation: { x: 0, y: 0, z: 0 } },
      ])
    );
  }

  // Arms at rest with slight movement
  if (bonesByName[leftArm]) {
    tracks.push(
      createBoneRotationTrack(leftArm, [
        { time: 0.0, rotation: { x: 0, y: 0, z: 0.05 } },
        { time: 1.0, rotation: { x: 0, y: 0, z: 0.08 } },
        { time: 2.0, rotation: { x: 0, y: 0, z: 0.05 } },
      ])
    );
  }

  if (bonesByName[rightArm]) {
    tracks.push(
      createBoneRotationTrack(rightArm, [
        { time: 0.0, rotation: { x: 0, y: 0, z: -0.05 } },
        { time: 1.0, rotation: { x: 0, y: 0, z: -0.08 } },
        { time: 2.0, rotation: { x: 0, y: 0, z: -0.05 } },
      ])
    );
  }

  return new THREE.AnimationClip('idle', duration, tracks);
}

/**
 * Create walk animation clip for quadruped entities.
 * Uses bone-name mapping to handle entities with non-standard leg bone names
 * (e.g. cat uses backLegL/backLegR/frontLegL/frontLegR instead of leg0-leg3).
 *
 * @param {string} entityType - The entity type for bone name lookup
 * @param {object} bonesByName - Map of bone names that actually exist on this mesh
 */
function createQuadrupedWalkClip(entityType, bonesByName) {
  const tracks = [];
  const duration = 1.0;
  const amplitude = 0.5;

  // Resolve actual bone names for this entity type
  const map = QUADRUPED_BONE_MAP[entityType]
  const leg0 = map ? map.leg0 : 'leg0'
  const leg1 = map ? map.leg1 : 'leg1'
  const leg2 = map ? map.leg2 : 'leg2'
  const leg3 = map ? map.leg3 : 'leg3'

  // Only create tracks for bones that actually exist on this mesh.
  // This prevents THREE.PropertyBinding warnings for missing bones.
  // Diagonal pairs move together (like a trotting animal)
  if (bonesByName[leg0]) {
    tracks.push(
      createBoneRotationTrack(leg0, [
        { time: 0.0, rotation: { x: amplitude, y: 0, z: 0 } },
        { time: 0.5, rotation: { x: -amplitude, y: 0, z: 0 } },
        { time: 1.0, rotation: { x: amplitude, y: 0, z: 0 } },
      ])
    );
  }

  if (bonesByName[leg3]) {
    tracks.push(
      createBoneRotationTrack(leg3, [
        { time: 0.0, rotation: { x: amplitude, y: 0, z: 0 } },
        { time: 0.5, rotation: { x: -amplitude, y: 0, z: 0 } },
        { time: 1.0, rotation: { x: amplitude, y: 0, z: 0 } },
      ])
    );
  }

  // Front left + back right (opposite phase)
  if (bonesByName[leg1]) {
    tracks.push(
      createBoneRotationTrack(leg1, [
        { time: 0.0, rotation: { x: -amplitude, y: 0, z: 0 } },
        { time: 0.5, rotation: { x: amplitude, y: 0, z: 0 } },
        { time: 1.0, rotation: { x: -amplitude, y: 0, z: 0 } },
      ])
    );
  }

  if (bonesByName[leg2]) {
    tracks.push(
      createBoneRotationTrack(leg2, [
        { time: 0.0, rotation: { x: -amplitude, y: 0, z: 0 } },
        { time: 0.5, rotation: { x: amplitude, y: 0, z: 0 } },
        { time: 1.0, rotation: { x: -amplitude, y: 0, z: 0 } },
      ])
    );
  }

  return new THREE.AnimationClip('walk', duration, tracks);
}

/**
 * Create idle animation for quadrupeds
 */
function createQuadrupedIdleClip() {
  const tracks = [];
  const duration = 3.0;

  // Subtle head movement
  tracks.push(
    createBoneRotationTrack(QUADRUPED_BONES.HEAD, [
      { time: 0.0, rotation: { x: 0, y: 0, z: 0 } },
      { time: 1.5, rotation: { x: 0.05, y: 0.1, z: 0 } },
      { time: 3.0, rotation: { x: 0, y: 0, z: 0 } },
    ])
  );

  return new THREE.AnimationClip('idle', duration, tracks);
}

// Entities with biped bone names but non-standard casing (piglin uses lowercase)
const BIPED_MAPPED_ENTITIES = [
  'piglin',
  'piglin_brute',
  'zombified_piglin',
  'pillager',
];

/**
 * Determine entity category for animation selection
 */
function getEntityCategory(entityType) {
  if (!entityType) return 'unknown';
  const type = entityType.toLowerCase().replace('minecraft:', '');
  if (BIPED_ENTITIES.includes(type)) return 'biped';
  if (BIPED_MAPPED_ENTITIES.includes(type)) return 'biped';
  if (QUADRUPED_ENTITIES.includes(type)) return 'quadruped';
  // Bipeds with quadruped-style bone naming (leg0/leg1 only) — animate as bipeds
  if (BIPED_QUADRUPED_ENTITIES.includes(type)) return 'biped';
  // Creeper uses leg0-leg3 but is really a quadruped body plan
  if (type === 'creeper') return 'quadruped';
  // Multi-legged entities get quadruped animation on their first 4 legs
  if (MULTI_LEGGED_ENTITIES.includes(type)) return 'quadruped';
  // Witch has no limb bones — skip animation
  return 'unknown';
}

/**
 * Calculate animation speed based on movement velocity
 */
function calculateAnimationSpeed(velocity) {
  const horizontalSpeed = Math.sqrt(
    velocity.x * velocity.x + velocity.z * velocity.z
  );
  // Walking speed ~4.3 blocks/sec, running ~5.6
  if (horizontalSpeed < 0.1) return 0; // Idle
  if (horizontalSpeed < 4.5) return horizontalSpeed / 4.3; // Normal walk speed
  return horizontalSpeed / 4.3; // Scale with speed
}

// ============================================================================
// Entity Mesh Creation
// ============================================================================

function getEntityMesh(entity, scene) {
  // When name is missing (e.g. entity update with only id/pos from entityMoved), use 'player'
  // so we render a proper mesh instead of a pink missing-texture cube
  const rawName = entity.name;
  const normalizedName =
    (rawName ? rawName.replace(/^minecraft:/, '') : null) || 'player';
  const textureVersion = globalThis.__MC_VERSION || '1.21.9';
  const loggedFallbacks = (globalThis.__ENTITY_FALLBACK_LOGGED ||= new Set());
  const loggedFailures = (globalThis.__ENTITY_LOAD_FAIL ||= new Set());
  if (loggedFailures.size > 500) loggedFailures.clear();
  const failureKey = normalizedName
    ? `${textureVersion}:${normalizedName}`
    : `unknown:${textureVersion}`;
  const fallbackMap = {
    glow_squid: 'squid',
    breeze: 'player',
    camel: 'horse',
    sniffer: 'cow',
    armadillo: 'pig',
    bogged: 'zombie',
    allay: 'vex',
    warden: 'iron_golem',
    frog: 'slime',
    tadpole: 'fish/cod',
  };
  const fallbackName = normalizedName ? fallbackMap[normalizedName] : null;
  if (normalizedName) {
    try {
      const e = new Entity(textureVersion, normalizedName, scene);
      // Store entity info in userData for extras setup
      e.mesh.userData.entityName = normalizedName;
      e.mesh.userData.entityNameRaw = rawName;
      e.mesh.userData.entityUsername = entity.username;
      e.mesh.userData.entityHeight = entity.height || 1.8;
      e.mesh.userData.entityWidth = entity.width || 0.6;
      return e.mesh;
    } catch (err) {
      if (fallbackName) {
        try {
          const e = new Entity(textureVersion, fallbackName, scene);
          e.mesh.userData.entityName = fallbackName;
          e.mesh.userData.entityNameRaw = rawName;
          e.mesh.userData.entityNameFallback = normalizedName;
          e.mesh.userData.entityUsername = entity.username;
          e.mesh.userData.entityHeight = entity.height || 1.8;
          e.mesh.userData.entityWidth = entity.width || 0.6;
          if (!loggedFallbacks.has(normalizedName)) {
            loggedFallbacks.add(normalizedName);
            console.warn(
              `[viewer] Entity fallback: ${normalizedName} -> ${fallbackName}`
            );
          }
          return e.mesh;
        } catch (fallbackErr) {
          if (!loggedFailures.has(failureKey)) {
            loggedFailures.add(failureKey);
            console.warn(
              `[viewer] Entity load failed: ${normalizedName} -> ${fallbackName} (${fallbackErr?.message || fallbackErr}) [version=${textureVersion}, raw=${rawName}] (check /mc-assets/entity/${textureVersion}/...)`
            );
          }
        }
      }
      if (!loggedFailures.has(failureKey)) {
        loggedFailures.add(failureKey);
        console.warn(
          `[viewer] Entity load failed: ${normalizedName} (${err?.message || err}) [version=${textureVersion}, raw=${rawName}] (check /mc-assets/entity/${textureVersion}/...)`
        );
      }
    }
  } else if (!loggedFailures.has(failureKey)) {
    loggedFailures.add(failureKey);
    console.warn(
      `[viewer] Entity load failed: missing name [version=${textureVersion}, raw=${rawName}] (check /mc-assets/entity/${textureVersion}/...)`
    );
  }

  // Use defaults if entity dimensions are missing to prevent NaN geometry
  const width = entity.width || 0.6;
  const height = entity.height || 1.8;
  const geometry = new THREE.BoxGeometry(width, height, width);
  geometry.translate(0, height / 2, 0);
  const material = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  const cube = new THREE.Mesh(geometry, material);
  // Store entity info for fallback entities too
  cube.userData.entityHeight = height;
  cube.userData.entityWidth = width;
  cube.userData.entityUsername = entity.username;
  return cube;
}

// ============================================================================
// Entities Manager Class
// ============================================================================

class Entities {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera; // Store camera reference for name tag updates
    this.entities = {};
    // Animation system
    this.animationMixers = new Map(); // entityId -> THREE.AnimationMixer
    this.animationActions = new Map(); // entityId -> { idle, walk }
    this.entityStates = new Map(); // entityId -> { lastPos, velocity, isMoving }
    this.lastUpdateTime = performance.now();
    // Equipment rendering system
    this.equipmentManagers = new Map(); // entityId -> EquipmentManager
    // Entity extras (name tags, capes, shadows)
    this.extrasManagers = new Map(); // entityId -> EntityExtrasManager

    // Frustum culling + distance throttling — preallocated to avoid GC pressure
    this._frustum = new THREE.Frustum();
    this._projScreenMatrix = new THREE.Matrix4();
    this._entityWorldPos = new THREE.Vector3();
    this._frameCount = 0;
  }

  /**
   * Set camera reference (called from viewer after construction)
   */
  setCamera(camera) {
    this.camera = camera;
  }

  clear() {
    for (const mesh of Object.values(this.entities)) {
      this.scene.remove(mesh);
      dispose3(mesh);
    }
    this.entities = {};
    // Clear animation data
    this.animationMixers.clear();
    this.animationActions.clear();
    this.entityStates.clear();
    // Clear equipment managers
    for (const manager of this.equipmentManagers.values()) {
      manager.dispose();
    }
    this.equipmentManagers.clear();
    // Clear extras managers
    for (const manager of this.extrasManagers.values()) {
      manager.dispose();
    }
    this.extrasManagers.clear();
  }

  /**
   * Set up animation system for an entity
   */
  setupEntityAnimation(entityId, mesh) {
    const entityType = mesh.userData.entityType;
    const category = getEntityCategory(entityType);

    if (category === 'unknown') {
      return; // No animation for unknown entities
    }

    // Find the first skinned mesh with bones
    let skinnedMesh = null;
    mesh.traverse((child) => {
      if (child.isSkinnedMesh && child.userData.bonesByName) {
        skinnedMesh = child;
      }
    });

    if (!skinnedMesh || !skinnedMesh.userData.bonesByName) {
      return; // No bones to animate
    }

    // Create animation mixer for this entity
    const mixer = new THREE.AnimationMixer(skinnedMesh);
    this.animationMixers.set(entityId, mixer);

    // Create appropriate animation clips based on category.
    // Pass bonesByName so clip creators can skip missing bones (avoids
    // THREE.PropertyBinding warnings for entities that lack certain bones).
    const bonesByName = skinnedMesh.userData.bonesByName;
    let idleClip, walkClip;
    if (category === 'biped') {
      idleClip = createBipedIdleClip(entityType, bonesByName);
      walkClip = createBipedWalkClip(entityType, bonesByName);
    } else if (category === 'quadruped') {
      idleClip = createQuadrupedIdleClip();
      walkClip = createQuadrupedWalkClip(entityType, bonesByName);
    }

    // Only set up animation if clips have actual tracks. Sub-geometries like
    // the player's cape mesh have no limb bones, so all tracks get filtered out.
    if (idleClip && walkClip && (idleClip.tracks.length > 0 || walkClip.tracks.length > 0)) {
      const idleAction = mixer.clipAction(idleClip);
      const walkAction = mixer.clipAction(walkClip);

      // Configure actions
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
      walkAction.setLoop(THREE.LoopRepeat, Infinity);

      // Start with idle
      idleAction.play();

      this.animationActions.set(entityId, {
        idle: idleAction,
        walk: walkAction,
        current: 'idle',
      });
    }

    // Initialize entity state
    this.entityStates.set(entityId, {
      lastPos: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      isMoving: false,
    });
  }

  /**
   * Transition between animation states
   */
  transitionAnimation(entityId, toState, speed = 1.0) {
    const actions = this.animationActions.get(entityId);
    if (!actions || actions.current === toState) return;

    const fromAction = actions[actions.current];
    const toAction = actions[toState];

    if (!fromAction || !toAction) return;

    // Crossfade duration
    const fadeDuration = 0.2;

    // Set the playback speed for walk animation
    if (toState === 'walk') {
      toAction.setEffectiveTimeScale(Math.max(0.5, speed));
    }

    // Crossfade
    toAction.reset();
    toAction.setEffectiveWeight(1);
    toAction.play();
    fromAction.crossFadeTo(toAction, fadeDuration, true);

    actions.current = toState;
  }

  update(entity) {
    if (!this.entities[entity.id]) {
      const mesh = getEntityMesh(entity, this.scene);
      if (!mesh) return;
      this.entities[entity.id] = mesh;
      this.scene.add(mesh);

      // Set up animation for new entity
      this.setupEntityAnimation(entity.id, mesh);

      // Set up equipment manager for new entity
      this.equipmentManagers.set(entity.id, new EquipmentManager());

      // Set up entity extras (name tags, shadows, capes)
      const extrasManager = new EntityExtrasManager();
      const isPlayer =
        entity.name === 'player' || mesh.userData.entityName === 'player';
      extrasManager.setup(mesh, {
        name: entity.username || mesh.userData.entityUsername,
        height: entity.height || mesh.userData.entityHeight || 1.8,
        width: entity.width || mesh.userData.entityWidth || 0.6,
        showCape: isPlayer, // Only players get capes for now
        capeColor: 0x2244aa,
        showShadow: true,
      });
      this.extrasManagers.set(entity.id, extrasManager);
    }

    const e = this.entities[entity.id];

    if (entity.delete) {
      this.scene.remove(e);
      dispose3(e);
      delete this.entities[entity.id];
      // Clean up animation data
      this.animationMixers.delete(entity.id);
      this.animationActions.delete(entity.id);
      this.entityStates.delete(entity.id);
      // Clean up equipment manager
      const equipmentManager = this.equipmentManagers.get(entity.id);
      if (equipmentManager) {
        equipmentManager.dispose();
        this.equipmentManagers.delete(entity.id);
      }
      // Clean up extras manager
      const extrasManager = this.extrasManagers.get(entity.id);
      if (extrasManager) {
        extrasManager.dispose();
        this.extrasManagers.delete(entity.id);
      }
      return;
    }

    // Update equipment if present
    if (entity.equipment) {
      const equipmentManager = this.equipmentManagers.get(entity.id);
      if (equipmentManager && equipmentManager.hasChanged(entity.equipment)) {
        equipmentManager.update(e, entity.equipment);
      }
    }

    if (entity.pos) {
      const newPos = new THREE.Vector3(
        entity.pos.x,
        entity.pos.y,
        entity.pos.z
      );

      // Calculate velocity for animation
      const state = this.entityStates.get(entity.id);
      if (state) {
        const deltaTime = 0.05; // 50ms update interval
        state.velocity
          .subVectors(newPos, state.lastPos)
          .divideScalar(deltaTime);
        state.lastPos.copy(newPos);

        // Determine animation state based on movement
        const speed = calculateAnimationSpeed(state.velocity);
        const isMoving = speed > 0.1;

        if (isMoving !== state.isMoving) {
          state.isMoving = isMoving;
          this.transitionAnimation(
            entity.id,
            isMoving ? 'walk' : 'idle',
            speed
          );
        } else if (isMoving) {
          // Update walk speed
          const actions = this.animationActions.get(entity.id);
          if (actions && actions.walk) {
            actions.walk.setEffectiveTimeScale(Math.max(0.5, speed));
          }
        }
      }

      new TWEEN.Tween(e.position)
        .to({ x: entity.pos.x, y: entity.pos.y, z: entity.pos.z }, 50)
        .start();
    }
    if (entity.yaw) {
      const da = (entity.yaw - e.rotation.y) % (Math.PI * 2);
      const dy = ((2 * da) % (Math.PI * 2)) - da;
      new TWEEN.Tween(e.rotation).to({ y: e.rotation.y + dy }, 50).start();
    }
  }

  /**
   * Update all animation mixers - call this from the render loop.
   *
   * Applies frustum culling and distance-based throttling:
   * - Off-screen entities: hidden, animation frozen (zero CPU cost)
   * - < 32 blocks: full animation rate
   * - 32-64 blocks: half rate (every other frame, compensated with 2× deltaTime)
   * - > 64 blocks: animation frozen (last pose holds)
   *
   * TWEEN position/rotation updates happen in update() driven by socket events,
   * so entity positions stay correct even when animation is frozen.
   */
  updateAnimations(deltaTime) {
    this._frameCount++;

    // Compute view frustum once per frame
    if (this.camera) {
      this._projScreenMatrix.multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse
      );
      this._frustum.setFromProjectionMatrix(this._projScreenMatrix);
    }

    // Distance thresholds (squared to avoid sqrt)
    const NEAR_SQ = 32 * 32;   // 1024
    const FAR_SQ = 64 * 64;    // 4096

    for (const [entityId, mixer] of this.animationMixers) {
      const mesh = this.entities[entityId];
      if (!mesh) continue;

      // Get world position into reusable vector (no allocation)
      mesh.getWorldPosition(this._entityWorldPos);

      // Frustum test — hide entities outside the camera view
      if (this.camera && !this._frustum.containsPoint(this._entityWorldPos)) {
        mesh.visible = false;
        continue;
      }

      mesh.visible = true;

      if (this.camera) {
        const distSq = this.camera.position.distanceToSquared(this._entityWorldPos);

        if (distSq > FAR_SQ) {
          // > 64 blocks: freeze animation entirely
          continue;
        } else if (distSq > NEAR_SQ) {
          // 32-64 blocks: update every other frame at 2× speed to compensate.
          // Stagger by entityId so not all entities skip the same frame.
          const numId = typeof entityId === 'number' ? entityId : parseInt(entityId, 10) || 0;
          if ((numId + this._frameCount) % 2 !== 0) continue;
          mixer.update(deltaTime * 2);
          continue;
        }
      }

      // < 32 blocks (or no camera): full rate
      mixer.update(deltaTime);
    }

    // Update entity extras (name tags, capes, shadows)
    if (this.camera) {
      for (const [entityId, extrasManager] of this.extrasManagers) {
        const mesh = this.entities[entityId];
        if (!mesh || !mesh.visible) continue;

        // Skip extras for distant entities
        mesh.getWorldPosition(this._entityWorldPos);
        const distSq = this.camera.position.distanceToSquared(this._entityWorldPos);
        if (distSq > FAR_SQ) continue;

        // Get entity state for velocity
        const state = this.entityStates.get(entityId);
        const velocity = state
          ? calculateAnimationSpeed(state.velocity) / 5.0
          : 0;

        extrasManager.update(this.camera, this._entityWorldPos, deltaTime, velocity);
      }
    }
  }
}

module.exports = { Entities };
