/**
 * Social Memory Manager
 *
 * Manages social encounters, entity relationships, and factual knowledge
 * about people and entities the bot encounters. Implements gradual forgetting
 * with redaction mechanisms for realistic memory degradation.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { KnowledgeGraphCore } from '../semantic/knowledge-graph-core';
import {
  Entity,
  EntityType,
  RelationType,
  PropertyValue,
  KnowledgeSource,
  PropertyType,
} from '../semantic/types';

export interface SocialEntity {
  id: string;
  name: string;
  type: 'player' | 'villager' | 'merchant' | 'guard' | 'other';
  relationship: 'friend' | 'neutral' | 'enemy' | 'unknown';
  firstEncountered: number;
  lastInteraction: number;
  interactionCount: number;
  memoryStrength: number; // 0-1, determines forgetting rate
  facts: SocialFact[];
  location?: {
    x: number;
    y: number;
    z: number;
    biome: string;
    lastSeen: number;
  };
  appearance?: {
    description: string;
    lastUpdated: number;
  };
  personality?: {
    traits: string[];
    lastAssessed: number;
  };
  preferences?: {
    likes: string[];
    dislikes: string[];
    lastUpdated: number;
  };
}

export interface SocialFact {
  id: string;
  content: string;
  category:
    | 'personal'
    | 'location'
    | 'behavior'
    | 'relationship'
    | 'appearance'
    | 'personality'
    | 'preference'
    | 'history';
  confidence: number; // 0-1
  discoveredAt: number;
  lastReinforced: number;
  strength: number; // 0-1, determines forgetting rate
  source: KnowledgeSource;
  isRedacted: boolean;
  redactionLevel: number; // 0-1, 0 = fully remembered, 1 = fully redacted
  originalContent?: string; // Store original for gradual redaction
}

export interface SocialEncounter {
  id: string;
  entityId: string;
  type: 'chat' | 'interaction' | 'observation' | 'conflict' | 'assistance';
  timestamp: number;
  description: string;
  outcome?: 'positive' | 'neutral' | 'negative';
  newFacts: SocialFact[];
  location?: { x: number; y: number; z: number };
  emotionalImpact?: number; // -1 to 1
  memoryBoost: number; // How much this encounter boosts memory retention
}

export interface SocialMemoryConfig {
  maxEntities: number;
  baseForgettingRate: number; // Logarithmic decay rate
  minimumMemoryStrength: number; // Minimum memory strength (never fully forget)
  interactionBoostMultiplier: number; // How much interactions boost memory
  factDiscoveryRate: number; // Probability of discovering facts during interactions
  maxFactsPerEntity: number;
  redactionThreshold: number; // Memory strength below which redaction begins
  enableVerboseLogging: boolean;
}

const DEFAULT_CONFIG: SocialMemoryConfig = {
  maxEntities: 50,
  baseForgettingRate: 0.5, // Logarithmic decay rate
  minimumMemoryStrength: 0.05, // Never fully forget entities
  interactionBoostMultiplier: 2.0, // Double memory strength per interaction
  factDiscoveryRate: 0.3, // 30% chance to discover facts
  maxFactsPerEntity: 10,
  redactionThreshold: 0.3, // Start redacting below 30% strength
  enableVerboseLogging: true,
};

/**
 * Social Memory Manager
 */
export class SocialMemoryManager extends EventEmitter {
  private config: SocialMemoryConfig;
  private entities: Map<string, SocialEntity> = new Map();
  private encounters: SocialEncounter[] = [];
  private knowledgeGraph: KnowledgeGraphCore;
  private memoryUpdateInterval?: NodeJS.Timeout;

  constructor(
    knowledgeGraph: KnowledgeGraphCore,
    config: Partial<SocialMemoryConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.knowledgeGraph = knowledgeGraph;

    // Start memory update cycle
    this.startMemoryUpdateCycle();
  }

