#!/usr/bin/env node

/**
 * Performance Benchmark Runner Script
 *
 * Command-line script to run automated performance benchmarks for the Conscious Bot.
 * Can be integrated into CI/CD pipelines or run manually for performance monitoring.
 *
 * Usage:
 *   pnpm run benchmarks
 *   pnpm run benchmarks -- --quick
 *   pnpm run benchmarks -- --memory-only
 *   pnpm run benchmarks -- --output-format=json
 *
 * @author @darianrosebrook
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { PerformanceBenchmarkRunner } from './performance-benchmark-runner';

interface BenchmarkOptions {
  quick?: boolean;
  memoryOnly?: boolean;
  safetyOnly?: boolean;
  cognitiveOnly?: boolean;
  outputFormat?: 'json' | 'text' | 'both';
  outputPath?: string;
  iterations?: number;
  concurrency?: number;
}

async function parseArguments(): Promise<BenchmarkOptions> {
  const args = process.argv.slice(2);
  const options: BenchmarkOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--quick':
        options.quick = true;
        break;
      case '--memory-only':
        options.memoryOnly = true;
        break;
      case '--safety-only':
        options.safetyOnly = true;
        break;
      case '--cognitive-only':
        options.cognitiveOnly = true;
        break;
      case '--output-format':
        options.outputFormat = args[++i] as 'json' | 'text' | 'both';
        break;
      case '--output-path':
        options.outputPath = args[++i];
        break;
      case '--iterations':
        options.iterations = parseInt(args[++i]);
        break;
      case '--concurrency':
        options.concurrency = parseInt(args[++i]);
        break;
      default:
        console.log(`Unknown argument: ${arg}`);
        console.log(
          'Usage: pnpm run benchmarks [--quick] [--memory-only] [--safety-only] [--cognitive-only] [--output-format json|text|both] [--output-path <path>]'
        );
        process.exit(1);
    }
  }

  return options;
}

async function main() {
  const options = await parseArguments();

  console.log('🚀 Starting Conscious Bot Performance Benchmarks...\n');

  const benchmarkRunner = new PerformanceBenchmarkRunner();

  try {
    // Initialize the benchmark runner
    await benchmarkRunner.initialize();

    const results: any[] = [];

    // Run benchmarks based on options
    if (options.memoryOnly) {
      console.log('📊 Running Memory-only benchmarks...\n');
      const memoryResult = await benchmarkRunner.runMemoryBenchmarks();
      results.push(memoryResult);
    } else if (options.safetyOnly) {
      console.log('📊 Running Safety-only benchmarks...\n');
      const safetyResult = await benchmarkRunner.runSafetyBenchmarks();
      results.push(safetyResult);
    } else if (options.cognitiveOnly) {
      console.log('📊 Running Cognitive-only benchmarks...\n');
      const cognitiveResult = await benchmarkRunner.runCognitiveBenchmarks();
      results.push(cognitiveResult);
    } else {
      console.log('📊 Running Full System benchmarks...\n');
      const fullResults = await benchmarkRunner.runFullSystemBenchmarks();
      results.push(...fullResults);
    }

    // Generate performance report
    console.log('\n📋 Generating Performance Report...\n');
    const report = await benchmarkRunner.generatePerformanceReport();

    // Output results based on format
    if (options.outputFormat === 'json' || options.outputFormat === 'both') {
      const outputPath = options.outputPath || './benchmark-results.json';
      writeFileSync(outputPath, report);
      console.log(`📄 JSON report saved to: ${outputPath}`);
    }

    if (
      options.outputFormat === 'text' ||
      options.outputFormat === 'both' ||
      !options.outputFormat
    ) {
      console.log('\n📊 PERFORMANCE BENCHMARK RESULTS\n');
      console.log('='.repeat(50));

      const reportData = JSON.parse(report);

      console.log(`Total Benchmarks: ${reportData.summary.totalBenchmarks}`);
      console.log(
        `Average Throughput: ${reportData.summary.averageThroughput.toFixed(2)} ops/s`
      );
      console.log(
        `Average Latency: ${reportData.summary.averageLatency.toFixed(2)} ms`
      );
      console.log(
        `Total Duration: ${(reportData.summary.totalDuration / 1000).toFixed(2)} s\n`
      );

      console.log('DETAILED RESULTS:');
      console.log('-'.repeat(30));
      reportData.benchmarks.forEach((benchmark: any, index: number) => {
        console.log(`\nBenchmark ${index + 1}: ${benchmark.id}`);
        console.log(`  Duration: ${(benchmark.duration / 1000).toFixed(2)} s`);
        console.log(`  Throughput: ${benchmark.throughput.toFixed(2)} ops/s`);
        console.log(`  Avg Latency: ${benchmark.latency.avg.toFixed(2)} ms`);
        console.log(`  P95 Latency: ${benchmark.latency.p95.toFixed(2)} ms`);
        console.log(
          `  Memory Used: ${(benchmark.memoryUsage.used / 1024 / 1024).toFixed(2)} MB`
        );
        console.log(`  Error Rate: ${(benchmark.errorRate * 100).toFixed(2)}%`);
      });
    }

    // Check performance thresholds
    console.log('\n⚡ PERFORMANCE ASSESSMENT\n');
    console.log('='.repeat(30));

    const memoryBenchmark = results.find((r) =>
      r.benchmarkId.includes('memory')
    );
    const safetyBenchmark = results.find((r) =>
      r.benchmarkId.includes('safety')
    );

    if (memoryBenchmark) {
      const memoryThroughput = memoryBenchmark.metrics.throughput;
      const memoryLatency = memoryBenchmark.metrics.latency.avg;

      console.log('🧠 Memory System Performance:');
      console.log(
        `  ✅ Throughput: ${memoryThroughput.toFixed(2)} ops/s ${memoryThroughput > 50 ? '✓' : '⚠️'}`
      );
      console.log(
        `  ✅ Avg Latency: ${memoryLatency.toFixed(2)} ms ${memoryLatency < 100 ? '✓' : '⚠️'}`
      );
      console.log(
        `  ✅ P95 Latency: ${memoryBenchmark.metrics.latency.p95.toFixed(2)} ms ${memoryBenchmark.metrics.latency.p95 < 200 ? '✓' : '⚠️'}`
      );
    }

    if (safetyBenchmark) {
      const safetyThroughput = safetyBenchmark.metrics.throughput;
      const safetyLatency = safetyBenchmark.metrics.latency.avg;

      console.log('\n🛡️ Safety System Performance:');
      console.log(
        `  ✅ Throughput: ${safetyThroughput.toFixed(2)} ops/s ${safetyThroughput > 30 ? '✓' : '⚠️'}`
      );
      console.log(
        `  ✅ Avg Latency: ${safetyLatency.toFixed(2)} ms ${safetyLatency < 50 ? '✓' : '⚠️'}`
      );
      console.log(
        `  ✅ P95 Latency: ${safetyBenchmark.metrics.latency.p95.toFixed(2)} ms ${safetyBenchmark.metrics.latency.p95 < 100 ? '✓' : '⚠️'}`
      );
    }

    console.log('\n🎯 Benchmark completed successfully!');
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  } finally {
    // Always cleanup
    await benchmarkRunner.cleanup();
  }
}

// Run the benchmark script
main().catch((error) => {
  console.error('💥 Benchmark script failed:', error);
  process.exit(1);
});
