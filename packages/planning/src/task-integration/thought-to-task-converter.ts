/**
 * Thought-to-task conversion: Sterling reduction -> opaque task.
 *
 * Boundary principle: Planning does NOT parse goal tags or infer semantics.
 * It only honors Sterling's reduction artifacts and fails closed otherwise.
 *
 * @author @darianrosebrook
 */

import type { Task } from '../types/task';
import type { CognitiveStreamThought } from '../modules/cognitive-stream-client';
import type { ManagementResult, SterlingManagementAction } from './task-management-handler';
import type { ReductionProvenance } from '@conscious-bot/cognition';
import { logTaskIngestion } from '../task-lifecycle/task-ingestion-logger';
import { buildFailureSignature } from '../task-lifecycle/failure-signature';
import { getLoopBreaker } from '../task-lifecycle/loop-breaker';

/**
 * Explicit decision state for task creation — makes "why nothing happened" visible.
 */
export type TaskDecision =
  | 'created'
  | 'blocked_guard'
  | 'blocked_not_eligible'
  | 'dropped_seen'
  | 'suppressed_dedup'
  | 'dropped_no_reduction'
  | 'dropped_sterling_unavailable'
  | 'dropped_not_executable'
  | 'dropped_missing_digest'
  | 'dropped_missing_schema_version'
  | 'dropped_semantically_empty'
  | 'dropped_no_goal_prop'
  | 'management_applied'
  | 'management_needs_disambiguation'
  | 'management_failed'
  | 'management_unsupported'
  | 'error';

export interface ConvertThoughtResult {
  task: Task | null;
  decision: TaskDecision;
  reason?: string;
  managementResult?: ManagementResult;
}

export interface ConvertThoughtToTaskDeps {
  addTask: (taskData: Partial<Task>) => Promise<Task>;
  markThoughtAsProcessed: (thoughtId: string) => Promise<void>;
  seenThoughtIds: Set<string>;
  trimSeenThoughtIds: () => void;
  /** Management handler for explicit Sterling management actions. */
  managementHandler?: {
    handle: (action: SterlingManagementAction, sourceThoughtId?: string) => ManagementResult;
  };
  /** Configuration for conversion behavior */
  config?: {
    /**
     * When true, require convertEligible === true for task creation (fail-closed).
     * When false (default), only convertEligible === false blocks.
     */
    strictConvertEligibility?: boolean;
  };
}

/** Recent digest hashes for 5-minute dedup window */
const recentDigestHashes = new Map<string, number>();
const DIGEST_DEDUP_WINDOW_MS = 5 * 60 * 1000;

/** Hard cap on digest dedup entries to prevent unbounded growth in long-running processes. */
const MAX_DIGEST_DEDUP_ENTRIES = 200;

/**
 * Recently-failed task category cooldown (P0-C: classified).
 *
 * Digest-level dedup doesn't prevent the idle→task→fail loop because each
 * Sterling reduction produces a unique committed_ir_digest. This cooldown
 * tracks task *categories* (idle-episode source + content prefix) so that
 * tasks that repeatedly fail as "unplannable" are suppressed for a cooldown
 * window before a new identical task can be created.
 *
 * P0-C: Cooldown TTL is now tiered by failure classification:
 *   - transient: 5s (world state may change — mcData missing, solver unsolved)
 *   - durable: 30s (contract broken, invalid IR — needs code/config change)
 *   - nonsensical: 120s (goal is likely impossible — retries exhausted)
 */
export type FailureClassification = 'transient' | 'durable' | 'nonsensical';

interface FailedCategoryEntry {
  lastFailedAt: number;
  classification: FailureClassification;
  reasonCode?: string;
}

const recentFailedCategories = new Map<string, FailedCategoryEntry>();

/** Tiered TTLs by failure classification. */
const COOLDOWN_TTL_MS: Record<FailureClassification, number> = {
  transient:   5_000,   // 5s — world state may have changed
  durable:     30_000,  // 30s — same as legacy default
  nonsensical: 120_000, // 2min — goal is likely impossible
};

/** Longest possible TTL — used for pruning. */
const MAX_COOLDOWN_TTL_MS = COOLDOWN_TTL_MS.nonsensical;

/**
 * Minimal blocked-reason classification table.
 *
 * Replicated from BLOCKED_REASON_REGISTRY in task-block-evaluator.ts to avoid
 * import cycles. The tripwire test in category-cooldown-classification.test.ts
 * asserts this map covers all registry keys.
 */
