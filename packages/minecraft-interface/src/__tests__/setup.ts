/**
 * Test setup for Minecraft interface tests
 */

// Extend Jest timeout for Minecraft operations
jest.setTimeout(30000);

// Mock mineflayer for unit tests
jest.mock('mineflayer', () => ({
  createBot: jest.fn(),
}));

jest.mock('mineflayer-pathfinder', () => ({
  pathfinder: {},
  Movements: jest.fn(),
  goals: {
    GoalNear: jest.fn(),
  },
}));

// Global test utilities
(global as any).createMockBot = () => ({
  entity: {
    position: { x: 0, y: 64, z: 0, clone: () => ({ x: 0, y: 64, z: 0 }) },
    yaw: 0,
    pitch: 0,
  },
  health: 20,
  food: 20,
  foodSaturation: 5,
  experience: { points: 0 },
  game: { gameMode: 'survival', dimension: 'overworld', difficulty: 'normal' },
  time: { timeOfDay: 6000 },
  isRaining: false,
  inventory: {
    slots: new Array(36).fill(null),
    items: () => [],
  },
  entities: {},
  players: {},
  version: '1.20.1',
  username: 'TestBot',
  loadPlugin: jest.fn(),
  blockAt: jest.fn(() => null),
  on: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
  quit: jest.fn(),
  end: jest.fn(),
  lookAt: jest.fn(),
  dig: jest.fn(),
  craft: jest.fn(),
  equip: jest.fn(),
  recipesFor: jest.fn(() => []),
  canCraft: jest.fn(() => true),
  mcData: {
    itemsByName: {},
  },
  pathfinder: {
    setMovements: jest.fn(),
    setGoal: jest.fn(),
  },
  setControlState: jest.fn(),
  heldItem: null,
});
