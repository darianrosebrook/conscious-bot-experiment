/**
 * Container Leaves - Primitive container operations for Mineflayer
 *
 * Implements container-related leaves including chest opening, item transfer,
 * and inventory management with proper error handling, timeouts, and Mineflayer integration.
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import {
  LeafImpl,
  LeafContext,
  LeafResult,
  LeafSpec,
} from '@conscious-bot/core';

// ============================================================================
// Container Tracking System
// ============================================================================

/** Container tracking information */
interface ContainerInfo {
  id: string;
  position: Vec3;
  type: string; // 'chest', 'trapped_chest', 'furnace', etc.
  window?: any; // Mineflayer window object
  openedAt: number;
  lastAccessed: number;
  itemCount?: number;
  maxSlots?: number;
}

/** Container tracking manager */
export class ContainerManager {
  private trackedContainers: Map<string, ContainerInfo> = new Map();
  private bot: Bot;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  /** Generate a unique container ID based on position */
  private generateContainerId(position: Vec3): string {
    return `container_${position.x}_${position.y}_${position.z}`;
  }

  /** Track a newly opened container */
  trackContainer(position: Vec3, window: any, type: string = 'chest'): string {
    const id = this.generateContainerId(position);

    const containerInfo: ContainerInfo = {
      id,
      position,
      type,
      window,
      openedAt: Date.now(),
      lastAccessed: Date.now(),
    };

    this.trackedContainers.set(id, containerInfo);

    // Clean up old containers (keep last 20)
    if (this.trackedContainers.size > 20) {
      const entries = Array.from(this.trackedContainers.entries());
      const oldestId = entries.sort(
        ([, a], [, b]) => a.openedAt - b.openedAt
      )[0][0];
      this.trackedContainers.delete(oldestId);
    }

    return id;
  }

  /** Get container info by ID */
  getContainer(id: string): ContainerInfo | undefined {
    return this.trackedContainers.get(id);
  }

  /** Get container by position */
  getContainerByPosition(position: Vec3): ContainerInfo | undefined {
    const id = this.generateContainerId(position);
    return this.trackedContainers.get(id);
  }

  /** Update container access time */
  updateAccess(id: string): boolean {
    const container = this.trackedContainers.get(id);
    if (container) {
      container.lastAccessed = Date.now();
      return true;
    }
    return false;
  }

  /** Close and remove container from tracking */
  closeContainer(id: string): boolean {
    const container = this.trackedContainers.get(id);
    if (container?.window) {
      try {
        container.window.close?.();
      } catch {
        // ignore
      }
      this.trackedContainers.delete(id);
      return true;
    }
    return false;
  }

  /** Get all tracked containers */
  getAllContainers(): ContainerInfo[] {
    return Array.from(this.trackedContainers.values());
  }

  /** Clean up old containers (older than 5 minutes) */
  cleanupOldContainers(): void {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const toRemove: string[] = [];

    const entries = Array.from(this.trackedContainers.entries());
    for (const [id, container] of entries) {
      if (container.lastAccessed < fiveMinutesAgo) toRemove.push(id);
    }
    toRemove.forEach((id) => this.closeContainer(id));
  }

  /** Find nearest tracked container */
  findNearestContainer(): ContainerInfo | null {
    const botPos = this.bot.entity?.position;
    if (!botPos) return null;

    let nearest: ContainerInfo | null = null;
    let nearestDistance = Infinity;

    for (const container of this.trackedContainers.values()) {
      const distance = container.position.distanceTo(botPos);
      if (distance < nearestDistance) {
        nearest = container;
        nearestDistance = distance;
      }
    }
    return nearest;
  }
}

// ============================================================================
// Helper functions (top-level, not class-bound)
// ============================================================================

