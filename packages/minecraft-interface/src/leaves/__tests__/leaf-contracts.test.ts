/**
 * Leaf Contract System Tests
 *
 * Tests for the leaf contract system including validation, factory operations,
 * and basic leaf functionality.
 *
 * @author @darianrosebrook
 */

import { LeafFactory } from '../../../../core/src/mcp-capabilities/leaf-factory';
import {
  LeafSpec,
  LeafImpl,
  LeafContext,
  LeafResult,
  validateLeafSpec,
  validateLeafImpl,
  createLeafContext,
  LeafPermission,
} from '../../../../core/src/mcp-capabilities/leaf-contracts';
import { MoveToLeaf, StepForwardSafelyLeaf } from '../movement-leaves';
import { SenseHostilesLeaf, WaitLeaf } from '../sensing-leaves';
import {
  PlaceTorchIfNeededLeaf,
  RetreatAndBlockLeaf,
} from '../interaction-leaves';

// Mock Mineflayer Bot
const mockBot = {
  entity: {
    position: { x: 0, y: 64, z: 0 },
    yaw: 0,
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
  },
  quickBarSlot: 0,
  pathfinder: null,
  loadPlugin: vi.fn(),
  chat: vi.fn(),
  dig: vi.fn(),
  placeBlock: vi.fn(),
  equip: vi.fn(),
  blockAt: vi.fn().mockReturnValue({ name: 'air', boundingBox: 'empty' }),
  entities: {},
  time: { timeOfDay: 6000 },
} as any;

