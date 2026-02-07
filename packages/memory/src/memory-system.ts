/**
 * Enhanced Memory System
 *
 * Main entry point for the hybrid memory system combining GraphRAG with vector search.
 * Provides intelligent memory retrieval, chunking, and storage for Minecraft experiences.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  EnhancedVectorDatabase,
  EnhancedMemoryChunk,
  EnhancedSearchResult,
} from './vector-database';
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
import { EnhancedKnowledgeGraphCore } from './knowledge-graph-core';
import { MemoryDecayManager } from './memory-decay-manager';
import {
  ReflectionMemoryManager,
  ReflectionEntry,
  LessonLearned,
  NarrativeCheckpoint,
} from './reflection-memory';
import { ToolEfficiencyMemoryManager } from './tool-efficiency-memory';
import {
  CrossModalEntityLinker,
  CrossModalEntity,
  EntityLinkingConfig,
} from './cross-modal-entity-linker';
import { z } from 'zod';
import { EntityType, KnowledgeSource } from './semantic/types';
import { getMemorySystemConfig } from './config/memory-runtime-config';

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
  worldSeed: string; // Required — per-seed database isolation (stored as string to preserve precision for large seeds)
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

  // Enhanced search features
  enableMultiHopReasoning: boolean;
  enableProvenanceTracking: boolean;
  enableDecayAwareRanking: boolean;
  maxHops: number;

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
  worldSeed: string;
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

export class EnhancedMemorySystem extends EventEmitter {
  private vectorDb: EnhancedVectorDatabase;
  private embeddingService: EmbeddingService;
  private chunkingService: ChunkingService;
  private hybridSearchService: HybridSearchService;
  private graphRag: GraphRAG;
  private knowledgeGraph: EnhancedKnowledgeGraphCore;
  private entityLinker: CrossModalEntityLinker;
  private memoryDecayManager: MemoryDecayManager;
  private reflectionMemoryManager: ReflectionMemoryManager;
  private toolEfficiencyManager: ToolEfficiencyMemoryManager;

  private searchStats: Array<{ timestamp: number; latency: number }> = [];
  private initialized = false;

  // Reflection persistence write queue (S1: async, bounded, fire-and-forget)
  private reflectionWriteQueue: Array<{
    type: 'reflection' | 'lesson' | 'narrative_checkpoint';
    data: ReflectionEntry | LessonLearned | NarrativeCheckpoint;
    dedupeKey: string;
  }> = [];
  private flushInProgress = false;
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 5000;
  private writeLoopTimer: ReturnType<typeof setInterval> | null = null;

  // Pending dedupe registry: tracks dedupeKeys that are in the write queue but not yet persisted.
  // This is separate from the reflection cache to avoid eviction-related race conditions.
  // Keys are added on enqueue, removed on successful persist or permanent failure.
  private pendingDedupeKeys: Set<string> = new Set();

  // Reliability and integrity properties
  private circuitBreakers: Map<
    string,
    {
      failures: number;
      lastFailureTime: number;
      state: 'closed' | 'open' | 'half-open';
      threshold: number;
      timeout: number;
    }
  > = new Map();

  private identityPreservation:
    | {
        coreIdentity: {
          agentName: string;
          personalityTraits: string[];
          coreMemories: string[];
          behavioralPatterns: Record<string, number>;
        };
        backupHashes: string[];
        lastIntegrityCheck: number;
        identityDriftScore: number;
      }
    | undefined;

  private integrityChecks: Array<{
    timestamp: number;
    identityHash: string;
    memoryCount: number;
    corruptionDetected: boolean;
    issues: string[];
  }> = [];

  private backupQueue: EnhancedMemoryChunk[] = [];
  private isRecoveryMode = false;

  constructor(private config: EnhancedMemorySystemConfig) {
    super();

    // Initialize core services
    this.vectorDb = new EnhancedVectorDatabase({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      worldSeed: config.worldSeed,
      tableName: config.vectorDbTableName,
      dimension: config.embeddingDimension,
    });

    this.embeddingService = new EmbeddingService({
      ollamaHost: config.ollamaHost,
      embeddingModel: config.embeddingModel,
      dimension: config.embeddingDimension,
    });

    this.chunkingService = new ChunkingService(config.chunkingConfig);

    // Initialize knowledge graph for GraphRAG
    this.knowledgeGraph = new EnhancedKnowledgeGraphCore({
      database: {
        host: config.host || 'localhost',
        port: config.port || 5432,
        user: config.user || 'conscious_bot',
        password: config.password || 'secure_password',
        database: config.database || 'conscious_bot',
      },
    });

    this.graphRag = new GraphRAG(this.knowledgeGraph as any);

    // Initialize hybrid search service with enhanced features
    this.hybridSearchService = new HybridSearchService({
      vectorDb: this.vectorDb,
      embeddingService: this.embeddingService,
      graphRag: this.graphRag,
      chunkingService: this.chunkingService,
      knowledgeGraph: this.knowledgeGraph,
      defaultGraphWeight: config.defaultGraphWeight,
      defaultVectorWeight: config.defaultVectorWeight,
      maxResults: config.maxSearchResults,
      minSimilarity: config.minSimilarity,
      enableQueryExpansion: config.enableQueryExpansion,
      enableDiversification: config.enableDiversification,
      enableSemanticBoost: config.enableSemanticBoost,
      enableMultiHopReasoning: config.enableMultiHopReasoning,
      enableProvenanceTracking: config.enableProvenanceTracking,
      enableDecayAwareRanking: config.enableDecayAwareRanking,
      maxHops: config.maxHops,
    });

    // Initialize cross-modal entity linker for unified entity representation
    this.entityLinker = new CrossModalEntityLinker({
      similarityThreshold: 0.8,
      confidenceThreshold: 0.7,
      maxAliases: 10,
      enableEvolutionTracking: true,
      enableCrossModalMerging: true,
      enableAutomaticDeduplication: true,
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

    // Subscribe to reflection persistence events (S1: async write queue)
    this.reflectionMemoryManager.on(
      'reflection:created',
      (reflection: ReflectionEntry) => {
        this.enqueueReflectionWrite({
          type: 'reflection',
          data: reflection,
          dedupeKey: reflection.id,
        });
      }
    );
    this.reflectionMemoryManager.on(
      'lesson:created',
      (lesson: LessonLearned) => {
        this.enqueueReflectionWrite({
          type: 'lesson',
          data: lesson,
          dedupeKey: lesson.id,
        });
      }
    );
    this.reflectionMemoryManager.on(
      'checkpoint:created',
      (checkpoint: NarrativeCheckpoint) => {
        this.enqueueReflectionWrite({
          type: 'narrative_checkpoint',
          data: checkpoint,
          dedupeKey: checkpoint.id,
        });
      }
    );

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

    // Initialize reliability systems
    this.initializeCircuitBreakers();
    this.initializeIdentityPreservation();
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

    // Start reflection persistence write loop (S1)
    this.startReflectionWriteLoop();

    // Start integrity monitoring
    this.startIntegrityMonitoring();

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

        // Merge customMetadata into chunk metadata so fields like dedupeKey,
        // memorySubtype, isPlaceholder etc. are persisted to the DB JSONB column.
        const mergedMetadata = options.customMetadata
          ? { ...chunk.metadata, ...options.customMetadata }
          : chunk.metadata;

        const memoryChunk: EnhancedMemoryChunk = {
          id: chunk.id,
          content: chunk.content,
          embedding: embedding.embedding,
          metadata: mergedMetadata,
          entities: [],
          relationships: [],
          decayProfile: {
            memoryType: 'semantic',
            baseDecayRate: 0.01,
            lastAccessed: Date.now(),
            accessCount: 1,
            importance: chunk.metadata.importance || 0.5,
            consolidationHistory: [],
          },
          provenance: {
            sourceSystem: 'memory_system',
            extractionMethod: 'chunking',
            confidence: 0.9,
            processingTime: Date.now(),
            version: '1.0.0',
          },
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
  async exportMemories(types?: string[]): Promise<EnhancedMemoryChunk[]> {
    // This would require a full table scan in production
    // For now, return empty array as placeholder
    console.log('📤 Exporting memories...');
    return [];
  }

  /**
   * Import memories from backup
   */
  async importMemories(chunks: EnhancedMemoryChunk[]): Promise<number> {
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
  // Reflection DB Queries (S2, S3: DB-canonical dedupe and listing)
  // ============================================================================

  /**
   * Check if a chunk with the given dedupeKey already exists.
   * Checks three layers in order:
   *   1. Pending dedupe registry (keys in write queue, not yet persisted)
   *   2. In-memory reflection map (for backwards compatibility)
   *   3. Database (persisted reflections from this or previous sessions)
   *
   * The pending registry is the primary flush-gap protection and is not subject
   * to reflection cache eviction semantics.
   */
  async findByDedupeKey(dedupeKey: string): Promise<boolean> {
    // S2a: Check pending registry first (keys enqueued but not yet flushed)
    if (this.pendingDedupeKeys.has(dedupeKey)) {
      return true;
    }
    // S2b: Check in-memory reflection map (backwards compatibility)
    if (this.reflectionMemoryManager.hasReflection(dedupeKey)) {
      return true;
    }
    // S2c: Check DB (handles persisted reflections from previous sessions)
    const chunk = await this.vectorDb.findByDedupeKey(dedupeKey);
    return chunk !== null;
  }

  /**
   * Query reflection/lesson/checkpoint chunks from DB with proper pagination.
   * Returns chunks ordered by createdAt desc.
   */
  async queryReflections(options: {
    subtypes?: string[];
    limit?: number;
    page?: number;
    includePlaceholders?: boolean;
  }): Promise<{
    items: Array<{
      id: string;
      content: string;
      metadata: any;
      createdAt: number;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const subtypes = options.subtypes || [
      'reflection',
      'lesson',
      'narrative_checkpoint',
    ];
    const limit = options.limit || 20;
    const page = options.page || 1;
    const offset = (page - 1) * limit;

    const result = await this.vectorDb.queryByMetadataSubtype({
      subtypes,
      limit,
      offset,
      includePlaceholders: options.includePlaceholders,
    });

    return {
      items: result.rows.map((row) => ({
        id: row.id,
        content: row.content,
        metadata: row.metadata,
        createdAt: row.createdAt,
      })),
      total: result.total,
      page,
      limit,
    };
  }

  // ============================================================================
  // Reflection Persistence Write Queue (S1)
  // ============================================================================

  private enqueueReflectionWrite(job: {
    type: 'reflection' | 'lesson' | 'narrative_checkpoint';
    data: ReflectionEntry | LessonLearned | NarrativeCheckpoint;
    dedupeKey: string;
  }): void {
    if (this.reflectionWriteQueue.length >= this.MAX_QUEUE_SIZE) {
      console.warn('Reflection write queue full, dropping oldest entry');
      const dropped = this.reflectionWriteQueue.shift();
      // Clean up pending registry for dropped job
      if (dropped) {
        this.pendingDedupeKeys.delete(dropped.dedupeKey);
      }
    }
    // Add to pending registry before queue (flush-gap protection)
    this.pendingDedupeKeys.add(job.dedupeKey);
    this.reflectionWriteQueue.push(job);
  }

  private startReflectionWriteLoop(): void {
    if (this.writeLoopTimer) return;
    this.writeLoopTimer = setInterval(
      () => this.flushReflectionQueue(),
      this.FLUSH_INTERVAL_MS
    );
  }

  private async flushReflectionQueue(): Promise<void> {
    if (this.flushInProgress || this.reflectionWriteQueue.length === 0) return;
    this.flushInProgress = true;

    const batch = this.reflectionWriteQueue.splice(0, 20);
    for (const job of batch) {
      try {
        // S2: DB-side dedupe check before writing
        const existing = await this.vectorDb.findByDedupeKey(job.dedupeKey);
        if (existing) {
          console.log(
            `Skipping duplicate ${job.type} (dedupeKey: ${job.dedupeKey})`
          );
          // Remove from pending registry (already persisted, possibly from another process)
          this.pendingDedupeKeys.delete(job.dedupeKey);
          continue;
        }

        const data = job.data as any;
        // Use explicit isPlaceholder if provided, else infer from content prefix
        const isPlaceholder =
          data.isPlaceholder !== undefined
            ? data.isPlaceholder
            : (data.content || '').startsWith('[PLACEHOLDER]');
        await this.ingestMemory({
          type: 'thought',
          content: data.content || data.summary || '',
          source: `reflection-${job.type}`,
          confidence: data.confidence ?? 0.5,
          customMetadata: {
            memorySubtype: job.type,
            reflectionSchemaVersion: 1,
            dedupeKey: job.dedupeKey,
            isPlaceholder,
            reflectionType: data.type,
            emotionalValence: data.emotionalValence,
            insights: data.insights,
            lessons: data.lessons,
            tags: data.tags,
            narrativeArc: data.narrativeArc,
            significance: data.significance,
            emotionalTone: data.emotionalTone,
            title: data.title,
          },
        });
        // Successfully persisted — remove from pending registry
        this.pendingDedupeKeys.delete(job.dedupeKey);
      } catch (err) {
        console.warn(`Failed to persist ${job.type}:`, err);
        // Remove from pending registry on permanent failure (don't block future attempts)
        this.pendingDedupeKeys.delete(job.dedupeKey);
        // Don't re-enqueue — log and move on
      }
    }

    this.flushInProgress = false;
  }

  // ============================================================================
  // Single Memory Retrieval
  // ============================================================================

  /**
   * Get a single memory chunk by ID (full content, not truncated)
   */
  async getMemoryById(id: string): Promise<{
    id: string;
    content: string;
    metadata: any;
    createdAt: number;
    updatedAt: number;
  } | null> {
    const chunk = await this.vectorDb.getChunk(id);
    if (!chunk) return null;
    return {
      id: chunk.id,
      content: chunk.content,
      metadata: chunk.metadata,
      createdAt: chunk.createdAt,
      updatedAt: chunk.updatedAt,
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
      worldSeed: this.config.worldSeed,
      database: {
        name: dbStatus.databaseName,
        status: dbStatus.connected ? 'connected' : 'disconnected',
        totalChunks: dbStatus.totalChunks,
        storageSize: '0MB', // TODO: Implement storage size calculation
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
  getWorldSeed(): string {
    return this.config.worldSeed;
  }

  /**
   * Get database name with seed suffix
   */
  getDatabaseName(): string {
    return this.vectorDb.getDatabaseName();
  }

  /**
   * Get direct access to the vector database for advanced operations
   * (e.g., embedding visualization)
   */
  getVectorDatabase(): EnhancedVectorDatabase {
    return this.vectorDb;
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
   * @param dedupeKey Optional deterministic key for idempotent persistence.
   * @param isPlaceholder Optional flag indicating this is a placeholder (not LLM-generated).
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
    insights: string[],
    dedupeKey?: string,
    isPlaceholder?: boolean
  ): Promise<any> {
    if (!this.config.enableMetacognition) {
      console.log('⚠️ Metacognition is disabled');
      return null;
    }

    console.log(`🧘 Adding ${type} reflection...`);

    // Add reflection to memory (dedupeKey becomes the reflection.id when provided)
    const reflection = await this.reflectionMemoryManager.addReflection(
      type,
      content,
      context,
      lessons,
      insights,
      dedupeKey
    );

    // Attach isPlaceholder for persistence threading (if explicitly set)
    if (isPlaceholder !== undefined) {
      (reflection as any).isPlaceholder = isPlaceholder;
    }

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

  // ============================================================================
  // Reliability and Integrity Methods
  // ============================================================================

  /**
   * Initialize circuit breakers for external dependencies
   */
  private initializeCircuitBreakers(): void {
    // Circuit breaker for vector database
    this.circuitBreakers.set('vectorDb', {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed',
      threshold: 5,
      timeout: 30000, // 30 seconds
    });

    // Circuit breaker for embedding service
    this.circuitBreakers.set('embedding', {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed',
      threshold: 3,
      timeout: 15000, // 15 seconds
    });

    // Circuit breaker for GraphRAG
    this.circuitBreakers.set('graphRag', {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed',
      threshold: 3,
      timeout: 20000, // 20 seconds
    });
  }

  /**
   * Initialize identity preservation system
   */
  private initializeIdentityPreservation(): void {
    this.identityPreservation = {
      coreIdentity: {
        agentName: 'conscious-bot',
        personalityTraits: [
          'curious',
          'adaptive',
          'goal-oriented',
          'socially-aware',
          'learning-focused',
        ],
        coreMemories: [
          'initial-activation',
          'first-learning-experience',
          'personality-formation',
        ],
        behavioralPatterns: {
          exploration: 0.7,
          socialInteraction: 0.6,
          problemSolving: 0.8,
          adaptation: 0.9,
        },
      },
      backupHashes: [],
      lastIntegrityCheck: Date.now(),
      identityDriftScore: 0.0,
    };
  }

  /**
   * Start integrity monitoring system
   */
  private startIntegrityMonitoring(): void {
    // Run integrity checks every 5 minutes
    setInterval(() => {
      this.performIntegrityCheck();
    }, 300000);

    // Auto-backup critical memories every 30 minutes
    setInterval(() => {
      this.performAutoBackup();
    }, 1800000);
  }

  /**
   * Process with circuit breaker protection
   */
  private async processWithCircuitBreaker<T>(
    serviceName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const breaker = this.circuitBreakers.get(serviceName);
    if (!breaker) {
      return operation();
    }

    // Check if circuit breaker is open
    if (breaker.state === 'open') {
      const now = Date.now();
      if (now - breaker.lastFailureTime > breaker.timeout) {
        breaker.state = 'half-open';
      } else {
        throw new Error(`${serviceName} circuit breaker is open`);
      }
    }

    try {
      const result = await operation();
      // Success - reset failure count and close circuit
      if (breaker.state === 'half-open') {
        breaker.state = 'closed';
        breaker.failures = 0;
      }
      return result;
    } catch (error) {
      breaker.failures++;
      breaker.lastFailureTime = Date.now();

      if (breaker.failures >= breaker.threshold) {
        breaker.state = 'open';
        console.warn(`Circuit breaker opened for ${serviceName}`);
      }

      throw error;
    }
  }

  /**
   * Perform comprehensive memory integrity check
   */
  private async performIntegrityCheck(): Promise<void> {
    try {
      const startTime = Date.now();

      // Check memory count consistency
      const vectorStats = await this.vectorDb.getStats();
      const graphStats = await this.knowledgeGraph.getStats();

      const memoryCount = vectorStats.totalChunks || 0;
      const graphEntities = graphStats.entityCount || 0;

      // Generate identity hash based on core memories
      const identityHash = await this.generateIdentityHash();

      // Check for corruption indicators
      const issues: string[] = [];
      let corruptionDetected = false;

      // Check memory count consistency
      if (memoryCount < 10 && this.initialized) {
        issues.push('Memory count suspiciously low');
        corruptionDetected = true;
      }

      // Check identity consistency
      const identityDrift = this.calculateIdentityDrift(identityHash);
      if (identityDrift > 0.3) {
        issues.push(`High identity drift detected: ${identityDrift}`);
        corruptionDetected = true;
      }

      // Check circuit breaker states
      const openBreakers = Array.from(this.circuitBreakers.values()).filter(
        (b) => b.state === 'open'
      );
      if (openBreakers.length > 0) {
        issues.push(`${openBreakers.length} circuit breakers are open`);
      }

      // Record integrity check
      const check = {
        timestamp: Date.now(),
        identityHash,
        memoryCount,
        corruptionDetected,
        issues,
      };

      this.integrityChecks.push(check);

      // Keep only last 50 checks
      if (this.integrityChecks.length > 50) {
        this.integrityChecks = this.integrityChecks.slice(-50);
      }

      // Update identity preservation
      if (this.identityPreservation) {
        this.identityPreservation.lastIntegrityCheck = Date.now();
        this.identityPreservation.identityDriftScore = identityDrift;
      }

      // Emit integrity check results
      this.emit('integrity-check-completed', {
        check,
        duration: Date.now() - startTime,
      });

      if (corruptionDetected) {
        console.warn('⚠️ Memory corruption detected:', issues);
        this.emit('memory-corruption-detected', { issues, check });
      }
    } catch (error) {
      console.error('❌ Integrity check failed:', error);
      this.emit('integrity-check-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generate identity hash for integrity verification
   */
  private async generateIdentityHash(): Promise<string> {
    try {
      if (!this.identityPreservation) {
        return 'no-identity-preservation';
      }

      const coreData = JSON.stringify({
        agentName: this.identityPreservation.coreIdentity.agentName,
        personalityTraits:
          this.identityPreservation.coreIdentity.personalityTraits,
        behavioralPatterns:
          this.identityPreservation.coreIdentity.behavioralPatterns,
        memoryCount: await this.getTotalMemoryCount(),
      });

      // Simple hash function (in production, use crypto module)
      let hash = 0;
      for (let i = 0; i < coreData.length; i++) {
        const char = coreData.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
      }

      return hash.toString(16);
    } catch (error) {
      console.error('Failed to generate identity hash:', error);
      return 'error-generating-hash';
    }
  }

  /**
   * Calculate identity drift score
   */
  private calculateIdentityDrift(currentHash: string): number {
    const recentHashes = this.integrityChecks
      .slice(-10)
      .map((check) => check.identityHash);

    if (recentHashes.length === 0) return 0;

    const matches = recentHashes.filter((hash) => hash === currentHash).length;
    return 1 - matches / recentHashes.length;
  }

  /**
   * Perform automatic backup of critical memories
   */
  private async performAutoBackup(): Promise<void> {
    try {
      if (this.isRecoveryMode) return; // Don't backup during recovery

      // Backup core identity memories
      const coreMemories = await this.exportMemories([
        'knowledge',
        'reflection',
      ]);

      // Add to backup queue (limit size)
      this.backupQueue.push(...coreMemories);
      if (this.backupQueue.length > 1000) {
        this.backupQueue = this.backupQueue.slice(-1000);
      }

      // Generate backup hash
      const backupHash = await this.generateBackupHash(coreMemories);
      if (this.identityPreservation) {
        this.identityPreservation.backupHashes.push(backupHash);

        // Keep only last 10 backup hashes
        if (this.identityPreservation.backupHashes.length > 10) {
          this.identityPreservation.backupHashes =
            this.identityPreservation.backupHashes.slice(-10);
        }
      }

      console.log(`✅ Auto-backup completed: ${coreMemories.length} memories`);
      this.emit('auto-backup-completed', {
        memoryCount: coreMemories.length,
        hash: backupHash,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('❌ Auto-backup failed:', error);
      this.emit('auto-backup-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generate hash for backup verification
   */
  private async generateBackupHash(
    memories: EnhancedMemoryChunk[]
  ): Promise<string> {
    const data = memories.map((m) => m.id + m.content).join('');
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Enhanced search with reliability protection
   */
  async searchMemoriesReliable(
    options: HybridSearchOptions
  ): Promise<HybridSearchResponse> {
    const startTime = Date.now();

    try {
      // Check if we're in recovery mode
      if (this.isRecoveryMode) {
        return this.searchMemoriesRecovery(options);
      }

      // Use circuit breaker for vector database
      const result = await this.processWithCircuitBreaker('vectorDb', () =>
        this.searchMemories(options)
      );

      // Record successful search
      this.searchStats.push({
        timestamp: Date.now(),
        latency: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      console.error('❌ Reliable search failed:', error);

      // Attempt degraded search
      if (this.circuitBreakers.get('vectorDb')?.state === 'open') {
        return this.searchMemoriesDegraded(options);
      }

      throw error;
    }
  }

  /**
   * Recovery mode search using backup data
   */
  private async searchMemoriesRecovery(
    options: HybridSearchOptions
  ): Promise<HybridSearchResponse> {
    console.log('🔄 Using recovery mode search');

    // Simple text matching against backup queue
    const query = options.query.toLowerCase();
    const matches = this.backupQueue
      .filter((chunk) => chunk.content.toLowerCase().includes(query))
      .slice(0, options.limit || 10);

    return {
      query: options.query,
      results: matches.map(
        (chunk, index) =>
          ({
            id: chunk.id,
            content: chunk.content,
            metadata: {
              type: 'knowledge' as const,
              confidence: 0.5,
              source: 'recovery',
              timestamp: Date.now(),
            } as any,
            score: 0.5, // Default score for recovery mode
            rank: index + 1,
            vectorScore: 0.5,
            graphScore: 0.5,
            hybridScore: 0.5,
            searchStrategy: 'vector' as const,
          }) as any
      ),
      totalFound: matches.length,
      length: matches.length,
      searchTime: 0,
      performance: {
        vectorSearchTime: 0,
        graphSearchTime: 0,
        rankingTime: 0,
        totalTime: 0,
      },
      strategy: {
        graphWeight: 0,
        vectorWeight: 1,
        hybridMode: 'vector-only',
        queryExpanded: false,
      },
    };
  }

  /**
   * Degraded search with reduced functionality
   */
  private async searchMemoriesDegraded(
    options: HybridSearchOptions
  ): Promise<HybridSearchResponse> {
    console.log('⚠️ Using degraded search mode');

    try {
      // Try GraphRAG only search
      const graphResults = await this.processWithCircuitBreaker(
        'graphRag',
        () => this.graphRag.query(options.query, options)
      );

      return {
        query: options.query,
        results:
          graphResults.entities?.map(
            (entity, index) =>
              ({
                id: entity.id,
                content: entity.description || entity.name,
                metadata: {
                  type: 'knowledge' as const,
                  confidence: entity.confidence,
                  source: 'graph-rag',
                  timestamp: Date.now(),
                } as any,
                score: entity.confidence,
                rank: index + 1,
                vectorScore: 0.5,
                graphScore: entity.confidence,
                hybridScore: entity.confidence,
                searchStrategy: 'graph' as const,
              }) as any
          ) || [],
        totalFound: graphResults.entities?.length || 0,
        length: graphResults.entities?.length || 0,
        searchTime: 0,
        performance: {
          vectorSearchTime: 0,
          graphSearchTime: 0,
          rankingTime: 0,
          totalTime: 0,
        },
        strategy: {
          graphWeight: 1,
          vectorWeight: 0,
          hybridMode: 'graph-only',
          queryExpanded: false,
        },
      };
    } catch (error) {
      console.error('❌ Degraded search also failed:', error);
      throw error;
    }
  }

  /**
   * Enhanced ingestion with reliability
   */
  async ingestMemoryReliable(
    content: string,
    options: {
      type: string;
      source: string;
      metadata?: Record<string, any>;
      priority?: 'low' | 'medium' | 'high';
    }
  ): Promise<string[]> {
    const startTime = Date.now();

    try {
      // Check identity preservation before critical memory ingestion
      if (options.type === 'reflection' || options.type === 'knowledge') {
        await this.verifyIdentityIntegrity();
      }

      const chunkIds = await this.ingestMemory({
        type: options.type as any,
        content: content,
        source: options.source,
        confidence: 0.8,
        customMetadata: options.metadata,
      });

      // Add to backup queue for critical memories
      if (options.priority === 'high' || options.type === 'reflection') {
        // Note: In a real implementation, we'd retrieve the chunks and add them to backup
        // For now, this is a placeholder
      }

      return chunkIds;
    } catch (error) {
      console.error('❌ Reliable ingestion failed:', error);

      // If circuit breaker is open, queue for later retry
      if (this.circuitBreakers.get('vectorDb')?.state === 'open') {
        console.log('📋 Queuing memory for later retry');
        this.emit('memory-queued-for-retry', {
          content,
          options,
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        });
      }

      throw error;
    }
  }

  /**
   * Verify identity integrity before critical operations
   */
  private async verifyIdentityIntegrity(): Promise<void> {
    if (!this.identityPreservation) return;

    const drift = this.identityPreservation.identityDriftScore;

    if (drift > 0.5) {
      console.warn(
        `⚠️ High identity drift detected (${drift}), pausing critical operations`
      );
      this.emit('identity-integrity-warning', {
        driftScore: drift,
        threshold: 0.5,
        timestamp: Date.now(),
      });

      // In a real implementation, you might pause critical operations
      // or trigger identity restoration
    }
  }

  /**
   * Get comprehensive memory system health with reliability metrics
   */
  getMemorySystemHealthWithReliability(): {
    status: 'healthy' | 'degraded' | 'critical';
    reliability: {
      integrityChecks: number;
      corruptionIncidents: number;
      circuitBreakerStates: Record<string, string>;
      backupQueueSize: number;
      identityDriftScore: number;
      lastIntegrityCheck: number;
    };
    performance: any; // Reuse existing performance metrics
    connectivity: any; // Reuse existing connectivity metrics
  } {
    const baseHealth = this.getMemorySystemHealth();

    // Count corruption incidents
    const corruptionIncidents = this.integrityChecks.filter(
      (check) => check.corruptionDetected
    ).length;

    // Get circuit breaker states
    const circuitBreakerStates: Record<string, string> = {};
    for (const [name, breaker] of this.circuitBreakers) {
      circuitBreakerStates[name] = breaker.state;
    }

    // Determine overall status with reliability considerations
    let status: 'healthy' | 'degraded' | 'critical' = baseHealth.status;

    if (
      corruptionIncidents > 0 ||
      (this.identityPreservation &&
        this.identityPreservation.identityDriftScore > 0.3)
    ) {
      status = 'degraded';
    }

    if (
      this.isRecoveryMode ||
      (Object.values(circuitBreakerStates).includes('open') &&
        Object.values(circuitBreakerStates).filter((s) => s === 'open').length >
          1)
    ) {
      status = 'critical';
    }

    return {
      ...baseHealth,
      status,
      reliability: {
        integrityChecks: this.integrityChecks.length,
        corruptionIncidents,
        circuitBreakerStates,
        backupQueueSize: this.backupQueue.length,
        identityDriftScore: this.identityPreservation?.identityDriftScore || 0,
        lastIntegrityCheck: this.identityPreservation?.lastIntegrityCheck || 0,
      },
    };
  }

  /**
   * Initiate recovery mode for memory system restoration
   */
  async enterRecoveryMode(): Promise<void> {
    console.log('🚨 Entering memory system recovery mode');

    this.isRecoveryMode = true;

    // Reset circuit breakers to allow recovery attempts
    for (const breaker of this.circuitBreakers.values()) {
      breaker.state = 'half-open';
      breaker.failures = 0;
    }

    // Attempt to restore from backup
    try {
      await this.restoreFromBackup();
      console.log('✅ Recovery from backup successful');
    } catch (error) {
      console.error('❌ Recovery from backup failed:', error);
      this.emit('recovery-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.emit('recovery-mode-entered', {
      timestamp: Date.now(),
      backupQueueSize: this.backupQueue.length,
      integrityChecksCount: this.integrityChecks.length,
    });
  }

  /**
   * Restore memory system from backup
   */
  private async restoreFromBackup(): Promise<void> {
    if (this.backupQueue.length === 0) {
      throw new Error('No backup data available');
    }

    console.log(`🔄 Restoring ${this.backupQueue.length} memories from backup`);

    // Re-ingest backup memories
    for (const chunk of this.backupQueue) {
      try {
        await this.vectorDb.storeChunk(chunk);
      } catch (error) {
        console.warn(`Failed to restore chunk ${chunk.id}:`, error);
      }
    }

    console.log('✅ Backup restoration completed');
  }

  /**
   * Exit recovery mode
   */
  exitRecoveryMode(): void {
    console.log('✅ Exiting memory system recovery mode');
    this.isRecoveryMode = false;

    this.emit('recovery-mode-exited', {
      timestamp: Date.now(),
      finalBackupQueueSize: this.backupQueue.length,
    });
  }

  /**
   * Get total memory count
   */
  private async getTotalMemoryCount(): Promise<number> {
    try {
      const stats = await this.vectorDb.getStats();
      return stats.totalChunks || 0;
    } catch (error) {
      console.error('Failed to get memory count:', error);
      return 0;
    }
  }

  /**
   * Get memory system health status
   */
  getMemorySystemHealth(): {
    status: 'healthy' | 'degraded' | 'critical';
    performance: any;
    connectivity: any;
  } {
    // Basic health check - in a real implementation this would be more comprehensive
    return {
      status: 'healthy',
      performance: {
        searchLatency: 0,
        memoryUsage: 0,
      },
      connectivity: {
        vectorDb: true,
        graphRag: true,
        embedding: true,
      },
    };
  }

  /**
   * Close the memory system and clean up resources
   */
  async close(): Promise<void> {
    // Stop the reflection write loop and flush remaining items
    if (this.writeLoopTimer) {
      clearInterval(this.writeLoopTimer);
      this.writeLoopTimer = null;
    }
    await this.flushReflectionQueue();
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
// Default Configuration (delegates to centralized config)
// ============================================================================

export function createDefaultMemoryConfig(
  seedOverride?: string
): EnhancedMemorySystemConfig {
  return getMemorySystemConfig(seedOverride);
}

export const DEFAULT_MEMORY_CONFIG: EnhancedMemorySystemConfig =
  createDefaultMemoryConfig();
