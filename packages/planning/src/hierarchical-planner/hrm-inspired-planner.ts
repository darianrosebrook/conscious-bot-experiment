/**
 * HRM-Inspired Hierarchical Planner
 *
 * TypeScript implementation of HRM's dual-module hierarchical planning architecture
 * Based on integration plan lines 64-67: "Hierarchical RNN Controller"
 *
 * Implements:
 * - High-level module: Slow, abstract planning (System 2)
 * - Low-level module: Fast, detailed execution (System 1)
 * - Iterative refinement loop with halt/continue mechanism
 * - Multi-timescale processing
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// Core planning types
export const PlanNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['goal', 'subgoal', 'action', 'condition']),
  description: z.string(),
  status: z.enum(['pending', 'active', 'completed', 'failed', 'blocked']),
  priority: z.number().min(0).max(1),
  estimatedDuration: z.number(), // milliseconds
  dependencies: z.array(z.string()), // node IDs
  constraints: z.array(z.string()),
  metadata: z.record(z.any()).optional(),
});

export type PlanNode = z.infer<typeof PlanNodeSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  nodes: z.array(PlanNodeSchema),
  executionOrder: z.array(z.string()), // node IDs in execution order
  confidence: z.number().min(0).max(1),
  estimatedLatency: z.number(),
  refinementCount: z.number(),
  createdAt: z.number(),
  lastRefinedAt: z.number(),
});

export type Plan = z.infer<typeof PlanSchema>;

export const PlanningContextSchema = z.object({
  goal: z.string(),
  currentState: z.record(z.any()),
  constraints: z.array(z.string()),
  resources: z.record(z.number()),
  timeLimit: z.number().optional(),
  urgency: z.enum(['low', 'medium', 'high', 'emergency']),
  domain: z.enum(['minecraft', 'general', 'spatial', 'logical']),
});

export type PlanningContext = z.infer<typeof PlanningContextSchema>;

/**
 * High-Level Planning Module (System 2)
 *
 * Handles slow, abstract reasoning and strategic planning
 * Operates on longer timescales with coarse-grained steps
 */
class HighLevelPlanningModule {
  private planningHistory: Plan[] = [];
  private abstractPatterns: Map<string, any> = new Map();

