/**
 * Regression tests for refreshBotStateCacheFromMc and normalizeBotState.
 *
 * This helper wraps the bot state cache refresh flow previously inlined
 * inside process-routes.ts's social_interaction branch. Prior to its
 * extraction, the `mc_state_refresh_failed` debug log at
 * process-routes.ts:506 was typecheck-only — the call site was buried
 * inside a `resilientFetch(...).then(...).catch(...)` chain inside a
 * mega POST /process handler, with no seam to unit-test.
 *
 * What these tests fence
 *
 *  1. Happy path: fetcher returns ok=true with a valid body →
 *     `updateCache` is called with the normalized state, no log fires.
 *
 *  2. Null/non-ok responses (acceptable transient state): fetcher
 *     returns `null` or `{ ok: false }` → `updateCache` is NOT called
 *     and NO log fires. Encodes the "stale cache is acceptable" contract
 *     so resilientFetch's own retry-exhaustion logs don't get duplicated
 *     here.
 *
 *  3. Fetch rejection: fetcher throws a network error →
 *     `updateCache` is NOT called and `mc_state_refresh_failed` debug
 *     log fires with the error message, error name, and label.
 *
 *  4. Malformed JSON: fetcher returns ok=true but `.json()` rejects →
 *     `updateCache` is NOT called and `mc_state_refresh_failed` debug
 *     log fires with the JSON parse error context.
 *
 *  5. Inventory shape normalization: the three coexisting inventory
 *     formats (array, nested `{items: []}`, missing/malformed) each
 *     produce the expected inventory array. This is the load-bearing
 *     correctness assertion — any regression here silently drops
 *     inventory on every social-interaction refresh.
 *
 *  6. Fire-and-forget contract: the returned promise ALWAYS resolves
 *     and never rejects, so production callers can `void` it without
 *     generating unhandled-rejection warnings.
 *
 * Strategy: The helper takes all its dependencies as parameters
 * (fetcher, updateCache writer, logger), so tests pass hand-rolled
 * `vi.fn()` fakes directly. No `vi.mock` hoisting required.
 *
 * @author @darianrosebrook
 */

import { describe, expect, it, vi } from 'vitest';

import {
  normalizeBotState,
  refreshBotStateCacheFromMc,
  type ResilientFetchLike,
} from '../bot-state-refresh-helper';

/**
 * Minimal logger fake. Methods are `vi.fn()` spies so assertions are
 * local to the test scope with no module-level mocking.
 */
function makeLoggerFake() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/**
 * Build a fake fetcher response matching the `ResilientFetchLike`
 * contract. The body argument is returned by `.json()`.
 */
function makeFetchResponse(body: unknown, ok: boolean = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  };
}

/**
 * A fetcher factory for a successful response with the given body.
 */
function fetcherReturning(body: unknown, ok: boolean = true): ResilientFetchLike {
  return vi.fn().mockResolvedValue(makeFetchResponse(body, ok));
}

