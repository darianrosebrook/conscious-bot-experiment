/**
 * LLM Race-with-Timeout Helper
 *
 * Extracted from ObservationReasoner.reason() to create a testable seam
 * for the `observation_race_invariant_broken` observability event. Prior
 * to this extraction, the race/abort/timeout triad was inlined inside
 * reason() with no seam to unit-test the late-rejection safety net.
 *
 * The helper races an LLM call against a wall-clock timeout using an
 * AbortController for cooperative cancellation. It handles three subtle
 * async invariants that the original inline version mixed together:
 *
 *   1. **Timer cleanup on all exit paths.** Both the abort timer and the
 *      race timer are cleared in a `finally` block, so neither leaks
 *      regardless of whether the race was won by the LLM, the timeout,
 *      or an intermediate LLM rejection.
 *
 *   2. **Unhandled-rejection suppression on AbortError.** When the
 *      timeout wins the race, the abort fires and `llmPromise` later
 *      rejects with an AbortError. Since `Promise.race` has already
 *      resolved (via the timeout's rejection), the AbortError has
 *      nowhere to go and Node would otherwise emit an unhandled
 *      rejection warning. A separate `.catch` on `llmPromise` absorbs
 *      the AbortError silently.
 *
 *   3. **Late-rejection invariant detection.** If `llmPromise` rejects
 *      AFTER the race has already been decided by the timeout, with
 *      something OTHER than an AbortError, that means the LLM's
 *      cooperative cancellation didn't honor the abort signal — a
 *      load-bearing diagnostic signal that should reach operators via
 *      the structured log pipeline. A `raceDecidedByTimeout` flag
 *      gates the warn so it does NOT fire when the race itself rejected
 *      via `llmPromise` (in that case the outer caller sees the error
 *      directly and no "invariant broken" warning is warranted).
 *
 * The narrow `LlmCaller` interface means tests can pass
 * `{ generateResponse: vi.fn().mockResolvedValue(...) }` without
 * constructing a full `LLMInterface` or stubbing its dependency graph.
 *
 * @author @darianrosebrook
 */

import type { LLMResponse } from '../cognitive-core/llm-interface';
import { createServerLogger } from '../server-utils/server-logger';

/**
 * Minimal LLM interface for the race helper. Deliberately narrower than
 * the full `LLMInterface` so tests can mock with a one-method object.
 */
export interface LlmCaller {
  generateResponse(
    prompt: string,
    context: undefined,
    options: {
      signal: AbortSignal;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<LLMResponse>;
}

/**
 * Logger shape needed by `callLlmWithRaceTimeout`. Uses the inferred
 * return type of `createServerLogger` so the helper stays in sync with
 * the logger's actual surface without duplicating the interface definition.
 */
export type RaceLogger = ReturnType<typeof createServerLogger>;

/**
 * Options for `callLlmWithRaceTimeout`. These are the LLM generation
 * parameters plus the wall-clock `timeoutMs` for the race.
 */
export interface RaceWithTimeoutOptions {
  prompt: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

/**
 * Race an LLM call against a timeout with proper cleanup and late-
 * rejection detection.
 *
 * Behavior matrix:
 *
 *   | Scenario                              | Returns / Throws                                      | Emits warn? |
 *   |---------------------------------------|-------------------------------------------------------|-------------|
 *   | LLM resolves before timeout           | Returns LLMResponse                                   | No          |
 *   | LLM rejects (non-Abort) before timeout| Throws the LLM error                                  | No          |
 *   | Timeout fires, LLM then AbortErrors   | Throws 'LLM ... timed out'                            | No          |
 *   | Timeout fires, LLM then other errors  | Throws 'LLM ... timed out', warn observation_race_invariant_broken | Yes |
 *
 * Both timers are cleared in the `finally` block on every exit path.
 *
 * @param llm - Anything with a `generateResponse()` method. In production
 *              this is the module-scoped `LLMInterface` singleton; in
 *              tests it's a `vi.fn()`-backed fake.
 * @param options - Prompt + generation parameters + `timeoutMs`.
 * @param logger - A server logger instance (from `createServerLogger`).
 *                 In tests this can be a fake whose methods are spies.
 * @returns The LLM response on success.
 * @throws The LLM error if the LLM rejects before the timeout, or a
 *         timeout error if the timeout fires first.
 */
export async function callLlmWithRaceTimeout(
  llm: LlmCaller,
  options: RaceWithTimeoutOptions,
  logger: RaceLogger
): Promise<LLMResponse> {
  const abortController = new AbortController();
  const abortTimeoutId = setTimeout(
    () => abortController.abort(),
    options.timeoutMs
  );
  let raceTimeoutId: NodeJS.Timeout | null = null;

  // Flag gates the invariant-broken warn below so it only fires when
  // the race was ACTUALLY decided by the timeout (not when llmPromise
  // rejected first and the race propagated that rejection).
  let raceDecidedByTimeout = false;

  try {
    const llmPromise = llm.generateResponse(options.prompt, undefined, {
      systemPrompt: options.systemPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      signal: abortController.signal,
    });

    // Absorb late rejections on `llmPromise`. This handler fires for
    // every rejection, but only emits a warn when all three conditions
    // hold: the race was decided by the timeout, the error is NOT an
    // AbortError (AbortError after timeout is the expected unwind), and
    // there's a real diagnostic signal to capture.
    llmPromise.catch((e: unknown) => {
      if (!raceDecidedByTimeout) {
        // The race rejected via llmPromise itself — the outer await
        // already saw this error and the caller will handle it. No
        // need to double-log.
        return;
      }
      const name = e instanceof Error ? e.name : '';
      if (name === 'AbortError') {
        // Expected: timeout fired, abort propagated, LLM unwound.
        return;
      }
      // Race was already decided by the timeout, and llmPromise STILL
      // rejected with a non-AbortError. That means the LLM's cooperative
      // cancellation did not honor our abort signal — load-bearing
      // diagnostic signal worth surfacing.
      logger.warn(
        'Unexpected late rejection from llmPromise after race resolved',
        {
          event: 'observation_race_invariant_broken',
          tags: ['observation', 'llm', 'race', 'warn'],
          fields: {
            error: e instanceof Error ? e.message : String(e),
            errorName: e instanceof Error ? e.name : undefined,
          },
        }
      );
    });

    const timeoutPromise = new Promise<LLMResponse>((_, reject) => {
      raceTimeoutId = setTimeout(() => {
        raceDecidedByTimeout = true;
        reject(new Error('LLM observation reasoning timed out'));
      }, options.timeoutMs);
    });

    return await Promise.race<LLMResponse>([llmPromise, timeoutPromise]);
  } finally {
    clearTimeout(abortTimeoutId);
    if (raceTimeoutId) clearTimeout(raceTimeoutId);
  }
}
