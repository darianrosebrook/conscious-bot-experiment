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
} from '../step-option-a-normalizer';

describe('materializeStepToOptionA', () => {
  it('returns true when step already has plain object meta.args (explicit Option A)', () => {
    const step = {
      id: 's1',
      meta: { leaf: 'craft_recipe', args: { recipe: 'oak_planks', qty: 4 } },
    };
    expect(materializeStepToOptionA(step)).toBe(true);
    expect(step.meta?.args).toEqual({ recipe: 'oak_planks', qty: 4 });
  });

  it('returns false and does not mutate step when step has only produces (derived) and default options', () => {
    const step = {
      id: 's1',
      meta: { leaf: 'craft_recipe', produces: [{ name: 'oak_planks', count: 4 }] },
    };
    const argsBefore = step.meta?.args;
    expect(materializeStepToOptionA(step)).toBe(false);
    expect(step.meta?.args).toBe(argsBefore);
    expect(step.meta?.args).toBeUndefined();
  });

  it('materializes and returns true when step has produces and allowMaterialize: true', () => {
    const step = {
      id: 's1',
      meta: { leaf: 'craft_recipe', produces: [{ name: 'oak_planks', count: 4 }] },
    };
    expect(materializeStepToOptionA(step, { allowMaterialize: true })).toBe(true);
    expect(step.meta?.args).toEqual({ recipe: 'oak_planks', qty: 4 });
  });

  it('when allowMaterialize true, preserves originalLeaf where applicable', () => {
    const step = {
      id: 's1',
      meta: { leaf: 'dig_block', produces: [{ name: 'oak_log', count: 1 }] },
    };
    expect(materializeStepToOptionA(step, { allowMaterialize: true })).toBe(true);
    expect(step.meta?.args).toEqual({ item: 'oak_log', count: 1 });
    expect((step.meta as Record<string, unknown>).originalLeaf).toBe('dig_block');
  });

  it('returns false when step has no leaf', () => {
    const step = { id: 's1', meta: { args: { x: 1 } } };
    expect(materializeStepToOptionA(step)).toBe(false);
  });

  it('returns false when step has unknown leaf', () => {
    const step = { id: 's1', meta: { leaf: 'unknown_leaf_xyz' } };
    expect(materializeStepToOptionA(step)).toBe(false);
  });
});

describe('normalizeTaskStepsToOptionA', () => {
  it('sets planningIncomplete when a step cannot be materialized (strict default)', () => {
    const task = {
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
    const task = {
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
    const task = {
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
    const task = {
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
    const task = {
      id: 't1',
      steps: [{ id: 's1', meta: { leaf: 'craft_recipe', args: { recipe: 'x', qty: 1 } } }],
      metadata: { planningIncomplete: true, planningIncompleteReasons: [{ reason: 'unknown_leaf' }] },
    };
    normalizeTaskStepsToOptionA(task);
    expect(task.metadata?.planningIncomplete).toBeUndefined();
    expect(task.metadata?.planningIncompleteReasons).toBeUndefined();
  });

  it('unknown leaf adds planningIncompleteReasons with leaf and reason unknown_leaf', () => {
    const task = {
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
});
