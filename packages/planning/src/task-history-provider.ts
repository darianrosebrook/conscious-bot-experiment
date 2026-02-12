/**
 * Task History Provider — Cached, Fail-Closed, Provenance-Rich
 *
 * Provides recent task history for thought generation and memory context.
 * Three implementations:
 * - DirectTaskHistoryProvider: in-process access to TaskIntegration (same package)
 * - HttpTaskHistoryProvider: cross-service HTTP access to planning endpoint
 * - NullTaskHistoryProvider: safe default when no planning source is configured
 *
 * Invariants:
 * - TASK-HIST-1: Provenance is always recorded, with attempted source (never misleading 'none').
 * - TASK-HIST-2: Prompt payloads are bounded (hard cap on tasks and field sizes).
 * - TASK-HIST-3: Stable sorting (updatedAt DESC, id DESC) with timestamp fallback chain.
 *
 * @see docs-status/architecture-decisions.md DR-H9
 * @author @darianrosebrook
 */

import { z } from 'zod';
import type { Task } from './types/task';
import type {
  RecentTaskItem,
  TaskHistorySnapshot,
} from './types/task-history';
import { normalizeTaskStatus, bestUpdatedAtMs } from './task-history-utils';

// Re-export so existing consumers (tests, endpoints) don't break
export { normalizeTaskStatus, bestUpdatedAtMs } from './task-history-utils';

// ============================================================================
// Interface
// ============================================================================

export interface TaskHistoryProvider {
  getRecent(limit: number, signal?: AbortSignal): Promise<TaskHistorySnapshot>;
}

// ============================================================================
// Null Provider (safe fallback)
// ============================================================================

export class NullTaskHistoryProvider implements TaskHistoryProvider {
  async getRecent(limit: number): Promise<TaskHistorySnapshot> {
    return {
      ok: false,
      tasks: [],
      provenance: {
        source: 'none',
        fetchedAtMs: Date.now(),
        latencyMs: 0,
        limit,
        cacheHit: true,
        error: 'Task history provider not configured',
      },
    };
  }
}

// ============================================================================
// Direct Provider (in-process, same package)
// ============================================================================

/**
 * Minimal interface for task source — avoids importing the full TaskIntegration
 * class, which has heavy dependencies. Satisfies the subset we need.
 */
export interface TaskSource {
  getActiveTasks(): Task[];
  getTasks(filters?: { status?: Task['status']; limit?: number }): Task[];
}

const MAX_TITLE = 120;
const MAX_SUMMARY = 200;

/**
 * Maps a full Task object to a prompt-safe RecentTaskItem.
 * Truncates strings to keep prompt payloads bounded.
 * Uses normalizeTaskStatus() for single-authority status mapping.
 */
function taskToRecentItem(task: Task): RecentTaskItem {
  const item: RecentTaskItem = {
    id: task.id,
    title: task.title?.slice(0, MAX_TITLE),
    status: normalizeTaskStatus(task.status),
    createdAt: task.metadata.createdAt,
    updatedAt: task.metadata.updatedAt,
    startedAt: task.metadata.startedAt,
    finishedAt: task.metadata.completedAt,
    attemptCount: task.metadata.retryCount,
  };

  // Derive outcome summary from status + steps
  if (task.status === 'completed') {
    const lastStep = task.steps[task.steps.length - 1];
    item.outcomeSummary = lastStep?.label?.slice(0, MAX_SUMMARY) || 'completed';
  } else if (task.status === 'failed') {
    item.errorSummary =
      task.metadata.failureError?.message?.slice(0, MAX_SUMMARY) ||
      task.metadata.failureCode ||
      'failed';
  }

  // Attach evidence ref if solver provenance exists
  if (task.metadata.solver?.stepsDigest) {
    item.evidenceRef = task.metadata.solver.stepsDigest;
  }

  return item;
}

export class DirectTaskHistoryProvider implements TaskHistoryProvider {
  private taskSource: TaskSource;
  private last?: { atMs: number; limit: number; snap: TaskHistorySnapshot };
  private ttlMs: number;

  constructor(taskSource: TaskSource, ttlMs = 1500) {
    this.taskSource = taskSource;
    this.ttlMs = ttlMs;
  }

  async getRecent(limit: number): Promise<TaskHistorySnapshot> {
    const now = Date.now();

    // Cache check
    if (this.last && now - this.last.atMs <= this.ttlMs && this.last.limit === limit) {
      const snap = this.last.snap;
      if (snap.ok) {
        return { ...snap, provenance: { ...snap.provenance, cacheHit: true } };
      }
      return { ...snap, provenance: { ...snap.provenance, cacheHit: true } };
    }

    const started = Date.now();

    try {
      // Combine active + recent completed/failed, sorted updatedAt DESC
      const active = this.taskSource.getActiveTasks();
      const completed = this.taskSource.getTasks({ status: 'completed', limit: limit * 2 });
      const failed = this.taskSource.getTasks({ status: 'failed', limit: limit });

      const all = [...active, ...completed, ...failed];

      // Deduplicate by id (active/completed may overlap during transition)
      const seen = new Set<string>();
      const deduped = all.filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });

