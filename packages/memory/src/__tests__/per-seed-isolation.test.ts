/**
 * Per-Seed Database Isolation Tests
 *
 * Tests to verify that different world seeds create completely isolated
 * memory databases and prevent cross-contamination between world states.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  EnhancedMemorySystem,
  createEnhancedMemorySystem,
} from '../memory-system';
import { VectorDatabase } from '../vector-database';
import { Pool } from 'pg';
import { EnhancedMemorySystemConfig } from '../memory-system';

// Helper function to create complete config with all required properties
function createCompleteConfig(
  baseConfig: Partial<EnhancedMemorySystemConfig>
): EnhancedMemorySystemConfig {
  return {
    // Database configuration
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '',
    database: 'conscious_bot',
    worldSeed: 0,
    vectorDbTableName: 'memory_chunks',

    // Embedding configuration
    ollamaHost: 'http://localhost:11434',
    embeddingModel: 'test-model',
    embeddingDimension: 768,

    // Search configuration
    defaultGraphWeight: 0.5,
    defaultVectorWeight: 0.5,
    maxSearchResults: 10,
    minSimilarity: 0.1,

    // Advanced features
    enableQueryExpansion: true,
    enableDiversification: true,
    enableSemanticBoost: true,
    enablePersistence: true,

    // Memory decay and cleanup configuration
    enableMemoryDecay: true,
    decayEvaluationInterval: 300000,
    maxMemoryRetentionDays: 30,
    frequentAccessThreshold: 0.7,
    forgottenThresholdDays: 7,
    enableMemoryConsolidation: true,
    enableMemoryArchiving: true,

    // Reflection and learning configuration
    enableNarrativeTracking: true,
    enableMetacognition: true,
    enableSelfModelUpdates: true,
    maxReflections: 10,
    reflectionCheckpointInterval: 600000,
    minLessonConfidence: 0.6,

    // Performance and optimization
    // Note: cacheSize and enableCompression are not in the interface

    // Tool efficiency and learning configuration
    enableToolEfficiencyTracking: true,
    toolEfficiencyEvaluationInterval: 300000,
    minUsesForToolRecommendation: 3,
    toolEfficiencyRecencyWeight: 0.7,
    enableBehaviorTreeLearning: true,
    enableCognitivePatternTracking: true,
    maxPatternsPerContext: 10,
    enableAutoRecommendations: true,
    toolEfficiencyThreshold: 0.6,
    toolEfficiencyCleanupInterval: 3600000,

    // Monitoring and debugging
    // Note: enableDetailedLogging, enablePerformanceMetrics, enableHealthChecks are not in the interface

    ...baseConfig,
  };
}

// Test database setup
const TEST_DB_CONFIG = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '',
  database: 'test_conscious_bot',
};

describe('Per-Seed Database Isolation', () => {
  let testPool: Pool;

  beforeAll(async () => {
    // Create test database
    testPool = new Pool({
      ...TEST_DB_CONFIG,
      database: 'postgres', // Connect to default to create test DB
    });

    try {
      await testPool.query(`CREATE DATABASE ${TEST_DB_CONFIG.database}`);
    } catch (error) {
      // Database might already exist
    }

    testPool = new Pool(TEST_DB_CONFIG);
  });

  afterAll(async () => {
    // Clean up test databases
    await testPool.end();
  });

  beforeEach(async () => {
    // Clean up any existing seed databases
    const seeds = [12345, 67890, 54321];

    for (const seed of seeds) {
      const dbName = `${TEST_DB_CONFIG.database}_seed_${seed}`;
      try {
        await testPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
      } catch (error) {
        // Ignore if database doesn't exist
      }
    }
  });

  describe('Database Creation and Isolation', () => {
    it('should create separate databases for different seeds', async () => {
      const seed1 = 12345;
      const seed2 = 67890;

      // Create two memory systems with different seeds
      const config1 = {
        ...TEST_DB_CONFIG,
        worldSeed: seed1,
        vectorDbTableName: 'memory_chunks',
        embeddingDimension: 768,
        enablePersistence: true,
      };

      const config2 = {
        ...TEST_DB_CONFIG,
        worldSeed: seed2,
        vectorDbTableName: 'memory_chunks',
        embeddingDimension: 768,
        enablePersistence: true,
      };

      const memorySystem1 = new EnhancedMemorySystem(
        createCompleteConfig({
          ...config1,
          ollamaHost: 'http://localhost:11434',
          embeddingModel: 'test-model',
          defaultGraphWeight: 0.5,
          defaultVectorWeight: 0.5,
          maxSearchResults: 10,
          minSimilarity: 0.1,
        })
      );

      const memorySystem2 = new EnhancedMemorySystem(
        createCompleteConfig({
          ...config2,
          ollamaHost: 'http://localhost:11434',
          embeddingModel: 'test-model',
          defaultGraphWeight: 0.5,
          defaultVectorWeight: 0.5,
          maxSearchResults: 10,
          minSimilarity: 0.1,
        })
      );

      // Check that different database names are generated
      expect(memorySystem1.getDatabaseName()).toBe(
        `${TEST_DB_CONFIG.database}_seed_${seed1}`
      );
      expect(memorySystem2.getDatabaseName()).toBe(
        `${TEST_DB_CONFIG.database}_seed_${seed2}`
      );
      expect(memorySystem1.getDatabaseName()).not.toBe(
        memorySystem2.getDatabaseName()
      );

      // Check world seeds are different
      expect(memorySystem1.getWorldSeed()).toBe(seed1);
      expect(memorySystem2.getWorldSeed()).toBe(seed2);

      await memorySystem1.close();
      await memorySystem2.close();
    });

    it('should use default database when worldSeed is 0', async () => {
      const config = {
        ...TEST_DB_CONFIG,
        worldSeed: 0,
        vectorDbTableName: 'memory_chunks',
        embeddingDimension: 768,
        enablePersistence: true,
      };

      const memorySystem = new EnhancedMemorySystem(
        createCompleteConfig({
          ...config,
          ollamaHost: 'http://localhost:11434',
          embeddingModel: 'test-model',
          defaultGraphWeight: 0.5,
          defaultVectorWeight: 0.5,
          maxSearchResults: 10,
          minSimilarity: 0.1,
        })
      );

      expect(memorySystem.getDatabaseName()).toBe(TEST_DB_CONFIG.database);
      expect(memorySystem.getWorldSeed()).toBe(0);

      await memorySystem.close();
    });
  });

  describe('Memory Isolation Between Seeds', () => {
    it('should isolate memories between different seeds', async () => {
      const seed1 = 12345;
      const seed2 = 67890;

      // Create memory systems for different seeds
      const memorySystem1 = createEnhancedMemorySystem(
        createCompleteConfig({
          ...TEST_DB_CONFIG,
          worldSeed: seed1,
          vectorDbTableName: 'memory_chunks',
          embeddingDimension: 768,
          enablePersistence: true,
          ollamaHost: 'http://localhost:11434',
          embeddingModel: 'test-model',
          defaultGraphWeight: 0.5,
          defaultVectorWeight: 0.5,
          maxSearchResults: 10,
          minSimilarity: 0.1,
        })
      );

      const memorySystem2 = createEnhancedMemorySystem(
        createCompleteConfig({
          ...TEST_DB_CONFIG,
          worldSeed: seed2,
          vectorDbTableName: 'memory_chunks',
          embeddingDimension: 768,
          enablePersistence: true,
          ollamaHost: 'http://localhost:11434',
          embeddingModel: 'test-model',
          defaultGraphWeight: 0.5,
          defaultVectorWeight: 0.5,
          maxSearchResults: 10,
          minSimilarity: 0.1,
        })
      );

      await memorySystem1.initialize();
      await memorySystem2.initialize();

      // Ingest memory into seed1
      const memoryId1 = await memorySystem1.ingestMemory({
        type: 'experience',
        content: 'Found diamonds in cave at coordinates (100, 50, 200)',
        source: 'minecraft-exploration',
        confidence: 0.9,
        world: 'overworld',
        position: { x: 100, y: 50, z: 200 },
      });

      expect(memoryId1).toHaveLength(1);

      // Ingest memory into seed2
      const memoryId2 = await memorySystem2.ingestMemory({
        type: 'experience',
        content: 'Built a redstone contraption',
        source: 'minecraft-building',
        confidence: 0.8,
        world: 'overworld',
        position: { x: 0, y: 64, z: 0 },
      });

      expect(memoryId2).toHaveLength(1);

      // Search in seed1 - should only find seed1 memory
      const results1 = await memorySystem1.searchMemories({
        query: 'diamonds',
        limit: 10,
      });

      expect(results1.results).toHaveLength(1);
      expect(results1.results[0].content).toContain('diamonds');

      // Search in seed2 - should only find seed2 memory
      const results2 = await memorySystem2.searchMemories({
        query: 'redstone',
        limit: 10,
      });

      expect(results2.results).toHaveLength(1);
      expect(results2.results[0].content).toContain('redstone');

      // Cross-seed search - seed1 should not find seed2 memory
      const crossResults1 = await memorySystem1.searchMemories({
        query: 'redstone',
        limit: 10,
      });

      expect(crossResults1.results).toHaveLength(0);

      // Cross-seed search - seed2 should not find seed1 memory
      const crossResults2 = await memorySystem2.searchMemories({
        query: 'diamonds',
        limit: 10,
      });

      expect(crossResults2.results).toHaveLength(0);

      await memorySystem1.close();
      await memorySystem2.close();
    });

    it('should maintain isolation after system restart', async () => {
      const seed = 54321;

      // Create first instance and ingest memory
      let memorySystem1 = createEnhancedMemorySystem(
        createCompleteConfig({
          ...TEST_DB_CONFIG,
          worldSeed: seed,
          vectorDbTableName: 'memory_chunks',
          embeddingDimension: 768,
          enablePersistence: true,
          ollamaHost: 'http://localhost:11434',
          embeddingModel: 'test-model',
          defaultGraphWeight: 0.5,
          defaultVectorWeight: 0.5,
          maxSearchResults: 10,
          minSimilarity: 0.1,
        })
      );

      await memorySystem1.initialize();

      await memorySystem1.ingestMemory({
        type: 'knowledge',
        content: 'Iron is found underground in caves',
        source: 'minecraft-wiki',
        confidence: 0.95,
      });

      await memorySystem1.close();

      // Create second instance and verify memory persists in same seed
      let memorySystem2 = createEnhancedMemorySystem(
        createCompleteConfig({
          ...TEST_DB_CONFIG,
          worldSeed: seed,
          vectorDbTableName: 'memory_chunks',
          embeddingDimension: 768,
          enablePersistence: true,
          ollamaHost: 'http://localhost:11434',
          embeddingModel: 'test-model',
          defaultGraphWeight: 0.5,
          defaultVectorWeight: 0.5,
          maxSearchResults: 10,
          minSimilarity: 0.1,
        })
      );

      await memorySystem2.initialize();

      const results = await memorySystem2.searchMemories({
        query: 'iron',
        limit: 10,
      });

      expect(results.results).toHaveLength(1);
      expect(results.results[0].content).toContain('Iron is found underground');

      await memorySystem2.close();
    });
  });

  describe('Database Status and Health Checks', () => {
    it('should provide status information including seed details', async () => {
      const seed = 11111;

      const memorySystem = createEnhancedMemorySystem(
        createCompleteConfig({
          ...TEST_DB_CONFIG,
          worldSeed: seed,
          vectorDbTableName: 'memory_chunks',
          embeddingDimension: 768,
          enablePersistence: true,
          ollamaHost: 'http://localhost:11434',
          embeddingModel: 'test-model',
          defaultGraphWeight: 0.5,
          defaultVectorWeight: 0.5,
          maxSearchResults: 10,
          minSimilarity: 0.1,
        })
      );

      await memorySystem.initialize();

      const status = await memorySystem.getStatus();

      expect(status.worldSeed).toBe(seed);
      expect(status.database.name).toBe(
        `${TEST_DB_CONFIG.database}_seed_${seed}`
      );
      expect(status.database.status).toBe('connected');
      expect(status.initialized).toBe(true);
      expect(status.services.chunkingService).toBe('ready');

      await memorySystem.close();
    });

    it('should handle invalid database connections gracefully', async () => {
      const memorySystem = createEnhancedMemorySystem(
        createCompleteConfig({
          ...TEST_DB_CONFIG,
          host: 'invalid-host',
          worldSeed: 99999,
          vectorDbTableName: 'memory_chunks',
          embeddingDimension: 768,
          enablePersistence: true,
          ollamaHost: 'http://localhost:11434',
          embeddingModel: 'test-model',
          defaultGraphWeight: 0.5,
          defaultVectorWeight: 0.5,
          maxSearchResults: 10,
          minSimilarity: 0.1,
        })
      );

      const status = await memorySystem.getStatus();

      expect(status.database.status).toBe('disconnected');
      expect(status.worldSeed).toBe(99999);

      await memorySystem.close();
    });
  });
});
