/**
 * Test for action task execution fix
 *
 * Validates that action tasks are properly routed and executed
 * without requiring scenario parameters.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReactiveExecutor } from '../reactive-executor';

const originalFetch = globalThis.fetch;

describe('Action Task Execution Fix', () => {
  let executor: ReactiveExecutor;
  let mockFetch: ReturnType<typeof vi.fn>;
  const prevExecutorMode = process.env.EXECUTOR_MODE;
  const prevLiveConfirm = process.env.EXECUTOR_LIVE_CONFIRM;

  beforeEach(() => {
    // Ensure fetch is a vi.fn() mock before each test (other suites may restore real fetch).
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // These tests assert /action is dispatched. The gateway defaults to shadow
    // unless explicitly confirmed.
    process.env.EXECUTOR_MODE = 'live';
    process.env.EXECUTOR_LIVE_CONFIRM = 'YES';
    executor = new ReactiveExecutor({
      capabilities: [],
    } as any);
  });

  afterEach(() => {
    process.env.EXECUTOR_MODE = prevExecutorMode;
    process.env.EXECUTOR_LIVE_CONFIRM = prevLiveConfirm;
    globalThis.fetch = originalFetch;
  });

  it('should handle action task type with wood gathering', async () => {
    // Mock successful bot connection and health
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            executionStatus: { bot: { connected: true } },
            isAlive: true,
            botStatus: { health: 20 },
          }),
      })
      // The execution gateway performs its own bot-connection preflight.
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            executionStatus: { bot: { connected: true } },
            isAlive: true,
            botStatus: { health: 20 },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { position: { x: 10, y: 71, z: 29 }, blocksFound: 3 },
          }),
      });

    const task = {
      id: 'action-wood-gathering',
      type: 'action',
      title: 'Gather some wood from nearby trees',
      parameters: {
        thoughtContent: 'Gather some wood from nearby trees for building',
      },
      status: 'pending',
    };

    const result = await executor.executeTask(task);

    // Verify the request was made to navigate to trees
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Check that the health endpoint was called (reactive preflight + gateway preflight)
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3005/health');
    expect(mockFetch.mock.calls[1][0]).toBe('http://localhost:3005/health');

    // Check the action endpoint call with proper routing
    expect(mockFetch.mock.calls[2][0]).toBe('http://localhost:3005/action');
    expect(mockFetch.mock.calls[2][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const actionBody = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(actionBody.type).toBe('navigate');
    expect(actionBody.parameters).toEqual(
      expect.objectContaining({
        target: 'tree',
        action: 'gather_wood',
        max_distance: 20,
      })
    );

    expect(result.success).toBe(true);
    // Gateway-normalized response shape (data payload may be null depending on normalizer).
    expect(result.data.type).toBe('action');
    expect(result.data.actionType).toBe('navigate');
    expect(result.data.success).toBe(true);
    expect(result.data.error).toBeUndefined();
  });

  it('should handle action task type with crafting', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            executionStatus: { bot: { connected: true } },
            isAlive: true,
            botStatus: { health: 20 },
          }),
      })
      // Gateway preflight
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            executionStatus: { bot: { connected: true } },
            isAlive: true,
            botStatus: { health: 20 },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { crafted: 'wooden_axe', quantity: 1 },
          }),
      });

    const task = {
      id: 'action-crafting',
      type: 'action',
      title: 'Craft wooden axe tools for survival',
      parameters: {
        thoughtContent: 'Need to craft wooden axe tools for survival',
      },
      status: 'pending',
    };

    const result = await executor.executeTask(task);

    // Verify the request was made to craft items
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[2][0]).toBe('http://localhost:3005/action');
    expect(mockFetch.mock.calls[2][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const craftBody = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(craftBody.type).toBe('craft_item');
    expect(craftBody.parameters).toEqual(
      expect.objectContaining({
        item: 'wooden_axe',
        materials: 'auto_collect',
      })
    );

    expect(result.success).toBe(true);
    expect(result.data.type).toBe('action');
    expect(result.data.actionType).toBe('craft_item');
  });

  it('should handle action task type with default exploration fallback', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            executionStatus: { bot: { connected: true } },
            isAlive: true,
            botStatus: { health: 20 },
          }),
      })
      // Gateway preflight
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            executionStatus: { bot: { connected: true } },
            isAlive: true,
            botStatus: { health: 20 },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { explored: true },
          }),
      });

    const task = {
      id: 'action-unknown',
      type: 'action',
      title: 'Do something undefined',
      parameters: {
        thoughtContent: 'This is an unclear action',
      },
      status: 'pending',
    };

    const result = await executor.executeTask(task);

    // Verify it defaults to exploration
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[2][0]).toBe('http://localhost:3005/action');
    expect(mockFetch.mock.calls[2][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const exploreBody = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(exploreBody.type).toBe('explore');

    expect(result.success).toBe(true);
    expect(result.data.actionType).toBe('explore');
  });

  it('should handle minecraft interface errors gracefully', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            executionStatus: { bot: { connected: true } },
            isAlive: true,
            botStatus: { health: 20 },
          }),
      })
      // Gateway preflight
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            executionStatus: { bot: { connected: true } },
            isAlive: true,
            botStatus: { health: 20 },
          }),
      })
      // mcFetch retries on 5xx; provide enough responses to cover retries.
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () =>
          Promise.resolve(
            '{"success":false,"message":"Internal server error"}'
          ),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () =>
          Promise.resolve(
            '{"success":false,"message":"Internal server error"}'
          ),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () =>
          Promise.resolve(
            '{"success":false,"message":"Internal server error"}'
          ),
      });

    const task = {
      id: 'action-error',
      type: 'action',
      title: 'Gather wood but server fails',
      parameters: {
        thoughtContent: 'Gather wood from trees',
      },
      status: 'pending',
    };

    const result = await executor.executeTask(task);

    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 500:');
    expect(result.data.type).toBe('action');
  });

  it('should detect bot disconnection and return appropriate error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          executionStatus: { bot: { connected: false } },
          isAlive: false,
          botStatus: { health: 0 },
        }),
    });

    const task = {
      id: 'action-disconnected',
      type: 'action',
      title: 'Try to gather wood when disconnected',
      parameters: {
        thoughtContent: 'Gather wood from trees',
      },
      status: 'pending',
    };

    const result = await executor.executeTask(task);

    expect(result.success).toBe(false);
    expect(result.data.error).toBe('Bot not connected to Minecraft server');
    expect(result.data.type).toBe('action');
  });
});
