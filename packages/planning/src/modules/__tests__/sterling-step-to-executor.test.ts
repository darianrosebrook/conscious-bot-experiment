/**
 * Sterling step-to-executor pipeline tests.
 * Simulates the full executor path: Sterling step -> stepToLeafExecution ->
 * normalizeLeafArgs -> validateLeafArgs -> allowlist -> mapBTActionToMinecraft.
 * Ensures output is executor-ready (would be passed to toolExecutor.execute).
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { stepToLeafExecution } from '../step-to-leaf-execution';
import { mapBTActionToMinecraft } from '../action-mapping';
import { normalizeLeafArgs, validateLeafArgs } from '../leaf-arg-contracts';
import { buildLeafAllowlist } from '../../modular-server';

/** Leaves emitted by stepToLeafExecution for Sterling steps we test. Matches executor allowlist. */
const TEST_KNOWN_LEAVES = new Set([
  'craft_recipe',
  'acquire_material',
  'smelt',
  'place_block',
  'place_workstation',
  'prepare_site',
  'build_module',
  'place_feature',
  'building_step',
]);
const TASK_TYPE_BRIDGE_LEAVES = new Set<string>([]);
const leafAllowlist = buildLeafAllowlist(
  TEST_KNOWN_LEAVES,
  TASK_TYPE_BRIDGE_LEAVES,
  false
);

/** Simulates executor pipeline: step -> leaf -> normalize -> validate -> allowlist -> map. Returns null if any stage fails. */
function runExecutorPipeline(step: { meta?: Record<string, unknown> }): {
  leafName: string;
  args: Record<string, unknown>;
  btAction: NonNullable<ReturnType<typeof mapBTActionToMinecraft>>;
} | null {
  const leafExec = stepToLeafExecution(step);
  if (!leafExec) return null;

  const args = { ...leafExec.args };
  normalizeLeafArgs(leafExec.leafName, args);
  const validationError = validateLeafArgs(leafExec.leafName, args, true);
  if (validationError) return null;

  const toolName = `minecraft.${leafExec.leafName}`;
  if (!leafAllowlist.has(toolName)) return null;

  const btAction = mapBTActionToMinecraft(toolName, args);
  if (!btAction) return null;

  return {
    leafName: leafExec.leafName,
    args,
    btAction,
  };
}

