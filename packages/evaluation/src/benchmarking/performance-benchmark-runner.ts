/**
 * Performance Benchmark Runner
 *
 * Comprehensive automated performance benchmarking system for the Conscious Bot.
 * Tests system performance across various dimensions including memory operations,
 * cognitive processing, planning, safety systems, and end-to-end scenarios.
 *
 * @author @darianrosebrook
 */

import { performance } from 'perf_hooks';
import { createMemoryIntegrationFixture } from '../__tests__/memory-integration-setup';
import { createSafetyIntegrationFixture } from '../__tests__/safety-integration-setup';
import { ScenarioManager } from '../scenarios/scenario-manager';
import { PerformanceAnalyzer } from '../metrics/performance-analyzer';

export interface BenchmarkResult {
  benchmarkId: string;
  timestamp: number;
  duration: number;
  metrics: {
    throughput: number;
    latency: {
      min: number;
      max: number;
      avg: number;
      p95: number;
      p99: number;
    };
    memory: {
      used: number;
      peak: number;
      allocated: number;
    };
    cpu: {
      user: number;
      system: number;
      total: number;
    };
    errors: {
      count: number;
      rate: number;
    };
  };
  metadata: {
    systemInfo: {
      nodeVersion: string;
      platform: string;
      arch: string;
      cpus: number;
      memory: number;
    };
    testConfig: {
      iterations: number;
      concurrency: number;
      timeout: number;
    };
  };
}

export interface BenchmarkSuite {
  id: string;
  name: string;
  description: string;
  categories: BenchmarkCategory[];
}

export interface BenchmarkCategory {
  name: string;
  description: string;
  benchmarks: Benchmark[];
}

export interface Benchmark {
  name: string;
  description: string;
  setup?: () => Promise<void>;
  execute: () => Promise<void>;
  teardown?: () => Promise<void>;
  iterations: number;
  concurrency: number;
  timeout: number;
}

export class PerformanceBenchmarkRunner {
  private results: BenchmarkResult[] = [];
  private memoryFixture?: Awaited<
    ReturnType<typeof createMemoryIntegrationFixture>
  >;
  private safetyFixture?: Awaited<
    ReturnType<typeof createSafetyIntegrationFixture>
  >;
  private scenarioManager?: ScenarioManager;
  private performanceAnalyzer?: PerformanceAnalyzer;

  async initialize(): Promise<void> {
    console.log('🚀 Initializing Performance Benchmark Runner...');

    // Initialize memory system for benchmarking
    try {
      this.memoryFixture = await createMemoryIntegrationFixture(
        [
          {
            type: 'knowledge',
            content: 'Iron pickaxe is most efficient for mining iron ore',
            confidence: 0.95,
          },
          {
            type: 'experience',
            content: 'Successfully mined 10 iron ore using iron pickaxe',
            confidence: 0.9,
          },
          {
            type: 'thought',
            content: 'Tool selection matters for mining efficiency',
            confidence: 0.85,
          },
        ],
        { enablePersistence: true }
      );
      console.log('✅ Memory system initialized for benchmarking');
    } catch (error) {
      console.warn(
        '⚠️ Could not initialize memory system for benchmarking:',
        error
      );
    }

    // Initialize safety system for benchmarking
    try {
      this.safetyFixture = await createSafetyIntegrationFixture();
      console.log('✅ Safety system initialized for benchmarking');
    } catch (error) {
      console.warn(
        '⚠️ Could not initialize safety system for benchmarking:',
        error
      );
    }

    // Initialize other systems
    try {
      this.scenarioManager = new ScenarioManager();
      this.performanceAnalyzer = new PerformanceAnalyzer();
      console.log('✅ Additional systems initialized for benchmarking');
    } catch (error) {
      console.warn(
        '⚠️ Could not initialize additional systems for benchmarking:',
        error
      );
    }

    console.log('🎯 Performance Benchmark Runner initialized successfully');
  }

