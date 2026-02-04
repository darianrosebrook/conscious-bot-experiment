/**
 * Execution gate for task conversion.
 *
 * This module provides the SINGLE choke point for deciding if a
 * reducer result can be converted to a task.
 *
 * Key invariant: Uses is_executable ONLY, not advisory presence or confidence.
 * Advisory is for routing hints, NOT execution authority.
 *
 * @author @darianrosebrook
 */

import type { ReducerResultView } from './reducer-result-types';

/**
 * Error thrown when task conversion is attempted on a non-executable result.
 */
export class ExecutionGateError extends Error {
  constructor(
    message: string,
    public readonly result: ReducerResultView,
  ) {
    super(message);
    this.name = 'ExecutionGateError';
  }
}

/**
 * Gate for task conversion.
 *
 * CRITICAL: This is the ONLY place that decides if a result can become a task.
 * Uses is_executable, NOT advisory presence.
 *
 * A result is executable when:
 * 1. It has a committed goal proposition (explicit [GOAL: ...] tag)
 * 2. If grounding was performed, it passed
 *
 * A result is NOT executable when:
 * - No committed goal (even with high-confidence advisory)
 * - Grounding failed (even with committed goal)
 *
 * @param result - The reducer result to check
 * @returns true if the result can be converted to a task
 */
export function canConvertToTask(result: ReducerResultView): boolean {
  return result.is_executable;
}

/**
 * Require executability or throw.
 *
 * Use this at task conversion entry points to enforce the gate.
 *
 * @param result - The reducer result to check
 * @throws ExecutionGateError if not executable
 */
export function requireExecutable(result: ReducerResultView): void {
  if (!result.is_executable) {
    throw new ExecutionGateError(
      `Cannot convert result to task: is_executable=false. ` +
        `committed_goal_prop_id=${result.committed_goal_prop_id}, ` +
        `grounding=${result.grounding ? `passed=${result.grounding.passed}` : 'null'}, ` +
        `advisory=${result.advisory?.intent_family ?? 'null'}`,
      result,
    );
  }
}

/**
 * Get a human-readable reason why a result is not executable.
 *
 * Useful for logging and debugging.
 *
 * @param result - The reducer result to analyze
 * @returns Explanation string, or null if executable
 */
export function getExecutionBlockReason(result: ReducerResultView): string | null {
  if (result.is_executable) {
    return null;
  }

  if (!result.committed_goal_prop_id) {
    if (result.advisory) {
      return `No committed goal (advisory suggests ${result.advisory.intent_family} with ${(result.advisory.confidence * 100).toFixed(0)}% confidence, but advisory does not grant execution authority)`;
    }
    return 'No committed goal (no explicit [GOAL: ...] tag found)';
  }

  if (result.grounding && !result.grounding.passed) {
    return `Grounding failed: ${result.grounding.reason}`;
  }

  return 'Unknown reason (unexpected state)';
}

/**
 * Check if a result represents a completely empty semantic parse.
 *
 * Useful for distinguishing between:
 * - Empty: "The weather is nice" (no intent detected)
 * - Non-executable but not empty: "I want to explore" (advisory but no committed goal)
 * - Executable: "[GOAL: explore area]" (committed goal)
 */
export function isSemanticEmpty(result: ReducerResultView): boolean {
  return result.is_semantically_empty;
}
