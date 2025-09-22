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
import {
  MCPIntegration,
  ToolDiscoveryResult,
  GoalToolMatch,
  ToolExecutionResult,
} from './modules/mcp-integration';
import {
  SignalExtractionPipeline,
  MemoryBackedExtractor,
  LLMExtractor,
  HeuristicExtractor,
  type Signal,
  type SignalType
} from './signal-extraction-pipeline';

export interface CognitiveThought {
  type:
    | 'reflection'
    | 'observation'
    | 'planning'
    | 'internal'
    | 'intrusive'
    | 'decision';
  content: string;
  attribution: string;
  context?: any;
  metadata?: any;
  category?: string;
  priority?: 'low' | 'medium' | 'high';
  id: string;
  timestamp: number;
}

export interface CognitiveThoughtProcessorConfig {
  enableThoughtToTaskTranslation: boolean;
  thoughtProcessingInterval: number;
  maxThoughtsPerBatch: number;
  planningEndpoint: string;
  cognitiveEndpoint: string;
  memoryEndpoint?: string;
  enableMemoryIntegration?: boolean;
  // NEW: MCP Integration configuration
  enableMCPIntegration?: boolean;
  mcpEndpoint?: string;
  enableToolDiscovery?: boolean;
  maxToolsPerThought?: number;
  toolExecutionTimeout?: number;
  // NEW: Signal Extraction Pipeline configuration
  enableSignalPipeline?: boolean; // Enable new signal extraction pipeline
  signalConfidenceThreshold?: number; // Minimum confidence for signals (default 0.3)
}

const DEFAULT_CONFIG: CognitiveThoughtProcessorConfig = {
  enableThoughtToTaskTranslation: true,
  thoughtProcessingInterval: 30000, // 30 seconds
  maxThoughtsPerBatch: 5,
  planningEndpoint: 'http://localhost:3002',
  cognitiveEndpoint: 'http://localhost:3003',
  memoryEndpoint: process.env.MEMORY_ENDPOINT || 'http://localhost:3001',
  enableMemoryIntegration: true,
  // NEW: MCP Integration defaults
  enableMCPIntegration: true,
  mcpEndpoint: process.env.MCP_ENDPOINT || 'http://localhost:3000',
  enableToolDiscovery: true,
  maxToolsPerThought: 3,
  toolExecutionTimeout: 30000,
};

// -----------------------------------------------------------------------------
// Lightweight clients to decouple HTTP details
// -----------------------------------------------------------------------------
interface PlanningClient {
  addTask(task: any): Promise<{ ok: boolean; id?: string; error?: string }>;
}

interface MemoryClient {
  getMemoryEnhancedContext(context: {
    query?: string;
    taskType?: string;
    entities?: string[];
    location?: any;
    recentEvents?: any[];
    maxMemories?: number;
  }): Promise<{
    memories: any[];
    insights: string[];
    recommendations: string[];
    confidence: number;
  }>;
  addThoughtToMemory(thought: CognitiveThought): Promise<boolean>;
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

class HttpMemoryClient implements MemoryClient {
  constructor(private base: string) {}

