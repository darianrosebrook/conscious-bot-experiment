/**
 * Knowledge graph core implementation.
 *
 * Manages entities, relationships, and factual knowledge with efficient
 * graph operations and semantic reasoning capabilities.
 *
 * @author @darianrosebrook
 */

import {
  Entity,
  Relationship,
  EntityType,
  RelationType,
  PropertyType,
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
} from './types';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Default configuration for knowledge graph
 */
const DEFAULT_CONFIG: KnowledgeGraphConfig = {
  minConfidence: 0.3,
  maxEntities: 10000,
  enableInference: true,
  persistToStorage: false,
  enableSemanticDecay: true,
  semanticDecayRate: 0.02, // 2% decay per day
  minimumSemanticConfidence: 0.05, // Never fully forget
};

/**
 * Knowledge graph core implementation
 */
export class KnowledgeGraphCore {
  private entities: Map<string, Entity> = new Map();
  private relationships: Map<string, Relationship> = new Map();
  private entityRelationships: Map<string, Set<string>> = new Map(); // entityId -> relationshipIds
  private entitiesByType: Map<EntityType, Set<string>> = new Map(); // type -> entityIds
  private relationshipsByType: Map<RelationType, Set<string>> = new Map(); // type -> relationshipIds
  private config: KnowledgeGraphConfig;
  private autoSaveHandle?: NodeJS.Timeout;

  constructor(config: Partial<KnowledgeGraphConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeIndexes();

    // Attempt to load from disk if persistence enabled
    if (this.config.persistToStorage && this.config.storageDirectory) {
      this.loadFromDisk().catch((err) =>
        console.warn('KnowledgeGraphCore loadFromDisk failed:', err?.message)
      );
      // Start autosave if configured
      if (this.config.autoSaveInterval && this.config.autoSaveInterval > 0) {
        this.startAutoSave(this.config.autoSaveInterval);
      }
    }
  }

  /**
   * Initialize index structures
   */
  private initializeIndexes(): void {
    // Initialize entitiesByType map
    Object.values(EntityType).forEach((type) => {
      this.entitiesByType.set(type as EntityType, new Set<string>());
    });

    // Initialize relationshipsByType map
    Object.values(RelationType).forEach((type) => {
      this.relationshipsByType.set(type as RelationType, new Set<string>());
    });
  }

  // ============================================================================
  // Persistence (Phase 1 - JSON files)
  // ============================================================================

  private getStoragePaths() {
    const dir =
      this.config.storageDirectory ||
      path.resolve(process.cwd(), 'memory-storage');
    const file = path.join(dir, 'knowledge-graph.json');
    return { dir, file };
  }

  private toSerializable() {
    return {
      version: 1,
      savedAt: Date.now(),
      entities: Array.from(this.entities.values()),
      relationships: Array.from(this.relationships.values()),
    };
  }

  private fromSerializable(data: any) {
    if (
      !data ||
      !Array.isArray(data.entities) ||
      !Array.isArray(data.relationships)
    ) {
      throw new Error('Invalid knowledge graph file format');
    }

    // Reset maps
    this.entities.clear();
    this.relationships.clear();
    this.entityRelationships.clear();
    this.entitiesByType.forEach((set) => set.clear());
    this.relationshipsByType.forEach((set) => set.clear());

    // Load entities
    for (const e of data.entities) {
      const validation = EntitySchema.safeParse(e);
      if (!validation.success) continue;
      const entity = validation.data;
      this.entities.set(entity.id, entity);
      this.entitiesByType.get(entity.type)?.add(entity.id);
    }

    // Load relationships
    for (const r of data.relationships) {
      const validation = RelationshipSchema.safeParse(r);
      if (!validation.success) continue;
      const rel = validation.data;
      this.relationships.set(rel.id, rel);
      this.relationshipsByType.get(rel.type)?.add(rel.id);
      // Track adjacency
      if (!this.entityRelationships.has(rel.sourceId))
        this.entityRelationships.set(rel.sourceId, new Set());
      if (!this.entityRelationships.has(rel.targetId))
        this.entityRelationships.set(rel.targetId, new Set());
      this.entityRelationships.get(rel.sourceId)!.add(rel.id);
      this.entityRelationships.get(rel.targetId)!.add(rel.id);
    }
  }

  async saveToDisk(): Promise<void> {
    if (!this.config.persistToStorage) return;
    const { dir, file } = this.getStoragePaths();
    await fs.mkdir(dir, { recursive: true });
    const data = this.toSerializable();
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
  }

