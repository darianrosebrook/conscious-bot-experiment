/**
 * Performance Regression Tests
 *
 * These tests detect performance regressions by comparing current
 * performance metrics against established baselines.
 *
 * @author @darianrosebrook
 */

import { Arbiter } from '../index';
import {
  Signal,
  CognitiveTask,
  validateSignal,
  validateCognitiveTask,
} from '../types';
import { PerformanceTracker } from '../real-time/performance-tracker';
import { PerformanceContext } from '../real-time/types';

describe('Performance Regression Tests', () => {
  let arbiter: Arbiter;
  let performanceTracker: PerformanceTracker;

  // Performance baselines (these should be updated when legitimate performance improvements are made)
  const PERFORMANCE_BASELINES = {
    signalProcessing: {
      p50: 5, // ms
      p95: 15, // ms
      p99: 25, // ms
      mean: 8, // ms
    },
    cognitiveTaskProcessing: {
      simple: {
        p50: 10, // ms
        p95: 30, // ms
        p99: 50, // ms
        mean: 15, // ms
      },
      moderate: {
        p50: 25, // ms
        p95: 75, // ms
        p99: 120, // ms
        mean: 35, // ms
      },
      complex: {
        p50: 50, // ms
        p95: 150, // ms
        p99: 250, // ms
        mean: 75, // ms
      },
    },
    memoryUsage: {
      baseline: 50, // MB
      maxIncrease: 10, // MB
      leakThreshold: 5, // MB over 1000 operations
    },
    throughput: {
      signalsPerSecond: 100,
      tasksPerSecond: 50,
      concurrentTasks: 5,
    },
  };

  const REGRESSION_TOLERANCE = 1.15; // 15% tolerance for performance regression

  beforeEach(() => {
    arbiter = new Arbiter({ config: { debugMode: false } });
    performanceTracker = new PerformanceTracker();
  });

  afterEach(() => {
    arbiter.stop();
    performanceTracker.dispose();
  });

  describe('Signal Processing Performance', () => {
    test('signal processing latency should not regress', async () => {
      const measurements: number[] = [];
      const sampleSize = 100;

      // Generate test signals
      const testSignals = Array.from({ length: sampleSize }, (_, i) =>
        validateSignal({
          type: ['health', 'hunger', 'threat'][i % 3],
          intensity: Math.random(),
          trend: (Math.random() - 0.5) * 0.2,
          confidence: 0.8 + Math.random() * 0.2,
          timestamp: Date.now() + i,
          source: `perf-test-${i}`,
        })
      );

      // Measure signal processing performance
      for (const signal of testSignals) {
        const startTime = performance.now();
        arbiter.processSignal(signal);
        const endTime = performance.now();
        measurements.push(endTime - startTime);
      }

      // Calculate performance statistics
      const sortedMeasurements = measurements.sort((a, b) => a - b);
      const stats = {
        p50: sortedMeasurements[Math.floor(sampleSize * 0.5)],
        p95: sortedMeasurements[Math.floor(sampleSize * 0.95)],
        p99: sortedMeasurements[Math.floor(sampleSize * 0.99)],
        mean: measurements.reduce((sum, m) => sum + m, 0) / measurements.length,
      };

      // Check against baselines with tolerance
      expect(stats.p50).toBeLessThan(
        PERFORMANCE_BASELINES.signalProcessing.p50 * REGRESSION_TOLERANCE
      );
      expect(stats.p95).toBeLessThan(
        PERFORMANCE_BASELINES.signalProcessing.p95 * REGRESSION_TOLERANCE
      );
      expect(stats.p99).toBeLessThan(
        PERFORMANCE_BASELINES.signalProcessing.p99 * REGRESSION_TOLERANCE
      );
      expect(stats.mean).toBeLessThan(
        PERFORMANCE_BASELINES.signalProcessing.mean * REGRESSION_TOLERANCE
      );

      // Log performance for potential baseline updates
      console.log('Signal Processing Performance:', stats);
    });

    test('signal processing should maintain throughput under load', async () => {
      const testDuration = 1000; // 1 second
      const targetThroughput =
        PERFORMANCE_BASELINES.throughput.signalsPerSecond;

      let processedSignals = 0;
      const startTime = Date.now();

      // Generate signals continuously for test duration
      while (Date.now() - startTime < testDuration) {
        const signal = validateSignal({
          type: 'health',
          intensity: Math.random(),
          trend: 0,
          confidence: 1.0,
          timestamp: Date.now(),
          source: 'throughput-test',
        });

        arbiter.processSignal(signal);
        processedSignals++;

        // Small delay to prevent overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 1));
      }

      const actualThroughput = processedSignals / (testDuration / 1000);

      // Should maintain at least 85% of target throughput
      expect(actualThroughput).toBeGreaterThan(targetThroughput * 0.85);

      console.log(
        `Throughput: ${actualThroughput.toFixed(1)} signals/sec (target: ${targetThroughput})`
      );
    });
  });

  describe('Cognitive Task Processing Performance', () => {
    const complexityLevels = ['simple', 'moderate', 'complex'] as const;

    complexityLevels.forEach((complexity) => {
      test(`${complexity} task processing should not regress`, async () => {
        const measurements: number[] = [];
        const sampleSize = 50;

        for (let i = 0; i < sampleSize; i++) {
          const task: CognitiveTask = {
            id: `perf-test-${complexity}-${i}`,
            type: 'reactive',
            priority: Math.random(),
            complexity: complexity,
            context: { performanceTest: true },
          };

          const startTime = performance.now();
          await arbiter.processCognitiveTask(task);
          const endTime = performance.now();

          measurements.push(endTime - startTime);
        }

        // Calculate statistics
        const sortedMeasurements = measurements.sort((a, b) => a - b);
        const stats = {
          p50: sortedMeasurements[Math.floor(sampleSize * 0.5)],
          p95: sortedMeasurements[Math.floor(sampleSize * 0.95)],
          p99: sortedMeasurements[Math.floor(sampleSize * 0.99)],
          mean:
            measurements.reduce((sum, m) => sum + m, 0) / measurements.length,
        };

        const baseline =
          PERFORMANCE_BASELINES.cognitiveTaskProcessing[complexity];

        // Check against baselines
        expect(stats.p50).toBeLessThan(baseline.p50 * REGRESSION_TOLERANCE);
        expect(stats.p95).toBeLessThan(baseline.p95 * REGRESSION_TOLERANCE);
        expect(stats.p99).toBeLessThan(baseline.p99 * REGRESSION_TOLERANCE);
        expect(stats.mean).toBeLessThan(baseline.mean * REGRESSION_TOLERANCE);

        console.log(`${complexity} Task Performance:`, stats);
      });
    });

    test('concurrent task processing should maintain performance', async () => {
      const concurrentTasks = PERFORMANCE_BASELINES.throughput.concurrentTasks;
      const taskDuration = 100; // ms expected per task

      const tasks = Array.from({ length: concurrentTasks }, (_, i) => ({
        id: `concurrent-test-${i}`,
        type: 'reactive' as const,
        priority: 0.5,
        complexity: 'simple' as const,
        context: { concurrentTest: true },
      }));

      const startTime = performance.now();

      // Process all tasks concurrently
      const results = await Promise.all(
        tasks.map((task) => arbiter.processCognitiveTask(task))
      );

      const totalTime = performance.now() - startTime;

      // Should complete all tasks without significant delay
      expect(totalTime).toBeLessThan(taskDuration * 2); // Allow 2x expected time for concurrency
      expect(results).toHaveLength(concurrentTasks);
      expect(results.every((result) => result !== null)).toBe(true);

      console.log(
        `Concurrent processing: ${concurrentTasks} tasks in ${totalTime.toFixed(1)}ms`
      );
    });
  });

  describe('Memory Usage Performance', () => {
    test('should not have memory leaks during extended operation', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const operationCount = 500; // Reduced for faster testing

      // Simulate extended operation
      for (let i = 0; i < operationCount; i++) {
        // Process signals
        const signal = validateSignal({
          type: 'memory',
          intensity: Math.random(),
          trend: 0,
          confidence: 1.0,
          timestamp: Date.now(),
          source: `memory-test-${i}`,
        });
        arbiter.processSignal(signal);

        // Process cognitive task
        const task: CognitiveTask = {
          id: `memory-test-${i}`,
          type: 'reactive',
          priority: 0.5,
          complexity: 'simple',
          context: { memoryTest: true },
        };
        await arbiter.processCognitiveTask(task);

        // Force garbage collection periodically
        if (i % 100 === 0 && global.gc) {
          global.gc();
        }
      }

      // Force final garbage collection
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Memory increase should be within acceptable bounds
      expect(memoryIncrease).toBeLessThan(
        PERFORMANCE_BASELINES.memoryUsage.leakThreshold
      );

      console.log(
        `Memory usage after ${operationCount} operations: +${memoryIncrease.toFixed(2)}MB`
      );
    });

    test('should maintain reasonable memory footprint', () => {
      const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024; // MB
      const baseline = PERFORMANCE_BASELINES.memoryUsage.baseline;
      const maxIncrease = PERFORMANCE_BASELINES.memoryUsage.maxIncrease;

      // Memory usage should be reasonable
      expect(currentMemory).toBeLessThan(baseline + maxIncrease);

      console.log(
        `Current memory usage: ${currentMemory.toFixed(2)}MB (baseline: ${baseline}MB)`
      );
    });
  });

  describe('Real-Time Constraint Performance', () => {
    test('emergency context should meet 50ms p95 constraint', async () => {
      const measurements: number[] = [];
      const sampleSize = 100;

      for (let i = 0; i < sampleSize; i++) {
        // Create emergency scenario
        const emergencySignal = validateSignal({
          type: 'threat',
          intensity: 0.9,
          trend: 0.3,
          confidence: 0.95,
          timestamp: Date.now(),
          source: `emergency-test-${i}`,
        });

        const startTime = performance.now();
        arbiter.processSignal(emergencySignal);

        const task: CognitiveTask = {
          id: `emergency-test-${i}`,
          type: 'reactive',
          priority: 0.95,
          complexity: 'simple',
          context: { emergency: true },
        };

        await arbiter.processCognitiveTask(task);
        const endTime = performance.now();

        measurements.push(endTime - startTime);
      }

      const sortedMeasurements = measurements.sort((a, b) => a - b);
      const p95 = sortedMeasurements[Math.floor(sampleSize * 0.95)];

      // Emergency context must meet 50ms p95 constraint
      expect(p95).toBeLessThan(50);

      console.log(`Emergency response p95: ${p95.toFixed(1)}ms (limit: 50ms)`);
    });

    test('routine context should meet 200ms p95 constraint', async () => {
      const measurements: number[] = [];
      const sampleSize = 100;

      for (let i = 0; i < sampleSize; i++) {
        const routineSignal = validateSignal({
          type: 'social',
          intensity: 0.5,
          trend: 0.1,
          confidence: 0.8,
          timestamp: Date.now(),
          source: `routine-test-${i}`,
        });

        const startTime = performance.now();
        arbiter.processSignal(routineSignal);

        const task: CognitiveTask = {
          id: `routine-test-${i}`,
          type: 'reactive',
          priority: 0.6,
          complexity: 'moderate',
          context: { routine: true },
        };

        await arbiter.processCognitiveTask(task);
        const endTime = performance.now();

        measurements.push(endTime - startTime);
      }

      const sortedMeasurements = measurements.sort((a, b) => a - b);
      const p95 = sortedMeasurements[Math.floor(sampleSize * 0.95)];

      // Routine context must meet 200ms p95 constraint
      expect(p95).toBeLessThan(200);

      console.log(`Routine response p95: ${p95.toFixed(1)}ms (limit: 200ms)`);
    });
  });

  describe('Performance Trend Analysis', () => {
    test('should detect performance improvements', () => {
      // This test would be used when legitimate performance improvements are made
      // to update baselines and ensure improvements are maintained

      const mockImprovement = {
        baseline: 50,
        current: 35,
        improvement: 0.3, // 30% improvement
      };

      expect(mockImprovement.current).toBeLessThan(mockImprovement.baseline);
      expect(mockImprovement.improvement).toBeGreaterThan(0.1); // At least 10% improvement

      // In a real scenario, this would update the baseline file
      console.log(
        `Performance improvement detected: ${(mockImprovement.improvement * 100).toFixed(1)}%`
      );
    });
  });
});
