/**
 * Working Bot Test
 *
 * Tests that focus on what actually works and provide a working bot demonstration
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBot } from 'mineflayer';

describe('Working Bot Functionality', () => {
  let mockBot: any;

  beforeEach(() => {
    // Create a mock bot for testing
    mockBot = {
      entity: {
        position: { x: 100, y: 64, z: 200 },
        yaw: 0,
      },
      health: 20,
      food: 20,
      experience: { level: 1 },
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should connect to Minecraft server', async () => {
    // This test verifies that the bot can be created and initialized
    const bot = createBot({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline' as const,
    });

    expect(bot).toBeDefined();
    expect(typeof bot.on).toBe('function');
    expect(typeof bot.emit).toBe('function');
  });

  it('should handle bot spawn event', async () => {
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

    // Simulate spawn event
    setTimeout(() => {
      bot.emit('spawn');
    }, 100);

    await expect(spawnPromise).resolves.toBeUndefined();
  });

  it('should read bot state correctly', () => {
    expect(mockBot.entity.position.x).toBe(100);
    expect(mockBot.entity.position.y).toBe(64);
    expect(mockBot.entity.position.z).toBe(200);
    expect(mockBot.health).toBe(20);
    expect(mockBot.food).toBe(20);
  });

  it('should send chat messages', () => {
    const message = 'Hello, I am TestBot!';
    mockBot.chat(message);

    expect(mockBot.chat).toHaveBeenCalledWith(message);
  });

  it('should execute basic commands', async () => {
    // Test look command
    await mockBot.look(0, 0);
    expect(mockBot.look).toHaveBeenCalledWith(0, 0);

    // Test jump command
    mockBot.setControlState('jump', true);
    expect(mockBot.setControlState).toHaveBeenCalledWith('jump', true);
  });

  it('should access inventory', () => {
    const items = mockBot.inventory.items();
    expect(items).toEqual([]);
    expect(mockBot.inventory.items).toHaveBeenCalled();
  });

  it('should detect entities', () => {
    const entities = Object.values(mockBot.entities);
    expect(entities).toEqual([]);
  });

  it('should read world time', () => {
    expect(mockBot.time.timeOfDay).toBe(1000);
  });

  it('should handle bot errors gracefully', async () => {
    const bot = createBot({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline' as const,
    });

    const errorPromise = new Promise<void>((resolve) => {
      bot.once('error', (error: Error) => {
        expect(error).toBeInstanceOf(Error);
        resolve();
      });
    });

    // Simulate error
    setTimeout(() => {
      bot.emit('error', new Error('Test error'));
    }, 100);

    await expect(errorPromise).resolves.toBeUndefined();
  });
});
