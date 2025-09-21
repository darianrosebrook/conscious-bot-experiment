# Memory System Testing Suite

Comprehensive benchmarking and evaluation framework for the enhanced memory system. Provides performance testing, relevance evaluation, and A/B comparison capabilities to validate improvements over the existing system.

## 🎯 Overview

The testing suite consists of several key components:

### 1. **Test Data Generator** (`test-data-generator.ts`)
- Generates realistic Minecraft memory content
- Creates diverse scenarios (experiences, knowledge, thoughts, observations)
- Supports multiple complexity levels (simple, medium, complex)
- Includes spatial and temporal context for comprehensive testing

### 2. **Performance Tester** (`performance-tester.ts`)
- Measures search latency, throughput, and system health
- Supports load testing at various RPS levels
- Provides detailed performance metrics and recommendations
- Includes warmup phases and statistical analysis

### 3. **Relevance Evaluator** (`relevance-evaluator.ts`)
- Evaluates search result quality using precision, recall, F1 scores
- Supports NDCG, MRR, and MAP metrics
- Provides statistical significance testing
- Generates detailed relevance judgments and recommendations

### 4. **Test Runner** (`memory-test-runner.ts`)
- Main orchestration interface for running comprehensive test suites
- Supports preset configurations (development, staging, production)
- Provides quick testing for rapid evaluation
- Generates reports in multiple formats (JSON, CSV, HTML)

## 🚀 Quick Start

### Prerequisites

1. **Install dependencies**:
```bash
cd packages/memory
pnpm install @faker-js/faker
```

2. **Set up PostgreSQL with pgvector**:
```bash
brew install postgresql pgvector
createdb minecraft_memory
```

3. **Install and start Ollama**:
```bash
ollama pull embeddinggemma
ollama serve
```

4. **Set environment variables**:
```bash
export MEMORY_DB_URL="postgresql://localhost:5432/minecraft_memory"
export OLLAMA_HOST="http://localhost:11434"
export MEMORY_EMBEDDING_MODEL="embeddinggemma"
```

### Basic Usage

```typescript
import { createEnhancedMemorySystem } from '../enhanced-memory-system';
import { MemoryTestRunner, TEST_PRESETS } from '../__tests__/memory-test-runner';

// Create memory system
const memorySystem = createEnhancedMemorySystem({
  databaseUrl: process.env.MEMORY_DB_URL!,
  ollamaHost: process.env.OLLAMA_HOST!,
  embeddingModel: process.env.MEMORY_EMBEDDING_MODEL!,
  embeddingDimension: 768,
  defaultGraphWeight: 0.5,
  defaultVectorWeight: 0.5,
  maxSearchResults: 20,
  minSimilarity: 0.1,
  enableQueryExpansion: true,
  enableDiversification: true,
  enableSemanticBoost: true,
  enablePersistence: true
});

// Run development test suite
const testRunner = new MemoryTestRunner({
  memorySystem,
  testDatasetSize: 100,
  queryCount: 50,
  concurrency: 1,
  includeRelevanceEvaluation: true,
  includePerformanceBenchmarks: true,
  includeLoadTesting: false,
  includeHealthMonitoring: false,
  enableAComparison: false,
  generateReports: true,
  outputDir: './test-reports'
});

const results = await testRunner.runTestSuite();
console.log(`Test completed: ${results.summary.overallPerformance.averageLatency.toFixed(2)}ms average latency`);
```

## 📊 Testing Capabilities

### Performance Testing

#### 1. **Standard Benchmarks**
```typescript
// Run standard performance benchmark
const benchmark = await testRunner.performanceTester.runBenchmark({
  datasetSize: 200,
  queryCount: 100,
  concurrency: 2,
  queryTypes: ['semantic', 'contextual', 'exact'],
  includeWarmup: true,
  enableDetailedLogging: true
});

console.log(`Average latency: ${benchmark.metrics.searchLatency.average}ms`);
console.log(`P95 latency: ${benchmark.metrics.searchLatency.p95}ms`);
console.log(`Throughput: ${benchmark.metrics.throughput.queriesPerSecond} QPS`);
```

#### 2. **Load Testing**
```typescript
// Test system under load
const loadTest = await testRunner.performanceTester.loadTest({
  datasetSize: 300,
  targetRPS: 50, // 50 requests per second
  duration: 120, // 2 minutes
  rampUpTime: 30 // 30 second ramp up
});

console.log(`Achieved RPS: ${loadTest.achievedRPS}`);
console.log(`Error rate: ${(loadTest.errorRate * 100).toFixed(2)}%`);
console.log(`Average latency: ${loadTest.averageLatency}ms`);
```

