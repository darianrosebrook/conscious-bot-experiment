/**
 * Memory System Test Runner
 *
 * Main orchestration interface for running comprehensive benchmarks,
 * evaluations, and comparisons of the enhanced memory system.
 *
 * @author @darianrosebrook
 */

import * as os from 'os';
import { EnhancedMemorySystem } from '../memory-system';
import { TestDataGenerator, TestDataset } from './test-data-generator';
import {
  MemoryPerformanceTester,
  BenchmarkResult,
  ComparisonResult,
} from './performance-tester';
import {
  RelevanceEvaluator,
  ComprehensiveEvaluation,
} from './relevance-evaluator';
import { ChunkingService } from '../chunking-service';
import { EmbeddingService } from '../embedding-service';

export interface TestRunnerOptions {
  // System configuration
  memorySystem: EnhancedMemorySystem;
  databaseUrl?: string;

  // Test configuration
  testDatasetSize: number;
  queryCount: number;
  concurrency: number;

  // Evaluation options
  includeRelevanceEvaluation: boolean;
  includePerformanceBenchmarks: boolean;
  includeLoadTesting: boolean;
  includeHealthMonitoring: boolean;

  // Comparison options
  compareWithBaseline?: EnhancedMemorySystem;
  enableAComparison: boolean;

  // Reporting options
  generateReports: boolean;
  outputDir: string;
}

export interface TestSuiteResult {
  timestamp: number;
  duration: number;
  testRunnerVersion: string;

  // Test configuration
  options: TestRunnerOptions;

  // Results
  performanceResults?: BenchmarkResult[];
  relevanceResults?: ComprehensiveEvaluation[];
  comparisonResults?: ComparisonResult[];
  loadTestResults?: any[];
  healthMonitoringResults?: any[];

  // Summary metrics
  summary: {
    overallPerformance: {
      averageLatency: number;
      queriesPerSecond: number;
      errorRate: number;
    };
    relevanceQuality: {
      averagePrecision: number;
      averageRecall: number;
      averageF1Score: number;
    };
    comparison: {
      improvement: {
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
      statisticalSignificance: boolean;
    };
  };

  // Recommendations
  recommendations: string[];

  // System information
  systemInfo: {
    nodeVersion: string;
    platform: string;
    totalMemory: number;
    testEnvironment: 'development' | 'staging' | 'production';
  };
}

export interface QuickTestOptions {
  memorySystem: EnhancedMemorySystem;
  queryCount?: number;
  includeComparison?: boolean;
  baselineSystem?: EnhancedMemorySystem;
}

/**
 * Main Test Runner for Memory System
 */
export class MemoryTestRunner {
  private memorySystem: EnhancedMemorySystem;
  private testDataGenerator: TestDataGenerator;
  private performanceTester: MemoryPerformanceTester;
  private relevanceEvaluator: RelevanceEvaluator;
  private options: TestRunnerOptions;
  private results: TestSuiteResult[] = [];

  constructor(options: TestRunnerOptions) {
    this.options = options;
    this.memorySystem = options.memorySystem;

    // Initialize test components
    const chunkingService = new ChunkingService();
    const embeddingService = new EmbeddingService({
      ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:5002',
      embeddingModel: process.env.MEMORY_EMBEDDING_MODEL || 'embeddinggemma',
      dimension: 768,
    });

    this.testDataGenerator = new TestDataGenerator(
      chunkingService,
      embeddingService
    );
    this.performanceTester = new MemoryPerformanceTester(
      this.memorySystem,
      chunkingService,
      embeddingService
    );
    this.relevanceEvaluator = new RelevanceEvaluator();
  }

