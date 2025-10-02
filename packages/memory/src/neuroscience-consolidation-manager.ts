/**
 * Neuroscience Consolidation Manager
 *
 * High-level orchestrator for neuroscience-inspired memory consolidation processes.
 * Coordinates Sharp Wave Ripples, cognitive map tracking, and memory decay to create
 * a comprehensive memory system that mimics biological learning and consolidation.
 *
 * This manager handles the overall consolidation strategy and provides insights
 * into memory organization and learning progression.
 *
 * @author @darianrosebrook
 */

import { VectorDatabase, MemoryChunk } from './vector-database';
import { EmbeddingService } from './embedding-service';
import { SharpWaveRippleManager } from './sharp-wave-ripple-manager';
import { CognitiveMapTracker } from './cognitive-map-tracker';
import { MemoryDecayManager } from './memory-decay-manager';
import { z } from 'zod';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface NeuroscienceConsolidationConfig {
  /** Enable neuroscience consolidation system */
  enabled: boolean;

  /** How often to run full consolidation cycles (ms) */
  consolidationCycleInterval: number;

  /** Minimum system activity threshold for consolidation */
  activityThreshold: number;

  /** Enable adaptive consolidation based on system load */
  adaptiveConsolidation: boolean;

  /** Dependencies */
  vectorDb: VectorDatabase;
  embeddingService: EmbeddingService;
  sharpWaveRippleManager: SharpWaveRippleManager;
  cognitiveMapTracker: CognitiveMapTracker;
  memoryDecayManager: MemoryDecayManager;
}

export interface ConsolidationCycleResult {
  timestamp: number;
  duration: number;
  phases: {
    swrConsolidation: {
      consolidated: number;
      totalTime: number;
      averageStrength: number;
    };
    cognitiveMapUpdate: {
      clusters: number;
      memories: number;
      learningProgress: number;
    };
    memoryDecay: {
      evaluated: number;
      retained: number;
      consolidated: number;
      archived: number;
      deleted: number;
    };
  };
  overall: {
    totalConsolidated: number;
    totalEvaluated: number;
    efficiency: number;
    cognitiveHealth: 'excellent' | 'good' | 'fair' | 'poor';
  };
}

export interface ConsolidationInsights {
  memoryHealth: {
    consolidationEfficiency: number;
    cognitiveOrganization: number;
    learningProgression: number;
    memoryStability: number;
    overallScore: number;
  };
  recommendations: Array<{
    type: 'optimization' | 'warning' | 'critical';
    message: string;
    action: string;
  }>;
  patterns: {
    dominantMemoryTypes: Array<{
      type: string;
      count: number;
      percentage: number;
    }>;
    clusterDistribution: Array<{
      clusterType: string;
      size: number;
      averageImportance: number;
    }>;
    learningTrajectories: Array<{
      memoryId: string;
      progress: number;
      strength: number;
      trend: 'improving' | 'stable' | 'declining';
    }>;
  };
}

export interface ConsolidationStatus {
  isRunning: boolean;
  lastCycle?: ConsolidationCycleResult;
  nextCycleIn: number;
  systemActivity: number;
  consolidationHealth: 'healthy' | 'degraded' | 'unhealthy';
  activeComponents: {
    sharpWaveRipples: boolean;
    cognitiveMapping: boolean;
    memoryDecay: boolean;
  };
}

// ============================================================================
// Neuroscience Consolidation Manager
// ============================================================================

/**
 * Orchestrates neuroscience-inspired memory consolidation across all components
 */
export class NeuroscienceConsolidationManager {
  private config: NeuroscienceConsolidationConfig;
  private isRunning = false;
  private lastCycle: ConsolidationCycleResult | null = null;
  private consolidationHistory: ConsolidationCycleResult[] = [];

  constructor(config: NeuroscienceConsolidationConfig) {
    this.config = config;

    if (config.enabled) {
      this.startConsolidationScheduler();
    }
  }

