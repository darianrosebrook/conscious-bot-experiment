/**
 * Arbiter integration tests
 *
 * @author @darianrosebrook
 */

import { Arbiter } from '../arbiter';
import { Signal, CognitiveTask } from '../types';

describe('Arbiter Integration Tests', () => {
  let arbiter: Arbiter;

  beforeEach(() => {
    arbiter = new Arbiter({ config: { debugMode: false } });
  });

  afterEach(() => {
    arbiter.stop();
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
