/**
 * Tests for step Option A normalizer (single choke point for meta.args materialization).
 * Strict default: no materialization; allowMaterialize opt-in for legacy.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  materializeStepToOptionA,
  normalizeTaskStepsToOptionA,
  validateStepAgainstRegistry,
} from '../step-option-a-normalizer';

/** Step shape used by normalizer; meta may have args, leaf, produces, etc. */
type StepWithMeta = { id: string; meta?: Record<string, unknown> };
/** Task shape used by normalizer; metadata may have planningIncomplete, etc. */
type TaskWithMeta = {
  id: string;
  steps?: Array<{ id?: string; meta?: Record<string, unknown> }>;
  metadata?: Record<string, unknown>;
};

describe('materializeStepToOptionA', () => {
  it('returns true when step already has plain object meta.args (explicit Option A)', () => {
    const step: StepWithMeta = {
      id: 's1',
      meta: { leaf: 'craft_recipe', args: { recipe: 'oak_planks', qty: 4 } },
    };
    expect(materializeStepToOptionA(step)).toBe(true);
    expect(step.meta?.args).toEqual({ recipe: 'oak_planks', qty: 4 });
  });

  it('returns false and does not mutate step when step has only produces (derived) and default options', () => {
    const step: StepWithMeta = {
      id: 's1',
      meta: { leaf: 'craft_recipe', produces: [{ name: 'oak_planks', count: 4 }] },
    };
    const argsBefore = step.meta?.args;
    expect(materializeStepToOptionA(step)).toBe(false);
    expect(step.meta?.args).toBe(argsBefore);
    expect(step.meta?.args).toBeUndefined();
  });

  it('materializes and returns true when step has produces and allowMaterialize: true', () => {
    const step: StepWithMeta = {
      id: 's1',
      meta: { leaf: 'craft_recipe', produces: [{ name: 'oak_planks', count: 4 }] },
    };
    expect(materializeStepToOptionA(step, { allowMaterialize: true })).toBe(true);
    expect(step.meta?.args).toEqual({ recipe: 'oak_planks', qty: 4 });
  });

  it('when allowMaterialize true, preserves originalLeaf where applicable', () => {
    const step: StepWithMeta = {
      id: 's1',
      meta: { leaf: 'dig_block', produces: [{ name: 'oak_log', count: 1 }] },
    };
    expect(materializeStepToOptionA(step, { allowMaterialize: true })).toBe(true);
    expect(step.meta?.args).toEqual({ item: 'oak_log', count: 1 });
    expect(step.meta?.originalLeaf).toBe('dig_block');
  });

  it('returns false when step has no leaf', () => {
    const step: StepWithMeta = { id: 's1', meta: { args: { x: 1 } } };
    expect(materializeStepToOptionA(step)).toBe(false);
  });

  it('returns false when step has unknown leaf', () => {
    const step: StepWithMeta = { id: 's1', meta: { leaf: 'unknown_leaf_xyz' } };
    expect(materializeStepToOptionA(step)).toBe(false);
  });
});

