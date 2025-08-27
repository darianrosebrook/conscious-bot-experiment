/**
 * Simplified Property-Based Tests for Signal Processing Logic
 *
 * @author @darianrosebrook
 */

import * as fc from 'fast-check';
import { SignalProcessor } from '../signal-processor';
import { SignalSchema } from '../types';

describe('Signal Processing Properties (Simplified)', () => {
  let processor: SignalProcessor;

  beforeEach(() => {
    processor = new SignalProcessor();
  });

  afterEach(() => {
    processor.dispose();
  });

  describe('Signal Normalization Properties', () => {
    test('normalized signals maintain value bounds [0,1]', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constantFrom('health', 'hunger', 'threat'),
            intensity: fc.float({ min: 0, max: 1, noNaN: true }), // Keep valid initially
            trend: fc.float({ min: -1, max: 1, noNaN: true }),
            confidence: fc.float({ min: 0, max: 1, noNaN: true }),
            timestamp: fc.integer({ min: 0 }),
            source: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          (validSignal) => {
            // Create invalid signal to test normalization
            const invalidSignal = {
              ...validSignal,
              urgency: validSignal.urgency || 0.5, // Ensure urgency is present
              intensity: Math.random() * 20 - 10, // -10 to 10
              confidence: Math.random() * 3 - 1, // -1 to 2
            };

            const normalized = processor.normalizeSignal(invalidSignal);

            expect(normalized.intensity).toBeGreaterThanOrEqual(0);
            expect(normalized.intensity).toBeLessThanOrEqual(1);
            expect(normalized.confidence).toBeGreaterThanOrEqual(0);
            expect(normalized.confidence).toBeLessThanOrEqual(1);

            return true;
          }
        )
      );
    });

    test('signal normalization is deterministic', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constantFrom('health', 'hunger', 'threat'),
            intensity: fc.float({ min: 0, max: 1, noNaN: true }),
            urgency: fc.float({ min: 0, max: 1, noNaN: true }),
            trend: fc.float({ min: -0.5, max: 0.5, noNaN: true }),
            confidence: fc.float({ min: 0, max: 1, noNaN: true }),
            timestamp: fc.integer({ min: 0 }),
            source: fc.string({ minLength: 1 }),
          }),
          (validSignal) => {
            const normalized1 = processor.normalizeSignal(validSignal);
            const normalized2 = processor.normalizeSignal(validSignal);

            expect(normalized1.intensity).toBeCloseTo(normalized2.intensity, 5);
            expect(normalized1.confidence).toBeCloseTo(
              normalized2.confidence,
              5
            );

            return true;
          }
        )
      );
    });
  });

  describe('Need Calculation Properties', () => {
    test('needs calculation produces valid outputs', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              type: fc.constantFrom('health', 'hunger', 'threat'),
              intensity: fc.float({ min: 0, max: 1, noNaN: true }),
              urgency: fc.float({ min: 0, max: 1, noNaN: true }),
              trend: fc.float({ min: -0.5, max: 0.5, noNaN: true }),
              confidence: fc.float({ min: 0, max: 1, noNaN: true }),
              timestamp: fc.integer({ min: 0 }),
              source: fc.string({ minLength: 1 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (signalData) => {
            const needs = processor.calculateNeeds(signalData);

            expect(Array.isArray(needs)).toBe(true);

            needs.forEach((need) => {
              expect(need.urgency).toBeGreaterThanOrEqual(0);
              expect(need.urgency).toBeLessThanOrEqual(1);
              expect(need.confidence).toBeGreaterThanOrEqual(0);
              expect(need.confidence).toBeLessThanOrEqual(1);
            });

            return true;
          }
        )
      );
    });
  });

  describe('Signal Aggregation Properties', () => {
    test('aggregation preserves signal count or reduces it', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              type: fc.constantFrom('health', 'hunger'),
              intensity: fc.float({ min: 0, max: 1, noNaN: true }),
              urgency: fc.float({ min: 0, max: 1, noNaN: true }),
              trend: fc.float({ min: -0.5, max: 0.5, noNaN: true }),
              confidence: fc.float({ min: 0, max: 1, noNaN: true }),
              timestamp: fc.integer({ min: 0 }),
              source: fc.string({ minLength: 1 }),
            }),
            { minLength: 2, maxLength: 10 }
          ),
          (signalData) => {
            const aggregated = processor.aggregateSignals(signalData);

            expect(aggregated.length).toBeLessThanOrEqual(signalData.length);
            expect(aggregated.length).toBeGreaterThan(0);

            aggregated.forEach((aggSig) => {
              expect(aggSig.intensity).toBeGreaterThanOrEqual(0);
              expect(aggSig.intensity).toBeLessThanOrEqual(1);
              expect(aggSig.confidence).toBeGreaterThanOrEqual(0);
              expect(aggSig.confidence).toBeLessThanOrEqual(1);
            });

            return true;
          }
        )
      );
    });
  });
});
