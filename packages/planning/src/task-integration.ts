/**
 * Task Integration System
 *
 * Orchestrates task store, Sterling planner, and thought-to-task conversion.
 * Provides dashboard connectivity and real-time task progress.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { createServiceClients } from '@conscious-bot/core';
import type { BaseDomainSolver } from './sterling/base-domain-solver';
import type { MinecraftBuildingSolver } from './sterling/minecraft-building-solver';
import { resolveRequirement } from './modules/requirements';
import { CognitionOutbox } from './modules/cognition-outbox';
import { ORE_DROP_MAP } from './sterling/minecraft-tool-progression-types';
import {
  CognitiveStreamClient,
  type CognitiveStreamThought,
} from './modules/cognitive-stream-client';
import type { ITaskIntegration } from './interfaces/task-integration';
import type {
  Task,
  TaskProgress,
  TaskStatistics,
  TaskIntegrationConfig,
  ActionVerification,
  StepSnapshot,
} from './types/task';
import {
  DEFAULT_TASK_INTEGRATION_CONFIG,
  type VerificationStatus,
} from './types/task';
import { TaskStore } from './task-integration/task-store';
import { SterlingPlanner } from './task-integration/sterling-planner';
import { convertThoughtToTask } from './task-integration/thought-to-task-converter';

export type { TaskStep } from './types/task-step';
import type { TaskStep } from './types/task-step';

export type {
  Task,
  TaskProgress,
  TaskStatistics,
  TaskIntegrationConfig,
  ActionVerification,
  StepSnapshot,
  VerificationStatus,
} from './types/task';
export { DEFAULT_TASK_INTEGRATION_CONFIG };

const DEFAULT_CONFIG = DEFAULT_TASK_INTEGRATION_CONFIG;

/**
 * Task integration system for dashboard connectivity
 * @author @darianrosebrook
 */
export class TaskIntegration extends EventEmitter implements ITaskIntegration {
  private config: TaskIntegrationConfig;
  private readonly taskStore: TaskStore;
  private readonly sterlingPlanner: SterlingPlanner;
  private actionVerifications: Map<string, ActionVerification> = new Map();
  private cognitiveStreamClient: CognitiveStreamClient;
  private thoughtPollingInterval?: NodeJS.Timeout;
  private minecraftClient: ReturnType<typeof createServiceClients>['minecraft'];

  private thoughtPollInFlight = false;
  private seenThoughtIds = new Set<string>();

  private cognitionOutbox = new CognitionOutbox();

  get outbox(): CognitionOutbox {
    return this.cognitionOutbox;
  }

  getMcDataPublic(): any {
    return this.sterlingPlanner.getMcData();
  }

  private getMcData(): any {
    return this.sterlingPlanner.getMcData();
  }

  private async fetchBotContext(): Promise<{
    inventory: any[];
    nearbyBlocks: any[];
  }> {
    return this.sterlingPlanner.fetchBotContext();
  }

  private get buildingSolver(): MinecraftBuildingSolver | undefined {
    return this.sterlingPlanner.getSolver<MinecraftBuildingSolver>(
      'minecraft.building'
    );
  }

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

  private trimSeenThoughtIds(): void {
    if (this.seenThoughtIds.size <= 500) return;
    const iter = this.seenThoughtIds.values();
    for (let i = 0; i < 100; i++) iter.next();
    const remaining = new Set<string>();
    for (const id of iter) remaining.add(id);
    this.seenThoughtIds = remaining;
  }

  private async processActionableThoughts(): Promise<void> {
    if (this.thoughtPollInFlight) return;
    this.thoughtPollInFlight = true;

    try {
      const actionableThoughts =
        await this.cognitiveStreamClient.getActionableThoughts();

      for (const thought of actionableThoughts) {
        try {
          const task = await convertThoughtToTask(thought, {
            addTask: this.addTask.bind(this),
            markThoughtAsProcessed: this.markThoughtAsProcessed.bind(this),
            seenThoughtIds: this.seenThoughtIds,
            trimSeenThoughtIds: () => this.trimSeenThoughtIds(),
          });
          if (task) {
            this.emit('thoughtConvertedToTask', { thought, task });
          }
        } catch (error) {
          console.error('Error converting thought to task:', error);
        }
      }
    } catch (error) {
      console.error('Error processing actionable thoughts:', error);
    } finally {
      this.thoughtPollInFlight = false;
    }
  }

