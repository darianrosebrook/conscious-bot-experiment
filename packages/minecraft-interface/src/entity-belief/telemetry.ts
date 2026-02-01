/**
 * Entity Belief Telemetry
 *
 * Counters and signals for observability. Telemetry-only — no learning
 * updates or feedback loops.
 */

import type { ThreatLevel } from './types';

export interface BeliefTelemetryCounters {
  tracksActive: number;
  tracksNew: number;
  tracksLost: number;
  deltasEmitted: number;
  envelopesSent: number;
  reflexFired: number;
}

export interface PreventabilitySignal {
  deathTick: number;
  trackExisted: boolean;
  trackConfidence: number;
  hazardWarningActive: boolean;
  losAtDeath: 'visible' | 'inferred' | 'lost' | 'none';
  ticksSinceLastSeen: number;
  nearestThreatKind: string | null;
  nearestThreatLevel: ThreatLevel | null;
  nearestDistBucket: number | null;
}

export class BeliefTelemetry {
  private counters: BeliefTelemetryCounters = {
    tracksActive: 0,
    tracksNew: 0,
    tracksLost: 0,
    deltasEmitted: 0,
    envelopesSent: 0,
    reflexFired: 0,
  };

  /** Increment a counter by name */
  increment(key: keyof BeliefTelemetryCounters, amount = 1): void {
    this.counters[key] += amount;
  }

  /** Set a gauge value (e.g., tracksActive) */
  set(key: keyof BeliefTelemetryCounters, value: number): void {
    this.counters[key] = value;
  }

  /** Get current counters snapshot */
  getCounters(): BeliefTelemetryCounters {
    return { ...this.counters };
  }

  /** Reset all counters */
  reset(): void {
    this.counters = {
      tracksActive: 0,
      tracksNew: 0,
      tracksLost: 0,
      deltasEmitted: 0,
      envelopesSent: 0,
      reflexFired: 0,
    };
  }

  /**
   * Log a preventability signal on bot death.
   * Telemetry only — no learning updates.
   */
  logPreventabilitySignal(signal: PreventabilitySignal): void {
    console.log(
      '[BeliefTelemetry] PreventabilitySignal:',
      JSON.stringify(signal)
    );
  }
}
