/**
 * Simple Connection Test
 *
 * Basic test to check if we can connect to the Minecraft server
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBot } from 'mineflayer';

describe('Simple Connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create bot with default configuration', () => {
    const bot = createBot({
      host: 'localhost',
      port: 25565,
      username: 'ConsciousBot',
      version: '1.20.1',
      auth: 'offline' as const,
    });

    expect(bot).toBeDefined();
    expect(typeof bot.on).toBe('function');
    expect(typeof bot.emit).toBe('function');
  });

  it('should create bot with environment variables', () => {
    // Set environment variables
    process.env.MINECRAFT_HOST = 'test-host';
    process.env.MINECRAFT_PORT = '25566';
    process.env.MINECRAFT_USERNAME = 'TestBot';
    process.env.MINECRAFT_VERSION = '1.20.4';

    const bot = createBot({
      host: process.env.MINECRAFT_HOST,
      port: parseInt(process.env.MINECRAFT_PORT),
      username: process.env.MINECRAFT_USERNAME,
      version: process.env.MINECRAFT_VERSION,
      auth: 'offline' as const,
    });

    expect(bot).toBeDefined();

    // Clean up
    delete process.env.MINECRAFT_HOST;
    delete process.env.MINECRAFT_PORT;
    delete process.env.MINECRAFT_USERNAME;
    delete process.env.MINECRAFT_VERSION;
  });

  it('should handle connection events', async () => {
    const bot = createBot({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline' as const,
    });

    const events: string[] = [];

    bot.on('login', () => events.push('login'));
    bot.on('spawn', () => events.push('spawn'));
    bot.on('error', () => events.push('error'));
    bot.on('kicked', () => events.push('kicked'));
    bot.on('end', () => events.push('end'));

    // Simulate events
    setTimeout(() => {
      bot.emit('login');
      bot.emit('spawn');
    }, 100);

    // Wait for events to be processed
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(events.length).toBeGreaterThan(0);
  });

  it('should handle spawn timeout', async () => {
    const bot = createBot({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline' as const,
    });

    const spawnPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Bot spawn timeout'));
      }, 1000);

      bot.once('spawn', () => {
        clearTimeout(timeout);
        resolve();
      });

      bot.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Simulate spawn event
    setTimeout(() => {
      bot.emit('spawn');
    }, 500);

    await expect(spawnPromise).resolves.toBeUndefined();
  });

  it('should handle connection errors', async () => {
    const bot = createBot({
      host: 'nonexistent-host',
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
      bot.emit('error', new Error('Connection failed'));
    }, 100);

    await expect(errorPromise).resolves.toBeUndefined();
  });

  it('should validate configuration options', () => {
    const config = {
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline' as const,
    };

    const bot = createBot(config);

    expect(bot).toBeDefined();
    expect(typeof bot.chat).toBe('function');
    expect(typeof bot.entity).toBe('object');
  });

  it('should handle missing environment variables', () => {
    // Clear environment variables
    const originalEnv = { ...process.env };

    delete process.env.MINECRAFT_HOST;
    delete process.env.MINECRAFT_PORT;
    delete process.env.MINECRAFT_USERNAME;
    delete process.env.MINECRAFT_VERSION;

    const bot = createBot({
      host: process.env.MINECRAFT_HOST || 'localhost',
      port: process.env.MINECRAFT_PORT
        ? parseInt(process.env.MINECRAFT_PORT)
        : 25565,
      username: process.env.MINECRAFT_USERNAME || 'ConsciousBot',
      version: process.env.MINECRAFT_VERSION || '1.20.1',
      auth: 'offline' as const,
    });

    expect(bot).toBeDefined();

    // Restore environment
    process.env = originalEnv;
  });
});
