/**
 * Torch Corridor End-to-End Test
 *
 * Tests the complete dynamic capability creation workflow from
 * registration to execution using the torch corridor example.
 *
 * @author @darianrosebrook
 */

import { EnhancedRegistry } from '../mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from '../mcp-capabilities/dynamic-creation-flow';
import {
  LeafImpl,
  LeafContext,
  LeafResult,
  LeafSpec,
} from '../mcp-capabilities/leaf-contracts';
import torchCorridorBTDSL from '../examples/torch-corridor-bt-dsl.json';

// Test-specific mock leaves that always succeed
class TestMoveToLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'move_to',
    version: '1.0.0',
    description: 'Test mock for move_to leaf',
    inputSchema: { type: 'object' },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        distance: { type: 'number' },
        duration: { type: 'number' },
        pathLength: { type: 'number' },
      },
    },
    timeoutMs: 5000,
    retries: 0,
    permissions: ['movement'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    return {
      status: 'success',
      result: { success: true, distance: 0, duration: 100, pathLength: 0 },
      metrics: { durationMs: 100, retries: 0, timeouts: 0 },
    };
  }
}

class TestStepForwardSafelyLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'step_forward_safely',
    version: '1.0.0',
    description: 'Test mock for step_forward_safely leaf',
    inputSchema: { type: 'object' },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        distance: { type: 'number' },
        duration: { type: 'number' },
        pathLength: { type: 'number' },
      },
    },
    timeoutMs: 5000,
    retries: 0,
    permissions: ['movement'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    return {
      status: 'success',
      result: { success: true, distance: 1, duration: 50, pathLength: 1 },
      metrics: { durationMs: 50, retries: 0, timeouts: 0 },
    };
  }
}

class TestPlaceTorchIfNeededLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'place_torch_if_needed',
    version: '1.0.0',
    description: 'Test mock for place_torch_if_needed leaf',
    inputSchema: { type: 'object' },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        placed: { type: 'boolean' },
        interval: { type: 'number' },
      },
    },
    timeoutMs: 5000,
    retries: 0,
    permissions: ['place'],
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    return {
      status: 'success',
      result: { success: true, placed: true, interval: args?.interval || 5 },
      metrics: { durationMs: 200, retries: 0, timeouts: 0 },
    };
  }
}

class TestWaitLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'wait',
    version: '1.0.0',
    description: 'Test mock for wait leaf',
    inputSchema: { type: 'object' },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        duration: { type: 'number' },
      },
    },
    timeoutMs: 5000,
    retries: 0,
    permissions: ['sense'],
    rateLimitPerMin: 1000, // High rate limit for testing
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    return {
      status: 'success',
      result: { success: true, duration: args?.durationMs || 1000 },
      metrics: {
        durationMs: args?.durationMs || 1000,
        retries: 0,
        timeouts: 0,
      },
    };
  }
}

// Test leaf that always fails for retirement testing
class TestFailingLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'failing_leaf',
    version: '1.0.0',
    description: 'Test mock for failing leaf',
    inputSchema: { type: 'object' },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
    timeoutMs: 5000,
    retries: 0,
    permissions: ['movement'],
    rateLimitPerMin: 1000, // High rate limit for testing
  };

  async run(ctx: LeafContext, args: any): Promise<LeafResult> {
    return {
      status: 'failure',
      error: {
        code: 'test_failure',
        detail: 'Simulated failure for testing',
        retryable: false,
      },
      metrics: { durationMs: 50, retries: 0, timeouts: 0 },
    };
  }
}

