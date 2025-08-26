/**
 * Cognitive Thought Processor
 *
 * Translates cognitive thoughts and reflections into executable tasks
 * for the planning system, bridging the gap between cognitive stream
 * and task execution.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';

export interface CognitiveThought {
  type: 'reflection' | 'observation' | 'planning' | 'internal' | 'intrusive';
  content: string;
  attribution: string;
  context?: any;
  metadata?: any;
  id: string;
  timestamp: number;
}

export interface ThoughtToTaskMapping {
  thoughtType: string;
  taskType: string;
  priority: number;
  urgency: number;
  parameters: Record<string, any>;
  description: string;
}

export interface CognitiveThoughtProcessorConfig {
  enableThoughtToTaskTranslation: boolean;
  thoughtProcessingInterval: number;
  maxThoughtsPerBatch: number;
  planningEndpoint: string;
  cognitiveEndpoint: string;
}

const DEFAULT_CONFIG: CognitiveThoughtProcessorConfig = {
  enableThoughtToTaskTranslation: true,
  thoughtProcessingInterval: 30000, // 30 seconds
  maxThoughtsPerBatch: 5,
  planningEndpoint: 'http://localhost:3002',
  cognitiveEndpoint: 'http://localhost:3003',
};

/**
 * Maps cognitive thoughts to executable tasks
 */
