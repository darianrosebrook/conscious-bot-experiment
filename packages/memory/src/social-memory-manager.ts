/**
 * Social Memory Manager
 *
 * Tracks social interactions, relationships, trust levels, and social dynamics
 * to enable sophisticated social reasoning and relationship management.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface SocialEntity {
  id: string;
  name: string;
  type:
    | 'player'
    | 'villager'
    | 'trader'
    | 'guard'
    | 'child'
    | 'leader'
    | 'other';
  role?: string;
  profession?: string;
  reputation: number; // -100 to +100
  trustLevel: number; // 0 to 1
  lastInteraction: number;
  interactionCount: number;
  giftsGiven: number;
  giftsReceived: number;
  tradesCompleted: number;
  favorsDone: number;
  favorsReceived: number;
  conflicts: number;
  personalityTraits: string[];
  relationshipStatus:
    | 'stranger'
    | 'acquaintance'
    | 'friend'
    | 'close_friend'
    | 'enemy'
    | 'rival';
  communicationStyle: 'formal' | 'casual' | 'hostile' | 'friendly' | 'neutral';
}

export interface SocialInteraction {
  id: string;
  entityId: string;
  interactionType:
    | 'trade'
    | 'gift'
    | 'conversation'
    | 'favor'
    | 'conflict'
    | 'cooperation'
    | 'help';
  context: string; // What was happening
  outcome: 'positive' | 'negative' | 'neutral';
  emotionalTone:
    | 'happy'
    | 'angry'
    | 'sad'
    | 'fearful'
    | 'surprised'
    | 'neutral';
  trustChange: number; // -1 to +1
  reputationChange: number; // -10 to +10
  timestamp: number;
  location?: { x: number; y: number; z: number };
  details: {
    value?: number; // For trades/gifts
    item?: string;
    response?: string; // What they said/did
    ourAction?: string; // What we did
  };
  followUp?: string[]; // Suggested follow-up actions
}

export interface SocialPattern {
  id: string;
  name: string; // e.g., "Gift leads to trust", "Repeated trades improve reputation"
  trigger: {
    interactionType: string;
    context?: string;
    entityType?: string;
  };
  outcome: {
    trustChange: number;
    reputationChange: number;
    relationshipProgression: string;
  };
  confidence: number; // 0-1 based on frequency of pattern
  frequency: number; // How many times observed
  lastObserved: number;
  effectiveness: number; // How often this pattern leads to desired outcome
}

export interface SocialMemoryConfig {
  enabled: boolean;
  maxEntities: number; // Maximum entities to track
  trustThresholds: {
    enemy: number; // Below this = enemy
    acquaintance: number; // Above this = acquaintance
    friend: number; // Above this = friend
  };
  reputationThresholds: {
    hostile: number;
    neutral: number;
    friendly: number;
  };
  memoryRetentionDays: number; // How long to keep social memories
  patternLearningEnabled: boolean;
  relationshipEvolutionEnabled: boolean;
  conflictResolutionEnabled: boolean;
}

export const DEFAULT_SOCIAL_MEMORY_CONFIG: Partial<SocialMemoryConfig> = {
  enabled: true,
  maxEntities: 100,
  trustThresholds: {
    enemy: 0.2,
    acquaintance: 0.4,
    friend: 0.7,
  },
  reputationThresholds: {
    hostile: -20,
    neutral: 20,
    friendly: 50,
  },
  memoryRetentionDays: 30,
  patternLearningEnabled: true,
  relationshipEvolutionEnabled: true,
  conflictResolutionEnabled: true,
};

// ============================================================================
// Social Memory Manager
// ============================================================================

export class SocialMemoryManager {
  private config: Required<SocialMemoryConfig>;
  private entities: Map<string, SocialEntity> = new Map();
  private interactions: SocialInteraction[] = [];
  private patterns: SocialPattern[] = [];
  private lastCleanup: number = 0;

  constructor(config: Partial<SocialMemoryConfig> = {}) {
    this.config = {
      ...DEFAULT_SOCIAL_MEMORY_CONFIG,
      ...config,
    } as Required<SocialMemoryConfig>;
  }

  /**
   * Record a social interaction
   */
  async recordInteraction(
    interaction: Omit<SocialInteraction, 'id'>
  ): Promise<void> {
    if (!this.config.enabled) return;

    const fullInteraction: SocialInteraction = {
      id: this.generateId(),
      ...interaction,
    };

    this.interactions.push(fullInteraction);

    // Update entity
    await this.updateEntity(interaction.entityId, interaction);

    // Learn patterns if enabled
    if (this.config.patternLearningEnabled) {
      await this.learnPatterns(fullInteraction);
    }

    // Clean up old interactions periodically
    if (Date.now() - this.lastCleanup > 3600000) {
      // 1 hour
      await this.cleanupOldInteractions();
    }

    console.log(
      `📱 Recorded social interaction: ${interaction.interactionType} with ${interaction.entityId} - ${interaction.outcome}`
    );
  }

  /**
   * Get entity information
   */
  getEntity(entityId: string): SocialEntity | undefined {
    return this.entities.get(entityId);
  }

  /**
   * Get all entities
   */
  getAllEntities(): SocialEntity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Get entity recommendations for interaction
   */
  async getInteractionRecommendations(
    context: string,
    limit: number = 5
  ): Promise<
    Array<{
      entityId: string;
      confidence: number;
      reasoning: string;
      suggestedApproach: string;
    }>
  > {
    if (!this.config.enabled) return [];

    const recommendations = Array.from(this.entities.values())
      .filter((entity) => this.isEntityAvailable(entity))
      .map((entity) => ({
        entityId: entity.id,
        confidence: this.calculateInteractionConfidence(entity, context),
        reasoning: this.generateRecommendationReasoning(entity, context),
        suggestedApproach: this.getSuggestedApproach(entity, context),
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);

    return recommendations;
  }

  /**
   * Get social patterns for a context
   */
  getSocialPatterns(context: string): SocialPattern[] {
    return this.patterns
      .filter((pattern) => this.matchesContext(pattern, context))
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get relationship insights for an entity
   */
  getRelationshipInsights(entityId: string): {
    entity: SocialEntity;
    recentInteractions: SocialInteraction[];
    patterns: SocialPattern[];
    recommendations: string[];
  } | null {
    const entity = this.entities.get(entityId);
    if (!entity) return null;

    const recentInteractions = this.interactions
      .filter((i) => i.entityId === entityId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    const patterns = this.getSocialPatterns(`interaction with ${entity.type}`);

    const recommendations = this.generateRelationshipRecommendations(
      entity,
      recentInteractions
    );

    return {
      entity,
      recentInteractions,
      patterns,
      recommendations,
    };
  }

  /**
   * Update entity based on interaction
   */
  private async updateEntity(
    entityId: string,
    interaction: Omit<SocialInteraction, 'id'>
  ): Promise<void> {
    let entity = this.entities.get(entityId);

    if (!entity) {
      // Create new entity
      entity = {
        id: entityId,
        name: entityId,
        type: 'other',
        reputation: 0,
        trustLevel: 0.5,
        lastInteraction: interaction.timestamp,
        interactionCount: 0,
        giftsGiven: 0,
        giftsReceived: 0,
        tradesCompleted: 0,
        favorsDone: 0,
        favorsReceived: 0,
        conflicts: 0,
        personalityTraits: [],
        relationshipStatus: 'stranger',
        communicationStyle: 'neutral',
      };
    }

    // Update entity based on interaction
    entity.lastInteraction = interaction.timestamp;
    entity.interactionCount++;

    switch (interaction.interactionType) {
      case 'gift':
        if (interaction.outcome === 'positive') {
          entity.giftsGiven++;
          entity.reputation += interaction.reputationChange;
          entity.trustLevel = Math.min(
            1,
            entity.trustLevel + interaction.trustChange
          );
        }
        break;
      case 'trade':
        if (interaction.outcome === 'positive') {
          entity.tradesCompleted++;
          entity.reputation += interaction.reputationChange;
          entity.trustLevel = Math.min(
            1,
            entity.trustLevel + interaction.trustChange * 0.5
          );
        }
        break;
      case 'conflict':
        entity.conflicts++;
        entity.reputation += interaction.reputationChange;
        entity.trustLevel = Math.max(
          0,
          entity.trustLevel + interaction.trustChange
        );
        break;
      default:
        entity.reputation += interaction.reputationChange;
        entity.trustLevel = Math.max(
          0,
          Math.min(1, entity.trustLevel + interaction.trustChange)
        );
    }

    // Update relationship status
    entity.relationshipStatus = this.calculateRelationshipStatus(entity);

    this.entities.set(entityId, entity);
  }

  /**
   * Learn patterns from interactions
   */
  private async learnPatterns(interaction: SocialInteraction): Promise<void> {
    // Find existing pattern or create new one
    let pattern = this.patterns.find(
      (p) =>
        p.trigger.interactionType === interaction.interactionType &&
        p.trigger.context === interaction.context
    );

    if (!pattern) {
      pattern = {
        id: this.generateId(),
        name: `${interaction.interactionType} in ${interaction.context}`,
        trigger: {
          interactionType: interaction.interactionType,
          context: interaction.context,
        },
        outcome: {
          trustChange: interaction.trustChange,
          reputationChange: interaction.reputationChange,
          relationshipProgression:
            this.calculateRelationshipProgression(interaction),
        },
        confidence: 0,
        frequency: 0,
        lastObserved: interaction.timestamp,
        effectiveness: 0,
      };
      this.patterns.push(pattern);
    }

    // Update pattern statistics
    pattern.frequency++;
    pattern.lastObserved = interaction.timestamp;
    pattern.confidence = Math.min(1, pattern.frequency / 10); // Confidence increases with frequency

    // Calculate effectiveness based on outcome
    if (interaction.outcome === 'positive') {
      pattern.effectiveness =
        (pattern.effectiveness * (pattern.frequency - 1) + 1) /
        pattern.frequency;
    } else {
      pattern.effectiveness =
        (pattern.effectiveness * (pattern.frequency - 1) + 0) /
        pattern.frequency;
    }
  }

  /**
   * Calculate interaction confidence
   */
  private calculateInteractionConfidence(
    entity: SocialEntity,
    context: string
  ): number {
    let confidence = 0.5; // Base confidence

    // Trust factor
    confidence += entity.trustLevel * 0.3;

    // Reputation factor
    const reputationScore = Math.max(0, entity.reputation) / 100;
    confidence += reputationScore * 0.2;

    // Relationship status factor
    const relationshipBonusMap: Record<string, number> = {
      enemy: -0.3,
      stranger: 0,
      acquaintance: 0.1,
      friend: 0.2,
      close_friend: 0.3,
      rival: -0.2,
    };
    const relationshipBonus =
      relationshipBonusMap[entity.relationshipStatus] || 0;
    confidence += relationshipBonus;

    // Context compatibility
    if (context.includes('trade') && entity.tradesCompleted > 0) {
      confidence += 0.2;
    }
    if (context.includes('conflict') && entity.conflicts > 0) {
      confidence -= 0.2;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Generate recommendation reasoning
   */
  private generateRecommendationReasoning(
    entity: SocialEntity,
    context: string
  ): string {
    const reasons = [];

    if (entity.trustLevel > 0.7) {
      reasons.push(
        `High trust level (${(entity.trustLevel * 100).toFixed(0)}%)`
      );
    }
    if (entity.reputation > 50) {
      reasons.push(`Good reputation (${entity.reputation})`);
    }
    if (entity.relationshipStatus === 'friend') {
      reasons.push('Established friendship');
    }
    if (entity.interactionCount > 5) {
      reasons.push(`Frequent interactions (${entity.interactionCount})`);
    }

    return reasons.join(', ') || 'No prior relationship data';
  }

  /**
   * Get suggested approach
   */
  private getSuggestedApproach(entity: SocialEntity, context: string): string {
    if (entity.relationshipStatus === 'enemy') {
      return 'Approach with caution, avoid conflict';
    }
    if (entity.relationshipStatus === 'friend') {
      return 'Friendly approach, build on existing relationship';
    }
    if (context.includes('trade')) {
      return 'Professional approach, fair trade offers';
    }
    if (context.includes('help')) {
      return 'Helpful and supportive approach';
    }

    return 'Neutral, respectful approach';
  }

  /**
   * Calculate relationship status
   */
  private calculateRelationshipStatus(
    entity: SocialEntity
  ): SocialEntity['relationshipStatus'] {
    if (entity.trustLevel < this.config.trustThresholds.enemy) {
      return 'enemy';
    }
    if (entity.trustLevel < this.config.trustThresholds.acquaintance) {
      return 'stranger';
    }
    if (entity.trustLevel < this.config.trustThresholds.friend) {
      return 'acquaintance';
    }
    if (
      entity.reputation > this.config.reputationThresholds.friendly &&
      entity.interactionCount > 10
    ) {
      return 'close_friend';
    }
    return 'friend';
  }

  /**
   * Calculate relationship progression
   */
  private calculateRelationshipProgression(
    interaction: SocialInteraction
  ): string {
    if (interaction.outcome === 'positive' && interaction.trustChange > 0.1) {
      return 'relationship_improved';
    }
    if (interaction.outcome === 'negative' && interaction.trustChange < -0.1) {
      return 'relationship_declined';
    }
    return 'relationship_stable';
  }

  /**
   * Generate relationship recommendations
   */
  private generateRelationshipRecommendations(
    entity: SocialEntity,
    recentInteractions: SocialInteraction[]
  ): string[] {
    const recommendations = [];

    if (
      entity.relationshipStatus === 'enemy' &&
      this.config.conflictResolutionEnabled
    ) {
      recommendations.push(
        'Attempt conflict resolution through neutral mediation'
      );
      recommendations.push('Give time for emotions to cool before approaching');
    }

    if (
      entity.relationshipStatus === 'acquaintance' &&
      this.config.relationshipEvolutionEnabled
    ) {
      recommendations.push('Offer small gift to build trust');
      recommendations.push('Engage in cooperative activity');
    }

    if (recentInteractions.some((i) => i.outcome === 'negative')) {
      recommendations.push('Address recent conflict directly but calmly');
      recommendations.push(
        'Take a break from interactions to reset relationship'
      );
    }

    if (entity.trustLevel > 0.8 && entity.reputation > 50) {
      recommendations.push('Consider this person a reliable ally');
      recommendations.push('Deepen relationship through shared goals');
    }

    return recommendations;
  }

  /**
   * Check if entity is available for interaction
   */
  private isEntityAvailable(entity: SocialEntity): boolean {
    const timeSinceLastInteraction = Date.now() - entity.lastInteraction;
    return timeSinceLastInteraction < 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Check if pattern matches context
   */
  private matchesContext(pattern: SocialPattern, context: string): boolean {
    return (
      pattern.trigger.context?.toLowerCase().includes(context.toLowerCase()) ||
      context
        .toLowerCase()
        .includes(pattern.trigger.interactionType.toLowerCase())
    );
  }

  /**
   * Clean up old interactions
   */
  private async cleanupOldInteractions(): Promise<void> {
    const cutoff =
      Date.now() - this.config.memoryRetentionDays * 24 * 60 * 60 * 1000;

    this.interactions = this.interactions.filter((i) => i.timestamp > cutoff);

    // Remove entities with no recent interactions
    for (const [entityId, entity] of this.entities) {
      if (entity.lastInteraction < cutoff) {
        this.entities.delete(entityId);
      }
    }

    this.lastCleanup = Date.now();

    console.log(
      `🧹 Cleaned up social memory: ${this.interactions.length} interactions, ${this.entities.size} entities remaining`
    );
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `social_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get social memory statistics
   */
  getSocialMemoryStats(): {
    totalEntities: number;
    totalInteractions: number;
    averageTrustLevel: number;
    averageReputation: number;
    relationshipDistribution: Record<string, number>;
    interactionTypeDistribution: Record<string, number>;
    patternCount: number;
  } {
    const entities = Array.from(this.entities.values());
    const averageTrustLevel =
      entities.reduce((sum, e) => sum + e.trustLevel, 0) / entities.length || 0;
    const averageReputation =
      entities.reduce((sum, e) => sum + e.reputation, 0) / entities.length || 0;

    const relationshipDistribution = entities.reduce(
      (dist, e) => {
        dist[e.relationshipStatus] = (dist[e.relationshipStatus] || 0) + 1;
        return dist;
      },
      {} as Record<string, number>
    );

    const interactionTypeDistribution = this.interactions.reduce(
      (dist, i) => {
        dist[i.interactionType] = (dist[i.interactionType] || 0) + 1;
        return dist;
      },
      {} as Record<string, number>
    );

    return {
      totalEntities: entities.length,
      totalInteractions: this.interactions.length,
      averageTrustLevel,
      averageReputation,
      relationshipDistribution,
      interactionTypeDistribution,
      patternCount: this.patterns.length,
    };
  }
}