describe('normalizeTaskStepsToOptionA', () => {
  it('sets planningIncomplete when a step cannot be materialized (strict default)', () => {
    const task: TaskWithMeta = {
      id: 't1',
      steps: [
        { id: 's1', meta: { leaf: 'craft_recipe', args: { recipe: 'x', qty: 1 } } },
        { id: 's2', meta: { leaf: 'unknown_leaf' } },
      ],
      metadata: {},
    };
    normalizeTaskStepsToOptionA(task);
    expect(task.metadata?.planningIncomplete).toBe(true);
    expect(Array.isArray(task.metadata?.planningIncompleteReasons)).toBe(true);
    const reasons = task.metadata?.planningIncompleteReasons as Array<{ leaf?: string; reason: string }>;
    expect(reasons.some((r) => r.reason === 'unknown_leaf')).toBe(true);
  });

  it('does not set planningIncomplete when all steps are explicit Option A', () => {
    const task: TaskWithMeta = {
      id: 't1',
      steps: [
        { id: 's1', meta: { leaf: 'craft_recipe', args: { recipe: 'oak_planks', qty: 4 } } },
      ],
      metadata: {},
    };
    normalizeTaskStepsToOptionA(task);
    expect(task.metadata?.planningIncomplete).toBeUndefined();
    expect(task.metadata?.planningIncompleteReasons).toBeUndefined();
  });

  it('with strict default, step with only produces leaves task planningIncomplete and does not write meta.args', () => {
    const task: TaskWithMeta = {
      id: 't1',
      steps: [
        { id: 's1', meta: { leaf: 'craft_recipe', produces: [{ name: 'oak_planks', count: 4 }] } },
      ],
      metadata: {},
    };
    normalizeTaskStepsToOptionA(task);
    expect(task.metadata?.planningIncomplete).toBe(true);
    expect(task.steps?.[0].meta?.args).toBeUndefined();
  });

  it('with allowMaterialize true, materializes steps and sets optionACompatUsed', () => {
    const task: TaskWithMeta = {
      id: 't1',
      steps: [
        { id: 's1', meta: { leaf: 'craft_recipe', produces: [{ name: 'oak_planks', count: 4 }] } },
      ],
      metadata: {},
    };
    normalizeTaskStepsToOptionA(task, { allowMaterialize: true });
    expect(task.metadata?.planningIncomplete).toBeUndefined();
    expect(task.metadata?.optionACompatUsed).toBe(true);
    expect(task.steps?.[0].meta?.args).toEqual({ recipe: 'oak_planks', qty: 4 });
  });

  it('clears planningIncomplete when all steps are already Option A', () => {
    const task: TaskWithMeta = {
      id: 't1',
      steps: [{ id: 's1', meta: { leaf: 'craft_recipe', args: { recipe: 'x', qty: 1 } } }],
      metadata: { planningIncomplete: true, planningIncompleteReasons: [{ reason: 'unknown_leaf' }] },
    };
    normalizeTaskStepsToOptionA(task);
    expect(task.metadata?.planningIncomplete).toBeUndefined();
    expect(task.metadata?.planningIncompleteReasons).toBeUndefined();
  });

  it('unknown leaf adds planningIncompleteReasons with leaf and reason unknown_leaf', () => {
    const task: TaskWithMeta = {
      id: 't1',
      steps: [{ id: 's1', meta: { leaf: 'unsupported_leaf_xyz' } }],
      metadata: {},
    };
    normalizeTaskStepsToOptionA(task);
    expect(task.metadata?.planningIncomplete).toBe(true);
    const reasons = task.metadata?.planningIncompleteReasons as Array<{ leaf?: string; reason: string }>;
    expect(reasons).toHaveLength(1);
    expect(reasons[0].leaf).toBe('unsupported_leaf_xyz');
    expect(reasons[0].reason).toBe('unknown_leaf');
  });

  it('intent leaf (task_type_craft) is classified as intent_leaf_not_executable, not unknown_leaf', () => {
    const task: TaskWithMeta = {
      id: 't1',
      steps: [
        { id: 's1', meta: { leaf: 'task_type_craft', args: { proposition_id: 'p1', task_type: 'CRAFT' } } },
      ],
      metadata: {},
    };
    normalizeTaskStepsToOptionA(task);
    expect(task.metadata?.planningIncomplete).toBe(true);
    const reasons = task.metadata?.planningIncompleteReasons as Array<{ leaf?: string; reason: string }>;
    expect(reasons).toHaveLength(1);
    expect(reasons[0].leaf).toBe('task_type_craft');
    expect(reasons[0].reason).toBe('intent_leaf_not_executable');
  });

  it('mixed executable and intent leaves: only intent leaves are incomplete', () => {
    const task: TaskWithMeta = {
      id: 't1',
      steps: [
        { id: 's1', meta: { leaf: 'craft_recipe', args: { recipe: 'oak_planks', qty: 4 } } },
        { id: 's2', meta: { leaf: 'task_type_mine', args: { proposition_id: 'p2' } } },
      ],
      metadata: {},
    };
    normalizeTaskStepsToOptionA(task);
    expect(task.metadata?.planningIncomplete).toBe(true);
    const reasons = task.metadata?.planningIncompleteReasons as Array<{ leaf?: string; reason: string }>;
    expect(reasons).toHaveLength(1);
    expect(reasons[0].leaf).toBe('task_type_mine');
    expect(reasons[0].reason).toBe('intent_leaf_not_executable');
  });
});

describe('validateStepAgainstRegistry', () => {
  it('returns valid for executable leaves in KNOWN_LEAVES', () => {
    expect(validateStepAgainstRegistry({ meta: { leaf: 'craft_recipe' } })).toEqual({ valid: true });
    expect(validateStepAgainstRegistry({ meta: { leaf: 'acquire_material' } })).toEqual({ valid: true });
    expect(validateStepAgainstRegistry({ meta: { leaf: 'smelt' } })).toEqual({ valid: true });
  });

  it('returns intent_leaf for task_type_* leaves', () => {
    const result = validateStepAgainstRegistry({ meta: { leaf: 'task_type_craft' } });
    expect(result).toEqual({ valid: false, reason: 'intent_leaf', leaf: 'task_type_craft' });
  });

  it('returns intent_leaf for all Sterling expand-by-digest leaves', () => {
    const intentLeaves = [
      'task_type_craft', 'task_type_mine', 'task_type_explore',
      'task_type_navigate', 'task_type_build', 'task_type_collect',
      'task_type_gather', 'task_type_attack', 'task_type_find', 'task_type_check',
    ];
    for (const leaf of intentLeaves) {
      const result = validateStepAgainstRegistry({ meta: { leaf } });
      expect(result).toEqual({ valid: false, reason: 'intent_leaf', leaf });
    }
  });

  it('returns unknown_leaf for unrecognized leaves', () => {
    const result = validateStepAgainstRegistry({ meta: { leaf: 'something_random' } });
    expect(result).toEqual({ valid: false, reason: 'unknown_leaf', leaf: 'something_random' });
  });

  it('returns missing_leaf when step has no leaf in meta', () => {
    expect(validateStepAgainstRegistry({ meta: {} })).toEqual({ valid: false, reason: 'missing_leaf' });
    expect(validateStepAgainstRegistry({})).toEqual({ valid: false, reason: 'missing_leaf' });
  });
});