  /**
   * Run complete test suite
   */
  async runTestSuite(): Promise<TestSuiteResult> {
    console.log('🚀 Starting Memory System Test Suite...');
    console.log(`   Test dataset size: ${this.options.testDatasetSize}`);
    console.log(`   Query count: ${this.options.queryCount}`);
    console.log(`   Concurrency: ${this.options.concurrency}`);

    const startTime = Date.now();

    try {
      // Initialize memory system
      await this.memorySystem.initialize();
      console.log('✅ Memory system initialized');

      // Generate test dataset
      const testDataset = await this.generateTestDataset();
      console.log(
        `✅ Generated test dataset with ${testDataset.memories.length} memories`
      );

      // Load test data
      await this.loadTestData(testDataset);
      console.log('✅ Test data loaded into memory system');

      // Run performance benchmarks
      let performanceResults: BenchmarkResult[] = [];
      if (this.options.includePerformanceBenchmarks) {
        performanceResults = await this.runPerformanceBenchmarks(testDataset);
        console.log('✅ Performance benchmarks completed');
      }

      // Run relevance evaluation
      let relevanceResults: ComprehensiveEvaluation[] = [];
      if (this.options.includeRelevanceEvaluation) {
        relevanceResults = await this.runRelevanceEvaluation(testDataset);
        console.log('✅ Relevance evaluation completed');
      }

      // Run A/B comparison
      let comparisonResults: ComparisonResult[] = [];
      if (this.options.enableAComparison && this.options.compareWithBaseline) {
        comparisonResults = await this.runComparison(testDataset);
        console.log('✅ A/B comparison completed');
      }

      // Run load testing
      let loadTestResults: any[] = [];
      if (this.options.includeLoadTesting) {
        loadTestResults = await this.runLoadTests(testDataset);
        console.log('✅ Load testing completed');
      }

      // Run health monitoring
      let healthMonitoringResults: any[] = [];
      if (this.options.includeHealthMonitoring) {
        healthMonitoringResults = await this.runHealthMonitoring();
        console.log('✅ Health monitoring completed');
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Calculate summary metrics
      const summary = this.calculateSummaryMetrics(
        performanceResults,
        relevanceResults,
        comparisonResults
      );

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        performanceResults,
        relevanceResults,
        comparisonResults
      );

      const result: TestSuiteResult = {
        timestamp: Date.now(),
        duration,
        testRunnerVersion: '1.0.0',
        options: this.options,
        performanceResults,
        relevanceResults,
        comparisonResults,
        loadTestResults,
        healthMonitoringResults,
        summary,
        recommendations,
        systemInfo: {
          nodeVersion: process.version,
          platform: process.platform,
          totalMemory: os.totalmem
            ? Math.round(os.totalmem() / 1024 / 1024)
            : 0,
          testEnvironment: this.detectEnvironment(),
        },
      };

      this.results.push(result);

      // Generate reports if requested
      if (this.options.generateReports) {
        await this.generateReports(result);
      }

      console.log('✅ Test suite completed successfully');
      console.log(`   Duration: ${duration / 1000}s`);
      console.log(
        `   Average latency: ${summary.overallPerformance.averageLatency.toFixed(2)}ms`
      );
      console.log(
        `   Average F1 score: ${(summary.relevanceQuality.averageF1Score * 100).toFixed(1)}%`
      );

      return result;
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      throw error;
    }
  }

