/**
 * Unit tests for stepToLeafExecution — Sterling step meta to leaf+args.
 * Verifies the transfer path from Sterling steps to executor-native leaf execution.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { stepToLeafExecution } from '../step-to-leaf-execution';

describe('stepToLeafExecution', () => {
  describe('null / missing meta', () => {
    it('returns null when meta is missing', () => {
      expect(stepToLeafExecution({})).toBeNull();
      expect(stepToLeafExecution({ meta: undefined })).toBeNull();
    });

    it('returns null when meta.leaf is missing', () => {
      expect(
        stepToLeafExecution({
          meta: { args: { recipe: 'oak_planks' } },
        })
      ).toBeNull();
    });
  });

  describe('explicit args (Option A)', () => {
    it('passes through meta.args when present and sets argsSource explicit', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'craft_recipe',
          args: { recipe: 'oak_planks', qty: 4 },
        },
      });
      expect(result).toEqual({
        leafName: 'craft_recipe',
        args: { recipe: 'oak_planks', qty: 4 },
        argsSource: 'explicit',
      });
    });

    it('craft_recipe with explicit args passes recipe verbatim', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'craft_recipe',
          args: { recipe: 'wooden_pickaxe' },
        },
      });
      expect(result?.args.recipe).toBe('wooden_pickaxe');
      expect(result?.argsSource).toBe('explicit');
    });

    it('smelt with explicit args passes input', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'smelt',
          args: { input: 'iron_ore' },
        },
      });
      expect(result).toEqual({
        leafName: 'smelt',
        args: { input: 'iron_ore' },
        argsSource: 'explicit',
      });
    });

    it('meta.args as array is not treated as explicit (plain-object gate)', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'craft_recipe',
          args: ['oak_planks', 4],
        } as Record<string, unknown>,
      });
      expect(result?.argsSource).toBe('derived');
      expect(result?.args.recipe).toBe('unknown');
    });

    it('meta.args as Object.create(null) is treated as explicit (null-proto allowed)', () => {
      const args = Object.create(null) as Record<string, unknown>;
      args.recipe = 'oak_planks';
      args.qty = 4;
      const result = stepToLeafExecution({
        meta: { leaf: 'craft_recipe', args },
      });
      expect(result?.argsSource).toBe('explicit');
      expect(result?.args.recipe).toBe('oak_planks');
      expect(result?.args.qty).toBe(4);
    });
  });

  describe('legacy produces/consumes derivation', () => {
    it('craft_recipe derives args from produces and sets argsSource derived', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'craft_recipe',
          produces: [{ name: 'oak_planks', count: 4 }],
        },
      });
      expect(result).toEqual({
        leafName: 'craft_recipe',
        args: { recipe: 'oak_planks', qty: 4 },
        argsSource: 'derived',
      });
    });

    it('craft_recipe falls back to unknown when produces empty', () => {
      const result = stepToLeafExecution({
        meta: { leaf: 'craft_recipe', produces: [] },
      });
      expect(result?.args.recipe).toBe('unknown');
      expect(result?.args.qty).toBe(1);
      expect(result?.argsSource).toBe('derived');
    });

    it('smelt derives args from consumes', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'smelt',
          consumes: [{ name: 'iron_ore', count: 1 }],
        },
      });
      expect(result).toEqual({
        leafName: 'smelt',
        args: { input: 'iron_ore' },
        argsSource: 'derived',
      });
    });

    it('dig_block remaps to acquire_material (derived) and sets originalLeaf', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'dig_block',
          produces: [{ name: 'oak_log', count: 1 }],
        },
      });
      expect(result).toEqual({
        leafName: 'acquire_material',
        args: { item: 'oak_log', count: 1 },
        argsSource: 'derived',
        originalLeaf: 'dig_block',
      });
    });

    it('acquire_material uses meta.item when present', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'acquire_material',
          item: 'stone',
          count: 8,
        },
      });
      expect(result).toEqual({
        leafName: 'acquire_material',
        args: { item: 'stone', count: 8 },
        argsSource: 'derived',
      });
    });

    it('place_workstation uses meta.workstation', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'place_workstation',
          workstation: 'furnace',
        },
      });
      expect(result).toEqual({
        leafName: 'place_workstation',
        args: { workstation: 'furnace' },
        argsSource: 'derived',
      });
    });

    it('place_block derives args from consumes', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'place_block',
          consumes: [{ name: 'crafting_table', count: 1 }],
        },
      });
      expect(result).toEqual({
        leafName: 'place_block',
        args: { item: 'crafting_table' },
        argsSource: 'derived',
      });
    });

    it('acquire_material uses meta.blockType when item absent', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'acquire_material',
          blockType: 'stone',
          count: 4,
        },
      });
      expect(result).toEqual({
        leafName: 'acquire_material',
        args: { item: 'stone', count: 4 },
        argsSource: 'derived',
      });
    });

    it('acquire_material derives from produces when item and blockType absent', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'acquire_material',
          produces: [{ name: 'iron_ingot', count: 2 }],
        },
      });
      expect(result).toEqual({
        leafName: 'acquire_material',
        args: { item: 'iron_ingot', count: 2 },
        argsSource: 'derived',
      });
    });
  });

  describe('building domain (prepare_site, build_module, place_feature, building_step)', () => {
    it('prepare_site forwards moduleId, item, count', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'prepare_site',
          moduleId: 'mod-1',
          item: 'stone',
          count: 10,
        },
      });
      expect(result).toEqual({
        leafName: 'prepare_site',
        args: {
          moduleId: 'mod-1',
          item: 'stone',
          count: 10,
        },
        argsSource: 'derived',
      });
    });

    it('build_module forwards moduleId', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'build_module',
          moduleId: 'wall-a1',
          moduleType: 'apply_module',
        },
      });
      expect(result).toEqual({
        leafName: 'build_module',
        args: {
          moduleId: 'wall-a1',
          item: undefined,
          count: undefined,
        },
        argsSource: 'derived',
      });
    });

    it('place_feature forwards moduleId and optional meta (no meta.args)', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'place_feature',
          moduleId: 'feat-1',
          item: 'torch',
          count: 4,
        },
      });
      expect(result?.leafName).toBe('place_feature');
      expect(result?.args.moduleId).toBe('feat-1');
      expect(result?.args.item).toBe('torch');
      expect(result?.args.count).toBe(4);
      expect(result?.argsSource).toBe('derived');
    });

    it('building_step passes through as generic building leaf', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'building_step',
          moduleId: 'scaffold-1',
        },
      });
      expect(result?.leafName).toBe('building_step');
      expect(result?.args.moduleId).toBe('scaffold-1');
      expect(result?.argsSource).toBe('derived');
    });
  });

  describe('sterling_navigate', () => {
    it('extracts target and tolerance from meta', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'sterling_navigate',
          target: { x: 10, y: 64, z: 20 },
          toleranceXZ: 2,
          toleranceY: 1,
        },
      });
      expect(result).toEqual({
        leafName: 'sterling_navigate',
        args: {
          target: { x: 10, y: 64, z: 20 },
          toleranceXZ: 2,
          toleranceY: 1,
        },
        argsSource: 'derived',
      });
    });

    it('falls back to meta.args when target in args (explicit)', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'sterling_navigate',
          args: { target: { x: 5, y: 70, z: 5 }, toleranceXZ: 1 },
        },
      });
      expect(result?.leafName).toBe('sterling_navigate');
      expect(result?.args.target).toEqual({ x: 5, y: 70, z: 5 });
      expect(result?.args.toleranceXZ).toBe(1);
      expect(result?.argsSource).toBe('explicit');
    });

    it('uses default tolerance when absent', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'sterling_navigate',
          target: { x: 0, y: 0, z: 0 },
        },
      });
      expect(result?.args.toleranceXZ).toBe(1);
      expect(result?.args.toleranceY).toBe(0);
      expect(result?.argsSource).toBe('derived');
    });
  });

  describe('unknown leaf (no explicit args)', () => {
    it('returns null for unhandled leaf when no meta.args', () => {
      expect(
        stepToLeafExecution({
          meta: { leaf: 'unknown_custom_leaf' },
        })
      ).toBeNull();
    });
  });

  describe('unknown leaf with explicit args', () => {
    it('passes through when meta.args present (Option A)', () => {
      const result = stepToLeafExecution({
        meta: {
          leaf: 'custom_leaf',
          args: { foo: 'bar' },
        },
      });
      expect(result).toEqual({
        leafName: 'custom_leaf',
        args: { foo: 'bar' },
        argsSource: 'explicit',
      });
    });
  });
});
