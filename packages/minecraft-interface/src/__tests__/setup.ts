/**
 * Test setup file for minecraft-interface package
 * 
 * @author @darianrosebrook
 */

// Global test setup
beforeAll(() => {
  // Set up any global test configuration
  process.env.NODE_ENV = 'test';
  
  // Mock console methods to reduce noise in tests
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  // Clean up global mocks
  jest.restoreAllMocks();
});

// Global test utilities
export const createMockBot = () => ({
  entity: {
    position: { x: 0, y: 64, z: 0 },
    on: jest.fn(),
    once: jest.fn(),
  },
  inventory: {
    items: () => [],
    slots: () => [],
  },
  blockAt: jest.fn().mockReturnValue(null),
  findBlock: jest.fn().mockResolvedValue(null),
  pathfinder: {
    goto: jest.fn().mockResolvedValue({}),
    stop: jest.fn(),
  },
  chat: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
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
