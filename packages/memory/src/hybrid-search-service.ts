/**
 * Hybrid Search Service
 *
 * Combines vector similarity search with knowledge graph queries to provide
 * the best of both worlds: semantic understanding and structured reasoning.
 *
 * Enhanced with obsidian-rag patterns:
 * - Multi-hop reasoning across entity relationships
 * - Explainable provenance tracking
 * - Decay-aware search ranking
 * - Cross-modal entity linking
 *
 * @author @darianrosebrook
 */

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
  GraphRAG,
  GraphRAGOptions,
  GraphRAGResult,
} from './semantic/graph-rag';
import { EnhancedKnowledgeGraphCore } from './knowledge-graph-core';
import { KnowledgePath } from './semantic/types';
import { z } from 'zod';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface HybridSearchOptions {
  // Core search parameters
  query: string;
  limit?: number;
  minConfidence?: number;

  // Search strategy
  graphWeight?: number; // Weight for GraphRAG results (0.0-1.0)
  vectorWeight?: number; // Weight for vector search results (0.0-1.0)
  hybridMode?: 'combined' | 'interleaved' | 'fallback';

  // Content filtering
  types?: string[];
  maxAge?: number; // Maximum age in milliseconds
  world?: string; // Filter by Minecraft world
  entities?: string[]; // Filter by mentioned entities

  // Advanced features
  queryExpansion?: boolean;
  resultDiversification?: boolean;
  semanticBoost?: boolean;
  temporalBoost?: boolean;
  spatialBias?: boolean;

  // GraphRAG options
  graphOptions?: GraphRAGOptions;

  // Chunking options
  chunkingConfig?: Partial<{
    maxTokens: number;
    overlapPercent: number;
    semanticSplitting: boolean;
  }>;
}

export interface HybridSearchResult {
  id: string;
  content: string;
  metadata: ChunkingMetadata;
  score: number;
  rank: number;

  // Score breakdown
  vectorScore: number;
  graphScore: number;
  hybridScore: number;

  // Source information
  searchStrategy: 'vector' | 'graph' | 'hybrid';
  matchedEntities?: string[];
  matchedTopics?: string[];

  // Temporal/spatial context
  temporalContext?: {
    timestamp: number;
    timeOfDay?: string;
  };
  spatialContext?: {
    world: string;
    position: { x: number; y: number; z: number };
    distance?: number;
  };

  // Confidence and quality metrics
  confidence: number;
  relevanceScore: number;
  freshnessScore: number;

  // Enhanced with obsidian-rag patterns
  provenance?: {
    reasoning: string;
    entityPaths?: Array<{
      path: string[];
      relationships: string[];
      confidence: number;
      hopCount: number;
    }>;
    searchMethod: 'vector' | 'graph_traversal' | 'hybrid_fusion';
    decayFactors?: {
      memoryDecay: number;
      entityDecay: number;
      relationshipDecay: number;
      recencyBoost: number;
      importanceProtection: number;
    };
  };
}

export interface HybridSearchResponse {
  query: string;
  originalQuery?: string;
  results: HybridSearchResult[];
  totalFound: number;
  searchTime: number;
  length: number; // Add length property for compatibility

  // Metadata
  strategy: {
    graphWeight: number;
    vectorWeight: number;
    hybridMode: string;
    queryExpanded: boolean;
  };

  // Performance metrics
  performance: {
    vectorSearchTime: number;
    graphSearchTime: number;
    rankingTime: number;
    totalTime: number;
  };
}

export interface HybridSearchServiceConfig {
  vectorDb: EnhancedVectorDatabase;
  embeddingService: EmbeddingService;
  graphRag: GraphRAG;
  chunkingService: ChunkingService;
  knowledgeGraph: EnhancedKnowledgeGraphCore;

  // Default weights
  defaultGraphWeight: number;
  defaultVectorWeight: number;

  // Search parameters
  maxResults: number;
  minSimilarity: number;

  // Advanced features
  enableQueryExpansion: boolean;
  enableDiversification: boolean;
  enableSemanticBoost: boolean;

  // Enhanced features
  enableMultiHopReasoning: boolean;
  enableProvenanceTracking: boolean;
  enableDecayAwareRanking: boolean;
  maxHops: number;
}

// ============================================================================
// Hybrid Search Implementation
// ============================================================================

