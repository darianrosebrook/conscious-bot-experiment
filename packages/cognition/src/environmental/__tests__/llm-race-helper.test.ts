/**
 * Regression tests for callLlmWithRaceTimeout.
 *
 * This helper wraps `llm.generateResponse()` with a wall-clock timeout
 * race backed by an AbortController. Prior to its extraction from
 * ObservationReasoner.reason(), the race/abort/timeout/invariant-detect
 * triad was inlined with no testable seam, and the `observation_race_
 * invariant_broken` warn path was typecheck-only.
 *
 * What these tests fence
 *
 *  1. Happy path: LLM resolves before timeout → helper returns the
 *     response, no warn fires, no timers leak.
 *
 *  2. Error path (pre-timeout): LLM rejects with a non-Abort error BEFORE
 *     the timeout fires → helper re-throws the LLM error, no warn fires
 *     (this is the subtle one — the inline `.catch` handler on `llmPromise`
 *     DOES observe the rejection, but the `raceDecidedByTimeout` gate
 *     prevents a spurious duplicate warn).
 *
 *  3. Timeout path with AbortError unwind: timeout fires, race rejects
 *     with 'timed out', then llmPromise later rejects with AbortError →
 *     helper re-throws 'timed out', and the late AbortError is absorbed
 *     silently by the inline `.catch` (no warn).
 *
 *  4. Timeout path with INVARIANT BROKEN: timeout fires, race rejects
 *     with 'timed out', then llmPromise later rejects with a non-Abort
 *     error → helper re-throws 'timed out' AND the inline `.catch`
 *     emits `observation_race_invariant_broken` with the error message
 *     and name as fields. THIS IS THE LOAD-BEARING ASSERTION.
 *
 *  5. Timer cleanup invariant: all exit paths clear both timers. Verified
 *     via `vi.getTimerCount() === 0` after each scenario.
 *
 * Strategy: vi.useFakeTimers() for deterministic control of both the
 * abort timer and the race timer. The LLM is mocked with a
 * manually-controlled promise (captured `resolve` / `reject` closures)
 * so we can decide WHEN and WITH WHAT it settles, independent of the
 * timer advance.
 *
 * @author @darianrosebrook
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callLlmWithRaceTimeout,
  type LlmCaller,
  type RaceWithTimeoutOptions,
} from '../llm-race-helper';
import type { LLMResponse } from '../../cognitive-core/llm-interface';

/**
 * Minimal fake LLMResponse. The helper only touches the promise shape;
 * the response contents are opaque to it, so a minimal object is fine.
 */
function makeLlmResponse(text: string): LLMResponse {
  return {
    id: 'test-response',
    text,
    model: 'test-model',
    tokensUsed: 0,
    latency: 0,
    confidence: 0.8,
    metadata: {
      finishReason: 'stop',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    },
  };
}

/**
 * A minimal logger fake whose methods are vi.fn spies. We pass this
 * directly to the helper so assertions are local to the test scope.
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
 * Helper: build an LlmCaller whose generateResponse returns a promise
 * we can settle manually from the test. Returns both the caller and
 * the resolve/reject functions so the test can decide when the LLM
 * "responds".
 */
function makeDeferredLlm() {
  let resolveFn: (value: LLMResponse) => void = () => {};
  let rejectFn: (reason?: unknown) => void = () => {};
  const generateResponse = vi.fn().mockImplementation(
    () =>
      new Promise<LLMResponse>((resolve, reject) => {
        resolveFn = resolve;
        rejectFn = reject;
      })
  );
  const llm: LlmCaller = { generateResponse };
  return {
    llm,
    resolve: (value: LLMResponse) => resolveFn(value),
    reject: (reason?: unknown) => rejectFn(reason),
    generateResponse,
  };
}

const DEFAULT_OPTIONS: RaceWithTimeoutOptions = {
  prompt: 'test prompt',
  systemPrompt: 'test system',
  temperature: 0.5,
  maxTokens: 200,
  timeoutMs: 1000,
};