  async loadFromDisk(): Promise<void> {
    if (!this.config.persistToStorage) return;
    const { file } = this.getStoragePaths();
    try {
      const txt = await fs.readFile(file, 'utf-8');
      const json = JSON.parse(txt);
      this.fromSerializable(json);
    } catch (err: any) {
      if (err?.code === 'ENOENT') return; // no file yet
      throw err;
    }
  }

  startAutoSave(intervalMs: number): void {
    if (this.autoSaveHandle) clearInterval(this.autoSaveHandle);
    this.autoSaveHandle = setInterval(
      () => {
        this.saveToDisk().catch((e) =>
          console.warn('KnowledgeGraphCore autoSave failed:', e?.message)
        );
      },
      Math.max(5_000, intervalMs)
    );
  }

  stopAutoSave(): void {
    if (this.autoSaveHandle) clearInterval(this.autoSaveHandle);
    this.autoSaveHandle = undefined;
  }

  /**
   * Create or update entity in knowledge graph
   */
  upsertEntity(
    entity: Omit<
      Entity,
      'id' | 'createdAt' | 'updatedAt' | 'lastAccessed' | 'accessCount'
    >
  ): Entity {
    const now = Date.now();
    const existingEntity = this.findEntityByName(entity.name, entity.type);

    if (existingEntity) {
      // Update existing entity
      const updatedEntity: Entity = {
        ...existingEntity,
        ...entity,
        updatedAt: now,
        lastAccessed: now,
        accessCount: existingEntity.accessCount + 1,
      };

      // Validate entity
      const validation = EntitySchema.safeParse(updatedEntity);
      if (!validation.success) {
        console.warn('Invalid entity:', validation.error);
        throw new Error(`Invalid entity: ${validation.error.message}`);
      }

      // Update indexes if type changed
      if (existingEntity.type !== updatedEntity.type) {
        this.entitiesByType.get(existingEntity.type)?.delete(existingEntity.id);
        this.entitiesByType.get(updatedEntity.type)?.add(updatedEntity.id);
      }

      // Store updated entity
      this.entities.set(existingEntity.id, updatedEntity);
      return updatedEntity;
    } else {
      // Create new entity
      const id = `entity-${now}-${Math.random().toString(36).substring(2, 9)}`;
      const newEntity: Entity = {
        ...entity,
        id,
        createdAt: now,
        updatedAt: now,
        lastAccessed: now,
        accessCount: 1,
      };

      // Validate entity
      const validation = EntitySchema.safeParse(newEntity);
      if (!validation.success) {
        console.warn('Invalid entity:', validation.error);
        throw new Error(`Invalid entity: ${validation.error.message}`);
      }

      // Add to indexes
      this.entities.set(id, newEntity);
      this.entitiesByType.get(newEntity.type)?.add(id);
      this.entityRelationships.set(id, new Set<string>());

      return newEntity;
    }
  }

  /**
   * Create or update relationship in knowledge graph
   */
  upsertRelationship(
    relationship: Omit<
      Relationship,
      'id' | 'createdAt' | 'updatedAt' | 'lastAccessed' | 'accessCount'
    >
  ): Relationship {
    const now = Date.now();

    // Verify source and target entities exist
    if (!this.entities.has(relationship.sourceId)) {
      throw new Error(`Source entity ${relationship.sourceId} does not exist`);
    }
    if (!this.entities.has(relationship.targetId)) {
      throw new Error(`Target entity ${relationship.targetId} does not exist`);
    }

    // Check for existing relationship
    const existingRelationship = this.findRelationship(
      relationship.sourceId,
      relationship.targetId,
      relationship.type
    );

    if (existingRelationship) {
      // Update existing relationship
      const updatedRelationship: Relationship = {
        ...existingRelationship,
        ...relationship,
        updatedAt: now,
        lastAccessed: now,
        accessCount: existingRelationship.accessCount + 1,
      };

      // Validate relationship
      const validation = RelationshipSchema.safeParse(updatedRelationship);
      if (!validation.success) {
        console.warn('Invalid relationship:', validation.error);
        throw new Error(`Invalid relationship: ${validation.error.message}`);
      }

      // Update indexes if type changed
      if (existingRelationship.type !== updatedRelationship.type) {
        this.relationshipsByType
          .get(existingRelationship.type)
          ?.delete(existingRelationship.id);
        this.relationshipsByType
          .get(updatedRelationship.type)
          ?.add(updatedRelationship.id);
      }

      // Store updated relationship
      this.relationships.set(existingRelationship.id, updatedRelationship);
      return updatedRelationship;
    } else {
      // Create new relationship
      const id = `rel-${now}-${Math.random().toString(36).substring(2, 9)}`;
      const newRelationship: Relationship = {
        ...relationship,
        id,
        createdAt: now,
        updatedAt: now,
        lastAccessed: now,
        accessCount: 1,
      };

      // Validate relationship
      const validation = RelationshipSchema.safeParse(newRelationship);
      if (!validation.success) {
        console.warn('Invalid relationship:', validation.error);
        throw new Error(`Invalid relationship: ${validation.error.message}`);
      }

      // Add to indexes
      this.relationships.set(id, newRelationship);
      this.relationshipsByType.get(newRelationship.type)?.add(id);

      // Update entity-relationship index
      this.entityRelationships.get(newRelationship.sourceId)?.add(id);
      if (newRelationship.bidirectional) {
        this.entityRelationships.get(newRelationship.targetId)?.add(id);
      }

      return newRelationship;
    }
  }

