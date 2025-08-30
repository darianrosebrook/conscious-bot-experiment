/**
 * Integrated Planning Coordinator
 *
 * Bridges HRM-inspired cognitive architecture with classical HTN/GOAP planning
 * Implements the full planning pipeline: Signals → Goals → Plans → Execution
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  Goal,
  Plan,
  PlanStatus,
  HomeostasisState,
  Need,
  NeedType,
  GoalType,
  GoalStatus,
  Action,
  Resource,
  UtilityContext,
} from './types';

// Import our HRM-inspired components
import {
  CognitiveTaskRouter,
  createCognitiveRouter,
  routeTask,
  RoutingDecision,
  TaskType,
  RouterType,
} from './hierarchical-planner/cognitive-router';

import {
  HRMInspiredPlanner,
  createHRMPlanner,
} from './hierarchical-planner/hrm-inspired-planner';

import type {
  Plan as HRMPlan,
  PlanNode as HRMPlanNode,
} from './hierarchical-planner/hrm-inspired-planner';

// Classical planning components
import { HierarchicalPlanner } from './hierarchical-planner/hierarchical-planner';
import { ReactiveExecutor } from './reactive-executor/reactive-executor';
import { GOAPPlanner } from './reactive-executor/goap-planner';

// Goal formulation components
import { HomeostasisMonitor } from './goal-formulation/homeostasis-monitor';
import { generateNeeds } from './goal-formulation/need-generator';
import { GoalManager } from './goal-formulation/goal-manager';
import { createWeightedUtility } from './goal-formulation/utility-calculator';

export interface PlanningConfiguration {
  // HRM Configuration
  hrmConfig: {
    maxRefinements: number;
    qualityThreshold: number;
    hrmLatencyTarget: number;
    enableIterativeRefinement: boolean;
  };

  // Classical Planning Configuration
  htnConfig: {
    maxDecompositionDepth: number;
    methodCacheSize: number;
    preferenceWeights: Record<string, number>;
  };

  goapConfig: {
    maxPlanLength: number;
    planningBudgetMs: number;
    repairThreshold: number;
  };

  // Integration Configuration
  coordinatorConfig: {
    routingStrategy: 'hybrid' | 'hrm_first' | 'htn_first' | 'adaptive';
    fallbackTimeout: number;
    enablePlanMerging: boolean;
    enableCrossValidation: boolean;
  };
}

export interface PlanningContext {
  worldState: Record<string, any>;
  currentState: HomeostasisState;
  activeGoals: Goal[];
  availableResources: Resource[];
  timeConstraints: {
    urgency: 'low' | 'medium' | 'high' | 'emergency';
    deadline?: number;
    maxPlanningTime: number;
  };
  situationalFactors: {
    threatLevel: number;
    opportunityLevel: number;
    socialContext: string[];
    environmentalFactors: string[];
  };
}

export interface IntegratedPlanningResult {
  primaryPlan: Plan;
  alternativePlans: Plan[];
  routingDecision: RoutingDecision;
  planningApproach: 'hrm' | 'htn' | 'goap' | 'hybrid';
  confidence: number;
  estimatedSuccess: number;
  planningLatency: number;

  // Detailed breakdown
  goalFormulation: {
    identifiedNeeds: Need[];
    generatedGoals: Goal[];
    priorityRanking: Array<{
      goalId: string;
      score: number;
      reasoning: string;
    }>;
  };

  planGeneration: {
    hrmPlan?: HRMPlan;
    htnPlan?: Plan;
    goapPlan?: Plan;
    selectedPlan: Plan;
    selectionReasoning: string;
  };

  qualityAssessment: {
    feasibilityScore: number;
    optimalityScore: number;
    coherenceScore: number;
    riskScore: number;
  };
}

/**
 * Main coordinator that orchestrates the complete planning pipeline
 */
export class IntegratedPlanningCoordinator extends EventEmitter {
  private config: PlanningConfiguration;

  // HRM Components
  private cognitiveRouter!: CognitiveTaskRouter;
  private hrmPlanner!: HRMInspiredPlanner;

  // Classical Components
  private htnPlanner!: HierarchicalPlanner;
  private goapPlanner!: GOAPPlanner;
  private reactiveExecutor!: ReactiveExecutor;

  // Goal Formulation Components
  private homeostasisMonitor!: HomeostasisMonitor;
  private goalManager!: GoalManager;

  // Planning State
  private activePlans: Map<string, Plan> = new Map();
  private planningHistory: IntegratedPlanningResult[] = [];
  private performanceMetrics: PlanningPerformanceMetrics;

