/**
 * Test Setup for Dashboard Package
 *
 * Configures the testing environment with global mocks and setup
 * for the dashboard components and cognitive stream integration tests.
 *
 * @author @darianrosebrook
 */

import '@testing-library/vi-dom';

// Global test timeout
vi.setTimeout(10000);

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

// Mock Next.js router
vi.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: vi.fn(),
      pop: vi.fn(),
      reload: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn().mockResolvedValue(undefined),
      beforePopState: vi.fn(),
      events: {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
      },
      isFallback: false,
    };
  },
}));

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
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
global.EventSource = vi.fn().mockImplementation(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
  readyState: 1,
  url: 'http://localhost:3000/api/ws/cot',
}));

// Mock Date.now for consistent timestamps in tests
const mockDate = new Date('2024-01-01T00:00:00.000Z');
vi.spyOn(Date, 'now').mockImplementation(() => mockDate.getTime());

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
  // eslint-disable-next-line no-var
  var testUtils: {
    createMockCognitiveFeedback: (overrides?: any) => any;
    createMockTask: (overrides?: any) => any;
    createMockThought: (overrides?: any) => any;
    waitForAsync: (ms?: number) => Promise<void>;
  };
}
