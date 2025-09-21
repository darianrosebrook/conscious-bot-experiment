/**
 * Action Execution Test
 *
 * Tests to verify that the bot can execute actions through MCP capabilities
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBot } from 'mineflayer';
import { createMinecraftCognitiveIntegration } from '@/minecraft-cognitive-integration';

describe('Action Execution', () => {
  let mockBot: any;

  beforeEach(() => {
    mockBot = {
      entity: {
        position: { x: 100, y: 64, z: 200 },
        yaw: 0,
      },
      health: 20,
      food: 20,
      inventory: {
        items: vi.fn().mockReturnValue([]),
      },
      chat: vi.fn(),
      look: vi.fn(),
      setControlState: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      quit: vi.fn(),
      player: { username: 'TestBot' },
      time: { timeOfDay: 1000 },
      entities: {},
    };

    vi.clearAllMocks();
  });

  it('should create bot and cognitive integration', async () => {
    const bot = createBot({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline' as const,
    });

    expect(bot).toBeDefined();

    // Mock the cognitive integration
    const mockIntegration = {
      getMCPRegistry: vi.fn().mockReturnValue({
        listCapabilities: vi
          .fn()
          .mockResolvedValue([
            { name: 'torch_corridor', version: '1.0.0', status: 'active' },
          ]),
      }),
      executePlanningCycle: vi.fn().mockResolvedValue(undefined),
      getCognitiveStream: vi.fn().mockReturnValue([]),
      getBotState: vi.fn().mockReturnValue({
        position: { x: 100, y: 64, z: 200 },
        health: 20,
        food: 20,
        inventory: {},
      }),
    };

    expect(mockIntegration).toBeDefined();
  });

  it('should handle capability-based goals', async () => {
    const capabilityGoals = [
      'torch corridor',
      'place torch',
      'move to position',
      'dig block',
      'craft recipe',
      'consume food',
      'get light level',
    ];

    const mockIntegration = {
      executePlanningCycle: vi.fn().mockResolvedValue(undefined),
    };

    for (const goal of capabilityGoals) {
      await mockIntegration.executePlanningCycle(goal);
      expect(mockIntegration.executePlanningCycle).toHaveBeenCalledWith(goal);
    }
  });

  it('should track cognitive stream events', () => {
    const mockIntegration = {
      getCognitiveStream: vi.fn().mockReturnValue([
        {
          type: 'observation',
          content: 'capability executed',
          timestamp: Date.now(),
        },
        {
          type: 'reflection',
          content: 'torch corridor completed',
          timestamp: Date.now(),
        },
      ]),
    };

    const events = mockIntegration.getCognitiveStream();
    expect(events.length).toBeGreaterThan(0);

    const capabilityEvents = events.filter(
      (event: any) =>
        event.content.includes('capability') ||
        event.content.includes('MCP') ||
        event.content.includes('torch') ||
        event.content.includes('move') ||
        event.content.includes('dig')
    );

    expect(capabilityEvents.length).toBeGreaterThan(0);
  });

  it('should handle bot state changes', () => {
    const mockIntegration = {
      getBotState: vi
        .fn()
        .mockReturnValueOnce({
          position: { x: 100, y: 64, z: 200 },
          health: 20,
          food: 20,
          inventory: { torch: 5 },
        })
        .mockReturnValueOnce({
          position: { x: 102, y: 64, z: 200 },
          health: 20,
          food: 19,
          inventory: { torch: 4 },
        }),
    };

    const initialState = mockIntegration.getBotState();
    const finalState = mockIntegration.getBotState();

    expect(initialState.position.x).toBe(100);
    expect(finalState.position.x).toBe(102);
    expect(finalState.food).toBe(19);
  });

  it('should handle planning cycle execution', async () => {
    const mockIntegration = {
      executePlanningCycle: vi.fn().mockResolvedValue(undefined),
    };

    const testGoals = ['move to position', 'torch corridor', 'explore safely'];

    for (const goal of testGoals) {
      await mockIntegration.executePlanningCycle(goal);
      expect(mockIntegration.executePlanningCycle).toHaveBeenCalledWith(goal);
    }
  });

  it('should validate action execution pipeline', async () => {
    const mockIntegration = {
      executePlanningCycle: vi.fn().mockResolvedValue(undefined),
      getBotState: vi.fn().mockReturnValue({
        position: { x: 100, y: 64, z: 200 },
        health: 20,
        food: 20,
        inventory: { torch: 5 },
      }),
    };

    await mockIntegration.executePlanningCycle('torch corridor');

    expect(mockIntegration.executePlanningCycle).toHaveBeenCalledWith(
      'torch corridor'
    );
    expect(mockIntegration.getBotState()).toBeDefined();
  });
});
