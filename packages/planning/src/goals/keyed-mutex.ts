/**
 * Keyed Mutex
 *
 * A per-key mutual exclusion primitive for single-process async operations.
 * Used by the goal resolver to ensure atomic resolve-or-create semantics:
 * at most one non-terminal task per (goalType, goalKey).
 *
 * Not suitable for multi-process coordination. If the system moves to
 * multi-process, replace with store-level CAS (compare-and-swap).
 *
 * @see docs/internal/goal-binding-protocol.md §C
 */

type Release = () => void;

/**
 * Per-key async mutex. Multiple keys can be locked concurrently,
 * but concurrent acquires on the same key are serialized.
 */
export class KeyedMutex {
  private locks = new Map<string, Promise<void>>();

  /**
   * Acquire exclusive access for a key. Returns a release function.
   * Callers MUST call release() when done, even on error (use try/finally).
   *
   * If the key is already locked, waits until the previous holder releases.
   */
  async acquire(key: string): Promise<Release> {
    // Wait for any existing lock on this key
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    // Create a new lock (a promise that resolves when we release)
    let release!: Release;
    const lockPromise = new Promise<void>((resolve) => {
      release = () => {
        this.locks.delete(key);
        resolve();
      };
    });
    this.locks.set(key, lockPromise);

    return release;
  }

  /** Check if a key is currently locked (for diagnostics, not synchronization). */
  isLocked(key: string): boolean {
    return this.locks.has(key);
  }

  /** Number of currently held locks (for diagnostics). */
  get size(): number {
    return this.locks.size;
  }
}

/**
 * Execute a callback under exclusive access for a key.
 * Guarantees release even if the callback throws.
 */
export async function withKeyLock<T>(
  mutex: KeyedMutex,
  key: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const release = await mutex.acquire(key);
  try {
    return await fn();
  } finally {
    release();
  }
}