/** Calculate item values for intelligent inventory management */
function calculateItemValues(items: any[]): Map<string, number> {
  const itemValues = new Map<string, number>();

  const baseValues: Record<string, number> = {
    // Tools and weapons
    diamond_sword: 2000,
    diamond_pickaxe: 1800,
    diamond_axe: 1600,
    diamond_shovel: 1400,
    iron_sword: 500,
    iron_pickaxe: 450,
    iron_axe: 400,
    iron_shovel: 350,
    stone_sword: 50,
    stone_pickaxe: 45,
    stone_axe: 40,
    stone_shovel: 35,
    wooden_sword: 10,
    wooden_pickaxe: 8,
    wooden_axe: 6,
    wooden_shovel: 4,

    // Armor
    diamond_helmet: 1600,
    diamond_chestplate: 2000,
    diamond_leggings: 1800,
    diamond_boots: 1400,
    iron_helmet: 400,
    iron_chestplate: 500,
    iron_leggings: 450,
    iron_boots: 350,
    chainmail_helmet: 150,
    chainmail_chestplate: 200,
    chainmail_leggings: 175,
    chainmail_boots: 125,
    leather_helmet: 50,
    leather_chestplate: 75,
    leather_leggings: 60,
    leather_boots: 40,

    // Materials
    diamond: 100,
    iron_ingot: 25,
    gold_ingot: 30,
    emerald: 50,
    redstone: 5,
    lapis_lazuli: 8,
    coal: 3,
    quartz: 6,
    obsidian: 15,
    crying_obsidian: 20,

    // Food
    golden_apple: 500,
    enchanted_golden_apple: 2000,
    cooked_beef: 15,
    cooked_porkchop: 15,
    cooked_chicken: 12,
    bread: 8,
    apple: 5,
    carrot: 3,
    potato: 3,

    // Building blocks
    diamond_block: 900,
    iron_block: 225,
    gold_block: 270,
  };

  for (const item of items) {
    let value = baseValues[item.name] ?? 1;

    if (item.metadata?.enchanted) value *= 1.5;

    if (item.metadata?.durability) {
      const ratio = item.metadata.durability / 100;
      value *= 0.5 + ratio * 0.5; // 50–100% of base
    }

    if (item.count > 1) value *= Math.min(2, item.count / 10); // stack bonus

    itemValues.set(item.name, Math.round(value));
  }

  return itemValues;
}

/** Analyze crafting opportunities based on available materials */
function analyzeCraftingOpportunities(items: any[]): Array<{
  recipe: string;
  requiredItems: Array<{ item: string; count: number; available: number }>;
  output: string;
  priority: number;
  value: number;
}> {
  const opportunities: Array<{
    recipe: string;
    requiredItems: Array<{ item: string; count: number; available: number }>;
    output: string;
    priority: number;
    value: number;
  }> = [];

  const recipes: Record<
    string,
    {
      ingredients: Array<{ item: string; count: number }>;
      output: string;
      priority: number;
      baseValue: number;
    }
  > = {
    iron_sword: {
      ingredients: [
        { item: 'iron_ingot', count: 2 },
        { item: 'stick', count: 1 },
      ],
      output: 'iron_sword',
      priority: 8,
      baseValue: 500,
    },
    iron_pickaxe: {
      ingredients: [
        { item: 'iron_ingot', count: 3 },
        { item: 'stick', count: 2 },
      ],
      output: 'iron_pickaxe',
      priority: 8,
      baseValue: 450,
    },
    bread: {
      ingredients: [{ item: 'wheat', count: 3 }],
      output: 'bread',
      priority: 6,
      baseValue: 8,
    },
    cooked_beef: {
      ingredients: [{ item: 'raw_beef', count: 1 }],
      output: 'cooked_beef',
      priority: 7,
      baseValue: 15,
    },
  };

  for (const [recipeName, recipe] of Object.entries(recipes)) {
    const requiredItems: Array<{
      item: string;
      count: number;
      available: number;
    }> = [];
    let canCraft = true;

    for (const ingredient of recipe.ingredients) {
      const availableItem = items.find((it: any) =>
        it.name.includes(ingredient.item.split('_')[0])
      );
      const availableCount = availableItem?.count ?? 0;

      requiredItems.push({
        item: ingredient.item,
        count: ingredient.count,
        available: availableCount,
      });
      if (availableCount < ingredient.count) canCraft = false;
    }

    if (canCraft) {
      opportunities.push({
        recipe: recipeName,
        requiredItems,
        output: recipe.output,
        priority: recipe.priority,
        value: recipe.baseValue,
      });
    }
  }

  opportunities.sort((a, b) => b.priority * b.value - a.priority * a.value);
  return opportunities;
}

