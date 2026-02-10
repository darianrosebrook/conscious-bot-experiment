/**
 * GoalKey Queue Scan Guard — Explicit goalKey-based dedup at the injection boundary.
 *
 * Prevents two reflexes with the same goalKey from coexisting as outstanding tasks.
 * This is a separate, explicit check that runs BEFORE addTask(), distinct from
 * findSimilarTask() which uses title/requirement matching.
 *
 * TOCTOU note: In the current single-threaded tick loop, scan+enqueue is atomic.
 * If evaluation ever becomes concurrent, this guard should be promoted to an
 * in-process per-goalKey mutex.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Result Types
// ============================================================================

export type GoalKeyGuardResult =
  | { kind: 'clear' }
  | { kind: 'blocked'; existingTaskId: string; taskAge: number };

// ============================================================================
// Guard
// ============================================================================

/** Default staleness threshold: 5 minutes */
const DEFAULT_STALE_MS = 300_000;

/**
 * Scan pending + active tasks for a matching goalKey in task.metadata.goalKey.
 *
 * Returns `{ kind: 'clear' }` if no matching task exists or the matching task is stale.
 * Returns `{ kind: 'blocked'; existingTaskId; taskAge }` if a live task with the same goalKey exists.
 *
 * @param getTasks - Task store query function (dependency-injected)
 * @param goalKey - The content-addressed goal key to check for
 * @param opts.staleMs - If the matching task's age exceeds this, treat as clear (default: 5 minutes)
 * @param opts.onStaleEscape - Optional callback when a stale task is bypassed (for diagnostics)
 */
export function scanForOutstandingGoalKey(
  getTasks: (filters?: { status?: string[] }) => any[],
  goalKey: string,
  opts?: {
    staleMs?: number;
    onStaleEscape?: (taskId: string, age: number) => void;
  },
): GoalKeyGuardResult {
  const staleMs = opts?.staleMs ?? DEFAULT_STALE_MS;
  const now = Date.now();

  // Only check pending and active tasks — completed/failed tasks are not outstanding
  const outstandingTasks = getTasks({ status: ['pending', 'active'] });

  for (const task of outstandingTasks) {
    const taskGoalKey = task?.metadata?.goalKey;
    if (taskGoalKey !== goalKey) continue;

    // Found a matching task — check staleness
    const taskTimestamp = task.updatedAt ?? task.createdAt ?? task.metadata?.createdAt ?? 0;
    const age = now - taskTimestamp;

    if (age > staleMs) {
      // Stale task: allow bypass but warn
      opts?.onStaleEscape?.(task.id ?? 'unknown', age);
      return { kind: 'clear' };
    }

    return {
      kind: 'blocked',
      existingTaskId: task.id ?? 'unknown',
      taskAge: age,
    };
  }

  return { kind: 'clear' };
}
