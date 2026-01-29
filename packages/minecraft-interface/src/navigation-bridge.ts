/* eslint-disable @typescript-eslint/no-unused-vars */
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
import {
  neuralTerrainPredictor,
  TerrainPattern,
  PredictionResult,
} from './neural-terrain-predictor.js';
import {
  environmentalDetector,
  EnvironmentalState,
} from './environmental-detector.js';
import { WaterNavigationManager } from './water-navigation-manager.js';
import { LongJourneyNavigator } from './long-journey-navigator.js';

// Import D* Lite components from world package
// Temporarily comment out to use local types
// import {
//   NavigationSystem,
//   NavigationConfig,
//   PathPlanningRequest,
//   PathPlanningResult,
// } from '@conscious-bot/world';

// NavigationConfig and other types are now imported from local types file
import { NavigationConfig } from './types.js';

interface PathPlanningRequest {
  start: { x: number; y: number; z: number };
  goal: { x: number; y: number; z: number };
  options?: any;
  maxDistance?: number;
  allowPartialPath?: boolean;
  avoidHazards?: boolean;
  urgency?: number;
  preferences?: any;
  timeout?: number;
}

interface PathPlanningResult {
  success: boolean;
  path?: Array<{ x: number; y: number; z: number }>;
  cost?: number;
  error?: string;
  reason?: string;
}