const BLOCKED_REASON_CLASSIFICATION: Record<string, FailureClassification> = {
  // Transient — infrastructure/world will change
  blocked_digest_unknown: 'transient',
  blocked_executor_unavailable: 'transient',
  blocked_executor_error: 'transient',
  rig_e_solver_unimplemented: 'transient',
  unresolved_intents: 'transient',
  blocked_intent_resolution_unavailable: 'transient',
  blocked_unresolved_intents: 'transient',
  blocked_navigation_context_unavailable: 'transient',
  blocked_resource_context_unavailable: 'transient',
  blocked_crafting_context_unavailable: 'transient',
  blocked_intent_resolution_failed: 'transient',
  blocked_intent_resolution_error: 'transient',

  // Durable — contract broken, needs code/config change
  blocked_missing_digest: 'durable',
  blocked_missing_schema_version: 'durable',
  blocked_routing_disabled: 'durable',
  blocked_invalid_steps_bundle: 'durable',
  blocked_invalid_ir_bundle: 'durable',
  blocked_envelope_id_mismatch: 'durable',
  blocked_intent_resolution_disabled: 'durable',
  blocked_undispatchable_steps: 'durable',
  blocked_crafting_no_goal_item: 'durable',
  no_mapped_action: 'durable',

  // Nonsensical — already terminal
  max_retries_exceeded: 'nonsensical',
  expansion_retries_exhausted: 'nonsensical',

  // Executor-managed — use durable as safe default
  waiting_on_prereq: 'durable',
  infra_error_tripped: 'transient',
  shadow_mode: 'durable',
  no_executable_plan: 'durable',
};

/**
 * Classify a task failure for cooldown TTL selection.
 *
 * Precedence (P0-C):
 *   1. toolDiagnostics.reason_code (closest to ground truth)
 *   2. blockedReason from task metadata (expansion/executor classification)
 *   3. noStepsReason from solver metadata (planning failure)
 *   4. Default: durable
 */
export function classifyTaskFailure(task: { title?: string; metadata?: any }): FailureClassification {
  const meta = (task.metadata ?? {}) as Record<string, unknown>;

  // 1. toolDiagnostics.reason_code (post-P0-A, this is populated)
  const lastDiagReason = meta.lastDiagReasonCode as string | undefined;
  if (lastDiagReason) {
    if (lastDiagReason === 'no_mcdata') return 'transient';
    if (lastDiagReason === 'no_recipe_available') {
      // Sub-classify using lastDiagDetail (stored by executor from toolDiagnostics)
      const detail = meta.lastDiagDetail as Record<string, unknown> | undefined;
      if (detail) {
        // No workstation nearby but recipe requires one → transient (can place table)
        if (detail.requires_workstation === true && detail.crafting_table_nearby === false) return 'transient';
        // Missing inputs → transient (can acquire)
        if ((detail.missing_inputs_count as number) > 0) return 'transient';
      }
      // Default for no_recipe_available without detail: transient (conservative)
      return 'transient';
    }
    if (lastDiagReason === 'craft_timeout' || lastDiagReason === 'craft_aborted') return 'transient';
    if (lastDiagReason === 'invalid_recipe_id' || lastDiagReason === 'unknown_item') return 'durable';
  }

  // 2. blockedReason from task metadata
  const blockedReason = meta.blockedReason as string | undefined;
  if (blockedReason) {
    const mapped = BLOCKED_REASON_CLASSIFICATION[blockedReason];
    if (mapped) return mapped;
    // Parametric reasons (e.g., 'deterministic-failure:unknown_recipe')
    if (blockedReason.startsWith('deterministic-failure:')) return 'durable';
    if (blockedReason.startsWith('invalid_args:')) return 'durable';
    if (blockedReason.startsWith('unknown-leaf:')) return 'durable';
    if (blockedReason.startsWith('budget-exhausted:')) return 'nonsensical';
  }

  // 3. noStepsReason from solver metadata
  const solverMeta = meta.solver as Record<string, unknown> | undefined;
  const noStepsReason = solverMeta?.noStepsReason as string | undefined;
  if (noStepsReason) {
    if (noStepsReason === 'solver-unsolved') return 'transient';
    if (noStepsReason === 'solver-error') return 'transient';
    if (noStepsReason === 'no-requirement') return 'durable';
    if (noStepsReason === 'unplannable') return 'durable';
    if (noStepsReason === 'blocked-sentinel') return 'durable';
    if (noStepsReason === 'compiler-empty') return 'durable';
    if (noStepsReason === 'advisory-skip') return 'nonsensical';
  }

  // 4. Default: durable (safer to cool down longer than retry-storm)
  return 'durable';
}

