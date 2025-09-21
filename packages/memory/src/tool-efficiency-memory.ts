/**
 * Tool Efficiency Memory System
 *
 * Tracks tool usage patterns, efficiency metrics, and success rates across different
 * tasks and contexts. Learns which tools work best for which situations and provides
 * intelligent tool selection recommendations.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface ToolUsageRecord {
  id: string;
  toolName: string;
  toolType:
    | 'crafting'
    | 'mining'
    | 'combat'
    | 'farming'
    | 'building'
    | 'utility';
  taskType: string; // e.g., 'mine_stone', 'craft_sword', 'chop_wood'
  context: {
    biome?: string;
    timeOfDay?: 'day' | 'night';
    difficulty?: 'peaceful' | 'easy' | 'normal' | 'hard';
    weather?: 'clear' | 'rain' | 'storm';
    location?: { x: number; y: number; z: number };
    material?: string; // What the tool was used on
  };
  metrics: {
    success: boolean;
    duration: number; // milliseconds
    damageTaken: number;
    resourcesGained: number;
    durabilityUsed: number;
    efficiency: number; // resources per second
    successRate: number; // 0-1
  };
  outcome: {
    result: 'success' | 'partial_success' | 'failure' | 'timeout';
    reason?: string;
    alternativeTools?: string[];
    improvementSuggestions?: string[];
  };
  timestamp: number;
  sessionId: string;
}

export interface ToolEfficiencyProfile {
  toolName: string;
  toolType: string;
  overallStats: {
    totalUses: number;
    successRate: number;
    averageEfficiency: number;
    averageDurabilityPerUse: number;
    preferredContexts: string[];
    commonFailures: string[];
  };
  contextPerformance: Record<
    string,
    {
      uses: number;
      successRate: number;
      efficiency: number;
      averageDuration: number;
    }
  >;
  taskPerformance: Record<
    string,
    {
      uses: number;
      successRate: number;
      efficiency: number;
      recommended: boolean;
    }
  >;
  evolution: Array<{
    timestamp: number;
    skillLevel: number;
    efficiency: number;
    successRate: number;
  }>;
}

export interface BehaviorTreePattern {
  id: string;
  name: string;
  sequence: string[]; // Array of leaf names executed in order
  context: {
    taskType: string;
    initialConditions: Record<string, any>;
    environmentalFactors: Record<string, any>;
  };
  outcomes: Array<{
    success: boolean;
    duration: number;
    resourcesUsed: Record<string, number>;
    lessonsLearned: string[];
    timestamp: number;
  }>;
  performance: {
    averageSuccessRate: number;
    averageDuration: number;
    reliability: number; // 0-1, based on consistency
    adaptability: number; // 0-1, how well it handles different contexts
  };
  metadata: {
    discoveredAt: number;
    lastUsed: number;
    usageCount: number;
    creator: 'bot' | 'human' | 'hybrid';
  };
}

export interface CognitiveProcessingPattern {
  id: string;
  thoughtType: 'reflection' | 'planning' | 'decision' | 'learning' | 'social';
  context: {
    taskComplexity: 'simple' | 'medium' | 'complex';
    timePressure: number; // 0-1
    emotionalState: string;
    cognitiveLoad: number; // 0-1
    socialContext: boolean;
  };
  processing: {
    approach: string;
    reasoning: string;
    confidence: number;
    processingTime: number;
  };
  outcome: {
    success: boolean;
    quality: number; // 0-1, subjective quality rating
    followThrough: boolean; // Did the bot actually act on the thought?
    longTermImpact: number; // 0-1, how much this influenced future behavior
  };
  patterns: {
    commonBiases: string[];
    effectiveStrategies: string[];
    failureModes: string[];
  };
  timestamp: number;
}

export interface ToolEfficiencyConfig {
  /** Enable tool efficiency tracking */
  enabled: boolean;

  /** How often to evaluate tool performance (ms) */
  evaluationInterval: number;

  /** Minimum uses before considering a tool "proven" */
  minUsesForRecommendation: number;

  /** How much to weight recent performance vs historical */
  recencyWeight: number;

  /** Enable behavior tree pattern learning */
  enableBehaviorTreeLearning: boolean;

  /** Enable cognitive processing pattern tracking */
  enableCognitivePatternTracking: boolean;

  /** Maximum patterns to store per tool/context */
  maxPatternsPerContext: number;

  /** Enable automatic tool recommendations */
  enableAutoRecommendations: boolean;

  /** Threshold for considering a tool "efficient" */
  efficiencyThreshold: number;

  /** How often to clean up old tool usage records */
  cleanupInterval: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_TOOL_EFFICIENCY_CONFIG: ToolEfficiencyConfig = {
  enabled: true,
  evaluationInterval: 300000, // 5 minutes
  minUsesForRecommendation: 3,
  recencyWeight: 0.7,
  enableBehaviorTreeLearning: true,
  enableCognitivePatternTracking: true,
  maxPatternsPerContext: 10,
  enableAutoRecommendations: true,
  efficiencyThreshold: 0.6,
  cleanupInterval: 3600000, // 1 hour
};

