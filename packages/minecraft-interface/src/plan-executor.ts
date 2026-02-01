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
import { Plan, PlanStep, PlanningContext, MinecraftAction } from './types';

// Minimal type definitions to avoid circular dependency
export interface IntegratedPlanningCoordinator {
  plan(goal: string, context: PlanningContext): Promise<any>;
  executePlan(plan: Plan, context: PlanningContext): Promise<any>;
  planAndExecute(
    goal: string | any[],
    context: PlanningContext,
    signals?: any[]
  ): Promise<any>;
}

export enum PlanStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BLOCKED = 'blocked',
}
import { BotAdapter } from './bot-adapter';
import { ObservationMapper } from './observation-mapper';
import { ActionTranslator } from './action-translator';
import { StateMachineWrapper } from './extensions/state-machine-wrapper';
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
  private stateMachineWrapper: StateMachineWrapper | null = null;
  private planningCoordinator: IntegratedPlanningCoordinator;
  private config: BotConfig;

  private currentPlan: Plan | null = null;
  private currentStepIndex = 0;
  private isExecuting = false;
  private executionStartTime = 0;
  private lastValidationLogAt = 0;
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

    // Handle error events to prevent unhandled errors
    this.on('error', (error) => {
      console.error('PlanExecutor error:', error);
    });

    this.setupEventHandlers();
  }

  /**
   * Initialize connection and setup action translator with better error handling
   */
  async initialize(): Promise<void> {
    try {
      const bot = await this.botAdapter.connect();

      // Wait for bot to be fully spawned before creating ActionTranslator
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Bot spawn timeout'));
        }, 30000); // 30 second timeout

        const checkSpawn = () => {
          if (bot.entity && bot.entity.position) {
            clearTimeout(timeout);
            resolve();
          }
        };

        checkSpawn();
        if (!bot.entity || !bot.entity.position) {
          bot.once('spawn', () => {
            clearTimeout(timeout);
            resolve();
          });
        }

        bot.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      // Create StateMachineWrapper for complex actions
      this.stateMachineWrapper = new StateMachineWrapper(bot);

      // Create ActionTranslator with StateMachineWrapper
      this.actionTranslator = new ActionTranslator(
        bot,
        this.config,
        this.stateMachineWrapper
      );

      // Initialize safety monitor with the shared ActionTranslator
      // This avoids creating duplicate ActionTranslator/NavigationBridge instances
      this.botAdapter.initializeSafetyMonitor(this.actionTranslator);

      this.emit('initialized', {
        bot: this.botAdapter.getStatus(),
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('PlanExecutor initialization failed:', error);
      this.emit('error', { error, timestamp: Date.now() });
      throw error;
    }
  }

  /**
   * Execute a complete planning and execution cycle with enhanced signal processing and error recovery
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
      let minecraftSignals: any[] = [];
      try {
        minecraftSignals = this.observationMapper.generateSignals(bot);
      } catch (error) {
        console.warn('Failed to generate minecraft signals:', error);
        minecraftSignals = [];
      }

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
      // INTERMEDIATE FIX: Handle case where planning is retired or no plan available
      // TODO(rig-planning): Replace with proper Sterling solver integration when planning rigs are implemented.
      if (!this.currentPlan) {
        // Check if this is the legacy retired case (expected) vs actual planning failure
        const isLegacyRetired =
          (planningResult as any).isLegacyRetired === true;
        const errorMsg = isLegacyRetired
          ? 'Legacy planning retired — awaiting rig implementation'
          : planningResult.error || 'No plan available for execution';

        // Return gracefully instead of throwing - this is expected when idle or legacy retired
        return {
          success: false,
          plan: null as any,
          executedSteps: 0,
          totalSteps: 0,
          startTime: this.executionStartTime,
          endTime: Date.now(),
          actionResults: [],
          repairAttempts: 0,
          finalWorldState: this.observationMapper.mapBotStateToPlanningContext(
            bot
          ).worldState as any,
          error: errorMsg,
        };
      }

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
    } catch (error) {
      console.error('Planning cycle error:', error);
      this.emit('executionError', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });

      // Return a failed result instead of throwing
      const bot = this.botAdapter.getBot();
      return {
        success: false,
        plan: this.currentPlan!,
        executedSteps: 0,
        totalSteps: this.currentPlan?.steps.length || 0,
        startTime: this.executionStartTime,
        endTime: Date.now(),
        actionResults: [],
        repairAttempts: 0,
        finalWorldState: this.observationMapper.mapBotStateToPlanningContext(
          bot
        ).worldState as any,
        error: error instanceof Error ? error.message : String(error),
      };
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
    // Merge enhanced homeostasis data into context
    return {
      ...baseContext,
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

          if (
            !stepResult.success &&
            stepResult.error &&
            this.isNonRetriableError(stepResult.error)
          ) {
            break;
          }

          if (
            !stepResult.success &&
            stepResult.error &&
            this.isNavigationBusyError(stepResult.error) &&
            retryCount < maxRetries
          ) {
            retryCount++;
            const backoffMs = Math.min(2000, 500 * retryCount);
            this.emit('stepRetry', {
              step,
              stepIndex,
              retryCount,
              error: stepResult.error,
              timestamp: Date.now(),
            });
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

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
        finalWorldState: finalWorldState as any, // TODO: Implement proper type conversion for final world state
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

    const validation = this.validateAndNormalizeStep(step);
    if (!validation.ok) {
      if (this.shouldLogValidation()) {
        console.warn(
          `[PlanExecutor] Invalid plan step: ${validation.error} (type=${step.action?.type ?? 'none'})`
        );
      }
      return {
        success: false,
        action: validation.fallbackAction,
        startTime: Date.now(),
        endTime: Date.now(),
        error: validation.error,
        data: {
          reasonCode: 'INVALID_PLAN_STEP',
          validation: validation.details,
        },
      };
    }

    return this.recordOperation('stepExecution', async () => {
      return await this.actionTranslator!.executePlanStep(validation.step);
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
      const actionType = (step.action?.type ?? '').toLowerCase();

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
        cpuUsage: this.getCpuUsagePercent(), // CPU usage monitoring with Node.js process.cpuUsage()
        networkLatency: this.getNetworkLatency(), // Network latency monitoring for bot connections
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

      // Check if this is a death error
      if (error.error === 'Bot died') {
        // Only log bot death in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log('Bot died, pausing execution until respawn...');
        }
        this.isExecuting = false;
        this.emit('executionPaused', {
          reason: 'bot_death',
          timestamp: Date.now(),
        });
      } else {
        // Emergency stop execution on critical errors
        if (this.isExecuting) {
          this.emit('executionInterrupted', {
            error: error.error,
            timestamp: Date.now(),
          });
          this.isExecuting = false;
        }
      }
    });

    // Handle respawn events
    this.botAdapter.on('respawned', (data) => {
      // Only log bot respawn in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log('Bot respawned, resuming execution...');
      }
      this.emit('executionResumed', {
        reason: 'bot_respawned',
        health: data.health,
        food: data.food,
        timestamp: Date.now(),
      });
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

  /**
   * Get current CPU usage percentage
   */
  private getCpuUsagePercent(): number {
    try {
      const cpuUsage = process.cpuUsage(this.lastCpuUsage);
      this.lastCpuUsage = process.cpuUsage();

      // Convert from microseconds to percentage
      // This is a simplified calculation - in production you'd want more sophisticated monitoring
      const userTime = cpuUsage.user / 1000; // Convert to milliseconds
      const systemTime = cpuUsage.system / 1000;
      const totalTime = userTime + systemTime;

      // Estimate percentage based on recent usage
      // This is a rough approximation - real CPU monitoring would be more complex
      return Math.min(100, Math.max(0, totalTime / 10)); // Scale to 0-100%
    } catch (error) {
      console.warn('Failed to get CPU usage:', error);
      return 0;
    }
  }

  /**
   * Get network latency for bot connections
   */
  private getNetworkLatency(): number {
    try {
      // For now, return a placeholder value
      // In production, this would measure actual network latency to the Minecraft server
      // by sending ping packets or measuring response times
      return this.networkLatency || 50; // Default 50ms latency
    } catch (error) {
      console.warn('Failed to get network latency:', error);
      return 100; // Fallback to 100ms on error
    }
  }

  /**
   * Update network latency measurement
   */
  private updateNetworkLatency(): void {
    // This would be called periodically to measure actual network latency
    // For now, it's a placeholder method
    this.networkLatency = Math.random() * 100 + 10; // Simulate 10-110ms latency
  }

  private isNavigationBusyError(error: string): boolean {
    return (
      error.includes('Already navigating') ||
      error.includes('Debounced duplicate navigate')
    );
  }

  private isNonRetriableError(error: string): boolean {
    return (
      error.includes('Invalid navigation target') ||
      error.includes('Step action is required')
    );
  }

  private validateAndNormalizeStep(step: PlanStep): {
    ok: boolean;
    step: PlanStep;
    error?: string;
    details?: Record<string, any>;
    fallbackAction: MinecraftAction;
  } {
    const fallbackAction: MinecraftAction = {
      type: 'wait',
      parameters: { durationMs: 0 },
    };

    if (!step.action || !step.action.type) {
      return {
        ok: false,
        step,
        error: 'Step action is required',
        details: { stepId: step.id },
        fallbackAction,
      };
    }

    const actionType = step.action.type.toLowerCase();
    if (actionType === 'navigate' || actionType === 'move_to') {
      const params: any = step.action.parameters ?? {};
      const raw =
        params.target ??
        params.position ??
        params.destination ??
        params.goal ??
        params;
      let x: number | null = null;
      let y: number | null = null;
      let z: number | null = null;

      if (Array.isArray(raw) && raw.length >= 3) {
        x = Number(raw[0]);
        y = Number(raw[1]);
        z = Number(raw[2]);
      } else if (raw && typeof raw === 'object') {
        x = Number((raw as any).x);
        y = Number((raw as any).y);
        z = Number((raw as any).z);
      }

      if (![x, y, z].every((n) => Number.isFinite(n))) {
        return {
          ok: false,
          step,
          error: 'Invalid navigation target',
          details: { actionType, stepId: step.id },
          fallbackAction,
        };
      }

      const normalized: PlanStep = {
        ...step,
        action: {
          ...step.action,
          parameters: {
            ...params,
            target: { x, y, z },
          },
        },
      };
      return { ok: true, step: normalized, fallbackAction };
    }

    return { ok: true, step, fallbackAction };
  }

  private shouldLogValidation(): boolean {
    const now = Date.now();
    if (now - this.lastValidationLogAt < 1000) return false;
    this.lastValidationLogAt = now;
    return true;
  }

  // CPU usage tracking
  private lastCpuUsage = process.cpuUsage();
  private networkLatency = 50; // Default network latency in ms
}
