/**
 * Social Memory System Demo
 *
 * Demonstrates how the bot would remember social encounters with gradual
 * forgetting and redaction effects. This is a conceptual implementation
 * showing the core ideas without full integration.
 *
 * Key Features:
 * - Social encounters are recorded with facts about entities
 * - Memory strength decreases over time
 * - Facts get redacted as memories fade (e.g., "Steve who lives in [REDACTED] village")
 * - Recent interactions boost memory retention
 * - Entities can be searched by facts
 *
 * @author @darianrosebrook
 */

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
  isRedacted: boolean;
  redactionLevel: number; // 0-1, 0 = fully remembered, 1 = fully redacted
  originalContent: string; // Store original for gradual redaction
}

export interface SocialEncounter {
  id: string;
  entityId: string;
  type: 'chat' | 'interaction' | 'observation' | 'conflict' | 'assistance';
  timestamp: number;
  description: string;
  outcome?: 'positive' | 'neutral' | 'negative';
  location?: { x: number; y: number; z: number };
  emotionalImpact?: number; // -1 to 1
  memoryBoost: number; // How much this encounter boosts memory retention
}

/**
 * Example: How the bot would remember a player over time
 */
export class SocialMemoryDemo {
  private entities: Map<string, SocialEntity> = new Map();
  private encounters: SocialEncounter[] = [];
  private readonly baseForgettingRate = 0.5; // Logarithmic decay rate
  private readonly minimumMemoryStrength = 0.05; // Minimum memory strength (never fully forget)

  /**
   * Record a social encounter
   */
  async recordEncounter(encounter: SocialEncounter): Promise<void> {
    this.encounters.push(encounter);
    this.encounters = this.encounters.slice(-100); // Keep last 100 encounters

    // Update or create entity
    const entity = this.entities.get(encounter.entityId);
    if (entity) {
      this.updateExistingEntity(entity, encounter);
    } else {
      this.createNewEntity(encounter);
    }

    // Discover new facts (30% chance)
    if (Math.random() < 0.3) {
      await this.discoverFacts(encounter);
    }

    // Boost memory strength
    this.boostMemoryStrength(encounter.entityId, encounter.memoryBoost);

    console.log(`📝 Recorded encounter: ${encounter.description}`);
  }

