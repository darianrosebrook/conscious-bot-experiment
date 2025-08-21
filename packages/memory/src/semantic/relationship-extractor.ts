/**
 * Relationship extractor for knowledge graph.
 *
 * Extracts entities and relationships from text and experiences
 * to continuously update the knowledge graph.
 *
 * @author @darianrosebrook
 */

import { KnowledgeGraphCore } from './knowledge-graph-core';
import { GraphRAG } from './graph-rag';
import {
  Entity,
  Relationship,
  EntityType,
  RelationType,
  KnowledgeSource,
  PropertyType,
} from './types';

/**
 * Extraction result
 */
export interface ExtractionResult {
  entities: Entity[];
  relationships: Relationship[];
  confidence: number;
}

/**
 * Relationship extractor
 */
export class RelationshipExtractor {
  private knowledgeGraph: KnowledgeGraphCore;
  private graphRAG: GraphRAG;

  constructor(knowledgeGraph: KnowledgeGraphCore, graphRAG: GraphRAG) {
    this.knowledgeGraph = knowledgeGraph;
    this.graphRAG = graphRAG;
  }

  /**
   * Extract entities and relationships from text
   */
  async extractFromText(
    text: string,
    options: {
      minConfidence?: number;
      source?: KnowledgeSource;
      context?: Record<string, any>;
    } = {}
  ): Promise<ExtractionResult> {
    // This is a simplified implementation
    // In a real system, this would use NLP to extract entities and relationships
    
    const minConfidence = options.minConfidence || 0.5;
    const source = options.source || KnowledgeSource.SYSTEM;
    
    const entities: Entity[] = [];
    const relationships: Relationship[] = [];
    
    // Simple entity extraction using basic patterns
    const entityMatches = this.extractEntityMatches(text);
    
    // Create entities
    for (const match of entityMatches) {
      if (match.confidence < minConfidence) {
        continue;
      }
      
      try {
        const entity = await this.graphRAG.addEntity(
          match.name,
          match.type,
          match.properties,
          {
            description: match.description,
            tags: match.tags,
            confidence: match.confidence,
            source,
          }
        );
        
        entities.push(entity);
      } catch (error) {
        console.warn('Failed to add entity:', error);
      }
    }
    
    // Simple relationship extraction using basic patterns
    const relationshipMatches = this.extractRelationshipMatches(text, entities);
    
    // Create relationships
    for (const match of relationshipMatches) {
      if (match.confidence < minConfidence) {
        continue;
      }
      
      try {
        const relationship = await this.graphRAG.addRelationship(
          match.sourceId,
          match.targetId,
          match.type,
          match.properties,
          {
            bidirectional: match.bidirectional,
            confidence: match.confidence,
            source,
          }
        );
        
        relationships.push(relationship);
      } catch (error) {
        console.warn('Failed to add relationship:', error);
      }
    }
    
    // Calculate overall confidence
    const confidence = this.calculateConfidence(entities, relationships);
    
    return {
      entities,
      relationships,
      confidence,
    };
  }

