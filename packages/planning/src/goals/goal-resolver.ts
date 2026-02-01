/**
 * Goal Resolver
 *
 * Resolves incoming goal intent to one of three outcomes:
 * - "continue": existing non-terminal task matches → return its ID
 * - "already_satisfied": completed task passes verifier → no new task
 * - "create": no match → create a new task with goalBinding
 *
 * Scoring and candidate selection are separated from mutation so matching
 * correctness can be tested independently (commit 4 = dry, commit 5 = atomic).
 *
 * @see docs/internal/goal-binding-protocol.md §C
 */

import type { Task } from '../types/task';
import type { GoalBinding, GoalAnchors } from './goal-binding-types';
import { computeProvisionalKey, createGoalBinding, type ProvisionalKeyInput } from './goal-identity';
import { KeyedMutex, withKeyLock } from './keyed-mutex';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolveCandidate {
  task: Task;
  binding: GoalBinding;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  keyMatch: number;
  anchorMatch: number;
  proximity: number;
  progress: number;
  recency: number;
  total: number;
}

export type ResolveOutcome =
  | { action: 'continue'; taskId: string; score: number; breakdown: ScoreBreakdown }
  | { action: 'already_satisfied'; taskId: string; score: number }
  | { action: 'create'; goalKey: string };

export interface ResolveInput {
  goalType: string;
  intentParams?: string;
  botPosition: { x: number; y: number; z: number };
  /** Current time (injectable for testing) */
  now?: number;
  /** Reference to the Goal.id that spawned this task (if goal-driven) */
  goalId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Score above which an existing non-terminal task is continued */
export const CONTINUE_THRESHOLD = 0.6;

/** Score above which a completed task is checked for satisfaction */
export const SATISFACTION_CHECK_THRESHOLD = 0.3;

/** Distance in blocks at which proximity score decays to 0 */
export const PROXIMITY_MAX_DISTANCE = 128;

/** Recency bonus window in milliseconds (30 minutes) */
export const RECENCY_WINDOW_MS = 30 * 60 * 1000;

/** Recency bonus value when lastWorkedAt is within window */
export const RECENCY_BONUS = 0.1;

// ---------------------------------------------------------------------------
// Non-terminal status set
// ---------------------------------------------------------------------------

const NON_TERMINAL_STATUSES = new Set<Task['status']>([
  'pending',
  'pending_planning',
  'active',
  'paused',
  'unplannable',
]);

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Compute weighted total from score components */
function computeTotal(b: Omit<ScoreBreakdown, 'total'>): number {
  // keyMatch alone must exceed CONTINUE_THRESHOLD (0.6) because a goalKey
  // match is deterministic identity evidence — if the key matches, this IS
  // the same goal regardless of proximity/progress/recency.
  return (
    b.keyMatch * 0.65 +       // goalKey match is deterministic identity evidence
    b.anchorMatch * 0.15 +    // siteSignature match
    b.proximity * 0.1 +       // distance decay
    b.progress * 0.05 +       // prefer advanced builds
    b.recency                  // bonus (0 or 0.1)
  );
}

/**
 * Compute a match score for a candidate task against the resolve input.
 * Pure function — no side effects.
 */
export function scoreCandidate(
  task: Task,
  binding: GoalBinding,
  input: ResolveInput,
): ScoreBreakdown {
  const now = input.now ?? Date.now();

  // Anchor match: exact siteSignature match → 1.0
  let anchorMatch = 0;
  if (binding.anchors.siteSignature) {
    const sig = binding.anchors.siteSignature;
    const bot = input.botPosition;
    const refMatch =
      sig.refCorner.x === bot.x &&
      sig.refCorner.y === bot.y &&
      sig.refCorner.z === bot.z;
    // Exact position match is rare; treat site existence as partial match
    anchorMatch = refMatch ? 1.0 : 0.3;
  }

  // Proximity: distance to siteSignature.position → 1.0 at 0m, 0.0 at PROXIMITY_MAX_DISTANCE
  let proximity = 0;
  if (binding.anchors.siteSignature) {
    const pos = binding.anchors.siteSignature.position;
    const dx = pos.x - input.botPosition.x;
    const dy = pos.y - input.botPosition.y;
    const dz = pos.z - input.botPosition.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    proximity = Math.max(0, 1 - distance / PROXIMITY_MAX_DISTANCE);
  } else if (binding.anchors.regionHint) {
    // Provisional: use regionHint
    const hint = binding.anchors.regionHint;
    const dx = hint.x - input.botPosition.x;
    const dy = hint.y - input.botPosition.y;
    const dz = hint.z - input.botPosition.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    proximity = Math.max(0, 1 - distance / PROXIMITY_MAX_DISTANCE);
  }

  // Progress: moduleCursor / totalModules (if build metadata exists)
  let progress = 0;
  const buildMeta = (task.metadata as any).build;
  if (buildMeta && typeof buildMeta.moduleCursor === 'number') {
    const total = buildMeta.totalModules ?? 1;
    progress = total > 0 ? buildMeta.moduleCursor / total : 0;
  } else {
    // Fallback: use task.progress
    progress = task.progress;
  }

  // Recency: lastWorkedAt within window → bonus
  let recency = 0;
  const lastWorked = task.metadata.startedAt ?? task.metadata.createdAt;
  if (now - lastWorked < RECENCY_WINDOW_MS) {
    recency = RECENCY_BONUS;
  }

  // keyMatch is set externally by findCandidates (0 here, boosted if goalKey matches)
  const keyMatch = 0;

  const total = computeTotal({ keyMatch, anchorMatch, proximity, progress, recency });

  return { keyMatch, anchorMatch, proximity, progress, recency, total };
}

// ---------------------------------------------------------------------------
// Candidate search
// ---------------------------------------------------------------------------

/**
 * Find candidate tasks that might match the incoming intent.
 * Returns all goal-bound tasks of the same goalType with non-zero score.
 */
export function findCandidates(
  tasks: Task[],
  input: ResolveInput,
): ResolveCandidate[] {
  const provisionalKey = computeProvisionalKey({
    goalType: input.goalType,
    intentParams: input.intentParams,
    botPosition: input.botPosition,
  });

  const candidates: ResolveCandidate[] = [];

  for (const task of tasks) {
    const binding = task.metadata.goalBinding as GoalBinding | undefined;
    if (!binding) continue;
    if (binding.goalType !== input.goalType) continue;

    // Check key match (exact or alias)
    const hasKeyMatch =
      binding.goalKey === provisionalKey ||
      binding.goalKeyAliases.includes(provisionalKey);

    const breakdown = scoreCandidate(task, binding, input);

    // Boost keyMatch component if goalKey matches
    if (hasKeyMatch) {
      breakdown.keyMatch = 1.0;
      breakdown.total = computeTotal(breakdown);
    }

    if (breakdown.total > 0 || hasKeyMatch) {
      candidates.push({ task, binding, score: breakdown.total, breakdown });
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

// ---------------------------------------------------------------------------
// Spatial scope for "already satisfied"
// ---------------------------------------------------------------------------

/** Provisional scope: 32m radius from bot position */
export const PROVISIONAL_SCOPE_RADIUS = 32;

/**
 * Check if a completed task is within spatial scope for satisfaction.
 */
export function isWithinSatisfactionScope(
  binding: GoalBinding,
  botPosition: { x: number; y: number; z: number },
): boolean {
  if (binding.anchors.siteSignature) {
    // Anchored: footprintBounds + 8 block margin
    const bounds = binding.anchors.siteSignature.footprintBounds;
    const margin = 8;
    return (
      botPosition.x >= bounds.min.x - margin &&
      botPosition.x <= bounds.max.x + margin &&
      botPosition.y >= bounds.min.y - margin &&
      botPosition.y <= bounds.max.y + margin &&
      botPosition.z >= bounds.min.z - margin &&
      botPosition.z <= bounds.max.z + margin
    );
  }

  // Provisional: 32m radius from regionHint or creation-time position
  if (binding.anchors.regionHint) {
    const hint = binding.anchors.regionHint;
    const dx = hint.x - botPosition.x;
    const dy = hint.y - botPosition.y;
    const dz = hint.z - botPosition.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return dist <= PROVISIONAL_SCOPE_RADIUS;
  }

  // No anchor data: can't determine scope → not satisfied
  return false;
}

// ---------------------------------------------------------------------------
// Dry resolve (scoring only, no mutation)
// ---------------------------------------------------------------------------

/**
 * Resolve incoming intent to an outcome WITHOUT mutating anything.
 * Caller must handle the outcome (continue, already_satisfied, create).
 *
 * @param allTasks - All tasks in the store
 * @param input - Resolve input (goalType, position, etc.)
 * @param isStillSatisfied - Optional verifier callback for completed candidates.
 *   Called only when a completed task is within spatial scope.
 *   If not provided, completed tasks are never marked "already satisfied."
 */
export function resolveGoalDry(
  allTasks: Task[],
  input: ResolveInput,
  isStillSatisfied?: (task: Task) => boolean,
): ResolveOutcome {
  const candidates = findCandidates(allTasks, input);

  // Check non-terminal candidates first
  for (const candidate of candidates) {
    if (!NON_TERMINAL_STATUSES.has(candidate.task.status)) continue;
    if (candidate.score > CONTINUE_THRESHOLD) {
      return {
        action: 'continue',
        taskId: candidate.task.id,
        score: candidate.score,
        breakdown: candidate.breakdown,
      };
    }
  }

  // Check completed candidates for satisfaction
  if (isStillSatisfied) {
    for (const candidate of candidates) {
      if (candidate.task.status !== 'completed') continue;
      if (candidate.score < SATISFACTION_CHECK_THRESHOLD) continue;

      // Spatial scope check
      if (!isWithinSatisfactionScope(candidate.binding, input.botPosition)) {
        continue;
      }

      if (isStillSatisfied(candidate.task)) {
        return {
          action: 'already_satisfied',
          taskId: candidate.task.id,
          score: candidate.score,
        };
      }
    }
  }

  // No match — create new
  const goalKey = computeProvisionalKey({
    goalType: input.goalType,
    intentParams: input.intentParams,
    botPosition: input.botPosition,
  });

  return { action: 'create', goalKey };
}

// ---------------------------------------------------------------------------
// Atomic resolve-or-create
// ---------------------------------------------------------------------------

export type AtomicResolveOutcome =
  | { action: 'continue'; taskId: string; score: number; breakdown: ScoreBreakdown }
  | { action: 'already_satisfied'; taskId: string; score: number }
  | { action: 'created'; taskId: string; goalInstanceId: string; goalKey: string };

export interface GoalResolverDeps {
  /**
   * Return all tasks in the store.
   * Called inside the mutex so it sees the latest state.
   */
  getAllTasks: () => Task[];

  /**
   * Persist a new task to the store.
   * The resolver builds the Task object; this callback stores it.
   * Returns the stored task (may have been enriched by the store).
   */
  storeTask: (task: Task) => Task;

  /**
   * Generate a unique task ID.
   */
  generateTaskId: () => string;

  /**
   * Generate a unique goal instance ID (UUID).
   */
  generateInstanceId: () => string;

  /**
   * Optional: completion verifier for "already satisfied" checks.
   * Called only for completed candidates within spatial scope.
   */
  isStillSatisfied?: (task: Task) => boolean;
}

/**
 * Atomic goal resolver.
 *
 * Holds a per-goalKey mutex to enforce the uniqueness invariant:
 * "at most one non-terminal task per (goalType, goalKey)."
 *
 * Intended to be a singleton per process.
 */
export class GoalResolver {
  private mutex = new KeyedMutex();

  /**
   * Resolve incoming intent atomically.
   *
   * Under the mutex for the computed goalKey:
   * 1. Run dry resolution against current store state
   * 2. If "continue" or "already_satisfied" → return immediately
   * 3. If "create" → build task with goalBinding, persist, return
   *
   * Concurrent calls with the same goalKey are serialized.
   * Different goalKeys run concurrently.
   */
  async resolveOrCreate(
    input: ResolveInput & { verifier?: string },
    deps: GoalResolverDeps,
  ): Promise<AtomicResolveOutcome> {
    const goalKey = computeProvisionalKey({
      goalType: input.goalType,
      intentParams: input.intentParams,
      botPosition: input.botPosition,
    });

    return withKeyLock(this.mutex, goalKey, () => {
      const allTasks = deps.getAllTasks();

      const dryResult = resolveGoalDry(allTasks, input, deps.isStillSatisfied);

      if (dryResult.action === 'continue') {
        // Backfill policy: do NOT retroactively set goalId on existing bindings.
        // The existing task's binding is authoritative. Log a warning if caller
        // provides goalId but the continued task's binding lacks it.
        if (input.goalId) {
          const existingTask = allTasks.find(t => t.id === dryResult.taskId);
          const existingBinding = existingTask?.metadata?.goalBinding as GoalBinding | undefined;
          if (existingBinding && existingBinding.goalId === undefined) {
            console.warn(
              `[GoalResolver] continuing task ${dryResult.taskId} but goalId not set on existing binding`,
            );
          }
        }
        return dryResult;
      }

      if (dryResult.action === 'already_satisfied') {
        return dryResult;
      }

      // Create new task with goalBinding
      const instanceId = deps.generateInstanceId();
      const taskId = deps.generateTaskId();

      const binding = createGoalBinding({
        goalInstanceId: instanceId,
        goalType: input.goalType,
        provisionalKey: dryResult.goalKey,
        verifier: input.verifier ?? 'verify_shelter_v0',
        goalId: input.goalId,
      });

      const now = Date.now();
      const task: Task = {
        id: taskId,
        title: `Build: ${input.goalType}`,
        description: `Goal-bound task for ${input.goalType}`,
        type: 'building',
        priority: 0.5,
        urgency: 0.5,
        progress: 0,
        status: 'pending',
        source: 'goal',
        steps: [],
        parameters: {},
        metadata: {
          createdAt: now,
          updatedAt: now,
          retryCount: 0,
          maxRetries: 3,
          childTaskIds: [],
          tags: [],
          category: 'building',
          goalBinding: binding,
        },
      };

      deps.storeTask(task);

      return {
        action: 'created' as const,
        taskId,
        goalInstanceId: instanceId,
        goalKey: dryResult.goalKey,
      };
    });
  }
}
