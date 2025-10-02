/**
 * Signal Processing System - Aggregates and prioritizes signals from multiple sources
 *
 * Implements homeostatic monitoring, need generation, and constitutional filtering
 * for the conscious bot's signal-driven control architecture.
 *
 * Enhanced with redundancy, circuit breakers, and graceful degradation for critical path reliability.
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

// Circuit breaker for external dependencies
interface CircuitBreaker {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
  threshold: number;
  timeout: number;
}

interface PerformanceMetrics {
  averageLatency: number;
  maxLatency: number;
  minLatency: number;
  totalProcessed: number;
  errorRate: number;
  lastUpdate: number;
}

interface SignalBackupQueue {
  signals: Signal[];
  maxSize: number;
  replayInProgress: boolean;
}

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

  // Reliability enhancements
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private performanceMetrics: PerformanceMetrics;
  private backupQueue: SignalBackupQueue;
  private isDegraded = false;
  private degradationLevel = 0; // 0 = normal, 1 = reduced, 2 = minimal
  private redundantProcessor?: SignalProcessor;

  constructor(
    private config: SignalProcessorConfig = DEFAULT_SIGNAL_CONFIG,
    customRules?: NeedAggregationRule[]
  ) {
    super();
    this.signalHistory = new BoundedHistory<Signal>(this.config.historySize);
    this.aggregationRules = customRules || DEFAULT_AGGREGATION_RULES;

    // Initialize reliability components
    this.performanceMetrics = {
      averageLatency: 0,
      maxLatency: 0,
      minLatency: Infinity,
      totalProcessed: 0,
      errorRate: 0,
      lastUpdate: Date.now(),
    };

    this.backupQueue = {
      signals: [],
      maxSize: 100,
      replayInProgress: false,
    };

    // Initialize circuit breakers for external dependencies
    this.initializeCircuitBreakers();

    this.startProcessing();
    this.startPerformanceMonitoring();
  }

  /**
   * Process incoming signal and update need calculations with reliability enhancements
   *
   * @param signal - Raw signal from various sources
   */
  processSignal(signal: Signal): void {
    const startTime = Date.now();

    try {
      // Validate signal format with circuit breaker protection
      const validatedSignal = this.processWithCircuitBreaker('validation', () =>
        validateSignal(signal)
      );

      // Apply constitutional filtering if enabled and not degraded
      if (
        this.config.constitutionalFiltering &&
        this.degradationLevel < 2 && // Skip in minimal mode
        !this.passesConstitutionalFilter(validatedSignal)
      ) {
        console.warn(
          `Signal filtered out by constitutional rules: ${signal.type}`
        );
        this.recordPerformance(Date.now() - startTime, false);
        return;
      }

      // Add to history with backup
      this.signalHistory.add(validatedSignal);
      this.addToBackupQueue(validatedSignal);

      // Emit signal received event
      this.emit('signal-received', validatedSignal);

      // Update needs if enough time has passed
      const now = Date.now();
      if (now - this.lastNeedUpdate >= this.config.needUpdateInterval) {
        this.updateNeedsWithReliability();
        this.lastNeedUpdate = now;
      }

      this.recordPerformance(Date.now() - startTime, true);

      // Check if performance is degrading
      this.checkPerformanceDegradation();
    } catch (error) {
      this.recordPerformance(Date.now() - startTime, false);
      this.handleProcessingError(error, signal);

      // In degraded mode, use simplified processing
      if (this.degradationLevel > 0) {
        this.processSignalDegraded(signal);
      }
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

        // Ensure type is valid for Signal schema
        const validType = this.validateSignalType(type);
        aggregated.push({
          type: validType,
          intensity: avgIntensity,
          urgency: avgIntensity, // Use intensity as urgency for aggregated signals
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
   * Validate and normalize signal type to match schema
   */
  private validateSignalType(type: string): Signal['type'] {
    const validTypes: Signal['type'][] = [
      'health',
      'hunger',
      'fatigue',
      'threat',
      'social',
      'memory',
      'intrusion',
    ];

    // Try exact match first
    if (validTypes.includes(type as Signal['type'])) {
      return type as Signal['type'];
    }

    // Try case-insensitive match
    const lowerType = type.toLowerCase();
    for (const validType of validTypes) {
      if (validType === lowerType) {
        return validType;
      }
    }

    // Default to 'threat' for unknown types
    return 'threat';
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
   * Process any pending signals in the queue
   */
  private processPendingSignals(): void {
    // This method would process any queued signals
    // For now, it's a placeholder for the timer-based processing
    // In a real implementation, this would process a signal queue
  }

  /**
   * Convert calculateNeeds array result to NeedScore Map
   */
  private convertToNeedScoreMap(
    needsArray: Array<{
      type: string;
      urgency: number;
      confidence: number;
      trend: number;
      source: string;
    }>
  ): Map<string, NeedScore> {
    const needMap = new Map<string, NeedScore>();

    for (const need of needsArray) {
      // Convert to proper NeedScore type
      const needScore: NeedScore = {
        type: need.type as
          | 'safety'
          | 'nutrition'
          | 'progress'
          | 'social'
          | 'curiosity'
          | 'integrity',
        score: need.urgency, // Use urgency as score
        trend: need.trend,
        urgency: need.urgency,
        lastUpdated: Date.now(),
      };
      needMap.set(need.type, needScore);
    }

    return needMap;
  }

  /**
   * Initialize circuit breakers for external dependencies
   */
  private initializeCircuitBreakers(): void {
    // Circuit breaker for validation service
    this.circuitBreakers.set('validation', {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed',
      threshold: 5,
      timeout: 30000, // 30 seconds
    });

    // Circuit breaker for constitutional filtering
    this.circuitBreakers.set('constitutional', {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed',
      threshold: 3,
      timeout: 15000, // 15 seconds
    });
  }

  /**
   * Process with circuit breaker protection
   */
  private processWithCircuitBreaker<T>(
    serviceName: string,
    operation: () => T
  ): T {
    const breaker = this.circuitBreakers.get(serviceName);
    if (!breaker) {
      return operation();
    }

    // Check if circuit breaker is open
    if (breaker.state === 'open') {
      const now = Date.now();
      if (now - breaker.lastFailureTime > breaker.timeout) {
        breaker.state = 'half-open';
      } else {
        throw new Error(`${serviceName} circuit breaker is open`);
      }
    }

    try {
      const result = operation();
      // Success - reset failure count and close circuit
      if (breaker.state === 'half-open') {
        breaker.state = 'closed';
        breaker.failures = 0;
      }
      return result;
    } catch (error) {
      breaker.failures++;
      breaker.lastFailureTime = Date.now();

      if (breaker.failures >= breaker.threshold) {
        breaker.state = 'open';
        console.warn(`Circuit breaker opened for ${serviceName}`);
      }

      throw error;
    }
  }

  /**
   * Add signal to backup queue for reliability
   */
  private addToBackupQueue(signal: Signal): void {
    this.backupQueue.signals.push(signal);

    // Maintain queue size limit
    if (this.backupQueue.signals.length > this.backupQueue.maxSize) {
      this.backupQueue.signals.shift(); // Remove oldest
    }
  }

  /**
   * Simplified signal processing for degraded mode
   */
  private processSignalDegraded(signal: Signal): void {
    try {
      // In degraded mode, only process critical signals
      if (signal.type === 'intrusion' || signal.urgency > 0.8) {
        this.signalHistory.add(signal);
        this.emit('signal-received', signal);

        // Minimal need updates in degraded mode
        if (
          Date.now() - this.lastNeedUpdate >=
          this.config.needUpdateInterval * 2
        ) {
          this.updateNeedsMinimal();
          this.lastNeedUpdate = Date.now();
        }
      }
    } catch (error) {
      console.error('Error in degraded signal processing:', error);
    }
  }

  /**
   * Update needs with reliability enhancements
   */
  private updateNeedsWithReliability(): void {
    try {
      // Use redundant processing if available
      if (this.redundantProcessor && this.degradationLevel === 0) {
        try {
          const signals = this.signalHistory.getAll();
          const primaryNeedsArray = this.calculateNeeds(signals);
          const backupNeedsArray =
            this.redundantProcessor.calculateNeeds(signals);

          const primaryNeeds = this.convertToNeedScoreMap(primaryNeedsArray);
          const backupNeeds = this.convertToNeedScoreMap(backupNeedsArray);

          // Compare results for consistency
          const consistencyCheck = this.compareNeedResults(
            primaryNeeds,
            backupNeeds
          );

          if (!consistencyCheck.consistent) {
            console.warn(
              'Need calculation inconsistency detected',
              consistencyCheck.differences
            );
            // Use the more conservative result
            this.currentNeeds = consistencyCheck.consensus;
          } else {
            this.currentNeeds = primaryNeeds;
          }
        } catch (error) {
          console.warn('Primary need calculation failed, using backup:', error);
          const backupSignals = this.signalHistory.getAll();
          const backupNeedsArray =
            this.redundantProcessor.calculateNeeds(backupSignals);
          this.currentNeeds = this.convertToNeedScoreMap(backupNeedsArray);
        }
      } else {
        const signals = this.signalHistory.getAll();
        const needsArray = this.calculateNeeds(signals);
        this.currentNeeds = this.convertToNeedScoreMap(needsArray);
      }

      this.emit('needs-updated', Array.from(this.currentNeeds.values()));
    } catch (error) {
      console.error('Critical error in need updates:', error);
      this.handleCriticalFailure('need-calculation', error);
    }
  }

  /**
   * Minimal need updates for degraded mode
   */
  private updateNeedsMinimal(): void {
    try {
      // Only update critical needs in degraded mode
      const signals = this.signalHistory.getAll();
      const allNeedsArray = this.calculateNeeds(signals);
      const allNeeds = this.convertToNeedScoreMap(allNeedsArray);
      const criticalNeeds = Array.from(allNeeds.values()).filter(
        (need) => need.score > 0.8 || need.type === 'safety'
      );

      // Update only critical needs
      for (const need of criticalNeeds) {
        this.currentNeeds.set(need.type, need);
      }

      if (criticalNeeds.length > 0) {
        this.emit('needs-updated', criticalNeeds);
      }
    } catch (error) {
      console.error('Error in minimal need updates:', error);
    }
  }

  /**
   * Compare need calculation results for consistency
   */
  private compareNeedResults(
    primary: Map<string, NeedScore>,
    backup: Map<string, NeedScore>
  ): {
    consistent: boolean;
    differences: string[];
    consensus: Map<string, NeedScore>;
  } {
    const differences: string[] = [];
    const consensus = new Map<string, NeedScore>();

    // Check all needs from both results
    const allTypes = new Set([...primary.keys(), ...backup.keys()]);

    for (const type of allTypes) {
      const primaryNeed = primary.get(type);
      const backupNeed = backup.get(type);

      if (!primaryNeed || !backupNeed) {
        differences.push(`Missing need type: ${type}`);
        // Use whichever result exists
        consensus.set(type, primaryNeed || backupNeed!);
        continue;
      }

      // Check score difference
      const scoreDiff = Math.abs(primaryNeed.score - backupNeed.score);
      if (scoreDiff > 0.1) {
        differences.push(`Score difference for ${type}: ${scoreDiff}`);
      }

      // Use average for consensus
      consensus.set(type, {
        type: type as
          | 'safety'
          | 'nutrition'
          | 'progress'
          | 'social'
          | 'curiosity'
          | 'integrity',
        score: (primaryNeed.score + backupNeed.score) / 2,
        trend: (primaryNeed.trend + backupNeed.trend) / 2,
        urgency: (primaryNeed.urgency + backupNeed.urgency) / 2,
        lastUpdated: Math.max(primaryNeed.lastUpdated, backupNeed.lastUpdated),
      });
    }

    return {
      consistent: differences.length === 0,
      differences,
      consensus,
    };
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    setInterval(() => {
      this.updatePerformanceMetrics();
      this.checkPerformanceDegradation();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Record performance metrics
   */
  private recordPerformance(latency: number, success: boolean): void {
    const metrics = this.performanceMetrics;

    metrics.totalProcessed++;
    metrics.maxLatency = Math.max(metrics.maxLatency, latency);
    metrics.minLatency = Math.min(metrics.minLatency, latency);

    // Update running average
    const alpha = 0.1; // Smoothing factor
    metrics.averageLatency =
      (1 - alpha) * metrics.averageLatency + alpha * latency;

    if (!success) {
      // Estimate error rate (simple moving average)
      metrics.errorRate = (1 - alpha) * metrics.errorRate + alpha * 1;
    }

    metrics.lastUpdate = Date.now();
  }

  /**
   * Update aggregated performance metrics
   */
  private updatePerformanceMetrics(): void {
    // This would aggregate metrics from multiple sources
    // For now, just ensure metrics are current
    this.performanceMetrics.lastUpdate = Date.now();
  }

  /**
   * Check if performance is degrading
   */
  private checkPerformanceDegradation(): void {
    const metrics = this.performanceMetrics;
    const now = Date.now();

    // Check latency thresholds
    if (metrics.averageLatency > 100) {
      // > 100ms average
      if (this.degradationLevel === 0) {
        console.warn(
          'Performance degradation detected - entering reduced mode'
        );
        this.enterDegradedMode(1);
      }
    }

    if (metrics.averageLatency > 200) {
      // > 200ms average
      if (this.degradationLevel < 2) {
        console.warn(
          'Critical performance degradation - entering minimal mode'
        );
        this.enterDegradedMode(2);
      }
    }

    // Check error rate
    if (metrics.errorRate > 0.05) {
      // > 5% error rate
      if (this.degradationLevel === 0) {
        console.warn('High error rate detected - entering reduced mode');
        this.enterDegradedMode(1);
      }
    }

    // Auto-recovery check
    if (this.degradationLevel > 0 && now - metrics.lastUpdate > 30000) {
      // Try to recover if performance has been good for 30 seconds
      if (metrics.averageLatency < 50 && metrics.errorRate < 0.01) {
        console.log('Performance recovered - exiting degraded mode');
        this.exitDegradedMode();
      }
    }
  }

  /**
   * Enter degraded operation mode
   */
  private enterDegradedMode(level: number): void {
    this.degradationLevel = level;
    this.isDegraded = true;

    console.warn(`Signal processor entering degraded mode level ${level}`);

    // Adjust processing based on degradation level
    if (level >= 1) {
      // Reduce processing frequency
      if (this.processTimer) {
        clearInterval(this.processTimer);
        this.processTimer = setInterval(
          () => this.processPendingSignals(),
          5000
        ); // Every 5 seconds
      }
    }

    if (level >= 2) {
      // Minimal mode - only critical signals
      this.config.constitutionalFiltering = false;
      this.config.needUpdateInterval = 10000; // Every 10 seconds
    }

    this.emit('degradation-activated', {
      level,
      timestamp: Date.now(),
      reason: 'performance-degradation',
    });
  }

  /**
   * Exit degraded operation mode
   */
  private exitDegradedMode(): void {
    if (this.degradationLevel === 0) return;

    const oldLevel = this.degradationLevel;
    this.degradationLevel = 0;
    this.isDegraded = false;

    // Restore normal operation
    this.config.constitutionalFiltering = true;
    this.config.needUpdateInterval = 2000;

    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = setInterval(() => this.processPendingSignals(), 1000); // Every second
    }

    console.log('Signal processor recovered to normal operation');

    this.emit('degradation-deactivated', {
      previousLevel: oldLevel,
      timestamp: Date.now(),
      reason: 'performance-recovered',
    });
  }

  /**
   * Handle processing errors with appropriate escalation
   */
  private handleProcessingError(error: any, signal: Signal): void {
    console.error(
      'Signal processing error:',
      error,
      'for signal:',
      signal.type
    );

    // Record error for monitoring
    this.emit('processing-error', {
      error: error.message,
      signalType: signal.type,
      timestamp: Date.now(),
    });

    // Escalate critical errors
    if (
      error.message?.includes('critical') ||
      this.performanceMetrics.errorRate > 0.1
    ) {
      this.handleCriticalFailure('signal-processing', error);
    }
  }

  /**
   * Handle critical system failures
   */
  private handleCriticalFailure(component: string, error: any): void {
    console.error(`Critical failure in ${component}:`, error);

    this.emit('critical-failure', {
      component,
      error: error.message,
      timestamp: Date.now(),
      degradationLevel: this.degradationLevel,
    });

    // In critical failure, attempt emergency graceful degradation
    if (this.degradationLevel < 2) {
      this.enterDegradedMode(2);
    }

    // Replay backup signals if available
    if (
      this.backupQueue.signals.length > 0 &&
      !this.backupQueue.replayInProgress
    ) {
      this.replayBackupSignals();
    }
  }

  /**
   * Replay signals from backup queue
   */
  private async replayBackupSignals(): Promise<void> {
    if (
      this.backupQueue.replayInProgress ||
      this.backupQueue.signals.length === 0
    ) {
      return;
    }

    this.backupQueue.replayInProgress = true;

    console.log(`Replaying ${this.backupQueue.signals.length} backup signals`);

    for (const signal of this.backupQueue.signals) {
      try {
        // Process with lower priority
        const lowPrioritySignal = { ...signal, priority: 'low' as const };
        this.processSignal(lowPrioritySignal);
        await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      } catch (error) {
        console.warn('Error replaying backup signal:', error);
      }
    }

    this.backupQueue.signals = [];
    this.backupQueue.replayInProgress = false;

    console.log('Backup signal replay completed');
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get system health status
   */
  getSystemHealth(): {
    status: 'healthy' | 'degraded' | 'critical';
    degradationLevel: number;
    performanceMetrics: PerformanceMetrics;
    circuitBreakerStates: Record<string, string>;
    backupQueueSize: number;
  } {
    const circuitBreakerStates: Record<string, string> = {};
    for (const [name, breaker] of this.circuitBreakers) {
      circuitBreakerStates[name] = breaker.state;
    }

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (this.degradationLevel > 0) {
      status = this.degradationLevel >= 2 ? 'critical' : 'degraded';
    }

    return {
      status,
      degradationLevel: this.degradationLevel,
      performanceMetrics: this.getPerformanceMetrics(),
      circuitBreakerStates,
      backupQueueSize: this.backupQueue.signals.length,
    };
  }

  /**
   * Set up redundant processor for enhanced reliability
   */
  setRedundantProcessor(processor: SignalProcessor): void {
    this.redundantProcessor = processor;

    // Sync configuration
    this.redundantProcessor.config = { ...this.config };

    console.log('Redundant signal processor configured');
  }

  /**
   * Shutdown the signal processor gracefully
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down signal processor...');
    this.stop();

    // Clear any pending timers
    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = undefined;
    }

    // Clear backup queue
    this.backupQueue.signals = [];

    console.log('Signal processor shutdown complete');
  }

  /**
   * Dispose of resources and cleanup
   */
  dispose(): void {
    this.stop();
  }
}
