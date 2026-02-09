import fs from 'node:fs/promises';
import path from 'node:path';
import type { AutonomyProofBundleV1 } from './goal-formulation/autonomy-proof-bundle';

export type GoldenRunVerification = {
  status: 'verified' | 'failed' | 'skipped';
  kind?: 'inventory_delta' | 'position_delta' | 'trace_only' | 'unknown';
  detail?: Record<string, unknown>;
};

/** One entry in the linear execution story: block or dispatch. Bounded; prefer small payloads. */
export type ExecutionDecision = {
  step_id?: string;
  leaf?: string;
  reason: string;
  ts: number;
};

export type GoldenRunReport = {
  schema_version: 'golden_run_report_v1';
  /** Revision marker for downstream compatibility; additive features listed. */
  schema_revision?: number;
  /** Optional list of feature flags present in this artifact (e.g. original_leaf, blocked_throttle_v1). */
  features?: string[];
  run_id: string;
  created_at: number;
  updated_at: number;
  /** One-line Sterling server identity. Captured once per run for evidence. */
  server_banner?: string;
  /** One-line planning server identity (run_mode, executor_mode, capabilities, config_digest). Makes artifact self-describing. */
  planning_banner?: string;
  /** Digest of planning runtime config for this run. Matches planning_banner config_digest= value. */
  config_digest?: string;
  runtime?: {
    executor?: {
      enabled?: boolean;
      mode?: 'shadow' | 'live' | string;
      loop_started?: boolean;
      interval_registered?: boolean;
      last_tick_at?: number;
      tick_count?: number;
      enable_planning_executor_env?: string | undefined;
      executor_live_confirm_env?: string | undefined;
    };
    /** True when Option B task_type_* bridge is enabled (golden harness only). */
    bridge_enabled?: boolean;
    /** False when bridge_enabled is true. Artifacts with bridge_enabled are non-certifiable by definition. */
    certifiable?: boolean;
  };
  injection?: {
    committed_ir_digest?: string;
    schema_version?: string;
    envelope_id?: string | null;
    request_id?: string;
    source?: string;
  };
  /** Checkpoint A (attempt): Recorded BEFORE expandByDigest WebSocket call. */
  sterling_expand_requested?: {
    committed_ir_digest: string;
    schema_version?: string;
    envelope_id?: string | null;
    request_id: string;
    requested_at: number;
  };
  /** Checkpoint A (result): Recorded AFTER expandByDigest returns or throws. */
  sterling_expand_result?: {
    request_id: string;
    status: 'ok' | 'blocked' | 'error' | 'timeout';
    blocked_reason?: string;
    error?: string;
    step_count?: number;
    plan_bundle_digest?: string;
    resolved_at: number;
    elapsed_ms: number;
    /** Number of ingest-retry attempts (0 = no retries, first call succeeded/failed). */
    attempt_count?: number;
    /** WS-level request_id used for the final expandByDigest call (differs from request_id when retries occurred). */
    final_request_id?: string;
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
    title?: string;
    /** True when addTask returned an existing task (sterling_ir dedupe). */
    dedupe_hit?: boolean;
    /** Task id returned (same as task_id when dedupe_hit). */
    returned_task_id?: string;
    /** Golden run id of the returned task (different from current runId when dedupe). */
    returned_task_golden_run_id?: string | null;
  };
  expansion?: {
    request_id?: string;
    status?: 'ok' | 'blocked' | 'error';
    plan_bundle_digest?: string;
    /** SHA-256 of canonical JSON of the final step list the executor will run. */
    executor_plan_digest?: string;
    /** SHA-256 covering only the resolved intent replacement steps. */
    intent_resolution_digest?: string;
    /** SHA-256 of the resolution context (inventory + nearbyBlocks + goalItem). Enables replay of "why did the plan change?" */
    resolution_context_digest?: string;
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
  /** Append-only bounded trace of expansion retry attempts (max 20). */
  expansion_retries?: Array<{
    attempt: number;
    reason: string;
    classification: 'transient' | 'contract_broken' | 'success' | 'exhausted';
    next_eligible_at?: number;
    backoff_ms?: number;
    ts: number;
  }>;
  execution?: {
    /** Append-only linear story of blocks and dispatches (bounded). */
    decisions?: ExecutionDecision[];
    dispatched_steps?: Array<{
      step_id?: string;
      leaf?: string;
      args?: Record<string, unknown>;
      dispatched_at?: number;
      /** When step meta.leaf was rewritten (e.g. dig_block -> acquire_material). Preserved for evidence. */
      original_leaf?: string;
      /** Live proof: tool attempt result. Existence proves loop closed. */
      result?: {
        status: 'ok' | 'error' | 'blocked';
        error?: string;
        failureCode?: string;
        attempts?: number;
        reason?: string;
        /** Placement receipt: position + block for receipt-anchored verification audit trail. */
        receipt?: Record<string, unknown>;
      };
    }>;
    shadow_steps?: Array<{
      step_id?: string;
      leaf?: string;
      args?: Record<string, unknown>;
      observed_at?: number;
    }>;
    verification?: GoldenRunVerification;
    /** When dispatch did not occur: executor_disabled | unknown_leaf | invalid_args | tool_unavailable | rate_limited | rig_g_blocked | bot_unavailable | bot_not_spawned | bot_health_check_failed | crafting_table_prerequisite | budget_exhausted */
    executor_blocked_reason?: string;
    /** Reflex proof bundle — autonomy driveshaft evidence (e.g. hunger reflex). */
    reflex_proof?: AutonomyProofBundleV1;
    /** Optional payload when blocked (e.g. leaf/args for unknown_leaf or invalid_args). */
    executor_blocked_payload?: {
      leaf?: string;
      args?: Record<string, unknown>;
      validation_error?: string;
      /** When step meta.leaf was rewritten (e.g. dig_block -> acquire_material). Preserved for evidence. */
      original_leaf?: string;
    };
  };
};

/** Throttle window for recordExecutorBlocked: skip write if same (runId, reason, leaf) within this ms. */
const BLOCKED_THROTTLE_MS = 5000;

/** Evict throttle/shadow state for runs not updated in this long to avoid unbounded growth. */
const RUN_STALE_MS = 15 * 60 * 1000; // 15 minutes

/** Max length of execution.decisions so artifact stays bounded. */
const MAX_DECISIONS = 200;

/** Max entries in taskId -> latestRunId index. Evict oldest (insertion order) when exceeded. */
const MAX_TASK_INDEX_ENTRIES = 500;

/** Keys omitted from payload fingerprint so timestamp noise does not defeat idempotency. */
const FINGERPRINT_NOISE_KEYS = new Set([
  'dispatched_at',
  'observed_at',
  'timestamp',
  'updated_at',
  'created_at',
]);

type GoldenRunDispatchedStep = NonNullable<
  NonNullable<GoldenRunReport['execution']>['dispatched_steps']
>[number];

/** Result shape for live proof: converts toolExecutor/gateway response to artifact format. */
export type GoldenRunDispatchResult = NonNullable<
  GoldenRunDispatchedStep['result']
>;

/**
 * Convert toolExecutor.execute / gateway response to GoldenRunDispatchResult for artifact.
 * Existence of result proves the loop closed (tool was attempted).
 */
export function toDispatchResult(
  actionResult: Record<string, unknown> | null | undefined
): GoldenRunDispatchResult | undefined {
  if (!actionResult) return undefined;
  if (actionResult.ok === true) {
    const base: GoldenRunDispatchResult = { status: 'ok' };
    // Preserve placement receipt for audit trail
    const data = actionResult.data as Record<string, unknown> | undefined;
    if (data?.position) {
      base.receipt = {
        position: data.position,
        ...(data.blockPlaced ? { blockPlaced: data.blockPlaced } : {}),
        ...(data.torchPlaced !== undefined ? { torchPlaced: data.torchPlaced } : {}),
        ...(data.workstation ? { workstation: data.workstation } : {}),
      };
    }
    return base;
  }
  const meta = actionResult.metadata as Record<string, unknown> | undefined;
  const reason = meta?.reason as string | undefined;
  if (actionResult.shadowBlocked === true) {
    return { status: 'blocked', reason: 'shadow' };
  }
  if (reason === 'mcp_only_disabled') {
    return { status: 'blocked', reason: 'mcp_only' };
  }
  if (reason === 'no_mapped_action') {
    return { status: 'blocked', reason: 'no_mapped_action' };
  }
  return {
    status: 'error',
    error: String(actionResult.error ?? ''),
    failureCode: (actionResult.failureCode ?? meta?.failureCode) as
      | string
      | undefined,
  };
}

type GoldenRunShadowStep = NonNullable<
  NonNullable<GoldenRunReport['execution']>['shadow_steps']
>[number];

const DEFAULT_BASE_DIR = path.join(process.cwd(), 'artifacts', 'golden-run');

/**
 * Derive runtime.executor.loop_started from evidence so the artifact cannot show
 * "loop not started" while containing dispatch records. Authoritative rule:
 * loop_started === true when (shadow_steps.length + dispatched_steps.length) > 0.
 */
function deriveLoopStarted(report: GoldenRunReport): GoldenRunReport {
  const copy = { ...report };
  const shadowLen = report.execution?.shadow_steps?.length ?? 0;
  const dispatchedLen = report.execution?.dispatched_steps?.length ?? 0;
  const hasDispatchEvidence = shadowLen + dispatchedLen > 0;
  if (hasDispatchEvidence && copy.runtime?.executor) {
    copy.runtime = {
      ...copy.runtime,
      executor: { ...copy.runtime.executor, loop_started: true },
    };
  }
  if (copy.runtime) {
    copy.runtime = {
      ...copy.runtime,
      certifiable: copy.runtime.bridge_enabled !== true,
    };
  }
  return copy;
}

/** Required marker in server banner for expand-by-digest golden runs. Missing/invalid banner = hard failure. */
export const GOLDEN_RUN_REQUIRED_BANNER_MARKER =
  'supports_expand_by_digest_v1_versioned_key=true';

export function isValidGoldenRunBanner(
  bannerLine: string | null | undefined
): boolean {
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

/** Stable key for blocked-event throttle/idempotency. */
function blockedEventKey(
  runId: string,
  reason: string,
  leaf: string | undefined
): string {
  return `${sanitizeRunId(runId)}:${reason}:${leaf ?? ''}`;
}

/** Stable deep fingerprint: sorted keys recursively, noise fields stripped. */
function stablePayloadFingerprint(value: unknown): string {
  if (value == null) return String(value);
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stablePayloadFingerprint).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => !FINGERPRINT_NOISE_KEYS.has(k))
    .sort();
  const parts = keys.map((k) => JSON.stringify(k) + ':' + stablePayloadFingerprint(obj[k]));
  return '{' + parts.join(',') + '}';
}

