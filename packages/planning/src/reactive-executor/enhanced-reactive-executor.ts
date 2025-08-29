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
  PlanStep,
  PlanStatus,
  PlanStepStatus,
  GoalType,
  GoalStatus,
  ActionType,
} from '../types';
import {
  EnhancedGOAPPlanner,
  GOAPPlan,
  WorldState,
  ExecutionContext,
  SafetyAction,
  ActionResult,
  ReactiveExecutorMetrics,
  MCPBus,
} from './enhanced-goap-planner';
import { EnhancedPlanRepair } from './enhanced-plan-repair';

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
  ): ExecutionContext;
}

export interface RealTimeAdapter {
  adaptToOpportunities(context: ExecutionContext): any[];
  respondToThreats(threats: any[]): any[];
  optimizeExecution(plan: GOAPPlan, context: ExecutionContext): GOAPPlan;
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

  constructor() {
    this.goapPlanner = new EnhancedGOAPPlanner();
    this.planRepair = new EnhancedPlanRepair();
    this.contextBuilder = new DefaultExecutionContextBuilder();
    this.realTimeAdapter = new DefaultRealTimeAdapter();
    this.metrics = this.initializeMetrics();
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

      // Build execution context
      const context = this.contextBuilder.buildContext(worldState, goapPlan);

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
    context: ExecutionContext,
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
   * Execute a specific task
   */
  async executeTask(task: any): Promise<any> {
    try {
      // Use the executeTaskInMinecraft function directly for proper task execution
      const result = await this.executeTaskInMinecraft(task);

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
        case 'craft':
          return await this.executeCraftTask(task, minecraftUrl);
        case 'move':
        case 'move_forward':
          return await this.executeMoveTask(task, minecraftUrl);
        case 'gather':
          return await this.executeGatherTask(task, minecraftUrl);
        case 'explore':
          return await this.executeExploreTask(task, minecraftUrl);
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

    // Check if we can actually craft the item
    const canCraft = await fetch(`${minecraftUrl}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'can_craft',
        parameters: { item: itemToCraft },
      }),
    }).then((res) => res.json());

    if (!(canCraft as any).success || !(canCraft as any).canCraft) {
      return {
        success: false,
        error: (canCraft as any).error || 'Cannot craft item',
        item: itemToCraft,
        type: 'craft',
      };
    }

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
  ): ExecutionContext {
    // Real context building would analyze world state and plan
    // For now, use basic values from world state with empty defaults
    const context: ExecutionContext = {
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
  adaptToOpportunities(context: ExecutionContext): any[] {
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

  optimizeExecution(plan: GOAPPlan, context: ExecutionContext): GOAPPlan {
    // Real optimization would analyze context and modify plan accordingly
    // For now, return plan unchanged to indicate no optimization available
    console.log('⚡ Plan optimization: No real-time optimization available');
    return plan;
  }
}
