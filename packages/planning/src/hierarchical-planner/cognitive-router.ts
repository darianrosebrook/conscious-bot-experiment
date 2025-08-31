/**
 * Cognitive Task Router
 *
 * Implements HRM-inspired task routing between LLM and structured reasoning
 * Based on the integration plan: "Mixture-of-Experts Routing" (lines 67-68)
 *
 * Routes problems to:
 * - LLM: Natural language, open-ended queries, social reasoning
 * - HRM-Style: Structured puzzles, navigation, logic problems
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// Core types for task routing
export const TaskTypeSchema = z.enum([
  'navigation',
  'logic_puzzle',
  'resource_optimization',
  'spatial_reasoning',
  'pattern_recognition',
  'natural_language',
  'social_interaction',
  'open_ended_query',
  'creative_task',
  'ethical_decision',
]);

export type TaskType = z.infer<typeof TaskTypeSchema>;

export const RouterTypeSchema = z.enum([
  'llm',
  'hrm_structured',
  'collaborative',
]);
export type RouterType = z.infer<typeof RouterTypeSchema>;

export const RoutingDecisionSchema = z.object({
  taskType: TaskTypeSchema,
  confidence: z.number().min(0).max(1),
  router: RouterTypeSchema,
  reasoning: z.string(),
  expectedLatency: z.number(), // milliseconds
  complexity: z.number().min(1).max(10),
});

export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

export const TaskContextSchema = z.object({
  input: z.string(),
  domain: z.enum(['minecraft', 'general', 'spatial', 'logical']),
  urgency: z.enum(['low', 'medium', 'high', 'emergency']),
  requiresStructured: z.boolean(),
  requiresCreativity: z.boolean(),
  requiresWorldKnowledge: z.boolean(),
  previousResults: z.array(z.any()).optional(),
});

export type TaskContext = z.infer<typeof TaskContextSchema>;

/**
 * HRM-Inspired Cognitive Router
 *
 * Implements the "gating function" described in the integration plan
 * to direct problems to appropriate reasoning systems.
 */
export class CognitiveTaskRouter {
  private routingHistory: RoutingDecision[] = [];
  private performanceMetrics: Map<
    string,
    { success: number; total: number; avgLatency: number }
  > = new Map();

  constructor(
    private config: {
      hrmLatencyTarget: number; // 100ms as per integration plan
      llmLatencyTarget: number; // 400ms baseline
      emergencyLatencyLimit: number; // 50ms for critical decisions
    } = {
      hrmLatencyTarget: 100,
      llmLatencyTarget: 400,
      emergencyLatencyLimit: 50,
    }
  ) {}

  /**
   * Main routing decision logic
   * Based on integration plan task routing criteria
   */
  routeTask(context: TaskContext): RoutingDecision {
    const taskType = this.classifyTask(context);
    const router = this.selectRouter(taskType, context);
    const complexity = this.estimateComplexity(context);
    const expectedLatency = this.estimateLatency(router, complexity);

    const decision: RoutingDecision = {
      taskType,
      confidence: this.calculateConfidence(taskType, context),
      router,
      reasoning: this.generateReasoning(taskType, context, router),
      expectedLatency,
      complexity,
    };

    this.routingHistory.push(decision);
    return decision;
  }

