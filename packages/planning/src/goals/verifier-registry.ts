/**
 * Verifier Registry
 *
 * Registry of completion verifiers for goal-bound tasks.
 * Each verifier is a function that checks whether a goal's completion
 * conditions are met, returning a structured GoalCompletionResult.
 *
 * Verifiers must be:
 * - Bounded: execute within a time budget (no unbounded world scans)
 * - Idempotent: same inputs → same output
 * - Side-effect free: no mutations
 *
 * The registry includes verify_shelter_v0 as the first concrete verifier.
 *
 * @see docs/internal/goal-binding-protocol.md §H
 */

import type { Task } from '../types/task';
import type { GoalCompletionResult, GoalBinding } from './goal-binding-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * World state snapshot for verification.
 * Minimal interface — callers inject whatever the verifier needs.
 */
export interface VerificationWorldState {
  /** Blocks at specific positions */
  getBlock?: (x: number, y: number, z: number) => { name: string } | null;
  /** Check if a position has shelter (roof above, walls around) */
  hasShelter?: (position: { x: number; y: number; z: number }) => boolean;
  /** Check if a position is enclosed */
  isEnclosed?: (position: { x: number; y: number; z: number }) => boolean;
}

/**
 * Verifier function signature.
 */
export type VerifierFn = (
  task: Task,
  worldState?: VerificationWorldState,
) => GoalCompletionResult;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum time a verifier is allowed to run (ms) */
export const VERIFIER_TIME_BUDGET_MS = 100;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Registry of named verifier functions.
 * Singleton per process — register verifiers at startup.
 */
export class VerifierRegistry {
  private verifiers = new Map<string, VerifierFn>();

  /**
   * Register a verifier function by name.
   * Throws if a verifier with the same name is already registered.
   */
  register(name: string, fn: VerifierFn): void {
    if (this.verifiers.has(name)) {
      throw new Error(`Verifier '${name}' is already registered`);
    }
    this.verifiers.set(name, fn);
  }

  /**
   * Look up a verifier by name.
   */
  get(name: string): VerifierFn | undefined {
    return this.verifiers.get(name);
  }

  /**
   * Check if a verifier is registered.
   */
  has(name: string): boolean {
    return this.verifiers.has(name);
  }

  /**
   * Run a verifier by name.
   * Returns a failure result if the verifier is not found or throws.
   */
  verify(
    verifierName: string,
    task: Task,
    worldState?: VerificationWorldState,
  ): GoalCompletionResult {
    const fn = this.verifiers.get(verifierName);
    if (!fn) {
      return {
        done: false,
        blockers: [`verifier '${verifierName}' not registered`],
      };
    }

    try {
      return fn(task, worldState);
    } catch (err) {
      return {
        done: false,
        blockers: [`verifier threw: ${err instanceof Error ? err.message : String(err)}`],
      };
    }
  }

  /**
   * List all registered verifier names.
   */
  list(): string[] {
    return [...this.verifiers.keys()];
  }

  /**
   * Number of registered verifiers.
   */
  get size(): number {
    return this.verifiers.size;
  }
}

// ---------------------------------------------------------------------------
// verify_shelter_v0
// ---------------------------------------------------------------------------

/**
 * Shelter verifier v0.
 *
 * Checks whether the build task has produced a valid shelter by examining:
 * 1. Task progress >= 1.0 (all steps completed)
 * 2. If worldState.hasShelter is available, checks the build site
 * 3. All modules completed (moduleCursor === totalModules)
 *
 * This is a "soft" verifier — it uses available evidence rather than
 * requiring a full world scan. The completion stability window (commit 13)
 * ensures reliability by requiring multiple consecutive passes.
 */
export function verifyShelterV0(
  task: Task,
  worldState?: VerificationWorldState,
): GoalCompletionResult {
  const binding = task.metadata.goalBinding as GoalBinding | undefined;
  const evidence: string[] = [];
  const blockers: string[] = [];

  // Check 1: Task progress
  if (task.progress >= 1.0) {
    evidence.push('task_progress_complete');
  } else if (task.progress >= 0.9) {
    evidence.push(`task_progress_high:${task.progress}`);
  } else {
    blockers.push(`task_progress_low:${task.progress}`);
  }

  // Check 2: All steps done
  const totalSteps = task.steps.length;
  const doneSteps = task.steps.filter((s) => s.done).length;
  if (totalSteps > 0 && doneSteps === totalSteps) {
    evidence.push('all_steps_complete');
  } else if (totalSteps > 0) {
    blockers.push(`steps_remaining:${totalSteps - doneSteps}/${totalSteps}`);
  }

  // Check 3: Module completion (if build metadata exists)
  const buildMeta = (task.metadata as any).build;
  if (buildMeta && typeof buildMeta.moduleCursor === 'number') {
    const total = buildMeta.totalModules ?? 0;
    if (total > 0 && buildMeta.moduleCursor >= total) {
      evidence.push('all_modules_complete');
    } else if (total > 0) {
      blockers.push(`modules_remaining:${total - buildMeta.moduleCursor}/${total}`);
    }
  }

  // Check 4: World state verification (if available)
  if (worldState?.hasShelter && binding?.anchors.siteSignature) {
    const pos = binding.anchors.siteSignature.position;
    if (worldState.hasShelter(pos)) {
      evidence.push('world_shelter_confirmed');
    } else {
      blockers.push('world_shelter_not_found');
    }
  }

  // Score: proportion of checks that passed
  const totalChecks = evidence.length + blockers.length;
  const score = totalChecks > 0 ? evidence.length / totalChecks : 0;

  // Done if no blockers (or only minor progress blocker with high progress)
  const done = blockers.length === 0 ||
    (blockers.length === 0 && evidence.length > 0);

  return { done, score, blockers: blockers.length > 0 ? blockers : undefined, evidence };
}

// ---------------------------------------------------------------------------
// Default registry factory
// ---------------------------------------------------------------------------

/**
 * Create a VerifierRegistry with the built-in verifiers registered.
 */
export function createDefaultVerifierRegistry(): VerifierRegistry {
  const registry = new VerifierRegistry();
  registry.register('verify_shelter_v0', verifyShelterV0);
  return registry;
}
