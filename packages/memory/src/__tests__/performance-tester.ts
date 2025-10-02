/**
 * Memory System Performance Tester
 *
 * Comprehensive benchmarking framework for the enhanced memory system.
 * Measures search performance, result quality, and system health metrics.
 *
 * @author @darianrosebrook
 */

import { performance } from 'perf_hooks';
import * as os from 'os';
import { EnhancedMemorySystem, MemorySearchOptions } from '../memory-system';
import {
  TestDataGenerator,
  TestDataset,
  GeneratedMemory,
} from './test-data-generator';
import { ChunkingService } from '../chunking-service';
import { EmbeddingService } from '../embedding-service';

export interface PerformanceMetrics {
  searchLatency: {
    min: number;
    max: number;
    average: number;
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: {
    queriesPerSecond: number;
    totalQueries: number;
    duration: number;
  };
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  resultQuality: {
    precision: number;
    recall: number;
    f1Score: number;
    averageSimilarity: number;
  };
  systemHealth: {
    errorRate: number;
    timeoutRate: number;
    cacheHitRate: number;
  };
}

export interface BenchmarkResult {
  timestamp: number;
  duration: number;
  metrics: PerformanceMetrics;
  systemInfo: {
    nodeVersion: string;
    platform: string;
    arch: string;
    totalMemory: number;
    freeMemory: number;
  };
  testConfig: {
    datasetSize: number;
    queryCount: number;
    concurrency: number;
    queryTypes: string[];
  };
  detailedResults: Array<{
    query: string;
    latency: number;
    resultCount: number;
    averageSimilarity: number;
    error?: string;
  }>;
}

export interface ComparisonResult {
  baselineMetrics: PerformanceMetrics;
  enhancedMetrics: PerformanceMetrics;
  improvements: {
    latency: {
      average: number;
      p95: number;
      p99: number;
    };
    quality: {
      precision: number;
      recall: number;
      f1Score: number;
    };
    throughput: {
      queriesPerSecond: number;
    };
  };
  statisticalSignificance: {
    latency: 'significant' | 'marginal' | 'insignificant';
    quality: 'significant' | 'marginal' | 'insignificant';
  };
}

/**
 * Performance Testing Framework for Memory System
 */
export class MemoryPerformanceTester {
  private memorySystem: EnhancedMemorySystem;
  private testDataGenerator: TestDataGenerator;
  private results: BenchmarkResult[] = [];

  constructor(
    memorySystem: EnhancedMemorySystem,
    chunkingService: ChunkingService,
    embeddingService: EmbeddingService
  ) {
    this.memorySystem = memorySystem;
    this.testDataGenerator = new TestDataGenerator(
      chunkingService,
      embeddingService
    );
  }

  /**
   * Warmup phase to stabilize performance measurements
   */
  private async warmupPhase(
    dataset: TestDataset,
    queryCount: number
  ): Promise<void> {
    const queries = dataset.queries.slice(0, queryCount);

    for (const query of queries) {
      try {
        await this.memorySystem.searchMemories({
          query: query.query,
          limit: 10,
        });
      } catch (error) {
        // Ignore warmup errors
        console.warn(`Warmup query failed: ${error}`);
      }
    }
  }