describe('Sterling step-to-executor pipeline', () => {
  describe('full pipeline: step -> leaf -> validate -> allowlist -> mapBTActionToMinecraft', () => {
    it('craft_recipe with explicit args produces executor-ready output', () => {
      const step = {
        meta: {
          leaf: 'craft_recipe',
          args: { recipe: 'oak_planks', qty: 4 },
        },
      };
      const result = runExecutorPipeline(step);
      expect(result).not.toBeNull();
      expect(result!.leafName).toBe('craft_recipe');
      expect(result!.btAction.type).toBeDefined();
      expect(result!.btAction.parameters).toBeDefined();
      expect(result!.btAction.parameters?.item).toBe('oak_planks');
    });

    it('craft_recipe with legacy produces maps through pipeline', () => {
      const step = {
        meta: {
          leaf: 'craft_recipe',
          produces: [{ name: 'wooden_pickaxe', count: 1 }],
        },
      };
      const result = runExecutorPipeline(step);
      expect(result).not.toBeNull();
      expect(result!.leafName).toBe('craft_recipe');
      expect(result!.btAction.parameters?.item).toBe('wooden_pickaxe');
    });

    it('dig_block (remapped to acquire_material) produces executor-ready output', () => {
      const step = {
        meta: {
          leaf: 'dig_block',
          produces: [{ name: 'oak_log', count: 1 }],
        },
      };
      const result = runExecutorPipeline(step);
      expect(result).not.toBeNull();
      expect(result!.leafName).toBe('acquire_material');
      expect(result!.btAction.parameters).toBeDefined();
    });

    it('smelt with legacy consumes maps through pipeline', () => {
      const step = {
        meta: {
          leaf: 'smelt',
          consumes: [{ name: 'iron_ore', count: 1 }],
        },
      };
      const result = runExecutorPipeline(step);
      expect(result).not.toBeNull();
      expect(result!.leafName).toBe('smelt');
      expect(result!.args.input).toBe('iron_ore');
      expect(result!.btAction.parameters?.item).toBe('iron_ore');
    });

    it('place_block with legacy consumes maps through pipeline', () => {
      const step = {
        meta: {
          leaf: 'place_block',
          consumes: [{ name: 'crafting_table', count: 1 }],
        },
      };
      const result = runExecutorPipeline(step);
      expect(result).not.toBeNull();
      expect(result!.leafName).toBe('place_block');
      expect(result!.btAction.parameters).toBeDefined();
    });

    it('place_workstation maps through pipeline', () => {
      const step = {
        meta: {
          leaf: 'place_workstation',
          workstation: 'crafting_table',
        },
      };
      const result = runExecutorPipeline(step);
      expect(result).not.toBeNull();
      expect(result!.leafName).toBe('place_workstation');
      expect(result!.args.workstation).toBe('crafting_table');
      expect(result!.btAction.parameters).toBeDefined();
    });

    it('prepare_site with moduleId maps through pipeline', () => {
      const step = {
        meta: {
          leaf: 'prepare_site',
          moduleId: 'basic_shelter_5x5',
        },
      };
      const result = runExecutorPipeline(step);
      expect(result).not.toBeNull();
      expect(result!.leafName).toBe('prepare_site');
      expect(result!.args.moduleId).toBe('basic_shelter_5x5');
      expect(result!.btAction.parameters).toBeDefined();
    });

    it('build_module with moduleId maps through pipeline', () => {
      const step = {
        meta: {
          leaf: 'build_module',
          moduleId: 'basic_shelter_5x5',
        },
      };
      const result = runExecutorPipeline(step);
      expect(result).not.toBeNull();
      expect(result!.leafName).toBe('build_module');
      expect(result!.args.moduleId).toBe('basic_shelter_5x5');
      expect(result!.btAction.parameters).toBeDefined();
    });

    it('place_feature with moduleId maps through pipeline', () => {
      const step = {
        meta: {
          leaf: 'place_feature',
          moduleId: 'door_oak',
        },
      };
      const result = runExecutorPipeline(step);
      expect(result).not.toBeNull();
      expect(result!.leafName).toBe('place_feature');
      expect(result!.args.moduleId).toBe('door_oak');
      expect(result!.btAction.parameters).toBeDefined();
    });

    it('acquire_material with explicit args maps through pipeline', () => {
      const step = {
        meta: {
          leaf: 'acquire_material',
          args: { item: 'cobblestone', count: 8 },
        },
      };
      const result = runExecutorPipeline(step);
      expect(result).not.toBeNull();
      expect(result!.leafName).toBe('acquire_material');
      expect(result!.args.item).toBe('cobblestone');
      expect(result!.args.count).toBe(8);
      expect(result!.btAction.parameters).toBeDefined();
    });
  });

  describe('pipeline rejects invalid steps', () => {
    it('step without meta.leaf returns null from stepToLeafExecution', () => {
      const step = { meta: { args: { recipe: 'oak_planks' } } };
      const result = runExecutorPipeline(step);
      expect(result).toBeNull();
    });

    it('unknown leaf is rejected by validateLeafArgs in strict mode', () => {
      const step = {
        meta: {
          leaf: 'unknown_custom_leaf',
          args: { foo: 'bar' },
        },
      };
      const leafExec = stepToLeafExecution(step);
      expect(leafExec).not.toBeNull();
      const args = { ...leafExec!.args };
      normalizeLeafArgs(leafExec!.leafName, args);
      const err = validateLeafArgs(leafExec!.leafName, args, true);
      expect(err).not.toBeNull();
      expect(err).toContain('unknown leaf');
    });

    it('craft_recipe without recipe fails validation', () => {
      const step = {
        meta: {
          leaf: 'craft_recipe',
          args: { qty: 4 },
        },
      };
      const leafExec = stepToLeafExecution(step);
      expect(leafExec).not.toBeNull();
      const args = { ...leafExec!.args };
      normalizeLeafArgs(leafExec!.leafName, args);
      const err = validateLeafArgs(leafExec!.leafName, args, true);
      expect(err).not.toBeNull();
      expect(err).toContain('recipe');
    });

    it('allowlist built from restricted known set excludes unlisted leaves', () => {
      const restricted = new Set(['craft_recipe']);
      const restrictedAllowlist = buildLeafAllowlist(
        restricted,
        new Set(),
        false
      );
      expect(restrictedAllowlist.has('minecraft.craft_recipe')).toBe(true);
      expect(restrictedAllowlist.has('minecraft.acquire_material')).toBe(false);
    });
  });
});
