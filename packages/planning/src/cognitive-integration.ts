/**
 * Cognitive Integration System
 *
 * Connects planning system with cognitive core to provide proper feedback loops
 * and prevent infinite task loops through self-reflection and goal assessment.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

export interface CognitiveFeedback {
  taskId: string;
  success: boolean;
  reasoning: string;
  alternativeSuggestions: string[];
  emotionalImpact: 'positive' | 'negative' | 'neutral';
  confidence: number;
  timestamp: number;
}

export interface TaskReflection {
  taskId: string;
  originalGoal: string;
  actualOutcome: string;
  lessonsLearned: string[];
  shouldRetry: boolean;
  alternativeApproach?: string;
  emotionalState: string;
  timestamp: number;
}

export interface CognitiveIntegrationConfig {
  reflectionEnabled: boolean;
  maxRetries: number;
  failureThreshold: number;
  successThreshold: number;
  cognitiveEndpoint: string;
  memoryEndpoint: string;
  maxHistorySize: number;
}

const DEFAULT_CONFIG: CognitiveIntegrationConfig = {
  reflectionEnabled: true,
  maxRetries: 3,
  failureThreshold: 0.3,
  successThreshold: 0.7,
  cognitiveEndpoint: 'http://localhost:3003',
  memoryEndpoint: 'http://localhost:3001',
  maxHistorySize: 10,
};

/**
 * Cognitive Integration System
 *
 * Provides feedback loops between planning and cognitive systems
 */
export class CognitiveIntegration extends EventEmitter {
  private config: CognitiveIntegrationConfig;
  private taskHistory: Map<string, any[]> = new Map();
  private failureCounts: Map<string, number> = new Map();
  private successCounts: Map<string, number> = new Map();

