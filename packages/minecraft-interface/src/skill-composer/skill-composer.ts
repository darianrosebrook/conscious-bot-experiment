/**
 * Skill Composer - Combines multiple leaves into complex behaviors
 *
 * Implements Voyager-inspired skill composition that allows simple leaves
 * to be combined into more sophisticated autonomous behaviors while
 * maintaining emergent behavior characteristics.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { ComposableLeafSpec } from '../leaves/sensing-leaves';

// ============================================================================
// Core Types
// ============================================================================

/**
 * Represents a composable leaf with its metadata
 */
export interface ComposableLeaf {
  id: string;
  name: string;
  spec: ComposableLeafSpec;
  instance: any; // The actual leaf instance
}

/**
 * Input/output type definitions for composition
 */
export interface CompositionType {
  name: string;
  description: string;
  constraints: string[];
  examples: string[];
}

/**
 * Composition requirement for a goal
 */
export interface CompositionRequirement {
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  constraints: Record<string, any>;
  alternatives: string[];
}

/**
 * Compatible leaf combination
 */
export interface LeafCombination {
  leaves: ComposableLeaf[];
  inputOutputMapping: Map<string, string>; // Maps output types to input types
  estimatedComplexity: number;
  successProbability: number;
  executionOrder: string[];
}

/**
 * Composed skill ready for execution
 */
export interface ComposedSkill {
  id: string;
  name: string;
  description: string;
  leaves: ComposableLeaf[];
  executionPlan: ExecutionStep[];
  metadata: SkillMetadata;
  validation: ValidationResult;
}

/**
 * Execution step in a composed skill
 */
export interface ExecutionStep {
  stepId: string;
  leafId: string;
  inputs: Record<string, any>;
  expectedOutputs: string[];
  dependencies: string[];
  fallbackStrategy?: string;
}

/**
 * Skill metadata for tracking and improvement
 */
export interface SkillMetadata {
  creationTime: number;
  lastUsed: number;
  successRate: number;
  executionCount: number;
  complexity: number;
  tags: string[];
  context: Record<string, any>;
}

/**
 * Validation result for a composed skill
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * Execution context for skill composition
 */
export interface ExecutionContext {
  worldState: Record<string, any>;
  availableResources: string[];
  timeConstraints: {
    urgency: 'low' | 'medium' | 'high' | 'emergency';
    maxDuration: number;
  };
  safetyConstraints: string[];
  botCapabilities: string[];
}

// ============================================================================
// Skill Composer Implementation
// ============================================================================

/**
 * Main skill composer that combines leaves into complex behaviors
 */
export class SkillComposer extends EventEmitter {
  private availableLeaves: Map<string, ComposableLeaf> = new Map();
  private compositionRules: CompositionRule[] = [];
  private typeRegistry: Map<string, CompositionType> = new Map();

  constructor() {
    super();
    this.initializeDefaultTypes();
    this.initializeDefaultRules();
  }

  /**
   * Register a leaf for composition
   */
  registerLeaf(leaf: ComposableLeaf): void {
    this.availableLeaves.set(leaf.id, leaf);
    this.emit('leafRegistered', leaf);
  }

  /**
   * Unregister a leaf
   */
  unregisterLeaf(leafId: string): void {
    this.availableLeaves.delete(leafId);
    this.emit('leafUnregistered', leafId);
  }

  /**
   * Compose leaves to achieve a target goal
   */
  async composeLeaves(
    targetGoal: string,
    context: ExecutionContext
  ): Promise<ComposedSkill> {
    try {
      // Analyze goal requirements
      const requirements = await this.analyzeGoal(targetGoal, context);

      // Find compatible leaf combinations
      const combinations = this.findCompatibleCombinations(requirements);

      // Select best combination
      const bestCombination = this.selectBestCombination(combinations, context);

      // Create execution plan
      const executionPlan = this.createExecutionPlan(bestCombination, context);

      // Validate composition
      const validation = this.validateComposition(
        bestCombination,
        executionPlan
      );

      // Create composed skill
      const composedSkill: ComposedSkill = {
        id: this.generateSkillId(targetGoal),
        name: this.generateSkillName(targetGoal),
        description: this.generateSkillDescription(targetGoal, bestCombination),
        leaves: bestCombination.leaves,
        executionPlan,
        metadata: this.createSkillMetadata(bestCombination),
        validation,
      };

      this.emit('skillComposed', composedSkill);
      return composedSkill;
    } catch (error) {
      this.emit('compositionError', error);
      throw new Error(
        `Failed to compose leaves for goal: ${targetGoal}. ${error}`
      );
    }
  }

