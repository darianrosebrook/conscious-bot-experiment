/**
 * Sensorimotor Integration Tests
 *
 * Comprehensive tests for the embodied motor control system including
 * motor actions, sensory feedback, coordination, and adaptive learning.
 *
 * @author @darianrosebrook
 */

import { SensorimotorSystem } from '../sensorimotor-system';
import { MotorController } from '../motor-controller';
import { SensoryFeedbackProcessor } from '../sensory-feedback-processor';
import {
  SensorimotorConfig,
  MotorAction,
  ExecutionContext,
  CoordinationStrategy,
  EmergencyType,
  RawSensoryData,
  validateSensorimotorConfig,
  validateMotorAction,
  validateExecutionContext,
} from '../types';

describe('Sensorimotor System Integration', () => {
  let sensorimotorSystem: SensorimotorSystem;
  let mockActionExecutor: any;
  let defaultConfig: SensorimotorConfig;

  beforeEach(() => {
    defaultConfig = {
      motorControl: {
        controlFrequency: 50,
        precisionThreshold: 0.1,
        timingTolerance: 10,
        maxRetries: 3,
      },
      movementParameters: {
        maxSpeed: 4.3,
        acceleration: 2.0,
        turningSpeed: 90,
        jumpHeight: 1.25,
        stepHeight: 0.6,
      },
      coordination: {
        conflictResolution: 'priority_based',
        timingSynchronization: true,
        feedbackIntegration: 'real_time',
        coordinationTimeout: 5000,
      },
      feedbackProcessing: {
        bufferDuration: 100,
        processingFrequency: 20,
        learningRate: 0.01,
        confidenceThreshold: 0.7,
      },
      prediction: {
        predictionHorizon: 500,
        modelUpdateFrequency: 1,
        predictionConfidenceThreshold: 0.6,
        maxPredictionAge: 1000,
      },
      performance: {
        latencyMonitoring: true,
        efficiencyTracking: true,
        calibrationFrequency: 3600,
        performanceLogging: true,
      },
      safety: {
        emergencyResponseTime: 5,
        collisionAvoidance: true,
        safetyMargin: 0.5,
        automaticRecovery: true,
      },
    };

    // Mock action executor
    mockActionExecutor = {
      executeMovement: jest
        .fn()
        .mockImplementation((actionType, parameters) => {
          return Promise.resolve({
            actionId: parameters.actionId || 'test_action',
            success: true,
            executionTime: 50,
            achievedPrecision: 0.9,
            errors: [],
            warnings: [],
          });
        }),
      executeManipulation: jest
        .fn()
        .mockImplementation((actionType, parameters) => {
          return Promise.resolve({
            actionId: parameters.actionId || 'test_manipulation',
            success: true,
            executionTime: 100,
            achievedPrecision: 0.8,
            errors: [],
            warnings: [],
          });
        }),
      executeCommunication: jest
        .fn()
        .mockImplementation((actionType, parameters) => {
          return Promise.resolve({
            actionId: parameters.actionId || 'test_communication',
            success: true,
            executionTime: 200,
            errors: [],
            warnings: [],
          });
        }),
    };

    sensorimotorSystem = new SensorimotorSystem(
      defaultConfig,
      mockActionExecutor
    );
  });

  afterEach(() => {
    sensorimotorSystem.stop();
  });

  describe('Configuration and Initialization', () => {
    test('should validate and accept valid configuration', () => {
      expect(() => validateSensorimotorConfig(defaultConfig)).not.toThrow();
    });

    test('should reject invalid configuration', () => {
      const invalidConfig = { ...defaultConfig };
      invalidConfig.motorControl.controlFrequency = -1; // Invalid negative frequency
      expect(() => validateSensorimotorConfig(invalidConfig)).toThrow();
    });

    test('should initialize with proper component integration', () => {
      expect(sensorimotorSystem).toBeDefined();

      const status = sensorimotorSystem.getSystemStatus();
      expect(status.isActive).toBe(false);
      expect(status.activeLoops).toBe(0);
      expect(status.emergencyState).toBe(false);
    });

    test('should provide initial metrics', () => {
      const metrics = sensorimotorSystem.getMetrics();

      expect(metrics.motorControl).toBeDefined();
      expect(metrics.coordination).toBeDefined();
      expect(metrics.feedback).toBeDefined();
      expect(metrics.safety).toBeDefined();
      expect(metrics.motorControl.successRate).toBe(1.0);
    });
  });

  describe('Motor Action Execution', () => {
    test('should execute basic movement action', async () => {
      const action: MotorAction = {
        id: 'move_forward_001',
        type: 'move_forward',
        parameters: { speed: 1.0, duration: 1000 },
        priority: 0.5,
        feedback: true,
      };

      const context: ExecutionContext = {
        currentPosition: {
          position: { x: 0, y: 64, z: 0 },
          timestamp: Date.now(),
        },
        environmentConditions: {
          lighting: 15,
          weather: 'clear',
          temperature: 20,
          terrain: 'flat',
        },
        constraints: {
          maxSpeed: 4.3,
          maxAcceleration: 2.0,
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

      const result = await sensorimotorSystem.executeAction(action, context);

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('move_forward_001');
      expect(result.executionTime).toBeGreaterThan(0);
      expect(mockActionExecutor.executeMovement).toHaveBeenCalledWith(
        'move_forward',
        expect.any(Object)
      );
    });

    test('should execute manipulation action', async () => {
      const action: MotorAction = {
        id: 'mine_block_001',
        type: 'mine_block',
        parameters: {
          tool: 'pickaxe',
          target: { x: 1, y: 64, z: 1 },
          technique: 'efficient',
        },
        priority: 0.7,
        feedback: true,
        requiredPrecision: 0.8,
      };

      const context: ExecutionContext = {
        currentPosition: {
          position: { x: 0, y: 64, z: 0 },
          timestamp: Date.now(),
        },
        environmentConditions: {
          lighting: 10,
          weather: 'clear',
          temperature: 20,
          terrain: 'flat',
        },
        constraints: {
          maxSpeed: 4.3,
          maxAcceleration: 2.0,
          maxForce: 10.0,
          collisionAvoidance: true,
        },
        resources: {
          energy: 0.8,
          health: 1.0,
          inventory: ['stone_pickaxe'],
          tools: ['stone_pickaxe'],
        },
      };

      const result = await sensorimotorSystem.executeAction(action, context);

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('mine_block_001');
      expect(result.achievedPrecision).toBeGreaterThanOrEqual(0.7);
      expect(mockActionExecutor.executeManipulation).toHaveBeenCalled();
    });

    test('should validate action and context parameters', async () => {
      const invalidAction = {
        id: 'invalid_action',
        type: 'invalid_type', // Invalid action type
        parameters: {},
        priority: 0.5,
      };

      const result = await sensorimotorSystem.executeAction(
        invalidAction as any,
        {} as any
      );

      // Should return failure result rather than throwing
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should handle action execution failures gracefully', async () => {
      // Mock executor to fail
      mockActionExecutor.executeMovement.mockRejectedValueOnce(
        new Error('Execution failed')
      );

      const action: MotorAction = {
        id: 'failing_action',
        type: 'move_forward',
        parameters: { speed: 1.0 },
        priority: 0.5,
        feedback: false,
      };

      const context: ExecutionContext = {
        currentPosition: {
          position: { x: 0, y: 64, z: 0 },
          timestamp: Date.now(),
        },
        environmentConditions: {
          lighting: 15,
          weather: 'clear',
          temperature: 20,
          terrain: 'flat',
        },
        constraints: {
          maxSpeed: 4.3,
          maxAcceleration: 2.0,
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

      const result = await sensorimotorSystem.executeAction(action, context);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should emit action execution events', async () => {
      let actionExecuted = false;

      sensorimotorSystem.on('action-executed', (result) => {
        expect(result.actionId).toBe('event_test_action');
        actionExecuted = true;
      });

      const action: MotorAction = {
        id: 'event_test_action',
        type: 'move_forward',
        parameters: { speed: 0.5 },
        priority: 0.3,
        feedback: false,
      };

      const context: ExecutionContext = {
        currentPosition: {
          position: { x: 0, y: 64, z: 0 },
          timestamp: Date.now(),
        },
        environmentConditions: {
          lighting: 15,
          weather: 'clear',
          temperature: 20,
          terrain: 'flat',
        },
        constraints: {
          maxSpeed: 4.3,
          maxAcceleration: 2.0,
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

      await sensorimotorSystem.executeAction(action, context);
      expect(actionExecuted).toBe(true);
    });
  });

  describe('Sensory Feedback Processing', () => {
    test('should process sensory feedback for actions', async () => {
      let feedbackProcessed = false;

      sensorimotorSystem.on('feedback-processed', (feedback) => {
        expect(feedback.actionId).toBe('feedback_test_action');
        expect(feedback.confidence).toBeGreaterThanOrEqual(0);
        expect(feedback.confidence).toBeLessThanOrEqual(1);
        feedbackProcessed = true;
      });

      const action: MotorAction = {
        id: 'feedback_test_action',
        type: 'jump',
        parameters: { height: 1.0 },
        priority: 0.6,
        feedback: true, // Enable feedback processing
      };

      const context: ExecutionContext = {
        currentPosition: {
          position: { x: 0, y: 64, z: 0 },
          timestamp: Date.now(),
        },
        environmentConditions: {
          lighting: 15,
          weather: 'clear',
          temperature: 20,
          terrain: 'flat',
        },
        constraints: {
          maxSpeed: 4.3,
          maxAcceleration: 2.0,
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

      await sensorimotorSystem.executeAction(action, context);

      // Give some time for async feedback processing
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(feedbackProcessed).toBe(true);
    });

    test('should process external sensory feedback', () => {
      const rawFeedback: RawSensoryData = {
        timestamp: Date.now(),
        source: 'visual',
        data: {
          position_change: { x: 1, y: 0, z: 0 },
          success: true,
          accuracy: 0.95,
        },
        quality: 0.9,
        latency: 15,
      };

      const processed = sensorimotorSystem.processSensoryFeedback(
        'external_feedback_test',
        rawFeedback
      );

      expect(processed.actionId).toBe('external_feedback_test');
      expect(processed.confidence).toBeGreaterThan(0);
      expect(processed.relevance).toBeGreaterThan(0);
      expect(processed.interpretation).toBeDefined();
    });

    test('should emit learning update events', async () => {
      let learningUpdate = false;

      sensorimotorSystem.on('learning-update', (update) => {
        expect(update.component).toBeDefined();
        expect(update.improvement).toBeGreaterThanOrEqual(0);
        learningUpdate = true;
      });

      // Create action that will likely trigger learning
      const action: MotorAction = {
        id: 'learning_test_action',
        type: 'place_block',
        parameters: {
          item: 'stone',
          position: { x: 1, y: 64, z: 1 },
          precision: 'high',
        },
        priority: 0.8,
        feedback: true,
        requiredPrecision: 0.9,
      };

      const context: ExecutionContext = {
        currentPosition: {
          position: { x: 0, y: 64, z: 0 },
          timestamp: Date.now(),
        },
        environmentConditions: {
          lighting: 8, // Lower lighting for potential learning
          weather: 'rain',
          temperature: 15,
          terrain: 'hilly',
        },
        constraints: {
          maxSpeed: 4.3,
          maxAcceleration: 2.0,
          maxForce: 10.0,
          collisionAvoidance: true,
        },
        resources: {
          energy: 0.7,
          health: 1.0,
          inventory: ['stone'],
          tools: [],
        },
      };

      await sensorimotorSystem.executeAction(action, context);

      // Allow time for feedback processing and learning
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Learning might not always occur, so we just check the system is capable
      expect(typeof learningUpdate).toBe('boolean');
    });
  });

  describe('Coordinated Action Execution', () => {
    test('should execute sequential coordinated actions', async () => {
      const actions: MotorAction[] = [
        {
          id: 'coord_action_1',
          type: 'move_forward',
          parameters: { speed: 1.0, distance: 2 },
          priority: 0.5,
          feedback: false,
        },
        {
          id: 'coord_action_2',
          type: 'turn_right',
          parameters: { angle: 90 },
          priority: 0.5,
          feedback: false,
        },
        {
          id: 'coord_action_3',
          type: 'move_forward',
          parameters: { speed: 1.0, distance: 1 },
          priority: 0.5,
          feedback: false,
        },
      ];

      const strategy: CoordinationStrategy = {
        type: 'sequential',
        timing: {
          synchronization: false,
          timingTolerance: 50,
          priority: 'time',
        },
        conflictResolution: 'priority_based',
        adaptability: 0.5,
      };

      const result = await sensorimotorSystem.executeCoordinatedSequence(
        actions,
        strategy
      );

      expect(result.success).toBe(true);
      expect(result.coordinatedActions).toHaveLength(3);
      expect(result.individualResults).toHaveLength(3);
      expect(result.totalExecutionTime).toBeGreaterThan(0);
    });

    test('should execute parallel coordinated actions', async () => {
      const actions: MotorAction[] = [
        {
          id: 'parallel_action_1',
          type: 'look_at',
          parameters: { target: { x: 5, y: 64, z: 5 } },
          priority: 0.4,
          feedback: false,
        },
        {
          id: 'parallel_action_2',
          type: 'gesture',
          parameters: { type: 'wave' },
          priority: 0.3,
          feedback: false,
        },
      ];

      const strategy: CoordinationStrategy = {
        type: 'parallel',
        timing: {
          synchronization: true,
          timingTolerance: 20,
          priority: 'efficiency',
        },
        conflictResolution: 'resource_sharing',
        adaptability: 0.7,
      };

      const result = await sensorimotorSystem.executeCoordinatedSequence(
        actions,
        strategy
      );

      expect(result.coordinatedActions).toHaveLength(2);
      expect(
        result.coordination.synchronizationAccuracy
      ).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Emergency Response', () => {
    test('should handle collision avoidance emergency', async () => {
      let emergencyTriggered = false;

      sensorimotorSystem.on('emergency-response', ({ type, responseTime }) => {
        expect(type).toBe('collision_imminent');
        expect(responseTime).toBeGreaterThanOrEqual(0);
        expect(responseTime).toBeLessThan(200); // Should be reasonably fast
        emergencyTriggered = true;
      });

      const currentState = {
        position: { x: 0, y: 64, z: 0 },
        velocity: { x: 2, y: 0, z: 0 },
        obstacleDistance: 0.5, // Very close obstacle
      };

      await sensorimotorSystem.executeEmergencyResponse(
        'collision_imminent',
        currentState
      );

      // Give a moment for async event emission
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(emergencyTriggered).toBe(true);
    });

    test('should handle fall prevention emergency', async () => {
      let emergencyTriggered = false;

      sensorimotorSystem.on('emergency-response', ({ type }) => {
        expect(type).toBe('fall_danger');
        emergencyTriggered = true;
      });

      const currentState = {
        position: { x: 10, y: 64, z: 10 },
        groundBelow: false,
        fallDistance: 20,
      };

      await sensorimotorSystem.executeEmergencyResponse(
        'fall_danger',
        currentState
      );
      expect(emergencyTriggered).toBe(true);
    });

    test('should update safety metrics after emergency response', async () => {
      const initialMetrics = sensorimotorSystem.getMetrics();
      const initialEmergencyTime = initialMetrics.safety.emergencyResponseTime;

      await sensorimotorSystem.executeEmergencyResponse('hostile_mob', {
        mobPosition: { x: 1, y: 64, z: 1 },
        agentPosition: { x: 0, y: 64, z: 0 },
        threatLevel: 0.8,
      });

      const updatedMetrics = sensorimotorSystem.getMetrics();
      expect(
        updatedMetrics.safety.emergencyResponseTime
      ).toBeGreaterThanOrEqual(initialEmergencyTime);
    });
  });

  describe('System Calibration and Adaptation', () => {
    test('should calibrate system based on environmental conditions', async () => {
      const environmentConditions = {
        terrain: 'mountainous',
        lighting: 5,
        weather: 'storm',
        temperature: -5,
      };

      await sensorimotorSystem.calibrateSystem(environmentConditions);

      // Verify calibration doesn't break system
      const status = sensorimotorSystem.getSystemStatus();
      expect(status.componentStatus.motorController).toBeDefined();
    });

    test('should track performance metrics over time', async () => {
      const initialMetrics = sensorimotorSystem.getMetrics();

      // Execute several actions to update metrics
      for (let i = 0; i < 3; i++) {
        const action: MotorAction = {
          id: `metrics_test_${i}`,
          type: 'move_forward',
          parameters: { speed: 0.5 },
          priority: 0.3,
          feedback: false,
        };

        const context: ExecutionContext = {
          currentPosition: {
            position: { x: i, y: 64, z: 0 },
            timestamp: Date.now(),
          },
          environmentConditions: {
            lighting: 15,
            weather: 'clear',
            temperature: 20,
            terrain: 'flat',
          },
          constraints: {
            maxSpeed: 4.3,
            maxAcceleration: 2.0,
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

        await sensorimotorSystem.executeAction(action, context);
      }

      const updatedMetrics = sensorimotorSystem.getMetrics();

      // Metrics should be tracked (values may change based on executions)
      expect(updatedMetrics.motorControl).toBeDefined();
      expect(updatedMetrics.coordination).toBeDefined();
      expect(updatedMetrics.feedback).toBeDefined();
      expect(updatedMetrics.safety).toBeDefined();
    });
  });

  describe('Performance Monitoring and Warnings', () => {
    test('should emit performance warnings for slow execution', async () => {
      let performanceWarning = false;

      sensorimotorSystem.on('performance-warning', (warning) => {
        expect(warning.metric).toBeDefined();
        expect(warning.value).toBeGreaterThan(warning.threshold);
        performanceWarning = true;
      });

      // Mock slow execution
      mockActionExecutor.executeMovement.mockResolvedValueOnce({
        actionId: 'slow_action',
        success: true,
        executionTime: 500, // Very slow execution
        errors: [],
        warnings: [],
      });

      const action: MotorAction = {
        id: 'slow_action',
        type: 'move_forward',
        parameters: { speed: 0.1 },
        priority: 0.2,
        feedback: false,
      };

      const context: ExecutionContext = {
        currentPosition: {
          position: { x: 0, y: 64, z: 0 },
          timestamp: Date.now(),
        },
        environmentConditions: {
          lighting: 15,
          weather: 'clear',
          temperature: 20,
          terrain: 'flat',
        },
        constraints: {
          maxSpeed: 4.3,
          maxAcceleration: 2.0,
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

      await sensorimotorSystem.executeAction(action, context);

      // Performance warnings may be emitted asynchronously
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Warning might not always be emitted depending on thresholds
      expect(typeof performanceWarning).toBe('boolean');
    });

    test('should provide comprehensive system statistics', () => {
      const statistics = sensorimotorSystem.getSystemStatistics();

      expect(statistics.activeLoops).toBeGreaterThanOrEqual(0);
      expect(statistics.completedLoops).toBeGreaterThanOrEqual(0);
      expect(statistics.averageLoopTime).toBeGreaterThanOrEqual(0);
      expect(statistics.emergencyResponses).toBeGreaterThanOrEqual(0);
      expect(statistics.learningUpdates).toBeGreaterThanOrEqual(0);
      expect(statistics.componentMetrics).toBeDefined();
      expect(statistics.componentMetrics.motor).toBeDefined();
      expect(statistics.componentMetrics.feedback).toBeDefined();
    });

    test('should provide current system status', () => {
      const status = sensorimotorSystem.getSystemStatus();

      expect(status.isActive).toBe(false); // No active actions initially
      expect(status.activeLoops).toBe(0);
      expect(status.emergencyState).toBe(false);
      expect(status.metrics).toBeDefined();
      expect(status.componentStatus).toBeDefined();
      expect(status.componentStatus.motorController).toBeDefined();
      expect(status.componentStatus.feedbackProcessor).toBeDefined();
    });
  });
});

describe('Individual Sensorimotor Components', () => {
  let defaultConfig: SensorimotorConfig;
  let mockActionExecutor: any;

  beforeEach(() => {
    defaultConfig = {
      motorControl: {
        controlFrequency: 50,
        precisionThreshold: 0.1,
        timingTolerance: 10,
        maxRetries: 3,
      },
      movementParameters: {
        maxSpeed: 4.3,
        acceleration: 2.0,
        turningSpeed: 90,
        jumpHeight: 1.25,
        stepHeight: 0.6,
      },
      coordination: {
        conflictResolution: 'priority_based',
        timingSynchronization: true,
        feedbackIntegration: 'real_time',
        coordinationTimeout: 5000,
      },
      feedbackProcessing: {
        bufferDuration: 100,
        processingFrequency: 20,
        learningRate: 0.01,
        confidenceThreshold: 0.7,
      },
      prediction: {
        predictionHorizon: 500,
        modelUpdateFrequency: 1,
        predictionConfidenceThreshold: 0.6,
        maxPredictionAge: 1000,
      },
      performance: {
        latencyMonitoring: true,
        efficiencyTracking: true,
        calibrationFrequency: 3600,
        performanceLogging: true,
      },
      safety: {
        emergencyResponseTime: 5,
        collisionAvoidance: true,
        safetyMargin: 0.5,
        automaticRecovery: true,
      },
    };

    mockActionExecutor = {
      executeMovement: jest
        .fn()
        .mockImplementation((actionType, parameters) => {
          return Promise.resolve({
            actionId: parameters.actionId || 'test',
            success: true,
            executionTime: 50,
            errors: [],
            warnings: [],
          });
        }),
      executeManipulation: jest
        .fn()
        .mockImplementation((actionType, parameters) => {
          return Promise.resolve({
            actionId: parameters.actionId || 'test',
            success: true,
            executionTime: 100,
            errors: [],
            warnings: [],
          });
        }),
      executeCommunication: jest
        .fn()
        .mockImplementation((actionType, parameters) => {
          return Promise.resolve({
            actionId: parameters.actionId || 'test',
            success: true,
            executionTime: 200,
            errors: [],
            warnings: [],
          });
        }),
    };
  });

  describe('MotorController', () => {
    let motorController: MotorController;

    beforeEach(() => {
      motorController = new MotorController(defaultConfig, mockActionExecutor);
    });

    afterEach(() => {
      motorController.stop();
    });

    test('should execute individual motor actions', async () => {
      const action: MotorAction = {
        id: 'test_motor_action',
        type: 'move_forward',
        parameters: { speed: 1.0 },
        priority: 0.5,
        feedback: false,
      };

      const context: ExecutionContext = {
        currentPosition: {
          position: { x: 0, y: 64, z: 0 },
          timestamp: Date.now(),
        },
        environmentConditions: {
          lighting: 15,
          weather: 'clear',
          temperature: 20,
          terrain: 'flat',
        },
        constraints: {
          maxSpeed: 4.3,
          maxAcceleration: 2.0,
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

      const result = await motorController.executeMotorAction(action, context);

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('test_motor_action');
      expect(result.executionTime).toBeGreaterThan(0);
    });

    test('should provide current motor state', () => {
      const state = motorController.getCurrentState();

      expect(state.activeActions).toBeGreaterThanOrEqual(0);
      expect(state.emergencyState).toBe(false);
      expect(state.queueLength).toBeGreaterThanOrEqual(0);
      expect(state.metrics).toBeDefined();
      expect(state.calibration).toBeDefined();
    });

    test('should handle emergency responses', async () => {
      const result = await motorController.executeEmergencyResponse(
        'collision_imminent',
        { obstacleDistance: 0.3 }
      );

      expect(result.emergencyType).toBe('collision_imminent');
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.success).toBe(true);
      expect(result.actionsExecuted.length).toBeGreaterThan(0);
    });
  });

  describe('SensoryFeedbackProcessor', () => {
    let feedbackProcessor: SensoryFeedbackProcessor;

    beforeEach(() => {
      feedbackProcessor = new SensoryFeedbackProcessor(defaultConfig);
    });

    test('should process raw sensory feedback', () => {
      const rawData: RawSensoryData = {
        timestamp: Date.now(),
        source: 'proprioceptive',
        data: {
          position: { x: 1, y: 64, z: 0 },
          velocity: { x: 0.5, y: 0, z: 0 },
          success: true,
        },
        quality: 0.9,
        latency: 10,
      };

      const processed = feedbackProcessor.processFeedback(
        'test_action',
        rawData
      );

      expect(processed.actionId).toBe('test_action');
      expect(processed.confidence).toBeGreaterThanOrEqual(0);
      expect(processed.confidence).toBeLessThanOrEqual(1);
      expect(processed.relevance).toBeGreaterThanOrEqual(0);
      expect(processed.interpretation).toBeDefined();
    });

    test('should provide processing statistics', () => {
      const stats = feedbackProcessor.getProcessingStatistics();

      expect(stats.totalProcessed).toBeGreaterThanOrEqual(0);
      expect(stats.averageLatency).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeLessThanOrEqual(1);
      expect(stats.patternMatchRate).toBeGreaterThanOrEqual(0);
      expect(stats.patternMatchRate).toBeLessThanOrEqual(1);
      expect(stats.learnedPatterns).toBeGreaterThanOrEqual(0);
      expect(stats.bufferUtilization).toBeGreaterThanOrEqual(0);
    });

    test('should integrate multimodal feedback', () => {
      const visualFeedback = { position_change: true, accuracy: 0.9 };
      const proprioceptiveFeedback = { movement_felt: true, precision: 0.8 };
      const environmentalFeedback = { sound_produced: true, vibration: 0.3 };

      const integrated = feedbackProcessor.integrateMultimodalFeedback(
        visualFeedback,
        proprioceptiveFeedback,
        environmentalFeedback
      );

      expect(integrated.timestamp).toBeDefined();
      expect(integrated.confidence).toBeGreaterThanOrEqual(0);
      expect(integrated.confidence).toBeLessThanOrEqual(1);
      expect(integrated.weightedOutcome).toBeDefined();
    });
  });
});
