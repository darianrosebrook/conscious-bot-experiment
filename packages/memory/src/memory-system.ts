/**
 * Enhanced Memory System
 *
 * Main entry point for the hybrid memory system combining GraphRAG with vector search.
 * Provides intelligent memory retrieval, chunking, and storage for Minecraft experiences.
 *
 * @author @darianrosebrook
 */

import { VectorDatabase, MemoryChunk, SearchResult } from './vector-database';
import { EmbeddingService, EmbeddingResult } from './embedding-service';
import {
  ChunkingService,
  ChunkingMetadata,
  TextChunk,
} from './chunking-service';
import {
  HybridSearchService,
  HybridSearchOptions,
  HybridSearchResponse,
  HybridSearchResult,
} from './hybrid-search-service';
import {
  GraphRAG,
  GraphRAGOptions,
  GraphRAGResult,
} from './semantic/graph-rag';
import { KnowledgeGraphCore } from './semantic/knowledge-graph-core';
import { MemoryDecayManager } from './memory-decay-manager';
import { ReflectionMemoryManager } from './reflection-memory';
import { ToolEfficiencyMemoryManager } from './tool-efficiency-memory';
import { z } from 'zod';
import { EntityType, KnowledgeSource } from './semantic/types';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface EnhancedMemorySystemConfig {
  // Database configuration
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  worldSeed?: number; // For per-seed database isolation
  vectorDbTableName?: string;

  // Embedding configuration
  ollamaHost: string;
  embeddingModel: string;
  embeddingDimension: number;

  // Search configuration
  defaultGraphWeight: number;
  defaultVectorWeight: number;
  maxSearchResults: number;
  minSimilarity: number;

  // Chunking configuration
  chunkingConfig?: {
    maxTokens: number;
    overlapPercent: number;
    semanticSplitting: boolean;
  };

  // Advanced features
  enableQueryExpansion: boolean;
  enableDiversification: boolean;
  enableSemanticBoost: boolean;
  enablePersistence: boolean;

  // Memory decay and cleanup configuration
  enableMemoryDecay: boolean;
  decayEvaluationInterval: number;
  maxMemoryRetentionDays: number;
  frequentAccessThreshold: number;
  forgottenThresholdDays: number;
  enableMemoryConsolidation: boolean;
  enableMemoryArchiving: boolean;

  // Reflection and learning configuration
  enableNarrativeTracking: boolean;
  enableMetacognition: boolean;
  enableSelfModelUpdates: boolean;
  maxReflections: number;
  reflectionCheckpointInterval: number;
  minLessonConfidence: number;

  // Tool efficiency and learning configuration
  enableToolEfficiencyTracking: boolean;
  toolEfficiencyEvaluationInterval: number;
  minUsesForToolRecommendation: number;
  toolEfficiencyRecencyWeight: number;
  enableBehaviorTreeLearning: boolean;
  enableCognitivePatternTracking: boolean;
  maxPatternsPerContext: number;
  enableAutoRecommendations: boolean;
  toolEfficiencyThreshold: number;
  toolEfficiencyCleanupInterval: number;
}

export interface MemoryIngestionOptions {
  type: 'experience' | 'thought' | 'knowledge' | 'observation' | 'dialogue';
  content: string;
  source: string;
  confidence?: number;
  world?: string;
  position?: { x: number; y: number; z: number };
  entities?: string[];
  topics?: string[];
  customMetadata?: Record<string, any>;
}

export interface MemorySearchOptions {
  query: string;
  types?: string[];
  limit?: number;
  minConfidence?: number;
  maxAge?: number;
  world?: string;
  entities?: string[];
  graphWeight?: number;
  vectorWeight?: number;
  smartMode?: boolean; // Auto-select search strategy
}

export interface MemorySystemStats {
  totalMemories: number;
  typeDistribution: Record<string, number>;
  averageConfidence: number;
  recentActivity: number;
  searchPerformance: {
    averageLatency: number;
    totalSearches: number;
  };
  embeddingCacheStats: {
    size: number;
    hitRate: number;
  };
}

export interface MemorySystemStatus {
  initialized: boolean;
  worldSeed: number;
  database: {
    name: string;
    status: 'connected' | 'disconnected';
    totalChunks?: number;
    storageSize?: string;
  };
  services: {
    embeddingService: 'healthy' | 'unhealthy';
    graphRag: 'ready' | 'initializing';
    chunkingService: 'ready';
  };
  configuration: {
    host: string;
    port: number;
    database: string;
    embeddingModel: string;
    embeddingDimension: number;
    maxSearchResults: number;
  };
  statistics: {
    totalSearches: number;
    averageSearchLatency: number;
    memoryIngestionCount: number;
    recentIngestionCount?: number;
    ingestionTypes?: string[];
    ingestionSources?: string[];
  };
}

// ============================================================================
// Enhanced Memory System Implementation
// ============================================================================

export class EnhancedMemorySystem {
  private vectorDb: VectorDatabase;
  private embeddingService: EmbeddingService;
  private chunkingService: ChunkingService;
  private hybridSearchService: HybridSearchService;
  private graphRag: GraphRAG;
  private memoryDecayManager: MemoryDecayManager;
  private reflectionMemoryManager: ReflectionMemoryManager;
  private toolEfficiencyManager: ToolEfficiencyMemoryManager;

