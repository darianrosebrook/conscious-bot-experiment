/**
 * Sterling step dispatch-to-toolExecutor tests.
 * Mocks toolExecutor.execute and asserts the Sterling step path calls it with
 * the correct (toolName, args) for a given Sterling step.
 *
 * Proves: Sterling step -> pipeline -> toolExecutor.execute(toolName, args)
 * receives the right tool name and args that would invoke the correct action.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stepToLeafExecution } from '../step-to-leaf-execution';
import { normalizeLeafArgs, validateLeafArgs } from '../leaf-arg-contracts';
import { buildLeafAllowlist } from '../../modular-server';

/** Leaves emitted by stepToLeafExecution for Sterling steps we test. */
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
const leafAllowlist = buildLeafAllowlist(TEST_KNOWN_LEAVES, new Set(), false);

/** Simulates executor pipeline up to toolExecutor.execute call. Returns null if blocked. */
function runPipelineToDispatch(step: {
  meta?: Record<string, unknown>;
}): { toolName: string; args: Record<string, unknown> } | null {
  const leafExec = stepToLeafExecution(step);
  if (!leafExec) return null;

  const args = { ...leafExec.args };
  normalizeLeafArgs(leafExec.leafName, args);
  const validationError = validateLeafArgs(leafExec.leafName, args, true);
  if (validationError) return null;

  const toolName = `minecraft.${leafExec.leafName}`;
  if (!leafAllowlist.has(toolName)) return null;

  return { toolName, args };
}

/**
 * Simulates what the executor does: run pipeline, then call toolExecutor.execute.
 * Returns the mock so tests can assert on calls.
 */
function dispatchSterlingStepToTool(
  step: { meta?: Record<string, unknown> },
  mockExecute: ReturnType<typeof vi.fn>
): boolean {
  const payload = runPipelineToDispatch(step);
  if (!payload) return false;

  mockExecute(payload.toolName, payload.args);
  return true;
}

describe('Sterling step dispatch to toolExecutor', () => {
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockExecute = vi.fn().mockResolvedValue({ ok: true });
  });

  describe('mock toolExecutor.execute receives correct (toolName, args)', () => {
    it('craft_recipe with explicit args dispatches minecraft.craft_recipe with recipe and qty', () => {
      const step = {
        meta: {
          leaf: 'craft_recipe',
          args: { recipe: 'oak_planks', qty: 4 },
        },
      };

      const dispatched = dispatchSterlingStepToTool(step, mockExecute);
      expect(dispatched).toBe(true);
      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(mockExecute).toHaveBeenCalledWith(
        'minecraft.craft_recipe',
        expect.objectContaining({ recipe: 'oak_planks', qty: 4 })
      );
    });

    it('craft_recipe with legacy produces dispatches minecraft.craft_recipe with derived args', () => {
      const step = {
        meta: {
          leaf: 'craft_recipe',
          produces: [{ name: 'wooden_pickaxe', count: 1 }],
        },
      };

      const dispatched = dispatchSterlingStepToTool(step, mockExecute);
      expect(dispatched).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        'minecraft.craft_recipe',
        expect.objectContaining({ recipe: 'wooden_pickaxe', qty: 1 })
      );
    });

    it('dig_block dispatches minecraft.acquire_material (remapped leaf)', () => {
      const step = {
        meta: {
          leaf: 'dig_block',
          produces: [{ name: 'oak_log', count: 1 }],
        },
      };

      const dispatched = dispatchSterlingStepToTool(step, mockExecute);
      expect(dispatched).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        'minecraft.acquire_material',
        expect.objectContaining({ item: 'oak_log', count: 1 })
      );
    });

    it('smelt with legacy consumes dispatches minecraft.smelt with input', () => {
      const step = {
        meta: {
          leaf: 'smelt',
          consumes: [{ name: 'iron_ore', count: 1 }],
        },
      };

      const dispatched = dispatchSterlingStepToTool(step, mockExecute);
      expect(dispatched).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        'minecraft.smelt',
        expect.objectContaining({ input: 'iron_ore' })
      );
    });

    it('place_block dispatches minecraft.place_block with item', () => {
      const step = {
        meta: {
          leaf: 'place_block',
          consumes: [{ name: 'crafting_table', count: 1 }],
        },
      };

      const dispatched = dispatchSterlingStepToTool(step, mockExecute);
      expect(dispatched).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        'minecraft.place_block',
        expect.objectContaining({ item: 'crafting_table' })
      );
    });

    it('place_workstation dispatches minecraft.place_workstation with workstation', () => {
      const step = {
        meta: {
          leaf: 'place_workstation',
          workstation: 'crafting_table',
        },
      };

      const dispatched = dispatchSterlingStepToTool(step, mockExecute);
      expect(dispatched).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        'minecraft.place_workstation',
        expect.objectContaining({ workstation: 'crafting_table' })
      );
    });

    it('acquire_material with explicit args dispatches minecraft.acquire_material', () => {
      const step = {
        meta: {
          leaf: 'acquire_material',
          args: { item: 'cobblestone', count: 8 },
        },
      };

      const dispatched = dispatchSterlingStepToTool(step, mockExecute);
      expect(dispatched).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        'minecraft.acquire_material',
        expect.objectContaining({ item: 'cobblestone', count: 8 })
      );
    });

    it('build_module dispatches minecraft.build_module with moduleId', () => {
      const step = {
        meta: {
          leaf: 'build_module',
          moduleId: 'basic_shelter_5x5',
        },
      };

      const dispatched = dispatchSterlingStepToTool(step, mockExecute);
      expect(dispatched).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        'minecraft.build_module',
        expect.objectContaining({ moduleId: 'basic_shelter_5x5' })
      );
    });
  });

  describe('blocked steps do not call toolExecutor', () => {
    it('step without meta.leaf does not dispatch', () => {
      const step = { meta: { args: { recipe: 'oak_planks' } } };

      const dispatched = dispatchSterlingStepToTool(step, mockExecute);
      expect(dispatched).toBe(false);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('craft_recipe without recipe fails validation and does not dispatch', () => {
      const step = {
        meta: {
          leaf: 'craft_recipe',
          args: { qty: 4 },
        },
      };

      const dispatched = dispatchSterlingStepToTool(step, mockExecute);
      expect(dispatched).toBe(false);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('unknown leaf fails allowlist/validation and does not dispatch', () => {
      const step = {
        meta: {
          leaf: 'unknown_custom_leaf',
          args: { foo: 'bar' },
        },
      };

      const dispatched = dispatchSterlingStepToTool(step, mockExecute);
      expect(dispatched).toBe(false);
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('toolExecutor receives exact args the executor would pass', () => {
    it('args are the normalized leafExec.args, not raw step.meta.args', () => {
      const step = {
        meta: {
          leaf: 'smelt',
          consumes: [{ name: 'iron_ore', count: 1 }],
        },
      };

      dispatchSterlingStepToTool(step, mockExecute);

      const [toolName, args] = mockExecute.mock.calls[0];
      expect(toolName).toBe('minecraft.smelt');
      expect(args).toEqual({ input: 'iron_ore' });
      expect(args.consumes).toBeUndefined();
    });

    it('toolName always has minecraft. prefix', () => {
      const step = {
        meta: {
          leaf: 'craft_recipe',
          args: { recipe: 'torch', qty: 4 },
        },
      };

      dispatchSterlingStepToTool(step, mockExecute);

      const [toolName] = mockExecute.mock.calls[0];
      expect(toolName).toMatch(/^minecraft\./);
      expect(toolName).toBe('minecraft.craft_recipe');
    });
  });
});
