/**
 * Query engine for semantic memory.
 *
 * Provides a high-level interface for querying the knowledge graph
 * and integrating with other memory systems.
 *
 * @author @darianrosebrook
 */

import { KnowledgeGraphCore } from './knowledge-graph-core';
import { GraphRAG } from './graph-rag';
import { RelationshipExtractor } from './relationship-extractor';
import {
  Entity,
  Relationship,
  EntityType,
  RelationType,
  KnowledgeSource,
  QueryType,
  KnowledgeQuery,
  QueryResult,
  EntityNeighborhood,
  KnowledgePath,
} from './types';

/**
 * Query options
 */
export interface QueryOptions {
  maxResults?: number;
  minConfidence?: number;
  includeRelationships?: boolean;
  includeNeighbors?: boolean;
  maxDepth?: number;
  timeout?: number;
}

/**
 * Knowledge query result
 */
export interface KnowledgeQueryResult {
  query: string;
  entities: Entity[];
  relationships: Relationship[];
  paths: KnowledgePath[];
  neighborhoods: EntityNeighborhood[];
  context: string;
  confidence: number;
  queryTime: number;
  success: boolean;
}

/**
 * Query engine for semantic memory
 */
export class QueryEngine {
  private knowledgeGraph: KnowledgeGraphCore;
  private graphRAG: GraphRAG;
  private relationshipExtractor: RelationshipExtractor;

  constructor(
    knowledgeGraph: KnowledgeGraphCore,
    graphRAG: GraphRAG,
    relationshipExtractor: RelationshipExtractor
  ) {
    this.knowledgeGraph = knowledgeGraph;
    this.graphRAG = graphRAG;
    this.relationshipExtractor = relationshipExtractor;
  }

  /**
   * Query semantic memory with natural language
   */
  async query(
    query: string,
    options: QueryOptions = {}
  ): Promise<KnowledgeQueryResult> {
    const startTime = Date.now();

    // Set default options
    const maxResults = options.maxResults || 10;
    const minConfidence = options.minConfidence || 0.3;
    const includeRelationships = options.includeRelationships !== false;
    const includeNeighbors = options.includeNeighbors !== false;
    const maxDepth = options.maxDepth || 2;
    const timeout = options.timeout || 5000;

    // Use GraphRAG to query knowledge graph
    const ragResult = await this.graphRAG.query(query, {
      maxEntities: maxResults,
      minConfidence,
      includeConfidence: true,
      formatAsText: true,
    });

    // Extract entities and relationships
    const entities = ragResult.entities;
    let relationships = ragResult.relationships;

    // Get additional relationships if requested
    if (includeRelationships && entities.length > 0) {
      const additionalRelationships = await this.getRelationshipsForEntities(
        entities.map((e) => e.id),
        maxDepth
      );

      // Merge relationships (avoid duplicates)
      const relationshipIds = new Set(relationships.map((r) => r.id));
      for (const relationship of additionalRelationships) {
        if (!relationshipIds.has(relationship.id)) {
          relationships.push(relationship);
          relationshipIds.add(relationship.id);
        }
      }
    }

    // Get entity neighborhoods if requested
    const neighborhoods: EntityNeighborhood[] = [];
    if (includeNeighbors && entities.length > 0) {
      for (const entity of entities) {
        const neighborhood = await this.getEntityNeighborhood(entity.id, 1);
        if (neighborhood) {
          neighborhoods.push(neighborhood);
        }
      }
    }

    // Get paths between entities if multiple entities
    const paths: KnowledgePath[] = [];
    if (entities.length > 1) {
      for (let i = 0; i < entities.length - 1; i++) {
        const sourceId = entities[i].id;
        const targetId = entities[i + 1].id;

        const entityPaths = await this.getPathsBetweenEntities(
          sourceId,
          targetId,
          maxDepth
        );

        paths.push(...entityPaths);
      }
    }

    // Check timeout
    const queryTime = Date.now() - startTime;
    const timedOut = queryTime > timeout;

    // Format context
    const context = this.formatQueryContext(
      query,
      entities,
      relationships,
      paths,
      neighborhoods,
      timedOut
    );

    return {
      query,
      entities,
      relationships,
      paths,
      neighborhoods,
      context,
      confidence: ragResult.confidence,
      queryTime,
      success: entities.length > 0 || relationships.length > 0,
    };
  }

