/**
 * Task Timeframe Management - Bucket-based time management with trailers and explainable selection
 *
 * Implements bucket-based time management (Tactical, Short, Standard, Long, Expedition) with caps,
 * checkpoints, pause/resume tickets, and explainable bucket selection with decision traces.
 *
 * @author @darianrosebrook
 */

import { performance } from 'node:perf_hooks';

// ============================================================================
// Time Buckets (S5.1)
// ============================================================================

/**
 * Time bucket types with their respective caps and characteristics
 */
export type TimeBucket =
  | 'tactical'
  | 'short'
  | 'standard'
  | 'long'
  | 'expedition';

/**
 * Time bucket configuration
 */
export interface TimeBucketConfig {
  name: TimeBucket;
  maxDurationMs: number;
  checkpointIntervalMs: number;
  description: string;
  priority: number; // Higher number = higher priority
}

/**
 * Default time bucket configurations
 */
export const DEFAULT_TIME_BUCKETS: Record<TimeBucket, TimeBucketConfig> = {
  tactical: {
    name: 'tactical',
    maxDurationMs: 30000, // 30 seconds
    checkpointIntervalMs: 5000, // 5 seconds
    description: 'Quick tactical decisions and immediate responses',
    priority: 5,
  },
  short: {
    name: 'short',
    maxDurationMs: 300000, // 5 minutes
    checkpointIntervalMs: 30000, // 30 seconds
    description: 'Short-term planning and execution',
    priority: 4,
  },
  standard: {
    name: 'standard',
    maxDurationMs: 1800000, // 30 minutes
    checkpointIntervalMs: 120000, // 2 minutes
    description: 'Standard task execution and planning',
    priority: 3,
  },
  long: {
    name: 'long',
    maxDurationMs: 7200000, // 2 hours
    checkpointIntervalMs: 600000, // 10 minutes
    description: 'Long-term projects and complex operations',
    priority: 2,
  },
  expedition: {
    name: 'expedition',
    maxDurationMs: 86400000, // 24 hours
    checkpointIntervalMs: 3600000, // 1 hour
    description: 'Extended expeditions and major undertakings',
    priority: 1,
  },
};

// ============================================================================
// Resume Tickets and Trailers (S5.1)
// ============================================================================

/**
 * Resume ticket for safe pause/resume functionality
 */
export interface ResumeTicket {
  id: string;
  taskId: string;
  bucketName: TimeBucket;
  trailerOptionId?: string; // Option to execute when resuming
  checkpointData: any;
  createdAt: number;
  expiresAt: number;
  metadata?: Record<string, any>;
}

/**
 * Bucket trailer for safe pause/resume with option execution
 */
export interface BucketTrailer {
  taskId: string;
  bucketName: TimeBucket;
  trailerOptionId: string;
  checkpointData: any;
  resumeTicket: ResumeTicket;
}

// ============================================================================
// Explainable Bucket Selection (S5.2)
// ============================================================================

/**
 * Bucket selection trace for explainable decisions
 */
export interface BucketTrace {
  taskId: string;
  selectedBucket: TimeBucket;
  alternatives: TimeBucket[];
  reasoning: string[];
  constraints: {
    maxDuration?: number;
    requiredPriority?: number;
    availableBuckets?: TimeBucket[];
  };
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Bucket selection criteria
 */
export interface BucketSelectionCriteria {
  estimatedDurationMs: number;
  priority: number;
  complexity: number;
  resourceRequirements: string[];
  dependencies: string[];
  constraints?: {
    maxDuration?: number;
    requiredBucket?: TimeBucket;
    excludedBuckets?: TimeBucket[];
  };
}

// ============================================================================
// Task Execution State
// ============================================================================

/**
 * Task execution state within a bucket
 */
export interface TaskExecutionState {
  taskId: string;
  bucketName: TimeBucket;
  startTime: number;
  elapsedMs: number;
  checkpoints: {
    timestamp: number;
    data: any;
    description: string;
  }[];
  status: 'running' | 'paused' | 'completed' | 'failed' | 'timeout';
  trailerOptionId?: string;
  resumeTicket?: ResumeTicket;
  metadata?: Record<string, any>;
}

// ============================================================================
// Task Timeframe Manager
// ============================================================================

/**
 * Task timeframe manager with bucket-based time management
 */
export class TaskTimeframeManager {
  private bucketConfigs: Record<TimeBucket, TimeBucketConfig>;
  private activeTasks: Map<string, TaskExecutionState>;
  private resumeTickets: Map<string, ResumeTicket>;
  private bucketTraces: Map<string, BucketTrace[]>;
  private bucketTrailers: Map<string, BucketTrailer>;