  /**
   * Delete entity from knowledge graph
   */
  deleteEntity(entityId: string): boolean {
    const entity = this.entities.get(entityId);
    if (!entity) {
      return false;
    }

    // Remove entity from type index
    this.entitiesByType.get(entity.type)?.delete(entityId);

    // Remove all relationships involving this entity
    const relationshipsToRemove: string[] = [];
    for (const [relationshipId, relationship] of this.relationships.entries()) {
      if (
        relationship.sourceId === entityId ||
        relationship.targetId === entityId
      ) {
        relationshipsToRemove.push(relationshipId);
      }
    }

    for (const relationshipId of relationshipsToRemove) {
      this.deleteRelationship(relationshipId);
    }

    // Remove entity from relationship index
    this.entityRelationships.delete(entityId);

    // Remove entity
    this.entities.delete(entityId);
    return true;
  }

  /**
   * Delete relationship from knowledge graph
   */
  deleteRelationship(relationshipId: string): boolean {
    const relationship = this.relationships.get(relationshipId);
    if (!relationship) {
      return false;
    }

    // Remove relationship from type index
    this.relationshipsByType.get(relationship.type)?.delete(relationshipId);

    // Remove relationship from entity-relationship index
    this.entityRelationships.get(relationship.sourceId)?.delete(relationshipId);
    if (relationship.bidirectional) {
      this.entityRelationships
        .get(relationship.targetId)
        ?.delete(relationshipId);
    }

    // Remove relationship
    this.relationships.delete(relationshipId);
    return true;
  }

  /**
   * Get entity by ID
   */
  getEntity(entityId: string): Entity | null {
    const entity = this.entities.get(entityId);
    if (!entity) {
      return null;
    }

    // Apply semantic decay before returning
    this.applySemanticDecay();

    // Update access stats
    entity.lastAccessed = Date.now();
    entity.accessCount++;

    return entity;
  }

  /**
   * Get relationship by ID
   */
  getRelationship(relationshipId: string): Relationship | null {
    const relationship = this.relationships.get(relationshipId);
    if (!relationship) {
      return null;
    }

    // Apply semantic decay before returning
    this.applySemanticDecay();

    // Update access stats
    relationship.lastAccessed = Date.now();
    relationship.accessCount++;

    return relationship;
  }

  /**
   * Find entity by name and type
   */
  findEntityByName(name: string, type?: EntityType): Entity | null {
    for (const entity of this.entities.values()) {
      if (entity.name === name && (!type || entity.type === type)) {
        // Apply semantic decay before returning
        this.applySemanticDecay();

        // Update access stats
        entity.lastAccessed = Date.now();
        entity.accessCount++;

        return entity;
      }
    }

    return null;
  }

  /**
   * Find relationship between entities
   */
  findRelationship(
    sourceId: string,
    targetId: string,
    type?: RelationType
  ): Relationship | null {
    for (const relationship of this.relationships.values()) {
      const sourceMatch = relationship.sourceId === sourceId;
      const targetMatch = relationship.targetId === targetId;
      const bidirectionalMatch =
        relationship.bidirectional &&
        relationship.sourceId === targetId &&
        relationship.targetId === sourceId;
      const typeMatch = !type || relationship.type === type;

      if (((sourceMatch && targetMatch) || bidirectionalMatch) && typeMatch) {
        // Apply semantic decay before returning
        this.applySemanticDecay();

        // Update access stats
        relationship.lastAccessed = Date.now();
        relationship.accessCount++;

        return relationship;
      }
    }

    return null;
  }

