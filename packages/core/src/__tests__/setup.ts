/**
 * Vitest Test Setup
 *
 * Configures Vitest environment for testing the core package
 *
 * @author @darianrosebrook
 */

import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// Set up global test environment
beforeAll(() => {
  // Set up any global test configuration
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  // Clean up any global test state
});

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
beforeEach(() => {
  // Temporarily disable console mocking for debugging
  // console.log = vi.fn();
  // console.warn = vi.fn();
  // console.error = vi.fn();
});

afterEach(() => {
  // console.log = originalConsole.log;
  // console.warn = originalConsole.warn;
  // console.error = originalConsole.error;
});

// Global test utilities
(global as any).testUtils = {
  createMockBot: () => ({
    entity: {
      position: { x: 0, y: 64, z: 0 },
    },
    health: 20,
    food: 20,
    inventory: {
      items: () => [],
    },
    on: vi.fn(),
    removeListener: vi.fn(),
  }),

  createMockLeafContext: () => ({
    bot: (global as any).testUtils.createMockBot(),
    abortSignal: new AbortController().signal,
    now: () => Date.now(),
    snapshot: vi.fn().mockResolvedValue({}),
    inventory: vi.fn().mockResolvedValue({}),
    emitMetric: vi.fn(),
  }),

  waitForAsync: (ms: number = 100) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
};