#### 3. **Health Monitoring**
```typescript
// Monitor system health over time
const healthData = await testRunner.performanceTester.healthCheck({
  interval: 5, // Check every 5 seconds
  duration: 60, // Monitor for 1 minute
  includeMemoryStats: true,
  includePerformanceStats: true
});

console.log(`Collected ${healthData.length} health data points`);
```

### Relevance Evaluation

#### 1. **Single Query Evaluation**
```typescript
const evaluation = await testRunner.relevanceEvaluator.evaluateQuery(
  "how to craft diamond tools",
  searchResults,
  expectedRelevantIds,
  {
    k: 10,
    includeSemanticAnalysis: true,
    includeDiversityAnalysis: true
  }
);

console.log(`Precision: ${(evaluation.metrics.precision * 100).toFixed(1)}%`);
console.log(`Recall: ${(evaluation.metrics.recall * 100).toFixed(1)}%`);
console.log(`F1 Score: ${(evaluation.metrics.f1Score * 100).toFixed(1)}%`);
```

#### 2. **Comprehensive Evaluation**
```typescript
const comprehensiveEval = await testRunner.relevanceEvaluator.evaluateQueries(
  testDataset,
  searchResults,
  {
    k: 10,
    includeSemanticAnalysis: true,
    includeDiversityAnalysis: true
  }
);

console.log(`Overall F1 Score: ${(comprehensiveEval.overallMetrics.f1Score * 100).toFixed(1)}%`);
console.log(`Best query: ${comprehensiveEval.summary.bestQuery}`);
console.log(`Worst query: ${comprehensiveEval.summary.worstQuery}`);
```

#### 3. **A/B Comparison**
```typescript
const comparison = await testRunner.relevanceEvaluator.compareResults(
  baselineResults,
  enhancedResults,
  testDataset,
  {
    k: 10,
    significanceLevel: 0.05
  }
);

console.log(`F1 Score improvement: ${(comparison.improvement.f1Score * 100).toFixed(1)}%`);
console.log(`Statistical significance: ${comparison.improvement.statisticalSignificance.f1Score}`);
```

## 🎛️ Test Presets

### Development Preset
- **Dataset Size**: 100 memories
- **Query Count**: 50 queries
- **Concurrency**: 1 (single-threaded)
- **Features**: Relevance evaluation + Performance benchmarks
- **Use Case**: Quick testing during development

### Staging Preset
- **Dataset Size**: 500 memories
- **Query Count**: 200 queries
- **Concurrency**: 3 (multi-threaded)
- **Features**: Full suite including load testing and health monitoring
- **Use Case**: Pre-production validation

### Production Preset
- **Dataset Size**: 1000 memories
- **Query Count**: 500 queries
- **Concurrency**: 5 (high concurrency)
- **Features**: Complete evaluation suite with detailed reporting
- **Use Case**: Production performance validation

## 📈 Metrics and Evaluation

### Performance Metrics
- **Search Latency**: Min, max, average, P50, P95, P99
- **Throughput**: Queries per second, total queries processed
- **Memory Usage**: Heap used, heap total, external memory
- **System Health**: Error rates, timeout rates, cache hit rates

### Relevance Metrics
- **Precision@K**: Fraction of relevant results in top-K
- **Recall@K**: Fraction of relevant results found in top-K
- **F1@K**: Harmonic mean of precision and recall
- **NDCG**: Normalized Discounted Cumulative Gain
- **MRR**: Mean Reciprocal Rank
- **MAP**: Mean Average Precision

### Quality Metrics
- **Result Diversity**: Variety in result types and sources
- **Topical Coverage**: Coverage of expected topics
- **Semantic Coherence**: Logical consistency of results
- **Context Preservation**: Maintenance of spatial/temporal context

## 📊 Reporting and Analysis

### Report Formats
- **JSON**: Complete structured data for programmatic analysis
- **CSV**: Tabular data for spreadsheet analysis
- **HTML**: Visual dashboard with charts and recommendations

