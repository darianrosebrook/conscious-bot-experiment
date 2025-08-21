/**
 * Visible-Only Sensing System - Main coordination layer
 *
 * Coordinates ray casting, spatial indexing, and confidence tracking to maintain
 * a human-like world model with strict occlusion discipline.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
// import { PerformanceTracker } from '@conscious-bot/core';

// Mock PerformanceTracker for standalone testing
class PerformanceTracker {
  startTracking(operation: any, context: any) {
    return { id: 'mock', operation, context };
  }

  recordCompletion(session: any, result: any) {
    return {};
  }

  detectAnomalies() {
    return [];
  }

  dispose() {}
}
import { RaycastEngine } from './raycast-engine';
import { ObservedResourcesIndex } from './observed-resources-index';

import {
  Vec3,
  Orientation,
  SweepResult,
  SensingConfig,
  SpatialQuery,
  SensingPerformance,
  Observation,
  IVisibleSensing,
  validateSensingConfig,
  validateSweepResult,
} from '../types';

export interface VisibleSensingEvents {
  'sweep-started': [{ timestamp: number; config: SensingConfig }];
  'sweep-completed': [SweepResult];
  'resource-discovered': [Observation];
  'resource-lost': [Observation];
  'performance-warning': [{ issue: string; details: any }];
  'config-updated': [SensingConfig];
}

/**
 * Main visible-only sensing system with performance monitoring
 */