  /**
   * Get entities by type
   */
  getEntitiesByType(type: EntityType): Entity[] {
    const entityIds = this.entitiesByType.get(type);
    if (!entityIds) {
      return [];
    }

    return Array.from(entityIds)
      .map((id) => this.entities.get(id))
      .filter((entity): entity is Entity => !!entity);
  }

  /**
   * Get relationships by type
   */
  getRelationshipsByType(type: RelationType): Relationship[] {
    const relationshipIds = this.relationshipsByType.get(type);
    if (!relationshipIds) {
      return [];
    }

    return Array.from(relationshipIds)
      .map((id) => this.relationships.get(id))
      .filter((relationship): relationship is Relationship => !!relationship);
  }

  /**
   * Get relationships for entity
   */
  getRelationshipsForEntity(
    entityId: string,
    direction?: 'outgoing' | 'incoming' | 'both'
  ): Relationship[] {
    const entity = this.entities.get(entityId);
    if (!entity) {
      return [];
    }

    const relationships: Relationship[] = [];
    const relationshipIds = this.entityRelationships.get(entityId);
    if (!relationshipIds) {
      return [];
    }

    for (const relationshipId of relationshipIds) {
      const relationship = this.relationships.get(relationshipId);
      if (!relationship) continue;

      const isOutgoing = relationship.sourceId === entityId;
      const isIncoming = relationship.targetId === entityId;

      if (direction === 'outgoing' && isOutgoing) {
        relationships.push(relationship);
      } else if (direction === 'incoming' && isIncoming) {
        relationships.push(relationship);
      } else if (!direction || direction === 'both') {
        relationships.push(relationship);
      }
    }

    return relationships;
  }

  /**
   * Get all entities in the knowledge graph
   */
  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Get all relationships in the knowledge graph
   */
  getAllRelationships(): Relationship[] {
    return Array.from(this.relationships.values());
  }

  /**
   * Execute knowledge graph query
   */
  async query(query: KnowledgeQuery): Promise<QueryResult> {
    const startTime = Date.now();
    let entities: Entity[] = [];
    let relationships: Relationship[] = [];
    let confidence = 1.0;

    switch (query.type) {
      case QueryType.ENTITY:
        entities = await this.queryEntities(query);
        break;

      case QueryType.RELATIONSHIP:
        relationships = await this.queryRelationships(query);
        break;

      case QueryType.PATH:
        const paths = await this.queryPaths(query);
        if (paths.length > 0) {
          entities = paths[0].entities;
          relationships = paths[0].relationships;
          confidence = paths[0].confidence;
        }
        break;

      case QueryType.NEIGHBORHOOD:
        const neighborhood = await this.queryNeighborhood(query);
        if (neighborhood) {
          entities = [neighborhood.entity];
          relationships = neighborhood.neighbors.map((n) => n.relationship);
          entities.push(...neighborhood.neighbors.map((n) => n.entity));
        }
        break;

      case QueryType.PATTERN:
        const patternResults = await this.queryPatterns(query);
        if (patternResults.entities.length > 0) {
          entities = patternResults.entities;
          relationships = patternResults.relationships;
        }
        break;

      case QueryType.INFERENCE:
        if (this.config.enableInference) {
          const inferenceResults = await this.performInference(query);
          entities = inferenceResults.entities;
          relationships = inferenceResults.relationships;
          confidence = inferenceResults.metadata.confidence;
        }
        break;
    }

    // Apply filters
    if (query.filters && query.filters.length > 0) {
      entities = this.applyFilters(entities, query.filters);
    }

    // Apply sorting
    if (query.orderBy) {
      entities = this.applySorting(
        entities,
        query.orderBy,
        query.orderDirection
      );
    }

    // Apply pagination
    if (query.limit !== undefined || query.offset !== undefined) {
      entities = this.applyPagination(entities, query.offset, query.limit);
    }

    const queryTime = Date.now() - startTime;

    return {
      entities,
      relationships,
      metadata: {
        count: entities.length,
        queryTime,
        confidence,
      },
    };
  }

