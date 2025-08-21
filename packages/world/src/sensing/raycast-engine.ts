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
  orientationToDirection,
} from '../types';

export interface RaycastEngineEvents {
  'ray-cast': [{ origin: Vec3; direction: Direction; hit: RaycastHit | null }];
  'sweep-progress': [{ completed: number; total: number }];
  'performance-warning': [{ metric: string; value: number; threshold: number }];
}

/**
 * Mock bot interface for testing (will be replaced with actual Mineflayer bot)
 */
interface MockBot {
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
  private bot?: MockBot; // Will be actual Mineflayer bot in production

  constructor(
    private config: SensingConfig,
    bot?: MockBot
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
    config: RayTraversalConfig = { algorithm: 'mineflayer' }
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
  setBot(bot: MockBot): void {
    this.bot = bot;
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

    // Mock implementation for testing
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
