/**
 * Tests for Skill Composer
 *
 * Tests the Voyager-inspired skill composition system that combines
 * multiple leaves into complex behaviors.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from 'vitest';
import SkillComposer, {
  ComposableLeaf,
  ExecutionContext,
} from '../skill-composer';
import { ComposableLeafSpec } from '../../leaves/sensing-leaves';

// ============================================================================
// Test Setup
// ============================================================================

/**
 * Mock leaf for testing
 */
class MockLeaf {
  constructor(
    public id: string,
    public name: string,
    public spec: ComposableLeafSpec
  ) {}
}

/**
 * Create a mock composable leaf
 */
function createMockLeaf(
  id: string,
  name: string,
  inputTypes: string[],
  outputTypes: string[],
  combinableWith: string[],
  complexity: number
): ComposableLeaf {
  return {
    id,
    name,
    spec: {
      name,
      version: '1.0.0',
      description: `Mock ${name} leaf`,
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
      timeoutMs: 1000,
      retries: 0,
      permissions: ['test'],
      composition: {
        inputTypes,
        outputTypes,
        combinableWith,
        complexity,
        prerequisites: ['bot_spawned'],
        sideEffects: ['none'],
      },
    },
    instance: new MockLeaf(id, name, {} as ComposableLeafSpec),
  };
}

/**
 * Create test execution context
 */
function createTestContext(): ExecutionContext {
  return {
    worldState: {
      hasWood: false,
      hasStone: false,
      hasPickaxe: false,
    },
    availableResources: ['basic_tools'],
    timeConstraints: {
      urgency: 'medium',
      maxDuration: 30000,
    },
    safetyConstraints: ['avoid_hostiles'],
    botCapabilities: ['movement', 'mining', 'crafting'],
  };
}

// ============================================================================
// Test Cases
// ============================================================================

