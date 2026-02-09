/**
 * Planner-to-action boundary conformance test (Phase 0, Commit 0c).
 *
 * Verifies that every action type the planner can emit (via mapBTActionToMinecraft
 * and mapTaskTypeToMinecraftAction) is in the set of types accepted by the
 * minecraft-interface /action endpoint's executeAction switch.
 *
 * This test does NOT instantiate ActionTranslator (which requires mineflayer).
 * Instead, it asserts against a canonical list of accepted types. If a new type
 * is added to executeAction, update ACCEPTED_ACTION_TYPES below.
 */

import { describe, it, expect } from 'vitest';
import {
  mapBTActionToMinecraft,
  mapTaskTypeToMinecraftAction,
} from '../modules/action-mapping';

/**
 * Canonical set of action types that executeAction accepts
 * (either via LeafFactory-first dispatch or hardcoded switch).
 *
 * Source of truth: packages/minecraft-interface/src/action-translator.ts
 * executeAction() switch statement + ACTION_TYPE_TO_LEAF map.
 *
 * If this set needs updating, it means the dispatch boundary changed.
 */
const ACCEPTED_ACTION_TYPES = new Set([
  // Navigation
  'navigate',
  'move_to',
  'move_forward',
  'move_backward',
  'strafe_left',
  'strafe_right',
  // Interaction
  'consume_food',
  'experiment_with_item',
  'explore_item_properties',
  'place_block',
  'find_shelter',
  'mine_block',
  'dig_block',
  // Crafting & smelting
  'craft',
  'craft_item',
  'smelt',
  'smelt_item',
  // Workstation placement (via LeafFactory)
  'place_workstation',
  // Torch placement (unconditional, via LeafFactory)
  'place_torch',
  // Block probe (sensing, via LeafFactory)
  'get_block_at',
  // Collection
  'pickup_item',
  'collect_items_enhanced',
  // Observation
  'look_at',
  'scan_environment',
  // Communication
  'chat',
  // Movement
  'turn_left',
  'turn_right',
  'jump',
  // Combat
  'attack_entity',
  // Utility
  'wait',
  'gather',
  'execute_behavior_tree',
  // Building (via LeafFactory)
  'prepare_site',
  'build_module',
  'place_feature',
]);

// ---------------------------------------------------------------------------
// Leaf spec names that mapBTActionToMinecraft handles explicitly
// ---------------------------------------------------------------------------
const BT_LEAF_SPEC_NAMES = [
  'scan_for_trees',
  'pathfind',
  'scan_tree_structure',
  'execute_bt',
  'dig_blocks',
  'dig_block',
  'collect_items',
  'clear_3x3_area',
  'place_blocks',
  'place_block',
  'move_to',
  'craft_recipe',
  'smelt',
  'place_door',
  'place_torch',
  'wait',
  'move_and_mine',
  'assess_safety',
];

/**
 * Known boundary gaps: these leaves map to action types that executeAction
 * does not handle. They are cognitive-reflection mappings, not solver outputs,
 * so they don't block Phase 0. Tracked for future cleanup.
 *
 * - 'move_and_gather' → 'gather_resources' (not in executeAction)
 * - 'explore_area' → 'move_random' (not in executeAction)
 */
const KNOWN_GAP_LEAVES = ['move_and_gather', 'explore_area'];

// ---------------------------------------------------------------------------
// Action types the planner can emit through various code paths
// ---------------------------------------------------------------------------
const PLANNER_EMITTED_TYPES = [
  // Rig A (crafting) — via mapBTActionToMinecraft('craft_recipe')
  'craft',
  // Rig B (tool progression) — crafting + smelting
  'craft',
  'smelt',
  // Rig G (building) — via LeafFactory dispatch
  'prepare_site',
  'build_module',
  'place_feature',
  'place_block',
  'place_workstation',
  'dig_block',
  // Core actions
  'move_to',
  'gather',
  'mine_block',
  'attack_entity',
  'wait',
  'chat',
  'scan_environment',
  'navigate',
  'collect_items_enhanced',
  'execute_behavior_tree',
];