  /**
   * Query entities
   */
  private async queryEntities(query: KnowledgeQuery): Promise<Entity[]> {
    const { type, name, properties } = query.parameters;
    let entities: Entity[] = [];

    if (type) {
      entities = this.getEntitiesByType(type as EntityType);
    } else {
      entities = this.getAllEntities();
    }

    if (name) {
      entities = entities.filter((e) =>
        e.name.toLowerCase().includes((name as string).toLowerCase())
      );
    }

    if (properties) {
      entities = entities.filter((e) => {
        for (const [key, value] of Object.entries(
          properties as Record<string, any>
        )) {
          if (!e.properties[key] || e.properties[key].value !== value) {
            return false;
          }
        }
        return true;
      });
    }

    return entities;
  }

  /**
   * Query relationships
   */
  private async queryRelationships(
    query: KnowledgeQuery
  ): Promise<Relationship[]> {
    const { type, sourceId, targetId } = query.parameters;
    let relationships: Relationship[] = [];

    if (type) {
      relationships = this.getRelationshipsByType(type as RelationType);
    } else {
      relationships = this.getAllRelationships();
    }

    if (sourceId) {
      relationships = relationships.filter((r) => r.sourceId === sourceId);
    }

    if (targetId) {
      relationships = relationships.filter((r) => r.targetId === targetId);
    }

    return relationships;
  }

  /**
   * Query paths between entities
   */
  private async queryPaths(query: KnowledgeQuery): Promise<KnowledgePath[]> {
    const { sourceId, targetId, maxDepth = 5 } = query.parameters;

    if (!sourceId || !targetId) {
      return [];
    }

    const sourceEntity = this.entities.get(sourceId as string);
    const targetEntity = this.entities.get(targetId as string);

    if (!sourceEntity || !targetEntity) {
      return [];
    }

    // Use breadth-first search to find paths
    const paths = this.findPaths(
      sourceId as string,
      targetId as string,
      maxDepth as number
    );

    return paths;
  }

  /**
   * Query entity neighborhood
   */
  private async queryNeighborhood(
    query: KnowledgeQuery
  ): Promise<EntityNeighborhood | null> {
    const { entityId, depth = 1 } = query.parameters;

    if (!entityId) {
      return null;
    }

    const entity = this.entities.get(entityId as string);
    if (!entity) {
      return null;
    }

    const neighbors: Array<{
      entity: Entity;
      relationship: Relationship;
      direction: 'outgoing' | 'incoming';
    }> = [];

    // Get relationships for entity
    const relationships = this.getRelationshipsForEntity(entityId as string);

    for (const relationship of relationships) {
      const isOutgoing = relationship.sourceId === entityId;
      const neighborId = isOutgoing
        ? relationship.targetId
        : relationship.sourceId;
      const neighborEntity = this.entities.get(neighborId);

      if (neighborEntity) {
        neighbors.push({
          entity: neighborEntity,
          relationship,
          direction: isOutgoing ? 'outgoing' : 'incoming',
        });
      }
    }

    return {
      entity,
      entityId: entity.id,
      neighbors,
      relationships: neighbors.map((n) => n.relationship),
      depth: depth as number,
    };
  }

  /**
   * Query knowledge patterns
   */
  private async queryPatterns(query: KnowledgeQuery): Promise<QueryResult> {
    // This is a simplified implementation
    // In a real system, this would match against known patterns
    return {
      entities: [],
      relationships: [],
      metadata: {
        count: 0,
        queryTime: 0,
        confidence: 0,
      },
    };
  }

  /**
   * Perform inference on knowledge graph
   */
  private async performInference(query: KnowledgeQuery): Promise<QueryResult> {
    // This is a simplified implementation
    // In a real system, this would use inference rules to derive new knowledge
    return {
      entities: [],
      relationships: [],
      metadata: {
        count: 0,
        queryTime: 0,
        confidence: 0.5,
      },
    };
  }