  /**
   * Get relationships for entities
   */
  private async getRelationshipsForEntities(
    entityIds: string[],
    maxDepth: number
  ): Promise<Relationship[]> {
    const relationships: Relationship[] = [];
    const visitedEntityIds = new Set<string>();
    const visitedRelationshipIds = new Set<string>();

    // Use breadth-first search to find relationships
    const queue: Array<{
      entityId: string;
      depth: number;
    }> = entityIds.map((id) => ({ entityId: id, depth: 0 }));

    while (queue.length > 0) {
      const { entityId, depth } = queue.shift()!;

      // Skip if already visited
      if (visitedEntityIds.has(entityId)) {
        continue;
      }

      // Mark as visited
      visitedEntityIds.add(entityId);

      // Get relationships for entity
      const entityRelationships =
        this.knowledgeGraph.getRelationshipsForEntity(entityId);

      for (const relationship of entityRelationships) {
        // Skip if already visited
        if (visitedRelationshipIds.has(relationship.id)) {
          continue;
        }

        // Mark as visited
        visitedRelationshipIds.add(relationship.id);

        // Add relationship
        relationships.push(relationship);

        // Add connected entity to queue if within depth limit
        if (depth < maxDepth) {
          const connectedEntityId =
            relationship.sourceId === entityId
              ? relationship.targetId
              : relationship.sourceId;

          queue.push({
            entityId: connectedEntityId,
            depth: depth + 1,
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Get entity neighborhood
   */
  private async getEntityNeighborhood(
    entityId: string,
    depth: number
  ): Promise<EntityNeighborhood | null> {
    const query: KnowledgeQuery = {
      type: QueryType.NEIGHBORHOOD,
      parameters: {
        entityId,
        depth,
      },
    };

    const result = await this.knowledgeGraph.query(query);

    // Extract neighborhood from result
    const entity = result.entities[0];
    if (!entity) {
      return null;
    }

    const neighbors: Array<{
      entity: Entity;
      relationship: Relationship;
      direction: 'outgoing' | 'incoming';
    }> = [];

    // Get relationships for entity
    const relationships =
      this.knowledgeGraph.getRelationshipsForEntity(entityId);

    for (const relationship of relationships) {
      const isOutgoing = relationship.sourceId === entityId;
      const neighborId = isOutgoing
        ? relationship.targetId
        : relationship.sourceId;
      const neighborEntity = this.knowledgeGraph.getEntity(neighborId);

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
      depth,
    };
  }

  /**
   * Get paths between entities
   */
  private async getPathsBetweenEntities(
    sourceId: string,
    targetId: string,
    maxDepth: number
  ): Promise<KnowledgePath[]> {
    const query: KnowledgeQuery = {
      type: QueryType.PATH,
      parameters: {
        sourceId,
        targetId,
        maxDepth,
      },
    };

    const result = await this.knowledgeGraph.query(query);

    // Extract paths from result
    // This is a simplified implementation
    // In a real system, this would parse the result to extract paths

    if (result.entities.length === 0 || result.relationships.length === 0) {
      return [];
    }

    // Create a simple path
    const path: KnowledgePath = {
      entities: result.entities,
      relationships: result.relationships,
      length: result.relationships.length,
      hopCount: result.relationships.length,
      confidence: result.metadata.confidence,
    };

    return [path];
  }

  /**
   * Format query context
   */
  private formatQueryContext(
    query: string,
    entities: Entity[],
    relationships: Relationship[],
    paths: KnowledgePath[],
    neighborhoods: EntityNeighborhood[],
    timedOut: boolean
  ): string {
    let context = '';

    // Add query
    context += `Query: ${query}\n\n`;

    // Add entities
    if (entities.length > 0) {
      context += `Entities (${entities.length}):\n`;

      for (const entity of entities) {
        context += `- ${entity.name} (${entity.type})`;

        if (entity.description) {
          context += `: ${entity.description}`;
        }

        context += '\n';

        if (Object.keys(entity.properties).length > 0) {
          context += '  Properties:\n';

          for (const [key, prop] of Object.entries(entity.properties)) {
            context += `  - ${key}: ${prop.value}`;

            if (prop.unit) {
              context += ` ${prop.unit}`;
            }

            context += '\n';
          }
        }
      }

      context += '\n';
    }

    // Add relationships
    if (relationships.length > 0) {
      context += `Relationships (${relationships.length}):\n`;

      for (const rel of relationships) {
        const sourceEntity = entities.find((e) => e.id === rel.sourceId);
        const targetEntity = entities.find((e) => e.id === rel.targetId);

        const sourceName = sourceEntity ? sourceEntity.name : rel.sourceId;
        const targetName = targetEntity ? targetEntity.name : rel.targetId;

        context += `- ${sourceName} ${rel.type} ${targetName}\n`;

        if (Object.keys(rel.properties).length > 0) {
          context += '  Properties:\n';

          for (const [key, prop] of Object.entries(rel.properties)) {
            context += `  - ${key}: ${prop.value}`;

            if (prop.unit) {
              context += ` ${prop.unit}`;
            }

            context += '\n';
          }
        }
      }

      context += '\n';
    }

    // Add paths
    if (paths.length > 0) {
      context += `Paths (${paths.length}):\n`;

      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        context += `- Path ${i + 1} (length: ${path.length}, confidence: ${path.confidence.toFixed(2)}):\n`;

        // Format path as entity -> relationship -> entity
        for (let j = 0; j < path.entities.length - 1; j++) {
          const sourceEntity = path.entities[j];
          const targetEntity = path.entities[j + 1];
          const relationship = path.relationships[j];

          context += `  ${sourceEntity.name} --[${relationship.type}]--> ${targetEntity.name}\n`;
        }

        context += '\n';
      }
    }

    // Add timeout warning
    if (timedOut) {
      context += 'Warning: Query timed out. Results may be incomplete.\n\n';
    }

    return context;
  }

  /**
   * Add fact to knowledge graph
   */
  async addFact(
    fact: string,
    options: {
      confidence?: number;
      source?: KnowledgeSource;
    } = {}
  ): Promise<boolean> {
    try {
      // Extract entities and relationships from fact
      const extraction = await this.relationshipExtractor.extractFromText(
        fact,
        {
          minConfidence: options.confidence || 0.5,
          source: options.source || KnowledgeSource.SYSTEM,
        }
      );

      return (
        extraction.entities.length > 0 || extraction.relationships.length > 0
      );
    } catch (error) {
      console.warn('Failed to add fact:', error);
      return false;
    }
  }

  /**
   * Add experience to knowledge graph
   */
  async addExperience(
    experience: any,
    options: {
      confidence?: number;
      source?: KnowledgeSource;
    } = {}
  ): Promise<boolean> {
    try {
      // Extract entities and relationships from experience
      const extraction = await this.relationshipExtractor.extractFromExperience(
        experience,
        {
          minConfidence: options.confidence || 0.5,
          source: options.source || KnowledgeSource.OBSERVATION,
        }
      );

      return (
        extraction.entities.length > 0 || extraction.relationships.length > 0
      );
    } catch (error) {
      console.warn('Failed to add experience:', error);
      return false;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return this.knowledgeGraph.getStats();
  }
}
