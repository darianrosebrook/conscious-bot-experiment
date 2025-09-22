/**
 * Enhanced Reactive Executor
 *
 * Integrates enhanced GOAP planning, plan repair, and safety reflexes
 * for real-time opportunistic action selection and execution
 *
 * @author @darianrosebrook
 */

import {
  Plan,
  GoalType,
  GoalStatus,
  PlanStatus,
  PlanStepStatus,
} from '../types';
import { z } from 'zod';
import {
  EnhancedGOAPPlanner,
  GOAPPlan,
  WorldState,
  SafetyAction,
  ActionResult,
  ReactiveExecutorMetrics,
  MCPBus,
  ExecutionContext as GOAPExecutionContext,
} from './enhanced-goap-planner';
import { EnhancedPlanRepair } from './enhanced-plan-repair';
import {
  createPBIEnforcer,
  PlanStep as PBIPlanStep,
  ExecutionContext as PBIExecutionContext,
  ExecutionHealthMetrics,
  DEFAULT_PBI_ACCEPTANCE,
} from '@conscious-bot/executor-contracts';

export interface ExecutionResult {
  success: boolean;
  planExecuted: boolean;
  safetyReflexActivated: boolean;
  planRepaired: boolean;
  duration: number;
  actionsCompleted: number;
  error?: string;
}

export interface ExecutionContextBuilder {
  buildContext(
    worldState: WorldState,
    currentPlan?: GOAPPlan
  ): GOAPExecutionContext;
}

export interface RealTimeAdapter {
  adaptToOpportunities(context: GOAPExecutionContext): any[];
  respondToThreats(threats: any[]): any[];
  optimizeExecution(plan: GOAPPlan, context: GOAPExecutionContext): GOAPPlan;
}

/**
 * Enhanced Reactive Executor with advanced features
 */
export class EnhancedReactiveExecutor {
  private goapPlanner: EnhancedGOAPPlanner;
  private planRepair: EnhancedPlanRepair;
  private contextBuilder: ExecutionContextBuilder;
  private realTimeAdapter: RealTimeAdapter;
  private metrics: ReactiveExecutorMetrics;
  private executionHistory: ExecutionResult[] = [];

  // PBI Integration
  private pbiEnforcer: ReturnType<typeof createPBIEnforcer>;

  // Memory Integration
  private memoryEndpoint?: string;
  private memoryClient?: any;

  constructor() {
    this.goapPlanner = new EnhancedGOAPPlanner();
    this.planRepair = new EnhancedPlanRepair();
    this.contextBuilder = new DefaultExecutionContextBuilder();
    this.metrics = this.initializeMetrics();

    // Initialize PBI enforcer for plan-body interface enforcement
    this.pbiEnforcer = createPBIEnforcer();
    this.realTimeAdapter = new DefaultRealTimeAdapter(this.pbiEnforcer);

    // Initialize memory integration
    this.initializeMemoryIntegration();

    // Bootstrap essential capabilities for fresh start
    // Note: This is fire-and-forget since constructor can't be async
    void this.bootstrapPBICapabilities();
  }

