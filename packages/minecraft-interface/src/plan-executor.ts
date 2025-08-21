/**
 * PlanExecutor: Executes plans in Minecraft with monitoring and repair
 *
 * Coordinates between the planning system and Minecraft execution, handling
 * plan execution, failure recovery, and real-time adaptation.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { Bot } from 'mineflayer';
import {
  IntegratedPlanningCoordinator,
  Plan,
  PlanStep,
  PlanStatus,
  PlanningContext,
} from '@conscious-bot/planning';
import { BotAdapter } from './bot-adapter';
import { ObservationMapper } from './observation-mapper';
import { ActionTranslator } from './action-translator';
import {
  BotConfig,
  PlanExecutionResult,
  ActionResult,
  ScenarioTelemetry,
  PerformanceMetrics,
} from './types';

export class PlanExecutor extends EventEmitter {
  private botAdapter: BotAdapter;
  private observationMapper: ObservationMapper;
  private actionTranslator: ActionTranslator | null = null;
  private planningCoordinator: IntegratedPlanningCoordinator;
  private config: BotConfig;

  private currentPlan: Plan | null = null;
  private currentStepIndex = 0;
  private isExecuting = false;
  private executionStartTime = 0;
  private performanceMetrics: PerformanceMetrics;

  constructor(
    config: BotConfig,
    planningCoordinator: IntegratedPlanningCoordinator
  ) {
    super();

    this.config = config;
    this.planningCoordinator = planningCoordinator;
    this.botAdapter = new BotAdapter(config);
    this.observationMapper = new ObservationMapper(config);

    this.performanceMetrics = {
      startTime: Date.now(),
      operations: {},
    };

    this.setupEventHandlers();
  }

  /**
   * Initialize connection and setup action translator
   */
  async initialize(): Promise<void> {
    const bot = await this.botAdapter.connect();
    this.actionTranslator = new ActionTranslator(bot, this.config);

    this.emit('initialized', {
      bot: this.botAdapter.getStatus(),
      timestamp: Date.now(),
    });
  }

  /**
   * Execute a complete planning and execution cycle with enhanced signal processing
   */
  async executePlanningCycle(
    initialSignals: any[] = []
  ): Promise<PlanExecutionResult> {
    if (!this.actionTranslator) {
      throw new Error('PlanExecutor not initialized. Call initialize() first.');
    }

    this.isExecuting = true;
    this.executionStartTime = Date.now();

    try {
      const bot = this.botAdapter.getBot();

      // Step 1: Generate comprehensive signals from current world state
      const minecraftSignals = this.observationMapper.generateSignals(bot);
      const allSignals = [...initialSignals, ...minecraftSignals];

      this.emit('signalsGenerated', {
        initialSignals,
        minecraftSignals,
        totalSignals: allSignals.length,
        timestamp: Date.now(),
      });

      // Step 2: Observe current state with enhanced homeostasis
      const context = this.observeCurrentStateWithSignals(bot);

      // Step 3: Generate plan using comprehensive signals and context
      const planningResult = await this.planningCoordinator.planAndExecute(
        allSignals,
        context
      );
      this.currentPlan = planningResult.primaryPlan;
      this.currentStepIndex = 0;

      this.emit('planGenerated', {
        plan: this.currentPlan,
        planningResult,
        signalsProcessed: allSignals.length,
        planningLatency: planningResult.planningLatency,
        timestamp: Date.now(),
      });

      // Step 4: Execute plan with enhanced monitoring
      const executionResult = await this.executePlan(this.currentPlan);

      // Step 5: Record comprehensive telemetry
      const telemetry = this.generateTelemetry(planningResult, executionResult);

      this.emit('executionComplete', {
        result: executionResult,
        telemetry,
        signalsUsed: allSignals,
        finalHomeostasis:
          this.observationMapper.getEnhancedHomeostasisState(bot),
        timestamp: Date.now(),
      });

      return executionResult;
    } finally {
      this.isExecuting = false;
      this.currentPlan = null;
      this.currentStepIndex = 0;
    }
  }

  /**
   * Enhanced state observation that includes signal processing
   */
  private observeCurrentStateWithSignals(bot: Bot): PlanningContext {
    const baseContext =
      this.observationMapper.mapBotStateToPlanningContext(bot);
    const enhancedHomeostasis =
      this.observationMapper.getEnhancedHomeostasisState(bot);

    // Merge enhanced homeostasis data into context
    return {
      ...baseContext,
      enhancedHomeostasis,
      signalProcessingEnabled: true,
    };
  }

  /**
   * Execute a plan step by step
   */
  async executePlan(plan: Plan): Promise<PlanExecutionResult> {
    const actionResults: ActionResult[] = [];
    let repairAttempts = 0;
    const maxRepairAttempts = 3;

    this.recordOperation('planExecution', () => {});

    try {
      for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex++) {
        this.currentStepIndex = stepIndex;
        const step = plan.steps[stepIndex];

        this.emit('stepStarted', {
          step,
          stepIndex,
          totalSteps: plan.steps.length,
          timestamp: Date.now(),
        });

        // Execute step with retries
        let stepResult: ActionResult;
        let retryCount = 0;
        const maxRetries = 2;

        do {
          stepResult = await this.executeStep(step);

          if (!stepResult.success && retryCount < maxRetries) {
            retryCount++;
            this.emit('stepRetry', {
              step,
              stepIndex,
              retryCount,
              error: stepResult.error,
              timestamp: Date.now(),
            });

            // Wait before retry
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } while (!stepResult.success && retryCount <= maxRetries);

        actionResults.push(stepResult);

        if (stepResult.success) {
          this.emit('stepCompleted', {
            step,
            stepIndex,
            result: stepResult,
            timestamp: Date.now(),
          });
        } else {
          this.emit('stepFailed', {
            step,
            stepIndex,
            result: stepResult,
            timestamp: Date.now(),
          });

          // Attempt plan repair
          if (repairAttempts < maxRepairAttempts) {
            repairAttempts++;

            this.emit('repairAttempted', {
              failedStep: step,
              stepIndex,
              repairAttempt: repairAttempts,
              timestamp: Date.now(),
            });

            const repairResult = await this.attemptPlanRepair(plan, stepIndex);

            if (repairResult.success) {
              // Continue with repaired plan
              plan = repairResult.repairedPlan!;
              this.currentPlan = plan;

              this.emit('repairSucceeded', {
                originalPlan: plan,
                repairedPlan: repairResult.repairedPlan,
                timestamp: Date.now(),
              });

              continue;
            } else {
              this.emit('repairFailed', {
                error: repairResult.error,
                timestamp: Date.now(),
              });
            }
          }

          // If we reach here, step failed and repair failed or not attempted
          break;
        }
      }

      const finalWorldState =
        this.observationMapper.mapBotStateToPlanningContext(
          this.botAdapter.getBot()
        ).worldState;

      const success = actionResults.every((result) => result.success);

      return {
        success,
        plan,
        executedSteps: actionResults.filter((r) => r.success).length,
        totalSteps: plan.steps.length,
        startTime: this.executionStartTime,
        endTime: Date.now(),
        actionResults,
        repairAttempts,
        finalWorldState: finalWorldState as any, // TODO: proper type conversion
        error: success
          ? undefined
          : actionResults.find((r) => !r.success)?.error,
      };
    } catch (error) {
      return {
        success: false,
        plan,
        executedSteps: actionResults.filter((r) => r.success).length,
        totalSteps: plan.steps.length,
        startTime: this.executionStartTime,
        endTime: Date.now(),
        actionResults,
        repairAttempts,
        finalWorldState: this.observationMapper.mapBotStateToPlanningContext(
          this.botAdapter.getBot()
        ).worldState as any,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute a single plan step
   */
  private async executeStep(step: PlanStep): Promise<ActionResult> {
    if (!this.actionTranslator) {
      throw new Error('ActionTranslator not available');
    }

    return this.recordOperation('stepExecution', async () => {
      return await this.actionTranslator!.executePlanStep(step);
    });
  }

  /**
   * Attempt to repair a failed plan using GOAP
   */
  private async attemptPlanRepair(
    plan: Plan,
    failedStepIndex: number
  ): Promise<{
    success: boolean;
    repairedPlan?: Plan;
    error?: string;
  }> {
    try {
      // Get current world state
      const currentContext = this.observeCurrentState();

      // Extract remaining goal from the original plan
      const remainingSteps = plan.steps.slice(failedStepIndex + 1);
      const goalSignals = this.extractGoalSignalsFromSteps(remainingSteps);

      // Generate new plan for the remaining goal
      const repairResult = await this.planningCoordinator.planAndExecute(
        goalSignals,
        {
          ...currentContext,
          timeConstraints: {
            ...currentContext.timeConstraints,
            urgency: 'high', // Mark as urgent for repair
          },
        }
      );

      // Merge executed steps with new plan
      const executedSteps = plan.steps.slice(0, failedStepIndex);
      const repairedPlan: Plan = {
        ...plan,
        id: `repaired-${plan.id}`,
        steps: [...executedSteps, ...repairResult.primaryPlan.steps],
        status: PlanStatus.PENDING,
        updatedAt: Date.now(),
      };

      return {
        success: true,
        repairedPlan,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract goal signals from remaining plan steps
   */
  private extractGoalSignalsFromSteps(steps: PlanStep[]): any[] {
    const signals: any[] = [];

    steps.forEach((step) => {
      // Infer goal type from step action
      const actionType = step.action.type.toLowerCase();

      if (actionType.includes('mine') || actionType.includes('gather')) {
        signals.push({ type: 'resource_need', value: 80, urgency: 'high' });
      } else if (actionType.includes('craft') || actionType.includes('make')) {
        signals.push({
          type: 'achievement_drive',
          value: 75,
          urgency: 'medium',
        });
      } else if (
        actionType.includes('navigate') ||
        actionType.includes('move')
      ) {
        signals.push({
          type: 'exploration_drive',
          value: 60,
          urgency: 'medium',
        });
      } else {
        signals.push({ type: 'curiosity', value: 50, urgency: 'low' });
      }
    });

    return signals;
  }

  /**
   * Observe current world state
   */
  private observeCurrentState(): PlanningContext {
    const bot = this.botAdapter.getBot();
    return this.observationMapper.mapBotStateToPlanningContext(bot);
  }

  /**
   * Generate telemetry for the execution
   */
  private generateTelemetry(
    planningResult: any,
    executionResult: PlanExecutionResult
  ): ScenarioTelemetry {
    const now = Date.now();
    const totalLatency = now - this.executionStartTime;

    return {
      planningLatency: planningResult.planningLatency,
      executionLatency: executionResult.endTime - executionResult.startTime,
      totalLatency,

      stepMetrics: {
        planned: executionResult.totalSteps,
        executed: executionResult.executedSteps,
        succeeded: executionResult.actionResults.filter((r) => r.success)
          .length,
        failed: executionResult.actionResults.filter((r) => !r.success).length,
        repaired: executionResult.repairAttempts,
      },

      performanceMetrics: {
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
        cpuUsage: undefined, // TODO: implement CPU monitoring
        networkLatency: undefined, // TODO: implement network monitoring
      },

      cognitiveMetrics: {
        routingDecision: planningResult.routingDecision?.router || 'unknown',
        planningApproach: planningResult.planningApproach || 'unknown',
        confidence: planningResult.confidence || 0,
        complexityScore: executionResult.totalSteps * 10, // Simple complexity metric
      },

      minecraftMetrics: {
        blocksInteracted: executionResult.actionResults.filter(
          (r) => r.action.type === 'mine_block'
        ).length,
        distanceTraveled: this.calculateDistanceTraveled(
          executionResult.actionResults
        ),
        itemsCollected: executionResult.actionResults.filter(
          (r) => r.action.type === 'pickup_item'
        ).length,
        actionsFailed: executionResult.actionResults.filter((r) => !r.success)
          .length,
      },
    };
  }

  /**
   * Calculate total distance traveled during execution
   */
  private calculateDistanceTraveled(actionResults: ActionResult[]): number {
    let totalDistance = 0;

    actionResults.forEach((result) => {
      if (result.action.type === 'navigate' && result.data?.finalPosition) {
        // This is simplified - ideally we'd track all movement
        const distance = result.data.distanceRemaining || 0;
        totalDistance += Math.max(0, 10 - distance); // Estimate actual distance moved
      }
    });

    return totalDistance;
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.botAdapter.on('botEvent', (event) => {
      this.emit('botEvent', event);
    });

    this.botAdapter.on('error', (error) => {
      this.emit('error', error);

      // Emergency stop execution on critical errors
      if (this.isExecuting) {
        this.emit('executionInterrupted', {
          error: error.error,
          timestamp: Date.now(),
        });
        this.isExecuting = false;
      }
    });
  }

  /**
   * Record operation timing for performance metrics
   */
  private recordOperation<T>(
    operation: string,
    fn: () => T | Promise<T>
  ): T | Promise<T> {
    const startTime = Date.now();

    if (!this.performanceMetrics.operations[operation]) {
      this.performanceMetrics.operations[operation] = {
        count: 0,
        totalTime: 0,
        averageTime: 0,
        minTime: Infinity,
        maxTime: 0,
      };
    }

    const result = fn();

    if (result instanceof Promise) {
      return result.then((value) => {
        this.recordOperationTime(operation, startTime);
        return value;
      });
    } else {
      this.recordOperationTime(operation, startTime);
      return result;
    }
  }

  /**
   * Record operation timing
   */
  private recordOperationTime(operation: string, startTime: number): void {
    const duration = Date.now() - startTime;
    const ops = this.performanceMetrics.operations[operation];

    ops.count++;
    ops.totalTime += duration;
    ops.averageTime = ops.totalTime / ops.count;
    ops.minTime = Math.min(ops.minTime, duration);
    ops.maxTime = Math.max(ops.maxTime, duration);
  }

  /**
   * Get current execution status
   */
  getExecutionStatus(): any {
    return {
      isExecuting: this.isExecuting,
      currentPlan: this.currentPlan
        ? {
            id: this.currentPlan.id,
            goalId: this.currentPlan.goalId,
            totalSteps: this.currentPlan.steps.length,
            status: this.currentPlan.status,
          }
        : null,
      currentStepIndex: this.currentStepIndex,
      executionStartTime: this.executionStartTime,
      bot: this.botAdapter.getStatus(),
      performanceMetrics: this.performanceMetrics,
    };
  }

  /**
   * Emergency stop execution
   */
  emergencyStop(): void {
    this.isExecuting = false;
    this.botAdapter.emergencyStop();
    this.emit('emergencyStop', { timestamp: Date.now() });
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.isExecuting = false;
    await this.botAdapter.disconnect();
    this.emit('shutdown', { timestamp: Date.now() });
  }
}