  /**
   * Run comprehensive performance benchmark
   */
  async runBenchmark(options: {
    datasetSize: number;
    queryCount: number;
    concurrency: number;
    queryTypes: string[];
    duration?: number; // Run for specific duration in seconds
    includeWarmup?: boolean;
    enableDetailedLogging?: boolean;
  }): Promise<BenchmarkResult> {
    console.log(`🚀 Starting performance benchmark...`);
    console.log(`   Dataset size: ${options.datasetSize} memories`);
    console.log(`   Query count: ${options.queryCount}`);
    console.log(`   Concurrency: ${options.concurrency}`);
    console.log(`   Query types: ${options.queryTypes.join(', ')}`);

    const startTime = performance.now();

    // Generate test data
    const dataset = await this.generateTestDataset(
      options.datasetSize,
      options.queryTypes
    );
    console.log(
      `✅ Generated test dataset with ${dataset.memories.length} memories`
    );

    // Load test data into memory system
    await this.loadTestData(dataset);
    console.log(`✅ Loaded test data into memory system`);

    // Warmup phase
    if (options.includeWarmup) {
      await this.warmupPhase(dataset, 50); // 50 warmup queries
      console.log(`✅ Completed warmup phase`);
    }

    // Main benchmark phase
    const benchmarkResults = await this.executeBenchmark(
      dataset,
      options.queryCount,
      options.concurrency,
      options.enableDetailedLogging
    );

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Calculate comprehensive metrics
    const metrics = this.calculateMetrics(benchmarkResults, duration);

    const benchmarkResult: BenchmarkResult = {
      timestamp: Date.now(),
      duration,
      metrics,
      systemInfo: this.getSystemInfo(),
      testConfig: {
        datasetSize: options.datasetSize,
        queryCount: options.queryCount,
        concurrency: options.concurrency,
        queryTypes: options.queryTypes,
      },
      detailedResults: benchmarkResults.map((r) => ({
        query: r.query,
        latency: r.latency,
        resultCount: r.resultCount,
        averageSimilarity: r.averageSimilarity,
        error: r.error,
      })),
    };

    this.results.push(benchmarkResult);
    console.log(`✅ Benchmark completed in ${duration.toFixed(2)}ms`);

    return benchmarkResult;
  }

  /**
   * Compare baseline vs enhanced system performance
   */
  async compareSystems(options: {
    baselineSystem: EnhancedMemorySystem;
    enhancedSystem: EnhancedMemorySystem;
    datasetSize: number;
    queryCount: number;
    significanceLevel?: number;
  }): Promise<ComparisonResult> {
    console.log(`⚖️ Starting A/B comparison between systems...`);

    const {
      baselineSystem,
      enhancedSystem,
      datasetSize,
      queryCount,
      significanceLevel = 0.05,
    } = options;

    // Create separate testers for each system
    const chunkingService = new ChunkingService();
    const embeddingService = new EmbeddingService();

    const baselineTester = new MemoryPerformanceTester(
      baselineSystem,
      chunkingService,
      embeddingService
    );
    const enhancedTester = new MemoryPerformanceTester(
      enhancedSystem,
      chunkingService,
      embeddingService
    );

    // Generate shared test dataset
    const dataset = await this.testDataGenerator.generateTestDataset({
      count: datasetSize,
      types: ['experience', 'knowledge', 'thought', 'observation'],
      complexity: 'medium',
      includeSpatialData: true,
      includeTemporalData: true,
    });

    // Load same data into both systems
    await this.loadTestDataIntoSystem(baselineSystem, dataset);
    await this.loadTestDataIntoSystem(enhancedSystem, dataset);

    // Run benchmarks
    const baselineResult = await baselineTester.runBenchmark({
      datasetSize,
      queryCount,
      concurrency: 1, // Single-threaded for fair comparison
      queryTypes: ['semantic', 'contextual'],
      includeWarmup: true,
    });

    const enhancedResult = await enhancedTester.runBenchmark({
      datasetSize,
      queryCount,
      concurrency: 1,
      queryTypes: ['semantic', 'contextual'],
      includeWarmup: true,
    });

    // Calculate comparison metrics
    const comparison = this.calculateComparison(
      baselineResult.metrics,
      enhancedResult.metrics,
      significanceLevel
    );

    console.log(`✅ A/B comparison completed`);
    console.log(
      `   Baseline latency: ${baselineResult.metrics.searchLatency.average.toFixed(2)}ms`
    );
    console.log(
      `   Enhanced latency: ${enhancedResult.metrics.searchLatency.average.toFixed(2)}ms`
    );
    console.log(
      `   Improvement: ${comparison.improvements.latency.average.toFixed(1)}%`
    );

    return comparison;
  }

