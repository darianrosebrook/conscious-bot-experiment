/**
 * Cognitive State Tracker
 *
 * Tracks active conversations, recent operations, and cognitive state history.
 * Uses CognitiveMetricsTracker for aggregated counters and cognitive load
 * calculators for system metrics.
 *
 * @author @darianrosebrook
 */

import { CognitiveMetricsTracker } from './cognitive-metrics-tracker';
import {
  calculateCognitiveLoad,
  calculateAttentionLevel,
  calculateCreativityLevel,
  getActiveProcessCount,
} from './server-utils/cognitive-load-calculators';

export class CognitiveStateTracker {
  private activeConversations = new Set<string>();
  private recentOperations: Array<{
    type: string;
    timestamp: number;
    duration?: number;
    success: boolean;
  }> = [];
  private cognitiveStates: Array<{
    timestamp: number;
    cognitiveLoad: number;
    attentionLevel: number;
    creativityLevel: number;
    activeProcesses: number;
  }> = [];

  constructor(private metricsTracker: CognitiveMetricsTracker) {}

  // Conversation tracking
  startConversation(conversationId: string): void {
    this.activeConversations.add(conversationId);
    this.metricsTracker.incrementConversationCount();
    this.recordOperation('conversation_start', true);
  }

  endConversation(conversationId: string): void {
    this.activeConversations.delete(conversationId);
    this.recordOperation('conversation_end', true);
  }

  getActiveConversationCount(): number {
    return this.activeConversations.size;
  }

  // Operation tracking
  recordOperation(type: string, success: boolean, startTime?: number): void {
    const operation = {
      type,
      timestamp: Date.now(),
      duration: startTime ? Date.now() - startTime : undefined,
      success,
    };

    this.recentOperations.push(operation);

    // Keep only last 100 operations
    if (this.recentOperations.length > 100) {
      this.recentOperations.shift();
    }

    // Update specific metrics based on operation type
    switch (type) {
      case 'optimization':
        this.metricsTracker.incrementOptimizationCount();
        break;
      case 'solution_generation':
        this.metricsTracker.incrementSolutionsGenerated();
        break;
      case 'violation_blocked':
        this.metricsTracker.incrementViolationsBlocked();
        break;
      case 'intrusion_handled':
        this.metricsTracker.incrementIntrusionsHandled();
        break;
    }
  }

  // Cognitive state tracking
  recordCognitiveState(getNetworkRequestCount: () => number): void {
    const state = {
      timestamp: Date.now(),
      cognitiveLoad: calculateCognitiveLoad(getNetworkRequestCount),
      attentionLevel: calculateAttentionLevel(),
      creativityLevel: calculateCreativityLevel(),
      activeProcesses: getActiveProcessCount(),
    };

    this.cognitiveStates.push(state);

    // Keep only last 1000 states (about 16 minutes at 1 per second)
    if (this.cognitiveStates.length > 1000) {
      this.cognitiveStates.shift();
    }
  }

  // Analytics and insights
  getOperationStats(timeWindow: number = 300000): {
    // Default 5 minutes
    total: number;
    successful: number;
    failed: number;
    byType: Record<string, number>;
    averageDuration: number;
  } {
    const cutoff = Date.now() - timeWindow;
    const recentOps = this.recentOperations.filter(
      (op) => op.timestamp > cutoff
    );

    const stats = {
      total: recentOps.length,
      successful: recentOps.filter((op) => op.success).length,
      failed: recentOps.filter((op) => !op.success).length,
      byType: {} as Record<string, number>,
      averageDuration: 0,
    };

    // Group by type
    recentOps.forEach((op) => {
      stats.byType[op.type] = (stats.byType[op.type] || 0) + 1;
    });

    // Calculate average duration
    const opsWithDuration = recentOps.filter((op) => op.duration !== undefined);
    if (opsWithDuration.length > 0) {
      stats.averageDuration =
        opsWithDuration.reduce((sum, op) => sum + (op.duration || 0), 0) /
        opsWithDuration.length;
    }

    return stats;
  }

  getCognitiveStateHistory(timeWindow: number = 300000): Array<{
    timestamp: number;
    cognitiveLoad: number;
    attentionLevel: number;
    creativityLevel: number;
    activeProcesses: number;
  }> {
    const cutoff = Date.now() - timeWindow;
    return this.cognitiveStates.filter((state) => state.timestamp > cutoff);
  }

  getHealthMetrics(): {
    averageCognitiveLoad: number;
    averageAttentionLevel: number;
    averageCreativityLevel: number;
    operationSuccessRate: number;
    systemStability: number;
  } {
    const recentStates = this.getCognitiveStateHistory();
    const recentStats = this.getOperationStats();

    const averageCognitiveLoad =
      recentStates.length > 0
        ? recentStates.reduce((sum, state) => sum + state.cognitiveLoad, 0) /
          recentStates.length
        : 0;

    const averageAttentionLevel =
      recentStates.length > 0
        ? recentStates.reduce((sum, state) => sum + state.attentionLevel, 0) /
          recentStates.length
        : 0;

    const averageCreativityLevel =
      recentStates.length > 0
        ? recentStates.reduce((sum, state) => sum + state.creativityLevel, 0) /
          recentStates.length
        : 0;

    const operationSuccessRate =
      recentStats.total > 0 ? recentStats.successful / recentStats.total : 1;

    // System stability based on variance in cognitive states
    const cognitiveLoadVariance =
      recentStates.length > 1
        ? this.calculateVariance(recentStates.map((s) => s.cognitiveLoad))
        : 0;

    const systemStability = Math.max(0, 1 - cognitiveLoadVariance);

    return {
      averageCognitiveLoad,
      averageAttentionLevel,
      averageCreativityLevel,
      operationSuccessRate,
      systemStability,
    };
  }

  private calculateVariance(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  reset(): void {
    this.activeConversations.clear();
    this.recentOperations = [];
    this.cognitiveStates = [];
  }
}
