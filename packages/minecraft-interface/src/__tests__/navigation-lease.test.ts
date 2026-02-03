import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal mock to test lease behavior without full bot initialization.
// Mirrors the ref-counted lease logic in action-translator.ts.
function createMockTranslator() {
  let _holder: string | null = null;
  let _priority: 'normal' | 'high' | 'emergency' = 'normal';
  let _release: (() => void) | null = null;
  let _refCount = 0;
  const stopCalls: string[] = [];
  const underflowCalls: string[] = [];
  const doubleReleaseCalls: string[] = [];

  const PRIORITY_RANK = { normal: 0, high: 1, emergency: 2 } as const;

  function grantLease(holder: string, priority: 'normal' | 'high' | 'emergency'): () => void {
    const isReacquire = _holder === holder;
    _holder = holder;
    _priority = priority;
    if (isReacquire) {
      _refCount++;
    } else {
      _refCount = 1;
    }
    // One-shot closure — matches production _grantLease semantics
    let released = false;
    const release = () => {
      if (released) {
        doubleReleaseCalls.push(`double-release:${holder}`);
        return;
      }
      released = true;
      releaseLease(holder);
    };
    _release = release;
    return release;
  }

  function acquireLease(
    holder: string,
    priority: 'normal' | 'high' | 'emergency' = 'normal',
  ): (() => void) | null {
    if (!_holder) return grantLease(holder, priority);
    if (priority === 'emergency' && PRIORITY_RANK[priority] > PRIORITY_RANK[_priority]) {
      stopCalls.push(`preempted:${_holder}`);
      // Force-clear (bypass ref-counting — holder is evicted)
      _holder = null;
      _priority = 'normal';
      _release = null;
      _refCount = 0;
      return grantLease(holder, priority);
    }
    if (_holder === holder) return grantLease(holder, priority);
    return null;
  }

  function releaseLease(holder: string): void {
    if (_holder === holder) {
      _refCount--;
      if (_refCount < 0) {
        underflowCalls.push(`underflow:${holder}`);
        _refCount = 0;
      }
      if (_refCount === 0) {
        _holder = null;
        _priority = 'normal';
        _release = null;
      }
    }
  }

  return {
    acquireLease,
    releaseLease,
    get holder() { return _holder; },
    get isBusy() { return _holder !== null; },
    get refCount() { return _refCount; },
    stopCalls,
    underflowCalls,
    doubleReleaseCalls,
  };
}

