/**
 * Core Test Utilities
 *
 * Centralized test utilities and mock factories for the core package.
 * Replaces scattered mock objects with proper, isolated test utilities.
 *
 * @author @darianrosebrook
 */

import { vi } from 'vitest';
import {
  LeafSpec,
  LeafImpl,
  LeafContext,
  LeafResult,
  ExecError,
  LeafStatus,
} from '../mcp-capabilities/leaf-contracts';
import { EnhancedRegistry } from '../mcp-capabilities/registry';
import { LeafFactory } from '../mcp-capabilities/leaf-factory';
import { BTDSLParser } from '../mcp-capabilities/bt-dsl-parser';
import { DynamicCreationFlow } from '../mcp-capabilities/dynamic-creation-flow';

// ============================================================================
// Mock Leaf Implementations
// ============================================================================

/**
 * Creates a mock leaf implementation for testing
 */
export function createMockLeaf(
  name: string = 'mock_leaf',
  version: string = '1.0.0',
  overrides: Partial<LeafImpl> = {}
): LeafImpl {
  const baseSpec: LeafSpec = {
    name,
    version,
    description: `Mock leaf for testing: ${name}`,
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: {} },
    timeoutMs: 5000,
    retries: 1,
    permissions: ['movement', 'sense'],
  };

  const baseImpl: LeafImpl = {
    spec: baseSpec,
    async run(ctx: LeafContext, args: any): Promise<LeafResult> {
      return {
        status: 'success',
        result: { success: true, data: args },
        metrics: { durationMs: 100, retries: 0, timeouts: 0 },
      };
    },
  };

  return {
    ...baseImpl,
    spec: { ...baseSpec, ...overrides.spec },
    ...overrides,
  };
}

/**
 * Creates a mock leaf that always succeeds
 */
export function createSuccessMockLeaf(
  name: string = 'success_leaf',
  result: any = { success: true }
): LeafImpl {
  return createMockLeaf(name, '1.0.0', {
    async run(ctx: LeafContext, args: any): Promise<LeafResult> {
      return {
        status: 'success',
        result,
        metrics: { durationMs: 50, retries: 0, timeouts: 0 },
      };
    },
  });
}

/**
 * Creates a mock leaf that always fails
 */
export function createFailureMockLeaf(
  name: string = 'failure_leaf',
  error: string = 'Mock failure'
): LeafImpl {
  return createMockLeaf(name, '1.0.0', {
    async run(ctx: LeafContext, args: any): Promise<LeafResult> {
      return {
        status: 'failure' as LeafStatus,
        error: { code: 'unknown', retryable: false, detail: error },
        metrics: { durationMs: 50, retries: 0, timeouts: 0 },
      };
    },
  });
}

/**
 * Creates a mock leaf that times out
 */
export function createTimeoutMockLeaf(
  name: string = 'timeout_leaf',
  timeoutMs: number = 100
): LeafImpl {
  return createMockLeaf(name, '1.0.0', {
    spec: {
      name,
      version: '1.0.0',
      description: `Mock timeout leaf: ${name}`,
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
      timeoutMs,
      retries: 0,
      permissions: ['movement'],
    },
    async run(ctx: LeafContext, args: any): Promise<LeafResult> {
      await new Promise((resolve) => setTimeout(resolve, timeoutMs + 50));
      return {
        status: 'failure' as LeafStatus,
        error: { code: 'dig.timeout', retryable: true, detail: 'Mock timeout' },
        metrics: { durationMs: timeoutMs + 50, retries: 0, timeouts: 1 },
      };
    },
  });
}

// ============================================================================
// Mock Context Factories
// ============================================================================

/**
 * Creates a mock leaf context for testing
 */
