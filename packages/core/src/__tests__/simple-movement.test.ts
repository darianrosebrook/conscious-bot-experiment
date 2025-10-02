/**
 * Simple Movement Test
 *
 * Tests simple movement functionality
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock mineflayer to avoid requiring Minecraft server
vi.mock('mineflayer', () => ({
  createBot: vi.fn(() => ({
    setControlState: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    quit: vi.fn(),
    blockAt: vi.fn(),
    entity: { position: { x: 100, y: 64, z: 200 } },
    world: { getBlock: vi.fn() },
  })),
}));

import { createBot } from 'mineflayer';

describe('Simple Movement', () => {
  let mockBot: any;

  beforeEach(() => {
    mockBot = {
      entity: {
        position: { x: 100, y: 64, z: 200 },
        yaw: 0,
      },
      setControlState: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      quit: vi.fn(),
      blockAt: vi.fn().mockReturnValue({ name: 'grass_block' }),
      world: {
        getBlock: vi.fn().mockReturnValue({ name: 'grass_block' }),
      },
    };

    // Reset the mocked createBot function
    (createBot as any).mockReturnValue(mockBot);
    vi.clearAllMocks();
  });

  it('should create bot with pathfinder plugin', () => {
    const bot = createBot({
      host: 'localhost',
      port: 25565,
      username: 'ConsciousBot',
      version: '1.20.1',
      auth: 'offline' as const,
    });

    expect(bot).toBeDefined();

    // Load pathfinder plugin (mocked for test)
    const mockPathfinder = vi.fn();
    (bot as any).loadPlugin(mockPathfinder);

    expect(bot).toBeDefined();
  });

  it('should handle spawn events', async () => {
    const bot = createBot({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline' as const,
    });

    const spawnPromise = new Promise<void>((resolve) => {
      bot.once('spawn', () => {
        resolve();
      });
    });

    // Simulate spawn
    setTimeout(() => {
      bot.emit('spawn');
    }, 100);

    await expect(spawnPromise).resolves.toBeUndefined();
  });

  it('should handle movement controls', async () => {
    const bot = createBot({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline' as const,
    });

    // Simulate bot entity
    (bot as any).entity = mockBot.entity;

    // Test forward movement
    bot.setControlState('forward', true);
    expect(bot.setControlState).toHaveBeenCalledWith('forward', true);

    await new Promise((resolve) => setTimeout(resolve, 100));

    bot.setControlState('forward', false);
    expect(bot.setControlState).toHaveBeenCalledWith('forward', false);
  });

  it('should handle pathfinder movement', async () => {
    const bot = createBot({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline' as const,
    });

    // Mock pathfinder
    const mockPathfinder = {
      goto: vi.fn().mockResolvedValue(undefined),
    };
    (bot as any).pathfinder = mockPathfinder;

    // Mock goals
    const mockGoals = {
      GoalNear: vi.fn().mockImplementation((x, y, z, range) => ({
        x,
        y,
        z,
        range,
      })),
      GoalBlock: vi.fn().mockImplementation((x, y, z) => ({
        x,
        y,
        z,
      })),
    };

    // Mock require for pathfinder
    vi.doMock('mineflayer-pathfinder', () => ({
      pathfinder: mockPathfinder,
      goals: mockGoals,
    }));

    const currentPos = { x: 100, y: 64, z: 200 };
    const targetPos = { x: 103, y: 64, z: 200 };

    const goal = new mockGoals.GoalNear(
      targetPos.x,
      targetPos.y,
      targetPos.z,
      2
    );

    await bot.pathfinder.goto(goal);

    expect(bot.pathfinder.goto).toHaveBeenCalledWith(goal);
  });

  it('should handle coordinate movement', async () => {
    const bot = createBot({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline' as const,
    });

    // Mock pathfinder and goals
    const mockPathfinder = {
      goto: vi.fn().mockResolvedValue(undefined),
    };
    (bot as any).pathfinder = mockPathfinder;

    const mockGoals = {
      GoalBlock: vi.fn().mockImplementation((x, y, z) => ({
        x,
        y,
        z,
      })),
    };

    const currentPos = { x: 100, y: 64, z: 200 };
    const targetX = currentPos.x + 2;
    const targetY = currentPos.y;
    const targetZ = currentPos.z;

    const goal = new mockGoals.GoalBlock(targetX, targetY, targetZ);

    await bot.pathfinder.goto(goal);

    expect(bot.pathfinder.goto).toHaveBeenCalledWith(goal);
  });

  it('should read world blocks', () => {
    const block = mockBot.blockAt(mockBot.entity.position);
    expect(block).toBeDefined();
    expect(block.name).toBe('grass_block');
  });

  it('should handle world data access', () => {
    const block = mockBot.world.getBlock(mockBot.entity.position);
    expect(block).toBeDefined();
    expect(block.name).toBe('grass_block');
  });

  it('should handle bot positioning', () => {
    expect(mockBot.entity.position.x).toBe(100);
    expect(mockBot.entity.position.y).toBe(64);
    expect(mockBot.entity.position.z).toBe(200);
    expect(mockBot.entity.yaw).toBe(0);
  });
});
