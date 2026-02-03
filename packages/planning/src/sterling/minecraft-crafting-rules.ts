/**
 * Minecraft Crafting Rules Builder
 *
 * Builds the rule set for Sterling's minecraft domain by reading Mineflayer's
 * mcData recipes and tracing dependencies backward from a goal item.
 *
 * @author @darianrosebrook
 */

import type {
  MinecraftCraftingRule,
  CraftingInventoryItem,
} from './minecraft-crafting-types';
import type { TaskRequirement } from '../modules/requirements';

// ============================================================================
// mcData type shims (Mineflayer's minecraft-data)
// ============================================================================

/** Minimal shape of a minecraft-data recipe */
interface McDataRecipe {
  /** Item ID output */
  result?: { id: number; count?: number };
  /** Shaped recipe: 2D array of ingredient item IDs (null for empty slots) */
  inShape?: (number | null)[][];
  /** Shapeless recipe: list of ingredient item IDs */
  ingredients?: (number | null)[];
  /** Whether a crafting table (3×3) is required */
  requiresTable?: boolean;
}

/** Minimal shape of a minecraft-data item */
interface McDataItem {
  id: number;
  name: string;
  displayName?: string;
}

/** Minimal slice of minecraft-data we consume */
export interface McData {
  recipes: Record<number, McDataRecipe[]>;
  items: Record<number, McDataItem>;
  itemsByName: Record<string, McDataItem>;
}

/**
 * Validate that a value is a structurally valid McData instance.
 * Guards against truthy-but-malformed values (e.g. `{}` from metadata)
 * that would pass a simple nullish check but crash on property access.
 */
export function isValidMcData(x: unknown): x is McData {
  if (!x || typeof x !== 'object') return false;
  const obj = x as Record<string, unknown>;
  return (
    typeof obj.recipes === 'object' && obj.recipes !== null &&
    typeof obj.items === 'object' && obj.items !== null &&
    typeof obj.itemsByName === 'object' && obj.itemsByName !== null
  );
}

// ============================================================================
// Rule building
// ============================================================================

/**
 * Recursively trace the recipe tree for `goalItem` and return a deduplicated
 * set of crafting rules that Sterling can use to search the crafting graph.
 *
 * @param mcData  - minecraft-data instance (from `require('minecraft-data')(version)`)
 * @param goalItem - target item name (e.g. "wooden_pickaxe")
 * @param maxDepth - recursion limit to avoid infinite loops (default 8)
 */
export function buildCraftingRules(
  mcData: McData,
  goalItem: string,
  maxDepth = 8
): MinecraftCraftingRule[] {
  if (!isValidMcData(mcData)) {
    throw new Error(
      'MISSING_MCDATA: buildCraftingRules requires a valid minecraft-data instance ' +
      '(with recipes, items, itemsByName). ' +
      'The planner must load mcData via getMcData() and pass it through the solver chain.',
    );
  }

  const rules = new Map<string, MinecraftCraftingRule>();
  const visited = new Set<string>();

  function trace(itemName: string, depth: number): void {
    if (depth > maxDepth || visited.has(itemName)) return;
    visited.add(itemName);

    const item = mcData.itemsByName[itemName];
    if (!item) {
      // No item data — treat as raw material that must be mined
      addMineRule(rules, itemName);
      return;
    }

    const recipes = mcData.recipes[item.id];
    if (!recipes || recipes.length === 0) {
      // No recipe — raw material
      addMineRule(rules, itemName);
      return;
    }

    // Process each recipe variant
    for (const recipe of recipes) {
      const ingredientIds = extractIngredientIds(recipe);
      if (ingredientIds.length === 0) continue;

      // Count ingredients
      const ingredientCounts = new Map<number, number>();
      for (const id of ingredientIds) {
        if (id === null || id === undefined) continue;
        ingredientCounts.set(id, (ingredientCounts.get(id) || 0) + 1);
      }

      const consumes: CraftingInventoryItem[] = [];
      for (const [id, count] of ingredientCounts) {
        const ingredientItem = mcData.items[id];
        if (ingredientItem) {
          consumes.push({ name: ingredientItem.name, count });
        }
      }

      const outputCount = recipe.result?.count ?? 1;
      const needsTable = recipe.requiresTable ?? isLargeRecipe(recipe);

      const actionKey = `craft:${itemName}${recipes.length > 1 ? `:v${Array.from(rules.keys()).filter(k => k.startsWith(`craft:${itemName}`)).length}` : ''}`;

      if (!rules.has(actionKey)) {
        rules.set(actionKey, {
          action: actionKey,
          actionType: 'craft',
          produces: [{ name: itemName, count: outputCount }],
          consumes,
          requires: [],
          needsTable,
          needsFurnace: false,
          baseCost: 1.0,
        });
      }

      // Recurse into ingredients
      for (const [id] of ingredientCounts) {
        const ingredientItem = mcData.items[id];
        if (ingredientItem) {
          trace(ingredientItem.name, depth + 1);
        }
      }
    }

    // If any recipe requires a table, add a place:crafting_table rule
    const anyNeedsTable = Array.from(rules.values()).some(r => r.needsTable);
    if (anyNeedsTable && !rules.has('place:crafting_table')) {
      // IMPORTANT: consumes MUST be empty for place rules. Sterling's apply_rule()
      // internally decrements the placed item. If we also list it in consumes,
      // it gets double-decremented — requiring 2 crafting tables to place 1.
      rules.set('place:crafting_table', {
        action: 'place:crafting_table',
        actionType: 'place',
        produces: [], // doesn't produce inventory items; enables table access
        consumes: [],
        requires: [{ name: 'crafting_table', count: 1 }],
        needsTable: false,
        needsFurnace: false,
        baseCost: 1.5,
      });

      // Ensure we can also craft the crafting_table itself
      trace('crafting_table', depth + 1);
    }
  }

  trace(goalItem, 0);
  return Array.from(rules.values());
}

