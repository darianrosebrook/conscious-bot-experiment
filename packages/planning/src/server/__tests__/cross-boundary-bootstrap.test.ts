/**
 * Cross-boundary integration test: Sterling IR → expand → action map → command payload.
 *
 * Validates that the full bootstrap autonomy pipeline produces valid command
 * payloads at each boundary, catching contract drift between:
 * - Sterling's expand_by_digest_v1 (produces steps with leaf + args)
 * - Planning's action mapper (translates leaf to minecraft action)
 * - MC interface's navigation handler (expects pos or exploration_target)
 *
 * Anchored to the shared contract fixture (bootstrap-lowering-v1.json) which
 * is also validated by Sterling's Python test suite. Changes to either side
 * that break the contract will fail one of these tests.
 *
 * Hermetic: no live services. Stubs bot position, seeds RNG.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { mapBTActionToMinecraft } from '../../modules/action-mapping';
import {
  BLOCKED_REASON_REGISTRY,
  TRANSIENT_EXPANSION_REASONS,
  CONTRACT_BROKEN_REASONS,
} from '../../task-lifecycle/task-block-evaluator';

// ============================================================================
// Load shared contract fixture
// ============================================================================

const FIXTURE_PATH = join(__dirname, 'fixtures', 'bootstrap-lowering-v1.json');
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
const SCHEMA_VERSION = FIXTURE.schema_version;

// ============================================================================
// Sterling expansion fixtures (mirrors expand_by_digest_v1.py output)
// ============================================================================
// These represent the exact step shapes Sterling produces for bootstrap lemmas.
// If Sterling's materializer changes, these must be updated — and that's the point.

const STERLING_EXPLORE_STEP = FIXTURE.cases.explore_surroundings.steps[0];

const STERLING_NAVIGATE_SAFETY_STEP = FIXTURE.cases.navigate_safety.steps[0];

const STERLING_NAVIGATE_UNKNOWN_STEP = {
  leaf: 'move_to',
  args: {
    target: 'somewhere',
    distance: 10,
    lowered_from: 'navigate',
    theme: 'somewhere',
  },
};

const STERLING_GATHER_FOOD_STEPS = FIXTURE.cases.gather_food.steps;

const STERLING_GATHER_WOOD_STEP = {
  leaf: 'collect_items',
  args: {
    itemName: 'wood',
    lowered_from: 'gather',
    theme: 'wood',
  },
};

// ============================================================================
// Tests
// ============================================================================

describe('cross-boundary bootstrap autonomy contract', () => {
  describe('contract fixture integrity', () => {
    it('fixture has expected schema version', () => {
      expect(SCHEMA_VERSION).toBe('bootstrap_lowering_v1');
    });

    it('fixture declares required step and args keys', () => {
      expect(FIXTURE.required_step_keys).toContain('leaf');
      expect(FIXTURE.required_step_keys).toContain('args');
      expect(FIXTURE.required_args_keys).toContain('lowered_from');
      expect(FIXTURE.required_args_keys).toContain('theme');
    });

    it('all fixture steps have required keys', () => {
      for (const [caseName, caseData] of Object.entries(FIXTURE.cases) as [string, any][]) {
        for (const step of caseData.steps) {
          for (const key of FIXTURE.required_step_keys) {
            expect(step).toHaveProperty(key);
          }
          for (const key of FIXTURE.required_args_keys) {
            expect(step.args, `${caseName}/${step.leaf} missing args.${key}`).toHaveProperty(key);
          }
        }
      }
    });
  });

  describe('explore → move_to action mapping', () => {
    it('maps Sterling explore step to a valid move_to action', () => {
      const action = mapBTActionToMinecraft(
        STERLING_EXPLORE_STEP.leaf,
        STERLING_EXPLORE_STEP.args,
      );
      expect(action).not.toBeNull();
      expect(action!.type).toBe('move_to');
      expect(action!.parameters).toHaveProperty('target');
      expect(action!.parameters).toHaveProperty('distance');
      expect(action!.parameters.distance).toBe(10);
    });

    it('move_to action has exploration_target which MC interface resolves to coordinates', () => {
      const action = mapBTActionToMinecraft(
        STERLING_EXPLORE_STEP.leaf,
        STERLING_EXPLORE_STEP.args,
      );
      // MC interface coerceVec3 will fail on string target → triggers exploration fallback.
      // The fallback needs: (1) target is a string, (2) distance is a positive number.
      expect(typeof action!.parameters.target).toBe('string');
      expect(action!.parameters.distance).toBeGreaterThan(0);
    });
  });

  describe('navigate (safety) → step_forward_safely action mapping', () => {
    it('maps Sterling navigate-safety step to a valid move_forward action', () => {
      const action = mapBTActionToMinecraft(
        STERLING_NAVIGATE_SAFETY_STEP.leaf,
        STERLING_NAVIGATE_SAFETY_STEP.args,
      );
      expect(action).not.toBeNull();
      // step_forward_safely maps to move_forward in the MC interface
      expect(action!.type).toBe('move_forward');
      expect(action!.parameters).toHaveProperty('distance');
      expect(action!.parameters.distance).toBe(8);
    });
  });

  describe('navigate (unknown theme) → move_to action mapping', () => {
    it('maps Sterling navigate-unknown step to move_to with target', () => {
      const action = mapBTActionToMinecraft(
        STERLING_NAVIGATE_UNKNOWN_STEP.leaf,
        STERLING_NAVIGATE_UNKNOWN_STEP.args,
      );
      expect(action).not.toBeNull();
      expect(action!.type).toBe('move_to');
      expect(action!.parameters.target).toBe('somewhere');
      expect(action!.parameters.distance).toBe(10);
    });
  });

  describe('gather (food) → multi-step action mapping', () => {
    it('maps all three gather-food steps to valid actions', () => {
      for (const step of STERLING_GATHER_FOOD_STEPS) {
        const action = mapBTActionToMinecraft(step.leaf, step.args);
        expect(action, `Failed to map leaf: ${step.leaf}`).not.toBeNull();
        expect(action!.type).toBeTruthy();
      }
    });

    it('find_resource maps with correct blockType', () => {
      const action = mapBTActionToMinecraft(
        STERLING_GATHER_FOOD_STEPS[0].leaf,
        STERLING_GATHER_FOOD_STEPS[0].args,
      );
      expect(action!.parameters.blockType).toBe('sweet_berry_bush');
    });
  });

  describe('gather (wood) → collect action mapping', () => {
    it('maps collect_items step to valid action', () => {
      const action = mapBTActionToMinecraft(
        STERLING_GATHER_WOOD_STEP.leaf,
        STERLING_GATHER_WOOD_STEP.args,
      );
      expect(action).not.toBeNull();
    });
  });

  describe('all bootstrap leaves are in executor allowlist', () => {
    const BOOTSTRAP_LEAVES = [
      'move_to',
      'step_forward_safely',
      'find_resource',
      'collect_items',
      'consume_food',
    ];

    it('every bootstrap leaf produces a non-null action mapping', () => {
      for (const leaf of BOOTSTRAP_LEAVES) {
        const action = mapBTActionToMinecraft(leaf, { distance: 10 });
        expect(action, `Leaf "${leaf}" has no action mapping`).not.toBeNull();
      }
    });
  });

  describe('all fixture cases map to valid actions', () => {
    it('every step in every fixture case produces a non-null action', () => {
      for (const [caseName, caseData] of Object.entries(FIXTURE.cases) as [string, any][]) {
        for (const step of caseData.steps) {
          const action = mapBTActionToMinecraft(step.leaf, step.args);
          expect(
            action,
            `Fixture case "${caseName}", leaf "${step.leaf}" has no action mapping`,
          ).not.toBeNull();
        }
      }
    });
  });

  describe('lowered steps do NOT produce intent leaves', () => {
    it('no bootstrap step has a task_type_* leaf', () => {
      const allSteps = [
        STERLING_EXPLORE_STEP,
        STERLING_NAVIGATE_SAFETY_STEP,
        STERLING_NAVIGATE_UNKNOWN_STEP,
        ...STERLING_GATHER_FOOD_STEPS,
        STERLING_GATHER_WOOD_STEP,
      ];
      for (const step of allSteps) {
        expect(step.leaf).not.toMatch(/^task_type_/);
      }
    });
  });

  describe('blocked reasons for intent resolution are registered', () => {
    it('transient intent-block reasons exist in registry', () => {
      const transientReasons = [
        'blocked_intent_resolution_unavailable',
        'blocked_navigation_context_unavailable',
        'blocked_resource_context_unavailable',
        'blocked_crafting_context_unavailable',
        'blocked_intent_resolution_failed',
        'blocked_intent_resolution_error',
      ];
      for (const reason of transientReasons) {
        expect(
          BLOCKED_REASON_REGISTRY[reason],
          `Missing registry entry: ${reason}`,
        ).toBeDefined();
        expect(TRANSIENT_EXPANSION_REASONS.has(reason)).toBe(true);
        expect(CONTRACT_BROKEN_REASONS.has(reason)).toBe(false);
      }
    });

    it('contract-broken intent-block reasons exist in registry', () => {
      const brokenReasons = [
        'blocked_crafting_no_goal_item',
      ];
      for (const reason of brokenReasons) {
        expect(
          BLOCKED_REASON_REGISTRY[reason],
          `Missing registry entry: ${reason}`,
        ).toBeDefined();
        expect(CONTRACT_BROKEN_REASONS.has(reason)).toBe(true);
        expect(TRANSIENT_EXPANSION_REASONS.has(reason)).toBe(false);
      }
    });
  });
});
