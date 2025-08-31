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
import { EnhancedRegistry } from '@conscious-bot/core';
import { WorldStateManager } from './world-state/world-state-manager';
import { WorldKnowledgeIntegrator } from './world-state/world-knowledge-integrator';

// Centralized Minecraft endpoint and resilient HTTP utilities
const MC_ENDPOINT = process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005';
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

// Simple circuit breaker state for Minecraft interface calls
let mcFailureCount = 0;
let mcCircuitOpenUntil = 0; // epoch ms until which circuit is open

function mcCircuitOpen(): boolean {
  return Date.now() < mcCircuitOpenUntil;
}

function mcRecordFailure(): void {
  mcFailureCount += 1;
  if (mcFailureCount >= 3) {
    // Open the circuit for 30s after 3 consecutive failures
    mcCircuitOpenUntil = Date.now() + 30_000;
  }
}

function mcRecordSuccess(): void {
  mcFailureCount = 0;
  mcCircuitOpenUntil = 0;
}

async function mcFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  if (mcCircuitOpen()) {
    throw new Error('Minecraft endpoint circuit open');
  }
  const url = `${MC_ENDPOINT}${path.startsWith('/') ? '' : '/'}${path}`;
  const retries = 2;
  const baseDelay = 300;
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        init.timeoutMs ?? 10_000
      );
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        mcRecordSuccess();
        return res;
      }
      // Retry on 5xx
      if (res.status >= 500 && res.status < 600 && attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      // Non-retryable status
      mcRecordFailure();
      return res;
    } catch (err: any) {
      lastErr = err;
      // Retry on network/abort errors
      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      mcRecordFailure();
      throw err;
    }
  }
  mcRecordFailure();
  throw lastErr || new Error('Unknown mcFetch error');
}

