/**
 * Ray Casting Engine - High-performance visible-only sensing
 *
 * Implements both Mineflayer raycast and custom DDA algorithms for precise
 * occlusion discipline and transparent block handling.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  Vec3,
  Direction,
  Orientation,
  RaycastHit,
  SweepResult,
  SensingConfig,
  RayTraversalConfig,
  DDAState,
  SamplingStrategy,
  IRaycastEngine,
  validateSweepResult,
  distance,
  normalize,
  isInFrustum,
  orientationToDirection,
} from '../types';

export interface RaycastEngineEvents {
  'ray-cast': [{ origin: Vec3; direction: Direction; hit: RaycastHit | null }];
  'sweep-progress': [{ completed: number; total: number }];
  'performance-warning': [{ metric: string; value: number; threshold: number }];
  'world-updated': [{ blocks: Array<{ position: Vec3; blockType: string }> }];
}

/**
 * Bot interface for raycast operations
 */
interface BotInterface {
  entity: {
    position: Vec3;
    height: number;
    yaw: number;
    pitch: number;
  };
  world: {
    raycast(
      origin: Vec3,
      direction: Direction,
      maxDistance: number,
      matcher?: (block: any) => boolean
    ): RaycastHit | null;
  };
  blockAt(position: Vec3): { name: string; type: number } | null;
}

/**
 * High-performance ray casting engine with occlusion discipline
 */