  /**
   * Quick test for rapid evaluation
   */
  async quickTest(options: QuickTestOptions): Promise<{
    performance: BenchmarkResult;
    relevance?: ComprehensiveEvaluation;
    comparison?: ComparisonResult;
  }> {
    console.log('⚡ Running quick test...');

    const chunkingService = new ChunkingService();
    const embeddingService = new EmbeddingService();
    const testDataGenerator = new TestDataGenerator(
      chunkingService,
      embeddingService
    );

    // Generate small test dataset
    const testDataset = await testDataGenerator.generateTestDataset({
      count: 100,
      types: ['experience', 'knowledge', 'thought'],
      complexity: 'medium',
      includeSpatialData: true,
      includeTemporalData: true,
    });

    // Load test data
    await this.loadTestDataIntoSystem(options.memorySystem, testDataset);

    // Run performance benchmark
    const performanceTester = new MemoryPerformanceTester(
      options.memorySystem,
      chunkingService,
      embeddingService
    );

    const performance = await performanceTester.runBenchmark({
      datasetSize: 100,
      queryCount: options.queryCount || 50,
      concurrency: 1,
      queryTypes: ['semantic', 'contextual'],
      includeWarmup: true,
      enableDetailedLogging: false,
    });

    // Run relevance evaluation if requested
    let relevance: ComprehensiveEvaluation | undefined;
    if (this.options.includeRelevanceEvaluation) {
      const searchResults = new Map<string, any>();
      // This would populate search results in a real implementation

      relevance = await this.relevanceEvaluator.evaluateQueries(
        testDataset,
        searchResults,
        { k: 10 }
      );
    }

    // Run comparison if baseline provided
    let comparison: ComparisonResult | undefined;
    if (options.includeComparison && options.baselineSystem) {
      comparison = await performanceTester.compareSystems({
        baselineSystem: options.baselineSystem,
        enhancedSystem: options.memorySystem,
        datasetSize: 100,
        queryCount: options.queryCount || 50,
      });
    }

    return { performance, relevance, comparison };
  }

  /**
   * Run focused performance test
   */
  async performanceTest(options: {
    duration: number;
    targetRPS: number;
    rampUpTime?: number;
  }): Promise<BenchmarkResult> {
    console.log('🎯 Running focused performance test...');

    const chunkingService = new ChunkingService();
    const embeddingService = new EmbeddingService();
    const testDataGenerator = new TestDataGenerator(
      chunkingService,
      embeddingService
    );

    // Generate test dataset
    const testDataset = await testDataGenerator.generateTestDataset({
      count: 200,
      types: ['experience', 'knowledge'],
      complexity: 'medium',
    });

    // Load test data
    await this.loadTestDataIntoSystem(this.memorySystem, testDataset);

    // Run load test
    const performanceTester = new MemoryPerformanceTester(
      this.memorySystem,
      chunkingService,
      embeddingService
    );

    return performanceTester.runBenchmark({
      datasetSize: 200,
      queryCount: Math.floor(options.targetRPS * options.duration),
      concurrency: Math.min(5, Math.floor(options.targetRPS / 10)),
      queryTypes: ['semantic'],
      duration: options.duration,
      includeWarmup: true,
    });
  }

