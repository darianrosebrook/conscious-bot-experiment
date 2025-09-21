/**
 * Task-Oriented Integration Implementation
 *
 * Concrete implementation of task-oriented patterns within the conscious-bot architecture,
 * providing immediate task execution capabilities while maintaining cognitive depth.
 *
 * @author @darianrosebrook
 */

import { CognitiveTaskIntegration } from './cognitive-integration';
import {
  SafetyLevel,
  TaskDefinition,
  TaskExecutionContext,
  TaskType,
} from './types';

/**
 * Task executor interface for immediate task execution
 */
export interface TaskExecutor {
  execute(task: TaskDefinition, context: TaskExecutionContext): Promise<any>;
  canExecute(task: TaskDefinition): boolean;
  estimateDuration(task: TaskDefinition): number;
}

/**
 * Concrete implementation of cognitive task integration
 * using task-oriented execution patterns
 */
export class TaskOrientedCognitiveIntegration
  implements CognitiveTaskIntegration
{
  private taskExecutors: Map<string, TaskExecutor> = new Map();
  private skillLevels: Map<string, number> = new Map();
  private currentGoals: any[] = [];
  private memory: any[] = [];

  constructor() {
    this.initializeDefaultSkills();
  }

  /**
   * Convert external task to cognitive task
   */
  externalTaskToCognitive(
    task: TaskDefinition,
    context: TaskExecutionContext
  ): any {
    // Create a cognitive task that incorporates both external command and internal context
    const cognitiveTask = {
      id: task.id,
      type: 'external_command',
      source: 'user_command',
      priority: task.priority || 0.5,
      urgency: this.calculateUrgency(task, context),
      reasoning: this.generateCognitiveReasoning(task, context),
      emotionalContext: this.assessEmotionalContext(task, context),
      memoryIntegration: this.integrateWithMemory(task),
      executionPlan: this.createExecutionPlan(task, context),
      fallbackStrategies: this.generateFallbackStrategies(task, context),
      socialImplications: this.assessSocialImplications(task, context),
      timestamp: Date.now(),
    };

    // Store in memory for future reference
    this.memory.push({
      type: 'external_command',
      task: cognitiveTask,
      context: context,
      timestamp: Date.now(),
    });

    return cognitiveTask;
  }

  /**
   * Convert cognitive goal to executable task
   */
  cognitiveGoalToTask(
    goal: any,
    context: TaskExecutionContext
  ): TaskDefinition {
    // Convert internal cognitive goal to concrete task
    const task: TaskDefinition = {
      id: `cognitive_${Date.now()}`,
      type: this.mapGoalTypeToTaskType(goal.type) as TaskType,
      parameters: this.extractTaskParameters(goal, context),
      priority: goal.priority || 0.5,
      timeout: this.calculateTimeout(goal),
      safety_level: this.assessSafetyLevel(goal, context) as SafetyLevel,
      estimated_duration: this.estimateDuration(goal, context),
      dependencies: this.identifyDependencies(goal, context),
      fallback_actions: this.generateFallbackActions(goal, context),
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: {
        source: 'cognitive_goal',
        originalGoal: goal,
        reasoning: goal.reasoning,
      },
    };

    return task;
  }

  /**
   * Merge external and internal task priorities
   */
  mergeTaskPriorities(
    externalPriority: number,
    internalPriority: number
  ): number {
    // Weight external commands slightly higher to maintain responsiveness
    const externalWeight = 0.6;
    const internalWeight = 0.4;

    const mergedPriority =
      externalPriority * externalWeight + internalPriority * internalWeight;

    // Apply cognitive adjustments based on current state
    const cognitiveAdjustment = this.calculateCognitiveAdjustment(
      externalPriority,
      internalPriority
    );

    return Math.min(1.0, Math.max(0.0, mergedPriority + cognitiveAdjustment));
  }

  /**
   * Register a task executor
   */
  registerTaskExecutor(taskType: string, executor: TaskExecutor): void {
    this.taskExecutors.set(taskType, executor);
  }

  /**
   * Get available task executors
   */
  getAvailableExecutors(): string[] {
    return Array.from(this.taskExecutors.keys());
  }

  /**
   * Execute a task using immediate execution style
   */
  async executeTask(
    task: TaskDefinition,
    context: TaskExecutionContext
  ): Promise<any> {
    const executor = this.taskExecutors.get(task.type);

    if (!executor) {
      throw new Error(`No executor available for task type: ${task.type}`);
    }

    if (!executor.canExecute(task)) {
      throw new Error(`Task cannot be executed: ${task.id}`);
    }

    // Log execution for memory
    this.memory.push({
      type: 'task_execution',
      task: task,
      context: context,
      timestamp: Date.now(),
    });

    return await executor.execute(task, context);
  }

  /**
   * Calculate urgency based on task and context
   */
  private calculateUrgency(
    task: TaskDefinition,
    context: TaskExecutionContext
  ): number {
    let urgency = task.priority || 0.5;

    // Environmental factors
    if (context.environmental_context.threat_level > 0.8) {
      urgency += 0.2;
    }

    if (context.environmental_context.time_of_day === 'night') {
      urgency += 0.1;
    }

    // Resource availability
    if (
      task.parameters.resource &&
      !context.available_resources[task.parameters.resource]?.available
    ) {
      urgency += 0.15;
    }

    // Social factors
    if (context.social_context.nearby_players.length > 0) {
      urgency += 0.1;
    }

    return Math.min(1.0, urgency);
  }

  /**
   * Generate cognitive reasoning for task
   */
  private generateCognitiveReasoning(
    task: TaskDefinition,
    context: TaskExecutionContext
  ): string {
    const reasons: string[] = [];

    // Task-specific reasoning
    switch (task.type) {
      case 'gathering':
        reasons.push('Resource gathering supports survival and progress');
        if (task.parameters.resource) {
          reasons.push(
            `Need ${task.parameters.resource} for current objectives`
          );
        }
        break;
      case 'crafting':
        reasons.push('Crafting advances technological capabilities');
        if (task.parameters.item) {
          reasons.push(
            `Creating ${task.parameters.item} will improve efficiency`
          );
        }
        break;
      case 'navigation':
        reasons.push('Movement is necessary for exploration and safety');
        break;
      case 'combat':
        reasons.push('Defensive action required for survival');
        break;
      case 'social':
        reasons.push('Social interaction maintains positive relationships');
        break;
    }

    // Environmental reasoning
    if (context.environmental_context.threat_level > 0.7) {
      reasons.push('High threat environment requires immediate action');
    }

    if (context.environmental_context.time_of_day === 'night') {
      reasons.push('Night time conditions affect task execution');
    }

    return reasons.join('. ');
  }

  /**
   * Assess emotional context of task
   */
  private assessEmotionalContext(
    task: TaskDefinition,
    context: TaskExecutionContext
  ): any {
    const emotions: any = {
      confidence: 0.7,
      anxiety: 0.0,
      excitement: 0.0,
      caution: 0.0,
    };

    // Adjust based on environmental factors
    if (context.environmental_context.threat_level > 0.8) {
      emotions.anxiety += 0.3;
      emotions.confidence -= 0.2;
    }

    if (context.environmental_context.time_of_day === 'night') {
      emotions.caution += 0.2;
    }

    // Adjust based on task type
    if (task.type === 'combat') {
      emotions.anxiety += 0.2;
      emotions.caution += 0.3;
    }

    if (task.type === 'exploration') {
      emotions.excitement += 0.2;
    }

    // Normalize values
    Object.keys(emotions).forEach((key) => {
      emotions[key] = Math.min(1.0, Math.max(0.0, emotions[key]));
    });

    return emotions;
  }

  /**
   * Integrate task with memory
   */
  private integrateWithMemory(task: TaskDefinition): any {
    // Find similar tasks in memory
    const similarTasks = this.memory
      .filter((m) => m.type === 'task_execution' && m.task.type === task.type)
      .slice(-5); // Last 5 similar tasks

    const successRate =
      similarTasks.length > 0
        ? similarTasks.filter((t) => t.success !== false).length /
          similarTasks.length
        : 0.8; // Default confidence

    return {
      similarTasksFound: similarTasks.length,
      successRate,
      lastExecuted:
        similarTasks.length > 0
          ? similarTasks[similarTasks.length - 1].timestamp
          : null,
      confidence: successRate,
    };
  }

  /**
   * Create execution plan
   */
  private createExecutionPlan(
    task: TaskDefinition,
    context: TaskExecutionContext
  ): any {
    const plan: any = {
      steps: [] as string[],
      estimatedDuration: task.estimated_duration || 60000,
      requiredResources: [] as string[],
      potentialObstacles: [] as string[],
    };

    // Add task-specific steps
    switch (task.type) {
      case 'gathering':
        plan.steps = [
          'Locate target resource',
          'Navigate to resource location',
          'Extract resource using appropriate tool',
          'Return to safe location',
        ];
        plan.requiredResources = [task.parameters.tool_required].filter(
          Boolean
        );
        break;
      case 'crafting':
        plan.steps = [
          'Gather required materials',
          'Locate crafting station',
          'Execute crafting process',
          'Collect crafted item',
        ];
        break;
      case 'navigation':
        plan.steps = [
          'Calculate optimal path',
          'Navigate to destination',
          'Verify arrival',
        ];
        break;
    }

    // Add environmental considerations
    if (context.environmental_context.threat_level > 0.5) {
      plan.potentialObstacles.push('Hostile entities may interfere');
      plan.steps.unshift('Assess threat level and prepare defenses');
    }

    return plan;
  }

  /**
   * Generate fallback strategies
   */
  private generateFallbackStrategies(
    task: TaskDefinition,
    context: TaskExecutionContext
  ): string[] {
    const strategies: string[] = [];

    // Resource-based fallbacks
    if (task.parameters.resource) {
      strategies.push(`Find alternative source of ${task.parameters.resource}`);
      strategies.push(`Craft substitute for ${task.parameters.resource}`);
    }

    // Tool-based fallbacks
    if (task.parameters.tool_required) {
      strategies.push(`Use alternative tool for ${task.type}`);
      strategies.push(`Craft required tool first`);
    }

    // Environmental fallbacks
    if (context.environmental_context.threat_level > 0.7) {
      strategies.push('Seek shelter and wait for safer conditions');
      strategies.push('Request assistance from nearby players');
    }

    return strategies;
  }

  /**
   * Assess social implications
   */
  private assessSocialImplications(
    task: TaskDefinition,
    context: TaskExecutionContext
  ): any {
    return {
      affectsOthers: context.social_context.nearby_players.length > 0,
      requiresCooperation:
        task.type === 'social' || task.parameters.requires_help,
      socialRisk: this.calculateSocialRisk(task, context),
      socialBenefit: this.calculateSocialBenefit(task, context),
    };
  }

  /**
   * Calculate social risk
   */
  private calculateSocialRisk(
    task: TaskDefinition,
    context: TaskExecutionContext
  ): number {
    let risk = 0.0;

    if (
      task.type === 'combat' &&
      context.social_context.nearby_players.length > 0
    ) {
      risk += 0.3; // Risk of friendly fire or collateral damage
    }

    if (
      task.parameters.resource &&
      context.social_context.nearby_players.length > 0
    ) {
      risk += 0.1; // Risk of resource competition
    }

    return Math.min(1.0, risk);
  }

  /**
   * Calculate social benefit
   */
  private calculateSocialBenefit(
    task: TaskDefinition,
    context: TaskExecutionContext
  ): number {
    let benefit = 0.0;

    if (task.type === 'social') {
      benefit += 0.4;
    }

    if (
      task.type === 'crafting' &&
      context.social_context.nearby_players.length > 0
    ) {
      benefit += 0.2; // Can share crafted items
    }

    return Math.min(1.0, benefit);
  }

  /**
   * Map goal type to task type
   */
  private mapGoalTypeToTaskType(goalType: string): string {
    const mapping: Record<string, string> = {
      survival: 'gathering',
      safety: 'combat',
      exploration: 'navigation',
      social: 'social',
      progress: 'crafting',
      curiosity: 'exploration',
    };

    return mapping[goalType] || 'exploration';
  }

  /**
   * Extract task parameters from goal
   */
  private extractTaskParameters(goal: any, context: TaskExecutionContext): any {
    const parameters: any = {};

    // Map goal-specific parameters
    if (goal.resource) {
      parameters.resource = goal.resource;
    }

    if (goal.quantity) {
      parameters.quantity = goal.quantity;
    }

    if (goal.location) {
      parameters.destination = goal.location;
    }

    if (goal.target) {
      parameters.target = goal.target;
    }

    // Add environmental context
    if (context.environmental_context.threat_level > 0.7) {
      parameters.requires_defense = true;
    }

    return parameters;
  }

  /**
   * Calculate timeout for goal
   */
  private calculateTimeout(goal: any): number {
    const baseTimeout = 300000; // 5 minutes

    if (goal.urgency === 'high') {
      return baseTimeout * 0.5;
    }

    if (goal.urgency === 'low') {
      return baseTimeout * 2;
    }

    return baseTimeout;
  }

  /**
   * Assess safety level
   */
  private assessSafetyLevel(goal: any, context: TaskExecutionContext): string {
    if (
      goal.type === 'combat' ||
      context.environmental_context.threat_level > 0.8
    ) {
      return 'dangerous';
    }

    if (context.environmental_context.threat_level > 0.5) {
      return 'risky';
    }

    return 'safe';
  }

  /**
   * Estimate duration
   */
  private estimateDuration(goal: any, _context: TaskExecutionContext): number {
    const baseDuration = 60000; // 1 minute

    // Adjust based on goal complexity
    if (goal.complexity === 'high') {
      return baseDuration * 3;
    }

    if (goal.complexity === 'low') {
      return baseDuration * 0.5;
    }

    return baseDuration;
  }

  /**
   * Identify dependencies
   */
  private identifyDependencies(
    goal: any,
    _context: TaskExecutionContext
  ): string[] {
    const dependencies: string[] = [];

    // Resource dependencies
    if (goal.requires_tool) {
      dependencies.push(`obtain_${goal.requires_tool}`);
    }

    if (goal.requires_material) {
      dependencies.push(`gather_${goal.requires_material}`);
    }

    // Skill dependencies
    if (goal.requires_skill && !this.skillLevels.has(goal.requires_skill)) {
      dependencies.push(`learn_${goal.requires_skill}`);
    }

    return dependencies;
  }

  /**
   * Generate fallback actions
   */
  private generateFallbackActions(
    goal: any,
    context: TaskExecutionContext
  ): string[] {
    const actions: string[] = [];

    // Add goal-specific fallbacks
    if (goal.type === 'survival') {
      actions.push('seek_shelter');
      actions.push('find_alternative_food');
    }

    if (goal.type === 'safety') {
      actions.push('retreat_to_safe_location');
      actions.push('request_help');
    }

    return actions;
  }

  /**
   * Calculate cognitive adjustment
   */
  private calculateCognitiveAdjustment(
    externalPriority: number,
    internalPriority: number
  ): number {
    // Consider current cognitive load and emotional state
    const cognitiveLoad = this.assessCognitiveLoad();
    const emotionalState = this.assessEmotionalState();

    let adjustment = 0.0;

    // High cognitive load reduces priority for complex tasks
    if (cognitiveLoad > 0.8) {
      adjustment -= 0.1;
    }

    // Emotional state affects decision making
    if (emotionalState.anxiety > 0.7) {
      adjustment -= 0.05;
    }

    if (emotionalState.confidence > 0.8) {
      adjustment += 0.05;
    }

    return adjustment;
  }

  /**
   * Assess cognitive load
   */
  private assessCognitiveLoad(): number {
    // Simple heuristic based on recent task count
    const recentTasks = this.memory.filter(
      (m) => Date.now() - m.timestamp < 60000 // Last minute
    );

    return Math.min(1.0, recentTasks.length / 5);
  }

  /**
   * Assess emotional state
   */
  private assessEmotionalState(): any {
    // Aggregate emotional context from recent tasks
    const recentTasks = this.memory.filter(
      (m) => Date.now() - m.timestamp < 300000 // Last 5 minutes
    );

    const emotions = {
      confidence: 0.7,
      anxiety: 0.0,
      excitement: 0.0,
      caution: 0.0,
    };

    // Calculate average emotional state
    recentTasks.forEach((task) => {
      if (task.task?.emotionalContext) {
        Object.keys(emotions).forEach((key) => {
          emotions[key as keyof typeof emotions] +=
            task.task.emotionalContext[key as keyof typeof emotions] || 0;
        });
      }
    });

    // Normalize
    const count = Math.max(1, recentTasks.length);
    Object.keys(emotions).forEach((key) => {
      emotions[key as keyof typeof emotions] = Math.min(
        1.0,
        emotions[key as keyof typeof emotions] / count
      );
    });

    return emotions;
  }

  /**
   * Initialize default skills
   */
  private initializeDefaultSkills(): void {
    this.skillLevels.set('basic_movement', 1.0);
    this.skillLevels.set('basic_interaction', 1.0);
    this.skillLevels.set('basic_mining', 0.8);
    this.skillLevels.set('basic_crafting', 0.7);
    this.skillLevels.set('basic_combat', 0.6);
  }
}
