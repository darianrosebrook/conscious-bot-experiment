/**
 * Task History Provider — Contract Tests
 *
 * Proves:
 * 1. DirectTaskHistoryProvider: dedup, sorting, cap, prompt-safe mapping
 * 2. normalizeTaskStatus: single-authority mapping for every internal status
 * 3. HttpTaskHistoryProvider: cache TTL, Zod validation, non-2xx error paths
 * 4. NullTaskHistoryProvider: bootstrap guard provenance
 *
 * @see docs-status/architecture-decisions.md DR-H9
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DirectTaskHistoryProvider,
  HttpTaskHistoryProvider,
  NullTaskHistoryProvider,
  normalizeTaskStatus,
  bestUpdatedAtMs,
  type TaskSource,
} from '../task-history-provider';
import type { Task } from '../types/task';
import type { TaskHistoryProvider } from '../task-history-provider';

// ============================================================================
// Helpers — minimal Task factory
// ============================================================================

let _idCounter = 0;

function makeTask(overrides: Partial<Task> & { id?: string; status?: Task['status'] } = {}): Task {
  _idCounter++;
  const id = overrides.id ?? `task-${String(_idCounter).padStart(3, '0')}`;
  return {
    id,
    title: overrides.title ?? `Task ${id}`,
    description: overrides.description ?? '',
    type: overrides.type ?? 'gather',
    priority: overrides.priority ?? 5,
    urgency: overrides.urgency ?? 5,
    progress: overrides.progress ?? 0,
    status: overrides.status ?? 'active',
    source: overrides.source ?? 'planner',
    steps: overrides.steps ?? [],
    parameters: overrides.parameters ?? {},
    metadata: {
      createdAt: Date.now() - 60_000,
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: [],
      category: 'default',
      ...overrides.metadata,
    },
  };
}

function makeTaskSource(tasks: {
  active?: Task[];
  completed?: Task[];
  failed?: Task[];
}): TaskSource {
  const active = tasks.active ?? [];
  const completed = tasks.completed ?? [];
  const failed = tasks.failed ?? [];

  return {
    getActiveTasks: () => active,
    getTasks: (filters?: { status?: Task['status']; limit?: number }) => {
      if (filters?.status === 'completed') return completed.slice(0, filters.limit);
      if (filters?.status === 'failed') return failed.slice(0, filters.limit);
      return [...active, ...completed, ...failed].slice(0, filters?.limit);
    },
  };
}

// ============================================================================
// 1. normalizeTaskStatus — single-authority status mapping
// ============================================================================

describe('normalizeTaskStatus', () => {
  it('maps every known internal status to itself', () => {
    const known: Task['status'][] = [
      'pending',
      'pending_planning',
      'active',
      'completed',
      'failed',
      'paused',
      'unplannable',
    ];
    for (const s of known) {
      expect(normalizeTaskStatus(s)).toBe(s);
    }
  });

  it('maps undefined to unknown', () => {
    expect(normalizeTaskStatus(undefined)).toBe('unknown');
  });

  it('maps empty string to unknown', () => {
    expect(normalizeTaskStatus('')).toBe('unknown');
  });

  it('maps unrecognized strings to unknown', () => {
    expect(normalizeTaskStatus('bogus_status')).toBe('unknown');
    expect(normalizeTaskStatus('COMPLETED')).toBe('unknown'); // case-sensitive
    expect(normalizeTaskStatus('Active')).toBe('unknown');
  });
});

// ============================================================================
// 2. DirectTaskHistoryProvider — dedup, sorting, cap, prompt-safe mapping
// ============================================================================

describe('DirectTaskHistoryProvider', () => {
  beforeEach(() => {
    _idCounter = 0;
  });

  it('deduplicates tasks that appear in both active and completed', async () => {
    const shared = makeTask({ id: 'dup-1', status: 'active' });
    const source = makeTaskSource({
      active: [shared],
      completed: [{ ...shared, status: 'completed' }],
    });

    const provider = new DirectTaskHistoryProvider(source, 0);
    const snap = await provider.getRecent(10);

    expect(snap.ok).toBe(true);
    const ids = snap.tasks.map((t) => t.id);
    // Should appear exactly once (active wins since it's first in concat order)
    expect(ids.filter((id) => id === 'dup-1')).toHaveLength(1);
  });

  it('sorts by bestUpdatedAt DESC with stable id tiebreak', async () => {
    const now = Date.now();
    const tasks = [
      makeTask({ id: 'a', metadata: { createdAt: now - 1000, updatedAt: now - 500, retryCount: 0, maxRetries: 3, childTaskIds: [], tags: [], category: 'default' } }),
      makeTask({ id: 'c', metadata: { createdAt: now - 1000, updatedAt: now, retryCount: 0, maxRetries: 3, childTaskIds: [], tags: [], category: 'default' } }),
      makeTask({ id: 'b', metadata: { createdAt: now - 1000, updatedAt: now - 500, retryCount: 0, maxRetries: 3, childTaskIds: [], tags: [], category: 'default' } }),
    ];

    const source = makeTaskSource({ active: tasks });
    const provider = new DirectTaskHistoryProvider(source, 0);
    const snap = await provider.getRecent(10);

    expect(snap.ok).toBe(true);
    // 'c' has newest updatedAt → first
    // 'b' and 'a' tie on updatedAt → sort id DESC → 'b' before 'a'
    expect(snap.tasks.map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });

  it('uses timestamp fallback chain when updatedAt is missing', async () => {
    const now = Date.now();
    // Task with only completedAt set (no updatedAt)
    const t1 = makeTask({
      id: 'fallback-1',
      status: 'completed',
      metadata: {
        createdAt: now - 5000,
        updatedAt: undefined as any,
        completedAt: now - 100,
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'default',
      },
    });
    // Task with only createdAt
    const t2 = makeTask({
      id: 'fallback-2',
      metadata: {
        createdAt: now - 3000,
        updatedAt: undefined as any,
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'default',
      },
    });

    const source = makeTaskSource({ active: [t1, t2] });
    const provider = new DirectTaskHistoryProvider(source, 0);
    const snap = await provider.getRecent(10);

    expect(snap.ok).toBe(true);
    // t1 fallback: completedAt=now-100 > t2 fallback: createdAt=now-3000
    expect(snap.tasks[0].id).toBe('fallback-1');
    expect(snap.tasks[1].id).toBe('fallback-2');
  });

  it('caps results at limit and never exceeds 50', async () => {
    const tasks = Array.from({ length: 60 }, (_, i) =>
      makeTask({ id: `cap-${String(i).padStart(3, '0')}` }),
    );

    const source = makeTaskSource({ active: tasks });
    const provider = new DirectTaskHistoryProvider(source, 0);

    // Request 100 → should cap at 50
    const snap100 = await provider.getRecent(100);
    expect(snap100.ok).toBe(true);
    expect(snap100.tasks.length).toBeLessThanOrEqual(50);

    // Request 5 → should return 5
    const snap5 = await provider.getRecent(5);
    expect(snap5.ok).toBe(true);
    expect(snap5.tasks.length).toBe(5);
  });

  it('maps task fields to prompt-safe shape', async () => {
    const now = Date.now();
    const task = makeTask({
      id: 'map-test',
      title: 'A'.repeat(200), // Should be truncated to 120
      status: 'completed',
      steps: [{ id: 'step-1', label: 'Final step label', status: 'completed', action: { type: 'gather' as any, parameters: {} }, order: 0 }],
      metadata: {
        createdAt: now - 5000,
        updatedAt: now,
        startedAt: now - 3000,
        completedAt: now - 100,
        retryCount: 2,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'default',
        solver: { stepsDigest: 'abc123' },
      },
    });

    const source = makeTaskSource({ completed: [task] });
    const provider = new DirectTaskHistoryProvider(source, 0);
    const snap = await provider.getRecent(10);

    expect(snap.ok).toBe(true);
    const item = snap.tasks[0];
    expect(item.id).toBe('map-test');
    expect(item.title?.length).toBeLessThanOrEqual(120);
    expect(item.status).toBe('completed');
    expect(item.outcomeSummary).toBe('Final step label');
    expect(item.attemptCount).toBe(2);
    expect(item.evidenceRef).toBe('abc123');
    expect(item.createdAt).toBe(now - 5000);
    expect(item.updatedAt).toBe(now);
    expect(item.startedAt).toBe(now - 3000);
    expect(item.finishedAt).toBe(now - 100);
  });

  it('maps failed tasks with error summary', async () => {
    const task = makeTask({
      id: 'fail-test',
      status: 'failed',
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'default',
        failureError: { message: 'Connection timeout after 5000ms' },
        failureCode: 'timeout',
      },
    });

    const source = makeTaskSource({ failed: [task] });
    const provider = new DirectTaskHistoryProvider(source, 0);
    const snap = await provider.getRecent(10);

    expect(snap.ok).toBe(true);
    const item = snap.tasks[0];
    expect(item.status).toBe('failed');
    expect(item.errorSummary).toBe('Connection timeout after 5000ms');
  });

  it('normalizes unknown statuses to "unknown" in mapped items', async () => {
    // Force a task with a status not in the known set
    const task = makeTask({ id: 'bogus' });
    (task as any).status = 'BOGUS_STATUS';

    const source = makeTaskSource({ active: [task] });
    const provider = new DirectTaskHistoryProvider(source, 0);
    const snap = await provider.getRecent(10);

    expect(snap.ok).toBe(true);
    expect(snap.tasks[0].status).toBe('unknown');
  });

  it('records provenance correctly', async () => {
    const source = makeTaskSource({
      active: [makeTask({ id: 'prov-1' })],
    });
    const provider = new DirectTaskHistoryProvider(source, 0);
    const snap = await provider.getRecent(10);

    expect(snap.ok).toBe(true);
    if (snap.ok) {
      expect(snap.provenance.source).toBe('planning_direct');
      expect(snap.provenance.cacheHit).toBe(false);
      expect(snap.provenance.taskCount).toBe(1);
      expect(snap.provenance.latencyMs).toBeGreaterThanOrEqual(0);
      expect(snap.provenance.fetchedAtMs).toBeGreaterThan(0);
    }
  });

  it('returns cache hit on repeated calls within TTL', async () => {
    const source = makeTaskSource({ active: [makeTask()] });
    const provider = new DirectTaskHistoryProvider(source, 5000); // 5s TTL

    const snap1 = await provider.getRecent(10);
    const snap2 = await provider.getRecent(10);

    expect(snap1.provenance.cacheHit).toBe(false);
    expect(snap2.provenance.cacheHit).toBe(true);
  });

  it('error paths record planning_direct source, not none', async () => {
    const source: TaskSource = {
      getActiveTasks: () => {
        throw new Error('DB connection lost');
      },
      getTasks: () => [],
    };

    const provider = new DirectTaskHistoryProvider(source, 0);
    const snap = await provider.getRecent(10);

    expect(snap.ok).toBe(false);
    if (!snap.ok) {
      expect(snap.provenance.source).toBe('planning_direct');
      expect(snap.provenance.error).toContain('DB connection lost');
    }
  });
});

// ============================================================================
// 3. HttpTaskHistoryProvider — cache, Zod validation, error paths
// ============================================================================

describe('HttpTaskHistoryProvider', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('parses valid 2xx response with Zod schema', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tasks: [
            { id: 't1', status: 'completed', title: 'Test task' },
            { id: 't2', status: 'active' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const provider = new HttpTaskHistoryProvider('http://localhost:3002', 0);
    const snap = await provider.getRecent(10);

    expect(snap.ok).toBe(true);
    expect(snap.tasks).toHaveLength(2);
    expect(snap.tasks[0].id).toBe('t1');
    if (snap.ok) {
      expect(snap.provenance.source).toBe('planning_http');
      expect(snap.provenance.cacheHit).toBe(false);
    }
  });

  it('does NOT Zod-parse on non-2xx responses (Fix 5)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const provider = new HttpTaskHistoryProvider('http://localhost:3002', 0);
    const snap = await provider.getRecent(10);

    expect(snap.ok).toBe(false);
    if (!snap.ok) {
      expect(snap.provenance.source).toBe('planning_http');
      expect(snap.provenance.error).toContain('HTTP 500');
    }
  });

  it('returns Zod error on malformed JSON response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ wrongShape: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const provider = new HttpTaskHistoryProvider('http://localhost:3002', 0);
    const snap = await provider.getRecent(10);

    expect(snap.ok).toBe(false);
    if (!snap.ok) {
      expect(snap.provenance.error).toContain('Invalid schema');
      expect(snap.provenance.source).toBe('planning_http');
    }
  });

  it('handles network errors (fetch throws)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const provider = new HttpTaskHistoryProvider('http://localhost:3002', 0);
    const snap = await provider.getRecent(10);

    expect(snap.ok).toBe(false);
    if (!snap.ok) {
      expect(snap.provenance.source).toBe('planning_http');
      expect(snap.provenance.error).toContain('ECONNREFUSED');
    }
  });

  it('respects cache TTL', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ tasks: [{ id: 't1', status: 'active' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const provider = new HttpTaskHistoryProvider('http://localhost:3002', 5000);
    const snap1 = await provider.getRecent(10);
    const snap2 = await provider.getRecent(10);

    expect(snap1.provenance.cacheHit).toBe(false);
    expect(snap2.provenance.cacheHit).toBe(true);
    // Only one actual fetch call despite two getRecent calls
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('caps limit to 50 in URL', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ tasks: [] }), { status: 200 }),
    );

    const provider = new HttpTaskHistoryProvider('http://localhost:3002', 0);
    await provider.getRecent(999);

    const calledUrl = (fetchSpy.mock.calls[0][0] as string);
    expect(calledUrl).toContain('limit=50');
  });
});

// ============================================================================
// 4. NullTaskHistoryProvider — bootstrap guard
// ============================================================================

describe('NullTaskHistoryProvider', () => {
  it('returns ok:false with source:none and error message', async () => {
    const provider = new NullTaskHistoryProvider();
    const snap = await provider.getRecent(10);

    expect(snap.ok).toBe(false);
    if (!snap.ok) {
      expect(snap.provenance.source).toBe('none');
      expect(snap.provenance.error).toContain('not configured');
      expect(snap.provenance.cacheHit).toBe(true);
      expect(snap.tasks).toEqual([]);
    }
  });
});

// ============================================================================
// 5. Bootstrap guard — instanceof discrimination (no false positives)
// ============================================================================

describe('Bootstrap guard: instanceof discrimination', () => {
  it('NullTaskHistoryProvider IS instanceof NullTaskHistoryProvider', () => {
    const provider: TaskHistoryProvider = new NullTaskHistoryProvider();
    expect(provider instanceof NullTaskHistoryProvider).toBe(true);
  });

  it('HttpTaskHistoryProvider is NOT instanceof NullTaskHistoryProvider', () => {
    const provider: TaskHistoryProvider = new HttpTaskHistoryProvider('http://localhost:3002');
    expect(provider instanceof NullTaskHistoryProvider).toBe(false);
  });

  it('DirectTaskHistoryProvider is NOT instanceof NullTaskHistoryProvider', () => {
    const source = makeTaskSource({ active: [] });
    const provider: TaskHistoryProvider = new DirectTaskHistoryProvider(source);
    expect(provider instanceof NullTaskHistoryProvider).toBe(false);
  });

  it('HTTP failure provenance does NOT match NullProvider identity', async () => {
    // This proves that an HTTP failure won't trigger the bootstrap warning,
    // because the guard uses instanceof, not provenance.source.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const httpProvider = new HttpTaskHistoryProvider('http://localhost:3002', 0);
    const snap = await httpProvider.getRecent(10);

    // The provenance says 'planning_http' with an error...
    expect(snap.ok).toBe(false);
    if (!snap.ok) {
      expect(snap.provenance.source).toBe('planning_http');
      expect(snap.provenance.error).toBeTruthy();
    }
    // ...but the provider is NOT a NullTaskHistoryProvider
    expect(httpProvider instanceof NullTaskHistoryProvider).toBe(false);

    fetchSpy.mockRestore();
  });
});

// ============================================================================
// 6. bestUpdatedAtMs — timestamp fallback chain
// ============================================================================

describe('bestUpdatedAtMs', () => {
  it('returns updatedAt when present', () => {
    expect(bestUpdatedAtMs({ updatedAt: 1000 })).toBe(1000);
  });

  it('falls back to completedAt when updatedAt missing', () => {
    expect(bestUpdatedAtMs({ completedAt: 2000 })).toBe(2000);
  });

  it('falls back to startedAt when updatedAt and completedAt missing', () => {
    expect(bestUpdatedAtMs({ startedAt: 3000 })).toBe(3000);
  });

  it('falls back to createdAt as last resort', () => {
    expect(bestUpdatedAtMs({ createdAt: 4000 })).toBe(4000);
  });

  it('returns 0 for undefined/null metadata', () => {
    expect(bestUpdatedAtMs(undefined)).toBe(0);
    expect(bestUpdatedAtMs({})).toBe(0);
  });

  it('converts string timestamps to numbers', () => {
    expect(bestUpdatedAtMs({ updatedAt: '5000' })).toBe(5000);
  });

  it('returns 0 for NaN/non-finite values', () => {
    expect(bestUpdatedAtMs({ updatedAt: NaN })).toBe(0);
    expect(bestUpdatedAtMs({ updatedAt: Infinity })).toBe(0);
    expect(bestUpdatedAtMs({ updatedAt: 'not-a-number' })).toBe(0);
  });

  it('treats 0 as a valid timestamp (does not skip to fallback)', () => {
    // This is the ?? vs || distinction — 0 is a valid epoch ms
    expect(bestUpdatedAtMs({ updatedAt: 0, completedAt: 999 })).toBe(0);
  });
});
