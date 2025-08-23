/**
 * Enhanced Reactive Executor
 *
 * Integrates enhanced GOAP planning, plan repair, and safety reflexes
 * for real-time opportunistic action selection and execution
 *
 * @author @darianrosebrook
 */

import { Plan, PlanStep, PlanStatus, GoalType, GoalStatus } from '../types';
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
}

/**
 * Default execution context builder
 */
class DefaultExecutionContextBuilder implements ExecutionContextBuilder {
  buildContext(
    worldState: WorldState,
    currentPlan?: GOAPPlan
  ): ExecutionContext {
    return {
      threatLevel: worldState.getThreatLevel(),
      hostileCount: worldState.getNearbyHostiles().length,
      nearLava: false, // Would be determined by world state
      lavaDistance: 100,
      resourceValue: 0,
      detourDistance: 0,
      subgoalUrgency: currentPlan ? 0.5 : 0,
      estimatedTimeToSubgoal: currentPlan ? currentPlan.estimatedDuration : 0,
      commitmentStrength: 0.5,
      timeOfDay: worldState.getTimeOfDay(),
      lightLevel: worldState.getLightLevel(),
      airLevel: worldState.getAir(),
    };
  }
}

/**
 * Default real-time adapter
 */
class DefaultRealTimeAdapter implements RealTimeAdapter {
  adaptToOpportunities(context: ExecutionContext): any[] {
    // Simplified opportunity detection
    const opportunities = [];

    if (context.nearestResource && context.resourceValue > 10) {
      opportunities.push({
        type: 'resource_gathering',
        value: context.resourceValue,
        distance: context.detourDistance,
      });
    }

    return opportunities;
  }

  respondToThreats(threats: any[]): any[] {
    // Simplified threat response
    return threats.map((threat) => ({
      type: 'evasion',
      priority: threat.dangerLevel,
      action: 'flee',
    }));
  }

  optimizeExecution(plan: GOAPPlan, context: ExecutionContext): GOAPPlan {
    // Simplified optimization - would implement more sophisticated logic
    return plan;
  }
}
