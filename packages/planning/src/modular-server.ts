/**
 * Modular Planning Server
 *
 * New modular server implementation with code splitting and MCP integration.
 * Replaces the monolithic server.ts with a cleaner, more maintainable architecture.
 *
 * @author @darianrosebrook
 */

import { ServerConfiguration } from './modules/server-config';
import {
  createPlanningEndpoints,
  PlanningSystem,
} from './modules/planning-endpoints';
import { MCPIntegration } from './modules/mcp-integration';
import {
  MC_ENDPOINT,
  mcFetch,
  mcPostJson,
  checkBotConnection,
  waitForBotConnection,
  getBotPosition,
  executeTask,
} from './modules/mc-client';
import {
  extractItemFromTask,
  mapTaskTypeToMinecraftAction,
  mapBTActionToMinecraft,
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

// Import existing components
import { CognitiveIntegration } from './cognitive-integration';
import { BehaviorTreeRunner } from './behavior-trees/BehaviorTreeRunner';
import { CognitiveThoughtProcessor } from './cognitive-thought-processor';
import { IntegratedPlanningCoordinator } from './integrated-planning-coordinator';
import { EnhancedGoalManager } from './goal-formulation/enhanced-goal-manager';
import { EnhancedReactiveExecutor } from './reactive-executor/enhanced-reactive-executor';
import { EnhancedTaskIntegration } from './enhanced-task-integration';
import { EnhancedMemoryIntegration } from './enhanced-memory-integration';
import { EnhancedEnvironmentIntegration } from './enhanced-environment-integration';
import { EnhancedLiveStreamIntegration } from './enhanced-live-stream-integration';
import { GoalStatus } from './types';
// Temporary local type definition until @conscious-bot/core is available
export class EnhancedRegistry {
  constructor() {}
  register(name: string, handler: any): void {
    console.log(`Registered: ${name}`);
  }
  registerLeaf(name: string, leaf: any): void {
    console.log(`Registered leaf: ${name}`);
  }
}
import { WorldStateManager } from './world-state/world-state-manager';
import { WorldKnowledgeIntegrator } from './world-state/world-knowledge-integrator';

// Centralized Minecraft endpoint and resilient HTTP utilities
const worldStateManager = new WorldStateManager(MC_ENDPOINT);
worldStateManager.startPolling(3000);
const worldKnowledge = new WorldKnowledgeIntegrator(worldStateManager);
worldStateManager.on('updated', (snapshot) => {
  try {
    worldKnowledge.handleWorldUpdate(snapshot);
  } catch (e) {
    console.warn('WorldKnowledge update failed:', (e as any)?.message);
  }
});

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
  'move_to',
  'step_forward_safely',
  'follow_entity',
  'dig_block',
  'place_block',
  'place_torch_if_needed',
  'retreat_and_block',
  'consume_food',
  'sense_hostiles',
  'chat',
  'wait',
  'get_light_level',
  'craft_recipe',
  'smelt',
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

// Initialize tool executor that connects to Minecraft interface
// If MCP_ONLY env var is set ("true"), skip direct /action fallback in favor of MCP tools
const MCP_ONLY = String(process.env.MCP_ONLY || '').toLowerCase() === 'true';

const toolExecutor = {
  async execute(tool: string, args: Record<string, any>, signal?: AbortSignal) {
    if (!tool.startsWith('minecraft.')) {
      return {
        ok: false,
        data: null,
        environmentDeltas: {},
        error: 'Unsupported tool namespace',
        confidence: 0,
        cost: 1,
        duration: 0,
        metadata: { reason: 'unsupported_namespace' },
      };
    }
    console.log(`Executing tool: ${tool} with args:`, args);

    const startTime = Date.now();
    try {
      // Map BT actions to Minecraft actions
      const mappedAction = mapBTActionToMinecraft(tool, args);

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
        console.log(
          'MCP_ONLY=true; toolExecutor will not use direct /action fallback'
        );
        return {
          ok: false,
          data: null,
          environmentDeltas: {},
          error: 'Direct action disabled (MCP_ONLY) — use MCP option execution',
          confidence: 0,
          cost: 1,
          duration: Date.now() - startTime,
          metadata: { reason: 'mcp_only_disabled' },
        };
      }

      // Use the bot connection check for Minecraft actions
      const result = await executeActionWithBotCheck(mappedAction, signal);
      const duration = Date.now() - startTime;

      // Enhance result with metrics
      return {
        ...result,
        confidence: result.ok ? 0.8 : 0.2, // Basic confidence based on success
        cost: 1, // Base cost for all actions
        duration,
        metadata: {
          tool,
          args,
          mappedAction: mappedAction.type,
        },
      };
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
 * Execute action with bot connection check
 */
async function executeActionWithBotCheck(action: any, signal?: AbortSignal) {
  try {
    if (!action) {
      return {
        ok: false,
        error: 'No action provided',
        data: null,
        environmentDeltas: {},
      };
    }
    // Check if bot is connected
    const botConnected = await checkBotConnection();
    if (!botConnected) {
      return {
        ok: false,
        error: 'Bot not connected',
        data: null,
        environmentDeltas: {},
      };
    }

    // Execute the action through the Minecraft interface
    const post = await mcPostJson<any>(
      '/action',
      { type: action.type, parameters: action.parameters },
      action.timeout || 15_000
    );

    if (!post.ok) {
      return {
        ok: false,
        error: post.error || 'Action request failed',
        data: null,
        environmentDeltas: {},
      };
    }

    const result = post.data as any;

    if (result.success) {
      return {
        ok: true,
        data: result.result,
        environmentDeltas: {},
      };
    } else {
      return {
        ok: false,
        error: result.error || 'Action execution failed',
        data: result.result,
        environmentDeltas: {},
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error',
      data: null,
      environmentDeltas: {},
    };
  }
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
  title: string;
  description: string;
  type: string;
  parameters: any;
  tags: string[];
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
          title: `Craft ${best.item}`,
          description: `Craft ${best.need}x ${best.item} for ${goalItem}`,
          type: 'crafting',
          parameters: { recipe: best.item, qty: Math.max(1, best.need) },
          tags: ['dynamic', 'crafting'],
        };
      }
      const mapping = baseGatherMapping(best.item);
      if (mapping) {
        return {
          title:
            mapping.type === 'gathering' ? 'Gather Resource' : 'Mine Resource',
          description: `Obtain ${best.need}x ${best.item}`,
          type: mapping.type,
          parameters: { blockType: mapping.blockType },
          tags: ['dynamic', 'gather'],
        };
      }
      // Fallback to crafting even if introspection failed
      return {
        title: `Craft ${best.item}`,
        description: `Craft ${best.need}x ${best.item}`,
        type: 'crafting',
        parameters: { recipe: best.item, qty: Math.max(1, best.need) },
        tags: ['dynamic', 'crafting'],
      };
    }
    // If inputs are sufficient but table required, ensure crafting table exists
    if (info.requiresTable) {
      if (!hasCraftingTableItem(inv)) {
        return {
          title: 'Craft Crafting Table',
          description: 'Create a crafting table for 3x3 recipes',
          type: 'crafting',
          parameters: { recipe: 'crafting_table', qty: 1 },
          tags: ['dynamic', 'crafting-table'],
        };
      } else {
        return {
          title: 'Place Crafting Table',
          description: 'Place a crafting table nearby to use 3x3 grid',
          type: 'placement',
          parameters: { item: 'crafting_table' },
          tags: ['dynamic', 'placement'],
        };
      }
    }
    return null;
  }

  // Not craftable: try base gathering
  const mapping = baseGatherMapping(goalItem);
  if (mapping) {
    return {
      title: mapping.type === 'gathering' ? 'Gather Resource' : 'Mine Resource',
      description: `Obtain ${qty - have}x ${goalItem}`,
      type: mapping.type,
      parameters: { blockType: mapping.blockType },
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
  const step = await planNextAcquisitionStep(goalItem, qty);
  if (!step) return false;
  const t = await enhancedTaskIntegration.addTask({
    title: step.title,
    description: step.description,
    type: step.type,
    priority: Math.max(0.9, (parentTask.priority || 0.5) + 0.05),
    urgency: parentTask.urgency || 0.7,
    source: 'autonomous' as const,
    parameters: step.parameters,
    metadata: {
      category: parentTask.metadata?.category || 'general',
      tags: step.tags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      parentTaskId: parentTask.id,
      childTaskIds: [],
    },
  });
  return Boolean(t);
}

async function injectDynamicPrereqForCraft(task: any): Promise<boolean> {
  const title = (task.title || '').toLowerCase();
  const recipe =
    task.parameters?.recipe ||
    inferRecipeFromTitle(task.title) ||
    (title.includes('pickaxe') ? 'wooden_pickaxe' : null);
  if (!recipe) return false;
  return await injectNextAcquisitionStep(
    task,
    recipe,
    task.parameters?.qty || 1
  );
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
    enhancedTaskIntegration.updateTaskMetadata(task.id, {
      requirement: snapshot,
    });
    const status = task.status === 'pending' ? 'active' : task.status;
    enhancedTaskIntegration.updateTaskProgress(task.id, clamped, status);
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
        enhancedTaskIntegration.updateTaskProgress(task.id, 1, 'completed');
      }
      return;
    }
    const currentStep = task.steps.find((s: any) => !s.done);
    if (currentStep)
      await enhancedTaskIntegration.completeTaskStep(task.id, currentStep.id);
    const allStepsComplete = task.steps.every((s: any) => s.done);
    if (canComplete && allStepsComplete) {
      enhancedTaskIntegration.updateTaskProgress(task.id, 1, 'completed');
    }
  } catch (e) {
    console.warn('Progress recompute failed:', e);
  }
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
    const worldStateResponse = await fetch('http://localhost:3005/state', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (!worldStateResponse.ok) return [];

    const worldData = (await worldStateResponse.json()) as any;
    const botPosition = worldData.data?.position;

    if (!botPosition) return [];

    // Query nearby blocks to find crafting tables
    const nearbyBlocksResponse = await fetch(
      'http://localhost:3005/nearby-blocks',
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
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
  const craftingTableTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: 'Craft Crafting Table',
    description: 'Create a crafting table to enable advanced crafting recipes',
    type: 'crafting',
    priority: originalTask.priority + 1,
    urgency: 0.8,
    progress: 0,
    status: 'pending' as const,
    source: 'autonomous' as const,
    parameters: {
      itemType: 'crafting_table',
      quantity: 1,
      requiresWood: true,
      analysis: details,
    },
    steps: [
      {
        id: 'craft-table-step-1',
        label: 'Check required materials',
        done: false,
        order: 1,
        estimatedDuration: 2000,
      },
      {
        id: 'craft-table-step-2',
        label: 'Access crafting interface',
        done: false,
        order: 2,
        estimatedDuration: 3000,
      },
      {
        id: 'craft-table-step-3',
        label: 'Create the item',
        done: false,
        order: 3,
        estimatedDuration: 5000,
      },
    ],
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: ['prerequisite', 'crafting'],
      category: 'crafting',
      requirement: {
        type: 'crafting_table',
        quantity: 1,
      },
    },
  };

  const result = await enhancedTaskIntegration.addTask(craftingTableTask);
  if (result && result.id) {
    console.log(`✅ Added intelligent crafting table task: ${result.id}`);
  } else {
    console.log('Task already exists: Craft Crafting Table');
  }
}