/** Call when a task transitions to unplannable/failed to register the cooldown. */
export function registerFailedTaskCategory(task: { title?: string; metadata?: any }): void {
  const key = computeTaskCategoryKey(task);
  if (!key) return;
  const classification = classifyTaskFailure(task);
  const meta = (task.metadata ?? {}) as Record<string, unknown>;
  const reasonCode = (meta.lastDiagReasonCode as string)
    ?? (meta.blockedReason as string)
    ?? ((meta.solver as Record<string, unknown> | undefined)?.noStepsReason as string)
    ?? undefined;
  recentFailedCategories.set(key, { lastFailedAt: Date.now(), classification, reasonCode });
}

function computeTaskCategoryKey(task: { title?: string; metadata?: any }): string | null {
  const source = task.metadata?.sterling?.dedupeNamespace ?? task.metadata?.category ?? 'unknown';
  const prefix = (task.title ?? '').slice(0, 60).toLowerCase().trim();
  if (!prefix) return null;
  return `${source}:${prefix}`;
}

function isFailedCategoryCooldown(thought: CognitiveStreamThought): boolean {
  const prefix = (thought.content ?? '').trim().slice(0, 60).toLowerCase().trim();
  if (!prefix) return false;
  const reduction = thought.metadata?.reduction;
  const source = reduction?.reducerResult?.schema_version ?? 'unknown';
  const key = `${source}:${prefix}`;
  const now = Date.now();
  const entry = recentFailedCategories.get(key);
  if (!entry) return false;

  const ttl = COOLDOWN_TTL_MS[entry.classification];
  if (now - entry.lastFailedAt >= ttl) return false;

  // Prune expired entries on occasional check
  if (recentFailedCategories.size > 50) {
    pruneCooldownEntries();
  }

  return true;
}

/** Cooldown metrics for observability. */
export function getCooldownMetrics(): {
  size: number;
  hitsByClassification: Record<FailureClassification, number>;
} {
  const now = Date.now();
  const hits: Record<FailureClassification, number> = { transient: 0, durable: 0, nonsensical: 0 };
  for (const entry of recentFailedCategories.values()) {
    const ttl = COOLDOWN_TTL_MS[entry.classification];
    if (now - entry.lastFailedAt < ttl) {
      hits[entry.classification]++;
    }
  }
  return { size: recentFailedCategories.size, hitsByClassification: hits };
}

/** Prune expired cooldown entries. Called from isFailedCategoryCooldown when map grows large. */
function pruneCooldownEntries(): void {
  const now = Date.now();
  for (const [k, entry] of recentFailedCategories) {
    const ttl = COOLDOWN_TTL_MS[entry.classification];
    if (now - entry.lastFailedAt > ttl) {
      recentFailedCategories.delete(k);
    }
  }
}

/**
 * Reset all dedup/cooldown state. Test-only — prefixed with __ to signal intent.
 * Replaces the random `runPrefix` workaround in E2E tests.
 */
export function __resetDedupStateForTests(): void {
  recentDigestHashes.clear();
  recentFailedCategories.clear();
}

/** Dedup metrics for observability. */
export function getDedupMetrics(): { digestMapSize: number; categoryMapSize: number } {
  return {
    digestMapSize: recentDigestHashes.size,
    categoryMapSize: recentFailedCategories.size,
  };
}

/** Exported for tripwire test — maps blocked reason strings to classifications. */
export const __BLOCKED_REASON_CLASSIFICATION_FOR_TESTS = BLOCKED_REASON_CLASSIFICATION;

function isDigestDuplicate(digestKey: string): boolean {
  const now = Date.now();
  const lastSeen = recentDigestHashes.get(digestKey);
  if (lastSeen && now - lastSeen < DIGEST_DEDUP_WINDOW_MS) {
    return true;
  }
  recentDigestHashes.set(digestKey, now);
  // Prune: TTL-expired entries first, then oldest if still over cap.
  // Runs on every insert (not just > 100) to prevent stale accumulation.
  if (recentDigestHashes.size > 50) {
    for (const [key, ts] of recentDigestHashes) {
      if (now - ts > DIGEST_DEDUP_WINDOW_MS) recentDigestHashes.delete(key);
    }
  }
  // Hard size cap: if still too large after TTL prune, evict oldest entries.
  if (recentDigestHashes.size > MAX_DIGEST_DEDUP_ENTRIES) {
    const entries = [...recentDigestHashes.entries()].sort((a, b) => a[1] - b[1]);
    const toEvict = entries.slice(0, entries.length - MAX_DIGEST_DEDUP_ENTRIES);
    for (const [key] of toEvict) {
      recentDigestHashes.delete(key);
    }
  }
  return false;
}

