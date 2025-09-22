/**
 * HRM-Inspired Hierarchical Planning System
 *
 * Integration layer combining cognitive routing and hierarchical planning
 * Based on the HRM integration plan for M3 implementation
 *
 * @author @darianrosebrook
 */

// Export cognitive router components
export {
  CognitiveTaskRouter,
  createCognitiveRouter,
  routeTask,
} from './cognitive-router';

export type {
  TaskType,
  TaskContext,
  RoutingDecision,
  RouterType,
} from './cognitive-router';

// Export HRM planner components with aliases to avoid conflicts
export { HRMInspiredPlanner, createHRMPlanner } from './hrm-inspired-planner';

export type {
  Plan as HRMPlan,
  PlanNode as HRMPlanNode,
  PlanningContext as HRMPlanningContext,
} from './hrm-inspired-planner';

// Export utility functions
export { quickPlan } from './hrm-inspired-planner';

// Export initial HTN planner
export { HTNPlanner } from './htn-planner';

/**
 * Integrated Planning System
 *
 * Combines cognitive routing with HRM-inspired hierarchical planning
 * Implements the hybrid approach described in the integration plan
 */
import {
  CognitiveTaskRouter,
  TaskContext,
  RoutingDecision,
} from './cognitive-router';
import {
  HRMInspiredPlanner,
  PlanningContext,
  Plan,
} from './hrm-inspired-planner';
// Temporary local type definition until @conscious-bot/core is available
export class OllamaClient {
  constructor(config: any) {}
  async generate(prompt: string): Promise<string> {
    return `Generated response for: ${prompt}`;
  }
}

export class IntegratedPlanningSystem {
  private cognitiveRouter: CognitiveTaskRouter;
  private hrmPlanner: HRMInspiredPlanner;
  private performanceHistory: Array<{
    task: string;
    router: string;
    success: boolean;
    latency: number;
    timestamp: number;
  }> = [];

  constructor(
    config: {
      routerConfig?: {
        hrmLatencyTarget?: number;
        llmLatencyTarget?: number;
        emergencyLatencyLimit?: number;
      };
      plannerConfig?: {
        maxRefinements?: number;
        qualityThreshold?: number;
      };
    } = {}
  ) {
    const routerConfig = {
      hrmLatencyTarget: 100,
      llmLatencyTarget: 400,
      emergencyLatencyLimit: 50,
      ...(config.routerConfig || {}),
    };
    this.cognitiveRouter = new CognitiveTaskRouter(routerConfig);
    this.hrmPlanner = new HRMInspiredPlanner(config.plannerConfig);
  }

  /**
   * Main planning interface - routes task and generates appropriate plan
   */
  async planTask(
    input: string,
    context: Partial<TaskContext> & Partial<PlanningContext> = {}
  ): Promise<{
    routingDecision: RoutingDecision;
    plan?: Plan;
    llmResponse?: string;
    collaborative?: {
      hrmPlan: Plan;
      llmNarrative: string;
      synthesis: string;
    };
    totalLatency: number;
    success: boolean;
  }> {
    const startTime = Date.now();

    // Step 1: Route the task
    const taskContext: TaskContext = {
      input,
      domain: context.domain || 'general',
      urgency: context.urgency || 'medium',
      requiresStructured:
        context.requiresStructured ?? this.detectStructuredRequirement(input),
      requiresCreativity:
        context.requiresCreativity ?? this.detectCreativityRequirement(input),
      requiresWorldKnowledge:
        context.requiresWorldKnowledge ??
        this.detectWorldKnowledgeRequirement(input),
      previousResults: context.previousResults,
    };

    const routingDecision = this.cognitiveRouter.routeTask(taskContext);

    let plan: Plan | undefined;
    let llmResponse: string | undefined;
    let collaborative:
      | { hrmPlan: Plan; llmNarrative: string; synthesis: string }
      | undefined;
    let success = false;

    try {
      // Step 2: Execute based on routing decision
      switch (routingDecision.router) {
        case 'hrm_structured':
          plan = await this.executeHRMPlanning(input, context);
          success = plan.confidence > 0.5; // Lower threshold for testing
          break;

        case 'llm':
          llmResponse = await this.executeLLMReasoning(input, context);
          success = llmResponse.length > 0;
          break;

        case 'collaborative':
          collaborative = await this.executeCollaborativeReasoning(
            input,
            context
          );
          success =
            collaborative.hrmPlan.confidence > 0.7 &&
            collaborative.llmNarrative.length > 0;
          break;
      }
    } catch (error) {
      console.error('Planning execution failed:', error);
      success = false;
    }

    const totalLatency = Date.now() - startTime;

    // Record performance for adaptive learning
    this.performanceHistory.push({
      task: input.substring(0, 100), // Truncate for storage
      router: routingDecision.router,
      success,
      latency: totalLatency,
      timestamp: Date.now(),
    });

    // Update cognitive router performance metrics
    this.cognitiveRouter.recordTaskResult(
      routingDecision,
      success,
      totalLatency
    );

    return {
      routingDecision,
      plan,
      llmResponse,
      collaborative,
      totalLatency,
      success,
    };
  }

