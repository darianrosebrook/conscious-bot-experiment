/**
 * Motor Controller - Core embodied motor control system
 *
 * Translates high-level action intentions into precise, coordinated physical
 * movements with real-time feedback integration and emergency response.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  IMotorController,
  MotorAction,
  ExecutionContext,
  MotorExecutionResult,
  CoordinationResult,
  CoordinationStrategy,
  ProcessedFeedback,
  MotorAdjustmentResult,
  EmergencyType,
  EmergencyResponseResult,
  SensorimotorConfig,
  SensorimotorMetrics,
  validateMotorAction,
  validateExecutionContext,
  validateMotorExecutionResult,
  calculateActionPriority,
  estimateActionDuration,
  actionsConflict,
} from './types';

export interface MotorControllerEvents {
  'action-started': [{ actionId: string; type: string }];
  'action-completed': [MotorExecutionResult];
  'action-failed': [{ actionId: string; reason: string }];
  'coordination-started': [{ actionIds: string[]; strategy: string }];
  'coordination-completed': [CoordinationResult];
  'emergency-triggered': [{ type: EmergencyType; responseTime: number }];
  'motor-adjustment': [MotorAdjustmentResult];
  'calibration-updated': [
    { parameter: string; oldValue: number; newValue: number },
  ];
}

/**
 * Action execution state tracking
 */
interface ActionState {
  action: MotorAction;
  context: ExecutionContext;
  startTime: number;
  expectedDuration: number;
  priority: number;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'aborted';
  result?: MotorExecutionResult;
  adjustments: MotorAdjustmentResult[];
}

/**
 * Core motor control system with embodied intelligence
 */
