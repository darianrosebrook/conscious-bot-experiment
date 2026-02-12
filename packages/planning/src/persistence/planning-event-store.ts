import { Pool, Client } from 'pg';
import type { Task } from '../task-integration.js';
import type {
  TaskEventType,
  TaskEventPayload,
  PlanningEventStoreConfig,
  PlanningEventStoreStatus,
} from './planning-event-store-types.js';

export type { TaskEventType, TaskEventPayload, PlanningEventStoreConfig, PlanningEventStoreStatus };

/**
 * Append-only event store for task lifecycle persistence.
 *
 * Writes are fire-and-forget: they never block the SSE broadcast or executor
 * loop.  If PostgreSQL is unreachable the store degrades silently — all public
 * write methods swallow errors and log a warning.
 *
 * Gated behind `PLANNING_EVENT_STORE=1`.
 */
export class PlanningEventStore {
  private pool: Pool | null = null;
  private config: Required<PlanningEventStoreConfig>;
  private seedDatabase: string;
  private initialized = false;
  private initError: string | null = null;

  constructor(config: PlanningEventStoreConfig) {
    if (!config.worldSeed || config.worldSeed === '0') {
      throw new Error(
        'worldSeed is required and must be non-zero. Set the WORLD_SEED environment variable.'
      );
    }

    this.config = {
      host: config.host ?? 'localhost',
      port: config.port ?? 5432,
      user: config.user ?? 'postgres',
      password: config.password ?? '',
      database: config.database ?? 'conscious_bot',
      worldSeed: config.worldSeed,
      maxConnections: config.maxConnections ?? 5,
      enabled: config.enabled ?? true,
    };

    // Per-seed database name — matches memory package convention
    const sanitizedSeed = this.config.worldSeed.replace('-', 'n');
    this.seedDatabase = `${this.config.database}_seed_${sanitizedSeed}`;
  }

  // ── Initialization ─────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      this.initError = 'disabled';
      return;
    }

    try {
      await this.ensureDatabaseExists();

      const connectionString =
        `postgresql://${this.config.user}:${this.config.password}` +
        `@${this.config.host}:${this.config.port}/${this.seedDatabase}`;

      this.pool = new Pool({
        connectionString,
        max: this.config.maxConnections,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        options: '-c statement_timeout=10000',
      });

      await this.ensureTablesExist();
      this.initialized = true;
      console.log(`[PlanningEventStore] Initialized — database: ${this.seedDatabase}`);
    } catch (err) {
      this.initError = err instanceof Error ? err.message : String(err);
      console.warn(`[PlanningEventStore] Init failed (writes will no-op): ${this.initError}`);
    }
  }

  /**
   * Create the per-seed database if it doesn't already exist.
   * Mirrors `EnhancedVectorDatabase.ensureDatabaseExists()`.
   */
  private async ensureDatabaseExists(): Promise<void> {
    if (!/^[a-zA-Z0-9_]+$/.test(this.seedDatabase)) {
      throw new Error(
        `Invalid database name "${this.seedDatabase}": only alphanumeric and underscore allowed.`
      );
    }

    const tempClient = new Client({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
    });

    try {
      await tempClient.connect();
      const result = await tempClient.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [this.seedDatabase]
      );
      if (result.rowCount === 0) {
        console.log(`[PlanningEventStore] Creating per-seed database: ${this.seedDatabase}`);
        await tempClient.query(`CREATE DATABASE ${this.seedDatabase}`);
      }
    } finally {
      await tempClient.end();
    }
  }

  private async ensureTablesExist(): Promise<void> {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS task_events (
          event_id    BIGSERIAL PRIMARY KEY,
          event_type  TEXT NOT NULL,
          event_ts    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          task_id     TEXT NOT NULL,
          event_data  JSONB NOT NULL,
          world_seed  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_events_ts ON task_events(event_ts DESC);
        CREATE INDEX IF NOT EXISTS idx_task_events_type_ts ON task_events(event_type, event_ts DESC);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS task_snapshots (
          task_id      TEXT PRIMARY KEY,
          snapshot_ts  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          task_data    JSONB NOT NULL,
          world_seed   TEXT NOT NULL,
          status       TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_task_snapshots_status ON task_snapshots(status);
        CREATE INDEX IF NOT EXISTS idx_task_snapshots_ts ON task_snapshots(snapshot_ts DESC);
      `);
    } finally {
      client.release();
    }
  }

  // ── Write operations (fire-and-forget) ─────────────────────────────

  /**
   * Append an event to the `task_events` log.
   * Never throws — errors are caught and logged.
   */
  recordEvent(type: TaskEventType, taskId: string, payload: TaskEventPayload): void {
    if (!this.initialized || !this.pool) return;
    this.pool
      .query(
        `INSERT INTO task_events (event_type, task_id, event_data, world_seed)
         VALUES ($1, $2, $3, $4)`,
        [type, taskId, JSON.stringify(payload), this.config.worldSeed]
      )
      .catch((err) => {
        console.error(`[PlanningEventStore] recordEvent failed: ${err.message}`);
      });
  }

  /**
   * Upsert the latest task state into `task_snapshots`.
   * Never throws — errors are caught and logged.
   */
  updateSnapshot(task: Task): void {
    if (!this.initialized || !this.pool) return;
    this.pool
      .query(
        `INSERT INTO task_snapshots (task_id, task_data, world_seed, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (task_id) DO UPDATE SET
           task_data = EXCLUDED.task_data,
           snapshot_ts = NOW(),
           world_seed = EXCLUDED.world_seed,
           status = EXCLUDED.status`,
        [task.id, JSON.stringify(task), this.config.worldSeed, task.status]
      )
      .catch((err) => {
        console.error(`[PlanningEventStore] updateSnapshot failed: ${err.message}`);
      });
  }

  // ── Diagnostics ────────────────────────────────────────────────────

  getStatus(): PlanningEventStoreStatus {
    return {
      enabled: this.config.enabled,
      initialized: this.initialized,
      error: this.initError,
      database: this.initialized ? this.seedDatabase : null,
    };
  }

  // ── Cleanup ────────────────────────────────────────────────────────

  async destroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.initialized = false;
  }
}
