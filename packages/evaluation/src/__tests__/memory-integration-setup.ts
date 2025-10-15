/**
 * Memory Integration Setup for Performance Benchmarks
 *
 * Provides standardized memory fixtures for performance benchmarking.
 * This is separate from regular tests to avoid test interference.
 */

import { createMemoryFixture } from '../testing/postgres-test-container';

export async function createMemoryIntegrationFixture(
  seeds: any[],
  config: any = {}
) {
  return createMemoryFixture(seeds, { worldSeed: 12345, ...config });
}
