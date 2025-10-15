/**
 * Entity Extraction Service
 *
 * Multi-modal entity extraction pipeline with confidence scoring and relationship inference.
 * Extracts entities, relationships, and metadata from various content types for knowledge graph construction.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface ExtractedEntity {
  id: string;
  name: string;
  type: ExtractedEntityType;
  confidence: number;
  aliases: string[];
  description?: string;

  // Multi-modal extraction metadata
  extractionMethod: string;
  sourceText: string;
  position?: {
    start: number;
    end: number;
    sentenceIndex?: number;
  };

  // Enhanced metadata for knowledge graph
  metadata: {
    frequency: number; // How often this entity appears
    context: string[]; // Surrounding context words
    relatedTerms: string[]; // Co-occurring terms
    semanticType?: string; // More specific semantic classification
    wikidataId?: string; // External knowledge base linking
    importance: number; // 0-1, derived from context and frequency
  };
}

export interface ExtractedRelationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: ExtractedRelationshipType;
  confidence: number;
  strength: number; // 0-1, based on co-occurrence and context

  // Evidence supporting this relationship
  evidence: {
    sourceText: string;
    cooccurrenceCount: number;
    contextWindow: number; // Words around the relationship
    extractionMethod: string;
    mutualInformation?: number; // Statistical measure of relationship strength
  };

  // Relationship metadata
  metadata: {
    isDirectional: boolean;
    temporalContext?: string;
    certainty: number; // How certain we are about the relationship type
    frequency: number; // How often this relationship pattern appears
  };
}

export interface EntityExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  metadata: {
    sourceType: 'text' | 'pdf' | 'audio' | 'video' | 'image' | 'structured';
    sourceId: string;
    extractionTime: number;
    totalTokens: number;
    confidenceDistribution: {
      high: number; // > 0.8
      medium: number; // 0.5-0.8
      low: number; // < 0.5
    };
    processingErrors: string[];
  };
}

export interface EntityExtractionConfig {
  /** Minimum confidence threshold for entity inclusion */
  minConfidence: number;

  /** Enable fuzzy matching for entity resolution */
  enableFuzzyMatching: boolean;

  /** Maximum number of entities to extract per chunk */
  maxEntitiesPerChunk: number;

  /** Maximum number of relationships to extract per chunk */
  maxRelationshipsPerChunk: number;

  /** Enable statistical relationship inference */
  enableStatisticalInference: boolean;

  /** Enable external knowledge base linking (Wikidata, etc.) */
  enableExternalLinking: boolean;

  /** Custom entity types and patterns */
  customEntityPatterns: Record<string, RegExp[]>;

  /** Relationship inference rules */
  relationshipRules: Array<{
    pattern: RegExp;
    sourceType: string;
    targetType: string;
    relationshipType: string;
    confidence: number;
  }>;
}

export enum ExtractedEntityType {
  PERSON = 'PERSON',
  ORGANIZATION = 'ORGANIZATION',
  LOCATION = 'LOCATION',
  CONCEPT = 'CONCEPT',
  TECHNOLOGY = 'TECHNOLOGY',
  PROJECT = 'PROJECT',
  TASK = 'TASK',
  EMOTION = 'EMOTION',
  SKILL = 'SKILL',
  TOOL = 'TOOL',
  MEMORY_TYPE = 'MEMORY_TYPE',
  OTHER = 'OTHER',
}