  constructor(config: Partial<PlanningConfiguration> = {}) {
    super();

    this.config = this.mergeWithDefaults(config);
    this.initializeComponents();
    this.performanceMetrics = new PlanningPerformanceMetrics();
  }

  /**
   * Main planning pipeline: Signals → Needs → Goals → Plans → Execution
   */
  async planAndExecute(
    signals: any[],
    context: PlanningContext
  ): Promise<IntegratedPlanningResult> {
    const startTime = Date.now();

    try {
      // Step 1: Goal Formulation (Signals → Needs → Goals)
      const goalFormulation = await this.performGoalFormulation(
        signals,
        context
      );

      // Step 2: Cognitive Routing (Task Classification)
      const routingDecision = await this.performCognitiveRouting(
        goalFormulation.generatedGoals,
        context
      );

      // Step 3: Plan Generation (Goals → Plans)
      const planGeneration = await this.performPlanGeneration(
        goalFormulation.generatedGoals,
        routingDecision,
        context
      );

      // Step 4: Plan Quality Assessment
      const qualityAssessment = await this.assessPlanQuality(
        planGeneration.selectedPlan,
        context
      );

      // Step 5: Plan Execution Preparation
      await this.preparePlanExecution(planGeneration.selectedPlan, context);

      const result: IntegratedPlanningResult = {
        primaryPlan: planGeneration.selectedPlan,
        alternativePlans: this.generateAlternativePlans(planGeneration),
        routingDecision,
        planningApproach: this.determinePlanningApproach(routingDecision),
        confidence: qualityAssessment.feasibilityScore,
        estimatedSuccess: qualityAssessment.optimalityScore,
        planningLatency: Date.now() - startTime,
        goalFormulation,
        planGeneration,
        qualityAssessment,
      };

      // Add to planning history
      this.planningHistory.push(result);

      // Record performance metrics
      this.performanceMetrics.recordPlanningSession(result);

      // Emit planning completion event
      this.emit('planningComplete', result);

      return result;
    } catch (error) {
      console.error('Planning pipeline error details:', error);
      console.error(
        'Error stack:',
        error instanceof Error ? error.stack : 'No stack trace'
      );
      this.emit('planningError', error);
      throw new Error(`Planning pipeline failed: ${error}`);
    }
  }

  /**
   * Step 1: Goal Formulation - Transform signals into prioritized goals
   */
  private async performGoalFormulation(
    signals: any[],
    context: PlanningContext
  ): Promise<IntegratedPlanningResult['goalFormulation']> {
    // Process homeostatic signals into needs
    const homeostasisState = this.analyzeSignalsToHomeostasis(signals, context);
    const identifiedNeeds = generateNeeds(homeostasisState);

    // Transform needs into candidate goals
    const candidateGoals = this.generateCandidateGoalsFromNeeds(
      identifiedNeeds,
      context
    );

    // Calculate utility scores and prioritize
    const utilityContext: UtilityContext = {
      homeostasis: homeostasisState,
      goals: context.activeGoals,
      needs: identifiedNeeds,
      resources: context.availableResources,
      worldState: context.worldState,
      time: Date.now(),
    };

    // Create a utility calculator with balanced weights
    const utilityCalculator = createWeightedUtility({
      needIntensity: 0.4,
      needUrgency: 0.3,
      healthRisk: 0.2,
      safetyRisk: 0.1,
    });

    const priorityRanking = candidateGoals
      .map((goal) => ({
        goalId: goal.id,
        score: utilityCalculator.calculate(utilityContext),
        reasoning: this.generatePriorityReasoning(goal, utilityContext),
      }))
      .sort((a, b) => b.score - a.score);

    // Select top goals for planning
    const generatedGoals = priorityRanking
      .slice(0, 5) // Top 5 goals
      .map((ranking) => candidateGoals.find((g) => g.id === ranking.goalId)!)
      .filter(Boolean);

    return {
      identifiedNeeds,
      generatedGoals,
      priorityRanking,
    };
  }