/**
 * Add resource gathering task for crafting table materials
 */
async function addResourceGatheringTask(
  originalTask: any,
  details: any
): Promise<void> {
  const woodTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: 'Gather Wood for Crafting Table',
    description: `Collect ${details.neededWood || 4} wood units to craft a crafting table`,
    type: 'gathering',
    priority: originalTask.priority + 2,
    urgency: 0.9,
    progress: 0,
    status: 'pending' as const,
    source: 'autonomous' as const,
    parameters: {
      resourceType: 'wood',
      targetQuantity: details.neededWood || 4,
      currentQuantity: details.currentWood || 0,
      locations: ['forest', 'trees', 'logs'],
      tools: ['axe'],
    },
    steps: [
      {
        id: 'gather-wood-step-1',
        label: 'Locate wood sources',
        done: false,
        order: 1,
        estimatedDuration: 5000,
      },
      {
        id: 'gather-wood-step-2',
        label: 'Gather wood materials',
        done: false,
        order: 2,
        estimatedDuration: details.neededWood * 3000, // 3s per wood unit
      },
      {
        id: 'gather-wood-step-3',
        label: 'Convert logs to planks if needed',
        done: false,
        order: 3,
        estimatedDuration: 2000,
      },
    ],
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 5,
      childTaskIds: [],
      tags: ['prerequisite', 'gathering', 'wood'],
      category: 'resource_gathering',
      requirement: {
        type: 'wood',
        quantity: details.neededWood || 4,
      },
    },
  };

  const result = await enhancedTaskIntegration.addTask(woodTask);
  if (result && result.id) {
    console.log(`✅ Added intelligent wood gathering task: ${result.id}`);
  } else {
    console.log('Task already exists: Gather Wood for Crafting Table');
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

      // Create subtasks based on what's needed
      const subtasks = [];

      // Check if we need to place a crafting table
      const hasCraftingTable = inventory.some((item: any) =>
        item.type?.toLowerCase().includes('crafting_table')
      );

      if (hasCraftingTable) {
        // Add task to place crafting table
        subtasks.push({
          id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: 'Place Crafting Table',
          description:
            'Place crafting table in the world for advanced crafting',
          type: 'placement',
          priority: task.priority + 1,
          urgency: 0.8,
          progress: 0,
          status: 'pending' as const,
          source: 'autonomous' as const,
          parameters: {
            itemType: 'crafting_table',
            quantity: 1,
            placementLocation: 'nearby_safe_area',
          },
          steps: [
            {
              id: 'place-table-step-1',
              label: 'Find suitable location',
              done: false,
              order: 1,
              estimatedDuration: 3000,
            },
            {
              id: 'place-table-step-2',
              label: 'Place crafting table',
              done: false,
              order: 2,
              estimatedDuration: 2000,
            },
          ],
          metadata: {
            createdAt: Date.now(),
            updatedAt: Date.now(),
            retryCount: 0,
            maxRetries: 3,
            childTaskIds: [],
            tags: ['prerequisite', 'placement'],
            category: 'placement',
            requirement: { type: 'crafting_table', quantity: 1 },
          },
        });
      }

      // Check if we need to craft intermediate materials
      if (
        taskTitle.includes('wooden_pickaxe') ||
        taskTitle.includes('wooden_axe')
      ) {
        const hasPlanks = inventory.some((item: any) =>
          item.type?.toLowerCase().includes('planks')
        );
        const hasSticks = inventory.some((item: any) =>
          item.type?.toLowerCase().includes('stick')
        );

        if (!hasPlanks) {
          subtasks.push({
            id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: 'Craft Wood Planks',
            description: 'Craft wood planks from logs for tool crafting',
            type: 'crafting',
            priority: task.priority + 2,
            urgency: 0.8,
            progress: 0,
            status: 'pending' as const,
            source: 'autonomous' as const,
            parameters: {
              itemType: 'oak_planks',
              quantity: 4,
              requiresLogs: true,
            },
            steps: [
              {
                id: 'craft-planks-step-1',
                label: 'Check wood availability',
                done: false,
                order: 1,
                estimatedDuration: 2000,
              },
              {
                id: 'craft-planks-step-2',
                label: 'Craft planks from logs',
                done: false,
                order: 2,
                estimatedDuration: 3000,
              },
            ],
            metadata: {
              createdAt: Date.now(),
              updatedAt: Date.now(),
              retryCount: 0,
              maxRetries: 3,
              childTaskIds: [],
              tags: ['prerequisite', 'crafting'],
              category: 'crafting',
              requirement: { type: 'oak_planks', quantity: 4 },
            },
          });
        }

        if (!hasSticks) {
          subtasks.push({
            id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: 'Craft Sticks',
            description: 'Craft sticks from planks for tool crafting',
            type: 'crafting',
            priority: task.priority + 3,
            urgency: 0.8,
            progress: 0,
            status: 'pending' as const,
            source: 'autonomous' as const,
            parameters: {
              itemType: 'stick',
              quantity: 4,
              requiresPlanks: true,
            },
            steps: [
              {
                id: 'craft-sticks-step-1',
                label: 'Check plank availability',
                done: false,
                order: 1,
                estimatedDuration: 2000,
              },
              {
                id: 'craft-sticks-step-2',
                label: 'Craft sticks from planks',
                done: false,
                order: 2,
                estimatedDuration: 3000,
              },
            ],
            metadata: {
              createdAt: Date.now(),
              updatedAt: Date.now(),
              retryCount: 0,
              maxRetries: 3,
              childTaskIds: [],
              tags: ['prerequisite', 'crafting'],
              category: 'crafting',
              requirement: { type: 'stick', quantity: 4 },
            },
          });
        }
      }

      // Add all subtasks
      for (const subtask of subtasks) {
        const result = await enhancedTaskIntegration.addTask(subtask);
        if (result && result.id) {
          console.log(`✅ Added crafting subtask: ${subtask.title}`);
        } else {
          console.log(`Task already exists: ${subtask.title}`);
        }
      }

      console.log(
        `🔧 Generated ${subtasks.length} subtasks for complex crafting`
      );
    }
  } catch (error) {
    console.error('Error generating complex crafting subtasks:', error);
  }
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
    global.__planningExecutorState.running = true;
    const startTs = Date.now();

    logOptimizer.log(
      '🤖 Running autonomous task executor...',
      'autonomous-executor-running'
    );

    // Get active tasks directly from the enhanced task integration
    const activeTasks = enhancedTaskIntegration.getActiveTasks();

    console.log(
      `🤖 [AUTONOMOUS EXECUTOR] Found ${activeTasks.length} active tasks`
    );
    if (activeTasks.length > 0) {
      console.log(
        `🤖 [AUTONOMOUS EXECUTOR] Top task: ${activeTasks[0].title} (${activeTasks[0].type})`
      );
      console.log(
        `🤖 [AUTONOMOUS EXECUTOR] Task status: ${activeTasks[0].status}, priority: ${activeTasks[0].priority}`
      );
    }

    if (activeTasks.length === 0) {
      console.log('🤖 [AUTONOMOUS EXECUTOR] No active tasks to execute');
      logOptimizer.log('No active tasks to execute', 'no-active-tasks');
      return;
    }

    // Execute the highest priority task, prioritizing prerequisite tasks
    const currentTask = activeTasks[0]; // Tasks are already sorted by priority

    console.log(
      `🤖 [AUTONOMOUS EXECUTOR] Executing task: ${currentTask.title} (${currentTask.type})`
    );
    console.log(`🤖 [AUTONOMOUS EXECUTOR] Task details:`, {
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
        `🔧 Executing prerequisite task: ${currentTask.title}`,
        `prerequisite-${currentTask.id}`
      );
    }

    // Special handling for cognitive reflection tasks
    if (currentTask.type === 'cognitive_reflection') {
      console.log(
        `🧠 [AUTONOMOUS EXECUTOR] Processing cognitive reflection task: ${currentTask.title}`
      );
      console.log(
        `🧠 [AUTONOMOUS EXECUTOR] Thought content: ${currentTask.parameters?.thoughtContent?.substring(0, 100)}...`
      );
      console.log(
        `🧠 [AUTONOMOUS EXECUTOR] Signals received: ${currentTask.parameters?.signals?.length || 0}`
      );

      // Mark cognitive reflection as completed since behavior tree already processed it
      await enhancedTaskIntegration.updateTaskStatus(
        currentTask.id,
        'completed'
      );
      console.log(
        `✅ [AUTONOMOUS EXECUTOR] Cognitive reflection task completed`
      );
      return;
    }

    // Only log task execution if progress has changed or it's a new task
    const taskKey = `task-execution-${currentTask.id}`;
    const currentProgress = Math.round((currentTask.progress || 0) * 100);

    logOptimizer.log(
      `🎯 Executing task: ${currentTask.title} (${currentProgress}% complete)`,
      taskKey
    );

    // Circuit breaker around bot health
    const botConnected = await checkBotConnection();
    if (!botConnected) {
      const st = global.__planningExecutorState;
      if (st.breaker === 'closed') {
        st.breaker = 'open';
        console.warn('⛔ Bot unavailable — opening circuit');
      }
      // schedule half-open probe next tick
      return;
    } else {
      const st = global.__planningExecutorState;
      if (st.breaker !== 'closed') {
        console.log('✅ Bot reachable — closing circuit');
        st.breaker = 'closed';
        st.failures = 0;
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
        const status =
          currentTask.status === 'pending' ? 'active' : currentTask.status;
        enhancedTaskIntegration.updateTaskProgress(
          currentTask.id,
          clamped,
          status
        );
        const snapshot = computeRequirementSnapshot(inv, requirement);
        enhancedTaskIntegration.updateTaskMetadata(currentTask.id, {
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
          enhancedTaskIntegration.updateTaskProgress(
            currentTask.id,
            1,
            'completed'
          );
          return;
        }
      }
    } catch (e) {
      console.warn('Inventory progress estimation failed:', e);
    }

    // Track if task was executed successfully
    let executionResult = false;

    // Execute MCP option if found
    if (suitableOption) {
      console.log(
        `🎯 Found MCP option: ${suitableOption.name} (${suitableOption.id}) - delegating to MCP execution pipeline`
      );
      enhancedTaskIntegration.updateTaskMetadata(currentTask.id, {
        ...currentTask.metadata,
        updatedAt: Date.now(),
      });
    } else {
      // No MCP option found - execute directly through Minecraft interface
      console.log(
        `🔄 No MCP option found for task: ${currentTask.title} (${currentTask.type}) - executing directly`
      );

      try {
        const execResult = await executeTask(currentTask);
        executionResult = execResult.success;

        if (execResult.success) {
          console.log(
            `✅ Task executed successfully: ${currentTask.title} (${execResult.completedSteps || 0} steps completed)`
          );

          // Update task status
          await enhancedTaskIntegration.updateTaskStatus(
            currentTask.id,
            'completed'
          );

          return; // Task completed successfully
        } else {
          console.warn(
            `⚠️ Task execution failed: ${currentTask.title} - ${execResult.error}`
          );

          // Update task with failure
          await enhancedTaskIntegration.updateTaskStatus(
            currentTask.id,
            'failed'
          );

          return; // Task failed, don't continue
        }
      } catch (error) {
        console.error(`❌ Task execution error: ${currentTask.title}`, error);

        // Update task with error
        await enhancedTaskIntegration.updateTaskStatus(
          currentTask.id,
          'failed'
        );

        return; // Task failed, don't continue
      }
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
        placement: {
          leafName: 'place_block',
          args: {
            item: currentTask.parameters?.item || 'crafting_table',
            pos: currentTask.parameters?.pos,
          },
        },
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
      // Build HRM/LLM-inspired candidate set based on intent + inventory
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
            `❌ Task failed after ${retryCount} retries, marking as failed: ${currentTask.title}`
          );
          enhancedTaskIntegration.updateTaskProgress(
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
            enhancedTaskIntegration.addStepsBeforeCurrent(currentTask.id, [
              { label: 'Locate nearby wood' },
              { label: 'Move to resource location' },
              { label: 'Collect wood safely' },
            ]);
            return;
          }
        }

        // Annotate current step with leaf and parameters for verification clarity
        try {
          enhancedTaskIntegration.annotateCurrentStepWithLeaf(
            currentTask.id,
            selectedLeaf.leafName,
            selectedLeaf.args
          );
        } catch (e) {
          console.error('[MCP] Failed to annotate current step with leaf:', e);
        }

        // Execute the leaf via the Minecraft Interface action API
        const actionTool = `minecraft.${selectedLeaf.leafName}`;
        const actionResult = await toolExecutor.execute(
          actionTool,
          selectedLeaf.args || {}
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
        console.error(
          `❌ Leaf execution failed: ${selectedLeaf.leafName} ${actionResult?.error}`
        );

        // Increment retry count
        const newRetryCount = retryCount + 1;

        // If resource not found for dig_block, inject exploration step instead of spinning
        if (
          selectedLeaf.leafName === 'dig_block' &&
          typeof actionResult?.error === 'string' &&
          /no .*found/i.test(actionResult.error)
        ) {
          await enhancedTaskIntegration.addTask({
            title: `Explore for ${leafConfig.args?.blockType || 'resource'}`,
            description: 'Search area to find resources',
            type: 'exploration',
            priority: Math.max(0.9, (currentTask.priority || 0.5) + 0.05),
            urgency: 0.6,
            source: 'autonomous' as const,
            parameters: { target: 'exploration_target' },
            metadata: {
              category: 'exploration',
              tags: ['dynamic', 'explore'],
              createdAt: Date.now(),
              updatedAt: Date.now(),
              retryCount: 0,
              maxRetries: 3,
              parentTaskId: currentTask.id,
              childTaskIds: [],
            },
          });
        }

        if (newRetryCount >= maxRetries) {
          enhancedTaskIntegration.updateTaskProgress(
            currentTask.id,
            currentTask.progress || 0,
            'failed'
          );
          console.log(
            `❌ Task marked as failed after ${newRetryCount} retries: ${currentTask.title}`
          );
        } else {
          enhancedTaskIntegration.updateTaskMetadata(currentTask.id, {
            ...currentTask.metadata,
            retryCount: newRetryCount,
            lastRetry: Date.now(),
          });
          // Add chest search fallback on retry if crafting pickaxe
          if (
            leafConfig.leafName === 'craft_recipe' &&
            /pickaxe/i.test(currentTask.title || '')
          ) {
            enhancedTaskIntegration.addStepsBeforeCurrent(currentTask.id, [
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
          `❌ Task failed after ${retryCount} retries, marking as failed: ${currentTask.title}`
        );
        enhancedTaskIntegration.updateTaskProgress(
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
            enhancedTaskIntegration.addStepsBeforeCurrent(currentTask.id, [
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
            enhancedTaskIntegration.addStepsBeforeCurrent(currentTask.id, [
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
        enhancedTaskIntegration.annotateCurrentStepWithOption(
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
          `❌ MCP option execution failed: ${suitableOption.name} ${mcpResult?.error}`
        );

        // If this option was a dig/gather and resource not found, add exploration
        if (
          suitableOption.name.toLowerCase().includes('gather') &&
          typeof mcpResult?.error === 'string' &&
          /no .*found/i.test(mcpResult.error)
        ) {
          await enhancedTaskIntegration.addTask({
            title: `Explore for ${desiredBlock || 'resource'}`,
            description: 'Search area to find resources',
            type: 'exploration',
            priority: Math.max(0.9, (currentTask.priority || 0.5) + 0.05),
            urgency: 0.6,
            source: 'autonomous' as const,
            parameters: { target: 'exploration_target' },
            metadata: {
              category: 'exploration',
              tags: ['dynamic', 'explore'],
              createdAt: Date.now(),
              updatedAt: Date.now(),
              retryCount: 0,
              maxRetries: 3,
              parentTaskId: currentTask.id,
              childTaskIds: [],
            },
          });
        }

        // Increment retry count
        const newRetryCount = retryCount + 1;

        if (newRetryCount >= maxRetries) {
          // Update task status using the enhanced task integration
          enhancedTaskIntegration.updateTaskProgress(
            currentTask.id,
            currentTask.progress || 0,
            'failed'
          );
          console.log(
            `❌ Task marked as failed after ${newRetryCount} retries: ${currentTask.title}`
          );
        } else {
          // Update retry count using the enhanced task integration
          enhancedTaskIntegration.updateTaskMetadata(currentTask.id, {
            ...currentTask.metadata,
            retryCount: newRetryCount,
            lastRetry: Date.now(),
          });
          // If crafting and missing wood, add a chest-search fallback step on retry
          if (
            currentTask.type === 'crafting' &&
            /pickaxe/i.test(currentTask.title || '')
          ) {
            enhancedTaskIntegration.addStepsBeforeCurrent(currentTask.id, [
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

        if (minecraftAction) {
          console.log(`🔄 Executing task: ${currentTask.title}`);

          // Execute real Minecraft action
          const actionResult = await executeActionWithBotCheck(minecraftAction);

          if (actionResult.ok) {
            console.log(`✅ Task executed successfully: ${currentTask.title}`);

            await recomputeProgressAndMaybeComplete(currentTask);
          } else {
            console.error(
              `❌ Task execution failed: ${currentTask.title}`,
              actionResult.error
            );

            // Increment retry count for failed execution
            const retryCount = (currentTask.metadata?.retryCount || 0) + 1;
            const maxRetries = currentTask.metadata?.maxRetries || 3;

            if (retryCount >= maxRetries) {
              enhancedTaskIntegration.updateTaskProgress(
                currentTask.id,
                currentTask.progress || 0,
                'failed'
              );
              console.log(
                `❌ Task marked as failed after ${retryCount} retries: ${currentTask.title}`
              );
            } else {
              enhancedTaskIntegration.updateTaskMetadata(currentTask.id, {
                ...currentTask.metadata,
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
        console.error(`❌ Task execution error: ${currentTask.title}`, error);
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
  planningEndpoint: 'http://localhost:3002',
  cognitiveEndpoint: 'http://localhost:3003',
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

const integratedPlanningCoordinator = new IntegratedPlanningCoordinator({
  hrmConfig: {
    hrmLatencyTarget: 100,
    qualityThreshold: 0.7,
    maxRefinements: 3,
    enableIterativeRefinement: true,
  },
});

const enhancedGoalManager = new EnhancedGoalManager();
const enhancedReactiveExecutor = new EnhancedReactiveExecutor();
const enhancedTaskIntegration = new EnhancedTaskIntegration({
  enableRealTimeUpdates: true,
  enableProgressTracking: true,
  enableTaskStatistics: true,
  enableTaskHistory: true,
  maxTaskHistory: 1000,
  progressUpdateInterval: 5000,
  dashboardEndpoint: 'http://localhost:3000',
  // Enable action verification with real-world checks
  enableActionVerification: true,
});

const enhancedMemoryIntegration = new EnhancedMemoryIntegration({
  enableRealTimeUpdates: true,
  enableReflectiveNotes: true,
  enableEventLogging: true,
  dashboardEndpoint: 'http://localhost:3000',
  memorySystemEndpoint: 'http://localhost:3001',
  maxEvents: 100,
  maxNotes: 50,
});

const enhancedEnvironmentIntegration = new EnhancedEnvironmentIntegration({
  enableRealTimeUpdates: true,
  enableEntityDetection: true,
  enableInventoryTracking: true,
  enableResourceAssessment: true,
  dashboardEndpoint: 'http://localhost:3000',
  worldSystemEndpoint: 'http://localhost:3004',
  minecraftEndpoint: 'http://localhost:3005',
  updateInterval: 15000, // Increased from 5000ms to 15000ms to reduce load
  maxEntityDistance: 50,
  maxBlockDistance: 20,
});

const enhancedLiveStreamIntegration = new EnhancedLiveStreamIntegration({
  enableRealTimeUpdates: true,
  enableActionLogging: true,
  enableVisualFeedback: true,
  enableMiniMap: true,
  enableScreenshots: true,
  dashboardEndpoint: 'http://localhost:3000',
  minecraftEndpoint: 'http://localhost:3005',
  screenshotEndpoint: 'http://localhost:3005/screenshots',
  updateInterval: 10000, // Reduced from 2000ms to 10000ms to reduce load
  maxActionLogs: 100, // Reduced from 1000 to 100 to save memory
  maxVisualFeedbacks: 50, // Reduced from 100 to 50 to save memory
  screenshotInterval: 30000, // Increased from 10000ms to 30000ms to reduce load
});

// Create planning system interface
const planningSystem: PlanningSystem = {
  goalFormulation: {
    getCurrentGoals: () => enhancedGoalManager.listGoals(),
    getActiveGoals: () =>
      enhancedGoalManager.getGoalsByStatus(GoalStatus.PENDING),
    getGoalCount: () => enhancedGoalManager.listGoals().length,
    addGoal: async (goal: any) => {
      try {
        enhancedGoalManager.upsert(goal);
        return { success: true, goalId: goal.id };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Failed to add goal',
        };
      }
    },
    reprioritizeGoal: (goalId: string, p?: number, u?: number) =>
      enhancedGoalManager.reprioritize(goalId, p, u),
    cancelGoal: (goalId: string, reason?: string) =>
      enhancedGoalManager.cancel(goalId, reason),
    pauseGoal: (goalId: string) => enhancedGoalManager.pause(goalId),
    resumeGoal: (goalId: string) => enhancedGoalManager.resume(goalId),
    completeGoal: (goalId: string) => enhancedGoalManager.complete(goalId),
    getCurrentTasks: () => enhancedTaskIntegration.getActiveTasks(),
    addTask: async (task: any) => await enhancedTaskIntegration.addTask(task),
    getCompletedTasks: () =>
      enhancedTaskIntegration.getTasks({ status: 'completed' }),
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

        // Execute the goal through the enhanced reactive executor
        const result = await enhancedReactiveExecutor.executeTask(goal);

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
          `❌ Goal execution failed: ${goal.title || goal.id}`,
          result.error
        );
        return {
          success: false,
          message: result.error || 'Goal execution failed',
          result,
        };
      } catch (error) {
        console.error(
          `❌ Goal execution error: ${goal.title || goal.id}`,
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

        // Execute the task through the enhanced reactive executor
        const result = await enhancedReactiveExecutor.executeTask(task);

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
          `❌ Task execution failed: ${task.title || task.id}`,
          result.error
        );
        return {
          success: false,
          message: result.error || 'Task execution failed',
          result,
        };
      } catch (error) {
        console.error(
          `❌ Task execution error: ${task.title || task.id}`,
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
enhancedTaskIntegration.on('taskAdded', (task) => {
  console.log('Task added to enhanced integration:', task.title);
});

enhancedTaskIntegration.on(
  'taskProgressUpdated',
  ({ task, oldProgress, oldStatus }) => {
    console.log(
      `Task progress updated: ${task.title} - ${Math.round(task.progress * 100)}% (${oldStatus} -> ${task.status})`
    );
  }
);

// Main server startup function
async function startServer() {
  try {
    // Create an EnhancedRegistry for MCP integration
    const registry = new EnhancedRegistry();

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

        console.log('✅ MCP integration connected to behavior tree runner');
      }
    } catch (error) {
      console.warn(
        '⚠️ Failed to connect MCP integration to behavior tree runner:',
        error
      );
    }

    // Register placeholder Minecraft leaves with both the EnhancedRegistry and MCP
    try {
      const mcpIntegration = serverConfig.getMCPIntegration();
      if (mcpIntegration) {
        console.log('📝 Registering core Minecraft leaves in planning...');

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
          inputSchema: any = { type: 'object', additionalProperties: true }
        ): any => ({
          spec: {
            name,
            version,
            description: `${name} (placeholder)` as any,
            inputSchema,
            timeoutMs: 5000,
            retries: 0,
            permissions,
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

        console.log(`✅ Registered ${registered} core leaves in planning`);
      }
    } catch (e) {
      console.warn('⚠️ Core leaf registration in planning failed:', e);
    }

    // Mount planning endpoints
    const planningRouter = createPlanningEndpoints(planningSystem);
    serverConfig.mountRouter('/', planningRouter);

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
              `❌ Error during MCP option registration for ${opt.name}:`,
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

    // Start autonomous task executor (singleton; supports hot-reload)
    if (global.__planningInterval) clearInterval(global.__planningInterval);
    global.__planningInterval = setInterval(async () => {
      try {
        const st = global.__planningExecutorState!;
        // exponential backoff while breaker is open
        if (st?.breaker === 'open') {
          const elapsed = Date.now() - (st.lastAttempt || 0);
          if (elapsed < BOT_BREAKER_OPEN_MS) return;
          st.breaker = 'half-open';
        }
        try {
          await autonomousTaskExecutor();
        } catch (error) {
          const s = global.__planningExecutorState!;
          s.failures = Math.min(s.failures + 1, 100);
          const backoff = Math.min(
            2 ** s.failures * 250,
            EXECUTOR_MAX_BACKOFF_MS
          );
          console.warn(
            `Autonomous executor error (${s.failures}); backoff ${backoff}ms`
          );
          await new Promise((r) => setTimeout(r, backoff));
        }
      } catch (error) {
        console.error('[MCP] Failed to start autonomous task executor:', error);
      }
    }, EXECUTOR_POLL_MS);

    // Start cognitive thought processor
    try {
      console.log('Starting cognitive thought processor...');
      cognitiveThoughtProcessor.startProcessing();
    } catch (error) {
      console.warn(
        '⚠️ Cognitive thought processor failed to start, continuing without it:',
        error
      );
    }

    console.log('✅ Modular planning server started successfully');
  } catch (error) {
    console.error('❌ Failed to start modular planning server:', error);
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
  enhancedTaskIntegration,
  enhancedMemoryIntegration,
  enhancedEnvironmentIntegration,
  enhancedLiveStreamIntegration,
};

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}
