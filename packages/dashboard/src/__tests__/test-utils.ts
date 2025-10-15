/**
 * Dashboard Test Utilities
 *
 * Centralized test utilities and mock factories for the dashboard package.
 * Replaces scattered mock objects with proper, isolated test utilities.
 *
 * @author @darianrosebrook
 */
import { vi } from 'vitest';

// ============================================================================
// Mock Data Factories
// ============================================================================

/**
 * Creates a mock task for testing
 */
export function createMockTask(overrides: any = {}) {
  return {
    id: `test-task-${Date.now()}`,
    type: 'mine',
    description: 'Test task for testing',
    priority: 0.5,
    urgency: 0.5,
    status: 'pending',
    createdAt: Date.now(),
    completedAt: null,
    autonomous: false,
    parameters: {},
    goal: 'test_goal',
    source: 'planner' as const,
    progress: 0,
    steps: [
      { id: 'step-1', label: 'Test step 1', done: false },
      { id: 'step-2', label: 'Test step 2', done: false },
    ],
    ...overrides,
  };
}

/**
 * Creates a mock cognitive feedback for testing
 */
export function createMockCognitiveFeedback(overrides: any = {}) {
  return {
    taskId: `test-task-${Date.now()}`,
    success: true,
    reasoning: 'Test reasoning for testing',
    alternativeSuggestions: [],
    emotionalImpact: 'positive' as const,
    confidence: 0.8,
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Creates a mock thought for testing
 */
export function createMockThought(overrides: any = {}) {
  return {
    id: `thought-${Date.now()}`,
    ts: new Date().toISOString(),
    text: 'Test thought for testing',
    type: 'reflection' as const,
    ...overrides,
  };
}

/**
 * Creates a mock bot state for testing
 */
export function createMockBotState(overrides: any = {}) {
  return {
    connected: true,
    health: 20,
    food: 20,
    position: { x: 0, y: 64, z: 0 },
    inventory: {
      items: [
        { name: 'oak_log', count: 5 },
        { name: 'cobblestone', count: 10 },
      ],
      emptySlots: 34,
    },
    environment: {
      timeOfDay: 6000,
      lightLevel: 15,
      nearbyEntities: [],
    },
    ...overrides,
  };
}

/**
 * Creates a mock planning data for testing
 */
export function createMockPlanningData(overrides: any = {}) {
  return {
    currentPlan: {
      id: 'test-plan',
      goalId: 'test-goal',
      steps: [
        { id: 'step-1', action: 'mine', status: 'completed' },
        { id: 'step-2', action: 'craft', status: 'pending' },
      ],
      status: 'executing',
      priority: 0.8,
    },
    activeGoals: [
      { id: 'test-goal', type: 'survival', priority: 0.8, status: 'active' },
    ],
    taskQueue: [
      createMockTask({ status: 'pending' }),
      createMockTask({ status: 'completed' }),
    ],
    ...overrides,
  };
}

/**
 * Creates a mock memory for testing
 */
export function createMockMemory(overrides: any = {}) {
  return {
    id: `memory-${Date.now()}`,
    type: 'episodic' as const,
    content: 'Test memory content',
    timestamp: Date.now(),
    importance: 0.7,
    associations: [],
    ...overrides,
  };
}

/**
 * Creates a mock event for testing
 */
export function createMockEvent(overrides: any = {}) {
  return {
    id: `event-${Date.now()}`,
    type: 'task_completed' as const,
    description: 'Test event description',
    timestamp: Date.now(),
    data: {},
    ...overrides,
  };
}

/**
 * Creates a mock note for testing
 */
export function createMockNote(overrides: any = {}) {
  return {
    id: `note-${Date.now()}`,
    title: 'Test Note',
    content: 'Test note content',
    timestamp: Date.now(),
    tags: ['test'],
    ...overrides,
  };
}

// ============================================================================
// Mock API Responses
// ============================================================================

/**
 * Creates a mock API response for testing
 */
export function createMockApiResponse<T>(data: T, overrides: any = {}) {
  return {
    data,
    timestamp: new Date().toISOString(),
    status: 'success',
    ...overrides,
  };
}

/**
 * Creates a mock error response for testing
 */
export function createMockErrorResponse(error: string, overrides: any = {}) {
  return {
    error,
    timestamp: new Date().toISOString(),
    status: 'error',
    ...overrides,
  };
}

/**
 * Creates a mock tasks API response for testing
 */
export function createMockTasksResponse(overrides: any = {}) {
  return createMockApiResponse(
    {
      tasks: [
        createMockTask({ status: 'pending' }),
        createMockTask({ status: 'completed' }),
      ],
      timestamp: new Date().toISOString(),
      status: 'active',
    },
    overrides
  );
}

/**
 * Creates a mock bot state API response for testing
 */
export function createMockBotStateResponse(overrides: any = {}) {
  return createMockApiResponse(createMockBotState(), overrides);
}

/**
 * Creates a mock planning data API response for testing
 */
export function createMockPlanningDataResponse(overrides: any = {}) {
  return createMockApiResponse(createMockPlanningData(), overrides);
}

// ============================================================================
// Mock Router and Navigation
// ============================================================================

/**
 * Creates a mock router for testing
 */
export function createMockRouter(overrides: any = {}) {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
    events: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
    ...overrides,
  };
}

/**
 * Creates a mock navigation for testing
 */
export function createMockNavigation(overrides: any = {}) {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    ...overrides,
  };
}

