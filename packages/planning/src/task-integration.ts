/**
 * Enhanced Task Integration System
 *
 * Provides comprehensive task management and real-time integration
 * with the dashboard, eliminating "No active tasks" messages and
 * providing meaningful task progress and status information.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { createRequire } from 'module';
import { createServiceClients } from '@conscious-bot/core';
import type { BaseDomainSolver } from './sterling/base-domain-solver';
import type { MinecraftCraftingSolver } from './sterling/minecraft-crafting-solver';
import type { MinecraftBuildingSolver } from './sterling/minecraft-building-solver';
import type { MinecraftToolProgressionSolver } from './sterling/minecraft-tool-progression-solver';
import { resolveRequirement, parseRequiredQuantityFromTitle } from './modules/requirements';
import { requirementToFallbackPlan } from './modules/leaf-arg-contracts';
import { CognitionOutbox } from './modules/cognition-outbox';

// Cognitive stream integration for thought-to-task conversion
interface CognitiveThought {
  type: string;
  content: string;
  attribution: string;
  context: {
    emotionalState: string;
    confidence: number;
    cognitiveSystem?: string;
  };
  metadata: {
    thoughtType: string;
    trigger?: string;
    context?: string;
    intensity?: number;
    llmConfidence?: number;
    model?: string;
  };
  id: string;
  timestamp: number;
  processed: boolean;
}

// Cognitive stream client for monitoring thoughts
class CognitiveStreamClient {
  private lastPollTime = 0;
  private pollInterval = 3000; // 3 seconds

  async getRecentThoughts(): Promise<CognitiveThought[]> {
    try {
      // Try to get thoughts directly from cognition system
      const response = await fetch(
        'http://localhost:3003/api/cognitive-stream/recent',
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (response.ok) {
        const data = (await response.json()) as {
          thoughts?: CognitiveThought[];
        };
        const thoughts = data.thoughts || [];
        console.log(
          `📡 Fetched ${thoughts.length} thoughts from cognitive stream`
        );
        if (thoughts.length > 0) {
          console.log(
            `📋 Recent thoughts:`,
            thoughts.map((t) => `"${t.content}"`)
          );
        }
        return thoughts;
      } else {
        console.warn('Failed to fetch recent thoughts:', response.statusText);
        return [];
      }
    } catch (error) {
      console.warn('Error fetching cognitive stream:', error);
      return [];
    }
  }

  async getActionableThoughts(): Promise<CognitiveThought[]> {
    const recentThoughts = await this.getRecentThoughts();
    const now = Date.now();

    // Filter for actionable thoughts (not processed, recent, contains action words)
    return recentThoughts.filter((thought) => {
      // Skip already processed thoughts
      if (thought.processed) return false;

      // Only process thoughts from last 5 minutes
      if (now - thought.timestamp > 5 * 60 * 1000) return false;

      // Look for actionable content
      const content = thought.content.toLowerCase();
      const actionableWords = [
        'gather',
        'collect',
        'wood',
        'log',
        'craft',
        'build',
        'make',
        'create',
        'mine',
        'iron',
        'stone',
        'ore',
        'dig',
        'explore',
        'search',
        'scout',
        'farm',
        'plant',
        'harvest',
        'move',
        'go to',
        'walk',
        'place',
        'put',
        'set',
        'find',
        'look for',
        'get',
        'obtain',
        'acquire',
        'need to',
        'should',
        'going to',
        'plan to',
        'want to',
        'will',
        'can',
        'help',
        'assist',
        'work on',
        'start',
        'begin',
        'continue',
        'finish',
      ];

      return actionableWords.some((word) => content.includes(word));
    });
  }
}

export type { TaskStep } from './types/task-step';
import type { TaskStep } from './types/task-step';

export interface Task {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: number; // 0..1
  urgency: number; // 0..1
  progress: number; // 0..1
  status: 'pending' | 'active' | 'completed' | 'failed' | 'paused';
  source: 'planner' | 'goal' | 'intrusive' | 'autonomous' | 'manual';
  steps: TaskStep[];
  parameters: Record<string, any>;
  metadata: {
    createdAt: number;
    updatedAt: number;
    startedAt?: number;
    completedAt?: number;
    estimatedDuration?: number;
    actualDuration?: number;
    retryCount: number;
    maxRetries: number;
    lastRetry?: number;
    parentTaskId?: string;
    childTaskIds: string[];
    tags: string[];
    category: string;
    // Optional requirement snapshot for iteration seven inventory/progress gating
    requirement?: any;
    /** Epoch ms — task is ineligible for execution until this time (backoff). */
    nextEligibleAt?: number;
    /** Machine-readable reason why the task cannot make progress. */
    blockedReason?: string;
    /** Tracks how many times prerequisite injection has been attempted (capped at 3). */
    prereqInjectionCount?: number;
  };
}

export interface TaskProgress {
  taskId: string;
  progress: number;
  currentStep: number;
  completedSteps: number;
  totalSteps: number;
  status: Task['status'];
  timestamp: number;
}

export interface TaskStatistics {
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageCompletionTime: number;
  successRate: number;
  tasksByCategory: Record<string, number>;
  tasksBySource: Record<string, number>;
}

export interface ActionVerification {
  taskId: string;
  stepId: string;
  actionType: string;
  expectedResult: any;
  actualResult?: any;
  verified: boolean;
  timestamp: number;
}

export interface EnhancedTaskIntegrationConfig {
  enableRealTimeUpdates: boolean;
  enableProgressTracking: boolean;
  enableTaskStatistics: boolean;
  enableTaskHistory: boolean;
  maxTaskHistory: number;
  progressUpdateInterval: number;
  dashboardEndpoint: string;
  minecraftEndpoint?: string; // Optional, defaults to env var or localhost:3005
  enableActionVerification: boolean; // New: Enable action verification
  actionVerificationTimeout: number; // New: Timeout for action verification
}

const DEFAULT_CONFIG: EnhancedTaskIntegrationConfig = {
  enableRealTimeUpdates: true,
  enableProgressTracking: true,
  enableTaskStatistics: true,
  enableTaskHistory: true,
  maxTaskHistory: 1000,
  progressUpdateInterval: 5000, // 5 seconds
  dashboardEndpoint: 'http://localhost:3000',
  enableActionVerification: true, // New: Enable by default
  actionVerificationTimeout: 10000, // New: 10 second timeout
};

/**
 * Enhanced task integration system for dashboard connectivity
 * @author @darianrosebrook
 */
export class EnhancedTaskIntegration extends EventEmitter {
  private config: EnhancedTaskIntegrationConfig;
  private tasks: Map<string, Task> = new Map();
  private taskHistory: Task[] = [];
  private progressTracker: Map<string, TaskProgress> = new Map();
  private actionVerifications: Map<string, ActionVerification> = new Map();
  private cognitiveStreamClient: CognitiveStreamClient;
  private thoughtPollingInterval?: NodeJS.Timeout;
  private minecraftClient: ReturnType<typeof createServiceClients>['minecraft'];
  private solverRegistry = new Map<string, BaseDomainSolver>();
  private _mcDataCache: any = null;

  // Reentrancy guards for thought polling
  private thoughtPollInFlight = false;
  private seenThoughtIds = new Set<string>();

  // Lazy-initialized LLMInterface for structured intent extraction (MLX sidecar)
  private _extractionLlm: any = null;

  // Non-blocking outbox for cognition side effects
  private cognitionOutbox = new CognitionOutbox();

  /** Expose the outbox so modular-server can enqueue cognition events. */
  get outbox(): CognitionOutbox {
    return this.cognitionOutbox;
  }

  private get craftingSolver(): MinecraftCraftingSolver | undefined {
    return this.solverRegistry.get('minecraft.crafting') as MinecraftCraftingSolver | undefined;
  }

  private get buildingSolver(): MinecraftBuildingSolver | undefined {
    return this.solverRegistry.get('minecraft.building') as MinecraftBuildingSolver | undefined;
  }

  private get toolProgressionSolver(): MinecraftToolProgressionSolver | undefined {
    return this.solverRegistry.get('minecraft.tool_progression') as MinecraftToolProgressionSolver | undefined;
  }

  /**
   * Lazy-load minecraft-data for Sterling solvers.
   * Cached after first load since the game version doesn't change at runtime.
   */
  /**
   * Public accessor for server endpoints that need mcData.
   */
  getMcDataPublic(): any {
    return this.getMcData();
  }

  private getMcData(): any {
    if (!this._mcDataCache) {
      try {
        // minecraft-data is a transitive dep via mineflayer in the workspace.
        // Use createRequire since this file runs in ESM context under tsx.
        const esmRequire = createRequire(import.meta.url);
        const mcDataLoader = esmRequire('minecraft-data');
        this._mcDataCache = mcDataLoader('1.20.1');
      } catch (err) {
        console.warn('⚠️ minecraft-data not available for Sterling solvers:', err instanceof Error ? err.message : err);
        return null;
      }
    }
    return this._mcDataCache;
  }

  /**
   * Fetch current inventory and nearby blocks from the bot for Sterling solvers.
   */
  private async fetchBotContext(): Promise<{ inventory: any[]; nearbyBlocks: any[] }> {
    try {
      const stateRes = await this.minecraftRequest('/state', { timeout: 3000 });
      if (!stateRes.ok) return { inventory: [], nearbyBlocks: [] };
      const stateData = (await stateRes.json()) as any;
      const inventory = stateData?.data?.data?.inventory?.items || [];
      const nearbyBlocks = stateData?.data?.worldState?.nearbyBlocks || [];
      return { inventory, nearbyBlocks };
    } catch {
      return { inventory: [], nearbyBlocks: [] };
    }
  }

  /**
   * Helper method to make HTTP requests to Minecraft Interface with retry logic
   */
  private async minecraftRequest(
    path: string,
    options: { timeout?: number } = {}
  ): Promise<Response> {
    try {
      return await this.minecraftClient.get(path, {
        timeout: options.timeout || 5000,
      });
    } catch (error) {
      console.warn(`Minecraft request failed for ${path}:`, error);
      throw error;
    }
  }

  /**
   * Start polling for cognitive thoughts and convert them to tasks
   */
  private startThoughtToTaskConversion(): void {
    // Poll every 30 seconds for new actionable thoughts to reduce spam
    this.thoughtPollingInterval = setInterval(async () => {
      try {
        await this.processActionableThoughts();
      } catch (error) {
        console.error('Error processing actionable thoughts:', error);
      }
    }, 30000); // 30 seconds

    console.log('🧠 Started thought-to-task conversion polling');
  }

  /**
   * Process actionable thoughts from cognitive stream
   */
  private async processActionableThoughts(): Promise<void> {
    // Reentrancy guard — skip if a previous poll is still in flight
    if (this.thoughtPollInFlight) return;
    this.thoughtPollInFlight = true;

    try {
      const actionableThoughts =
        await this.cognitiveStreamClient.getActionableThoughts();

      console.log(
        `🔍 Found ${actionableThoughts.length} potential actionable thoughts`
      );

      for (const thought of actionableThoughts) {
        try {
          console.log(
            `📝 Processing thought: "${thought.content}" (type: ${thought.type})`
          );

          // Create a task from the actionable thought
          const task = await this.convertThoughtToTask(thought);
          if (task) {
            console.log(
              `🎯 Created task from cognitive thought: ${task.title}`
            );
            this.emit('thoughtConvertedToTask', { thought, task });
          } else {
            console.log(
              `⚠️ Thought not converted to task: "${thought.content}"`
            );
          }
        } catch (error) {
          console.error(`Error converting thought to task:`, error);
        }
      }

      if (actionableThoughts.length === 0) {
        console.log(`🤔 No actionable thoughts found in recent thoughts`);
      }
    } catch (error) {
      console.error(`Error processing actionable thoughts:`, error);
    } finally {
      this.thoughtPollInFlight = false;
    }
  }