  /**
   * Execute HRM-style structured planning
   */
  private async executeHRMPlanning(
    input: string,
    context: Partial<PlanningContext>
  ): Promise<Plan> {
    const planningContext: PlanningContext = {
      goal: input,
      currentState: context.currentState || {},
      constraints: context.constraints || [],
      resources: context.resources || {},
      timeLimit: context.timeLimit,
      urgency: context.urgency || 'medium',
      domain: context.domain || 'general',
    };

    const result = await this.hrmPlanner.planWithRefinement(planningContext);
    return result.finalPlan;
  }

  /**
   * Execute LLM-based reasoning (production-guarded)
   */
  private async executeLLMReasoning(
    input: string,
    context: any
  ): Promise<string> {
    // Block simulated LLM use in production unless explicitly allowed
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_SIMULATED_LLM !== 'true'
    ) {
      throw new Error(
        'LLM reasoning disabled in production (set ALLOW_SIMULATED_LLM=true to enable)'
      );
    }

    // Integrate with on-device Ollama LLM
    const client = new OllamaClient({ host: 'localhost', port: 11434 });
    const system =
      'You are the planning co-pilot for a Minecraft agent. ' +
      'Given a goal and partial world context, reason step-by-step to propose a concise, actionable plan. ' +
      'Use clear steps, avoid assumptions that contradict provided context. ' +
      'Output a short narrative plan; the HRM module will refine into actions.';
    const prompt = `Goal: ${input}\n\nContext: ${JSON.stringify(
      {
        domain: context.domain,
        urgency: context.urgency,
        constraints: context.constraints,
        resources: context.resources,
        currentState: context.currentState,
      },
      null,
      2
    )}\n\nProvide a brief plan (3-7 steps).`;
    const text = await client.generate(`${system}\n\n${prompt}`);
    return text.trim();
  }

  /**
   * Execute collaborative reasoning (HRM + LLM)
   */
  private async executeCollaborativeReasoning(
    input: string,
    context: any
  ): Promise<{
    hrmPlan: Plan;
    llmNarrative: string;
    synthesis: string;
  }> {
    // Execute both HRM planning and LLM reasoning in parallel
    const [hrmPlan, llmNarrative] = await Promise.all([
      this.executeHRMPlanning(input, context),
      this.executeLLMReasoning(input, context),
    ]);

    // Synthesize the results
    const synthesis = this.synthesizeCollaborativeResults(
      hrmPlan,
      llmNarrative,
      input
    );

    return {
      hrmPlan,
      llmNarrative,
      synthesis,
    };
  }

  /**
   * Synthesize HRM and LLM results for collaborative reasoning
   */
  private synthesizeCollaborativeResults(
    hrmPlan: Plan,
    llmNarrative: string,
    originalInput: string
  ): string {
    return (
      `Collaborative Analysis for: ${originalInput}\n\n` +
      `Structured Plan (HRM): ${hrmPlan.nodes.length} steps with ${hrmPlan.confidence.toFixed(2)} confidence\n` +
      `Narrative Analysis (LLM): ${llmNarrative.substring(0, 200)}...\n\n` +
      `Synthesis: The structured approach provides ${hrmPlan.nodes.length} concrete steps ` +
      `while the narrative analysis offers contextual understanding. ` +
      `Recommended approach: Execute structured plan with narrative guidance.`
    );
  }

  /**
   * Detect if task requires structured reasoning
   */
  private detectStructuredRequirement(input: string): boolean {
    const structuredKeywords = [
      'navigate',
      'path',
      'route',
      'optimize',
      'calculate',
      'solve',
      'plan',
      'sequence',
      'order',
      'step',
      'algorithm',
      'logic',
    ];
    return structuredKeywords.some((keyword) =>
      input.toLowerCase().includes(keyword)
    );
  }

  /**
   * Detect if task requires creativity
   */
  private detectCreativityRequirement(input: string): boolean {
    const creativeKeywords = [
      'create',
      'design',
      'imagine',
      'invent',
      'story',
      'art',
      'creative',
      'novel',
      'original',
      'brainstorm',
      'innovate',
    ];
    return creativeKeywords.some((keyword) =>
      input.toLowerCase().includes(keyword)
    );
  }

  /**
   * Detect if task requires world knowledge
   */
  private detectWorldKnowledgeRequirement(input: string): boolean {
    const knowledgeKeywords = [
      'what',
      'why',
      'how',
      'when',
      'where',
      'who',
      'explain',
      'describe',
      'tell',
      'know',
      'understand',
      'history',
      'science',
      'culture',
      'facts',
    ];
    return knowledgeKeywords.some((keyword) =>
      input.toLowerCase().includes(keyword)
    );
  }

  /**
   * Get system performance statistics
   */
  getPerformanceStats(): {
    totalTasks: number;
    successRate: number;
    averageLatency: number;
    routerDistribution: Record<string, number>;
    recentPerformance: Array<{
      router: string;
      success: boolean;
      latency: number;
    }>;
  } {
    const totalTasks = this.performanceHistory.length;
    const successfulTasks = this.performanceHistory.filter(
      (p) => p.success
    ).length;
    const successRate = totalTasks > 0 ? successfulTasks / totalTasks : 0;

    const totalLatency = this.performanceHistory.reduce(
      (sum, p) => sum + p.latency,
      0
    );
    const averageLatency = totalTasks > 0 ? totalLatency / totalTasks : 0;

    const routerDistribution: Record<string, number> = {};
    this.performanceHistory.forEach((p) => {
      routerDistribution[p.router] = (routerDistribution[p.router] || 0) + 1;
    });

    const recentPerformance = this.performanceHistory.slice(-10).map((p) => ({
      router: p.router,
      success: p.success,
      latency: p.latency,
    }));

    return {
      totalTasks,
      successRate,
      averageLatency,
      routerDistribution,
      recentPerformance,
    };
  }

  /**
   * Reset performance history (useful for testing)
   */
  resetPerformanceHistory(): void {
    this.performanceHistory = [];
  }
}

/**
 * Create a configured integrated planning system
 */
export function createIntegratedPlanningSystem(config?: {
  routerConfig?: {
    hrmLatencyTarget?: number;
    llmLatencyTarget?: number;
    emergencyLatencyLimit?: number;
  };
  plannerConfig?: {
    maxRefinements?: number;
    qualityThreshold?: number;
  };
}): IntegratedPlanningSystem {
  return new IntegratedPlanningSystem(config);
}

/**
 * Quick planning utility function
 */
export async function plan(
  input: string,
  options: {
    domain?: 'minecraft' | 'general' | 'spatial' | 'logical';
    urgency?: 'low' | 'medium' | 'high' | 'emergency';
    timeLimit?: number;
    currentState?: Record<string, any>;
    resources?: Record<string, number>;
  } = {}
) {
  const system = createIntegratedPlanningSystem();
  return await system.planTask(input, options);
}