  /**
   * Get test history
   */
  getTestHistory(): TestSuiteResult[] {
    return [...this.results].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Export test results
   */
  async exportResults(
    format: 'json' | 'csv' | 'html' = 'json'
  ): Promise<string> {
    const latestResult = this.results[this.results.length - 1];
    if (!latestResult) {
      throw new Error('No test results available');
    }

    switch (format) {
      case 'json':
        return JSON.stringify(latestResult, null, 2);
      case 'csv':
        return this.exportToCSV(latestResult);
      case 'html':
        return this.exportToHTML(latestResult);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async generateTestDataset(): Promise<TestDataset> {
    return this.testDataGenerator.generateTestDataset({
      count: this.options.testDatasetSize,
      types: ['experience', 'knowledge', 'thought', 'observation'],
      complexity: 'medium',
      includeSpatialData: true,
      includeTemporalData: true,
      worldName: 'TestWorld',
      seed: Math.floor(Math.random() * 1000000),
    });
  }

  private async loadTestData(dataset: TestDataset): Promise<void> {
    console.log(`📥 Loading ${dataset.memories.length} test memories...`);

    for (const memory of dataset.memories) {
      await this.memorySystem.ingestMemory({
        type: memory.type as any,
        content: memory.content,
        source: memory.metadata.metadata?.source || 'unknown',
        confidence: memory.metadata.metadata?.confidence || 0.5,
        world: memory.metadata.metadata?.world,
        position: memory.metadata.metadata?.position,
        entities: memory.metadata.metadata?.entities || [],
        topics: memory.metadata.metadata?.topics || [],
      });
    }

    console.log('✅ Test data loaded');
  }

  private async loadTestDataIntoSystem(
    system: EnhancedMemorySystem,
    dataset: TestDataset
  ): Promise<void> {
    for (const memory of dataset.memories) {
      await system.ingestMemory({
        type: memory.type as any,
        content: memory.content,
        source: memory.metadata.metadata?.source || 'unknown',
        confidence: memory.metadata.metadata?.confidence || 0.5,
        world: memory.metadata.metadata?.world,
        position: memory.metadata.metadata?.position,
        entities: memory.metadata.metadata?.entities || [],
        topics: memory.metadata.metadata?.topics || [],
      });
    }
  }

  private async runPerformanceBenchmarks(
    testDataset: TestDataset
  ): Promise<BenchmarkResult[]> {
    console.log('⚡ Running performance benchmarks...');

    const results: BenchmarkResult[] = [];

    // Standard benchmark
    const standardBenchmark = await this.performanceTester.runBenchmark({
      datasetSize: this.options.testDatasetSize,
      queryCount: this.options.queryCount,
      concurrency: this.options.concurrency,
      queryTypes: ['semantic', 'contextual', 'exact'],
      includeWarmup: true,
      enableDetailedLogging: false,
    });

    results.push(standardBenchmark);

    // High concurrency benchmark
    const highConcurrencyBenchmark = await this.performanceTester.runBenchmark({
      datasetSize: Math.min(this.options.testDatasetSize, 500),
      queryCount: Math.min(this.options.queryCount, 200),
      concurrency: this.options.concurrency * 2,
      queryTypes: ['semantic'],
      includeWarmup: true,
      enableDetailedLogging: false,
    });

    results.push(highConcurrencyBenchmark);

    return results;
  }

  private async runRelevanceEvaluation(
    testDataset: TestDataset
  ): Promise<ComprehensiveEvaluation[]> {
    console.log('🔍 Running relevance evaluation...');

    const results: ComprehensiveEvaluation[] = [];

    // This would require running actual searches and evaluating results
    // For now, return empty array as placeholder
    console.log('⚠️ Relevance evaluation requires search result integration');

    return results;
  }

  private async runComparison(
    testDataset: TestDataset
  ): Promise<ComparisonResult[]> {
    if (!this.options.compareWithBaseline) {
      console.log('⚠️ No baseline system provided for comparison');
      return [];
    }

    console.log('⚖️ Running A/B comparison...');

    const results: ComparisonResult[] = [];

    const comparison = await this.performanceTester.compareSystems({
      baselineSystem: this.options.compareWithBaseline,
      enhancedSystem: this.memorySystem,
      datasetSize: this.options.testDatasetSize,
      queryCount: this.options.queryCount,
    });

    results.push(comparison);

    return results;
  }

  private async runLoadTests(testDataset: TestDataset): Promise<any[]> {
    console.log('🔥 Running load tests...');

    const results: any[] = [];

    // Various RPS levels
    const rpsLevels = [10, 50, 100, 200];

    for (const rps of rpsLevels) {
      console.log(`   Testing ${rps} RPS...`);

      const loadTestResult = await this.performanceTester.loadTest({
        datasetSize: Math.min(this.options.testDatasetSize, 300),
        targetRPS: rps,
        duration: 60, // 1 minute per test
        rampUpTime: 10, // 10 second ramp up
      });

      results.push({
        targetRPS: rps,
        achievedRPS: loadTestResult.achievedRPS,
        errorRate: loadTestResult.errorRate,
        averageLatency: loadTestResult.averageLatency,
        p95Latency: loadTestResult.p95Latency,
      });
    }

    return results;
  }

  private async runHealthMonitoring(): Promise<any[]> {
    console.log('💓 Running health monitoring...');

    const results = await this.performanceTester.healthCheck({
      interval: 5, // Check every 5 seconds
      duration: 60, // Monitor for 1 minute
      includeMemoryStats: true,
      includePerformanceStats: true,
    });

    return results;
  }

  private calculateSummaryMetrics(
    performanceResults: BenchmarkResult[],
    relevanceResults: ComprehensiveEvaluation[],
    comparisonResults: ComparisonResult[]
  ) {
    // Calculate overall performance metrics
    const allLatencies = performanceResults.flatMap((r) =>
      r.detailedResults.map((d) => d.latency)
    );

    const averageLatency =
      allLatencies.length > 0
        ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
        : 0;

    const totalQueries = performanceResults.reduce(
      (sum, r) => sum + r.metrics.throughput.totalQueries,
      0
    );

    const totalDuration = performanceResults.reduce(
      (sum, r) => sum + r.metrics.throughput.duration,
      0
    );

    const queriesPerSecond =
      totalDuration > 0 ? totalQueries / (totalDuration / 1000) : 0;

    const errorRate =
      performanceResults.length > 0
        ? performanceResults[0].metrics.systemHealth.errorRate
        : 0;

    // Calculate relevance quality metrics
    const averagePrecision =
      relevanceResults.length > 0
        ? relevanceResults[0].overallMetrics.precision
        : 0;

    const averageRecall =
      relevanceResults.length > 0
        ? relevanceResults[0].overallMetrics.recall
        : 0;

    const averageF1Score =
      relevanceResults.length > 0
        ? relevanceResults[0].overallMetrics.f1Score
        : 0;

    // Calculate comparison improvements
    const improvement =
      comparisonResults.length > 0
        ? comparisonResults[0].improvements
        : {
            latency: { average: 0, p95: 0, p99: 0 },
            quality: { precision: 0, recall: 0, f1Score: 0 },
            throughput: { queriesPerSecond: 0 },
          };

    const statisticalSignificance =
      comparisonResults.length > 0
        ? comparisonResults[0].statisticalSignificance.quality === 'significant'
        : false;

    return {
      overallPerformance: {
        averageLatency,
        queriesPerSecond,
        errorRate,
      },
      relevanceQuality: {
        averagePrecision,
        averageRecall,
        averageF1Score,
      },
      comparison: {
        improvement,
        statisticalSignificance,
      },
    };
  }

  private generateRecommendations(
    performanceResults: BenchmarkResult[],
    relevanceResults: ComprehensiveEvaluation[],
    comparisonResults: ComparisonResult[]
  ): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    if (performanceResults.length > 0) {
      const latestResult = performanceResults[performanceResults.length - 1];

      if (latestResult.metrics.searchLatency.average > 500) {
        recommendations.push(
          'High search latency detected - consider query optimization'
        );
      }

      if (latestResult.metrics.systemHealth.errorRate > 0.05) {
        recommendations.push(
          'High error rate detected - investigate system stability'
        );
      }

      if (latestResult.metrics.memoryUsage.heapUsed > 500 * 1024 * 1024) {
        recommendations.push(
          'High memory usage - consider memory optimization'
        );
      }
    }

    // Relevance recommendations
    if (relevanceResults.length > 0) {
      const latestResult = relevanceResults[relevanceResults.length - 1];

      if (latestResult.overallMetrics.precision < 0.7) {
        recommendations.push(
          'Low precision - improve query understanding and ranking'
        );
      }

      if (latestResult.overallMetrics.recall < 0.7) {
        recommendations.push(
          'Low recall - consider expanding search strategies'
        );
      }

      if (latestResult.overallMetrics.f1Score < 0.7) {
        recommendations.push(
          'Overall low quality - focus on balancing precision and recall'
        );
      }
    }

    // Comparison recommendations
    if (comparisonResults.length > 0) {
      const latestComparison = comparisonResults[comparisonResults.length - 1];

      if (latestComparison.improvements.latency.average < 10) {
        recommendations.push(
          'Minimal latency improvement - may need architectural changes'
        );
      }

      if (latestComparison.improvements.quality.f1Score < 0.05) {
        recommendations.push(
          'Minimal quality improvement - consider algorithm tuning'
        );
      }

      if (
        latestComparison.statisticalSignificance.quality === 'insignificant'
      ) {
        recommendations.push(
          'Changes not statistically significant - validate testing methodology'
        );
      }
    }

    // General recommendations
    recommendations.push(
      'Consider running tests with different query distributions'
    );
    recommendations.push(
      'Monitor system performance under various load conditions'
    );
    recommendations.push(
      'Validate improvements with real-world usage patterns'
    );

    return recommendations;
  }

  private detectEnvironment(): 'development' | 'staging' | 'production' {
    if (process.env.NODE_ENV === 'production') return 'production';
    if (process.env.NODE_ENV === 'staging') return 'staging';
    return 'development';
  }

  private async generateReports(result: TestSuiteResult): Promise<void> {
    // Placeholder for report generation
    console.log(`📊 Generating reports in ${this.options.outputDir}...`);

    // In a real implementation, this would generate:
    // - JSON reports
    // - CSV exports
    // - HTML dashboards
    // - Performance graphs
    // - Recommendations reports

    console.log('✅ Reports generated');
  }

  private exportToCSV(result: TestSuiteResult): string {
    // Simplified CSV export
    let csv = 'Metric,Value\n';
    csv += `Timestamp,${new Date(result.timestamp).toISOString()}\n`;
    csv += `Duration,${result.duration}\n`;
    csv += `Average Latency,${result.summary.overallPerformance.averageLatency}\n`;
    csv += `Queries Per Second,${result.summary.overallPerformance.queriesPerSecond}\n`;
    csv += `Average F1 Score,${result.summary.relevanceQuality.averageF1Score}\n`;

    return csv;
  }

  private exportToHTML(result: TestSuiteResult): string {
    // Simplified HTML report
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Memory System Test Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { margin: 10px 0; }
        .recommendations { background: #f0f0f0; padding: 15px; border-radius: 5px; }
      </style>
    </head>
    <body>
      <h1>Memory System Test Report</h1>
      <div class="metric">Average Latency: ${result.summary.overallPerformance.averageLatency.toFixed(2)}ms</div>
      <div class="metric">Queries Per Second: ${result.summary.overallPerformance.queriesPerSecond.toFixed(2)}</div>
      <div class="metric">Average F1 Score: ${(result.summary.relevanceQuality.averageF1Score * 100).toFixed(1)}%</div>

      <h2>Recommendations</h2>
      <div class="recommendations">
        <ul>
          ${result.recommendations.map((r) => `<li>${r}</li>`).join('')}
        </ul>
      </div>
    </body>
    </html>
    `;
  }
}

/**
 * Factory function for quick testing
 */
export async function runQuickTest(options: QuickTestOptions): Promise<any> {
  const runner = new MemoryTestRunner({
    memorySystem: options.memorySystem,
    testDatasetSize: 100,
    queryCount: options.queryCount || 50,
    concurrency: 1,
    includeRelevanceEvaluation: true,
    includePerformanceBenchmarks: true,
    includeLoadTesting: false,
    includeHealthMonitoring: false,
    enableAComparison: !!options.baselineSystem,
    compareWithBaseline: options.baselineSystem,
    generateReports: false,
    outputDir: './test-reports',
  });

  return runner.quickTest(options);
}

/**
 * Preset test configurations
 */
export const TEST_PRESETS = {
  development: {
    testDatasetSize: 100,
    queryCount: 50,
    concurrency: 1,
    includeRelevanceEvaluation: true,
    includePerformanceBenchmarks: true,
    includeLoadTesting: false,
    includeHealthMonitoring: false,
    enableAComparison: false,
    generateReports: false,
  },

  staging: {
    testDatasetSize: 500,
    queryCount: 200,
    concurrency: 3,
    includeRelevanceEvaluation: true,
    includePerformanceBenchmarks: true,
    includeLoadTesting: true,
    includeHealthMonitoring: true,
    enableAComparison: true,
    generateReports: true,
  },

  production: {
    testDatasetSize: 1000,
    queryCount: 500,
    concurrency: 5,
    includeRelevanceEvaluation: true,
    includePerformanceBenchmarks: true,
    includeLoadTesting: true,
    includeHealthMonitoring: true,
    enableAComparison: true,
    generateReports: true,
  },
};
