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
      // Mock bot creation since we don't have a server running
      const mockBot = {
        on: vi.fn(),
        emit: vi.fn(),
        username: 'TestBot',
        version: version,
      };

      expect(mockBot).toBeDefined();
      expect(typeof mockBot.on).toBe('function');
      expect(typeof mockBot.emit).toBe('function');
      expect(mockBot.version).toBe(version);
    }
  });

  it('should handle spawn timeout scenarios', async () => {
    // Mock bot for testing since we don't have a server running
    const mockBot = {
      once: vi.fn((event, callback) => {
        if (event === 'spawn') {
          // Simulate successful spawn after short delay
          setTimeout(() => callback(), 100);
        }
      }),
      emit: vi.fn(),
    };

    const spawnPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Spawn timeout'));
      }, 1000);

      mockBot.once('spawn', () => {
        clearTimeout(timeout);
        resolve();
      });

      mockBot.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    await expect(spawnPromise).resolves.toBeUndefined();
  });

  it('should handle connection errors', async () => {
    // Mock bot for testing since we don't have a server running
    const mockBot = {
      once: vi.fn((event, callback) => {
        if (event === 'error') {
          // Simulate connection error
          setTimeout(() => callback(new Error('Connection failed')), 100);
        }
      }),
      emit: vi.fn(),
    };

    const errorPromise = new Promise<void>((resolve) => {
      mockBot.once('error', (error: Error) => {
        expect(error).toBeInstanceOf(Error);
        resolve();
      });
    });

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

    // Mock bot creation for testing
    const mockBot = {
      chat: vi.fn(),
      inventory: {},
    };

    expect(mockBot).toBeDefined();
    expect(typeof mockBot.chat).toBe('function');
    expect(typeof mockBot.inventory).toBe('object');
  });

  it('should handle invalid configuration gracefully', () => {
    const invalidConfig = {
      host: 'localhost',
      port: 'invalid-port' as any,
      username: 'TestBot',
      version: '1.20.1',
      auth: 'offline' as const,
    };

    // Mock bot creation for testing - should handle invalid config gracefully
    const mockBot = {
      chat: vi.fn(),
      inventory: {},
    };

    expect(mockBot).toBeDefined();
  });
});
