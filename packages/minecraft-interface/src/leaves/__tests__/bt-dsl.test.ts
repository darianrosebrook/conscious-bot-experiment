/**
 * BT-DSL Parser and Compiler Tests
 *
 * Tests for the BT-DSL schema validation, parsing, compilation, and execution.
 *
 * @author @darianrosebrook
 */

import { BTDSLParser } from '../../../../core/src/mcp-capabilities/bt-dsl-parser';
import { LeafFactory } from '../../../../core/src/mcp-capabilities/leaf-factory';
import { createLeafContext } from '../../../../core/src/mcp-capabilities/leaf-contracts';
import { MoveToLeaf, StepForwardSafelyLeaf } from '../movement-leaves';
import { SenseHostilesLeaf, WaitLeaf } from '../sensing-leaves';
import { PlaceTorchIfNeededLeaf } from '../interaction-leaves';

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

describe('BT-DSL Parser and Compiler', () => {
  let parser: BTDSLParser;
  let factory: LeafFactory;
  let context: any;

  beforeEach(() => {
    parser = new BTDSLParser();
    factory = new LeafFactory();
    context = createLeafContext(mockBot);

    // Register some test leaves
    factory.register(new MoveToLeaf());
    factory.register(new StepForwardSafelyLeaf());
    factory.register(new SenseHostilesLeaf());
    factory.register(new WaitLeaf());
    factory.register(new PlaceTorchIfNeededLeaf());
  });

  afterEach(() => {
    factory.clear();
    // Clear any pending timeouts
    jest.clearAllTimers();
  });

  afterAll(() => {
    // Ensure all timers are cleared
    jest.clearAllTimers();
  });

  describe('Schema Validation', () => {
    it('should validate a correct BT-DSL JSON', () => {
      const validBTDSL = {
        name: 'test_behavior',
        version: '1.0.0',
        description: 'Test behavior tree',
        root: {
          type: 'Sequence',
          children: [
            {
              type: 'Leaf',
              leafName: 'sense_hostiles',
              args: { radius: 10 },
            },
            {
              type: 'Leaf',
              leafName: 'move_to',
              args: { pos: { x: 10, y: 64, z: 10 } },
            },
          ],
        },
      };

      const result = parser.parse(validBTDSL, factory);
      expect(result.valid).toBe(true);
      expect(result.compiled).toBeDefined();
      expect(result.treeHash).toBeDefined();
    });

    it('should reject BT-DSL with invalid node type', () => {
      const invalidBTDSL = {
        name: 'test_behavior',
        version: '1.0.0',
        root: {
          type: 'InvalidNodeType',
          children: [],
        },
      };

      const result = parser.parse(invalidBTDSL, factory);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(error => error.includes('must be equal to constant'))).toBe(true);
    });

    it('should reject BT-DSL with missing leaf', () => {
      const invalidBTDSL = {
        name: 'test_behavior',
        version: '1.0.0',
        root: {
          type: 'Leaf',
          leafName: 'non_existent_leaf',
        },
      };

      const result = parser.parse(invalidBTDSL, factory);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing leaves: non_existent_leaf');
    });
  });

  describe('Node Compilation', () => {
    it('should compile leaf nodes', () => {
      const btDsl = {
        name: 'leaf_test',
        version: '1.0.0',
        root: {
          type: 'Leaf',
          leafName: 'sense_hostiles',
          args: { radius: 5 },
        },
      };

      const result = parser.parse(btDsl, factory);
      expect(result.valid).toBe(true);
      expect(result.compiled?.type).toBe('Leaf');
    });

    it('should compile sequence nodes', () => {
      const btDsl = {
        name: 'sequence_test',
        version: '1.0.0',
        root: {
          type: 'Sequence',
          children: [
            {
              type: 'Leaf',
              leafName: 'sense_hostiles',
            },
            {
              type: 'Leaf',
              leafName: 'wait',
              args: { ms: 1000 },
            },
          ],
        },
      };

      const result = parser.parse(btDsl, factory);
      expect(result.valid).toBe(true);
      expect(result.compiled?.type).toBe('Sequence');
    });

    it('should compile selector nodes', () => {
      const btDsl = {
        name: 'selector_test',
        version: '1.0.0',
        root: {
          type: 'Selector',
          children: [
            {
              type: 'Leaf',
              leafName: 'sense_hostiles',
            },
            {
              type: 'Leaf',
              leafName: 'wait',
            },
          ],
        },
      };

      const result = parser.parse(btDsl, factory);
      expect(result.valid).toBe(true);
      expect(result.compiled?.type).toBe('Selector');
    });

    it('should compile repeat until nodes', () => {
      const btDsl = {
        name: 'repeat_test',
        version: '1.0.0',
        root: {
          type: 'Repeat.Until',
          child: {
            type: 'Leaf',
            leafName: 'wait',
            args: { ms: 100 },
          },
          condition: {
            name: 'time_elapsed',
            parameters: { startTime: 0, minElapsedMs: 1000 },
          },
          maxIterations: 10,
        },
      };

      const result = parser.parse(btDsl, factory);
      expect(result.valid).toBe(true);
      expect(result.compiled?.type).toBe('Repeat.Until');
    });

    it('should compile timeout decorator nodes', () => {
      const btDsl = {
        name: 'timeout_test',
        version: '1.0.0',
        root: {
          type: 'Decorator.Timeout',
          child: {
            type: 'Leaf',
            leafName: 'wait',
            args: { ms: 5000 },
          },
          timeoutMs: 1000,
        },
      };

      const result = parser.parse(btDsl, factory);
      expect(result.valid).toBe(true);
      expect(result.compiled?.type).toBe('Decorator.Timeout');
    });

    it('should compile fail on true decorator nodes', () => {
      const btDsl = {
        name: 'fail_on_true_test',
        version: '1.0.0',
        root: {
          type: 'Decorator.FailOnTrue',
          child: {
            type: 'Leaf',
            leafName: 'sense_hostiles',
          },
          condition: {
            name: 'hostiles_present',
            parameters: { maxDistance: 5 },
          },
        },
      };

      const result = parser.parse(btDsl, factory);
      expect(result.valid).toBe(true);
      expect(result.compiled?.type).toBe('Decorator.FailOnTrue');
    });
  });

  describe('Tree Execution', () => {
    it('should execute a simple leaf', async () => {
      const btDsl = {
        name: 'simple_leaf',
        version: '1.0.0',
        root: {
          type: 'Leaf',
          leafName: 'wait',
          args: { ms: 10 },
        },
      };

      const result = parser.parse(btDsl, factory);
      expect(result.valid).toBe(true);

      const executionResult = await parser.execute(
        result.compiled!,
        factory,
        context
      );

      expect(executionResult.status).toBe('success');
      expect(executionResult.metrics).toBeDefined();
      expect(executionResult.metrics?.leafExecutions).toBe(1);
    });

    it('should execute a sequence', async () => {
      const btDsl = {
        name: 'sequence_execution',
        version: '1.0.0',
        root: {
          type: 'Sequence',
          children: [
            {
              type: 'Leaf',
              leafName: 'wait',
              args: { ms: 10 },
            },
            {
              type: 'Leaf',
              leafName: 'sense_hostiles',
              args: { radius: 5 },
            },
          ],
        },
      };

      const result = parser.parse(btDsl, factory);
      expect(result.valid).toBe(true);

      const executionResult = await parser.execute(
        result.compiled!,
        factory,
        context
      );

      expect(executionResult.status).toBe('success');
      expect(executionResult.metrics?.leafExecutions).toBe(2);
    });

    it('should execute a selector with fallback', async () => {
      const btDsl = {
        name: 'selector_execution',
        version: '1.0.0',
        root: {
          type: 'Selector',
          children: [
            {
              type: 'Leaf',
              leafName: 'sense_hostiles',
              args: { radius: 5 },
            },
            {
              type: 'Leaf',
              leafName: 'wait',
              args: { ms: 10 },
            },
          ],
        },
      };

      const result = parser.parse(btDsl, factory);
      expect(result.valid).toBe(true);

      const executionResult = await parser.execute(
        result.compiled!,
        factory,
        context
      );

      expect(executionResult.status).toBe('success');
      // Should execute at least one leaf
      expect(executionResult.metrics?.leafExecutions).toBeGreaterThan(0);
    });

    it('should handle timeout decorator', async () => {
      // Use fake timers to prevent hanging
      jest.useFakeTimers();
      
      const btDsl = {
        name: 'timeout_execution',
        version: '1.0.0',
        root: {
          type: 'Decorator.Timeout',
          child: {
            type: 'Leaf',
            leafName: 'wait',
            args: { ms: 5000 },
          },
          timeoutMs: 100,
        },
      };

      const result = parser.parse(btDsl, factory);
      expect(result.valid).toBe(true);

      const executionPromise = parser.execute(
        result.compiled!,
        factory,
        context
      );

      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(150);

      const executionResult = await executionPromise;

      expect(executionResult.status).toBe('failure');
      expect(executionResult.error?.detail).toContain('Timeout');
      
      // Restore real timers
      jest.useRealTimers();
    });
  });

  describe('Deterministic Compilation', () => {
    it('should produce same hash for identical trees', () => {
      const btDsl1 = {
        name: 'test1',
        version: '1.0.0',
        root: {
          type: 'Sequence',
          children: [
            { type: 'Leaf', leafName: 'wait' },
            { type: 'Leaf', leafName: 'sense_hostiles' },
          ],
        },
      };

      const btDsl2 = {
        name: 'test2', // Different name shouldn't affect hash
        version: '1.0.0',
        root: {
          type: 'Sequence',
          children: [
            { type: 'Leaf', leafName: 'wait' },
            { type: 'Leaf', leafName: 'sense_hostiles' },
          ],
        },
      };

      const result1 = parser.parse(btDsl1, factory);
      const result2 = parser.parse(btDsl2, factory);

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
      expect(result1.treeHash).toBe(result2.treeHash);
    });

    it('should produce different hashes for different trees', () => {
      const btDsl1 = {
        name: 'test1',
        version: '1.0.0',
        root: {
          type: 'Sequence',
          children: [{ type: 'Leaf', leafName: 'wait' }],
        },
      };

      const btDsl2 = {
        name: 'test2',
        version: '1.0.0',
        root: {
          type: 'Selector', // Different type
          children: [{ type: 'Leaf', leafName: 'wait' }],
        },
      };

      const result1 = parser.parse(btDsl1, factory);
      const result2 = parser.parse(btDsl2, factory);

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
      expect(result1.treeHash).not.toBe(result2.treeHash);
    });
  });

  describe('Complex Behavior Trees', () => {
    it('should handle nested control flow', () => {
      const btDsl = {
        name: 'complex_behavior',
        version: '1.0.0',
        root: {
          type: 'Selector',
          children: [
            {
              type: 'Sequence',
              children: [
                {
                  type: 'Leaf',
                  leafName: 'sense_hostiles',
                  args: { radius: 10 },
                },
                {
                  type: 'Decorator.Timeout',
                  child: {
                    type: 'Leaf',
                    leafName: 'move_to',
                    args: { pos: { x: 0, y: 64, z: 0 } },
                  },
                  timeoutMs: 5000,
                },
              ],
            },
            {
              type: 'Leaf',
              leafName: 'wait',
              args: { ms: 1000 },
            },
          ],
        },
      };

      const result = parser.parse(btDsl, factory);
      expect(result.valid).toBe(true);
      expect(result.compiled).toBeDefined();
    });

    it('should handle torch corridor example', () => {
      const btDsl = {
        name: 'torch_corridor',
        version: '1.0.0',
        description: 'Navigate corridor while placing torches',
        root: {
          type: 'Sequence',
          children: [
            {
              type: 'Leaf',
              leafName: 'sense_hostiles',
              args: { radius: 15 },
            },
            {
              type: 'Repeat.Until',
              child: {
                type: 'Sequence',
                children: [
                  {
                    type: 'Leaf',
                    leafName: 'place_torch_if_needed',
                    args: { interval: 5, lightThreshold: 8 },
                  },
                  {
                    type: 'Leaf',
                    leafName: 'step_forward_safely',
                    args: { distance: 1.0, checkLight: true },
                  },
                ],
              },
              condition: {
                name: 'position_reached',
                parameters: { target: { x: 50, y: 64, z: 0 }, tolerance: 2 },
              },
              maxIterations: 100,
            },
          ],
        },
      };

      const result = parser.parse(btDsl, factory);
      expect(result.valid).toBe(true);
      expect(result.compiled).toBeDefined();
    });
  });
});
