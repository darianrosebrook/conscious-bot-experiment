/**
 * Preemption Budget + Safe-Stop
 *
 * When a task is preempted (hold applied with reason='preempted'), the task
 * gets a budget to wind down safely:
 * - Max 3 additional steps OR 5 seconds, whichever comes first
 * - The budget tracker records how many steps/time were consumed
 * - When budget expires, the hold witness is written and the task pauses
 *
 * This prevents unbounded execution after a preemption signal, while still
 * allowing the current step to complete safely (no mid-action interruption).
 *
 * @see docs/internal/goal-binding-protocol.md §E
 */

import type { Task } from '../types/task';
import type { GoalBinding, HoldWitness } from './goal-binding-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum steps allowed after preemption signal */
export const MAX_PREEMPTION_STEPS = 3;

/** Maximum time in ms allowed after preemption signal */
export const MAX_PREEMPTION_TIME_MS = 5000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreemptionBudget {
  /** Task ID this budget applies to */
  taskId: string;
  /** Timestamp when the preemption signal was received */
  signalAt: number;
  /** Number of steps consumed since preemption signal */
  stepsConsumed: number;
  /** Maximum steps allowed */
  maxSteps: number;
  /** Maximum time allowed (ms from signalAt) */
  maxTimeMs: number;
  /** Whether the budget has been exhausted */
  exhausted: boolean;
}

export type BudgetCheckResult =
  | { within: true; stepsRemaining: number; timeRemainingMs: number }
  | { within: false; reason: 'steps_exhausted' | 'time_exhausted' | 'both_exhausted' };

// ---------------------------------------------------------------------------
// Budget management
// ---------------------------------------------------------------------------

/**
 * Create a new preemption budget for a task.
 */
export function createPreemptionBudget(
  taskId: string,
  options?: {
    maxSteps?: number;
    maxTimeMs?: number;
    now?: number;
  },
): PreemptionBudget {
  return {
    taskId,
    signalAt: options?.now ?? Date.now(),
    stepsConsumed: 0,
    maxSteps: options?.maxSteps ?? MAX_PREEMPTION_STEPS,
    maxTimeMs: options?.maxTimeMs ?? MAX_PREEMPTION_TIME_MS,
    exhausted: false,
  };
}

/**
 * Record that a step was consumed within the preemption budget.
 * Returns the updated budget check.
 */
export function consumeStep(
  budget: PreemptionBudget,
  now?: number,
): BudgetCheckResult {
  budget.stepsConsumed++;
  return checkBudget(budget, now);
}

/**
 * Check whether the preemption budget still has capacity.
 */
export function checkBudget(
  budget: PreemptionBudget,
  now?: number,
): BudgetCheckResult {
  const currentTime = now ?? Date.now();
  const elapsed = currentTime - budget.signalAt;
  const stepsExhausted = budget.stepsConsumed >= budget.maxSteps;
  const timeExhausted = elapsed >= budget.maxTimeMs;

  if (stepsExhausted && timeExhausted) {
    budget.exhausted = true;
    return { within: false, reason: 'both_exhausted' };
  }
  if (stepsExhausted) {
    budget.exhausted = true;
    return { within: false, reason: 'steps_exhausted' };
  }
  if (timeExhausted) {
    budget.exhausted = true;
    return { within: false, reason: 'time_exhausted' };
  }

  return {
    within: true,
    stepsRemaining: budget.maxSteps - budget.stepsConsumed,
    timeRemainingMs: budget.maxTimeMs - elapsed,
  };
}

// ---------------------------------------------------------------------------
// HoldWitness construction
// ---------------------------------------------------------------------------

/**
 * Build a HoldWitness from the current task state.
 * Records the point at which the task will be paused.
 *
 * @param task - The task being preempted
 * @param verified - Whether the current state has been verified (e.g., block placements confirmed)
 */
export function buildHoldWitness(
  task: Task,
  verified: boolean = false,
): HoldWitness {
  // Find the last completed step
  const completedSteps = task.steps.filter((s) => s.done);
  const lastStep = completedSteps[completedSteps.length - 1];

  // Extract moduleCursor from build metadata if available
  const buildMeta = (task.metadata as any).build;
  const moduleCursor = buildMeta?.moduleCursor ?? undefined;

  return {
    lastStepId: lastStep?.id,
    moduleCursor,
    verified,
  };
}

/**
 * Check if a HoldWitness is valid (has at least one identifying field).
 */
export function isValidWitness(witness: HoldWitness): boolean {
  return witness.lastStepId !== undefined || witness.moduleCursor !== undefined;
}

// ---------------------------------------------------------------------------
// Preemption coordinator
// ---------------------------------------------------------------------------

/**
 * Full preemption workflow:
 * 1. Create budget on preemption signal
 * 2. Track step consumption
 * 3. Build witness when budget expires
 * 4. Return the witness for the hold manager
 *
 * This is a stateful coordinator — one per active preemption.
 */
export class PreemptionCoordinator {
  private budgets = new Map<string, PreemptionBudget>();

  /**
   * Signal that a task should be preempted.
   * Returns the budget for the caller to track.
   */
  signal(taskId: string, options?: { maxSteps?: number; maxTimeMs?: number; now?: number }): PreemptionBudget {
    const existing = this.budgets.get(taskId);
    if (existing && !existing.exhausted) {
      return existing; // Already preempting, return existing budget
    }

    const budget = createPreemptionBudget(taskId, options);
    this.budgets.set(taskId, budget);
    return budget;
  }

  /**
   * Record a step completion for a preempting task.
   * Returns the budget check result.
   */
  recordStep(taskId: string, now?: number): BudgetCheckResult | null {
    const budget = this.budgets.get(taskId);
    if (!budget) return null;
    return consumeStep(budget, now);
  }

  /**
   * Check budget status without consuming a step.
   */
  check(taskId: string, now?: number): BudgetCheckResult | null {
    const budget = this.budgets.get(taskId);
    if (!budget) return null;
    return checkBudget(budget, now);
  }

  /**
   * Complete the preemption: build witness and clean up.
   */
  complete(task: Task, verified: boolean = false): HoldWitness {
    const witness = buildHoldWitness(task, verified);
    this.budgets.delete(task.id);
    return witness;
  }

  /**
   * Cancel the preemption (e.g., if the preemption was revoked).
   */
  cancel(taskId: string): boolean {
    return this.budgets.delete(taskId);
  }

  /**
   * Check if a task is currently being preempted.
   */
  isPreempting(taskId: string): boolean {
    const budget = this.budgets.get(taskId);
    return budget !== undefined && !budget.exhausted;
  }

  /**
   * Get the budget for a task.
   */
  getBudget(taskId: string): PreemptionBudget | undefined {
    return this.budgets.get(taskId);
  }

  /**
   * Number of active preemption budgets.
   */
  get activeCount(): number {
    let count = 0;
    for (const budget of this.budgets.values()) {
      if (!budget.exhausted) count++;
    }
    return count;
  }
}
