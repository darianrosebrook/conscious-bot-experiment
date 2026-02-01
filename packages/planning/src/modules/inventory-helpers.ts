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
  return inv.some((it) => itemMatches(it, ['wooden_pickaxe', 'wooden pickaxe']));
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
  return countItems(inv, ['oak_planks', 'planks']) >= min;
}

export function hasCobblestone(inv: InventoryItem[], min = 3): boolean {
  return countItems(inv, ['cobblestone']) >= min;
}

export function inferRecipeFromTitle(title: string): string | null {
  const t = (title || '').toLowerCase();
  if (t.includes('wooden pickaxe')) return 'wooden_pickaxe';
  if (t.includes('stone pickaxe')) return 'stone_pickaxe';
  if (t.includes('stick')) return 'stick';
  if (t.includes('crafting table')) return 'crafting_table';
  if (t.includes('plank')) return 'oak_planks';
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