  /**
   * Analyze goal to determine requirements
   */
  private async analyzeGoal(
    goal: string,
    context: ExecutionContext
  ): Promise<CompositionRequirement[]> {
    const requirements: CompositionRequirement[] = [];

    // Parse goal for key requirements
    const goalLower = goal.toLowerCase();

    // Check for safety requirements first (higher priority)
    if (
      goalLower.includes('safety') ||
      goalLower.includes('safe') ||
      goalLower.includes('dangerous') ||
      goalLower.includes('hostile') ||
      goalLower.includes('combat') ||
      goalLower.includes('threat')
    ) {
      requirements.push({
        type: 'safety_assessment',
        priority: 'critical',
        constraints: { requireHostileDetection: true },
        alternatives: ['avoidance', 'defensive_positioning'],
      });
    }

    // Check for movement requirements
    if (
      goalLower.includes('move') ||
      goalLower.includes('go') ||
      goalLower.includes('travel') ||
      goalLower.includes('walk') ||
      goalLower.includes('run') ||
      goalLower.includes('jump')
    ) {
      requirements.push({
        type: 'movement',
        priority: 'high',
        constraints: { maxDistance: context.timeConstraints.maxDuration * 5 }, // Rough estimate
        alternatives: ['teleport', 'minecart', 'boat'],
      });
    }

    // Check for resource requirements
    if (
      goalLower.includes('mine') ||
      goalLower.includes('collect') ||
      goalLower.includes('gather') ||
      goalLower.includes('dig') ||
      goalLower.includes('harvest')
    ) {
      requirements.push({
        type: 'resource_gathering',
        priority: 'medium',
        constraints: { toolRequired: true },
        alternatives: ['trading', 'farming'],
      });
    }

    // Check for crafting requirements
    if (
      goalLower.includes('craft') ||
      goalLower.includes('build') ||
      goalLower.includes('create') ||
      goalLower.includes('make') ||
      goalLower.includes('construct')
    ) {
      requirements.push({
        type: 'crafting',
        priority: 'medium',
        constraints: { requireMaterials: true, requireWorkbench: true },
        alternatives: ['trading', 'finding'],
      });
    }

    // If no specific requirements found, add a general requirement
    if (requirements.length === 0) {
      requirements.push({
        type: 'general_task',
        priority: 'low',
        constraints: {},
        alternatives: ['basic_action'],
      });
    }

    return requirements;
  }

