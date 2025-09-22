/**
 * Arbiter integration tests
 *
 * @author @darianrosebrook
 */

import { Arbiter } from '../arbiter';
import { Signal, CognitiveTask } from '../types';
import {
  NeedType,
  TrendDirection,
  TimeOfDay,
  LocationType,
  SocialContext,
} from '../advanced-need-generator';

describe('Arbiter Integration Tests', () => {
  let arbiter: Arbiter;

  beforeEach(() => {
    arbiter = new Arbiter({ config: { debugMode: false } });
  });

  afterEach(() => {
    arbiter.stop();
    jest.restoreAllMocks();
  });

  test('should initialize with default configuration', () => {
    expect(arbiter).toBeDefined();
    const status = arbiter.getStatus();
    expect(status.running).toBe(false);
    expect(status.registeredModules).toContain('reflex');
  });

  test('should process signals without errors', () => {
    const signal: Signal = {
      type: 'health',
      intensity: 0.3,
      urgency: 0.3,
      trend: -0.1,
      confidence: 0.9,
      timestamp: Date.now(),
      source: 'health-monitor',
    };

    expect(() => {
      arbiter.processSignal(signal);
    }).not.toThrow();
  });

  test('should start and stop cleanly', () => {
    arbiter.start();
    expect(arbiter.getStatus().running).toBe(true);

    arbiter.stop();
    expect(arbiter.getStatus().running).toBe(false);
  });

  test('should process cognitive tasks', async () => {
    const task: CognitiveTask = {
      id: 'test-task',
      type: 'reactive',
      priority: 0.8,
      complexity: 'simple',
      context: { test: true },
    };

    const result = await arbiter.processCognitiveTask(task);
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(result).toContain('reflex_response');
  });

  test('should emit events for signal processing', (done) => {
    arbiter.on('signal-received', (signal) => {
      expect(signal.type).toBe('threat');
      done();
    });

    const signal: Signal = {
      type: 'threat',
      intensity: 0.7,
      urgency: 0.7,
      trend: 0.1,
      confidence: 0.8,
      timestamp: Date.now(),
      source: 'threat-detector',
    };

    arbiter.processSignal(signal);
  });

  test('should track performance metrics', async () => {
    const task: CognitiveTask = {
      id: 'perf-test',
      type: 'reasoning',
      priority: 0.5,
      complexity: 'moderate',
      context: {},
    };

    await arbiter.processCognitiveTask(task);

    const metrics = arbiter.getPerformanceMonitor().getCurrentMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.latency).toBeDefined();
    expect(metrics.quality.successRate).toBeGreaterThan(0);
  });

  test('integrates enhanced needs into decision routing', async () => {
    const arbiterAny = arbiter as any;
    const now = Date.now();

    jest
      .spyOn(arbiterAny.advancedNeedGenerator, 'generateEnhancedNeeds')
      .mockResolvedValue([
        {
          id: 'need-1',
          type: NeedType.SOCIAL,
          intensity: 0.8,
          urgency: 0.9,
          trend: TrendDirection.INCREASING,
          trendStrength: 0.6,
          context: {
            timeOfDay: TimeOfDay.MORNING,
            location: LocationType.VILLAGE,
            socialContext: SocialContext.WITH_PLAYERS,
            environmentalFactors: [],
            recentEvents: [],
            currentGoals: [],
            availableResources: [],
          },
          memoryInfluence: 0.5,
          noveltyScore: 0.4,
          commitmentBoost: 0.3,
          timestamp: now,
          history: [],
          priorityScore: 0.82,
          opportunityCost: 0.2,
          feasibilityScore: 0.7,
          socialImpact: 0.6,
          learningValue: 0.3,
        },
      ]);

    jest.spyOn(arbiterAny.priorityRanker, 'rankTasks').mockResolvedValue({
      id: 'ranking-1',
      timestamp: now,
      tasks: [
        {
          id: 'task-1',
          name: 'social_need',
          description: 'Address social need',
          type: 'social',
          basePriority: 0.82,
          urgency: 0.9,
          importance: 0.8,
          complexity: 0.4,
          estimatedDuration: 30,
          dependencies: [],
          resources: [],
          context: {
            environment: 'village',
            socialContext: 'with_players',
            currentGoals: [],
            recentEvents: [],
            availableResources: [],
            constraints: [],
            opportunities: [],
            timeOfDay: 'morning',
            energyLevel: 0.8,
            stressLevel: 0.3,
          },
          metadata: {
            category: 'need_satisfaction',
            tags: ['social', 'enhanced_need'],
            difficulty: 0.4,
            skillRequirements: [],
            emotionalImpact: 0.2,
            satisfaction: 0.8,
            novelty: 0.3,
            socialValue: 0.6,
          },
          createdAt: now,
          lastUpdated: now,
          calculatedPriority: 0.85,
          rankingReason: 'signal_integration',
        },
      ],
      rankingMethod: 'weighted_sum',
      confidence: 0.9,
      factors: [],
      metadata: {
        totalTasks: 1,
        averagePriority: 0.85,
        priorityDistribution: { high: 1, medium: 0, low: 0, distribution: [0.85] },
        topFactors: [],
        rankingQuality: 0.9,
      },
    });

    const processSpy = jest
      .spyOn(arbiter, 'processCognitiveTask')
      .mockResolvedValue('ok');

    const signal: Signal = {
      type: 'social',
      intensity: 0.9,
      urgency: 0.9,
      trend: 0.2,
      confidence: 0.8,
      timestamp: now,
      source: 'test-signal',
    };

    await arbiter.processSignal(signal);
    await new Promise((resolve) => setImmediate(resolve));

    expect(processSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          source: 'signal',
          needType: 'social_need',
        }),
      })
    );
    expect(arbiter.getStatus().enhancedNeedTasksRouted).toBeGreaterThanOrEqual(1);
  });

  test('ignores low-priority enhanced needs', async () => {
    const arbiterAny = arbiter as any;

    jest
      .spyOn(arbiterAny.advancedNeedGenerator, 'generateEnhancedNeeds')
      .mockResolvedValue([
        {
          id: 'need-low',
          type: NeedType.AUTONOMY,
          intensity: 0.2,
          urgency: 0.2,
          trend: TrendDirection.STABLE,
          trendStrength: 0.2,
          context: {
            timeOfDay: TimeOfDay.NIGHT,
            location: LocationType.UNKNOWN,
            socialContext: SocialContext.ALONE,
            environmentalFactors: [],
            recentEvents: [],
            currentGoals: [],
            availableResources: [],
          },
          memoryInfluence: 0.1,
          noveltyScore: 0.1,
          commitmentBoost: 0.1,
          timestamp: Date.now(),
          history: [],
          priorityScore: 0.2,
          opportunityCost: 0.1,
          feasibilityScore: 0.2,
          socialImpact: 0.1,
          learningValue: 0.1,
        },
      ]);

    const rankSpy = jest.spyOn(arbiterAny.priorityRanker, 'rankTasks');
    const processSpy = jest
      .spyOn(arbiter, 'processCognitiveTask')
      .mockResolvedValue('ok');

    const signal: Signal = {
      type: 'memory',
      intensity: 0.2,
      urgency: 0.2,
      trend: 0,
      confidence: 0.6,
      timestamp: Date.now(),
      source: 'test-signal',
    };

    await arbiter.processSignal(signal);

    expect(rankSpy).not.toHaveBeenCalled();
    expect(processSpy).not.toHaveBeenCalled();
    expect(arbiter.getStatus().enhancedNeedTasksRouted).toBe(0);
  });

  test('should handle multiple concurrent signals', () => {
    const signals: Signal[] = [
      {
        type: 'health',
        intensity: 0.5,
        urgency: 0.5,
        trend: 0,
        confidence: 0.9,
        timestamp: Date.now(),
        source: 'health-1',
      },
      {
        type: 'hunger',
        intensity: 0.6,
        urgency: 0.6,
        trend: 0.1,
        confidence: 0.8,
        timestamp: Date.now(),
        source: 'hunger-1',
      },
      {
        type: 'social',
        intensity: 0.3,
        urgency: 0.3,
        trend: -0.1,
        confidence: 0.7,
        timestamp: Date.now(),
        source: 'social-1',
      },
    ];

    expect(() => {
      signals.forEach((signal) => arbiter.processSignal(signal));
    }).not.toThrow();

    const needs = arbiter.getSignalProcessor().getCurrentNeeds();
    expect(needs).toBeDefined();
  });
});
