/**
 * Memory Integration Test Setup with Testcontainers
 *
 * Provides PostgreSQL containers with pgvector for integration testing
 * of the memory system components.
 *
 * @author @darianrosebrook
 */

import { randomUUID } from 'crypto';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  DEFAULT_MEMORY_CONFIG,
  EnhancedMemorySystem,
  EnhancedMemorySystemConfig,
  createEnhancedMemorySystem,
} from '../memory-system';

interface MemorySeed {
  type: 'experience' | 'thought' | 'knowledge' | 'observation' | 'dialogue';
  content: string;
  source?: string;
  confidence?: number;
  entities?: string[];
  topics?: string[];
  customMetadata?: Record<string, any>;
}

interface MemoryFixture {
  container: StartedPostgreSqlContainer;
  memorySystem: EnhancedMemorySystem;
  config: EnhancedMemorySystemConfig;
  stop: () => Promise<void>;
}

class MockEmbeddingService {
  private buildVector(): number[] {
    return Array.from({ length: 768 }, (_, idx) =>
      idx % 3 === 0 ? 0.3 : idx % 3 === 1 ? 0.05 : 0.15
    );
  }

  async embed(text: string): Promise<{
    embedding: number[];
    model: {
      name: string;
      dimension: number;
      contextWindow: number;
      type: string;
    };
    confidence: number;
    tokens: number;
  }> {
    return {
      embedding: this.buildVector(),
      model: {
        name: 'test-embedding',
        dimension: 768,
        contextWindow: 8192,
        type: 'text',
      },
      confidence: 0.95,
      tokens: Math.ceil(text.length / 4), // Rough token estimate
    };
  }

  async embedWithStrategy(): Promise<{
    embedding: number[];
    model: {
      name: string;
      dimension: number;
      contextWindow: number;
      type: string;
    };
    confidence: number;
    tokens: number;
  }> {
    return this.embed('test');
  }

  async expandQuery(query: string): Promise<string> {
    return query;
  }

  async embedBatch(texts: string[]): Promise<
    Array<{
      embedding: number[];
      model: {
        name: string;
        dimension: number;
        contextWindow: number;
        type: string;
      };
      confidence: number;
      tokens: number;
    }>
  > {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}

export async function createMemoryIntegrationFixture(
  seeds: MemorySeed[] = [],
  options: {
    worldSeed?: number;
    enableAdvancedFeatures?: boolean;
    enablePersistence?: boolean;
  } = {}
): Promise<MemoryFixture> {
  // Start PostgreSQL container with pgvector
  const container = await new PostgreSqlContainer('ankane/pgvector:0.5.1')
    .withDatabase('conscious_bot_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .withEnvironment({
      POSTGRES_DB: 'conscious_bot_test',
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
    })
    .start();

  // Create memory system configuration
  const config: EnhancedMemorySystemConfig = {
    ...DEFAULT_MEMORY_CONFIG,
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    worldSeed: options.worldSeed ?? 12345,
    enablePersistence: options.enablePersistence ?? true,
    enableMemoryDecay: false, // Disable for predictable tests
    enableBehaviorTreeLearning: options.enableAdvancedFeatures ?? false,
    enableCognitivePatternTracking: options.enableAdvancedFeatures ?? false,
    enableAutoRecommendations: options.enableAdvancedFeatures ?? false,
    enableNarrativeTracking: options.enableAdvancedFeatures ?? false,
    enableMetacognition: options.enableAdvancedFeatures ?? false,
    enableSelfModelUpdates: options.enableAdvancedFeatures ?? false,
    enableToolEfficiencyTracking: options.enableAdvancedFeatures ?? false,
    enableMemoryConsolidation: options.enableAdvancedFeatures ?? false,
    enableMemoryArchiving: options.enableAdvancedFeatures ?? false,
  };

  // Create memory system
  const memorySystem = createEnhancedMemorySystem(config);

  // Replace heavy embedding service with lightweight deterministic mock
  const mockEmbedding = new MockEmbeddingService();
  (memorySystem as any).embeddingService = mockEmbedding;

  // Initialize the memory system
  await memorySystem.initialize();

  // Seed the memory system with test data
  for (const seed of seeds) {
    await memorySystem.ingestMemory({
      type: seed.type,
      content: seed.content,
      source: seed.source ?? 'test-fixture',
      confidence: seed.confidence ?? 0.9,
      entities: seed.entities,
      topics: seed.topics,
      customMetadata: seed.customMetadata,
    });
  }

  return {
    container,
    memorySystem,
    config,
    stop: async () => {
      await memorySystem.close();
      await container.stop();
    },
  };
}

export function createMemorySeed(
  content: string,
  type: MemorySeed['type'] = 'knowledge'
): MemorySeed {
  return {
    type,
    content,
    source: `seed-${randomUUID()}`,
    confidence: 0.9,
    entities: ['test', 'integration'],
    topics: ['testing', 'integration'],
  };
}

export function createExperienceSeed(
  content: string,
  entities: string[] = [],
  topics: string[] = []
): MemorySeed {
  return {
    type: 'experience',
    content,
    source: `experience-${randomUUID()}`,
    confidence: 0.95,
    entities,
    topics,
    customMetadata: {
      experienceType: 'integration_test',
      timestamp: Date.now(),
    },
  };
}

export function createThoughtSeed(
  content: string,
  reasoning: string,
  entities: string[] = [],
  topics: string[] = []
): MemorySeed {
  return {
    type: 'thought',
    content,
    source: `thought-${randomUUID()}`,
    confidence: 0.85,
    entities,
    topics,
    customMetadata: {
      reasoning,
      thoughtType: 'integration_test',
      confidence: 0.85,
    },
  };
}
