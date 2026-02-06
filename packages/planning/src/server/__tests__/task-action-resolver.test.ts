/**
 * Tests for task-action-resolver.ts
 *
 * Verifies the centralized parameter resolution logic that extracts
 * gateway-ready action args from tasks using multiple precedence sources:
 * 1. Legacy parameters (task.parameters.item, etc.)
 * 2. Requirement candidate (task.parameters.requirementCandidate.outputPattern)
 * 3. Step meta.args (task.steps[0].meta.args)
 * 4. Title inference (last resort heuristic)
 *
 * @see docs/testing/live-execution-evaluation-phase2.md
 */

import { describe, it, expect } from 'vitest';
import {
  resolveActionFromTask,
  isMappingFailure,
  isDeterministicFailure,
  createDeterministicFailure,
  type ResolveResult,
} from '../task-action-resolver';

describe('task-action-resolver', () => {
  describe('resolveActionFromTask — craft tasks', () => {
    it('resolves from legacy task.parameters.item', () => {
      const task = {
        id: 'task-1',
        title: 'Craft something',
        type: 'crafting',
        parameters: {
          item: 'wooden_pickaxe',
          quantity: 1,
        },
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.action.type).toBe('craft_item');
        expect(result.action.parameters.item).toBe('wooden_pickaxe');
        expect(result.action.parameters.quantity).toBe(1);
        expect(result.resolvedFrom).toBe('legacy');
      }
    });

    it('resolves from legacy task.parameters.recipe', () => {
      const task = {
        id: 'task-2',
        title: 'Craft sticks',
        type: 'craft',
        parameters: {
          recipe: 'stick',
          count: 4,
        },
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.action.type).toBe('craft_recipe');
        expect(result.action.parameters.recipe).toBe('stick');
        expect(result.action.parameters.count).toBe(4);
        expect(result.resolvedFrom).toBe('legacy');
      }
    });

    it('resolves from requirementCandidate.outputPattern', () => {
      const task = {
        id: 'task-3',
        title: 'Craft wooden_pickaxe',
        type: 'crafting',
        parameters: {
          requirementCandidate: {
            kind: 'craft',
            outputPattern: 'wooden_pickaxe',
            quantity: 1,
          },
        },
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.action.type).toBe('craft_recipe');
        expect(result.action.parameters.recipe).toBe('wooden_pickaxe');
        expect(result.action.parameters.count).toBe(1);
        expect(result.resolvedFrom).toBe('requirementCandidate');
      }
    });

    it('resolves from steps[0].meta.args.recipe', () => {
      const task = {
        id: 'task-4',
        title: 'Craft planks',
        type: 'crafting',
        parameters: {},
        steps: [
          {
            id: 'step-1',
            label: 'Craft oak_planks',
            done: false,
            order: 0,
            meta: {
              leaf: 'craft_recipe',
              args: {
                recipe: 'oak_planks',
                count: 4,
              },
            },
          },
        ],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.action.type).toBe('craft_recipe');
        expect(result.action.parameters.recipe).toBe('oak_planks');
        expect(result.action.parameters.count).toBe(4);
        expect(result.resolvedFrom).toBe('stepMetaArgs');
      }
    });

    it('resolves from title inference as last resort', () => {
      const task = {
        id: 'task-5',
        title: 'Craft wooden_sword',
        type: 'crafting',
        parameters: {},
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.action.type).toBe('craft_recipe');
        expect(result.action.parameters.recipe).toBe('wooden_sword');
        expect(result.resolvedFrom).toBe('inferred');
      }
    });

    it('fails with mapping_missing when no item found', () => {
      const task = {
        id: 'task-6',
        title: 'Do something',
        type: 'crafting',
        parameters: {},
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.category).toBe('mapping_missing');
        expect(result.failureCode).toBe('mapping_missing:craft:item');
        expect(result.retryable).toBe(false);
        expect(result.evidence.taskId).toBe('task-6');
      }
    });

    it('rejects placeholder value "item"', () => {
      const task = {
        id: 'task-7',
        title: 'Craft item',
        type: 'crafting',
        parameters: {
          item: 'item', // This is the bug we're preventing
        },
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      // Should NOT resolve from legacy because 'item' is a placeholder
      // Should try other sources and eventually fail or infer from title
      if (result.ok) {
        // If it resolves, it should NOT be from legacy with 'item'
        expect(result.action.parameters.item).not.toBe('item');
      }
    });
  });

  describe('resolveActionFromTask — mine tasks', () => {
    it('resolves from legacy task.parameters.block', () => {
      const task = {
        id: 'mine-1',
        title: 'Mine oak log',
        type: 'mining',
        parameters: {
          block: 'oak_log',
        },
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.action.type).toBe('dig_block');
        expect(result.action.parameters.block).toBe('oak_log');
        expect(result.resolvedFrom).toBe('legacy');
      }
    });

    it('resolves from requirementCandidate', () => {
      const task = {
        id: 'mine-2',
        title: 'Mine stone',
        type: 'mine',
        parameters: {
          requirementCandidate: {
            kind: 'mine',
            outputPattern: 'stone',
            quantity: 5,
          },
        },
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.action.type).toBe('dig_block');
        expect(result.action.parameters.block).toBe('stone');
        expect(result.resolvedFrom).toBe('requirementCandidate');
      }
    });

    it('fails with mapping_missing when no block found', () => {
      const task = {
        id: 'mine-3',
        title: 'Do something',
        type: 'mining',
        parameters: {},
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.category).toBe('mapping_missing');
        expect(result.failureCode).toBe('mapping_missing:mine:block');
      }
    });
  });

  describe('resolveActionFromTask — gather tasks', () => {
    it('resolves from legacy task.parameters.resource', () => {
      const task = {
        id: 'gather-1',
        title: 'Gather wood',
        type: 'gathering',
        parameters: {
          resource: 'oak_log',
          amount: 3,
        },
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.action.type).toBe('gather');
        expect(result.action.parameters.resource).toBe('oak_log');
        expect(result.action.parameters.amount).toBe(3);
        expect(result.resolvedFrom).toBe('legacy');
      }
    });

    it('fails with mapping_missing when no resource found', () => {
      const task = {
        id: 'gather-2',
        title: 'Do something',
        type: 'gather',
        parameters: {},
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failureCode).toBe('mapping_missing:gather:resource');
      }
    });
  });

  describe('resolveActionFromTask — explore tasks (permissive)', () => {
    it('always succeeds with default values', () => {
      const task = {
        id: 'explore-1',
        title: 'Explore around',
        type: 'exploration',
        parameters: {},
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.action.type).toBe('explore');
        expect(result.action.parameters.target).toBe('random');
        expect(result.action.parameters.radius).toBe(32);
      }
    });
  });

  describe('resolveActionFromTask — navigate tasks', () => {
    it('resolves from legacy task.parameters.target', () => {
      const task = {
        id: 'nav-1',
        title: 'Navigate to base',
        type: 'navigation',
        parameters: {
          target: { x: 100, y: 64, z: 200 },
        },
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.action.type).toBe('navigate');
        expect(result.action.parameters.target).toEqual({ x: 100, y: 64, z: 200 });
      }
    });

    it('fails with mapping_missing when no target found', () => {
      const task = {
        id: 'nav-2',
        title: 'Go somewhere',
        type: 'navigate',
        parameters: {},
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failureCode).toBe('mapping_missing:navigate:target');
      }
    });
  });

  describe('resolveActionFromTask — unknown task types', () => {
    it('fails with mapping_invalid for unknown type', () => {
      const task = {
        id: 'unknown-1',
        title: 'Do magic',
        type: 'teleport_magic',
        parameters: {},
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.category).toBe('mapping_invalid');
        expect(result.failureCode).toContain('mapping_invalid:unknown_type');
      }
    });

    it('rejects sterling_ir tasks explicitly', () => {
      const task = {
        id: 'sterling-ir-1',
        title: 'Sterling IR Task',
        type: 'sterling_ir',
        parameters: {},
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failureCode).toBe('mapping_invalid:sterling_ir');
      }
    });
  });

  describe('isMappingFailure helper', () => {
    it('returns true for mapping_missing', () => {
      const result: ResolveResult = {
        ok: false,
        category: 'mapping_missing',
        reason: 'No item found',
        evidence: { taskId: 't1', taskType: 'craft', taskTitle: 'Test', checked: {} },
        retryable: false,
        failureCode: 'mapping_missing:craft:item',
      };

      expect(isMappingFailure(result)).toBe(true);
    });

    it('returns true for mapping_invalid', () => {
      const result: ResolveResult = {
        ok: false,
        category: 'mapping_invalid',
        reason: 'Unknown type',
        evidence: { taskId: 't1', taskType: 'unknown', taskTitle: 'Test', checked: {} },
        retryable: false,
        failureCode: 'mapping_invalid:unknown_type:foo',
      };

      expect(isMappingFailure(result)).toBe(true);
    });

    it('returns false for success', () => {
      const result: ResolveResult = {
        ok: true,
        action: { type: 'craft_recipe', parameters: { recipe: 'stick', count: 4 } },
        resolvedFrom: 'legacy',
        evidence: { taskId: 't1', taskType: 'craft', taskTitle: 'Test', checked: {} },
      };

      expect(isMappingFailure(result)).toBe(false);
    });
  });

  describe('createDeterministicFailure helper', () => {
    it('creates failure response with retryable: false', () => {
      const err = {
        ok: false as const,
        category: 'mapping_missing' as const,
        reason: 'No item found',
        evidence: { taskId: 't1', taskType: 'craft', taskTitle: 'Test', checked: {} },
        retryable: false as const,
        failureCode: 'mapping_missing:craft:item',
      };

      const failure = createDeterministicFailure(err);

      expect(failure.success).toBe(false);
      expect(failure.shadow).toBe(false);
      expect(failure.retryable).toBe(false);
      expect(failure.failureCode).toBe('mapping_missing:craft:item');
      expect(failure.evidence).toBe(err.evidence);
    });
  });

  describe('resolution precedence', () => {
    it('legacy takes precedence over requirementCandidate', () => {
      const task = {
        id: 'prec-1',
        title: 'Craft something',
        type: 'crafting',
        parameters: {
          item: 'legacy_item',
          requirementCandidate: {
            outputPattern: 'candidate_item',
          },
        },
        steps: [],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.action.parameters.item).toBe('legacy_item');
        expect(result.resolvedFrom).toBe('legacy');
      }
    });

    it('requirementCandidate takes precedence over stepMetaArgs when legacy absent', () => {
      const task = {
        id: 'prec-2',
        title: 'Craft something',
        type: 'crafting',
        parameters: {
          requirementCandidate: {
            outputPattern: 'candidate_item',
            quantity: 2,
          },
        },
        steps: [
          {
            id: 'step-1',
            label: 'Craft',
            done: false,
            order: 0,
            meta: { args: { recipe: 'step_item' } },
          },
        ],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.action.parameters.recipe).toBe('candidate_item');
        expect(result.resolvedFrom).toBe('requirementCandidate');
      }
    });

    it('stepMetaArgs takes precedence over title inference when others absent', () => {
      const task = {
        id: 'prec-3',
        title: 'Craft iron_pickaxe',
        type: 'crafting',
        parameters: {},
        steps: [
          {
            id: 'step-1',
            label: 'Craft',
            done: false,
            order: 0,
            meta: { args: { recipe: 'step_item' } },
          },
        ],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.action.parameters.recipe).toBe('step_item');
        expect(result.resolvedFrom).toBe('stepMetaArgs');
      }
    });
  });

  describe('evidence object completeness', () => {
    it('includes all checked sources in evidence', () => {
      const task = {
        id: 'evidence-1',
        title: 'Craft wooden_pickaxe',
        type: 'crafting',
        parameters: {
          item: 'test_item',
          requirementCandidate: {
            kind: 'craft',
            outputPattern: 'test_output',
            quantity: 1,
          },
        },
        steps: [
          {
            id: 'step-1',
            label: 'Test',
            done: false,
            order: 0,
            meta: {
              leaf: 'craft_recipe',
              args: { recipe: 'step_recipe' },
            },
          },
        ],
      };

      const result = resolveActionFromTask(task as any);

      expect(result.evidence.taskId).toBe('evidence-1');
      expect(result.evidence.taskType).toBe('crafting');
      expect(result.evidence.taskTitle).toBe('Craft wooden_pickaxe');
      expect(result.evidence.checked.legacy_item).toBe('test_item');
      expect(result.evidence.checked.requirementCandidate_outputPattern).toBe('test_output');
      expect(result.evidence.checked.step0_args).toEqual({ recipe: 'step_recipe' });
    });
  });

  describe('isDeterministicFailure', () => {
    describe('mapping failures (always deterministic)', () => {
      it('returns true for mapping_missing', () => {
        expect(isDeterministicFailure('mapping_missing:craft:item')).toBe(true);
      });

      it('returns true for mapping_invalid', () => {
        expect(isDeterministicFailure('mapping_invalid:unknown_type:foo')).toBe(true);
      });

      it('returns true for mapping_ambiguous', () => {
        expect(isDeterministicFailure('mapping_ambiguous:multiple_sources')).toBe(true);
      });
    });

    describe('contract violations (always deterministic)', () => {
      it('returns true for contract_missing_keys', () => {
        expect(isDeterministicFailure('contract_missing_keys')).toBe(true);
      });

      it('returns true for contract_invalid_shape', () => {
        expect(isDeterministicFailure('contract_invalid_shape')).toBe(true);
      });
    });

    describe('postcondition failures (deterministic by policy)', () => {
      it('returns true for postcondition_failed', () => {
        expect(isDeterministicFailure('postcondition_failed:equip_tool')).toBe(true);
      });
    });

    describe('terminal error codes from leaf-contracts', () => {
      it('returns true for invalid_input', () => {
        expect(isDeterministicFailure('invalid_input')).toBe(true);
      });

      it('returns true for unknown_recipe', () => {
        expect(isDeterministicFailure('unknown_recipe')).toBe(true);
      });

      it('returns true for craft.missing_ingredient (suffixed)', () => {
        expect(isDeterministicFailure('craft.missing_ingredient')).toBe(true);
      });

      it('returns true for inventory_full', () => {
        expect(isDeterministicFailure('inventory_full')).toBe(true);
      });
    });

    describe('retryable failures (NOT deterministic)', () => {
      it('returns false for timeout', () => {
        expect(isDeterministicFailure('timeout')).toBe(false);
      });

      it('returns false for acquire.noneCollected', () => {
        expect(isDeterministicFailure('acquire.noneCollected')).toBe(false);
      });

      it('returns false for navigate.unreachable', () => {
        expect(isDeterministicFailure('navigate.unreachable')).toBe(false);
      });

      it('returns false for stuck', () => {
        expect(isDeterministicFailure('stuck')).toBe(false);
      });

      it('returns false for busy', () => {
        expect(isDeterministicFailure('busy')).toBe(false);
      });

      it('returns false for undefined', () => {
        expect(isDeterministicFailure(undefined)).toBe(false);
      });

      it('returns false for empty string', () => {
        expect(isDeterministicFailure('')).toBe(false);
      });
    });
  });
});
