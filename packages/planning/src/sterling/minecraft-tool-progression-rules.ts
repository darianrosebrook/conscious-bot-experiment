/**
 * Minecraft Tool Progression Rule Builder
 *
 * Generates the rule set for Sterling's tool progression graph search.
 * Rules encode capability-gated tier upgrades: each pickaxe tier unlocks
 * mining specific blocks, and mining those blocks provides materials for
 * the next tier.
 *
 * Design constraints:
 * - All action IDs use 'tp:' prefix for learning isolation from crafting.
 * - Capabilities are virtual tokens with 'cap:' prefix that exist only
 *   in Sterling's search state (never in real inventory).
 * - Mining rules are gated on nearbyBlocks — if required ores aren't
 *   observed, the solver reports needsBlocks instead of phantom plans.
 * - Tier gate matrix is a frozen constant (not derived from mcData at
 *   runtime) to ensure deterministic, auditable behavior.
 *
 * @author @darianrosebrook
 */

import type { ToolProgressionRule, ToolProgressionItem, ToolTier, ToolType } from './minecraft-tool-progression-types';
import {
  TOOL_TIERS,
  CAP_PREFIX,
  TIER_GATE_MATRIX,
  PICKAXE_RECIPES,
  ORE_DROP_MAP,
  SMELT_RECIPES,
} from './minecraft-tool-progression-types';

// ============================================================================
// Public API
// ============================================================================

/**
 * Build the full rule set for tool progression from current tier to target tier.
 *
 * @param targetTool  - Target tool name (e.g. 'iron_pickaxe')
 * @param toolType    - Tool type (e.g. 'pickaxe')
 * @param currentTier - Bot's current best tier (null = no pickaxe)
 * @param targetTier  - Tier to reach
 * @param nearbyBlocks - Blocks the bot can currently observe
 * @returns Rules for Sterling, plus any blocks that are needed but not observed
 */
export function buildToolProgressionRules(
  targetTool: string,
  toolType: ToolType,
  currentTier: ToolTier | null,
  targetTier: ToolTier,
  nearbyBlocks: string[]
): { rules: ToolProgressionRule[]; missingBlocks: string[] } {
  const rules: ToolProgressionRule[] = [];
  const missingBlocks: string[] = [];
  const nearbySet = new Set(nearbyBlocks);

  const startIdx = currentTier ? TOOL_TIERS.indexOf(currentTier) + 1 : 0;
  const endIdx = TOOL_TIERS.indexOf(targetTier);

  // Include material acquisition rules for all tiers the bot already has.
  // Higher tiers depend on materials from lower tiers:
  // - Sticks/crafting tables always need wood (oak_log -> oak_planks)
  // - Furnaces need cobblestone (stone tier mining)
  // These are only needed when the tier loop starts above those tiers.
  if (startIdx > 0) {
    // Wood: always needed for sticks, crafting tables
    addWoodAcquisitionRules(rules);

    // Cobblestone: needed for furnace (iron+ tiers)
    // Only add if the bot already has wooden pickaxe capability
    if (currentTier && TOOL_TIERS.indexOf(currentTier) >= TOOL_TIERS.indexOf('wooden')) {
      addMineRuleWithInvariant(rules, {
        action: 'tp:mine:cobblestone',
        actionType: 'mine',
        produces: [{ name: 'cobblestone', count: 4 }],
        consumes: [],
        requires: [{ name: `${CAP_PREFIX}has_wooden_pickaxe`, count: 1 }],
        needsTable: false,
        needsFurnace: false,
        baseCost: 5.0,
      });
    }
  }

  // Generate rules for each tier step from current+1 to target
  for (let i = startIdx; i <= endIdx; i++) {
    const tier = TOOL_TIERS[i];
    const prevTier = i > 0 ? TOOL_TIERS[i - 1] : null;

    // 1. Generate material acquisition rules for this tier
    const recipe = PICKAXE_RECIPES[tier];

    if (tier === 'wooden') {
      // Wood tier: mine logs (no pickaxe needed), craft planks + sticks
      addWoodAcquisitionRules(rules);
    } else {
      // Higher tiers: mine materials gated by previous tier's pickaxe
      const materialsResult = addMaterialAcquisitionRules(
        rules, tier, prevTier!, nearbySet
      );
      missingBlocks.push(...materialsResult.missingBlocks);
    }

    // 2. Stick crafting (always needed for tool crafting)
    addStickCraftingRule(rules);

    // 3. Crafting table (all pickaxes are 3x3 recipes)
    addCraftingTableRules(rules);

    // 4. Upgrade rule: craft the pickaxe at this tier
    addUpgradeRule(rules, tier, toolType, recipe);
  }

  return { rules, missingBlocks };
}

/**
 * Determine the bot's best pickaxe tier from current inventory.
 *
 * @param inventory - Current inventory as {name: count}
 * @returns Best tier, or null if no pickaxe
 */
