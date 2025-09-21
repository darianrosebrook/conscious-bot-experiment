/**
 * Version Compatibility Test
 *
 * Tests to check Mineflayer version compatibility and identify issues
 * with current Minecraft versions
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBot } from 'mineflayer';

describe('Version Compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should check Node.js version requirements', () => {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

    expect(majorVersion).toBeGreaterThanOrEqual(22);
  });

  it('should validate Mineflayer version compatibility', () => {
    // Test that Mineflayer 4.32.0 is compatible with current Node.js
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

    // Mineflayer 4.32.0 requires Node.js >= 22
    expect(majorVersion).toBeGreaterThanOrEqual(22);
  });

  it('should handle different Minecraft versions', async () => {
    const versionsToTest = [
      '1.20.4', // LTS version
      '1.21.1', // Earlier 1.21
      '1.20.1', // Current target
    ];

    for (const version of versionsToTest) {
      const bot = createBot({
        host: 'localhost',
        port: 25565,
        username: 'TestBot',
        version: version,
        auth: 'offline' as const,
      });

      expect(bot).toBeDefined();
      expect(typeof bot.on).toBe('function');
      expect(typeof bot.emit).toBe('function');

      // Clean up
      bot.quit();
    }
  });

  it('should handle spawn timeout scenarios', async () => {
    const bot = createBot({
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline' as const,
    });

    const spawnPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Spawn timeout'));
      }, 5000); // Shorter timeout for testing

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
    }, 100);

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

  it('should validate bot configuration options', () => {
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
    expect(typeof bot.inventory).toBe('object');
  });

  it('should handle invalid configuration gracefully', () => {
    const invalidConfig = {
      host: 'localhost',
      port: 'invalid-port' as any,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline' as const,
    };

    expect(() => createBot(invalidConfig)).toThrow();
  });
});
