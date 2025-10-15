/**
 * Enhanced Knowledge Graph Core
 *
 * PostgreSQL-persisted knowledge graph with vector embeddings on entities,
 * optimized for hybrid memory search and multi-hop reasoning.
 * Enhanced with decay-aware operations and advanced entity relationship modeling.
 *
 * @author @darianrosebrook
 */

import { Pool, Client, PoolClient } from 'pg';
import {
  Entity,
  Relationship,
  KnowledgeSource,
  QueryType,
  KnowledgeQuery,
  QueryResult,
  KnowledgePath,
  EntityNeighborhood,
  KnowledgePattern,
  KnowledgeGraphStats,
  KnowledgeGraphConfig,
  QueryFilter,
  FilterOperator,
  EntitySchema,
  RelationshipSchema,
  EntityType,
  RelationType,
  PropertyType,
} from './semantic/types';

// Import entity types as values (enums)
import {
  ExtractedRelationshipType,
  ExtractedEntity,
  ExtractedRelationship,
  ExtractedEntityType,
  EntityExtractionResult,
} from './entity-extraction-service';

// Re-export for tests and other modules
export { EntityType, RelationType };

// ============================================================================
// Enhanced Types for PostgreSQL Integration
// ============================================================================

export interface EntitySearchOptions {
  query?: string;
  queryEmbedding?: number[];
  entityTypes?: EntityType[];
  minConfidence?: number;
  memoryTypes?: string[];
  limit?: number;
  includeRelationships?: boolean;
  searchMode?: 'vector' | 'text' | 'hybrid';
}

export interface EnhancedEntity extends Entity {
  // Additional entity properties
  aliases?: string[];

  // Vector embedding for similarity search
  embedding?: number[];

  // Enhanced metadata for hybrid search
  metadata: {
    frequency: number;
    context: string[];
    relatedTerms: string[];
    importance: number;
    memoryTypes: string[];
    extractionMethods: string[];
    wikidataId?: string;
  };

  // Memory decay integration
  decayProfile: {
    memoryType: string;
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

  // Enhanced provenance
  provenance: {
    sourceSystem: string;
    extractionMethod: string;
    confidence: number;
    processingTime: number;
    version: string;
  };
}

export interface EnhancedRelationship extends Relationship {
  // Relationship strength for ranking and filtering
  strength: number;

  // Enhanced evidence with statistical measures
  evidence: {
    sourceText: string;
    cooccurrenceCount: number;
    contextWindow: number;
    extractionMethod: string;
    mutualInformation?: number;
    pointwiseMutualInformation?: number;
  };

  // Memory decay integration for relationships
  decayProfile: {
    baseDecayRate: number;
    lastAccessed: number;
    accessCount: number;
    strength: number;
    certainty: number;
  };
}

// ============================================================================
// Enhanced Knowledge Graph Configuration
// ============================================================================

export interface EnhancedKnowledgeGraphConfig extends KnowledgeGraphConfig {
  // PostgreSQL configuration
  database?: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    tablePrefix?: string;
  };

  // Vector database integration
  vectorDimension: number;
  enableVectorSearch: boolean;

  // Performance optimization
  enableIndexing: boolean;
  enableCaching: boolean;
  cacheSize: number;

  // Memory decay integration
  enableDecayTracking: boolean;
  decayEvaluationInterval: number;

  // Advanced features
  enableFuzzyMatching: boolean;
  enableStatisticalInference: boolean;
  enableExternalLinking: boolean;
}

// ============================================================================
// Conversion Utilities
// ============================================================================

/**
 * Map entity extraction EntityType to semantic EntityType
 */
function mapEntityType(extractionType: ExtractedEntityType): EntityType {
  // Map extraction entity types to semantic entity types
  const typeMapping: Record<string, EntityType> = {
    PERSON: 'PLAYER' as EntityType,
    ORGANIZATION: 'SYSTEM' as EntityType,
    LOCATION: 'PLACE' as EntityType,
    CONCEPT: 'CONCEPT' as EntityType,
    TECHNOLOGY: 'ITEM' as EntityType,
    PROJECT: 'SYSTEM' as EntityType,
    TASK: 'EVENT' as EntityType,
    EMOTION: 'UNKNOWN' as EntityType,
    SKILL: 'UNKNOWN' as EntityType,
    TOOL: 'ITEM' as EntityType,
    MEMORY_TYPE: 'CONCEPT' as EntityType,
    OTHER: 'UNKNOWN' as EntityType,
  };

  return typeMapping[extractionType] || ('UNKNOWN' as EntityType);
}

/**
 * Map entity extraction RelationshipType to semantic RelationType
 */
function mapRelationshipType(
  extractionType: ExtractedRelationshipType
): RelationType {
  // Map extraction relationship types to semantic relationship types
  const typeMapping: Record<string, RelationType> = {
    WORKS_ON: 'USED_FOR' as RelationType,
    PART_OF: 'PART_OF' as RelationType,
    RELATED_TO: 'SIMILAR_TO' as RelationType,
    MENTIONS: 'RELATED_TO' as RelationType,
    LOCATED_IN: 'LOCATED_AT' as RelationType,
    CREATED_BY: 'PRODUCES' as RelationType,
    USED_BY: 'USED_FOR' as RelationType,
    SIMILAR_TO: 'SIMILAR_TO' as RelationType,
    DEPENDS_ON: 'REQUIRES' as RelationType,
    COLLABORATES_WITH: 'RELATED_TO' as RelationType,
    INFLUENCES: 'ENABLES' as RelationType,
    LEADS_TO: 'CAUSES' as RelationType,
    FOLLOWS_FROM: 'REQUIRES' as RelationType,
    OTHER: 'RELATED_TO' as RelationType,
  };

  return typeMapping[extractionType] || ('RELATED_TO' as RelationType);
}

/**
 * Convert ExtractedEntity to EnhancedEntity for knowledge graph processing
 */