  /**
   * Run a complete consolidation cycle
   */
  async runConsolidationCycle(): Promise<ConsolidationCycleResult> {
    if (!this.config.enabled) {
      throw new Error('Neuroscience consolidation is disabled');
    }

    if (this.isRunning) {
      throw new Error('Consolidation cycle already in progress');
    }

    this.isRunning = true;
    const startTime = Date.now();

    console.log('🧠 Starting neuroscience-inspired consolidation cycle...');

    try {
      // Phase 1: Sharp Wave Ripple consolidation
      console.log('🌊 Phase 1: Sharp Wave Ripple consolidation');
      const swrResult =
        await this.config.sharpWaveRippleManager.forceConsolidation();

      // Phase 2: Cognitive map update
      console.log('🗺️ Phase 2: Cognitive map tracking');
      const cognitiveSnapshot =
        await this.config.cognitiveMapTracker.updateMap();

      // Phase 3: Memory decay evaluation
      console.log('🧹 Phase 3: Memory decay evaluation');
      const { decayResults, cleanupRecommendations } =
        await this.config.memoryDecayManager.evaluateMemories();

      // Calculate overall results
      const duration = Date.now() - startTime;
      const cognitiveHealth = this.assessCognitiveHealth(
        swrResult,
        cognitiveSnapshot,
        decayResults
      );

      const result: ConsolidationCycleResult = {
        timestamp: startTime,
        duration,
        phases: {
          swrConsolidation: {
            consolidated: swrResult.consolidatedMemories || 0,
            totalTime: swrResult.totalReplayTime || 0,
            averageStrength: swrResult.averageStrength || 0,
          },
          cognitiveMapUpdate: {
            clusters: cognitiveSnapshot.clusters.length,
            memories: cognitiveSnapshot.manifold.length,
            learningProgress:
              cognitiveSnapshot.learningProgression.averageLearningProgress,
          },
          memoryDecay: {
            evaluated: decayResults.length,
            retained: cleanupRecommendations.retainedMemories,
            consolidated: cleanupRecommendations.consolidatedMemories,
            archived: cleanupRecommendations.archivedMemories,
            deleted: cleanupRecommendations.deletedMemories,
          },
        },
        overall: {
          totalConsolidated:
            (swrResult.consolidatedMemories || 0) +
            cleanupRecommendations.consolidatedMemories,
          totalEvaluated: decayResults.length,
          efficiency: this.calculateEfficiency(swrResult, decayResults),
          cognitiveHealth,
        },
      };

      this.lastCycle = result;
      this.consolidationHistory.push(result);

      // Keep only last 50 cycles
      if (this.consolidationHistory.length > 50) {
        this.consolidationHistory = this.consolidationHistory.slice(-50);
      }

      console.log(
        `✅ Consolidation cycle completed in ${duration}ms with ${cognitiveHealth} cognitive health`
      );

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get consolidation insights and recommendations
   */
  async getConsolidationInsights(): Promise<ConsolidationInsights> {
    const swrStats = this.config.sharpWaveRippleManager.getStatistics();
    const cognitiveStats = this.config.cognitiveMapTracker.getStatistics();
    const recentCycles = this.consolidationHistory.slice(-5);

    // Calculate memory health scores
    const consolidationEfficiency = swrStats.consolidationEfficiency || 0;
    const cognitiveOrganization = cognitiveStats.clusterStability || 0;
    const learningProgression = cognitiveStats.learningProgressRate || 0;
    const memoryStability =
      recentCycles.length > 0
        ? recentCycles.reduce(
            (sum, c) => sum + (c.overall.efficiency || 0),
            0
          ) / recentCycles.length
        : 0;

    const overallScore =
      (consolidationEfficiency +
        cognitiveOrganization +
        learningProgression +
        memoryStability) /
      4;

    // Generate recommendations
    const recommendations: ConsolidationInsights['recommendations'] = [];

    if (consolidationEfficiency < 0.5) {
      recommendations.push({
        type: 'warning',
        message: 'Low consolidation efficiency detected',
        action:
          'Consider increasing SWR tagging threshold or reducing consolidation interval',
      });
    }

    if (cognitiveOrganization < 0.6) {
      recommendations.push({
        type: 'optimization',
        message: 'Cognitive organization could be improved',
        action:
          'Adjust clustering threshold or increase cognitive map update frequency',
      });
    }

    if (learningProgression < 0) {
      recommendations.push({
        type: 'critical',
        message: 'Learning progression is declining',
        action: 'Review memory decay parameters and importance calculation',
      });
    }

    if (swrStats.competitionWinRate < 0.2) {
      recommendations.push({
        type: 'warning',
        message: 'Very few memories winning consolidation competition',
        action:
          'Lower competition threshold or increase consolidation frequency',
      });
    }

    // Analyze patterns
    const cognitiveSnapshot = await this.config.cognitiveMapTracker.updateMap();
    const dominantMemoryTypes = this.analyzeMemoryTypes(cognitiveSnapshot);
    const clusterDistribution =
      this.analyzeClusterDistribution(cognitiveSnapshot);
    const learningTrajectories = this.analyzeLearningTrajectories();

    return {
      memoryHealth: {
        consolidationEfficiency,
        cognitiveOrganization,
        learningProgression,
        memoryStability,
        overallScore,
      },
      recommendations,
      patterns: {
        dominantMemoryTypes,
        clusterDistribution,
        learningTrajectories,
      },
    };
  }

  /**
   * Get current consolidation status
   */
  async getStatus(): Promise<ConsolidationStatus> {
    const now = Date.now();
    const timeSinceLastCycle = this.lastCycle
      ? now - this.lastCycle.timestamp
      : this.config.consolidationCycleInterval;

    return {
      isRunning: this.isRunning,
      lastCycle: this.lastCycle || undefined,
      nextCycleIn: Math.max(
        0,
        this.config.consolidationCycleInterval - timeSinceLastCycle
      ),
      systemActivity: this.calculateSystemActivity(),
      consolidationHealth: await this.assessOverallHealth(),
      activeComponents: {
        sharpWaveRipples:
          this.config.sharpWaveRippleManager.getStatistics().totalTagged > 0,
        cognitiveMapping:
          this.config.cognitiveMapTracker.getStatistics().totalMemories > 0,
        memoryDecay: true, // Memory decay manager is always available
      },
    };
  }

  /**
   * Force immediate consolidation cycle
   */
  async forceConsolidation(): Promise<ConsolidationCycleResult> {
    return await this.runConsolidationCycle();
  }

  /**
   * Get consolidation cycle history
   */
  getConsolidationHistory(limit: number = 10): ConsolidationCycleResult[] {
    return this.consolidationHistory.slice(-limit);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Assess cognitive health based on consolidation results
   */
  private assessCognitiveHealth(
    swrResult: any,
    cognitiveSnapshot: any,
    decayResults: any[]
  ): ConsolidationCycleResult['overall']['cognitiveHealth'] {
    const swrEfficiency =
      (swrResult.consolidatedMemories || 0) / Math.max(1, decayResults.length);
    const cognitiveOrganization = cognitiveSnapshot.clusters.length > 0 ? 1 : 0;
    const memoryStability =
      decayResults.filter((r: any) => r.action === 'retain').length /
      Math.max(1, decayResults.length);

    const overallScore =
      (swrEfficiency + cognitiveOrganization + memoryStability) / 3;

    if (overallScore >= 0.8) return 'excellent';
    if (overallScore >= 0.6) return 'good';
    if (overallScore >= 0.4) return 'fair';
    return 'poor';
  }

  /**
   * Calculate overall efficiency of consolidation cycle
   */
  private calculateEfficiency(swrResult: any, decayResults: any[]): number {
    const swrEfficiency =
      (swrResult.consolidatedMemories || 0) / Math.max(1, decayResults.length);
    const retentionRate =
      decayResults.filter((r: any) => r.action === 'retain').length /
      Math.max(1, decayResults.length);

    return (swrEfficiency + retentionRate) / 2;
  }

  /**
   * Analyze memory type distribution
   */
  private analyzeMemoryTypes(
    cognitiveSnapshot: any
  ): Array<{ type: string; count: number; percentage: number }> {
    const typeCounts: Record<string, number> = {};

    for (const point of cognitiveSnapshot.manifold) {
      typeCounts[point.metadata.type] =
        (typeCounts[point.metadata.type] || 0) + 1;
    }

    const total = cognitiveSnapshot.manifold.length;
    return Object.entries(typeCounts)
      .map(([type, count]) => ({
        type,
        count,
        percentage: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Analyze cluster distribution
   */
  private analyzeClusterDistribution(
    cognitiveSnapshot: any
  ): Array<{ clusterType: string; size: number; averageImportance: number }> {
    const clusterStats: Record<
      string,
      { size: number; totalImportance: number }
    > = {};

    for (const cluster of cognitiveSnapshot.clusters) {
      if (!clusterStats[cluster.clusterType]) {
        clusterStats[cluster.clusterType] = { size: 0, totalImportance: 0 };
      }

      clusterStats[cluster.clusterType].size += cluster.memories.length;
      clusterStats[cluster.clusterType].totalImportance +=
        cluster.averageImportance;
    }

    return Object.entries(clusterStats).map(([clusterType, stats]) => ({
      clusterType,
      size: stats.size,
      averageImportance: stats.totalImportance / stats.size,
    }));
  }

  /**
   * Analyze learning trajectories
   */
  private analyzeLearningTrajectories(): Array<{
    memoryId: string;
    progress: number;
    strength: number;
    trend: 'improving' | 'stable' | 'declining';
  }> {
    const trajectories: Array<{
      memoryId: string;
      progress: number;
      strength: number;
      trend: 'improving' | 'stable' | 'declining';
    }> = [];

    // Get recent learning trajectories from cognitive map tracker
    // This would need to be implemented in the cognitive map tracker
    // For now, return empty array as placeholder

    return trajectories;
  }

  /**
   * Calculate current system activity level
   */
  private calculateSystemActivity(): number {
    const swrStats = this.config.sharpWaveRippleManager.getStatistics();
    const cognitiveStats = this.config.cognitiveMapTracker.getStatistics();

    // Activity based on recent consolidation and learning activity
    const consolidationActivity = Math.min(
      1.0,
      (swrStats.totalConsolidated || 0) / 100
    );
    const learningActivity = Math.min(
      1.0,
      cognitiveStats.learningProgressRate || 0
    );

    return (consolidationActivity + learningActivity) / 2;
  }

  /**
   * Assess overall consolidation health
   */
  private async assessOverallHealth(): Promise<
    'healthy' | 'degraded' | 'unhealthy'
  > {
    const insights = await this.getConsolidationInsights();

    if (insights.memoryHealth.overallScore < 0.4) {
      return 'unhealthy';
    }

    if (insights.memoryHealth.overallScore < 0.6) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Start consolidation scheduler
   */
  private startConsolidationScheduler(): void {
    setInterval(async () => {
      if (this.config.adaptiveConsolidation) {
        const activity = this.calculateSystemActivity();
        if (activity < this.config.activityThreshold) {
          await this.runConsolidationCycle();
        }
      } else {
        await this.runConsolidationCycle();
      }
    }, this.config.consolidationCycleInterval);
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_NEUROSCIENCE_CONSOLIDATION_CONFIG: Partial<NeuroscienceConsolidationConfig> =
  {
    enabled: true,
    consolidationCycleInterval: 3600000, // 1 hour
    activityThreshold: 0.3, // 30% activity threshold
    adaptiveConsolidation: true,
  };