  /**
   * Record a new social encounter
   */
  async recordEncounter(encounter: SocialEncounter): Promise<void> {
    const fullEncounter = {
      ...encounter,
      id: `encounter-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    } as SocialEncounter;

    // Add to encounters history
    this.encounters.push(fullEncounter);
    this.encounters = this.encounters.slice(-100); // Keep last 100 encounters

    // Update or create entity
    const entity = this.entities.get(encounter.entityId);
    if (entity) {
      await this.updateExistingEntity(entity, fullEncounter);
    } else {
      await this.createNewEntity(encounter);
    }

    // Discover new facts
    const newFacts = await this.discoverFacts(encounter);
    if (newFacts.length > 0) {
      await this.addFactsToEntity(encounter.entityId, newFacts);
    }

    // Boost memory strength based on encounter
    await this.boostMemoryStrength(encounter.entityId, encounter.memoryBoost);

    this.emit('encounterRecorded', fullEncounter);
  }

  /**
   * Get entity memory with forgetting applied
   */
  getEntityMemory(entityId: string): SocialEntity | null {
    const entity = this.entities.get(entityId);
    if (!entity) return null;

    // Apply forgetting
    const now = Date.now();
    const timeSinceLastInteraction = now - entity.lastInteraction;
    const daysSinceInteraction =
      timeSinceLastInteraction / (24 * 60 * 60 * 1000);

    // Logarithmic decay: approaches minimum strength asymptotically
    const adjustedStrength =
      this.config.minimumMemoryStrength +
      (entity.memoryStrength - this.config.minimumMemoryStrength) /
        (1 +
          this.config.baseForgettingRate * Math.log(1 + daysSinceInteraction));

    // Apply redaction to facts using logarithmic decay
    const adjustedFacts = entity.facts.map((fact) => {
      const timeSinceDiscovered = now - fact.discoveredAt;
      const daysSinceDiscovered = timeSinceDiscovered / (24 * 60 * 60 * 1000);

      // Logarithmic decay for facts (faster than entity memory)
      const adjustedFactStrength =
        this.config.minimumMemoryStrength +
        (fact.strength - this.config.minimumMemoryStrength) /
          (1 +
            this.config.baseForgettingRate *
              1.5 *
              Math.log(1 + daysSinceDiscovered));

      if (adjustedFactStrength < this.config.redactionThreshold) {
        return this.applyRedaction(fact, 1 - adjustedFactStrength);
      }
      return { ...fact, strength: adjustedFactStrength };
    });

    return {
      ...entity,
      memoryStrength: Math.max(0, adjustedStrength),
      facts: adjustedFacts,
    };
  }

  /**
   * Get all remembered entities (filtered by memory strength)
   */
  getRememberedEntities(minStrength: number = 0.1): SocialEntity[] {
    const now = Date.now();

    return Array.from(this.entities.values())
      .map((entity) => this.getEntityMemory(entity.id))
      .filter(
        (entity): entity is SocialEntity =>
          entity !== null && entity.memoryStrength >= minStrength
      )
      .sort((a, b) => b.memoryStrength - a.memoryStrength);
  }

  /**
   * Search for entities by fact content
   */
  searchByFact(query: string): SocialEntity[] {
    const results: SocialEntity[] = [];

    for (const entity of this.entities.values()) {
      const rememberedEntity = this.getEntityMemory(entity.id);
      if (!rememberedEntity) continue;

      const hasMatchingFact = rememberedEntity.facts.some(
        (fact) =>
          fact.content.toLowerCase().includes(query.toLowerCase()) &&
          !fact.isRedacted
      );

      if (hasMatchingFact) {
        results.push(rememberedEntity);
      }
    }

    return results;
  }

  /**
   * Get social memory statistics
   */
  getStats(): {
    totalEntities: number;
    activeEntities: number;
    totalFacts: number;
    redactedFacts: number;
    averageMemoryStrength: number;
    averageFactStrength: number;
    recentEncounters: number;
  } {
    const entities = Array.from(this.entities.values());
    const allFacts = entities.flatMap((e) => e.facts);

    const rememberedEntities = this.getRememberedEntities();
    const now = Date.now();
    const recentThreshold = now - 7 * 24 * 60 * 60 * 1000; // Last 7 days

    return {
      totalEntities: entities.length,
      activeEntities: rememberedEntities.length,
      totalFacts: allFacts.length,
      redactedFacts: allFacts.filter((f) => f.isRedacted).length,
      averageMemoryStrength:
        entities.length > 0
          ? entities.reduce((sum, e) => sum + e.memoryStrength, 0) /
            entities.length
          : 0,
      averageFactStrength:
        allFacts.length > 0
          ? allFacts.reduce((sum, f) => sum + f.strength, 0) / allFacts.length
          : 0,
      recentEncounters: this.encounters.filter(
        (e) => e.timestamp > recentThreshold
      ).length,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async updateExistingEntity(
    entity: SocialEntity,
    encounter: SocialEncounter
  ): Promise<void> {
    entity.lastInteraction = encounter.timestamp;
    entity.interactionCount += 1;

    // Boost memory strength based on interaction frequency
    const interactionBoost = Math.min(1, entity.interactionCount * 0.1);
    entity.memoryStrength = Math.min(
      1,
      entity.memoryStrength + interactionBoost
    );

    // Update location if provided
    if (encounter.location) {
      entity.location = {
        x: encounter.location.x,
        y: encounter.location.y,
        z: encounter.location.z,
        biome: 'unknown', // Could be determined from coordinates
        lastSeen: encounter.timestamp,
      };
    }

    this.entities.set(entity.id, entity);
  }

  private async createNewEntity(encounter: SocialEncounter): Promise<void> {
    const entity: SocialEntity = {
      id: encounter.entityId,
      name: encounter.entityId, // Could be extracted from chat or entity data
      type: 'player', // Default type, could be determined from context
      relationship: 'neutral',
      firstEncountered: encounter.timestamp,
      lastInteraction: encounter.timestamp,
      interactionCount: 1,
      memoryStrength: 0.5, // Start with moderate memory strength
      facts: [],
      location: encounter.location
        ? {
            x: encounter.location.x,
            y: encounter.location.y,
            z: encounter.location.z,
            biome: 'unknown',
            lastSeen: encounter.timestamp,
          }
        : undefined,
    };

    this.entities.set(entity.id, entity);
  }

  private async discoverFacts(
    encounter: SocialEncounter
  ): Promise<SocialFact[]> {
    const facts: SocialFact[] = [];
    const now = Date.now();

    // Random fact discovery based on encounter type
    if (Math.random() < this.config.factDiscoveryRate) {
      const factTypes = [
        'personal',
        'location',
        'behavior',
        'personality',
      ] as const;
      const factType = factTypes[Math.floor(Math.random() * factTypes.length)];

      const factContent = await this.generateFactContent(encounter, factType);

      const fact: SocialFact = {
        id: `fact-${now}-${Math.random().toString(36).substr(2, 9)}`,
        content: factContent,
        category: factType,
        confidence: 0.6 + Math.random() * 0.3, // 0.6-0.9
        discoveredAt: now,
        lastReinforced: now,
        strength: 0.8, // New facts start strong
        source: KnowledgeSource.OBSERVATION,
        isRedacted: false,
        redactionLevel: 0,
        originalContent: factContent,
      };

      facts.push(fact);
    }

    return facts;
  }

  private async generateFactContent(
    encounter: SocialEncounter,
    category: SocialFact['category']
  ): Promise<string> {
    // This would typically use LLM to generate realistic facts
    // For now, using simple templates
    switch (category) {
      case 'personal':
        return `${encounter.entityId} seems to be a ${Math.random() > 0.5 ? 'friendly' : 'reserved'} person.`;
      case 'location':
        return `${encounter.entityId} was encountered in a ${encounter.location ? 'village area' : 'wilderness'}.`;
      case 'behavior':
        return `${encounter.entityId} ${encounter.type === 'chat' ? 'likes to chat about' : 'seems interested in'} various topics.`;
      case 'personality':
        return `${encounter.entityId} appears to be ${['curious', 'helpful', 'adventurous', 'cautious'][Math.floor(Math.random() * 4)]}.`;
      case 'relationship':
        return `${encounter.entityId} has been ${encounter.outcome === 'positive' ? 'helpful' : 'neutral'} in our interactions.`;
      case 'appearance':
        return `${encounter.entityId} has a ${['distinctive', 'ordinary', 'memorable'][Math.floor(Math.random() * 3)]} appearance.`;
      case 'preference':
        return `${encounter.entityId} seems to ${['enjoy exploring', 'prefer building', 'like trading', 'avoid combat'][Math.floor(Math.random() * 4)]}.`;
      case 'history':
        return `${encounter.entityId} has been encountered ${Math.floor(Math.random() * 5) + 1} times before.`;
      default:
        return `${encounter.entityId} is an interesting person.`;
    }
  }

  private async addFactsToEntity(
    entityId: string,
    facts: SocialFact[]
  ): Promise<void> {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    entity.facts.push(...facts);

    // Limit facts per entity
    if (entity.facts.length > this.config.maxFactsPerEntity) {
      entity.facts = entity.facts
        .sort((a, b) => b.strength - a.strength)
        .slice(0, this.config.maxFactsPerEntity);
    }

    this.entities.set(entityId, entity);
    await this.updateKnowledgeGraphEntity(entity);
  }

  private async boostMemoryStrength(
    entityId: string,
    boost: number
  ): Promise<void> {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    entity.memoryStrength = Math.min(
      1,
      entity.memoryStrength + boost * this.config.interactionBoostMultiplier
    );
    this.entities.set(entityId, entity);
    await this.updateKnowledgeGraphEntity(entity);
  }

  private applyRedaction(
    fact: SocialFact,
    forgettingLevel: number
  ): SocialFact {
    if (fact.isRedacted || !fact.originalContent) {
      return fact;
    }

    const words = fact.originalContent.split(' ');
    const redactionCount = Math.floor(words.length * forgettingLevel);

    // Redact random words (avoid first and last word for readability)
    const redactedWords = [...words];
    for (let i = 0; i < redactionCount && i < words.length - 2; i++) {
      const randomIndex = Math.floor(Math.random() * (words.length - 2)) + 1;
      if (redactedWords[randomIndex] !== '[REDACTED]') {
        redactedWords[randomIndex] = '[REDACTED]';
      }
    }

    return {
      ...fact,
      content: redactedWords.join(' '),
      isRedacted: redactionCount > 0,
      redactionLevel: forgettingLevel,
    };
  }

  private async updateKnowledgeGraphEntity(
    entity: SocialEntity
  ): Promise<void> {
    const now = Date.now();
    await this.knowledgeGraph.upsertEntity({
      type: EntityType.PLAYER,
      name: entity.name,
      description: `Social entity encountered ${entity.interactionCount} times`,
      tags: ['social', 'encountered'],
      source: KnowledgeSource.OBSERVATION,
      properties: {
        relationship: {
          confidence: 0.7,
          timestamp: now,
          type: PropertyType.STRING,
          source: KnowledgeSource.OBSERVATION,
          value: entity.relationship,
        },
        interactionCount: {
          confidence: 1.0,
          timestamp: now,
          type: PropertyType.NUMBER,
          source: KnowledgeSource.OBSERVATION,
          value: entity.interactionCount,
        },
        memoryStrength: {
          confidence: 1.0,
          timestamp: now,
          type: PropertyType.NUMBER,
          source: KnowledgeSource.OBSERVATION,
          value: entity.memoryStrength,
        },
      },
      confidence: entity.memoryStrength,
    });
  }

  private async ensureLocationEntity(
    location: SocialEntity['location']
  ): Promise<Entity> {
    if (!location) throw new Error('Location required');

    const locationId = `location-${location.x}-${location.y}-${location.z}`;
    const locationName = `Area at ${Math.round(location.x)}, ${Math.round(location.y)}, ${Math.round(location.z)}`;

    try {
      const existingEntity = await this.knowledgeGraph.findEntityByName(
        locationName,
        EntityType.PLACE
      );
      if (existingEntity) {
        return existingEntity;
      }
      throw new Error('Entity not found');
    } catch {
      // Create new location entity
      const now = Date.now();
      const locationEntity: Entity = {
        id: locationId,
        type: EntityType.PLACE,
        name: locationName,
        description: `Location in ${location.biome} biome`,
        properties: {
          x: {
            confidence: 1.0,
            timestamp: now,
            type: PropertyType.NUMBER,
            source: KnowledgeSource.OBSERVATION,
            value: location.x,
          },
          y: {
            confidence: 1.0,
            timestamp: now,
            type: PropertyType.NUMBER,
            source: KnowledgeSource.OBSERVATION,
            value: location.y,
          },
          z: {
            confidence: 1.0,
            timestamp: now,
            type: PropertyType.NUMBER,
            source: KnowledgeSource.OBSERVATION,
            value: location.z,
          },
          biome: {
            confidence: 0.6,
            timestamp: now,
            type: PropertyType.STRING,
            source: KnowledgeSource.OBSERVATION,
            value: location.biome,
          },
        },
        tags: ['location', 'encounter-site'],
        confidence: 0.8,
        source: KnowledgeSource.OBSERVATION,
        createdAt: now,
        updatedAt: now,
        lastAccessed: now,
        accessCount: 1,
      };

      await this.knowledgeGraph.upsertEntity(locationEntity);
      return locationEntity;
    }
  }

  private startMemoryUpdateCycle(): void {
    this.memoryUpdateInterval = setInterval(() => {
      this.updateMemoryDecay();
    }, 60000); // Update every minute
  }

  private updateMemoryDecay(): void {
    const now = Date.now();

    for (const [entityId, entity] of this.entities) {
      const timeSinceLastInteraction = now - entity.lastInteraction;
      const hoursSinceInteraction = timeSinceLastInteraction / (60 * 60 * 1000);

      // Logarithmic memory decay
      const daysSinceInteraction = hoursSinceInteraction / 24;
      entity.memoryStrength =
        this.config.minimumMemoryStrength +
        (entity.memoryStrength - this.config.minimumMemoryStrength) /
          (1 +
            this.config.baseForgettingRate *
              Math.log(1 + daysSinceInteraction));

      // Apply fact forgetting with logarithmic decay
      entity.facts.forEach((fact) => {
        const timeSinceDiscovered = now - fact.discoveredAt;
        const daysSinceDiscovered = timeSinceDiscovered / (24 * 60 * 60 * 1000);

        const adjustedFactStrength =
          this.config.minimumMemoryStrength +
          (fact.strength - this.config.minimumMemoryStrength) /
            (1 +
              this.config.baseForgettingRate *
                1.5 *
                Math.log(1 + daysSinceDiscovered));

        fact.strength = Math.max(0, adjustedFactStrength);

        // Apply redaction if needed
        if (fact.strength < this.config.redactionThreshold) {
          const forgettingLevel = 1 - fact.strength;
          Object.assign(fact, this.applyRedaction(fact, forgettingLevel));
        }
      });

      // Remove entities with no memory strength
      if (entity.memoryStrength <= 0.05) {
        this.entities.delete(entityId);
        if (this.config.enableVerboseLogging) {
          console.log(`🗑️ Forgot entity ${entity.name} completely`);
        }
      }
    }

    this.emit('memoryUpdated');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SocialMemoryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): SocialMemoryConfig {
    return { ...this.config };
  }

  /**
   * Clean shutdown
   */
  shutdown(): void {
    if (this.memoryUpdateInterval) {
      clearInterval(this.memoryUpdateInterval);
    }
  }
}