function convertExtractedEntityToEnhancedEntity(
  extracted: ExtractedEntity
): EnhancedEntity {
  const now = Date.now();

  return {
    id: extracted.id,
    type: mapEntityType(extracted.type),
    name: extracted.name,
    description: extracted.description,
    properties: {
      aliases: {
        confidence: extracted.confidence,
        timestamp: now,
        type: PropertyType.ARRAY,
        source: KnowledgeSource.SYSTEM,
        value: extracted.aliases,
      },
      extractionMethod: {
        confidence: extracted.confidence,
        timestamp: now,
        type: PropertyType.STRING,
        source: KnowledgeSource.SYSTEM,
        value: extracted.extractionMethod,
      },
      sourceText: {
        confidence: extracted.confidence,
        timestamp: now,
        type: PropertyType.STRING,
        source: KnowledgeSource.SYSTEM,
        value: extracted.sourceText,
      },
      ...(extracted.position && {
        position: {
          confidence: extracted.confidence,
          timestamp: now,
          type: PropertyType.OBJECT,
          source: KnowledgeSource.SYSTEM,
          value: extracted.position,
        },
      }),
    },
    tags: [],
    confidence: extracted.confidence,
    source: KnowledgeSource.SYSTEM,
    createdAt: now,
    updatedAt: now,
    lastAccessed: now,
    accessCount: 1,

    // Enhanced metadata
    metadata: {
      frequency: extracted.metadata.frequency,
      context: extracted.metadata.context,
      relatedTerms: extracted.metadata.relatedTerms,
      importance: extracted.metadata.importance,
      memoryTypes: ['semantic'],
      extractionMethods: [extracted.extractionMethod],
      wikidataId: extracted.metadata.wikidataId,
    },

    // Memory decay profile
    decayProfile: {
      memoryType: 'semantic',
      baseDecayRate: 0.01, // Default decay rate
      lastAccessed: now,
      accessCount: 1,
      importance: extracted.metadata.importance,
      consolidationHistory: [
        {
          timestamp: now,
          type: 'manual',
          strength: extracted.confidence,
        },
      ],
    },

    // Provenance
    provenance: {
      sourceSystem: 'enhanced_knowledge_graph',
      extractionMethod: 'manual',
      confidence: extracted.confidence,
      processingTime: 0,
      version: '1.0.0',
    },
  };
}

/**
 * Convert ExtractedRelationship to EnhancedRelationship for knowledge graph processing
 */
function convertExtractedRelationshipToEnhancedRelationship(
  extracted: ExtractedRelationship
): EnhancedRelationship {
  const now = Date.now();

  return {
    id: extracted.id,
    type: mapRelationshipType(extracted.type),
    sourceId: extracted.sourceEntityId,
    targetId: extracted.targetEntityId,
    properties: {
      strength: {
        confidence: extracted.confidence,
        timestamp: now,
        type: PropertyType.NUMBER,
        source: KnowledgeSource.SYSTEM,
        value: extracted.strength,
      },
    },
    bidirectional: false, // Default to directional
    confidence: extracted.confidence,
    source: KnowledgeSource.SYSTEM,
    createdAt: now,
    updatedAt: now,
    lastAccessed: now,
    accessCount: 1,

    // Enhanced strength
    strength: extracted.strength,

    // Evidence as string for base Relationship
    evidence: extracted.evidence || '',

    // Memory decay profile
    decayProfile: {
      baseDecayRate: 0.02, // Relationships decay slightly faster than entities
      lastAccessed: now,
      accessCount: 1,
      strength: extracted.strength,
      certainty: extracted.confidence,
    },
  };
}
// ============================================================================
// Enhanced Knowledge Graph Core Implementation
// ============================================================================

export class EnhancedKnowledgeGraphCore {
  private pool: Pool;
  private config: EnhancedKnowledgeGraphConfig;

  // In-memory caches for performance
  private entityCache: Map<string, EnhancedEntity> = new Map();
  private relationshipCache: Map<string, EnhancedRelationship> = new Map();
  private entityTypeIndex: Map<EntityType, Set<string>> = new Map();
  private relationshipTypeIndex: Map<RelationType, Set<string>> = new Map();

  // Database table names
  private readonly entityTable: string;
  private readonly relationshipTable: string;
  private readonly entityEmbeddingTable: string;

  constructor(config: Partial<EnhancedKnowledgeGraphConfig> = {}) {
    this.config = {
      minConfidence: 0.7,
      maxEntities: 10000,
      enableInference: true,
      persistToStorage: true,
      enableSemanticDecay: true,
      semanticDecayRate: 0.02,
      minimumSemanticConfidence: 0.1,
      vectorDimension: 768,
      enableVectorSearch: true,
      enableIndexing: true,
      enableCaching: true,
      cacheSize: 1000,
      enableDecayTracking: true,
      decayEvaluationInterval: 60 * 60 * 1000, // 1 hour
      enableFuzzyMatching: true,
      enableStatisticalInference: true,
      enableExternalLinking: false,
      ...config,
    };

    // Initialize database connection
    this.pool = new Pool({
      host: this.config.database?.host || 'localhost',
      port: this.config.database?.port || 5432,
      user: this.config.database?.user || 'postgres',
      password: this.config.database?.password || '',
      database: this.config.database?.database || 'conscious_bot',
      max: 20, // Increased for better performance
    });

    // Set up table names with optional prefix
    const prefix = this.config.database?.tablePrefix || 'knowledge_graph';
    this.entityTable = `${prefix}_entities`;
    this.relationshipTable = `${prefix}_relationships`;
    this.entityEmbeddingTable = `${prefix}_entity_embeddings`;

    // Initialize indexes
    this.initializeIndexes();
  }

