/**
 * Step Option A normalizer: single choke point for ensuring steps have
 * executor-native meta.args (Option A) before they reach the executor.
 * Runs after Sterling expansion and after any step mutation (inject, regenerate).
 * Default (strict): validates only; sets planningIncomplete when a step would be
 * derived or has unknown leaf; does not write meta.args. Legacy materialization
 * is opt-in via allowMaterialize and marks the task optionACompatUsed (non-certifiable).
 *
 * @author @darianrosebrook
 */

import { stepToLeafExecution } from './step-to-leaf-execution';
import { KNOWN_LEAVES, isIntentLeaf } from './leaf-arg-contracts';

/** Task-like shape with steps and metadata we can mutate. Compatible with Task (TaskStep has meta?). */
export type TaskWithSteps = {
  id?: string;
  steps?: Array<{ id?: string; meta?: Record<string, unknown> }>;
  metadata?: Record<string, unknown>;
};

/** Options for normalization. Default is strict (validation-only; no materialization). */
export type NormalizeOptions = {
  /**
   * When true, allow writing step.meta.args from produces/consumes (legacy compat).
   * Dev/shadow-only; when used, task.metadata.optionACompatUsed is set so cert can forbid/meter.
   * Default false: normalizer never writes meta.args for derived steps.
   */
  allowMaterialize?: boolean;
};

// ============================================================================
// Step Registry Validation (fail-closed boundary gate)
// ============================================================================

export type StepValidationResult =
  | { valid: true }
  | { valid: false; reason: 'missing_leaf' }
  | { valid: false; reason: 'intent_leaf'; leaf: string }
  | { valid: false; reason: 'unknown_leaf'; leaf: string };

/**
 * Validate a step's leaf against the executable registry. Fail-closed:
 * returns an error for any leaf not in KNOWN_LEAVES.
 *
 * Intent leaves (task_type_*) get a specific reason so callers can
 * distinguish "this is an intent label that needs translation" from
 * "this is a genuinely unknown leaf name."
 */
export function validateStepAgainstRegistry(
  step: { meta?: Record<string, unknown> }
): StepValidationResult {
  const leaf = step.meta?.leaf as string | undefined;
  if (!leaf) return { valid: false, reason: 'missing_leaf' };
  if (isIntentLeaf(leaf)) return { valid: false, reason: 'intent_leaf', leaf };
  if (!KNOWN_LEAVES.has(leaf)) return { valid: false, reason: 'unknown_leaf', leaf };
  return { valid: true };
}

const MAX_PLANNING_INCOMPLETE_REASONS = 20;

/** Optional out-param: set materialized when step was derived and we wrote meta.args. */
export type MaterializeOut = { materialized?: boolean };

/**
 * Materialize one step to Option A: ensure step.meta.args is a plain object.
 * Strict (default): returns true only when step already has explicit Option A;
 * for derived or unknown leaf, returns false and does not mutate step.
 * When allowMaterialize is true: same derivation as stepToLeafExecution; writes
 * back meta.args and originalLeaf where applicable; sets out.materialized so
 * caller can set optionACompatUsed on task.
 *
 * @returns true if step is now Option A (already explicit or materialized); false if not (no leaf, unknown leaf, or derived under strict).
 */
export function materializeStepToOptionA(
  step: { meta?: Record<string, unknown> },
  options: NormalizeOptions = {},
  out?: MaterializeOut
): boolean {
  const allowMaterialize = options.allowMaterialize === true;
  const result = stepToLeafExecution(step);
  if (!result) return false;
  if (result.argsSource === 'explicit') return true;
  if (!allowMaterialize) return false;
  if (!step.meta) step.meta = {};
  step.meta.args = result.args;
  if (result.originalLeaf) {
    (step.meta as Record<string, unknown>).originalLeaf = result.originalLeaf;
  }
  if (out) out.materialized = true;
  return true;
}

/**
 * Normalize all task steps to Option A. Mutates task.steps and task.metadata in place.
 * Strict (default): does not write meta.args for derived steps; sets planningIncomplete
 * when any step would be derived or has unknown leaf, and planningIncompleteReasons
 * (bounded, max 10) for unknown leaves. When allowMaterialize is true, materializes
 * where possible and sets task.metadata.optionACompatUsed if any step was materialized.
 * Clears planningIncomplete when all steps are explicit Option A after this run.
 */
export function normalizeTaskStepsToOptionA(
  task: TaskWithSteps,
  options: NormalizeOptions = {}
): void {
  const steps = task.steps;
  if (!steps || steps.length === 0) return;
  if (!task.metadata) task.metadata = {};

  let anyIncomplete = false;
  let compatUsed = false;
  const materializedOut: MaterializeOut = {};
  const reasons: Array<{ leaf?: string; reason: string }> = [];

  for (const step of steps) {
    // Registry validation: classify step before attempting leaf extraction
    const validation = validateStepAgainstRegistry(step);
    if (!validation.valid && validation.reason === 'intent_leaf') {
      anyIncomplete = true;
      if (reasons.length < MAX_PLANNING_INCOMPLETE_REASONS) {
        reasons.push({
          leaf: validation.leaf,
          reason: 'intent_leaf_not_executable',
        });
      }
      continue;
    }

    const result = stepToLeafExecution(step);
    if (!result) {
      anyIncomplete = true;
      if (reasons.length < MAX_PLANNING_INCOMPLETE_REASONS) {
        reasons.push({
          leaf: (step.meta?.leaf as string) ?? undefined,
          reason: validation.valid === false ? validation.reason : 'unknown_leaf',
        });
      }
      continue;
    }
    if (result.argsSource === 'explicit') continue;
    if (!options.allowMaterialize) {
      anyIncomplete = true;
      continue;
    }
    materializedOut.materialized = false;
    materializeStepToOptionA(step, options, materializedOut);
    if (materializedOut.materialized) compatUsed = true;
  }

  if (compatUsed) {
    task.metadata.optionACompatUsed = true;
  }

  if (anyIncomplete) {
    task.metadata.planningIncomplete = true;
    task.metadata.planningIncompleteReasons = reasons;
  } else {
    if ('planningIncomplete' in task.metadata) {
      delete task.metadata.planningIncomplete;
    }
    if ('planningIncompleteReasons' in task.metadata) {
      delete task.metadata.planningIncompleteReasons;
    }
  }
}
