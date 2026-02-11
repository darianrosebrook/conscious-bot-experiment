export type InventoryItem = {
  name?: string | null;
  displayName?: string;
  type?: string | number | null;
  count?: number;
  slot?: number;
};

export function itemMatches(item: InventoryItem, patterns: string[]): boolean {
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

export function countItems(inv: InventoryItem[], patterns: string[]): number {
  return inv.reduce((sum, it) => sum + (itemMatches(it, patterns) ? it.count || 1 : 0), 0);
}

export function hasPickaxe(inv: InventoryItem[]): boolean {
  return inv.some((it) => itemMatches(it, ['_pickaxe', 'pickaxe']));
}

export function hasEnoughLogs(inv: InventoryItem[], minLogs = 2): boolean {
  const logs = countItems(inv, ['_log', ' log']);
  return logs >= minLogs;
}

export function hasStonePickaxe(inv: InventoryItem[]): boolean {
  return inv.some((it) => itemMatches(it, ['stone_pickaxe', 'stone pickaxe']));
}

export function hasCraftingTableItem(inv: InventoryItem[]): boolean {
  return inv.some((it) => itemMatches(it, ['crafting_table']))
}

export function hasSticks(inv: InventoryItem[], min = 2): boolean {
  return countItems(inv, ['stick']) >= min;
}

export function hasPlanks(inv: InventoryItem[], min = 5): boolean {
  return countItems(inv, ['_planks', 'planks']) >= min;
}

export function hasCobblestone(inv: InventoryItem[], min = 3): boolean {
  return countItems(inv, ['cobblestone']) >= min;
}

/**
 * Detect which wood variant the bot has in inventory.
 * Returns e.g. "birch" if the bot has birch_log, defaults to "oak".
 */
export function findWoodPrefix(inv: InventoryItem[]): string {
  const log = inv.find((it) => itemMatches(it, ['_log']));
  const name = log?.name || log?.displayName || '';
  const match = name.match(/^(\w+)_log/);
  return match?.[1] || 'oak';
}

// Ordered weakest → strongest
const TOOL_TIERS = ['wooden', 'stone', 'iron', 'diamond', 'netherite'] as const;
export type ToolTier = (typeof TOOL_TIERS)[number];

const TOOL_TYPES = ['pickaxe', 'axe', 'sword', 'shovel', 'hoe'] as const;
export type ToolType = (typeof TOOL_TYPES)[number];

/**
 * Detect the best tool tier the bot currently has for a given tool type.
 * Returns the tier name (e.g. "iron") or null if the bot has none.
 */
export function bestTierForTool(inv: InventoryItem[], toolType: ToolType): ToolTier | null {
  let best: ToolTier | null = null;
  let bestIdx = -1;
  for (const it of inv) {
    for (let i = 0; i < TOOL_TIERS.length; i++) {
      const tier = TOOL_TIERS[i];
      if (itemMatches(it, [`${tier}_${toolType}`]) && i > bestIdx) {
        best = tier;
        bestIdx = i;
      }
    }
  }
  return best;
}

/**
 * Return the full item name of the best tool of a given type, e.g. "iron_pickaxe".
 * Falls back to the provided default if bot has none.
 */
export function bestToolName(inv: InventoryItem[], toolType: ToolType, fallback?: ToolTier): string {
  const tier = bestTierForTool(inv, toolType);
  return `${tier || fallback || 'wooden'}_${toolType}`;
}

/**
 * Determine the next upgrade tier for a given tool type.
 * If bot has wooden_pickaxe, returns "stone_pickaxe". If none, returns "wooden_pickaxe".
 */
export function nextToolUpgrade(inv: InventoryItem[], toolType: ToolType): string {
  const tier = bestTierForTool(inv, toolType);
  if (!tier) return `wooden_${toolType}`;
  const idx = TOOL_TIERS.indexOf(tier);
  if (idx < TOOL_TIERS.length - 1) return `${TOOL_TIERS[idx + 1]}_${toolType}`;
  return `${tier}_${toolType}`; // already max tier
}

/**
 * Check if the bot can mine a given ore based on its best pickaxe tier.
 * Returns true if the bot's pickaxe tier meets the minimum requirement.
 */
export function canMineOre(inv: InventoryItem[], ore: string): boolean {
  const tier = bestTierForTool(inv, 'pickaxe');
  if (!tier) return false;
  const tierIdx = TOOL_TIERS.indexOf(tier);
  const requirements: Record<string, number> = {
    coal_ore: 0,       // wooden+
    copper_ore: 0,     // wooden+
    iron_ore: 1,       // stone+
    lapis_lazuli_ore: 1,
    gold_ore: 2,       // iron+
    redstone_ore: 2,
    diamond_ore: 2,
    emerald_ore: 2,
    ancient_debris: 4, // netherite (diamond+)
  };
  const minTier = requirements[ore] ?? 1; // default: stone+ for unknown ores
  return tierIdx >= minTier;
}

/**
 * Suggest the best ore the bot can currently mine.
 */
export function bestMineableOre(inv: InventoryItem[]): string {
  const tier = bestTierForTool(inv, 'pickaxe');
  if (!tier) return 'stone'; // no pickaxe → punch stone
  const tierIdx = TOOL_TIERS.indexOf(tier);
  if (tierIdx >= 2) return 'diamond_ore'; // iron+ can mine diamond
  if (tierIdx >= 1) return 'iron_ore';    // stone can mine iron
  return 'stone';                          // wooden can mine stone/coal
}

export function inferRecipeFromTitle(title: string): string | null {
  const t = (title || '').toLowerCase();
  if (t.includes('wooden pickaxe')) return 'wooden_pickaxe';
  if (t.includes('stone pickaxe')) return 'stone_pickaxe';
  if (t.includes('stick')) return 'stick';
  if (t.includes('crafting table')) return 'crafting_table';
  if (t.includes('plank')) return '_planks';
  return null;
}

export function inferBlockTypeFromTitle(title: string): string | null {
  const t = (title || '').toLowerCase();
  if (t.includes('iron')) return 'iron_ore';
  if (t.includes('oak')) return 'oak_log';
  if (t.includes('birch')) return 'birch_log';
  if (t.includes('spruce')) return 'spruce_log';
  if (t.includes('wood') || t.includes('log')) return '_log';
  if (t.includes('stone') || t.includes('cobble')) return 'stone';
  return null;
}

