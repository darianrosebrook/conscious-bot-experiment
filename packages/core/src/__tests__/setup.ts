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
  /**
   * Create a comprehensive mock bot for testing
   */
  createMockBot: (overrides: any = {}) => ({
    entity: {
      position: { x: 100, y: 64, z: 200 },
      yaw: 0,
      ...overrides.entity,
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
    blockAt: vi.fn().mockReturnValue({ name: 'grass_block' }),
    world: {
      getBlock: vi.fn().mockReturnValue({ name: 'grass_block' }),
    },
    ...overrides,
  }),

  /**
   * Create a mock cognitive integration for testing
   */
  createMockCognitiveIntegration: (overrides: any = {}) => ({
    getBotState: vi.fn().mockReturnValue({
      position: { x: 100, y: 64, z: 200 },
      health: 20,
      food: 20,
      inventory: { torch: 5 },
    }),
    getMCPCapabilitiesStatus: vi.fn().mockResolvedValue({
      total: 10,
      active: 8,
      shadow: 2,
    }),
    executePlanningCycle: vi.fn().mockResolvedValue(undefined),
    getCognitiveStream: vi.fn().mockReturnValue([]),
    updateBotState: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    emit: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }),

  /**
   * Create a mock leaf context for testing
   */
  createMockLeafContext: (overrides: any = {}) => ({
    bot: (global as any).testUtils.createMockBot(),
    abortSignal: new AbortController().signal,
    now: vi.fn(() => Date.now()),
    snapshot: vi.fn().mockResolvedValue({
      position: { x: 0, y: 64, z: 0 },
      biome: 'plains',
      time: Date.now(),
      lightLevel: 15,
      nearbyHostiles: [],
      weather: 'clear',
      inventory: {
        items: [],
        selectedSlot: 0,
        totalSlots: 36,
        freeSlots: 36,
      },
      toolDurability: {},
      waypoints: [],
    }),
    inventory: vi.fn().mockResolvedValue({
      items: [],
      selectedSlot: 0,
      totalSlots: 36,
      freeSlots: 36,
    }),
    emitMetric: vi.fn(),
    emitError: vi.fn(),
    ...overrides,
  }),

  /**
   * Wait for async operations in tests
   */
  waitForAsync: (ms: number = 100) =>
    new Promise((resolve) => setTimeout(resolve, ms)),

  /**
   * Create mock event emitter for testing
   */
  createMockEventEmitter: () => ({
    on: vi.fn(),
    emit: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  }),

  /**
   * Create mock MCP registry for testing
   */
  createMockMCPRegistry: (overrides: any = {}) => ({
    listCapabilities: vi.fn().mockResolvedValue([
      { name: 'torch_corridor', version: '1.0.0', status: 'active' },
      { name: 'move_to', version: '1.0.0', status: 'active' },
    ]),
    getCapabilities: vi
      .fn()
      .mockResolvedValue([
        { name: 'torch_corridor', version: '1.0.0', status: 'active' },
      ]),
    ...overrides,
  }),

  /**
   * Create test bot state for testing
   */
  createTestBotState: (overrides: any = {}) => ({
    position: { x: 100, y: 64, z: 200 },
    health: 20,
    food: 20,
    inventory: { torch: 5, apple: 2 },
    currentTask: 'exploring',
    ...overrides,
  }),
};
