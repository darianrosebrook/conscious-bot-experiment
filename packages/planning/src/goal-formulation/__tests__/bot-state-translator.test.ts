/**
 * Tests for the bot-state-to-homeostasis translator.
 *
 * Verifies that raw Minecraft bot state is correctly mapped to
 * normalized HomeostasisState signals.
 */
import { describe, it, expect } from 'vitest';
import {
  translateBotState,
  type BotStateSnapshot,
} from '../bot-state-translator';
import { HomeostasisMonitor } from '../homeostasis-monitor';

describe('translateBotState', () => {
  // ===================================================================
  // Health mapping
  // ===================================================================
  describe('health', () => {
    it('full health (20) → 1.0', () => {
      const result = translateBotState({ health: 20 });
      expect(result.health).toBe(1);
    });

    it('zero health → 0.0', () => {
      const result = translateBotState({ health: 0 });
      expect(result.health).toBe(0);
    });

    it('half health (10) → 0.5', () => {
      const result = translateBotState({ health: 10 });
      expect(result.health).toBe(0.5);
    });

    it('missing health → undefined (not in partial)', () => {
      const result = translateBotState({});
      expect(result.health).toBeUndefined();
    });
  });

  // ===================================================================
  // Hunger mapping
  // ===================================================================
  describe('hunger', () => {
    it('full food (20) → hunger 0.0 (not hungry)', () => {
      const result = translateBotState({ food: 20 });
      expect(result.hunger).toBe(0);
    });

    it('zero food → hunger 1.0 (starving)', () => {
      const result = translateBotState({ food: 0 });
      expect(result.hunger).toBe(1);
    });

    it('food=5 → hunger 0.75', () => {
      const result = translateBotState({ food: 5 });
      expect(result.hunger).toBe(0.75);
    });

    it('food=14 → hunger 0.3', () => {
      const result = translateBotState({ food: 14 });
      expect(result.hunger).toBe(0.3);
    });

    it('missing food → undefined', () => {
      const result = translateBotState({});
      expect(result.hunger).toBeUndefined();
    });
  });

  // ===================================================================
  // Safety mapping
  // ===================================================================
  describe('safety', () => {
    it('no hostiles, daytime → 0.9 (base safety)', () => {
      const result = translateBotState({ nearbyHostiles: 0, timeOfDay: 6000 });
      expect(result.safety).toBe(0.9);
    });

    it('no hostiles, nighttime → 0.8 (night penalty)', () => {
      const result = translateBotState({ nearbyHostiles: 0, timeOfDay: 18000 });
      expect(result.safety).toBe(0.8);
    });

    it('1 hostile, daytime → 0.75', () => {
      const result = translateBotState({ nearbyHostiles: 1, timeOfDay: 6000 });
      expect(result.safety).toBe(0.75);
    });

    it('3 hostiles, nighttime → 0.35', () => {
      const result = translateBotState({ nearbyHostiles: 3, timeOfDay: 18000 });
      expect(result.safety).toBe(0.35);
    });

    it('5+ hostiles → clamped to 0.0', () => {
      const result = translateBotState({ nearbyHostiles: 7, timeOfDay: 6000 });
      expect(result.safety).toBe(0);
    });

    it('neither hostiles nor timeOfDay → undefined', () => {
      const result = translateBotState({});
      expect(result.safety).toBeUndefined();
    });

    it('only timeOfDay (no hostiles) → computed with 0 hostiles', () => {
      const result = translateBotState({ timeOfDay: 18000 });
      expect(result.safety).toBe(0.8);
    });
  });

  // ===================================================================
  // Energy proxy
  // ===================================================================
  describe('energy', () => {
    it('full health + full food → energy 1.0', () => {
      const result = translateBotState({ health: 20, food: 20 });
      expect(result.energy).toBe(1);
    });

    it('zero health + zero food → energy 0.0', () => {
      const result = translateBotState({ health: 0, food: 0 });
      expect(result.energy).toBe(0);
    });

    it('half health + half food → energy 0.5', () => {
      const result = translateBotState({ health: 10, food: 10 });
      expect(result.energy).toBe(0.5);
    });

    it('missing either health or food → energy undefined', () => {
      expect(translateBotState({ health: 20 }).energy).toBeUndefined();
      expect(translateBotState({ food: 20 }).energy).toBeUndefined();
    });
  });

  // ===================================================================
  // Defensive readiness
  // ===================================================================
  describe('defensiveReadiness', () => {
    it('0 hostiles → 1.0', () => {
      const result = translateBotState({ nearbyHostiles: 0 });
      expect(result.defensiveReadiness).toBe(1);
    });

    it('5+ hostiles → 0.0', () => {
      const result = translateBotState({ nearbyHostiles: 5 });
      expect(result.defensiveReadiness).toBe(0);
    });

    it('2 hostiles → 0.6', () => {
      const result = translateBotState({ nearbyHostiles: 2 });
      expect(result.defensiveReadiness).toBe(0.6);
    });

    it('missing → undefined', () => {
      const result = translateBotState({});
      expect(result.defensiveReadiness).toBeUndefined();
    });
  });

  // ===================================================================
  // Output invariants
  // ===================================================================
  describe('output invariants', () => {
    it('all outputs are clamped to [0, 1]', () => {
      // Extreme values that might overflow
      const result = translateBotState({
        health: 100,
        food: -10,
        nearbyHostiles: 50,
        timeOfDay: 18000,
      });
      expect(result.health).toBeLessThanOrEqual(1);
      expect(result.health).toBeGreaterThanOrEqual(0);
      expect(result.hunger).toBeLessThanOrEqual(1);
      expect(result.hunger).toBeGreaterThanOrEqual(0);
      expect(result.safety).toBeLessThanOrEqual(1);
      expect(result.safety).toBeGreaterThanOrEqual(0);
    });

    it('all outputs are rounded to 2 decimal places', () => {
      const result = translateBotState({ health: 7, food: 13 });
      const countDecimals = (n: number) => {
        const str = n.toString();
        return str.includes('.') ? str.split('.')[1].length : 0;
      };
      if (result.health != null) expect(countDecimals(result.health)).toBeLessThanOrEqual(2);
      if (result.hunger != null) expect(countDecimals(result.hunger)).toBeLessThanOrEqual(2);
      if (result.energy != null) expect(countDecimals(result.energy)).toBeLessThanOrEqual(2);
    });

    it('empty input returns empty partial (no undefined fields)', () => {
      const result = translateBotState({});
      expect(Object.keys(result).length).toBe(0);
    });

    it('does not include fields not derivable from bot state', () => {
      const result = translateBotState({ health: 20, food: 20, nearbyHostiles: 0, timeOfDay: 6000 });
      // These should never be present — no direct Minecraft observable
      expect(result).not.toHaveProperty('curiosity');
      expect(result).not.toHaveProperty('social');
      expect(result).not.toHaveProperty('achievement');
      expect(result).not.toHaveProperty('creativity');
      expect(result).not.toHaveProperty('resourceManagement');
      expect(result).not.toHaveProperty('shelterStability');
      expect(result).not.toHaveProperty('farmHealth');
      expect(result).not.toHaveProperty('inventoryOrganization');
      expect(result).not.toHaveProperty('worldKnowledge');
      expect(result).not.toHaveProperty('redstoneProficiency');
      expect(result).not.toHaveProperty('constructionSkill');
      expect(result).not.toHaveProperty('mechanicalAptitude');
      expect(result).not.toHaveProperty('agriculturalKnowledge');
    });
  });

  // ===================================================================
  // Integration: translator output → HomeostasisMonitor.sample()
  // ===================================================================
  describe('integration with HomeostasisMonitor', () => {
    it('translated state merges correctly with monitor defaults', () => {
      const botState: BotStateSnapshot = {
        health: 16,
        food: 5,
        nearbyHostiles: 2,
        timeOfDay: 18000,
      };
      const partial = translateBotState(botState);
      const monitor = new HomeostasisMonitor();
      const homeostasis = monitor.sample(partial);

      // Derived fields should match translation
      expect(homeostasis.health).toBe(0.8);  // 16/20
      expect(homeostasis.hunger).toBe(0.75); // 1 - 5/20
      expect(homeostasis.safety).toBe(0.5);  // 0.9 - 2*0.15 - 0.1
      expect(homeostasis.energy).toBe(0.53); // (0.8 + 0.25) / 2 ≈ 0.525 → 0.53

      // Non-derived fields should be at defaults
      expect(homeostasis.curiosity).toBe(0.5);
      expect(homeostasis.social).toBe(0.3);
      expect(homeostasis.achievement).toBe(0.4);
    });

    it('hunger threshold alignment: food=5 produces urgency > 0.7 for eat_immediate', () => {
      const partial = translateBotState({ food: 5 });
      expect(partial.hunger).toBe(0.75);
      // generateNeeds will use this as urgency for the nutrition need
      // eat_immediate template requires urgency > 0.7 → 0.75 > 0.7 ✓
      expect(partial.hunger!).toBeGreaterThan(0.7);
    });

    it('hunger threshold alignment: food=6 produces urgency NOT > 0.7', () => {
      const partial = translateBotState({ food: 6 });
      expect(partial.hunger).toBe(0.7);
      // eat_immediate requires urgency > 0.7 (strictly greater)
      // 0.7 is NOT > 0.7 → template should NOT fire
      expect(partial.hunger!).not.toBeGreaterThan(0.7);
    });

    it('safety threshold: 3+ hostiles at night triggers safety urgency > 0.5', () => {
      const partial = translateBotState({ nearbyHostiles: 3, timeOfDay: 18000 });
      expect(partial.safety).toBe(0.35);
      // Need generator: safety urgency = 1 - safety = 0.65
      // flee_danger template requires urgency > 0.8 → 0.65 < 0.8, not yet
      // But build_shelter requires urgency > 0.5 → 1 - 0.35 = 0.65 > 0.5 ✓
      expect(1 - partial.safety!).toBeGreaterThan(0.5);
    });
  });
});
