/**
 * M2 Planning Integration Test
 *
 * Tests planning components in isolation to verify goal generation works.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HomeostasisMonitor } from '../goal-formulation/homeostasis-monitor';
import { generateNeeds } from '../goal-formulation/need-generator';
import { GoalManager } from '../goal-formulation/goal-manager';
import { GoalType, NeedType, SignalType } from '../types';

describe('M2 Planning Integration', () => {
  let homeostasisMonitor: HomeostasisMonitor;
  let goalManager: GoalManager;

  beforeEach(() => {
    homeostasisMonitor = new HomeostasisMonitor();
    goalManager = new GoalManager();
  });

  describe('Goal Generation Flow', () => {
    it('should generate goals from homeostasis state', () => {
      // Simulate low energy homeostasis state
      const homeostasis = homeostasisMonitor.sample({
        energy: 0.2,
        hunger: 0.8,
        safety: 0.9,
      });

      expect(homeostasis).toBeDefined();
      expect(homeostasis.energy).toBe(0.2);
      expect(homeostasis.hunger).toBe(0.8);

      // Generate needs from homeostasis
      const needs = generateNeeds(homeostasis);
      expect(needs).toBeDefined();
      expect(needs.length).toBeGreaterThan(0);

      // Should prioritize hunger and energy needs
      const nutritionNeed = needs.find(
        (n) => n.type === NeedType.SURVIVAL && n.description.includes('hunger')
      );
      const survivalNeed = needs.find((n) => n.type === NeedType.SURVIVAL);

      // Either nutrition or survival need should be present
      expect(nutritionNeed || survivalNeed).toBeDefined();
      if (nutritionNeed) {
        expect(nutritionNeed.intensity).toBeGreaterThan(0.5);
      }
      if (survivalNeed) {
        expect(survivalNeed.intensity).toBeGreaterThan(0.5);
      }

      // Create goal from needs
      const goal = goalManager.createFromNeeds(needs);
      expect(goal).toBeDefined();
      expect(goal?.type).toBe(GoalType.SURVIVAL);
      expect(goal?.priority).toBeGreaterThan(0.5);
    });

    it('should handle default homeostasis gracefully', () => {
      const homeostasis = homeostasisMonitor.sample();
      expect(homeostasis.health).toBe(1);
      expect(homeostasis.energy).toBe(0.8);

      const needs = generateNeeds(homeostasis);
      expect(needs.length).toBeGreaterThan(0);

      // Should have at least one need (exploration or other)
      expect(needs.length).toBeGreaterThan(0);

      // Check for exploration or curiosity need
      const explorationNeed = needs.find(
        (n) => n.type === NeedType.CURIOSITY || n.type === NeedType.EXPLORATION
      );
      expect(explorationNeed).toBeDefined();
    });

    it('should manage goal queue and selection', () => {
      const homeostasis = homeostasisMonitor.sample();
      const needs = generateNeeds(homeostasis);

      // Create multiple goals
      const goal1 = goalManager.createFromNeeds(needs);
      const goal2 = goalManager.createFromNeeds(needs);

      if (goal1) goalManager.upsert(goal1);
      if (goal2) goalManager.upsert(goal2);

      const goals = goalManager.list();
      expect(goals.length).toBeGreaterThanOrEqual(1);

      const selectedGoal = goalManager.selectNext();
      expect(selectedGoal).toBeDefined();
      expect(selectedGoal?.utility).toBeGreaterThan(0);
    });

    it('should handle edge cases gracefully', () => {
      // Test null/undefined guards
      expect(() => generateNeeds(undefined)).not.toThrow();
      expect(() => goalManager.createFromNeeds([])).not.toThrow();

      // Test empty inputs
      const emptyNeeds = generateNeeds(undefined);
      expect(emptyNeeds.length).toBeGreaterThan(0); // Should provide default exploration need

      const noGoal = goalManager.createFromNeeds([]);
      expect(noGoal).toBeUndefined();
    });
  });
});