export class VisibleSensing
  extends EventEmitter<VisibleSensingEvents>
  implements IVisibleSensing
{
  private raycastEngine: RaycastEngine;
  private observedIndex: ObservedResourcesIndex;
  private performanceTracker: PerformanceTracker;

  private continuousSensingInterval?: NodeJS.Timeout;
  private lastSweepTime = 0;
  private sweepCount = 0;
  private totalRaysCast = 0;
  private budgetViolations = 0;
  private adaptiveThrottles = 0;

  // Performance metrics tracking
  private sweepDurations: number[] = [];
  private qualityMetrics = {
    discoveredResources: 0,
    lostResources: 0,
    falsePositives: 0,
  };

  constructor(
    private config: SensingConfig,
    private getCurrentPose: () => { position: Vec3; orientation: Orientation },
    bot?: any // Mineflayer bot for production use
  ) {
    super();

    validateSensingConfig(config);

    // Initialize components
    this.raycastEngine = new RaycastEngine(config, bot);
    this.observedIndex = new ObservedResourcesIndex({
      maxChunks: 1000,
      confidenceDecayRate: config.confidenceDecayRate,
      minConfidence: config.minConfidence,
      cleanupIntervalMs: 60000,
    });

    this.performanceTracker = new PerformanceTracker();

    this.setupEventHandlers();
  }

  /**
   * Perform a sensing sweep from current bot position
   */
  async performSweep(): Promise<SweepResult> {
    const startTime = Date.now();
    const pose = this.getCurrentPose();

    this.emit('sweep-started', { timestamp: startTime, config: this.config });

    // Start performance tracking
    const session = this.performanceTracker.startTracking(
      {
        id: `sweep_${this.sweepCount}`,
        type: 'world_interaction' as any,
        name: 'visible_sensing_sweep',
        module: 'world',
        priority: 0.7,
        expectedDuration: this.config.tickBudgetMs,
      },
      'routine' as any
    );

    try {
      // Perform the actual sweep
      const result = await this.raycastEngine.sweep(
        pose.position,
        pose.orientation,
        this.config
      );

      validateSweepResult(result);

      // Update spatial index with new observations
      for (const observation of result.observations) {
        const existing = this.observedIndex.findNearest(
          observation.pos,
          [observation.blockId],
          1 // Very close match
        );

        if (!existing) {
          this.emit('resource-discovered', observation);
          this.qualityMetrics.discoveredResources++;
        }

        this.observedIndex.upsert(observation);
      }

      // Update performance metrics
      this.updatePerformanceMetrics(result);

      // Complete performance tracking
      this.performanceTracker.recordCompletion(session, {
        success: true,
        duration: result.duration,
        resourcesUsed: {
          cpu: (result.duration / this.config.tickBudgetMs) * 100,
          memory: result.raysCast * 50, // Approximate memory per ray
        },
      });

      this.emit('sweep-completed', result);
      return result;
    } catch (error) {
      // Handle sweep failure
      this.performanceTracker.recordCompletion(session, {
        success: false,
        duration: Date.now() - startTime,
        resourcesUsed: { cpu: 100, memory: 1024 },
        errorCode: 'SWEEP_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Get all observations from the index
   */
  getObservations(query?: SpatialQuery): Observation[] {
    if (query) {
      return this.observedIndex.lookupNear(query);
    }

    // Get all observations by searching a very large area
    const pose = this.getCurrentPose();
    const allQuery: SpatialQuery = {
      center: pose.position,
      radius: 1000, // Large radius to get everything
    };

    return this.observedIndex.lookupNear(allQuery);
  }

  /**
   * Find nearest resource of given types
   */
  findNearestResource(
    blockTypes: string[],
    maxDistance: number = this.config.maxDistance
  ): Observation | null {
    const pose = this.getCurrentPose();
    return this.observedIndex.findNearest(
      pose.position,
      blockTypes,
      maxDistance
    );
  }

  /**
   * Update sensing configuration
   */
  updateConfig(newConfig: Partial<SensingConfig>): void {
    const updatedConfig = { ...this.config, ...newConfig };
    validateSensingConfig(updatedConfig);

    this.config = updatedConfig;

    // Update engine configurations
    this.raycastEngine.setTransparentBlocks(updatedConfig.transparentBlocks);
    this.raycastEngine.setTargetBlocks(updatedConfig.targetBlocks);

    this.emit('config-updated', updatedConfig);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): SensingPerformance {
    const indexStats = this.observedIndex.getStats();

    // Calculate sweep performance
    const avgDuration =
      this.sweepDurations.length > 0
        ? this.sweepDurations.reduce((sum, d) => sum + d, 0) /
          this.sweepDurations.length
        : 0;

    const p95Duration =
      this.sweepDurations.length > 0
        ? this.calculatePercentile(this.sweepDurations, 95)
        : 0;

    // Calculate quality metrics
    const totalResources =
      this.qualityMetrics.discoveredResources +
      this.qualityMetrics.lostResources;
    const visibleRecall =
      totalResources > 0
        ? this.qualityMetrics.discoveredResources / totalResources
        : 1.0;

    const falseOcclusionRate =
      this.totalRaysCast > 0
        ? this.qualityMetrics.falsePositives / this.totalRaysCast
        : 0;

    return {
      sweepsCompleted: this.sweepCount,
      totalRaysCast: this.totalRaysCast,
      averageSweepDuration: avgDuration,
      p95SweepDuration: p95Duration,
      budgetViolations: this.budgetViolations,
      adaptiveThrottles: this.adaptiveThrottles,

      quality: {
        visibleRecall,
        falseOcclusionRate,
        timeToFirstObservation: avgDuration, // Approximation
      },

      index: {
        stalenessRate: this.calculateStalenessRate(),
        resourceToUseLatency: avgDuration, // Approximation
        evictionsPerMinute: this.calculateEvictionRate(),
      },
    };
  }

  /**
   * Start continuous sensing
   */
  startContinuousSensing(intervalMs: number): void {
    this.stopContinuousSensing(); // Stop any existing interval

    this.continuousSensingInterval = setInterval(async () => {
      try {
        await this.performSweep();
      } catch (error) {
        this.emit('performance-warning', {
          issue: 'continuous_sensing_failed',
          details: {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }, intervalMs);
  }

  /**
   * Stop continuous sensing
   */
  stopContinuousSensing(): void {
    if (this.continuousSensingInterval) {
      clearInterval(this.continuousSensingInterval);
      this.continuousSensingInterval = undefined;
    }
  }

  /**
   * Perform maintenance tasks (decay confidence, cleanup)
   */
  performMaintenance(): void {
    const now = Date.now();

    // Decay observation confidence
    const decayResult = this.observedIndex.decay(now);

    if (decayResult.expired > 0) {
      this.qualityMetrics.lostResources += decayResult.expired;
    }

    // Clean up old performance data
    if (this.sweepDurations.length > 1000) {
      this.sweepDurations = this.sweepDurations.slice(-500);
    }

    // Detect performance anomalies
    this.performanceTracker.detectAnomalies();
  }

  /**
   * Get spatial index for direct access (for testing/debugging)
   */
  getIndex(): ObservedResourcesIndex {
    return this.observedIndex;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopContinuousSensing();
    this.observedIndex.dispose();
    this.performanceTracker.dispose();
    this.removeAllListeners();
  }

  // ===== PRIVATE METHODS =====

  private setupEventHandlers(): void {
    // Handle raycast engine events
    this.raycastEngine.on('performance-warning', (warning) => {
      if (warning.metric === 'sweep_duration') {
        this.budgetViolations++;
        this.emit('performance-warning', {
          issue: 'budget_violation',
          details: warning,
        });
      }
    });

    // Handle index events
    this.observedIndex.on('observation-expired', (observation) => {
      this.emit('resource-lost', observation);
      this.qualityMetrics.lostResources++;
    });
  }

  private updatePerformanceMetrics(result: SweepResult): void {
    this.sweepCount++;
    this.totalRaysCast += result.raysCast;
    this.sweepDurations.push(result.duration);
    this.lastSweepTime = result.timestamp;

    // Check for budget violations
    if (result.duration > this.config.tickBudgetMs) {
      this.budgetViolations++;
    }

    // Adaptive throttling logic
    if (this.budgetViolations > 0 && this.sweepCount % 10 === 0) {
      this.adaptiveThrottles++;

      // Reduce resolution to stay within budget
      const newResolution = this.config.angularResolution * 1.2;
      this.updateConfig({ angularResolution: Math.min(newResolution, 5.0) });
    }
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  private calculateStalenessRate(): number {
    const stats = this.observedIndex.getStats();
    const now = Date.now();
    const maxAge = 300000; // 5 minutes

    if (stats.totalObservations === 0) return 0;

    // This is a simplified calculation - in practice would examine actual ages
    const avgAge = (now - stats.oldestObservation) / stats.totalObservations;
    return Math.min(1, avgAge / maxAge);
  }

  private calculateEvictionRate(): number {
    // This would be tracked more precisely in a production system
    return this.qualityMetrics.lostResources / Math.max(1, this.sweepCount);
  }
}
