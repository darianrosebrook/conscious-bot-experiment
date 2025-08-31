/**
 * Hybrid Skill Planner - Integrates Skill-Based Planning with HTN/GOAP
 *
 * Provides a unified planning interface that combines:
 * - Skill-based planning for well-defined tasks
 * - HTN planning for complex hierarchical tasks
 * - GOAP planning for reactive, opportunistic execution
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { SkillRegistry } from '@conscious-bot/memory';
import { BehaviorTreeRunner } from '../behavior-trees/BehaviorTreeRunner';
import {
  SkillPlannerAdapter,
  SkillPlan,
  SkillPlanningContext,
} from './skill-planner-adapter';
import {
  MCPCapabilitiesAdapter,
  MCPCapabilityPlan,
  MCPCapabilityPlanningContext,
} from './mcp-capabilities-adapter';
import {
  HRMInspiredPlanner,
  Plan as HRMPlan,
} from '../hierarchical-planner/hrm-inspired-planner';
import {
  EnhancedGOAPPlanner,
  GOAPPlan,
} from '../reactive-executor/enhanced-goap-planner';
import {
  Plan,
  PlanningContext,
} from '../hierarchical-planner/hrm-inspired-planner';
import { EnhancedRegistry } from '@conscious-bot/core';
import { DynamicCreationFlow } from '@conscious-bot/core';
import { CapabilityRegistry } from '@conscious-bot/core';
import { Goal, GoalType, GoalStatus } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface HybridPlanningContext extends PlanningContext {
  skillRegistry: SkillRegistry;
  mcpRegistry?: EnhancedRegistry;
  mcpDynamicFlow?: DynamicCreationFlow;
  worldState: Record<string, any>;
  availableResources: Record<string, number>;
  timeConstraints: {
    urgency: 'low' | 'medium' | 'high' | 'emergency';
    deadline?: number;
    maxPlanningTime: number;
  };
  planningPreferences: {
    preferSkills: boolean;
    preferMCP: boolean;
    preferHTN: boolean;
    preferGOAP: boolean;
    allowHybrid: boolean;
  };
  leafContext?: any;
  goalRequirements?: Record<string, any>;
  // Override PlanningContext properties to match our structure
  currentState: Record<string, any>;
  resources: Record<string, number>;
}

export interface HybridPlan extends Plan {
  planningApproach:
    | 'skill-based'
    | 'mcp-capabilities'
    | 'htn'
    | 'goap'
    | 'hybrid';
  skillPlan?: SkillPlan;
  mcpCapabilityPlan?: MCPCapabilityPlan;
  hrmPlan?: HRMPlan;
  goapPlan?: GOAPPlan;
  confidence: number;
  estimatedSuccess: number;
  fallbackPlans: string[];
}

export interface PlanningDecision {
  approach: 'skill-based' | 'mcp-capabilities' | 'htn' | 'goap' | 'hybrid';
  reasoning: string;
  confidence: number;
  estimatedLatency: number;
}

// ============================================================================
// Hybrid Skill Planner Implementation
// ============================================================================

export class HybridSkillPlanner extends EventEmitter {
  private skillPlanner: SkillPlannerAdapter;
  private mcpCapabilitiesAdapter?: MCPCapabilitiesAdapter;
  private hrmPlanner: HRMInspiredPlanner;
  private goapPlanner: EnhancedGOAPPlanner;
  private skillRegistry: SkillRegistry;
  private btRunner: BehaviorTreeRunner;

  constructor(
    skillRegistry: SkillRegistry,
    btRunner: BehaviorTreeRunner,
    hrmPlanner: HRMInspiredPlanner,
    goapPlanner: EnhancedGOAPPlanner,
    mcpRegistry?: EnhancedRegistry,
    mcpDynamicFlow?: DynamicCreationFlow
  ) {
    super();
    this.skillRegistry = skillRegistry;
    this.btRunner = btRunner;
    this.hrmPlanner = hrmPlanner;
    this.goapPlanner = goapPlanner;
    this.skillPlanner = new SkillPlannerAdapter(skillRegistry, btRunner);

    // Initialize MCP capabilities adapter if registry is provided
    if (mcpRegistry && mcpDynamicFlow) {
      const capRegistry = new CapabilityRegistry();
      this.mcpCapabilitiesAdapter = new MCPCapabilitiesAdapter(
        mcpRegistry,
        mcpDynamicFlow,
        capRegistry
      );
    }
  }

  /**
   * Main planning interface - decides approach and generates plan
   */
  async plan(
    goal: string,
    context: HybridPlanningContext
  ): Promise<{
    plan: HybridPlan;
    decision: PlanningDecision;
    success: boolean;
    latency: number;
  }> {
    const startTime = Date.now();

    try {
      // Step 1: Analyze goal and decide planning approach
      const decision = await this.decidePlanningApproach(goal, context);

      // Step 2: Generate plan using selected approach
      const plan = await this.generatePlan(goal, context, decision);

      const latency = Date.now() - startTime;

      return {
        plan,
        decision,
        success: true,
        latency,
      };
    } catch (error) {
      console.error('Hybrid planning failed:', error);
      return {
        plan: this.createFallbackPlan(goal, context),
        decision: {
          approach: 'goap',
          reasoning: 'Fallback to reactive planning due to error',
          confidence: 0.3,
          estimatedLatency: 1000,
        },
        success: false,
        latency: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a hybrid plan
   */
  async executePlan(
    plan: HybridPlan,
    context: HybridPlanningContext
  ): Promise<{
    success: boolean;
    completedSteps: string[];
    failedSteps: string[];
    totalDuration: number;
    worldStateChanges: Record<string, any>;
  }> {
    const startTime = Date.now();

    try {
      switch (plan.planningApproach) {
        case 'mcp-capabilities':
          return await this.executeMCPCapabilityPlan(plan, context);
        case 'skill-based':
          return await this.executeSkillPlan(plan, context);
        case 'htn':
          return await this.executeHTNPlan(plan, context);
        case 'goap':
          return await this.executeGOAPPlan(plan, context);
        case 'hybrid':
          return await this.executeHybridPlan(plan, context);
        default:
          throw new Error(
            `Unknown planning approach: ${plan.planningApproach}`
          );
      }
    } catch (error) {
      console.error('Plan execution failed:', error);
      return {
        success: false,
        completedSteps: [],
        failedSteps: ['execution_error'],
        totalDuration: Date.now() - startTime,
        worldStateChanges: {},
      };
    }
  }

  /**
   * Decide which planning approach to use
   */
  private async decidePlanningApproach(
    goal: string,
    context: HybridPlanningContext
  ): Promise<PlanningDecision> {
    const analysis = this.analyzeGoal(goal, context);

    // Check if we have applicable skills
    const applicableSkills = this.findApplicableSkills(goal, context);
    const skillConfidence = this.calculateSkillConfidence(
      applicableSkills,
      goal
    );

    // Check MCP capabilities suitability
    const mcpConfidence = await this.calculateMCPConfidence(goal, context);

    // Check for impasse and dynamic creation potential
    const isImpasse = this.checkForImpasse(goal, context);

    // Check HTN suitability
    const htnConfidence = this.calculateHTNConfidence(goal, context);

    // Check GOAP suitability
    const goapConfidence = this.calculateGOAPConfidence(goal, context);

    // Make decision based on confidence scores and preferences
    let approach:
      | 'skill-based'
      | 'mcp-capabilities'
      | 'htn'
      | 'goap'
      | 'hybrid';
    let reasoning: string;
    let confidence: number;

    if (
      (mcpConfidence > 0.8 || isImpasse) &&
      context.planningPreferences.preferMCP &&
      this.mcpCapabilitiesAdapter
    ) {
      approach = 'mcp-capabilities';
      if (isImpasse) {
        reasoning = `Planning impasse detected - using MCP capabilities for dynamic behavior creation`;
        confidence = 0.7; // High confidence in dynamic creation
      } else {
        reasoning = `High MCP capabilities confidence (${mcpConfidence.toFixed(2)}) with dynamic capability creation available`;
        confidence = mcpConfidence;
      }
    } else if (
      skillConfidence > 0.8 &&
      context.planningPreferences.preferSkills
    ) {
      approach = 'skill-based';
      reasoning = `High skill confidence (${skillConfidence.toFixed(2)}) with ${applicableSkills.length} applicable skills`;
      confidence = skillConfidence;
    } else if (htnConfidence > 0.7 && context.planningPreferences.preferHTN) {
      approach = 'htn';
      reasoning = `HTN suitable for complex hierarchical goal with confidence ${htnConfidence.toFixed(2)}`;
      confidence = htnConfidence;
    } else if (goapConfidence > 0.6 && context.planningPreferences.preferGOAP) {
      approach = 'goap';
      reasoning = `GOAP suitable for reactive planning with confidence ${goapConfidence.toFixed(2)}`;
      confidence = goapConfidence;
    } else if (
      context.planningPreferences.allowHybrid &&
      (skillConfidence > 0.5 || htnConfidence > 0.5 || mcpConfidence > 0.5)
    ) {
      approach = 'hybrid';
      reasoning = `Hybrid approach combining skills (${skillConfidence.toFixed(2)}), MCP (${mcpConfidence.toFixed(2)}) and HTN (${htnConfidence.toFixed(2)})`;
      confidence =
        Math.max(skillConfidence, htnConfidence, mcpConfidence) * 0.9; // Slight penalty for complexity
    } else {
      // Default to GOAP for reactive planning
      approach = 'goap';
      reasoning = `Defaulting to GOAP for reactive planning`;
      confidence = goapConfidence;
    }

    const estimatedLatency = this.estimatePlanningLatency(approach, context);

    return {
      approach,
      reasoning,
      confidence,
      estimatedLatency,
    };
  }

  /**
   * Generate plan using selected approach
   */
  private async generatePlan(
    goal: string,
    context: HybridPlanningContext,
    decision: PlanningDecision
  ): Promise<HybridPlan> {
    const planId = `hybrid-plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    let skillPlan: SkillPlan | undefined;
    let mcpCapabilityPlan: MCPCapabilityPlan | undefined;
    let hrmPlan: HRMPlan | undefined;
    let goapPlan: GOAPPlan | undefined;

    switch (decision.approach) {
      case 'mcp-capabilities':
        if (
          this.mcpCapabilitiesAdapter &&
          context.mcpRegistry &&
          context.mcpDynamicFlow
        ) {
          const mcpContext: MCPCapabilityPlanningContext = {
            ...context,
            leafContext: context.leafContext || ({} as any),
            availableCapabilities: [],
            registry: context.mcpRegistry,
            dynamicFlow: context.mcpDynamicFlow,
            goalRequirements: context.goalRequirements || {},
          };
          mcpCapabilityPlan =
            await this.mcpCapabilitiesAdapter.generateCapabilityPlan(
              goal,
              mcpContext
            );
        }
        break;
      case 'skill-based':
        skillPlan = await this.generateSkillPlan(goal, context);
        break;
      case 'htn':
        hrmPlan = await this.generateHTNPlan(goal, context);
        break;
      case 'goap':
        goapPlan = await this.generateGOAPPlan(goal, context);
        break;
      case 'hybrid':
        [skillPlan, hrmPlan] = await Promise.all([
          this.generateSkillPlan(goal, context),
          this.generateHTNPlan(goal, context),
        ]);
        break;
    }

    // Create unified plan structure
    const plan: HybridPlan = {
      id: planId,
      goalId: goal,
      nodes: this.mergePlanNodes(
        skillPlan,
        mcpCapabilityPlan,
        hrmPlan,
        goapPlan
      ),
      executionOrder: this.calculateExecutionOrder(
        skillPlan,
        mcpCapabilityPlan,
        hrmPlan,
        goapPlan
      ),
      confidence: decision.confidence,
      estimatedLatency: decision.estimatedLatency,
      refinementCount: 0,
      createdAt: Date.now(),
      lastRefinedAt: Date.now(),
      planningApproach: decision.approach,
      skillPlan,
      mcpCapabilityPlan,
      hrmPlan,
      goapPlan,
      estimatedSuccess: this.estimatePlanSuccess(
        skillPlan,
        mcpCapabilityPlan,
        hrmPlan,
        goapPlan
      ),
      fallbackPlans: this.identifyFallbackPlans(decision.approach, context),
    };

    return plan;
  }

  /**
   * Generate skill-based plan
   */
  private async generateSkillPlan(
    goal: string,
    context: HybridPlanningContext
  ): Promise<SkillPlan> {
    const skillContext: SkillPlanningContext = {
      ...context,
      availableSkills: this.skillRegistry.getAllSkills(),
      goalRequirements: this.extractGoalRequirements(goal),
    };

    return await this.skillPlanner.generateSkillPlan(goal, skillContext);
  }

  /**
   * Generate HTN plan
   */
  private async generateHTNPlan(
    goal: string,
    context: HybridPlanningContext
  ): Promise<HRMPlan> {
    const hrmContext = {
      goal,
      currentState: context.worldState,
      constraints: context.constraints,
      resources: context.availableResources,
      timeLimit: context.timeConstraints.deadline,
      urgency: context.timeConstraints.urgency,
      domain: context.domain,
    };

    const result = await this.hrmPlanner.planWithRefinement(hrmContext);
    return result.finalPlan;
  }

  /**
   * Generate GOAP plan
   */
  private async generateGOAPPlan(
    goal: string,
    context: HybridPlanningContext
  ): Promise<GOAPPlan> {
    // Convert goal to GOAP format
    const goapGoalState = this.convertGoalToGOAP(goal, context.worldState);
    const goapGoal: Goal = {
      id: `goal-${Date.now()}`,
      type: GoalType.SURVIVAL,
      priority: 1,
      urgency: context.timeConstraints.urgency === 'emergency' ? 1.0 : 0.5,
      utility: 1.0,
      description: goal,
      preconditions: [],
      effects: [],
      status: GoalStatus.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      subGoals: [],
    };

    // Create a proper mock world state for GOAP planning
    const mockWorldState = {
      getHealth: () => 20,
      getHunger: () => 20,
      getEnergy: () => 20,
      getPosition: () => ({ x: 0, y: 64, z: 0 }),
      getThreatLevel: () => 0,
      distanceTo: (target: any) => 10,
      hasItem: (item: string, count: number) => count > 0,
      getInventory: () => ({}),
      getNearbyEntities: () => [],
      getBlockAt: (pos: any) => ({ type: 'air' }),
      isOnGround: () => true,
      isInWater: () => false,
      isInLava: () => false,
      getLightLevel: () => 15,
      getBiome: () => 'plains',
      getAir: () => 100,
      getTimeOfDay: () => 'day' as const,
      getNearbyResources: () => [],
      getNearbyHostiles: () => [],
      ...context.worldState,
    };

    // Create a mock execution context for GOAP planning
    const executionContext = {
      threatLevel: 0,
      hostileCount: 0,
      nearLava: false,
      lavaDistance: 100,
      resourceValue: 0,
      detourDistance: 0,
      subgoalUrgency: 0.5,
      estimatedTimeToSubgoal: 5000,
      commitmentStrength: 0.7,
      nearestLightDistance: 10,
      timeOfDay: 'day' as const,
      lightLevel: 15,
      airLevel: 100,
    };

    try {
      // Use the planTo method instead of generatePlan
      const plan = await this.goapPlanner.planTo(
        goapGoal,
        mockWorldState,
        executionContext,
        1000 // 1 second budget
      );

      // If no plan found, create a fallback plan
      if (!plan) {
        return {
          actions: [],
          goal: goapGoal,
          estimatedCost: 0,
          estimatedDuration: 1000,
          successProbability: 0.3,
          containsAction: () => false,
          remainsOnRoute: () => true,
        };
      }

      return plan;
    } catch (error) {
      console.error('GOAP planning failed:', error);
      // Return fallback plan on error
      return {
        actions: [],
        goal: goapGoal,
        estimatedCost: 0,
        estimatedDuration: 1000,
        successProbability: 0.1,
        containsAction: () => false,
        remainsOnRoute: () => true,
      };
    }
  }

  /**
   * Execute skill-based plan
   */
  private async executeSkillPlan(
    plan: HybridPlan,
    context: HybridPlanningContext
  ): Promise<{
    success: boolean;
    completedSteps: string[];
    failedSteps: string[];
    totalDuration: number;
    worldStateChanges: Record<string, any>;
  }> {
    if (!plan.skillPlan) {
      throw new Error('No skill plan available for execution');
    }

    const skillContext: SkillPlanningContext = {
      ...context,
      availableSkills: this.skillRegistry.getAllSkills(),
      goalRequirements: this.extractGoalRequirements(plan.goalId),
    };

    const result = await this.skillPlanner.executeSkillPlan(
      plan.skillPlan,
      skillContext
    );

    return {
      success: result.success,
      completedSteps: result.completedSkills,
      failedSteps: result.failedSkills,
      totalDuration: result.totalDuration,
      worldStateChanges: result.worldStateChanges,
    };
  }

  /**
   * Execute HTN plan
   */
  private async executeHTNPlan(
    plan: HybridPlan,
    context: HybridPlanningContext
  ): Promise<{
    success: boolean;
    completedSteps: string[];
    failedSteps: string[];
    totalDuration: number;
    worldStateChanges: Record<string, any>;
  }> {
    if (!plan.hrmPlan) {
      throw new Error('No HTN plan available for execution');
    }

    // Execute HTN plan using existing infrastructure
    const startTime = Date.now();
    const completedSteps: string[] = [];
    const failedSteps: string[] = [];
    const worldStateChanges: Record<string, any> = {};

    try {
      // Execute plan nodes in order
      for (const nodeId of plan.hrmPlan.executionOrder) {
        const node = plan.hrmPlan.nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        try {
          // Execute node (this would integrate with existing HTN execution)
          const result = await this.executeHTNNode(node, context);

          if (result.success) {
            completedSteps.push(nodeId);
            Object.assign(worldStateChanges, result.worldStateChanges);
          } else {
            failedSteps.push(nodeId);
          }
        } catch (error) {
          failedSteps.push(nodeId);
          console.error(`HTN node execution failed: ${nodeId}`, error);
        }
      }

      const totalDuration = Date.now() - startTime;
      const success = failedSteps.length === 0;

      return {
        success,
        completedSteps,
        failedSteps,
        totalDuration,
        worldStateChanges,
      };
    } catch (error) {
      return {
        success: false,
        completedSteps,
        failedSteps: [...failedSteps, 'htn_execution_error'],
        totalDuration: Date.now() - startTime,
        worldStateChanges,
      };
    }
  }

  /**
   * Execute GOAP plan
   */
  private async executeGOAPPlan(
    plan: HybridPlan,
    context: HybridPlanningContext
  ): Promise<{
    success: boolean;
    completedSteps: string[];
    failedSteps: string[];
    totalDuration: number;
    worldStateChanges: Record<string, any>;
  }> {
    if (!plan.goapPlan) {
      throw new Error('No GOAP plan available for execution');
    }

    // Execute GOAP plan using existing infrastructure
    const startTime = Date.now();

    try {
      // Execute GOAP plan by running actions sequentially
      const completedSteps: string[] = [];
      const failedSteps: string[] = [];
      const worldStateChanges: Record<string, any> = {};

      for (const action of plan.goapPlan.actions) {
        try {
          // Simulate action execution
          await new Promise((resolve) =>
            setTimeout(resolve, action.estimatedDuration || 100)
          );
          completedSteps.push(action.name);
        } catch (error) {
          failedSteps.push(action.name);
        }
      }

      return {
        success: failedSteps.length === 0,
        completedSteps,
        failedSteps,
        totalDuration: Date.now() - startTime,
        worldStateChanges,
      };
    } catch (error) {
      return {
        success: false,
        completedSteps: [],
        failedSteps: ['goap_execution_error'],
        totalDuration: Date.now() - startTime,
        worldStateChanges: {},
      };
    }
  }

  /**
   * Execute hybrid plan (combination of approaches)
   */
  private async executeHybridPlan(
    plan: HybridPlan,
    context: HybridPlanningContext
  ): Promise<{
    success: boolean;
    completedSteps: string[];
    failedSteps: string[];
    totalDuration: number;
    worldStateChanges: Record<string, any>;
  }> {
    const startTime = Date.now();
    const completedSteps: string[] = [];
    const failedSteps: string[] = [];
    const worldStateChanges: Record<string, any> = {};

    try {
      // Execute skill-based components first
      if (plan.skillPlan) {
        const skillResult = await this.executeSkillPlan(plan, context);
        completedSteps.push(...skillResult.completedSteps);
        failedSteps.push(...skillResult.failedSteps);
        Object.assign(worldStateChanges, skillResult.worldStateChanges);

        // Update context for next phase
        Object.assign(context.worldState, skillResult.worldStateChanges);
      }

      // Execute HTN components if needed
      if (plan.hrmPlan && failedSteps.length === 0) {
        const htnResult = await this.executeHTNPlan(plan, context);
        completedSteps.push(...htnResult.completedSteps);
        failedSteps.push(...htnResult.failedSteps);
        Object.assign(worldStateChanges, htnResult.worldStateChanges);
      }

      const totalDuration = Date.now() - startTime;
      const success = failedSteps.length === 0;

      return {
        success,
        completedSteps,
        failedSteps,
        totalDuration,
        worldStateChanges,
      };
    } catch (error) {
      return {
        success: false,
        completedSteps,
        failedSteps: [...failedSteps, 'hybrid_execution_error'],
        totalDuration: Date.now() - startTime,
        worldStateChanges,
      };
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private analyzeGoal(
    goal: string,
    context: HybridPlanningContext
  ): {
    complexity: 'simple' | 'moderate' | 'complex';
    structure: 'hierarchical' | 'sequential' | 'reactive';
    domain: 'minecraft' | 'general' | 'spatial' | 'logical';
  } {
    const goalLower = goal.toLowerCase();

    // Analyze complexity
    let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
    if (
      goalLower.includes('complex') ||
      goalLower.includes('multiple') ||
      goalLower.includes('series')
    ) {
      complexity = 'complex';
    } else if (
      goalLower.includes('and') ||
      goalLower.includes('then') ||
      goalLower.includes('after')
    ) {
      complexity = 'moderate';
    }

    // Analyze structure
    let structure: 'hierarchical' | 'sequential' | 'reactive' = 'reactive';
    if (
      goalLower.includes('build') ||
      goalLower.includes('construct') ||
      goalLower.includes('create')
    ) {
      structure = 'hierarchical';
    } else if (
      goalLower.includes('gather') ||
      goalLower.includes('collect') ||
      goalLower.includes('find')
    ) {
      structure = 'sequential';
    }

    // Analyze domain
    let domain: 'minecraft' | 'general' | 'spatial' | 'logical' = 'general';
    if (
      goalLower.includes('minecraft') ||
      goalLower.includes('block') ||
      goalLower.includes('craft')
    ) {
      domain = 'minecraft';
    } else if (
      goalLower.includes('navigate') ||
      goalLower.includes('move') ||
      goalLower.includes('position')
    ) {
      domain = 'spatial';
    } else if (
      goalLower.includes('solve') ||
      goalLower.includes('calculate') ||
      goalLower.includes('logic')
    ) {
      domain = 'logical';
    }

    return { complexity, structure, domain };
  }

  private findApplicableSkills(
    goal: string,
    context: HybridPlanningContext
  ): any[] {
    const allSkills = this.skillRegistry.getAllSkills();

    return allSkills.filter((skill: any) => {
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

      const preconditionsMet = skill.preconditions.every((precond: any) =>
        precond.isSatisfied(context.worldState)
      );

      return (keywordMatch || nameMatch || descMatch) && preconditionsMet;
    });
  }

  private calculateSkillConfidence(
    applicableSkills: any[],
    goal: string
  ): number {
    if (applicableSkills.length === 0) return 0;

    const avgSuccessRate =
      applicableSkills.reduce(
        (sum, skill) => sum + (skill.metadata.successRate || 0.5),
        0
      ) / applicableSkills.length;

    const coverageScore = Math.min(applicableSkills.length / 3, 1); // Normalize to 0-1

    return (avgSuccessRate + coverageScore) / 2;
  }

  private calculateHTNConfidence(
    goal: string,
    context: HybridPlanningContext
  ): number {
    const analysis = this.analyzeGoal(goal, context);

    let confidence = 0.5; // Base confidence

    // Adjust based on complexity
    if (analysis.complexity === 'complex') confidence += 0.3;
    else if (analysis.complexity === 'moderate') confidence += 0.2;

    // Adjust based on structure
    if (analysis.structure === 'hierarchical') confidence += 0.2;
    else if (analysis.structure === 'sequential') confidence += 0.1;

    // Adjust based on domain
    if (analysis.domain === 'minecraft') confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private calculateGOAPConfidence(
    goal: string,
    context: HybridPlanningContext
  ): number {
    const analysis = this.analyzeGoal(goal, context);

    let confidence = 0.6; // Base confidence for GOAP

    // Adjust based on urgency
    if (context.timeConstraints.urgency === 'emergency') confidence += 0.3;
    else if (context.timeConstraints.urgency === 'high') confidence += 0.2;

    // Adjust based on structure
    if (analysis.structure === 'reactive') confidence += 0.2;

    return Math.min(confidence, 1.0);
  }

  private estimatePlanningLatency(
    approach: 'skill-based' | 'mcp-capabilities' | 'htn' | 'goap' | 'hybrid',
    context: HybridPlanningContext
  ): number {
    const baseLatency = {
      'skill-based': 100,
      'mcp-capabilities': 300,
      htn: 500,
      goap: 200,
      hybrid: 800,
    };

    const urgencyMultiplier = {
      low: 1.5,
      medium: 1.0,
      high: 0.7,
      emergency: 0.5,
    };

    return Math.round(
      baseLatency[approach] * urgencyMultiplier[context.timeConstraints.urgency]
    );
  }

  private extractGoalRequirements(goal: string): Record<string, any> {
    // Simple extraction - in full implementation, use NLP
    const requirements: Record<string, any> = {};

    if (goal.toLowerCase().includes('wood')) requirements.wood = { min: 1 };
    if (goal.toLowerCase().includes('iron')) requirements.iron = { min: 1 };
    if (goal.toLowerCase().includes('shelter'))
      requirements.shelter = { required: true };
    if (goal.toLowerCase().includes('tools'))
      requirements.tools = { required: true };

    return requirements;
  }

  private convertGoalToGOAP(
    goal: string,
    worldState: Record<string, any>
  ): Record<string, any> {
    // Convert natural language goal to GOAP state representation
    const goapGoal: Record<string, any> = {};

    if (goal.toLowerCase().includes('shelter')) goapGoal.hasShelter = true;
    if (goal.toLowerCase().includes('tools')) goapGoal.hasTools = true;
    if (goal.toLowerCase().includes('food')) goapGoal.hasFood = true;
    if (goal.toLowerCase().includes('safe')) goapGoal.isSafe = true;

    return goapGoal;
  }

  private mergePlanNodes(
    skillPlan?: SkillPlan,
    mcpCapabilityPlan?: MCPCapabilityPlan,
    hrmPlan?: HRMPlan,
    goapPlan?: GOAPPlan
  ): any[] {
    const nodes: any[] = [];

    if (skillPlan) {
      nodes.push(
        ...skillPlan.nodes.map((node) => ({
          ...node,
          source: 'skill',
          planId: skillPlan.id,
        }))
      );
    }

    if (mcpCapabilityPlan) {
      nodes.push(
        ...mcpCapabilityPlan.nodes.map((node) => ({
          ...node,
          source: 'mcp-capability',
          planId: mcpCapabilityPlan.id,
        }))
      );
    }

    if (hrmPlan) {
      nodes.push(
        ...hrmPlan.nodes.map((node) => ({
          ...node,
          source: 'htn',
          planId: hrmPlan.id,
        }))
      );
    }

    if (goapPlan) {
      // Convert GOAP actions to plan nodes with deterministic IDs
      const goapNodes = goapPlan.actions.map((action, index) => ({
        id: `goap-node-${(goapPlan as any).id ?? 'goap-plan'}-${index}`,
        type: 'action' as const,
        description: action.name,
        status: 'pending' as const,
        priority: 0.5,
        estimatedDuration: action.baseCost || 1000,
        dependencies: [],
        constraints: [],
        metadata: {
          source: 'goap',
          planId: (goapPlan as any).id ?? 'goap-plan',
          action: action,
        },
      }));

      nodes.push(...goapNodes);
    }

    return nodes;
  }

  private calculateExecutionOrder(
    skillPlan?: SkillPlan,
    mcpCapabilityPlan?: MCPCapabilityPlan,
    hrmPlan?: HRMPlan,
    goapPlan?: GOAPPlan
  ): string[] {
    const order: string[] = [];

    // Add skill plan execution order
    if (skillPlan) {
      order.push(...skillPlan.executionOrder);
    }

    // Add MCP capability plan execution order
    if (mcpCapabilityPlan) {
      order.push(...mcpCapabilityPlan.executionOrder);
    }

    // Add HTN plan execution order
    if (
      hrmPlan &&
      hrmPlan.executionOrder &&
      Array.isArray(hrmPlan.executionOrder)
    ) {
      order.push(...hrmPlan.executionOrder);
    }

    // Add GOAP plan execution order
    if (goapPlan) {
      order.push(
        ...goapPlan.actions.map(
          (_, index) => `goap-node-${(goapPlan as any).id ?? 'goap-plan'}-${index}`
        )
      );
    }

    return order;
  }

  private estimatePlanSuccess(
    skillPlan?: SkillPlan,
    mcpCapabilityPlan?: MCPCapabilityPlan,
    hrmPlan?: HRMPlan,
    goapPlan?: GOAPPlan
  ): number {
    const estimates: number[] = [];

    if (skillPlan) estimates.push(skillPlan.estimatedSkillSuccess);
    if (mcpCapabilityPlan)
      estimates.push(mcpCapabilityPlan.estimatedCapabilitySuccess);
    if (hrmPlan) estimates.push(hrmPlan.confidence);
    if (goapPlan) estimates.push(0.7); // Default GOAP confidence

    if (estimates.length === 0) return 0.5;

    return estimates.reduce((sum, est) => sum + est, 0) / estimates.length;
  }

  private identifyFallbackPlans(
    approach: 'skill-based' | 'mcp-capabilities' | 'htn' | 'goap' | 'hybrid',
    context: HybridPlanningContext
  ): string[] {
    const fallbacks: string[] = [];

    switch (approach) {
      case 'mcp-capabilities':
        fallbacks.push('skill-based', 'htn', 'goap');
        break;
      case 'skill-based':
        fallbacks.push('mcp-capabilities', 'htn', 'goap');
        break;
      case 'htn':
        fallbacks.push('mcp-capabilities', 'skill-based', 'goap');
        break;
      case 'goap':
        fallbacks.push('mcp-capabilities', 'skill-based', 'htn');
        break;
      case 'hybrid':
        fallbacks.push('mcp-capabilities', 'goap', 'skill-based');
        break;
    }

    return fallbacks;
  }

  private createFallbackPlan(
    goal: string,
    context: HybridPlanningContext
  ): HybridPlan {
    return {
      id: `fallback-plan-${Date.now()}`,
      goalId: goal,
      nodes: [],
      executionOrder: [],
      confidence: 0.3,
      estimatedLatency: 1000,
      refinementCount: 0,
      createdAt: Date.now(),
      lastRefinedAt: Date.now(),
      planningApproach: 'goap',
      estimatedSuccess: 0.3,
      fallbackPlans: [],
    };
  }

  private async executeHTNNode(
    node: any,
    context: HybridPlanningContext
  ): Promise<{
    success: boolean;
    worldStateChanges: Record<string, any>;
  }> {
    // Placeholder for HTN node execution
    // In full implementation, this would integrate with existing HTN execution
    return {
      success: true,
      worldStateChanges: {},
    };
  }

  /**
   * Check for planning impasse and dynamic creation potential
   */
  private checkForImpasse(
    goal: string,
    context: HybridPlanningContext
  ): boolean {
    if (!context.mcpDynamicFlow) return false;

    try {
      const impasseResult = context.mcpDynamicFlow.checkImpasse(goal, {
        code: 'unknown',
        detail: 'planning_analysis',
        retryable: false,
      });

      return impasseResult.isImpasse;
    } catch (error) {
      console.warn('Error checking for impasse:', error);
      return false;
    }
  }

  /**
   * Calculate MCP capabilities confidence
   */
  private async calculateMCPConfidence(
    goal: string,
    context: HybridPlanningContext
  ): Promise<number> {
    if (!this.mcpCapabilitiesAdapter || !context.mcpRegistry) {
      return 0.0;
    }

    try {
      // Check for applicable MCP capabilities
      const mcpContext: MCPCapabilityPlanningContext = {
        ...context,
        leafContext: context.leafContext || ({} as any),
        availableCapabilities: [],
        registry: context.mcpRegistry,
        dynamicFlow: context.mcpDynamicFlow!,
        goalRequirements: context.goalRequirements || {},
      };

      const applicableCapabilities =
        await this.mcpCapabilitiesAdapter.findApplicableCapabilities(
          goal,
          mcpContext
        );

      if (applicableCapabilities && applicableCapabilities.length > 0) {
        // High confidence if we have applicable capabilities
        return Math.min(0.8 + applicableCapabilities.length * 0.1, 1.0);
      }

      // Check for impasse and potential for dynamic creation
      if (context.mcpDynamicFlow) {
        const impasseResult = context.mcpDynamicFlow.checkImpasse(goal, {
          code: 'unknown',
          detail: 'planning_analysis',
          retryable: false,
        });

        if (impasseResult.isImpasse) {
          // Medium confidence if we can create new capabilities
          return 0.6;
        }
      }

      // Fallback to keyword-based confidence
      const goalLower = goal.toLowerCase();
      const mcpKeywords = [
        'torch',
        'corridor',
        'light',
        'safe',
        'mining',
        'explore',
        'move',
        'dig',
        'place',
        'craft',
      ];
      const matchingKeywords = mcpKeywords.filter((keyword) =>
        goalLower.includes(keyword)
      );

      return Math.min(matchingKeywords.length / mcpKeywords.length, 0.5);
    } catch (error) {
      console.warn('Error calculating MCP confidence:', error);
      return 0.0;
    }
  }

  /**
   * Execute MCP capability plan
   */
  private async executeMCPCapabilityPlan(
    plan: HybridPlan,
    context: HybridPlanningContext
  ): Promise<{
    success: boolean;
    completedSteps: string[];
    failedSteps: string[];
    totalDuration: number;
    worldStateChanges: Record<string, any>;
  }> {
    if (!plan.mcpCapabilityPlan || !this.mcpCapabilitiesAdapter) {
      return {
        success: false,
        completedSteps: [],
        failedSteps: ['no_mcp_plan'],
        totalDuration: 0,
        worldStateChanges: {},
      };
    }

    const mcpContext: MCPCapabilityPlanningContext = {
      ...context,
      leafContext: context.leafContext || ({} as any),
      availableCapabilities: [],
      registry: context.mcpRegistry!,
      dynamicFlow: context.mcpDynamicFlow!,
      goalRequirements: context.goalRequirements || {},
    };

    const result = await this.mcpCapabilitiesAdapter.executeCapabilityPlan(
      plan.mcpCapabilityPlan,
      mcpContext
    );

    return {
      success: result.success,
      completedSteps: result.completedCapabilities,
      failedSteps: result.failedCapabilities,
      totalDuration: result.totalDuration,
      worldStateChanges: result.worldStateChanges,
    };
  }

  /**
   * Get planning statistics
   */
  getPlanningStats(): {
    totalPlans: number;
    approachDistribution: Record<string, number>;
    averageConfidence: number;
    averageLatency: number;
  } {
    // Placeholder for statistics
    return {
      totalPlans: 0,
      approachDistribution: {
        'skill-based': 0,
        'mcp-capabilities': 0,
        htn: 0,
        goap: 0,
        hybrid: 0,
      },
      averageConfidence: 0.7,
      averageLatency: 500,
    };
  }
}