  /**
   * Find compatible leaf combinations
   */
  private findCompatibleCombinations(
    requirements: CompositionRequirement[]
  ): LeafCombination[] {
    const combinations: LeafCombination[] = [];

    console.log('🔍 Finding combinations for requirements:', requirements);

    // Group requirements by priority
    const criticalReqs = requirements.filter((r) => r.priority === 'critical');
    const highReqs = requirements.filter((r) => r.priority === 'high');
    const mediumReqs = requirements.filter((r) => r.priority === 'medium');
    const lowReqs = requirements.filter((r) => r.priority === 'low');

    console.log('📊 Requirements by priority:', {
      critical: criticalReqs.length,
      high: highReqs.length,
      medium: mediumReqs.length,
      low: lowReqs.length,
    });

    // Start with critical requirements
    for (const req of criticalReqs) {
      const compatibleLeaves = this.findLeavesForRequirement(req);
      console.log(
        `🔑 Critical requirement "${req.type}" found ${compatibleLeaves.length} compatible leaves`
      );
      if (compatibleLeaves.length > 0) {
        const reqCombinations = this.createCombinations(compatibleLeaves, req);
        console.log(
          `📦 Created ${reqCombinations.length} combinations for critical requirement`
        );
        combinations.push(...reqCombinations);
      }
    }

    // Add high priority requirements
    for (const req of highReqs) {
      const compatibleLeaves = this.findLeavesForRequirement(req);
      console.log(
        `🔑 High priority requirement "${req.type}" found ${compatibleLeaves.length} compatible leaves`
      );
      if (compatibleLeaves.length > 0) {
        const reqCombinations = this.createCombinations(compatibleLeaves, req);
        console.log(
          `📦 Created ${reqCombinations.length} combinations for high priority requirement`
        );
        combinations.push(...reqCombinations);
      }
    }

    // Add medium priority requirements
    for (const req of mediumReqs) {
      const compatibleLeaves = this.findLeavesForRequirement(req);
      console.log(
        `🔑 Medium priority requirement "${req.type}" found ${compatibleLeaves.length} compatible leaves`
      );
      if (compatibleLeaves.length > 0) {
        const reqCombinations = this.createCombinations(compatibleLeaves, req);
        console.log(
          `📦 Created ${reqCombinations.length} combinations for medium priority requirement`
        );
        combinations.push(...reqCombinations);
      }
    }

    // Add low priority requirements
    for (const req of lowReqs) {
      const compatibleLeaves = this.findLeavesForRequirement(req);
      console.log(
        `🔑 Low priority requirement "${req.type}" found ${compatibleLeaves.length} compatible leaves`
      );
      if (compatibleLeaves.length > 0) {
        const reqCombinations = this.createCombinations(compatibleLeaves, req);
        console.log(
          `📦 Created ${reqCombinations.length} combinations for low priority requirement`
        );
        combinations.push(...reqCombinations);
      }
    }

    console.log(`🎯 Total combinations found: ${combinations.length}`);

    // Merge compatible combinations
    return this.mergeCompatibleCombinations(combinations);
  }

  /**
   * Find leaves that satisfy a requirement
   */
  private findLeavesForRequirement(
    req: CompositionRequirement
  ): ComposableLeaf[] {
    const compatibleLeaves: ComposableLeaf[] = [];

    for (const leaf of this.availableLeaves.values()) {
      // Check if leaf outputs match requirement type
      if (leaf.spec.composition.outputTypes.includes(req.type)) {
        compatibleLeaves.push(leaf);
        continue;
      }

      // Check for partial matches
      if (this.hasPartialMatch(leaf, req)) {
        compatibleLeaves.push(leaf);
      }
    }

    // If no specific matches found, include leaves that can handle general requirements
    if (compatibleLeaves.length === 0) {
      for (const leaf of this.availableLeaves.values()) {
        // Include leaves that can handle general world state or have low complexity
        if (
          leaf.spec.composition.outputTypes.includes('world_state') ||
          leaf.spec.composition.complexity <= 3
        ) {
          compatibleLeaves.push(leaf);
        }
      }
    }

    return compatibleLeaves;
  }