export function calculateTaskPriority(thought: CognitiveStreamThought): number {
  let priority = 0.5;
  const confidence = thought.context?.confidence ?? 0;
  const emotionalState = thought.context?.emotionalState;
  priority += confidence * 0.3;
  if (thought.metadata.llmConfidence) {
    priority += thought.metadata.llmConfidence * 0.2;
  }
  if (emotionalState === 'urgent') {
    priority += 0.2;
  } else if (emotionalState === 'excited') {
    priority += 0.1;
  }
  return Math.min(1.0, priority);
}

export function calculateTaskUrgency(thought: CognitiveStreamThought): number {
  let urgency = 0.3;
  const confidence = thought.context?.confidence ?? 0;
  const emotionalState = thought.context?.emotionalState;
  if (emotionalState === 'urgent') {
    urgency = 0.8;
  } else if (emotionalState === 'excited') {
    urgency = 0.6;
  } else if (emotionalState === 'focused') {
    urgency = 0.5;
  }
  urgency += confidence * 0.2;
  return Math.min(1.0, urgency);
}

function extractSterlingManagementAction(reduction: ReductionProvenance | null | undefined): SterlingManagementAction | null {
  if (!reduction?.reducerResult) return null;
  const raw = (reduction.reducerResult as unknown as { management_action?: unknown }).management_action;
  if (!raw || typeof raw !== 'object') return null;
  const action = (raw as { action?: unknown }).action;
  const target = (raw as { target?: unknown }).target;
  if (typeof action !== 'string' || !target || typeof target !== 'object') return null;

  const targetObj = target as { task_id?: unknown; committed_ir_digest?: unknown; query?: unknown };
  const out: SterlingManagementAction = {
    action,
    target: {
      taskId: typeof targetObj.task_id === 'string' ? targetObj.task_id : null,
      committedIrDigest: typeof targetObj.committed_ir_digest === 'string' ? targetObj.committed_ir_digest : null,
      query: typeof targetObj.query === 'string' ? targetObj.query : null,
    },
    amount: typeof (raw as { amount?: unknown }).amount === 'number'
      ? (raw as { amount?: number }).amount ?? null
      : null,
  };

  return out;
}

/**
 * Required reduction shape for task conversion (contract for bot/Sterling -> cognition -> planning).
 * thought.metadata.reduction must have:
 * - sterlingProcessed: boolean (true)
 * - isExecutable: boolean (true)
 * - reducerResult.committed_ir_digest: non-empty string
 * - reducerResult.schema_version: non-empty string
 * Without these, resolveReduction returns dropped_* and no task is created.
 */
function resolveReduction(thought: CognitiveStreamThought): {
  ok: boolean;
  decision: TaskDecision;
  reason: string;
  reduction?: ReductionProvenance;
} {
  const reduction = thought.metadata?.reduction ?? null;
  if (!reduction) {
    return { ok: false, decision: 'dropped_no_reduction', reason: 'no reduction provided' };
  }
  if (!reduction.sterlingProcessed) {
    return { ok: false, decision: 'dropped_sterling_unavailable', reason: 'sterlingProcessed=false' };
  }
  if (!reduction.isExecutable) {
    return {
      ok: false,
      decision: 'dropped_not_executable',
      reason: reduction.blockReason ?? 'sterling_not_executable',
    };
  }
  const result = reduction.reducerResult;
  if (!result || typeof result.committed_ir_digest !== 'string' || !result.committed_ir_digest) {
    return { ok: false, decision: 'dropped_missing_digest', reason: 'committed_ir_digest missing' };
  }
  if (typeof result.schema_version !== 'string' || !result.schema_version) {
    return { ok: false, decision: 'dropped_missing_schema_version', reason: 'schema_version missing' };
  }
  // Tighten IR commitment contract: reject bundles that will deterministically
  // fail expansion. This prevents creating tasks that die immediately with
  // blocked_invalid_ir_bundle, avoiding wasted lifecycle churn.
  if (result.is_semantically_empty) {
    return { ok: false, decision: 'dropped_semantically_empty', reason: 'IR is semantically empty (no propositions or goal)' };
  }
  if (!result.committed_goal_prop_id) {
    return { ok: false, decision: 'dropped_no_goal_prop', reason: 'committed_goal_prop_id is null (expansion will fail without goal target)' };
  }
  return { ok: true, decision: 'created', reason: 'sterling_executable', reduction };
}

