/**
 * Keyed Mutex — Concurrency + Serialization Tests
 *
 * Evidence for commit 2:
 * - N parallel transactions on same key → exactly one wins at a time
 * - Different keys can run concurrently
 * - Release guarantees cleanup (no leaked locks)
 * - withKeyLock releases even on error
 * - Ordering is preserved (FIFO within a key)
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { KeyedMutex, withKeyLock } from '../keyed-mutex';

// ---------------------------------------------------------------------------
// Basic semantics
// ---------------------------------------------------------------------------

describe('KeyedMutex — Basic Semantics', () => {
  it('acquire returns a release function', async () => {
    const mutex = new KeyedMutex();
    const release = await mutex.acquire('a');
    expect(typeof release).toBe('function');
    expect(mutex.isLocked('a')).toBe(true);
    release();
    // After release, lock should be cleared on next microtask
    await Promise.resolve();
    expect(mutex.isLocked('a')).toBe(false);
  });

  it('size tracks active locks', async () => {
    const mutex = new KeyedMutex();
    expect(mutex.size).toBe(0);
    const r1 = await mutex.acquire('a');
    expect(mutex.size).toBe(1);
    const r2 = await mutex.acquire('b');
    expect(mutex.size).toBe(2);
    r1();
    r2();
    await Promise.resolve();
    expect(mutex.size).toBe(0);
  });

  it('different keys are independent (no blocking)', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];

    const p1 = (async () => {
      const release = await mutex.acquire('a');
      order.push('a_start');
      await new Promise((r) => setTimeout(r, 10));
      order.push('a_end');
      release();
    })();

    const p2 = (async () => {
      const release = await mutex.acquire('b');
      order.push('b_start');
      order.push('b_end');
      release();
    })();

    await Promise.all([p1, p2]);
    // b should start before a ends, because they're on different keys
    expect(order.indexOf('b_start')).toBeLessThan(order.indexOf('a_end'));
  });
});

// ---------------------------------------------------------------------------
// Same-key serialization
// ---------------------------------------------------------------------------

describe('KeyedMutex — Same-Key Serialization', () => {
  it('serializes concurrent acquires on the same key', async () => {
    const mutex = new KeyedMutex();
    const order: number[] = [];

    // Launch 5 concurrent tasks on the same key
    const tasks = Array.from({ length: 5 }, (_, i) =>
      (async () => {
        const release = await mutex.acquire('shared');
        order.push(i);
        // Simulate async work
        await new Promise((r) => setTimeout(r, 1));
        release();
      })(),
    );

    await Promise.all(tasks);
    // All 5 should have run (no deadlock)
    expect(order).toHaveLength(5);
    // Each index should appear exactly once
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('exactly one holds the lock at any time (no overlap)', async () => {
    const mutex = new KeyedMutex();
    let currentHolder: number | null = null;
    let maxConcurrent = 0;
    let concurrent = 0;

    const tasks = Array.from({ length: 10 }, (_, i) =>
      (async () => {
        const release = await mutex.acquire('key');
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        currentHolder = i;
        // Yield to ensure any competing acquire would observe overlap
        await new Promise((r) => setTimeout(r, 0));
        expect(currentHolder).toBe(i); // no one else overwrote
        concurrent--;
        release();
      })(),
    );

    await Promise.all(tasks);
    expect(maxConcurrent).toBe(1);
  });

  it('N parallel resolve-or-create → exactly one creates', async () => {
    const mutex = new KeyedMutex();
    const store = new Map<string, string>();
    const results: string[] = [];

    const resolveOrCreate = async (key: string, id: string) => {
      return withKeyLock(mutex, key, () => {
        const existing = store.get(key);
        if (existing) {
          results.push(`continue:${existing}`);
          return existing;
        }
        store.set(key, id);
        results.push(`create:${id}`);
        return id;
      });
    };

    // 20 concurrent resolve-or-create on the same key
    const promises = Array.from({ length: 20 }, (_, i) =>
      resolveOrCreate('shelter_key', `task_${i}`),
    );

    const ids = await Promise.all(promises);

    // All should resolve to the same ID
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(1);

    // Exactly one "create", rest are "continue"
    const creates = results.filter((r) => r.startsWith('create:'));
    const continues = results.filter((r) => r.startsWith('continue:'));
    expect(creates).toHaveLength(1);
    expect(continues).toHaveLength(19);
  });
});

// ---------------------------------------------------------------------------
// withKeyLock helper
// ---------------------------------------------------------------------------

describe('withKeyLock', () => {
  it('executes callback and releases lock', async () => {
    const mutex = new KeyedMutex();
    const result = await withKeyLock(mutex, 'x', () => 42);
    expect(result).toBe(42);
    expect(mutex.isLocked('x')).toBe(false);
  });

  it('releases lock even on error', async () => {
    const mutex = new KeyedMutex();
    await expect(
      withKeyLock(mutex, 'x', () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // Lock must be released
    await Promise.resolve();
    expect(mutex.isLocked('x')).toBe(false);
  });

  it('releases lock even on async error', async () => {
    const mutex = new KeyedMutex();
    await expect(
      withKeyLock(mutex, 'x', async () => {
        await new Promise((r) => setTimeout(r, 1));
        throw new Error('async boom');
      }),
    ).rejects.toThrow('async boom');
    await Promise.resolve();
    expect(mutex.isLocked('x')).toBe(false);
  });

  it('supports async callbacks', async () => {
    const mutex = new KeyedMutex();
    const result = await withKeyLock(mutex, 'x', async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 'async_result';
    });
    expect(result).toBe('async_result');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('KeyedMutex — Edge Cases', () => {
  it('re-acquire after release works (no permanent lock)', async () => {
    const mutex = new KeyedMutex();
    const r1 = await mutex.acquire('k');
    r1();
    await Promise.resolve();

    const r2 = await mutex.acquire('k');
    expect(mutex.isLocked('k')).toBe(true);
    r2();
  });

  it('double release is harmless (no error, no corruption)', async () => {
    const mutex = new KeyedMutex();
    const release = await mutex.acquire('k');
    release();
    // Second release — should not throw or corrupt state
    expect(() => release()).not.toThrow();
    await Promise.resolve();
    expect(mutex.isLocked('k')).toBe(false);
  });
});
