/**
 * Idle Behavior Selector Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  selectIdleBehavior,
  resetIdleCooldowns,
  getIdleCooldownStatus,
  DEFAULT_IDLE_BEHAVIORS,
  type IdleContext,
} from '../idle-behavior-selector';

describe('IdleBehaviorSelector', () => {
  beforeEach(() => {
    resetIdleCooldowns();
  });

  const baseContext: IdleContext = {
    inventoryCount: 15,
    timeSinceLastTask: 60_000,
    gameTimeOfDay: 'day',
    hasInterruptedTasks: false,
    consecutiveIdleCycles: 1,
  };

  describe('selectIdleBehavior', () => {
    it('should select a behavior when context is valid', () => {
      const result = selectIdleBehavior(baseContext);

      expect(result).not.toBeNull();
      expect(result?.behavior).toBeDefined();
      expect(result?.task).toBeDefined();
      expect(result?.task.priority).toBe(0.3); // Low priority for idle tasks
    });

    it('should include idle tags in task metadata', () => {
      const result = selectIdleBehavior(baseContext);

      expect(result?.task.metadata.tags).toContain('idle');
      expect(result?.task.metadata.tags).toContain('autonomous');
      expect(result?.task.metadata.source).toBe('idle-behavior');
    });

    it('should respect cooldowns', () => {
      // Select first behavior
      const first = selectIdleBehavior(baseContext);
      expect(first).not.toBeNull();

      // Immediately try to select the same behavior type
      // It should be on cooldown, so we get a different one or null
      const cooldownStatus = getIdleCooldownStatus();
      const firstBehaviorStatus = cooldownStatus.find(
        (s) => s.id === first?.behavior.id
      );

      expect(firstBehaviorStatus?.available).toBe(false);
      expect(firstBehaviorStatus?.remainingMs).toBeGreaterThan(0);
    });

    it('should skip behaviors whose conditions are not met', () => {
      // Context with full inventory - should skip gather behaviors
      const fullInventoryContext: IdleContext = {
        ...baseContext,
        inventoryCount: 64, // Full inventory
      };

      // Run multiple selections to verify gather behaviors are skipped
      resetIdleCooldowns();
      const selections: string[] = [];
      for (let i = 0; i < 10; i++) {
        resetIdleCooldowns(); // Reset to allow re-selection
        const result = selectIdleBehavior(fullInventoryContext);
        if (result) {
          selections.push(result.behavior.id);
        }
      }

      // Should not include gather-wood or gather-stone (condition: inventoryCount < 30/25)
      // Note: This is probabilistic, but with 10 attempts it's very unlikely to miss
      const gatherCount = selections.filter(
        (id) => id === 'gather-wood' || id === 'gather-stone'
      ).length;
      expect(gatherCount).toBe(0);
    });

    it('should enable check-memories behavior when hasInterruptedTasks is true', () => {
      const contextWithInterrupted: IdleContext = {
        ...baseContext,
        hasInterruptedTasks: true,
      };

      // Run multiple selections - check-memories should be available
      resetIdleCooldowns();
      const selections: string[] = [];
      for (let i = 0; i < 30; i++) {
        resetIdleCooldowns();
        const result = selectIdleBehavior(contextWithInterrupted);
        if (result) {
          selections.push(result.behavior.id);
        }
      }

      // check-memories should be selected at least once when condition is met
      const checkMemoriesCount = selections.filter(
        (id) => id === 'check-memories'
      ).length;
      expect(checkMemoriesCount).toBeGreaterThan(0);
    });

    it('should NOT enable check-memories when hasInterruptedTasks is false', () => {
      const contextWithoutInterrupted: IdleContext = {
        ...baseContext,
        hasInterruptedTasks: false,
      };

      // Run multiple selections
      resetIdleCooldowns();
      const selections: string[] = [];
      for (let i = 0; i < 30; i++) {
        resetIdleCooldowns();
        const result = selectIdleBehavior(contextWithoutInterrupted);
        if (result) {
          selections.push(result.behavior.id);
        }
      }

      // check-memories should never be selected when condition is not met
      const checkMemoriesCount = selections.filter(
        (id) => id === 'check-memories'
      ).length;
      expect(checkMemoriesCount).toBe(0);
    });
  });

  describe('resetIdleCooldowns', () => {
    it('should clear all cooldowns', () => {
      // Trigger some behaviors to set cooldowns
      selectIdleBehavior(baseContext);
      selectIdleBehavior(baseContext);

      // Verify some cooldowns are set
      const statusBefore = getIdleCooldownStatus();
      const unavailableBefore = statusBefore.filter((s) => !s.available);
      expect(unavailableBefore.length).toBeGreaterThan(0);

      // Reset
      resetIdleCooldowns();

      // All should be available now
      const statusAfter = getIdleCooldownStatus();
      const allAvailable = statusAfter.every((s) => s.available);
      expect(allAvailable).toBe(true);
    });
  });

  describe('getIdleCooldownStatus', () => {
    it('should return status for all default behaviors', () => {
      const status = getIdleCooldownStatus();

      expect(status.length).toBe(DEFAULT_IDLE_BEHAVIORS.length);
      for (const s of status) {
        expect(s.id).toBeDefined();
        expect(s.name).toBeDefined();
        expect(typeof s.remainingMs).toBe('number');
        expect(typeof s.available).toBe('boolean');
      }
    });
  });

  describe('task generation', () => {
    it('should generate valid task structure', () => {
      const result = selectIdleBehavior(baseContext);

      expect(result?.task).toMatchObject({
        title: expect.any(String),
        description: expect.stringContaining('[Idle]'),
        type: expect.any(String),
        priority: 0.3,
        parameters: expect.any(Object),
        metadata: {
          tags: expect.arrayContaining(['idle', 'autonomous']),
          category: 'idle-behavior',
          source: 'idle-behavior',
          idleBehaviorId: expect.any(String),
        },
      });
    });

    it('should support dynamic parameters (wander behavior)', () => {
      // Force selection of wander behavior by resetting and selecting many times
      resetIdleCooldowns();
      let wanderResult = null;
      for (let i = 0; i < 50; i++) {
        resetIdleCooldowns();
        const result = selectIdleBehavior(baseContext);
        if (result?.behavior.id === 'wander') {
          wanderResult = result;
          break;
        }
      }

      if (wanderResult) {
        // Wander has dynamic parameters
        expect(wanderResult.task.parameters).toHaveProperty('direction');
        expect(wanderResult.task.parameters).toHaveProperty('distance');
        expect(['north', 'south', 'east', 'west']).toContain(
          wanderResult.task.parameters.direction
        );
      }
    });
  });
});