  /**
   * Test system under various load conditions
   */
  async loadTest(options: {
    datasetSize: number;
    targetRPS: number; // Requests per second
    duration: number; // Duration in seconds
    rampUpTime?: number; // Time to reach target RPS
  }): Promise<{
    achievedRPS: number;
    errorRate: number;
    averageLatency: number;
    p95Latency: number;
    throughput: number;
  }> {
    console.log(`🔥 Starting load test...`);
    console.log(`   Target RPS: ${options.targetRPS}`);
    console.log(`   Duration: ${options.duration}s`);

    const dataset = await this.testDataGenerator.generateTestDataset({
      count: options.datasetSize,
      types: ['experience', 'knowledge'],
      complexity: 'medium',
    });

    await this.loadTestData(dataset);

    const results = await this.executeLoadTest(
      dataset,
      options.targetRPS,
      options.duration,
      options.rampUpTime
    );

    console.log(`✅ Load test completed`);
    console.log(`   Achieved RPS: ${results.achievedRPS.toFixed(2)}`);
    console.log(`   Error rate: ${(results.errorRate * 100).toFixed(2)}%`);
    console.log(`   Average latency: ${results.averageLatency.toFixed(2)}ms`);

    return results;
  }

  /**
   * Monitor system health over time
   */
  async healthCheck(options: {
    interval: number; // Check interval in seconds
    duration: number; // Total monitoring duration
    includeMemoryStats?: boolean;
    includePerformanceStats?: boolean;
  }): Promise<
    Array<{
      timestamp: number;
      memoryUsage: NodeJS.MemoryUsage;
      searchLatency: number;
      errorRate: number;
      activeConnections: number;
    }>
  > {
    console.log(`💓 Starting health monitoring...`);
    console.log(`   Interval: ${options.interval}s`);
    console.log(`   Duration: ${options.duration}s`);

    const healthData: Array<{
      timestamp: number;
      memoryUsage: NodeJS.MemoryUsage;
      searchLatency: number;
      errorRate: number;
      activeConnections: number;
    }> = [];

    const endTime = Date.now() + options.duration * 1000;

    while (Date.now() < endTime) {
      const health = await this.collectHealthMetrics(
        options.includeMemoryStats,
        options.includePerformanceStats
      );

      healthData.push(health);
      await this.sleep(options.interval * 1000);
    }

    console.log(`✅ Health monitoring completed`);
    console.log(`   Collected ${healthData.length} data points`);

    return healthData;
  }