/** Fingerprint for blocked payload (idempotency: skip if same reason+leaf+payload). */
function blockedPayloadFingerprint(payload: Record<string, unknown> | undefined): string {
  if (!payload || Object.keys(payload).length === 0) return '';
  return stablePayloadFingerprint(payload);
}

export class GoldenRunRecorder {
  private baseDir: string;
  private runs = new Map<string, GoldenRunReport>();
  private writeQueue = new Map<string, Promise<void>>();
  /** Idempotency: (runId -> set of step keys already recorded for shadow). Prevents repeated shadow dispatch for same step. */
  private shadowObservedStepKeys = new Map<string, Set<string>>();
  /** Throttle + idempotency for recordExecutorBlocked: key -> { at, payloadFingerprint }. Skip write if same key within BLOCKED_THROTTLE_MS and same payload. */
  private lastBlockedByKey = new Map<
    string,
    { at: number; payloadFingerprint: string }
  >();
  /** taskId -> latestRunId for O(1) lookup. Bounded; evict oldest when exceeded. */
  private taskIdToLatestRunId = new Map<string, string>();

  constructor(baseDir: string = DEFAULT_BASE_DIR) {
    this.baseDir = baseDir;
  }

  /** Resolve the absolute file path for a given run ID's artifact. */
  getArtifactPath(runId: string): string {
    return path.join(this.baseDir, `golden-${sanitizeRunId(runId)}.json`);
  }

