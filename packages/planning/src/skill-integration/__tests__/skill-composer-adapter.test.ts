/**
 * Tests for SkillComposerAdapter integration
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillComposerAdapter } from '../skill-composer-adapter';
import { SkillRegistry } from '@conscious-bot/memory';
import { Goal, GoalType, GoalStatus } from '../../types';

// Mock the SkillComposer and ComposedSkill
const mockSkillComposer = {
  on: vi.fn(),
  composeLeaves: vi.fn(),
};

const mockComposedSkill = {
  id: 'composed_skill_1',
  name: 'Composed: test goal',
  description: 'A composed skill for testing',
  leaves: [],
  executionPlan: [],
  metadata: {
    successRate: 0.8,
    complexity: 5,
    executionCount: 0,
    lastUsed: Date.now(),
    tags: ['test'],
    context: { leafCount: 2, estimatedDuration: 5000 },
  },
  validation: { isValid: true, errors: [], warnings: [], suggestions: [] },
};

describe('SkillComposerAdapter', () => {
  let adapter: SkillComposerAdapter;
  let mockSkillRegistry: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock skill registry
    mockSkillRegistry = {
      registerSkill: vi.fn(),
      getAllSkills: vi.fn().mockReturnValue([]),
    };

    // Create adapter instance
    adapter = new SkillComposerAdapter(
      mockSkillComposer as any,
      mockSkillRegistry
    );
  });

  describe('Initialization', () => {
    it('should initialize with goal mapping', () => {
      expect(adapter).toBeDefined();
      // The adapter should have initialized goal mappings
      expect(adapter.getComposedSkills()).toEqual([]);
    });

    it('should set up event handlers', () => {
      expect(mockSkillComposer.on).toHaveBeenCalledWith(
        'skillComposed',
        expect.any(Function)
      );
      expect(mockSkillComposer.on).toHaveBeenCalledWith(
        'compositionError',
        expect.any(Function)
      );
    });
  });

  describe('Goal Conversion', () => {
    it('should convert goal to description', async () => {
      const goal: Goal = {
        id: 'test_goal_1',
        type: GoalType.SURVIVAL,
        priority: 8,
        urgency: 7,
        utility: 0.9,
        description: 'Survive the night',
        preconditions: [],
        effects: [],
        status: GoalStatus.ACTIVE,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      const result = await adapter.composeSkillsForGoal({
        goal,
        context: {
          worldState: {},
          availableResources: {},
          timeConstraints: {
            urgency: 'high',
            maxPlanningTime: 5000,
          },
          botCapabilities: {
            availableLeaves: ['safety_leaf', 'movement_leaf'],
            currentHealth: 100,
            currentPosition: [0, 0, 0],
          },
        },
      });

      // Should attempt composition with the goal description
      expect(mockSkillComposer.composeLeaves).toHaveBeenCalledWith(
        'Survive the night',
        expect.any(Object)
      );
    });

    it('should generate description from goal type when description is empty', async () => {
      const goal: Goal = {
        id: 'test_goal_2',
        type: GoalType.EXPLORATION,
        priority: 6,
        urgency: 5,
        utility: 0.7,
        description: '',
        preconditions: [],
        effects: [],
        status: GoalStatus.ACTIVE,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      const result = await adapter.composeSkillsForGoal({
        goal,
        context: {
          worldState: {},
          availableResources: {},
          timeConstraints: {
            urgency: 'medium',
            maxPlanningTime: 5000,
          },
          botCapabilities: {
            availableLeaves: ['movement_leaf'],
            currentHealth: 100,
            currentPosition: [0, 0, 0],
          },
        },
      });

      // Should use generated description from goal type
      expect(mockSkillComposer.composeLeaves).toHaveBeenCalledWith(
        'explore new areas safely',
        expect.any(Object)
      );
    });
  });

  describe('Context Conversion', () => {
    it('should convert planning context to execution context', async () => {
      const goal: Goal = {
        id: 'test_goal_3',
        type: GoalType.SAFETY,
        priority: 9,
        urgency: 8,
        utility: 0.95,
        description: 'Assess threat level',
        preconditions: [],
        effects: [],
        status: GoalStatus.ACTIVE,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      const context = {
        worldState: { time: 'night', weather: 'clear' },
        availableResources: { food: 10, tools: 5 },
        timeConstraints: {
          urgency: 'emergency',
          maxPlanningTime: 2000,
        },
        botCapabilities: {
          availableLeaves: ['safety_leaf'],
          currentHealth: 75,
          currentPosition: [100, 64, 200],
        },
      };

      await adapter.composeSkillsForGoal({ goal, context });

      // Verify context conversion
      expect(mockSkillComposer.composeLeaves).toHaveBeenCalledWith(
        'Assess threat level',
        expect.objectContaining({
          worldState: { time: 'night', weather: 'clear' },
          timeConstraints: {
            urgency: 'emergency',
            maxPlanningTime: 2000,
          },
          availableResources: { food: 10, tools: 5 },
          botCapabilities: {
            availableLeaves: ['safety_leaf'],
            currentHealth: 75,
            currentPosition: [100, 64, 200],
          },
        })
      );
    });
  });

  describe('Skill Composition', () => {
    it('should handle successful skill composition', async () => {
      // Mock successful composition
      mockSkillComposer.composeLeaves.mockResolvedValue(mockComposedSkill);

      const goal: Goal = {
        id: 'test_goal_4',
        type: GoalType.REACH_LOCATION,
        priority: 7,
        urgency: 6,
        utility: 0.8,
        description: 'Move to safe location',
        preconditions: [],
        effects: [],
        status: GoalStatus.ACTIVE,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      const result = await adapter.composeSkillsForGoal({
        goal,
        context: {
          worldState: {},
          availableResources: {},
          timeConstraints: { urgency: 'medium', maxPlanningTime: 5000 },
          botCapabilities: {
            availableLeaves: ['movement_leaf'],
            currentHealth: 100,
            currentPosition: [0, 0, 0],
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.composedSkill).toBeDefined();
      expect(result.composedSkill!.name).toBe('Composed: test goal');
      expect(result.estimatedSuccess).toBe(0.8);
      expect(result.complexity).toBe('moderate');
    });

    it('should handle composition failure gracefully', async () => {
      // Mock composition failure
      mockSkillComposer.composeLeaves.mockResolvedValue(null);

      const goal: Goal = {
        id: 'test_goal_5',
        type: GoalType.CREATIVITY,
        priority: 5,
        urgency: 4,
        utility: 0.6,
        description: 'Create complex item',
        preconditions: [],
        effects: [],
        status: GoalStatus.ACTIVE,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      const result = await adapter.composeSkillsForGoal({
        goal,
        context: {
          worldState: {},
          availableResources: {},
          timeConstraints: { urgency: 'low', maxPlanningTime: 5000 },
          botCapabilities: {
            availableLeaves: [],
            currentHealth: 100,
            currentPosition: [0, 0, 0],
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.reasoning).toContain(
        'No compatible skill combination found'
      );
      expect(result.estimatedSuccess).toBe(0.3);
    });
  });

  describe('Caching', () => {
    it('should cache successful compositions', async () => {
      mockSkillComposer.composeLeaves.mockResolvedValue(mockComposedSkill);

      const goal: Goal = {
        id: 'test_goal_6',
        type: GoalType.ACHIEVEMENT,
        priority: 8,
        urgency: 7,
        utility: 0.9,
        description: 'Complete challenging task',
        preconditions: [],
        effects: [],
        status: GoalStatus.ACTIVE,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      const context = {
        worldState: { difficulty: 'hard' },
        availableResources: { energy: 100 },
        timeConstraints: { urgency: 'high', maxPlanningTime: 5000 },
        botCapabilities: {
          availableLeaves: ['skill_leaf'],
          currentHealth: 100,
          currentPosition: [0, 0, 0],
        },
      };

      // First call should compose
      const result1 = await adapter.composeSkillsForGoal({ goal, context });
      expect(result1.success).toBe(true);
      expect(mockSkillComposer.composeLeaves).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await adapter.composeSkillsForGoal({ goal, context });
      expect(result2.success).toBe(true);
      expect(result2.reasoning).toContain('Retrieved from composition cache');
      expect(mockSkillComposer.composeLeaves).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should provide cache statistics', () => {
      const stats = adapter.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.hitRate).toBe('number');
    });

    it('should clear cache', () => {
      adapter.clearCache();
      const stats = adapter.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('Fallback Skills', () => {
    it('should find fallback skills when composition fails', async () => {
      // Mock composition failure
      mockSkillComposer.composeLeaves.mockResolvedValue(null);

      // Mock existing skills in registry
      const existingSkills = [
        {
          id: 'existing_skill_1',
          name: 'Basic Movement',
          description: 'Simple movement skill',
          metadata: { successRate: 0.7, complexity: 'simple' },
        },
        {
          id: 'existing_skill_2',
          name: 'Safety Check',
          description: 'Basic safety assessment',
          metadata: { successRate: 0.8, complexity: 'simple' },
        },
      ];

      mockSkillRegistry.getAllSkills.mockReturnValue(existingSkills);

      const goal: Goal = {
        id: 'test_goal_7',
        type: GoalType.SAFETY,
        priority: 9,
        urgency: 8,
        utility: 0.95,
        description: 'Ensure safety',
        preconditions: [],
        effects: [],
        status: GoalStatus.ACTIVE,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        subGoals: [],
      };

      const result = await adapter.composeSkillsForGoal({
        goal,
        context: {
          worldState: {},
          availableResources: {},
          timeConstraints: { urgency: 'emergency', maxPlanningTime: 2000 },
          botCapabilities: {
            availableLeaves: [],
            currentHealth: 100,
            currentPosition: [0, 0, 0],
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.fallbackSkills).toBeDefined();
      expect(result.fallbackSkills!.length).toBeGreaterThan(0);
      expect(result.fallbackSkills![0]).toBe('existing_skill_2'); // Safety Check should be more relevant
    });
  });
});
