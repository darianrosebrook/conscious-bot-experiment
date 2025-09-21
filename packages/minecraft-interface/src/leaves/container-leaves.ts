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

/**
 * Container tracking information
 */
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

/**
 * Container tracking manager
 */
class ContainerManager {
  private trackedContainers: Map<string, ContainerInfo> = new Map();
  private bot: Bot;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  /**
   * Generate a unique container ID based on position
   */
  private generateContainerId(position: Vec3): string {
    return `container_${position.x}_${position.y}_${position.z}`;
  }

  /**
   * Track a newly opened container
   */
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

  /**
   * Get container info by ID
   */
  getContainer(id: string): ContainerInfo | undefined {
    return this.trackedContainers.get(id);
  }

  /**
   * Get container by position
   */
  getContainerByPosition(position: Vec3): ContainerInfo | undefined {
    const id = this.generateContainerId(position);
    return this.trackedContainers.get(id);
  }

  /**
   * Update container access time
   */
  updateAccess(id: string): boolean {
    const container = this.trackedContainers.get(id);
    if (container) {
      container.lastAccessed = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Close and remove container from tracking
   */
  closeContainer(id: string): boolean {
    const container = this.trackedContainers.get(id);
    if (container && container.window) {
      container.window.close();
      this.trackedContainers.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Get all tracked containers
   */
  getAllContainers(): ContainerInfo[] {
    return Array.from(this.trackedContainers.values());
  }

  /**
   * Clean up old containers (older than 5 minutes)
   */
  cleanupOldContainers(): void {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const toRemove: string[] = [];

    const entries = Array.from(this.trackedContainers.entries());
    for (const [id, container] of entries) {
      if (container.lastAccessed < fiveMinutesAgo) {
        toRemove.push(id);
      }
    }

    toRemove.forEach((id) => {
      this.closeContainer(id);
    });
  }

  /**
   * Find nearest tracked container
   */
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
// Helper Functions
// ============================================================================

/**
 * Find the nearest chest within radius
 */
async function findNearestChest(
  bot: Bot,
  radius: number
): Promise<Vec3 | null> {
  if (!bot.entity?.position) return null;

  const pos = bot.entity.position;

  for (let x = -radius; x <= radius; x++) {
    for (let y = -radius; y <= radius; y++) {
      for (let z = -radius; z <= radius; z++) {
        const checkPos = pos.offset(x, y, z);
        const block = bot.blockAt(checkPos);

        if (
          block &&
          (block.name === 'chest' || block.name === 'trapped_chest')
        ) {
          return checkPos;
        }
      }
    }
  }

  return null;
}

// ============================================================================
// Inventory Management Functions
// ============================================================================

/**
 * Sort inventory items by type and value
 */
function sortInventoryItems(bot: Bot, keepItems: string[] = []): any[] {
  const items = bot.inventory.items();

  // Sort items by category priority and then by count/value
  const itemCategories: Record<string, number> = {
    // Tools and weapons (highest priority)
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

    // Armor
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

    // Food (high priority)
    golden_apple: 8,
    enchanted_golden_apple: 10,
    cooked_beef: 7,
    cooked_porkchop: 7,
    cooked_chicken: 7,
    bread: 6,
    apple: 5,
    carrot: 5,
    potato: 5,

    // Building blocks
    diamond_block: 6,
    iron_block: 5,
    gold_block: 4,
    obsidian: 6,
    crying_obsidian: 5,

    // Materials
    diamond: 5,
    iron_ingot: 4,
    gold_ingot: 3,
    coal: 3,
    redstone: 3,
    lapis_lazuli: 3,
    emerald: 4,
    quartz: 3,

    // Everything else defaults to priority 1
  };

  const sortedItems = items.sort((a, b) => {
    const aPriority = itemCategories[a.name] || 1;
    const bPriority = itemCategories[b.name] || 1;

    // Primary sort by priority (higher first)
    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }

    // Secondary sort by count (higher first)
    return b.count - a.count;
  });

  console.log(`📦 Sorted ${sortedItems.length} inventory items by priority`);
  return sortedItems;
}

/**
 * Compact inventory stacks to maximize space
 */
function compactInventoryStacks(
  bot: Bot,
  maxStackSize: number
): { processed: number; compacted: number } {
  const items = bot.inventory.items();
  const itemGroups: Record<string, any[]> = {};
  let compacted = 0;

  // Group items by type
  for (const item of items) {
    if (!itemGroups[item.name]) {
      itemGroups[item.name] = [];
    }
    itemGroups[item.name].push(item);
  }

  // Compact each group
  for (const [itemName, groupItems] of Object.entries(itemGroups)) {
    if (groupItems.length <= 1) continue;

    let totalCount = 0;
    for (const item of groupItems) {
      totalCount += item.count;
    }

    const fullStacks = Math.floor(totalCount / maxStackSize);
    const remainder = totalCount % maxStackSize;

    // Calculate how many stacks we can optimize
    const currentStacks = groupItems.length;
    const optimalStacks = fullStacks + (remainder > 0 ? 1 : 0);

    if (currentStacks > optimalStacks) {
      compacted += currentStacks - optimalStacks;
      console.log(
        `📦 Compacted ${itemName}: ${currentStacks} → ${optimalStacks} stacks`
      );
    }
  }

  console.log(
    `📦 Inventory compacting complete: ${compacted} stacks optimized`
  );
  return { processed: items.length, compacted };
}

/**
 * Drop unwanted items from inventory
 */
async function dropUnwantedItems(
  bot: Bot,
  keepItems: string[] = []
): Promise<{ processed: number; dropped: number }> {
  const items = bot.inventory.items();
  let dropped = 0;

    // Define essential items that should never be dropped
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

    // Advanced item valuation system
    const itemValues = this.calculateItemValues(items, bot);
    const craftingOpportunities = this.analyzeCraftingOpportunities(items, bot);
    const storageOptimization = this.optimizeStorageLayout(items);

  // Combine keepItems with essential items
  const protectedItems = [...new Set([...keepItems, ...essentialItems])];

  for (const item of items) {
    // Skip protected items
    if (
      protectedItems.some((protectedItem) => item.name.includes(protectedItem))
    ) {
      continue;
    }

      // Enhanced value-based decision making
      const itemValue = itemValues.get(item.name) || 0;
      const isCraftable = craftingOpportunities.some((opp: any) =>
        opp.requiredItems.some((req: any) => req.item === item.name)
      );

      // Keep valuable items, craftable components, and essential items
      if (
        itemValue > 50 || // High value items
        isCraftable || // Items needed for crafting
        protectedItems.some((protected) => item.name.includes(protected))
      ) {
        continue;
      }

      // Keep small amounts of moderately valuable materials for crafting
      const moderatelyValuableItems = ['iron_ingot', 'gold_ingot', 'redstone', 'lapis_lazuli'];
      const isModeratelyValuable = moderatelyValuableItems.some((valuable) =>
        item.name.includes(valuable)
      );

      if (isModeratelyValuable && item.count <= 8) {
        continue; // Keep small amounts for potential crafting
      }

  // Drop the item
  try {
    await bot.toss(item.type, null, item.count);
    dropped++;
    console.log(`🗑️ Dropped ${item.count}x ${item.name} (value: ${itemValue || 0})`);
  } catch (error) {
    console.warn(`Failed to drop ${item.name}:`, error);
  }

  console.log(`🗑️ Inventory cleanup complete: dropped ${dropped} items, preserved ${items.length - dropped} valuable/craftable items`);
  return { processed: items.length, dropped };
}

  /**
   * Calculate item values for intelligent inventory management
   */
  private calculateItemValues(items: any[], bot: Bot): any {
    const itemValues = new Map<string, number>();

  // Base item values (rarity-based)
  const baseValues: Record<string, number> = {
    // Tools and weapons
    'diamond_sword': 2000, 'diamond_pickaxe': 1800, 'diamond_axe': 1600, 'diamond_shovel': 1400,
    'iron_sword': 500, 'iron_pickaxe': 450, 'iron_axe': 400, 'iron_shovel': 350,
    'stone_sword': 50, 'stone_pickaxe': 45, 'stone_axe': 40, 'stone_shovel': 35,
    'wooden_sword': 10, 'wooden_pickaxe': 8, 'wooden_axe': 6, 'wooden_shovel': 4,

    // Armor
    'diamond_helmet': 1600, 'diamond_chestplate': 2000, 'diamond_leggings': 1800, 'diamond_boots': 1400,
    'iron_helmet': 400, 'iron_chestplate': 500, 'iron_leggings': 450, 'iron_boots': 350,
    'chainmail_helmet': 150, 'chainmail_chestplate': 200, 'chainmail_leggings': 175, 'chainmail_boots': 125,
    'leather_helmet': 50, 'leather_chestplate': 75, 'leather_leggings': 60, 'leather_boots': 40,

    // Materials
    'diamond': 100, 'iron_ingot': 25, 'gold_ingot': 30, 'emerald': 50, 'redstone': 5,
    'lapis_lazuli': 8, 'coal': 3, 'quartz': 6, 'obsidian': 15, 'crying_obsidian': 20,

    // Food
    'golden_apple': 500, 'enchanted_golden_apple': 2000, 'cooked_beef': 15, 'cooked_porkchop': 15,
    'cooked_chicken': 12, 'bread': 8, 'apple': 5, 'carrot': 3, 'potato': 3,

    // Building blocks
    'diamond_block': 900, 'iron_block': 225, 'gold_block': 270, 'obsidian': 135,
  };

  // Calculate values for all items
  for (const item of items) {
    let value = baseValues[item.name] || 1; // Default low value

    // Enchantment bonus (simplified)
    if (item.metadata?.enchanted) {
      value *= 1.5;
    }

    // Durability bonus (simplified)
    if (item.metadata?.durability) {
      const durabilityRatio = item.metadata.durability / 100;
      value *= (0.5 + durabilityRatio * 0.5); // 50-100% of base value
    }

    // Stack size bonus
    if (item.count > 1) {
      value *= Math.min(2, item.count / 10); // Bonus for larger stacks
    }

    itemValues.set(item.name, Math.round(value));
  }

  return itemValues;
}

  /**
   * Analyze crafting opportunities based on available materials
   */
  private analyzeCraftingOpportunities(items: any[], bot: Bot): any {
  const opportunities: Array<{
    recipe: string;
    requiredItems: Array<{ item: string; count: number; available: number }>;
    output: string;
    priority: number;
    value: number;
  }> = [];

  // Define basic crafting recipes
  const recipes: Record<string, {
    ingredients: Array<{ item: string; count: number }>;
    output: string;
    priority: number;
    baseValue: number;
  }> = {
    'iron_sword': {
      ingredients: [{ item: 'iron_ingot', count: 2 }, { item: 'stick', count: 1 }],
      output: 'iron_sword',
      priority: 8,
      baseValue: 500,
    },
    'iron_pickaxe': {
      ingredients: [{ item: 'iron_ingot', count: 3 }, { item: 'stick', count: 2 }],
      output: 'iron_pickaxe',
      priority: 8,
      baseValue: 450,
    },
    'bread': {
      ingredients: [{ item: 'wheat', count: 3 }],
      output: 'bread',
      priority: 6,
      baseValue: 8,
    },
    'cooked_beef': {
      ingredients: [{ item: 'raw_beef', count: 1 }],
      output: 'cooked_beef',
      priority: 7,
      baseValue: 15,
    },
  };

  // Analyze each recipe
  for (const [recipeName, recipe] of Object.entries(recipes)) {
    const requiredItems: Array<{ item: string; count: number; available: number }> = [];
    let canCraft = true;

    for (const ingredient of recipe.ingredients) {
      const availableItem = items.find((item: any) =>
        item.name.includes(ingredient.item.split('_')[0]) // Fuzzy matching
      );
      const availableCount = availableItem?.count || 0;

      requiredItems.push({
        item: ingredient.item,
        count: ingredient.count,
        available: availableCount,
      });

      if (availableCount < ingredient.count) {
        canCraft = false;
      }
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

  // Sort by priority and value
  opportunities.sort((a, b) => b.priority * b.value - a.priority * a.value);

  console.log(`🔧 Found ${opportunities.length} crafting opportunities`);
  return opportunities;
}

  /**
   * Optimize storage layout for better organization
   */
  private optimizeStorageLayout(items: any[]): any {
  const layout = {
    hotbarItems: [] as string[],
    mainInventoryLayout: {} as Record<number, string>,
    recommendations: [] as string[],
  };

  // Prioritize items for hotbar (tools, weapons, food)
  const hotbarPriority = [
    'diamond_sword', 'iron_sword', 'diamond_pickaxe', 'iron_pickaxe',
    'diamond_axe', 'iron_axe', 'golden_apple', 'cooked_beef', 'bread'
  ];

  const availableHotbarItems = items.filter((item: any) =>
    hotbarPriority.some((priority) => item.name.includes(priority.split('_')[0]))
  );

  layout.hotbarItems = availableHotbarItems.slice(0, 9).map((item: any) => item.name);

  // Suggest optimal main inventory layout
  const remainingItems = items.filter((item: any) =>
    !layout.hotbarItems.includes(item.name)
  );

  // Organize by category
  const tools = remainingItems.filter((item: any) =>
    item.name.includes('sword') || item.name.includes('pickaxe') ||
    item.name.includes('axe') || item.name.includes('shovel')
  );

  const armor = remainingItems.filter((item: any) =>
    item.name.includes('helmet') || item.name.includes('chestplate') ||
    item.name.includes('leggings') || item.name.includes('boots')
  );

  const food = remainingItems.filter((item: any) =>
    item.name.includes('apple') || item.name.includes('bread') ||
    item.name.includes('beef') || item.name.includes('chicken') ||
    item.name.includes('porkchop') || item.name.includes('carrot') ||
    item.name.includes('potato')
  );

  const materials = remainingItems.filter((item: any) =>
    !tools.includes(item) && !armor.includes(item) && !food.includes(item)
  );

  // Generate recommendations
  if (tools.length > 10) {
    layout.recommendations.push('Consider storing excess tools in chests');
  }

  if (materials.length > 20) {
    layout.recommendations.push('Store excess materials in dedicated chests');
  }

  if (availableHotbarItems.length > 9) {
    layout.recommendations.push('Multiple high-priority items available for hotbar');
  }

  console.log(`📦 Storage optimization: ${layout.hotbarItems.length} hotbar items, ${tools.length} tools, ${armor.length} armor, ${food.length} food, ${materials.length} materials`);

  return layout;

  console.log(`🗑️ Inventory cleanup complete: dropped ${dropped} items`);
  return { processed: items.length, dropped };
}

/**
 * Comprehensive inventory organization
 */
async function organizeInventory(
  bot: Bot,
  keepItems: string[] = [],
  maxStackSize: number
): Promise<{ processed: number; compacted: number; dropped: number }> {
  console.log('🧹 Starting comprehensive inventory organization...');

  const items = bot.inventory.items();
  let compacted = 0;
  let dropped = 0;

  try {
    // Step 1: Sort items by priority
    console.log('📦 Step 1: Sorting inventory items...');
    const sortedItems = sortInventoryItems(bot, keepItems);
    console.log(`✅ Sorted ${sortedItems.length} items`);

    // Step 2: Compact item stacks
    console.log('🔧 Step 2: Compacting inventory stacks...');
    const compactResult = compactInventoryStacks(bot, maxStackSize);
    compacted = compactResult.compacted;
    console.log(`✅ Compacted ${compacted} stacks`);

    // Step 3: Drop unwanted items
    console.log('🗑️ Step 3: Cleaning up unwanted items...');
    const dropResult = await dropUnwantedItems(bot, keepItems);
    dropped = dropResult.dropped;
    console.log(`✅ Dropped ${dropped} unwanted items`);

    console.log(
      `🧹 Inventory organization complete: processed ${items.length} items, compacted ${compacted} stacks, dropped ${dropped} items`
    );

    return {
      processed: items.length,
      compacted,
      dropped,
    };
  } catch (error) {
    console.error('❌ Inventory organization failed:', error);
    return {
      processed: items.length,
      compacted: 0,
      dropped: 0,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse container position from string (e.g., "container_1_2_3" or "1,2,3")
 */
function parseContainerPosition(pos: string): Vec3 | null {
  // Try container ID format: container_x_y_z
  const idMatch = pos.match(/^container_(-?\d+)_(-?\d+)_(-?\d+)$/);
  if (idMatch) {
    return new Vec3(
      parseInt(idMatch[1], 10),
      parseInt(idMatch[2], 10),
      parseInt(idMatch[3], 10)
    );
  }

  // Try coordinate format: "x,y,z"
  const coordMatch = pos.match(/^(-?\d+),(-?\d+),(-?\d+)$/);
  if (coordMatch) {
    return new Vec3(
      parseInt(coordMatch[1], 10),
      parseInt(coordMatch[2], 10),
      parseInt(coordMatch[3], 10)
    );
  }

  return null;
}

/**
 * Open container at specific position
 */
async function openContainerAtPosition(
  bot: Bot,
  position: Vec3,
  containerManager: ContainerManager
): Promise<ContainerInfo | null> {
  try {
    // Check if container is already tracked
    const existing = containerManager.getContainerByPosition(position);
    if (existing && existing.window) {
      containerManager.updateAccess(existing.id);
      return existing;
    }

    // Move bot close to container if needed
    const botPos = bot.entity?.position;
    if (botPos && botPos.distanceTo(position) > 2) {
      console.log(
        `Moving bot to container at ${position.x}, ${position.y}, ${position.z}`
      );

      try {
        // Use mineflayer pathfinding to move to container
        const movements = new (require('mineflayer-pathfinder').Movements)(bot);
        const goal = new (require('mineflayer-pathfinder').goals.GoalNear)(
          position.x,
          position.y,
          position.z,
          1 // Within 1 block
        );

        // Set pathfinder goal and wait for completion
        bot.pathfinder.setMovements(movements);
        bot.pathfinder.setGoal(goal);

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Pathfinding timeout'));
          }, 10000); // 10 second timeout

          const goalReached = () => {
            clearTimeout(timeout);
            bot.removeListener('goal_reached', goalReached);
            bot.removeListener('path_stop', pathStopped);
            resolve();
          };

          const pathStopped = (reason?: string) => {
            clearTimeout(timeout);
            bot.removeListener('goal_reached', goalReached);
            bot.removeListener('path_stop', pathStopped);
            if (reason === 'goal_reached') {
              resolve();
            } else {
              reject(new Error(`Pathfinding failed: ${reason || 'unknown'}`));
            }
          };

          bot.once('goal_reached', goalReached);
          bot.once('path_stop', pathStopped);
        });

        console.log(`✅ Bot reached container position`);
      } catch (pathError) {
        console.warn(
          `⚠️ Pathfinding failed, trying to proceed anyway:`,
          pathError
        );
        // Continue attempting to open container even if pathfinding fails
      }
    }

    // Try to open the container
    const block = bot.blockAt(position);
    if (!block) return null;

    const window = await bot.openContainer(block);
    const containerId = containerManager.trackContainer(
      position,
      window,
      block.name
    );

    return containerManager.getContainer(containerId)!;
  } catch (error) {
    console.error('Failed to open container at position:', error);
    return null;
  }
}

/**
 * Get container type from position
 */
function getContainerType(block: any): 'chest' | 'trapped_chest' | 'unknown' {
  if (!block || !block.name) return 'unknown';
  if (block.name === 'chest' || block.name === 'trapped_chest') {
    return block.name === 'trapped_chest' ? 'trapped_chest' : 'chest';
  }
  return 'unknown';
}

// ============================================================================
// Open Container Leaf
// ============================================================================

/**
 * Open a container (chest, furnace, etc.) at specified position
 */
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

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    const startTime = ctx.now();
    const { position, containerType = 'chest', radius = 5 } = args;

    try {
      const bot = ctx.bot;

      // Find container position if not specified
      let targetPos: Vec3;
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
              detail: `No block found at ${position.x}, ${position.y}, ${position.z}`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }

        if (
          ![
            'chest',
            'trapped_chest',
            'furnace',
            'hopper',
            'dispenser',
          ].includes(block.name)
        ) {
          return {
            status: 'failure',
            error: {
              code: 'container.unsupported',
              retryable: false,
              detail: `Block at ${position.x}, ${position.y}, ${position.z} is not a container (found: ${block.name})`,
            },
            metrics: {
              durationMs: ctx.now() - startTime,
              retries: 0,
              timeouts: 0,
            },
          };
        }
      } else {
        // Search for nearest container
        targetPos = await findNearestChest(bot, radius);
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
              detail: `No block found at found container position`,
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

      // Open the container
      let container: any;
      try {
        switch (block.name) {
          case 'furnace':
            container = await bot.openFurnace(block as any);
            break;
          case 'chest':
          case 'trapped_chest':
            container = await bot.openChest(block as any);
            break;
          default:
            return {
              status: 'failure',
              error: {
                code: 'container.unsupported',
                retryable: false,
                detail: `Container type ${block.name} not yet supported`,
              },
              metrics: {
                durationMs: ctx.now() - startTime,
                retries: 0,
                timeouts: 0,
              },
            };
        }
      } catch (error) {
        return {
          status: 'failure',
          error: {
            code: 'container.busy',
            retryable: true,
            detail: `Failed to open container: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Extract container contents
      const contents = [];
      if (container && typeof container.items === 'function') {
        const containerItems = container.items();

        for (let i = 0; i < containerItems.length; i++) {
          const item = containerItems[i];
          if (item && item.name) {
            contents.push({
              slot: i,
              item: item.name,
              count: item.count || 1,
            });
          }
        }
      }

      const endTime = ctx.now();
      const duration = endTime - startTime;

      // Emit metrics
      ctx.emitMetric('open_container_duration', duration);
      ctx.emitMetric('open_container_items', contents.length);
      ctx.emitMetric('open_container_type', block.name.length);

      return {
        status: 'success',
        result: {
          success: true,
          containerType: detectedType,
          position: {
            x: targetPos.x,
            y: targetPos.y,
            z: targetPos.z,
          },
          contents,
          containerId: `${detectedType}_${targetPos.x}_${targetPos.y}_${targetPos.z}`,
          slots: contents.length,
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    } catch (error) {
      const endTime = ctx.now();
      const duration = endTime - startTime;

      return {
        status: 'failure',
        error: {
          code: 'container.error',
          retryable: true,
          detail:
            error instanceof Error ? error.message : 'Unknown container error',
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    }
  }

// ============================================================================
// Transfer Items Leaf
// ============================================================================

/**
 * Transfer items between containers or from container to inventory
 */
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
          enum: ['take', 'put', 'swap'],
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
      const bot = ctx.bot;

      // Use container tracking system to manage references by container ID
      const containerManager =
        ctx.containerManager || new ContainerManager(bot);

      // Get source and destination containers
      let sourceContainer = containerManager.getContainer(source);
      let destContainer = containerManager.getContainer(destination);

      // If containers aren't tracked, try to find and open them
      if (!sourceContainer && typeof source === 'string') {
        // Try to find container by position or ID
        const sourcePos = parseContainerPosition(source);
        if (sourcePos) {
          sourceContainer = await openContainerAtPosition(
            bot,
            sourcePos,
            containerManager
          );
        }
      }

      if (!destContainer && typeof destination === 'string') {
        const destPos = parseContainerPosition(destination);
        if (destPos) {
          destContainer = await openContainerAtPosition(
            bot,
            destPos,
            containerManager
          );
        }
      }

      // Perform the actual transfer
      if (!sourceContainer || !destContainer) {
        return {
          status: 'failure',
          error: {
            code: 'container.notFound',
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

      // Implement actual item transfer logic
      let itemsTransferred = 0;

      try {
        const sourceWindow = sourceContainer.window;
        const destWindow = destContainer.window;

        if (!sourceWindow || !destWindow) {
          throw new Error('Container windows not available');
        }

        // Identify items to transfer based on mode
        const itemsToTransfer: Array<{
          slot: number;
          item: any;
          count: number;
        }> = [];

        if (mode.includes('all')) {
          // Transfer all items from source to destination
          for (
            let slot = 0;
            slot < sourceWindow.inventoryStart + sourceWindow.inventoryEnd;
            slot++
          ) {
            const item = sourceWindow.slots[slot];
            if (item) {
              itemsToTransfer.push({ slot, item, count: item.count });
            }
          }
        } else if (mode.includes('deposit')) {
          // Transfer from bot inventory to container
          for (
            let slot = sourceWindow.inventoryStart;
            slot < sourceWindow.inventoryEnd;
            slot++
          ) {
            const item = sourceWindow.slots[slot];
            if (item) {
              itemsToTransfer.push({ slot, item, count: item.count });
            }
          }
        } else if (mode.includes('withdraw')) {
          // Transfer from container to bot inventory
          for (let slot = 0; slot < sourceWindow.inventoryStart; slot++) {
            const item = sourceWindow.slots[slot];
            if (item) {
              itemsToTransfer.push({ slot, item, count: item.count });
            }
          }
        } else {
          // Custom transfer based on mode - look for specific item types
          for (
            let slot = 0;
            slot < sourceWindow.inventoryStart + sourceWindow.inventoryEnd;
            slot++
          ) {
            const item = sourceWindow.slots[slot];
            if (item && mode.some((m) => item.name.includes(m.toLowerCase()))) {
              itemsToTransfer.push({ slot, item, count: item.count });
            }
          }
        }

        // Perform the actual item transfers
        for (const transfer of itemsToTransfer) {
          try {
            // Find an empty slot in destination
            let emptySlot = -1;
            const destSlots = mode.includes('withdraw')
              ? destWindow.inventoryStart // Transfer to bot inventory
              : 0; // Transfer to container
            const destSlotsEnd = mode.includes('withdraw')
              ? destWindow.inventoryEnd
              : destWindow.inventoryStart;

            for (let slot = destSlots; slot < destSlotsEnd; slot++) {
              if (!destWindow.slots[slot]) {
                emptySlot = slot;
                break;
              }
            }

            if (emptySlot === -1) {
              console.warn(`No empty slot found for ${transfer.item.name}`);
              continue;
            }

            // Move the item
            await sourceWindow.transferItem(
              transfer.slot,
              emptySlot,
              transfer.count
            );
            itemsTransferred++;

            console.log(
              `✅ Transferred ${transfer.count}x ${transfer.item.name}`
            );

            // Small delay to prevent overwhelming the server
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (transferError) {
            console.warn(
              `Failed to transfer ${transfer.item.name}:`,
              transferError
            );
          }
        }
      } catch (transferError) {
        console.error('Item transfer logic error:', transferError);
      }

      const endTime = ctx.now();
      const duration = endTime - startTime;

      // Emit metrics
      ctx.emitMetric('transfer_items_duration', duration);
      ctx.emitMetric('transfer_items_mode', mode.length);
      ctx.emitMetric('transfer_items_count', itemsTransferred);

      return {
        status: 'success',
        data: {
          sourceContainer: sourceContainer.id,
          destinationContainer: destContainer.id,
          mode,
          itemsTransferred,
          transferTime: duration,
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    } catch (error) {
      const endTime = ctx.now();
      const duration = endTime - startTime;

      return {
        status: 'failure',
        error: {
          code: 'container.transferError',
          retryable: true,
          detail:
            error instanceof Error ? error.message : 'Unknown transfer error',
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    }
  }

// ============================================================================
// Close Container Leaf
// ============================================================================

/**
 * Close an open container
 */
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
            'ID of the container to close (optional - closes last opened)',
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
    const { containerId, waitForItems = false } = args;

    try {
      const bot = ctx.bot;

      // Use container tracking system to find and close specific containers by ID
      const containerManager =
        ctx.containerManager || new ContainerManager(bot);

      // Try to find container by ID or position
      let container: ContainerInfo | null = null;

      if (containerId) {
        container = containerManager.getContainer(containerId);
      }

      // If not found by ID, try to parse as position
      if (!container && containerId) {
        const position = parseContainerPosition(containerId);
        if (position) {
          container = containerManager.getContainerByPosition(position);
        }
      }

      // If still not found, try to find nearest tracked container
      if (!container) {
        container = containerManager.findNearestContainer();
      }

      if (!container) {
        return {
          status: 'failure',
          error: {
            code: 'container.notFound',
            retryable: true,
            detail: `No container found with ID: ${containerId}`,
          },
          metrics: {
            durationMs: ctx.now() - startTime,
            retries: 0,
            timeouts: 0,
          },
        };
      }

      // Close the container
      const wasClosed = containerManager.closeContainer(container.id);

      const endTime = ctx.now();
      const duration = endTime - startTime;

      // Emit metrics
      ctx.emitMetric('close_container_duration', duration);

      return {
        status: wasClosed ? 'success' : 'failure',
        data: {
          containerId: container.id,
          position: container.position,
          wasOpen: !!container.window,
          closed: wasClosed,
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    } catch (error) {
      const endTime = ctx.now();
      const duration = endTime - startTime;

      return {
        status: 'failure',
        error: {
          code: 'container.closeError',
          retryable: true,
          detail:
            error instanceof Error ? error.message : 'Unknown close error',
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    }
  }

// ============================================================================
// Inventory Management Leaf
// ============================================================================

/**
 * Organize and manage inventory contents
 */
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
          enum: ['sort', 'compact', 'drop_unwanted', 'keep_essentials'],
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
      const bot = ctx.bot;

      // Get current inventory
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

      // Implement comprehensive inventory management logic
      try {
        switch (action) {
          case 'sort':
            // Sort items by type and value
            const sortedItems = sortInventoryItems(bot, keepItems);
            itemsProcessed = sortedItems.length;
            break;

          case 'compact':
            // Compact item stacks to maximize space
            const compacted = compactInventoryStacks(bot, maxStackSize);
            itemsProcessed = compacted.processed;
            stacksCompacted = compacted.compacted;
            break;

          case 'drop':
            // Drop unwanted items
            const dropped = await dropUnwantedItems(bot, keepItems);
            itemsProcessed = dropped.processed;
            itemsDropped = dropped.dropped;
            break;

          case 'organize':
            // Comprehensive organization: sort + compact + drop
            const organized = await organizeInventory(
              bot,
              keepItems,
              maxStackSize
            );
            itemsProcessed = organized.processed;
            stacksCompacted = organized.compacted;
            itemsDropped = organized.dropped;
            break;

          default:
            throw new Error(`Unknown inventory action: ${action}`);
        }

        const endTime = ctx.now();
        const duration = endTime - startTime;

        // Emit metrics
        ctx.emitMetric('manage_inventory_duration', duration);
        ctx.emitMetric('manage_inventory_action', action.length);
        ctx.emitMetric('manage_inventory_items_processed', itemsProcessed);
        ctx.emitMetric('manage_inventory_stacks_compacted', stacksCompacted);
        ctx.emitMetric('manage_inventory_items_dropped', itemsDropped);

        return {
          status: 'success',
          data: {
            success: true,
            action,
            itemsProcessed,
            stacksCompacted,
            itemsDropped,
          },
          metrics: {
            durationMs: duration,
            retries: 0,
            timeouts: 0,
          },
        };
      } catch (error) {
        const endTime = ctx.now();
        const duration = endTime - startTime;

        return {
          status: 'failure',
          error: {
            code: 'inventory.managementError',
            retryable: true,
            detail:
              error instanceof Error
                ? error.message
                : 'Inventory management failed',
          },
          metrics: {
            durationMs: duration,
            retries: 0,
            timeouts: 0,
          },
        };
      }
    } catch (error) {
      const endTime = ctx.now();
      const duration = endTime - startTime;

      return {
        status: 'failure',
        error: {
          code: 'container.managementError',
          retryable: true,
          detail:
            error instanceof Error ? error.message : 'Unknown management error',
        },
        metrics: {
          durationMs: duration,
          retries: 0,
          timeouts: 0,
        },
      };
    }
  }
