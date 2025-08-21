/**
 * Memory consolidation system for episodic memories.
 *
 * Integrates new episodic memories with existing knowledge and performs
 * sleep-like consolidation processes to strengthen important memories.
 *
 * @author @darianrosebrook
 */

import { Experience, ExperienceType } from '../types';
import { SalienceScorer } from './salience-scorer';

/**
 * Consolidation parameters
 */
export interface ConsolidationParameters {
  consolidationStrength: number; // 0-1, how much to strengthen memories
  patternDetectionThreshold: number; // Threshold for pattern detection
  semanticIntegrationWeight: number; // Weight for semantic integration
  memoryStrengtheningFactor: number; // Factor for memory strengthening
  compressionThreshold: number; // Threshold for memory compression
}

/**
 * Consolidation result
 */
export interface ConsolidationResult {
  strengthenedMemories: string[];
  newPatterns: MemoryPattern[];
  semanticUpdates: SemanticUpdate[];
  compressedMemories: string[];
  consolidationMetrics: ConsolidationMetrics;
}

/**
 * Memory pattern identified during consolidation
 */
export interface MemoryPattern {
  id: string;
  patternType: PatternType;
  description: string;
  confidence: number;
  supportingMemories: string[];
  frequency: number;
  firstOccurrence: number;
  lastOccurrence: number;
}

export enum PatternType {
  BEHAVIORAL = 'behavioral',
  TEMPORAL = 'temporal',
  SPATIAL = 'spatial',
  SOCIAL = 'social',
  EMOTIONAL = 'emotional',
  CAUSAL = 'causal',
}

/**
 * Semantic knowledge update from consolidation
 */
export interface SemanticUpdate {
  entityId?: string;
  relationshipType: string;
  targetId?: string;
  confidence: number;
  evidence: string[];
  updateType: 'add' | 'modify' | 'remove';
}

/**
 * Consolidation metrics
 */
export interface ConsolidationMetrics {
  memoriesProcessed: number;
  patternsIdentified: number;
  semanticUpdates: number;
  memoriesCompressed: number;
  averageStrengthening: number;
  consolidationTime: number;
}

/**
 * Memory consolidation system
 */
export class MemoryConsolidation {
  private salienceScorer: SalienceScorer;
  private config: ConsolidationParameters;

  constructor(
    salienceScorer: SalienceScorer,
    config: Partial<ConsolidationParameters> = {}
  ) {
    this.salienceScorer = salienceScorer;
    this.config = {
      consolidationStrength: 0.3,
      patternDetectionThreshold: 0.6,
      semanticIntegrationWeight: 0.4,
      memoryStrengtheningFactor: 0.2,
      compressionThreshold: 0.3,
      ...config,
    };
  }

  /**
   * Consolidate recent episodic memories
   */
  consolidateRecentMemories(
    recentMemories: Experience[],
    context?: {
      currentGoals?: string[];
      semanticKnowledge?: any;
      existingPatterns?: MemoryPattern[];
    }
  ): ConsolidationResult {
    const startTime = Date.now();
    const strengthenedMemories: string[] = [];
    const newPatterns: MemoryPattern[] = [];
    const semanticUpdates: SemanticUpdate[] = [];
    const compressedMemories: string[] = [];

    // Strengthen memories based on salience and recency
    for (const memory of recentMemories) {
      const salience = this.salienceScorer.calculateSalience(memory, context);
      const strengthening = this.calculateStrengthening(memory, salience);
      
      if (strengthening > this.config.consolidationStrength) {
        strengthenedMemories.push(memory.id);
        this.strengthenMemory(memory, strengthening);
      }
    }

    // Identify patterns across memories
    const patterns = this.identifyEpisodicPatterns(recentMemories, context?.existingPatterns);
    newPatterns.push(...patterns);

    // Integrate with semantic knowledge
    const semanticUpdatesResult = this.integrateWithSemanticKnowledge(
      recentMemories,
      context?.semanticKnowledge
    );
    semanticUpdates.push(...semanticUpdatesResult);

    // Compress less important memories
    const compressionResult = this.compressMemories(recentMemories);
    compressedMemories.push(...compressionResult);

    const consolidationTime = Date.now() - startTime;

    return {
      strengthenedMemories,
      newPatterns,
      semanticUpdates,
      compressedMemories,
      consolidationMetrics: {
        memoriesProcessed: recentMemories.length,
        patternsIdentified: patterns.length,
        semanticUpdates: semanticUpdatesResult.length,
        memoriesCompressed: compressionResult.length,
        averageStrengthening: this.calculateAverageStrengthening(recentMemories),
        consolidationTime,
      },
    };
  }