class MockNavigationSystem extends EventEmitter {
  private config: NavigationConfig;
  constructor(config?: NavigationConfig) {
    super();
    this.config = config || {};
  }
  buildGraph(worldRegion: any): { success: boolean; nodes: number } {
    // Simple implementation that simulates building a navigation graph
    const regionSize = worldRegion
      ? (worldRegion.width || 16) *
        (worldRegion.height || 16) *
        (worldRegion.length || 16)
      : 1000;
    const estimatedNodes = Math.min(regionSize / 4, 2000); // Estimate reasonable node count

    console.log(
      `[NavigationSystem] Building graph for region with ~${estimatedNodes} estimated nodes`
    );

    return {
      success: true,
      nodes: estimatedNodes,
    };
  }
  // eslint
  async planPath(request: PathPlanningRequest): Promise<PathPlanningResult> {
    // Simple mock implementation that creates a path
    const start = request.start;
    const goal = request.goal;

    // Calculate straight-line path
    const path: Array<{ x: number; y: number; z: number }> = [];
    const steps = 20;
    const dx = (goal.x - start.x) / steps;
    const dy = (goal.y - start.y) / steps;
    const dz = (goal.z - start.z) / steps;

    for (let i = 0; i <= steps; i++) {
      path.push({
        x: start.x + dx * i,
        y: start.y + dy * i,
        z: start.z + dz * i,
      });
    }

    return {
      success: true,
      path,
      cost: Math.sqrt(dx * dx + dy * dy + dz * dz) * steps,
      reason: 'mock_path',
    };
  }
}

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
  private navigationSystem: MockNavigationSystem;
  private currentPath: Vec3[] = [];
  private isNavigating = false;
  private replanCount = 0;
  private obstaclesDetected: ObstacleInfo[] = [];
  private navigationGraphBuilt = false;

  // mineflayer-pathfinder wiring
  private pf?: any;
  private movements?: any;

  // Dynamic reconfiguration system
  private terrainAnalyzer?: TerrainAnalyzer;
  private dynamicReconfigurator?: DynamicReconfigurator;

  // Neural terrain prediction
  private neuralEnabled: boolean = true;
  private botId: string;
  private predictionResults: Map<string, PredictionResult> = new Map();
  private socialLearningEnabled: boolean = true;

  // Water navigation
  private waterNavigationManager: WaterNavigationManager;

  // Long journey navigation
  private longJourneyNavigator: LongJourneyNavigator;

  constructor(bot: Bot, config: Partial<NavigationBridgeConfig> = {}) {
    super();

    console.log('🚀 NavigationBridge constructor called');
    console.log('🔍 Bot state:', {
      hasBot: !!bot,
      hasEntity: !!bot.entity,
      hasPosition: !!bot.entity?.position,
      hasPathfinder: !!(bot as any).pathfinder,
      version: bot.version,
    });

    this.bot = bot;
    this.botId = `bot_${Math.random().toString(36).substr(2, 9)}`;
    this.config = {
      maxRaycastDistance: 32,
      pathfindingTimeout: 30_000,
      replanThreshold: 5,
      obstacleDetectionRadius: 8,
      enableDynamicReplanning: true,
      useRaycasting: true,
      usePathfinding: true,
      ...config,
    };

    // Configure dynamic D* Lite with terrain-aware parameter switching
    // See docs/planning/dstar-lite-terrain-optimization.md for detailed analysis
    const navConfig: NavigationConfig = this.createDynamicConfig();

    // Additional configuration for navigation system
    const additionalConfig = {
      optimization: {
        pathSmoothing: true,
        lookaheadDistance: 20,
        safetyMargin: 2,
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

    // Merge additional config into navConfig
    Object.assign(navConfig, additionalConfig);

    this.navigationSystem = new MockNavigationSystem(navConfig);

    // Store reference to dynamic reconfiguration system
    this.terrainAnalyzer = new TerrainAnalyzer();
    this.dynamicReconfigurator = new DynamicReconfigurator(
      this.terrainAnalyzer,
      this.navigationSystem
    );

    // Initialize water navigation manager
    this.waterNavigationManager = new WaterNavigationManager(
      this.bot,
      navConfig
    );

    // Initialize long journey navigator
    this.longJourneyNavigator = new LongJourneyNavigator(
      this.bot,
      this,
      navConfig
    );

    // Initialize neural terrain prediction
    this.initializeNeuralPrediction();

    // Initialize environmental monitoring
    this.initializeEnvironmentalMonitoring();

    // Initialize pathfinder asynchronously - it will be ready when needed
    this.initializePathfinder();
    this.setupEventHandlers();
  }

  private async initializePathfinder(): Promise<void> {
    try {
      console.log('🔧 Loading mineflayer-pathfinder...');
      // Use dynamic import for ES modules compatibility
      const pathfinderModule = await import('mineflayer-pathfinder');
      this.pf = pathfinderModule;
      console.log('✅ mineflayer-pathfinder loaded:', !!this.pf);

      if (!(this.bot as any).pathfinder) {
        console.log('🔧 Loading pathfinder plugin...');
        this.bot.loadPlugin(this.pf.pathfinder);
        console.log('✅ Pathfinder plugin loaded');
      }

      console.log('🔧 Loading minecraft-data...');
      try {
        const mcDataModule = await import('minecraft-data');
        const mcData = mcDataModule.default || mcDataModule;
        // Check if mcData is callable
        if (typeof mcData === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const _mcDataInstance = mcData(this.bot.version);
          console.log(
            '✅ Minecraft data loaded for version:',
            this.bot.version
          );
        } else {
          throw new Error('minecraft-data is not callable');
        }
      } catch (error) {
        console.warn(
          '⚠️ Failed to load minecraft-data, using fallback:',
          error
        );
        // Use a fallback approach without minecraft-data
        console.log('✅ Using fallback data loading');
      }

      console.log('🔧 Creating movements...');
      // Create movements without minecraft-data for now
      this.movements = new this.pf.Movements(this.bot);
      console.log('✅ Movements created');

      console.log('🔧 Setting pathfinder movements...');
      this.bot.pathfinder.setMovements(this.movements);
      console.log('✅ Pathfinder movements set');

      console.log('✅ Mineflayer pathfinder fully initialized');

      // Emit event that pathfinder is ready
      this.emit('pathfinder-ready', { success: true });
    } catch (e) {
      // If pathfinder isn't available, we can still compile; navigateTo will fail fast.
      console.error('❌ Mineflayer pathfinder initialization failed:', e);
      console.error('Error stack:', e instanceof Error ? e.stack : 'No stack');
      this.pf = undefined;

      // Emit event that pathfinder failed
      this.emit('pathfinder-ready', { success: false, error: e });
    }
  }

  /**
   * Initialize neural terrain prediction system
   */
  private initializeNeuralPrediction(): void {
    try {
      console.log('🧠 Initializing neural terrain prediction...');

      // Register this bot with the social learning system
      neuralTerrainPredictor.registerBot(this.botId);

      // Set up neural prediction event handlers
      neuralTerrainPredictor.on(
        'pattern-detected',
        (pattern: TerrainPattern) => {
          this.emit('neural-pattern-detected', pattern);
        }
      );

      neuralTerrainPredictor.on(
        'prediction-made',
        (result: PredictionResult) => {
          this.emit('neural-prediction-made', result);
        }
      );

      neuralTerrainPredictor.on('learning-update', (data: any) => {
        this.emit('neural-learning-update', data);
      });

      neuralTerrainPredictor.on('social-learning-analysis', (data: any) => {
        this.emit('social-learning-analysis', data);
      });

      console.log('✅ Neural terrain prediction initialized');
    } catch (error) {
      console.error('❌ Failed to initialize neural prediction:', error);
      this.neuralEnabled = false;
    }
  }

  /**
   * Initialize environmental monitoring system
   */
  private initializeEnvironmentalMonitoring(): void {
    try {
      console.log('🌍 Initializing environmental monitoring...');

      // Wire bot reference into environmental detector for real data queries
      environmentalDetector.setBot(this.bot);

      // Start environmental monitoring
      environmentalDetector.startMonitoring(3000); // Update every 3 seconds

      // Set up environmental monitoring event handlers
      environmentalDetector.on(
        'environment-updated',
        (state: EnvironmentalState) => {
          this.emit('environment-updated', state);
        }
      );

      console.log('✅ Environmental monitoring initialized');
    } catch (error) {
      console.error('❌ Failed to initialize environmental monitoring:', error);
    }
  }

  /**
   * Check if pathfinder is ready
   */
  public isPathfinderReady(): boolean {
    return !!this.pf && !!(this.bot as any).pathfinder;
  }

  /**
   * Wait for pathfinder to be ready
   */
  public async waitForPathfinderReady(
    timeoutMs: number = 5000
  ): Promise<boolean> {
    if (this.isPathfinderReady()) {
      return true;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, timeoutMs);

      this.once('pathfinder-ready', (result: any) => {
        clearTimeout(timeout);
        resolve(result.success);
      });
    });
  }

  /**
   * Navigate to target using D* Lite planning + Mineflayer execution.
   */
  async navigateTo(
    target: Vec3 | { x: number; y: number; z: number },
    options: {
      timeout?: number;
      useRaycasting?: boolean;
      dynamicReplanning?: boolean;
    } = {}
  ): Promise<NavigationResult> {
    const targetVec3 =
      target instanceof Vec3 ? target : new Vec3(target.x, target.y, target.z);

    if (this.isNavigating) {
      return this.createFailureResult('Already navigating', targetVec3);
    }

    // Debug pathfinder state
    console.log('🧭 NavigationBridge state check:', {
      usePathfinding: this.config.usePathfinding,
      hasBotPathfinder: !!(this.bot as any).pathfinder,
      hasPf: !!this.pf,
      hasMovements: !!this.movements,
      timestamp: Date.now(),
    });

    // Wait for pathfinder to be ready if needed
    if (!this.isPathfinderReady()) {
      console.log('🔄 Waiting for pathfinder to be ready...');
      const ready = await this.waitForPathfinderReady(10000); // Wait up to 10 seconds
      if (!ready) {
        console.log('❌ NavigationBridge pathfinder not ready after timeout');
        return this.createFailureResult(
          'Pathfinder plugin not ready after timeout',
          targetVec3
        );
      }
      console.log('✅ NavigationBridge pathfinder ready');
    }

    if (
      !this.config.usePathfinding ||
      !(this.bot as any).pathfinder ||
      !this.pf
    ) {
      console.log('❌ NavigationBridge pathfinder check failed');
      return this.createFailureResult(
        'Pathfinder plugin not initialized',
        targetVec3
      );
    }

    this.isNavigating = true;
    this.replanCount = 0;
    this.obstaclesDetected = [];
    this.currentPath = [];
    const startTime = Date.now();

    try {
      // 1) Neural terrain prediction
      if (this.neuralEnabled) {
        await this.performNeuralPrediction(targetVec3);
      }

      // 2) Observe local world (legitimate capabilities only)
      const worldInfo = await this.gatherWorldInformation(targetVec3);
      this.obstaclesDetected = worldInfo.obstacles;

      // 3) Plan with D* façade
      const pathResult = await this.planPathWithDStarLite(targetVec3);
      if (
        !pathResult.success ||
        !pathResult.path ||
        pathResult.path.length === 0
      ) {
        return this.createFailureResult(
          pathResult.reason || 'Failed to plan path',
          targetVec3
        );
      }
      this.currentPath = pathResult.path.map((p) => new Vec3(p.x, p.y, p.z));

      // 3) Execute with optional dynamic replanning
      const executionResult = await this.executePathWithReplanning(
        pathResult.path,
        targetVec3,
        {
          dynamicReplanning:
            options.dynamicReplanning ?? this.config.enableDynamicReplanning,
          timeout: options.timeout ?? this.config.pathfindingTimeout,
        }
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
      return this.createFailureResult(
        error instanceof Error ? error.message : 'Unknown navigation error',
        targetVec3
      );
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

    // Check light levels for safety
    let currentLight = 15;
    try {
      const worldLight = (this.bot.world as any).getLight?.(botPos.floored());
      if (typeof worldLight === 'number') {
        currentLight = worldLight;
      }
    } catch {
      // fallback to 15
    }
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

    // Mineflayer exposes world.raycast(start, dir, maxDistance, matcher?)
    const hit = (this.bot as any).world?.raycast?.(
      start,
      direction,
      this.config.maxRaycastDistance
    );
    if (hit?.block) {
      const block = hit.block;
      const distance = start.distanceTo(hit.position);
      const severity = this.classifyObstacle(block.name, distance);

      obstacles.push({
        position: hit.position,
        blockType: block.name,
        distance,
        severity,
      });
      if (this.isHazard(block.name)) hazards.push(hit.position);
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

          if (
            block?.name &&
            block.name !== 'air' &&
            this.isObstacle(block.name)
          ) {
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

      if (groundBlock?.name && this.isSolidGround(groundBlock.name)) {
        safeAreas.push(checkPos);
      }
    }

    return safeAreas;
  }

  /**
   * Plan path using D* Lite algorithm
   */
  private async planPathWithDStarLite(
    target: Vec3
    // worldInfo: any
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

    // Build navigation graph if not already built
    if (!this.navigationGraphBuilt) {
      try {
        const buildResult = await this.buildNavigationGraph(start, target);
        this.navigationGraphBuilt = buildResult.success;
        console.log('Navigation graph built:', buildResult);
      } catch (error) {
        console.error('Failed to build navigation graph:', error);
        return {
          success: false,
          error: 'Failed to build navigation graph',
          reason: 'graph_build_error',
        };
      }
    }

    const request: PathPlanningRequest = {
      start,
      goal,
      maxDistance: 200,
      allowPartialPath: true,
      avoidHazards: true,
      urgency: 0.5,
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

    try {
      return await this.navigationSystem.planPath(request);
    } catch (error) {
      console.error('NavigationSystem.planPath error:', error);
      console.error(
        'Error details:',
        error instanceof Error ? error.message : String(error)
      );
      console.error(
        'Error stack:',
        error instanceof Error ? error.stack : 'No stack'
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        reason: 'navigation_system_error',
      };
    }
  }

  /**
   * Execute path with dynamic replanning
   */
  private async executePathWithReplanning(
    path: WorldPosition[],
    target: Vec3,
    options: { dynamicReplanning?: boolean; timeout?: number }
  ): Promise<{ success: boolean; error?: string }> {
    const steps = path.map((p) => new Vec3(p.x, p.y, p.z));
    this.currentPath = steps;
    const maxReplans = 10;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Attempt to move to the step first
      const moved = await this.moveToStep(
        step,
        options.timeout ?? this.config.pathfindingTimeout
      );

      if (moved.success) {
        continue;
      }

      // Move failed — try replanning if enabled and under budget
      if (this.replanCount >= maxReplans || !(options.dynamicReplanning ?? true)) {
        return moved;
      }

      this.replanCount++;

      // refresh observations
      const info = await this.gatherWorldInformation(target);
      this.obstaclesDetected = info.obstacles;

      const updated = await this.planPathWithDStarLite(target);
      if (!updated.success || !updated.path || updated.path.length === 0) {
        return { success: false, error: 'Failed to replan path after move failure' };
      }
      // Replace the remainder with the new plan
      const rest = updated.path.map((p) => new Vec3(p.x, p.y, p.z));
      steps.splice(i, steps.length - i, ...rest);
      this.currentPath = steps;
      // Retry the current index with the new first step
      i--;
    }

    return { success: true };
  }

  /**
   * Move to a specific step in the path using event-driven stuck detection.
   *
   * Listens for pathfinder events (goal_reached, path_update, path_reset) and
   * polls position every 2 s to detect stuck states (~6 s) instead of waiting
   * for a full timeout.
   */
  private async moveToStep(
    step: Vec3,
    timeoutMs: number
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.pf || !(this.bot as any).pathfinder) {
      return { success: false, error: 'Pathfinder plugin not initialized' };
    }

    // Simple GoalNear compatible with mineflayer-pathfinder
    const goal = {
      x: step.x,
      y: step.y,
      z: step.z,
      rangeSq: 1,
      heuristic(node: any): number {
        const dx = step.x - node.x;
        const dy = step.y - node.y;
        const dz = step.z - node.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      },
      isEnd(node: any): boolean {
        const dx = step.x - node.x;
        const dy = step.y - node.y;
        const dz = step.z - node.z;
        return dx * dx + dy * dy + dz * dz <= 1;
      },
      hasChanged(): boolean {
        return false;
      },
      isValid(): boolean {
        return true;
      },
    };

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      let resolved = false;
      const finish = (result: { success: boolean; error?: string }) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };

      // --- Position-history sliding window for stuck detection ---
      const POLL_INTERVAL = 2000; // ms
      const STUCK_WINDOW = 3; // number of samples (6 s at 2 s intervals)
      const STUCK_THRESHOLD = 0.5; // blocks
      const positionHistory: Vec3[] = [];

      const stuckPoll = setInterval(() => {
        if (resolved) return;
        const pos = this.bot.entity.position.clone();
        positionHistory.push(pos);
        if (positionHistory.length > STUCK_WINDOW) {
          positionHistory.shift();
        }
        if (positionHistory.length === STUCK_WINDOW) {
          const oldest = positionHistory[0];
          const newest = positionHistory[positionHistory.length - 1];
          const moved = oldest.distanceTo(newest);
          if (moved < STUCK_THRESHOLD) {
            console.log(
              `🚫 Stuck detected: moved ${moved.toFixed(2)} blocks in ${STUCK_WINDOW * (POLL_INTERVAL / 1000)}s`
            );
            try {
              this.bot.pathfinder.stop();
            } catch {}
            finish({ success: false, error: 'Stuck: insufficient movement progress' });
          }
        }
      }, POLL_INTERVAL);

      // --- Hard timeout safety net ---
      const hardTimeout = setTimeout(() => {
        console.log(`⏰ Hard timeout reached (${timeoutMs}ms)`);
        try {
          this.bot.pathfinder.stop();
        } catch {}
        finish({ success: false, error: 'Step movement timeout' });
      }, timeoutMs);

      // --- Pathfinder event listeners ---
      const onGoalReached = () => {
        finish({ success: true });
      };

      const onPathUpdate = (results: any) => {
        if (results?.status === 'noPath') {
          console.log('🚫 Path unreachable (noPath)');
          try {
            this.bot.pathfinder.stop();
          } catch {}
          finish({ success: false, error: 'Path unreachable' });
        }
      };

      const onPathReset = () => {
        console.log('🔄 Path reset (stuck signal from pathfinder)');
        try {
          this.bot.pathfinder.stop();
        } catch {}
        finish({ success: false, error: 'Pathfinder stuck (path_reset)' });
      };

      // --- Cleanup ---
      const cleanup = () => {
        clearInterval(stuckPoll);
        clearTimeout(hardTimeout);
        try { this.bot.removeListener('goal_reached' as any, onGoalReached); } catch {}
        try { this.bot.removeListener('path_update' as any, onPathUpdate); } catch {}
        try { this.bot.removeListener('path_reset' as any, onPathReset); } catch {}
      };

      // --- Attach listeners and kick off movement ---
      this.bot.on('goal_reached' as any, onGoalReached);
      this.bot.on('path_update' as any, onPathUpdate);
      this.bot.on('path_reset' as any, onPathReset);

      try {
        this.bot.pathfinder.setGoal(goal);
      } catch (err: any) {
        finish({ success: false, error: err?.message ?? String(err) });
      }
    });
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
    // Pass-through planner events (when real D* implementation emits them)
    this.navigationSystem.on('path-planned', (result) =>
      this.emit('path-planned', result)
    );
    this.navigationSystem.on('path-updated', (result) =>
      this.emit('path-updated', result)
    );
    this.navigationSystem.on('obstacle-detected', (obs) =>
      this.emit('obstacle-detected', obs)
    );
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
    neuralEnabled: boolean;
    predictionResults: number;
    botId: string;
    environmentalState?: EnvironmentalState;
  } {
    return {
      isNavigating: this.isNavigating,
      currentPath: this.currentPath,
      replanCount: this.replanCount,
      obstaclesDetected: this.obstaclesDetected,
      neuralEnabled: this.neuralEnabled,
      predictionResults: this.predictionResults.size,
      botId: this.botId,
      environmentalState: environmentalDetector.getCurrentState() || undefined,
    };
  }

  /**
   * Enable or disable neural prediction
   */
  setNeuralPrediction(enabled: boolean): void {
    this.neuralEnabled = enabled;
    neuralTerrainPredictor.setEnabled(enabled);
    console.log(
      `${enabled ? '🧠 Enabled' : '🚫 Disabled'} neural terrain prediction`
    );
  }

  /**
   * Enable or disable social learning
   */
  setSocialLearning(enabled: boolean): void {
    this.socialLearningEnabled = enabled;
    console.log(
      `${enabled ? '👥 Enabled' : '🚫 Disabled'} social learning system`
    );
  }

  /**
   * Get neural prediction statistics
   */
  getNeuralStats(): any {
    return neuralTerrainPredictor.getStats();
  }

  /**
   * Record navigation outcome for learning
   */
  recordNavigationOutcome(success: boolean, pathLength?: number): void {
    if (this.neuralEnabled && this.predictionResults.size > 0) {
      // Use the most recent prediction for learning
      const latestPrediction = Array.from(
        this.predictionResults.values()
      ).pop();
      if (latestPrediction) {
        const outcome = success ? 'success' : 'failure';
        neuralTerrainPredictor.recordNavigationOutcome(
          this.botId,
          latestPrediction.optimalPath.join('_'),
          outcome === 'success'
        );
      }
    }
  }

  /**
   * Get current environmental state
   */
  getEnvironmentalState(): EnvironmentalState | null {
    return environmentalDetector.getCurrentState();
  }

  /**
   * Detect environmental hazards at current position
   */
  getEnvironmentalHazards(): Array<{
    type: string;
    position: Vec3;
    severity: 'low' | 'medium' | 'high';
    description: string;
    avoidanceDistance: number;
  }> {
    return environmentalDetector.detectHazards(this.bot.entity.position);
  }

  /**
   * Get environmental statistics
   */
  getEnvironmentalStats(): any {
    return environmentalDetector.getEnvironmentalStats();
  }

  // ==================== Long Journey Navigation ====================

  /**
   * Navigate to a distant destination using chunk-based pathfinding
   */
  async navigateLongJourney(
    destination: Vec3,
    urgency: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<{
    success: boolean;
    totalDistance: number;
    totalTime: number;
    stages: number;
    waypointsDiscovered: number;
    error?: string;
  }> {
    console.log(
      `🗺️ Starting long journey to: ${destination.x.toFixed(1)}, ${destination.y.toFixed(1)}, ${destination.z.toFixed(1)}`
    );

    try {
      const result = await this.longJourneyNavigator.navigateToDestination({
        destination,
        urgency,
        constraints: {
          avoidWater: false,
          avoidHostileAreas: true,
          preferSafePaths: true,
        },
      });

      return {
        success: result.success,
        totalDistance: result.totalDistance,
        totalTime: result.totalTime,
        stages: result.stages.length,
        waypointsDiscovered: result.waypointsDiscovered.length,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        totalDistance: 0,
        totalTime: 0,
        stages: 0,
        waypointsDiscovered: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Start following a player with intelligent pathfinding
   */
  async startFollowingPlayer(
    playerId: string,
    playerName: string
  ): Promise<boolean> {
    return await this.longJourneyNavigator.startFollowingPlayer(
      playerId,
      playerName
    );
  }

  /**
   * Stop following the current player
   */
  stopFollowingPlayer(): void {
    this.longJourneyNavigator.stopFollowingPlayer();
  }

  /**
   * Get journey statistics
   */
  getJourneyStatistics(): any {
    return this.longJourneyNavigator.getJourneyStatistics();
  }

  /**
   * Add a waypoint manually
   */
  addWaypoint(waypoint: {
    position: Vec3;
    type: 'safe' | 'hazard' | 'resource' | 'landmark' | 'portal';
    description: string;
    riskLevel: 'low' | 'medium' | 'high';
    accessibility: {
      canReach: boolean;
      requiresTools?: string[];
      seasonalAccess?: boolean;
      timeRestrictions?: { start: number; end: number };
    };
    chunk: {
      x: number;
      z: number;
      key: string;
    };
  }): any {
    return this.longJourneyNavigator.addWaypoint(waypoint);
  }

  /**
   * Get waypoints in a specific chunk
   */
  getChunkWaypoints(chunkX: number, chunkZ: number): any[] {
    return this.longJourneyNavigator.getChunkWaypoints(chunkX, chunkZ);
  }

  /**
   * Force environmental analysis update
   */
  async updateEnvironmentalAnalysis(): Promise<EnvironmentalState> {
    return await environmentalDetector.analyzeEnvironment(
      this.bot.entity.position
    );
  }

  /**
   * Build navigation graph for the current world region
   */
  private async buildNavigationGraph(
    start: WorldPosition,
    target: WorldPosition
  ): Promise<{ success: boolean; nodes: number }> {
    const worldRegion = {
      bounds: {
        minX: Math.min(start.x - 50, target.x - 50),
        maxX: Math.max(start.x + 50, target.x + 50),
        minY: Math.min(start.y - 10, target.y - 10),
        maxY: Math.max(start.y + 10, target.y + 10),
        minZ: Math.min(start.z - 50, target.z - 50),
        maxZ: Math.max(start.z + 50, target.z + 50),
      },
      isWalkable: (pos: WorldPosition) => {
        try {
          const block = this.bot.blockAt(new Vec3(pos.x, pos.y, pos.z));
          if (!block) return true; // unknown = assume walkable
          return block.boundingBox !== 'block';
        } catch {
          return true;
        }
      },
      getBlockType: (pos: WorldPosition) => {
        try {
          const block = this.bot.blockAt(new Vec3(pos.x, pos.y, pos.z));
          return block?.name ?? 'air';
        } catch {
          return 'air';
        }
      },
      isHazardous: (pos: WorldPosition) => {
        try {
          const block = this.bot.blockAt(new Vec3(pos.x, pos.y, pos.z));
          if (!block) return false;
          const hazardBlocks = ['lava', 'fire', 'cactus', 'magma_block', 'sweet_berry_bush'];
          return hazardBlocks.some((h) => block.name.includes(h));
        } catch {
          return false;
        }
      },
    };
    try {
      return this.navigationSystem.buildGraph(worldRegion);
    } catch (e) {
      return { success: false, nodes: 0 };
    }
  }

  private failQuick(msg: string, goal: Vec3): NavigationResult {
    return {
      success: false,
      pathFound: false,
      finalPosition: this.bot.entity.position.clone(),
      distanceToGoal: this.bot.entity.position.distanceTo(goal),
      pathLength: 0,
      replans: this.replanCount,
      obstaclesDetected: this.obstaclesDetected.length,
      error: msg,
    };
  }

  private createFailureResult(msg: string, goal: Vec3): NavigationResult {
    return {
      success: false,
      pathFound: false,
      finalPosition: this.bot.entity.position.clone(),
      distanceToGoal: this.bot.entity.position.distanceTo(goal),
      pathLength: 0,
      replans: this.replanCount,
      obstaclesDetected: this.obstaclesDetected.length,
      error: msg,
    };
  }

  /**
   * Perform neural terrain prediction for enhanced pathfinding
   */
  private async performNeuralPrediction(target: Vec3): Promise<void> {
    try {
      console.log('🧠 Performing neural terrain prediction...');

      // Get neural prediction for the path
      const prediction = await neuralTerrainPredictor.predictPath(
        this.bot.entity.position,
        target
      );

      // Store prediction result (capped to prevent unbounded growth)
      const predictionId = `${this.bot.entity.position.x}_${this.bot.entity.position.z}_${target.x}_${target.z}`;
      this.predictionResults.set(predictionId, prediction);
      if (this.predictionResults.size > 100) {
        // Evict oldest entries
        const keys = Array.from(this.predictionResults.keys());
        for (let i = 0; i < keys.length - 100; i++) {
          this.predictionResults.delete(keys[i]);
        }
      }

      // Share successful patterns with social learning system
      if (this.socialLearningEnabled && prediction.confidence > 0.7) {
        const pattern: TerrainPattern = {
          id: `pattern_${Date.now()}`,
          type: prediction.terrainType,
          position: this.bot.entity.position,
          confidence: prediction.confidence,
          features: await this.generateTerrainFeatures(
            this.bot.entity.position
          ),
          timestamp: Date.now(),
          predictedStability: 1 - prediction.riskAssessment,
        };

        neuralTerrainPredictor.sharePattern(this.botId, pattern);
      }

      console.log('✅ Neural prediction completed:', {
        terrainType: prediction.terrainType,
        confidence: prediction.confidence.toFixed(2),
        riskAssessment: prediction.riskAssessment.toFixed(2),
        predictedChanges: prediction.predictedChanges.length,
      });
    } catch (error) {
      console.error('❌ Neural prediction failed:', error);
    }
  }

  /**
   * Generate terrain features for neural network analysis
   */
  private async generateTerrainFeatures(position: Vec3): Promise<any> {
    // Query real world data with fallbacks
    let lightLevel = 15;
    let biome = 'plains';
    let blockType = 'stone';
    let hardness = 1.5;
    let transparency = 0;

    try {
      const worldLight = (this.bot.world as any).getLight?.(position.floored());
      if (typeof worldLight === 'number') {
        lightLevel = worldLight;
      }
    } catch {
      // fallback
    }

    try {
      const biomeId = (this.bot.world as any).getBiome?.(position);
      if (typeof biomeId === 'number') {
        const mcDataModule = await import('minecraft-data');
        const mcDataFn = mcDataModule.default || mcDataModule;
        if (typeof mcDataFn === 'function') {
          const mcData = mcDataFn(this.bot.version);
          const biomeData = mcData.biomes?.[biomeId];
          if (biomeData?.name) {
            biome = biomeData.name;
          }
        }
      }
    } catch {
      // fallback
    }

    try {
      const block = this.bot.blockAt(position);
      if (block) {
        blockType = block.name;
        hardness = block.hardness ?? 1.5;
        transparency = block.transparent ? 1 : 0;
      }
    } catch {
      // fallback
    }

    return {
      blockType,
      hardness,
      transparency,
      lightLevel,
      biome,
      elevation: position.y,
      slope: 0.1,
      hazardProximity: 0.2,
      stability: 0.9,
      accessibility: 0.8,
      resourceDensity: 0.3,
      harvestability: 0.6,
    };
  }

  /**
   * Create dynamic configuration based on current terrain analysis
   */
  private createDynamicConfig(): NavigationConfig {
    const baseConfig: NavigationConfig = {
      dstarLite: {
        searchRadius: 200,
        replanThreshold: 3,
        maxComputationTime: 25,
        heuristicWeight: 1.1,
      },
      costCalculation: {
        baseMoveCost: 1.0,
        diagonalMultiplier: 1.414,
        verticalMultiplier: 1.3,
        jumpCost: 2.0,
        swimCost: 5.0,
        // Enhanced water navigation costs
        surfaceSwimCost: 2.0,
        deepSwimCost: 8.0,
        currentResistanceCost: 3.0,
        buoyancyCost: 1.5,
        waterExitCost: 1.2,
      },
      hazardCosts: {
        lavaProximity: 2000,
        voidFall: 15000,
        mobProximity: 150,
        darknessPenalty: 30,
        waterPenalty: 15,
        // Enhanced water hazards
        drowningRisk: 500,
        currentHazard: 200,
        deepWaterPenalty: 300,
        surfaceObstruction: 100,
        cactusPenalty: 50,
        firePenalty: 800,
        poisonPenalty: 100,
      },
      optimization: {
        pathSmoothing: true,
        lookaheadDistance: 20,
        safetyMargin: 2,
      },
      maxDistance: 1000,
      timeout: 60000,
    };

    return baseConfig;
  }
}

/**
 * Terrain Type Detection and Analysis
 */
enum TerrainType {
  HILLS = 'hills',
  CAVES = 'caves',
  FOREST = 'forest',
  DESERT = 'desert',
  WATER = 'water',
  MIXED = 'mixed',
  MOUNTAINS = 'mountains',
  NETHER = 'nether',
  END = 'end',
  UNKNOWN = 'unknown',
}

/**
 * Terrain Analyzer - Analyzes current environment to determine terrain type
 */
class TerrainAnalyzer {
  private lastAnalysis: number = 0;
  private analysisCache = new Map<string, TerrainType>();

  /**
   * Analyze terrain around a position
   */
  async analyzeTerrain(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _position: Vec3,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _radius: number = 16
  ): Promise<TerrainType> {
    const cacheKey = `${_position.x},${_position.y},${_position.z}`;

    // Check cache first (5 second TTL)
    const cached = this.analysisCache.get(cacheKey);
    if (cached && Date.now() - this.lastAnalysis < 5000) {
      return cached;
    }

    const terrainType = await this.performTerrainAnalysis(_position, _radius);
    this.analysisCache.set(cacheKey, terrainType);
    // Cap cache size
    if (this.analysisCache.size > 200) {
      const firstKey = this.analysisCache.keys().next().value;
      if (firstKey) this.analysisCache.delete(firstKey);
    }
    this.lastAnalysis = Date.now();

    return terrainType;
  }

  /**
   * Perform actual terrain analysis using bot's view
   */
  private async performTerrainAnalysis(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _position: Vec3,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _radius: number
  ): Promise<TerrainType> {
    // This would use bot's raycasting and block inspection
    // For now, return UNKNOWN to be enhanced later
    return TerrainType.UNKNOWN;
  }

  /**
   * Get terrain characteristics for parameter optimization
   */
  getTerrainCharacteristics(terrainType: TerrainType): TerrainCharacteristics {
    const characteristics: Record<TerrainType, TerrainCharacteristics> = {
      [TerrainType.HILLS]: {
        verticalMovement: 'high',
        obstacleDensity: 'medium',
        hazardLevel: 'medium',
        dynamicEnvironment: true,
        preferredMovement: 'careful',
      },
      [TerrainType.CAVES]: {
        verticalMovement: 'low',
        obstacleDensity: 'high',
        hazardLevel: 'high',
        dynamicEnvironment: true,
        preferredMovement: 'safe',
      },
      [TerrainType.FOREST]: {
        verticalMovement: 'medium',
        obstacleDensity: 'high',
        hazardLevel: 'medium',
        dynamicEnvironment: false,
        preferredMovement: 'balanced',
      },
      [TerrainType.DESERT]: {
        verticalMovement: 'low',
        obstacleDensity: 'low',
        hazardLevel: 'low',
        dynamicEnvironment: false,
        preferredMovement: 'fast',
      },
      [TerrainType.WATER]: {
        verticalMovement: 'low',
        obstacleDensity: 'low',
        hazardLevel: 'high',
        dynamicEnvironment: true,
        preferredMovement: 'cautious',
      },
      [TerrainType.MIXED]: {
        verticalMovement: 'medium',
        obstacleDensity: 'medium',
        hazardLevel: 'medium',
        dynamicEnvironment: true,
        preferredMovement: 'adaptive',
      },
      [TerrainType.MOUNTAINS]: {
        verticalMovement: 'high',
        obstacleDensity: 'high',
        hazardLevel: 'high',
        dynamicEnvironment: true,
        preferredMovement: 'careful',
      },
      [TerrainType.NETHER]: {
        verticalMovement: 'medium',
        obstacleDensity: 'high',
        hazardLevel: 'high',
        dynamicEnvironment: true,
        preferredMovement: 'safe',
      },
      [TerrainType.END]: {
        verticalMovement: 'medium',
        obstacleDensity: 'low',
        hazardLevel: 'medium',
        dynamicEnvironment: false,
        preferredMovement: 'balanced',
      },
      [TerrainType.UNKNOWN]: {
        verticalMovement: 'medium',
        obstacleDensity: 'medium',
        hazardLevel: 'medium',
        dynamicEnvironment: false,
        preferredMovement: 'balanced',
      },
    };

    return characteristics[terrainType] || characteristics[TerrainType.UNKNOWN];
  }
}

/**
 * Terrain characteristics for optimization
 */
interface TerrainCharacteristics {
  verticalMovement: 'low' | 'medium' | 'high';
  obstacleDensity: 'low' | 'medium' | 'high';
  hazardLevel: 'low' | 'medium' | 'high';
  dynamicEnvironment: boolean;
  preferredMovement:
    | 'aggressive'
    | 'fast'
    | 'moderate'
    | 'careful'
    | 'safe'
    | 'cautious'
    | 'balanced'
    | 'adaptive';
}

/**
 * Dynamic Reconfigurator - Switches navigation parameters based on terrain changes
 */
class DynamicReconfigurator {
  private currentTerrain: TerrainType = TerrainType.UNKNOWN;
  private lastReconfiguration = 0;
  private reconfigurationHistory: Array<{
    timestamp: number;
    terrain: TerrainType;
    config: NavigationConfig;
  }> = [];
  private terrainCheckInterval: NodeJS.Timeout | null = null;
  private static readonly MAX_HISTORY = 50;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _terrainAnalyzer: TerrainAnalyzer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _navigationSystem: MockNavigationSystem
  ) {
    // Set up periodic terrain checking during navigation
    this.terrainCheckInterval = setInterval(() => this.checkTerrainChanges(), 2000); // Check every 2 seconds
  }

  /**
   * Check if terrain has changed and reconfigure if needed
   */
  async checkTerrainChanges(): Promise<void> {
    // This would be called during active navigation
    // Implementation would check current position and detect terrain changes
  }

  /**
   * Get optimized configuration for specific terrain type
   */
  getOptimizedConfig(terrainType: TerrainType): NavigationConfig {
    const baseConfig: NavigationConfig = {
      dstarLite: {
        searchRadius: 200,
        replanThreshold: 3,
        maxComputationTime: 25,
        heuristicWeight: 1.1,
      },
      costCalculation: {
        baseMoveCost: 1.0,
        diagonalMultiplier: 1.414,
        verticalMultiplier: 1.3,
        jumpCost: 2.0,
        swimCost: 5.0,
      },
      hazardCosts: {
        lavaProximity: 2000,
        voidFall: 15000,
        mobProximity: 150,
        darknessPenalty: 30,
        waterPenalty: 15,
        cactusPenalty: 50,
        firePenalty: 800,
        poisonPenalty: 100,
      },
    };

    // Terrain-specific optimizations
    const terrainConfigs: Record<TerrainType, NavigationConfig> = {
      [TerrainType.HILLS]: {
        ...baseConfig,
        dstarLite: {
          ...(baseConfig.dstarLite ?? {}),
          searchRadius: 250,
          replanThreshold: 2,
          heuristicWeight: 1.2,
        },
        costCalculation: {
          ...(baseConfig.costCalculation ?? {}),
          verticalMultiplier: 1.2,
          jumpCost: 1.8,
        },
      },
      [TerrainType.CAVES]: {
        ...baseConfig,
        dstarLite: {
          ...(baseConfig.dstarLite ?? {}),
          searchRadius: 150,
          replanThreshold: 1,
          maxComputationTime: 15,
          heuristicWeight: 0.9,
        },
        costCalculation: {
          ...(baseConfig.costCalculation ?? {}),
          verticalMultiplier: 1.5,
          jumpCost: 2.5,
          swimCost: 10.0,
        },
        hazardCosts: {
          ...(baseConfig.hazardCosts ?? {}),
          lavaProximity: 5000,
          darknessPenalty: 100,
          voidFall: 20000,
        },
      },
      [TerrainType.FOREST]: {
        ...baseConfig,
        dstarLite: {
          ...(baseConfig.dstarLite ?? {}),
          searchRadius: 180,
          replanThreshold: 4,
          maxComputationTime: 30,
        },
        costCalculation: {
          ...(baseConfig.costCalculation ?? {}),
          verticalMultiplier: 1.4,
          jumpCost: 2.2,
        },
        hazardCosts: {
          ...(baseConfig.hazardCosts ?? {}),
          mobProximity: 300,
          poisonPenalty: 150,
        },
      },
      [TerrainType.DESERT]: {
        ...baseConfig,
        dstarLite: {
          ...(baseConfig.dstarLite ?? {}),
          searchRadius: 300,
          replanThreshold: 5,
          maxComputationTime: 35,
          heuristicWeight: 1.3,
        },
        costCalculation: {
          ...(baseConfig.costCalculation ?? {}),
          verticalMultiplier: 1.6,
          jumpCost: 1.5,
          swimCost: 15.0,
        },
        hazardCosts: {
          ...(baseConfig.hazardCosts ?? {}),
          cactusPenalty: 200,
          firePenalty: 1200,
        },
      },
      [TerrainType.WATER]: {
        ...baseConfig,
        dstarLite: {
          ...(baseConfig.dstarLite ?? {}),
          searchRadius: 120,
          replanThreshold: 2,
          maxComputationTime: 20,
          heuristicWeight: 0.8,
        },
        costCalculation: {
          ...(baseConfig.costCalculation ?? {}),
          verticalMultiplier: 2.0,
          jumpCost: 3.0,
          swimCost: 2.0,
          // Water-specific optimizations
          surfaceSwimCost: 1.5, // Easier at surface
          deepSwimCost: 4.0, // Harder in deep water
          currentResistanceCost: 2.5,
          buoyancyCost: 1.0, // Natural buoyancy helps
          waterExitCost: 0.8, // Easy to exit water
        },
        hazardCosts: {
          ...(baseConfig.hazardCosts ?? {}),
          mobProximity: 500,
          waterPenalty: 0,
          // Water-specific hazards
          drowningRisk: 300,
          currentHazard: 150,
          deepWaterPenalty: 200,
          surfaceObstruction: 50,
        },
      },
      [TerrainType.MIXED]: {
        ...baseConfig,
        dstarLite: {
          ...(baseConfig.dstarLite ?? {}),
          searchRadius: 220,
          replanThreshold: 3,
          maxComputationTime: 28,
          heuristicWeight: 1.1,
        },
        costCalculation: {
          ...(baseConfig.costCalculation ?? {}),
          verticalMultiplier: 1.4,
          jumpCost: 2.0,
          swimCost: 6.0,
        },
        hazardCosts: {
          ...(baseConfig.hazardCosts ?? {}),
          lavaProximity: 3000,
          mobProximity: 250,
          darknessPenalty: 40,
          waterPenalty: 25,
        },
      },
      [TerrainType.MOUNTAINS]: {
        ...baseConfig,
        dstarLite: {
          ...(baseConfig.dstarLite ?? {}),
          searchRadius: 280,
          replanThreshold: 2,
          maxComputationTime: 40,
          heuristicWeight: 1.3,
        },
        costCalculation: {
          ...(baseConfig.costCalculation ?? {}),
          verticalMultiplier: 1.5,
          jumpCost: 2.2,
        },
        hazardCosts: {
          ...(baseConfig.hazardCosts ?? {}),
          voidFall: 20000,
          mobProximity: 200,
        },
      },
      [TerrainType.NETHER]: {
        ...baseConfig,
        dstarLite: {
          ...(baseConfig.dstarLite ?? {}),
          searchRadius: 160,
          replanThreshold: 1,
          maxComputationTime: 20,
          heuristicWeight: 0.8,
        },
        costCalculation: {
          ...(baseConfig.costCalculation ?? {}),
          verticalMultiplier: 1.8,
          jumpCost: 3.0,
          swimCost: 8.0,
        },
        hazardCosts: {
          ...(baseConfig.hazardCosts ?? {}),
          lavaProximity: 10000,
          firePenalty: 2000,
          darknessPenalty: 200,
        },
      },
      [TerrainType.END]: {
        ...baseConfig,
        dstarLite: {
          ...(baseConfig.dstarLite ?? {}),
          searchRadius: 200,
          replanThreshold: 3,
          maxComputationTime: 25,
          heuristicWeight: 1.0,
        },
        costCalculation: {
          ...(baseConfig.costCalculation ?? {}),
          verticalMultiplier: 1.2,
          jumpCost: 1.5,
        },
        hazardCosts: {
          ...(baseConfig.hazardCosts ?? {}),
          voidFall: 25000,
          mobProximity: 300,
        },
      },
      [TerrainType.UNKNOWN]: baseConfig,
    };

    return terrainConfigs[terrainType] || baseConfig;
  }
}
