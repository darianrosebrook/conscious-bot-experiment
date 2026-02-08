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
   * - `intent`      — intent metadata from expand-by-digest (non-executable)
   */
  meta?: Record<string, unknown>;
}

// ============================================================================
// Step Meta Narrowing Types
// ============================================================================
//
// These are structural "views" into TaskStep.meta, not replacements.
// TaskStep.meta remains Record<string, unknown> for backwards compatibility.
// New code should use the type guards below to narrow before dispatch.

/**
 * Executor-level step metadata: the step carries a leaf name that exists in
 * KNOWN_LEAVES and validated args that can be passed to the tool executor.
 *
 * Steps with this shape are dispatchable. The `argsSource` field distinguishes
 * Option A (explicit, certifiable) from legacy derivation.
 */
export interface ExecStepMeta {
  /** Executable leaf name — must be in KNOWN_LEAVES (e.g. 'craft_recipe', 'acquire_material') */
  leaf: string;
  /** Executor-native args — validated against leaf-arg-contracts */
  args: Record<string, unknown>;
  /** true when the executor has confirmed this step can be dispatched */
  executable: true;
  /** 'explicit' = Sterling-provided args (Option A); 'derived' = TS-inferred (legacy) */
  argsSource?: 'explicit' | 'derived';
  /** Origin solver / system */
  source?: string;
  /** Solver domain */
  domain?: string;
}

/**
 * Intent-level step metadata: the step carries a task_type_* leaf from
 * Sterling expand-by-digest. It represents what was *intended*, not what
 * can be *executed*. These steps need translation before dispatch.
 *
 * Intent metadata should be carried in meta.intent for audit/explainability,
 * NOT in meta.leaf (which is reserved for executable vocabulary).
 */
export interface IntentStepMeta {
  /** Proposition metadata from expand-by-digest */
  intent: {
    /** The task_type_* leaf name from Sterling */
    leafName: string;
    /** Predicate lemma (e.g. 'craft', 'mine') */
    lemma: string;
    /** Proposition ID in the committed IR */
    propositionId: string;
    /** Routing domain hint */
    routingDomain?: string;
    /** Original task type (e.g. 'CRAFT', 'MINE') */
    taskType?: string;
  };
  /** Source is always expand-by-digest for intent steps */
  source: 'expand_by_digest';
  /** Intent steps are not directly executable */
  executable?: false;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Narrow step meta to ExecStepMeta. Returns true when the step has a leaf
 * name, args object, and executable=true. Does NOT validate the leaf against
 * KNOWN_LEAVES (use validateStepAgainstRegistry for that).
 */
export function isExecStepMeta(meta: Record<string, unknown> | undefined): meta is ExecStepMeta & Record<string, unknown> {
  if (!meta) return false;
  return (
    typeof meta.leaf === 'string' &&
    meta.args !== null &&
    meta.args !== undefined &&
    typeof meta.args === 'object' &&
    !Array.isArray(meta.args) &&
    meta.executable === true
  );
}

/**
 * Narrow step meta to IntentStepMeta. Returns true when the step has
 * intent metadata from expand-by-digest.
 */
export function isIntentStepMeta(meta: Record<string, unknown> | undefined): meta is IntentStepMeta & Record<string, unknown> {
  if (!meta) return false;
  const intent = meta.intent as Record<string, unknown> | undefined;
  return (
    intent !== null &&
    intent !== undefined &&
    typeof intent === 'object' &&
    typeof intent.leafName === 'string' &&
    typeof intent.lemma === 'string'
  );
}