  /**
   * Extract entities and relationships from experience
   */
  async extractFromExperience(
    experience: any,
    options: {
      minConfidence?: number;
      source?: KnowledgeSource;
    } = {}
  ): Promise<ExtractionResult> {
    // This is a simplified implementation
    // In a real system, this would use more sophisticated extraction
    
    const minConfidence = options.minConfidence || 0.5;
    const source = options.source || KnowledgeSource.OBSERVATION;
    
    const entities: Entity[] = [];
    const relationships: Relationship[] = [];
    
    // Extract from experience content if available
    if (experience.content && typeof experience.content === 'string') {
      const textResult = await this.extractFromText(experience.content, {
        minConfidence,
        source,
        context: experience,
      });
      
      entities.push(...textResult.entities);
      relationships.push(...textResult.relationships);
    }
    
    // Extract from experience properties
    if (experience.location) {
      try {
        // Create location entity
        const locationEntity = await this.graphRAG.addEntity(
          experience.location.name || `Location-${experience.location.x}-${experience.location.y}-${experience.location.z}`,
          EntityType.PLACE,
          {
            x: experience.location.x,
            y: experience.location.y,
            z: experience.location.z,
            biome: experience.location.biome,
          },
          {
            description: experience.location.description,
            tags: ['location', experience.location.biome],
            confidence: 0.9,
            source,
          }
        );
        
        entities.push(locationEntity);
        
        // Create experience entity
        const experienceEntity = await this.graphRAG.addEntity(
          `Experience-${experience.id || Date.now()}`,
          EntityType.EVENT,
          {
            timestamp: experience.timestamp || Date.now(),
            outcome: experience.outcome,
            emotionalValence: experience.emotionalState?.valence || 0,
          },
          {
            description: experience.content,
            tags: experience.tags || [],
            confidence: 0.8,
            source,
          }
        );
        
        entities.push(experienceEntity);
        
        // Create relationship between experience and location
        const locationRelationship = await this.graphRAG.addRelationship(
          experienceEntity.id,
          locationEntity.id,
          RelationType.LOCATED_AT,
          {
            timestamp: experience.timestamp || Date.now(),
          },
          {
            confidence: 0.9,
            source,
          }
        );
        
        relationships.push(locationRelationship);
      } catch (error) {
        console.warn('Failed to extract from experience:', error);
      }
    }
    
    // Calculate overall confidence
    const confidence = this.calculateConfidence(entities, relationships);
    
    return {
      entities,
      relationships,
      confidence,
    };
  }

  /**
   * Extract entity matches from text
   */
  private extractEntityMatches(text: string): Array<{
    name: string;
    type: EntityType;
    properties: Record<string, any>;
    description?: string;
    tags: string[];
    confidence: number;
  }> {
    const matches: Array<{
      name: string;
      type: EntityType;
      properties: Record<string, any>;
      description?: string;
      tags: string[];
      confidence: number;
    }> = [];
    
    // This is a simplified implementation using regex patterns
    // In a real system, this would use NLP for entity extraction
    
    // Extract object entities
    const objectPattern = /(?:a|an|the)\s+([a-zA-Z0-9\s]+)(?:\s+(?:is|was|that is|that was))/gi;
    let objectMatch;
    
    while ((objectMatch = objectPattern.exec(text)) !== null) {
      const name = objectMatch[1].trim();
      
      // Skip common words and short names
      if (this.isCommonWord(name) || name.length < 3) {
        continue;
      }
      
      matches.push({
        name,
        type: EntityType.OBJECT,
        properties: {},
        tags: [],
        confidence: 0.6,
      });
    }
    
    // Extract place entities
    const placePattern = /(?:at|in|to|from)\s+(?:a|an|the)?\s+([a-zA-Z0-9\s]+)(?:\s+(?:where|which|that))?/gi;
    let placeMatch;
    
    while ((placeMatch = placePattern.exec(text)) !== null) {
      const name = placeMatch[1].trim();
      
      // Skip common words and short names
      if (this.isCommonWord(name) || name.length < 3) {
        continue;
      }
      
      matches.push({
        name,
        type: EntityType.PLACE,
        properties: {},
        tags: [],
        confidence: 0.5,
      });
    }
    
    // Extract creature entities
    const creaturePattern = /(?:a|an|the)\s+([a-zA-Z0-9\s]+)(?:\s+(?:creature|mob|animal|monster))/gi;
    let creatureMatch;
    
    while ((creatureMatch = creaturePattern.exec(text)) !== null) {
      const name = creatureMatch[1].trim();
      
      matches.push({
        name,
        type: EntityType.CREATURE,
        properties: {},
        tags: [],
        confidence: 0.7,
      });
    }
    
    return matches;
  }

