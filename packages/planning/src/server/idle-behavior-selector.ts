/**
 * Idle Behavior Selector
 *
 * When the bot has no active tasks, this module selects fallback behaviors
 * to keep the bot productive. Behaviors are weighted by context and cooldowns.
 *
 * Design principles:
 * - Fast: No LLM calls in the critical path (LLM suggestion is one behavior option)
 * - Diverse: Multiple behavior types to avoid repetitive actions
 * - Context-aware: Considers inventory, location, time since last action
 * - Interruptible: Idle tasks are low priority and can be preempted
 *
 * @author @darianrosebrook
 */

export interface IdleBehavior {
  id: string;
  name: string;
  description: string;
  /** Base weight (0-1). Higher = more likely to be selected */
  weight: number;
  /** Minimum ms between selecting this behavior */
  cooldownMs: number;
  /** Task type to create */
  taskType: string;
  /** Task parameters (can be a function for dynamic params) */
  parameters: Record<string, unknown> | (() => Record<string, unknown>);
  /** Optional condition check before selection */
  condition?: (context: IdleContext) => boolean;
}

export interface IdleContext {
  /** Current bot position */
  position?: { x: number; y: number; z: number };
  /** Inventory item count */
  inventoryCount: number;
  /** Time since last completed task (ms) */
  timeSinceLastTask: number;
  /** Time of day in game */
  gameTimeOfDay?: 'day' | 'night' | 'unknown';
  /** Whether there are interrupted tasks in memory */
  hasInterruptedTasks: boolean;
  /** Number of times bot has been idle consecutively */
  consecutiveIdleCycles: number;
}

export interface IdleSelectionResult {
  behavior: IdleBehavior;
  task: {
    title: string;
    description: string;
    type: string;
    priority: number;
    parameters: Record<string, unknown>;
    metadata: {
      tags: string[];
      category: string;
      source: 'idle-behavior';
      idleBehaviorId: string;
    };
  };
}

/**
 * Default idle behaviors catalog.
 * These are low-priority fallback actions when no tasks are available.
 */
export const DEFAULT_IDLE_BEHAVIORS: IdleBehavior[] = [
  {
    id: 'explore-nearby',
    name: 'Explore Nearby',
    description: 'Wander and explore the immediate surroundings',
    weight: 0.8,
    cooldownMs: 60_000, // 1 minute
    taskType: 'exploration',
    parameters: {
      action: 'explore',
      radius: 50,
      duration: 30_000,
    },
  },
  {
    id: 'gather-wood',
    name: 'Gather Wood',
    description: 'Collect some wood for basic crafting',
    weight: 0.6,
    cooldownMs: 120_000, // 2 minutes
    taskType: 'gathering',
    parameters: {
      action: 'collect',
      target: 'oak_log',
      quantity: 4,
    },
    condition: (ctx) => ctx.inventoryCount < 30, // Only if inventory has space
  },
  {
    id: 'gather-stone',
    name: 'Gather Stone',
    description: 'Mine some stone for tools and building',
    weight: 0.5,
    cooldownMs: 180_000, // 3 minutes
    taskType: 'mining',
    parameters: {
      action: 'mine',
      target: 'stone',
      quantity: 8,
    },
    condition: (ctx) => ctx.inventoryCount < 25,
  },
  {
    id: 'check-memories',
    name: 'Check Interrupted Tasks',
    description: 'Review memories for tasks that were interrupted',
    weight: 0.9,
    cooldownMs: 300_000, // 5 minutes
    taskType: 'memory-recall',
    parameters: {
      action: 'recall',
      query: 'interrupted tasks',
      memoryType: 'task',
    },
    condition: (ctx) => ctx.hasInterruptedTasks,
  },
  {
    id: 'wander',
    name: 'Take a Walk',
    description: 'Wander aimlessly for a short while',
    weight: 0.4,
    cooldownMs: 30_000, // 30 seconds
    taskType: 'movement',
    parameters: () => ({
      action: 'wander',
      direction: ['north', 'south', 'east', 'west'][Math.floor(Math.random() * 4)],
      distance: 20 + Math.floor(Math.random() * 30),
    }),
  },
  {
    id: 'look-around',
    name: 'Look Around',
    description: 'Observe the environment and update awareness',
    weight: 0.7,
    cooldownMs: 45_000, // 45 seconds
    taskType: 'sensing',
    parameters: {
      action: 'observe',
      radius: 32,
    },
  },
  {
    id: 'organize-inventory',
    name: 'Organize Inventory',
    description: 'Sort and consolidate inventory items',
    weight: 0.3,
    cooldownMs: 300_000, // 5 minutes
    taskType: 'inventory-management',
    parameters: {
      action: 'organize',
    },
    condition: (ctx) => ctx.inventoryCount > 10,
  },
];

