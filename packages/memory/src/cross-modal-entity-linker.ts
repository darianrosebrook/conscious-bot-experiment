/**
 * Cross-Modal Entity Linker
 *
 * Unifies entity representations across different memory types and sources.
 * Implements entity deduplication, cross-modal linking, and unified entity profiles.
 * Enhanced with obsidian-rag patterns for comprehensive entity understanding.
 *
 * Features:
 * - Cross-modal entity merging and deduplication
 * - Unified entity representation with confidence scoring
 * - Cross-reference tracking between memory types
 * - Entity evolution and relationship tracking
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface CrossModalEntity {
  id: string;
  canonicalName: string;
  aliases: string[];
  entityType:
    | 'person'
    | 'organization'
    | 'location'
    | 'technology'
    | 'concept'
    | 'project'
    | 'tool'
    | 'framework';

  // Unified representation
  description?: string;
  confidence: number;
  importance: number;

  // Cross-modal sources
  sources: Array<{
    memoryType: 'episodic' | 'semantic' | 'procedural' | 'emotional' | 'social';
    sourceId: string;
    extractionMethod: string;
    confidence: number;
    timestamp: number;
    content?: string;
  }>;

  // Cross-modal relationships
  relatedEntities: Array<{
    entityId: string;
    relationshipType: string;
    strength: number;
    confidence: number;
  }>;

  // Evolution tracking
  evolution: Array<{
    timestamp: number;
    changeType: 'merge' | 'split' | 'update' | 'confidence_boost';
    description: string;
    previousState?: Partial<CrossModalEntity>;
  }>;

  // Metadata
  metadata: {
    firstSeen: number;
    lastUpdated: number;
    totalReferences: number;
    crossModalLinks: number;
    decayProfile?: {
      baseDecayRate: number;
      importanceProtection: number;
      accessPatterns: Array<{ timestamp: number; accessType: string }>;
    };
  };
}

export interface EntityLinkingConfig {
  similarityThreshold: number;
  confidenceThreshold: number;
  maxAliases: number;
  enableEvolutionTracking: boolean;
  enableCrossModalMerging: boolean;
  enableAutomaticDeduplication: boolean;
}

export interface EntityMergeCandidate {
  sourceEntity: CrossModalEntity;
  targetEntity: CrossModalEntity;
  similarityScore: number;
  mergeReason: string;
  confidence: number;
}

export interface EntityLinkingResult {
  linkedEntities: CrossModalEntity[];
  mergedEntities: number;
  newEntities: number;
  conflicts: Array<{
    entity1: CrossModalEntity;
    entity2: CrossModalEntity;
    conflictType: string;
    resolution?: string;
  }>;
  processingTime: number;
}

// ============================================================================
// Cross-Modal Entity Linker Implementation
// ============================================================================

export class CrossModalEntityLinker {
  private entities: Map<string, CrossModalEntity> = new Map();
  private config: Required<EntityLinkingConfig>;

  private readonly DEFAULT_CONFIG: Required<EntityLinkingConfig> = {
    similarityThreshold: 0.8,
    confidenceThreshold: 0.7,
    maxAliases: 10,
    enableEvolutionTracking: true,
    enableCrossModalMerging: true,
    enableAutomaticDeduplication: true,
  };

  constructor(config: Partial<EntityLinkingConfig> = {}) {
    this.config = { ...this.DEFAULT_CONFIG, ...config };
  }

  /**
   * Link entities from multiple sources into unified representations
   */
  async linkEntities(
    entitySources: Array<{
      entities: Array<{
        name: string;
        type: string;
        confidence: number;
        sourceMemory: {
          type: 'episodic' | 'semantic' | 'procedural' | 'emotional' | 'social';
          id: string;
          content?: string;
        };
        metadata?: Record<string, any>;
      }>;
      sourceType: 'text' | 'audio' | 'video' | 'image' | 'structured';
      timestamp: number;
    }>
  ): Promise<EntityLinkingResult> {
    const startTime = performance.now();

    console.log(`🔗 Linking entities from ${entitySources.length} sources`);

    let newEntities = 0;
    let mergedEntities = 0;
    const conflicts: EntityLinkingResult['conflicts'] = [];

    // Process each source
    for (const source of entitySources) {
      for (const entity of source.entities) {
        const existingEntity = this.findSimilarEntity(entity);

        if (
          existingEntity &&
          this.shouldMergeEntities(entity, existingEntity)
        ) {
          // Merge with existing entity
          await this.mergeEntity(existingEntity, entity, source);
          mergedEntities++;
        } else if (existingEntity) {
          // Record conflict for manual resolution
          conflicts.push({
            entity1: existingEntity,
            entity2: this.createEntityFromSource(entity, source),
            conflictType: 'similar_but_not_merged',
          });
        } else {
          // Create new entity
          const newEntity = this.createEntityFromSource(entity, source);
          this.entities.set(newEntity.id, newEntity);
          newEntities++;
        }
      }
    }

    // Apply automatic deduplication if enabled
    if (this.config.enableAutomaticDeduplication) {
      const dedupResult = await this.performAutomaticDeduplication();
      mergedEntities += dedupResult.mergedCount;
      conflicts.push(...dedupResult.conflicts);
    }

    // Update cross-modal relationships
    await this.updateCrossModalRelationships();

    const processingTime = performance.now() - startTime;
    console.log(
      `✅ Entity linking completed: ${newEntities} new, ${mergedEntities} merged in ${processingTime}ms`
    );

    return {
      linkedEntities: Array.from(this.entities.values()),
      mergedEntities,
      newEntities,
      conflicts,
      processingTime,
    };
  }

  /**
   * Find entity similar to the given one
   */
  private findSimilarEntity(newEntity: any): CrossModalEntity | null {
    for (const existing of this.entities.values()) {
      const similarity = this.calculateEntitySimilarity(newEntity, existing);
      if (similarity >= this.config.similarityThreshold) {
        return existing;
      }
    }
    return null;
  }

  /**
   * Calculate similarity between two entities
   */
  private calculateEntitySimilarity(
    entity1: any,
    entity2: CrossModalEntity
  ): number {
    let similarity = 0;
    let factors = 0;

    // Name similarity (40% weight)
    const nameSimilarity = this.calculateStringSimilarity(
      entity1.name,
      entity2.canonicalName
    );
    similarity += nameSimilarity * 0.4;
    factors++;

    // Alias similarity (30% weight)
    const aliasMatches = entity2.aliases.some(
      (alias) => this.calculateStringSimilarity(entity1.name, alias) > 0.8
    );
    if (aliasMatches) {
      similarity += 0.3;
      factors++;
    }

    // Type compatibility (20% weight)
    if (entity1.type === entity2.entityType) {
      similarity += 0.2;
      factors++;
    }

    // Confidence correlation (10% weight)
    const confidenceDiff = Math.abs(entity1.confidence - entity2.confidence);
    const confidenceSimilarity = Math.max(0, 1 - confidenceDiff);
    similarity += confidenceSimilarity * 0.1;
    factors++;

    return factors > 0 ? similarity / factors : 0;
  }

  /**
   * Check if entities should be merged
   */
  private shouldMergeEntities(
    newEntity: any,
    existingEntity: CrossModalEntity
  ): boolean {
    if (!this.config.enableCrossModalMerging) return false;

    // Don't merge if confidence is too different
    const confidenceDiff = Math.abs(
      newEntity.confidence - existingEntity.confidence
    );
    if (confidenceDiff > 0.3) return false;

    // Don't merge if types are incompatible
    if (newEntity.type !== existingEntity.entityType) return false;

    return true;
  }

  /**
   * Merge entity into existing entity
   */
  private async mergeEntity(
    existingEntity: CrossModalEntity,
    newEntity: any,
    source: any
  ): Promise<void> {
    const originalState = { ...existingEntity };

    // Update canonical name if new one has higher confidence
    if (newEntity.confidence > existingEntity.confidence) {
      existingEntity.canonicalName = newEntity.name;
    }

    // Add aliases
    if (!existingEntity.aliases.includes(newEntity.name)) {
      existingEntity.aliases.push(newEntity.name);
      existingEntity.aliases = existingEntity.aliases.slice(
        0,
        this.config.maxAliases
      );
    }

    // Add source
    existingEntity.sources.push({
      memoryType: source.entities[0]?.sourceMemory?.type || 'semantic',
      sourceId: source.entities[0]?.sourceMemory?.id || 'unknown',
      extractionMethod: 'cross_modal_linker',
      confidence: newEntity.confidence,
      timestamp: source.timestamp,
      content: source.entities[0]?.sourceMemory?.content,
    });

    // Update confidence (weighted average)
    const totalSources = existingEntity.sources.length;
    const newConfidence =
      (existingEntity.confidence * (totalSources - 1) + newEntity.confidence) /
      totalSources;
    existingEntity.confidence = newConfidence;

    // Update metadata
    existingEntity.metadata.totalReferences++;
    existingEntity.metadata.lastUpdated = Date.now();

    // Track evolution if enabled
    if (this.config.enableEvolutionTracking) {
      existingEntity.evolution.push({
        timestamp: Date.now(),
        changeType: 'merge',
        description: `Merged entity from ${source.sourceType} source`,
        previousState: originalState,
      });
    }
  }

  /**
   * Create new entity from source data
   */
  private createEntityFromSource(entity: any, source: any): CrossModalEntity {
    const id = `cross_modal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      id,
      canonicalName: entity.name,
      aliases: [entity.name],
      entityType: entity.type as any,
      confidence: entity.confidence,
      importance: this.calculateEntityImportance(entity, source),
      sources: [
        {
          memoryType: entity.sourceMemory?.type || 'semantic',
          sourceId: entity.sourceMemory?.id || 'unknown',
          extractionMethod: 'cross_modal_linker',
          confidence: entity.confidence,
          timestamp: source.timestamp,
          content: entity.sourceMemory?.content,
        },
      ],
      relatedEntities: [],
      evolution: [],
      metadata: {
        firstSeen: Date.now(),
        lastUpdated: Date.now(),
        totalReferences: 1,
        crossModalLinks: 0,
      },
    };
  }

  /**
   * Calculate entity importance based on context
   */
  private calculateEntityImportance(entity: any, source: any): number {
    let importance = 0.5; // Base importance

    // Boost for high confidence entities
    importance += entity.confidence * 0.2;

    // Boost for entities with rich context
    if (entity.metadata?.context) {
      importance += 0.1;
    }

    // Boost for entities from multiple sources
    if (source.entities?.length > 1) {
      importance += 0.1;
    }

    return Math.min(1, importance);
  }

  /**
   * Perform automatic deduplication of similar entities
   */
  private async performAutomaticDeduplication(): Promise<{
    mergedCount: number;
    conflicts: EntityLinkingResult['conflicts'];
  }> {
    const entities = Array.from(this.entities.values());
    let mergedCount = 0;
    const conflicts: EntityLinkingResult['conflicts'] = [];

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];

        const similarity = this.calculateEntitySimilarity(
          {
            name: entity1.canonicalName,
            type: entity1.entityType,
            confidence: entity1.confidence,
          },
          entity2
        );

        if (similarity >= this.config.similarityThreshold) {
          if (
            this.shouldMergeEntities(
              {
                name: entity1.canonicalName,
                type: entity1.entityType,
                confidence: entity1.confidence,
              },
              entity2
            )
          ) {
            // Merge entity2 into entity1
            await this.mergeEntity(
              entity1,
              {
                name: entity2.canonicalName,
                type: entity2.entityType,
                confidence: entity2.confidence,
              },
              {
                entities: [
                  {
                    sourceMemory: { type: 'semantic', id: entity2.id },
                  },
                ],
                timestamp: Date.now(),
              }
            );

            // Remove entity2
            this.entities.delete(entity2.id);
            mergedCount++;
          } else {
            conflicts.push({
              entity1,
              entity2,
              conflictType: 'similar_entities_not_merged',
            });
          }
        }
      }
    }

    return { mergedCount, conflicts };
  }

  /**
   * Update cross-modal relationships between entities
   */
  private async updateCrossModalRelationships(): Promise<void> {
    const entities = Array.from(this.entities.values());

    for (const entity of entities) {
      // Find related entities based on shared sources or similar contexts
      const related = entities
        .filter((e) => e.id !== entity.id)
        .map((e) => ({
          entityId: e.id,
          relationshipType: this.inferRelationshipType(entity, e),
          strength: this.calculateRelationshipStrength(entity, e),
          confidence: this.calculateRelationshipConfidence(entity, e),
        }))
        .filter((r) => r.strength > 0.3 && r.confidence > 0.5)
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 10); // Limit to top 10 relationships

      entity.relatedEntities = related;
      entity.metadata.crossModalLinks = related.length;
    }
  }

  /**
   * Infer relationship type between entities
   */
  private inferRelationshipType(
    entity1: CrossModalEntity,
    entity2: CrossModalEntity
  ): string {
    // Check if entities appear together in same sources
    const sharedSources = entity1.sources.filter((s1) =>
      entity2.sources.some(
        (s2) => s1.sourceId === s2.sourceId && s1.memoryType === s2.memoryType
      )
    );

    if (sharedSources.length > 0) {
      return 'co_occurs_with';
    }

    // Check entity types for semantic relationships
    if (
      entity1.entityType === 'person' &&
      entity2.entityType === 'organization'
    ) {
      return 'works_for';
    }

    if (
      entity1.entityType === 'technology' &&
      entity2.entityType === 'project'
    ) {
      return 'used_in';
    }

    return 'related_to';
  }

  /**
   * Calculate relationship strength
   */
  private calculateRelationshipStrength(
    entity1: CrossModalEntity,
    entity2: CrossModalEntity
  ): number {
    // Base strength from shared sources
    const sharedSources = entity1.sources.filter((s1) =>
      entity2.sources.some(
        (s2) => s1.sourceId === s2.sourceId && s1.memoryType === s2.memoryType
      )
    );

    let strength = sharedSources.length * 0.3;

    // Boost for similar importance
    const importanceSimilarity =
      1 - Math.abs(entity1.importance - entity2.importance);
    strength += importanceSimilarity * 0.3;

    // Boost for similar confidence
    const confidenceSimilarity =
      1 - Math.abs(entity1.confidence - entity2.confidence);
    strength += confidenceSimilarity * 0.2;

    return Math.min(1, strength);
  }

  /**
   * Calculate relationship confidence
   */
  private calculateRelationshipConfidence(
    entity1: CrossModalEntity,
    entity2: CrossModalEntity
  ): number {
    // Confidence based on source overlap and entity confidence
    const sharedSources = entity1.sources.filter((s1) =>
      entity2.sources.some(
        (s2) => s1.sourceId === s2.sourceId && s1.memoryType === s2.memoryType
      )
    );

    const sourceConfidence =
      sharedSources.length > 0
        ? sharedSources.reduce((sum, s) => sum + s.confidence, 0) /
          sharedSources.length
        : 0.5;

    const entityConfidence = (entity1.confidence + entity2.confidence) / 2;

    return (sourceConfidence + entityConfidence) / 2;
  }

  /**
   * Get unified entity by ID
   */
  getEntity(id: string): CrossModalEntity | null {
    return this.entities.get(id) || null;
  }

  /**
   * Search for entities by name or alias
   */
  searchEntities(query: string, limit: number = 10): CrossModalEntity[] {
    const searchTerm = query.toLowerCase();

    return Array.from(this.entities.values())
      .filter(
        (entity) =>
          entity.canonicalName.toLowerCase().includes(searchTerm) ||
          entity.aliases.some((alias) =>
            alias.toLowerCase().includes(searchTerm)
          )
      )
      .sort((a, b) => {
        // Sort by relevance (name match gets priority)
        const aNameMatch = a.canonicalName.toLowerCase().includes(searchTerm)
          ? 1
          : 0;
        const bNameMatch = b.canonicalName.toLowerCase().includes(searchTerm)
          ? 1
          : 0;

        if (aNameMatch !== bNameMatch) {
          return bNameMatch - aNameMatch;
        }

        // Then by confidence
        return b.confidence - a.confidence;
      })
      .slice(0, limit);
  }

  /**
   * Get entities by type
   */
  getEntitiesByType(type: string, limit?: number): CrossModalEntity[] {
    return Array.from(this.entities.values())
      .filter((entity) => entity.entityType === type)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  /**
   * Get entity statistics
   */
  getStats(): {
    totalEntities: number;
    entitiesByType: Record<string, number>;
    averageConfidence: number;
    crossModalLinks: number;
    recentActivity: number;
  } {
    const entities = Array.from(this.entities.values());
    const totalEntities = entities.length;

    const entitiesByType = entities.reduce(
      (acc, entity) => {
        acc[entity.entityType] = (acc[entity.entityType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const averageConfidence =
      totalEntities > 0
        ? entities.reduce((sum, e) => sum + e.confidence, 0) / totalEntities
        : 0;

    const crossModalLinks = entities.reduce(
      (sum, e) => sum + e.metadata.crossModalLinks,
      0
    );

    const recentActivity = entities.filter(
      (e) => Date.now() - e.metadata.lastUpdated < 24 * 60 * 60 * 1000 // Last 24 hours
    ).length;

    return {
      totalEntities,
      entitiesByType,
      averageConfidence,
      crossModalLinks,
      recentActivity,
    };
  }

  /**
   * Clear all entities (for testing or reset)
   */
  clear(): void {
    this.entities.clear();
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private calculateStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    if (s1 === s2) return 1;

    // Simple Levenshtein distance approximation
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}

