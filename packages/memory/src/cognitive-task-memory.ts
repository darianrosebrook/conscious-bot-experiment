/**
 * Cognitive Task Memory Enhancement
 *
 * Enhances the working memory system with sophisticated cognitive task memory
 * that tracks task progress, history, learning, and integration with cognitive
 * processes for better task understanding and execution.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';
// Temporary local type definition until @conscious-bot/core is available
export interface CognitiveTask {
  id: string;
  type: string;
  description: string;
  priority: number;
  deadline?: number;
  context: Record<string, any>;
  complexity?: 'simple' | 'medium' | 'complex';
}
import { ContextManager } from './working/context-manager';
import { CentralExecutive } from './working/central-executive';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface CognitiveTaskMemory {
  id: string;
  task: CognitiveTask;
  context: {
    spatial: any;
    temporal: any;
    social: any;
    emotional: any;
    environmental: any;
  };
  history: TaskHistoryEntry[];
  learning: TaskLearningData;
  progress: TaskProgress;
  reflections: TaskReflection[];
  associations: TaskAssociation[];
}

export interface TaskHistoryEntry {
  timestamp: number;
  action: string;
  result: 'success' | 'failure' | 'partial' | 'interrupted';
  context: Record<string, any>;
  outcome: {
    success: boolean;
    progress: number;
    resources: Record<string, number>;
    emotionalImpact: number;
    learning: string[];
  };
  duration: number;
  memoryId?: string; // Link to episodic memory
}

export interface TaskLearningData {
  successRate: number;
  averageDuration: number;
  commonFailures: string[];
  optimalConditions: Record<string, any>;
  skillLevel: number; // 0-1
  preferredStrategies: string[];
  adaptationHistory: AdaptationEntry[];
}

export interface TaskProgress {
  current: number; // 0-1
  target: number;
  milestones: Milestone[];
  blockers: Blocker[];
  estimatedTimeRemaining: number;
  confidence: number; // 0-1
}

export interface Milestone {
  id: string;
  description: string;
  completed: boolean;
  completedAt?: number;
  importance: number;
  dependencies: string[];
}

export interface Blocker {
  id: string;
  type: 'resource' | 'skill' | 'environmental' | 'social' | 'unknown';
  description: string;
  severity: number; // 0-1
  mitigation: string[];
  resolved: boolean;
  resolvedAt?: number;
}

export interface TaskReflection {
  timestamp: number;
  type: 'progress' | 'failure' | 'success' | 'adaptation' | 'meta';
  content: string;
  insights: string[];
  lessons: string[];
  emotionalState: string;
  confidence: number;
}

export interface TaskAssociation {
  type:
    | 'similar_task'
    | 'prerequisite'
    | 'followup'
    | 'alternative'
    | 'conflict';
  taskId: string;
  strength: number; // 0-1
  reasoning: string;
  createdAt: number;
}

export interface AdaptationEntry {
  timestamp: number;
  trigger: string;
  oldStrategy: string;
  newStrategy: string;
  result: 'improved' | 'worse' | 'neutral';
  reasoning: string;
}

interface TaskPattern {
  id: string;
  pattern: string;
  frequency: number;
  successRate: number;
  commonContext: Record<string, any>;
  associatedTasks: string[];
}

export interface CognitiveTaskMemoryConfig {
  /** Maximum number of task memories to keep active */
  maxActiveTasks: number;

  /** How far back to look for task patterns (ms) */
  patternLookback: number;

  /** Minimum confidence threshold for task predictions */
  minPredictionConfidence: number;

  /** Enable learning from task outcomes */
  enableLearning: boolean;

  /** Enable automatic reflection generation */
  enableReflections: boolean;

  /** Enable task association discovery */
  enableAssociations: boolean;

  /** Context decay rate for inactive tasks */
  contextDecayRate: number;

  /** Learning rate for skill adaptation */
  learningRate: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_COGNITIVE_TASK_MEMORY_CONFIG: CognitiveTaskMemoryConfig = {
  maxActiveTasks: 10,
  patternLookback: 7 * 24 * 60 * 60 * 1000, // 7 days
  minPredictionConfidence: 0.6,
  enableLearning: true,
  enableReflections: true,
  enableAssociations: true,
  contextDecayRate: 0.1,
  learningRate: 0.1,
};

// ============================================================================
// Cognitive Task Memory Manager
// ============================================================================

/**
 * Manages cognitive task memory with advanced learning and adaptation
 */