// ============================================================================
// Tool Efficiency Memory Manager
// ============================================================================

/**
 * Manages tool efficiency tracking, behavior tree pattern learning, and cognitive processing outcomes
 */
export class ToolEfficiencyMemoryManager {
  private config: ToolEfficiencyConfig;
  private toolUsageRecords: Map<string, ToolUsageRecord[]> = new Map();
  private efficiencyProfiles: Map<string, ToolEfficiencyProfile> = new Map();
  private behaviorTreePatterns: Map<string, BehaviorTreePattern> = new Map();
  private cognitivePatterns: Map<string, CognitiveProcessingPattern> =
    new Map();
  private lastEvaluation: number = 0;
  private lastCleanup: number = 0;

  constructor(config: Partial<ToolEfficiencyConfig> = {}) {
    this.config = { ...DEFAULT_TOOL_EFFICIENCY_CONFIG, ...config };
  }

  /**
   * Record tool usage for efficiency analysis
   */
  async recordToolUsage(
    toolName: string,
    toolType: ToolUsageRecord['toolType'],
    taskType: string,
    context: ToolUsageRecord['context'],
    metrics: ToolUsageRecord['metrics'],
    outcome: ToolUsageRecord['outcome'],
    sessionId: string = 'default'
  ): Promise<void> {
    const record: ToolUsageRecord = {
      id: `${toolName}_${taskType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      toolName,
      toolType,
      taskType,
      context,
      metrics,
      outcome,
      timestamp: Date.now(),
      sessionId,
    };

    // Store the record
    const existing = this.toolUsageRecords.get(toolName) || [];
    existing.push(record);
    this.toolUsageRecords.set(toolName, existing);

    // Update efficiency profile
    await this.updateToolEfficiencyProfile(toolName, record);

    console.log(
      `📊 Recorded tool usage: ${toolName} for ${taskType} - Success: ${metrics.success}`
    );
  }

  /**
   * Record behavior tree execution pattern
   */
  async recordBehaviorTreePattern(
    name: string,
    sequence: string[],
    context: BehaviorTreePattern['context'],
    outcome: BehaviorTreePattern['outcomes'][0],
    metadata: Partial<BehaviorTreePattern['metadata']> = {}
  ): Promise<void> {
    if (!this.config.enableBehaviorTreeLearning) return;

    const patternId = `${name}_${context.taskType}_${Date.now()}`;

    const existing = this.behaviorTreePatterns.get(patternId);
    let pattern: BehaviorTreePattern;

    if (existing) {
      // Update existing pattern
      existing.outcomes.push(outcome);
      existing.metadata.lastUsed = Date.now();
      existing.metadata.usageCount++;
      pattern = existing;
    } else {
      // Create new pattern
      pattern = {
        id: patternId,
        name,
        sequence,
        context,
        outcomes: [outcome],
        performance: {
          averageSuccessRate: outcome.success ? 1 : 0,
          averageDuration: outcome.duration,
          reliability: outcome.success ? 1 : 0,
          adaptability: 0.5, // Will be calculated based on context diversity
        },
        metadata: {
          discoveredAt: Date.now(),
          lastUsed: Date.now(),
          usageCount: 1,
          creator: 'bot',
          ...metadata,
        },
      };
    }

    // Update performance metrics
    pattern.performance = this.calculatePatternPerformance(pattern);

    this.behaviorTreePatterns.set(patternId, pattern);

    console.log(
      `🧠 Recorded behavior tree pattern: ${name} - Success: ${outcome.success}`
    );
  }

  /**
   * Record cognitive processing outcome
   */
  async recordCognitivePattern(
    thoughtType: CognitiveProcessingPattern['thoughtType'],
    context: CognitiveProcessingPattern['context'],
    processing: CognitiveProcessingPattern['processing'],
    outcome: CognitiveProcessingPattern['outcome'],
    patterns: CognitiveProcessingPattern['patterns']
  ): Promise<void> {
    if (!this.config.enableCognitivePatternTracking) return;

    const patternId = `${thoughtType}_${context.taskComplexity}_${Date.now()}`;

    const pattern: CognitiveProcessingPattern = {
      id: patternId,
      thoughtType,
      context,
      processing,
      outcome,
      patterns,
      timestamp: Date.now(),
    };

    this.cognitivePatterns.set(patternId, pattern);

    console.log(
      `🧠 Recorded cognitive pattern: ${thoughtType} - Success: ${outcome.success}`
    );
  }

  /**
   * Get tool recommendations for a task
   */
  async getToolRecommendations(
    taskType: string,
    context: Partial<ToolUsageRecord['context']> = {},
    limit: number = 5
  ): Promise<
    Array<{
      toolName: string;
      confidence: number;
      reasoning: string;
      expectedEfficiency: number;
    }>
  > {
    if (!this.config.enabled) return [];

    const recommendations: Array<{
      toolName: string;
      confidence: number;
      reasoning: string;
      expectedEfficiency: number;
    }> = [];

    for (const [toolName, records] of this.toolUsageRecords) {
      const taskRecords = records.filter((r) => r.taskType === taskType);

      if (taskRecords.length < this.config.minUsesForRecommendation) {
        continue; // Not enough data
      }

      // Calculate context match
      const contextMatch = this.calculateContextMatch(context, taskRecords);

      // Calculate performance score
      const successRate =
        taskRecords.filter((r) => r.metrics.success).length /
        taskRecords.length;
      const averageEfficiency =
        taskRecords.reduce((sum, r) => sum + r.metrics.efficiency, 0) /
        taskRecords.length;

      // Weight recent performance more heavily
      const recencyWeight = this.calculateRecencyWeight(taskRecords);

      const overallScore =
        successRate * 0.4 +
        averageEfficiency * 0.3 +
        contextMatch * 0.2 +
        recencyWeight * 0.1;

      if (overallScore >= this.config.efficiencyThreshold) {
        recommendations.push({
          toolName,
          confidence: Math.min(1.0, overallScore),
          reasoning: `Success rate: ${(successRate * 100).toFixed(1)}%, Efficiency: ${averageEfficiency.toFixed(2)}, Context match: ${(contextMatch * 100).toFixed(1)}%`,
          expectedEfficiency: averageEfficiency,
        });
      }
    }

    // Sort by confidence and return top results
    return recommendations
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  /**
   * Get recommended behavior tree patterns for a task
   */
  async getBehaviorTreeRecommendations(
    taskType: string,
    context: Partial<BehaviorTreePattern['context']> = {},
    limit: number = 3
  ): Promise<BehaviorTreePattern[]> {
    if (!this.config.enableBehaviorTreeLearning) return [];

    const candidates = Array.from(this.behaviorTreePatterns.values())
      .filter((pattern) => pattern.context.taskType === taskType)
      .sort(
        (a, b) =>
          b.performance.averageSuccessRate - a.performance.averageSuccessRate
      );

    return candidates.slice(0, limit);
  }

  /**
   * Get cognitive processing insights
   */
  async getCognitiveInsights(
    thoughtType: CognitiveProcessingPattern['thoughtType'],
    context: Partial<CognitiveProcessingPattern['context']>
  ): Promise<{
    effectiveStrategies: string[];
    commonBiases: string[];
    successRate: number;
    averageProcessingTime: number;
  }> {
    if (!this.config.enableCognitivePatternTracking) {
      return {
        effectiveStrategies: [],
        commonBiases: [],
        successRate: 0,
        averageProcessingTime: 0,
      };
    }

    const relevantPatterns = Array.from(this.cognitivePatterns.values()).filter(
      (pattern) => pattern.thoughtType === thoughtType
    );

    if (relevantPatterns.length === 0) {
      return {
        effectiveStrategies: [],
        commonBiases: [],
        successRate: 0,
        averageProcessingTime: 0,
      };
    }

    const effectiveStrategies = new Set<string>();
    const commonBiases = new Set<string>();
    let totalSuccess = 0;
    let totalProcessingTime = 0;

    for (const pattern of relevantPatterns) {
      if (pattern.outcome.success) {
        pattern.patterns.effectiveStrategies.forEach((strategy) =>
          effectiveStrategies.add(strategy)
        );
      }
      pattern.patterns.commonBiases.forEach((bias) => commonBiases.add(bias));
      totalSuccess += pattern.outcome.success ? 1 : 0;
      totalProcessingTime += pattern.processing.processingTime;
    }

    return {
      effectiveStrategies: Array.from(effectiveStrategies),
      commonBiases: Array.from(commonBiases),
      successRate: totalSuccess / relevantPatterns.length,
      averageProcessingTime: totalProcessingTime / relevantPatterns.length,
    };
  }

  /**
   * Evaluate and update efficiency profiles
   */
  async evaluateEfficiency(): Promise<void> {
    const now = Date.now();

    for (const [toolName, records] of this.toolUsageRecords) {
      if (records.length > 0) {
        await this.updateToolEfficiencyProfile(
          toolName,
          records[records.length - 1]
        );
      }
    }

    // Clean up old records
    if (now - this.lastCleanup > this.config.cleanupInterval) {
      await this.cleanupOldRecords();
      this.lastCleanup = now;
    }

    this.lastEvaluation = now;

    console.log(
      `📊 Evaluated tool efficiency for ${this.toolUsageRecords.size} tools`
    );
  }

  /**
   * Get efficiency statistics
   */
  getEfficiencyStats(): {
    totalTools: number;
    totalRecords: number;
    averageSuccessRate: number;
    topPerformingTools: Array<{
      tool: string;
      successRate: number;
      uses: number;
    }>;
  } {
    const allRecords = Array.from(this.toolUsageRecords.values()).flat();
    const totalTools = this.toolUsageRecords.size;

    if (allRecords.length === 0) {
      return {
        totalTools: 0,
        totalRecords: 0,
        averageSuccessRate: 0,
        topPerformingTools: [],
      };
    }

    const successCount = allRecords.filter((r) => r.metrics.success).length;
    const averageSuccessRate = successCount / allRecords.length;

    // Calculate top performing tools
    const toolStats = new Map<
      string,
      { successes: number; total: number; uses: number }
    >();

    for (const record of allRecords) {
      const stats = toolStats.get(record.toolName) || {
        successes: 0,
        total: 0,
        uses: 0,
      };
      stats.total++;
      stats.uses++;
      if (record.metrics.success) {
        stats.successes++;
      }
      toolStats.set(record.toolName, stats);
    }

    const topPerformingTools = Array.from(toolStats.entries())
      .map(([tool, stats]) => ({
        tool,
        successRate: stats.successes / stats.total,
        uses: stats.uses,
      }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5);

    return {
      totalTools,
      totalRecords: allRecords.length,
      averageSuccessRate,
      topPerformingTools,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async updateToolEfficiencyProfile(
    toolName: string,
    record: ToolUsageRecord
  ): Promise<void> {
    const existing = this.efficiencyProfiles.get(toolName);
    const allRecords = this.toolUsageRecords.get(toolName) || [];

    if (!existing) {
      // Create new profile
      const profile: ToolEfficiencyProfile = {
        toolName,
        toolType: record.toolType,
        overallStats: this.calculateOverallStats(allRecords),
        contextPerformance: this.calculateContextPerformance(allRecords),
        taskPerformance: this.calculateTaskPerformance(allRecords),
        evolution: [
          {
            timestamp: Date.now(),
            skillLevel: this.calculateSkillLevel(allRecords),
            efficiency: this.calculateAverageEfficiency(allRecords),
            successRate: this.calculateSuccessRate(allRecords),
          },
        ],
      };
      this.efficiencyProfiles.set(toolName, profile);
    } else {
      // Update existing profile
      existing.overallStats = this.calculateOverallStats(allRecords);
      existing.contextPerformance =
        this.calculateContextPerformance(allRecords);
      existing.taskPerformance = this.calculateTaskPerformance(allRecords);
      existing.evolution.push({
        timestamp: Date.now(),
        skillLevel: this.calculateSkillLevel(allRecords),
        efficiency: this.calculateAverageEfficiency(allRecords),
        successRate: this.calculateSuccessRate(allRecords),
      });
    }
  }

  private calculateOverallStats(records: ToolUsageRecord[]) {
    if (records.length === 0) {
      return {
        totalUses: 0,
        successRate: 0,
        averageEfficiency: 0,
        averageDurabilityPerUse: 0,
        preferredContexts: [],
        commonFailures: [],
      };
    }

    const successes = records.filter((r) => r.metrics.success).length;
    const successRate = successes / records.length;
    const averageEfficiency =
      records.reduce((sum, r) => sum + r.metrics.efficiency, 0) /
      records.length;
    const averageDurability =
      records.reduce((sum, r) => sum + r.metrics.durabilityUsed, 0) /
      records.length;

    // Find preferred contexts
    const contextCounts = new Map<string, number>();
    for (const record of records) {
      const contextKey = this.contextToString(record.context);
      contextCounts.set(contextKey, (contextCounts.get(contextKey) || 0) + 1);
    }
    const preferredContexts = Array.from(contextCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([context]) => context);

    // Find common failures
    const failureReasons = records
      .filter((r) => !r.metrics.success)
      .map((r) => r.outcome.reason || 'unknown')
      .filter((reason) => reason !== 'unknown');

    const commonFailures = Array.from(new Set(failureReasons));

    return {
      totalUses: records.length,
      successRate,
      averageEfficiency,
      averageDurabilityPerUse: averageDurability,
      preferredContexts,
      commonFailures,
    };
  }

  private calculateContextPerformance(
    records: ToolUsageRecord[]
  ): Record<string, any> {
    const contextGroups = new Map<string, ToolUsageRecord[]>();

    for (const record of records) {
      const contextKey = this.contextToString(record.context);
      const group = contextGroups.get(contextKey) || [];
      group.push(record);
      contextGroups.set(contextKey, group);
    }

    const result: Record<string, any> = {};
    for (const [contextKey, contextRecords] of contextGroups) {
      const successes = contextRecords.filter((r) => r.metrics.success).length;
      const successRate = successes / contextRecords.length;
      const averageEfficiency =
        contextRecords.reduce((sum, r) => sum + r.metrics.efficiency, 0) /
        contextRecords.length;
      const averageDuration =
        contextRecords.reduce((sum, r) => sum + r.metrics.duration, 0) /
        contextRecords.length;

      result[contextKey] = {
        uses: contextRecords.length,
        successRate,
        efficiency: averageEfficiency,
        averageDuration,
      };
    }

    return result;
  }

  private calculateTaskPerformance(
    records: ToolUsageRecord[]
  ): Record<string, any> {
    const taskGroups = new Map<string, ToolUsageRecord[]>();

    for (const record of records) {
      const group = taskGroups.get(record.taskType) || [];
      group.push(record);
      taskGroups.set(record.taskType, group);
    }

    const result: Record<string, any> = {};
    for (const [taskType, taskRecords] of taskGroups) {
      const successes = taskRecords.filter((r) => r.metrics.success).length;
      const successRate = successes / taskRecords.length;
      const averageEfficiency =
        taskRecords.reduce((sum, r) => sum + r.metrics.efficiency, 0) /
        taskRecords.length;

      result[taskType] = {
        uses: taskRecords.length,
        successRate,
        efficiency: averageEfficiency,
        recommended:
          taskRecords.length >= this.config.minUsesForRecommendation &&
          successRate >= this.config.efficiencyThreshold,
      };
    }

    return result;
  }

  private calculatePatternPerformance(pattern: BehaviorTreePattern) {
    if (pattern.outcomes.length === 0) {
      return pattern.performance;
    }

    const successCount = pattern.outcomes.filter((o) => o.success).length;
    const averageSuccessRate = successCount / pattern.outcomes.length;
    const averageDuration =
      pattern.outcomes.reduce((sum, o) => sum + o.duration, 0) /
      pattern.outcomes.length;

    // Calculate reliability based on consistency
    const successRates = pattern.outcomes.map((o) => (o.success ? 1 : 0));
    const reliability = this.calculateConsistency(successRates);

    // Calculate adaptability based on context diversity (simplified)
    const adaptability = Math.min(1.0, pattern.outcomes.length / 5);

    return {
      averageSuccessRate,
      averageDuration,
      reliability,
      adaptability,
    };
  }

  private calculateContextMatch(
    context: Partial<ToolUsageRecord['context']>,
    records: ToolUsageRecord[]
  ): number {
    if (Object.keys(context).length === 0) return 1.0;

    let matchScore = 0;
    let matchCount = 0;

    for (const record of records) {
      let recordScore = 0;
      let recordMatches = 0;

      // Check each context factor
      if (context.biome && context.biome === record.context.biome) {
        recordScore += 0.3;
        recordMatches++;
      }
      if (context.timeOfDay && context.timeOfDay === record.context.timeOfDay) {
        recordScore += 0.2;
        recordMatches++;
      }
      if (
        context.difficulty &&
        context.difficulty === record.context.difficulty
      ) {
        recordScore += 0.2;
        recordMatches++;
      }
      if (context.weather && context.weather === record.context.weather) {
        recordScore += 0.1;
        recordMatches++;
      }
      if (context.material && context.material === record.context.material) {
        recordScore += 0.2;
        recordMatches++;
      }

      if (recordMatches > 0) {
        matchScore += recordScore / recordMatches;
        matchCount++;
      }
    }

    return matchCount > 0 ? matchScore / matchCount : 0.5; // Default to neutral if no matches
  }

  private calculateRecencyWeight(records: ToolUsageRecord[]): number {
    if (records.length === 0) return 0;

    const now = Date.now();
    const weights = records.map((record) => {
      const ageHours = (now - record.timestamp) / (1000 * 60 * 60);
      return Math.exp(-ageHours / 24); // Exponential decay over 24 hours
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const weightedSum = weights.reduce(
      (sum, w, i) => sum + w * (records[i].metrics.success ? 1 : 0),
      0
    );

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  private calculateSkillLevel(records: ToolUsageRecord[]): number {
    const recentRecords = records.slice(-10); // Last 10 uses
    if (recentRecords.length === 0) return 0.5;

    const successRate =
      recentRecords.filter((r) => r.metrics.success).length /
      recentRecords.length;
    const efficiency =
      recentRecords.reduce((sum, r) => sum + r.metrics.efficiency, 0) /
      recentRecords.length;

    // Normalize to 0-1 scale
    const normalizedEfficiency = Math.min(1.0, efficiency / 10); // Assume 10 efficiency is max

    return successRate * 0.6 + normalizedEfficiency * 0.4;
  }

  private calculateAverageEfficiency(records: ToolUsageRecord[]): number {
    if (records.length === 0) return 0;
    return (
      records.reduce((sum, r) => sum + r.metrics.efficiency, 0) / records.length
    );
  }

  private calculateSuccessRate(records: ToolUsageRecord[]): number {
    if (records.length === 0) return 0;
    return records.filter((r) => r.metrics.success).length / records.length;
  }

  private calculateConsistency(values: number[]): number {
    if (values.length <= 1) return 1;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

    // Convert to consistency score (lower variance = higher consistency)
    return Math.max(0, 1 - variance);
  }

  private contextToString(context: ToolUsageRecord['context']): string {
    const parts = [];
    if (context.biome) parts.push(`biome:${context.biome}`);
    if (context.timeOfDay) parts.push(`time:${context.timeOfDay}`);
    if (context.difficulty) parts.push(`diff:${context.difficulty}`);
    if (context.weather) parts.push(`weather:${context.weather}`);
    if (context.material) parts.push(`material:${context.material}`);
    return parts.join(',') || 'default';
  }

  private async cleanupOldRecords(): Promise<void> {
    const now = Date.now();
    const cutoff = now - 30 * 24 * 60 * 60 * 1000; // 30 days ago

    for (const [toolName, records] of this.toolUsageRecords) {
      const recentRecords = records.filter((r) => r.timestamp > cutoff);
      if (recentRecords.length > 0) {
        this.toolUsageRecords.set(toolName, recentRecords);
      } else {
        this.toolUsageRecords.delete(toolName);
        this.efficiencyProfiles.delete(toolName);
      }
    }

    // Clean up old behavior tree patterns
    for (const [patternId, pattern] of this.behaviorTreePatterns) {
      if (pattern.metadata.lastUsed < cutoff) {
        this.behaviorTreePatterns.delete(patternId);
      }
    }

    // Clean up old cognitive patterns
    for (const [patternId, pattern] of this.cognitivePatterns) {
      if (pattern.timestamp < cutoff) {
        this.cognitivePatterns.delete(patternId);
      }
    }

    const allRecords = Array.from(this.toolUsageRecords.values()).flat();
    console.log(
      `🧹 Cleaned up old efficiency records, removed ${allRecords.length - Array.from(this.toolUsageRecords.values()).flat().length} old records`
    );
  }
}