describe('Leaf Contract System', () => {
  let factory: LeafFactory;
  let context: LeafContext;

  beforeEach(() => {
    factory = new LeafFactory();
    context = createLeafContext(mockBot);
  });

  afterEach(() => {
    factory.clear();
  });

  describe('Leaf Specification Validation', () => {
    it('should validate a correct leaf spec', () => {
      const validSpec: LeafSpec = {
        name: 'test_leaf',
        version: '1.0.0',
        description: 'Test leaf',
        inputSchema: { type: 'object' },
        timeoutMs: 5000,
        retries: 1,
        permissions: ['movement'],
      };

      expect(() => validateLeafSpec(validSpec)).not.toThrow();
    });

    it('should reject leaf spec without name', () => {
      const invalidSpec: any = {
        version: '1.0.0',
        inputSchema: { type: 'object' },
        timeoutMs: 5000,
        retries: 1,
        permissions: ['movement'],
      };

      expect(() => validateLeafSpec(invalidSpec)).toThrow(
        'Leaf spec must have a valid name'
      );
    });

    it('should reject leaf spec without version', () => {
      const invalidSpec: any = {
        name: 'test_leaf',
        inputSchema: { type: 'object' },
        timeoutMs: 5000,
        retries: 1,
        permissions: ['movement'],
      };

      expect(() => validateLeafSpec(invalidSpec)).toThrow(
        'Leaf spec must have a valid version'
      );
    });

    it('should reject leaf spec with invalid permissions', () => {
      const invalidSpec: LeafSpec = {
        name: 'test_leaf',
        version: '1.0.0',
        inputSchema: { type: 'object' },
        timeoutMs: 5000,
        retries: 1,
        permissions: ['invalid_permission' as any],
      };

      expect(() => validateLeafSpec(invalidSpec)).toThrow(
        'Invalid permission: invalid_permission'
      );
    });
  });

  describe('Leaf Implementation Validation', () => {
    it('should validate a correct leaf implementation', () => {
      const mockImpl: LeafImpl = {
        spec: {
          name: 'test_leaf',
          version: '1.0.0',
          inputSchema: { type: 'object' },
          timeoutMs: 5000,
          retries: 1,
          permissions: ['movement'],
        },
        run: vi.fn().mockResolvedValue({ status: 'success' }),
      };

      expect(() => validateLeafImpl(mockImpl)).not.toThrow();
    });

    it('should reject leaf implementation without spec', () => {
      const invalidImpl: any = {
        run: vi.fn().mockResolvedValue({ status: 'success' }),
      };

      expect(() => validateLeafImpl(invalidImpl)).toThrow(
        'Leaf implementation must have a spec'
      );
    });

    it('should reject leaf implementation without run function', () => {
      const invalidImpl: any = {
        spec: {
          name: 'test_leaf',
          version: '1.0.0',
          inputSchema: { type: 'object' },
          timeoutMs: 5000,
          retries: 1,
          permissions: ['movement'],
        },
      };

      expect(() => validateLeafImpl(invalidImpl)).toThrow(
        'Leaf implementation must have a run function'
      );
    });
  });

  describe('Leaf Factory', () => {
    it('should register a valid leaf', () => {
      const leaf = new MoveToLeaf();
      const result = factory.register(leaf);

      expect(result.ok).toBe(true);
      expect(result.id).toBe('move_to@1.0.0');
    });

    it('should reject duplicate version registration', () => {
      const leaf1 = new MoveToLeaf();
      const leaf2 = new MoveToLeaf();

      factory.register(leaf1);
      const result = factory.register(leaf2);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('version_exists');
    });

    it('should retrieve leaf by name', () => {
      const leaf = new MoveToLeaf();
      factory.register(leaf);

      const retrieved = factory.get('move_to');
      expect(retrieved).toBe(leaf);
    });

    it('should retrieve leaf by specific version', () => {
      const leaf = new MoveToLeaf();
      factory.register(leaf);

      const retrieved = factory.get('move_to', '1.0.0');
      expect(retrieved).toBe(leaf);
    });

    it('should return undefined for non-existent leaf', () => {
      const retrieved = factory.get('non_existent');
      expect(retrieved).toBeUndefined();
    });

    it('should get all registered leaves', () => {
      const leaf1 = new MoveToLeaf();
      const leaf2 = new SenseHostilesLeaf();

      factory.register(leaf1);
      factory.register(leaf2);

      const all = factory.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(leaf1);
      expect(all).toContain(leaf2);
    });

    it('should get all leaf names', () => {
      const leaf1 = new MoveToLeaf();
      const leaf2 = new SenseHostilesLeaf();

      factory.register(leaf1);
      factory.register(leaf2);

      const names = factory.getNames();
      expect(names).toContain('move_to');
      expect(names).toContain('sense_hostiles');
    });
  });

  describe('Movement Leaves', () => {
    it('should validate MoveToLeaf specification', () => {
      const leaf = new MoveToLeaf();
      expect(() => validateLeafSpec(leaf.spec)).not.toThrow();
    });

    it('should validate StepForwardSafelyLeaf specification', () => {
      const leaf = new StepForwardSafelyLeaf();
      expect(() => validateLeafSpec(leaf.spec)).not.toThrow();
    });

    it('should register movement leaves in factory', () => {
      const moveLeaf = new MoveToLeaf();
      const stepLeaf = new StepForwardSafelyLeaf();

      const result1 = factory.register(moveLeaf);
      const result2 = factory.register(stepLeaf);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
    });
  });

  describe('Sensing Leaves', () => {
    it('should validate SenseHostilesLeaf specification', () => {
      const leaf = new SenseHostilesLeaf();
      expect(() => validateLeafSpec(leaf.spec)).not.toThrow();
    });

    it('should validate WaitLeaf specification', () => {
      const leaf = new WaitLeaf();
      expect(() => validateLeafSpec(leaf.spec)).not.toThrow();
    });

    it('should register sensing leaves in factory', () => {
      const senseLeaf = new SenseHostilesLeaf();
      const waitLeaf = new WaitLeaf();

      const result1 = factory.register(senseLeaf);
      const result2 = factory.register(waitLeaf);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
    });
  });

  describe('Interaction Leaves', () => {
    it('should validate PlaceTorchIfNeededLeaf specification', () => {
      const leaf = new PlaceTorchIfNeededLeaf();
      expect(() => validateLeafSpec(leaf.spec)).not.toThrow();
    });

    it('should validate RetreatAndBlockLeaf specification', () => {
      const leaf = new RetreatAndBlockLeaf();
      expect(() => validateLeafSpec(leaf.spec)).not.toThrow();
    });

    it('should register interaction leaves in factory', () => {
      const torchLeaf = new PlaceTorchIfNeededLeaf();
      const retreatLeaf = new RetreatAndBlockLeaf();

      const result1 = factory.register(torchLeaf);
      const result2 = factory.register(retreatLeaf);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
    });
  });

  describe('Leaf Context', () => {
    it('should create leaf context with bot', () => {
      const context = createLeafContext(mockBot);
      expect(context.bot).toBe(mockBot);
      expect(context.abortSignal).toBeDefined();
    });

    it('should provide current timestamp', () => {
      const context = createLeafContext(mockBot);
      const time1 = context.now();
      const time2 = context.now();

      expect(time1).toBeLessThanOrEqual(time2);
      expect(time2 - time1).toBeLessThan(100); // Should be very close
    });

    it('should emit metrics', () => {
      const context = createLeafContext(mockBot);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation();

      context.emitMetric('test_metric', 42, { tag: 'value' });

      expect(consoleSpy).toHaveBeenCalledWith('METRIC test_metric=42', {
        tag: 'value',
      });
      consoleSpy.mockRestore();
    });

    it('should emit errors', () => {
      const context = createLeafContext(mockBot);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation();

      context.emitError({
        code: 'path.unreachable',
        retryable: true,
        detail: 'Test error',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'ERROR: path.unreachable - Test error',
        { retryable: true }
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Torch Corridor Example Leaves', () => {
    it('should have all required leaves for torch corridor example', () => {
      const requiredLeaves = [
        new MoveToLeaf(),
        new SenseHostilesLeaf(),
        new PlaceTorchIfNeededLeaf(),
        new RetreatAndBlockLeaf(),
        new StepForwardSafelyLeaf(),
      ];

      // Register all leaves
      const results = requiredLeaves.map((leaf) => factory.register(leaf));

      // All should register successfully
      results.forEach((result) => {
        expect(result.ok).toBe(true);
      });

      // All should be retrievable
      const leafNames = [
        'move_to',
        'sense_hostiles',
        'place_torch_if_needed',
        'retreat_and_block',
        'step_forward_safely',
      ];
      leafNames.forEach((name) => {
        const leaf = factory.get(name);
        expect(leaf).toBeDefined();
        expect(leaf?.spec.name).toBe(name);
      });
    });

    it('should validate torch corridor leaf permissions', () => {
      const leaves = [
        new MoveToLeaf(),
        new SenseHostilesLeaf(),
        new PlaceTorchIfNeededLeaf(),
        new RetreatAndBlockLeaf(),
        new StepForwardSafelyLeaf(),
      ];

      // Check that each leaf has appropriate permissions
      const moveLeaves = leaves.filter((leaf) =>
        leaf.spec.permissions.includes('movement')
      );
      const placeLeaves = leaves.filter((leaf) =>
        leaf.spec.permissions.includes('place')
      );

      expect(moveLeaves).toHaveLength(3); // move_to, retreat_and_block, step_forward_safely
      expect(placeLeaves).toHaveLength(2); // place_torch_if_needed, retreat_and_block
    });
  });
});
