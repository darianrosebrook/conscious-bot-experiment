/**
 * Metrics Collector for Eval Harness
 *
 * Collects and computes metrics across eval scenarios.
 * Implements the key metrics from the acceptance criteria:
 * - action_rate: Fraction of scenarios producing convert-eligible goals
 * - grounding_pass_rate: Fraction of goals that pass grounding
 * - repetition_rate: Fraction of outputs that are repetitions
 * - compulsion_count: Actions taken when affordance is 'discouraged' (AC-EV-07)
 * - inertia_count: No action when affordance is 'expected' (AC-EV-07)
 * - hallucination_count: Outputs with fabricated facts
 * - anchoring_ratio_mean: Mean ratio of referenced facts to available facts
 * - latency percentiles
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Result from a single scenario run.
 */
export interface ScenarioResult {
  scenario_id: string;
  /** Oracle affordance label */
  affordance: 'discouraged' | 'allowed' | 'expected';
  /** Whether a convert-eligible goal was produced */
  action_taken: boolean;
  /** Whether the goal passed grounding (null if no goal) */
  grounding_pass: boolean | null;
  /** Number of facts referenced in the output */
  referenced_facts_count: number;
  /** Total facts available in the frame */
  available_facts_count: number;
  /** Whether output was a repetition of a recent output */
  is_repetition: boolean;
  /** Whether output contained fabricated facts */
  has_hallucination: boolean;
  /** Grounding violations found */
  violations: Array<{ type: string; description: string }>;
  /** Latency in milliseconds */
  latency_ms: number;
  /** Error if scenario failed */
  error?: string;
}

/**
 * Aggregated metrics across all scenarios.
 */
export interface EvalMetrics {
  /** Fraction of scenarios producing convert-eligible goals */
  action_rate: number;
  /** Fraction of goals that pass grounding */
  grounding_pass_rate: number;
  /** Fraction of outputs that are repetitions */
  repetition_rate: number;
  /** Actions taken when affordance is 'discouraged' */
  compulsion_count: number;
  /** No action when affordance is 'expected' */
  inertia_count: number;
  /** Outputs with fabricated facts */
  hallucination_count: number;
  /** Mean ratio of referenced facts to available facts */
  anchoring_ratio_mean: number;
  /** Median latency in milliseconds */
  latency_p50_ms: number;
  /** 95th percentile latency in milliseconds */
  latency_p95_ms: number;
  /** Total scenarios evaluated */
  total_scenarios: number;
  /** Scenarios that completed without errors */
  successful_scenarios: number;
  /** Scenarios that failed with errors */
  failed_scenarios: number;
}

/**
 * Pass/fail criteria for the eval run.
 */
export interface EvalPassCriteria {
  /** All falsification checks passed (no fabricated facts) */
  falsification_checks_all_passed: boolean;
  /** Compulsion count is zero (required for pass) */
  compulsion_is_zero_required: boolean;
  /** Action rate may be zero (this is always true per design) */
  action_rate_may_be_zero: boolean;
  /** Overall pass/fail */
  overall: boolean;
}

/**
 * Per-scenario summary for reporting.
 */
export interface ScenarioSummary {
  scenario_id: string;
  pass: boolean;
  action_taken: boolean;
  affordance: 'discouraged' | 'allowed' | 'expected';
  is_compulsion: boolean;
  is_inertia: boolean;
  grounding_pass: boolean | null;
  referenced_facts_count: number;
  violations: Array<{ type: string; description: string }>;
  latency_ms: number;
  error?: string;
}

// ============================================================================
// Metrics Collector Class
// ============================================================================

/**
 * Collects scenario results and computes aggregated metrics.
 */
export class MetricsCollector {
  private results: ScenarioResult[] = [];
  private recentOutputHashes: Set<string> = new Set();
  private readonly repetitionWindow = 5; // Check last 5 outputs for repetition

  /**
   * Record a scenario result.
   *
   * @param result - The scenario result to record
   */
  record(result: ScenarioResult): void {
    this.results.push(result);
  }

  /**
   * Check if an output is a repetition of a recent output.
   *
   * @param outputText - The output text to check
   * @returns True if this is a repetition
   */
  checkRepetition(outputText: string): boolean {
    const hash = this.hashOutput(outputText);

    // Check if we've seen this output recently
    const isRepetition = this.recentOutputHashes.has(hash);

    // Add to recent outputs (maintain window size)
    this.recentOutputHashes.add(hash);
    if (this.recentOutputHashes.size > this.repetitionWindow) {
      // Remove oldest (first added)
      const first = this.recentOutputHashes.values().next().value;
      if (first) this.recentOutputHashes.delete(first);
    }

    return isRepetition;
  }

  /**
   * Reset the repetition detection state.
   */
  resetRepetitionState(): void {
    this.recentOutputHashes.clear();
  }