// ============================================================================
// Inventory helpers
// ============================================================================

/**
 * Convert a Mineflayer-style inventory array to a Record<string, number> map.
 */
export function inventoryToRecord(
  items: Array<{ name?: string; type?: string; count: number } | null | undefined>
): Record<string, number> {
  const record: Record<string, number> = {};
  for (const item of items) {
    if (!item) continue;
    // MC interface returns `type`, solver tests use `name`
    const itemName = item.name || item.type;
    if (!itemName) continue;
    record[itemName] = (record[itemName] || 0) + item.count;
  }
  return record;
}

/**
 * Convert a TaskRequirement to a Record<string, number> goal format for Sterling.
 */
export function goalFromTaskRequirement(
  req: TaskRequirement
): Record<string, number> | null {
  if (req.kind === 'craft') {
    return { [req.outputPattern]: req.quantity };
  }
  if (req.kind === 'collect' || req.kind === 'mine') {
    // For collect/mine, use the first pattern as the goal item
    if (req.patterns.length > 0) {
      return { [req.patterns[0]]: req.quantity };
    }
  }
  return null;
}

// ============================================================================
// Internal helpers
// ============================================================================

function addMineRule(
  rules: Map<string, MinecraftCraftingRule>,
  itemName: string
): void {
  const key = `mine:${itemName}`;
  if (rules.has(key)) return;

  rules.set(key, {
    action: key,
    actionType: 'mine',
    produces: [{ name: itemName, count: 1 }],
    consumes: [],
    requires: [],
    needsTable: false,
    needsFurnace: false,
    baseCost: 5.0, // Higher cost reflects real-world mining time
  });
}

function extractIngredientIds(recipe: McDataRecipe): (number | null)[] {
  if (recipe.inShape) {
    return recipe.inShape.flat();
  }
  if (recipe.ingredients) {
    return recipe.ingredients;
  }
  return [];
}

/** Heuristic: if a recipe has a shape larger than 2×2, it needs a crafting table */
function isLargeRecipe(recipe: McDataRecipe): boolean {
  if (recipe.inShape) {
    const rows = recipe.inShape.length;
    const cols = Math.max(...recipe.inShape.map(r => r.length));
    return rows > 2 || cols > 2;
  }
  // Shapeless recipes with more than 4 ingredients need a table
  if (recipe.ingredients) {
    const nonNull = recipe.ingredients.filter(i => i !== null);
    return nonNull.length > 4;
  }
  return false;
}
