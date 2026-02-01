import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BeliefTelemetry, type PreventabilitySignal } from '../telemetry';

describe('BeliefTelemetry', () => {
  let telemetry: BeliefTelemetry;

  beforeEach(() => {
    telemetry = new BeliefTelemetry();
  });

  describe('counters', () => {
    it('starts with all counters at zero', () => {
      const counters = telemetry.getCounters();
      expect(counters.tracksActive).toBe(0);
      expect(counters.tracksNew).toBe(0);
      expect(counters.tracksLost).toBe(0);
      expect(counters.deltasEmitted).toBe(0);
      expect(counters.envelopesSent).toBe(0);
      expect(counters.reflexFired).toBe(0);
    });

    it('increments counters', () => {
      telemetry.increment('tracksNew');
      telemetry.increment('tracksNew');
      telemetry.increment('deltasEmitted', 5);

      const counters = telemetry.getCounters();
      expect(counters.tracksNew).toBe(2);
      expect(counters.deltasEmitted).toBe(5);
    });

    it('sets gauge values', () => {
      telemetry.set('tracksActive', 10);
      expect(telemetry.getCounters().tracksActive).toBe(10);

      telemetry.set('tracksActive', 5);
      expect(telemetry.getCounters().tracksActive).toBe(5);
    });

    it('returns a snapshot copy (not a reference)', () => {
      telemetry.increment('reflexFired');
      const snap1 = telemetry.getCounters();
      telemetry.increment('reflexFired');
      const snap2 = telemetry.getCounters();

      expect(snap1.reflexFired).toBe(1);
      expect(snap2.reflexFired).toBe(2);
    });

    it('resets all counters to zero', () => {
      telemetry.increment('tracksNew', 10);
      telemetry.increment('envelopesSent', 5);
      telemetry.reset();

      const counters = telemetry.getCounters();
      expect(counters.tracksNew).toBe(0);
      expect(counters.envelopesSent).toBe(0);
    });
  });

  describe('preventability signal', () => {
    it('logs a preventability signal on bot death (no learning)', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const signal: PreventabilitySignal = {
        deathTick: 100,
        trackExisted: true,
        trackConfidence: 0.9,
        hazardWarningActive: true,
        losAtDeath: 'visible',
        ticksSinceLastSeen: 0,
        nearestThreatKind: 'creeper',
        nearestThreatLevel: 'critical',
        nearestDistBucket: 1,
      };

      telemetry.logPreventabilitySignal(signal);

      expect(consoleSpy).toHaveBeenCalledOnce();
      const logCall = consoleSpy.mock.calls[0][1] as string;
      const parsed = JSON.parse(logCall);
      expect(parsed.deathTick).toBe(100);
      expect(parsed.trackExisted).toBe(true);
      expect(parsed.nearestThreatKind).toBe('creeper');

      consoleSpy.mockRestore();
    });

    it('handles signals where no threat track existed', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const signal: PreventabilitySignal = {
        deathTick: 50,
        trackExisted: false,
        trackConfidence: 0,
        hazardWarningActive: false,
        losAtDeath: 'none',
        ticksSinceLastSeen: -1,
        nearestThreatKind: null,
        nearestThreatLevel: null,
        nearestDistBucket: null,
      };

      telemetry.logPreventabilitySignal(signal);

      expect(consoleSpy).toHaveBeenCalledOnce();
      consoleSpy.mockRestore();
    });
  });
});