  /**
   * Generate high-level strategic plan
   * Focuses on goal decomposition and resource allocation
   */
  generateAbstractPlan(context: PlanningContext): Plan {
    const planId = `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Decompose goal into high-level subgoals
    const subgoals = this.decomposeGoal(context.goal, context);

    // Create abstract plan structure
    const nodes: PlanNode[] = [
      // Main goal node
      {
        id: `goal-${planId}`,
        type: 'goal',
        description: context.goal,
        status: 'pending',
        priority: 1.0,
        estimatedDuration: this.estimateGoalDuration(context),
        dependencies: [],
        constraints: context.constraints,
      },
      // Subgoal nodes
      ...subgoals.map((subgoal, index) => ({
        id: `subgoal-${planId}-${index}`,
        type: 'subgoal' as const,
        description: subgoal.description,
        status: 'pending' as const,
        priority: subgoal.priority,
        estimatedDuration: subgoal.estimatedDuration,
        dependencies: subgoal.dependencies,
        constraints: subgoal.constraints,
      })),
    ];

    const executionOrder = this.calculateExecutionOrder(nodes);
    const confidence = this.calculatePlanConfidence(nodes, context);

    const plan: Plan = {
      id: planId,
      goalId: `goal-${planId}`,
      nodes,
      executionOrder,
      confidence,
      estimatedLatency: this.calculateTotalLatency(nodes),
      refinementCount: 0,
      createdAt: Date.now(),
      lastRefinedAt: Date.now(),
    };

    this.planningHistory.push(plan);
    return plan;
  }

  /**
   * Refine existing plan based on feedback
   */
  refinePlan(plan: Plan, feedback: string, context: PlanningContext): Plan {
    const refinedPlan = { ...plan };
    refinedPlan.refinementCount++;
    refinedPlan.lastRefinedAt = Date.now();

    // Analyze feedback to identify refinement needs
    const refinementActions = this.analyzeFeedback(feedback);

    for (const action of refinementActions) {
      switch (action.type) {
        case 'reorder':
          refinedPlan.executionOrder = this.reorderExecution(
            refinedPlan.nodes,
            action.criteria
          );
          break;
        case 'add_constraint':
          if (action.constraint) {
            this.addConstraintToNodes(refinedPlan.nodes, action.constraint);
          }
          break;
        case 'adjust_priority':
          this.adjustNodePriorities(refinedPlan.nodes, action.adjustments);
          break;
        case 'decompose_further':
          if (action.nodeIds) {
            this.decomposeComplexNodes(refinedPlan, action.nodeIds);
          }
          break;
      }
    }

    // Recalculate plan metrics
    refinedPlan.confidence = this.calculatePlanConfidence(
      refinedPlan.nodes,
      context
    );
    refinedPlan.estimatedLatency = this.calculateTotalLatency(
      refinedPlan.nodes
    );

    return refinedPlan;
  }

  private decomposeGoal(
    goal: string,
    context: PlanningContext
  ): Array<{
    description: string;
    priority: number;
    estimatedDuration: number;
    dependencies: string[];
    constraints: string[];
  }> {
    // Domain-specific goal decomposition
    if (context.domain === 'minecraft') {
      return this.decomposeMinecraftGoal(goal, context);
    }

    // General goal decomposition using common patterns
    return this.decomposeGeneralGoal(goal, context);
  }

  private decomposeMinecraftGoal(goal: string, context: PlanningContext) {
    const goalLower = goal.toLowerCase();

    if (goalLower.includes('build')) {
      return this.decomposeMinecraftBuildGoal(goal);
    } else if (goalLower.includes('find') || goalLower.includes('collect')) {
      return this.decomposeMinecraftCollectionGoal(goal);
    } else if (goalLower.includes('navigate') || goalLower.includes('go to')) {
      return this.decomposeMinecraftNavigationGoal(goal);
    }

    return this.decomposeGeneralGoal(goal, context);
  }

  private decomposeMinecraftBuildGoal(goal: string) {
    return [
      {
        description: 'Gather required materials',
        priority: 0.9,
        estimatedDuration: 30000, // 30 seconds
        dependencies: [],
        constraints: ['inventory_space', 'tool_availability'],
      },
      {
        description: 'Find suitable building location',
        priority: 0.8,
        estimatedDuration: 15000,
        dependencies: [],
        constraints: ['terrain_suitable', 'safety_check'],
      },
      {
        description: 'Execute construction plan',
        priority: 1.0,
        estimatedDuration: 60000, // 1 minute
        dependencies: ['gather_materials', 'find_location'],
        constraints: ['material_sufficiency', 'structural_integrity'],
      },
    ];
  }

  private decomposeMinecraftCollectionGoal(goal: string) {
    return [
      {
        description: 'Locate target resources',
        priority: 0.9,
        estimatedDuration: 20000,
        dependencies: [],
        constraints: ['exploration_safety', 'visibility'],
      },
      {
        description: 'Plan collection route',
        priority: 0.7,
        estimatedDuration: 10000,
        dependencies: ['locate_resources'],
        constraints: ['path_safety', 'efficiency'],
      },
      {
        description: 'Execute collection plan',
        priority: 1.0,
        estimatedDuration: 40000,
        dependencies: ['plan_route'],
        constraints: ['inventory_capacity', 'tool_durability'],
      },
    ];
  }

  private decomposeMinecraftNavigationGoal(goal: string) {
    return [
      {
        description: 'Calculate optimal path',
        priority: 0.8,
        estimatedDuration: 5000,
        dependencies: [],
        constraints: ['obstacle_avoidance', 'distance_optimization'],
      },
      {
        description: 'Execute navigation plan',
        priority: 1.0,
        estimatedDuration: 25000,
        dependencies: ['calculate_path'],
        constraints: ['path_safety', 'stamina_management'],
      },
    ];
  }

  private decomposeGeneralGoal(goal: string, context: PlanningContext) {
    // Generic decomposition for non-Minecraft goals
    return [
      {
        description: `Analyze requirements for: ${goal}`,
        priority: 0.8,
        estimatedDuration: 10000,
        dependencies: [],
        constraints: ['information_availability'],
      },
      {
        description: `Plan approach for: ${goal}`,
        priority: 0.9,
        estimatedDuration: 15000,
        dependencies: ['analyze_requirements'],
        constraints: ['resource_constraints', 'time_constraints'],
      },
      {
        description: `Execute plan for: ${goal}`,
        priority: 1.0,
        estimatedDuration: 30000,
        dependencies: ['plan_approach'],
        constraints: context.constraints,
      },
    ];
  }

  private calculateExecutionOrder(nodes: PlanNode[]): string[] {
    // Topological sort considering dependencies and priorities
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      // Visit dependencies first
      for (const depId of node.dependencies) {
        visit(depId);
      }

      order.push(nodeId);
    };

    // Sort by priority and visit
    const sortedNodes = [...nodes].sort((a, b) => b.priority - a.priority);
    for (const node of sortedNodes) {
      visit(node.id);
    }

    return order;
  }

  private calculatePlanConfidence(
    nodes: PlanNode[],
    context: PlanningContext
  ): number {
    let confidence = 0.7; // Base confidence

    // Confidence factors
    const nodeCount = nodes.length;
    if (nodeCount <= 3) confidence += 0.1; // Simple plans are more reliable
    if (nodeCount > 6) confidence -= 0.1; // Complex plans are less reliable

    // Domain familiarity
    if (context.domain === 'minecraft') confidence += 0.1;

    // Resource availability
    const hasResources = Object.keys(context.resources).length > 0;
    if (hasResources) confidence += 0.1;

    // Time pressure
    if (context.urgency === 'emergency') confidence -= 0.2;
    if (context.urgency === 'low') confidence += 0.1;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private calculateTotalLatency(nodes: PlanNode[]): number {
    return nodes.reduce((total, node) => total + node.estimatedDuration, 0);
  }

  private estimateGoalDuration(context: PlanningContext): number {
    // Base estimation logic
    const urgencyMultipliers = {
      emergency: 0.5,
      high: 0.7,
      medium: 1.0,
      low: 1.5,
    };

    const baseDuration = 60000; // 1 minute base
    return baseDuration * urgencyMultipliers[context.urgency];
  }

  private analyzeFeedback(
    feedback: string
  ): Array<{
    type: string;
    criteria?: any;
    constraint?: string;
    adjustments?: any;
    nodeIds?: string[];
  }> {
    // Simple feedback analysis - in practice, this would be more sophisticated
    const actions = [];

    if (feedback.includes('reorder') || feedback.includes('sequence')) {
      actions.push({ type: 'reorder', criteria: 'efficiency' });
    }

    if (feedback.includes('constraint') || feedback.includes('limitation')) {
      actions.push({ type: 'add_constraint', constraint: 'safety_first' });
    }

    if (feedback.includes('priority') || feedback.includes('important')) {
      actions.push({ type: 'adjust_priority', adjustments: { increase: 0.1 } });
    }

    if (feedback.includes('complex') || feedback.includes('break down')) {
      actions.push({ type: 'decompose_further', nodeIds: [] });
    }

    return actions;
  }

  private reorderExecution(nodes: PlanNode[], criteria: string): string[] {
    // Reorder based on criteria
    if (criteria === 'efficiency') {
      return nodes
        .sort((a, b) => a.estimatedDuration - b.estimatedDuration)
        .map((n) => n.id);
    }

    return nodes.map((n) => n.id);
  }

  private addConstraintToNodes(nodes: PlanNode[], constraint: string): void {
    nodes.forEach((node) => {
      if (!node.constraints.includes(constraint)) {
        node.constraints.push(constraint);
      }
    });
  }

  private adjustNodePriorities(nodes: PlanNode[], adjustments: any): void {
    nodes.forEach((node) => {
      if (adjustments.increase) {
        node.priority = Math.min(1.0, node.priority + adjustments.increase);
      }
    });
  }

  private decomposeComplexNodes(plan: Plan, nodeIds: string[]): void {
    // Placeholder for further decomposition logic
    console.warn('Node decomposition not yet implemented');
  }
}

/**
 * Low-Level Execution Module (System 1)
 *
 * Handles fast, detailed operations and immediate responses
 * Operates on shorter timescales with fine-grained actions
 */
class LowLevelExecutionModule {
  private executionHistory: Array<{
    nodeId: string;
    action: string;
    result: any;
    latency: number;
  }> = [];

  /**
   * Generate detailed action sequence for a plan node
   */
  generateDetailedActions(
    node: PlanNode,
    context: PlanningContext
  ): Array<{
    action: string;
    parameters: Record<string, any>;
    estimatedLatency: number;
    preconditions: string[];
  }> {
    switch (node.type) {
      case 'goal':
        return this.generateGoalActions(node, context);
      case 'subgoal':
        return this.generateSubgoalActions(node, context);
      case 'action':
        return this.generateAtomicActions(node, context);
      default:
        return [];
    }
  }

  /**
   * Execute a specific action with real-time adaptation
   */
  executeAction(
    action: {
      action: string;
      parameters: Record<string, any>;
      estimatedLatency: number;
    },
    context: PlanningContext
  ): {
    success: boolean;
    result: any;
    actualLatency: number;
    adaptations: string[];
  } {
    const startTime = Date.now();
    let result: any = null;
    let success = true;
    const adaptations: string[] = [];

    try {
      // Simulate action execution based on type
      switch (action.action) {
        case 'navigate':
          result = this.executeNavigation(action.parameters, context);
          break;
        case 'collect':
          result = this.executeCollection(action.parameters, context);
          break;
        case 'build':
          result = this.executeBuild(action.parameters, context);
          break;
        case 'analyze':
          result = this.executeAnalysis(action.parameters, context);
          break;
        default:
          result = this.executeGenericAction(action.parameters, context);
      }
    } catch (error) {
      success = false;
      result = {
        error: error instanceof Error ? error.message : String(error),
      };
      adaptations.push('error_recovery');
    }

    const actualLatency = Date.now() - startTime;

    // Record execution for learning
    this.executionHistory.push({
      nodeId: action.parameters.nodeId || 'unknown',
      action: action.action,
      result,
      latency: actualLatency,
    });

    return {
      success,
      result,
      actualLatency,
      adaptations,
    };
  }

  private generateGoalActions(node: PlanNode, context: PlanningContext) {
    return [
      {
        action: 'analyze',
        parameters: { goal: node.description, context: context.currentState },
        estimatedLatency: 2000,
        preconditions: ['cognitive_resources_available'],
      },
    ];
  }

  private generateSubgoalActions(node: PlanNode, context: PlanningContext) {
    const actions = [];

    if (
      node.description.includes('gather') ||
      node.description.includes('collect')
    ) {
      actions.push({
        action: 'collect',
        parameters: { target: node.description, inventory: context.resources },
        estimatedLatency: 5000,
        preconditions: ['inventory_space_available', 'tools_available'],
      });
    }

    if (
      node.description.includes('navigate') ||
      node.description.includes('location')
    ) {
      actions.push({
        action: 'navigate',
        parameters: {
          destination: node.description,
          currentPosition: context.currentState.position,
        },
        estimatedLatency: 3000,
        preconditions: ['path_clear', 'movement_possible'],
      });
    }

    if (
      node.description.includes('build') ||
      node.description.includes('construct')
    ) {
      actions.push({
        action: 'build',
        parameters: {
          structure: node.description,
          materials: context.resources,
        },
        estimatedLatency: 8000,
        preconditions: ['materials_sufficient', 'location_suitable'],
      });
    }

    if (actions.length === 0) {
      actions.push({
        action: 'analyze',
        parameters: { subgoal: node.description },
        estimatedLatency: 1000,
        preconditions: [],
      });
    }

    return actions;
  }

  private generateAtomicActions(node: PlanNode, context: PlanningContext) {
    return [
      {
        action: node.description.toLowerCase().replace(/\s+/g, '_'),
        parameters: { details: node.description },
        estimatedLatency: 1000,
        preconditions: [],
      },
    ];
  }

  private executeNavigation(
    params: Record<string, any>,
    context: PlanningContext
  ) {
    // Simulate navigation execution
    return {
      action: 'navigation_complete',
      destination: params.destination,
      pathTaken: 'optimized_route',
      success: true,
    };
  }

  private executeCollection(
    params: Record<string, any>,
    context: PlanningContext
  ) {
    // Simulate collection execution
    return {
      action: 'collection_complete',
      itemsCollected: [params.target],
      quantity: Math.floor(Math.random() * 10) + 1,
      success: true,
    };
  }

  private executeBuild(params: Record<string, any>, context: PlanningContext) {
    // Simulate building execution
    return {
      action: 'build_complete',
      structure: params.structure,
      materialsUsed: params.materials,
      success: true,
    };
  }

  private executeAnalysis(
    params: Record<string, any>,
    context: PlanningContext
  ) {
    // Simulate analysis execution
    return {
      action: 'analysis_complete',
      insights: [`Analysis of ${params.goal || params.subgoal} completed`],
      recommendations: ['proceed_with_plan'],
      success: true,
    };
  }

  private executeGenericAction(
    params: Record<string, any>,
    context: PlanningContext
  ) {
    // Generic action execution
    return {
      action: 'generic_action_complete',
      parameters: params,
      success: true,
    };
  }
}

/**
 * HRM-Inspired Hierarchical Planner
 *
 * Integrates high-level planning and low-level execution modules
 * with iterative refinement loop
 */
export class HRMInspiredPlanner {
  private highLevelModule: HighLevelPlanningModule;
  private lowLevelModule: LowLevelExecutionModule;
  private maxRefinements: number;
  private qualityThreshold: number;

  constructor(
    config: {
      maxRefinements?: number;
      qualityThreshold?: number;
    } = {}
  ) {
    this.highLevelModule = new HighLevelPlanningModule();
    this.lowLevelModule = new LowLevelExecutionModule();
    this.maxRefinements = config.maxRefinements || 3;
    this.qualityThreshold = config.qualityThreshold || 0.8;
  }

  /**
   * Main planning method with iterative refinement
   * Implements the outer-loop refinement from HRM
   */
  async planWithRefinement(context: PlanningContext): Promise<{
    finalPlan: Plan;
    refinementHistory: Plan[];
    totalRefinements: number;
    halted: boolean;
    haltReason: string;
  }> {
    const refinementHistory: Plan[] = [];
    let currentPlan = this.highLevelModule.generateAbstractPlan(context);
    refinementHistory.push(currentPlan);

    let refinementCount = 0;
    let halted = false;
    let haltReason = '';

    // Iterative refinement loop (HRM's outer loop)
    while (refinementCount < this.maxRefinements && !halted) {
      // Evaluate current plan quality
      const quality = await this.evaluatePlanQuality(currentPlan, context);

      // Halt condition: quality threshold met
      if (quality >= this.qualityThreshold) {
        halted = true;
        haltReason = 'quality_threshold_met';
        break;
      }

      // Generate refinement feedback
      const feedback = await this.generateRefinementFeedback(
        currentPlan,
        context,
        quality
      );

      // Halt condition: no meaningful feedback
      if (!feedback || feedback.trim().length === 0) {
        halted = true;
        haltReason = 'no_improvement_possible';
        break;
      }

      // Refine the plan
      currentPlan = this.highLevelModule.refinePlan(
        currentPlan,
        feedback,
        context
      );
      refinementHistory.push(currentPlan);
      refinementCount++;
    }

    // Halt condition: max refinements reached
    if (refinementCount >= this.maxRefinements) {
      halted = true;
      haltReason = 'max_refinements_reached';
    }

    return {
      finalPlan: currentPlan,
      refinementHistory,
      totalRefinements: refinementCount,
      halted,
      haltReason,
    };
  }

  /**
   * Execute a plan using the low-level execution module
   */
  async executePlan(
    plan: Plan,
    context: PlanningContext
  ): Promise<{
    success: boolean;
    results: any[];
    totalLatency: number;
    adaptations: string[];
  }> {
    const results: any[] = [];
    const adaptations: string[] = [];
    let totalLatency = 0;
    let overallSuccess = true;

    for (const nodeId of plan.executionOrder) {
      const node = plan.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      // Generate detailed actions for this node
      const detailedActions = this.lowLevelModule.generateDetailedActions(
        node,
        context
      );

      for (const action of detailedActions) {
        const executionResult = this.lowLevelModule.executeAction(
          action,
          context
        );

        results.push(executionResult);
        totalLatency += executionResult.actualLatency;
        adaptations.push(...executionResult.adaptations);

        if (!executionResult.success) {
          overallSuccess = false;
          // Could implement recovery strategies here
        }
      }
    }

    return {
      success: overallSuccess,
      results,
      totalLatency,
      adaptations,
    };
  }

  /**
   * Evaluate plan quality for halt condition
   */
  private async evaluatePlanQuality(
    plan: Plan,
    context: PlanningContext
  ): Promise<number> {
    let quality = plan.confidence;

    // Factor in plan characteristics
    const nodeComplexity = plan.nodes.length;
    if (nodeComplexity <= 3) quality += 0.1; // Simple plans score higher
    if (nodeComplexity > 8) quality -= 0.1; // Complex plans score lower

    // Factor in refinement history
    if (plan.refinementCount > 0) quality += 0.05; // Refined plans score higher
    if (plan.refinementCount > 2) quality -= 0.05; // Over-refined plans score lower

    // Factor in estimated latency vs context requirements
    if (context.timeLimit && plan.estimatedLatency > context.timeLimit) {
      quality -= 0.2; // Plans exceeding time limits score lower
    }

    return Math.max(0.0, Math.min(1.0, quality));
  }

  /**
   * Generate feedback for plan refinement
   */
  private async generateRefinementFeedback(
    plan: Plan,
    context: PlanningContext,
    quality: number
  ): Promise<string> {
    const feedback: string[] = [];

    if (plan.estimatedLatency > (context.timeLimit || Infinity)) {
      feedback.push(
        'Plan exceeds time limit - consider parallel execution or simplification'
      );
    }

    if (plan.nodes.length > 6) {
      feedback.push(
        'Plan is complex - consider breaking down complex nodes further'
      );
    }

    const highPriorityNodes = plan.nodes.filter((n) => n.priority > 0.8);
    if (highPriorityNodes.length > 3) {
      feedback.push(
        'Too many high-priority nodes - reorder by true importance'
      );
    }

    if (quality < 0.6) {
      feedback.push(
        'Low confidence plan - add constraints and verify dependencies'
      );
    }

    return feedback.join('. ');
  }

  /**
   * Get planner statistics
   */
  getStats(): {
    planningLatency: number;
    averageRefinements: number;
    averagePlanQuality: number;
  } {
    // Implementation would track actual statistics
    return {
      planningLatency: 150, // Target from integration plan
      averageRefinements: 1.5,
      averagePlanQuality: 0.85,
    };
  }
}

/**
 * Factory function for creating configured HRM planner
 */
export function createHRMPlanner(config?: {
  maxRefinements?: number;
  qualityThreshold?: number;
}): HRMInspiredPlanner {
  return new HRMInspiredPlanner(config);
}

/**
 * Utility function for quick planning
 */
export async function quickPlan(
  goal: string,
  options: Partial<PlanningContext> = {}
): Promise<Plan> {
  const planner = createHRMPlanner();
  const context: PlanningContext = {
    goal,
    currentState: options.currentState || {},
    constraints: options.constraints || [],
    resources: options.resources || {},
    timeLimit: options.timeLimit,
    urgency: options.urgency || 'medium',
    domain: options.domain || 'general',
  };

  const result = await planner.planWithRefinement(context);
  return result.finalPlan;
}
