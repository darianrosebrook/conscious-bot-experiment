/**
 * Test Setup for Planning Package
 *
 * Configures the testing environment with global mocks and setup
 * for the planning system and cognitive integration tests.
 *
 * @author @darianrosebrook
 */

import { vi } from 'vitest';

// Global test timeout
vi.setConfig({ testTimeout: 10000 });

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
beforeAll(() => {
  // Suppress console.log and console.error during tests unless explicitly needed
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  // Restore original console methods
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
});

// Mock fetch for HTTP requests
global.fetch = vi.fn();

// Mock EventEmitter for cognitive integration
vi.mock('events', () => {
  const EventEmitter = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    removeListener: vi.fn(),
  }));
  return { EventEmitter };
});

// Mock Date.now for consistent timestamps in tests
const mockDate = new Date('2024-01-01T00:00:00.000Z');
vi.spyOn(Date, 'now').mockImplementation(() => mockDate.getTime());

// Global test utilities
(global as any).testUtils = {
  createMockTask: (overrides = {}) => ({
    id: `test-task-${Date.now()}`,
    type: 'mine',
    description: 'Test task',
    priority: 0.5,
    urgency: 0.5,
    status: 'pending',
    createdAt: Date.now(),
    completedAt: null,
    autonomous: false,
    ...overrides,
  }),

  createMockResult: (overrides = {}) => ({
    success: true,
    type: 'mining',
    error: undefined,
    ...overrides,
  }),

  createMockCognitiveFeedback: (overrides = {}) => ({
    taskId: `test-task-${Date.now()}`,
    success: true,
    reasoning: 'Test reasoning',
    alternativeSuggestions: [],
    emotionalImpact: 'positive' as const,
    confidence: 0.8,
    timestamp: Date.now(),
    ...overrides,
  }),

  waitForAsync: (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// Global test utilities are available as (global as any).testUtils
