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
  UtilityContext
} from './types';

// Import our HRM-inspired components
import { 
  CognitiveTaskRouter, 
  createCognitiveRouter,
  TaskDecision,
  TaskType,
  RouterType
} from './hierarchical-planner/cognitive-router';

import { 
  HRMInspiredPlanner, 
  createHRMPlanner,
  HRMPlan,
  HRMPlanNode
} from './hierarchical-planner/hrm-inspired-planner';

// Classical planning components
import { HierarchicalPlanner } from './hierarchical-planner/hierarchical-planner';
import { ReactiveExecutor } from './reactive-executor/reactive-executor';
import { GOAPPlanner } from './reactive-executor/goap-planner';

// Goal formulation components
import { HomeostasisMonitor } from './goal-formulation/homeostasis-monitor';
import { NeedGenerator } from './goal-formulation/need-generator';
import { GoalManager } from './goal-formulation/goal-manager';
import { UtilityCalculator } from './goal-formulation/utility-calculator';

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
  routingDecision: TaskDecision;
  planningApproach: 'hrm' | 'htn' | 'goap' | 'hybrid';
  confidence: number;
  estimatedSuccess: number;
  planningLatency: number;
  
  // Detailed breakdown
  goalFormulation: {
    identifiedNeeds: Need[];
    generatedGoals: Goal[];
    priorityRanking: Array<{ goalId: string; score: number; reasoning: string }>;
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
  private cognitiveRouter: CognitiveTaskRouter;
  private hrmPlanner: HRMInspiredPlanner;
  
  // Classical Components  
  private htnPlanner: HierarchicalPlanner;
  private goapPlanner: GOAPPlanner;
  private reactiveExecutor: ReactiveExecutor;
  
  // Goal Formulation Components
  private homeostasisMonitor: HomeostasisMonitor;
  private needGenerator: NeedGenerator;
  private goalManager: GoalManager;
  private utilityCalculator: UtilityCalculator;
  
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
      const goalFormulation = await this.performGoalFormulation(signals, context);
      
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
        qualityAssessment
      };
      
      // Record performance metrics
      this.performanceMetrics.recordPlanningSession(result);
      
      // Emit planning completion event
      this.emit('planningComplete', result);
      
      return result;
      
    } catch (error) {
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
    const homeostasisState = this.homeostasisMonitor.analyzeSignals(signals);
    const identifiedNeeds = this.needGenerator.generateNeeds(homeostasisState, context);
    
    // Transform needs into candidate goals
    const candidateGoals = await this.goalManager.generateCandidateGoals(
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
      time: Date.now()
    };
    
    const priorityRanking = candidateGoals.map(goal => ({
      goalId: goal.id,
      score: this.utilityCalculator.calculateUtility(goal, utilityContext),
      reasoning: this.generatePriorityReasoning(goal, utilityContext)
    })).sort((a, b) => b.score - a.score);
    
    // Select top goals for planning
    const generatedGoals = priorityRanking
      .slice(0, 5) // Top 5 goals
      .map(ranking => candidateGoals.find(g => g.id === ranking.goalId)!)
      .filter(Boolean);
    
    return {
      identifiedNeeds,
      generatedGoals,
      priorityRanking
    };
  }

  /**
   * Step 2: Cognitive Routing - Determine planning approach
   */
  private async performCognitiveRouting(
    goals: Goal[], 
    context: PlanningContext
  ): Promise<TaskDecision> {
    
    if (goals.length === 0) {
      throw new Error('No goals provided for cognitive routing');
    }
    
    // Use the primary goal for routing decision
    const primaryGoal = goals[0];
    const taskDescription = this.goalToTaskDescription(primaryGoal, context);
    
    const routingContext = {
      domain: this.mapGoalDomain(primaryGoal.type),
      urgency: context.timeConstraints.urgency,
      requiresStructured: this.requiresStructuredReasoning(primaryGoal),
      requiresCreativity: this.requiresCreativeReasoning(primaryGoal),
      requiresWorldKnowledge: this.requiresWorldKnowledge(primaryGoal),
    };
    
    return this.cognitiveRouter.routeTask(taskDescription, routingContext);
  }

  /**
   * Step 3: Plan Generation - Generate plans using selected approach
   */
  private async performPlanGeneration(
    goals: Goal[],
    routingDecision: TaskDecision,
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
          this.generateHTNPlan(primaryGoal, context, 'balanced')
        ]);
        
        hrmPlan = hrmResult;
        htnPlan = htnResult;
        selectedPlan = await this.mergeCollaborativePlans(hrmResult, htnResult, primaryGoal);
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
      selectionReasoning
    };
  }

  /**
   * Generate HRM-style hierarchical plan
   */
  private async generateHRMPlan(goal: Goal, context: PlanningContext): Promise<HRMPlan> {
    const planningContext = {
      goal: {
        id: goal.id,
        description: goal.description,
        type: 'primary' as const
      },
      currentState: context.worldState,
      constraints: this.extractConstraints(goal, context),
      resources: this.mapResources(context.availableResources),
      urgency: context.timeConstraints.urgency,
      domain: this.mapGoalDomain(goal.type) as 'minecraft' | 'general' | 'spatial' | 'logical'
    };
    
    return this.hrmPlanner.plan(planningContext);
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
    const plan = this.htnPlanner.decompose(goal);
    
    if (!plan) {
      throw new Error(`HTN planner failed to generate plan for goal: ${goal.id}`);
    }
    
    // Enhance with style-specific modifications
    return this.applyPlanningStyle(plan, style, context);
  }

  /**
   * Generate GOAP reactive plan
   */
  private async generateGOAPPlan(goal: Goal, context: PlanningContext): Promise<Plan> {
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
      priority: Math.max(hrmPlan.finalConfidence, htnPlan.priority),
      estimatedDuration: Math.min(hrmPlan.estimatedLatency || 0, htnPlan.estimatedDuration),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      successProbability: (hrmPlan.finalConfidence + htnPlan.successProbability) / 2
    };
    
    // Map HRM nodes to plan steps, augment with HTN details
    mergedPlan.steps = this.mergeHRMAndHTNSteps(hrmPlan.nodes, htnPlan.steps, goal);
    
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
      status: this.convertHRMStatus(hrmPlan.status),
      priority: hrmPlan.finalConfidence,
      estimatedDuration: hrmPlan.estimatedLatency || 0,
      createdAt: hrmPlan.createdAt,
      updatedAt: hrmPlan.updatedAt,
      successProbability: hrmPlan.finalConfidence
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
      riskScore: await this.assessRisk(plan, context)
    };
  }

  /**
   * Step 5: Prepare plan for execution
   */
  private async preparePlanExecution(plan: Plan, context: PlanningContext): Promise<void> {
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
  private mergeWithDefaults(config: Partial<PlanningConfiguration>): PlanningConfiguration {
    return {
      hrmConfig: {
        maxRefinements: 3,
        qualityThreshold: 0.8,
        hrmLatencyTarget: 100,
        enableIterativeRefinement: true,
        ...config.hrmConfig
      },
      htnConfig: {
        maxDecompositionDepth: 5,
        methodCacheSize: 100,
        preferenceWeights: { efficiency: 0.3, safety: 0.4, creativity: 0.3 },
        ...config.htnConfig
      },
      goapConfig: {
        maxPlanLength: 10,
        planningBudgetMs: 20,
        repairThreshold: 0.8,
        ...config.goapConfig
      },
      coordinatorConfig: {
        routingStrategy: 'hybrid',
        fallbackTimeout: 5000,
        enablePlanMerging: true,
        enableCrossValidation: true,
        ...config.coordinatorConfig
      }
    };
  }

  private initializeComponents(): void {
    // Initialize HRM components
    this.cognitiveRouter = createCognitiveRouter({
      hrmLatencyTarget: this.config.hrmConfig.hrmLatencyTarget,
      llmLatencyTarget: 400,
      emergencyLatencyLimit: 50
    });
    
    this.hrmPlanner = createHRMPlanner({
      maxRefinements: this.config.hrmConfig.maxRefinements,
      qualityThreshold: this.config.hrmConfig.qualityThreshold
    });
    
    // Initialize classical components
    this.htnPlanner = new HierarchicalPlanner();
    this.goapPlanner = new GOAPPlanner();
    this.reactiveExecutor = new ReactiveExecutor();
    
    // Initialize goal formulation components
    this.homeostasisMonitor = new HomeostasisMonitor();
    this.needGenerator = new NeedGenerator();
    this.goalManager = new GoalManager();
    this.utilityCalculator = new UtilityCalculator();
  }

  // Utility methods for conversions and mappings
  private goalToTaskDescription(goal: Goal, context: PlanningContext): string {
    return `${goal.description} with urgency ${context.timeConstraints.urgency} and threat level ${context.situationalFactors.threatLevel}`;
  }

  private mapGoalDomain(goalType: GoalType): string {
    const mapping: Record<GoalType, string> = {
      [GoalType.SURVIVAL]: 'survival',
      [GoalType.SAFETY]: 'safety', 
      [GoalType.EXPLORATION]: 'spatial',
      [GoalType.SOCIAL]: 'social',
      [GoalType.ACHIEVEMENT]: 'logical',
      [GoalType.CREATIVITY]: 'creative',
      [GoalType.CURIOSITY]: 'exploration'
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
    return [GoalType.EXPLORATION, GoalType.SOCIAL, GoalType.CURIOSITY].includes(goal.type);
  }

  private generatePriorityReasoning(goal: Goal, context: UtilityContext): string {
    return `Goal ${goal.description} prioritized due to ${goal.type} need with utility score based on current homeostasis`;
  }

  private determinePlanningApproach(routingDecision: TaskDecision): 'hrm' | 'htn' | 'goap' | 'hybrid' {
    switch (routingDecision.router) {
      case 'hrm_structured': return 'hrm';
      case 'llm': return 'htn';
      case 'collaborative': return 'hybrid';
      default: return 'htn';
    }
  }

  // Placeholder implementations for missing methods
  private generateAlternativePlans(planGeneration: any): Plan[] { return []; }
  private extractConstraints(goal: Goal, context: PlanningContext): string[] { return []; }
  private mapResources(resources: Resource[]): Record<string, number> { return {}; }
  private applyPlanningStyle(plan: Plan, style: string, context: PlanningContext): Plan { return plan; }
  private convertToGOAPGoal(goal: Goal): any { return {}; }
  private convertToGOAPState(worldState: any): any { return {}; }
  private mergeHRMAndHTNSteps(hrmNodes: any[], htnSteps: any[], goal: Goal): any[] { return []; }
  private convertHRMNodesToSteps(nodes: any[], goal: Goal): any[] { return []; }
  private convertHRMStatus(status: any): PlanStatus { return PlanStatus.PENDING; }
  private async assessFeasibility(plan: Plan, context: PlanningContext): Promise<number> { return 0.8; }
  private async assessOptimality(plan: Plan, context: PlanningContext): Promise<number> { return 0.7; }
  private async assessCoherence(plan: Plan, context: PlanningContext): Promise<number> { return 0.9; }
  private async assessRisk(plan: Plan, context: PlanningContext): Promise<number> { return 0.2; }
  private setupPlanMonitoring(plan: Plan): void {}
  private async preValidatePlanSteps(plan: Plan, context: PlanningContext): Promise<void> {}

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
      averageLatency: this.sessions.reduce((sum, s) => sum + s.planningLatency, 0) / this.sessions.length,
      averageConfidence: this.sessions.reduce((sum, s) => sum + s.confidence, 0) / this.sessions.length,
      approachDistribution: this.getApproachDistribution(),
      successRate: this.sessions.filter(s => s.estimatedSuccess > 0.7).length / this.sessions.length
    };
  }

  private getApproachDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    this.sessions.forEach(session => {
      distribution[session.planningApproach] = (distribution[session.planningApproach] || 0) + 1;
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
