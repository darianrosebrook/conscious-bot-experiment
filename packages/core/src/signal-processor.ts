/**
 * Signal Processing System - Aggregates and prioritizes signals from multiple sources
 *
 * Implements homeostatic monitoring, need generation, and constitutional filtering
 * for the conscious bot's signal-driven control architecture.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  Signal,
  NeedScore,
  BoundedHistory,
  validateSignal,
  SystemEvents,
} from './types';

export interface SignalProcessorConfig {
  historySize: number;
  needUpdateInterval: number; // ms
  constitutionalFiltering: boolean;
  trendWindowSize: number; // number of samples for trend calculation
  decayFactor: number; // 0-1, how quickly old signals decay
}

/**
 * Default configuration for signal processor
 */
export const DEFAULT_SIGNAL_CONFIG: SignalProcessorConfig = {
  historySize: 1000,
  needUpdateInterval: 2000, // 2 seconds
  constitutionalFiltering: true,
  trendWindowSize: 10,
  decayFactor: 0.95,
};

/**
 * Signal aggregation rules for computing needs from signals
 */
interface NeedAggregationRule {
  needType:
    | 'safety'
    | 'nutrition'
    | 'progress'
    | 'social'
    | 'curiosity'
    | 'integrity';
  signalWeights: Record<string, number>;
  baselineThreshold: number;
  urgencyMultiplier: number;
  contextGates?: Record<string, number>; // Context-dependent multipliers
}

/**
 * Default aggregation rules for computing needs
 */
const DEFAULT_AGGREGATION_RULES: NeedAggregationRule[] = [
  {
    needType: 'safety',
    signalWeights: {
      threat: 0.4,
      health: -0.3, // Inverted: low health = high safety need
      // Add more as signals are defined
    },
    baselineThreshold: 0.2,
    urgencyMultiplier: 2.0,
    contextGates: {
      night: 1.3, // Higher safety concern at night
      combat: 2.0, // Much higher during combat
    },
  },
  {
    needType: 'nutrition',
    signalWeights: {
      hunger: 0.6,
      fatigue: 0.4,
    },
    baselineThreshold: 0.3,
    urgencyMultiplier: 1.5,
  },
  {
    needType: 'social',
    signalWeights: {
      social: 0.8,
    },
    baselineThreshold: 0.1,
    urgencyMultiplier: 1.2,
    contextGates: {
      village: 1.5, // Higher social need in villages
      multiplayer: 2.0, // Much higher with other players
    },
  },
  {
    needType: 'curiosity',
    signalWeights: {
      // Will be populated as exploration signals are added
    },
    baselineThreshold: 0.15,
    urgencyMultiplier: 0.8, // Lower urgency for curiosity
  },
];

/**
 * Central signal processing engine that aggregates inputs from homeostasis,
 * intrusions, and environmental observations into prioritized action candidates.
 */
export class SignalProcessor extends EventEmitter<SystemEvents> {
  private signalHistory: BoundedHistory<Signal>;
  private currentNeeds: Map<string, NeedScore> = new Map();
  private lastNeedUpdate = 0;
  private processTimer?: NodeJS.Timeout;
  private aggregationRules: NeedAggregationRule[];

  constructor(
    private config: SignalProcessorConfig = DEFAULT_SIGNAL_CONFIG,
    customRules?: NeedAggregationRule[]
  ) {
    super();
    this.signalHistory = new BoundedHistory<Signal>(this.config.historySize);
    this.aggregationRules = customRules || DEFAULT_AGGREGATION_RULES;
    this.startProcessing();
  }

  /**
   * Process incoming signal and update need calculations
   *
   * @param signal - Raw signal from various sources
   */
  processSignal(signal: Signal): void {
    // Validate signal format
    const validatedSignal = validateSignal(signal);

    // Apply constitutional filtering if enabled
    if (
      this.config.constitutionalFiltering &&
      !this.passesConstitutionalFilter(validatedSignal)
    ) {
      console.warn(
        `Signal filtered out by constitutional rules: ${signal.type}`
      );
      return;
    }

    // Add to history
    this.signalHistory.add(validatedSignal);

    // Emit signal received event
    this.emit('signal-received', validatedSignal);

    // Update needs if enough time has passed
    const now = Date.now();
    if (now - this.lastNeedUpdate >= this.config.needUpdateInterval) {
      this.updateNeeds();
      this.lastNeedUpdate = now;
    }
  }

