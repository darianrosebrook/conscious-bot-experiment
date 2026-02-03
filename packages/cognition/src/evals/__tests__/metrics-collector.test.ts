/**
 * Tests for Metrics Collector
 *
 * Validates metric computation including compulsion/inertia detection.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { MetricsCollector, type ScenarioResult } from '../harness/metrics-collector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('record and computeMetrics', () => {
    it('should compute action_rate correctly', () => {
      collector.record(makeResult({ action_taken: true, affordance: 'allowed' }));
      collector.record(makeResult({ action_taken: false, affordance: 'allowed' }));
      collector.record(makeResult({ action_taken: true, affordance: 'allowed' }));

      const metrics = collector.computeMetrics();

      expect(metrics.action_rate).toBeCloseTo(2 / 3, 2);
      expect(metrics.total_scenarios).toBe(3);
      expect(metrics.successful_scenarios).toBe(3);
    });

    it('should count compulsion correctly (AC-EV-07)', () => {
      // Compulsion: action taken when affordance is 'discouraged'
      collector.record(makeResult({ action_taken: true, affordance: 'discouraged' }));
      collector.record(makeResult({ action_taken: true, affordance: 'discouraged' }));
      collector.record(makeResult({ action_taken: false, affordance: 'discouraged' }));

      const metrics = collector.computeMetrics();

      expect(metrics.compulsion_count).toBe(2);
    });

    it('should count inertia correctly (AC-EV-07)', () => {
      // Inertia: no action when affordance is 'expected'
      collector.record(makeResult({ action_taken: false, affordance: 'expected' }));
      collector.record(makeResult({ action_taken: true, affordance: 'expected' }));
      collector.record(makeResult({ action_taken: false, affordance: 'expected' }));

      const metrics = collector.computeMetrics();

      expect(metrics.inertia_count).toBe(2);
    });

    it('should track hallucinations', () => {
      collector.record(makeResult({ has_hallucination: true }));
      collector.record(makeResult({ has_hallucination: false }));
      collector.record(makeResult({ has_hallucination: true }));

      const metrics = collector.computeMetrics();

      expect(metrics.hallucination_count).toBe(2);
    });

    it('should compute grounding_pass_rate from goals only', () => {
      // Only goals extracted count toward grounding pass rate
      collector.record(makeResult({ action_taken: true, grounding_pass: true }));
      collector.record(makeResult({ action_taken: true, grounding_pass: false }));
      collector.record(makeResult({ action_taken: false, grounding_pass: null })); // No goal

      const metrics = collector.computeMetrics();

      expect(metrics.grounding_pass_rate).toBeCloseTo(0.5, 2);
    });

    it('should compute anchoring_ratio_mean', () => {
      collector.record(makeResult({ referenced_facts_count: 5, available_facts_count: 10 }));
      collector.record(makeResult({ referenced_facts_count: 2, available_facts_count: 10 }));

      const metrics = collector.computeMetrics();

      expect(metrics.anchoring_ratio_mean).toBeCloseTo(0.35, 2);
    });

    it('should compute latency percentiles', () => {
      collector.record(makeResult({ latency_ms: 100 }));
      collector.record(makeResult({ latency_ms: 200 }));
      collector.record(makeResult({ latency_ms: 300 }));
      collector.record(makeResult({ latency_ms: 400 }));
      collector.record(makeResult({ latency_ms: 1000 })); // High outlier

      const metrics = collector.computeMetrics();

      expect(metrics.latency_p50_ms).toBe(300);
      expect(metrics.latency_p95_ms).toBe(1000);
    });
  });

  describe('computePassCriteria', () => {
    it('should pass when no compulsions and no hallucinations', () => {
      collector.record(makeResult({ action_taken: true, affordance: 'allowed' }));
      collector.record(makeResult({ action_taken: false, affordance: 'discouraged' }));

      const metrics = collector.computeMetrics();
      const pass = collector.computePassCriteria(metrics);

      expect(pass.compulsion_is_zero_required).toBe(true);
      expect(pass.falsification_checks_all_passed).toBe(true);
      expect(pass.overall).toBe(true);
    });

    it('should fail when compulsion > 0', () => {
      collector.record(makeResult({ action_taken: true, affordance: 'discouraged' }));

      const metrics = collector.computeMetrics();
      const pass = collector.computePassCriteria(metrics);

      expect(pass.compulsion_is_zero_required).toBe(false);
      expect(pass.overall).toBe(false);
    });

    it('should fail when hallucination > 0', () => {
      collector.record(makeResult({ has_hallucination: true }));

      const metrics = collector.computeMetrics();
      const pass = collector.computePassCriteria(metrics);

      expect(pass.falsification_checks_all_passed).toBe(false);
      expect(pass.overall).toBe(false);
    });

    it('should always allow action_rate = 0 (autonomy is optional)', () => {
      collector.record(makeResult({ action_taken: false, affordance: 'allowed' }));
      collector.record(makeResult({ action_taken: false, affordance: 'discouraged' }));

      const metrics = collector.computeMetrics();
      const pass = collector.computePassCriteria(metrics);

      expect(metrics.action_rate).toBe(0);
      expect(pass.action_rate_may_be_zero).toBe(true);
      expect(pass.overall).toBe(true);
    });
  });

  describe('checkRepetition', () => {
    it('should detect repeated outputs', () => {
      expect(collector.checkRepetition('Hello world')).toBe(false);
      expect(collector.checkRepetition('Different output')).toBe(false);
      expect(collector.checkRepetition('Hello world')).toBe(true); // Repeat
    });

    it('should normalize whitespace for comparison', () => {
      expect(collector.checkRepetition('Hello   world')).toBe(false);
      expect(collector.checkRepetition('hello world')).toBe(true); // Same after normalization
    });
  });

  describe('getScenarioSummaries', () => {
    it('should include compulsion/inertia flags', () => {
      collector.record(makeResult({ scenario_id: 's1', action_taken: true, affordance: 'discouraged' }));
      collector.record(makeResult({ scenario_id: 's2', action_taken: false, affordance: 'expected' }));
      collector.record(makeResult({ scenario_id: 's3', action_taken: true, affordance: 'expected' }));

      const summaries = collector.getScenarioSummaries();

      expect(summaries[0].is_compulsion).toBe(true);
      expect(summaries[0].is_inertia).toBe(false);

      expect(summaries[1].is_compulsion).toBe(false);
      expect(summaries[1].is_inertia).toBe(true);

      expect(summaries[2].is_compulsion).toBe(false);
      expect(summaries[2].is_inertia).toBe(false);
    });
  });
});

// Helper to create scenario results with defaults
function makeResult(overrides: Partial<ScenarioResult> = {}): ScenarioResult {
  return {
    scenario_id: 'test-' + Math.random().toString(36).slice(2, 6),
    affordance: 'allowed',
    action_taken: false,
    grounding_pass: null,
    referenced_facts_count: 0,
    available_facts_count: 10,
    is_repetition: false,
    has_hallucination: false,
    violations: [],
    latency_ms: 100,
    ...overrides,
  };
}