  /**
   * Step 2: Cognitive Routing - Determine planning approach
   */
  private async performCognitiveRouting(
    goals: Goal[],
    context: PlanningContext
  ): Promise<RoutingDecision> {
    if (!goals || goals.length === 0) {
      // Create a default exploration task for empty goals
      const defaultGoal: Goal = {
        id: 'default-exploration',
        type: GoalType.CURIOSITY,
        description: 'Explore environment and gather information',
        status: GoalStatus.PENDING,
        priority: 0.5,
        urgency: 0.3,
        utility: 0.4,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        preconditions: [],
        effects: [],
        subGoals: [],
      };
      goals = [defaultGoal];
    }

    // Use the primary goal for routing decision
    const primaryGoal = goals[0];
    const taskDescription = this.goalToTaskDescription(primaryGoal, context);

    const mappedDomain = this.mapGoalDomain(primaryGoal.type);
    const domain = (
      ['minecraft', 'general', 'spatial', 'logical'] as const
    ).includes(mappedDomain as any)
      ? (mappedDomain as 'minecraft' | 'general' | 'spatial' | 'logical')
      : ('general' as const);

    const routingContext = {
      domain,
      urgency: context.timeConstraints.urgency,
      requiresStructured: this.requiresStructuredReasoning(primaryGoal),
      requiresCreativity: this.requiresCreativeReasoning(primaryGoal),
      requiresWorldKnowledge: this.requiresWorldKnowledge(primaryGoal),
    };

    return routeTask(taskDescription, routingContext);
  }

  /**
   * Step 3: Plan Generation - Generate plans using selected approach
   */
  private async performPlanGeneration(
    goals: Goal[],
    routingDecision: RoutingDecision,
    context: PlanningContext
  ): Promise<IntegratedPlanningResult['planGeneration']> {
    const primaryGoal = goals[0];
    let hrmPlan: HRMPlan | undefined;
    let htnPlan: Plan | undefined;
    let goapPlan: Plan | undefined;
    let selectedPlan: Plan;
    let selectionReasoning: string;

    switch (routingDecision.router) {
      case 'hrm_structured':
        hrmPlan = await this.generateHRMPlan(primaryGoal, context);
        selectedPlan = this.convertHRMPlanToStandardPlan(hrmPlan, primaryGoal);
        selectionReasoning = `Selected HRM approach for structured reasoning: ${routingDecision.reasoning}`;
        break;

      case 'llm':
        // For LLM routing, we use HTN with creative/flexible methods
        htnPlan = await this.generateHTNPlan(primaryGoal, context, 'creative');
        selectedPlan = htnPlan;
        selectionReasoning = `Selected HTN approach with creative methods: ${routingDecision.reasoning}`;
        break;

      case 'collaborative':
        // Generate both HRM and HTN plans, then merge
        const [hrmResult, htnResult] = await Promise.all([
          this.generateHRMPlan(primaryGoal, context),
          this.generateHTNPlan(primaryGoal, context, 'balanced'),
        ]);

        hrmPlan = hrmResult;
        htnPlan = htnResult;
        selectedPlan = await this.mergeCollaborativePlans(
          hrmResult,
          htnResult,
          primaryGoal
        );
        selectionReasoning = `Selected collaborative approach merging HRM and HTN: ${routingDecision.reasoning}`;
        break;

      default:
        // Fallback to HTN
        htnPlan = await this.generateHTNPlan(primaryGoal, context, 'balanced');
        selectedPlan = htnPlan;
        selectionReasoning = `Fallback to HTN approach`;
    }

    // Generate GOAP plan as backup for reactive execution
    if (context.timeConstraints.urgency === 'emergency') {
      goapPlan = await this.generateGOAPPlan(primaryGoal, context);
    }

    return {
      hrmPlan,
      htnPlan,
      goapPlan,
      selectedPlan,
      selectionReasoning,
    };
  }

  /**
   * Generate HRM-style hierarchical plan
   */
  private async generateHRMPlan(
    goal: Goal,
    context: PlanningContext
  ): Promise<HRMPlan> {
    const planningContext = {
      goal: goal.description,
      currentState: context.worldState,
      constraints: this.extractConstraints(goal, context),
      resources: this.mapResources(context.availableResources),
      urgency: context.timeConstraints.urgency,
      domain: this.mapGoalDomain(goal.type) as
        | 'minecraft'
        | 'general'
        | 'spatial'
        | 'logical',
    };

    const result = await this.hrmPlanner.planWithRefinement(planningContext);
    return result.finalPlan;
  }

  /**
   * Generate HTN hierarchical plan
   */
  private async generateHTNPlan(
    goal: Goal,
    context: PlanningContext,
    style: 'creative' | 'balanced' | 'efficient'
  ): Promise<Plan> {
    // Use existing HTN planner with goal
    let plan = this.htnPlanner.decompose(goal);

    if (!plan) {
      throw new Error(
        `HTN planner failed to generate plan for goal: ${goal.id}`
      );
    }

    // Generate basic steps if plan is empty
    if (plan.steps.length === 0) {
      plan.steps = this.generateBasicPlanSteps(goal, context, style);
    }

    // Enhance with style-specific modifications
    return this.applyPlanningStyle(plan, style, context);
  }