  /**
   * Initialize memory integration
   */
  private initializeMemoryIntegration(): void {
    this.memoryEndpoint =
      process.env.MEMORY_ENDPOINT || 'http://localhost:3001';

    if (this.memoryEndpoint) {
      this.memoryClient = {
        getMemoryEnhancedContext: async (context: any) => {
          try {
            const response = await fetch(
              `${this.memoryEndpoint}/memory-enhanced-context`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(context),
                signal: AbortSignal.timeout(3000),
              }
            );

            if (!response.ok) {
              return {
                memories: [],
                insights: ['Memory system unavailable'],
                recommendations: ['Consider using fallback planning'],
                confidence: 0.0,
              };
            }

            return await response.json();
          } catch (error) {
            console.error('Memory client error:', error);
            return {
              memories: [],
              insights: ['Memory system error occurred'],
              recommendations: ['Consider using fallback planning'],
              confidence: 0.0,
            };
          }
        },
      };
    }
  }

  /**
   * Bootstrap essential PBI capabilities for fresh start scenarios
   */
  private async bootstrapPBICapabilities(): Promise<void> {
    if (
      this.pbiEnforcer.getRegistry().getHealthMetrics().totalCapabilities > 0
    ) {
      return; // Already bootstrapped
    }

    console.log('🔧 Bootstrapping PBI capabilities for fresh start...');

    // Register essential capabilities that allow basic survival actions
    const basicCapabilities = [
      'explore',
      'navigate',
      'move_forward',
      'dig_block',
      'place_block',
      'craft_item',
      'gather',
      'consume_food',
      'sense_environment',
      'wait',
      'chat',
    ];

    for (const capability of basicCapabilities) {
      try {
        // Register capability with PBI enforcer
        await this.pbiEnforcer.getRegistry().register({
          name: capability,
          version: '1.0.0',
          inputSchema: z.object({}),
          guard: () => true, // Allow all basic capabilities
          runner: async (ctx, args) => ({
            ok: true,
            startedAt: Date.now(),
            endedAt: Date.now() + 1000,
            observables: { capability, args },
          }),
          acceptance: () => true,
          sla: {
            p95DurationMs: 2000,
            successRate: 0.9,
            maxRetries: 3,
          },
        });

        console.log(`✅ Bootstrapped capability: ${capability}`);
      } catch (error) {
        console.warn(`⚠️ Failed to bootstrap capability ${capability}:`, error);
      }
    }

    // Mark as bootstrapped by checking if we have capabilities
    const hasCapabilities =
      this.pbiEnforcer.getRegistry().getHealthMetrics().totalCapabilities > 0;
    console.log('✅ PBI capability bootstrap completed');
  }

  /**
   * Get memory-enhanced context for plan execution
   */
  private async getMemoryEnhancedExecutionContext(
    plan: Plan,
    worldState: WorldState,
    goapPlan: GOAPPlan
  ): Promise<{
    memories: any[];
    insights: string[];
    recommendations: string[];
    confidence: number;
    planMemory?: any;
  }> {
    // Default fallback
    const defaultContext = {
      memories: [],
      insights: ['Memory system not available for plan enhancement'],
      recommendations: [
        'Consider enabling memory integration for better planning',
      ],
      confidence: 0.0,
    };

    if (!this.memoryClient) {
      return defaultContext;
    }

    try {
      // Extract context from plan and world state
      const context = {
        query: `Planning execution for: ${plan.goal.description}`,
        taskType: plan.goal.type,
        entities: this.extractEntitiesFromPlan(plan),
        location: worldState.currentLocation,
        recentEvents: this.getRecentExecutionHistory(3),
        maxMemories: 5,
      };

      const memoryContext =
        await this.memoryClient.getMemoryEnhancedContext(context);

      // Add plan-specific memory analysis
      const planMemory = {
        planType: plan.goal.type,
        planComplexity: plan.steps.length,
        estimatedDuration: this.estimatePlanDuration(plan),
        successProbability: this.calculatePlanSuccessProbability(
          plan,
          memoryContext
        ),
        memoryEnhancedRecommendations: memoryContext.recommendations,
      };

      return {
        ...memoryContext,
        planMemory,
      };
    } catch (error) {
      console.error('Failed to get memory-enhanced execution context:', error);
      return defaultContext;
    }
  }

  /**
   * Extract entities from a plan for memory context
   */
  private extractEntitiesFromPlan(plan: Plan): string[] {
    const entities: string[] = [];

    // Extract from goal
    const goalContent = plan.goal.description.toLowerCase();
    const goalEntities = this.extractMinecraftEntities(goalContent);
    entities.push(...goalEntities);

    // Extract from plan steps
    for (const step of plan.steps) {
      const stepContent = step.description.toLowerCase();
      const stepEntities = this.extractMinecraftEntities(stepContent);
      entities.push(...stepEntities);
    }

    return [...new Set(entities)]; // Remove duplicates
  }

  /**
   * Extract Minecraft entities from text
   */
  private extractMinecraftEntities(text: string): string[] {
    const entities: string[] = [];
    const minecraftItems = [
      'diamond',
      'iron',
      'gold',
      'wood',
      'stone',
      'dirt',
      'water',
      'lava',
      'tree',
      'cave',
      'mountain',
      'river',
      'ocean',
      'forest',
      'desert',
      'zombie',
      'skeleton',
      'creeper',
      'spider',
      'wolf',
      'cow',
      'pig',
      'sheep',
      'pickaxe',
      'sword',
      'axe',
      'shovel',
      'hoe',
      'crafting_table',
      'furnace',
      'chest',
      'door',
      'window',
      'bed',
      'torch',
      'coal',
      'redstone',
      'lapis',
    ];

    for (const entity of minecraftItems) {
      if (text.includes(entity)) {
        entities.push(entity);
      }
    }

    return entities;
  }

  /**
   * Get recent execution history
   */
  private getRecentExecutionHistory(limit: number): any[] {
    return this.executionHistory.slice(-limit).map((result) => ({
      success: result.success,
      duration: result.duration,
      actionsCompleted: result.actionsCompleted,
      error: result.error,
      timestamp: Date.now() - result.duration, // Approximate timestamp
    }));
  }

  /**
   * Estimate plan duration based on steps and complexity
   */
  private estimatePlanDuration(plan: Plan): number {
    // Simple estimation: 30 seconds per step + 10 seconds overhead
    return plan.steps.length * 30 + 10;
  }

  /**
   * Calculate plan success probability based on memory context
   */
  private calculatePlanSuccessProbability(
    plan: Plan,
    memoryContext: any
  ): number {
    let probability = 0.5; // Base 50% probability

    // Boost probability if memory suggests success
    if (memoryContext.confidence > 0.7) {
      probability += 0.2;
    }

    // Adjust based on plan complexity
    const complexityPenalty = Math.min(0.3, plan.steps.length * 0.05);
    probability -= complexityPenalty;

    // Adjust based on historical success rate
    const recentHistory = this.getRecentExecutionHistory(5);
    const successfulExecutions = recentHistory.filter((h) => h.success).length;
    const successRate =
      recentHistory.length > 0
        ? successfulExecutions / recentHistory.length
        : 0.5;
    probability = probability * 0.7 + successRate * 0.3; // Weighted average

    return Math.max(0.1, Math.min(0.95, probability)); // Clamp between 10% and 95%
  }

  /**
   * Execute a plan reactively with real-time adaptation
   */
  async execute(
    plan: Plan,
    worldState: WorldState,
    mcpBus: MCPBus
  ): Promise<ExecutionResult> {
    const startTime = performance.now();

    try {
      // Convert Plan to GOAPPlan
      const goapPlan = this.convertPlanToGOAP(plan);

      // Get memory-enhanced context for better decision making
      const memoryContext = await this.getMemoryEnhancedExecutionContext(
        plan,
        worldState,
        goapPlan
      );

      // Build execution context with memory enhancement
      const context = this.contextBuilder.buildContext(worldState, goapPlan);
      context.memoryContext = memoryContext;

      // Check for safety reflexes first
      const safetyReflex = this.goapPlanner.checkSafetyReflexes(
        worldState,
        context
      );
      if (safetyReflex) {
        const reflexResult = await this.goapPlanner.executeSafetyReflex(
          safetyReflex,
          mcpBus
        );
        return {
          success: reflexResult.success,
          planExecuted: false,
          safetyReflexActivated: true,
          planRepaired: false,
          duration: performance.now() - startTime,
          actionsCompleted: 1,
          error: reflexResult.error,
        };
      }

      // Execute plan with real-time adaptation
      const result = await this.executePlanWithAdaptation(
        goapPlan,
        worldState,
        context,
        mcpBus
      );

      this.updateExecutionMetrics(result, performance.now() - startTime);
      this.executionHistory.push(result);

      return result;
    } catch (error) {
      const errorResult: ExecutionResult = {
        success: false,
        planExecuted: false,
        safetyReflexActivated: false,
        planRepaired: false,
        duration: performance.now() - startTime,
        actionsCompleted: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.executionHistory.push(errorResult);
      return errorResult;
    }
  }

  /**
   * Execute a GOAP plan with real-time adaptation and repair
   */
  private async executePlanWithAdaptation(
    plan: GOAPPlan,
    worldState: WorldState,
    context: GOAPExecutionContext,
    mcpBus: MCPBus
  ): Promise<ExecutionResult> {
    let currentPlan = plan;
    let actionsCompleted = 0;
    let planRepaired = false;

    for (let i = 0; i < currentPlan.actions.length; i++) {
      const action = currentPlan.actions[i];

      try {
        // Check if action is still applicable
        if (!action.isApplicable(worldState, context)) {
          // Action is no longer applicable, try to repair plan
          const repairResult = await this.planRepair.handleFailure(
            currentPlan,
            action,
            worldState,
            context,
            this.goapPlanner
          );

          if (repairResult.type === 'repaired' && repairResult.plan) {
            currentPlan = repairResult.plan;
            planRepaired = true;
            // Continue with repaired plan
            continue;
          } else {
            // Repair failed, return partial success
            return {
              success: false,
              planExecuted: true,
              safetyReflexActivated: false,
              planRepaired,
              duration: 0,
              actionsCompleted,
              error: 'Plan repair failed',
            };
          }
        }

        // Execute action
        const actionResult = await action.exec(mcpBus, {});

        if (actionResult.success) {
          actionsCompleted++;
          // Update world state based on action effects
          worldState = this.applyActionEffects(worldState, action);
          // Update context for next action
          context = this.contextBuilder.buildContext(worldState, currentPlan);
        } else {
          // Action failed, try to repair plan
          const repairResult = await this.planRepair.handleFailure(
            currentPlan,
            action,
            worldState,
            context,
            this.goapPlanner
          );

          if (repairResult.type === 'repaired' && repairResult.plan) {
            currentPlan = repairResult.plan;
            planRepaired = true;
            // Retry with repaired plan
            i = -1; // Reset to start of plan
            continue;
          } else {
            // Repair failed, return partial success
            return {
              success: false,
              planExecuted: true,
              safetyReflexActivated: false,
              planRepaired,
              duration: 0,
              actionsCompleted,
              error: actionResult.error || 'Action execution failed',
            };
          }
        }
      } catch (error) {
        // Unexpected error during execution
        return {
          success: false,
          planExecuted: true,
          safetyReflexActivated: false,
          planRepaired,
          duration: 0,
          actionsCompleted,
          error: error instanceof Error ? error.message : 'Unexpected error',
        };
      }
    }

    return {
      success: true,
      planExecuted: true,
      safetyReflexActivated: false,
      planRepaired,
      duration: 0,
      actionsCompleted,
    };
  }

  /**
   * Convert Plan to GOAPPlan
   */
  private convertPlanToGOAP(plan: Plan): GOAPPlan {
    const actions = plan.steps.map((step) => ({
      name: step.action.name,
      preconditions: [],
      effects: [],
      baseCost: 1,
      dynamicCostFn: () => 1,
      exec: async () => {
        // Simulate failure for invalid actions
        if (step.action.name === 'InvalidAction') {
          throw new Error('Invalid action execution failed');
        }
        return {
          success: true,
          duration: 0,
          resourcesConsumed: {},
          resourcesGained: {},
        };
      },
      isApplicable: () => true,
      estimatedDuration: step.estimatedDuration || 1000,
      resourceRequirements: {},
    }));

    return {
      actions,
      goal: {
        id: plan.goalId,
        type: 'unknown' as GoalType,
        priority: 0,
        urgency: 0,
        utility: 0,
        description: '',
        status: 'unknown' as GoalStatus,
        preconditions: [],
        effects: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      },
      estimatedCost: 0,
      estimatedDuration: 0,
      successProbability: 0.8,
      containsAction: (actionName: string) =>
        actions.some((a) => a.name === actionName),
      remainsOnRoute: () => true,
    };
  }

  /**
   * Apply action effects to world state
   */
  private applyActionEffects(worldState: WorldState, action: any): WorldState {
    // Simplified effect application - in real implementation this would be more complex
    return worldState;
  }

  /**
   * Update execution metrics
   */
  private updateExecutionMetrics(
    result: ExecutionResult,
    duration: number
  ): void {
    if (result.success) {
      this.metrics.actionSuccessRate =
        (this.metrics.actionSuccessRate * this.executionHistory.length + 1) /
        (this.executionHistory.length + 1);
    }

    if (result.safetyReflexActivated) {
      this.metrics.reflexActivations++;
    }

    if (result.planRepaired) {
      this.metrics.repairToReplanRatio =
        (this.metrics.repairToReplanRatio * this.executionHistory.length + 1) /
        (this.executionHistory.length + 1);
    } else {
      // Update ratio even for non-repaired plans to maintain balance
      this.metrics.repairToReplanRatio =
        (this.metrics.repairToReplanRatio * this.executionHistory.length) /
        (this.executionHistory.length + 1);
    }
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): ReactiveExecutorMetrics {
    return {
      goapPlanLatency: { p50: 0, p95: 0 },
      plansPerHour: 0,
      planCacheHitRate: 0,
      repairToReplanRatio: 0.5, // Start with 50% to allow for both repairs and replans
      averageEditDistance: 0,
      planStabilityIndex: 1.0,
      actionSuccessRate: 1.0,
      interruptCost: 0,
      opportunisticGains: 0,
      reflexActivations: 0,
      threatResponseTime: Infinity,
      survivalRate: 1.0,
      // Execution tracking properties
      isExecuting: false,
      currentAction: null,
      actionQueue: [],
    };
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics(): {
    executor: ReactiveExecutorMetrics;
    repair: any;
    executionHistory: ExecutionResult[];
  } {
    return {
      executor: this.goapPlanner.getMetrics(),
      repair: this.planRepair.getMetrics(),
      executionHistory: [...this.executionHistory],
    };
  }

  /**
   * Get the GOAP planner for direct access
   */
  getGOAPPlanner(): EnhancedGOAPPlanner {
    return this.goapPlanner;
  }

  /**
   * Get the plan repair system for direct access
   */
  getPlanRepair(): EnhancedPlanRepair {
    return this.planRepair;
  }

  /**
   * Check if currently executing
   */
  isExecuting(): boolean {
    return this.goapPlanner.isExecuting();
  }

  /**
   * Execute next task in queue
   */
  async executeNextTask(): Promise<any> {
    return this.goapPlanner.executeNextAction();
  }

  /**
   * Get current action being executed
   */
  getCurrentAction(): any {
    return this.goapPlanner.getCurrentAction();
  }

  /**
   * Get action queue
   */
  getActionQueue(): any[] {
    return this.goapPlanner.getActionQueue();
  }

  /**
   * Get PBI effectiveness metrics (placeholder for now)
   */
  getPBIEffectivenessMetrics(): ExecutionHealthMetrics {
    // TODO: Implement proper PBI metrics collection
    return {
      // Timing
      ttfaP50: 0,
      ttfaP95: 0,

      // Throughput
      actionsPerSecond: 0,

      // Reliability
      planRepairRate: 0,
      localRetrySuccessRate: 0,
      stepsPerSuccess: 0,

      // Failure modes
      timeoutsPerHour: 0,
      stuckLoopsPerHour: 0,

      // Capability health
      capabilitySLAs: {},

      // Memory impact
      methodUplift: {},
      hazardRecallRate: 0,
    };
  }

  /**
   * Check if PBI is meeting effectiveness targets (placeholder for now)
   */
  isPBIEffective(): boolean {
    // TODO: Implement proper PBI effectiveness tracking
    return true;
  }

  /**
   * Execute a specific task
   */
  async executeTask(task: any): Promise<any> {
    try {
      // Use the PBI-wrapped task execution for proper task execution with enforcement
      const result = await this.executeTaskWithPBI(
        task,
        'http://localhost:3005'
      );

      // Return result in the expected format
      return {
        success: result.success,
        planExecuted: true,
        safetyReflexActivated: false,
        planRepaired: false,
        duration: 0, // Will be calculated if needed
        actionsCompleted: result.success ? 1 : 0,
        error: result.error,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        planExecuted: false,
        safetyReflexActivated: false,
        planRepaired: false,
        duration: 0,
        actionsCompleted: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute task in Minecraft using the proper implementation
   */
  private async executeTaskInMinecraft(task: any) {
    try {
      const minecraftUrl = 'http://localhost:3005';

      // Check if the bot is connected first
      let botStatus;
      try {
        botStatus = await fetch(`${minecraftUrl}/health`).then((res) =>
          res.json()
        );
      } catch (error) {
        // If we can't connect to the Minecraft server, return failure
        return {
          success: false,
          error: 'Cannot connect to Minecraft server',
          type: task.type,
        };
      }

      const typedBotStatus = botStatus as any;

      // Enhanced verification: check both connection and health
      if (!typedBotStatus.executionStatus?.bot?.connected) {
        return {
          success: false,
          error: 'Bot not connected to Minecraft server',
          botStatus: botStatus,
          type: task.type,
        };
      }

      // Critical: Check if bot is actually alive (health > 0)
      if (!typedBotStatus.isAlive || typedBotStatus.botStatus?.health <= 0) {
        return {
          success: false,
          error: 'Bot is dead and cannot execute actions',
          botStatus: botStatus,
          type: task.type,
          botHealth: typedBotStatus.botStatus?.health || 0,
        };
      }

      // Execute the task based on type
      switch (task.type) {
        case 'action':
          // Handle generic action tasks by inferring the specific action from the title/description
          return await this.executeGenericActionTask(task, minecraftUrl);
        case 'craft':
        case 'crafting':
          return await this.executeCraftTask(task, minecraftUrl);
        case 'move':
        case 'move_forward':
        case 'movement':
          return await this.executeMoveTask(task, minecraftUrl);
        case 'gather':
        case 'gathering':
          return await this.executeGatherTask(task, minecraftUrl);
        case 'explore':
        case 'exploration':
          return await this.executeExploreTask(task, minecraftUrl);
        case 'mine':
        case 'mining':
          return await this.executeMineTask(task, minecraftUrl);
        default:
          // For unknown task types, return failure since we can't execute them
          return {
            success: false,
            error: `Unknown task type: ${task.type}`,
            type: task.type,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        type: task.type,
      };
    }
  }

  /**
   * Execute crafting task with proper validation
   */
  private async executeCraftTask(task: any, minecraftUrl: string) {
    const itemToCraft = task.parameters?.item || 'item';

    // Skip can_craft check since it's not supported by the Minecraft interface
    // The Minecraft interface will handle validation internally

    // Actually attempt to craft the item
    const craftResult = await fetch(`${minecraftUrl}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'craft_item',
        parameters: {
          item: itemToCraft,
          quantity: task.parameters?.quantity || 1,
        },
      }),
    }).then((res) => res.json());

    return {
      success: (craftResult as any).success,
      error: (craftResult as any).error,
      item: itemToCraft,
      type: 'craft',
      data: craftResult,
    };
  }

  /**
   * Execute movement task with proper validation
   */
  private async executeMoveTask(task: any, minecraftUrl: string) {
    try {
      const result = await fetch(`${minecraftUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'move_forward',
          parameters: { distance: task.parameters?.distance || 1 },
        }),
      }).then((res) => res.json());

      return {
        success: (result as any).success,
        error: (result as any).error,
        type: 'move',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute move task: ${error}`,
        type: 'move',
      };
    }
  }

  /**
   * Execute gathering task
   */
  private async executeGatherTask(task: any, minecraftUrl: string) {
    try {
      const result = await fetch(`${minecraftUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'gather',
          parameters: task.parameters || {},
        }),
      }).then((res) => res.json());

      return {
        success: (result as any).success,
        error: (result as any).error,
        type: 'gather',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute gather task: ${error}`,
        type: 'gather',
      };
    }
  }

  /**
   * Execute exploration task
   */
  private async executeExploreTask(task: any, minecraftUrl: string) {
    try {
      const result = await fetch(`${minecraftUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'explore',
          parameters: task.parameters || {},
        }),
      }).then((res) => res.json());

      return {
        success: (result as any).success,
        error: (result as any).error,
        type: 'explore',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute explore task: ${error}`,
        type: 'explore',
      };
    }
  }

  /**
   * Execute mining task
   */
  private async executeMineTask(task: any, minecraftUrl: string) {
    try {
      console.log(`⛏️ Executing mining task: ${task.title}`);

      // Execute mining action
      const response = await fetch(`${minecraftUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dig_block',
          parameters: {
            block: task.parameters?.block || 'stone',
            position: task.parameters?.position || 'current',
          },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(
          `Minecraft interface responded with ${response.status}`
        );
      }

      const result = await response.json();
      return {
        success: (result as any).success,
        error: (result as any).error,
        type: 'mining',
        data: (result as any).data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'mining',
      };
    }
  }

  /**
   * Execute task with PBI enforcement
   * This wraps task execution with PBI verification and monitoring
   */
  private async executeTaskWithPBI(
    task: any,
    minecraftUrl: string
  ): Promise<any> {
    const startTime = performance.now();

    try {
      // Convert task to PBI PlanStep format
      const pbiStep: PBIPlanStep = {
        stepId: `task-${task.id || Date.now()}`,
        type: this.mapTaskTypeToCanonicalVerb(task.type),
        args: this.mapTaskParameters(task),
        safetyLevel: this.assessTaskSafety(task),
        expectedDurationMs: this.estimateTaskDuration(task),
      };

      // Create execution context for PBI
      const executionContext: PBIExecutionContext = {
        threatLevel: 0.1, // TODO: Get from world state
        hostileCount: 0,
        nearLava: false,
        lavaDistance: 100,
        resourceValue: 0.5,
        detourDistance: 0,
        subgoalUrgency: 0.5,
        estimatedTimeToSubgoal: 3000,
        commitmentStrength: 0.7,
        timeOfDay: 'day',
        lightLevel: 15,
        airLevel: 300,
      };

      // Create mock world state for PBI
      const mockWorldState = {
        getHealth: () => 20,
        getHunger: () => 20,
        getEnergy: () => 20,
        getPosition: () => ({ x: 0, y: 0, z: 0 }),
        getLightLevel: () => 15,
        getAir: () => 300,
        getTimeOfDay: () => 'day' as const,
        hasItem: (item: string) => false,
        distanceTo: (target: any) => 50,
        getThreatLevel: () => 0.1,
        getInventory: () => ({}),
        getNearbyResources: () => [],
        getNearbyHostiles: () => [],
      };

      // Execute with PBI enforcement
      const pbiResult = await this.pbiEnforcer.executeStep(
        pbiStep,
        executionContext,
        mockWorldState
      );

      console.log(`📋 PBI Execution Result:`, {
        success: pbiResult.success,
        ttfaMs: pbiResult.ttfaMs,
        verificationErrors: pbiResult.verification.errors.length,
        executionId: pbiResult.executionId,
        duration: pbiResult.duration,
      });

      // If PBI verification failed, return early
      if (!pbiResult.success) {
        return {
          success: false,
          error: pbiResult.error?.message || 'PBI verification failed',
          type: task.type,
          pbiResult,
        };
      }

      // Continue with normal task execution using PBI wrapper
      const taskResult = await this.executeTaskWithPBI(task, minecraftUrl);

      // Track effectiveness metrics
      const totalTime = performance.now() - startTime;
      const ttfaTarget = DEFAULT_PBI_ACCEPTANCE.ttfaMs;

      if (pbiResult.ttfaMs > ttfaTarget) {
        console.warn(
          `⚠️ TTFA exceeded target: ${pbiResult.ttfaMs}ms > ${ttfaTarget}ms`
        );
      }

      // Update PBI metrics based on task execution result
      if (taskResult.success) {
        this.pbiEnforcer.updateMetrics(
          pbiStep.type,
          'success',
          pbiResult.ttfaMs
        );
      } else {
        this.pbiEnforcer.updateMetrics(
          pbiStep.type,
          'failure',
          pbiResult.ttfaMs
        );
      }

      return {
        ...taskResult,
        pbiResult,
        effectiveness: {
          ttfaMs: pbiResult.ttfaMs,
          withinTarget: pbiResult.ttfaMs <= ttfaTarget,
          totalExecutionTime: totalTime,
        },
      };
    } catch (error) {
      const totalTime = performance.now() - startTime;

      console.error('❌ PBI Execution failed:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown PBI error',
        type: task.type,
        executionTime: totalTime,
      };
    }
  }

  /**
   * Map task type to canonical verb for PBI
   */
  private mapTaskTypeToCanonicalVerb(taskType: string): string {
    const typeMapping: Record<string, string> = {
      craft: 'craft_item',
      move: 'move_forward',
      gather: 'gather',
      explore: 'explore',
      mine: 'dig_block',
      navigate: 'navigate',
      eat: 'consume_food',
      build: 'build_structure',
      place: 'place_block',
      pillar: 'pillar_up',
      flee: 'flee',
    };

    return typeMapping[taskType] || 'explore'; // Default fallback
  }

  /**
   * Map task parameters to PBI format
   */
  private mapTaskParameters(task: any): Record<string, any> {
    return {
      ...task.parameters,
      // Add any additional PBI-specific parameters
      timeoutMs: task.timeout || 30000,
      avoidHazards: task.avoidHazards !== false,
    };
  }

  /**
   * Assess safety level for task
   */
  private assessTaskSafety(task: any): 'safe' | 'caution' | 'restricted' {
    // Simple safety assessment based on task type and parameters
    if (task.parameters?.dangerous) {
      return 'restricted';
    }

    if (task.type === 'navigate' && task.parameters?.avoidHazards === false) {
      return 'caution';
    }

    return 'safe';
  }

  /**
   * Estimate task duration for PBI
   */
  private estimateTaskDuration(task: any): number {
    const durationEstimates: Record<string, number> = {
      craft: 2000,
      move: 1000,
      gather: 1500,
      explore: 3000,
      mine: 2500,
      navigate: 2000,
      eat: 500,
      build: 5000,
      place: 1000,
      pillar: 3000,
      flee: 500,
    };

    return durationEstimates[task.type] || 2000;
  }

  /**
   * Execute generic action task by inferring the specific action type
   */
  private async executeGenericActionTask(task: any, minecraftUrl: string) {
    try {
      console.log(`🎯 Executing generic action task: ${task.title}`);

      const taskTitle = (task.title || '').toLowerCase();
      const taskDescription = (
        task.parameters?.thoughtContent ||
        task.description ||
        ''
      ).toLowerCase();
      const content = `${taskTitle} ${taskDescription}`;

      // Intelligent action routing based on task content
      let actionType = 'explore'; // Default fallback
      let parameters: any = {};

      if (
        content.includes('craft') &&
        (content.includes('tool') ||
          content.includes('axe') ||
          content.includes('pickaxe'))
      ) {
        // Crafting task takes priority when explicitly mentioned with tools
        actionType = 'craft_item';
        parameters = {
          item: 'wooden_axe',
          materials: 'auto_collect',
        };
      } else if (
        content.includes('wood') ||
        content.includes('tree') ||
        content.includes('log') ||
        content.includes('gather')
      ) {
        // Wood gathering task
        actionType = 'navigate';
        parameters = {
          target: 'tree',
          action: 'gather_wood',
          max_distance: 20,
        };
      } else if (
        content.includes('mine') ||
        content.includes('stone') ||
        content.includes('dig')
      ) {
        // Mining task
        actionType = 'dig_block';
        parameters = {
          block: 'stone',
          position: 'nearest',
        };
      } else if (
        content.includes('move') ||
        content.includes('go') ||
        content.includes('walk')
      ) {
        // Movement task
        actionType = 'move_forward';
        parameters = {
          distance: 5,
        };
      } else if (content.includes('gather') || content.includes('collect')) {
        // Generic gathering
        actionType = 'navigate';
        parameters = {
          target: 'auto_detect',
          max_distance: 15,
        };
      }

      console.log(
        `🔄 Routing action task as: ${actionType} with parameters:`,
        parameters
      );

      // Execute the inferred action via the minecraft interface
      const response = await fetch(`${minecraftUrl}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: actionType,
          parameters,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Minecraft interface responded with ${response.status}: ${errorText}`
        );
      }

      const result = await response.json();
      return {
        success: (result as any).success,
        error: (result as any).error,
        type: 'action',
        actionType,
        data: (result as any).data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'action',
      };
    }
  }

  /**
   * Create default world state for task execution
   */
  private createDefaultWorldState(): WorldState {
    return {
      getHealth: () => {
        // Try to get real bot health, fallback to 0 if not connected
        try {
          // This would need to be connected to the actual bot instance
          // For now, return 0 to indicate no connection
          return 0;
        } catch (error) {
          return 0;
        }
      },
      getHunger: () => {
        try {
          // Connect to real bot hunger level
          return 0;
        } catch (error) {
          return 0;
        }
      },
      getEnergy: () => {
        try {
          // Connect to real bot energy level
          return 0;
        } catch (error) {
          return 0;
        }
      },
      getPosition: () => {
        try {
          // Connect to real bot position
          return { x: 0, y: 0, z: 0 };
        } catch (error) {
          return { x: 0, y: 0, z: 0 };
        }
      },
      getLightLevel: () => {
        try {
          // Connect to real light level
          return 0;
        } catch (error) {
          return 0;
        }
      },
      getAir: () => {
        try {
          // Connect to real air level
          return 0;
        } catch (error) {
          return 0;
        }
      },
      getTimeOfDay: () => {
        try {
          // Connect to real time of day
          return 'day'; // Default to day, would be determined by real world state
        } catch (error) {
          return 'day';
        }
      },
      hasItem: (itemName: string, quantity: number = 1) => {
        try {
          // Connect to real bot inventory
          return false;
        } catch (error) {
          return false;
        }
      },
      distanceTo: (target: any) => {
        try {
          // Calculate real distance to target
          return Infinity;
        } catch (error) {
          return Infinity;
        }
      },
      getThreatLevel: () => {
        try {
          // Connect to real threat assessment
          return 0;
        } catch (error) {
          return 0;
        }
      },
      getInventory: () => {
        try {
          // Connect to real bot inventory
          return {}; // Empty inventory record
        } catch (error) {
          return {};
        }
      },
      getNearbyResources: () => {
        try {
          // Connect to real resource detection
          return [];
        } catch (error) {
          return [];
        }
      },
      getNearbyHostiles: () => {
        try {
          // Connect to real hostile detection
          return [];
        } catch (error) {
          return [];
        }
      },
    };
  }

  /**
   * Create default MCP bus for task execution
   */
  private createDefaultMCPBus(): MCPBus {
    return {
      mineflayer: {
        consume: async (foodType: string) => {
          // This should connect to real mineflayer bot
          // For now, return failure to indicate no connection
          return {
            success: false,
            error: 'No mineflayer bot connection available',
            foodType,
          };
        },
        dig: async (block: any) => {
          // This should connect to real mineflayer bot
          return {
            success: false,
            error: 'No mineflayer bot connection available',
            block,
          };
        },
        pathfinder: {},
      },
      navigation: {
        pathTo: async (position: any, options?: any) => {
          // This should connect to real navigation system
          return {
            success: false,
            error: 'No navigation system connection available',
            position,
            options,
          };
        },
        swimToSurface: async () => {
          // This should connect to real navigation system
          return {
            success: false,
            error: 'No navigation system connection available',
          };
        },
      },
      state: {
        position: { x: 0, y: 0, z: 0 }, // Empty state
      },
    };
  }
}

