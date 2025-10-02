/**
 * Minecraft Memory Test Data Generator
 *
 * Generates realistic Minecraft memory data for benchmarking and testing
 * the enhanced memory system. Creates diverse scenarios covering all
 * aspects of Minecraft gameplay.
 *
 * @author @darianrosebrook
 */

import { faker } from '@faker-js/faker';
import { MemoryChunk, ChunkMetadata } from '../vector-database';
import { ChunkingService, ChunkingConfig } from '../chunking-service';
import { EmbeddingService, EmbeddingResult } from '../embedding-service';

export interface TestMemoryOptions {
  worldName?: string;
  seed?: number;
  count: number;
  types: Array<
    'experience' | 'thought' | 'knowledge' | 'observation' | 'dialogue'
  >;
  includeSpatialData?: boolean;
  includeTemporalData?: boolean;
  complexity: 'simple' | 'medium' | 'complex';
}

export interface GeneratedMemory {
  id: string;
  content: string;
  type: string;
  metadata: ChunkMetadata;
  expectedKeywords: string[];
  expectedEntities: string[];
  expectedTopics: string[];
}

export interface TestDataset {
  memories: GeneratedMemory[];
  queries: Array<{
    query: string;
    expectedRelevantIds: string[];
    expectedIrrelevantIds: string[];
    difficulty: 'easy' | 'medium' | 'hard';
    type: 'exact' | 'semantic' | 'contextual' | 'temporal' | 'spatial';
  }>;
  metadata: {
    totalMemories: number;
    typeDistribution: Record<string, number>;
    world: string;
    seed: number;
    generatedAt: number;
  };
}

/**
 * Realistic Minecraft memory content generators
 */
