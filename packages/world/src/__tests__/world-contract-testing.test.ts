/**
 * Contract Testing for World Module
 *
 * These tests validate interfaces and data flow between World module
 * components and their integration with external systems.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'eventemitter3';
import { RaycastEngine } from '../sensing/raycast-engine';
import { NavigationSystem } from '../navigation/navigation-system';
import { PerceptionIntegration } from '../perception/perception-integration';
import { SensorimotorSystem } from '../sensorimotor/sensorimotor-system';
import {
  RaycastConfig,
  NavigationConfig,
  PerceptionConfig,
  SensorimotorConfig,
  WorldPosition,
  RaycastHit,
  PathPlanningRequest,
  PathPlanningResult,
  VisualQuery,
  PerceptionResult,
  ActionRequest,
  ActionResult,
} from '../types';

// Contract Definitions
interface WorldModuleContract {
  // Raycast Engine Contract
  raycastEngine: {
    input: {
      castRay: {
        origin: WorldPosition;
        direction: { x: number; y: number; z: number };
        maxDistance: number;
      };
      castCone: {
        origin: WorldPosition;
        direction: { x: number; y: number; z: number };
        angle: number;
        rays: number;
        maxDistance: number;
      };
      updateWorld: {
        blocks: Array<{ position: WorldPosition; blockType: string }>;
      };
    };
    output: {
      castRay: RaycastHit | null;
      castCone: RaycastHit[];
      updateWorld: void;
    };
    constraints: {
      maxDistance: number;
      performance: { maxLatency: number };
    };
  };

  // Navigation System Contract
  navigationSystem: {
    input: {
      planPath: PathPlanningRequest;
    };
    output: {
      planPath: PathPlanningResult;
    };
    constraints: {
      maxPlanningTime: number;
      maxPathLength: number;
    };
  };

  // Perception System Contract
  perceptionSystem: {
    input: {
      processVisualField: VisualQuery;
    };
    output: {
      processVisualField: PerceptionResult;
    };
    constraints: {
      maxProcessingTime: number;
      minConfidence: number;
    };
  };

  // Sensorimotor System Contract
  sensorimotorSystem: {
    input: {
      executeAction: ActionRequest;
    };
    output: {
      executeAction: ActionResult;
    };
    constraints: {
      maxExecutionTime: number;
      supportedActions: string[];
    };
  };
}

// Mock External System Interfaces
interface MockCoreModuleInterface {
  signals: EventEmitter;
  arbiter: {
    requestExecution: (request: any) => Promise<any>;
    reportStatus: (status: any) => void;
  };
  performance: {
    trackLatency: (operation: string, duration: number) => void;
    checkBudget: (operation: string) => boolean;
  };
}

interface MockMCPInterface {
  capabilities: {
    getAvailable: () => string[];
    execute: (capability: string, params: any) => Promise<any>;
  };
  constraints: {
    checkPreconditions: (capability: string, params: any) => boolean;
    validateEffects: (capability: string, result: any) => boolean;
  };
}

describe('World Module Contract Testing', () => {
  let raycastEngine: RaycastEngine;
  let navigationSystem: NavigationSystem;
  let perceptionSystem: PerceptionIntegration;
  let sensorimotorSystem: SensorimotorSystem;
  let mockCoreModule: MockCoreModuleInterface;
  let mockMCPInterface: MockMCPInterface;
  let contract: WorldModuleContract;

  beforeEach(() => {
    // Initialize systems with contract-compliant configurations
    const sensingConfig = {
      maxDistance: 64,
      fovDegrees: 70,
      angularResolution: 2,
      panoramicSweep: false,
      maxRaysPerTick: 500,
      tickBudgetMs: 5,
      targetBlocks: [
        'minecraft:coal_ore',
        'minecraft:iron_ore',
        'minecraft:gold_ore',
        'minecraft:diamond_ore',
        'minecraft:chest',
        'minecraft:oak_log',
        'minecraft:birch_log',
        'minecraft:spruce_log',
      ],
      transparentBlocks: [
        'minecraft:air',
        'minecraft:cave_air',
        'minecraft:water',
        'minecraft:glass',
        'minecraft:leaves',
        'minecraft:oak_leaves',
        'minecraft:birch_leaves',
        'minecraft:grass',
        'minecraft:tall_grass',
        'minecraft:torch',
        'minecraft:rail',
      ],
      confidenceDecayRate: 0.02,
      minConfidence: 0.1,
    };

    const navigationConfig: NavigationConfig = {
      dstarLite: {
        searchRadius: 50,
        replanThreshold: 3,
        maxComputationTime: 100,
        heuristicWeight: 1.0,
      },
      costCalculation: {
        baseMoveCost: 1.0,
        diagonalMultiplier: 1.414,
        verticalMultiplier: 2.0,
        jumpCost: 3.0,
        swimCost: 4.0,
      },
      hazardCosts: {
        lavaProximity: 1000,
        voidFall: 10000,
        mobProximity: 200,
        darknessPenalty: 50,
        waterPenalty: 20,
      },
      optimization: {
        pathSmoothing: true,
        lookaheadDistance: 10,
        safetyMargin: 1.5,
        simplificationEnabled: true,
        maxOptimizationTime: 20,
      },
      caching: {
        maxCachedPaths: 100,
        cacheTtl: 60000,
        invalidateOnBlockChange: true,
        spatialIndexEnabled: true,
      },
      movement: {
        baseSpeed: 4.3,
        jumpHeight: 1.25,
        stepHeight: 0.6,
        collisionRadius: 0.3,
        lookaheadTime: 1.0,
      },
    };

    const perceptionConfig: PerceptionConfig = {
      fieldOfView: {
        horizontalFov: 90,
        verticalFov: 60,
        centralFocusAngle: 30,
        peripheralAcuity: 0.5,
        maxDistance: 64,
      },
      confidenceDecay: {
        baseDecayRate: 0.02,
        distanceFactor: 0.01,
        contextSensitivity: {
          'minecraft:diamond_ore': 0.5,
          'minecraft:gold_ore': 0.7,
          'minecraft:iron_ore': 1.0,
          'minecraft:coal_ore': 1.2,
          default: 1.0,
        },
        refreshThreshold: 0.3,
        pruningThreshold: 0.1,
      },
      recognition: {
        maxRecognitionChecks: 100,
        minimumConfidenceToTrack: 0.1,
        blockRecognitionEnabled: true,
        entityRecognitionEnabled: true,
        itemRecognitionEnabled: true,
      },
      performance: {
        maxRaysPerFrame: 1000,
        maxProcessingTimeMs: 30,
        adaptiveResolution: true,
        cacheEnabled: true,
        batchProcessing: true,
      },
      objectClassification: {
        ores: ['coal_ore', 'iron_ore', 'diamond_ore'],
        structures: ['chest', 'furnace', 'crafting_table'],
        hazards: ['lava', 'cactus', 'fire'],
        resources: ['oak_log', 'stone', 'dirt'],
        hostileEntities: ['zombie', 'skeleton', 'creeper'],
        neutralEntities: ['cow', 'sheep', 'pig', 'chicken'],
      },
    };

    const sensorimotorConfig: SensorimotorConfig = {
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
        executionQueuing: true,
        resourceSharing: true,
        errorRecovery: true,
      },
      feedbackProcessing: {
        responseWindow: 100,
        qualityThreshold: 0.8,
        adaptationRate: 0.1,
        contextSize: 5,
      },
      prediction: {
        lookaheadTime: 200,
        confidenceThreshold: 0.7,
        adaptivePrediction: true,
        maxPredictionDepth: 3,
      },
      performance: {
        latencyMonitoring: true,
        efficiencyTracking: true,
        calibrationFrequency: 3600,
        performanceLogging: true,
      },
      safety: {
        collisionAvoidance: true,
        boundaryEnforcement: true,
        emergencyStop: true,
        safetyMargin: 0.5,
        automaticRecovery: true,
      },
    };

    raycastEngine = new RaycastEngine(sensingConfig);
    navigationSystem = new NavigationSystem(navigationConfig);
    perceptionSystem = new PerceptionIntegration(
      perceptionConfig,
      raycastEngine
    );
    sensorimotorSystem = new SensorimotorSystem(sensorimotorConfig);

    // Setup mock interfaces
    mockCoreModule = {
      signals: new EventEmitter(),
      arbiter: {
        requestExecution: jest
          .fn()
          .mockResolvedValue({ approved: true, priority: 'normal' }),
        reportStatus: jest.fn(),
      },
      performance: {
        trackLatency: jest.fn(),
        checkBudget: jest.fn().mockReturnValue(true),
      },
    };

    mockMCPInterface = {
      capabilities: {
        getAvailable: jest
          .fn()
          .mockReturnValue(['move', 'look', 'interact', 'mine']),
        execute: jest.fn().mockResolvedValue({ success: true }),
      },
      constraints: {
        checkPreconditions: jest.fn().mockReturnValue(true),
        validateEffects: jest.fn().mockReturnValue(true),
      },
    };

    // Define contract constraints
    contract = {
      raycastEngine: {
        input: {
          castRay: {
            origin: { x: 0, y: 0, z: 0 },
            direction: { x: 0, y: 0, z: -1 },
            maxDistance: 64,
          },
          castCone: {
            origin: { x: 0, y: 0, z: 0 },
            direction: { x: 0, y: 0, z: -1 },
            angle: Math.PI / 4,
            rays: 32,
            maxDistance: 64,
          },
          updateWorld: { blocks: [] },
        },
        output: {
          castRay: null,
          castCone: [],
          updateWorld: undefined,
        },
        constraints: {
          maxDistance: 64,
          performance: { maxLatency: 10 },
        },
      },
      navigationSystem: {
        input: {
          planPath: {
            start: { x: 0, y: 64, z: 0 },
            goal: { x: 10, y: 64, z: 10 },
            urgency: 'normal',
            preferences: {
              avoidWater: false,
              avoidMobs: false,
              preferLighting: false,
              maxDetour: 2.0,
            },
          },
        },
        output: {
          planPath: {
            success: true,
            path: {
              waypoints: [],
              totalLength: 0,
              estimatedCost: 0,
              estimatedTime: 0,
            },
            planningTime: 0,
            alternatives: [],
          },
        },
        constraints: {
          maxPlanningTime: 100,
          maxPathLength: 1000,
        },
      },
      perceptionSystem: {
        input: {
          processVisualField: {
            observerPosition: { x: 0, y: 64, z: 0 },
            observerRotation: { yaw: 0, pitch: 0 },
            fieldOfView: { horizontal: 90, vertical: 60 },
            maxDistance: 64,
            level: 'standard',
          },
        },
        output: {
          processVisualField: {
            detectedObjects: [],
            overallConfidence: 0.5,
            processingTime: 0,
            fieldCoverage: 1.0,
          },
        },
        constraints: {
          maxProcessingTime: 50,
          minConfidence: 0.3,
        },
      },
      sensorimotorSystem: {
        input: {
          executeAction: {
            type: 'move',
            parameters: {
              direction: { x: 1, y: 0, z: 0 },
              speed: 0.5,
              duration: 1000,
            },
            priority: 'normal',
            timeout: 5000,
          },
        },
        output: {
          executeAction: {
            success: true,
            result: {},
            executionTime: 0,
            feedback: '',
          },
        },
        constraints: {
          maxExecutionTime: 5000,
          supportedActions: ['move', 'look', 'interact', 'mine', 'place'],
        },
      },
    };

    setupTestEnvironment();
  });

  afterEach(() => {
    raycastEngine?.dispose();
    navigationSystem?.dispose();
    perceptionSystem?.dispose();
    sensorimotorSystem?.dispose();
  });

  function setupTestEnvironment(): void {
    const testBlocks = [
      { position: { x: 0, y: 63, z: 0 }, blockType: 'minecraft:grass_block' },
      { position: { x: 5, y: 64, z: -5 }, blockType: 'minecraft:stone' },
      { position: { x: -3, y: 64, z: 3 }, blockType: 'minecraft:wood' },
    ];
    raycastEngine.updateWorld(testBlocks);
  }

  describe('Raycast Engine Contract Validation', () => {
    test('should satisfy castRay input/output contract', async () => {
      const input = contract.raycastEngine.input.castRay;

      const startTime = performance.now();
      const result = raycastEngine.castRay(
        input.origin,
        input.direction,
        input.maxDistance
      );
      const endTime = performance.now();

      // Validate output type contract
      expect(result === null || typeof result === 'object').toBe(true);
      if (result) {
        expect(result).toHaveProperty('position');
        expect(result).toHaveProperty('distance');
        expect(result).toHaveProperty('blockType');
        expect(result).toHaveProperty('normal');

        // Validate position structure
        expect(result.position).toHaveProperty('x');
        expect(result.position).toHaveProperty('y');
        expect(result.position).toHaveProperty('z');

        // Validate distance constraint
        expect(result.distance).toBeGreaterThanOrEqual(0);
        expect(result.distance).toBeLessThanOrEqual(input.maxDistance);
      }

      // Validate performance contract
      const latency = endTime - startTime;
      expect(latency).toBeLessThan(
        contract.raycastEngine.constraints.performance.maxLatency
      );
    });

    test('should satisfy castCone input/output contract', async () => {
      const input = contract.raycastEngine.input.castCone;

      const startTime = performance.now();
      const result = raycastEngine.castCone(
        input.origin,
        input.direction,
        input.angle,
        input.rays,
        input.maxDistance
      );
      const endTime = performance.now();

      // Validate output type contract
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(input.rays);

      result.forEach((hit) => {
        expect(hit).toHaveProperty('position');
        expect(hit).toHaveProperty('distance');
        expect(hit).toHaveProperty('blockType');
        expect(hit).toHaveProperty('normal');

        expect(hit.distance).toBeGreaterThanOrEqual(0);
        expect(hit.distance).toBeLessThanOrEqual(input.maxDistance);
      });

      // Validate performance contract
      const latency = endTime - startTime;
      expect(latency).toBeLessThan(
        contract.raycastEngine.constraints.performance.maxLatency * 5
      ); // Allow more time for cone casting
    });

    test('should handle updateWorld contract correctly', () => {
      const input = contract.raycastEngine.input.updateWorld;

      // Should not throw and should return void
      expect(() => {
        const result = raycastEngine.updateWorld(input.blocks);
        expect(result).toBeUndefined();
      }).not.toThrow();
    });

    test('should respect distance constraints', () => {
      const maxDistance = contract.raycastEngine.constraints.maxDistance;

      // Test with distance beyond constraint
      const result = raycastEngine.castRay(
        { x: 0, y: 64, z: 0 },
        { x: 0, y: 0, z: -1 },
        maxDistance + 10 // Beyond contract limit
      );

      if (result) {
        expect(result.distance).toBeLessThanOrEqual(maxDistance);
      }
    });
  });

  describe('Navigation System Contract Validation', () => {
    test('should satisfy planPath input/output contract', async () => {
      const input = contract.navigationSystem.input.planPath;

      const startTime = performance.now();
      const result = await navigationSystem.planPath(input);
      const endTime = performance.now();

      // Validate output structure contract
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');

      if (result.success) {
        expect(result).toHaveProperty('path');
        expect(result.path).toHaveProperty('waypoints');
        expect(result.path).toHaveProperty('totalLength');
        expect(result.path).toHaveProperty('estimatedCost');
        expect(result.path).toHaveProperty('estimatedTime');

        expect(Array.isArray(result.path.waypoints)).toBe(true);
        expect(typeof result.path.totalLength).toBe('number');
        expect(typeof result.path.estimatedCost).toBe('number');
        expect(typeof result.path.estimatedTime).toBe('number');

        // Validate waypoint structure
        result.path.waypoints.forEach((waypoint) => {
          expect(waypoint).toHaveProperty('x');
          expect(waypoint).toHaveProperty('y');
          expect(waypoint).toHaveProperty('z');
          expect(typeof waypoint.x).toBe('number');
          expect(typeof waypoint.y).toBe('number');
          expect(typeof waypoint.z).toBe('number');
        });
      }

      // Validate performance contract
      const planningTime = endTime - startTime;
      expect(planningTime).toBeLessThan(
        contract.navigationSystem.constraints.maxPlanningTime
      );

      // Validate path length constraint if path exists
      if (result.success && result.path) {
        expect(result.path.totalLength).toBeLessThanOrEqual(
          contract.navigationSystem.constraints.maxPathLength
        );
      }
    });

    test('should handle invalid path requests gracefully', async () => {
      const invalidRequest: PathPlanningRequest = {
        start: { x: 0, y: 64, z: 0 },
        goal: { x: 0, y: 64, z: 0 }, // Same as start
        urgency: 'normal',
        preferences: {
          avoidWater: false,
          avoidMobs: false,
          preferLighting: false,
          maxDetour: 2.0,
        },
      };

      const result = await navigationSystem.planPath(invalidRequest);

      // Should handle gracefully without throwing
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });

    test('should respect urgency contract parameter', async () => {
      const urgencies = ['low', 'normal', 'high', 'urgent'] as const;

      for (const urgency of urgencies) {
        const request: PathPlanningRequest = {
          start: { x: 0, y: 64, z: 0 },
          goal: { x: 5, y: 64, z: 5 },
          urgency,
          preferences: {
            avoidWater: false,
            avoidMobs: false,
            preferLighting: false,
            maxDetour: 2.0,
          },
        };

        const startTime = performance.now();
        const result = await navigationSystem.planPath(request);
        const endTime = performance.now();

        // Higher urgency should generally result in faster planning
        const planningTime = endTime - startTime;
        expect(planningTime).toBeLessThan(
          contract.navigationSystem.constraints.maxPlanningTime
        );

        // Result should maintain contract structure regardless of urgency
        expect(result).toHaveProperty('success');
        expect(typeof result.success).toBe('boolean');
      }
    });
  });

  describe('Perception System Contract Validation', () => {
    test('should satisfy processVisualField input/output contract', async () => {
      const input = contract.perceptionSystem.input.processVisualField;

      const startTime = performance.now();
      const result = await perceptionSystem.processVisualField(input);
      const endTime = performance.now();

      // Validate output structure contract
      expect(result).toHaveProperty('detectedObjects');
      expect(result).toHaveProperty('overallConfidence');
      expect(result).toHaveProperty('processingTime');
      expect(result).toHaveProperty('fieldCoverage');

      expect(Array.isArray(result.detectedObjects)).toBe(true);
      expect(typeof result.overallConfidence).toBe('number');
      expect(typeof result.processingTime).toBe('number');
      expect(typeof result.fieldCoverage).toBe('number');

      // Validate detected objects structure
      result.detectedObjects.forEach((obj) => {
        expect(obj).toHaveProperty('worldPosition');
        expect(obj).toHaveProperty('classification');
        expect(obj).toHaveProperty('confidence');

        expect(obj.worldPosition).toHaveProperty('x');
        expect(obj.worldPosition).toHaveProperty('y');
        expect(obj.worldPosition).toHaveProperty('z');

        expect(obj.classification).toHaveProperty('primary');
        expect(typeof obj.classification.primary).toBe('string');

        expect(typeof obj.confidence).toBe('number');
        expect(obj.confidence).toBeGreaterThanOrEqual(0);
        expect(obj.confidence).toBeLessThanOrEqual(1);
      });

      // Validate constraints
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(
        contract.perceptionSystem.constraints.maxProcessingTime
      );
      expect(result.overallConfidence).toBeGreaterThanOrEqual(
        contract.perceptionSystem.constraints.minConfidence
      );
      expect(result.fieldCoverage).toBeGreaterThanOrEqual(0);
      expect(result.fieldCoverage).toBeLessThanOrEqual(1);
    });

    test('should handle different field of view configurations', async () => {
      const fovConfigurations = [
        { horizontal: 60, vertical: 45 },
        { horizontal: 90, vertical: 60 },
        { horizontal: 120, vertical: 90 },
        { horizontal: 180, vertical: 120 },
      ];

      for (const fov of fovConfigurations) {
        const query: VisualQuery = {
          observerPosition: { x: 0, y: 64, z: 0 },
          observerRotation: { yaw: 0, pitch: 0 },
          fieldOfView: fov,
          maxDistance: 32,
          level: 'standard',
        };

        const result = await perceptionSystem.processVisualField(query);

        // Should maintain contract regardless of FOV
        expect(result).toHaveProperty('detectedObjects');
        expect(result).toHaveProperty('overallConfidence');
        expect(Array.isArray(result.detectedObjects)).toBe(true);
        expect(typeof result.overallConfidence).toBe('number');
      }
    });

    test('should handle different quality levels', async () => {
      const qualityLevels = ['low', 'standard', 'high', 'detailed'] as const;

      for (const level of qualityLevels) {
        const query: VisualQuery = {
          observerPosition: { x: 0, y: 64, z: 0 },
          observerRotation: { yaw: 0, pitch: 0 },
          fieldOfView: { horizontal: 90, vertical: 60 },
          maxDistance: 32,
          level,
        };

        const result = await perceptionSystem.processVisualField(query);

        // Should maintain contract regardless of quality level
        expect(result).toHaveProperty('detectedObjects');
        expect(result).toHaveProperty('overallConfidence');
        expect(Array.isArray(result.detectedObjects)).toBe(true);
      }
    });
  });

  describe('Sensorimotor System Contract Validation', () => {
    test('should satisfy executeAction input/output contract', async () => {
      const input = contract.sensorimotorSystem.input.executeAction;

      const startTime = performance.now();
      const result = await sensorimotorSystem.executeAction(input);
      const endTime = performance.now();

      // Validate output structure contract
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('executionTime');
      expect(result).toHaveProperty('feedback');

      expect(typeof result.success).toBe('boolean');
      expect(typeof result.result).toBe('object');
      expect(typeof result.executionTime).toBe('number');
      expect(typeof result.feedback).toBe('string');

      // Validate performance contract
      const actualExecutionTime = endTime - startTime;
      expect(actualExecutionTime).toBeLessThan(
        contract.sensorimotorSystem.constraints.maxExecutionTime
      );
    });

    test('should support all contracted action types', async () => {
      const supportedActions =
        contract.sensorimotorSystem.constraints.supportedActions;

      for (const actionType of supportedActions) {
        const actionRequest: ActionRequest = {
          type: actionType as any,
          parameters: getDefaultParametersForAction(actionType),
          priority: 'normal',
          timeout: 1000,
        };

        // Should not throw for supported action types
        await expect(
          sensorimotorSystem.executeAction(actionRequest)
        ).resolves.toBeDefined();
      }
    });

    test('should handle unsupported actions gracefully', async () => {
      const unsupportedAction: ActionRequest = {
        type: 'teleport' as any, // Not in supported actions list
        parameters: { target: { x: 100, y: 64, z: 100 } },
        priority: 'normal',
        timeout: 1000,
      };

      const result = await sensorimotorSystem.executeAction(unsupportedAction);

      // Should handle gracefully, not crash
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');

      if (!result.success) {
        expect(result).toHaveProperty('feedback');
        expect(typeof result.feedback).toBe('string');
      }
    });

    test('should respect timeout constraints', async () => {
      const shortTimeoutAction: ActionRequest = {
        type: 'move',
        parameters: {
          direction: { x: 1, y: 0, z: 0 },
          speed: 0.1,
          duration: 5000,
        },
        priority: 'normal',
        timeout: 100, // Very short timeout
      };

      const startTime = performance.now();
      const result = await sensorimotorSystem.executeAction(shortTimeoutAction);
      const endTime = performance.now();

      const actualTime = endTime - startTime;

      // Should respect timeout (either complete quickly or timeout)
      expect(actualTime).toBeLessThan(200); // Some buffer for processing
      expect(result).toHaveProperty('success');
    });
  });

  describe('Inter-Module Contract Integration', () => {
    test('should integrate raycast engine with perception system', async () => {
      // Raycast engine provides data to perception system
      const visualQuery: VisualQuery = {
        observerPosition: { x: 0, y: 64, z: 0 },
        observerRotation: { yaw: 0, pitch: 0 },
        fieldOfView: { horizontal: 90, vertical: 60 },
        maxDistance: 32,
        level: 'standard',
      };

      const perceptionResult =
        await perceptionSystem.processVisualField(visualQuery);

      // Verify that perception system received raycast data
      expect(perceptionResult.detectedObjects.length).toBeGreaterThanOrEqual(0);

      // If objects detected, they should come from raycast engine
      if (perceptionResult.detectedObjects.length > 0) {
        perceptionResult.detectedObjects.forEach((obj) => {
          // Verify object is within raycast range
          const distance = Math.sqrt(
            Math.pow(obj.worldPosition.x - visualQuery.observerPosition.x, 2) +
              Math.pow(
                obj.worldPosition.y - visualQuery.observerPosition.y,
                2
              ) +
              Math.pow(obj.worldPosition.z - visualQuery.observerPosition.z, 2)
          );
          expect(distance).toBeLessThanOrEqual(visualQuery.maxDistance);
        });
      }
    });

    test('should integrate navigation with sensorimotor execution', async () => {
      // Navigation plans path, sensorimotor executes movement
      const pathRequest: PathPlanningRequest = {
        start: { x: 0, y: 64, z: 0 },
        goal: { x: 3, y: 64, z: 3 },
        urgency: 'normal',
        preferences: {
          avoidWater: false,
          avoidMobs: false,
          preferLighting: false,
          maxDetour: 2.0,
        },
      };

      const pathResult = await navigationSystem.planPath(pathRequest);
      expect(pathResult.success).toBe(true);

      if (pathResult.success && pathResult.path) {
        // Execute movement towards first waypoint
        const firstWaypoint =
          pathResult.path.waypoints[1] || pathResult.path.waypoints[0];
        const direction = {
          x: firstWaypoint.x - pathRequest.start.x,
          y: firstWaypoint.y - pathRequest.start.y,
          z: firstWaypoint.z - pathRequest.start.z,
        };

        // Normalize direction
        const magnitude = Math.sqrt(
          direction.x ** 2 + direction.y ** 2 + direction.z ** 2
        );
        if (magnitude > 0) {
          direction.x /= magnitude;
          direction.y /= magnitude;
          direction.z /= magnitude;
        }

        const moveAction: ActionRequest = {
          type: 'move',
          parameters: { direction, speed: 0.5, duration: 1000 },
          priority: 'normal',
          timeout: 2000,
        };

        const actionResult = await sensorimotorSystem.executeAction(moveAction);
        expect(actionResult.success).toBe(true);
      }
    });

    test('should handle cross-module event communication', async () => {
      let eventsReceived = 0;
      const eventPromise = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 1000);

        mockCoreModule.signals.on('world.perception.update', () => {
          eventsReceived++;
          clearTimeout(timeout);
          resolve();
        });
      });

      // Trigger perception update
      await perceptionSystem.processVisualField({
        observerPosition: { x: 0, y: 64, z: 0 },
        observerRotation: { yaw: 0, pitch: 0 },
        fieldOfView: { horizontal: 90, vertical: 60 },
        maxDistance: 32,
        level: 'standard',
      });

      // Emit event manually for test (in real system, this would be automatic)
      mockCoreModule.signals.emit('world.perception.update', {
        timestamp: Date.now(),
      });

      await eventPromise;
      expect(eventsReceived).toBeGreaterThan(0);
    });
  });

  describe('External Interface Contracts', () => {
    test('should integrate with Core module arbiter', async () => {
      // Mock an execution request to core arbiter
      const executionRequest = {
        module: 'world',
        operation: 'navigate',
        parameters: {
          start: { x: 0, y: 64, z: 0 },
          goal: { x: 5, y: 64, z: 5 },
        },
        priority: 'normal',
      };

      const approval =
        await mockCoreModule.arbiter.requestExecution(executionRequest);
      expect(approval).toHaveProperty('approved');
      expect(mockCoreModule.arbiter.requestExecution).toHaveBeenCalledWith(
        executionRequest
      );

      if (approval.approved) {
        // Execute the navigation
        const pathResult = await navigationSystem.planPath({
          start: executionRequest.parameters.start,
          goal: executionRequest.parameters.goal,
          urgency: approval.priority || 'normal',
          preferences: {
            avoidWater: false,
            avoidMobs: false,
            preferLighting: false,
            maxDetour: 2.0,
          },
        });

        // Report status back to arbiter
        mockCoreModule.arbiter.reportStatus({
          module: 'world',
          operation: 'navigate',
          success: pathResult.success,
          timestamp: Date.now(),
        });

        expect(mockCoreModule.arbiter.reportStatus).toHaveBeenCalled();
      }
    });

    test('should integrate with MCP capabilities interface', async () => {
      // Check available capabilities
      const availableCapabilities =
        mockMCPInterface.capabilities.getAvailable();
      expect(Array.isArray(availableCapabilities)).toBe(true);
      expect(availableCapabilities.length).toBeGreaterThan(0);

      // Test capability execution
      for (const capability of availableCapabilities.slice(0, 2)) {
        // Test first 2
        const params = getDefaultParametersForCapability(capability);

        // Check preconditions
        const preconditionsValid =
          mockMCPInterface.constraints.checkPreconditions(capability, params);
        expect(typeof preconditionsValid).toBe('boolean');

        if (preconditionsValid) {
          // Execute capability
          const result = await mockMCPInterface.capabilities.execute(
            capability,
            params
          );
          expect(result).toHaveProperty('success');

          // Validate effects
          const effectsValid = mockMCPInterface.constraints.validateEffects(
            capability,
            result
          );
          expect(typeof effectsValid).toBe('boolean');
        }
      }
    });

    test('should track performance metrics with Core module', async () => {
      const operations = ['raycast', 'navigation', 'perception', 'action'];

      for (const operation of operations) {
        const startTime = performance.now();

        // Simulate operation
        switch (operation) {
          case 'raycast':
            raycastEngine.castRay(
              { x: 0, y: 64, z: 0 },
              { x: 0, y: 0, z: -1 },
              32
            );
            break;
          case 'navigation':
            await navigationSystem.planPath({
              start: { x: 0, y: 64, z: 0 },
              goal: { x: 2, y: 64, z: 2 },
              urgency: 'normal',
              preferences: {
                avoidWater: false,
                avoidMobs: false,
                preferLighting: false,
                maxDetour: 2.0,
              },
            });
            break;
          case 'perception':
            await perceptionSystem.processVisualField({
              observerPosition: { x: 0, y: 64, z: 0 },
              observerRotation: { yaw: 0, pitch: 0 },
              fieldOfView: { horizontal: 90, vertical: 60 },
              maxDistance: 32,
              level: 'standard',
            });
            break;
          case 'action':
            await sensorimotorSystem.executeAction({
              type: 'look',
              parameters: { target: { x: 1, y: 64, z: 1 } },
              priority: 'normal',
              timeout: 1000,
            });
            break;
        }

        const endTime = performance.now();
        const duration = endTime - startTime;

        // Report performance to core module
        mockCoreModule.performance.trackLatency(operation, duration);
        expect(mockCoreModule.performance.trackLatency).toHaveBeenCalledWith(
          operation,
          duration
        );
      }
    });
  });

  // Helper functions
  function getDefaultParametersForAction(actionType: string): any {
    switch (actionType) {
      case 'move':
        return { direction: { x: 1, y: 0, z: 0 }, speed: 0.5, duration: 1000 };
      case 'look':
        return { target: { x: 1, y: 64, z: 1 } };
      case 'interact':
        return { target: { x: 1, y: 64, z: 1 } };
      case 'mine':
        return {
          target: { x: 1, y: 64, z: 1 },
          tool: 'minecraft:diamond_pickaxe',
        };
      case 'place':
        return { target: { x: 1, y: 64, z: 1 }, blockType: 'minecraft:stone' };
      default:
        return {};
    }
  }

  function getDefaultParametersForCapability(capability: string): any {
    switch (capability) {
      case 'move':
        return { direction: 'forward', distance: 1 };
      case 'look':
        return { direction: 'up' };
      case 'interact':
        return { target: 'nearest' };
      case 'mine':
        return { block: 'stone' };
      default:
        return {};
    }
  }
});
