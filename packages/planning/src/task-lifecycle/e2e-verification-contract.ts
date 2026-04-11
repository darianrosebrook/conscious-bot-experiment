/**
 * E2E Verification Contract — 7 checkpoints on GoldenRunReport.
 *
 * Each checkpoint proves a specific layer of the control plane was exercised.
 * `validateE2EContract(report)` returns `{ passed, missing }` for tests
 * and dashboard inspection.
 *
 * Historical note: this contract previously had 8 checkpoints including
 * `idle_detection`, which verified that the golden-run report contained
 * an `idle_episode` field populated by the deleted keep-alive subsystem's
 * `trySterlingIdleEpisode` pathway. Both the `idle_episode` schema field
 * on GoldenRunReport and the subsystem that populated it have been
 * deleted as part of the keep-alive cauterization. When Phase 2's
 * IdleEngine lands it will likely add a new checkpoint (and a new
 * corresponding schema field on the golden-run report) — at that point
 * the count returns to 8. Until then, the contract is 7.
 *
 * @author @darianrosebrook
 */

import type { GoldenRunReport } from '../golden-run-recorder';

// ---------------------------------------------------------------------------
// Checkpoint definitions
// ---------------------------------------------------------------------------

export type E2ECheckpoint =
  | 'sterling_reduction'
  | 'task_creation'
  | 'expansion_success'
  | 'dispatch'
  | 'tool_diagnostics'
  | 'world_change'
  | 'loop_breaker_evaluated';

export interface CheckpointResult {
  checkpoint: E2ECheckpoint;
  passed: boolean;
  /** Why this checkpoint passed/failed. */
  detail?: string;
}

export interface E2EContractResult {
  passed: boolean;
  results: CheckpointResult[];
  missing: E2ECheckpoint[];
}

// ---------------------------------------------------------------------------
// Checkpoint evaluators
// ---------------------------------------------------------------------------

function checkSterlingReduction(report: GoldenRunReport): CheckpointResult {
  const requested = (report as Record<string, unknown>).sterling_expand_requested != null
    || report.expansion != null;
  return {
    checkpoint: 'sterling_reduction',
    passed: requested,
    detail: requested ? 'expansion data present' : 'no expansion evidence',
  };
}

function checkTaskCreation(report: GoldenRunReport): CheckpointResult {
  const hasTask = report.task?.task_id != null;
  return {
    checkpoint: 'task_creation',
    passed: hasTask,
    detail: hasTask ? `task_id=${report.task?.task_id}` : 'no task.task_id',
  };
}

function checkExpansionSuccess(report: GoldenRunReport): CheckpointResult {
  const status = report.expansion?.status;
  // 'ok' means Sterling returned steps; 'blocked' with evidence is also acceptable
  const passed = status === 'ok' || status === 'blocked';
  return {
    checkpoint: 'expansion_success',
    passed: !!passed,
    detail: status ? `expansion.status=${status}` : 'no expansion.status',
  };
}

function checkDispatch(report: GoldenRunReport): CheckpointResult {
  const steps = report.execution?.dispatched_steps;
  const hasDispatch = Array.isArray(steps) && steps.length > 0 && steps[0]?.result != null;
  return {
    checkpoint: 'dispatch',
    passed: !!hasDispatch,
    detail: hasDispatch
      ? `${steps!.length} step(s) dispatched`
      : 'no dispatched_steps with results',
  };
}

function checkToolDiagnostics(report: GoldenRunReport): CheckpointResult {
  const steps = report.execution?.dispatched_steps ?? [];
  if (steps.length === 0) {
    return { checkpoint: 'tool_diagnostics', passed: true, detail: 'no dispatched steps (conditional pass)' };
  }
  const hasDiag = steps.some((s) => s.result?.toolDiagnostics != null);
  return {
    checkpoint: 'tool_diagnostics',
    passed: hasDiag,
    detail: hasDiag
      ? 'toolDiagnostics found on dispatched step'
      : 'no toolDiagnostics on any step',
  };
}

function checkWorldChange(report: GoldenRunReport): CheckpointResult {
  const verification = report.execution?.verification;
  const steps = report.execution?.dispatched_steps ?? [];
  if (!verification) {
    const hasResults = steps.some((s) => s.result != null);
    return {
      checkpoint: 'world_change',
      passed: !hasResults,
      detail: hasResults ? 'no verification block but dispatched steps have results' : 'no dispatched results (conditional pass)',
    };
  }
  // Verified or skipped both count as passing (observational tasks skip verification)
  const passed = verification.status === 'verified' || verification.status === 'skipped';
  return {
    checkpoint: 'world_change',
    passed,
    detail: `verification.status=${verification.status}`,
  };
}

function checkLoopBreakerEvaluated(report: GoldenRunReport): CheckpointResult {
  const evaluated = report.loop_breaker_evaluated === true;
  return {
    checkpoint: 'loop_breaker_evaluated',
    passed: evaluated,
    detail: evaluated
      ? `loop_episodes=${report.loop_episodes?.length ?? 0}`
      : 'loop_breaker_evaluated not set',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const ALL_EVALUATORS: Array<(r: GoldenRunReport) => CheckpointResult> = [
  checkSterlingReduction,
  checkTaskCreation,
  checkExpansionSuccess,
  checkDispatch,
  checkToolDiagnostics,
  checkWorldChange,
  checkLoopBreakerEvaluated,
];

/**
 * Validate all 7 E2E checkpoints against a GoldenRunReport.
 * Returns overall pass/fail and the list of missing checkpoints.
 * (The eighth checkpoint, `idle_detection`, was deleted along with
 * the keep-alive subsystem. Phase 2's IdleEngine will likely add a
 * replacement checkpoint under a new name.)
 */
export function validateE2EContract(report: GoldenRunReport): E2EContractResult {
  const results = ALL_EVALUATORS.map((fn) => fn(report));
  const missing = results.filter((r) => !r.passed).map((r) => r.checkpoint);
  return {
    passed: missing.length === 0,
    results,
    missing,
  };
}