  /**
   * Compute aggregated metrics from all recorded results.
   */
  computeMetrics(): EvalMetrics {
    const total = this.results.length;
    if (total === 0) {
      return this.emptyMetrics();
    }

    const successful = this.results.filter(r => !r.error);
    const failed = this.results.filter(r => !!r.error);

    // Action rate: fraction with convert-eligible goals
    const actionsCount = successful.filter(r => r.action_taken).length;
    const actionRate = successful.length > 0 ? actionsCount / successful.length : 0;

    // Grounding pass rate: of goals extracted, how many passed grounding
    const goalsExtracted = successful.filter(r => r.action_taken);
    const groundingPasses = goalsExtracted.filter(r => r.grounding_pass === true).length;
    const groundingPassRate = goalsExtracted.length > 0 ? groundingPasses / goalsExtracted.length : 1;

    // Repetition rate
    const repetitions = successful.filter(r => r.is_repetition).length;
    const repetitionRate = successful.length > 0 ? repetitions / successful.length : 0;

    // Compulsion count: action taken when affordance is 'discouraged'
    const compulsionCount = successful.filter(
      r => r.action_taken && r.affordance === 'discouraged'
    ).length;

    // Inertia count: no action when affordance is 'expected'
    const inertiaCount = successful.filter(
      r => !r.action_taken && r.affordance === 'expected'
    ).length;

    // Hallucination count
    const hallucinationCount = successful.filter(r => r.has_hallucination).length;

    // Anchoring ratio mean
    const anchoringRatios = successful
      .filter(r => r.available_facts_count > 0)
      .map(r => r.referenced_facts_count / r.available_facts_count);
    const anchoringRatioMean = anchoringRatios.length > 0
      ? anchoringRatios.reduce((a, b) => a + b, 0) / anchoringRatios.length
      : 0;

    // Latency percentiles
    const latencies = successful.map(r => r.latency_ms).sort((a, b) => a - b);
    const latencyP50 = this.percentile(latencies, 0.5);
    const latencyP95 = this.percentile(latencies, 0.95);

    return {
      action_rate: actionRate,
      grounding_pass_rate: groundingPassRate,
      repetition_rate: repetitionRate,
      compulsion_count: compulsionCount,
      inertia_count: inertiaCount,
      hallucination_count: hallucinationCount,
      anchoring_ratio_mean: anchoringRatioMean,
      latency_p50_ms: latencyP50,
      latency_p95_ms: latencyP95,
      total_scenarios: total,
      successful_scenarios: successful.length,
      failed_scenarios: failed.length,
    };
  }

  /**
   * Compute pass/fail criteria.
   */
  computePassCriteria(metrics: EvalMetrics): EvalPassCriteria {
    const falsificationPassed = metrics.hallucination_count === 0;
    const compulsionZero = metrics.compulsion_count === 0;
    const actionRateMayBeZero = true; // Always true per design

    // Overall pass: no compulsions AND no hallucinations
    // Note: inertia is tracked but doesn't cause failure (autonomy is optional)
    const overall = falsificationPassed && compulsionZero;

    return {
      falsification_checks_all_passed: falsificationPassed,
      compulsion_is_zero_required: compulsionZero,
      action_rate_may_be_zero: actionRateMayBeZero,
      overall,
    };
  }

  /**
   * Get per-scenario summaries.
   */
  getScenarioSummaries(): ScenarioSummary[] {
    return this.results.map(r => ({
      scenario_id: r.scenario_id,
      pass: !r.error && !r.has_hallucination && !(r.action_taken && r.affordance === 'discouraged'),
      action_taken: r.action_taken,
      affordance: r.affordance,
      is_compulsion: r.action_taken && r.affordance === 'discouraged',
      is_inertia: !r.action_taken && r.affordance === 'expected',
      grounding_pass: r.grounding_pass,
      referenced_facts_count: r.referenced_facts_count,
      violations: r.violations,
      latency_ms: r.latency_ms,
      error: r.error,
    }));
  }

  /**
   * Get all recorded results.
   */
  getResults(): ScenarioResult[] {
    return [...this.results];
  }

  /**
   * Clear all recorded results.
   */
  clear(): void {
    this.results = [];
    this.recentOutputHashes.clear();
  }

  /**
   * Hash output text for repetition detection.
   */
  private hashOutput(text: string): string {
    // Normalize whitespace and lowercase for comparison
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Compute percentile from sorted array.
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil(p * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Return empty metrics for edge case of no results.
   */
  private emptyMetrics(): EvalMetrics {
    return {
      action_rate: 0,
      grounding_pass_rate: 1,
      repetition_rate: 0,
      compulsion_count: 0,
      inertia_count: 0,
      hallucination_count: 0,
      anchoring_ratio_mean: 0,
      latency_p50_ms: 0,
      latency_p95_ms: 0,
      total_scenarios: 0,
      successful_scenarios: 0,
      failed_scenarios: 0,
    };
  }
}

/**
 * Count available facts in a scenario frame.
 */
export function countAvailableFacts(frame: {
  facts: {
    bot: {
      health: number;
      hunger: number;
      inventorySummary: unknown[];
      position: unknown;
      timeOfDay: string;
      threatLevel?: string;
    };
    world: {
      biome: string;
      nearbyEntities: unknown[];
    };
  };
}): number {
  let count = 0;

  // Bot facts
  count += 1; // health
  count += 1; // hunger
  count += 1; // position
  count += 1; // timeOfDay
  count += frame.facts.bot.inventorySummary.length;
  if (frame.facts.bot.threatLevel) count += 1;

  // World facts
  count += 1; // biome
  count += frame.facts.world.nearbyEntities.length;

  return count;
}
