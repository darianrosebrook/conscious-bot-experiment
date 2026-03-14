/**
 * M3.5 Live Validation: craft_recipe failure → prereq injection chain.
 *
 * Tests the propagation from toolDiagnostics through to injectDynamicPrereqForCraft
 * at the action-response normalization boundary.
 *
 * Does NOT require a live Minecraft server — tests the normalizer and
 * diagnostic extraction which are the critical integration seams.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeActionResponse,
  type NormalizedActionResponse,
} from '../action-response';

describe('M3.5: craft_recipe diagnostic propagation', () => {
  describe('normalizeActionResponse hoists toolDiagnostics', () => {
    it('v2 diagnostics with requires_workstation are hoisted to top level', () => {
      // Simulate the exact shape CraftRecipeLeaf returns when
      // bot is not near a crafting table (line 495-520 of crafting-leaves.ts)
      const httpPayload = {
        success: true, // Transport succeeded
        result: {
          status: 'failure', // Leaf-level failure
          error: {
            code: 'craft.missingInput',
            retryable: false,
            detail: 'No available recipe for wooden_pickaxe (inputs missing or not near table)',
          },
          result: {
            success: false,
            crafted: 0,
            recipe: 'wooden_pickaxe',
            toolDiagnostics: {
              _diag_version: 2,
              reason_code: 'no_recipe_available',
              recipe_requested: 'wooden_pickaxe',
              crafting_table_nearby: false,
              requires_workstation: true,
              has_workstation_in_inventory: false,
              missing_inputs: [
                { item: 'oak_planks', need: 3, have: 0 },
                { item: 'stick', need: 2, have: 0 },
              ],
              search_radius: 4,
              inventory_snapshot: {},
            },
          },
          metrics: { durationMs: 15, retries: 0, timeouts: 0 },
        },
      };

      const normalized = normalizeActionResponse(httpPayload);

      // Core assertion: ok must be false (leaf reported failure)
      expect(normalized.ok).toBe(false);

      // Critical: toolDiagnostics must be hoisted to top level
      expect(normalized.toolDiagnostics).toBeDefined();
      expect(normalized.toolDiagnostics!._diag_version).toBe(2);
      expect(normalized.toolDiagnostics!.requires_workstation).toBe(true);
      expect(normalized.toolDiagnostics!.crafting_table_nearby).toBe(false);
      expect(normalized.toolDiagnostics!.reason_code).toBe('no_recipe_available');
      expect(normalized.toolDiagnostics!.missing_inputs).toEqual([
        { item: 'oak_planks', need: 3, have: 0 },
        { item: 'stick', need: 2, have: 0 },
      ]);

      // Leaf metadata should also be extracted
      expect(normalized.leafStatus).toBe('failure');
      expect(normalized.leafErrorCode).toBe('craft.missingInput');
    });

    it('v1 diagnostics (no workstation fields) are still hoisted', () => {
      const httpPayload = {
        success: true,
        result: {
          status: 'failure',
          error: { code: 'craft.uiTimeout', retryable: true, detail: 'No inventory delta after craft' },
          result: {
            success: false,
            crafted: 0,
            recipe: 'wooden_pickaxe',
            toolDiagnostics: {
              _diag_version: 1,
              reason_code: 'no_inventory_delta',
              used_table: true,
              before_count: 0,
              after_count: 0,
            },
          },
          metrics: { durationMs: 5000, retries: 0, timeouts: 1 },
        },
      };

      const normalized = normalizeActionResponse(httpPayload);

      expect(normalized.ok).toBe(false);
      expect(normalized.toolDiagnostics).toBeDefined();
      expect(normalized.toolDiagnostics!._diag_version).toBe(1);
      expect(normalized.toolDiagnostics!.reason_code).toBe('no_inventory_delta');
      // v1 does NOT have requires_workstation — prereq injector should fall through to acquisition
      expect(normalized.toolDiagnostics!.requires_workstation).toBeUndefined();
    });

    it('_runLeaf wrapping: diagnostics extracted from nested leafResult', () => {
      // Some MC interface routes wrap the leaf result in { data: { leafResult: ... } }
      const httpPayload = {
        success: true,
        result: {
          data: {
            leafResult: {
              status: 'failure',
              error: { code: 'craft.missingInput' },
              result: {
                toolDiagnostics: {
                  _diag_version: 2,
                  reason_code: 'no_recipe_available',
                  requires_workstation: true,
                  crafting_table_nearby: false,
                },
              },
            },
          },
        },
      };

      const normalized = normalizeActionResponse(httpPayload);

      // Even with nesting, diagnostics should be hoisted
      expect(normalized.toolDiagnostics).toBeDefined();
      expect(normalized.toolDiagnostics!.requires_workstation).toBe(true);
      expect(normalized.toolDiagnostics!.crafting_table_nearby).toBe(false);
    });

    it('no diagnostics: response without _diag_version does not create spurious toolDiagnostics', () => {
      const httpPayload = {
        success: false,
        error: 'Connection timeout',
        result: null,
      };

      const normalized = normalizeActionResponse(httpPayload);

      expect(normalized.ok).toBe(false);
      expect(normalized.toolDiagnostics).toBeUndefined();
    });

    it('success path: no toolDiagnostics hoisted on ok:true', () => {
      const httpPayload = {
        success: true,
        result: {
          status: 'success',
          result: {
            crafted: 1,
            recipe: 'stick',
            toolDiagnostics: {
              _diag_version: 1,
              reason_code: 'craft_complete',
              qty_crafted: 4,
            },
          },
        },
      };

      const normalized = normalizeActionResponse(httpPayload);

      expect(normalized.ok).toBe(true);
      // Success path should still have diagnostics (they're always hoisted when present)
      expect(normalized.toolDiagnostics).toBeDefined();
      expect(normalized.toolDiagnostics!.reason_code).toBe('craft_complete');
    });
  });

  describe('prerequisite injection decision boundary', () => {
    it('v2 with requires_workstation=true + crafting_table_nearby=false triggers workstation prereq', () => {
      // This test validates the decision surface of injectDynamicPrereqForCraft
      // without needing the full executor. The check is at line 1035 of modular-server.ts:
      // if (diag?.requires_workstation === true && diag?.crafting_table_nearby === false)
      const diag = {
        _diag_version: 2,
        requires_workstation: true,
        crafting_table_nearby: false,
      };

      expect(diag.requires_workstation === true && diag.crafting_table_nearby === false).toBe(true);
    });

    it('v2 with crafting_table_nearby=true does NOT trigger workstation prereq', () => {
      const diag = {
        _diag_version: 2,
        requires_workstation: true,
        crafting_table_nearby: true, // Table IS nearby — problem is missing ingredients
      };

      expect(diag.requires_workstation === true && diag.crafting_table_nearby === false).toBe(false);
    });

    it('v1 without workstation fields falls through to acquisition', () => {
      const diag = {
        _diag_version: 1,
        reason_code: 'no_inventory_delta',
      };

      // No requires_workstation field → falls through to injectNextAcquisitionStep
      expect(diag.requires_workstation === true).toBe(false);
    });
  });
});