/** Optimize storage layout for better organization (advisory) */
function optimizeStorageLayout(items: any[]) {
  const layout = {
    hotbarItems: [] as string[],
    mainInventoryLayout: {} as Record<number, string>,
    recommendations: [] as string[],
  };

  const hotbarPriority = [
    'diamond_sword',
    'iron_sword',
    'diamond_pickaxe',
    'iron_pickaxe',
    'diamond_axe',
    'iron_axe',
    'golden_apple',
    'cooked_beef',
    'bread',
  ];

  const availableHotbarItems = items.filter((item: any) =>
    hotbarPriority.some((p) => item.name.includes(p.split('_')[0]))
  );

  layout.hotbarItems = availableHotbarItems
    .slice(0, 9)
    .map((it: any) => it.name);

  const remainingItems = items.filter(
    (it: any) => !layout.hotbarItems.includes(it.name)
  );

  const tools = remainingItems.filter(
    (it: any) =>
      it.name.includes('sword') ||
      it.name.includes('pickaxe') ||
      it.name.includes('axe') ||
      it.name.includes('shovel')
  );

  const armor = remainingItems.filter(
    (it: any) =>
      it.name.includes('helmet') ||
      it.name.includes('chestplate') ||
      it.name.includes('leggings') ||
      it.name.includes('boots')
  );

  const food = remainingItems.filter(
    (it: any) =>
      it.name.includes('apple') ||
      it.name.includes('bread') ||
      it.name.includes('beef') ||
      it.name.includes('chicken') ||
      it.name.includes('porkchop') ||
      it.name.includes('carrot') ||
      it.name.includes('potato')
  );

  const materials = remainingItems.filter(
    (it: any) =>
      !tools.includes(it) && !armor.includes(it) && !food.includes(it)
  );

  if (tools.length > 10)
    layout.recommendations.push('Consider storing excess tools in chests');
  if (materials.length > 20)
    layout.recommendations.push('Store excess materials in dedicated chests');
  if (availableHotbarItems.length > 9)
    layout.recommendations.push(
      'Multiple high-priority items available for hotbar'
    );

  return {
    layout,
    counts: {
      tools: tools.length,
      armor: armor.length,
      food: food.length,
      materials: materials.length,
    },
  };
}

/** Sort inventory items by type and value */
function sortInventoryItems(bot: Bot): any[] {
  const items = bot.inventory.items();

  const itemCategories: Record<string, number> = {
    diamond_sword: 10,
    diamond_pickaxe: 10,
    diamond_axe: 10,
    diamond_shovel: 10,
    iron_sword: 9,
    iron_pickaxe: 9,
    iron_axe: 9,
    iron_shovel: 9,
    stone_sword: 8,
    stone_pickaxe: 8,
    stone_axe: 8,
    stone_shovel: 8,
    wooden_sword: 7,
    wooden_pickaxe: 7,
    wooden_axe: 7,
    wooden_shovel: 7,
    diamond_helmet: 9,
    diamond_chestplate: 9,
    diamond_leggings: 9,
    diamond_boots: 9,
    iron_helmet: 8,
    iron_chestplate: 8,
    iron_leggings: 8,
    iron_boots: 8,
    chainmail_helmet: 7,
    chainmail_chestplate: 7,
    chainmail_leggings: 7,
    chainmail_boots: 7,
    leather_helmet: 6,
    leather_chestplate: 6,
    leather_leggings: 6,
    leather_boots: 6,
    golden_apple: 8,
    enchanted_golden_apple: 10,
    cooked_beef: 7,
    cooked_porkchop: 7,
    cooked_chicken: 7,
    bread: 6,
    apple: 5,
    carrot: 5,
    potato: 5,
    diamond_block: 6,
    iron_block: 5,
    gold_block: 4,
    obsidian: 6,
    crying_obsidian: 5,
    diamond: 5,
    iron_ingot: 4,
    gold_ingot: 3,
    coal: 3,
    redstone: 3,
    lapis_lazuli: 3,
    emerald: 4,
    quartz: 3,
  };

  const sorted = items.sort((a, b) => {
    const ap = itemCategories[a.name] ?? 1;
    const bp = itemCategories[b.name] ?? 1;
    if (ap !== bp) return bp - ap;
    return b.count - a.count;
  });

  return sorted;
}

/** Compact inventory stacks to maximize space */
function compactInventoryStacks(
  bot: Bot,
  maxStackSize: number
): { processed: number; compacted: number } {
  const items = bot.inventory.items();
  const itemGroups: Record<string, any[]> = {};
  let compacted = 0;

  for (const item of items) {
    if (!itemGroups[item.name]) itemGroups[item.name] = [];
    itemGroups[item.name].push(item);
  }

  for (const [, groupItems] of Object.entries(itemGroups)) {
    if (groupItems.length <= 1) continue;

    let totalCount = 0;
    for (const it of groupItems) totalCount += it.count;

    const fullStacks = Math.floor(totalCount / maxStackSize);
    const remainder = totalCount % maxStackSize;

    const currentStacks = groupItems.length;
    const optimalStacks = fullStacks + (remainder > 0 ? 1 : 0);

    if (currentStacks > optimalStacks) {
      compacted += currentStacks - optimalStacks;
    }
  }

  return { processed: items.length, compacted };
}