  constructor(bucketConfigs?: Record<TimeBucket, TimeBucketConfig>) {
    this.bucketConfigs = bucketConfigs || DEFAULT_TIME_BUCKETS;
    this.activeTasks = new Map();
    this.resumeTickets = new Map();
    this.bucketTraces = new Map();
    this.bucketTrailers = new Map();
  }

  // ============================================================================
  // Bucket Selection (S5.2)
  // ============================================================================

  /**
   * Select appropriate time bucket for a task with explainable reasoning
   */
  selectBucket(
    taskId: string,
    criteria: BucketSelectionCriteria
  ): { bucket: TimeBucket; trace: BucketTrace } {
    const alternatives: TimeBucket[] = [];
    const reasoning: string[] = [];
    const constraints = criteria.constraints || {};

    // Start with all available buckets
    let availableBuckets: TimeBucket[] = Object.keys(
      this.bucketConfigs
    ) as TimeBucket[];

    // Apply constraints
    if (constraints.requiredBucket) {
      availableBuckets = [constraints.requiredBucket];
      reasoning.push(
        `Required bucket constraint: ${constraints.requiredBucket}`
      );
    }

    if (constraints.excludedBuckets) {
      availableBuckets = availableBuckets.filter(
        (bucket) => !constraints.excludedBuckets!.includes(bucket)
      );
      reasoning.push(
        `Excluded buckets: ${constraints.excludedBuckets.join(', ')}`
      );
    }

    // Filter by duration constraints
    const durationFiltered = availableBuckets.filter(
      (bucket) =>
        this.bucketConfigs[bucket].maxDurationMs >= criteria.estimatedDurationMs
    );

    if (durationFiltered.length === 0) {
      reasoning.push(
        `No buckets can accommodate estimated duration: ${criteria.estimatedDurationMs}ms`
      );
      // Select the longest available bucket as fallback
      const fallbackBucket = availableBuckets.reduce((a, b) =>
        this.bucketConfigs[a].maxDurationMs >
        this.bucketConfigs[b].maxDurationMs
          ? a
          : b
      );
      reasoning.push(`Using fallback bucket: ${fallbackBucket}`);
      availableBuckets = [fallbackBucket];
    } else {
      availableBuckets = durationFiltered;
      reasoning.push(
        `Duration-appropriate buckets: ${availableBuckets.join(', ')}`
      );
    }

    // Apply priority constraints
    const priorityFiltered = availableBuckets.filter(
      (bucket) => this.bucketConfigs[bucket].priority >= criteria.priority
    );

    if (priorityFiltered.length === 0) {
      reasoning.push(
        `No buckets meet priority requirement: ${criteria.priority}`
      );
      // Select highest priority available bucket as fallback
      const fallbackBucket = availableBuckets.reduce((a, b) =>
        this.bucketConfigs[a].priority > this.bucketConfigs[b].priority ? a : b
      );
      reasoning.push(`Using fallback bucket: ${fallbackBucket}`);
      availableBuckets = [fallbackBucket];
    } else {
      availableBuckets = priorityFiltered;
      reasoning.push(
        `Priority-appropriate buckets: ${availableBuckets.join(', ')}`
      );
    }

    // Select the most appropriate bucket based on complexity and resource requirements
    let selectedBucket: TimeBucket;
    if (availableBuckets.length === 1) {
      selectedBucket = availableBuckets[0];
      reasoning.push(`Single available bucket: ${selectedBucket}`);
    } else {
      // Score buckets based on complexity and resource requirements
      const bucketScores = availableBuckets.map((bucket) => {
        const config = this.bucketConfigs[bucket];
        let score = config.priority;

        // Prefer buckets that match complexity level
        if (criteria.complexity > 3 && bucket === 'expedition') score += 2;
        if (criteria.complexity <= 2 && bucket === 'tactical') score += 2;

        // Prefer buckets with appropriate duration (not too much overhead)
        const durationRatio =
          criteria.estimatedDurationMs / config.maxDurationMs;
        if (durationRatio > 0.5 && durationRatio < 0.8) score += 1;

        return { bucket, score };
      });

      bucketScores.sort((a, b) => b.score - a.score);
      selectedBucket = bucketScores[0].bucket;
      reasoning.push(
        `Selected ${selectedBucket} based on complexity and resource requirements`
      );
    }

    // Create trace
    const trace: BucketTrace = {
      taskId,
      selectedBucket,
      alternatives: availableBuckets,
      reasoning,
      constraints: {
        maxDuration: constraints.maxDuration,
        requiredPriority: criteria.priority,
        availableBuckets,
      },
      timestamp: Date.now(),
      metadata: {
        estimatedDuration: criteria.estimatedDurationMs,
        complexity: criteria.complexity,
        resourceRequirements: criteria.resourceRequirements,
      },
    };

    // Store trace
    const traces = this.bucketTraces.get(taskId) || [];
    traces.push(trace);
    this.bucketTraces.set(taskId, traces);

    return { bucket: selectedBucket, trace };
  }