export class CognitiveTaskMemoryManager {
  private contextManager: ContextManager;
  private centralExecutive: CentralExecutive;
  private config: CognitiveTaskMemoryConfig;
  private taskMemories: Map<string, CognitiveTaskMemory> = new Map();
  private taskPatterns: Map<string, TaskPattern> = new Map();

  constructor(
    contextManager: ContextManager,
    centralExecutive: CentralExecutive,
    config: Partial<CognitiveTaskMemoryConfig> = {}
  ) {
    this.contextManager = contextManager;
    this.centralExecutive = centralExecutive;
    this.config = { ...DEFAULT_COGNITIVE_TASK_MEMORY_CONFIG, ...config };
  }

  /**
   * Create or update task memory for a cognitive task
   */
  async createTaskMemory(task: CognitiveTask): Promise<CognitiveTaskMemory> {
    let taskMemory = this.taskMemories.get(task.id);

    if (!taskMemory) {
      // Create new task memory
      taskMemory = {
        id: task.id,
        task,
        context: {
          spatial: {},
          temporal: {},
          social: {},
          emotional: {},
          environmental: {},
        },
        history: [],
        learning: {
          successRate: 0.5, // Neutral starting point
          averageDuration: 0,
          commonFailures: [],
          optimalConditions: {},
          skillLevel: 0.1, // Start with low skill
          preferredStrategies: [],
          adaptationHistory: [],
        },
        progress: {
          current: 0,
          target: 1,
          milestones: [],
          blockers: [],
          estimatedTimeRemaining: 0,
          confidence: 0.5,
        },
        reflections: [],
        associations: [],
      };

      this.taskMemories.set(task.id, taskMemory);

      console.log(`🧠 Created task memory for: ${task.id}`);
    } else {
      // Update existing task
      taskMemory.task = task;
    }

    // Update context if task has context
    if (task.context) {
      await this.updateTaskContext(taskMemory, task.context);
    }

    return taskMemory;
  }

  /**
   * Record task progress and outcomes
   */
  async recordTaskProgress(
    taskId: string,
    progress: number,
    context: Record<string, any> = {},
    outcome?: {
      success: boolean;
      progress?: number;
      resources: Record<string, number>;
      emotionalImpact: number;
      duration: number;
      learning?: string[];
    }
  ): Promise<void> {
    const taskMemory = this.taskMemories.get(taskId);
    if (!taskMemory) {
      console.warn(`⚠️ Task memory not found: ${taskId}`);
      return;
    }

    // Update progress
    taskMemory.progress.current = progress;
    taskMemory.progress.confidence =
      this.calculateProgressConfidence(taskMemory);

    // Record history entry
    const historyEntry: TaskHistoryEntry = {
      timestamp: Date.now(),
      action: 'progress_update',
      result: outcome?.success ? 'success' : 'partial',
      context,
      outcome: outcome
        ? {
            success: outcome.success,
            progress: outcome.progress ?? progress,
            resources: outcome.resources ?? {},
            emotionalImpact: outcome.emotionalImpact ?? 0,
            learning: outcome.learning ?? [],
          }
        : {
            success: progress >= taskMemory.progress.target,
            progress: progress,
            resources: {},
            emotionalImpact: 0,
            learning: [],
          },
      duration: outcome?.duration || 0,
    };

    taskMemory.history.push(historyEntry);

    // Limit history size
    if (taskMemory.history.length > 100) {
      taskMemory.history = taskMemory.history.slice(-100);
    }

    // Learn from the outcome
    if (this.config.enableLearning) {
      await this.updateTaskLearning(taskMemory, historyEntry);
    }

    // Generate reflection if enabled
    if (this.config.enableReflections) {
      await this.generateTaskReflection(taskMemory, historyEntry);
    }

    console.log(
      `📈 Recorded progress for task ${taskId}: ${(progress * 100).toFixed(1)}%`
    );
  }

  /**
   * Get task memory with enhanced context
   */
  getTaskMemory(taskId: string): CognitiveTaskMemory | undefined {
    return this.taskMemories.get(taskId);
  }

  /**
   * Get all active task memories
   */
  getActiveTaskMemories(): CognitiveTaskMemory[] {
    return Array.from(this.taskMemories.values())
      .filter((memory) => memory.progress.current < memory.progress.target)
      .sort((a, b) => b.progress.current - a.progress.current);
  }

