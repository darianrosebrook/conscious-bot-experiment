import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  GoldenRunRecorder,
  toDispatchResult,
  type ExecutionDecision,
} from '../golden-run-recorder';

async function readJson(filePath: string) {
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data);
}

describe('GoldenRunRecorder', () => {
  it('merges updates and writes report file', async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golden-run-'));
    const recorder = new GoldenRunRecorder(baseDir);
    const runId = 'test-run-1';

    recorder.recordInjection(runId, {
      committed_ir_digest: 'digest-1',
      schema_version: 'v1',
    });
    recorder.recordTask(runId, { task_id: 'task-1', status: 'pending' });
    recorder.recordDispatch(runId, {
      step_id: 'step-1',
      leaf: 'acquire_material',
      args: { item: 'oak_log' },
      dispatched_at: Date.now(),
    });
    recorder.recordVerification(runId, {
      status: 'verified',
      kind: 'inventory_delta',
      detail: { item: 'oak_log', delta: 1 },
    });

    const reportPath = path.join(baseDir, `golden-${runId}.json`);
    for (let i = 0; i < 10; i += 1) {
      try {
        await fs.access(reportPath);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 25));
      }
    }

    const report = await readJson(reportPath);
    expect(report.schema_version).toBe('golden_run_report_v1');
    expect(report.run_id).toBe(runId);
    expect(report.injection?.committed_ir_digest).toBe('digest-1');
    expect(report.task?.task_id).toBe('task-1');
    expect(report.execution?.dispatched_steps?.length).toBe(1);
    expect(report.execution?.verification?.status).toBe('verified');
  });

  it('sanitizes run_id for file output and report', async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golden-run-'));
    const recorder = new GoldenRunRecorder(baseDir);
    const runId = '../weird//id';

    recorder.recordInjection(runId, {
      committed_ir_digest: 'digest-2',
      schema_version: 'v1',
    });

    const sanitized = 'weird_id';
    const reportPath = path.join(baseDir, `golden-${sanitized}.json`);
    for (let i = 0; i < 10; i += 1) {
      try {
        await fs.access(reportPath);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 25));
      }
    }

    const report = await readJson(reportPath);
    expect(report.run_id).toBe(sanitized);
    expect(report.injection?.committed_ir_digest).toBe('digest-2');
  });

  it('records executor_blocked_reason and payload when dispatch does not occur', async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golden-run-'));
    const recorder = new GoldenRunRecorder(baseDir);
    const runId = 'blocked-run-1';

    recorder.recordInjection(runId, {
      committed_ir_digest: 'd1',
      schema_version: '1.0',
    });
    recorder.recordExecutorBlocked(runId, 'unknown_leaf', {
      leaf: 'task_type_craft',
      args: { target: 'plank' },
    });

    const reportPath = path.join(baseDir, `golden-${runId}.json`);
    for (let i = 0; i < 10; i += 1) {
      try {
        await fs.access(reportPath);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 25));
      }
    }

    const report = await readJson(reportPath);
    expect(report.execution?.executor_blocked_reason).toBe('unknown_leaf');
    expect(report.execution?.executor_blocked_payload?.leaf).toBe(
      'task_type_craft'
    );
    expect(report.execution?.executor_blocked_payload?.args).toEqual({
      target: 'plank',
    });
    expect(Array.isArray(report.execution?.decisions)).toBe(true);
    expect(report.execution.decisions).toHaveLength(1);
    expect(report.execution.decisions[0]).toMatchObject({
      reason: 'unknown_leaf',
      leaf: 'task_type_craft',
    });
    expect(typeof report.execution.decisions[0].ts).toBe('number');
  });

  it('appends execution.decisions in order for block then dispatch then block', () => {
    const recorder = new GoldenRunRecorder();
    const runId = 'decisions-run-1';
    recorder.recordExecutorBlocked(runId, 'rate_limited', {
      leaf: 'craft_recipe',
    });
    recorder.recordDispatch(runId, {
      step_id: 'step-1',
      leaf: 'craft_recipe',
      args: { recipe: 'oak_planks', qty: 4 },
      dispatched_at: Date.now(),
    });
    recorder.recordExecutorBlocked(runId, 'planning_incomplete', {
      leaf: 'unknown_leaf',
    });

    const report = recorder.getReport(runId);
    expect(report).not.toBeNull();
    const decisions = report!.execution?.decisions as ExecutionDecision[] | undefined;
    expect(decisions).toBeDefined();
    expect(decisions).toHaveLength(3);
    expect(decisions![0].reason).toBe('rate_limited');
    expect(decisions![0].leaf).toBe('craft_recipe');
    expect(decisions![1].reason).toBe('dispatch');
    expect(decisions![1].leaf).toBe('craft_recipe');
    expect(decisions![1].step_id).toBe('step-1');
    expect(decisions![2].reason).toBe('planning_incomplete');
    expect(decisions![2].leaf).toBe('unknown_leaf');
  });

  it('throttles duplicate recordExecutorBlocked (same runId, reason, leaf) within window', async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golden-run-'));
    const recorder = new GoldenRunRecorder(baseDir);
    const runId = 'throttle-run-1';

    recorder.recordExecutorBlocked(runId, 'rate_limited', {
      leaf: 'craft_recipe',
    });
    recorder.recordExecutorBlocked(runId, 'rate_limited', {
      leaf: 'craft_recipe',
    });

    const report = recorder.getReport(runId);
    expect(report).not.toBeNull();
    expect(report!.execution?.executor_blocked_reason).toBe('rate_limited');
    expect(report!.execution?.executor_blocked_payload?.leaf).toBe(
      'craft_recipe'
    );
  });

  it('derives loop_started true when dispatch or shadow_steps exist (written artifact)', async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golden-run-'));
    const recorder = new GoldenRunRecorder(baseDir);
    const runId = 'loop-derived-1';

    recorder.recordRuntime(runId, {
      executor: { enabled: true, mode: 'shadow', loop_started: false },
    });
    recorder.recordShadowDispatch(runId, {
      step_id: 's1',
      leaf: 'task_type_craft',
      args: {},
      observed_at: Date.now(),
    });

    const reportPath = path.join(baseDir, `golden-${runId}.json`);
    for (let i = 0; i < 10; i += 1) {
      try {
        await fs.access(reportPath);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 25));
      }
    }

    const report = await readJson(reportPath);
    expect(report.execution?.shadow_steps?.length).toBe(1);
    expect(report.runtime?.executor?.loop_started).toBe(true);
  });

  it('records shadow dispatch once per (run_id, step_id); duplicate step_id is ignored', async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golden-run-'));
    const recorder = new GoldenRunRecorder(baseDir);
    const runId = 'idem-run-1';
    const stepId = 'step-abc';
    const t = Date.now();

    recorder.recordShadowDispatch(runId, {
      step_id: stepId,
      leaf: 'task_type_craft',
      args: {},
      observed_at: t,
    });
    recorder.recordShadowDispatch(runId, {
      step_id: stepId,
      leaf: 'task_type_craft',
      args: {},
      observed_at: t + 100,
    });

    const reportPath = path.join(baseDir, `golden-${runId}.json`);
    for (let i = 0; i < 10; i += 1) {
      try {
        await fs.access(reportPath);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 25));
      }
    }

    const report = await readJson(reportPath);
    expect(report.execution?.shadow_steps?.length).toBe(1);
  });

  it('derives certifiable false when bridge_enabled is true', () => {
    const recorder = new GoldenRunRecorder('/tmp/golden-cert');
    recorder.recordPlanningBanner(
      'cert-run-1',
      'PLANNING_SERVER_BANNER file=planning run_mode=dev capabilities=task_type_bridge config_digest=abc',
      'abc',
      true
    );
    const report = recorder.getReport('cert-run-1');
    expect(report?.runtime?.bridge_enabled).toBe(true);
    expect(report?.runtime?.certifiable).toBe(false);
  });

  it('derives certifiable true when bridge_enabled is false', () => {
    const recorder = new GoldenRunRecorder('/tmp/golden-cert2');
    recorder.recordPlanningBanner(
      'cert-run-2',
      'PLANNING_SERVER_BANNER file=planning run_mode=dev config_digest=def',
      'def',
      false
    );
    const report = recorder.getReport('cert-run-2');
    expect(report?.runtime?.bridge_enabled).toBe(false);
    expect(report?.runtime?.certifiable).toBe(true);
  });

  it('records dispatch with result for live proof (tool attempt recorded)', async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golden-run-'));
    const recorder = new GoldenRunRecorder(baseDir);
    const runId = 'live-proof-1';

    recorder.recordDispatch(runId, {
      step_id: 'step-1',
      leaf: 'craft_recipe',
      args: { recipe: 'oak_planks' },
      dispatched_at: Date.now(),
      result: toDispatchResult({ ok: true }),
    });

    const report = recorder.getReport(runId);
    expect(report?.execution?.dispatched_steps?.length).toBe(1);
    expect(report?.execution?.dispatched_steps?.[0]?.result).toEqual({
      status: 'ok',
    });
  });

  it('toDispatchResult converts error outcome to result shape', () => {
    expect(toDispatchResult({ ok: false, error: 'Bot not connected' })).toEqual(
      {
        status: 'error',
        error: 'Bot not connected',
        failureCode: undefined,
      }
    );
  });

  it('toDispatchResult converts shadow-blocked outcome to result shape', () => {
    expect(toDispatchResult({ ok: false, shadowBlocked: true })).toEqual({
      status: 'blocked',
      reason: 'shadow',
    });
  });

  describe('merge preservation: partial task patch does not erase richer task fields', () => {
    it('recordExecutorBlocked with taskId preserves existing task.title and task.status', () => {
      const recorder = new GoldenRunRecorder();
      const runId = 'merge-preserve-1';
      const taskId = 'task-merge-1';

      // Step 1: recordTask sets rich task data
      recorder.recordTask(runId, {
        task_id: taskId,
        title: 'Craft wooden pickaxe',
        status: 'in_progress',
      });

      // Step 2: recordExecutorBlocked patches {task: {task_id}} only
      recorder.recordExecutorBlocked(
        runId,
        'planning_incomplete',
        { leaf: 'craft_recipe' },
        taskId
      );

      // Assert: title and status survived the partial merge
      const report = recorder.getReport(runId);
      expect(report).not.toBeNull();
      expect(report?.task?.task_id).toBe(taskId);
      expect(report?.task?.title).toBe('Craft wooden pickaxe');
      expect(report?.task?.status).toBe('in_progress');
    });

    it('recordExecutorBlocked without taskId does not erase existing task', () => {
      const recorder = new GoldenRunRecorder();
      const runId = 'merge-preserve-2';

      recorder.recordTask(runId, {
        task_id: 'task-no-erase',
        title: 'Mine diamonds',
        status: 'pending',
      });

      // Block without taskId — should not touch task at all
      recorder.recordExecutorBlocked(runId, 'rate_limited', {
        leaf: 'acquire_material',
      });

      const report = recorder.getReport(runId);
      expect(report?.task?.task_id).toBe('task-no-erase');
      expect(report?.task?.title).toBe('Mine diamonds');
    });

    it('recordExecutorBlocked before recordTask does not prevent later enrichment', () => {
      const recorder = new GoldenRunRecorder();
      const runId = 'merge-preserve-3';
      const taskId = 'task-late-enrich';

      // Block first (only task_id set)
      recorder.recordExecutorBlocked(
        runId,
        'unknown_leaf',
        { leaf: 'dig_block' },
        taskId
      );

      // Then recordTask enriches with title/status
      recorder.recordTask(runId, {
        task_id: taskId,
        title: 'Build shelter',
        status: 'pending',
      });

      const report = recorder.getReport(runId);
      expect(report?.task?.task_id).toBe(taskId);
      expect(report?.task?.title).toBe('Build shelter');
      expect(report?.task?.status).toBe('pending');
    });
  });

  describe('getLatestReportByTaskId (6.5)', () => {
    it('returns report when taskId has recordTask; two runs for same taskId returns newer', () => {
      const recorder = new GoldenRunRecorder();
      const taskId = 'task-index-1';
      const run1 = 'run-index-1';
      const run2 = 'run-index-2';

      recorder.recordTask(run1, { task_id: taskId, status: 'pending' });
      recorder.recordInjection(run1, { committed_ir_digest: 'd1' });
      expect(recorder.getLatestReportByTaskId(taskId)).not.toBeNull();
      expect(recorder.getLatestReportByTaskId(taskId)?.run_id).toBe(run1);

      recorder.recordTask(run2, { task_id: taskId, status: 'in_progress' });
      recorder.recordInjection(run2, { committed_ir_digest: 'd2' });
      expect(recorder.getLatestReportByTaskId(taskId)).not.toBeNull();
      expect(recorder.getLatestReportByTaskId(taskId)?.run_id).toBe(run2);
      expect(recorder.getLatestReportByTaskId(taskId)?.injection?.committed_ir_digest).toBe('d2');
    });

    it('returns null when taskId has no known run', () => {
      const recorder = new GoldenRunRecorder();
      expect(recorder.getLatestReportByTaskId('unknown-task-xyz')).toBeNull();
    });

    it('index is updated by block-only activity (recordExecutorBlocked)', () => {
      const recorder = new GoldenRunRecorder();
      const runId = 'block-only-run';
      const taskId = 'task-block-only';

      recorder.recordTask(runId, { task_id: taskId, status: 'pending' });
      recorder.recordExecutorBlocked(runId, 'unknown_leaf', { leaf: 'dig_block' });

      const report = recorder.getLatestReportByTaskId(taskId);
      expect(report).not.toBeNull();
      expect(report?.run_id).toBe(runId);
      expect(report?.execution?.executor_blocked_reason).toBe('unknown_leaf');
    });
  });
});
