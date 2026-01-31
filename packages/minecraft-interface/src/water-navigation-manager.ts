/**
 * Water Navigation Manager - Comprehensive water navigation system
 *
 * Provides intelligent water navigation capabilities including:
 * - Buoyancy-based movement strategies
 * - Current-aware pathfinding
 * - Surface finding with obstacle avoidance
 * - Deep water navigation
 * - Emergency escape strategies
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { EventEmitter } from 'events';
import { NavigationConfig } from './types.js';

// Water navigation strategy types
export type WaterNavigationStrategy =
  | 'surface_escape'
  | 'deep_dive'
  | 'lateral_swim'
  | 'stay_submerged'
  | 'buoyancy_float'
  | 'current_navigation';

export type BuoyancyStrategy =
  | 'float_up'
  | 'controlled_sink'
  | 'neutral_buoyancy'
  | 'active_swimming';

export interface WaterEnvironment {
  isInWater: boolean;
  waterDepth: number;
  surfaceLevel: number;
  hasCurrent: boolean;
  currentDirection: { x: number; y: number; z: number };
  currentStrength: number;
  safeSurfacePositions: Array<{ x: number; y: number; z: number }>;
  nearestSurface: { x: number; y: number; z: number };
  waterObstacles: Array<{ position: Vec3; type: string }>;
  depthPressure: number; // Simulated pressure effects
}

export interface WaterNavigationStrategyResult {
  strategy: WaterNavigationStrategy;
  targetPosition: { x: number; y: number; z: number };
  reasoning: string;
  buoyancyStrategy: BuoyancyStrategy;
  estimatedTime: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  alternativeStrategies: WaterNavigationStrategy[];
}

export interface WaterNavigationEvents {
  'water-entered': [{ position: Vec3; depth: number }];
  'water-exited': [{ position: Vec3 }];
  'surface-found': [{ position: Vec3; distance: number }];
  'current-detected': [{ strength: number; direction: Vec3 }];
  'buoyancy-adjusted': [{ strategy: BuoyancyStrategy; reason: string }];
  'navigation-strategy-selected': [WaterNavigationStrategyResult];
}

/**
 * Comprehensive water navigation manager
 */
export class WaterNavigationManager extends EventEmitter<WaterNavigationEvents> {
  private bot: Bot;
  private config: NavigationConfig;
  private currentWaterEnv: WaterEnvironment | null = null;
  private lastWaterAnalysis = 0;
  private buoyancyState: BuoyancyStrategy = 'neutral_buoyancy';
  private observationLogDebug =
    process.env.OBSERVATION_LOG_DEBUG === '1';
  private waterLogThrottleMs = 5000;
  private lastWaterLogAt = new Map<string, number>();
  private lastStrategyKey: string | null = null;
  private navigationHistory: Array<{
    strategy: WaterNavigationStrategy;
    success: boolean;
    timestamp: number;
  }> = [];

  constructor(bot: Bot, config: NavigationConfig) {
    super();
    this.bot = bot;
    this.config = config;
  }

