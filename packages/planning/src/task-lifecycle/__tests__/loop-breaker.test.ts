/**
 * Tests for LoopBreaker — signature-based failure loop detection.
 *
 * Verifies: per-task dedup, threshold detection, window expiry,
 * suppression lifecycle, shadow mode behavior, LRU eviction,
 * and episode schema.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoopBreaker, type LoopBreakerConfig } from '../loop-breaker';
import { buildFailureSignature } from '../failure-signature';

function makeSig(leaf?: string, targetParam?: string) {
  return buildFailureSignature({
    category: 'tool_failure',
    leaf: leaf ?? 'collect_items',
    targetParam,
    diagReasonCode: 'no_item_entities',
  });
}

describe('LoopBreaker', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('recordFailure', () => {
    it('returns null when below threshold', () => {
      const lb = new LoopBreaker({ threshold: 3, shadowMode: true });
      const sig = makeSig();

      expect(lb.recordFailure(sig, { taskId: 'task-1' })).toBeNull();
      expect(lb.recordFailure(sig, { taskId: 'task-2' })).toBeNull();
    });

    it('returns episode when threshold is reached', () => {
      const lb = new LoopBreaker({ threshold: 3, shadowMode: true });
      const sig = makeSig();

      lb.recordFailure(sig, { taskId: 'task-1' });
      lb.recordFailure(sig, { taskId: 'task-2' });
      const episode = lb.recordFailure(sig, { taskId: 'task-3' });

      expect(episode).not.toBeNull();
      expect(episode!._schema).toBe('loop_detected_episode_v1');
      expect(episode!.signatureId).toBe(sig.signatureId);
      expect(episode!.occurrences).toBe(3);
      expect(episode!.contributingTaskIds).toEqual(['task-1', 'task-2', 'task-3']);
      expect(episode!.shadowMode).toBe(true);
      expect(episode!.suppressedUntil).toBeGreaterThan(Date.now());
    });

    it('dedupes same taskId — counts as one occurrence', () => {
      const lb = new LoopBreaker({ threshold: 3, shadowMode: true });
      const sig = makeSig();

      lb.recordFailure(sig, { taskId: 'task-1' });
      // Same task failing again (e.g. 3 retries) should not count again
      expect(lb.recordFailure(sig, { taskId: 'task-1' })).toBeNull();
      expect(lb.recordFailure(sig, { taskId: 'task-1' })).toBeNull();
      lb.recordFailure(sig, { taskId: 'task-2' });
      // Still only 2 unique tasks, need a 3rd
      expect(lb.recordFailure(sig, { taskId: 'task-3' })).not.toBeNull();
    });

    it('different signatures are independent', () => {
      const lb = new LoopBreaker({ threshold: 2, shadowMode: true });
      const sigA = makeSig('collect_items');
      const sigB = makeSig('dig_block');

      lb.recordFailure(sigA, { taskId: 'task-1' });
      lb.recordFailure(sigB, { taskId: 'task-2' });

      // Neither should trigger yet (each has 1 occurrence)
      expect(lb.recordFailure(sigA, { taskId: 'task-3' })).not.toBeNull(); // sigA hits 2
      expect(lb.recordFailure(sigB, { taskId: 'task-4' })).not.toBeNull(); // sigB hits 2
    });

    it('events outside window are pruned', () => {
      vi.useFakeTimers();
      const lb = new LoopBreaker({ threshold: 3, windowMs: 60_000, shadowMode: true });
      const sig = makeSig();

      lb.recordFailure(sig, { taskId: 'task-1' });
      lb.recordFailure(sig, { taskId: 'task-2' });

      // Advance past window
      vi.advanceTimersByTime(70_000);

      // Those 2 are now outside the window; this is only the 1st in-window
      expect(lb.recordFailure(sig, { taskId: 'task-3' })).toBeNull();
      expect(lb.recordFailure(sig, { taskId: 'task-4' })).toBeNull();
      // 3rd in-window occurrence
      expect(lb.recordFailure(sig, { taskId: 'task-5' })).not.toBeNull();

      vi.useRealTimers();
    });

    it('resets window after detection to avoid re-firing', () => {
      const lb = new LoopBreaker({ threshold: 2, shadowMode: true });
      const sig = makeSig();

      lb.recordFailure(sig, { taskId: 'task-1' });
      expect(lb.recordFailure(sig, { taskId: 'task-2' })).not.toBeNull(); // triggers

      // Window is reset — next occurrence starts fresh
      expect(lb.recordFailure(sig, { taskId: 'task-3' })).toBeNull(); // 1 of 2
      expect(lb.recordFailure(sig, { taskId: 'task-4' })).not.toBeNull(); // triggers again
    });

    it('includes runIds in episode when provided', () => {
      const lb = new LoopBreaker({ threshold: 2, shadowMode: true });
      const sig = makeSig();

      lb.recordFailure(sig, { taskId: 'task-1', runId: 'run-A' });
      const episode = lb.recordFailure(sig, { taskId: 'task-2', runId: 'run-B' });

      expect(episode!.contributingRunIds).toEqual(expect.arrayContaining(['run-A', 'run-B']));
    });

    it('logs [LoopBreaker:shadow] in shadow mode', () => {
      const lb = new LoopBreaker({ threshold: 1, shadowMode: true });
      const sig = makeSig();

      lb.recordFailure(sig, { taskId: 'task-1' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[LoopBreaker:shadow]'),
      );
    });

    it('logs [LoopBreaker:active] when not in shadow mode', () => {
      const lb = new LoopBreaker({ threshold: 1, shadowMode: false });
      const sig = makeSig();

      lb.recordFailure(sig, { taskId: 'task-1' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[LoopBreaker:active]'),
      );
    });
  });

  describe('isSuppressed', () => {
    it('returns false in shadow mode even after threshold', () => {
      const lb = new LoopBreaker({ threshold: 1, shadowMode: true });
      const sig = makeSig();

      lb.recordFailure(sig, { taskId: 'task-1' });
      expect(lb.isSuppressed(sig.signatureId)).toBe(false);
    });

    it('returns true in active mode after threshold', () => {
      const lb = new LoopBreaker({ threshold: 1, shadowMode: false, suppressionTtlMs: 60_000 });
      const sig = makeSig();

      lb.recordFailure(sig, { taskId: 'task-1' });
      expect(lb.isSuppressed(sig.signatureId)).toBe(true);
    });

    it('returns false after suppression TTL expires', () => {
      vi.useFakeTimers();
      const lb = new LoopBreaker({ threshold: 1, shadowMode: false, suppressionTtlMs: 30_000 });
      const sig = makeSig();

      lb.recordFailure(sig, { taskId: 'task-1' });
      expect(lb.isSuppressed(sig.signatureId)).toBe(true);

      vi.advanceTimersByTime(31_000);
      expect(lb.isSuppressed(sig.signatureId)).toBe(false);

      vi.useRealTimers();
    });

    it('returns false for unknown signature', () => {
      const lb = new LoopBreaker();
      expect(lb.isSuppressed('nonexistent')).toBe(false);
    });
  });

  describe('clearSuppression', () => {
    it('removes suppression so isSuppressed returns false', () => {
      const lb = new LoopBreaker({ threshold: 1, shadowMode: false, suppressionTtlMs: 60_000 });
      const sig = makeSig();

      lb.recordFailure(sig, { taskId: 'task-1' });
      expect(lb.isSuppressed(sig.signatureId)).toBe(true);

      lb.clearSuppression(sig.signatureId);
      expect(lb.isSuppressed(sig.signatureId)).toBe(false);
    });
  });

  describe('getState', () => {
    it('reports active signatures and suppressions', () => {
      const lb = new LoopBreaker({ threshold: 1, shadowMode: false, suppressionTtlMs: 60_000 });
      const sigA = makeSig('collect_items');
      const sigB = makeSig('dig_block');

      lb.recordFailure(sigA, { taskId: 'task-1' });
      lb.recordFailure(sigB, { taskId: 'task-2' });

      const state = lb.getState();
      expect(state.activeSignatures).toBe(2);
      expect(state.activeSuppressions).toBe(2);
      expect(state.shadowMode).toBe(false);
    });

    it('cleans expired suppressions', () => {
      vi.useFakeTimers();
      const lb = new LoopBreaker({ threshold: 1, shadowMode: false, suppressionTtlMs: 10_000 });
      const sig = makeSig();

      lb.recordFailure(sig, { taskId: 'task-1' });
      expect(lb.getState().activeSuppressions).toBe(1);

      vi.advanceTimersByTime(11_000);
      expect(lb.getState().activeSuppressions).toBe(0);

      vi.useRealTimers();
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest signatures when at capacity', () => {
      const lb = new LoopBreaker({ maxSignatures: 3, threshold: 10, shadowMode: true });

      // Fill to capacity
      lb.recordFailure(makeSig('leaf-1'), { taskId: 'task-1' });
      lb.recordFailure(makeSig('leaf-2'), { taskId: 'task-2' });
      lb.recordFailure(makeSig('leaf-3'), { taskId: 'task-3' });

      expect(lb.getState().activeSignatures).toBe(3);

      // Adding a 4th should evict the oldest (leaf-1)
      lb.recordFailure(makeSig('leaf-4'), { taskId: 'task-4' });
      expect(lb.getState().activeSignatures).toBe(3);
    });
  });

  describe('episode schema', () => {
    it('episode contains all required fields', () => {
      const lb = new LoopBreaker({ threshold: 1, shadowMode: true, windowMs: 300_000, suppressionTtlMs: 600_000 });
      const sig = makeSig('collect_items', 'oak_log');

      const episode = lb.recordFailure(sig, { taskId: 'task-1', runId: 'run-1' });

      expect(episode).toMatchObject({
        _schema: 'loop_detected_episode_v1',
        signatureId: sig.signatureId,
        signature: expect.objectContaining({ _schema: 'failure_signature_v1' }),
        occurrences: 1,
        windowMs: 300_000,
        contributingTaskIds: ['task-1'],
        contributingRunIds: ['run-1'],
        shadowMode: true,
      });
      expect(episode!.detectedAt).toBeGreaterThan(0);
      expect(episode!.suppressedUntil).toBeGreaterThan(episode!.detectedAt);
    });
  });
});