export function detectCurrentTier(
  inventory: Record<string, number>
): ToolTier | null {
  // Check tiers in descending order
  for (let i = TOOL_TIERS.length - 1; i >= 0; i--) {
    const tier = TOOL_TIERS[i];
    const pickaxeName = `${tier}_pickaxe`;
    if (inventory[pickaxeName] && inventory[pickaxeName] > 0) {
      return tier;
    }
  }
  return null;
}

/**
 * Parse a tool name into its tier and type.
 *
 * @param toolName - e.g. 'iron_pickaxe', 'stone_axe'
 * @returns { tier, toolType } or null if not a valid tiered tool
 */
export function parseToolName(toolName: string): { tier: ToolTier; toolType: ToolType } | null {
  for (const tier of TOOL_TIERS) {
    for (const toolType of ['pickaxe', 'axe', 'shovel', 'hoe', 'sword'] as ToolType[]) {
      if (toolName === `${tier}_${toolType}`) {
        return { tier, toolType };
      }
    }
  }
  return null;
}

/**
 * Validate that an inventory has no cap: prefix keys.
 * Throws if virtual tokens are found in input inventory.
 */
export function validateInventoryInput(inventory: Record<string, number>): void {
  for (const key of Object.keys(inventory)) {
    if (key.startsWith(CAP_PREFIX)) {
      throw new Error(
        `[ToolProgression] Input inventory contains virtual capability token '${key}'. ` +
        `cap: tokens must not appear in real inventory.`
      );
    }
  }
}

/**
 * Filter cap: virtual tokens from an inventory record.
 * Used when mapping Sterling's search state back to executable steps.
 */