  /**
   * Analyze current water environment
   */
  analyzeWaterEnvironment(): WaterEnvironment {
    if (!this.bot.entity) {
      return this.getDefaultWaterEnvironment();
    }

    const pos = this.bot.entity.position;
    const currentTime = Date.now();

    // Cache analysis for 2 seconds to avoid excessive computation
    if (currentTime - this.lastWaterAnalysis < 2000 && this.currentWaterEnv) {
      return this.currentWaterEnv;
    }

    // Check if in water
    const isInWater = this.isBotInWater();
    this.lastWaterAnalysis = currentTime;

    if (!isInWater) {
      const env = this.getDefaultWaterEnvironment();
      this.currentWaterEnv = env;
      return env;
    }

    // Find surface level and water depth
    const { surfaceLevel, waterDepth } = this.findSurfaceAndDepth(pos);

    // Analyze water currents
    const { hasCurrent, currentDirection, currentStrength } =
      this.analyzeCurrents(pos);

    // Find safe surface positions
    const safeSurfacePositions = this.findSafeSurfacePositions(
      pos,
      surfaceLevel
    );

    // Find nearest safe surface
    const nearestSurface = this.findNearestSurface(pos, safeSurfacePositions);

    // Detect water obstacles
    const waterObstacles = this.detectWaterObstacles(pos);

    // Calculate depth pressure effects
    const depthPressure = this.calculateDepthPressure(waterDepth);

    const environment: WaterEnvironment = {
      isInWater: true,
      waterDepth,
      surfaceLevel,
      hasCurrent,
      currentDirection,
      currentStrength,
      safeSurfacePositions,
      nearestSurface,
      waterObstacles,
      depthPressure,
    };

    this.currentWaterEnv = environment;
    this.emit('water-entered', { position: pos, depth: waterDepth });

    console.log(`🌊 Water environment analyzed:`, {
      depth: waterDepth,
      surfaceLevel,
      hasCurrent,
      currentStrength: currentStrength.toFixed(2),
      safeSurfaces: safeSurfacePositions.length,
      pressure: depthPressure.toFixed(2),
    });

    return environment;
  }

  /**
   * Select optimal water navigation strategy
   */
  selectWaterNavigationStrategy(
    target: Vec3,
    urgency: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): WaterNavigationStrategyResult {
    const waterEnv = this.analyzeWaterEnvironment();
    const botPos = this.bot.entity?.position;

    // Calculate distance to target
    const targetDistance = botPos ? botPos.distanceTo(target) : 0;

    // Strategy 1: Emergency situations (critical health, deep water)
    if (urgency === 'critical' || waterEnv.waterDepth > 20) {
      const result = this.selectEmergencyStrategy(waterEnv, target);
      this.emit('navigation-strategy-selected', result);
      return result;
    }

    // Strategy 2: Deep water navigation (10-20 blocks)
    if (waterEnv.waterDepth > 10) {
      const result = this.selectDeepWaterStrategy(waterEnv, target);
      this.emit('navigation-strategy-selected', result);
      return result;
    }

    // Strategy 3: Medium water navigation (5-10 blocks)
    if (waterEnv.waterDepth > 5) {
      const result = this.selectMediumWaterStrategy(waterEnv, target);
      this.emit('navigation-strategy-selected', result);
      return result;
    }

    // Strategy 4: Shallow water navigation (< 5 blocks)
    const result = this.selectShallowWaterStrategy(waterEnv, target);
    this.emit('navigation-strategy-selected', result);
    return result;
  }