  /**
   * Find paths between entities using breadth-first search
   */
  private findPaths(
    sourceId: string,
    targetId: string,
    maxDepth: number
  ): KnowledgePath[] {
    const visited = new Set<string>();
    const queue: Array<{
      path: string[];
      relationships: string[];
    }> = [];
    const paths: KnowledgePath[] = [];

    // Start with source entity
    queue.push({
      path: [sourceId],
      relationships: [],
    });
    visited.add(sourceId);

    while (queue.length > 0) {
      const { path, relationships } = queue.shift()!;
      const currentEntityId = path[path.length - 1];

      // Check if we reached the target
      if (currentEntityId === targetId) {
        const pathEntities = path.map((id) => this.entities.get(id)!);
        const pathRelationships = relationships.map(
          (id) => this.relationships.get(id)!
        );

        // Calculate path confidence as product of entity and relationship confidences
        let confidence = 1.0;
        for (const entity of pathEntities) {
          confidence *= entity.confidence;
        }
        for (const relationship of pathRelationships) {
          confidence *= relationship.confidence;
        }

        paths.push({
          entities: pathEntities,
          relationships: pathRelationships,
          length: path.length - 1,
          hopCount: pathRelationships.length,
          confidence,
        });
        continue;
      }

      // Stop if we've reached max depth
      if (path.length > maxDepth) {
        continue;
      }

      // Explore neighbors
      const entityRelationships =
        this.getRelationshipsForEntity(currentEntityId);

      for (const relationship of entityRelationships) {
        const nextEntityId =
          relationship.sourceId === currentEntityId
            ? relationship.targetId
            : relationship.sourceId;

        // Skip if already visited
        if (visited.has(nextEntityId)) {
          continue;
        }

        // Add to queue
        queue.push({
          path: [...path, nextEntityId],
          relationships: [...relationships, relationship.id],
        });
        visited.add(nextEntityId);
      }
    }

    // Sort paths by length (shortest first) and confidence
    return paths.sort((a, b) => {
      if (a.length !== b.length) {
        return a.length - b.length;
      }
      return b.confidence - a.confidence;
    });
  }

  /**
   * Apply logarithmic decay to semantic confidence over time
   */
  private applySemanticDecay(): void {
    if (!this.config.enableSemanticDecay) return;

    const now = Date.now();

    // Apply decay to entities
    for (const entity of this.entities.values()) {
      const timeSinceLastAccess = now - entity.lastAccessed;
      const daysSinceAccess = timeSinceLastAccess / (24 * 60 * 60 * 1000);

      if (daysSinceAccess > 1) {
        // Only decay if not accessed recently
        // Apply logarithmic decay to confidence
        const newConfidence =
          this.config.minimumSemanticConfidence +
          (entity.confidence - this.config.minimumSemanticConfidence) /
            (1 + this.config.semanticDecayRate * Math.log(1 + daysSinceAccess));

        entity.confidence = Math.max(
          this.config.minimumSemanticConfidence,
          newConfidence
        );
      }
    }

    // Apply decay to relationships
    for (const relationship of this.relationships.values()) {
      const timeSinceLastAccess = now - relationship.lastAccessed;
      const daysSinceAccess = timeSinceLastAccess / (24 * 60 * 60 * 1000);

      if (daysSinceAccess > 1) {
        // Only decay if not accessed recently
        // Apply logarithmic decay to confidence
        const newConfidence =
          this.config.minimumSemanticConfidence +
          (relationship.confidence - this.config.minimumSemanticConfidence) /
            (1 + this.config.semanticDecayRate * Math.log(1 + daysSinceAccess));

        relationship.confidence = Math.max(
          this.config.minimumSemanticConfidence,
          newConfidence
        );
      }
    }
  }

  /**
   * Apply filters to entities
   */
  private applyFilters(entities: Entity[], filters: QueryFilter[]): Entity[] {
    return entities.filter((entity) => {
      for (const filter of filters) {
        const { field, operator, value } = filter;

        // Handle property fields
        if (field.startsWith('properties.')) {
          const propertyName = field.substring('properties.'.length);
          const property = entity.properties[propertyName];

          if (!property) {
            return false;
          }

          const propertyValue = property.value;

          if (!this.matchesFilter(propertyValue, operator, value)) {
            return false;
          }
        } else {
          // Handle direct entity fields
          const entityValue = (entity as any)[field];

          if (entityValue === undefined) {
            return false;
          }

          if (!this.matchesFilter(entityValue, operator, value)) {
            return false;
          }
        }
      }

      return true;
    });
  }