const MEMORY_GENERATORS = {
  experience: {
    simple: [
      'Found iron ore while mining in a cave',
      'Crafted a wooden pickaxe from logs',
      'Built a small house using cobblestone',
      'Planted wheat seeds in tilled soil',
      'Killed a zombie with a stone sword',
    ],
    medium: [
      'Successfully mined diamonds after hours of cave exploration and careful branch mining',
      'Built an automated farm with water streams and collection system for wheat and carrots',
      'Defeated the Ender Dragon using a carefully crafted set of diamond armor and enchanted bow',
      'Constructed a redstone door mechanism with pressure plates and pistons for base security',
      'Established a villager trading hall with farmers, librarians, and blacksmith workstations',
    ],
    complex: [
      'Developed an advanced mining strategy combining branch mining at Y=11 with perimeter scanning, resulting in consistent diamond yields while maintaining cave safety through proper lighting and mob control',
      'Engineered a complex redstone contraption involving minecart dispensers, hoppers, and comparator circuits to create an automated item sorting and storage system with overflow protection',
      'Conducted extensive experimentation with potion brewing, discovering optimal ingredient ratios and timing for strength, regeneration, and fire resistance potions used in Nether exploration',
      'Implemented a multi-level perimeter defense system around the main base including lava moats, arrow towers, iron golem patrols, and redstone-activated trap mechanisms',
      'Organized a large-scale resource acquisition operation involving multiple biomes, transportation networks, and storage facilities to support construction of a massive castle complex',
    ],
  },
  knowledge: {
    simple: [
      'Iron tools are better than stone tools',
      'Wooden planks can be crafted from any type of wood',
      'Torches prevent mob spawning in lit areas',
      'Water flows down and spreads horizontally',
      'Creepers explode when they get close to players',
    ],
    medium: [
      'Diamond armor provides the best protection but requires diamonds which are found at Y-level 11',
      'Redstone mechanisms can be powered by redstone torches, levers, pressure plates, and buttons',
      'Potion brewing requires a brewing stand, blaze powder, and various ingredients like nether wart',
      'Villagers can be transported using minecarts and boats for establishing trading posts',
      'End portal frames require 12 eyes of ender to activate and reach the End dimension',
    ],
    complex: [
      "Advanced redstone computing principles involve binary logic gates, memory cells, and arithmetic units constructed from redstone components, enabling the creation of complex automated systems and even basic calculators within Minecraft's physics engine",
      'Optimal Nether fortress navigation combines fortress bounding box mathematics, wither skeleton spawn mechanics, and blaze rod farming efficiency calculations to maximize loot acquisition while minimizing risk exposure',
      'End game progression optimization requires strategic stronghold triangulation using eye of ender flight patterns, combined with portal room prediction algorithms and equipment preparation for Ender Dragon combat',
      'Large-scale automated resource processing networks involve complex hopper chains, item filters, and overflow management systems designed to handle multiple simultaneous production lines',
      'Multi-dimensional transportation logistics encompass nether portal coordinate calculations, ice highway construction, and inventory management systems for efficient resource distribution across large Minecraft worlds',
    ],
  },
  thought: {
    simple: [
      'I should build a better shelter before night falls',
      'I need more torches to light up this cave',
      'This location seems good for a base',
      'I should be more careful around water',
      'I need to organize my inventory better',
    ],
    medium: [
      "The cave system I'm exploring seems extensive and could contain valuable resources, but I need to be careful about getting lost and ensure I have enough food and light sources",
      'This village could be a great trading opportunity, but I should check if there are any hostile mobs nearby and consider building some basic defenses first',
      'The redstone components I found suggest there might be a larger mechanism here, I should investigate carefully and document what I find',
      'This mountain biome has great views but difficult terrain, I should consider building transportation systems like minecart tracks or ice paths',
      'The weather is getting stormy which means reduced visibility, I should head back to base or find immediate shelter to avoid lightning strikes',
    ],
    complex: [
      'Given the current resource constraints and the approaching night cycle, I need to prioritize shelter construction over resource gathering, but the presence of a nearby village suggests trading opportunities that could accelerate early-game progression if I can establish safe passage',
      "The redstone mechanism I've discovered appears to be part of a larger contraption involving multiple signal paths and timing components, suggesting the work of an experienced player, which raises questions about potential conflicts or collaborative opportunities in this multiplayer environment",
      "The cave system mapping I've been conducting reveals a complex network that could serve as an efficient mining operation, but the presence of lava flows and mob spawners requires careful engineering solutions involving water placement, lighting strategies, and emergency escape routes",
      "The agricultural project I've been developing needs to scale from basic crop farms to include animal husbandry and automated harvesting, which will require sophisticated redstone timing mechanisms and inventory management systems to maintain efficiency",
      "The defensive perimeter I'm planning must account for multiple threat vectors including ground-based mob attacks, aerial phantoms, and potential player intrusions, necessitating a multi-layered approach combining natural barriers, redstone traps, and surveillance systems",
    ],
  },
  observation: {
    simple: [
      'There are cows grazing in the plains biome',
      'I can see a village in the distance',
      'The sun is setting over the mountains',
      'I hear zombies making noise underground',
      'There are trees and flowers in this meadow',
    ],
    medium: [
      'A village with multiple buildings suggests established trade routes and potential iron golem protection, but the lack of external lighting indicates vulnerability during night cycles',
      "The cave entrance I'm observing shows signs of previous exploration including placed torches and minecart tracks, indicating either former inhabitants or current activity",
      'The weather patterns in this biome seem to follow predictable cycles with rain occurring every 3-4 days, which could be useful for planning agricultural activities',
      'Multiple mob types are visible in this area including passive animals and neutral/hostile creatures, suggesting a balanced ecosystem that could support both farming and combat training',
      "The terrain features I'm mapping show natural chokepoints and defensive positions that could be strategically valuable for base construction or ambush prevention",
    ],
    complex: [
      'The settlement pattern analysis reveals a complex socio-economic structure with specialized buildings for different professions, defensive architecture indicating historical raid concerns, and agricultural infrastructure suggesting long-term sustainability planning',
      'The geological survey data indicates rich mineral deposits at multiple depth levels with intersecting cave systems that create natural transportation networks, but also present significant safety hazards requiring engineered solutions',
      'The ecosystem mapping project shows complex biome interactions with edge effects creating unique resource concentrations, but also generating unusual mob spawning patterns that require careful navigation strategies',
      'The infrastructure analysis reveals abandoned redstone projects with sophisticated power distribution systems and data transmission networks that suggest advanced technical capabilities beyond typical survival gameplay',
      'The temporal activity patterns observed across multiple game days indicate intelligent scheduling behaviors with peak activity during optimal lighting conditions and strategic positioning during high-risk periods',
    ],
  },
};

/**
 * Minecraft entities, items, and concepts for realistic content generation
 */
