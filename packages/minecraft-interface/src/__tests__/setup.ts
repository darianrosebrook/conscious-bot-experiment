/**
 * Test setup file for minecraft-interface package
 *
 * @author @darianrosebrook
 */

import { vi, beforeAll, afterAll } from 'vitest';

// Global test setup
beforeAll(() => {
  // Set up any global test configuration
  (process.env as any).NODE_ENV = 'test';

  // Mock console methods to reduce noise in tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  // Clean up global mocks
  vi.restoreAllMocks();
});

// Global test utilities
export const createMockBot = () => ({
  entity: {
    position: { x: 0, y: 64, z: 0 },
    on: vi.fn(),
    once: vi.fn(),
  },
  inventory: {
    items: () => [],
    slots: () => [],
  },
  blockAt: vi.fn().mockReturnValue(null),
  findBlock: vi.fn().mockResolvedValue(null),
  pathfinder: {
    goto: vi.fn().mockResolvedValue({}),
    stop: vi.fn(),
  },
  chat: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  emit: vi.fn(),
});

export const createMockWorld = () => ({
  blocks: new Map(),
  entities: new Map(),
  players: new Map(),
});

export const createMockContext = () => ({
  worldSeed: 'test-seed',
  worldName: 'test-world',
  sessionId: 'test-session-123',
});
