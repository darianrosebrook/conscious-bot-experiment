/**
 * Signal Processing System - Aggregates and prioritizes signals from multiple sources
 *
 * Implements homeostatic monitoring, need generation, and constitutional filtering
 * for the conscious bot's signal-driven control architecture.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
import { Signal, NeedScore, SystemEvents } from './types';
export interface SignalProcessorConfig {
    historySize: number;
    needUpdateInterval: number;
    constitutionalFiltering: boolean;
    trendWindowSize: number;
    decayFactor: number;
}
/**
 * Default configuration for signal processor
 */
export declare const DEFAULT_SIGNAL_CONFIG: SignalProcessorConfig;
/**
 * Signal aggregation rules for computing needs from signals
 */
interface NeedAggregationRule {
    needType: 'safety' | 'nutrition' | 'progress' | 'social' | 'curiosity' | 'integrity';
    signalWeights: Record<string, number>;
    baselineThreshold: number;
    urgencyMultiplier: number;
    contextGates?: Record<string, number>;
}
/**
 * Central signal processing engine that aggregates inputs from homeostasis,
 * intrusions, and environmental observations into prioritized action candidates.
 */
export declare class SignalProcessor extends EventEmitter<SystemEvents> {
    private config;
    private signalHistory;
    private currentNeeds;
    private lastNeedUpdate;
    private processTimer?;
    private aggregationRules;
    constructor(config?: SignalProcessorConfig, customRules?: NeedAggregationRule[]);
    /**
     * Process incoming signal and update need calculations
     *
     * @param signal - Raw signal from various sources
     */
    processSignal(signal: Signal): void;
    /**
     * Apply constitutional filtering to signal suggestions
     *
     * @param signal - Signal to filter
     * @returns true if signal passes constitutional rules
     */
    private passesConstitutionalFilter;
    /**
     * Update need scores based on recent signal patterns
     */
    private updateNeeds;
    /**
     * Compute need score using aggregation rule
     *
     * @param rule - Aggregation rule for this need type
     * @param signals - Recent signals to analyze
     * @returns Computed need score
     */
    private computeNeedScore;
    /**
     * Get current need scores
     *
     * @returns Array of current need scores
     */
    getCurrentNeeds(): NeedScore[];
    /**
     * Get specific need score by type
     *
     * @param needType - Type of need to retrieve
     * @returns Need score or undefined if not found
     */
    getNeedScore(needType: string): NeedScore | undefined;
    /**
     * Get recent signal history
     *
     * @param count - Number of recent signals to retrieve
     * @returns Recent signals
     */
    getRecentSignals(count?: number): Signal[];
    /**
     * Get signals since specific timestamp
     *
     * @param timestamp - Starting timestamp
     * @returns Signals since timestamp
     */
    getSignalsSince(timestamp: number): Signal[];
    /**
     * Calculate signal trend over time window
     *
     * @param signalType - Type of signal to analyze
     * @param windowSize - Number of samples to analyze
     * @returns Trend value (-1 to 1)
     */
    calculateSignalTrend(signalType: string, windowSize?: number): number;
    /**
     * Add custom aggregation rule
     *
     * @param rule - Custom aggregation rule to add
     */
    addAggregationRule(rule: NeedAggregationRule): void;
    /**
     * Update configuration
     *
     * @param newConfig - New configuration to apply
     */
    updateConfig(newConfig: Partial<SignalProcessorConfig>): void;
    /**
     * Start periodic processing
     */
    private startProcessing;
    /**
     * Stop processing and cleanup
     */
    stop(): void;
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
    };
    /**
     * Normalize signal to ensure values are within valid bounds
     *
     * @param signal - Signal to normalize
     * @returns Normalized signal
     */
    normalizeSignal(signal: Signal): Signal;
    /**
     * Calculate needs from array of signals with optional context
     *
     * @param signals - Array of signals to process
     * @param context - Optional context for contextual need calculation
     * @returns Array of calculated needs
     */
    calculateNeeds(signals: Signal[], context?: any): Array<{
        type: string;
        urgency: number;
        confidence: number;
        trend: number;
        source: string;
    }>;
    /**
     * Aggregate signals of the same type
     *
     * @param signals - Array of signals to aggregate
     * @returns Aggregated signals
     */
    aggregateSignals(signals: Signal[]): Signal[];
    /**
     * Validate and normalize signal type to match schema
     */
    private validateSignalType;
    /**
     * Calculate priority for a need given context
     *
     * @param need - Need to calculate priority for
     * @param context - Context for priority calculation
     * @returns Priority information
     */
    calculatePriority(need: {
        type: string;
        urgency: number;
        confidence: number;
    }, context: any): {
        score: number;
        rationale: string;
    };
    /**
     * Generate goal candidates from needs (simplified implementation)
     *
     * @param needs - Array of needs
     * @param worldState - Current world state
     * @returns Array of goal candidates
     */
    generateGoalCandidates(needs: Array<{
        type: string;
        urgency: number;
    }>, worldState: any): Array<{
        template: string;
        preconditions: string[];
        feasible: boolean;
        priority: number;
        createdAt: number;
    }>;
    /**
     * Check feasibility of a goal
     *
     * @param goal - Goal to check feasibility for
     * @param worldState - Current world state
     * @returns Feasibility information
     */
    checkFeasibility(goal: {
        template: string;
        preconditions: string[];
    }, worldState: any): {
        feasible: boolean;
        missingPreconditions?: string[];
    };
    /**
     * Get cooldown for goal type
     *
     * @param goalType - Type of goal
     * @returns Cooldown in milliseconds
     */
    getCooldownForGoal(goalType: string): number;
    /**
     * Dispose of resources and cleanup
     */
    dispose(): void;
}
export {};
//# sourceMappingURL=signal-processor.d.ts.map