  /**
   * Classify the task type based on input analysis
   * Implements the detection logic from integration plan
   */
  private classifyTask(context: TaskContext): TaskType {
    const {
      input,
      requiresStructured,
      requiresCreativity,
      requiresWorldKnowledge,
    } = context;
    const inputLower = input.toLowerCase();

    // Emergency detection takes highest precedence
    if (this.isEmergencySituation(inputLower)) {
      // Emergency situations should route to fastest available system
      // Check if it's a navigation/action emergency vs communication emergency
      if (
        this.isEmergencyAction(inputLower) ||
        inputLower.includes('falling') ||
        inputLower.includes('lava') ||
        inputLower.includes('hostile') ||
        inputLower.includes('mobs')
      ) {
        return 'navigation'; // Route to HRM for fast action
      }
      // Communication emergencies still use LLM but with priority
    }

    // Explicit creativity indicators take precedence
    if (this.isCreativeTask(inputLower) || requiresCreativity)
      return 'creative_task';

    // Enhanced ethical decisions detection (check early as they use specific keywords)
    if (this.isEthicalDecision(inputLower)) return 'ethical_decision';

    // Structured reasoning tasks (HRM candidates)
    if (this.isNavigationTask(inputLower)) return 'navigation';
    if (this.isLogicPuzzle(inputLower)) return 'logic_puzzle';
    if (this.isSpatialReasoning(inputLower)) return 'spatial_reasoning';
    if (this.isPatternRecognition(inputLower)) return 'pattern_recognition';

    // Resource optimization (check after specific navigation/logic)
    if (this.isResourceOptimization(inputLower)) return 'resource_optimization';

    // Language-heavy tasks (LLM candidates)
    if (this.isSocialInteraction(inputLower)) return 'social_interaction';
    if (requiresWorldKnowledge && !requiresStructured)
      return 'natural_language';

    // Default to open-ended
    return 'open_ended_query';
  }

  /**
   * Select the appropriate router based on task classification
   * Implements the routing logic from the integration plan
   */
  private selectRouter(
    taskType: TaskType,
    context: TaskContext
  ): 'llm' | 'hrm_structured' | 'collaborative' {
    // Enhanced emergency constraint: use fastest available (HRM preferred)
    if (
      context.urgency === 'emergency' ||
      this.isEmergencySituation(context.input.toLowerCase())
    ) {
      // For emergency situations, prioritize HRM for action-oriented tasks
      if (
        [
          'navigation',
          'logic_puzzle',
          'spatial_reasoning',
          'resource_optimization',
        ].includes(taskType)
      ) {
        return 'hrm_structured';
      }
      // For communication emergencies, still use LLM but with reduced latency
      return 'llm';
    }

    // Structured reasoning -> HRM (as per integration plan)
    if (
      [
        'navigation',
        'logic_puzzle',
        'resource_optimization',
        'spatial_reasoning',
        'pattern_recognition',
      ].includes(taskType)
    ) {
      return 'hrm_structured';
    }

    // Ethical decisions -> Collaborative (HRM logic + LLM narrative)
    if (taskType === 'ethical_decision') {
      return 'collaborative';
    }

    // Language and creative tasks -> LLM
    if (
      [
        'natural_language',
        'social_interaction',
        'creative_task',
        'open_ended_query',
      ].includes(taskType)
    ) {
      return 'llm';
    }

    return 'llm'; // Default fallback
  }

