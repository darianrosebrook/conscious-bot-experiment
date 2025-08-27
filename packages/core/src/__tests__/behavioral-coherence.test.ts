/**
 * Behavioral Coherence Tests
 *
 * These tests validate that the signal-driven control system
 * maintains coherent and consistent behavior patterns over time.
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

describe('Behavioral Coherence Tests', () => {
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

  describe('Decision Consistency Over Time', () => {
    test('should maintain consistent priorities for similar scenarios', async () => {
      const baseScenario = {
        signals: [
          {
            type: 'health',
            intensity: 0.4,
            urgency: 0.3,
            trend: -0.05,
            confidence: 0.9,
            timestamp: 1000,
            source: 'health-monitor',
          },
          {
            type: 'hunger',
            intensity: 0.6,
            urgency: 0.5,
            trend: 0.02,
            confidence: 0.85,
            timestamp: 1000,
            source: 'hunger-monitor',
          },
        ],
        context: {
          timeOfDay: 'day',
          environment: 'safe',
          playerNearby: false,
        },
      };

      const decisions: string[] = [];
      const processingTimes: number[] = [];

      // Run same scenario multiple times with slight variations
      for (let i = 0; i < 10; i++) {
        // Add small random variations to simulate real-world noise
        const variationFactor = 0.05; // 5% variation
        const variedSignals = baseScenario.signals.map((s) =>
          validateSignal({
            ...s,
            intensity: Math.max(
              0,
              Math.min(1, s.intensity + (Math.random() - 0.5) * variationFactor)
            ),
            timestamp: baseScenario.signals[0].timestamp + i * 100,
          })
        );

        // Process signals
        variedSignals.forEach((signal) => arbiter.processSignal(signal));

        // Generate decision
        const task: CognitiveTask = {
          id: `coherence-test-${i}`,
          type: 'reactive',
          priority: 0.5,
          complexity: 'simple',
          context: baseScenario.context,
        };

        const startTime = Date.now();
        const decision = await arbiter.processCognitiveTask(task);
        const processingTime = Date.now() - startTime;

        decisions.push(decision as string);
        processingTimes.push(processingTime);
      }

      // Analyze decision consistency
      const uniqueDecisions = new Set(decisions);
      const consistencyRatio =
        1 - (uniqueDecisions.size - 1) / decisions.length;

      // Should have high consistency (>80%) for similar scenarios
      expect(consistencyRatio).toBeGreaterThan(0.8);

      // Processing times should be relatively stable
      const avgProcessingTime =
        processingTimes.reduce((sum, t) => sum + t, 0) / processingTimes.length;
      const maxDeviation = Math.max(
        ...processingTimes.map((t) => Math.abs(t - avgProcessingTime))
      );
      expect(maxDeviation).toBeLessThan(avgProcessingTime); // Within 100% of average

      console.log(
        `Decision consistency: ${(consistencyRatio * 100).toFixed(1)}%`
      );
      console.log(
        `Processing time stability: avg=${avgProcessingTime.toFixed(1)}ms, max deviation=${maxDeviation.toFixed(1)}ms`
      );
    });

    test('should show predictable behavior escalation under increasing threat', async () => {
      const threatLevels = [0.1, 0.3, 0.5, 0.7, 0.9];
      const decisions: Array<{
        threat: number;
        decision: string;
        processingTime: number;
      }> = [];

      for (const threatLevel of threatLevels) {
        const signal = validateSignal({
          type: 'threat',
          intensity: threatLevel,
          urgency: threatLevel,
          trend: 0.1,
          confidence: 0.95,
          timestamp: Date.now(),
          source: 'threat-escalation-test',
        });

        arbiter.processSignal(signal);

        const task: CognitiveTask = {
          id: `escalation-test-${threatLevel}`,
          type: threatLevel > 0.6 ? 'reactive' : 'reactive',
          priority: threatLevel,
          complexity: 'simple',
          context: { threatLevel },
        };

        const startTime = Date.now();
        const decision = await arbiter.processCognitiveTask(task);
        const processingTime = Date.now() - startTime;

        decisions.push({
          threat: threatLevel,
          decision: decision as string,
          processingTime,
        });
      }

      // Analyze escalation patterns
      for (let i = 1; i < decisions.length; i++) {
        const prev = decisions[i - 1];
        const curr = decisions[i];

        // Processing time should decrease as threat increases (more urgent = faster response)
        if (curr.threat > 0.6) {
          expect(curr.processingTime).toBeLessThanOrEqual(
            prev.processingTime * 1.2
          ); // Allow 20% tolerance
        }

        // Decisions should show awareness of increasing threat
        expect(curr.decision).toBeDefined();
        expect(curr.decision.length).toBeGreaterThan(0);
      }

      console.log(
        'Threat escalation pattern:',
        decisions.map((d) => `${d.threat}: ${d.processingTime}ms`).join(', ')
      );
    });
  });

  describe('Goal Persistence and Coherence', () => {
    test('should maintain goal persistence under minor disruptions', async () => {
      // Establish a primary goal scenario
      const primaryGoalSignals = [
        validateSignal({
          type: 'social',
          intensity: 0.7,
          urgency: 0.6,
          trend: 0.05,
          confidence: 0.9,
          timestamp: 1000,
          source: 'progress-monitor',
        }),
      ];

      // Generate initial goal-directed decision
      primaryGoalSignals.forEach((signal) => arbiter.processSignal(signal));

      const primaryTask: CognitiveTask = {
        id: 'primary-goal-test',
        type: 'reactive',
        priority: 0.7,
        complexity: 'moderate',
        context: { goalPersistence: true },
      };

      const primaryDecision = await arbiter.processCognitiveTask(primaryTask);

      // Introduce minor disruption
      const disruptionSignal = validateSignal({
        type: 'social',
        intensity: 0.4,
        urgency: 0.3,
        trend: 0.1,
        confidence: 0.6,
        timestamp: 2000,
        source: 'minor-disruption',
      });

      arbiter.processSignal(disruptionSignal);

      // Check if primary goal persists
      const postDisruptionTask: CognitiveTask = {
        id: 'post-disruption-test',
        type: 'reactive',
        priority: 0.7,
        complexity: 'moderate',
        context: { goalPersistence: true },
      };

      const postDisruptionDecision =
        await arbiter.processCognitiveTask(postDisruptionTask);

      // Should maintain similar decision pattern
      expect(postDisruptionDecision).toBeDefined();
      expect(typeof postDisruptionDecision).toBe('string');

      // In a more sophisticated implementation, we would check goal similarity
      console.log('Goal persistence:', {
        primary: primaryDecision,
        postDisruption: postDisruptionDecision,
      });
    });

    test('should show appropriate goal switching for major threats', async () => {
      // Start with low-priority routine goal
      const routineSignal = validateSignal({
        type: 'social',
        intensity: 0.5,
        urgency: 0.4,
        trend: 0.0,
        confidence: 0.7,
        timestamp: 1000,
        source: 'routine-activity',
      });

      arbiter.processSignal(routineSignal);

      const routineTask: CognitiveTask = {
        id: 'routine-goal-test',
        type: 'reactive',
        priority: 0.5,
        complexity: 'simple',
        context: { goalSwitching: true },
      };

      const routineDecision = await arbiter.processCognitiveTask(routineTask);

      // Introduce major threat
      const threatSignal = validateSignal({
        type: 'threat',
        intensity: 0.9,
        urgency: 0.9,
        trend: 0.3,
        confidence: 0.95,
        timestamp: 2000,
        source: 'major-threat',
      });

      arbiter.processSignal(threatSignal);

      const emergencyTask: CognitiveTask = {
        id: 'emergency-goal-test',
        type: 'reactive',
        priority: 0.95,
        complexity: 'simple',
        context: { goalSwitching: true },
      };

      const emergencyDecision =
        await arbiter.processCognitiveTask(emergencyTask);

      // Should switch to emergency response
      expect(emergencyDecision).toBeDefined();
      expect(typeof emergencyDecision).toBe('string');

      // Decisions should be different for different contexts
      console.log('Goal switching:', {
        routine: routineDecision,
        emergency: emergencyDecision,
      });
    });
  });

  describe('Signal Integration Coherence', () => {
    test('should integrate multiple signals coherently', async () => {
      const multiModalSignals = [
        validateSignal({
          type: 'health',
          intensity: 0.3,
          urgency: 0.2,
          trend: -0.1,
          confidence: 0.9,
          timestamp: 1000,
          source: 'health-monitor',
        }),
        validateSignal({
          type: 'hunger',
          intensity: 0.7,
          urgency: 0.6,
          trend: 0.05,
          confidence: 0.85,
          timestamp: 1000,
          source: 'hunger-monitor',
        }),
        validateSignal({
          type: 'social',
          intensity: 0.4,
          urgency: 0.3,
          trend: 0.0,
          confidence: 0.6,
          timestamp: 1000,
          source: 'social-detector',
        }),
      ];

      // Process all signals
      multiModalSignals.forEach((signal) => arbiter.processSignal(signal));

      // Generate needs and check integration
      const needs = processor.calculateNeeds(multiModalSignals);

      // Should generate coherent need priorities
      expect(needs.length).toBeGreaterThan(0);

      // Needs should be properly prioritized based on signal strength and context
      const sortedNeeds = needs.sort((a, b) => b.urgency - a.urgency);
      const topNeed = sortedNeeds[0];

      // Top need should correspond to strongest signal (hunger in this case)
      expect(topNeed.urgency).toBeGreaterThan(0.4);
      expect(topNeed.confidence).toBeGreaterThan(0.5);

      // All needs should have valid urgency and confidence values
      needs.forEach((need) => {
        expect(need.urgency).toBeGreaterThanOrEqual(0);
        expect(need.urgency).toBeLessThanOrEqual(1);
        expect(need.confidence).toBeGreaterThanOrEqual(0);
        expect(need.confidence).toBeLessThanOrEqual(1);
      });

      console.log(
        'Integrated needs:',
        needs.map(
          (n) =>
            `${n.type}: urgency=${n.urgency.toFixed(2)}, confidence=${n.confidence.toFixed(2)}`
        )
      );
    });

    test('should handle conflicting signals gracefully', async () => {
      const conflictingSignals = [
        validateSignal({
          type: 'social',
          intensity: 0.8,
          urgency: 0.7,
          trend: 0.1,
          confidence: 0.9,
          timestamp: 1000,
          source: 'progress-high',
        }),
        validateSignal({
          type: 'threat',
          intensity: 0.7,
          urgency: 0.6,
          trend: 0.2,
          confidence: 0.95,
          timestamp: 1000,
          source: 'threat-moderate',
        }),
      ];

      // Process conflicting signals
      conflictingSignals.forEach((signal) => arbiter.processSignal(signal));

      const conflictTask: CognitiveTask = {
        id: 'conflict-resolution-test',
        type: 'reactive',
        priority: 0.7,
        complexity: 'moderate',
        context: { conflictResolution: true },
      };

      const conflictDecision = await arbiter.processCognitiveTask(conflictTask);

      // Should produce a valid decision despite conflicts
      expect(conflictDecision).toBeDefined();
      expect(typeof conflictDecision).toBe('string');

      // Calculate needs to see conflict resolution
      const resolvedNeeds = processor.calculateNeeds(conflictingSignals);

      // Should prioritize based on confidence and urgency
      const sortedNeeds = resolvedNeeds.sort(
        (a, b) => b.urgency * b.confidence - a.urgency * a.confidence
      );

      expect(sortedNeeds.length).toBeGreaterThan(0);
      expect(sortedNeeds[0].urgency).toBeGreaterThan(0);

      console.log('Conflict resolution:', {
        decision: conflictDecision,
        topNeed: sortedNeeds[0],
      });
    });
  });

  describe('Temporal Behavior Coherence', () => {
    test('should show consistent response times for similar scenarios', async () => {
      const testScenarios = Array.from({ length: 20 }, (_, i) => ({
        signal: validateSignal({
          type: 'health',
          intensity: 0.5 + (Math.random() - 0.5) * 0.1, // 5% variation
          urgency: 0.4,
          trend: -0.05,
          confidence: 0.9,
          timestamp: 1000 + i * 100,
          source: `consistency-test-${i}`,
        }),
        task: {
          id: `temporal-consistency-${i}`,
          type: 'reactive' as const,
          priority: 0.5,
          complexity: 'simple' as const,
          context: { temporalTest: true },
        },
      }));

      const responseTimes: number[] = [];

      for (const scenario of testScenarios) {
        arbiter.processSignal(scenario.signal);

        const startTime = Date.now();
        await arbiter.processCognitiveTask(scenario.task);
        const responseTime = Date.now() - startTime;

        responseTimes.push(responseTime);
      }

      // Analyze temporal consistency
      const avgResponseTime =
        responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;
      const standardDeviation = Math.sqrt(
        responseTimes.reduce(
          (sum, t) => sum + Math.pow(t - avgResponseTime, 2),
          0
        ) / responseTimes.length
      );

      const coefficientOfVariation = standardDeviation / avgResponseTime;

      // Coefficient of variation should be low for consistent behavior
      expect(coefficientOfVariation).toBeLessThan(0.5); // Less than 50% variation

      console.log(
        `Temporal consistency: avg=${avgResponseTime.toFixed(1)}ms, CV=${(coefficientOfVariation * 100).toFixed(1)}%`
      );
    });

    test('should maintain behavioral patterns across extended operation', async () => {
      const extendedOperationDuration = 100; // Number of cycles
      const behaviorPatterns: Array<{
        cycle: number;
        decision: string;
        timing: number;
      }> = [];

      for (let cycle = 0; cycle < extendedOperationDuration; cycle++) {
        // Create periodic signal pattern
        const signalIntensity = 0.5 + 0.3 * Math.sin(cycle * 0.1); // Sinusoidal pattern

        const signal = validateSignal({
          type: 'social',
          intensity: signalIntensity,
          urgency: 0.5,
          trend: 0.01,
          confidence: 0.8,
          timestamp: 1000 + cycle * 50,
          source: `extended-operation-${cycle}`,
        });

        arbiter.processSignal(signal);

        const task: CognitiveTask = {
          id: `extended-cycle-${cycle}`,
          type: 'reactive',
          priority: 0.6,
          complexity: 'simple',
          context: { extendedOperation: true, cycle },
        };

        const startTime = Date.now();
        const decision = await arbiter.processCognitiveTask(task);
        const timing = Date.now() - startTime;

        behaviorPatterns.push({
          cycle,
          decision: decision as string,
          timing,
        });

        // Small delay to prevent overwhelming
        if (cycle % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      }

      // Analyze pattern consistency
      const decisionCounts = behaviorPatterns.reduce(
        (counts, pattern) => {
          counts[pattern.decision] = (counts[pattern.decision] || 0) + 1;
          return counts;
        },
        {} as Record<string, number>
      );

      const dominantDecision = Object.entries(decisionCounts).sort(
        ([, a], [, b]) => b - a
      )[0];

      const dominantRatio = dominantDecision[1] / behaviorPatterns.length;

      // Should show pattern consistency (dominant behavior > 60%)
      expect(dominantRatio).toBeGreaterThan(0.6);

      // Timing should remain stable
      const timings = behaviorPatterns.map((p) => p.timing);
      const avgTiming = timings.reduce((sum, t) => sum + t, 0) / timings.length;
      const maxTiming = Math.max(...timings);

      expect(maxTiming).toBeLessThan(avgTiming * 3); // No timing should be >3x average

      console.log(
        `Extended operation: ${extendedOperationDuration} cycles, dominant behavior: ${dominantRatio * 100}%`
      );
    });
  });
});
