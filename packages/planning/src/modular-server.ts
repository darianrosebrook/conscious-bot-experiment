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
}

/**
 * IDLE-1: Eligibility-based idle detection.
 * Idle events only fire when no tasks are eligible to run, not when activeTasks.length === 0.
 * The idle_reason allows cognition to treat different idle states appropriately.
 */
export type IdleReason =
  | 'no_tasks'           // True cognitive idle (no work exists)
  | 'all_in_backoff'     // Tasks exist but are cooling down
  | 'circuit_breaker_open' // Executor is in protection mode
  | 'blocked_on_prereq'  // Tasks waiting on dependencies
  | 'manual_pause';      // Tasks are manually paused

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
      console.log('✅ Event-driven thought generator initialized');
    } catch (error) {
      console.warn(
        '⚠️ Failed to initialize event-driven thought generator:',
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
import {
  buildTaskFromRequirement,
  computeSubtaskKey,
  type BuildTaskInput,
} from './task-integration/build-task-from-requirement';
import { isDeterministicFailure } from './server/task-action-resolver';

// Extend global interface for rate limiting variables
declare global {
  var lastNoTasksLog: number | undefined;
  var lastTaskCount: number | undefined;
  var lastTaskCountLog: number | undefined;
  var lastMcpWarnLog: number | undefined;
  var lastMcpBotWarnLog: number | undefined;
  var lastConvertedStateLog: number | undefined;
  var lastStateLog: number | undefined;
}

// Import existing components
import { CognitiveIntegration } from './cognitive-integration';
import { BehaviorTreeRunner } from './behavior-trees/BehaviorTreeRunner';
import { CognitiveThoughtProcessor } from './cognitive-thought-processor';
import { createServiceClients, SterlingClient } from '@conscious-bot/core';
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
} from './server/task-block-evaluator';
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
    console.log('System readiness received; starting world state polling');
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

function resolvedRecipe(task: any) {
  return (
    task.parameters?.recipe ||
    inferRecipeFromTitle(task.title) ||
    (/pickaxe/i.test(task.title || '') ? 'wooden_pickaxe' : undefined)
  );
}
function resolvedBlock(task: any) {
  return (
    task.parameters?.blockType ||
    inferBlockTypeFromTitle(task.title) ||
    (/iron/i.test(task.title || '') ? 'iron_ore' : 'oak_log')
  );
}

// Known leaf names (shared across services)
const KNOWN_LEAF_NAMES = new Set([
  // Movement
  'move_to',
  'step_forward_safely',
  'follow_entity',
  'sterling_navigate',
  // Interaction
  'dig_block',
  'acquire_material',
  'place_block',
  'place_torch_if_needed',
  'retreat_and_block',
  'consume_food',
  'sleep',
  'collect_items',
  // Sensing
  'sense_hostiles',
  'chat',
  'wait',
  'get_light_level',
  'find_resource',
  // Crafting
  'craft_recipe',
  'smelt',
  'place_workstation',
  'introspect_recipe',
  // Container
  'open_container',
  'transfer_items',
  'close_container',
  'manage_inventory',
  // Combat
  'attack_entity',
  'equip_weapon',
  'retreat_from_threat',
  'use_item',
  'equip_tool',
  // Farming
  'till_soil',
  'plant_crop',
  'harvest_crop',
  'manage_farm',
  // World interaction
  'interact_with_block',
  'operate_piston',
  'control_redstone',
  'build_structure',
  'control_environment',
  // Construction (P0 stubs)
  'prepare_site',
  'build_module',
  'place_feature',
]);
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
  // Canonical tool names: minecraft.${leaf} — used for both allowlist check and execute()
  cfg.leafAllowlist = new Set(
    [...KNOWN_LEAF_NAMES].map((l) => `minecraft.${l}`)
  );
  return cfg;
})();
const stepRateLimiter = new StepRateLimiter(executorConfig.maxStepsPerMinute);
const geofenceConfig = parseGeofenceConfig();

