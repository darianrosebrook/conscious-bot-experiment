import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mcFetch, checkBotConnectionDetailed } from '../mc-client';

describe('mc-client timeout handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not retry on AbortError timeouts', async () => {
    const abortError = new DOMException('This operation was aborted', 'AbortError');
    const mockFetch = global.fetch as any;
    mockFetch.mockRejectedValue(abortError);

    await expect(mcFetch('/health', { timeoutMs: 5 })).rejects.toThrow(
      'This operation was aborted'
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns timeout failure kind for health check aborts', async () => {
    const abortError = new DOMException('This operation was aborted', 'AbortError');
    const mockFetch = global.fetch as any;
    mockFetch.mockRejectedValue(abortError);

    const result = await checkBotConnectionDetailed();

    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe('timeout');
  });
});