  private ensureRun(runId: string): GoldenRunReport {
    const safeRunId = sanitizeRunId(runId);
    const existing = this.runs.get(safeRunId);
    if (existing) return existing;
    const created: GoldenRunReport = {
      schema_version: 'golden_run_report_v1',
      schema_revision: 1,
      features: [
        'original_leaf',
        'blocked_throttle_v1',
        'strict_mapping_v1',
        'execution_decisions_v1',
      ],
      run_id: safeRunId,
      created_at: Date.now(),
      updated_at: Date.now(),
      execution: { dispatched_steps: [], decisions: [] },
    };
    this.runs.set(safeRunId, created);
    return created;
  }

  private async writeRun(report: GoldenRunReport): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const filePath = path.join(this.baseDir, `golden-${report.run_id}.json`);
    const tmpPath = `${filePath}.tmp`;
    const normalized = deriveLoopStarted(report);
    const payload = JSON.stringify(normalized, null, 2);
    await fs.writeFile(tmpPath, payload, 'utf8');
    await fs.rename(tmpPath, filePath);
  }

  /** Explicitly flush a run to disk. Awaitable — callers can wait for completion. */
  async flushRun(runId: string): Promise<void> {
    const safeRunId = sanitizeRunId(runId);
    const report = this.runs.get(safeRunId);
    if (!report) return;
    // Wait for any pending write to finish, then write the latest state
    const pending = this.writeQueue.get(safeRunId) ?? Promise.resolve();
    await pending.catch(() => undefined);
    await this.writeRun(report);
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

  /** Evict throttle and shadow state for runs not updated in RUN_STALE_MS to avoid unbounded growth. */
  private evictStaleThrottleState(): void {
    const now = Date.now();
    for (const key of this.lastBlockedByKey.keys()) {
      const runId = key.split(':')[0];
      const report = this.runs.get(runId);
      if (!report || now - report.updated_at > RUN_STALE_MS) {
        this.lastBlockedByKey.delete(key);
      }
    }
    for (const runId of this.shadowObservedStepKeys.keys()) {
      const report = this.runs.get(runId);
      if (!report || now - report.updated_at > RUN_STALE_MS) {
        this.shadowObservedStepKeys.delete(runId);
      }
    }
  }

  private updateTaskIndex(taskId: string, runId: string): void {
    if (!taskId) return;
    const safeRunId = sanitizeRunId(runId);
    this.taskIdToLatestRunId.delete(taskId);
    this.taskIdToLatestRunId.set(taskId, safeRunId);
    while (this.taskIdToLatestRunId.size > MAX_TASK_INDEX_ENTRIES) {
      const oldest = this.taskIdToLatestRunId.keys().next().value;
      if (oldest !== undefined) this.taskIdToLatestRunId.delete(oldest);
    }
  }

  private update(runId: string, patch: Record<string, unknown>): void {
    try {
      const report = this.ensureRun(runId);
      const merged = mergeDeep(report as Record<string, unknown>, patch);
      merged.updated_at = Date.now();
      const exec = merged.execution as { decisions?: ExecutionDecision[] } | undefined;
      if (Array.isArray(exec?.decisions) && exec.decisions.length > MAX_DECISIONS) {
        exec.decisions = exec.decisions.slice(-MAX_DECISIONS);
      }
      const taskId = (merged as GoldenRunReport).task?.task_id;
      if (taskId) this.updateTaskIndex(taskId, runId);
      const safeRunId = sanitizeRunId(runId);
      this.runs.set(safeRunId, merged as GoldenRunReport);
      this.queueWrite(safeRunId, merged as GoldenRunReport);
      this.evictStaleThrottleState();
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

  recordSterlingExpandRequested(runId: string, data: GoldenRunReport['sterling_expand_requested']): void {
    if (!runId) return;
    this.update(runId, { sterling_expand_requested: data });
  }

  recordSterlingExpandResult(runId: string, data: GoldenRunReport['sterling_expand_result']): void {
    if (!runId) return;
    this.update(runId, { sterling_expand_result: data });
  }

  /** Append one expansion retry event (bounded at 20 entries). */
  recordExpansionRetry(
    runId: string,
    entry: NonNullable<GoldenRunReport['expansion_retries']>[number]
  ): void {
    if (!runId) return;
    const report = this.ensureRun(runId);
    report.expansion_retries ??= [];
    if (report.expansion_retries.length < 20) {
      report.expansion_retries.push(entry);
    }
    report.updated_at = Date.now();
    const safeRunId = sanitizeRunId(runId);
    this.runs.set(safeRunId, report);
    this.queueWrite(safeRunId, report);
  }

  /** Store the Sterling server identity line once per run (evidence-grade). */
  recordServerBanner(runId: string, bannerLine: string): void {
    if (!runId || !bannerLine?.trim()) return;
    this.update(runId, { server_banner: bannerLine.trim() });
  }

  /** Store planning server banner and config digest so artifact is self-describing. */
  recordPlanningBanner(
    runId: string,
    bannerLine: string,
    configDigest: string,
    bridgeEnabled: boolean
  ): void {
    if (!runId || !bannerLine?.trim()) return;
    this.update(runId, {
      planning_banner: bannerLine.trim(),
      config_digest: configDigest,
      runtime: { bridge_enabled: bridgeEnabled },
    });
  }

  recordDispatch(runId: string, data: GoldenRunDispatchedStep): void {
    if (!runId) return;
    const decision: ExecutionDecision = {
      step_id: data.step_id,
      leaf: data.leaf,
      reason: 'dispatch',
      ts: Date.now(),
    };
    this.update(runId, {
      execution: {
        dispatched_steps: [data],
        decisions: [decision],
        executor_blocked_reason: undefined,
        executor_blocked_payload: undefined,
      },
    });
  }

  recordShadowDispatch(runId: string, data: GoldenRunShadowStep): void {
    if (!runId) return;
    const stepKey =
      typeof data.step_id === 'string' && data.step_id.trim().length > 0
        ? data.step_id
        : `fallback:${data.leaf ?? 'unknown'}:${data.observed_at ?? Date.now()}`;
    const safeRunId = sanitizeRunId(runId);
    let set = this.shadowObservedStepKeys.get(safeRunId);
    if (set?.has(stepKey)) return;
    if (!set) {
      set = new Set<string>();
      this.shadowObservedStepKeys.set(safeRunId, set);
    }
    set.add(stepKey);
    const decision: ExecutionDecision = {
      step_id: data.step_id,
      leaf: data.leaf,
      reason: 'shadow',
      ts: Date.now(),
    };
    this.update(runId, {
      execution: {
        shadow_steps: [data],
        decisions: [decision],
        executor_blocked_reason: undefined,
        executor_blocked_payload: undefined,
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

  /**
   * Record a regeneration attempt (6.7 Option A safety).
   * Appends a decision: reason 'regen_success' or failure reason (e.g. 'regen_non_option_a').
   */
  recordRegenerationAttempt(
    runId: string,
    data: { success: boolean; reason?: string }
  ): void {
    if (!runId) return;
    const reason = data.success ? 'regen_success' : (data.reason ?? 'regen_failed');
    const decision: ExecutionDecision = { reason, ts: Date.now() };
    this.update(runId, {
      execution: {
        decisions: [decision],
      },
    });
  }

  /**
   * Record leaf rewrite used (6.6 dig_block quarantine: allow-but-measure).
   * Appends a decision so rewrite usage is auditable and retirable.
   */
  recordLeafRewriteUsed(
    runId: string,
    payload: { leaf: string; originalLeaf: string }
  ): void {
    if (!runId) return;
    const decision: ExecutionDecision = {
      leaf: payload.leaf,
      reason: 'rewrite_used',
      ts: Date.now(),
    };
    this.update(runId, {
      execution: {
        decisions: [decision],
      },
    });
  }

  /**
   * Record why executor did not dispatch (so the artifact explains empty dispatched_steps).
   * Idempotency: if same (runId, reason, leaf) and equivalent payload within BLOCKED_THROTTLE_MS, skip write to avoid I/O storm.
   * When taskId is provided, merges task.task_id so the taskId index is updated even when this is the first write for the run.
   */
  recordExecutorBlocked(
    runId: string,
    reason: string,
    payload?: {
      leaf?: string;
      args?: Record<string, unknown>;
      validation_error?: string;
      original_leaf?: string;
      [k: string]: unknown;
    },
    taskId?: string
  ): void {
    if (!runId) return;
    const key = blockedEventKey(runId, reason, payload?.leaf);
    const fingerprint = blockedPayloadFingerprint(payload);
    const now = Date.now();
    const last = this.lastBlockedByKey.get(key);
    if (
      last &&
      now - last.at < BLOCKED_THROTTLE_MS &&
      last.payloadFingerprint === fingerprint
    ) {
      return;
    }
    this.lastBlockedByKey.set(key, { at: now, payloadFingerprint: fingerprint });
    const decision: ExecutionDecision = {
      step_id: payload?.step_id as string | undefined,
      leaf: payload?.leaf as string | undefined,
      reason,
      ts: now,
    };
    const patch: Record<string, unknown> = {
      execution: {
        decisions: [decision],
        executor_blocked_reason: reason,
        ...(payload && Object.keys(payload).length > 0
          ? { executor_blocked_payload: payload }
          : {}),
      },
    };
    if (taskId) patch.task = { task_id: taskId };
    this.update(runId, patch);
  }

  /** Record an autonomy reflex proof bundle (e.g. hunger driveshaft evidence). */
  recordReflexProof(runId: string, bundle: AutonomyProofBundleV1): void {
    if (!runId) return;
    this.update(runId, {
      execution: {
        reflex_proof: bundle,
      },
    });
  }

  /** Return report from in-memory cache (with loop_started derived from evidence), or null if not found. */
  getReport(runId: string): GoldenRunReport | null {
    const safeRunId = sanitizeRunId(runId);
    const report = this.runs.get(safeRunId) ?? null;
    return report ? deriveLoopStarted(report) : null;
  }

  /**
   * Return latest report for taskId (O(1) via taskId -> latestRunId index).
   * Returns null if taskId has no known run or run was evicted.
   */
  getLatestReportByTaskId(taskId: string): GoldenRunReport | null {
    if (!taskId) return null;
    const runId = this.taskIdToLatestRunId.get(taskId);
    if (!runId) return null;
    const report = this.runs.get(runId) ?? null;
    if (!report) {
      this.taskIdToLatestRunId.delete(taskId);
      return null;
    }
    return deriveLoopStarted(report);
  }

  /** Read report from disk (for dev artifact fetch). Returns null if file missing or invalid. Applies loop_started derivation. */
  async getReportFromDisk(runId: string): Promise<GoldenRunReport | null> {
    const safeRunId = sanitizeRunId(runId);
    const filePath = path.join(this.baseDir, `golden-${safeRunId}.json`);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const report = JSON.parse(raw) as GoldenRunReport;
      if (report?.schema_version !== 'golden_run_report_v1') return null;
      return deriveLoopStarted(report);
    } catch {
      return null;
    }
  }
}

let defaultRecorder: GoldenRunRecorder | null = null;

export function getGoldenRunRecorder(): GoldenRunRecorder {
  if (!defaultRecorder) {
    defaultRecorder = new GoldenRunRecorder();
  }
  return defaultRecorder;
}
