/**
 * Sensorimotor System - Integrated embodied motor control and feedback
 *
 * Main coordination system that integrates motor control, sensory feedback,
 * and predictive learning for responsive embodied intelligence.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { MotorController } from './motor-controller';
import { SensoryFeedbackProcessor } from './sensory-feedback-processor';
import {
  MotorAction,
  ExecutionContext,
  MotorExecutionResult,
  CoordinationResult,
  CoordinationStrategy,
  ProcessedFeedback,
  RawSensoryData,
  EmergencyType,
  SensorimotorConfig,
  SensorimotorMetrics,
  validateSensorimotorConfig,
  validateMotorAction,
  validateExecutionContext,
} from './types';

export interface SensorimotorSystemEvents {
  'action-executed': [MotorExecutionResult];
  'feedback-processed': [ProcessedFeedback];
  'learning-update': [{ component: string; improvement: number }];
  'emergency-response': [{ type: EmergencyType; responseTime: number }];
  'performance-warning': [{ metric: string; value: number; threshold: number }];
  'sensorimotor-loop-completed': [{ actionId: string; loopTime: number }];
}

/**
 * Sensorimotor loop state
 */
interface SensorimotorLoopState {
  actionId: string;
  startTime: number;
  motorResult?: MotorExecutionResult;
  feedbackResult?: ProcessedFeedback;
  loopCompleted: boolean;
  totalLoopTime: number;
}

/**
 * Comprehensive sensorimotor system with closed-loop control
 */
export class SensorimotorSystem extends EventEmitter<SensorimotorSystemEvents> {
  private motorController: MotorController;
  private feedbackProcessor: SensoryFeedbackProcessor;
  private activeLoops = new Map<string, SensorimotorLoopState>();
  private systemMetrics: SensorimotorMetrics;

