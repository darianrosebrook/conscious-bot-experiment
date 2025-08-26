/**
 * Advanced Signal Processor
 *
 * Implements complex signal fusion, intrusion detection, memory signal integration,
 * and social signal processing for sophisticated signal management in the conscious bot.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
export interface Signal {
    id: string;
    type: SignalType;
    source: SignalSource;
    priority: number;
    urgency: number;
    confidence: number;
    timestamp: number;
    data: SignalData;
    metadata: SignalMetadata;
    processed: boolean;
    fused: boolean;
}
export interface SignalData {
    content: string;
    intensity: number;
    direction: SignalDirection;
    duration: number;
    frequency: number;
    amplitude: number;
    pattern?: string;
    context?: Record<string, any>;
}
export interface SignalMetadata {
    location: string;
    environment: string;
    socialContext: string;
    emotionalValence: number;
    novelty: number;
    relevance: number;
    reliability: number;
    tags: string[];
}
export interface FusedSignal extends Signal {
    componentSignals: string[];
    fusionMethod: FusionMethod;
    fusionConfidence: number;
    correlationStrength: number;
    redundancyScore: number;
}
export interface IntrusionSignal extends Signal {
    threatLevel: ThreatLevel;
    threatType: ThreatType;
    sourceIdentity?: string;
    attackVector?: string;
    mitigationRequired: boolean;
    responseUrgency: number;
}
export interface MemorySignal extends Signal {
    memoryType: MemoryType;
    recallStrength: number;
    emotionalImpact: number;
    learningValue: number;
    decayRate: number;
    associations: string[];
}
export interface SocialSignal extends Signal {
    socialType: SocialSignalType;
    agentId?: string;
    relationshipStrength: number;
    trustLevel: number;
    cooperationLevel: number;
    communicationIntent: CommunicationIntent;
}
export interface SignalFusion {
    id: string;
    method: FusionMethod;
    signals: string[];
    result: FusedSignal;
    confidence: number;
    timestamp: number;
    metadata: FusionMetadata;
}
export interface FusionMetadata {
    correlationMatrix: number[][];
    redundancyAnalysis: RedundancyAnalysis;
    confidenceFactors: ConfidenceFactor[];
    fusionQuality: number;
}
export interface RedundancyAnalysis {
    redundantSignals: string[];
    redundancyScore: number;
    informationGain: number;
    noiseReduction: number;
}
export interface ConfidenceFactor {
    factor: string;
    weight: number;
    value: number;
    contribution: number;
}
export interface SignalPattern {
    id: string;
    name: string;
    description: string;
    signals: string[];
    frequency: number;
    confidence: number;
    significance: number;
    lastSeen: number;
    firstSeen: number;
    duration: number;
}
export interface ThreatAssessment {
    overallThreat: number;
    threatSignals: IntrusionSignal[];
    threatPatterns: SignalPattern[];
    mitigationStrategies: MitigationStrategy[];
    responsePriority: number;
    confidence: number;
}
export interface MitigationStrategy {
    id: string;
    name: string;
    description: string;
    threatTypes: ThreatType[];
    effectiveness: number;
    cost: number;
    timeRequired: number;
    prerequisites: string[];
    sideEffects: string[];
}
export declare enum SignalType {
    HOMEOSTATIC = "homeostatic",
    INTRUSION = "intrusion",
    MEMORY = "memory",
    SOCIAL = "social",
    ENVIRONMENTAL = "environmental",
    COGNITIVE = "cognitive",
    EMOTIONAL = "emotional",
    PHYSICAL = "physical"
}
export declare enum SignalSource {
    INTERNAL = "internal",
    EXTERNAL = "external",
    SOCIAL = "social",
    ENVIRONMENTAL = "environmental",
    COGNITIVE = "cognitive",
    MEMORY = "memory"
}
export declare enum SignalDirection {
    INCOMING = "incoming",
    OUTGOING = "outgoing",
    BIDIRECTIONAL = "bidirectional",
    INTERNAL = "internal"
}
export declare enum FusionMethod {
    WEIGHTED_AVERAGE = "weighted_average",
    BAYESIAN = "bayesian",
    DEMPSTER_SHAFER = "dempster_shafer",
    FUZZY_LOGIC = "fuzzy_logic",
    NEURAL_NETWORK = "neural_network",
    CORRELATION = "correlation",
    TEMPORAL = "temporal",
    SPATIAL = "spatial"
}
export declare enum ThreatLevel {
    NONE = "none",
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export declare enum ThreatType {
    PHYSICAL = "physical",
    SOCIAL = "social",
    COGNITIVE = "cognitive",
    ENVIRONMENTAL = "environmental",
    RESOURCE = "resource",
    INFORMATION = "information"
}
export declare enum MemoryType {
    EXPERIENCE = "experience",
    KNOWLEDGE = "knowledge",
    EMOTIONAL = "emotional",
    PROCEDURAL = "procedural",
    EPISODIC = "episodic",
    SEMANTIC = "semantic"
}
export declare enum SocialSignalType {
    COMMUNICATION = "communication",
    GESTURE = "gesture",
    EMOTION = "emotion",
    INTENTION = "intention",
    THREAT = "threat",
    COOPERATION = "cooperation",
    COMPETITION = "competition"
}
export declare enum CommunicationIntent {
    FRIENDLY = "friendly",
    HOSTILE = "hostile",
    NEUTRAL = "neutral",
    COOPERATIVE = "cooperative",
    COMPETITIVE = "competitive",
    INFORMATIVE = "informative",
    PERSUASIVE = "persuasive"
}
export interface AdvancedSignalProcessorConfig {
    maxSignals: number;
    fusionThreshold: number;
    threatThreshold: number;
    memoryDecayRate: number;
    socialTrustThreshold: number;
    enableAdvancedFusion: boolean;
    enableIntrusionDetection: boolean;
    enableMemoryIntegration: boolean;
    enableSocialProcessing: boolean;
    enablePatternRecognition: boolean;
}
export declare class AdvancedSignalProcessor extends EventEmitter {
    private config;
    private signals;
    private fusedSignals;
    private signalPatterns;
    private threatSignals;
    private memorySignals;
    private socialSignals;
    private fusionHistory;
    private patternRecognizer;
    private threatDetector;
    private memoryIntegrator;
    private socialProcessor;
    constructor(config?: Partial<AdvancedSignalProcessorConfig>);
    /**
     * Process incoming signals with advanced fusion and analysis
     */
    processSignals(signals: Signal[]): Promise<ProcessedSignals>;
    /**
     * Perform advanced signal fusion
     */
    private performSignalFusion;
    /**
     * Group signals for fusion based on correlation
     */
    private groupSignalsForFusion;
    /**
     * Calculate correlation between two signals
     */
    private calculateCorrelation;
    /**
     * Calculate content similarity between signal data
     */
    private calculateContentSimilarity;
    /**
     * Select appropriate fusion method for signal group
     */
    private selectFusionMethod;
    /**
     * Fuse a group of signals using specified method
     */
    private fuseSignalGroup;
    /**
     * Weighted average fusion method
     */
    private weightedAverageFusion;
    /**
     * Bayesian fusion method
     */
    private bayesianFusion;
    /**
     * Correlation-based fusion method
     */
    private correlationFusion;
    /**
     * Process intrusion signals
     */
    private processIntrusionSignal;
    /**
     * Process memory signals
     */
    private processMemorySignal;
    /**
     * Process social signals
     */
    private processSocialSignal;
    /**
     * Detect patterns in signals
     */
    private detectPatterns;
    /**
     * Assess threats from intrusion signals
     */
    private assessThreats;
    /**
     * Group threats by type
     */
    private groupThreatsByType;
    /**
     * Clean up old signals
     */
    private cleanupOldSignals;
    private mostCommonDirection;
    private mostCommonLocation;
    private mostCommonEnvironment;
    private mostCommonSocialContext;
    private mergeTags;
    private calculateGroupCorrelation;
    private calculateRedundancyScore;
    private determineFusedType;
    private determineFusedSource;
    private calculateFusionMetadata;
    getSignals(): Signal[];
    getFusedSignals(): FusedSignal[];
    getThreatSignals(): IntrusionSignal[];
    getMemorySignals(): MemorySignal[];
    getSocialSignals(): SocialSignal[];
    getSignalPatterns(): SignalPattern[];
    getFusionHistory(): SignalFusion[];
    getStats(): {
        totalSignals: number;
        fusedSignals: number;
        threatSignals: number;
        memorySignals: number;
        socialSignals: number;
        patterns: number;
        fusionHistory: number;
    };
}
export interface ProcessedSignals {
    processedSignals: Signal[];
    fusedSignals: FusedSignal[];
    threatAssessments: ThreatAssessment[];
    patterns: SignalPattern[];
}
//# sourceMappingURL=advanced-signal-processor.d.ts.map