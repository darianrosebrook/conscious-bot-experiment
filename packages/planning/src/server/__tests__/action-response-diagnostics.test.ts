/**
 * Action Response Diagnostics Extraction Tests (P0-A)
 *
 * Pins the toolDiagnostics hoisting behavior in normalizeActionResponse.
 * Tests cover all known wrapper shapes from the MC interface:
 *
 *   1. _runLeaf path: { success, data: { leafResult: { status, result: { toolDiagnostics } } } }
 *   2. Direct leaf path: { success, result: { status, result: { toolDiagnostics } } }
 *   3. Legacy handler path: { success, error } (no diagnostics)
 *   4. Success with diagnostics
 *   5. Invalid _diag_version rejection
 *
 * Run with: npx vitest run packages/planning/src/server/__tests__/action-response-diagnostics.test.ts
 */

import { describe, it, expect } from 'vitest';
import { normalizeActionResponse } from '../action-response';
import { extractToolDiagnostics, extractDiagReasonCode, extractRetryHint } from '../../golden-run-recorder';

// ---------------------------------------------------------------------------
// Fixture: realistic CraftRecipeLeaf diagnostics
// ---------------------------------------------------------------------------

const CRAFT_FAILURE_DIAG = {
  _diag_version: 2,
  reason_code: 'no_recipe_available',
  recipe_requested: 'wooden_pickaxe',
  crafting_table_nearby: false,
  requires_workstation: true,
  has_workstation_in_inventory: false,
  missing_inputs: [
    { item: 'stick', have: 0, need: 2 },
    { item: 'oak_planks', have: 0, need: 3 },
  ],
  search_radius: 6,
  inventory_snapshot: { oak_log: 3 },
};

const CRAFT_SUCCESS_DIAG = {
  _diag_version: 1,
  reason_code: 'craft_complete',
  used_table: true,
  qty_requested: 4,
  qty_crafted: 4,
};