export class RaycastEngine
  extends EventEmitter<RaycastEngineEvents>
  implements IRaycastEngine
{
  private transparentBlocks = new Set<string>();
  private targetBlocks = new Set<string>();
  private bot?: BotInterface; // Bot interface for raycast operations

  constructor(
    private config: SensingConfig,
    bot?: BotInterface
  ) {
    super();
    this.bot = bot;
    this.updateTransparentBlocks(config.transparentBlocks);
    this.updateTargetBlocks(config.targetBlocks);
  }

  /**
   * Cast a single ray and return hit information
   */
  raycast(
    origin: Vec3,
    direction: Direction,
    maxDistance: number,
    config: RayTraversalConfig = {
      algorithm: 'mineflayer',
      maxSteps: 128,
      earlyExit: true,
      recordPath: false,
    }
  ): RaycastHit | null {
    const normalizedDir = normalize(direction);

    try {
      let hit: RaycastHit | null = null;

      if (config.algorithm === 'mineflayer' && this.bot) {
        hit = this.mineflayerRaycast(origin, normalizedDir, maxDistance);
      } else {
        hit = this.ddaRaycast(origin, normalizedDir, maxDistance, config);
      }

      this.emit('ray-cast', { origin, direction: normalizedDir, hit });
      return hit;
    } catch (error) {
      console.error('Raycast error:', error);
      return null;
    }
  }

  /**
   * Cast multiple rays in a sweep pattern
   */
  async sweep(
    origin: Vec3,
    orientation: Orientation,
    config: SensingConfig
  ): Promise<SweepResult> {
    const startTime = Date.now();
    const observations: any[] = [];
    let raysCast = 0;
    let hits = 0;
    let totalDistance = 0;

    // Generate ray directions based on sampling strategy
    const directions = this.generateSweepDirections(orientation, config);
    const maxRays = Math.min(directions.length, config.maxRaysPerTick);

    for (let i = 0; i < maxRays; i++) {
      const direction = directions[i];
      const hit = this.raycast(origin, direction, config.maxDistance);

      raysCast++;

      if (hit) {
        hits++;
        totalDistance += hit.distance;

        // Check if this is a target block
        if (this.targetBlocks.has(hit.blockId)) {
          observations.push({
            blockId: hit.blockId,
            pos: hit.position,
            distance: hit.distance,
            normal: hit.faceVector,
            confidence: 1.0,
            lastSeen: Date.now(),
            source: 'raycast',
          });
        }
      }

      // Emit progress periodically
      if (i % 50 === 0) {
        this.emit('sweep-progress', { completed: i, total: maxRays });
      }

      // Check time budget
      const elapsed = Date.now() - startTime;
      if (elapsed > config.tickBudgetMs) {
        this.emit('performance-warning', {
          metric: 'sweep_duration',
          value: elapsed,
          threshold: config.tickBudgetMs,
        });
        break;
      }
    }

    const duration = Date.now() - startTime;
    const avgDistance = hits > 0 ? totalDistance / hits : 0;

    const result: SweepResult = {
      observations,
      raysCast,
      duration,
      timestamp: Date.now(),
      pose: {
        position: origin,
        orientation,
      },
      performance: {
        raysPerSecond: raysCast / (duration / 1000),
        avgRayDistance: avgDistance,
        hitRate: raysCast > 0 ? hits / raysCast : 0,
      },
    };

    return validateSweepResult(result);
  }

  /**
   * Check if a block type is transparent for ray traversal
   */
  isTransparent(blockId: string): boolean {
    return this.transparentBlocks.has(blockId);
  }

  /**
   * Update transparency configuration
   */
  setTransparentBlocks(blockIds: string[]): void {
    this.updateTransparentBlocks(blockIds);
  }

  /**
   * Update target block configuration
   */
  setTargetBlocks(blockIds: string[]): void {
    this.updateTargetBlocks(blockIds);
  }

  /**
   * Update bot reference (for Mineflayer integration)
   */
  setBot(bot: BotInterface): void {
    this.bot = bot;
  }

  /**
   * Compatibility methods for test interfaces
   */
  castRay(
    origin: Vec3,
    direction: Direction,
    maxDistance: number
  ): RaycastHit | null {
    return this.raycast(origin, direction, maxDistance);
  }

  castCone(
    origin: Vec3,
    direction: Direction,
    angle: number,
    rays: number,
    maxDistance: number
  ): RaycastHit[] {
    const hits: RaycastHit[] = [];
    const halfAngle = angle / 2;

    for (let i = 0; i < rays; i++) {
      // Generate ray directions in a cone pattern
      const t = i / (rays - 1);
      const currentAngle = -halfAngle + t * angle;

      // Simple cone ray distribution (could be improved with more sophisticated patterns)
      const coneDirection = {
        x:
          direction.x * Math.cos(currentAngle) -
          direction.z * Math.sin(currentAngle),
        y: direction.y,
        z:
          direction.x * Math.sin(currentAngle) +
          direction.z * Math.cos(currentAngle),
      };

      const hit = this.raycast(origin, coneDirection, maxDistance);
      if (hit) {
        hits.push(hit);
      }
    }

    return hits;
  }

  castGrid(
    origin: Vec3,
    direction: Direction,
    right: Direction,
    up: Direction,
    width: number,
    height: number,
    maxDistance: number
  ): RaycastHit[] {
    const hits: RaycastHit[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const u = x / (width - 1) - 0.5;
        const v = y / (height - 1) - 0.5;

        const rayDirection = {
          x: direction.x + u * right.x + v * up.x,
          y: direction.y + u * right.y + v * up.y,
          z: direction.z + u * right.z + v * up.z,
        };

        const hit = this.raycast(origin, rayDirection, maxDistance);
        if (hit) {
          hits.push(hit);
        }
      }
    }

    return hits;
  }

  isBlockVisible(position: Vec3, observer: Vec3): boolean {
    const direction = {
      x: position.x - observer.x,
      y: position.y - observer.y,
      z: position.z - observer.z,
    };
    const distance = Math.sqrt(
      direction.x ** 2 + direction.y ** 2 + direction.z ** 2
    );

    if (distance === 0) return true;

    const normalizedDirection = {
      x: direction.x / distance,
      y: direction.y / distance,
      z: direction.z / distance,
    };

    const hit = this.raycast(observer, normalizedDirection, distance);
    return hit ? hit.distance >= distance - 0.5 : true;
  }

  /**
   * Check if a target is within the observer's field of view.
   */
  isWithinFov(
    observer: Vec3,
    orientation: Orientation,
    target: Vec3,
    fovDegrees: number,
    maxDistance?: number
  ): boolean {
    const fovRadians = (fovDegrees * Math.PI) / 180;
    const frustum = {
      position: observer,
      orientation,
      fovRadians,
      nearPlane: 0.1,
      farPlane: maxDistance ?? Number.POSITIVE_INFINITY,
    };
    return isInFrustum(target, frustum);
  }

  /**
   * Determine line-of-sight between observer and target.
   */
  hasLineOfSight(
    observer: Vec3,
    target: Vec3,
    options: {
      maxDistance?: number;
      orientation?: Orientation;
      fovDegrees?: number;
      requireFov?: boolean;
      algorithm?: 'mineflayer' | 'dda';
      tolerance?: number;
      assumeBlockedOnError?: boolean;
    } = {}
  ): boolean {
    const direction = {
      x: target.x - observer.x,
      y: target.y - observer.y,
      z: target.z - observer.z,
    };
    const distanceToTarget = Math.sqrt(
      direction.x ** 2 + direction.y ** 2 + direction.z ** 2
    );

    if (distanceToTarget === 0) return true;

    if (options.maxDistance && distanceToTarget > options.maxDistance) {
      return false;
    }

    if (
      options.requireFov &&
      options.orientation &&
      options.fovDegrees
    ) {
      const inFov = this.isWithinFov(
        observer,
        options.orientation,
        target,
        options.fovDegrees,
        options.maxDistance ?? distanceToTarget
      );
      if (!inFov) return false;
    }

    const normalizedDirection = {
      x: direction.x / distanceToTarget,
      y: direction.y / distanceToTarget,
      z: direction.z / distanceToTarget,
    };

    const tolerance = options.tolerance ?? 0.5;

    try {
      let hit: RaycastHit | null = null;

      if (options.algorithm === 'dda' || !this.bot) {
        hit = this.ddaRaycast(observer, normalizedDirection, distanceToTarget, {
          algorithm: 'dda',
          maxSteps: 256,
          earlyExit: true,
          recordPath: false,
        });
      } else {
        hit = this.mineflayerRaycast(
          observer,
          normalizedDirection,
          distanceToTarget
        );
      }

      if (!hit) return true;
      return hit.distance >= distanceToTarget - tolerance;
    } catch (error) {
      if (options.assumeBlockedOnError) return false;
      return true;
    }
  }

  getVisibleBlocks(
    observer: Vec3,
    maxDistance: number
  ): Array<{ position: Vec3; blockType: string; distance: number }> {
    // Simple implementation - in a real system this would use a spatial index
    const blocks: Array<{
      position: Vec3;
      blockType: string;
      distance: number;
    }> = [];

    // Perform a basic sweep to find visible blocks
    const sweepConfig = {
      maxDistance,
      fovDegrees: 90,
      angularResolution: 5,
      panoramicSweep: false,
      maxRaysPerTick: 100,
      tickBudgetMs: 50,
      targetBlocks: this.config.targetBlocks,
      transparentBlocks: this.config.transparentBlocks,
      confidenceDecayRate: this.config.confidenceDecayRate,
      minConfidence: this.config.minConfidence,
    };

    // Use a simple grid pattern for testing
    const directions: Direction[] = [];
    const stepSize = 10; // degrees
    for (let yaw = -45; yaw <= 45; yaw += stepSize) {
      for (let pitch = -30; pitch <= 30; pitch += stepSize) {
        const yawRad = (yaw * Math.PI) / 180;
        const pitchRad = (pitch * Math.PI) / 180;

        directions.push({
          x: Math.sin(yawRad) * Math.cos(pitchRad),
          y: Math.sin(pitchRad),
          z: -Math.cos(yawRad) * Math.cos(pitchRad),
        });
      }
    }

    for (const direction of directions.slice(0, 20)) {
      // Limit for performance
      const hit = this.raycast(observer, direction, maxDistance);
      if (hit) {
        blocks.push({
          position: hit.position,
          blockType: hit.blockId,
          distance: hit.distance,
        });
      }
    }

    return blocks;
  }

  /**
   * Sweep rays and return occluding hits (first solid block per ray).
   */
  sweepOccluders(
    origin: Vec3,
    orientation: Orientation,
    config: SensingConfig
  ): RaycastHit[] {
    const hits: RaycastHit[] = [];
    const directions = this.generateSweepDirections(orientation, config);
    const maxRays = Math.min(directions.length, config.maxRaysPerTick);
    const seen = new Set<string>();

    for (let i = 0; i < maxRays; i++) {
      const direction = directions[i];
      const hit = this.raycast(origin, direction, config.maxDistance);
      if (!hit) continue;

      const key = `${Math.floor(hit.position.x)},${Math.floor(
        hit.position.y
      )},${Math.floor(hit.position.z)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(hit);
    }

    return hits;
  }

  updateWorld(blocks: Array<{ position: Vec3; blockType: string }>): void {
    // In a real implementation, this would update the world state
    // For testing purposes, we'll just emit an event
    this.emit('world-updated', { blocks });
  }

  dispose(): void {
    this.removeAllListeners();
  }

  // ===== PRIVATE METHODS =====

  private updateTransparentBlocks(blockIds: string[]): void {
    this.transparentBlocks.clear();
    for (const blockId of blockIds) {
      this.transparentBlocks.add(blockId);
    }
  }

  private updateTargetBlocks(blockIds: string[]): void {
    this.targetBlocks.clear();
    for (const blockId of blockIds) {
      this.targetBlocks.add(blockId);
    }
  }

  private mineflayerRaycast(
    origin: Vec3,
    direction: Direction,
    maxDistance: number
  ): RaycastHit | null {
    if (!this.bot) return null;

    const matcher = (block: any) =>
      block && !this.transparentBlocks.has(block.name);

    try {
      const hit = this.bot.world.raycast(
        origin,
        direction,
        maxDistance,
        matcher
      );
      if (!hit) return null;

      const block = this.bot.blockAt(hit.position);
      if (!block) return null;

      return {
        position: hit.position,
        intersect: hit.intersect,
        faceVector: hit.faceVector,
        distance: distance(origin, hit.intersect || hit.position),
        blockId: block.name,
      };
    } catch (error) {
      console.error('Mineflayer raycast error:', error);
      return null;
    }
  }

  private ddaRaycast(
    origin: Vec3,
    direction: Direction,
    maxDistance: number,
    config: RayTraversalConfig
  ): RaycastHit | null {
    // Initialize DDA state (Amanatides & Woo algorithm)
    const state = this.initializeDDA(origin, direction);
    const maxSteps = config.maxSteps || 128;

    for (
      let step = 0;
      step < maxSteps && state.distance <= maxDistance;
      step++
    ) {
      // Get block at current voxel
      const block = this.getBlockAt(state.current);

      if (block && !this.transparentBlocks.has(block.name)) {
        // Found an occluding block
        return {
          position: state.current,
          distance: state.distance,
          blockId: block.name,
        };
      }

      // Step to next voxel
      this.stepDDA(state);
    }

    return null; // No hit within range
  }

  private initializeDDA(origin: Vec3, direction: Direction): DDAState {
    // Convert to grid coordinates
    const current = {
      x: Math.floor(origin.x),
      y: Math.floor(origin.y),
      z: Math.floor(origin.z),
    };

    // Calculate step direction
    const step = {
      x: direction.x > 0 ? 1 : -1,
      y: direction.y > 0 ? 1 : -1,
      z: direction.z > 0 ? 1 : -1,
    };

    // Calculate tDelta (distance to travel along ray to cross one voxel)
    const tDelta = {
      x: direction.x !== 0 ? Math.abs(1 / direction.x) : Infinity,
      y: direction.y !== 0 ? Math.abs(1 / direction.y) : Infinity,
      z: direction.z !== 0 ? Math.abs(1 / direction.z) : Infinity,
    };

    // Calculate initial tMax (distance to next grid line)
    const tMax = {
      x:
        direction.x !== 0
          ? direction.x > 0
            ? (current.x + 1 - origin.x) / direction.x
            : (origin.x - current.x) / -direction.x
          : Infinity,
      y:
        direction.y !== 0
          ? direction.y > 0
            ? (current.y + 1 - origin.y) / direction.y
            : (origin.y - current.y) / -direction.y
          : Infinity,
      z:
        direction.z !== 0
          ? direction.z > 0
            ? (current.z + 1 - origin.z) / direction.z
            : (origin.z - current.z) / -direction.z
          : Infinity,
    };

    return {
      current,
      tMax,
      tDelta,
      step,
      distance: 0,
    };
  }

  private stepDDA(state: DDAState): void {
    // Step along axis with smallest tMax
    if (state.tMax.x < state.tMax.y && state.tMax.x < state.tMax.z) {
      state.distance = state.tMax.x;
      state.current.x += state.step.x;
      state.tMax.x += state.tDelta.x;
    } else if (state.tMax.y < state.tMax.z) {
      state.distance = state.tMax.y;
      state.current.y += state.step.y;
      state.tMax.y += state.tDelta.y;
    } else {
      state.distance = state.tMax.z;
      state.current.z += state.step.z;
      state.tMax.z += state.tDelta.z;
    }
  }

  private getBlockAt(position: Vec3): { name: string; type: number } | null {
    if (this.bot) {
      return this.bot.blockAt(position);
    }

    // Fallback implementation when bot is not available
    // In production, this would query the Minecraft world
    if (position.y < 0) return { name: 'minecraft:bedrock', type: 7 };
    if (position.y < 64) return { name: 'minecraft:stone', type: 1 };
    if (position.y === 64) return { name: 'minecraft:grass_block', type: 2 };

    return { name: 'minecraft:air', type: 0 };
  }

  private generateSweepDirections(
    orientation: Orientation,
    config: SensingConfig
  ): Direction[] {
    const directions: Direction[] = [];
    const fovRad = (config.fovDegrees * Math.PI) / 180;
    const angularResRad = (config.angularResolution * Math.PI) / 180;

    if (config.panoramicSweep) {
      // 360-degree panoramic sweep
      const steps = Math.ceil((2 * Math.PI) / angularResRad);
      for (let i = 0; i < steps; i++) {
        const yaw = (i * 2 * Math.PI) / steps;
        const dir = orientationToDirection({ yaw, pitch: orientation.pitch });
        directions.push(dir);
      }
    } else {
      // Focused FOV sweep
      const yawSteps = Math.ceil(fovRad / angularResRad);
      const pitchSteps = Math.ceil((fovRad * 0.6) / angularResRad); // Narrower vertical FOV

      const baseYaw = orientation.yaw;
      const basePitch = orientation.pitch;

      for (let yawStep = -yawSteps / 2; yawStep <= yawSteps / 2; yawStep++) {
        for (
          let pitchStep = -pitchSteps / 2;
          pitchStep <= pitchSteps / 2;
          pitchStep++
        ) {
          const yaw = baseYaw + yawStep * angularResRad;
          const pitch = basePitch + pitchStep * angularResRad;

          // Clamp pitch to reasonable range
          const clampedPitch = Math.max(
            -Math.PI / 2,
            Math.min(Math.PI / 2, pitch)
          );

          const dir = orientationToDirection({ yaw, pitch: clampedPitch });
          directions.push(dir);
        }
      }
    }

    return directions;
  }
}
