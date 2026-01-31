import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorldStateManager } from '../world-state-manager';

vi.mock('../../startup-barrier', () => ({
  isSystemReady: () => true,
}));

describe('WorldStateManager pollOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips overlapping polls when a previous poll is in flight', async () => {
    let resolveFetch: (value: any) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve as any;
    });

    const mockFetch = global.fetch as any;
    mockFetch.mockReturnValue(fetchPromise);

    const manager = new WorldStateManager('http://localhost:3005');

    const poll1 = manager.pollOnce();
    const poll2 = manager.pollOnce();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    await poll2;

    resolveFetch!({
      ok: true,
      json: async () => ({
        status: 'connected',
        data: {
          worldState: {},
          inventory: [],
        },
      }),
    });

    await poll1;
  });
});
