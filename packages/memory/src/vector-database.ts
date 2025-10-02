/**
 * Enhanced Vector Database Service
 *
 * PostgreSQL with pgvector integration optimized for hybrid memory search.
 * Enhanced with knowledge graph integration, advanced entity metadata,
 * and performance optimizations for obsidian-rag patterns.
 *
 * @author @darianrosebrook
 */

import { Pool, Client } from 'pg';
import { z } from 'zod';

// ============================================================================
// Enhanced Types and Schemas
// ============================================================================

export interface EnhancedChunkMetadata {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;

  // Enhanced knowledge graph integration
  entities: Array<{
    entityId: string;
    entityName: string;
    entityType: string;
    confidence: number;
    relationshipType?: string;
  }>;

  relationships: Array<{
    relationshipId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: string;
    confidence: number;
    strength: number;
  }>;

  // Memory decay integration
  decayProfile: {
    memoryType: 'episodic' | 'semantic' | 'procedural' | 'emotional' | 'social';
    baseDecayRate: number;
    lastAccessed: number;
    accessCount: number;
    importance: number;
    consolidationHistory: Array<{
      timestamp: number;
      type: 'swr' | 'decay' | 'manual';
      strength: number;
    }>;
  };

  // Enhanced provenance tracking
  provenance: {
    sourceSystem: string;
    extractionMethod: string;
    confidence: number;
    processingTime: number;
    version: string;
  };
}

