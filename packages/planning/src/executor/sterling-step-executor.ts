/**
 * Sterling step executor: validates, guards, and dispatches one Sterling step.
 * Extracted from modular-server for testability (SOLID SRP, DIP).
 *
 * Pipeline: stepToLeafExecution -> normalize -> validate -> allowlist -> shadow/live -> execute
 *
 * @author @darianrosebrook
 */

import {
  stepToLeafExecution,
  SENTINEL_RECIPE,
  SENTINEL_INPUT,
} from '../modules/step-to-leaf-execution';
import {
  normalizeLeafArgs,
  validateLeafArgs,
} from '../modules/leaf-arg-contracts';
import { isDeterministicFailure } from '../server/task-action-resolver';
import type { SterlingStepExecutorContext } from './sterling-step-executor.types';

/** Backoff for deterministic blocks (planner/materializer must change). Eligibility logic respects nextEligibleAt. */
const DETERMINISTIC_BLOCK_BACKOFF_MS = 300_000; // 5 minutes

/** Backoff for transient blocks (world/runtime must change). Short so task becomes eligible again after condition clears. */
const TRANSIENT_BLOCK_BACKOFF_MS = 30_000; // 30 seconds

/** Returns true when the error string indicates the bot is mid-navigation. */
function isNavigatingError(error: string | undefined | null): boolean {
  if (!error) return false;
  return /already navigating/i.test(error);
}

/**
 * Execute one Sterling step for a task.
 * All side effects go through the injected context.
 */