async function mcPostJson<T = any>(
  path: string,
  body: any,
  timeoutMs?: number
): Promise<{ ok: boolean; data?: T; error?: string; raw?: Response }> {
  try {
    const res = await mcFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text}`, raw: res };
    }
    const json = (await res.json()) as T;
    return { ok: true, data: json, raw: res };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

// Declare global properties used for scheduling to satisfy TS in ESM modules
declare global {
  // Reentrancy guard state for the autonomous executor
  // eslint-disable-next-line no-var
  var __planningExecutorState: { running: boolean } | undefined;
  // Interval handle for executor loop
  // eslint-disable-next-line no-var
  var __planningInterval: NodeJS.Timeout | undefined;
  // Timeout handle for initial kick
  // eslint-disable-next-line no-var
  var __planningInitialKick: NodeJS.Timeout | undefined;
}

// Initialize tool executor that connects to Minecraft interface
// If MCP_ONLY env var is set ("true"), skip direct /action fallback in favor of MCP tools
const MCP_ONLY = String(process.env.MCP_ONLY || '').toLowerCase() === 'true';

const toolExecutor = {
  async execute(tool: string, args: Record<string, any>) {
    console.log(`Executing tool: ${tool} with args:`, args);

    try {
      // Map BT actions to Minecraft actions
      const mappedAction = mapBTActionToMinecraft(tool, args);

      if (!mappedAction) {
        return {
          ok: false,
          data: null,
          environmentDeltas: {},
          error: 'No mapped action',
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
        };
      }

      // Use the bot connection check for Minecraft actions
      return await executeActionWithBotCheck(mappedAction);
    } catch (error) {
      console.error(`Tool execution failed for ${tool}:`, error);
      return {
        ok: false,
        data: null,
        environmentDeltas: {},
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Extract the target item name from a task description
 */
function extractItemFromTask(task: any): string {
  const title = (task.title || '').toLowerCase();
  const description = (task.description || '').toLowerCase();
  const text = `${title} ${description}`;

  // Check for specific tools first
  if (text.includes('pickaxe')) {
    return 'wooden_pickaxe';
  }
  if (text.includes('axe')) {
    return 'wooden_axe';
  }
  if (text.includes('sword')) {
    return 'wooden_sword';
  }
  if (text.includes('shovel')) {
    return 'wooden_shovel';
  }
  if (text.includes('hoe')) {
    return 'wooden_hoe';
  }
  if (text.includes('stick')) {
    return 'stick';
  }
  if (text.includes('plank')) {
    return 'oak_planks';
  }
  if (text.includes('crafting table')) {
    return 'crafting_table';
  }
  if (text.includes('torch')) {
    return 'torch';
  }
  if (text.includes('door')) {
    return 'oak_door';
  }
  if (text.includes('fence')) {
    return 'oak_fence';
  }
  if (text.includes('chest')) {
    return 'chest';
  }
  if (text.includes('furnace')) {
    return 'furnace';
  }

  // Check for generic crafting terms
  if (text.includes('tool')) {
    // Default to wooden pickaxe for generic tool requests
    return 'wooden_pickaxe';
  }
  if (text.includes('item')) {
    // Default to wooden planks for generic item requests
    return 'oak_planks';
  }

  // Fallback to a basic craftable item
  return 'oak_planks';
}

/**
 * Map task types to real Minecraft actions
 */
function mapTaskTypeToMinecraftAction(task: any) {
  console.log(`🔧 Mapping task type: ${task.type} for task: ${task.title}`);

  switch (task.type) {
    case 'gathering':
      return {
        type: 'gather',
        parameters: {
          resource: task.title.toLowerCase().includes('wood')
            ? 'wood'
            : 'resource',
          amount: 3,
          target: task.title.toLowerCase().includes('wood')
            ? 'tree'
            : 'resource',
        },
        timeout: 15000,
      };
    case 'gather':
      return {
        type: 'gather',
        parameters: {
          resource:
            task.parameters?.resource ||
            (task.title.toLowerCase().includes('wood') ? 'wood' : 'resource'),
          amount: task.parameters?.amount || 3,
          target: task.parameters?.target || 'tree',
        },
        timeout: 15000,
      };

    case 'crafting':
      return {
        type: 'craft',
        parameters: {
          item: extractItemFromTask(task),
          quantity: 1,
        },
        timeout: 15000,
      };

    case 'mining':
      return {
        type: 'mine_block',
        parameters: {
          blockType: task.title.toLowerCase().includes('iron')
            ? 'iron_ore'
            : 'stone',
          position: { x: 0, y: 0, z: 0 }, // Will be determined by bot
        },
        timeout: 15000,
      };

    case 'exploration':
      return {
        type: 'navigate',
        parameters: {
          target: 'exploration_target',
          distance: 10,
        },
        timeout: 15000,
      };

    case 'placement':
      return {
        type: 'place_block',
        parameters: {
          block_type: task.parameters?.itemType || 'crafting_table',
          count: task.parameters?.quantity || 1,
          placement: 'around_player',
        },
        timeout: 15000,
      };

    case 'building':
      return {
        type: 'place_block',
        parameters: {
          block_type: extractItemFromTask(task),
          count: task.parameters?.quantity || 1,
          placement: 'around_player',
        },
        timeout: 15000,
      };

    default:
      logOptimizer.warn(
        `⚠️ No action mapping for task type: ${task.type}`,
        `no-action-mapping-${task.type}`
      );
      return null;
  }
}

/**
 * Map Behavior Tree actions to Minecraft actions
 */
function mapBTActionToMinecraft(tool: string, args: Record<string, any>) {
  console.log(`🔧 Mapping BT action: ${tool} with args:`, args);

  const debugInfo = { originalAction: tool, args: args };

  switch (tool) {
    case 'scan_for_trees':
      return {
        type: 'wait',
        parameters: { duration: 2000 },
      };

    case 'pathfind':
      return {
        type: 'move_forward',
        parameters: { distance: args.distance || 1 },
      };

    case 'scan_tree_structure':
      return {
        type: 'wait',
        parameters: { duration: 1000 },
      };

    case 'dig_blocks':
      return {
        type: 'dig_block',
        parameters: {
          pos: args.position || 'current',
          tool: args.tool || 'axe',
        },
      };

    case 'collect_items':
      return {
        type: 'pickup_item',
        parameters: { radius: args.radius || 3 },
      };

    case 'clear_3x3_area':
      return {
        type: 'mine_block',
        parameters: {
          position: args.position || 'current',
          tool: args.tool || 'pickaxe',
          area: { x: 3, y: 2, z: 3 },
        },
        debug: debugInfo,
      };

    case 'place_blocks':
      const pattern = args.pattern || 'single';
      const blockType = args.block || 'stone';

      if (pattern === '3x3_floor') {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 9,
            placement: 'pattern_3x3_floor',
          },
        };
      } else if (pattern === '3x3_walls_2_high') {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 12,
            placement: 'pattern_3x3_walls',
          },
        };
      } else if (pattern === '3x3_roof') {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 9,
            placement: 'pattern_3x3_roof',
          },
        };
      } else {
        return {
          type: 'place_block',
          parameters: {
            block_type: blockType,
            count: 1,
            placement: 'around_player',
          },
        };
      }

    case 'place_door':
      return {
        type: 'place_block',
        parameters: {
          block_type: 'oak_door',
          count: 1,
          placement: 'specific_position',
          position: args.position || 'front_center',
        },
      };

    case 'place_torch':
      return {
        type: 'place_block',
        parameters: {
          block_type: 'torch',
          count: 1,
          placement:
            args.position === 'center_wall'
              ? 'specific_position'
              : 'around_player',
          position: args.position || 'around_player',
        },
      };

    case 'wait':
      return {
        type: 'wait',
        parameters: { duration: args.duration || 2000 },
      };

    default:
      console.log(
        `⚠️ Unknown BT action: ${tool}, falling through to default case`
      );
      return {
        type: tool,
        parameters: args,
        debug: debugInfo,
      };
  }
}

/**
 * Execute action with bot connection check
 */
async function executeActionWithBotCheck(action: any) {
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
export type InventoryItem = {
  name?: string | null;
  displayName?: string;
  type?: string | number | null;
  count?: number;
  slot?: number;
};

async function fetchInventorySnapshot(): Promise<InventoryItem[]> {
  try {
    // Prefer cached inventory from world-state manager
    const cached = worldStateManager.getInventory();
    if (cached && cached.length) return cached as InventoryItem[];
    if (mcCircuitOpen()) return [];
    const res = await mcFetch('/inventory', { method: 'GET', timeoutMs: 3000 });
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    return Array.isArray(json?.data) ? (json.data as InventoryItem[]) : [];
  } catch {
    return [];
  }
}

function itemMatches(item: InventoryItem, patterns: string[]): boolean {
  const s = (
    item.name ||
    item.displayName ||
    (typeof item.type === 'string' ? item.type : '') ||
    ''
  )
    .toString()
    .toLowerCase();
  return patterns.some((p) => s.includes(p));
}

function countItems(inv: InventoryItem[], patterns: string[]): number {
  return inv.reduce(
    (sum, it) => sum + (itemMatches(it, patterns) ? it.count || 1 : 0),
    0
  );
}

function hasPickaxe(inv: InventoryItem[]): boolean {
  return inv.some((it) =>
    itemMatches(it, ['wooden_pickaxe', 'wooden pickaxe'])
  );
}

function hasEnoughLogs(inv: InventoryItem[], minLogs = 2): boolean {
  const logs = countItems(inv, ['_log', ' log']);
  return logs >= minLogs;
}

function hasStonePickaxe(inv: InventoryItem[]): boolean {
  return inv.some((it) => itemMatches(it, ['stone_pickaxe', 'stone pickaxe']));
}

function hasCraftingTableItem(inv: InventoryItem[]): boolean {
  return inv.some((it) => itemMatches(it, ['crafting_table']));
}

function hasSticks(inv: InventoryItem[], min = 2): boolean {
  return countItems(inv, ['stick']) >= min;
}

function hasPlanks(inv: InventoryItem[], min = 5): boolean {
  return countItems(inv, ['oak_planks', 'planks']) >= min;
}

function hasCobblestone(inv: InventoryItem[], min = 3): boolean {
  return countItems(inv, ['cobblestone']) >= min;
}

function inferRecipeFromTitle(title: string): string | null {
  const t = (title || '').toLowerCase();
  if (t.includes('wooden pickaxe')) return 'wooden_pickaxe';
  if (t.includes('stone pickaxe')) return 'stone_pickaxe';
  if (t.includes('stick')) return 'stick';
  if (t.includes('crafting table')) return 'crafting_table';
  if (t.includes('plank')) return 'oak_planks';
  return null;
}

function inferBlockTypeFromTitle(title: string): string | null {
  const t = (title || '').toLowerCase();
  if (t.includes('iron')) return 'iron_ore';
  if (t.includes('wood') || t.includes('log')) return 'oak_log';
  if (t.includes('stone') || t.includes('cobble')) return 'stone';
  return null;
}

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
  } catch {}
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
 */
type TaskRequirement =
  | { kind: 'collect'; patterns: string[]; quantity: number }
  | { kind: 'mine'; patterns: string[]; quantity: number }
  | {
      kind: 'craft';
      outputPattern: string;
      quantity: number;
      proxyPatterns?: string[];
    };

export function parseRequiredQuantityFromTitle(
  title: string | undefined,
  fallback: number
): number {
  if (!title) return fallback;
  const m = String(title).match(/(\d{1,3})/);
  return m ? Math.max(1, parseInt(m[1], 10)) : fallback;
}

export function resolveRequirement(task: any): TaskRequirement | null {
  const ttl = (task.title || '').toLowerCase();
  // Prefer explicit crafting intent first
  if (task.type === 'crafting' && /pickaxe/.test(ttl)) {
    return {
      kind: 'craft',
      outputPattern: 'wooden_pickaxe',
      quantity: 1,
      proxyPatterns: ['oak_log', '_log', ' log', 'plank', 'stick'],
    };
  }
  // Gathering/mining rules next
  if (task.type === 'gathering' || /\bgather\b|\bcollect\b/.test(ttl)) {
    const qty = parseRequiredQuantityFromTitle(task.title, 8);
    return {
      kind: 'collect',
      patterns: [
        'oak_log',
        'birch_log',
        'spruce_log',
        'jungle_log',
        'acacia_log',
        'dark_oak_log',
      ],
      quantity: qty,
    };
  }
  if (task.type === 'mining' || /\bmine\b|\biron\b/.test(ttl)) {
    const qty = parseRequiredQuantityFromTitle(task.title, 3);
    return { kind: 'mine', patterns: ['iron_ore'], quantity: qty };
  }
  // Titles that explicitly mention wood but aren't crafting
  if (/\bwood\b/.test(ttl)) {
    const qty = parseRequiredQuantityFromTitle(task.title, 8);
    return {
      kind: 'collect',
      patterns: [
        'oak_log',
        'birch_log',
        'spruce_log',
        'jungle_log',
        'acacia_log',
        'dark_oak_log',
      ],
      quantity: qty,
    };
  }
  return null;
}

export function computeProgressFromInventory(
  inv: InventoryItem[],
  req: TaskRequirement
): number {
  if (req.kind === 'collect' || req.kind === 'mine') {
    const have = countItems(inv, req.patterns);
    return Math.max(0, Math.min(1, have / req.quantity));
  }
  if (req.kind === 'craft') {
    // If output item present, done
    const hasOutput = inv.some((it) => itemMatches(it, [req.outputPattern]));
    if (hasOutput) return 1;
    // Otherwise estimate progress using proxy materials if available
    const proxy = req.proxyPatterns || [];
    if (proxy.length) {
      const have = countItems(inv, proxy);
      // Heuristic: assume 3 logs worth gets you near completion for a wooden pickaxe
      const estimate = Math.max(0, Math.min(1, have / 3));
      return estimate;
    }
    return 0;
  }
  return 0;
}

export function computeRequirementSnapshot(
  inv: InventoryItem[],
  req: TaskRequirement
) {
  if (req.kind === 'collect' || req.kind === 'mine') {
    const have = countItems(inv, req.patterns);
    return {
      kind: req.kind,
      quantity: req.quantity,
      have,
      needed: Math.max(0, req.quantity - have),
      patterns: req.patterns,
    };
  }
  if (req.kind === 'craft') {
    const hasOutput = inv.some((it) => itemMatches(it, [req.outputPattern]));
    if (hasOutput) {
      return {
        kind: req.kind,
        quantity: req.quantity,
        have: req.quantity,
        needed: 0,
        outputPattern: req.outputPattern,
        proxyPatterns: req.proxyPatterns,
      };
    }
    const proxy = req.proxyPatterns || [];
    const haveProxy = proxy.length ? countItems(inv, proxy) : 0;
    return {
      kind: req.kind,
      quantity: req.quantity,
      have: Math.min(req.quantity, hasOutput ? req.quantity : 0),
      needed: hasOutput ? 0 : req.quantity,
      outputPattern: req.outputPattern,
      proxyPatterns: req.proxyPatterns,
      proxyHave: haveProxy,
    } as any;
  }
  return { kind: (req as any).kind, quantity: (req as any).quantity } as any;
}

/**
 * Wait for bot connection by polling health until timeout
 */
async function waitForBotConnection(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  const poll = async () => {
    const ok = await checkBotConnection();
    if (ok) return true;
    if (Date.now() - start >= timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 500));
    return poll();
  };
  return poll();
}

/**
 * Check if bot is connected and ready for actions
 */
async function checkBotConnection(): Promise<boolean> {
  try {
    if (mcCircuitOpen()) return false;
    // Check if bot is connected to Minecraft via the Minecraft interface
    const response = await mcFetch('/health', {
      method: 'GET',
      timeoutMs: 2000,
    });

    if (response.ok) {
      const status = (await response.json()) as {
        status?: string;
        botStatus?: { connected?: boolean };
      };
      return (
        status.status === 'connected' || status.botStatus?.connected === true
      );
    }

    return false;
  } catch (error) {
    console.warn('Bot connection check failed:', error);
    return false;
  }
}

/**
 * Get bot position from Minecraft interface
 */
async function getBotPosition(): Promise<{
  x: number;
  y: number;
  z: number;
} | null> {
  try {
    if (mcCircuitOpen()) return null;
    const res = await mcFetch('/health', { method: 'GET', timeoutMs: 2000 });
    if (!res.ok) return null;
    const status = (await res.json()) as any;
    const p =
      status?.botStatus?.position || status?.executionStatus?.bot?.position;
    if (
      p &&
      typeof p.x === 'number' &&
      typeof p.y === 'number' &&
      typeof p.z === 'number'
    ) {
      return { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
    }
  } catch (e) {
    console.warn('getBotPosition failed:', e);
  }
  return null;
}

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

    console.log(`🔍 Checking crafting table prerequisite for: ${task.title}`);

    // Check if we have a crafting table in inventory
    const response = await fetch('http://localhost:3005/inventory', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn('Failed to check inventory for crafting table');
      return false;
    }

    const data = (await response.json()) as any;
    const inventory = data.data || [];

    const hasCraftingTable = inventory.some((item: any) =>
      item.type?.toLowerCase().includes('crafting_table')
    );

    if (hasCraftingTable) {
      console.log('✅ Crafting table found in inventory');
      return true;
    }

    // Check if we have the materials to craft a crafting table
    const hasWood = inventory.some(
      (item: any) =>
        item.type?.toLowerCase().includes('log') ||
        item.type?.toLowerCase().includes('wood')
    );

    if (hasWood) {
      console.log(
        '🔧 Crafting table needed but not available. Adding crafting table task...'
      );

      // Add a crafting table task before the current task
      const craftingTableTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: 'Craft Crafting Table',
        description:
          'Create a crafting table to enable advanced crafting recipes',
        type: 'crafting',
        priority: task.priority + 1, // Higher priority than the current task
        urgency: 0.8,
        progress: 0,
        status: 'pending' as const,
        source: 'autonomous' as const,
        parameters: {
          itemType: 'crafting_table',
          quantity: 1,
          requiresWood: true,
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
        console.log(`✅ Added crafting table prerequisite task: ${result.id}`);
      } else {
        console.log('Task already exists: Craft Crafting Table');
      }

      return false; // Current task should wait for crafting table
    } else {
      console.log(
        '⚠️ Need wood to craft a crafting table. Adding wood gathering task...'
      );

      // Add a wood gathering task
      const woodTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: 'Gather Wood for Crafting Table',
        description: 'Collect wood logs to craft a crafting table',
        type: 'gathering',
        priority: task.priority + 2, // Even higher priority
        urgency: 0.9,
        progress: 0,
        status: 'pending' as const,
        source: 'autonomous' as const,
        parameters: {
          itemType: 'oak_log',
          quantity: 4,
          targetLocation: 'nearby_trees',
        },
        steps: [
          {
            id: 'gather-wood-step-1',
            label: 'Locate nearby wood',
            done: false,
            order: 1,
            estimatedDuration: 3000,
          },
          {
            id: 'gather-wood-step-2',
            label: 'Collect wood safely',
            done: false,
            order: 2,
            estimatedDuration: 5000,
          },
        ],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          retryCount: 0,
          maxRetries: 3,
          childTaskIds: [],
          tags: ['prerequisite', 'gathering'],
          category: 'gathering',
          requirement: {
            type: 'oak_log',
            quantity: 4, // Need 4 wood for crafting table
          },
        },
      };

      const result = await enhancedTaskIntegration.addTask(woodTask);
      if (result && result.id) {
        console.log(`✅ Added wood gathering prerequisite task: ${result.id}`);
      } else {
        console.log('Task already exists: Gather Wood for Crafting Table');
      }

      return false; // Current task should wait for wood
    }
  } catch (error) {
    console.error('Error checking crafting table prerequisite:', error);
    return false;
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
      const response = await fetch('http://localhost:3005/inventory', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.warn('Failed to check inventory for complex crafting');
        return;
      }

      const data = (await response.json()) as any;
      const inventory = data.data || [];

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
    logOptimizer.log(
      '🤖 Running autonomous task executor...',
      'autonomous-executor-running'
    );

    // Get active tasks directly from the enhanced task integration
    const activeTasks = enhancedTaskIntegration.getActiveTasks();

    if (activeTasks.length === 0) {
      logOptimizer.log('No active tasks to execute', 'no-active-tasks');
      return;
    }

    // Execute the highest priority task, prioritizing prerequisite tasks
    const currentTask = activeTasks[0]; // Tasks are already sorted by priority

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

    // Only log task execution if progress has changed or it's a new task
    const taskKey = `task-execution-${currentTask.id}`;
    const currentProgress = Math.round((currentTask.progress || 0) * 100);

    logOptimizer.log(
      `🎯 Executing task: ${currentTask.title} (${currentProgress}% complete)`,
      taskKey
    );

    // Check if bot is connected and can perform actions
    const botConnected = await checkBotConnection();
    if (!botConnected) {
      console.log('⚠️ Bot not connected - cannot execute real actions');
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
    const mcpOptions =
      (await serverConfig.getMCPIntegration()!.listOptions('active')) || [];

    // Map task types to MCP options
    const taskTypeMapping: Record<string, string[]> = {
      gathering: ['chop', 'tree', 'wood', 'collect', 'gather'],
      gather: ['chop', 'tree', 'wood', 'collect', 'gather'],
      mine: ['mine', 'dig', 'extract'],
      crafting: ['craft', 'build', 'create'],
      build: ['build', 'place', 'create', 'construct'],
      exploration: ['explore', 'search', 'find'],
      mining: ['mine', 'dig', 'extract'],
      farming: ['farm', 'plant', 'grow'],
      combat: ['fight', 'attack', 'defend'],
      navigation: ['move', 'navigate', 'travel'],
    };

    const searchTerms = taskTypeMapping[currentTask.type] || [currentTask.type];
    const suitableOption = mcpOptions.find((option) =>
      searchTerms.some(
        (term) =>
          option.name?.toLowerCase().includes(term) ||
          option.description?.toLowerCase().includes(term)
      )
    );

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

    // If no BT option found, try to use individual leaves directly
    if (!suitableOption) {
      // Map task types to individual leaves
      const inferredRecipe = inferRecipeFromTitle(currentTask.title);
      const inferredBlock = inferBlockTypeFromTitle(currentTask.title);
      const botPos = await getBotPosition();
      const randomExplore = botPos
        ? {
            x: botPos.x + Math.floor(Math.random() * 20 - 10),
            y: botPos.y,
            z: botPos.z + Math.floor(Math.random() * 20 - 10),
          }
        : undefined;
      const leafMapping: Record<string, { leafName: string; args: any }> = {
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
        mining: {
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
      };

      const leafConfig = leafMapping[currentTask.type];
      if (leafConfig) {
        console.log(`✅ Found suitable leaf for task: ${leafConfig.leafName}`);

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
          leafConfig.leafName === 'craft_recipe' &&
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

        // Execute the leaf directly
        const mcpResult = await serverConfig
          .getMCPIntegration()
          ?.executeTool(`minecraft.${leafConfig.leafName}`, leafConfig.args);

        if (mcpResult?.success) {
          console.log(`✅ Leaf executed successfully: ${leafConfig.leafName}`);

          // After execution, recompute inventory-based progress and gate completion
          try {
            const requirement = resolveRequirement(currentTask);
            if (requirement) {
              const inv = await fetchInventorySnapshot();
              const p = computeProgressFromInventory(inv, requirement);
              enhancedTaskIntegration.updateTaskProgress(
                currentTask.id,
                Math.max(0, Math.min(1, p)),
                'active'
              );
            }
          } catch (e) {
            console.warn('Inventory progress estimation failed:', e);
          }

          // Post-check inventory for crafting outcomes
          if (
            leafConfig.leafName === 'craft_recipe' &&
            /pickaxe/i.test(currentTask.title || '')
          ) {
            const postInv = await fetchInventorySnapshot();
            if (!hasPickaxe(postInv)) {
              console.warn(
                '⚠️ Crafting (leaf) reported success but pickaxe not found. Planning next acquisition step.'
              );
              const injected = await injectDynamicPrereqForCraft(currentTask);
              if (injected) return;
            }
          }

          // Complete the current step instead of artificially incrementing progress
          if (currentTask.steps && Array.isArray(currentTask.steps)) {
            const currentStep = currentTask.steps.find(
              (step: any) => !step.done
            );
            if (currentStep) {
              await enhancedTaskIntegration.completeTaskStep(
                currentTask.id,
                currentStep.id
              );
              console.log(`✅ Completed step: ${currentStep.label}`);
            }

            // Check if all steps are complete
            const allStepsComplete = currentTask.steps.every(
              (step: any) => step.done
            );
            // Only mark as completed if inventory requirement satisfied
            let canComplete = allStepsComplete;
            try {
              const requirement = resolveRequirement(currentTask);
              if (requirement) {
                const inv = await fetchInventorySnapshot();
                const p = computeProgressFromInventory(inv, requirement);
                const snapshot = computeRequirementSnapshot(inv, requirement);
                enhancedTaskIntegration.updateTaskMetadata(currentTask.id, {
                  requirement: snapshot,
                });
                canComplete = p >= 1;
              }
            } catch (e) {
              console.warn('Inventory progress estimation failed:', e);
            }
            if (canComplete) {
              enhancedTaskIntegration.updateTaskProgress(
                currentTask.id,
                1.0,
                'completed'
              );
              console.log(`🎉 Task completed: ${currentTask.title}`);
            }
          } else {
            // If no steps defined, mark task as completed directly
            enhancedTaskIntegration.updateTaskProgress(
              currentTask.id,
              1.0,
              'completed'
            );
            console.log(`🎉 Task completed (no steps): ${currentTask.title}`);
          }

          return; // Exit early since we successfully executed the leaf
        }
        console.error(
          `❌ Leaf execution failed: ${leafConfig.leafName} ${mcpResult?.error}`
        );

        // Increment retry count
        const newRetryCount = retryCount + 1;

        // If resource not found for dig_block, inject exploration step instead of spinning
        if (
          leafConfig.leafName === 'dig_block' &&
          typeof mcpResult?.error === 'string' &&
          /no .*found/i.test(mcpResult.error)
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
        currentTask.parameters?.recipe ||
        inferRecipeFromTitle(currentTask.title) ||
        (currentTask.title.toLowerCase().includes('pickaxe')
          ? 'wooden_pickaxe'
          : currentTask.title.toLowerCase().includes('crafting_table')
            ? 'crafting_table'
            : undefined);
      const desiredBlock =
        currentTask.parameters?.blockType ||
        inferBlockTypeFromTitle(currentTask.title) ||
        (currentTask.title.toLowerCase().includes('iron')
          ? 'iron_ore'
          : 'oak_log');

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

        // Post-check inventory for crafting outcomes
        if (
          currentTask.type === 'crafting' &&
          /pickaxe/i.test(currentTask.title || '')
        ) {
          const postInv = await fetchInventorySnapshot();
          if (!hasPickaxe(postInv)) {
            console.warn(
              '⚠️ Crafting reported success but pickaxe not found in inventory. Planning next acquisition step.'
            );
            const injected = await injectDynamicPrereqForCraft(currentTask);
            if (injected) return; // allow newly injected tasks to run first
          }
        }

        // After execution, recompute inventory-based progress and gate completion
        try {
          const requirement = resolveRequirement(currentTask);
          if (requirement) {
            const inv = await fetchInventorySnapshot();
            const p = computeProgressFromInventory(inv, requirement);
            enhancedTaskIntegration.updateTaskProgress(
              currentTask.id,
              Math.max(0, Math.min(1, p)),
              'active'
            );
            const snapshot = computeRequirementSnapshot(inv, requirement);
            enhancedTaskIntegration.updateTaskMetadata(currentTask.id, {
              requirement: snapshot,
            });
          }
        } catch (e) {
          console.warn('Inventory progress estimation failed:', e);
        }

        // Complete the current step instead of artificially incrementing progress
        if (currentTask.steps && Array.isArray(currentTask.steps)) {
          const currentStep = currentTask.steps.find((step: any) => !step.done);
          if (currentStep) {
            await enhancedTaskIntegration.completeTaskStep(
              currentTask.id,
              currentStep.id
            );
            console.log(`✅ Completed step: ${currentStep.label}`);
          }

          // Check if all steps are complete
          const allStepsComplete = currentTask.steps.every(
            (step: any) => step.done
          );
          // Only mark as completed if inventory requirement satisfied
          let canComplete = allStepsComplete;
          try {
            const requirement = resolveRequirement(currentTask);
            if (requirement) {
              const inv = await fetchInventorySnapshot();
              const p = computeProgressFromInventory(inv, requirement);
              const snapshot = computeRequirementSnapshot(inv, requirement);
              enhancedTaskIntegration.updateTaskMetadata(currentTask.id, {
                requirement: snapshot,
              });
              canComplete = p >= 1;
            }
          } catch (e) {
            console.warn('Inventory progress estimation failed:', e);
          }
          if (canComplete) {
            enhancedTaskIntegration.updateTaskProgress(
              currentTask.id,
              1.0,
              'completed'
            );
            console.log(`🎉 Task completed: ${currentTask.title}`);
          }
        } else {
          // If no steps defined, mark task as completed directly
          // Only complete if inventory requirement satisfied
          let canComplete = true;
          try {
            const requirement = resolveRequirement(currentTask);
            if (requirement) {
              const inv = await fetchInventorySnapshot();
              const p = computeProgressFromInventory(inv, requirement);
              const snapshot = computeRequirementSnapshot(inv, requirement);
              enhancedTaskIntegration.updateTaskMetadata(currentTask.id, {
                requirement: snapshot,
              });
              canComplete = p >= 1;
            }
          } catch (e) {
            console.warn('Inventory progress estimation failed:', e);
          }
          if (canComplete) {
            enhancedTaskIntegration.updateTaskProgress(
              currentTask.id,
              1.0,
              'completed'
            );
            console.log(`🎉 Task completed (no steps): ${currentTask.title}`);
          }
        }
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

            // Complete the current step since we actually did the work
            if (currentTask.steps && Array.isArray(currentTask.steps)) {
              const currentStep = currentTask.steps.find(
                (step: any) => !step.done
              );
              if (currentStep) {
                await enhancedTaskIntegration.completeTaskStep(
                  currentTask.id,
                  currentStep.id
                );
                console.log(`✅ Completed step: ${currentStep.label}`);
              }

              // Check if all steps are complete
              const allStepsComplete = currentTask.steps.every(
                (step: any) => step.done
              );
              if (allStepsComplete) {
                enhancedTaskIntegration.updateTaskProgress(
                  currentTask.id,
                  1.0,
                  'completed'
                );
                console.log(`🎉 Task completed: ${currentTask.title}`);
              }
            } else {
              // If no steps defined, mark task as completed directly
              enhancedTaskIntegration.updateTaskProgress(
                currentTask.id,
                1.0,
                'completed'
              );
              console.log(`🎉 Task completed (no steps): ${currentTask.title}`);
            }
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
  // Note: mcpServerPort currently unused (in-process). Kept for future.
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

    try {
      // Emit memory events for lifecycle transitions
      if (oldStatus !== task.status) {
        if (task.status === 'active' && oldStatus === 'pending') {
          enhancedMemoryIntegration.generateTaskEvent(
            task.id,
            task.type,
            'started',
            { title: task.title }
          );
        }
        if (task.status === 'completed') {
          // Capture inventory + position snapshot
          (async () => {
            const inv = await fetchInventorySnapshot();
            const pos = await getBotPosition();
            enhancedMemoryIntegration.generateTaskEvent(
              task.id,
              task.type,
              'completed',
              { title: task.title, inventory: inv, position: pos }
            );
            // Add a reflective note tying state to outcome
            const summary = `Completed ${task.type} task: ${task.title}.`;
            const invCount = inv.reduce((s, it) => s + (it.count || 0), 0);
            const content = `${summary}\nInventory items: ${invCount}$${pos ? `\nPosition: (${pos.x}, ${pos.y}, ${pos.z})` : ''}`;
            enhancedMemoryIntegration.addReflectiveNote(
              'reflection',
              'Task Completion',
              content,
              [task.type, task.title],
              'planning-system',
              0.8
            );
          })();
        }
        if (task.status === 'failed') {
          enhancedMemoryIntegration.generateTaskEvent(
            task.id,
            task.type,
            'failed',
            { title: task.title }
          );
        }
      }
    } catch (e) {
      console.warn('Memory event logging failed:', e);
    }
  }
);

enhancedMemoryIntegration.on('eventAdded', (event) => {
  console.log('Memory event added:', event.title);
});

enhancedEnvironmentIntegration.on('environmentUpdated', (environment) => {
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.DEBUG_ENVIRONMENT === 'true'
  ) {
    console.log(
      'Environment updated:',
      environment.biome,
      environment.timeOfDay
    );
  }
});

// Add initial tasks for testing (dev-only)
if (String(process.env.AUTO_SEED_TASKS || '').toLowerCase() === 'true') {
  setTimeout(async () => {
    console.log('Adding initial tasks for testing (AUTO_SEED_TASKS=true)...');

    const botConnected = await waitForBotConnection(10000);
    if (!botConnected) {
      console.log(
        '⚠️ Bot not connected - tasks will be queued but may not execute immediately'
      );
    }

    const task1 = await enhancedTaskIntegration.addTask({
      title: 'Gather Wood',
      description: 'Collect wood from nearby trees for crafting',
      type: 'gathering',
      priority: 0.8,
      urgency: 0.7,
      source: 'autonomous' as const,
      metadata: {
        category: 'survival',
        tags: ['wood', 'gathering', 'crafting'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
      },
    });

    console.log('Task 1 added:', task1.id, task1.title);
    console.log(
      'Active tasks after task 1:',
      enhancedTaskIntegration.getActiveTasks().length
    );

    await enhancedTaskIntegration.addTask({
      title: 'Craft Wooden Pickaxe',
      description: 'Create a wooden pickaxe for mining stone',
      type: 'crafting',
      priority: 0.9,
      urgency: 0.8,
      source: 'autonomous' as const,
      metadata: {
        category: 'crafting',
        tags: ['pickaxe', 'wood', 'tools'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
      },
    });

    await enhancedTaskIntegration.addTask({
      title: 'Explore Cave System',
      description: 'Search for valuable resources in nearby caves',
      type: 'exploration',
      priority: 0.6,
      urgency: 0.5,
      source: 'autonomous' as const,
      metadata: {
        category: 'exploration',
        tags: ['cave', 'mining', 'resources'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
      },
    });
  }, 2000);
}

// Main server startup function
async function startServer() {
  try {
    // Create an EnhancedRegistry for MCP integration
    const registry = new EnhancedRegistry();

    // Initialize MCP integration with the registry
    try {
      await serverConfig.initializeMCP(undefined, registry);

      // Register core leaves with the MCP integration
      const mcpIntegration = serverConfig.getMCPIntegration();
      if (mcpIntegration) {
        console.log('📝 Registering core leaves with MCP integration...');

        // Import leaves dynamically to avoid import issues
        const {
          MoveToLeaf,
          StepForwardSafelyLeaf,
          FollowEntityLeaf,
          DigBlockLeaf,
          PlaceBlockLeaf,
          PlaceTorchIfNeededLeaf,
          RetreatAndBlockLeaf,
          ConsumeFoodLeaf,
          SenseHostilesLeaf,
          ChatLeaf,
          WaitLeaf,
          GetLightLevelLeaf,
          CraftRecipeLeaf,
          SmeltLeaf,
          IntrospectRecipeLeaf,
        } = await import('@conscious-bot/core');

        const leaves = [
          new MoveToLeaf(),
          new StepForwardSafelyLeaf(),
          new FollowEntityLeaf(),
          new DigBlockLeaf(),
          new PlaceBlockLeaf(),
          new PlaceTorchIfNeededLeaf(),
          new RetreatAndBlockLeaf(),
          new ConsumeFoodLeaf(),
          new SenseHostilesLeaf(),
          new ChatLeaf(),
          new WaitLeaf(),
          new GetLightLevelLeaf(),
          new CraftRecipeLeaf(),
          new SmeltLeaf(),
          new IntrospectRecipeLeaf(),
        ];

        for (const leaf of leaves) {
          // Register with MCP integration
          const result = await mcpIntegration.registerLeaf(leaf);
          if (result) {
            console.log(
              `✅ Registered leaf: ${leaf.spec.name}@${leaf.spec.version}`
            );
          }

          // Also register with the registry for MCP server access
          const registryResult = registry.registerLeaf(
            leaf,
            {
              author: 'system-init',
              parentLineage: [],
              codeHash: `default-${leaf.spec.name}`,
              createdAt: new Date().toISOString(),
              metadata: { source: 'default-leaf' },
            },
            'active'
          );

          if (registryResult.ok) {
            console.log(
              `✅ Registered leaf with registry: ${leaf.spec.name}@${leaf.spec.version}`
            );
          } else {
            console.warn(
              `⚠️ Failed to register leaf with registry: ${leaf.spec.name}@${leaf.spec.version}: ${registryResult.error}`
            );
          }
        }

        console.log(
          `✅ Registered ${leaves.length} core leaves with MCP integration`
        );

        // Create BT options for common tasks
        console.log('📝 Creating BT options for common tasks...');

        const btOptions = [
          {
            id: 'mine_iron_ore',
            name: 'Mine Iron Ore',
            description: 'Mine iron ore blocks for crafting',
            btDefinition: {
              root: {
                type: 'sequence',
                children: [
                  {
                    type: 'action',
                    action: 'dig_block',
                    args: { blockType: 'iron_ore' },
                  },
                  {
                    type: 'action',
                    action: 'wait',
                    args: { duration: 1000 },
                  },
                ],
              },
            },
          },
          {
            id: 'gather_wood',
            name: 'Gather Wood',
            description: 'Collect wood from nearby trees',
            btDefinition: {
              root: {
                type: 'sequence',
                children: [
                  {
                    type: 'action',
                    action: 'dig_block',
                    args: { blockType: 'oak_log' },
                  },
                  {
                    type: 'action',
                    action: 'wait',
                    args: { duration: 1000 },
                  },
                ],
              },
            },
          },
          {
            id: 'craft_wooden_pickaxe',
            name: 'Craft Wooden Pickaxe',
            description: 'Craft a wooden pickaxe for mining',
            btDefinition: {
              root: {
                type: 'sequence',
                children: [
                  {
                    type: 'action',
                    action: 'craft_recipe',
                    args: { recipe: 'wooden_pickaxe' },
                  },
                  {
                    type: 'action',
                    action: 'wait',
                    args: { duration: 1000 },
                  },
                ],
              },
            },
          },
          {
            id: 'find_food',
            name: 'Find Food',
            description: 'Search for and collect food items',
            btDefinition: {
              root: {
                type: 'sequence',
                children: [
                  {
                    type: 'action',
                    action: 'move_to',
                    args: { target: 'food_source' },
                  },
                  {
                    type: 'action',
                    action: 'dig_block',
                    args: { blockType: 'wheat' },
                  },
                  {
                    type: 'action',
                    action: 'wait',
                    args: { duration: 1000 },
                  },
                ],
              },
            },
          },
        ];

        for (const option of btOptions) {
          try {
            const result = await mcpIntegration.registerOption(option);
            if (result?.success) {
              console.log(`✅ Registered BT option: ${option.name}`);
            } else {
              console.warn(
                `⚠️ Failed to register BT option: ${option.name}`,
                result?.error
              );
            }
          } catch (error) {
            console.warn(
              `⚠️ Error registering BT option ${option.name}:`,
              error
            );
          }
        }

        console.log(
          `✅ Created ${btOptions.length} BT options for task execution`
        );
      }
    } catch (error) {
      console.warn(
        '⚠️ MCP integration failed to initialize, continuing without it:',
        error
      );
    }

    // Mount planning endpoints
    const planningRouter = createPlanningEndpoints(planningSystem);
    serverConfig.mountRouter('/', planningRouter);

    // Add logging status endpoint
    const { Router } = await import('express');
    const loggingRouter = Router();
    loggingRouter.get('/logging-status', (req, res) => {
      const status = logOptimizer.getStatus();
      res.json({
        status: 'ok',
        data: {
          suppressedMessages: status.suppressed,
          throttledMessages: status.throttled,
          timestamp: new Date().toISOString(),
        },
      });
    });
    serverConfig.mountRouter('/api', loggingRouter);

    // Mount MCP endpoints
    const { createMCPEndpoints } = await import('./modules/mcp-endpoints');
    const mcpIntegration = serverConfig.getMCPIntegration();
    if (!mcpIntegration) {
      throw new Error('MCP integration not found');
    }
    const mcpRouter = createMCPEndpoints(mcpIntegration);
    serverConfig.mountRouter('/mcp', mcpRouter);

    // Add error handling
    serverConfig.addErrorHandling();

    // Start the server
    await serverConfig.start();

    // Start autonomous task executor with error handling
    if (process.env.NODE_ENV === 'development') {
      console.log('Starting autonomous task executor...');
    }

    // Wrap the interval in error handling with reentrancy guard
    // Keep handles for graceful shutdown
    if (globalThis.__planningExecutorState === undefined) {
      // @ts-ignore augment global in runtime only
      globalThis.__planningExecutorState = { running: false };
    }
    // @ts-ignore
    const executorState: { running: boolean } =
      globalThis.__planningExecutorState;

    // @ts-ignore
    globalThis.__planningInterval = setInterval(async () => {
      if (executorState.running) {
        if (process.env.NODE_ENV === 'development') {
          console.log('⏭️ Skipping executor tick (already running)');
        }
        return;
      }
      executorState.running = true;
      try {
        logOptimizer.log(
          '🔄 Scheduled autonomous task executor running...',
          'scheduled-executor-running'
        );
        await autonomousTaskExecutor();
      } catch (error) {
        console.warn('Autonomous task executor error (non-fatal):', error);
      } finally {
        executorState.running = false;
      }
    }, 10000); // Check every 10 seconds for more responsive execution

    // Initial task generation after 5 seconds with error handling
    // @ts-ignore
    globalThis.__planningInitialKick = setTimeout(async () => {
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log('Initializing autonomous behavior...');
        }
        // Avoid racing with the interval tick
        // @ts-ignore
        const executorState = globalThis.__planningExecutorState as {
          running: boolean;
        };
        if (!executorState.running) {
          executorState.running = true;
          try {
            await autonomousTaskExecutor();
          } finally {
            executorState.running = false;
          }
        }
      } catch (error) {
        console.warn('Initial autonomous behavior error (non-fatal):', error);
      }
    }, 5000);

    // Start cognitive thought processor with error handling
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

  // Daily summary scheduler: generate yesterday's summary once per day
  let lastSummaryDay: number | null = null;
  setInterval(
    () => {
      try {
        const now = new Date();
        const dayKey = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        ).getTime();
        if (lastSummaryDay === null) {
          lastSummaryDay = dayKey;
          return;
        }
        if (dayKey !== lastSummaryDay) {
          // New day rolled over; summarize yesterday
          enhancedMemoryIntegration.generateDailySummary(1);
          lastSummaryDay = dayKey;
        }
      } catch (e) {
        console.warn('Daily summary generation failed:', e);
      }
    },
    60 * 60 * 1000
  ); // check hourly

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    try {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      // Stop thought processor
      try {
        cognitiveThoughtProcessor.stopProcessing();
      } catch (e) {
        console.warn('Cognitive thought processor failed to stop:', e);
      }
      // Clear timers
      try {
        // @ts-ignore
        if (globalThis.__planningInterval)
          clearInterval(globalThis.__planningInterval);
        // @ts-ignore
        if (globalThis.__planningInitialKick)
          clearTimeout(globalThis.__planningInitialKick);
      } catch (e) {
        console.warn('Timers failed to clear:', e);
      }
      // Stop HTTP server
      try {
        await serverConfig.stop();
      } catch (e) {
        console.warn('Server config failed to stop:', e);
      }
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// =============================================================================
// Logging Optimization System
// =============================================================================

/**
 * Logging optimization to reduce verbosity and repetitive messages
 * @author @darianrosebrook
 */
class LoggingOptimizer {
  private lastLogTimes: Map<string, number> = new Map();
  private logCounts: Map<string, number> = new Map();
  private suppressedMessages: Set<string> = new Set();
  private readonly THROTTLE_INTERVAL = 30000; // 30 seconds
  private readonly MAX_REPEATS = 3; // Max times to show same message

  /**
   * Log with throttling to prevent spam
   */
  log(
    message: string,
    throttleKey?: string,
    maxInterval = this.THROTTLE_INTERVAL
  ): void {
    const key = throttleKey || message;
    const now = Date.now();
    const lastTime = this.lastLogTimes.get(key) || 0;
    const count = this.logCounts.get(key) || 0;

    // If we've shown this message too many times, suppress it
    if (count >= this.MAX_REPEATS && !this.suppressedMessages.has(key)) {
      this.suppressedMessages.add(key);
      console.log(
        `🔇 Suppressing repeated message: "${message}" (shown ${count} times)`
      );
      return;
    }

    // If enough time has passed, show the message
    if (now - lastTime >= maxInterval) {
      console.log(message);
      this.lastLogTimes.set(key, now);
      this.logCounts.set(key, count + 1);
    }
  }

  /**
   * Log warning with throttling
   */
  warn(message: string, throttleKey?: string): void {
    const key = throttleKey || message;
    const now = Date.now();
    const lastTime = this.lastLogTimes.get(key) || 0;
    const count = this.logCounts.get(key) || 0;

    if (count >= this.MAX_REPEATS && !this.suppressedMessages.has(key)) {
      this.suppressedMessages.add(key);
      console.warn(
        `🔇 Suppressing repeated warning: "${message}" (shown ${count} times)`
      );
      return;
    }

    if (now - lastTime >= this.THROTTLE_INTERVAL) {
      console.warn(message);
      this.lastLogTimes.set(key, now);
      this.logCounts.set(key, count + 1);
    }
  }

  /**
   * Reset suppression for a specific message
   */
  resetSuppression(key: string): void {
    this.suppressedMessages.delete(key);
    this.logCounts.set(key, 0);
  }

  /**
   * Get status of logging optimization
   */
  getStatus(): { suppressed: number; throttled: number } {
    return {
      suppressed: this.suppressedMessages.size,
      throttled: this.logCounts.size,
    };
  }
}

// Global logging optimizer instance
const logOptimizer = new LoggingOptimizer();