  // ============================================================================
  // Task Execution Management
  // ============================================================================

  /**
   * Start a task in a specific bucket
   */
  startTask(
    taskId: string,
    bucketName: TimeBucket,
    metadata?: Record<string, any>
  ): TaskExecutionState {
    const config = this.bucketConfigs[bucketName];
    if (!config) {
      throw new Error(`Unknown bucket: ${bucketName}`);
    }

    const state: TaskExecutionState = {
      taskId,
      bucketName,
      startTime: performance.now(),
      elapsedMs: 0,
      checkpoints: [],
      status: 'running',
      metadata,
    };

    this.activeTasks.set(taskId, state);
    return state;
  }

  /**
   * Update task execution state
   */
  updateTask(taskId: string, updates: Partial<TaskExecutionState>): void {
    const state = this.activeTasks.get(taskId);
    if (!state) {
      throw new Error(`Task not found: ${taskId}`);
    }

    Object.assign(state, updates);
    state.elapsedMs = performance.now() - state.startTime;

    // Check for timeout
    const config = this.bucketConfigs[state.bucketName];
    if (state.elapsedMs >= config.maxDurationMs && state.status === 'running') {
      state.status = 'timeout';
    }
  }

  /**
   * Add checkpoint to task
   */
  addCheckpoint(taskId: string, data: any, description: string): void {
    const state = this.activeTasks.get(taskId);
    if (!state) {
      throw new Error(`Task not found: ${taskId}`);
    }

    state.checkpoints.push({
      timestamp: performance.now(),
      data,
      description,
    });
  }

