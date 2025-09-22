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
import { SignalExtractionPipeline } from './signal-extraction-pipeline';

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
  // NEW: Signal Extraction Pipeline configuration
  enableSignalPipeline?: boolean; // Enable new signal extraction pipeline
  signalConfidenceThreshold?: number; // Minimum confidence for signals (default 0.3)
  // NEW: MCP Integration configuration
  enableMCPIntegration?: boolean;
  mcpEndpoint?: string;
  enableToolDiscovery?: boolean;
  maxToolsPerThought?: number;
}

const DEFAULT_CONFIG: CognitiveThoughtProcessorConfig = {
  enableThoughtToTaskTranslation: true,
  thoughtProcessingInterval: 30000, // 30 seconds
  maxThoughtsPerBatch: 5,
  planningEndpoint: 'http://localhost:3002',
  cognitiveEndpoint: 'http://localhost:3003',
  memoryEndpoint: process.env.MEMORY_ENDPOINT || 'http://localhost:3001',
  enableMemoryIntegration: true,
  enableSignalPipeline: false,
  signalConfidenceThreshold: 0.5,
  enableToolDiscovery: false,
  maxToolsPerThought: 3,
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

      return await response.json() as {
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
  private signalPipeline?: SignalExtractionPipeline;
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
      console.log(
        '🔄 [COGNITIVE THOUGHT PROCESSOR] Fetching recent thoughts...'
      );
      const { thoughts, etag } = await this.cognitive.fetchRecentThoughts(
        this.lastSeenTs,
        this.lastEtag
      );
      if (etag) this.lastEtag = etag;

      console.log(
        `🔄 [COGNITIVE THOUGHT PROCESSOR] Found ${thoughts.length} thoughts`
      );

      if (thoughts.length === 0) {
        console.log(
          '🔄 [COGNITIVE THOUGHT PROCESSOR] No thoughts found, skipping processing'
        );
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

        console.log(
          `🔄 [COGNITIVE THOUGHT PROCESSOR] Processing thought: "${thought.content.substring(0, 60)}..."`
        );
        console.log(
          `🔄 [COGNITIVE THOUGHT PROCESSOR] Thought type: ${thought.type}, category: ${thought.category}`
        );

        const task = await this.translateThoughtToTask(thought);
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

    // DEPRECATED: This method is replaced by Signal Extraction Pipeline
    // Return empty array to avoid conflicts with new signal system
    console.warn(
      '⚠️ [DEPRECATED] createBehaviorTreeSignals called - use signal pipeline instead'
    );
    return [];
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
  private async translateThoughtToTask(
    thought: CognitiveThought
  ): Promise<any | null> {
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

    // Use signal extraction pipeline if enabled, otherwise fallback to legacy methods
    let signals: any[] = [];
    if (this.config.enableSignalPipeline && this.signalPipeline) {
      // Use new signal pipeline
      try {
        const extractedSignals = await this.signalPipeline.extractSignals({
          thought,
          worldState: this.worldState,
          memoryClient: this.memory,
          llmEndpoint: this.config.cognitiveEndpoint,
        });
        signals = extractedSignals;
      } catch (error) {
        console.warn(
          'Signal pipeline failed, falling back to legacy methods:',
          error
        );
        // Fallback to deprecated methods (they return empty arrays now)
        const conceptSignals = this.extractThoughtSignals(thought);
        const behaviorSignals = this.createBehaviorTreeSignals(thought);
        signals = [...conceptSignals, ...behaviorSignals];
      }
    } else {
      // Use legacy methods (deprecated)
      const conceptSignals = this.extractThoughtSignals(thought);
      const behaviorSignals = this.createBehaviorTreeSignals(thought);
      signals = [...conceptSignals, ...behaviorSignals];
    }

    if (signals.length === 0) {
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
        signals: signals.map(signal => ({
          type: signal.type,
          concept: signal.concept,
          confidence: signal.confidence,
          source: signal.source,
          thoughtId: signal.thoughtId,
          // Convert new signal format to old format for backward compatibility
          value: signal.confidence,
          context: signal.details?.context || 'general',
          details: signal.details
        })), // Use the unified signals array converted to old format
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
        signalsGenerated: signals.length,
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
        type: (key.split('_')[0] as 'low' | 'medium' | 'high') || 'medium',
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
      const priorityMap = { low: 'medium' as const, medium: 'high' as const, high: 'high' as const };
      return priorityMap[basePriority] || basePriority;
    }

    return basePriority;
  }
}
