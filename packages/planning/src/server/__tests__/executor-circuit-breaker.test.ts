/**
 * Tests for executor-circuit-breaker.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  tripCircuitBreaker,
  recordSuccess,
  isCircuitBreakerOpen,
  getCircuitBreakerState,
  _resetCircuitBreaker,
  _getSuccessStreak,
} from '../executor-circuit-breaker';

describe('executor-circuit-breaker', () => {
  beforeEach(() => {
    _resetCircuitBreaker();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('is closed initially', () => {
      expect(isCircuitBreakerOpen()).toBe(false);
    });

    it('has zero trip count initially', () => {
      expect(getCircuitBreakerState().tripCount).toBe(0);
    });

    it('has null lastError initially', () => {
      expect(getCircuitBreakerState().lastError).toBeNull();
    });
  });

  describe('tripCircuitBreaker', () => {
    it('opens the circuit breaker', () => {
      tripCircuitBreaker('Bot disconnected');
      expect(isCircuitBreakerOpen()).toBe(true);
    });

    it('increments trip count', () => {
      tripCircuitBreaker('Error 1');
      expect(getCircuitBreakerState().tripCount).toBe(1);
      tripCircuitBreaker('Error 2');
      expect(getCircuitBreakerState().tripCount).toBe(2);
    });

    it('stores the last error message', () => {
      tripCircuitBreaker('Network timeout');
      expect(getCircuitBreakerState().lastError).toBe('Network timeout');
    });

    it('sets resumeAt to a future timestamp', () => {
      const before = Date.now();
      tripCircuitBreaker('Test error');
      const state = getCircuitBreakerState();
      expect(state.resumeAt).toBeGreaterThan(before);
    });

    it('returns the backoff duration', () => {
      const backoff = tripCircuitBreaker('Error');
      expect(backoff).toBe(5000); // Initial backoff is 5s
    });

    it('resets success streak', () => {
      recordSuccess();
      recordSuccess();
      expect(_getSuccessStreak()).toBe(2);
      tripCircuitBreaker('Error');
      expect(_getSuccessStreak()).toBe(0);
    });
  });

  describe('backoff timing', () => {
    it('closes after backoff expires (using fake timers)', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      tripCircuitBreaker('Network timeout');
      expect(isCircuitBreakerOpen()).toBe(true);

      // Advance past the 5s initial backoff
      vi.advanceTimersByTime(6_000);
      expect(isCircuitBreakerOpen()).toBe(false);
    });

    it('remains open before backoff expires', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      tripCircuitBreaker('Network timeout');

      // 3 seconds is still within 5s backoff
      vi.advanceTimersByTime(3_000);
      expect(isCircuitBreakerOpen()).toBe(true);
    });
  });

  describe('exponential backoff', () => {
    it('increases backoff with trip count', () => {
      const backoff1 = tripCircuitBreaker('Error 1');
      expect(backoff1).toBe(5_000);

      const backoff2 = tripCircuitBreaker('Error 2');
      expect(backoff2).toBe(10_000);

      const backoff3 = tripCircuitBreaker('Error 3');
      expect(backoff3).toBe(20_000);

      const backoff4 = tripCircuitBreaker('Error 4');
      expect(backoff4).toBe(40_000);
    });

    it('caps backoff at MAX_BACKOFF_MS (60s)', () => {
      // Trip 5 times: 5s, 10s, 20s, 40s, 60s (capped)
      tripCircuitBreaker('E1');
      tripCircuitBreaker('E2');
      tripCircuitBreaker('E3');
      tripCircuitBreaker('E4');
      const backoff5 = tripCircuitBreaker('E5');
      expect(backoff5).toBe(60_000);

      // Further trips should stay at 60s
      const backoff6 = tripCircuitBreaker('E6');
      expect(backoff6).toBe(60_000);
    });
  });

  describe('recordSuccess', () => {
    it('closes the circuit breaker', () => {
      tripCircuitBreaker('Error');
      expect(getCircuitBreakerState().tripped).toBe(true);

      recordSuccess();
      expect(getCircuitBreakerState().tripped).toBe(false);
    });

    it('clears resumeAt', () => {
      tripCircuitBreaker('Error');
      expect(getCircuitBreakerState().resumeAt).not.toBeNull();

      recordSuccess();
      expect(getCircuitBreakerState().resumeAt).toBeNull();
    });

    it('resets trip count after 3 consecutive successes', () => {
      tripCircuitBreaker('Error');
      expect(getCircuitBreakerState().tripCount).toBe(1);

      recordSuccess();
      expect(getCircuitBreakerState().tripCount).toBe(1); // Not reset yet

      recordSuccess();
      expect(getCircuitBreakerState().tripCount).toBe(1); // Not reset yet

      recordSuccess();
      expect(getCircuitBreakerState().tripCount).toBe(0); // Reset!
    });

    it('clears lastError after 3 consecutive successes', () => {
      tripCircuitBreaker('Test error');
      expect(getCircuitBreakerState().lastError).toBe('Test error');

      recordSuccess();
      recordSuccess();
      recordSuccess();

      expect(getCircuitBreakerState().lastError).toBeNull();
    });

    it('success streak resets on new trip', () => {
      tripCircuitBreaker('Error');
      recordSuccess();
      recordSuccess();
      expect(_getSuccessStreak()).toBe(2);

      tripCircuitBreaker('Error 2');
      expect(_getSuccessStreak()).toBe(0);

      recordSuccess();
      expect(_getSuccessStreak()).toBe(1);
      // Only 1 success since last trip, tripCount should not reset
      expect(getCircuitBreakerState().tripCount).toBe(2);
    });

    it('does not reset trip count if there were no trips', () => {
      recordSuccess();
      recordSuccess();
      recordSuccess();
      // tripCount was already 0, should stay 0
      expect(getCircuitBreakerState().tripCount).toBe(0);
    });
  });

  describe('getCircuitBreakerState', () => {
    it('returns a copy (mutations do not affect internal state)', () => {
      tripCircuitBreaker('Error');
      const state1 = getCircuitBreakerState();
      const state2 = getCircuitBreakerState();

      // Mutate the returned object
      (state1 as any).tripCount = 999;

      // Internal state should be unchanged
      expect(state2.tripCount).toBe(1);
      expect(getCircuitBreakerState().tripCount).toBe(1);
    });
  });

  describe('isCircuitBreakerOpen with injectable time', () => {
    it('accepts a custom nowMs parameter', () => {
      const tripTime = 1000000;
      vi.useFakeTimers();
      vi.setSystemTime(tripTime);

      tripCircuitBreaker('Error');
      const state = getCircuitBreakerState();

      // At trip time, should be open
      expect(isCircuitBreakerOpen(tripTime)).toBe(true);

      // 3 seconds later, still open
      expect(isCircuitBreakerOpen(tripTime + 3_000)).toBe(true);

      // 6 seconds later, should be closed (past 5s backoff)
      expect(isCircuitBreakerOpen(tripTime + 6_000)).toBe(false);
    });
  });

  describe('_resetCircuitBreaker', () => {
    it('resets all state', () => {
      tripCircuitBreaker('Error');
      recordSuccess();
      recordSuccess();

      _resetCircuitBreaker();

      const state = getCircuitBreakerState();
      expect(state.tripped).toBe(false);
      expect(state.trippedAt).toBeNull();
      expect(state.tripCount).toBe(0);
      expect(state.lastError).toBeNull();
      expect(state.resumeAt).toBeNull();
      expect(_getSuccessStreak()).toBe(0);
    });
  });
});