describe('Torch Corridor End-to-End', () => {
  let registry: EnhancedRegistry;
  let dynamicFlow: DynamicCreationFlow;

  beforeEach(() => {
    registry = new EnhancedRegistry();

    // Create a mock LLM interface for testing
    const mockLLMInterface = {
      proposeOption: async () => ({
        name: 'opt.mock_proposal',
        version: '1.0.0',
        btDsl: {
          name: 'opt.mock_proposal',
          version: '1.0.0',
          root: {
            type: 'Sequence',
            children: [
              {
                type: 'Leaf',
                leafName: 'wait',
                args: { durationMs: 1000 },
              },
            ],
          },
        },
        confidence: 0.8,
        estimatedSuccessRate: 0.9,
        reasoning: 'Mock proposal for testing',
      }),
    };

    dynamicFlow = new DynamicCreationFlow(registry, mockLLMInterface);

    // Register required leaves with the registry's WorkingLeafFactory
    const leafFactory = registry.getLeafFactory();
    leafFactory.register(new TestMoveToLeaf());
    leafFactory.register(new TestStepForwardSafelyLeaf());
    leafFactory.register(new TestPlaceTorchIfNeededLeaf());
    leafFactory.register(new TestWaitLeaf());
  });

  test('should register and execute torch corridor capability', async () => {
    // 1. Register the capability
    const result = registry.registerOption(
      torchCorridorBTDSL,
      {
        author: 'llm',
        createdAt: new Date().toISOString(),
        codeHash: 'test-hash-123',
      },
      {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
        minShadowRuns: 3,
      }
    );

    expect(result.ok).toBe(true);
    expect(result.id).toBe('opt.torch_corridor@1.0.0');

    // 2. Execute shadow run
    const mockLeafContext = (global as any).testUtils.createMockLeafContext();

    const shadowResult = await registry.executeShadowRun(
      result.id!,
      mockLeafContext,
      undefined
    );

    expect(shadowResult.status).toBe('success');
    expect(shadowResult.durationMs).toBeGreaterThan(0);
    expect(shadowResult.id).toContain('opt.torch_corridor@1.0.0');
  });

  test('should detect impasse and propose new capability', async () => {
    const goal = 'torch the mining corridor safely';
    const taskId = 'torch-corridor-task';
    const mockLeafContext = (global as any).testUtils.createMockLeafContext();

    // Simulate multiple failures to trigger impasse (threshold is 3)
    const failure = {
      code: 'unknown' as const,
      detail: 'goal_analysis',
      retryable: false,
    };

    // First two failures shouldn't trigger impasse
    let impasseResult = dynamicFlow.checkImpasse(taskId, failure);
    expect(impasseResult.isImpasse).toBe(false);

    impasseResult = dynamicFlow.checkImpasse(taskId, failure);
    expect(impasseResult.isImpasse).toBe(false);

    // Third failure should trigger impasse
    impasseResult = dynamicFlow.checkImpasse(taskId, failure);
    expect(impasseResult.isImpasse).toBe(true);

    // Propose new capability
    const proposal = await dynamicFlow.requestOptionProposal(
      taskId,
      mockLeafContext,
      goal,
      []
    );

    expect(proposal).not.toBeNull();
    expect(proposal?.name).toContain('opt.');
    expect(proposal?.btDsl).toBeDefined();
    expect(proposal?.confidence).toBeGreaterThan(0);
  });

  test('should register proposed capability and make it available', async () => {
    const mockLeafContext = global.testUtils.createMockLeafContext();

    // Create a mock proposal
    const mockProposal = {
      name: 'opt.test_capability',
      version: '1.0.0',
      btDsl: {
        name: 'opt.test_capability',
        version: '1.0.0',
        root: {
          type: 'Sequence',
          children: [
            {
              type: 'Leaf',
              leafName: 'wait',
              args: { durationMs: 1000 },
            },
          ],
        },
      },
      confidence: 0.8,
      estimatedSuccessRate: 0.9,
      reasoning: 'Test capability for validation',
    };

    // Register the proposal
    const result = await dynamicFlow.registerProposedOption(
      mockProposal,
      'test-author'
    );

    expect(result.success).toBe(true);
    expect(result.optionId).toBe('opt.test_capability@1.0.0');

    // Verify it's available in registry
    const capability = await registry.getCapability(result.optionId!);
    expect(capability).toBeDefined();
    expect(capability?.status).toBe('shadow');
  });

  test('should promote capability after successful shadow runs', async () => {
    // Register capability with unique name
    const uniqueBTDSL = {
      ...torchCorridorBTDSL,
      name: 'opt.torch_corridor_promote',
      version: '1.0.0',
    };

    const result = registry.registerOption(
      uniqueBTDSL,
      {
        author: 'llm',
        createdAt: new Date().toISOString(),
      },
      {
        successThreshold: 0.8,
        maxShadowRuns: 3, // Lower for testing
        failureThreshold: 0.3,
        minShadowRuns: 2,
      }
    );

    expect(result.ok).toBe(true);

    // Execute multiple successful shadow runs
    const mockLeafContext = global.testUtils.createMockLeafContext();

    for (let i = 0; i < 2; i++) {
      const shadowResult = await registry.executeShadowRun(
        result.id!,
        mockLeafContext,
        undefined,
        {
          end: { x: 100, y: 12, z: -35 },
          interval: 6,
          hostilesRadius: 10,
        }
      );

      expect(shadowResult.status).toBe('success');
    }

    // Check if capability was auto-promoted
    const capability = await registry.getCapability(result.id!);
    expect(capability?.status).toBe('active');
  });

  test('should handle capability retirement for poor performance', async () => {
    // Register the failing leaf
    const leafFactory = registry.getLeafFactory();
    leafFactory.register(new TestFailingLeaf());

    // Create a BT-DSL that uses the failing leaf
    const failingBTDSL = {
      name: 'opt.failing_capability',
      version: '1.0.0',
      description: 'Capability that always fails for testing retirement',
      root: {
        type: 'Leaf',
        leafName: 'failing_leaf',
        args: {},
      },
    };

    const result = registry.registerOption(
      failingBTDSL,
      {
        author: 'llm',
        createdAt: new Date().toISOString(),
      },
      {
        successThreshold: 0.8,
        maxShadowRuns: 3,
        failureThreshold: 0.5, // High failure threshold
        minShadowRuns: 2,
      }
    );

    expect(result.ok).toBe(true);

    // Execute failing shadow runs
    const mockLeafContext = global.testUtils.createMockLeafContext();

    for (let i = 0; i < 3; i++) {
      const shadowResult = await registry.executeShadowRun(
        result.id!,
        mockLeafContext,
        undefined
      );

      expect(shadowResult.status).toBe('failure');
    }

    // Check if capability was auto-retired
    const capability = await registry.getCapability(result.id!);
    expect(capability?.status).toBe('retired');
  });

  test('should integrate with planning system', async () => {
    // Register capability
    const result = registry.registerOption(
      torchCorridorBTDSL,
      {
        author: 'llm',
        createdAt: new Date().toISOString(),
      },
      {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
        minShadowRuns: 3,
      }
    );

    expect(result.ok).toBe(true);

    // Simulate planning system integration by listing capabilities
    const capabilities = await registry.listCapabilities();
    const torchCapability = capabilities.find((cap) => cap.id === result.id);

    expect(torchCapability).toBeDefined();
    expect(torchCapability.name).toBe('opt.torch_corridor');
    expect(torchCapability.status).toBe('shadow');
  });

  test('should execute simple BT-DSL sequence', async () => {
    // Create a simple BT-DSL with just a sequence of leaves
    const simpleBTDSL = {
      name: 'opt.simple_test',
      version: '1.0.0',
      description: 'Simple test sequence',
      root: {
        type: 'Sequence',
        children: [
          {
            type: 'Leaf',
            leafName: 'move_to',
            args: { pos: { x: 10, y: 64, z: 10 }, safe: true },
          },
          {
            type: 'Leaf',
            leafName: 'step_forward_safely',
            args: {},
          },
        ],
      },
    };

    // Register the capability
    const result = registry.registerOption(
      simpleBTDSL,
      {
        author: 'llm',
        createdAt: new Date().toISOString(),
        codeHash: 'test-hash-123',
      },
      {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
        minShadowRuns: 3,
      }
    );

    expect(result.ok).toBe(true);

    // Execute shadow run
    const mockLeafContext = (global as any).testUtils.createMockLeafContext();
    const shadowResult = await registry.executeShadowRun(
      result.id!,
      mockLeafContext
    );

    expect(shadowResult.status).toBe('success');
    expect(shadowResult.durationMs).toBeGreaterThan(0);
  });
});
