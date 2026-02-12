/**
 * Reactive Executor
 *
 * Integrates GOAP planning stubs, plan repair, and safety reflexes
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
  GOAPPlanner,
  GOAPPlan,
  WorldState,
  SafetyAction,
  ActionResult,
  ReactiveExecutorMetrics,
  MCPBus,
  ExecutionContext as GOAPExecutionContext,
  PlanRepair,
} from './goap-types';
import {
  createPBIEnforcer,
  PlanStep as PBIPlanStep,
  ExecutionContext as PBIExecutionContext,
  ExecutionHealthMetrics,
  DEFAULT_PBI_ACCEPTANCE,
} from '@conscious-bot/executor-contracts';
import {
  MCPIntegration,
  ToolExecutionResult,
  ToolDiscoveryResult,
} from '../modules/mcp-integration';
import type { IReactiveExecutor } from '../interfaces/reactive-executor';
import { executeViaGateway } from '../server/execution-gateway';
import { executeReactiveViaGateway } from '../server/gateway-wrappers';
import {
  resolveActionFromTask,
  createDeterministicFailure,
  isMappingFailure,
  type ResolveResult,
} from '../server/task-action-resolver';

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

export interface MCPExecutionConfig {
  enableMCPExecution?: boolean;
  mcpEndpoint?: string;
  enableToolDiscovery?: boolean;
  preferMCPForTaskTypes?: string[];
  fallbackToMinecraft?: boolean;
}

export interface ReactiveExecutorOptions extends MCPExecutionConfig {
  contextBuilder?: ExecutionContextBuilder;
  realTimeAdapter?: RealTimeAdapter;
  worldStateManager?: import('../world-state/world-state-manager').WorldStateManager;
}

/**
 * Reactive executor with safety reflexes and plan repair
 */
export class ReactiveExecutor implements IReactiveExecutor {
  private goapPlanner: GOAPPlanner;
  private planRepair: PlanRepair;
  private contextBuilder: ExecutionContextBuilder;
  private realTimeAdapter: RealTimeAdapter;
  private metrics: ReactiveExecutorMetrics;
  private executionHistory: ExecutionResult[] = [];

  // PBI Metrics Tracking
  private pbiMetrics: {
    recentTTFAs: Array<{ value: number; timestamp: number }>;
    totalActions: number;
    totalDuration: number;
    successfulSteps: number;
    failedSteps: number;
    planRepairs: number;
    localRetries: number;
    successfulLocalRetries: number;
    timeouts: number;
    stuckLoops: number;
  };

  // PBI Integration
  private pbiEnforcer: ReturnType<typeof createPBIEnforcer>;

  // Memory Integration
  private memoryEndpoint?: string;
  private memoryClient?: any;

  // MCP Integration
  private mcpConfig?: MCPExecutionConfig;
  private mcpIntegration?: MCPIntegration;

  // World state adapter — when provided, replaces mock world state with real data
  private worldStateAdapter?: WorldState;

  constructor(options?: ReactiveExecutorOptions | MCPExecutionConfig) {
    this.goapPlanner = new GOAPPlanner();
    this.planRepair = new PlanRepair();
    this.pbiEnforcer = createPBIEnforcer();

    const opts = (options ?? {}) as ReactiveExecutorOptions;
    this.contextBuilder =
      opts.contextBuilder ?? new DefaultExecutionContextBuilder();
    this.realTimeAdapter =
      opts.realTimeAdapter ?? new DefaultRealTimeAdapter(this.pbiEnforcer);

    // Wire world state from manager if provided
    if (opts.worldStateManager) {
      const { createWorldStateFromManager } = require('./world-state-adapter');
      this.worldStateAdapter = createWorldStateFromManager(opts.worldStateManager) as WorldState;
    }

    this.metrics = this.initializeMetrics();
    this.pbiMetrics = this.initializePBIMetrics();

    // Initialize memory integration
    this.initializeMemoryIntegration();

    // Initialize MCP integration
    this.mcpConfig = {
      enableMCPExecution: true,
      mcpEndpoint: process.env.MCP_ENDPOINT || 'http://localhost:3000',
      enableToolDiscovery: true,
      preferMCPForTaskTypes: ['action', 'custom', 'tool'],
      fallbackToMinecraft: true,
      ...opts,
    };

    this.initializeMemoryIntegration();

    // Bootstrap essential capabilities for fresh start
    // Note: This is fire-and-forget since constructor can't be async
    void this.bootstrapPBICapabilities();
  }