  /**
   * Check for partial matches between leaf and requirement
   */
  private hasPartialMatch(
    leaf: ComposableLeaf,
    req: CompositionRequirement
  ): boolean {
    // Check if any output type is related to requirement
    for (const outputType of leaf.spec.composition.outputTypes) {
      if (this.typesAreRelated(outputType, req.type)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if two types are related
   */
  private typesAreRelated(type1: string, type2: string): boolean {
    // Simple type relationship checking
    const type1Lower = type1.toLowerCase();
    const type2Lower = type2.toLowerCase();

    // Check for common prefixes
    if (
      type1Lower.startsWith(type2Lower) ||
      type2Lower.startsWith(type1Lower)
    ) {
      return true;
    }

    // Check for semantic relationships
    const relationships: Record<string, string[]> = {
      movement: ['navigation', 'travel', 'position'],
      safety: ['threat', 'danger', 'protection'],
      resource: ['material', 'item', 'collection'],
      crafting: ['building', 'creation', 'assembly'],
      general_task: ['world_state', 'basic_action', 'utility'],
    };

    // Check for exact matches in relationships
    for (const [category, related] of Object.entries(relationships)) {
      if (related.includes(type1Lower) && related.includes(type2Lower)) {
        return true;
      }
    }

    // Check if either type is a general type that can handle most things
    if (
      type1Lower === 'general_task' ||
      type2Lower === 'general_task' ||
      type1Lower === 'world_state' ||
      type2Lower === 'world_state'
    ) {
      return true;
    }

    return false;
  }

  /**
   * Create combinations from compatible leaves
   */
  private createCombinations(
    leaves: ComposableLeaf[],
    requirement: CompositionRequirement
  ): LeafCombination[] {
    const combinations: LeafCombination[] = [];

    // Single leaf combinations
    for (const leaf of leaves) {
      combinations.push({
        leaves: [leaf],
        inputOutputMapping: new Map(),
        estimatedComplexity: leaf.spec.composition.complexity,
        successProbability: this.calculateSuccessProbability(
          leaf.spec.composition.complexity
        ),
        executionOrder: [leaf.id],
      });
    }

    // Multi-leaf combinations (up to 3 leaves for now)
    if (leaves.length > 1) {
      for (let i = 0; i < leaves.length - 1; i++) {
        for (let j = i + 1; j < leaves.length; j++) {
          const leaf1 = leaves[i];
          const leaf2 = leaves[j];

          if (this.canCombineLeaves(leaf1, leaf2)) {
            const combination = this.createLeafCombination([leaf1, leaf2]);
            if (combination) {
              combinations.push(combination);
            }
          }
        }
      }
    }

    return combinations;
  }

  /**
   * Check if two leaves can be combined
   */
  private canCombineLeaves(
    leaf1: ComposableLeaf,
    leaf2: ComposableLeaf
  ): boolean {
    // Check if leaves are marked as combinable
    if (
      !leaf1.spec.composition.combinableWith.includes('all_leaf_types') &&
      !leaf1.spec.composition.combinableWith.includes(leaf2.spec.name) &&
      !leaf2.spec.composition.combinableWith.includes('all_leaf_types') &&
      !leaf2.spec.composition.combinableWith.includes(leaf1.spec.name)
    ) {
      return false;
    }

    // Check input/output compatibility
    const leaf1Outputs = new Set(leaf1.spec.composition.outputTypes);
    const leaf2Inputs = new Set(leaf2.spec.composition.inputTypes);

    // Check for any overlap
    for (const output of leaf1Outputs) {
      if (leaf2Inputs.has(output)) {
        return true;
      }
    }

    // Check reverse direction
    const leaf2Outputs = new Set(leaf2.spec.composition.outputTypes);
    const leaf1Inputs = new Set(leaf1.spec.composition.inputTypes);

    for (const output of leaf2Outputs) {
      if (leaf1Inputs.has(output)) {
        return true;
      }
    }

    // If no direct I/O match, check if they can work together on general tasks
    if (
      leaf1.spec.composition.outputTypes.includes('world_state') ||
      leaf2.spec.composition.outputTypes.includes('world_state')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Create a combination from multiple leaves
   */
  private createLeafCombination(
    leaves: ComposableLeaf[]
  ): LeafCombination | null {
    try {
      // Calculate total complexity
      const totalComplexity = leaves.reduce(
        (sum, leaf) => sum + leaf.spec.composition.complexity,
        0
      );

      // Create input/output mapping
      const mapping = new Map<string, string>();
      for (let i = 0; i < leaves.length - 1; i++) {
        const currentLeaf = leaves[i];
        const nextLeaf = leaves[i + 1];

        // Find compatible outputs/inputs
        for (const output of currentLeaf.spec.composition.outputTypes) {
          if (nextLeaf.spec.composition.inputTypes.includes(output)) {
            mapping.set(output, nextLeaf.id);
          }
        }
      }

      // Determine execution order (simple dependency-based ordering)
      const executionOrder = this.determineExecutionOrder(leaves, mapping);

      // Calculate success probability (decreases with complexity)
      const baseSuccessRate = 0.8;
      const complexityPenalty = Math.min(totalComplexity * 0.05, 0.3);
      const successProbability = Math.max(
        baseSuccessRate - complexityPenalty,
        0.1
      );

      return {
        leaves,
        inputOutputMapping: mapping,
        estimatedComplexity: totalComplexity,
        successProbability,
        executionOrder,
      };
    } catch (error) {
      console.warn('Failed to create leaf combination:', error);
      return null;
    }
  }

  /**
   * Determine execution order for leaves
   */
  private determineExecutionOrder(
    leaves: ComposableLeaf[],
    mapping: Map<string, string>
  ): string[] {
    // Simple topological sort based on input/output dependencies
    const executionOrder: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (leafId: string) => {
      if (visiting.has(leafId)) {
        throw new Error('Circular dependency detected');
      }
      if (visited.has(leafId)) {
        return;
      }

      visiting.add(leafId);

      // Find leaves that depend on this one
      for (const [outputType, dependentLeafId] of mapping.entries()) {
        if (dependentLeafId === leafId) {
          // Find the leaf that produces this output
          const producerLeaf = leaves.find((l) =>
            l.spec.composition.outputTypes.includes(outputType)
          );
          if (producerLeaf && !visited.has(producerLeaf.id)) {
            visit(producerLeaf.id);
          }
        }
      }

      visiting.delete(leafId);
      visited.add(leafId);
      executionOrder.push(leafId);
    };

    // Visit all leaves
    for (const leaf of leaves) {
      if (!visited.has(leaf.id)) {
        visit(leaf.id);
      }
    }

    return executionOrder;
  }

  /**
   * Select the best combination based on context
   */
  private selectBestCombination(
    combinations: LeafCombination[],
    context: ExecutionContext
  ): LeafCombination {
    if (combinations.length === 0) {
      throw new Error('No compatible combinations found');
    }

    if (combinations.length === 1) {
      return combinations[0];
    }

    // Try to merge compatible combinations first
    const mergedCombination = this.mergeCombinations(combinations);
    if (mergedCombination) {
      return mergedCombination;
    }

    // Score combinations based on multiple factors
    const scoredCombinations = combinations.map((combination) => {
      let score = 0;

      // Prefer lower complexity for high urgency
      if (context.timeConstraints.urgency === 'emergency') {
        score += (10 - combination.estimatedComplexity) * 2;
      } else {
        score += 10 - combination.estimatedComplexity;
      }

      // Prefer higher success probability
      score += combination.successProbability * 10;

      // Prefer fewer leaves for faster execution
      score += (5 - combination.leaves.length) * 2;

      return { combination, score };
    });

    // Sort by score and return the best
    scoredCombinations.sort((a, b) => b.score - a.score);
    return scoredCombinations[0].combination;
  }

  /**
   * Try to merge multiple combinations into one
   */
  private mergeCombinations(
    combinations: LeafCombination[]
  ): LeafCombination | null {
    if (combinations.length < 2) {
      return null;
    }

    // Only merge if the combinations represent different requirements that can work together
    // Check if we have different requirement types that could form a workflow
    const requirementTypes = new Set<string>();
    for (const combination of combinations) {
      for (const leaf of combination.leaves) {
        // Extract requirement type from leaf output types
        for (const outputType of leaf.spec.composition.outputTypes) {
          if (
            outputType.includes('assessment') ||
            outputType.includes('movement') ||
            outputType.includes('gathering') ||
            outputType.includes('crafting')
          ) {
            requirementTypes.add(outputType);
          }
        }
      }
    }

    // Only merge if we have different requirement types that could form a workflow
    if (requirementTypes.size < 2) {
      return null;
    }

    // Try to merge combinations that have compatible leaves
    const allLeaves: ComposableLeaf[] = [];
    const allMappings = new Map<string, string>();

    for (const combination of combinations) {
      allLeaves.push(...combination.leaves);
      // Merge input/output mappings
      for (const [
        outputType,
        leafId,
      ] of combination.inputOutputMapping.entries()) {
        allMappings.set(outputType, leafId);
      }
    }

    // Remove duplicate leaves
    const uniqueLeaves = allLeaves.filter(
      (leaf, index, self) => index === self.findIndex((l) => l.id === leaf.id)
    );

    // Check if we can create a valid combination from all leaves
    if (uniqueLeaves.length > 1) {
      const mergedCombination = this.createLeafCombination(uniqueLeaves);
      if (mergedCombination && mergedCombination.leaves.length > 1) {
        console.log(
          `🔗 Successfully merged ${combinations.length} combinations into 1 with ${mergedCombination.leaves.length} leaves`
        );
        return mergedCombination;
      }
    }

    return null;
  }

  /**
   * Create execution plan from combination
   */
  private createExecutionPlan(
    combination: LeafCombination,
    context: ExecutionContext
  ): ExecutionStep[] {
    const executionPlan: ExecutionStep[] = [];

    for (const leafId of combination.executionOrder) {
      const leaf = combination.leaves.find((l) => l.id === leafId);
      if (!leaf) continue;

      // Determine inputs for this step
      const inputs: Record<string, any> = {};

      // Check if this leaf needs outputs from previous steps
      for (const [
        outputType,
        producerLeafId,
      ] of combination.inputOutputMapping.entries()) {
        if (producerLeafId === leafId) {
          // This leaf produces an output, find what needs it
          const consumerLeaf = combination.leaves.find((l) =>
            l.spec.composition.inputTypes.includes(outputType)
          );
          if (consumerLeaf) {
            inputs[outputType] = `output_from_${producerLeafId}`;
          }
        }
      }

      // Add context-based inputs
      if (leaf.spec.composition.inputTypes.includes('world_state')) {
        inputs.world_state = context.worldState;
      }

      if (leaf.spec.composition.inputTypes.includes('bot_position')) {
        inputs.bot_position = 'current_bot_position';
      }

      // Determine dependencies
      const dependencies: string[] = [];

      // Check if this leaf needs outputs from other leaves in the combination
      for (const otherLeaf of combination.leaves) {
        if (otherLeaf.id === leafId) continue;

        // Check if this leaf needs any output from the other leaf
        for (const inputType of leaf.spec.composition.inputTypes) {
          if (otherLeaf.spec.composition.outputTypes.includes(inputType)) {
            dependencies.push(otherLeaf.id);
            break;
          }
        }
      }

      // Determine expected outputs
      const expectedOutputs = leaf.spec.composition.outputTypes;

      executionPlan.push({
        stepId: `step_${leafId}`,
        leafId,
        inputs,
        expectedOutputs,
        dependencies,
        fallbackStrategy: this.determineFallbackStrategy(leaf, context),
      });
    }

    return executionPlan;
  }

  /**
   * Determine fallback strategy for a leaf
   */
  private determineFallbackStrategy(
    leaf: ComposableLeaf,
    context: ExecutionContext
  ): string | undefined {
    // Check if leaf has alternatives
    if (leaf.spec.composition.combinableWith.length > 1) {
      return 'alternative_leaf';
    }

    // Check if we can skip this step
    if (leaf.spec.composition.complexity <= 3) {
      return 'skip_step';
    }

    // Check if we can retry with different parameters
    if (leaf.spec.retries > 0) {
      return 'retry_with_backoff';
    }

    return undefined;
  }

  /**
   * Validate composition
   */
  private validateComposition(
    combination: LeafCombination,
    executionPlan: ExecutionStep[]
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check for circular dependencies
    try {
      this.detectCircularDependencies(executionPlan);
    } catch (error) {
      errors.push(`Circular dependency detected: ${error}`);
    }

    // Check complexity limits
    if (combination.estimatedComplexity > 8) {
      warnings.push('High complexity combination may be unreliable');
      suggestions.push('Consider breaking into smaller skills');
    }

    // Check success probability
    if (combination.successProbability < 0.5) {
      warnings.push('Low success probability');
      suggestions.push('Add error handling and fallback strategies');
    }

    // Check for missing prerequisites
    for (const leaf of combination.leaves) {
      for (const prereq of leaf.spec.composition.prerequisites) {
        if (!this.prerequisiteIsMet(prereq)) {
          errors.push(`Prerequisite not met: ${prereq}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Detect circular dependencies
   */
  private detectCircularDependencies(executionPlan: ExecutionStep[]): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (stepId: string) => {
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency at step: ${stepId}`);
      }
      if (visited.has(stepId)) {
        return;
      }

      visiting.add(stepId);

      const step = executionPlan.find((s) => s.stepId === stepId);
      if (step) {
        for (const dep of step.dependencies) {
          // Find the step that corresponds to this dependency
          const depStep = executionPlan.find((s) => s.leafId === dep);
          if (depStep) {
            visit(depStep.stepId);
          }
        }
      }

      visiting.delete(stepId);
      visited.add(stepId);
    };

    for (const step of executionPlan) {
      if (!visited.has(step.stepId)) {
        visit(step.stepId);
      }
    }
  }

  /**
   * Calculate success probability based on complexity
   */
  private calculateSuccessProbability(complexity: number): number {
    // Base success rate is 0.8
    // Complexity reduces success rate: each point above 1 reduces by 0.05
    // Minimum success rate is 0.3
    const reduction = Math.max(0, complexity - 1) * 0.05;
    return Math.max(0.3, 0.8 - reduction);
  }

  /**
   * Check if prerequisite is met
   */
  private prerequisiteIsMet(prereq: string): boolean {
    // Simple prerequisite checking - in practice this would be more sophisticated
    const basicPrereqs = [
      'bot_spawned',
      'world_loaded',
      'time_system_available',
    ];
    return basicPrereqs.includes(prereq);
  }

  /**
   * Generate unique skill ID
   */
  private generateSkillId(goal: string): string {
    const timestamp = Date.now();
    const sanitizedGoal = goal.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `composed_skill_${sanitizedGoal}_${timestamp}`;
  }

  /**
   * Generate skill name
   */
  private generateSkillName(goal: string): string {
    return `Composed: ${goal}`;
  }

  /**
   * Generate skill description
   */
  private generateSkillDescription(
    goal: string,
    combination: LeafCombination
  ): string {
    const leafNames = combination.leaves.map((l) => l.name).join(', ');
    return `Composed skill to achieve: ${goal}. Combines: ${leafNames}. Complexity: ${combination.estimatedComplexity}/10.`;
  }

  /**
   * Create skill metadata
   */
  private createSkillMetadata(combination: LeafCombination): SkillMetadata {
    return {
      creationTime: Date.now(),
      lastUsed: Date.now(),
      successRate: combination.successProbability,
      executionCount: 0,
      complexity: combination.estimatedComplexity,
      tags: combination.leaves.map((l) => l.spec.name),
      context: {
        leafCount: combination.leaves.length,
        estimatedDuration: combination.estimatedComplexity * 1000, // Rough estimate
      },
    };
  }

  /**
   * Initialize default composition types
   */
  private initializeDefaultTypes(): void {
    const defaultTypes: CompositionType[] = [
      {
        name: 'movement',
        description: 'Bot movement and positioning',
        constraints: ['requires_pathfinding', 'requires_world_access'],
        examples: ['walk_to', 'jump', 'swim'],
      },
      {
        name: 'safety',
        description: 'Safety assessment and threat detection',
        constraints: ['requires_entity_data', 'requires_lighting'],
        examples: ['detect_hostiles', 'check_light_level', 'assess_danger'],
      },
      {
        name: 'resource',
        description: 'Resource gathering and management',
        constraints: ['requires_tools', 'requires_inventory_space'],
        examples: ['mine_block', 'collect_item', 'store_item'],
      },
      {
        name: 'crafting',
        description: 'Item crafting and building',
        constraints: ['requires_materials', 'requires_workbench'],
        examples: ['craft_item', 'place_block', 'build_structure'],
      },
    ];

    for (const type of defaultTypes) {
      this.typeRegistry.set(type.name, type);
    }
  }

  /**
   * Initialize default composition rules
   */
  private initializeDefaultRules(): void {
    // Basic composition rules - can be extended
    this.compositionRules = [
      {
        name: 'safety_first',
        description: 'Always check safety before movement',
        condition: (leaves: ComposableLeaf[]) =>
          leaves.some((l) =>
            l.spec.composition.outputTypes.includes('safety_assessment')
          ),
        action: 'prioritize_safety_leaves',
      },
      {
        name: 'resource_efficiency',
        description: 'Gather resources before crafting',
        condition: (leaves: ComposableLeaf[]) =>
          leaves.some((l) =>
            l.spec.composition.outputTypes.includes('resource_gathering')
          ),
        action: 'prioritize_resource_leaves',
      },
    ];
  }

  /**
   * Merge compatible combinations
   */
  private mergeCompatibleCombinations(
    combinations: LeafCombination[]
  ): LeafCombination[] {
    // For now, return combinations as-is
    // In the future, this could merge compatible combinations
    return combinations;
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Composition rule for guiding skill creation
 */
interface CompositionRule {
  name: string;
  description: string;
  condition: (leaves: ComposableLeaf[]) => boolean;
  action: string;
}

// ============================================================================
// Export
// ============================================================================

export default SkillComposer;