const THOUGHT_TO_TASK_MAPPINGS: ThoughtToTaskMapping[] = [
  // Specific gathering tasks
  {
    thoughtType: 'gather wood',
    taskType: 'gather',
    priority: 0.8,
    urgency: 0.6,
    parameters: { resource: 'wood', amount: 3, target: 'tree' },
    description: 'Gather wood from nearby trees',
  },
  {
    thoughtType: 'gather wood first',
    taskType: 'gather',
    priority: 0.9,
    urgency: 0.7,
    parameters: { resource: 'wood', amount: 4, target: 'tree' },
    description: 'Gather wood as first priority',
  },
  {
    thoughtType: 'need to gather wood',
    taskType: 'gather',
    priority: 0.8,
    urgency: 0.6,
    parameters: { resource: 'wood', amount: 3, target: 'tree' },
    description: 'Gather wood for crafting',
  },
  {
    thoughtType: 'gather stone',
    taskType: 'mine',
    priority: 0.8,
    urgency: 0.7,
    parameters: { block: 'stone', amount: 5 },
    description: 'Mine stone blocks for building',
  },
  {
    thoughtType: 'gather cobblestone',
    taskType: 'mine',
    priority: 0.8,
    urgency: 0.7,
    parameters: { block: 'cobblestone', amount: 8 },
    description: 'Mine cobblestone for tools',
  },
  {
    thoughtType: 'collect materials',
    taskType: 'gather',
    priority: 0.8,
    urgency: 0.7,
    parameters: { resource: 'any', amount: 2, search_radius: 10 },
    description: 'Collect materials for crafting',
  },

  // Specific exploration tasks
  {
    thoughtType: 'explore cave',
    taskType: 'explore',
    priority: 0.7,
    urgency: 0.6,
    parameters: { target: 'cave', distance: 15, depth: 10 },
    description: 'Explore cave systems for minerals',
  },
  {
    thoughtType: 'explore area',
    taskType: 'explore',
    priority: 0.6,
    urgency: 0.5,
    parameters: {
      distance: 12,
      direction: 'forward',
      search_pattern: 'spiral',
    },
    description: 'Explore the area for resources',
  },
  {
    thoughtType: 'find shelter',
    taskType: 'seek_shelter',
    priority: 0.9,
    urgency: 0.8,
    parameters: {
      shelter_type: 'cave_or_house',
      light_sources: true,
      search_radius: 20,
    },
    description: 'Find or build shelter',
  },

  // Specific crafting tasks
  {
    thoughtType: 'craft wooden pickaxe',
    taskType: 'craft',
    priority: 0.9,
    urgency: 0.8,
    parameters: {
      item: 'wooden_pickaxe',
      quantity: 1,
      require_materials: true,
    },
    description: 'Craft a wooden pickaxe',
  },
  {
    thoughtType: 'craft a wooden pickaxe',
    taskType: 'craft',
    priority: 0.9,
    urgency: 0.8,
    parameters: {
      item: 'wooden_pickaxe',
      quantity: 1,
      require_materials: true,
    },
    description: 'Craft a wooden pickaxe',
  },
  {
    thoughtType: 'make a wooden pickaxe',
    taskType: 'craft',
    priority: 0.9,
    urgency: 0.8,
    parameters: {
      item: 'wooden_pickaxe',
      quantity: 1,
      require_materials: true,
    },
    description: 'Craft a wooden pickaxe',
  },
  {
    thoughtType: 'craft wooden planks',
    taskType: 'craft',
    priority: 0.7,
    urgency: 0.6,
    parameters: { item: 'planks', quantity: 4, require_materials: true },
    description: 'Craft wooden planks',
  },
  {
    thoughtType: 'craft tools',
    taskType: 'craft',
    priority: 0.8,
    urgency: 0.7,
    parameters: { item: 'wooden_tools', quantity: 1, require_materials: true },
    description: 'Craft basic tools',
  },
  {
    thoughtType: 'craft planks',
    taskType: 'craft',
    priority: 0.7,
    urgency: 0.6,
    parameters: { item: 'planks', quantity: 4, require_materials: true },
    description: 'Craft wooden planks',
  },

  // Specific building tasks
  {
    thoughtType: 'build shelter',
    taskType: 'build',
    priority: 0.8,
    urgency: 0.7,
    parameters: {
      structure: 'shelter',
      size: 'small',
      materials: ['wood', 'stone'],
    },
    description: 'Build a basic shelter',
  },
  {
    thoughtType: 'build a shelter',
    taskType: 'build',
    priority: 0.8,
    urgency: 0.7,
    parameters: {
      structure: 'shelter',
      size: 'small',
      materials: ['wood', 'stone'],
    },
    description: 'Build a basic shelter',
  },
  {
    thoughtType: 'build a proper shelter',
    taskType: 'build',
    priority: 0.8,
    urgency: 0.7,
    parameters: {
      structure: 'shelter',
      size: 'medium',
      materials: ['wood', 'stone', 'cobblestone'],
    },
    description: 'Build a proper shelter',
  },
  {
    thoughtType: 'look for a good location to build',
    taskType: 'seek_shelter',
    priority: 0.7,
    urgency: 0.6,
    parameters: {
      shelter_type: 'cave_or_house',
      light_sources: true,
      search_radius: 20,
    },
    description: 'Find a good location for shelter',
  },
  {
    thoughtType: 'build house',
    taskType: 'build',
    priority: 0.8,
    urgency: 0.7,
    parameters: {
      structure: 'house',
      size: 'medium',
      materials: ['wood', 'stone', 'cobblestone'],
    },
    description: 'Build a house for shelter',
  },

  // Specific mining tasks
  {
    thoughtType: 'mine iron',
    taskType: 'mine',
    priority: 0.9,
    urgency: 0.8,
    parameters: { block: 'iron_ore', amount: 3, depth: 15 },
    description: 'Mine iron ore for tools',
  },
  {
    thoughtType: 'mine stone',
    taskType: 'mine',
    priority: 0.8,
    urgency: 0.7,
    parameters: { block: 'stone', amount: 5 },
    description: 'Mine stone for building',
  },
  {
    thoughtType: 'mine stone and cobblestone',
    taskType: 'mine',
    priority: 0.8,
    urgency: 0.7,
    parameters: { block: 'stone', amount: 8 },
    description: 'Mine stone and cobblestone for building',
  },
  {
    thoughtType: 'look for iron ore',
    taskType: 'mine',
    priority: 0.8,
    urgency: 0.7,
    parameters: { block: 'iron_ore', amount: 3, depth: 15 },
    description: 'Search for iron ore',
  },
  {
    thoughtType: 'mine coal',
    taskType: 'mine',
    priority: 0.7,
    urgency: 0.6,
    parameters: { block: 'coal_ore', amount: 5, depth: 10 },
    description: 'Mine coal for fuel',
  },

  // Specific movement tasks
  {
    thoughtType: 'move to safety',
    taskType: 'move',
    priority: 0.9,
    urgency: 0.9,
    parameters: {
      direction: 'away_from_threat',
      distance: 15,
      find_safe_spot: true,
    },
    description: 'Move to a safe location',
  },
  {
    thoughtType: 'walk forward',
    taskType: 'move_forward',
    priority: 0.5,
    urgency: 0.4,
    parameters: { distance: 5, check_obstacles: true },
    description: 'Walk forward carefully',
  },
  {
    thoughtType: 'navigate',
    taskType: 'move',
    priority: 0.6,
    urgency: 0.5,
    parameters: { distance: 8, direction: 'forward', avoid_hazards: true },
    description: 'Navigate to a location',
  },

  // Defensive tasks
  {
    thoughtType: 'flee',
    taskType: 'flee',
    priority: 0.9,
    urgency: 0.9,
    parameters: {
      direction: 'away_from_threat',
      distance: 20,
      find_shelter: true,
    },
    description: 'Flee from immediate danger',
  },
  {
    thoughtType: 'defend',
    taskType: 'flee',
    priority: 0.8,
    urgency: 0.8,
    parameters: {
      direction: 'away_from_threat',
      distance: 12,
      find_cover: true,
    },
    description: 'Take defensive action',
  },
  {
    thoughtType: 'avoid danger',
    taskType: 'flee',
    priority: 0.8,
    urgency: 0.7,
    parameters: {
      direction: 'away_from_threat',
      distance: 15,
      find_safe_spot: true,
    },
    description: 'Avoid dangerous situations',
  },

  // Combat tasks
  {
    thoughtType: 'attack enemy',
    taskType: 'attack_entity',
    priority: 0.8,
    urgency: 0.8,
    parameters: {
      target: 'nearest',
      weapon: 'best_available',
      aggressive: true,
    },
    description: 'Attack the nearest hostile entity',
  },
  {
    thoughtType: 'fight back',
    taskType: 'attack_entity',
    priority: 0.8,
    urgency: 0.8,
    parameters: {
      target: 'nearest',
      weapon: 'best_available',
      defensive: true,
    },
    description: 'Fight back against threats',
  },
  {
    thoughtType: 'defeat enemy',
    taskType: 'attack_entity',
    priority: 0.7,
    urgency: 0.7,
    parameters: {
      target: 'nearest',
      weapon: 'best_available',
      persistent: true,
    },
    description: 'Defeat the enemy',
  },
  {
    thoughtType: 'engage in combat',
    taskType: 'attack_entity',
    priority: 0.7,
    urgency: 0.7,
    parameters: {
      target: 'nearest',
      weapon: 'best_available',
      tactical: true,
    },
    description: 'Engage in combat with enemies',
  },
  {
    thoughtType: 'avoid danger',
    taskType: 'flee',
    priority: 0.9,
    urgency: 0.8,
    parameters: { direction: 'away_from_threat', distance: 10, stealth: true },
    description: 'Avoid immediate danger',
  },

  // Farming tasks
  {
    thoughtType: 'start farming',
    taskType: 'farm',
    priority: 0.6,
    urgency: 0.5,
    parameters: { crop: 'wheat', action: 'plant', area_size: 3 },
    description: 'Start farming activities',
  },
  {
    thoughtType: 'establish agriculture',
    taskType: 'farm',
    priority: 0.7,
    urgency: 0.6,
    parameters: { crop: 'wheat', action: 'establish', area_size: 5 },
    description: 'Establish agriculture',
  },

  // Lighting tasks
  {
    thoughtType: 'place light',
    taskType: 'place_light',
    priority: 0.7,
    urgency: 0.6,
    parameters: { light_type: 'torch', count: 5, strategic_placement: true },
    description: 'Place light sources strategically',
  },
  {
    thoughtType: 'add lighting',
    taskType: 'place_light',
    priority: 0.6,
    urgency: 0.5,
    parameters: { light_type: 'torch', count: 3, around_shelter: true },
    description: 'Add lighting around shelter',
  },
];