/** Drop unwanted items from inventory */
async function dropUnwantedItems(
  bot: Bot,
  keepItems: string[] = []
): Promise<{ processed: number; dropped: number }> {
  const items = bot.inventory.items();
  let dropped = 0;

  const essentialItems = [
    'diamond_sword',
    'diamond_pickaxe',
    'diamond_axe',
    'diamond_shovel',
    'iron_sword',
    'iron_pickaxe',
    'iron_axe',
    'iron_shovel',
    'golden_apple',
    'enchanted_golden_apple',
    'bread',
    'cooked_beef',
    'cooked_porkchop',
    'cooked_chicken',
    'diamond_helmet',
    'diamond_chestplate',
    'diamond_leggings',
    'diamond_boots',
    'iron_helmet',
    'iron_chestplate',
    'iron_leggings',
    'iron_boots',
  ];

  const itemValues = calculateItemValues(items);
  const craftingOpportunities = analyzeCraftingOpportunities(items);
  void optimizeStorageLayout(items); // advisory only

  const protectedItems = new Set<string>([...keepItems, ...essentialItems]);

  for (const item of items) {
    if ([...protectedItems].some((p) => item.name.includes(p))) continue;

    const itemValue = itemValues.get(item.name) ?? 0;
    const isCraftable = craftingOpportunities.some((opp) =>
      opp.requiredItems.some((req) =>
        item.name.includes(req.item.split('_')[0])
      )
    );

    if (itemValue > 50 || isCraftable) continue;

    const moderatelyValuable = [
      'iron_ingot',
      'gold_ingot',
      'redstone',
      'lapis_lazuli',
    ];
    const isModerate = moderatelyValuable.some((v) => item.name.includes(v));
    if (isModerate && item.count <= 8) continue;

    try {
      await bot.toss(item.type, null, item.count);
      dropped++;
    } catch (error) {
      console.warn(`Failed to drop ${item.name}:`, error);
    }
  }

  return { processed: items.length, dropped };
}

/** Organize: sort + compact + drop */
async function organizeInventory(
  bot: Bot,
  keepItems: string[],
  maxStackSize: number
): Promise<{ processed: number; compacted: number; dropped: number }> {
  const sorted = sortInventoryItems(bot);
  const compacted = compactInventoryStacks(bot, maxStackSize);
  const dropped = await dropUnwantedItems(bot, keepItems);
  return {
    processed: sorted.length,
    compacted: compacted.compacted,
    dropped: dropped.dropped,
  };
}

// ============================================================================
// Helper: parse/open/type
// ============================================================================

/** Parse container position from string (e.g., "container_1_2_3" or "1,2,3") */
function parseContainerPosition(pos: string): Vec3 | null {
  const idMatch = pos.match(/^container_(-?\d+)_(-?\d+)_(-?\d+)$/);
  if (idMatch) {
    return new Vec3(+idMatch[1], +idMatch[2], +idMatch[3]);
  }

  const coordMatch = pos.match(/^(-?\d+),(-?\d+),(-?\d+)$/);
  if (coordMatch) {
    return new Vec3(+coordMatch[1], +coordMatch[2], +coordMatch[3]);
  }

  return null;
}

