/**
 * Skill Planner Adapter - Integrates SkillRegistry with HTN/GOAP Planning
 *
 * Bridges the gap between our Voyager-style skill registry and the existing
 * hierarchical planning system. Provides skill-based planning capabilities
 * that integrate seamlessly with the current HTN/GOAP architecture.
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
  recordSkillUsage(skillId: string, success: boolean, duration: number): void {
    console.log(
      `Recorded skill usage: ${skillId}, success: ${success}, duration: ${duration}`
    );
  }
  getAllSkills(): any[] {
    return [];
  }
  getSkill(id: string): any {
    return null;
  }
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  metadata: SkillMetadata;
  preconditions?: any;
}

export interface SkillMetadata {
  tags: string[];
  difficulty: number;
  category: string;
  complexity?: string;
  successRate: number;
  averageExecutionTime: number;
}
import {
  BehaviorTreeRunner,
  ToolExecutor,
} from '../behavior-trees/BehaviorTreeRunner';
import {
  Plan,
  PlanNode,
  PlanningContext,
} from '../hierarchical-planner/hrm-inspired-planner';

// ============================================================================
// Types
// ============================================================================

export interface SkillPlanningContext extends PlanningContext {
  availableSkills: Skill[];
  skillRegistry: SkillRegistry;
  worldState: Record<string, any>;
  goalRequirements: Record<string, any>;
}

export interface SkillPlan extends Plan {
  skillDecomposition: SkillDecomposition[];
  estimatedSkillSuccess: number;
  fallbackSkills: string[];
}

export interface SkillDecomposition {
  skillId: string;
  skill: Skill;
  preconditions: Record<string, any>;
  postconditions: Record<string, any>;
  estimatedDuration: number;
  priority: number;
  dependencies: string[];
}

export interface SkillExecutionResult {
  skillId: string;
  success: boolean;
  duration: number;
  worldStateChanges: Record<string, any>;
  error?: string;
  telemetry?: any;
}

// ============================================================================
// Skill Planner Adapter Implementation
// ============================================================================

export class SkillPlannerAdapter extends EventEmitter {
  private skillRegistry: SkillRegistry;
  private btRunner: BehaviorTreeRunner;
  private executionHistory: SkillExecutionResult[] = [];

  constructor(skillRegistry: SkillRegistry, btRunner: BehaviorTreeRunner) {
    super();
    this.skillRegistry = skillRegistry;
    this.btRunner = btRunner;
  }

  /**
   * Generate a skill-based plan for a given goal
   */
  async generateSkillPlan(
    goal: string,
    context: SkillPlanningContext
  ): Promise<SkillPlan> {
    const planId = `skill-plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Step 1: Find applicable skills for the goal
    const applicableSkills = this.findApplicableSkills(goal, context);

    // Step 2: Decompose goal into skill sequence
    const skillDecomposition = this.decomposeGoalIntoSkills(
      goal,
      applicableSkills,
      context
    );

    // Step 3: Create plan nodes from skills
    const planNodes = this.createPlanNodesFromSkills(
      skillDecomposition,
      planId
    );

    // Step 4: Calculate execution order and dependencies
    const executionOrder = this.calculateExecutionOrder(planNodes);

    // Step 5: Estimate overall success probability
    const estimatedSuccess = this.estimatePlanSuccess(skillDecomposition);

    // Step 6: Identify fallback skills
    const fallbackSkills = this.identifyFallbackSkills(
      applicableSkills,
      skillDecomposition
    );

    const plan: SkillPlan = {
      id: planId,
      goalId: goal,
      nodes: planNodes,
      executionOrder,
      confidence: estimatedSuccess,
      estimatedLatency: this.calculateTotalDuration(skillDecomposition),
      refinementCount: 0,
      createdAt: Date.now(),
      lastRefinedAt: Date.now(),
      skillDecomposition,
      estimatedSkillSuccess: estimatedSuccess,
      fallbackSkills,
    };

    return plan;
  }

  /**
   * Execute a skill-based plan
   */
  async executeSkillPlan(
    plan: SkillPlan,
    context: SkillPlanningContext
  ): Promise<{
    success: boolean;
    completedSkills: string[];
    failedSkills: string[];
    totalDuration: number;
    worldStateChanges: Record<string, any>;
  }> {
    const startTime = Date.now();
    const completedSkills: string[] = [];
    const failedSkills: string[] = [];
    const worldStateChanges: Record<string, any> = {};

    try {
      // Execute skills in order
      for (const nodeId of plan.executionOrder) {
        const node = plan.nodes.find((n) => n.id === nodeId);
        if (!node || node.type !== 'action') continue;

        const skillDecomp = plan.skillDecomposition.find(
          (sd) => sd.skillId === node.metadata?.skillId
        );
        if (!skillDecomp) continue;

        // Check preconditions
        if (
          !this.checkSkillPreconditions(skillDecomp.skill, context.worldState)
        ) {
          console.warn(
            `⚠️ Preconditions not met for skill: ${skillDecomp.skillId}`
          );
          failedSkills.push(skillDecomp.skillId);
          continue;
        }

        // Execute skill
        const result = await this.executeSkill(skillDecomp.skill, context);

        if (result.success) {
          completedSkills.push(skillDecomp.skillId);
          Object.assign(worldStateChanges, result.worldStateChanges);

          // Update world state for next skills
          Object.assign(context.worldState, result.worldStateChanges);

          // Record usage in skill registry
          this.skillRegistry.recordSkillUsage(
            skillDecomp.skillId,
            true,
            result.duration
          );
        } else {
          failedSkills.push(skillDecomp.skillId);
          this.skillRegistry.recordSkillUsage(
            skillDecomp.skillId,
            false,
            result.duration
          );

          // Try fallback skills if available
          const fallbackResult = await this.tryFallbackSkills(
            plan.fallbackSkills,
            skillDecomp,
            context
          );

          if (fallbackResult.success) {
            completedSkills.push(fallbackResult.skillId);
            Object.assign(worldStateChanges, fallbackResult.worldStateChanges);
            Object.assign(context.worldState, fallbackResult.worldStateChanges);
          }
        }
      }

      const totalDuration = Date.now() - startTime;
      const success = failedSkills.length === 0;

      return {
        success,
        completedSkills,
        failedSkills,
        totalDuration,
        worldStateChanges,
      };
    } catch (error) {
      console.error('Skill plan execution failed:', error);
      return {
        success: false,
        completedSkills,
        failedSkills: [...failedSkills, 'plan_execution_error'],
        totalDuration: Date.now() - startTime,
        worldStateChanges,
      };
    }
  }

  /**
   * Find skills applicable to a given goal
   */
  private findApplicableSkills(
    goal: string,
    context: SkillPlanningContext
  ): Skill[] {
    const allSkills = this.skillRegistry.getAllSkills();

    // Filter skills based on goal relevance
    return allSkills.filter((skill) => {
      const goalLower = goal.toLowerCase();
      const skillNameLower = skill.name.toLowerCase();
      const skillDescLower = skill.description.toLowerCase();

      // Enhanced keyword matching
      const goalKeywords = goalLower.split(' ');
      const skillKeywords = [
        ...skillNameLower.split(' '),
        ...skillDescLower.split(' '),
      ];

      // Check for exact matches or partial matches
      const keywordMatch = goalKeywords.some((keyword) => {
        if (keyword.length < 3) return false; // Skip very short keywords
        return skillKeywords.some(
          (skillKeyword) =>
            skillKeyword.includes(keyword) || keyword.includes(skillKeyword)
        );
      });

      // Also check if goal contains skill name or vice versa
      const nameMatch =
        goalLower.includes(skillNameLower) ||
        skillNameLower.includes(goalLower);
      const descMatch =
        goalLower.includes(skillDescLower) ||
        skillDescLower.includes(goalLower);

      // Check if preconditions are satisfied
      const preconditionsMet = skill.preconditions.every((precond: any) =>
        precond.isSatisfied(context.worldState)
      );

      return (keywordMatch || nameMatch || descMatch) && preconditionsMet;
    });
  }

  /**
   * Decompose goal into sequence of skills
   */
  private decomposeGoalIntoSkills(
    goal: string,
    applicableSkills: Skill[],
    context: SkillPlanningContext
  ): SkillDecomposition[] {
    const decomposition: SkillDecomposition[] = [];

    // Simple goal-to-skill mapping based on common patterns
    const goalPatterns = this.analyzeGoalPatterns(goal);

    for (const pattern of goalPatterns) {
      const matchingSkills = applicableSkills.filter((skill) =>
        this.skillMatchesPattern(skill, pattern)
      );

      if (matchingSkills.length > 0) {
        // Select best skill based on success rate and complexity
        const bestSkill = this.selectBestSkill(matchingSkills);

        decomposition.push({
          skillId: bestSkill.id,
          skill: bestSkill,
          preconditions: this.extractPreconditions(bestSkill),
          postconditions: this.extractPostconditions(bestSkill),
          estimatedDuration: this.estimateSkillDuration(bestSkill),
          priority: this.calculateSkillPriority(bestSkill, pattern),
          dependencies: this.identifySkillDependencies(
            bestSkill,
            decomposition
          ),
        });
      }
    }

    return decomposition;
  }

  /**
   * Create plan nodes from skill decomposition
   */
  private createPlanNodesFromSkills(
    decomposition: SkillDecomposition[],
    planId: string
  ): PlanNode[] {
    return decomposition.map((decomp, index) => ({
      id: `skill-node-${planId}-${index}`,
      type: 'action' as const,
      description: decomp.skill.description,
      status: 'pending' as const,
      priority: decomp.priority,
      estimatedDuration: decomp.estimatedDuration,
      dependencies: decomp.dependencies,
      constraints: [],
      metadata: {
        skillId: decomp.skillId,
        skill: decomp.skill,
        preconditions: decomp.preconditions,
        postconditions: decomp.postconditions,
      },
    }));
  }

  /**
   * Execute a single skill via Behavior Tree
   */
  private async executeSkill(
    skill: Skill,
    context: SkillPlanningContext
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();

    try {
      // Execute skill via Behavior Tree
      const result = await this.btRunner.runOption(
        skill.id,
        {}, // Default args for now
        {
          timeout: 30000, // Default timeout
          maxRetries: 2, // Default retries
          enableGuards: true,
          streamTicks: true,
        }
      );

      const duration = Date.now() - startTime;

      return {
        skillId: skill.id,
        success: result.status === 'success',
        duration,
        worldStateChanges: result.finalData?.worldStateChanges || {},
        telemetry: result.ticks,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        skillId: skill.id,
        success: false,
        duration,
        worldStateChanges: {},
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if skill preconditions are met
   */
  private checkSkillPreconditions(
    skill: Skill,
    worldState: Record<string, any>
  ): boolean {
    return skill.preconditions.every((precond: any) =>
      precond.isSatisfied(worldState)
    );
  }

  /**
   * Try fallback skills when primary skill fails
   */
  private async tryFallbackSkills(
    fallbackSkillIds: string[],
    failedSkill: SkillDecomposition,
    context: SkillPlanningContext
  ): Promise<SkillExecutionResult | { success: false }> {
    for (const fallbackId of fallbackSkillIds) {
      const fallbackSkill = this.skillRegistry.getSkill(fallbackId);
      if (!fallbackSkill) continue;

      // Check if fallback skill can achieve similar outcome
      if (
        this.canSkillAchieveOutcome(fallbackSkill, failedSkill.postconditions)
      ) {
        const result = await this.executeSkill(fallbackSkill, context);
        if (result.success) {
          return result;
        }
      }
    }

    return { success: false };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private analyzeGoalPatterns(goal: string): string[] {
    // Simple pattern analysis - in a full implementation, this would use NLP
    const patterns: string[] = [];

    if (
      goal.toLowerCase().includes('build') ||
      goal.toLowerCase().includes('construct')
    ) {
      patterns.push('building');
    }
    if (
      goal.toLowerCase().includes('gather') ||
      goal.toLowerCase().includes('collect')
    ) {
      patterns.push('gathering');
    }
    if (
      goal.toLowerCase().includes('craft') ||
      goal.toLowerCase().includes('make')
    ) {
      patterns.push('crafting');
    }
    if (
      goal.toLowerCase().includes('explore') ||
      goal.toLowerCase().includes('find')
    ) {
      patterns.push('exploration');
    }
    if (
      goal.toLowerCase().includes('survive') ||
      goal.toLowerCase().includes('shelter')
    ) {
      patterns.push('survival');
    }

    return patterns;
  }

  private skillMatchesPattern(skill: Skill, pattern: string): boolean {
    const skillType = this.classifySkillType(skill);
    return skillType === pattern;
  }

  private classifySkillType(skill: Skill): string {
    const description = skill.description.toLowerCase();

    if (description.includes('shelter') || description.includes('build'))
      return 'building';
    if (description.includes('chop') || description.includes('gather'))
      return 'gathering';
    if (description.includes('craft') || description.includes('smelt'))
      return 'crafting';
    if (description.includes('explore') || description.includes('probe'))
      return 'exploration';
    if (description.includes('retreat') || description.includes('emergency'))
      return 'survival';

    return 'general';
  }

  private selectBestSkill(skills: Skill[]): Skill {
    // Select skill with highest success rate and lowest complexity
    return skills.reduce((best, current) => {
      const bestComplexityScore = this.getComplexityScore(
        (best.metadata?.complexity ?? 'moderate') as 'simple' | 'moderate' | 'complex'
      );
      const currentComplexityScore = this.getComplexityScore(
        (current.metadata?.complexity ?? 'moderate') as 'simple' | 'moderate' | 'complex'
      );
      const bestScore = (best.metadata?.successRate ?? 0.5) * (1 - bestComplexityScore);
      const currentScore =
        (current.metadata?.successRate ?? 0.5) * (1 - currentComplexityScore);
      return currentScore > bestScore ? current : best;
    });
  }

  private getComplexityScore(
    complexity: 'simple' | 'moderate' | 'complex'
  ): number {
    switch (complexity) {
      case 'simple':
        return 0.2;
      case 'moderate':
        return 0.5;
      case 'complex':
        return 0.8;
      default:
        return 0.5;
    }
  }

  private extractPreconditions(skill: Skill): Record<string, any> {
    // Convert skill preconditions to world state format
    const preconditions: Record<string, any> = {};

    skill.preconditions.forEach((precond: any) => {
      // Simple parsing - in full implementation, use proper condition parser
      if (precond.condition.includes('>=')) {
        const [resource, amount] = precond.condition.split('>=');
        preconditions[resource.trim()] = { min: parseInt(amount.trim()) };
      } else if (precond.condition.includes('||')) {
        const alternatives = precond.condition.split('||');
        preconditions[precond.id] = {
          alternatives: alternatives.map((a: any) => a.trim()),
        };
      }
    });

    return preconditions;
  }

  private extractPostconditions(skill: Skill): Record<string, any> {
    // Convert skill postconditions to world state format
    const postconditions: Record<string, any> = {};

    skill.postconditions?.forEach((postcond: any) => {
      if (postcond.expectedOutcome) {
        Object.assign(postconditions, postcond.expectedOutcome);
      }
    });

    return postconditions;
  }

  private estimateSkillDuration(skill: Skill): number {
    // Estimate duration based on skill complexity and metadata
    const baseDuration = skill.metadata?.averageExecutionTime || 5000;
    const complexityScore = this.getComplexityScore(skill.metadata?.complexity ?? 'moderate');
    const complexityMultiplier = 1 + complexityScore;
    return Math.round(baseDuration * complexityMultiplier);
  }

  private calculateSkillPriority(skill: Skill, pattern: string): number {
    // Calculate priority based on skill success rate and pattern importance
    const successRate = skill.metadata?.successRate || 0.5;
    const patternImportance = this.getPatternImportance(pattern);
    return successRate * patternImportance;
  }

  private getPatternImportance(pattern: string): number {
    const importanceMap: Record<string, number> = {
      survival: 1.0,
      building: 0.8,
      gathering: 0.7,
      crafting: 0.6,
      exploration: 0.5,
      general: 0.3,
    };
    return importanceMap[pattern] || 0.5;
  }

  private identifySkillDependencies(
    skill: Skill,
    decomposition: SkillDecomposition[]
  ): string[] {
    // Identify dependencies based on skill preconditions and existing decomposition
    const dependencies: string[] = [];

    skill.preconditions.forEach((precond: any) => {
      // Check if any existing skill in decomposition provides this precondition
      decomposition.forEach((decomp) => {
        if (this.skillProvidesPrecondition(decomp.skill, precond.condition)) {
          dependencies.push(decomp.skillId);
        }
      });
    });

    return dependencies;
  }

  private skillProvidesPrecondition(skill: Skill, condition: string): boolean {
    return skill.postconditions?.some(
      (postcond: any) =>
        postcond.condition.includes(condition) ||
        (postcond.expectedOutcome &&
          Object.keys(postcond.expectedOutcome).some((key: any) =>
            condition.includes(key)
          ))
    );
  }

  private calculateExecutionOrder(nodes: PlanNode[]): string[] {
    // Simple topological sort for execution order
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (nodeId: string) => {
      if (visiting.has(nodeId)) {
        throw new Error('Circular dependency detected');
      }
      if (visited.has(nodeId)) return;

      visiting.add(nodeId);

      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        node.dependencies.forEach((dep) => visit(dep));
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      order.push(nodeId);
    };

    nodes.forEach((node) => visit(node.id));
    return order;
  }

  private estimatePlanSuccess(decomposition: SkillDecomposition[]): number {
    if (decomposition.length === 0) return 0;

    // Calculate overall success probability
    const successRates = decomposition.map(
      (decomp) => decomp.skill.metadata?.successRate || 0.5
    );

    return successRates.reduce((product, rate) => product * rate, 1);
  }

  private calculateTotalDuration(decomposition: SkillDecomposition[]): number {
    return decomposition.reduce(
      (total, decomp) => total + decomp.estimatedDuration,
      0
    );
  }

  private identifyFallbackSkills(
    applicableSkills: Skill[],
    decomposition: SkillDecomposition[]
  ): string[] {
    // Find alternative skills that could achieve similar outcomes
    const usedSkillIds = new Set(decomposition.map((d) => d.skillId));
    const fallbacks: string[] = [];

    applicableSkills.forEach((skill) => {
      if (!usedSkillIds.has(skill.id)) {
        // Check if skill could be a fallback for any used skill
        decomposition.forEach((decomp) => {
          if (this.canSkillAchieveOutcome(skill, decomp.postconditions)) {
            fallbacks.push(skill.id);
          }
        });
      }
    });

    return Array.from(new Set(fallbacks)); // Remove duplicates
  }

  private canSkillAchieveOutcome(
    skill: Skill,
    postconditions: Record<string, any>
  ): boolean {
    return skill.postconditions?.some((postcond: any) => {
      if (postcond.expectedOutcome) {
        return Object.keys(postcond.expectedOutcome).some((key: any) =>
          Object.keys(postconditions).includes(key)
        );
      }
      return false;
    });
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(): {
    totalExecutions: number;
    successRate: number;
    averageDuration: number;
    mostUsedSkills: string[];
  } {
    const totalExecutions = this.executionHistory.length;
    const successfulExecutions = this.executionHistory.filter(
      (r) => r.success
    ).length;
    const successRate =
      totalExecutions > 0 ? successfulExecutions / totalExecutions : 0;
    const averageDuration =
      totalExecutions > 0
        ? this.executionHistory.reduce((sum, r) => sum + r.duration, 0) /
          totalExecutions
        : 0;

    const skillUsage = new Map<string, number>();
    this.executionHistory.forEach((r) => {
      skillUsage.set(r.skillId, (skillUsage.get(r.skillId) || 0) + 1);
    });

    const mostUsedSkills = Array.from(skillUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([skillId]) => skillId);

    return {
      totalExecutions,
      successRate,
      averageDuration,
      mostUsedSkills,
    };
  }
}
