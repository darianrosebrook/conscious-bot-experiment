import fs from 'node:fs/promises';
import path from 'node:path';

export type GoldenRunVerification = {
  status: 'verified' | 'failed' | 'skipped';
  kind?: 'inventory_delta' | 'position_delta' | 'trace_only' | 'unknown';
  detail?: Record<string, unknown>;
};

export type GoldenRunReport = {
  schema_version: 'golden_run_report_v1';
  run_id: string;
  created_at: number;
  updated_at: number;
  /** One-line server identity (e.g. STERLING_SERVER_BANNER file=... git=... supports_expand_by_digest_v1_versioned_key=true). Captured once per run for evidence. */
  server_banner?: string;
  runtime?: {
    executor?: {
      enabled?: boolean;
      mode?: 'shadow' | 'live' | string;
      loop_started?: boolean;
      enable_planning_executor_env?: string | undefined;
      executor_live_confirm_env?: string | undefined;
    };
  };
  injection?: {
    committed_ir_digest?: string;
    schema_version?: string;
    envelope_id?: string | null;
    request_id?: string;
    source?: string;
  };
  idle_episode?: {
    client_request_id?: string;
    request_id?: string;
    timeout_origin?: 'client' | 'server';
    status?: 'ok' | 'blocked' | 'error';
    reason?: string;
    committed_ir_digest?: string;
    schema_version?: string;
    envelope_id?: string | null;
    duration_ms?: number;
  };
  task?: {
    task_id?: string;
    dedupe_key?: string | null;
    status?: string;
  };
  expansion?: {
    request_id?: string;
    status?: 'ok' | 'blocked' | 'error';
    plan_bundle_digest?: string;
    schema_version?: string;
    blocked_reason?: string;
    error?: string;
    steps?: Array<{
      leaf: string;
      args?: Record<string, unknown>;
      id?: string;
      order?: number;
    }>;
  };
  execution?: {
    dispatched_steps?: Array<{
      step_id?: string;
      leaf?: string;
      args?: Record<string, unknown>;
      dispatched_at?: number;
    }>;
    shadow_steps?: Array<{
      step_id?: string;
      leaf?: string;
      args?: Record<string, unknown>;
      observed_at?: number;
    }>;
    verification?: GoldenRunVerification;
  };
};

type GoldenRunDispatchedStep = NonNullable<
  NonNullable<GoldenRunReport['execution']>['dispatched_steps']
>[number];

type GoldenRunShadowStep = NonNullable<
  NonNullable<GoldenRunReport['execution']>['shadow_steps']
>[number];

const DEFAULT_BASE_DIR = path.join(process.cwd(), 'artifacts', 'golden-run');

/** Required marker in server banner for expand-by-digest golden runs. Missing/invalid banner = hard failure. */
export const GOLDEN_RUN_REQUIRED_BANNER_MARKER = 'supports_expand_by_digest_v1_versioned_key=true';

export function isValidGoldenRunBanner(bannerLine: string | null | undefined): boolean {
  return (
    typeof bannerLine === 'string' &&
    bannerLine.trim().length > 0 &&
    bannerLine.includes(GOLDEN_RUN_REQUIRED_BANNER_MARKER)
  );
}