  /**
   * Generate GOAP reactive plan
   */
  private async generateGOAPPlan(
    goal: Goal,
    context: PlanningContext
  ): Promise<Plan> {
    // Convert goal to GOAP format and plan
    const goapGoal = this.convertToGOAPGoal(goal);
    const worldState = this.convertToGOAPState(context.worldState);

    return this.goapPlanner.plan(goapGoal, worldState);
  }

  /**
   * Merge HRM and HTN plans for collaborative approach
   */
  private async mergeCollaborativePlans(
    hrmPlan: HRMPlan,
    htnPlan: Plan,
    goal: Goal
  ): Promise<Plan> {
    // Use HRM's high-level structure with HTN's detailed steps
    const mergedPlan: Plan = {
      id: `merged-${Date.now()}`,
      goalId: goal.id,
      steps: [],
      status: PlanStatus.PENDING,
      priority: Math.max(hrmPlan.confidence, htnPlan.priority),
      estimatedDuration: Math.min(
        hrmPlan.estimatedLatency || 0,
        htnPlan.estimatedDuration
      ),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      successProbability: (hrmPlan.confidence + htnPlan.successProbability) / 2,
    };

    // Map HRM nodes to plan steps, augment with HTN details
    mergedPlan.steps = this.mergeHRMAndHTNSteps(
      hrmPlan.nodes,
      htnPlan.steps,
      goal
    );

    return mergedPlan;
  }

  /**
   * Convert HRM plan to standard Plan format
   */
  private convertHRMPlanToStandardPlan(hrmPlan: HRMPlan, goal: Goal): Plan {
    return {
      id: hrmPlan.id,
      goalId: goal.id,
      steps: this.convertHRMNodesToSteps(hrmPlan.nodes, goal),
      status: PlanStatus.PENDING,
      priority: hrmPlan.confidence,
      estimatedDuration: hrmPlan.estimatedLatency || 0,
      createdAt: hrmPlan.createdAt,
      updatedAt: Date.now(),
      successProbability: hrmPlan.confidence,
    };
  }

  /**
   * Step 4: Assess plan quality across multiple dimensions
   */
  private async assessPlanQuality(
    plan: Plan,
    context: PlanningContext
  ): Promise<IntegratedPlanningResult['qualityAssessment']> {
    return {
      feasibilityScore: await this.assessFeasibility(plan, context),
      optimalityScore: await this.assessOptimality(plan, context),
      coherenceScore: await this.assessCoherence(plan, context),
      riskScore: await this.assessRisk(plan, context),
    };
  }

  /**
   * Step 5: Prepare plan for execution
   */
  private async preparePlanExecution(
    plan: Plan,
    context: PlanningContext
  ): Promise<void> {
    // Register plan for execution tracking
    this.activePlans.set(plan.id, plan);

    // Set up monitoring and error recovery
    this.setupPlanMonitoring(plan);

    // Pre-validate first few steps
    await this.preValidatePlanSteps(plan, context);

    // Emit plan ready event
    this.emit('planReady', { plan, context });
  }