describe('planner -> /action boundary conformance', () => {
  describe('every planner-emitted type is accepted', () => {
    const uniqueTypes = [...new Set(PLANNER_EMITTED_TYPES)];

    for (const type of uniqueTypes) {
      it(`action type "${type}" is in ACCEPTED_ACTION_TYPES`, () => {
        expect(ACCEPTED_ACTION_TYPES.has(type)).toBe(true);
      });
    }
  });

  describe('mapBTActionToMinecraft round-trip', () => {
    for (const leafName of BT_LEAF_SPEC_NAMES) {
      it(`leaf "${leafName}" maps to an accepted action type`, () => {
        const mapped = mapBTActionToMinecraft(leafName, {
          item: 'test',
          recipe: 'test',
          quantity: 1,
          position: { x: 0, y: 64, z: 0 },
          block: 'stone',
          bt_id: 'test',
          radius: 10,
          distance: 5,
          duration: 1000,
          resource: 'wood',
          checkRadius: 10,
        });
        expect(mapped).not.toBeNull();
        if (!mapped) return;
        expect(ACCEPTED_ACTION_TYPES.has(mapped.type)).toBe(true);
      });
    }
  });

  /**
   * Live Option A intake gate: no TS semantic translation.
   * Planning must dispatch craft_recipe with executor-native args (recipe).
   * No codepath may derive recipe from predicate_lemma / proposition metadata.
   */
  describe('no TS semantic translation for craft_recipe (Live Option A)', () => {
    it('craft_recipe passes args.recipe through to parameters.item verbatim', () => {
      const mapped = mapBTActionToMinecraft('craft_recipe', {
        recipe: 'oak_planks',
        qty: 1,
      });
      expect(mapped).not.toBeNull();
      if (!mapped) return;
      expect(mapped.type).toBe('craft');
      expect(mapped.parameters?.item).toBe('oak_planks');
    });

    it('craft_recipe uses args.recipe, NOT predicate_lemma or proposition', () => {
      const mapped = mapBTActionToMinecraft('craft_recipe', {
        recipe: 'wooden_pickaxe',
        predicate_lemma: 'craft_wooden_pickaxe',
        proposition: { type: 'craft', output: 'stick' },
      });
      expect(mapped).not.toBeNull();
      if (!mapped) return;
      expect(mapped.parameters?.item).toBe('wooden_pickaxe');
      expect(mapped.parameters?.predicate_lemma).toBeUndefined();
      expect(mapped.parameters?.proposition).toBeUndefined();
    });

    it('craft_recipe accepts args.item as fallback (alias) but prefers args.recipe', () => {
      const withRecipe = mapBTActionToMinecraft('craft_recipe', {
        recipe: 'oak_planks',
      });
      expect(withRecipe).not.toBeNull();
      if (!withRecipe) return;
      expect(withRecipe.parameters?.item).toBe('oak_planks');

      const withItem = mapBTActionToMinecraft('craft_recipe', {
        item: 'torch',
      });
      expect(withItem).not.toBeNull();
      if (!withItem) return;
      expect(withItem.parameters?.item).toBe('torch');
    });
  });

  describe('mapTaskTypeToMinecraftAction round-trip', () => {
    const taskTypes = [
      { type: 'social', title: 'Say hello', description: 'greet' },
      { type: 'gathering', title: 'Gather wood', description: 'get logs' },
      { type: 'gather', title: 'Gather stone', description: 'mine stone' },
      { type: 'crafting', title: 'Craft planks', description: 'make planks' },
      { type: 'mining', title: 'Mine iron', description: 'dig ore' },
      { type: 'exploration', title: 'Explore area', description: 'scout' },
      { type: 'explore', title: 'Explore biome', description: 'wander' },
      { type: 'placement', title: 'Place table', description: 'put block' },
      { type: 'building', title: 'Build wall', description: 'construct' },
      { type: 'movement', title: 'Move north', description: 'walk' },
      {
        type: 'general',
        title: 'Craft wooden pickaxe',
        description: 'need tool',
      },
      {
        type: 'general',
        title: 'Gather wood logs',
        description: 'collect trees',
      },
      {
        type: 'general',
        title: 'Explore the area',
        description: 'look around',
      },
    ];

    for (const task of taskTypes) {
      it(`task type "${task.type}" (${task.title}) maps to an accepted action type`, () => {
        const mapped = mapTaskTypeToMinecraftAction(task);
        if (mapped === null) {
          // null is acceptable (unknown task type)
          return;
        }
        expect(ACCEPTED_ACTION_TYPES.has(mapped.type)).toBe(true);
      });
    }
  });

  describe('known boundary gaps (cognitive-reflection leaves)', () => {
    for (const leafName of KNOWN_GAP_LEAVES) {
      it(`leaf "${leafName}" maps to a type NOT in ACCEPTED_ACTION_TYPES (known gap)`, () => {
        const mapped = mapBTActionToMinecraft(leafName, {
          resource: 'wood',
          quantity: 5,
          searchRadius: 20,
          radius: 25,
          duration: 15000,
        });
        expect(mapped).not.toBeNull();
        if (!mapped) return;
        // Explicitly assert these are NOT accepted — this test documents the gap.
        // When they are fixed, this test should be moved to the round-trip suite.
        expect(ACCEPTED_ACTION_TYPES.has(mapped.type)).toBe(false);
      });
    }
  });

  describe('default passthrough for unknown BT leaves', () => {
    it('unknown leaf name passes through verbatim', () => {
      const mapped = mapBTActionToMinecraft('unknown_custom_leaf', {
        foo: 'bar',
      });
      // Default returns { type: tool, parameters: args }
      // which means the raw leaf name becomes the action type.
      // This is fine as long as executors check for "Unknown action type".
      expect(mapped?.type).toBe('unknown_custom_leaf');
    });
  });

  describe('strict mode (fail-closed for executor)', () => {
    it('returns null for unmapped tool when strict is true', () => {
      const mapped = mapBTActionToMinecraft(
        'minecraft.unknown_custom_leaf',
        { foo: 'bar' },
        { strict: true }
      );
      expect(mapped).toBeNull();
    });

    it('returns mapped action for known tool when strict is true', () => {
      const mapped = mapBTActionToMinecraft(
        'minecraft.craft_recipe',
        { recipe: 'oak_planks', qty: 1 },
        { strict: true }
      );
      expect(mapped).not.toBeNull();
      expect(mapped!.type).toBe('craft');
      expect(mapped!.parameters?.item).toBe('oak_planks');
    });
  });
});