const MINECRAFT_VOCABULARY = {
  entities: [
    'creeper',
    'zombie',
    'skeleton',
    'spider',
    'enderman',
    'witch',
    'blaze',
    'ghast',
    'villager',
    'iron golem',
    'wolf',
    'cat',
    'horse',
    'cow',
    'sheep',
    'pig',
    'chicken',
    'player',
    'steve',
    'alex',
    'wither',
    'ender dragon',
    'guardian',
    'elder guardian',
  ],
  items: [
    'diamond',
    'iron',
    'gold',
    'coal',
    'redstone',
    'lapis',
    'emerald',
    'pickaxe',
    'sword',
    'axe',
    'shovel',
    'hoe',
    'armor',
    'helmet',
    'chestplate',
    'leggings',
    'boots',
    'bow',
    'arrow',
    'shield',
    'torch',
    'crafting table',
    'furnace',
    'chest',
    'hopper',
    'minecart',
    'rail',
    'lever',
    'button',
    'pressure plate',
  ],
  blocks: [
    'cobblestone',
    'stone',
    'dirt',
    'grass',
    'wood',
    'planks',
    'log',
    'leaves',
    'sand',
    'gravel',
    'water',
    'lava',
    'obsidian',
    'bedrock',
    'ore',
    'mineral',
  ],
  biomes: [
    'plains',
    'forest',
    'desert',
    'taiga',
    'tundra',
    'savanna',
    'jungle',
    'swamp',
    'mountains',
    'hills',
    'ocean',
    'river',
    'cave',
    'nether',
    'end',
  ],
  concepts: [
    'crafting',
    'mining',
    'building',
    'farming',
    'exploration',
    'combat',
    'redstone',
    'survival',
    'creative',
    'adventure',
    'mechanics',
    'strategy',
    'automation',
  ],
};

/**
 * Test Data Generator for Minecraft Memory System
 */
export class TestDataGenerator {
  private chunkingService: ChunkingService;
  private embeddingService: EmbeddingService;

  constructor(
    chunkingService: ChunkingService,
    embeddingService: EmbeddingService
  ) {
    this.chunkingService = chunkingService;
    this.embeddingService = embeddingService;
  }

  /**
   * Generate a complete test dataset
   */
  async generateTestDataset(options: TestMemoryOptions): Promise<TestDataset> {
    console.log(`🎲 Generating test dataset with ${options.count} memories...`);

    const memories = await this.generateMemories(options);
    const queries = this.generateQueries(memories, options);

    const dataset: TestDataset = {
      memories,
      queries,
      metadata: {
        totalMemories: memories.length,
        typeDistribution: this.calculateTypeDistribution(memories),
        world: options.worldName || 'TestWorld',
        seed: options.seed || Math.floor(Math.random() * 1000000),
        generatedAt: Date.now(),
      },
    };

    console.log(
      `✅ Generated ${memories.length} memories and ${queries.length} test queries`
    );
    return dataset;
  }

  /**
   * Generate realistic memory content
   */
  private async generateMemories(
    options: TestMemoryOptions
  ): Promise<GeneratedMemory[]> {
    const memories: GeneratedMemory[] = [];

    for (let i = 0; i < options.count; i++) {
      const type =
        options.types[Math.floor(Math.random() * options.types.length)];
      const complexity = options.complexity;

      const memory = await this.generateSingleMemory(
        type,
        complexity,
        options,
        i
      );
      memories.push(memory);
    }

    return memories;
  }

  /**
   * Generate a single memory with realistic content
   */
  private async generateSingleMemory(
    type: string,
    complexity: string,
    options: TestMemoryOptions,
    index: number
  ): Promise<GeneratedMemory> {
    // Generate realistic content based on type and complexity
    const templates = MEMORY_GENERATORS[type as keyof typeof MEMORY_GENERATORS];
    const contentTemplates = templates[complexity as keyof typeof templates];
    const content =
      contentTemplates[Math.floor(Math.random() * contentTemplates.length)];

    // Extract expected keywords, entities, and topics
    const expectedKeywords = this.extractKeywords(content);
    const expectedEntities = this.extractEntities(content);
    const expectedTopics = this.extractTopics(content);

    // Generate metadata
    const chunkingMetadata = {
      type: type as any,
      confidence: 0.7 + Math.random() * 0.3, // 0.7-1.0 confidence
      source: 'test-generator',
      timestamp: Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000, // Last 30 days
      entities: expectedEntities,
      topics: expectedTopics,
      importance: this.calculateImportance(content, type),
    };

    const metadata: ChunkMetadata = {
      id: `test-${Date.now()}-${Math.random()}`,
      content,
      embedding: new Array(768).fill(0),
      metadata: chunkingMetadata,
    };

    // Add spatial context if requested
    if (options.includeSpatialData) {
      metadata.metadata.world = options.worldName || 'TestWorld';
      metadata.metadata.position = {
        x: Math.floor(Math.random() * 1000) - 500,
        y: Math.floor(Math.random() * 256),
        z: Math.floor(Math.random() * 1000) - 500,
      };
    }

    return {
      id: `test-memory-${index}-${Date.now()}`,
      content,
      type,
      metadata,
      expectedKeywords,
      expectedEntities,
      expectedTopics,
    };
  }

