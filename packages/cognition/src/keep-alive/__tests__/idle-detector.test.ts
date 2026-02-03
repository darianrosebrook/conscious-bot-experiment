/**
 * Tests for Idle Detector
 *
 * Validates the idle detection contract (LF-9).
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';

import {
  detectIdle,
  buildIdleContext,
  estimateThreatLevel,
  DEFAULT_IDLE_CONFIG,
  type IdleContext,
} from '../idle-detector';

describe('detectIdle', () => {
  describe('idle detection conditions', () => {
    it('should be idle when all conditions are met', () => {
      const context: IdleContext = {
        activePlanSteps: 0,
        recentTaskConversions: 0,
        threatLevel: 'none',
        lastUserCommand: 0,
        lastKeepAliveTick: 0,
      };

      const decision = detectIdle(context);

      expect(decision.isIdle).toBe(true);
      expect(decision.reason).toBe('all_conditions_met');
      expect(decision.nextCheckMs).toBe(0);
    });

    it('should not be idle when active plan steps exist', () => {
      const context: IdleContext = {
        activePlanSteps: 2,
        recentTaskConversions: 0,
        threatLevel: 'none',
        lastUserCommand: 0,
        lastKeepAliveTick: 0,
      };

      const decision = detectIdle(context);

      expect(decision.isIdle).toBe(false);
      expect(decision.reason).toBe('active_plan_steps');
      expect(decision.nextCheckMs).toBe(5_000);
    });

    it('should not be idle when recent task conversions exist', () => {
      const context: IdleContext = {
        activePlanSteps: 0,
        recentTaskConversions: 1,
        threatLevel: 'none',
        lastUserCommand: 0,
        lastKeepAliveTick: 0,
      };

      const decision = detectIdle(context);

      expect(decision.isIdle).toBe(false);
      expect(decision.reason).toBe('recent_task_conversion');
      expect(decision.nextCheckMs).toBe(10_000);
    });

    it('should not be idle when threat level is high', () => {
      const context: IdleContext = {
        activePlanSteps: 0,
        recentTaskConversions: 0,
        threatLevel: 'high',
        lastUserCommand: 0,
        lastKeepAliveTick: 0,
      };

      const decision = detectIdle(context);

      expect(decision.isIdle).toBe(false);
      expect(decision.reason).toBe('critical_threat');
      expect(decision.nextCheckMs).toBe(1_000);
    });

    it('should not be idle when threat level is critical', () => {
      const context: IdleContext = {
        activePlanSteps: 0,
        recentTaskConversions: 0,
        threatLevel: 'critical',
        lastUserCommand: 0,
        lastKeepAliveTick: 0,
      };

      const decision = detectIdle(context);

      expect(decision.isIdle).toBe(false);
      expect(decision.reason).toBe('critical_threat');
    });

    it('should be idle when threat level is medium or lower', () => {
      const context: IdleContext = {
        activePlanSteps: 0,
        recentTaskConversions: 0,
        threatLevel: 'medium',
        lastUserCommand: 0,
        lastKeepAliveTick: 0,
      };

      const decision = detectIdle(context);

      expect(decision.isIdle).toBe(true);
    });

    it('should not be idle when user command was recent', () => {
      const now = Date.now();
      const context: IdleContext = {
        activePlanSteps: 0,
        recentTaskConversions: 0,
        threatLevel: 'none',
        lastUserCommand: now - 5_000, // 5 seconds ago
        lastKeepAliveTick: 0,
      };

      const decision = detectIdle(context, DEFAULT_IDLE_CONFIG);

      expect(decision.isIdle).toBe(false);
      expect(decision.reason).toBe('recent_user_command');
    });

    it('should be idle when user command was long ago', () => {
      const now = Date.now();
      const context: IdleContext = {
        activePlanSteps: 0,
        recentTaskConversions: 0,
        threatLevel: 'none',
        lastUserCommand: now - 15_000, // 15 seconds ago
        lastKeepAliveTick: 0,
      };

      const decision = detectIdle(context, DEFAULT_IDLE_CONFIG);

      expect(decision.isIdle).toBe(true);
    });
  });

  describe('condition priority', () => {
    it('should check active_plan_steps first', () => {
      const context: IdleContext = {
        activePlanSteps: 1,
        recentTaskConversions: 1,
        threatLevel: 'critical',
        lastUserCommand: Date.now(),
        lastKeepAliveTick: 0,
      };

      const decision = detectIdle(context);

      expect(decision.reason).toBe('active_plan_steps');
    });

    it('should check recent_task_conversion second', () => {
      const context: IdleContext = {
        activePlanSteps: 0,
        recentTaskConversions: 1,
        threatLevel: 'critical',
        lastUserCommand: Date.now(),
        lastKeepAliveTick: 0,
      };

      const decision = detectIdle(context);

      expect(decision.reason).toBe('recent_task_conversion');
    });

    it('should check critical_threat third', () => {
      const context: IdleContext = {
        activePlanSteps: 0,
        recentTaskConversions: 0,
        threatLevel: 'critical',
        lastUserCommand: Date.now(),
        lastKeepAliveTick: 0,
      };

      const decision = detectIdle(context);

      expect(decision.reason).toBe('critical_threat');
    });
  });
});

describe('buildIdleContext', () => {
  it('should create a valid context from params', () => {
    const context = buildIdleContext({
      activePlanSteps: 2,
      recentTaskConversions: 1,
      threatLevel: 'medium',
      lastUserCommand: 12345,
      lastKeepAliveTick: 67890,
    });

    expect(context.activePlanSteps).toBe(2);
    expect(context.recentTaskConversions).toBe(1);
    expect(context.threatLevel).toBe('medium');
    expect(context.lastUserCommand).toBe(12345);
    expect(context.lastKeepAliveTick).toBe(67890);
  });
});

describe('estimateThreatLevel', () => {
  it('should return none for 0 hostiles', () => {
    expect(estimateThreatLevel(0)).toBe('none');
  });

  it('should return low for 1-2 hostiles', () => {
    expect(estimateThreatLevel(1)).toBe('low');
    expect(estimateThreatLevel(2)).toBe('low');
  });

  it('should return medium for 3-5 hostiles', () => {
    expect(estimateThreatLevel(3)).toBe('medium');
    expect(estimateThreatLevel(5)).toBe('medium');
  });

  it('should return high for 6-10 hostiles', () => {
    expect(estimateThreatLevel(6)).toBe('high');
    expect(estimateThreatLevel(10)).toBe('high');
  });

  it('should return critical for >10 hostiles', () => {
    expect(estimateThreatLevel(11)).toBe('critical');
    expect(estimateThreatLevel(100)).toBe('critical');
  });
});