describe('callLlmWithRaceTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('happy path — LLM resolves before timeout', () => {
    it('returns the LLM response, clears both timers, and does not log', async () => {
      const { llm, resolve } = makeDeferredLlm();
      const logger = makeLoggerFake();

      const promise = callLlmWithRaceTimeout(llm, DEFAULT_OPTIONS, logger);

      // Settle the LLM immediately (well before the 1000ms timeout).
      resolve(makeLlmResponse('hello world'));

      const result = await promise;
      expect(result.text).toBe('hello world');

      // No warn of any kind for the happy path.
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();

      // Both timers cleared — abortTimeoutId and raceTimeoutId.
      expect(vi.getTimerCount()).toBe(0);
    });

    it('forwards prompt, system prompt, and generation options to the LLM', async () => {
      const { llm, resolve, generateResponse } = makeDeferredLlm();
      const logger = makeLoggerFake();

      const promise = callLlmWithRaceTimeout(
        llm,
        {
          prompt: 'observe the wolf',
          systemPrompt: 'you are an observer',
          temperature: 0.2,
          maxTokens: 500,
          timeoutMs: 1000,
        },
        logger
      );
      resolve(makeLlmResponse('ok'));
      await promise;

      expect(generateResponse).toHaveBeenCalledTimes(1);
      const [prompt, context, options] = generateResponse.mock.calls[0];
      expect(prompt).toBe('observe the wolf');
      expect(context).toBeUndefined();
      expect(options.systemPrompt).toBe('you are an observer');
      expect(options.temperature).toBe(0.2);
      expect(options.maxTokens).toBe(500);
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('error path — LLM rejects before timeout', () => {
    it('propagates the LLM error and does NOT fire invariant-broken warn', async () => {
      // This is the subtle test. The inline `.catch` on llmPromise DOES
      // observe the rejection (because .catch returns a new promise and
      // doesn't mutate the original), but the raceDecidedByTimeout flag
      // gates the warn so we don't get a spurious duplicate.
      const { llm, reject } = makeDeferredLlm();
      const logger = makeLoggerFake();

      const promise = callLlmWithRaceTimeout(llm, DEFAULT_OPTIONS, logger);
      reject(new Error('LLM backend 503'));

      await expect(promise).rejects.toThrow('LLM backend 503');

      // Critical: no warn, because the race was decided by the LLM's
      // own rejection, not by the timeout.
      expect(logger.warn).not.toHaveBeenCalled();

      // Both timers cleared.
      expect(vi.getTimerCount()).toBe(0);
    });

    it('does not emit warn when LLM rejects with AbortError before timeout', async () => {
      // Unusual but legal: the LLM aborts itself before our timeout fires.
      // Still no warn — only post-timeout non-Abort rejections count.
      const { llm, reject } = makeDeferredLlm();
      const logger = makeLoggerFake();

      const abortError = new Error('aborted by caller');
      abortError.name = 'AbortError';

      const promise = callLlmWithRaceTimeout(llm, DEFAULT_OPTIONS, logger);
      reject(abortError);

      await expect(promise).rejects.toThrow('aborted by caller');
      expect(logger.warn).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('timeout path — timeoutPromise wins the race', () => {
    it('throws the timeout error after advancing past timeoutMs', async () => {
      const { llm } = makeDeferredLlm();
      const logger = makeLoggerFake();

      const promise = callLlmWithRaceTimeout(llm, DEFAULT_OPTIONS, logger);

      // Attach a rejection handler BEFORE advancing timers, so the
      // rejection is observed synchronously with the timer fire. Without
      // this, the unhandled-rejection between advance and await can
      // cause vitest to flag a false positive.
      const assertion = expect(promise).rejects.toThrow(
        'LLM observation reasoning timed out'
      );

      await vi.advanceTimersByTimeAsync(1000);
      await assertion;

      // At this point the race has been decided by the timeout. The
      // llmPromise is still pending (we never resolved/rejected it
      // from the test), so the inline `.catch` handler has not fired
      // yet, and no warn has been emitted.
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('absorbs late AbortError silently (no warn, no unhandled rejection)', async () => {
      const { llm, reject } = makeDeferredLlm();
      const logger = makeLoggerFake();

      const promise = callLlmWithRaceTimeout(llm, DEFAULT_OPTIONS, logger);
      const assertion = expect(promise).rejects.toThrow(
        'LLM observation reasoning timed out'
      );
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;

      // Race already decided by timeout. Now the LLM "notices" the
      // abort and rejects with AbortError (the expected unwind).
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      reject(abortError);

      // Flush the microtask queue so the inline `.catch` handler runs.
      await Promise.resolve();
      await Promise.resolve();

      // AbortError after timeout is the expected unwind — no warn.
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('emits observation_race_invariant_broken when late rejection is NOT AbortError', async () => {
      // LOAD-BEARING ASSERTION for item 1b: the invariant-broken safety
      // net fires when the LLM's cooperative cancellation fails to honor
      // the abort signal and the promise later rejects with a real error
      // instead of AbortError. This is the exact diagnostic signal the
      // inline .catch was originally added to capture but could not test.
      const { llm, reject } = makeDeferredLlm();
      const logger = makeLoggerFake();

      const promise = callLlmWithRaceTimeout(llm, DEFAULT_OPTIONS, logger);
      const assertion = expect(promise).rejects.toThrow(
        'LLM observation reasoning timed out'
      );
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;

      // Race decided by timeout. Now the LLM rejects with a real error
      // AFTER the race has already been won by the timeout — this is
      // the broken invariant. The LLM should have aborted cleanly but
      // instead rejected with a network error.
      const realError = new Error('connection reset by peer');
      reject(realError);

      // Flush microtasks so the inline `.catch` handler runs.
      await Promise.resolve();
      await Promise.resolve();

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [message, context] = logger.warn.mock.calls[0];
      expect(message).toBe(
        'Unexpected late rejection from llmPromise after race resolved'
      );
      expect(context).toMatchObject({
        event: 'observation_race_invariant_broken',
        tags: ['observation', 'llm', 'race', 'warn'],
      });
      expect(context.fields.error).toBe('connection reset by peer');
      expect(context.fields.errorName).toBe('Error');
    });

    it('handles non-Error late rejection (string) via String() fallback', async () => {
      // Paranoid edge case: `throw 'some string'` after the race resolved.
      // The fields.error should be the stringified value and errorName
      // should be undefined (non-Errors have no name).
      const { llm, reject } = makeDeferredLlm();
      const logger = makeLoggerFake();

      const promise = callLlmWithRaceTimeout(llm, DEFAULT_OPTIONS, logger);
      const assertion = expect(promise).rejects.toThrow(
        'LLM observation reasoning timed out'
      );
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;

      reject('raw string rejection');
      await Promise.resolve();
      await Promise.resolve();

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [, context] = logger.warn.mock.calls[0];
      expect(context.fields.error).toBe('raw string rejection');
      expect(context.fields.errorName).toBeUndefined();
    });
  });

  describe('timer cleanup invariant', () => {
    it('clears both timers on happy-path exit', async () => {
      const { llm, resolve } = makeDeferredLlm();
      const logger = makeLoggerFake();

      const promise = callLlmWithRaceTimeout(llm, DEFAULT_OPTIONS, logger);
      resolve(makeLlmResponse('ok'));
      await promise;

      expect(vi.getTimerCount()).toBe(0);
    });

    it('clears both timers on error-path exit', async () => {
      const { llm, reject } = makeDeferredLlm();
      const logger = makeLoggerFake();

      const promise = callLlmWithRaceTimeout(llm, DEFAULT_OPTIONS, logger);
      reject(new Error('boom'));
      await expect(promise).rejects.toThrow('boom');

      expect(vi.getTimerCount()).toBe(0);
    });

    it('clears the abort timer on timeout-path exit', async () => {
      // After the timeout fires, the race-timer has already fired (so
      // its slot is free), and the finally block clears the abort timer.
      // Net: both timer slots free.
      const { llm } = makeDeferredLlm();
      const logger = makeLoggerFake();

      const promise = callLlmWithRaceTimeout(llm, DEFAULT_OPTIONS, logger);
      const assertion = expect(promise).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