      // Sort: bestUpdatedAt DESC, id DESC (stable tie-break) — TASK-HIST-3, Fix 3
      deduped.sort((a, b) => {
        const aUp = bestUpdatedAtMs(a.metadata);
        const bUp = bestUpdatedAtMs(b.metadata);
        if (aUp !== bUp) return bUp - aUp;
        return b.id.localeCompare(a.id);
      });

      // Cap and map to prompt-safe shape — TASK-HIST-2
      const cappedLimit = Math.min(limit, 50);
      const tasks = deduped.slice(0, cappedLimit).map(taskToRecentItem);

      const latencyMs = Date.now() - started;
      const snap: TaskHistorySnapshot = {
        ok: true,
        tasks,
        provenance: {
          source: 'planning_direct',
          fetchedAtMs: now,
          latencyMs,
          limit: cappedLimit,
          cacheHit: false,
          taskCount: tasks.length,
        },
      };

      this.last = { atMs: now, limit, snap };
      return snap;
    } catch (e) {
      const latencyMs = Date.now() - started;
      // Fix 1: source is 'planning_direct' (what was attempted), not 'none'
      const snap: TaskHistorySnapshot = {
        ok: false,
        tasks: [],
        provenance: {
          source: 'planning_direct',
          fetchedAtMs: now,
          latencyMs,
          limit,
          cacheHit: false,
          error: e instanceof Error ? e.message : String(e),
        },
      };
      this.last = { atMs: now, limit, snap };
      return snap;
    }
  }
}

// ============================================================================
// HTTP Provider (cross-service, for cognition or other consumers)
// ============================================================================

const RecentTaskItemSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  goal: z.string().optional(),
  status: z.string(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  outcomeSummary: z.string().optional(),
  errorSummary: z.string().optional(),
  attemptCount: z.number().optional(),
  evidenceRef: z.string().optional(),
});

const ResponseSchema = z.object({
  tasks: z.array(RecentTaskItemSchema),
});

export class HttpTaskHistoryProvider implements TaskHistoryProvider {
  private last?: { atMs: number; limit: number; snap: TaskHistorySnapshot };
  private ttlMs: number;

  constructor(
    private endpointBase: string,
    ttlMs = 1500
  ) {
    this.ttlMs = ttlMs;
  }

  async getRecent(limit: number, signal?: AbortSignal): Promise<TaskHistorySnapshot> {
    const now = Date.now();

    if (this.last && now - this.last.atMs <= this.ttlMs && this.last.limit === limit) {
      const snap = this.last.snap;
      if (snap.ok) {
        return { ...snap, provenance: { ...snap.provenance, cacheHit: true } };
      }
      return { ...snap, provenance: { ...snap.provenance, cacheHit: true } };
    }

    const started = Date.now();
    const cappedLimit = Math.min(limit, 50);
    const url = `${this.endpointBase.replace(/\/$/, '')}/tasks/recent?limit=${encodeURIComponent(
      String(cappedLimit)
    )}`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: signal || AbortSignal.timeout(3000),
      });

      const latencyMs = Date.now() - started;

      // Fix 5: On non-2xx, return error immediately. Do NOT attempt JSON/Zod parse.
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // Fix 1: source is 'planning_http' (what was attempted)
        const snap: TaskHistorySnapshot = {
          ok: false,
          tasks: [],
          provenance: {
            source: 'planning_http',
            fetchedAtMs: now,
            latencyMs,
            limit: cappedLimit,
            cacheHit: false,
            error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
          },
        };
        this.last = { atMs: now, limit, snap };
        return snap;
      }

      // Only Zod-parse on 2xx responses (Fix 5)
      const json = await res.json();
      const parsed = ResponseSchema.safeParse(json);
      if (!parsed.success) {
        const snap: TaskHistorySnapshot = {
          ok: false,
          tasks: [],
          provenance: {
            source: 'planning_http',
            fetchedAtMs: now,
            latencyMs,
            limit: cappedLimit,
            cacheHit: false,
            error: `Invalid schema: ${parsed.error.message.slice(0, 200)}`,
          },
        };
        this.last = { atMs: now, limit, snap };
        return snap;
      }

      const tasks = parsed.data.tasks.slice(0, cappedLimit) as RecentTaskItem[];
      const snap: TaskHistorySnapshot = {
        ok: true,
        tasks,
        provenance: {
          source: 'planning_http',
          fetchedAtMs: now,
          latencyMs,
          limit: cappedLimit,
          cacheHit: false,
          taskCount: tasks.length,
        },
      };
      this.last = { atMs: now, limit, snap };
      return snap;
    } catch (e) {
      const latencyMs = Date.now() - started;
      // Fix 1: source is 'planning_http' (what was attempted)
      const snap: TaskHistorySnapshot = {
        ok: false,
        tasks: [],
        provenance: {
          source: 'planning_http',
          fetchedAtMs: now,
          latencyMs,
          limit: cappedLimit,
          cacheHit: false,
          error: e instanceof Error ? e.message : String(e),
        },
      };
      this.last = { atMs: now, limit, snap };
      return snap;
    }
  }
}