  /**
   * Mark a thought as processed via cognition service ack endpoint
   */
  private async markThoughtAsProcessed(thoughtId: string): Promise<void> {
    this.cognitionOutbox.enqueue(
      'http://localhost:3003/api/cognitive-stream/ack',
      { thoughtIds: [thoughtId] }
    );
  }


  /**
   * Update task status
   */
  async updateTaskStatus(taskId: string, status: string): Promise<void> {
    const task = this.taskStore.getTask(taskId);
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
   * Normalize priority/urgency from string (e.g. intrusive: low/medium/high) or number to 0..1
   */
  private normalizePriorityOrUrgency(
    value: string | number | undefined,
    defaultVal: number
  ): number {
    if (value === undefined || value === null) return defaultVal;
    if (typeof value === 'number') return Math.max(0, Math.min(1, value));
    const s = String(value).toLowerCase();
    if (s === 'high') return 0.8;
    if (s === 'medium' || s === 'med') return 0.5;
    if (s === 'low') return 0.3;
    return defaultVal;
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
    const activeTasks = this.taskStore.getAllTasks().filter(
      (task) => task.status === 'pending' || task.status === 'active'
    );
    return activeTasks.length;
  }

  /**
   * Get actionable thoughts (for testing)
   */
  async getActionableThoughts(): Promise<CognitiveStreamThought[]> {
    return await this.cognitiveStreamClient.getActionableThoughts();
  }

  // Ephemeral per-step snapshot to compare before/after state (key: `${taskId}-${stepId}`)
  private _stepStartSnapshots: Map<string, StepSnapshot> = new Map();

  private canonicalItemId(raw: unknown): string {
    return String(raw ?? '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_');
  }

  private buildInventoryIndex(inventory: any[]): Record<string, number> {
    const idx: Record<string, number> = {};
    const raw = Array.isArray(inventory)
      ? inventory
      : (inventory as any)?.items ?? [];
    for (const it of raw) {
      let name = this.canonicalItemId(it?.name ?? it?.type);
      if (!name) continue;
      // Minecraft API may return "minecraft:coal"; normalize so verification matches
      if (name.startsWith('minecraft:')) name = name.slice('minecraft:'.length);
      idx[name] = (idx[name] || 0) + (it?.count || 0);
    }
    return idx;
  }

  /**
   * Update the current (first incomplete) step label to include a leaf and its parameters
   */
  annotateCurrentStepWithLeaf(
    taskId: string,
    leafName: string,
    args: Record<string, any> = {}
  ): boolean {
    const task = this.taskStore.getTask(taskId);
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
    const task = this.taskStore.getTask(taskId);
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

  constructor(config: Partial<TaskIntegrationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    const serviceClients = createServiceClients();
    this.minecraftClient = serviceClients.minecraft;
    this.taskStore = new TaskStore();
    this.sterlingPlanner = new SterlingPlanner({
      minecraftGet: (path, opts) =>
        this.minecraftClient.get(path, { timeout: opts?.timeout ?? 5000 }),
    });

    this.cognitiveStreamClient = new CognitiveStreamClient();
    this.cognitionOutbox.start();
    this.startThoughtToTaskConversion();

    if (this.config.enableProgressTracking) {
      this.startProgressTracking();
    }
  }

  registerSolver(solver: BaseDomainSolver): void {
    this.sterlingPlanner.registerSolver(solver);
  }

  getSolver<T extends BaseDomainSolver>(solverId: string): T | undefined {
    return this.sterlingPlanner.getSolver<T>(solverId);
  }

  async addTask(taskData: Partial<Task>): Promise<Task> {
    const existingTask = this.taskStore.findSimilarTask(taskData);
    if (existingTask) return existingTask;

    const steps = await this.sterlingPlanner.generateDynamicSteps(taskData);

    // Resolve requirements for the task
    const requirement = resolveRequirement(taskData);

    // Normalize priority/urgency from string (e.g. intrusive thought: low/medium/high) to 0..1
    const priority = this.normalizePriorityOrUrgency(taskData.priority, 0.5);
    const urgency = this.normalizePriorityOrUrgency(taskData.urgency, 0.5);

    const task: Task = {
      id:
        taskData.id ||
        `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: taskData.title || 'Untitled Task',
      description: taskData.description || '',
      type: taskData.type || 'general',
      priority,
      urgency,
      progress: 0,
      status: 'pending',
      source: taskData.source || 'manual',
      steps:
        taskData.steps && taskData.steps.length > 0 ? taskData.steps : steps,
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

    this.taskStore.setTask(task);
    this.taskStore.updateStatistics();
    this.emit('taskAdded', task);

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[Planning] Task added: id=${task.id} title="${task.title.slice(0, 50)}" source=${task.source} priority=${task.priority}`
      );
    }

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskAdded', task);
    }

    return task;
  }

