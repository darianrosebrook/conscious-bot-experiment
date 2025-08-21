/**
 * GraphRAG (Graph Retrieval-Augmented Generation) implementation.
 *
 * Combines knowledge graph queries with language model generation
 * to provide factually grounded responses.
 *
 * @author @darianrosebrook
 */

import { KnowledgeGraphCore } from './knowledge-graph-core';
import {
  Entity,
  Relationship,
  QueryType,
  KnowledgeQuery,
  QueryResult,
  EntityType,
  RelationType,
  KnowledgeSource,
  PropertyType,
  FilterOperator,
} from './types';

/**
 * GraphRAG query options
 */
export interface GraphRAGOptions {
  maxEntities?: number;
  maxRelationships?: number;
  minConfidence?: number;
  includeSources?: boolean;
  includeConfidence?: boolean;
  formatAsJson?: boolean;
  formatAsText?: boolean;
  formatAsTriples?: boolean;
}

/**
 * GraphRAG query result
 */
export interface GraphRAGResult {
  query: string;
  context: string;
  entities: Entity[];
  relationships: Relationship[];
  success: boolean;
  confidence: number;
  queryTime: number;
}

/**
 * GraphRAG implementation
 */
export class GraphRAG {
  private knowledgeGraph: KnowledgeGraphCore;

  constructor(knowledgeGraph: KnowledgeGraphCore) {
    this.knowledgeGraph = knowledgeGraph;
  }

  /**
   * Query knowledge graph with natural language
   */
  async query(
    query: string,
    options: GraphRAGOptions = {}
  ): Promise<GraphRAGResult> {
    const startTime = Date.now();
    
    // Parse query to determine intent and entities
    const parsedQuery = await this.parseQuery(query);
    
    // Execute knowledge graph query
    const result = await this.executeQuery(parsedQuery, options);
    
    // Format result as context
    const context = this.formatContext(result, options);
    
    const queryTime = Date.now() - startTime;
    
    return {
      query,
      context,
      entities: result.entities,
      relationships: result.relationships,
      success: result.entities.length > 0 || result.relationships.length > 0,
      confidence: result.metadata.confidence,
      queryTime,
    };
  }

  /**
   * Parse natural language query
   */
  private async parseQuery(query: string): Promise<KnowledgeQuery> {
    // This is a simplified implementation
    // In a real system, this would use NLP to parse the query
    
    const queryLower = query.toLowerCase();
    
    // Check for entity queries
    if (queryLower.includes('what is') || queryLower.includes('who is') || queryLower.includes('tell me about')) {
      const entityName = this.extractEntityName(query);
      return {
        type: QueryType.ENTITY,
        parameters: {
          name: entityName,
        },
      };
    }
    
    // Check for relationship queries
    if (queryLower.includes('relationship') || queryLower.includes('connected to') || queryLower.includes('related to')) {
      const [sourceEntity, targetEntity] = this.extractEntityPair(query);
      return {
        type: QueryType.PATH,
        parameters: {
          sourceId: sourceEntity,
          targetId: targetEntity,
          maxDepth: 3,
        },
      };
    }
    
    // Check for neighborhood queries
    if (queryLower.includes('neighbors') || queryLower.includes('nearby') || queryLower.includes('surrounding')) {
      const entityName = this.extractEntityName(query);
      return {
        type: QueryType.NEIGHBORHOOD,
        parameters: {
          entityId: entityName,
          depth: 1,
        },
      };
    }
    
    // Default to entity query
    return {
      type: QueryType.ENTITY,
      parameters: {
        name: query,
      },
      limit: 5,
    };
  }

  /**
   * Extract entity name from query
   */
  private extractEntityName(query: string): string {
    // This is a simplified implementation
    // In a real system, this would use NLP to extract entity names
    
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('what is ')) {
      return query.split('what is ')[1].trim().replace(/[?.,!]$/, '');
    }
    
    if (queryLower.includes('who is ')) {
      return query.split('who is ')[1].trim().replace(/[?.,!]$/, '');
    }
    
    if (queryLower.includes('tell me about ')) {
      return query.split('tell me about ')[1].trim().replace(/[?.,!]$/, '');
    }
    
