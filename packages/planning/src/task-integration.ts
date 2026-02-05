/**
 * Task Integration System
 *
 * Orchestrates task store, Sterling planner, and thought-to-task conversion.
 * Provides dashboard connectivity and real-time task progress.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { createServiceClients } from '@conscious-bot/core';
import type { BaseDomainSolver } from './sterling/base-domain-solver';
import type { MinecraftBuildingSolver } from './sterling/minecraft-building-solver';
import { resolveRequirement } from './modules/requirements';
import { CognitionOutbox } from './modules/cognition-outbox';
import { broadcastTaskUpdate } from './modules/planning-endpoints';
import {
  ORE_DROP_MAP,
  BLOCK_DROP_MAP,
} from './sterling/minecraft-tool-progression-types';
import type {
  EpisodeLinkage,
  EpisodeOutcomeClass,
  EpisodeAck,
} from './sterling';
import { buildSterlingEpisodeLinkage, buildSterlingEpisodeLinkageFromResult } from './sterling';
import { SOLVER_IDS } from './sterling/solver-ids';
import {
  CognitiveStreamClient,
  type CognitiveStreamThought,
} from './modules/cognitive-stream-client';
import type {
  ITaskIntegration,
  MutationOptions,
} from './interfaces/task-integration';
import type {
  Task,
  TaskProgress,
  TaskStatistics,
  TaskIntegrationConfig,
  ActionVerification,
  StepSnapshot,
} from './types/task';
import {
  DEFAULT_TASK_INTEGRATION_CONFIG,
  type VerificationStatus,
} from './types/task';
import { TaskStore } from './task-integration/task-store';
import { SterlingPlanner } from './task-integration/sterling-planner';
import { convertThoughtToTask } from './task-integration/thought-to-task-converter';
import {
  TaskManagementHandler,
  type ManagementResult,
  type SterlingManagementAction,
} from './task-integration/task-management-handler';
import { adviseExecution } from './constraints/execution-advisor';
import type { RigGMetadata } from './constraints/execution-advisor';
import { buildDefaultMinecraftGraph } from './hierarchical/macro-planner';
import { FeedbackStore } from './hierarchical/feedback';
import { GoalResolver, type AtomicResolveOutcome } from './goals/goal-resolver';
import { computeProvisionalKey } from './goals/goal-identity';
import type { GoalBinding } from './goals/goal-binding-types';
import {
  onTaskStatusChanged,
  onTaskProgressUpdated,
  applySyncEffects,
  type EffectApplierDeps,
} from './goals/goal-lifecycle-hooks';
import type { SyncEffect } from './goals/goal-task-sync';
import type { VerifierRegistry } from './goals/verifier-registry';
import {
  applyHold,
  clearHold,
  cloneHold,
  syncHoldToTaskFields,
} from './goals/goal-binding-normalize';
import {
  partitionSelfHoldEffects,
  applySelfHoldEffects,
} from './goals/effect-partitioning';

const PLANNING_INGEST_DEBUG_400 =
  process.env.PLANNING_INGEST_DEBUG_400 === '1';
const DEBUG_ACK_DEFERRAL_LIMIT = 3;
import { GoalStatus } from './types';

export type { TaskStep } from './types/task-step';
export type {
  MutationOrigin,
  MutationOptions,
} from './interfaces/task-integration';
import type { TaskStep } from './types/task-step';

export type {
  Task,
  TaskProgress,
  TaskStatistics,
  TaskIntegrationConfig,
  ActionVerification,
  StepSnapshot,
  VerificationStatus,
} from './types/task';
export { DEFAULT_TASK_INTEGRATION_CONFIG };

const DEFAULT_CONFIG = DEFAULT_TASK_INTEGRATION_CONFIG;

/**
 * Normalize intentParams to a stable string at the creation boundary.
 * Objects are serialized with sorted keys at every nesting level so that
 * identical intent payloads always produce the same provisional goal key,
 * regardless of property insertion order in the original object.
 *
 * Handles edge cases: BigInt → string, undefined/function → omitted by JSON,
 * non-plain objects (Date, Map, Set) → fail-closed to undefined.
 */
export function canonicalizeIntentParams(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'bigint') return raw.toString();
  // Stable JSON: sort keys recursively, coerce bigints
  try {
    return JSON.stringify(raw, (_key, value) => {
      if (typeof value === 'bigint') return value.toString();
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        // Reject non-plain objects (Date, Map, Set, etc.) — they serialize unpredictably
        const proto = Object.getPrototypeOf(value);
        if (proto !== null && proto !== Object.prototype) {
          return undefined; // omitted from output
        }
        return Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        );
      }
      return value;
    });
  } catch {
    // Fail-closed: if serialization throws (circular ref, etc.), return undefined
    // so the provisional key excludes intentParams rather than crashing
    return undefined;
  }
}

/**
 * Thin event emitted when a task claims source='goal' but did not receive
 * goalBinding metadata. This is the primary early warning for entry-point
 * drift (new goal-like task types that bypass the resolver gate).
 *
 * Design: "queryable, not copyable" — carries only summary fields sufficient
 * for dashboards and alerts. Consumers needing the full task query the store
 * by taskId.
 */
export interface GoalBindingDriftEvent {
  type: 'goal_binding_drift';
  /** ID of the affected task */
  taskId: string;
  /** Task type (e.g. 'building', 'gathering') */
  taskType: string;
  /** Task source — drift events only fire for goal-sourced tasks */
  source: 'goal';
  /** Classification of why goalBinding was not attached */
  reason:
    | 'goal_resolver_disabled'
    | `type_not_gated:${string}`
    | 'resolver_fallthrough';
  /** Origin kind inferred at creation */
  originKind?: string;
  /** Whether goalBinding was present (always false for drift events) */
  hasGoalBinding: false;
  /** Goal type if extractable from parameters */
  goalType?: string;
  /** Truncated title (max 80 chars) — human-friendly, not contractual */
  title?: string;
}

/**
 * Infer a canonical task origin from available task data signals.
 * Set once at creation time; stripped from updateTaskMetadata patches.
 *
 * kind meanings:
 * - 'api'           — created via HTTP endpoint or manual action
 * - 'cognition'     — created by thought-to-task converter
 * - 'executor'      — subtask spawned by executor/leaf during execution
 * - 'goal_resolver' — routed through GoalResolver and received goalBinding
 * - 'goal_source'   — source='goal' but did NOT receive goalBinding (drift)
 */
export interface TaskOrigin {
  /** How this task entered the system */
  kind:
    | 'api'
    | 'cognition'
    | 'executor'
    | 'goal_resolver'
    | 'goal_source'
    | 'unknown';
  /** Finer-grained source name (e.g., leaf name, thought type, endpoint) */
  name?: string;
  /** Parent task ID if this is a subtask */
  parentTaskId?: string;
  /** Goal key if goal-derived */
  parentGoalKey?: string;
  /** Creation timestamp (ms) */
  createdAt: number;
}

/**
 * Infer origin from raw task input signals.
 * Called with the constructed task (not raw input) so we can reflect
 * whether goalBinding was actually attached.
 */
function inferTaskOrigin(task: Task): TaskOrigin {
  const meta = task.metadata;
  const now = Date.now();

  // Executor-created subtasks have taskProvenance from buildTaskFromRequirement
  if (meta?.taskProvenance) {
    return {
      kind: 'executor',
      name: meta.taskProvenance.source ?? 'executor',
      parentTaskId: meta.parentTaskId,
      parentGoalKey: meta.goalKey,
      createdAt: now,
    };
  }

  // Cognitive/autonomous tasks from thought-to-task converter
  if (task.source === 'autonomous') {
    const tags: string[] = meta?.tags ?? [];
    return {
      kind: 'cognition',
      name: tags.includes('cognitive') ? 'thought-to-task' : 'autonomous',
      parentGoalKey: meta?.goalKey,
      createdAt: now,
    };
  }

  // Goal-sourced tasks: distinguish resolved (has goalBinding) from unresolved
  if (task.source === 'goal') {
    const binding = meta?.goalBinding;
    // Prefer goalBinding.goalType for name — the resolver skeleton task
    // has empty parameters, so task.parameters?.goalType is unreliable
    // on the most important (goal-resolved) path.
    const name = binding?.goalType ?? task.parameters?.goalType ?? task.type;
    return {
      kind: binding ? 'goal_resolver' : 'goal_source',
      name,
      parentGoalKey: binding?.goalKey ?? task.parameters?.goalId,
      createdAt: now,
    };
  }

  // Default: API or manual entry
  return {
    kind: 'api',
    name: task.source ?? 'manual',
    createdAt: now,
  };
}

// ============================================================================
// Metadata Projection
// ============================================================================

/**
 * Integration-critical metadata keys that must survive the addTask() rebuild.
 * Fail-closed: any key NOT in this list is intentionally dropped.
 *
 * Add new keys here when a new pipeline (converter, executor, goal resolver)
 * needs metadata to survive addTask(). The compile-time `satisfies` constraint
 * ensures every key actually exists on Task['metadata'].
 */
const PROPAGATED_META_KEYS = [
  'goalKey',
  'subtaskKey',
  'taskProvenance',
  'sterling',
] as const satisfies readonly (keyof Task['metadata'])[];

/** Rate limiter for dev-only dropped-key warnings (one per key per session). */
const _warnedDroppedKeys = new Set<string>();

/**
 * Project incoming metadata onto a new task's metadata object.
 * Fail-closed allowlist: only PROPAGATED_META_KEYS are copied.
 * Solver metadata is handled separately (namespace merge).
 *
 * In dev mode, warns (once per key) when incoming keys are dropped.
 * This surfaces new pipelines that set metadata fields but forget
 * to update the allowlist.
 *
 * @param target  The task.metadata object being built (mutated in place)
 * @param source  The incoming taskData.metadata (may be partial or undefined)
 */
