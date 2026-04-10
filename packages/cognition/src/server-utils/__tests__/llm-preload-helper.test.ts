/**
 * Regression tests for preloadLlmWithLogging.
 *
 * This helper wraps `llm.preloadModel()` with structured failure logging
 * and always-resolves semantics. Prior to its extraction (see commit
 * 0e8f053 and earlier), the preload call was buried inside a setTimeout
 * inside app.listen's callback inside a .then() branch, with no unit-
 * testable seam. Commit 242c702 added a structured warn log to the
 * inline `.catch()` but could not test it — this file closes that gap.
 *
 * What these tests fence
 *  1. Happy path: when `preloadModel()` resolves, no log is emitted.
 *  2. Error path — Error instance: when `preloadModel()` rejects with a
 *     normal Error, the helper emits `llm_preload_failed` with the
 *     error message in `fields.error` and the returned promise resolves
 *     (does NOT propagate the rejection).
 *  3. Error path — non-Error thrown value: when `preloadModel()` rejects
 *     with a string or other non-Error, the `String(e)` fallback path
 *     emits the stringified value and the helper still resolves cleanly.
 *  4. Contract: the returned promise ALWAYS resolves and never rejects,
 *     so production callers can fire-and-forget without worrying about
 *     unhandled rejections.
 *
 * Strategy: vi.hoisted + vi.mock on `../server-logger` captures the
 * warn spy at module load time, then the helper is imported fresh and
 * exercised with a minimal `{ preloadModel: vi.fn() }` fake as the llm
 * argument. The narrow `Pick<LLMInterface, 'preloadModel'>` parameter
 * type means we do not need to construct a full LLMInterface.
 *
 * @author @darianrosebrook
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { warnSpy, debugSpy, infoSpy, errorSpy } = vi.hoisted(() => ({
  warnSpy: vi.fn(),
  debugSpy: vi.fn(),
  infoSpy: vi.fn(),
  errorSpy: vi.fn(),
}));

vi.mock('../server-logger', () => ({
  createServerLogger: () => ({
    debug: debugSpy,
    info: infoSpy,
    warn: warnSpy,
    error: errorSpy,
  }),
}));

import { preloadLlmWithLogging } from '../llm-preload-helper';

/**
 * A minimal logger fake that matches the shape `preloadLlmWithLogging`
 * expects. In most tests we pass this directly so the spies are easy to
 * reason about. The vi.mock on `../server-logger` above is not strictly
 * required for any test in this file (we pass the logger explicitly),
 * but it's harmless and keeps the pattern consistent with other error-
 * handling tests in the suite.
 */
function makeLoggerFake() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('preloadLlmWithLogging', () => {
  beforeEach(() => {
    warnSpy.mockClear();
    debugSpy.mockClear();
    infoSpy.mockClear();
    errorSpy.mockClear();
  });

  describe('happy path', () => {
    it('resolves silently and does not emit any log when preloadModel resolves', async () => {
      const llm = { preloadModel: vi.fn().mockResolvedValue(undefined) };
      const logger = makeLoggerFake();

      await preloadLlmWithLogging(llm, logger);

      // The LLM was actually asked to preload.
      expect(llm.preloadModel).toHaveBeenCalledTimes(1);

      // No log of any level was emitted — silence is the happy-path contract.
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
    });
  });

  describe('error path — Error instance', () => {
    it('emits llm_preload_failed with the error message and resolves without rethrowing', async () => {
      const boom = new Error('model server returned 503');
      const llm = { preloadModel: vi.fn().mockRejectedValue(boom) };
      const logger = makeLoggerFake();

      // The returned promise must resolve, NOT reject. If this line threw,
      // we'd have a fire-and-forget footgun in production.
      await expect(preloadLlmWithLogging(llm, logger)).resolves.toBeUndefined();

      // preloadModel was attempted once.
      expect(llm.preloadModel).toHaveBeenCalledTimes(1);

      // The warn log fired exactly once with the full observability contract.
      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [message, context] = logger.warn.mock.calls[0];
      expect(message).toBe('LLM preload failed');
      expect(context).toMatchObject({
        event: 'llm_preload_failed',
        tags: ['llm', 'preload', 'warn'],
      });
      expect(context.fields.error).toBe('model server returned 503');

      // And no other log levels were touched.
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('preserves the full error message via e.message, not via String(e)', async () => {
      // A subtle behavior check: if someone refactored the helper to use
      // `String(error)` unconditionally, a normal Error would log as
      // `"Error: model server returned 503"` (the default Error#toString
      // format) instead of just `"model server returned 503"`. This test
      // fences the `error instanceof Error ? error.message : String(error)`
      // branch by asserting the message does NOT start with "Error:".
      const boom = new Error('model server returned 503');
      const llm = { preloadModel: vi.fn().mockRejectedValue(boom) };
      const logger = makeLoggerFake();

      await preloadLlmWithLogging(llm, logger);

      const [, context] = logger.warn.mock.calls[0];
      expect(context.fields.error).not.toMatch(/^Error:/);
      expect(context.fields.error).toBe('model server returned 503');
    });
  });

  describe('error path — non-Error thrown value', () => {
    it('falls back to String(value) when preloadModel rejects with a string', async () => {
      // Legal JavaScript: `throw 'some string'` or
      // `Promise.reject('some string')`. Rare in well-written code, but
      // real — and the helper's `error instanceof Error ? ... : String(error)`
      // branch exists specifically to handle it without crashing.
      const llm = { preloadModel: vi.fn().mockRejectedValue('backend offline') };
      const logger = makeLoggerFake();

      await expect(preloadLlmWithLogging(llm, logger)).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [, context] = logger.warn.mock.calls[0];
      expect(context.fields.error).toBe('backend offline');
    });

    it('falls back to String(value) when preloadModel rejects with a number', async () => {
      // Even stranger: `throw 42` is legal. Proves the String() fallback
      // handles anything coercible.
      const llm = { preloadModel: vi.fn().mockRejectedValue(42) };
      const logger = makeLoggerFake();

      await expect(preloadLlmWithLogging(llm, logger)).resolves.toBeUndefined();

      const [, context] = logger.warn.mock.calls[0];
      expect(context.fields.error).toBe('42');
    });
  });

  describe('fire-and-forget contract', () => {
    it('never rejects even when preloadModel rejects with a custom error subclass', async () => {
      // The production call site does `void preloadLlmWithLogging(...)` —
      // a fire-and-forget pattern that assumes the returned promise will
      // not reject. This test is the load-bearing assertion for that
      // contract: if the helper ever starts propagating rejections, this
      // test fails and the production fire-and-forget becomes a silent
      // unhandled-rejection generator.
      class LlmBackendDownError extends Error {
        override name = 'LlmBackendDownError';
      }
      const boom = new LlmBackendDownError('connection refused');
      const llm = { preloadModel: vi.fn().mockRejectedValue(boom) };
      const logger = makeLoggerFake();

      let rejected = false;
      try {
        await preloadLlmWithLogging(llm, logger);
      } catch {
        rejected = true;
      }

      expect(rejected).toBe(false);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [, context] = logger.warn.mock.calls[0];
      expect(context.fields.error).toBe('connection refused');
    });
  });
});