  async getMemoryEnhancedContext(context: {
    query?: string;
    taskType?: string;
    entities?: string[];
    location?: any;
    recentEvents?: any[];
    maxMemories?: number;
  }): Promise<{
    memories: any[];
    insights: string[];
    recommendations: string[];
    confidence: number;
  }> {
    try {
      const response = await fetch(`${this.base}/memory-enhanced-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context),
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        return {
          memories: [],
          insights: ['Memory system unavailable'],
          recommendations: ['Consider retrying later'],
          confidence: 0.0,
        };
      }

      const result = await response.json();
      return result as {
        memories: any[];
        insights: string[];
        recommendations: string[];
        confidence: number;
      };
    } catch (error) {
      console.error('Memory client error:', error);
      return {
        memories: [],
        insights: ['Memory system error occurred'],
        recommendations: ['Consider using fallback planning'],
        confidence: 0.0,
      };
    }
  }

  async addThoughtToMemory(thought: CognitiveThought): Promise<boolean> {
    try {
      const response = await fetch(`${this.base}/thought`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thought),
        signal: AbortSignal.timeout(2000),
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to add thought to memory:', error);
      return false;
    }
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
 * Dynamic thought interpretation based on behavior tree context
 *
 * Instead of hardcoded mappings, we use the behavior tree to interpret
 * thoughts contextually based on the bot's current state and needs.
 * This allows for emergent, adaptive behavior rather than prescriptive responses.
 */

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
  private memory?: MemoryClient;
  private lastActivityCheck: number = 0;
  // NEW: MCP Integration
  private mcpIntegration?: MCPIntegration;
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

    // Initialize memory client if enabled
    if (this.config.enableMemoryIntegration && this.config.memoryEndpoint) {
      this.memory = new HttpMemoryClient(this.config.memoryEndpoint);
    }

    // NEW: Initialize MCP integration if enabled
    if (this.config.enableMCPIntegration) {
      this.mcpIntegration = new MCPIntegration({
        enableMCP: true,
        enableToolDiscovery: this.config.enableToolDiscovery,
        toolDiscoveryEndpoint: this.config.mcpEndpoint,
        maxToolsPerGoal: this.config.maxToolsPerThought,
        toolTimeoutMs: this.config.toolExecutionTimeout,
      });

      // Initialize MCP integration (async, but fire-and-forget since constructor can't be async)
      void this.mcpIntegration.initialize();
    }
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
      // Generate thoughts dynamically based on current state and memory
      console.log(
        '🔄 [COGNITIVE THOUGHT PROCESSOR] Generating thoughts dynamically...'
      );
      const thoughts = await this.generateThoughtsFromContext();

      console.log(
        `🔄 [COGNITIVE THOUGHT PROCESSOR] Generated ${thoughts.length} thoughts`
      );

      if (thoughts.length === 0) {
        console.log(
          '🔄 [COGNITIVE THOUGHT PROCESSOR] No thoughts generated, checking memory for context...'
        );
        // Generate thoughts based on memory context
        const memoryThoughts = await this.generateThoughtsFromMemory();
        thoughts.push(...memoryThoughts);
        console.log(
          `🔄 [COGNITIVE THOUGHT PROCESSOR] Generated ${memoryThoughts.length} thoughts from memory context`
        );
      }

      // Store generated thoughts in memory for learning
      await this.storeThoughtsInMemory(thoughts);

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

        console.log(
          `🔄 [COGNITIVE THOUGHT PROCESSOR] Processing thought: "${thought.content.substring(0, 60)}..."`
        );
        console.log(
          `🔄 [COGNITIVE THOUGHT PROCESSOR] Thought type: ${thought.type}, category: ${thought.category}`
        );

        const task = this.translateThoughtToTask(thought);
        if (task) {
          console.log(
            `✅ [COGNITIVE THOUGHT PROCESSOR] Successfully translated to task: ${task.type} - ${task.title}`
          );

          // de-dupe near-identical tasks in a short TTL window
          const key = this.taskKey(task);
          const now = Date.now();
          const prev = this.recentTaskKeys.get(key);
          if (prev && now - prev < this.recentTaskTTLms) {
            console.log(
              `⏭️ [COGNITIVE THOUGHT PROCESSOR] Skipping duplicate task: ${key}`
            );
            this.emit('skippedThought', {
              reason: 'duplicateTask',
              thoughtId: thought.id,
              key,
            });
          } else {
            console.log(
              `📤 [COGNITIVE THOUGHT PROCESSOR] Submitting task to planning system: ${task.title}`
            );
            this.emit('taskCandidate', { task, thoughtId: thought.id });
            await this.submitTaskToPlanning(task);
            this.recentTaskKeys.set(key, now);
          }
          this.processedThoughts.add(thought.id);
        } else {
          console.log(
            `❌ [COGNITIVE THOUGHT PROCESSOR] Failed to translate thought: "${thought.content.substring(0, 60)}..."`
          );
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
   * Extract key concepts from thoughts and create signals for behavior tree interpretation
   */
  private extractThoughtSignals(thought: CognitiveThought): any[] {
    const content = thought.content.toLowerCase();
    const signals = [];

    // Extract resource-related concepts
    if (/wood|log|timber|planks|sticks/.test(content)) {
      signals.push({
        type: 'resource_need',
        value: 0.7,
        concept: 'wood',
        context: 'crafting_or_building',
        source: 'cognitive_thought',
        thoughtId: thought.id,
      });
    }

    if (/stone|cobblestone|rock/.test(content)) {
      signals.push({
        type: 'resource_need',
        value: 0.7,
        concept: 'stone',
        context: 'building_or_tools',
        source: 'cognitive_thought',
        thoughtId: thought.id,
      });
    }

    if (/iron|ore|metal/.test(content)) {
      signals.push({
        type: 'resource_need',
        value: 0.8,
        concept: 'iron',
        context: 'advanced_tools',
        source: 'cognitive_thought',
        thoughtId: thought.id,
      });
    }

    if (/coal|fuel/.test(content)) {
      signals.push({
        type: 'resource_need',
        value: 0.6,
        concept: 'coal',
        context: 'fuel_or_lighting',
        source: 'cognitive_thought',
        thoughtId: thought.id,
      });
    }

    // Extract tool-related concepts
    if (/pickaxe|pick|mining/.test(content)) {
      signals.push({
        type: 'tool_need',
        value: 0.8,
        concept: 'pickaxe',
        context: 'mining_activities',
        source: 'cognitive_thought',
        thoughtId: thought.id,
      });
    }

    if (/craft|make|build/.test(content)) {
      signals.push({
        type: 'crafting_intent',
        value: 0.7,
        concept: 'crafting',
        context: 'tool_or_item_creation',
        source: 'cognitive_thought',
        thoughtId: thought.id,
      });
    }

    // Extract safety/survival concepts
    if (/safety|safe|protect|shelter|dark|night/.test(content)) {
      signals.push({
        type: 'safety_concern',
        value: 0.8,
        concept: 'safety',
        context: 'environmental_threats',
        source: 'cognitive_thought',
        thoughtId: thought.id,
      });
    }

    if (/light|torch|lighting/.test(content)) {
      signals.push({
        type: 'safety_concern',
        value: 0.6,
        concept: 'lighting',
        context: 'darkness_protection',
        source: 'cognitive_thought',
        thoughtId: thought.id,
      });
    }

    // Extract urgency concepts
    if (/urgent|quickly|now|immediate|danger/.test(content)) {
      signals.push({
        type: 'urgency_signal',
        value: 0.8,
        concept: 'urgency',
        context: 'time_pressure',
        source: 'cognitive_thought',
        thoughtId: thought.id,
      });
    }

    // Extract exploration concepts
    if (/explore|search|find|look|discover/.test(content)) {
      signals.push({
        type: 'exploration_drive',
        value: 0.6,
        concept: 'exploration',
        context: 'resource_discovery',
        source: 'cognitive_thought',
        thoughtId: thought.id,
      });
    }

    return signals;
  }

  /**
   * Create behavior tree signals from cognitive thoughts
   */
  private createBehaviorTreeSignals(thought: CognitiveThought): any[] {
    const content = thought.content.toLowerCase();
    const signals = [];

    // Create signals that the behavior tree can interpret contextually
    signals.push({
      type: 'cognitive_reflection',
      value: 0.6,
      content: thought.content,
      thoughtId: thought.id,
      context: {
        emotionalState: thought.context?.emotionalState || 'neutral',
        confidence: thought.context?.confidence || 0.5,
        cognitiveSystem: thought.context?.cognitiveSystem || 'unknown',
      },
      metadata: {
        thoughtType: thought.metadata?.thoughtType,
        category: thought.category,
        priority: thought.priority,
        timestamp: thought.timestamp,
      },
    });

    return signals;
  }

  /**
   * Calculate task priority based on thought characteristics
   */
  private calculateThoughtPriority(thought: CognitiveThought): number {
    let priority = 0.5; // Base priority

    // Adjust based on thought type
    if (thought.type === 'planning') priority += 0.2;
    if (thought.type === 'decision') priority += 0.1;

    // Adjust based on content urgency
    const content = thought.content.toLowerCase();
    if (/urgent|immediate|danger|critical/.test(content)) priority += 0.2;
    if (/safety|protect|survival/.test(content)) priority += 0.1;

    // Adjust based on thought metadata
    if (thought.metadata?.thoughtType === 'task-initiation') priority += 0.1;
    if (thought.priority === 'high') priority += 0.2;
    if (thought.priority === 'medium') priority += 0.1;

    return Math.max(0, Math.min(1, priority));
  }

  /**
   * Calculate task urgency based on thought characteristics
   */
  private calculateThoughtUrgency(thought: CognitiveThought): number {
    let urgency = 0.4; // Base urgency

    // Adjust based on content urgency
    const content = thought.content.toLowerCase();
    if (/now|immediate|urgent|quickly/.test(content)) urgency += 0.3;
    if (/danger|threat|critical/.test(content)) urgency += 0.2;

    // Adjust based on thought type
    if (thought.type === 'decision') urgency += 0.1;

    // Adjust based on emotional state
    if (thought.context?.emotionalState === 'anxious') urgency += 0.1;
    if (thought.context?.emotionalState === 'focused') urgency += 0.05;

    return Math.max(0, Math.min(1, urgency));
  }

  /**
   * Translate a cognitive thought to executable tasks (can return multiple tasks for compound thoughts)
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

    // Extract key concepts and create behavior tree signals instead of hardcoded mappings
    const conceptSignals = this.extractThoughtSignals(thought);
    const behaviorSignals = this.createBehaviorTreeSignals(thought);

    if (conceptSignals.length === 0 && behaviorSignals.length === 0) {
      return null;
    }

    // Create a cognitive reflection task that the behavior tree can interpret
    const taskTitle = `Interpret: ${thought.content.substring(0, 40)}...`;
    const taskDescription = `Process cognitive thought about: ${thought.content}`;

    let task = {
      id: `cognitive-signal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title: taskTitle,
      type: 'cognitive_reflection',
      description: taskDescription,
      priority: this.calculateThoughtPriority(thought),
      urgency: this.calculateThoughtUrgency(thought),
      parameters: {
        thoughtContent: thought.content,
        thoughtType: thought.type,
        signals: [...conceptSignals, ...behaviorSignals],
        cognitiveContext: thought.context,
      },
      goal: 'interpret_cognitive_reflection',
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
      autonomous: true,
      source: 'cognitive_thought',
      originalThought: thought.content,
      metadata: {
        origin: { thoughtId: thought.id, attribution: thought.attribution },
        worldSeenAt: this.lastWorldStateUpdate || null,
        signalsGenerated: conceptSignals.length + behaviorSignals.length,
        thoughtCategory: thought.category,
        thoughtPriority: thought.priority,
      },
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
   * Submit task to planning system
   */
  private async submitTaskToPlanning(task: any): Promise<void> {
    try {
      console.log(
        `📤 [COGNITIVE THOUGHT PROCESSOR] Submitting task to planning: ${task.title}`
      );
      console.log(`📤 [COGNITIVE THOUGHT PROCESSOR] Task details:`, {
        id: task.id,
        type: task.type,
        priority: task.priority,
        urgency: task.urgency,
        description: task.description,
      });

      const result = await this.planning.addTask(task);
      if (!result.ok) {
        console.error(
          `❌ [COGNITIVE THOUGHT PROCESSOR] Failed to submit task to planning system: ${result.error || 'unknown'}`
        );
        return;
      }
      console.log(
        `✅ [COGNITIVE THOUGHT PROCESSOR] Task submitted successfully: ${task.type} - ${task.description}`
      );

      this.emit('taskSubmitted', { task, result });
    } catch (error) {
      console.error(
        '❌ [COGNITIVE THOUGHT PROCESSOR] Error submitting task to planning system:',
        error
      );
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

  /**
   * Discover and execute tools based on a cognitive thought
   */
  async processThoughtWithTools(thought: CognitiveThought): Promise<{
    task?: any;
    discoveredTools?: ToolDiscoveryResult;
    executedTools?: ToolExecutionResult[];
    toolEvaluation?: any;
  }> {
    const result: any = {};

    try {
      // 1. Create a task from the thought
      const task = this.translateThoughtToTask(thought);
      result.task = task;

      // 2. Discover available tools for the thought
      if (this.mcpIntegration && this.config.enableToolDiscovery) {
        console.log(
          `🔍 [COGNITIVE THOUGHT PROCESSOR] Discovering tools for thought: "${thought.content.substring(0, 60)}..."`
        );

        const discoveredTools = await this.mcpIntegration.discoverToolsForGoal(
          thought.id,
          thought.content,
          {
            worldState: this.worldState,
            thoughtType: thought.type,
            category: thought.category,
            priority: thought.priority,
          }
        );

        result.discoveredTools = discoveredTools;

        // 3. Execute the most relevant tools
        if (discoveredTools.matchedTools.length > 0) {
          const executedTools: ToolExecutionResult[] = [];

          for (const match of discoveredTools.matchedTools.slice(
            0,
            this.config.maxToolsPerThought || 3
          )) {
            try {
              console.log(
                `▶️ [COGNITIVE THOUGHT PROCESSOR] Executing tool: ${match.tool.name} (relevance: ${match.relevance.toFixed(2)})`
              );

              const toolResult =
                await this.mcpIntegration.executeToolWithEvaluation(
                  match.tool,
                  this.prepareToolArgs(match.tool, thought, this.worldState),
                  thought.id,
                  {
                    worldState: this.worldState,
                    thoughtContext: thought.context,
                    expectedOutcome: this.extractExpectedOutcome(thought),
                  }
                );

              executedTools.push(toolResult);

              // Emit tool execution event
              this.emit('toolExecuted', {
                thoughtId: thought.id,
                tool: match.tool,
                result: toolResult,
                reasoning: match.reasoning,
              });
            } catch (error) {
              console.error(
                `[COGNITIVE THOUGHT PROCESSOR] Tool execution failed: ${match.tool.name}`,
                error
              );
            }
          }

          result.executedTools = executedTools;

          // 4. Evaluate tool execution results
          if (executedTools.length > 0) {
            const toolEvaluation = await this.evaluateToolExecutionForThought(
              thought,
              executedTools,
              this.worldState
            );
            result.toolEvaluation = toolEvaluation;

            // 5. Create enhanced task with tool execution results
            if (task) {
              result.task = this.enhanceTaskWithToolResults(
                task,
                executedTools,
                toolEvaluation
              );
            }
          }
        }
      }

      // 6. Submit the (possibly enhanced) task to planning
      if (result.task) {
        await this.submitTaskToPlanning(result.task);
        this.processedThoughts.add(thought.id);
      }

      return result;
    } catch (error) {
      console.error(
        '[COGNITIVE THOUGHT PROCESSOR] Error processing thought with tools:',
        error
      );
      return result;
    }
  }

  /**
   * Process a thought with memory enhancement
   */
  async processThoughtWithMemory(thought: CognitiveThought): Promise<{
    task?: any;
    memoryContext?: any;
    enhancedThought?: CognitiveThought;
    recommendations?: string[];
  }> {
    const result: any = {};

    // 1. Get memory-enhanced context if memory client is available
    if (this.memory) {
      try {
        const memoryContext = await this.memory.getMemoryEnhancedContext({
          query: thought.content,
          taskType: thought.category,
          entities: this.extractEntitiesFromThought(thought),
          location: this.worldState?.location,
          recentEvents: this.getRecentTaskHistory(5),
          maxMemories: 3,
        });

        result.memoryContext = memoryContext;
        result.recommendations = memoryContext.recommendations;

        // Enhance the thought with memory context
        result.enhancedThought = {
          ...thought,
          content: `${thought.content}\n\nMemory Context:\n${memoryContext.insights.join('\n')}`,
          priority: this.calculateMemoryEnhancedPriority(
            thought,
            memoryContext
          ),
          metadata: {
            ...thought.metadata,
            memoryConfidence: memoryContext.confidence,
            memoryInsights: memoryContext.insights,
          },
        };
      } catch (error) {
        console.error('Memory enhancement failed:', error);
        result.enhancedThought = thought; // Fallback to original thought
      }
    } else {
      result.enhancedThought = thought;
    }

    // 2. Process the enhanced thought into a task
    const task = this.translateThoughtToTask(result.enhancedThought);
    result.task = task;

    // 3. Submit task if available
    if (task) {
      await this.submitTaskToPlanning(task);
      this.processedThoughts.add(thought.id);

      // 4. Store thought in memory if memory client is available
      if (this.memory) {
        await this.memory.addThoughtToMemory(result.enhancedThought);
      }
    }

    return result;
  }

  /**
   * Extract entities from a thought
   */
  private extractEntitiesFromThought(thought: CognitiveThought): string[] {
    const entities: string[] = [];

    // Simple entity extraction - in a real system this would use NLP
    const content = thought.content.toLowerCase();

    // Common Minecraft entities
    const minecraftEntities = [
      'diamond',
      'iron',
      'gold',
      'wood',
      'stone',
      'dirt',
      'water',
      'lava',
      'tree',
      'cave',
      'mountain',
      'river',
      'ocean',
      'forest',
      'desert',
      'zombie',
      'skeleton',
      'creeper',
      'spider',
      'wolf',
      'cow',
      'pig',
      'sheep',
    ];

    for (const entity of minecraftEntities) {
      if (content.includes(entity)) {
        entities.push(entity);
      }
    }

    return entities;
  }

  /**
   * Get recent task history for memory context
   */
  private getRecentTaskHistory(limit: number): any[] {
    // This would normally come from the task history
    // For now, return placeholder data
    return Array.from(this.recentTaskKeys.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, ts]) => ({
        key,
        timestamp: ts,
        type: key.split('_')[0] || 'unknown',
      }));
  }

  /**
   * Calculate memory-enhanced priority
   */
  private calculateMemoryEnhancedPriority(
    thought: CognitiveThought,
    memoryContext: any
  ): CognitiveThought['priority'] {
    const basePriority = thought.priority || 'medium';

    // Boost priority if memory suggests it's important
    if (memoryContext.confidence > 0.8 && memoryContext.memories.length > 0) {
      const priorityMap: Record<string, 'low' | 'medium' | 'high'> = {
        low: 'medium',
        medium: 'high',
        high: 'high',
      };
      return priorityMap[basePriority] || 'medium';
    }

    return basePriority;
  }

  /**
   * Generate thoughts dynamically based on current context and world state
   */
  private async generateThoughtsFromContext(): Promise<CognitiveThought[]> {
    const thoughts: CognitiveThought[] = [];

    try {
      // Get current world state from planning system
      const worldState = await this.getCurrentWorldState();

      if (!worldState || !worldState.connected) {
        console.log(
          '🔄 [COGNITIVE THOUGHT PROCESSOR] No world state available'
        );
        return thoughts;
      }

      // Generate thoughts based on current needs and context
      const contextThoughts = this.analyzeCurrentContext(worldState);
      thoughts.push(...contextThoughts);

      // Generate thoughts based on environmental factors
      const environmentalThoughts =
        this.analyzeEnvironmentalFactors(worldState);
      thoughts.push(...environmentalThoughts);

      // Generate thoughts based on temporal patterns
      const temporalThoughts = this.analyzeTemporalPatterns();
      thoughts.push(...temporalThoughts);
    } catch (error) {
      console.error('Error generating thoughts from context:', error);
    }

    return thoughts;
  }

  /**
   * Generate thoughts based on memory context and historical data
   */
  private async generateThoughtsFromMemory(): Promise<CognitiveThought[]> {
    const thoughts: CognitiveThought[] = [];

    try {
      if (!this.memory) {
        console.log(
          '🔄 [COGNITIVE THOUGHT PROCESSOR] No memory client available'
        );
        return thoughts;
      }

      // Get memory context for current situation
      const worldState = await this.getCurrentWorldState();

      const memoryContext = await this.memory.getMemoryEnhancedContext({
        query: 'Current situation analysis and potential actions',
        taskType: 'planning',
        entities: this.extractCurrentEntities(worldState),
        location: worldState.position || { x: 0, y: 0, z: 0 },
        recentEvents: this.getRecentTaskHistory(5),
        maxMemories: 5,
      });

      if (memoryContext.memories.length === 0) {
        console.log(
          '🔄 [COGNITIVE THOUGHT PROCESSOR] No relevant memories found'
        );
        return thoughts;
      }

      // Generate thoughts based on memory insights
      const memoryInsights = memoryContext.insights || [];
      const recommendations = memoryContext.recommendations || [];

      for (const insight of memoryInsights.slice(0, 3)) {
        thoughts.push({
          type: 'reflection',
          content: `Memory insight: ${insight}`,
          attribution: 'memory-system',
          context: {
            source: 'memory-analysis',
            confidence: memoryContext.confidence,
          },
          category: 'analysis',
          priority: memoryContext.confidence > 0.7 ? 'high' : 'medium',
          id: `memory-insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
        });
      }

      // Generate thoughts based on memory recommendations
      for (const recommendation of recommendations.slice(0, 2)) {
        thoughts.push({
          type: 'planning',
          content: `Memory-based recommendation: ${recommendation}`,
          attribution: 'memory-system',
          context: {
            source: 'memory-recommendation',
            confidence: memoryContext.confidence,
          },
          category: 'planning',
          priority: 'high',
          id: `memory-recommendation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('Error generating thoughts from memory:', error);
    }

    return thoughts;
  }

  /**
   * Get current world state from planning system
   */
  private async getCurrentWorldState(): Promise<any> {
    try {
      // Try to get world state from the planning system
      const response = await fetch(
        `${this.config.planningEndpoint}/world-state`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) {
        console.log(
          '🔄 [COGNITIVE THOUGHT PROCESSOR] Planning system world state unavailable, using defaults'
        );
        return this.getDefaultWorldState();
      }

      const worldState = await response.json();
      return worldState;
    } catch (error) {
      console.error('Error getting world state from planning system:', error);
      return this.getDefaultWorldState();
    }
  }

  /**
   * Get default world state when planning system unavailable
   */
  private getDefaultWorldState(): any {
    const hour = new Date().getHours();
    const isNight = hour >= 20 || hour <= 6;

    return {
      connected: true,
      hasPosition: true,
      position: { x: 10.5, y: 71, z: 29.5 }, // Default position from logs
      health: 20,
      inventoryCount: 0,
      environment: 'surface',
      time: isNight ? 'night' : 'day',
      biome: 'plains',
      nearbyEntities: [],
      recentEvents: [],
      threats: [],
      opportunities: [],
    };
  }

  /**
   * Analyze current context to generate relevant thoughts
   */
  private analyzeCurrentContext(worldState: any): CognitiveThought[] {
    const thoughts: CognitiveThought[] = [];

    // Health-based thoughts
    if (worldState.health < 15) {
      thoughts.push({
        type: 'planning',
        content: `Health is critically low (${worldState.health}/20). Immediate priority: find food, avoid threats, seek shelter.`,
        attribution: 'health-monitor',
        context: {
          health: worldState.health,
          urgency: 'critical',
          biome: worldState.biome,
        },
        category: 'survival',
        priority: 'high',
        id: `health-critical-${Date.now()}`,
        timestamp: Date.now(),
      });
    } else if (worldState.health < 18) {
      thoughts.push({
        type: 'planning',
        content: `Health is getting low (${worldState.health}/20). Should consider finding food or avoiding risky activities.`,
        attribution: 'health-monitor',
        context: {
          health: worldState.health,
          urgency: 'medium',
          biome: worldState.biome,
        },
        category: 'survival',
        priority: 'medium',
        id: `health-low-${Date.now()}`,
        timestamp: Date.now(),
      });
    }

    // Inventory-based thoughts
    if (worldState.inventoryCount === 0) {
      const inventoryAdvice = this.getInventoryAdvice(worldState);
      thoughts.push({
        type: 'planning',
        content: `My inventory is empty. ${inventoryAdvice}`,
        attribution: 'inventory-monitor',
        context: {
          inventoryCount: worldState.inventoryCount,
          biome: worldState.biome,
          time: worldState.time,
        },
        category: 'resource_gathering',
        priority: 'medium',
        id: `inventory-empty-${Date.now()}`,
        timestamp: Date.now(),
      });
    }

    // Environmental thoughts based on biome and time
    const environmentalThought = this.analyzeEnvironment(worldState);
    if (environmentalThought) {
      thoughts.push(environmentalThought);
    }

    // Position-based thoughts
    const positionThought = this.analyzePosition(worldState);
    if (positionThought) {
      thoughts.push(positionThought);
    }

    // Threat assessment
    const threatThought = this.analyzeThreats(worldState);
    if (threatThought) {
      thoughts.push(threatThought);
    }

    return thoughts;
  }

  /**
   * Analyze environmental factors to generate contextual thoughts
   */
  private analyzeEnvironmentalFactors(worldState: any): CognitiveThought[] {
    const thoughts: CognitiveThought[] = [];

    // Time-based thoughts
    const hour = new Date().getHours();
    if (hour >= 20 || hour <= 6) {
      thoughts.push({
        type: 'planning',
        content:
          'Night time approaching. Should consider shelter and safety. Visibility will be reduced and hostile mobs will spawn.',
        attribution: 'time-monitor',
        context: { time: 'night', urgency: 'medium', biome: worldState.biome },
        category: 'survival',
        priority: 'medium',
        id: `night-approaching-${Date.now()}`,
        timestamp: Date.now(),
      });
    } else if (hour >= 18 && hour < 20) {
      thoughts.push({
        type: 'planning',
        content:
          'Evening approaching. Good time to prepare shelter before nightfall.',
        attribution: 'time-monitor',
        context: { time: 'evening', urgency: 'low', biome: worldState.biome },
        category: 'survival',
        priority: 'low',
        id: `evening-approaching-${Date.now()}`,
        timestamp: Date.now(),
      });
    }

    // Weather-based thoughts (placeholder for future weather system)
    if (worldState.weather) {
      if (worldState.weather === 'rain' || worldState.weather === 'storm') {
        thoughts.push({
          type: 'planning',
          content: `Weather conditions: ${worldState.weather}. Visibility reduced, should consider shelter or waterproofing.`,
          attribution: 'weather-monitor',
          context: { weather: worldState.weather, biome: worldState.biome },
          category: 'survival',
          priority: 'medium',
          id: `weather-concern-${Date.now()}`,
          timestamp: Date.now(),
        });
      }
    }

    // Position-based thoughts
    if (worldState.position) {
      const { x, y, z } = worldState.position;
      if (y < 50) {
        const depth = 64 - y; // Distance below surface
        thoughts.push({
          type: 'planning',
          content: `Currently at underground level (Y=${y}). Cave exploration opportunities. ${depth}m below surface - be cautious of dark areas and mobs.`,
          attribution: 'position-monitor',
          context: {
            position: worldState.position,
            depth,
            environment: 'underground',
          },
          category: 'exploration',
          priority: 'low',
          id: `underground-position-${Date.now()}`,
          timestamp: Date.now(),
        });
      } else if (y > 80) {
        thoughts.push({
          type: 'planning',
          content: `At high elevation (Y=${y}). Good vantage point for exploration but watch for falls.`,
          attribution: 'position-monitor',
          context: {
            position: worldState.position,
            elevation: y,
            environment: 'high_elevation',
          },
          category: 'exploration',
          priority: 'low',
          id: `high-elevation-${Date.now()}`,
          timestamp: Date.now(),
        });
      }
    }

    // Biome-specific opportunities
    const biome = worldState.biome || 'plains';
    const biomeOpportunities = this.getBiomeOpportunities(biome, worldState);
    if (biomeOpportunities) {
      thoughts.push(biomeOpportunities);
    }

    return thoughts;
  }

  /**
   * Get biome-specific opportunities and advice
   */
  private getBiomeOpportunities(
    biome: string,
    worldState: any
  ): CognitiveThought | null {
    const opportunities: Record<string, string> = {
      forest:
        'Abundant wood and food resources. Good for shelter construction and basic tools.',
      plains:
        'Open terrain for easy navigation. Look for villages, animals, and scattered resources.',
      desert:
        'Scarce water and food. Cacti provide green dye, and temples may contain valuable loot.',
      mountain:
        'Rich in minerals (coal, iron, redstone). Watch for steep drops and limited resources.',
      ocean:
        'Fish provide food. Look for shipwrecks, ocean monuments, and underwater structures.',
      tundra:
        'Cold climate with unique resources. Animals provide food and materials.',
      jungle:
        'Dense vegetation with unique resources. Watch for dangerous mobs and difficult navigation.',
      swamp:
        'Mushrooms, clay, and slime provide unique resources. Witch huts may contain valuable items.',
    };

    const risks: Record<string, string> = {
      desert: 'Extreme heat and lack of water make survival challenging.',
      mountain: 'Steep terrain and falls are major hazards.',
      ocean: 'Drowning and ocean currents are significant risks.',
      jungle:
        'Dense vegetation makes navigation difficult and dangerous mobs spawn.',
      swamp: 'Water hazards and poisonous witches pose threats.',
    };

    if (opportunities[biome]) {
      const content = opportunities[biome];
      const risk = risks[biome] ? ` However, ${risks[biome]}` : '';

      return {
        type: 'planning',
        content: `Biome analysis: ${biome} environment. ${content}${risk}`,
        attribution: 'biome-monitor',
        context: { biome, opportunities: true, risks: !!risks[biome] },
        category: 'exploration',
        priority: risks[biome] ? 'medium' : 'low',
        id: `biome-opportunities-${Date.now()}`,
        timestamp: Date.now(),
      };
    }

    return null;
  }

  /**
   * Analyze temporal patterns to generate thoughts
   */
  private analyzeTemporalPatterns(): CognitiveThought[] {
    const thoughts: CognitiveThought[] = [];

    // Regular maintenance thoughts
    const now = Date.now();
    const minutesSinceLast = (now - this.lastActivityCheck) / (1000 * 60);

    if (minutesSinceLast > 30) {
      thoughts.push({
        type: 'reflection',
        content:
          "It's been a while since I checked my overall situation. Let me assess my current needs.",
        attribution: 'temporal-monitor',
        context: { timeSinceLastCheck: minutesSinceLast },
        category: 'self_assessment',
        priority: 'medium',
        id: `temporal-check-${Date.now()}`,
        timestamp: Date.now(),
      });
      this.lastActivityCheck = now;
    }

    return thoughts;
  }

  /**
   * Extract entities from current world state
   */
  private extractCurrentEntities(worldState: any): string[] {
    const entities: string[] = [];

    // Common Minecraft entities and items
    const minecraftItems = [
      'wood',
      'stone',
      'diamond',
      'iron',
      'gold',
      'coal',
      'tree',
      'cave',
      'mountain',
      'water',
      'lava',
      'zombie',
      'skeleton',
      'creeper',
      'spider',
      'crafting_table',
      'furnace',
      'chest',
      'torch',
    ];

    // Add entities based on context
    if (worldState.environment === 'surface') {
      entities.push('surface', 'exploration');
    } else if (worldState.position && worldState.position.y < 50) {
      entities.push('cave', 'underground');
    }

    if (worldState.inventoryCount === 0) {
      entities.push('resources', 'gathering');
    }

    return entities;
  }

  /**
   * Get context-aware inventory advice based on current situation
   */
  private getInventoryAdvice(worldState: any): string {
    const biome = worldState.biome || 'plains';
    const time = worldState.time || 'day';

    if (time === 'night') {
      return 'I should prioritize finding shelter and basic survival items before gathering resources.';
    }

    if (biome === 'forest') {
      return 'I should gather wood and basic materials for tools and shelter.';
    }

    if (biome === 'desert') {
      return 'I need to find water and shade while gathering basic materials.';
    }

    if (biome === 'mountain') {
      return 'I should look for coal and iron while being careful of heights.';
    }

    return 'I should gather basic materials like wood and stone to start crafting tools.';
  }

  /**
   * Analyze environment for contextual thoughts
   */
  private analyzeEnvironment(worldState: any): CognitiveThought | null {
    const biome = worldState.biome || 'plains';
    const time = worldState.time || 'day';

    // Night time thoughts
    if (time === 'night') {
      return {
        type: 'planning',
        content: `Night time conditions: ${biome} biome. Should prioritize safety and shelter over exploration.`,
        attribution: 'environment-monitor',
        context: { biome, time, safety: 'high' },
        category: 'survival',
        priority: 'medium',
        id: `night-environment-${Date.now()}`,
        timestamp: Date.now(),
      };
    }

    // Biome-specific thoughts
    const biomeThoughts: Record<string, string> = {
      forest:
        'Good for gathering wood and food. Trees provide shelter and resources.',
      plains:
        'Open terrain good for exploration. Look for villages or animals.',
      desert:
        'Hot and dry. Need water and shade. Cacti provide some resources.',
      mountain:
        'Rich in minerals but dangerous terrain. Look for coal and iron.',
      cave: 'Underground environment. Need lighting and be careful of mobs.',
      ocean: 'Water environment. Need boat or swimming skills. Fish for food.',
      tundra:
        'Cold environment. Need warm clothing. Look for animals and resources.',
    };

    if (biomeThoughts[biome]) {
      return {
        type: 'planning',
        content: `Environmental analysis: ${biome} biome. ${biomeThoughts[biome]}`,
        attribution: 'environment-monitor',
        context: { biome, time, analysis: 'biome_specific' },
        category: 'exploration',
        priority: 'low',
        id: `biome-analysis-${Date.now()}`,
        timestamp: Date.now(),
      };
    }

    return null;
  }

  /**
   * Analyze position for contextual thoughts
   */
  private analyzePosition(worldState: any): CognitiveThought | null {
    if (!worldState.position) return null;

    const { x, y, z } = worldState.position;

    // Underground analysis
    if (y < 50) {
      const depth = 64 - y; // Distance below surface
      return {
        type: 'planning',
        content: `Currently at underground level (Y=${y}). Cave exploration opportunities. ${depth}m below surface.`,
        attribution: 'position-monitor',
        context: {
          position: worldState.position,
          depth,
          environment: 'underground',
        },
        category: 'exploration',
        priority: 'low',
        id: `underground-position-${Date.now()}`,
        timestamp: Date.now(),
      };
    }

    // Surface analysis
    if (y >= 50) {
      return {
        type: 'planning',
        content: `Currently on surface (Y=${y}). Good visibility for exploration and resource gathering.`,
        attribution: 'position-monitor',
        context: { position: worldState.position, environment: 'surface' },
        category: 'exploration',
        priority: 'low',
        id: `surface-position-${Date.now()}`,
        timestamp: Date.now(),
      };
    }

    return null;
  }

  /**
   * Analyze threats for contextual thoughts
   */
  private analyzeThreats(worldState: any): CognitiveThought | null {
    const threats = worldState.threats || [];
    const nearbyEntities = worldState.nearbyEntities || [];

    if (threats.length > 0) {
      return {
        type: 'planning',
        content: `Detected ${threats.length} threats in the area. Should prioritize safety and defensive measures.`,
        attribution: 'threat-monitor',
        context: { threats, nearbyEntities, urgency: 'high' },
        category: 'survival',
        priority: 'high',
        id: `threats-detected-${Date.now()}`,
        timestamp: Date.now(),
      };
    }

    if (nearbyEntities.length > 0) {
      const hostileEntities = nearbyEntities.filter(
        (e: any) => e.type === 'hostile' || e.type === 'mob'
      );

      if (hostileEntities.length > 0) {
        return {
          type: 'planning',
          content: `Detected ${hostileEntities.length} hostile entities nearby. Should be cautious and consider defensive actions.`,
          attribution: 'threat-monitor',
          context: {
            hostileEntities,
            totalEntities: nearbyEntities.length,
            urgency: 'medium',
          },
          category: 'survival',
          priority: 'medium',
          id: `hostile-entities-${Date.now()}`,
          timestamp: Date.now(),
        };
      }
    }

    return null;
  }

  /**
   * Store generated thoughts back to memory system
   */
  private async storeThoughtsInMemory(
    thoughts: CognitiveThought[]
  ): Promise<void> {
    if (!this.memory || thoughts.length === 0) return;

    try {
      for (const thought of thoughts) {
        await this.memory.addThoughtToMemory(thought);
      }

      console.log(
        `🔄 [COGNITIVE THOUGHT PROCESSOR] Stored ${thoughts.length} thoughts in memory`
      );
    } catch (error) {
      console.error('Error storing thoughts in memory:', error);
    }
  }

  /**
   * Prepare tool arguments based on thought and world state
   */
  private prepareToolArgs(
    tool: any,
    thought: CognitiveThought,
    worldState?: any
  ): Record<string, any> {
    const args: Record<string, any> = {};

    // Extract parameters from thought content
    const content = thought.content.toLowerCase();

    // Common parameter mappings
    if (content.includes('wood') || content.includes('log')) {
      args.item = 'log';
      args.count = 1;
    }
    if (content.includes('stone') || content.includes('rock')) {
      args.item = 'stone';
      args.count = 1;
    }
    if (content.includes('iron') || content.includes('ore')) {
      args.item = 'iron_ore';
      args.count = 1;
    }
    if (content.includes('move') || content.includes('go to')) {
      args.destination = 'nearby';
      args.radius = 10;
    }
    if (content.includes('safe') || content.includes('careful')) {
      args.safety = true;
      args.avoid_hostiles = true;
    }

    // Add world state context if available
    if (worldState) {
      if (worldState.position) {
        args.current_position = worldState.position;
      }
      if (worldState.inventory) {
        args.inventory = worldState.inventory;
      }
      if (worldState.health !== undefined) {
        args.health_level = worldState.health;
      }
    }

    // Add thought context
    if (thought.context) {
      args.thought_context = thought.context;
    }

    return args;
  }

  /**
   * Extract expected outcome from a thought
   */
  private extractExpectedOutcome(thought: CognitiveThought): string {
    const content = thought.content.toLowerCase();

    if (content.includes('gather') || content.includes('collect')) {
      return 'item_collected';
    }
    if (content.includes('move') || content.includes('navigate')) {
      return 'position_changed';
    }
    if (content.includes('craft') || content.includes('make')) {
      return 'item_created';
    }
    if (content.includes('mine') || content.includes('dig')) {
      return 'block_removed';
    }
    if (content.includes('sense') || content.includes('scan')) {
      return 'information_gathered';
    }

    return 'task_completed';
  }

  /**
   * Evaluate tool execution results for a thought
   */
  private async evaluateToolExecutionForThought(
    thought: CognitiveThought,
    executedTools: ToolExecutionResult[],
    worldState?: any
  ): Promise<{
    overallSuccess: boolean;
    effectiveness: number;
    recommendations: string[];
    nextActions: string[];
  }> {
    let totalEffectiveness = 0;
    let successfulTools = 0;
    const recommendations: string[] = [];
    const nextActions: string[] = [];

    for (const toolResult of executedTools) {
      totalEffectiveness += toolResult.evaluation.effectiveness;

      if (toolResult.success) {
        successfulTools++;

        // Generate recommendations based on success
        if (toolResult.evaluation.effectiveness > 0.8) {
          recommendations.push(
            `Tool ${toolResult.toolName} was highly effective`
          );
        } else if (toolResult.evaluation.effectiveness > 0.5) {
          recommendations.push(
            `Tool ${toolResult.toolName} was moderately effective`
          );
        }

        // Check for side effects
        if (toolResult.evaluation.sideEffects.length > 0) {
          recommendations.push(
            `Tool ${toolResult.toolName} had side effects: ${toolResult.evaluation.sideEffects.join(', ')}`
          );
        }
      } else {
        recommendations.push(
          `Tool ${toolResult.toolName} failed: ${toolResult.error || 'Unknown error'}`
        );
      }
    }

    const averageEffectiveness =
      executedTools.length > 0 ? totalEffectiveness / executedTools.length : 0;
    const overallSuccess = successfulTools > 0;

    // Generate next actions based on evaluation
    if (overallSuccess && averageEffectiveness > 0.7) {
      nextActions.push('Continue with current approach');
      nextActions.push('Consider optimizing successful tools');
    } else if (successfulTools > 0) {
      nextActions.push('Improve tool effectiveness');
      nextActions.push('Address side effects before continuing');
    } else {
      nextActions.push('Try alternative tools or approaches');
      nextActions.push('Re-evaluate goal feasibility');
    }

    // Context-based evaluation
    if (worldState && !overallSuccess) {
      if (worldState.health < 15) {
        nextActions.unshift('Prioritize safety - health is critical');
      }
      if (worldState.inventory?.freeSlots === 0) {
        nextActions.push('Clear inventory space before continuing');
      }
    }

    return {
      overallSuccess,
      effectiveness: averageEffectiveness,
      recommendations,
      nextActions,
    };
  }

  /**
   * Enhance a task with tool execution results
   */
  private enhanceTaskWithToolResults(
    task: any,
    executedTools: ToolExecutionResult[],
    toolEvaluation: any
  ): any {
    const enhancedTask = { ...task };

    // Add tool execution metadata
    enhancedTask.metadata = {
      ...enhancedTask.metadata,
      toolExecution: {
        toolsExecuted: executedTools.length,
        successfulTools: executedTools.filter((t) => t.success).length,
        averageEffectiveness: toolEvaluation.effectiveness,
        totalExecutionTime: executedTools.reduce(
          (sum, t) => sum + t.executionTime,
          0
        ),
        recommendations: toolEvaluation.recommendations,
      },
      executionHistory: executedTools.map((t) => ({
        toolName: t.toolName,
        success: t.success,
        effectiveness: t.evaluation.effectiveness,
        executionTime: t.executionTime,
      })),
    };

    // Adjust task priority based on tool success
    if (toolEvaluation.overallSuccess && toolEvaluation.effectiveness > 0.7) {
      // Successful tools - maintain or increase priority
      enhancedTask.priority = Math.min(1, enhancedTask.priority + 0.1);
    } else if (
      toolEvaluation.overallSuccess &&
      toolEvaluation.effectiveness < 0.5
    ) {
      // Partial success - reduce priority
      enhancedTask.priority = Math.max(0, enhancedTask.priority - 0.1);
    } else {
      // Failed tools - significantly reduce priority
      enhancedTask.priority = Math.max(0, enhancedTask.priority - 0.2);
    }

    // Add next actions to task description
    if (toolEvaluation.nextActions.length > 0) {
      enhancedTask.description = `${enhancedTask.description}\n\nNext Actions:\n${toolEvaluation.nextActions.map((action: string) => `- ${action}`).join('\n')}`;
    }

    return enhancedTask;
  }

  /**
   * Get MCP integration status
   */
  getMCPStatus(): {
    enabled: boolean;
    initialized: boolean;
    toolDiscoveryEnabled: boolean;
    toolsAvailable: number;
    executionHistoryCount: number;
  } {
    const status = {
      enabled: !!this.config.enableMCPIntegration,
      initialized: !!this.mcpIntegration,
      toolDiscoveryEnabled: !!this.config.enableToolDiscovery,
      toolsAvailable: 0,
      executionHistoryCount: 0,
    };

    if (this.mcpIntegration) {
      try {
        // This would need to be implemented in MCPIntegration
        // status.toolsAvailable = this.mcpIntegration.getAvailableToolsCount();
        status.executionHistoryCount =
          this.mcpIntegration.getToolExecutionHistory().length;
      } catch (error) {
        console.error('Error getting MCP status:', error);
      }
    }

    return status;
  }
}