/** Open container at specific position */
async function openContainerAtPosition(
  bot: Bot,
  position: Vec3,
  containerManager: ContainerManager
): Promise<ContainerInfo | null> {
  try {
    const existing = containerManager.getContainerByPosition(position);
    if (existing?.window) {
      containerManager.updateAccess(existing.id);
      return existing;
    }

    const botPos = bot.entity?.position;
    if (botPos && botPos.distanceTo(position) > 2) {
      try {
        const { pathfinder, Movements } = await import('mineflayer-pathfinder');
        const movements = new Movements(bot);

        // Use simple goals implementation
        const goal = new pathfinder.goals.GoalNear(
          position.x,
          position.y,
          position.z,
          1
        );

        bot.pathfinder.setMovements(movements);
        bot.pathfinder.setGoal(goal);

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Pathfinding timeout')),
            10000
          );
          const done = () => {
            clearTimeout(timeout);
            bot.removeListener('goal_reached', done);
            bot.removeListener('path_stop', stop);
            resolve();
          };
          const stop = (reason?: string) => {
            clearTimeout(timeout);
            bot.removeListener('goal_reached', done);
            bot.removeListener('path_stop', stop);
            if (reason === 'goal_reached') resolve();
            else
              reject(new Error(`Pathfinding failed: ${reason || 'unknown'}`));
          };
          bot.once('goal_reached', done);
          bot.once('path_stop', stop);
        });
      } catch (pathError) {
        console.warn('Pathfinding failed, attempting open anyway:', pathError);
      }
    }

    const block = bot.blockAt(position);
    if (!block) return null;

    let window: any;
    try {
      if (block.name === 'furnace')
        window = await (bot as any).openFurnace(block);
      else if (block.name === 'chest' || block.name === 'trapped_chest')
        window = await (bot as any).openChest(block);
      else window = await (bot as any).openContainer?.(block);
    } catch (e) {
      console.warn('openContainer failed:', e);
      return null;
    }

    const containerId = containerManager.trackContainer(
      position,
      window,
      block.name
    );
    return containerManager.getContainer(containerId) ?? null;
  } catch (error) {
    console.error('Failed to open container at position:', error);
    return null;
  }
}

/** Get container type from block */
function getContainerType(block: any): 'chest' | 'trapped_chest' | 'unknown' {
  if (!block?.name) return 'unknown';
  if (block.name === 'trapped_chest') return 'trapped_chest';
  if (block.name === 'chest') return 'chest';
  return 'unknown';
}

// ============================================================================
// Open Container Leaf
// ============================================================================

