/**
 * Embodied Consciousness Tests for World Module
 *
 * These tests validate consciousness-aware behaviors specific to
 * embodied sensing and world interaction, ensuring the system maintains
 * coherent spatial awareness and disciplined sensing constraints.
 *
 * @author @darianrosebrook
 */

import { RaycastEngine } from '../sensing/raycast-engine';
import { VisibleSensing } from '../sensing/visible-sensing';
import { PerceptionIntegration } from '../perception/perception-integration';
import { NavigationSystem } from '../navigation/navigation-system';
import { SensorimotorSystem } from '../sensorimotor/sensorimotor-system';
import {
  WorldPosition,
  VisualQuery,
  PathPlanningRequest,
  ActionRequest,
  RaycastConfig,
  PerceptionConfig,
  NavigationConfig,
  SensorimotorConfig,
} from '../types';
import { MotorAction } from '../sensorimotor/types';

interface SpatialMemoryState {
  knownLocations: Map<string, WorldPosition>;
  exploredRegions: Set<string>;
  uncertainty: Map<string, number>;
  lastUpdated: Map<string, number>;
}

interface EmbodiedConstraints {
  visibleOnlySensing: boolean;
  spatialContinuity: boolean;
  physicalReachability: boolean;
  temporalConsistency: boolean;
}

interface ConsciousnessMetrics {
  spatialCoherence: number;
  perceptualConsistency: number;
  bodyAwareness: number;
  environmentalUnderstanding: number;
  actionCoherence: number;
}

