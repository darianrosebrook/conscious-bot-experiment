/**
 * TaskIngestionLogger — unified structured logging for all task creation paths.
 *
 * Emits `[TaskIngestion]` JSON lines for every task birth, regardless of source.
 * Only IDs, booleans, and enum-ish strings. Never logs content or free-form text.
 *
 * The thought-to-task converter emits BOTH its existing `[Thought→Task]` log
 * (richer, converter-specific) AND this `[TaskIngestion]` log (uniform stream).
 *
 * @author @darianrosebrook
 */

// ---------------------------------------------------------------------------
// Source enum
// ---------------------------------------------------------------------------

export type TaskIngestionSource =
  | 'thought_converter'
  | 'http_post_task'
  | 'http_post_goal'
  | 'reflex_registry'
  | 'cognitive_reflection'
  | 'crafting_table_subtask'
  | 'resource_gathering_subtask'
  | 'complex_crafting_subtask'
  | 'executor_explore_subtask'
  | 'mcp_explore_subtask';

// ---------------------------------------------------------------------------
// Event shape
// ---------------------------------------------------------------------------

export interface TaskIngestionEvent {
  _diag_version: 1;
  source: TaskIngestionSource;
  task_id?: string;
  parent_task_id?: string;
  decision: 'created' | 'deduped' | 'rejected' | 'error';
  reason?: string;
  task_type?: string;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export function logTaskIngestion(event: TaskIngestionEvent): void {
  console.log('[TaskIngestion]', JSON.stringify(event));
}