function projectIncomingMetadata(
  target: Task['metadata'],
  source: Partial<Task['metadata']> | undefined
): void {
  if (!source) return;

  // Dev-only: detect incoming keys that will be silently dropped.
  // Warn once per key per session so new pipelines that set metadata
  // fields not in PROPAGATED_META_KEYS are surfaced immediately.
  if (process.env.NODE_ENV !== 'production') {
    const allowSet = new Set<string>(PROPAGATED_META_KEYS);
    // Infrastructure keys rebuilt by addTask() — not dropped, just rebuilt.
    const REBUILT_KEYS = new Set([
      'createdAt',
      'updatedAt',
      'retryCount',
      'maxRetries',
      'childTaskIds',
      'tags',
      'category',
      'solver',
    ]);
    for (const key of Object.keys(source)) {
      if (
        !allowSet.has(key) &&
        !REBUILT_KEYS.has(key) &&
        !_warnedDroppedKeys.has(key)
      ) {
        _warnedDroppedKeys.add(key);
        console.warn(
          `[projectIncomingMetadata] Dropped metadata key "${key}" — ` +
            `not in PROPAGATED_META_KEYS. If this key is needed, add it to the allowlist.`
        );
      }
    }
  }

  for (const key of PROPAGATED_META_KEYS) {
    let value = source[key];
    if (value !== undefined) {
      // Invariant: goalKey must never be empty string — coerce to undefined.
      // Sterling identity fields should never be empty; this is a defensive check.
      if (key === 'goalKey' && value === '') {
        value = undefined as any;
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (target as any)[key] = value;
    }
  }
}

/**
 * Set of task types routed through the GoalResolver when source='goal'.
 * Centralizes the gating predicate so the resolver gate and the drift
 * linter use exactly the same check.
 */
const GOAL_RESOLVER_GATED_TYPES = new Set(['building']);

function getSterlingDedupeKeyFromMetadata(metadata: Partial<Task['metadata']> | undefined): string | null {
  const sterling = metadata?.sterling as
    | { committedIrDigest?: string; schemaVersion?: string | null; dedupeNamespace?: string | null }
    | undefined;
  const digest = sterling?.committedIrDigest;
  if (!digest) return null;
  const namespace = sterling?.dedupeNamespace ?? sterling?.schemaVersion ?? 'unknown';
  return `${namespace}:${digest}`;
}

/**
 * Apply a blocked state to a task atomically.
 *
 * Ensures `blockedReason` and `blockedAt` are always set together.
 * Optionally sets `status` (e.g., `'pending_planning'` for solver sentinels).
 *
 * Usage: call this instead of setting `task.metadata.blockedReason` directly
 * for any creation-time block. Runtime blocks (Rig G gate, replan exhaustion)
 * may still set blockedReason directly when they have different lifecycle
 * semantics, but the finalize safety net will backfill blockedAt if missing.
 */
function applyTaskBlock(
  task: Task,
  reason: string,
  opts?: { status?: Task['status']; clearSteps?: boolean }
): void {
  task.metadata.blockedReason = reason;
  task.metadata.blockedAt ??= Date.now();
  if (opts?.status) {
    task.status = opts.status;
  }
  if (opts?.clearSteps) {
    task.steps = [];
  }
}

// ------------------------------------------------------------------
// Join Keys Infrastructure
// ------------------------------------------------------------------

/** Solver ID for building domain — used for cross-domain clobber guard */
const BUILDING_SOLVER_ID = SOLVER_IDS.BUILDING;

// ------------------------------------------------------------------
// MIGRATION COMPAT: deprecated solveJoinKeys fallback
// Issue: [CB-XXX] Remove after 2026-02-15 if no migration logs observed
//
// Opt-in via env: JOIN_KEYS_DEPRECATED_COMPAT=1
// When enabled, logs startup banner so you know it's active.
//
// Compat check is a runtime function (not module-load constant) to enable
// testing without module reimport gymnastics.
// ------------------------------------------------------------------

/** Check if deprecated join keys compat is enabled (runtime, testable) */
function isDeprecatedJoinKeysCompatEnabled(): boolean {
  return process.env.JOIN_KEYS_DEPRECATED_COMPAT === '1';
}

/** Check if debug logging is enabled for join keys migration */
function isDebugJoinKeysMigrationEnabled(): boolean {
  return process.env.DEBUG_JOIN_KEYS_MIGRATION === '1';
}

// Emit startup banner when compat is enabled (at module init time)
// This logs even if no tasks exercise the fallback, which is intentional:
// it makes the compat path visible in logs so you know it's active.
if (isDeprecatedJoinKeysCompatEnabled()) {
  console.log('[JoinKeys] Deprecated solveJoinKeys fallback is ENABLED (JOIN_KEYS_DEPRECATED_COMPAT=1). Remove after 2026-02-15.');
}

/** Log once per process when fallback is actually exercised */
let _migrationFallbackExercised = false;
function logMigrationFallbackOnce(taskId: string, planId: string | undefined): void {
  if (_migrationFallbackExercised) return;
  _migrationFallbackExercised = true;
  console.log(`[JoinKeys] Migration fallback exercised: task=${taskId}, planId=${planId}`);
}

/**
 * Check if deprecated fallback is safe to use for this task.
 * Narrowed scope: only building tasks with templateId, no other per-domain keys.
 */
function isSafeForDeprecatedFallback(task: Task): boolean {
  if (task.type !== 'building') return false;
  if (!task.metadata.solver?.buildingTemplateId) return false;
  // If any per-domain keys exist (even for other domains), don't use deprecated slot
  const solver = task.metadata.solver;
  if (solver.craftingSolveJoinKeys) return false;
  if (solver.toolProgressionSolveJoinKeys) return false;
  if (solver.acquisitionSolveJoinKeys) return false;
  return true;
}

/**
 * Episode domain labels for multi-domain warning suppression.
 * Using `domain` in the warning key prevents cross-domain masking.
 */
type EpisodeDomain = 'building' | 'crafting' | 'tool_progression' | 'acquisition';

/**
 * Coarse reason categories for warning suppression.
 * Keyed by (taskId, domain, category) so more severe conditions aren't masked by earlier benign ones.
 *
 * Category is determined at the detection site (not string-matched in helper) to avoid
 * classification drift if log text is refactored.
 */
type StaleKeysReasonCategory = 'PLANID_MISMATCH' | 'SOLVERID_MISMATCH' | 'MISSING_FIELDS';

/**
 * Bounded set to track warned (taskId, domain, reasonCategory) tuples.
 * Prevents spam while ensuring severe conditions (solverId mismatch) aren't masked
 * by earlier benign warnings (planId mismatch) — even across different domains.
 */
const _warnedStaleKeys = new Set<string>();
const WARNED_STALE_KEYS_MAX = 1000;

/** Structured context for stale keys warnings — category-specific for production debugging */
type StaleKeysContext =
  | { taskId: string; domain: EpisodeDomain; category: 'PLANID_MISMATCH'; severity: string; planId: string; keysPlanId: string }
  | { taskId: string; domain: EpisodeDomain; category: 'SOLVERID_MISMATCH'; severity: string; planId: string | undefined; gotSolverId: string; expectedSolverId: string }
  | { taskId: string; domain: EpisodeDomain; category: 'MISSING_FIELDS'; severity: string; planIdPresent: boolean; keysPlanIdPresent: boolean };

/**
 * Emit a stale keys warning once per (taskId, domain, category) tuple.
 * Category is passed from the detection site to keep this helper dumb.
 * Context provides category-specific structured data for production debugging.
 */
function warnStaleKeysOnce(
  reason: string,
  context: StaleKeysContext,
): void {
  const warnKey = `${context.taskId}:${context.domain}:${context.category}`;

  if (_warnedStaleKeys.has(warnKey)) return;

  // Bound the set to prevent unbounded growth
  if (_warnedStaleKeys.size >= WARNED_STALE_KEYS_MAX) {
    _warnedStaleKeys.clear();
  }
  _warnedStaleKeys.add(warnKey);

  // Capitalize domain for log prefix (e.g., 'building' -> 'Building')
  const domainLabel = context.domain.charAt(0).toUpperCase() + context.domain.slice(1).replace('_', ' ');

  console.warn(
    `[${domainLabel}] Omitting linkage hashes (${context.severity}): ${reason}`,
    context
  );
}

/**
 * Select join keys for episode reporting if they match the current plan and solver.
 *
 * Returns the join keys if:
 * 1. Both planId and joinKeys.planId are present
 * 2. planIds match
 * 3. If joinKeys.solverId is present, it must match expectedSolverId
 *
 * This is the core guard against cross-domain clobber and stale keys from replans.
 */
function selectJoinKeysForPlan(
  planId: string | undefined,
  joinKeys: { planId?: string; solverId?: string; bundleHash?: string; traceBundleHash?: string } | undefined,
  expectedSolverId: string,
): { planId?: string; bundleHash?: string; traceBundleHash?: string } | undefined {
  if (!planId || !joinKeys?.planId) return undefined;
  if (joinKeys.planId !== planId) return undefined;
  // If solverId is present, it must match (migration keys lack solverId)
  if (joinKeys.solverId && joinKeys.solverId !== expectedSolverId) return undefined;
  return joinKeys;
}

// NOTE: Local buildEpisodeLinkage was removed in 2026-02-03 commit.
// Use buildSterlingEpisodeLinkage from './sterling' instead.
// This ensures Phase 1 identity fields (engineCommitment, operatorRegistryHash)
// are properly forwarded from join keys to report_episode.
// See: STERLING_INTEGRATION_REVIEW.md "Gap 1: Solver Adoption"

// ------------------------------------------------------------------

/**
 * Task integration system for dashboard connectivity
 * @author @darianrosebrook
 */
export class TaskIntegration extends EventEmitter implements ITaskIntegration {
  private config: TaskIntegrationConfig;
  private readonly taskStore: TaskStore;
  private readonly sterlingPlanner: SterlingPlanner;
  private readonly managementHandler: TaskManagementHandler;
  private actionVerifications: Map<string, ActionVerification> = new Map();
  private cognitiveStreamClient: CognitiveStreamClient;
  private thoughtPollingInterval?: NodeJS.Timeout;
  private minecraftClient: ReturnType<typeof createServiceClients>['minecraft'];
  private _inventoryProvider?: () => { items: any[]; ts: number } | undefined;

  private thoughtPollInFlight = false;
  private seenThoughtIds = new Set<string>();
  private deferredAckCounts = new Map<string, number>();

  /**
   * Serial promise chain for protocol effects. All protocol-induced status
   * mutations flow through this drain regardless of whether the caller is
   * async or sync. Prevents overlapping protocol applications.
   *
   * Intentionally global (not partitioned by goalId or taskId): the status
   * mutations from lifecycle hooks can target any task/goal, so a per-entity
   * drain risks ordering violations across entities. If throughput becomes
   * a bottleneck, the clean escape hatch is a partitioned drain keyed by
   * goalId (since goal-scoped effects dominate). Don't partition without
   * auditing cross-goal effect ordering first.
   */
  private protocolEffectsDrain: Promise<void> = Promise.resolve();

  private cognitionOutbox = new CognitionOutbox();
  private goalResolver?: GoalResolver;
  private verifierRegistry?: VerifierRegistry;
  private goalManager?: {
    pause: (id: string) => boolean;
    resume: (id: string) => boolean;
    cancel: (id: string, reason?: string) => boolean;
  };

  get outbox(): CognitionOutbox {
    return this.cognitionOutbox;
  }

  getMcDataPublic(): any {
    return this.sterlingPlanner.getMcData();
  }

  private getMcData(): any {
    return this.sterlingPlanner.getMcData();
  }

  private async fetchBotContext(): Promise<{
    inventory: any[];
    nearbyBlocks: any[];
  }> {
    return this.sterlingPlanner.fetchBotContext();
  }

  private get buildingSolver(): MinecraftBuildingSolver | undefined {
    return this.sterlingPlanner.getSolver<MinecraftBuildingSolver>(
      SOLVER_IDS.BUILDING
    );
  }

  private async minecraftRequest(
    path: string,
    options: { timeout?: number } = {}
  ): Promise<Response> {
    try {
      return await this.minecraftClient.get(path, {
        timeout: options.timeout || 5000,
      });
    } catch (error) {
      console.warn(`Minecraft request failed for ${path}:`, error);
      throw error;
    }
  }

  /**
   * Get inventory items from cached provider or live fetch.
   * Prefers the cached provider when available and fresh (< 5 s).
   */
  private async getInventoryItems(): Promise<any[]> {
    if (this._inventoryProvider) {
      const cached = this._inventoryProvider();
      if (cached && cached.items.length > 0 && Date.now() - cached.ts < 5000) {
        return cached.items;
      }
    }
    const res = await this.minecraftRequest('/inventory', { timeout: 4000 });
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const raw = data?.data;
    return Array.isArray(raw) ? raw : (raw?.items ?? []);
  }

  /**
   * Start polling for cognitive thoughts and convert them to tasks
   */
  private startThoughtToTaskConversion(): void {
    // Poll every 30 seconds for new actionable thoughts to reduce spam
    this.thoughtPollingInterval = setInterval(async () => {
      try {
        await this.processActionableThoughts();
      } catch (error) {
        console.error('Error processing actionable thoughts:', error);
      }
    }, 30000); // 30 seconds

    console.log('[Thought-to-task] Started conversion polling');
  }

  private trimSeenThoughtIds(): void {
    if (this.seenThoughtIds.size <= 500) return;
    const iter = this.seenThoughtIds.values();
    for (let i = 0; i < 100; i++) iter.next();
    const remaining = new Set<string>();
    for (const id of iter) remaining.add(id);
    this.seenThoughtIds = remaining;
  }

  private async processActionableThoughts(): Promise<void> {
    if (this.thoughtPollInFlight) return;
    this.thoughtPollInFlight = true;

    // Track all evaluated thoughts for batch acking
    const thoughtsToAck: string[] = [];
    let convertedCount = 0;
    let skippedCount = 0;

    try {
      const actionableThoughts =
        await this.cognitiveStreamClient.getActionableThoughts();

      for (const thought of actionableThoughts) {
        let conversionResult:
          | {
              decision: string;
              reason?: string;
              task: Task | null;
              managementResult?: ManagementResult;
            }
          | null = null;
        try {
          const result = await convertThoughtToTask(thought, {
            addTask: this.addTask.bind(this),
            markThoughtAsProcessed: this.markThoughtAsProcessed.bind(this),
            seenThoughtIds: this.seenThoughtIds,
            trimSeenThoughtIds: () => this.trimSeenThoughtIds(),
            // Wrap management handler to route through handleManagementAction
            // which applies hold protocol for goal-bound tasks
            managementHandler: {
              handle: (action: SterlingManagementAction, sourceThoughtId?: string) =>
                this.handleManagementAction(action, sourceThoughtId),
            },
            config: {
              strictConvertEligibility: this.config.strictConvertEligibility,
            },
          });
          conversionResult = result;

          // Track conversion stats
          if (result.task || result.managementResult) {
            convertedCount++;
          } else {
            skippedCount++;
          }

          if (result.task) {
            this.emit('thoughtConvertedToTask', { thought, task: result.task });
          }
          if (result.managementResult) {
            console.log(
              `[Thought-to-task] management ${result.managementResult.action}: ${result.managementResult.decision}` +
                (result.managementResult.affectedTaskId
                  ? ` → task ${result.managementResult.affectedTaskId}`
                  : '') +
                (result.managementResult.reason
                  ? ` (${result.managementResult.reason})`
                  : '')
            );
            this.emit('managementAction', {
              thought,
              result: result.managementResult,
            });
          }
          if (
            result.decision !== 'created' &&
            result.decision !== 'dropped_seen' &&
            result.decision !== 'blocked_guard' &&
            !result.managementResult
          ) {
            console.log(
              `[Thought-to-task] ${result.decision}: ${result.reason || thought.content.slice(0, 60)}`
            );
          }
        } catch (error) {
          console.error('Error converting thought to task:', error);
          skippedCount++;
        } finally {
          const decision = conversionResult?.decision;
          const allowAck =
            !PLANNING_INGEST_DEBUG_400 ||
            decision === 'created' ||
            conversionResult?.managementResult != null ||
            decision === 'dropped_not_executable';

          if (allowAck) {
            thoughtsToAck.push(thought.id);
            this.deferredAckCounts.delete(thought.id);
          } else {
            const count = (this.deferredAckCounts.get(thought.id) ?? 0) + 1;
            this.deferredAckCounts.set(thought.id, count);
            if (count >= DEBUG_ACK_DEFERRAL_LIMIT) {
              console.warn(
                `[Thought-to-task][Debug] Forcing ACK after ${count} deferrals for thought ${thought.id} (decision=${decision ?? 'unknown'})`
              );
              thoughtsToAck.push(thought.id);
              this.deferredAckCounts.delete(thought.id);
            } else {
              console.warn(
                `[Thought-to-task][Debug] Deferring ACK for thought ${thought.id} (decision=${decision ?? 'unknown'})`
              );
            }
          }
        }
      }

      // Batch ack all evaluated thoughts
      if (thoughtsToAck.length > 0) {
        await this.cognitiveStreamClient.ackThoughts(thoughtsToAck);
        console.log(`[Thought-to-task] Census: fetched=${actionableThoughts.length} converted=${convertedCount} skipped=${skippedCount} acked=${thoughtsToAck.length}`);
      }
    } catch (error) {
      console.error('Error processing actionable thoughts:', error);
    } finally {
      this.thoughtPollInFlight = false;
    }
  }

  /**
   * Mark a thought as processed via cognition service ack endpoint
   */
  private async markThoughtAsProcessed(thoughtId: string): Promise<void> {
    this.cognitionOutbox.enqueue(
      'http://localhost:3003/api/cognitive-stream/ack',
      { thoughtIds: [thoughtId] }
    );
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: string,
    status: string,
    options?: MutationOptions
  ): Promise<void> {
    const task = this.taskStore.getTask(taskId);
    if (task) {
      const previousStatus = task.status;
      const origin = options?.origin ?? 'runtime';

      // Goal-binding protocol: compute hook result before persist so that
      // hold/clear_hold effects targeting THIS task can be applied atomically
      // with the status change. This prevents transient illegal states
      // (e.g., paused without hold) from being visible to observers.
      let hookResult: ReturnType<typeof onTaskStatusChanged> | undefined;
      let remainingEffects: SyncEffect[] = [];
      if (origin === 'runtime') {
        const binding = (task.metadata as any).goalBinding as
          | GoalBinding
          | undefined;
        if (binding) {
          hookResult = onTaskStatusChanged(
            { ...task, status: status as Task['status'] },
            previousStatus,
            status as Task['status'],
            { verifierRegistry: this.verifierRegistry }
          );

          if (hookResult && hookResult.syncEffects.length > 0) {
            const { self, remaining } = partitionSelfHoldEffects(
              taskId,
              hookResult.syncEffects
            );
            remainingEffects = remaining;
            applySelfHoldEffects(task, self);
          }
        }
      }

      task.status = status as any;
      console.log(`Updated task ${taskId} status to ${status}`);

      // Persist status change (with any self-targeted hold effects already applied)
      this.taskStore.setTask(task);

      // SSE broadcast for dashboard
      broadcastTaskUpdate('taskStatusUpdated', task);

      // Unblock parent when prerequisite children reach terminal state
      if (status === 'completed' || status === 'failed') {
        this.tryUnblockParent(task);
      }

      // Apply remaining protocol effects (targeting other tasks/goals) after persist.
      // Scheduled through the global drain so protocol effects never overlap.
      // Awaited so cascading status changes complete before lifecycle events fire.
      if (remainingEffects.length > 0) {
        await this.scheduleGoalProtocolEffects(remainingEffects);
      }

      // Emit lifecycle events for thought generation
      await this.emitLifecycleEvent(task, status, previousStatus);
    }
  }

  /**
   * Ensure a task is activated before dispatch.
   *
   * This is the canonical "activation at dispatch boundary" helper.
   * Call this right before executing an action for a task to guarantee
   * the task has transitioned from 'pending' to 'active'.
   *
   * Behavior:
   * - If status is 'pending', calls updateTaskStatus(taskId, 'active')
   * - If already 'active', 'in_progress', 'completed', or 'failed', no-op
   * - Returns true if activation occurred, false if already active/terminal
   *
   * Invariant this enforces:
   * - "If a task is dispatched to the gateway, it cannot be 'pending' after the cycle"
   *
   * @see docs/testing/live-execution-evaluation-phase2.md for the problem this solves
   */
  async ensureActivated(taskId: string): Promise<boolean> {
    const task = this.taskStore.getTask(taskId);
    if (!task) {
      console.warn(`[TaskIntegration] ensureActivated: task ${taskId} not found`);
      return false;
    }

    // Already in a non-pending state — no action needed
    if (task.status !== 'pending') {
      return false;
    }

    // Transition pending → active
    await this.updateTaskStatus(taskId, 'active');
    console.log(`[TaskIntegration] ensureActivated: ${taskId} transitioned pending → active`);
    return true;
  }

  /**
   * Emit lifecycle events for thought generation
   */
  private async emitLifecycleEvent(
    task: Task,
    newStatus: string,
    previousStatus: string
  ): Promise<void> {
    try {
      const eventType = this.mapStatusToEventType(newStatus, previousStatus);
      if (!eventType) {
        return; // No event to emit
      }

      // Log the task lifecycle event
      console.log(`Task lifecycle event: ${eventType} for task: ${task.title}`);
    } catch (error) {
      console.warn('⚠️ Failed to emit lifecycle event:', error);
    }
  }

  /**
   * Map task status changes to lifecycle event types
   */
  private mapStatusToEventType(
    newStatus: string,
    previousStatus: string
  ): string | null {
    if (newStatus === 'completed' && previousStatus !== 'completed') {
      return 'task_completed';
    }
    if (newStatus === 'failed' && previousStatus !== 'failed') {
      return 'task_failed';
    }
    if (newStatus === 'active' && previousStatus === 'pending') {
      return 'task_started';
    }
    if (newStatus === 'active' && previousStatus === 'active') {
      return 'task_switch';
    }
    return null;
  }

  /**
   * Get urgency level for a task
   */
  private getUrgencyForTask(task: Task): 'low' | 'medium' | 'high' {
    if (task.priority > 0.8) return 'high';
    if (task.priority > 0.5) return 'medium';
    return 'low';
  }

  /**
   * Normalize priority/urgency from string (e.g. intrusive: low/medium/high) or number to 0..1
   */
  private normalizePriorityOrUrgency(
    value: string | number | undefined,
    defaultVal: number
  ): number {
    if (value === undefined || value === null) return defaultVal;
    if (typeof value === 'number') return Math.max(0, Math.min(1, value));
    const s = String(value).toLowerCase();
    if (s === 'high') return 0.8;
    if (s === 'medium' || s === 'med') return 0.5;
    if (s === 'low') return 0.3;
    return defaultVal;
  }

  /**
   * Get situation context for a task
   */
  private getSituationForTask(task: Task): string {
    if (task.type === 'crafting') return 'tool-crafting';
    if (task.type === 'gathering') return 'resource-gathering';
    if (task.type === 'exploration') return 'exploration';
    return 'task-management';
  }

  /**
   * Get count of active tasks
   */
  private async getActiveTasksCount(): Promise<number> {
    const activeTasks = this.taskStore
      .getAllTasks()
      .filter((task) => task.status === 'pending' || task.status === 'active');
    return activeTasks.length;
  }

  /**
   * Get actionable thoughts (for testing)
   */
  async getActionableThoughts(): Promise<CognitiveStreamThought[]> {
    return await this.cognitiveStreamClient.getActionableThoughts();
  }

  // Ephemeral per-step snapshot to compare before/after state (key: `${taskId}-${stepId}`)
  private _stepStartSnapshots: Map<string, StepSnapshot> = new Map();

  // Rig G replan timer handles (key: taskId)
  private _rigGReplanTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private canonicalItemId(raw: unknown): string {
    return String(raw ?? '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_');
  }

  private buildInventoryIndex(inventory: any[]): Record<string, number> {
    const idx: Record<string, number> = {};
    const raw = Array.isArray(inventory)
      ? inventory
      : ((inventory as any)?.items ?? []);
    for (const it of raw) {
      let name = this.canonicalItemId(it?.name ?? it?.type);
      if (!name) continue;
      // Minecraft API may return "minecraft:coal"; normalize so verification matches
      if (name.startsWith('minecraft:')) name = name.slice('minecraft:'.length);
      idx[name] = (idx[name] || 0) + (it?.count || 0);
    }
    return idx;
  }

  /**
   * Update the current (first incomplete) step label to include a leaf and its parameters
   */
  annotateCurrentStepWithLeaf(
    taskId: string,
    leafName: string,
    args: Record<string, any> = {}
  ): boolean {
    const task = this.taskStore.getTask(taskId);
    if (!task || !Array.isArray(task.steps) || task.steps.length === 0)
      return false;
    const idx = task.steps.findIndex((s) => !s.done);
    if (idx < 0) return false;
    const step = task.steps[idx];

    // Pick a small, useful subset of params to include in label
    const keys = [
      'blockType',
      'block_type',
      'item',
      'recipe',
      'qty',
      'quantity',
      'count',
      'pos',
      'position',
      'target',
      'distance',
      'radius',
      'area',
      'tool',
      'placement',
      'pattern',
      'direction',
      'speed',
      'timeout',
    ];
    const picked: Record<string, any> = {};
    for (const k of keys) if (args[k] !== undefined) picked[k] = args[k];
    const paramStr = Object.keys(picked).length
      ? ` (${Object.entries(picked)
          .map(
            ([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`
          )
          .join(', ')})`
      : '';

    step.label = `Leaf: minecraft.${leafName}${paramStr}`;
    task.metadata.updatedAt = Date.now();
    this.emit('taskMetadataUpdated', { task, metadata: task.metadata });
    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskMetadataUpdated', {
        task,
        metadata: task.metadata,
      });
    }
    return true;
  }

  /**
   * Update the current (first incomplete) step label to include MCP option and parameters
   */
  annotateCurrentStepWithOption(
    taskId: string,
    optionName: string,
    args: Record<string, any> = {}
  ): boolean {
    const task = this.taskStore.getTask(taskId);
    if (!task || !Array.isArray(task.steps) || task.steps.length === 0)
      return false;
    const idx = task.steps.findIndex((s) => !s.done);
    if (idx < 0) return false;
    const step = task.steps[idx];

    const keys = [
      'blockType',
      'block_type',
      'item',
      'recipe',
      'qty',
      'quantity',
      'count',
      'pos',
      'position',
      'target',
      'distance',
      'radius',
      'area',
      'tool',
      'placement',
      'pattern',
      'direction',
      'speed',
      'timeout',
    ];
    const picked: Record<string, any> = {};
    for (const k of keys) if (args[k] !== undefined) picked[k] = args[k];
    const paramStr = Object.keys(picked).length
      ? ` (${Object.entries(picked)
          .map(
            ([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`
          )
          .join(', ')})`
      : '';

    step.label = `Option: ${optionName}${paramStr}`;
    task.metadata.updatedAt = Date.now();
    this.emit('taskMetadataUpdated', { task, metadata: task.metadata });
    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskMetadataUpdated', {
        task,
        metadata: task.metadata,
      });
    }
    return true;
  }

  /**
   * Extract a parameter from a leaf-annotated step label: "Leaf: minecraft.X (key=value, ...)"
   */
  private getLeafParamFromLabel(
    label: string,
    key: string
  ): string | undefined {
    const m = label.match(/\((.*)\)$/);
    if (!m) return undefined;
    const parts = m[1].split(',').map((s) => s.trim());
    for (const p of parts) {
      const [k, ...rest] = p.split('=');
      if (k?.trim() === key) return rest.join('=').trim().replace(/^"|"$/g, '');
    }
    return undefined;
  }
  private statistics: TaskStatistics = {
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageCompletionTime: 0,
    successRate: 0,
    tasksByCategory: {},
    tasksBySource: {},
  };

  constructor(config: Partial<TaskIntegrationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    const serviceClients = createServiceClients();
    this.minecraftClient = serviceClients.minecraft;
    this.taskStore = new TaskStore();
    this.managementHandler = new TaskManagementHandler(this.taskStore);
    this.sterlingPlanner = new SterlingPlanner({
      minecraftGet: (path, opts) =>
        this.minecraftClient.get(path, { timeout: opts?.timeout ?? 5000 }),
    });

    this.cognitiveStreamClient = new CognitiveStreamClient();
    this.cognitionOutbox.start();
    this.startThoughtToTaskConversion();

    if (this.config.enableProgressTracking) {
      this.startProgressTracking();
    }
  }

  registerSolver(solver: BaseDomainSolver): void {
    this.sterlingPlanner.registerSolver(solver);
  }

  setInventoryProvider(
    provider: () => { items: any[]; ts: number } | undefined
  ): void {
    this._inventoryProvider = provider;
  }

  getSolver<T extends BaseDomainSolver>(solverId: string): T | undefined {
    return this.sterlingPlanner.getSolver<T>(solverId);
  }

  /**
   * Wire the hierarchical planning subsystem (Rig E).
   * Instantiates MacroPlanner with the default Minecraft context graph
   * and a FeedbackStore for macro cost learning.
   *
   * After calling this, navigate/explore/find tasks will be planned
   * via the hierarchical planner instead of returning a blocked sentinel.
   */
  configureHierarchicalPlanner(overrides?: {
    macroPlanner?: any;
    feedbackStore?: any;
  }): void {
    if (this.isHierarchicalPlannerConfigured) {
      console.log(
        '[TaskIntegration] Hierarchical planner already configured; no-op'
      );
      return;
    }
    const macroPlanner =
      overrides?.macroPlanner ?? buildDefaultMinecraftGraph();
    const feedbackStore = overrides?.feedbackStore ?? new FeedbackStore();
    this.sterlingPlanner.setMacroPlanner(macroPlanner);
    this.sterlingPlanner.setFeedbackStore(feedbackStore);
    console.log('[TaskIntegration] Rig E hierarchical planner configured');
  }

  /**
   * Check whether the hierarchical planning subsystem is configured.
   */
  get isHierarchicalPlannerConfigured(): boolean {
    return this.sterlingPlanner.isHierarchicalConfigured;
  }

  // ---------------------------------------------------------------------------
  // Goal resolver integration
  // ---------------------------------------------------------------------------

  /**
   * Infer goalType from partial task data.
   * Returns null if the task doesn't map to a recognized goal type.
   */
  private inferGoalType(taskData: Partial<Task>): string | null {
    // Explicit goalType in parameters takes priority
    if (taskData.parameters?.goalType) return taskData.parameters.goalType;

    // Infer from task type/title for building tasks
    const title = (taskData.title || '').toLowerCase();
    const type = (taskData.type || '').toLowerCase();

    if (type === 'building' || title.includes('build')) {
      if (title.includes('shelter')) return 'build_shelter';
      if (title.includes('structure')) return 'build_structure';
      return 'build_shelter'; // Default building goal type
    }

    return null;
  }

  /**
   * Route a goal-sourced task through GoalResolver.
   * Returns the existing or newly created Task, or null to fall through.
   */
  private async resolveGoalTask(
    goalType: string,
    taskData: Partial<Task>
  ): Promise<Task | null> {
    if (!this.goalResolver) return null;

    // Extract bot position from task parameters or use origin
    const botPosition = taskData.parameters?.botPosition ?? {
      x: 0,
      y: 64,
      z: 0,
    };
    const verifier = taskData.parameters?.verifier ?? `verify_${goalType}_v0`;

    const rawIntentParams = taskData.parameters?.intentParams;
    const canonicalizedIntentParams = canonicalizeIntentParams(rawIntentParams);

    // Detect unserializable intentParams: raw was non-null but canonicalized to undefined.
    // Instead of collapsing to undefined (which would merge key-space with "no intentParams"),
    // use a sentinel string that preserves separation. This prevents accidental dedup
    // between tasks with unserializable params and tasks with no params at all.
    let effectiveIntentParams = canonicalizedIntentParams;
    if (rawIntentParams != null && canonicalizedIntentParams === undefined) {
      const rawType = typeof rawIntentParams;
      const rawConstructor = rawIntentParams?.constructor?.name ?? 'unknown';
      effectiveIntentParams = `__unserializable__:${rawConstructor}`;
      console.warn(
        `[GoalIntake] Unserializable intentParams for goalType=${goalType} ` +
          `(typeof=${rawType}, constructor=${rawConstructor}). ` +
          `Using sentinel key "${effectiveIntentParams}" to prevent dedup collision.`
      );
      this.emit('taskLifecycleEvent', {
        type: 'intent_params_unserializable',
        taskType: taskData.type,
        goalType,
        rawType,
        rawConstructor,
        sentinel: effectiveIntentParams,
      });
    }

    const outcome = await this.goalResolver.resolveOrCreate(
      {
        goalType,
        intentParams: effectiveIntentParams,
        botPosition,
        verifier,
        goalId: taskData.parameters?.goalId,
      },
      {
        getAllTasks: () => this.taskStore.getAllTasks(),
        storeTask: (task: Task) => {
          (task.metadata as any)._stage = 'skeleton';
          this.taskStore.setTask(task, {
            allowUnfinalized: true,
            note: 'goal_resolver_skeleton',
          });
          return task;
        },
        generateTaskId: () =>
          taskData.id ||
          `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        generateInstanceId: () =>
          `ginst-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }
    );

    if (outcome.action === 'continue') {
      // Existing non-terminal task matches — return it
      const existing = this.taskStore.getTask(outcome.taskId);
      if (existing) return existing;
      // Task disappeared between resolve and fetch — fall through
      return null;
    }

    if (outcome.action === 'already_satisfied') {
      // Completed task still satisfies this goal — return it
      const existing = this.taskStore.getTask(outcome.taskId);
      if (existing) return existing;
      return null;
    }

    // action === 'created': GoalResolver created a skeleton task with goalBinding.
    // Now we need to enrich it with steps via the normal planning pipeline.
    const created = this.taskStore.getTask(outcome.taskId);
    if (!created) return null;

    // Generate steps for the goal-bound task
    const goalStepResult =
      await this.sterlingPlanner.generateDynamicSteps(taskData);
    const steps = goalStepResult.steps;
    const blockedSentinel =
      steps.length === 1 && steps[0].meta?.blocked === true;

    created.steps =
      taskData.steps && taskData.steps.length > 0 ? taskData.steps : steps;

    // Propagate solver metadata
    if (taskData.metadata?.solver) {
      created.metadata.solver = { ...taskData.metadata.solver };
    }

    // Handle blocked sentinel
    if (blockedSentinel) {
      const reason =
        (steps[0].meta?.blockedReason as string) || 'solver_unavailable';
      applyTaskBlock(created, reason, {
        status: 'pending_planning',
        clearSteps: true,
      });
    }

    return this.finalizeNewTask(created, blockedSentinel);
  }

  /**
   * Single choke-point for all new-task finalization.
   *
   * Both addTask (normal path) and resolveGoalTask (goal-resolver path)
   * call this after task-specific setup is complete. This ensures that
   * every invariant (executability check, stepsDigest, origin stamp,
   * persistence, lifecycle events, drift linter, dashboard notify) is
   * applied exactly once and identically regardless of creation path.
   *
   * If you add a new post-creation invariant, add it HERE, not in the
   * individual creation paths.
   */
  private async finalizeNewTask(
    task: Task,
    blockedSentinel: boolean
  ): Promise<Task> {
    // ── Executability check ──
    // If no step has a leaf / executable flag, the task cannot make progress
    // without manual intervention. Skip when blockedSentinel already set an
    // explicit reason — never overwrite a solver-provided block.
    if (!blockedSentinel) {
      const hasExecutableStep = task.steps.some(
        (s) => s.meta?.leaf || s.meta?.executable === true
      );
      if (task.steps.length > 0 && !hasExecutableStep) {
        applyTaskBlock(task, 'no-executable-plan');
      }
    }

    // ── Seed stepsDigest ──
    // So replan attempt 1 can detect identical plans
    if (task.steps.length > 0 && !blockedSentinel) {
      try {
        const { hashSteps } = await import('./sterling/solve-bundle');
        const digest = hashSteps(
          task.steps.map((s) => ({ action: s.label || s.id }))
        );
        task.metadata.solver ??= {};
        task.metadata.solver.stepsDigest = digest;
      } catch {
        // hashSteps unavailable — digest seeding is best-effort
      }
    }

    // ── Clear skeleton marker ──
    // GoalResolver skeleton persist tags tasks with _stage='skeleton'
    // to identify incomplete intermediate state. Clear it before
    // finalization makes the task observable to consumers.
    if ((task.metadata as any)._stage === 'skeleton') {
      delete (task.metadata as any)._stage;
    }

    // ── Task origin envelope ──
    // Stamped after full construction so it reflects the actual outcome
    // (e.g., whether goalBinding was attached). Immutable after creation —
    // updateTaskMetadata strips 'origin' from patches.
    task.metadata.origin = inferTaskOrigin(task);

    // ── Finalization invariant ──
    // Every task that reaches consumers must have origin stamped. This
    // assertion catches regressions in this method itself (e.g., if the
    // origin stamp is accidentally removed or reordered after persist).
    const strict = process.env.PLANNING_STRICT_FINALIZE === '1';
    if (!task.metadata.origin) {
      const msg = `[FinalizeInvariant] Task ${task.id} reached persist without origin. This is a bug in finalizeNewTask.`;
      this.emit('taskLifecycleEvent', {
        type: 'task_finalize_invariant_violation',
        taskId: task.id,
        taskType: task.type,
        violation: 'missing_origin',
      });
      if (strict) throw new Error(msg);
      console.error(msg);
    }

    // ── Blocked-state consistency check ──
    // If blockedReason is set, blockedAt must also be set. Catches any
    // path that sets a reason without timestamping it.
    if (task.metadata.blockedReason && !task.metadata.blockedAt) {
      const msg = `[FinalizeInvariant] Task ${task.id} has blockedReason="${task.metadata.blockedReason}" but missing blockedAt.`;
      if (strict) throw new Error(msg);
      // Non-strict: backfill from best available timestamp
      task.metadata.blockedAt =
        task.metadata.updatedAt ?? task.metadata.createdAt ?? Date.now();
      console.warn(msg + ' Backfilled.');
    }

    // ── Persist ──
    this.taskStore.setTask(task);
    this.taskStore.updateStatistics();

    // ── Lifecycle events ──
    this.emit('taskAdded', task);

    // ── SSE broadcast for dashboard ──
    broadcastTaskUpdate('taskAdded', task);

    if (task.priority >= 0.8) {
      this.emit('taskLifecycleEvent', {
        type: 'high_priority_added',
        taskId: task.id,
        task,
      });
    }
    if (blockedSentinel) {
      this.emit('taskLifecycleEvent', {
        type: 'solver_unavailable',
        taskId: task.id,
        task,
        reason: task.metadata.blockedReason,
      });
    }

    // ── Dev log ──
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[Planning] Task added: id=${task.id} title="${task.title.slice(0, 50)}" source=${task.source} priority=${task.priority}`
      );
    }

    // ── Goal-binding drift linter ──
    // Detect tasks that claim to be goal-sourced but were not routed through the
    // GoalResolver (so they lack goalBinding metadata). This is the primary early
    // warning for entry-point drift: if new goal-like task types are introduced
    // without extending the resolver gate, this fires.
    if (task.source === 'goal' && !(task.metadata as any)?.goalBinding) {
      let reason: GoalBindingDriftEvent['reason'];
      if (!this.goalResolver) {
        reason = 'goal_resolver_disabled';
      } else if (!GOAL_RESOLVER_GATED_TYPES.has(task.type)) {
        reason = `type_not_gated:${task.type}`;
      } else {
        reason = 'resolver_fallthrough';
      }
      console.warn(
        `[GoalBindingDrift] Task ${task.id} has source='goal' but no goalBinding ` +
          `(reason=${reason}, type=${task.type}). This task will not participate in ` +
          `goal dedup, threat holds, or goal lifecycle events.`
      );
      const driftEvent: GoalBindingDriftEvent = {
        type: 'goal_binding_drift',
        taskId: task.id,
        taskType: task.type,
        source: 'goal',
        reason,
        originKind: task.metadata.origin?.kind,
        hasGoalBinding: false,
        goalType: task.parameters?.goalType,
        title: task.title.slice(0, 80),
      };
      this.emit('taskLifecycleEvent', driftEvent);
    }

    // ── Dashboard ──
    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskAdded', task);
    }

    return task;
  }

  /**
   * Wire the GoalResolver for goal-sourced task deduplication.
   *
   * When enabled, addTask() intercepts tasks with source='goal' and routes
   * them through GoalResolver.resolveOrCreate() before creating a new task.
   * This enforces the uniqueness invariant: at most one non-terminal task
   * per (goalType, goalKey).
   *
   * @see docs/internal/goal-binding-protocol.md §C
   */
  enableGoalResolver(resolver?: GoalResolver): void {
    this.goalResolver = resolver ?? new GoalResolver();
    console.log('[TaskIntegration] Goal resolver enabled');
  }

  /**
   * Check whether the goal resolver is configured.
   */
  get isGoalResolverConfigured(): boolean {
    return this.goalResolver !== undefined;
  }

  /**
   * Wire the verifier registry for goal completion checks.
   */
  enableVerifierRegistry(registry: VerifierRegistry): void {
    this.verifierRegistry = registry;
  }

  /**
   * Wire a GoalManager for goal-side status updates.
   *
   * WARNING: GoalManager methods must NOT mutate tasks. If GoalManager
   * later gains task-side effects, those must route through
   * TaskIntegration with origin: 'protocol' to prevent re-entrancy.
   */
  enableGoalManager(gm: typeof this.goalManager): void {
    this.goalManager = gm;
  }

  // ---------------------------------------------------------------------------
  // Goal-binding protocol: effect application
  //
  // Atomicity contract: consistency is defined at taskStore.setTask()
  // boundaries. TaskStore is reference-based (getTask returns the stored
  // object, not a clone), so mutations to a task object are immediately
  // visible to any code holding a reference. The setTask call is the
  // "commit point" for event-driven observers (e.g., store subscribers).
  //
  // To prevent transient illegal states at commit boundaries:
  // - Self-targeted hold/clear_hold effects are applied to the in-memory
  //   task BEFORE the setTask that changes status.
  // - Cross-task/goal effects are applied AFTER the originating persist.
  //
  // For a hard guarantee against reference-leaking observers, TaskStore
  // would need copy-on-write semantics (getTask returns clones, setTask
  // swaps references). This is not currently implemented.
  // ---------------------------------------------------------------------------

  /**
   * Apply sync effects produced by goal lifecycle hooks.
   *
   * Status effects route through updateTaskStatus with origin='protocol'
   * (preserves lifecycle events, indexing, parent unblocking — only
   * suppresses re-entering goal hooks). Metadata effects (hold, clear_hold,
   * goal_status) apply directly to the store.
   */
  private async applyGoalProtocolEffects(
    effects: SyncEffect[]
  ): Promise<number> {
    // Separate status effects (route through mutators) from metadata effects (direct store)
    const statusEffects: SyncEffect[] = [];
    const otherEffects: SyncEffect[] = [];
    for (const e of effects) {
      if (e.type === 'update_task_status') statusEffects.push(e);
      else otherEffects.push(e);
    }

    // Apply metadata effects (hold, clear_hold, goal_status) via store.
    // Contained: applySyncEffects may throw (e.g. ESM require() inside
    // goal-binding-normalize). Failures here should not skip status effects.
    let count = 0;
    const deps: EffectApplierDeps = {
      getTask: (id) => this.taskStore.getTask(id),
      setTask: (t) => this.taskStore.setTask(t),
      updateGoalStatus: this.goalManager
        ? (goalId, status, reason) => {
            this.emit('goalStatusUpdate', { goalId, status, reason });
            if (status === GoalStatus.SUSPENDED)
              this.goalManager!.pause(goalId);
            else if (status === GoalStatus.FAILED)
              this.goalManager!.cancel(goalId, reason);
            else if (status === GoalStatus.PENDING)
              this.goalManager!.resume(goalId);
          }
        : (goalId, status, reason) => {
            // No GoalManager wired — emit event only
            this.emit('goalStatusUpdate', { goalId, status, reason });
          },
    };
    try {
      count += applySyncEffects(otherEffects, deps);
    } catch (err) {
      // applySyncEffects iterates effects sequentially — it may have mutated
      // some tasks before throwing. count underreports what actually changed.
      console.error('[TaskIntegration] applySyncEffects failed:', {
        effectTypes: otherEffects.map((e) => e.type),
        effectCount: otherEffects.length,
        mayBePartial: true,
        error: err instanceof Error ? err.message : err,
        errorName: err instanceof Error ? err.name : undefined,
        stack: err instanceof Error ? err.stack : undefined,
      });
    }

    // Apply status effects through TaskIntegration mutators (with hook suppression).
    // Best-effort: each effect is awaited individually so lifecycle events, parent
    // unblocking, and cascading hooks complete in order. Errors are contained per-effect
    // so one failing mutation doesn't block the rest.
    for (const e of statusEffects) {
      if (e.type === 'update_task_status') {
        try {
          await this.updateTaskStatus(e.taskId, e.status, {
            origin: 'protocol',
          });
          count++;
        } catch (err) {
          console.error('[TaskIntegration] Protocol status effect failed:', {
            taskId: e.taskId,
            targetStatus: e.status,
            error: err instanceof Error ? err.message : err,
            errorName: err instanceof Error ? err.name : undefined,
            stack: err instanceof Error ? err.stack : undefined,
          });
        }
      }
    }

    return count;
  }

  /**
   * Schedule protocol effects onto the global drain queue.
   *
   * ALL protocol effects flow through here regardless of caller context.
   * Returns a promise that resolves with the count of applied effects,
   * so async callers can await causal ordering while sync callers can
   * fire-and-forget via the drain.
   */
  private scheduleGoalProtocolEffects(effects: SyncEffect[]): Promise<number> {
    // Fast-path: no effects → no queue churn.
    if (effects.length === 0) return Promise.resolve(0);

    const batch = this.protocolEffectsDrain.then(() =>
      this.applyGoalProtocolEffects(effects)
    );
    // Advance the drain past this batch (void return, errors contained).
    this.protocolEffectsDrain = batch.then(
      () => {},
      (err) => {
        console.error('[TaskIntegration] Protocol effects drain error:', {
          error: err instanceof Error ? err.message : err,
          errorName: err instanceof Error ? err.name : undefined,
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
    );
    return batch;
  }

  // ---------------------------------------------------------------------------
  // Goal-binding protocol: management action wrapper
  // ---------------------------------------------------------------------------

  /**
   * Wrap management actions with hold protocol for goal-bound tasks.
   *
   * Management "pause" uses hold reason 'manual_pause' (not 'preempted').
   * Effects are task-scoped (only the targeted task), not goal-scoped.
   * Does NOT use onGoalAction (which is goal-scoped by design).
   *
   * NOTE: Preconditioning is a workaround for the handler doing internal
   * persistence via taskStore.setTask(). The cleaner model is to refactor
   * TaskManagementHandler.handle() to return a patch (decision + proposed
   * mutations) without persisting, letting this wrapper apply the patch
   * atomically with hold state. Remove preconditioning once the handler
   * returns patches instead of persisting internally.
  */
  handleManagementAction(
    actionInput: SterlingManagementAction,
    sourceThoughtId?: string
  ): ManagementResult {
    // Pre-condition hold state on goal-bound tasks BEFORE calling handle().
    // The handler mutates status and persists via taskStore.setTask() —
    // by adjusting hold metadata first, the handler's single persist includes
    // both the status change AND the correct hold state, preventing transient
    // illegal states (paused-without-hold, pending-with-hold) visible to observers.
    const targetId = actionInput.target.taskId ?? null;
    type PreAction = 'hold_applied' | 'hold_cleared' | 'none';
    let preAction: PreAction = 'none';
    let savedHold: GoalBinding['hold'] | undefined;

    if (targetId) {
      const task = this.taskStore.getTask(targetId);
      if (task) {
        const binding = (task.metadata as any).goalBinding as
          | GoalBinding
          | undefined;
        if (binding) {
          if (actionInput.action === 'pause') {
            // Snapshot existing hold before overwriting — rollback must
            // restore the prior hold, not just clear (else we destroy
            // preempted/materials_missing holds on rejection).
            // Overwrite IS intentional: manual_pause supersedes any prior
            // hold reason. Clone isolates from future mutations.
            savedHold = cloneHold(binding.hold);
            // Pre-apply manual_pause hold so handler persists status=paused + hold
            applyHold(task, {
              reason: 'manual_pause',
              heldAt: Date.now(),
              resumeHints: [],
              nextReviewAt: Date.now() + 5 * 60 * 1000,
            });
            syncHoldToTaskFields(task);
            preAction = 'hold_applied';
          } else if (actionInput.action === 'resume' && binding.hold) {
            // Pre-clear hold so handler persists status=pending without hold
            savedHold = cloneHold(binding.hold);
            clearHold(task);
            syncHoldToTaskFields(task);
            preAction = 'hold_cleared';
          } else if (actionInput.action === 'cancel' && binding.hold) {
            // Pre-clear hold so handler persists status=failed without hold
            savedHold = cloneHold(binding.hold);
            clearHold(task);
            syncHoldToTaskFields(task);
            preAction = 'hold_cleared';
          }
        }
      }
    }

    // Snapshot status before handler (handler persists internally)
    const beforeStatus = targetId
      ? this.taskStore.getTask(targetId)?.status
      : undefined;

    const result = this.managementHandler.handle(actionInput, sourceThoughtId);

    // If pre-conditioned but action was rejected, roll back
    if (preAction !== 'none' && result.decision !== 'applied') {
      const task = targetId ? this.taskStore.getTask(targetId) : undefined;
      if (task) {
        const binding = (task.metadata as any).goalBinding as
          | GoalBinding
          | undefined;
        if (binding) {
          if (preAction === 'hold_applied') {
            // Restore prior hold (may have been preempted/materials_missing)
            // or clear if there was no prior hold.
            if (savedHold) {
              applyHold(task, savedHold);
            } else {
              clearHold(task);
            }
          } else if (preAction === 'hold_cleared' && savedHold) {
            applyHold(task, savedHold);
          }
          syncHoldToTaskFields(task);
          this.taskStore.setTask(task);
        }
      }
      return result;
    }

    // Fire goal protocol status hook when status changed on a goal-bound task.
    // Preconditioning handled hold state; this propagates goal-status effects
    // (e.g. update_goal_status → Goal SUSPENDED/FAILED/PENDING).
    //
    // INVARIANT: Management preconditioning (above) MUST apply or clear holds
    // for the target task before the handler persists. The hook below MUST NOT
    // be responsible for self-targeted hold effects in this path. If
    // preconditioning is removed or changed to delegate hold application to
    // the hook, the partitionSelfHoldEffects filter below becomes a silent
    // correctness bug — self-hold effects would be discarded instead of applied.
    if (targetId && result.decision === 'applied') {
      const taskAfter = this.taskStore.getTask(targetId);
      if (taskAfter && beforeStatus && taskAfter.status !== beforeStatus) {
        const binding = (taskAfter.metadata as any).goalBinding as
          | GoalBinding
          | undefined;
        if (binding) {
          const hookResult = onTaskStatusChanged(
            taskAfter,
            beforeStatus,
            taskAfter.status,
            { verifierRegistry: this.verifierRegistry }
          );
          if (hookResult.syncEffects.length > 0) {
            // Self-targeted hold effects were already handled by preconditioning.
            // Filter them out to avoid double-application; schedule only cross-task
            // and goal-status effects.
            const { self, remaining } = partitionSelfHoldEffects(
              targetId,
              hookResult.syncEffects
            );

            // Tripwire: if self-hold effects exist but don't match the already-
            // applied state, preconditioning and the hook have diverged.
            if (self.length > 0) {
              for (const effect of self) {
                if (effect.type === 'apply_hold' && !binding.hold) {
                  console.error(
                    `[TaskIntegration] handleManagementAction: self-hold effect produced but preconditioning did not apply hold for task ${targetId}. This indicates a preconditioning/hook invariant violation.`
                  );
                } else if (effect.type === 'clear_hold' && binding.hold) {
                  console.error(
                    `[TaskIntegration] handleManagementAction: clear_hold effect produced but preconditioning did not clear hold for task ${targetId}. This indicates a preconditioning/hook invariant violation.`
                  );
                }
              }
            }

            if (remaining.length > 0) {
              void this.scheduleGoalProtocolEffects(remaining);
            }
          }
        }
      }
    }

    return result;
  }

  async addTask(taskData: Partial<Task>): Promise<Task> {
    // Goal-sourced task interception: route through GoalResolver when enabled
    if (
      this.goalResolver &&
      taskData.source === 'goal' &&
      GOAL_RESOLVER_GATED_TYPES.has(taskData.type ?? '')
    ) {
      const goalType = this.inferGoalType(taskData);
      if (goalType) {
        const resolved = await this.resolveGoalTask(goalType, taskData);
        if (resolved) return resolved;
        // If resolved is null, fall through to normal addTask path
      }
    }

    let sterlingDedupeKey: string | null = null;
    let sterlingReserved = false;
    if (taskData.type === 'sterling_ir') {
      sterlingDedupeKey = getSterlingDedupeKeyFromMetadata(taskData.metadata);
      if (sterlingDedupeKey) {
        const existingTask = this.taskStore.findBySterlingDedupeKey(sterlingDedupeKey);
        if (existingTask) return existingTask;
        sterlingReserved = this.taskStore.reserveSterlingDedupeKey(sterlingDedupeKey);
      }
    }

    try {
      const similarTask = this.taskStore.findSimilarTask(taskData);
      if (similarTask) return similarTask;

    // Advisory actions are NL-parsed cognitive intent markers that cannot produce
    // deterministic requirementCandidate values. Skip step generation entirely —
    // they serve as observable markers, not executable plans.
    const isAdvisory = taskData.type === 'advisory_action';

    const stepResult = isAdvisory
      ? { steps: [], noStepsReason: 'advisory-skip' as const, route: undefined }
      : await this.sterlingPlanner.generateDynamicSteps(taskData);
    const steps = stepResult.steps;

    // Detect blocked sentinel from solver (e.g., Rig E solver not implemented)
    const blockedSentinel =
      steps.length === 1 && steps[0].meta?.blocked === true;

    // Resolve requirements for the task
    const requirement = resolveRequirement(taskData);

    // Normalize priority/urgency from string (e.g. intrusive thought: low/medium/high) to 0..1
    const priority = this.normalizePriorityOrUrgency(taskData.priority, 0.5);
    const urgency = this.normalizePriorityOrUrgency(taskData.urgency, 0.5);

    const task: Task = {
      id:
        taskData.id ||
        `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: taskData.title || 'Untitled Task',
      description: taskData.description || '',
      type: taskData.type || 'general',
      priority,
      urgency,
      progress: 0,
      status: 'pending',
      source: taskData.source || 'manual',
      steps:
        taskData.steps && taskData.steps.length > 0 ? taskData.steps : steps,
      parameters: taskData.parameters || {},
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: taskData.metadata?.maxRetries || 3,
        childTaskIds: [],
        tags: taskData.metadata?.tags || [],
        category: taskData.metadata?.category || 'general',
        requirement, // Add the resolved requirement
        // Propagate sub-task lineage fields from builder / caller
        parentTaskId: taskData.metadata?.parentTaskId,
      },
    };

    // Propagate integration-critical metadata via centralized allowlist.
    // See PROPAGATED_META_KEYS for the compile-time constrained set.
    projectIncomingMetadata(task.metadata, taskData.metadata);

    // Propagate solver-produced metadata via the solver namespace.
    // Solvers store outputs on taskData.metadata.solver during step generation;
    // since we rebuild metadata above, merge the namespace generically so new
    // solver outputs never require key-by-key enumeration here.
    if (taskData.metadata?.solver) {
      task.metadata.solver = { ...taskData.metadata.solver };
    }

    // Propagate Sterling provenance namespace (opaque). Keep as whole-object merge.
    if (taskData.metadata?.sterling) {
      task.metadata.sterling = { ...taskData.metadata.sterling };
    }

    // Store solve observability from step generation result
    if (stepResult.noStepsReason) {
      task.metadata.solver ??= {};
      task.metadata.solver.noStepsReason = stepResult.noStepsReason;
      task.metadata.solver.routeBackend = stepResult.route?.backend;
      task.metadata.solver.routeRig = stepResult.route?.requiredRig;
    }

    // Invariant guard: internal sub-tasks MUST carry requirementCandidate.
    // advisory_action tasks are exempt — they intentionally skip step generation.
    if (
      stepResult.noStepsReason === 'no-requirement' &&
      taskData.source === 'autonomous' &&
      !isAdvisory &&
      (taskData as any).metadata?.parentTaskId
    ) {
      console.error(
        `[INVARIANT VIOLATION] Internal sub-task "${taskData.title}" has no requirementCandidate. ` +
          `Parent: ${(taskData as any).metadata.parentTaskId}. Fix the sub-task creation site.`
      );
    }

    // Advisory actions are NL-parsed cognitive markers — non-executable by design.
    // Mark them blocked so the executor's eligibility filter skips them.
    if (isAdvisory) {
      applyTaskBlock(task, 'advisory_action');
    }

    // Blocked sentinel: solver explicitly reported it cannot plan (e.g., Rig E not implemented)
    if (blockedSentinel) {
      const reason =
        (steps[0].meta?.blockedReason as string) || 'solver_unavailable';
      applyTaskBlock(task, reason, {
        status: 'pending_planning',
        clearSteps: true,
      });
    }

      if (taskData.type === 'sterling_ir' && sterlingDedupeKey) {
        const existing = this.taskStore.findBySterlingDedupeKey(sterlingDedupeKey);
        if (existing) return existing;
      }
      return this.finalizeNewTask(task, blockedSentinel);
    } finally {
      if (sterlingReserved && sterlingDedupeKey) {
        this.taskStore.releaseSterlingDedupeKey(sterlingDedupeKey);
      }
    }
  }

  updateTaskMetadata(
    taskId: string,
    metadata: Partial<Task['metadata']>
  ): boolean {
    const task = this.taskStore.getTask(taskId);
    if (!task) {
      return false;
    }

    // Protect goalBinding and origin from accidental overwrite.
    // goalBinding is part of the goal protocol control plane — use dedicated
    // goal-binding APIs (applyHold, clearHold, etc.) to mutate it.
    // origin is stamped once at creation and must not change afterward.
    const { goalBinding: _gb, origin: _origin, ...safeMetadata } = metadata;
    if (metadata.goalBinding !== undefined) {
      console.warn(
        `[TaskIntegration] updateTaskMetadata: goalBinding field ignored for task ${taskId}; use goal-binding APIs instead`
      );
    }
    if (metadata.origin !== undefined) {
      console.warn(
        `[TaskIntegration] updateTaskMetadata: origin field ignored for task ${taskId}; origin is immutable after creation`
      );
    }
    task.metadata = {
      ...task.metadata,
      ...safeMetadata,
      updatedAt: Date.now(),
    };
    this.taskStore.setTask(task);
    this.taskStore.updateStatistics();
    this.emit('taskMetadataUpdated', { task, metadata });

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskMetadataUpdated', {
        task,
        metadata,
      });
    }

    return true;
  }

  /**
   * Update task progress and status
   */
  updateTaskProgress(
    taskId: string,
    progress: number,
    status?: Task['status'],
    options?: MutationOptions
  ): boolean {
    const task = this.taskStore.getTask(taskId);
    if (!task) {
      return false;
    }

    const oldProgress = task.progress;
    const oldStatus = task.status;

    // Don't update progress for failed tasks unless explicitly changing status
    if (task.status === 'failed' && !status) {
      console.log(
        `[TaskIntegration] Suppressing progress update for failed task: ${taskId}`
      );
      return false;
    }

    // Guard: only terminal statuses are allowed as real transitions through
    // updateTaskProgress. Everything else MUST go through updateTaskStatus,
    // which handles self-effect partitioning, atomic hold application, and
    // lifecycle events that require async coordination.
    //
    // 'active' is allowed ONLY as a no-op (when the task is already active).
    // Allowing 'active' as a transition would let a caller unpause a held task
    // without clearing the hold, recreating the active-with-hold illegal state.
    const TERMINAL_PROGRESS_STATUSES: ReadonlySet<string> = new Set([
      'completed',
      'failed',
    ]);
    if (
      status &&
      status !== oldStatus &&
      !TERMINAL_PROGRESS_STATUSES.has(status)
    ) {
      console.warn(
        `[TaskIntegration] updateTaskProgress: status transition to '${status}' not allowed via progress API for task ${taskId}; use updateTaskStatus instead`
      );
      return false;
    }

    task.progress = Math.max(0, Math.min(1, progress));
    task.metadata.updatedAt = Date.now();

    if (status) {
      task.status = status;

      if (status === 'active' && !task.metadata.startedAt) {
        task.metadata.startedAt = Date.now();
      } else if (status === 'completed' && !task.metadata.completedAt) {
        task.metadata.completedAt = Date.now();
        task.metadata.actualDuration =
          task.metadata.completedAt -
          (task.metadata.startedAt || task.metadata.createdAt);
        // Report building episode on completion
        this.reportBuildingEpisode(task, true);
        this.emit('taskLifecycleEvent', { type: 'completed', taskId, task });
        // Unblock parent when all prerequisite children are done
        this.tryUnblockParent(task);
      } else if (status === 'failed') {
        // Report building episode on failure
        this.reportBuildingEpisode(task, false);
        this.emit('taskLifecycleEvent', { type: 'failed', taskId, task });
        // Unblock parent even on failure (prereq no longer active)
        this.tryUnblockParent(task);
      }
    }

    const currentStep = task.steps.findIndex((step) => !step.done);
    const completedSteps = task.steps.filter((step) => step.done).length;

    this.taskStore.setTask(task);
    this.taskStore.setProgress(taskId, {
      taskId,
      progress: task.progress,
      currentStep: currentStep >= 0 ? currentStep : task.steps.length,
      completedSteps,
      totalSteps: task.steps.length,
      status: task.status,
      timestamp: Date.now(),
    });

    this.taskStore.updateStatistics();

    // SSE broadcast for dashboard
    broadcastTaskUpdate('taskProgressUpdated', task);

    // Goal-binding protocol: fire progress hook AND status hook (runtime origin only).
    // Both hooks produce effects that are collected and scheduled once.
    const origin = options?.origin ?? 'runtime';
    if (origin === 'runtime') {
      const binding = (task.metadata as any).goalBinding as
        | GoalBinding
        | undefined;
      if (binding) {
        const allEffects: SyncEffect[] = [];

        // Status hook: if status actually changed, fire onTaskStatusChanged so
        // the goal protocol learns about the transition. Without this, status
        // changes via updateTaskProgress (e.g. 'completed', 'failed') would
        // bypass goal-status propagation entirely.
        const statusChanged = status && status !== oldStatus;
        if (statusChanged) {
          const statusHookResult = onTaskStatusChanged(
            task,
            oldStatus,
            task.status,
            { verifierRegistry: this.verifierRegistry }
          );
          if (statusHookResult.syncEffects.length > 0) {
            // Apply self-targeted hold effects synchronously before persist
            // would be ideal, but task is already persisted above. For status
            // changes through this path (completed/failed), self-hold effects
            // are not expected (completed/failed don't produce apply_hold).
            // Route all effects through the drain.
            allEffects.push(...statusHookResult.syncEffects);
          }
        }

        // Progress hook (existing behavior)
        const progressHookResult = onTaskProgressUpdated(task, task.progress, {
          verifierRegistry: this.verifierRegistry,
        });
        if (progressHookResult.syncEffects.length > 0) {
          allEffects.push(...progressHookResult.syncEffects);
        }

        if (allEffects.length > 0) {
          // updateTaskProgress is sync — schedule onto the global drain so
          // protocol effects serialize with effects from all callers.
          // void: intentionally not awaited; drain handles settlement.
          void this.scheduleGoalProtocolEffects(allEffects);
        }
      }
    }

    this.emit('taskProgressUpdated', { task, oldProgress, oldStatus });

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskProgressUpdated', {
        task,
        oldProgress,
        oldStatus,
      });
    }

    return true;
  }

  /**
   * Complete a task step with action verification.
   * Pass skipVerification=true to force-complete a step after repeated verification failures.
   */
  async completeTaskStep(
    taskId: string,
    stepId: string,
    opts?: { skipVerification?: boolean }
  ): Promise<boolean> {
    const task = this.taskStore.getTask(taskId);
    if (!task) {
      return false;
    }

    const step = task.steps.find((s) => s.id === stepId);
    if (!step) {
      return false;
    }

    // Verify action was actually performed if verification is enabled
    if (this.config.enableActionVerification && !opts?.skipVerification) {
      // Allow game state (e.g. inventory) to settle after dig/collect before verification
      const { effectiveLeaf } = this.deriveLeafAndArgs(step);
      const isDigOrCollect =
        effectiveLeaf === 'dig_block' || effectiveLeaf === 'acquire_material';
      if (isDigOrCollect) {
        await new Promise((r) => setTimeout(r, 1500));
      }
      const verification = await this.verifyActionCompletion(
        taskId,
        stepId,
        step
      );
      if (verification.status === 'failed') {
        console.warn(
          `⚠️ Step verification failed [${verification.status}]: ${step.label}`,
          verification.actualResult
        );
        return false;
      }
      // 'verified' and 'skipped' both allow progression
    }

    step.done = true;
    step.completedAt = Date.now();
    if (step.startedAt) {
      step.actualDuration = step.completedAt - step.startedAt;
    }

    // Calculate progress regardless of task status
    const completedSteps = task.steps.filter((s) => s.done).length;
    const newProgress =
      task.steps.length > 0 ? completedSteps / task.steps.length : 1;

    // Determine final status: if all steps done, run inventory gate then complete.
    // Single updateTaskProgress call ensures hooks fire exactly once.
    let finalStatus: Task['status'] | undefined;

    if (task.status === 'failed') {
      console.log(
        `[TaskIntegration] Skipping progress update for failed task: ${taskId}`
      );
      return true;
    }

    if (newProgress >= 1) {
      // Final inventory gate: if the task has a structured requirement with an
      // expected output item/quantity, verify the bot actually has it before
      // marking the task completed. Uses requirement metadata — no label parsing.
      const req = task.metadata?.requirement as
        | { item?: string; outputPattern?: string; quantity?: number }
        | undefined;
      const expectedItem = req?.item ?? req?.outputPattern;
      if (expectedItem) {
        try {
          const inventory = await this.getInventoryItems();
          if (inventory.length > 0) {
            const target = expectedItem.toLowerCase();
            const expectedQty = req?.quantity ?? 1;

            const matchingItems = inventory.filter((it: any) => {
              const name = (it.type ?? it.name ?? '').toString().toLowerCase();
              return name.includes(target);
            });
            const totalQty = matchingItems.reduce(
              (sum: number, it: any) => sum + (it.count || 0),
              0
            );

            if (totalQty < expectedQty) {
              console.log(
                `⚠️ Task steps completed but inventory check failed: need ${expectedQty}x ${expectedItem}, found ${totalQty}`
              );
              // Don't mark as completed — let the autonomous executor handle it
              return true;
            }
          }
        } catch (error) {
          console.warn(
            'Failed final inventory gate for task completion:',
            error
          );
        }
      }

      finalStatus = 'completed';
    }

    this.updateTaskProgress(taskId, finalStatus ? 1 : newProgress, finalStatus);

    this.emit('taskStepCompleted', { task, step });

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskStepCompleted', { task, step });
    }

    return true;
  }

  /**
   * Contract-based verification by leaf: uses meta.leaf + args (and optional meta.produces),
   * delta checks where applicable, and retries within timeout for eventual consistency.
   */
  private async verifyByLeaf(
    taskId: string,
    stepId: string,
    leaf: string,
    args: Record<string, any>,
    step: TaskStep
  ): Promise<boolean> {
    const timeout = this.config.actionVerificationTimeout ?? 10000;
    const leafId = leaf.toLowerCase().trim();

    const produces =
      (step.meta?.produces as Array<{
        name: string;
        count: number;
      }>) || [];
    const producedItem = produces[0]?.name;
    const producedCount = produces[0]?.count ?? 1;

    switch (leafId) {
      case 'move_to':
      case 'step_forward_safely':
      case 'follow_entity':
        return this.retryUntil(
          () => this.verifyMovement(taskId, stepId, 0.75),
          timeout
        );

      case 'dig_block':
        // dig_block breaks a block but does NOT auto-pickup the drop.
        // Pickup is a separate step (collect_items / pickup_item).
        // Verification: the leaf action succeeded — skip inventory check.
        return true;

      case 'pickup_item':
      case 'collect_items':
        return this.retryUntil(
          () => this.verifyPickupFromInventoryDelta(taskId, stepId),
          timeout
        );

      case 'craft_recipe': {
        const recipe = this.canonicalItemId(
          args.recipe ?? producedItem ?? 'unknown'
        );
        const qty = Number(args.qty ?? producedCount ?? 1);
        return this.retryUntil(
          () =>
            this.verifyInventoryDelta(taskId, stepId, recipe, Math.max(1, qty)),
          timeout
        );
      }

      case 'smelt': {
        const out = this.canonicalItemId(producedItem ?? '');
        if (!out)
          return this.retryUntil(() => this.verifySmeltedItem(), timeout);
        return this.retryUntil(
          () =>
            this.verifyInventoryDelta(
              taskId,
              stepId,
              out,
              Math.max(1, producedCount)
            ),
          timeout
        );
      }

      case 'place_block': {
        const item = this.canonicalItemId(
          args.item ?? args.blockType ?? 'crafting_table'
        );
        return this.retryUntil(() => this.verifyNearbyBlock(item), timeout);
      }

      case 'place_torch_if_needed':
        return this.retryUntil(() => this.verifyNearbyBlock('torch'), timeout);

      case 'retreat_and_block': {
        const moved = await this.verifyMovement(taskId, stepId, 0.75);
        const placed = await this.verifyNearbyBlock();
        return moved || placed;
      }

      case 'consume_food':
        return this.retryUntil(
          () => this.verifyConsumeFood(taskId, stepId),
          timeout
        );

      case 'sense_hostiles':
      case 'get_light_level':
      case 'wait':
      case 'look_at':
      case 'turn_left':
      case 'turn_right':
      case 'jump':
      case 'chat':
        return true;

      case 'introspect_recipe':
      case 'prepare_site':
      case 'place_feature':
      case 'build_module':
      case 'replan_building':
        return true;

      case 'acquire_material': {
        const item = this.canonicalItemId(
          args.item ?? args.blockType ?? producedItem ?? 'unknown'
        );
        const acquireTimeout = Math.max(timeout, 20000);
        const acceptedNames = this.getInventoryNamesForVerification(item, true);
        const snap = this._stepStartSnapshots.get(`${taskId}-${stepId}`) as
          | StepSnapshot
          | undefined;
        console.log(
          `[Verify:acquire_material] START item=${item} accepted=[${acceptedNames}] ` +
            `timeout=${acquireTimeout}ms hasSnapshot=${!!snap} ` +
            `snapshotCounts=${snap ? acceptedNames.map((n) => `${n}:${snap.inventoryByName?.[n] ?? 0}`).join(',') : 'none'}`
        );
        const passed = await this.retryUntil(
          () =>
            this.verifyInventoryDelta(
              taskId,
              stepId,
              item,
              1,
              /* isMineStep */ true
            ),
          acquireTimeout
        );
        if (!passed) {
          // Final diagnostic: fetch inventory one more time and log what's actually there
          try {
            const inv = await this.getInventoryItems();
            const idx = this.buildInventoryIndex(inv);
            const relevant = acceptedNames
              .map((n) => `${n}:${idx[n] ?? 0}`)
              .join(',');
            const allKeys = Object.entries(idx)
              .map(([k, v]) => `${k}:${v}`)
              .join(',');
            console.warn(
              `[Verify:acquire_material] FINAL_FAIL item=${item} relevant=[${relevant}] ` +
                `allInventory=[${allKeys}] snapshotBefore=${snap ? acceptedNames.reduce((s, n) => s + (snap.inventoryByName?.[n] ?? 0), 0) : 'none'}`
            );
          } catch {
            /* diagnostic only */
          }
        }
        return passed;
      }

      default:
        // Unknown leaf — the action already succeeded at dispatch time.
        // Log for audit but allow progression rather than blocking all
        // newly-added leaves until a verification case is written.
        console.log(
          `[Verification] No verifier for leaf '${leafId}' — allowing progression`
        );
        return true;
    }
  }

  /**
   * Verify that an action was actually completed using contract-based verification.
   *
   * Routing priority:
   *  1. step.meta.leaf   → verifyByLeaf (structured contract)
   *  2. label-derived leaf → extract leaf+args from label, route through verifyByLeaf
   *  3. non-executable    → skip (does not block progression)
   *
   * No label string-matching for verification logic — all paths converge on verifyByLeaf.
   */
  private async verifyActionCompletion(
    taskId: string,
    stepId: string,
    step: TaskStep
  ): Promise<ActionVerification> {
    const leaf = step.meta?.leaf as string | undefined;
    const verification: ActionVerification = {
      taskId,
      stepId,
      actionType: String(leaf ?? step.label ?? '').toLowerCase(),
      expectedResult: this.getExpectedResultForStep(step),
      verified: false,
      status: 'failed',
      timestamp: Date.now(),
    };

    const setResult = (
      status: VerificationStatus,
      actualResult?: any
    ): ActionVerification => {
      verification.status = status;
      verification.verified = status === 'verified' || status === 'skipped';
      if (actualResult !== undefined) verification.actualResult = actualResult;
      this.actionVerifications.set(`${taskId}-${stepId}`, verification);
      return verification;
    };

    try {
      if (!(await this.isBotConnected())) {
        return setResult('failed', { error: 'Bot not connected' });
      }

      // Derive the effective leaf and args for this step, regardless of source.
      const { effectiveLeaf, effectiveArgs } = this.deriveLeafAndArgs(step);

      // Non-executable steps that have no leaf should not block progression.
      if (!effectiveLeaf && step.meta?.executable !== true) {
        return setResult('skipped', { reason: 'non-executable step' });
      }

      if (effectiveLeaf) {
        const passed = await this.verifyByLeaf(
          taskId,
          stepId,
          effectiveLeaf,
          effectiveArgs,
          step
        );
        return setResult(
          passed ? 'verified' : 'failed',
          passed
            ? undefined
            : { error: 'Leaf verification failed', leaf: effectiveLeaf }
        );
      }

      // No leaf could be derived and step claims to be executable — fail explicitly.
      return setResult('failed', {
        error: 'No leaf derivable for executable step',
        label: step.label,
      });
    } catch (error) {
      return setResult('failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Derive an effective leaf name and args from a step, using structured metadata
   * first, then falling back to label parsing when necessary.
   *
   * This is the single place where labels are parsed — verification itself never
   * inspects labels.
   */
  private deriveLeafAndArgs(step: TaskStep): {
    effectiveLeaf: string | undefined;
    effectiveArgs: Record<string, any>;
  } {
    // 1. Structured metadata — preferred path
    const metaLeaf = step.meta?.leaf as string | undefined;
    if (metaLeaf) {
      return {
        effectiveLeaf: metaLeaf,
        effectiveArgs: (step.meta?.args as Record<string, any>) ?? {},
      };
    }

    const label = step.label.toLowerCase();

    // 2. "Leaf: minecraft.<name> (key=val, ...)" annotation from annotateCurrentStepWithLeaf
    if (label.startsWith('leaf: minecraft.')) {
      const afterPrefix = step.label.slice('Leaf: minecraft.'.length).trim();
      const parenIdx = afterPrefix.indexOf('(');
      const leafName =
        parenIdx >= 0
          ? afterPrefix.slice(0, parenIdx).trim()
          : afterPrefix.trim();
      const args: Record<string, any> = {};
      if (parenIdx >= 0) {
        const paramStr = afterPrefix.slice(
          parenIdx + 1,
          afterPrefix.lastIndexOf(')')
        );
        for (const part of paramStr.split(',')) {
          const [k, ...rest] = part.split('=');
          if (k?.trim())
            args[k.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
        }
      }
      return { effectiveLeaf: leafName.toLowerCase(), effectiveArgs: args };
    }

    // 3. "Collect X (n/m)" / "Mine X (n/m)" / "Gather X (n/m)" macro labels
    const collectMatch = label.match(
      /^(?:collect|mine|gather)\s+(.+?)\s*\(\d+\/\d+\)$/
    );
    if (collectMatch) {
      const item = collectMatch[1].trim() || 'oak_log';
      return {
        effectiveLeaf: 'dig_block',
        effectiveArgs: { blockType: item },
      };
    }

    // 4. Well-known legacy labels → synthetic leaf mappings
    const LEGACY_LABEL_MAP: Record<
      string,
      { leaf: string; args?: Record<string, any> }
    > = {
      'locate nearby wood': { leaf: 'sense_hostiles' }, // observational — auto-pass
      'locate nearby resources': { leaf: 'sense_hostiles' },
      'move to resource location': { leaf: 'move_to' },
      'move to location': { leaf: 'move_to' },
      'collect wood safely': {
        leaf: 'dig_block',
        args: { blockType: 'oak_log' },
      },
      'collect resources safely': {
        leaf: 'dig_block',
        args: { blockType: 'oak_log' },
      },
      'store collected items': { leaf: 'wait' }, // no-op — items are already in inventory
      'check required materials': { leaf: 'wait' }, // observational
      'gather missing materials': {
        leaf: 'dig_block',
        args: { blockType: 'oak_log' },
      },
      'access crafting interface': {
        leaf: 'place_block',
        args: { item: 'crafting_table' },
      },
      'create the item': { leaf: 'craft_recipe' },
    };

    const mapped = LEGACY_LABEL_MAP[label];
    if (mapped) {
      return {
        effectiveLeaf: mapped.leaf,
        effectiveArgs: mapped.args ?? {},
      };
    }

    // 5. No derivation possible
    return { effectiveLeaf: undefined, effectiveArgs: {} };
  }

  /**
   * Get expected result for a step
   */
  private getExpectedResultForStep(step: TaskStep): any {
    const { effectiveLeaf, effectiveArgs } = this.deriveLeafAndArgs(step);
    if (!effectiveLeaf) return { completed: true };

    switch (effectiveLeaf) {
      case 'move_to':
      case 'step_forward_safely':
      case 'follow_entity':
        return { moved: true, distance: '>0' };
      case 'dig_block':
      case 'acquire_material':
        return {
          collected: true,
          item: effectiveArgs.blockType ?? effectiveArgs.item,
        };
      case 'craft_recipe':
        return { crafted: true, recipe: effectiveArgs.recipe };
      case 'place_block':
        return {
          placed: true,
          item: effectiveArgs.item ?? effectiveArgs.blockType,
        };
      case 'consume_food':
        return { consumed: true, foodDelta: '>0' };
      case 'smelt':
        return { smelted: true };
      default:
        return { completed: true };
    }
  }

  /**
   * Check if bot is connected
   */
  private async isBotConnected(): Promise<boolean> {
    try {
      const response = await this.minecraftRequest('/health', {
        timeout: 5000,
      });

      if (!response.ok) return false;

      const data = (await response.json()) as any;
      return data.botStatus?.connected === true;
    } catch (error) {
      // Failed to check bot connection: ${error}
      return false;
    }
  }

  /**
   * Verify movement using step baseline (taskId-stepId). Does not delete snapshot.
   */
  private async verifyMovement(
    taskId: string,
    stepId: string,
    minDist = 0.75
  ): Promise<boolean> {
    try {
      const start = this._stepStartSnapshots.get(`${taskId}-${stepId}`) as
        | StepSnapshot
        | undefined;

      const response = await this.minecraftRequest('/health', {
        timeout: 5000,
      });
      if (!response.ok) return false;

      const data = (await response.json()) as any;
      const p = data?.botStatus?.position;
      if (
        !p ||
        typeof p.x !== 'number' ||
        typeof p.y !== 'number' ||
        typeof p.z !== 'number'
      )
        return false;

      if (start?.position) {
        const dx = p.x - start.position.x;
        const dy = p.y - start.position.y;
        const dz = p.z - start.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return dist >= minDist;
      }

      // Fallback: weak signal from velocity
      const vel = data?.botStatus?.velocity;
      return !!(vel && Math.abs(vel.x) + Math.abs(vel.y) + Math.abs(vel.z) > 0);
    } catch {
      return false;
    }
  }

  /**
   * Retry a predicate until it returns true or timeout. Handles eventual consistency.
   */
  private async retryUntil(
    fn: () => Promise<boolean>,
    timeoutMs: number,
    intervalMs = 2000
  ): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await fn()) return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  }

  /**
   * Verify inventory increased by at least minDelta for itemId since step start (delta-based).
   * For block types that drop different items (e.g. coal_ore -> coal), sums counts across
   * all accepted names so mining verification matches the actual inventory item.
   *
   * @param isMineStep - Pass true for mine/dig steps to enable block→drop equivalences
   *   (e.g. stone→cobblestone). Craft/smelt callers must NOT set this.
   */
  private async verifyInventoryDelta(
    taskId: string,
    stepId: string,
    itemId: string,
    minDelta = 1,
    isMineStep = false
  ): Promise<boolean> {
    try {
      const start = this._stepStartSnapshots.get(`${taskId}-${stepId}`) as
        | StepSnapshot
        | undefined;

      const inventory = await this.getInventoryItems();
      const afterIdx = this.buildInventoryIndex(inventory);

      const acceptedNames = this.getInventoryNamesForVerification(
        itemId,
        isMineStep
      );
      const before = acceptedNames.reduce(
        (sum, name) => sum + (start?.inventoryByName?.[name] ?? 0),
        0
      );
      const after = acceptedNames.reduce(
        (sum, name) => sum + (afterIdx[name] ?? 0),
        0
      );

      const passed = after - before >= minDelta;
      if (!passed) {
        // Include per-name breakdown and full inventory keys for disambiguation
        const perName = acceptedNames
          .map(
            (n) =>
              `${n}(before=${start?.inventoryByName?.[n] ?? 0},after=${afterIdx[n] ?? 0})`
          )
          .join(' ');
        const invKeys = Object.keys(afterIdx).join(',');
        console.warn(
          `[verifyInventoryDelta] FAIL item=${itemId} accepted=[${acceptedNames}] ` +
            `before=${before} after=${after} delta=${after - before} need=${minDelta} ` +
            `hasSnapshot=${!!start} breakdown=[${perName}] inventoryKeys=[${invKeys}]`
        );
      }
      return passed;
    } catch (err) {
      console.warn(`[verifyInventoryDelta] ERROR item=${itemId}:`, err);
      return false;
    }
  }

  /**
   * Verify a pickup by checking if inventory total increased since step start
   */
  private async verifyPickupFromInventoryDelta(
    taskId: string,
    stepId: string
  ): Promise<boolean> {
    try {
      const start = this._stepStartSnapshots.get(`${taskId}-${stepId}`) as any;
      const inventory = await this.getInventoryItems();
      const total = Array.isArray(inventory)
        ? inventory.reduce((s: number, it: any) => s + (it?.count || 0), 0)
        : 0;
      if (start && typeof start.inventoryTotal === 'number') {
        const passed = total > start.inventoryTotal;
        if (!passed) {
          console.warn(
            `[verifyPickupFromInventoryDelta] FAIL startTotal=${start.inventoryTotal} nowTotal=${total}`
          );
        }
        return passed;
      }
      // No baseline; accept if any items present
      return total > 0;
    } catch {
      return false;
    }
  }

  /**
   * Verify that a block is present nearby (optionally matching a pattern)
   */
  private async verifyNearbyBlock(pattern?: string): Promise<boolean> {
    try {
      const res = await this.minecraftRequest('/state', { timeout: 5000 });
      if (!res.ok) return false;
      const data = (await res.json()) as any;
      const blocks: any[] =
        data?.data?.worldState?.environment?.nearbyBlocks || [];
      if (!Array.isArray(blocks)) return false;
      if (!pattern) {
        return blocks.length > 0; // some block visible nearby
      }
      const p = pattern.toLowerCase();
      return blocks.some((b: any) =>
        String(b?.type || b?.name || '')
          .toLowerCase()
          .includes(p)
      );
    } catch {
      return false;
    }
  }

  /**
   * Verify that food level increased since step start (consume_food)
   */
  private async verifyConsumeFood(
    taskId: string,
    stepId: string
  ): Promise<boolean> {
    try {
      const start = this._stepStartSnapshots.get(`${taskId}-${stepId}`) as any;
      const res = await this.minecraftRequest('/health', { timeout: 4000 });
      if (!res.ok) return false;
      const data = (await res.json()) as any;
      const food = data?.botStatus?.food;
      if (typeof food !== 'number') return false;
      if (start && typeof start.food === 'number') {
        return food > start.food;
      }
      return food > 0;
    } catch {
      return false;
    }
  }

  /**
   * Verify smelted item presence (heuristic: iron ingot or similar)
   */
  private async verifySmeltedItem(): Promise<boolean> {
    try {
      const inventory = await this.getInventoryItems();
      const patterns = ['iron_ingot', 'cooked_', 'charcoal'];
      const found = inventory.some((it: any) => {
        const name = String(it?.type || it?.name || '').toLowerCase();
        return patterns.some((p) => name.includes(p));
      });
      if (!found) {
        console.warn(
          `[verifySmeltedItem] FAIL patterns=[${patterns}] inventorySize=${Array.isArray(inventory) ? inventory.length : 0}`
        );
      }
      return found;
    } catch {
      return false;
    }
  }

  /**
   * Resolve block type (e.g. coal_ore) to inventory item name(s) for verification.
   * Mining coal_ore yields coal; verification must accept the drop item, not the block name.
   * Wood-type blocks (oak_log, etc.) also accept "log" so APIs that return generic "log" match.
   *
   * @param isMineStep - When true, include non-ore block→drop mappings (stone→cobblestone).
   *   These only apply in mine/dig contexts where the environment determines the drop.
   *   Craft/smelt verification should NOT set this — it would create false equivalences.
   */
  private getInventoryNamesForVerification(
    resourceType: string,
    isMineStep = false
  ): string[] {
    const lower = resourceType.toLowerCase();
    const names = [lower];
    const drop = ORE_DROP_MAP[lower as keyof typeof ORE_DROP_MAP];
    if (drop) {
      names.push(drop.item.toLowerCase());
    }
    if (isMineStep) {
      const blockDrop = BLOCK_DROP_MAP[lower as keyof typeof BLOCK_DROP_MAP];
      if (blockDrop && blockDrop !== 'air') {
        names.push(blockDrop);
      }
    }
    if (lower.includes('log') || lower === 'wood') {
      if (!names.includes('log')) names.push('log');
      if (!names.includes('wood')) names.push('wood');
    }
    return names;
  }

  /**
   * Start a task step and capture a before-snapshot for verification.
   * Awaits snapshot capture so verifyInventoryDelta has a baseline when the step completes.
   */
  async startTaskStep(
    taskId: string,
    stepId: string,
    options?: { dryRun?: boolean }
  ): Promise<boolean> {
    const dryRun = options?.dryRun ?? false;
    const task = this.taskStore.getTask(taskId);
    if (!task) {
      return false;
    }

    const step = task.steps.find((s) => s.id === stepId);
    if (!step) {
      return false;
    }

    // Rig G feasibility gate: check before starting if solver.rigG is present
    const rigGMeta = task.metadata.solver?.rigG;
    if (rigGMeta && !task.metadata.solver?.rigGChecked) {
      const advice = adviseExecution(rigGMeta);

      if (dryRun) {
        // Shadow: evaluate + log, no mutations
        console.log(
          `[Shadow:RigG] Task ${taskId}: proceed=${advice.shouldProceed}, ` +
            `replan=${advice.shouldReplan}, reason=${advice.blockReason || 'none'}`
        );
        this.emit('taskLifecycleEvent', {
          type: 'shadow_rig_g_evaluation',
          taskId,
          advice: {
            shouldProceed: advice.shouldProceed,
            shouldReplan: advice.shouldReplan,
            blockReason: advice.blockReason,
            suggestedParallelism: advice.suggestedParallelism,
          },
        });
        return advice.shouldProceed;
      }

      // Live mode: apply mutations
      task.metadata.solver!.rigGChecked = true;
      task.metadata.solver!.suggestedParallelism = advice.suggestedParallelism;

      if (!advice.shouldProceed) {
        // Route through updateTaskStatus so goal-binding protocol hooks fire
        task.metadata.blockedReason =
          advice.blockReason || 'Rig G feasibility gate failed';
        task.metadata.updatedAt = Date.now();
        this.taskStore.setTask(task); // persist metadata before status transition
        await this.updateTaskStatus(taskId, 'unplannable');
        console.log(
          `[RigG-Gate] Task ${taskId} blocked: ${advice.blockReason}`
        );
        // Enqueue re-solve
        if (advice.shouldReplan) {
          this.emit('taskLifecycleEvent', {
            type: 'rig_g_replan_needed',
            taskId,
            task,
            reason: advice.replanReason,
          });
          this._scheduleRigGReplan(taskId, advice);
        }
        return false;
      }
    }

    if (dryRun) {
      // No Rig G gate to evaluate (or already checked); shadow has nothing more to do
      return true;
    }

    step.startedAt = Date.now();

    // Capture bot snapshot at step start for verification (key: taskId-stepId).
    // Await so verification has a baseline when completeTaskStep runs.
    const key = `${taskId}-${stepId}`;
    try {
      const [healthRes, inventory] = await Promise.all([
        this.minecraftRequest('/health', { timeout: 3000 }),
        this.getInventoryItems(),
      ]);

      const snap: StepSnapshot = { ts: Date.now() };
      if (healthRes.ok) {
        const data = (await healthRes.json()) as any;
        const p = data?.botStatus?.position;
        if (
          p &&
          typeof p.x === 'number' &&
          typeof p.y === 'number' &&
          typeof p.z === 'number'
        ) {
          snap.position = { x: p.x, y: p.y, z: p.z };
        }
        const food = data?.botStatus?.food;
        if (typeof food === 'number') snap.food = food;
        const health = data?.botStatus?.health;
        if (typeof health === 'number') snap.health = health;
      }
      if (inventory.length > 0) {
        snap.inventoryTotal = inventory.reduce(
          (s: number, it: any) => s + (it?.count || 0),
          0
        );
        snap.inventoryByName = this.buildInventoryIndex(inventory);
      }
      this._stepStartSnapshots.set(key, snap);
    } catch {
      // Snapshot creation failed; verification may use before=0 (no baseline)
    }

    // Update task status to active if it was pending
    if (task.status === 'pending') {
      await this.updateTaskStatus(taskId, 'active');
    }

    this.emit('taskStepStarted', { task, step });

    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskStepStarted', { task, step });
    }

    return true;
  }

  /**
   * Get all active tasks
   */
  getActiveTasks(): Task[] {
    // Return active/pending tasks sorted by priority (desc) then createdAt (asc)
    return this.taskStore
      .getAllTasks()
      .filter((task) => task.status === 'active' || task.status === 'pending')
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return (a.metadata.createdAt || 0) - (b.metadata.createdAt || 0);
      });
  }

  /**
   * Insert steps before the current (first incomplete) step.
   * Renumbers orders to keep them sequential. Skips duplicates by label.
   */
  addStepsBeforeCurrent(
    taskId: string,
    newSteps: Array<Pick<TaskStep, 'label' | 'estimatedDuration'>>
  ): boolean {
    const task = this.taskStore.getTask(taskId);
    if (!task || !Array.isArray(newSteps) || newSteps.length === 0)
      return false;

    const existingLabels = new Set(
      task.steps.map((s) => s.label.toLowerCase())
    );
    const stepsToInsert: TaskStep[] = newSteps
      .filter((s) => s.label && !existingLabels.has(s.label.toLowerCase()))
      .map((s, idx) => ({
        id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${idx}`,
        label: s.label,
        done: false,
        order: 0, // temp, we reassign below
        estimatedDuration: s.estimatedDuration ?? 3000,
      }));

    if (stepsToInsert.length === 0) return false;

    const insertIndex = task.steps.findIndex((s) => !s.done);
    const at = insertIndex >= 0 ? insertIndex : task.steps.length;
    task.steps.splice(at, 0, ...stepsToInsert);

    // Renumber orders
    task.steps.forEach((s, i) => (s.order = i + 1));

    task.metadata.updatedAt = Date.now();
    this.emit('taskStepsInserted', { task, count: stepsToInsert.length, at });
    if (this.config.enableRealTimeUpdates) {
      this.notifyDashboard('taskStepsInserted', {
        task,
        inserted: stepsToInsert,
        at,
      });
    }
    return true;
  }

  /**
   * Get all tasks with optional filtering
   */
  getTasks(filters?: {
    status?: Task['status'];
    source?: Task['source'];
    category?: string;
    limit?: number;
  }): Task[] {
    let tasks = this.taskStore.getAllTasks();

    if (filters?.status) {
      tasks = tasks.filter((task) => task.status === filters.status);
    }

    if (filters?.source) {
      tasks = tasks.filter((task) => task.source === filters.source);
    }

    if (filters?.category) {
      tasks = tasks.filter(
        (task) => task.metadata.category === filters.category
      );
    }

    if (filters?.limit) {
      tasks = tasks.slice(0, filters.limit);
    }

    return tasks.sort((a, b) => {
      // Sort by priority first, then by creation time
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.metadata.createdAt - b.metadata.createdAt;
    });
  }

  /**
   * Get task statistics
   */
  getTaskStatistics(): TaskStatistics {
    return this.taskStore.getStatistics();
  }

  /**
   * Get task progress for a specific task
   */
  getTaskProgress(taskId: string): TaskProgress | null {
    return this.taskStore.getTaskProgress(taskId);
  }

  /**
   * Get all task progress
   */
  getAllTaskProgress(): TaskProgress[] {
    return this.taskStore.getAllTaskProgress();
  }

  /**
   * When a child task completes or fails, check whether its parent should be
   * unblocked. Clears `blockedReason: 'waiting_on_prereq'` on the parent when
   * all sibling prerequisite tasks are terminal (completed or failed).
   */
  private tryUnblockParent(completedTask: Task): void {
    const parentId = completedTask.metadata?.parentTaskId;
    if (!parentId) return;

    const parent = this.taskStore.getTask(parentId);
    if (!parent) return;
    if (parent.metadata?.blockedReason !== 'waiting_on_prereq') return;

    // Check if all sibling tasks with same parentTaskId are terminal
    const siblings = this.taskStore
      .getAllTasks()
      .filter(
        (t) =>
          t.metadata?.parentTaskId === parentId && t.id !== completedTask.id
      );
    const allTerminal = siblings.every(
      (t) => t.status === 'completed' || t.status === 'failed'
    );

    if (allTerminal) {
      parent.metadata.blockedReason = undefined;
      parent.metadata.updatedAt = Date.now();
      this.taskStore.setTask(parent);
      console.log(
        `[Prereq] Unblocked parent ${parentId}: all prerequisite children are terminal`
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Gap 1: Persist episode_hash from report_episode ack without blocking
  // ────────────────────────────────────────────────────────────────────────

  /** Domain → episode hash slot mapping */
  private static readonly EPISODE_HASH_SLOT = {
    building: 'buildingEpisodeHash',
    crafting: 'craftingEpisodeHash',
    toolProgression: 'toolProgressionEpisodeHash',
    acquisition: 'acquisitionEpisodeHash',
  } as const;

  /**
   * Persist episode hash from Sterling ack into task metadata.
   * Re-reads latest task from store to avoid clobbering concurrent updates.
   * Fails silently if task is gone (expected during cleanup).
   *
   * @param taskId - Task to update
   * @param domain - Domain name (looked up in EPISODE_HASH_SLOT)
   * @param ack - Episode ack from Sterling (may be undefined on failure)
   */
  private persistEpisodeAck(
    taskId: string,
    domain: keyof typeof TaskIntegration.EPISODE_HASH_SLOT,
    ack: EpisodeAck | undefined,
  ): void {
    const slot = TaskIntegration.EPISODE_HASH_SLOT[domain];
    if (!ack?.episodeHash) return;

    const latest = this.taskStore.getTask(taskId);
    if (!latest) return; // Task gone, drop silently

    // Ensure solver namespace exists
    if (!latest.metadata.solver) {
      latest.metadata.solver = {};
    }

    // Merge episode hash without clobbering other fields
    latest.metadata.solver[slot] = ack.episodeHash;
    latest.metadata.updatedAt = Date.now();
    this.taskStore.setTask(latest);

    if (process.env.STERLING_EPISODE_DEBUG === '1') {
      console.log(
        `[Sterling] Persisted ${slot}=${ack.episodeHash.slice(0, 8)}... for task ${taskId}`
      );
    }
  }

  private reportBuildingEpisode(task: Task, success: boolean): void {
    if (!this.buildingSolver) return;
    const templateId = task.metadata.solver?.buildingTemplateId;
    if (!templateId) return;

    const planId = task.metadata.solver?.buildingPlanId;
    let joinKeys = task.metadata.solver?.buildingSolveJoinKeys;

    // ------------------------------------------------------------------
    // MIGRATION COMPAT: deprecated solveJoinKeys fallback
    // Issue: [CB-XXX] Remove after 2026-02-15 if no migration logs observed
    // Narrowed: only building tasks with templateId, no other per-domain keys
    // ------------------------------------------------------------------
    if (!joinKeys && isDeprecatedJoinKeysCompatEnabled() && isSafeForDeprecatedFallback(task)) {
      const deprecated = task.metadata.solver?.solveJoinKeys;
      // Shape sanity: require bundleHash presence (core identity field)
      if (deprecated && deprecated.planId === planId && deprecated.bundleHash) {
        // During migration, deprecated keys lack solverId — accept if planId matches
        joinKeys = deprecated;
        logMigrationFallbackOnce(task.id, planId);
        if (isDebugJoinKeysMigrationEnabled()) {
          console.log(`[JoinKeys] Task ${task.id} using deprecated keys slot for planId=${planId}`);
        }
      }
    }
    // ------------------------------------------------------------------

    // Guard: only use join keys if they match the current planId and solverId.
    // This prevents stale keys from a previous plan or cross-solver clobbering.
    const keysForThisPlan = selectJoinKeysForPlan(planId, joinKeys, BUILDING_SOLVER_ID);

    // Warn once per (taskId, domain, category) — category determined here at detection site
    if (joinKeys && !keysForThisPlan) {
      // Determine category, reason, and context at the source (not via string matching in helper)
      let reason: string;
      let context: StaleKeysContext;

      if (!planId) {
        reason = 'buildingPlanId missing';
        context = {
          taskId: task.id,
          domain: 'building',
          category: 'MISSING_FIELDS',
          severity: 'unexpected',
          planIdPresent: false,
          keysPlanIdPresent: !!joinKeys.planId,
        };
      } else if (!joinKeys.planId) {
        reason = 'joinKeys.planId missing';
        context = {
          taskId: task.id,
          domain: 'building',
          category: 'MISSING_FIELDS',
          severity: 'unexpected',
          planIdPresent: true,
          keysPlanIdPresent: false,
        };
      } else if (joinKeys.solverId && joinKeys.solverId !== BUILDING_SOLVER_ID) {
        reason = `solverId mismatch (got ${joinKeys.solverId})`;
        context = {
          taskId: task.id,
          domain: 'building',
          category: 'SOLVERID_MISMATCH',
          severity: 'unexpected',
          planId,
          gotSolverId: joinKeys.solverId,
          expectedSolverId: BUILDING_SOLVER_ID,
        };
      } else {
        reason = `planId mismatch (keys.planId=${joinKeys.planId}, buildingPlanId=${planId})`;
        context = {
          taskId: task.id,
          domain: 'building',
          category: 'PLANID_MISMATCH',
          severity: 'expected under replans',
          planId,
          keysPlanId: joinKeys.planId,
        };
      }

      warnStaleKeysOnce(reason, context);
    }

    // ────────────────────────────────────────────────────────────────────
    // Gap 3: Richer outcome taxonomy using solve-time substrate when available
    // Core rule: success always → EXECUTION_SUCCESS
    //            failure + solver failed + coherent substrate → use substrate for richer class
    //            failure + solver succeeded (or no/stale substrate) → EXECUTION_FAILURE
    //
    // COHERENCE CHECK: Substrate must match episode's bundleHash to prevent
    // misclassifying replan A's failure as replan B's outcome.
    // ────────────────────────────────────────────────────────────────────
    let linkage: EpisodeLinkage;
    const substrate = task.metadata.solver?.buildingSolveResultSubstrate;

    // Coherence check: substrate must belong to this episode
    // Primary key: bundleHash must match
    // Secondary key: if both planIds present, they must match too (belt + suspenders)
    // If either side lacks bundleHash, we can't verify — fail closed to binary
    const substrateIsCoherent = (() => {
      if (!substrate?.bundleHash || !keysForThisPlan?.bundleHash) return false;
      if (substrate.bundleHash !== keysForThisPlan.bundleHash) return false;
      // If both have planId, they must also match (catches hash collisions, partial updates)
      if (substrate.planId && keysForThisPlan.planId && substrate.planId !== keysForThisPlan.planId) return false;
      return true;
    })()

    if (success) {
      // Success is always EXECUTION_SUCCESS regardless of substrate
      linkage = buildSterlingEpisodeLinkage(keysForThisPlan, 'EXECUTION_SUCCESS');
    } else if (substrate && substrate.solved === false && substrateIsCoherent) {
      // Solver itself failed AND substrate is coherent — use richer classification
      const { linkage: classifiedLinkage, classified } = buildSterlingEpisodeLinkageFromResult(
        keysForThisPlan,
        {
          solved: substrate.solved,
          error: substrate.error,
          totalNodes: substrate.totalNodes,
          searchHealth: substrate.searchHealth,
        },
        substrate.opts,
      );
      linkage = classifiedLinkage;
      if (process.env.STERLING_EPISODE_DEBUG === '1') {
        console.log(
          `[Building] Using richer outcome class from substrate: ${classified.outcomeClass} (${classified.source})`
        );
      }
    } else {
      // Solver succeeded, or no substrate, or substrate is stale/incoherent
      linkage = buildSterlingEpisodeLinkage(keysForThisPlan, 'EXECUTION_FAILURE');
      // Log if substrate was present but incoherent (helps debug replan issues)
      if (substrate && !substrateIsCoherent && process.env.STERLING_EPISODE_DEBUG === '1') {
        console.log(
          `[Building] Substrate incoherent (substrate.bundleHash=${substrate.bundleHash?.slice(0, 8)}, ` +
          `keys.bundleHash=${keysForThisPlan?.bundleHash?.slice(0, 8)}); using binary EXECUTION_FAILURE`
        );
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Clear-on-consume: Remove substrate after episode report to prevent:
    // 1. Future episodes accidentally "reusing" stale substrate
    // 2. Debugging confusion from long-lived substrate that looks relevant
    // The substrate has served its purpose (classification); clear it.
    // ────────────────────────────────────────────────────────────────────────
    if (substrate && task.metadata.solver) {
      delete task.metadata.solver.buildingSolveResultSubstrate;
      if (process.env.STERLING_EPISODE_DEBUG === '1') {
        console.log(`[Building] Cleared substrate after episode report (bundleHash=${substrate.bundleHash?.slice(0, 8)})`);
      }
    }

    // Prefer structured step.meta for module IDs; fall back to label parsing
    const completedModuleIds = task.steps
      .filter(
        (s) =>
          s.done &&
          ((s.meta?.domain === 'building' && s.meta?.moduleId) ||
            s.label.includes('build_module'))
      )
      .map(
        (s) =>
          (s.meta?.moduleId as string) ||
          this.getLeafParamFromLabel(s.label, 'module')
      )
      .filter(Boolean) as string[];

    const failedStep = task.steps.find(
      (s) =>
        !s.done &&
        ((s.meta?.domain === 'building' && s.meta?.moduleId) ||
          s.label.includes('minecraft.'))
    );
    const failedModuleId = failedStep
      ? (failedStep.meta?.moduleId as string) ||
        this.getLeafParamFromLabel(failedStep.label, 'module')
      : undefined;

    // ────────────────────────────────────────────────────────────────────
    // Gap 1: Persist episode_hash asynchronously without blocking completion
    // Fire-and-forget with .then() continuation that re-reads latest task
    // ────────────────────────────────────────────────────────────────────
    const taskId = task.id;
    const reportPromise = this.buildingSolver.reportEpisodeResult(
      templateId,
      success,
      completedModuleIds,
      failedModuleId || undefined,
      success ? undefined : 'execution_failure',
      planId,
      true, // isStub — P0 leaves don't mutate world/inventory
      linkage,
    );

    // Persist episode hash asynchronously — does not block task completion
    void reportPromise
      .then((ack) => this.persistEpisodeAck(taskId, 'building', ack))
      .catch(() => {}); // Swallow errors — episode reporting is best-effort

    // ────────────────────────────────────────────────────────────────────
    // Clear-on-consume: Delete substrate after episode report to prevent
    // stale substrate from lingering and causing debugging confusion.
    // Future episodes will get fresh substrate from the next solve.
    // ────────────────────────────────────────────────────────────────────
    if (task.metadata.solver?.buildingSolveResultSubstrate) {
      delete task.metadata.solver.buildingSolveResultSubstrate;
      task.metadata.updatedAt = Date.now();
      this.taskStore.setTask(task);
    }

    console.log(
      `[Building] Episode reported: planId=${planId}, success=${success}, modules=${completedModuleIds.length}, ` +
        `bundleHash=${keysForThisPlan?.bundleHash?.slice(0, 8) ?? 'none'}, outcomeClass=${linkage.outcomeClass}`
    );
  }

  /**
   * Schedule an automatic replan for a Rig G infeasible task.
   * Idempotent: only one timer per taskId at a time.
   * Capped at 3 attempts with exponential backoff (5s, 15s, 45s).
   */
  private _scheduleRigGReplan(
    taskId: string,
    advice: { replanReason?: string; blockReason?: string }
  ): void {
    // Idempotency: if a replan is already scheduled for this task, skip
    if (this._rigGReplanTimers.has(taskId)) {
      console.log(`[RigG] Replan already scheduled for ${taskId}; skipping`);
      return;
    }

    // Read current attempt count from store (not from captured reference)
    const task = this.taskStore.getTask(taskId);
    if (!task) return;

    const attempts = (task.metadata.solver?.replanAttempts ?? 0) + 1;
    const maxAttempts = 3;

    if (attempts > maxAttempts) {
      // Terminal: exhausted replan attempts
      task.metadata.solver ??= {};
      task.metadata.solver.replanAttempts = attempts;
      task.metadata.blockedReason = `rig_g_replan_exhausted: ${advice.blockReason}`;
      this.taskStore.setTask(task);
      this.emit('taskLifecycleEvent', {
        type: 'rig_g_replan_exhausted',
        taskId,
        reason: `Exhausted ${maxAttempts} replan attempts: ${advice.replanReason}`,
      });
      return;
    }

    // Mark in-flight
    task.metadata.solver ??= {};
    task.metadata.solver.rigGReplan = {
      inFlight: true,
      attempt: attempts,
      scheduledAt: Date.now(),
    };
    this.taskStore.setTask(task);

    // Exponential backoff: 5s, 15s, 45s
    const backoffMs = 5000 * Math.pow(3, attempts - 1);

    const handle = setTimeout(async () => {
      // Clean up timer reference
      this._rigGReplanTimers.delete(taskId);

      try {
        // Re-read task from store (don't use stale captured reference)
        const freshTask = this.taskStore.getTask(taskId);
        if (!freshTask) return;

        // Pre-check: is task still unplannable? Something else may have fixed it.
        if (freshTask.status !== 'unplannable') {
          console.log(
            `[RigG] Task ${taskId} no longer unplannable; skipping replan`
          );
          freshTask.metadata.solver ??= {};
          freshTask.metadata.solver.rigGReplan = undefined;
          this.taskStore.setTask(freshTask);
          return;
        }

        // Record attempt count
        freshTask.metadata.solver ??= {};
        freshTask.metadata.solver.replanAttempts = attempts;

        const previousDigest = freshTask.metadata.solver.stepsDigest as
          | string
          | undefined;

        const result = await this.regenerateSteps(taskId, {
          reason: advice.replanReason,
          feasibilityRejections: advice.blockReason,
        });

        // Clear in-flight marker
        const afterTask = this.taskStore.getTask(taskId);
        if (afterTask) {
          afterTask.metadata.solver ??= {};
          afterTask.metadata.solver.rigGReplan = undefined;

          // Digest comparison: if steps are identical, world hasn't changed enough
          if (result.stepsDigest && result.stepsDigest === previousDigest) {
            console.warn(
              `[RigG] Replan ${attempts} produced identical steps; stopping`
            );
            this.taskStore.setTask(afterTask);
            return;
          }

          // Store new digest
          if (result.stepsDigest) {
            afterTask.metadata.solver.stepsDigest = result.stepsDigest;
          }

          // If new steps are viable, transition back to pending via updateTaskStatus
          // so goal-binding protocol hooks fire for the status change.
          if (
            result.steps &&
            result.steps.length > 0 &&
            !result.steps[0].meta?.blocked
          ) {
            afterTask.metadata.blockedReason = undefined;
            afterTask.metadata.solver.rigGChecked = false; // allow re-evaluation
            this.taskStore.setTask(afterTask); // persist metadata before status transition
            await this.updateTaskStatus(taskId, 'pending');
          } else {
            this.taskStore.setTask(afterTask);
          }
        }
      } catch (err) {
        console.error(`[RigG] Replan ${attempts} failed:`, err);
        // Clear in-flight on error too
        const errTask = this.taskStore.getTask(taskId);
        if (errTask) {
          errTask.metadata.solver ??= {};
          errTask.metadata.solver.rigGReplan = undefined;
          this.taskStore.setTask(errTask);
        }
      }
    }, backoffMs);

    this._rigGReplanTimers.set(taskId, handle);
  }

  async regenerateSteps(
    taskId: string,
    failureContext?: {
      failedLeaf?: string;
      reasonClass?: string;
      attemptCount?: number;
      reason?: string;
      feasibilityRejections?: string;
    }
  ): Promise<{ success: boolean; stepsDigest?: string; steps?: any[] }> {
    const task = this.taskStore.getTask(taskId);
    if (!task) return { success: false };

    let botCtx: {
      inventory: any[];
      nearbyBlocks: any[];
      _unavailable?: boolean;
    };
    try {
      botCtx = await this.sterlingPlanner.fetchBotContext();
    } catch {
      return { success: false };
    }
    if (botCtx._unavailable) return { success: false };

    const updatedTask: Partial<Task> = {
      ...task,
      metadata: {
        ...task.metadata,
        currentState: {
          inventory: botCtx.inventory,
          nearbyBlocks: botCtx.nearbyBlocks,
        },
        failureContext,
      } as any,
    };

    const stepResult =
      await this.sterlingPlanner.generateDynamicSteps(updatedTask);
    const newSteps = stepResult.steps;
    if (!newSteps || newSteps.length === 0) return { success: false };

    const { hashSteps } = await import('./sterling/solve-bundle');
    const digest = hashSteps(
      newSteps.map((s) => ({ action: s.label || s.id }))
    );

    const doneCount = task.steps.filter((s) => s.done).length;
    const updatedSteps = [
      ...task.steps.filter((s) => s.done),
      ...newSteps.map((s, i) => ({ ...s, order: doneCount + i + 1 })),
    ];
    task.steps = updatedSteps;
    this.taskStore.setTask(task);

    return { success: true, stepsDigest: digest, steps: updatedSteps };
  }

  /**
   * Start progress tracking
   */
  private startProgressTracking(): void {
    setInterval(() => {
      const activeTasks = this.getActiveTasks();

      activeTasks.forEach((task) => {
        // Only update progress based on step completion if no manual progress has been set
        // This prevents overriding autonomous task executor progress updates
        const completedSteps = task.steps.filter((step) => step.done).length;
        const totalSteps = task.steps.length;

        if (totalSteps > 0) {
          const stepBasedProgress = completedSteps / totalSteps;

          // Only update if the step-based progress is significantly higher than current progress
          // This allows manual progress updates to take precedence
          if (stepBasedProgress > task.progress + 0.05) {
            this.updateTaskProgress(task.id, stepBasedProgress);
          }
        }
      });
    }, this.config.progressUpdateInterval);
  }

  /**
   * Notify dashboard of changes
   */
  private async notifyDashboard(event: string, data: any): Promise<void> {
    try {
      await fetch(`${this.config.dashboardEndpoint}/api/task-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, data, timestamp: Date.now() }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[Planning] Dashboard task-updates POST failed (${event}):`,
        msg
      );
    }
  }

  cleanupCompletedTasks(): void {
    this.taskStore.cleanupCompleted(this.config.maxTaskHistory);
  }

  /**
   * Get task history
   */
  getTaskHistory(limit: number = 50): Task[] {
    return this.taskStore.getTaskHistory(limit);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<TaskIntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): TaskIntegrationConfig {
    return { ...this.config };
  }
}