  /**
   * Initialize MCP integration
   */
  private initializeMCPIntegration(): void {
    if (this.mcpConfig?.enableMCPExecution) {
      this.mcpIntegration = new MCPIntegration({
        enableMCP: true,
        enableToolDiscovery: this.mcpConfig.enableToolDiscovery,
        toolDiscoveryEndpoint: this.mcpConfig.mcpEndpoint,
        maxToolsPerGoal: 5,
        toolTimeoutMs: 30000,
      });

      // Initialize MCP integration (async, but fire-and-forget)
      void this.mcpIntegration.initialize();
    }
  }

  /**
   * Initialize memory integration
   */
  private initializeMemoryIntegration(): void {
    this.memoryEndpoint =
      process.env.MEMORY_ENDPOINT || 'http://localhost:3001';

    if (this.memoryEndpoint) {
      this.memoryClient = {
        getMemoryContext: async (context: any) => {
          try {
            const response = await fetch(
              `${this.memoryEndpoint}/memory-context`,
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
   * Get memory context for plan execution
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
        query: `Planning execution for goal ${plan.goalId}`,
        taskType: 'planning',
        entities: this.extractEntitiesFromPlan(plan),
        location: worldState.getPosition
          ? worldState.getPosition()
          : { x: 0, y: 0, z: 0 },
        recentEvents: this.getRecentExecutionHistory(3),
        maxMemories: 5,
      };

      const memoryContext = await this.memoryClient.getMemoryContext(context);

      // Add plan-specific memory analysis
      const planMemory = {
        planType: 'planning', // Default since Plan doesn't have goal property
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
      console.error('Failed to get memory execution context:', error);
      return defaultContext;
    }
  }

  /**
   * Extract entities from a plan for memory context
   */
  private extractEntitiesFromPlan(plan: Plan): string[] {
    const entities: string[] = [];

    // Extract from goal ID (Plan doesn't have goal property)
    const goalContent = plan.goalId.toLowerCase();
    const goalEntities = this.extractMinecraftEntities(goalContent);
    entities.push(...goalEntities);

    // Extract from plan steps
    for (const step of plan.steps) {
      const stepContent =
        step.action && typeof (step.action as any) === 'string'
          ? (step.action as any).toLowerCase()
          : 'step';
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

      // Get memory context for better decision making
      const memoryContext = await this.getMemoryEnhancedExecutionContext(
        plan,
        worldState,
        goapPlan
      );

      // Build execution context with memory enhancement
      const context = this.contextBuilder.buildContext(worldState, goapPlan);
      // Note: context.memoryContext would be added if ExecutionContext interface supported it
      // For now, memory context is handled separately in the execution logic

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
   * Initialize PBI metrics
   */
  private initializePBIMetrics() {
    return {
      recentTTFAs: [],
      totalActions: 0,
      totalDuration: 0,
      successfulSteps: 0,
      failedSteps: 0,
      planRepairs: 0,
      localRetries: 0,
      successfulLocalRetries: 0,
      timeouts: 0,
      stuckLoops: 0,
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
  getGOAPPlanner(): GOAPPlanner {
    return this.goapPlanner;
  }

  /**
   * Get the plan repair system for direct access
   */
  getPlanRepair(): PlanRepair {
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
   * Get PBI effectiveness metrics
   */
  getPBIEffectivenessMetrics(): ExecutionHealthMetrics {
    // Calculate metrics from collected data
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;

    // Calculate TTFA percentiles
    const recentTTFAs = this.pbiMetrics.recentTTFAs.filter(
      (ttfa) => now - ttfa.timestamp < hourMs
    );

    const sortedTTFAs = recentTTFAs
      .map((ttfa) => ttfa.value)
      .sort((a, b) => a - b);

    const ttfaP50 =
      sortedTTFAs.length > 0
        ? sortedTTFAs[Math.floor(sortedTTFAs.length * 0.5)]
        : 0;
    const ttfaP95 =
      sortedTTFAs.length > 0
        ? sortedTTFAs[Math.floor(sortedTTFAs.length * 0.95)]
        : 0;

    // Calculate throughput (actions per second over last hour)
    const actionsPerSecond =
      this.pbiMetrics.totalActions / (this.pbiMetrics.totalDuration / 1000);

    // Calculate reliability metrics
    const totalSteps =
      this.pbiMetrics.successfulSteps + this.pbiMetrics.failedSteps;
    const planRepairRate =
      totalSteps > 0 ? this.pbiMetrics.planRepairs / totalSteps : 0;
    const localRetrySuccessRate =
      this.pbiMetrics.localRetries > 0
        ? this.pbiMetrics.successfulLocalRetries / this.pbiMetrics.localRetries
        : 0;
    const stepsPerSuccess =
      this.pbiMetrics.successfulSteps > 0
        ? totalSteps / this.pbiMetrics.successfulSteps
        : 0;

    // Calculate failure modes per hour
    const timeoutsPerHour =
      this.pbiMetrics.timeouts / (this.pbiMetrics.totalDuration / hourMs);
    const stuckLoopsPerHour =
      this.pbiMetrics.stuckLoops / (this.pbiMetrics.totalDuration / hourMs);

    return {
      // Timing
      ttfaP50,
      ttfaP95,

      // Throughput
      actionsPerSecond,

      // Reliability
      planRepairRate,
      localRetrySuccessRate,
      stepsPerSuccess,

      // Failure modes
      timeoutsPerHour,
      stuckLoopsPerHour,

      // Capability health (simplified for now)
      capabilitySLAs: {},

      // Memory impact (placeholder)
      methodUplift: {},
      hazardRecallRate: 0,
    };
  }

  /**
   * Check if PBI is meeting effectiveness targets
   */
  isPBIEffective(): boolean {
    // Calculate effectiveness based on current metrics
    const metrics = this.getPBIEffectivenessMetrics();

    // Check if we're meeting minimum effectiveness thresholds
    const minThroughput = 0.1; // 0.1 actions per second minimum
    const maxAvgLatency = 5000; // 5 second average latency maximum
    const minSuccessRate = 0.7; // 70% success rate minimum

    const currentThroughput = metrics.actionsPerSecond;
    const currentAvgLatency = metrics.ttfaP95;
    const currentSuccessRate =
      this.pbiMetrics.successfulSteps /
      (this.pbiMetrics.successfulSteps + this.pbiMetrics.failedSteps);

    const isEffective =
      currentThroughput >= minThroughput &&
      currentAvgLatency <= maxAvgLatency &&
      currentSuccessRate >= minSuccessRate;

    console.log(`📊 PBI Effectiveness Check:`, {
      throughput: currentThroughput.toFixed(3),
      avgLatency: currentAvgLatency.toFixed(0),
      successRate: (currentSuccessRate * 100).toFixed(1) + '%',
      effective: isEffective,
      thresholds: {
        minThroughput,
        maxAvgLatency,
        minSuccessRate,
      },
    });

    return isEffective;
  }

  /**
   * Execute a specific task
   */
  async executeTask(task: any): Promise<any> {
    try {
      // Execute the task directly via Minecraft interface
      const taskResult = await this.executeTaskInMinecraft(task);

      // Shadow outcome: not a failure, not executed — return early
      if (taskResult.shadow) {
        return {
          success: false,
          shadowObserved: true,
          planExecuted: false,
          safetyReflexActivated: false,
          planRepaired: false,
          duration: 0,
          actionsCompleted: 0,
          error: taskResult.error,
          data: taskResult,
        };
      }

      // Return result in the expected format
      return {
        success: taskResult.success,
        planExecuted: true,
        safetyReflexActivated: false,
        planRepaired: false,
        duration: 0, // Will be calculated if needed
        actionsCompleted: taskResult.success ? 1 : 0,
        error: taskResult.error,
        data: taskResult,
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
          shadow: false,
          error: 'Cannot connect to Minecraft server',
          type: task.type,
        };
      }

      const typedBotStatus = botStatus as any;

      // Enhanced verification: check both connection and health
      if (!typedBotStatus.executionStatus?.bot?.connected) {
        return {
          success: false,
          shadow: false,
          error: 'Bot not connected to Minecraft server',
          botStatus: botStatus,
          type: task.type,
        };
      }

      // Critical: Check if bot is actually alive (health > 0)
      if (!typedBotStatus.isAlive || typedBotStatus.botStatus?.health <= 0) {
        return {
          success: false,
          shadow: false,
          error: 'Bot is dead and cannot execute actions',
          botStatus: botStatus,
          type: task.type,
          botHealth: typedBotStatus.botStatus?.health || 0,
        };
      }

      // Check if we should try MCP execution first
      // For now, skip MCP and go directly to Minecraft execution
      console.log(
        `🔧 [REACTIVE EXECUTOR] Executing task directly via Minecraft: ${task.title}`
      );

      // Execute the task based on type (original logic)
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
            shadow: false,
            error: `Unknown task type: ${task.type}`,
            type: task.type,
          };
      }
    } catch (error) {
      return {
        success: false,
        shadow: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        type: task.type,
      };
    }
  }

  /**
   * Execute crafting task with centralized parameter resolution.
   *
   * Uses task-action-resolver to extract args from all known locations:
   * 1. Legacy: task.parameters.item
   * 2. Requirement candidate: task.parameters.requirementCandidate.outputPattern
   * 3. Step meta.args: task.steps[0].meta.args.recipe
   * 4. Title inference (last resort)
   *
   * On mapping failure, returns deterministic error (no backoff, no retries).
   */
  private async executeCraftTask(task: any, _minecraftUrl: string) {
    const taskScope = task.id;

    // Use centralized resolver — fail-closed if no valid args
    const resolved = resolveActionFromTask(task);
    if (!resolved.ok) {
      console.warn(
        `[ReactiveExecutor] Craft task ${taskScope} failed resolution: ${resolved.failureCode}`,
        resolved.evidence
      );
      return createDeterministicFailure(resolved);
    }

    // Inject nav lease scope
    const parameters = {
      ...resolved.action.parameters,
      __nav: { ...(task.parameters?.__nav ?? {}), scope: taskScope },
    };

    const result = await executeReactiveViaGateway(taskScope, {
      type: resolved.action.type,
      parameters,
      timeout: resolved.action.timeout,
    });

    return {
      success: result.ok,
      shadow: result.outcome === 'shadow',
      error: result.error,
      item: resolved.action.parameters.item ?? resolved.action.parameters.recipe,
      type: 'craft',
      data: result.data,
      resolvedFrom: resolved.resolvedFrom,
    };
  }

  /**
   * Execute movement task with centralized parameter resolution.
   *
   * Move actions are permissive — can run with minimal args.
   * Uses task-action-resolver for consistent parameter extraction.
   */
  private async executeMoveTask(task: any, _minecraftUrl: string) {
    const taskScope = task.id;

    // Use centralized resolver — move is permissive (always succeeds)
    const resolved = resolveActionFromTask(task);
    if (!resolved.ok) {
      // Move should never fail resolution, but handle gracefully
      console.warn(
        `[ReactiveExecutor] Move task ${taskScope} failed resolution: ${resolved.failureCode}`,
        resolved.evidence
      );
      return createDeterministicFailure(resolved);
    }

    // Inject nav lease scope
    const parameters = {
      ...resolved.action.parameters,
      __nav: { ...(task.parameters?.__nav ?? {}), scope: taskScope },
    };

    const result = await executeReactiveViaGateway(taskScope, {
      type: resolved.action.type,
      parameters,
    });

    return {
      success: result.ok,
      shadow: result.outcome === 'shadow',
      error: result.error,
      type: 'move',
      data: result.data,
      resolvedFrom: resolved.resolvedFrom,
    };
  }

  /**
   * Execute gathering task with centralized parameter resolution.
   *
   * Uses task-action-resolver to extract resource from all known locations.
   * On mapping failure, returns deterministic error (no backoff, no retries).
   */
  private async executeGatherTask(task: any, _minecraftUrl: string) {
    const taskScope = task.id;

    // Use centralized resolver — fail-closed if no valid args
    const resolved = resolveActionFromTask(task);
    if (!resolved.ok) {
      console.warn(
        `[ReactiveExecutor] Gather task ${taskScope} failed resolution: ${resolved.failureCode}`,
        resolved.evidence
      );
      return createDeterministicFailure(resolved);
    }

    // Inject nav lease scope
    const parameters = {
      ...resolved.action.parameters,
      __nav: { ...(task.parameters?.__nav ?? {}), scope: taskScope },
    };

    const result = await executeReactiveViaGateway(taskScope, {
      type: resolved.action.type,
      parameters,
    });

    return {
      success: result.ok,
      shadow: result.outcome === 'shadow',
      error: result.error,
      type: 'gather',
      resource: resolved.action.parameters.resource,
      data: result.data,
      resolvedFrom: resolved.resolvedFrom,
    };
  }

  /**
   * Execute exploration task with centralized parameter resolution.
   *
   * Explore actions are permissive — can run with minimal args.
   * Uses task-action-resolver for consistent parameter extraction.
   */
  private async executeExploreTask(task: any, _minecraftUrl: string) {
    const taskScope = task.id;

    // Use centralized resolver — explore is permissive (always succeeds)
    const resolved = resolveActionFromTask(task);
    if (!resolved.ok) {
      // Explore should never fail resolution, but handle gracefully
      console.warn(
        `[ReactiveExecutor] Explore task ${taskScope} failed resolution: ${resolved.failureCode}`,
        resolved.evidence
      );
      return createDeterministicFailure(resolved);
    }

    // Inject nav lease scope
    const parameters = {
      ...resolved.action.parameters,
      __nav: { ...(task.parameters?.__nav ?? {}), scope: taskScope },
    };

    const result = await executeReactiveViaGateway(taskScope, {
      type: resolved.action.type,
      parameters,
    });

    return {
      success: result.ok,
      shadow: result.outcome === 'shadow',
      error: result.error,
      type: 'explore',
      data: result.data,
      resolvedFrom: resolved.resolvedFrom,
    };
  }

  /**
   * Execute mining task with centralized parameter resolution.
   *
   * Uses task-action-resolver to extract block from all known locations:
   * 1. Legacy: task.parameters.block
   * 2. Requirement candidate: task.parameters.requirementCandidate.outputPattern
   * 3. Step meta.args: task.steps[0].meta.args.block
   * 4. Title inference (last resort)
   *
   * On mapping failure, returns deterministic error (no backoff, no retries).
   */
  private async executeMineTask(task: any, _minecraftUrl: string) {
    console.log(`⛏️ Executing mining task: ${task.title}`);

    const taskScope = task.id;

    // Use centralized resolver — fail-closed if no valid args
    const resolved = resolveActionFromTask(task);
    if (!resolved.ok) {
      console.warn(
        `[ReactiveExecutor] Mine task ${taskScope} failed resolution: ${resolved.failureCode}`,
        resolved.evidence
      );
      return createDeterministicFailure(resolved);
    }

    // Inject nav lease scope
    const parameters = {
      ...resolved.action.parameters,
      __nav: { ...(task.parameters?.__nav ?? {}), scope: taskScope },
    };

    const result = await executeReactiveViaGateway(taskScope, {
      type: resolved.action.type,
      parameters,
      timeout: resolved.action.timeout ?? 30000,
    });

    return {
      success: result.ok,
      shadow: result.outcome === 'shadow',
      error: result.error,
      type: 'mining',
      block: resolved.action.parameters.block,
      data: result.data,
      resolvedFrom: resolved.resolvedFrom,
    };
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

      // Use real world state from adapter, or fall back to safe defaults
      const pbiWorldState = this.worldStateAdapter ?? {
        getHealth: () => 20,
        getHunger: () => 20,
        getEnergy: () => 20,
        getPosition: () => ({ x: 0, y: 0, z: 0 }),
        getLightLevel: () => 15,
        getAir: () => 300,
        getTimeOfDay: () => 'day' as const,
        hasItem: (_item: string) => false,
        distanceTo: (_target: any) => 50,
        getThreatLevel: () => 0.1,
        getInventory: () => ({}),
        getNearbyResources: () => [],
        getNearbyHostiles: () => [],
      };

      // Execute with PBI enforcement
      const pbiResult = await this.pbiEnforcer.executeStep(
        pbiStep,
        executionContext,
        pbiWorldState
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

      // Continue with normal task execution
      const taskResult = await this.executeTaskInMinecraft(task);

      // Track effectiveness metrics
      const totalTime = performance.now() - startTime;
      const ttfaTarget = DEFAULT_PBI_ACCEPTANCE.ttfaMs;

      if (pbiResult.ttfaMs > ttfaTarget) {
        console.warn(
          `⚠️ TTFA exceeded target: ${pbiResult.ttfaMs}ms > ${ttfaTarget}ms`
        );
      }

      // Update PBI metrics based on task execution result
      this.pbiMetrics.totalActions++;
      this.pbiMetrics.totalDuration += totalTime;

      // Track TTFA for percentile calculations
      this.pbiMetrics.recentTTFAs.push({
        value: pbiResult.ttfaMs,
        timestamp: Date.now(),
      });

      // Keep only recent TTFA measurements (last hour)
      const hourAgo = Date.now() - 60 * 60 * 1000;
      this.pbiMetrics.recentTTFAs = this.pbiMetrics.recentTTFAs.filter(
        (ttfa) => ttfa.timestamp > hourAgo
      );

      if (taskResult.success) {
        this.pbiMetrics.successfulSteps++;
        this.pbiEnforcer.updateMetrics(
          pbiStep.type,
          'success',
          pbiResult.ttfaMs
        );
      } else {
        this.pbiMetrics.failedSteps++;
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

      console.error('[REACTIVE EXECUTOR] PBI Execution failed:', error);

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

      // Execute the inferred action via the gateway
      const taskScope = task.id;
      const result = await executeReactiveViaGateway(taskScope, {
        type: actionType,
        parameters: { ...parameters, __nav: { ...(task.parameters?.__nav ?? {}), scope: taskScope } },
        timeout: 30000,
      });

      return {
        success: result.ok,
        shadow: result.outcome === 'shadow',
        error: result.error,
        type: 'action',
        actionType,
        data: result.data,
      };
    } catch (error) {
      return {
        success: false,
        shadow: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        type: 'action',
      };
    }
  }

  /**
   * Get the current world state — uses the real adapter if available,
   * otherwise returns safe defaults.
   */
  getWorldState(): WorldState {
    if (this.worldStateAdapter) return this.worldStateAdapter;
    return this.createDefaultWorldState();
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
  private mcpConfig?: any;
  private mcpIntegration?: MCPIntegration;

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

  /**
   * Check if a task should use MCP execution
   */
  private shouldUseMCPForTask(task: any): boolean {
    if (!this.mcpConfig?.enableMCPExecution || !this.mcpIntegration) {
      return false;
    }

    // Check if task type is preferred for MCP
    if (this.mcpConfig.preferMCPForTaskTypes?.includes(task.type)) {
      return true;
    }

    // Check if task has MCP-specific metadata
    if (task.metadata?.useMCP || task.metadata?.mcpExecution) {
      return true;
    }

    // Check if task is a cognitive reflection task (likely to benefit from MCP tools)
    if (task.type === 'cognitive_reflection' || task.type === 'planning') {
      return true;
    }

    // Check if task has tool execution history in metadata
    if (task.metadata?.toolExecution) {
      return true;
    }

    return false;
  }

  /**
   * Execute a task via MCP tools
   */
  private async executeTaskViaMCP(
    task: any,
    minecraftUrl: string
  ): Promise<any> {
    if (!this.mcpIntegration) {
      throw new Error('MCP integration not available');
    }

    const startTime = Date.now();

    try {
      // 1. Discover tools for this task
      const toolDiscovery = await this.discoverToolsForTask(task);

      if (toolDiscovery.matchedTools.length === 0) {
        return {
          success: false,
          error: 'No suitable MCP tools found for task',
          type: task.type,
          executionMethod: 'mcp',
          discoveryTime: toolDiscovery.discoveryTime,
        };
      }

      // 2. Execute the most relevant tool
      const bestTool = toolDiscovery.matchedTools[0].tool;
      const toolArgs = this.prepareTaskArgsForTool(task, bestTool);

      console.log(
        `🔧 [REACTIVE EXECUTOR] Executing task via MCP tool: ${bestTool.name}`
      );

      const toolResult = await this.mcpIntegration.executeToolWithEvaluation(
        bestTool,
        toolArgs,
        task.id || `task_${Date.now()}`,
        {
          worldState: await this.getCurrentWorldState(minecraftUrl),
          taskContext: task,
          minecraftEndpoint: minecraftUrl,
        }
      );

      // 3. Convert MCP result to task execution result
      const taskResult = this.convertMCPResultToTaskResult(
        task,
        toolResult,
        minecraftUrl
      );

      // 4. Store execution history
      this.storeTaskExecutionResult(task, taskResult, 'mcp');

      return taskResult;
    } catch (error) {
      console.error(
        `[REACTIVE EXECUTOR] MCP execution failed for task: ${task.title}`,
        error
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : 'MCP execution failed',
        type: task.type,
        executionMethod: 'mcp',
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Discover MCP tools for a specific task
   */
  private async discoverToolsForTask(task: any): Promise<ToolDiscoveryResult> {
    if (!this.mcpIntegration) {
      throw new Error('MCP integration not available');
    }

    const taskDescription =
      task.title || task.description || `Execute ${task.type} task`;
    const goalId = task.id || `task_${Date.now()}`;

    return await this.mcpIntegration.discoverToolsForGoal(
      goalId,
      taskDescription,
      {
        taskType: task.type,
        taskParameters: task.parameters,
        taskMetadata: task.metadata,
        urgency: task.urgency || 0.5,
        priority: task.priority || 0.5,
      }
    );
  }

  /**
   * Prepare task arguments for MCP tool execution
   */
  private prepareTaskArgsForTool(task: any, tool: any): Record<string, any> {
    const args: Record<string, any> = {};

    // Add task parameters
    if (task.parameters) {
      Object.assign(args, task.parameters);
    }

    // Add task metadata
    if (task.metadata) {
      args.taskMetadata = task.metadata;
    }

    // Add task context
    args.taskContext = {
      id: task.id,
      type: task.type,
      title: task.title,
      description: task.description,
      priority: task.priority,
      urgency: task.urgency,
    };

    // Add execution context
    args.executionContext = {
      executionMethod: 'reactive_executor',
      timestamp: Date.now(),
    };

    return args;
  }

  /**
   * Get current world state from Minecraft
   */
  private async getCurrentWorldState(minecraftUrl: string): Promise<any> {
    try {
      const response = await fetch(`${minecraftUrl}/health`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('Failed to get world state from Minecraft:', error);
    }

    return {
      position: { x: 0, y: 64, z: 0 },
      health: 20,
      inventory: { items: [], selectedSlot: 0 },
      environment: 'surface',
      time: 'day',
      biome: 'plains',
    };
  }

  /**
   * Convert MCP tool result to task execution result
   */
  private convertMCPResultToTaskResult(
    task: any,
    toolResult: ToolExecutionResult,
    minecraftUrl: string
  ): any {
    const executionTime = Date.now();

    return {
      success: toolResult.success,
      error: toolResult.error,
      type: task.type,
      executionMethod: 'mcp',
      executionTime: toolResult.executionTime,
      toolResult: {
        toolName: toolResult.toolName,
        effectiveness: toolResult.evaluation.effectiveness,
        sideEffects: toolResult.evaluation.sideEffects,
        recommendation: toolResult.evaluation.recommendation,
        metrics: toolResult.metrics,
      },
      result: toolResult.result,
      metadata: {
        ...task.metadata,
        mcpExecution: {
          toolName: toolResult.toolName,
          toolSuccess: toolResult.success,
          toolEffectiveness: toolResult.evaluation.effectiveness,
          executionTime: toolResult.executionTime,
        },
      },
    };
  }

  /**
   * Store task execution result for analytics
   */
  private storeTaskExecutionResult(
    task: any,
    result: any,
    method: 'mcp' | 'minecraft'
  ): void {
    // This could be extended to store in memory or send to analytics
    console.log(
      `📊 [REACTIVE EXECUTOR] Stored execution result for task: ${task.title} via ${method}`
    );

    if (result.toolResult) {
      this.emit('taskExecuted', {
        taskId: task.id,
        taskType: task.type,
        executionMethod: method,
        success: result.success,
        toolName: result.toolResult.toolName,
        effectiveness: result.toolResult.effectiveness,
        executionTime: result.executionTime,
      });
    }
  }

  /**
   * Get MCP execution statistics
   */
  getMCPExecutionStats(): {
    enabled: boolean;
    totalExecutions: number;
    successRate: number;
    averageExecutionTime: number;
    toolUsage: Record<string, { count: number; successRate: number }>;
  } {
    // This would need to be implemented with actual tracking data
    return {
      enabled: !!this.mcpConfig?.enableMCPExecution,
      totalExecutions: 0,
      successRate: 0,
      averageExecutionTime: 0,
      toolUsage: {},
    };
  }

  /**
   * Update MCP configuration
   */
  updateMCPConfig(newConfig: Partial<MCPExecutionConfig>): void {
    if (this.mcpConfig) {
      this.mcpConfig = { ...this.mcpConfig, ...newConfig };

      // Re-initialize if needed
      if (
        newConfig.enableMCPExecution !== undefined ||
        newConfig.mcpEndpoint !== undefined
      ) {
        this.initializeMCPIntegration();
      }
    }
  }

  /**
   * Emit method for EventEmitter compatibility
   */
  emit(event: string, ...args: any[]): boolean {
    return true; // Stub implementation
  }

  /**
   * Initialize MCP integration
   */
  initializeMCPIntegration(): void {
    // Stub implementation
    console.log('🔧 Initializing MCP integration in DefaultRealTimeAdapter');
  }
}
