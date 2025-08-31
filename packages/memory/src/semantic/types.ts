/**
 * Types for semantic memory system
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Knowledge Graph Types
// ============================================================================

/**
 * Entity in knowledge graph
 */
export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  description?: string;
  properties: Record<string, PropertyValue>;
  tags: string[];
  confidence: number; // 0-1
  source: KnowledgeSource;
  createdAt: number;
  updatedAt: number;
  lastAccessed: number;
  accessCount: number;
}

/**
 * Relationship between entities
 */
export interface Relationship {
  id: string;
  type: RelationType;
  sourceId: string;
  targetId: string;
  properties: Record<string, PropertyValue>;
  bidirectional: boolean;
  confidence: number; // 0-1
  source: KnowledgeSource;
  createdAt: number;
  updatedAt: number;
  lastAccessed: number;
  accessCount: number;
}

/**
 * Property value with metadata
 */
export interface PropertyValue {
  confidence: number; // 0-1
  timestamp: number;
  type: PropertyType;
  source: KnowledgeSource;
  value?: any;
  unit?: string;
}

/**
 * Entity types
 */
export enum EntityType {
  OBJECT = 'object',
  PLACE = 'place',
  CREATURE = 'creature',
  PLAYER = 'player',
  CONCEPT = 'concept',
  EVENT = 'event',
  RESOURCE = 'resource',
  BLOCK = 'block',
  ITEM = 'item',
  BIOME = 'biome',
  STRUCTURE = 'structure',
  RECIPE = 'recipe',
  RULE = 'rule',
  SYSTEM = 'system',
  UNKNOWN = 'unknown',
}

/**
 * Relationship types
 */
export enum RelationType {
  // Taxonomic relationships
  IS_A = 'is_a',
  INSTANCE_OF = 'instance_of',
  SUBCLASS_OF = 'subclass_of',

  // Compositional relationships
  PART_OF = 'part_of',
  HAS_PART = 'has_part',
  CONTAINS = 'contains',
  CONTAINED_IN = 'contained_in',

  // Spatial relationships
  LOCATED_AT = 'located_at',
  NEAR = 'near',
  ADJACENT_TO = 'adjacent_to',
  ABOVE = 'above',
  BELOW = 'below',

  // Functional relationships
  USED_FOR = 'used_for',
  ENABLES = 'enables',
  REQUIRES = 'requires',
  PRODUCES = 'produces',
  CONSUMED_BY = 'consumed_by',

  // Causal relationships
  CAUSES = 'causes',
  PREVENTS = 'prevents',
  LEADS_TO = 'leads_to',
  TRIGGERED_BY = 'triggered_by',

  // Social relationships
  INTERACTS_WITH = 'interacts_with',
  HOSTILE_TO = 'hostile_to',
  FRIENDLY_TO = 'friendly_to',
  OWNED_BY = 'owned_by',

  // Temporal relationships
  BEFORE = 'before',
  AFTER = 'after',
  DURING = 'during',

  // Other
  RELATED_TO = 'related_to',
  CUSTOM = 'custom',
}

/**
 * Property types
 */
export enum PropertyType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  VECTOR = 'vector',
  COLOR = 'color',
  ENUM = 'enum',
  OBJECT = 'object',
  ARRAY = 'array',
  NULL = 'null',
}

/**
 * Knowledge source
 */
export enum KnowledgeSource {
  OBSERVATION = 'observation',
  INFERENCE = 'inference',
  PLAYER = 'player',
  SYSTEM = 'system',
  DOCUMENTATION = 'documentation',
  EXTERNAL = 'external',
}

/**
 * Query types for knowledge graph
 */
export enum QueryType {
  ENTITY = 'entity',
  RELATIONSHIP = 'relationship',
  PATH = 'path',
  NEIGHBORHOOD = 'neighborhood',
  PATTERN = 'pattern',
  INFERENCE = 'inference',
}

/**
 * Knowledge graph query
 */