  /**
   * Calculate memory strengthening factor
   */
  private calculateStrengthening(memory: Experience, salience: number): number {
    const recencyFactor = this.calculateRecencyFactor(memory.timestamp);
    const emotionalFactor = this.calculateEmotionalFactor(memory.emotions);
    const goalRelevance = this.calculateGoalRelevance(memory);
    
    return (
      salience * 0.4 +
      recencyFactor * 0.2 +
      emotionalFactor * 0.2 +
      goalRelevance * 0.2
    ) * this.config.memoryStrengtheningFactor;
  }

  /**
   * Calculate recency factor for memory strengthening
   */
  private calculateRecencyFactor(timestamp: number): number {
    const ageInHours = (Date.now() - timestamp) / (1000 * 60 * 60);
    return Math.max(0, 1 - ageInHours / 24); // Decay over 24 hours
  }

  /**
   * Calculate emotional factor for memory strengthening
   */
  private calculateEmotionalFactor(emotions: any): number {
    const emotionalIntensity = Math.max(
      emotions.satisfaction || 0,
      emotions.frustration || 0,
      emotions.excitement || 0,
      emotions.curiosity || 0
    );
    return emotionalIntensity;
  }

  /**
   * Calculate goal relevance factor
   */
  private calculateGoalRelevance(memory: Experience): number {
    // This would integrate with goal system
    // For now, use a simple heuristic based on memory type
    const goalRelevantTypes = [
      ExperienceType.GOAL_ACHIEVEMENT,
      ExperienceType.GOAL_FAILURE,
      ExperienceType.SKILL_IMPROVEMENT,
    ];
    
    return goalRelevantTypes.includes(memory.type) ? 0.8 : 0.3;
  }

  /**
   * Strengthen a memory
   */
  private strengthenMemory(memory: Experience, strengthening: number): void {
    // In a real implementation, this would update memory strength
    // For now, we'll just mark it as strengthened
    memory.metadata = {
      ...memory.metadata,
      strengthened: true,
      strengtheningFactor: strengthening,
      lastStrengthened: Date.now(),
    };
  }

  /**
   * Identify patterns across episodic memories
   */
  private identifyEpisodicPatterns(
    memories: Experience[],
    existingPatterns?: MemoryPattern[]
  ): MemoryPattern[] {
    const patterns: MemoryPattern[] = [];
    const patternMap = new Map<string, MemoryPattern>();

    // Group memories by type and analyze for patterns
    const memoriesByType = this.groupMemoriesByType(memories);
    
    for (const [type, typeMemories] of memoriesByType) {
      if (typeMemories.length >= 2) {
        const pattern = this.analyzeTypePattern(type, typeMemories);
        if (pattern.confidence > this.config.patternDetectionThreshold) {
          patterns.push(pattern);
          patternMap.set(pattern.id, pattern);
        }
      }
    }

    // Analyze temporal patterns
    const temporalPatterns = this.analyzeTemporalPatterns(memories);
    patterns.push(...temporalPatterns.filter(p => p.confidence > this.config.patternDetectionThreshold));

    // Analyze spatial patterns
    const spatialPatterns = this.analyzeSpatialPatterns(memories);
    patterns.push(...spatialPatterns.filter(p => p.confidence > this.config.patternDetectionThreshold));

    return patterns;
  }