  /**
   * Pause task with resume ticket
   */
  pauseTask(
    taskId: string,
    trailerOptionId?: string,
    checkpointData?: any
  ): ResumeTicket {
    const state = this.activeTasks.get(taskId);
    if (!state) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (state.status !== 'running') {
      throw new Error(`Cannot pause task in status: ${state.status}`);
    }

    // Create resume ticket
    const ticket: ResumeTicket = {
      id: `${taskId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      bucketName: state.bucketName,
      trailerOptionId,
      checkpointData:
        checkpointData || state.checkpoints[state.checkpoints.length - 1]?.data,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };

    // Update task state
    state.status = 'paused';
    state.resumeTicket = ticket;
    state.trailerOptionId = trailerOptionId;

    // Store ticket
    this.resumeTickets.set(ticket.id, ticket);

    // Create bucket trailer if trailer option is provided
    if (trailerOptionId) {
      const trailer: BucketTrailer = {
        taskId,
        bucketName: state.bucketName,
        trailerOptionId,
        checkpointData: ticket.checkpointData,
        resumeTicket: ticket,
      };
      this.bucketTrailers.set(taskId, trailer);
    }

    return ticket;
  }

  /**
   * Resume task from ticket
   */
  resumeTask(ticketId: string): TaskExecutionState {
    const ticket = this.resumeTickets.get(ticketId);
    if (!ticket) {
      throw new Error(`Resume ticket not found: ${ticketId}`);
    }

    if (Date.now() > ticket.expiresAt) {
      throw new Error(`Resume ticket expired: ${ticketId}`);
    }

    const state = this.activeTasks.get(ticket.taskId);
    if (!state) {
      throw new Error(`Task not found: ${ticket.taskId}`);
    }

    if (state.status !== 'paused') {
      throw new Error(`Task is not paused: ${ticket.taskId}`);
    }

    // Resume task
    state.status = 'running';
    state.startTime = performance.now(); // Reset start time
    state.elapsedMs = 0;

    // Remove ticket
    this.resumeTickets.delete(ticketId);

    return state;
  }

  /**
   * Complete task
   */
  completeTask(taskId: string): void {
    const state = this.activeTasks.get(taskId);
    if (!state) {
      throw new Error(`Task not found: ${taskId}`);
    }

    state.status = 'completed';
    state.elapsedMs = performance.now() - state.startTime;

    // Clean up
    this.activeTasks.delete(taskId);
    this.bucketTrailers.delete(taskId);
  }

  /**
   * Fail task
   */
  failTask(taskId: string, error?: string): void {
    const state = this.activeTasks.get(taskId);
    if (!state) {
      throw new Error(`Task not found: ${taskId}`);
    }

    state.status = 'failed';
    state.elapsedMs = performance.now() - state.startTime;
    if (error) {
      state.metadata = { ...state.metadata, error };
    }
  }

  // ============================================================================
  // Query and Monitoring
  // ============================================================================

  /**
   * Get active tasks
   */
  getActiveTasks(): TaskExecutionState[] {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Get task state
   */
  getTaskState(taskId: string): TaskExecutionState | undefined {
    return this.activeTasks.get(taskId);
  }

  /**
   * Get bucket traces for a task
   */
  getBucketTraces(taskId: string): BucketTrace[] {
    return this.bucketTraces.get(taskId) || [];
  }

  /**
   * Get bucket trailer for a task
   */
  getBucketTrailer(taskId: string): BucketTrailer | undefined {
    return this.bucketTrailers.get(taskId);
  }

  /**
   * Get valid resume tickets
   */
  getValidResumeTickets(): ResumeTicket[] {
    const now = Date.now();
    return Array.from(this.resumeTickets.values()).filter(
      (ticket) => now <= ticket.expiresAt
    );
  }

  /**
   * Get bucket configuration
   */
  getBucketConfig(bucketName: TimeBucket): TimeBucketConfig {
    return this.bucketConfigs[bucketName];
  }

  /**
   * Get all bucket configurations
   */
  getAllBucketConfigs(): Record<TimeBucket, TimeBucketConfig> {
    return { ...this.bucketConfigs };
  }

  /**
   * Check if task is running
   */
  isTaskRunning(taskId: string): boolean {
    const state = this.activeTasks.get(taskId);
    return state?.status === 'running';
  }

  /**
   * Check if task is paused
   */
  isTaskPaused(taskId: string): boolean {
    const state = this.activeTasks.get(taskId);
    return state?.status === 'paused';
  }

  /**
   * Get remaining time for a task
   */
  getRemainingTime(taskId: string): number {
    const state = this.activeTasks.get(taskId);
    if (!state || state.status !== 'running') {
      return 0;
    }

    const config = this.bucketConfigs[state.bucketName];
    const remaining = config.maxDurationMs - state.elapsedMs;
    return Math.max(0, remaining);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Clean up expired tickets
   */
  cleanupExpiredTickets(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [ticketId, ticket] of this.resumeTickets.entries()) {
      if (now > ticket.expiresAt) {
        this.resumeTickets.delete(ticketId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get bucket statistics
   */
  getBucketStatistics(): Record<
    TimeBucket,
    { active: number; completed: number; failed: number }
  > {
    const stats: Record<
      TimeBucket,
      { active: number; completed: number; failed: number }
    > = {
      tactical: { active: 0, completed: 0, failed: 0 },
      short: { active: 0, completed: 0, failed: 0 },
      standard: { active: 0, completed: 0, failed: 0 },
      long: { active: 0, completed: 0, failed: 0 },
      expedition: { active: 0, completed: 0, failed: 0 },
    };

    for (const state of this.activeTasks.values()) {
      if (state.status === 'running') {
        stats[state.bucketName].active++;
      } else if (state.status === 'completed') {
        stats[state.bucketName].completed++;
      } else if (state.status === 'failed') {
        stats[state.bucketName].failed++;
      }
    }

    return stats;
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.activeTasks.clear();
    this.resumeTickets.clear();
    this.bucketTraces.clear();
    this.bucketTrailers.clear();
  }
}