export enum ExtractedRelationshipType {
  WORKS_ON = 'WORKS_ON',
  PART_OF = 'PART_OF',
  RELATED_TO = 'RELATED_TO',
  MENTIONS = 'MENTIONS',
  LOCATED_IN = 'LOCATED_IN',
  CREATED_BY = 'CREATED_BY',
  USED_BY = 'USED_BY',
  SIMILAR_TO = 'SIMILAR_TO',
  DEPENDS_ON = 'DEPENDS_ON',
  COLLABORATES_WITH = 'COLLABORATES_WITH',
  INFLUENCES = 'INFLUENCES',
  LEADS_TO = 'LEADS_TO',
  FOLLOWS_FROM = 'FOLLOWS_FROM',
  OTHER = 'OTHER',
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_ENTITY_EXTRACTION_CONFIG: EntityExtractionConfig = {
  minConfidence: 0.7,
  enableFuzzyMatching: true,
  maxEntitiesPerChunk: 50,
  maxRelationshipsPerChunk: 100,
  enableStatisticalInference: true,
  enableExternalLinking: false,
  customEntityPatterns: {
    // Custom patterns for specific domains
    TECHNOLOGY: [
      /\b[A-Z][a-z]+Net\b/g, // .Net
      /\b[A-Z][a-z]+Script\b/g, // JavaScript, TypeScript
      /\b[A-Z][a-z]*ML\b/g, // ML, HTML, XML
      /\b[A-Z][a-z]*DB\b/g, // DB, SQL, NoSQL
    ],
    CONCEPT: [
      /\b[A-Z][a-z]+[Aa]lgorithm\b/g, // Algorithm, ML Algorithm
      /\b[A-Z][a-z]+[Pp]attern\b/g, // Pattern, Design Pattern
      /\b[A-Z][a-z]+[Tt]heory\b/g, // Theory, Game Theory
    ],
  },
  relationshipRules: [
    {
      pattern: /(\w+)\s+(works?\s+on|develops?|creates?)\s+(\w+)/gi,
      sourceType: 'PERSON',
      targetType: 'PROJECT',
      relationshipType: 'WORKS_ON',
      confidence: 0.8,
    },
    {
      pattern: /(\w+)\s+(is\s+part\s+of|belongs\s+to)\s+(\w+)/gi,
      sourceType: 'PROJECT',
      targetType: 'ORGANIZATION',
      relationshipType: 'PART_OF',
      confidence: 0.9,
    },
    {
      pattern: /(\w+)\s+(uses?|employs?|utilizes?)\s+(\w+)/gi,
      sourceType: 'PROJECT',
      targetType: 'TECHNOLOGY',
      relationshipType: 'USED_BY',
      confidence: 0.7,
    },
    {
      pattern: /(\w+)\s+(located\s+in|based\s+in)\s+(\w+)/gi,
      sourceType: 'ORGANIZATION',
      targetType: 'LOCATION',
      relationshipType: 'LOCATED_IN',
      confidence: 0.9,
    },
  ],
};

// ============================================================================
// Entity Extraction Service Implementation
// ============================================================================

export class EntityExtractionService {
  private config: EntityExtractionConfig;

  constructor(config: Partial<EntityExtractionConfig> = {}) {
    this.config = { ...DEFAULT_ENTITY_EXTRACTION_CONFIG, ...config };
  }

  /**
   * Extract entities and relationships from text content
   */
  async extractFromText(
    text: string,
    sourceId: string,
    sourceType:
      | 'text'
      | 'pdf'
      | 'audio'
      | 'video'
      | 'image'
      | 'structured' = 'text'
  ): Promise<EntityExtractionResult> {
    const startTime = performance.now();
    const processingErrors: string[] = [];

    try {
      // Step 1: Extract entities using multiple methods
      const entities = await this.extractEntities(text, sourceType);

      // Step 2: Extract relationships between entities
      const relationships = await this.extractRelationships(text, entities);

      // Step 3: Apply statistical inference for additional relationships
      if (this.config.enableStatisticalInference) {
        const statisticalRelationships = this.inferStatisticalRelationships(
          text,
          entities
        );
        relationships.push(...statisticalRelationships);
      }

      // Step 4: Calculate confidence distribution
      const confidenceDistribution =
        this.calculateConfidenceDistribution(entities);

      // Step 5: Validate and filter results
      const validatedEntities = this.validateAndFilterEntities(entities);
      const validatedRelationships =
        this.validateAndFilterRelationships(relationships);

      const extractionTime = performance.now() - startTime;

      return {
        entities: validatedEntities,
        relationships: validatedRelationships,
        metadata: {
          sourceType,
          sourceId,
          extractionTime,
          totalTokens: this.estimateTokenCount(text),
          confidenceDistribution,
          processingErrors,
        },
      };
    } catch (error) {
      processingErrors.push(
        `Extraction failed: ${error instanceof Error ? error.message : String(error)}`
      );

      return {
        entities: [],
        relationships: [],
        metadata: {
          sourceType,
          sourceId,
          extractionTime: performance.now() - startTime,
          totalTokens: this.estimateTokenCount(text),
          confidenceDistribution: { high: 0, medium: 0, low: 0 },
          processingErrors,
        },
      };
    }
  }