/**
 * Cognitive Thought Processor
 *
 * Processes cognitive thoughts and translates them into executable tasks
 */
export class CognitiveThoughtProcessor extends EventEmitter {
  private config: CognitiveThoughtProcessorConfig;
  private processedThoughts: Set<string> = new Set();
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<CognitiveThoughtProcessorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start processing cognitive thoughts
   */
  startProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    this.processingInterval = setInterval(
      () => this.processThoughts(),
      this.config.thoughtProcessingInterval
    );

    console.log('Cognitive thought processor started');
  }

  /**
   * Stop processing cognitive thoughts
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    console.log('Cognitive thought processor stopped');
  }

  /**
   * Process cognitive thoughts and translate to tasks
   */
  private async processThoughts(): Promise<void> {
    try {
      // Fetch recent thoughts from cognitive system
      const thoughts = await this.fetchRecentThoughts();

      if (thoughts.length === 0) {
        return;
      }

      // Only log in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log(`Processing ${thoughts.length} cognitive thoughts`);
      }

      // Process each thought
      for (const thought of thoughts.slice(
        0,
        this.config.maxThoughtsPerBatch
      )) {
        if (this.processedThoughts.has(thought.id)) {
          continue; // Skip already processed thoughts
        }

        const task = this.translateThoughtToTask(thought);
        if (task) {
          await this.submitTaskToPlanning(task);
          this.processedThoughts.add(thought.id);

          // Only log in development mode
          if (process.env.NODE_ENV === 'development') {
            console.log(
              `Translated thought "${thought.content.substring(0, 50)}..." to task: ${task.type}`
            );
          }
        }
      }

      // Clean up old processed thought IDs
      this.cleanupProcessedThoughts();
    } catch (error) {
      console.error('Error processing cognitive thoughts:', error);
    }
  }

  /**
   * Fetch recent thoughts from cognitive system
   */
  private async fetchRecentThoughts(): Promise<CognitiveThought[]> {
    try {
      const response = await fetch(
        `${this.config.cognitiveEndpoint}/thoughts`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as any;
      return data.thoughts || [];
    } catch (error) {
      console.error('Failed to fetch thoughts from cognitive system:', error);
      return [];
    }
  }

  /**
   * Translate a cognitive thought to an executable task
   */
  private translateThoughtToTask(thought: CognitiveThought): any | null {
    const content = thought.content.toLowerCase();

    // Skip thoughts that are just status updates or system messages
    if (this.isSystemThought(content)) {
      return null;
    }

    // Skip thoughts that are too generic
    if (this.isGenericThought(content)) {
      return null;
    }

    // Find matching task mapping
    const mapping = this.findBestTaskMapping(content);
    if (!mapping) {
      return null;
    }

    // Create task from mapping
    const task = {
      id: `cognitive-task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: mapping.taskType,
      description: mapping.description,
      priority: mapping.priority,
      urgency: mapping.urgency,
      parameters: mapping.parameters,
      goal: this.determineGoalFromThought(thought),
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
      autonomous: true,
      source: 'cognitive_thought',
      originalThought: thought.content,
      cognitiveContext: thought.context,
    };

    return task;
  }

  /**
   * Check if a thought is a system message that shouldn't generate tasks
   */
  private isSystemThought(content: string): boolean {
    const systemPatterns = [
      'bot state updated',
      'planning system updated',
      'memory system updated',
      'no content available',
      'status refreshed',
      'joined the world',
      'learning about',
      'successfully completed',
      'task completed',
      'task failed',
    ];

    return systemPatterns.some((pattern) => content.includes(pattern));
  }

  /**
   * Check if a thought is too generic to generate a specific task
   */
  private isGenericThought(content: string): boolean {
    const genericPatterns = [
      'i should gather some resources',
      'i could explore the environment',
      'i should plan my next actions',
      'what would be most beneficial',
      'the environment presents interesting challenges',
      'i should focus on completing this task',
      'i should continue gathering materials',
      'i can focus on gathering resources',
    ];

    return genericPatterns.some((pattern) =>
      content.toLowerCase().includes(pattern)
    );
  }

  /**
   * Find the best task mapping for a thought
   */
  private findBestTaskMapping(content: string): ThoughtToTaskMapping | null {
    let bestMatch: ThoughtToTaskMapping | null = null;
    let bestScore = 0;

    for (const mapping of THOUGHT_TO_TASK_MAPPINGS) {
      const score = this.calculateMatchScore(content, mapping.thoughtType);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = mapping;
      }
    }

    // Only return matches with a reasonable score
    return bestScore > 0.3 ? bestMatch : null;
  }

  /**
   * Calculate how well a thought matches a task mapping
   */
  private calculateMatchScore(content: string, thoughtType: string): number {
    const words = content.split(/\s+/);
    const targetWords = thoughtType.split(/\s+/);

    let matches = 0;
    for (const targetWord of targetWords) {
      if (
        words.some(
          (word) => word.includes(targetWord) || targetWord.includes(word)
        )
      ) {
        matches++;
      }
    }

    return matches / targetWords.length;
  }

  /**
   * Determine the goal category from the thought
   */
  private determineGoalFromThought(thought: CognitiveThought): string {
    const content = thought.content.toLowerCase();

    if (
      content.includes('survival') ||
      content.includes('defense') ||
      content.includes('flee')
    ) {
      return 'survival_defense';
    } else if (
      content.includes('gather') ||
      content.includes('collect') ||
      content.includes('resource')
    ) {
      return 'resource_gathering';
    } else if (content.includes('explore') || content.includes('discover')) {
      return 'exploration';
    } else if (
      content.includes('craft') ||
      content.includes('build') ||
      content.includes('make')
    ) {
      return 'crafting_building';
    } else if (content.includes('farm') || content.includes('agriculture')) {
      return 'farming';
    } else {
      return 'general_activity';
    }
  }

  /**
   * Submit task to planning system
   */
  private async submitTaskToPlanning(task: any): Promise<void> {
    try {
      const response = await fetch(`${this.config.planningEndpoint}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.error(
          `Failed to submit task to planning system: ${response.status}`
        );
        return;
      }

      const result = await response.json();
      console.log(
        `Task submitted successfully: ${task.type} - ${task.description}`
      );

      this.emit('taskSubmitted', { task, result });
    } catch (error) {
      console.error('Error submitting task to planning system:', error);
    }
  }

  /**
   * Clean up old processed thought IDs to prevent memory leaks
   */
  private cleanupProcessedThoughts(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const thoughtIds = Array.from(this.processedThoughts);

    for (const thoughtId of thoughtIds) {
      // Extract timestamp from thought ID if possible
      const timestampMatch = thoughtId.match(/(\d+)/);
      if (timestampMatch) {
        const timestamp = parseInt(timestampMatch[1]);
        if (timestamp < oneHourAgo) {
          this.processedThoughts.delete(thoughtId);
        }
      }
    }
  }

  /**
   * Manually process a specific thought
   */
  async processThought(thought: CognitiveThought): Promise<any | null> {
    const task = this.translateThoughtToTask(thought);
    if (task) {
      await this.submitTaskToPlanning(task);
      this.processedThoughts.add(thought.id);
    }
    return task;
  }
}