  /**
   * Group memories by type
   */
  private groupMemoriesByType(memories: Experience[]): Map<ExperienceType, Experience[]> {
    const grouped = new Map<ExperienceType, Experience[]>();
    
    for (const memory of memories) {
      if (!grouped.has(memory.type)) {
        grouped.set(memory.type, []);
      }
      grouped.get(memory.type)!.push(memory);
    }
    
    return grouped;
  }

  /**
   * Analyze pattern for a specific memory type
   */
  private analyzeTypePattern(type: ExperienceType, memories: Experience[]): MemoryPattern {
    const patternId = `pattern-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      id: patternId,
      patternType: PatternType.BEHAVIORAL,
      description: `Recurring ${type} pattern with ${memories.length} occurrences`,
      confidence: Math.min(0.9, memories.length / 10), // Higher confidence with more occurrences
      supportingMemories: memories.map(m => m.id),
      frequency: memories.length,
      firstOccurrence: Math.min(...memories.map(m => m.timestamp)),
      lastOccurrence: Math.max(...memories.map(m => m.timestamp)),
    };
  }

  /**
   * Analyze temporal patterns in memories
   */
  private analyzeTemporalPatterns(memories: Experience[]): MemoryPattern[] {
    const patterns: MemoryPattern[] = [];
    
    // Sort memories by timestamp
    const sortedMemories = [...memories].sort((a, b) => a.timestamp - b.timestamp);
    
    // Look for regular intervals
    const intervals = this.calculateIntervals(sortedMemories);
    const regularIntervals = this.findRegularIntervals(intervals);
    
    if (regularIntervals.length > 0) {
      patterns.push({
        id: `temporal-pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        patternType: PatternType.TEMPORAL,
        description: `Regular temporal pattern with ${regularIntervals.length} intervals`,
        confidence: Math.min(0.8, regularIntervals.length / 5),
        supportingMemories: sortedMemories.map(m => m.id),
        frequency: regularIntervals.length,
        firstOccurrence: sortedMemories[0].timestamp,
        lastOccurrence: sortedMemories[sortedMemories.length - 1].timestamp,
      });
    }
    
    return patterns;
  }

  /**
   * Calculate intervals between memories
   */
  private calculateIntervals(memories: Experience[]): number[] {
    const intervals: number[] = [];
    
    for (let i = 1; i < memories.length; i++) {
      const interval = memories[i].timestamp - memories[i - 1].timestamp;
      intervals.push(interval);
    }
    
    return intervals;
  }

  /**
   * Find regular intervals in a sequence
   */
  private findRegularIntervals(intervals: number[]): number[] {
    if (intervals.length < 2) return [];
    
    const regularIntervals: number[] = [];
    const tolerance = 0.2; // 20% tolerance for regularity
    
    for (let i = 1; i < intervals.length; i++) {
      const ratio = intervals[i] / intervals[i - 1];
      if (ratio >= (1 - tolerance) && ratio <= (1 + tolerance)) {
        regularIntervals.push(intervals[i]);
      }
    }
    
    return regularIntervals;
  }

  /**
   * Analyze spatial patterns in memories
   */
  private analyzeSpatialPatterns(memories: Experience[]): MemoryPattern[] {
    const patterns: MemoryPattern[] = [];
    
    // Group memories by location
    const locationGroups = new Map<string, Experience[]>();
    
    for (const memory of memories) {
      if (memory.location) {
        const locationKey = `${memory.location.x},${memory.location.y},${memory.location.z}`;
        if (!locationGroups.has(locationKey)) {
          locationGroups.set(locationKey, []);
        }
        locationGroups.get(locationKey)!.push(memory);
      }
    }
    
    // Find locations with multiple memories
    for (const [location, locationMemories] of locationGroups) {
      if (locationMemories.length >= 2) {
        patterns.push({
          id: `spatial-pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          patternType: PatternType.SPATIAL,
          description: `Spatial pattern at location ${location} with ${locationMemories.length} memories`,
          confidence: Math.min(0.8, locationMemories.length / 5),
          supportingMemories: locationMemories.map(m => m.id),
          frequency: locationMemories.length,
          firstOccurrence: Math.min(...locationMemories.map(m => m.timestamp)),
          lastOccurrence: Math.max(...locationMemories.map(m => m.timestamp)),
        });
      }
    }
    
    return patterns;
  }

  /**
   * Integrate episodic memories with semantic knowledge
   */
  private integrateWithSemanticKnowledge(
    memories: Experience[],
    semanticKnowledge?: any
  ): SemanticUpdate[] {
    const updates: SemanticUpdate[] = [];
    
    for (const memory of memories) {
      // Extract entities and relationships from memory
      const entities = this.extractEntitiesFromMemory(memory);
      const relationships = this.extractRelationshipsFromMemory(memory);
      
      // Create semantic updates
      for (const entity of entities) {
        updates.push({
          entityId: entity.id,
          relationshipType: 'EXPERIENCED',
          confidence: memory.salienceScore,
          evidence: [memory.id],
          updateType: 'add',
        });
      }
      
      for (const relationship of relationships) {
        updates.push({
          entityId: relationship.source,
          relationshipType: relationship.type,
          targetId: relationship.target,
          confidence: memory.salienceScore * 0.8,
          evidence: [memory.id],
          updateType: 'add',
        });
      }
    }
    
    return updates;
  }

  /**
   * Extract entities from memory
   */
  private extractEntitiesFromMemory(memory: Experience): Array<{ id: string; type: string }> {
    const entities: Array<{ id: string; type: string }> = [];
    
    // Extract participants
    for (const participant of memory.participants) {
      entities.push({ id: participant, type: 'participant' });
    }
    
    // Extract location
    if (memory.location) {
      entities.push({ id: `location-${memory.location.x}-${memory.location.y}-${memory.location.z}`, type: 'location' });
    }
    
    // Extract from description (simplified)
    const words = memory.description.toLowerCase().split(/\s+/);
    const entityKeywords = ['chest', 'villager', 'ore', 'tree', 'house', 'cave'];
    
    for (const word of words) {
      if (entityKeywords.includes(word)) {
        entities.push({ id: word, type: 'object' });
      }
    }
    
    return entities;
  }

  /**
   * Extract relationships from memory
   */
  private extractRelationshipsFromMemory(memory: Experience): Array<{ source: string; type: string; target: string }> {
    const relationships: Array<{ source: string; type: string; target: string }> = [];
    
    // Extract action relationships
    for (const action of memory.actions) {
      relationships.push({
        source: 'agent',
        type: action.type,
        target: action.target || 'unknown',
      });
    }
    
    // Extract outcome relationships
    for (const outcome of memory.outcomes) {
      relationships.push({
        source: 'agent',
        type: 'achieved',
        target: outcome.description,
      });
    }
    
    return relationships;
  }

  /**
   * Compress less important memories
   */
  private compressMemories(memories: Experience[]): string[] {
    const compressedIds: string[] = [];
    
    for (const memory of memories) {
      if (memory.salienceScore < this.config.compressionThreshold) {
        // Mark memory for compression
        memory.metadata = {
          ...memory.metadata,
          compressed: true,
          compressionDate: Date.now(),
        };
        compressedIds.push(memory.id);
      }
    }
    
    return compressedIds;
  }

  /**
   * Calculate average strengthening across memories
   */
  private calculateAverageStrengthening(memories: Experience[]): number {
    if (memories.length === 0) return 0;
    
    const totalStrengthening = memories.reduce((sum, memory) => {
      const salience = this.salienceScorer.calculateSalience(memory);
      return sum + this.calculateStrengthening(memory, salience);
    }, 0);
    
    return totalStrengthening / memories.length;
  }
}
