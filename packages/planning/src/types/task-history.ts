/**
 * Task History Types — Prompt-Safe Contract
 *
 * Narrow shape for task history consumed by thought generation and memory context.
 * Captures intention + status + outcome + recency without full task payloads.
 *
 * Invariants:
 * - TASK-HIST-1: Provenance is recorded (source, fetchedAt, latency, cacheHit).
 * - TASK-HIST-2: No full logs/traces in prompt; only summary fields.
 * - TASK-HIST-3: Stable sorting on the producing side (updatedAt DESC, id DESC).
 *
 * @see docs-status/architecture-decisions.md DR-H9
 * @author @darianrosebrook
 */

export type TaskHistoryStatus =
  | 'pending'
  | 'pending_planning'
  | 'active'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled'
  | 'unplannable'
  | 'unknown';

export interface RecentTaskItem {
  id: string;
  title?: string;
  goal?: string;
  status: TaskHistoryStatus;

  /** epoch ms */
  createdAt?: number;
  updatedAt?: number;
  startedAt?: number;
  finishedAt?: number;

  /** Short, prompt-safe summaries */
  outcomeSummary?: string;
  errorSummary?: string;
  attemptCount?: number;

  /** Stable provenance hook (content-addressed bundle id, if available) */
  evidenceRef?: string;
}

/**
 * Provenance base fields shared by all variants.
 */
interface ProvenanceBase {
  fetchedAtMs: number;
  latencyMs: number;
  limit: number;
  cacheHit: boolean;
}

/**
 * Success provenance — source attempted and returned data.
 */
export interface TaskHistoryProvenanceOk extends ProvenanceBase {
  source: 'planning_direct' | 'planning_http';
  taskCount: number;
  error?: undefined;
}

/**
 * Failure provenance — source attempted but failed.
 * `source` tells you *what was attempted* (not "none").
 */
export interface TaskHistoryProvenanceFail extends ProvenanceBase {
  source: 'planning_direct' | 'planning_http' | 'none';
  error: string;
  taskCount?: undefined;
}

export type TaskHistoryProvenance = TaskHistoryProvenanceOk | TaskHistoryProvenanceFail;

export type TaskHistorySnapshot =
  | {
      ok: true;
      tasks: RecentTaskItem[];
      provenance: TaskHistoryProvenanceOk;
    }
  | {
      ok: false;
      tasks: [];
      provenance: TaskHistoryProvenanceFail;
    };