export function sanitizeRunId(input: string): string {
  const raw = (input ?? '').trim();
  const cleaned = raw
    .replace(/[\\/]/g, '_')
    .replace(/\.\.+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 96)
    .replace(/^_+/, '');
  return cleaned.length > 0 ? cleaned : `run_${Date.now()}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeDeep<T extends Record<string, unknown>>(
  target: T,
  patch: Record<string, unknown>
): T {
  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      const existing = target[key];
      if (Array.isArray(existing)) {
        (target as any)[key] = [...existing, ...value];
      } else {
        (target as any)[key] = [...value];
      }
      continue;
    }
    if (isObject(value)) {
      const existing = target[key];
      if (isObject(existing)) {
        (target as any)[key] = mergeDeep({ ...existing }, value);
      } else {
        (target as any)[key] = mergeDeep({}, value);
      }
      continue;
    }
    (target as any)[key] = value;
  }
  return target;
}

export class GoldenRunRecorder {
  private baseDir: string;
  private runs = new Map<string, GoldenRunReport>();
  private writeQueue = new Map<string, Promise<void>>();

  constructor(baseDir: string = DEFAULT_BASE_DIR) {
    this.baseDir = baseDir;
  }

  private ensureRun(runId: string): GoldenRunReport {
    const safeRunId = sanitizeRunId(runId);
    const existing = this.runs.get(safeRunId);
    if (existing) return existing;
    const created: GoldenRunReport = {
      schema_version: 'golden_run_report_v1',
      run_id: safeRunId,
      created_at: Date.now(),
      updated_at: Date.now(),
      execution: { dispatched_steps: [] },
    };
    this.runs.set(safeRunId, created);
    return created;
  }

  private async writeRun(report: GoldenRunReport): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const filePath = path.join(this.baseDir, `golden-${report.run_id}.json`);
    const tmpPath = `${filePath}.tmp`;
    const payload = JSON.stringify(report, null, 2);
    await fs.writeFile(tmpPath, payload, 'utf8');
    await fs.rename(tmpPath, filePath);
  }

  private queueWrite(runId: string, report: GoldenRunReport): void {
    const safeRunId = sanitizeRunId(runId);
    const pending = this.writeQueue.get(safeRunId) ?? Promise.resolve();
    const next = pending
      .catch(() => undefined)
      .then(() => this.writeRun(report))
      .catch((err) => {
        console.warn('[GoldenRunRecorder] write failed:', err);
      });
    this.writeQueue.set(safeRunId, next);
  }

  private update(runId: string, patch: Record<string, unknown>): void {
    try {
      const report = this.ensureRun(runId);
      const merged = mergeDeep(report as Record<string, unknown>, patch);
      merged.updated_at = Date.now();
      const safeRunId = sanitizeRunId(runId);
      this.runs.set(safeRunId, merged as GoldenRunReport);
      this.queueWrite(safeRunId, merged as GoldenRunReport);
    } catch (error) {
      console.warn('[GoldenRunRecorder] Failed to update report:', error);
    }
  }

  recordInjection(runId: string, data: GoldenRunReport['injection']): void {
    if (!runId) return;
    this.update(runId, { injection: data ?? {} });
  }

  recordRuntime(runId: string, data: GoldenRunReport['runtime']): void {
    if (!runId) return;
    this.update(runId, { runtime: data ?? {} });
  }

  recordIdleEpisode(
    runId: string,
    data: GoldenRunReport['idle_episode']
  ): void {
    if (!runId) return;
    this.update(runId, { idle_episode: data ?? {} });
  }

  recordTask(runId: string, data: GoldenRunReport['task']): void {
    if (!runId) return;
    this.update(runId, { task: data ?? {} });
  }

  recordExpansion(runId: string, data: GoldenRunReport['expansion']): void {
    if (!runId) return;
    this.update(runId, { expansion: data ?? {} });
  }

  /** Store the Sterling server identity line once per run (evidence-grade). */
  recordServerBanner(runId: string, bannerLine: string): void {
    if (!runId || !bannerLine?.trim()) return;
    this.update(runId, { server_banner: bannerLine.trim() });
  }

  recordDispatch(runId: string, data: GoldenRunDispatchedStep): void {
    if (!runId) return;
    this.update(runId, {
      execution: {
        dispatched_steps: [data],
      },
    });
  }

  recordShadowDispatch(runId: string, data: GoldenRunShadowStep): void {
    if (!runId) return;
    this.update(runId, {
      execution: {
        shadow_steps: [data],
      },
    });
  }

  recordVerification(runId: string, data: GoldenRunVerification): void {
    if (!runId) return;
    this.update(runId, {
      execution: {
        verification: data,
      },
    });
  }
}

let defaultRecorder: GoldenRunRecorder | null = null;

export function getGoldenRunRecorder(): GoldenRunRecorder {
  if (!defaultRecorder) {
    defaultRecorder = new GoldenRunRecorder();
  }
  return defaultRecorder;
}
