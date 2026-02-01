/**
 * Tests for resilient-fetch log dedup and silent option.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resilientFetch, _resetLogDedup } from '../resilient-service-client';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  _resetLogDedup();
  mockFetch.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeNetworkError(code: string): Error {
  const err = new Error('fetch failed');
  (err as any).cause = { code };
  return err;
}

function makeTimeoutError(): Error {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

describe('resilient-fetch logging', () => {
  it('silent: true suppresses all console.warn on failure', async () => {
    mockFetch.mockRejectedValue(makeNetworkError('ECONNREFUSED'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await resilientFetch('http://localhost:9999/health', {
      maxRetries: 0,
      silent: true,
      label: 'test-silent',
    });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('silent: false (default) logs on failure', async () => {
    mockFetch.mockRejectedValue(makeNetworkError('ECONNREFUSED'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await resilientFetch('http://localhost:9999/health', {
      maxRetries: 0,
      label: 'test-loud',
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ECONNREFUSED]'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('same label + same error kind within 60s → 1 warn (dedup)', async () => {
    mockFetch.mockRejectedValue(makeNetworkError('ECONNREFUSED'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await resilientFetch('http://localhost:9999', {
      maxRetries: 0,
      label: 'svc-a',
    });
    await resilientFetch('http://localhost:9999', {
      maxRetries: 0,
      label: 'svc-a',
    });

    // Only the first call should log
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('same label + different error kind within 60s → 2 warns (error-class keying)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockFetch.mockRejectedValueOnce(makeNetworkError('ECONNREFUSED'));
    await resilientFetch('http://localhost:9999', {
      maxRetries: 0,
      label: 'svc-b',
    });

    mockFetch.mockRejectedValueOnce(makeTimeoutError());
    await resilientFetch('http://localhost:9999', {
      maxRetries: 0,
      label: 'svc-b',
    });

    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('same label + same error kind after 60s → 2 warns (cooldown expires)', async () => {
    mockFetch.mockRejectedValue(makeNetworkError('ECONNREFUSED'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await resilientFetch('http://localhost:9999', {
      maxRetries: 0,
      label: 'svc-c',
    });

    // Advance past cooldown
    vi.advanceTimersByTime(61_000);

    await resilientFetch('http://localhost:9999', {
      maxRetries: 0,
      label: 'svc-c',
    });

    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('different labels + same error kind → 2 warns (labels tracked independently)', async () => {
    mockFetch.mockRejectedValue(makeNetworkError('ECONNREFUSED'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await resilientFetch('http://localhost:9999', {
      maxRetries: 0,
      label: 'svc-x',
    });
    await resilientFetch('http://localhost:9999', {
      maxRetries: 0,
      label: 'svc-y',
    });

    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('dedup map respects FIFO eviction at 64 entries', async () => {
    mockFetch.mockRejectedValue(makeNetworkError('ECONNREFUSED'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Fill map with 64 entries
    for (let i = 0; i < 64; i++) {
      await resilientFetch('http://localhost:9999', {
        maxRetries: 0,
        label: `label-${i}`,
      });
    }
    expect(warnSpy).toHaveBeenCalledTimes(64);

    // 65th label should evict the first and still log
    await resilientFetch('http://localhost:9999', {
      maxRetries: 0,
      label: 'label-64',
    });
    expect(warnSpy).toHaveBeenCalledTimes(65);

    // The evicted first label should now log again (it was removed)
    await resilientFetch('http://localhost:9999', {
      maxRetries: 0,
      label: 'label-0',
    });
    expect(warnSpy).toHaveBeenCalledTimes(66);

    warnSpy.mockRestore();
  });

  it('_resetLogDedup() clears dedup state', async () => {
    mockFetch.mockRejectedValue(makeNetworkError('ECONNREFUSED'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await resilientFetch('http://localhost:9999', {
      maxRetries: 0,
      label: 'svc-reset',
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    _resetLogDedup();

    await resilientFetch('http://localhost:9999', {
      maxRetries: 0,
      label: 'svc-reset',
    });
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });
});