    return query.trim().replace(/[?.,!]$/, '');
  }

  /**
   * Extract entity pair from query
   */
  private extractEntityPair(query: string): [string, string] {
    // This is a simplified implementation
    // In a real system, this would use NLP to extract entity pairs
    
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('relationship between ') && queryLower.includes(' and ')) {
      const parts = query.split('relationship between ')[1].split(' and ');
      return [parts[0].trim(), parts[1].trim().replace(/[?.,!]$/, '')];
    }
    
    if (queryLower.includes('connected to')) {
      const parts = query.split('connected to');
      return [parts[0].trim(), parts[1].trim().replace(/[?.,!]$/, '')];
    }
    
    if (queryLower.includes('related to')) {
      const parts = query.split('related to');
      return [parts[0].trim(), parts[1].trim().replace(/[?.,!]$/, '')];
    }
    
    return ['', ''];
  }

  /**
   * Execute knowledge graph query
   */
  private async executeQuery(
    parsedQuery: KnowledgeQuery,
    options: GraphRAGOptions
  ): Promise<QueryResult> {
    // Apply options to query
    if (options.maxEntities) {
      parsedQuery.limit = options.maxEntities;
    }
    
    if (options.minConfidence) {
      parsedQuery.filters = [
        ...(parsedQuery.filters || []),
        {
          field: 'confidence',
          operator: FilterOperator.GREATER_THAN_OR_EQUALS,
          value: options.minConfidence,
        },
      ];
    }
    
    // Execute query
    return await this.knowledgeGraph.query(parsedQuery);
  }

  /**
   * Format query result as context
   */
  private formatContext(
    result: QueryResult,
    options: GraphRAGOptions
  ): string {
    if (options.formatAsJson) {
      return this.formatAsJson(result, options);
    }
    
    if (options.formatAsTriples) {
      return this.formatAsTriples(result, options);
    }
    
    // Default to text format
    return this.formatAsText(result, options);
  }

  /**
   * Format result as JSON
   */
  private formatAsJson(
    result: QueryResult,
    options: GraphRAGOptions
  ): string {
    const formattedEntities = result.entities.map(entity => {
      const formatted: any = {
        id: entity.id,
        type: entity.type,
        name: entity.name,
      };
      
      if (entity.description) {
        formatted.description = entity.description;
      }
      
      if (Object.keys(entity.properties).length > 0) {
        formatted.properties = {};
        for (const [key, prop] of Object.entries(entity.properties)) {
          formatted.properties[key] = prop.value;
        }
      }
      
      if (options.includeConfidence) {
        formatted.confidence = entity.confidence;
      }
      
      if (options.includeSources) {
        formatted.source = entity.source;
      }
      
      return formatted;
    });
    
    const formattedRelationships = result.relationships.map(rel => {
      const formatted: any = {
        type: rel.type,
        source: result.entities.find(e => e.id === rel.sourceId)?.name || rel.sourceId,
        target: result.entities.find(e => e.id === rel.targetId)?.name || rel.targetId,
      };
      
      if (Object.keys(rel.properties).length > 0) {
        formatted.properties = {};
        for (const [key, prop] of Object.entries(rel.properties)) {
          formatted.properties[key] = prop.value;
        }
      }
      
      if (options.includeConfidence) {
        formatted.confidence = rel.confidence;
      }
      
      if (options.includeSources) {
        formatted.source = rel.source;
      }
      
      return formatted;
    });
    
    return JSON.stringify({
      entities: formattedEntities,
      relationships: formattedRelationships,
      metadata: {
        count: result.entities.length,
        confidence: result.metadata.confidence,
      },
    }, null, 2);
  }

  /**
   * Format result as text
   */
  private formatAsText(
    result: QueryResult,
    options: GraphRAGOptions
  ): string {
    let text = '';
    
    // Format entities
    if (result.entities.length > 0) {
      text += 'Entities:\n';
      
      for (const entity of result.entities) {
        text += `- ${entity.name} (${entity.type})`;
        
        if (entity.description) {
          text += `: ${entity.description}`;
        }
        
        if (options.includeConfidence) {
          text += ` [confidence: ${entity.confidence.toFixed(2)}]`;
        }
        
        text += '\n';
        
        if (Object.keys(entity.properties).length > 0) {
          text += '  Properties:\n';
          
          for (const [key, prop] of Object.entries(entity.properties)) {
            text += `  - ${key}: ${prop.value}`;
            
            if (prop.unit) {
              text += ` ${prop.unit}`;
            }
            
            if (options.includeConfidence) {
              text += ` [confidence: ${prop.confidence.toFixed(2)}]`;
            }
            
            text += '\n';
          }
        }
      }
      
      text += '\n';
    }
    
    // Format relationships
    if (result.relationships.length > 0) {
      text += 'Relationships:\n';
      
      for (const rel of result.relationships) {
        const sourceName = result.entities.find(e => e.id === rel.sourceId)?.name || rel.sourceId;
        const targetName = result.entities.find(e => e.id === rel.targetId)?.name || rel.targetId;
        
        text += `- ${sourceName} ${rel.type} ${targetName}`;
        
        if (options.includeConfidence) {
          text += ` [confidence: ${rel.confidence.toFixed(2)}]`;
        }
        
        text += '\n';
        
        if (Object.keys(rel.properties).length > 0) {
          text += '  Properties:\n';
          
          for (const [key, prop] of Object.entries(rel.properties)) {
            text += `  - ${key}: ${prop.value}`;
            
            if (prop.unit) {
              text += ` ${prop.unit}`;
            }
            
            if (options.includeConfidence) {
              text += ` [confidence: ${prop.confidence.toFixed(2)}]`;
            }
            
            text += '\n';
          }
        }
      }
    }
    
    return text;
  }

  /**
   * Format result as triples
   */
  private formatAsTriples(
    result: QueryResult,
    options: GraphRAGOptions
  ): string {
    let text = '';
    
    // Format entity properties as triples
    for (const entity of result.entities) {
      // Entity type triple
      text += `(${entity.name}, is_a, ${entity.type})`;
      
      if (options.includeConfidence) {
        text += ` [${entity.confidence.toFixed(2)}]`;
      }
      
      text += '\n';
      
      // Entity property triples
      for (const [key, prop] of Object.entries(entity.properties)) {
        text += `(${entity.name}, ${key}, ${prop.value}`;
        
        if (prop.unit) {
          text += ` ${prop.unit}`;
        }
        
        text += ')';
        
        if (options.includeConfidence) {
          text += ` [${prop.confidence.toFixed(2)}]`;
        }
        
        text += '\n';
      }
    }
    
    // Format relationships as triples
    for (const rel of result.relationships) {
      const sourceName = result.entities.find(e => e.id === rel.sourceId)?.name || rel.sourceId;
      const targetName = result.entities.find(e => e.id === rel.targetId)?.name || rel.targetId;
      
      text += `(${sourceName}, ${rel.type}, ${targetName})`;
      
      if (options.includeConfidence) {
        text += ` [${rel.confidence.toFixed(2)}]`;
      }
      
      text += '\n';
      
      // Relationship property triples
      for (const [key, prop] of Object.entries(rel.properties)) {
        text += `(${rel.type}_relation, ${key}, ${prop.value}`;
        
        if (prop.unit) {
          text += ` ${prop.unit}`;
        }
        
        text += ')';
        
        if (options.includeConfidence) {
          text += ` [${prop.confidence.toFixed(2)}]`;
        }
        
        text += '\n';
      }
    }
    
    return text;
  }

  /**
   * Add entity to knowledge graph
   */
  async addEntity(
    name: string,
    type: EntityType,
    properties: Record<string, any> = {},
    options: {
      description?: string;
      tags?: string[];
      confidence?: number;
      source?: KnowledgeSource;
    } = {}
  ): Promise<Entity> {
    const formattedProperties: Record<string, any> = {};
    
    // Format properties
    for (const [key, value] of Object.entries(properties)) {
      formattedProperties[key] = {
        value,
        type: this.inferPropertyType(value),
        confidence: options.confidence || 0.8,
        source: options.source || KnowledgeSource.SYSTEM,
        timestamp: Date.now(),
      };
    }
    
    // Create entity
    return this.knowledgeGraph.upsertEntity({
      name,
      type,
      description: options.description,
      properties: formattedProperties,
      tags: options.tags || [],
      confidence: options.confidence || 0.8,
      source: options.source || KnowledgeSource.SYSTEM,
    });
  }

  /**
   * Add relationship to knowledge graph
   */
  async addRelationship(
    sourceId: string,
    targetId: string,
    type: RelationType,
    properties: Record<string, any> = {},
    options: {
      bidirectional?: boolean;
      confidence?: number;
      source?: KnowledgeSource;
    } = {}
  ): Promise<Relationship> {
    const formattedProperties: Record<string, any> = {};
    
    // Format properties
    for (const [key, value] of Object.entries(properties)) {
      formattedProperties[key] = {
        value,
        type: this.inferPropertyType(value),
        confidence: options.confidence || 0.8,
        source: options.source || KnowledgeSource.SYSTEM,
        timestamp: Date.now(),
      };
    }
    
    // Create relationship
    return this.knowledgeGraph.upsertRelationship({
      sourceId,
      targetId,
      type,
      properties: formattedProperties,
      bidirectional: options.bidirectional || false,
      confidence: options.confidence || 0.8,
      source: options.source || KnowledgeSource.SYSTEM,
    });
  }

  /**
   * Infer property type from value
   */
  private inferPropertyType(value: any): PropertyType {
    if (value === null) {
      return PropertyType.NULL;
    }
    
    if (typeof value === 'string') {
      return PropertyType.STRING;
    }
    
    if (typeof value === 'number') {
      return PropertyType.NUMBER;
    }
    
    if (typeof value === 'boolean') {
      return PropertyType.BOOLEAN;
    }
    
    if (value instanceof Date) {
      return PropertyType.DATE;
    }
    
    if (Array.isArray(value)) {
      return PropertyType.ARRAY;
    }
    
    if (typeof value === 'object') {
      return PropertyType.OBJECT;
    }
    
    return PropertyType.STRING;
  }
}