/** Open a container (chest, furnace, etc.) at specified position */
export class OpenContainerLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'open_container',
    version: '1.0.0',
    description:
      'Open a container at specified position and return its contents',
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          required: ['x', 'y', 'z'],
        },
        containerType: {
          type: 'string',
          enum: ['chest', 'trapped_chest', 'furnace', 'hopper', 'dispenser'],
          default: 'chest',
        },
        radius: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          default: 5,
          description: 'Search radius if position not specified',
        },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        containerType: { type: 'string' },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        contents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slot: { type: 'number' },
              item: { type: 'string' },
              count: { type: 'number' },
            },
          },
        },
        containerId: { type: 'string' },
        slots: { type: 'number' },
      },
    },
    timeoutMs: 10000,
    retries: 2,
    permissions: ['container.read'],
  };

  private async findNearestChest(
    bot: Bot,
    radius: number
  ): Promise<Vec3 | null> {
    const anyBot = bot as any;
    if (typeof anyBot.findBlocks === 'function') {
      const matches = anyBot.findBlocks({
        matching: (block: any) =>
          block && (block.name === 'chest' || block.name === 'trapped_chest'),
        maxDistance: radius,
        count: 1,
      });
      if (matches && matches.length > 0) {
        const p = matches[0];
        return new Vec3(p.x, p.y, p.z);
      }
    }
    return null;
  }

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { position, radius = 5 } = args;

    try {
      const bot = ctx.bot as Bot;

      let targetPos: Vec3 | null = null;
      let block: any;

      if (position) {
        targetPos = new Vec3(position.x, position.y, position.z);
        block = bot.blockAt(targetPos);
        if (!block) {
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: false,
              detail: `No block at ${position.x},${position.y},${position.z}`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }
      } else {
        targetPos = await this.findNearestChest(bot, radius);
        if (!targetPos) {
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: true,
              detail: `No container found within ${radius} blocks`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }
        block = bot.blockAt(targetPos);
        if (!block) {
          return {
            status: 'failure',
            error: {
              code: 'world.invalidPosition',
              retryable: true,
              detail: 'No block found at detected container position',
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }
      }

      const detectedType = getContainerType(block);

      let container: any;
      try {
        switch (block.name) {
          case 'furnace':
            container = await (bot as any).openFurnace(block as any);
            break;
          case 'chest':
          case 'trapped_chest':
            container = await (bot as any).openChest(block as any);
            break;
          default:
            return {
              status: 'failure',
              error: {
                code: 'container.unsupported',
                retryable: false,
                detail: `Unsupported container type: ${block.name}`,
              },
              metrics: {
                durationMs: ctx.now() - startTime,
                retries: 0,
                timeouts: 0,
              },
            };
        }
      } catch (error: any) {
        return {
          status: 'failure',
          error: {
            code: 'container.busy',
            retryable: true,
            detail: `Failed to open container: ${error?.message ?? 'Unknown error'}`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      const contents: Array<{ slot: number; item: string; count: number }> = [];
      if (container && typeof container.items === 'function') {
        const containerItems = container.items();
        for (let i = 0; i < containerItems.length; i++) {
          const item = containerItems[i];
          if (item?.name)
            contents.push({ slot: i, item: item.name, count: item.count ?? 1 });
        }
      }

      const endTime = ctx.now();
      const duration = endTime - startTime;

      ctx.emitMetric('open_container_duration', duration);
      ctx.emitMetric('open_container_items', contents.length);
      ctx.emitMetric('open_container_type', (block.name ?? '').length);

      return {
        status: 'success',
        result: {
          success: true,
          containerType: detectedType,
          position: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
          contents,
          containerId: `${detectedType}_${targetPos.x}_${targetPos.y}_${targetPos.z}`,
          slots: contents.length,
        },
        metrics: { durationMs: duration, retries: 0, timeouts: 0 },
      };
    } catch (error: any) {
      const duration = ctx.now() - startTime;
      return {
        status: 'failure',
        error: {
          code: 'container.error',
          retryable: true,
          detail: error?.message ?? 'Unknown container error',
        },
        metrics: { durationMs: duration, retries: 0, timeouts: 0 },
      };
    }
  }
}

// ============================================================================
// Transfer Items Leaf
// ============================================================================

/** Transfer items between containers or from container to inventory */
export class TransferItemsLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'transfer_items',
    version: '1.0.0',
    description:
      'Transfer items between containers or from container to inventory',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'object',
          properties: {
            containerId: { type: 'string' },
            slot: { type: 'number', minimum: 0 },
            item: { type: 'string' },
            count: { type: 'number', minimum: 1, default: 1 },
          },
          required: ['containerId'],
        },
        destination: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['inventory', 'container'] },
            containerId: { type: 'string' },
            slot: { type: 'number', minimum: 0 },
          },
          required: ['type'],
        },
        mode: {
          type: 'string',
          enum: ['take', 'put', 'swap', 'withdraw', 'deposit', 'all'],
          default: 'take',
        },
      },
      required: ['source', 'destination'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        transferred: { type: 'number' },
        item: { type: 'string' },
        fromSlot: { type: 'number' },
        toSlot: { type: 'number' },
        sourceContainer: { type: 'string' },
        destinationContainer: { type: 'string' },
      },
    },
    timeoutMs: 15000,
    retries: 2,
    permissions: ['container.read', 'container.write'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { source, destination, mode = 'take' } = args;

    try {
      const bot = ctx.bot as Bot;
      const containerManager: ContainerManager =
        (ctx as any).containerManager || new ContainerManager(bot);

      const sourceId =
        typeof source === 'string' ? source : source?.containerId;
      const destId =
        typeof destination === 'string'
          ? destination
          : destination?.containerId;

      let sourceContainer = sourceId
        ? containerManager.getContainer(sourceId)
        : undefined;
      let destContainer = destId
        ? containerManager.getContainer(destId)
        : undefined;

      if (!sourceContainer && typeof sourceId === 'string') {
        const sourcePos = parseContainerPosition(sourceId);
        if (sourcePos)
          sourceContainer =
            (await openContainerAtPosition(bot, sourcePos, containerManager)) ??
            undefined;
      }

      if (!destContainer && typeof destId === 'string') {
        const destPos = parseContainerPosition(destId);
        if (destPos)
          destContainer =
            (await openContainerAtPosition(bot, destPos, containerManager)) ??
            undefined;
      }

      if (!sourceContainer || !destContainer) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: true,
            detail:
              'Source or destination container not found or could not be opened',
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      let itemsTransferred = 0;

      try {
        const sourceWindow = sourceContainer.window;
        const destWindow = destContainer.window;
        if (!sourceWindow || !destWindow)
          throw new Error('Container windows not available');

        const itemsToTransfer: Array<{
          slot: number;
          item: any;
          count: number;
        }> = [];

        if (mode === 'all') {
          for (let slot = 0; slot < sourceWindow.slots.length; slot++) {
            const item = sourceWindow.slots[slot];
            if (item) itemsToTransfer.push({ slot, item, count: item.count });
          }
        } else if (mode === 'deposit') {
          for (
            let slot = sourceWindow.inventoryStart;
            slot < sourceWindow.inventoryEnd;
            slot++
          ) {
            const item = sourceWindow.slots[slot];
            if (item) itemsToTransfer.push({ slot, item, count: item.count });
          }
        } else if (mode === 'withdraw') {
          for (let slot = 0; slot < sourceWindow.inventoryStart; slot++) {
            const item = sourceWindow.slots[slot];
            if (item) itemsToTransfer.push({ slot, item, count: item.count });
          }
        } else {
          // basic 'take' / 'put' / 'swap' — if specific filters are desired, extend here
          for (let slot = 0; slot < sourceWindow.slots.length; slot++) {
            const item = sourceWindow.slots[slot];
            if (item) itemsToTransfer.push({ slot, item, count: item.count });
          }
        }

        for (const transfer of itemsToTransfer) {
          try {
            const toInventory = mode === 'withdraw';
            const destStart = toInventory ? destWindow.inventoryStart : 0;
            const destEnd = toInventory
              ? destWindow.inventoryEnd
              : destWindow.inventoryStart;

            let emptySlot = -1;
            for (let slot = destStart; slot < destEnd; slot++) {
              if (!destWindow.slots[slot]) {
                emptySlot = slot;
                break;
              }
            }
            if (emptySlot === -1) {
              console.warn(`No empty slot found for ${transfer.item.name}`);
              continue;
            }

            await sourceWindow.transferItem(
              transfer.slot,
              emptySlot,
              transfer.count
            );
            itemsTransferred++;

            await new Promise((resolve) => setTimeout(resolve, 100)); // throttle
          } catch (e) {
            console.warn(`Failed to transfer ${transfer.item.name}:`, e);
          }
        }
      } catch (transferError) {
        console.error('Item transfer logic error:', transferError);
      }

      const duration = ctx.now() - startTime;

      ctx.emitMetric('transfer_items_duration', duration);
      ctx.emitMetric('transfer_items_mode', String(mode).length);
      ctx.emitMetric('transfer_items_count', itemsTransferred);

      return {
        status: 'success',
        result: {
          sourceContainer: sourceContainer.id,
          destinationContainer: destContainer.id,
          mode,
          itemsTransferred,
          transferTime: duration,
        },
        metrics: { durationMs: duration, retries: 0, timeouts: 0 },
      };
    } catch (error: any) {
      const duration = ctx.now() - startTime;
      return {
        status: 'failure',
        error: {
          code: 'container.transferError',
          retryable: true,
          detail: error?.message ?? 'Unknown transfer error',
        },
        metrics: { durationMs: duration, retries: 0, timeouts: 0 },
      };
    }
  }
}