  updateTaskMetadata(
    taskId: string,
    metadata: Partial<Task['metadata']>
  ): boolean {
    const task = this.taskStore.getTask(taskId);
    if (!task) {
      return false;
    }

    task.metadata = { ...task.metadata, ...metadata, updatedAt: Date.now() };
    this.taskStore.setTask(task);
    this.taskStore.updateStatistics();
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
    const task = this.taskStore.getTask(taskId);
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

    const currentStep = task.steps.findIndex((step) => !step.done);
    const completedSteps = task.steps.filter((step) => step.done).length;

    this.taskStore.setTask(task);
    this.taskStore.setProgress(taskId, {
      taskId,
      progress: task.progress,
      currentStep: currentStep >= 0 ? currentStep : task.steps.length,
      completedSteps,
      totalSteps: task.steps.length,
      status: task.status,
      timestamp: Date.now(),
    });

    this.taskStore.updateStatistics();
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
    const task = this.taskStore.getTask(taskId);
    if (!task) {
      return false;
    }

    const step = task.steps.find((s) => s.id === stepId);
    if (!step) {
      return false;
    }

    // Verify action was actually performed if verification is enabled
    if (this.config.enableActionVerification) {
      // Allow game state (e.g. inventory) to settle after dig/collect before verification
      const { effectiveLeaf } = this.deriveLeafAndArgs(step);
      const isDigOrCollect =
        effectiveLeaf === 'dig_block' || effectiveLeaf === 'acquire_material';
      if (isDigOrCollect) {
        await new Promise((r) => setTimeout(r, 1500));
      }
      const verification = await this.verifyActionCompletion(
        taskId,
        stepId,
        step
      );
      if (verification.status === 'failed') {
        console.warn(
          `⚠️ Step verification failed [${verification.status}]: ${step.label}`,
          verification.actualResult
        );
        return false;
      }
      // 'verified' and 'skipped' both allow progression
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
      // Final inventory gate: if the task has a structured requirement with an
      // expected output item/quantity, verify the bot actually has it before
      // marking the task completed. Uses requirement metadata — no label parsing.
      const req = task.metadata?.requirement as
        | { item?: string; outputPattern?: string; quantity?: number }
        | undefined;
      const expectedItem = req?.item ?? req?.outputPattern;
      if (expectedItem) {
        try {
          const response = await this.minecraftRequest('/inventory', { timeout: 5000 });
          if (response.ok) {
            const data = (await response.json()) as any;
            const raw = data?.data;
            const inventory: any[] = Array.isArray(raw) ? raw : raw?.items ?? [];
            const target = expectedItem.toLowerCase();
            const expectedQty = req?.quantity ?? 1;

            const matchingItems = inventory.filter((it: any) => {
              const name = (it.type ?? it.name ?? '').toString().toLowerCase();
              return name.includes(target);
            });
            const totalQty = matchingItems.reduce(
              (sum: number, it: any) => sum + (it.count || 0),
              0
            );

            if (totalQty < expectedQty) {
              console.log(
                `⚠️ Task steps completed but inventory check failed: need ${expectedQty}x ${expectedItem}, found ${totalQty}`
              );
              // Don't mark as completed — let the autonomous executor handle it
              return true;
            }
          }
        } catch (error) {
          console.warn('Failed final inventory gate for task completion:', error);
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
   * Contract-based verification by leaf: uses meta.leaf + args (and optional meta.produces),
   * delta checks where applicable, and retries within timeout for eventual consistency.
   */
  private async verifyByLeaf(
    taskId: string,
    stepId: string,
    leaf: string,
    args: Record<string, any>,
    step: TaskStep
  ): Promise<boolean> {
    const timeout = this.config.actionVerificationTimeout ?? 10000;
    const leafId = leaf.toLowerCase().trim();

    const produces =
      (step.meta?.produces as Array<{
        name: string;
        count: number;
      }>) || [];
    const producedItem = produces[0]?.name;
    const producedCount = produces[0]?.count ?? 1;

    switch (leafId) {
      case 'move_to':
      case 'step_forward_safely':
      case 'follow_entity':
        return this.retryUntil(
          () => this.verifyMovement(taskId, stepId, 0.75),
          timeout
        );

      case 'dig_block': {
        const blockType = this.canonicalItemId(
          args.blockType ?? producedItem ?? 'oak_log'
        );
        const minDelta = Math.max(1, producedCount);
        // Pathfinding + break + pickup can take longer; use extended timeout
        const digTimeout = Math.max(timeout, 20000);
        return this.retryUntil(
          () => this.verifyInventoryDelta(taskId, stepId, blockType, minDelta),
          digTimeout
        );
      }

      case 'pickup_item':
        return this.retryUntil(
          () => this.verifyPickupFromInventoryDelta(taskId, stepId),
          timeout
        );

      case 'craft_recipe': {
        const recipe = this.canonicalItemId(
          args.recipe ?? producedItem ?? 'unknown'
        );
        const qty = Number(args.qty ?? producedCount ?? 1);
        return this.retryUntil(
          () =>
            this.verifyInventoryDelta(taskId, stepId, recipe, Math.max(1, qty)),
          timeout
        );
      }

      case 'smelt': {
        const out = this.canonicalItemId(producedItem ?? '');
        if (!out)
          return this.retryUntil(() => this.verifySmeltedItem(), timeout);
        return this.retryUntil(
          () =>
            this.verifyInventoryDelta(
              taskId,
              stepId,
              out,
              Math.max(1, producedCount)
            ),
          timeout
        );
      }

      case 'place_block': {
        const item = this.canonicalItemId(
          args.item ?? args.blockType ?? 'crafting_table'
        );
        return this.retryUntil(() => this.verifyNearbyBlock(item), timeout);
      }

      case 'place_torch_if_needed':
        return this.retryUntil(() => this.verifyNearbyBlock('torch'), timeout);

      case 'retreat_and_block': {
        const moved = await this.verifyMovement(taskId, stepId, 0.75);
        const placed = await this.verifyNearbyBlock();
        return moved || placed;
      }

      case 'consume_food':
        return this.retryUntil(
          () => this.verifyConsumeFood(taskId, stepId),
          timeout
        );

      case 'sense_hostiles':
      case 'get_light_level':
      case 'wait':
      case 'look_at':
      case 'turn_left':
      case 'turn_right':
      case 'jump':
      case 'chat':
        return true;

      case 'introspect_recipe':
      case 'prepare_site':
      case 'place_feature':
      case 'build_module':
      case 'replan_building':
        return true;

      case 'acquire_material': {
        const item = this.canonicalItemId(
          args.item ?? args.blockType ?? producedItem ?? 'unknown'
        );
        const acquireTimeout = Math.max(timeout, 20000);
        return this.retryUntil(
          () => this.verifyInventoryDelta(taskId, stepId, item, 1),
          acquireTimeout
        );
      }

      default:
        return false;
    }
  }

  /**
   * Verify that an action was actually completed using contract-based verification.
   *
   * Routing priority:
   *  1. step.meta.leaf   → verifyByLeaf (structured contract)
   *  2. label-derived leaf → extract leaf+args from label, route through verifyByLeaf
   *  3. non-executable    → skip (does not block progression)
   *
   * No label string-matching for verification logic — all paths converge on verifyByLeaf.
   */
  private async verifyActionCompletion(
    taskId: string,
    stepId: string,
    step: TaskStep
  ): Promise<ActionVerification> {
    const leaf = step.meta?.leaf as string | undefined;
    const verification: ActionVerification = {
      taskId,
      stepId,
      actionType: String(leaf ?? step.label ?? '').toLowerCase(),
      expectedResult: this.getExpectedResultForStep(step),
      verified: false,
      status: 'failed',
      timestamp: Date.now(),
    };

    const setResult = (
      status: VerificationStatus,
      actualResult?: any
    ): ActionVerification => {
      verification.status = status;
      verification.verified = status === 'verified' || status === 'skipped';
      if (actualResult !== undefined) verification.actualResult = actualResult;
      this.actionVerifications.set(`${taskId}-${stepId}`, verification);
      return verification;
    };

    try {
      if (!(await this.isBotConnected())) {
        return setResult('failed', { error: 'Bot not connected' });
      }

      // Derive the effective leaf and args for this step, regardless of source.
      const { effectiveLeaf, effectiveArgs } = this.deriveLeafAndArgs(step);

      // Non-executable steps that have no leaf should not block progression.
      if (!effectiveLeaf && step.meta?.executable !== true) {
        return setResult('skipped', { reason: 'non-executable step' });
      }

      if (effectiveLeaf) {
        const passed = await this.verifyByLeaf(
          taskId,
          stepId,
          effectiveLeaf,
          effectiveArgs,
          step
        );
        return setResult(
          passed ? 'verified' : 'failed',
          passed ? undefined : { error: 'Leaf verification failed', leaf: effectiveLeaf }
        );
      }

      // No leaf could be derived and step claims to be executable — fail explicitly.
      return setResult('failed', {
        error: 'No leaf derivable for executable step',
        label: step.label,
      });
    } catch (error) {
      return setResult('failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Derive an effective leaf name and args from a step, using structured metadata
   * first, then falling back to label parsing when necessary.
   *
   * This is the single place where labels are parsed — verification itself never
   * inspects labels.
   */
  private deriveLeafAndArgs(
    step: TaskStep
  ): { effectiveLeaf: string | undefined; effectiveArgs: Record<string, any> } {
    // 1. Structured metadata — preferred path
    const metaLeaf = step.meta?.leaf as string | undefined;
    if (metaLeaf) {
      return {
        effectiveLeaf: metaLeaf,
        effectiveArgs: (step.meta?.args as Record<string, any>) ?? {},
      };
    }

    const label = step.label.toLowerCase();

    // 2. "Leaf: minecraft.<name> (key=val, ...)" annotation from annotateCurrentStepWithLeaf
    if (label.startsWith('leaf: minecraft.')) {
      const afterPrefix = step.label.slice('Leaf: minecraft.'.length).trim();
      const parenIdx = afterPrefix.indexOf('(');
      const leafName = parenIdx >= 0 ? afterPrefix.slice(0, parenIdx).trim() : afterPrefix.trim();
      const args: Record<string, any> = {};
      if (parenIdx >= 0) {
        const paramStr = afterPrefix.slice(parenIdx + 1, afterPrefix.lastIndexOf(')'));
        for (const part of paramStr.split(',')) {
          const [k, ...rest] = part.split('=');
          if (k?.trim()) args[k.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
        }
      }
      return { effectiveLeaf: leafName.toLowerCase(), effectiveArgs: args };
    }

    // 3. "Collect X (n/m)" / "Mine X (n/m)" / "Gather X (n/m)" macro labels
    const collectMatch = label.match(
      /^(?:collect|mine|gather)\s+(.+?)\s*\(\d+\/\d+\)$/
    );
    if (collectMatch) {
      const item = collectMatch[1].trim() || 'oak_log';
      return {
        effectiveLeaf: 'dig_block',
        effectiveArgs: { blockType: item },
      };
    }

    // 4. Well-known legacy labels → synthetic leaf mappings
    const LEGACY_LABEL_MAP: Record<string, { leaf: string; args?: Record<string, any> }> = {
      'locate nearby wood':       { leaf: 'sense_hostiles' },  // observational — auto-pass
      'locate nearby resources':  { leaf: 'sense_hostiles' },
      'move to resource location': { leaf: 'move_to' },
      'move to location':         { leaf: 'move_to' },
      'collect wood safely':      { leaf: 'dig_block', args: { blockType: 'oak_log' } },
      'collect resources safely': { leaf: 'dig_block', args: { blockType: 'oak_log' } },
      'store collected items':    { leaf: 'wait' },  // no-op — items are already in inventory
      'check required materials': { leaf: 'wait' },  // observational
      'gather missing materials': { leaf: 'dig_block', args: { blockType: 'oak_log' } },
      'access crafting interface': { leaf: 'place_block', args: { item: 'crafting_table' } },
      'create the item':          { leaf: 'craft_recipe' },
    };

    const mapped = LEGACY_LABEL_MAP[label];
    if (mapped) {
      return {
        effectiveLeaf: mapped.leaf,
        effectiveArgs: mapped.args ?? {},
      };
    }

    // 5. No derivation possible
    return { effectiveLeaf: undefined, effectiveArgs: {} };
  }

  /**
   * Get expected result for a step
   */
  private getExpectedResultForStep(step: TaskStep): any {
    const { effectiveLeaf, effectiveArgs } = this.deriveLeafAndArgs(step);
    if (!effectiveLeaf) return { completed: true };

    switch (effectiveLeaf) {
      case 'move_to':
      case 'step_forward_safely':
      case 'follow_entity':
        return { moved: true, distance: '>0' };
      case 'dig_block':
      case 'acquire_material':
        return { collected: true, item: effectiveArgs.blockType ?? effectiveArgs.item };
      case 'craft_recipe':
        return { crafted: true, recipe: effectiveArgs.recipe };
      case 'place_block':
        return { placed: true, item: effectiveArgs.item ?? effectiveArgs.blockType };
      case 'consume_food':
        return { consumed: true, foodDelta: '>0' };
      case 'smelt':
        return { smelted: true };
      default:
        return { completed: true };
    }
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
   * Verify movement using step baseline (taskId-stepId). Does not delete snapshot.
   */
  private async verifyMovement(
    taskId: string,
    stepId: string,
    minDist = 0.75
  ): Promise<boolean> {
    try {
      const start = this._stepStartSnapshots.get(`${taskId}-${stepId}`) as
        | StepSnapshot
        | undefined;

      const response = await this.minecraftRequest('/health', {
        timeout: 5000,
      });
      if (!response.ok) return false;

      const data = (await response.json()) as any;
      const p = data?.botStatus?.position;
      if (
        !p ||
        typeof p.x !== 'number' ||
        typeof p.y !== 'number' ||
        typeof p.z !== 'number'
      )
        return false;

      if (start?.position) {
        const dx = p.x - start.position.x;
        const dy = p.y - start.position.y;
        const dz = p.z - start.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return dist >= minDist;
      }

      // Fallback: weak signal from velocity
      const vel = data?.botStatus?.velocity;
      return !!(vel && Math.abs(vel.x) + Math.abs(vel.y) + Math.abs(vel.z) > 0);
    } catch {
      return false;
    }
  }

  /**
   * Retry a predicate until it returns true or timeout. Handles eventual consistency.
   */
  private async retryUntil(
    fn: () => Promise<boolean>,
    timeoutMs: number,
    intervalMs = 400
  ): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await fn()) return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  }

  /**
   * Verify inventory increased by at least minDelta for itemId since step start (delta-based).
   * For block types that drop different items (e.g. coal_ore -> coal), sums counts across
   * all accepted names so mining verification matches the actual inventory item.
   */
  private async verifyInventoryDelta(
    taskId: string,
    stepId: string,
    itemId: string,
    minDelta = 1
  ): Promise<boolean> {
    try {
      const start = this._stepStartSnapshots.get(`${taskId}-${stepId}`) as
        | StepSnapshot
        | undefined;

      const res = await this.minecraftRequest('/inventory', { timeout: 4000 });
      if (!res.ok) return false;

      const data = (await res.json()) as any;
      const raw = data?.data;
      const inventory = Array.isArray(raw) ? raw : raw?.items ?? [];
      const afterIdx = this.buildInventoryIndex(inventory);

      const acceptedNames = this.getInventoryNamesForVerification(itemId);
      const before = acceptedNames.reduce(
        (sum, name) => sum + (start?.inventoryByName?.[name] ?? 0),
        0
      );
      const after = acceptedNames.reduce(
        (sum, name) => sum + (afterIdx[name] ?? 0),
        0
      );

      return after - before >= minDelta;
    } catch {
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
      const raw = data?.data;
      const inventory = Array.isArray(raw) ? raw : raw?.items ?? [];
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
   * Resolve block type (e.g. coal_ore) to inventory item name(s) for verification.
   * Mining coal_ore yields coal; verification must accept the drop item, not the block name.
   * Wood-type blocks (oak_log, etc.) also accept "log" so APIs that return generic "log" match.
   */
  private getInventoryNamesForVerification(resourceType: string): string[] {
    const lower = resourceType.toLowerCase();
    const names = [lower];
    const drop = ORE_DROP_MAP[lower as keyof typeof ORE_DROP_MAP];
    if (drop) {
      names.push(drop.item.toLowerCase());
    }
    if (lower.includes('log') || lower === 'wood') {
      if (!names.includes('log')) names.push('log');
      if (!names.includes('wood')) names.push('wood');
    }
    return names;
  }

  /**
   * Start a task step and capture a before-snapshot for verification.
   * Awaits snapshot capture so verifyInventoryDelta has a baseline when the step completes.
   */
  async startTaskStep(taskId: string, stepId: string): Promise<boolean> {
    const task = this.taskStore.getTask(taskId);
    if (!task) {
      return false;
    }

    const step = task.steps.find((s) => s.id === stepId);
    if (!step) {
      return false;
    }

    step.startedAt = Date.now();

    // Capture bot snapshot at step start for verification (key: taskId-stepId).
    // Await so verification has a baseline when completeTaskStep runs.
    const key = `${taskId}-${stepId}`;
    try {
      const [healthRes, invRes] = await Promise.all([
        this.minecraftRequest('/health', { timeout: 3000 }),
        this.minecraftRequest('/inventory', { timeout: 3000 }),
      ]);

      const snap: StepSnapshot = { ts: Date.now() };
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
        const raw = invData?.data;
        const inventory = Array.isArray(raw) ? raw : raw?.items ?? [];
        snap.inventoryTotal = inventory.reduce(
          (s: number, it: any) => s + (it?.count || 0),
          0
        );
        snap.inventoryByName = this.buildInventoryIndex(inventory);
      }
      this._stepStartSnapshots.set(key, snap);
    } catch {
      // Snapshot creation failed; verification may use before=0 (no baseline)
    }

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
    return this.taskStore.getAllTasks()
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
    const task = this.taskStore.getTask(taskId);
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
    let tasks = this.taskStore.getAllTasks();

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
    return this.taskStore.getStatistics();
  }

  /**
   * Get task progress for a specific task
   */
  getTaskProgress(taskId: string): TaskProgress | null {
    return this.taskStore.getTaskProgress(taskId);
  }

  /**
   * Get all task progress
   */
  getAllTaskProgress(): TaskProgress[] {
    return this.taskStore.getAllTaskProgress();
  }

  private reportBuildingEpisode(task: Task, success: boolean): void {
    if (!this.buildingSolver) return;
    const templateId = (task.metadata as any)?.buildingTemplateId;
    if (!templateId) return;

    const planId = (task.metadata as any)?.buildingPlanId;

    // Prefer structured step.meta for module IDs; fall back to label parsing
    const completedModuleIds = task.steps
      .filter(
        (s) =>
          s.done &&
          ((s.meta?.domain === 'building' && s.meta?.moduleId) ||
            s.label.includes('build_module'))
      )
      .map(
        (s) =>
          (s.meta?.moduleId as string) ||
          this.getLeafParamFromLabel(s.label, 'module')
      )
      .filter(Boolean) as string[];

    const failedStep = task.steps.find(
      (s) =>
        !s.done &&
        ((s.meta?.domain === 'building' && s.meta?.moduleId) ||
          s.label.includes('minecraft.'))
    );
    const failedModuleId = failedStep
      ? (failedStep.meta?.moduleId as string) ||
        this.getLeafParamFromLabel(failedStep.label, 'module')
      : undefined;

    // P0: all episodes are stub — server can distinguish via isStub + executionMode digest
    this.buildingSolver.reportEpisodeResult(
      templateId,
      success,
      completedModuleIds,
      failedModuleId || undefined,
      success ? undefined : 'execution_failure',
      planId,
      true // isStub — P0 leaves don't mutate world/inventory
    );

    console.log(
      `[Building] Episode reported: planId=${planId}, success=${success}, modules=${completedModuleIds.length}`
    );
  }

  async regenerateSteps(
    taskId: string,
    failureContext?: {
      failedLeaf: string;
      reasonClass: string;
      attemptCount: number;
    }
  ): Promise<{ success: boolean; stepsDigest?: string }> {
    const task = this.taskStore.getTask(taskId);
    if (!task) return { success: false };

    let botCtx: { inventory: any[]; nearbyBlocks: string[] };
    try {
      botCtx = await this.sterlingPlanner.fetchBotContext();
    } catch {
      return { success: false };
    }

    const updatedTask: Partial<Task> = {
      ...task,
      metadata: {
        ...task.metadata,
        currentState: {
          inventory: botCtx.inventory,
          nearbyBlocks: botCtx.nearbyBlocks,
        },
        failureContext,
      } as any,
    };

    const newSteps =
      await this.sterlingPlanner.generateDynamicSteps(updatedTask);
    if (!newSteps || newSteps.length === 0) return { success: false };

    const { hashSteps } = await import('./sterling/solve-bundle');
    const digest = hashSteps(
      newSteps.map((s) => ({ action: s.label || s.id }))
    );

    const doneCount = task.steps.filter((s) => s.done).length;
    const updatedSteps = [
      ...task.steps.filter((s) => s.done),
      ...newSteps.map((s, i) => ({ ...s, order: doneCount + i + 1 })),
    ];
    task.steps = updatedSteps;
    this.taskStore.setTask(task);

    return { success: true, stepsDigest: digest };
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
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[Planning] Dashboard task-updates POST failed (${event}):`,
        msg
      );
    }
  }

  cleanupCompletedTasks(): void {
    this.taskStore.cleanupCompleted(this.config.maxTaskHistory);
  }

  /**
   * Get task history
   */
  getTaskHistory(limit: number = 50): Task[] {
    return this.taskStore.getTaskHistory(limit);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<TaskIntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): TaskIntegrationConfig {
    return { ...this.config };
  }

}