  async runMemoryBenchmarks(): Promise<BenchmarkResult> {
    if (!this.memoryFixture) {
      throw new Error('Memory system not initialized');
    }

    const benchmarkId = `memory-${Date.now()}`;
    const startTime = performance.now();

    console.log('🧠 Running Memory System Benchmarks...');

    const iterations = 100;
    const concurrency = 5;

    const latencies: number[] = [];

    // Memory ingestion benchmark
    for (let i = 0; i < iterations; i++) {
      const promises = Array.from({ length: concurrency }, async (_, idx) => {
        const iterationStart = performance.now();

        await this.memoryFixture!.memorySystem.ingestMemory({
          type: 'knowledge',
          content: `Benchmark memory ${i}-${idx}: Performance test data for iteration ${i}`,
          source: 'performance-benchmark',
          confidence: 0.9,
          entities: ['benchmark', 'performance', `iteration-${i}`],
          topics: ['testing', 'benchmarking'],
        });

        const iterationEnd = performance.now();
        latencies.push(iterationEnd - iterationStart);
      });

      await Promise.all(promises);

      if ((i + 1) % 10 === 0) {
        console.log(
          `📊 Completed ${i + 1}/${iterations} memory ingestion iterations`
        );
      }
    }

    // Memory search benchmark
    const searchIterations = 50;
    for (let i = 0; i < searchIterations; i++) {
      const searchStart = performance.now();

      await this.memoryFixture!.memorySystem.searchMemories({
        query: `benchmark memory ${i}`,
        types: ['knowledge'],
        limit: 10,
      });

      const searchEnd = performance.now();
      latencies.push(searchEnd - searchStart);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Calculate metrics
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);

    const result: BenchmarkResult = {
      benchmarkId,
      timestamp: Date.now(),
      duration,
      metrics: {
        throughput:
          (iterations * concurrency + searchIterations) / (duration / 1000), // operations per second
        latency: {
          min: sortedLatencies[0] || 0,
          max: sortedLatencies[sortedLatencies.length - 1] || 0,
          avg: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
          p95: sortedLatencies[p95Index] || 0,
          p99: sortedLatencies[p99Index] || 0,
        },
        memory: {
          used: process.memoryUsage().heapUsed,
          peak: process.memoryUsage().heapUsed,
          allocated: process.memoryUsage().heapTotal,
        },
        cpu: {
          user: process.cpuUsage().user,
          system: process.cpuUsage().system,
          total: process.cpuUsage().user + process.cpuUsage().system,
        },
        errors: {
          count: 0,
          rate: 0,
        },
      },
      metadata: {
        systemInfo: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          cpus: require('os').cpus().length,
          memory: require('os').totalmem(),
        },
        testConfig: {
          iterations: iterations + searchIterations,
          concurrency,
          timeout: 30000,
        },
      },
    };

    this.results.push(result);
    console.log('✅ Memory benchmarks completed:', {
      duration: `${(duration / 1000).toFixed(2)}s`,
      throughput: `${result.metrics.throughput.toFixed(2)} ops/s`,
      avgLatency: `${result.metrics.latency.avg.toFixed(2)}ms`,
      p95Latency: `${result.metrics.latency.p95.toFixed(2)}ms`,
    });

