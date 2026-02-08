/**
 * Viewer Enhancements Module
 *
 * Provides additional improvements to the viewer for better
 * entity rendering, lighting, and animation support.
 *
 * Features:
 * - Skeletal walk cycle animations for biped and quadruped entities
 * - Smooth animation state transitions (idle, walk, run, jump, fall)
 * - Day/night lighting cycle synchronization
 * - Entity position/rotation interpolation
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import * as THREE from 'three';
import {
  EntityAnimationManager,
  getAnimationManager,
  type EntityMovementData,
} from './asset-pipeline/entity-animations';

export interface ViewerEnhancementOptions {
  enableEntityAnimation?: boolean;
  enableSkeletalAnimation?: boolean;
  enableLightingUpdates?: boolean;
  enableTimeSync?: boolean;
  entityUpdateInterval?: number;
  lightingUpdateInterval?: number;
  timeSyncInterval?: number;
  animationFrameRate?: number;
}

/**
 * Default enhancement options
 */
const DEFAULT_OPTIONS: Required<ViewerEnhancementOptions> = {
  enableEntityAnimation: true,
  enableSkeletalAnimation: true,
  enableLightingUpdates: true,
  enableTimeSync: true,
  entityUpdateInterval: 100, // ms
  lightingUpdateInterval: 1000, // ms
  timeSyncInterval: 5000, // ms
  animationFrameRate: 60, // fps
};

/**
 * Enhanced viewer class that provides better rendering capabilities
 */
export class EnhancedViewer extends EventEmitter {
  private bot: any;
  private options: Required<ViewerEnhancementOptions>;
  private entityUpdateInterval?: NodeJS.Timeout;
  private lightingUpdateInterval?: NodeJS.Timeout;
  private timeSyncInterval?: NodeJS.Timeout;
  private animationFrameId?: NodeJS.Timeout;
  private isActive = false;
  private animationManager: EntityAnimationManager;
  private lastAnimationTime = 0;
  private entityVelocities: Map<number, THREE.Vector3> = new Map();
  private entityLastPositions: Map<number, THREE.Vector3> = new Map();

  constructor(bot: any, options: ViewerEnhancementOptions = {}) {
    super();
    this.bot = bot;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.animationManager = getAnimationManager();
  }

  /**
   * Start the enhanced viewer features
   */
  start(): void {
    if (this.isActive) {
      return;
    }

    this.isActive = true;

    if (this.options.enableEntityAnimation) {
      this.startEntityAnimation();
    }

    if (this.options.enableLightingUpdates) {
      this.startLightingUpdates();
    }

    if (this.options.enableTimeSync) {
      this.startTimeSync();
    }

    if (this.options.enableSkeletalAnimation) {
      this.startSkeletalAnimation();
    }

    this.emit('started');
  }

  /**
   * Stop the enhanced viewer features
   */
  stop(): void {
    this.isActive = false;

    if (this.entityUpdateInterval) {
      clearInterval(this.entityUpdateInterval);
      this.entityUpdateInterval = undefined;
    }

    if (this.lightingUpdateInterval) {
      clearInterval(this.lightingUpdateInterval);
      this.lightingUpdateInterval = undefined;
    }

    if (this.timeSyncInterval) {
      clearInterval(this.timeSyncInterval);
      this.timeSyncInterval = undefined;
    }

    if (this.animationFrameId !== undefined) {
      clearInterval(this.animationFrameId);
      this.animationFrameId = undefined;
    }

    this.emit('stopped');
  }

  /**
   * Start entity animation updates
   */
  private startEntityAnimation(): void {
    this.entityUpdateInterval = setInterval(() => {
      try {
        if (!this.bot.entities || !this.bot.viewer) {
          return;
        }

        // Update all entities for better animation
        Object.values(this.bot.entities).forEach((entity: any) => {
          if (entity && entity.position && entity.type) {
            // Emit entity updates for better rendering
            this.bot.viewer.emit('entity', entity);

            // Emit custom animation events for specific entity types
            if (entity.type === 'player' || entity.type.includes('mob')) {
              this.emit('entityAnimation', {
                id: entity.id,
                type: entity.type,
                position: entity.position,
                yaw: entity.yaw,
                pitch: entity.pitch,
                onGround: entity.onGround,
              });
            }
          }
        });
      } catch (err) {
        // Ignore entity update errors
        this.emit('error', { type: 'entityUpdate', error: err });
      }
    }, this.options.entityUpdateInterval);
  }