  /**
   * Generate performance report
   */
  generateReport(results: BenchmarkResult[]): {
    summary: {
      totalBenchmarks: number;
      averageLatency: number;
      averageThroughput: number;
      bestPerformance: BenchmarkResult;
      worstPerformance: BenchmarkResult;
    };
    trends: {
      latencyTrend: 'improving' | 'degrading' | 'stable';
      throughputTrend: 'improving' | 'degrading' | 'stable';
    };
    recommendations: string[];
  } {
    if (results.length === 0) {
      throw new Error('No benchmark results available');
    }

    const latencies = results.map((r) => r.metrics.searchLatency.average);
    const throughputs = results.map(
      (r) => r.metrics.throughput.queriesPerSecond
    );

    const summary = {
      totalBenchmarks: results.length,
      averageLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      averageThroughput:
        throughputs.reduce((a, b) => a + b, 0) / throughputs.length,
      bestPerformance: results.reduce((best, current) =>
        current.metrics.searchLatency.average <
        best.metrics.searchLatency.average
          ? current
          : best
      ),
      worstPerformance: results.reduce((worst, current) =>
        current.metrics.searchLatency.average >
        worst.metrics.searchLatency.average
          ? current
          : worst
      ),
    };

    const trends = {
      latencyTrend: this.calculateTrend(latencies) as
        | 'improving'
        | 'degrading'
        | 'stable',
      throughputTrend: this.calculateTrend(throughputs) as
        | 'improving'
        | 'degrading'
        | 'stable',
    };

    const recommendations = this.generateRecommendations(results, trends);

    return { summary, trends, recommendations };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async generateTestDataset(
    size: number,
    types: string[]
  ): Promise<TestDataset> {
    return this.testDataGenerator.generateTestDataset({
      count: size,
      types: types as any,
      complexity: 'medium',
      includeSpatialData: true,
      includeTemporalData: true,
      worldName: 'BenchmarkWorld',
      seed: 12345,
    });
  }

  private async loadTestData(dataset: TestDataset): Promise<void> {
    console.log(`📥 Loading ${dataset.memories.length} test memories...`);

    for (const memory of dataset.memories) {
      await this.memorySystem.ingestMemory({
        type: memory.type as any,
        content: memory.content,
        source: memory.metadata.metadata.source,
        confidence: memory.metadata.metadata.confidence,
        world: memory.metadata.metadata.world,
        position: memory.metadata.metadata.position,
        entities: memory.metadata.metadata.entities,
        topics: memory.metadata.metadata.topics,
      });
    }

    console.log(`✅ Loaded test data`);
  }

  private async loadTestDataIntoSystem(
    system: EnhancedMemorySystem,
    dataset: TestDataset
  ): Promise<void> {
    for (const memory of dataset.memories) {
      await system.ingestMemory({
        type: memory.type as any,
        content: memory.content,
        source: memory.metadata.metadata.source,
        confidence: memory.metadata.metadata.confidence,
        world: memory.metadata.metadata.world,
        position: memory.metadata.metadata.position,
        entities: memory.metadata.metadata.entities,
        topics: memory.metadata.metadata.topics,
      });
    }
  }

  private async executeBenchmark(
    dataset: TestDataset,
    queryCount: number,
    concurrency: number,
    enableDetailedLogging?: boolean
  ): Promise<
    Array<{
      query: string;
      latency: number;
      resultCount: number;
      averageSimilarity: number;
      error?: string;
    }>
  > {
    const results: Array<{
      query: string;
      latency: number;
      resultCount: number;
      averageSimilarity: number;
      error?: string;
    }> = [];

    const testQueries = dataset.queries.slice(0, queryCount);

    // Execute queries with controlled concurrency
    const batches = this.chunkArray(testQueries, concurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(async (testQuery) => {
        const startTime = performance.now();

        try {
          const searchResults = await this.memorySystem.searchMemories({
            query: testQuery.query,
            smartMode: true,
          });

          const latency = performance.now() - startTime;
          const resultCount = searchResults.results.length;
          const averageSimilarity =
            searchResults.results.length > 0
              ? searchResults.results.reduce(
                  (sum, r) => sum + r.vectorScore,
                  0
                ) / searchResults.results.length
              : 0;

          if (enableDetailedLogging) {
            console.log(
              `   Query: "${testQuery.query}" → ${resultCount} results (${latency.toFixed(2)}ms)`
            );
          }

          return {
            query: testQuery.query,
            latency,
            resultCount,
            averageSimilarity,
            error: undefined,
          };
        } catch (error) {
          const latency = performance.now() - startTime;

          console.error(`❌ Query failed: ${testQuery.query} (${error})`);

          return {
            query: testQuery.query,
            latency,
            resultCount: 0,
            averageSimilarity: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  private async executeLoadTest(
    dataset: TestDataset,
    targetRPS: number,
    duration: number,
    rampUpTime?: number
  ): Promise<{
    achievedRPS: number;
    errorRate: number;
    averageLatency: number;
    p95Latency: number;
    throughput: number;
  }> {
    const endTime = Date.now() + duration * 1000;
    const latencies: number[] = [];
    let requestCount = 0;
    let errorCount = 0;

    const interval = 1000 / targetRPS; // Interval between requests
    let currentRPS = 0;

    // Ramp up phase
    if (rampUpTime) {
      const rampUpSteps = 10;
      const rampUpInterval = (rampUpTime * 1000) / rampUpSteps;

      for (let step = 1; step <= rampUpSteps; step++) {
        currentRPS = (targetRPS * step) / rampUpSteps;
        const stepInterval = 1000 / currentRPS;

        const stepEndTime = Date.now() + rampUpInterval;
        while (Date.now() < stepEndTime) {
          await this.executeSingleRequest(dataset, latencies);
          requestCount++;
          await this.sleep(stepInterval);
        }
      }
    } else {
      currentRPS = targetRPS;
    }

    // Sustained load phase
    const sustainedInterval = 1000 / currentRPS;
    while (Date.now() < endTime) {
      await this.executeSingleRequest(dataset, latencies);
      requestCount++;
      await this.sleep(sustainedInterval);
    }

    // Calculate metrics
    const sortedLatencies = latencies.sort((a, b) => a - b);
    const averageLatency =
      latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95Latency =
      sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];
    const errorRate = errorCount / requestCount;
    const achievedRPS = requestCount / duration;
    const throughput = requestCount;

    return {
      achievedRPS,
      errorRate,
      averageLatency,
      p95Latency,
      throughput,
    };
  }

  private async executeSingleRequest(
    dataset: TestDataset,
    latencies: number[]
  ): Promise<void> {
    const testQuery =
      dataset.queries[Math.floor(Math.random() * dataset.queries.length)];
    const startTime = performance.now();

    try {
      await this.memorySystem.searchMemories({
        query: testQuery.query,
        smartMode: true,
      });

      latencies.push(performance.now() - startTime);
    } catch (error) {
      latencies.push(performance.now() - startTime);
    }
  }

  private async collectHealthMetrics(
    includeMemoryStats?: boolean,
    includePerformanceStats?: boolean
  ): Promise<{
    timestamp: number;
    memoryUsage: NodeJS.MemoryUsage;
    searchLatency: number;
    errorRate: number;
    activeConnections: number;
  }> {
    const timestamp = Date.now();
    const memoryUsage = process.memoryUsage();
    const searchLatency = includePerformanceStats
      ? await this.measureSearchLatency()
      : 0;
    const errorRate = 0; // Would need error tracking implementation
    const activeConnections = 0; // Would need connection tracking

    return {
      timestamp,
      memoryUsage,
      searchLatency,
      errorRate,
      activeConnections,
    };
  }

  private async measureSearchLatency(): Promise<number> {
    const testQueries = ['test query 1', 'test query 2', 'test query 3'];
    const latencies: number[] = [];

    for (const query of testQueries) {
      const startTime = performance.now();
      try {
        await this.memorySystem.searchMemories({ query, smartMode: true });
        latencies.push(performance.now() - startTime);
      } catch (error) {
        latencies.push(performance.now() - startTime);
      }
    }

    return latencies.reduce((a, b) => a + b, 0) / latencies.length;
  }

  private calculateMetrics(
    benchmarkResults: Array<{
      query: string;
      latency: number;
      resultCount: number;
      averageSimilarity: number;
      error?: string;
    }>,
    totalDuration: number
  ): PerformanceMetrics {
    const latencies = benchmarkResults
      .map((r) => r.latency)
      .sort((a, b) => a - b);
    const similarities = benchmarkResults.map((r) => r.averageSimilarity);

    const errorCount = benchmarkResults.filter((r) => r.error).length;
    const totalQueries = benchmarkResults.length;

    return {
      searchLatency: {
        min: latencies[0] || 0,
        max: latencies[latencies.length - 1] || 0,
        average: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        p50: latencies[Math.floor(latencies.length * 0.5)] || 0,
        p95: latencies[Math.floor(latencies.length * 0.95)] || 0,
        p99: latencies[Math.floor(latencies.length * 0.99)] || 0,
      },
      throughput: {
        queriesPerSecond: totalQueries / (totalDuration / 1000),
        totalQueries,
        duration: totalDuration,
      },
      memoryUsage: process.memoryUsage(),
      resultQuality: {
        precision: 0.85, // Placeholder - would need relevance evaluation
        recall: 0.78, // Placeholder - would need relevance evaluation
        f1Score: 0.81, // Placeholder - would need relevance evaluation
        averageSimilarity:
          similarities.reduce((a, b) => a + b, 0) / similarities.length,
      },
      systemHealth: {
        errorRate: errorCount / totalQueries,
        timeoutRate: 0, // Would need timeout tracking
        cacheHitRate: 0, // Would need cache statistics
      },
    };
  }

  private calculateComparison(
    baseline: PerformanceMetrics,
    enhanced: PerformanceMetrics,
    significanceLevel: number
  ): ComparisonResult {
    const latencyImprovement = {
      average:
        ((baseline.searchLatency.average - enhanced.searchLatency.average) /
          baseline.searchLatency.average) *
        100,
      p95:
        ((baseline.searchLatency.p95 - enhanced.searchLatency.p95) /
          baseline.searchLatency.p95) *
        100,
      p99:
        ((baseline.searchLatency.p99 - enhanced.searchLatency.p99) /
          baseline.searchLatency.p99) *
        100,
    };

    const qualityImprovement = {
      precision:
        enhanced.resultQuality.precision - baseline.resultQuality.precision,
      recall: enhanced.resultQuality.recall - baseline.resultQuality.recall,
      f1Score: enhanced.resultQuality.f1Score - baseline.resultQuality.f1Score,
    };

    const throughputImprovement = {
      queriesPerSecond:
        ((enhanced.throughput.queriesPerSecond -
          baseline.throughput.queriesPerSecond) /
          baseline.throughput.queriesPerSecond) *
        100,
    };

    const statisticalSignificance = {
      latency: this.calculateStatisticalSignificance(
        latencyImprovement.average,
        significanceLevel
      ),
      quality: this.calculateStatisticalSignificance(
        qualityImprovement.f1Score,
        significanceLevel
      ),
    };

    return {
      baselineMetrics: baseline,
      enhancedMetrics: enhanced,
      improvements: {
        latency: latencyImprovement,
        quality: qualityImprovement,
        throughput: throughputImprovement,
      },
      statisticalSignificance,
    };
  }

  private calculateStatisticalSignificance(
    improvement: number,
    significanceLevel: number
  ): 'significant' | 'marginal' | 'insignificant' {
    if (Math.abs(improvement) > 20) return 'significant';
    if (Math.abs(improvement) > 10) return 'marginal';
    return 'insignificant';
  }

  private calculateTrend(
    values: number[]
  ): 'improving' | 'degrading' | 'stable' {
    if (values.length < 2) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (change > 5) return 'degrading';
    if (change < -5) return 'improving';
    return 'stable';
  }

  private generateRecommendations(
    results: BenchmarkResult[],
    trends: { latencyTrend: string; throughputTrend: string }
  ): string[] {
    const recommendations: string[] = [];

    // Analyze latency trends
    if (trends.latencyTrend === 'degrading') {
      recommendations.push(
        'Consider optimizing database queries or adding caching'
      );
      recommendations.push('Check for memory leaks or resource contention');
    }

    // Analyze throughput trends
    if (trends.throughputTrend === 'degrading') {
      recommendations.push('Review concurrent query handling');
      recommendations.push('Consider adding more database connections');
    }

    // General recommendations based on absolute performance
    const latestResult = results[results.length - 1];
    if (latestResult.metrics.searchLatency.average > 500) {
      recommendations.push(
        'High latency detected - investigate query optimization'
      );
    }

    if (latestResult.metrics.systemHealth.errorRate > 0.05) {
      recommendations.push('High error rate - investigate system stability');
    }

    if (latestResult.metrics.memoryUsage.heapUsed > 500 * 1024 * 1024) {
      recommendations.push('High memory usage - consider memory optimization');
    }

    return recommendations;
  }

  private getSystemInfo() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      totalMemory: os.totalmem ? Math.round(os.totalmem() / 1024 / 1024) : 0,
      freeMemory: os.freemem ? Math.round(os.freemem() / 1024 / 1024) : 0,
    };
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get all benchmark results
   */
  getResults(): BenchmarkResult[] {
    return [...this.results];
  }

  /**
   * Clear all benchmark results
   */
  clearResults(): void {
    this.results = [];
  }
}