### Example Report Output
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "duration": 125000,
  "summary": {
    "overallPerformance": {
      "averageLatency": 45.2,
      "queriesPerSecond": 22.1,
      "errorRate": 0.02
    },
    "relevanceQuality": {
      "averagePrecision": 0.85,
      "averageRecall": 0.78,
      "averageF1Score": 0.81
    }
  },
  "recommendations": [
    "Consider optimizing database queries for better latency",
    "High error rate detected - investigate system stability",
    "Low recall suggests expanding search strategies"
  ]
}
```

## 🔧 Advanced Usage

### Custom Test Configuration
```typescript
const customConfig = {
  memorySystem: enhancedMemorySystem,
  baselineSystem: baselineMemorySystem,
  testDatasetSize: 750,
  queryCount: 300,
  concurrency: 4,
  includeRelevanceEvaluation: true,
  includePerformanceBenchmarks: true,
  includeLoadTesting: true,
  includeHealthMonitoring: true,
  enableAComparison: true,
  generateReports: true,
  outputDir: './custom-reports'
};

const testRunner = new MemoryTestRunner(customConfig);
const results = await testRunner.runTestSuite();
```

### Quick Performance Test
```typescript
const quickResults = await testRunner.quickTest({
  memorySystem: enhancedMemorySystem,
  queryCount: 100,
  includeComparison: true,
  baselineSystem: baselineMemorySystem
});

console.log(`Quick test completed in ${quickResults.performance.duration}ms`);
console.log(`Average latency: ${quickResults.performance.metrics.searchLatency.average}ms`);
```

### Focused Load Test
```typescript
const loadResults = await testRunner.performanceTest({
  duration: 300, // 5 minutes
  targetRPS: 100, // 100 requests per second
  rampUpTime: 60 // 1 minute ramp up
});

console.log(`Load test achieved ${loadResults.metrics.throughput.queriesPerSecond} QPS`);
```

## 🎯 Best Practices

### 1. **Test Data Quality**
- Use realistic Minecraft scenarios and vocabulary
- Include diverse memory types (experiences, knowledge, thoughts, observations)
- Vary complexity levels to test different query patterns
- Include spatial and temporal context for comprehensive testing

### 2. **Query Selection**
- Mix exact, semantic, and contextual queries
- Include both simple and complex query patterns
- Test edge cases and boundary conditions
- Use queries that reflect real user behavior

### 3. **Performance Monitoring**
- Monitor system resources during testing
- Track memory usage and garbage collection
- Measure database connection pool utilization
- Watch for resource contention issues

### 4. **Result Analysis**
- Focus on both quantitative metrics and qualitative insights
- Analyze failure modes and error patterns
- Look for performance regressions over time
- Validate improvements with statistical significance

## 🚨 Troubleshooting

### Common Issues

1. **High Latency**
   - Check database connection and indexing
   - Verify embedding service health
   - Review query complexity and optimization

2. **Low Relevance Scores**
   - Validate test data quality
   - Check query understanding and processing
   - Review relevance thresholds and scoring

3. **System Errors**
   - Verify database connectivity
   - Check embedding service availability
   - Review memory usage and resource limits

### Debug Mode
```typescript
// Enable detailed logging
const testRunner = new MemoryTestRunner({
  // ... config
});

await testRunner.runTestSuite();
// Check console output for detailed logs and error messages
```

## 📈 Expected Results

### Performance Improvements
- **Search Latency**: 50-150ms (vs 100-500ms baseline)
- **Throughput**: 20-50 QPS (vs 5-20 QPS baseline)
- **Memory Usage**: Stable under load with proper garbage collection

### Relevance Improvements
- **Precision@10**: 80-95% (vs 30-50% baseline)
- **Recall@10**: 70-85% (vs 40-60% baseline)
- **F1 Score**: 75-90% (vs 35-55% baseline)

### Quality Improvements
- **Result Diversity**: 0.7-0.9 (well-balanced results)
- **Context Preservation**: 85-95% (spatial/temporal context maintained)
- **Semantic Coherence**: 80-90% (logically consistent results)

## 🎉 Conclusion

The testing suite provides comprehensive evaluation capabilities for the enhanced memory system. It enables:

- **Performance Validation**: Measure speed, throughput, and scalability
- **Quality Assessment**: Evaluate relevance, precision, and recall
- **A/B Comparison**: Compare baseline vs enhanced system performance
- **Load Testing**: Validate system behavior under various loads
- **Health Monitoring**: Track system stability over time
- **Automated Reporting**: Generate insights and recommendations

Use this suite to validate improvements, identify issues, and ensure the enhanced memory system meets performance and quality expectations before deployment.

---

**Author**: @darianrosebrook
**Version**: 1.0.0
**Last Updated**: January 2024
