import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NavigationLeaseManager } from '../navigation-lease-manager';

describe('NavigationLeaseManager', () => {
  let manager: NavigationLeaseManager;

  beforeEach(() => {
    manager = new NavigationLeaseManager();
  });

  // --- Basic acquire/release ---

  it('grants lease when no one holds it', () => {
    const release = manager.acquire('executor');
    expect(release).not.toBeNull();
    expect(manager.holder).toBe('executor');
    expect(manager.isBusy).toBe(true);
    expect(manager.refCount).toBe(1);
  });

  it('releases correctly', () => {
    const release = manager.acquire('executor')!;
    release();
    expect(manager.holder).toBeNull();
    expect(manager.isBusy).toBe(false);
    expect(manager.refCount).toBe(0);
  });

  // --- Same-holder re-acquire is ref-counted ---

  it('ref-counted: same holder re-acquire increments refCount', () => {
    const r1 = manager.acquire('executor')!;
    expect(manager.refCount).toBe(1);
    const r2 = manager.acquire('executor')!;
    expect(manager.refCount).toBe(2);

    r2();
    expect(manager.refCount).toBe(1);
    expect(manager.isBusy).toBe(true);

    r1();
    expect(manager.refCount).toBe(0);
    expect(manager.isBusy).toBe(false);
  });

  // --- Different holder rejected when busy ---

  it('rejects different holder when busy', () => {
    manager.acquire('executor');
    const second = manager.acquire('safety', 'normal');
    expect(second).toBeNull();
    expect(manager.holder).toBe('executor');
  });

  // --- Emergency preemption fires onPreempt callback ---

  it('emergency preemption fires onPreempt callback', () => {
    const preemptCalls: string[] = [];
    const mgr = new NavigationLeaseManager({
      onPreempt: (evicted) => preemptCalls.push(evicted),
    });

    mgr.acquire('executor', 'normal');
    const safetyRelease = mgr.acquire('safety', 'emergency')!;

    expect(safetyRelease).not.toBeNull();
    expect(mgr.holder).toBe('safety');
    expect(preemptCalls).toEqual(['executor']);

    safetyRelease();
    expect(mgr.isBusy).toBe(false);
  });

  it('emergency preempts high priority', () => {
    const mgr = new NavigationLeaseManager();
    mgr.acquire('executor', 'high');
    const safetyRelease = mgr.acquire('safety', 'emergency')!;
    expect(safetyRelease).not.toBeNull();
    expect(mgr.holder).toBe('safety');
  });

  it('high does not preempt normal (only emergency preempts)', () => {
    manager.acquire('executor', 'normal');
    const highRelease = manager.acquire('other', 'high');
    expect(highRelease).toBeNull();
    expect(manager.holder).toBe('executor');
  });

  // --- onPreempt error is logged, not swallowed ---

  it('onPreempt error is logged via console.warn, not swallowed', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mgr = new NavigationLeaseManager({
      onPreempt: () => { throw new Error('stopNavigation failed'); },
    });

    mgr.acquire('executor', 'normal');
    const safetyRelease = mgr.acquire('safety', 'emergency')!;

    // Preemption still succeeds despite callback error
    expect(safetyRelease).not.toBeNull();
    expect(mgr.holder).toBe('safety');
    // Error was logged
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('onPreempt callback failed'),
      expect.any(Error),
    );

    warnSpy.mockRestore();
    safetyRelease();
  });

  // --- Double-release one-shot safety ---

  it('double-calling a release closure is detected and ignored', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const release = manager.acquire('executor')!;
    release(); // first call: legitimate
    expect(manager.isBusy).toBe(false);

    release(); // second call: should warn
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('double-release'),
    );
    expect(manager.isBusy).toBe(false);
    expect(manager.refCount).toBe(0);

    warnSpy.mockRestore();
  });

  it('double-release does not corrupt a new holder', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const firstRelease = manager.acquire('executor')!;
    firstRelease();

    const secondRelease = manager.acquire('safety')!;
    expect(manager.holder).toBe('safety');

    // Stale closure fires — must be a no-op
    firstRelease();
    expect(manager.holder).toBe('safety');
    expect(manager.refCount).toBe(1);

    secondRelease();
    expect(manager.isBusy).toBe(false);
    warnSpy.mockRestore();
  });

  // --- withLease happy/busy/exception paths ---

  it('withLease: happy path acquires, runs fn, and releases', async () => {
    const result = await manager.withLease(
      'executor',
      'normal',
      async () => ({ success: true }),
      { success: false, error: 'NAV_BUSY' },
    );

    expect(result).toEqual({ success: true });
    expect(manager.isBusy).toBe(false);
  });

  it('withLease: returns busyResult when lease is held', async () => {
    manager.acquire('other-holder');
    const result = await manager.withLease(
      'executor',
      'normal',
      async () => ({ success: true }),
      { success: false, error: 'NAV_BUSY' },
    );

    expect(result).toEqual({ success: false, error: 'NAV_BUSY' });
    expect(manager.holder).toBe('other-holder');
  });

  it('withLease: releases lease even if fn throws', async () => {
    await expect(
      manager.withLease(
        'executor',
        'normal',
        async () => { throw new Error('boom'); },
        { success: false, error: 'NAV_BUSY' },
      ),
    ).rejects.toThrow('boom');

    expect(manager.isBusy).toBe(false);
  });

  // --- Emergency preempt resets refcount ---

  it('emergency preempt resets refcount of evicted holder', () => {
    manager.acquire('executor', 'normal');
    manager.acquire('executor', 'normal');
    expect(manager.refCount).toBe(2);

    const safetyRelease = manager.acquire('safety', 'emergency')!;
    expect(manager.holder).toBe('safety');
    expect(manager.refCount).toBe(1);

    safetyRelease();
    expect(manager.isBusy).toBe(false);
  });

  // --- Priority never downgrades on re-acquire ---

  it('re-acquire with lower priority does not downgrade lease priority', () => {
    // First acquire at emergency
    const r1 = manager.acquire('safety', 'emergency')!;
    // Re-acquire same holder at normal — priority should stay at emergency
    const r2 = manager.acquire('safety', 'normal')!;

    // Now a new holder at high should NOT be able to preempt (only emergency can preempt emergency)
    const attempt = manager.acquire('executor', 'high');
    expect(attempt).toBeNull(); // Still blocked because safety is at emergency

    r2();
    r1();
    expect(manager.isBusy).toBe(false);
  });

  it('re-acquire with higher priority upgrades lease priority', () => {
    // First acquire at normal
    manager.acquire('executor', 'normal');
    // Re-acquire at high — should upgrade
    manager.acquire('executor', 'high');

    // Emergency should still be able to preempt high
    const preemptCalls: string[] = [];
    const mgr = new NavigationLeaseManager({
      onPreempt: (evicted) => preemptCalls.push(evicted),
    });
    mgr.acquire('executor', 'high');
    const safetyRelease = mgr.acquire('safety', 'emergency')!;
    expect(safetyRelease).not.toBeNull();
    expect(preemptCalls).toEqual(['executor']);
    safetyRelease();
  });
});