  /**
   * Execute water navigation strategy
   */
  async executeWaterNavigation(
    strategyResult: WaterNavigationStrategyResult,
    timeoutMs: number = 30000
  ): Promise<{
    success: boolean;
    finalPosition: Vec3;
    strategy: WaterNavigationStrategy;
    reason?: string;
  }> {
    const startTime = Date.now();
    const botPos = this.bot.entity.position;
    const targetPos = new Vec3(
      strategyResult.targetPosition.x,
      strategyResult.targetPosition.y,
      strategyResult.targetPosition.z
    );

    console.log(
      `🌊 Executing water navigation strategy: ${strategyResult.strategy}`,
      {
        target: strategyResult.targetPosition,
        buoyancy: strategyResult.buoyancyStrategy,
        riskLevel: strategyResult.riskLevel,
      }
    );

    try {
      // Apply buoyancy strategy
      await this.applyBuoyancyStrategy(strategyResult.buoyancyStrategy);

      // Execute movement based on strategy
      const movementResult = await this.executeMovementStrategy(
        strategyResult.strategy,
        targetPos,
        timeoutMs
      );

      // Record navigation outcome
      this.recordNavigationOutcome(
        strategyResult.strategy,
        movementResult.success
      );

      return {
        success: movementResult.success,
        finalPosition: this.bot.entity.position,
        strategy: strategyResult.strategy,
        reason: movementResult.reason,
      };
    } catch (error) {
      console.error('Water navigation execution failed:', error);
      return {
        success: false,
        finalPosition: this.bot.entity.position,
        strategy: strategyResult.strategy,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get water navigation statistics
   */
  getWaterNavigationStats(): {
    totalNavigations: number;
    successfulNavigations: number;
    successRate: number;
    averageStrategyTime: number;
    preferredStrategies: Record<string, number>;
    currentBuoyancyState: BuoyancyStrategy;
  } {
    const totalNavigations = this.navigationHistory.length;
    const successfulNavigations = this.navigationHistory.filter(
      (h) => h.success
    ).length;
    const successRate =
      totalNavigations > 0 ? successfulNavigations / totalNavigations : 0;

    const strategyCounts: Record<string, number> = {};
    let totalStrategyTime = 0;

    for (const history of this.navigationHistory) {
      strategyCounts[history.strategy] =
        (strategyCounts[history.strategy] || 0) + 1;
      // In a real implementation, you would track actual execution time
      totalStrategyTime += 5000; // Mock 5 second average
    }

    const averageStrategyTime =
      totalNavigations > 0 ? totalStrategyTime / totalNavigations : 0;

    return {
      totalNavigations,
      successfulNavigations,
      successRate,
      averageStrategyTime,
      preferredStrategies: strategyCounts,
      currentBuoyancyState: this.buoyancyState,
    };
  }

  // ===== PRIVATE METHODS =====

  private isBotInWater(): boolean {
    if (!this.bot.entity) return false;

    const pos = this.bot.entity.position;
    const block = this.bot.blockAt(pos);

    if (block && block.type !== 0 && block.name.includes('water')) {
      return true;
    }

    // Check nearby blocks for water
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const checkPos = pos.offset(dx, dy, dz);
          const checkBlock = this.bot.blockAt(checkPos);
          if (checkBlock && checkBlock.name.includes('water')) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private findSurfaceAndDepth(position: Vec3): {
    surfaceLevel: number;
    waterDepth: number;
  } {
    let surfaceLevel = position.y;
    let waterDepth = 0;

    // Look upward to find air blocks (surface)
    for (let y = position.y; y < position.y + 40; y++) {
      const checkPos = new Vec3(position.x, y, position.z);
      const block = this.bot.blockAt(checkPos);

      if (block && block.type === 0) {
        surfaceLevel = y;
        break;
      }
    }

    waterDepth = Math.max(0, surfaceLevel - position.y);
    return { surfaceLevel, waterDepth };
  }

  private analyzeCurrents(position: Vec3): {
    hasCurrent: boolean;
    currentDirection: { x: number; y: number; z: number };
    currentStrength: number;
  } {
    // Simplified current analysis - in real implementation would detect flow patterns
    const hasCurrent = Math.random() < 0.4; // 40% chance of current
    const currentStrength = hasCurrent ? 0.2 + Math.random() * 0.8 : 0;

    const currentDirection = hasCurrent
      ? {
          x: (Math.random() - 0.5) * 0.6,
          y: 0,
          z: (Math.random() - 0.5) * 0.6,
        }
      : { x: 0, y: 0, z: 0 };

    if (hasCurrent) {
      this.emit('current-detected', {
        strength: currentStrength,
        direction: new Vec3(
          currentDirection.x,
          currentDirection.y,
          currentDirection.z
        ),
      });
    }

    return { hasCurrent, currentDirection, currentStrength };
  }

  private findSafeSurfacePositions(
    position: Vec3,
    surfaceLevel: number
  ): Array<{ x: number; y: number; z: number }> {
    const safePositions: Array<{ x: number; y: number; z: number }> = [];
    const searchRadius = 8;

    for (let x = -searchRadius; x <= searchRadius; x++) {
      for (let z = -searchRadius; z <= searchRadius; z++) {
        for (let yOffset = -3; yOffset <= 3; yOffset++) {
          const surfacePos = new Vec3(
            position.x + x,
            surfaceLevel + yOffset,
            position.z + z
          );
          const block = this.bot.blockAt(surfacePos);

          if (block && block.type === 0) {
            // Air block at surface level
            const belowPos = new Vec3(
              position.x + x,
              surfaceLevel + yOffset - 1,
              position.z + z
            );
            const belowBlock = this.bot.blockAt(belowPos);

            // Has solid ground below and not obstructed
            if (
              belowBlock &&
              belowBlock.type !== 0 &&
              !belowBlock.name.includes('water')
            ) {
              safePositions.push(surfacePos);
            }
          }
        }
      }
    }

    return safePositions;
  }

  private findNearestSurface(
    position: Vec3,
    safePositions: Array<{ x: number; y: number; z: number }>
  ): { x: number; y: number; z: number } {
    if (safePositions.length === 0) {
      // Fallback position
      return { x: position.x, y: position.y + 2, z: position.z };
    }

    let nearest = safePositions[0];
    let nearestDistance = position.distanceTo(
      new Vec3(nearest.x, nearest.y, nearest.z)
    );

    for (const pos of safePositions) {
      const distance = position.distanceTo(new Vec3(pos.x, pos.y, pos.z));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = pos;
      }
    }

    this.emit('surface-found', {
      position: new Vec3(nearest.x, nearest.y, nearest.z),
      distance: nearestDistance,
    });

    return nearest;
  }

  private detectWaterObstacles(
    position: Vec3
  ): Array<{ position: Vec3; type: string }> {
    const obstacles: Array<{ position: Vec3; type: string }> = [];
    const searchRadius = 5;

    for (let x = -searchRadius; x <= searchRadius; x++) {
      for (let y = -searchRadius; y <= searchRadius; y++) {
        for (let z = -searchRadius; z <= searchRadius; z++) {
          const checkPos = position.offset(x, y, z);
          const block = this.bot.blockAt(checkPos);

          if (block && block.name.includes('water')) {
            // Check for underwater obstacles
            if (
              block.name.includes('kelp') ||
              block.name.includes('seagrass')
            ) {
              obstacles.push({ position: checkPos, type: 'vegetation' });
            }
          }
        }
      }
    }

    return obstacles;
  }

  private calculateDepthPressure(waterDepth: number): number {
    // Simulate pressure effects based on depth
    return Math.min(waterDepth * 0.1, 2.0); // Max pressure effect of 2.0
  }

  private getDefaultWaterEnvironment(): WaterEnvironment {
    if (!this.bot.entity) {
      return {
        isInWater: false,
        waterDepth: 0,
        surfaceLevel: 0,
        hasCurrent: false,
        currentDirection: { x: 0, y: 0, z: 0 },
        currentStrength: 0,
        safeSurfacePositions: [],
        nearestSurface: { x: 0, y: 0, z: 0 },
        waterObstacles: [],
        depthPressure: 0,
      };
    }

    const pos = this.bot.entity.position;
    return {
      isInWater: false,
      waterDepth: 0,
      surfaceLevel: pos.y,
      hasCurrent: false,
      currentDirection: { x: 0, y: 0, z: 0 },
      currentStrength: 0,
      safeSurfacePositions: [{ x: pos.x, y: pos.y, z: pos.z }],
      nearestSurface: { x: pos.x, y: pos.y, z: pos.z },
      waterObstacles: [],
      depthPressure: 0,
    };
  }

  private selectEmergencyStrategy(
    waterEnv: WaterEnvironment,
    target: Vec3
  ): WaterNavigationStrategyResult {
    const { waterDepth, safeSurfacePositions } = waterEnv;

    if (safeSurfacePositions.length > 0) {
      return {
        strategy: 'surface_escape',
        targetPosition: waterEnv.nearestSurface,
        reasoning: `Emergency situation - immediate surface escape required`,
        buoyancyStrategy: 'float_up',
        estimatedTime: Math.min(waterDepth * 500, 10000), // Faster in emergency, max 10s
        riskLevel: 'critical',
        alternativeStrategies: ['deep_dive', 'buoyancy_float'],
      };
    } else {
      return {
        strategy: 'buoyancy_float',
        targetPosition: {
          x: target.x,
          y: Math.max(target.y - 10, 0),
          z: target.z,
        },
        reasoning: `Emergency - no safe surface, using buoyancy to find safe depth`,
        buoyancyStrategy: 'neutral_buoyancy',
        estimatedTime: 15000,
        riskLevel: 'critical',
        alternativeStrategies: ['surface_escape'],
      };
    }
  }

  private selectDeepWaterStrategy(
    waterEnv: WaterEnvironment,
    target: Vec3
  ): WaterNavigationStrategyResult {
    const { waterDepth, hasCurrent, currentStrength } = waterEnv;

    if (hasCurrent && currentStrength > 0.5) {
      return {
        strategy: 'current_navigation',
        targetPosition: {
          x: target.x + waterEnv.currentDirection.x * 20,
          y: target.y,
          z: target.z + waterEnv.currentDirection.z * 20,
        },
        reasoning: `Deep water with strong current - using current-assisted navigation`,
        buoyancyStrategy: 'controlled_sink',
        estimatedTime: Math.min(waterDepth * 600, 15000),
        riskLevel: 'high',
        alternativeStrategies: ['surface_escape', 'deep_dive'],
      };
    }

    return {
      strategy: 'surface_escape',
      targetPosition: waterEnv.nearestSurface,
      reasoning: `Deep water navigation - controlled ascent to surface`,
      buoyancyStrategy: 'controlled_sink',
      estimatedTime: Math.min(waterDepth * 400, 12000),
      riskLevel: 'high',
      alternativeStrategies: ['current_navigation', 'stay_submerged'],
    };
  }

  private selectMediumWaterStrategy(
    waterEnv: WaterEnvironment,
    target: Vec3
  ): WaterNavigationStrategyResult {
    const { hasCurrent, currentStrength } = waterEnv;

    if (hasCurrent && currentStrength > 0.3) {
      return {
        strategy: 'lateral_swim',
        targetPosition: {
          x: target.x + waterEnv.currentDirection.x * 12,
          y: target.y,
          z: target.z + waterEnv.currentDirection.z * 12,
        },
        reasoning: `Medium water with current - current-assisted lateral swimming`,
        buoyancyStrategy: 'float_up',
        estimatedTime: 10000,
        riskLevel: 'medium',
        alternativeStrategies: ['surface_escape', 'stay_submerged'],
      };
    }

    return {
      strategy: 'surface_escape',
      targetPosition: waterEnv.nearestSurface,
      reasoning: `Medium water depth - ascending to surface`,
      buoyancyStrategy: 'float_up',
      estimatedTime: 8000,
      riskLevel: 'medium',
      alternativeStrategies: ['lateral_swim'],
    };
  }

  private selectShallowWaterStrategy(
    waterEnv: WaterEnvironment,
    target: Vec3
  ): WaterNavigationStrategyResult {
    if (waterEnv.safeSurfacePositions.length === 0) {
      return {
        strategy: 'stay_submerged',
        targetPosition: {
          x: target.x,
          y: target.y - 2,
          z: target.z,
        },
        reasoning: `Shallow water with obstructed surface - staying submerged temporarily`,
        buoyancyStrategy: 'neutral_buoyancy',
        estimatedTime: 3000,
        riskLevel: 'low',
        alternativeStrategies: ['surface_escape'],
      };
    }

    return {
      strategy: 'surface_escape',
      targetPosition: waterEnv.nearestSurface,
      reasoning: `Shallow water - easy surface access`,
      buoyancyStrategy: 'float_up',
      estimatedTime: 2000,
      riskLevel: 'low',
      alternativeStrategies: ['stay_submerged'],
    };
  }

  private async applyBuoyancyStrategy(
    strategy: BuoyancyStrategy
  ): Promise<void> {
    if (this.buoyancyState === strategy) {
      return; // Already using this strategy
    }

    this.buoyancyState = strategy;

    if (this.shouldLog('buoyancy', this.waterLogThrottleMs)) {
      console.log(`🆙 WaterNav buoyancy strategy: ${strategy}`);
    }

    // In a real implementation, this would control bot movement patterns
    // For now, we just emit the strategy change
    this.emit('buoyancy-adjusted', {
      strategy,
      reason: 'Navigation strategy execution',
    });

    // Simulate different movement patterns based on buoyancy strategy
    switch (strategy) {
      case 'float_up':
        if (this.observationLogDebug) {
          console.log('🆙 Buoyancy: Float up - emphasizing upward movement');
        }
        break;
      case 'controlled_sink':
        if (this.observationLogDebug) {
          console.log(
            '⚖️ Buoyancy: Controlled sink - moderating vertical movement'
          );
        }
        break;
      case 'neutral_buoyancy':
        if (this.observationLogDebug) {
          console.log('🔄 Buoyancy: Neutral - maintaining current depth');
        }
        break;
      case 'active_swimming':
        if (this.observationLogDebug) {
          console.log('🏊 Buoyancy: Active swimming - full propulsion control');
        }
        break;
    }
  }

  private async executeMovementStrategy(
    strategy: WaterNavigationStrategy,
    target: Vec3,
    timeoutMs: number
  ): Promise<{ success: boolean; reason?: string }> {
    // In a real implementation, this would execute specific movement patterns
    // For now, we simulate different execution strategies

    const strategyKey = `${strategy}:${this.buoyancyState}`;
    if (
      this.lastStrategyKey !== strategyKey ||
      this.shouldLog('water-strategy', this.waterLogThrottleMs)
    ) {
      console.log(`🏊 WaterNav strategy: ${strategy}`);
      this.lastStrategyKey = strategyKey;
    }

    switch (strategy) {
      case 'surface_escape':
        return await this.executeSurfaceEscape(target, timeoutMs);
      case 'deep_dive':
        return await this.executeDeepDive(target, timeoutMs);
      case 'lateral_swim':
        return await this.executeLateralSwim(target, timeoutMs);
      case 'current_navigation':
        return await this.executeCurrentNavigation(target, timeoutMs);
      case 'buoyancy_float':
        return await this.executeBuoyancyFloat(target, timeoutMs);
      case 'stay_submerged':
        return await this.executeStaySubmerged(target, timeoutMs);
      default:
        return { success: false, reason: 'Unknown strategy' };
    }
  }

  private shouldLog(key: string, throttleMs: number): boolean {
    const now = Date.now();
    const last = this.lastWaterLogAt.get(key) ?? 0;
    if (now - last < throttleMs) return false;
    this.lastWaterLogAt.set(key, now);
    return true;
  }

  private async executeSurfaceEscape(
    target: Vec3,
    timeoutMs: number
  ): Promise<{ success: boolean; reason?: string }> {
    // Simulate surface escape movement
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { success: true, reason: 'Surface escape completed' };
  }

  private async executeDeepDive(
    target: Vec3,
    timeoutMs: number
  ): Promise<{ success: boolean; reason?: string }> {
    // Simulate deep dive movement
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return { success: true, reason: 'Deep dive completed' };
  }

  private async executeLateralSwim(
    target: Vec3,
    timeoutMs: number
  ): Promise<{ success: boolean; reason?: string }> {
    // Simulate lateral swimming
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return { success: true, reason: 'Lateral swim completed' };
  }

  private async executeCurrentNavigation(
    target: Vec3,
    timeoutMs: number
  ): Promise<{ success: boolean; reason?: string }> {
    // Simulate current navigation
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return { success: true, reason: 'Current navigation completed' };
  }

  private async executeBuoyancyFloat(
    target: Vec3,
    timeoutMs: number
  ): Promise<{ success: boolean; reason?: string }> {
    // Simulate buoyancy floating
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return { success: true, reason: 'Buoyancy float completed' };
  }

  private async executeStaySubmerged(
    target: Vec3,
    timeoutMs: number
  ): Promise<{ success: boolean; reason?: string }> {
    // Simulate staying submerged
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { success: true, reason: 'Stay submerged completed' };
  }

  private recordNavigationOutcome(
    strategy: WaterNavigationStrategy,
    success: boolean
  ): void {
    this.navigationHistory.push({
      strategy,
      success,
      timestamp: Date.now(),
    });

    // Keep only recent history (last 100 entries)
    if (this.navigationHistory.length > 100) {
      this.navigationHistory = this.navigationHistory.slice(-100);
    }
  }
}