/**
 * Tracks cooldowns for idle behaviors.
 */
const behaviorCooldowns = new Map<string, number>();

/**
 * Tracks consecutive idle cycles for escalating behavior.
 */
let consecutiveIdleCycles = 0;
let lastIdleSelectionTime = 0;

/**
 * Select an idle behavior based on context and weights.
 *
 * @param context - Current bot context
 * @param behaviors - Available behaviors (defaults to DEFAULT_IDLE_BEHAVIORS)
 * @returns Selected behavior and task, or null if none available
 */
export function selectIdleBehavior(
  context: IdleContext,
  behaviors: IdleBehavior[] = DEFAULT_IDLE_BEHAVIORS
): IdleSelectionResult | null {
  const now = Date.now();

  // Update consecutive idle counter
  if (now - lastIdleSelectionTime < 60_000) {
    consecutiveIdleCycles++;
  } else {
    consecutiveIdleCycles = 1;
  }
  lastIdleSelectionTime = now;

  // Filter behaviors by condition and cooldown
  const availableBehaviors = behaviors.filter((b) => {
    // Check cooldown
    const lastUsed = behaviorCooldowns.get(b.id) || 0;
    if (now - lastUsed < b.cooldownMs) {
      return false;
    }

    // Check condition
    if (b.condition && !b.condition({ ...context, consecutiveIdleCycles })) {
      return false;
    }

    return true;
  });

  if (availableBehaviors.length === 0) {
    console.log('[IdleBehaviorSelector] No behaviors available (all on cooldown or conditions not met)');
    return null;
  }

  // Weighted random selection
  const totalWeight = availableBehaviors.reduce((sum, b) => sum + b.weight, 0);
  let random = Math.random() * totalWeight;

  let selected: IdleBehavior | null = null;
  for (const behavior of availableBehaviors) {
    random -= behavior.weight;
    if (random <= 0) {
      selected = behavior;
      break;
    }
  }

  // Fallback to first available if random selection fails
  if (!selected) {
    selected = availableBehaviors[0];
  }

  // Update cooldown
  behaviorCooldowns.set(selected.id, now);

  // Build task parameters
  const parameters =
    typeof selected.parameters === 'function'
      ? selected.parameters()
      : selected.parameters;

  console.log(`[IdleBehaviorSelector] Selected: ${selected.name} (${selected.id})`);

  return {
    behavior: selected,
    task: {
      title: selected.description,
      description: `[Idle] ${selected.description}`,
      type: selected.taskType,
      priority: 0.3, // Low priority - can be preempted by real tasks
      parameters,
      metadata: {
        tags: ['idle', 'autonomous', selected.id],
        category: 'idle-behavior',
        source: 'idle-behavior',
        idleBehaviorId: selected.id,
      },
    },
  };
}

/**
 * Reset cooldowns (useful for testing or after long idle periods).
 */
export function resetIdleCooldowns(): void {
  behaviorCooldowns.clear();
  consecutiveIdleCycles = 0;
  lastIdleSelectionTime = 0;
}

/**
 * Get current cooldown status for all behaviors.
 */
export function getIdleCooldownStatus(): Array<{
  id: string;
  name: string;
  remainingMs: number;
  available: boolean;
}> {
  const now = Date.now();
  return DEFAULT_IDLE_BEHAVIORS.map((b) => {
    const lastUsed = behaviorCooldowns.get(b.id) || 0;
    const remainingMs = Math.max(0, b.cooldownMs - (now - lastUsed));
    return {
      id: b.id,
      name: b.name,
      remainingMs,
      available: remainingMs === 0,
    };
  });
}
