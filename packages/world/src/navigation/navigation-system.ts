/**
 * Navigation System - Integrated D* Lite pathfinding with dynamic replanning
 *
 * Main coordination system that integrates D* Lite algorithm, navigation graph,
 * dynamic cost calculation, and movement execution for intelligent navigation.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { DStarLiteCore } from './dstar-lite-core';
import { NavigationGraph } from './navigation-graph';
import { DynamicCostCalculator } from './cost-calculator';
import {
  PathPlanningRequest,
  PathPlanningResult,
  PathUpdateResult,
  NavigationStep,
  WorldChange,
  NavigationConfig,
  NavigationMetrics,
  WorldPosition,
  CostContext,
  EnvironmentalHazard,
  validateNavigationConfig,
  validatePathPlanningRequest,
  validatePathPlanningResult,
  positionToNodeId,
  euclideanDistance,
} from './types';

export interface NavigationSystemEvents {
  'path-planned': [PathPlanningResult];
  'path-updated': [PathUpdateResult];
  'navigation-step': [NavigationStep];
  'obstacle-detected': [{ position: WorldPosition; severity: number }];
  'goal-reached': [{ goal: WorldPosition; actualPosition: WorldPosition }];
  'navigation-failed': [{ reason: string; lastPosition: WorldPosition }];
  'performance-warning': [{ metric: string; value: number; threshold: number }];
}

/**
 * Comprehensive navigation system with real-time adaptation
 */
export class NavigationSystem extends EventEmitter<NavigationSystemEvents> {
  private dstarLite: DStarLiteCore;
  private navigationGraph: NavigationGraph;
  private costCalculator: DynamicCostCalculator;

  private currentPath: WorldPosition[] = [];
  private currentGoal?: WorldPosition;
  private isNavigating = false;
  private lastPosition?: WorldPosition;

  // Performance tracking
  private metrics: NavigationMetrics = {
    pathfinding: {
      planningLatency: { mean: 0, p95: 0, p99: 0 },
      replanFrequency: 0,
      pathOptimality: 1.0,
      successRate: 1.0,
    },
    execution: {
      movementAccuracy: 1.0,
      obstacleAvoidanceCount: 0,
      replansPerPath: 0,
      averagePathLength: 0,
      completionRate: 1.0,
    },
    efficiency: {
      cacheHitRate: 0.8,
      computationTimePerUpdate: 0,
      memoryUsage: 0,
      graphUpdateLatency: 0,
    },
  };

  private replanCount = 0;
  private pathCompletions = 0;
  private pathFailures = 0;
  private latencyHistory: number[] = [];

  constructor(private config: NavigationConfig) {
    super();

    validateNavigationConfig(config);

    // Initialize components
    this.navigationGraph = new NavigationGraph(config);
    this.costCalculator = new DynamicCostCalculator(config);

    // Initialize D* Lite with graph interface
    this.dstarLite = new DStarLiteCore(
      config,
      (nodeId: string) => this.navigationGraph.getNeighbors(nodeId),
      (from: string, to: string) =>
        this.navigationGraph.calculateEdgeCost(
          from,
          to,
          this.createCostContext()
        )
    );

    this.setupEventHandlers();

    // Start periodic maintenance
    setInterval(() => this.performMaintenance(), 10000); // 10 seconds
  }

