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

// ============================================================================
// Block Reason Registry — single source of truth for executor block reasons.
// Use these constants everywhere: executor, tests, recorder assertions, docs.
// Parametric reasons use prefix functions; the dynamic suffix is free-form.
// ============================================================================

export const BLOCK_REASONS = {
  // Deterministic: planner/materializer must change before retry
  PLANNING_INCOMPLETE: 'planning_incomplete',
  LEGACY_LEAF_REWRITE_DISABLED: 'legacy_leaf_rewrite_disabled',
  DERIVED_ARGS_NOT_ALLOWED_LIVE: 'derived_args_not_allowed_live',
  SENTINEL_ARGS_NOT_ALLOWED_LIVE: 'sentinel_args_not_allowed_live',
  INVALID_ARGS_PLAIN_OBJECT: 'invalid_args: args must be a plain object',
  REGEN_NON_OPTION_A: 'regen_non_option_a',
  MAX_RETRIES_EXCEEDED: 'max-retries-exceeded',
  NO_MAPPED_ACTION: 'no_mapped_action',
  TASK_TYPE_BRIDGE_ONLY_SHADOW: 'task_type_bridge_only_shadow',

  // Transient: world/runtime can change
  RATE_LIMITED: 'rate_limited',
  RIG_G_BLOCKED: 'rig_g_blocked',
  NAVIGATING_IN_PROGRESS: 'navigating_in_progress',
  SAFETY_PREEMPTED: 'safety_preempted',

  // Budget exhaustion (parametric)
  BUDGET_EXHAUSTED_TIME: 'budget-exhausted:time',
  BUDGET_EXHAUSTED_ATTEMPTS: 'budget-exhausted:attempts',
} as const;

/** Parametric reason: `invalid-args:${validationError}` */
export function invalidArgsReason(validationError: string): InvalidArgsReason {
  return `invalid-args:${validationError}`;
}

/** Parametric reason: `unknown-leaf:${leafName}` */
export function unknownLeafReason(leafName: string): UnknownLeafReason {
  return `unknown-leaf:${leafName}`;
}

/** Parametric reason: `deterministic-failure:${failureCode}` */
export function deterministicFailureReason(failureCode: string): DeterministicFailureReason {
  return `deterministic-failure:${failureCode}`;
}

/** Parametric reason: `budget-exhausted:time:${elapsed}>${max}` */
export function budgetExhaustedTimeReason(elapsed: number, max: number): BudgetExhaustedTimeReason {
  return `${BLOCK_REASONS.BUDGET_EXHAUSTED_TIME}:${elapsed}>${max}`;
}

/** Parametric reason: `budget-exhausted:attempts:${attempts}>=${max}` */
export function budgetExhaustedAttemptsReason(attempts: number, max: number): BudgetExhaustedAttemptsReason {
  return `${BLOCK_REASONS.BUDGET_EXHAUSTED_ATTEMPTS}:${attempts}>=${max}`;
}

// ============================================================================
// Block reason type taxonomy
// ============================================================================

/** Static block reasons from the BLOCK_REASONS registry. */
export type ConstBlockReason = typeof BLOCK_REASONS[keyof typeof BLOCK_REASONS];

/** Parametric: `invalid-args:${string}` */
export type InvalidArgsReason = `invalid-args:${string}`;

/** Parametric: `unknown-leaf:${string}` */
export type UnknownLeafReason = `unknown-leaf:${string}`;

/** Parametric: `deterministic-failure:${string}` */
export type DeterministicFailureReason = `deterministic-failure:${string}`;

/** Parametric: `budget-exhausted:time:${string}` */
export type BudgetExhaustedTimeReason = `budget-exhausted:time:${string}`;

/** Parametric: `budget-exhausted:attempts:${string}` */
export type BudgetExhaustedAttemptsReason = `budget-exhausted:attempts:${string}`;

/** Parametric: `task_type_bridge_only_shadow:${string}` */
export type TaskTypeBridgeReason = `task_type_bridge_only_shadow:${string}`;

/** Union of all valid block reason shapes — const literals and parametric templates. */
export type BlockReason =
  | ConstBlockReason
  | InvalidArgsReason
  | UnknownLeafReason
  | DeterministicFailureReason
  | BudgetExhaustedTimeReason
  | BudgetExhaustedAttemptsReason
  | TaskTypeBridgeReason;