  /**
   * Apply constitutional filtering to signal suggestions
   *
   * @param signal - Signal to filter
   * @returns true if signal passes constitutional rules
   */
  private passesConstitutionalFilter(signal: Signal): boolean {
    // Basic constitutional rules - can be expanded
    switch (signal.type) {
      case 'intrusion':
        // Check if intrusion suggests harmful actions
        const metadata = signal.metadata;
        if (metadata?.intent === 'harm' || metadata?.riskRating === 'high') {
          return false;
        }
        break;

      case 'threat':
        // Always allow threat signals for safety
        return true;

      default:
        return true;
    }

    return true;
  }

  /**
   * Update need scores based on recent signal patterns
   */
  private updateNeeds(): void {
    const recentSignals = this.signalHistory.getRecent(
      this.config.trendWindowSize
    );
    const newNeeds: NeedScore[] = [];

    for (const rule of this.aggregationRules) {
      const needScore = this.computeNeedScore(rule, recentSignals);
      this.currentNeeds.set(rule.needType, needScore);
      newNeeds.push(needScore);
    }

    // Emit needs updated event
    this.emit('needs-updated', newNeeds);
  }

  /**
   * Compute need score using aggregation rule
   *
   * @param rule - Aggregation rule for this need type
   * @param signals - Recent signals to analyze
   * @returns Computed need score
   */
  private computeNeedScore(
    rule: NeedAggregationRule,
    signals: any[]
  ): NeedScore {
    let score = 0;
    let signalCount = 0;

    // Calculate weighted sum of relevant signals
    for (const signalData of signals) {
      const signal = signalData.value;
      const weight = rule.signalWeights[signal.type];

      if (weight !== undefined) {
        // Apply time decay
        const age = Date.now() - signal.timestamp;
        const decayedIntensity =
          signal.intensity * Math.pow(this.config.decayFactor, age / 1000);

        score += weight * decayedIntensity;
        signalCount++;
      }
    }

    // Normalize by signal count
    if (signalCount > 0) {
      score /= signalCount;
    }

    // Apply baseline threshold
    score = Math.max(score, rule.baselineThreshold);

    // Apply context gates (simplified - would integrate with context system)
    // For now, just apply urgency multiplier if score is high
    if (score > 0.7) {
      score *= rule.urgencyMultiplier;
    }

    // Clamp to [0, 1]
    score = Math.max(0, Math.min(1, score));

    // Calculate trend from previous need score
    const previousNeed = this.currentNeeds.get(rule.needType);
    const trend = previousNeed ? score - previousNeed.score : 0;

    return {
      type: rule.needType,
      score,
      trend,
      urgency: score * (rule.urgencyMultiplier / 2), // Simplified urgency calculation
      lastUpdated: Date.now(),
    };
  }

  /**
   * Get current need scores
   *
   * @returns Array of current need scores
   */
  getCurrentNeeds(): NeedScore[] {
    return Array.from(this.currentNeeds.values());
  }

  /**
   * Get specific need score by type
   *
   * @param needType - Type of need to retrieve
   * @returns Need score or undefined if not found
   */
  getNeedScore(needType: string): NeedScore | undefined {
    return this.currentNeeds.get(needType);
  }

  /**
   * Get recent signal history
   *
   * @param count - Number of recent signals to retrieve
   * @returns Recent signals
   */
  getRecentSignals(count: number = 10): Signal[] {
    return this.signalHistory.getRecent(count).map((item) => item.value);
  }

  /**
   * Get signals since specific timestamp
   *
   * @param timestamp - Starting timestamp
   * @returns Signals since timestamp
   */
  getSignalsSince(timestamp: number): Signal[] {
    return this.signalHistory.getSince(timestamp).map((item) => item.value);
  }

  /**
   * Calculate signal trend over time window
   *
   * @param signalType - Type of signal to analyze
   * @param windowSize - Number of samples to analyze
   * @returns Trend value (-1 to 1)
   */
  calculateSignalTrend(
    signalType: string,
    windowSize: number = this.config.trendWindowSize
  ): number {
    const recentSignals = this.signalHistory
      .getRecent(windowSize)
      .map((item) => item.value)
      .filter((signal) => signal.type === signalType);

    if (recentSignals.length < 2) return 0;

    // Simple linear trend calculation
    const first = recentSignals[0].intensity;
    const last = recentSignals[recentSignals.length - 1].intensity;

    return Math.max(-1, Math.min(1, last - first));
  }

  /**
   * Add custom aggregation rule
   *
   * @param rule - Custom aggregation rule to add
   */
  addAggregationRule(rule: NeedAggregationRule): void {
    this.aggregationRules.push(rule);
  }

