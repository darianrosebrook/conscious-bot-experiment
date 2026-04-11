/**
 * Modular Planning Server
 *
 * New modular server implementation with code splitting and MCP integration.
 * Replaces the monolithic server.ts with a cleaner, more maintainable architecture.
 *
 * @author @darianrosebrook
 */

// Global type declarations
declare global {
  var lastIdleEvent: number | undefined;
  var lastNoTasksLog: number | undefined;
  var lastUserCommand: number | undefined;
  /**
   * IdleEngine instance. Constructed at startup, consumed by the
   * autonomous executor's onIdle branch. Unconditional — no env gate.
   * Typed as `any` to avoid src/ vs dist/ nominal conflicts in
   * `declare global` (same pattern as `reflexRegistry` below at line 237).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var idleEngine: any;
}

/**
 * IDLE-1: Eligibility-based idle detection.
 * Idle events only fire when no tasks are eligible to run, not when activeTasks.length === 0.
 * The idle_reason allows cognition to treat different idle states appropriately.
 */
export type IdleReason =
  | 'no_tasks' // True cognitive idle (no work exists)
  | 'all_in_backoff' // Tasks exist but are cooling down
  | 'circuit_breaker_open' // Executor is in protection mode
  | 'blocked_on_prereq' // Tasks waiting on dependencies
  | 'manual_pause'; // Tasks are manually paused

/**
 * Determine the idle reason based on task and system state.
 * Returns null if not idle (there are eligible tasks to run).
 */
function determineIdleReason(
  activeTasks: any[],
  eligibleTasks: any[],
  circuitBreakerOpen: boolean
): IdleReason | null {
  // If there are eligible tasks, we're not idle
  if (eligibleTasks.length > 0) return null;

  // No active tasks at all = true idle
  if (activeTasks.length === 0) return 'no_tasks';

  // Circuit breaker is open
  if (circuitBreakerOpen) return 'circuit_breaker_open';

  // Tasks exist but none are eligible - determine why
  const allManualPaused = activeTasks.every(
    (t) => t.metadata?.manualPause === true
  );
  if (allManualPaused) return 'manual_pause';

  const allBlocked = activeTasks.every(
    (t) => t.metadata?.blockedReason != null
  );
  if (allBlocked) return 'blocked_on_prereq';

  // Default: tasks are in backoff
  return 'all_in_backoff';
}

import { ServerConfiguration } from './modules/server-config';
import {
  createPlanningEndpoints,
  PlanningSystem,
} from './modules/planning-endpoints';
import { MCPIntegration } from './modules/mcp-integration';
import { IdleEngine, type IdleGoalDecision } from './idle-engine';
import { getGoldenRunRecorder, toDispatchResult } from './golden-run-recorder';
import { buildFailureSignature } from './task-lifecycle/failure-signature';
import { getLoopBreaker } from './task-lifecycle/loop-breaker';
import { getPlanningRuntimeConfig } from './planning-runtime-config';
// Dynamic import to avoid TypeScript path resolution issues
// import { eventDrivenThoughtGenerator, BotLifecycleEvent } from '@conscious-bot/cognition';

// Dynamic import at runtime - will be initialized when needed
let eventDrivenThoughtGenerator: any = null;

/**
 * Get the event-driven thought generator (initialize if needed)
 */
async function getEventDrivenThoughtGenerator(): Promise<any> {
  if (!eventDrivenThoughtGenerator) {
    try {
      const { eventDrivenThoughtGenerator: generator } =
        await import('@conscious-bot/cognition');
      eventDrivenThoughtGenerator = generator;
    } catch (error) {
      console.warn(
        'Failed to initialize event-driven thought generator:',
        error
      );
    }
  }
  return eventDrivenThoughtGenerator;
}
import {
  MC_ENDPOINT,
  mcFetch,
  mcPostJson,
  checkBotConnection,
  checkBotConnectionDetailed,
  waitForBotConnection,
  getBotPosition,
} from './modules/mc-client';
import { normalizeInventory } from './modules/normalize-inventory';

/**
 * Get current bot state snapshot.
 * Returns a minimal state object. Originally built for the deleted keep-alive
 * integration; retained because it's a generally-useful minimal bot state
 * accessor and Phase 2's IdleEngine will likely use it.
 *
 * Uses the /state endpoint which returns bot state in data.data structure.
 */
async function getBotState(): Promise<{
  position?: { x: number; y: number; z: number };
  health?: number;
  food?: number;
  inventory?: Array<{ name: string; count: number }>;
  timeOfDay?: number;
  biome?: string;
  nearbyHostiles?: number;
  nearbyPassives?: number;
}> {
  try {
    const stateRes = await mcFetch('/state').catch(() => null);
    if (!stateRes || !stateRes.ok) {
      return {};
    }

    const stateJson = (await stateRes.json()) as {
      data?: {
        data?: {
          position?: { x: number; y: number; z: number };
          health?: number;
          food?: number;
          inventory?: { items?: Array<{ type?: string; name?: string; count: number; slot?: number; metadata?: number }> };
          timeOfDay?: number;
          biome?: string;
          nearbyHostiles?: number;
          nearbyPassives?: number;
        };
      };
    };

    const botData = stateJson?.data?.data;
    if (!botData) {
      return {};
    }

    return {
      position: botData.position,
      health: botData.health,
      food: botData.food,
      inventory: normalizeInventory(botData.inventory?.items),
      timeOfDay: botData.timeOfDay,
      biome: botData.biome,
      nearbyHostiles: botData.nearbyHostiles,
      nearbyPassives: botData.nearbyPassives,
    };
  } catch (error) {
    console.warn('[getBotState] Failed to fetch bot state:', error);
    return {};
  }
}
import {
  evaluateThreatHolds,
  fetchThreatSignal,
} from './goals/threat-hold-bridge';
import {
  extractItemFromTask,
  mapTaskTypeToMinecraftAction,
  mapBTActionToMinecraft,
  withNavLeaseScope,
} from './modules/action-mapping';
import {
  InventoryItem,
  itemMatches,
  countItems,
  hasPickaxe,
  hasEnoughLogs,
  hasStonePickaxe,
  hasCraftingTableItem,
  hasSticks,
  hasPlanks,
  hasCobblestone,
  inferRecipeFromTitle,
  inferBlockTypeFromTitle,
  findWoodPrefix,
  nextToolUpgrade,
  bestMineableOre,
} from './modules/inventory-helpers';
import {
  TaskRequirement,
  parseRequiredQuantityFromTitle,
  resolveRequirement,
  computeProgressFromInventory,
  computeRequirementSnapshot,
} from './modules/requirements';
import { logOptimizer } from './modules/logging';
import {
  validateLeafArgs,
  normalizeLeafArgs,
} from './modules/leaf-arg-contracts';
import {
  normalizeStepExecutability,
  isExecutableStep,
} from './modules/executable-step';
import { stepToLeafExecution } from './modules/step-to-leaf-execution';
import { INTENT_LEAVES, KNOWN_LEAVES } from './modules/leaf-arg-contracts';
import { executeSterlingStep } from './executor';
import {
  buildTaskFromRequirement,
  computeSubtaskKey,
  type BuildTaskInput,
} from './task-integration/build-task-from-requirement';
import { isDeterministicFailure } from './server/task-action-resolver';
import { HungerDriveshaftController } from './goal-formulation/hunger-driveshaft-controller';
import { RecordingLifecycleEmitter, EnqueueSkipReason } from './goal-formulation/reflex-lifecycle-events';
import { tryEnqueueReflexTask } from './goal-formulation/reflex-enqueue';
import { translateBotState } from './goal-formulation/bot-state-translator';
import { BotStateCache } from './goal-formulation/bot-state-cache';
import { ReflexRegistry } from './goal-formulation/reflex-registry';
import { ExplorationDriveshaftController } from './goal-formulation/exploration-driveshaft-controller';

// Extend global interface for rate limiting variables and reflex system.
declare global {
  var lastTaskCount: number | undefined;
  var lastTaskCountLog: number | undefined;
  var lastMcpWarnLog: number | undefined;
  var lastMcpBotWarnLog: number | undefined;
  var lastConvertedStateLog: number | undefined;
  var lastStateLog: number | undefined;
  /** Hunger driveshaft controller instance (gated by ENABLE_AUTONOMY_REFLEXES) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var hungerDriveshaft: any;
  /** Reflex registry instance (gated by ENABLE_AUTONOMY_REFLEXES). Typed as `any` to avoid src/ vs dist/ nominal conflicts in `declare global`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var reflexRegistry: any;
  /** BotState cache instance (gated by ENABLE_AUTONOMY_REFLEXES) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var botStateCache: any;
  /** Exploration driveshaft controller instance (gated by ENABLE_AUTONOMY_REFLEXES) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var explorationDriveshaft: any;
  /** Lifecycle emitter shared by all reflexes (gated by ENABLE_AUTONOMY_REFLEXES) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var reflexEmitter: any;
  /** Metadata drop counter for diagnostics (P11) */
  var metadataDropCount: number | undefined;
  /** Planning event store instance (gated by PLANNING_EVENT_STORE=1) */
  var planningEventStore: import('./persistence/planning-event-store').PlanningEventStore | undefined;
}

// Import existing components
import { CognitiveIntegration } from './cognitive-integration';
import { BehaviorTreeRunner } from './behavior-trees/BehaviorTreeRunner';
import { CognitiveThoughtProcessor } from './cognitive-thought-processor';
import { createServiceClients, SterlingClient, workstationRegistry, isVerbose } from '@conscious-bot/core';
import type {
  SterlingReasoningService,
  MinecraftCraftingSolver,
  MinecraftBuildingSolver,
  MinecraftToolProgressionSolver,
  MinecraftNavigationSolver,
} from './sterling';
import { normalizeActionResponse } from './server/action-response';
import { executeViaGateway, getExecutorMode } from './server/execution-gateway';
import { createSterlingBootstrap } from './server/sterling-bootstrap';
import {
  shouldAutoUnblockTask,
  evaluateTaskBlockState,
  isTaskEligible,
  DEFAULT_BLOCKED_TTL_MS,
} from './task-lifecycle/task-block-evaluator';
import { logTaskIngestion } from './task-lifecycle/task-ingestion-logger';
import {
  isCircuitBreakerOpen,
  tripCircuitBreaker,
  recordSuccess,
  getCircuitBreakerState,
} from './server/executor-circuit-breaker';
import { executeTaskViaGateway } from './server/gateway-wrappers';
import {
  detectActionableSteps,
  convertCognitiveReflectionToTasks,
} from './server/cognitive-task-handler';
import {
  startAutonomousExecutor as startAutonomousExecutorScheduler,
  parseExecutorConfig,
  parseGeofenceConfig,
  StepRateLimiter,
  initExecutorAbortController,
  getExecutorAbortSignal,
  emergencyStopExecutor,
  type ExecutorConfig,
} from './server/autonomous-executor';
import { registerFailedTaskCategory } from './task-integration/thought-to-task-converter';

// Create HTTP clients for inter-service communication
const serviceClients = createServiceClients();

// Sterling reasoning service (optional external dependency)
let sterlingService: SterlingReasoningService | undefined;
let minecraftCraftingSolver: MinecraftCraftingSolver | undefined;
let minecraftBuildingSolver: MinecraftBuildingSolver | undefined;
let minecraftToolProgressionSolver: MinecraftToolProgressionSolver | undefined;
let minecraftNavigationSolver: MinecraftNavigationSolver | undefined;
import { MemoryIntegration } from './memory-integration';
import { createPlanningBootstrap } from './modules/planning-bootstrap';
import { DirectTaskHistoryProvider } from './task-history-provider';
import { EnvironmentIntegration } from './environment-integration';
import { LiveStreamIntegration } from './live-stream-integration';
import { GoalStatus } from './types';
import { MCPLeafRegistry } from './modules/capability-registry';

export { MCPLeafRegistry } from './modules/capability-registry';
import { WorldStateManager } from './world-state/world-state-manager';
import { WorldKnowledgeIntegrator } from './world-state/world-knowledge-integrator';
import {
  isSystemReady,
  waitForSystemReady,
  setReadinessMonitor,
  markSystemReady,
  getSystemReadyState,
} from './startup-barrier';
import { ReadinessMonitor } from './server/execution-readiness';

// Centralized Minecraft endpoint and resilient HTTP utilities
const worldStateManager = new WorldStateManager(MC_ENDPOINT);
const worldKnowledge = new WorldKnowledgeIntegrator(worldStateManager);
worldStateManager.on('updated', (snapshot) => {
  try {
    worldKnowledge.handleWorldUpdate(snapshot);
  } catch (e) {
    console.warn('WorldKnowledge update failed:', (e as any)?.message);
  }
});

function startWorldStatePolling() {
  worldStateManager.startPolling(3000); // Poll every 3 seconds for testing
}

if (isSystemReady()) {
  startWorldStatePolling();
} else {
  waitForSystemReady().then(() => {
    startWorldStatePolling();
  });
}

// simple low-discrepancy sampler for exploration (deterministic per tick)
function halton(index: number, base: number) {
  let f = 1,
    r = 0;
  while (index > 0) {
    f = f / base;
    r = r + f * (index % base);
    index = Math.floor(index / base);
  }
  return r;
}

function explorePointNear(
  pos: { x: number; y: number; z: number } | undefined,
  attempt: number,
  baseRadius = 8
) {
  if (!pos) return undefined;
  const radius = baseRadius + Math.min(32, attempt * 6);
  const dx = Math.floor((halton(attempt + 1, 2) - 0.5) * 2 * radius);
  const dz = Math.floor((halton(attempt + 1, 3) - 0.5) * 2 * radius);
  return { x: pos.x + dx, y: pos.y, z: pos.z + dz };
}

function resolvedRecipe(task: any, inv?: import('./modules/inventory-helpers').InventoryItem[]) {
  if (task.parameters?.recipe) return task.parameters.recipe;
  const fromTitle = inferRecipeFromTitle(task.title);
  if (fromTitle) return fromTitle;
  // Tier-aware fallback: if task mentions a tool, infer next upgrade from inventory
  const toolMatch = (task.title || '').match(/\b(pickaxe|axe|sword|shovel|hoe)\b/i);
  if (toolMatch && inv) {
    const toolType = toolMatch[1].toLowerCase() as import('./modules/inventory-helpers').ToolType;
    return nextToolUpgrade(inv, toolType);
  }
  if (toolMatch) return `wooden_${toolMatch[1].toLowerCase()}`;
  return undefined;
}
function resolvedBlock(task: any) {
  return (
    task.parameters?.blockType ||
    inferBlockTypeFromTitle(task.title) ||
    (/iron/i.test(task.title || '') ? 'iron_ore' : '_log')
  );
}

// Dispatchable leaf names — derived from CONTRACTS in leaf-arg-contracts.ts.
// A leaf is dispatchable iff it has an explicit LeafArgContract entry.
// KNOWN_LEAVES is exported from leaf-arg-contracts.ts as Object.keys(CONTRACTS).
const KNOWN_LEAF_NAMES = KNOWN_LEAVES;

/** Option B bridge: task_type_* intent leaves from Sterling expand-by-digest.
 *  Only allowlisted when ENABLE_TASK_TYPE_BRIDGE=1 (dev/golden only; forbidden in production).
 *  Uses INTENT_LEAVES from leaf-arg-contracts (single source of truth). */
const TASK_TYPE_BRIDGE_LEAF_NAMES = INTENT_LEAVES;

const ENABLE_TASK_TYPE_BRIDGE =
  String(process.env.ENABLE_TASK_TYPE_BRIDGE || '') === '1';

// mc-fetch helpers are imported from modules/mc-client

/**
 * Query MCP for available minecraft leaves/tools
 */
async function getAvailableLeaves(): Promise<Set<string>> {
  const now = Date.now();
  const ttl = 10_000;
  if (
    (getAvailableLeaves as any).__cache &&
    now - (getAvailableLeaves as any).__ts < ttl
  ) {
    return new Set((getAvailableLeaves as any).__cache);
  }
  try {
    const mcp = serverConfig.getMCPIntegration();
    if (!mcp) return new Set();
    const tools = await mcp.listTools();
    const leaves = tools
      .filter((t: string) => t.startsWith('minecraft.'))
      .map((t: string) => t.replace(/^minecraft\./, ''));
    (getAvailableLeaves as any).__cache = leaves;
    (getAvailableLeaves as any).__ts = now;
    return new Set(leaves);
  } catch {
    return new Set();
  }
}

// Declare global properties used for scheduling to satisfy TS in ESM modules
declare global {
  // Reentrancy guard state for the autonomous executor
  // eslint-disable-next-line no-var
  var __planningExecutorState:
    | {
        running: boolean;
        failures: number;
        lastAttempt: number;
        breaker: 'closed' | 'open' | 'half-open';
        /** True when setInterval is registered (not just during a cycle). */
        intervalRegistered?: boolean;
        /** Timestamp of the most recent tick (whether it ran a cycle or not). */
        lastTickAt?: number;
        /** Monotonic tick counter. */
        tickCount?: number;
        /** Last error message (cleared on successful cycle). */
        lastError?: string;
      }
    | undefined;
  // Interval handle for executor loop
  // eslint-disable-next-line no-var
  var __planningInterval: NodeJS.Timeout | undefined;
  // Timeout handle for initial kick
  // eslint-disable-next-line no-var
  var __planningInitialKick: NodeJS.Timeout | undefined;
}

const EXECUTOR_POLL_MS = Number(process.env.EXECUTOR_POLL_MS || 10_000);
const EXECUTOR_MAX_BACKOFF_MS = Number(
  process.env.EXECUTOR_MAX_BACKOFF_MS || 60_000
);
const BOT_BREAKER_OPEN_MS = Number(process.env.BOT_BREAKER_OPEN_MS || 15_000);
const BUILD_EXEC_BUDGET_DISABLED =
  String(process.env.BUILD_EXEC_BUDGET_DISABLED || '') === '1';
const BUILD_EXEC_MAX_ATTEMPTS = Number(
  process.env.BUILD_EXEC_MAX_ATTEMPTS || 5
);
const BUILD_EXEC_MIN_INTERVAL_MS = Number(
  process.env.BUILD_EXEC_MIN_INTERVAL_MS || 5000
);
const BUILD_EXEC_MAX_ELAPSED_MS = Number(
  process.env.BUILD_EXEC_MAX_ELAPSED_MS || 120000
);
const DASHBOARD_STREAM_URL = process.env.DASHBOARD_ENDPOINT
  ? `${process.env.DASHBOARD_ENDPOINT}/api/ws/cognitive-stream`
  : 'http://localhost:3000/api/ws/cognitive-stream';

const executorConfig: ExecutorConfig = (() => {
  const cfg = parseExecutorConfig();
  cfg.leafAllowlist = buildLeafAllowlist(
    KNOWN_LEAF_NAMES,
    TASK_TYPE_BRIDGE_LEAF_NAMES,
    ENABLE_TASK_TYPE_BRIDGE
  );
  return cfg;
})();

/**
 * Build allowlist for testing and at module load. Bridge leaves only when bridgeEnabled.
 * Exported for debt tripwire: tests assert task_type_* not in allowlist when bridge disabled.
 */
export function buildLeafAllowlist(
  known: Set<string>,
  bridgeLeaves: Set<string>,
  bridgeEnabled: boolean
): Set<string> {
  const base = [...known];
  const leaves = bridgeEnabled ? [...base, ...bridgeLeaves] : base;
  return new Set(leaves.map((l) => `minecraft.${l}`));
}
const stepRateLimiter = new StepRateLimiter(executorConfig.maxStepsPerMinute);
const geofenceConfig = parseGeofenceConfig();

const executorEventThrottle = new Map<string, number>();

// ── Executor startup state (observable via /executor/health) ──
type ExecutorStartState = 'disabled' | 'waiting_for_ready' | 'waiting_for_deps' | 'running';
let executorStartState: ExecutorStartState = 'disabled';
let executorLastProbeResult: { systemReady: boolean; depsReady: boolean; envEnabled: boolean; at: string } | null = null;
const BUILDING_LEAVES = new Set([
  'prepare_site',
  'build_module',
  'place_feature',
  'building_step',
  'verify_module',  // M5: checkpoint verification boundary
]);

function shouldEmitExecutorEvent(key: string, throttleMs = 2000): boolean {
  const now = Date.now();
  const last = executorEventThrottle.get(key) ?? 0;
  if (now - last < throttleMs) return false;
  executorEventThrottle.set(key, now);
  return true;
}

function emitExecutorBudgetEvent(
  taskId: string,
  stepId: string,
  leafName: string,
  reason: string,
  extra: Record<string, any> = {}
): void {
  if (!shouldEmitExecutorEvent(`budget:${taskId}:${reason}`, 3000)) return;
  try {
    taskIntegration.outbox.enqueue(DASHBOARD_STREAM_URL, {
      type: 'executor_budget',
      timestamp: Date.now(),
      data: {
        taskId,
        stepId,
        leafName,
        reason,
        ...extra,
      },
    });
  } catch {
    // best-effort; no hard failure
  }
}

// Initialize tool executor that connects to Minecraft interface
// If MCP_ONLY env var is set ("true"), skip direct /action fallback in favor of MCP tools
const MCP_ONLY = String(process.env.MCP_ONLY || '').toLowerCase() === 'true';

const toolExecutor = {
  async execute(tool: string, args: Record<string, any>, signal?: AbortSignal) {
    // Normalize tool name: add minecraft. prefix if not present
    const normalizedTool = tool.startsWith('minecraft.')
      ? tool
      : `minecraft.${tool}`;

    const startTime = Date.now();
    try {
      // Map BT actions to Minecraft actions (strict: unmapped tools return null for fail-closed executor)
      const mappedAction = mapBTActionToMinecraft(normalizedTool, args, {
        strict: true,
      });

      if (!mappedAction) {
        return {
          ok: false,
          data: null,
          environmentDeltas: {},
          error: 'No mapped action',
          confidence: 0,
          cost: 1,
          duration: Date.now() - startTime,
          metadata: { reason: 'no_mapped_action' },
        };
      }

      // Fail-closed: if action-mapping flagged invalid args, block dispatch
      // before reaching the MC interface. The _error marker is set when
      // required args (like item) are missing — retrying won't help.
      if (mappedAction.parameters?._error) {
        const errorMarker = mappedAction.parameters._error;
        console.warn(
          `[toolExecutor] Blocked dispatch: ${mappedAction.type} has _error marker: ${errorMarker}`
        );
        return {
          ok: false,
          data: null,
          environmentDeltas: {},
          error: `blocked_invalid_action_args: ${errorMarker}`,
          confidence: 0,
          cost: 0,
          duration: Date.now() - startTime,
          metadata: {
            reason: 'blocked_invalid_action_args',
            errorMarker,
            actionType: mappedAction.type,
          },
        };
      }

      // Prefer MCP path when available; fall back to direct action only if MCP_ONLY is false
      if (MCP_ONLY) {
        console.warn(
          '[toolExecutor] MCP_ONLY=true; toolExecutor will not use direct /action fallback. Set MCP_ONLY=false to enable direct execution.'
        );
        return {
          ok: false,
          data: null,
          environmentDeltas: {},
          error:
            'Direct action disabled (MCP_ONLY) — use MCP option execution or set MCP_ONLY=false',
          confidence: 0,
          cost: 1,
          duration: Date.now() - startTime,
          metadata: {
            reason: 'mcp_only_disabled',
            hint: 'Set environment variable MCP_ONLY=false to enable direct execution',
          },
        };
      }

      // Use the bot connection check for Minecraft actions
      // Pass taskId if available in mappedAction parameters for proper context
      const params = mappedAction.parameters as Record<string, any> | undefined;
      const taskId = params?.__nav?.scope as string | undefined;

      // P0-B: Post-mapping log — shows normalized action before dispatch
      const mappedArgsPreview = JSON.stringify(mappedAction.parameters ?? {}).slice(0, 200);
      console.log(`[toolExecutor] → ${mappedAction.type}${taskId ? ` task=${taskId}` : ''} args=${mappedArgsPreview}`);

      const result = await executeActionWithBotCheck(
        mappedAction,
        taskId,
        signal
      );
      const duration = Date.now() - startTime;

      // P0-B: Result log — shows status, duration, and diagnostics reason on failure
      if (!result.ok) {
        const diag = (result as any).toolDiagnostics;
        const diagReason = diag?.reason_code;
        let diagDetail = '';
        if (diag) {
          const parts: string[] = [];
          if (diag.requires_workstation != null) parts.push(`workstation=${diag.requires_workstation}`);
          if (diag.crafting_table_nearby != null) parts.push(`table_nearby=${diag.crafting_table_nearby}`);
          if (Array.isArray(diag.missing_inputs) && diag.missing_inputs.length > 0) {
            const missing = diag.missing_inputs.map(
              (m: any) => `${m.item}(${m.have}/${m.need})`
            ).join(',');
            parts.push(`missing=[${missing}]`);
          }
          if (parts.length > 0) diagDetail = ` ${parts.join(' ')}`;
        }
        console.warn(
          `[toolExecutor] ← ${mappedAction.type} FAIL (${duration}ms)` +
          ` error=${result.error}` +
          ((result as { failureCode?: string }).failureCode ? ` code=${(result as { failureCode?: string }).failureCode}` : '') +
          (diagReason ? ` reason=${diagReason}` : '') +
          diagDetail +
          ` outcome=${(result as any).outcome}`
        );
      }

      // Enhance result with metrics
      const enhancedResult = {
        ...result,
        confidence: result.ok ? 0.8 : 0.2, // Basic confidence based on success
        cost: 1, // Base cost for all actions
        duration,
        metadata: {
          originalTool: tool,
          normalizedTool,
          args,
          mappedAction: mappedAction.type,
        },
      };

      // Log tool execution for audit trail
      import('@conscious-bot/cognition')
        .then(({ auditLogger }) => {
          auditLogger.log(
            'tool_executed',
            {
              originalTool: tool,
              normalizedTool,
              mappedAction: mappedAction.type,
              args,
              resultOk: result.ok,
              resultData: result.data,
              resultError: result.error,
              duration,
            },
            {
              success: result.ok,
              duration,
            }
          );
        })
        .catch(() => {
          // Silently fail if audit logger not available
        });

      return enhancedResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Tool execution failed for ${tool}:`, error);
      return {
        ok: false,
        data: null,
        environmentDeltas: {},
        error: error instanceof Error ? error.message : 'Unknown error',
        confidence: 0,
        cost: 1,
        duration,
        metadata: {
          reason: 'execution_error',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  },
};

/**
 * Extract the target item name from a task description
 */
// action mapping functions are imported from modules/action-mapping

/**
 * Map task types to real Minecraft actions
 */
// action mapping imported

/**
 * Map Behavior Tree actions to Minecraft actions
 */
// action mapping imported

/**
 * Execute action with bot connection check.
 *
 * Delegates to the ExecutionGateway, which applies bot-check, mode gating,
 * mcPostJson transport, normalizeActionResponse, and audit emission.
 *
 * When taskId is provided (recommended), uses executeTaskViaGateway which
 * enforces proper context alignment at compile time.
 *
 * @param action - The Minecraft action to execute
 * @param taskId - The task ID for audit correlation and lease scoping (recommended)
 * @param signal - Optional abort signal
 */
async function executeActionWithBotCheck(
  action: any,
  taskId?: string,
  signal?: AbortSignal
) {
  if (!action) {
    return {
      ok: false,
      outcome: 'error' as const,
      error: 'No action provided',
      data: null,
      shadowBlocked: false,
      environmentDeltas: {},
    };
  }

  // Use typed wrapper when taskId is available (preferred path)
  // Falls back to deriving from __nav.scope for backward compatibility
  const effectiveTaskId = taskId ?? action.parameters?.__nav?.scope;

  const result = effectiveTaskId
    ? await executeTaskViaGateway(
        effectiveTaskId,
        {
          type: action.type,
          parameters: action.parameters,
          timeout: action.timeout,
        },
        signal
      )
    : await executeViaGateway(
        {
          origin: 'executor',
          priority: 'normal',
          action: {
            type: action.type,
            parameters: action.parameters,
            timeout: action.timeout,
          },
        },
        signal
      );

  return {
    ...result,
    environmentDeltas: {},
  };
}

/**
 * Inventory utilities
 */
async function fetchInventorySnapshot(): Promise<InventoryItem[]> {
  try {
    // Prefer cached inventory from world-state manager
    const cached = worldStateManager.getInventory();
    if (cached && cached.length) return cached as InventoryItem[];
    const res = await mcFetch('/inventory', { method: 'GET', timeoutMs: 3000 });
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    return Array.isArray(json?.data) ? (json.data as InventoryItem[]) : [];
  } catch {
    return [];
  }
}
// helpers imported from modules/inventory-helpers

// ---------- Dynamic acquisition planner ----------
async function introspectRecipe(output: string): Promise<{
  requiresTable: boolean;
  inputs: Array<{ item: string; count: number }>;
} | null> {
  try {
    const res = await serverConfig
      .getMCPIntegration()
      ?.executeTool('minecraft.introspect_recipe', { output });
    if (res?.success) {
      const payload = res.data as any;
      return {
        requiresTable: Boolean(payload?.requiresTable),
        inputs: Array.isArray(payload?.inputs) ? payload.inputs : [],
      };
    }
  } catch (e) {
    console.error('[Introspect Recipe] Failed to introspect recipe:', e);
  }
  return null;
}

function getCount(inv: InventoryItem[], name: string): number {
  return countItems(inv, [name]);
}

function baseGatherMapping(
  item: string
): { type: 'gathering' | 'mining'; blockType: string } | null {
  const n = item.toLowerCase();
  if (n.includes('log')) return { type: 'gathering', blockType: '_log' };
  if (n.includes('stone') || n.includes('cobblestone'))
    return { type: 'mining', blockType: 'stone' };
  if (n.includes('iron_ore') || (n.includes('iron') && n.includes('ore')))
    return { type: 'mining', blockType: 'iron_ore' };
  return null;
}

async function planNextAcquisitionStep(
  goalItem: string,
  qty: number
): Promise<{
  requirement: BuildTaskInput;
  tags?: string[];
  typeOverride?: string;
  extraParams?: Record<string, any>;
  title?: string;
} | null> {
  const inv = await fetchInventorySnapshot();
  const have = getCount(inv, goalItem);
  if (have >= qty) return null;

  // Try crafting introspection for the goal
  const info = await introspectRecipe(goalItem);
  if (info && info.inputs.length > 0) {
    // Pick the most missing input
    let best = { item: '', missing: -1, need: 0 } as any;
    for (const input of info.inputs) {
      const need = Math.max(0, input.count * qty - getCount(inv, input.item));
      if (need > best.missing) best = { item: input.item, missing: need, need };
    }
    if (best.missing > 0) {
      // Is the input itself craftable? If so, create a crafting subgoal; else gather/mine
      const subInfo = await introspectRecipe(best.item);
      if (subInfo && subInfo.inputs.length > 0) {
        return {
          requirement: {
            kind: 'craft',
            outputPattern: best.item,
            quantity: Math.max(1, best.need),
          },
          tags: ['dynamic', 'crafting'],
        };
      }
      const mapping = baseGatherMapping(best.item);
      if (mapping) {
        const kind = mapping.type === 'gathering' ? 'collect' : 'mine';
        return {
          requirement: {
            kind,
            outputPattern: mapping.blockType,
            quantity: best.need,
          },
          tags: ['dynamic', 'gather'],
        };
      }
      // Fallback to crafting even if introspection failed
      return {
        requirement: {
          kind: 'craft',
          outputPattern: best.item,
          quantity: Math.max(1, best.need),
        },
        tags: ['dynamic', 'crafting'],
      };
    }
    // If inputs are sufficient but table required, ensure crafting table exists
    if (info.requiresTable) {
      if (!hasCraftingTableItem(inv)) {
        return {
          requirement: {
            kind: 'craft',
            outputPattern: 'crafting_table',
            quantity: 1,
          },
          tags: ['dynamic', 'crafting-table'],
        };
      } else {
        return {
          requirement: {
            kind: 'build',
            outputPattern: 'crafting_table',
            quantity: 1,
          },
          tags: ['dynamic', 'placement'],
          typeOverride: 'placement',
          title: 'Place Crafting Table',
        };
      }
    }
    return null;
  }

  // Not craftable: try base gathering
  const mapping = baseGatherMapping(goalItem);
  if (mapping) {
    const kind = mapping.type === 'gathering' ? 'collect' : 'mine';
    return {
      requirement: {
        kind,
        outputPattern: mapping.blockType,
        quantity: qty - have,
      },
      tags: ['dynamic', 'gather'],
    };
  }

  return null;
}

async function injectNextAcquisitionStep(
  parentTask: any,
  goalItem: string,
  qty: number
): Promise<boolean> {
  const planned = await planNextAcquisitionStep(goalItem, qty);
  if (!planned) return false;

  // Subtask dedupe via subtaskKey
  const key = computeSubtaskKey(planned.requirement, parentTask.id);
  const activeTasks = taskIntegration.getActiveTasks();
  const existing = activeTasks.find(
    (t: any) =>
      (t.metadata as any)?.subtaskKey === key &&
      t.status !== 'completed' &&
      t.status !== 'failed'
  );
  if (existing) {
    return false;
  }

  const taskData = buildTaskFromRequirement(planned.requirement, {
    parentTask,
    tags: planned.tags,
    type: planned.typeOverride,
    title: planned.title,
  });
  const t = await taskIntegration.addTask(taskData);

  // Block parent while prereq is active
  if (t && parentTask.id) {
    taskIntegration.updateTaskMetadata(parentTask.id, {
      blockedReason: 'waiting_on_prereq',
    });
  }
  return Boolean(t);
}

/** Cap-aware prereq injection for craft steps.
 *  Centralizes the prereqInjectionCount check so all call sites get the cap.
 *  @param opts - Optional step-level args. When provided, these take priority
 *    over task-level title/parameter inference. This is critical for sterling_ir
 *    tasks where the task title may not contain the concrete recipe string. */
async function injectDynamicPrereqForCraft(
  task: any,
  opts?: { recipe?: string; qty?: number; toolDiagnostics?: any }
): Promise<boolean> {
  // Enforce cap at this layer — all call sites go through here
  const prereqAttempts = (task.metadata as any)?.prereqInjectionCount || 0;
  if (prereqAttempts >= 3) {
    return false;
  }

  // --- Workstation proximity fix (doom-loop breaker) ---
  // When craft fails because bot isn't near a required workstation,
  // inject navigate-to or place-workstation prereq instead of mining materials.
  const diag = opts?.toolDiagnostics;
  console.log(`[PrereqInjection] craft prereq check: recipe=${opts?.recipe} requires_workstation=${diag?.requires_workstation} table_nearby=${diag?.crafting_table_nearby} has_inventory_table=${diag?.has_workstation_in_inventory} prereqAttempts=${prereqAttempts}`);
  if (diag?.requires_workstation === true && diag?.crafting_table_nearby === false) {
    const injected = await injectWorkstationPrereq(task, diag, prereqAttempts);
    if (injected) return true;
    // Fall through to normal acquisition if workstation injection fails
  }

  // Priority: explicit step args > task parameters > title inference > hardcoded fallback
  const title = (task.title || '').toLowerCase();
  const recipe =
    opts?.recipe ||
    task.parameters?.recipe ||
    inferRecipeFromTitle(task.title) ||
    (title.includes('pickaxe') ? 'wooden_pickaxe' : null);
  if (!recipe) return false;
  const qty = opts?.qty || task.parameters?.qty || 1;
  const injected = await injectNextAcquisitionStep(
    task,
    recipe,
    qty
  );
  if (injected) {
    // Increment cap counter on successful injection
    taskIntegration.updateTaskMetadata(task.id, {
      prereqInjectionCount: prereqAttempts + 1,
    });
  }
  return injected;
}

/** Inject a navigate-to or place-workstation prereq when craft fails due to missing nearby table. */
async function injectWorkstationPrereq(
  task: any,
  diag: Record<string, unknown>,
  prereqAttempts: number,
): Promise<boolean> {
  const workstationType = 'crafting_table';
  const WALK_THRESHOLD = 64;

  // 1. Check registry for a known workstation within walking distance
  const snapshot = worldStateManager.getSnapshot();
  const botPos = snapshot.agentPosition;
  if (botPos) {
    const known = workstationRegistry.findNearest(workstationType, botPos, WALK_THRESHOLD);
    if (known) {
      const dist = Math.sqrt(
        (botPos.x - known.position.x) ** 2 +
        (botPos.y - known.position.y) ** 2 +
        (botPos.z - known.position.z) ** 2,
      );
      const requirement = { kind: 'navigate', outputPattern: workstationType, quantity: 1 };
      const key = computeSubtaskKey(requirement, task.id);
      // Dedupe: skip if an identical navigate task already exists
      const existing = taskIntegration.getActiveTasks().find(
        (t: any) =>
          (t.metadata as any)?.subtaskKey === key &&
          t.status !== 'completed' &&
          t.status !== 'failed',
      );
      if (!existing) {
        const taskData = buildTaskFromRequirement(requirement, {
          parentTask: task,
          tags: ['dynamic', 'workstation-navigation'],
          type: 'navigation',
          title: `Navigate to ${workstationType}`,
          extraParameters: {
            targetPosition: { ...known.position },
            registrySource: true,
          },
        });
        const t = await taskIntegration.addTask(taskData);
        if (t && task.id) {
          taskIntegration.updateTaskMetadata(task.id, {
            blockedReason: 'waiting_on_prereq',
            prereqInjectionCount: prereqAttempts + 1,
          });
          return true;
        }
      }
    }
  }

  // 2. No known workstation nearby — place one if bot has it in inventory
  if (diag.has_workstation_in_inventory === true) {
    const requirement = { kind: 'build', outputPattern: workstationType, quantity: 1 };
    const key = computeSubtaskKey(requirement, task.id);
    const existing = taskIntegration.getActiveTasks().find(
      (t: any) =>
        (t.metadata as any)?.subtaskKey === key &&
        t.status !== 'completed' &&
        t.status !== 'failed',
    );
    if (!existing) {
      const taskData = buildTaskFromRequirement(requirement, {
        parentTask: task,
        tags: ['dynamic', 'workstation-placement'],
        type: 'placement',
        title: `Place ${workstationType}`,
      });
      const t = await taskIntegration.addTask(taskData);
      if (t && task.id) {
        taskIntegration.updateTaskMetadata(task.id, {
          blockedReason: 'waiting_on_prereq',
          prereqInjectionCount: prereqAttempts + 1,
        });
        return true;
      }
    }
  }

  // 3. Neither navigation nor placement possible — fall through
  return false;
}

async function injectDynamicPrereqForMine(task: any): Promise<boolean> {
  // For iron mining, ensure stone pickaxe using dynamic planner
  const title = (task.title || '').toLowerCase();
  if (title.includes('iron')) {
    return await injectNextAcquisitionStep(task, 'stone_pickaxe', 1);
  }
  return false;
}

async function injectPrerequisiteTasksForCraftPickaxe(
  task: any
): Promise<boolean> {
  return await injectNextAcquisitionStep(task, 'wooden_pickaxe', 1);
}

async function injectPrerequisiteTasksForMineIron(task: any): Promise<boolean> {
  return await injectNextAcquisitionStep(task, 'stone_pickaxe', 1);
}

/**
 * Requirement resolution and progress computation
 * (types and helpers imported from modules/requirements)
 */

// requirement helpers imported from modules/requirements

/**
 * M5: Advance build checkpoint after verify_module success.
 *
 * Creates a BuildCheckpoint, appends to task.metadata.build.checkpoints,
 * adds the module to completedModules, and increments moduleCursor.
 *
 * This is the real checkpoint boundary — only called when verify_module
 * confirms the world matches the module witness.
 */
async function advanceBuildCheckpoint(task: any, verifyStep: any): Promise<void> {
  const { createBuildCheckpoint, advanceBuildMetadata } = await import('./sterling/build-checkpoint');
  const buildMeta = task.metadata?.build;
  if (!buildMeta) {
    console.warn('[Building:M5] No BuildMetadata on task — skipping checkpoint');
    return;
  }

  const moduleId = verifyStep.meta?.moduleId || verifyStep.meta?.args?.moduleId;
  if (!moduleId) {
    console.warn('[Building:M5] verify_module step has no moduleId — skipping checkpoint');
    return;
  }

  // Get inventory summary for checkpoint
  const inv = await fetchInventorySnapshot();
  const inventorySummary: Record<string, number> = {};
  for (const item of inv) {
    if (item?.name) inventorySummary[item.name] = (inventorySummary[item.name] ?? 0) + (item.count ?? 0);
  }

  const checkpoint = createBuildCheckpoint(
    buildMeta.templateDigest,
    buildMeta.moduleCursor + 1,
    [...buildMeta.completedModules, moduleId],
    buildMeta.stationRegistry ?? [],
    [{ invariant: 'module_verified', passed: true, evidence: `verify_module ${moduleId} passed` }],
    inventorySummary,
  );

  const witness = buildMeta.witnesses?.[moduleId];
  const advanced = advanceBuildMetadata(buildMeta, moduleId, checkpoint, witness);

  // Persist advanced state
  task.metadata.build = advanced;
  taskIntegration.updateTaskMetadata(task.id, { build: advanced });

  console.log(
    `[Building:M5] Checkpoint committed: module=${moduleId} ` +
    `checkpointId=${checkpoint.checkpointId.slice(0, 8)} ` +
    `moduleCursor=${advanced.moduleCursor} ` +
    `completedModules=[${advanced.completedModules.join(',')}]`
  );
}

/**
 * DRY progress recompute and gated completion helper
 */
async function recomputeProgressAndMaybeComplete(task: any) {
  try {
    const requirement = resolveRequirement(task);
    if (!requirement) return;
    const inv = await fetchInventorySnapshot();
    const p = computeProgressFromInventory(inv, requirement);
    const clamped = Math.max(0, Math.min(1, p));
    const snapshot = computeRequirementSnapshot(inv, requirement);
    taskIntegration.updateTaskMetadata(task.id, {
      requirement: snapshot,
    });
    if (task.status === 'pending') {
      await taskIntegration.updateTaskStatus(task.id, 'active');
    }
    taskIntegration.updateTaskProgress(task.id, clamped);
    // Crafting may finish all materials but not produce output; gate finalization.
    let canComplete = clamped >= 1;
    if (canComplete && (requirement as any)?.kind === 'craft') {
      const hasOutput = inv.some((it) =>
        itemMatches(it, [(requirement as any).outputPattern])
      );
      if (!hasOutput) canComplete = false;
    }
    if (!task.steps || !Array.isArray(task.steps)) {
      if (canComplete) {
        taskIntegration.updateTaskProgress(task.id, 1, 'completed');
      }
      return;
    }
    const currentStep = task.steps.find((s: any) => !s.done);
    if (currentStep)
      await taskIntegration.completeTaskStep(task.id, currentStep.id);

    // M5: Checkpoint advancement on verify_module success.
    // When a verify_module step completes, it means the world state
    // matches the module witness. This is the real checkpoint boundary.
    if (currentStep?.meta?.leaf === 'verify_module' && currentStep?.meta?.isCheckpoint) {
      try {
        await advanceBuildCheckpoint(task, currentStep);
      } catch (cpErr) {
        console.error('[Building:M5] Checkpoint advancement failed:', cpErr);
      }
    }

    const allStepsComplete = task.steps.every((s: any) => s.done);
    if (canComplete && allStepsComplete) {
      taskIntegration.updateTaskProgress(task.id, 1, 'completed');

      // Log action completion for audit trail
      import('@conscious-bot/cognition')
        .then(({ auditLogger }) => {
          auditLogger.log(
            'action_completed',
            {
              taskId: task.id,
              taskTitle: task.title,
              taskType: task.type,
              finalProgress: 1,
              finalStatus: 'completed',
              requirement: requirement,
              progressBefore: task.progress,
            },
            {
              success: true,
              duration: Date.now() - (task.createdAt || Date.now()),
            }
          );
        })
        .catch(() => {
          // Silently fail if audit logger not available
        });
    }
  } catch (e) {
    console.warn('Progress recompute failed:', e);
  }
}

/** Normalize step authority: canonicalize meta.source → meta.authority for known sources. */
function normalizeStepAuthority(step: any): void {
  if (!step.meta) return;
  if (!step.meta.authority && step.meta.source) {
    // One-time migration: promote source to authority for known authorized sources
    if (
      step.meta.source === 'sterling' ||
      step.meta.source === 'fallback-macro'
    ) {
      step.meta.authority = step.meta.source;
    }
  }
}

function getStepBudgetState(task: any, stepId: string) {
  const meta = task.metadata || {};
  const budgets = meta.executionBudget || {};
  const existing = budgets[stepId] || null;
  if (existing) return { meta, budgets, state: existing, created: false };
  const state = { attempts: 0, firstAt: Date.now(), lastAt: 0 };
  budgets[stepId] = state;
  return { meta, budgets, state, created: true };
}

function persistStepBudget(task: any, budgets: Record<string, any>) {
  // Only send the executionBudget key — never spread task.metadata into the
  // patch or immutable fields like `origin` and `goalBinding` will trigger
  // the protective guards in updateTaskMetadata.
  taskIntegration.updateTaskMetadata(task.id, { executionBudget: budgets });
}

function buildSterlingStepExecutorContext() {
  return {
    config: {
      buildExecBudgetDisabled: BUILD_EXEC_BUDGET_DISABLED,
      buildExecMaxAttempts: BUILD_EXEC_MAX_ATTEMPTS,
      buildExecMinIntervalMs: BUILD_EXEC_MIN_INTERVAL_MS,
      buildExecMaxElapsedMs: BUILD_EXEC_MAX_ELAPSED_MS,
      buildingLeaves: BUILDING_LEAVES,
      taskTypeBridgeLeafNames: TASK_TYPE_BRIDGE_LEAF_NAMES,
      enableTaskTypeBridge: ENABLE_TASK_TYPE_BRIDGE,
      legacyLeafRewriteEnabled: getPlanningRuntimeConfig().legacyLeafRewriteEnabled,
    },
    leafAllowlist: executorConfig.leafAllowlist,
    mode: executorConfig.mode,
    updateTaskMetadata: (taskId: string, patch: Record<string, unknown>) =>
      taskIntegration.updateTaskMetadata(taskId, patch),
    startTaskStep: (
      taskId: string,
      stepId: string,
      opts?: { dryRun?: boolean }
    ) => taskIntegration.startTaskStep(taskId, stepId, opts),
    completeTaskStep: (
      taskId: string,
      stepId: string,
      opts?: Record<string, unknown>
    ) => taskIntegration.completeTaskStep(taskId, stepId, opts),
    emit: (event: string, payload: unknown) =>
      taskIntegration.emit(event, payload),
    executeTool: (
      toolName: string,
      args: Record<string, unknown>,
      signal?: AbortSignal
    ) => toolExecutor.execute(toolName, args, signal),
    canExecuteStep: () => stepRateLimiter.canExecute(),
    recordStepExecuted: () => stepRateLimiter.record(),
    getAbortSignal: () => getExecutorAbortSignal(),
    getGoldenRunRecorder: () => getGoldenRunRecorder(),
    toDispatchResult: (r: Record<string, unknown> | null | undefined) =>
      toDispatchResult(r),
    introspectRecipe: (recipe: string) => introspectRecipe(recipe),
    fetchInventorySnapshot: () => fetchInventorySnapshot(),
    getCount: (inv: Array<{ type?: string }>, item: string) =>
      getCount(inv, item),
    injectDynamicPrereqForCraft: (task: unknown, opts?: { recipe?: string; qty?: number; toolDiagnostics?: any }) =>
      injectDynamicPrereqForCraft(task, opts),
    getThreatSnapshot: async () => {
      const { fetchThreatSignal } = await import('./goals/threat-hold-bridge');
      const signal = await fetchThreatSignal();
      return { overallThreatLevel: signal.overallThreatLevel, threats: signal.threats };
    },
    emitExecutorBudgetEvent: (
      taskId: string,
      stepId: string,
      leafName: string,
      reason: string,
      extra?: Record<string, unknown>
    ) => emitExecutorBudgetEvent(taskId, stepId, leafName, reason, extra),
    getStepBudgetState: (task: unknown, stepId: string) =>
      getStepBudgetState(task, stepId),
    persistStepBudget: (task: unknown, budgets: Record<string, unknown>) =>
      persistStepBudget(task, budgets),
    updateTaskProgress: (taskId: string, progress: number, status: string) =>
      taskIntegration.updateTaskProgress(taskId, progress, status),
    recomputeProgressAndMaybeComplete: (task: unknown) =>
      recomputeProgressAndMaybeComplete(task),
    regenerateSteps: (
      taskId: string,
      failureContext: Record<string, unknown>
    ) => taskIntegration.regenerateSteps(taskId, failureContext),
  };
}

/**
 * Wait for bot connection by polling health until timeout
 */
// connection helpers imported from modules/mc-client

/**
 * Check if crafting table is required and available for a task
 */
async function checkCraftingTablePrerequisite(task: any): Promise<boolean> {
  try {
    // Check if this task requires a crafting table
    const requiresCraftingTable =
      task.title?.toLowerCase().includes('pickaxe') ||
      task.title?.toLowerCase().includes('axe') ||
      task.title?.toLowerCase().includes('sword') ||
      task.title?.toLowerCase().includes('shovel') ||
      task.title?.toLowerCase().includes('hoe') ||
      task.type === 'crafting';

    if (!requiresCraftingTable) {
      return true; // No crafting table needed
    }

    // Get inventory and perform comprehensive analysis
    const inventory = await fetchInventorySnapshot();

    // Step 1: Check if we have a crafting table in inventory
    const hasCraftingTable = inventory.some((item: any) =>
      item.type?.toLowerCase().includes('crafting_table')
    );

    if (hasCraftingTable) {
      return true;
    }

    // Step 2: Analyze resources and options
    const resourceAnalysis = await analyzeCraftingResources(inventory);

    // Step 3: Check for nearby crafting tables
    const nearbyTables = await scanForNearbyCraftingTables();

    // Step 4: Make intelligent decision
    const decision = await decideCraftingTableStrategy(
      resourceAnalysis,
      nearbyTables,
      task
    );

    if (decision.action === 'use_existing') {
      return true;
    } else if (decision.action === 'craft_new') {
      await addCraftingTableTask(task, decision.details);
      return false; // Wait for crafting table task
    } else if (decision.action === 'gather_resources') {
      await addResourceGatheringTask(task, decision.details);
      return false; // Wait for resource gathering
    }

    // Fallback case
    return false;
  } catch (error) {
    console.error('Error checking crafting table prerequisite:', error);
    return false;
  }
}

/**
 * Analyze available crafting resources
 */
async function analyzeCraftingResources(inventory: any[]): Promise<{
  canCraft: boolean;
  hasWood: boolean;
  woodCount: number;
  needsGathering: boolean;
  efficiency: number;
}> {
  try {
    // Check for wood/planks in inventory
    const woodItems = inventory.filter(
      (item: any) =>
        item.type?.toLowerCase().includes('log') ||
        item.type?.toLowerCase().includes('wood') ||
        item.type?.toLowerCase().includes('plank')
    );

    const woodCount = woodItems.reduce(
      (total, item) => total + (item.count || 1),
      0
    );

    // Check if we can convert logs to planks
    const logItems = inventory.filter((item: any) =>
      item.type?.toLowerCase().includes('log')
    );
    const logCount = logItems.reduce(
      (total, item) => total + (item.count || 1),
      0
    );
    const totalWoodPotential = woodCount + logCount * 4; // Each log = 4 planks

    const canCraft = totalWoodPotential >= 4;
    const hasWood = woodCount > 0 || logCount > 0;
    const needsGathering = !canCraft;
    const efficiency = Math.min(1.0, totalWoodPotential / 16); // Efficiency score

    return {
      canCraft,
      hasWood,
      woodCount: totalWoodPotential,
      needsGathering,
      efficiency,
    };
  } catch (error) {
    console.error('Error analyzing crafting resources:', error);
    return {
      canCraft: false,
      hasWood: false,
      woodCount: 0,
      needsGathering: true,
      efficiency: 0,
    };
  }
}

/**
 * Scan for nearby crafting tables
 */
async function scanForNearbyCraftingTables(): Promise<
  Array<{
    position: any;
    distance: number;
  }>
> {
  try {
    // Get current bot position from world state
    const worldStateResponse = await serviceClients.minecraft.get('/state', {
      timeout: 3000,
    });

    if (!worldStateResponse.ok) return [];

    const worldData = (await worldStateResponse.json()) as any;
    const botPosition = worldData.data?.position;

    if (!botPosition) return [];

    // Query nearby blocks to find crafting tables
    const nearbyBlocksResponse = await serviceClients.minecraft.get(
      '/nearby-blocks',
      {
        timeout: 3000,
      }
    );

    if (!nearbyBlocksResponse.ok) return [];

    const nearbyBlocks = (await nearbyBlocksResponse.json()) as any;
    const craftingTables: Array<{ position: any; distance: number }> = [];

    if (nearbyBlocks.data && Array.isArray(nearbyBlocks.data)) {
      nearbyBlocks.data.forEach((block: any) => {
        if (block.type?.toLowerCase().includes('crafting_table')) {
          const distance = Math.sqrt(
            Math.pow(block.position.x - botPosition.x, 2) +
              Math.pow(block.position.y - botPosition.y, 2) +
              Math.pow(block.position.z - botPosition.z, 2)
          );

          if (distance <= 20) {
            craftingTables.push({
              position: block.position,
              distance: Math.round(distance * 100) / 100,
            });
          }
        }
      });
    }

    return craftingTables.sort((a, b) => a.distance - b.distance);
  } catch (error) {
    console.error('Error scanning for nearby crafting tables:', error);
    return [];
  }
}

/**
 * Decide crafting table strategy based on analysis
 */
async function decideCraftingTableStrategy(
  resourceAnalysis: any,
  nearbyTables: any[],
  task: any
): Promise<{
  action: 'use_existing' | 'craft_new' | 'gather_resources';
  reasoning: string;
  details: any;
}> {
  try {
    // If we have nearby tables and limited resources, prefer using existing
    if (nearbyTables.length > 0) {
      const nearestTable = nearbyTables[0];

      // Calculate decision factors
      const distanceFactor = Math.max(0, 1 - nearestTable.distance / 15);
      const resourceFactor = resourceAnalysis.efficiency;
      const travelTime = nearestTable.distance * 1.5; // seconds
      const craftingTime = resourceAnalysis.canCraft ? 8 : 45;

      // Score existing table option
      const existingScore =
        distanceFactor * 0.6 + (travelTime < craftingTime ? 0.4 : 0);

      if (existingScore > 0.5 || !resourceAnalysis.canCraft) {
        return {
          action: 'use_existing',
          reasoning: `Table ${nearestTable.distance}b away (score: ${existingScore.toFixed(2)})`,
          details: {
            distance: nearestTable.distance,
            position: nearestTable.position,
          },
        };
      }
    }

    // If we can craft and it's more efficient, craft new table
    if (resourceAnalysis.canCraft) {
      return {
        action: 'craft_new',
        reasoning: `Have ${resourceAnalysis.woodCount} wood units, efficient to craft new table`,
        details: { hasResources: true, woodCount: resourceAnalysis.woodCount },
      };
    }

    // Need to gather resources first
    if (resourceAnalysis.needsGathering) {
      return {
        action: 'gather_resources',
        reasoning: `Need ${4 - resourceAnalysis.woodCount} more wood units for crafting table`,
        details: {
          neededWood: Math.max(0, 4 - resourceAnalysis.woodCount),
          currentWood: resourceAnalysis.woodCount,
        },
      };
    }

    // Fallback
    return {
      action: 'craft_new',
      reasoning: 'Default action when other options unavailable',
      details: {},
    };
  } catch (error) {
    console.error('Error deciding crafting table strategy:', error);
    return {
      action: 'gather_resources',
      reasoning: 'Error in analysis, defaulting to resource gathering',
      details: {},
    };
  }
}

/**
 * Add crafting table task with proper configuration
 */
async function addCraftingTableTask(
  originalTask: any,
  details: any
): Promise<void> {
  const input: BuildTaskInput = {
    kind: 'craft',
    outputPattern: 'crafting_table',
    quantity: 1,
  };

  // Dedupe
  const key = computeSubtaskKey(input, originalTask.id);
  const activeTasks = taskIntegration.getActiveTasks();
  const existing = activeTasks.find(
    (t: any) =>
      (t.metadata as any)?.subtaskKey === key &&
      t.status !== 'completed' &&
      t.status !== 'failed'
  );
  if (existing) {
    return;
  }

  const taskData = buildTaskFromRequirement(input, {
    parentTask: originalTask,
    tags: ['crafting'],
    extraParameters: { analysis: details },
  });
  const result = await taskIntegration.addTask(taskData);
  logTaskIngestion({ _diag_version: 1, source: 'crafting_table_subtask', task_id: result?.id, parent_task_id: originalTask.id, decision: result?.id ? 'created' : 'rejected', task_type: taskData.type });
  if (result && result.id) {
    // Block parent
    taskIntegration.updateTaskMetadata(originalTask.id, {
      blockedReason: 'waiting_on_prereq',
    });
  }
}

/**
 * Add resource gathering task for crafting table materials
 */
async function addResourceGatheringTask(
  originalTask: any,
  details: any
): Promise<void> {
  const qty = details.neededWood || 4;
  const input: BuildTaskInput = {
    kind: 'collect',
    outputPattern: '_log',
    quantity: qty,
  };

  // Dedupe
  const key = computeSubtaskKey(input, originalTask.id);
  const activeTasks = taskIntegration.getActiveTasks();
  const existing = activeTasks.find(
    (t: any) =>
      (t.metadata as any)?.subtaskKey === key &&
      t.status !== 'completed' &&
      t.status !== 'failed'
  );
  if (existing) {
    return;
  }

  const taskData = buildTaskFromRequirement(input, {
    title: 'Gather Wood for Crafting Table',
    parentTask: originalTask,
    tags: ['gathering', 'wood'],
    extraParameters: {
      targetQuantity: qty,
      currentQuantity: details.currentWood || 0,
    },
  });
  const result = await taskIntegration.addTask(taskData);
  logTaskIngestion({ _diag_version: 1, source: 'resource_gathering_subtask', task_id: result?.id, parent_task_id: originalTask.id, decision: result?.id ? 'created' : 'rejected', task_type: taskData.type });
  if (result && result.id) {
    // Block parent
    taskIntegration.updateTaskMetadata(originalTask.id, {
      blockedReason: 'waiting_on_prereq',
    });
  }
}

/**
 * Generate complex crafting subtasks for advanced items
 */
async function generateComplexCraftingSubtasks(task: any): Promise<void> {
  try {
    const taskTitle = task.title?.toLowerCase() || '';

    // Check if this is a complex crafting task that needs subtasks
    if (
      taskTitle.includes('pickaxe') ||
      taskTitle.includes('axe') ||
      taskTitle.includes('sword')
    ) {
      // Check current inventory for required materials
      const inventory = await fetchInventorySnapshot();
      const subtaskDatas: Partial<any>[] = [];

      // Check if we need to place a crafting table
      const hasCraftingTable = inventory.some((item: any) =>
        item.type?.toLowerCase().includes('crafting_table')
      );

      if (hasCraftingTable) {
        subtaskDatas.push(
          buildTaskFromRequirement(
            { kind: 'build', outputPattern: 'crafting_table', quantity: 1 },
            {
              title: 'Place Crafting Table',
              type: 'placement',
              parentTask: task,
            }
          )
        );
      }

      // Check if we need to craft intermediate materials
      if (
        taskTitle.includes('wooden_pickaxe') ||
        taskTitle.includes('wooden_axe')
      ) {
        const hasPlanksInv = inventory.some((item: any) =>
          item.type?.toLowerCase().includes('planks')
        );
        const hasSticksInv = inventory.some((item: any) =>
          item.type?.toLowerCase().includes('stick')
        );

        if (!hasPlanksInv) {
          subtaskDatas.push(
            buildTaskFromRequirement(
              { kind: 'craft', outputPattern: '_planks', quantity: 4 },
              { title: 'Craft Wood Planks', parentTask: task }
            )
          );
        }

        if (!hasSticksInv) {
          subtaskDatas.push(
            buildTaskFromRequirement(
              { kind: 'craft', outputPattern: 'stick', quantity: 4 },
              { title: 'Craft Sticks', parentTask: task }
            )
          );
        }
      }

      // Add all subtasks (with dedupe)
      let addedCount = 0;
      const activeTasks = taskIntegration.getActiveTasks();
      for (const subtaskData of subtaskDatas) {
        const subtaskKey = (subtaskData.metadata as any)?.subtaskKey;
        if (subtaskKey) {
          const existing = activeTasks.find(
            (t: any) =>
              (t.metadata as any)?.subtaskKey === subtaskKey &&
              t.status !== 'completed' &&
              t.status !== 'failed'
          );
          if (existing) {
            continue;
          }
        }
        const result = await taskIntegration.addTask(subtaskData);
        logTaskIngestion({ _diag_version: 1, source: 'complex_crafting_subtask', task_id: result?.id, parent_task_id: task.id, decision: result?.id ? 'created' : 'rejected', task_type: subtaskData.type });
        if (result && result.id) {
          addedCount++;
        }
      }

      // Block parent if any subtasks were added
      if (addedCount > 0 && task.id) {
        taskIntegration.updateTaskMetadata(task.id, {
          blockedReason: 'waiting_on_prereq',
        });
      }

    }
  } catch (error) {
    console.error('Error generating complex crafting subtasks:', error);
  }
}

/**
 * Returns true when the error string indicates the bot is mid-navigation
 * and the action should be retried next cycle (not counted as a failure).
 */
function isNavigatingError(error: string | undefined | null): boolean {
  if (!error) return false;
  return /already navigating/i.test(error);
}

/**
 * Autonomous task executor - Real Action Based Progress
 * Only updates progress when actual bot actions are performed
 */
async function autonomousTaskExecutor() {
  try {
    // singleton guard
    if (!global.__planningExecutorState) {
      global.__planningExecutorState = {
        running: false,
        failures: 0,
        lastAttempt: 0,
        breaker: 'closed',
      };
    }
    if (global.__planningExecutorState.running) return;

    // Circuit breaker check: skip cycle if infra errors have tripped the breaker
    const cbNowMs = Date.now();
    if (isCircuitBreakerOpen(cbNowMs)) {
      const cbState = getCircuitBreakerState();
      console.warn(
        `[AUTONOMOUS EXECUTOR] Circuit breaker open (trips=${cbState.tripCount}), ` +
          `skipping cycle. Resume at ${new Date(cbState.resumeAt!).toISOString()}`
      );
      return;
    }

    global.__planningExecutorState.running = true;
    const startTs = Date.now();

    logOptimizer.log(
      'Running autonomous task executor...',
      'autonomous-executor-running'
    );

    // Get active tasks directly from the enhanced task integration
    let activeTasks = taskIntegration.getActiveTasks();

    // ── Threat→Hold bridge: evaluate before task selection (A1.11) ──
    try {
      // Include paused-unsafe tasks for release evaluation (A1.7)
      const pausedUnsafeTasks = taskIntegration
        .getTasks({ status: 'paused' })
        .filter((t: any) => t.metadata?.goalBinding?.hold?.reason === 'unsafe');

      // Dedup by id in case store double-reports across active/paused queries
      const byId = new Map<string, any>();
      for (const t of [...activeTasks, ...pausedUnsafeTasks]) byId.set(t.id, t);
      const tasksToEvaluate = [...byId.values()];

      await evaluateThreatHolds({
        fetchSignal: () => fetchThreatSignal(`${MC_ENDPOINT}/safety`),
        getTasksToEvaluate: () => tasksToEvaluate,
        updateTaskStatus: (id, status) =>
          taskIntegration.updateTaskStatus(id, status),
        updateTaskMetadata: (id, patch) =>
          taskIntegration.updateTaskMetadata(id, patch),
        emitLifecycleEvent: (event) =>
          taskIntegration.emit('taskLifecycleEvent', event),
        emitBridgeEvent: (event) =>
          taskIntegration.emit('threatBridgeEvent', event),
      });
    } catch (err) {
      // A1.16: Bridge failure must not break the executor cycle
      console.warn('[ThreatBridge] Evaluation failed:', err);
    }

    // A1.15: Re-fetch after bridge mutations to prevent same-cycle execution
    // of a task that was just held. Store may return immutable snapshots, so
    // the pre-bridge `activeTasks` array can be stale.
    activeTasks = taskIntegration.getActiveTasks();

    // Only log task count when it changes or every 5 minutes
    const now = Date.now();
    const lastTaskCountLog = global.lastTaskCountLog || 0;
    if (
      isVerbose() && (
        !global.lastTaskCount ||
        global.lastTaskCount !== activeTasks.length ||
        now - lastTaskCountLog > 300000
      )
    ) {
      console.log(
        `[AUTONOMOUS EXECUTOR] Found ${activeTasks.length} active tasks`
      );
      if (activeTasks.length > 0) {
        console.log(`[AUTONOMOUS EXECUTOR] Top task: ${activeTasks[0].title}`);
      }
      global.lastTaskCount = activeTasks.length;
      global.lastTaskCountLog = now;
    }

    // Auto-unblock shadow-blocked tasks when mode switches to live.
    // This makes shadow mode useful for observation: tasks resume when you go live.
    const currentMode = getExecutorMode();
    const nowMs = Date.now();
    for (const t of activeTasks) {
      if (shouldAutoUnblockTask(t, currentMode)) {
        taskIntegration.updateTaskMetadata(t.id, {
          blockedReason: undefined,
          blockedAt: undefined,
          // Keep shadowObservationCount for audit trail
        });
      }
    }

    // Auto-fail tasks that have been blocked for longer than the TTL.
    // Uses the TTL policy table (task-block-evaluator.ts) for per-reason exemptions.
    for (const t of activeTasks) {
      const blockState = evaluateTaskBlockState(
        t,
        nowMs,
        DEFAULT_BLOCKED_TTL_MS
      );
      if (blockState.shouldFail) {
        taskIntegration.updateTaskProgress(t.id, t.progress || 0, 'failed');
        taskIntegration.updateTaskMetadata(t.id, {
          failReason: blockState.failReason,
        });
        console.warn(
          `[AUTONOMOUS EXECUTOR] Auto-failed task ${t.id}: ${blockState.failReason}`
        );
      }
    }

    // ── Expansion retry for pending_planning sterling_ir tasks ──
    // Budget: at most 2 retries per tick to avoid hammering Sterling when it's down.
    // Runs AFTER TTL evaluation (stale tasks fail first) and BEFORE eligible-task
    // filtering (so newly-promoted tasks are immediately eligible).
    const EXPANSION_RETRY_BUDGET = 2;
    let expansionRetriesThisTick = 0;
    const pendingPlanningTasks = activeTasks.filter(
      (t) => t.status === 'pending_planning' && t.type === 'sterling_ir'
    );
    for (const ppt of pendingPlanningTasks) {
      if (expansionRetriesThisTick >= EXPANSION_RETRY_BUDGET) break;

      // Respect nextEligibleAt — single scheduling truth
      const nextEligible = (ppt.metadata as any)?.nextEligibleAt ?? 0;
      if (nowMs < nextEligible) continue;

      expansionRetriesThisTick++;
      try {
        await taskIntegration.retryExpansion(ppt.id);
      } catch (err) {
        console.warn(`[AUTONOMOUS EXECUTOR] Re-expansion error for task ${ppt.id}:`, err);
      }
    }

    // Filter out tasks that are blocked, in backoff, or in non-executable states.
    // Uses isTaskEligible() which has a status allowlist for safety.
    const eligibleTasks = activeTasks.filter((t) => isTaskEligible(t, nowMs));

    // IDLE-1: Eligibility-based idle detection
    // Determine idle reason based on task state, not just activeTasks.length === 0
    const circuitBreakerOpen = isCircuitBreakerOpen(nowMs);
    const idleReason = determineIdleReason(
      activeTasks,
      eligibleTasks,
      circuitBreakerOpen
    );

    // Gate all autonomous task creation (exploration, reflexes, and — once
    // Phase 2's IdleEngine lands — idle-episode emission) on a single flag.
    //
    // Historical note: this flag was previously named STERLING_IDLE_EPISODES_
    // ENABLED because it was introduced for the now-deleted keep-alive
    // idle-episode pathway. It has since been repurposed as a master
    // autonomous-task-creation gate (exploration driveshaft + reflex registry
    // evaluateTick) with a misleading name. Renamed here to AUTONOMOUS_TASK_
    // CREATION_ENABLED to reflect its actual purpose. The legacy
    // STERLING_IDLE_EPISODES_ENABLED name is still honored as a fallback so
    // existing deployments don't break silently — remove the fallback when
    // all operational environments have migrated.
    const autonomousTaskCreationEnabled =
      process.env.AUTONOMOUS_TASK_CREATION_ENABLED === 'true' ||
      process.env.STERLING_IDLE_EPISODES_ENABLED === 'true';

    if (global.explorationDriveshaft && autonomousTaskCreationEnabled) {
      global.explorationDriveshaft.tick(idleReason !== null);
    }
    if (global.reflexRegistry && autonomousTaskCreationEnabled) {
      try {
        const executorMode = process.env.EXECUTOR_MODE || 'shadow';
        const isDryRun = executorMode !== 'live';
        const tickResult = await global.reflexRegistry.evaluateTick(
          idleReason,
          (data: any) => taskIntegration.addTask(data),
          (filters: any) => {
            // Adapter: goalkey guard passes { status: ['pending', 'active'] }
            // but taskIntegration.getTasks expects a single status value.
            // Return all tasks from both statuses.
            if (filters?.status && Array.isArray(filters.status)) {
              const results: any[] = [];
              for (const s of filters.status) {
                results.push(...taskIntegration.getTasks({ status: s as any }));
              }
              return results;
            }
            return taskIntegration.getTasks(filters as any);
          },
          { dryRun: isDryRun },
        );
      } catch (error) {
        // Fail-closed: registry failure must never break the executor cycle
        console.warn('[Reflex] Registry evaluateTick failed:', error);
      }
    }

    if (idleReason !== null && autonomousTaskCreationEnabled) {
      // Only log once per minute to avoid spam
      if (isVerbose() && (!global.lastNoTasksLog || now - global.lastNoTasksLog > 60000)) {
        console.log(
          `[AUTONOMOUS EXECUTOR] Idle detected: ${idleReason} (active=${activeTasks.length}, eligible=${eligibleTasks.length})`
        );
        global.lastNoTasksLog = now;
      } else if (!global.lastNoTasksLog || now - global.lastNoTasksLog > 60000) {
        global.lastNoTasksLog = now;
      }
      logOptimizer.log(`Idle: ${idleReason}`, `idle-${idleReason}`);

      // Post idle event to cognition service for thought generation
      // Include idle_reason so cognition can respond appropriately (IDLE-1)
      if (!global.lastIdleEvent || now - global.lastIdleEvent > 300000) {
        const prevIdleAt = global.lastIdleEvent || 0;
        global.lastIdleEvent = now;
        taskIntegration.outbox.enqueue(
          'http://localhost:3003/api/cognitive-stream/events',
          {
            type: 'idle_period',
            timestamp: now,
            data: {
              idleReason, // IDLE-1: Include reason for eligibility-based detection
              durationMs: prevIdleAt ? now - prevIdleAt : 0,
              activeTaskCount: activeTasks.length,
              eligibleTaskCount: eligibleTasks.length,
            },
          }
        );
      }

      // IdleEngine call site — Phase 2 of the keep-alive cauterize-and-regrow.
      // See packages/planning/src/idle-engine/idle-engine.ts for the class.
      //
      // Eligibility: only fire on 'no_tasks' or 'blocked_on_prereq'. Other
      // idle reasons (backoff, circuit_breaker, manual_pause) are transient
      // executor states where the bot is already responding to work.
      const IDLE_ENGINE_ELIGIBLE_REASONS = new Set(['no_tasks', 'blocked_on_prereq']);
      if (
        global.idleEngine &&
        IDLE_ENGINE_ELIGIBLE_REASONS.has(idleReason ?? '')
      ) {
        try {
          const botState = await getBotState().catch(() => ({}));
          const blockedTasks = activeTasks
            .filter((t) => t.metadata?.blockedReason)
            .map((t) => ({
              taskId: t.id,
              blockedReason: t.metadata.blockedReason,
              nextEligibleAt: t.metadata.nextEligibleAt,
            }));

          const decision: IdleGoalDecision = await global.idleEngine.requestGoal(
            {
              idleReason: idleReason!,
              activeTasks: activeTasks.length,
              eligibleTasks: eligibleTasks.length,
              blockedTasks,
            },
            botState
          );

          if (decision.kind === 'goal') {
            // Seed the task directly. No thought round-trip, no converter.
            const createdTask = await taskIntegration.addTask(decision.taskSeed);
            if (createdTask) {
              // Acknowledge only on successful task creation. If addTask
              // returned null (dedupe rejection, etc.), do NOT acknowledge
              // — the next tick will retry immediately instead of being
              // stuck behind the cooldown gate.
              global.idleEngine.acknowledgeTaskCreated(decision.runId);
              // Record provenance for the golden-run checkpoint.
              getGoldenRunRecorder().recordIdleGoalRequest(decision.runId, {
                decision_kind: 'goal',
                committed_ir_digest: decision.committedIrDigest,
                committed_goal_prop_id: decision.committedGoalPropId,
              });
              console.log(
                `[IdleEngine] seeded task ${createdTask.id} from Sterling goal ${decision.committedGoalPropId}`
              );
            } else {
              console.log(
                `[IdleEngine] Sterling returned goal ${decision.committedGoalPropId} but addTask returned null — will retry next tick`
              );
            }
          } else if (decision.kind === 'no_policy') {
            // Sterling had no policy — legitimate response (bot is fully
            // healthy, equipped, no threats, priority ladder returned
            // None). Log at a visible level so regressions (e.g. sudden
            // jump in no_policy rate) are noticeable in runtime captures.
            console.log(
              `[IdleEngine] no_policy decision — reason=${decision.reason}`
            );
            getGoldenRunRecorder().recordIdleGoalRequest(decision.runId, {
              decision_kind: 'no_policy',
              reason: decision.reason,
            });
          } else if (decision.kind === 'sterling_unavailable') {
            // Sterling unreachable or client misconfigured. This is an
            // ALERT, not normal operation — operators need to see it in
            // stdout immediately (the previous "silent recorder write"
            // design let a connect()-never-called bug hide for two
            // capture cycles during Phase 2 runtime verification).
            console.warn(
              `[IdleEngine] sterling_unavailable — reason=${decision.reason}`
            );
            getGoldenRunRecorder().recordIdleGoalRequest(decision.runId, {
              decision_kind: 'sterling_unavailable',
              reason: decision.reason,
            });
          } else if (decision.kind === 'in_flight') {
            // Expected control-flow event (previous request still pending).
            // No log, no recorder call — logging this would spam every tick.
          } else if (decision.kind === 'cooldown') {
            // Expected control-flow event (recent successful acknowledge,
            // within the minInterval window). No log, no recorder call.
          }
        } catch (error) {
          console.error('[IdleEngine] requestGoal failed:', error);
        }
      }

      // NOTE: Hunger driveshaft + exploration evaluation is now handled by
      // the reflexRegistry.evaluateTick() call BEFORE the idle gate (above).
      // The registry handles both preemption (canPreempt=true) and idle contexts
      // in a single call, with priority ordering and "at most one per tick."

      return;
    }

    // Execute the highest priority eligible task, prioritizing prerequisite tasks
    const currentTask = eligibleTasks[0]; // Tasks are already sorted by priority

    if (isVerbose()) {
      console.log(
        `[AUTONOMOUS EXECUTOR] Executing task: ${currentTask.title} (${currentTask.type}) id=${currentTask.id}`
      );
    }

    // Check if this task is a prerequisite task (has prerequisite tag)
    const isPrerequisiteTask =
      currentTask.metadata?.tags?.includes('prerequisite');

    // If this is a prerequisite task, execute it immediately
    if (isPrerequisiteTask) {
      logOptimizer.log(
        `Executing prerequisite task: ${currentTask.title}`,
        `prerequisite-${currentTask.id}`
      );
    }

    // Special handling for cognitive reflection tasks
    if (currentTask.type === 'cognitive_reflection') {
      // Check if this cognitive reflection contains actionable steps
      const thoughtContent = currentTask.parameters?.thoughtContent || '';
      const hasActionableSteps = detectActionableSteps(thoughtContent);

      if (hasActionableSteps) {
        // Convert cognitive reflection to actionable tasks
        await convertCognitiveReflectionToTasks(currentTask, taskIntegration);
      }
      // Pure cognitive reflection stays active for potential actionable conversion
      return;
    }

    // Only log task execution if progress has changed or it's a new task
    const taskKey = `task-execution-${currentTask.id}`;
    const currentProgress = Math.round((currentTask.progress || 0) * 100);

    logOptimizer.log(
      `Executing task: ${currentTask.title} (${currentProgress}% complete)`,
      taskKey
    );

    // Circuit breaker around bot health (skip in shadow + EXECUTOR_SKIP_READINESS for golden-run proof)
    const skipBotChecks =
      executorConfig.mode === 'shadow' &&
      process.env.EXECUTOR_SKIP_READINESS === '1';
    if (!skipBotChecks) {
      const botConnection = await checkBotConnectionDetailed();

      if (!botConnection.ok) {
        const st = global.__planningExecutorState;
        if (
          st.breaker === 'closed' &&
          botConnection.failureKind !== 'timeout'
        ) {
          st.breaker = 'open';
          console.warn('[Executor] Bot unavailable — opening circuit');
        }
        const runIdBot = (currentTask.metadata as any)?.goldenRun?.runId as
          | string
          | undefined;
        if (runIdBot) {
          getGoldenRunRecorder().recordExecutorBlocked(
            runIdBot,
            'bot_unavailable',
            {
              validation_error: `connection failed: ${botConnection.failureKind ?? 'unknown'}`,
            }
          );
        }
        return;
      }
      const st = global.__planningExecutorState;
      if (st.breaker !== 'closed') {
        st.breaker = 'closed';
        st.failures = 0;
      }

      // Defense-in-depth: verify bot is actually spawned, not just HTTP-reachable
      try {
        const healthRes = await mcFetch('/health', {
          method: 'GET',
          timeoutMs: 3000,
        });
        if (healthRes.ok) {
          const healthData = (await healthRes.json()) as {
            connectionState?: string;
          };
          if (healthData.connectionState !== 'spawned') {
            const runIdSpawned = (currentTask.metadata as any)?.goldenRun
              ?.runId as string | undefined;
            if (runIdSpawned) {
              getGoldenRunRecorder().recordExecutorBlocked(
                runIdSpawned,
                'bot_not_spawned',
                {
                  validation_error: `connectionState=${healthData.connectionState ?? 'undefined'}`,
                }
              );
            }
            return;
          }
        }
      } catch {
        const runIdHealth = (currentTask.metadata as any)?.goldenRun?.runId as
          | string
          | undefined;
        if (runIdHealth) {
          getGoldenRunRecorder().recordExecutorBlocked(
            runIdHealth,
            'bot_health_check_failed'
          );
        }
        return;
      }
    }

    // Check crafting table prerequisite for crafting tasks
    if (
      currentTask.type === 'crafting' &&
      !currentTask.metadata?.tags?.includes('prerequisite')
    ) {
      const craftingTableReady =
        await checkCraftingTablePrerequisite(currentTask);
      if (!craftingTableReady) {
        const runIdCraft = (currentTask.metadata as any)?.goldenRun?.runId as
          | string
          | undefined;
        if (runIdCraft) {
          getGoldenRunRecorder().recordExecutorBlocked(
            runIdCraft,
            'crafting_table_prerequisite'
          );
        }
        return;
      }

      // Generate complex crafting subtasks for advanced items
      await generateComplexCraftingSubtasks(currentTask);
    }

    // Try to find a suitable MCP option for this task type
    let mcpOptions =
      (await serverConfig.getMCPIntegration()!.listOptions('all')) || [];

    // Filter out leaf registrations that appear as options in the registry
    mcpOptions = mcpOptions.filter(
      (opt: any) => !KNOWN_LEAF_NAMES.has(opt.name)
    );

    // Map task types to MCP options
    const leafMapping: Record<string, string> = {
      gathering: 'gather_wood@1',
      crafting: 'craft_wooden_pickaxe@1',
      exploration: 'explore_move@1',
      mine: 'gather_wood@1', // Mining falls back to gathering
      movement: 'explore_move@1', // Movement tasks use exploration
      build: 'craft_wooden_pickaxe@1', // Building requires tools
      combat: 'sense_hostiles@1.0.0', // Combat uses hostile detection
      building: 'craft_wooden_pickaxe@1', // Building tasks
      survival: 'survival_check@1', // Survival tasks use survival check
      investigation: 'survival_check@1', // Investigation uses survival check
      health: 'health_monitor@1', // Health tasks use health monitor
      resource: 'gather_wood@1', // Resource tasks use gathering
      tool: 'craft_wooden_pickaxe@1', // Tool tasks use crafting
      search: 'explore_move@1', // Search tasks use exploration
    };

    const taskTypeMapping: Record<string, string[]> = {
      gathering: ['chop', 'tree', 'wood', 'collect', 'gather'],
      gather: ['chop', 'tree', 'wood', 'collect', 'gather'],
      movement: ['move', 'navigate', 'travel', 'path', 'walk'],
      mine: ['mine', 'dig', 'extract'],
      crafting: ['craft', 'build', 'create'],
      build: ['build', 'place', 'create', 'construct'],
      building: ['build', 'place', 'create', 'construct'],
      exploration: ['explore', 'search', 'find'],
      explore: ['explore', 'search', 'find', 'move'],
      mining: ['mine', 'dig', 'extract'],
      farming: ['farm', 'plant', 'grow'],
      combat: ['fight', 'attack', 'defend'],
      navigation: ['move', 'navigate', 'travel'],
    };

    // Try to find a suitable MCP option based on task type
    const suitableOption = mcpOptions.find((option) => {
      // First try exact match with leafMapping
      if (
        leafMapping[currentTask.type] &&
        option.id === leafMapping[currentTask.type]
      ) {
        return true;
      }

      // Fallback to name/description matching
      const searchTerms = taskTypeMapping[currentTask.type] || [
        currentTask.type,
      ];
      return searchTerms.some(
        (term) =>
          option.name?.toLowerCase().includes(term) ||
          option.description?.toLowerCase().includes(term)
      );
    });

    // Inventory-based progress estimation before attempting execution
    try {
      const requirement = resolveRequirement(currentTask);
      if (requirement) {
        const inv = await fetchInventorySnapshot();
        const p = computeProgressFromInventory(inv, requirement);
        const clamped = Math.max(0, Math.min(1, p));
        if (currentTask.status === 'pending') {
          await taskIntegration.updateTaskStatus(currentTask.id, 'active');
        }
        taskIntegration.updateTaskProgress(currentTask.id, clamped);
        const snapshot = computeRequirementSnapshot(inv, requirement);
        taskIntegration.updateTaskMetadata(currentTask.id, {
          requirement: snapshot,
        });
        if (clamped >= 1 && (requirement as any).quantity >= 1) {
          // For crafting tasks, only mark as completed if the actual output item is present
          if (requirement.kind === 'craft') {
            const hasOutput = inv.some((it) =>
              itemMatches(it, [requirement.outputPattern])
            );
            if (!hasOutput) {
              // Don't mark as completed if we don't have the actual crafted item
              return;
            }
          }

          // If already satisfied, mark completed and skip execution
          taskIntegration.updateTaskProgress(currentTask.id, 1, 'completed');
          return;
        }
      }
    } catch (e) {
      console.warn('Inventory progress estimation failed:', e);
    }

    // ── Executable-plan execution: if task has executable steps, run them ──
    // Normalize authority and executability on all steps
    currentTask.steps?.forEach((s: any) => {
      normalizeStepAuthority(s);
      normalizeStepExecutability(s);
    });

    const hasExecutablePlan = currentTask.steps?.some(
      (s: any) => isExecutableStep(s) && !s.done
    );
    if (hasExecutablePlan) {
      const nextStep = currentTask.steps?.find(
        (s: any) => !s.done && isExecutableStep(s)
      );

      // If no executable steps remain but non-done steps exist, the plan is blocked
      if (!nextStep && currentTask.steps?.some((s: any) => !s.done)) {
        taskIntegration.updateTaskMetadata(currentTask.id, {
          blockedReason: 'no-executable-plan',
        });
        console.warn(
          `[Executor] Task ${currentTask.id} has no remaining executable steps — marking blocked`
        );
        {
          const runId = (currentTask.metadata as any)?.goldenRun?.runId as string | undefined;
          const loopSig = buildFailureSignature({ category: 'executor_error', blockedReason: 'no-executable-plan' });
          const episode = getLoopBreaker().recordFailure(loopSig, { taskId: currentTask.id, runId });
          if (episode && runId) { getGoldenRunRecorder().recordLoopDetected(runId, episode); }
          if (runId) { getGoldenRunRecorder().markLoopBreakerEvaluated(runId); }
        }
        return;
      }

      if (nextStep) {
        const leafExec = stepToLeafExecution(nextStep);
        if (leafExec) {
          const sterlingCtx = buildSterlingStepExecutorContext();
          await executeSterlingStep(currentTask, nextStep, sterlingCtx);
          await recomputeProgressAndMaybeComplete(currentTask);
          return;
        } else {
          const hasExecProvenance =
            !!nextStep.meta?.authority ||
            !!nextStep.meta?.leaf ||
            nextStep.meta?.executable === true;
          if (hasExecProvenance) {
            const blockedReason = 'executable-step-no-leaf-binding';
            taskIntegration.updateTaskMetadata(currentTask.id, {
              blockedReason,
              lastBindingFailure: {
                stepId: nextStep.id,
                order: nextStep.order,
                leaf: nextStep.meta?.leaf as string | undefined,
                authority: nextStep.meta?.authority as string | undefined,
                at: Date.now(),
              },
            });
            console.warn(
              `[Executor] Step ${nextStep.order} has no leaf binding — blocking task (no MCP fallback)`
            );
            {
              const runId = (currentTask.metadata as any)?.goldenRun?.runId as string | undefined;
              const loopSig = buildFailureSignature({
                category: 'executor_error',
                blockedReason: 'executable-step-no-leaf-binding',
                leaf: nextStep.meta?.leaf as string | undefined,
              });
              const episode = getLoopBreaker().recordFailure(loopSig, { taskId: currentTask.id, runId });
              if (episode && runId) { getGoldenRunRecorder().recordLoopDetected(runId, episode); }
              if (runId) { getGoldenRunRecorder().markLoopBreakerEvaluated(runId); }
            }
            return;
          }
          console.warn(
            `[Executor] Step ${nextStep.order} has no executable meta — falling through to MCP`
          );
        }
      }
    }

    // Track if task was executed successfully
    let executionResult = false;

    // Execute MCP option if found
    if (!suitableOption) {
      // No MCP option found — fall through to leaf mapping below.
      // (Legacy: this path previously called executeTask() → POST /execute-scenario,
      //  but that endpoint is retired. Leaf mapping is the canonical direct-execution path.)
      logOptimizer.log(
        `No MCP option for task: ${currentTask.title} (${currentTask.type}) — using leaf mapping`,
        'executor-leaf-fallback'
      );
    }

    // Task execution handled above - if no MCP option was found, we executed directly
    // If no BT option found, try to use individual leaves directly
    if (!suitableOption && !executionResult) {
      // Map task types to individual leaves (inventory-aware where possible)
      const invForInference = await fetchInventorySnapshot();
      const inferredRecipe = resolvedRecipe(currentTask, invForInference);
      const inferredBlock = resolvedBlock(currentTask);
      const botPos = await getBotPosition();
      const attempt = currentTask.metadata?.retryCount || 0;
      const randomExplore = explorePointNear(botPos as any, attempt, 8);
      const leafMapping: Record<string, { leafName: string; args: any }> = {
        general: {
          // Default to exploration step so we keep moving when unsure
          leafName: 'move_to',
          args: {
            pos:
              currentTask.parameters?.pos ||
              currentTask.parameters?.target ||
              randomExplore,
          },
        },
        movement: {
          leafName: 'move_to',
          args: {
            pos: currentTask.parameters?.pos || currentTask.parameters?.target,
          },
        },
        explore: {
          leafName: 'move_to',
          args: {
            pos:
              currentTask.parameters?.pos ||
              currentTask.parameters?.target ||
              randomExplore,
          },
        },
        gathering: {
          leafName: 'dig_block',
          args: {
            blockType:
              currentTask.parameters?.blockType || inferredBlock || '_log',
            pos: currentTask.parameters?.pos,
          },
        },
        gather: {
          leafName: 'dig_block',
          args: {
            blockType:
              currentTask.parameters?.blockType || inferredBlock || '_log',
            pos: currentTask.parameters?.pos,
          },
        },
        search: {
          leafName: 'dig_block',
          args: {
            blockType:
              currentTask.parameters?.blockType || inferredBlock || '_log',
            pos: currentTask.parameters?.pos,
          },
        },
        mining: {
          leafName: 'dig_block',
          args: {
            blockType:
              currentTask.parameters?.blockType || inferredBlock || 'stone',
            pos: currentTask.parameters?.pos,
          },
        },
        mine: {
          leafName: 'dig_block',
          args: {
            blockType:
              currentTask.parameters?.blockType || inferredBlock || 'stone',
            pos: currentTask.parameters?.pos,
          },
        },
        crafting: {
          leafName: 'craft_recipe',
          args: {
            recipe:
              currentTask.parameters?.recipe ||
              inferredRecipe ||
              `${findWoodPrefix([])}_planks`,
            qty: currentTask.parameters?.qty || 1,
          },
        },
        placement: (() => {
          const item = currentTask.parameters?.item || 'crafting_table';
          const WORKSTATION_SET = new Set([
            'crafting_table',
            'furnace',
            'blast_furnace',
          ]);
          if (WORKSTATION_SET.has(item)) {
            return {
              leafName: 'place_workstation',
              args: { workstation: item },
            };
          }
          return {
            leafName: 'place_block',
            args: { item, pos: currentTask.parameters?.pos },
          };
        })(),
        exploration: {
          leafName: 'move_to',
          args: {
            pos: currentTask.parameters?.pos || randomExplore,
          },
        },
        farming: {
          leafName: 'dig_block',
          args: { blockType: currentTask.parameters?.blockType || 'wheat' },
        },
        navigation: {
          leafName: 'move_to',
          args: {
            target: currentTask.parameters?.target || 'navigation_target',
          },
        },
        build: {
          leafName: 'place_block',
          args: {
            item: currentTask.parameters?.item || 'crafting_table',
            pos: currentTask.parameters?.pos,
          },
        },
        combat: {
          leafName: 'sense_hostiles',
          args: {},
        },
        building: {
          leafName: 'place_block',
          args: {
            item: currentTask.parameters?.item || 'crafting_table',
            pos: currentTask.parameters?.pos,
          },
        },
      };

      const availableLeaves = await getAvailableLeaves();
      const leafConfig = leafMapping[currentTask.type];
      // Build Sterling/LLM-inspired candidate set based on intent + inventory
      const intent = `${(currentTask.title || '').toLowerCase()} ${(
        currentTask.description || ''
      ).toLowerCase()}`;
      const invForDecision = await fetchInventorySnapshot();
      const haveLogs = hasEnoughLogs(invForDecision, 1);
      const woodType = findWoodPrefix(invForDecision);
      const planksRecipe = `${woodType}_planks`;
      const needPlanks = intent.includes('plank') || intent.includes('planks');
      const candidates: Array<{ leafName: string; args: any; reason: string }> =
        [];
      if (needPlanks && availableLeaves.has('craft_recipe')) {
        candidates.push({
          leafName: 'craft_recipe',
          args: { recipe: planksRecipe, qty: 4 },
          reason: `Intent mentions planks; craft ${planksRecipe} from inventory`,
        });
      }
      if (haveLogs && availableLeaves.has('craft_recipe')) {
        candidates.push({
          leafName: 'craft_recipe',
          args: { recipe: planksRecipe, qty: 4 },
          reason: `Logs available in inventory; craft ${planksRecipe}`,
        });
      }
      if (availableLeaves.has('dig_block')) {
        const blockType =
          currentTask.parameters?.blockType || inferredBlock || '_log';
        candidates.push({
          leafName: 'dig_block',
          args: { blockType, pos: currentTask.parameters?.pos },
          reason: 'Gather base resource via digging',
        });
      }
      if (availableLeaves.has('move_to')) {
        candidates.push({
          leafName: 'move_to',
          args: {
            pos:
              currentTask.parameters?.pos ||
              currentTask.parameters?.target ||
              randomExplore,
          },
          reason: 'Explore to unblock if resource not found',
        });
      }

      // Prefer explicit mapping if available, else pick first viable candidate
      let selectedLeaf =
        leafConfig && availableLeaves.has(leafConfig.leafName)
          ? { ...leafConfig, reason: 'Mapped by task type' }
          : candidates.find((c) => availableLeaves.has(c.leafName));
      if (!selectedLeaf && leafConfig)
        selectedLeaf = {
          ...leafConfig,
          reason: 'Mapped by task type (not verified)',
        } as any;
      if (selectedLeaf) {
        // Check retry count to prevent infinite loops
        const retryCount = currentTask.metadata?.retryCount || 0;
        const maxRetries = currentTask.metadata?.maxRetries || 3;

        if (retryCount >= maxRetries) {
          taskIntegration.updateTaskProgress(
            currentTask.id,
            currentTask.progress || 0,
            'failed'
          );
          console.warn(
            `[Executor] Task failed after ${retryCount} retries: ${currentTask.title}`
          );
          return;
        }

        // Dynamic, failure-driven prerequisite injection for crafting
        const injected = await injectDynamicPrereqForCraft(currentTask);
        if (injected) return; // execute newly created subtask first

        // Pre-check prerequisites for crafting leaf
        if (
          selectedLeaf.leafName === 'craft_recipe' &&
          /pickaxe/i.test(currentTask.title || '')
        ) {
          const preInv = await fetchInventorySnapshot();
          if (!hasEnoughLogs(preInv)) {
            taskIntegration.addStepsBeforeCurrent(currentTask.id, [
              { label: 'Locate nearby wood' },
              { label: 'Move to resource location' },
              { label: 'Collect wood safely' },
            ]);
            return;
          }
        }

        // Annotate current step with leaf and parameters for verification clarity
        try {
          taskIntegration.annotateCurrentStepWithLeaf(
            currentTask.id,
            selectedLeaf.leafName,
            selectedLeaf.args
          );
        } catch (e) {
          console.error('[MCP] Failed to annotate current step with leaf:', e);
        }

        // --- Executor guards (MCP fallback path) ---
        const mcpToolName = `minecraft.${selectedLeaf.leafName}`;

        // Derive the current incomplete step (MCP path has no nextStep from plan scope)
        const mcpCurrentStep = currentTask.steps?.find((s: any) => !s.done);

        // 1. Leaf allowlist (valid in both shadow and live)
        if (!executorConfig.leafAllowlist.has(mcpToolName)) {
          if (mcpCurrentStep?.meta) {
            mcpCurrentStep.meta.executable = false;
            mcpCurrentStep.meta.blocked = true;
          }
          taskIntegration.updateTaskMetadata(currentTask.id, {
            blockedReason: `unknown-leaf:${selectedLeaf.leafName}`,
          });
          taskIntegration.emit('taskLifecycleEvent', {
            type: 'unknown_leaf_rejected',
            taskId: currentTask.id,
            leaf: selectedLeaf.leafName,
          });
          return;
        }

        // 2. Shadow mode: always observe, never throttle
        if (executorConfig.mode === 'shadow') {
          if (isVerbose()) {
            console.log(
              `[Executor:shadow] Would execute: ${mcpToolName} ${JSON.stringify(selectedLeaf.args)}`
            );
          }
          if (mcpCurrentStep) {
            await taskIntegration.startTaskStep(
              currentTask.id,
              mcpCurrentStep.id,
              { dryRun: true }
            );
          }
          return;
        }

        // --- Live mode ---

        // 3. Rate limiter (live only)
        if (!stepRateLimiter.canExecute()) {
          return;
        }

        // 4. Rig G gate + snapshot capture
        if (mcpCurrentStep) {
          const mcpStepStarted = await taskIntegration.startTaskStep(
            currentTask.id,
            mcpCurrentStep.id
          );
          if (!mcpStepStarted) {
            return;
          }
        }

        // 5. Committed — consume budget
        stepRateLimiter.record();

        // Execute the leaf via the Minecraft Interface action API
        const actionResult = await toolExecutor.execute(
          mcpToolName,
          selectedLeaf.args || {},
          getExecutorAbortSignal()
        );

        if (actionResult?.ok) {
          // Post-check: if crafting pickaxe reported success but no pickaxe, inject acquisition step
          if (
            selectedLeaf.leafName === 'craft_recipe' &&
            /pickaxe/i.test(currentTask.title || '')
          ) {
            const postInv = await fetchInventorySnapshot();
            if (!hasPickaxe(postInv)) {
              console.warn(
                '[Executor] Craft reported success but pickaxe not found; planning next acquisition step.'
              );
              const injected = await injectDynamicPrereqForCraft(currentTask);
              if (injected) return;
            }
          }
          await recomputeProgressAndMaybeComplete(currentTask);

          return; // Exit early since we successfully executed the leaf
        }
        // Navigation-busy: retry next cycle, not a failure
        if (isNavigatingError(actionResult?.error)) {
          return;
        }

        console.error(
          `[Executor] Leaf execution failed: ${selectedLeaf.leafName} ${actionResult?.error}`
        );

        // Increment retry count
        const newRetryCount = retryCount + 1;

        // Exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, newRetryCount), 30_000);
        taskIntegration.updateTaskMetadata(currentTask.id, {
          nextEligibleAt: Date.now() + backoffMs,
        });

        // If resource not found for dig_block, inject exploration step instead of spinning
        if (
          selectedLeaf.leafName === 'dig_block' &&
          typeof actionResult?.error === 'string' &&
          /no .*found/i.test(actionResult.error)
        ) {
          const blockType = String(leafConfig.args?.blockType || 'resource');
          const exploreInput: BuildTaskInput = {
            kind: 'explore',
            outputPattern: blockType,
            quantity: 1,
          };
          const exploreKey = computeSubtaskKey(exploreInput, currentTask.id);
          const activeExplore = taskIntegration
            .getActiveTasks()
            .find(
              (t: any) =>
                (t.metadata as any)?.subtaskKey === exploreKey &&
                t.status !== 'completed' &&
                t.status !== 'failed'
            );
          if (!activeExplore) {
            await taskIntegration.addTask(
              buildTaskFromRequirement(exploreInput, {
                parentTask: currentTask,
                tags: ['dynamic'],
              })
            );
            logTaskIngestion({ _diag_version: 1, source: 'executor_explore_subtask', parent_task_id: currentTask.id, decision: 'created', task_type: 'explore' });
            taskIntegration.updateTaskMetadata(currentTask.id, {
              blockedReason: 'waiting_on_prereq',
            });
          }
        }

        // M3.5: Prerequisite closure for craft_recipe failures.
        // When craft fails with toolDiagnostics (requires_workstation, missing inputs, etc.),
        // forward them to injectDynamicPrereqForCraft which handles workstation proximity,
        // material acquisition, and other typed prerequisites.
        if (selectedLeaf.leafName === 'craft_recipe') {
          const diag = (actionResult as any)?.toolDiagnostics;
          if (diag) {
            const prereqInjected = await injectDynamicPrereqForCraft(currentTask, {
              recipe: leafConfig.args?.recipe as string | undefined,
              qty: leafConfig.args?.qty as number | undefined,
              toolDiagnostics: diag,
            });
            if (prereqInjected) {
              logTaskIngestion({ _diag_version: 1, source: 'executor_explore_subtask', parent_task_id: currentTask.id, decision: 'created', task_type: 'craft' });
              taskIntegration.updateTaskMetadata(currentTask.id, {
                blockedReason: 'waiting_on_prereq',
              });
              return; // Don't retry — prerequisite task will run first
            }
          }
        }

        if (newRetryCount >= maxRetries) {
          taskIntegration.updateTaskMetadata(currentTask.id, {
            retryCount: newRetryCount,
            blockedReason: 'max-retries-exceeded',
          });
          taskIntegration.updateTaskProgress(
            currentTask.id,
            currentTask.progress || 0,
            'failed'
          );
          console.warn(
            `[Executor] Task failed after ${newRetryCount} retries: ${currentTask.title}`
          );
        } else {
          taskIntegration.updateTaskMetadata(currentTask.id, {
            retryCount: newRetryCount,
            lastRetry: Date.now(),
          });
        }
      }
    }

    if (suitableOption) {
      // Check retry count to prevent infinite loops
      const retryCount = currentTask.metadata?.retryCount || 0;
      const maxRetries = currentTask.metadata?.maxRetries || 3;

      if (retryCount >= maxRetries) {
        console.warn(
          `[Executor] Task failed after ${retryCount} retries: ${currentTask.title}`
        );
        taskIntegration.updateTaskProgress(
          currentTask.id,
          currentTask.progress || 0,
          'failed'
        );
        return;
      }

      // Pre-check prerequisites for crafting tasks (e.g., pickaxe requires wood)
      if (
        currentTask.type === 'crafting' &&
        /pickaxe/i.test(currentTask.title || '')
      ) {
        const preInv = await fetchInventorySnapshot();
        if (!hasEnoughLogs(preInv)) {
          const gather = await serverConfig
            .getMCPIntegration()
            ?.executeTool('minecraft.dig_block', { blockType: '_log' });
          if (!gather?.success) {
            console.warn(
              '[Executor] Quick gather attempt failed. Injecting prerequisite steps.'
            );
            taskIntegration.addStepsBeforeCurrent(currentTask.id, [
              { label: 'Locate nearby wood' },
              { label: 'Move to resource location' },
              { label: 'Collect wood safely' },
            ]);
            return;
          }
          const postGather = await fetchInventorySnapshot();
          if (!hasEnoughLogs(postGather)) {
            console.warn(
              '[Executor] Wood still insufficient after gather attempt. Injecting prerequisite steps.'
            );
            taskIntegration.addStepsBeforeCurrent(currentTask.id, [
              { label: 'Locate nearby wood' },
              { label: 'Move to resource location' },
              { label: 'Collect wood safely' },
            ]);
            return;
          }
        }
      }

      // Additional pre-check: mining iron requires stone pickaxe
      if (
        currentTask.type === 'mining' &&
        /iron/i.test(currentTask.title || '')
      ) {
        const injected = await injectDynamicPrereqForMine(currentTask);
        if (injected) return;
      }

      // Execute the MCP option using inferred/explicit parameters
      const desiredRecipe =
        resolvedRecipe(currentTask) ??
        (/(crafting[_ ]table)/i.test(currentTask.title || '')
          ? 'crafting_table'
          : undefined);
      const desiredBlock = resolvedBlock(currentTask);

      // Annotate step with MCP option and resolved parameters
      try {
        taskIntegration.annotateCurrentStepWithOption(
          currentTask.id,
          suitableOption.name,
          {
            recipe: desiredRecipe,
            qty: currentTask.parameters?.qty,
            blockType: desiredBlock,
            pos: currentTask.parameters?.pos,
          }
        );
      } catch (e) {
        console.error('[MCP] Failed to annotate current step with option:', e);
      }

      const mcpResult = await serverConfig
        .getMCPIntegration()
        ?.runOption(suitableOption.name, {
          recipe: desiredRecipe,
          qty: currentTask.parameters?.qty,
          blockType: desiredBlock,
          pos: currentTask.parameters?.pos,
        });

      if (mcpResult?.success) {
        if (
          currentTask.type === 'crafting' &&
          /pickaxe/i.test(currentTask.title || '')
        ) {
          const postInv = await fetchInventorySnapshot();
          if (!hasPickaxe(postInv)) {
            console.warn(
              '[Executor] Craft reported success but pickaxe not found; planning next acquisition step.'
            );
            const injected = await injectDynamicPrereqForCraft(currentTask);
            if (injected) return;
          }
        }
        await recomputeProgressAndMaybeComplete(currentTask);
      } else {
        console.error(
          `[Executor] MCP option execution failed: ${suitableOption.name} ${mcpResult?.error}`
        );

        // If this option was a dig/gather and resource not found, add exploration
        if (
          suitableOption.name.toLowerCase().includes('gather') &&
          typeof mcpResult?.error === 'string' &&
          /no .*found/i.test(mcpResult.error)
        ) {
          const target = String(desiredBlock || 'resource');
          const exploreInput: BuildTaskInput = {
            kind: 'explore',
            outputPattern: target,
            quantity: 1,
          };
          const exploreKey = computeSubtaskKey(exploreInput, currentTask.id);
          const activeExplore = taskIntegration
            .getActiveTasks()
            .find(
              (t: any) =>
                (t.metadata as any)?.subtaskKey === exploreKey &&
                t.status !== 'completed' &&
                t.status !== 'failed'
            );
          if (!activeExplore) {
            await taskIntegration.addTask(
              buildTaskFromRequirement(exploreInput, {
                parentTask: currentTask,
                tags: ['dynamic'],
              })
            );
            logTaskIngestion({ _diag_version: 1, source: 'mcp_explore_subtask', parent_task_id: currentTask.id, decision: 'created', task_type: 'explore' });
            taskIntegration.updateTaskMetadata(currentTask.id, {
              blockedReason: 'waiting_on_prereq',
            });
          }
        }

        // Increment retry count
        const newRetryCount = retryCount + 1;

        if (newRetryCount >= maxRetries) {
          // Update task status using the enhanced task integration
          taskIntegration.updateTaskProgress(
            currentTask.id,
            currentTask.progress || 0,
            'failed'
          );
          console.warn(
            `[Executor] Task failed after ${newRetryCount} retries: ${currentTask.title}`
          );
        } else {
          // Update retry count using the enhanced task integration
          taskIntegration.updateTaskMetadata(currentTask.id, {
            retryCount: newRetryCount,
            lastRetry: Date.now(),
          });
          // If crafting and missing wood, add a chest-search fallback step on retry
          if (
            currentTask.type === 'crafting' &&
            /pickaxe/i.test(currentTask.title || '')
          ) {
            taskIntegration.addStepsBeforeCurrent(currentTask.id, [
              { label: 'Search nearby chest for wood' },
            ]);
          }
        }
      }
    } else {
      logOptimizer.warn(
        `⚠️ No suitable MCP option found for task: ${currentTask.title}. Falling back to planning system.`,
        `no-mcp-option-${currentTask.type}`
      );
      // If no MCP option, execute the task through the planning system
      try {
        // Map task type to real Minecraft action
        const minecraftAction = mapTaskTypeToMinecraftAction(currentTask);

        // Thread task scope for nav lease isolation
        const scopedAction = withNavLeaseScope(minecraftAction, currentTask.id);
        if (scopedAction) {

          // Execute real Minecraft action (pass taskId explicitly for typed wrapper)
          const actionResult = await executeActionWithBotCheck(
            scopedAction,
            currentTask.id
          );

          if (actionResult.outcome === 'shadow') {
            // Shadow mode: observation recorded. Task is blocked until mode changes.
            // NOT a failure — do not consume retries.
            taskIntegration.updateTaskMetadata(currentTask.id, {
              blockedReason: 'shadow_mode',
              blockedAt: Date.now(),
              shadowObservationCount:
                (currentTask.metadata?.shadowObservationCount || 0) + 1,
            });
            // Task stays 'active' with blockedReason. Executor skips blocked tasks.
            // Auto-fail TTL (2 min) applies: if shadow mode persists, task will
            // auto-fail rather than spin indefinitely.
          } else if (actionResult.outcome === 'error') {
            // Infra error: trip circuit breaker, don't touch task metadata.
            // This is a systemic failure (bot disconnected, network), not task-specific.
            // Circuit breaker handles retry timing at the executor level.
            tripCircuitBreaker(actionResult.error || 'Unknown infra error');
            // Task stays as-is; executor will pause until breaker resets
          } else if (actionResult.ok) {
            // Record success for circuit breaker reset
            recordSuccess();
            await recomputeProgressAndMaybeComplete(currentTask);
          } else {
            // Action-level failure (outcome='executed', ok=false)
            // This is a task-specific failure, not infra — use retry logic
            console.error(
              `[Executor] Task execution failed: ${currentTask.title}`,
              actionResult.error
            );

            // Increment retry count for failed execution
            const retryCount = (currentTask.metadata?.retryCount || 0) + 1;
            const maxRetries = currentTask.metadata?.maxRetries || 3;

            if (retryCount >= maxRetries) {
              taskIntegration.updateTaskProgress(
                currentTask.id,
                currentTask.progress || 0,
                'failed'
              );
              console.warn(
                `[Executor] Task failed after ${retryCount} retries: ${currentTask.title}`
              );
            } else {
              taskIntegration.updateTaskMetadata(currentTask.id, {
                retryCount,
                lastRetry: Date.now(),
              });
            }
          }
        } else {
          console.warn(
            `[Executor] No Minecraft action mapping for task type: ${currentTask.type}`
          );
        }
      } catch (error) {
        console.error(
          `[Executor] Task execution error: ${currentTask.title}`,
          error
        );
      }
    }

    // Get active goals and execute them (keep existing goal logic)
    const activeGoals = planningSystem.goalFormulation.getActiveGoals();

    for (const goal of activeGoals) {
      try {
        await planningSystem.execution.executeGoal(goal);
      } catch (error) {
        console.error(`Failed to execute goal ${goal.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Autonomous task executor failed:', error);
  } finally {
    if (global.__planningExecutorState) {
      global.__planningExecutorState.running = false;
      global.__planningExecutorState.lastAttempt = Date.now();
    }
  }
}

// Initialize core components
const btRunner = new BehaviorTreeRunner(toolExecutor);
const cognitiveIntegration = new CognitiveIntegration({
  reflectionEnabled: true,
  maxRetries: 3,
  failureThreshold: 0.3,
  successThreshold: 0.7,
});

const cognitiveThoughtProcessor = new CognitiveThoughtProcessor({
  enableThoughtToTaskTranslation: true,
  thoughtProcessingInterval: 30000,
  maxThoughtsPerBatch: 5,
  planningEndpoint: process.env.PLANNING_ENDPOINT || 'http://localhost:3002',
  cognitiveEndpoint: process.env.COGNITION_ENDPOINT || 'http://localhost:3003',
  enableSignalPipeline: true, // Enable the new signal extraction pipeline
  signalConfidenceThreshold: 0.3, // Minimum confidence for signals
});

// Connect cognitive thought processor to world state
worldStateManager.on('updated', (snapshot) => {
  try {
    // Update cognitive processor with world state
    if (cognitiveThoughtProcessor.updateWorldState) {
      cognitiveThoughtProcessor.updateWorldState(snapshot);
    }
  } catch (e) {
    console.warn(
      'Cognitive processor world state update failed:',
      (e as any)?.message
    );
  }
});

// IntegratedPlanningCoordinator removed — legacy planner retired (Phase 3).
// Sterling solvers + deterministic compiler are the canonical planning backends.

const { goalManager, reactiveExecutor, taskIntegration } =
  createPlanningBootstrap({ worldStateManager });

// Wire task history provider into cognitive thought processor (DR-H9: task context for reasoning)
cognitiveThoughtProcessor.setTaskHistoryProvider(
  new DirectTaskHistoryProvider(taskIntegration)
);

// Verification needs post-action freshness. The worldState snapshot can lag by
// one action (craft completes, verify runs before the next 3s poll tick),
// producing false-negative before=0 after=0 FAILs. Leaving the provider unset
// forces getInventoryItems() to fall through to live HTTP /inventory reads,
// which reflect the worker's current mineflayer state immediately.
// Keep worldState caching for UI/telemetry — just don't use it for proof.

// Rig E: Wire hierarchical planner when enabled via env config.
// With ENABLE_RIG_E=1, navigate/explore/find tasks are planned via the
// MacroPlanner (Dijkstra over context graph). Without it, they get the
// blocked sentinel (rig_e_solver_unimplemented) as before.
if (process.env.ENABLE_RIG_E === '1') {
  taskIntegration.configureHierarchicalPlanner();
}

// Goal Binding: Wire goal resolver for goal-sourced task deduplication.
// With ENABLE_GOAL_BINDING=1, addTask() intercepts building tasks with
// source='goal' and routes them through GoalResolver.resolveOrCreate()
// to enforce the uniqueness invariant (at most one non-terminal task
// per goalType + goalKey). Without it, goal tasks use standard dedup.
if (process.env.ENABLE_GOAL_BINDING === '1') {
  taskIntegration.enableGoalResolver();
}

const memoryIntegration = new MemoryIntegration({
  enableRealTimeUpdates: true,
  enableReflectiveNotes: true,
  enableEventLogging: true,
  enableMemoryDiscovery: true,
  dashboardEndpoint: process.env.DASHBOARD_ENDPOINT || 'http://localhost:3000',
  memorySystemEndpoint: process.env.MEMORY_ENDPOINT || 'http://localhost:3001',
  maxEvents: 100,
  maxNotes: 50,
  memorySystemTimeout: parseInt(process.env.MEMORY_TIMEOUT || '5000'),
  retryAttempts: parseInt(process.env.MEMORY_RETRIES || '3'),
});

const environmentIntegration = new EnvironmentIntegration({
  enableRealTimeUpdates: true,
  enableEntityDetection: true,
  enableInventoryTracking: true,
  enableResourceAssessment: true,
  dashboardEndpoint: process.env.DASHBOARD_ENDPOINT || 'http://localhost:3000',
  worldSystemEndpoint: process.env.WORLD_ENDPOINT || 'http://localhost:3004',
  minecraftEndpoint: process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005',
  updateInterval: 15000, // Increased from 5000ms to 15000ms to reduce load
  maxEntityDistance: 50,
  maxBlockDistance: 20,
});

const liveStreamIntegration = new LiveStreamIntegration({
  enableRealTimeUpdates: true,
  enableActionLogging: true,
  enableVisualFeedback: true,
  enableMiniMap: true,
  enableScreenshots: true,
  dashboardEndpoint: process.env.DASHBOARD_ENDPOINT || 'http://localhost:3000',
  minecraftEndpoint: process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005',
  screenshotEndpoint: `${process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005'}/screenshots`,
  updateInterval: 10000, // Reduced from 2000ms to 10000ms to reduce load
  maxActionLogs: 100, // Reduced from 1000 to 100 to save memory
  maxVisualFeedbacks: 50, // Reduced from 100 to 50 to save memory
  screenshotInterval: 30000, // Increased from 10000ms to 30000ms to reduce load
});

// Create planning system interface
const planningSystem: PlanningSystem = {
  goalFormulation: {
    getCurrentGoals: () => goalManager.listGoals(),
    getActiveGoals: () => goalManager.getGoalsByStatus(GoalStatus.PENDING),
    getGoalCount: () => goalManager.listGoals().length,
    addGoal: async (goal: any) => {
      try {
        goalManager.upsert(goal);
        return { success: true, goalId: goal.id };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Failed to add goal',
        };
      }
    },
    reprioritizeGoal: (goalId: string, p?: number, u?: number) =>
      goalManager.reprioritize(goalId, p, u),
    cancelGoal: (goalId: string, reason?: string) =>
      goalManager.cancel(goalId, reason),
    pauseGoal: (goalId: string) => goalManager.pause(goalId),
    resumeGoal: (goalId: string) => goalManager.resume(goalId),
    completeGoal: (goalId: string) => goalManager.complete(goalId),
    getCurrentTasks: () => taskIntegration.getActiveTasks(),
    addTask: async (task: any) => await taskIntegration.addTask(task),
    getCompletedTasks: () => taskIntegration.getTasks({ status: 'completed' }),
    updateBotInstance: async (botInstance: any) => {
      const mcpIntegration = serverConfig.getMCPIntegration();
      if (mcpIntegration) {
        await mcpIntegration.updateBotInstance(botInstance);
        return { success: true, message: 'Bot instance updated successfully' };
      } else {
        return { success: false, error: 'MCP integration not available' };
      }
    },
  },
  execution: {
    executeGoal: async (goal: any) => {
      try {
        // Ensure task is activated before dispatch (P0-2: activation at dispatch boundary)
        // Goals often have task IDs when converted from tasks
        if (goal.id) {
          await taskIntegration.ensureActivated(goal.id);
        }

        // Execute the goal through the enhanced reactive executor
        const result = await reactiveExecutor.executeTask(goal);

        if (result.success) {
          return {
            success: true,
            message: 'Goal executed successfully',
            result,
          };
        }
        console.error(
          `[Executor] Goal execution failed: ${goal.title || goal.id}`,
          result.error
        );
        return {
          success: false,
          message: result.error || 'Goal execution failed',
          result,
        };
      } catch (error) {
        console.error(
          `[Executor] Goal execution error: ${goal.title || goal.id}`,
          error
        );
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    executeTask: async (task: any) => {
      try {
        // Ensure task is activated before dispatch (P0-2: activation at dispatch boundary)
        // This guarantees tasks cannot remain 'pending' after execution
        if (task.id) {
          await taskIntegration.ensureActivated(task.id);
        }

        // Execute the task through the enhanced reactive executor
        const result = await reactiveExecutor.executeTask(task);

        if (result.success) {
          return {
            success: true,
            message: 'Task executed successfully',
            result,
          };
        }
        console.error(
          `[Executor] Task execution failed: ${task.title || task.id}`,
          result.error
        );
        return {
          success: false,
          message: result.error || 'Task execution failed',
          result,
        };
      } catch (error) {
        console.error(
          `[Executor] Task execution error: ${task.title || task.id}`,
          error
        );
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  },
};

// Initialize server configuration
const serverConfig = new ServerConfiguration({
  port: process.env.PORT ? parseInt(process.env.PORT) : 3002,
  enableCORS: true,
  enableMCP: true,
  mcpConfig: {
    mcpServerPort: process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : 3010,
    registryEndpoint: process.env.MEMORY_ENDPOINT || 'http://localhost:3001',
    botEndpoint: process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005',
  },
});

// Setup event listeners
taskIntegration.on('taskAdded', (task) => {
  if (isVerbose()) {
    console.log(`[TaskIntegration] Task added: ${task.title} (${task.id})`);
  }
});

taskIntegration.on(
  'taskProgressUpdated',
  ({ task, oldProgress, oldStatus }) => {
    if (isVerbose()) {
      console.log(
        `[TaskIntegration] Progress: ${task.title} ${Math.round(task.progress * 100)}% (${oldStatus} -> ${task.status})`
      );
    }
  }
);

// Forward task lifecycle events to cognition service for LLM task review.
// Events: completed, failed, high_priority_added, solver_unavailable, rig_g_replan_needed
const cognitionEndpoint =
  process.env.COGNITION_ENDPOINT || 'http://localhost:3003';
taskIntegration.on(
  'taskLifecycleEvent',
  (event: { type: string; taskId: string; task?: any; reason?: string }) => {
    const reason = `${event.type}: task ${event.taskId}${event.reason ? ` (${event.reason})` : ''}`;

    // Register failed task categories so the thought-to-task converter
    // can suppress creation of identical tasks during the cooldown window.
    if (event.type === 'failed' && event.task) {
      registerFailedTaskCategory(event.task);

      // LoopBreaker: record at the true terminal surface — task lifecycle 'failed'.
      // This captures PlanRoute:unplannable, blocked_invalid_ir_bundle, and all other
      // failure modes that terminate tasks without reaching executor blocking points.
      const meta = (event.task.metadata ?? {}) as Record<string, unknown>;
      const solverMeta = meta.solver as Record<string, unknown> | undefined;
      const blockedReason = (meta.blockedReason as string)
        || (solverMeta?.noStepsReason as string)
        || 'unknown';
      const routeBackend = solverMeta?.routeBackend as string | undefined;
      const loopSig = buildFailureSignature({
        category: 'task_terminal',
        blockedReason,
        leaf: routeBackend,  // carry route backend as discriminator
      });
      const runId = ((meta.goldenRun as Record<string, unknown> | undefined)?.runId) as string | undefined;
      const episode = getLoopBreaker().recordFailure(loopSig, { taskId: event.taskId, runId });
      if (episode && runId) { getGoldenRunRecorder().recordLoopDetected(runId, episode); }
      if (runId) { getGoldenRunRecorder().markLoopBreakerEvaluated(runId); }
    }

    fetch(`${cognitionEndpoint}/api/task-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
      signal: AbortSignal.timeout(5000),
    }).catch((err: unknown) => {
      // Fire-and-forget: cognition service might not be running
      console.warn(
        '[Lifecycle→Review] Failed to notify cognition:',
        String(err)
      );
    });
  }
);

// Reflex completion dispatch: route task terminal events to the correct
// controller via the registry. No builder-specific switch statements.
// Adding a new reflex requires zero changes here. (P4)
taskIntegration.on(
  'taskLifecycleEvent',
  async (event: { type: string; taskId: string; task?: any; reason?: string }) => {
    if (!global.reflexRegistry) return;
    if (event.type !== 'completed' && event.type !== 'failed') return;
    if (!event.task?.metadata?.taskProvenance?.builder) return;

    try {
      const afterState = global.botStateCache
        ? await global.botStateCache.get()
        : await getBotState().catch(() => null);

      global.reflexRegistry.onTaskTerminal(event.task, afterState);

      // Golden run recording for hunger proof bundles (backward-compatible)
      if (event.task.metadata.taskProvenance.builder === 'hunger-driveshaft-controller') {
        const reflexInstanceId = event.task.metadata.reflexInstanceId as string | undefined;
        if (reflexInstanceId && global.hungerDriveshaft) {
          // Proof bundle was already built by onTaskTerminal — check if it was recorded
          // The accumulator is consumed by buildProofBundle, so if it's gone, the bundle was built
          const accumulator = global.hungerDriveshaft.getAccumulator(reflexInstanceId);
          if (!accumulator) {
            // Bundle was built and accumulator consumed — check golden run
            const goldenRunId = (event.task.metadata as any)?.goldenRun?.runId as string | undefined;
            if (goldenRunId) {
              // The proof bundle is built inside onTaskTerminal; we log here for observability
            }
          }
        }
      }

      // Golden run recording for exploration evidence
      if (event.task.metadata.taskProvenance.builder === 'exploration-driveshaft-controller') {
        const reflexInstanceId = event.task.metadata.reflexInstanceId as string | undefined;
        if (reflexInstanceId && global.explorationDriveshaft) {
          const evidence = global.explorationDriveshaft.getEvidence(reflexInstanceId);
          if (evidence) {
            const goldenRunId = (event.task.metadata as any)?.goldenRun?.runId as string | undefined;
            if (goldenRunId) {
              const recorder = getGoldenRunRecorder();
              recorder.recordExplorationEvidence(goldenRunId, evidence);
            }
          }
        }
      }
    } catch (error) {
      // Fail-closed: never affect task completion semantics
      console.warn('[Reflex] Completion dispatch failed:', error);
    }
  }
);

// Expose world state manager data for world server
serverConfig.addEndpoint('get', '/world-state', (req, res) => {
  try {
    const snapshot = worldStateManager.getSnapshot();
    res.json(snapshot);
  } catch (error) {
    console.error('Failed to get world state:', error);
    res.status(500).json({ error: 'Failed to get world state' });
  }
});

// Hunger driveshaft diagnostics endpoint
serverConfig.addEndpoint('get', '/reflexes/hunger/status', (_req, res) => {
  const driveshaft = global.hungerDriveshaft;
  if (!driveshaft) {
    res.json({
      initialized: false,
      reason: 'ENABLE_AUTONOMY_REFLEXES not set or initialization failed',
    });
    return;
  }
  res.json({
    initialized: true,
    armed: driveshaft.isArmed(),
    config: {
      triggerThreshold: Number(process.env.HUNGER_TRIGGER_THRESHOLD || 12),
      resetThreshold: Number(process.env.HUNGER_RESET_THRESHOLD || 16),
      criticalThreshold: Number(process.env.HUNGER_CRITICAL_THRESHOLD || 5),
    },
    executorMode: process.env.EXECUTOR_MODE || 'shadow',
  });
});

// Reflex lifecycle events endpoint (P6) — paginated
serverConfig.addEndpoint('get', '/reflexes/lifecycle-events', (req, res) => {
  if (!global.reflexEmitter) {
    res.json({ events: [], message: 'Reflex system not initialized' });
    return;
  }
  const since = Number(req.query.since || 0);
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const events = global.reflexEmitter.getEventsSince(since, limit);
  res.json({ events, count: events.length });
});

// Reflex registry status endpoint
serverConfig.addEndpoint('get', '/reflexes/status', (_req, res) => {
  if (!global.reflexRegistry) {
    res.json({
      initialized: false,
      reason: 'ENABLE_AUTONOMY_REFLEXES not set or initialization failed',
    });
    return;
  }
  const registered = global.reflexRegistry.getRegistered();
  res.json({
    initialized: true,
    reflexes: registered.map((r: any) => ({
      name: r.name,
      priority: r.priority,
      canPreempt: r.canPreempt,
      ...(r.name === 'exploration' && global.explorationDriveshaft ? {
        armed: global.explorationDriveshaft.isArmed(),
        idleTicks: global.explorationDriveshaft.getIdleTicks(),
      } : {}),
      ...(r.name.includes('hunger') && global.hungerDriveshaft ? {
        armed: global.hungerDriveshaft.isArmed(),
      } : {}),
    })),
    registrySize: registered.length,
    executorMode: process.env.EXECUTOR_MODE || 'shadow',
  });
});

// Metadata drops diagnostics endpoint (P11)
serverConfig.addEndpoint('get', '/reflexes/diagnostics/metadata-drops', (_req, res) => {
  res.json({ count: global.metadataDropCount ?? 0 });
});

// Sterling health endpoint
serverConfig.addEndpoint('get', '/sterling/health', (_req, res) => {
  if (!sterlingService) {
    res.json({ available: false, reason: 'Sterling service not initialized' });
    return;
  }
  const health = sterlingService.getHealthStatus();
  res.json({ available: health.connected && health.enabled, ...health });
});

// Sterling crafting solve endpoint (for direct testing)
serverConfig.addEndpoint(
  'post',
  '/sterling/crafting/solve',
  async (req, res) => {
    if (!minecraftCraftingSolver) {
      res.status(503).json({ error: 'Crafting solver not initialized' });
      return;
    }

    try {
      const {
        goalItem,
        inventory,
        nearbyBlocks,
        mcData: clientMcData,
      } = req.body;
      if (!goalItem) {
        res.status(400).json({ error: 'goalItem is required' });
        return;
      }

      const inventoryItems = Array.isArray(inventory)
        ? inventory
        : Object.entries(inventory || {}).map(([name, count]) => ({
            name,
            count: count as number,
          }));

      // Load mcData server-side if not provided by client
      let mcData = clientMcData;
      if (!mcData || Object.keys(mcData).length === 0) {
        mcData = taskIntegration.getMcDataPublic();
        if (!mcData) {
          res
            .status(500)
            .json({ error: 'minecraft-data not available on server' });
          return;
        }
      }

      const result = await minecraftCraftingSolver.solveCraftingGoal(
        goalItem,
        inventoryItems,
        mcData,
        nearbyBlocks || []
      );

      const taskSteps = minecraftCraftingSolver.toTaskSteps(result);
      res.json({ ...result, taskSteps });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// Sterling building solve-with-prerequisites endpoint
// Orchestrates building solve + prerequisite crafting solves in a single request.
// When the building solve detects a material deficit (needsMaterials), this endpoint
// automatically resolves prerequisites via sequential crafting solves with inventory
// accumulation, returning a unified response with real graph data from both domains.
serverConfig.addEndpoint(
  'post',
  '/sterling/building/solve-with-prerequisites',
  async (req, res) => {
    if (!minecraftBuildingSolver) {
      res.status(503).json({ error: 'Building solver not initialized' });
      return;
    }

    try {
      const {
        modules,
        goalModules,
        inventory,
        siteState,
        templateId = 'dashboard_build',
        facing = 'N',
        includePrereqGraphs = true,
      } = req.body;

      if (!modules || !Array.isArray(modules) || modules.length === 0) {
        res.status(400).json({ error: 'modules array is required' });
        return;
      }
      if (!goalModules || !Array.isArray(goalModules) || goalModules.length === 0) {
        res.status(400).json({ error: 'goalModules array is required' });
        return;
      }

      const startTime = Date.now();

      // Compute inputs digest for staleness detection
      const sortedInventory = Object.keys(inventory || {}).sort().reduce(
        (acc: Record<string, number>, key) => { acc[key] = inventory[key]; return acc; },
        {}
      );
      const sortedModuleIds = (modules as Array<{ moduleId: string }>)
        .map((m) => m.moduleId)
        .sort();
      const { createHash } = await import('node:crypto');
      const inputsDigest = createHash('sha256')
        .update(JSON.stringify(sortedInventory) + JSON.stringify(sortedModuleIds))
        .digest('hex')
        .slice(0, 16);

      // 1. Run building solve
      const buildResult = await minecraftBuildingSolver.solveBuildingPlan(
        templateId,
        facing,
        goalModules,
        inventory || {},
        siteState || { terrain: 'flat', biome: 'plains', hasTreesNearby: false, hasWaterNearby: false, siteCaps: 'flat_16x16_clear' },
        modules,
      );

      const runId = `bsolve-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Build response shape
      const response: Record<string, unknown> = {
        runId,
        inputsDigest,
        building: {
          solved: buildResult.solved,
          steps: buildResult.steps,
          totalNodes: buildResult.totalNodes,
          durationMs: buildResult.durationMs,
          // Graph data comes from the solver's underlying SterlingSolveResult
          // The building solver returns totalNodes from discoveredNodes.length,
          // but we don't have direct access to the raw graph here.
          // For the building domain, graph data is streamed via WS (hybrid approach).
        },
        taskSteps: minecraftBuildingSolver.toTaskStepsWithReplan(buildResult, templateId),
        provenance: {
          source: 'planning-service',
          buildingSolverId: 'minecraft-building-solver',
          timestamp: Date.now(),
        },
      };

      // 2. Compute material deficit (TypeScript-side, independent of Python backend)
      // Sum materialsNeeded across all goal modules and compare against inventory
      let deficit: Record<string, number> = {};
      let blockedModules: string[] = [];
      if (buildResult.needsMaterials) {
        // Prefer Python-computed deficit if available
        deficit = buildResult.needsMaterials.deficit;
        blockedModules = buildResult.needsMaterials.blockedModules;
      } else {
        // TypeScript-side deficit detection: sum materials across goal modules
        const totalNeeded: Record<string, number> = {};
        const inv = inventory || {};
        for (const mod of (modules as Array<{ moduleId: string; materialsNeeded?: Array<{ name: string; count: number }> }>)) {
          if (goalModules.includes(mod.moduleId) && mod.materialsNeeded) {
            for (const mat of mod.materialsNeeded) {
              totalNeeded[mat.name] = (totalNeeded[mat.name] || 0) + mat.count;
            }
          }
        }
        for (const [item, needed] of Object.entries(totalNeeded)) {
          const have = (inv as Record<string, number>)[item] || 0;
          if (have < needed) {
            deficit[item] = needed - have;
            // Track which modules need this material
            for (const mod of (modules as Array<{ moduleId: string; materialsNeeded?: Array<{ name: string; count: number }> }>)) {
              if (goalModules.includes(mod.moduleId) && mod.materialsNeeded?.some(m => m.name === item)) {
                if (!blockedModules.includes(mod.moduleId)) {
                  blockedModules.push(mod.moduleId);
                }
              }
            }
          }
        }
      }

      const hasDeficit = Object.keys(deficit).length > 0;
      if (hasDeficit && minecraftCraftingSolver) {

        // Load mcData server-side
        let mcData = taskIntegration.getMcDataPublic();
        if (!mcData) {
          // Can't resolve prerequisites without mcData — return building result with deficit info
          response.prerequisites = {
            deficit,
            blockedModules,
            chains: [],
            totalDurationMs: 0,
            error: 'minecraft-data not available on server for prerequisite resolution',
          };
          res.json(response);
          return;
        }

        // Sequential solves with inventory accumulation (Option A: simpler)
        // Start with the provided inventory, add produced items after each solve
        const workingInventory = { ...(inventory || {}) };
        const chains: Array<Record<string, unknown>> = [];
        const prereqStartTime = Date.now();

        // Deduplicate: track items already produced as intermediates
        const producedItems = new Set<string>();

        for (const [goalItem, count] of Object.entries(deficit)) {
          // Skip if already produced as an intermediate in a previous solve
          if (producedItems.has(goalItem) && (workingInventory[goalItem] || 0) >= (count as number)) {
            chains.push({
              goalItem,
              count,
              solved: true,
              steps: [],
              durationMs: 0,
              skippedReason: 'already_produced_as_intermediate',
            });
            continue;
          }

          const inventoryItems = Object.entries(workingInventory).map(
            ([name, cnt]) => ({ name, count: cnt as number })
          );

          try {
            const craftResult = await minecraftCraftingSolver.solveCraftingGoal(
              goalItem,
              inventoryItems,
              mcData,
              [], // nearbyBlocks — not available from dashboard context
            );

            const chain: Record<string, unknown> = {
              goalItem,
              count,
              solved: craftResult.solved,
              steps: craftResult.steps.map((step) => ({
                action: step.action,
                actionType: step.actionType,
                produces: step.produces,
                consumes: step.consumes,
              })),
              durationMs: craftResult.durationMs,
            };

            if (craftResult.error) {
              chain.error = craftResult.error;
            }

            // Include real graph data from crafting solve if requested
            if (includePrereqGraphs && craftResult.solveMeta?.bundles?.[0]) {
              // The crafting solver's SterlingSolveResult graph data isn't directly
              // exposed on the result type. We include what's available via solveMeta.
              chain.solveMeta = craftResult.solveMeta;
            }

            chains.push(chain);

            // Accumulate produced items into working inventory
            if (craftResult.solved) {
              for (const step of craftResult.steps) {
                for (const produced of step.produces) {
                  workingInventory[produced.name] = (workingInventory[produced.name] || 0) + produced.count;
                  producedItems.add(produced.name);
                }
                for (const consumed of step.consumes) {
                  workingInventory[consumed.name] = Math.max(
                    0,
                    (workingInventory[consumed.name] || 0) - consumed.count
                  );
                }
              }
            }
          } catch (error) {
            chains.push({
              goalItem,
              count,
              solved: false,
              steps: [],
              durationMs: 0,
              error: error instanceof Error ? error.message : 'Unknown crafting solve error',
            });
          }
        }

        // Compute final inventory: only include items with count > 0
        const finalInventory: Record<string, number> = {};
        for (const [item, count] of Object.entries(workingInventory)) {
          if ((count as number) > 0) {
            finalInventory[item] = count as number;
          }
        }

        response.prerequisites = {
          deficit,
          blockedModules,
          chains,
          totalDurationMs: Date.now() - prereqStartTime,
          finalInventory,
        };

        (response.provenance as Record<string, unknown>).craftingSolverId = 'minecraft-crafting-solver';

        // Regenerate task steps to include prerequisite acquisition
        response.taskSteps = minecraftBuildingSolver.toTaskStepsWithReplan(buildResult, templateId);
      }

      res.json(response);
    } catch (error) {
      console.error('[solve-with-prereqs] ERROR:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// Emergency stop endpoint
serverConfig.addEndpoint('get', '/executor/health', (_req, res) => {
  const systemReadyState = getSystemReadyState();
  res.json({
    executorStartState,
    lastProbeResult: executorLastProbeResult,
    systemReady: systemReadyState,
  });
});

serverConfig.addEndpoint('post', '/executor/stop', (_req, res) => {
  const token = process.env.EXECUTOR_EMERGENCY_TOKEN;
  if (
    token &&
    (_req.headers as Record<string, string | undefined>)[
      'x-emergency-token'
    ] !== token
  ) {
    res.status(403).json({ error: 'Invalid emergency token' });
    return;
  }
  emergencyStopExecutor();
  res.json({ success: true, message: 'Executor stopped' });
});

// Main server startup function
async function startServer() {
  try {
    // Initialize event-driven thought generator
    try {
      const { eventDrivenThoughtGenerator: generator } =
        await import('@conscious-bot/cognition');
      eventDrivenThoughtGenerator = generator;
    } catch (error) {
      console.warn(
        'Failed to initialize event-driven thought generator:',
        error
      );
    }

    // NOTE: IdleEngine initialization has been MOVED to after
    // createSterlingBootstrap() below. The old placement here (before
    // sterling-bootstrap) was load-bearingly wrong: sterling-bootstrap
    // is what calls `setDefaultTransport(sterlingTransportAdapter)` and
    // `setDefaultLanguageIOClient(new SterlingLanguageIOClient())`, so
    // calling `getDefaultLanguageIOClient()` BEFORE sterling-bootstrap
    // runs returns a client whose transport is still the stock
    // MockLanguageIOTransport. IdleEngine would then hold a reference
    // to the mock-wired client and every `requestGoal` would hit the
    // mock's "semantically empty" fall-through, producing `no_policy`
    // decisions with reason='No committed goal (no explicit [GOAL: ...]
    // tag found)'. Discovered during Phase 2 runtime verification (4th
    // capture capture file bfqzofrv0).

    // Initialize reflex system (gated by ENABLE_AUTONOMY_REFLEXES)
    if (process.env.ENABLE_AUTONOMY_REFLEXES === 'true') {
      try {
        // Shared lifecycle emitter for all reflexes
        global.reflexEmitter = new RecordingLifecycleEmitter();
        global.metadataDropCount = 0;

        // BotState cache: at most one HTTP fetch per tick (TTL < tick interval)
        global.botStateCache = new BotStateCache(
          () => getBotState() as any,
          4000,
        );

        // Registry: single evaluateTick() entry point
        global.reflexRegistry = new ReflexRegistry(global.botStateCache);

        // Hunger driveshaft controller
        global.hungerDriveshaft = new HungerDriveshaftController({
          triggerThreshold: Number(process.env.HUNGER_TRIGGER_THRESHOLD || 12),
          resetThreshold: Number(process.env.HUNGER_RESET_THRESHOLD || 16),
          criticalThreshold: Number(process.env.HUNGER_CRITICAL_THRESHOLD || 5),
          emitter: global.reflexEmitter,
        });

        // Register hunger-critical (preemptable, highest priority)
        global.reflexRegistry.register({
          name: 'hunger-critical',
          priority: 0,
          canPreempt: true,
          evaluate: async (botState: any, _idleReason: any, opts: any) => {
            if (botState.food === undefined) return null;
            const state = { food: botState.food, inventory: botState.inventory ?? [] };
            if (!global.hungerDriveshaft.isCritical(state)) return null;
            const result = await global.hungerDriveshaft.evaluate(state, 'no_tasks', opts);
            return result ? { ...result, builderName: 'hunger-driveshaft-controller' } : null;
          },
          onEnqueued: (rid: string, tid: string, gid: string) => global.hungerDriveshaft.emitTaskEnqueued(rid, tid, gid),
          onSkipped: (rid: string, gid: string, reason: string) => global.hungerDriveshaft.emitTaskEnqueueSkipped(rid, gid, reason),
          onTaskTerminal: (task: any, afterState: any) => {
            const rid = task.metadata?.reflexInstanceId;
            if (!rid) return;
            const acc = global.hungerDriveshaft.getAccumulator(rid);
            if (!acc) return;
            const bundle = global.hungerDriveshaft.buildProofBundle(acc, {
              result: task.status === 'completed' ? 'ok' : 'error',
              receipt: task.metadata?.executionReceipt ?? {},
              taskId: task.id,
            }, afterState ? {
              food_after: afterState.food,
              inventory_after: afterState.inventory ?? [],
            } : null);
            // Record to golden run if active
            const goldenRunId = (task.metadata as any)?.goldenRun?.runId as string | undefined;
            if (goldenRunId) {
              getGoldenRunRecorder().recordReflexProof(goldenRunId, bundle);
            }
          },
        });

        // Register hunger-idle (not preemptable, medium priority)
        global.reflexRegistry.register({
          name: 'hunger',
          priority: 10,
          canPreempt: false,
          evaluate: async (botState: any, idleReason: any, opts: any) => {
            if (botState.food === undefined) return null;
            const result = await global.hungerDriveshaft.evaluate(
              { food: botState.food, inventory: botState.inventory ?? [] },
              idleReason ?? 'no_tasks',
              opts,
            );
            return result ? { ...result, builderName: 'hunger-driveshaft-controller' } : null;
          },
          onEnqueued: (rid: string, tid: string, gid: string) => global.hungerDriveshaft.emitTaskEnqueued(rid, tid, gid),
          onSkipped: (rid: string, gid: string, reason: string) => global.hungerDriveshaft.emitTaskEnqueueSkipped(rid, gid, reason),
          onTaskTerminal: (task: any, afterState: any) => {
            // Same handler as hunger-critical — shared controller instance
            const rid = task.metadata?.reflexInstanceId;
            if (!rid) return;
            const acc = global.hungerDriveshaft.getAccumulator(rid);
            if (!acc) return;
            const bundle = global.hungerDriveshaft.buildProofBundle(acc, {
              result: task.status === 'completed' ? 'ok' : 'error',
              receipt: task.metadata?.executionReceipt ?? {},
              taskId: task.id,
            }, afterState ? {
              food_after: afterState.food,
              inventory_after: afterState.inventory ?? [],
            } : null);
            const goldenRunId = (task.metadata as any)?.goldenRun?.runId as string | undefined;
            if (goldenRunId) {
              getGoldenRunRecorder().recordReflexProof(goldenRunId, bundle);
            }
          },
        });

        // Exploration driveshaft controller
        global.explorationDriveshaft = new ExplorationDriveshaftController({
          idleTriggerTicks: Number(process.env.EXPLORATION_IDLE_TRIGGER_TICKS || 6),
          cooldownMs: Number(process.env.EXPLORATION_COOLDOWN_MS || 120000),
          minHealth: Number(process.env.EXPLORATION_MIN_HEALTH || 14),
          minFood: Number(process.env.EXPLORATION_MIN_FOOD || 8),
          emitter: global.reflexEmitter,
        });

        global.reflexRegistry.register({
          name: 'exploration',
          priority: 20,
          canPreempt: false,
          evaluate: (botState: any, idleReason: any, opts: any) =>
            global.explorationDriveshaft!.evaluate(botState, idleReason, opts),
          onEnqueued: (rid: string, tid: string, gid: string) =>
            global.explorationDriveshaft!.emitTaskEnqueued(rid, tid, gid),
          onSkipped: (rid: string, gid: string, reason: string, eid?: string) =>
            global.explorationDriveshaft!.emitTaskEnqueueSkipped(rid, gid, reason, eid),
          onTaskTerminal: (task: any, afterState: any) =>
            global.explorationDriveshaft!.onTaskTerminal(task, afterState),
        });

        console.log(`[Planning] Reflex system initialized: ${global.reflexRegistry.getRegistered().length} reflexes registered`);
      } catch (error) {
        console.warn('[Planning] Failed to initialize reflex system:', error);
      }
    }

    // Initialize Sterling reasoning service (optional external dependency)
    const sterling = await createSterlingBootstrap(taskIntegration);
    sterlingService = sterling.sterlingService;
    minecraftCraftingSolver = sterling.minecraftCraftingSolver;
    minecraftBuildingSolver = sterling.minecraftBuildingSolver;
    minecraftToolProgressionSolver = sterling.minecraftToolProgressionSolver;
    minecraftNavigationSolver = sterling.minecraftNavigationSolver;

    // Initialize IdleEngine — Phase 2 of the keep-alive cauterize-and-regrow.
    // Unconditional: no env gate. The class is always constructed because
    // Sterling's _select_idle_goal() is deterministic and IdleEngine is a
    // thin courier around it (no LLM call, ~250 lines, no shared state with
    // other subsystems). If operators need to disable idle-state autonomous
    // goal emission, the call site in the autonomous executor is the place
    // to add a gate, not here.
    //
    // CRITICAL ORDERING: this block MUST run AFTER createSterlingBootstrap()
    // above, because that function is what calls setDefaultTransport() with
    // the real SterlingTransportAdapter AND setDefaultLanguageIOClient()
    // with a pre-connected SterlingLanguageIOClient. Calling
    // getDefaultLanguageIOClient() BEFORE sterling-bootstrap returns a
    // client wired to the stock MockLanguageIOTransport, and every
    // subsequent reduce() call hits the mock's "semantically empty"
    // fall-through. Discovered during Phase 2 runtime verification (see
    // the explanatory comment at the old IdleEngine init site above for
    // the full diagnosis trail).
    try {
      // Dynamic import of the cognition-exported Sterling client. We pass
      // it to IdleEngine via constructor injection so the class stays
      // mockable in tests (IdleEngineClient is a narrow one-method
      // interface) without needing to know about getDefaultLanguageIOClient.
      const { getDefaultLanguageIOClient: getClient } = await import('@conscious-bot/cognition');
      const sterlingClient = getClient();
      // `SterlingLanguageIOClient` starts with `connected: false` and its
      // `reduce()` method early-returns `STERLING_UNAVAILABLE` whenever
      // `isAvailable()` returns false. sterling-bootstrap already called
      // `connect()` on the default client, but we call it again here as
      // an idempotent safety net in case the dynamic import resolved to
      // a different instance. The method is a flag flip with no network
      // work (the transport handles real connections separately).
      await sterlingClient.connect();
      global.idleEngine = new IdleEngine(sterlingClient, {
        minIntervalBetweenRequestsMs: 60_000,
        sterlingReduceTimeoutMs: 12_000,
        modelId: 'idle-episode',
      });
      console.log('[Planning] IdleEngine initialized');
    } catch (error) {
      console.warn('[Planning] Failed to initialize IdleEngine:', error);
      // Not fatal — the onIdle call site checks `global.idleEngine` before
      // calling requestGoal, so a null idleEngine means the executor's
      // idle branch is a no-op (the Phase 1 behavioral floor).
    }

    // Create MCP leaf registry for MCP integration
    const registry = new MCPLeafRegistry();

    // Initialize MCP integration with the registry
    try {
      await serverConfig.initializeMCP(undefined, registry);
      // invalidate leaf cache
      (getAvailableLeaves as any).__cache = undefined;
      (getAvailableLeaves as any).__ts = 0;
      console.log('[Planning] MCP integration initialized');
    } catch (error) {
      console.warn(
        '[Planning] MCP integration failed to initialize, continuing without it:',
        error
      );
    }

    // Connect MCP integration to behavior tree runner for option execution
    try {
      const mcpIntegration = serverConfig.getMCPIntegration();
      if (mcpIntegration) {
        // MCP integration connected to behavior tree runner (verbose logging removed)

        // Add the behavior tree runner to the MCP integration so it can execute options
        (mcpIntegration as any).btRunner = btRunner;

      }
    } catch (error) {
      console.warn(
        '[Planning] Failed to connect MCP integration to behavior tree runner:',
        error
      );
    }

    // ── Planning Event Store (gated by PLANNING_EVENT_STORE=1) ──────
    if (process.env.PLANNING_EVENT_STORE === '1') {
      try {
        const { PlanningEventStore } = await import('./persistence/planning-event-store');
        const worldSeed = process.env.WORLD_SEED || '';
        const store = new PlanningEventStore({
          host: process.env.PG_HOST || 'localhost',
          port: parseInt(process.env.PG_PORT || '5432'),
          user: process.env.PG_USER || 'postgres',
          password: process.env.PG_PASSWORD || '',
          database: process.env.PG_DATABASE || 'conscious_bot',
          worldSeed,
        });
        await store.initialize();
        global.planningEventStore = store;
        console.log('[Planning] Event store initialized');
      } catch (error) {
        console.warn(
          '[Planning] Event store failed to initialize, continuing without persistence:',
          error
        );
      }
    }

    // Register placeholder Minecraft leaves with both the registry and MCP.
    // Placeholder leaves are registration-only; minecraft-interface must register real leaves before execution.
    try {
      const mcpIntegration = serverConfig.getMCPIntegration();
      if (mcpIntegration) {
        // Registering core Minecraft leaves (verbose logging suppressed)

        // Create minimal placeholder LeafImpls so BT options can register and validate

        const makePlaceholder = (
          name: string,
          version: string,
          permissions: Array<
            | 'movement'
            | 'dig'
            | 'place'
            | 'craft'
            | 'sense'
            | 'container.read'
            | 'container.write'
            | 'chat'
          >,
          inputSchema: any = { type: 'object', additionalProperties: true },
          outputSchema: any = {
            type: 'object',
            properties: {
              status: { type: 'string' },
              result: { type: 'object', additionalProperties: true },
            },
            required: ['status'],
            additionalProperties: true,
          }
        ): any => ({
          spec: {
            name,
            version,
            description: `${name} (placeholder)` as any,
            inputSchema,
            outputSchema,
            timeoutMs: 5000,
            retries: 0,
            permissions,
            placeholder: true as const,
          },
          async run() {
            return {
              status: 'failure',
              error: {
                code: 'unknown',
                retryable: false,
                detail: 'placeholder',
              },
              metrics: { durationMs: 0, retries: 0, timeouts: 0 },
            } as any;
          },
        });

        const leaves: any[] = [
          makePlaceholder('move_to', '1.0.0', ['movement']),
          makePlaceholder('step_forward_safely', '1.0.0', ['movement']),
          makePlaceholder('follow_entity', '1.0.0', ['movement']),
          makePlaceholder('dig_block', '1.0.0', ['dig']),
          makePlaceholder('place_block', '1.0.0', ['place']),
          makePlaceholder('place_workstation', '1.0.0', ['place']),
          makePlaceholder('place_torch_if_needed', '1.0.0', ['place']),
          makePlaceholder('retreat_and_block', '1.0.0', ['place']),
          makePlaceholder('consume_food', '1.0.0', ['sense']),
          makePlaceholder('sense_hostiles', '1.0.0', ['sense']),
          makePlaceholder('chat', '1.0.0', ['chat']),
          makePlaceholder('wait', '1.0.0', ['sense']),
          makePlaceholder('get_light_level', '1.0.0', ['sense']),
          makePlaceholder('craft_recipe', '1.1.0', ['craft']),
          makePlaceholder('smelt', '1.1.0', ['craft']),
        ];

        // Provenance for dev builds
        const provenance = {
          author: 'system',
          codeHash: 'dev',
          createdAt: new Date().toISOString(),
        };

        // Also register with MCP's leaf factory so tools surface correctly
        let registered = 0;
        for (const leaf of leaves) {
          try {
            // Register in governance registry (active status for now)
            registry.registerLeaf(leaf.spec?.name || 'unknown', leaf as any);
            // Register with MCP integration for tool hydration
            const ok = await mcpIntegration.registerLeaf(leaf as any);
            if (ok) registered++;
          } catch (err) {
            console.warn(
              `[Planning] Failed to register leaf ${
                (leaf as any)?.spec?.name || 'unknown'
              }:`,
              err
            );
          }
        }

        console.log(`Registered ${registered} core leaves in planning`);
      }
    } catch (e) {
      console.warn('[Planning] Core leaf registration failed:', e);
    }

    // Mount planning endpoints (getServerBanner wires golden-run banner capture via WS server_info_v1)
    const planningRouter = createPlanningEndpoints(planningSystem, {
      getServerBanner: (timeoutMs?: number) =>
        sterlingService?.getServerBanner(timeoutMs) ?? Promise.resolve(null),
      sendLanguageIOReduce: (envelope, timeoutMs) =>
        sterlingService?.sendLanguageIOReduce(envelope, timeoutMs) ??
        Promise.resolve({ success: false, error: 'Sterling not connected — start it from ../sterling' }),
      getTaskInventory: () => {
        const all = taskIntegration.getTasks();
        const counts: Record<string, number> = {};
        let visibleToExecutor = 0;
        for (const t of all) {
          const s = t.status ?? 'unknown';
          counts[s] = (counts[s] ?? 0) + 1;
          if (s === 'active' || s === 'pending') visibleToExecutor++;
        }
        return {
          counts,
          total: all.length,
          visibleToExecutor,
        };
      },
      flushSmokeTasks: () => {
        const all = taskIntegration.getTasks();
        const flushed: Record<string, number> = {};
        for (const t of all) {
          const meta = t.metadata as Record<string, unknown> | undefined;
          const isSmoke =
            meta?.source === 'sterling-smoke' ||
            (Array.isArray(meta?.tags) && (meta.tags as string[]).includes('dev-sterling-smoke'));
          if (!isSmoke) continue;

          const prev = t.status ?? 'unknown';
          // Mark non-terminal smoke tasks as failed so executor drops them.
          if (prev === 'active' || prev === 'pending' || prev === 'pending_planning') {
            taskIntegration.updateTaskProgress(t.id, 0, 'failed');
          }
          flushed[prev] = (flushed[prev] ?? 0) + 1;
        }
        // Reset rate limiter so the sliding window is clear for the next run.
        stepRateLimiter.reset();
        return { flushed, rateLimiterReset: true };
      },
    });
    serverConfig.mountRouter('/', planningRouter);

    // ── Event store diagnostics endpoint ────────────────────────────
    const { Router: EventStoreRouter } = await import('express');
    const eventStoreRouter = EventStoreRouter();
    eventStoreRouter.get('/event-store/status', (_req: any, res: any) => {
      if (!global.planningEventStore) {
        return res.json({
          enabled: false,
          initialized: false,
          error: null,
          database: null,
        });
      }
      return res.json(global.planningEventStore.getStatus());
    });
    serverConfig.mountRouter('/', eventStoreRouter);

    // ── Scenario execution endpoint ─────────────────────────────────
    // POST /api/scenario/run — inject a scenario objective through an
    // approved planner authority. Two authorities:
    //   planner: "sterling" — goal decomposition via Sterling solver
    //   planner: "fallback-macro" — direct primitive step (no solver)
    //
    // Returns: run_id, task_id, authority, objective, steps
    // The task enters the same executor dispatch path as production tasks.
    const { Router: ScenarioRouter } = await import('express');
    const scenarioRouter = ScenarioRouter();

    scenarioRouter.post('/api/scenario/run', async (req: any, res: any) => {
      try {
        const {
          planner,     // "sterling" | "fallback-macro"
          objective,   // { goal: "stone_pickaxe" } | { action: "acquire_material", item: "stone", count: 3 }
          scenarioId,
        } = req.body || {};

        // Clear all existing tasks — scenario harness is sole execution authority
        const activeTasks = taskIntegration.getActiveTasks();
        for (const t of activeTasks) {
          try {
            taskIntegration.updateTaskProgress(t.id, t.progress || 0, 'failed');
            taskIntegration.updateTaskMetadata(t.id, {
              failReason: 'scenario_preempted',
              blockedReason: 'Preempted by certification scenario',
            });
          } catch { /* best-effort */ }
        }
        if (activeTasks.length > 0) {
          console.log(`[Scenario] Preempted ${activeTasks.length} active tasks`);
        }

        // Validate envelope
        if (!planner || !objective) {
          return res.status(400).json({
            success: false,
            error: 'Required: { planner: "sterling"|"fallback-macro", objective: {...}, scenarioId: "SCN-xxx" }',
          });
        }
        if (planner !== 'sterling' && planner !== 'fallback-macro') {
          return res.status(400).json({
            success: false,
            error: `Invalid planner: "${planner}". Must be "sterling" or "fallback-macro"`,
          });
        }

        const runId = `cert-${scenarioId || 'manual'}-${Date.now()}`;

        // Build a requirementCandidate that resolveRequirement() understands.
        // This is the canonical structured format that the planner uses.
        let requirementCandidate: Record<string, unknown>;
        let taskTitle: string;

        if (planner === 'fallback-macro') {
          // Direct primitive: { action: "acquire_material", item: "stone", count: 3 }
          const { action, item, count = 1 } = objective;
          if (!action || !item) {
            return res.status(400).json({ success: false, error: 'Fallback-macro requires objective.action and objective.item' });
          }
          // Map action to requirement kind
          const kindMap: Record<string, string> = {
            acquire_material: 'mine',
            dig_block: 'mine',
            collect_items: 'collect',
            craft_recipe: 'craft',
          };
          const kind = kindMap[action] || 'mine';
          requirementCandidate = kind === 'craft'
            ? { kind, outputPattern: item, quantity: count }
            : { kind, outputPattern: item, patterns: [item], quantity: count };
          taskTitle = `[cert] ${action} ${item} x${count}`;

        } else {
          // Sterling: { goal: "stone_pickaxe" }
          // Route through the same planner path as production tasks.
          // Use 'craft' requirement kind — generateDynamicSteps will call
          // generateStepsFromSterling which calls the Sterling solver.
          const { goal } = objective;
          if (!goal) {
            return res.status(400).json({ success: false, error: 'Sterling planner requires objective.goal' });
          }
          requirementCandidate = {
            kind: 'craft',
            outputPattern: goal,
            quantity: 1,
          };
          taskTitle = `[cert] ${goal}`;
        }

        // Create task with structured requirement.
        // For fallback-macro: generateDynamicSteps → requirementToFallbackPlan
        // For sterling: generateDynamicSteps → generateStepsFromSterling → solver
        // Type determines which planner path addTask uses:
        // 'mining' → generateDynamicSteps → requirementToFallbackPlan (fallback-macro)
        // 'crafting' → generateDynamicSteps → generateStepsFromSterling (sterling solver)
        const taskType = planner === 'sterling' ? 'crafting' : 'mining';
        const taskData: Record<string, any> = {
          title: taskTitle,
          description: `${taskTitle} (${planner})`,
          type: taskType,
          priority: 1.0,
          urgency: 1.0,
          source: 'scenario-harness',
          parameters: {
            scenarioId,
            runId,
            requirementCandidate,
          },
          metadata: {
            category: 'scenario',
            tags: ['scenario', 'certification', scenarioId, planner].filter(Boolean),
            scenarioAuthority: planner,
            scenarioRunId: runId,
          },
        };

        const addedTask = await taskIntegration.addTask(taskData as any);
        const finalTaskId = addedTask?.id || `scenario-${runId}`;

        // Promote to active so the executor dispatches it immediately.
        // addTask leaves non-sterling_ir tasks in 'pending' status, but
        // scenario tasks have pre-expanded steps and should be active.
        if (addedTask && addedTask.status === 'pending' && addedTask.steps?.length > 0) {
          (addedTask as any).status = 'active';
        }

        console.log(
          `[Scenario] run_id=${runId} task_id=${finalTaskId} authority=${planner} ` +
          `requirement=${JSON.stringify(requirementCandidate).slice(0, 100)}`
        );

        res.json({
          success: true,
          run_id: runId,
          task_id: finalTaskId,
          authority: planner,
          planner,
          objective,
          requirement: requirementCandidate,
          title: taskTitle,
        });
      } catch (error) {
        console.error('[Scenario] Run failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    serverConfig.mountRouter('/', scenarioRouter);

    // Navigation solve endpoint
    // Follows Option A: planning server owns the full scan→solve pipeline.
    // Leaf calls POST /solve-navigation → planning calls /world-scan on mc-interface
    // → planning calls Sterling → returns primitives to leaf.
    const { Router: ExpressRouter } = await import('express');
    const navRouter = ExpressRouter();
    navRouter.post('/solve-navigation', async (req: any, res: any) => {
      try {
        if (!minecraftNavigationSolver) {
          return res.status(503).json({
            solved: false,
            primitives: [],
            error: 'Navigation solver not initialized (Sterling unavailable)',
          });
        }

        const {
          start,
          goal,
          toleranceXZ = 1,
          toleranceY = 0,
          scanMargin = 5,
        } = req.body;

        if (!start || !goal) {
          return res.status(400).json({
            solved: false,
            primitives: [],
            error: 'Missing start or goal position',
          });
        }

        // 1. Fetch world scan from mc-interface
        const sx = Math.floor(start.x);
        const sy = Math.floor(start.y);
        const sz = Math.floor(start.z);
        const gx = Math.floor(goal.x);
        const gy = Math.floor(goal.y);
        const gz = Math.floor(goal.z);

        // Compute bounding box that covers both start and goal with margin
        const minX = Math.min(sx, gx) - scanMargin;
        const minY = Math.min(sy, gy) - 3; // 3 blocks below for descend legality
        const minZ = Math.min(sz, gz) - scanMargin;
        const maxX = Math.max(sx, gx) + scanMargin;
        const maxY = Math.max(sy, gy) + 5; // 5 blocks above for jump clearance
        const maxZ = Math.max(sz, gz) + scanMargin;

        let gridData: any;
        try {
          const scanResp = await mcFetch(
            `/world-scan?x1=${minX}&y1=${minY}&z1=${minZ}&x2=${maxX}&y2=${maxY}&z2=${maxZ}`
          );
          gridData = await scanResp.json();
        } catch (e: any) {
          return res.status(502).json({
            solved: false,
            primitives: [],
            error: `World scan failed: ${e?.message ?? e}`,
          });
        }

        // 2. Build occupancy grid from scan data
        const dx = maxX - minX + 1;
        const dy = maxY - minY + 1;
        const dz = maxZ - minZ + 1;
        if (!gridData.blocks) {
          return res.status(502).json({
            solved: false,
            primitives: [],
            error: 'World scan returned no block data',
          });
        }
        const occupancyGrid = {
          origin: { x: minX, y: minY, z: minZ },
          size: { dx, dy, dz },
          blocks: new Uint8Array(Buffer.from(gridData.blocks, 'base64')),
        };

        // 3. Call navigation solver
        const result = await minecraftNavigationSolver.solveNavigation(
          { x: sx, y: sy, z: sz },
          { x: gx, y: gy, z: gz },
          occupancyGrid,
          toleranceXZ,
          toleranceY
        );

        return res.json(result);
      } catch (e: any) {
        console.error('[solve-navigation] Error:', e);
        return res.status(500).json({
          solved: false,
          primitives: [],
          error: `Navigation solve error: ${e?.message ?? e}`,
        });
      }
    });
    serverConfig.mountRouter('/', navRouter);

    // Mount MCP endpoints
    const { createMCPEndpoints } = await import('./modules/mcp-endpoints');
    const mcpIntegration = serverConfig.getMCPIntegration();
    if (mcpIntegration) {
      // Expose btRunner to MCP integration so it can execute options locally
      try {
        (mcpIntegration as any).btRunner = btRunner;
      } catch (e) {
        console.error(
          '[MCP] Failed to connect MCP integration to behavior tree runner:',
          e
        );
      }
      const mcpRouter = createMCPEndpoints(mcpIntegration);
      serverConfig.mountRouter('/mcp', mcpRouter);

      // Seed MCP options (permissions inferred by MCP server when possible)
      try {
        // Seed default MCP options (verbose logging suppressed)

        // Now seed MCP options that use the expected leaves
        const defaultOptions = [
          {
            id: 'gather_wood@1',
            name: 'gather_wood',
            description: 'Gather wood by digging oak_log and picking up drops',
            btDefinition: {
              id: 'gather_wood@1',
              name: 'Gather Wood',
              description: 'Gather wood logs from nearby trees',
              metadata: {
                timeout: 30000,
                retries: 3,
                category: 'gathering',
              },
              root: {
                type: 'sequence',
                name: 'gather_wood_sequence',
                children: [
                  {
                    type: 'action',
                    name: 'find_wood_blocks',
                    action: 'dig_block',
                    args: {
                      blockType: 'log', // Use generic 'log' to find any wood type
                      tool: 'axe',
                    },
                  },
                  {
                    type: 'action',
                    name: 'collect_wood_items',
                    action: 'wait',
                    args: {
                      duration: 2000, // Wait for items to drop
                    },
                  },
                ],
              },
            },
          },
          {
            id: 'craft_wooden_pickaxe@1',
            name: 'craft_wooden_pickaxe',
            description: 'Craft a wooden pickaxe from available materials',
            btDefinition: {
              id: 'craft_wooden_pickaxe@1',
              name: 'Craft Wooden Pickaxe',
              description: 'Craft a wooden pickaxe from available materials',
              root: {
                type: 'sequence',
                children: [
                  {
                    type: 'action',
                    name: 'craft_pickaxe',
                    action: 'craft_recipe',
                    args: { recipe: 'wooden_pickaxe', qty: 1 },
                  },
                ],
              },
              metadata: {
                timeout: 45000,
                retries: 2,
                priority: 'medium',
                interruptible: true,
              },
            },
          },
          {
            id: 'explore_move@1',
            name: 'explore_move',
            description: 'Explore by moving to a target or random nearby point',
            btDefinition: {
              id: 'explore_move@1',
              name: 'Explore and Move',
              description:
                'Explore by moving to a target or random nearby point',
              root: {
                type: 'sequence',
                children: [
                  {
                    type: 'action',
                    name: 'move_to_target',
                    action: 'move_to',
                    args: {},
                  },
                ],
              },
              metadata: {
                timeout: 30000,
                retries: 2,
                priority: 'medium',
                interruptible: true,
              },
            },
          },
        ];

        let registered = 0;
        let promoted = 0;
        const failed: string[] = [];

        for (const opt of defaultOptions) {
          try {
            const reg = await mcpIntegration.registerOption(opt);
            if (reg.success) {
              registered++;

              // Also register the option with the behavior tree runner
              try {
                btRunner.storeInlineDefinition(opt.id, opt.btDefinition);
              } catch (btError) {
                console.warn(
                  `[Planning] Failed to connect option ${opt.name} to BT runner:`,
                  btError
                );
              }

              try {
                const id = (reg.data as string) || opt.id;
                const promo = await mcpIntegration.promoteOption(id);
                if (promo.success) {
                  promoted++;
                }
              } catch {
                // Promotion failure is not critical
              }
            } else {
              failed.push(opt.name);
            }
          } catch (error) {
            failed.push(opt.name);
            console.error(
              `[Planning] Error during MCP option registration for ${opt.name}:`,
              error
            );
          }
        }

        // Summary log
        const optionNames = defaultOptions.map((o) => o.name).join(', ');
        console.log(
          `[Planning] MCP options seeded: ${registered}/${defaultOptions.length} registered, ${promoted} promoted (${optionNames})`
        );
        if (failed.length > 0) {
          console.warn(`[Planning] MCP options failed: ${failed.join(', ')}`);
        }
      } catch (e) {
        console.warn('[Planning] Seeding default MCP options failed:', e);
      }
    }

    // Add error handling
    serverConfig.addErrorHandling();

    // Start the server
    await serverConfig.start();
    console.log('[Planning] Server started successfully');

    // --- Service readiness gate (never blocks boot) ---
    // Centralized config validates EXECUTOR_SKIP_READINESS combinations; throws if invalid.
    let planningConfig: import('./planning-runtime-config').PlanningRuntimeConfig;
    try {
      const { getPlanningRuntimeConfig, logTaskTypeBridgeWarning } =
        await import('./planning-runtime-config');
      planningConfig = getPlanningRuntimeConfig();
      logTaskTypeBridgeWarning();
    } catch (err) {
      console.error('[Planning]', (err as Error).message);
      process.exit(1);
    }
    const skipReadinessForExecutor = planningConfig.capabilities.skipReadiness;
    const readiness = new ReadinessMonitor({
      executionRequired: skipReadinessForExecutor ? [] : ['minecraft'],
    });
    const readinessResult = await readiness.probe();
    setReadinessMonitor(readiness);
    if (skipReadinessForExecutor) {
      markSystemReady('executor_skip_readiness');
    }

    console.log(
      '[Planning:startup] Service readiness:',
      Object.entries(readinessResult.services)
        .map(([name, s]) => `${name}=${s.state}(${s.latencyMs}ms)`)
        .join(', ')
    );
    console.log(
      '[Planning:startup] Executor ready:',
      readinessResult.executorReady
    );

    // Start slow re-probe (state-change logging only)
    const READINESS_PROBE_MS = parseInt(process.env.READINESS_PROBE_INTERVAL_MS || '120000', 10);
    readiness.startMonitoring(READINESS_PROBE_MS);

    // Phase 0 prerequisite for EXECUTOR_MODE=live:
    //   The action-translator dispatch boundary (minecraft-interface executeAction)
    //   must handle every step type that solvers emit. Currently, craft/smelt/building
    //   types fail with "Unknown action type" in executeAction(). Until Phase 0 commits
    //   (0a: add craft/smelt/building cases, 0b: LeafFactory-first dispatch,
    //   0c: boundary conformance test) are merged, live mode will execute actions that
    //   the minecraft-interface silently rejects. Shadow mode is safe regardless.
    if (executorConfig.enabled) {
      initExecutorAbortController();
      console.log(
        `[Planning] Executor enabled (mode=${executorConfig.mode}, ` +
          `maxSteps/min=${executorConfig.maxStepsPerMinute}, ` +
          `leafAllowlist=${executorConfig.leafAllowlist.size} leaves` +
          `${geofenceConfig.enabled ? `, geofence=${geofenceConfig.radius}b around (${geofenceConfig.center.x},${geofenceConfig.center.z})` : ''})`
      );
      console.log(
        `[Pipeline] Cognition: ${process.env.COGNITION_SERVICE_URL || 'http://localhost:3003'}`
      );
      console.log(`[Pipeline] MC interface: ${MC_ENDPOINT}`);

      let executorStarted = false;
      let loggedEnvGate = false;
      const tryStartExecutor = () => {
        if (executorStarted) return;
        const envEnabled = process.env.ENABLE_PLANNING_EXECUTOR === '1';
        const sysReady = isSystemReady();
        const depsReady = readiness.executorReady;
        executorLastProbeResult = {
          systemReady: sysReady,
          depsReady,
          envEnabled,
          at: new Date().toISOString(),
        };
        if (!envEnabled) {
          executorStartState = 'disabled';
          if (!loggedEnvGate) {
            loggedEnvGate = true;
            console.log(
              '[Planning] Executor loop not started: ENABLE_PLANNING_EXECUTOR!=1. ' +
                'Set ENABLE_PLANNING_EXECUTOR=1 to allow dispatch.'
            );
          }
          return;
        }
        if (!sysReady) {
          executorStartState = 'waiting_for_ready';
          return;
        }
        if (!depsReady) {
          executorStartState = 'waiting_for_deps';
          return;
        }
        executorStarted = true;
        executorStartState = 'running';
        console.log(
          '[Planning] Starting executor — system ready and dependencies reachable'
        );

        // Start an audit session so executor audit entries are captured.
        // The session stays open for the executor's lifetime.
        import('@conscious-bot/cognition')
          .then(({ auditLogger }) => {
            auditLogger.startSession('executor-' + Date.now());
          })
          .catch(() => {
            // Audit logging is optional — executor runs without it.
          });

        startAutonomousExecutorScheduler(autonomousTaskExecutor, {
          pollMs: EXECUTOR_POLL_MS,
          maxBackoffMs: EXECUTOR_MAX_BACKOFF_MS,
          breakerOpenMs: BOT_BREAKER_OPEN_MS,
        });
      };

      // Attempt immediate start
      tryStartExecutor();

      if (!executorStarted) {
        console.log(
          '[Planning] Executor enabled but not ready — will start when dependencies are reachable'
        );
        // Re-check when system becomes ready — reprobe immediately so
        // tryStartExecutor() sees fresh readiness instead of the stale
        // initial probe that may have run before MC Interface was up.
        waitForSystemReady().then(async () => {
          await readiness.reprobeNow();
          tryStartExecutor();
        });
        // Re-check when readiness monitor detects a state change
        readiness.onChange(() => tryStartExecutor());

        // Self-healing: fast retry loop probes every 10s until executor starts.
        // Catches the common case where MC interface starts after planning.
        // Stops itself once the executor is running to avoid wasted probes.
        const FAST_RETRY_MS = 10_000;
        const fastRetryTimer = setInterval(async () => {
          if (executorStarted) {
            clearInterval(fastRetryTimer);
            return;
          }
          await readiness.reprobeNow();
          tryStartExecutor();
          if (executorStarted) {
            clearInterval(fastRetryTimer);
          }
        }, FAST_RETRY_MS);
      }
    } else {
      console.log(
        '[Planning] Executor disabled (set ENABLE_PLANNING_EXECUTOR=1 to enable)'
      );
    }

    // Start cognitive thought processor (DISABLED - using event-driven system instead)
    // try {
    //   console.log('Starting cognitive thought processor...');
    //   cognitiveThoughtProcessor.startProcessing();
    // } catch (error) {
    //   console.warn(
    //     '⚠️ Cognitive thought processor failed to start, continuing without it:',
    //     error
    //   );
    // }
    console.log('[Planning] Modular planning server started successfully');
  } catch (error) {
    console.error('[Planning] Failed to start modular planning server:', error);
    process.exit(1);
  }
}

// Export for testing and external use
export {
  serverConfig,
  planningSystem,
  startServer,
  autonomousTaskExecutor,
  cognitiveThoughtProcessor,
  taskIntegration,
  memoryIntegration,
  environmentIntegration,
  liveStreamIntegration,
  sterlingService,
  minecraftCraftingSolver,
};

// Start server if this file is run directly (ESM equivalent of require.main === module)
// For tsx execution, we check if the module URL ends with the filename
// This is more reliable than path comparisons which can vary
const isMainModule =
  import.meta.url.endsWith('modular-server.ts') ||
  import.meta.url.includes('/modular-server.ts');

if (isMainModule) {
  startServer().catch((error) => {
    console.error('Failed to start planning server:', error);
    process.exit(1);
  });
}