// ============================================================================
// Smoke policy types
// ============================================================================

/**
 * Narrow enum-like type for smoke_policy_reason metadata values.
 * Prevents silent typo → silent observability loss.
 */
export type SmokePolicyReason = 'skip_verification' | 'fail_no_regen';

/** Typed patch for verify-skip smoke guard. Compiler-checked — no casts needed at call site.
 *  Index signature allows assignment to Record<string, unknown> (updateTaskMetadata). */
export interface SmokeVerifySkipPatch {
  [key: string]: unknown;
  verifyFailCount: number;
  lastSkippedStep: string;
  smokeVerifySkipped: true;
  smoke_policy_applied: true;
  /** "skip_verification" = verification was attempted but failed; smoke policy
   *  prevents the verify→retry loop, not the verification attempt itself. */
  smoke_policy_reason: SmokePolicyReason;
}

/** Typed patch for dispatch-error smoke guard. Compiler-checked — no casts needed at call site.
 *  Index signature allows assignment to Record<string, unknown> (updateTaskMetadata). */
export interface SmokeFailNoRegenPatch {
  [key: string]: unknown;
  retryCount: number;
  smokeNoRetry: true;
  smoke_policy_applied: true;
  smoke_policy_reason: SmokePolicyReason;
}

// ============================================================================
// Blocked-state lifecycle helpers
// ============================================================================

/**
 * Metadata patch that atomically clears all blocked-state fields.
 * Every code path that "unblocks" a task must use this to avoid leaving
 * stale blockedAt/nextEligibleAt behind after blockedReason is cleared.
 */
export function clearBlockedState(): Record<string, undefined> {
  return {
    blockedReason: undefined,
    blockedAt: undefined,
    nextEligibleAt: undefined,
  };
}

/**
 * Metadata patch that atomically sets blocked-state fields.
 * Always pairs blockedReason with blockedAt so that TTL-based auto-fail
 * in evaluateTaskBlockState works correctly.
 *
 * blockedAt semantics: "when this block began." If the task is already
 * blocked with the same reason, blockedAt is preserved so TTL continues
 * from the original block time. blockedAt is only reset when the reason
 * changes or the task transitions from unblocked → blocked.
 *
 * @param reason - The block reason constant or parametric string
 * @param opts.nextEligibleAt - Optional eligibility timestamp for backoff
 * @param opts.now - Timestamp override for testing (defaults to Date.now())
 * @param opts.existingMetadata - Current task metadata; when provided,
 *   blockedAt is preserved if the existing blockedReason matches.
 */
export function blockTaskPatch(
  reason: BlockReason,
  opts?: {
    nextEligibleAt?: number;
    now?: number;
    existingMetadata?: Record<string, unknown>;
  }
): Record<string, unknown> {
  const ts = opts?.now ?? Date.now();
  const existing = opts?.existingMetadata;
  // Preserve blockedAt when re-applying the same reason (TTL anchor).
  const blockedAt =
    existing &&
    existing.blockedReason === reason &&
    typeof existing.blockedAt === 'number'
      ? existing.blockedAt
      : ts;
  const patch: Record<string, unknown> = {
    blockedReason: reason,
    blockedAt,
  };
  if (opts?.nextEligibleAt !== undefined) {
    patch.nextEligibleAt = opts.nextEligibleAt;
  }
  return patch;
}

/**
 * Metadata patch for a successful regen: clears blocked state and resets
 * regen counters atomically. Use this instead of hand-assembling the patch
 * so that no field is accidentally omitted.
 */
export function regenSuccessPatch(opts: {
  repairCount: number;
  stepsDigest: string;
  now?: number;
}): Record<string, unknown> {
  const ts = opts.now ?? Date.now();
  return {
    ...clearBlockedState(),
    retryCount: 0,
    repairCount: opts.repairCount,
    lastRepairAt: ts,
    lastStepsDigest: opts.stepsDigest,
    regenDisabledUntil: undefined,
    regenAttempts: 0,
    failureCode: undefined,
    failureError: undefined,
    regenLastAttemptAt: undefined,
  };
}

