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

/** Minimal report that passes all 8 checkpoints.
 *
 * Phase 2 note: the `idle_goal_request` field was added as part of the
 * cauterize-and-regrow work. It replaces the deleted `idle_episode`
 * field from the old keep-alive subsystem. Same checkpoint count (8),
 * different schema shape, honest provenance tagging — decision_kind
 * carries the IdleEngine tagged-union variant so operators can
 * distinguish "goal succeeded" from "Sterling had no policy" from
 * "Sterling was unavailable."
 */
function makeFullReport(): GoldenRunReport {
  return {
    schema_version: 'golden_run_report_v1',
    run_id: 'test-run-1',
    created_at: Date.now(),
    updated_at: Date.now(),
    idle_goal_request: {
      decision_kind: 'goal',
      committed_ir_digest: 'ir_test_digest',
      committed_goal_prop_id: 'prop_test',
      duration_ms: 42,
    },
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
  it('full report passes all 8 checkpoints', () => {
    const result = validateE2EContract(makeFullReport());
    expect(result.passed).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.results).toHaveLength(8);
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
    // With 8 total checkpoints and 2 conditional passes on empty report,
    // 6 checkpoints should be missing.
    expect(result.missing).toHaveLength(6);
    expect(result.missing).not.toContain('tool_diagnostics');
    expect(result.missing).not.toContain('world_change');
  });

  it('reports specific missing checkpoints', () => {
    const report = makeFullReport();
    delete report.idle_goal_request;
    report.loop_breaker_evaluated = undefined as any;

    const result = validateE2EContract(report);
    expect(result.passed).toBe(false);
    expect(result.missing).toContain('idle_goal_requested');
    expect(result.missing).toContain('loop_breaker_evaluated');
    expect(result.missing).toHaveLength(2);
  });
});

describe('individual checkpoints', () => {
  it('idle_goal_requested: passes with idle_goal_request present', () => {
    const report = makeFullReport();
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'idle_goal_requested');
    expect(cp?.passed).toBe(true);
    expect(cp?.detail).toContain('decision=goal');
  });

  it('idle_goal_requested: fails without idle_goal_request', () => {
    const report = makeFullReport();
    delete report.idle_goal_request;
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'idle_goal_requested');
    expect(cp?.passed).toBe(false);
  });

  it('idle_goal_requested: passes even when decision was no_policy', () => {
    // The checkpoint verifies that IdleEngine RAN, not that it succeeded.
    // no_policy is a legitimate IdleEngine response (Sterling had nothing
    // to commit). The checkpoint should still pass as long as provenance
    // was recorded.
    const report = makeFullReport();
    report.idle_goal_request = {
      decision_kind: 'no_policy',
      reason: 'no_committed_goal_prop',
      duration_ms: 35,
    };
    const result = validateE2EContract(report);
    const cp = result.results.find((r) => r.checkpoint === 'idle_goal_requested');
    expect(cp?.passed).toBe(true);
    expect(cp?.detail).toContain('decision=no_policy');
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