  /**
   * Calculate routing confidence based on task characteristics
   */
  private calculateConfidence(
    taskType: TaskType,
    context: TaskContext
  ): number {
    let confidence = 0.7; // Base confidence

    // High confidence for clear structured tasks
    if (
      ['navigation', 'logic_puzzle', 'spatial_reasoning'].includes(taskType)
    ) {
      confidence += 0.2;
    }

    // High confidence for clear language tasks
    if (['social_interaction', 'natural_language'].includes(taskType)) {
      confidence += 0.15;
    }

    // Reduce confidence for mixed requirements
    if (context.requiresStructured && context.requiresCreativity) {
      confidence -= 0.1;
    }

    // Historical performance boost
    const historyKey = `${taskType}`;
    const metrics = this.performanceMetrics.get(historyKey);
    if (metrics && metrics.total > 5) {
      const successRate = metrics.success / metrics.total;
      confidence += (successRate - 0.5) * 0.2; // Boost based on historical success
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Estimate processing latency based on router and complexity
   */
  private estimateLatency(router: string, complexity: number): number {
    const baseLatency =
      {
        hrm_structured: this.config.hrmLatencyTarget,
        llm: this.config.llmLatencyTarget,
        collaborative:
          this.config.hrmLatencyTarget + this.config.llmLatencyTarget * 0.3,
      }[router] || this.config.llmLatencyTarget;

    // Scale by complexity (linear relationship)
    return Math.round(baseLatency * (0.5 + complexity * 0.1));
  }

  /**
   * Estimate task complexity (1-10 scale)
   */
  private estimateComplexity(context: TaskContext): number {
    let complexity = 3; // Base complexity

    // Input length factor
    const inputLength = context.input.length;
    if (inputLength > 500) complexity += 2;
    else if (inputLength > 200) complexity += 1;

    // Multiple requirements increase complexity
    let requirements = 0;
    if (context.requiresStructured) requirements++;
    if (context.requiresCreativity) requirements++;
    if (context.requiresWorldKnowledge) requirements++;
    complexity += requirements;

    // Domain-specific adjustments
    if (context.domain === 'logical') complexity += 1;
    if (context.domain === 'spatial') complexity += 1;

    return Math.max(1, Math.min(10, complexity));
  }

  /**
   * Generate human-readable reasoning for the routing decision
   */
  private generateReasoning(
    taskType: TaskType,
    context: TaskContext,
    router: string
  ): string {
    const routerMap = {
      hrm_structured: 'structured reasoning system',
      llm: 'language model',
      collaborative: 'hybrid reasoning (HRM + LLM)',
    };

    const urgencyNote =
      context.urgency === 'emergency' ? ' (emergency: prioritizing speed)' : '';

    const routerDescription =
      routerMap[router as keyof typeof routerMap] || 'unknown router';
    return `Task classified as ${taskType}. Routing to ${routerDescription} due to ${this.getTaskCharacteristics(taskType, context)}${urgencyNote}.`;
  }

  /**
   * Get key characteristics that influenced routing
   */
  private getTaskCharacteristics(
    taskType: TaskType,
    context: TaskContext
  ): string {
    if (
      ['navigation', 'logic_puzzle', 'spatial_reasoning'].includes(taskType)
    ) {
      return 'structured problem requiring precise reasoning';
    }
    if (['social_interaction', 'natural_language'].includes(taskType)) {
      return 'language-heavy task requiring world knowledge';
    }
    if (taskType === 'ethical_decision') {
      return 'ethical complexity requiring both logic and narrative understanding';
    }
    return 'mixed characteristics requiring flexible reasoning';
  }

  /**
   * Record performance metrics for adaptive routing
   */
  recordTaskResult(
    decision: RoutingDecision,
    success: boolean,
    actualLatency: number
  ): void {
    const key = `${decision.taskType}`;
    const current = this.performanceMetrics.get(key) || {
      success: 0,
      total: 0,
      avgLatency: 0,
    };

    current.total++;
    if (success) current.success++;
    current.avgLatency =
      (current.avgLatency * (current.total - 1) + actualLatency) /
      current.total;

    this.performanceMetrics.set(key, current);
  }

  /**
   * Get routing performance statistics
   */
  getRoutingStats(): {
    totalDecisions: number;
    accuracyByTaskType: Record<string, number>;
    avgLatencyByRouter: Record<string, number>;
    emergencyResponseRate: number;
  } {
    const totalDecisions = this.routingHistory.length;
    const accuracyByTaskType: Record<string, number> = {};
    const avgLatencyByRouter: Record<string, number> = {};

    // Calculate accuracy by task type
    for (const [key, metrics] of Array.from(
      this.performanceMetrics.entries()
    )) {
      accuracyByTaskType[key] =
        metrics.total > 0 ? metrics.success / metrics.total : 0;
    }

    // Calculate average latency by router type
    const routerLatencies: Record<string, number[]> = {};
    for (const decision of this.routingHistory) {
      if (!routerLatencies[decision.router])
        routerLatencies[decision.router] = [];
      routerLatencies[decision.router].push(decision.expectedLatency);
    }

    for (const [router, latencies] of Object.entries(routerLatencies)) {
      avgLatencyByRouter[router] =
        latencies.reduce((a, b) => a + b, 0) / latencies.length;
    }

    // Emergency response rate (decisions under emergency latency limit)
    const emergencyResponses = this.routingHistory.filter(
      (d) => d.expectedLatency <= this.config.emergencyLatencyLimit
    ).length;
    const emergencyResponseRate =
      totalDecisions > 0 ? emergencyResponses / totalDecisions : 0;

    return {
      totalDecisions,
      accuracyByTaskType,
      avgLatencyByRouter,
      emergencyResponseRate,
    };
  }

  // Task classification helper methods

  private isNavigationTask(input: string): boolean {
    const navKeywords = [
      'path',
      'route',
      'navigate',
      'find way',
      'shortest',
      'maze',
      'go to',
      'travel',
    ];
    return navKeywords.some((keyword) => input.includes(keyword));
  }

  private isLogicPuzzle(input: string): boolean {
    const puzzleKeywords = [
      'puzzle',
      'solve',
      'sudoku',
      'riddle',
      'if then',
      'logic',
      'deduce',
    ];
    return puzzleKeywords.some((keyword) => input.includes(keyword));
  }

  private isResourceOptimization(input: string): boolean {
    const resourceKeywords = [
      'optimize',
      'efficient',
      'minimize',
      'maximize',
      'resource',
      'cost',
      'best',
    ];
    return resourceKeywords.some((keyword) => input.includes(keyword));
  }

  private isSpatialReasoning(input: string): boolean {
    const spatialKeywords = [
      'spatial',
      'location',
      'position',
      'coordinates',
      'distance',
      'area',
      'volume',
    ];
    return spatialKeywords.some((keyword) => input.includes(keyword));
  }

  private isPatternRecognition(input: string): boolean {
    const patternKeywords = [
      'pattern',
      'sequence',
      'series',
      'repeat',
      'cycle',
      'trend',
    ];
    return patternKeywords.some((keyword) => input.includes(keyword));
  }

  private isSocialInteraction(input: string): boolean {
    const socialKeywords = [
      'say',
      'tell',
      'ask',
      'respond',
      'social',
      'conversation',
      'communicate',
    ];
    return socialKeywords.some((keyword) => input.includes(keyword));
  }

  private isCreativeTask(input: string): boolean {
    const creativeKeywords = [
      'create',
      'design',
      'imagine',
      'invent',
      'story',
      'creative',
      'art',
      'tell me a story',
      // Exploration/curiosity intents should route to creative-style approaches
      'explore',
      'exploration',
      'unexplored',
      'brainstorm',
      'idea',
      'innovate',
      'discover',
      'investigate',
    ];
    return creativeKeywords.some((keyword) => input.includes(keyword));
  }

  private isEthicalDecision(input: string): boolean {
    // More specific ethical patterns to avoid false positives
    const ethicalPatterns = [
      /should i\b/i,
      /is it right\b/i,
      /is it wrong\b/i,
      /is it ok\b/i,
      /is it okay\b/i,
      /should we\b/i,
      /ought to\b/i,
      /ethical\b/i,
      /ethically\b/i,
      /moral\b/i,
      /morally\b/i,
      /right thing\b/i,
      /wrong to\b/i,
      /fair to\b/i,
      /ethics\b/i,
      /duty\b/i,
      /responsibility\b/i,
      /justice\b/i,
      /fairness\b/i,
      /good vs bad\b/i,
      /right vs wrong\b/i,
      /ethical dilemma\b/i,
      /moral choice\b/i,
      /ethical choice\b/i,
      /what should\b/i,
      /what would you do\b/i,
      /what do you think\b/i,
      /is this right\b/i,
      /is this wrong\b/i,
      /is this fair\b/i,
      /is this just\b/i,
      /is this ethical\b/i,
      /is this moral\b/i,
      /take from\b/i,
      /steal\b/i,
      /cheat\b/i,
      /lie\b/i,
      /truth\b/i,
      /honesty\b/i,
      /integrity\b/i,
      /trust\b/i,
      /betray\b/i,
      /loyalty\b/i,
      /friendship\b/i,
      /helping others\b/i,
      /selfish\b/i,
      /selfless\b/i,
      /altruistic\b/i,
      /benefit\b/i,
      /cost\b/i,
      /trade-off\b/i,
      /sacrifice\b/i,
      /consequence\b/i,
      /impact\b/i,
      /effect on\b/i,
      /hurt\b/i,
      /support\b/i,
      /oppose\b/i,
      /agree\b/i,
      /disagree\b/i,
      /consent\b/i,
      /permission\b/i,
      /authority\b/i,
      /power\b/i,
      /influence\b/i,
      /control\b/i,
      /freedom\b/i,
      /choice\b/i,
      /decision\b/i,
      /judgment\b/i,
      /evaluate\b/i,
      /assess\b/i,
      /consider\b/i,
      /think about\b/i,
      /reflect on\b/i,
      /ponder\b/i,
      /debate\b/i,
      /discuss\b/i,
      /argue\b/i,
      /reason\b/i,
      /justify\b/i,
      /explain why\b/i,
      /why should\b/i,
      /why would\b/i,
      /what if\b/i,
      /suppose\b/i,
      /imagine if\b/i,
      /consider if\b/i,
      /think if\b/i,
      /morally right/i,
      /morally wrong/i,
    ];

    // Check for ethical patterns with word boundaries
    const hasEthicalPattern = ethicalPatterns.some((pattern) =>
      pattern.test(input)
    );

    // Additional context check: if it's a simple help request, don't classify as ethical
    if (hasEthicalPattern && input.toLowerCase().includes('help')) {
      // Only classify as ethical if it's clearly about moral/ethical help, not practical help
      const moralHelpPatterns = [
        /help.*moral/i,
        /help.*ethical/i,
        /help.*right/i,
        /help.*wrong/i,
        /help.*decision/i,
        /help.*choice/i,
        /should.*help/i, // "Should I help..." is ethical
        /help.*player/i, // "help this player" in ethical context
        /help.*person/i, // "help this person" in ethical context
      ];
      if (!moralHelpPatterns.some((pattern) => pattern.test(input))) {
        return false; // It's practical help, not ethical help
      }
    }

    return hasEthicalPattern;
  }

  private isEmergencySituation(input: string): boolean {
    const emergencyKeywords = [
      'urgent',
      'critical',
      'emergency',
      'fast',
      'now',
      'immediately',
      'hurry',
      'speed',
      'priority',
    ];
    return emergencyKeywords.some((keyword) => input.includes(keyword));
  }

  private isEmergencyAction(input: string): boolean {
    const emergencyActionKeywords = [
      'go',
      'move',
      'run',
      'act',
      'execute',
      'perform',
      'do it',
      'do it now',
      'do it fast',
      'falling',
      'lava',
      'hostile',
      'mobs',
      'danger',
      'attack',
      'escape',
      'flee',
      'hide',
      'defend',
      'protect',
      'save',
      'rescue',
    ];
    return emergencyActionKeywords.some((keyword) => input.includes(keyword));
  }
}

/**
 * Factory function for creating configured cognitive router
 */
export function createCognitiveRouter(config?: {
  hrmLatencyTarget?: number;
  llmLatencyTarget?: number;
  emergencyLatencyLimit?: number;
}): CognitiveTaskRouter {
  const defaultConfig = {
    hrmLatencyTarget: 100,
    llmLatencyTarget: 400,
    emergencyLatencyLimit: 50,
    ...config,
  };
  return new CognitiveTaskRouter(defaultConfig);
}

/**
 * Utility function for quick task routing
 */
export function routeTask(
  input: string,
  options: Partial<TaskContext> = {}
): RoutingDecision {
  const router = createCognitiveRouter();
  const context: TaskContext = {
    input,
    domain: options.domain || 'general',
    urgency: options.urgency || 'medium',
    requiresStructured: options.requiresStructured ?? false,
    requiresCreativity: options.requiresCreativity ?? false,
    requiresWorldKnowledge: options.requiresWorldKnowledge ?? false,
    ...options,
  };

  return router.routeTask(context);
}
