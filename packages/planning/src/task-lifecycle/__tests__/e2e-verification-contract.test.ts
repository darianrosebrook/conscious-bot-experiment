/**
 * Tests for E2E Verification Contract checkpoints.
 *
 * Validates each checkpoint individually and the overall contract evaluation.
 */

import { describe, it, expect } from 'vitest';
import {
  validateE2EContract,
  type E2ECheckpoint,
} from '../e2e-verification-contract';
import type { GoldenRunReport } from '../../golden-run-recorder';

/** Minimal report that passes all 8 checkpoints. */
function makeFullReport(): GoldenRunReport {
  return {
    schema_version: 'golden_run_report_v1',
    run_id: 'test-run-1',
    created_at: Date.now(),
    updated_at: Date.now(),
    idle_episode: {
      idle_reason: 'no_tasks',
    },
    task: {
      task_id: 'task-1',
      task_type: 'sterling_ir',
    },
    expansion: {
      status: 'ok',
      steps_count: 3,
    },
    execution: {
      dispatched_steps: [
        {
          step_id: 'step-1',
          leaf: 'collect_items',
          result: {
            status: 'ok',
            toolDiagnostics: { _diag_version: 1, reason_code: 'collected_ok' },
          },
        },
      ],
      verification: {
        status: 'verified',
        kind: 'inventory_delta',
      },
    },
    loop_breaker_evaluated: true,
    loop_episodes: [],
  };
}

describe('validateE2EContract', () => {
  it('full report passes all 8 checkpoints', () => {
    const result = validateE2EContract(makeFullReport());
    expect(result.passed).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.results).toHaveLength(8);
    result.results.forEach((r) => expect(r.passed).toBe(true));
  });

  it('empty report fails all checkpoints', () => {
    const empty: GoldenRunReport = {
      schema_version: 'golden_run_report_v1',
      run_id: 'empty',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const result = validateE2EContract(empty);
    expect(result.passed).toBe(false);
    expect(result.missing).toHaveLength(8);
  });

  it('reports specific missing checkpoints', () => {
    const report = makeFullReport();
    delete report.idle_episode;
    report.loop_breaker_evaluated = undefined as any;

    const result = validateE2EContract(report);
    expect(result.passed).toBe(false);
    expect(result.missing).toContain('idle_detection');
    expect(result.missing).toContain('loop_breaker_evaluated');
    expect(result.missing).toHaveLength(2);
  });
});

describe('individual checkpoints', () => {
  it('idle_detection: passes with idle_episode', () => {
    const report = makeFullReport();
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'idle_detection');
    expect(cp?.passed).toBe(true);
  });

  it('idle_detection: fails without idle_episode', () => {
    const report = makeFullReport();
    delete report.idle_episode;
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'idle_detection');
    expect(cp?.passed).toBe(false);
  });

  it('task_creation: passes with task_id', () => {
    const report = makeFullReport();
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'task_creation');
    expect(cp?.passed).toBe(true);
    expect(cp?.detail).toContain('task-1');
  });

  it('expansion_success: passes for ok or blocked', () => {
    const report = makeFullReport();
    report.expansion!.status = 'blocked';
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'expansion_success');
    expect(cp?.passed).toBe(true);
  });

  it('dispatch: requires at least one step with result', () => {
    const report = makeFullReport();
    report.execution!.dispatched_steps = [{ step_id: 'step-1', leaf: 'dig_block' }];
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'dispatch');
    expect(cp?.passed).toBe(false);
  });

  it('tool_diagnostics: requires toolDiagnostics on at least one step', () => {
    const report = makeFullReport();
    report.execution!.dispatched_steps![0].result = { status: 'ok' };
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'tool_diagnostics');
    expect(cp?.passed).toBe(false);
  });

  it('world_change: skipped verification passes', () => {
    const report = makeFullReport();
    report.execution!.verification = { status: 'skipped' };
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'world_change');
    expect(cp?.passed).toBe(true);
  });

  it('world_change: failed verification does not pass', () => {
    const report = makeFullReport();
    report.execution!.verification = { status: 'failed' };
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'world_change');
    expect(cp?.passed).toBe(false);
  });

  it('loop_breaker_evaluated: requires explicit true', () => {
    const report = makeFullReport();
    report.loop_breaker_evaluated = false;
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'loop_breaker_evaluated');
    expect(cp?.passed).toBe(false);
  });

  it('loop_breaker_evaluated: detail shows episode count', () => {
    const report = makeFullReport();
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'loop_breaker_evaluated');
    expect(cp?.detail).toContain('loop_episodes=0');
  });
});
