/**
 * Regression tests for normalizeActionResponse.
 *
 * These tests lock the action-result contract so that "ok:true but actually
 * failed" can never recur. Each scenario is a real-world payload shape
 * observed during the 2026-02-02 soak test.
 *
 * @see packages/planning/src/server/action-response.ts
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeActionResponse,
  type NormalizedActionResponse,
} from '../action-response';

// ---------------------------------------------------------------------------
// Scenario 1: Transport failure (MC interface returned success:false)
// ---------------------------------------------------------------------------

describe('normalizeActionResponse — transport failure', () => {
  it('returns ok:false when MC interface wraps an HTTP-level error', () => {
    const payload = {
      success: false,
      error: 'Bot not connected',
    };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Bot not connected');
    expect(r.data).toBeNull();
  });

  it('returns ok:false with message fallback when error is missing', () => {
    const payload = {
      success: false,
      message: 'Timeout waiting for bot',
    };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Timeout waiting for bot');
  });

  it('returns ok:false with generic message when no error or message', () => {
    const payload = { success: false };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Action execution failed');
  });

  it('passes through result even on transport failure', () => {
    const payload = {
      success: false,
      error: 'internal',
      result: { partial: true },
    };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(false);
    expect(r.data).toEqual({ partial: true });
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Transport success, leaf success:false
// This is the exact shape that caused the soak stall — acquire_material
// returned { success: false, ... } but the MC interface wrapper reported
// success:true because the leaf didn't throw.
// ---------------------------------------------------------------------------

describe('normalizeActionResponse — leaf success:false (acquire_material shape)', () => {
  it('returns ok:false when leaf reports success:false', () => {
    // Real shape from acquire_material when no reachable tree
    const payload = {
      success: true,
      action: 'acquire_material',
      result: {
        success: false,
        error: { detail: 'No reachable oak_log found', code: 'acquire.noneCollected' },
        totalAcquired: 0,
      },
    };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('No reachable oak_log found');
    expect(r.failureCode).toBe('acquire.noneCollected');
    expect(r.data).toEqual(payload.result);
  });

  it('extracts error.message when error.detail is absent', () => {
    const payload = {
      success: true,
      result: {
        success: false,
        error: { message: 'Block out of reach' },
      },
    };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Block out of reach');
  });

  it('extracts string error directly', () => {
    const payload = {
      success: true,
      result: {
        success: false,
        error: 'Inventory full',
      },
    };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Inventory full');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Transport success, leaf status:'failure'
// Some leaves use status instead of success field.
// ---------------------------------------------------------------------------

describe('normalizeActionResponse — leaf status:failure', () => {
  it('returns ok:false when leaf reports status:failure', () => {
    const payload = {
      success: true,
      result: {
        status: 'failure',
        message: 'Could not place block',
        failureCode: 'place.obstructed',
      },
    };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Could not place block');
    expect(r.failureCode).toBe('place.obstructed');
  });

  it('falls back to generic error when status:failure has no message', () => {
    const payload = {
      success: true,
      result: { status: 'failure' },
    };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Leaf action failed');
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Leaf with error field but no explicit success indicator
// ---------------------------------------------------------------------------

describe('normalizeActionResponse — leaf error without success/status', () => {
  it('returns ok:false when leaf has error but no success field', () => {
    const payload = {
      success: true,
      result: {
        error: 'Pathfinding failed',
      },
    };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Pathfinding failed');
  });

  it('treats success:true leaf with error as success (error is informational)', () => {
    // If the leaf explicitly says success:true, the error field is informational
    const payload = {
      success: true,
      result: {
        success: true,
        error: 'Partial collection warning',
        collected: 3,
      },
    };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual(payload.result);
  });

  it('treats status:success leaf with error as success', () => {
    const payload = {
      success: true,
      result: {
        status: 'success',
        error: 'Minor issue during execution',
        items: [{ name: 'oak_log', count: 2 }],
      },
    };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual(payload.result);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Genuine leaf success
// ---------------------------------------------------------------------------

describe('normalizeActionResponse — genuine leaf success', () => {
  it('returns ok:true when leaf reports success:true', () => {
    const payload = {
      success: true,
      action: 'acquire_material',
      result: {
        success: true,
        totalAcquired: 3,
        items: [{ name: 'oak_log', count: 3 }],
      },
    };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual(payload.result);
    expect(r.error).toBeUndefined();
    expect(r.failureCode).toBeUndefined();
  });

  it('returns ok:true when leaf has status:success', () => {
    const payload = {
      success: true,
      result: { status: 'success', placed: true },
    };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(true);
  });

  it('returns ok:true when leaf is a plain object without failure indicators', () => {
    const payload = {
      success: true,
      result: { items: [{ name: 'stick', count: 4 }] },
    };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual(payload.result);
  });

  it('returns ok:true with null data for fire-and-forget (no leaf result)', () => {
    const payload = { success: true };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(true);
    expect(r.data).toBeNull();
  });

  it('returns ok:true with null data when result is explicitly null', () => {
    const payload = { success: true, result: null };
    const r = normalizeActionResponse(payload);
    expect(r.ok).toBe(true);
    expect(r.data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('normalizeActionResponse — edge cases', () => {
  it('returns ok:false for null payload', () => {
    const r = normalizeActionResponse(null);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Empty response from MC interface');
  });

  it('returns ok:false for undefined payload', () => {
    const r = normalizeActionResponse(undefined);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Empty response from MC interface');
  });

  it('returns ok:false for empty object (success is falsy)', () => {
    const r = normalizeActionResponse({});
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Action execution failed');
  });

  it('extracts failureCode from error.code', () => {
    const payload = {
      success: true,
      result: {
        success: false,
        error: { code: 'craft.missingIngredient', detail: 'Need planks' },
      },
    };
    const r = normalizeActionResponse(payload);
    expect(r.failureCode).toBe('craft.missingIngredient');
  });

  it('extracts failureCode from top-level failureCode when error.code absent', () => {
    const payload = {
      success: true,
      result: {
        success: false,
        failureCode: 'navigate.unreachable',
        message: 'Cannot reach destination',
      },
    };
    const r = normalizeActionResponse(payload);
    expect(r.failureCode).toBe('navigate.unreachable');
    expect(r.error).toBe('Cannot reach destination');
  });

  it('returns undefined failureCode when neither code path has one', () => {
    const payload = {
      success: true,
      result: {
        success: false,
        error: 'Generic failure',
      },
    };
    const r = normalizeActionResponse(payload);
    expect(r.failureCode).toBeUndefined();
  });
});