  /**
   * Initialize enhanced database schema with PostgreSQL + pgvector
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Enable pgvector extension
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');

      // Create enhanced entities table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.entityTable} (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          aliases TEXT[] DEFAULT '{}',
          confidence FLOAT NOT NULL,

          -- Vector embedding for similarity search
          embedding VECTOR(${this.config.vectorDimension}),

          -- Enhanced metadata as JSONB
          metadata JSONB NOT NULL,

          -- Memory decay profile
          decay_profile JSONB NOT NULL,

          -- Enhanced provenance
          provenance JSONB NOT NULL,

          -- Legacy support
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          last_accessed TIMESTAMP DEFAULT NOW(),
          access_count INTEGER DEFAULT 0
        )
      `);

      // Create enhanced relationships table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.relationshipTable} (
          id TEXT PRIMARY KEY,
          source_entity_id TEXT NOT NULL REFERENCES ${this.entityTable}(id) ON DELETE CASCADE,
          target_entity_id TEXT NOT NULL REFERENCES ${this.entityTable}(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          confidence FLOAT NOT NULL,
          strength FLOAT NOT NULL,

          -- Enhanced evidence as JSONB
          evidence JSONB NOT NULL,

          -- Relationship decay profile
          decay_profile JSONB NOT NULL,

          -- Legacy support
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          is_directional BOOLEAN DEFAULT FALSE,

          UNIQUE(source_entity_id, target_entity_id, type)
        )
      `);

      // Create optimized indexes for hybrid search
      await this.createOptimizedIndexes(client);

      console.log(
        `✅ Enhanced knowledge graph initialized: ${this.entityTable}, ${this.relationshipTable}`
      );
    } finally {
      client.release();
    }
  }

  /**
   * Create optimized indexes for hybrid search performance
   */
  private async createOptimizedIndexes(client: PoolClient): Promise<void> {
    // Vector similarity index (HNSW for fast ANN search)
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${this.entityTable}_embedding_hnsw_idx
      ON ${this.entityTable}
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 200)
    `);

    // Entity type indexes for filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${this.entityTable}_type_idx
      ON ${this.entityTable} (type)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${this.entityTable}_confidence_idx
      ON ${this.entityTable} (confidence)
    `);

    // Memory decay indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${this.entityTable}_decay_importance_idx
      ON ${this.entityTable} (((decay_profile->>'importance')::numeric))
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${this.entityTable}_decay_last_accessed_idx
      ON ${this.entityTable} (((decay_profile->>'lastAccessed')::numeric))
    `);

    // Relationship indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${this.relationshipTable}_source_target_idx
      ON ${this.relationshipTable} (source_entity_id, target_entity_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${this.relationshipTable}_type_idx
      ON ${this.relationshipTable} (type)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${this.relationshipTable}_strength_idx
      ON ${this.relationshipTable} (strength)
    `);

    // Composite indexes for complex queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${this.entityTable}_hybrid_search_idx
      ON ${this.entityTable} (type, confidence, (decay_profile->>'importance')::numeric)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${this.relationshipTable}_hybrid_search_idx
      ON ${this.relationshipTable} (type, strength, confidence)
    `);
  }

  /**
   * Create or update entity with vector embedding and decay profile
   */
  async upsertEntity(entityData: {
    name: string;
    type: EntityType;
    confidence: number;
    aliases?: string[];
    embedding?: number[];
    metadata?: any;
    decayProfile?: any;
    provenance?: any;
  }): Promise<EnhancedEntity> {
    const now = Date.now();
    const entityId = `entity-${this.generateId()}`;

    // Create default decay profile if not provided
    const decayProfile = entityData.decayProfile || {
      memoryType: 'semantic',
      baseDecayRate: 0.01,
      lastAccessed: now,
      accessCount: 1,
      importance: entityData.metadata?.importance || 0.7,
      consolidationHistory: [],
    };

    // Create default provenance if not provided
    const provenance = entityData.provenance || {
      sourceSystem: 'enhanced_knowledge_graph',
      extractionMethod: 'manual',
      confidence: entityData.confidence,
      processingTime: 0,
      version: '1.0.0',
    };

    const enhancedEntity: EnhancedEntity = {
      id: entityId,
      name: entityData.name,
      type: entityData.type,
      aliases: entityData.aliases || [],
      confidence: entityData.confidence,
      embedding: entityData.embedding,
      properties: {},
      tags: [],
      source: KnowledgeSource.SYSTEM,
      metadata: {
        frequency: 1,
        context: [],
        relatedTerms: [],
        importance: entityData.metadata?.importance || 0.7,
        memoryTypes: entityData.metadata?.memoryTypes || ['semantic'],
        extractionMethods: entityData.metadata?.extractionMethods || ['manual'],
        ...entityData.metadata,
      },
      decayProfile,
      provenance,
      createdAt: now,
      updatedAt: now,
      lastAccessed: now,
      accessCount: 1,
    };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Insert entity
      await client.query(
        `
        INSERT INTO ${this.entityTable}
        (id, name, type, aliases, confidence, embedding, metadata, decay_profile, provenance, updated_at, last_accessed, access_count)
        VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb, $8::jsonb, $9::jsonb, NOW(), NOW(), 1)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          aliases = EXCLUDED.aliases,
          confidence = EXCLUDED.confidence,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          decay_profile = EXCLUDED.decay_profile,
          provenance = EXCLUDED.provenance,
          updated_at = NOW(),
          access_count = ${this.entityTable}.access_count + 1
      `,
        [
          entityId,
          entityData.name,
          entityData.type,
          entityData.aliases || [],
          entityData.confidence,
          entityData.embedding
            ? `[${entityData.embedding.map((x) => x.toString()).join(',')}]`
            : null,
          JSON.stringify(enhancedEntity.metadata),
          JSON.stringify(decayProfile),
          JSON.stringify(provenance),
        ]
      );

      await client.query('COMMIT');

      // Update cache
      this.entityCache.set(entityId, enhancedEntity);
      this.entityTypeIndex.get(entityData.type)?.add(entityId);

      return enhancedEntity;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create relationship with enhanced evidence and decay tracking
   */
  async createRelationship(relationshipData: {
    sourceEntityId: string;
    targetEntityId: string;
    type: RelationType;
    confidence: number;
    strength: number;
    evidence?: any;
    isDirectional?: boolean;
  }): Promise<EnhancedRelationship> {
    const relationshipId = `rel-${this.generateId()}`;
    const now = Date.now();

    const enhancedRelationship: EnhancedRelationship = {
      id: relationshipId,
      sourceId: relationshipData.sourceEntityId,
      targetId: relationshipData.targetEntityId,
      type: relationshipData.type,
      confidence: relationshipData.confidence,
      strength: relationshipData.strength,
      properties: {},
      bidirectional:
        relationshipData.isDirectional !== undefined
          ? !relationshipData.isDirectional
          : false,
      source: KnowledgeSource.SYSTEM,
      evidence: {
        sourceText: '',
        cooccurrenceCount: 1,
        contextWindow: 20,
        extractionMethod: 'manual',
        ...relationshipData.evidence,
      },
      decayProfile: {
        baseDecayRate: 0.02, // 2% per day for relationships
        lastAccessed: now,
        accessCount: 1,
        strength: relationshipData.strength,
        certainty: relationshipData.confidence,
      },
      createdAt: now,
      updatedAt: now,
      lastAccessed: now,
      accessCount: 1,
    };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Insert relationship
      await client.query(
        `
        INSERT INTO ${this.relationshipTable}
        (id, source_entity_id, target_entity_id, type, confidence, strength, evidence, decay_profile, updated_at, is_directional)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, NOW(), $9)
      `,
        [
          relationshipId,
          relationshipData.sourceEntityId,
          relationshipData.targetEntityId,
          relationshipData.type,
          relationshipData.confidence,
          relationshipData.strength,
          JSON.stringify(enhancedRelationship.evidence),
          JSON.stringify(enhancedRelationship.decayProfile),
          relationshipData.isDirectional || false,
        ]
      );

      await client.query('COMMIT');

      // Update cache
      this.relationshipCache.set(relationshipId, enhancedRelationship);
      this.relationshipTypeIndex
        .get(relationshipData.type)
        ?.add(relationshipId);

      return enhancedRelationship;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Enhanced search for entities with vector similarity and graph filtering
   */
  async searchEntities(
    options: {
      query?: string;
      queryEmbedding?: number[];
      entityTypes?: EntityType[];
      minConfidence?: number;
      memoryTypes?: string[];
      limit?: number;
      includeRelationships?: boolean;
      searchMode?: 'vector' | 'text' | 'hybrid';
    } = {}
  ): Promise<{
    entities: EnhancedEntity[];
    totalCount: number;
    searchTime: number;
  }> {
    const startTime = performance.now();
    const limit = options.limit || 50;

    const client = await this.pool.connect();
    try {
      let query = `SELECT * FROM ${this.entityTable} WHERE 1=1`;
      const params: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (options.entityTypes?.length) {
        query += ` AND type = ANY($${paramIndex})`;
        params.push(options.entityTypes);
        paramIndex++;
      }

      if (options.minConfidence !== undefined) {
        query += ` AND confidence >= $${paramIndex}`;
        params.push(options.minConfidence);
        paramIndex++;
      }

      if (options.memoryTypes?.length) {
        query += ` AND (metadata->'memoryTypes') ?& $${paramIndex}`;
        params.push(options.memoryTypes);
        paramIndex++;
      }

      // Add search mode logic
      if (options.searchMode === 'vector' && options.queryEmbedding) {
        query += ` ORDER BY embedding <=> $${paramIndex}::vector`;
        params.push(`[${options.queryEmbedding.join(',')}]`);
        paramIndex++;
      } else if (options.searchMode === 'text' && options.query) {
        query += ` ORDER BY similarity(name, $${paramIndex}) DESC`;
        params.push(options.query);
        paramIndex++;
      } else if (
        options.searchMode === 'hybrid' &&
        options.queryEmbedding &&
        options.query
      ) {
        // Hybrid scoring combining vector similarity and text similarity
        query += ` ORDER BY (
          (1 - (embedding <=> $${paramIndex}::vector)) * 0.6 +
          similarity(name, $${paramIndex + 1}) * 0.4
        ) DESC`;
        params.push(`[${options.queryEmbedding.join(',')}]`, options.query);
        paramIndex += 2;
      } else {
        // Default: order by confidence and importance
        query += ` ORDER BY confidence DESC, (decay_profile->>'importance')::numeric DESC`;
      }

      query += ` LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await client.query(query, params);
      const entities = result.rows.map((row) => this.rowToEntity(row));

      const totalCount = entities.length; // For this simple implementation

      return {
        entities,
        totalCount,
        searchTime: performance.now() - startTime,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Find shortest path between entities using graph traversal
   */
  async findPath(
    sourceEntityId: string,
    targetEntityId: string,
    maxHops: number = 3,
    relationshipTypes?: RelationType[]
  ): Promise<KnowledgePath[]> {
    const client = await this.pool.connect();
    try {
      // Use recursive CTE for path finding
      let query = `
        WITH RECURSIVE entity_paths AS (
          -- Base case: direct connections
          SELECT
            source_entity_id as current_id,
            target_entity_id as next_id,
            r.id as relationship_id,
            r.type as relationship_type,
            r.strength,
            1 as hop_count,
            ARRAY[source_entity_id] as entity_path,
            ARRAY[r.id] as relationship_path
          FROM ${this.relationshipTable} r
          WHERE source_entity_id = $1

          UNION ALL

          -- Recursive case: follow relationships
          SELECT
            ep.current_id,
            r.target_entity_id as next_id,
            r.id as relationship_id,
            r.type as relationship_type,
            r.strength,
            ep.hop_count + 1,
            ep.entity_path || r.target_entity_id,
            ep.relationship_path || r.id
          FROM entity_paths ep
          JOIN ${this.relationshipTable} r ON (
            r.source_entity_id = ep.next_id OR
            (NOT r.is_directional AND r.target_entity_id = ep.next_id)
          )
          WHERE ep.hop_count < $2
            AND NOT r.target_entity_id = ANY(ep.entity_path)
            AND r.target_entity_id != $1
      `;

      const params: any[] = [sourceEntityId, maxHops];

      if (relationshipTypes?.length) {
        query += ` AND r.type = ANY($3)`;
        params.push(relationshipTypes);
      }

      query += `
        )
        SELECT
          entity_path,
          relationship_path,
          hop_count,
          ARRAY_AGG(strength ORDER BY hop_count) as path_strengths
        FROM entity_paths
        WHERE next_id = $4
        GROUP BY entity_path, relationship_path, hop_count
        ORDER BY hop_count, ARRAY_AGG(strength ORDER BY hop_count) DESC
        LIMIT 10
      `;

      params.push(targetEntityId);

      const result = await client.query(query, params);

      // Convert to KnowledgePath format
      const paths: KnowledgePath[] = result.rows.map((row) => ({
        entities: row.entity_path,
        relationships: row.relationship_path,
        length: row.entity_path.length,
        confidence:
          row.path_strengths.reduce((sum: number, s: number) => sum + s, 0) /
          row.path_strengths.length,
        hopCount: row.hop_count,
      }));

      return paths;
    } finally {
      client.release();
    }
  }

  /**
   * Get entity neighborhood with enhanced relationship data
   */
  async getEntityNeighborhood(
    entityId: string,
    hops: number = 1,
    options: {
      relationshipTypes?: RelationType[];
      minStrength?: number;
      includeDecayFactors?: boolean;
    } = {}
  ): Promise<EntityNeighborhood> {
    const client = await this.pool.connect();
    try {
      // Get direct neighbors first
      let query = `
        SELECT
          e.id, e.name, e.type, e.confidence,
          r.id as relationship_id, r.type as relationship_type,
          r.strength, r.confidence as relationship_confidence,
          CASE
            WHEN r.source_entity_id = $1 THEN r.target_entity_id
            ELSE r.source_entity_id
          END as neighbor_id
        FROM ${this.entityTable} e
        JOIN ${this.relationshipTable} r ON (
          (r.source_entity_id = e.id AND r.target_entity_id = $1) OR
          (r.target_entity_id = e.id AND r.source_entity_id = $1)
        )
        WHERE e.id != $1
      `;

      const params: any[] = [entityId];

      if (options.relationshipTypes?.length) {
        query += ` AND r.type = ANY($2)`;
        params.push(options.relationshipTypes);
      }

      if (options.minStrength !== undefined) {
        query += ` AND r.strength >= $${params.length + 1}`;
        params.push(options.minStrength);
      }

      query += ` ORDER BY r.strength DESC`;

      const result = await client.query(query, params);

      // Process results
      const neighbors = new Map<string, any>();
      const relationships = new Map<string, any>();

      for (const row of result.rows) {
        const neighborId = row.neighbor_id;

        if (!neighbors.has(neighborId)) {
          neighbors.set(neighborId, {
            id: neighborId,
            name: row.name,
            type: row.type,
            confidence: row.confidence,
            relationshipType: row.relationship_type,
            relationshipStrength: row.strength,
            relationshipConfidence: row.relationship_confidence,
          });
        }

        relationships.set(row.relationship_id, {
          id: row.relationship_id,
          type: row.relationship_type,
          strength: row.strength,
          confidence: row.relationship_confidence,
        });
      }

      return {
        entityId,
        entity: {
          id: entityId,
          name: '',
          type: EntityType.CONCEPT,
          description: '',
          properties: {},
          tags: [],
          confidence: 0,
          source: KnowledgeSource.SYSTEM,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastAccessed: Date.now(),
          accessCount: 0,
        }, // Placeholder entity object
        neighbors: Array.from(neighbors.values()),
        relationships: Array.from(relationships.values()),
        depth: hops,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get knowledge graph statistics with enhanced metrics
   */
  async getStats(): Promise<
    KnowledgeGraphStats & {
      vectorEnabled: boolean;
      totalEmbeddings: number;
      avgEmbeddingDimension: number;
      memoryTypeDistribution: Record<string, number>;
      decayStats: {
        avgImportance: number;
        avgAccessCount: number;
        recentlyAccessed: number;
      };
    }
  > {
    const client = await this.pool.connect();
    try {
      // Basic stats
      const basicResult = await client.query(`
        SELECT
          COUNT(*) as entity_count,
          COUNT(DISTINCT type) as entity_types,
          COUNT(*) as relationship_count,
          COUNT(DISTINCT r.type) as relationship_types,
          AVG(confidence) as avg_confidence,
          MAX(updated_at) as last_updated
        FROM ${this.entityTable} e
        LEFT JOIN ${this.relationshipTable} r ON (
          r.source_entity_id = e.id OR r.target_entity_id = e.id
        )
      `);

      const row = basicResult.rows[0];

      // Vector stats
      const vectorResult = await client.query(`
        SELECT
          COUNT(*) as embedding_count,
          AVG(array_length(embedding::float[], 1)) as avg_dimension
        FROM ${this.entityTable}
        WHERE embedding IS NOT NULL
      `);

      const vectorRow = vectorResult.rows[0];

      // Memory type distribution
      const typeResult = await client.query(`
        SELECT
          metadata->>'memoryTypes' as memory_types,
          COUNT(*) as count
        FROM ${this.entityTable}
        GROUP BY metadata->>'memoryTypes'
      `);

      const memoryTypeDistribution: Record<string, number> = {};
      for (const typeRow of typeResult.rows) {
        const types = typeRow.memory_types || [];
        for (const type of types) {
          memoryTypeDistribution[type] =
            (memoryTypeDistribution[type] || 0) + parseInt(typeRow.count);
        }
      }

      // Decay stats
      const decayResult = await client.query(`
        SELECT
          AVG((decay_profile->>'importance')::numeric) as avg_importance,
          AVG((decay_profile->>'accessCount')::int) as avg_access_count,
          COUNT(*) FILTER (WHERE (decay_profile->>'lastAccessed')::numeric > EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours') * 1000) as recently_accessed
        FROM ${this.entityTable}
      `);

      const decayRow = decayResult.rows[0];

      return {
        entityCount: parseInt(row.entity_count),
        relationshipCount: parseInt(row.relationship_count),
        entitiesByType: {} as Record<EntityType, number>,
        relationshipsByType: {} as Record<RelationType, number>,
        averageConfidence: 0, // Would need more complex query
        densityScore: 0, // Would need more complex query
        lastUpdated: row.last_updated,

        // Enhanced stats
        vectorEnabled: true,
        totalEmbeddings: parseInt(vectorRow.embedding_count),
        avgEmbeddingDimension:
          parseFloat(vectorRow.avg_dimension) || this.config.vectorDimension,
        // memoryTypeDistribution is handled above as entitiesByType
        decayStats: {
          avgImportance: parseFloat(decayRow.avg_importance) || 0,
          avgAccessCount: parseFloat(decayRow.avg_access_count) || 0,
          recentlyAccessed: parseInt(decayRow.recently_accessed) || 0,
        },
      } as any;
    } finally {
      client.release();
    }
  }

  /**
   * Record memory access for decay calculation
   */
  async recordEntityAccess(
    entityId: string,
    metadata: {
      importance?: number;
      accessType?: 'read' | 'search' | 'traversal' | 'consolidation';
      swrStrength?: number;
    } = {}
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const now = Date.now();

      await client.query(
        `
        UPDATE ${this.entityTable}
        SET
          decay_profile = jsonb_set(
            jsonb_set(
              jsonb_set(decay_profile, '{lastAccessed}', $2::jsonb),
              '{accessCount}', ((decay_profile->>'accessCount')::int + 1)::text::jsonb
            ),
            '{importance}', COALESCE($3::text::jsonb, decay_profile->'importance')
          ),
          last_accessed = NOW()
        WHERE id = $1
      `,
        [entityId, now.toString(), metadata.importance?.toString()]
      );

      // Add SWR consolidation if provided
      if (metadata.swrStrength) {
        await client.query(
          `
          UPDATE ${this.entityTable}
          SET decay_profile = jsonb_set(
            decay_profile,
            '{consolidationHistory}',
            (decay_profile->'consolidationHistory' || $2::jsonb)
          )
          WHERE id = $1
        `,
          [
            entityId,
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

      // Update cache
      const cachedEntity = this.entityCache.get(entityId);
      if (cachedEntity) {
        cachedEntity.decayProfile.lastAccessed = now;
        cachedEntity.decayProfile.accessCount++;
        if (metadata.importance) {
          cachedEntity.decayProfile.importance = metadata.importance;
        }
      }
    } finally {
      client.release();
    }
  }

  /**
   * Batch process entity extraction results
   */
  async processExtractionResults(
    extractionResults: EntityExtractionResult[]
  ): Promise<{
    entitiesCreated: number;
    entitiesUpdated: number;
    relationshipsCreated: number;
    relationshipsUpdated: number;
    duplicatesResolved: number;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      let entitiesCreated = 0;
      let entitiesUpdated = 0;
      let relationshipsCreated = 0;
      let relationshipsUpdated = 0;
      let duplicatesResolved = 0;

      // Process entities
      for (const result of extractionResults) {
        // Convert extracted entities to enhanced entities
        const enhancedEntities = result.entities.map(
          convertExtractedEntityToEnhancedEntity
        );
        const enhancedRelationships = result.relationships.map(
          convertExtractedRelationshipToEnhancedRelationship
        );

        for (const entity of enhancedEntities) {
          // Check for duplicates
          const existingEntity = await this.findDuplicateEntity(entity, client);

          if (existingEntity) {
            // Merge with existing entity
            await this.mergeEntities(entity, existingEntity, client);
            entitiesUpdated++;
            duplicatesResolved++;
          } else {
            // Create new entity
            await this.upsertEntity(entity);
            entitiesCreated++;
          }
        }

        // Process relationships
        for (const relationship of enhancedRelationships) {
          const existingRelationship = await this.findExistingRelationship(
            relationship.sourceId,
            relationship.targetId,
            relationship.type,
            client
          );

          if (existingRelationship) {
            await this.updateRelationship(
              existingRelationship.id,
              relationship,
              client
            );
            relationshipsUpdated++;
          } else {
            await this.createRelationship({
              sourceEntityId: relationship.sourceId,
              targetEntityId: relationship.targetId,
              type: relationship.type,
              confidence: relationship.confidence,
              strength: relationship.strength,
              evidence: relationship.evidence,
              isDirectional: !relationship.bidirectional,
            });
            relationshipsCreated++;
          }
        }
      }

      await client.query('COMMIT');

      return {
        entitiesCreated,
        entitiesUpdated,
        relationshipsCreated,
        relationshipsUpdated,
        duplicatesResolved,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Decay-Aware Operations
  // ============================================================================

  /**
   * Calculate decay factor for an entity
   * Implements logarithmic decay: use it or lose it
   */
  calculateEntityDecay(entity: EnhancedEntity): number {
    const now = Date.now();
    const lastAccessed = entity.lastAccessed || entity.createdAt;
    const timeSinceAccess = now - lastAccessed;
    const daysSinceAccess = timeSinceAccess / (1000 * 60 * 60 * 24);

    // Base decay rate varies by entity type
    const baseDecayRate = this.getBaseDecayRate(entity.type);

    // Usage boost from access frequency (logarithmic)
    const usageBoost = Math.log10((entity.accessCount || 1) + 1) * 0.1;

    // Importance protection
    const importanceProtection = (entity.decayProfile?.importance || 0.5) * 0.3;

    // Calculate decay (0-1 scale)
    const decay = Math.min(
      0.95,
      daysSinceAccess * baseDecayRate - usageBoost - importanceProtection
    );

    return Math.max(0, decay);
  }

  /**
   * Calculate decay factor for a relationship
   */
  calculateRelationshipDecay(relationship: EnhancedRelationship): number {
    const now = Date.now();
    const lastAccessed = relationship.lastAccessed || relationship.createdAt;
    const timeSinceAccess = now - lastAccessed;
    const daysSinceAccess = timeSinceAccess / (1000 * 60 * 60 * 24);

    // Base decay rate for relationships (slower than entities)
    const baseDecayRate = 0.01;

    // Strength-based protection
    const strengthProtection = relationship.strength * 0.2;

    // Access count boost
    const usageBoost = Math.log10((relationship.accessCount || 1) + 1) * 0.05;

    const decay = Math.min(
      0.8,
      daysSinceAccess * baseDecayRate - strengthProtection - usageBoost
    );

    return Math.max(0, decay);
  }

  /**
   * Update entity access and recalculate decay
   */
  async updateEntityAccess(entityId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `
        UPDATE ${this.entityTable}
        SET
          last_accessed = NOW(),
          access_count = access_count + 1,
          updated_at = NOW()
        WHERE id = $1
      `,
        [entityId]
      );

      await client.query('COMMIT');

      // Update cache
      const cached = this.entityCache.get(entityId);
      if (cached) {
        cached.lastAccessed = Date.now();
        cached.accessCount = (cached.accessCount || 0) + 1;
        cached.updatedAt = Date.now();
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update relationship access and recalculate decay
   */
  async updateRelationshipAccess(relationshipId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `
        UPDATE ${this.relationshipTable}
        SET
          last_accessed = NOW(),
          access_count = access_count + 1,
          updated_at = NOW()
        WHERE id = $1
      `,
        [relationshipId]
      );

      await client.query('COMMIT');

      // Update cache
      const cached = this.relationshipCache.get(relationshipId);
      if (cached) {
        cached.lastAccessed = Date.now();
        cached.accessCount = (cached.accessCount || 0) + 1;
        cached.updatedAt = Date.now();
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get decay-aware entity search results
   */
  async searchEntitiesWithDecayAwareness(
    options: EntitySearchOptions & {
      applyDecayRanking?: boolean;
      decayThreshold?: number;
    }
  ): Promise<{
    entities: EnhancedEntity[];
    totalCount: number;
    searchTime: number;
    decayStats: {
      averageDecay: number;
      decayedEntityCount: number;
      protectedEntityCount: number;
    };
  }> {
    const startTime = performance.now();

    const client = await this.pool.connect();
    try {
      // Base search query
      const searchResult = await this.searchEntities(options);

      if (!options.applyDecayRanking) {
        return {
          ...searchResult,
          decayStats: {
            averageDecay: 0,
            decayedEntityCount: 0,
            protectedEntityCount: 0,
          },
        };
      }

      // Apply decay-aware ranking
      const entitiesWithDecay = searchResult.entities
        .map((entity) => ({
          ...entity,
          decayFactor: this.calculateEntityDecay(entity),
          adjustedScore:
            entity.confidence * (1 - this.calculateEntityDecay(entity)),
        }))
        .sort((a, b) => b.adjustedScore - a.adjustedScore);

      // Filter by decay threshold if specified
      const filteredEntities = options.decayThreshold
        ? entitiesWithDecay.filter(
            (e) => e.decayFactor <= options.decayThreshold!
          )
        : entitiesWithDecay;

      const averageDecay =
        filteredEntities.reduce((sum, e) => sum + e.decayFactor, 0) /
        filteredEntities.length;

      const decayedEntityCount = filteredEntities.filter(
        (e) => e.decayFactor > 0.3
      ).length;
      const protectedEntityCount = filteredEntities.filter(
        (e) => e.decayFactor < 0.1
      ).length;

      return {
        entities: filteredEntities,
        totalCount: filteredEntities.length,
        searchTime: performance.now() - startTime,
        decayStats: {
          averageDecay,
          decayedEntityCount,
          protectedEntityCount,
        },
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get base decay rate for entity type
   */
  private getBaseDecayRate(entityType: EntityType): number {
    const decayRates = {
      [EntityType.OBJECT]: 0.02, // Objects decay slowly
      [EntityType.PLACE]: 0.015, // Places decay very slowly
      [EntityType.CREATURE]: 0.025, // Creatures decay moderately
      [EntityType.PLAYER]: 0.03, // Players change frequently
      [EntityType.CONCEPT]: 0.02, // Concepts decay slowly
      [EntityType.EVENT]: 0.025, // Events decay moderately
      [EntityType.RESOURCE]: 0.035, // Resources change frequently
      [EntityType.BLOCK]: 0.025, // Blocks decay moderately
      [EntityType.ITEM]: 0.03, // Items change frequently
      [EntityType.BIOME]: 0.015, // Biomes decay very slowly
      [EntityType.STRUCTURE]: 0.02, // Structures decay slowly
      [EntityType.RECIPE]: 0.025, // Recipes decay moderately
      [EntityType.RULE]: 0.02, // Rules decay slowly
      [EntityType.SYSTEM]: 0.015, // Systems decay very slowly
      [EntityType.UNKNOWN]: 0.03, // Unknown entities decay faster
    };

    return decayRates[entityType] || 0.02;
  }

  /**
   * Apply decay consolidation to entities and relationships
   * Called during SWR (Sharp Wave Ripple) consolidation events
   */
  async consolidateDecayPatterns(): Promise<{
    entitiesConsolidated: number;
    relationshipsConsolidated: number;
    decayProtectionApplied: number;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update entity decay profiles with recent consolidation
      const entityResult = await client.query(`
        UPDATE ${this.entityTable}
        SET
          decay_profile = jsonb_set(
            COALESCE(decay_profile, '{}'),
            '{consolidationHistory}',
            COALESCE(decay_profile->'consolidationHistory', '[]') || jsonb_build_array(
              jsonb_build_object(
                'timestamp', ${Date.now()},
                'type', 'decay_consolidation',
                'strength', GREATEST(0.1, LEAST(1.0, (access_count::numeric / 10.0)))
              )
            )
          ),
          updated_at = NOW()
        WHERE access_count > 0
      `);

      // Update relationship decay profiles
      const relationshipResult = await client.query(`
        UPDATE ${this.relationshipTable}
        SET
          decay_profile = jsonb_set(
            COALESCE(decay_profile, '{}'),
            '{consolidationHistory}',
            COALESCE(decay_profile->'consolidationHistory', '[]') || jsonb_build_array(
              jsonb_build_object(
                'timestamp', ${Date.now()},
                'type', 'decay_consolidation',
                'relationshipStrength', strength
              )
            )
          ),
          updated_at = NOW()
        WHERE access_count > 0
      `);

      // Apply decay protection to frequently accessed entities
      const protectionResult = await client.query(`
        UPDATE ${this.entityTable}
        SET
          decay_profile = jsonb_set(
            COALESCE(decay_profile, '{}'),
            '{importance}',
            GREATEST(
              COALESCE((decay_profile->>'importance')::numeric, 0.5),
              LEAST(1.0, (access_count::numeric / 20.0))
            )
          ),
          updated_at = NOW()
        WHERE access_count >= 5
      `);

      await client.query('COMMIT');

      return {
        entitiesConsolidated: parseInt(
          entityResult.rowCount?.toString() || '0'
        ),
        relationshipsConsolidated: parseInt(
          relationshipResult.rowCount?.toString() || '0'
        ),
        decayProtectionApplied: parseInt(
          protectionResult.rowCount?.toString() || '0'
        ),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private initializeIndexes(): void {
    Object.values(EntityType).forEach((type) => {
      this.entityTypeIndex.set(type, new Set<string>());
    });

    Object.values(RelationType).forEach((type) => {
      this.relationshipTypeIndex.set(type, new Set<string>());
    });
  }

  private rowToEntity(row: any): EnhancedEntity {
    return {
      id: row.id,
      name: row.name,
      type: row.type as EntityType,
      description: row.description || '',
      properties: row.properties || {},
      tags: row.tags || [],
      aliases: row.aliases || [],
      confidence: parseFloat(row.confidence),
      source: (row.source as KnowledgeSource) || KnowledgeSource.SYSTEM,
      embedding: row.embedding,
      metadata: row.metadata || {},
      decayProfile: row.decay_profile || {},
      provenance: row.provenance || {},
      createdAt: row.created_at?.getTime() || Date.now(),
      updatedAt: row.updated_at?.getTime() || Date.now(),
      lastAccessed: row.last_accessed?.getTime() || Date.now(),
      accessCount: row.access_count || 0,
    };
  }

  private async findDuplicateEntity(
    entity: EnhancedEntity,
    client: PoolClient
  ): Promise<EnhancedEntity | null> {
    // Find entities with similar names and types
    const result = await client.query(
      `
      SELECT * FROM ${this.entityTable}
      WHERE type = $1 AND (
        name ILIKE $2 OR
        $2 ILIKE name OR
        aliases && ARRAY[$2]
      )
      ORDER BY confidence DESC
      LIMIT 1
    `,
      [entity.type, entity.name]
    );

    return result.rows.length > 0 ? this.rowToEntity(result.rows[0]) : null;
  }

  private async mergeEntities(
    newEntity: EnhancedEntity,
    existingEntity: EnhancedEntity,
    client: PoolClient
  ): Promise<void> {
    // Merge metadata and keep higher confidence entity
    const mergedMetadata = {
      ...existingEntity.metadata,
      ...newEntity.metadata,
      frequency:
        (existingEntity.metadata.frequency || 0) +
        (newEntity.metadata.frequency || 1),
    };

    const mergedConfidence = Math.max(
      existingEntity.confidence,
      newEntity.confidence
    );

    await client.query(
      `
      UPDATE ${this.entityTable}
      SET
        confidence = $1,
        metadata = $2::jsonb,
        aliases = ARRAY(SELECT DISTINCT unnest(aliases || $3)),
        updated_at = NOW()
      WHERE id = $4
    `,
      [
        mergedConfidence,
        JSON.stringify(mergedMetadata),
        newEntity.aliases || [],
        existingEntity.id,
      ]
    );
  }

  private async findExistingRelationship(
    sourceId: string,
    targetId: string,
    type: RelationType,
    client: PoolClient
  ): Promise<EnhancedRelationship | null> {
    const result = await client.query(
      `
      SELECT * FROM ${this.relationshipTable}
      WHERE ((source_entity_id = $1 AND target_entity_id = $2) OR
             (source_entity_id = $2 AND target_entity_id = $1))
        AND type = $3
      LIMIT 1
    `,
      [sourceId, targetId, type]
    );

    return result.rows.length > 0
      ? this.rowToRelationship(result.rows[0])
      : null;
  }

  private async updateRelationship(
    relationshipId: string,
    relationship: EnhancedRelationship,
    client: PoolClient
  ): Promise<void> {
    await client.query(
      `
      UPDATE ${this.relationshipTable}
      SET
        confidence = GREATEST(confidence, $1),
        strength = GREATEST(strength, $2),
        evidence = $3::jsonb,
        decay_profile = $4::jsonb,
        updated_at = NOW()
      WHERE id = $5
    `,
      [
        relationship.confidence,
        relationship.strength,
        JSON.stringify(relationship.evidence),
        JSON.stringify(relationship.decayProfile),
        relationshipId,
      ]
    );
  }

  private rowToRelationship(row: any): EnhancedRelationship {
    return {
      id: row.id,
      sourceId: row.source_entity_id,
      targetId: row.target_entity_id,
      type: row.type as RelationType,
      properties: row.properties || {},
      bidirectional: row.is_directional || false,
      confidence: parseFloat(row.confidence),
      source: (row.source as KnowledgeSource) || KnowledgeSource.SYSTEM,
      strength: parseFloat(row.strength),
      evidence: row.evidence || {},
      decayProfile: row.decay_profile || {},
      createdAt: row.created_at?.getTime() || Date.now(),
      updatedAt: row.updated_at?.getTime() || Date.now(),
      lastAccessed: row.last_accessed?.getTime() || Date.now(),
      accessCount: row.access_count || 0,
    };
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
