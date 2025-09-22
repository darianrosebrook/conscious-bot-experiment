/**
 * HTN Planner (initial)
 *
 * Decomposes goals to HTN tasks, executes a simple sequence, and records
 * effectiveness into the memory system via HTNMemoryManager.
 *
 * Author: @darianrosebrook
 */

import { Goal, Plan, PlanStatus, HTNTask, HTNTaskStatus } from '../types';
import { decomposeToPlan } from './plan-decomposer';

// Local import with path alias expected via workspace references
import { HTNMemoryManager } from '@conscious-bot/memory';

export interface HTNPlannerConfig {
  enableEffectivenessLogging: boolean;
}

const DEFAULT_CONFIG: HTNPlannerConfig = {
  enableEffectivenessLogging: true,
};

export class HTNPlanner {
  private readonly memory: HTNMemoryManager;
  private readonly config: HTNPlannerConfig;

  constructor(
    memory: HTNMemoryManager,
    config: Partial<HTNPlannerConfig> = {}
  ) {
    this.memory = memory;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a plan using a simple decomposition stub
   */
  createPlan(goal: Goal): Plan | undefined {
    return decomposeToPlan(goal);
  }

  /**
   * Execute a trivial HTN task and record effectiveness.
   * This is a placeholder execution path; real execution should integrate with executor.
   */
  async executeTask(task: HTNTask, sessionId: string): Promise<HTNTaskStatus> {
    const start = Date.now();
    let status: HTNTaskStatus = HTNTaskStatus.COMPLETED;
    let reward = 0;
    let effectiveness = 0.6;

    try {
      // Simulated execution; in real flow, call executor and collect outcome
      await new Promise((r) => setTimeout(r, 5));
      reward = 0.1;
      effectiveness = 0.7;
    } catch (err) {
      status = HTNTaskStatus.FAILED;
      reward = -0.2;
      effectiveness = 0.2;
    }

    if (this.config.enableEffectivenessLogging) {
      this.memory.recordTaskExecution({
        id: `htn-${task.id}-${Date.now()}`,
        taskId: task.id,
        executionId: `${task.id}-${Date.now()}`,
        outcome: status === HTNTaskStatus.COMPLETED ? 'success' : 'failure',
        effectiveness,
        duration: Date.now() - start,
        reward,
        context: {},
        methodUsed: task.methods?.[0]?.id || 'default',
        subtasksCompleted: task.subTasks.length,
        subtasksTotal: task.subTasks.length,
        errors: [],
        preconditionsMet: task.preconditions.length,
        preconditionsTotal: task.preconditions.length,
        resourceUtilization: 0.5,
        timestamp: Date.now(),
        sessionId,
        worldState: {},
        emotionalState: {
          satisfaction: reward > 0 ? 0.6 : 0.3,
          frustration: reward > 0 ? 0.2 : 0.6,
          excitement: 0.3,
          curiosity: 0.4,
          confidence: effectiveness,
          timestamp: Date.now(),
        },
        tags: ['htn', task.name],
        metadata: {},
      });
    }

    return status;
  }
}
