/**
 * Skill Composer Adapter - Integrates SkillComposer with Planning System
 *
 * This adapter bridges the gap between the autonomous SkillComposer system
 * and the existing conscious bot planning architecture, enabling:
 * - Dynamic skill composition from primitive actions
 * - Integration with existing skill registry
 * - Seamless planning system integration
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
// Temporary local type definitions until @conscious-bot/memory is available
export class SkillRegistry {
  constructor() {}
  register(name: string, skill: any): void {
    console.log(`Registered skill: ${name}`);
  }
  registerSkill(skill: any): void {
    console.log(`Registered skill: ${skill.name}`);
  }
  getAllSkills(): any[] {
    return [];
  }
  recordSkillUsage(skillId: string, success: boolean, duration: number): void {
    console.log(
      `Recorded skill usage: ${skillId}, success: ${success}, duration: ${duration}`
    );
  }
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  metadata: SkillMetadata;
  preconditions?: any;
  postconditions?: any;
  argsSchema?: any;
  implementation?: any;
  tests?: any;
  createdAt?: number;
  updatedAt?: number;
}

export interface SkillMetadata {
  tags: string[];
  difficulty: number;
  category: string;
  successRate?: number;
  complexity?: string;
  usageCount?: number;
  averageExecutionTime?: number;
  lastUsed?: number;
  dependencies?: string[];
  transferable?: boolean;
}
import { SkillComposer, ComposedSkill, ExecutionContext } from './types';
import { Goal, GoalType, GoalStatus } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface ComposedSkillAdapter {
  id: string;
  name: string;
  description: string;
  originalComposedSkill: ComposedSkill;
  skillRegistry: Skill;
  executionPlan: ExecutionStep[];
  metadata: SkillMetadata;
}

export interface ExecutionStep {
  stepId: string;
  leafId: string;
  inputs: Record<string, any>;
  expectedOutputs: string[];
  dependencies: string[];
  fallbackStrategy?: string;
}

export interface SkillCompositionRequest {
  goal: Goal;
  context: SkillCompositionContext;
  preferences?: {
    maxComplexity?: number;
    preferSimple?: boolean;
    allowFallbacks?: boolean;
  };
}

export interface SkillCompositionContext {
  worldState: Record<string, any>;
  availableResources: Record<string, number>;
  timeConstraints: {
    urgency: 'low' | 'medium' | 'high' | 'emergency';
    deadline?: number;
    maxPlanningTime: number;
  };
  botCapabilities: {
    availableLeaves: string[];
    currentHealth: number;
    currentPosition: [number, number, number];
  };
}

export interface SkillCompositionResult {
  success: boolean;
  composedSkill?: ComposedSkillAdapter;
  fallbackSkills?: string[];
  reasoning: string;
  estimatedSuccess: number;
  complexity: number;
}

// ============================================================================
// Skill Composer Adapter Implementation
// ============================================================================

export class SkillComposerAdapter extends EventEmitter {
  private skillComposer: SkillComposer;
  private skillRegistry: SkillRegistry;
  private compositionCache: Map<string, ComposedSkillAdapter> = new Map();
  private goalMapping: Map<GoalType, string[]> = new Map();

  constructor(skillComposer: SkillComposer, skillRegistry: SkillRegistry) {
    super();
    this.skillComposer = skillComposer;
    this.skillRegistry = skillRegistry;
    this.initializeGoalMapping();
    this.setupEventHandlers();
  }

  /**
   * Initialize mapping between goal types and skill requirements
   */
  private initializeGoalMapping(): void {
    this.goalMapping.set(GoalType.SURVIVAL, [
      'safety_assessment',
      'movement',
      'resource_gathering',
    ]);
    this.goalMapping.set(GoalType.SAFETY, ['safety_assessment', 'movement']);
    this.goalMapping.set(GoalType.EXPLORATION, [
      'movement',
      'safety_assessment',
    ]);
    this.goalMapping.set(GoalType.REACH_LOCATION, [
      'movement',
      'safety_assessment',
    ]);
    this.goalMapping.set(GoalType.ACQUIRE_ITEM, [
      'resource_gathering',
      'movement',
    ]);
    this.goalMapping.set(GoalType.SURVIVE_THREAT, [
      'safety_assessment',
      'movement',
    ]);
    this.goalMapping.set(GoalType.CREATIVITY, [
      'crafting',
      'resource_gathering',
    ]);
    this.goalMapping.set(GoalType.ACHIEVEMENT, [
      'crafting',
      'resource_gathering',
      'movement',
    ]);
  }

  /**
   * Set up event handlers for monitoring and debugging
   */
  private setupEventHandlers(): void {
    this.skillComposer.on('skillComposed', (skill: ComposedSkill) => {
      this.emit('skillComposed', skill);
      console.log(`🎯 Skill composed: ${skill.name}`);
    });

    this.skillComposer.on('compositionError', (error: Error) => {
      this.emit('compositionError', error);
      console.error(`❌ Skill composition error: ${error.message}`);
    });
  }

  /**
   * Compose skills for a specific goal
   */
  async composeSkillsForGoal(
    request: SkillCompositionRequest
  ): Promise<SkillCompositionResult> {
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(request.goal, request.context);
      if (this.compositionCache.has(cacheKey)) {
        const cached = this.compositionCache.get(cacheKey)!;
        return {
          success: true,
          composedSkill: cached,
          reasoning: 'Retrieved from composition cache',
          estimatedSuccess: cached.metadata.successRate ?? 0.8,
          complexity:
            typeof cached.metadata.complexity === 'string'
              ? parseInt(cached.metadata.complexity, 10) || 5
              : (cached.metadata.complexity ?? 5),
        };
      }

      // Convert goal to skill composition request
      const goalDescription = this.convertGoalToDescription(request.goal);
      const executionContext = this.convertContextToExecutionContext(
        request.context
      );

      // Attempt skill composition
      const composedSkill = await this.skillComposer.composeLeaves(
        goalDescription,
        executionContext
      );

      if (!composedSkill) {
        return this.handleCompositionFailure(
          request,
          'No compatible skill combination found'
        );
      }

      // Create adapter for the composed skill
      const skillAdapter = await this.createSkillAdapter(
        composedSkill,
        request.goal
      );

      // Cache the result
      this.compositionCache.set(cacheKey, skillAdapter);

      // Register with skill registry if it's a new composition
      await this.registerComposedSkill(skillAdapter);

      return {
        success: true,
        composedSkill: skillAdapter,
        reasoning: 'Successfully composed new skill combination',
        estimatedSuccess: skillAdapter.metadata.successRate ?? 0.8,
        complexity:
          typeof skillAdapter.metadata.complexity === 'string'
            ? parseInt(skillAdapter.metadata.complexity, 10) || 5
            : (skillAdapter.metadata.complexity ?? 5),
      };
    } catch (error) {
      return this.handleCompositionFailure(
        request,
        `Composition error: ${error}`
      );
    }
  }

  /**
   * Convert a Goal to a natural language description for skill composition
   */
  private convertGoalToDescription(goal: Goal): string {
    // Use goal description if available, otherwise generate from type
    if (goal.description && goal.description.trim()) {
      return goal.description;
    }

    // Generate description from goal type
    const descriptions: Record<GoalType, string> = {
      [GoalType.SURVIVAL]: 'survive and maintain safety',
      [GoalType.SAFETY]: 'assess and respond to threats',
      [GoalType.EXPLORATION]: 'explore new areas safely',
      [GoalType.REACH_LOCATION]: 'move to target location',
      [GoalType.ACQUIRE_ITEM]: 'gather and collect resources',
      [GoalType.SURVIVE_THREAT]: 'avoid or defend against threats',
      [GoalType.CREATIVITY]: 'create and build new items',
      [GoalType.ACHIEVEMENT]: 'accomplish challenging tasks',
      [GoalType.SOCIAL]: 'interact with other entities',
      [GoalType.CURIOSITY]: 'investigate and learn',
      [GoalType.RESOURCE_GATHERING]: 'gather and collect resources',
      [GoalType.FARMING]: 'cultivate and manage crops',
      [GoalType.CONTAINER_MANAGEMENT]: 'organize and manage storage',
      [GoalType.WORLD_MANIPULATION]: 'modify and interact with world blocks',
      [GoalType.REDSTONE_AUTOMATION]: 'create and manage redstone systems',
      [GoalType.STRUCTURE_CONSTRUCTION]: 'build and construct structures',
      [GoalType.ENVIRONMENTAL_CONTROL]: 'control and modify environment',
      [GoalType.INVENTORY_ORGANIZATION]: 'organize and manage inventory',
      [GoalType.MECHANISM_OPERATION]: 'operate and control mechanisms',
      [GoalType.COMBAT_TRAINING]: 'train and improve combat skills',
      [GoalType.AGRICULTURE_DEVELOPMENT]: 'develop and expand agriculture',
    };

    return descriptions[goal.type] || 'complete general task';
  }

  /**
   * Convert planning context to execution context
   */
  private convertContextToExecutionContext(
    context: SkillCompositionContext
  ): ExecutionContext {
    return {
      worldState: context.worldState,
      timeConstraints: {
        urgency: context.timeConstraints.urgency,
        deadline: context.timeConstraints.deadline,
        maxPlanningTime: context.timeConstraints.maxPlanningTime,
      },
      availableResources: context.availableResources,
      botCapabilities: context.botCapabilities,
      safetyConstraints: [],
    };
  }

  /**
   * Create a skill adapter that bridges ComposedSkill with SkillRegistry
   */
  private async createSkillAdapter(
    composedSkill: ComposedSkill,
    goal: Goal
  ): Promise<ComposedSkillAdapter> {
    const skillId = `composed_${goal.id}_${Date.now()}`;

    // Create skill registry entry
    const skillRegistry: Skill = {
      id: skillId,
      name: composedSkill.name,
      description: composedSkill.description,
      preconditions: this.createPreconditions(composedSkill, goal),
      postconditions: this.createPostconditions(composedSkill, goal),
      argsSchema: this.createArgsSchema(composedSkill),
      implementation: 'behavior_tree', // Will be implemented as behavior tree
      tests: [],
      metadata: this.convertMetadata(composedSkill.metadata),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return {
      id: skillId,
      name: composedSkill.name,
      description: composedSkill.description,
      originalComposedSkill: composedSkill,
      skillRegistry,
      executionPlan: composedSkill.executionPlan,
      metadata: this.convertMetadata(composedSkill.metadata),
    };
  }

  /**
   * Create preconditions for the composed skill
   */
  private createPreconditions(composedSkill: ComposedSkill, goal: Goal): any[] {
    const preconditions = [];

    // Add goal-specific preconditions
    if (goal.preconditions) {
      for (const precondition of goal.preconditions) {
        preconditions.push({
          id: `goal_${precondition.id}`,
          condition: precondition.condition,
          description: precondition.condition, // Use condition as description since Precondition doesn't have description
          isSatisfied: (state: any) => precondition.isSatisfied,
        });
      }
    }

    // Add leaf-specific preconditions
    for (const leaf of composedSkill.leaves) {
      for (const prereq of leaf.spec.composition.prerequisites) {
        preconditions.push({
          id: `leaf_${leaf.id}_${prereq}`,
          condition: prereq,
          description: `Requires ${prereq} to be available`,
          isSatisfied: (state: any) => this.checkPrerequisite(prereq, state),
        });
      }
    }

    return preconditions;
  }

  /**
   * Create postconditions for the composed skill
   */
  private createPostconditions(
    composedSkill: ComposedSkill,
    goal: Goal
  ): any[] {
    const postconditions = [];

    // Add goal effects as postconditions
    if (goal.effects) {
      for (const effect of goal.effects) {
        postconditions.push({
          id: `goal_${effect.id}`,
          condition: effect.description,
          description: `Achieves ${effect.description}`,
          expectedOutcome: { type: effect.type, magnitude: effect.magnitude },
        });
      }
    }

    // Add leaf output postconditions
    for (const leaf of composedSkill.leaves) {
      for (const output of leaf.spec.composition.outputTypes) {
        postconditions.push({
          id: `leaf_${leaf.id}_${output}`,
          condition: output,
          description: `Produces ${output} output`,
          expectedOutcome: { type: output, success: true },
        });
      }
    }

    return postconditions;
  }

  /**
   * Create argument schema for the composed skill
   */
  private createArgsSchema(composedSkill: ComposedSkill): any {
    return {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'Goal description' },
        context: { type: 'object', description: 'Execution context' },
        preferences: { type: 'object', description: 'Execution preferences' },
      },
      required: ['goal', 'context'],
    };
  }

  /**
   * Convert SkillComposer metadata to SkillRegistry metadata
   */
  private convertMetadata(metadata: any): SkillMetadata {
    return {
      difficulty: metadata.difficulty || 5,
      category: metadata.category || 'general',
      successRate: metadata.successRate || 0.8,
      usageCount: metadata.executionCount || 0,
      averageExecutionTime: metadata.context?.estimatedDuration || 5000,
      lastUsed: metadata.lastUsed || Date.now(),
      tags: metadata.tags || [],
      complexity: this.mapComplexity(metadata.complexity),
      dependencies: metadata.context?.leafCount
        ? Array.from(
            { length: metadata.context.leafCount },
            (_, i) => `leaf_${i}`
          )
        : [],
      transferable: true,
    };
  }

  /**
   * Map numeric complexity to categorical complexity
   */
  private mapComplexity(complexity: number): 'simple' | 'moderate' | 'complex' {
    if (complexity <= 3) return 'simple';
    if (complexity <= 6) return 'moderate';
    return 'complex';
  }

  /**
   * Check if a prerequisite is satisfied
   */
  private checkPrerequisite(prereq: string, state: any): boolean {
    // Basic prerequisite checking - can be enhanced
    const basicPrereqs = [
      'bot_spawned',
      'world_loaded',
      'time_system_available',
    ];
    return basicPrereqs.includes(prereq) || state[prereq] === true;
  }

  /**
   * Register the composed skill with the skill registry
   */
  private async registerComposedSkill(
    skillAdapter: ComposedSkillAdapter
  ): Promise<void> {
    try {
      this.skillRegistry.registerSkill(skillAdapter.skillRegistry);
      this.emit('skillRegistered', skillAdapter);
    } catch (error) {
      console.error('Failed to register composed skill:', error);
      this.emit('skillRegistrationError', { skillAdapter, error });
    }
  }

  /**
   * Generate cache key for composition requests
   */
  private generateCacheKey(
    goal: Goal,
    context: SkillCompositionContext
  ): string {
    const contextHash = JSON.stringify({
      goalType: goal.type,
      urgency: context.timeConstraints.urgency,
      resources: Object.keys(context.availableResources).sort(),
      capabilities: context.botCapabilities.availableLeaves.sort(),
    });

    return `${goal.id}_${this.hashString(contextHash)}`;
  }

  /**
   * Simple string hashing function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Handle composition failures
   */
  private handleCompositionFailure(
    request: SkillCompositionRequest,
    reason: string
  ): SkillCompositionResult {
    // Try to find fallback skills from existing registry
    const fallbackSkills = this.findFallbackSkills(request.goal);

    return {
      success: false,
      fallbackSkills: fallbackSkills.map((s) => s.id),
      reasoning: reason,
      estimatedSuccess: 0.3, // Low success for fallbacks
      complexity: 5,
    };
  }

  /**
   * Find fallback skills from existing registry
   */
  private findFallbackSkills(goal: Goal): Skill[] {
    const fallbacks: Skill[] = [];

    // Look for skills that might be related to the goal
    for (const skill of this.skillRegistry.getAllSkills()) {
      if (this.isSkillRelevantToGoal(skill, goal)) {
        fallbacks.push(skill);
      }
    }

    // Sort by relevance and success rate
    fallbacks.sort((a, b) => {
      const aRelevance = this.calculateGoalRelevance(a, goal);
      const bRelevance = this.calculateGoalRelevance(b, goal);
      if (aRelevance !== bRelevance) return bRelevance - aRelevance;
      return (b.metadata.successRate ?? 0.8) - (a.metadata.successRate ?? 0.8);
    });

    return fallbacks.slice(0, 3); // Return top 3 fallbacks
  }

  /**
   * Check if a skill is relevant to a goal
   */
  private isSkillRelevantToGoal(skill: Skill, goal: Goal): boolean {
    const goalKeywords = goal.description.toLowerCase().split(' ');
    const skillKeywords = skill.description.toLowerCase().split(' ');

    // Check for keyword overlap
    const overlap = goalKeywords.filter((keyword) =>
      skillKeywords.some(
        (skillKeyword) =>
          skillKeyword.includes(keyword) || keyword.includes(skillKeyword)
      )
    );

    return overlap.length > 0;
  }

  /**
   * Calculate relevance score between skill and goal
   */
  private calculateGoalRelevance(skill: Skill, goal: Goal): number {
    let score = 0;

    // Check tag overlap
    if (
      skill.metadata.tags.some((tag) =>
        goal.description.toLowerCase().includes(tag)
      )
    ) {
      score += 2;
    }

    // Check success rate
    score += skill.metadata.successRate ?? 0.8;

    // Check complexity match
    if (goal.priority > 7 && skill.metadata.complexity === 'complex')
      score += 1;
    if (goal.priority <= 3 && skill.metadata.complexity === 'simple')
      score += 1;

    return score;
  }

  /**
   * Get all available composed skills
   */
  getComposedSkills(): ComposedSkillAdapter[] {
    return Array.from(this.compositionCache.values());
  }

  /**
   * Clear composition cache
   */
  clearCache(): void {
    this.compositionCache.clear();
    this.emit('cacheCleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    // This is a simplified implementation - in practice you'd track actual hits
    return {
      size: this.compositionCache.size,
      hitRate: 0.8, // Placeholder
    };
  }
}
