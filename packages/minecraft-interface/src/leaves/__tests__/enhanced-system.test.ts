/**
 * Enhanced System Tests - Comprehensive tests for enhanced registry and dynamic creation flow
 *
 * Tests for the enhanced registry with shadow runs, dynamic creation flow with impasse detection,
 * and the complete integration of all components.
 *
 * @author @darianrosebrook
 */

import { EnhancedRegistry } from '../../../../core/src/mcp-capabilities/enhanced-registry';
import {
  DynamicCreationFlow,
  MockLLMInterface,
} from '../../../../core/src/mcp-capabilities/dynamic-creation-flow';
import {
  createLeafContext,
  LeafImpl,
  LeafSpec,
  LeafContext,
  LeafResult,
} from '../../../../core/src/mcp-capabilities/leaf-contracts';
import { MoveToLeaf, StepForwardSafelyLeaf } from '../movement-leaves';
import { SenseHostilesLeaf, WaitLeaf } from '../sensing-leaves';
import { PlaceTorchIfNeededLeaf } from '../interaction-leaves';

// Custom test leaf
class TestLeaf implements LeafImpl {
  spec: LeafSpec = {
    name: 'test_leaf',
    version: '1.0.0',
    description: 'Test leaf for enhanced registry testing',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    timeoutMs: 5000,
    retries: 3,
    permissions: ['sense'],
  };

  async run(ctx: LeafContext, args: unknown): Promise<LeafResult> {
    return {
      status: 'success',
      result: { test: true },
      metrics: { durationMs: 10, retries: 0, timeouts: 0 },
    };
  }
}

// Mock Mineflayer Bot
const mockBot = {
  entity: {
    position: { x: 0, y: 64, z: 0 },
    yaw: 0,
    health: 20,
    food: 20,
  },
  world: {
    getLight: jest.fn().mockReturnValue(15),
    getBiome: jest.fn().mockResolvedValue('plains'),
  },
  inventory: {
    items: jest.fn().mockReturnValue([]),
    emptySlotCount: jest.fn().mockReturnValue(36),
    inventoryStart: 9,
    inventoryEnd: 44,
    slots: new Array(45),
  },
  quickBarSlot: 0,
  entities: {},
  time: { timeOfDay: 6000 },
  blockAt: jest.fn().mockReturnValue({ name: 'air', boundingBox: 'empty' }),
  health: 20,
  food: 20,
} as any;