  /**
   * Plan path from start to goal
   */
  async planPath(request: PathPlanningRequest): Promise<PathPlanningResult> {
    const startTime = Date.now();

    try {
      validatePathPlanningRequest(request);

      // Project world positions to graph
      const startProjection = this.navigationGraph.worldToGraph(request.start);
      const goalProjection = this.navigationGraph.worldToGraph(request.goal);

      if (!startProjection || !goalProjection) {
        const result: PathPlanningResult = {
          success: false,
          path: [],
          totalCost: Infinity,
          planningTime: Date.now() - startTime,
          nodesExpanded: 0,
          reason: 'Start or goal position not accessible',
        };

        this.emit('path-planned', result);
        return validatePathPlanningResult(result);
      }

      // Update current goal
      this.currentGoal = request.goal;

      // Plan path using D* Lite
      const dstarResult = this.dstarLite.initializePath(
        startProjection.nodeId
          ? this.navigationGraph.graphToWorld(startProjection.nodeId)!
          : request.start,
        goalProjection.nodeId
          ? this.navigationGraph.graphToWorld(goalProjection.nodeId)!
          : request.goal,
        this.navigationGraph.getAllNodes().reduce((map, node) => {
          map.set(node.id, node);
          return map;
        }, new Map())
      );

      // Update metrics
      const planningTime = Date.now() - startTime;
      this.updatePlanningMetrics(planningTime, dstarResult.success);

      if (dstarResult.success) {
        this.currentPath = dstarResult.path;
        this.isNavigating = true;
        this.replanCount = 0;

        // Calculate path optimality
        const directDistance = euclideanDistance(request.start, request.goal);
        const pathLength = this.calculatePathLength(dstarResult.path);
        const optimality =
          directDistance > 0 ? directDistance / pathLength : 1.0;

        const result: PathPlanningResult = {
          ...dstarResult,
          metadata: {
            ...dstarResult.metadata,
            optimality,
          },
        };

        this.emit('path-planned', result);
        return validatePathPlanningResult(result);
      } else {
        this.pathFailures++;
        const result = dstarResult;
        this.emit('path-planned', result);
        return validatePathPlanningResult(result);
      }
    } catch (error) {
      const result: PathPlanningResult = {
        success: false,
        path: [],
        totalCost: Infinity,
        planningTime: Date.now() - startTime,
        nodesExpanded: 0,
        reason: `Planning error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };

      this.emit('path-planned', result);
      return validatePathPlanningResult(result);
    }
  }

  /**
   * Update navigation when world changes
   */
  updateWorld(changes: WorldChange[]): PathUpdateResult {
    const startTime = Date.now();

    try {
      // Filter navigation-relevant changes
      const relevantChanges = changes.filter(
        (change) => change.affectsNavigation
      );

      if (relevantChanges.length === 0) {
        return {
          success: true,
          updatedPath: this.currentPath,
          changesProcessed: 0,
          replanTime: 0,
          affectedNodes: [],
        };
      }

      // Update graph structure
      const blockChanges = relevantChanges
        .filter((change) => change.changeType.includes('block'))
        .map((change) => ({
          position: change.position,
          oldBlockType: '',
          newBlockType: change.blockType || 'air',
          walkable: change.changeType === 'block_removed',
          hazardous: false,
          cost: 1,
        }));

      if (blockChanges.length > 0) {
        this.navigationGraph.updateGraph(blockChanges);
      }

      // Update hazards
      const hazardChanges = relevantChanges.filter((change) =>
        change.changeType.includes('hazard')
      );

      if (hazardChanges.length > 0) {
        const hazards = hazardChanges
          .filter((change) => change.changeType === 'hazard_added')
          .map((change) => ({
            type: 'unknown' as const,
            position: change.position,
            radius: 3,
            severity: change.severity === 'high' ? 0.8 : 0.4,
            costMultiplier: 5,
          }));

        this.costCalculator.updateHazards(hazards);
      }

      // Update D* Lite path
      const updateResult = this.dstarLite.updatePath(relevantChanges);

      if (updateResult.success) {
        this.currentPath = updateResult.updatedPath;
        this.replanCount++;
      }

      // Update metrics
      this.updateReplanMetrics(Date.now() - startTime, updateResult.success);

      this.emit('path-updated', updateResult);
      return updateResult;
    } catch (error) {
      const result: PathUpdateResult = {
        success: false,
        updatedPath: [],
        changesProcessed: 0,
        replanTime: Date.now() - startTime,
        affectedNodes: [],
        reason: `Update error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };

      this.emit('path-updated', result);
      return result;
    }
  }