export function filterCapTokens(inventory: Record<string, number>): Record<string, number> {
  const filtered: Record<string, number> = {};
  for (const [key, value] of Object.entries(inventory)) {
    if (!key.startsWith(CAP_PREFIX)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

/**
 * Filter cap: tokens from an item array.
 */
export function filterCapTokenItems(items: ToolProgressionItem[]): ToolProgressionItem[] {
  return items.filter(item => !item.name.startsWith(CAP_PREFIX));
}

// ============================================================================
// Rule generators (private)
// ============================================================================

/**
 * Add rules for acquiring wood materials (no pickaxe needed).
 * mine oak_log -> craft oak_planks -> craft stick
 */
function addWoodAcquisitionRules(rules: ToolProgressionRule[]): void {
  // Batch: mine 3 logs per action (reduces search depth)
  // At execution time, the bot handler mines individually; batch is a planning abstraction.
  addRuleIfNew(rules, {
    action: 'tp:mine:oak_log',
    actionType: 'mine',
    produces: [{ name: 'oak_log', count: 3 }],
    consumes: [],
    requires: [],
    needsTable: false,
    needsFurnace: false,
    baseCost: 5.0,
  });

  addRuleIfNew(rules, {
    action: 'tp:craft:oak_planks',
    actionType: 'craft',
    produces: [{ name: 'oak_planks', count: 4 }],
    consumes: [{ name: 'oak_log', count: 1 }],
    requires: [],
    needsTable: false,
    needsFurnace: false,
    baseCost: 1.0,
  });
}

/**
 * Add material acquisition rules for a non-wooden tier.
 * Generates mining rules gated by previous tier's capability.
 */
function addMaterialAcquisitionRules(
  rules: ToolProgressionRule[],
  tier: ToolTier,
  prevTier: ToolTier,
  nearbyBlocks: Set<string>
): { missingBlocks: string[] } {
  const missingBlocks: string[] = [];
  const recipe = PICKAXE_RECIPES[tier];
  const capRequired = `${CAP_PREFIX}has_${prevTier}_pickaxe`;

  if (tier === 'stone') {
    // Stone tier: mine cobblestone (gated by wooden pickaxe capability)
    // Batch count: mine 4 cobblestone per action (reduces A* search depth)
    // At execution time, the bot handler mines individually; batch is a planning abstraction.
    const blockAvailable = nearbyBlocks.has('stone') || nearbyBlocks.has('cobblestone');
    if (!blockAvailable) {
      missingBlocks.push('stone');
    }

    // Use invariant pattern: consume+reproduce cap token for mine rules
    // (Sterling skips `requires` for mine rules — see _can_apply line 273)
    addMineRuleWithInvariant(rules, {
      action: 'tp:mine:cobblestone',
      actionType: 'mine',
      produces: [{ name: 'cobblestone', count: 4 }],
      consumes: [],
      requires: [{ name: capRequired, count: 1 }],
      needsTable: false,
      needsFurnace: false,
      baseCost: 5.0,
    });
  } else if (tier === 'iron') {
    // Iron tier: mine iron_ore -> smelt -> iron_ingot
    // Batch count: mine 3 raw_iron per action (enough for one pickaxe)
    const oreBlock = 'iron_ore';
    const blockAvailable = nearbyBlocks.has(oreBlock) || nearbyBlocks.has('deepslate_iron_ore');
    if (!blockAvailable) {
      missingBlocks.push(oreBlock);
    }

    const ironDrop = ORE_DROP_MAP[oreBlock];
    addMineRuleWithInvariant(rules, {
      action: `tp:mine:${oreBlock}`,
      actionType: 'mine',
      produces: [{ name: ironDrop.item, count: 3 }],
      consumes: [],
      requires: [{ name: capRequired, count: 1 }],
      needsTable: false,
      needsFurnace: false,
      baseCost: 10.0,
    });

    // Furnace crafting + placement
    addFurnaceRules(rules);

    // Fuel acquisition (coal mining gated by wooden pickaxe)
    addFuelRules(rules);

    // Smelting raw_iron -> iron_ingot (via SMELT_RECIPES)
    // Batch: smelt 3 at once (enough for one pickaxe)
    const smeltedOutput = SMELT_RECIPES[ironDrop.item];
    addRuleIfNew(rules, {
      action: `tp:smelt:${smeltedOutput}`,
      actionType: 'smelt',
      produces: [{ name: smeltedOutput, count: 3 }],
      consumes: [{ name: ironDrop.item, count: 3 }, { name: 'coal', count: 3 }],
      requires: [{ name: `${CAP_PREFIX}has_furnace`, count: 1 }],
      needsTable: false,
      needsFurnace: true,
      baseCost: 10.0,
    });
  } else if (tier === 'diamond') {
    // Diamond tier: mine diamond_ore (gated by iron pickaxe)
    // Batch: mine 3 diamonds per action (enough for one pickaxe)
    const oreBlock = 'diamond_ore';
    const blockAvailable = nearbyBlocks.has(oreBlock) || nearbyBlocks.has('deepslate_diamond_ore');
    if (!blockAvailable) {
      missingBlocks.push(oreBlock);
    }

    const diamondDrop = ORE_DROP_MAP[oreBlock];
    addMineRuleWithInvariant(rules, {
      action: `tp:mine:${oreBlock}`,
      actionType: 'mine',
      produces: [{ name: diamondDrop.item, count: 3 }],
      consumes: [],
      requires: [{ name: capRequired, count: 1 }],
      needsTable: false,
      needsFurnace: false,
      baseCost: 10.0,
    });
  }

  return { missingBlocks };
}

/** Add stick crafting rule (2 planks -> 4 sticks) */
function addStickCraftingRule(rules: ToolProgressionRule[]): void {
  addRuleIfNew(rules, {
    action: 'tp:craft:stick',
    actionType: 'craft',
    produces: [{ name: 'stick', count: 4 }],
    consumes: [{ name: 'oak_planks', count: 2 }],
    requires: [],
    needsTable: false,
    needsFurnace: false,
    baseCost: 1.0,
  });
}

/** Add crafting table craft + place rules */
function addCraftingTableRules(rules: ToolProgressionRule[]): void {
  addRuleIfNew(rules, {
    action: 'tp:craft:crafting_table',
    actionType: 'craft',
    produces: [{ name: 'crafting_table', count: 1 }],
    consumes: [{ name: 'oak_planks', count: 4 }],
    requires: [],
    needsTable: false,
    needsFurnace: false,
    baseCost: 1.0,
  });

  // Place actions MUST use 'place:<item>' format (no tp: prefix) because
  // Sterling's apply_rule() parses place action IDs via action.split(":", 1)
  // to extract the item name for station state tracking. With tp: prefix,
  // it would parse "tp:place:crafting_table" as item="place:crafting_table"
  // which doesn't match "crafting_table". Learning isolation is still
  // maintained via executionMode which salts the template digest.
  //
  // IMPORTANT: consumes MUST be empty for place rules. Sterling's apply_rule()
  // internally decrements the placed item (line 327: new_inv["crafting_table"] -= 1).
  // If we also list it in consumes, it gets double-decremented.
  addRuleIfNew(rules, {
    action: 'place:crafting_table',
    actionType: 'place',
    produces: [{ name: `${CAP_PREFIX}has_crafting_table`, count: 1 }],
    consumes: [],
    requires: [{ name: 'crafting_table', count: 1 }],
    needsTable: false,
    needsFurnace: false,
    baseCost: 1.5,
  });
}

/** Add furnace craft + place rules */
function addFurnaceRules(rules: ToolProgressionRule[]): void {
  addRuleIfNew(rules, {
    action: 'tp:craft:furnace',
    actionType: 'craft',
    produces: [{ name: 'furnace', count: 1 }],
    consumes: [{ name: 'cobblestone', count: 8 }],
    requires: [],
    needsTable: true,
    needsFurnace: false,
    baseCost: 1.0,
  });

  // Place actions: no tp: prefix (see crafting_table comment), empty consumes
  // (Sterling internally decrements the placed item to avoid double-decrement).
  addRuleIfNew(rules, {
    action: 'place:furnace',
    actionType: 'place',
    produces: [{ name: `${CAP_PREFIX}has_furnace`, count: 1 }],
    consumes: [],
    requires: [{ name: 'furnace', count: 1 }],
    needsTable: false,
    needsFurnace: false,
    baseCost: 1.5,
  });
}

/** Add fuel acquisition rules (coal from mining, charcoal as fallback) */
function addFuelRules(rules: ToolProgressionRule[]): void {
  // Coal from mining (gated by wooden pickaxe — coal_ore is in wooden tier)
  // Uses invariant pattern: Sterling skips requires for mine rules
  // Batch: mine 3 coal per action (enough for one smelting batch)
  addMineRuleWithInvariant(rules, {
    action: 'tp:mine:coal_ore',
    actionType: 'mine',
    produces: [{ name: 'coal', count: 3 }],
    consumes: [],
    requires: [{ name: `${CAP_PREFIX}has_wooden_pickaxe`, count: 1 }],
    needsTable: false,
    needsFurnace: false,
    baseCost: 5.0,
  });

  // Charcoal fallback: smelt logs (requires furnace + wood)
  addRuleIfNew(rules, {
    action: 'tp:smelt:charcoal',
    actionType: 'smelt',
    produces: [{ name: 'charcoal', count: 1 }],
    consumes: [{ name: 'oak_log', count: 1 }],
    requires: [{ name: `${CAP_PREFIX}has_furnace`, count: 1 }],
    needsTable: false,
    needsFurnace: true,
    baseCost: 3.0,
  });
}

/**
 * Add the upgrade rule that crafts the pickaxe at a given tier.
 * Produces both the tool item and the tier capability token.
 */
function addUpgradeRule(
  rules: ToolProgressionRule[],
  tier: ToolTier,
  toolType: ToolType,
  recipe: { material: string; materialCount: number; sticks: number }
): void {
  const toolName = `${tier}_${toolType}`;
  const capToken = `${CAP_PREFIX}has_${toolName}`;

  // Build produces: the tool item + capability token
  const produces: ToolProgressionItem[] = [
    { name: toolName, count: 1 },
    { name: capToken, count: 1 },
  ];

  // Add mining capabilities unlocked by this tier's pickaxe
  if (toolType === 'pickaxe') {
    const unlockedBlocks = TIER_GATE_MATRIX[tier];
    for (const block of unlockedBlocks) {
      produces.push({ name: `${CAP_PREFIX}can_mine_${block}`, count: 1 });
    }
  }

  addRuleIfNew(rules, {
    action: `tp:upgrade:${toolName}`,
    // Sterling only accepts 'craft'|'mine'|'smelt'|'place' — upgrade maps to 'craft'
    actionType: 'craft',
    produces,
    consumes: [
      { name: recipe.material, count: recipe.materialCount },
      { name: 'stick', count: recipe.sticks },
    ],
    requires: [{ name: `${CAP_PREFIX}has_crafting_table`, count: 1 }],
    needsTable: true,
    needsFurnace: false,
    baseCost: 2.0,
  });
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compile a mine rule with invariant-token preconditions.
 *
 * Sterling's _can_apply() skips the `requires` check for mine rules
 * (early return at line 273 of minecraft_domain.py). To enforce
 * preconditions on mine rules, we use the consume-and-reproduce pattern:
 * each required cap: token is added to both `consumes` and `produces`,
 * making it net-zero in the state but forcing the backend to check
 * the token exists via the `consumes` path (which IS enforced).
 *
 * The `requires` field is still populated for documentation, but
 * enforcement comes from the consume+reproduce invariant.
 */
function addMineRuleWithInvariant(
  rules: ToolProgressionRule[],
  rule: Omit<ToolProgressionRule, 'actionType'> & { actionType: 'mine' }
): void {
  const invariantConsumes = [...rule.consumes];
  const invariantProduces = [...rule.produces];

  // Compile requires into consume+reproduce pairs for mine rules
  for (const req of rule.requires) {
    invariantConsumes.push({ name: req.name, count: req.count });
    invariantProduces.push({ name: req.name, count: req.count });
  }

  addRuleIfNew(rules, {
    ...rule,
    consumes: invariantConsumes,
    produces: invariantProduces,
    // Keep requires for documentation — enforcement is via consume+reproduce
  });
}

/** Add a rule only if no rule with the same action ID exists */
function addRuleIfNew(rules: ToolProgressionRule[], rule: ToolProgressionRule): void {
  if (!rules.some(r => r.action === rule.action)) {
    rules.push(rule);
  }
}
