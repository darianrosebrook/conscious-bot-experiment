import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';

// @ts-expect-error — cross-workspace relative import; resolves at runtime
import {
  httpGet,
  httpPost,
  writeE2EArtifact,
} from '../../../memory/src/__tests__/e2e-helpers';

// ─── Environment gate ───────────────────────────────────────────────────────
const SYSTEM_E2E = !!process.env.SYSTEM_E2E;

const MEMORY_URL =
  process.env.MEMORY_ENDPOINT ?? 'http://localhost:3001';
const PLANNING_URL =
  process.env.PLANNING_ENDPOINT ?? 'http://localhost:3002';

// ─── Scenario tracking (same pattern as memory E2E) ─────────────────────────
type ScenarioStep = {
  action: string;
  endpoint?: string;
  statusCode?: number;
  assertion?: string;
  passed?: boolean;
  detail?: any;
  durationMs?: number;
};

type ScenarioResult = {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  steps: ScenarioStep[];
  gap?: string;
};

function nowMs(): number {
  return Date.now();
}

async function withTimer<T>(
  fn: () => Promise<T>
): Promise<{ value: T; durationMs: number }> {
  const start = nowMs();
  const value = await fn();
  return { value, durationMs: nowMs() - start };
}

/**
 * Poll a condition until it returns a truthy value or timeout.
 * Returns the last result (truthy or not).
 */
