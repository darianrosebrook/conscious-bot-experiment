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

/** Minimal report that passes all 7 checkpoints.
 *
 * Historical note: this helper previously included an `idle_episode`
 * field and the contract had 8 checkpoints. Both were deleted as part
 * of the keep-alive cauterization. See e2e-verification-contract.ts
 * for the rationale. Phase 2's IdleEngine will likely add a
 * replacement checkpoint and its corresponding schema field.
 */
function makeFullReport(): GoldenRunReport {
  return {
    schema_version: 'golden_run_report_v1',
    run_id: 'test-run-1',
    created_at: Date.now(),
    updated_at: Date.now(),
    task: {
      task_id: 'task-1',
      status: 'active',
    },
    expansion: {
      status: 'ok',
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
  it('full report passes all 7 checkpoints', () => {
    const result = validateE2EContract(makeFullReport());
    expect(result.passed).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.results).toHaveLength(7);
    result.results.forEach((r) => expect(r.passed).toBe(true));
  });

  it('empty report fails most checkpoints (tool_diagnostics and world_change pass conditionally)', () => {
    const empty: GoldenRunReport = {
      schema_version: 'golden_run_report_v1',
      run_id: 'empty',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const result = validateE2EContract(empty);
    expect(result.passed).toBe(false);
    // tool_diagnostics and world_change pass conditionally when no steps exist.
    // With 7 total checkpoints and 2 conditional passes on empty report,
    // 5 checkpoints should be missing (was 6 when idle_detection existed).
    expect(result.missing).toHaveLength(5);
    expect(result.missing).not.toContain('tool_diagnostics');
    expect(result.missing).not.toContain('world_change');
  });

  it('reports specific missing checkpoints', () => {
    const report = makeFullReport();
    report.loop_breaker_evaluated = undefined as any;

    const result = validateE2EContract(report);
    expect(result.passed).toBe(false);
    expect(result.missing).toContain('loop_breaker_evaluated');
    expect(result.missing).toHaveLength(1);
  });
});

describe('individual checkpoints', () => {
  // Historical note: two `idle_detection` test cases were removed here as
  // part of the keep-alive cauterization. They asserted that the checkpoint
  // passed with `idle_episode` present and failed without it. The checkpoint
  // itself has been deleted; Phase 2's IdleEngine will likely add a new
  // checkpoint (under a different name) with its own test coverage.

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

  it('tool_diagnostics: passes conditionally when no dispatched steps', () => {
    const report = makeFullReport();
    report.execution!.dispatched_steps = [];
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'tool_diagnostics');
    expect(cp?.passed).toBe(true);
    expect(cp?.detail).toContain('conditional pass');
  });

  it('world_change: passes conditionally when no dispatched results and no verification', () => {
    const report = makeFullReport();
    delete report.execution!.verification;
    report.execution!.dispatched_steps = [{ step_id: 'step-1', leaf: 'dig_block' }];
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'world_change');
    expect(cp?.passed).toBe(true);
    expect(cp?.detail).toContain('conditional pass');
  });

  it('world_change: fails when dispatched results exist but no verification', () => {
    const report = makeFullReport();
    delete report.execution!.verification;
    // Step has a result but no verification block — should fail
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'world_change');
    expect(cp?.passed).toBe(false);
    expect(cp?.detail).toContain('no verification block but dispatched steps have results');
  });
});
