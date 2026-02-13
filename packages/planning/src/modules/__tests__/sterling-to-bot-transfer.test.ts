/**
 * Sterling-to-bot transfer path tests.
 * Chains stepToLeafExecution -> mapBTActionToMinecraft to verify the full path.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { stepToLeafExecution } from '../step-to-leaf-execution';
import { mapBTActionToMinecraft } from '../action-mapping';

const ACCEPTED_ACTION_TYPES = new Set([
  'craft',
  'craft_recipe',
  'smelt',
  'smelt_item',
  'dig_block',
  'place_block',
  'move_to',
  'collect_items',
  'collect_items_enhanced',
  'acquire_material',
  'scan_environment',
  'execute_behavior_tree',
  'place_workstation',
  'prepare_site',
  'build_module',
  'place_feature',
  'mine_block',
  'gather',
  'navigate',
  'wait',
]);

describe('Sterling-to-bot transfer path', () => {
  describe('stepToLeafExecution -> mapBTActionToMinecraft chain', () => {
    it('craft_recipe with explicit args maps to accepted action', () => {
      const step = {
        meta: {
          leaf: 'craft_recipe',
          args: { recipe: 'oak_planks', qty: 4 },
        },
      };
      const leafExec = stepToLeafExecution(step);
      expect(leafExec).not.toBeNull();

      const mapped = mapBTActionToMinecraft(
        `minecraft.${leafExec!.leafName}`,
        leafExec!.args
      );
      expect(mapped).not.toBeNull();
      expect(ACCEPTED_ACTION_TYPES.has(mapped!.type)).toBe(true);
      // craft_recipe passes through as itself — canonical param is 'recipe', not 'item'
      expect(mapped!.parameters?.recipe).toBe('oak_planks');
    });

    it('craft_recipe with legacy produces maps to accepted action', () => {
      const step = {
        meta: {
          leaf: 'craft_recipe',
          produces: [{ name: 'wooden_pickaxe', count: 1 }],
        },
      };
      const leafExec = stepToLeafExecution(step);
      expect(leafExec).not.toBeNull();

      const mapped = mapBTActionToMinecraft(
        `minecraft.${leafExec!.leafName}`,
        leafExec!.args
      );
      expect(mapped).not.toBeNull();
      expect(ACCEPTED_ACTION_TYPES.has(mapped!.type)).toBe(true);
      // craft_recipe passes through — recipe derived from produces[0].name
      expect(mapped!.parameters?.recipe).toBe('wooden_pickaxe');
    });

    it('minecraft. prefixed tool name produces same result as bare name', () => {
      const args = { recipe: 'oak_planks', qty: 1 };
      const bare = mapBTActionToMinecraft('craft_recipe', args);
      const prefixed = mapBTActionToMinecraft('minecraft.craft_recipe', args);
      expect(bare).toEqual(prefixed);
    });

    it('acquire_material (dig_block remap) produces valid mapped action', () => {
      const step = {
        meta: {
          leaf: 'dig_block',
          produces: [{ name: 'oak_log', count: 1 }],
        },
      };
      const leafExec = stepToLeafExecution(step);
      expect(leafExec?.leafName).toBe('acquire_material');

      const mapped = mapBTActionToMinecraft(
        `minecraft.${leafExec!.leafName}`,
        leafExec!.args
      );
      expect(mapped).not.toBeNull();
      expect(mapped!.type).toBeDefined();
      expect(mapped!.parameters).toBeDefined();
    });

    it('smelt with legacy consumes maps to accepted action', () => {
      const step = {
        meta: {
          leaf: 'smelt',
          consumes: [{ name: 'iron_ore', count: 1 }],
        },
      };
      const leafExec = stepToLeafExecution(step);
      expect(leafExec).not.toBeNull();
      expect(leafExec!.args.input).toBe('iron_ore');

      const mapped = mapBTActionToMinecraft(
        `minecraft.${leafExec!.leafName}`,
        leafExec!.args
      );
      expect(mapped).not.toBeNull();
      expect(ACCEPTED_ACTION_TYPES.has(mapped!.type)).toBe(true);
      expect(mapped!.parameters?.item).toBe('iron_ore');
    });

    it('place_block with legacy consumes maps to accepted action', () => {
      const step = {
        meta: {
          leaf: 'place_block',
          consumes: [{ name: 'crafting_table', count: 1 }],
        },
      };
      const leafExec = stepToLeafExecution(step);
      expect(leafExec).not.toBeNull();

      const mapped = mapBTActionToMinecraft(
        `minecraft.${leafExec!.leafName}`,
        leafExec!.args
      );
      expect(mapped).not.toBeNull();
      expect(ACCEPTED_ACTION_TYPES.has(mapped!.type)).toBe(true);
      expect(mapped!.parameters?.block_type).toBe('crafting_table');
    });

    it('place_workstation maps to accepted action', () => {
      const step = {
        meta: {
          leaf: 'place_workstation',
          workstation: 'furnace',
        },
      };
      const leafExec = stepToLeafExecution(step);
      expect(leafExec).not.toBeNull();

      const mapped = mapBTActionToMinecraft(
        `minecraft.${leafExec!.leafName}`,
        leafExec!.args
      );
      expect(mapped).not.toBeNull();
      expect(ACCEPTED_ACTION_TYPES.has(mapped!.type)).toBe(true);
      expect(mapped!.parameters?.workstation).toBe('furnace');
    });

    it('acquire_material direct (meta.item) produces valid mapped action', () => {
      const step = {
        meta: {
          leaf: 'acquire_material',
          item: 'stone',
          count: 8,
        },
      };
      const leafExec = stepToLeafExecution(step);
      expect(leafExec?.leafName).toBe('acquire_material');

      const mapped = mapBTActionToMinecraft(
        `minecraft.${leafExec!.leafName}`,
        leafExec!.args
      );
      expect(mapped).not.toBeNull();
      expect(mapped!.parameters?.item).toBe('stone');
    });

    it('prepare_site passes through and produces valid action shape', () => {
      const step = {
        meta: {
          leaf: 'prepare_site',
          moduleId: 'mod-1',
          item: 'stone',
          count: 10,
        },
      };
      const leafExec = stepToLeafExecution(step);
      expect(leafExec).not.toBeNull();

      const mapped = mapBTActionToMinecraft(
        `minecraft.${leafExec!.leafName}`,
        leafExec!.args
      );
      expect(mapped).not.toBeNull();
      expect(ACCEPTED_ACTION_TYPES.has(mapped!.type)).toBe(true);
      expect(mapped!.parameters?.moduleId).toBe('mod-1');
    });

    it('build_module passes through and produces valid action shape', () => {
      const step = {
        meta: {
          leaf: 'build_module',
          moduleId: 'wall-a1',
          moduleType: 'apply_module',
        },
      };
      const leafExec = stepToLeafExecution(step);
      expect(leafExec).not.toBeNull();

      const mapped = mapBTActionToMinecraft(
        `minecraft.${leafExec!.leafName}`,
        leafExec!.args
      );
      expect(mapped).not.toBeNull();
      expect(ACCEPTED_ACTION_TYPES.has(mapped!.type)).toBe(true);
    });

    it('place_feature passes through and produces valid action shape', () => {
      const step = {
        meta: {
          leaf: 'place_feature',
          moduleId: 'feat-1',
          item: 'torch',
          count: 4,
        },
      };
      const leafExec = stepToLeafExecution(step);
      expect(leafExec).not.toBeNull();

      const mapped = mapBTActionToMinecraft(
        `minecraft.${leafExec!.leafName}`,
        leafExec!.args
      );
      expect(mapped).not.toBeNull();
      expect(ACCEPTED_ACTION_TYPES.has(mapped!.type)).toBe(true);
      expect(mapped!.parameters?.moduleId).toBe('feat-1');
    });

    it('sterling_navigate passes through with target and tolerances', () => {
      const step = {
        meta: {
          leaf: 'sterling_navigate',
          target: { x: 10, y: 64, z: 20 },
          toleranceXZ: 2,
          toleranceY: 1,
        },
      };
      const leafExec = stepToLeafExecution(step);
      expect(leafExec).not.toBeNull();

      const mapped = mapBTActionToMinecraft(
        `minecraft.${leafExec!.leafName}`,
        leafExec!.args
      );
      expect(mapped).not.toBeNull();
      expect(mapped!.type).toBe('sterling_navigate');
      expect(mapped!.parameters?.target).toEqual({ x: 10, y: 64, z: 20 });
      expect(mapped!.parameters?.toleranceXZ).toBe(2);
      expect(mapped!.parameters?.toleranceY).toBe(1);
    });
  });
});