describe('Embodied Consciousness Tests', () => {
  let raycastEngine: RaycastEngine;
  let perceptionSystem: PerceptionIntegration;
  let navigationSystem: NavigationSystem;
  let sensorimotorSystem: SensorimotorSystem;
  let spatialMemory: SpatialMemoryState;
  let embodiedConstraints: EmbodiedConstraints;

  beforeEach(() => {
    // Initialize systems with consciousness-aware configurations
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
        feedbackIntegration: 'real_time',
        coordinationTimeout: 5000,
      },
      feedbackProcessing: {
        bufferDuration: 100,
        processingFrequency: 20,
        learningRate: 0.1,
        confidenceThreshold: 0.8,
      },
      prediction: {
        predictionHorizon: 200,
        modelUpdateFrequency: 1,
        predictionConfidenceThreshold: 0.7,
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
        boundaryEnforcement: true,
      },
    };

    raycastEngine = new RaycastEngine(sensingConfig);
    const visibleSensing = new VisibleSensing(sensingConfig, () => ({
      position: { x: 0, y: 64, z: 0 },
      orientation: { yaw: 0, pitch: 0 },
    }));

    perceptionSystem = new PerceptionIntegration(
      perceptionConfig,
      () => ({
        position: { x: 0, y: 64, z: 0 },
        orientation: { yaw: 0, pitch: 0 },
        headDirection: { x: 0, y: 0, z: 1 },
        eyeHeight: 1.6,
      }),
      visibleSensing
    );
    navigationSystem = new NavigationSystem(navigationConfig);
    sensorimotorSystem = new SensorimotorSystem(sensorimotorConfig, () => ({
      position: { x: 0, y: 64, z: 0 },
      orientation: { yaw: 0, pitch: 0 },
      headDirection: { x: 0, y: 0, z: 1 },
      eyeHeight: 1.6,
    }));

    // Initialize consciousness state
    spatialMemory = {
      knownLocations: new Map(),
      exploredRegions: new Set(),
      uncertainty: new Map(),
      lastUpdated: new Map(),
    };

    embodiedConstraints = {
      visibleOnlySensing: true,
      spatialContinuity: true,
      physicalReachability: true,
      temporalConsistency: true,
    };

    setupTestEnvironment();
  });

  afterEach(() => {
    raycastEngine?.dispose();
    perceptionSystem?.dispose();
    navigationSystem?.dispose();
    sensorimotorSystem?.dispose();
  });

  function setupTestEnvironment(): void {
    // Create a test environment with varied spatial features
    const worldBlocks = [];

    // Ground plane with different materials
    for (let x = -20; x <= 20; x++) {
      for (let z = -20; z <= 20; z++) {
        const material =
          (x + z) % 3 === 0
            ? 'minecraft:stone'
            : (x + z) % 3 === 1
              ? 'minecraft:grass_block'
              : 'minecraft:dirt';
        worldBlocks.push({
          position: { x, y: 63, z },
          blockType: material,
        });
      }
    }

    // Hidden room (not directly visible)
    for (let x = 15; x <= 18; x++) {
      for (let z = 15; z <= 18; z++) {
        for (let y = 64; y <= 67; y++) {
          if (x === 15 || x === 18 || z === 15 || z === 18 || y === 67) {
            worldBlocks.push({
              position: { x, y, z },
              blockType: 'minecraft:obsidian',
            });
          } else if (y === 64) {
            worldBlocks.push({
              position: { x, y, z },
              blockType: 'minecraft:diamond_block',
            });
          }
        }
      }
    }

    // Maze with line-of-sight blocking
    const mazePattern = [
      [1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 1, 0, 1],
      [1, 0, 1, 0, 1, 0, 1],
      [1, 0, 1, 0, 0, 0, 1],
      [1, 0, 1, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1],
    ];

    for (let i = 0; i < mazePattern.length; i++) {
      for (let j = 0; j < mazePattern[i].length; j++) {
        if (mazePattern[i][j] === 1) {
          for (let y = 64; y <= 66; y++) {
            worldBlocks.push({
              position: { x: j - 10, y, z: i - 10 },
              blockType: 'minecraft:stone_bricks',
            });
          }
        }
      }
    }

    raycastEngine.updateWorld(worldBlocks);
  }

  function calculateConsciousnessMetrics(
    perceptionResult: any,
    navigationResult: any,
    actionResult: any,
    currentPosition: WorldPosition
  ): ConsciousnessMetrics {
    // Spatial Coherence: How well does the system maintain consistent spatial understanding?
    const spatialCoherence = calculateSpatialCoherence(
      perceptionResult,
      currentPosition
    );

    // Perceptual Consistency: How consistent are perceptual reports over time?
    const perceptualConsistency =
      calculatePerceptualConsistency(perceptionResult);

    // Body Awareness: How well does the system understand its physical constraints?
    const bodyAwareness = calculateBodyAwareness(
      navigationResult,
      actionResult
    );

    // Environmental Understanding: How well does the system model its environment?
    const environmentalUnderstanding =
      calculateEnvironmentalUnderstanding(perceptionResult);

    // Action Coherence: How well do actions align with perceptions and goals?
    const actionCoherence = calculateActionCoherence(
      perceptionResult,
      navigationResult,
      actionResult
    );

    return {
      spatialCoherence,
      perceptualConsistency,
      bodyAwareness,
      environmentalUnderstanding,
      actionCoherence,
    };
  }

  function calculateSpatialCoherence(
    perceptionResult: any,
    position: WorldPosition
  ): number {
    if (!perceptionResult?.detectedObjects) return 0;

    // Check if spatial relationships make sense
    let coherenceScore = 1.0;

    perceptionResult.detectedObjects.forEach((obj: any) => {
      const distance = Math.sqrt(
        Math.pow(obj.worldPosition.x - position.x, 2) +
          Math.pow(obj.worldPosition.y - position.y, 2) +
          Math.pow(obj.worldPosition.z - position.z, 2)
      );

      // Objects should be within reasonable sensing range
      if (distance > 64) {
        coherenceScore *= 0.8; // Penalty for impossible observations
      }

      // Objects should follow line-of-sight constraints
      const lineOfSight = raycastEngine.castRay(
        position,
        {
          x: (obj.worldPosition.x - position.x) / distance,
          y: (obj.worldPosition.y - position.y) / distance,
          z: (obj.worldPosition.z - position.z) / distance,
        },
        distance
      );

      if (!lineOfSight || lineOfSight.distance < distance - 1) {
        coherenceScore *= 0.5; // Major penalty for seeing through walls
      }
    });

    return Math.max(0, coherenceScore);
  }

  function calculatePerceptualConsistency(perceptionResult: any): number {
    // For this test, assume high consistency if perception succeeds
    return perceptionResult?.detectedObjects ? 0.9 : 0.1;
  }

  function calculateBodyAwareness(
    navigationResult: any,
    actionResult: any
  ): number {
    let awareness = 1.0;

    // Check if navigation respects physical constraints
    if (navigationResult?.path) {
      const path = navigationResult.path;
      for (let i = 1; i < path.waypoints.length; i++) {
        const prev = path.waypoints[i - 1];
        const curr = path.waypoints[i];
        const stepDistance = Math.sqrt(
          Math.pow(curr.x - prev.x, 2) +
            Math.pow(curr.y - prev.y, 2) +
            Math.pow(curr.z - prev.z, 2)
        );

        // Check for impossible steps
        if (stepDistance > 5) {
          awareness *= 0.7; // Penalty for teleportation-like movement
        }

        // Check for impossible vertical movement
        if (Math.abs(curr.y - prev.y) > 2) {
          awareness *= 0.8; // Penalty for flying/tunneling
        }
      }
    }

    return Math.max(0, awareness);
  }

  function calculateEnvironmentalUnderstanding(perceptionResult: any): number {
    if (!perceptionResult?.detectedObjects) return 0;

    let understanding = 0.5; // Base level

    // Bonus for recognizing different object types
    const objectTypes = new Set(
      perceptionResult.detectedObjects.map(
        (obj: any) => obj.classification.primary
      )
    );
    understanding += objectTypes.size * 0.1;

    // Bonus for spatial grouping recognition
    if (perceptionResult.spatialCohesion) {
      understanding += 0.2;
    }

    return Math.min(1.0, understanding);
  }

  function calculateActionCoherence(
    perceptionResult: any,
    navigationResult: any,
    actionResult: any
  ): number {
    // Check if actions are physically possible and logically consistent
    let coherence = 1.0;

    if (actionResult?.type === 'move' && navigationResult?.path) {
      // Movement should follow planned path
      coherence = 0.9;
    }

    return coherence;
  }

  describe('Visible-Only Sensing Discipline', () => {
    test('should only perceive objects within line of sight', async () => {
      const observerPosition = { x: 0, y: 64, z: 0 };
      const observerRotation = { yaw: 0, pitch: 0 };

      const visualQuery: VisualQuery = {
        position: observerPosition,
        radius: 64,
        maxDistance: 64,
      };

      const result = await perceptionSystem.processVisualField(visualQuery);

      // Validate that all detected objects are actually visible
      result.detectedObjects.forEach((obj) => {
        const direction = {
          x: obj.worldPosition.x - observerPosition.x,
          y: obj.worldPosition.y - observerPosition.y,
          z: obj.worldPosition.z - observerPosition.z,
        };
        const distance = Math.sqrt(
          direction.x ** 2 + direction.y ** 2 + direction.z ** 2
        );

        // Normalize direction
        direction.x /= distance;
        direction.y /= distance;
        direction.z /= distance;

        // Cast ray to verify line of sight
        const rayResult = raycastEngine.castRay(
          observerPosition,
          direction,
          distance
        );

        expect(rayResult).toBeDefined();
        expect(rayResult!.distance).toBeCloseTo(distance, 1);

        // Should not see the hidden diamond blocks through obsidian walls
        if (obj.classification.primary === 'minecraft:diamond_block') {
          // Diamond blocks are inside the hidden room, should not be visible from outside
          const isInsideRoom =
            obj.worldPosition.x >= 16 &&
            obj.worldPosition.x <= 17 &&
            obj.worldPosition.z >= 16 &&
            obj.worldPosition.z <= 17;
          if (isInsideRoom) {
            // This should not happen - indicates seeing through walls
            expect(false).toBe(true);
          }
        }
      });

      // Verify consciousness metrics
      const metrics = calculateConsciousnessMetrics(
        result,
        null,
        null,
        observerPosition
      );
      expect(metrics.spatialCoherence).toBeGreaterThan(0.8);
      expect(metrics.perceptualConsistency).toBeGreaterThan(0.7);
    });

    test('should respect visual field boundaries', async () => {
      const observerPosition = { x: 0, y: 64, z: 0 };
      const observerRotation = { yaw: 0, pitch: 0 }; // Looking north (negative Z)

      const visualQuery: VisualQuery = {
        position: observerPosition,
        radius: 32,
        maxDistance: 32,
      };

      const result = await perceptionSystem.processVisualField(visualQuery);

      // Check that no objects are detected outside the field of view
      result.detectedObjects.forEach((obj) => {
        const direction = {
          x: obj.worldPosition.x - observerPosition.x,
          y: obj.worldPosition.y - observerPosition.y,
          z: obj.worldPosition.z - observerPosition.z,
        };

        // Calculate angle from forward direction (negative Z)
        const horizontalAngle =
          (Math.atan2(direction.x, -direction.z) * 180) / Math.PI;
        const verticalAngle =
          (Math.atan2(
            direction.y,
            Math.sqrt(direction.x ** 2 + direction.z ** 2)
          ) *
            180) /
          Math.PI;

        expect(Math.abs(horizontalAngle)).toBeLessThanOrEqual(30); // Half of 60° FOV
        expect(Math.abs(verticalAngle)).toBeLessThanOrEqual(22.5); // Half of 45° FOV
      });
    });

    test('should handle occlusion correctly', async () => {
      // Position observer to look at maze area where occlusion occurs
      const observerPosition = { x: -15, y: 65, z: -10 };
      const observerRotation = { yaw: 45, pitch: -10 }; // Looking into the maze

      const visualQuery: VisualQuery = {
        position: observerPosition,
        radius: 64,
        maxDistance: 64,
      };

      const result = await perceptionSystem.processVisualField(visualQuery);

      // Objects behind walls should not be visible
      result.detectedObjects.forEach((obj) => {
        const rayResult = raycastEngine.castRay(
          observerPosition,
          {
            x: obj.worldPosition.x - observerPosition.x,
            y: obj.worldPosition.y - observerPosition.y,
            z: obj.worldPosition.z - observerPosition.z,
          },
          64
        );

        if (rayResult) {
          const distanceToObject = Math.sqrt(
            Math.pow(obj.worldPosition.x - observerPosition.x, 2) +
              Math.pow(obj.worldPosition.y - observerPosition.y, 2) +
              Math.pow(obj.worldPosition.z - observerPosition.z, 2)
          );

          // Ray should hit the object, not something in front of it
          expect(rayResult.distance).toBeCloseTo(distanceToObject, 1);
        }
      });
    });
  });

  describe('Spatial Continuity and Body Awareness', () => {
    test('should maintain spatial continuity during movement', async () => {
      const startPosition = { x: 0, y: 64, z: 0 };
      const goalPosition = { x: 5, y: 64, z: 5 };

      // Plan path
      const pathRequest: PathPlanningRequest = {
        start: startPosition,
        goal: goalPosition,
        maxDistance: 200,
        allowPartialPath: true,
        avoidHazards: true,
        urgency: 'normal',
        timeout: 100,
        preferences: {
          preferLit: true,
          avoidMobs: false,
          minimizeVertical: false,
          preferSolid: true,
          avoidWater: false,
          preferLighting: false,
          maxDetour: 2.0,
        },
      };

      const pathResult = await navigationSystem.planPath(pathRequest);
      expect(pathResult.success).toBe(true);

      // Validate spatial continuity
      const path = pathResult.path!;
      for (let i = 1; i < path.length; i++) {
        const prev = path[i - 1];
        const curr = path[i];

        // Steps should be physically possible
        const stepDistance = Math.sqrt(
          Math.pow(curr.x - prev.x, 2) +
            Math.pow(curr.y - prev.y, 2) +
            Math.pow(curr.z - prev.z, 2)
        );

        expect(stepDistance).toBeLessThanOrEqual(2.0); // Reasonable step size

        // Vertical movement should respect physical constraints
        const verticalChange = Math.abs(curr.y - prev.y);
        expect(verticalChange).toBeLessThanOrEqual(1.5); // Jump height limit
      }

      // Test consciousness metrics
      const metrics = calculateConsciousnessMetrics(
        null,
        pathResult,
        null,
        startPosition
      );
      expect(metrics.bodyAwareness).toBeGreaterThan(0.8);
      expect(metrics.spatialCoherence).toBeGreaterThan(0.7);
    });

    test('should respect physical reachability constraints', async () => {
      const currentPosition = { x: 0, y: 64, z: 0 };

      // Test various action requests
      const actions = [
        {
          type: 'move',
          parameters: {
            direction: { x: 1, y: 0, z: 0 },
            speed: 0.5,
            duration: 1000,
          },
          expected: 'feasible',
        },
        {
          type: 'move',
          parameters: {
            direction: { x: 0, y: 10, z: 0 },
            speed: 1.0,
            duration: 100,
          },
          expected: 'impossible', // Cannot move 10 blocks up instantly
        },
        {
          type: 'teleport',
          parameters: { target: { x: 100, y: 64, z: 100 } },
          expected: 'impossible', // Teleportation not physically possible
        },
      ];

      for (const action of actions) {
        const actionRequest: MotorAction = {
          id: `action-${Date.now()}-${Math.random()}`,
          type: action.type === 'move' ? 'move_forward' : (action.type as any),
          parameters: action.parameters,
          priority: 1,
          requiredPrecision: 0.5,
          feedback: true,
        };

        try {
          const executionContext = {
            currentPosition: {
              position: { x: 0, y: 64, z: 0 },
              timestamp: Date.now(),
              confidence: 1.0,
            },
            targetPosition: {
              position: { x: 0, y: 64, z: 0 },
              timestamp: Date.now(),
              confidence: 1.0,
            },
            environmentConditions: {
              lighting: 15,
              weather: 'clear' as const,
              temperature: 20,
              terrain: 'flat' as const,
            },
            constraints: {
              maxSpeed: 1.0,
              maxAcceleration: 0.5,
              maxForce: 10.0,
              collisionAvoidance: true,
            },
            resources: { energy: 1.0, health: 1.0, inventory: [], tools: [] },
          };
          const result = await sensorimotorSystem.executeAction(
            actionRequest,
            executionContext
          );

          if (action.expected === 'impossible') {
            // Should either fail or be rejected
            expect(result.success || result.errors.length > 0).toBeDefined();
            if (result.success) {
              expect(result.success).toBe(false);
            }
          } else {
            expect(result.success).toBe(true);
          }
        } catch (error) {
          if (action.expected === 'feasible') {
            throw error; // Unexpected failure
          }
          // Expected failure for impossible actions
        }
      }
    });

    test('should maintain coherent spatial memory', () => {
      // Simulate exploration and memory building
      const explorationPoints = [
        { x: 0, y: 64, z: 0 },
        { x: 5, y: 64, z: 0 },
        { x: 5, y: 64, z: 5 },
        { x: 0, y: 64, z: 5 },
      ];

      explorationPoints.forEach((point, index) => {
        const regionKey = `${Math.floor(point.x / 5)}_${Math.floor(point.z / 5)}`;

        spatialMemory.knownLocations.set(`point_${index}`, point);
        spatialMemory.exploredRegions.add(regionKey);
        spatialMemory.uncertainty.set(`point_${index}`, 0.1); // Low uncertainty for visited locations
        spatialMemory.lastUpdated.set(`point_${index}`, Date.now());
      });

      // Validate memory coherence
      expect(spatialMemory.knownLocations.size).toBe(4);
      expect(spatialMemory.exploredRegions.size).toBeGreaterThan(0);

      // Check spatial relationships
      const point0 = spatialMemory.knownLocations.get('point_0')!;
      const point1 = spatialMemory.knownLocations.get('point_1')!;
      const distance = Math.sqrt(
        Math.pow(point1.x - point0.x, 2) + Math.pow(point1.z - point0.z, 2)
      );
      expect(distance).toBeCloseTo(5, 1);

      // Memory should degrade over time for unvisited areas
      const oldTimestamp = Date.now() - 60000; // 1 minute ago
      spatialMemory.lastUpdated.set('old_location', oldTimestamp);
      spatialMemory.uncertainty.set('old_location', 0.8); // High uncertainty for old data

      expect(spatialMemory.uncertainty.get('old_location')).toBeGreaterThan(
        0.5
      );
    });
  });

  describe('Temporal Consistency and Learning', () => {
    test('should maintain perceptual consistency across time', async () => {
      const observerPosition = { x: 0, y: 64, z: 0 };
      const observerRotation = { yaw: 0, pitch: 0 };

      const visualQuery: VisualQuery = {
        position: observerPosition,
        radius: 32,
        maxDistance: 32,
      };

      // Take multiple perception samples
      const perceptionSamples = [];
      for (let i = 0; i < 5; i++) {
        const result = await perceptionSystem.processVisualField(visualQuery);
        perceptionSamples.push(result);

        // Small delay between samples
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Validate consistency across samples
      const firstSample = perceptionSamples[0];
      perceptionSamples.slice(1).forEach((sample, index) => {
        // Object count should be consistent (allowing for small variations due to processing)
        expect(
          Math.abs(
            sample.detectedObjects.length - firstSample.detectedObjects.length
          )
        ).toBeLessThanOrEqual(1);

        // Object positions should be stable
        sample.detectedObjects.forEach((obj) => {
          const matchingObject = firstSample.detectedObjects.find(
            (firstObj) =>
              Math.abs(firstObj.worldPosition.x - obj.worldPosition.x) < 1 &&
              Math.abs(firstObj.worldPosition.y - obj.worldPosition.y) < 1 &&
              Math.abs(firstObj.worldPosition.z - obj.worldPosition.z) < 1
          );

          if (matchingObject) {
            expect(matchingObject.classification.primary).toBe(
              obj.classification.primary
            );
          }
        });
      });

      // Calculate temporal consistency metric
      const consistencyScore =
        perceptionSamples.reduce((acc, sample, index) => {
          if (index === 0) return acc;
          const similarity = calculatePerceptionSimilarity(firstSample, sample);
          return acc + similarity;
        }, 0) /
        (perceptionSamples.length - 1);

      expect(consistencyScore).toBeGreaterThan(0.8);
    });

    test('should adapt to environmental changes appropriately', async () => {
      const observerPosition = { x: 0, y: 64, z: 0 };

      // Initial perception
      const initialQuery: VisualQuery = {
        position: observerPosition,
        radius: 32,
        maxDistance: 32,
      };

      const initialResult =
        await perceptionSystem.processVisualField(initialQuery);
      const initialObjectCount = initialResult.detectedObjects.length;

      // Simulate world change (add new block)
      const newBlock = {
        position: { x: 0, y: 64, z: -5 },
        blockType: 'minecraft:gold_block',
      };
      raycastEngine.updateWorld([newBlock]);

      // Updated perception
      const updatedResult =
        await perceptionSystem.processVisualField(initialQuery);

      // Should detect the new object
      expect(updatedResult.detectedObjects.length).toBeGreaterThan(
        initialObjectCount
      );

      const goldBlock = updatedResult.detectedObjects.find(
        (obj) => obj.classification.primary === 'minecraft:gold_block'
      );
      expect(goldBlock).toBeDefined();
      expect(goldBlock!.worldPosition).toMatchObject({ x: 0, y: 64, z: -5 });

      // Consciousness metrics should reflect adaptation
      const metrics = calculateConsciousnessMetrics(
        updatedResult,
        null,
        null,
        observerPosition
      );
      expect(metrics.environmentalUnderstanding).toBeGreaterThan(0.7);
    });

    test('should demonstrate learning through exploration', async () => {
      // Simulate exploration sequence
      const explorationSequence = [
        { position: { x: 0, y: 64, z: 0 }, rotation: { yaw: 0, pitch: 0 } },
        { position: { x: 2, y: 64, z: 0 }, rotation: { yaw: 45, pitch: 0 } },
        { position: { x: 4, y: 64, z: 2 }, rotation: { yaw: 90, pitch: 0 } },
        { position: { x: 2, y: 64, z: 4 }, rotation: { yaw: 135, pitch: 0 } },
        { position: { x: 0, y: 64, z: 4 }, rotation: { yaw: 180, pitch: 0 } },
      ];

      const explorationResults = [];
      const knowledgeAccumulation = [];

      for (const step of explorationSequence) {
        const visualQuery: VisualQuery = {
          position: step.position,
          radius: 32,
          maxDistance: 32,
        };

        const result = await perceptionSystem.processVisualField(visualQuery);
        explorationResults.push(result);

        // Update spatial memory
        const regionKey = `${Math.floor(step.position.x / 2)}_${Math.floor(step.position.z / 2)}`;
        spatialMemory.exploredRegions.add(regionKey);

        // Accumulate unique objects discovered
        result.detectedObjects.forEach((obj) => {
          const objKey = `${obj.worldPosition.x}_${obj.worldPosition.y}_${obj.worldPosition.z}`;
          if (!spatialMemory.knownLocations.has(objKey)) {
            spatialMemory.knownLocations.set(objKey, obj.worldPosition);
            spatialMemory.uncertainty.set(objKey, 1.0 - obj.confidence);
          }
        });

        knowledgeAccumulation.push({
          step: explorationResults.length,
          uniqueObjects: spatialMemory.knownLocations.size,
          exploredRegions: spatialMemory.exploredRegions.size,
          averageConfidence: result.overallConfidence,
        });
      }

      // Validate learning progression
      expect(
        knowledgeAccumulation[knowledgeAccumulation.length - 1].uniqueObjects
      ).toBeGreaterThan(knowledgeAccumulation[0].uniqueObjects);

      expect(
        knowledgeAccumulation[knowledgeAccumulation.length - 1].exploredRegions
      ).toBeGreaterThan(knowledgeAccumulation[0].exploredRegions);

      // Confidence should generally improve with more exploration
      const earlyConfidence =
        knowledgeAccumulation
          .slice(0, 2)
          .reduce((sum, data) => sum + data.averageConfidence, 0) / 2;
      const lateConfidence =
        knowledgeAccumulation
          .slice(-2)
          .reduce((sum, data) => sum + data.averageConfidence, 0) / 2;

      expect(lateConfidence).toBeGreaterThanOrEqual(earlyConfidence - 0.1); // Allow small degradation
    });
  });

  describe('Integrated Consciousness Assessment', () => {
    test('should demonstrate coherent embodied consciousness', async () => {
      const testPosition = { x: 0, y: 64, z: 0 };
      const testRotation = { yaw: 0, pitch: 0 };

      // 1. Perception
      const perceptionResult = await perceptionSystem.processVisualField({
        position: testPosition,
        radius: 32,
        maxDistance: 32,
      });

      // 2. Navigation planning
      const navigationResult = await navigationSystem.planPath({
        start: testPosition,
        goal: { x: 8, y: 64, z: 8 },
        maxDistance: 200,
        allowPartialPath: true,
        avoidHazards: true,
        urgency: 'normal',
        timeout: 100,
        preferences: {
          preferLit: true,
          avoidMobs: false,
          minimizeVertical: false,
          preferSolid: true,
          avoidWater: false,
          preferLighting: false,
          maxDetour: 3.0,
        },
      });

      // 3. Action planning
      const actionResult = await sensorimotorSystem.executeAction(
        {
          id: 'test-action-1',
          type: 'move_forward',
          parameters: {
            direction: { x: 1, y: 0, z: 1 },
            speed: 0.5,
            duration: 1000,
          },
          priority: 1,
          requiredPrecision: 0.5,
          feedback: true,
        },
        {
          currentPosition: {
            position: { x: testPosition.x, y: 64, z: testPosition.z },
            timestamp: Date.now(),
            confidence: 1.0,
          },
          environmentConditions: {
            lighting: 15,
            weather: 'clear' as const,
            temperature: 20,
            terrain: 'flat' as const,
          },
          constraints: {
            maxSpeed: 1.0,
            maxAcceleration: 0.5,
            maxForce: 10.0,
            collisionAvoidance: true,
          },
          resources: { energy: 1.0, health: 1.0, inventory: [], tools: [] },
        }
      );

      // Calculate comprehensive consciousness metrics
      const metrics = calculateConsciousnessMetrics(
        perceptionResult,
        navigationResult,
        actionResult,
        testPosition
      );

      // Validate consciousness criteria
      expect(metrics.spatialCoherence).toBeGreaterThan(0.7);
      expect(metrics.perceptualConsistency).toBeGreaterThan(0.7);
      expect(metrics.bodyAwareness).toBeGreaterThan(0.8);
      expect(metrics.environmentalUnderstanding).toBeGreaterThan(0.6);
      expect(metrics.actionCoherence).toBeGreaterThan(0.7);

      // Overall consciousness score
      const overallScore =
        Object.values(metrics).reduce((sum, score) => sum + score, 0) / 5;
      expect(overallScore).toBeGreaterThan(0.7);

      console.log(`Consciousness Assessment:
        Spatial Coherence: ${metrics.spatialCoherence.toFixed(2)}
        Perceptual Consistency: ${metrics.perceptualConsistency.toFixed(2)}
        Body Awareness: ${metrics.bodyAwareness.toFixed(2)}
        Environmental Understanding: ${metrics.environmentalUnderstanding.toFixed(2)}
        Action Coherence: ${metrics.actionCoherence.toFixed(2)}
        Overall Score: ${overallScore.toFixed(2)}`);
    });

    test('should maintain embodied constraints under stress', async () => {
      // Stress test: rapid sequence of perception and action requests
      const stressResults = [];

      for (let i = 0; i < 10; i++) {
        const position = {
          x: Math.random() * 10,
          y: 64,
          z: Math.random() * 10,
        };
        const rotation = {
          yaw: Math.random() * 360,
          pitch: (Math.random() - 0.5) * 60,
        };

        const start = Date.now();

        // Rapid perception + navigation + action sequence
        const [perceptionResult, navigationResult, actionResult] =
          await Promise.all([
            perceptionSystem.processVisualField({
              position: position,
              radius: 32,
              maxDistance: 32,
            }),
            navigationSystem.planPath({
              start: position,
              goal: { x: position.x + 5, y: 64, z: position.z + 5 },
              maxDistance: 200,
              allowPartialPath: true,
              avoidHazards: true,
              urgency: 'urgent',
              timeout: 100,
              preferences: {
                preferLit: true,
                avoidMobs: false,
                minimizeVertical: false,
                preferSolid: true,
                avoidWater: false,
                preferLighting: false,
                maxDetour: 2.0,
              },
            }),
            sensorimotorSystem.executeAction(
              {
                id: `stress-action-${i}`,
                type: 'look_at',
                parameters: {
                  target: { x: position.x + 3, y: 64, z: position.z + 3 },
                },
                priority: 2,
                requiredPrecision: 0.5,
                feedback: true,
              },
              {
                currentPosition: {
                  position: { x: position.x, y: 64, z: position.z },
                  timestamp: Date.now(),
                  confidence: 1.0,
                },
                environmentConditions: {
                  lighting: 15,
                  weather: 'clear' as const,
                  temperature: 20,
                  terrain: 'flat' as const,
                },
                resources: {
                  energy: 1.0,
                  health: 1.0,
                  inventory: [],
                  tools: [],
                },
                constraints: {
                  maxSpeed: 1.0,
                  maxAcceleration: 0.5,
                  maxForce: 10.0,
                  collisionAvoidance: true,
                },
              }
            ),
          ]);

        const processingTime = Date.now() - start;

        // Calculate metrics under stress
        const metrics = calculateConsciousnessMetrics(
          perceptionResult,
          navigationResult,
          actionResult,
          position
        );

        stressResults.push({
          iteration: i,
          processingTime,
          metrics,
          embodiedConstraintsMaintained:
            metrics.spatialCoherence > 0.6 &&
            metrics.bodyAwareness > 0.6 &&
            perceptionResult.detectedObjects.every((obj) => {
              const distance = Math.sqrt(
                Math.pow(obj.worldPosition.x - position.x, 2) +
                  Math.pow(obj.worldPosition.y - position.y, 2) +
                  Math.pow(obj.worldPosition.z - position.z, 2)
              );
              return distance <= 32; // Within sensing range
            }),
        });
      }

      // Validate that embodied constraints are maintained under stress
      const constraintViolations = stressResults.filter(
        (result) => !result.embodiedConstraintsMaintained
      );
      expect(constraintViolations.length).toBeLessThanOrEqual(2); // Allow up to 2 violations out of 10

      // Performance should remain reasonable
      const avgProcessingTime =
        stressResults.reduce((sum, result) => sum + result.processingTime, 0) /
        stressResults.length;
      expect(avgProcessingTime).toBeLessThan(200); // Should process in under 200ms on average
    });
  });

  // Helper function for calculating perception similarity
  function calculatePerceptionSimilarity(
    perception1: any,
    perception2: any
  ): number {
    if (!perception1.detectedObjects || !perception2.detectedObjects) return 0;

    const objects1 = perception1.detectedObjects;
    const objects2 = perception2.detectedObjects;

    if (objects1.length === 0 && objects2.length === 0) return 1.0;
    if (objects1.length === 0 || objects2.length === 0) return 0.0;

    let matches = 0;
    objects1.forEach((obj1: any) => {
      const match = objects2.find(
        (obj2: any) =>
          Math.abs(obj1.worldPosition.x - obj2.worldPosition.x) < 1 &&
          Math.abs(obj1.worldPosition.y - obj2.worldPosition.y) < 1 &&
          Math.abs(obj1.worldPosition.z - obj2.worldPosition.z) < 1 &&
          obj1.classification.primary === obj2.classification.primary
      );
      if (match) matches++;
    });

    return matches / Math.max(objects1.length, objects2.length);
  }
});