export interface KnowledgeQuery {
  type: QueryType;
  parameters: Record<string, any>;
  filters?: QueryFilter[];
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

/**
 * Query filter
 */
export interface QueryFilter {
  field: string;
  operator: FilterOperator;
  value: any;
}

/**
 * Filter operators
 */
export enum FilterOperator {
  EQUALS = 'eq',
  NOT_EQUALS = 'neq',
  GREATER_THAN = 'gt',
  GREATER_THAN_OR_EQUALS = 'gte',
  LESS_THAN = 'lt',
  LESS_THAN_OR_EQUALS = 'lte',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  IN = 'in',
  NOT_IN = 'not_in',
}

/**
 * Knowledge graph query result
 */
export interface QueryResult {
  entities: Entity[];
  relationships: Relationship[];
  metadata: {
    count: number;
    queryTime: number;
    confidence: number;
  };
}

/**
 * Path in knowledge graph
 */
export interface KnowledgePath {
  entities: Entity[];
  relationships: Relationship[];
  length: number;
  confidence: number;
}

/**
 * Neighborhood in knowledge graph
 */
export interface EntityNeighborhood {
  entity: Entity;
  neighbors: Array<{
    entity: Entity;
    relationship: Relationship;
    direction: 'outgoing' | 'incoming';
  }>;
  depth: number;
}

/**
 * Knowledge pattern
 */
export interface KnowledgePattern {
  id: string;
  name: string;
  description: string;
  entities: Array<{
    id: string;
    type: EntityType;
    properties?: Record<string, any>;
    variables?: string[];
  }>;
  relationships: Array<{
    type: RelationType;
    sourceId: string;
    targetId: string;
    properties?: Record<string, any>;
    variables?: string[];
  }>;
  confidence: number;
  frequency: number;
  source: KnowledgeSource;
  createdAt: number;
  updatedAt: number;
}

/**
 * Knowledge graph statistics
 */
export interface KnowledgeGraphStats {
  entityCount: number;
  relationshipCount: number;
  entitiesByType: Record<EntityType, number>;
  relationshipsByType: Record<RelationType, number>;
  averageConfidence: number;
  densityScore: number;
  lastUpdated: number;
}

/**
 * Knowledge graph configuration
 */
export interface KnowledgeGraphConfig {
  minConfidence: number;
  maxEntities: number;
  enableInference: boolean;
  persistToStorage: boolean;
  storageDirectory?: string;
  autoSaveInterval?: number;
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const PropertyValueSchema = z.object({
  confidence: z.number().min(0).max(1),
  timestamp: z.number(),
  type: z.nativeEnum(PropertyType),
  source: z.nativeEnum(KnowledgeSource),
  value: z.any().optional(),
  unit: z.string().optional(),
});

export const EntitySchema = z.object({
  id: z.string(),
  type: z.nativeEnum(EntityType),
  name: z.string(),
  description: z.string().optional(),
  properties: z.record(z.string(), PropertyValueSchema),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  source: z.nativeEnum(KnowledgeSource),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastAccessed: z.number(),
  accessCount: z.number(),
});

export const RelationshipSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(RelationType),
  sourceId: z.string(),
  targetId: z.string(),
  properties: z.record(z.string(), PropertyValueSchema),
  bidirectional: z.boolean(),
  confidence: z.number().min(0).max(1),
  source: z.nativeEnum(KnowledgeSource),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastAccessed: z.number(),
  accessCount: z.number(),
});

export const QueryFilterSchema = z.object({
  field: z.string(),
  operator: z.nativeEnum(FilterOperator),
  value: z.any(),
});

export const KnowledgeQuerySchema = z.object({
  type: z.nativeEnum(QueryType),
  parameters: z.record(z.string(), z.any()),
  filters: z.array(QueryFilterSchema).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  orderBy: z.string().optional(),
  orderDirection: z.enum(['asc', 'desc']).optional(),
});

export const KnowledgeGraphConfigSchema = z.object({
  minConfidence: z.number().min(0).max(1),
  maxEntities: z.number().positive(),
  enableInference: z.boolean(),
  persistToStorage: z.boolean(),
  storageDirectory: z.string().optional(),
  autoSaveInterval: z.number().optional(),
});