  /**
   * Get entity memory with forgetting applied
   */
  getEntityMemory(entityId: string): SocialEntity | null {
    const entity = this.entities.get(entityId);
    if (!entity) return null;

    // Apply logarithmic forgetting
    const now = Date.now();
    const timeSinceLastInteraction = now - entity.lastInteraction;
    const daysSinceInteraction =
      timeSinceLastInteraction / (24 * 60 * 60 * 1000);

    // Logarithmic decay: approaches minimum strength asymptotically
    const adjustedStrength = this.minimumMemoryStrength + (entity.memoryStrength - this.minimumMemoryStrength) / (1 + this.baseForgettingRate * Math.log(1 + daysSinceInteraction));

    // Apply redaction to facts using logarithmic decay
    const adjustedFacts = entity.facts.map((fact) => {
      const timeSinceDiscovered = now - fact.discoveredAt;
      const daysSinceDiscovered =
        timeSinceDiscovered / (24 * 60 * 60 * 1000);

      // Logarithmic decay for facts (faster than entity memory)
      const adjustedFactStrength = this.minimumMemoryStrength + (fact.strength - this.minimumMemoryStrength) / (1 + this.baseForgettingRate * 1.5 * Math.log(1 + daysSinceDiscovered));

      if (adjustedFactStrength < 0.3) {
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
   * Get all remembered entities
   */
  getRememberedEntities(minStrength: number = 0.1): SocialEntity[] {
    return Array.from(this.entities.values())
      .map((entity) => this.getEntityMemory(entity.id))
      .filter(
        (entity): entity is SocialEntity =>
          entity !== null && entity.memoryStrength >= minStrength
      )
      .sort((a, b) => b.memoryStrength - a.memoryStrength);
  }

  /**
   * Search entities by fact content
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
   * Demonstrate the memory system with example encounters
   */
  async demonstrateMemorySystem(): Promise<void> {
    console.log('🧠 Social Memory System Demo');
    console.log('============================');

    // Simulate encounters over time
    const steveId = 'player-steve';
    const bobId = 'player-bob';

    // Day 1: Initial encounters
    await this.recordEncounter({
      id: 'enc-1',
      entityId: steveId,
      type: 'chat',
      timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
      description: 'Met Steve in the village',
      outcome: 'positive',
      location: { x: 100, y: 64, z: 200 },
      memoryBoost: 0.5,
    });

    await this.recordEncounter({
      id: 'enc-2',
      entityId: bobId,
      type: 'interaction',
      timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
      description: 'Helped Bob with building',
      outcome: 'positive',
      location: { x: 150, y: 64, z: 180 },
      memoryBoost: 0.4,
    });

    // Day 3: More interactions
    await this.recordEncounter({
      id: 'enc-3',
      entityId: steveId,
      type: 'chat',
      timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5 days ago
      description: 'Steve told me about his farm',
      outcome: 'positive',
      memoryBoost: 0.3,
    });

    // Day 6: Recent interaction
    await this.recordEncounter({
      id: 'enc-4',
      entityId: steveId,
      type: 'assistance',
      timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000, // 1 day ago
      description: 'Steve helped me find diamonds',
      outcome: 'positive',
      memoryBoost: 0.6,
    });

    // Show current memory state
    console.log('\n📊 Current Memory State:');
    console.log('=======================');

    const remembered = this.getRememberedEntities();
    for (const entity of remembered) {
      console.log(`\n👤 ${entity.name} (${entity.type}):`);
      console.log(`   Memory Strength: ${entity.memoryStrength.toFixed(2)}`);
      console.log(`   Interactions: ${entity.interactionCount}`);
      console.log(`   Relationship: ${entity.relationship}`);
      console.log(`   Facts:`);

      for (const fact of entity.facts) {
        const status = fact.isRedacted ? '🔴' : '🟢';
        console.log(
          `     ${status} ${fact.content} [${fact.category}, strength: ${fact.strength.toFixed(2)}]`
        );
      }
    }

    // Demonstrate redaction
    console.log('\n🗑️ Memory Forgetting Demo:');
    console.log('=========================');

    // Simulate 30 days passing with logarithmic decay
    console.log('Simulating 30 days passing with logarithmic decay...');
    for (let i = 0; i < 30; i++) {
      for (const entity of this.entities.values()) {
        const timeSinceLastInteraction = Date.now() - entity.lastInteraction;
        const daysSinceInteraction =
          timeSinceLastInteraction / (24 * 60 * 60 * 1000);

        // Logarithmic decay: approaches minimum strength asymptotically
        entity.memoryStrength = this.minimumMemoryStrength + (entity.memoryStrength - this.minimumMemoryStrength) / (1 + this.baseForgettingRate * Math.log(1 + daysSinceInteraction + i));

        // Apply fact forgetting with logarithmic decay
        entity.facts.forEach((fact) => {
          const timeSinceDiscovered = Date.now() - fact.discoveredAt;
          const daysSinceDiscovered =
            timeSinceDiscovered / (24 * 60 * 60 * 1000);

          const adjustedFactStrength = this.minimumMemoryStrength + (fact.strength - this.minimumMemoryStrength) / (1 + this.baseForgettingRate * 1.5 * Math.log(1 + daysSinceDiscovered + i));

          fact.strength = Math.max(0, adjustedFactStrength);

          if (fact.strength < 0.3) {
            const forgettingLevel = 1 - fact.strength;
            Object.assign(fact, this.applyRedaction(fact, forgettingLevel));
          }
        });
      }
    }

    console.log('\nAfter 30 days:');
    const forgottenEntities = this.getRememberedEntities();
    for (const entity of forgottenEntities) {
      console.log(`\n👤 ${entity.name} (${entity.type}):`);
      console.log(`   Memory Strength: ${entity.memoryStrength.toFixed(2)}`);
      console.log(`   Facts:`);

      for (const fact of entity.facts) {
        const status = fact.isRedacted ? '🔴' : '🟢';
        console.log(
          `     ${status} ${fact.content} [${fact.category}, strength: ${fact.strength.toFixed(2)}]`
        );
      }
    }

    // Show completely forgotten entities
    const completelyForgotten = Array.from(this.entities.values()).filter(
      (e) => e.memoryStrength < 0.05
    );

    if (completelyForgotten.length > 0) {
      console.log('\n🗑️ Completely Forgotten Entities:');
      console.log('================================');
      for (const entity of completelyForgotten) {
        console.log(`   ❌ ${entity.name} - completely forgotten`);
      }
    }

    // Demonstrate search
    console.log('\n🔍 Searching for "farm":');
    console.log('========================');
    const farmSearch = this.searchByFact('farm');
    for (const entity of farmSearch) {
      console.log(`   Found ${entity.name}:`);
      for (const fact of entity.facts) {
        if (fact.content.toLowerCase().includes('farm')) {
          console.log(`     ${fact.content}`);
        }
      }
    }

    // Show comparison between exponential and logarithmic decay
    console.log('\n📈 Memory Decay Comparison:');
    console.log('==========================');

    const exponentialDecay = [];
    const logarithmicDecay = [];

    for (let day = 0; day <= 30; day++) {
      // Exponential decay (old way)
      const expDecay = Math.exp(-0.1 * day); // 10% per day
      exponentialDecay.push(expDecay);

      // Logarithmic decay (new way)
      const logDecay = 0.05 + (1.0 - 0.05) / (1 + 0.5 * Math.log(1 + day));
      logarithmicDecay.push(logDecay);
    }

    console.log('\nDay | Exponential | Logarithmic | Difference');
    console.log('----|------------|-------------|-----------');
    for (let day = 0; day <= 30; day += 5) {
      const exp = exponentialDecay[day];
      const log = logarithmicDecay[day];
      const diff = log - exp;
      console.log(`${day.toString().padStart(3)} | ${exp.toFixed(3).padStart(10)} | ${log.toFixed(3).padStart(11)} | ${diff.toFixed(3).padStart(9)}`);
    }

    console.log('\nKey Insight:');
    console.log('- Exponential decay drops quickly at first, then slowly');
    console.log('- Logarithmic decay drops more gradually over time');
    console.log('- With logarithmic decay, memories persist longer!');
  }

  private updateExistingEntity(
    entity: SocialEntity,
    encounter: SocialEncounter
  ): void {
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
      // Location update would go here
    }
  }

  private createNewEntity(encounter: SocialEncounter): void {
    const entity: SocialEntity = {
      id: encounter.entityId,
      name: encounter.entityId,
      type: 'player',
      relationship: 'neutral',
      firstEncountered: encounter.timestamp,
      lastInteraction: encounter.timestamp,
      interactionCount: 1,
      memoryStrength: 0.5,
      facts: [],
    };

    this.entities.set(entity.id, entity);
  }

  private async discoverFacts(encounter: SocialEncounter): Promise<void> {
    const entity = this.entities.get(encounter.entityId);
    if (!entity) return;

    // Generate some facts based on encounter
    const factTypes = [
      'personal',
      'location',
      'behavior',
      'personality',
    ] as const;
    const factType = factTypes[Math.floor(Math.random() * factTypes.length)];

    let factContent = '';
    switch (factType) {
      case 'personal':
        factContent = `${encounter.entityId} seems to be a friendly person.`;
        break;
      case 'location':
        factContent = `${encounter.entityId} was encountered in a village area.`;
        break;
      case 'behavior':
        factContent = `${encounter.entityId} likes to chat about various topics.`;
        break;
      case 'personality':
        factContent = `${encounter.entityId} appears to be helpful.`;
        break;
    }

    const fact: SocialFact = {
      id: `fact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: factContent,
      category: factType,
      confidence: 0.6 + Math.random() * 0.3,
      discoveredAt: Date.now(),
      lastReinforced: Date.now(),
      strength: 0.8,
      isRedacted: false,
      redactionLevel: 0,
      originalContent: factContent,
    };

    entity.facts.push(fact);
  }

  private boostMemoryStrength(entityId: string, boost: number): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    entity.memoryStrength = Math.min(1, entity.memoryStrength + boost * 2.0);
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
}

/**
 * Example usage
 */
export async function runSocialMemoryDemo(): Promise<void> {
  const memorySystem = new SocialMemoryDemo();
  await memorySystem.demonstrateMemorySystem();
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSocialMemoryDemo().catch(console.error);
}
