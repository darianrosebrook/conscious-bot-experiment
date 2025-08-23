/**
 * Performance Regression Tests for World Module
 *
 * These tests ensure that the World module maintains performance
 * characteristics and prevents regression in critical operations.
 *
 * @author @darianrosebrook
 */

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
  PathPlanningRequest,
  VisualQuery,
  ActionRequest,
} from '../types';

interface PerformanceBenchmark {
  operation: string;
  maxLatency: number; // milliseconds
  maxMemoryIncrease: number; // bytes
  minThroughput?: number; // operations per second
}

interface BenchmarkResult {
  operation: string;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  memoryIncrease: number;
  throughput: number;
  passed: boolean;
  issues: string[];
}

describe('World Module Performance Regression Tests', () => {
  let raycastEngine: RaycastEngine;
  let navigationSystem: NavigationSystem;
  let perceptionSystem: PerceptionIntegration;
  let sensorimotorSystem: SensorimotorSystem;

  const performanceBenchmarks: PerformanceBenchmark[] = [
    { operation: 'raycast_single', maxLatency: 2, maxMemoryIncrease: 1024 },
    {
      operation: 'raycast_cone_64rays',
      maxLatency: 8,
      maxMemoryIncrease: 8192,
    },
    {
      operation: 'raycast_grid_16x16',
      maxLatency: 15,
      maxMemoryIncrease: 16384,
    },
    {
      operation: 'pathfind_short_distance',
      maxLatency: 10,
      maxMemoryIncrease: 4096,
    },
    {
      operation: 'pathfind_medium_distance',
      maxLatency: 35,
      maxMemoryIncrease: 16384,
    },
    {
      operation: 'pathfind_long_distance',
      maxLatency: 100,
      maxMemoryIncrease: 65536,
    },
    {
      operation: 'perception_basic_field',
      maxLatency: 12,
      maxMemoryIncrease: 8192,
    },
    {
      operation: 'perception_complex_scene',
      maxLatency: 30,
      maxMemoryIncrease: 32768,
    },
    {
      operation: 'action_execution_simple',
      maxLatency: 5,
      maxMemoryIncrease: 2048,
    },
    {
      operation: 'action_execution_complex',
      maxLatency: 20,
      maxMemoryIncrease: 8192,
    },
  ];

  beforeAll(() => {
    // Initialize systems with performance-optimized configs
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
    navigationSystem = new NavigationSystem(navigationConfig);
    perceptionSystem = new PerceptionIntegration(
      perceptionConfig,
      () => ({
        position: { x: 0, y: 64, z: 0 },
        orientation: { yaw: 0, pitch: 0 },
        headDirection: { x: 0, y: 0, z: -1 },
        eyeHeight: 1.62,
      }),
      raycastEngine as any
    );
    sensorimotorSystem = new SensorimotorSystem(sensorimotorConfig, {} as any);

    // Setup a basic test world
    setupTestWorld();
  });

  afterAll(() => {
    raycastEngine?.dispose();
    navigationSystem?.dispose();
    perceptionSystem?.dispose();
    sensorimotorSystem?.dispose();
  });

  function setupTestWorld(): void {
    // Create a structured test environment
    const worldBlocks = [];

    // Ground plane
    for (let x = -50; x <= 50; x++) {
      for (let z = -50; z <= 50; z++) {
        worldBlocks.push({
          position: { x, y: 63, z },
          blockType: 'minecraft:grass_block',
        });
      }
    }

    // Add some structures for testing
    // Simple building
    for (let x = 10; x <= 15; x++) {
      for (let z = 10; z <= 15; z++) {
        for (let y = 64; y <= 67; y++) {
          if (x === 10 || x === 15 || z === 10 || z === 15 || y === 67) {
            worldBlocks.push({
              position: { x, y, z },
              blockType:
                y === 67 ? 'minecraft:oak_planks' : 'minecraft:cobblestone',
            });
          }
        }
      }
    }

    // Maze-like structure
    for (let i = 0; i < 20; i++) {
      const x = -30 + (i % 10) * 2;
      const z = -30 + Math.floor(i / 10) * 4;
      for (let y = 64; y <= 66; y++) {
        worldBlocks.push({
          position: { x, y, z },
          blockType: 'minecraft:stone',
        });
      }
    }

    raycastEngine.updateWorld(worldBlocks);
  }

  async function benchmarkOperation(
    operationName: string,
    operation: () => Promise<any> | any,
    iterations: number = 50
  ): Promise<BenchmarkResult> {
    const latencies: number[] = [];
    let memoryBefore = process.memoryUsage().heapUsed;

    // Warm up
    for (let i = 0; i < 5; i++) {
      await operation();
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    memoryBefore = process.memoryUsage().heapUsed;
    const startTime = Date.now();

    // Actual benchmarking
    for (let i = 0; i < iterations; i++) {
      const opStart = performance.now();
      await operation();
      const opEnd = performance.now();
      latencies.push(opEnd - opStart);
    }

    const endTime = Date.now();
    const memoryAfter = process.memoryUsage().heapUsed;

    // Calculate statistics
    latencies.sort((a, b) => a - b);
    const averageLatency =
      latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);
    const p95Latency = latencies[p95Index];
    const p99Latency = latencies[p99Index];
    const memoryIncrease = memoryAfter - memoryBefore;
    const throughput = iterations / ((endTime - startTime) / 1000);

    // Find performance benchmark
    const benchmark = performanceBenchmarks.find(
      (b) => b.operation === operationName
    );
    const issues: string[] = [];
    let passed = true;

    if (benchmark) {
      if (p95Latency > benchmark.maxLatency) {
        issues.push(
          `P95 latency ${p95Latency.toFixed(2)}ms exceeds limit ${benchmark.maxLatency}ms`
        );
        passed = false;
      }
      if (memoryIncrease > benchmark.maxMemoryIncrease) {
        issues.push(
          `Memory increase ${memoryIncrease} bytes exceeds limit ${benchmark.maxMemoryIncrease} bytes`
        );
        passed = false;
      }
      if (benchmark.minThroughput && throughput < benchmark.minThroughput) {
        issues.push(
          `Throughput ${throughput.toFixed(2)} ops/sec below minimum ${benchmark.minThroughput} ops/sec`
        );
        passed = false;
      }
    }

    return {
      operation: operationName,
      averageLatency,
      p95Latency,
      p99Latency,
      memoryIncrease,
      throughput,
      passed,
      issues,
    };
  }

  describe('Raycast Performance', () => {
    test('single ray performance meets requirements', async () => {
      const result = await benchmarkOperation('raycast_single', () =>
        raycastEngine.castRay({ x: 0, y: 64, z: 0 }, { x: 0, y: 0, z: -1 }, 32)
      );

      expect(result.passed).toBe(true);
      if (!result.passed) {
        console.warn(
          `Single ray performance issues: ${result.issues.join(', ')}`
        );
      }
    });

    test('cone casting performance meets requirements', async () => {
      const result = await benchmarkOperation('raycast_cone_64rays', () =>
        raycastEngine.castCone(
          { x: 0, y: 64, z: 0 },
          { x: 0, y: 0, z: -1 },
          Math.PI / 4, // 45 degrees
          64, // 64 rays
          32
        )
      );

      expect(result.passed).toBe(true);
      if (!result.passed) {
        console.warn(
          `Cone casting performance issues: ${result.issues.join(', ')}`
        );
      }
    });

    test('grid casting performance meets requirements', async () => {
      const result = await benchmarkOperation('raycast_grid_16x16', () =>
        raycastEngine.castGrid(
          { x: 0, y: 64, z: 0 },
          { x: 0, y: 0, z: -1 },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
          16,
          16, // 16x16 grid = 256 rays
          32
        )
      );

      expect(result.passed).toBe(true);
      if (!result.passed) {
        console.warn(
          `Grid casting performance issues: ${result.issues.join(', ')}`
        );
      }
    });
  });

  describe('Navigation Performance', () => {
    test('short distance pathfinding performance', async () => {
      const request: PathPlanningRequest = {
        start: { x: 0, y: 64, z: 0 },
        goal: { x: 5, y: 64, z: 5 },
        urgency: 'normal',
        maxDistance: 200,
        allowPartialPath: true,
        avoidHazards: true,
        timeout: 50,
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

      const result = await benchmarkOperation('pathfind_short_distance', () =>
        navigationSystem.planPath(request)
      );

      expect(result.passed).toBe(true);
      if (!result.passed) {
        console.warn(
          `Short pathfinding performance issues: ${result.issues.join(', ')}`
        );
      }
    });

    test('medium distance pathfinding performance', async () => {
      const request: PathPlanningRequest = {
        start: { x: 0, y: 64, z: 0 },
        goal: { x: 25, y: 64, z: 25 },
        urgency: 'normal',
        maxDistance: 200,
        allowPartialPath: true,
        avoidHazards: true,
        timeout: 50,
        preferences: {
          preferLit: true,
          avoidMobs: false,
          minimizeVertical: false,
          preferSolid: true,
          avoidWater: false,
          preferLighting: false,
          maxDetour: 5.0,
        },
      };

      const result = await benchmarkOperation('pathfind_medium_distance', () =>
        navigationSystem.planPath(request)
      );

      expect(result.passed).toBe(true);
      if (!result.passed) {
        console.warn(
          `Medium pathfinding performance issues: ${result.issues.join(', ')}`
        );
      }
    });

    test('long distance pathfinding performance', async () => {
      const request: PathPlanningRequest = {
        start: { x: 0, y: 64, z: 0 },
        goal: { x: 45, y: 64, z: 45 },
        urgency: 'normal',
        maxDistance: 200,
        allowPartialPath: true,
        avoidHazards: true,
        timeout: 50,
        preferences: {
          preferLit: true,
          avoidMobs: false,
          minimizeVertical: false,
          preferSolid: true,
          avoidWater: false,
          preferLighting: false,
          maxDetour: 10.0,
        },
      };

      const result = await benchmarkOperation(
        'pathfind_long_distance',
        () => navigationSystem.planPath(request),
        20 // Fewer iterations for expensive operations
      );

      expect(result.passed).toBe(true);
      if (!result.passed) {
        console.warn(
          `Long pathfinding performance issues: ${result.issues.join(', ')}`
        );
      }
    });
  });

  describe('Perception Performance', () => {
    test('basic visual field processing performance', async () => {
      const query: VisualQuery = {
        position: { x: 0, y: 64, z: 0 },
        radius: 32,
        observerPosition: { x: 0, y: 64, z: 0 },
        maxDistance: 32,
      };

      const result = await benchmarkOperation('perception_basic_field', () =>
        perceptionSystem.processVisualField(query)
      );

      expect(result.passed).toBe(true);
      if (!result.passed) {
        console.warn(
          `Basic perception performance issues: ${result.issues.join(', ')}`
        );
      }
    });

    test('complex scene processing performance', async () => {
      const query: VisualQuery = {
        position: { x: 12, y: 65, z: 12 }, // Inside the test building
        radius: 64,
        observerPosition: { x: 12, y: 65, z: 12 },
        maxDistance: 64,
      };

      const result = await benchmarkOperation('perception_complex_scene', () =>
        perceptionSystem.processVisualField(query)
      );

      expect(result.passed).toBe(true);
      if (!result.passed) {
        console.warn(
          `Complex perception performance issues: ${result.issues.join(', ')}`
        );
      }
    });
  });

  describe('Action Execution Performance', () => {
    test('simple action execution performance', async () => {
      const actionRequest: ActionRequest = {
        id: 'test-simple-move',
        type: 'move_forward',
        parameters: {
          direction: { x: 1, y: 0, z: 0 },
          speed: 0.5,
          duration: 100,
        },
        priority: 1,
        requiredPrecision: 0.5,
        timeout: 1000,
        feedback: true,
      };

      const result = await benchmarkOperation('action_execution_simple', () =>
        sensorimotorSystem.executeAction(actionRequest, {} as any)
      );

      expect(result.passed).toBe(true);
      if (!result.passed) {
        console.warn(
          `Simple action performance issues: ${result.issues.join(', ')}`
        );
      }
    });

    test('complex action sequence performance', async () => {
      const actionRequest: ActionRequest = {
        id: 'test-composite-action',
        type: 'compound_action',
        parameters: {
          sequence: [
            { type: 'turn', angle: 90 },
            { type: 'move', direction: { x: 0, y: 0, z: -1 }, distance: 3 },
            { type: 'look', target: { x: 10, y: 64, z: 10 } },
            { type: 'interact', target: { x: 10, y: 64, z: 10 } },
          ],
        },
        priority: 1,
        requiredPrecision: 0.5,
        timeout: 5000,
        feedback: true,
      };

      const result = await benchmarkOperation(
        'action_execution_complex',
        () => sensorimotorSystem.executeAction(actionRequest, {} as any),
        25 // Fewer iterations for complex operations
      );

      expect(result.passed).toBe(true);
      if (!result.passed) {
        console.warn(
          `Complex action performance issues: ${result.issues.join(', ')}`
        );
      }
    });
  });

  describe('Memory Usage Regression', () => {
    test('sustained operation memory usage', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Simulate sustained operation for 10 seconds
      const operations = [];
      for (let i = 0; i < 100; i++) {
        operations.push(
          raycastEngine.castRay(
            { x: 0, y: 64, z: 0 },
            { x: 1, y: 0, z: 0 },
            32
          ),
          navigationSystem.planPath({
            start: { x: i % 10, y: 64, z: 0 },
            goal: { x: (i + 5) % 10, y: 64, z: 5 },
            urgency: 'normal',
            maxDistance: 200,
            allowPartialPath: true,
            avoidHazards: true,
            timeout: 50,
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
          perceptionSystem.processVisualField({
            position: { x: i % 5, y: 64, z: 0 },
            radius: 32,
            observerPosition: { x: i % 5, y: 64, z: 0 },
            maxDistance: 32,
          })
        );
      }

      await Promise.all(operations);

      // Force garbage collection
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (under 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);

      if (memoryIncrease > 50 * 1024 * 1024) {
        console.warn(
          `High memory usage detected: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB increase`
        );
      }
    });

    test('memory leak detection in repeated operations', async () => {
      const memoryMeasurements: number[] = [];

      // Measure memory at intervals during repeated operations
      for (let iteration = 0; iteration < 10; iteration++) {
        // Perform a batch of operations
        for (let i = 0; i < 20; i++) {
          await raycastEngine.castRay(
            { x: Math.random() * 10, y: 64, z: Math.random() * 10 },
            { x: 0, y: 0, z: -1 },
            32
          );
        }

        // Force garbage collection and measure
        if (global.gc) {
          global.gc();
        }
        memoryMeasurements.push(process.memoryUsage().heapUsed);

        // Small delay to allow cleanup
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Check for consistent memory growth (indicating leak)
      const growthRate = (memoryMeasurements[9] - memoryMeasurements[0]) / 9;
      const avgGrowthPerIteration = growthRate / (20 * 1024); // KB per operation batch

      // Growth should be minimal (less than 100KB per batch)
      expect(avgGrowthPerIteration).toBeLessThan(100);

      if (avgGrowthPerIteration > 50) {
        console.warn(
          `Potential memory leak detected: ${avgGrowthPerIteration.toFixed(2)}KB growth per batch`
        );
      }
    });
  });

  describe('Comprehensive Performance Report', () => {
    test('generate performance baseline report', async () => {
      const performanceReport: BenchmarkResult[] = [];

      // Run all benchmark operations
      for (const benchmark of performanceBenchmarks) {
        let operation: () => Promise<any> | any;

        switch (benchmark.operation) {
          case 'raycast_single':
            operation = () =>
              raycastEngine.castRay(
                { x: 0, y: 64, z: 0 },
                { x: 0, y: 0, z: -1 },
                32
              );
            break;
          case 'raycast_cone_64rays':
            operation = () =>
              raycastEngine.castCone(
                { x: 0, y: 64, z: 0 },
                { x: 0, y: 0, z: -1 },
                Math.PI / 4,
                64,
                32
              );
            break;
          case 'raycast_grid_16x16':
            operation = () =>
              raycastEngine.castGrid(
                { x: 0, y: 64, z: 0 },
                { x: 0, y: 0, z: -1 },
                { x: 1, y: 0, z: 0 },
                { x: 0, y: 1, z: 0 },
                16,
                16,
                32
              );
            break;
          case 'pathfind_short_distance':
            operation = () =>
              navigationSystem.planPath({
                start: { x: 0, y: 64, z: 0 },
                goal: { x: 5, y: 64, z: 5 },
                urgency: 'normal',
                maxDistance: 200,
                allowPartialPath: true,
                avoidHazards: true,
                timeout: 50,
                preferences: {
                  preferLit: true,
                  avoidMobs: false,
                  minimizeVertical: false,
                  preferSolid: true,
                  avoidWater: false,
                  preferLighting: false,
                  maxDetour: 2.0,
                },
              });
            break;
          // Add other operations as needed...
          default:
            continue;
        }

        const result = await benchmarkOperation(
          benchmark.operation,
          operation,
          30
        );
        performanceReport.push(result);
      }

      // Generate summary
      const passedBenchmarks = performanceReport.filter((r) => r.passed).length;
      const totalBenchmarks = performanceReport.length;

      console.log(`\n=== World Module Performance Report ===`);
      console.log(`Benchmarks: ${passedBenchmarks}/${totalBenchmarks} passed`);
      console.log(`\nDetailed Results:`);

      performanceReport.forEach((result) => {
        console.log(`${result.operation}:`);
        console.log(`  Status: ${result.passed ? 'PASS' : 'FAIL'}`);
        console.log(`  Avg Latency: ${result.averageLatency.toFixed(2)}ms`);
        console.log(`  P95 Latency: ${result.p95Latency.toFixed(2)}ms`);
        console.log(`  Memory: ${(result.memoryIncrease / 1024).toFixed(2)}KB`);
        console.log(`  Throughput: ${result.throughput.toFixed(2)} ops/sec`);
        if (result.issues.length > 0) {
          console.log(`  Issues: ${result.issues.join(', ')}`);
        }
        console.log('');
      });

      // Overall test should pass if majority of benchmarks pass
      expect(passedBenchmarks / totalBenchmarks).toBeGreaterThan(0.8);
    });
  });
});