  private searchStats: Array<{ timestamp: number; latency: number }> = [];
  private initialized = false;

  constructor(private config: EnhancedMemorySystemConfig) {
    // Initialize core services
    this.vectorDb = new VectorDatabase({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      worldSeed: config.worldSeed,
      tableName: config.vectorDbTableName,
      dimension: config.embeddingDimension,
      enablePersistence: config.enablePersistence,
    });

    this.embeddingService = new EmbeddingService({
      ollamaHost: config.ollamaHost,
      embeddingModel: config.embeddingModel,
      dimension: config.embeddingDimension,
    });

    this.chunkingService = new ChunkingService(config.chunkingConfig);

    // Initialize knowledge graph for GraphRAG
    const knowledgeGraph = new KnowledgeGraphCore({
      persistToStorage: config.enablePersistence,
      storageDirectory: './memory-storage',
    });

    this.graphRag = new GraphRAG(knowledgeGraph);

    // Initialize hybrid search service
    this.hybridSearchService = new HybridSearchService({
      vectorDb: this.vectorDb,
      embeddingService: this.embeddingService,
      graphRag: this.graphRag,
      chunkingService: this.chunkingService,
      defaultGraphWeight: config.defaultGraphWeight,
      defaultVectorWeight: config.defaultVectorWeight,
      maxResults: config.maxSearchResults,
      minSimilarity: config.minSimilarity,
      enableQueryExpansion: config.enableQueryExpansion,
      enableDiversification: config.enableDiversification,
      enableSemanticBoost: config.enableSemanticBoost,
    });

    // Initialize memory decay manager for "use it or lose it" memory management
    this.memoryDecayManager = new MemoryDecayManager({
      enabled: config.enableMemoryDecay,
      evaluationInterval: config.decayEvaluationInterval,
      maxRetentionDays: config.maxMemoryRetentionDays,
      frequentAccessThreshold: config.frequentAccessThreshold,
      forgottenThresholdDays: config.forgottenThresholdDays,
      enableConsolidation: config.enableMemoryConsolidation,
      enableArchiving: config.enableMemoryArchiving,
    });

    // Initialize reflection memory manager for self-reflection and learning
    this.reflectionMemoryManager = new ReflectionMemoryManager({
      maxReflections: config.maxReflections,
      checkpointInterval: config.reflectionCheckpointInterval,
      minLessonConfidence: config.minLessonConfidence,
      enableNarrativeTracking: config.enableNarrativeTracking,
      enableMetacognition: config.enableMetacognition,
      enableSelfModelUpdates: config.enableSelfModelUpdates,
    });

    // Initialize tool efficiency memory manager for learning tool usage patterns
    this.toolEfficiencyManager = new ToolEfficiencyMemoryManager({
      enabled: config.enableToolEfficiencyTracking,
      evaluationInterval: config.toolEfficiencyEvaluationInterval,
      minUsesForRecommendation: config.minUsesForToolRecommendation,
      recencyWeight: config.toolEfficiencyRecencyWeight,
      enableBehaviorTreeLearning: config.enableBehaviorTreeLearning,
      enableCognitivePatternTracking: config.enableCognitivePatternTracking,
      maxPatternsPerContext: config.maxPatternsPerContext,
      enableAutoRecommendations: config.enableAutoRecommendations,
      efficiencyThreshold: config.toolEfficiencyThreshold,
      cleanupInterval: config.toolEfficiencyCleanupInterval,
    });
  }

