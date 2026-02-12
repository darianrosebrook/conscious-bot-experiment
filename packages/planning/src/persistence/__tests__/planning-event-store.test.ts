import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock pg before any imports ───────────────────────────────────────
const mockPoolQuery = vi.fn();
const mockPoolConnectClient = { query: vi.fn(), release: vi.fn() };
const mockPoolConnect = vi.fn();
const mockPoolEnd = vi.fn();

const mockClientConnect = vi.fn();
const mockClientQuery = vi.fn();
const mockClientEnd = vi.fn();

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: mockPoolQuery,
    connect: mockPoolConnect,
    end: mockPoolEnd,
  })),
  Client: vi.fn().mockImplementation(() => ({
    connect: mockClientConnect,
    query: mockClientQuery,
    end: mockClientEnd,
  })),
}));

import { PlanningEventStore } from '../planning-event-store.js';
import type { Task } from '../../task-integration.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Mine diamonds',
    type: 'mine',
    description: 'Go mine some diamonds',
    priority: 0.5,
    urgency: 0.5,
    status: 'active',
    source: 'user',
    createdAt: 1000,
    completedAt: null,
    metadata: {},
    dependencies: [],
    progress: 0,
    parameters: {},
    ...overrides,
  } as Task;
}

function baseConfig() {
  return {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'pass',
    database: 'conscious_bot',
    worldSeed: '12345',
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('PlanningEventStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-setup default mock implementations after clearAllMocks
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockPoolConnectClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockPoolConnectClient.release.mockReturnValue(undefined);
    mockPoolConnect.mockResolvedValue(mockPoolConnectClient);
    mockPoolEnd.mockResolvedValue(undefined);

    mockClientConnect.mockResolvedValue(undefined);
    mockClientEnd.mockResolvedValue(undefined);
    // Default: database already exists
    mockClientQuery.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });
  });

  // ── Constructor ──────────────────────────────────────────────────

  it('throws if worldSeed is missing', () => {
    expect(() => new PlanningEventStore({ ...baseConfig(), worldSeed: '' })).toThrow(
      'worldSeed is required'
    );
  });

  it('throws if worldSeed is "0"', () => {
    expect(() => new PlanningEventStore({ ...baseConfig(), worldSeed: '0' })).toThrow(
      'worldSeed is required'
    );
  });

  it('computes seed database name correctly', async () => {
    const store = new PlanningEventStore(baseConfig());
    await store.initialize();
    const status = store.getStatus();
    expect(status.database).toBe('conscious_bot_seed_12345');
  });

  it('sanitizes negative seed (- → n)', async () => {
    const store = new PlanningEventStore({ ...baseConfig(), worldSeed: '-999' });
    await store.initialize();
    expect(store.getStatus().database).toBe('conscious_bot_seed_n999');
  });

  // ── Initialization ───────────────────────────────────────────────

  it('creates database if it does not exist', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // DB doesn't exist
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // CREATE DATABASE

    const store = new PlanningEventStore(baseConfig());
    await store.initialize();

    expect(mockClientQuery).toHaveBeenCalledWith(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      ['conscious_bot_seed_12345']
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      'CREATE DATABASE conscious_bot_seed_12345'
    );
    expect(store.getStatus().initialized).toBe(true);
  });

  it('skips database creation if it already exists', async () => {
    const store = new PlanningEventStore(baseConfig());
    await store.initialize();

    // Only the SELECT check, no CREATE
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
    expect(store.getStatus().initialized).toBe(true);
  });

  it('creates both tables during init', async () => {
    const store = new PlanningEventStore(baseConfig());
    await store.initialize();

    const ddlCalls = mockPoolConnectClient.query.mock.calls.map((c: any) => c[0]);

    expect(ddlCalls.some((sql: string) => sql.includes('task_events'))).toBe(true);
    expect(ddlCalls.some((sql: string) => sql.includes('task_snapshots'))).toBe(true);
    expect(mockPoolConnectClient.release).toHaveBeenCalled();
  });

  // ── Graceful degradation ─────────────────────────────────────────

  it('no-ops all writes when enabled: false', async () => {
    const store = new PlanningEventStore({ ...baseConfig(), enabled: false });
    await store.initialize();

    const status = store.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.initialized).toBe(false);
    expect(status.error).toBe('disabled');

    // Writes should silently no-op
    store.recordEvent('task_added', 'task-1', { task: makeTask() });
    store.updateSnapshot(makeTask());
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('no-ops all writes when init throws', async () => {
    mockClientConnect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const store = new PlanningEventStore(baseConfig());
    await store.initialize();

    const status = store.getStatus();
    expect(status.initialized).toBe(false);
    expect(status.error).toBe('ECONNREFUSED');

    // Writes should silently no-op
    store.recordEvent('task_added', 'task-1', { task: makeTask() });
    store.updateSnapshot(makeTask());
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  // ── Fire-and-forget writes ───────────────────────────────────────

  it('recordEvent inserts into task_events', async () => {
    const store = new PlanningEventStore(baseConfig());
    await store.initialize();

    const task = makeTask();
    store.recordEvent('task_added', 'task-1', { task });

    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO task_events'),
      ['task_added', 'task-1', JSON.stringify({ task }), '12345']
    );
  });

  it('updateSnapshot upserts into task_snapshots', async () => {
    const store = new PlanningEventStore(baseConfig());
    await store.initialize();

    const task = makeTask({ id: 'task-42', status: 'completed' });
    store.updateSnapshot(task);

    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO task_snapshots'),
      ['task-42', JSON.stringify(task), '12345', 'completed']
    );
  });

  it('recordEvent does not throw when DB write fails', async () => {
    const store = new PlanningEventStore(baseConfig());
    await store.initialize();

    mockPoolQuery.mockRejectedValueOnce(new Error('disk full'));

    // Should not throw
    store.recordEvent('task_added', 'task-1', { task: makeTask() });

    // Flush the microtask queue so the .catch handler runs
    await new Promise((r) => setTimeout(r, 0));
  });

  it('updateSnapshot does not throw when DB write fails', async () => {
    const store = new PlanningEventStore(baseConfig());
    await store.initialize();

    mockPoolQuery.mockRejectedValueOnce(new Error('disk full'));

    store.updateSnapshot(makeTask());

    await new Promise((r) => setTimeout(r, 0));
  });

  // ── Status endpoint shape ────────────────────────────────────────

  it('getStatus returns correct shape when initialized', async () => {
    const store = new PlanningEventStore(baseConfig());
    await store.initialize();

    const status = store.getStatus();
    expect(status).toEqual({
      enabled: true,
      initialized: true,
      error: null,
      database: 'conscious_bot_seed_12345',
    });
  });

  it('getStatus returns correct shape before init', () => {
    const store = new PlanningEventStore(baseConfig());
    const status = store.getStatus();
    expect(status).toEqual({
      enabled: true,
      initialized: false,
      error: null,
      database: null,
    });
  });

  // ── Cleanup ──────────────────────────────────────────────────────

  it('destroy ends the pool', async () => {
    const store = new PlanningEventStore(baseConfig());
    await store.initialize();
    await store.destroy();

    expect(mockPoolEnd).toHaveBeenCalled();
    expect(store.getStatus().initialized).toBe(false);
  });
});
