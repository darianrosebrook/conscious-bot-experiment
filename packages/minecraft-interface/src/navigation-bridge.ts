/**
 * Navigation Bridge - Integrates D* Lite with Mineflayer's legitimate capabilities
 *
 * Provides intelligent pathfinding using D* Lite algorithm while leveraging
 * Mineflayer's raycasting, pathfinding, and world observation capabilities
 * without relying on chunk scanning or cheating.
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { EventEmitter } from 'events';

// Import D* Lite components
import {
  DStarLiteCore,
  NavigationSystem,
  NavigationConfig,
  PathPlanningRequest,
  PathPlanningResult,
} from '@conscious-bot/world';

// Define WorldPosition type locally since it's not exported from world package
interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export interface NavigationBridgeConfig {
  maxRaycastDistance: number;
  pathfindingTimeout: number;
  replanThreshold: number;
  obstacleDetectionRadius: number;
  enableDynamicReplanning: boolean;
  useRaycasting: boolean;
  usePathfinding: boolean;
}

export interface NavigationResult {
  success: boolean;
  pathFound: boolean;
  finalPosition: Vec3;
  distanceToGoal: number;
  pathLength: number;
  replans: number;
  obstaclesDetected: number;
  error?: string;
  data?: any;
}

export interface ObstacleInfo {
  position: Vec3;
  blockType: string;
  distance: number;
  severity: 'low' | 'medium' | 'high';
}

export class NavigationBridge extends EventEmitter {
  private bot: Bot;
  private config: NavigationBridgeConfig;
  private navigationSystem: NavigationSystem;
  private currentPath: Vec3[] = [];
  private isNavigating = false;
  private replanCount = 0;
  private obstaclesDetected: ObstacleInfo[] = [];

  constructor(bot: Bot, config: Partial<NavigationBridgeConfig> = {}) {
    super();

    this.bot = bot;
    this.config = {
      maxRaycastDistance: 32,
      pathfindingTimeout: 30000,
      replanThreshold: 5,
      obstacleDetectionRadius: 8,
      enableDynamicReplanning: true,
      useRaycasting: true,
      usePathfinding: true,
      ...config,
    };

    // Initialize D* Lite navigation system
    const navConfig: NavigationConfig = {
      dstarLite: {
        searchRadius: 100,
        replanThreshold: this.config.replanThreshold,
        maxComputationTime: 50,
        heuristicWeight: 1.0,
      },
      costCalculation: {
        baseMoveCost: 1.0,
        diagonalMultiplier: 1.414,
        verticalMultiplier: 2.0,
        jumpCost: 3.0,
        swimCost: 4.0,
      },
      hazardCosts: {
        lavaProximity: 1000,
        voidFall: 10000,
        mobProximity: 200,
        darknessPenalty: 50,
        waterPenalty: 20,
      },
      optimization: {
        pathSmoothing: true,
        lookaheadDistance: 20,
        safetyMargin: 2,
        simplificationEnabled: true,
        maxOptimizationTime: 20,
      },
      caching: {
        maxCachedPaths: 1000,
        cacheTtl: 300000,
        invalidateOnBlockChange: true,
        spatialIndexEnabled: true,
      },
      movement: {
        baseSpeed: 4.3,
        jumpHeight: 1.25,
        stepHeight: 0.6,
        collisionRadius: 0.3,
        lookaheadTime: 1.0,
      },
    };

    this.navigationSystem = new NavigationSystem(navConfig);
    this.setupEventHandlers();
  }

  /**
   * Navigate to target using D* Lite with Mineflayer integration
   */
  async navigateTo(
    target: Vec3 | { x: number; y: number; z: number },
    options: {
      timeout?: number;
      useRaycasting?: boolean;
      dynamicReplanning?: boolean;
    } = {}
  ): Promise<NavigationResult> {
    // Convert target to Vec3 if it's not already
    const targetVec3 =
      target instanceof Vec3 ? target : new Vec3(target.x, target.y, target.z);
    if (this.isNavigating) {
      return {
        success: false,
        pathFound: false,
        finalPosition: this.bot.entity.position.clone(),
        distanceToGoal: this.bot.entity.position.distanceTo(targetVec3),
        pathLength: 0,
        replans: 0,
        obstaclesDetected: 0,
        error: 'Already navigating',
      };
    }

    this.isNavigating = true;
    this.replanCount = 0;
    this.obstaclesDetected = [];
    const startTime = Date.now();

    try {
      // Step 1: Gather world information using legitimate Mineflayer capabilities
      const worldInfo = await this.gatherWorldInformation(targetVec3);

      // Step 2: Plan path using D* Lite
      const pathResult = await this.planPathWithDStarLite(
        targetVec3,
        worldInfo
      );

      if (!pathResult.success || !pathResult.path) {
        return {
          success: false,
          pathFound: false,
          finalPosition: this.bot.entity.position.clone(),
          distanceToGoal: this.bot.entity.position.distanceTo(targetVec3),
          pathLength: 0,
          replans: 0,
          obstaclesDetected: this.obstaclesDetected.length,
          error: pathResult.reason || 'Failed to plan path',
        };
      }

      // Step 3: Execute path with dynamic replanning
      const executionResult = await this.executePathWithReplanning(
        pathResult.path,
        targetVec3,
        options
      );

      return {
        success: executionResult.success,
        pathFound: true,
        finalPosition: this.bot.entity.position.clone(),
        distanceToGoal: this.bot.entity.position.distanceTo(targetVec3),
        pathLength: pathResult.path.length,
        replans: this.replanCount,
        obstaclesDetected: this.obstaclesDetected.length,
        error: executionResult.error,
        data: {
          path: pathResult.path,
          obstacles: this.obstaclesDetected,
          planningTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        pathFound: false,
        finalPosition: this.bot.entity.position.clone(),
        distanceToGoal: this.bot.entity.position.distanceTo(targetVec3),
        pathLength: 0,
        replans: this.replanCount,
        obstaclesDetected: this.obstaclesDetected.length,
        error:
          error instanceof Error ? error.message : 'Unknown navigation error',
      };
    } finally {
      this.isNavigating = false;
    }
  }

  /**
   * Gather world information using legitimate Mineflayer capabilities
   */
  private async gatherWorldInformation(target: Vec3): Promise<{
    obstacles: ObstacleInfo[];
    safeAreas: Vec3[];
    hazards: Vec3[];
    lightLevels: Map<string, number>;
  }> {
    const obstacles: ObstacleInfo[] = [];
    const safeAreas: Vec3[] = [];
    const hazards: Vec3[] = [];
    const lightLevels = new Map<string, number>();

    const botPos = this.bot.entity.position;
    const targetVec3 = new Vec3(target.x, target.y, target.z);
    const direction = targetVec3.minus(botPos).normalize();

    // Use raycasting to detect obstacles in the path
    if (this.config.useRaycasting) {
      const raycastResult = await this.performRaycast(botPos, direction);
      obstacles.push(...raycastResult.obstacles);
      hazards.push(...raycastResult.hazards);
    }

    // Use bot's field of view to detect nearby obstacles
    const nearbyBlocks = await this.scanNearbyBlocks();
    obstacles.push(...nearbyBlocks);

    // Check light levels for safety (fallback to 15 for daylight)
    const currentLight = 15; // Default to daylight, would use this.bot.world.getLight() if available
    lightLevels.set(this.positionToKey(botPos), currentLight);

    // Detect safe areas (solid ground)
    const safeGround = await this.findSafeGround(botPos, target);
    safeAreas.push(...safeGround);

    return {
      obstacles,
      safeAreas,
      hazards,
      lightLevels,
    };
  }

  /**
   * Perform raycast using Mineflayer's legitimate capabilities
   */
  private async performRaycast(
    start: Vec3,
    direction: Vec3
  ): Promise<{ obstacles: ObstacleInfo[]; hazards: Vec3[] }> {
    const obstacles: ObstacleInfo[] = [];
    const hazards: Vec3[] = [];

    // Use Mineflayer's raycast to detect blocks in the path
    const raycast = this.bot.world.raycast(
      start,
      direction,
      this.config.maxRaycastDistance
    );

    if (raycast) {
      const block = raycast.block;
      const distance = start.distanceTo(raycast.position);

      // Classify the obstacle
      const severity = this.classifyObstacle(block.name, distance);

      obstacles.push({
        position: raycast.position,
        blockType: block.name,
        distance,
        severity,
      });

      // Check for hazards
      if (this.isHazard(block.name)) {
        hazards.push(raycast.position);
      }
    }

    return { obstacles, hazards };
  }

  /**
   * Scan nearby blocks using bot's legitimate field of view
   */
  private async scanNearbyBlocks(): Promise<ObstacleInfo[]> {
    const obstacles: ObstacleInfo[] = [];
    const botPos = this.bot.entity.position;
    const radius = this.config.obstacleDetectionRadius;

    // Scan in a sphere around the bot
    for (let x = -radius; x <= radius; x++) {
      for (let y = -radius; y <= radius; y++) {
        for (let z = -radius; z <= radius; z++) {
          const pos = botPos.offset(x, y, z);
          const block = this.bot.blockAt(pos);

          if (block && block.name !== 'air' && this.isObstacle(block.name)) {
            const distance = botPos.distanceTo(pos);
            const severity = this.classifyObstacle(block.name, distance);

            obstacles.push({
              position: pos,
              blockType: block.name,
              distance,
              severity,
            });
          }
        }
      }
    }

    return obstacles;
  }

  /**
   * Find safe ground for navigation
   */
  private async findSafeGround(start: Vec3, target: Vec3): Promise<Vec3[]> {
    const safeAreas: Vec3[] = [];
    const targetVec3 = new Vec3(target.x, target.y, target.z);
    const direction = targetVec3.minus(start).normalize();
    const maxDistance = start.distanceTo(targetVec3);

    // Check for solid ground along the path
    for (let distance = 0; distance <= maxDistance; distance += 2) {
      const checkPos = start.plus(direction.scaled(distance));

      // Check if there's solid ground below
      const groundPos = checkPos.offset(0, -1, 0);
      const groundBlock = this.bot.blockAt(groundPos);

      if (groundBlock && this.isSolidGround(groundBlock.name)) {
        safeAreas.push(checkPos);
      }
    }

    return safeAreas;
  }

  /**
   * Plan path using D* Lite algorithm
   */
  private async planPathWithDStarLite(
    target: Vec3,
    worldInfo: any
  ): Promise<PathPlanningResult> {
    const start: WorldPosition = {
      x: this.bot.entity.position.x,
      y: this.bot.entity.position.y,
      z: this.bot.entity.position.z,
    };

    const goal: WorldPosition = {
      x: target.x,
      y: target.y,
      z: target.z,
    };

    const request: PathPlanningRequest = {
      start,
      goal,
      maxDistance: 200,
      allowPartialPath: true,
      avoidHazards: true,
      urgency: 'normal',
      preferences: {
        preferLit: true,
        avoidMobs: true,
        minimizeVertical: false,
        preferSolid: true,
        avoidWater: false,
        preferLighting: true,
        maxDetour: 5.0,
      },
      timeout: 50,
    };

    return await this.navigationSystem.planPath(request);
  }

  /**
   * Execute path with dynamic replanning
   */
  private async executePathWithReplanning(
    path: WorldPosition[],
    target: Vec3,
    options: any
  ): Promise<{ success: boolean; error?: string }> {
    const pathSteps = path.map((p) => new Vec3(p.x, p.y, p.z));
    let currentStepIndex = 0;

    while (currentStepIndex < pathSteps.length) {
      const currentStep = pathSteps[currentStepIndex];
      const distanceToStep = this.bot.entity.position.distanceTo(currentStep);

      // Check if we need to replan
      if (this.shouldReplan(currentStep, options)) {
        this.replanCount++;

        // Gather updated world information
        const worldInfo = await this.gatherWorldInformation(target);

        // Replan path
        const newPathResult = await this.planPathWithDStarLite(
          target,
          worldInfo
        );

        if (newPathResult.success && newPathResult.path) {
          // Update path and continue
          pathSteps.splice(currentStepIndex);
          pathSteps.push(
            ...newPathResult.path.map((p) => new Vec3(p.x, p.y, p.z))
          );
        } else {
          return {
            success: false,
            error: 'Failed to replan path',
          };
        }
      }

      // Move to current step
      const moveResult = await this.moveToStep(currentStep);

      if (!moveResult.success) {
        return {
          success: false,
          error: moveResult.error,
        };
      }

      currentStepIndex++;
    }

    return { success: true };
  }

  /**
   * Move to a specific step in the path
   */
  private async moveToStep(
    step: Vec3
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Use Mineflayer's pathfinding to move to the step
      const goal = new (require('mineflayer-pathfinder').goals.GoalNear)(
        step.x,
        step.y,
        step.z,
        1
      );

      this.bot.pathfinder.setGoal(goal);

      // Wait for goal to be reached or timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Step movement timeout'));
        }, 10000);

        this.bot.once('goal_reached', () => {
          clearTimeout(timeout);
          resolve();
        });

        (this.bot as any).once('path_error', (error: any) => {
          clearTimeout(timeout);
          reject(new Error(`Pathfinding error: ${error}`));
        });
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown movement error',
      };
    }
  }

  /**
   * Determine if replanning is needed
   */
  private shouldReplan(currentStep: Vec3, options: any): boolean {
    if (!this.config.enableDynamicReplanning) return false;

    // Check if there are new obstacles detected
    const newObstacles = this.obstaclesDetected.filter(
      (o) => o.distance < this.config.obstacleDetectionRadius
    );

    if (newObstacles.length > this.config.replanThreshold) {
      return true;
    }

    // Check if we're stuck
    const distanceToStep = this.bot.entity.position.distanceTo(currentStep);
    if (distanceToStep > 5) {
      return true;
    }

    return false;
  }

  /**
   * Classify obstacle severity
   */
  private classifyObstacle(
    blockType: string,
    distance: number
  ): 'low' | 'medium' | 'high' {
    if (this.isHazard(blockType)) return 'high';
    if (distance < 3) return 'high';
    if (distance < 8) return 'medium';
    return 'low';
  }

  /**
   * Check if block is a hazard
   */
  private isHazard(blockType: string): boolean {
    const hazards = ['lava', 'fire', 'cactus', 'cobweb'];
    return hazards.some((h) => blockType.includes(h));
  }

  /**
   * Check if block is an obstacle
   */
  private isObstacle(blockType: string): boolean {
    const obstacles = ['stone', 'dirt', 'wood', 'leaves', 'water'];
    return obstacles.some((o) => blockType.includes(o));
  }

  /**
   * Check if block is solid ground
   */
  private isSolidGround(blockType: string): boolean {
    const solidGround = ['stone', 'dirt', 'grass', 'sand'];
    return solidGround.some((g) => blockType.includes(g));
  }

  /**
   * Convert position to key for caching
   */
  private positionToKey(pos: Vec3): string {
    return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.navigationSystem.on('path-planned', (result) => {
      this.emit('path-planned', result);
    });

    this.navigationSystem.on('path-updated', (result) => {
      this.emit('path-updated', result);
    });

    this.navigationSystem.on('obstacle-detected', (obstacle) => {
      this.emit('obstacle-detected', obstacle);
    });
  }

  /**
   * Stop current navigation
   */
  stopNavigation(): void {
    this.isNavigating = false;
    this.bot.pathfinder.setGoal(null);
    this.emit('navigation-stopped');
  }

  /**
   * Get current navigation status
   */
  getNavigationStatus(): {
    isNavigating: boolean;
    currentPath: Vec3[];
    replanCount: number;
    obstaclesDetected: ObstacleInfo[];
  } {
    return {
      isNavigating: this.isNavigating,
      currentPath: this.currentPath,
      replanCount: this.replanCount,
      obstaclesDetected: this.obstaclesDetected,
    };
  }
}