export class HybridSearchService {
  private config: HybridSearchServiceConfig;

  constructor(config: HybridSearchServiceConfig) {
    this.config = config;
  }

  /**
   * Perform hybrid search combining vector and graph approaches
   * Enhanced with multi-hop reasoning and provenance tracking
   */
  async search(options: HybridSearchOptions): Promise<HybridSearchResponse> {
    const startTime = Date.now();

    // Validate and normalize options
    const searchOptions = this.normalizeOptions(options);
    const originalQuery = options.query;

    console.log(`🔍 Hybrid search for: "${searchOptions.query}"`);

    // Expand query if enabled
    const expandedQuery = searchOptions.queryExpansion
      ? await this.expandQuery(searchOptions.query)
      : searchOptions.query;

    console.log(
      `📈 ${searchOptions.queryExpansion ? 'Expanded' : 'Original'} query: "${expandedQuery}"`
    );

    // Generate embeddings for vector search
    const embeddingStart = Date.now();
    const embeddingResult =
      await this.config.embeddingService.embedWithStrategy(
        expandedQuery,
        'semantic',
        'minecraft'
      );
    const embeddingTime = Date.now() - embeddingStart;

    // Perform parallel searches
    const [vectorResults, graphResults] = await Promise.all([
      this.performVectorSearch(embeddingResult, searchOptions),
      this.performGraphSearch(searchOptions),
    ]);

    const vectorSearchTime = Date.now() - embeddingTime - startTime;
    const graphSearchTime = Date.now() - vectorSearchTime - startTime;

    // Combine and rank results
    const rankingStart = Date.now();
    let combinedResults = this.combineResults(
      vectorResults,
      graphResults,
      searchOptions,
      embeddingResult
    );

    // Enhanced: Multi-hop reasoning and provenance tracking
    if (this.config.enableMultiHopReasoning) {
      combinedResults = await this.enhanceWithMultiHopReasoning(
        combinedResults,
        searchOptions
      );
    }

    // Enhanced: Decay-aware ranking
    if (this.config.enableDecayAwareRanking) {
      combinedResults = this.applyDecayAwareRanking(combinedResults);
    }

    // Enhanced: Provenance tracking
    if (this.config.enableProvenanceTracking) {
      combinedResults = await this.addProvenanceTracking(
        combinedResults,
        searchOptions
      );
    }

    // Apply diversification if enabled
    const finalResults = searchOptions.resultDiversification
      ? this.diversifyResults(combinedResults, searchOptions.limit || 20)
      : combinedResults.slice(0, searchOptions.limit || 20);

    const rankingTime = Date.now() - rankingStart;
    const totalTime = Date.now() - startTime;

    console.log(
      `✅ Hybrid search completed: ${finalResults.length} results in ${totalTime}ms`
    );

    return {
      query: expandedQuery,
      originalQuery,
      results: finalResults,
      totalFound: combinedResults.length,
      searchTime: totalTime,
      length: finalResults.length,
      strategy: {
        graphWeight: searchOptions.graphWeight || 0,
        vectorWeight: searchOptions.vectorWeight || 0,
        hybridMode: searchOptions.hybridMode || 'combined',
        queryExpanded: searchOptions.queryExpansion,
      },
      performance: {
        vectorSearchTime,
        graphSearchTime,
        rankingTime,
        totalTime,
      },
    };
  }

  /**
   * Search with automatic strategy selection
   */
  async smartSearch(
    query: string,
    context?: {
      recentTopics?: string[];
      currentLocation?: {
        world: string;
        position: { x: number; y: number; z: number };
      };
      activeEntities?: string[];
    }
  ): Promise<HybridSearchResponse> {
    // Analyze query to determine best strategy
    const strategy = this.analyzeQueryStrategy(query, context);

    return this.search({
      query,
      ...strategy,
      queryExpansion: true,
      resultDiversification: true,
    });
  }