export const EnhancedMemoryChunkSchema = z.object({
  id: z.string(),
  content: z.string(),
  embedding: z.array(z.number()).length(768),
  metadata: z.record(z.any()),

  // Enhanced entity and relationship data
  entities: z
    .array(
      z.object({
        entityId: z.string(),
        entityName: z.string(),
        entityType: z.string(),
        confidence: z.number(),
        relationshipType: z.string().optional(),
      })
    )
    .default([]),

  relationships: z
    .array(
      z.object({
        relationshipId: z.string(),
        sourceEntityId: z.string(),
        targetEntityId: z.string(),
        relationshipType: z.string(),
        confidence: z.number(),
        strength: z.number(),
      })
    )
    .default([]),

  // Memory decay profile
  decayProfile: z.object({
    memoryType: z.enum([
      'episodic',
      'semantic',
      'procedural',
      'emotional',
      'social',
    ]),
    baseDecayRate: z.number(),
    lastAccessed: z.number(),
    accessCount: z.number(),
    importance: z.number(),
    consolidationHistory: z
      .array(
        z.object({
          timestamp: z.number(),
          type: z.enum(['swr', 'decay', 'manual']),
          strength: z.number(),
        })
      )
      .default([]),
  }),

  // Enhanced provenance
  provenance: z.object({
    sourceSystem: z.string(),
    extractionMethod: z.string(),
    confidence: z.number(),
    processingTime: z.number(),
    version: z.string(),
  }),

  // Legacy support
  graphLinks: z
    .array(
      z.object({
        entityId: z.string(),
        relationship: z.string(),
        confidence: z.number(),
      })
    )
    .optional(),

  temporalContext: z
    .object({
      timestamp: z.number(),
      duration: z.number().optional(),
      timeOfDay: z.string().optional(),
      sessionId: z.string().optional(),
    })
    .optional(),

  spatialContext: z
    .object({
      world: z.string(),
      position: z.object({
        x: z.number(),
        y: z.number(),
        z: z.number(),
      }),
      dimension: z.string().optional(),
      biome: z.string().optional(),
    })
    .optional(),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type EnhancedMemoryChunk = z.infer<typeof EnhancedMemoryChunkSchema>;

export interface EnhancedSearchOptions {
  // Core search parameters
  queryEmbedding: number[];
  limit?: number;
  threshold?: number;

  // Enhanced filtering
  memoryTypes?: string[];
  entityTypes?: string[];
  relationshipTypes?: string[];
  minConfidence?: number;
  maxAge?: number;
  world?: string;

  // Knowledge graph filters
  entityIds?: string[];
  relationshipIds?: string[];
  minRelationshipStrength?: number;

  // Memory decay filters
  minImportance?: number;
  maxDecay?: number; // Maximum allowed decay (0-1)
  recentAccess?: boolean; // Boost recently accessed memories

  // Advanced search modes
  searchMode?: 'vector' | 'hybrid' | 'graph_first' | 'decay_aware';
  includeExplanations?: boolean;
  enableQueryExpansion?: boolean;
}

export interface EnhancedSearchResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  cosineSimilarity: number;
  rank: number;

  // Enhanced scoring breakdown
  vectorScore: number;
  graphScore: number;
  decayScore: number;
  finalScore: number;

  // Entity and relationship data
  matchedEntities: Array<{
    entityId: string;
    entityName: string;
    entityType: string;
    confidence: number;
    relationshipType?: string;
  }>;

  matchedRelationships: Array<{
    relationshipId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: string;
    confidence: number;
    strength: number;
  }>;

  // Memory decay information
  decayFactors: {
    memoryDecay: number;
    entityDecay: number;
    relationshipDecay: number;
    recencyBoost: number;
    importanceProtection: number;
  };

  // Provenance and explanation
  explanation?: {
    reasoning: string;
    entityConnections: string[];
    relationshipPaths: string[];
    confidenceBreakdown: Record<string, number>;
  };
}

// ============================================================================
// Enhanced Vector Database Implementation
// ============================================================================

export class EnhancedVectorDatabase {
  private pool: Pool;
  private config: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    worldSeed: number;
    tableName: string;
    dimension: number;
    maxConnections: number;
  };

  private seedDatabase: string;

  constructor(config: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    worldSeed?: number;
    tableName?: string;
    dimension?: number;
    maxConnections?: number;
  }) {
    this.config = {
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: '',
      database: 'conscious_bot',
      worldSeed: 0,
      tableName: 'enhanced_memory_chunks',
      dimension: 768,
      maxConnections: 10,
      ...config,
    };

    // Generate per-seed database name if worldSeed is provided
    this.seedDatabase =
      this.config.worldSeed > 0
        ? `${this.config.database}_seed_${this.config.worldSeed}`
        : this.config.database;

    // Build connection string
    const connectionString = `postgresql://${this.config.user}:${this.config.password}@${this.config.host}:${this.config.port}/${this.seedDatabase}`;

    this.pool = new Pool({
      connectionString,
      max: this.config.maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  /**
   * Initialize enhanced database with optimized schema
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Enable pgvector extension
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');

      // Create enhanced memory chunks table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          embedding VECTOR(${this.config.dimension}),
          metadata JSONB NOT NULL,

          -- Enhanced entity and relationship data
          entities JSONB DEFAULT '[]'::jsonb,
          relationships JSONB DEFAULT '[]'::jsonb,

          -- Memory decay profile
          decay_profile JSONB NOT NULL,

          -- Enhanced provenance
          provenance JSONB NOT NULL,

          -- Legacy support
          graph_links JSONB DEFAULT '[]'::jsonb,
          temporal_context JSONB,
          spatial_context JSONB,

          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Enhanced indexes for hybrid search
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${this.config.tableName}_hnsw_idx
        ON ${this.config.tableName}
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 200)
      `);

      // Entity-based indexes for knowledge graph queries
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${this.config.tableName}_entities_idx
        ON ${this.config.tableName}
        USING GIN ((entities->'entityId'))
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS ${this.config.tableName}_relationships_idx
        ON ${this.config.tableName}
        USING GIN ((relationships->'relationshipId'))
      `);

      // Memory decay indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${this.config.tableName}_decay_importance_idx
        ON ${this.config.tableName}
        USING BTREE (((decay_profile->>'importance')::numeric))
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS ${this.config.tableName}_decay_last_accessed_idx
        ON ${this.config.tableName}
        USING BTREE (((decay_profile->>'lastAccessed')::numeric))
      `);

      // Enhanced metadata indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${this.config.tableName}_meta_type_idx
        ON ${this.config.tableName}
        USING BTREE ((metadata->>'type'))
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS ${this.config.tableName}_meta_confidence_idx
        ON ${this.config.tableName}
        USING BTREE (((metadata->>'confidence')::numeric))
      `);

      // Temporal and spatial indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${this.config.tableName}_temporal_idx
        ON ${this.config.tableName}
        USING BTREE (((temporal_context->>'timestamp')::numeric))
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS ${this.config.tableName}_spatial_world_idx
        ON ${this.config.tableName}
        USING BTREE ((spatial_context->>'world'))
      `);

      console.log(
        `✅ Enhanced vector database initialized: ${this.seedDatabase}.${this.config.tableName}`
      );
    } finally {
      client.release();
    }
  }

  /**
   * Insert or update an enhanced memory chunk
   */
  async upsertChunk(chunk: EnhancedMemoryChunk): Promise<void> {
    // Validate chunk before insertion
    const validation = EnhancedMemoryChunkSchema.safeParse(chunk);
    if (!validation.success) {
      throw new Error(`Invalid chunk: ${validation.error.message}`);
    }

    if (chunk.embedding.length !== this.config.dimension) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.config.dimension}, got ${chunk.embedding.length}`
      );
    }

    const client = await this.pool.connect();
    try {
      const vectorLiteral = `'[${chunk.embedding.join(',')}]'`;

      await client.query(
        `
        INSERT INTO ${this.config.tableName}
        (id, content, embedding, metadata, entities, relationships, decay_profile, provenance, graph_links, temporal_context, spatial_context, updated_at)
        VALUES ($1, $2, ${vectorLiteral}::vector, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          entities = EXCLUDED.entities,
          relationships = EXCLUDED.relationships,
          decay_profile = EXCLUDED.decay_profile,
          provenance = EXCLUDED.provenance,
          graph_links = EXCLUDED.graph_links,
          temporal_context = EXCLUDED.temporal_context,
          spatial_context = EXCLUDED.spatial_context,
          updated_at = NOW()
      `,
        [
          chunk.id,
          chunk.content,
          JSON.stringify(chunk.metadata),
          JSON.stringify(chunk.entities),
          JSON.stringify(chunk.relationships),
          JSON.stringify(chunk.decayProfile),
          JSON.stringify(chunk.provenance),
          JSON.stringify(chunk.graphLinks || []),
          JSON.stringify(chunk.temporalContext || null),
          JSON.stringify(chunk.spatialContext || null),
        ]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Enhanced search with knowledge graph and decay awareness
   */
  async search(
    options: EnhancedSearchOptions
  ): Promise<EnhancedSearchResult[]> {
    if (options.queryEmbedding.length !== this.config.dimension) {
      throw new Error(
        `Query embedding dimension mismatch: expected ${this.config.dimension}, got ${options.queryEmbedding.length}`
      );
    }

    const client = await this.pool.connect();
    try {
      const vectorLiteral = `'[${options.queryEmbedding.join(',')}]'`;
      const limit = options.limit || 30;
      const threshold = options.threshold || 0.1;

      // Build dynamic query based on search mode
      let query = this.buildEnhancedSearchQuery(options);
      let params: any[] = [vectorLiteral, limit, threshold];

      // Execute search
      const result = await client.query(query, params);

      // Process and enhance results
      const enhancedResults = await this.processSearchResults(
        result.rows,
        options
      );

      return enhancedResults;
    } finally {
      client.release();
    }
  }

  /**
   * Build enhanced search query based on options
   */
  private buildEnhancedSearchQuery(options: EnhancedSearchOptions): string {
    const { searchMode = 'hybrid' } = options;

    let baseQuery = `
      SELECT
        id, content, metadata, embedding,
        entities, relationships, decay_profile, provenance,
        (embedding <=> $1::vector) as distance,
        (1 - (embedding <=> $1::vector)) as similarity
      FROM ${this.config.tableName}
      WHERE (1 - (embedding <=> $1::vector)) >= $3
    `;

    // Add filters based on options
    if (options.memoryTypes?.length) {
      baseQuery += ` AND (metadata->>'type') = ANY($${this.getNextParamIndex()})`;
    }

    if (options.entityTypes?.length) {
      baseQuery += ` AND (entities->'entityType') ?& $${this.getNextParamIndex()}`;
    }

    if (options.minConfidence !== undefined) {
      baseQuery += ` AND (metadata->>'confidence')::numeric >= $${this.getNextParamIndex()}`;
    }

    if (options.maxAge !== undefined) {
      baseQuery += ` AND (metadata->>'timestamp')::numeric >= $${this.getNextParamIndex()}`;
    }

    if (options.world) {
      baseQuery += ` AND (spatial_context->>'world') = $${this.getNextParamIndex()}`;
    }

    // Enhanced search modes
    switch (searchMode) {
      case 'vector':
        // Pure vector similarity
        break;

      case 'graph_first':
        // Prioritize results with strong entity relationships
        baseQuery += ` ORDER BY (
          SELECT COUNT(*) FROM jsonb_array_elements(entities) e
          WHERE (e->>'confidence')::numeric >= 0.7
        ) DESC, similarity DESC`;
        break;

      case 'decay_aware':
        // Boost recent and important memories
        baseQuery += ` ORDER BY (
          (decay_profile->>'importance')::numeric * 0.3 +
          (1 - (decay_profile->>'baseDecayRate')::numeric) * 0.3 +
          GREATEST(0, 1 - EXTRACT(EPOCH FROM (NOW() - (decay_profile->>'lastAccessed')::numeric * INTERVAL '1 millisecond')) / (24 * 60 * 60 * 1000)) * 0.4
        ) DESC, similarity DESC`;
        break;

      case 'hybrid':
      default:
        // Balanced approach combining all factors
        baseQuery += ` ORDER BY (
          similarity * 0.4 +
          (SELECT COUNT(*) FROM jsonb_array_elements(entities) e WHERE (e->>'confidence')::numeric >= 0.7) * 0.1 +
          (decay_profile->>'importance')::numeric * 0.2 +
          (1 - (decay_profile->>'baseDecayRate')::numeric) * 0.1 +
          GREATEST(0, 1 - EXTRACT(EPOCH FROM (NOW() - (decay_profile->>'lastAccessed')::numeric * INTERVAL '1 millisecond')) / (24 * 60 * 60 * 1000)) * 0.2
        ) DESC`;
        break;
    }

    baseQuery += ` LIMIT $2`;

    return baseQuery;
  }

  /**
   * Process search results with enhanced metadata
   */
  private async processSearchResults(
    rows: any[],
    options: EnhancedSearchOptions
  ): Promise<EnhancedSearchResult[]> {
    const results: EnhancedSearchResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Calculate decay factors
      const decayFactors = this.calculateDecayFactors(row.decay_profile);

      // Extract entities and relationships
      const matchedEntities = row.entities || [];
      const matchedRelationships = row.relationships || [];

      // Calculate enhanced scores
      const vectorScore = parseFloat(row.similarity);
      const graphScore = this.calculateGraphScore(
        matchedEntities,
        matchedRelationships
      );
      const decayScore = this.calculateDecayScore(decayFactors, options);
      const finalScore = this.combineScores(
        vectorScore,
        graphScore,
        decayScore,
        options
      );

      // Generate explanation if requested
      let explanation;
      if (options.includeExplanations) {
        explanation = this.generateExplanation(
          vectorScore,
          graphScore,
          decayScore,
          matchedEntities,
          matchedRelationships,
          decayFactors
        );
      }

      results.push({
        id: row.id,
        content: row.content,
        metadata: row.metadata,
        cosineSimilarity: parseFloat(row.similarity),
        rank: i + 1,

        // Enhanced scoring breakdown
        vectorScore,
        graphScore,
        decayScore,
        finalScore,

        // Entity and relationship data
        matchedEntities: matchedEntities.map((e: any) => ({
          entityId: e.entityId,
          entityName: e.entityName,
          entityType: e.entityType,
          confidence: e.confidence,
          relationshipType: e.relationshipType,
        })),

        matchedRelationships: matchedRelationships.map((r: any) => ({
          relationshipId: r.relationshipId,
          sourceEntityId: r.sourceEntityId,
          targetEntityId: r.targetEntityId,
          relationshipType: r.relationshipType,
          confidence: r.confidence,
          strength: r.strength,
        })),

        // Memory decay information
        decayFactors,

        // Provenance and explanation
        explanation,
      });
    }

    return results;
  }

  /**
   * Calculate decay factors for a memory chunk
   */
  private calculateDecayFactors(decayProfile: any) {
    if (!decayProfile) {
      return {
        memoryDecay: 0,
        entityDecay: 0,
        relationshipDecay: 0,
        recencyBoost: 0,
        importanceProtection: 0,
      };
    }

    const now = Date.now();
    const lastAccessed = decayProfile.lastAccessed || now;
    const hoursSinceAccess = (now - lastAccessed) / (1000 * 60 * 60);

    // Memory decay based on type and time
    const baseDecay = Math.min(
      1,
      (hoursSinceAccess / 24) * decayProfile.baseDecayRate
    );

    // Importance protection (higher importance = slower decay)
    const importanceProtection = decayProfile.importance * 0.3;

    // Recency boost (recent access reduces decay)
    const recencyBoost = Math.max(0, 0.2 - (hoursSinceAccess / 24) * 0.05);

    // Access count boost (frequent access reduces decay)
    const accessBoost = Math.min(0.2, decayProfile.accessCount / 20);

    const memoryDecay = Math.max(
      0,
      baseDecay - importanceProtection - recencyBoost - accessBoost
    );

    return {
      memoryDecay,
      entityDecay: memoryDecay * 0.7, // Entities decay slightly less than memories
      relationshipDecay: memoryDecay * 0.8, // Relationships decay more than entities
      recencyBoost,
      importanceProtection,
    };
  }

  /**
   * Calculate graph-based relevance score
   */
  private calculateGraphScore(entities: any[], relationships: any[]): number {
    let score = 0;

    // Score based on entity matches
    const highConfidenceEntities = entities.filter(
      (e) => e.confidence >= 0.7
    ).length;
    score += highConfidenceEntities * 0.1;

    // Score based on relationship strength
    const avgRelationshipStrength =
      relationships.length > 0
        ? relationships.reduce((sum, r) => sum + r.strength, 0) /
          relationships.length
        : 0;
    score += avgRelationshipStrength * 0.2;

    return Math.min(1, score);
  }

  /**
   * Calculate decay-aware score adjustment
   */
  private calculateDecayScore(
    decayFactors: any,
    options: EnhancedSearchOptions
  ): number {
    const {
      memoryDecay,
      entityDecay,
      relationshipDecay,
      recencyBoost,
      importanceProtection,
    } = decayFactors;

    // Base decay penalty
    let score =
      1 - (memoryDecay * 0.3 + entityDecay * 0.2 + relationshipDecay * 0.1);

    // Apply boosts
    score += recencyBoost * 0.2;
    score += importanceProtection * 0.1;

    // Special handling for recent access preference
    if (options.recentAccess) {
      score += recencyBoost * 0.3;
    }

    return Math.max(0.1, Math.min(1, score));
  }

  /**
   * Combine different score components
   */
  private combineScores(
    vectorScore: number,
    graphScore: number,
    decayScore: number,
    options: EnhancedSearchOptions
  ): number {
    const { searchMode = 'hybrid' } = options;

    switch (searchMode) {
      case 'vector':
        return vectorScore;
      case 'graph_first':
        return vectorScore * 0.3 + graphScore * 0.7;
      case 'decay_aware':
        return vectorScore * 0.6 + decayScore * 0.4;
      case 'hybrid':
      default:
        return vectorScore * 0.5 + graphScore * 0.3 + decayScore * 0.2;
    }
  }

  /**
   * Generate explanation for search result
   */
  private generateExplanation(
    vectorScore: number,
    graphScore: number,
    decayScore: number,
    entities: any[],
    relationships: any[],
    decayFactors: any
  ) {
    const reasoning: string[] = [];
    const entityConnections: string[] = [];
    const relationshipPaths: string[] = [];

    // Vector similarity explanation
    if (vectorScore > 0.7) {
      reasoning.push(
        `High semantic similarity (${(vectorScore * 100).toFixed(1)}%) to query`
      );
    }

    // Graph connections explanation
    if (graphScore > 0.3) {
      reasoning.push(
        `Strong entity relationships (${entities.length} entities, ${relationships.length} connections)`
      );
      entityConnections.push(
        ...entities.filter((e) => e.confidence >= 0.7).map((e) => e.entityName)
      );
      relationshipPaths.push(
        ...relationships
          .filter((r) => r.strength >= 0.6)
          .map(
            (r) => `${r.relationshipType} (${(r.strength * 100).toFixed(1)}%)`
          )
      );
    }

    // Decay factors explanation
    if (decayFactors.recencyBoost > 0.1) {
      reasoning.push(
        `Recent access provides relevance boost (${(decayFactors.recencyBoost * 100).toFixed(1)}%)`
      );
    }
    if (decayFactors.importanceProtection > 0.1) {
      reasoning.push(
        `High importance reduces decay penalty (${(decayFactors.importanceProtection * 100).toFixed(1)}%)`
      );
    }

    return {
      reasoning: reasoning.join('; '),
      entityConnections,
      relationshipPaths,
      confidenceBreakdown: {
        vector: vectorScore,
        graph: graphScore,
        decay: decayScore,
      },
    };
  }

  /**
   * Get next parameter index for query building
   */
  private paramIndex = 4; // Start after vector, limit, threshold
  private getNextParamIndex(): number {
    return this.paramIndex++;
  }

  /**
   * Batch insert/update multiple chunks
   */
  async batchUpsertChunks(chunks: EnhancedMemoryChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const chunk of chunks) {
        await this.upsertChunk(chunk);
      }

      await client.query('COMMIT');
      console.log(`✅ Upserted ${chunks.length} enhanced chunks`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get chunk by ID with full metadata
   */
  async getChunk(id: string): Promise<EnhancedMemoryChunk | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM ${this.config.tableName} WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        content: row.content,
        embedding: row.embedding,
        metadata: row.metadata,
        entities: row.entities || [],
        relationships: row.relationships || [],
        decayProfile: row.decay_profile,
        provenance: row.provenance,
        graphLinks: row.graph_links || [],
        temporalContext: row.temporal_context,
        spatialContext: row.spatial_context,
        createdAt: row.created_at.getTime(),
        updatedAt: row.updated_at.getTime(),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update memory access for decay calculation
   */
  async recordAccess(
    chunkId: string,
    metadata: {
      importance?: number;
      accessType?: 'read' | 'search' | 'consolidation';
      swrStrength?: number;
    } = {}
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const now = Date.now();

      // Update decay profile with access information
      await client.query(
        `
        UPDATE ${this.config.tableName}
        SET decay_profile = jsonb_set(
          jsonb_set(
            jsonb_set(decay_profile, '{lastAccessed}', $2::jsonb),
            '{accessCount}', ((decay_profile->>'accessCount')::int + 1)::text::jsonb
          ),
          '{importance}', COALESCE($3::text::jsonb, decay_profile->'importance')
        )
        WHERE id = $1
      `,
        [chunkId, now.toString(), metadata.importance?.toString()]
      );

      // Add consolidation history if SWR event
      if (metadata.swrStrength) {
        await client.query(
          `
          UPDATE ${this.config.tableName}
          SET decay_profile = jsonb_set(
            decay_profile,
            '{consolidationHistory}',
            (decay_profile->'consolidationHistory' || $2::jsonb)
          )
          WHERE id = $1
        `,
          [
            chunkId,
            JSON.stringify([
              {
                timestamp: now,
                type: 'swr',
                strength: metadata.swrStrength,
              },
            ]),
          ]
        );
      }
    } finally {
      client.release();
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalChunks: number;
    avgEmbeddingDimension: number;
    memoryTypeDistribution: Record<string, number>;
    entityCount: number;
    relationshipCount: number;
    lastUpdated: Date;
  }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT
          COUNT(*) as total_chunks,
          AVG(array_length(embedding::float[], 1)) as avg_dimension,
          COUNT(DISTINCT (metadata->>'type')) as memory_types,
          COUNT(DISTINCT e.entity_id) as entity_count,
          COUNT(DISTINCT r.relationship_id) as relationship_count,
          MAX(updated_at) as last_updated
        FROM ${this.config.tableName}
        LEFT JOIN jsonb_array_elements(entities) e ON true
        LEFT JOIN jsonb_array_elements(relationships) r ON true
      `);

      const row = result.rows[0];

      // Get memory type distribution
      const typeResult = await client.query(`
        SELECT metadata->>'type' as type, COUNT(*) as count
        FROM ${this.config.tableName}
        GROUP BY metadata->>'type'
      `);

      const memoryTypeDistribution: Record<string, number> = {};
      for (const typeRow of typeResult.rows) {
        memoryTypeDistribution[typeRow.type] = parseInt(typeRow.count);
      }

      return {
        totalChunks: parseInt(row.total_chunks),
        avgEmbeddingDimension:
          parseFloat(row.avg_dimension) || this.config.dimension,
        memoryTypeDistribution,
        entityCount: parseInt(row.entity_count),
        relationshipCount: parseInt(row.relationship_count),
        lastUpdated: row.last_updated,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Cleanup old memories based on retention policy
   */
  async cleanup(retentionDays: number = 30): Promise<number> {
    const client = await this.pool.connect();
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await client.query(
        `DELETE FROM ${this.config.tableName} WHERE updated_at < $1`,
        [cutoffDate.toISOString()]
      );

      console.log(`🧹 Cleaned up ${result.rowCount} old memory chunks`);
      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }

  /**
   * Get database status information
   */
  async getStatus(): Promise<{
    connected: boolean;
    totalChunks: number;
    lastUpdated: Date | null;
    databaseName: string;
  }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT COUNT(*) as count, MAX(updated_at) as last_updated FROM ${this.config.tableName}`
      );

      return {
        connected: true,
        totalChunks: parseInt(result.rows[0].count),
        lastUpdated: result.rows[0].last_updated,
        databaseName: this.seedDatabase,
      };
    } catch (error) {
      return {
        connected: false,
        totalChunks: 0,
        lastUpdated: null,
        databaseName: this.seedDatabase,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get database name
   */
  getDatabaseName(): string {
    return this.seedDatabase;
  }

  /**
   * Store a single chunk (alias for upsertChunk)
   */
  async storeChunk(chunk: EnhancedMemoryChunk): Promise<void> {
    return this.upsertChunk(chunk);
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