  /**
   * Convert a cognitive thought to a planning task
   */
  private async convertThoughtToTask(
    thought: CognitiveThought
  ): Promise<Task | null> {
    try {
      // Skip already processed thoughts
      if (thought.processed) return null;

      // Dedup: skip thoughts we've already seen (cap set at 500)
      if (this.seenThoughtIds.has(thought.id)) return null;
      this.seenThoughtIds.add(thought.id);
      if (this.seenThoughtIds.size > 500) {
        // Trim oldest entries — Sets iterate in insertion order
        const iter = this.seenThoughtIds.values();
        for (let i = 0; i < 100; i++) iter.next();
        const remaining = new Set<string>();
        for (const id of iter) remaining.add(id);
        // Keep the newest entries + the ones we didn't delete
        this.seenThoughtIds = remaining;
      }

      const content = thought.content.toLowerCase();

      // Try structured [GOAL: ...] tag first — takes priority over keyword heuristics
      const goalMatch = thought.content.match(
        /\[GOAL:\s*(collect|mine|craft|build)\s+([\w]+)(?:\s+(\d+))?\]/i
      );

      // Extract action type from thought content
      let actionType = 'general';
      let taskTitle = thought.content;
      let taskDescription = thought.content;

      if (goalMatch) {
        const [, kind, , ] = goalMatch;
        const kindLower = kind.toLowerCase() as 'collect' | 'mine' | 'craft' | 'build';
        const kindToType: Record<string, string> = {
          collect: 'gathering', mine: 'mining', craft: 'crafting', build: 'building',
        };
        actionType = kindToType[kindLower] || 'general';
        taskTitle = this.extractActionTitle(content, kindLower);
      }

      // Determine action type based on content (skipped if goal tag already matched)
      if (!goalMatch) {
        if (
          content.includes('gather') ||
          content.includes('collect') ||
          content.includes('wood') ||
          content.includes('log')
        ) {
          actionType = 'gathering';
          taskTitle = this.extractActionTitle(content, 'gather');
        } else if (
          content.includes('craft') ||
          content.includes('build') ||
          content.includes('make') ||
          content.includes('create')
        ) {
          actionType = 'crafting';
          taskTitle = this.extractActionTitle(content, 'craft');
        } else if (
          content.includes('mine') ||
          content.includes('dig') ||
          content.includes('ore')
        ) {
          actionType = 'mining';
          taskTitle = this.extractActionTitle(content, 'mine');
        } else if (
          content.includes('explore') ||
          content.includes('search') ||
          content.includes('scout')
        ) {
          actionType = 'exploration';
          taskTitle = this.extractActionTitle(content, 'explore');
        } else if (
          content.includes('farm') ||
          content.includes('plant') ||
          content.includes('harvest')
        ) {
          actionType = 'farming';
          taskTitle = this.extractActionTitle(content, 'farm');
        } else {
          taskTitle = thought.content;
        }
      }

      // Create task parameters based on action type
      const parameters: Record<string, any> = {
        thoughtContent: thought.content,
        thoughtId: thought.id,
        thoughtType: thought.metadata.thoughtType,
        confidence: thought.context.confidence,
        cognitiveSystem: thought.context.cognitiveSystem,
        llmConfidence: thought.metadata.llmConfidence,
        model: thought.metadata.model,
      };

      // Add specific parameters based on action type
      if (actionType === 'gathering') {
        parameters.resourceType = this.extractResourceType(content);
      } else if (actionType === 'crafting') {
        parameters.itemType = this.extractItemType(content);
      } else if (actionType === 'mining') {
        parameters.blockType = this.extractBlockType(content);
      }

      // Add structured requirement candidate so resolveRequirement() doesn't re-parse
      if (actionType === 'crafting') {
        const itemName = this.extractItemType(content);
        if (itemName) {
          parameters.requirementCandidate = {
            kind: 'craft',
            outputPattern: itemName,
            quantity: 1,
            extractionMethod: 'thought-content',
          };
        }
      } else if (actionType === 'gathering') {
        const resource = this.extractResourceType(content);
        if (resource) {
          parameters.requirementCandidate = {
            kind: 'collect',
            outputPattern: resource,
            quantity: parseRequiredQuantityFromTitle(taskTitle, 8),
            extractionMethod: 'thought-content',
          };
        }
      } else if (actionType === 'mining') {
        const blockType = this.extractBlockType(content);
        if (blockType) {
          parameters.requirementCandidate = {
            kind: 'mine',
            outputPattern: blockType,
            quantity: parseRequiredQuantityFromTitle(taskTitle, 3),
            extractionMethod: 'thought-content',
          };
        }
      } else if (actionType === 'building') {
        parameters.requirementCandidate = {
          kind: 'build',
          outputPattern: 'basic_shelter_5x5',
          quantity: 1,
          extractionMethod: 'thought-content',
        };
      }

      // If goal tag was parsed, override requirementCandidate (takes priority over heuristic).
      // Note: outputPattern is the generic "what do you want" field in the candidate.
      // resolveRequirement() maps it to the type-specific shape:
      //   collect/mine → patterns: [outputPattern]
      //   build → structure: outputPattern
      //   craft → outputPattern (pass-through)
      if (goalMatch) {
        const [, kind, target, qtyStr] = goalMatch;
        const kindLower = kind.toLowerCase();
        const qty = qtyStr ? parseInt(qtyStr, 10) : undefined;
        parameters.requirementCandidate = {
          kind: kindLower,
          outputPattern: target.toLowerCase(),
          quantity: qty || (kindLower === 'mine' ? 3 : kindLower === 'collect' ? 8 : 1),
          extractionMethod: 'goal-tag',
        };
      }

      // If heuristic says 'general' and no goal tag, try LLM structured extraction
      if (actionType === 'general' && !goalMatch) {
        const structured = await this.extractStructuredIntent(thought.content);
        if (structured) {
          const kindToType: Record<string, string> = {
            collect: 'gathering', mine: 'mining', craft: 'crafting', build: 'building',
          };
          actionType = kindToType[structured.kind] || actionType;
          taskTitle = this.extractActionTitle(content, structured.kind);
          parameters.requirementCandidate = {
            kind: structured.kind,
            outputPattern: structured.target,
            quantity: structured.quantity,
            extractionMethod: 'llm-structured',
          };
        }
      }

      // Create the task (empty steps array — addTask() will synthesize via Sterling)
      const task: Task = {
        id: `cognitive-task-${thought.id}-${Date.now()}`,
        title: taskTitle,
        description: taskDescription,
        type: actionType,
        priority: this.calculateTaskPriority(thought),
        urgency: this.calculateTaskUrgency(thought),
        progress: 0,
        status: 'pending',
        source: 'autonomous' as const,
        steps: [],
        parameters,
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          retryCount: 0,
          maxRetries: 3,
          childTaskIds: [],
          tags: ['cognitive', 'autonomous', thought.metadata.thoughtType],
          category: actionType,
        },
      };

      // Add the task to the system (this will handle deduplication)
      const addedTask = await this.addTask(task);

      // Mark the thought as processed
      await this.markThoughtAsProcessed(thought.id);

      return addedTask;
    } catch (error) {
      console.error('Error converting thought to task:', error);
      return null;
    }
  }

  /**
   * Extract action title from thought content
   */
  private extractActionTitle(content: string, actionType: string): string {
    const sentences = content.split(/[.!?]/);
    for (const sentence of sentences) {
      if (sentence.toLowerCase().includes(actionType)) {
        return sentence.trim();
      }
    }
    return content;
  }

  /** Extract structured intent from ambiguous thought text via local LLM.
   *  Only called when heuristic says 'general' and no goal tag parsed.
   *  Routes through cognition's LLMInterface (MLX sidecar). Returns null on failure. */
  private async extractStructuredIntent(content: string): Promise<{
    kind: 'collect' | 'mine' | 'craft' | 'build';
    target: string;
    quantity: number;
  } | null> {
    const VALID_TARGETS = new Set([
      'oak_log', 'birch_log', 'spruce_log', 'iron_ore', 'cobblestone',
      'diamond_ore', 'coal_ore', 'stone', 'wooden_pickaxe', 'stone_pickaxe',
      'iron_pickaxe', 'crafting_table', 'wooden_axe', 'wooden_sword',
      'furnace', 'chest', 'oak_planks', 'stick',
    ]);

    try {
      // Lazy-init: reuse a single LLMInterface instance for structured extraction
      if (!this._extractionLlm) {
        const { LLMInterface } = await import('@conscious-bot/cognition');
        this._extractionLlm = new LLMInterface({ temperature: 0.1, maxTokens: 80, timeout: 3000, retries: 0 });
      }

      const response = await this._extractionLlm.generateResponse(
        `Extract the Minecraft goal from this thought. Reply with ONLY valid JSON, nothing else.
Valid kinds: collect, mine, craft, build
Valid targets: ${[...VALID_TARGETS].join(', ')}

Thought: "${content}"

Reply with exactly: {"kind":"...","target":"...","quantity":N}`,
      );
      const text = (response.text || '').trim();

      // Try to parse full response as JSON first (preferred)
      try {
        const parsed = JSON.parse(text);
        if (parsed.kind && parsed.target && VALID_TARGETS.has(parsed.target)) {
          return { kind: parsed.kind, target: parsed.target, quantity: parsed.quantity || 1 };
        }
      } catch {
        // Fall back to regex extraction if response includes preamble
        const match = text.match(/\{[^}]+\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.kind && parsed.target && VALID_TARGETS.has(parsed.target)) {
            return { kind: parsed.kind, target: parsed.target, quantity: parsed.quantity || 1 };
          }
        }
      }
    } catch { /* MLX sidecar unavailable — fall through to heuristic */ }
    return null;
  }

  /**
   * Extract resource type from content
   */
  private extractResourceType(content: string): string {
    if (content.includes('wood') || content.includes('log')) return 'oak_log';
    if (content.includes('iron')) return 'iron_ore';
    if (content.includes('stone')) return 'cobblestone';
    if (content.includes('diamond')) return 'diamond_ore';
    if (content.includes('food')) return 'bread';
    return 'oak_log';
  }

  /**
   * Extract item type from content
   */
  private extractItemType(content: string): string {
    if (content.includes('pickaxe')) return 'wooden_pickaxe';
    if (content.includes('sword')) return 'wooden_sword';
    if (content.includes('axe')) return 'wooden_axe';
    if (content.includes('shovel')) return 'wooden_shovel';
    if (content.includes('table')) return 'crafting_table';
    if (content.includes('planks') || content.includes('plank')) return 'oak_planks';
    if (content.includes('stick')) return 'stick';
    return 'oak_planks';
  }

  /**
   * Extract block type from content
   */
  private extractBlockType(content: string): string {
    if (content.includes('iron')) return 'iron_ore';
    if (content.includes('coal')) return 'coal_ore';
    if (content.includes('stone')) return 'stone';
    if (content.includes('diamond')) return 'diamond_ore';
    return 'stone';
  }

  /**
   * Calculate task priority from thought context
   */
  private calculateTaskPriority(thought: CognitiveThought): number {
    let priority = 0.5; // Default medium priority

    // Higher confidence = higher priority
    priority += thought.context.confidence * 0.3;

    // LLM confidence also affects priority
    if (thought.metadata.llmConfidence) {
      priority += thought.metadata.llmConfidence * 0.2;
    }

    // Emotional state affects priority
    if (thought.context.emotionalState === 'urgent') {
      priority += 0.2;
    } else if (thought.context.emotionalState === 'excited') {
      priority += 0.1;
    }

    return Math.min(1.0, priority);
  }

  /**
   * Calculate task urgency from thought context
   */
  private calculateTaskUrgency(thought: CognitiveThought): number {
    let urgency = 0.3; // Default low-medium urgency

    // Emotional state affects urgency
    if (thought.context.emotionalState === 'urgent') {
      urgency = 0.8;
    } else if (thought.context.emotionalState === 'excited') {
      urgency = 0.6;
    } else if (thought.context.emotionalState === 'focused') {
      urgency = 0.5;
    }

    // Confidence affects urgency
    urgency += thought.context.confidence * 0.2;

    return Math.min(1.0, urgency);
  }

  /**
   * Mark a thought as processed via cognition service ack endpoint
   */
  private async markThoughtAsProcessed(thoughtId: string): Promise<void> {
    // Non-blocking: enqueue into the outbox (batched on next flush)
    this.cognitionOutbox.enqueue(
      'http://localhost:3003/api/cognitive-stream/ack',
      { thoughtIds: [thoughtId] }
    );
  }

  /**
   * Add a task internally (bypasses the public addTask method)
   */
  private async addTaskInternal(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
    this.taskHistory.push(task);

    // Keep only last 1000 tasks in history
    if (this.taskHistory.length > 1000) {
      this.taskHistory = this.taskHistory.slice(-1000);
    }

    // Emit task added event
    this.emit('taskAdded', task);
    console.log(`✅ Added task: ${task.title} (${task.type})`);
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId: string, status: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      const previousStatus = task.status;
      task.status = status as any;
      console.log(`Updated task ${taskId} status to ${status}`);

      // Emit lifecycle events for thought generation
      await this.emitLifecycleEvent(task, status, previousStatus);
    }
  }

  /**
   * Emit lifecycle events for thought generation
   */
  private async emitLifecycleEvent(
    task: Task,
    newStatus: string,
    previousStatus: string
  ): Promise<void> {
    try {
      const eventType = this.mapStatusToEventType(newStatus, previousStatus);
      if (!eventType) {
        return; // No event to emit
      }

      // Log the task lifecycle event
      console.log(
        `✅ Task lifecycle event: ${eventType} for task: ${task.title}`
      );
    } catch (error) {
      console.warn('⚠️ Failed to emit lifecycle event:', error);
    }
  }

  /**
   * Map task status changes to lifecycle event types
   */
  private mapStatusToEventType(
    newStatus: string,
    previousStatus: string
  ): string | null {
    if (newStatus === 'completed' && previousStatus !== 'completed') {
      return 'task_completed';
    }
    if (newStatus === 'failed' && previousStatus !== 'failed') {
      return 'task_failed';
    }
    if (newStatus === 'active' && previousStatus === 'pending') {
      return 'task_started';
    }
    if (newStatus === 'active' && previousStatus === 'active') {
      return 'task_switch';
    }
    return null;
  }

  /**
   * Get urgency level for a task
   */
  private getUrgencyForTask(task: Task): 'low' | 'medium' | 'high' {
    if (task.priority > 0.8) return 'high';
    if (task.priority > 0.5) return 'medium';
    return 'low';
  }

  /**
   * Get situation context for a task
   */
  private getSituationForTask(task: Task): string {
    if (task.type === 'crafting') return 'tool-crafting';
    if (task.type === 'gathering') return 'resource-gathering';
    if (task.type === 'exploration') return 'exploration';
    return 'task-management';
  }

  /**
   * Get count of active tasks
   */
  private async getActiveTasksCount(): Promise<number> {
    const activeTasks = Array.from(this.tasks.values()).filter(
      (task) => task.status === 'pending' || task.status === 'active'
    );
    return activeTasks.length;
  }

  /**
   * Get actionable thoughts (for testing)
   */
  async getActionableThoughts(): Promise<CognitiveThought[]> {
    return await this.cognitiveStreamClient.getActionableThoughts();
  }

  // Ephemeral per-step snapshot to compare before/after state
  private _stepStartSnapshots: Map<
    string,
    {
      position?: { x: number; y: number; z: number };
      food?: number;
      health?: number;
      inventoryTotal?: number;
      ts: number;
    }
  > = new Map();

  /**
   * Update the current (first incomplete) step label to include a leaf and its parameters
   */
  annotateCurrentStepWithLeaf(
    taskId: string,
    leafName: string,
    args: Record<string, any> = {}
  ): boolean {
    const task = this.tasks.get(taskId);
    if (!task || !Array.isArray(task.steps) || task.steps.length === 0)
      return false;
    const idx = task.steps.findIndex((s) => !s.done);
    if (idx < 0) return false;
    const step = task.steps[idx];

    // Pick a small, useful subset of params to include in label
    const keys = [
      'blockType',
      'block_type',
      'item',
      'recipe',
      'qty',
      'quantity',
      'count',
      'pos',
      'position',
      'target',
      'distance',
      'radius',
      'area',
      'tool',
      'placement',
      'pattern',
      'direction',
      'speed',
      'timeout',
    ];
    const picked: Record<string, any> = {};
    for (const k of keys) if (args[k] !== undefined) picked[k] = args[k];
    const paramStr = Object.keys(picked).length
      ? ` (${Object.entries(picked)
          .map(
            ([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`
          )
          .join(', ')})`
      : '';

    step.label = `Leaf: minecraft.${leafName}${paramStr}`;
    task.metadata.updatedAt = Date.now();
    this.emit('taskMetadataUpdated', { task, metadata: task.metadata });
    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskMetadataUpdated', {
        task,
        metadata: task.metadata,
      });
    }
    return true;
  }

  /**
   * Update the current (first incomplete) step label to include MCP option and parameters
   */
  annotateCurrentStepWithOption(
    taskId: string,
    optionName: string,
    args: Record<string, any> = {}
  ): boolean {
    const task = this.tasks.get(taskId);
    if (!task || !Array.isArray(task.steps) || task.steps.length === 0)
      return false;
    const idx = task.steps.findIndex((s) => !s.done);
    if (idx < 0) return false;
    const step = task.steps[idx];

    const keys = [
      'blockType',
      'block_type',
      'item',
      'recipe',
      'qty',
      'quantity',
      'count',
      'pos',
      'position',
      'target',
      'distance',
      'radius',
      'area',
      'tool',
      'placement',
      'pattern',
      'direction',
      'speed',
      'timeout',
    ];
    const picked: Record<string, any> = {};
    for (const k of keys) if (args[k] !== undefined) picked[k] = args[k];
    const paramStr = Object.keys(picked).length
      ? ` (${Object.entries(picked)
          .map(
            ([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`
          )
          .join(', ')})`
      : '';

    step.label = `Option: ${optionName}${paramStr}`;
    task.metadata.updatedAt = Date.now();
    this.emit('taskMetadataUpdated', { task, metadata: task.metadata });
    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskMetadataUpdated', {
        task,
        metadata: task.metadata,
      });
    }
    return true;
  }

  /**
   * Extract a parameter from a leaf-annotated step label: "Leaf: minecraft.X (key=value, ...)"
   */
  private getLeafParamFromLabel(
    label: string,
    key: string
  ): string | undefined {
    const m = label.match(/\((.*)\)$/);
    if (!m) return undefined;
    const parts = m[1].split(',').map((s) => s.trim());
    for (const p of parts) {
      const [k, ...rest] = p.split('=');
      if (k?.trim() === key) return rest.join('=').trim().replace(/^"|"$/g, '');
    }
    return undefined;
  }
  private statistics: TaskStatistics = {
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageCompletionTime: 0,
    successRate: 0,
    tasksByCategory: {},
    tasksBySource: {},
  };

  constructor(config: Partial<EnhancedTaskIntegrationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    const serviceClients = createServiceClients();
    this.minecraftClient = serviceClients.minecraft;

    // Initialize cognitive stream client for thought-to-task conversion
    this.cognitiveStreamClient = new CognitiveStreamClient();

    // Start cognition outbox flush timer
    this.cognitionOutbox.start();

    // Start thought-to-task conversion polling
    this.startThoughtToTaskConversion();

    if (this.config.enableProgressTracking) {
      this.startProgressTracking();
    }
  }

  /**
   * Register a domain solver by its solverId.
   */
  registerSolver(solver: BaseDomainSolver): void {
    this.solverRegistry.set(solver.solverId, solver);
  }

  /**
   * Retrieve a registered solver by solverId.
   */
  getSolver<T extends BaseDomainSolver>(solverId: string): T | undefined {
    return this.solverRegistry.get(solverId) as T | undefined;
  }

  /**
   * Add a new task to the system
   */
  async addTask(taskData: Partial<Task>): Promise<Task> {
    // Check for duplicate tasks
    const existingTask = this.findSimilarTask(taskData);
    if (existingTask) {
      // Task already exists: ${taskData.title} (${existingTask.id})
      return existingTask;
    }

    // Generate dynamic steps for the task
    const steps = await this.generateDynamicSteps(taskData);

    // Resolve requirements for the task
    const requirement = resolveRequirement(taskData);

    const task: Task = {
      id:
        taskData.id ||
        `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: taskData.title || 'Untitled Task',
      description: taskData.description || '',
      type: taskData.type || 'general',
      priority: taskData.priority || 0.5,
      urgency: taskData.urgency || 0.5,
      progress: 0,
      status: 'pending',
      source: taskData.source || 'manual',
      steps: (taskData.steps && taskData.steps.length > 0) ? taskData.steps : steps,
      parameters: taskData.parameters || {},
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: taskData.metadata?.maxRetries || 3,
        childTaskIds: [],
        tags: taskData.metadata?.tags || [],
        category: taskData.metadata?.category || 'general',
        requirement, // Add the resolved requirement
      },
    };

    // Check step executability: if no step has a leaf / executable flag,
    // the task cannot make progress without manual intervention.
    const hasExecutableStep = task.steps.some(
      (s) => s.meta?.leaf || s.meta?.executable === true
    );
    if (task.steps.length > 0 && !hasExecutableStep) {
      task.metadata.blockedReason = 'no-executable-plan';
    }

    this.tasks.set(task.id, task);
    this.updateStatistics();
    this.emit('taskAdded', task);

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskAdded', task);
    }

    return task;
  }

  /**
   * Find similar existing tasks to prevent duplicates
   */
  private findSimilarTask(taskData: Partial<Task>): Task | null {
    const title = taskData.title?.toLowerCase() || '';
    const type = taskData.type?.toLowerCase() || '';
    const source = taskData.source || '';

    // Check for exact title matches (pending or recently completed)
    for (const task of this.tasks.values()) {
      if (
        task.title.toLowerCase() === title &&
        (task.status === 'pending' || task.status === 'active')
      ) {
        return task;
      }
    }

    // Check for similar tasks of the same type and source
    for (const task of this.tasks.values()) {
      if (
        task.type.toLowerCase() === type &&
        task.source === source &&
        (task.status === 'pending' || task.status === 'active')
      ) {
        // Check if titles are similar (simple similarity check)
        const taskTitle = task.title.toLowerCase();
        const similarity = this.calculateTitleSimilarity(title, taskTitle);

        if (similarity > 0.7) {
          // 70% similarity threshold
          return task;
        }
      }
    }

    return null;
  }

  /**
   * Calculate similarity between two task titles
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const words1 = title1.split(/\s+/);
    const words2 = title2.split(/\s+/);

    const commonWords = words1.filter((word) => words2.includes(word));
    const totalWords = Math.max(words1.length, words2.length);

    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  /**
   * Update task metadata
   */
  updateTaskMetadata(
    taskId: string,
    metadata: Partial<Task['metadata']>
  ): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    task.metadata = { ...task.metadata, ...metadata, updatedAt: Date.now() };

    this.updateStatistics();
    this.emit('taskMetadataUpdated', { task, metadata });

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskMetadataUpdated', {
        task,
        metadata,
      });
    }

    return true;
  }

  /**
   * Update task progress and status
   */
  updateTaskProgress(
    taskId: string,
    progress: number,
    status?: Task['status']
  ): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    const oldProgress = task.progress;
    const oldStatus = task.status;

    // Don't update progress for failed tasks unless explicitly changing status
    if (task.status === 'failed' && !status) {
      console.log(`🔇 Suppressing progress update for failed task: ${taskId}`);
      return false;
    }

    task.progress = Math.max(0, Math.min(1, progress));
    task.metadata.updatedAt = Date.now();

    if (status) {
      task.status = status;

      if (status === 'active' && !task.metadata.startedAt) {
        task.metadata.startedAt = Date.now();
      } else if (status === 'completed' && !task.metadata.completedAt) {
        task.metadata.completedAt = Date.now();
        task.metadata.actualDuration =
          task.metadata.completedAt -
          (task.metadata.startedAt || task.metadata.createdAt);
        // Report building episode on completion
        this.reportBuildingEpisode(task, true);
      } else if (status === 'failed') {
        // Report building episode on failure
        this.reportBuildingEpisode(task, false);
      }
    }

    // Update progress tracker
    const currentStep = task.steps.findIndex((step) => !step.done);
    const completedSteps = task.steps.filter((step) => step.done).length;

    this.progressTracker.set(taskId, {
      taskId,
      progress: task.progress,
      currentStep: currentStep >= 0 ? currentStep : task.steps.length,
      completedSteps,
      totalSteps: task.steps.length,
      status: task.status,
      timestamp: Date.now(),
    });

    this.updateStatistics();
    this.emit('taskProgressUpdated', { task, oldProgress, oldStatus });

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskProgressUpdated', {
        task,
        oldProgress,
        oldStatus,
      });
    }

    return true;
  }

  /**
   * Complete a task step with action verification
   */
  async completeTaskStep(taskId: string, stepId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    const step = task.steps.find((s) => s.id === stepId);
    if (!step) {
      return false;
    }

    // Verify action was actually performed if verification is enabled
    if (this.config.enableActionVerification) {
      const verification = await this.verifyActionCompletion(
        taskId,
        stepId,
        step
      );
      if (!verification.verified) {
        // Step completion rejected - action not verified
        console.warn(`⚠️ Step verification failed: ${step.label}`);
        return false;
      }
    }

    step.done = true;
    step.completedAt = Date.now();
    if (step.startedAt) {
      step.actualDuration = step.completedAt - step.startedAt;
    }

    // Calculate progress regardless of task status
    const completedSteps = task.steps.filter((s) => s.done).length;
    const newProgress =
      task.steps.length > 0 ? completedSteps / task.steps.length : 1;

    // Update task progress (only if task is not failed)
    if (task.status !== 'failed') {
      this.updateTaskProgress(taskId, newProgress);
    } else {
      console.log(`🔇 Skipping progress update for failed task: ${taskId}`);
    }

    // Check if task is complete
    if (newProgress >= 1) {
      // For crafting tasks, verify the actual item is in inventory before marking as completed
      if (task.type === 'crafting') {
        try {
          const response = await this.minecraftRequest('/inventory', {
            timeout: 5000,
          });

          if (response.ok) {
            const data = (await response.json()) as any;
            const inventory = data.data || [];

            // Extract the expected item from the task title/description
            const taskText = `${task.title} ${task.description}`.toLowerCase();
            let expectedItem = '';

            if (taskText.includes('pickaxe')) {
              if (taskText.includes('wooden')) expectedItem = 'wooden_pickaxe';
              else if (taskText.includes('stone'))
                expectedItem = 'stone_pickaxe';
              else if (taskText.includes('iron')) expectedItem = 'iron_pickaxe';
              else if (taskText.includes('diamond'))
                expectedItem = 'diamond_pickaxe';
              else if (taskText.includes('gold'))
                expectedItem = 'golden_pickaxe';
              else expectedItem = 'pickaxe';
            } else if (taskText.includes('crafting table')) {
              expectedItem = 'crafting_table';
            }

            // Check if the expected item is in inventory
            const hasItem = inventory.some((item: any) =>
              item.type?.toLowerCase().includes(expectedItem.replace('_', ''))
            );

            if (!hasItem) {
              console.log(
                `⚠️ Crafting task steps completed but item not in inventory: ${expectedItem}`
              );
              // Don't mark as completed - let the autonomous executor handle it
              return true;
            }
          }
        } catch (error) {
          console.warn(
            'Failed to verify inventory for crafting task completion:',
            error
          );
        }
      }

      // For gathering tasks, verify the required items are in inventory before marking as completed
      if (task.type === 'gathering') {
        try {
          const response = await this.minecraftRequest('/inventory', {
            timeout: 5000,
          });

          if (response.ok) {
            const data = (await response.json()) as any;
            const inventory = data.data || [];

            // Extract the expected item from the task title/description
            const taskText = `${task.title} ${task.description}`.toLowerCase();
            let expectedItem = '';
            let expectedQuantity = 1;

            if (taskText.includes('wood') || taskText.includes('log')) {
              expectedItem = 'log';
              // Look for quantity in task parameters or description
              const quantityMatch = taskText.match(/(\d+)\s*(?:wood|log)/);
              if (quantityMatch) {
                expectedQuantity = parseInt(quantityMatch[1]);
              }
            } else if (taskText.includes('stone')) {
              expectedItem = 'stone';
            } else if (taskText.includes('iron')) {
              expectedItem = 'iron';
            } else if (taskText.includes('coal')) {
              expectedItem = 'coal';
            }

            // Check if the expected items are in inventory
            const matchingItems = inventory.filter((item: any) =>
              item.type?.toLowerCase().includes(expectedItem)
            );
            const totalQuantity = matchingItems.reduce(
              (sum: number, item: any) => sum + (item.count || 0),
              0
            );

            if (totalQuantity < expectedQuantity) {
              console.log(
                `⚠️ Gathering task steps completed but insufficient items in inventory: ${expectedQuantity} ${expectedItem} needed, ${totalQuantity} found`
              );
              // Don't mark as completed - let the autonomous executor handle it
              return true;
            }
          }
        } catch (error) {
          console.warn(
            'Failed to verify inventory for gathering task completion:',
            error
          );
        }
      }

      this.updateTaskProgress(taskId, 1, 'completed');
    }

    this.emit('taskStepCompleted', { task, step });

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskStepCompleted', { task, step });
    }

    return true;
  }

  /**
   * Verify that an action was actually completed
   */
  private async verifyActionCompletion(
    taskId: string,
    stepId: string,
    step: TaskStep
  ): Promise<ActionVerification> {
    const verification: ActionVerification = {
      taskId,
      stepId,
      actionType: step.label.toLowerCase(),
      expectedResult: this.getExpectedResultForStep(step),
      verified: false,
      timestamp: Date.now(),
    };

    try {
      // Check if bot is connected and can perform actions
      if (!(await this.isBotConnected())) {
        verification.verified = false;
        verification.actualResult = { error: 'Bot not connected' };
        return verification;
      }

      // Verify based on step type
      const stepLabel = step.label.toLowerCase();
      switch (stepLabel) {
        case 'locate nearby wood':
        case 'locate nearby resources':
          verification.verified = await this.verifyResourceLocation('wood');
          break;
        case 'move to resource location':
        case 'move to location':
          verification.verified = await this.verifyMovement();
          break;
        case 'collect wood safely':
        case 'collect resources safely':
          verification.verified = await this.verifyResourceCollection('wood');
          break;
        case 'store collected items':
          verification.verified = await this.verifyItemStorage();
          break;
        case 'check required materials':
          verification.verified = await this.verifyMaterialCheck();
          break;
        case 'gather missing materials':
          verification.verified = await this.verifyMaterialGathering();
          break;
        case 'access crafting interface':
          verification.verified = await this.verifyCraftingAccess();
          break;
        case 'create the item':
          verification.verified = await this.verifyItemCreation();
          break;
        default:
          // Handle MCP leaf-labeled steps like "Leaf: minecraft.move_to"
          if (stepLabel.startsWith('leaf: minecraft.')) {
            const leaf = stepLabel.replace('leaf: minecraft.', '').trim();
            if (leaf === 'move_to') {
              verification.verified = await this.verifyMovement();
            } else if (
              leaf === 'step_forward_safely' ||
              leaf === 'follow_entity'
            ) {
              verification.verified = await this.verifyMovement();
            } else if (leaf === 'dig_block') {
              // Prefer blockType/item in label when available
              const bt =
                this.getLeafParamFromLabel(stepLabel, 'blockType') ||
                this.getLeafParamFromLabel(stepLabel, 'item');
              const resource = bt ? String(bt) : 'wood';
              verification.verified =
                await this.verifyResourceCollection(resource);
            } else if (leaf === 'pickup_item') {
              verification.verified = await this.verifyPickupFromInventoryDelta(
                taskId,
                stepId
              );
            } else if (leaf === 'place_block') {
              const bt =
                this.getLeafParamFromLabel(stepLabel, 'blockType') ||
                this.getLeafParamFromLabel(stepLabel, 'item');
              verification.verified = await this.verifyNearbyBlock(bt);
            } else if (leaf === 'place_torch_if_needed') {
              verification.verified = await this.verifyNearbyBlock('torch');
            } else if (leaf === 'retreat_and_block') {
              const moved = await this.verifyMovement();
              const placed = await this.verifyNearbyBlock();
              verification.verified = moved || placed;
            } else if (leaf === 'consume_food') {
              verification.verified = await this.verifyConsumeFood(
                taskId,
                stepId
              );
            } else if (leaf === 'sense_hostiles') {
              verification.verified = true;
            } else if (leaf === 'get_light_level') {
              verification.verified = await this.verifyLightLevel();
            } else if (
              leaf === 'chat' ||
              leaf === 'wait' ||
              leaf === 'look_at' ||
              leaf === 'turn_left' ||
              leaf === 'turn_right' ||
              leaf === 'jump'
            ) {
              // Consider these non-critical and pass
              verification.verified = true;
            } else if (leaf === 'craft_recipe') {
              verification.verified = await this.verifyItemCreation();
            } else if (leaf === 'smelt') {
              verification.verified = await this.verifySmeltedItem();
            } else if (leaf === 'introspect_recipe') {
              verification.verified = true;
            } else if (leaf === 'prepare_site' || leaf === 'place_feature') {
              // P0 stubs: trust leaf output
              verification.verified = true;
            } else if (leaf === 'build_module') {
              // P0: verify leaf reports success (no inventory delta — leaf doesn't mutate)
              verification.verified = true;
            } else if (leaf === 'acquire_material') {
              const item =
                this.getLeafParamFromLabel(stepLabel, 'item');
              verification.verified =
                await this.verifyResourceCollection(item || 'unknown');
            } else if (leaf === 'replan_building') {
              // Replan sentinel — always succeeds; executor handles re-invocation
              verification.verified = true;
            } else {
              verification.verified = false;
              verification.actualResult = { error: `Unknown leaf: ${leaf}` };
            }
          } else {
            // For unknown steps, require manual verification
            verification.verified = false;
            verification.actualResult = {
              error: 'Unknown step type - requires manual verification',
            };
          }
      }

      this.actionVerifications.set(`${taskId}-${stepId}`, verification);
      return verification;
    } catch (error) {
      verification.verified = false;
      verification.actualResult = {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      return verification;
    }
  }

  /**
   * Get expected result for a step
   */
  private getExpectedResultForStep(step: TaskStep): any {
    const stepType = step.label.toLowerCase();

    if (stepType.includes('locate') || stepType.includes('find')) {
      return { found: true, location: 'nearby' };
    }
    if (stepType.includes('move') || stepType.includes('navigate')) {
      return { moved: true, distance: '>0' };
    }
    if (stepType.includes('collect') || stepType.includes('gather')) {
      return { collected: true, amount: '>0' };
    }
    if (stepType.includes('store') || stepType.includes('inventory')) {
      return { stored: true, inventory_updated: true };
    }
    if (stepType.includes('craft') || stepType.includes('create')) {
      return { crafted: true, item_created: true };
    }

    return { completed: true };
  }

  /**
   * Check if bot is connected
   */
  private async isBotConnected(): Promise<boolean> {
    try {
      const response = await this.minecraftRequest('/health', {
        timeout: 5000,
      });

      if (!response.ok) return false;

      const data = (await response.json()) as any;
      return data.botStatus?.connected === true;
    } catch (error) {
      // Failed to check bot connection: ${error}
      return false;
    }
  }

  /**
   * Verify resource location
   */
  private async verifyResourceLocation(resourceType: string): Promise<boolean> {
    try {
      // Check if we have the resource in inventory (indicating we found it)
      const response = await this.minecraftRequest('/inventory', {
        timeout: 5000,
      });

      if (!response.ok) return false;

      const data = (await response.json()) as any;
      const inventory = data.data || [];

      // Check if we have the expected resource type
      const resourceItems = inventory.filter((item: any) => {
        const itemName = item.type?.toLowerCase() || '';
        const resourceName = resourceType.toLowerCase();

        if (resourceName === 'wood') {
          return itemName.includes('log') || itemName.includes('wood');
        }

        return itemName.includes(resourceName);
      });

      const totalCount = resourceItems.reduce(
        (sum: number, item: any) => sum + (item.count || 0),
        0
      );

      // Resource location verification: ${resourceType} - found ${totalCount} items
      return totalCount > 0;
    } catch (error) {
      // Failed to verify resource location: ${error}
      return false;
    }
  }

  /**
   * Verify movement
   */
  private async verifyMovement(): Promise<boolean> {
    try {
      // Check bot position to see if it changed from step start (if available)
      const response = await this.minecraftRequest('/health', {
        timeout: 5000,
      });

      if (!response.ok) return false;

      const data = (await response.json()) as any;
      const position = data.botStatus?.position;
      if (!position) return false;

      if (this._stepStartSnapshots.size > 0) {
        const lastEntry = Array.from(this._stepStartSnapshots.entries()).pop();
        if (lastEntry) {
          const [key, start] = lastEntry as [string, any];
          if (start?.position) {
            const dx = (position.x ?? 0) - start.position.x;
            const dy = (position.y ?? 0) - start.position.y;
            const dz = (position.z ?? 0) - start.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            this._stepStartSnapshots.delete(key);
            return dist >= 0.5;
          }
        }
      }
      // Fallback: require at least a non-zero velocity or position change can't be verified
      const vel = data.botStatus?.velocity;
      if (vel && Math.abs(vel.x) + Math.abs(vel.y) + Math.abs(vel.z) > 0) {
        return true;
      }
      return false;
    } catch (error) {
      // Failed to verify movement: ${error}
      return false;
    }
  }

  /**
   * Verify a pickup by checking if inventory total increased since step start
   */
  private async verifyPickupFromInventoryDelta(
    taskId: string,
    stepId: string
  ): Promise<boolean> {
    try {
      const start = this._stepStartSnapshots.get(`${taskId}-${stepId}`) as any;
      const res = await this.minecraftRequest('/inventory', { timeout: 4000 });
      if (!res.ok) return false;
      const data = (await res.json()) as any;
      const inventory = data?.data || [];
      const total = Array.isArray(inventory)
        ? inventory.reduce((s: number, it: any) => s + (it?.count || 0), 0)
        : 0;
      if (start && typeof start.inventoryTotal === 'number') {
        return total > start.inventoryTotal;
      }
      // No baseline; accept if any items present
      return total > 0;
    } catch {
      return false;
    }
  }

  /**
   * Verify that a block is present nearby (optionally matching a pattern)
   */
  private async verifyNearbyBlock(pattern?: string): Promise<boolean> {
    try {
      const res = await this.minecraftRequest('/state', { timeout: 5000 });
      if (!res.ok) return false;
      const data = (await res.json()) as any;
      const blocks: any[] =
        data?.data?.worldState?.environment?.nearbyBlocks || [];
      if (!Array.isArray(blocks)) return false;
      if (!pattern) {
        return blocks.length > 0; // some block visible nearby
      }
      const p = pattern.toLowerCase();
      return blocks.some((b: any) =>
        String(b?.type || b?.name || '')
          .toLowerCase()
          .includes(p)
      );
    } catch {
      return false;
    }
  }

  /**
   * Verify that food level increased since step start (consume_food)
   */
  private async verifyConsumeFood(
    taskId: string,
    stepId: string
  ): Promise<boolean> {
    try {
      const start = this._stepStartSnapshots.get(`${taskId}-${stepId}`) as any;
      const res = await this.minecraftRequest('/health', { timeout: 4000 });
      if (!res.ok) return false;
      const data = (await res.json()) as any;
      const food = data?.botStatus?.food;
      if (typeof food !== 'number') return false;
      if (start && typeof start.food === 'number') {
        return food > start.food;
      }
      return food > 0;
    } catch {
      return false;
    }
  }

  /**
   * Verify we can read a light level (for get_light_level leaf)
   */
  private async verifyLightLevel(): Promise<boolean> {
    try {
      const res = await this.minecraftRequest('/state', { timeout: 4000 });
      if (!res.ok) return false;
      const data = (await res.json()) as any;
      const time = data?.data?.worldState?.environment?.timeOfDay;
      return typeof time === 'number';
    } catch {
      return false;
    }
  }

  /**
   * Verify smelted item presence (heuristic: iron ingot or similar)
   */
  private async verifySmeltedItem(): Promise<boolean> {
    try {
      const res = await this.minecraftRequest('/inventory', { timeout: 5000 });
      if (!res.ok) return false;
      const data = (await res.json()) as any;
      const inventory = data?.data || [];
      const patterns = ['iron_ingot', 'cooked_', 'charcoal'];
      return inventory.some((it: any) => {
        const name = String(it?.type || it?.name || '').toLowerCase();
        return patterns.some((p) => name.includes(p));
      });
    } catch {
      return false;
    }
  }

  /**
   * Verify resource collection
   */
  private async verifyResourceCollection(
    resourceType: string
  ): Promise<boolean> {
    try {
      const response = await this.minecraftRequest('/inventory', {
        timeout: 5000,
      });

      if (!response.ok) return false;

      const data = (await response.json()) as any;
      const inventory = data.data || [];

      // Check if we have the expected resource type
      const resourceItems = inventory.filter((item: any) => {
        const itemName = item.type?.toLowerCase() || '';
        const resourceName = resourceType.toLowerCase();

        if (resourceName === 'wood') {
          return itemName.includes('log') || itemName.includes('wood');
        }

        return itemName.includes(resourceName);
      });

      // Verify we have at least one item of the resource type
      const totalCount = resourceItems.reduce(
        (sum: number, item: any) => sum + (item.count || 0),
        0
      );

      // Resource verification: ${resourceType} - found ${totalCount} items
      return totalCount > 0;
    } catch (error) {
      // Failed to verify resource collection: ${error}
      return false;
    }
  }

  /**
   * Verify item storage
   */
  private async verifyItemStorage(): Promise<boolean> {
    try {
      // Check if items are in inventory (indicating they were stored)
      const response = await this.minecraftRequest('/inventory', {
        timeout: 5000,
      });

      if (!response.ok) return false;

      const data = (await response.json()) as any;
      const inventory = data.data || [];

      // Check if we have any items in inventory
      const totalItems = inventory.reduce(
        (sum: number, item: any) => sum + (item.count || 0),
        0
      );

      // Item storage verification: ${totalItems} items in inventory
      return totalItems > 0;
    } catch (error) {
      // Failed to verify item storage: ${error}
      return false;
    }
  }

  /**
   * Verify material check
   */
  private async verifyMaterialCheck(): Promise<boolean> {
    try {
      // Check if we have the required materials for crafting
      const response = await this.minecraftRequest('/inventory', {
        timeout: 5000,
      });

      if (!response.ok) return false;

      const data = (await response.json()) as any;
      const inventory = data.data || [];

      // Check for common crafting materials
      const hasWood = inventory.some(
        (item: any) =>
          item.type?.toLowerCase().includes('log') ||
          item.type?.toLowerCase().includes('wood')
      );
      const hasSticks = inventory.some((item: any) =>
        item.type?.toLowerCase().includes('stick')
      );

      // Material check verification: wood=${hasWood}, sticks=${hasSticks}
      return hasWood || hasSticks;
    } catch (error) {
      // Failed to verify material check: ${error}
      return false;
    }
  }

  /**
   * Verify material gathering
   */
  private async verifyMaterialGathering(): Promise<boolean> {
    // This is similar to resource collection verification
    return await this.verifyResourceCollection('materials');
  }

  /**
   * Verify crafting access with intelligent decision-making
   */
  private async verifyCraftingAccess(): Promise<boolean> {
    try {
      console.log('🔍 Starting intelligent crafting table analysis...');

      // Step 1: Check if we have a crafting table in inventory
      const response = await this.minecraftRequest('/inventory', {
        timeout: 5000,
      });

      if (!response.ok) return false;

      const data = (await response.json()) as any;
      const inventory = data.data || [];

      const hasCraftingTable = inventory.some((item: any) =>
        item.type?.toLowerCase().includes('crafting_table')
      );

      if (hasCraftingTable) {
        console.log('✅ Crafting access verified: crafting table in inventory');
        return true;
      }

      // Step 2: Check if we have resources to make a crafting table
      const craftingAnalysis =
        await this.analyzeCraftingTableOptions(inventory);

      if (craftingAnalysis.canCraft) {
        console.log('🔨 Can craft crafting table with available resources');
        // Weighted decision: prefer crafting if we have materials readily available
        return true;
      }

      // Step 3: Check for nearby crafting tables in the world
      const nearbyCraftingTables = await this.scanForNearbyCraftingTables();

      if (nearbyCraftingTables.length > 0) {
        const nearestTable = nearbyCraftingTables[0];
        console.log(
          `🏗️ Found nearby crafting table at distance ${nearestTable.distance} blocks`
        );

        // Decision weight: nearby tables vs. crafting new one
        const locationScore = this.evaluateTableLocation(
          nearestTable,
          craftingAnalysis
        );

        if (locationScore.useExisting) {
          console.log(
            `✅ Using existing crafting table (score: ${locationScore.score})`
          );
          return true;
        } else {
          console.log(
            `🔨 Better to craft new table (score: ${locationScore.score})`
          );
          // Will need to gather resources first
          return craftingAnalysis.canCraft;
        }
      }

      // Step 4: No table available, check if we can eventually get one
      if (
        craftingAnalysis.needsGathering &&
        craftingAnalysis.gatheringFeasible
      ) {
        console.log(
          '🌳 Need to gather resources for crafting table - feasible'
        );
        return false; // Will trigger resource gathering
      }

      // Fall back to basic 2x2 crafting if available
      console.log('⚠️ No crafting table access - using basic crafting only');
      return false;
    } catch (error) {
      console.error('Error verifying crafting access:', error);
      return false;
    }
  }

  /**
   * Verify item creation
   */
  private async verifyItemCreation(): Promise<boolean> {
    try {
      // Check if the crafted item is now in inventory
      const response = await this.minecraftRequest('/inventory', {
        timeout: 5000,
      });

      if (!response.ok) return false;

      const data = (await response.json()) as any;
      const inventory = data.data || [];

      // Look for crafted items (pickaxe, tools, etc.)
      const craftedItems = inventory.filter((item: any) => {
        const itemName = item.type?.toLowerCase() || '';
        return (
          itemName.includes('pickaxe') ||
          itemName.includes('axe') ||
          itemName.includes('shovel') ||
          itemName.includes('hoe') ||
          itemName.includes('sword')
        );
      });

      const totalCrafted = craftedItems.reduce(
        (sum: number, item: any) => sum + (item.count || 0),
        0
      );

      // Item creation verification: found ${totalCrafted} crafted items
      return totalCrafted > 0;
    } catch (error) {
      // Failed to verify item creation: ${error}
      return false;
    }
  }

  /**
   * Start a task step
   */
  startTaskStep(taskId: string, stepId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    const step = task.steps.find((s) => s.id === stepId);
    if (!step) {
      return false;
    }

    step.startedAt = Date.now();

    // Capture bot snapshot at step start for verification
    (async () => {
      try {
        const [healthRes, invRes] = await Promise.all([
          this.minecraftRequest('/health', { timeout: 3000 }),
          this.minecraftRequest('/inventory', { timeout: 3000 }),
        ]);

        const snap: any = { ts: Date.now() };
        if (healthRes.ok) {
          const data = (await healthRes.json()) as any;
          const p = data?.botStatus?.position;
          if (
            p &&
            typeof p.x === 'number' &&
            typeof p.y === 'number' &&
            typeof p.z === 'number'
          ) {
            snap.position = { x: p.x, y: p.y, z: p.z };
          }
          const food = data?.botStatus?.food;
          if (typeof food === 'number') snap.food = food;
          const health = data?.botStatus?.health;
          if (typeof health === 'number') snap.health = health;
        }
        if (invRes.ok) {
          const invData = (await invRes.json()) as any;
          const inventory = invData?.data || [];
          snap.inventoryTotal = Array.isArray(inventory)
            ? inventory.reduce((s: number, it: any) => s + (it?.count || 0), 0)
            : 0;
        }
        this._stepStartSnapshots.set(`${taskId}-${stepId}`, snap);
      } catch {
        // Ignore snapshot creation errors to avoid blocking task execution
      }
    })();

    // Update task status to active if it was pending
    if (task.status === 'pending') {
      this.updateTaskProgress(taskId, task.progress, 'active');
    }

    this.emit('taskStepStarted', { task, step });

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskStepStarted', { task, step });
    }

    return true;
  }

  /**
   * Get all active tasks
   */
  getActiveTasks(): Task[] {
    // Return active/pending tasks sorted by priority (desc) then createdAt (asc)
    return Array.from(this.tasks.values())
      .filter((task) => task.status === 'active' || task.status === 'pending')
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return (a.metadata.createdAt || 0) - (b.metadata.createdAt || 0);
      });
  }

  /**
   * Insert steps before the current (first incomplete) step.
   * Renumbers orders to keep them sequential. Skips duplicates by label.
   */
  addStepsBeforeCurrent(
    taskId: string,
    newSteps: Array<Pick<TaskStep, 'label' | 'estimatedDuration'>>
  ): boolean {
    const task = this.tasks.get(taskId);
    if (!task || !Array.isArray(newSteps) || newSteps.length === 0)
      return false;

    const existingLabels = new Set(
      task.steps.map((s) => s.label.toLowerCase())
    );
    const stepsToInsert: TaskStep[] = newSteps
      .filter((s) => s.label && !existingLabels.has(s.label.toLowerCase()))
      .map((s, idx) => ({
        id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${idx}`,
        label: s.label,
        done: false,
        order: 0, // temp, we reassign below
        estimatedDuration: s.estimatedDuration ?? 3000,
      }));

    if (stepsToInsert.length === 0) return false;

    const insertIndex = task.steps.findIndex((s) => !s.done);
    const at = insertIndex >= 0 ? insertIndex : task.steps.length;
    task.steps.splice(at, 0, ...stepsToInsert);

    // Renumber orders
    task.steps.forEach((s, i) => (s.order = i + 1));

    task.metadata.updatedAt = Date.now();
    this.emit('taskStepsInserted', { task, count: stepsToInsert.length, at });
    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskStepsInserted', {
        task,
        inserted: stepsToInsert,
        at,
      });
    }
    return true;
  }

  /**
   * Get all tasks with optional filtering
   */
  getTasks(filters?: {
    status?: Task['status'];
    source?: Task['source'];
    category?: string;
    limit?: number;
  }): Task[] {
    let tasks = Array.from(this.tasks.values());

    if (filters?.status) {
      tasks = tasks.filter((task) => task.status === filters.status);
    }

    if (filters?.source) {
      tasks = tasks.filter((task) => task.source === filters.source);
    }

    if (filters?.category) {
      tasks = tasks.filter(
        (task) => task.metadata.category === filters.category
      );
    }

    if (filters?.limit) {
      tasks = tasks.slice(0, filters.limit);
    }

    return tasks.sort((a, b) => {
      // Sort by priority first, then by creation time
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.metadata.createdAt - b.metadata.createdAt;
    });
  }

  /**
   * Get task statistics
   */
  getTaskStatistics(): TaskStatistics {
    return { ...this.statistics };
  }

  /**
   * Get task progress for a specific task
   */
  getTaskProgress(taskId: string): TaskProgress | null {
    return this.progressTracker.get(taskId) || null;
  }

  /**
   * Get all task progress
   */
  getAllTaskProgress(): TaskProgress[] {
    return Array.from(this.progressTracker.values());
  }

  /**
   * Generate dynamic steps for a task using LLM
   */
  /**
   * Derive executor-ready args from step meta's produces/consumes arrays.
   * Mirrors the logic in modular-server's stepToLeafExecution so that args
   * are determined once at step-creation time (single source of truth).
   */
  private deriveLeafArgs(meta: Record<string, unknown>): Record<string, unknown> | undefined {
    const leaf = meta.leaf as string | undefined;
    if (!leaf) return undefined;
    const produces = (meta.produces as Array<{ name: string; count: number }>) || [];
    const consumes = (meta.consumes as Array<{ name: string; count: number }>) || [];

    switch (leaf) {
      case 'dig_block': {
        const item = produces[0];
        return { blockType: item?.name || 'oak_log', count: item?.count || 1 };
      }
      case 'craft_recipe': {
        const output = produces[0];
        return { recipe: output?.name || 'unknown', qty: output?.count || 1 };
      }
      case 'smelt': {
        const output = produces[0];
        return { item: output?.name || 'unknown' };
      }
      case 'place_block': {
        const consumed = consumes[0];
        return { item: consumed?.name || 'crafting_table' };
      }
      case 'prepare_site':
      case 'build_module':
      case 'place_feature':
      case 'acquire_material': {
        return {
          moduleId: meta.moduleId,
          item: meta.item,
          count: meta.count,
          ...((meta as any).args || {}),
        };
      }
      default:
        return undefined;
    }
  }

  private async generateDynamicSteps(
    taskData: Partial<Task>
  ): Promise<TaskStep[]> {
    // Try Sterling tool progression solver first (supersedes crafting for tiered tools)
    if (this.toolProgressionSolver) {
      try {
        const steps = await this.generateToolProgressionStepsFromSterling(taskData);
        if (steps && steps.length > 0) {
          return steps;
        }
      } catch (error) {
        console.warn('Sterling tool progression solver failed, falling through:', error);
      }
    }

    // Try Sterling crafting solver for crafting/gathering tasks
    if (this.craftingSolver) {
      try {
        const steps = await this.generateStepsFromSterling(taskData);
        if (steps && steps.length > 0) {
          return steps;
        }
      } catch (error) {
        console.warn('Sterling crafting solver failed, falling through:', error);
      }
    }

    // Try Sterling building solver for building tasks
    if (this.buildingSolver) {
      try {
        const steps = await this.generateBuildingStepsFromSterling(taskData);
        if (steps && steps.length > 0) {
          return steps;
        }
      } catch (error) {
        console.warn('Sterling building solver failed, falling through:', error);
      }
    }

    // Fallback-macro planner: requirement-driven leaf-mapped steps
    const leafSteps = this.generateLeafMappedSteps(taskData);
    if (leafSteps.length > 0) return leafSteps;

    // No executable plan available — return empty to trigger blockedReason.
    // Tasks with steps: [] get blockedReason: 'no-executable-plan' at addTask().
    return [];
  }

  /**
   * Generate steps from Sterling crafting solver for crafting/gathering/mining tasks
   */
  private async generateStepsFromSterling(
    taskData: Partial<Task>
  ): Promise<TaskStep[]> {
    if (!this.craftingSolver) return [];

    // Resolve the requirement to determine if this is a craft/collect/mine task
    const requirement = resolveRequirement(taskData);
    if (!requirement) return [];

    let goalItem: string | undefined;

    if (requirement.kind === 'craft') {
      goalItem = requirement.outputPattern;
    } else if (requirement.kind === 'collect' || requirement.kind === 'mine') {
      // Sterling crafting solver is primarily for crafting chains;
      // simple gather/mine tasks don't benefit from graph search
      return [];
    }

    if (!goalItem) return [];

    // Get current inventory and nearby blocks — prefer task metadata, fall back to live bot state
    let inventoryItems = (taskData.metadata as any)?.currentState?.inventory;
    let nearbyBlocks = (taskData.metadata as any)?.currentState?.nearbyBlocks;

    if (!inventoryItems || !nearbyBlocks) {
      const botCtx = await this.fetchBotContext();
      inventoryItems = inventoryItems || botCtx.inventory;
      nearbyBlocks = nearbyBlocks || botCtx.nearbyBlocks;
    }

    // Load mcData — prefer task metadata, fall back to lazy-loaded cache
    const mcData = (taskData.metadata as any)?.mcData || this.getMcData();
    if (!mcData) {
      console.warn('⚠️ Cannot invoke Sterling crafting solver — minecraft-data unavailable');
      return [];
    }

    console.log(`🔧 [Sterling] Invoking crafting solver for goal: ${goalItem}`);
    const result = await this.craftingSolver.solveCraftingGoal(
      goalItem,
      inventoryItems,
      mcData,
      nearbyBlocks
    );

    // Store planId in task metadata for episode reporting
    if (taskData.metadata && result.planId) {
      (taskData.metadata as any).craftingPlanId = result.planId;
    }

    if (result.solved) {
      console.log(`✅ [Sterling] Crafting solver found plan: ${result.planId} (${result.steps?.length || 0} steps)`);
    } else {
      console.log(`❌ [Sterling] Crafting solver: no solution for ${goalItem}`);
    }

    if (!result.solved) return [];

    const steps = this.craftingSolver.toTaskSteps(result);
    return steps.map(s => {
      const enrichedMeta: Record<string, unknown> = {
        ...s.meta,
        source: 'sterling',
        solverId: this.craftingSolver!.solverId,
        planId: result.planId,
        bundleId: result.solveMeta?.bundles?.[0]?.bundleId,
        executable: !!s.meta?.leaf,
      };
      const args = this.deriveLeafArgs(enrichedMeta);
      if (args) enrichedMeta.args = args;
      return { ...s, meta: enrichedMeta };
    });
  }

  /**
   * Generate steps from Sterling tool progression solver for tiered tool tasks.
   *
   * Activated when resolveRequirement() returns kind='tool_progression'.
   * Returns needsBlocks early-exit signal when required ores aren't observed.
   */
  private async generateToolProgressionStepsFromSterling(
    taskData: Partial<Task>
  ): Promise<TaskStep[]> {
    if (!this.toolProgressionSolver) return [];

    const requirement = resolveRequirement(taskData);
    if (!requirement || requirement.kind !== 'tool_progression') return [];

    const targetTool = requirement.targetTool as string;

    // Get current inventory — prefer task metadata, fall back to live bot state
    let inventoryItems: Array<{ name: string; count: number } | null | undefined> =
      (taskData.metadata as any)?.currentState?.inventory;
    let nearbyBlocks: string[] = (taskData.metadata as any)?.currentState?.nearbyBlocks;

    if (!inventoryItems || !nearbyBlocks) {
      const botCtx = await this.fetchBotContext();
      inventoryItems = inventoryItems || botCtx.inventory;
      nearbyBlocks = nearbyBlocks || botCtx.nearbyBlocks;
    }

    // Convert inventory array to record
    const inventory: Record<string, number> = {};
    for (const item of inventoryItems) {
      if (!item || !item.name) continue;
      inventory[item.name] = (inventory[item.name] || 0) + item.count;
    }

    const result = await this.toolProgressionSolver.solveToolProgression(
      targetTool,
      inventory,
      nearbyBlocks
    );

    // Store planId in task metadata for episode reporting
    if (taskData.metadata && result.planId) {
      (taskData.metadata as any).toolProgressionPlanId = result.planId;
    }

    // Log needsBlocks signal for observability (don't suppress it)
    if (result.needsBlocks) {
      console.log(
        `[ToolProgression] Needs blocks for ${targetTool}: ${result.needsBlocks.missingBlocks.join(', ')} ` +
        `(blocked at ${result.needsBlocks.blockedAtTier} tier)`
      );
    }

    if (!result.solved) return [];

    const steps = this.toolProgressionSolver.toTaskSteps(result);
    return steps.map(s => {
      const enrichedMeta: Record<string, unknown> = {
        ...s.meta,
        source: 'sterling',
        solverId: this.toolProgressionSolver!.solverId,
        planId: result.planId,
        bundleId: result.solveMeta?.bundles?.[0]?.bundleId,
        executable: !!s.meta?.leaf,
      };
      const args = this.deriveLeafArgs(enrichedMeta);
      if (args) enrichedMeta.args = args;
      return { ...s, meta: enrichedMeta };
    });
  }

  /**
   * Generate steps from Sterling building solver for building tasks.
   *
   * Uses P0 quarantined templateId ('basic_shelter_5x5__p0stub') so learning
   * never contaminates the real template digest.
   */
  private async generateBuildingStepsFromSterling(
    taskData: Partial<Task>
  ): Promise<TaskStep[]> {
    if (!this.buildingSolver) return [];

    const requirement = resolveRequirement(taskData);
    if (!requirement || requirement.kind !== 'build') return [];

    const {
      getBasicShelterTemplate,
      inventoryForBuilding,
      buildSiteState,
    } = await import('./sterling/minecraft-building-rules');

    const template = getBasicShelterTemplate();

    const currentState = (taskData.metadata as any)?.currentState;
    const inventoryItems = currentState?.inventory || [];
    const inventory = inventoryForBuilding(inventoryItems);

    // Build a default site state from whatever we have
    const position = currentState?.position;
    const siteState = buildSiteState(
      (currentState?.terrain as any) || 'flat',
      (currentState?.biome as string) || 'plains',
      !!(currentState?.treesNearby),
      !!(currentState?.waterNearby),
      (currentState?.siteCaps as string) || 'flat_5x5_clear'
    );

    // P0 quarantine: use stub templateId so learning doesn't contaminate real template
    const templateId = 'basic_shelter_5x5__p0stub';

    // Guard against infinite replan loops — max 1 replan per task
    const replanCount = ((taskData.metadata as any)?.buildingReplanCount as number) || 0;
    const MAX_REPLANS = 1;

    const result = await this.buildingSolver.solveBuildingPlan(
      templateId,
      'N',
      template.defaultGoalModules,
      inventory,
      siteState,
      template.modules.map((m) => ({ ...m, placementFeasible: true })),
      'stub', // P0: salt digest so stub learning is isolated from live
    );

    // Store planId + templateId in task metadata for episode reporting
    if (taskData.metadata) {
      (taskData.metadata as any).buildingPlanId = result.planId;
      (taskData.metadata as any).buildingTemplateId = templateId;
    }

    // If deficit persists after replan limit, fail explicitly instead of looping
    if (result.needsMaterials && replanCount >= MAX_REPLANS) {
      const deficit = result.needsMaterials.deficit;
      const deficitStr = Object.entries(deficit)
        .map(([k, v]) => `${k}x${v}`)
        .join(', ');
      console.warn(`[Building] Replan limit reached (${MAX_REPLANS}). Still missing: ${deficitStr}`);
      return [{
        id: `step-${Date.now()}-replan-exhausted`,
        label: `Building failed: materials still missing after acquisition (${deficitStr})`,
        done: false,
        order: 1,
        estimatedDuration: 0,
        meta: { domain: 'building', leaf: 'replan_exhausted', deficit, templateId },
      }];
    }

    // Track replan count so the next invocation knows how many we've done
    if (result.needsMaterials && taskData.metadata) {
      (taskData.metadata as any).buildingReplanCount = replanCount + 1;
    }

    const steps = this.buildingSolver.toTaskStepsWithReplan(result, templateId);
    return steps.map(s => {
      const enrichedMeta: Record<string, unknown> = {
        ...s.meta,
        source: 'sterling',
        solverId: this.buildingSolver!.solverId,
        planId: result.planId,
        bundleId: result.solveMeta?.bundles?.[0]?.bundleId,
        executable: !!s.meta?.leaf,
      };
      const args = this.deriveLeafArgs(enrichedMeta);
      if (args) enrichedMeta.args = args;
      return { ...s, meta: enrichedMeta };
    });
  }

  /**
   * Report a building episode result to Sterling for learning.
   *
   * Reads planId and templateId from task metadata (NOT from solver singleton).
   * Episode reports are quarantined by templateId ('basic_shelter_5x5__p0stub')
   * so P0 stubs never contaminate real template learning.
   */
  private reportBuildingEpisode(task: Task, success: boolean): void {
    if (!this.buildingSolver) return;
    const templateId = (task.metadata as any)?.buildingTemplateId;
    if (!templateId) return;

    const planId = (task.metadata as any)?.buildingPlanId;

    // Prefer structured step.meta for module IDs; fall back to label parsing
    const completedModuleIds = task.steps
      .filter((s) => s.done && (
        (s.meta?.domain === 'building' && s.meta?.moduleId) ||
        s.label.includes('build_module')
      ))
      .map((s) => (s.meta?.moduleId as string) || this.getLeafParamFromLabel(s.label, 'module'))
      .filter(Boolean) as string[];

    const failedStep = task.steps.find(
      (s) => !s.done && (
        (s.meta?.domain === 'building' && s.meta?.moduleId) ||
        s.label.includes('minecraft.')
      )
    );
    const failedModuleId = failedStep
      ? (failedStep.meta?.moduleId as string) || this.getLeafParamFromLabel(failedStep.label, 'module')
      : undefined;

    // P0: all episodes are stub — server can distinguish via isStub + executionMode digest
    this.buildingSolver.reportEpisodeResult(
      templateId,
      success,
      completedModuleIds,
      failedModuleId || undefined,
      success ? undefined : 'execution_failure',
      planId,
      true, // isStub — P0 leaves don't mutate world/inventory
    );

    console.log(
      `[Building] Episode reported: planId=${planId}, success=${success}, modules=${completedModuleIds.length}`
    );
  }

  /**
   * Generate leaf-mapped steps from resolved requirement.
   * Uses requirement resolution (not label regex) and validates through
   * the leaf arg contract before marking executable.
   */
  private generateLeafMappedSteps(taskData: Partial<Task>): TaskStep[] {
    const requirement = resolveRequirement(taskData);
    if (!requirement) return [];

    const plan = requirementToFallbackPlan(requirement);
    if (!plan || plan.length === 0) return [];

    const taskId = taskData.id || 'unknown';
    return plan.map((step, index) => ({
      id: `step-fallback-${taskId}-${index + 1}`,
      label: step.label,
      done: false,
      order: index + 1,
      estimatedDuration: step.leaf === 'dig_block' ? 10000
        : step.leaf === 'craft_recipe' ? 5000 : 15000,
      meta: {
        authority: 'fallback-macro',
        leaf: step.leaf,
        executable: true,
        args: step.args,
      },
    }));
  }


  /**
   * Update task statistics
   */
  private updateStatistics(): void {
    const tasks = Array.from(this.tasks.values());

    this.statistics.totalTasks = tasks.length;
    this.statistics.activeTasks = tasks.filter(
      (t) => t.status === 'active'
    ).length;
    this.statistics.completedTasks = tasks.filter(
      (t) => t.status === 'completed'
    ).length;
    this.statistics.failedTasks = tasks.filter(
      (t) => t.status === 'failed'
    ).length;

    // Calculate success rate
    const completedOrFailed =
      this.statistics.completedTasks + this.statistics.failedTasks;
    this.statistics.successRate =
      completedOrFailed > 0
        ? this.statistics.completedTasks / completedOrFailed
        : 0;

    // Calculate average completion time
    const completedTasks = tasks.filter(
      (t) => t.status === 'completed' && t.metadata.actualDuration
    );
    if (completedTasks.length > 0) {
      const totalTime = completedTasks.reduce(
        (sum, task) => sum + (task.metadata.actualDuration || 0),
        0
      );
      this.statistics.averageCompletionTime = totalTime / completedTasks.length;
    }

    // Count tasks by category
    this.statistics.tasksByCategory = {};
    tasks.forEach((task) => {
      const category = task.metadata.category;
      this.statistics.tasksByCategory[category] =
        (this.statistics.tasksByCategory[category] || 0) + 1;
    });

    // Count tasks by source
    this.statistics.tasksBySource = {};
    tasks.forEach((task) => {
      const source = task.source;
      this.statistics.tasksBySource[source] =
        (this.statistics.tasksBySource[source] || 0) + 1;
    });
  }

  /**
   * Start progress tracking
   */
  private startProgressTracking(): void {
    setInterval(() => {
      const activeTasks = this.getActiveTasks();

      activeTasks.forEach((task) => {
        // Only update progress based on step completion if no manual progress has been set
        // This prevents overriding autonomous task executor progress updates
        const completedSteps = task.steps.filter((step) => step.done).length;
        const totalSteps = task.steps.length;

        if (totalSteps > 0) {
          const stepBasedProgress = completedSteps / totalSteps;

          // Only update if the step-based progress is significantly higher than current progress
          // This allows manual progress updates to take precedence
          if (stepBasedProgress > task.progress + 0.05) {
            this.updateTaskProgress(task.id, stepBasedProgress);
          }
        }
      });
    }, this.config.progressUpdateInterval);
  }

  /**
   * Notify dashboard of changes
   */
  private async notifyDashboard(event: string, data: any): Promise<void> {
    try {
      await fetch(`${this.config.dashboardEndpoint}/api/task-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, data, timestamp: Date.now() }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      // Failed to notify dashboard: ${error}
    }
  }

  /**
   * Clean up completed tasks from memory
   */
  cleanupCompletedTasks(): void {
    const completedTasks = Array.from(this.tasks.values()).filter(
      (task) => task.status === 'completed' || task.status === 'failed'
    );

    completedTasks.forEach((task) => {
      // Move to history
      this.taskHistory.push(task);
      this.tasks.delete(task.id);
      this.progressTracker.delete(task.id);
    });

    // Limit history size
    if (this.taskHistory.length > this.config.maxTaskHistory) {
      this.taskHistory = this.taskHistory.slice(-this.config.maxTaskHistory);
    }

    this.updateStatistics();
  }

  /**
   * Get task history
   */
  getTaskHistory(limit: number = 50): Task[] {
    return this.taskHistory.slice(-limit);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<EnhancedTaskIntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): EnhancedTaskIntegrationConfig {
    return { ...this.config };
  }

  /**
   * Analyze crafting table options and resource availability
   */
  private async analyzeCraftingTableOptions(inventory: any[]): Promise<{
    canCraft: boolean;
    hasWood: boolean;
    needsGathering: boolean;
    gatheringFeasible: boolean;
    woodCount: number;
    resourceEfficiency: number;
  }> {
    try {
      // Check for wood/planks in inventory
      const woodItems = inventory.filter(
        (item: any) =>
          item.type?.toLowerCase().includes('log') ||
          item.type?.toLowerCase().includes('wood') ||
          item.type?.toLowerCase().includes('plank')
      );

      const woodCount = woodItems.reduce(
        (total, item) => total + (item.count || 1),
        0
      );
      const hasWood = woodCount >= 4; // Need 4 wood planks for crafting table

      // Check if we can convert logs to planks
      const logItems = inventory.filter((item: any) =>
        item.type?.toLowerCase().includes('log')
      );
      const logCount = logItems.reduce(
        (total, item) => total + (item.count || 1),
        0
      );
      const totalWoodPotential = woodCount + logCount * 4; // Each log = 4 planks

      const canCraft = totalWoodPotential >= 4;
      const needsGathering = !canCraft;

      // Check if gathering is feasible (are we in an area with trees?)
      const gatheringFeasible = await this.assessGatheringFeasibility();

      // Calculate resource efficiency (how much extra wood we have)
      const resourceEfficiency = Math.min(1.0, totalWoodPotential / 16); // Normalize to 0-1

      return {
        canCraft,
        hasWood,
        needsGathering,
        gatheringFeasible,
        woodCount: totalWoodPotential,
        resourceEfficiency,
      };
    } catch (error) {
      console.error('Error analyzing crafting table options:', error);
      return {
        canCraft: false,
        hasWood: false,
        needsGathering: true,
        gatheringFeasible: false,
        woodCount: 0,
        resourceEfficiency: 0,
      };
    }
  }

  /**
   * Evaluate whether to use existing table or craft new one
   */
  private evaluateTableLocation(
    nearestTable: { position: any; distance: number },
    craftingAnalysis: any
  ): { useExisting: boolean; score: number; reasoning: string } {
    try {
      // Factors to consider:
      // 1. Distance to existing table
      // 2. Resource availability for new table
      // 3. Travel time vs crafting time
      // 4. Strategic positioning

      let score = 0;
      let reasoning = '';

      // Distance factor (closer is better for existing table)
      const distanceFactor = Math.max(0, 1 - nearestTable.distance / 20); // 20 blocks = 0 score
      const distanceScore = distanceFactor * 0.4; // 40% weight

      // Resource availability factor (having resources favors crafting new)
      const resourceScore = craftingAnalysis.resourceEfficiency * 0.3; // 30% weight

      // Travel time estimation (distance in blocks ~= seconds of travel)
      const travelTime = nearestTable.distance * 2; // Rough estimate: 2 seconds per block
      const craftingTime = craftingAnalysis.canCraft ? 10 : 60; // 10s if have materials, 60s if need to gather

      const timeEfficiencyScore = travelTime < craftingTime ? 0.2 : 0; // 20% weight

      // Strategic positioning (existing table might be in a good central location)
      const strategicScore = nearestTable.distance < 5 ? 0.1 : 0; // 10% weight if very close

      score =
        distanceScore + resourceScore + timeEfficiencyScore + strategicScore;

      // Decision threshold: use existing if score > 0.5, craft new if <= 0.5
      const useExisting = score > 0.5 || !craftingAnalysis.canCraft;

      reasoning =
        `Distance: ${nearestTable.distance}b (${distanceScore.toFixed(2)}), ` +
        `Resources: ${craftingAnalysis.resourceEfficiency.toFixed(2)} (${resourceScore.toFixed(2)}), ` +
        `Time efficiency: ${timeEfficiencyScore.toFixed(2)}, ` +
        `Strategic: ${strategicScore.toFixed(2)}`;

      console.log(
        `📊 Table evaluation: ${reasoning} | Total: ${score.toFixed(2)}`
      );

      return {
        useExisting,
        score: Math.round(score * 100) / 100,
        reasoning,
      };
    } catch (error) {
      console.error('Error evaluating table location:', error);
      return {
        useExisting: true, // Default to using existing table on error
        score: 0,
        reasoning: 'Error in evaluation',
      };
    }
  }

  /**
   * Assess if gathering wood is feasible in current area
   */
  private async assessGatheringFeasibility(): Promise<boolean> {
    try {
      // Check for nearby trees or wood sources
      const nearbyBlocksResponse = await this.minecraftRequest(
        '/nearby-blocks',
        { timeout: 3000 }
      );

      if (!nearbyBlocksResponse.ok) {
        console.warn('Could not assess gathering feasibility');
        return true; // Assume feasible if we can't check
      }

      const nearbyBlocks = (await nearbyBlocksResponse.json()) as any;

      if (nearbyBlocks.data && Array.isArray(nearbyBlocks.data)) {
        const treeBlocks = nearbyBlocks.data.filter(
          (block: any) =>
            block.type?.toLowerCase().includes('log') ||
            block.type?.toLowerCase().includes('leaves') ||
            block.type?.toLowerCase().includes('wood')
        );

        const feasible = treeBlocks.length > 5; // Need reasonable number of tree blocks
        console.log(
          `🌳 Gathering feasibility: ${treeBlocks.length} tree blocks found - ${feasible ? 'feasible' : 'difficult'}`
        );
        return feasible;
      }

      return true; // Default to feasible
    } catch (error) {
      console.warn('Error assessing gathering feasibility:', error);
      return true; // Default to feasible
    }
  }

  /**
   * Scan for nearby crafting tables in the world
   */
  private async scanForNearbyCraftingTables(): Promise<
    Array<{ position: any; distance: number }>
  > {
    try {
      // Get current bot position from world state
      const worldStateResponse = await this.minecraftRequest('/state', {
        timeout: 3000,
      });

      if (!worldStateResponse.ok) {
        console.warn('Could not get world state for crafting table scanning');
        return [];
      }

      const worldData = (await worldStateResponse.json()) as any;
      const botPosition = worldData.data?.position;

      if (!botPosition) {
        console.warn('No bot position available for crafting table scanning');
        return [];
      }

      // Query nearby blocks to find crafting tables
      const nearbyBlocksResponse = await this.minecraftRequest(
        '/nearby-blocks',
        { timeout: 3000 }
      );

      if (!nearbyBlocksResponse.ok) {
        console.warn('Could not get nearby blocks for crafting table scanning');
        return [];
      }

      const nearbyBlocks = (await nearbyBlocksResponse.json()) as any;
      const craftingTables: Array<{ position: any; distance: number }> = [];

      // Check nearby blocks for crafting tables
      if (nearbyBlocks.data && Array.isArray(nearbyBlocks.data)) {
        nearbyBlocks.data.forEach((block: any) => {
          if (block.type?.toLowerCase().includes('crafting_table')) {
            const distance = Math.sqrt(
              Math.pow(block.position.x - botPosition.x, 2) +
                Math.pow(block.position.y - botPosition.y, 2) +
                Math.pow(block.position.z - botPosition.z, 2)
            );

            // Only include crafting tables within reasonable distance (e.g., 10 blocks)
            if (distance <= 10) {
              craftingTables.push({
                position: block.position,
                distance: Math.round(distance * 100) / 100,
              });
            }
          }
        });
      }

      console.log(`🔍 Found ${craftingTables.length} nearby crafting tables`);
      return craftingTables;
    } catch (error) {
      console.error('Error scanning for nearby crafting tables:', error);
      return [];
    }
  }
}