describe('Enhanced System Integration', () => {
  let registry: EnhancedRegistry;
  let dynamicFlow: DynamicCreationFlow;
  let llmInterface: MockLLMInterface;
  let context: any;

  beforeEach(() => {
    registry = new EnhancedRegistry();
    llmInterface = new MockLLMInterface();

    // Configure dynamic creation flow
    dynamicFlow = new DynamicCreationFlow(
      registry,
      llmInterface,
      {
        failureThreshold: 3, // Changed from 4 to 3 to match the test
        timeWindowMs: 60000, // 1 minute
        debounceMs: 5000, // 5 seconds
        maxProposalsPerHour: 10,
      },
      {
        winRateThreshold: 0.6, // 60% success rate
        minRunsBeforeRetirement: 5,
        evaluationWindowMs: 3600000, // 1 hour
        gracePeriodMs: 300000, // 5 minutes
      }
    );

    context = createLeafContext(mockBot);

    // Register some test leaves
    registry.getLeafFactory().register(new MoveToLeaf());
    registry.getLeafFactory().register(new StepForwardSafelyLeaf());
    registry.getLeafFactory().register(new SenseHostilesLeaf());
    registry.getLeafFactory().register(new WaitLeaf());
    registry.getLeafFactory().register(new PlaceTorchIfNeededLeaf());
  });

  afterEach(() => {
    registry.clear();
    dynamicFlow.clear();
    jest.clearAllTimers();
  });

  afterAll(() => {
    jest.clearAllTimers();
  });

  describe('Enhanced Registry', () => {
    it('should register leaves with provenance', () => {
      // Create a new leaf instance with a different name
      const leaf = new TestLeaf();
      const provenance = {
        author: 'test-author',
        codeHash: 'abc123def456ghi789', // Longer hash
        createdAt: new Date().toISOString(),
        metadata: { test: true },
      };

      const result = registry.registerLeaf(leaf, provenance);
      expect(result.ok).toBe(true);
      expect(result.id).toBe('test_leaf@1.0.0');
    });

    it('should register options with shadow configuration', () => {
      const btDsl = {
        name: 'test_option',
        version: '1.0.0',
        root: {
          type: 'Sequence',
          children: [
            {
              type: 'Leaf',
              leafName: 'wait',
              args: { ms: 1000 },
            },
          ],
        },
      };

      const provenance = {
        author: 'llm',
        codeHash: 'def456',
        createdAt: new Date().toISOString(),
      };

      const shadowConfig = {
        promotionThreshold: 0.8,
        maxShadowRuns: 10,
        autoRetirementThreshold: 0.3,
      };

      const result = registry.registerOption(btDsl, provenance, shadowConfig);
      expect(result.ok).toBe(true);
      expect(result.id).toBe('test_option@1.0.0');
    });

    it('should track shadow run statistics', () => {
      const optionId = 'test_option@1.0.0';

      // Register an option first
      const btDsl = {
        name: 'test_option',
        version: '1.0.0',
        root: {
          type: 'Leaf',
          leafName: 'wait',
          args: { ms: 10 },
        },
      };

      const provenance = {
        author: 'llm',
        codeHash: 'def456',
        createdAt: new Date().toISOString(),
      };

      registry.registerOption(btDsl, provenance, {
        promotionThreshold: 0.8,
        maxShadowRuns: 10,
        autoRetirementThreshold: 0.3,
      });

      // Get initial stats
      const initialStats = registry.getShadowStats(optionId);
      expect(initialStats.totalRuns).toBe(0);
      expect(initialStats.successRate).toBe(0);

      // Note: We can't actually execute shadow runs without the option definition
      // This would require implementing the getOptionDefinition method
    });

    it('should manage quotas', () => {
      const optionId = 'test_option@1.0.0';

      // Set quota
      registry.setQuota(optionId, 5, 60000); // 5 requests per minute

      // Check quota multiple times
      expect(registry.checkQuota(optionId)).toBe(true);
      expect(registry.checkQuota(optionId)).toBe(true);
      expect(registry.checkQuota(optionId)).toBe(true);
      expect(registry.checkQuota(optionId)).toBe(true);
      expect(registry.checkQuota(optionId)).toBe(true);

      // Should be exhausted
      expect(registry.checkQuota(optionId)).toBe(false);
    });
  });

  describe('Dynamic Creation Flow', () => {
    it('should detect impasse after consecutive failures', () => {
      const taskId = 'test-task';
      const failure = {
        code: 'movement.timeout' as const,
        retryable: true,
        detail: 'Movement timed out',
      };

      // First few failures shouldn't trigger impasse
      let result = dynamicFlow.checkImpasse(taskId, failure);
      expect(result.isImpasse).toBe(false);

      result = dynamicFlow.checkImpasse(taskId, failure);
      expect(result.isImpasse).toBe(false);

      // Third failure should trigger impasse (threshold is 3)
      result = dynamicFlow.checkImpasse(taskId, failure);
      expect(result.isImpasse).toBe(true);
      expect(result.reason).toContain('Consecutive failures: 3');
    });

    it('should respect debounce time between proposals', () => {
      const taskId = 'test-task';
      const failure = {
        code: 'movement.timeout' as const,
        retryable: true,
        detail: 'Movement timed out',
      };

      // Trigger impasse
      for (let i = 0; i < 3; i++) {
        dynamicFlow.checkImpasse(taskId, failure);
      }

      // First check should be impasse
      let result = dynamicFlow.checkImpasse(taskId, failure);
      expect(result.isImpasse).toBe(true);

      // Simulate a proposal by updating the lastProposalTime
      const state = dynamicFlow.getImpasseState(taskId);
      if (state) {
        state.lastProposalTime = Date.now();
      }

      // Now it should not be impasse due to debounce
      result = dynamicFlow.checkImpasse(taskId, failure);
      expect(result.isImpasse).toBe(false);
    });

    it('should request option proposals from LLM', async () => {
      const taskId = 'test-task';
      const currentTask = 'Navigate to target';
      const recentFailures = [
        {
          code: 'movement.timeout' as const,
          retryable: true,
          detail: 'Movement timed out',
        },
      ];

      // Trigger impasse first
      for (let i = 0; i < 4; i++) {
        dynamicFlow.checkImpasse(taskId, recentFailures[0]);
      }

      // Request proposal
      const proposal = await dynamicFlow.requestOptionProposal(
        taskId,
        context,
        currentTask,
        recentFailures
      );

      expect(proposal).not.toBeNull();
      expect(proposal?.name).toBe('mock_option');
      expect(proposal?.version).toBe('1.0.0');
      expect(proposal?.confidence).toBe(0.8);
      expect(proposal?.estimatedSuccessRate).toBe(0.75);
    });

    it('should register proposed options', async () => {
      const proposal = {
        name: 'test_proposal',
        version: '1.0.0',
        description: 'Test proposal',
        btDsl: {
          name: 'test_proposal',
          version: '1.0.0',
          root: {
            type: 'Sequence',
            children: [
              {
                type: 'Leaf',
                leafName: 'wait',
                args: { ms: 1000 },
              },
            ],
          },
        },
        confidence: 0.8,
        estimatedSuccessRate: 0.75,
        reasoning: 'Test reasoning',
      };

      const result = await dynamicFlow.registerProposedOption(
        proposal,
        'test-author'
      );
      expect(result.success).toBe(true);
      expect(result.optionId).toBe('test_proposal@1.0.0');
    });

    it('should evaluate retirement decisions', () => {
      const optionId = 'test_option@1.0.0';

      // Register an option first
      const btDsl = {
        name: 'test_option',
        version: '1.0.0',
        root: {
          type: 'Leaf',
          leafName: 'wait',
          args: { ms: 10 },
        },
      };

      const provenance = {
        author: 'llm',
        codeHash: 'def456',
        createdAt: new Date().toISOString(),
      };

      registry.registerOption(btDsl, provenance, {
        promotionThreshold: 0.8,
        maxShadowRuns: 10,
        autoRetirementThreshold: 0.3,
      });

      // Evaluate retirement (should not retire due to insufficient runs)
      const decision = dynamicFlow.evaluateRetirement(optionId);
      expect(decision.shouldRetire).toBe(false);
      expect(decision.totalRuns).toBe(0);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete impasse-to-proposal workflow', async () => {
      const taskId = 'corridor-navigation';
      const currentTask = 'Navigate dark corridor safely';
      const failure = {
        code: 'movement.timeout' as const,
        retryable: true,
        detail: 'Movement timed out in dark corridor',
      };

      // Simulate consecutive failures
      for (let i = 0; i < 3; i++) {
        const impasseResult = dynamicFlow.checkImpasse(taskId, failure);
        if (i < 2) {
          expect(impasseResult.isImpasse).toBe(false);
        } else {
          expect(impasseResult.isImpasse).toBe(true);
        }
      }

      // Request proposal
      const proposal = await dynamicFlow.requestOptionProposal(
        taskId,
        context,
        currentTask,
        [failure]
      );

      expect(proposal).not.toBeNull();

      // Register the proposal
      if (proposal) {
        const result = await dynamicFlow.registerProposedOption(
          proposal,
          'llm'
        );
        expect(result.success).toBe(true);
        expect(result.optionId).toBe('mock_option@1.0.0');
      }

      // Check proposal history
      const history = dynamicFlow.getProposalHistory(taskId);
      expect(history.length).toBe(1);
      expect(history[0].proposal.name).toBe('mock_option');
    });

    it('should manage multiple tasks independently', () => {
      const task1 = 'task-1';
      const task2 = 'task-2';
      const failure = {
        code: 'movement.timeout' as const,
        retryable: true,
        detail: 'Movement timed out',
      };

      // Trigger impasse for task 1
      for (let i = 0; i < 4; i++) {
        dynamicFlow.checkImpasse(task1, failure);
      }

      // Task 2 should not be in impasse
      const task2Result = dynamicFlow.checkImpasse(task2, failure);
      expect(task2Result.isImpasse).toBe(false);

      // Task 1 should be in impasse
      const task1Result = dynamicFlow.checkImpasse(task1, failure);
      expect(task1Result.isImpasse).toBe(true);
    });
  });
});