export async function executeSterlingStep(
  task: {
    id: string;
    title?: string;
    steps?: unknown[];
    metadata?: Record<string, unknown>;
    progress?: number;
  },
  nextStep: {
    id: string;
    order?: number;
    label?: string;
    done?: boolean;
    meta?: Record<string, unknown>;
  },
  ctx: SterlingStepExecutorContext
): Promise<void> {
  const stepId = String(nextStep.id || nextStep.order || 'unknown');
  const runId = (
    (task.metadata as Record<string, unknown>)?.goldenRun as
      | Record<string, unknown>
      | undefined
  )?.runId as string | undefined;

  // Planning-incomplete: normalizer could not materialize Option A for at least one step (deterministic: condition does not clear without plan mutation). Check before leaf resolution so unknown-leaf steps also get backoff (no hot-loop).
  if ((task.metadata as Record<string, unknown>)?.planningIncomplete === true) {
    ctx.updateTaskMetadata(task.id, {
      blockedReason: 'planning_incomplete',
      nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS,
    });
    if (runId) {
      const leafName = (nextStep.meta?.leaf as string) ?? 'unknown';
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        'planning_incomplete',
        { leaf: leafName }
      );
    }
    return;
  }

  const leafExec = stepToLeafExecution(nextStep);
  if (!leafExec) {
    if (runId) {
      ctx.getGoldenRunRecorder().recordExecutorBlocked(runId, 'unknown_leaf', {
        leaf: (nextStep.meta?.leaf as string) ?? 'unknown',
      });
    }
    return;
  }

  const { config, leafAllowlist, mode } = ctx;

  // Live mode: block derived args (Option A requires explicit executor-native args)
  if (mode === 'live' && leafExec.argsSource === 'derived') {
    ctx.updateTaskMetadata(task.id, {
      blockedReason: 'derived_args_not_allowed_live',
      nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS,
    });
    if (runId) {
      const blockPayload: Record<string, unknown> = {
        leaf: leafExec.leafName,
        argsSource: leafExec.argsSource,
      };
      if (leafExec.originalLeaf) blockPayload.original_leaf = leafExec.originalLeaf;
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        'derived_args_not_allowed_live',
        blockPayload
      );
    }
    return;
  }

  // Live mode: reject sentinel values that indicate missing/fallback args
  if (mode === 'live') {
    const recipeSentinel =
      leafExec.leafName === 'craft_recipe' &&
      leafExec.args.recipe === SENTINEL_RECIPE;
    const inputSentinel =
      leafExec.leafName === 'smelt' && leafExec.args.input === SENTINEL_INPUT;
    if (recipeSentinel || inputSentinel) {
      ctx.updateTaskMetadata(task.id, {
        blockedReason: 'sentinel_args_not_allowed_live',
        nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS,
      });
      if (runId) {
      const sentinelPayload: Record<string, unknown> = {
        leaf: leafExec.leafName,
        args: leafExec.args,
        sentinel: recipeSentinel ? 'recipe' : 'input',
      };
      if (leafExec.originalLeaf) sentinelPayload.original_leaf = leafExec.originalLeaf;
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        'sentinel_args_not_allowed_live',
        sentinelPayload
      );
      }
      return;
    }
  }

  // Build budget check (for building leaves)
  if (
    !config.buildExecBudgetDisabled &&
    config.buildingLeaves.has(leafExec.leafName)
  ) {
    const now = Date.now();
    const { budgets, state, created } = ctx.getStepBudgetState(task, stepId);
    let budgetDirty = created;
    const elapsed = now - (state.firstAt || now);
    if (elapsed > config.buildExecMaxElapsedMs) {
      ctx.updateTaskMetadata(task.id, {
        blockedReason: `budget-exhausted:time:${leafExec.leafName}`,
      });
      const runId = (
        (task.metadata as Record<string, unknown>)?.goldenRun as
          | Record<string, unknown>
          | undefined
      )?.runId as string | undefined;
      if (runId) {
        ctx
          .getGoldenRunRecorder()
          .recordExecutorBlocked(runId, 'budget_exhausted', {
            leaf: leafExec.leafName,
            validation_error: `max_elapsed:${leafExec.leafName}`,
          });
      }
      ctx.emitExecutorBudgetEvent(
        task.id,
        stepId,
        leafExec.leafName,
        'max_elapsed',
        { elapsedMs: elapsed }
      );
      return;
    }
    if ((state.attempts ?? 0) >= config.buildExecMaxAttempts) {
      ctx.updateTaskMetadata(task.id, {
        blockedReason: `budget-exhausted:attempts:${leafExec.leafName}`,
      });
      const runId = (
        (task.metadata as Record<string, unknown>)?.goldenRun as
          | Record<string, unknown>
          | undefined
      )?.runId as string | undefined;
      if (runId) {
        ctx
          .getGoldenRunRecorder()
          .recordExecutorBlocked(runId, 'budget_exhausted', {
            leaf: leafExec.leafName,
            validation_error: `max_attempts:${leafExec.leafName}`,
          });
      }
      ctx.emitExecutorBudgetEvent(
        task.id,
        stepId,
        leafExec.leafName,
        'max_attempts',
        { attempts: state.attempts ?? 0 }
      );
      return;
    }
    if (state.lastAt && now - state.lastAt < config.buildExecMinIntervalMs) {
      const delay =
        config.buildExecMinIntervalMs - (now - (state.lastAt ?? now));
      ctx.updateTaskMetadata(task.id, {
        nextEligibleAt: now + delay,
      });
      const runId = (
        (task.metadata as Record<string, unknown>)?.goldenRun as
          | Record<string, unknown>
          | undefined
      )?.runId as string | undefined;
      if (runId) {
        ctx
          .getGoldenRunRecorder()
          .recordExecutorBlocked(runId, 'rate_limited', {
            leaf: leafExec.leafName,
            validation_error: `min_interval:${delay}ms`,
          });
      }
      ctx.emitExecutorBudgetEvent(
        task.id,
        stepId,
        leafExec.leafName,
        'rate_limited',
        { delayMs: delay }
      );
      return;
    }
    (state as Record<string, unknown>).attempts =
      ((state.attempts ?? 0) as number) + 1;
    (state as Record<string, unknown>).lastAt = now;
    budgetDirty = true;
    if (budgetDirty)
      ctx.persistStepBudget(task, budgets as Record<string, unknown>);
  }

  normalizeLeafArgs(leafExec.leafName, leafExec.args);
  const validationError = validateLeafArgs(
    leafExec.leafName,
    leafExec.args,
    true
  );
  if (validationError) {
    ctx.updateTaskMetadata(task.id, {
      blockedReason: `invalid-args: ${validationError}`,
      nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS,
    });
    const runId = (
      (task.metadata as Record<string, unknown>)?.goldenRun as
        | Record<string, unknown>
        | undefined
    )?.runId as string | undefined;
    if (runId) {
      const invalidPayload: Record<string, unknown> = {
        leaf: leafExec.leafName,
        args: leafExec.args,
        validation_error: validationError,
      };
      if (leafExec.originalLeaf) invalidPayload.original_leaf = leafExec.originalLeaf;
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        'invalid_args',
        invalidPayload
      );
    }
    return;
  }

  // Pre-check: for craft steps, verify recipe inputs are available
  if (leafExec.leafName === 'craft_recipe' && leafExec.args.recipe) {
    const recipeInfo = await ctx.introspectRecipe(
      leafExec.args.recipe as string
    );
    if (recipeInfo) {
      const inv = await ctx.fetchInventorySnapshot();
      for (const input of recipeInfo.inputs) {
        const have = ctx.getCount(inv, input.item);
        if (have < input.count) {
          const injected = await ctx.injectDynamicPrereqForCraft(task);
          if (injected) return;
          break;
        }
      }
    }
  }

  const toolName = `minecraft.${leafExec.leafName}`;

  if (!leafAllowlist.has(toolName)) {
    if (nextStep.meta) {
      (nextStep.meta as Record<string, unknown>).executable = false;
      (nextStep.meta as Record<string, unknown>).blocked = true;
    }
    ctx.updateTaskMetadata(task.id, {
      blockedReason: `unknown-leaf:${leafExec.leafName}`,
      nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS,
    });
    ctx.emit('taskLifecycleEvent', {
      type: 'unknown_leaf_rejected',
      taskId: task.id,
      leaf: leafExec.leafName,
    });
    const runId = (
      (task.metadata as Record<string, unknown>)?.goldenRun as
        | Record<string, unknown>
        | undefined
    )?.runId as string | undefined;
    if (runId) {
      const unknownPayload: Record<string, unknown> = {
        leaf: leafExec.leafName,
        args: leafExec.args,
      };
      if (leafExec.originalLeaf) unknownPayload.original_leaf = leafExec.originalLeaf;
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        'unknown_leaf',
        unknownPayload
      );
    }
    return;
  }

  if (
    config.taskTypeBridgeLeafNames.has(leafExec.leafName) &&
    (mode !== 'shadow' || !config.enableTaskTypeBridge)
  ) {
    ctx.updateTaskMetadata(task.id, {
      blockedReason: `task_type_bridge_only_shadow:${leafExec.leafName}`,
      nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS,
    });
    const runId = (
      (task.metadata as Record<string, unknown>)?.goldenRun as
        | Record<string, unknown>
        | undefined
    )?.runId as string | undefined;
    if (runId) {
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        'task_type_bridge_only_shadow',
        {
          leaf: leafExec.leafName,
          validation_error:
            'task_type_* only allowed when EXECUTOR_MODE=shadow and ENABLE_TASK_TYPE_BRIDGE=1',
        }
      );
    }
    return;
  }

  if (mode === 'shadow') {
    const runId = (
      (task.metadata as Record<string, unknown>)?.goldenRun as
        | Record<string, unknown>
        | undefined
    )?.runId as string | undefined;
    if (runId) {
      ctx.getGoldenRunRecorder().recordShadowDispatch(runId, {
        step_id: stepId,
        leaf: leafExec.leafName,
        args: leafExec.args,
        observed_at: Date.now(),
      });
      ctx.getGoldenRunRecorder().recordVerification(runId, {
        status: 'skipped',
        kind: 'trace_only',
        detail: {
          reason: 'shadow_mode',
          leaf: leafExec.leafName,
          step_id: stepId,
        },
      });
    }
    await ctx.startTaskStep(task.id, nextStep.id, { dryRun: true });
    return;
  }

  // Live mode
  if (
    leafExec.args == null ||
    typeof leafExec.args !== 'object' ||
    Array.isArray(leafExec.args)
  ) {
    ctx.updateTaskMetadata(task.id, {
      blockedReason: 'invalid_args: args must be a plain object',
      nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS,
    });
    const runId = (
      (task.metadata as Record<string, unknown>)?.goldenRun as
        | Record<string, unknown>
        | undefined
    )?.runId as string | undefined;
    if (runId) {
      ctx.getGoldenRunRecorder().recordExecutorBlocked(runId, 'invalid_args', {
        leaf: leafExec.leafName,
        validation_error:
          'args missing or not a plain object (Live Option A fail-closed)',
      });
    }
    return;
  }

  if (!ctx.canExecuteStep()) {
    ctx.updateTaskMetadata(task.id, {
      blockedReason: 'rate_limited',
      nextEligibleAt: Date.now() + TRANSIENT_BLOCK_BACKOFF_MS,
    });
    if (runId) {
      ctx.getGoldenRunRecorder().recordExecutorBlocked(runId, 'rate_limited', {
        leaf: leafExec.leafName,
      });
    }
    return;
  }

  const stepStarted = await ctx.startTaskStep(task.id, nextStep.id);
  if (!stepStarted) {
    ctx.updateTaskMetadata(task.id, {
      blockedReason: 'rig_g_blocked',
      nextEligibleAt: Date.now() + TRANSIENT_BLOCK_BACKOFF_MS,
    });
    if (runId) {
      ctx.getGoldenRunRecorder().recordExecutorBlocked(runId, 'rig_g_blocked', {
        leaf: leafExec.leafName,
        validation_error: 'startTaskStep returned false',
      });
    }
    return;
  }

  ctx.recordStepExecuted();

  const stepAuthority = (nextStep.meta?.authority as string) || 'unknown';
  const dispatchedAt = Date.now();
  const actionResult = await ctx.executeTool(
    toolName,
    leafExec.args as Record<string, unknown>,
    ctx.getAbortSignal()
  );

  if (runId) {
    const dispatchPayload: Record<string, unknown> = {
      step_id: stepId,
      leaf: leafExec.leafName,
      args: leafExec.args,
      dispatched_at: dispatchedAt,
      result: ctx.toDispatchResult(actionResult),
    };
    if (leafExec.originalLeaf) dispatchPayload.original_leaf = leafExec.originalLeaf;
    ctx.getGoldenRunRecorder().recordDispatch(runId, dispatchPayload);
  }

  const actionMeta = (actionResult as Record<string, unknown> | null | undefined)
    ?.metadata as Record<string, unknown> | undefined;
  const noMappedAction = actionMeta?.reason === 'no_mapped_action';
  if (noMappedAction) {
    ctx.updateTaskMetadata(task.id, {
      blockedReason: 'no_mapped_action',
      nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS,
    });
    if (runId) {
      const payload: Record<string, unknown> = {
        leaf: leafExec.leafName,
        args: leafExec.args,
      };
      if (leafExec.originalLeaf) payload.original_leaf = leafExec.originalLeaf;
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        'no_mapped_action',
        payload
      );
    }
    return;
  }

  if (actionResult?.ok) {
    const stepCompleted = await ctx.completeTaskStep(task.id, nextStep.id);
    if (stepCompleted) {
      if (task.metadata?.verifyFailCount) {
        ctx.updateTaskMetadata(task.id, { verifyFailCount: 0 });
      }
    } else {
      const verifyFails = ((task.metadata?.verifyFailCount as number) || 0) + 1;
      const maxVerifyFails = 5;
      const backoffMs = Math.min(5000 * verifyFails, 30_000);
      if (verifyFails >= maxVerifyFails) {
        await ctx.completeTaskStep(task.id, nextStep.id, {
          skipVerification: true,
        } as Record<string, unknown>);
        ctx.updateTaskMetadata(task.id, {
          verifyFailCount: 0,
          lastSkippedStep: nextStep.id,
        });
      } else {
        ctx.updateTaskMetadata(task.id, {
          verifyFailCount: verifyFails,
          nextEligibleAt: Date.now() + backoffMs,
        });
      }
    }
    return;
  }

  if (isNavigatingError(actionResult?.error)) {
    if (runId) {
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        'navigating_in_progress',
        {
          leaf: leafExec.leafName,
          error: actionResult?.error,
        }
      );
    }
    return;
  }

  const failureCode =
    (actionResult as { failureCode?: string })?.failureCode ??
    (
      (actionResult?.data as Record<string, unknown>)?.error as {
        code?: string;
      }
    )?.code;
  if (isDeterministicFailure(failureCode)) {
    ctx.updateTaskMetadata(task.id, {
      blockedReason: `deterministic-failure:${failureCode}`,
      failureCode,
      failureError: actionResult?.error,
    });
    ctx.updateTaskProgress(task.id, task.progress || 0, 'failed');
    await ctx.recomputeProgressAndMaybeComplete(task);
    return;
  }

  if (leafExec.leafName === 'craft_recipe') {
    const injected = await ctx.injectDynamicPrereqForCraft(task);
    if (injected) return;
  }

  const newRetryCount = ((task.metadata?.retryCount as number) || 0) + 1;
  const maxRetries = (task.metadata?.maxRetries as number) || 3;
  const backoffMs = Math.min(1000 * Math.pow(2, newRetryCount), 30_000);

  if (newRetryCount >= maxRetries) {
    const repairCount =
      ((task.metadata as Record<string, unknown>)?.repairCount as number) ?? 0;
    const lastDigest = (task.metadata as Record<string, unknown>)
      ?.lastStepsDigest as string | undefined;
    if (repairCount < 2) {
      try {
        const failureContext = {
          failedLeaf: (nextStep?.meta?.leaf as string) || 'unknown',
          reasonClass: actionResult?.error || 'execution-failure',
          attemptCount: newRetryCount,
        };
        const repairResult = await ctx.regenerateSteps(task.id, failureContext);
        if (repairResult.success && repairResult.stepsDigest) {
          if (repairResult.stepsDigest !== lastDigest) {
            ctx.updateTaskMetadata(task.id, {
              retryCount: 0,
              repairCount: repairCount + 1,
              lastRepairAt: Date.now(),
              lastStepsDigest: repairResult.stepsDigest,
              nextEligibleAt: undefined,
            });
            return;
          }
        }
      } catch {
        // Repair failed; fall through to fail task
      }
    }

    ctx.updateTaskMetadata(task.id, {
      retryCount: newRetryCount,
      blockedReason: 'max-retries-exceeded',
    });
    ctx.updateTaskProgress(task.id, task.progress || 0, 'failed');
  } else {
    ctx.updateTaskMetadata(task.id, {
      retryCount: newRetryCount,
      nextEligibleAt: Date.now() + backoffMs,
    });
  }
}
