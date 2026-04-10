/**
 * Regression tests for the SSE keepalive helper extracted from
 * cognitive-stream-routes.ts.
 *
 * The `startSseKeepalive` function is a per-client loop that writes an SSE
 * comment frame (`: keepalive\n\n`) every `intervalMs` milliseconds, and
 * on write failure logs a debug event, clears its own interval, and
 * notifies the caller via the onUnrecoverableError callback so the caller
 * can remove the client from its connection set.
 *
 * Prior to this extraction the logic was an inline `setInterval` body in
 * the SSE route handler, which made it impossible to unit-test the error
 * path without spinning up Express and a real HTTP client. After
 * extraction the helper takes a minimal `SseWritable` interface (just
 * `write`) plus a cleanup callback, and accepts a test-controlled
 * `intervalMs` so vitest's fake timers can advance the loop
 * deterministically.
 *
 * What these tests fence
 *  1. The happy path: `write` is called repeatedly across multiple ticks,
 *     neither the logger nor the cleanup callback fires.
 *  2. The error path: when `write` throws, exactly one debug log is
 *     emitted with `event: 'sse_keepalive_write_failed'` and the correct
 *     tags/fields shape, the cleanup callback is called exactly once, and
 *     no further `write` calls occur on subsequent ticks (i.e., the
 *     interval was actually stopped, not just the log emitted).
 *  3. External cleanup: if the route handler calls `clearInterval` on the
 *     returned handle (which it does in `req.on('close')`), the loop
 *     stops and no further activity occurs.
 *
 * NAMING NOTE: "keepalive" here refers to the SSE protocol comment-frame
 * mechanism. It has nothing to do with the `packages/cognition/src/keep-alive/`
 * directory (which is a separate, unrelated bot-idle goal-emission subsystem
 * currently under quarantine review). See the banner comment at the top of
 * cognitive-stream-routes.ts for the full disambiguation.
 *
 * @author @darianrosebrook
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted logger spies — same pattern used by the other error-handling
// tests added in this session. vi.hoisted() ensures these exist when the
// hoisted vi.mock factory runs below.
const { debugSpy, infoSpy, warnSpy, errorSpy } = vi.hoisted(() => ({
  debugSpy: vi.fn(),
  infoSpy: vi.fn(),
  warnSpy: vi.fn(),
  errorSpy: vi.fn(),
}));

vi.mock('../../server-utils/server-logger', () => ({
  createServerLogger: () => ({
    debug: debugSpy,
    info: infoSpy,
    warn: warnSpy,
    error: errorSpy,
  }),
}));

import {
  startSseKeepalive,
  SSE_KEEPALIVE_INTERVAL_MS,
  type SseWritable,
} from '../cognitive-stream-routes';

// A small test-local interval so we don't need to advance virtual time by
// the production default of 30 seconds per tick. 100ms keeps the assertions
// readable and the numbers small.
const TEST_INTERVAL_MS = 100;

describe('startSseKeepalive', () => {
  beforeEach(() => {
    debugSpy.mockClear();
    infoSpy.mockClear();
    warnSpy.mockClear();
    errorSpy.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Restore real timers so other tests in the file (and the suite) are
    // not affected. vi.useFakeTimers() in beforeEach re-installs them.
    vi.useRealTimers();
  });

  describe('happy path', () => {
    it('writes a keepalive comment frame on every tick without logging or calling the cleanup', () => {
      const writeSpy = vi.fn().mockReturnValue(true);
      const cleanupSpy = vi.fn();
      const writable: SseWritable = { write: writeSpy };

      const handle = startSseKeepalive(writable, cleanupSpy, TEST_INTERVAL_MS);

      // Nothing should happen before the first tick elapses.
      expect(writeSpy).not.toHaveBeenCalled();

      // Advance past the first tick boundary.
      vi.advanceTimersByTime(TEST_INTERVAL_MS);
      expect(writeSpy).toHaveBeenCalledTimes(1);
      expect(writeSpy).toHaveBeenLastCalledWith(': keepalive\n\n');

      // Advance past two more ticks — 3 total.
      vi.advanceTimersByTime(TEST_INTERVAL_MS * 2);
      expect(writeSpy).toHaveBeenCalledTimes(3);

      // No logging, no cleanup.
      expect(debugSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
      expect(cleanupSpy).not.toHaveBeenCalled();

      // Teardown: stop the interval so we don't leak it into the next test.
      clearInterval(handle);
    });

    it('uses the documented default interval when intervalMs is omitted', () => {
      const writeSpy = vi.fn().mockReturnValue(true);
      const cleanupSpy = vi.fn();
      const writable: SseWritable = { write: writeSpy };

      const handle = startSseKeepalive(writable, cleanupSpy);

      // Just before the documented default (30s) — should not have ticked.
      vi.advanceTimersByTime(SSE_KEEPALIVE_INTERVAL_MS - 1);
      expect(writeSpy).not.toHaveBeenCalled();

      // Cross the boundary.
      vi.advanceTimersByTime(1);
      expect(writeSpy).toHaveBeenCalledTimes(1);

      clearInterval(handle);
    });
  });

  describe('error path — unclean client disconnect', () => {
    it('logs sse_keepalive_write_failed, calls cleanup once, and stops the interval', () => {
      // A write-throwing spy: every call throws the same unclean-disconnect
      // error the handler is supposed to tolerate. Using a named subclass
      // lets the error have a distinctive `name` field (which the handler
      // captures into `fields.errorName`) so we can verify forensic
      // propagation.
      class TcpResetError extends Error {
        override name = 'TcpResetError';
      }
      const writeError = new TcpResetError(
        'write EPIPE: client closed connection'
      );
      const writeSpy = vi.fn(() => {
        throw writeError;
      });
      const cleanupSpy = vi.fn();
      const writable: SseWritable = { write: writeSpy };

      const handle = startSseKeepalive(writable, cleanupSpy, TEST_INTERVAL_MS);

      // Advance past the first tick — this should throw inside the
      // interval callback and hit the catch block.
      vi.advanceTimersByTime(TEST_INTERVAL_MS);

      // 1. write was attempted exactly once.
      expect(writeSpy).toHaveBeenCalledTimes(1);

      // 2. debug log fired exactly once with the correct observability
      // contract — event name, tags, and error context including both the
      // error message and the error.name.
      expect(debugSpy).toHaveBeenCalledTimes(1);
      const [message, context] = debugSpy.mock.calls[0];
      expect(message).toContain('SSE keepalive write failed');
      expect(context).toMatchObject({
        event: 'sse_keepalive_write_failed',
        tags: ['sse', 'keepalive', 'debug'],
      });
      expect(context.fields.error).toContain('write EPIPE');
      expect(context.fields.errorName).toBe('TcpResetError');

      // 3. cleanup callback was called exactly once.
      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      // 4. CRITICAL: the interval was actually stopped. Advance time by
      // several more intervals and confirm `write` is not called again and
      // neither the debug log nor the cleanup fires a second time. This
      // is the load-bearing assertion that proves `clearInterval` ran —
      // without this, a regression where the error path forgot to clear
      // would pass the first three assertions but leak the interval.
      vi.advanceTimersByTime(TEST_INTERVAL_MS * 5);
      expect(writeSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      // Defensive teardown — if the interval was correctly cleared above,
      // this is a no-op; if it wasn't, it prevents leakage into the next test.
      clearInterval(handle);
    });

    it('captures non-Error thrown values without crashing', () => {
      // Paranoia: if something inside res.write() throws a string or other
      // non-Error value (rare but legal in JavaScript), the helper should
      // still fall into the catch, log, and clean up. The `error` field
      // becomes `String(value)` in that case and `errorName` is undefined.
      const cleanupSpy = vi.fn();
      const writable: SseWritable = {
        write: vi.fn(() => {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw 'socket gone';
        }),
      };

      const handle = startSseKeepalive(writable, cleanupSpy, TEST_INTERVAL_MS);
      vi.advanceTimersByTime(TEST_INTERVAL_MS);

      expect(debugSpy).toHaveBeenCalledTimes(1);
      const [, context] = debugSpy.mock.calls[0];
      expect(context.fields.error).toBe('socket gone');
      expect(context.fields.errorName).toBeUndefined();
      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      clearInterval(handle);
    });
  });

  describe('external cleanup — req.on("close") path', () => {
    it('stops writing after the caller clears the returned interval handle', () => {
      // The route handler calls `clearInterval(keepaliveInterval)` in its
      // `req.on('close', ...)` listener when the client closes the
      // connection normally. This test simulates that path: start the
      // keepalive, let a few ticks happen, then clearInterval externally
      // and verify no further writes occur.
      const writeSpy = vi.fn().mockReturnValue(true);
      const cleanupSpy = vi.fn();
      const writable: SseWritable = { write: writeSpy };

      const handle = startSseKeepalive(writable, cleanupSpy, TEST_INTERVAL_MS);

      vi.advanceTimersByTime(TEST_INTERVAL_MS * 2);
      expect(writeSpy).toHaveBeenCalledTimes(2);

      // Route handler invokes clearInterval externally on clean disconnect.
      clearInterval(handle);

      vi.advanceTimersByTime(TEST_INTERVAL_MS * 10);
      // No additional writes after clearInterval.
      expect(writeSpy).toHaveBeenCalledTimes(2);
      // The error-path cleanup callback must NOT fire on a clean close —
      // that callback is reserved for unclean disconnects (where the
      // helper decides the client is gone). Clean closes are the caller's
      // responsibility.
      expect(cleanupSpy).not.toHaveBeenCalled();
      // And no logging on a clean close either.
      expect(debugSpy).not.toHaveBeenCalled();
    });
  });
});
