/**
 * Task History Utilities — Single-Authority Helpers
 *
 * Shared normalizers consumed by both:
 * - task-history-provider.ts (in-process DirectTaskHistoryProvider)
 * - planning-endpoints.ts (HTTP /tasks/recent endpoint)
 *
 * Having one definition prevents drift between the two code paths.
 *
 * @see docs-status/architecture-decisions.md DR-H9
 * @author @darianrosebrook
 */

import type { TaskHistoryStatus } from './types/task-history';

// ============================================================================
// Status normalization — single authority (TASK-HIST-1)
// ============================================================================

/** All known internal task statuses from Task['status'] in types/task.ts */
const STATUS_MAP: Record<string, TaskHistoryStatus> = {
  pending: 'pending',
  pending_planning: 'pending_planning',
  active: 'active',
  completed: 'completed',
  failed: 'failed',
  paused: 'paused',
  unplannable: 'unplannable',
};

/**
 * Single-authority status normalizer. Converts any internal task status
 * to the prompt-safe `TaskHistoryStatus` enum. Unknown statuses map to 'unknown'.
 */
export function normalizeTaskStatus(status: string | undefined): TaskHistoryStatus {
  if (!status) return 'unknown';
  return STATUS_MAP[status] ?? 'unknown';
}

// ============================================================================
// Timestamp normalization — fallback chain (TASK-HIST-3)
// ============================================================================

/**
 * Extract the best-available "last updated" epoch ms from a task's metadata.
 * Falls back through: updatedAt → completedAt → startedAt → createdAt → 0.
 * Normalizes to epoch ms (guards against undefined/NaN/string).
 *
 * Used for both sorting and emission — a task's emitted `updatedAt` should
 * be consistent with the value used to rank it.
 */
export function bestUpdatedAtMs(meta: Record<string, any> | undefined): number {
  if (!meta) return 0;
  const raw = meta.updatedAt ?? meta.completedAt ?? meta.startedAt ?? meta.createdAt ?? 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}