/** Returns true when the error string indicates the bot is mid-navigation. */
function isNavigatingError(error: string | undefined | null): boolean {
  if (!error) return false;
  return /already navigating/i.test(error) || error === 'NAV_BUSY';
}

/** Returns true when navigation was preempted by a safety emergency. */
function isSafetyPreemptedError(error: string | undefined | null): boolean {
  if (!error) return false;
  return error === 'NAV_PREEMPTED';
}

/**
 * Extract a minimal placement receipt from leaf action result data.
 * Only placement leaves that need world-state verification get receipts.
 * The receipt is small (position + block name) and stored on step.meta.leafReceipt
 * so verifyByLeaf can probe the exact coordinate without re-dispatching.
 */
function extractLeafReceipt(
  leafName: string,
  data: Record<string, unknown>
): Record<string, unknown> | null {
  switch (leafName) {
    case 'place_block':
      if (data.position && data.blockPlaced)
        return { position: data.position, blockPlaced: data.blockPlaced };
      return null;
    case 'place_torch_if_needed':
      if (data.position)
        return { position: data.position, torchPlaced: data.torchPlaced ?? false };
      return null;
    case 'place_torch':
      if (data.position)
        return { position: data.position, torchPlaced: data.torchPlaced ?? data.success ?? false };
      return null;
    case 'place_workstation':
      if (data.position)
        return { position: data.position, workstation: data.workstation, reused: data.reused };
      return null;
    default:
      return null;
  }
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
  const meta = (task.metadata ?? {}) as Record<string, unknown>;
  const runId = (
    (meta.goldenRun as Record<string, unknown> | undefined)
  )?.runId as string | undefined;

  /** Local helper: produces a blockTaskPatch with existingMetadata pre-filled
   *  so that blockedAt is preserved across same-reason re-blocks (TTL anchor). */
  const block = (
    reason: BlockReason,
    opts?: { nextEligibleAt?: number; now?: number }
  ) => blockTaskPatch(reason, { ...opts, existingMetadata: meta });

  // ── Smoke task detection ──
  // INVARIANT: Smoke policy is determined from the initial task metadata snapshot.
  // These flags are NOT re-read if metadata is mutated mid-function. This is
  // intentional — smoke policy should be a static, one-shot decision based on
  // how the task was injected, not on any runtime metadata changes.
  // Read both key shapes for forward compatibility (injection writes both).
  const isSmoke = meta.source === 'sterling-smoke';
  const noRetry = !!(meta.noRetry === true || meta.no_retry === true);
  const disableRegen = !!(meta.disableRegen === true);

  // Planning-incomplete: normalizer could not materialize Option A for at least one step (deterministic: condition does not clear without plan mutation). Check before leaf resolution so unknown-leaf steps also get backoff (no hot-loop).
  if ((task.metadata as Record<string, unknown>)?.planningIncomplete === true) {
    ctx.updateTaskMetadata(task.id, block(
      BLOCK_REASONS.PLANNING_INCOMPLETE,
      { nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS }
    ));
    if (runId) {
      const leafName = (nextStep.meta?.leaf as string) ?? 'unknown';
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        BLOCK_REASONS.PLANNING_INCOMPLETE,
        { leaf: leafName },
        task.id
      );
    }
    return;
  }

  const leafExec = stepToLeafExecution(nextStep);
  if (!leafExec) {
    if (runId) {
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        'unknown_leaf',
        { leaf: (nextStep.meta?.leaf as string) ?? 'unknown' },
        task.id
      );
    }
    return;
  }

  const { config, leafAllowlist, mode } = ctx;

  // 6.6 dig_block quarantine: legacy leaf rewrites (dig_block -> acquire_material) blocked in live unless flag on
  if (
    mode === 'live' &&
    leafExec.originalLeaf &&
    !config.legacyLeafRewriteEnabled
  ) {
    ctx.updateTaskMetadata(task.id, block(
      BLOCK_REASONS.LEGACY_LEAF_REWRITE_DISABLED,
      { nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS }
    ));
    if (runId) {
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        BLOCK_REASONS.LEGACY_LEAF_REWRITE_DISABLED,
        { leaf: leafExec.leafName, original_leaf: leafExec.originalLeaf },
        task.id
      );
    }
    return;
  }

  // Live mode: block derived args (Option A requires explicit executor-native args)
  if (mode === 'live' && leafExec.argsSource === 'derived') {
    ctx.updateTaskMetadata(task.id, block(
      BLOCK_REASONS.DERIVED_ARGS_NOT_ALLOWED_LIVE,
      { nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS }
    ));
    if (runId) {
      const blockPayload: Record<string, unknown> = {
        leaf: leafExec.leafName,
        argsSource: leafExec.argsSource,
      };
      if (leafExec.originalLeaf) blockPayload.original_leaf = leafExec.originalLeaf;
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        BLOCK_REASONS.DERIVED_ARGS_NOT_ALLOWED_LIVE,
        blockPayload,
        task.id
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
      ctx.updateTaskMetadata(task.id, block(
        BLOCK_REASONS.SENTINEL_ARGS_NOT_ALLOWED_LIVE,
        { nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS }
      ));
      if (runId) {
      const sentinelPayload: Record<string, unknown> = {
        leaf: leafExec.leafName,
        args: leafExec.args,
        sentinel: recipeSentinel ? 'recipe' : 'input',
      };
      if (leafExec.originalLeaf) sentinelPayload.original_leaf = leafExec.originalLeaf;
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        BLOCK_REASONS.SENTINEL_ARGS_NOT_ALLOWED_LIVE,
        sentinelPayload,
        task.id
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
      ctx.updateTaskMetadata(task.id, block(
        `${BLOCK_REASONS.BUDGET_EXHAUSTED_TIME}:${leafExec.leafName}`
      ));
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
          }, task.id);
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
      ctx.updateTaskMetadata(task.id, block(
        `${BLOCK_REASONS.BUDGET_EXHAUSTED_ATTEMPTS}:${leafExec.leafName}`
      ));
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
          }, task.id);
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
          .recordExecutorBlocked(runId, BLOCK_REASONS.RATE_LIMITED, {
            leaf: leafExec.leafName,
            validation_error: `min_interval:${delay}ms`,
          }, task.id);
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
    ctx.updateTaskMetadata(task.id, block(
      invalidArgsReason(validationError),
      { nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS }
    ));
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
        invalidPayload,
        task.id
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
    ctx.updateTaskMetadata(task.id, block(
      unknownLeafReason(leafExec.leafName),
      { nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS }
    ));
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
        unknownPayload,
        task.id
      );
    }
    return;
  }

  if (
    config.taskTypeBridgeLeafNames.has(leafExec.leafName) &&
    (mode !== 'shadow' || !config.enableTaskTypeBridge)
  ) {
    ctx.updateTaskMetadata(task.id, block(
      `${BLOCK_REASONS.TASK_TYPE_BRIDGE_ONLY_SHADOW}:${leafExec.leafName}`,
      { nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS }
    ));
    const runId = (
      (task.metadata as Record<string, unknown>)?.goldenRun as
        | Record<string, unknown>
        | undefined
    )?.runId as string | undefined;
    if (runId) {
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        BLOCK_REASONS.TASK_TYPE_BRIDGE_ONLY_SHADOW,
        {
          leaf: leafExec.leafName,
          validation_error:
            'task_type_* only allowed when EXECUTOR_MODE=shadow and ENABLE_TASK_TYPE_BRIDGE=1',
        },
        task.id
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
      if (leafExec.originalLeaf) {
        ctx.getGoldenRunRecorder().recordLeafRewriteUsed(runId, {
          leaf: leafExec.leafName,
          originalLeaf: leafExec.originalLeaf,
        });
      }
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
    ctx.updateTaskMetadata(task.id, block(
      BLOCK_REASONS.INVALID_ARGS_PLAIN_OBJECT,
      { nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS }
    ));
    const runId = (
      (task.metadata as Record<string, unknown>)?.goldenRun as
        | Record<string, unknown>
        | undefined
    )?.runId as string | undefined;
    if (runId) {
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        'invalid_args',
        {
          leaf: leafExec.leafName,
          validation_error:
            'args missing or not a plain object (Live Option A fail-closed)',
        },
        task.id
      );
    }
    return;
  }

  if (!ctx.canExecuteStep()) {
    ctx.updateTaskMetadata(task.id, block(
      BLOCK_REASONS.RATE_LIMITED,
      { nextEligibleAt: Date.now() + TRANSIENT_BLOCK_BACKOFF_MS }
    ));
    if (runId) {
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        BLOCK_REASONS.RATE_LIMITED,
        { leaf: leafExec.leafName },
        task.id
      );
    }
    return;
  }

  const stepStarted = await ctx.startTaskStep(task.id, nextStep.id);
  if (!stepStarted) {
    ctx.updateTaskMetadata(task.id, block(
      BLOCK_REASONS.RIG_G_BLOCKED,
      { nextEligibleAt: Date.now() + TRANSIENT_BLOCK_BACKOFF_MS }
    ));
    if (runId) {
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        BLOCK_REASONS.RIG_G_BLOCKED,
        {
          leaf: leafExec.leafName,
          validation_error: 'startTaskStep returned false',
        },
        task.id
      );
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
    if (leafExec.originalLeaf) {
      dispatchPayload.original_leaf = leafExec.originalLeaf;
      ctx.getGoldenRunRecorder().recordLeafRewriteUsed(runId, {
        leaf: leafExec.leafName,
        originalLeaf: leafExec.originalLeaf,
      });
    }
    ctx.getGoldenRunRecorder().recordDispatch(runId, dispatchPayload);
  }

  // Store placement receipt on step metadata for receipt-anchored verification.
  // The receipt captures the exact position + block the leaf claims it placed,
  // so verifyByLeaf can probe that coordinate instead of guessing.
  if (actionResult?.ok && actionResult?.data) {
    const receipt = extractLeafReceipt(
      leafExec.leafName,
      actionResult.data as Record<string, unknown>
    );
    if (receipt) {
      nextStep.meta = { ...nextStep.meta, leafReceipt: receipt };
    }
  }

  const actionMeta = (actionResult as Record<string, unknown> | null | undefined)
    ?.metadata as Record<string, unknown> | undefined;
  const noMappedAction = actionMeta?.reason === BLOCK_REASONS.NO_MAPPED_ACTION;
  if (noMappedAction) {
    ctx.updateTaskMetadata(task.id, block(
      BLOCK_REASONS.NO_MAPPED_ACTION,
      { nextEligibleAt: Date.now() + DETERMINISTIC_BLOCK_BACKOFF_MS }
    ));
    if (runId) {
      const payload: Record<string, unknown> = {
        leaf: leafExec.leafName,
        args: leafExec.args,
      };
      if (leafExec.originalLeaf) payload.original_leaf = leafExec.originalLeaf;
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        BLOCK_REASONS.NO_MAPPED_ACTION,
        payload,
        task.id
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
      // Smoke tasks with noRetry: skip verification and finalize immediately.
      // This prevents verify→retry loops from consuming rate-limiter budget.
      if (isSmoke && noRetry) {
        await ctx.completeTaskStep(task.id, nextStep.id, {
          skipVerification: true,
        } as Record<string, unknown>);
        const verifySkipPatch: SmokeVerifySkipPatch = {
          verifyFailCount: 1,
          lastSkippedStep: nextStep.id,
          smokeVerifySkipped: true,
          smoke_policy_applied: true,
          smoke_policy_reason: 'skip_verification',
        };
        ctx.updateTaskMetadata(task.id, verifySkipPatch);
        return;
      }

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

  // Safety preemption: navigation was interrupted by an emergency — back off 30s (no retry).
  if (isSafetyPreemptedError(actionResult?.error)) {
    ctx.updateTaskMetadata(task.id, block(
      BLOCK_REASONS.SAFETY_PREEMPTED,
      { nextEligibleAt: Date.now() + TRANSIENT_BLOCK_BACKOFF_MS }
    ));
    if (runId) {
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        BLOCK_REASONS.SAFETY_PREEMPTED,
        {
          leaf: leafExec.leafName,
          error: actionResult?.error,
        },
        task.id
      );
    }
    return;
  }

  if (isNavigatingError(actionResult?.error)) {
    if (runId) {
      ctx.getGoldenRunRecorder().recordExecutorBlocked(
        runId,
        BLOCK_REASONS.NAVIGATING_IN_PROGRESS,
        {
          leaf: leafExec.leafName,
          error: actionResult?.error,
        },
        task.id
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
      ...block(deterministicFailureReason(failureCode!)),
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
  // Smoke tasks respect metadata.maxRetries (set to 1 at injection);
  // non-smoke tasks fall back to the existing default of 3.
  const maxRetries = (task.metadata?.maxRetries as number) || 3;
  const backoffMs = Math.min(1000 * Math.pow(2, newRetryCount), 30_000);

  // Smoke no-retry: fail immediately on first error. No regen, no retry storm.
  if (isSmoke && noRetry) {
    const failNoRegenPatch: SmokeFailNoRegenPatch = {
      retryCount: newRetryCount,
      smokeNoRetry: true,
      smoke_policy_applied: true,
      smoke_policy_reason: 'fail_no_regen',
    };
    ctx.updateTaskMetadata(task.id, {
      ...block(BLOCK_REASONS.MAX_RETRIES_EXCEEDED),
      ...failNoRegenPatch,
    });
    ctx.updateTaskProgress(task.id, task.progress || 0, 'failed');
    return;
  }

  if (newRetryCount >= maxRetries) {
    const repairCount =
      ((task.metadata as Record<string, unknown>)?.repairCount as number) ?? 0;
    const lastDigest = (task.metadata as Record<string, unknown>)
      ?.lastStepsDigest as string | undefined;
    const regenDisabledUntil = (task.metadata as Record<string, unknown>)
      ?.regenDisabledUntil as number | undefined;
    const now = Date.now();
    const mayAttemptRegen =
      !disableRegen &&
      repairCount < 2 &&
      (regenDisabledUntil == null || now >= regenDisabledUntil);

    if (mayAttemptRegen) {
      try {
        const failureContext = {
          failedLeaf: (nextStep?.meta?.leaf as string) || 'unknown',
          reasonClass: actionResult?.error || 'execution-failure',
          attemptCount: newRetryCount,
        };
        const repairResult = await ctx.regenerateSteps(task.id, failureContext);
        const runId = (
          (task.metadata as Record<string, unknown>)?.goldenRun as
            | Record<string, unknown>
            | undefined
        )?.runId as string | undefined;
        if (runId) {
          ctx.getGoldenRunRecorder().recordRegenerationAttempt(runId, {
            success: repairResult.success,
            reason: repairResult.reason,
          });
        }
        if (repairResult.success && repairResult.stepsDigest) {
          if (repairResult.stepsDigest !== lastDigest) {
            // Clear regen lock so future retries can attempt regen again; plan digest changed.
            ctx.updateTaskMetadata(
              task.id,
              regenSuccessPatch({
                repairCount: repairCount + 1,
                stepsDigest: repairResult.stepsDigest,
                now,
              })
            );
            return;
          }
        }
        if (!repairResult.success && repairResult.reason === BLOCK_REASONS.REGEN_NON_OPTION_A) {
          const regenAttempts =
            ((task.metadata as Record<string, unknown>)?.regenAttempts as number) ?? 0;
          ctx.updateTaskMetadata(task.id, {
            ...block(BLOCK_REASONS.REGEN_NON_OPTION_A, {
              nextEligibleAt: now + DETERMINISTIC_BLOCK_BACKOFF_MS,
              now,
            }),
            regenAttempts: regenAttempts + 1,
            regenLastAttemptAt: now,
            regenDisabledUntil: now + DETERMINISTIC_BLOCK_BACKOFF_MS,
          });
          return;
        }
      } catch {
        // Repair failed; fall through to fail task
      }
    }

    ctx.updateTaskMetadata(task.id, {
      ...block(BLOCK_REASONS.MAX_RETRIES_EXCEEDED),
      retryCount: newRetryCount,
    });
    ctx.updateTaskProgress(task.id, task.progress || 0, 'failed');
  } else {
    ctx.updateTaskMetadata(task.id, {
      retryCount: newRetryCount,
      nextEligibleAt: Date.now() + backoffMs,
    });
  }
}
