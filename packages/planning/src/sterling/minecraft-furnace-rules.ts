/**
 * Furnace Scheduling Rule Builder
 *
 * Generates typed operators for the four furnace operator families:
 * - load_furnace: Place item into furnace slot
 * - add_fuel: Add fuel to furnace
 * - wait_tick: Wait for smelting to complete
 * - retrieve_output: Remove smelted item from furnace
 *
 * Maps to existing Sterling action types:
 * - load_furnace → 'craft' (inventory manipulation)
 * - add_fuel → 'craft' (inventory manipulation)
 * - wait_tick → 'smelt' (time-consuming furnace operation)
 * - retrieve_output → 'craft' (inventory manipulation)
 *
 * @author @darianrosebrook
 */

import type { FurnaceSchedulingRule } from './minecraft-furnace-types';

// ============================================================================
// Constants
// ============================================================================

/** Default smelting duration in ticks (200 ticks = 10 seconds at 20 tps). */
export const DEFAULT_SMELT_DURATION_TICKS = 200;

/** Default fuel duration in ticks (1 coal = 1600 ticks, enough for 8 items). */
export const DEFAULT_FUEL_DURATION_TICKS = 1600;

/** Items per coal unit. */
export const ITEMS_PER_FUEL = 8;

// ============================================================================
// Smeltable Item Registry
// ============================================================================

/**
 * Known smeltable items and their outputs.
 * Used by buildFurnaceRules to generate load/wait/retrieve operators.
 */
export const SMELTABLE_ITEMS: ReadonlyArray<{
  input: string;
  output: string;
  durationTicks: number;
}> = [
  { input: 'iron_ore', output: 'iron_ingot', durationTicks: 200 },
  { input: 'raw_iron', output: 'iron_ingot', durationTicks: 200 },
  { input: 'gold_ore', output: 'gold_ingot', durationTicks: 200 },
  { input: 'raw_gold', output: 'gold_ingot', durationTicks: 200 },
  { input: 'raw_copper', output: 'copper_ingot', durationTicks: 200 },
  { input: 'sand', output: 'glass', durationTicks: 200 },
  { input: 'cobblestone', output: 'stone', durationTicks: 200 },
  { input: 'raw_beef', output: 'cooked_beef', durationTicks: 200 },
  { input: 'raw_porkchop', output: 'cooked_porkchop', durationTicks: 200 },
  { input: 'raw_chicken', output: 'cooked_chicken', durationTicks: 200 },
  { input: 'raw_mutton', output: 'cooked_mutton', durationTicks: 200 },
  { input: 'raw_cod', output: 'cooked_cod', durationTicks: 200 },
  { input: 'raw_salmon', output: 'cooked_salmon', durationTicks: 200 },
  { input: 'clay_ball', output: 'brick', durationTicks: 200 },
  { input: 'netherrack', output: 'nether_brick', durationTicks: 200 },
  { input: 'ancient_debris', output: 'netherite_scrap', durationTicks: 200 },
];

// ============================================================================
// Rule Builder
// ============================================================================

/**
 * Build furnace scheduling rules for a set of items and furnace slot count.
 *
 * Generates four operator families per smeltable item:
 * 1. load_furnace — place input item into an available furnace
 * 2. add_fuel — ensure furnace has fuel (coal consumed)
 * 3. wait_tick — wait for smelting to complete (time-bearing operator)
 * 4. retrieve_output — remove output item from furnace
 *
 * @param items - Items to smelt (subset of SMELTABLE_ITEMS inputs)
 * @param furnaceSlotCount - Number of available furnace slots
 * @returns Array of FurnaceSchedulingRule
 */
export function buildFurnaceRules(
  items: readonly string[],
  furnaceSlotCount: number,
): FurnaceSchedulingRule[] {
  const rules: FurnaceSchedulingRule[] = [];
  const knownItems = new Map(
    SMELTABLE_ITEMS.map((si) => [si.input, si]),
  );

  for (const itemName of items) {
    const smeltInfo = knownItems.get(itemName);
    if (!smeltInfo) continue;

    // load_furnace: place item into furnace
    rules.push({
      action: `furnace:load:${itemName}`,
      actionType: 'craft',
      operatorFamily: 'load_furnace',
      produces: [],
      consumes: [{ name: itemName, count: 1 }],
      requires: [],
      needsTable: false,
      needsFurnace: true,
      baseCost: 2,
      durationTicks: 0,
      requiresSlotType: 'furnace',
    });

    // add_fuel: add coal to furnace
    rules.push({
      action: `furnace:fuel:${itemName}`,
      actionType: 'craft',
      operatorFamily: 'add_fuel',
      produces: [],
      consumes: [{ name: 'coal', count: 1 }],
      requires: [],
      needsTable: false,
      needsFurnace: true,
      baseCost: 1,
      durationTicks: 0,
      requiresSlotType: 'furnace',
    });

    // wait_tick: wait for smelting (time-bearing operator)
    rules.push({
      action: `furnace:smelt:${itemName}`,
      actionType: 'smelt',
      operatorFamily: 'wait_tick',
      produces: [{ name: `smelting:${itemName}`, count: 1 }],
      consumes: [],
      requires: [],
      needsTable: false,
      needsFurnace: true,
      baseCost: 10,
      durationTicks: smeltInfo.durationTicks,
      requiresSlotType: 'furnace',
    });

    // retrieve_output: remove smelted item from furnace
    rules.push({
      action: `furnace:retrieve:${itemName}`,
      actionType: 'craft',
      operatorFamily: 'retrieve_output',
      produces: [{ name: smeltInfo.output, count: 1 }],
      consumes: [{ name: `smelting:${itemName}`, count: 1 }],
      requires: [],
      needsTable: false,
      needsFurnace: true,
      baseCost: 2,
      durationTicks: 0,
      requiresSlotType: 'furnace',
    });
  }

  return rules;
}

/**
 * Build a goal record for furnace scheduling.
 *
 * @param items - Map of output item name → desired count
 */
export function buildFurnaceGoal(
  items: Record<string, number>,
): Record<string, number> {
  return { ...items };
}

/**
 * Check if a furnace rule's preconditions would be violated by
 * attempting to load into an already-occupied slot.
 *
 * @param slotOccupied - Whether the target slot currently has an item
 * @param operatorFamily - The operator family being applied
 * @returns true if precondition is violated (overcapacity)
 */
export function checkSlotPrecondition(
  slotOccupied: boolean,
  operatorFamily: string,
): boolean {
  if (operatorFamily === 'load_furnace' && slotOccupied) {
    return true; // Overcapacity: slot already occupied
  }
  return false;
}
