/**
 * Types for the Sterling step executor.
 * Dependencies are injected via context for testability (SOLID DIP).
 *
 * @author @darianrosebrook
 */

import type { GoldenRunVerification } from '../golden-run-recorder';
import type { LoopDetectedEpisodeV1 } from '../task-lifecycle/loop-breaker';

export interface SterlingStepExecutorConfig {
  buildExecBudgetDisabled: boolean;
  buildExecMaxAttempts: number;
  buildExecMinIntervalMs: number;
  buildExecMaxElapsedMs: number;
  buildingLeaves: Set<string>;
  taskTypeBridgeLeafNames: Set<string>;
  enableTaskTypeBridge: boolean;
  /** Allow dig_block -> acquire_material rewrite in live/cert. Default false (Policy A: allow-but-measure). */
  legacyLeafRewriteEnabled: boolean;
}

export interface SterlingStepExecutorContext {
  config: SterlingStepExecutorConfig;
  leafAllowlist: Set<string>;
  mode: 'shadow' | 'live';

  updateTaskMetadata: (taskId: string, patch: Record<string, unknown>) => void;
  startTaskStep: (
    taskId: string,
    stepId: string,
    opts?: { dryRun?: boolean }
  ) => Promise<boolean>;
  completeTaskStep: (
    taskId: string,
    stepId: string,
    opts?: Record<string, unknown>
  ) => Promise<boolean>;
  emit: (event: string, payload: unknown) => void;

  executeTool: (
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ) => Promise<{
    ok?: boolean;
    error?: string;
    data?: unknown;
    failureCode?: string;
  }>;

  canExecuteStep: () => boolean;
  recordStepExecuted: () => void;

  getAbortSignal: () => AbortSignal | undefined;
  getGoldenRunRecorder: () => {
    recordExecutorBlocked: (
      runId: string,
      reason: string,
      detail?: Record<string, unknown>,
      taskId?: string
    ) => void;
    recordShadowDispatch: (
      runId: string,
      payload: Record<string, unknown>
    ) => void;
    recordVerification: (runId: string, payload: GoldenRunVerification) => void;
    recordDispatch: (runId: string, payload: Record<string, unknown>) => void;
    recordRegenerationAttempt: (
      runId: string,
      data: { success: boolean; reason?: string }
    ) => void;
    recordLeafRewriteUsed: (
      runId: string,
      payload: { leaf: string; originalLeaf: string }
    ) => void;
    recordLoopDetected: (runId: string, episode: LoopDetectedEpisodeV1) => void;
    markLoopBreakerEvaluated: (runId: string) => void;
  };
  toDispatchResult: (
    actionResult: Record<string, unknown> | null | undefined
  ) => Record<string, unknown> | undefined;

  introspectRecipe: (recipe: string) => Promise<{
    inputs: Array<{ item: string; count: number }>;
  } | null>;
  fetchInventorySnapshot: () => Promise<Array<Record<string, unknown>>>;
  getCount: (inv: Array<Record<string, unknown>>, item: string) => number;
  injectDynamicPrereqForCraft: (task: unknown, opts?: { recipe?: string; qty?: number; toolDiagnostics?: any }) => Promise<boolean>;

  emitExecutorBudgetEvent: (
    taskId: string,
    stepId: string,
    leafName: string,
    reason: string,
    extra?: Record<string, unknown>
  ) => void;
  getStepBudgetState: (
    task: unknown,
    stepId: string
  ) => {
    meta: Record<string, unknown>;
    budgets: Record<string, unknown>;
    state: { attempts?: number; firstAt?: number; lastAt?: number };
    created: boolean;
  };
  persistStepBudget: (task: unknown, budgets: Record<string, unknown>) => void;

  updateTaskProgress: (
    taskId: string,
    progress: number,
    status: string
  ) => void;
  recomputeProgressAndMaybeComplete: (task: unknown) => Promise<void>;
  regenerateSteps: (
    taskId: string,
    failureContext: Record<string, unknown>
  ) => Promise<{ success: boolean; stepsDigest?: string; reason?: string }>;

  getThreatSnapshot: () => Promise<{
    overallThreatLevel: string;
    threats: Array<{ type: string; distance: number }>;
  }>;
}
