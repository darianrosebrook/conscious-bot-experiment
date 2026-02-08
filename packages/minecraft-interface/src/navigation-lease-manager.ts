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
  private _acquiredAt = 0;
  private _ttlMs = 0; // 0 = no TTL
  private _lastPreemptReason: string | null = null;
  private callbacks: NavigationLeaseCallbacks;

  constructor(callbacks: NavigationLeaseCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /** Reason string from the most recent emergency preemption, or null. */
  get lastPreemptReason(): string | null {
    return this._lastPreemptReason;
  }

  /** Clear the preempt reason flag (consumed by callers after reading). */
  clearPreemptReason(): void {
    this._lastPreemptReason = null;
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
    ttlMs?: number,
  ): (() => void) | null {
    this._checkTtlExpiry();

    // No current holder — grant immediately
    if (!this._holder) {
      return this._grantLease(holder, priority, ttlMs);
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
      this._lastPreemptReason = `emergency_preempt:${evicted}`;
      this._holder = null;
      this._priority = 'normal';
      this._release = null;
      this._refCount = 0;
      return this._grantLease(holder, priority, ttlMs);
    }

    // Same holder re-acquiring (idempotent)
    if (this._holder === holder) {
      return this._grantLease(holder, priority, ttlMs);
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
    opts?: { ttlMs?: number; preemptResult?: T },
  ): Promise<T> {
    const releaseFn = this.acquire(holder, priority, opts?.ttlMs);
    if (!releaseFn) {
      // If the lease was preempted by an emergency, return the preempt result
      if (opts?.preemptResult && this._lastPreemptReason) {
        return opts.preemptResult;
      }
      return busyResult;
    }
    try {
      return await fn();
    } finally {
      releaseFn();
    }
  }

  /** Whether navigation is currently leased. */
  get isBusy(): boolean {
    this._checkTtlExpiry();
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
    ttlMs?: number,
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
    this._acquiredAt = Date.now();
    this._ttlMs = ttlMs ?? 60_000; // 60s default TTL

    // Clear preempt reason when a non-emergency caller consumes the lease
    if (priority !== 'emergency') {
      this._lastPreemptReason = null;
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

  /** Passive TTL check: if lease has expired, auto-release it. */
  private _checkTtlExpiry(): void {
    if (
      this._holder &&
      this._ttlMs > 0 &&
      Date.now() - this._acquiredAt > this._ttlMs
    ) {
      console.warn(
        `[NavLease] TTL expired for holder=${this._holder} after ${this._ttlMs}ms — auto-releasing`
      );
      this._holder = null;
      this._priority = 'normal';
      this._release = null;
      this._refCount = 0;
    }
  }
}