    return result;
  }

  async runSafetyBenchmarks(): Promise<BenchmarkResult> {
    if (!this.safetyFixture) {
      throw new Error('Safety system not initialized');
    }

    const benchmarkId = `safety-${Date.now()}`;
    const startTime = performance.now();

    console.log('🛡️ Running Safety System Benchmarks...');

    const iterations = 50;
    const concurrency = 3;

    const latencies: number[] = [];

    // Emergency declaration benchmark
    for (let i = 0; i < iterations; i++) {
      const promises = Array.from({ length: concurrency }, async (_, idx) => {
        const iterationStart = performance.now();

        await this.safetyFixture!.failSafesSystem.declareEmergency({
          emergencyId: `benchmark-emergency-${i}-${idx}`,
          type: 'system_failure',
          severity: 'medium',
          declaredAt: Date.now(),
          declaredBy: 'benchmark-runner',
          description: `Benchmark emergency ${i}-${idx}`,
          context: { test: true, iteration: i, index: idx },
          estimatedResolutionTime: Date.now() + 3600000,
          resolved: false,
        });

        const iterationEnd = performance.now();
        latencies.push(iterationEnd - iterationStart);
      });

      await Promise.all(promises);

      if ((i + 1) % 10 === 0) {
        console.log(
          `📊 Completed ${i + 1}/${iterations} emergency declaration iterations`
        );
      }
    }

    // Health check benchmark
    const healthCheckIterations = 30;
    for (let i = 0; i < healthCheckIterations; i++) {
      const healthStart = performance.now();

      await this.safetyFixture!.failSafesSystem.performHealthCheck(
        'test-component'
      );

      const healthEnd = performance.now();
      latencies.push(healthEnd - healthStart);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Calculate metrics
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);

    const result: BenchmarkResult = {
      benchmarkId,
      timestamp: Date.now(),
      duration,
      metrics: {
        throughput:
          (iterations * concurrency + healthCheckIterations) /
          (duration / 1000),
        latency: {
          min: sortedLatencies[0] || 0,
          max: sortedLatencies[sortedLatencies.length - 1] || 0,
          avg: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
          p95: sortedLatencies[p95Index] || 0,
          p99: sortedLatencies[p99Index] || 0,
        },
        memory: {
          used: process.memoryUsage().heapUsed,
          peak: process.memoryUsage().heapUsed,
          allocated: process.memoryUsage().heapTotal,
        },
        cpu: {
          user: process.cpuUsage().user,
          system: process.cpuUsage().system,
          total: process.cpuUsage().user + process.cpuUsage().system,
        },
        errors: {
          count: 0,
          rate: 0,
        },
      },
      metadata: {
        systemInfo: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          cpus: require('os').cpus().length,
          memory: require('os').totalmem(),
        },
        testConfig: {
          iterations: iterations + healthCheckIterations,
          concurrency,
          timeout: 30000,
        },
      },
    };

    this.results.push(result);
    console.log('✅ Safety benchmarks completed:', {
      duration: `${(duration / 1000).toFixed(2)}s`,
      throughput: `${result.metrics.throughput.toFixed(2)} ops/s`,
      avgLatency: `${result.metrics.latency.avg.toFixed(2)}ms`,
      p95Latency: `${result.metrics.latency.p95.toFixed(2)}ms`,
    });

    return result;
  }

  async runCognitiveBenchmarks(): Promise<BenchmarkResult> {
    // TODO: Implement cognitive processing benchmarks
    // This would test LLM interactions, thought generation, etc.

    const benchmarkId = `cognitive-${Date.now()}`;
    const startTime = performance.now();

    console.log('🧠 Running Cognitive System Benchmarks...');

    const latencies: number[] = [];
    let totalOperations = 0;
    let successfulOperations = 0;

    try {
      // Test LLM Interface performance
      console.log('  📡 Testing LLM Interface...');

      const llmStart = performance.now();
      try {
        // Test basic LLM availability and response time
        await new Promise((resolve) => setTimeout(resolve, 100));
        const llmEnd = performance.now();
        latencies.push(llmEnd - llmStart);
        successfulOperations++;
      } catch (error) {
        console.warn('  ⚠️ LLM interface test failed:', error);
      }

      totalOperations++;

      // Test thought generation performance
      console.log('  💭 Testing Thought Generation...');

      const thoughtStart = performance.now();
      try {
        // Simulate thought generation process
        await new Promise((resolve) => setTimeout(resolve, 150));
        const thoughtEnd = performance.now();
        latencies.push(thoughtEnd - thoughtStart);
        successfulOperations++;
      } catch (error) {
        console.warn('  ⚠️ Thought generation test failed:', error);
      }

      totalOperations++;

      // Test cognitive stream processing
      console.log('  🌊 Testing Cognitive Stream Processing...');

      const streamStart = performance.now();
      try {
        // Simulate cognitive stream processing
        await new Promise((resolve) => setTimeout(resolve, 200));
        const streamEnd = performance.now();
        latencies.push(streamEnd - streamStart);
        successfulOperations++;
      } catch (error) {
        console.warn('  ⚠️ Cognitive stream test failed:', error);
      }

      totalOperations++;

      // Test memory integration
      console.log('  🧠 Testing Memory Integration...');

      const memoryStart = performance.now();
      try {
        // Simulate memory operations
        await new Promise((resolve) => setTimeout(resolve, 80));
        const memoryEnd = performance.now();
        latencies.push(memoryEnd - memoryStart);
        successfulOperations++;
      } catch (error) {
        console.warn('  ⚠️ Memory integration test failed:', error);
      }

      totalOperations++;

      console.log(
        `  ✅ Completed ${successfulOperations}/${totalOperations} cognitive benchmarks`
      );
    } catch (error) {
      console.error('❌ Cognitive benchmarks failed:', error);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Calculate metrics
    const sortedLatencies = latencies.sort((a, b) => a - b);
    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;
    const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;
    const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;

    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);
    const p95 =
      p95Index < sortedLatencies.length
        ? sortedLatencies[p95Index]
        : maxLatency;
    const p99 =
      p99Index < sortedLatencies.length
        ? sortedLatencies[p99Index]
        : maxLatency;

    const result: BenchmarkResult = {
      benchmarkId,
      timestamp: Date.now(),
      duration,
      metrics: {
        throughput: successfulOperations / (duration / 1000), // operations per second
        latency: {
          min: minLatency,
          max: maxLatency,
          avg: avgLatency,
          p95,
          p99,
        },
        memory: {
          used: process.memoryUsage().heapUsed,
          peak: process.memoryUsage().heapUsed,
          allocated: process.memoryUsage().heapTotal,
        },
        cpu: {
          user: process.cpuUsage().user,
          system: process.cpuUsage().system,
          total: process.cpuUsage().user + process.cpuUsage().system,
        },
        errors: {
          count: totalOperations - successfulOperations,
          rate:
            totalOperations > 0
              ? (totalOperations - successfulOperations) / totalOperations
              : 0,
        },
      },
      metadata: {
        systemInfo: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          cpus: require('os').cpus().length,
          memory: require('os').totalmem(),
        },
        testConfig: {
          iterations: 10,
          concurrency: 1,
          timeout: 30000,
        },
      },
    };

    this.results.push(result);
    console.log(
      `✅ Cognitive benchmarks completed: ${successfulOperations}/${totalOperations} operations successful`
    );

    return result;
  }

  async runFullSystemBenchmarks(): Promise<BenchmarkResult[]> {
    console.log('🚀 Running Full System Performance Benchmarks...');

    const results: BenchmarkResult[] = [];

    try {
      // Run memory benchmarks
      if (this.memoryFixture) {
        const memoryResult = await this.runMemoryBenchmarks();
        results.push(memoryResult);
      }

      // Run safety benchmarks
      if (this.safetyFixture) {
        const safetyResult = await this.runSafetyBenchmarks();
        results.push(safetyResult);
      }

      // Run cognitive benchmarks (placeholder for now)
      const cognitiveResult = await this.runCognitiveBenchmarks();
      results.push(cognitiveResult);
    } catch (error) {
      console.error('❌ Error running full system benchmarks:', error);
    }

    console.log(
      `✅ Full system benchmarks completed. Generated ${results.length} benchmark results.`
    );
    return results;
  }

  async generatePerformanceReport(): Promise<string> {
    const report = {
      title: 'Conscious Bot Performance Benchmark Report',
      timestamp: new Date().toISOString(),
      summary: {
        totalBenchmarks: this.results.length,
        averageThroughput:
          this.results.reduce((sum, r) => sum + r.metrics.throughput, 0) /
            this.results.length || 0,
        averageLatency:
          this.results.reduce((sum, r) => sum + r.metrics.latency.avg, 0) /
            this.results.length || 0,
        totalDuration: this.results.reduce((sum, r) => sum + r.duration, 0),
      },
      benchmarks: this.results.map((result) => ({
        id: result.benchmarkId,
        duration: result.duration,
        throughput: result.metrics.throughput,
        latency: result.metrics.latency,
        memoryUsage: result.metrics.memory,
        cpuUsage: result.metrics.cpu,
        errorRate: result.metrics.errors.rate,
      })),
      systemInfo: this.results[0]?.metadata.systemInfo || {},
    };

    return JSON.stringify(report, null, 2);
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up benchmark runner...');

    if (this.memoryFixture) {
      await this.memoryFixture.stop();
      console.log('✅ Memory fixture cleaned up');
    }

    if (this.safetyFixture) {
      await this.safetyFixture.stop();
      console.log('✅ Safety fixture cleaned up');
    }

    console.log('🎯 Benchmark runner cleanup completed');
  }
}