  /**
   * Search for memories related to specific entities
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
    const entityQuery = entities.join(' ');

    return this.search({
      query: context.query || entityQuery,
      entities,
      world: context.world,
      maxAge: context.maxAge,
      limit: context.limit || 15,
      graphWeight: 0.7, // Favor graph search for entity relationships
      vectorWeight: 0.3,
      queryExpansion: true,
    });
  }

  /**
   * Search for memories in spatial proximity
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
    // This would require spatial indexing in the database
    // For now, we'll use a simplified approach
    return this.search({
      query: context.query || 'nearby activities',
      world: location.world,
      types: context.types,
      limit: context.limit || 10,
      spatialBias: true,
      vectorWeight: 0.4,
      graphWeight: 0.6,
    });
  }

  /**
   * Get memory statistics and insights
   */
  async getMemoryInsights(): Promise<{
    totalMemories: number;
    typeDistribution: Record<string, number>;
    recentActivity: number;
    topEntities: Array<{ entity: string; count: number }>;
    topTopics: Array<{ topic: string; count: number }>;
    averageConfidence: number;
  }> {
    const stats = await this.config.vectorDb.getStats();

    // Get entity and topic statistics
    // This would require additional database queries in a full implementation

    return {
      totalMemories: stats.totalChunks,
      typeDistribution: stats.memoryTypeDistribution,
      recentActivity: 0, // Would need separate query
      topEntities: [], // Placeholder
      topTopics: [], // Placeholder
      averageConfidence: 0.5, // Would need separate calculation
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private normalizeOptions(
    options: HybridSearchOptions
  ): HybridSearchOptions & {
    graphWeight: number;
    vectorWeight: number;
    hybridMode: string;
    queryExpansion: boolean;
    resultDiversification: boolean;
  } {
    const graphWeight = options.graphWeight ?? this.config.defaultGraphWeight;
    const vectorWeight =
      options.vectorWeight ?? this.config.defaultVectorWeight;

    return {
      ...options,
      graphWeight,
      vectorWeight,
      hybridMode: options.hybridMode || 'combined',
      queryExpansion:
        options.queryExpansion ?? this.config.enableQueryExpansion,
      resultDiversification:
        options.resultDiversification ?? this.config.enableDiversification,
    };
  }

  private async performVectorSearch(
    embedding: EmbeddingResult,
    options: HybridSearchOptions & { graphWeight: number; vectorWeight: number }
  ): Promise<EnhancedSearchResult[]> {
    return this.config.vectorDb.search({
      queryEmbedding: embedding.embedding,
      limit: options.limit || 50, // Get more for ranking
      memoryTypes: options.types,
      minConfidence: options.minConfidence,
      maxAge: options.maxAge,
      world: options.world,
    });
  }

  private async performGraphSearch(
    options: HybridSearchOptions & { graphWeight: number; vectorWeight: number }
  ): Promise<GraphRAGResult> {
    return this.config.graphRag.query(options.query, options.graphOptions);
  }

  private combineResults(
    vectorResults: EnhancedSearchResult[],
    graphResults: GraphRAGResult,
    options: HybridSearchOptions & {
      graphWeight: number;
      vectorWeight: number;
    },
    embedding: EmbeddingResult
  ): HybridSearchResult[] {
    const combined = new Map<string, HybridSearchResult>();

    // Process vector results
    vectorResults.forEach((result, index) => {
      const hybridResult: HybridSearchResult = {
        id: result.id,
        content: result.content,
        metadata: result.metadata as ChunkingMetadata,
        score: 0,
        rank: 0,
        vectorScore: result.cosineSimilarity,
        graphScore: 0,
        hybridScore: 0,
        searchStrategy: 'vector',
        confidence: result.metadata.confidence || 0.5,
        relevanceScore: this.calculateRelevanceScore(
          result,
          options,
          embedding
        ),
        freshnessScore: this.calculateFreshnessScore(result),
      };

      combined.set(result.id, hybridResult);
    });

    // Process graph results
    if (
      graphResults.entities.length > 0 ||
      graphResults.relationships.length > 0
    ) {
      const graphScore = graphResults.confidence;

      // Convert graph entities to hybrid results
      graphResults.entities.forEach((entity, index) => {
        const content = `${entity.name}: ${entity.description || 'No description'}`;
        const key = `graph-entity-${entity.id}`;

        const hybridResult: HybridSearchResult = {
          id: key,
          content,
          metadata: {
            type: 'knowledge',
            confidence: entity.confidence || 0.8,
            source: 'knowledge-graph',
            timestamp: Date.now(),
            entities: [entity.name],
            topics: [entity.type],
          } as ChunkingMetadata,
          score: 0,
          rank: 0,
          vectorScore: 0,
          graphScore,
          hybridScore: 0,
          searchStrategy: 'graph',
          matchedEntities: [entity.name],
          matchedTopics: [entity.type],
          confidence: entity.confidence || 0.8,
          relevanceScore: 0.8, // Graph results are generally relevant
          freshnessScore: 1.0, // Knowledge is timeless
        };

        combined.set(key, hybridResult);
      });
    }

    // Calculate hybrid scores
    const results = Array.from(combined.values());
    results.forEach((result) => {
      result.hybridScore = this.calculateHybridScore(result, options);
      result.score = result.hybridScore;
    });

    // Sort by hybrid score
    return results.sort((a, b) => b.score - a.score);
  }

  private calculateHybridScore(
    result: HybridSearchResult,
    options: HybridSearchOptions & { graphWeight: number; vectorWeight: number }
  ): number {
    const { graphWeight, vectorWeight } = options;

    // Normalize scores
    const normalizedVectorScore = result.vectorScore;
    const normalizedGraphScore = result.graphScore;

    // Apply semantic boost if enabled
    let vectorComponent = normalizedVectorScore;
    if (options.semanticBoost) {
      vectorComponent *= 1.1;
    }

    // Apply temporal boost if enabled
    let graphComponent = normalizedGraphScore;
    if (options.temporalBoost && result.freshnessScore < 0.8) {
      graphComponent *= 1.2;
    }

    // Combine scores
    return vectorComponent * vectorWeight + graphComponent * graphWeight;
  }

  private calculateRelevanceScore(
    result: EnhancedSearchResult,
    options: HybridSearchOptions,
    embedding: EmbeddingResult
  ): number {
    let relevance = result.cosineSimilarity;

    // Boost for matching entities
    if (options.entities && result.metadata.entities) {
      const entityMatches = options.entities.filter((entity) =>
        result.metadata.entities.includes(entity)
      ).length;
      relevance += entityMatches * 0.1;
    }

    // Boost for matching types
    if (options.types && options.types.includes(result.metadata.type)) {
      relevance += 0.1;
    }

    // Boost for high confidence
    relevance += result.metadata.confidence * 0.1;

    return Math.min(1.0, relevance);
  }

  private calculateFreshnessScore(result: EnhancedSearchResult): number {
    const now = Date.now();
    const age = now - (result.metadata.timestamp || now);
    const ageHours = age / (1000 * 60 * 60);

    // Exponential decay: 1.0 for recent, approaching 0.5 for old
    return Math.max(0.5, Math.exp(-ageHours / 24)); // 24 hour half-life
  }

  private diversifyResults(
    results: HybridSearchResult[],
    maxResults: number
  ): HybridSearchResult[] {
    if (results.length <= maxResults) return results;

    const selected: HybridSearchResult[] = [];
    const remaining = [...results];

    // Always include the top result
    selected.push(remaining.shift()!);

    while (selected.length < maxResults && remaining.length > 0) {
      let bestCandidate: HybridSearchResult | null = null;
      let bestScore = -Infinity;
      let bestIndex = -1;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];

        // Calculate diversity score
        let diversityScore = candidate.score;

        // Penalize similarity to already selected results
        for (const selectedResult of selected) {
          const similarityPenalty =
            this.calculateContentSimilarity(
              candidate.content,
              selectedResult.content
            ) * 0.3;
          diversityScore *= 1 - similarityPenalty;
        }

        // Boost different types and sources
        const selectedTypes = new Set(selected.map((r) => r.metadata.type));
        const selectedSources = new Set(selected.map((r) => r.metadata.source));

        if (!selectedTypes.has(candidate.metadata.type)) {
          diversityScore *= 1.2;
        }

        if (!selectedSources.has(candidate.metadata.source)) {
          diversityScore *= 1.1;
        }

        if (diversityScore > bestScore) {
          bestScore = diversityScore;
          bestCandidate = candidate;
          bestIndex = i;
        }
      }

      if (bestCandidate) {
        selected.push(bestCandidate);
        remaining.splice(bestIndex, 1);
      } else {
        break;
      }
    }

    return selected;
  }