describe('normalizeBotState', () => {
  // This function is exported separately because its three-branch
  // inventory normalization is the load-bearing correctness surface
  // of the helper. Testing it in isolation is cheap and exhaustive.

  it('extracts inventory when rawInventory is a direct array', () => {
    const rawState = {
      data: {
        inventory: [{ name: 'dirt', count: 64 }],
        health: 20,
        position: { x: 1, y: 2, z: 3 },
      },
      worldState: { player: { gameMode: 'survival' } },
    };

    const result = normalizeBotState(rawState);

    expect(result.inventory).toEqual([{ name: 'dirt', count: 64 }]);
    expect(result.gameMode).toBe('survival');
    expect(result.health).toBe(20);
    expect(result.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('extracts inventory when rawInventory.items is a nested array (legacy shape)', () => {
    // The legacy Minecraft interface response wraps inventory as
    // `{ items: [...], size: N, ... }`. The helper must unwrap to
    // the items array so downstream consumers get a flat list.
    const rawState = {
      data: {
        inventory: {
          items: [{ name: 'stone', count: 32 }],
          size: 36,
        },
        health: 18,
      },
      worldState: { player: { gameMode: 'creative' } },
    };

    const result = normalizeBotState(rawState);

    expect(result.inventory).toEqual([{ name: 'stone', count: 32 }]);
    expect(result.gameMode).toBe('creative');
  });

  it('falls back to empty inventory when rawInventory is missing', () => {
    const rawState = {
      data: {
        health: 20,
        // no inventory field at all
      },
      worldState: { player: { gameMode: 'survival' } },
    };

    const result = normalizeBotState(rawState);

    expect(result.inventory).toEqual([]);
    expect(result.gameMode).toBe('survival');
  });

  it('falls back to empty inventory when rawInventory is malformed (neither array nor {items})', () => {
    // E.g., someone returns `inventory: "oops"` or `inventory: 42`.
    // Helper must not crash; must default to empty array.
    const rawState = {
      data: {
        inventory: 'oops-not-an-array',
      },
      worldState: { player: { gameMode: 'survival' } },
    };

    const result = normalizeBotState(rawState);

    expect(result.inventory).toEqual([]);
  });

  it('returns undefined gameMode when worldState.player is missing', () => {
    const rawState = {
      data: { inventory: [], health: 20 },
      worldState: {}, // no player field
    };

    const result = normalizeBotState(rawState);

    expect(result.gameMode).toBeUndefined();
  });

  it('handles completely empty rawState without throwing', () => {
    // Paranoid edge case: Minecraft interface returns an empty object.
    const result = normalizeBotState({});

    expect(result.inventory).toEqual([]);
    expect(result.gameMode).toBeUndefined();
  });

  it('handles null rawState without throwing', () => {
    // Paranoid edge case: caller passes null.
    const result = normalizeBotState(null);

    expect(result.inventory).toEqual([]);
    expect(result.gameMode).toBeUndefined();
  });
});

describe('refreshBotStateCacheFromMc', () => {
  describe('happy path — fetch succeeds', () => {
    it('calls updateCache with normalized state and does not log', async () => {
      const fetcher = fetcherReturning({
        data: {
          data: {
            inventory: [{ name: 'dirt', count: 1 }],
            health: 20,
          },
          worldState: { player: { gameMode: 'survival' } },
        },
      });
      const updateCache = vi.fn();
      const logger = makeLoggerFake();

      await refreshBotStateCacheFromMc(
        fetcher,
        'http://localhost:3005',
        updateCache,
        logger
      );

      // Fetcher called once with the full /state URL and the stable label.
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledWith('http://localhost:3005/state', {
        label: 'mc/state-social',
      });

      // updateCache received the NORMALIZED state, not the raw response.
      expect(updateCache).toHaveBeenCalledTimes(1);
      const [normalized] = updateCache.mock.calls[0];
      expect(normalized.inventory).toEqual([{ name: 'dirt', count: 1 }]);
      expect(normalized.gameMode).toBe('survival');
      expect(normalized.health).toBe(20);

      // No log of any level on the happy path.
      expect(logger.debug).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('forwards the inventory normalization (legacy nested shape)', async () => {
      // Integration-style check: the helper runs normalizeBotState on
      // the response body, not just on hand-rolled fixtures. This
      // fences a regression where someone moves the normalization out
      // of the refresh helper and forgets to apply it to the nested
      // inventory shape.
      const fetcher = fetcherReturning({
        data: {
          data: {
            inventory: { items: [{ name: 'stone', count: 5 }], size: 36 },
          },
          worldState: { player: { gameMode: 'creative' } },
        },
      });
      const updateCache = vi.fn();
      const logger = makeLoggerFake();

      await refreshBotStateCacheFromMc(
        fetcher,
        'http://localhost:3005',
        updateCache,
        logger
      );

      const [normalized] = updateCache.mock.calls[0];
      expect(normalized.inventory).toEqual([{ name: 'stone', count: 5 }]);
    });
  });

  describe('acceptable transient states — do NOT log', () => {
    // These two scenarios encode the "stale cache is acceptable"
    // contract. resilientFetch already logs its own retry failures;
    // the helper should not double-log these.

    it('does not call updateCache or log when fetcher returns null', async () => {
      const fetcher: ResilientFetchLike = vi.fn().mockResolvedValue(null);
      const updateCache = vi.fn();
      const logger = makeLoggerFake();

      await refreshBotStateCacheFromMc(
        fetcher,
        'http://localhost:3005',
        updateCache,
        logger
      );

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(updateCache).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('does not call updateCache or log when fetcher returns ok=false', async () => {
      // A 4xx or 5xx that resilientFetch exhausted retries on and
      // chose to return instead of throw. Acceptable transient state.
      const fetcher = fetcherReturning({}, false);
      const updateCache = vi.fn();
      const logger = makeLoggerFake();

      await refreshBotStateCacheFromMc(
        fetcher,
        'http://localhost:3005',
        updateCache,
        logger
      );

      expect(updateCache).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('exception paths — emit mc_state_refresh_failed', () => {
    it('emits debug log when fetcher rejects with a network error', async () => {
      // LOAD-BEARING: this is the assertion the helper was extracted
      // to enable. Prior to extraction, the debug log at process-
      // routes.ts:506 was typecheck-only.
      const fetcher: ResilientFetchLike = vi
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED'));
      const updateCache = vi.fn();
      const logger = makeLoggerFake();

      // Contract: fire-and-forget, always resolves.
      await expect(
        refreshBotStateCacheFromMc(
          fetcher,
          'http://localhost:3005',
          updateCache,
          logger
        )
      ).resolves.toBeUndefined();

      expect(updateCache).not.toHaveBeenCalled();

      // Full observability contract: message, event, tags, fields.
      expect(logger.debug).toHaveBeenCalledTimes(1);
      const [message, context] = logger.debug.mock.calls[0];
      expect(message).toBe(
        'Bot state cache refresh failed — using stale cache'
      );
      expect(context).toMatchObject({
        event: 'mc_state_refresh_failed',
        tags: ['mc', 'cache', 'debug'],
      });
      expect(context.fields.error).toBe('ECONNREFUSED');
      expect(context.fields.errorName).toBe('Error');
      expect(context.fields.label).toBe('mc/state-social');

      // No other log levels touched.
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('emits debug log when response.json() rejects (malformed JSON)', async () => {
      // The inner-promise rejection path: fetcher resolves with a
      // response that LOOKS ok, but .json() throws because the body
      // is not valid JSON.
      const malformedResponse = {
        ok: true,
        json: vi
          .fn()
          .mockRejectedValue(new SyntaxError('Unexpected token < in JSON')),
      };
      const fetcher: ResilientFetchLike = vi
        .fn()
        .mockResolvedValue(malformedResponse);
      const updateCache = vi.fn();
      const logger = makeLoggerFake();

      await refreshBotStateCacheFromMc(
        fetcher,
        'http://localhost:3005',
        updateCache,
        logger
      );

      expect(updateCache).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledTimes(1);
      const [, context] = logger.debug.mock.calls[0];
      expect(context.fields.error).toBe('Unexpected token < in JSON');
      expect(context.fields.errorName).toBe('SyntaxError');
    });

    it('handles non-Error rejection (string) via String() fallback', async () => {
      // Paranoid edge case: `Promise.reject('some string')` is legal
      // but unusual. errorName should be undefined (strings have no
      // .name).
      const fetcher: ResilientFetchLike = vi
        .fn()
        .mockRejectedValue('backend offline');
      const updateCache = vi.fn();
      const logger = makeLoggerFake();

      await refreshBotStateCacheFromMc(
        fetcher,
        'http://localhost:3005',
        updateCache,
        logger
      );

      expect(logger.debug).toHaveBeenCalledTimes(1);
      const [, context] = logger.debug.mock.calls[0];
      expect(context.fields.error).toBe('backend offline');
      expect(context.fields.errorName).toBeUndefined();
    });
  });

  describe('fire-and-forget contract', () => {
    it('never rejects even when fetcher rejects with a custom error subclass', async () => {
      // The production call site does `void refreshBotStateCacheFromMc(...)`.
      // This test is the load-bearing assertion for that contract: if
      // the helper ever starts propagating rejections, this test fails
      // and the production fire-and-forget becomes a silent unhandled-
      // rejection generator.
      class McBackendDownError extends Error {
        override name = 'McBackendDownError';
      }
      const fetcher: ResilientFetchLike = vi
        .fn()
        .mockRejectedValue(new McBackendDownError('connection refused'));
      const updateCache = vi.fn();
      const logger = makeLoggerFake();

      let rejected = false;
      try {
        await refreshBotStateCacheFromMc(
          fetcher,
          'http://localhost:3005',
          updateCache,
          logger
        );
      } catch {
        rejected = true;
      }

      expect(rejected).toBe(false);
      expect(updateCache).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledTimes(1);
      const [, context] = logger.debug.mock.calls[0];
      expect(context.fields.error).toBe('connection refused');
      expect(context.fields.errorName).toBe('McBackendDownError');
    });
  });
});