const DIG_FAILURE_DIAG = {
  _diag_version: 1,
  reason_code: 'no_blocks_found',
  retry_hint: 'reposition_or_rescan',
  block_type: 'oak_log',
  search_radius: 32,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('normalizeActionResponse — toolDiagnostics hoisting', () => {

  describe('_runLeaf dispatch path (primary)', () => {
    it('hoists toolDiagnostics from _runLeaf wrapping on failure', () => {
      // MC /action returns: { success: true, result: <actionTranslatorResult> }
      // actionTranslator._runLeaf returns: { success: false, data: { leafResult: <leafResult> } }
      const httpPayload = {
        success: true,
        result: {
          success: false,
          data: {
            requestedActionType: 'craft_recipe',
            resolvedLeafName: 'craft_recipe',
            leafResult: {
              status: 'failure',
              error: { code: 'craft.missingInput', detail: 'No available recipe for wooden_pickaxe' },
              result: { success: false, crafted: 0, recipe: 'wooden_pickaxe', toolDiagnostics: CRAFT_FAILURE_DIAG },
              metrics: { durationMs: 42, retries: 0, timeouts: 0 },
            },
          },
          error: 'No available recipe for wooden_pickaxe',
        },
      };

      const normalized = normalizeActionResponse(httpPayload);

      expect(normalized.ok).toBe(false);
      expect(normalized.toolDiagnostics).toBeDefined();
      expect(normalized.toolDiagnostics?.reason_code).toBe('no_recipe_available');
      expect(normalized.toolDiagnostics?.crafting_table_nearby).toBe(false);
      expect(normalized.toolDiagnostics?.missing_inputs).toEqual(CRAFT_FAILURE_DIAG.missing_inputs);
      expect(normalized.leafStatus).toBe('failure');
      expect(normalized.leafErrorCode).toBe('craft.missingInput');
    });

    it('hoists toolDiagnostics from _runLeaf wrapping on success', () => {
      const httpPayload = {
        success: true,
        result: {
          success: true,
          data: {
            requestedActionType: 'craft_recipe',
            resolvedLeafName: 'craft_recipe',
            leafResult: {
              status: 'success',
              result: { success: true, crafted: 4, recipe: 'oak_planks', toolDiagnostics: CRAFT_SUCCESS_DIAG },
              metrics: { durationMs: 150, retries: 0, timeouts: 0 },
            },
          },
        },
      };

      const normalized = normalizeActionResponse(httpPayload);

      expect(normalized.ok).toBe(true);
      expect(normalized.toolDiagnostics).toBeDefined();
      expect(normalized.toolDiagnostics?.reason_code).toBe('craft_complete');
      expect(normalized.toolDiagnostics?.qty_crafted).toBe(4);
      expect(normalized.leafStatus).toBe('success');
    });

    it('hoists retry_hint diagnostics (dig_block failure)', () => {
      const httpPayload = {
        success: true,
        result: {
          success: false,
          data: {
            requestedActionType: 'dig_block',
            resolvedLeafName: 'dig_block',
            leafResult: {
              status: 'failure',
              error: { code: 'dig.noBlocks', detail: 'No oak_log blocks found within range' },
              result: { toolDiagnostics: DIG_FAILURE_DIAG },
            },
          },
          error: 'No oak_log blocks found within range',
        },
      };

      const normalized = normalizeActionResponse(httpPayload);

      expect(normalized.ok).toBe(false);
      expect(normalized.toolDiagnostics?.reason_code).toBe('no_blocks_found');
      expect(normalized.toolDiagnostics?.retry_hint).toBe('reposition_or_rescan');
    });
  });

  describe('Direct leaf path (status-based failure)', () => {
    it('hoists toolDiagnostics when leaf result is at top level', () => {
      // Some paths return the leaf result directly (not wrapped in data.leafResult)
      const httpPayload = {
        success: true,
        result: {
          status: 'failure',
          error: { code: 'craft.missingInput', detail: 'No available recipe' },
          result: { toolDiagnostics: CRAFT_FAILURE_DIAG },
        },
      };

      const normalized = normalizeActionResponse(httpPayload);

      expect(normalized.ok).toBe(false);
      expect(normalized.toolDiagnostics).toBeDefined();
      expect(normalized.toolDiagnostics?.reason_code).toBe('no_recipe_available');
      expect(normalized.leafStatus).toBe('failure');
      expect(normalized.leafErrorCode).toBe('craft.missingInput');
    });
  });

  describe('Legacy handler path (no diagnostics)', () => {
    it('returns undefined toolDiagnostics for legacy handler response', () => {
      // Legacy handlers (executeCraftItem) return { success: false, error: string }
      const httpPayload = {
        success: true,
        result: {
          success: false,
          error: 'Crafting failed',
        },
      };

      const normalized = normalizeActionResponse(httpPayload);

      expect(normalized.ok).toBe(false);
      expect(normalized.toolDiagnostics).toBeUndefined();
      expect(normalized.leafStatus).toBeUndefined();
    });

    it('returns undefined toolDiagnostics for transport failure', () => {
      const httpPayload = {
        success: false,
        error: 'ECONNREFUSED',
      };

      const normalized = normalizeActionResponse(httpPayload);

      expect(normalized.ok).toBe(false);
      expect(normalized.toolDiagnostics).toBeUndefined();
    });

    it('returns undefined toolDiagnostics for null payload', () => {
      const normalized = normalizeActionResponse(null);

      expect(normalized.ok).toBe(false);
      expect(normalized.toolDiagnostics).toBeUndefined();
    });

    it('returns undefined toolDiagnostics for null leaf result', () => {
      const httpPayload = { success: true, result: null };

      const normalized = normalizeActionResponse(httpPayload);

      expect(normalized.ok).toBe(true);
      expect(normalized.toolDiagnostics).toBeUndefined();
    });
  });

  describe('_diag_version validation', () => {
    it('rejects diagnostics without _diag_version', () => {
      const httpPayload = {
        success: true,
        result: {
          status: 'failure',
          error: { code: 'craft.missingInput' },
          result: {
            toolDiagnostics: {
              reason_code: 'no_recipe_available', // no _diag_version
            },
          },
        },
      };

      const normalized = normalizeActionResponse(httpPayload);

      expect(normalized.ok).toBe(false);
      expect(normalized.toolDiagnostics).toBeUndefined();
    });

    it('accepts _diag_version: 0 (falsy but valid)', () => {
      // _diag_version: 0 is technically valid (not null/undefined)
      const httpPayload = {
        success: true,
        result: {
          status: 'success',
          result: {
            toolDiagnostics: { _diag_version: 0, reason_code: 'test' },
          },
        },
      };

      const normalized = normalizeActionResponse(httpPayload);

      // _diag_version: 0 passes `!= null` check
      expect(normalized.toolDiagnostics).toBeDefined();
      expect(normalized.toolDiagnostics?.reason_code).toBe('test');
    });
  });
});

describe('extractToolDiagnostics — hoisted path integration', () => {
  it('extracts from hoisted toolDiagnostics (primary path)', () => {
    const actionResult = {
      ok: false,
      toolDiagnostics: CRAFT_FAILURE_DIAG,
      data: {},
    };

    const diag = extractToolDiagnostics(actionResult);

    expect(diag).toBeDefined();
    expect(diag?.reason_code).toBe('no_recipe_available');
  });

  it('extractDiagReasonCode works with hoisted path', () => {
    const actionResult = {
      ok: false,
      toolDiagnostics: CRAFT_FAILURE_DIAG,
      data: {},
    };

    expect(extractDiagReasonCode(actionResult)).toBe('no_recipe_available');
  });

  it('extractRetryHint works with hoisted path', () => {
    const actionResult = {
      ok: false,
      toolDiagnostics: DIG_FAILURE_DIAG,
      data: {},
    };

    expect(extractRetryHint(actionResult)).toBe('reposition_or_rescan');
  });

  it('falls back to legacy paths when hoisted field absent', () => {
    // Legacy: diagnostics at data.diagnostics
    const actionResult = {
      ok: false,
      data: { diagnostics: CRAFT_FAILURE_DIAG },
    };

    const diag = extractToolDiagnostics(actionResult);

    expect(diag).toBeDefined();
    expect(diag?.reason_code).toBe('no_recipe_available');
  });

  it('returns undefined when no diagnostics anywhere', () => {
    const actionResult = { ok: false, data: { error: 'something' } };

    expect(extractToolDiagnostics(actionResult)).toBeUndefined();
    expect(extractDiagReasonCode(actionResult)).toBeUndefined();
    expect(extractRetryHint(actionResult)).toBeUndefined();
  });

  it('returns undefined for null action result', () => {
    expect(extractDiagReasonCode(null)).toBeUndefined();
    expect(extractRetryHint(null)).toBeUndefined();
  });
});

describe('Full chain: normalizeActionResponse → extractToolDiagnostics', () => {
  it('craft_recipe failure: diagnostics flow from HTTP payload to reason_code', () => {
    // Simulate the exact HTTP response from MC interface for a craft_recipe failure
    const httpPayload = {
      success: true,
      action: 'craft_recipe',
      result: {
        success: false,
        data: {
          requestedActionType: 'craft_recipe',
          resolvedLeafName: 'craft_recipe',
          leafResult: {
            status: 'failure',
            error: {
              code: 'craft.missingInput',
              retryable: false,
              detail: 'No available recipe for wooden_pickaxe (inputs missing or not near table)',
            },
            result: {
              success: false,
              crafted: 0,
              recipe: 'wooden_pickaxe',
              toolDiagnostics: CRAFT_FAILURE_DIAG,
            },
            metrics: { durationMs: 38, retries: 0, timeouts: 0 },
          },
        },
        error: 'No available recipe for wooden_pickaxe (inputs missing or not near table)',
      },
    };

    // Step 1: Normalize (planning gateway does this)
    const normalized = normalizeActionResponse(httpPayload);

    // Step 2: Extract (executor/recorder does this)
    const reasonCode = extractDiagReasonCode(normalized as unknown as Record<string, unknown>);
    const retryHint = extractRetryHint(normalized as unknown as Record<string, unknown>);
    const fullDiag = extractToolDiagnostics(normalized as unknown as Record<string, unknown>);

    // Verify the full chain works
    expect(reasonCode).toBe('no_recipe_available');
    expect(retryHint).toBeUndefined(); // craft doesn't set retry_hint
    expect(fullDiag?.crafting_table_nearby).toBe(false);
    expect(fullDiag?.requires_workstation).toBe(true);
    expect(fullDiag?.missing_inputs).toHaveLength(2);
    expect(fullDiag?.inventory_snapshot).toEqual({ oak_log: 3 });
  });

  it('dig_block failure: retry_hint flows through the full chain', () => {
    const httpPayload = {
      success: true,
      action: 'dig_block',
      result: {
        success: false,
        data: {
          requestedActionType: 'dig_block',
          resolvedLeafName: 'dig_block',
          leafResult: {
            status: 'failure',
            error: { code: 'dig.noBlocks', detail: 'No oak_log blocks found within range' },
            result: { toolDiagnostics: DIG_FAILURE_DIAG },
          },
        },
        error: 'No oak_log blocks found within range',
      },
    };

    const normalized = normalizeActionResponse(httpPayload);
    const retryHint = extractRetryHint(normalized as unknown as Record<string, unknown>);

    expect(retryHint).toBe('reposition_or_rescan');
  });
});
