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

export interface TaskStep {
  id: string;
  label: string;
  done: boolean;
  order: number;
  estimatedDuration?: number;
  actualDuration?: number;
  startedAt?: number;
  completedAt?: number;
}

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

// Requirement resolution functions
function parseRequiredQuantityFromTitle(
  title: string | undefined,
  fallback: number
): number {
  if (!title) return fallback;
  const m = String(title).match(/(\d{1,3})/);
  return m ? Math.max(1, parseInt(m[1], 10)) : fallback;
}

function resolveRequirement(task: any): any {
  const ttl = (task.title || '').toLowerCase();
  // Prefer explicit crafting intent first
  if (task.type === 'crafting' && /pickaxe/.test(ttl)) {
    return {
      kind: 'craft',
      outputPattern: 'wooden_pickaxe',
      quantity: 1,
      proxyPatterns: [
        'oak_log',
        'birch_log',
        'spruce_log',
        'jungle_log',
        'acacia_log',
        'dark_oak_log',
        'plank',
        'stick',
      ],
    };
  }
  // Gathering/mining rules next
  if (task.type === 'gathering' || /\bgather\b|\bcollect\b/.test(ttl)) {
    const qty = parseRequiredQuantityFromTitle(task.title, 8);
    return {
      kind: 'collect',
      patterns: [
        'oak_log',
        'birch_log',
        'spruce_log',
        'jungle_log',
        'acacia_log',
        'dark_oak_log',
      ],
      quantity: qty,
    };
  }
  if (task.type === 'mining' || /\bmine\b|\biron\b/.test(ttl)) {
    const qty = parseRequiredQuantityFromTitle(task.title, 3);
    return { kind: 'mine', patterns: ['iron_ore'], quantity: qty };
  }
  // Titles that explicitly mention wood but aren't crafting
  if (/\bwood\b/.test(ttl)) {
    const qty = parseRequiredQuantityFromTitle(task.title, 8);
    return {
      kind: 'collect',
      patterns: [
        'oak_log',
        'birch_log',
        'spruce_log',
        'jungle_log',
        'acacia_log',
        'dark_oak_log',
      ],
      quantity: qty,
    };
  }
  return null;
}

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

  /**
   * Update task status
   */
  async updateTaskStatus(taskId: string, status: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status as any;
      console.log(`Updated task ${taskId} status to ${status}`);
    }
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

    if (this.config.enableProgressTracking) {
      this.startProgressTracking();
    }
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
      steps: taskData.steps || steps,
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

    // Check for exact title matches
    for (const task of this.tasks.values()) {
      if (task.title.toLowerCase() === title && task.status === 'pending') {
        return task;
      }
    }

    // Check for similar tasks of the same type and source
    for (const task of this.tasks.values()) {
      if (
        task.type.toLowerCase() === type &&
        task.source === source &&
        task.status === 'pending'
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
          const response = await fetch('http://localhost:3005/inventory', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000),
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
          const response = await fetch('http://localhost:3005/inventory', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000),
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
      const response = await fetch('http://localhost:3005/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
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
      const response = await fetch('http://localhost:3005/inventory', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
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
      const response = await fetch('http://localhost:3005/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
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
      const res = await fetch('http://localhost:3005/inventory', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(4000),
      });
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
      const res = await fetch('http://localhost:3005/state', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
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
      const res = await fetch('http://localhost:3005/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(4000),
      });
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
      const res = await fetch('http://localhost:3005/state', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(4000),
      });
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
      const res = await fetch('http://localhost:3005/inventory', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
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
      const response = await fetch('http://localhost:3005/inventory', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
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
      const response = await fetch('http://localhost:3005/inventory', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
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
      const response = await fetch('http://localhost:3005/inventory', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
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
      const response = await fetch('http://localhost:3005/inventory', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
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
      const response = await fetch('http://localhost:3005/inventory', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
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
          fetch('http://localhost:3005/health', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(3000),
          }),
          fetch('http://localhost:3005/inventory', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(3000),
          }),
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
  private async generateDynamicSteps(
    taskData: Partial<Task>
  ): Promise<TaskStep[]> {
    try {
      // Try to get steps from cognitive system first
      const steps = await this.generateStepsFromCognitive(taskData);
      if (steps && steps.length > 0) {
        return steps;
      }
    } catch (error) {
      console.warn(
        'Failed to generate steps from cognitive system, using fallback:',
        error
      );
    }

    // Fallback to intelligent step generation based on task type
    return this.generateIntelligentSteps(taskData);
  }

  /**
   * Generate steps from cognitive system
   */
  private async generateStepsFromCognitive(
    taskData: Partial<Task>
  ): Promise<TaskStep[]> {
    try {
      const response = await fetch('http://localhost:3003/generate-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: {
            title: taskData.title,
            type: taskData.type,
            description: taskData.description,
            priority: taskData.priority,
            category: taskData.metadata?.category,
          },
          context: {
            currentState: (taskData.metadata as any)?.currentState,
            environment: (taskData.metadata as any)?.environment,
          },
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Cognitive system responded with ${response.status}`);
      }

      const data = (await response.json()) as any;
      if (data.steps && Array.isArray(data.steps)) {
        return data.steps.map((step: any, index: number) => ({
          id: `step-${Date.now()}-${index + 1}`,
          label: step.label,
          done: false,
          order: index + 1,
          estimatedDuration: step.estimatedDuration || 3000,
        }));
      }
    } catch (error) {
      // Failed to generate steps from cognitive system: ${error}
    }

    return [];
  }

  /**
   * Generate intelligent steps based on task type and content
   */
  private generateIntelligentSteps(taskData: Partial<Task>): TaskStep[] {
    // Instead of hardcoded templates, generate minimal dynamic steps
    // This ensures the bot uses its own reasoning rather than predefined patterns
    const taskTitle = taskData.title || 'Unknown Task';

    // Create a single dynamic step that encourages the bot to think about the task
    const dynamicStep = {
      id: `step-${Date.now()}-1`,
      label: `Plan and execute: ${taskTitle}`,
      done: false,
      order: 1,
      estimatedDuration: 5000,
    };

    return [dynamicStep];
  }

  /**
   * Generate default steps for a task (fallback)
   */
  private generateDefaultSteps(taskData: Partial<Task>): TaskStep[] {
    return this.generateIntelligentSteps(taskData);
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
      const nearbyBlocksResponse = await fetch(
        'http://localhost:3005/nearby-blocks',
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(3000),
        }
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
      const worldStateResponse = await fetch('http://localhost:3005/state', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
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
      const nearbyBlocksResponse = await fetch(
        'http://localhost:3005/nearby-blocks',
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(3000),
        }
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