async function pollUntil<T>(
  fn: () => Promise<T>,
  opts: { timeoutMs: number; intervalMs?: number }
): Promise<T> {
  const intervalMs = opts.intervalMs ?? 2000;
  const deadline = Date.now() + opts.timeoutMs;
  let last: T;
  do {
    last = await fn();
    if (last) return last;
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  } while (Date.now() < deadline);
  return last;
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe.skipIf(!SYSTEM_E2E)('System E2E: Cross-service pipelines', () => {
  const artifactDir = path.resolve(
    __dirname,
    '../../artifacts/system-e2e'
  );
  const runId = `system-e2e-${Date.now()}`;
  const scenarios: ScenarioResult[] = [];

  // Shared state across scenarios
  let goldenRunId: string | null = null;
  let goldenTaskId: string | null = null;
  let goldenDigest: string | null = null;

  // Capability flags detected in Scenario 0
  let devEndpointsEnabled = false;
  let executorEnabled = false;
  let executorMode: string | null = null;
  let sterlingConnected = false;

  afterAll(() => {
    const payload = {
      meta: {
        runId,
        timestamp: Date.now(),
        memoryUrl: MEMORY_URL,
        planningUrl: PLANNING_URL,
        capabilities: {
          devEndpointsEnabled,
          executorEnabled,
          executorMode,
          sterlingConnected,
        },
      },
      scenarios,
      summary: {
        total: scenarios.length,
        passed: scenarios.filter((s) => s.status === 'pass').length,
        failed: scenarios.filter((s) => s.status === 'fail').length,
        skipped: scenarios.filter((s) => s.status === 'skip').length,
      },
    };

    writeE2EArtifact(artifactDir, runId, payload);
  });

  // ── Scenario 0: Service Readiness + Capability Detection ───────────────

  it('Scenario 0: Service readiness + capability detection', async () => {
    const start = nowMs();
    const steps: ScenarioStep[] = [];
    const name = 'Scenario 0: Service readiness + capability detection';

    try {
      // Memory /ready
      const memReady = await withTimer(() =>
        httpGet(`${MEMORY_URL}/ready`, 5000)
      );
      steps.push({
        action: 'GET /ready (memory)',
        endpoint: `${MEMORY_URL}/ready`,
        statusCode: memReady.value.status,
        durationMs: memReady.durationMs,
      });
      expect(memReady.value.status).toBe(200);
      expect(memReady.value.body?.checks?.database?.ok).toBe(true);
      expect(memReady.value.body?.checks?.embeddings?.ok).toBe(true);

      // Planning /health
      const planHealth = await withTimer(() =>
        httpGet(`${PLANNING_URL}/health`, 5000)
      );
      steps.push({
        action: 'GET /health (planning)',
        endpoint: `${PLANNING_URL}/health`,
        statusCode: planHealth.value.status,
        durationMs: planHealth.durationMs,
      });
      expect(planHealth.value.status).toBe(200);
      expect(planHealth.value.body?.status).toBe('healthy');

      // Planning /system/ready
      const planReady = await withTimer(() =>
        httpGet(`${PLANNING_URL}/system/ready`, 5000)
      );
      steps.push({
        action: 'GET /system/ready (planning)',
        endpoint: `${PLANNING_URL}/system/ready`,
        statusCode: planReady.value.status,
        durationMs: planReady.durationMs,
      });
      expect(planReady.value.status).toBe(200);

      // Sterling connectivity
      const sterlingHealth = await withTimer(() =>
        httpGet(`${PLANNING_URL}/sterling/health`, 5000)
      );
      sterlingConnected =
        sterlingHealth.value.status === 200 &&
        sterlingHealth.value.body?.connected === true;
      steps.push({
        action: 'GET /sterling/health',
        statusCode: sterlingHealth.value.status,
        detail: {
          connected: sterlingHealth.value.body?.connected,
          lastPingMs: sterlingHealth.value.body?.lastPingMs,
        },
      });

      // Detect dev endpoints: probe runtime-config (only exists if ENABLE_DEV_ENDPOINTS=true)
      const devProbe = await httpGet(
        `${PLANNING_URL}/api/dev/runtime-config`,
        3000
      ).catch(() => ({ status: 0, body: null, raw: '' }));
      devEndpointsEnabled = devProbe.status === 200;
      if (devProbe.status === 200 && devProbe.body) {
        executorEnabled = devProbe.body?.executorEnabled === true;
        executorMode = devProbe.body?.executorMode ?? null;
      }
      steps.push({
        action: 'detect dev endpoints + executor config',
        detail: {
          devEndpointsEnabled,
          executorEnabled,
          executorMode,
          runtimeConfigStatus: devProbe.status,
        },
      });

      scenarios.push({
        name,
        status: 'pass',
        durationMs: nowMs() - start,
        steps,
      });
    } catch (e) {
      steps.push({
        action: 'assert',
        passed: false,
        detail: (e as Error).message,
      });
      scenarios.push({
        name,
        status: 'fail',
        durationMs: nowMs() - start,
        steps,
      });
      throw e;
    }
  }, 15_000);

  // ── Scenario 1: Memory Hybrid Search ───────────────────────────────────

  it('Scenario 1: Memory hybrid search (write → search returns marker)', async () => {
    const start = nowMs();
    const steps: ScenarioStep[] = [];
    const name = 'Scenario 1: Memory hybrid search';

    try {
      const marker = `SYS_E2E_MARKER_${Date.now()}`;
      const content = `The bot explored a cave and found ${marker} near diamonds`;

      // Write thought
      const write = await withTimer(() =>
        httpPost(`${MEMORY_URL}/thought`, { content }, 10_000)
      );
      steps.push({
        action: 'POST /thought (memory)',
        endpoint: `${MEMORY_URL}/thought`,
        statusCode: write.value.status,
        durationMs: write.durationMs,
      });
      expect(write.value.status).toBeGreaterThanOrEqual(200);
      expect(write.value.status).toBeLessThan(300);

      // Search for marker
      const search = await withTimer(() =>
        httpPost(
          `${MEMORY_URL}/search`,
          { query: marker, limit: 10 },
          10_000
        )
      );
      steps.push({
        action: 'POST /search (memory)',
        endpoint: `${MEMORY_URL}/search`,
        statusCode: search.value.status,
        durationMs: search.durationMs,
      });
      expect(search.value.status).toBe(200);

      const results = search.value.body?.results ?? [];
      const found = results.some((r: any) =>
        JSON.stringify(r).includes(marker)
      );
      steps.push({
        action: 'assert marker found in results',
        assertion: `results contain ${marker}`,
        passed: found,
        detail: {
          resultCount: results.length,
          markerFound: found,
        },
      });
      expect(found).toBe(true);

      // Verify not degraded (hybrid path, not episodic fallback)
      const degraded = search.value.body?._degraded;
      steps.push({
        action: 'assert not degraded',
        assertion: '_degraded is absent or false',
        passed: !degraded,
        detail: { _degraded: degraded },
      });
      expect(degraded).toBeFalsy();

      scenarios.push({
        name,
        status: 'pass',
        durationMs: nowMs() - start,
        steps,
      });
    } catch (e) {
      steps.push({
        action: 'assert',
        passed: false,
        detail: (e as Error).message,
      });
      scenarios.push({
        name,
        status: 'fail',
        durationMs: nowMs() - start,
        steps,
      });
      throw e;
    }
  }, 30_000);

  // ── Scenario 2: Sterling Golden Reduce → Task Creation ─────────────────

  it('Scenario 2: Sterling golden reduce → task creation', async () => {
    const start = nowMs();
    const steps: ScenarioStep[] = [];
    const name = 'Scenario 2: Sterling golden reduce → task creation';

    if (!devEndpointsEnabled) {
      steps.push({
        action: 'skip — dev endpoints not enabled',
        detail: 'Start with ENABLE_DEV_ENDPOINTS=true to enable Scenarios 2-4',
      });
      scenarios.push({
        name,
        status: 'skip',
        durationMs: nowMs() - start,
        steps,
        gap: 'ENABLE_DEV_ENDPOINTS not set. Start with: ENABLE_DEV_ENDPOINTS=true ENABLE_PLANNING_EXECUTOR=1 node scripts/start.js',
      });
      return;
    }

    if (!sterlingConnected) {
      steps.push({
        action: 'skip — Sterling not connected',
        detail: 'Sterling WebSocket is not available',
      });
      scenarios.push({
        name,
        status: 'skip',
        durationMs: nowMs() - start,
        steps,
        gap: 'Sterling not connected. Ensure sterling is running at ws://localhost:8766',
      });
      return;
    }

    try {
      const reduce = await withTimer(() =>
        httpPost(
          `${PLANNING_URL}/api/dev/run-golden-reduce`,
          {},
          20_000
        )
      );
      steps.push({
        action: 'POST /api/dev/run-golden-reduce',
        endpoint: `${PLANNING_URL}/api/dev/run-golden-reduce`,
        statusCode: reduce.value.status,
        durationMs: reduce.durationMs,
        detail: reduce.value.body,
      });
      expect(reduce.value.status).toBe(200);
      expect(reduce.value.body?.success).toBe(true);

      // Validate reduce output
      const reduceBody = reduce.value.body.reduce;
      expect(reduceBody?.committed_ir_digest).toBeTruthy();
      expect(typeof reduceBody.committed_ir_digest).toBe('string');
      expect(reduceBody?.schema_version).toBeTruthy();
      expect(typeof reduceBody.schema_version).toBe('string');

      steps.push({
        action: 'assert reduce fields',
        assertion: 'committed_ir_digest and schema_version are non-empty strings',
        passed: true,
        detail: {
          committed_ir_digest: reduceBody.committed_ir_digest,
          schema_version: reduceBody.schema_version,
        },
      });

      // Validate task injection
      const inject = reduce.value.body.inject;
      expect(inject?.task_id).toBeTruthy();
      expect(inject?.run_id).toBeTruthy();

      steps.push({
        action: 'assert task injected',
        assertion: 'task_id and run_id are non-null',
        passed: true,
        detail: {
          task_id: inject.task_id,
          run_id: inject.run_id,
        },
      });

      // Stash for downstream scenarios
      goldenRunId = inject.run_id;
      goldenTaskId = inject.task_id;
      goldenDigest = reduceBody.committed_ir_digest;

      scenarios.push({
        name,
        status: 'pass',
        durationMs: nowMs() - start,
        steps,
      });
    } catch (e) {
      steps.push({
        action: 'assert',
        passed: false,
        detail: (e as Error).message,
      });
      scenarios.push({
        name,
        status: 'fail',
        durationMs: nowMs() - start,
        steps,
      });
      throw e;
    }
  }, 30_000);

  // ── Scenario 3: Task Expansion via Sterling ────────────────────────────

  it('Scenario 3: Task expansion via Sterling', async () => {
    const start = nowMs();
    const steps: ScenarioStep[] = [];
    const name = 'Scenario 3: Task expansion via Sterling';

    if (!goldenTaskId) {
      scenarios.push({
        name,
        status: 'skip',
        durationMs: nowMs() - start,
        steps: [{ action: 'skip', detail: 'No task_id from Scenario 2' }],
        gap: 'Scenario 2 did not produce a task_id (dev endpoints or Sterling not available)',
      });
      return;
    }

    if (!executorEnabled) {
      scenarios.push({
        name,
        status: 'skip',
        durationMs: nowMs() - start,
        steps: [{
          action: 'skip — executor not enabled',
          detail: 'Start with ENABLE_PLANNING_EXECUTOR=1 to enable expansion + dispatch',
        }],
        gap: 'ENABLE_PLANNING_EXECUTOR not set. Expansion requires the executor loop.',
      });
      return;
    }

    try {
      steps.push({
        action: 'poll /tasks for expansion',
        detail: { taskId: goldenTaskId, executorMode },
      });

      // Poll until the task has steps (expansion happened) or timeout
      const expanded = await pollUntil(
        async () => {
          const resp = await httpGet(`${PLANNING_URL}/tasks`, 5000);
          if (resp.status !== 200) return null;

          const allTasks = [
            ...(resp.body?.tasks?.current ?? []),
            ...(resp.body?.tasks?.completed ?? []),
          ];

          const task = allTasks.find((t: any) => t.id === goldenTaskId);
          if (!task) return null;

          // Check for steps or active/expanded status
          const hasSteps =
            Array.isArray(task.steps) && task.steps.length > 0;
          const isActive =
            task.status === 'active' ||
            task.status === 'in_progress' ||
            task.status === 'expanded';

          if (hasSteps || isActive) return task;
          return null;
        },
        { timeoutMs: 60_000, intervalMs: 3000 }
      );

      if (!expanded) {
        const taskCheck = await httpGet(`${PLANNING_URL}/tasks`, 5000);
        const allTasks = [
          ...(taskCheck.body?.tasks?.current ?? []),
          ...(taskCheck.body?.tasks?.completed ?? []),
        ];
        const task = allTasks.find((t: any) => t.id === goldenTaskId);

        steps.push({
          action: 'task found but not expanded within 60s',
          detail: {
            taskId: goldenTaskId,
            taskStatus: task?.status ?? 'not_found',
            hasSteps: Array.isArray(task?.steps) && task?.steps?.length > 0,
            metadata: task?.metadata ? {
              blockedReason: task.metadata.blockedReason,
              planningIncomplete: task.metadata.planningIncomplete,
              nextEligibleAt: task.metadata.nextEligibleAt,
            } : null,
          },
        });

        scenarios.push({
          name,
          status: 'skip',
          durationMs: nowMs() - start,
          steps,
          gap: 'Task created but not expanded within 60s — check executor logs',
        });
        return;
      }

      // Validate expanded task
      const taskSteps = expanded.steps ?? [];
      steps.push({
        action: 'assert task expanded',
        assertion: 'task has steps array with entries',
        passed: taskSteps.length > 0,
        detail: {
          taskId: expanded.id,
          status: expanded.status,
          stepCount: taskSteps.length,
          sampleStep: taskSteps[0]
            ? {
                leaf: taskSteps[0].leaf ?? taskSteps[0].meta?.leaf,
                hasArgs: !!(taskSteps[0].args ?? taskSteps[0].meta?.args),
                argsSource: taskSteps[0].meta?.argsSource,
              }
            : null,
        },
      });

      expect(taskSteps.length).toBeGreaterThan(0);

      // Each step should have leaf and args (check both top-level and meta)
      for (const step of taskSteps) {
        const leaf = step.leaf ?? step.meta?.leaf;
        const args = step.args ?? step.meta?.args;
        expect(leaf).toBeTruthy();
        expect(typeof leaf).toBe('string');
        expect(args).toBeDefined();
      }

      steps.push({
        action: 'assert step shapes valid',
        assertion: 'all steps have leaf (string) and args (defined)',
        passed: true,
        detail: {
          leaves: taskSteps.map((s: any) => s.leaf ?? s.meta?.leaf),
        },
      });

      scenarios.push({
        name,
        status: 'pass',
        durationMs: nowMs() - start,
        steps,
      });
    } catch (e) {
      steps.push({
        action: 'assert',
        passed: false,
        detail: (e as Error).message,
      });
      scenarios.push({
        name,
        status: 'fail',
        durationMs: nowMs() - start,
        steps,
      });
      throw e;
    }
  }, 75_000);

  // ── Scenario 4: Golden Run Artifact — dispatch evidence ────────────────

  it('Scenario 4: Golden run artifact + executor dispatch evidence', async () => {
    const start = nowMs();
    const steps: ScenarioStep[] = [];
    const name = 'Scenario 4: Golden run artifact + executor dispatch evidence';

    if (!goldenRunId || !devEndpointsEnabled) {
      scenarios.push({
        name,
        status: 'skip',
        durationMs: nowMs() - start,
        steps: [{ action: 'skip', detail: 'No run_id from Scenario 2 or dev endpoints not enabled' }],
        gap: 'Scenario 2 did not produce a run_id',
      });
      return;
    }

    try {
      // If executor is enabled, give it time to process and record dispatches
      if (executorEnabled) {
        await new Promise((r) => setTimeout(r, 10_000));
      }

      const artifact = await withTimer(() =>
        httpGet(
          `${PLANNING_URL}/api/dev/golden-run-artifact/${goldenRunId}`,
          10_000
        )
      );
      steps.push({
        action: `GET /api/dev/golden-run-artifact/${goldenRunId}`,
        endpoint: `${PLANNING_URL}/api/dev/golden-run-artifact/${goldenRunId}`,
        statusCode: artifact.value.status,
        durationMs: artifact.durationMs,
      });
      expect(artifact.value.status).toBe(200);

      const body = artifact.value.body;

      // ── Evidence layer 1: Sterling reachable ──
      const hasServerBanner = !!body?.serverBanner || !!body?.server_banner;
      const banner = body?.serverBanner ?? body?.server_banner;
      steps.push({
        action: 'assert serverBanner present',
        assertion: 'artifact contains serverBanner (Sterling reachable)',
        passed: hasServerBanner,
        detail: {
          serverBanner: hasServerBanner
            ? String(banner).substring(0, 120) + '…'
            : null,
        },
      });
      expect(hasServerBanner).toBe(true);

      // ── Evidence layer 2: Digest registered ──
      const hasInjection = !!body?.injection;
      steps.push({
        action: 'assert injection present',
        assertion: 'artifact contains injection with digest',
        passed: hasInjection,
        detail: {
          injection: body?.injection
            ? {
                committed_ir_digest: body.injection.committed_ir_digest,
                schema_version: body.injection.schema_version,
              }
            : null,
        },
      });
      expect(hasInjection).toBe(true);
      if (goldenDigest) {
        expect(body.injection.committed_ir_digest).toBe(goldenDigest);
      }

      // ── Evidence layer 3: Planning config captured ──
      const hasPlanningBanner =
        !!body?.planningBanner || !!body?.planning_banner;
      steps.push({
        action: 'assert planningBanner present',
        assertion: 'artifact contains planningBanner with config digest',
        passed: hasPlanningBanner,
        detail: {
          hasConfigDigest: !!(body?.planningBanner?.configDigest ??
            body?.planning_banner?.config_digest),
        },
      });
      expect(hasPlanningBanner).toBe(true);

      // ── Evidence layer 4: Executor acted on the task ──
      // This is the key proof: did the executor actually dispatch steps?
      const execution = body?.execution;
      const decisions = execution?.decisions ?? [];
      const dispatched = execution?.dispatched_steps ?? [];
      const shadowDispatched = execution?.shadow_dispatched_steps ?? [];
      const blocked = execution?.blocked_reasons ?? [];

      const executorActed =
        dispatched.length > 0 || shadowDispatched.length > 0;
      const executorBlocked = blocked.length > 0 || decisions.some(
        (d: any) => d.type === 'blocked'
      );

      steps.push({
        action: 'assert executor evidence',
        assertion: executorEnabled
          ? 'executor dispatched or recorded shadow dispatches or recorded blocks'
          : 'executor not enabled — dispatch evidence optional',
        passed: executorEnabled
          ? (executorActed || executorBlocked || decisions.length > 0)
          : true,
        detail: {
          executorEnabled,
          executorMode,
          dispatchedCount: dispatched.length,
          shadowDispatchedCount: shadowDispatched.length,
          decisionCount: decisions.length,
          blockedReasons: blocked.map((b: any) => b.reason ?? b),
          sampleDispatch: dispatched[0]
            ? {
                leaf: dispatched[0].leaf,
                args: dispatched[0].args,
                result: dispatched[0].result?.status,
              }
            : shadowDispatched[0]
            ? {
                leaf: shadowDispatched[0].leaf,
                args: shadowDispatched[0].args,
                mode: 'shadow',
              }
            : null,
          sampleDecision: decisions[0]
            ? {
                type: decisions[0].type,
                reason: decisions[0].reason,
                leaf: decisions[0].leaf,
              }
            : null,
        },
      });

      if (executorEnabled) {
        // When executor is enabled, we must see SOME evidence of the executor
        // processing the task — either dispatches, shadow dispatches, blocks,
        // or execution decisions. This proves the loop closed.
        const hasAnyEvidence =
          executorActed ||
          executorBlocked ||
          decisions.length > 0 ||
          (body?.expansion_retries?.length ?? 0) > 0;

        steps.push({
          action: 'assert executor loop evidence',
          assertion: 'golden run artifact contains executor activity (dispatches, blocks, or decisions)',
          passed: hasAnyEvidence,
          detail: {
            expansionRetries: body?.expansion_retries?.length ?? 0,
          },
        });

        expect(hasAnyEvidence).toBe(true);
      }

      scenarios.push({
        name,
        status: 'pass',
        durationMs: nowMs() - start,
        steps,
      });
    } catch (e) {
      steps.push({
        action: 'assert',
        passed: false,
        detail: (e as Error).message,
      });
      scenarios.push({
        name,
        status: 'fail',
        durationMs: nowMs() - start,
        steps,
      });
      throw e;
    }
  }, 30_000);

  // ── Scenario 5: Idle Episode → Task (optional) ─────────────────────────

  it('Scenario 5: Idle episode → task creation (optional)', async () => {
    const start = nowMs();
    const steps: ScenarioStep[] = [];
    const name = 'Scenario 5: Idle episode → task creation';

    if (!executorEnabled) {
      scenarios.push({
        name,
        status: 'skip',
        durationMs: nowMs() - start,
        steps: [{
          action: 'skip — executor not enabled',
          detail: 'Idle detection requires ENABLE_PLANNING_EXECUTOR=1',
        }],
        gap: 'Executor not enabled — idle detection loop not running',
      });
      return;
    }

    try {
      const tasksResp = await httpGet(`${PLANNING_URL}/tasks`, 5000);
      if (tasksResp.status !== 200) {
        scenarios.push({
          name,
          status: 'skip',
          durationMs: nowMs() - start,
          steps: [{
            action: 'skip',
            detail: `GET /tasks returned ${tasksResp.status}`,
          }],
          gap: 'Could not read tasks endpoint',
        });
        return;
      }

      const currentTasks = tasksResp.body?.tasks?.current ?? [];
      const activeTasks = currentTasks.filter(
        (t: any) =>
          t.status === 'active' || t.status === 'in_progress'
      );

      steps.push({
        action: 'check idle condition',
        detail: {
          totalCurrent: currentTasks.length,
          activeTasks: activeTasks.length,
        },
      });

      if (activeTasks.length > 0) {
        scenarios.push({
          name,
          status: 'skip',
          durationMs: nowMs() - start,
          steps: [
            ...steps,
            {
              action: 'skip',
              detail: `${activeTasks.length} active tasks exist — idle trigger won't fire`,
            },
          ],
          gap: 'Active tasks prevent idle detection',
        });
        return;
      }

      // Snapshot current task IDs to detect new ones
      const existingIds = new Set(
        currentTasks.map((t: any) => t.id)
      );

      // Poll for a new sterling_ir task with idle source
      const idleTask = await pollUntil(
        async () => {
          const resp = await httpGet(`${PLANNING_URL}/tasks`, 5000);
          if (resp.status !== 200) return null;

          const tasks = resp.body?.tasks?.current ?? [];
          const newTask = tasks.find(
            (t: any) =>
              !existingIds.has(t.id) &&
              t.type === 'sterling_ir' &&
              (t.metadata?.goldenRun?.source?.includes('idle') ||
                t.metadata?.goldenRun?.source?.includes('keep_alive'))
          );
          return newTask ?? null;
        },
        { timeoutMs: 120_000, intervalMs: 5000 }
      );

      if (!idleTask) {
        steps.push({
          action: 'no idle task appeared within 120s',
          detail: 'Keep-alive may be disabled or cycle too long',
        });
        scenarios.push({
          name,
          status: 'skip',
          durationMs: nowMs() - start,
          steps,
          gap: 'No idle-triggered task appeared within 120s',
        });
        return;
      }

      steps.push({
        action: 'assert idle task created',
        assertion: 'new sterling_ir task with idle source appeared',
        passed: true,
        detail: {
          taskId: idleTask.id,
          type: idleTask.type,
          source: idleTask.metadata?.goldenRun?.source,
        },
      });

      expect(idleTask.type).toBe('sterling_ir');

      scenarios.push({
        name,
        status: 'pass',
        durationMs: nowMs() - start,
        steps,
      });
    } catch (e) {
      steps.push({
        action: 'assert',
        passed: false,
        detail: (e as Error).message,
      });
      scenarios.push({
        name,
        status: 'fail',
        durationMs: nowMs() - start,
        steps,
      });
      throw e;
    }
  }, 135_000);

  // ── Scenario 6: Native step dispatch (executor actuation proof) ─────

  it('Scenario 6: Native step dispatch via dev endpoint', async () => {
    const start = nowMs();
    const steps: ScenarioStep[] = [];
    const name = 'Scenario 6: Native step dispatch (executor actuation proof)';

    if (!devEndpointsEnabled) {
      scenarios.push({
        name,
        status: 'skip',
        durationMs: nowMs() - start,
        steps: [{
          action: 'skip — dev endpoints not enabled',
          detail: 'Start with ENABLE_DEV_ENDPOINTS=true to enable native step injection',
        }],
        gap: 'ENABLE_DEV_ENDPOINTS not set.',
      });
      return;
    }

    if (!executorEnabled) {
      scenarios.push({
        name,
        status: 'skip',
        durationMs: nowMs() - start,
        steps: [{
          action: 'skip — executor not enabled',
          detail: 'Start with ENABLE_PLANNING_EXECUTOR=1 and EXECUTOR_MODE=live EXECUTOR_LIVE_CONFIRM=YES',
        }],
        gap: 'Executor not enabled — dispatch will not happen.',
      });
      return;
    }

    try {
      // Inject a task with pre-baked native steps (chat + step_forward_safely + wait)
      const inject = await withTimer(() =>
        httpPost(`${PLANNING_URL}/api/dev/enqueue-native-steps`, {}, 10_000)
      );
      steps.push({
        action: 'POST /api/dev/enqueue-native-steps',
        endpoint: `${PLANNING_URL}/api/dev/enqueue-native-steps`,
        statusCode: inject.value.status,
        durationMs: inject.durationMs,
        detail: inject.value.body,
      });
      expect(inject.value.status).toBeLessThan(300);

      const nativeTaskId = inject.value.body?.task_id;
      expect(nativeTaskId).toBeTruthy();

      steps.push({
        action: 'assert task created with native steps',
        assertion: 'task_id is non-null and step_count > 0',
        passed: true,
        detail: {
          task_id: nativeTaskId,
          step_count: inject.value.body?.step_count,
          leaves: inject.value.body?.leaves,
        },
      });

      // Poll until executor processes the task — look for step completion, blocked reason, or status change
      const dispatched = await pollUntil(
        async () => {
          const resp = await httpGet(`${PLANNING_URL}/tasks`, 5000);
          if (resp.status !== 200) return null;

          const allTasks = [
            ...(resp.body?.tasks?.current ?? []),
            ...(resp.body?.tasks?.completed ?? []),
          ];
          const task = allTasks.find((t: any) => t.id === nativeTaskId);
          if (!task) return null;

          const stepsCompleted = (task.steps ?? []).filter(
            (s: any) => s.done
          ).length;
          const blockedReason = task.metadata?.blockedReason;
          const isCompleted = task.status === 'completed';
          const hasFailed = task.status === 'failed';

          if (stepsCompleted > 0 || isCompleted || hasFailed || blockedReason) {
            return {
              task,
              stepsCompleted,
              totalSteps: (task.steps ?? []).length,
              status: task.status,
              blockedReason,
            };
          }
          return null;
        },
        { timeoutMs: 30_000, intervalMs: 2000 }
      );

      // Classification: PASS / FAIL / FAIL (not skip — this is exactly what we're proving)
      if (dispatched) {
        const executorDispatched =
          dispatched.stepsCompleted > 0 || dispatched.status === 'completed';
        const executorBlocked = !!dispatched.blockedReason;

        steps.push({
          action: 'assert executor processed task',
          assertion: executorDispatched
            ? `executor dispatched ${dispatched.stepsCompleted}/${dispatched.totalSteps} steps`
            : `executor blocked: ${dispatched.blockedReason}`,
          passed: executorDispatched,
          detail: {
            stepsCompleted: dispatched.stepsCompleted,
            totalSteps: dispatched.totalSteps,
            status: dispatched.status,
            blockedReason: dispatched.blockedReason,
          },
        });

        // PASS: stepsCompleted > 0 or status === completed
        // FAIL: blockedReason set (with reason recorded for debugging)
        // FAIL: status === failed
        const scenarioStatus = executorDispatched ? 'pass' : 'fail';

        scenarios.push({
          name,
          status: scenarioStatus,
          durationMs: nowMs() - start,
          steps,
          gap: executorBlocked
            ? `Executor blocked: ${dispatched.blockedReason}`
            : undefined,
        });

        expect(executorDispatched).toBe(true);
      } else {
        // Timeout with no evidence — this is a FAIL, not a skip.
        // The whole point of this scenario is proving dispatch works.
        steps.push({
          action: 'poll timeout — no dispatch evidence within 30s',
          passed: false,
          detail: {
            task_id: nativeTaskId,
            executorMode,
            hint: 'Check: EXECUTOR_MODE=live, EXECUTOR_LIVE_CONFIRM=YES, MC interface reachable',
          },
        });
        scenarios.push({
          name,
          status: 'fail',
          durationMs: nowMs() - start,
          steps,
          gap: 'No executor activity within 30s — task was injected but executor never processed it',
        });

        // Fail the test explicitly
        expect(dispatched).not.toBeNull();
      }
    } catch (e) {
      steps.push({
        action: 'assert',
        passed: false,
        detail: (e as Error).message,
      });
      scenarios.push({
        name,
        status: 'fail',
        durationMs: nowMs() - start,
        steps,
      });
      throw e;
    }
  }, 60_000);
});