  /**
   * Check if value matches filter
   */
  private matchesFilter(
    value: any,
    operator: FilterOperator,
    filterValue: any
  ): boolean {
    switch (operator) {
      case FilterOperator.EQUALS:
        return value === filterValue;

      case FilterOperator.NOT_EQUALS:
        return value !== filterValue;

      case FilterOperator.GREATER_THAN:
        return value > filterValue;

      case FilterOperator.GREATER_THAN_OR_EQUALS:
        return value >= filterValue;

      case FilterOperator.LESS_THAN:
        return value < filterValue;

      case FilterOperator.LESS_THAN_OR_EQUALS:
        return value <= filterValue;

      case FilterOperator.CONTAINS:
        if (typeof value === 'string') {
          return value.includes(filterValue);
        } else if (Array.isArray(value)) {
          return value.includes(filterValue);
        }
        return false;

      case FilterOperator.STARTS_WITH:
        if (typeof value === 'string') {
          return value.startsWith(filterValue);
        }
        return false;

      case FilterOperator.ENDS_WITH:
        if (typeof value === 'string') {
          return value.endsWith(filterValue);
        }
        return false;

      case FilterOperator.IN:
        if (Array.isArray(filterValue)) {
          return filterValue.includes(value);
        }
        return false;

      case FilterOperator.NOT_IN:
        if (Array.isArray(filterValue)) {
          return !filterValue.includes(value);
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Apply sorting to entities
   */
  private applySorting(
    entities: Entity[],
    orderBy: string,
    orderDirection: 'asc' | 'desc' = 'asc'
  ): Entity[] {
    return [...entities].sort((a, b) => {
      let valueA: any;
      let valueB: any;

      // Handle property fields
      if (orderBy.startsWith('properties.')) {
        const propertyName = orderBy.substring('properties.'.length);
        valueA = a.properties[propertyName]?.value;
        valueB = b.properties[propertyName]?.value;
      } else {
        // Handle direct entity fields
        valueA = (a as any)[orderBy];
        valueB = (b as any)[orderBy];
      }

      // Handle undefined values
      if (valueA === undefined && valueB === undefined) {
        return 0;
      }
      if (valueA === undefined) {
        return orderDirection === 'asc' ? -1 : 1;
      }
      if (valueB === undefined) {
        return orderDirection === 'asc' ? 1 : -1;
      }

      // Compare values
      if (valueA < valueB) {
        return orderDirection === 'asc' ? -1 : 1;
      }
      if (valueA > valueB) {
        return orderDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  /**
   * Apply pagination to entities
   */
  private applyPagination(
    entities: Entity[],
    offset?: number,
    limit?: number
  ): Entity[] {
    let result = entities;

    if (offset !== undefined && offset > 0) {
      result = result.slice(offset);
    }

    if (limit !== undefined && limit > 0) {
      result = result.slice(0, limit);
    }

    return result;
  }

  /**
   * Get knowledge graph statistics
   */
  getStats(): KnowledgeGraphStats {
    const now = Date.now();

    // Calculate entity stats
    const entitiesByType: Record<EntityType, number> = Object.values(
      EntityType
    ).reduce(
      (acc, type) => {
        acc[type] = this.entitiesByType.get(type as EntityType)?.size || 0;
        return acc;
      },
      {} as Record<EntityType, number>
    );

    // Calculate relationship stats
    const relationshipsByType: Record<RelationType, number> = Object.values(
      RelationType
    ).reduce(
      (acc, type) => {
        acc[type] =
          this.relationshipsByType.get(type as RelationType)?.size || 0;
        return acc;
      },
      {} as Record<RelationType, number>
    );

    // Calculate average confidence
    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const entity of this.entities.values()) {
      totalConfidence += entity.confidence;
      confidenceCount++;
    }

    for (const relationship of this.relationships.values()) {
      totalConfidence += relationship.confidence;
      confidenceCount++;
    }

    const averageConfidence =
      confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    // Calculate density score
    const entityCount = this.entities.size;
    const relationshipCount = this.relationships.size;
    const densityScore = entityCount > 0 ? relationshipCount / entityCount : 0;

    return {
      entityCount,
      relationshipCount,
      entitiesByType,
      relationshipsByType,
      averageConfidence,
      densityScore,
      lastUpdated: now,
    };
  }

  /**
   * Clear the entire knowledge graph
   */
  clear(): void {
    this.entities.clear();
    this.relationships.clear();
    this.entityRelationships.clear();

    // Clear indexes
    for (const entitySet of this.entitiesByType.values()) {
      entitySet.clear();
    }

    for (const relationshipSet of this.relationshipsByType.values()) {
      relationshipSet.clear();
    }
  }
}