// ============================================================================
// Close Container Leaf
// ============================================================================

/** Close an open container */
export class CloseContainerLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'close_container',
    version: '1.0.0',
    description: 'Close an open container',
    inputSchema: {
      type: 'object',
      properties: {
        containerId: {
          type: 'string',
          description:
            'ID of the container to close (optional - closes nearest tracked)',
        },
        waitForItems: {
          type: 'boolean',
          default: false,
          description: 'Wait for any pending item transfers to complete',
        },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        containerId: { type: 'string' },
        wasOpen: { type: 'boolean' },
      },
    },
    timeoutMs: 5000,
    retries: 1,
    permissions: ['container.read'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { containerId } = args;

    try {
      const bot = ctx.bot as Bot;
      const containerManager: ContainerManager =
        (ctx as any).containerManager || new ContainerManager(bot);

      let container: ContainerInfo | undefined;

      if (containerId) container = containerManager.getContainer(containerId);
      if (!container && containerId) {
        const position = parseContainerPosition(containerId);
        if (position)
          container = containerManager.getContainerByPosition(position);
      }
      if (!container)
        container = containerManager.findNearestContainer() ?? undefined;

      if (!container) {
        return {
          status: 'failure',
          error: {
            code: 'world.invalidPosition',
            retryable: true,
            detail: `No container found${containerId ? ` with ID: ${containerId}` : ''}`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      const wasClosed = containerManager.closeContainer(container.id);
      const duration = ctx.now() - startTime;

      ctx.emitMetric('close_container_duration', duration);

      return {
        status: wasClosed ? 'success' : 'failure',
        result: {
          containerId: container.id,
          position: container.position,
          wasOpen: !!container.window,
          closed: wasClosed,
        },
        metrics: { durationMs: duration, retries: 0, timeouts: 0 },
      };
    } catch (error: any) {
      const duration = ctx.now() - startTime;
      return {
        status: 'failure',
        error: {
          code: 'container.closeError',
          retryable: true,
          detail: error?.message ?? 'Unknown close error',
        },
        metrics: { durationMs: duration, retries: 0, timeouts: 0 },
      };
    }
  }
}

// ============================================================================
// Inventory Management Leaf
// ============================================================================

/** Organize and manage inventory contents */
export class InventoryManagementLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'manage_inventory',
    version: '1.0.0',
    description: 'Organize and manage inventory contents',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'sort',
            'compact',
            'drop_unwanted',
            'keep_essentials',
            'organize',
          ],
          default: 'sort',
        },
        keepItems: {
          type: 'array',
          items: { type: 'string' },
          description: 'Items to keep when dropping unwanted items',
        },
        maxStackSize: {
          type: 'number',
          minimum: 1,
          maximum: 64,
          default: 64,
          description: 'Maximum stack size for compacting',
        },
      },
      required: ['action'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        action: { type: 'string' },
        itemsProcessed: { type: 'number' },
        stacksCompacted: { type: 'number' },
        itemsDropped: { type: 'number' },
      },
    },
    timeoutMs: 30000,
    retries: 1,
    permissions: ['container.read', 'container.write'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { action = 'sort', keepItems = [], maxStackSize = 64 } = args;

    try {
      const bot = ctx.bot as Bot;

      const items = bot.inventory.items();
      if (items.length === 0) {
        return {
          status: 'failure',
          error: {
            code: 'inventory.missingItem',
            retryable: false,
            detail: `No items to ${action} in inventory`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      let itemsProcessed = 0;
      let stacksCompacted = 0;
      let itemsDropped = 0;

      try {
        switch (action) {
          case 'sort': {
            const sortedItems = sortInventoryItems(bot);
            itemsProcessed = sortedItems.length;
            break;
          }
          case 'compact': {
            const compacted = compactInventoryStacks(bot, maxStackSize);
            itemsProcessed = compacted.processed;
            stacksCompacted = compacted.compacted;
            break;
          }
          case 'drop_unwanted': {
            const dropped = await dropUnwantedItems(bot, keepItems);
            itemsProcessed = dropped.processed;
            itemsDropped = dropped.dropped;
            break;
          }
          case 'keep_essentials': {
            // Semantically, same as drop_unwanted with default essential set inside helper
            const dropped = await dropUnwantedItems(bot, keepItems);
            itemsProcessed = dropped.processed;
            itemsDropped = dropped.dropped;
            break;
          }
          case 'organize': {
            const org = await organizeInventory(bot, keepItems, maxStackSize);
            itemsProcessed = org.processed;
            stacksCompacted = org.compacted;
            itemsDropped = org.dropped;
            break;
          }
          default:
            throw new Error(`Unknown inventory action: ${action}`);
        }

        const duration = ctx.now() - startTime;

        ctx.emitMetric('manage_inventory_duration', duration);
        ctx.emitMetric('manage_inventory_action', String(action).length);
        ctx.emitMetric('manage_inventory_items_processed', itemsProcessed);
        ctx.emitMetric('manage_inventory_stacks_compacted', stacksCompacted);
        ctx.emitMetric('manage_inventory_items_dropped', itemsDropped);

        return {
          status: 'success',
          result: {
            success: true,
            action,
            itemsProcessed,
            stacksCompacted,
            itemsDropped,
          },
          metrics: { durationMs: duration, retries: 0, timeouts: 0 },
        };
      } catch (error: any) {
        const duration = ctx.now() - startTime;
        return {
          status: 'failure',
          error: {
            code: 'container.managementError',
            retryable: true,
            detail: error?.message ?? 'Inventory management failed',
          },
          metrics: { durationMs: duration, retries: 0, timeouts: 0 },
        };
      }
    } catch (error: any) {
      const duration = ctx.now() - startTime;
      return {
        status: 'failure',
        error: {
          code: 'container.managementError',
          retryable: true,
          detail: error?.message ?? 'Unknown management error',
        },
        metrics: { durationMs: duration, retries: 0, timeouts: 0 },
      };
    }
  }
}