  constructor(
    private config: SensorimotorConfig,
    private actionExecutor: any // Will be injected with actual implementation
  ) {
    super();

    validateSensorimotorConfig(config);

    // Initialize components
    this.motorController = new MotorController(config, actionExecutor);
    this.feedbackProcessor = new SensoryFeedbackProcessor(config);

    // Initialize metrics
    this.systemMetrics = {
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

    this.setupEventHandlers();
    this.startPerformanceMonitoring();
  }

  /**
   * Execute motor action with full sensorimotor loop
   */
  async executeAction(
    action: MotorAction,
    context: ExecutionContext
  ): Promise<MotorExecutionResult> {
    const startTime = Date.now();

    try {
      validateMotorAction(action);
      validateExecutionContext(context);

      // Initialize sensorimotor loop
      const loopState: SensorimotorLoopState = {
        actionId: action.id,
        startTime,
        loopCompleted: false,
        totalLoopTime: 0,
      };

      this.activeLoops.set(action.id, loopState);

      // Step 1: Execute motor action
      const motorResult = await this.motorController.executeMotorAction(
        action,
        context
      );
      loopState.motorResult = motorResult;

      this.emit('action-executed', motorResult);

      // Step 2: Process sensory feedback (if action expects feedback)
      if (action.feedback && motorResult.success) {
        // Collect sensory feedback
        const rawFeedback = await this.collectSensoryFeedback(
          action.id,
          motorResult
        );

        // Process feedback
        const processedFeedback = this.feedbackProcessor.processFeedback(
          action.id,
          rawFeedback
        );
        loopState.feedbackResult = processedFeedback;

        this.emit('feedback-processed', processedFeedback);

        // Step 3: Apply motor adjustments if needed
        if (processedFeedback.learningSignal?.adjustmentRequired) {
          const adjustment = this.motorController.adjustMotorAction(
            action.id,
            processedFeedback
          );

          if (adjustment.success) {
            this.emit('learning-update', {
              component: 'motor_control',
              improvement: adjustment.adjustmentMagnitude,
            });
          }
        }
      }

      // Complete sensorimotor loop
      loopState.loopCompleted = true;
      loopState.totalLoopTime = Date.now() - startTime;

      this.emit('sensorimotor-loop-completed', {
        actionId: action.id,
        loopTime: loopState.totalLoopTime,
      });

      this.activeLoops.delete(action.id);
      return motorResult;
    } catch (error) {
      // Cleanup failed loop
      this.activeLoops.delete(action.id);

      const errorResult: MotorExecutionResult = {
        actionId: action.id,
        success: false,
        executionTime: Date.now() - startTime,
        errors: [
          `Sensorimotor execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
        warnings: [],
      };

      this.emit('action-executed', errorResult);
      return errorResult;
    }
  }

  /**
   * Execute coordinated action sequence with feedback integration
   */
  async executeCoordinatedSequence(
    actions: MotorAction[],
    strategy: CoordinationStrategy
  ): Promise<CoordinationResult> {
    try {
      // Execute coordination through motor controller
      const coordinationResult =
        await this.motorController.coordinateActionSequence(actions, strategy);

      // Process feedback for coordinated actions if successful
      if (coordinationResult.success && strategy.timing.synchronization) {
        await this.processCoordinatedFeedback(coordinationResult);
      }

      return coordinationResult;
    } catch (error) {
      const errorResult: CoordinationResult = {
        success: false,
        coordinatedActions: actions.map((a) => a.id),
        totalExecutionTime: 0,
        coordination: {
          synchronizationAccuracy: 0,
          conflictsResolved: 0,
          resourceUtilization: 0,
        },
        individualResults: [],
      };

      return errorResult;
    }
  }

  /**
   * Handle emergency response with immediate feedback
   */
  async executeEmergencyResponse(
    emergencyType: EmergencyType,
    currentState: any
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Execute emergency response
      const emergencyResult =
        await this.motorController.executeEmergencyResponse(
          emergencyType,
          currentState
        );

      const responseTime = Date.now() - startTime;

      this.emit('emergency-response', {
        type: emergencyType,
        responseTime,
      });

      // Update safety metrics
      this.systemMetrics.safety.emergencyResponseTime = responseTime;

      if (emergencyResult.success) {
        this.systemMetrics.safety.recoverySuccessRate = Math.min(
          1.0,
          this.systemMetrics.safety.recoverySuccessRate + 0.1
        );
      } else {
        this.systemMetrics.safety.safetyViolations++;
      }
    } catch (error) {
      this.systemMetrics.safety.safetyViolations++;
      console.error('Emergency response failed:', error);
    }
  }

  /**
   * Calibrate sensorimotor system based on environmental conditions
   */
  async calibrateSystem(environmentConditions: any): Promise<void> {
    try {
      // Calibrate motor control
      await this.motorController.calibrateMotorResponses(environmentConditions);

      // Update system metrics based on calibration
      this.updateSystemMetrics();
    } catch (error) {
      console.error('System calibration failed:', error);
    }
  }

  /**
   * Process external sensory feedback
   */
  processSensoryFeedback(
    actionId: string,
    rawData: RawSensoryData
  ): ProcessedFeedback {
    return this.feedbackProcessor.processFeedback(actionId, rawData);
  }

  /**
   * Get current sensorimotor system status
   */
  getSystemStatus(): {
    isActive: boolean;
    activeLoops: number;
    emergencyState: boolean;
    metrics: SensorimotorMetrics;
    componentStatus: {
      motorController: any;
      feedbackProcessor: any;
    };
  } {
    const motorState = this.motorController.getCurrentState();

    return {
      isActive: this.activeLoops.size > 0,
      activeLoops: this.activeLoops.size,
      emergencyState: motorState.emergencyState,
      metrics: { ...this.systemMetrics },
      componentStatus: {
        motorController: motorState,
        feedbackProcessor: this.feedbackProcessor.getProcessingStatistics(),
      },
    };
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): SensorimotorMetrics {
    return { ...this.systemMetrics };
  }

  /**
   * Stop all sensorimotor operations
   */
  stop(): void {
    // Stop motor controller
    this.motorController.stop();

    // Clear active loops
    for (const [actionId, loopState] of this.activeLoops) {
      if (!loopState.loopCompleted) {
        this.emit('sensorimotor-loop-completed', {
          actionId,
          loopTime: Date.now() - loopState.startTime,
        });
      }
    }

    this.activeLoops.clear();

    // Stop event emission
    this.removeAllListeners();
  }

  /**
   * Get detailed system statistics
   */
  getSystemStatistics(): {
    activeLoops: number;
    completedLoops: number;
    averageLoopTime: number;
    emergencyResponses: number;
    learningUpdates: number;
    componentMetrics: {
      motor: any;
      feedback: any;
    };
  } {
    const motorMetrics = this.motorController.getMetrics();
    const feedbackStats = this.feedbackProcessor.getProcessingStatistics();

    return {
      activeLoops: this.activeLoops.size,
      completedLoops: this.getCompletedLoopsCount(),
      averageLoopTime: this.calculateAverageLoopTime(),
      emergencyResponses: this.systemMetrics.safety.safetyViolations,
      learningUpdates: this.getLearningUpdatesCount(),
      componentMetrics: {
        motor: motorMetrics,
        feedback: feedbackStats,
      },
    };
  }

  // ===== PRIVATE METHODS =====

  private setupEventHandlers(): void {
    // Motor controller events
    this.motorController.on('action-completed', (result) => {
      this.updateMotorMetrics(result);
    });

    this.motorController.on('emergency-triggered', ({ type, responseTime }) => {
      this.emit('emergency-response', { type, responseTime });
    });

    this.motorController.on('motor-adjustment', (adjustment) => {
      if (adjustment.success) {
        this.emit('learning-update', {
          component: 'motor_adjustment',
          improvement: adjustment.adjustmentMagnitude,
        });
      }
    });

    // Feedback processor events
    this.feedbackProcessor.on('feedback-processed', (feedback) => {
      this.updateFeedbackMetrics(feedback);
    });

    this.feedbackProcessor.on(
      'learning-signal-generated',
      ({ actionId, learningWeight }) => {
        this.emit('learning-update', {
          component: 'feedback_learning',
          improvement: learningWeight,
        });
      }
    );

    this.feedbackProcessor.on('anomaly-detected', ({ anomaly, severity }) => {
      if (severity > 0.7) {
        this.emit('performance-warning', {
          metric: 'feedback_anomaly',
          value: severity,
          threshold: 0.7,
        });
      }
    });
  }

  private startPerformanceMonitoring(): void {
    // Monitor performance every second
    setInterval(() => {
      this.updateSystemMetrics();
      this.checkPerformanceThresholds();
    }, 1000);

    // Monitor sensorimotor loops for timeouts
    setInterval(() => {
      this.checkLoopTimeouts();
    }, 100);
  }

  private async collectSensoryFeedback(
    actionId: string,
    motorResult: MotorExecutionResult
  ): Promise<RawSensoryData> {
    // Simulate collecting sensory feedback
    // In a real implementation, this would interface with actual sensors
    const feedback: RawSensoryData = {
      timestamp: Date.now(),
      source: 'proprioceptive',
      data: {
        success: motorResult.success,
        executionTime: motorResult.executionTime,
        precision: motorResult.achievedPrecision || 1.0,
        finalPosition: motorResult.finalPosition,
      },
      quality: motorResult.success ? 0.9 : 0.3,
      latency: 10, // 10ms feedback latency
    };

    return feedback;
  }

  private async processCoordinatedFeedback(
    result: CoordinationResult
  ): Promise<void> {
    // Process feedback for each coordinated action
    for (const individualResult of result.individualResults) {
      if (individualResult.success) {
        const rawFeedback = await this.collectSensoryFeedback(
          individualResult.actionId,
          individualResult
        );

        this.feedbackProcessor.processFeedback(
          individualResult.actionId,
          rawFeedback
        );
      }
    }
  }

  private updateMotorMetrics(result: MotorExecutionResult): void {
    // Update motor control metrics
    this.systemMetrics.motorControl.executionLatency.mean =
      this.systemMetrics.motorControl.executionLatency.mean * 0.9 +
      result.executionTime * 0.1;

    if (result.success) {
      this.systemMetrics.motorControl.successRate = Math.min(
        1.0,
        this.systemMetrics.motorControl.successRate + 0.01
      );

      if (result.achievedPrecision) {
        this.systemMetrics.motorControl.precisionAccuracy =
          this.systemMetrics.motorControl.precisionAccuracy * 0.9 +
          result.achievedPrecision * 0.1;
      }
    } else {
      this.systemMetrics.motorControl.successRate = Math.max(
        0.0,
        this.systemMetrics.motorControl.successRate - 0.02
      );
    }
  }

  private updateFeedbackMetrics(feedback: ProcessedFeedback): void {
    // Update feedback processing metrics
    this.systemMetrics.feedback.feedbackLatency =
      this.systemMetrics.feedback.feedbackLatency * 0.9 +
      (Date.now() - feedback.timestamp) * 0.1;

    this.systemMetrics.feedback.predictionAccuracy =
      this.systemMetrics.feedback.predictionAccuracy * 0.9 +
      feedback.confidence * 0.1;

    if (feedback.learningSignal?.adjustmentRequired) {
      this.systemMetrics.feedback.adaptationSpeed = Math.min(
        1.0,
        this.systemMetrics.feedback.adaptationSpeed + 0.05
      );
    }
  }

  private updateSystemMetrics(): void {
    // Get component metrics
    const motorMetrics = this.motorController.getMetrics();
    const feedbackStats = this.feedbackProcessor.getProcessingStatistics();

    // Update coordination metrics
    this.systemMetrics.coordination.resourceUtilization =
      this.activeLoops.size / Math.max(1, this.config.motorControl.maxRetries);

    // Update feedback metrics
    this.systemMetrics.feedback.learningRate =
      this.config.feedbackProcessing.learningRate;

    // Merge component metrics
    this.systemMetrics.motorControl = { ...motorMetrics.motorControl };
    this.systemMetrics.coordination = { ...motorMetrics.coordination };
  }

  private checkPerformanceThresholds(): void {
    const maxLatency = this.config.motorControl.timingTolerance * 2; // Double tolerance as warning

    if (this.systemMetrics.motorControl.executionLatency.mean > maxLatency) {
      this.emit('performance-warning', {
        metric: 'motor_latency',
        value: this.systemMetrics.motorControl.executionLatency.mean,
        threshold: maxLatency,
      });
    }

    if (this.systemMetrics.motorControl.successRate < 0.8) {
      this.emit('performance-warning', {
        metric: 'success_rate',
        value: this.systemMetrics.motorControl.successRate,
        threshold: 0.8,
      });
    }

    if (this.systemMetrics.feedback.predictionAccuracy < 0.6) {
      this.emit('performance-warning', {
        metric: 'prediction_accuracy',
        value: this.systemMetrics.feedback.predictionAccuracy,
        threshold: 0.6,
      });
    }
  }

  private checkLoopTimeouts(): void {
    const currentTime = Date.now();
    const maxLoopTime = 5000; // 5 second maximum loop time

    for (const [actionId, loopState] of this.activeLoops) {
      if (
        !loopState.loopCompleted &&
        currentTime - loopState.startTime > maxLoopTime
      ) {
        // Force complete timed-out loop
        loopState.loopCompleted = true;
        loopState.totalLoopTime = currentTime - loopState.startTime;

        this.emit('sensorimotor-loop-completed', {
          actionId,
          loopTime: loopState.totalLoopTime,
        });

        this.activeLoops.delete(actionId);

        this.emit('performance-warning', {
          metric: 'loop_timeout',
          value: loopState.totalLoopTime,
          threshold: maxLoopTime,
        });
      }
    }
  }

  private getCompletedLoopsCount(): number {
    // This would be tracked in a real implementation
    return 0;
  }

  private calculateAverageLoopTime(): number {
    if (this.activeLoops.size === 0) return 0;

    const currentTime = Date.now();
    let totalTime = 0;

    for (const loopState of this.activeLoops.values()) {
      totalTime += currentTime - loopState.startTime;
    }

    return totalTime / this.activeLoops.size;
  }

  private getLearningUpdatesCount(): number {
    // This would be tracked in a real implementation
    return 0;
  }

  /**
   * Dispose of system resources
   */
  dispose(): void {
    // Clear active loops
    this.activeLoops.clear();

    // Remove all event listeners
    this.removeAllListeners();
  }
}