  /**
   * Generate test queries based on the generated memories
   */
  private generateQueries(
    memories: GeneratedMemory[],
    options: TestMemoryOptions
  ): TestDataset['queries'] {
    const queries: TestDataset['queries'] = [];

    // Generate exact match queries
    const exactQueries = this.generateExactQueries(memories);
    queries.push(...exactQueries);

    // Generate semantic queries
    const semanticQueries = this.generateSemanticQueries(memories);
    queries.push(...semanticQueries);

    // Generate contextual queries
    const contextualQueries = this.generateContextualQueries(memories);
    queries.push(...contextualQueries);

    // Generate temporal queries (if temporal data included)
    if (options.includeTemporalData) {
      const temporalQueries = this.generateTemporalQueries(memories);
      queries.push(...temporalQueries);
    }

    // Generate spatial queries (if spatial data included)
    if (options.includeSpatialData) {
      const spatialQueries = this.generateSpatialQueries(memories);
      queries.push(...spatialQueries);
    }

    return queries;
  }

  /**
   * Generate exact match queries
   */
  private generateExactQueries(
    memories: GeneratedMemory[]
  ): TestDataset['queries'] {
    const queries: TestDataset['queries'] = [];

    memories.forEach((memory) => {
      // Use some keywords from the memory as exact queries
      const keywords = memory.expectedKeywords.slice(0, 2);
      if (keywords.length > 0) {
        const queryText = keywords.join(' ');

        queries.push({
          query: queryText,
          expectedRelevantIds: [memory.id],
          expectedIrrelevantIds: memories
            .filter((m) => m.id !== memory.id)
            .slice(0, 5)
            .map((m) => m.id),
          difficulty: 'easy',
          type: 'exact',
        });
      }
    });

    return queries;
  }

  /**
   * Generate semantic queries
   */
  private generateSemanticQueries(
    memories: GeneratedMemory[]
  ): TestDataset['queries'] {
    const queries: TestDataset['queries'] = [];

    // Group memories by topic
    const topicGroups = new Map<string, GeneratedMemory[]>();
    memories.forEach((memory) => {
      memory.expectedTopics.forEach((topic) => {
        if (!topicGroups.has(topic)) {
          topicGroups.set(topic, []);
        }
        topicGroups.get(topic)!.push(memory);
      });
    });

    // Generate queries for each topic
    topicGroups.forEach((memoriesInTopic, topic) => {
      if (memoriesInTopic.length >= 3) {
        queries.push({
          query: `information about ${topic}`,
          expectedRelevantIds: memoriesInTopic.slice(0, 3).map((m) => m.id),
          expectedIrrelevantIds: memories
            .filter((m) => !memoriesInTopic.includes(m))
            .slice(0, 3)
            .map((m) => m.id),
          difficulty: 'medium',
          type: 'semantic',
        });
      }
    });

    return queries;
  }

  /**
   * Generate contextual queries
   */
  private generateContextualQueries(
    memories: GeneratedMemory[]
  ): TestDataset['queries'] {
    const queries: TestDataset['queries'] = [];

    // Entity-based queries
    const entityGroups = new Map<string, GeneratedMemory[]>();
    memories.forEach((memory) => {
      memory.expectedEntities.forEach((entity) => {
        if (!entityGroups.has(entity)) {
          entityGroups.set(entity, []);
        }
        entityGroups.get(entity)!.push(memory);
      });
    });

    entityGroups.forEach((memoriesWithEntity, entity) => {
      if (memoriesWithEntity.length >= 2) {
        queries.push({
          query: `how to deal with ${entity}`,
          expectedRelevantIds: memoriesWithEntity.slice(0, 2).map((m) => m.id),
          expectedIrrelevantIds: memories
            .filter((m) => !memoriesWithEntity.includes(m))
            .slice(0, 2)
            .map((m) => m.id),
          difficulty: 'hard',
          type: 'contextual',
        });
      }
    });

    return queries;
  }