  /**
   * Get next navigation step
   */
  getNextStep(currentPosition: WorldPosition): NavigationStep | null {
    if (!this.isNavigating || this.currentPath.length === 0) {
      return null;
    }

    try {
      this.lastPosition = currentPosition;

      // Check if goal reached
      if (this.currentGoal) {
        const distanceToGoal = euclideanDistance(
          currentPosition,
          this.currentGoal
        );
        if (distanceToGoal < 1.0) {
          this.handleGoalReached(currentPosition);
          return null;
        }
      }

      // Get step from D* Lite
      const step = this.dstarLite.getNextStep(currentPosition);

      if (step) {
        // Validate step safety
        const isSafe = this.validateStepSafety(currentPosition, step.position);
        if (!isSafe) {
          // Trigger replan for obstacle
          this.handleObstacleDetected(step.position);
          return null;
        }

        this.emit('navigation-step', step);
        return step;
      }

      return null;
    } catch (error) {
      this.handleNavigationFailure(
        `Step generation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }
  }

  /**
   * Stop current navigation
   */
  stopNavigation(): void {
    this.isNavigating = false;
    this.currentPath = [];
    this.currentGoal = undefined;
    this.replanCount = 0;
  }

  /**
   * Get current navigation status
   */
  getNavigationStatus(): {
    isNavigating: boolean;
    currentGoal?: WorldPosition;
    pathLength: number;
    replanCount: number;
    progressPercent: number;
  } {
    let progressPercent = 0;

    if (
      this.isNavigating &&
      this.currentGoal &&
      this.lastPosition &&
      this.currentPath.length > 0
    ) {
      const totalDistance = euclideanDistance(
        this.currentPath[0],
        this.currentGoal
      );
      const remainingDistance = euclideanDistance(
        this.lastPosition,
        this.currentGoal
      );
      progressPercent =
        totalDistance > 0
          ? ((totalDistance - remainingDistance) / totalDistance) * 100
          : 0;
    }

    return {
      isNavigating: this.isNavigating,
      currentGoal: this.currentGoal,
      pathLength: this.currentPath.length,
      replanCount: this.replanCount,
      progressPercent: Math.max(0, Math.min(100, progressPercent)),
    };
  }

  /**
   * Get current navigation metrics
   */
  getMetrics(): NavigationMetrics {
    // Update real-time metrics
    this.updateEfficiencyMetrics();
    return { ...this.metrics };
  }

  /**
   * Build navigation graph for world region
   */
  buildGraph(worldRegion: {
    bounds: {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      minZ: number;
      maxZ: number;
    };
    isWalkable: (pos: WorldPosition) => boolean;
    getBlockType: (pos: WorldPosition) => string;
    isHazardous: (pos: WorldPosition) => boolean;
  }): { success: boolean; nodes: number } {
    return this.navigationGraph.buildGraph(worldRegion);
  }

  /**
   * Add environmental hazards
   */
  addHazards(hazards: EnvironmentalHazard[]): void {
    this.costCalculator.updateHazards(hazards);
  }

  /**
   * Get navigation statistics
   */
  getStatistics(): {
    graph: ReturnType<NavigationGraph['getStatistics']>;
    dstar: ReturnType<DStarLiteCore['getStatistics']>;
    costs: ReturnType<DynamicCostCalculator['getStatistics']>;
    navigation: typeof this.metrics;
  } {
    return {
      graph: this.navigationGraph.getStatistics(),
      dstar: this.dstarLite.getStatistics(),
      costs: this.costCalculator.getStatistics(),
      navigation: this.getMetrics(),
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopNavigation();
    this.navigationGraph.clear();
    this.dstarLite.clear();
    this.costCalculator.dispose();
    this.removeAllListeners();
  }

  // ===== PRIVATE METHODS =====

  private setupEventHandlers(): void {
    // Graph events
    this.navigationGraph.on('graph-updated', ({ time }) => {
      this.metrics.efficiency.graphUpdateLatency = time;
    });

    // Cost calculator events
    this.costCalculator.on('hazard-detected', (hazard) => {
      this.emit('obstacle-detected', {
        position: hazard.position,
        severity: hazard.severity,
      });
    });

    this.costCalculator.on(
      'cost-threshold-exceeded',
      ({ position, cost, threshold }) => {
        this.emit('performance-warning', {
          metric: 'movement_cost',
          value: cost,
          threshold,
        });
      }
    );
  }

  private createCostContext(): CostContext {
    return {
      agentPosition: this.lastPosition || { x: 0, y: 64, z: 0 },
      lightLevel: 15,
      timeOfDay: 6000,
      hazards: [],
      mobPositions: [],
      preferences: {
        riskTolerance: 0.3,
        speedPreference: 0.7,
        safetyMargin: 2,
      },
    };
  }

  private validateStepSafety(from: WorldPosition, to: WorldPosition): boolean {
    const context = this.createCostContext();
    const cost = this.costCalculator.calculateCost(from, to, context);

    // Check if cost is reasonable (less than 10x base cost)
    const maxSafeCost = this.config.costCalculation.baseMoveCost * 10;
    return cost.totalCost < maxSafeCost;
  }

  private handleGoalReached(position: WorldPosition): void {
    this.isNavigating = false;
    this.pathCompletions++;

    if (this.currentGoal) {
      this.emit('goal-reached', {
        goal: this.currentGoal,
        actualPosition: position,
      });
    }

    this.currentGoal = undefined;
    this.currentPath = [];
  }

  private handleObstacleDetected(position: WorldPosition): void {
    this.metrics.execution.obstacleAvoidanceCount++;

    this.emit('obstacle-detected', {
      position,
      severity: 0.5,
    });

    // Trigger replan by adding obstacle as world change
    const change: WorldChange = {
      position,
      changeType: 'block_added',
      blockType: 'obstacle',
      timestamp: Date.now(),
      severity: 'medium',
      affectsNavigation: true,
    };

    this.updateWorld([change]);
  }

  private handleNavigationFailure(reason: string): void {
    this.isNavigating = false;
    this.pathFailures++;

    this.emit('navigation-failed', {
      reason,
      lastPosition: this.lastPosition || { x: 0, y: 64, z: 0 },
    });
  }

  private calculatePathLength(path: WorldPosition[]): number {
    if (path.length < 2) return 0;

    let totalLength = 0;
    for (let i = 1; i < path.length; i++) {
      totalLength += euclideanDistance(path[i - 1], path[i]);
    }
    return totalLength;
  }

  private updatePlanningMetrics(latency: number, success: boolean): void {
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > 100) {
      this.latencyHistory = this.latencyHistory.slice(-50);
    }

    // Update latency distribution
    this.metrics.pathfinding.planningLatency.mean =
      this.latencyHistory.reduce((sum, l) => sum + l, 0) /
      this.latencyHistory.length;

    const sortedLatencies = [...this.latencyHistory].sort((a, b) => a - b);
    this.metrics.pathfinding.planningLatency.p95 =
      sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
    this.metrics.pathfinding.planningLatency.p99 =
      sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

    // Update success rate
    const totalAttempts = this.pathCompletions + this.pathFailures;
    this.metrics.pathfinding.successRate =
      totalAttempts > 0 ? this.pathCompletions / totalAttempts : 1.0;
  }

  private updateReplanMetrics(replanTime: number, success: boolean): void {
    this.metrics.efficiency.computationTimePerUpdate = replanTime;
    this.metrics.execution.replansPerPath = this.replanCount;

    // Update replan frequency (replans per minute)
    // This would need time-based tracking in a real implementation
    this.metrics.pathfinding.replanFrequency = this.replanCount;
  }

  private updateEfficiencyMetrics(): void {
    const graphStats = this.navigationGraph.getStatistics();
    const costStats = this.costCalculator.getStatistics();

    this.metrics.efficiency.memoryUsage =
      graphStats.memoryUsage + costStats.memoryUsage;

    // Estimate cache hit rate (simplified)
    this.metrics.efficiency.cacheHitRate = 0.8; // Placeholder
  }

  private performMaintenance(): void {
    // Update average path length
    if (this.currentPath.length > 0) {
      this.metrics.execution.averagePathLength = this.calculatePathLength(
        this.currentPath
      );
    }

    // Update completion rate
    const totalNavigations = this.pathCompletions + this.pathFailures;
    this.metrics.execution.completionRate =
      totalNavigations > 0 ? this.pathCompletions / totalNavigations : 1.0;

    // Check performance warnings
    if (
      this.metrics.pathfinding.planningLatency.mean >
      this.config.dstarLite.maxComputationTime
    ) {
      this.emit('performance-warning', {
        metric: 'planning_latency',
        value: this.metrics.pathfinding.planningLatency.mean,
        threshold: this.config.dstarLite.maxComputationTime,
      });
    }

    if (this.metrics.efficiency.memoryUsage > 100 * 1024 * 1024) {
      // 100MB
      this.emit('performance-warning', {
        metric: 'memory_usage',
        value: this.metrics.efficiency.memoryUsage,
        threshold: 100 * 1024 * 1024,
      });
    }
  }
}
