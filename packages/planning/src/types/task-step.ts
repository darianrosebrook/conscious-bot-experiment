/**
 * Canonical TaskStep interface shared by solvers, task-integration,
 * and any module that generates or consumes planning steps.
 *
 * Single source of truth — do not redeclare locally.
 *
 * @author @darianrosebrook
 */

export interface TaskStep {
  id: string;
  label: string;
  done: boolean;
  order: number;
  estimatedDuration?: number;
  actualDuration?: number;
  startedAt?: number;
  completedAt?: number;
  /** Structured metadata — domain, moduleId, planId, etc. Use instead of parsing labels. */
  meta?: Record<string, unknown>;
}