  /**
   * Start lighting updates for day/night cycle
   */
  private startLightingUpdates(): void {
    this.lightingUpdateInterval = setInterval(() => {
      try {
        if (!this.bot.world || !this.bot.viewer) {
          return;
        }

        // Emit time updates for lighting changes
        if (this.bot.world.time !== undefined) {
          this.bot.viewer.emit('time', this.bot.world.time);

          // Calculate lighting based on time
          const time = this.bot.world.time;
          const isDay = time >= 0 && time < 12000;
          const isNight = time >= 12000 && time < 24000;

          this.emit('lightingUpdate', {
            time,
            isDay,
            isNight,
            lightLevel: isDay ? 15 : isNight ? 4 : 8,
          });
        }
      } catch (err) {
        // Ignore lighting update errors
        this.emit('error', { type: 'lightingUpdate', error: err });
      }
    }, this.options.lightingUpdateInterval);
  }

  /**
   * Start time synchronization
   */
  private startTimeSync(): void {
    this.timeSyncInterval = setInterval(() => {
      try {
        if (!this.bot.world) {
          return;
        }

        // Emit time sync events
        this.emit('timeSync', {
          time: this.bot.world.time,
          day: Math.floor(this.bot.world.time / 24000),
          hour: Math.floor((this.bot.world.time % 24000) / 1000),
        });
      } catch (err) {
        // Ignore time sync errors
        this.emit('error', { type: 'timeSync', error: err });
      }
    }, this.options.timeSyncInterval);
  }

  /**
   * Start the skeletal animation loop.
   *
   * This runs at the specified frame rate (default 60fps) and:
   * 1. Registers new entities with the animation manager
   * 2. Calculates entity velocities from position changes
   * 3. Updates animation states based on movement
   * 4. Advances all animation mixers
   *
   * Note: Uses setInterval instead of requestAnimationFrame since this
   * runs server-side in Node.js. The actual rendering happens client-side.
   */
  private startSkeletalAnimation(): void {
    this.lastAnimationTime = Date.now();

    // Calculate interval from frame rate (default 60fps = ~16.67ms)
    const intervalMs = 1000 / this.options.animationFrameRate;

    this.animationFrameId = setInterval(() => {
      if (!this.isActive) return;

      const now = Date.now();
      const deltaTime = (now - this.lastAnimationTime) / 1000; // Convert to seconds
      this.lastAnimationTime = now;

      try {
        this.updateEntityAnimations(deltaTime);
      } catch (err) {
        this.emit('error', { type: 'skeletalAnimation', error: err });
      }
    }, intervalMs);
  }

  /**
   * Update all entity animations for this frame
   */
  private updateEntityAnimations(deltaTime: number): void {
    if (!this.bot.entities || !this.bot.viewer) {
      return;
    }

    // Process each entity
    for (const entity of Object.values(this.bot.entities) as any[]) {
      if (!entity || !entity.position || !entity.type) {
        continue;
      }

      const entityId = entity.id as number;
      const entityType = entity.type as string;

      // Try to get the entity mesh from the viewer
      const mesh = this.getEntityMesh(entityId);
      if (!mesh) {
        continue;
      }

      // Register entity if not already managed
      if (!this.animationManager.isManaged(entityId)) {
        this.animationManager.registerEntity(entityId, mesh, entityType);
        this.entityLastPositions.set(
          entityId,
          new THREE.Vector3(entity.position.x, entity.position.y, entity.position.z)
        );
        this.entityVelocities.set(entityId, new THREE.Vector3(0, 0, 0));
      }

      // Calculate velocity from position change
      const currentPos = new THREE.Vector3(
        entity.position.x,
        entity.position.y,
        entity.position.z
      );
      const lastPos = this.entityLastPositions.get(entityId);

      if (lastPos && deltaTime > 0) {
        const velocity = currentPos.clone().sub(lastPos).divideScalar(deltaTime);
        this.entityVelocities.set(entityId, velocity);
      }

      this.entityLastPositions.set(entityId, currentPos.clone());

      // Build movement data for animation state machine
      const velocity = this.entityVelocities.get(entityId) || new THREE.Vector3();
      const movement: EntityMovementData = {
        velocity,
        onGround: entity.onGround ?? true,
        inWater: this.isEntityInWater(entity),
        isAttacking: false, // TODO: Track attack state
        isSneaking: entity.metadata?.[0]?.value & 0x02 ? true : false, // Crouching flag
        isSprinting: entity.metadata?.[0]?.value & 0x08 ? true : false, // Sprinting flag
      };

      // Update animation state
      this.animationManager.updateEntityState(entityId, movement);
    }

    // Clean up entities that no longer exist
    this.cleanupDespawnedEntities();

    // Advance all animation mixers
    this.animationManager.update(deltaTime);
  }