  /**
   * Extract entities from text using multiple strategies
   */
  private async extractEntities(
    text: string,
    sourceType: string
  ): Promise<ExtractedEntity[]> {
    const entities: ExtractedEntity[] = [];

    // Strategy 1: Named Entity Recognition (NER) patterns
    const nerEntities = this.extractNamedEntities(text);

    // Strategy 2: Custom domain-specific patterns
    const customEntities = this.extractCustomEntities(text);

    // Strategy 3: Statistical entity detection
    const statisticalEntities = this.extractStatisticalEntities(text);

    // Combine and deduplicate
    entities.push(...nerEntities, ...customEntities, ...statisticalEntities);

    // Deduplicate and merge similar entities
    const deduplicated = this.deduplicateEntities(entities);

    // Enhance with metadata
    const enhanced = await this.enhanceEntityMetadata(deduplicated, text);

    return enhanced;
  }

  /**
   * Extract named entities using regex patterns
   */
  private extractNamedEntities(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Person names (Title Case words, often with middle initials)
    const personPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    let match;

    while ((match = personPattern.exec(text)) !== null) {
      const name = match[1];
      if (name.length > 2 && !this.isCommonWord(name)) {
        entities.push({
          id: `entity-${this.generateId()}`,
          name,
          type: ExtractedEntityType.PERSON,
          confidence: this.calculateNameConfidence(name),
          aliases: [name.toLowerCase()],
          extractionMethod: 'regex_ner',
          sourceText: match[0],
          position: {
            start: match.index,
            end: match.index + match[0].length,
          },
          metadata: {
            frequency: 1,
            context: this.extractContext(text, match.index, 5),
            relatedTerms: [],
            importance: this.calculateEntityImportance(
              name,
              ExtractedEntityType.PERSON
            ),
          },
        });
      }
    }

    // Organization names (often contain Inc, Corp, Ltd, University, etc.)
    const orgPatterns = [
      /\b([A-Z][a-zA-Z\s]*(?:Inc|Corp|LLC|Ltd|Corporation|Company|University|Institute|Foundation|Association|Organization))\b/g,
      /\b([A-Z][a-zA-Z\s]*(?:Systems|Solutions|Technologies|Software|Research|Development))\b/g,
    ];

    for (const pattern of orgPatterns) {
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1];
        if (name.length > 3) {
          entities.push({
            id: `entity-${this.generateId()}`,
            name,
            type: ExtractedEntityType.ORGANIZATION,
            confidence: 0.8,
            aliases: [name.toLowerCase()],
            extractionMethod: 'regex_ner',
            sourceText: match[0],
            position: {
              start: match.index,
              end: match.index + match[0].length,
            },
            metadata: {
              frequency: 1,
              context: this.extractContext(text, match.index, 5),
              relatedTerms: [],
              importance: this.calculateEntityImportance(
                name,
                ExtractedEntityType.ORGANIZATION
              ),
            },
          });
        }
      }
    }

    // Location names (cities, countries, addresses)
    const locationPatterns = [
      /\b([A-Z][a-z]+,\s*[A-Z]{2})\b/g, // City, State
      /\b([A-Z][a-z]+,\s*[A-Z][a-z]+)\b/g, // City, Country
      /\b([A-Z][a-z\s]+(?:Street|Avenue|Road|Boulevard|Drive|Way|Place|Court))\b/g, // Addresses
    ];