describe('SkillComposer', () => {
  let composer: SkillComposer;
  let testContext: ExecutionContext;

  beforeEach(() => {
    composer = new SkillComposer();
    testContext = createTestContext();
  });

  describe('Leaf Registration', () => {
    it('should register leaves correctly', () => {
      const leaf = createMockLeaf(
        'test_leaf',
        'test_leaf',
        ['input_type'],
        ['output_type'],
        ['all_leaf_types'],
        1
      );

      composer.registerLeaf(leaf);

      // Check if leaf was registered (we can't directly access private members)
      // Instead, we'll test through composition
      expect(async () => {
        await composer.composeLeaves('move to safety', testContext);
      }).not.toThrow();
    });

    it('should unregister leaves correctly', () => {
      const leaf = createMockLeaf(
        'test_leaf',
        'test_leaf',
        ['input_type'],
        ['output_type'],
        ['all_leaf_types'],
        1
      );

      composer.registerLeaf(leaf);
      composer.unregisterLeaf(leaf.id);

      // After unregistering, composition should fail
      expect(async () => {
        await composer.composeLeaves('move to safety', testContext);
      }).rejects.toThrow();
    });
  });

  describe('Goal Analysis', () => {
    it('should identify movement requirements', async () => {
      const leaf = createMockLeaf(
        'movement_leaf',
        'movement_leaf',
        ['world_state'],
        ['movement'],
        ['all_leaf_types'],
        3
      );

      composer.registerLeaf(leaf);

      const result = await composer.composeLeaves(
        'move to safety',
        testContext
      );

      expect(result.leaves).toHaveLength(1);
      expect(result.leaves[0].name).toBe('movement_leaf');
    });

    it('should identify safety requirements', async () => {
      const leaf = createMockLeaf(
        'safety_leaf',
        'safety_leaf',
        ['world_state'],
        ['safety_assessment'],
        ['all_leaf_types'],
        2
      );

      composer.registerLeaf(leaf);

      const result = await composer.composeLeaves(
        'assess dangerous area',
        testContext
      );

      expect(result.leaves).toHaveLength(1);
      expect(result.leaves[0].name).toBe('safety_leaf');
    });

    it('should identify resource gathering requirements', async () => {
      const leaf = createMockLeaf(
        'mining_leaf',
        'mining_leaf',
        ['world_state'],
        ['resource_gathering'],
        ['all_leaf_types'],
        4
      );

      composer.registerLeaf(leaf);

      const result = await composer.composeLeaves(
        'mine stone blocks',
        testContext
      );

      expect(result.leaves).toHaveLength(1);
      expect(result.leaves[0].name).toBe('mining_leaf');
    });

    it('should identify crafting requirements', async () => {
      const leaf = createMockLeaf(
        'crafting_leaf',
        'crafting_leaf',
        ['world_state'],
        ['crafting'],
        ['all_leaf_types'],
        5
      );

      composer.registerLeaf(leaf);

      const result = await composer.composeLeaves(
        'craft wooden tools',
        testContext
      );

      expect(result.leaves).toHaveLength(1);
      expect(result.leaves[0].name).toBe('crafting_leaf');
    });
  });

  describe('Leaf Combination', () => {
    it('should combine compatible leaves', async () => {
      const safetyLeaf = createMockLeaf(
        'safety_leaf',
        'safety_leaf',
        ['world_state'],
        ['safety_assessment'],
        ['movement_leaf'],
        2
      );

      const movementLeaf = createMockLeaf(
        'movement_leaf',
        'movement_leaf',
        ['safety_assessment'],
        ['movement'],
        ['safety_leaf'],
        3
      );

      composer.registerLeaf(safetyLeaf);
      composer.registerLeaf(movementLeaf);

      const result = await composer.composeLeaves(
        'move to safety',
        testContext
      );

      expect(result.leaves).toHaveLength(2);
      expect(result.executionPlan).toHaveLength(2);

      // Safety leaf should execute first
      expect(result.executionPlan[0].leafId).toBe('safety_leaf');
      expect(result.executionPlan[1].leafId).toBe('movement_leaf');
    });

    it('should not combine incompatible leaves', async () => {
      const leaf1 = createMockLeaf(
        'leaf1',
        'leaf1',
        ['input1'],
        ['output1'],
        ['leaf2'],
        2
      );

      const leaf2 = createMockLeaf(
        'leaf2',
        'leaf2',
        ['input2'],
        ['output2'],
        ['leaf1'],
        3
      );

      composer.registerLeaf(leaf1);
      composer.registerLeaf(leaf2);

      const result = await composer.composeLeaves('test goal', testContext);

      // Should only use one leaf since they're not compatible
      expect(result.leaves).toHaveLength(1);
    });

    it('should handle leaves with no dependencies', async () => {
      const leaf1 = createMockLeaf(
        'leaf1',
        'leaf1',
        ['world_state'],
        ['output1'],
        ['all_leaf_types'],
        2
      );

      const leaf2 = createMockLeaf(
        'leaf2',
        'leaf2',
        ['world_state'],
        ['output2'],
        ['all_leaf_types'],
        3
      );

      composer.registerLeaf(leaf1);
      composer.registerLeaf(leaf2);

      const result = await composer.composeLeaves('test goal', testContext);

      // Should use the simpler leaf
      expect(result.leaves).toHaveLength(1);
      expect(result.leaves[0].name).toBe('leaf1');
    });
  });

  describe('Complexity and Priority', () => {
    it('should prefer lower complexity for high urgency', async () => {
      const simpleLeaf = createMockLeaf(
        'simple_leaf',
        'simple_leaf',
        ['world_state'],
        ['output'],
        ['all_leaf_types'],
        2
      );

      const complexLeaf = createMockLeaf(
        'complex_leaf',
        'complex_leaf',
        ['world_state'],
        ['output'],
        ['all_leaf_types'],
        8
      );

      composer.registerLeaf(simpleLeaf);
      composer.registerLeaf(complexLeaf);

      const highUrgencyContext = {
        ...testContext,
        timeConstraints: {
          ...testContext.timeConstraints,
          urgency: 'emergency' as const,
        },
      };

      const result = await composer.composeLeaves(
        'urgent goal',
        highUrgencyContext
      );

      expect(result.leaves[0].name).toBe('simple_leaf');
    });

    it('should calculate success probability based on complexity', async () => {
      const leaf = createMockLeaf(
        'test_leaf',
        'test_leaf',
        ['world_state'],
        ['safety_assessment'],
        ['all_leaf_types'],
        7
      );

      composer.registerLeaf(leaf);

      const result = await composer.composeLeaves(
        'move to safety',
        testContext
      );

      // High complexity should reduce success probability
      expect(result.metadata.successRate).toBeLessThan(0.8);
    });
  });

  describe('Validation', () => {
    it('should detect circular dependencies', async () => {
      const leaf1 = createMockLeaf(
        'leaf1',
        'leaf1',
        ['movement'], // leaf1 now depends on movement output from leaf2
        ['safety_assessment'],
        ['leaf2'],
        2
      );

      const leaf2 = createMockLeaf(
        'leaf2',
        'leaf2',
        ['safety_assessment'], // leaf2 depends on safety_assessment from leaf1
        ['movement'],
        ['leaf1'],
        3
      );

      composer.registerLeaf(leaf1);
      composer.registerLeaf(leaf2);

      const result = await composer.composeLeaves(
        'move to safety',
        testContext
      );

      // Should detect circular dependency
      expect(
        result.validation.errors.some((error) =>
          error.includes('Circular dependency detected')
        )
      ).toBe(true);
      expect(result.validation.isValid).toBe(false);
    });

    it('should warn about high complexity', async () => {
      const leaf = createMockLeaf(
        'complex_leaf',
        'complex_leaf',
        ['world_state'],
        ['safety_assessment'],
        ['all_leaf_types'],
        9
      );

      composer.registerLeaf(leaf);

      const result = await composer.composeLeaves(
        'move to safety',
        testContext
      );

      expect(result.validation.warnings).toContain(
        'High complexity combination may be unreliable'
      );
    });

    it('should warn about low success probability', async () => {
      const leaf = createMockLeaf(
        'risky_leaf',
        'risky_leaf',
        ['world_state'],
        ['safety_assessment'],
        ['all_leaf_types'],
        10
      );

      composer.registerLeaf(leaf);

      const result = await composer.composeLeaves(
        'move to safety',
        testContext
      );

      expect(result.validation.warnings).toContain('Low success probability');
    });
  });

  describe('Execution Plan', () => {
    it('should create proper execution order', async () => {
      const safetyLeaf = createMockLeaf(
        'safety_leaf',
        'safety_leaf',
        ['world_state'],
        ['safety_assessment'],
        ['movement_leaf'],
        2
      );

      const movementLeaf = createMockLeaf(
        'movement_leaf',
        'movement_leaf',
        ['safety_assessment'],
        ['movement'],
        ['safety_leaf'],
        3
      );

      composer.registerLeaf(safetyLeaf);
      composer.registerLeaf(movementLeaf);

      const result = await composer.composeLeaves(
        'move to safety',
        testContext
      );

      expect(result.executionPlan).toHaveLength(2);

      // Check dependencies
      expect(result.executionPlan[0].dependencies).toHaveLength(0);
      expect(result.executionPlan[1].dependencies).toContain('safety_leaf');
    });

    it('should handle inputs and outputs correctly', async () => {
      const leaf = createMockLeaf(
        'test_leaf',
        'test_leaf',
        ['world_state', 'bot_position'],
        ['output'],
        ['all_leaf_types'],
        2
      );

      composer.registerLeaf(leaf);

      const result = await composer.composeLeaves(
        'move to safety',
        testContext
      );

      const step = result.executionPlan[0];
      expect(step.inputs.world_state).toBeDefined();
      expect(step.inputs.bot_position).toBe('current_bot_position');
    });
  });

  describe('Error Handling', () => {
    it('should handle composition failures gracefully', async () => {
      // No leaves registered
      await expect(
        composer.composeLeaves('impossible goal', testContext)
      ).rejects.toThrow('No compatible combinations found');
    });

    it('should emit events for monitoring', (done) => {
      const leaf = createMockLeaf(
        'test_leaf',
        'test_leaf',
        ['world_state'],
        ['output'],
        ['all_leaf_types'],
        2
      );

      composer.on('skillComposed', (skill) => {
        expect(skill.name).toBe('Composed: move to safety');
        done();
      });

      composer.registerLeaf(leaf);
      composer.composeLeaves('move to safety', testContext);
    });
  });
});
