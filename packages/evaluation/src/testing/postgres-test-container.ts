import { randomUUID } from 'crypto';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  DEFAULT_MEMORY_CONFIG,
  EnhancedMemorySystem,
  EnhancedMemorySystemConfig,
  HybridSearchService,
  createEnhancedMemorySystem,
} from '@conscious-bot/memory';

interface MemorySeed {
  type: 'experience' | 'thought' | 'knowledge' | 'observation' | 'dialogue';
  content: string;
  source?: string;
  confidence?: number;
  entities?: string[];
  topics?: string[];
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

  async embed(): Promise<{
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
      tokens: 64,
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
    return this.embed();
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
    return Promise.all(texts.map(() => this.embed()));
  }
}

export async function createMemoryFixture(
  seeds: MemorySeed[] = [],
  options: { worldSeed?: number } = {}
): Promise<MemoryFixture> {
  const container = await new PostgreSqlContainer('ankane/pgvector:0.5.1')
    .withDatabase('conscious_bot')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  const config: EnhancedMemorySystemConfig = {
    ...DEFAULT_MEMORY_CONFIG,
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    worldSeed: options.worldSeed ?? 12345,
    enablePersistence: true,
    enableMemoryDecay: false,
    enableBehaviorTreeLearning: false,
    enableCognitivePatternTracking: false,
    enableAutoRecommendations: false,
    enableNarrativeTracking: false,
    enableMetacognition: false,
    enableSelfModelUpdates: false,
    enableToolEfficiencyTracking: false,
    enableMemoryConsolidation: false,
    enableMemoryArchiving: false,
  };

  const memorySystem = createEnhancedMemorySystem(config);
  // Replace heavy embedding service with lightweight deterministic mock
  const mockEmbedding = new MockEmbeddingService();
  (memorySystem as any).embeddingService = mockEmbedding;
  (memorySystem as any).hybridSearchService = new HybridSearchService({
    vectorDb: (memorySystem as any).vectorDb,
    embeddingService: mockEmbedding as any,
    graphRag: (memorySystem as any).graphRag,
    chunkingService: (memorySystem as any).chunkingService,
    knowledgeGraph: (memorySystem as any).knowledgeGraph,
    defaultGraphWeight: config.defaultGraphWeight,
    defaultVectorWeight: config.defaultVectorWeight,
    maxResults: config.maxSearchResults,
    minSimilarity: config.minSimilarity,
    enableQueryExpansion: false,
    enableDiversification: false,
    enableSemanticBoost: false,
    enableMultiHopReasoning: false,
    enableProvenanceTracking: false,
    enableDecayAwareRanking: false,
    maxHops: 3,
  });

  await memorySystem.initialize();

  for (const seed of seeds) {
    await memorySystem.ingestMemory({
      type: seed.type,
      content: seed.content,
      source: seed.source ?? 'test-fixture',
      confidence: seed.confidence ?? 0.9,
      entities: seed.entities,
      topics: seed.topics,
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

export function createMemorySeed(content: string): MemorySeed {
  return {
    type: 'knowledge',
    content,
    source: `seed-${randomUUID()}`,
  };
}
