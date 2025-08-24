/**
 * Test Setup for Dashboard Package
 *
 * Configures the testing environment with global mocks and setup
 * for the dashboard components and cognitive stream integration tests.
 *
 * @author @darianrosebrook
 */

import '@testing-library/jest-dom';

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
beforeAll(() => {
  // Suppress console.log and console.error during tests unless explicitly needed
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  // Restore original console methods
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
});

// Mock fetch for HTTP requests
global.fetch = jest.fn();

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: jest.fn(),
      pop: jest.fn(),
      reload: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn().mockResolvedValue(undefined),
      beforePopState: jest.fn(),
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
      isFallback: false,
    };
  },
}));

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return '/';
  },
}));

// Mock Server-Sent Events
global.EventSource = jest.fn().mockImplementation(() => ({
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  close: jest.fn(),
  readyState: 1,
  url: 'http://localhost:3000/api/ws/cot',
}));

// Mock Date.now for consistent timestamps in tests
const mockDate = new Date('2024-01-01T00:00:00.000Z');
jest.spyOn(Date, 'now').mockImplementation(() => mockDate.getTime());

// Global test utilities
global.testUtils = {
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

  createMockTask: (overrides = {}) => ({
    id: `test-task-${Date.now()}`,
    type: 'mine',
    description: 'Test task',
    status: 'completed',
    cognitiveFeedback: null,
    ...overrides,
  }),

  createMockThought: (overrides = {}) => ({
    id: `thought-${Date.now()}`,
    ts: new Date().toISOString(),
    text: 'Test thought',
    type: 'reflection' as const,
    ...overrides,
  }),

  waitForAsync: (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// Type declarations for global test utilities
declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        createMockCognitiveFeedback: (overrides?: any) => any;
        createMockTask: (overrides?: any) => any;
        createMockThought: (overrides?: any) => any;
        waitForAsync: (ms?: number) => Promise<void>;
      };
    }
  }
}