  /**
   * Get the Three.js mesh for an entity from the viewer
   */
  private getEntityMesh(entityId: number): THREE.Object3D | null {
    try {
      // Access the entities manager from the viewer
      const viewer = this.bot.viewer;
      if (!viewer || !viewer.world || !viewer.world.entities) {
        return null;
      }

      const entityMesh = viewer.world.entities.entities?.[entityId];
      return entityMesh || null;
    } catch {
      return null;
    }
  }

  /**
   * Check if an entity is in water
   */
  private isEntityInWater(entity: any): boolean {
    try {
      if (!this.bot.world || !entity.position) {
        return false;
      }

      const block = this.bot.world.getBlock(entity.position);
      if (!block) return false;

      return block.name === 'water' || block.name === 'flowing_water';
    } catch {
      return false;
    }
  }

  /**
   * Remove animations for entities that have despawned
   */
  private cleanupDespawnedEntities(): void {
    const currentEntityIds = new Set(
      Object.keys(this.bot.entities || {}).map(Number)
    );

    // Check each managed entity
    for (const entityId of this.entityLastPositions.keys()) {
      if (!currentEntityIds.has(entityId)) {
        this.animationManager.unregisterEntity(entityId);
        this.entityLastPositions.delete(entityId);
        this.entityVelocities.delete(entityId);
      }
    }
  }

  /**
   * Get current enhancement status
   */
  getStatus(): {
    isActive: boolean;
    options: Required<ViewerEnhancementOptions>;
    intervals: {
      entityAnimation: boolean;
      lightingUpdates: boolean;
      timeSync: boolean;
      skeletalAnimation: boolean;
    };
    animationStats: {
      managedEntities: number;
    };
  } {
    return {
      isActive: this.isActive,
      options: this.options,
      intervals: {
        entityAnimation: !!this.entityUpdateInterval,
        lightingUpdates: !!this.lightingUpdateInterval,
        timeSync: !!this.timeSyncInterval,
        skeletalAnimation: this.animationFrameId !== undefined,
      },
      animationStats: {
        managedEntities: this.animationManager.getManagedCount(),
      },
    };
  }

  /**
   * Get the animation manager for direct access
   */
  getAnimationManager(): EntityAnimationManager {
    return this.animationManager;
  }
}

/**
 * Create and start enhanced viewer for a bot
 */
export function createEnhancedViewer(
  bot: any,
  options: ViewerEnhancementOptions = {}
): EnhancedViewer {
  const enhancedViewer = new EnhancedViewer(bot, options);
  enhancedViewer.start();
  return enhancedViewer;
}

/**
 * Apply viewer enhancements to an existing bot
 */
export function applyViewerEnhancements(
  bot: any,
  options: ViewerEnhancementOptions = {}
): EnhancedViewer {
  // Create enhanced viewer
  const enhancedViewer = createEnhancedViewer(bot, options);

  // Attach to bot for easy access
  bot.enhancedViewer = enhancedViewer;

  return enhancedViewer;
}