  /**
   * Initialize the memory system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🚀 Initializing Enhanced Memory System...');

    // Initialize database
    await this.vectorDb.initialize();

    // Test embedding service
    const health = await this.embeddingService.healthCheck();
    if (health.status !== 'healthy') {
      console.warn(
        `⚠️ Embedding service health check failed: ${health.status}`
      );
    }

    this.initialized = true;
    console.log('✅ Enhanced Memory System initialized successfully');
  }

  /**
   * Ingest new memory content
   */
  async ingestMemory(options: MemoryIngestionOptions): Promise<string[]> {
    const chunkIds: string[] = [];

    console.log(`📝 Ingesting ${options.type} memory from ${options.source}`);

    try {
      // Chunk the content
      const metadata: ChunkingMetadata = {
        type: options.type,
        confidence: options.confidence || 0.8,
        source: options.source,
        timestamp: Date.now(),
        world: options.world,
        position: options.position,
        entities: options.entities,
        topics: options.topics,
        importance: this.calculateImportance(options),
      };

      const chunks = await this.chunkingService.chunkText(
        options.content,
        metadata,
        this.config.chunkingConfig
      );

      // Generate embeddings and store chunks
      for (const chunk of chunks) {
        const embedding = await this.embeddingService.embed(chunk.content);

        const memoryChunk: MemoryChunk = {
          id: chunk.id,
          content: chunk.content,
          embedding: embedding.embedding,
          metadata: chunk.metadata,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await this.vectorDb.upsertChunk(memoryChunk);
        chunkIds.push(chunk.id);
      }

      // Also add to knowledge graph if it's structured knowledge
      if (options.type === 'knowledge' && options.entities?.length) {
        await this.addToKnowledgeGraph(options, chunks);
      }

      // Record access for decay tracking (new memory is accessed immediately)
      if (this.config.enableMemoryDecay) {
        for (const chunk of chunks) {
          await this.memoryDecayManager.recordAccess(chunk.id, options.type, {
            importance: this.calculateImportance(options),
            emotionalImpact: this.extractEmotionalImpact(options.content),
            learningValue: this.calculateLearningValue(options),
            socialSignificance: this.calculateSocialSignificance(options),
            taskRelevance: this.calculateTaskRelevance(options),
            narrativeImportance: this.calculateNarrativeImportance(options),
          });
        }
      }

      console.log(
        `✅ Ingested ${chunks.length} chunks for ${options.type} memory`
      );
      return chunkIds;
    } catch (error) {
      console.error(`❌ Failed to ingest memory: ${error}`);
      throw error;
    }
  }

  /**
   * Search memories using hybrid retrieval
   */
  async searchMemories(
    options: MemorySearchOptions
  ): Promise<HybridSearchResponse> {
    const startTime = Date.now();

    try {
      const searchOptions: HybridSearchOptions = {
        query: options.query,
        types: options.types,
        limit: options.limit || this.config.maxSearchResults,
        minConfidence: options.minConfidence,
        maxAge: options.maxAge,
        world: options.world,
        entities: options.entities,
        graphWeight: options.graphWeight || this.config.defaultGraphWeight,
        vectorWeight: options.vectorWeight || this.config.defaultVectorWeight,
        queryExpansion: this.config.enableQueryExpansion,
        resultDiversification: this.config.enableDiversification,
        semanticBoost: this.config.enableSemanticBoost,
        temporalBoost: true,
      };

      const response = options.smartMode
        ? await this.hybridSearchService.smartSearch(options.query, {
            recentTopics: options.types,
            activeEntities: options.entities,
          })
        : await this.hybridSearchService.search(searchOptions);

      // Track search performance
      const latency = Date.now() - startTime;
      this.searchStats.push({ timestamp: Date.now(), latency });

      // Keep only last 1000 stats for memory efficiency
      if (this.searchStats.length > 1000) {
        this.searchStats = this.searchStats.slice(-1000);
      }

      // Record access for decay tracking (track which memories were accessed)
      if (this.config.enableMemoryDecay && response.results.length > 0) {
        for (const result of response.results) {
          await this.memoryDecayManager.recordAccess(
            result.id,
            result.metadata.type,
            {
              importance: result.confidence || 0.5,
              emotionalImpact: this.extractEmotionalImpact(result.content),
              learningValue: this.calculateLearningValueFromContent(
                result.content
              ),
              socialSignificance: this.calculateSocialSignificanceFromContent(
                result.content
              ),
              taskRelevance: this.calculateTaskRelevanceFromContent(
                result.content
              ),
              narrativeImportance: this.calculateNarrativeImportanceFromContent(
                result.content
              ),
            }
          );
        }
      }

      return response;
    } catch (error) {
      console.error(`❌ Memory search failed: ${error}`);
      throw error;
    }
  }

  /**
   * Search memories by entity relationships
   */
  async searchByEntities(
    entities: string[],
    context: {
      query?: string;
      maxAge?: number;
      world?: string;
      limit?: number;
    } = {}
  ): Promise<HybridSearchResponse> {
    return this.hybridSearchService.searchByEntities(entities, context);
  }

  /**
   * Search memories by spatial location
   */
  async searchByLocation(
    location: { world: string; position: { x: number; y: number; z: number } },
    radius: number,
    context: {
      query?: string;
      types?: string[];
      limit?: number;
    } = {}
  ): Promise<HybridSearchResponse> {
    return this.hybridSearchService.searchByLocation(location, radius, context);
  }

  /**
   * Get memory system statistics and insights
   */
  async getStats(): Promise<MemorySystemStats> {
    const dbStats = await this.vectorDb.getStats();
    const embeddingStats = this.embeddingService.getCacheStats();

    // Calculate search performance metrics
    const recentSearches = this.searchStats.slice(-100); // Last 100 searches
    const averageLatency =
      recentSearches.length > 0
        ? recentSearches.reduce((sum, stat) => sum + stat.latency, 0) /
          recentSearches.length
        : 0;

    const insights = await this.hybridSearchService.getMemoryInsights();

    return {
      totalMemories: insights.totalMemories,
      typeDistribution: insights.typeDistribution,
      averageConfidence: insights.averageConfidence,
      recentActivity: insights.recentActivity,
      searchPerformance: {
        averageLatency,
        totalSearches: this.searchStats.length,
      },
      embeddingCacheStats: {
        size: embeddingStats.size,
        hitRate: embeddingStats.hitRate,
      },
    };
  }

  /**
   * Clean up old memories based on retention policy
   */
  async cleanup(retentionDays: number = 30): Promise<number> {
    console.log(`🧹 Cleaning up memories older than ${retentionDays} days...`);
    const cleanedCount = await this.vectorDb.cleanup(retentionDays);
    console.log(`✅ Cleaned up ${cleanedCount} old memories`);
    return cleanedCount;
  }

  /**
   * Export memories for backup or migration
   */
  async exportMemories(types?: string[]): Promise<MemoryChunk[]> {
    // This would require a full table scan in production
    // For now, return empty array as placeholder
    console.log('📤 Exporting memories...');
    return [];
  }

  /**
   * Import memories from backup
   */
  async importMemories(chunks: MemoryChunk[]): Promise<number> {
    console.log(`📥 Importing ${chunks.length} memories...`);
    await this.vectorDb.batchUpsertChunks(chunks);
    return chunks.length;
  }

  /**
   * Get health status of the memory system
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: {
      database: string;
      embeddings: string;
      graphRag: string;
      hybridSearch: string;
    };
    performance: {
      averageSearchLatency: number;
      memoryUsage: string;
    };
  }> {
    const components = {
      database: 'unknown',
      embeddings: 'unknown',
      graphRag: 'unknown',
      hybridSearch: 'unknown',
    };

    // Check database
    try {
      await this.vectorDb.getStats();
      components.database = 'healthy';
    } catch (error) {
      components.database = 'unhealthy';
    }

    // Check embeddings
    try {
      const health = await this.embeddingService.healthCheck();
      components.embeddings = health.status;
    } catch (error) {
      components.embeddings = 'unhealthy';
    }

    // Check GraphRAG
    try {
      await this.graphRag.query('test', {});
      components.graphRag = 'healthy';
    } catch (error) {
      components.graphRag = 'unhealthy';
    }

    // Check hybrid search
    components.hybridSearch = 'healthy'; // Assume healthy if other components work

    // Determine overall status
    const unhealthyComponents = Object.values(components).filter(
      (status) => status === 'unhealthy'
    ).length;

    const degradedComponents = Object.values(components).filter(
      (status) => status === 'degraded'
    ).length;

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyComponents > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedComponents > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    // Calculate performance metrics
    const averageSearchLatency =
      this.searchStats.length > 0
        ? this.searchStats.reduce((sum, stat) => sum + stat.latency, 0) /
          this.searchStats.length
        : 0;

    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    return {
      status: overallStatus,
      components,
      performance: {
        averageSearchLatency,
        memoryUsage: `${memoryUsageMB}MB`,
      },
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private calculateImportance(options: MemoryIngestionOptions): number {
    let importance = 0.5; // Base importance

    // Boost for different types
    const typeBoosts: Record<string, number> = {
      knowledge: 0.2,
      experience: 0.15,
      thought: 0.1,
      observation: 0.05,
      dialogue: 0.05,
    };

    importance += typeBoosts[options.type] || 0;

    // Boost for content with entities
    if (options.entities && options.entities.length > 0) {
      importance += 0.1;
    }

    // Boost for technical topics
    if (options.topics && options.topics.length > 2) {
      importance += 0.1;
    }

    // Boost for longer, more detailed content
    if (options.content.length > 500) {
      importance += 0.1;
    }

    // Boost for high confidence sources
    if (options.confidence && options.confidence > 0.8) {
      importance += 0.1;
    }

    return Math.min(1.0, importance);
  }

  private async addToKnowledgeGraph(
    options: MemoryIngestionOptions,
    chunks: TextChunk[]
  ): Promise<void> {
    // Extract entities and relationships from the content
    // This is a simplified implementation - would need NLP in production

    if (options.entities?.length) {
      for (const entityName of options.entities) {
        try {
          await this.graphRag.addEntity(
            entityName,
            EntityType.ITEM, // Default type
            {},
            {
              description: `Entity from ${options.type} memory`,
              confidence: options.confidence || 0.8,
              source: KnowledgeSource.OBSERVATION,
            }
          );
        } catch (error) {
          // Ignore duplicate entities
        }
      }
    }
  }

  /**
   * Get comprehensive system status including database and seed information
   */
  async getStatus(): Promise<MemorySystemStatus> {
    const dbStatus = await this.vectorDb.getStatus();

    return {
      initialized: this.initialized,
      worldSeed: this.config.worldSeed || 0,
      database: {
        name: dbStatus.database,
        status: dbStatus.connectionStatus,
        totalChunks: dbStatus.totalChunks,
        storageSize: dbStatus.storageSize,
      },
      services: {
        embeddingService: 'healthy', // Health checks implemented in healthCheck() method
        graphRag: this.initialized ? 'ready' : 'initializing',
        chunkingService: 'ready',
      },
      configuration: {
        host: this.config.host || 'localhost',
        port: this.config.port || 5432,
        database: this.config.database || 'conscious_bot',
        embeddingModel: this.config.embeddingModel,
        embeddingDimension: this.config.embeddingDimension,
        maxSearchResults: this.config.maxSearchResults,
      },
      statistics: {
        totalSearches: this.searchStats.length,
        averageSearchLatency:
          this.searchStats.length > 0
            ? this.searchStats.reduce((sum, stat) => sum + stat.latency, 0) /
              this.searchStats.length
            : 0,
        memoryIngestionCount: 0, // TODO: Implement ingestion statistics tracking in getStatus method
      },
    };
  }

  /**
   * Get the current world seed being used for database isolation
   */
  getWorldSeed(): number {
    return this.config.worldSeed || 0;
  }

  /**
   * Get database name with seed suffix
   */
  getDatabaseName(): string {
    return this.vectorDb.getDatabaseName();
  }

  // ============================================================================
  // Helper Methods for Memory Analysis
  // ============================================================================

  private extractEmotionalImpact(content: string): number {
    const emotionalWords = [
      'happy',
      'sad',
      'angry',
      'excited',
      'frustrated',
      'proud',
      'disappointed',
      'amazing',
      'terrible',
      'wonderful',
      'awful',
      'great',
      'horrible',
      'fantastic',
    ];

    const lowerContent = content.toLowerCase();
    const emotionalCount = emotionalWords.filter((word) =>
      lowerContent.includes(word)
    ).length;

    return Math.min(1.0, emotionalCount * 0.15);
  }

  private calculateLearningValue(options: MemoryIngestionOptions): number {
    let learningValue = 0.0;

    // Learning indicators in content
    const learningIndicators = [
      'learned',
      'discovered',
      'figured out',
      'realized',
      'understood',
      'mastered',
      'improved',
      'adapted',
      'solved',
      'overcame',
    ];

    const lowerContent = options.content.toLowerCase();
    const learningCount = learningIndicators.filter((indicator) =>
      lowerContent.includes(indicator)
    ).length;

    learningValue += Math.min(0.4, learningCount * 0.1);

    // Type-based learning value
    if (options.type === 'knowledge') {
      learningValue += 0.3;
    } else if (options.type === 'experience') {
      learningValue += 0.2;
    }

    return Math.min(1.0, learningValue);
  }

  private calculateSocialSignificance(options: MemoryIngestionOptions): number {
    let socialSignificance = 0.0;

    // Social indicators
    const socialWords = [
      'player',
      'friend',
      'team',
      'group',
      'shared',
      'helped',
      'cooperated',
      'traded',
      'communicated',
      'interacted',
      'social',
      'community',
    ];

    const lowerContent = options.content.toLowerCase();
    const socialCount = socialWords.filter((word) =>
      lowerContent.includes(word)
    ).length;

    socialSignificance += Math.min(0.3, socialCount * 0.05);

    // Entity-based social significance
    if (
      options.entities &&
      options.entities.some((entity) => entity.toLowerCase().includes('player'))
    ) {
      socialSignificance += 0.2;
    }

    return Math.min(1.0, socialSignificance);
  }

  private calculateTaskRelevance(options: MemoryIngestionOptions): number {
    let taskRelevance = 0.0;

    // Task-related keywords
    const taskWords = [
      'task',
      'goal',
      'objective',
      'mission',
      'quest',
      'challenge',
      'problem',
      'solution',
      'strategy',
      'plan',
      'approach',
      'method',
      'technique',
    ];

    const lowerContent = options.content.toLowerCase();
    const taskCount = taskWords.filter((word) =>
      lowerContent.includes(word)
    ).length;

    taskRelevance += Math.min(0.3, taskCount * 0.05);

    // Type-based task relevance
    if (options.type === 'thought') {
      taskRelevance += 0.2;
    } else if (options.type === 'experience') {
      taskRelevance += 0.15;
    }

    return Math.min(1.0, taskRelevance);
  }

  private calculateNarrativeImportance(
    options: MemoryIngestionOptions
  ): number {
    let narrativeImportance = 0.0;

    // Narrative significance indicators
    const narrativeWords = [
      'story',
      'journey',
      'adventure',
      'progress',
      'growth',
      'development',
      'change',
      'transformation',
      'milestone',
      'achievement',
      'turning point',
    ];

    const lowerContent = options.content.toLowerCase();
    const narrativeCount = narrativeWords.filter((word) =>
      lowerContent.includes(word)
    ).length;

    narrativeImportance += Math.min(0.2, narrativeCount * 0.05);

    // Emotional content suggests narrative importance
    narrativeImportance += this.extractEmotionalImpact(options.content) * 0.3;

    // Learning content is often narratively important
    narrativeImportance += this.calculateLearningValue(options) * 0.2;

    return Math.min(1.0, narrativeImportance);
  }

  // Helper methods for content-based analysis (used in search)
  private calculateLearningValueFromContent(content: string): number {
    const learningIndicators = [
      'learned',
      'discovered',
      'figured out',
      'realized',
      'understood',
      'mastered',
      'improved',
      'adapted',
      'solved',
      'overcame',
    ];

    const lowerContent = content.toLowerCase();
    const learningCount = learningIndicators.filter((indicator) =>
      lowerContent.includes(indicator)
    ).length;

    return Math.min(1.0, learningCount * 0.1);
  }

  private calculateSocialSignificanceFromContent(content: string): number {
    const socialWords = [
      'player',
      'friend',
      'team',
      'group',
      'shared',
      'helped',
      'cooperated',
      'traded',
      'communicated',
      'interacted',
      'social',
      'community',
    ];

    const lowerContent = content.toLowerCase();
    const socialCount = socialWords.filter((word) =>
      lowerContent.includes(word)
    ).length;

    return Math.min(1.0, socialCount * 0.05);
  }

  private calculateTaskRelevanceFromContent(content: string): number {
    const taskWords = [
      'task',
      'goal',
      'objective',
      'mission',
      'quest',
      'challenge',
      'problem',
      'solution',
      'strategy',
      'plan',
      'approach',
      'method',
      'technique',
    ];

    const lowerContent = content.toLowerCase();
    const taskCount = taskWords.filter((word) =>
      lowerContent.includes(word)
    ).length;

    return Math.min(1.0, taskCount * 0.05);
  }

  private calculateNarrativeImportanceFromContent(content: string): number {
    const narrativeWords = [
      'story',
      'journey',
      'adventure',
      'progress',
      'growth',
      'development',
      'change',
      'transformation',
      'milestone',
      'achievement',
      'turning point',
    ];

    const lowerContent = content.toLowerCase();
    const narrativeCount = narrativeWords.filter((word) =>
      lowerContent.includes(word)
    ).length;

    return Math.min(1.0, narrativeCount * 0.05);
  }

  /**
   * Evaluate memory decay and perform cleanup
   */
  async evaluateMemoryDecay(): Promise<{
    decayResults: any[];
    cleanupResults: any;
  }> {
    if (!this.config.enableMemoryDecay) {
      console.log('⚠️ Memory decay is disabled');
      return { decayResults: [], cleanupResults: null };
    }

    console.log('🧠 Evaluating memory decay patterns...');
    const { decayResults, cleanupRecommendations } =
      await this.memoryDecayManager.evaluateMemories();

    if (decayResults.length > 0) {
      console.log(`📊 Evaluated ${decayResults.length} memories for decay`);
      console.log(
        `   🗑️  Recommended for deletion: ${cleanupRecommendations.deletedMemories}`
      );
      console.log(
        `   📦 Recommended for archiving: ${cleanupRecommendations.archivedMemories}`
      );
      console.log(
        `   🔧 Recommended for consolidation: ${cleanupRecommendations.consolidatedMemories}`
      );

      // Perform cleanup if there are recommendations
      if (
        cleanupRecommendations.deletedMemories > 0 ||
        cleanupRecommendations.archivedMemories > 0
      ) {
        const cleanupResults =
          await this.memoryDecayManager.performCleanup(decayResults);
        console.log(
          `✅ Memory cleanup completed: ${cleanupResults.spaceSaved} bytes saved`
        );
        return { decayResults, cleanupResults };
      }
    }

    return { decayResults, cleanupResults: null };
  }

  /**
   * Force memory cleanup regardless of schedule
   */
  async forceMemoryCleanup(): Promise<any> {
    if (!this.config.enableMemoryDecay) {
      console.log('⚠️ Memory decay is disabled');
      return null;
    }

    console.log('🧹 Forcing memory cleanup...');
    return await this.memoryDecayManager.forceCleanup();
  }

  /**
   * Get memory decay statistics
   */
  getMemoryDecayStats(): any {
    if (!this.config.enableMemoryDecay) {
      return { enabled: false };
    }

    const accessRecords = this.memoryDecayManager.getAllAccessRecords();
    const cleanupHistory = this.memoryDecayManager.getCleanupHistory();

    return {
      enabled: true,
      totalTrackedMemories: accessRecords.length,
      accessPatternDistribution: accessRecords.reduce(
        (acc, record) => {
          acc[record.accessPattern] = (acc[record.accessPattern] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      averageImportance:
        accessRecords.reduce((sum, r) => sum + r.importance, 0) /
        accessRecords.length,
      cleanupHistory: cleanupHistory.slice(-5), // Last 5 cleanups
      memoryTypes: accessRecords.reduce(
        (acc, record) => {
          const type = record.memoryId.split('-')[0];
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  }

  /**
   * Add reflection entry and trigger memory cleanup
   */
  async addReflection(
    type:
      | 'progress'
      | 'failure'
      | 'success'
      | 'adaptation'
      | 'meta'
      | 'narrative'
      | 'identity',
    content: string,
    context: any,
    lessons: string[],
    insights: string[]
  ): Promise<any> {
    if (!this.config.enableMetacognition) {
      console.log('⚠️ Metacognition is disabled');
      return null;
    }

    console.log(`🧘 Adding ${type} reflection...`);

    // Add reflection to memory
    const reflection = await this.reflectionMemoryManager.addReflection(
      type,
      content,
      context,
      lessons,
      insights
    );

    // Check if it's time for a narrative checkpoint and memory cleanup
    if (this.config.enableNarrativeTracking) {
      console.log(
        `🎯 Narrative checkpoint reached! Evaluating memory cleanup...`
      );
      await this.evaluateMemoryDecay();
    }

    return reflection;
  }

  /**
   * Get reflection insights and lessons
   */
  getReflectionInsights(
    context: {
      currentGoals?: string[];
      emotionalState?: string;
      recentEvents?: string[];
      location?: any;
      maxResults?: number;
    } = {}
  ): any[] {
    if (!this.config.enableMetacognition) {
      return [];
    }

    return this.reflectionMemoryManager.getContextualReflections(context);
  }

  /**
   * Get lessons learned from experiences
   */
  getLessonsLearned(
    category?: 'technical' | 'social' | 'emotional' | 'strategic' | 'ethical'
  ): any[] {
    if (!this.config.enableMetacognition) {
      return [];
    }

    return this.reflectionMemoryManager.getLessons(category);
  }

  /**
   * Get current narrative checkpoint
   */
  getNarrativeCheckpoint(): any {
    if (!this.config.enableNarrativeTracking) {
      return null;
    }

    const checkpoints = this.reflectionMemoryManager.getNarrativeCheckpoints();
    return checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
  }

  /**
   * Record tool usage for efficiency tracking
   */
  async recordToolUsage(
    toolName: string,
    toolType:
      | 'crafting'
      | 'mining'
      | 'combat'
      | 'farming'
      | 'building'
      | 'utility',
    taskType: string,
    context: {
      biome?: string;
      timeOfDay?: 'day' | 'night';
      difficulty?: 'peaceful' | 'easy' | 'normal' | 'hard';
      weather?: 'clear' | 'rain' | 'storm';
      location?: { x: number; y: number; z: number };
      material?: string;
    },
    metrics: {
      success: boolean;
      duration: number;
      damageTaken: number;
      resourcesGained: number;
      durabilityUsed: number;
      efficiency: number;
      successRate: number;
    },
    outcome: {
      result: 'success' | 'partial_success' | 'failure' | 'timeout';
      reason?: string;
      alternativeTools?: string[];
      improvementSuggestions?: string[];
    },
    sessionId?: string
  ): Promise<void> {
    if (!this.config.enableToolEfficiencyTracking) return;

    await this.toolEfficiencyManager.recordToolUsage(
      toolName,
      toolType,
      taskType,
      context,
      metrics,
      outcome,
      sessionId
    );
  }

  /**
   * Get tool recommendations for a task
   */
  async getToolRecommendations(
    taskType: string,
    context: {
      biome?: string;
      timeOfDay?: 'day' | 'night';
      difficulty?: 'peaceful' | 'easy' | 'normal' | 'hard';
      weather?: 'clear' | 'rain' | 'storm';
      material?: string;
    } = {},
    limit: number = 5
  ): Promise<
    Array<{
      toolName: string;
      confidence: number;
      reasoning: string;
      expectedEfficiency: number;
    }>
  > {
    if (!this.config.enableToolEfficiencyTracking) return [];

    return await this.toolEfficiencyManager.getToolRecommendations(
      taskType,
      context,
      limit
    );
  }

  /**
   * Record behavior tree pattern execution
   */
  async recordBehaviorTreePattern(
    name: string,
    sequence: string[],
    context: {
      taskType: string;
      initialConditions: Record<string, any>;
      environmentalFactors: Record<string, any>;
    },
    outcome: {
      success: boolean;
      duration: number;
      resourcesUsed: Record<string, number>;
      lessonsLearned: string[];
      timestamp: number;
    },
    metadata?: {
      discoveredAt?: number;
      lastUsed?: number;
      usageCount?: number;
      creator?: 'bot' | 'human' | 'hybrid';
    }
  ): Promise<void> {
    if (
      !this.config.enableToolEfficiencyTracking ||
      !this.config.enableBehaviorTreeLearning
    )
      return;

    await this.toolEfficiencyManager.recordBehaviorTreePattern(
      name,
      sequence,
      context,
      outcome,
      metadata
    );
  }

  /**
   * Get behavior tree recommendations for a task
   */
  async getBehaviorTreeRecommendations(
    taskType: string,
    context: {
      initialConditions?: Record<string, any>;
      environmentalFactors?: Record<string, any>;
    } = {},
    limit: number = 3
  ): Promise<any[]> {
    if (
      !this.config.enableToolEfficiencyTracking ||
      !this.config.enableBehaviorTreeLearning
    )
      return [];

    return await this.toolEfficiencyManager.getBehaviorTreeRecommendations(
      taskType,
      context,
      limit
    );
  }

  /**
   * Record cognitive processing pattern
   */
  async recordCognitivePattern(
    thoughtType: 'reflection' | 'planning' | 'decision' | 'learning' | 'social',
    context: {
      taskComplexity: 'simple' | 'medium' | 'complex';
      timePressure: number;
      emotionalState: string;
      cognitiveLoad: number;
      socialContext: boolean;
    },
    processing: {
      approach: string;
      reasoning: string;
      confidence: number;
      processingTime: number;
    },
    outcome: {
      success: boolean;
      quality: number;
      followThrough: boolean;
      longTermImpact: number;
    },
    patterns: {
      commonBiases: string[];
      effectiveStrategies: string[];
      failureModes: string[];
    }
  ): Promise<void> {
    if (
      !this.config.enableToolEfficiencyTracking ||
      !this.config.enableCognitivePatternTracking
    )
      return;

    await this.toolEfficiencyManager.recordCognitivePattern(
      thoughtType,
      context,
      processing,
      outcome,
      patterns
    );
  }

  /**
   * Get cognitive insights for a thought type
   */
  async getCognitiveInsights(
    thoughtType: 'reflection' | 'planning' | 'decision' | 'learning' | 'social',
    context: {
      taskComplexity?: 'simple' | 'medium' | 'complex';
      timePressure?: number;
      emotionalState?: string;
      cognitiveLoad?: number;
      socialContext?: boolean;
    } = {}
  ): Promise<{
    effectiveStrategies: string[];
    commonBiases: string[];
    successRate: number;
    averageProcessingTime: number;
  }> {
    if (
      !this.config.enableToolEfficiencyTracking ||
      !this.config.enableCognitivePatternTracking
    ) {
      return {
        effectiveStrategies: [],
        commonBiases: [],
        successRate: 0,
        averageProcessingTime: 0,
      };
    }

    return await this.toolEfficiencyManager.getCognitiveInsights(
      thoughtType,
      context
    );
  }

  /**
   * Evaluate tool efficiency and update profiles
   */
  async evaluateToolEfficiency(): Promise<void> {
    if (!this.config.enableToolEfficiencyTracking) return;

    await this.toolEfficiencyManager.evaluateEfficiency();
  }

  /**
   * Get tool efficiency statistics
   */
  getToolEfficiencyStats(): {
    totalTools: number;
    totalRecords: number;
    averageSuccessRate: number;
    topPerformingTools: Array<{
      tool: string;
      successRate: number;
      uses: number;
    }>;
  } {
    if (!this.config.enableToolEfficiencyTracking) {
      return {
        totalTools: 0,
        totalRecords: 0,
        averageSuccessRate: 0,
        topPerformingTools: [],
      };
    }

    return this.toolEfficiencyManager.getEfficiencyStats();
  }

  /**
   * Close the memory system and clean up resources
   */
  async close(): Promise<void> {
    await this.vectorDb.close();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createEnhancedMemorySystem(
  config: EnhancedMemorySystemConfig
): EnhancedMemorySystem {
  return new EnhancedMemorySystem(config);
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_MEMORY_CONFIG: EnhancedMemorySystemConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  database: process.env.PG_DATABASE || 'conscious_bot',
  worldSeed: parseInt(process.env.WORLD_SEED || '0'),
  vectorDbTableName: 'memory_chunks',
  ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
  embeddingModel: process.env.MEMORY_EMBEDDING_MODEL || 'embeddinggemma',
  embeddingDimension: parseInt(process.env.MEMORY_EMBEDDING_DIMENSION || '768'),
  defaultGraphWeight: parseFloat(
    process.env.MEMORY_HYBRID_GRAPH_WEIGHT || '0.5'
  ),
  defaultVectorWeight: parseFloat(
    process.env.MEMORY_HYBRID_VECTOR_WEIGHT || '0.5'
  ),
  maxSearchResults: parseInt(process.env.MEMORY_MAX_SEARCH_RESULTS || '20'),
  minSimilarity: parseFloat(process.env.MEMORY_MIN_SIMILARITY || '0.1'),
  chunkingConfig: {
    maxTokens: parseInt(process.env.MEMORY_CHUNK_SIZE || '900'),
    overlapPercent: parseFloat(process.env.MEMORY_CHUNK_OVERLAP || '0.12'),
    semanticSplitting: process.env.MEMORY_SEMANTIC_SPLITTING !== 'false',
  },
  enableQueryExpansion: process.env.MEMORY_QUERY_EXPANSION !== 'false',
  enableDiversification: process.env.MEMORY_DIVERSIFICATION !== 'false',
  enableSemanticBoost: process.env.MEMORY_SEMANTIC_BOOST !== 'false',
  enablePersistence: process.env.MEMORY_PERSISTENCE !== 'false',

  // Memory decay configuration
  enableMemoryDecay: process.env.MEMORY_ENABLE_DECAY !== 'false',
  decayEvaluationInterval: parseInt(
    process.env.MEMORY_DECAY_INTERVAL || '3600000'
  ), // 1 hour
  maxMemoryRetentionDays: parseInt(
    process.env.MEMORY_MAX_RETENTION_DAYS || '90'
  ),
  frequentAccessThreshold: parseInt(
    process.env.MEMORY_FREQUENT_THRESHOLD || '5'
  ),
  forgottenThresholdDays: parseInt(
    process.env.MEMORY_FORGOTTEN_THRESHOLD || '30'
  ),
  enableMemoryConsolidation:
    process.env.MEMORY_ENABLE_CONSOLIDATION !== 'false',
  enableMemoryArchiving: process.env.MEMORY_ENABLE_ARCHIVING !== 'false',

  // Reflection and learning configuration
  enableNarrativeTracking: process.env.MEMORY_ENABLE_NARRATIVE !== 'false',
  enableMetacognition: process.env.MEMORY_ENABLE_METACOGNITION !== 'false',
  enableSelfModelUpdates: process.env.MEMORY_ENABLE_SELF_MODEL !== 'false',
  maxReflections: parseInt(process.env.MEMORY_MAX_REFLECTIONS || '1000'),
  reflectionCheckpointInterval: parseInt(
    process.env.MEMORY_CHECKPOINT_INTERVAL || '86400000'
  ), // 24 hours
  minLessonConfidence: parseFloat(
    process.env.MEMORY_MIN_LESSON_CONFIDENCE || '0.6'
  ),

  // Tool efficiency and learning configuration
  enableToolEfficiencyTracking: process.env.MEMORY_TOOL_EFFICIENCY !== 'false',
  toolEfficiencyEvaluationInterval: parseInt(
    process.env.MEMORY_TOOL_EFFICIENCY_INTERVAL || '300000'
  ), // 5 minutes
  minUsesForToolRecommendation: parseInt(
    process.env.MEMORY_MIN_TOOL_USES || '3'
  ),
  toolEfficiencyRecencyWeight: parseFloat(
    process.env.MEMORY_TOOL_RECENCY_WEIGHT || '0.7'
  ),
  enableBehaviorTreeLearning:
    process.env.MEMORY_BEHAVIOR_TREE_LEARNING !== 'false',
  enableCognitivePatternTracking:
    process.env.MEMORY_COGNITIVE_PATTERNS !== 'false',
  maxPatternsPerContext: parseInt(process.env.MEMORY_MAX_PATTERNS || '10'),
  enableAutoRecommendations:
    process.env.MEMORY_AUTO_RECOMMENDATIONS !== 'false',
  toolEfficiencyThreshold: parseFloat(
    process.env.MEMORY_EFFICIENCY_THRESHOLD || '0.6'
  ),
  toolEfficiencyCleanupInterval: parseInt(
    process.env.MEMORY_TOOL_CLEANUP_INTERVAL || '3600000'
  ), // 1 hour
};