  /**
   * Generate temporal queries
   */
  private generateTemporalQueries(
    memories: GeneratedMemory[]
  ): TestDataset['queries'] {
    const queries: TestDataset['queries'] = [];

    // Recent memories (last 7 days)
    const recentMemories = memories.filter((m) => {
      const age = Date.now() - m.metadata.metadata.timestamp;
      return age < 7 * 24 * 60 * 60 * 1000; // 7 days
    });

    if (recentMemories.length >= 3) {
      queries.push({
        query: 'recent activities',
        expectedRelevantIds: recentMemories.slice(0, 3).map((m) => m.id),
        expectedIrrelevantIds: memories
          .filter((m) => !recentMemories.includes(m))
          .slice(0, 2)
          .map((m) => m.id),
        difficulty: 'medium',
        type: 'temporal',
      });
    }

    return queries;
  }

  /**
   * Generate spatial queries
   */
  private generateSpatialQueries(
    memories: GeneratedMemory[]
  ): TestDataset['queries'] {
    const queries: TestDataset['queries'] = [];

    // Location-based queries
    const locationGroups = new Map<string, GeneratedMemory[]>();
    memories.forEach((memory) => {
      if (memory.metadata.metadata.world) {
        if (!locationGroups.has(memory.metadata.metadata.world)) {
          locationGroups.set(memory.metadata.metadata.world, []);
        }
        locationGroups.get(memory.metadata.metadata.world)!.push(memory);
      }
    });

    locationGroups.forEach((memoriesInWorld, world) => {
      if (memoriesInWorld.length >= 3) {
        queries.push({
          query: `activities in ${world}`,
          expectedRelevantIds: memoriesInWorld.slice(0, 3).map((m) => m.id),
          expectedIrrelevantIds: memories
            .filter((m) => !memoriesInWorld.includes(m))
            .slice(0, 2)
            .map((m) => m.id),
          difficulty: 'medium',
          type: 'spatial',
        });
      }
    });

    return queries;
  }

  /**
   * Extract keywords from content
   */
  private extractKeywords(content: string): string[] {
    const keywords: string[] = [];

    // Extract Minecraft-specific terms
    Object.values(MINECRAFT_VOCABULARY).forEach((category) => {
      category.forEach((term) => {
        if (content.toLowerCase().includes(term)) {
          keywords.push(term);
        }
      });
    });

    return [...new Set(keywords)];
  }

  /**
   * Extract entities from content
   */
  private extractEntities(content: string): string[] {
    const entities: string[] = [];

    MINECRAFT_VOCABULARY.entities.forEach((entity) => {
      if (content.toLowerCase().includes(entity)) {
        entities.push(entity);
      }
    });

    return [...new Set(entities)];
  }

  /**
   * Extract topics from content
   */
  private extractTopics(content: string): string[] {
    const topics: string[] = [];

    MINECRAFT_VOCABULARY.concepts.forEach((concept) => {
      if (content.toLowerCase().includes(concept)) {
        topics.push(concept);
      }
    });

    return [...new Set(topics)];
  }

  /**
   * Calculate importance score
   */
  private calculateImportance(content: string, type: string): number {
    let importance = 0.5;

    // Base importance by type
    const typeBoosts: Record<string, number> = {
      knowledge: 0.2,
      experience: 0.15,
      thought: 0.1,
      observation: 0.05,
    };

    importance += typeBoosts[type] || 0;

    // Boost for technical content
    const technicalTerms = [
      'redstone',
      'mechanism',
      'circuit',
      'automation',
      'strategy',
    ];
    const technicalCount = technicalTerms.filter((term) =>
      content.toLowerCase().includes(term)
    ).length;

    importance += technicalCount * 0.05;

    // Boost for longer content
    if (content.length > 200) {
      importance += 0.1;
    }

    return Math.min(1.0, importance);
  }

  /**
   * Calculate type distribution
   */
  private calculateTypeDistribution(
    memories: GeneratedMemory[]
  ): Record<string, number> {
    const distribution: Record<string, number> = {};

    memories.forEach((memory) => {
      distribution[memory.type] = (distribution[memory.type] || 0) + 1;
    });

    return distribution;
  }

  /**
   * Export dataset to JSON file
   */
  exportToJSON(dataset: TestDataset, filename: string): void {
    const jsonContent = JSON.stringify(dataset, null, 2);

    // In a real implementation, this would write to a file
    console.log(
      `📄 Exporting dataset to ${filename} (${jsonContent.length} characters)`
    );
  }

  /**
   * Import dataset from JSON file
   */
  static importFromJSON(jsonContent: string): TestDataset {
    const dataset = JSON.parse(jsonContent) as TestDataset;

    // Validate structure
    if (!dataset.memories || !dataset.queries || !dataset.metadata) {
      throw new Error('Invalid test dataset format');
    }

    return dataset;
  }
}
