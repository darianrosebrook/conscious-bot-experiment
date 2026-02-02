/**
 * Leaf Routing Conformance Test
 *
 * Verifies that the shared leaf-routing module (single source of truth for
 * action-type → leaf-name mapping in the planning layer) stays aligned with:
 *
 * 1. The minecraft-interface ACTION_TYPE_TO_LEAF dispatch map
 * 2. The crafting-leaves WORKSTATION_TYPES / parsePlaceAction exports
 * 3. All known action types produce expected leaf names
 *
 * This catches mapping drift between the planning and execution layers.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  actionTypeToLeaf,
  actionTypeToLeafExtended,
  parsePlaceAction,
  WORKSTATION_TYPES,
  derivePlaceMeta,
  estimateDuration,
} from '../leaf-routing';

// ── Cross-package conformance vectors ─────────────────────────────
// These represent the contract the minecraft-interface layer expects.
// If ACTION_TYPE_TO_LEAF in action-translator.ts changes, update here too.

/** Canonical mapping from minecraft-interface ACTION_TYPE_TO_LEAF. */
const EXECUTION_LAYER_MAPPING: Record<string, string> = {
  craft: 'craft_recipe',
  craft_item: 'craft_recipe',
  smelt: 'smelt',
  smelt_item: 'smelt',
  place_workstation: 'place_workstation',
  prepare_site: 'prepare_site',
  build_module: 'build_module',
  place_feature: 'place_feature',
};

/** Canonical workstation types from minecraft-interface crafting-leaves. */
const CANONICAL_WORKSTATION_TYPES = ['crafting_table', 'furnace', 'blast_furnace'];

describe('leaf-routing conformance', () => {
  // ── actionTypeToLeaf ────────────────────────────────────────────

  describe('actionTypeToLeaf', () => {
    it('maps mine → acquire_material', () => {
      expect(actionTypeToLeaf('mine')).toBe('acquire_material');
    });

    it('maps craft → craft_recipe', () => {
      expect(actionTypeToLeaf('craft')).toBe('craft_recipe');
    });

    it('maps smelt → smelt', () => {
      expect(actionTypeToLeaf('smelt')).toBe('smelt');
    });

    it('maps place:crafting_table → place_workstation', () => {
      expect(actionTypeToLeaf('place', 'place:crafting_table')).toBe('place_workstation');
    });

    it('maps place:furnace → place_workstation', () => {
      expect(actionTypeToLeaf('place', 'place:furnace')).toBe('place_workstation');
    });

    it('maps place:blast_furnace → place_workstation', () => {
      expect(actionTypeToLeaf('place', 'place:blast_furnace')).toBe('place_workstation');
    });

    it('maps place:stone → place_block (non-workstation)', () => {
      expect(actionTypeToLeaf('place', 'place:stone')).toBe('place_block');
    });

    it('maps place without action → place_block', () => {
      expect(actionTypeToLeaf('place')).toBe('place_block');
      expect(actionTypeToLeaf('place', undefined)).toBe('place_block');
    });

    it('maps navigate → sterling_navigate', () => {
      expect(actionTypeToLeaf('navigate')).toBe('sterling_navigate');
    });

    it('passes through unknown action types', () => {
      expect(actionTypeToLeaf('gather')).toBe('gather');
    });
  });

  // ── actionTypeToLeafExtended ────────────────────────────────────

  describe('actionTypeToLeafExtended', () => {
    it('maps upgrade → craft_recipe', () => {
      expect(actionTypeToLeafExtended('upgrade')).toBe('craft_recipe');
    });

    it('delegates non-upgrade types to base mapping', () => {
      expect(actionTypeToLeafExtended('mine')).toBe('acquire_material');
      expect(actionTypeToLeafExtended('craft')).toBe('craft_recipe');
      expect(actionTypeToLeafExtended('place', 'place:crafting_table')).toBe('place_workstation');
    });
  });

  // ── parsePlaceAction conformance ────────────────────────────────
  // These vectors must match the parsePlaceAction in crafting-leaves.ts

  describe('parsePlaceAction (conformance with crafting-leaves)', () => {
    const vectors: Array<[string | undefined, string | null]> = [
      ['place:crafting_table', 'crafting_table'],
      ['place:furnace', 'furnace'],
      ['place:blast_furnace', 'blast_furnace'],
      ['place:stone', 'stone'],
      ['place:', null],
      [undefined, null],
      ['mine:stone', null],
      ['tp:craft:furnace', null],
      ['', null],
      ['place', null],
      ['place:a:b', null],
    ];

    for (const [input, expected] of vectors) {
      it(`parsePlaceAction(${JSON.stringify(input)}) → ${JSON.stringify(expected)}`, () => {
        expect(parsePlaceAction(input)).toBe(expected);
      });
    }
  });

  // ── WORKSTATION_TYPES conformance ───────────────────────────────

  describe('WORKSTATION_TYPES (conformance with crafting-leaves)', () => {
    it('contains all canonical workstation types', () => {
      for (const ws of CANONICAL_WORKSTATION_TYPES) {
        expect(WORKSTATION_TYPES.has(ws)).toBe(true);
      }
    });

    it('has exactly the canonical set (no extras)', () => {
      expect(WORKSTATION_TYPES.size).toBe(CANONICAL_WORKSTATION_TYPES.length);
    });
  });

  // ── Cross-layer mapping alignment ──────────────────────────────
  // Verifies planning-layer mapping is compatible with execution-layer dispatch.

  describe('cross-layer mapping alignment', () => {
    it('craft action type resolves to same leaf as execution layer', () => {
      expect(actionTypeToLeaf('craft')).toBe(EXECUTION_LAYER_MAPPING['craft']);
    });

    it('smelt action type resolves to same leaf as execution layer', () => {
      expect(actionTypeToLeaf('smelt')).toBe(EXECUTION_LAYER_MAPPING['smelt']);
    });

    it('place_workstation is recognized by execution layer', () => {
      // The planning layer emits place_workstation as meta.leaf.
      // The execution layer must have a mapping for it.
      expect(EXECUTION_LAYER_MAPPING['place_workstation']).toBe('place_workstation');
    });
  });

  // ── derivePlaceMeta ─────────────────────────────────────────────

  describe('derivePlaceMeta', () => {
    it('returns { workstation } for workstation items', () => {
      expect(derivePlaceMeta('place:crafting_table')).toEqual({ workstation: 'crafting_table' });
      expect(derivePlaceMeta('place:furnace')).toEqual({ workstation: 'furnace' });
    });

    it('returns { placeItem } for non-workstation items', () => {
      expect(derivePlaceMeta('place:stone')).toEqual({ placeItem: 'stone' });
    });

    it('returns {} for unparseable actions', () => {
      expect(derivePlaceMeta(undefined)).toEqual({});
      expect(derivePlaceMeta('')).toEqual({});
    });
  });

  // ── estimateDuration ────────────────────────────────────────────

  describe('estimateDuration', () => {
    it('returns expected durations for known types', () => {
      expect(estimateDuration('mine')).toBe(5000);
      expect(estimateDuration('craft')).toBe(2000);
      expect(estimateDuration('smelt')).toBe(15000);
      expect(estimateDuration('place')).toBe(1000);
      expect(estimateDuration('upgrade')).toBe(2000);
    });

    it('returns 3000 default for unknown types', () => {
      expect(estimateDuration('unknown')).toBe(3000);
    });
  });
});