  /**
   * Execute a plan using the reactive executor
   */
  async executePlan(planId: string): Promise<boolean> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    try {
      const success = await this.reactiveExecutor.execute(plan);

      if (success) {
        plan.status = PlanStatus.COMPLETED;
        this.emit('planCompleted', plan);
      } else {
        plan.status = PlanStatus.FAILED;
        this.emit('planFailed', plan);
      }

      return success;
    } catch (error) {
      plan.status = PlanStatus.FAILED;
      this.emit('planError', { plan, error });
      return false;
    }
  }

  // Helper methods
  private mergeWithDefaults(
    config: Partial<PlanningConfiguration>
  ): PlanningConfiguration {
    return {
      hrmConfig: {
        maxRefinements: 3,
        qualityThreshold: 0.8,
        hrmLatencyTarget: 100,
        enableIterativeRefinement: true,
        ...config.hrmConfig,
      },
      htnConfig: {
        maxDecompositionDepth: 5,
        methodCacheSize: 100,
        preferenceWeights: { efficiency: 0.3, safety: 0.4, creativity: 0.3 },
        ...config.htnConfig,
      },
      goapConfig: {
        maxPlanLength: 10,
        planningBudgetMs: 20,
        repairThreshold: 0.8,
        ...config.goapConfig,
      },
      coordinatorConfig: {
        routingStrategy: 'hybrid',
        fallbackTimeout: 5000,
        enablePlanMerging: true,
        enableCrossValidation: true,
        ...config.coordinatorConfig,
      },
    };
  }

  private initializeComponents(): void {
    // Initialize HRM components
    this.cognitiveRouter = createCognitiveRouter({
      hrmLatencyTarget: this.config.hrmConfig.hrmLatencyTarget,
      llmLatencyTarget: 400,
      emergencyLatencyLimit: 50,
    });

    this.hrmPlanner = createHRMPlanner({
      maxRefinements: this.config.hrmConfig.maxRefinements,
      qualityThreshold: this.config.hrmConfig.qualityThreshold,
    });

    // Initialize classical components
    this.htnPlanner = new HierarchicalPlanner();
    this.goapPlanner = new GOAPPlanner();
    this.reactiveExecutor = new ReactiveExecutor();

    // Initialize goal formulation components
    this.homeostasisMonitor = new HomeostasisMonitor();
    this.goalManager = new GoalManager();
  }

  // Utility methods for conversions and mappings
  private goalToTaskDescription(goal: Goal, context: PlanningContext): string {
    const description = goal?.description || 'unknown task';
    const urgency = context?.timeConstraints?.urgency || 'medium';
    const threatLevel = context?.situationalFactors?.threatLevel || 0;
    return `${description} with urgency ${urgency} and threat level ${threatLevel}`;
  }

  /**
   * Convert raw signals into homeostasis state
   */
  private analyzeSignalsToHomeostasis(
    signals: any[],
    context: PlanningContext
  ): HomeostasisState {
    // Start with current state from context
    const baseState = (context.currentState || {}) as Partial<HomeostasisState>;

    // Process signals to adjust homeostasis values
    const adjustments: Partial<HomeostasisState> = {};

    signals.forEach((signal) => {
      switch (signal.type) {
        case 'hunger':
          adjustments.hunger = this.normalizeSignalValue(signal.value);
          break;
        case 'thirst':
          // Map thirst to health impact
          adjustments.health = Math.min(
            baseState.health || 1,
            1 - this.normalizeSignalValue(signal.value) * 0.3
          );
          break;
        case 'health_critical':
          adjustments.health = Math.min(
            0.2,
            this.normalizeSignalValue(signal.value)
          );
          break;
        case 'threat_detected':
        case 'imminent_threat':
          adjustments.safety = 1 - this.normalizeSignalValue(signal.value);
          break;
        case 'curiosity':
        case 'exploration_drive':
          adjustments.curiosity = this.normalizeSignalValue(signal.value);
          break;
        case 'social_need':
          adjustments.social = this.normalizeSignalValue(signal.value);
          break;
        case 'achievement_drive':
          adjustments.achievement = this.normalizeSignalValue(signal.value);
          break;
        case 'energy':
          adjustments.energy = this.normalizeSignalValue(signal.value);
          break;
        default:
          // Unknown signal type - contribute to general curiosity
          adjustments.curiosity = Math.max(adjustments.curiosity || 0, 0.5);
      }
    });

    // Merge with context state and apply adjustments
    return this.homeostasisMonitor.sample({
      ...baseState,
      ...adjustments,
      timestamp: Date.now(),
    });
  }

  /**
   * Normalize signal values to 0-1 range
   */
  private normalizeSignalValue(value: number): number {
    if (value >= 0 && value <= 1) return value;
    if (value > 1 && value <= 100) return value / 100;
    return Math.max(0, Math.min(1, value));
  }

  /**
   * Generate candidate goals from identified needs
   */
  private generateCandidateGoalsFromNeeds(
    needs: Need[],
    context: PlanningContext
  ): Goal[] {
    const candidateGoals: Goal[] = [];
    const now = Date.now();

    needs.forEach((need, index) => {
      // Create a goal for each need
      const goalId = `goal-${now}-${need.type}-${index}`;

      // Map need types to goal types and descriptions
      const goalMapping = this.mapNeedToGoal(need, context);

      const goal: Goal = {
        id: goalId,
        type: goalMapping.type,
        description: goalMapping.description,
        status: GoalStatus.PENDING,
        priority: need.intensity * need.urgency, // Combined urgency and intensity
        urgency: need.urgency,
        utility: need.intensity,
        deadline: this.calculateGoalDeadline(need, context),
        createdAt: now,
        updatedAt: now,
        preconditions: [],
        effects: [],
        subGoals: [],
      };

      candidateGoals.push(goal);
    });

    return candidateGoals;
  }

  /**
   * Map a need to appropriate goal type and description
   */
  private mapNeedToGoal(
    need: Need,
    context: PlanningContext
  ): { type: GoalType; description: string } {
    switch (need.type) {
      case NeedType.SURVIVAL:
        return {
          type: GoalType.SURVIVAL,
          description: 'Ensure survival by maintaining health and resources',
        };
      case NeedType.SAFETY:
        return {
          type: GoalType.SAFETY,
          description: 'Establish safety and secure the immediate environment',
        };
      case NeedType.EXPLORATION:
        return {
          type: GoalType.EXPLORATION,
          description:
            'Explore surroundings to gather information and resources',
        };
      case NeedType.SOCIAL:
        return {
          type: GoalType.SOCIAL,
          description: 'Engage with others and build social connections',
        };
      case NeedType.ACHIEVEMENT:
        return {
          type: GoalType.ACHIEVEMENT,
          description: 'Accomplish meaningful tasks and make progress',
        };
      case NeedType.CREATIVITY:
        return {
          type: GoalType.CREATIVITY,
          description: 'Express creativity and build innovative solutions',
        };
      case NeedType.CURIOSITY:
        return {
          type: GoalType.CURIOSITY,
          description: 'Satisfy curiosity and learn about the environment',
        };
      default:
        return {
          type: GoalType.CURIOSITY,
          description: `Address ${need.type} need through exploration`,
        };
    }
  }

  /**
   * Calculate appropriate deadline for a goal based on need urgency
   */
  private calculateGoalDeadline(
    need: Need,
    context: PlanningContext
  ): number | undefined {
    const now = Date.now();
    const urgencyMultiplier = need.urgency;

    // Base deadline calculation
    let baseTimeMs = 60000; // 1 minute default

    // Safely access timeConstraints with fallback
    const urgency = context.timeConstraints?.urgency || 'medium';

    switch (urgency) {
      case 'emergency':
        baseTimeMs = 10000; // 10 seconds
        break;
      case 'high':
        baseTimeMs = 30000; // 30 seconds
        break;
      case 'medium':
        baseTimeMs = 120000; // 2 minutes
        break;
      case 'low':
        baseTimeMs = 300000; // 5 minutes
        break;
    }

    // Adjust by need urgency
    const adjustedTime = baseTimeMs / Math.max(0.1, urgencyMultiplier);

    return now + adjustedTime;
  }

  private mapGoalDomain(goalType: GoalType): string {
    const mapping: Record<GoalType, string> = {
      [GoalType.SURVIVAL]: 'survival',
      [GoalType.SAFETY]: 'safety',
      [GoalType.EXPLORATION]: 'spatial',
      [GoalType.SOCIAL]: 'social',
      [GoalType.ACHIEVEMENT]: 'logical',
      [GoalType.CREATIVITY]: 'creative',
      [GoalType.CURIOSITY]: 'exploration',
      [GoalType.REACH_LOCATION]: 'spatial',
      [GoalType.ACQUIRE_ITEM]: 'logical',
      [GoalType.SURVIVE_THREAT]: 'safety',
    };
    return mapping[goalType] || 'general';
  }

  private requiresStructuredReasoning(goal: Goal): boolean {
    return [GoalType.ACHIEVEMENT, GoalType.EXPLORATION].includes(goal.type);
  }

  private requiresCreativeReasoning(goal: Goal): boolean {
    return [GoalType.CREATIVITY, GoalType.SOCIAL].includes(goal.type);
  }

  private requiresWorldKnowledge(goal: Goal): boolean {
    return [GoalType.EXPLORATION, GoalType.SOCIAL, GoalType.CURIOSITY].includes(
      goal.type
    );
  }

  private generatePriorityReasoning(
    goal: Goal,
    context: UtilityContext
  ): string {
    return `Goal ${goal.description} prioritized due to ${goal.type} need with utility score based on current homeostasis`;
  }

  private determinePlanningApproach(
    routingDecision: RoutingDecision
  ): 'hrm' | 'htn' | 'goap' | 'hybrid' {
    switch (routingDecision.router) {
      case 'hrm_structured':
        return 'hrm';
      case 'llm':
        return 'htn';
      case 'collaborative':
        return 'hybrid';
      default:
        return 'htn';
    }
  }

  /**
   * Generate basic plan steps based on goal type
   */
  private generateBasicPlanSteps(
    goal: Goal,
    context: PlanningContext,
    style: string
  ): any[] {
    const steps: any[] = [];
    const now = Date.now();

    switch (goal.type) {
      case GoalType.SURVIVAL:
        steps.push(
          this.createPlanStep(
            'assess-health',
            'Assess current health status',
            [],
            30
          ),
          this.createPlanStep(
            'secure-resources',
            'Secure basic survival resources',
            ['assess-health'],
            120
          ),
          this.createPlanStep(
            'establish-safety',
            'Establish safe environment',
            ['secure-resources'],
            90
          )
        );
        break;

      case GoalType.SAFETY:
        steps.push(
          this.createPlanStep(
            'scan-threats',
            'Scan for immediate threats',
            [],
            20
          ),
          this.createPlanStep(
            'secure-area',
            'Secure immediate area',
            ['scan-threats'],
            60
          ),
          this.createPlanStep(
            'establish-perimeter',
            'Establish safety perimeter',
            ['secure-area'],
            90
          )
        );
        break;

      case GoalType.EXPLORATION:
        steps.push(
          this.createPlanStep('plan-route', 'Plan exploration route', [], 40),
          this.createPlanStep(
            'gather-supplies',
            'Gather exploration supplies',
            ['plan-route'],
            80
          ),
          this.createPlanStep(
            'begin-exploration',
            'Begin systematic exploration',
            ['gather-supplies'],
            300
          )
        );
        break;

      case GoalType.SOCIAL:
        steps.push(
          this.createPlanStep(
            'locate-entities',
            'Locate social entities',
            [],
            50
          ),
          this.createPlanStep(
            'initiate-contact',
            'Initiate social contact',
            ['locate-entities'],
            120
          ),
          this.createPlanStep(
            'build-rapport',
            'Build social rapport',
            ['initiate-contact'],
            180
          )
        );
        break;

      case GoalType.ACHIEVEMENT:
        steps.push(
          this.createPlanStep(
            'define-objectives',
            'Define specific objectives',
            [],
            60
          ),
          this.createPlanStep(
            'gather-tools',
            'Gather necessary tools',
            ['define-objectives'],
            90
          ),
          this.createPlanStep(
            'execute-tasks',
            'Execute planned tasks',
            ['gather-tools'],
            240
          )
        );
        break;

      case GoalType.CREATIVITY:
        steps.push(
          this.createPlanStep(
            'brainstorm-ideas',
            'Brainstorm creative ideas',
            [],
            90
          ),
          this.createPlanStep(
            'select-concept',
            'Select best concept',
            ['brainstorm-ideas'],
            45
          ),
          this.createPlanStep(
            'implement-solution',
            'Implement creative solution',
            ['select-concept'],
            180
          )
        );
        break;

      case GoalType.CURIOSITY:
        steps.push(
          this.createPlanStep(
            'identify-questions',
            'Identify key questions',
            [],
            30
          ),
          this.createPlanStep(
            'investigate',
            'Investigate phenomena',
            ['identify-questions'],
            150
          ),
          this.createPlanStep(
            'synthesize-knowledge',
            'Synthesize new knowledge',
            ['investigate'],
            90
          )
        );
        break;

      default:
        steps.push(
          this.createPlanStep(
            'analyze-situation',
            'Analyze current situation',
            [],
            60
          ),
          this.createPlanStep(
            'take-action',
            'Take appropriate action',
            ['analyze-situation'],
            120
          )
        );
    }

    // Adjust for urgency
    if (context.timeConstraints.urgency === 'emergency') {
      steps.forEach((step) => {
        step.estimatedDuration = Math.max(10, step.estimatedDuration * 0.3);
      });
    }

    return steps;
  }

  /**
   * Create a standardized plan step
   */
  private createPlanStep(
    id: string,
    description: string,
    dependencies: string[],
    duration: number
  ): any {
    return {
      id,
      action: {
        id,
        type: description,
        parameters: {},
        preconditions: {},
        effects: { [id.replace('-', '_')]: true },
        cost: duration / 60, // Convert to relative cost
        estimatedDuration: duration,
      },
      status: 'pending' as const,
      dependencies,
      estimatedDuration: duration,
      resources: [
        { type: 'time', amount: duration, availability: 'available' as const },
        {
          type: 'energy',
          amount: Math.ceil(duration / 30),
          availability: 'available' as const,
        },
      ],
    };
  }

  // Placeholder implementations for missing methods
  private generateAlternativePlans(planGeneration: any): Plan[] {
    return [];
  }
  private extractConstraints(goal: Goal, context: PlanningContext): string[] {
    return [];
  }
  private mapResources(resources: Resource[]): Record<string, number> {
    return {};
  }
  private applyPlanningStyle(
    plan: Plan,
    style: string,
    context: PlanningContext
  ): Plan {
    return plan;
  }
  private convertToGOAPGoal(goal: Goal): any {
    return {};
  }
  private convertToGOAPState(worldState: any): any {
    return {};
  }
  private mergeHRMAndHTNSteps(
    hrmNodes: any[],
    htnSteps: any[],
    goal: Goal
  ): any[] {
    return [];
  }
  private convertHRMNodesToSteps(nodes: any[], goal: Goal): any[] {
    if (!nodes || nodes.length === 0) {
      return [];
    }

    // Convert HRM plan nodes to concrete steps
    const steps = nodes
      .filter((node) => node.type === 'subgoal' || node.type === 'action')
      .map((node, index) => ({
        id: `step-${Date.now()}-${index + 1}`,
        name: node.description,
        status: 'pending',
        priority: node.priority || 0.5,
        estimatedDuration: node.estimatedDuration || 10000,
        dependencies: node.dependencies || [],
        constraints: node.constraints || [],
        action: this.mapNodeToAction(node, goal),
      }));

    return steps;
  }

  private mapNodeToAction(node: any, goal: Goal): any {
    const description = node.description.toLowerCase();

    // Map common Minecraft actions
    if (description.includes('gather') || description.includes('collect')) {
      return {
        type: 'gather_resources',
        parameters: {
          resource_type: 'any',
          radius: 10,
          max_items: 10,
        },
      };
    } else if (description.includes('locate') || description.includes('find')) {
      return {
        type: 'explore_area',
        parameters: {
          radius: 20,
          target_type: 'resources',
        },
      };
    } else if (
      description.includes('navigate') ||
      description.includes('move')
    ) {
      return {
        type: 'navigate',
        parameters: {
          target: 'auto_detect',
          max_distance: 50,
        },
      };
    } else if (description.includes('mine') || description.includes('dig')) {
      return {
        type: 'dig_block',
        parameters: {
          pos: 'nearest_valuable',
          tool: 'auto_select',
        },
      };
    } else if (description.includes('craft')) {
      return {
        type: 'craft_item',
        parameters: {
          item: 'auto_detect',
          materials: 'auto_collect',
        },
      };
    } else if (
      description.includes('build') ||
      description.includes('construct')
    ) {
      return {
        type: 'place_block',
        parameters: {
          block_type: 'auto_select',
          position: 'optimal_location',
        },
      };
    }

    // Default action for unknown descriptions
    return {
      type: 'explore_environment',
      parameters: {
        duration: 5000,
        radius: 10,
      },
    };
  }
  private convertHRMStatus(status: any): PlanStatus {
    return PlanStatus.PENDING;
  }
  private async assessFeasibility(
    plan: Plan,
    context: PlanningContext
  ): Promise<number> {
    return 0.8;
  }
  private async assessOptimality(
    plan: Plan,
    context: PlanningContext
  ): Promise<number> {
    return 0.7;
  }
  private async assessCoherence(
    plan: Plan,
    context: PlanningContext
  ): Promise<number> {
    return 0.9;
  }
  private async assessRisk(
    plan: Plan,
    context: PlanningContext
  ): Promise<number> {
    return 0.2;
  }
  private setupPlanMonitoring(plan: Plan): void {}
  private async preValidatePlanSteps(
    plan: Plan,
    context: PlanningContext
  ): Promise<void> {}

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): any {
    return this.performanceMetrics.getMetrics();
  }

  /**
   * Get planning history
   */
  getPlanningHistory(): IntegratedPlanningResult[] {
    return [...this.planningHistory];
  }
}