/**
 * Emit structured log for thought conversion decision.
 * Single source of truth for "why was/wasn't a task created from this thought?"
 * Payload is keys + booleans only — no thought text, bounded size.
 */
function logConversionDecision(
  thought: CognitiveStreamThought,
  result: ConvertThoughtResult,
): void {
  const reduction = thought.metadata?.reduction as ReductionProvenance | undefined;
  console.log('[Thought→Task]', JSON.stringify({
    _diag_version: 1,
    thought_id: thought.id?.slice(0, 12) ?? '?',
    source: (thought as any).source ?? 'unknown',
    has_committed_ir_digest: !!reduction?.reducerResult?.committed_ir_digest,
    reducer_is_executable: reduction?.isExecutable ?? null,
    sterling_processed: reduction?.sterlingProcessed ?? false,
    decision: result.decision,
    reason: result.reason,
  }));
}

/**
 * Convert a cognitive thought to a planning task.
 *
 * Only Sterling reduction artifacts are used. No local semantic parsing.
 */
export async function convertThoughtToTask(
  thought: CognitiveStreamThought,
  deps: ConvertThoughtToTaskDeps
): Promise<ConvertThoughtResult> {
  try {
    if (thought.processed) {
      const r: ConvertThoughtResult = { task: null, decision: 'blocked_guard', reason: 'already processed' };
      logConversionDecision(thought, r);
      return r;
    }

    if (deps.seenThoughtIds.has(thought.id)) {
      const r: ConvertThoughtResult = { task: null, decision: 'dropped_seen', reason: 'thought ID already seen' };
      logConversionDecision(thought, r);
      return r;
    }
    deps.seenThoughtIds.add(thought.id);
    if (deps.seenThoughtIds.size > 500) {
      deps.trimSeenThoughtIds();
    }

    // Convert-eligibility gate.
    const strict = deps.config?.strictConvertEligibility === true;
    if (strict) {
      if (thought.convertEligible !== true) {
        const r: ConvertThoughtResult = { task: null, decision: 'blocked_not_eligible', reason: 'strict mode: convertEligible !== true' };
        logConversionDecision(thought, r);
        return r;
      }
    } else if (thought.convertEligible === false) {
      const r: ConvertThoughtResult = { task: null, decision: 'blocked_not_eligible', reason: 'thought marked convertEligible=false' };
      logConversionDecision(thought, r);
      return r;
    }

    const reductionCheck = resolveReduction(thought);
    if (!reductionCheck.ok) {
      // Deterministic rejections: mark thought as processed to prevent retry churn.
      // These checks (missing schema, empty IR, no goal prop) are structural failures
      // that won't change on retry — the IR is committed and immutable.
      const deterministic = new Set<TaskDecision>([
        'dropped_missing_schema_version',
        'dropped_semantically_empty',
        'dropped_no_goal_prop',
      ]);
      if (deterministic.has(reductionCheck.decision)) {
        await deps.markThoughtAsProcessed(thought.id);
      }
      const r: ConvertThoughtResult = { task: null, decision: reductionCheck.decision, reason: reductionCheck.reason };
      logConversionDecision(thought, r);
      return r;
    }

    const reduction = reductionCheck.reduction!;
    const result = reduction.reducerResult!;

    // Management actions: only if Sterling emits explicit payload.
    const managementAction = extractSterlingManagementAction(reduction);
    if (managementAction) {
      if (!deps.managementHandler) {
        const r: ConvertThoughtResult = { task: null, decision: 'management_failed', reason: 'management handler not available' };
        logConversionDecision(thought, r);
        return r;
      }
      const mgmtResult = deps.managementHandler.handle(managementAction, thought.id);
      await deps.markThoughtAsProcessed(thought.id);
      const decisionMap: Record<string, TaskDecision> = {
        applied: 'management_applied',
        needs_disambiguation: 'management_needs_disambiguation',
        target_not_found: 'management_failed',
        invalid_transition: 'management_failed',
        error: 'management_failed',
      };
      const r: ConvertThoughtResult = {
        task: null,
        decision: decisionMap[mgmtResult.decision] ?? 'management_failed',
        reason: mgmtResult.reason ?? `management ${mgmtResult.action}: ${mgmtResult.decision}`,
        managementResult: mgmtResult,
      };
      logConversionDecision(thought, r);
      return r;
    }

    const schemaVersion = result.schema_version;
    const digestKey = `${schemaVersion}:${result.committed_ir_digest}`;
    if (isDigestDuplicate(digestKey)) {
      // Treat dedup suppression as loop evidence — an attempted repetition
      // that dedup prevented from becoming a task. Without this, LoopBreaker
      // thresholds become unreachable when dedup prevents new taskIds.
      const dedupSig = buildFailureSignature({ category: 'dedup_repeat', blockedReason: 'duplicate_digest' });
      getLoopBreaker().recordFailure(dedupSig, { taskId: `dedup_phantom_${thought.id}` });
      const r: ConvertThoughtResult = { task: null, decision: 'suppressed_dedup', reason: `duplicate digest within ${DIGEST_DEDUP_WINDOW_MS / 1000}s window` };
      logConversionDecision(thought, r);
      return r;
    }

    // Category-level cooldown: suppress tasks whose category recently failed
    // as unplannable. This prevents the idle→task→fail loop where each
    // Sterling reduction is unique but the task semantics are identical.
    if (isFailedCategoryCooldown(thought)) {
      // Same rationale as duplicate_digest above: category cooldown is a
      // suppressed repetition that LoopBreaker must see to reach thresholds.
      const cooldownSig = buildFailureSignature({ category: 'dedup_repeat', blockedReason: 'failed_category_cooldown' });
      getLoopBreaker().recordFailure(cooldownSig, { taskId: `dedup_phantom_${thought.id}` });
      const r: ConvertThoughtResult = { task: null, decision: 'suppressed_dedup', reason: `task category recently failed (up to ${MAX_COOLDOWN_TTL_MS / 1000}s cooldown)` };
      logConversionDecision(thought, r);
      return r;
    }

    const title = thought.content.trim().slice(0, 160) || `Sterling task ${result.committed_ir_digest.slice(0, 12)}`;
    const parameters: Record<string, any> = {
      thoughtContent: thought.content,
      thoughtId: thought.id,
      thoughtType: thought.metadata.thoughtType,
      confidence: thought.context?.confidence ?? null,
      cognitiveSystem: thought.context?.cognitiveSystem ?? null,
      llmConfidence: thought.metadata.llmConfidence,
      model: thought.metadata.model,
    };

    const task: Task = {
      id: `cognitive-task-${thought.id}-${result.committed_ir_digest.slice(0, 12)}`,
      title,
      description: title,
      type: 'sterling_ir',
      priority: calculateTaskPriority(thought),
      urgency: calculateTaskUrgency(thought),
      progress: 0,
      status: 'pending',
      source: 'autonomous',
      steps: [],
      parameters,
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: ['cognitive', 'autonomous', thought.metadata.thoughtType],
        category: 'sterling_ir',
        goldenRun: thought.metadata?.goldenRun,
        sterling: {
          committedIrDigest: result.committed_ir_digest,
          committedGoalPropId: result.committed_goal_prop_id ?? null,
          envelopeId: reduction.envelopeId ?? result.source_envelope_id ?? null,
          schemaVersion,
          reducerVersion: result.reducer_version ?? null,
          dedupeNamespace: schemaVersion,
        },
      },
    };

    const addedTask = await deps.addTask(task);
    await deps.markThoughtAsProcessed(thought.id);
    logTaskIngestion({ _diag_version: 1, source: 'thought_converter', task_id: task.id, decision: 'created', task_type: 'sterling_ir' });
    const r: ConvertThoughtResult = { task: addedTask, decision: 'created' };
    logConversionDecision(thought, r);
    return r;
  } catch (error) {
    logTaskIngestion({ _diag_version: 1, source: 'thought_converter', decision: 'error', reason: error instanceof Error ? error.constructor.name : 'unknown', task_type: 'sterling_ir' });
    console.error('Error converting thought to task:', error);
    const r: ConvertThoughtResult = { task: null, decision: 'error', reason: String(error) };
    logConversionDecision(thought, r);
    return r;
  }
}