// ============================================================================
// Mock WebSocket
// ============================================================================

/**
 * Creates a mock WebSocket for testing
 */
export function createMockWebSocket(overrides: any = {}) {
  return {
    readyState: 1, // OPEN
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    ...overrides,
  };
}

/**
 * Creates a mock WebSocket event for testing
 */
export function createMockWebSocketEvent(data: any, overrides: any = {}) {
  return {
    type: 'message',
    data: JSON.stringify(data),
    target: createMockWebSocket(),
    ...overrides,
  };
}

// ============================================================================
// Mock Fetch
// ============================================================================

/**
 * Creates a mock fetch response for testing
 */
export function createMockFetchResponse(data: any, overrides: any = {}) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    headers: new Headers(),
    ...overrides,
  };
}

/**
 * Creates a mock fetch error response for testing
 */
export function createMockFetchErrorResponse(
  error: string,
  overrides: any = {}
) {
  return {
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    json: vi.fn().mockRejectedValue(new Error(error)),
    text: vi.fn().mockRejectedValue(new Error(error)),
    headers: new Headers(),
    ...overrides,
  };
}

// ============================================================================
// Mock React Components
// ============================================================================

/**
 * Creates a mock React component for testing
 */
export function createMockReactComponent(name: string, overrides: any = {}) {
  const MockComponent = vi.fn((props: any) => {
    return { type: 'div', props: { 'data-testid': `mock-${name}`, ...props } };
  });

  MockComponent.displayName = `Mock${name}`;

  return {
    ...MockComponent,
    ...overrides,
  };
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Waits for a specified number of milliseconds
 */
export function waitForAsync(ms: number = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a mock date for consistent testing
 */
export function createMockDate(timestamp: number = 1640995200000): Date {
  return new Date(timestamp);
}

/**
 * Resets all mocks and clears timers
 */
export function resetTestEnvironment() {
  vi.clearAllMocks();
  vi.clearAllTimers();
}

/**
 * Validates that a task is valid
 */
export function expectValidTask(task: any) {
  expect(task.id).toBeDefined();
  expect(task.type).toBeDefined();
  expect(task.description).toBeDefined();
  expect(task.priority).toBeGreaterThanOrEqual(0);
  expect(task.priority).toBeLessThanOrEqual(1);
  expect(task.status).toBeDefined();
  expect(task.createdAt).toBeDefined();
  expect(task.source).toBeDefined();
}

/**
 * Validates that cognitive feedback is valid
 */
export function expectValidCognitiveFeedback(feedback: any) {
  expect(feedback.taskId).toBeDefined();
  expect(typeof feedback.success).toBe('boolean');
  expect(feedback.reasoning).toBeDefined();
  expect(Array.isArray(feedback.alternativeSuggestions)).toBe(true);
  expect(feedback.emotionalImpact).toBeDefined();
  expect(feedback.confidence).toBeGreaterThanOrEqual(0);
  expect(feedback.confidence).toBeLessThanOrEqual(1);
  expect(feedback.timestamp).toBeDefined();
}

/**
 * Validates that a thought is valid
 */
export function expectValidThought(thought: any) {
  expect(thought.id).toBeDefined();
  expect(thought.ts).toBeDefined();
  expect(thought.text).toBeDefined();
  expect(thought.type).toBeDefined();
}

/**
 * Validates that bot state is valid
 */
export function expectValidBotState(botState: any) {
  expect(typeof botState.connected).toBe('boolean');
  expect(botState.health).toBeGreaterThanOrEqual(0);
  expect(botState.food).toBeGreaterThanOrEqual(0);
  expect(botState.position).toBeDefined();
  expect(botState.inventory).toBeDefined();
  expect(botState.environment).toBeDefined();
}

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Default test configuration
 */
export const TEST_CONFIG = {
  timeout: 5000,
  retries: 1,
  mockDelay: 100,
  defaultPriority: 0.5,
  defaultUrgency: 0.5,
  defaultConfidence: 0.8,
} as const;

/**
 * Test environment setup
 */
export function setupTestEnvironment() {
  // Mock Date.now for consistent timestamps
  vi.spyOn(Date, 'now').mockImplementation(() => 1640995200000);

  // Mock console methods to reduce noise
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  // Mock fetch globally
  global.fetch = vi.fn();

  // Mock WebSocket globally
  global.WebSocket = vi.fn().mockImplementation(() => createMockWebSocket());
}

/**
 * Test environment cleanup
 */
export function cleanupTestEnvironment() {
  vi.restoreAllMocks();
  vi.clearAllTimers();
}

// ============================================================================
// Type Exports
// ============================================================================

export type MockTask = ReturnType<typeof createMockTask>;
export type MockCognitiveFeedback = ReturnType<
  typeof createMockCognitiveFeedback
>;
export type MockThought = ReturnType<typeof createMockThought>;
export type MockBotState = ReturnType<typeof createMockBotState>;
export type MockPlanningData = ReturnType<typeof createMockPlanningData>;
export type MockRouter = ReturnType<typeof createMockRouter>;
export type MockNavigation = ReturnType<typeof createMockNavigation>;
export type MockWebSocket = ReturnType<typeof createMockWebSocket>;