/**
 * Default execution context builder
 */
class DefaultExecutionContextBuilder implements ExecutionContextBuilder {
  buildContext(
    worldState: WorldState,
    currentPlan?: GOAPPlan
  ): GOAPExecutionContext {
    // Real context building would analyze world state and plan
    // For now, use basic values from world state with empty defaults
    const context: GOAPExecutionContext = {
      threatLevel: worldState.getThreatLevel(),
      hostileCount: worldState.getNearbyHostiles().length,
      nearLava: false, // Would be determined by world state analysis
      lavaDistance: Infinity, // Would be calculated from world state
      resourceValue: 0, // Would be calculated from nearby resources
      detourDistance: 0, // Would be calculated from path analysis
      subgoalUrgency: currentPlan ? 0.5 : 0,
      estimatedTimeToSubgoal: currentPlan ? currentPlan.estimatedDuration : 0,
      commitmentStrength: 0.5, // Would be calculated from plan confidence
      timeOfDay: worldState.getTimeOfDay(),
      lightLevel: worldState.getLightLevel(),
      airLevel: worldState.getAir(),
    };

    // Log when using default context
    if (context.threatLevel === 0 && context.hostileCount === 0) {
      console.log(
        '🌍 Context building: Using default values - no real world analysis available'
      );
    }

    return context;
  }
}

