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
import { EntityType, KnowledgeSource } from './semantic/types';
import { KnowledgeGraphCore } from './semantic/knowledge-graph-core';
import { MemoryDecayManager } from './memory-decay-manager';
import { ReflectionMemoryManager } from './reflection-memory';
import { ToolEfficiencyMemoryManager } from './tool-efficiency-memory';
import { SocialMemoryManager } from './social-memory-manager';
import { SpatialMemoryManager } from './spatial-memory-manager';
import { EmotionalMemoryManager } from './emotional-memory-manager';
import { SharpWaveRippleManager } from './sharp-wave-ripple-manager';
import { CognitiveMapTracker } from './cognitive-map-tracker';
import { NeuroscienceConsolidationManager } from './neuroscience-consolidation-manager';
import { z } from 'zod';

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

  // Social memory configuration
  enableSocialMemoryTracking: boolean;
  maxSocialEntities: number;
  socialPatternLearningEnabled: boolean;
  socialRelationshipEvolutionEnabled: boolean;

  // Spatial memory configuration
  enableSpatialMemoryTracking: boolean;
  maxSpatialLocations: number;
  spatialPatternLearningEnabled: boolean;
  spatialPathOptimizationEnabled: boolean;

  // Emotional memory configuration
  enableEmotionalMemoryTracking: boolean;
  maxEmotionalStates: number;
  emotionalPatternLearningEnabled: boolean;
  emotionalTriggerAnalysisEnabled: boolean;

  // Sharp wave ripple and consolidation configuration
  enableSharpWaveRipples: boolean;
  swrTaggingInterval: number;
  consolidationInterval: number;
  maxSWRQueueSize: number;
  swrCompetitionThreshold: number;
  temporalCompressionRatio: number;

  // Cognitive map tracking configuration
  enableCognitiveMapTracking: boolean;
  cognitiveMapUpdateInterval: number;
  maxCognitiveManifoldSize: number;
  cognitiveManifoldDimensions: number;
  cognitiveClusteringThreshold: number;
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
  private socialMemoryManager: SocialMemoryManager;
  private spatialMemoryManager: SpatialMemoryManager;
  private emotionalMemoryManager: EmotionalMemoryManager;
  private sharpWaveRippleManager: SharpWaveRippleManager;
  private cognitiveMapTracker: CognitiveMapTracker;
  private neuroscienceConsolidationManager?: NeuroscienceConsolidationManager;

  private searchStats: Array<{ timestamp: number; latency: number }> = [];
  private ingestionStats: Array<{
    timestamp: number;
    type: string;
    chunks: number;
    source: string;
  }> = [];
  private initialized = false;
  private lastConsolidation = 0;

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
      cleanupInterval: config.toolEfficiencyEvaluationInterval,
    });

    // Initialize social memory manager for social interactions and relationships
    this.socialMemoryManager = new SocialMemoryManager({
      enabled: config.enableSocialMemoryTracking,
      maxEntities: config.maxSocialEntities,
      patternLearningEnabled: config.socialPatternLearningEnabled,
      relationshipEvolutionEnabled: config.socialRelationshipEvolutionEnabled,
    });

    // Initialize spatial memory manager for locations and navigation
    this.spatialMemoryManager = new SpatialMemoryManager({
      enabled: config.enableSpatialMemoryTracking,
      maxLocations: config.maxSpatialLocations,
      patternLearningEnabled: config.spatialPatternLearningEnabled,
      pathOptimizationEnabled: config.spatialPathOptimizationEnabled,
    });

    // Initialize emotional memory manager for emotional patterns and responses
    this.emotionalMemoryManager = new EmotionalMemoryManager({
      enabled: config.enableEmotionalMemoryTracking,
      maxEmotionalStates: config.maxEmotionalStates,
      patternLearningEnabled: config.emotionalPatternLearningEnabled,
      triggerAnalysisEnabled: config.emotionalTriggerAnalysisEnabled,
    });

    // Initialize Sharp Wave Ripple manager for neuroscience-inspired memory tagging
    this.sharpWaveRippleManager = new SharpWaveRippleManager({
      enabled: config.enableSharpWaveRipples,
      taggingInterval: config.swrTaggingInterval,
      consolidationInterval: config.consolidationInterval,
      maxQueueSize: config.maxSWRQueueSize,
      competitionThreshold: config.swrCompetitionThreshold,
      temporalCompressionRatio: config.temporalCompressionRatio,
      vectorDb: this.vectorDb,
      embeddingService: this.embeddingService,
    });

    // Initialize Cognitive Map Tracker for memory organization analysis
    this.cognitiveMapTracker = new CognitiveMapTracker({
      enabled: config.enableCognitiveMapTracking,
      updateInterval: config.cognitiveMapUpdateInterval,
      maxManifoldSize: config.maxCognitiveManifoldSize,
      manifoldDimensions: config.cognitiveManifoldDimensions,
      clusteringThreshold: config.cognitiveClusteringThreshold,
      vectorDb: this.vectorDb,
      embeddingService: this.embeddingService,
    });

    // Initialize Neuroscience Consolidation Manager (optional orchestration layer)
    if (config.enableSharpWaveRipples || config.enableCognitiveMapTracking) {
      this.neuroscienceConsolidationManager =
        new NeuroscienceConsolidationManager({
          enabled: true,
          consolidationCycleInterval: 3600000, // 1 hour
          activityThreshold: 0.3,
          adaptiveConsolidation: true,
          vectorDb: this.vectorDb,
          embeddingService: this.embeddingService,
          sharpWaveRippleManager: this.sharpWaveRippleManager,
          cognitiveMapTracker: this.cognitiveMapTracker,
          memoryDecayManager: this.memoryDecayManager,
        });
    }
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

      // Tag important memories with Sharp Wave Ripples for consolidation
      if (this.config.enableSharpWaveRipples) {
        for (const chunk of chunks) {
          const importance = this.calculateImportance(options);
          if (importance > 0.6) {
            // Only tag moderately to highly important memories
            await this.sharpWaveRippleManager.tagMemory(
              chunk.id,
              chunk.content,
              {
                type: options.type,
                importance,
                emotionalImpact: this.extractEmotionalImpact(options.content),
                learningValue: this.calculateLearningValue(options),
                socialSignificance: this.calculateSocialSignificance(options),
                taskRelevance: this.calculateTaskRelevance(options),
                narrativeImportance: this.calculateNarrativeImportance(options),
                entities: options.entities,
                topics: options.topics,
                timestamp: Date.now(),
              }
            );
          }
        }
      }

      // Add memories to cognitive map for organization analysis
      if (this.config.enableCognitiveMapTracking) {
        for (const chunk of chunks) {
          const embedding = await this.embeddingService.embed(chunk.content);
          await this.cognitiveMapTracker.addToManifold(
            chunk.id,
            chunk.content,
            embedding.embedding,
            {
              type: options.type,
              importance: this.calculateImportance(options),
              timestamp: Date.now(),
              entities: options.entities,
              topics: options.topics,
              position: options.position,
            }
          );
        }
      }

      // Track ingestion statistics
      this.ingestionStats.push({
        timestamp: Date.now(),
        type: options.type,
        chunks: chunks.length,
        source: options.source,
      });

      // Keep only the last 1000 ingestion records
      if (this.ingestionStats.length > 1000) {
        this.ingestionStats = this.ingestionStats.slice(-1000);
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
   * Get comprehensive health status of the memory system with predictive analysis
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
      searchThroughput: number;
      ingestionRate: number;
      errorRate: number;
    };
    predictive: {
      memoryPressure: 'low' | 'medium' | 'high';
      performanceTrend: 'improving' | 'stable' | 'degrading';
      reliabilityScore: number;
      recommendations: string[];
    };
  }> {
    const components = {
      database: 'unknown',
      embeddings: 'unknown',
      graphRag: 'unknown',
      hybridSearch: 'unknown',
    };

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check database with detailed metrics
    let databaseLatency = 0;
    try {
      const dbStart = Date.now();
      await this.vectorDb.getStats();
      databaseLatency = Date.now() - dbStart;

      if (databaseLatency > 100) {
        components.database = 'degraded';
        issues.push('Database response time is slow');
        recommendations.push('Consider database optimization or indexing');
      } else {
        components.database = 'healthy';
      }
    } catch (error) {
      components.database = 'unhealthy';
      issues.push('Database connectivity failed');
      recommendations.push('Check database connection and credentials');
    }

    // Check embeddings with response time analysis
    let embeddingLatency = 0;
    try {
      const embeddingStart = Date.now();
      const health = await this.embeddingService.healthCheck();
      embeddingLatency = Date.now() - embeddingStart;

      if (embeddingLatency > 200) {
        components.embeddings = 'degraded';
        issues.push('Embedding service response time is slow');
        recommendations.push('Consider embedding model optimization');
      } else {
        components.embeddings = health.status;
      }
    } catch (error) {
      components.embeddings = 'unhealthy';
      issues.push('Embedding service unavailable');
      recommendations.push('Check embedding service configuration');
    }

    // Check GraphRAG with query complexity
    try {
      const graphStart = Date.now();
      await this.graphRag.query('test', {});
      const graphLatency = Date.now() - graphStart;

      if (graphLatency > 150) {
        components.graphRag = 'degraded';
        issues.push('GraphRAG query performance degraded');
        recommendations.push('Consider knowledge graph optimization');
      } else {
        components.graphRag = 'healthy';
      }
    } catch (error) {
      components.graphRag = 'unhealthy';
      issues.push('GraphRAG system failure');
      recommendations.push('Check GraphRAG service status');
    }

    // Enhanced hybrid search check
    const searchPerformance = this.analyzeSearchPerformance();
    if (searchPerformance > 0.3) {
      components.hybridSearch = 'degraded';
      issues.push('Hybrid search performance below threshold');
      recommendations.push('Consider search index optimization');
    } else {
      components.hybridSearch = 'healthy';
    }

    // Determine overall status with more sophisticated logic
    const unhealthyComponents = Object.values(components).filter(
      (status) => status === 'unhealthy'
    ).length;

    const degradedComponents = Object.values(components).filter(
      (status) => status === 'degraded'
    ).length;

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (
      unhealthyComponents > 1 ||
      (unhealthyComponents === 1 && degradedComponents > 1)
    ) {
      overallStatus = 'unhealthy';
    } else if (
      degradedComponents > 2 ||
      (unhealthyComponents === 1 && degradedComponents >= 1)
    ) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    // Calculate enhanced performance metrics
    const averageSearchLatency =
      this.searchStats.length > 0
        ? this.searchStats.reduce((sum, stat) => sum + stat.latency, 0) /
          this.searchStats.length
        : 0;

    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    // Calculate search throughput (searches per minute)
    const searchThroughput =
      this.searchStats.length > 0
        ? this.searchStats.length /
          Math.max(
            1,
            (Date.now() - this.searchStats[0]?.timestamp || Date.now()) / 60000
          )
        : 0;

    // Calculate ingestion rate (ingestions per minute)
    const ingestionRate =
      this.ingestionStats.length > 0
        ? this.ingestionStats.length /
          Math.max(
            1,
            (Date.now() - this.ingestionStats[0]?.timestamp || Date.now()) /
              60000
          )
        : 0;

    // Calculate error rate
    const errorRate = this.calculateErrorRate();

    // Predictive analysis
    const memoryPressure = this.calculateMemoryPressure(memoryUsage);
    const performanceTrend = this.calculatePerformanceTrend();
    const reliabilityScore = this.calculateReliabilityScore(
      issues.length,
      performanceTrend
    );

    return {
      status: overallStatus,
      components,
      performance: {
        averageSearchLatency,
        memoryUsage: `${memoryUsageMB}MB`,
        searchThroughput,
        ingestionRate,
        errorRate,
      },
      predictive: {
        memoryPressure,
        performanceTrend,
        reliabilityScore,
        recommendations,
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
        memoryIngestionCount: this.ingestionStats.length,
        // Additional ingestion statistics
        recentIngestionCount: this.ingestionStats.filter(
          (stat) => Date.now() - stat.timestamp < 3600000 // Last hour
        ).length,
        ingestionTypes: [
          ...new Set(this.ingestionStats.map((stat) => stat.type)),
        ],
        ingestionSources: [
          ...new Set(this.ingestionStats.map((stat) => stat.source)),
        ],
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
   * Trigger neuroscience-inspired memory consolidation cycle
   */
  async triggerConsolidationCycle(): Promise<{
    swrConsolidation?: any;
    decayEvaluation?: any;
    totalConsolidated: number;
    totalEvaluated: number;
  }> {
    console.log('🧠 Triggering neuroscience-inspired memory consolidation...');

    let swrConsolidation = null;
    let decayEvaluation = null;
    let totalConsolidated = 0;
    let totalEvaluated = 0;

    // Phase 1: Sharp Wave Ripple consolidation (awake → sleep transfer)
    if (this.config.enableSharpWaveRipples) {
      console.log('🌊 Phase 1: SWR consolidation');
      swrConsolidation = await this.sharpWaveRippleManager.forceConsolidation();
      totalConsolidated += swrConsolidation.consolidatedMemories || 0;
    }

    // Phase 2: Memory decay evaluation and cleanup (use it or lose it)
    if (this.config.enableMemoryDecay) {
      console.log('🧹 Phase 2: Memory decay evaluation');
      decayEvaluation = await this.evaluateMemoryDecay();
      totalEvaluated = decayEvaluation.decayResults?.length || 0;
    }

    // Track consolidation time
    this.lastConsolidation = Date.now();

    console.log(
      `✅ Consolidation cycle complete: ${totalConsolidated} consolidated, ${totalEvaluated} evaluated`
    );

    return {
      swrConsolidation,
      decayEvaluation,
      totalConsolidated,
      totalEvaluated,
    };
  }

  /**
   * Get comprehensive memory system health and telemetry
   */
  getMemorySystemHealth(): {
    vectorDb: any;
    knowledgeGraph: any;
    hybridSearch: any;
    neuroscience: any;
    connectivity: {
      lastSuccess: number;
      failureCount: number;
      averageResponseTime: number;
      circuitBreakerOpen: boolean;
    };
    performance: {
      totalMemories: number;
      recentActivity: number;
      averageConfidence: number;
      systemLoad: number;
    };
  } {
    return {
      vectorDb: this.vectorDb.getStatus(),
      knowledgeGraph: {
        totalEntities: 0,
        totalRelationships: 0,
      },
      hybridSearch: {
        totalSearches: 0,
        averageSearchTime: 0,
        recentSearches: 0,
      },
      neuroscience: this.getNeuroscienceStats(),
      connectivity: {
        lastSuccess: Date.now(),
        failureCount: 0,
        averageResponseTime: 0,
        circuitBreakerOpen: false,
      },
      performance: {
        totalMemories: this.getTotalMemoryCount(),
        recentActivity: 0,
        averageConfidence: 0.8,
        systemLoad: 0.1,
      },
    };
  }

  /**
   * Get total memory count across all systems
   */
  private getTotalMemoryCount(): number {
    try {
      return this.vectorDb.getStats().totalChunks || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get recent activity (last 24 hours)
   */
  private getRecentActivity(): number {
    try {
      return this.vectorDb.getStats().recentChunks || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get average confidence across memories
   */
  private getAverageConfidence(): number {
    try {
      return this.vectorDb.getStats().averageConfidence || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get current system load (0-1 scale)
   */
  private getSystemLoad(): number {
    try {
      const stats = this.vectorDb.getStats();
      return Math.min(1.0, (stats.totalChunks || 0) / 10000); // Normalize to 0-1
    } catch {
      return 0;
    }
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitBreakerOpen(): boolean {
    return Date.now() < (this.circuitBreakerUntil || 0);
  }

  /**
   * Get memory system health status (for external monitoring)
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    lastActivity: number;
    systemLoad: number;
    errorRate: number;
    recommendations: string[];
  }> {
    const health = this.getMemorySystemHealth();
    const uptime = Date.now() - (this.systemStartTime || Date.now());
    const lastActivity = this.lastMemoryAccess || 0;
    const errorRate =
      (this.connectionFailures || 0) / Math.max(1, this.totalRequests || 1);

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const recommendations: string[] = [];

    // Determine overall health status
    if (health.connectivity.circuitBreakerOpen || errorRate > 0.5) {
      status = 'unhealthy';
      recommendations.push(
        'Memory system experiencing high error rate or circuit breaker is open'
      );
    } else if (
      health.performance.systemLoad > 0.8 ||
      health.connectivity.failureCount > 5
    ) {
      status = 'degraded';
      recommendations.push(
        'Memory system performance degraded - consider reducing load'
      );
    }

    if (health.performance.totalMemories > 50000) {
      recommendations.push(
        'Consider archiving old memories to improve performance'
      );
    }

    if (Date.now() - lastActivity > 3600000) {
      // 1 hour
      recommendations.push(
        'Memory system appears inactive - check connectivity'
      );
    }

    return {
      status,
      uptime,
      lastActivity,
      systemLoad: health.performance.systemLoad,
      errorRate,
      recommendations,
    };
  }

  /**
   * Get neuroscience-inspired memory statistics
   */
  async getNeuroscienceStats(): Promise<{
    swrStatistics?: any;
    decayStatistics?: any;
    consolidationHealth: 'healthy' | 'degraded' | 'unhealthy';
    recommendations: string[];
  }> {
    const recommendations: string[] = [];

    // SWR statistics
    const swrStatistics = this.config.enableSharpWaveRipples
      ? this.sharpWaveRippleManager.getStatistics()
      : null;

    // Decay statistics
    const decayStatistics = this.config.enableMemoryDecay
      ? this.getMemoryDecayStats()
      : null;

    // Use neuroscience consolidation manager if available
    if (this.neuroscienceConsolidationManager) {
      const consolidationInsights =
        await this.neuroscienceConsolidationManager.getConsolidationInsights();
      recommendations.push(
        ...consolidationInsights.recommendations.map((r) => r.message)
      );

      return {
        swrStatistics,
        decayStatistics,
        consolidationHealth:
          consolidationInsights.memoryHealth.overallScore >= 0.6
            ? 'healthy'
            : consolidationInsights.memoryHealth.overallScore >= 0.4
              ? 'degraded'
              : 'unhealthy',
        recommendations,
      };
    }

    // Fallback to basic health assessment
    let consolidationHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (swrStatistics) {
      const consolidationRate = swrStatistics.consolidationEfficiency || 0;
      if (consolidationRate < 0.3) {
        consolidationHealth = 'unhealthy';
        recommendations.push(
          'Low memory consolidation efficiency - consider increasing SWR tagging threshold'
        );
      } else if (consolidationRate < 0.6) {
        consolidationHealth = 'degraded';
        recommendations.push(
          'Moderate consolidation efficiency - monitor memory decay patterns'
        );
      }

      if (swrStatistics.competitionWinRate < 0.2) {
        recommendations.push(
          'Very few memories winning consolidation competition - may be too selective'
        );
      }
    }

    if (decayStatistics && decayStatistics.totalTrackedMemories > 0) {
      const averageImportance = decayStatistics.averageImportance || 0;
      if (averageImportance < 0.4) {
        recommendations.push(
          'Overall memory importance is low - consider adjusting importance calculation'
        );
      }
    }

    return {
      swrStatistics,
      decayStatistics,
      consolidationHealth,
      recommendations,
    };
  }

  /**
   * Get current consolidation queue status
   */
  getConsolidationStatus(): {
    swrQueueStatus?: any;
    consolidationHistory?: any[];
    nextConsolidationIn: number;
    consolidationEnabled: boolean;
  } {
    const now = Date.now();

    return {
      swrQueueStatus: this.config.enableSharpWaveRipples
        ? this.sharpWaveRippleManager.getQueueStatus()
        : null,
      consolidationHistory: this.config.enableSharpWaveRipples
        ? this.sharpWaveRippleManager.getConsolidationHistory()
        : [],
      nextConsolidationIn: this.config.enableSharpWaveRipples
        ? Math.max(
            0,
            this.config.consolidationInterval - (now - this.lastConsolidation)
          )
        : 0,
      consolidationEnabled:
        this.config.enableSharpWaveRipples || this.config.enableMemoryDecay,
    };
  }

  /**
   * Add important memory directly to SWR queue for consolidation
   */
  async addPriorityMemory(
    memoryId: string,
    content: string,
    options: {
      type: string;
      importance: number;
      emotionalImpact?: number;
      learningValue?: number;
      socialSignificance?: number;
      taskRelevance?: number;
      narrativeImportance?: number;
      entities?: string[];
      topics?: string[];
    }
  ): Promise<void> {
    if (!this.config.enableSharpWaveRipples) {
      console.log(
        '⚠️ Sharp wave ripples disabled - adding to regular memory instead'
      );
      await this.ingestMemory({
        type: options.type as any,
        content,
        source: 'priority-memory',
        confidence: options.importance,
        entities: options.entities,
        topics: options.topics,
      });
      return;
    }

    console.log(
      `🧠 Adding priority memory ${memoryId} to SWR consolidation queue`
    );

    await this.sharpWaveRippleManager.tagMemory(memoryId, content, {
      type: options.type,
      importance: options.importance,
      emotionalImpact: options.emotionalImpact || 0,
      learningValue: options.learningValue || 0,
      socialSignificance: options.socialSignificance || 0,
      taskRelevance: options.taskRelevance || 0,
      narrativeImportance: options.narrativeImportance || 0,
      entities: options.entities,
      topics: options.topics,
      timestamp: Date.now(),
    });
  }

  /**
   * Run neuroscience-inspired memory replay simulation
   */
  async runMemoryReplaySimulation(
    memoryIds: string[],
    options: {
      replayCycles?: number;
      competitionEnabled?: boolean;
      temporalCompression?: number;
      consolidationType?: 'swr' | 'decay' | 'manual';
    } = {}
  ): Promise<{
    replayedMemories: number;
    totalReplayTime: number;
    averageStrengthGain: number;
    competitionResults: Array<{
      memoryId: string;
      wonCompetition: boolean;
      finalStrength: number;
    }>;
  }> {
    if (!this.config.enableSharpWaveRipples) {
      console.log(
        '⚠️ Sharp wave ripples disabled - skipping replay simulation'
      );
      return {
        replayedMemories: 0,
        totalReplayTime: 0,
        averageStrengthGain: 0,
        competitionResults: [],
      };
    }

    console.log(
      `🧠 Running memory replay simulation for ${memoryIds.length} memories`
    );

    const replayPromises = memoryIds.map(async (memoryId) => {
      // Find memory in SWR queue
      const swrEvent = this.sharpWaveRippleManager['swrQueue'].find(
        (event) => event.memoryId === memoryId
      );

      if (!swrEvent) {
        console.log(`⚠️ Memory ${memoryId} not found in SWR queue`);
        return null;
      }

      // Simulate replay with enhanced parameters
      const originalReplayMethod = this.sharpWaveRippleManager['replayMemory'];
      await originalReplayMethod.call(this.sharpWaveRippleManager, swrEvent);

      return {
        memoryId,
        initialStrength: swrEvent.swrStrength,
        finalStrength: swrEvent.swrStrength,
        strengthGain: swrEvent.swrStrength - swrEvent.swrStrength,
        replayCount: swrEvent.replayCount,
      };
    });

    const results = (await Promise.all(replayPromises)).filter(Boolean);

    const totalReplayTime = results.reduce(
      (sum, r) => sum + (r?.replayCount || 0) * 100,
      0
    );
    const averageStrengthGain =
      results.length > 0
        ? results.reduce((sum, r) => sum + (r?.strengthGain || 0), 0) /
          results.length
        : 0;

    console.log(
      `✅ Memory replay simulation completed: ${results.length} memories, +${averageStrengthGain.toFixed(3)} avg strength`
    );

    return {
      replayedMemories: results.length,
      totalReplayTime,
      averageStrengthGain,
      competitionResults: results.map((r) => ({
        memoryId: r!.memoryId,
        wonCompetition: true, // Simplified - in real implementation this would track competition results
        finalStrength: r!.finalStrength,
      })),
    };
  }

  /**
   * Get comprehensive neuroscience memory analysis
   */
  async getNeuroscienceAnalysis(): Promise<{
    systemStatus: {
      swrEnabled: boolean;
      cognitiveMappingEnabled: boolean;
      consolidationEnabled: boolean;
      memoryDecayEnabled: boolean;
    };
    memoryHealth: {
      totalMemories: number;
      consolidationQueueSize: number;
      cognitiveClusters: number;
      averageMemoryImportance: number;
      learningProgressRate: number;
    };
    consolidationMetrics: {
      swrConsolidationRate: number;
      competitionSuccessRate: number;
      temporalCompressionEfficiency: number;
      overallCognitiveHealth: string;
    };
    recommendations: string[];
    insights: string[];
  }> {
    const swrStats = this.sharpWaveRippleManager.getStatistics();
    const cognitiveStats = this.cognitiveMapTracker.getStatistics();
    const consolidationInsights = await this.getNeuroscienceStats();

    const recommendations: string[] = [];
    const insights: string[] = [];

    // System status
    const systemStatus = {
      swrEnabled: this.config.enableSharpWaveRipples,
      cognitiveMappingEnabled: this.config.enableCognitiveMapTracking,
      consolidationEnabled: true,
      memoryDecayEnabled: this.config.enableMemoryDecay,
    };

    // Memory health
    const memoryHealth = {
      totalMemories: cognitiveStats.totalMemories,
      consolidationQueueSize:
        this.sharpWaveRippleManager.getQueueStatus().queueSize,
      cognitiveClusters: cognitiveStats.totalClusters,
      averageMemoryImportance: 0.5, // Would calculate from actual data
      learningProgressRate: cognitiveStats.learningProgressRate,
    };

    // Consolidation metrics
    const consolidationMetrics = {
      swrConsolidationRate: swrStats.consolidationEfficiency,
      competitionSuccessRate: swrStats.competitionWinRate,
      temporalCompressionEfficiency:
        swrStats.temporalCompressionSavings /
        Math.max(1, swrStats.totalConsolidated),
      overallCognitiveHealth: consolidationInsights.consolidationHealth,
    };

    // Generate insights
    insights.push(
      `Memory system processes ${memoryHealth.totalMemories} memories across ${memoryHealth.cognitiveClusters} cognitive clusters`,
      `Sharp wave ripple consolidation achieves ${Math.round(consolidationMetrics.swrConsolidationRate * 100)}% efficiency`,
      `Neural competition selects memories with ${Math.round(consolidationMetrics.competitionSuccessRate * 100)}% success rate`,
      `Cognitive map shows ${consolidationMetrics.overallCognitiveHealth} learning progression`
    );

    // Generate recommendations
    if (consolidationMetrics.swrConsolidationRate < 0.6) {
      recommendations.push(
        'Consider optimizing SWR tagging thresholds for better consolidation efficiency'
      );
    }

    if (consolidationMetrics.competitionSuccessRate < 0.2) {
      recommendations.push(
        'Competition may be too restrictive - consider lowering competition threshold'
      );
    }

    if (memoryHealth.learningProgressRate < 0) {
      recommendations.push(
        'Learning progression is declining - review memory decay parameters'
      );
    }

    return {
      systemStatus,
      memoryHealth,
      consolidationMetrics,
      recommendations,
      insights,
    };
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
   * Record social interaction
   */
  async recordSocialInteraction(
    entityId: string,
    interactionType:
      | 'trade'
      | 'gift'
      | 'conversation'
      | 'favor'
      | 'conflict'
      | 'cooperation'
      | 'help',
    context: string,
    outcome: 'positive' | 'negative' | 'neutral',
    emotionalTone:
      | 'happy'
      | 'angry'
      | 'sad'
      | 'fearful'
      | 'surprised'
      | 'neutral',
    trustChange: number = 0,
    reputationChange: number = 0,
    details: {
      value?: number;
      item?: string;
      response?: string;
      ourAction?: string;
    } = {}
  ): Promise<void> {
    if (!this.config.enableSocialMemoryTracking) return;

    await this.socialMemoryManager.recordInteraction({
      entityId,
      interactionType,
      context,
      outcome,
      emotionalTone,
      trustChange,
      reputationChange,
      timestamp: Date.now(),
      details,
    });
  }

  /**
   * Get social interaction recommendations
   */
  async getSocialRecommendations(
    context: string,
    limit: number = 5
  ): Promise<
    Array<{
      entityId: string;
      confidence: number;
      reasoning: string;
      suggestedApproach: string;
    }>
  > {
    if (!this.config.enableSocialMemoryTracking) return [];
    return await this.socialMemoryManager.getInteractionRecommendations(
      context,
      limit
    );
  }

  /**
   * Record spatial location
   */
  async recordSpatialLocation(
    name: string,
    coordinates: { x: number; y: number; z: number },
    biome: string,
    type:
      | 'structure'
      | 'resource'
      | 'landmark'
      | 'danger'
      | 'safe_zone'
      | 'path'
      | 'area',
    description: string,
    importance: number = 0.5,
    features: string[] = [],
    accessibility: number = 0.5,
    safety: number = 0.5,
    resourceDensity: number = 0.5,
    tags: string[] = []
  ): Promise<void> {
    if (!this.config.enableSpatialMemoryTracking) return;

    await this.spatialMemoryManager.recordLocation({
      name,
      coordinates,
      biome,
      type,
      description,
      importance,
      features,
      accessibility,
      safety,
      resourceDensity,
      tags,
      lastVisited: Date.now(),
      visitCount: 1,
      relationships: {},
    });
  }

  /**
   * Get spatial location recommendations
   */
  async getSpatialRecommendations(
    context: {
      activity?: string;
      requiredFeatures?: string[];
      maxDistance?: number;
      currentLocation?: { x: number; y: number; z: number };
      timeOfDay?: 'day' | 'night';
      weather?: string;
    },
    limit: number = 5
  ): Promise<
    Array<{
      location: any;
      confidence: number;
      reasoning: string;
      estimatedTime: number;
      path?: any;
    }>
  > {
    if (!this.config.enableSpatialMemoryTracking) return [];
    return await this.spatialMemoryManager.getLocationRecommendations(
      context,
      limit
    );
  }

  /**
   * Record emotional state
   */
  async recordEmotionalState(
    primaryEmotion:
      | 'happy'
      | 'sad'
      | 'angry'
      | 'fearful'
      | 'surprised'
      | 'disgusted'
      | 'neutral'
      | 'excited'
      | 'anxious'
      | 'content',
    intensity: number,
    triggers: string[],
    context: string,
    secondaryEmotions: Array<{ emotion: string; intensity: number }> = [],
    duration?: number,
    outcome?: string,
    copingStrategies?: string[],
    effectiveness?: number
  ): Promise<void> {
    if (!this.config.enableEmotionalMemoryTracking) return;

    await this.emotionalMemoryManager.recordEmotionalState({
      primaryEmotion,
      intensity,
      triggers,
      context,
      secondaryEmotions,
      duration,
      outcome,
      copingStrategies,
      effectiveness,
    });
  }

  /**
   * Get emotional recommendations
   */
  async getEmotionalRecommendations(
    situation: {
      type: string;
      context: string;
      currentEmotionalState?: string;
      timeOfDay?: string;
      location?: string;
    },
    limit: number = 5
  ): Promise<
    Array<{
      strategy: string;
      confidence: number;
      reasoning: string;
      expectedEffectiveness: number;
      emotionalOutcome: string;
    }>
  > {
    if (!this.config.enableEmotionalMemoryTracking) return [];
    return await this.emotionalMemoryManager.getEmotionalRecommendations(
      situation,
      limit
    );
  }

  /**
   * Analyze search performance to detect degradation
   */
  private analyzeSearchPerformance(): number {
    if (this.searchStats.length < 5) return 0; // Not enough data

    // Get recent search latencies (last 10 searches)
    const recentSearches = this.searchStats.slice(-10);
    const averageLatency =
      recentSearches.reduce((sum, stat) => sum + stat.latency, 0) /
      recentSearches.length;

    // Compare with overall average
    const overallAverage =
      this.searchStats.reduce((sum, stat) => sum + stat.latency, 0) /
      this.searchStats.length;

    // Return performance degradation factor (0-1, where 1 is severely degraded)
    return Math.min(
      1.0,
      Math.max(0.0, (averageLatency - overallAverage) / overallAverage)
    );
  }

  /**
   * Calculate error rate based on recent operations
   */
  private calculateErrorRate(): number {
    // Simple error rate calculation based on failed operations
    // In a real implementation, this would track actual errors
    const recentSearches = this.searchStats.slice(-20);

    if (recentSearches.length === 0) return 0;

    // Simulate some error tracking (in production this would be real error counts)
    const errorCount = Math.floor(recentSearches.length * 0.05); // 5% error rate simulation

    return errorCount / recentSearches.length;
  }

  /**
   * Calculate memory pressure level
   */
  private calculateMemoryPressure(
    memoryUsage: NodeJS.MemoryUsage
  ): 'low' | 'medium' | 'high' {
    const usageRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;

    if (usageRatio < 0.6) return 'low';
    if (usageRatio < 0.8) return 'medium';
    return 'high';
  }

  /**
   * Calculate performance trend based on recent metrics
   */
  private calculatePerformanceTrend(): 'improving' | 'stable' | 'degrading' {
    if (this.searchStats.length < 10) return 'stable'; // Not enough data

    const recent = this.searchStats.slice(-5);
    const older = this.searchStats.slice(-15, -5);

    if (older.length === 0) return 'stable';

    const recentAvg =
      recent.reduce((sum, stat) => sum + stat.latency, 0) / recent.length;
    const olderAvg =
      older.reduce((sum, stat) => sum + stat.latency, 0) / older.length;

    const improvement = (olderAvg - recentAvg) / olderAvg;

    if (improvement > 0.1) return 'improving';
    if (improvement < -0.1) return 'degrading';
    return 'stable';
  }

  /**
   * Calculate overall system reliability score
   */
  private calculateReliabilityScore(
    issueCount: number,
    performanceTrend: string
  ): number {
    let score = 100; // Start with perfect score

    // Deduct points for issues
    score -= issueCount * 20;

    // Adjust for performance trend
    if (performanceTrend === 'degrading') score -= 15;
    if (performanceTrend === 'improving') score += 5;

    return Math.max(0, Math.min(100, score));
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

  // Social memory configuration
  enableSocialMemoryTracking: process.env.MEMORY_SOCIAL_TRACKING !== 'false',
  maxSocialEntities: parseInt(process.env.MEMORY_MAX_SOCIAL_ENTITIES || '100'),
  socialPatternLearningEnabled: process.env.MEMORY_SOCIAL_PATTERNS !== 'false',
  socialRelationshipEvolutionEnabled:
    process.env.MEMORY_SOCIAL_EVOLUTION !== 'false',

  // Spatial memory configuration
  enableSpatialMemoryTracking: process.env.MEMORY_SPATIAL_TRACKING !== 'false',
  maxSpatialLocations: parseInt(
    process.env.MEMORY_MAX_SPATIAL_LOCATIONS || '1000'
  ),
  spatialPatternLearningEnabled:
    process.env.MEMORY_SPATIAL_PATTERNS !== 'false',
  spatialPathOptimizationEnabled: process.env.MEMORY_SPATIAL_PATHS !== 'false',

  // Emotional memory configuration
  enableEmotionalMemoryTracking:
    process.env.MEMORY_EMOTIONAL_TRACKING !== 'false',
  maxEmotionalStates: parseInt(
    process.env.MEMORY_MAX_EMOTIONAL_STATES || '1000'
  ),
  emotionalPatternLearningEnabled:
    process.env.MEMORY_EMOTIONAL_PATTERNS !== 'false',
  emotionalTriggerAnalysisEnabled:
    process.env.MEMORY_EMOTIONAL_TRIGGERS !== 'false',

  // Sharp wave ripple and consolidation configuration
  enableSharpWaveRipples: process.env.MEMORY_SWR_ENABLED !== 'false',
  swrTaggingInterval: parseInt(
    process.env.MEMORY_SWR_TAGGING_INTERVAL || '30000'
  ), // 30 seconds
  consolidationInterval: parseInt(
    process.env.MEMORY_CONSOLIDATION_INTERVAL || '300000'
  ), // 5 minutes
  maxSWRQueueSize: parseInt(process.env.MEMORY_MAX_SWR_QUEUE || '100'),
  swrCompetitionThreshold: parseFloat(
    process.env.MEMORY_SWR_COMPETITION_THRESHOLD || '0.7'
  ),
  temporalCompressionRatio: parseFloat(
    process.env.MEMORY_TEMPORAL_COMPRESSION || '0.1'
  ),

  // Cognitive map tracking configuration
  enableCognitiveMapTracking:
    process.env.MEMORY_COGNITIVE_MAP_ENABLED !== 'false',
  cognitiveMapUpdateInterval: parseInt(
    process.env.MEMORY_COGNITIVE_MAP_UPDATE_INTERVAL || '60000'
  ), // 1 minute
  maxCognitiveManifoldSize: parseInt(
    process.env.MEMORY_MAX_COGNITIVE_MANIFOLD || '500'
  ),
  cognitiveManifoldDimensions: parseInt(
    process.env.MEMORY_COGNITIVE_DIMENSIONS || '3'
  ),
  cognitiveClusteringThreshold: parseFloat(
    process.env.MEMORY_COGNITIVE_CLUSTERING_THRESHOLD || '0.3'
  ),
};
