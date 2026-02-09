/**
 * Tests for execution readiness gate.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  probeServices,
  ReadinessMonitor,
  type ReadinessConfig,
} from '../execution-readiness';

// Mock resilientFetch at the module level
vi.mock('@conscious-bot/core', () => ({
  resilientFetch: vi.fn(),
}));

import { resilientFetch } from '@conscious-bot/core';
const mockResilientFetch = vi.mocked(resilientFetch);

const TEST_ENDPOINTS: ReadinessConfig['endpoints'] = {
  minecraft: 'http://localhost:3005/health',
  memory: 'http://localhost:3001/health',
};

function makeOkResponse(): Response {
  return { ok: true, status: 200 } as Response;
}

function makeErrorResponse(status: number): Response {
  return { ok: false, status } as Response;
}

beforeEach(() => {
  mockResilientFetch.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('probeServices', () => {
  it('all probes succeed → executorReady: true', async () => {
    mockResilientFetch.mockResolvedValue(makeOkResponse());

    const result = await probeServices({
      executionRequired: ['minecraft'],
      endpoints: TEST_ENDPOINTS,
    });

    expect(result.executorReady).toBe(true);
    expect(result.services.minecraft.state).toBe('up');
    expect(result.services.memory.state).toBe('up');
  });

  it('minecraft down → executorReady: false', async () => {
    mockResilientFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('3005')) return null; // network error
      return makeOkResponse();
    });

    const result = await probeServices({
      executionRequired: ['minecraft'],
      endpoints: TEST_ENDPOINTS,
    });

    expect(result.executorReady).toBe(false);
    expect(result.services.minecraft.state).toBe('down');
  });

  it('memory down → executorReady: true (memory not in executionRequired)', async () => {
    mockResilientFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('3001')) return null;
      return makeOkResponse();
    });

    const result = await probeServices({
      executionRequired: ['minecraft'],
      endpoints: TEST_ENDPOINTS,
    });

    expect(result.executorReady).toBe(true);
    expect(result.services.memory.state).toBe('down');
  });

  it('minecraft returns 500 → state: unhealthy, executorReady: false', async () => {
    mockResilientFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('3005')) return makeErrorResponse(500);
      return makeOkResponse();
    });

    const result = await probeServices({
      executionRequired: ['minecraft'],
      endpoints: TEST_ENDPOINTS,
    });

    expect(result.services.minecraft.state).toBe('unhealthy');
    expect(result.executorReady).toBe(false);
  });

  it('probes run in parallel (timing test)', async () => {
    const DELAY = 50;
    mockResilientFetch.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, DELAY));
      return makeOkResponse();
    });

    const start = Date.now();
    // Need to advance timers for the parallel delays
    const probePromise = probeServices({
      executionRequired: ['minecraft'],
      endpoints: TEST_ENDPOINTS,
    });

    // Advance timers to let the parallel probes resolve
    await vi.advanceTimersByTimeAsync(DELAY + 10);
    const result = await probePromise;
    const elapsed = Date.now() - start;

    // If run in parallel, total time < 2 * DELAY
    // With 2 services, sequential would be >= 2 * DELAY
    expect(elapsed).toBeLessThan(2 * DELAY);
    expect(result.services.minecraft.state).toBe('up');
  });
});

describe('ReadinessMonitor', () => {
  it('re-probe detects UP → DOWN transition', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockResilientFetch.mockResolvedValue(makeOkResponse());

    const monitor = new ReadinessMonitor({
      executionRequired: ['minecraft'],
      endpoints: TEST_ENDPOINTS,
    });
    await monitor.probe();
    expect(monitor.isUp('minecraft')).toBe(true);

    // Now minecraft goes down
    mockResilientFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('3005')) return null;
      return makeOkResponse();
    });

    monitor.startMonitoring(1000);
    await vi.advanceTimersByTimeAsync(1100);

    expect(monitor.isUp('minecraft')).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[readiness] minecraft: up → down'),
    );

    monitor.stopMonitoring();
    logSpy.mockRestore();
  });

  it('re-probe detects DOWN → UP transition', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockResilientFetch.mockResolvedValue(null); // all down

    const monitor = new ReadinessMonitor({
      executionRequired: ['minecraft'],
      endpoints: TEST_ENDPOINTS,
    });
    await monitor.probe();
    expect(monitor.isUp('minecraft')).toBe(false);

    // Now minecraft comes up
    mockResilientFetch.mockResolvedValue(makeOkResponse());

    monitor.startMonitoring(1000);
    await vi.advanceTimersByTimeAsync(1100);

    expect(monitor.isUp('minecraft')).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[readiness] minecraft: down → up'),
    );

    monitor.stopMonitoring();
    logSpy.mockRestore();
  });

  it('isFresh(120_000) returns false after expiry', async () => {
    mockResilientFetch.mockResolvedValue(makeOkResponse());

    const monitor = new ReadinessMonitor({
      executionRequired: ['minecraft'],
      endpoints: TEST_ENDPOINTS,
    });
    await monitor.probe();
    expect(monitor.isFresh(120_000)).toBe(true);

    vi.advanceTimersByTime(121_000);
    expect(monitor.isFresh(120_000)).toBe(false);
  });

  it('isUp before first probe → false (null-safe)', () => {
    const monitor = new ReadinessMonitor({
      executionRequired: ['minecraft'],
      endpoints: TEST_ENDPOINTS,
    });
    expect(monitor.isUp('minecraft')).toBe(false);
    expect(monitor.executorReady).toBe(false);
  });

  it('onChange callback fires on state transition', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockResilientFetch.mockResolvedValue(null); // all down

    const monitor = new ReadinessMonitor({
      executionRequired: ['minecraft'],
      endpoints: TEST_ENDPOINTS,
    });
    await monitor.probe();

    const onChange = vi.fn();
    monitor.onChange(onChange);

    // Bring minecraft up
    mockResilientFetch.mockResolvedValue(makeOkResponse());
    monitor.startMonitoring(1000);
    await vi.advanceTimersByTimeAsync(1100);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        executorReady: true,
        services: expect.objectContaining({
          minecraft: expect.objectContaining({ state: 'up' }),
        }),
      }),
    );

    monitor.stopMonitoring();
    vi.restoreAllMocks();
  });

  it('onChange callback does not fire when no state changes', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockResilientFetch.mockResolvedValue(makeOkResponse()); // all up

    const monitor = new ReadinessMonitor({
      executionRequired: ['minecraft'],
      endpoints: TEST_ENDPOINTS,
    });
    await monitor.probe();

    const onChange = vi.fn();
    monitor.onChange(onChange);

    // Re-probe with same state (still all up)
    monitor.startMonitoring(1000);
    await vi.advanceTimersByTimeAsync(1100);

    expect(onChange).not.toHaveBeenCalled();

    monitor.stopMonitoring();
    vi.restoreAllMocks();
  });

  describe('reprobeNow()', () => {
    it('detects down→up transition and fires onChange', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      // Initial probe: minecraft down
      mockResilientFetch.mockImplementation(async (url: string) => {
        if (typeof url === 'string' && url.includes('3005')) return null;
        return makeOkResponse();
      });

      const monitor = new ReadinessMonitor({
        executionRequired: ['minecraft'],
        endpoints: TEST_ENDPOINTS,
      });
      await monitor.probe();
      expect(monitor.executorReady).toBe(false);

      const onChange = vi.fn();
      monitor.onChange(onChange);

      // Minecraft comes up
      mockResilientFetch.mockResolvedValue(makeOkResponse());
      const result = await monitor.reprobeNow();

      expect(result?.executorReady).toBe(true);
      expect(monitor.isUp('minecraft')).toBe(true);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          executorReady: true,
          services: expect.objectContaining({
            minecraft: expect.objectContaining({ state: 'up' }),
          }),
        }),
      );

      vi.restoreAllMocks();
    });

    it('does not fire onChange when state is unchanged', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      mockResilientFetch.mockResolvedValue(makeOkResponse());

      const monitor = new ReadinessMonitor({
        executionRequired: ['minecraft'],
        endpoints: TEST_ENDPOINTS,
      });
      await monitor.probe();

      const onChange = vi.fn();
      monitor.onChange(onChange);

      // Reprobe with same state
      const result = await monitor.reprobeNow();

      expect(result?.executorReady).toBe(true);
      expect(onChange).not.toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it('resolves the startup race — executorReady flips without waiting for periodic probe', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      // Simulate initial probe where MC is still booting
      mockResilientFetch.mockImplementation(async (url: string) => {
        if (typeof url === 'string' && url.includes('3005')) return null;
        return makeOkResponse();
      });

      const monitor = new ReadinessMonitor({
        executionRequired: ['minecraft'],
        endpoints: TEST_ENDPOINTS,
      });
      await monitor.probe();
      expect(monitor.executorReady).toBe(false);

      // Start monitoring with a long interval (simulating production 120s)
      monitor.startMonitoring(120_000);

      // MC Interface finishes booting (before periodic probe fires)
      mockResilientFetch.mockResolvedValue(makeOkResponse());

      // reprobeNow() fixes the gap — no need to wait 120s
      await monitor.reprobeNow();
      expect(monitor.executorReady).toBe(true);

      monitor.stopMonitoring();
      vi.restoreAllMocks();
    });
  });
});