  /**
   * Find similar tasks based on patterns
   */
  async findSimilarTasks(
    task: CognitiveTask,
    options: {
      minSimilarity?: number;
      maxResults?: number;
      includeCompleted?: boolean;
    } = {}
  ): Promise<CognitiveTaskMemory[]> {
    const {
      minSimilarity = 0.3,
      maxResults = 5,
      includeCompleted = false,
    } = options;

    const similarTasks: Array<{
      taskMemory: CognitiveTaskMemory;
      similarity: number;
      reasoning: string;
    }> = [];

    for (const taskMemory of this.taskMemories.values()) {
      if (
        !includeCompleted &&
        taskMemory.progress.current >= taskMemory.progress.target
      ) {
        continue;
      }

      const similarity = await this.calculateTaskSimilarity(task, taskMemory);
      const reasoning = this.generateSimilarityReasoning(task, taskMemory);

      if (similarity >= minSimilarity) {
        similarTasks.push({
          taskMemory,
          similarity,
          reasoning,
        });
      }
    }

    return similarTasks
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults)
      .map((item) => item.taskMemory);
  }

  /**
   * Get task predictions based on historical data
   */
  async getTaskPredictions(taskId: string): Promise<{
    estimatedDuration: number;
    successProbability: number;
    likelyFailures: string[];
    recommendedStrategy: string;
    confidence: number;
  }> {
    const taskMemory = this.taskMemories.get(taskId);
    if (!taskMemory) {
      return {
        estimatedDuration: 0,
        successProbability: 0.5,
        likelyFailures: [],
        recommendedStrategy: 'unknown',
        confidence: 0,
      };
    }

    // Calculate predictions based on history and learning data
    const recentHistory = taskMemory.history.slice(-10);
    const successCount = recentHistory.filter((h) => h.outcome.success).length;
    const successProbability =
      recentHistory.length > 0
        ? successCount / recentHistory.length
        : taskMemory.learning.successRate;

    const averageDuration =
      recentHistory.length > 0
        ? recentHistory.reduce((sum, h) => sum + h.duration, 0) /
          recentHistory.length
        : taskMemory.learning.averageDuration;

    const likelyFailures = taskMemory.learning.commonFailures.slice(0, 3);

    const recommendedStrategy =
      taskMemory.learning.preferredStrategies[0] || 'default';

    const confidence = Math.min(0.9, taskMemory.history.length / 10); // More history = higher confidence

    return {
      estimatedDuration: averageDuration,
      successProbability,
      likelyFailures,
      recommendedStrategy,
      confidence,
    };
  }

  /**
   * Update task associations
   */
  async updateTaskAssociations(taskId: string): Promise<void> {
    if (!this.config.enableAssociations) return;

    const taskMemory = this.taskMemories.get(taskId);
    if (!taskMemory) return;

    const similarTasks = await this.findSimilarTasks(taskMemory.task, {
      minSimilarity: 0.5,
      maxResults: 10,
      includeCompleted: true,
    });

    // Create associations
    const associations: TaskAssociation[] = [];

    for (const similarTask of similarTasks) {
      const similarity = await this.calculateTaskSimilarity(
        taskMemory.task,
        similarTask
      );

      // Determine association type
      let type: TaskAssociation['type'] = 'similar_task';
      let reasoning = `Similar task with ${Math.round(similarity * 100)}% similarity`;

      if (similarTask.progress.current >= similarTask.progress.target) {
        type = 'followup';
        reasoning = 'Completed prerequisite task';
      } else if (taskMemory.progress.current >= taskMemory.progress.target) {
        type = 'prerequisite';
        reasoning = 'Potential prerequisite task';
      }

      associations.push({
        type,
        taskId: similarTask.id,
        strength: similarity,
        reasoning,
        createdAt: Date.now(),
      });
    }

    taskMemory.associations = associations;

    console.log(
      `🔗 Updated associations for task ${taskId}: ${associations.length} associations`
    );
  }

  /**
   * Clean up inactive task memories
   */
  cleanupInactiveTasks(): void {
    const activeTasks: string[] = [];

    for (const [taskId, taskMemory] of this.taskMemories) {
      const timeSinceLastUpdate =
        Date.now() -
        taskMemory.history[taskMemory.history.length - 1]?.timestamp;

      if (
        timeSinceLastUpdate > this.config.patternLookback ||
        taskMemory.progress.current >= taskMemory.progress.target
      ) {
        // Apply context decay
        this.applyContextDecay(taskMemory);

        if (timeSinceLastUpdate > this.config.patternLookback * 2) {
          // Remove very old inactive tasks
          this.taskMemories.delete(taskId);
          console.log(`🗑️ Removed inactive task memory: ${taskId}`);
        } else {
          activeTasks.push(taskId);
        }
      } else {
        activeTasks.push(taskId);
      }
    }

    console.log(`🧹 Cleanup completed. Active tasks: ${activeTasks.length}`);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async updateTaskContext(
    taskMemory: CognitiveTaskMemory,
    context: Record<string, any>
  ): Promise<void> {
    // Update spatial context
    if (context.spatial) {
      taskMemory.context.spatial = context.spatial;
      await this.contextManager.updateSpatialContext(context.spatial, {
        relevance: 0.8,
      });
    }

    // Update temporal context
    if (context.temporal) {
      taskMemory.context.temporal = context.temporal;
      await this.contextManager.updateTemporalContext(context.temporal, {
        relevance: 0.6,
      });
    }

    // Update social context
    if (context.social) {
      taskMemory.context.social = context.social;
      await this.contextManager.updateSocialContext(context.social, {
        relevance: 0.7,
      });
    }

    // Update emotional context
    if (context.emotional) {
      taskMemory.context.emotional = context.emotional;
      await this.contextManager.updateEmotionalContext(context.emotional, {
        relevance: 0.5,
      });
    }

    // Update environmental context
    if (context.environmental) {
      taskMemory.context.environmental = context.environmental;
      await this.contextManager.updateEnvironmentalContext(
        context.environmental,
        {
          relevance: 0.6,
        }
      );
    }
  }

  private async updateTaskLearning(
    taskMemory: CognitiveTaskMemory,
    historyEntry: TaskHistoryEntry
  ): Promise<void> {
    const history = taskMemory.history;
    const learning = taskMemory.learning;

    // Update success rate
    const recentSuccesses = history
      .slice(-10)
      .filter((h) => h.outcome.success).length;
    learning.successRate =
      history.length > 0 ? recentSuccesses / Math.min(10, history.length) : 0.5;

    // Update average duration
    const recentDurations = history
      .slice(-10)
      .map((h) => h.duration)
      .filter((d) => d > 0);
    learning.averageDuration =
      recentDurations.length > 0
        ? recentDurations.reduce((sum, d) => sum + d, 0) /
          recentDurations.length
        : 0;

    // Update common failures
    const recentFailures = history.slice(-10).filter((h) => !h.outcome.success);
    const failureReasons = recentFailures
      .map((h) => h.outcome.learning || [])
      .flat();
    learning.commonFailures = this.extractCommonFailures(failureReasons);

    // Update skill level based on success rate
    learning.skillLevel = Math.max(
      0,
      Math.min(
        1,
        learning.skillLevel +
          (learning.successRate - 0.5) * this.config.learningRate
      )
    );

    // Update preferred strategies
    if (historyEntry.outcome.success) {
      const strategy = this.inferStrategyFromEntry(historyEntry);
      if (strategy && !learning.preferredStrategies.includes(strategy)) {
        learning.preferredStrategies.unshift(strategy);
        learning.preferredStrategies = learning.preferredStrategies.slice(0, 5);
      }
    }
  }

  private async generateTaskReflection(
    taskMemory: CognitiveTaskMemory,
    historyEntry: TaskHistoryEntry
  ): Promise<void> {
    const reflection: TaskReflection = {
      timestamp: Date.now(),
      type: historyEntry.outcome.success ? 'success' : 'failure',
      content: this.generateReflectionContent(taskMemory, historyEntry),
      insights: this.extractInsights(taskMemory, historyEntry),
      lessons: historyEntry.outcome.learning || [],
      emotionalState: this.inferEmotionalState(historyEntry),
      confidence: taskMemory.learning.successRate,
    };

    taskMemory.reflections.push(reflection);

    // Limit reflections
    if (taskMemory.reflections.length > 20) {
      taskMemory.reflections = taskMemory.reflections.slice(-20);
    }
  }

  private calculateTaskSimilarity(
    task: CognitiveTask,
    taskMemory: CognitiveTaskMemory
  ): number {
    // Simple similarity calculation based on task properties
    let similarity = 0;
    let factors = 0;

    // Type similarity
    if (task.type === taskMemory.task.type) {
      similarity += 0.3;
    }
    factors++;

    // Complexity similarity
    if (task.complexity === taskMemory.task.complexity) {
      similarity += 0.2;
    }
    factors++;

    // Context similarity (simplified)
    const contextSimilarity = this.calculateContextSimilarity(
      task.context,
      taskMemory.context
    );
    similarity += contextSimilarity * 0.4;
    factors++;

    // Priority similarity
    const priorityDiff = Math.abs(task.priority - taskMemory.task.priority);
    const prioritySimilarity = Math.max(0, 1 - priorityDiff);
    similarity += prioritySimilarity * 0.1;
    factors++;

    return similarity / factors;
  }

  private calculateContextSimilarity(
    context1: Record<string, any>,
    context2: Record<string, any>
  ): number {
    // Simplified context similarity
    const keys1 = Object.keys(context1);
    const keys2 = Object.keys(context2);

    if (keys1.length === 0 && keys2.length === 0) return 1;
    if (keys1.length === 0 || keys2.length === 0) return 0;

    const commonKeys = keys1.filter((key) => keys2.includes(key));
    return commonKeys.length / Math.max(keys1.length, keys2.length);
  }

  private generateSimilarityReasoning(
    task: CognitiveTask,
    taskMemory: CognitiveTaskMemory
  ): string {
    const reasons: string[] = [];

    if (task.type === taskMemory.task.type) {
      reasons.push(`Same task type: ${task.type}`);
    }

    if (task.complexity === taskMemory.task.complexity) {
      reasons.push(`Same complexity level: ${task.complexity}`);
    }

    if (task.priority === taskMemory.task.priority) {
      reasons.push(`Same priority level: ${task.priority}`);
    }

    return reasons.join(', ') || 'Contextual similarity';
  }

  private calculateProgressConfidence(taskMemory: CognitiveTaskMemory): number {
    const { history, learning } = taskMemory;

    if (history.length === 0) return 0.5;

    // Base confidence on success rate
    const recentHistory = history.slice(-5);
    const recentSuccessRate =
      recentHistory.filter((h) => h.outcome.success).length /
      recentHistory.length;

    // Adjust for skill level
    const skillAdjustment = learning.skillLevel * 0.2;

    // Adjust for history size
    const historyAdjustment = Math.min(0.3, history.length / 10);

    return Math.min(
      0.9,
      recentSuccessRate + skillAdjustment + historyAdjustment
    );
  }

  private extractCommonFailures(failureReasons: string[]): string[] {
    const failureCounts: Record<string, number> = {};

    failureReasons.forEach((reason) => {
      failureCounts[reason] = (failureCounts[reason] || 0) + 1;
    });

    return Object.entries(failureCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([reason]) => reason);
  }

  private inferStrategyFromEntry(entry: TaskHistoryEntry): string {
    // Infer strategy from context and outcome
    if (entry.context.environmental?.threats?.length > 0) {
      return 'cautious_approach';
    }

    if (entry.context.social?.entities?.length > 0) {
      return 'collaborative_approach';
    }

    if (entry.duration < 30000) {
      // Less than 30 seconds
      return 'efficient_approach';
    }

    return 'standard_approach';
  }

  private generateReflectionContent(
    taskMemory: CognitiveTaskMemory,
    historyEntry: TaskHistoryEntry
  ): string {
    const { task, progress } = taskMemory;

    if (historyEntry.outcome.success) {
      return `Successfully made progress on ${task.type} task. Current progress: ${(progress.current * 100).toFixed(1)}%.`;
    } else {
      return `Encountered challenges with ${task.type} task. Need to adapt approach for better results.`;
    }
  }

  private extractInsights(
    taskMemory: CognitiveTaskMemory,
    historyEntry: TaskHistoryEntry
  ): string[] {
    const insights: string[] = [];

    if (historyEntry.outcome.success) {
      insights.push(`Strategy is working for ${taskMemory.task.type} tasks`);
    } else {
      insights.push(
        `Need to revise approach for ${taskMemory.task.type} tasks`
      );
    }

    if (taskMemory.learning.skillLevel > 0.7) {
      insights.push('High skill level achieved for this task type');
    }

    if (taskMemory.history.length > 5) {
      insights.push('Have accumulated significant experience with this task');
    }

    return insights;
  }

  private inferEmotionalState(historyEntry: TaskHistoryEntry): string {
    const { emotionalImpact } = historyEntry.outcome;

    if (emotionalImpact > 0.5) return 'positive';
    if (emotionalImpact < -0.5) return 'negative';
    return 'neutral';
  }

  private applyContextDecay(taskMemory: CognitiveTaskMemory): void {
    // Apply decay to context relevance
    const decayFactor = Math.pow(1 - this.config.contextDecayRate, 1);

    // Decay would be applied to context frames in the context manager
    console.log(`⏰ Applied context decay to task: ${taskMemory.id}`);
  }
}