const executorEventThrottle = new Map<string, number>();
const BUILDING_LEAVES = new Set([
  'prepare_site',
  'build_module',
  'place_feature',
  'building_step',
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

    console.log(
      `[toolExecutor] Executing tool: ${tool} (normalized: ${normalizedTool}) with args:`,
      args
    );

    const startTime = Date.now();
    try {
      // Map BT actions to Minecraft actions
      const mappedAction = mapBTActionToMinecraft(normalizedTool, args);

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

      // Prefer MCP path when available; fall back to direct action only if MCP_ONLY is false
      if (MCP_ONLY) {
        console.warn(
          '⚠️ [toolExecutor] MCP_ONLY=true; toolExecutor will not use direct /action fallback. Set MCP_ONLY=false to enable direct execution.'
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
      const result = await executeActionWithBotCheck(mappedAction, taskId, signal);
      const duration = Date.now() - startTime;

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
  if (n.includes('log')) return { type: 'gathering', blockType: 'oak_log' };
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
    console.log(
      `⏭️ [Prereq] Skipping duplicate: subtaskKey "${key}" already active for parent ${parentTask.id}`
    );
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
 *  Centralizes the prereqInjectionCount check so all call sites get the cap. */
async function injectDynamicPrereqForCraft(task: any): Promise<boolean> {
  // Enforce cap at this layer — all call sites go through here
  const prereqAttempts = (task.metadata as any)?.prereqInjectionCount || 0;
  if (prereqAttempts >= 3) {
    console.log(
      `⛔ [Prereq] Cap reached (${prereqAttempts}/3) for task ${task.id}, refusing injection`
    );
    return false;
  }

  const title = (task.title || '').toLowerCase();
  const recipe =
    task.parameters?.recipe ||
    inferRecipeFromTitle(task.title) ||
    (title.includes('pickaxe') ? 'wooden_pickaxe' : null);
  if (!recipe) return false;
  const injected = await injectNextAcquisitionStep(
    task,
    recipe,
    task.parameters?.qty || 1
  );
  if (injected) {
    // Increment cap counter on successful injection
    taskIntegration.updateTaskMetadata(task.id, {
      prereqInjectionCount: prereqAttempts + 1,
    });
  }
  return injected;
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

/**
 * Extract executable leaf + args from a Sterling-generated task step's meta.
 * Returns null if the step has no machine-readable meta.
 */
function stepToLeafExecution(
  step: any
): { leafName: string; args: Record<string, unknown> } | null {
  const meta = step.meta;
  if (!meta?.leaf) return null;

  // If args were pre-derived at step-creation time, pass through directly
  if (meta.args && typeof meta.args === 'object') {
    return {
      leafName: meta.leaf as string,
      args: meta.args as Record<string, unknown>,
    };
  }

  // Legacy fallback: derive args from produces/consumes
  const leaf = meta.leaf as string;
  const produces =
    (meta.produces as Array<{ name: string; count: number }>) || [];
  const consumes =
    (meta.consumes as Array<{ name: string; count: number }>) || [];

  switch (leaf) {
    case 'dig_block': {
      // Legacy: remap dig_block → acquire_material (atomic mine + collect)
      const item = produces[0];
      return {
        leafName: 'acquire_material',
        args: { item: item?.name || 'oak_log', count: item?.count || 1 },
      };
    }
    case 'craft_recipe': {
      const output = produces[0];
      return {
        leafName: 'craft_recipe',
        args: { recipe: output?.name || 'unknown', qty: output?.count || 1 },
      };
    }
    case 'smelt': {
      // Smelt contract requires { input: string } — derive from consumes (input), not produces (output)
      const consumed = consumes[0];
      return {
        leafName: 'smelt',
        args: { input: consumed?.name || 'unknown' },
      };
    }
    case 'place_workstation': {
      const workstation = (meta.workstation as string) || 'crafting_table';
      return {
        leafName: 'place_workstation',
        args: { workstation },
      };
    }
    case 'place_block': {
      const consumed = consumes[0];
      return {
        leafName: 'place_block',
        args: { item: consumed?.name || 'crafting_table' },
      };
    }
    case 'acquire_material': {
      // Combined mine+collect. Item comes from meta.item (building domain),
      // produces (Sterling crafting/tool-prog), or blockType (fallback plan).
      const acquireItem =
        (meta.item as string) ||
        produces[0]?.name ||
        (meta.blockType as string) ||
        'oak_log';
      const acquireCount = (meta.count as number) || produces[0]?.count || 1;
      return {
        leafName: 'acquire_material',
        args: { item: acquireItem, count: acquireCount },
      };
    }
    case 'prepare_site':
    case 'build_module':
    case 'place_feature':
    case 'building_step': {
      // Building domain — pass through meta fields
      return {
        leafName: leaf,
        args: {
          moduleId: meta.moduleId,
          item: meta.item,
          count: meta.count,
          ...((meta as any).args || {}),
        },
      };
    }
    case 'sterling_navigate': {
      // Navigation domain — pass through target and tolerance
      return {
        leafName: 'sterling_navigate',
        args: {
          target: meta.target || (meta as any).args?.target,
          toleranceXZ: meta.toleranceXZ ?? (meta as any).args?.toleranceXZ ?? 1,
          toleranceY: meta.toleranceY ?? (meta as any).args?.toleranceY ?? 0,
          ...((meta as any).args || {}),
        },
      };
    }
    default:
      return null;
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

    console.log(`🔍 Intelligent crafting table analysis for: ${task.title}`);

    // Get inventory and perform comprehensive analysis
    const inventory = await fetchInventorySnapshot();

    // Step 1: Check if we have a crafting table in inventory
    const hasCraftingTable = inventory.some((item: any) =>
      item.type?.toLowerCase().includes('crafting_table')
    );

    if (hasCraftingTable) {
      console.log('✅ Crafting table found in inventory');
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
      console.log(
        `✅ Using existing crafting table at distance ${decision.details.distance}`
      );
      return true;
    } else if (decision.action === 'craft_new') {
      console.log(`🔨 Crafting new table: ${decision.reasoning}`);
      await addCraftingTableTask(task, decision.details);
      return false; // Wait for crafting table task
    } else if (decision.action === 'gather_resources') {
      console.log(`🌳 Need to gather resources first: ${decision.reasoning}`);
      await addResourceGatheringTask(task, decision.details);
      return false; // Wait for resource gathering
    }

    // Fallback case
    console.log('⚠️ No viable crafting table strategy found');
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
    console.log('Task already exists: Craft Crafting Table');
    return;
  }

  const taskData = buildTaskFromRequirement(input, {
    parentTask: originalTask,
    tags: ['crafting'],
    extraParameters: { analysis: details },
  });
  const result = await taskIntegration.addTask(taskData);
  if (result && result.id) {
    console.log(`✅ Added intelligent crafting table task: ${result.id}`);
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
    outputPattern: 'oak_log',
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
    console.log('Task already exists: Gather Wood for Crafting Table');
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
  if (result && result.id) {
    console.log(`✅ Added intelligent wood gathering task: ${result.id}`);
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
      console.log(`🔧 Generating complex crafting subtasks for: ${task.title}`);

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
              { kind: 'craft', outputPattern: 'oak_planks', quantity: 4 },
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
            console.log(`Task already exists: ${subtaskData.title}`);
            continue;
          }
        }
        const result = await taskIntegration.addTask(subtaskData);
        if (result && result.id) {
          console.log(`✅ Added crafting subtask: ${subtaskData.title}`);
          addedCount++;
        }
      }

      // Block parent if any subtasks were added
      if (addedCount > 0 && task.id) {
        taskIntegration.updateTaskMetadata(task.id, {
          blockedReason: 'waiting_on_prereq',
        });
      }

      console.log(`🔧 Generated ${addedCount} subtasks for complex crafting`);
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
      console.log('[AUTONOMOUS EXECUTOR] Initializing executor state...');
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
      console.log(
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
      !global.lastTaskCount ||
      global.lastTaskCount !== activeTasks.length ||
      now - lastTaskCountLog > 300000
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
    if (activeTasks.length > 0) {
      console.log(
        `[AUTONOMOUS EXECUTOR] Top task: ${activeTasks[0].title} (${activeTasks[0].type})`
      );
      console.log(
        `[AUTONOMOUS EXECUTOR] Task status: ${activeTasks[0].status}, priority: ${activeTasks[0].priority}`
      );
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
        console.log(
          `[AUTONOMOUS EXECUTOR] Auto-unblocked shadow task ${t.id}: mode is now live`
        );
      }
    }

    // Auto-fail tasks that have been blocked for longer than the TTL.
    // Uses the TTL policy table (task-block-evaluator.ts) for per-reason exemptions.
    for (const t of activeTasks) {
      const blockState = evaluateTaskBlockState(t, nowMs, DEFAULT_BLOCKED_TTL_MS);
      if (blockState.shouldFail) {
        taskIntegration.updateTaskProgress(t.id, t.progress || 0, 'failed');
        taskIntegration.updateTaskMetadata(t.id, {
          failReason: blockState.failReason,
        });
        console.log(
          `[AUTONOMOUS EXECUTOR] Auto-failed task ${t.id}: ${blockState.failReason}`
        );
      }
    }

    // Filter out tasks that are blocked, in backoff, or in non-executable states.
    // Uses isTaskEligible() which has a status allowlist for safety.
    const eligibleTasks = activeTasks.filter((t) => isTaskEligible(t, nowMs));

    // IDLE-1: Eligibility-based idle detection
    // Determine idle reason based on task state, not just activeTasks.length === 0
    const circuitBreakerOpen = isCircuitBreakerOpen(nowMs);
    const idleReason = determineIdleReason(activeTasks, eligibleTasks, circuitBreakerOpen);

    if (idleReason !== null) {
      // Only log once per minute to avoid spam
      if (!global.lastNoTasksLog || now - global.lastNoTasksLog > 60000) {
        console.log(
          `[AUTONOMOUS EXECUTOR] Idle detected: ${idleReason} (active=${activeTasks.length}, eligible=${eligibleTasks.length})`
        );
        logOptimizer.log(`Idle: ${idleReason}`, `idle-${idleReason}`);
        global.lastNoTasksLog = now;
      }

      // Post idle event to cognition service for thought generation
      // Include idle_reason so cognition can respond appropriately (IDLE-1)
      if (!global.lastIdleEvent || now - global.lastIdleEvent > 300000) {
        console.log(
          `[AUTONOMOUS EXECUTOR] Bot is idle (${idleReason}) — posting lifecycle event to cognition`
        );
        const prevIdleAt = global.lastIdleEvent || 0;
        global.lastIdleEvent = now;
        taskIntegration.outbox.enqueue(
          'http://localhost:3003/api/cognitive-stream/events',
          {
            type: 'idle_period',
            timestamp: now,
            data: {
              idleReason,  // IDLE-1: Include reason for eligibility-based detection
              durationMs: prevIdleAt ? now - prevIdleAt : 0,
              activeTaskCount: activeTasks.length,
              eligibleTaskCount: eligibleTasks.length,
            },
          }
        );
      }
      return;
    }

    console.log(
      `[AUTONOMOUS EXECUTOR] Found ${eligibleTasks.length} eligible tasks (of ${activeTasks.length} active), executing...`
    );

    // Execute the highest priority eligible task, prioritizing prerequisite tasks
    const currentTask = eligibleTasks[0]; // Tasks are already sorted by priority

    console.log(
      `[AUTONOMOUS EXECUTOR] Executing task: ${currentTask.title} (${currentTask.type})`
    );
    console.log('[AUTONOMOUS EXECUTOR] Task details:', {
      id: currentTask.id,
      type: currentTask.type,
      priority: currentTask.priority,
      urgency: currentTask.urgency,
      status: currentTask.status,
    });

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
      console.log(
        `[AUTONOMOUS EXECUTOR] Processing cognitive reflection task: ${currentTask.title}`
      );
      console.log(
        `[AUTONOMOUS EXECUTOR] Thought content: ${currentTask.parameters?.thoughtContent?.substring(0, 100)}...`
      );
      console.log(
        `[AUTONOMOUS EXECUTOR] Signals received: ${currentTask.parameters?.signals?.length || 0}`
      );

      // Check if this cognitive reflection contains actionable steps
      const thoughtContent = currentTask.parameters?.thoughtContent || '';
      const hasActionableSteps = detectActionableSteps(thoughtContent);

      if (hasActionableSteps) {
        console.log(
          `[AUTONOMOUS EXECUTOR] Cognitive reflection contains actionable steps - converting to executable tasks`
        );

        // Convert cognitive reflection to actionable tasks
        await convertCognitiveReflectionToTasks(currentTask, taskIntegration);
      } else {
        console.log(
          `[AUTONOMOUS EXECUTOR] Processing cognitive reflection task: ${currentTask.title}`
        );

        // Pure cognitive reflection - should remain active until actionable tasks complete
        // Don't mark as completed just because we processed the thought
        console.log(
          `[AUTONOMOUS EXECUTOR] Pure cognitive reflection task - keeping active for potential actionable conversion`
        );
      }
      return;
    }

    // Only log task execution if progress has changed or it's a new task
    const taskKey = `task-execution-${currentTask.id}`;
    const currentProgress = Math.round((currentTask.progress || 0) * 100);

    logOptimizer.log(
      `Executing task: ${currentTask.title} (${currentProgress}% complete)`,
      taskKey
    );

    // Circuit breaker around bot health
    console.log('[AUTONOMOUS EXECUTOR] Checking bot connection...');
    const botConnection = await checkBotConnectionDetailed();
    console.log(`[AUTONOMOUS EXECUTOR] Bot connected: ${botConnection.ok}`);

    if (!botConnection.ok) {
      const st = global.__planningExecutorState;
      if (st.breaker === 'closed' && botConnection.failureKind !== 'timeout') {
        st.breaker = 'open';
        console.warn('[Executor] Bot unavailable — opening circuit');
      }
      // schedule half-open probe next tick
      return;
    } else {
      const st = global.__planningExecutorState;
      if (st.breaker !== 'closed') {
        console.log(
          `[AUTONOMOUS EXECUTOR] Circuit breaker was ${st.breaker}, closing it`
        );
        console.log('✅ Bot reachable — closing circuit');
        st.breaker = 'closed';
        st.failures = 0;
      }
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
          console.log(
            '[Executor] Bot reachable but not spawned — skipping cycle'
          );
          return;
        }
      }
    } catch {
      // If health fetch fails here, the earlier checkBotConnectionDetailed passed,
      // so this is a transient issue — skip rather than dispatch to an unready bot
      console.log('[Executor] Health re-check failed — skipping cycle');
      return;
    }

    // Check crafting table prerequisite for crafting tasks
    if (
      currentTask.type === 'crafting' &&
      !currentTask.metadata?.tags?.includes('prerequisite')
    ) {
      const craftingTableReady =
        await checkCraftingTablePrerequisite(currentTask);
      if (!craftingTableReady) {
        console.log(
          '⏳ Waiting for crafting table prerequisite to be satisfied...'
        );
        // Instead of returning, let the next iteration handle prerequisite tasks
        // The prerequisite tasks should have higher priority and will be executed first
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
              console.log(
                '⚠️ Crafting task has materials but not the crafted item - continuing execution'
              );
              return;
            }
          }

          // If already satisfied, mark completed and skip execution
          console.log(
            '✅ Requirement already satisfied from inventory; completing task.'
          );
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
          `⚠️ [Executor] Task ${currentTask.id} has no remaining executable steps — marking blocked`
        );
        return;
      }

      if (nextStep) {
        const leafExec = stepToLeafExecution(nextStep);
        if (leafExec) {
          const stepId = String(nextStep.id || nextStep.order || 'unknown');
          if (
            !BUILD_EXEC_BUDGET_DISABLED &&
            BUILDING_LEAVES.has(leafExec.leafName)
          ) {
            const now = Date.now();
            const { budgets, state, created } = getStepBudgetState(
              currentTask,
              stepId
            );
            let budgetDirty = created;
            const elapsed = now - (state.firstAt || now);
            if (elapsed > BUILD_EXEC_MAX_ELAPSED_MS) {
              taskIntegration.updateTaskMetadata(currentTask.id, {
                blockedReason: `budget-exhausted:time:${leafExec.leafName}`,
              });
              emitExecutorBudgetEvent(
                currentTask.id,
                stepId,
                leafExec.leafName,
                'max_elapsed',
                { elapsedMs: elapsed }
              );
              return;
            }
            if (state.attempts >= BUILD_EXEC_MAX_ATTEMPTS) {
              taskIntegration.updateTaskMetadata(currentTask.id, {
                blockedReason: `budget-exhausted:attempts:${leafExec.leafName}`,
              });
              emitExecutorBudgetEvent(
                currentTask.id,
                stepId,
                leafExec.leafName,
                'max_attempts',
                { attempts: state.attempts }
              );
              return;
            }
            if (
              state.lastAt &&
              now - state.lastAt < BUILD_EXEC_MIN_INTERVAL_MS
            ) {
              const delay = BUILD_EXEC_MIN_INTERVAL_MS - (now - state.lastAt);
              taskIntegration.updateTaskMetadata(currentTask.id, {
                nextEligibleAt: now + delay,
              });
              emitExecutorBudgetEvent(
                currentTask.id,
                stepId,
                leafExec.leafName,
                'rate_limited',
                { delayMs: delay }
              );
              return;
            }
            state.attempts = (state.attempts || 0) + 1;
            state.lastAt = now;
            budgetDirty = true;
            if (budgetDirty) persistStepBudget(currentTask, budgets);
          }

          // Normalize legacy arg shapes before validation (e.g., smelt { item } → { input })
          normalizeLeafArgs(leafExec.leafName, leafExec.args);
          // Validate args before execution (strict mode: reject unknown leaves)
          const validationError = validateLeafArgs(
            leafExec.leafName,
            leafExec.args,
            true
          );
          if (validationError) {
            console.warn(
              `⚠️ [Executor] Invalid args for ${leafExec.leafName}: ${validationError}`
            );
            taskIntegration.updateTaskMetadata(currentTask.id, {
              blockedReason: `invalid-args: ${validationError}`,
            });
            return;
          }

          // Pre-check: for craft steps, verify recipe inputs are available
          if (leafExec.leafName === 'craft_recipe' && leafExec.args.recipe) {
            const recipeInfo = await introspectRecipe(
              leafExec.args.recipe as string
            );
            if (recipeInfo) {
              const inv = await fetchInventorySnapshot();
              for (const input of recipeInfo.inputs) {
                const have = getCount(inv, input.item);
                if (have < input.count) {
                  console.log(
                    `🪵 [Executor] Missing ${input.item} (have ${have}, need ${input.count}) for ${leafExec.args.recipe}. Injecting prerequisite.`
                  );
                  // Cap + increment handled inside injectDynamicPrereqForCraft
                  const injected =
                    await injectDynamicPrereqForCraft(currentTask);
                  if (injected) return; // Execute prerequisite first
                  break;
                }
              }
            }
          }

          // --- Executor guards: leaf allowlist, shadow mode, rate limiter ---

          // Canonical tool name used for allowlist check AND execution
          const toolName = `minecraft.${leafExec.leafName}`;

          // 1. Leaf allowlist (free check, valid in both shadow and live)
          if (!executorConfig.leafAllowlist.has(toolName)) {
            // Mark step as non-executable so selector skips it on re-selection
            if (nextStep.meta) {
              nextStep.meta.executable = false;
              nextStep.meta.blocked = true;
            }
            taskIntegration.updateTaskMetadata(currentTask.id, {
              blockedReason: `unknown-leaf:${leafExec.leafName}`,
            });
            taskIntegration.emit('taskLifecycleEvent', {
              type: 'unknown_leaf_rejected',
              taskId: currentTask.id,
              leaf: leafExec.leafName,
            });
            return;
          }

          // 2. Shadow mode: always observe, never throttle, never mutate
          if (executorConfig.mode === 'shadow') {
            console.log(
              `[Executor:shadow] Would execute: ${toolName} ${JSON.stringify(leafExec.args)}`
            );
            await taskIntegration.startTaskStep(currentTask.id, nextStep.id, {
              dryRun: true,
            });
            return;
          }

          // --- Live mode execution ---

          // 3. Rate limiter (live only — shadow must always observe)
          if (!stepRateLimiter.canExecute()) {
            return;
          }

          // 4. Rig G gate + snapshot capture (may block infeasible tasks)
          const stepStarted = await taskIntegration.startTaskStep(
            currentTask.id,
            nextStep.id
          );
          if (!stepStarted) {
            // Rig G blocked or other gate failure — do NOT consume rate budget
            return;
          }

          // 5. Committed to execution — consume rate budget
          stepRateLimiter.record();

          const stepAuthority = nextStep.meta?.authority || 'unknown';
          console.log(
            `[Executor:${stepAuthority}] Executing step ${nextStep.order}: ${nextStep.label} → ${leafExec.leafName}`
          );
          const actionResult = await toolExecutor.execute(
            toolName,
            leafExec.args,
            getExecutorAbortSignal()
          );
          if (actionResult?.ok) {
            const stepCompleted = await taskIntegration.completeTaskStep(
              currentTask.id,
              nextStep.id
            );
            if (stepCompleted) {
              console.log(`✅ [Executor] Step ${nextStep.order} completed`);
              // Reset verification failure count on success
              if (currentTask.metadata?.verifyFailCount) {
                taskIntegration.updateTaskMetadata(currentTask.id, {
                  verifyFailCount: 0,
                });
              }
            } else {
              // Verification failed (e.g. inventory not updated yet); back off to avoid spin loop
              const verifyFails =
                ((currentTask.metadata?.verifyFailCount as number) || 0) + 1;
              const maxVerifyFails = 5;
              const backoffMs = Math.min(5000 * verifyFails, 30_000);
              if (verifyFails >= maxVerifyFails) {
                // Skip this step and move on — mark done despite verification failure
                console.warn(
                  `⚠️ [Executor] Step ${nextStep.order} verification failed ${verifyFails} times — skipping step`
                );
                await taskIntegration.completeTaskStep(
                  currentTask.id,
                  nextStep.id,
                  { skipVerification: true } as any
                );
                taskIntegration.updateTaskMetadata(currentTask.id, {
                  verifyFailCount: 0,
                  lastSkippedStep: nextStep.id,
                });
              } else {
                taskIntegration.updateTaskMetadata(currentTask.id, {
                  verifyFailCount: verifyFails,
                  nextEligibleAt: Date.now() + backoffMs,
                });
                console.warn(
                  `⚠️ [Executor] Step ${nextStep.order} verification failed (${verifyFails}/${maxVerifyFails}); backing off ${backoffMs}ms`
                );
              }
            }
          } else if (isNavigatingError(actionResult?.error)) {
            // Bot is mid-navigation — retry next cycle, don't count as failure
            console.log(
              `🚶 [Executor] Bot is navigating, will retry next cycle`
            );
          } else {
            console.warn(
              `⚠️ [Executor] Step ${nextStep.order} failed: ${actionResult?.error}`
            );

            // P1-1: Deterministic failure fast-path
            // Mapping and contract failures are NOT retryable — fail immediately without
            // consuming retries or scheduling backoff. This prevents "backoff hiding defects".
            // Note: failureCode may come from normalizeActionResponse (via gateway) or
            // from leaf-level error.code. We check both paths.
            const failureCode = (actionResult as any)?.failureCode ?? (actionResult?.data?.error?.code as string | undefined);
            if (isDeterministicFailure(failureCode)) {
              console.error(
                `🛑 [Executor] Deterministic failure (${failureCode}) — failing task immediately without retry`
              );
              taskIntegration.updateTaskMetadata(currentTask.id, {
                blockedReason: `deterministic-failure:${failureCode}`,
                failureCode,
                failureError: actionResult?.error as any,
              });
              taskIntegration.updateTaskProgress(
                currentTask.id,
                currentTask.progress || 0,
                'failed'
              );
              await recomputeProgressAndMaybeComplete(currentTask);
              return; // Exit without retry/backoff
            }

            // For craft failures, try injecting prerequisite acquisition steps
            // Cap + increment handled inside injectDynamicPrereqForCraft
            if (leafExec.leafName === 'craft_recipe') {
              const injected = await injectDynamicPrereqForCraft(currentTask);
              if (injected) return; // Execute prerequisite first, then retry craft
            }

            const newRetryCount = (currentTask.metadata?.retryCount || 0) + 1;
            const maxRetries = currentTask.metadata?.maxRetries || 3;
            // Exponential backoff: 1s, 2s, 4s, ... capped at 30s
            const backoffMs = Math.min(
              1000 * Math.pow(2, newRetryCount),
              30_000
            );

            if (newRetryCount >= maxRetries) {
              // --- Sterling repair gate (Pivot 2) ---
              // Before giving up, attempt Sterling re-solve with failure context.
              const repairCount =
                (currentTask.metadata as any)?.repairCount ?? 0;
              const lastDigest = (currentTask.metadata as any)?.lastStepsDigest;
              if (repairCount < 2) {
                try {
                  const failureContext = {
                    failedLeaf: (nextStep?.meta?.leaf as string) || 'unknown',
                    reasonClass: actionResult?.error || 'execution-failure',
                    attemptCount: newRetryCount,
                  };
                  console.log(
                    `[Repair] Attempting Sterling re-solve for task: ${currentTask.title} (repair #${repairCount + 1})`
                  );
                  const repairResult = await taskIntegration.regenerateSteps(
                    currentTask.id,
                    failureContext
                  );
                  if (repairResult.success && repairResult.stepsDigest) {
                    // No-change detection (Pivot 2): identical digest = non-repair
                    if (repairResult.stepsDigest !== lastDigest) {
                      taskIntegration.updateTaskMetadata(currentTask.id, {
                        retryCount: 0,
                        repairCount: repairCount + 1,
                        lastRepairAt: Date.now(),
                        lastStepsDigest: repairResult.stepsDigest,
                        nextEligibleAt: undefined,
                      } as any);
                      console.log(
                        `[Repair] Sterling re-solve produced new plan (digest: ${repairResult.stepsDigest})`
                      );
                      return; // Re-execute on next cycle with fresh plan
                    }
                    console.log(
                      `[Repair] Sterling re-solve returned identical plan — treating as non-repair`
                    );
                  }
                } catch (repairErr) {
                  console.warn(`[Repair] Sterling re-solve failed:`, repairErr);
                }
              }
              // --- End repair gate ---

              taskIntegration.updateTaskMetadata(currentTask.id, {
                retryCount: newRetryCount,
                blockedReason: 'max-retries-exceeded',
              });
              taskIntegration.updateTaskProgress(
                currentTask.id,
                currentTask.progress || 0,
                'failed'
              );
              console.log(
                `[Executor] Task failed after ${newRetryCount} retries: ${currentTask.title}`
              );
            } else {
              taskIntegration.updateTaskMetadata(currentTask.id, {
                retryCount: newRetryCount,
                nextEligibleAt: Date.now() + backoffMs,
              });
              console.log(
                `🔄 [Executor] Task in backoff for ${backoffMs}ms (retry ${newRetryCount}/${maxRetries})`
              );
            }
          }
          await recomputeProgressAndMaybeComplete(currentTask);
          return; // Executor handled this execution cycle
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
              `⚠️ [Executor] Step ${nextStep.order} has no leaf binding — blocking task (no MCP fallback)`
            );
            return;
          }
          console.warn(
            `⚠️ [Executor] Step ${nextStep.order} has no executable meta — falling through to MCP`
          );
        }
      }
    }

    // Track if task was executed successfully
    let executionResult = false;

    // Execute MCP option if found
    if (suitableOption) {
      console.log(
        `🎯 Found MCP option: ${suitableOption.name} (${suitableOption.id}) - delegating to MCP execution pipeline`
      );
    } else {
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
      // Map task types to individual leaves
      const inferredRecipe = resolvedRecipe(currentTask);
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
              currentTask.parameters?.blockType || inferredBlock || 'oak_log',
            pos: currentTask.parameters?.pos,
          },
        },
        gather: {
          leafName: 'dig_block',
          args: {
            blockType:
              currentTask.parameters?.blockType || inferredBlock || 'oak_log',
            pos: currentTask.parameters?.pos,
          },
        },
        search: {
          leafName: 'dig_block',
          args: {
            blockType:
              currentTask.parameters?.blockType || inferredBlock || 'oak_log',
            pos: currentTask.parameters?.pos,
          },
        },
        mining: {
          leafName: 'dig_block',
          args: {
            blockType:
              currentTask.parameters?.blockType || inferredBlock || 'iron_ore',
            pos: currentTask.parameters?.pos,
          },
        },
        mine: {
          leafName: 'dig_block',
          args: {
            blockType:
              currentTask.parameters?.blockType || inferredBlock || 'iron_ore',
            pos: currentTask.parameters?.pos,
          },
        },
        crafting: {
          leafName: 'craft_recipe',
          args: {
            recipe:
              currentTask.parameters?.recipe ||
              inferredRecipe ||
              'wooden_pickaxe',
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
      const needPlanks = intent.includes('plank') || intent.includes('planks');
      const candidates: Array<{ leafName: string; args: any; reason: string }> =
        [];
      if (needPlanks && availableLeaves.has('craft_recipe')) {
        candidates.push({
          leafName: 'craft_recipe',
          args: { recipe: 'oak_planks', qty: 4 },
          reason: 'Intent mentions planks; try crafting directly',
        });
      }
      if (haveLogs && availableLeaves.has('craft_recipe')) {
        candidates.push({
          leafName: 'craft_recipe',
          args: { recipe: 'oak_planks', qty: 4 },
          reason: 'Logs available in inventory; craft planks',
        });
      }
      if (availableLeaves.has('dig_block')) {
        const blockType =
          currentTask.parameters?.blockType || inferredBlock || 'oak_log';
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
        console.log(
          `✅ Selected leaf for task: ${selectedLeaf.leafName} — ${
            (selectedLeaf as any).reason || 'heuristic'
          }`
        );

        // Check retry count to prevent infinite loops
        const retryCount = currentTask.metadata?.retryCount || 0;
        const maxRetries = currentTask.metadata?.maxRetries || 3;

        if (retryCount >= maxRetries) {
          console.log(
            `[Executor] Task failed after ${retryCount} retries, marking as failed: ${currentTask.title}`
          );
          taskIntegration.updateTaskProgress(
            currentTask.id,
            currentTask.progress || 0,
            'failed'
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
            console.log(
              '🪵 Missing wood logs for crafting (leaf path). Injecting prerequisite gathering steps.'
            );
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
          console.log(
            `[Executor:shadow] Would execute: ${mcpToolName} ${JSON.stringify(selectedLeaf.args)}`
          );
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
          console.log(
            `✅ Leaf executed successfully: ${selectedLeaf.leafName}`
          );

          // Post-check: if crafting pickaxe reported success but no pickaxe, inject acquisition step
          if (
            selectedLeaf.leafName === 'craft_recipe' &&
            /pickaxe/i.test(currentTask.title || '')
          ) {
            const postInv = await fetchInventorySnapshot();
            if (!hasPickaxe(postInv)) {
              console.warn(
                '⚠️ Craft reported success but pickaxe not found; planning next acquisition step.'
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
          console.log(`🚶 Bot is navigating, will retry next cycle`);
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
            taskIntegration.updateTaskMetadata(currentTask.id, {
              blockedReason: 'waiting_on_prereq',
            });
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
          console.log(
            `[Executor] Task marked as failed after ${newRetryCount} retries: ${currentTask.title}`
          );
        } else {
          taskIntegration.updateTaskMetadata(currentTask.id, {
            retryCount: newRetryCount,
            lastRetry: Date.now(),
          });
          // Add chest search fallback on retry if crafting pickaxe
          if (
            leafConfig.leafName === 'craft_recipe' &&
            /pickaxe/i.test(currentTask.title || '')
          ) {
            taskIntegration.addStepsBeforeCurrent(currentTask.id, [
              { label: 'Search nearby chest for wood' },
            ]);
          }
          console.log(
            `🔄 Task will be retried (${newRetryCount}/${maxRetries}): ${currentTask.title}`
          );
        }
      }
    }

    if (suitableOption) {
      console.log(`✅ Found MCP option for task: ${suitableOption.name}`);

      // Check retry count to prevent infinite loops
      const retryCount = currentTask.metadata?.retryCount || 0;
      const maxRetries = currentTask.metadata?.maxRetries || 3;

      if (retryCount >= maxRetries) {
        console.log(
          `[Executor] Task failed after ${retryCount} retries, marking as failed: ${currentTask.title}`
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
          console.log(
            '🪵 Missing wood logs for crafting. Performing quick gather attempt.'
          );
          const gather = await serverConfig
            .getMCPIntegration()
            ?.executeTool('minecraft.dig_block', { blockType: 'oak_log' });
          if (!gather?.success) {
            console.warn(
              '⚠️ Quick gather attempt failed. Injecting prerequisite steps.'
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
              '⚠️ Wood still insufficient after gather attempt. Injecting prerequisite steps.'
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
        console.log(
          `✅ MCP option executed successfully: ${suitableOption.name}`
        );

        if (
          currentTask.type === 'crafting' &&
          /pickaxe/i.test(currentTask.title || '')
        ) {
          const postInv = await fetchInventorySnapshot();
          if (!hasPickaxe(postInv)) {
            console.warn(
              '⚠️ Craft reported success but pickaxe not found; planning next acquisition step.'
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
          console.log(
            `[Executor] Task marked as failed after ${newRetryCount} retries: ${currentTask.title}`
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
          console.log(
            `🔄 Task will be retried (${newRetryCount}/${maxRetries}): ${currentTask.title}`
          );
        }
      }
    } else {
      logOptimizer.warn(
        `⚠️ No suitable MCP option found for task: ${currentTask.title}. Falling back to planning system.`,
        `no-mcp-option-${currentTask.type}`
      );
      // If no MCP option, execute the task through the planning system
      try {
        console.log(`🚀 Starting execution of task: ${currentTask.title}`);

        // Map task type to real Minecraft action
        const minecraftAction = mapTaskTypeToMinecraftAction(currentTask);

        // Thread task scope for nav lease isolation
        const scopedAction = withNavLeaseScope(minecraftAction, currentTask.id);
        if (scopedAction) {
          console.log(`🔄 Executing task: ${currentTask.title}`);

          // Execute real Minecraft action (pass taskId explicitly for typed wrapper)
          const actionResult = await executeActionWithBotCheck(scopedAction, currentTask.id);

          if (actionResult.outcome === 'shadow') {
            // Shadow mode: observation recorded. Task is blocked until mode changes.
            // NOT a failure — do not consume retries.
            console.log(`[Shadow] Observed: ${currentTask.title} (${scopedAction.type})`);
            taskIntegration.updateTaskMetadata(currentTask.id, {
              blockedReason: 'shadow_mode',
              blockedAt: Date.now(),
              shadowObservationCount: (currentTask.metadata?.shadowObservationCount || 0) + 1,
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
            console.log(`✅ Task executed successfully: ${currentTask.title}`);
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
              console.log(
                `[Executor] Task marked as failed after ${retryCount} retries: ${currentTask.title}`
              );
            } else {
              taskIntegration.updateTaskMetadata(currentTask.id, {
                retryCount,
                lastRetry: Date.now(),
              });
              console.log(
                `🔄 Task will be retried (${retryCount}/${maxRetries}): ${currentTask.title}`
              );
            }
          }
        } else {
          console.warn(
            `⚠️ No Minecraft action mapping for task type: ${currentTask.type}`
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
  createPlanningBootstrap();

// Wire cached inventory provider so verification can skip HTTP when fresh data exists
taskIntegration.setInventoryProvider?.(() => {
  const snapshot = worldStateManager.getSnapshot();
  const items = worldStateManager.getInventory();
  if (!items) return undefined;
  return { items, ts: snapshot.ts };
});

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
        console.log(`🎯 Executing goal: ${goal.title || goal.id}`);

        // Ensure task is activated before dispatch (P0-2: activation at dispatch boundary)
        // Goals often have task IDs when converted from tasks
        if (goal.id) {
          await taskIntegration.ensureActivated(goal.id);
        }

        // Execute the goal through the enhanced reactive executor
        const result = await reactiveExecutor.executeTask(goal);

        if (result.success) {
          console.log(
            `✅ Goal executed successfully: ${goal.title || goal.id}`
          );
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
        console.log(`🔄 Executing task: ${task.title || task.id}`);

        // Ensure task is activated before dispatch (P0-2: activation at dispatch boundary)
        // This guarantees tasks cannot remain 'pending' after execution
        if (task.id) {
          await taskIntegration.ensureActivated(task.id);
        }

        // Execute the task through the enhanced reactive executor
        const result = await reactiveExecutor.executeTask(task);

        if (result.success) {
          console.log(
            `✅ Task executed successfully: ${task.title || task.id}`
          );
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
  console.log('Task added to enhanced integration:', task.title);
});

taskIntegration.on(
  'taskProgressUpdated',
  ({ task, oldProgress, oldStatus }) => {
    console.log(
      `Task progress updated: ${task.title} - ${Math.round(task.progress * 100)}% (${oldStatus} -> ${task.status})`
    );
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
    console.log(`[Lifecycle→Review] ${reason}`);
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

// Emergency stop endpoint
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
      console.log('✅ Event-driven thought generator initialized in server');
    } catch (error) {
      console.warn(
        '⚠️ Failed to initialize event-driven thought generator:',
        error
      );
    }

    // Initialize Sterling reasoning service (optional external dependency)
    const sterling = await createSterlingBootstrap(taskIntegration);
    sterlingService = sterling.sterlingService;
    minecraftCraftingSolver = sterling.minecraftCraftingSolver;
    minecraftBuildingSolver = sterling.minecraftBuildingSolver;
    minecraftToolProgressionSolver = sterling.minecraftToolProgressionSolver;
    minecraftNavigationSolver = sterling.minecraftNavigationSolver;

    // Create MCP leaf registry for MCP integration
    const registry = new MCPLeafRegistry();

    // Initialize MCP integration with the registry
    try {
      await serverConfig.initializeMCP(undefined, registry);
      // invalidate leaf cache
      (getAvailableLeaves as any).__cache = undefined;
      (getAvailableLeaves as any).__ts = 0;
      console.log('✅ MCP integration initialized successfully');
    } catch (error) {
      console.warn(
        '⚠️ MCP integration failed to initialize, continuing without it:',
        error
      );
    }

    // Connect MCP integration to behavior tree runner for option execution
    try {
      const mcpIntegration = serverConfig.getMCPIntegration();
      if (mcpIntegration) {
        console.log('🔗 Connecting MCP integration to behavior tree runner...');

        // Add the behavior tree runner to the MCP integration so it can execute options
        (mcpIntegration as any).btRunner = btRunner;

        console.log('MCP integration connected to behavior tree runner');
      }
    } catch (error) {
      console.warn(
        '⚠️ Failed to connect MCP integration to behavior tree runner:',
        error
      );
    }

    // Register placeholder Minecraft leaves with both the registry and MCP.
    // Placeholder leaves are registration-only; minecraft-interface must register real leaves before execution.
    try {
      const mcpIntegration = serverConfig.getMCPIntegration();
      if (mcpIntegration) {
        console.log('Registering core Minecraft leaves in planning...');

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
              `⚠️ Failed to register leaf ${
                (leaf as any)?.spec?.name || 'unknown'
              } in planning:`,
              err
            );
          }
        }

        console.log(`Registered ${registered} core leaves in planning`);
      }
    } catch (e) {
      console.warn('⚠️ Core leaf registration in planning failed:', e);
    }

    // Mount planning endpoints
    const planningRouter = createPlanningEndpoints(planningSystem);
    serverConfig.mountRouter('/', planningRouter);

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
        console.log('📝 Seeding default MCP options...');

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

        for (const opt of defaultOptions) {
          try {
            const reg = await mcpIntegration.registerOption(opt);
            if (reg.success) {
              console.log(`✅ Registered MCP option: ${opt.name}`);

              // Also register the option with the behavior tree runner
              try {
                console.log(
                  `🔗 Adding MCP option ${opt.name} to behavior tree runner`
                );
                btRunner.storeInlineDefinition(opt.id, opt.btDefinition);
              } catch (btError) {
                console.warn(
                  `⚠️ Failed to connect option ${opt.name} to behavior tree runner:`,
                  btError
                );
              }

              try {
                const id = (reg.data as string) || opt.id;
                const promo = await mcpIntegration.promoteOption(id);
                if (promo.success) {
                  console.log(`🚀 Promoted MCP option to active: ${id}`);
                } else {
                  console.warn(
                    `⚠️ MCP option promotion failed for ${id}: ${promo.error}`
                  );
                }
              } catch (e) {
                console.warn(
                  `⚠️ MCP option promotion error for ${opt.name}:`,
                  e
                );
              }
            } else {
              console.warn(
                `⚠️ MCP option registration failed for ${opt.name}: ${reg.error}`
              );
              // Log more details about the failure
              console.warn(`  - Option ID: ${opt.id}`);
              console.warn(
                `  - Action: ${opt.btDefinition?.root?.children?.[0]?.action || 'unknown'}`
              );
            }
          } catch (error) {
            console.error(
              `[Executor] Error during MCP option registration for ${opt.name}:`,
              error
            );
          }
        }
      } catch (e) {
        console.warn('⚠️ Seeding default MCP options failed:', e);
      }
    }

    // Add error handling
    serverConfig.addErrorHandling();

    // Start the server
    await serverConfig.start();
    console.log('✅ Server started successfully');

    // --- Service readiness gate (never blocks boot) ---
    const readiness = new ReadinessMonitor({
      executionRequired: ['minecraft'],
    });
    const readinessResult = await readiness.probe();
    setReadinessMonitor(readiness);

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

    // Start slow re-probe (every 2 minutes, state-change logging only)
    readiness.startMonitoring(120_000);

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
      const tryStartExecutor = () => {
        if (executorStarted) return;
        if (process.env.ENABLE_PLANNING_EXECUTOR !== '1') return;
        if (!isSystemReady()) return;
        if (!readiness.executorReady) return;
        executorStarted = true;
        console.log(
          '[Planning] Starting executor — system ready and dependencies reachable'
        );

        // Start an audit session so executor audit entries are captured.
        // The session stays open for the executor's lifetime.
        import('@conscious-bot/cognition')
          .then(({ auditLogger }) => {
            const sid = auditLogger.startSession('executor-' + Date.now());
            console.log(`[Planning] Audit session started: ${sid}`);
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
        // Re-check when system becomes ready
        waitForSystemReady().then(() => tryStartExecutor());
        // Re-check when readiness monitor detects a state change
        readiness.onChange(() => tryStartExecutor());
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
    console.log(
      '[Planning] Using event-driven thought generation (cognition) instead of legacy cognitive processor.'
    );

    console.log('✅ Modular planning server started successfully');
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
