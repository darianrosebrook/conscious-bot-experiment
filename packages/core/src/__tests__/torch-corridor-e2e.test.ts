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
import { LeafFactory } from '../mcp-capabilities/leaf-factory';
import { MoveToLeaf, StepForwardSafelyLeaf } from '../leaves/movement-leaves';
import { SenseHostilesLeaf } from '../leaves/sensing-leaves';
import { RetreatAndBlockLeaf } from '../leaves/interaction-leaves';
import torchCorridorBTDSL from '../examples/torch-corridor-bt-dsl.json';

describe('Torch Corridor End-to-End', () => {
  let registry: EnhancedRegistry;
  let dynamicFlow: DynamicCreationFlow;
  let leafFactory: LeafFactory;

  beforeEach(() => {
    registry = new EnhancedRegistry();
    dynamicFlow = new DynamicCreationFlow(registry);
    leafFactory = new LeafFactory();

    // Register required leaves
    leafFactory.register(new MoveToLeaf());
    leafFactory.register(new SenseHostilesLeaf());
    // PlaceTorchIfNeededLeaf is not available, skipping registration
    leafFactory.register(new StepForwardSafelyLeaf());
    leafFactory.register(new RetreatAndBlockLeaf());
  });

  afterEach(() => {
    // Clean up
    leafFactory.clear();
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
    const mockLeafContext = (global as any).testUtils.createMockLeafContext();

    // Check for impasse
    const impasseResult = dynamicFlow.checkImpasse(goal, {
      code: 'unknown',
      detail: 'goal_analysis',
      retryable: false,
    });

    expect(impasseResult.isImpasse).toBe(true);

    // Propose new capability
    const proposal = await dynamicFlow.requestOptionProposal(
      'test-task-id',
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
    const capability = registry.getCapability(result.optionId!);
    expect(capability).toBeDefined();
    expect(capability?.status).toBe('shadow');
  });

  test('should promote capability after successful shadow runs', async () => {
    // Register capability
    const result = registry.registerOption(
      torchCorridorBTDSL,
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

    for (let i = 0; i < 3; i++) {
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

      expect(shadowResult.success).toBe(true);
    }

    // Check if capability was auto-promoted
    const capability = registry.getCapability(result.id!);
    expect(capability?.status).toBe('active');
  });

  test('should handle capability retirement for poor performance', async () => {
    // Register capability with low failure threshold
    const result = registry.registerOption(
      torchCorridorBTDSL,
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
        undefined,
        {
          end: { x: 100, y: 12, z: -35 },
          interval: 6,
          hostilesRadius: 10,
        }
      );

      // Mock failure by modifying the result
      shadowResult.success = false;
      shadowResult.error = {
        code: 'test_failure',
        detail: 'Simulated failure for testing',
        retryable: false,
      };
    }

    // Check if capability was auto-retired
    const capability = registry.getCapability(result.id!);
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

    // Simulate planning system integration
    const goal = 'torch the mining corridor safely';
    const applicableCapabilities =
      await dynamicFlow.findApplicableCapabilities(goal);

    expect(applicableCapabilities).toContain(result.id);

    // Verify capability can be used in planning
    const capability = registry.getCapability(result.id!);
    expect(capability).toBeDefined();
    expect(capability?.status).toBe('shadow');
  });
});
