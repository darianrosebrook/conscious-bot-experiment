/**
 * Test for action task execution fix
 *
 * Validates that action tasks are properly routed and executed
 * without requiring scenario parameters.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnhancedReactiveExecutor } from '../reactive-executor';

// Mock fetch globally
global.fetch = vi.fn();

describe('Action Task Execution Fix', () => {
  let executor: EnhancedReactiveExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new EnhancedReactiveExecutor({
      capabilities: [],
    } as any);
  });

  it('should handle action task type with wood gathering', async () => {
    // Mock successful bot connection and health
    const mockFetch = global.fetch as any;
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
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Check that the health endpoint was called (first call)
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3005/health');

    // Check the action endpoint call with proper routing
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3005/action',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'navigate',
          parameters: {
            target: 'tree',
            action: 'gather_wood',
            max_distance: 20,
          },
        }),
      })
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      success: true,
      error: undefined,
      type: 'action',
      actionType: 'navigate',
      data: { position: { x: 10, y: 71, z: 29 }, blocksFound: 3 },
    });
  });

  it('should handle action task type with crafting', async () => {
    const mockFetch = global.fetch as any;
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
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3005/action',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'craft_item',
          parameters: {
            item: 'wooden_axe',
            materials: 'auto_collect',
          },
        }),
      })
    );

    expect(result.success).toBe(true);
    expect(result.data.type).toBe('action');
    expect(result.data.actionType).toBe('craft_item');
  });

  it('should handle action task type with default exploration fallback', async () => {
    const mockFetch = global.fetch as any;
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
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3005/action',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'explore',
          parameters: {},
        }),
      })
    );

    expect(result.success).toBe(true);
    expect(result.data.actionType).toBe('explore');
  });

  it('should handle minecraft interface errors gracefully', async () => {
    const mockFetch = global.fetch as any;
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
    expect(result.error).toContain('Minecraft interface responded with 500');
    expect(result.data.type).toBe('action');
  });

  it('should detect bot disconnection and return appropriate error', async () => {
    const mockFetch = global.fetch as any;
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
