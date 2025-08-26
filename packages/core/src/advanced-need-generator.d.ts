/**
 * Advanced Need Generator
 *
 * Implements context-aware need processing, trend tracking, and memory signal integration
 * for sophisticated homeostatic control in the conscious bot.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
export interface Need {
    id: string;
    type: NeedType;
    intensity: number;
    urgency: number;
    trend: TrendDirection;
    trendStrength: number;
    context: NeedContext;
    memoryInfluence: number;
    noveltyScore: number;
    commitmentBoost: number;
    timestamp: number;
    history: NeedHistoryEntry[];
}
export interface NeedContext {
    timeOfDay: TimeOfDay;
    location: LocationType;
    socialContext: SocialContext;
    environmentalFactors: EnvironmentalFactor[];
    recentEvents: string[];
    currentGoals: string[];
    availableResources: string[];
}
export interface NeedHistoryEntry {
    timestamp: number;
    intensity: number;
    urgency: number;
    context: Partial<NeedContext>;
    triggers: string[];
    satisfaction: number;
}
export interface TrendAnalysis {
    direction: TrendDirection;
    strength: number;
    velocity: number;
    acceleration: number;
    stability: number;
    prediction: TrendPrediction;
}
export interface TrendPrediction {
    shortTerm: number;
    mediumTerm: number;
    longTerm: number;
    confidence: number;
}
export interface EnhancedNeed extends Need {
    priorityScore: number;
    opportunityCost: number;
    feasibilityScore: number;
    socialImpact: number;
    learningValue: number;
}
export interface MemorySignal {
    type: 'promise' | 'commitment' | 'experience' | 'goal' | 'relationship';
    content: string;
    relevance: number;
    emotionalValence: number;
    urgency: number;
    timestamp: number;
    decayRate: number;
}
export interface ContextGate {
    condition: string;
    multiplier: number;
    description: string;
    priority: number;
}
export declare enum NeedType {
    SAFETY = "safety",
    NUTRITION = "nutrition",
    PROGRESS = "progress",
    SOCIAL = "social",
    CURIOSITY = "curiosity",
    INTEGRITY = "integrity",
    ACHIEVEMENT = "achievement",
    BELONGING = "belonging",
    AUTONOMY = "autonomy",
    MASTERY = "mastery"
}
export declare enum TrendDirection {
    INCREASING = "increasing",
    DECREASING = "decreasing",
    STABLE = "stable",
    OSCILLATING = "oscillating",
    UNKNOWN = "unknown"
}
export declare enum TimeOfDay {
    DAWN = "dawn",
    MORNING = "morning",
    NOON = "noon",
    AFTERNOON = "afternoon",
    DUSK = "dusk",
    NIGHT = "night",
    MIDNIGHT = "midnight",
    UNKNOWN = "unknown"
}
export declare enum LocationType {
    VILLAGE = "village",
    WILDERNESS = "wilderness",
    CAVE = "cave",
    OCEAN = "ocean",
    NETHER = "nether",
    END = "end",
    UNKNOWN = "unknown"
}
export declare enum SocialContext {
    ALONE = "alone",
    WITH_PLAYERS = "with_players",
    WITH_NPCS = "with_npcs",
    IN_GROUP = "in_group",
    IN_CONFLICT = "in_conflict",
    LEADING = "leading",
    FOLLOWING = "following"
}
export interface EnvironmentalFactor {
    type: string;
    intensity: number;
    impact: number;
    description: string;
}
export interface AdvancedNeedGeneratorConfig {
    trendAnalysisWindow: number;
    contextGatePriority: number;
    memoryInfluenceWeight: number;
    noveltyDecayRate: number;
    commitmentBoostDecay: number;
    predictionConfidenceThreshold: number;
    enableAdvancedContextGates: boolean;
    enableMemoryIntegration: boolean;
    enableTrendPrediction: boolean;
}
export declare class AdvancedNeedGenerator extends EventEmitter {
    private config;
    private needs;
    private contextGates;
    private memorySignals;
    private trendAnalyzers;
    constructor(config?: Partial<AdvancedNeedGeneratorConfig>);
    /**
     * Generate enhanced needs with context awareness and trend analysis
     */
    generateEnhancedNeeds(baseNeeds: Need[], context: NeedContext, memorySignals?: MemorySignal[]): Promise<EnhancedNeed[]>;
    /**
     * Apply context gates to adjust need intensity and urgency
     */
    private applyContextGates;
    /**
     * Analyze trends in need intensity over time
     */
    private analyzeTrends;
    /**
     * Calculate memory influence on need
     */
    private calculateMemoryInfluence;
    /**
     * Calculate novelty score for need
     */
    private calculateNoveltyScore;
    /**
     * Calculate commitment boost for need
     */
    private calculateCommitmentBoost;
    /**
     * Calculate overall priority score for need
     */
    private calculatePriorityScore;
    /**
     * Calculate opportunity cost of not addressing need
     */
    private calculateOpportunityCost;
    /**
     * Calculate feasibility score for addressing need
     */
    private calculateFeasibilityScore;
    /**
     * Calculate social impact of addressing need
     */
    private calculateSocialImpact;
    /**
     * Calculate learning value of addressing need
     */
    private calculateLearningValue;
    private initializeNeeds;
    private initializeContextGates;
    private createEmptyContext;
    private updateMemorySignals;
    private updateNeedHistory;
    private evaluateTimeGate;
    private evaluateLocationGate;
    private evaluateSocialGate;
    private evaluateEnvironmentalGate;
    private calculateVelocity;
    private calculateAcceleration;
    private determineTrendDirection;
    private calculateStability;
    private generatePredictions;
    private isSignalRelevantToNeed;
    private calculateRecencyFactor;
    private calculateContextSimilarity;
    private getTimeSinceLastSimilarContext;
    private isDangerousEnvironment;
    private checkResourceFeasibility;
    private checkEnvironmentalFeasibility;
    private checkSocialFeasibility;
    getNeedHistory(needType: NeedType): NeedHistoryEntry[];
    getTrendAnalysis(needType: NeedType): TrendAnalysis | null;
    getMemorySignals(): MemorySignal[];
    addContextGate(category: string, gate: ContextGate): void;
    getStats(): {
        totalNeeds: number;
        totalMemorySignals: number;
        contextGateCategories: string[];
        averageNeedHistoryLength: number;
    };
}
//# sourceMappingURL=advanced-need-generator.d.ts.map