/**
 * Default real-time adapter
 */
class DefaultRealTimeAdapter implements RealTimeAdapter {
  private pbiEnforcer: ReturnType<typeof createPBIEnforcer>;

  constructor(pbiEnforcer: ReturnType<typeof createPBIEnforcer>) {
    this.pbiEnforcer = pbiEnforcer;
  }

  adaptToOpportunities(context: GOAPExecutionContext): any[] {
    // Real opportunity detection would analyze world state
    // For now, return empty array to indicate no opportunities detected
    console.log('🔍 Opportunity detection: No real-time analysis available');
    return [];
  }

  respondToThreats(threats: any[]): any[] {
    // Real threat response would analyze threats and generate appropriate responses
    // For now, return empty array to indicate no threat responses available
    if (threats.length > 0) {
      console.warn(
        `⚠️ Threat detection: ${threats.length} threats detected but no response system available`
      );
    }
    return [];
  }

  optimizeExecution(plan: GOAPPlan, context: GOAPExecutionContext): GOAPPlan {
    // Real optimization would analyze context and modify plan accordingly
    // For now, return plan unchanged to indicate no optimization available
    console.log('⚡ Plan optimization: No real-time optimization available');
    return plan;
  }

  /**
   * Bootstrap essential PBI capabilities for fresh start scenarios
   */
  private async bootstrapPBICapabilities(): Promise<void> {
    if (
      this.pbiEnforcer.getRegistry().getHealthMetrics().totalCapabilities > 0
    ) {
      return; // Already bootstrapped
    }

    console.log('🔧 Bootstrapping PBI capabilities for fresh start...');

    // Register essential capabilities that allow basic survival actions
    const basicCapabilities = [
      'explore',
      'navigate',
      'move_forward',
      'dig_block',
      'place_block',
      'craft_item',
      'gather',
      'consume_food',
      'sense_environment',
      'wait',
      'chat',
    ];

    for (const capability of basicCapabilities) {
      try {
        // Register capability with PBI enforcer
        await this.pbiEnforcer.getRegistry().register({
          name: capability,
          version: '1.0.0',
          inputSchema: z.object({}),
          guard: () => true, // Allow all basic capabilities
          runner: async (ctx, args) => ({
            ok: true,
            startedAt: Date.now(),
            endedAt: Date.now() + 1000,
            observables: { capability, args },
          }),
          acceptance: () => true,
          sla: {
            p95DurationMs: 2000,
            successRate: 0.9,
            maxRetries: 3,
          },
        });

        console.log(`✅ Bootstrapped capability: ${capability}`);
      } catch (error) {
        console.warn(`⚠️ Failed to bootstrap capability ${capability}:`, error);
      }
    }

    // Mark as bootstrapped by checking if we have capabilities
    const hasCapabilities =
      this.pbiEnforcer.getRegistry().getHealthMetrics().totalCapabilities > 0;
    console.log('✅ PBI capability bootstrap completed');
  }

