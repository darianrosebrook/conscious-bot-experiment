/**
 * Vector Database Service
 *
 * PostgreSQL with pgvector integration for fast, scalable vector similarity search.
 * Provides the foundation for semantic memory retrieval in the enhanced memory system.
 *
 * @author @darianrosebrook
 */

import { Pool, Client } from 'pg';
import { z } from 'zod';
import { type } from 'os';

// ============================================================================
// Types and Schemas
// ============================================================================

export interface ChunkMetadata {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  graphLinks?: Array<{
    entityId: string;
    relationship: string;
    confidence: number;
  }>;
}

export const MemoryChunkSchema = z.object({
  id: z.string(),
  content: z.string(),
  embedding: z.array(z.number()).length(768), // Fixed 768D embeddings
  metadata: z.record(z.any()),
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

export type MemoryChunk = z.infer<typeof MemoryChunkSchema>;

export const SearchResultSchema = z.object({
  id: z.string(),
  content: z.string(),
  metadata: z.record(z.any()),
  cosineSimilarity: z.number(),
  rank: z.number(),
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
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export interface VectorDatabaseConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  worldSeed?: number; // For per-seed database isolation
  tableName?: string;
  dimension?: number;
  maxConnections?: number;
  enablePersistence?: boolean;
}

const DEFAULT_CONFIG: Required<VectorDatabaseConfig> = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '',
  database: 'conscious_bot',
  worldSeed: 0,
  tableName: 'memory_chunks',
  dimension: 768,
  maxConnections: 10,
  enablePersistence: true,
};

// ============================================================================
// Vector Database Implementation
// ============================================================================

export class VectorDatabase {
  private pool: Pool;
  private config: Required<VectorDatabaseConfig>;
  private seedDatabase: string;

  constructor(config: VectorDatabaseConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Generate per-seed database name if worldSeed is provided
    this.seedDatabase =
      this.config.worldSeed > 0
        ? `${this.config.database}_seed_${this.config.worldSeed}`
        : this.config.database;

    // Build connection string from individual components
    const connectionString = `postgresql://${this.config.user}:${this.config.password}@${this.config.host}:${this.config.port}/${this.seedDatabase}`;

    this.pool = new Pool({
      connectionString,
      max: this.config.maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  /**
   * Initialize database with required extensions and tables
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Enable pgvector extension
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');

      // Create main memory chunks table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          embedding VECTOR(${this.config.dimension}),
          metadata JSONB NOT NULL,
          graph_links JSONB DEFAULT '[]'::jsonb,
          temporal_context JSONB,
          spatial_context JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create HNSW index for fast ANN search
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${this.config.tableName}_hnsw_idx
        ON ${this.config.tableName}
        USING hnsw (embedding vector_cosine_ops)
      `);

      // Create metadata indexes for filtering
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
        `✅ Vector database initialized: ${this.seedDatabase}.${this.config.tableName}`
      );
    } finally {
      client.release();
    }
  }

  /**
   * Insert or update a memory chunk with vector embedding
   */
  async upsertChunk(chunk: MemoryChunk): Promise<void> {
    // Validate chunk before insertion
    const validation = MemoryChunkSchema.safeParse(chunk);
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
        (id, content, embedding, metadata, graph_links, temporal_context, spatial_context, updated_at)
        VALUES ($1, $2, ${vectorLiteral}::vector, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          graph_links = EXCLUDED.graph_links,
          temporal_context = EXCLUDED.temporal_context,
          spatial_context = EXCLUDED.spatial_context,
          updated_at = NOW()
      `,
        [
          chunk.id,
          chunk.content,
          JSON.stringify(chunk.metadata),
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
   * Batch insert/update multiple chunks
   */
  async batchUpsertChunks(chunks: MemoryChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const chunk of chunks) {
        await this.upsertChunk(chunk);
      }

      await client.query('COMMIT');
      console.log(`✅ Upserted ${chunks.length} chunks`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Search for similar chunks using vector similarity
   */
  async search(
    queryEmbedding: number[],
    limit: number = 30,
    filters: {
      type?: string;
      minConfidence?: number;
      maxAge?: number;
      world?: string;
      aclFilter?: string;
    } = {}
  ): Promise<SearchResult[]> {
    if (queryEmbedding.length !== this.config.dimension) {
      throw new Error(
        `Query embedding dimension mismatch: expected ${this.config.dimension}, got ${queryEmbedding.length}`
      );
    }

    const client = await this.pool.connect();
    try {
      const vectorLiteral = `'[${queryEmbedding.join(',')}]'`;

      let whereClause = '';
      const params: any[] = [limit];
      let paramIndex = 2;

      // Apply filters
      if (filters.type) {
        whereClause += ` WHERE metadata->>'type' = $${paramIndex}`;
        params.push(filters.type);
        paramIndex++;
      }

      if (filters.minConfidence !== undefined) {
        const prefix = whereClause ? ' AND ' : ' WHERE ';
        whereClause += `${prefix} (metadata->>'confidence')::numeric >= $${paramIndex}`;
        params.push(filters.minConfidence);
        paramIndex++;
      }

      if (filters.maxAge !== undefined) {
        const prefix = whereClause ? ' AND ' : ' WHERE ';
        whereClause += `${prefix} (metadata->>'timestamp')::numeric >= $${paramIndex}`;
        params.push(Date.now() - filters.maxAge);
        paramIndex++;
      }

      if (filters.world) {
        const prefix = whereClause ? ' AND ' : ' WHERE ';
        whereClause += `${prefix} spatial_context->>'world' = $${paramIndex}`;
        params.push(filters.world);
        paramIndex++;
      }

      if (filters.aclFilter) {
        const prefix = whereClause ? ' AND ' : ' WHERE ';
        whereClause += `${prefix} metadata->>'acl' = $${paramIndex}`;
        params.push(filters.aclFilter);
        paramIndex++;
      }

      const query = `
        SELECT
          id,
          content,
          metadata,
          graph_links,
          temporal_context,
          spatial_context,
          1 - (embedding <#> ${vectorLiteral}::vector) AS cosine_similarity
        FROM ${this.config.tableName}
        ${whereClause}
        ORDER BY embedding <#> ${vectorLiteral}::vector
        LIMIT $1
      `;

      const result = await client.query(query, params);

      return result.rows.map((row, index) => ({
        id: row.id,
        content: row.content,
        metadata: row.metadata,
        graphLinks: row.graph_links || [],
        temporalContext: row.temporal_context,
        spatialContext: row.spatial_context,
        cosineSimilarity: parseFloat(row.cosine_similarity),
        rank: index + 1,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Get a specific chunk by ID
   */
  async getChunkById(id: string): Promise<MemoryChunk | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT id, content, metadata, graph_links, temporal_context, spatial_context, created_at, updated_at
        FROM ${this.config.tableName} WHERE id = $1
      `,
        [id]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        content: row.content,
        embedding: [], // We don't need embedding for retrieval
        metadata: row.metadata,
        graphLinks: row.graph_links || [],
        temporalContext: row.temporal_context,
        spatialContext: row.spatial_context,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalChunks: number;
    averageConfidence: number;
    typeDistribution: Record<string, number>;
    recentChunks: number;
    storageSize: string;
  }> {
    const client = await this.pool.connect();
    try {
      // Total count
      const countResult = await client.query(
        `SELECT COUNT(*) FROM ${this.config.tableName}`
      );
      const totalChunks = parseInt(countResult.rows[0].count);

      // Average confidence
      const confidenceResult = await client.query(`
        SELECT AVG((metadata->>'confidence')::numeric) as avg_confidence
        FROM ${this.config.tableName}
      `);
      const averageConfidence = parseFloat(
        confidenceResult.rows[0].avg_confidence || '0'
      );

      // Type distribution
      const typeResult = await client.query(`
        SELECT metadata->>'type' as type, COUNT(*) as count
        FROM ${this.config.tableName}
        GROUP BY metadata->>'type'
      `);
      const typeDistribution: Record<string, number> = {};
      typeResult.rows.forEach((row) => {
        typeDistribution[row.type] = parseInt(row.count);
      });

      // Recent chunks (last 24 hours)
      const recentResult = await client.query(`
        SELECT COUNT(*) FROM ${this.config.tableName}
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);
      const recentChunks = parseInt(recentResult.rows[0].count);

      // Storage size (approximate)
      const sizeResult = await client.query(`
        SELECT pg_size_pretty(pg_total_relation_size('${this.config.tableName}')) as size
      `);
      const storageSize = sizeResult.rows[0].size;

      return {
        totalChunks,
        averageConfidence,
        typeDistribution,
        recentChunks,
        storageSize,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Clean up old chunks based on retention policy
   */
  async cleanup(retentionDays: number = 30): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        DELETE FROM ${this.config.tableName}
        WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
      `);

      console.log(`🧹 Cleaned up ${result.rowCount} old chunks`);
      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }

  /**
   * Get the current database name (with seed suffix if applicable)
   */
  getDatabaseName(): string {
    return this.seedDatabase;
  }

  /**
   * Get database status information
   */
  async getStatus(): Promise<{
    database: string;
    tableName: string;
    dimension: number;
    worldSeed: number;
    connectionStatus: 'connected' | 'disconnected';
    totalChunks?: number;
    storageSize?: string;
  }> {
    const client = await this.pool.connect();
    try {
      // Check connection status
      await client.query('SELECT 1');

      // Get database statistics
      const statsResult = await client.query(`
        SELECT
          COUNT(*) as total_chunks,
          pg_size_pretty(pg_total_relation_size('${this.config.tableName}')) as storage_size
        FROM ${this.config.tableName}
      `);

      return {
        database: this.seedDatabase,
        tableName: this.config.tableName,
        dimension: this.config.dimension,
        worldSeed: this.config.worldSeed,
        connectionStatus: 'connected',
        totalChunks: parseInt(statsResult.rows[0]?.total_chunks || '0'),
        storageSize: statsResult.rows[0]?.storage_size || '0 bytes',
      };
    } catch (error) {
      return {
        database: this.seedDatabase,
        tableName: this.config.tableName,
        dimension: this.config.dimension,
        worldSeed: this.config.worldSeed,
        connectionStatus: 'disconnected',
      };
    } finally {
      client.release();
    }
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
