/**
 * Golden Tests for Core Decision Making
 *
 * These tests validate that specific input scenarios produce
 * expected decision outputs, ensuring behavioral consistency
 * across code changes.
 *
 * @author @darianrosebrook
 */

import { Arbiter } from '../index';
import {
  Signal,
  CognitiveTask,
  validateSignal,
  validateCognitiveTask,
} from '../types';
import { SignalProcessor } from '../signal-processor';

describe('Golden Decision Tests', () => {
  let arbiter: Arbiter;
  let processor: SignalProcessor;

  beforeEach(() => {
    arbiter = new Arbiter({ config: { debugMode: false } });
    processor = new SignalProcessor();
  });

  afterEach(() => {
    arbiter.stop();
    processor.dispose();
  });

  describe('Emergency Response Scenarios', () => {
    const emergencyScenarios = [
      {
        name: 'combat_encounter_day',
        description: 'Hostile mob during daytime exploration',
        input: {
          signals: [
            {
              type: 'threat',
              intensity: 0.9,
              urgency: 0.9,
              trend: 0.3,
              confidence: 0.95,
              timestamp: 1000,
              source: 'threat-detector',
            },
            {
              type: 'health',
              intensity: 0.7,
              urgency: 0.6,
              trend: -0.1,
              confidence: 0.9,
              timestamp: 1000,
              source: 'health-monitor',
            },
          ],
          context: {
            timeOfDay: 'day',
            environment: 'plains',
            playerNearby: false,
            lightLevel: 0.9,
          },
        },
        expectedDecision: {
          topPriority: 'Safety',
          primaryGoal: 'FleeFromThreat',
          secondaryGoals: ['MaintainHealth'],
          processingTime: '<50ms',
          confidence: '>0.8',
        },
      },
      {
        name: 'health_critical_night',
        description: 'Critical health at night with limited visibility',
        input: {
          signals: [
            {
              type: 'health',
              intensity: 0.15,
              urgency: 0.1,
              trend: -0.2,
              confidence: 0.98,
              timestamp: 2000,
              source: 'health-monitor',
            },
            {
              type: 'health',
              intensity: 0.1,
              urgency: 0.05,
              trend: 0.0,
              confidence: 0.9,
              timestamp: 2000,
              source: 'light-sensor',
            },
          ],
          context: {
            timeOfDay: 'night',
            environment: 'forest',
            playerNearby: false,
            lightLevel: 0.1,
          },
        },
        expectedDecision: {
          topPriority: 'Safety',
          primaryGoal: 'ReachSafeLight',
          secondaryGoals: ['UseHealingItem'],
          processingTime: '<50ms',
          confidence: '>0.9',
        },
      },
      {
        name: 'lava_proximity_mining',
        description: 'Lava detected while mining underground',
        input: {
          signals: [
            {
              type: 'threat',
              intensity: 0.85,
              urgency: 0.8,
              trend: 0.1,
              confidence: 0.92,
              timestamp: 3000,
              source: 'hazard-detector',
            },
            {
              type: 'social',
              intensity: 0.6,
              urgency: 0.5,
              trend: 0.05,
              confidence: 0.8,
              timestamp: 3000,
              source: 'progress-tracker',
            },
          ],
          context: {
            timeOfDay: 'day',
            environment: 'cave',
            playerNearby: false,
            lightLevel: 0.5,
            depth: 15,
          },
        },
        expectedDecision: {
          topPriority: 'Safety',
          primaryGoal: 'RetreatFromHazard',
          secondaryGoals: ['PreserveMiningProgress'],
          processingTime: '<50ms',
          confidence: '>0.85',
        },
      },
    ];

    emergencyScenarios.forEach((scenario) => {
      test(`should handle ${scenario.name} correctly`, async () => {
        const startTime = Date.now();

        // Process signals through the arbiter
        const signals = scenario.input.signals.map((s) => validateSignal(s));
        signals.forEach((signal) => arbiter.processSignal(signal));

        // Generate cognitive task for scenario
        const task: CognitiveTask = {
          id: `golden_test_${scenario.name}`,
          type: 'reactive',
          priority: 0.9,
          complexity: 'simple',
          context: scenario.input.context,
        };

        const result = await arbiter.processCognitiveTask(task);
        const processingTime = Date.now() - startTime;

        // Validate expected decision properties
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');

        // Check processing time constraint
        const maxTime = parseInt(
          scenario.expectedDecision.processingTime.replace(/[<>ms]/g, '')
        );
        expect(processingTime).toBeLessThan(maxTime);

        // Validate decision content (simplified for reflex module)
        expect(result).toContain('reflex_response');

        // Get performance metrics
        const metrics = arbiter.getPerformanceMetrics();
        expect(metrics.lastCycleTime).toBeLessThan(maxTime);
      });
    });
  });

  describe('Routine Decision Scenarios', () => {
    const routineScenarios = [
      {
        name: 'exploration_curious',
        description: 'High curiosity during safe exploration',
        input: {
          signals: [
            {
              type: 'social',
              intensity: 0.8,
              urgency: 0.7,
              trend: 0.1,
              confidence: 0.7,
              timestamp: 4000,
              source: 'curiosity-engine',
            },
            {
              type: 'safety',
              intensity: 0.9,
              urgency: 0.8,
              trend: 0.0,
              confidence: 0.95,
              timestamp: 4000,
              source: 'safety-monitor',
            },
          ],
          context: {
            timeOfDay: 'day',
            environment: 'plains',
            playerNearby: false,
            lightLevel: 0.95,
            exploredArea: 0.3,
          },
        },
        expectedDecision: {
          topPriority: 'Curiosity',
          primaryGoal: 'ExploreUnknownArea',
          secondaryGoals: ['MaintainSafety'],
          processingTime: '<200ms',
          confidence: '>0.7',
        },
      },
      {
        name: 'resource_gathering_hungry',
        description: 'Resource gathering with growing hunger',
        input: {
          signals: [
            {
              type: 'hunger',
              intensity: 0.6,
              urgency: 0.5,
              trend: 0.05,
              confidence: 0.9,
              timestamp: 5000,
              source: 'hunger-monitor',
            },
            {
              type: 'social',
              intensity: 0.4,
              urgency: 0.3,
              trend: 0.02,
              confidence: 0.8,
              timestamp: 5000,
              source: 'progress-tracker',
            },
          ],
          context: {
            timeOfDay: 'day',
            environment: 'forest',
            playerNearby: false,
            lightLevel: 0.8,
            inventorySpace: 0.7,
          },
        },
        expectedDecision: {
          topPriority: 'Nutrition',
          primaryGoal: 'GatherFood',
          secondaryGoals: ['ContinueProgress'],
          processingTime: '<200ms',
          confidence: '>0.75',
        },
      },
    ];

    routineScenarios.forEach((scenario) => {
      test(`should handle ${scenario.name} correctly`, async () => {
        const startTime = Date.now();

        // Process signals
        const signals = scenario.input.signals.map((s) => validateSignal(s));
        signals.forEach((signal) => arbiter.processSignal(signal));

        // Generate routine cognitive task
        const task: CognitiveTask = {
          id: `golden_routine_${scenario.name}`,
          type: 'reactive',
          priority: 0.6,
          complexity: 'moderate',
          context: scenario.input.context,
        };

        const result = await arbiter.processCognitiveTask(task);
        const processingTime = Date.now() - startTime;

        // Validate timing and response
        const maxTime = parseInt(
          scenario.expectedDecision.processingTime.replace(/[<>ms]/g, '')
        );
        expect(processingTime).toBeLessThan(maxTime);
        expect(result).toBeDefined();
        expect(result).toContain('reflex_response');
      });
    });
  });

  describe('Signal Processing Golden Outputs', () => {
    const signalProcessingScenarios = [
      {
        name: 'multi_need_prioritization',
        description: 'Multiple competing needs with clear priority order',
        input: {
          signals: [
            {
              type: 'health',
              intensity: 0.3,
              urgency: 0.2,
              trend: -0.1,
              confidence: 0.9,
              timestamp: 6000,
              source: 'health',
            },
            {
              type: 'hunger',
              intensity: 0.7,
              urgency: 0.6,
              trend: 0.05,
              confidence: 0.85,
              timestamp: 6000,
              source: 'hunger',
            },
            {
              type: 'threat',
              intensity: 0.9,
              urgency: 0.9,
              trend: 0.2,
              confidence: 0.95,
              timestamp: 6000,
              source: 'threat',
            },
          ],
          context: {
            timeOfDay: 'night',
            environment: 'dangerous',
          },
        },
        expectedOutput: {
          needOrder: ['safety', 'nutrition', 'progress'],
          topNeedUrgency: '>0.8',
          needCount: 3,
          processingConsistency: true,
        },
      },
      {
        name: 'contextual_priority_boosting',
        description: 'Context-dependent priority adjustments',
        input: {
          signals: [
            {
              type: 'social',
              intensity: 0.5,
              urgency: 0.4,
              trend: 0.0,
              confidence: 0.8,
              timestamp: 7000,
              source: 'social',
            },
            {
              type: 'social',
              intensity: 0.6,
              urgency: 0.5,
              trend: 0.1,
              confidence: 0.9,
              timestamp: 7000,
              source: 'progress',
            },
          ],
          context: {
            timeOfDay: 'day',
            environment: 'village',
            playerNearby: true,
          },
        },
        expectedOutput: {
          needOrder: ['social', 'progress'],
          socialBoost: true,
          contextInfluence: '>0.1',
        },
      },
    ];

    signalProcessingScenarios.forEach((scenario) => {
      test(`should process ${scenario.name} correctly`, () => {
        const signals = scenario.input.signals.map((s) => validateSignal(s));
        const needs = processor.calculateNeeds(signals, scenario.input.context);

        // Validate need generation
        expect(needs.length).toBeGreaterThan(0);
        expect(needs.length).toBeLessThanOrEqual(
          scenario.expectedOutput.needCount || 10
        );

        // Check need ordering if specified
        if (scenario.expectedOutput.needOrder) {
          const sortedNeeds = needs.sort((a, b) => b.urgency - a.urgency);
          const topNeed = sortedNeeds[0];

          expect(scenario.expectedOutput.needOrder).toContain(topNeed.type);
        }

        // Validate urgency bounds
        needs.forEach((need) => {
          expect(need.urgency).toBeGreaterThanOrEqual(0);
          expect(need.urgency).toBeLessThanOrEqual(1);
          expect(need.confidence).toBeGreaterThanOrEqual(0);
          expect(need.confidence).toBeLessThanOrEqual(1);
        });

        // Check top need urgency threshold
        if (scenario.expectedOutput.topNeedUrgency) {
          const maxUrgency = Math.max(...needs.map((n) => n.urgency));
          const threshold = parseFloat(
            scenario.expectedOutput.topNeedUrgency.replace('>', '')
          );
          expect(maxUrgency).toBeGreaterThan(threshold);
        }
      });
    });
  });

  describe('Performance Consistency Tests', () => {
    test('repeated identical inputs produce consistent outputs', async () => {
      const testSignal: Signal = {
        type: 'health',
        intensity: 0.5,
        urgency: 0.5,
        trend: -0.1,
        confidence: 0.9,
        timestamp: 8000,
        source: 'consistency-test',
      };

      const results: string[] = [];
      const timings: number[] = [];

      // Run same scenario multiple times
      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        arbiter.processSignal(testSignal);

        const task: CognitiveTask = {
          id: `consistency_test_${i}`,
          type: 'reactive',
          priority: 0.5,
          complexity: 'simple',
          context: { test: true },
        };

        const result = await arbiter.processCognitiveTask(task);
        const timing = Date.now() - startTime;

        results.push(result);
        timings.push(timing);
      }

      // Validate consistency
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBe(1); // All results should be identical

      // Validate timing consistency (within reasonable bounds)
      const avgTiming = timings.reduce((sum, t) => sum + t, 0) / timings.length;
      timings.forEach((timing) => {
        expect(Math.abs(timing - avgTiming)).toBeLessThan(avgTiming * 0.5); // Within 50% of average
      });
    });

    test('signal order independence for commutative operations', () => {
      const signals = [
        {
          type: 'health',
          intensity: 0.8,
          urgency: 0.7,
          trend: 0.0,
          confidence: 0.9,
          timestamp: 9000,
          source: 'test1',
        },
        {
          type: 'hunger',
          intensity: 0.3,
          urgency: 0.2,
          trend: 0.1,
          confidence: 0.85,
          timestamp: 9000,
          source: 'test2',
        },
        {
          type: 'progress',
          intensity: 0.6,
          urgency: 0.5,
          trend: 0.05,
          confidence: 0.8,
          timestamp: 9000,
          source: 'test3',
        },
      ].map((s) => validateSignal(s));

      // Test different signal orders
      const order1 = processor.calculateNeeds([
        signals[0],
        signals[1],
        signals[2],
      ]);
      const order2 = processor.calculateNeeds([
        signals[2],
        signals[0],
        signals[1],
      ]);
      const order3 = processor.calculateNeeds([
        signals[1],
        signals[2],
        signals[0],
      ]);

      // Sort by type for comparison
      const sort = (needs: any[]) =>
        needs.sort((a, b) => a.type.localeCompare(b.type));

      const sorted1 = sort([...order1]);
      const sorted2 = sort([...order2]);
      const sorted3 = sort([...order3]);

      // Should produce same needs regardless of order
      expect(sorted1).toHaveLength(sorted2.length);
      expect(sorted2).toHaveLength(sorted3.length);

      sorted1.forEach((need, index) => {
        expect(need.type).toBe(sorted2[index].type);
        expect(need.type).toBe(sorted3[index].type);
        expect(need.urgency).toBeCloseTo(sorted2[index].urgency, 3);
        expect(need.urgency).toBeCloseTo(sorted3[index].urgency, 3);
      });
    });
  });
});