/**
 * Performance metrics tracking for the integrated planner
 */
class PlanningPerformanceMetrics {
  private sessions: IntegratedPlanningResult[] = [];

  recordPlanningSession(result: IntegratedPlanningResult): void {
    this.sessions.push(result);
  }

  getMetrics(): any {
    if (this.sessions.length === 0) return {};

    return {
      totalSessions: this.sessions.length,
      averageLatency:
        this.sessions.reduce((sum, s) => sum + s.planningLatency, 0) /
        this.sessions.length,
      averageConfidence:
        this.sessions.reduce((sum, s) => sum + s.confidence, 0) /
        this.sessions.length,
      approachDistribution: this.getApproachDistribution(),
      successRate:
        this.sessions.filter((s) => s.estimatedSuccess > 0.7).length /
        this.sessions.length,
    };
  }

  private getApproachDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    this.sessions.forEach((session) => {
      distribution[session.planningApproach] =
        (distribution[session.planningApproach] || 0) + 1;
    });
    return distribution;
  }
}

/**
 * Factory function for creating the integrated planning coordinator
 */
export function createIntegratedPlanningCoordinator(
  config?: Partial<PlanningConfiguration>
): IntegratedPlanningCoordinator {
  return new IntegratedPlanningCoordinator(config);
}