  /**
   * Extract relationship matches from text
   */
  private extractRelationshipMatches(text: string, entities: Entity[]): Array<{
    sourceId: string;
    targetId: string;
    type: RelationType;
    properties: Record<string, any>;
    bidirectional: boolean;
    confidence: number;
  }> {
    const matches: Array<{
      sourceId: string;
      targetId: string;
      type: RelationType;
      properties: Record<string, any>;
      bidirectional: boolean;
      confidence: number;
    }> = [];
    
    // This is a simplified implementation
    // In a real system, this would use NLP for relationship extraction
    
    // Need at least two entities to form a relationship
    if (entities.length < 2) {
      return matches;
    }
    
    // Check for relationships between each pair of entities
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const sourceEntity = entities[i];
        const targetEntity = entities[j];
        
        // Check for "is a" relationship
        const isAPattern = new RegExp(
          `${sourceEntity.name}\\s+(?:is|was)\\s+(?:a|an)\\s+${targetEntity.name}`,
          'i'
        );
        
        if (isAPattern.test(text)) {
          matches.push({
            sourceId: sourceEntity.id,
            targetId: targetEntity.id,
            type: RelationType.IS_A,
            properties: {},
            bidirectional: false,
            confidence: 0.7,
          });
          continue;
        }
        
        // Check for "part of" relationship
        const partOfPattern = new RegExp(
          `${sourceEntity.name}\\s+(?:is|was)\\s+(?:part of|in)\\s+${targetEntity.name}`,
          'i'
        );
        
        if (partOfPattern.test(text)) {
          matches.push({
            sourceId: sourceEntity.id,
            targetId: targetEntity.id,
            type: RelationType.PART_OF,
            properties: {},
            bidirectional: false,
            confidence: 0.7,
          });
          continue;
        }
        
        // Check for "located at" relationship
        const locatedAtPattern = new RegExp(
          `${sourceEntity.name}\\s+(?:is|was)\\s+(?:at|in|on)\\s+${targetEntity.name}`,
          'i'
        );
        
        if (locatedAtPattern.test(text)) {
          matches.push({
            sourceId: sourceEntity.id,
            targetId: targetEntity.id,
            type: RelationType.LOCATED_AT,
            properties: {},
            bidirectional: false,
            confidence: 0.7,
          });
          continue;
        }
        
        // Check for "near" relationship
        const nearPattern = new RegExp(
          `${sourceEntity.name}\\s+(?:is|was)\\s+(?:near|close to|by)\\s+${targetEntity.name}`,
          'i'
        );
        
        if (nearPattern.test(text)) {
          matches.push({
            sourceId: sourceEntity.id,
            targetId: targetEntity.id,
            type: RelationType.NEAR,
            properties: {},
            bidirectional: true,
            confidence: 0.6,
          });
          continue;
        }
        
        // Check for generic relationship
        const relatedPattern = new RegExp(
          `${sourceEntity.name}\\s+(?:and|or)\\s+${targetEntity.name}`,
          'i'
        );
        
        if (relatedPattern.test(text)) {
          matches.push({
            sourceId: sourceEntity.id,
            targetId: targetEntity.id,
            type: RelationType.RELATED_TO,
            properties: {},
            bidirectional: true,
            confidence: 0.5,
          });
        }
      }
    }
    
    return matches;
  }

  /**
   * Check if word is a common word
   */
  private isCommonWord(word: string): boolean {
    const commonWords = [
      'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else',
      'when', 'where', 'how', 'what', 'why', 'who', 'which', 'there',
      'here', 'that', 'this', 'these', 'those', 'it', 'its', 'is',
      'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
      'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could',
      'may', 'might', 'must', 'can', 'cannot', 'not', 'no', 'yes',
      'on', 'in', 'at', 'by', 'for', 'with', 'about', 'against',
      'between', 'into', 'through', 'during', 'before', 'after',
      'above', 'below', 'to', 'from', 'up', 'down', 'of', 'off',
      'over', 'under', 'again', 'further', 'then', 'once', 'all',
      'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
      'such', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
      'just', 'now',
    ];
    
    return commonWords.includes(word.toLowerCase());
  }

  /**
   * Calculate overall confidence
   */
  private calculateConfidence(entities: Entity[], relationships: Relationship[]): number {
    if (entities.length === 0 && relationships.length === 0) {
      return 0;
    }
    
    let totalConfidence = 0;
    let count = 0;
    
    for (const entity of entities) {
      totalConfidence += entity.confidence;
      count++;
    }
    
    for (const relationship of relationships) {
      totalConfidence += relationship.confidence;
      count++;
    }
    
    return count > 0 ? totalConfidence / count : 0;
  }
}