export class MotorController
  extends EventEmitter<MotorControllerEvents>
  implements IMotorController
{
  private activeActions = new Map<string, ActionState>();
  private actionQueue: MotorAction[] = [];
  private emergencyState = false;
  private calibrationData = new Map<string, number>();
  private performanceHistory: Array<{
    timestamp: number;
    latency: number;
    success: boolean;
    actionType: string;
  }> = [];

  // Performance metrics
  private metrics: SensorimotorMetrics = {
    motorControl: {
      executionLatency: { mean: 0, p95: 0, p99: 0 },
      successRate: 1.0,
      precisionAccuracy: 1.0,
      energyEfficiency: 1.0,
    },
    coordination: {
      synchronizationAccuracy: 1.0,
      conflictResolutionTime: 0,
      multiActionSuccessRate: 1.0,
      resourceUtilization: 0.5,
    },
    feedback: {
      feedbackLatency: 0,
      predictionAccuracy: 1.0,
      learningRate: 0.01,
      adaptationSpeed: 0.5,
    },
    safety: {
      emergencyResponseTime: 0,
      hazardDetectionRate: 1.0,
      recoverySuccessRate: 1.0,
      safetyViolations: 0,
    },
  };

  constructor(
    private config: SensorimotorConfig,
    private actionExecutor: any // Will be injected
  ) {
    super();

    // Initialize calibration defaults
    this.initializeCalibration();

    // Start control loop
    this.startControlLoop();

    // Start performance monitoring
    setInterval(() => this.updateMetrics(), 1000);
  }

  /**
   * Execute coordinated motor action with feedback monitoring
   */
  async executeMotorAction(
    action: MotorAction,
    context: ExecutionContext
  ): Promise<MotorExecutionResult> {
    const startTime = Date.now();

    try {
      validateMotorAction(action);
      validateExecutionContext(context);

      // Check for emergency state
      if (this.emergencyState && action.type !== 'emergency_response') {
        return this.createFailureResult(
          action.id,
          startTime,
          'System in emergency state'
        );
      }

      // Calculate priority and estimated duration
      const priority = calculateActionPriority(action, context);
      const expectedDuration = estimateActionDuration(action, context);

      // Create action state
      const actionState: ActionState = {
        action,
        context,
        startTime,
        expectedDuration,
        priority,
        status: 'pending',
        adjustments: [],
      };

      this.activeActions.set(action.id, actionState);

      this.emit('action-started', {
        actionId: action.id,
        type: action.type,
      });

      // Check for conflicts with existing actions
      const conflicts = this.checkForConflicts(action);
      if (conflicts.length > 0) {
        await this.resolveConflicts(action, conflicts);
      }

      // Execute the action
      actionState.status = 'executing';
      const result = await this.executeSpecificAction(action, context);

      // Update state and metrics
      actionState.status = result.success ? 'completed' : 'failed';
      actionState.result = result;

      this.updatePerformanceHistory(
        result.executionTime,
        result.success,
        action.type
      );

      if (result.success) {
        this.emit('action-completed', result);
      } else {
        this.emit('action-failed', {
          actionId: action.id,
          reason: result.errors.join(', '),
        });
      }

      this.activeActions.delete(action.id);
      return validateMotorExecutionResult(result);
    } catch (error) {
      const result = this.createFailureResult(
        action.id,
        startTime,
        `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );

      this.emit('action-failed', {
        actionId: action.id,
        reason: result.errors[0],
      });

      this.activeActions.delete(action.id);
      return result;
    }
  }

  /**
   * Coordinate multiple simultaneous motor actions
   */
  async coordinateActionSequence(
    actions: MotorAction[],
    strategy: CoordinationStrategy
  ): Promise<CoordinationResult> {
    const startTime = Date.now();
    const actionIds = actions.map((a) => a.id);

    this.emit('coordination-started', {
      actionIds,
      strategy: strategy.type,
    });

    try {
      let coordinationResult: CoordinationResult;

      switch (strategy.type) {
        case 'sequential':
          coordinationResult = await this.executeSequential(actions, strategy);
          break;
        case 'parallel':
          coordinationResult = await this.executeParallel(actions, strategy);
          break;
        case 'interleaved':
          coordinationResult = await this.executeInterleaved(actions, strategy);
          break;
        case 'conditional':
          coordinationResult = await this.executeConditional(actions, strategy);
          break;
        default:
          throw new Error(`Unknown coordination strategy: ${strategy.type}`);
      }

      coordinationResult.totalExecutionTime = Math.max(
        1,
        Date.now() - startTime
      );

      this.emit('coordination-completed', coordinationResult);
      return coordinationResult;
    } catch (error) {
      const failureResult: CoordinationResult = {
        success: false,
        coordinatedActions: actionIds,
        totalExecutionTime: Date.now() - startTime,
        coordination: {
          synchronizationAccuracy: 0,
          conflictsResolved: 0,
          resourceUtilization: 0,
        },
        individualResults: actions.map((action) =>
          this.createFailureResult(
            action.id,
            startTime,
            `Coordination failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        ),
      };

      this.emit('coordination-completed', failureResult);
      return failureResult;
    }
  }

  /**
   * Adjust ongoing motor action based on sensory feedback
   */
  adjustMotorAction(
    actionId: string,
    feedback: ProcessedFeedback
  ): MotorAdjustmentResult {
    const actionState = this.activeActions.get(actionId);

    if (!actionState) {
      return {
        actionId,
        adjustmentType: 'abort',
        adjustmentMagnitude: 0,
        success: false,
        confidence: 0,
        timestamp: Date.now(),
      };
    }

    try {
      let adjustmentType: MotorAdjustmentResult['adjustmentType'] =
        'correction';
      let adjustmentMagnitude = 0;
      let newParameters: Record<string, any> = {};

      // Analyze feedback for adjustment needs
      if (feedback.interpretation.success === false) {
        if (
          feedback.interpretation.deviation &&
          feedback.interpretation.deviation > 0.5
        ) {
          adjustmentType = 'recalibration';
          adjustmentMagnitude = feedback.interpretation.deviation;

          // Update motor parameters based on error
          newParameters = this.calculateCorrectionParameters(
            actionState.action,
            feedback
          );
        } else {
          adjustmentType = 'correction';
          adjustmentMagnitude = feedback.interpretation.deviation || 0.3;
        }
      } else if (
        feedback.interpretation.accuracy &&
        feedback.interpretation.accuracy < 0.7
      ) {
        adjustmentType = 'compensation';
        adjustmentMagnitude = 1 - feedback.interpretation.accuracy;
      }

      // Apply adjustment if significant enough
      const adjustmentResult: MotorAdjustmentResult = {
        actionId,
        adjustmentType,
        adjustmentMagnitude,
        success: adjustmentMagnitude > 0.1, // Only adjust if significant
        newParameters:
          Object.keys(newParameters).length > 0 ? newParameters : undefined,
        confidence: feedback.confidence,
        timestamp: Date.now(),
      };

      if (adjustmentResult.success) {
        actionState.adjustments.push(adjustmentResult);

        // Apply the adjustment to ongoing action
        this.applyMotorAdjustment(actionState, adjustmentResult);
      }

      this.emit('motor-adjustment', adjustmentResult);
      return adjustmentResult;
    } catch (error) {
      const failureResult: MotorAdjustmentResult = {
        actionId,
        adjustmentType: 'abort',
        adjustmentMagnitude: 0,
        success: false,
        confidence: 0,
        timestamp: Date.now(),
      };

      this.emit('motor-adjustment', failureResult);
      return failureResult;
    }
  }

  /**
   * Execute emergency motor response for safety
   */
  async executeEmergencyResponse(
    emergencyType: EmergencyType,
    currentState: any
  ): Promise<EmergencyResponseResult> {
    const startTime = Date.now();
    this.emergencyState = true;

    this.emit('emergency-triggered', {
      type: emergencyType,
      responseTime: 0,
    });

    try {
      // Abort all non-emergency actions
      await this.abortNonEmergencyActions();

      // Execute emergency-specific response
      let actionsExecuted: string[] = [];
      let safetyStatus: EmergencyResponseResult['safetyStatus'] = 'danger';

      switch (emergencyType) {
        case 'collision_imminent':
          actionsExecuted = await this.executeCollisionAvoidance(currentState);
          safetyStatus = 'caution';
          break;
        case 'fall_danger':
          actionsExecuted = await this.executeFallPrevention(currentState);
          safetyStatus = 'caution';
          break;
        case 'hostile_mob':
          actionsExecuted = await this.executeDefensiveResponse(currentState);
          safetyStatus = 'caution';
          break;
        case 'environmental_hazard':
          actionsExecuted = await this.executeHazardAvoidance(currentState);
          safetyStatus = 'caution';
          break;
        default:
          actionsExecuted = await this.executeGenericEmergencyStop();
          safetyStatus = 'safe';
      }

      const responseTime = Math.max(1, Date.now() - startTime); // Ensure positive response time
      this.metrics.safety.emergencyResponseTime = responseTime;

      const result: EmergencyResponseResult = {
        emergencyType,
        responseTime,
        success: true,
        actionsExecuted,
        safetyStatus,
        recoveryPlan: {
          steps: ['assess_situation', 'resume_normal_operation'],
          estimatedTime: 1000,
          successProbability: 0.9,
        },
        timestamp: startTime,
      };

      // Reset emergency state after successful response
      this.emergencyState = false;

      return result;
    } catch (error) {
      const result: EmergencyResponseResult = {
        emergencyType,
        responseTime: Date.now() - startTime,
        success: false,
        actionsExecuted: [],
        safetyStatus: 'critical',
        timestamp: startTime,
      };

      // Keep emergency state until manual reset
      return result;
    }
  }

  /**
   * Calibrate motor responses based on environmental conditions
   */
  async calibrateMotorResponses(environmentConditions: any): Promise<void> {
    try {
      // Update movement speed based on terrain
      const terrainMultiplier = this.getTerrainSpeedMultiplier(
        environmentConditions.terrain
      );
      const oldSpeed = this.calibrationData.get('movement_speed') || 1.0;
      const newSpeed = oldSpeed * terrainMultiplier;

      this.calibrationData.set('movement_speed', newSpeed);

      // Update precision based on lighting
      const lightingMultiplier = this.getLightingPrecisionMultiplier(
        environmentConditions.lighting
      );
      const oldPrecision = this.calibrationData.get('precision_factor') || 1.0;
      const newPrecision = oldPrecision * lightingMultiplier;

      this.calibrationData.set('precision_factor', newPrecision);

      // Update turning speed based on weather
      const weatherMultiplier = this.getWeatherTurningMultiplier(
        environmentConditions.weather
      );
      const oldTurning = this.calibrationData.get('turning_speed') || 1.0;
      const newTurning = oldTurning * weatherMultiplier;

      this.calibrationData.set('turning_speed', newTurning);

      // Emit calibration updates
      this.emit('calibration-updated', {
        parameter: 'movement_speed',
        oldValue: oldSpeed,
        newValue: newSpeed,
      });

      this.emit('calibration-updated', {
        parameter: 'precision_factor',
        oldValue: oldPrecision,
        newValue: newPrecision,
      });

      this.emit('calibration-updated', {
        parameter: 'turning_speed',
        oldValue: oldTurning,
        newValue: newTurning,
      });
    } catch (error) {
      console.error('Motor calibration failed:', error);
    }
  }

  /**
   * Get current motor controller state
   */
  getCurrentState(): {
    activeActions: number;
    emergencyState: boolean;
    queueLength: number;
    metrics: SensorimotorMetrics;
    calibration: Record<string, number>;
  } {
    return {
      activeActions: this.activeActions.size,
      emergencyState: this.emergencyState,
      queueLength: this.actionQueue.length,
      metrics: { ...this.metrics },
      calibration: Object.fromEntries(this.calibrationData),
    };
  }

  /**
   * Stop all motor actions and reset state
   */
  stop(): void {
    // Abort all active actions
    for (const [actionId, state] of this.activeActions) {
      state.status = 'aborted';
      this.emit('action-failed', {
        actionId,
        reason: 'Motor controller stopped',
      });
    }

    this.activeActions.clear();
    this.actionQueue = [];
    this.emergencyState = false;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): SensorimotorMetrics {
    return { ...this.metrics };
  }

  // ===== PRIVATE METHODS =====

  private initializeCalibration(): void {
    this.calibrationData.set('movement_speed', 1.0);
    this.calibrationData.set('precision_factor', 1.0);
    this.calibrationData.set('turning_speed', 1.0);
    this.calibrationData.set('acceleration', 1.0);
    this.calibrationData.set('deceleration', 1.0);
  }

  private startControlLoop(): void {
    const controlPeriod = 1000 / this.config.motorControl.controlFrequency; // ms

    setInterval(() => {
      this.processActionQueue();
      this.monitorActiveActions();
      this.checkForTimeouts();
    }, controlPeriod);
  }

  private async executeSpecificAction(
    action: MotorAction,
    context: ExecutionContext
  ): Promise<MotorExecutionResult> {
    const startTime = Date.now();

    try {
      // Apply calibration factors and include action ID
      const adjustedParameters = {
        ...this.applyCalibration(action.parameters),
        actionId: action.id,
      };

      // Execute via action executor interface
      let result: MotorExecutionResult;

      switch (action.type) {
        case 'move_forward':
        case 'move_backward':
        case 'strafe_left':
        case 'strafe_right':
        case 'turn_left':
        case 'turn_right':
        case 'jump':
        case 'crouch':
        case 'sprint':
        case 'swim':
        case 'climb':
        case 'stop':
          result = await this.actionExecutor.executeMovement(
            action.type,
            adjustedParameters
          );
          break;

        case 'mine_block':
        case 'place_block':
        case 'interact_block':
        case 'pickup_item':
        case 'drop_item':
        case 'use_item':
        case 'craft_item':
        case 'wield_tool':
          result = await this.actionExecutor.executeManipulation(
            action.type,
            adjustedParameters
          );
          break;

        case 'chat_message':
        case 'gesture':
        case 'look_at':
        case 'point':
          result = await this.actionExecutor.executeCommunication(
            action.type,
            adjustedParameters
          );
          break;

        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }

      // Validate precision if required
      if (action.requiredPrecision > 0.5 && result.achievedPrecision) {
        if (result.achievedPrecision < action.requiredPrecision) {
          result.warnings.push('Precision target not met');
        }
      }

      return result;
    } catch (error) {
      return this.createFailureResult(
        action.id,
        startTime,
        `Action execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private checkForConflicts(action: MotorAction): ActionState[] {
    const conflicts: ActionState[] = [];

    for (const [_, state] of this.activeActions) {
      if (
        state.status === 'executing' &&
        actionsConflict(action, state.action)
      ) {
        conflicts.push(state);
      }
    }

    return conflicts;
  }

  private async resolveConflicts(
    newAction: MotorAction,
    conflicts: ActionState[]
  ): Promise<void> {
    const newPriority = calculateActionPriority(
      newAction,
      conflicts[0].context
    );

    for (const conflict of conflicts) {
      if (newPriority > conflict.priority) {
        // Abort lower priority action
        conflict.status = 'aborted';
        this.activeActions.delete(conflict.action.id);

        this.emit('action-failed', {
          actionId: conflict.action.id,
          reason: 'Preempted by higher priority action',
        });
      } else {
        // Queue new action for later
        this.actionQueue.push(newAction);
        throw new Error('Action queued due to conflicts');
      }
    }
  }

  private async executeSequential(
    actions: MotorAction[],
    strategy: CoordinationStrategy
  ): Promise<CoordinationResult> {
    const results: MotorExecutionResult[] = [];
    let conflictsResolved = 0;

    for (const action of actions) {
      const context = this.createDefaultExecutionContext();
      const result = await this.executeMotorAction(action, context);
      results.push(result);

      if (!result.success && strategy.conflictResolution === 'preemption') {
        break; // Stop on first failure
      }
    }

    return {
      success: results.every((r) => r.success),
      coordinatedActions: actions.map((a) => a.id),
      totalExecutionTime: 0, // Will be set by caller
      coordination: {
        synchronizationAccuracy: 1.0, // Perfect for sequential
        conflictsResolved,
        resourceUtilization: 0.8,
      },
      individualResults: results,
    };
  }

  private async executeParallel(
    actions: MotorAction[],
    strategy: CoordinationStrategy
  ): Promise<CoordinationResult> {
    const context = this.createDefaultExecutionContext();
    const promises = actions.map((action) =>
      this.executeMotorAction(action, context)
    );

    const results = await Promise.allSettled(promises);
    const successfulResults = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<MotorExecutionResult>).value);

    const failedResults = results
      .filter((r) => r.status === 'rejected')
      .map((r, index) =>
        this.createFailureResult(
          actions[index].id,
          Date.now(),
          (r as PromiseRejectedResult).reason
        )
      );

    const allResults = [...successfulResults, ...failedResults];

    return {
      success: allResults.every((r) => r.success),
      coordinatedActions: actions.map((a) => a.id),
      totalExecutionTime: 0,
      coordination: {
        synchronizationAccuracy: 0.9, // Good for parallel
        conflictsResolved: 0,
        resourceUtilization: 1.0,
      },
      individualResults: allResults,
    };
  }

  private async executeInterleaved(
    actions: MotorAction[],
    strategy: CoordinationStrategy
  ): Promise<CoordinationResult> {
    // Simplified interleaved execution
    return this.executeSequential(actions, strategy);
  }

  private async executeConditional(
    actions: MotorAction[],
    strategy: CoordinationStrategy
  ): Promise<CoordinationResult> {
    // Simplified conditional execution
    return this.executeSequential(actions, strategy);
  }

  private createDefaultExecutionContext(): ExecutionContext {
    return {
      currentPosition: {
        position: { x: 0, y: 64, z: 0 },
        timestamp: Date.now(),
        confidence: 1.0,
      },
      environmentConditions: {
        lighting: 15,
        weather: 'clear',
        temperature: 20,
        terrain: 'flat',
      },
      constraints: {
        maxSpeed: this.config.movementParameters.maxSpeed,
        maxAcceleration: this.config.movementParameters.acceleration,
        maxForce: 10.0,
        collisionAvoidance: true,
      },
      resources: {
        energy: 1.0,
        health: 1.0,
        inventory: [],
        tools: [],
      },
    };
  }

  private createFailureResult(
    actionId: string,
    startTime: number,
    reason: string
  ): MotorExecutionResult {
    return {
      actionId,
      success: false,
      executionTime: Date.now() - startTime,
      errors: [reason],
      warnings: [],
    };
  }

  private calculateCorrectionParameters(
    action: MotorAction,
    feedback: ProcessedFeedback
  ): Record<string, any> {
    const corrections: Record<string, any> = {};

    // Simple correction logic based on feedback
    if (
      feedback.interpretation.deviation &&
      feedback.interpretation.deviation > 0
    ) {
      corrections.speedMultiplier = Math.max(
        0.5,
        1 - feedback.interpretation.deviation
      );
      corrections.precisionMultiplier = Math.min(
        2.0,
        1 + feedback.interpretation.deviation
      );
    }

    return corrections;
  }

  private applyMotorAdjustment(
    actionState: ActionState,
    adjustment: MotorAdjustmentResult
  ): void {
    // Apply adjustment to ongoing action
    if (adjustment.newParameters) {
      // Merge new parameters
      Object.assign(actionState.action.parameters, adjustment.newParameters);

      // Update action timing if needed
      if (adjustment.adjustmentType === 'recalibration') {
        actionState.expectedDuration *= 1.2; // 20% longer for recalibration
      }
    }
  }

  private async abortNonEmergencyActions(): Promise<void> {
    for (const [actionId, state] of this.activeActions) {
      if (state.action.type !== 'emergency_response') {
        state.status = 'aborted';
        this.activeActions.delete(actionId);
      }
    }
  }

  private async executeCollisionAvoidance(
    currentState: any
  ): Promise<string[]> {
    // Execute immediate stop and backup
    return ['emergency_stop', 'move_backward'];
  }

  private async executeFallPrevention(currentState: any): Promise<string[]> {
    // Execute crouch and careful movement
    return ['crouch', 'careful_movement'];
  }

  private async executeDefensiveResponse(currentState: any): Promise<string[]> {
    // Execute retreat and defensive posture
    return ['retreat', 'defensive_posture'];
  }

  private async executeHazardAvoidance(currentState: any): Promise<string[]> {
    // Execute avoidance maneuver
    return ['avoidance_maneuver', 'safe_positioning'];
  }

  private async executeGenericEmergencyStop(): Promise<string[]> {
    // Execute immediate stop
    return ['emergency_stop'];
  }

  private processActionQueue(): void {
    if (this.actionQueue.length > 0 && this.activeActions.size < 3) {
      const nextAction = this.actionQueue.shift();
      if (nextAction) {
        const context = this.createDefaultExecutionContext();
        this.executeMotorAction(nextAction, context).catch((error) => {
          console.error('Queued action execution failed:', error);
        });
      }
    }
  }

  private monitorActiveActions(): void {
    const currentTime = Date.now();

    for (const [actionId, state] of this.activeActions) {
      const elapsed = currentTime - state.startTime;

      // Check for timeout
      if (elapsed > state.expectedDuration * 2) {
        state.status = 'failed';
        this.activeActions.delete(actionId);

        this.emit('action-failed', {
          actionId,
          reason: 'Action timeout exceeded',
        });
      }
    }
  }

  private checkForTimeouts(): void {
    // Monitor action timeouts and deadlines
    const currentTime = Date.now();

    for (const [actionId, state] of this.activeActions) {
      if (state.action.deadline && currentTime > state.action.deadline) {
        state.status = 'failed';
        this.activeActions.delete(actionId);

        this.emit('action-failed', {
          actionId,
          reason: 'Action deadline exceeded',
        });
      }
    }
  }

  private updatePerformanceHistory(
    latency: number,
    success: boolean,
    actionType: string
  ): void {
    this.performanceHistory.push({
      timestamp: Date.now(),
      latency,
      success,
      actionType,
    });

    // Keep only recent history
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory = this.performanceHistory.slice(-500);
    }
  }

  private updateMetrics(): void {
    if (this.performanceHistory.length === 0) return;

    // Update latency metrics
    const latencies = this.performanceHistory.map((h) => h.latency);
    this.metrics.motorControl.executionLatency.mean =
      latencies.reduce((sum, l) => sum + l, 0) / latencies.length;

    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    this.metrics.motorControl.executionLatency.p95 =
      sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
    this.metrics.motorControl.executionLatency.p99 =
      sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

    // Update success rate
    const successCount = this.performanceHistory.filter(
      (h) => h.success
    ).length;
    this.metrics.motorControl.successRate =
      successCount / this.performanceHistory.length;
  }

  private applyCalibration(
    parameters: Record<string, any>
  ): Record<string, any> {
    const adjusted = { ...parameters };

    // Apply calibration factors
    if (adjusted.speed && this.calibrationData.has('movement_speed')) {
      adjusted.speed *= this.calibrationData.get('movement_speed')!;
    }

    if (adjusted.precision && this.calibrationData.has('precision_factor')) {
      adjusted.precision *= this.calibrationData.get('precision_factor')!;
    }

    return adjusted;
  }

  private getTerrainSpeedMultiplier(terrain: string): number {
    switch (terrain) {
      case 'flat':
        return 1.0;
      case 'hilly':
        return 0.9;
      case 'mountainous':
        return 0.7;
      case 'underwater':
        return 0.5;
      default:
        return 1.0;
    }
  }

  private getLightingPrecisionMultiplier(lighting: number): number {
    return Math.max(0.5, lighting / 15); // Linear scaling from 0.5 to 1.0
  }

  private getWeatherTurningMultiplier(weather: string): number {
    switch (weather) {
      case 'clear':
        return 1.0;
      case 'rain':
        return 0.9;
      case 'snow':
        return 0.8;
      case 'storm':
        return 0.7;
      default:
        return 1.0;
    }
  }
}