  constructor(config: Partial<CognitiveIntegrationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process task completion and provide cognitive feedback
   */
  async processTaskCompletion(
    task: any,
    result: any,
    context: any = {}
  ): Promise<CognitiveFeedback> {
    const taskId = task.id;

    // Record task in history
    if (!this.taskHistory.has(taskId)) {
      this.taskHistory.set(taskId, []);
    }
    const history = this.taskHistory.get(taskId) || [];
    history.push({
      task,
      result,
      context,
      timestamp: Date.now(),
    });

    // Limit history size to prevent memory leaks
    if (history.length > this.config.maxHistorySize) {
      history.splice(0, history.length - this.config.maxHistorySize);
    }

    // Update success/failure counts
    const success = result.success === true && !result.error;
    if (success) {
      this.successCounts.set(taskId, (this.successCounts.get(taskId) || 0) + 1);
    } else {
      this.failureCounts.set(taskId, (this.failureCounts.get(taskId) || 0) + 1);
    }

    // Generate cognitive feedback
    const feedback = await this.generateCognitiveFeedback(
      task,
      result,
      context
    );

    // Emit feedback event
    this.emit('cognitiveFeedback', feedback);

    // Store in memory if available
    await this.storeInMemory(feedback);

    return feedback;
  }

  /**
   * Generate cognitive feedback for a task
   */
  private async generateCognitiveFeedback(
    task: any,
    result: any,
    context: any = {}
  ): Promise<CognitiveFeedback> {
    const success = result.success === true && !result.error;
    const taskHistory = this.taskHistory.get(task.id) || [];
    const failureCount = this.failureCounts.get(task.id) || 0;
    const successCount = this.successCounts.get(task.id) || 0;

    // Analyze task performance
    const performanceAnalysis = this.analyzeTaskPerformance(
      task,
      result,
      taskHistory
    );

    // Generate reasoning
    const reasoning = this.generateReasoning(task, result, performanceAnalysis);

    // Generate alternative suggestions
    const alternatives = this.generateAlternatives(
      task,
      result,
      performanceAnalysis
    );

    // Assess emotional impact
    const emotionalImpact = this.assessEmotionalImpact(
      task,
      result,
      performanceAnalysis
    );

    // Calculate confidence
    const confidence = this.calculateConfidence(
      task,
      result,
      performanceAnalysis
    );

    return {
      taskId: task.id,
      success,
      reasoning,
      alternativeSuggestions: alternatives,
      emotionalImpact,
      confidence,
      timestamp: Date.now(),
    };
  }

  /**
   * Analyze task performance patterns
   */
  private analyzeTaskPerformance(task: any, result: any, history: any[]): any {
    const totalAttempts = history.length;
    const successfulAttempts = history.filter(
      (h) => h.result.success === true && !h.result.error
    ).length;
    const failureRate =
      totalAttempts > 0
        ? (totalAttempts - successfulAttempts) / totalAttempts
        : 0;

    // Check for patterns
    const recentFailures = history
      .slice(-3)
      .filter((h) => !h.result.success || h.result.error).length;
    const isStuck = recentFailures >= 3;

    // Check for progress
    const hasProgress =
      history.length > 1 &&
      history[history.length - 1].result.success !== history[0].result.success;

    // Debug logging
    console.log(` Task Performance Analysis for ${task.type}:`, {
      taskId: task.id,
      totalAttempts,
      successfulAttempts,
      failureRate: (failureRate * 100).toFixed(1) + '%',
      recentFailures,
      isStuck,
      currentResult: {
        success: result.success,
        error: result.error,
        type: result.type,
      },
      historyLength: history.length,
    });

    return {
      totalAttempts,
      successfulAttempts,
      failureRate,
      recentFailures,
      isStuck,
      hasProgress,
      averageLatency: this.calculateAverageLatency(history),
    };
  }

  /**
   * Generate reasoning for task outcome
   */
  private generateReasoning(task: any, result: any, analysis: any): string {
    const success = result.success === true && !result.error;

    if (success) {
      if (analysis.totalAttempts === 1) {
        return `Successfully completed ${task.type} task on first attempt. The approach was effective.`;
      }
      return `Successfully completed ${task.type} task after ${analysis.totalAttempts} attempts. Persistence paid off.`;
    }
    if (analysis.isStuck) {
      return `Stuck in a loop with ${task.type} task. Failed ${analysis.recentFailures} times consecutively. Need to change approach.`;
    } else if (analysis.failureRate > this.config.failureThreshold) {
      return `High failure rate (${(analysis.failureRate * 100).toFixed(1)}%) for ${task.type} task. Current strategy may not be optimal.`;
    }
    return `Failed to complete ${task.type} task: ${result.error || 'Unknown error'}. May need different resources or approach.`;
  }

  /**
   * Generate alternative suggestions
   */
  private generateAlternatives(
    task: any,
    result: any,
    analysis: any
  ): string[] {
    const alternatives: string[] = [];

    // For stuck patterns or high failure rates, suggest different approaches
    if (
      analysis.isStuck ||
      analysis.failureRate > this.config.failureThreshold ||
      analysis.recentFailures >= 2 // Add this condition for stuck pattern detection
    ) {
      // Suggest different task types
      alternatives.push(`Try a different task type instead of ${task.type}`);
      alternatives.push('Explore the environment to find new resources');
      alternatives.push('Check if required materials are available');

      if (task.type === 'craft') {
        alternatives.push('Gather the required materials first');
        alternatives.push('Try crafting simpler items first');
      } else if (task.type === 'mine') {
        alternatives.push('Look for different types of blocks to mine');
        alternatives.push('Try mining in a different location');
      }
    }

    if (analysis.totalAttempts > this.config.maxRetries) {
      alternatives.push('Consider abandoning this goal temporarily');
      alternatives.push('Focus on other achievable goals first');
    }

    return alternatives;
  }

  /**
   * Assess emotional impact of task outcome
   */
  private assessEmotionalImpact(
    task: any,
    result: any,
    analysis: any
  ): 'positive' | 'negative' | 'neutral' {
    const success = result.success === true && !result.error;

    if (success) {
      if (analysis.totalAttempts === 1) {
        return 'positive'; // First-time success
      } else if (analysis.hasProgress) {
        return 'positive'; // Progress after failures
      } else {
        return 'neutral'; // Success after many attempts
      }
    } else {
      if (analysis.isStuck) {
        return 'negative'; // Stuck in loop
      } else if (analysis.failureRate > this.config.failureThreshold) {
        return 'negative'; // High failure rate
      } else {
        return 'neutral'; // Occasional failure
      }
    }
  }

  /**
   * Calculate confidence in current approach
   */
  private calculateConfidence(task: any, result: any, analysis: any): number {
    const success = result.success === true && !result.error;

    if (success) {
      // Higher confidence for consistent success
      return Math.min(0.9, 0.5 + analysis.successfulAttempts * 0.1);
    }
    // Lower confidence for repeated failures
    if (analysis.isStuck) {
      return 0.1; // Very low confidence when stuck
    } else if (analysis.failureRate > this.config.failureThreshold) {
      return 0.3; // Low confidence with high failure rate
    }
    return 0.5; // Moderate confidence for occasional failures
  }

  /**
   * Calculate average latency from task history
   */
  private calculateAverageLatency(history: any[]): number {
    if (history.length < 2) return 0;

    const latencies = [];
    for (let i = 1; i < history.length; i++) {
      const latency = history[i].timestamp - history[i - 1].timestamp;
      latencies.push(latency);
    }

    return (
      latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length
    );
  }

  /**
   * Store feedback in memory system
   */
  private async storeInMemory(feedback: CognitiveFeedback): Promise<void> {
    if (!this.config.memoryEndpoint) return;

    try {
      const url = `${this.config.memoryEndpoint.replace(/\/$/, '')}/action`;
      const retries = 2;
      const payload = {
        action: 'store_episodic',
        parameters: {
          type: 'task_reflection',
          description: feedback.reasoning,
          taskId: feedback.taskId,
          success: feedback.success,
          confidence: feedback.confidence,
          emotionalImpact: feedback.emotionalImpact,
          alternatives: feedback.alternativeSuggestions,
          timestamp: feedback.timestamp,
        },
      };
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 5_000);
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(t);
          if (res.ok) break;
        } catch (e: any) {
          console.warn('Failed to store cognitive feedback in memory:', e);
        }
        await new Promise((r) => setTimeout(r, 250 + attempt * 250));
      }
    } catch (error) {
      console.warn('Failed to store cognitive feedback in memory:', error);
    }
  }

  /**
   * Get task performance statistics
   */
  getTaskStats(taskId: string): any {
    const history = this.taskHistory.get(taskId) || [];
    const failureCount = this.failureCounts.get(taskId) || 0;
    const successCount = this.successCounts.get(taskId) || 0;

    return {
      totalAttempts: history.length,
      successCount,
      failureCount,
      successRate: history.length > 0 ? successCount / history.length : 0,
      lastAttempt: history.length > 0 ? history[history.length - 1] : null,
    };
  }

  /**
   * Check if task should be abandoned
   */
  shouldAbandonTask(taskId: string): boolean {
    const stats = this.getTaskStats(taskId);
    const failureCount = this.failureCounts.get(taskId) || 0;

    return (
      failureCount >= this.config.maxRetries ||
      stats.successRate < this.config.failureThreshold
    );
  }

  /**
   * Get cognitive insights for task optimization
   */
  async getCognitiveInsights(taskType: string): Promise<string[]> {
    const insights: string[] = [];

    // Analyze all tasks of this type
    for (const [taskId, history] of Array.from(this.taskHistory.entries())) {
      const task = history[0]?.task;
      if (task?.type === taskType) {
        const stats = this.getTaskStats(taskId);
        if (stats.successRate > this.config.successThreshold) {
          insights.push(
            `Task ${taskId} has high success rate (${(stats.successRate * 100).toFixed(1)}%)`
          );
        } else if (stats.successRate < this.config.failureThreshold) {
          insights.push(
            `Task ${taskId} has low success rate (${(stats.successRate * 100).toFixed(1)}%) - consider alternative approaches`
          );
        }
      }
    }

    return insights;
  }
}