describe('Navigation Lease', () => {
  let lease: ReturnType<typeof createMockTranslator>;

  beforeEach(() => {
    lease = createMockTranslator();
  });

  it('grants lease when no one holds it', () => {
    const release = lease.acquireLease('executor');
    expect(release).not.toBeNull();
    expect(lease.holder).toBe('executor');
    expect(lease.isBusy).toBe(true);
  });

  it('rejects when another holder is active', () => {
    lease.acquireLease('executor');
    const second = lease.acquireLease('safety', 'normal');
    expect(second).toBeNull();
    expect(lease.holder).toBe('executor');
  });

  it('allows same holder to re-acquire (idempotent)', () => {
    lease.acquireLease('executor');
    const second = lease.acquireLease('executor');
    expect(second).not.toBeNull();
    expect(lease.holder).toBe('executor');
  });

  it('releases correctly', () => {
    const release = lease.acquireLease('executor')!;
    release();
    expect(lease.holder).toBeNull();
    expect(lease.isBusy).toBe(false);
  });

  it('emergency preempts normal', () => {
    lease.acquireLease('executor', 'normal');
    const emergencyRelease = lease.acquireLease('safety', 'emergency');
    expect(emergencyRelease).not.toBeNull();
    expect(lease.holder).toBe('safety');
    expect(lease.stopCalls).toContain('preempted:executor');
  });

  it('emergency preempts high', () => {
    lease.acquireLease('executor', 'high');
    const emergencyRelease = lease.acquireLease('safety', 'emergency');
    expect(emergencyRelease).not.toBeNull();
    expect(lease.holder).toBe('safety');
  });

  it('high does not preempt normal (only emergency preempts)', () => {
    lease.acquireLease('executor', 'normal');
    const highRelease = lease.acquireLease('safety', 'high');
    expect(highRelease).toBeNull();
    expect(lease.holder).toBe('executor');
  });

  it('after release, new holder can acquire', () => {
    const release = lease.acquireLease('executor')!;
    release();
    const second = lease.acquireLease('safety');
    expect(second).not.toBeNull();
    expect(lease.holder).toBe('safety');
  });

  it('release from wrong holder is no-op', () => {
    lease.acquireLease('executor');
    lease.releaseLease('wrong-holder');
    expect(lease.holder).toBe('executor');
  });

  // --- Reference counting tests ---

  it('ref-counted: nested re-acquire does not clear on inner release', () => {
    // Outer acquire (refCount = 1)
    const outerRelease = lease.acquireLease('safety-monitor', 'emergency')!;
    expect(lease.refCount).toBe(1);

    // Inner re-acquire by same holder (refCount = 2)
    const innerRelease = lease.acquireLease('safety-monitor', 'emergency')!;
    expect(lease.refCount).toBe(2);
    expect(lease.holder).toBe('safety-monitor');

    // Inner release (refCount = 1) — lease still held
    innerRelease();
    expect(lease.refCount).toBe(1);
    expect(lease.holder).toBe('safety-monitor');
    expect(lease.isBusy).toBe(true);

    // Outer release (refCount = 0) — lease cleared
    outerRelease();
    expect(lease.refCount).toBe(0);
    expect(lease.holder).toBeNull();
    expect(lease.isBusy).toBe(false);
  });

  it('ref-counted: triple nesting works correctly', () => {
    const r1 = lease.acquireLease('executor')!;
    const r2 = lease.acquireLease('executor')!;
    const r3 = lease.acquireLease('executor')!;
    expect(lease.refCount).toBe(3);

    r3();
    expect(lease.refCount).toBe(2);
    expect(lease.isBusy).toBe(true);

    r2();
    expect(lease.refCount).toBe(1);
    expect(lease.isBusy).toBe(true);

    r1();
    expect(lease.refCount).toBe(0);
    expect(lease.isBusy).toBe(false);
  });

  it('emergency preempt resets refcount of evicted holder', () => {
    // Executor acquires twice (refCount = 2)
    lease.acquireLease('executor', 'normal');
    lease.acquireLease('executor', 'normal');
    expect(lease.refCount).toBe(2);

    // Emergency preempt force-clears regardless of refcount
    const safetyRelease = lease.acquireLease('safety', 'emergency')!;
    expect(lease.holder).toBe('safety');
    expect(lease.refCount).toBe(1); // Fresh grant, not re-acquire
    expect(lease.stopCalls).toContain('preempted:executor');

    safetyRelease();
    expect(lease.isBusy).toBe(false);
  });

  it('double-calling a release closure is detected and ignored', () => {
    const release = lease.acquireLease('executor')!;
    release(); // first call: legitimate
    expect(lease.isBusy).toBe(false);
    expect(lease.refCount).toBe(0);

    release(); // second call: should be caught as double-release
    expect(lease.doubleReleaseCalls).toContain('double-release:executor');
    // Lease stays clear — double release is a no-op, not a corruption
    expect(lease.isBusy).toBe(false);
    expect(lease.refCount).toBe(0);
  });

  it('double-release does not corrupt a new holder who acquired after the first release', () => {
    const firstRelease = lease.acquireLease('executor')!;
    firstRelease(); // executor releases
    expect(lease.isBusy).toBe(false);

    // New holder acquires
    const secondRelease = lease.acquireLease('safety')!;
    expect(lease.holder).toBe('safety');

    // Stale closure fires — must be a no-op, must not decrement safety's refcount
    firstRelease();
    expect(lease.doubleReleaseCalls).toContain('double-release:executor');
    expect(lease.holder).toBe('safety');
    expect(lease.refCount).toBe(1);

    secondRelease();
    expect(lease.isBusy).toBe(false);
  });

  // --- Navigation enforcement tests ---

  it('second normal navigation rejected while first holds lease (simulates NAV_BUSY)', () => {
    const firstRelease = lease.acquireLease('action:navigate', 'normal');
    expect(firstRelease).not.toBeNull();
    expect(lease.isBusy).toBe(true);

    const secondRelease = lease.acquireLease('action:navigate_2', 'normal');
    expect(secondRelease).toBeNull(); // NAV_BUSY
    expect(lease.holder).toBe('action:navigate');

    firstRelease!();
    expect(lease.isBusy).toBe(false);

    const retryRelease = lease.acquireLease('action:navigate_2', 'normal');
    expect(retryRelease).not.toBeNull();
    expect(lease.holder).toBe('action:navigate_2');
    retryRelease!();
  });

  it('emergency safety preempts ongoing normal navigation', () => {
    const execRelease = lease.acquireLease('action:navigate', 'normal');
    expect(execRelease).not.toBeNull();
    expect(lease.holder).toBe('action:navigate');

    const safetyRelease = lease.acquireLease('safety-monitor', 'emergency');
    expect(safetyRelease).not.toBeNull();
    expect(lease.holder).toBe('safety-monitor');
    expect(lease.stopCalls).toContain('preempted:action:navigate');

    safetyRelease!();
    expect(lease.isBusy).toBe(false);
  });

  // --- SafetyMonitor propagation pattern ---
  // Proves that the safety monitor's pattern of passing lease context through
  // action parameters works: executeNavigate acquires as 'safety-monitor' emergency,
  // which is a same-holder re-acquire (idempotent + ref-counted).

  it('safety monitor propagation: executeNavigate re-acquires same holder without self-blocking', () => {
    // Simulates: safety monitor would no longer pre-acquire, but executeNavigate
    // acquires as 'safety-monitor' emergency from action params.
    // No prior holder → grant immediately.
    const navRelease = lease.acquireLease('safety-monitor', 'emergency')!;
    expect(lease.holder).toBe('safety-monitor');
    expect(lease.refCount).toBe(1);

    navRelease();
    expect(lease.isBusy).toBe(false);
  });

  it('safety monitor propagation: preempts active executor navigation', () => {
    // Executor holds a normal lease (simulating ongoing navigation)
    lease.acquireLease('action:navigate', 'normal');
    expect(lease.holder).toBe('action:navigate');

    // Safety monitor's emergency navigate (via action params) preempts
    const safetyRelease = lease.acquireLease('safety-monitor', 'emergency')!;
    expect(lease.holder).toBe('safety-monitor');
    expect(lease.stopCalls).toContain('preempted:action:navigate');

    safetyRelease();
    expect(lease.isBusy).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deriveNavLeaseContext — tests the actual production function from
// action-translator.ts. No local copy — tests the real implementation.
// ---------------------------------------------------------------------------

import { deriveNavLeaseContext } from '../action-translator';

describe('deriveNavLeaseContext', () => {
  it('defaults to action:type + normal when no params', () => {
    const ctx = deriveNavLeaseContext('navigate', undefined);
    expect(ctx.holder).toBe('action:navigate');
    expect(ctx.priority).toBe('normal');
  });

  it('defaults to action:type + normal when params are empty', () => {
    const ctx = deriveNavLeaseContext('navigate', {});
    expect(ctx.holder).toBe('action:navigate');
    expect(ctx.priority).toBe('normal');
  });

  it('reads navLeaseHolder from params', () => {
    const ctx = deriveNavLeaseContext('navigate', { navLeaseHolder: 'safety-monitor' });
    expect(ctx.holder).toBe('safety-monitor');
    expect(ctx.priority).toBe('normal');
  });

  it('reads navigationPriority from params', () => {
    const ctx = deriveNavLeaseContext('navigate', { navigationPriority: 'emergency' });
    expect(ctx.holder).toBe('action:navigate');
    expect(ctx.priority).toBe('emergency');
  });

  it('reads both holder and priority from params', () => {
    const ctx = deriveNavLeaseContext('navigate', {
      navLeaseHolder: 'safety-monitor',
      navigationPriority: 'emergency',
    });
    expect(ctx.holder).toBe('safety-monitor');
    expect(ctx.priority).toBe('emergency');
  });

  // --- Sanitization: invalid inputs fall back to defaults ---

  it('falls back to default holder if navLeaseHolder is empty string', () => {
    const ctx = deriveNavLeaseContext('move_to', { navLeaseHolder: '' });
    expect(ctx.holder).toBe('action:move_to');
  });

  it('falls back to default holder if navLeaseHolder is a number', () => {
    const ctx = deriveNavLeaseContext('navigate', { navLeaseHolder: 42 });
    expect(ctx.holder).toBe('action:navigate');
  });

  it('falls back to default holder if navLeaseHolder is an object', () => {
    const ctx = deriveNavLeaseContext('navigate', { navLeaseHolder: {} });
    expect(ctx.holder).toBe('action:navigate');
  });

  it('falls back to normal priority if navigationPriority is invalid string', () => {
    const ctx = deriveNavLeaseContext('navigate', { navigationPriority: 'EMERGENT' });
    expect(ctx.priority).toBe('normal');
  });

  it('falls back to normal priority if navigationPriority is a number', () => {
    const ctx = deriveNavLeaseContext('navigate', { navigationPriority: 2 });
    expect(ctx.priority).toBe('normal');
  });

  it('falls back to normal priority if navigationPriority is null', () => {
    const ctx = deriveNavLeaseContext('navigate', { navigationPriority: null });
    expect(ctx.priority).toBe('normal');
  });

  it('accepts all three valid priorities', () => {
    expect(deriveNavLeaseContext('n', { navigationPriority: 'normal' }).priority).toBe('normal');
    expect(deriveNavLeaseContext('n', { navigationPriority: 'high' }).priority).toBe('high');
    expect(deriveNavLeaseContext('n', { navigationPriority: 'emergency' }).priority).toBe('emergency');
  });

  // --- navLeaseScope tests (Part 1 scope-based holders) ---

  it('uses __nav.scope to create scoped holder when no explicit holder', () => {
    const ctx = deriveNavLeaseContext('navigate', { __nav: { scope: 'task-123' } });
    expect(ctx.holder).toBe('action:navigate:task-123');
    expect(ctx.priority).toBe('normal');
  });

  it('__nav.scope with __nav.priority works together', () => {
    const ctx = deriveNavLeaseContext('gather', {
      __nav: { scope: 'task-abc', priority: 'high' },
    });
    expect(ctx.holder).toBe('action:gather:task-abc');
    expect(ctx.priority).toBe('high');
  });

  it('__nav.holder overrides scope', () => {
    const ctx = deriveNavLeaseContext('navigate', {
      __nav: { holder: 'safety-monitor', scope: 'task-123' },
    });
    expect(ctx.holder).toBe('safety-monitor');
  });

  it('empty __nav.scope falls back to type-only holder', () => {
    const ctx = deriveNavLeaseContext('move_to', { __nav: { scope: '' } });
    expect(ctx.holder).toBe('action:move_to');
  });

  // Legacy flat param backward compat tests
  it('legacy navLeaseScope still works (backward compat)', () => {
    const ctx = deriveNavLeaseContext('navigate', { navLeaseScope: 'task-123' });
    expect(ctx.holder).toBe('action:navigate:task-123');
  });

  it('legacy navLeaseHolder overrides scope', () => {
    const ctx = deriveNavLeaseContext('navigate', {
      navLeaseHolder: 'safety-monitor',
      navLeaseScope: 'task-123',
    });
    expect(ctx.holder).toBe('safety-monitor');
  });

  it('__nav takes precedence over legacy flat params', () => {
    const ctx = deriveNavLeaseContext('navigate', {
      navLeaseScope: 'legacy-scope',
      __nav: { scope: 'nav-scope' },
    });
    expect(ctx.holder).toBe('action:navigate:nav-scope');
  });
});
