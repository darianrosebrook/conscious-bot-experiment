import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReflexArbitrator, ReflexEvent, type ReflexSeverity } from '../reflex-arbitrator';

describe('ReflexArbitrator', () => {
  let arbitrator: ReflexArbitrator;

  beforeEach(() => {
    arbitrator = new ReflexArbitrator();
  });

  describe('enterReflexMode', () => {
    it('blocks planner after entering reflex mode', () => {
      arbitrator.enterReflexMode('critical_threat:creeper', 10);

      expect(arbitrator.isPlannerBlocked()).toBe(true);
      expect(arbitrator.isReflexActive(10)).toBe(true);
    });

    it('emits reflex_enter event', () => {
      const events: ReflexEvent[] = [];
      arbitrator.onEvent((e) => events.push(e));

      arbitrator.enterReflexMode('critical_threat:zombie', 5);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('reflex_enter');
      expect(events[0].reason).toBe('critical_threat:zombie');
      expect(events[0].tick).toBe(5);
      expect(events[0].remainingTicks).toBe(10);
    });

    it('does not emit duplicate reflex_enter when already active', () => {
      const events: ReflexEvent[] = [];
      arbitrator.onEvent((e) => events.push(e));

      arbitrator.enterReflexMode('threat_a', 5);
      arbitrator.enterReflexMode('threat_b', 6); // Re-enter while active

      const enterEvents = events.filter((e) => e.type === 'reflex_enter');
      expect(enterEvents).toHaveLength(1); // Only the first one
    });
  });

  describe('tickUpdate', () => {
    it('emits reflex_tick events during override', () => {
      const events: ReflexEvent[] = [];
      arbitrator.onEvent((e) => events.push(e));

      arbitrator.enterReflexMode('critical_threat', 10);
      arbitrator.tickUpdate(11);

      const tickEvents = events.filter((e) => e.type === 'reflex_tick');
      expect(tickEvents).toHaveLength(1);
      expect(tickEvents[0].remainingTicks).toBe(9); // 10 + 10 - 11 = 9
    });

    it('emits reflex_exit after OVERRIDE_DURATION_TICKS', () => {
      const events: ReflexEvent[] = [];
      arbitrator.onEvent((e) => events.push(e));

      arbitrator.enterReflexMode('critical_threat', 10);

      // Tick until override expires (OVERRIDE_DURATION_TICKS = 10)
      for (let t = 11; t <= 20; t++) {
        arbitrator.tickUpdate(t);
      }

      const exitEvents = events.filter((e) => e.type === 'reflex_exit');
      expect(exitEvents).toHaveLength(1);
      expect(exitEvents[0].remainingTicks).toBe(0);
    });

    it('unblocks planner after override expires', () => {
      arbitrator.enterReflexMode('critical_threat', 10);

      // Tick past override duration
      for (let t = 11; t <= 21; t++) {
        arbitrator.tickUpdate(t);
      }

      expect(arbitrator.isPlannerBlocked()).toBe(false);
      expect(arbitrator.isReflexActive(21)).toBe(false);
    });

    it('does nothing when no reflex is active', () => {
      const events: ReflexEvent[] = [];
      arbitrator.onEvent((e) => events.push(e));

      arbitrator.tickUpdate(5);

      expect(events).toHaveLength(0);
    });
  });

  describe('isPlannerBlocked', () => {
    it('returns false when no reflex active', () => {
      expect(arbitrator.isPlannerBlocked()).toBe(false);
    });

    it('returns true during active reflex', () => {
      arbitrator.enterReflexMode('threat', 10);
      expect(arbitrator.isPlannerBlocked()).toBe(true);
      expect(arbitrator.isPlannerBlocked(10)).toBe(true);
    });

    it('returns false when passed tick beyond override end', () => {
      arbitrator.enterReflexMode('threat', 10);
      expect(arbitrator.isPlannerBlocked(25)).toBe(false); // 10 + 10 = 20
    });
  });

  describe('event handlers', () => {
    it('supports multiple handlers', () => {
      const events1: ReflexEvent[] = [];
      const events2: ReflexEvent[] = [];

      arbitrator.onEvent((e) => events1.push(e));
      arbitrator.onEvent((e) => events2.push(e));

      arbitrator.enterReflexMode('threat', 5);

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });

    it('supports removing handlers', () => {
      const events: ReflexEvent[] = [];
      const handler = (e: ReflexEvent) => events.push(e);

      arbitrator.onEvent(handler);
      arbitrator.offEvent(handler);
      arbitrator.enterReflexMode('threat', 5);

      expect(events).toHaveLength(0);
    });

    it('handles handler errors gracefully', () => {
      const errorHandler = () => {
        throw new Error('handler error');
      };
      const events: ReflexEvent[] = [];

      arbitrator.onEvent(errorHandler);
      arbitrator.onEvent((e) => events.push(e));

      // Should not throw
      arbitrator.enterReflexMode('threat', 5);

      // Second handler still receives event
      expect(events).toHaveLength(1);
    });
  });

  describe('proportional severity duration', () => {
    it('critical severity lasts 15 ticks', () => {
      arbitrator.enterReflexMode('threat', 10, 'critical');
      // Active at tick 24 (10 + 15 - 1)
      expect(arbitrator.isReflexActive(24)).toBe(true);
      // Expired at tick 25
      expect(arbitrator.isReflexActive(25)).toBe(false);
    });

    it('high severity lasts 10 ticks', () => {
      arbitrator.enterReflexMode('threat', 10, 'high');
      expect(arbitrator.isReflexActive(19)).toBe(true);
      expect(arbitrator.isReflexActive(20)).toBe(false);
    });

    it('default (no arg) lasts 10 ticks — backward compatible', () => {
      arbitrator.enterReflexMode('threat', 10);
      expect(arbitrator.isReflexActive(19)).toBe(true);
      expect(arbitrator.isReflexActive(20)).toBe(false);
    });

    it('emits correct remainingTicks for critical severity', () => {
      const events: ReflexEvent[] = [];
      arbitrator.onEvent((e) => events.push(e));

      arbitrator.enterReflexMode('creeper_close', 10, 'critical');
      const enterEvent = events.find((e) => e.type === 'reflex_enter')!;
      expect(enterEvent.remainingTicks).toBe(15);
    });
  });

  describe('exitReflexModeEarly', () => {
    it('cancels active override and emits reflex_exit', () => {
      const events: ReflexEvent[] = [];
      arbitrator.onEvent((e) => events.push(e));

      arbitrator.enterReflexMode('threat', 10);
      expect(arbitrator.isReflexActive(12)).toBe(true);

      arbitrator.exitReflexModeEarly(12);
      expect(arbitrator.isReflexActive(12)).toBe(false);
      expect(arbitrator.isPlannerBlocked()).toBe(false);

      const exitEvents = events.filter((e) => e.type === 'reflex_exit');
      expect(exitEvents).toHaveLength(1);
      expect(exitEvents[0].tick).toBe(12);
      expect(exitEvents[0].remainingTicks).toBe(0);
    });

    it('is no-op when not active', () => {
      const events: ReflexEvent[] = [];
      arbitrator.onEvent((e) => events.push(e));

      arbitrator.exitReflexModeEarly(5);
      expect(events).toHaveLength(0);
    });

    it('is no-op when override already expired', () => {
      const events: ReflexEvent[] = [];
      arbitrator.onEvent((e) => events.push(e));

      arbitrator.enterReflexMode('threat', 10);
      // Tick past expiry
      for (let t = 11; t <= 20; t++) {
        arbitrator.tickUpdate(t);
      }

      const eventCount = events.length;
      arbitrator.exitReflexModeEarly(25);
      // No additional events emitted
      expect(events.length).toBe(eventCount);
    });
  });
});
