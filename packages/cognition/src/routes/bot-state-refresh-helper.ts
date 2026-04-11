/**
 * Bot State Cache Refresh Helper
 *
 * Extracted from process-routes.ts's social_interaction branch to create
 * a testable seam for the `mc_state_refresh_failed` observability event.
 * Prior to this extraction, the refresh block was inlined inside the
 * mega POST /process handler's social_interaction branch, with no seam
 * to unit-test. The debug log at process-routes.ts:506 was typecheck-only.
 *
 * Responsibilities:
 *
 *   1. Fetch the latest bot state from the Minecraft interface endpoint
 *      via a caller-injected `resilientFetch`-like function (so tests
 *      don't need to stub `@conscious-bot/core`).
 *
 *   2. Normalize the response shape through three inventory formats:
 *      (a) rawInventory is an array (modern format),
 *      (b) rawInventory.items is an array (legacy nested format),
 *      (c) neither — fall back to an empty array.
 *
 *   3. Extract `gameMode` from the nested `worldState.player` path.
 *
 *   4. Call the injected `updateCache` writer with the normalized state.
 *
 *   5. On ANY failure — fetch rejection, non-ok response, null response,
 *      or malformed JSON — emit a `mc_state_refresh_failed` debug log
 *      and return silently. The caller's cache stays at its stale value
 *      (the "stale is acceptable" contract for social-interaction routing).
 *
 * The helper is fire-and-forget: it returns `Promise<void>` that ALWAYS
 * resolves so the caller can `void refreshBotStateCacheFromMc(...)`
 * without worrying about unhandled rejections. This matches the prior
 * inline behavior where the call was started but never awaited.
 *
 * @author @darianrosebrook
 */

import { createServerLogger } from '../server-utils/server-logger';

/**
 * Minimal interface for the injected fetch dependency. Matches the
 * shape of `resilientFetch` from `@conscious-bot/core` (returns
 * `Response | null` on success; rejects on network errors depending
 * on `throwOnFinalFailure`). Using an injected fetcher means tests
 * can pass a `vi.fn()` without stubbing the core module.
 */
export interface ResilientFetchLike {
  (
    url: string,
    options?: { label?: string }
  ): Promise<{
    ok: boolean;
    json: () => Promise<unknown>;
  } | null>;
}

/**
 * Logger shape needed by `refreshBotStateCacheFromMc`. Uses the inferred
 * return type of `createServerLogger` so the helper stays in sync with
 * the logger's actual surface without duplicating the interface definition.
 */
export type RefreshLogger = ReturnType<typeof createServerLogger>;

/**
 * Writer function for the bot state cache. Takes an opaque state
 * object and persists it. Injected so tests can pass a `vi.fn()`
 * instead of stubbing the `bot-state-cache` module.
 *
 * The shape matches `updateBotStateCache` from `bot-state-cache.ts`,
 * but the helper itself is agnostic to what the writer does with
 * the state — it could be a no-op in a dry-run, a full cache write
 * in production, or a vi.fn() spy in tests.
 */
export type BotStateCacheWriter = (state: any) => void;

/**
 * Normalize the bot state shape from the Minecraft endpoint response.
 *
 * Exported separately from the refresh function so its three-branch
 * inventory normalization can be tested in isolation without any
 * fake-fetcher or fake-cache machinery. This is the load-bearing
 * correctness surface of the helper — a regression here silently
 * drops inventory on every social-interaction cache refresh.
 *
 * @param rawState - The `.data` field from the Minecraft endpoint response.
 *                   Shape is `{ data: { inventory, ... }, worldState: { player: { gameMode } } }`.
 * @returns A normalized state object with inventory coerced to an array
 *          and gameMode extracted from the nested player path.
 */
export function normalizeBotState(rawState: any): any {
  const innerData = rawState?.data || {};
  const rawInventory = innerData.inventory;
  const inventory = Array.isArray(rawInventory)
    ? rawInventory
    : Array.isArray(rawInventory?.items)
      ? rawInventory.items
      : [];
  const gameMode = rawState?.worldState?.player?.gameMode;
  return { ...innerData, inventory, gameMode };
}

/**
 * Refresh the bot state cache from the Minecraft interface endpoint.
 *
 * Behavior matrix:
 *
 *   | Scenario                              | updateCache called? | Debug log emitted?           |
 *   |---------------------------------------|---------------------|------------------------------|
 *   | Fetch returns ok=true, valid JSON     | Yes (normalized)    | No                           |
 *   | Fetch returns null                    | No                  | No (acceptable brief outage) |
 *   | Fetch returns ok=false                | No                  | No (acceptable brief outage) |
 *   | Fetch rejects (network error)         | No                  | Yes (mc_state_refresh_failed)|
 *   | Response.json() throws (malformed)    | No                  | Yes (mc_state_refresh_failed)|
 *
 * The "fetch returned null/non-ok → no log" rows encode the original
 * intent of the inlined code: resilientFetch already logs its own
 * retry failures internally, and a non-ok response is an acceptable
 * transient state for social-interaction routing (the cache goes stale
 * for one refresh window and the next social interaction retries).
 * Only EXCEPTIONS are worth surfacing at the debug level, because
 * they represent client-side code failures or post-retry failures
 * that resilientFetch could not recover from.
 *
 * @param fetcher - A `resilientFetch`-like function. In production this
 *                  is `resilientFetch` from `@conscious-bot/core`; in
 *                  tests it's a `vi.fn()`-backed fake.
 * @param mcUrl - Base URL of the Minecraft interface endpoint. The
 *                helper appends `/state` internally so callers pass
 *                the base, not the full path.
 * @param updateCache - Writer function. Called with the normalized
 *                      state on success, never called on failure.
 * @param logger - A server logger instance. Used ONLY on exception
 *                 paths to emit `mc_state_refresh_failed`.
 * @returns A promise that always resolves (never rejects).
 */
export async function refreshBotStateCacheFromMc(
  fetcher: ResilientFetchLike,
  mcUrl: string,
  updateCache: BotStateCacheWriter,
  logger: RefreshLogger
): Promise<void> {
  try {
    const freshRes = await fetcher(`${mcUrl}/state`, {
      label: 'mc/state-social',
    });

    // Null or non-ok response means resilientFetch exhausted its retries
    // or got a 4xx/5xx. That's an acceptable transient state for this
    // call site — the stale cache covers it. Return silently.
    if (!freshRes?.ok) {
      return;
    }

    const freshBot = (await freshRes.json()) as any;
    const rawState = freshBot?.data || {};
    const freshState = normalizeBotState(rawState);
    updateCache(freshState);
  } catch (error) {
    // Exceptions reach here from two sources:
    //   1. fetcher() rejected (network error under certain flag configs)
    //   2. response.json() rejected (malformed JSON from the endpoint)
    //
    // Both represent a failure mode resilientFetch's own retry pipeline
    // could not mask, so they warrant a debug-level trace. We keep this
    // at debug (not warn) because stale cache is acceptable for social-
    // interaction routing and we don't want post-mortem noise during
    // expected brief unavailability windows.
    logger.debug('Bot state cache refresh failed — using stale cache', {
      event: 'mc_state_refresh_failed',
      tags: ['mc', 'cache', 'debug'],
      fields: {
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : undefined,
        label: 'mc/state-social',
      },
    });
  }
}
