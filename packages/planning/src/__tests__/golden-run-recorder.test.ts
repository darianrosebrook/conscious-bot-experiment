import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { GoldenRunRecorder } from '../golden-run-recorder';

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

    recorder.recordInjection(runId, { committed_ir_digest: 'd1', schema_version: '1.0' });
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
    expect(report.execution?.executor_blocked_payload?.leaf).toBe('task_type_craft');
    expect(report.execution?.executor_blocked_payload?.args).toEqual({ target: 'plank' });
  });
});