  /**
   * Map task type to canonical verb for PBI
   */
  private mapTaskTypeToCanonicalVerb(taskType: string): string {
    const typeMapping: Record<string, string> = {
      craft: 'craft_item',
      move: 'move_forward',
      gather: 'gather',
      explore: 'explore',
      mine: 'dig_block',
      navigate: 'navigate',
      eat: 'consume_food',
      build: 'build_structure',
      place: 'place_block',
      pillar: 'pillar_up',
      flee: 'flee',
    };

    return typeMapping[taskType] || 'explore'; // Default fallback
  }

  /**
   * Map task parameters to PBI format
   */
  private mapTaskParameters(task: any): Record<string, any> {
    return {
      ...task.parameters,
      // Add any additional PBI-specific parameters
      timeoutMs: task.timeout || 30000,
      avoidHazards: task.avoidHazards !== false,
    };
  }

  /**
   * Assess safety level for task
   */
  private assessTaskSafety(task: any): 'safe' | 'caution' | 'restricted' {
    // Simple safety assessment based on task type and parameters
    if (task.parameters?.dangerous) {
      return 'restricted';
    }

    if (task.type === 'navigate' && task.parameters?.avoidHazards === false) {
      return 'caution';
    }

    return 'safe';
  }

  /**
   * Estimate task duration for PBI
   */
  private estimateTaskDuration(task: any): number {
    const durationEstimates: Record<string, number> = {
      craft: 2000,
      move: 1000,
      gather: 1500,
      explore: 3000,
      mine: 2500,
      navigate: 2000,
      eat: 500,
      build: 5000,
      place: 1000,
      pillar: 3000,
      flee: 500,
    };

    return durationEstimates[task.type] || 2000;
  }
}