  private calculateContentSimilarity(text1: string, text2: string): number {
    const words1 = new Set(
      text1
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
    const words2 = new Set(
      text2
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private async expandQuery(query: string): Promise<string> {
    return this.config.embeddingService.expandQuery(query);
  }

  private analyzeQueryStrategy(
    query: string,
    context?: {
      recentTopics?: string[];
      currentLocation?: {
        world: string;
        position: { x: number; y: number; z: number };
      };
      activeEntities?: string[];
    }
  ): Partial<HybridSearchOptions> {
    const lowerQuery = query.toLowerCase();

    // Entity-focused queries favor graph search
    if (
      lowerQuery.includes('relationship') ||
      lowerQuery.includes('connected') ||
      lowerQuery.includes('related to') ||
      context?.activeEntities?.length
    ) {
      return {
        graphWeight: 0.7,
        vectorWeight: 0.3,
        semanticBoost: true,
      };
    }

    // Conceptual/experience queries favor vector search
    if (
      lowerQuery.includes('how to') ||
      lowerQuery.includes('experience') ||
      lowerQuery.includes('strategy') ||
      lowerQuery.includes('tips')
    ) {
      return {
        graphWeight: 0.3,
        vectorWeight: 0.7,
        temporalBoost: true,
      };
    }

    // Location-based queries
    if (
      lowerQuery.includes('near') ||
      lowerQuery.includes('around') ||
      context?.currentLocation
    ) {
      return {
        graphWeight: 0.5,
        vectorWeight: 0.5,
        spatialBias: true,
      };
    }

    // Default balanced approach
    return {
      graphWeight: 0.5,
      vectorWeight: 0.5,
    };
  }

  // ============================================================================
  // Enhanced Methods: Multi-Hop Reasoning & Provenance Tracking
  // ============================================================================

  /**
   * Enhance search results with multi-hop reasoning
   * Finds related memories through entity relationship traversal
   */
  private async enhanceWithMultiHopReasoning(
    results: HybridSearchResult[],
    options: HybridSearchOptions
  ): Promise<HybridSearchResult[]> {
    const enhancedResults: HybridSearchResult[] = [];
    const maxHops = this.config.maxHops || 3;

    for (const result of results) {
      const enhanced = { ...result };

      // Extract entities from the result
      const entities = result.metadata.entities || [];

      if (entities.length > 0 && this.config.knowledgeGraph) {
        try {
          // Find paths between entities in the result
          const paths: Array<{
            path: string[];
            relationships: string[];
            confidence: number;
            hopCount: number;
          }> = [];

          for (let i = 0; i < entities.length - 1; i++) {
            for (let j = i + 1; j < entities.length; j++) {
              // Search for entities in knowledge graph
              const sourceResults =
                await this.config.knowledgeGraph.searchEntities({
                  query: entities[i],
                  limit: 1,
                });

              const targetResults =
                await this.config.knowledgeGraph.searchEntities({
                  query: entities[j],
                  limit: 1,
                });

              if (
                sourceResults.entities.length > 0 &&
                targetResults.entities.length > 0
              ) {
                const sourceId = sourceResults.entities[0].id;
                const targetId = targetResults.entities[0].id;

                // Find paths between entities
                const knowledgePaths =
                  await this.config.knowledgeGraph.findPath(
                    sourceId,
                    targetId,
                    maxHops
                  );

                // Convert knowledge paths to provenance format
                for (const kPath of knowledgePaths.slice(0, 3)) {
                  paths.push({
                    path: kPath.entities.map((e) => e.id),
                    relationships: kPath.relationships.map((r) => r.id),
                    confidence: kPath.confidence,
                    hopCount: kPath.hopCount,
                  });
                }
              }
            }
          }

          // Add paths to result if found
          if (paths.length > 0) {
            enhanced.provenance = {
              ...(enhanced.provenance || {
                reasoning: '',
                searchMethod: 'hybrid_fusion' as const,
              }),
              entityPaths: paths,
            };

            // Boost score based on path quality
            const pathBoost =
              paths.reduce((sum, p) => sum + p.confidence, 0) / paths.length;
            enhanced.score = enhanced.score * (1 + pathBoost * 0.2);
            enhanced.graphScore = Math.max(enhanced.graphScore, pathBoost);
          }
        } catch (error) {
          console.warn('⚠️ Multi-hop reasoning failed:', error);
        }
      }

      enhancedResults.push(enhanced);
    }

    // Re-sort by updated scores
    return enhancedResults.sort((a, b) => b.score - a.score);
  }

  /**
   * Apply decay-aware ranking to search results
   * Adjusts scores based on memory decay factors
   */
  private applyDecayAwareRanking(
    results: HybridSearchResult[]
  ): HybridSearchResult[] {
    const now = Date.now();

    return results
      .map((result) => {
        const enhanced = { ...result };

        // Calculate decay factors from metadata
        const lastAccessed =
          result.metadata.lastAccessed ||
          result.metadata.timestamp ||
          Date.now();
        const timeSinceAccess = now - lastAccessed;
        const daysSinceAccess = timeSinceAccess / (1000 * 60 * 60 * 24);

        // Calculate memory decay (logarithmic: use it or lose it)
        const accessCount = result.metadata.accessCount || 1;
        const importance = result.metadata.importance || 0.5;

        // Logarithmic decay formula
        const usageBoost = Math.log10(accessCount + 1) * 0.1;
        const memoryDecay = Math.min(0.9, daysSinceAccess * 0.02 - usageBoost);
        const recencyBoost = Math.max(0, 1 - daysSinceAccess * 0.05);
        const importanceProtection = importance * 0.3;

        // Entity decay (if entities are present)
        const entityDecay =
          result.metadata.entities && result.metadata.entities.length > 0
            ? Math.min(0.5, daysSinceAccess * 0.01)
            : 0;

        // Relationship decay (if multi-hop paths exist)
        const relationshipDecay = result.provenance?.entityPaths
          ? Math.min(0.3, daysSinceAccess * 0.005)
          : 0;

        const decayFactors = {
          memoryDecay,
          entityDecay,
          relationshipDecay,
          recencyBoost,
          importanceProtection,
        };

        // Adjust score based on decay
        const decayAdjustment =
          1 -
          memoryDecay +
          recencyBoost * 0.3 +
          importanceProtection -
          entityDecay * 0.2 -
          relationshipDecay * 0.1;

        enhanced.score = result.score * Math.max(0.1, decayAdjustment);

        // Add decay factors to provenance
        enhanced.provenance = {
          ...(enhanced.provenance || {
            reasoning: '',
            searchMethod: result.searchStrategy as
              | 'vector'
              | 'graph_traversal'
              | 'hybrid_fusion',
          }),
          decayFactors,
        };

        return enhanced;
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Add explainable provenance tracking to search results
   * Explains why each result was retrieved and how it relates to the query
   */
  private async addProvenanceTracking(
    results: HybridSearchResult[],
    options: HybridSearchOptions
  ): Promise<HybridSearchResult[]> {
    return results.map((result) => {
      const enhanced = { ...result };

      // Build reasoning explanation
      const reasoningParts: string[] = [];

      // Vector search contribution
      if (result.vectorScore > 0) {
        reasoningParts.push(
          `Semantic similarity: ${(result.vectorScore * 100).toFixed(1)}%`
        );
      }

      // Graph search contribution
      if (result.graphScore > 0) {
        reasoningParts.push(
          `Knowledge graph relevance: ${(result.graphScore * 100).toFixed(1)}%`
        );
      }

      // Entity matches
      if (result.metadata.entities && result.metadata.entities.length > 0) {
        reasoningParts.push(
          `Matched entities: ${result.metadata.entities.join(', ')}`
        );
      }

      // Multi-hop paths
      if (
        result.provenance?.entityPaths &&
        result.provenance.entityPaths.length > 0
      ) {
        const pathCount = result.provenance.entityPaths.length;
        const avgHops =
          result.provenance.entityPaths.reduce(
            (sum, p) => sum + p.hopCount,
            0
          ) / pathCount;
        reasoningParts.push(
          `Found ${pathCount} relationship path${pathCount > 1 ? 's' : ''} (avg ${avgHops.toFixed(1)} hops)`
        );
      }

      // Decay factors
      if (result.provenance?.decayFactors) {
        const df = result.provenance.decayFactors;
        if (df.recencyBoost > 0.5) {
          reasoningParts.push('Recently accessed');
        }
        if (df.importanceProtection > 0.2) {
          reasoningParts.push('High importance');
        }
      }

      // Freshness
      if (result.freshnessScore > 0.8) {
        reasoningParts.push('Recent memory');
      }

      const reasoning = reasoningParts.join(' • ');

      enhanced.provenance = {
        ...(enhanced.provenance || {}),
        reasoning,
        searchMethod: result.searchStrategy as
          | 'vector'
          | 'graph_traversal'
          | 'hybrid_fusion',
      };

      return enhanced;
    });
  }
}