    for (const pattern of locationPatterns) {
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1];
        if (name.length > 3) {
          entities.push({
            id: `entity-${this.generateId()}`,
            name,
            type: ExtractedEntityType.LOCATION,
            confidence: 0.75,
            aliases: [name.toLowerCase()],
            extractionMethod: 'regex_ner',
            sourceText: match[0],
            position: {
              start: match.index,
              end: match.index + match[0].length,
            },
            metadata: {
              frequency: 1,
              context: this.extractContext(text, match.index, 5),
              relatedTerms: [],
              importance: this.calculateEntityImportance(
                name,
                ExtractedEntityType.LOCATION
              ),
            },
          });
        }
      }
    }

    return entities;
  }

  /**
   * Extract entities using custom domain patterns
   */
  private extractCustomEntities(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    for (const [entityType, patterns] of Object.entries(
      this.config.customEntityPatterns
    )) {
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const name = match[0];
          if (name.length > 2) {
            entities.push({
              id: `entity-${this.generateId()}`,
              name,
              type: entityType as ExtractedEntityType,
              confidence: 0.85, // Higher confidence for custom patterns
              aliases: [name.toLowerCase()],
              extractionMethod: 'custom_pattern',
              sourceText: match[0],
              position: {
                start: match.index,
                end: match.index + match[0].length,
              },
              metadata: {
                frequency: 1,
                context: this.extractContext(text, match.index, 5),
                relatedTerms: [],
                importance: this.calculateEntityImportance(
                  name,
                  entityType as ExtractedEntityType
                ),
              },
            });
          }
        }
      }
    }

    return entities;
  }

  /**
   * Extract entities using statistical methods
   */
  private extractStatisticalEntities(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const words = text.toLowerCase().split(/\s+/);

    // Find frequently occurring capitalized words (likely proper nouns)
    const wordCounts = new Map<
      string,
      { count: number; positions: number[] }
    >();

    words.forEach((word, index) => {
      if (word.length > 3 && /^[A-Z]/.test(word)) {
        if (!wordCounts.has(word)) {
          wordCounts.set(word, { count: 0, positions: [] });
        }
        const entry = wordCounts.get(word)!;
        entry.count++;
        entry.positions.push(index);
      }
    });

    // Convert frequent capitalized words to entities
    for (const [word, data] of wordCounts) {
      if (data.count >= 2 && data.count <= 10) {
        // Reasonable frequency range
        const entityType = this.inferEntityType(word, text);

        entities.push({
          id: `entity-${this.generateId()}`,
          name: word,
          type: entityType,
          confidence: Math.min(0.9, 0.5 + data.count * 0.1), // Confidence based on frequency
          aliases: [word.toLowerCase()],
          extractionMethod: 'statistical',
          sourceText: word,
          metadata: {
            frequency: data.count,
            context: this.extractContext(text, data.positions[0] * 5, 3),
            relatedTerms: this.findRelatedTerms(word, words, data.positions),
            importance: this.calculateEntityImportance(word, entityType),
          },
        });
      }
    }

    return entities;
  }

  /**
   * Extract relationships between entities
   */
  private async extractRelationships(
    text: string,
    entities: ExtractedEntity[]
  ): Promise<ExtractedRelationship[]> {
    const relationships: ExtractedRelationship[] = [];

    // Method 1: Pattern-based relationship extraction
    const patternRelationships = this.extractPatternRelationships(
      text,
      entities
    );

    // Method 2: Co-occurrence based relationships
    const cooccurrenceRelationships = this.extractCooccurrenceRelationships(
      text,
      entities
    );

    // Method 3: Rule-based relationships
    const ruleRelationships = this.extractRuleRelationships(text, entities);

    relationships.push(
      ...patternRelationships,
      ...cooccurrenceRelationships,
      ...ruleRelationships
    );

    return relationships;
  }

  /**
   * Extract relationships using regex patterns
   */
  private extractPatternRelationships(
    text: string,
    entities: ExtractedEntity[]
  ): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];

    // Find entity pairs in close proximity
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];

        // Check if entities appear close together in text
        const entity1Positions = this.findEntityPositions(text, entity1.name);
        const entity2Positions = this.findEntityPositions(text, entity2.name);

        for (const pos1 of entity1Positions) {
          for (const pos2 of entity2Positions) {
            const distance = Math.abs(pos1 - pos2);
            if (distance <= 50) {
              // Within 50 characters
              const relationship = this.inferRelationshipFromContext(
                text,
                pos1,
                pos2,
                entity1,
                entity2
              );

              if (relationship) {
                relationships.push(relationship);
              }
            }
          }
        }
      }
    }

    return relationships;
  }

  /**
   * Extract relationships using co-occurrence analysis
   */
  private extractCooccurrenceRelationships(
    text: string,
    entities: ExtractedEntity[]
  ): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];

    // Calculate co-occurrence statistics
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];

        const cooccurrenceCount = this.countCooccurrences(
          text,
          entity1.name,
          entity2.name
        );

        if (cooccurrenceCount >= 2) {
          // Calculate mutual information as relationship strength
          const mutualInformation = this.calculateMutualInformation(
            text,
            entity1.name,
            entity2.name
          );

          relationships.push({
            id: `rel-${this.generateId()}`,
            sourceEntityId: entity1.id,
            targetEntityId: entity2.id,
            type: ExtractedRelationshipType.RELATED_TO,
            confidence: Math.min(0.9, 0.5 + cooccurrenceCount * 0.1),
            strength: Math.min(1.0, mutualInformation),
            evidence: {
              sourceText: this.extractCooccurrenceContext(
                text,
                entity1.name,
                entity2.name
              ),
              cooccurrenceCount,
              contextWindow: 20,
              extractionMethod: 'cooccurrence',
              mutualInformation,
            },
            metadata: {
              isDirectional: false,
              certainty: 0.7,
              frequency: cooccurrenceCount,
            },
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Extract relationships using predefined rules
   */
  private extractRuleRelationships(
    text: string,
    entities: ExtractedEntity[]
  ): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];

    for (const rule of this.config.relationshipRules) {
      const matches = [...text.matchAll(rule.pattern)];

      for (const match of matches) {
        // Extract entities from match groups
        const sourceMatch = match[1];
        const targetMatch = match[3];

        const sourceEntity = entities.find(
          (e) =>
            e.name.toLowerCase().includes(sourceMatch.toLowerCase()) ||
            sourceMatch.toLowerCase().includes(e.name.toLowerCase())
        );

        const targetEntity = entities.find(
          (e) =>
            e.name.toLowerCase().includes(targetMatch.toLowerCase()) ||
            targetMatch.toLowerCase().includes(e.name.toLowerCase())
        );

        if (sourceEntity && targetEntity) {
          relationships.push({
            id: `rel-${this.generateId()}`,
            sourceEntityId: sourceEntity.id,
            targetEntityId: targetEntity.id,
            type: rule.relationshipType as ExtractedRelationshipType,
            confidence: rule.confidence,
            strength: 0.8, // High strength for rule-based relationships
            evidence: {
              sourceText: match[0],
              cooccurrenceCount: 1,
              contextWindow: 10,
              extractionMethod: 'rule_based',
            },
            metadata: {
              isDirectional: true,
              certainty: rule.confidence,
              frequency: 1,
            },
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Infer statistical relationships using co-occurrence analysis
   */
  private inferStatisticalRelationships(
    text: string,
    entities: ExtractedEntity[]
  ): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];

    // Calculate pointwise mutual information (PMI) for entity pairs
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];

        const pmi = this.calculatePMI(text, entity1.name, entity2.name);

        if (pmi > 0.5) {
          // Significant positive association
          relationships.push({
            id: `rel-${this.generateId()}`,
            sourceEntityId: entity1.id,
            targetEntityId: entity2.id,
            type: ExtractedRelationshipType.RELATED_TO,
            confidence: Math.min(0.9, pmi),
            strength: pmi,
            evidence: {
              sourceText: this.extractPMIContext(
                text,
                entity1.name,
                entity2.name
              ),
              cooccurrenceCount: this.countCooccurrences(
                text,
                entity1.name,
                entity2.name
              ),
              contextWindow: 15,
              extractionMethod: 'statistical_pmi',
              mutualInformation: pmi,
            },
            metadata: {
              isDirectional: false,
              certainty: pmi,
              frequency: 1,
            },
          });
        }
      }
    }

    return relationships;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'the',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'up',
      'about',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'between',
      'among',
      'within',
      'without',
      'against',
      'under',
      'over',
      'throughout',
      'despite',
      'towards',
      'upon',
      'concerning',
      'regarding',
      'considering',
      'including',
      'following',
      'according',
      'depending',
    ]);
    return commonWords.has(word.toLowerCase());
  }

  private calculateNameConfidence(name: string): number {
    // Longer names with mixed case are more likely to be proper nouns
    const lengthBonus = Math.min(0.3, name.length * 0.05);
    const caseBonus = /[A-Z][a-z]*\s+[A-Z]/.test(name) ? 0.2 : 0;
    return Math.min(0.9, 0.6 + lengthBonus + caseBonus);
  }

  private extractContext(
    text: string,
    position: number,
    windowSize: number
  ): string[] {
    const words = text.split(/\s+/);
    const wordIndex = Math.floor(position / 5); // Approximate word position
    const start = Math.max(0, wordIndex - windowSize);
    const end = Math.min(words.length, wordIndex + windowSize + 1);
    return words.slice(start, end);
  }

  private calculateEntityImportance(
    entityName: string,
    entityType: ExtractedEntityType
  ): number {
    // Base importance by entity type
    const typeImportance = {
      [ExtractedEntityType.PERSON]: 0.8,
      [ExtractedEntityType.ORGANIZATION]: 0.7,
      [ExtractedEntityType.LOCATION]: 0.6,
      [ExtractedEntityType.TECHNOLOGY]: 0.9,
      [ExtractedEntityType.CONCEPT]: 0.7,
      [ExtractedEntityType.PROJECT]: 0.8,
      [ExtractedEntityType.TASK]: 0.5,
      [ExtractedEntityType.EMOTION]: 0.6,
      [ExtractedEntityType.SKILL]: 0.7,
      [ExtractedEntityType.TOOL]: 0.8,
      [ExtractedEntityType.MEMORY_TYPE]: 0.5,
      [ExtractedEntityType.OTHER]: 0.4,
    };

    // Boost for technical terms and specific patterns
    let boost = 0;
    if (
      entityName.includes('Neural') ||
      entityName.includes('Machine') ||
      entityName.includes('Learning')
    ) {
      boost += 0.2;
    }
    if (entityName.length > 10) {
      boost += 0.1;
    }

    return Math.min(1.0, typeImportance[entityType] + boost);
  }

  private inferEntityType(
    entityName: string,
    text: string
  ): ExtractedEntityType {
    const lowerName = entityName.toLowerCase();

    // Technology indicators
    if (
      lowerName.includes('neural') ||
      lowerName.includes('machine') ||
      lowerName.includes('learning') ||
      lowerName.includes('algorithm') ||
      lowerName.includes('model') ||
      lowerName.includes('framework')
    ) {
      return ExtractedEntityType.TECHNOLOGY;
    }

    // Project indicators
    if (
      lowerName.includes('project') ||
      lowerName.includes('system') ||
      lowerName.includes('platform')
    ) {
      return ExtractedEntityType.PROJECT;
    }

    // Concept indicators
    if (
      lowerName.includes('theory') ||
      lowerName.includes('method') ||
      lowerName.includes('approach') ||
      lowerName.includes('pattern') ||
      lowerName.includes('principle')
    ) {
      return ExtractedEntityType.CONCEPT;
    }

    // Default to OTHER for unknown types
    return ExtractedEntityType.OTHER;
  }

  private findEntityPositions(text: string, entityName: string): number[] {
    const positions: number[] = [];
    const regex = new RegExp(`\\b${entityName}\\b`, 'gi');
    let match;

    while ((match = regex.exec(text)) !== null) {
      positions.push(match.index);
    }

    return positions;
  }

  private inferRelationshipFromContext(
    text: string,
    pos1: number,
    pos2: number,
    entity1: ExtractedEntity,
    entity2: ExtractedEntity
  ): ExtractedRelationship | null {
    const start = Math.min(pos1, pos2);
    const end = Math.max(pos1, pos2);
    const context = text.substring(
      Math.max(0, start - 20),
      Math.min(text.length, end + 20)
    );

    // Simple relationship inference based on context words
    const contextLower = context.toLowerCase();

    if (
      contextLower.includes('works on') ||
      contextLower.includes('develops') ||
      contextLower.includes('creates')
    ) {
      return {
        id: `rel-${this.generateId()}`,
        sourceEntityId: entity1.id,
        targetEntityId: entity2.id,
        type: ExtractedRelationshipType.WORKS_ON,
        confidence: 0.8,
        strength: 0.7,
        evidence: {
          sourceText: context,
          cooccurrenceCount: 1,
          contextWindow: 40,
          extractionMethod: 'context_inference',
        },
        metadata: {
          isDirectional: true,
          certainty: 0.7,
          frequency: 1,
        },
      };
    }

    if (
      contextLower.includes('part of') ||
      contextLower.includes('belongs to')
    ) {
      return {
        id: `rel-${this.generateId()}`,
        sourceEntityId: entity1.id,
        targetEntityId: entity2.id,
        type: ExtractedRelationshipType.PART_OF,
        confidence: 0.85,
        strength: 0.8,
        evidence: {
          sourceText: context,
          cooccurrenceCount: 1,
          contextWindow: 40,
          extractionMethod: 'context_inference',
        },
        metadata: {
          isDirectional: true,
          certainty: 0.8,
          frequency: 1,
        },
      };
    }

    return null;
  }

  private countCooccurrences(
    text: string,
    term1: string,
    term2: string
  ): number {
    const regex1 = new RegExp(`\\b${term1}\\b`, 'gi');
    const regex2 = new RegExp(`\\b${term2}\\b`, 'gi');

    let count = 0;
    const matches1 = [...text.matchAll(regex1)];
    const matches2 = [...text.matchAll(regex2)];

    for (const match1 of matches1) {
      for (const match2 of matches2) {
        if (Math.abs(match1.index - match2.index) <= 50) {
          // Within 50 characters
          count++;
        }
      }
    }

    return count;
  }

  private calculateMutualInformation(
    text: string,
    term1: string,
    term2: string
  ): number {
    const words = text.toLowerCase().split(/\s+/);
    const totalWords = words.length;

    const count1 = words.filter((w) => w.includes(term1.toLowerCase())).length;
    const count2 = words.filter((w) => w.includes(term2.toLowerCase())).length;
    const countBoth = this.countCooccurrences(text, term1, term2);

    if (count1 === 0 || count2 === 0 || countBoth === 0) return 0;

    // Simplified mutual information calculation
    const p1 = count1 / totalWords;
    const p2 = count2 / totalWords;
    const pBoth = countBoth / totalWords;

    const mi = Math.log2(pBoth / (p1 * p2));
    return Math.max(0, Math.min(1, mi / 5)); // Normalize to 0-1 range
  }

  private calculatePMI(text: string, term1: string, term2: string): number {
    // Pointwise Mutual Information
    const words = text.toLowerCase().split(/\s+/);
    const totalBigrams = words.length - 1;

    const count1 = words.filter((w) => w === term1.toLowerCase()).length;
    const count2 = words.filter((w) => w === term2.toLowerCase()).length;

    // Count co-occurrences in adjacent words
    let countAdjacent = 0;
    for (let i = 0; i < words.length - 1; i++) {
      if (
        (words[i] === term1.toLowerCase() &&
          words[i + 1] === term2.toLowerCase()) ||
        (words[i] === term2.toLowerCase() &&
          words[i + 1] === term1.toLowerCase())
      ) {
        countAdjacent++;
      }
    }

    if (count1 === 0 || count2 === 0 || countAdjacent === 0) return 0;

    const p1 = count1 / words.length;
    const p2 = count2 / words.length;
    const pAdjacent = countAdjacent / totalBigrams;

    const pmi = Math.log2(pAdjacent / (p1 * p2));
    return Math.max(0, Math.min(1, pmi / 10)); // Normalize
  }

  private extractCooccurrenceContext(
    text: string,
    term1: string,
    term2: string
  ): string {
    const regex1 = new RegExp(`\\b${term1}\\b`, 'gi');
    const regex2 = new RegExp(`\\b${term2}\\b`, 'gi');

    const matches1 = [...text.matchAll(regex1)];
    const matches2 = [...text.matchAll(regex2)];

    if (matches1.length === 0 || matches2.length === 0) return '';

    // Find closest pair
    let closestContext = '';
    let minDistance = Infinity;

    for (const match1 of matches1) {
      for (const match2 of matches2) {
        const distance = Math.abs(match1.index - match2.index);
        if (distance < minDistance && distance <= 50) {
          minDistance = distance;
          const start = Math.max(0, Math.min(match1.index, match2.index) - 20);
          const end = Math.min(
            text.length,
            Math.max(match1.index, match2.index) + 20
          );
          closestContext = text.substring(start, end);
        }
      }
    }

    return closestContext;
  }

  private extractPMIContext(
    text: string,
    term1: string,
    term2: string
  ): string {
    const words = text.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length - 1; i++) {
      if (
        (words[i] === term1.toLowerCase() &&
          words[i + 1] === term2.toLowerCase()) ||
        (words[i] === term2.toLowerCase() &&
          words[i + 1] === term1.toLowerCase())
      ) {
        const start = Math.max(0, i - 5);
        const end = Math.min(words.length, i + 7);
        return words.slice(start, end).join(' ');
      }
    }

    return '';
  }

  private findRelatedTerms(
    entityName: string,
    words: string[],
    positions: number[]
  ): string[] {
    const relatedTerms = new Set<string>();
    const entityLower = entityName.toLowerCase();

    for (const pos of positions) {
      // Look at words around entity occurrences
      const start = Math.max(0, pos - 3);
      const end = Math.min(words.length, pos + 4);

      for (let i = start; i < end; i++) {
        const word = words[i];
        if (
          word.length > 3 &&
          word !== entityLower &&
          !this.isCommonWord(word)
        ) {
          relatedTerms.add(word);
        }
      }
    }

    return Array.from(relatedTerms).slice(0, 5); // Limit to top 5
  }

  private deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const unique = new Map<string, ExtractedEntity>();

    for (const entity of entities) {
      const key = `${entity.name.toLowerCase()}-${entity.type}`;

      if (unique.has(key)) {
        // Merge with existing entity
        const existing = unique.get(key)!;
        existing.confidence = Math.max(existing.confidence, entity.confidence);
        existing.metadata.frequency += entity.metadata.frequency;
        existing.aliases = [
          ...new Set([...existing.aliases, ...entity.aliases]),
        ];
      } else {
        unique.set(key, entity);
      }
    }

    return Array.from(unique.values());
  }

  private validateAndFilterEntities(
    entities: ExtractedEntity[]
  ): ExtractedEntity[] {
    return entities
      .filter((e) => e.confidence >= this.config.minConfidence)
      .filter((e) => e.name.length >= 2)
      .slice(0, this.config.maxEntitiesPerChunk);
  }

  private validateAndFilterRelationships(
    relationships: ExtractedRelationship[]
  ): ExtractedRelationship[] {
    return relationships
      .filter((r) => r.confidence >= 0.5)
      .filter((r) => r.strength >= 0.3)
      .slice(0, this.config.maxRelationshipsPerChunk);
  }

  private calculateConfidenceDistribution(entities: ExtractedEntity[]) {
    const distribution = { high: 0, medium: 0, low: 0 };

    for (const entity of entities) {
      if (entity.confidence >= 0.8) {
        distribution.high++;
      } else if (entity.confidence >= 0.5) {
        distribution.medium++;
      } else {
        distribution.low++;
      }
    }

    return distribution;
  }

  private estimateTokenCount(text: string): number {
    // Rough token estimation (words + punctuation)
    return text.split(/\s+/).length + text.split(/[.,!?;:]/).length - 1;
  }

  private async enhanceEntityMetadata(
    entities: ExtractedEntity[],
    text: string
  ): Promise<ExtractedEntity[]> {
    // Enhance entities with additional context and metadata
    return entities.map((entity) => ({
      ...entity,
      metadata: {
        ...entity.metadata,
        // Add more sophisticated importance calculation
        importance: this.calculateEnhancedImportance(entity, text),
      },
    }));
  }

  private calculateEnhancedImportance(
    entity: ExtractedEntity,
    text: string
  ): number {
    let importance = entity.metadata.importance;

    // Boost for entities that appear in titles or headings
    if (
      text.includes(`\n${entity.name}\n`) ||
      text.includes(`**${entity.name}**`)
    ) {
      importance += 0.1;
    }

    // Boost for entities with many related terms
    if (entity.metadata.relatedTerms.length > 3) {
      importance += 0.05;
    }

    // Boost for entities that appear frequently
    if (entity.metadata.frequency > 3) {
      importance += 0.05;
    }

    return Math.min(1.0, importance);
  }
}
