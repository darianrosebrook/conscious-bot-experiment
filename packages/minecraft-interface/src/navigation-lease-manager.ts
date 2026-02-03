/**
 * NavigationLeaseManager — ref-counted mutual-exclusion lock for pathfinder access.
 *
 * Extracted from ActionTranslator to isolate lease lifecycle from action dispatch.
 * All lease state and logic live here; ActionTranslator delegates to an instance.
 *
 * @author @darianrosebrook
 */

import type { NavigationPriority } from './action-translator';

const PRIORITY_RANK: Record<NavigationPriority, number> = {
  normal: 0,
  high: 1,
  emergency: 2,
};

export interface NavigationLeaseCallbacks {
  /** Called when emergency preempt evicts a holder. Must not throw (logged if it does). */
  onPreempt?: (evictedHolder: string) => void;
}

export class NavigationLeaseManager {
  private _holder: string | null = null;
  private _priority: NavigationPriority = 'normal';
  private _release: (() => void) | null = null;
  private _refCount = 0;
  private callbacks: NavigationLeaseCallbacks;

  constructor(callbacks: NavigationLeaseCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Acquire the navigation lease. Returns a release function on success.
   *
   * Rules:
   * - If no lease is held, the caller acquires it.
   * - 'emergency' preempts any held lease (fires onPreempt callback).
   * - Same holder re-acquiring is ref-counted.
   * - Otherwise, returns null (caller should not navigate).
   */
  acquire(
    holder: string,
    priority: NavigationPriority = 'normal',
  ): (() => void) | null {
    // No current holder — grant immediately
    if (!this._holder) {
      return this._grantLease(holder, priority);
    }

    // Emergency preempts anything
    if (
      priority === 'emergency' &&
      PRIORITY_RANK[priority] > PRIORITY_RANK[this._priority]
    ) {
      const evicted = this._holder;
      // Fire preempt callback (errors are logged, not swallowed)
      if (this.callbacks.onPreempt) {
        try {
          this.callbacks.onPreempt(evicted);
        } catch (err) {
          console.warn(`[NavLease] onPreempt callback failed for evicted=${evicted}:`, err);
        }
      }
      // Force-clear the old lease (bypass ref-counting — holder is evicted)
      this._holder = null;
      this._priority = 'normal';
      this._release = null;
      this._refCount = 0;
      return this._grantLease(holder, priority);
    }

    // Same holder re-acquiring (idempotent)
    if (this._holder === holder) {
      return this._grantLease(holder, priority);
    }

    // Otherwise, lease is busy
    return null;
  }

  /** Release the navigation lease. Ref-counted: only clears when all nested acquires are released. */
  release(holder: string): void {
    if (this._holder === holder) {
      this._refCount--;
      if (this._refCount < 0) {
        console.warn(`[NavLease] refcount underflow for holder=${holder} — possible double-release`);
        this._refCount = 0;
      }
      if (this._refCount === 0) {
        this._holder = null;
        this._priority = 'normal';
        this._release = null;
      }
    }
  }

  /**
   * Execute an async function that requires pathfinder access under the nav lease.
   * Acquires the lease before calling `fn`, releases in `finally`.
   * Returns the function's result on success, or `busyResult` if the lease is busy.
   */
  async withLease<T extends { success: boolean; error?: string }>(
    holder: string,
    priority: NavigationPriority,
    fn: () => Promise<T>,
    busyResult: T,
  ): Promise<T> {
    const releaseFn = this.acquire(holder, priority);
    if (!releaseFn) return busyResult;
    try {
      return await fn();
    } finally {
      releaseFn();
    }
  }

  /** Whether navigation is currently leased. */
  get isBusy(): boolean {
    return this._holder !== null;
  }

  /** Current lease holder (null if idle). */
  get holder(): string | null {
    return this._holder;
  }

  /** Current ref count. */
  get refCount(): number {
    return this._refCount;
  }

  private _grantLease(
    holder: string,
    priority: NavigationPriority,
  ): () => void {
    const isReacquire = this._holder === holder;
    this._holder = holder;
    // Priority never downgrades: max(current, requested) on re-acquire
    if (isReacquire && PRIORITY_RANK[this._priority] > PRIORITY_RANK[priority]) {
      // Keep the higher existing priority
    } else {
      this._priority = priority;
    }
    if (isReacquire) {
      this._refCount++;
    } else {
      this._refCount = 1;
    }
    // One-shot release closure: warns on double-call instead of silently underflowing.
    let released = false;
    const release = () => {
      if (released) {
        console.warn(`[NavLease] double-release for holder=${holder} — ignoring`);
        return;
      }
      released = true;
      this.release(holder);
    };
    this._release = release;
    return release;
  }
}
