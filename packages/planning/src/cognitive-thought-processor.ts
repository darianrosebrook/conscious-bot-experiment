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

// -----------------------------------------------------------------------------
// Lightweight clients to decouple HTTP details
// -----------------------------------------------------------------------------
interface PlanningClient {
  addTask(task: any): Promise<{ ok: boolean; id?: string; error?: string }>;
}

class HttpPlanningClient implements PlanningClient {
  constructor(private base: string) {}
  async addTask(
    task: any
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    const res = await fetch(`${this.base}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
      signal: AbortSignal.timeout(5000),
    }).catch(
      (e) =>
        ({
          ok: false,
          status: 0,
          json: async () => ({ error: String(e) }),
        }) as any
    );
    if (!('ok' in res) || !res.ok) {
      return { ok: false, error: `HTTP ${(res as any).status || 0}` };
    }
    const json = await (res as any).json().catch(() => ({}));
    return { ok: true, id: json?.id };
  }
}

interface CognitiveClient {
  fetchRecentThoughts(
    sinceTs?: number,
    etag?: string
  ): Promise<{ thoughts: CognitiveThought[]; etag?: string }>;
}

class HttpCognitiveClient implements CognitiveClient {
  constructor(private base: string) {}
  async fetchRecentThoughts(
    sinceTs?: number,
    etag?: string
  ): Promise<{ thoughts: CognitiveThought[]; etag?: string }> {
    const url = new URL(`${this.base}/thoughts`);
    if (sinceTs) url.searchParams.set('since', String(sinceTs));
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (etag) headers['If-None-Match'] = etag;
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    if (!res) return { thoughts: [] };
    if (res.status === 304) {
      return { thoughts: [], etag };
    }
    if (!res.ok) return { thoughts: [] };
    const data = (await res.json().catch(() => ({}))) as any;
    return {
      thoughts: data.thoughts || [],
      etag: res.headers.get('ETag') || undefined,
    };
  }
}

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
    thoughtType: 'gather resources quickly',
    taskType: 'gather',
    priority: 0.9,
    urgency: 0.8,
    parameters: {
      resource: 'wood',
      amount: 3,
      target: 'tree',
      priority: 'urgent',
    },
    description: 'Gather wood and other resources quickly before nightfall',
  },
  {
    thoughtType: 'find some logs',
    taskType: 'gather',
    priority: 0.8,
    urgency: 0.7,
    parameters: { resource: 'wood', amount: 3, target: 'log' },
    description: 'Find and collect logs for crafting tools',
  },
  {
    thoughtType: 'craft tools',
    taskType: 'gather',
    priority: 0.8,
    urgency: 0.7,
    parameters: {
      resource: 'wood',
      amount: 4,
      target: 'tree',
      purpose: 'tools',
    },
    description: 'Gather wood to craft tools',
  },
  {
    thoughtType: 'start a fire',
    taskType: 'gather',
    priority: 0.7,
    urgency: 0.6,
    parameters: {
      resource: 'wood',
      amount: 2,
      target: 'tree',
      purpose: 'fire',
    },
    description: 'Gather wood to start a fire',
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
  private worldState: any = null; // Store current world state
  private lastWorldStateUpdate: number = 0;
  // IO clients
  private planning: PlanningClient;
  private cognitive: CognitiveClient;
  // fetch cursors / dedupe
  private lastEtag?: string;
  private lastSeenTs: number = 0;
  private recentTaskKeys: Map<string, number> = new Map(); // key -> ts
  private recentTaskTTLms: number = 30_000; // de-dupe window

  constructor(config: Partial<CognitiveThoughtProcessorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.planning = new HttpPlanningClient(this.config.planningEndpoint);
    this.cognitive = new HttpCognitiveClient(this.config.cognitiveEndpoint);
  }

  /**
   * Update world state from external source
   */
  updateWorldState(worldState: any): void {
    this.worldState = worldState;
    this.lastWorldStateUpdate = Date.now();
  }

  /**
   * Get current world state
   */
  getWorldState(): any {
    return this.worldState;
  }

  /**
   * Check if world state is available and recent
   */
  private isWorldStateAvailable(): boolean {
    return this.worldState && Date.now() - this.lastWorldStateUpdate < 30000; // 30 seconds
  }

  /**
   * Get available resources from world state
   */
  private getAvailableResources(): string[] {
    if (!this.isWorldStateAvailable()) {
      return [];
    }

    const resources: string[] = [];

    // Extract nearby blocks
    if (this.worldState.nearbyBlocks) {
      this.worldState.nearbyBlocks.forEach((block: any) => {
        if (block.type) {
          resources.push(block.type);
        }
      });
    }

    // Extract nearby entities
    if (this.worldState.nearbyEntities) {
      this.worldState.nearbyEntities.forEach((entity: any) => {
        if (entity.type) {
          resources.push(entity.type);
        }
      });
    }

    return resources;
  }

  /**
   * Check if a resource is available in the world
   */
  private isResourceAvailable(resourceType: string): boolean {
    const availableResources = this.getAvailableResources();
    return availableResources.some(
      (resource) =>
        resource.toLowerCase().includes(resourceType.toLowerCase()) ||
        resourceType.toLowerCase().includes(resource.toLowerCase())
    );
  }

  private worldAwareAdjustTask(task: any): any {
    // If we have world state, adjust feasibility
    const hasWorld = this.isWorldStateAvailable();
    if (!hasWorld) return task;
    const ttype = task.type;

    // Gathering wood but no tree-like blocks visible -> add exploration hint instead of changing type
    if (ttype === 'gathering' && task.parameters?.blockType === 'oak_log') {
      if (
        !this.isResourceAvailable('log') &&
        !this.isResourceAvailable('tree') &&
        !this.isResourceAvailable('oak')
      ) {
        // Instead of changing the task type, add metadata hints for the planner
        task.metadata = {
          ...task.metadata,
          worldAwareHints: {
            resourceScarce: true,
            suggestedPrerequisites: [
              {
                type: 'exploration',
                title: 'Explore for Trees',
                description:
                  'Explore nearby area to find trees before gathering wood',
                parameters: { distance: 12, search_pattern: 'spiral' },
                priority: 'high',
              },
            ],
            originalIntent: 'gathering',
            resourceType: 'oak_log',
          },
        };
      }
    }

    // Mining iron requires tool readiness; annotate prerequisite if likely missing
    if (ttype === 'mining' && /iron/i.test(task.title || '')) {
      // we don't have inventory here; leave a hint for the planner
      task.metadata = {
        ...task.metadata,
        prerequisites: [{ type: 'crafting', recipe: 'stone_pickaxe', qty: 1 }],
      };
    }

    // Placement torches: if no torches in sight, planner will craft—annotate intent
    if (ttype === 'placement' && task.parameters?.item === 'torch') {
      task.metadata = {
        ...task.metadata,
        mayRequire: [{ craft: 'torch', qty: task.parameters?.count || 3 }],
      };
    }
    return task;
  }

  /**
   * Start processing cognitive thoughts
   */
  startProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    const base = this.config.thoughtProcessingInterval;
    const jitter = Math.floor(Math.random() * Math.min(5000, base * 0.2));
    // immediate kick once (after jitter), then steady interval
    setTimeout(() => this.processThoughts(), jitter);
    this.processingInterval = setInterval(
      () => this.processThoughts(),
      base + jitter
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
      // Fetch recent thoughts using cursor/etag
      const { thoughts, etag } = await this.cognitive.fetchRecentThoughts(
        this.lastSeenTs,
        this.lastEtag
      );
      if (etag) this.lastEtag = etag;

      if (thoughts.length === 0) {
        return;
      }

      // Only log in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log(`Processing ${thoughts.length} cognitive thoughts`);
      }

      // Process newest-first within the batch (stable behavior)
      const batch = thoughts
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, this.config.maxThoughtsPerBatch);

      for (const thought of batch) {
        if (this.processedThoughts.has(thought.id)) {
          this.emit('skippedThought', {
            reason: 'alreadyProcessed',
            thoughtId: thought.id,
          });
          continue; // Skip already processed thoughts
        }

        const task = this.translateThoughtToTask(thought);
        if (task) {
          // de-dupe near-identical tasks in a short TTL window
          const key = this.taskKey(task);
          const now = Date.now();
          const prev = this.recentTaskKeys.get(key);
          if (prev && now - prev < this.recentTaskTTLms) {
            this.emit('skippedThought', {
              reason: 'duplicateTask',
              thoughtId: thought.id,
              key,
            });
          } else {
            this.emit('taskCandidate', { task, thoughtId: thought.id });
            await this.submitTaskToPlanning(task);
            this.recentTaskKeys.set(key, now);
          }
          this.processedThoughts.add(thought.id);

          // Only log in development mode
          if (process.env.NODE_ENV === 'development') {
            console.log(
              `Translated thought "${thought.content.substring(0, 50)}..." to task: ${task.type}`
            );
          }
        }
        this.lastSeenTs = Math.max(this.lastSeenTs, thought.timestamp || 0);
      }

      // Clean up old processed thought IDs
      this.cleanupProcessedThoughts();
    } catch (error) {
      console.error('Error processing cognitive thoughts:', error);
    }
  }

  /**
   * Translate a cognitive thought to an executable task
   */
  private translateThoughtToTask(thought: CognitiveThought): any | null {
    const content = thought.content.toLowerCase();

    // Skip thoughts that are just status updates or system messages
    if (this.isSystemThought(content)) {
      this.emit('skippedThought', { reason: 'system', thoughtId: thought.id });
      return null;
    }

    // Skip internal/intrusive by default
    if (thought.type === 'internal' || thought.type === 'intrusive') {
      this.emit('skippedThought', {
        reason: 'internalOrIntrusive',
        thoughtId: thought.id,
      });
      return null;
    }

    // Skip thoughts that are too generic
    if (this.isGenericThought(content)) {
      this.emit('skippedThought', { reason: 'generic', thoughtId: thought.id });
      return null;
    }

    // Find matching task mapping (synonym-aware)
    const mapping = this.findBestTaskMapping(this.normalizeContent(content));
    if (!mapping) {
      return null;
    }

    // Extract slots from the content to refine parameters
    const slots = this.extractSlots(content);

    // Create task from mapping with improved title and description
    const taskTitle = this.generateTaskTitle(thought.content, mapping);
    const taskDescription = this.generateTaskDescription(
      thought.content,
      mapping
    );

    let task = {
      id: `cognitive-task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title: taskTitle,
      type: this.canonicalTaskType(mapping.taskType),
      description: taskDescription,
      priority: this.calibratePriority(mapping.priority, thought),
      urgency: this.calibrateUrgency(mapping.urgency, thought),
      parameters: this.normalizeParameters(mapping.taskType, {
        ...mapping.parameters,
        ...slots,
      }),
      goal: this.determineGoalFromThought(thought),
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
      autonomous: true,
      source: 'cognitive_thought',
      originalThought: thought.content,
      cognitiveContext: thought.context,
      metadata: {
        origin: { thoughtId: thought.id, attribution: thought.attribution },
        worldSeenAt: this.lastWorldStateUpdate || null,
        confidence: this.estimateConfidence(content, mapping),
      },
    };

    // World-aware gating / prerequisites
    task = this.worldAwareAdjustTask(task);
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
      'i should plan my next actions',
      'what would be most beneficial',
      'the environment presents interesting challenges',
      'i should focus on completing this task',
      'processing current situation',
      'no content available',
      'status refreshed',
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
      const score = this.calculateMatchScore(
        content,
        this.normalizeContent(mapping.thoughtType)
      );
      if (score > bestScore) {
        bestScore = score;
        bestMatch = mapping;
      }
    }
    return bestScore > 0.35 ? bestMatch : null;
  }

  /**
   * Calculate how well a thought matches a task mapping
   */
  private calculateMatchScore(content: string, thoughtType: string): number {
    const a = new Set(content.split(/\s+/));
    const b = new Set(thoughtType.split(/\s+/));
    let inter = 0;
    b.forEach((w) => {
      if (a.has(w)) inter++;
    });
    // Sørensen–Dice like score
    return (2 * inter) / (a.size + b.size || 1);
  }

  private normalizeContent(s: string): string {
    const t = s
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return this.applySynonyms(t);
  }

  private applySynonyms(s: string): string {
    const syn: Record<string, string> = {
      logs: 'wood',
      timber: 'wood',
      planks: 'planks',
      stick: 'sticks',
      pick: 'pickaxe',
      pickax: 'pickaxe',
      ore: 'ore',
      shelter: 'shelter',
      cave: 'cave',
      light: 'torch',
      lights: 'torch',
      torches: 'torch',
      move: 'navigate',
      walk: 'navigate',
      go: 'navigate',
      flee: 'flee',
      run: 'flee',
      fight: 'attack',
    };
    const tokens = s.split(' ');
    const mapped = tokens.map((w) => syn[w] ?? w);
    return mapped.join(' ');
  }

  private extractSlots(content: string): Record<string, any> {
    const slots: Record<string, any> = {};
    // amount like "get 4 logs", "mine 3 iron"
    const numRes = content.match(
      /(\d+)\s*(logs?|planks?|sticks?|stone|cobblestone|iron|coal|torches?|torch|blocks?)/
    );
    if (numRes) {
      const n = parseInt(numRes[1], 10);
      if (!isNaN(n)) slots.amount = n;
      const unit = (numRes[2] || '').toLowerCase();
      if (unit) slots.resource = unit.replace(/s$/, '');
    }
    // distance like "move 10 blocks"
    const dist = content.match(/(\d+)\s*(blocks?|meters?)/);
    if (dist && !isNaN(parseInt(dist[1], 10))) {
      slots.distance = parseInt(dist[1], 10);
    }
    // explicit resource mentions
    if (/iron/.test(content)) slots.block = 'iron_ore';
    if (/coal/.test(content)) slots.block = 'coal_ore';
    if (/stone|cobblestone/.test(content)) slots.block = 'stone';
    if (/wood|log/.test(content)) slots.resource = 'wood';
    if (/torch|light/.test(content)) {
      slots.item = 'torch';
      slots.count = slots.amount || 3;
    }
    if (/pickaxe/.test(content)) {
      slots.item = 'wooden_pickaxe';
      slots.quantity = 1;
    }
    return slots;
  }

  private canonicalTaskType(t: string): string {
    const m: Record<string, string> = {
      gather: 'gathering',
      mine: 'mining',
      move: 'movement',
      move_forward: 'movement',
      explore: 'exploration',
      craft: 'crafting',
      build: 'building',
      seek_shelter: 'exploration',
      farm: 'farming',
      place_light: 'placement',
      attack_entity: 'combat',
      flee: 'navigation', // treated as movement away from threat
    };
    return m[t] || t;
  }

  private normalizeParameters(
    taskType: string,
    p: Record<string, any>
  ): Record<string, any> {
    const out = { ...p };
    // harmonize common fields used by planning/execution
    if (taskType === 'gather' || taskType === 'gathering') {
      if (out.resource === 'wood' && !out.blockType) out.blockType = 'oak_log';
      if (out.amount && !out.qty) out.qty = out.amount;
    }
    if (taskType === 'mine' || taskType === 'mining') {
      if (out.block && !out.blockType) out.blockType = out.block;
      if (out.amount && !out.qty) out.qty = out.amount;
    }
    if (taskType === 'craft' || taskType === 'crafting') {
      if (out.item && !out.recipe) out.recipe = out.item;
      if (out.quantity && !out.qty) out.qty = out.quantity;
      // common defaults
      if (!out.qty) out.qty = 1;
    }
    if (taskType === 'place_light' || taskType === 'placement') {
      if (out.item === 'torch') out.item = 'torch';
      if (!out.count && out.qty) out.count = out.qty;
    }
    if (taskType === 'move' || taskType === 'movement') {
      if (!out.distance) out.distance = 5;
    }
    return out;
  }

  private calibratePriority(base: number, thought: CognitiveThought): number {
    // slight lift for 'urgency' words in content
    const c = thought.content.toLowerCase();
    const bump = /(now|quickly|before night|danger)/.test(c) ? 0.05 : 0;
    return Math.max(0, Math.min(1, (base ?? 0.7) + bump));
  }

  private calibrateUrgency(base: number, thought: CognitiveThought): number {
    const c = thought.content.toLowerCase();
    const bump = /(danger|hunger|night|hostile)/.test(c) ? 0.1 : 0;
    return Math.max(0, Math.min(1, (base ?? 0.6) + bump));
  }

  private estimateConfidence(
    content: string,
    mapping: ThoughtToTaskMapping
  ): number {
    const score = this.calculateMatchScore(
      this.normalizeContent(content),
      this.normalizeContent(mapping.thoughtType)
    );
    return Math.max(0.3, Math.min(0.99, score));
  }

  /**
   * Generate a descriptive task title from thought content and mapping
   */
  private generateTaskTitle(
    content: string,
    mapping: ThoughtToTaskMapping
  ): string {
    const contentLower = content.toLowerCase();

    // Extract specific details from the thought content
    if (contentLower.includes('wood')) {
      return 'Gather Wood';
    }
    if (
      contentLower.includes('stone') ||
      contentLower.includes('cobblestone')
    ) {
      return 'Mine Stone';
    }
    if (contentLower.includes('pickaxe')) {
      return 'Craft Wooden Pickaxe';
    }
    if (contentLower.includes('cave')) {
      return 'Explore Cave System';
    }
    if (contentLower.includes('shelter')) {
      return 'Build Shelter';
    }
    if (contentLower.includes('torch') || contentLower.includes('light')) {
      return 'Place Torches';
    }
    if (contentLower.includes('food') || contentLower.includes('hunger')) {
      return 'Find Food';
    }
    if (contentLower.includes('iron') || contentLower.includes('ore')) {
      return 'Mine Iron Ore';
    }
    if (contentLower.includes('coal')) {
      return 'Mine Coal';
    }

    // Fallback to mapping-based title
    const action =
      mapping.taskType.charAt(0).toUpperCase() + mapping.taskType.slice(1);
    const target = mapping.description.split(' ').pop() || 'resources';
    return `${action} ${target}`;
  }

  /**
   * Generate a detailed task description from thought content and mapping
   */
  private generateTaskDescription(
    content: string,
    mapping: ThoughtToTaskMapping
  ): string {
    const contentLower = content.toLowerCase();

    // Create specific descriptions based on content
    if (contentLower.includes('wood')) {
      return 'Collect wood from nearby trees for crafting and building';
    }
    if (
      contentLower.includes('stone') ||
      contentLower.includes('cobblestone')
    ) {
      return 'Mine stone blocks for building materials and tools';
    }
    if (contentLower.includes('pickaxe')) {
      return 'Create a wooden pickaxe for mining stone and other materials';
    }
    if (contentLower.includes('cave')) {
      return 'Search for valuable resources in nearby cave systems';
    }
    if (contentLower.includes('shelter')) {
      return 'Build a safe shelter for protection and storage';
    }
    if (contentLower.includes('torch') || contentLower.includes('light')) {
      return 'Place torches to light up dark areas and prevent mob spawning';
    }
    if (contentLower.includes('food') || contentLower.includes('hunger')) {
      return 'Find food sources to maintain hunger levels';
    }
    if (contentLower.includes('iron') || contentLower.includes('ore')) {
      return 'Mine iron ore for crafting better tools and equipment';
    }
    if (contentLower.includes('coal')) {
      return 'Mine coal for fuel and torches';
    }

    // Fallback to mapping description
    return mapping.description;
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
    }
    return 'general_activity';
  }

  /**
   * Submit task to planning system
   */
  private async submitTaskToPlanning(task: any): Promise<void> {
    try {
      const result = await this.planning.addTask(task);
      if (!result.ok) {
        console.error(
          `Failed to submit task to planning system: ${result.error || 'unknown'}`
        );
        return;
      }
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

  private taskKey(task: any): string {
    const t = (task.title || '').toLowerCase();
    const ty = (task.type || '').toLowerCase();
    const p = JSON.stringify(task.parameters || {});
    return `${ty}::${t}::${p}`;
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
