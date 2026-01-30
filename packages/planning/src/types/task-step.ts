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
  /**
   * Structured metadata — use instead of parsing labels.
   *
   * Known keys:
   * - `source`      — origin solver / system (e.g. `'sterling'`)
   * - `leaf`        — executable leaf name (e.g. `'dig_block'`, `'craft_recipe'`)
   * - `args`        — pre-derived executor args (pass-through to toolExecutor)
   * - `executable`  — `true` if this step can be dispatched to a leaf
   * - `produces`    — `Array<{ name: string; count: number }>` items the step yields
   * - `consumes`    — `Array<{ name: string; count: number }>` items the step requires
   * - `reason`      — human-readable rationale for the step
   * - `domain`      — solver domain (e.g. `'crafting'`, `'building'`)
   * - `moduleId`    — building module identifier
   * - `planId`      — solver plan identifier
   * - `bundleId`    — SolveBundle identifier
   * - `solverId`    — solver that generated this step
   */
  meta?: Record<string, unknown>;
}