  /**
   * Update configuration
   *
   * @param newConfig - New configuration to apply
   */
  updateConfig(newConfig: Partial<SignalProcessorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.signalHistory = new BoundedHistory<Signal>(this.config.historySize);
  }

  /**
   * Start periodic processing
   */
  private startProcessing(): void {
    this.processTimer = setInterval(() => {
      this.updateNeeds();
    }, this.config.needUpdateInterval);
  }

  /**
   * Stop processing and cleanup
   */
  stop(): void {
    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = undefined;
    }
    this.removeAllListeners();
  }

  /**
   * Get processing statistics
   *
   * @returns Statistics about signal processing
   */
  getStatistics(): {
    totalSignalsProcessed: number;
    signalsByType: Record<string, number>;
    needUpdateFrequency: number;
    averageSignalAge: number;
  } {
    const allSignals = this.signalHistory.getRecent(this.signalHistory.size());
    const signalsByType: Record<string, number> = {};
    let totalAge = 0;

    for (const signalData of allSignals) {
      const signal = signalData.value;
      signalsByType[signal.type] = (signalsByType[signal.type] || 0) + 1;
      totalAge += Date.now() - signal.timestamp;
    }

    return {
      totalSignalsProcessed: allSignals.length,
      signalsByType,
      needUpdateFrequency: this.config.needUpdateInterval,
      averageSignalAge:
        allSignals.length > 0 ? totalAge / allSignals.length : 0,
    };
  }

  /**
   * Normalize signal to ensure values are within valid bounds
   *
   * @param signal - Signal to normalize
   * @returns Normalized signal
   */
  normalizeSignal(signal: Signal): Signal {
    return {
      ...signal,
      intensity: Math.max(0, Math.min(1, signal.intensity)),
      confidence: Math.max(0, Math.min(1, signal.confidence)),
      trend: Math.max(-1, Math.min(1, signal.trend)),
    };
  }

  /**
   * Calculate needs from array of signals with optional context
   *
   * @param signals - Array of signals to process
   * @param context - Optional context for contextual need calculation
   * @returns Array of calculated needs
   */
  calculateNeeds(
    signals: Signal[],
    context?: any
  ): Array<{
    type: string;
    urgency: number;
    confidence: number;
    trend: number;
    source: string;
  }> {
    const needMap = new Map<
      string,
      { urgency: number; confidence: number; trend: number; source: string }
    >();

    // Process signals through aggregation rules
    for (const rule of this.aggregationRules) {
      let score = 0;
      let signalCount = 0;
      let totalConfidence = 0;

      for (const signal of signals) {
        const weight = rule.signalWeights[signal.type];
        if (weight !== undefined) {
          score += weight * signal.intensity;
          totalConfidence += signal.confidence;
          signalCount++;
        }
      }

      if (signalCount > 0) {
        score /= signalCount;
        const avgConfidence = totalConfidence / signalCount;

        // Apply context gates if provided
        if (context && rule.contextGates) {
          for (const [contextKey, multiplier] of Object.entries(
            rule.contextGates
          )) {
            if (context[contextKey]) {
              score *= multiplier;
            }
          }
        }

        // Apply baseline and clamp
        score = Math.max(rule.baselineThreshold, score);
        score = Math.max(0, Math.min(1, score));

        const previousNeed = this.currentNeeds.get(rule.needType);
        const trend = previousNeed ? score - previousNeed.score : 0;

        needMap.set(rule.needType, {
          urgency: score,
          confidence: avgConfidence,
          trend,
          source: rule.needType,
        });
      }
    }

    return Array.from(needMap.entries()).map(([type, data]) => ({
      type,
      ...data,
    }));
  }

  /**
   * Aggregate signals of the same type
   *
   * @param signals - Array of signals to aggregate
   * @returns Aggregated signals
   */
  aggregateSignals(signals: Signal[]): Signal[] {
    const signalMap = new Map<string, Signal[]>();

    // Group signals by type
    for (const signal of signals) {
      if (!signalMap.has(signal.type)) {
        signalMap.set(signal.type, []);
      }
      signalMap.get(signal.type)!.push(signal);
    }

    // Aggregate each group
    const aggregated: Signal[] = [];
    for (const [type, typeSignals] of signalMap.entries()) {
      if (typeSignals.length === 1) {
        aggregated.push(typeSignals[0]);
      } else {
        // Aggregate multiple signals of same type
        const avgIntensity =
          typeSignals.reduce((sum, s) => sum + s.intensity, 0) /
          typeSignals.length;
        const avgConfidence =
          typeSignals.reduce((sum, s) => sum + s.confidence, 0) /
          typeSignals.length;
        const avgTrend =
          typeSignals.reduce((sum, s) => sum + s.trend, 0) / typeSignals.length;
        const latestTimestamp = Math.max(
          ...typeSignals.map((s) => s.timestamp)
        );

        aggregated.push({
          type,
          intensity: avgIntensity,
          confidence: avgConfidence,
          trend: avgTrend,
          timestamp: latestTimestamp,
          source: `aggregated_${type}`,
        });
      }
    }

    return aggregated;
  }

  /**
   * Calculate priority for a need given context
   *
   * @param need - Need to calculate priority for
   * @param context - Context for priority calculation
   * @returns Priority information
   */
  calculatePriority(
    need: { type: string; urgency: number; confidence: number },
    context: any
  ): { score: number; rationale: string } {
    let score = need.urgency * need.confidence;
    let rationale = `Base priority from urgency (${need.urgency.toFixed(2)}) and confidence (${need.confidence.toFixed(2)})`;

    // Apply context modifiers
    if (context.timeOfDay === 'night' && need.type === 'Safety') {
      score *= 1.3;
      rationale += '; increased for night safety concerns';
    }

    if (context.environment === 'dangerous') {
      score *= 1.5;
      rationale += '; increased for dangerous environment';
    }

    if (context.playerNearby && need.type === 'Social') {
      score *= 1.4;
      rationale += '; increased for social opportunity';
    }

    return {
      score: Math.max(0, Math.min(1, score)),
      rationale,
    };
  }

  /**
   * Generate goal candidates from needs (simplified implementation)
   *
   * @param needs - Array of needs
   * @param worldState - Current world state
   * @returns Array of goal candidates
   */
  generateGoalCandidates(
    needs: Array<{ type: string; urgency: number }>,
    worldState: any
  ): Array<{
    template: string;
    preconditions: string[];
    feasible: boolean;
    priority: number;
    createdAt: number;
  }> {
    const goals: Array<{
      template: string;
      preconditions: string[];
      feasible: boolean;
      priority: number;
      createdAt: number;
    }> = [];

    for (const need of needs) {
      switch (need.type) {
        case 'Safety':
        case 'safety':
          if (need.urgency > 0.5) {
            goals.push({
              template: 'ReachSafeLight',
              preconditions: ['has_torches', 'can_move'],
              feasible: true,
              priority: need.urgency,
              createdAt: Date.now(),
            });
          }
          break;

        case 'Nutrition':
        case 'nutrition':
          if (need.urgency > 0.4) {
            goals.push({
              template: 'EatFromInventory',
              preconditions: ['has_food'],
              feasible: worldState.inventory?.includes('food') || false,
              priority: need.urgency,
              createdAt: Date.now(),
            });
          }
          break;

        case 'Progress':
        case 'progress':
          if (need.urgency > 0.3) {
            goals.push({
              template: 'Scout',
              preconditions: ['safe_environment'],
              feasible: true,
              priority: need.urgency,
              createdAt: Date.now(),
            });
          }
          break;
      }
    }

    return goals.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check feasibility of a goal
   *
   * @param goal - Goal to check feasibility for
   * @param worldState - Current world state
   * @returns Feasibility information
   */
  checkFeasibility(
    goal: { template: string; preconditions: string[] },
    worldState: any
  ): { feasible: boolean; missingPreconditions?: string[] } {
    const missing: string[] = [];

    for (const precondition of goal.preconditions) {
      switch (precondition) {
        case 'has_food':
          if (!worldState.inventory?.includes('food')) {
            missing.push(precondition);
          }
          break;
        case 'has_torches':
          if (!worldState.inventory?.includes('torch')) {
            missing.push(precondition);
          }
          break;
        case 'can_move':
          if (worldState.health < 0.1) {
            missing.push(precondition);
          }
          break;
        case 'safe_environment':
          if (worldState.threatLevel > 0.7) {
            missing.push(precondition);
          }
          break;
      }
    }

    return {
      feasible: missing.length === 0,
      missingPreconditions: missing.length > 0 ? missing : undefined,
    };
  }

  /**
   * Get cooldown for goal type
   *
   * @param goalType - Type of goal
   * @returns Cooldown in milliseconds
   */
  getCooldownForGoal(goalType: string): number {
    const cooldowns: Record<string, number> = {
      ReachSafeLight: 5000, // 5 seconds
      EatFromInventory: 3000, // 3 seconds
      Scout: 10000, // 10 seconds
    };

    return cooldowns[goalType] || 1000; // Default 1 second
  }

  /**
   * Dispose of resources and cleanup
   */
  dispose(): void {
    this.stop();
  }
}