export function createMockLeafContext(
  overrides: Partial<LeafContext> = {}
): LeafContext {
  const baseContext: LeafContext = {
    bot: {
      entity: {
        position: { x: 0, y: 64, z: 0 },
        yaw: 0,
        pitch: 0,
        health: 20,
        food: 20,
      },
      world: {
        getLight: vi.fn().mockReturnValue(15),
        getBiome: vi.fn().mockResolvedValue('plains'),
      },
      inventory: {
        items: vi.fn().mockReturnValue([]),
        emptySlotCount: vi.fn().mockReturnValue(36),
        inventoryStart: 9,
        inventoryEnd: 44,
        slots: new Array(45),
      },
      quickBarSlot: 0,
      entities: {},
      time: { timeOfDay: 6000 },
      blockAt: vi.fn().mockReturnValue({ name: 'air', boundingBox: 'empty' }),
      health: 20,
      food: 20,
      chat: vi.fn(),
      dig: vi.fn().mockResolvedValue(undefined),
      placeBlock: vi.fn().mockResolvedValue(undefined),
      equip: vi.fn().mockResolvedValue(undefined),
      pathfinder: {
        setMovements: vi.fn(),
        setGoal: vi.fn(),
        goto: vi.fn().mockResolvedValue({}),
        stop: vi.fn(),
      },
    } as any,
    abortSignal: new AbortController().signal,
    now: () => Date.now(),
    snapshot: vi.fn().mockResolvedValue({
      position: { x: 0, y: 64, z: 0 },
      biome: 'plains',
      time: 6000,
      lightLevel: 15,
      nearbyHostiles: [],
      weather: 'clear',
      inventory: { items: [], selectedSlot: 0, totalSlots: 36, freeSlots: 36 },
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
  };

  return {
    ...baseContext,
    ...overrides,
  };
}

// ============================================================================
// Mock Component Factories
// ============================================================================

/**
 * Creates a mock enhanced registry for testing
 */
export function createMockEnhancedRegistry(): import('vitest').Mocked<EnhancedRegistry> {
  return {
    registerLeaf: vi
      .fn()
      .mockResolvedValue({ ok: true, id: 'mock_leaf@1.0.0' }),
    registerOption: vi
      .fn()
      .mockResolvedValue({ ok: true, id: 'mock_option@1.0.0' }),
    promoteCapability: vi.fn().mockResolvedValue({ success: true }),
    retireCapability: vi.fn().mockResolvedValue({ success: true }),
    getCapability: vi.fn().mockResolvedValue(null),
    listCapabilities: vi.fn().mockResolvedValue([]),
    getStatistics: vi.fn().mockResolvedValue({}),
    getLeafFactory: vi.fn().mockReturnValue(createMockLeafFactory()),
    clear: vi.fn(),
  } as any;
}

/**
 * Creates a mock leaf factory for testing
 */
export function createMockLeafFactory(): import('vitest').Mocked<LeafFactory> {
  return {
    register: vi.fn().mockReturnValue({ ok: true, id: 'mock_leaf@1.0.0' }),
    get: vi.fn().mockReturnValue(createMockLeaf()),
    clear: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    has: vi.fn().mockReturnValue(false),
  } as any;
}

/**
 * Creates a mock BT-DSL parser for testing
 */
export function createMockBTDSLParser(): import('vitest').Mocked<BTDSLParser> {
  return {
    parse: vi.fn().mockReturnValue({
      valid: true,
      errors: [],
      compiled: { type: 'Sequence', children: [] },
      treeHash: 'mock_hash',
    }),
    validate: vi.fn().mockReturnValue({ valid: true, errors: [] }),
  } as any;
}

/**
 * Creates a mock dynamic creation flow for testing
 */
export function createMockDynamicCreationFlow(): import('vitest').Mocked<DynamicCreationFlow> {
  return {
    detectImpasse: vi.fn().mockReturnValue(false),
    requestOptionProposals: vi.fn().mockResolvedValue([]),
    clear: vi.fn(),
  } as any;
}

// ============================================================================
// Test Data Factories
// ============================================================================

/**
 * Creates mock BT-DSL data for testing
 */
export function createMockBTDSL(overrides: any = {}) {
  return {
    name: 'test_behavior',
    version: '1.0.0',
    description: 'Test behavior tree',
    root: {
      type: 'Sequence',
      children: [
        {
          type: 'Leaf',
          leafName: 'mock_leaf',
          args: { test: true },
        },
      ],
    },
    ...overrides,
  };
}

/**
 * Creates mock leaf arguments for testing
 */
export function createMockLeafArgs(overrides: any = {}) {
  return {
    position: { x: 10, y: 64, z: 10 },
    radius: 5,
    timeout: 5000,
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
 * Validates that a leaf result is successful
 */
export function expectSuccessfulResult(result: LeafResult) {
  expect(result.status).toBe('success');
  expect(result.result).toBeDefined();
  expect(result.metrics).toBeDefined();
}

/**
 * Validates that a leaf result failed
 */
export function expectFailedResult(result: LeafResult, expectedError?: string) {
  expect(result.status).toBe('failure');
  expect(result.error).toBeDefined();
  if (expectedError) {
    expect(result.error?.detail).toContain(expectedError);
  }
}

/**
 * Validates that a leaf result timed out
 */
export function expectTimeoutResult(result: LeafResult) {
  expect(result.status).toBe('failure');
  expect(result.error).toBeDefined();
  expect(result.error?.code).toBe('dig.timeout');
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
  defaultPosition: { x: 0, y: 64, z: 0 },
  defaultHealth: 20,
  defaultFood: 20,
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

export type MockLeafFactory = ReturnType<typeof createMockLeafFactory>;
export type MockEnhancedRegistry = ReturnType<
  typeof createMockEnhancedRegistry
>;
export type MockBTDSLParser = ReturnType<typeof createMockBTDSLParser>;
export type MockDynamicCreationFlow = ReturnType<
  typeof createMockDynamicCreationFlow
>;

// ============================================================================
// Mock LLM Interface
// ============================================================================

/**
 * Mock LLM interface for testing
 */
export class MockLLMInterface {
  async proposeOption(request: any): Promise<any> {
    // Mock implementation for testing
    return {
      name: 'mock_option',
      version: '1.0.0',
      btDsl: {
        type: 'sequence',
        children: [
          {
            type: 'leaf',
            name: 'wait',
            args: { durationMs: 100 },
          },
        ],
      },
      confidence: 0.8,
      estimatedSuccessRate: 0.9,
      reasoning: 'Mock option for testing',
    };
  }

  async generateAlternatives(request: any, count: number): Promise<any[]> {
    const alternatives = [];
    for (let i = 0; i < count; i++) {
      alternatives.push(await this.proposeOption(request));
    }
    return alternatives;
  }

  async validateOption(
    proposal: any
  ): Promise<{ valid: boolean; issues: string[] }> {
    return { valid: true, issues: [] };
  }

  async getStatus(): Promise<{
    available: boolean;
    model: string;
    latency: number;
  }> {
    return { available: true, model: 'mock', latency: 0 };
  }
}
