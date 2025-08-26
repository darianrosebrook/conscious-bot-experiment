"use strict";
/**
 * Advanced Signal Processor
 *
 * Implements complex signal fusion, intrusion detection, memory signal integration,
 * and social signal processing for sophisticated signal management in the conscious bot.
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedSignalProcessor = exports.CommunicationIntent = exports.SocialSignalType = exports.MemoryType = exports.ThreatType = exports.ThreatLevel = exports.FusionMethod = exports.SignalDirection = exports.SignalSource = exports.SignalType = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
var SignalType;
(function (SignalType) {
    SignalType["HOMEOSTATIC"] = "homeostatic";
    SignalType["INTRUSION"] = "intrusion";
    SignalType["MEMORY"] = "memory";
    SignalType["SOCIAL"] = "social";
    SignalType["ENVIRONMENTAL"] = "environmental";
    SignalType["COGNITIVE"] = "cognitive";
    SignalType["EMOTIONAL"] = "emotional";
    SignalType["PHYSICAL"] = "physical";
})(SignalType || (exports.SignalType = SignalType = {}));
var SignalSource;
(function (SignalSource) {
    SignalSource["INTERNAL"] = "internal";
    SignalSource["EXTERNAL"] = "external";
    SignalSource["SOCIAL"] = "social";
    SignalSource["ENVIRONMENTAL"] = "environmental";
    SignalSource["COGNITIVE"] = "cognitive";
    SignalSource["MEMORY"] = "memory";
})(SignalSource || (exports.SignalSource = SignalSource = {}));
var SignalDirection;
(function (SignalDirection) {
    SignalDirection["INCOMING"] = "incoming";
    SignalDirection["OUTGOING"] = "outgoing";
    SignalDirection["BIDIRECTIONAL"] = "bidirectional";
    SignalDirection["INTERNAL"] = "internal";
})(SignalDirection || (exports.SignalDirection = SignalDirection = {}));
var FusionMethod;
(function (FusionMethod) {
    FusionMethod["WEIGHTED_AVERAGE"] = "weighted_average";
    FusionMethod["BAYESIAN"] = "bayesian";
    FusionMethod["DEMPSTER_SHAFER"] = "dempster_shafer";
    FusionMethod["FUZZY_LOGIC"] = "fuzzy_logic";
    FusionMethod["NEURAL_NETWORK"] = "neural_network";
    FusionMethod["CORRELATION"] = "correlation";
    FusionMethod["TEMPORAL"] = "temporal";
    FusionMethod["SPATIAL"] = "spatial";
})(FusionMethod || (exports.FusionMethod = FusionMethod = {}));
var ThreatLevel;
(function (ThreatLevel) {
    ThreatLevel["NONE"] = "none";
    ThreatLevel["LOW"] = "low";
    ThreatLevel["MEDIUM"] = "medium";
    ThreatLevel["HIGH"] = "high";
    ThreatLevel["CRITICAL"] = "critical";
})(ThreatLevel || (exports.ThreatLevel = ThreatLevel = {}));
var ThreatType;
(function (ThreatType) {
    ThreatType["PHYSICAL"] = "physical";
    ThreatType["SOCIAL"] = "social";
    ThreatType["COGNITIVE"] = "cognitive";
    ThreatType["ENVIRONMENTAL"] = "environmental";
    ThreatType["RESOURCE"] = "resource";
    ThreatType["INFORMATION"] = "information";
})(ThreatType || (exports.ThreatType = ThreatType = {}));
var MemoryType;
(function (MemoryType) {
    MemoryType["EXPERIENCE"] = "experience";
    MemoryType["KNOWLEDGE"] = "knowledge";
    MemoryType["EMOTIONAL"] = "emotional";
    MemoryType["PROCEDURAL"] = "procedural";
    MemoryType["EPISODIC"] = "episodic";
    MemoryType["SEMANTIC"] = "semantic";
})(MemoryType || (exports.MemoryType = MemoryType = {}));
var SocialSignalType;
(function (SocialSignalType) {
    SocialSignalType["COMMUNICATION"] = "communication";
    SocialSignalType["GESTURE"] = "gesture";
    SocialSignalType["EMOTION"] = "emotion";
    SocialSignalType["INTENTION"] = "intention";
    SocialSignalType["THREAT"] = "threat";
    SocialSignalType["COOPERATION"] = "cooperation";
    SocialSignalType["COMPETITION"] = "competition";
})(SocialSignalType || (exports.SocialSignalType = SocialSignalType = {}));
var CommunicationIntent;
(function (CommunicationIntent) {
    CommunicationIntent["FRIENDLY"] = "friendly";
    CommunicationIntent["HOSTILE"] = "hostile";
    CommunicationIntent["NEUTRAL"] = "neutral";
    CommunicationIntent["COOPERATIVE"] = "cooperative";
    CommunicationIntent["COMPETITIVE"] = "competitive";
    CommunicationIntent["INFORMATIVE"] = "informative";
    CommunicationIntent["PERSUASIVE"] = "persuasive";
})(CommunicationIntent || (exports.CommunicationIntent = CommunicationIntent = {}));
const DEFAULT_CONFIG = {
    maxSignals: 1000,
    fusionThreshold: 0.6,
    threatThreshold: 0.5,
    memoryDecayRate: 0.95,
    socialTrustThreshold: 0.3,
    enableAdvancedFusion: true,
    enableIntrusionDetection: true,
    enableMemoryIntegration: true,
    enableSocialProcessing: true,
    enablePatternRecognition: true,
};
// ============================================================================
// Advanced Signal Processor Implementation
// ============================================================================
class AdvancedSignalProcessor extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.signals = new Map();
        this.fusedSignals = new Map();
        this.signalPatterns = new Map();
        this.threatSignals = new Map();
        this.memorySignals = new Map();
        this.socialSignals = new Map();
        this.fusionHistory = [];
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.patternRecognizer = new PatternRecognizer();
        this.threatDetector = new ThreatDetector();
        this.memoryIntegrator = new MemoryIntegrator();
        this.socialProcessor = new SocialProcessor();
    }
    /**
     * Process incoming signals with advanced fusion and analysis
     */
    async processSignals(signals) {
        const processedSignals = [];
        const newFusedSignals = [];
        const threatAssessments = [];
        for (const signal of signals) {
            // Add signal to storage
            this.signals.set(signal.id, signal);
            // Process based on type
            switch (signal.type) {
                case SignalType.INTRUSION:
                    const intrusionSignal = await this.processIntrusionSignal(signal);
                    if (intrusionSignal) {
                        this.threatSignals.set(signal.id, intrusionSignal);
                        processedSignals.push(intrusionSignal);
                    }
                    break;
                case SignalType.MEMORY:
                    const memorySignal = await this.processMemorySignal(signal);
                    if (memorySignal) {
                        this.memorySignals.set(signal.id, memorySignal);
                        processedSignals.push(memorySignal);
                    }
                    break;
                case SignalType.SOCIAL:
                    const socialSignal = await this.processSocialSignal(signal);
                    if (socialSignal) {
                        this.socialSignals.set(signal.id, socialSignal);
                        processedSignals.push(socialSignal);
                    }
                    break;
                default:
                    processedSignals.push(signal);
                    break;
            }
        }
        // Perform signal fusion
        if (this.config.enableAdvancedFusion) {
            const fusionResults = await this.performSignalFusion(processedSignals);
            newFusedSignals.push(...fusionResults);
        }
        // Detect patterns
        if (this.config.enablePatternRecognition) {
            await this.detectPatterns(processedSignals);
        }
        // Assess threats
        if (this.config.enableIntrusionDetection) {
            const threats = await this.assessThreats();
            threatAssessments.push(...threats);
        }
        // Clean up old signals
        this.cleanupOldSignals();
        return {
            processedSignals,
            fusedSignals: newFusedSignals,
            threatAssessments,
            patterns: Array.from(this.signalPatterns.values()),
        };
    }
    /**
     * Perform advanced signal fusion
     */
    async performSignalFusion(signals) {
        const fusedSignals = [];
        const signalGroups = this.groupSignalsForFusion(signals);
        for (const group of signalGroups) {
            if (group.length < 2)
                continue;
            const fusionMethod = this.selectFusionMethod(group);
            const fusedSignal = await this.fuseSignalGroup(group, fusionMethod);
            if (fusedSignal) {
                this.fusedSignals.set(fusedSignal.id, fusedSignal);
                fusedSignals.push(fusedSignal);
                // Record fusion
                const fusion = {
                    id: (0, uuid_1.v4)(),
                    method: fusionMethod,
                    signals: group.map((s) => s.id),
                    result: fusedSignal,
                    confidence: fusedSignal.fusionConfidence,
                    timestamp: Date.now(),
                    metadata: this.calculateFusionMetadata(group, fusedSignal),
                };
                this.fusionHistory.push(fusion);
            }
        }
        return fusedSignals;
    }
    /**
     * Group signals for fusion based on correlation
     */
    groupSignalsForFusion(signals) {
        const groups = [];
        const processed = new Set();
        for (const signal of signals) {
            if (processed.has(signal.id))
                continue;
            const group = [signal];
            processed.add(signal.id);
            // Find correlated signals
            for (const otherSignal of signals) {
                if (processed.has(otherSignal.id))
                    continue;
                const correlation = this.calculateCorrelation(signal, otherSignal);
                if (correlation >= this.config.fusionThreshold) {
                    group.push(otherSignal);
                    processed.add(otherSignal.id);
                }
            }
            if (group.length > 1) {
                groups.push(group);
            }
        }
        return groups;
    }
    /**
     * Calculate correlation between two signals
     */
    calculateCorrelation(signal1, signal2) {
        // Temporal correlation
        const timeDiff = Math.abs(signal1.timestamp - signal2.timestamp);
        const temporalCorrelation = Math.max(0, 1 - timeDiff / 60000); // 1 minute window
        // Spatial correlation
        const spatialCorrelation = signal1.metadata.location === signal2.metadata.location ? 1 : 0;
        // Type correlation
        const typeCorrelation = signal1.type === signal2.type ? 1 : 0.5;
        // Content correlation (simplified)
        const contentCorrelation = this.calculateContentSimilarity(signal1.data, signal2.data);
        // Weighted average
        return (temporalCorrelation * 0.3 +
            spatialCorrelation * 0.2 +
            typeCorrelation * 0.2 +
            contentCorrelation * 0.3);
    }
    /**
     * Calculate content similarity between signal data
     */
    calculateContentSimilarity(data1, data2) {
        // Simple similarity based on intensity and direction
        const intensityDiff = Math.abs(data1.intensity - data2.intensity);
        const directionMatch = data1.direction === data2.direction ? 1 : 0;
        return (1 - intensityDiff) * 0.7 + directionMatch * 0.3;
    }
    /**
     * Select appropriate fusion method for signal group
     */
    selectFusionMethod(signals) {
        const types = new Set(signals.map((s) => s.type));
        const sources = new Set(signals.map((s) => s.source));
        if (types.size === 1 && sources.size === 1) {
            return FusionMethod.WEIGHTED_AVERAGE;
        }
        else if (signals.length > 5) {
            return FusionMethod.NEURAL_NETWORK;
        }
        else if (types.has(SignalType.INTRUSION)) {
            return FusionMethod.BAYESIAN;
        }
        else {
            return FusionMethod.CORRELATION;
        }
    }
    /**
     * Fuse a group of signals using specified method
     */
    async fuseSignalGroup(signals, method) {
        switch (method) {
            case FusionMethod.WEIGHTED_AVERAGE:
                return this.weightedAverageFusion(signals);
            case FusionMethod.BAYESIAN:
                return this.bayesianFusion(signals);
            case FusionMethod.CORRELATION:
                return this.correlationFusion(signals);
            default:
                return this.weightedAverageFusion(signals);
        }
    }
    /**
     * Weighted average fusion method
     */
    weightedAverageFusion(signals) {
        const totalWeight = signals.reduce((sum, s) => sum + s.confidence, 0);
        const fusedData = {
            content: signals.map((s) => s.data.content).join('; '),
            intensity: signals.reduce((sum, s) => sum + s.data.intensity * s.confidence, 0) /
                totalWeight,
            direction: this.mostCommonDirection(signals),
            duration: Math.max(...signals.map((s) => s.data.duration)),
            frequency: signals.reduce((sum, s) => sum + s.data.frequency * s.confidence, 0) /
                totalWeight,
            amplitude: signals.reduce((sum, s) => sum + s.data.amplitude * s.confidence, 0) /
                totalWeight,
        };
        const fusedMetadata = {
            location: this.mostCommonLocation(signals),
            environment: this.mostCommonEnvironment(signals),
            socialContext: this.mostCommonSocialContext(signals),
            emotionalValence: signals.reduce((sum, s) => sum + s.metadata.emotionalValence * s.confidence, 0) / totalWeight,
            novelty: Math.max(...signals.map((s) => s.metadata.novelty)),
            relevance: signals.reduce((sum, s) => sum + s.metadata.relevance * s.confidence, 0) / totalWeight,
            reliability: signals.reduce((sum, s) => sum + s.metadata.reliability * s.confidence, 0) / totalWeight,
            tags: this.mergeTags(signals),
        };
        const fusionConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
        const correlationStrength = this.calculateGroupCorrelation(signals);
        return {
            id: (0, uuid_1.v4)(),
            type: this.determineFusedType(signals),
            source: this.determineFusedSource(signals),
            priority: Math.max(...signals.map((s) => s.priority)),
            urgency: Math.max(...signals.map((s) => s.urgency)),
            confidence: fusionConfidence,
            timestamp: Date.now(),
            data: fusedData,
            metadata: fusedMetadata,
            processed: true,
            fused: true,
            componentSignals: signals.map((s) => s.id),
            fusionMethod: FusionMethod.WEIGHTED_AVERAGE,
            fusionConfidence,
            correlationStrength,
            redundancyScore: this.calculateRedundancyScore(signals),
        };
    }
    /**
     * Bayesian fusion method
     */
    bayesianFusion(signals) {
        // Simplified Bayesian fusion
        const prior = 0.5;
        let posterior = prior;
        for (const signal of signals) {
            const likelihood = signal.confidence;
            posterior =
                (likelihood * prior) /
                    (likelihood * prior + (1 - likelihood) * (1 - prior));
        }
        const baseFused = this.weightedAverageFusion(signals);
        return {
            ...baseFused,
            fusionMethod: FusionMethod.BAYESIAN,
            fusionConfidence: posterior,
        };
    }
    /**
     * Correlation-based fusion method
     */
    correlationFusion(signals) {
        const correlations = [];
        for (let i = 0; i < signals.length; i++) {
            for (let j = i + 1; j < signals.length; j++) {
                correlations.push(this.calculateCorrelation(signals[i], signals[j]));
            }
        }
        const avgCorrelation = correlations.reduce((sum, c) => sum + c, 0) / correlations.length;
        const baseFused = this.weightedAverageFusion(signals);
        return {
            ...baseFused,
            fusionMethod: FusionMethod.CORRELATION,
            fusionConfidence: avgCorrelation,
            correlationStrength: avgCorrelation,
        };
    }
    /**
     * Process intrusion signals
     */
    async processIntrusionSignal(signal) {
        if (!this.config.enableIntrusionDetection) {
            return signal;
        }
        const processedSignal = await this.threatDetector.process(signal);
        if (processedSignal.threatLevel >= ThreatLevel.MEDIUM) {
            this.emit('threatDetected', processedSignal);
        }
        return processedSignal;
    }
    /**
     * Process memory signals
     */
    async processMemorySignal(signal) {
        if (!this.config.enableMemoryIntegration) {
            return signal;
        }
        return await this.memoryIntegrator.process(signal);
    }
    /**
     * Process social signals
     */
    async processSocialSignal(signal) {
        if (!this.config.enableSocialProcessing) {
            return signal;
        }
        return await this.socialProcessor.process(signal);
    }
    /**
     * Detect patterns in signals
     */
    async detectPatterns(signals) {
        const patterns = await this.patternRecognizer.detectPatterns(signals);
        for (const pattern of patterns) {
            this.signalPatterns.set(pattern.id, pattern);
            this.emit('patternDetected', pattern);
        }
    }
    /**
     * Assess threats from intrusion signals
     */
    async assessThreats() {
        const assessments = [];
        const threatGroups = this.groupThreatsByType();
        for (const [threatType, signals] of threatGroups) {
            const assessment = await this.threatDetector.assessThreats(signals);
            assessments.push(assessment);
        }
        return assessments;
    }
    /**
     * Group threats by type
     */
    groupThreatsByType() {
        const groups = new Map();
        for (const signal of this.threatSignals.values()) {
            const type = signal.threatType;
            if (!groups.has(type)) {
                groups.set(type, []);
            }
            groups.get(type).push(signal);
        }
        return groups;
    }
    /**
     * Clean up old signals
     */
    cleanupOldSignals() {
        const cutoffTime = Date.now() - 3600000; // 1 hour ago
        // Clean up regular signals
        for (const [id, signal] of this.signals) {
            if (signal.timestamp < cutoffTime) {
                this.signals.delete(id);
            }
        }
        // Clean up memory signals with decay
        for (const [id, signal] of this.memorySignals) {
            const age = Date.now() - signal.timestamp;
            const decayFactor = Math.pow(this.config.memoryDecayRate, age / 60000); // 1 minute intervals
            if (decayFactor < 0.1) {
                this.memorySignals.delete(id);
            }
        }
    }
    // ============================================================================
    // Helper Methods
    // ============================================================================
    mostCommonDirection(signals) {
        const counts = new Map();
        for (const signal of signals) {
            counts.set(signal.data.direction, (counts.get(signal.data.direction) || 0) + 1);
        }
        return Array.from(counts.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    }
    mostCommonLocation(signals) {
        const counts = new Map();
        for (const signal of signals) {
            counts.set(signal.metadata.location, (counts.get(signal.metadata.location) || 0) + 1);
        }
        return Array.from(counts.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    }
    mostCommonEnvironment(signals) {
        const counts = new Map();
        for (const signal of signals) {
            counts.set(signal.metadata.environment, (counts.get(signal.metadata.environment) || 0) + 1);
        }
        return Array.from(counts.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    }
    mostCommonSocialContext(signals) {
        const counts = new Map();
        for (const signal of signals) {
            counts.set(signal.metadata.socialContext, (counts.get(signal.metadata.socialContext) || 0) + 1);
        }
        return Array.from(counts.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    }
    mergeTags(signals) {
        const tagCounts = new Map();
        for (const signal of signals) {
            for (const tag of signal.metadata.tags) {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            }
        }
        return Array.from(tagCounts.entries())
            .filter(([_, count]) => count > signals.length / 2)
            .map(([tag, _]) => tag);
    }
    calculateGroupCorrelation(signals) {
        if (signals.length < 2)
            return 1;
        let totalCorrelation = 0;
        let correlationCount = 0;
        for (let i = 0; i < signals.length; i++) {
            for (let j = i + 1; j < signals.length; j++) {
                totalCorrelation += this.calculateCorrelation(signals[i], signals[j]);
                correlationCount++;
            }
        }
        return totalCorrelation / correlationCount;
    }
    calculateRedundancyScore(signals) {
        if (signals.length < 2)
            return 0;
        let redundancy = 0;
        for (let i = 0; i < signals.length; i++) {
            for (let j = i + 1; j < signals.length; j++) {
                const similarity = this.calculateContentSimilarity(signals[i].data, signals[j].data);
                redundancy += similarity;
            }
        }
        return redundancy / ((signals.length * (signals.length - 1)) / 2);
    }
    determineFusedType(signals) {
        const typeCounts = new Map();
        for (const signal of signals) {
            typeCounts.set(signal.type, (typeCounts.get(signal.type) || 0) + 1);
        }
        return Array.from(typeCounts.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    }
    determineFusedSource(signals) {
        const sourceCounts = new Map();
        for (const signal of signals) {
            sourceCounts.set(signal.source, (sourceCounts.get(signal.source) || 0) + 1);
        }
        return Array.from(sourceCounts.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    }
    calculateFusionMetadata(signals, fusedSignal) {
        const correlationMatrix = [];
        for (let i = 0; i < signals.length; i++) {
            const row = [];
            for (let j = 0; j < signals.length; j++) {
                row.push(this.calculateCorrelation(signals[i], signals[j]));
            }
            correlationMatrix.push(row);
        }
        const redundancyAnalysis = {
            redundantSignals: signals
                .filter((s) => s.metadata.relevance < 0.3)
                .map((s) => s.id),
            redundancyScore: fusedSignal.redundancyScore,
            informationGain: 1 - fusedSignal.redundancyScore,
            noiseReduction: Math.min(1, signals.length * 0.1),
        };
        const confidenceFactors = [
            {
                factor: 'signal_quality',
                weight: 0.4,
                value: fusedSignal.confidence,
                contribution: fusedSignal.confidence * 0.4,
            },
            {
                factor: 'correlation_strength',
                weight: 0.3,
                value: fusedSignal.correlationStrength,
                contribution: fusedSignal.correlationStrength * 0.3,
            },
            {
                factor: 'redundancy',
                weight: 0.2,
                value: 1 - fusedSignal.redundancyScore,
                contribution: (1 - fusedSignal.redundancyScore) * 0.2,
            },
            {
                factor: 'method_confidence',
                weight: 0.1,
                value: 0.8,
                contribution: 0.08,
            },
        ];
        return {
            correlationMatrix,
            redundancyAnalysis,
            confidenceFactors,
            fusionQuality: confidenceFactors.reduce((sum, f) => sum + f.contribution, 0),
        };
    }
    // ============================================================================
    // Public Interface
    // ============================================================================
    getSignals() {
        return Array.from(this.signals.values());
    }
    getFusedSignals() {
        return Array.from(this.fusedSignals.values());
    }
    getThreatSignals() {
        return Array.from(this.threatSignals.values());
    }
    getMemorySignals() {
        return Array.from(this.memorySignals.values());
    }
    getSocialSignals() {
        return Array.from(this.socialSignals.values());
    }
    getSignalPatterns() {
        return Array.from(this.signalPatterns.values());
    }
    getFusionHistory() {
        return [...this.fusionHistory];
    }
    getStats() {
        return {
            totalSignals: this.signals.size,
            fusedSignals: this.fusedSignals.size,
            threatSignals: this.threatSignals.size,
            memorySignals: this.memorySignals.size,
            socialSignals: this.socialSignals.size,
            patterns: this.signalPatterns.size,
            fusionHistory: this.fusionHistory.length,
        };
    }
}
exports.AdvancedSignalProcessor = AdvancedSignalProcessor;
// ============================================================================
// Helper Classes
// ============================================================================
class PatternRecognizer {
    async detectPatterns(signals) {
        const patterns = [];
        // Simple pattern detection based on signal frequency and timing
        const signalGroups = this.groupSignalsByType(signals);
        for (const [type, typeSignals] of signalGroups) {
            const frequency = this.calculateFrequency(typeSignals);
            if (frequency > 0.1) {
                // More than 1 signal per 10 minutes
                patterns.push({
                    id: (0, uuid_1.v4)(),
                    name: `${type}_pattern`,
                    description: `Frequent ${type} signals`,
                    signals: typeSignals.map((s) => s.id),
                    frequency,
                    confidence: 0.7,
                    significance: frequency * 0.8,
                    lastSeen: Math.max(...typeSignals.map((s) => s.timestamp)),
                    firstSeen: Math.min(...typeSignals.map((s) => s.timestamp)),
                    duration: this.calculateAverageDuration(typeSignals),
                });
            }
        }
        return patterns;
    }
    groupSignalsByType(signals) {
        const groups = new Map();
        for (const signal of signals) {
            if (!groups.has(signal.type)) {
                groups.set(signal.type, []);
            }
            groups.get(signal.type).push(signal);
        }
        return groups;
    }
    calculateFrequency(signals) {
        if (signals.length < 2)
            return 0;
        const timeSpan = Math.max(...signals.map((s) => s.timestamp)) -
            Math.min(...signals.map((s) => s.timestamp));
        return signals.length / (timeSpan / 60000); // signals per minute
    }
    calculateAverageDuration(signals) {
        return (signals.reduce((sum, s) => sum + s.data.duration, 0) / signals.length);
    }
}
class ThreatDetector {
    async process(signal) {
        // Enhance threat assessment
        const enhancedSignal = { ...signal };
        // Adjust threat level based on signal characteristics
        if (signal.data.intensity > 0.8) {
            enhancedSignal.threatLevel = ThreatLevel.HIGH;
        }
        else if (signal.data.intensity > 0.5) {
            enhancedSignal.threatLevel = ThreatLevel.MEDIUM;
        }
        // Set response urgency based on threat level and urgency
        enhancedSignal.responseUrgency =
            (signal.threatLevel === ThreatLevel.CRITICAL ? 1 : 0.5) * signal.urgency;
        return enhancedSignal;
    }
    async assessThreats(signals) {
        const overallThreat = signals.reduce((sum, s) => sum + s.data.intensity, 0) / signals.length;
        const responsePriority = Math.max(...signals.map((s) => s.responseUrgency));
        return {
            overallThreat,
            threatSignals: signals,
            threatPatterns: [],
            mitigationStrategies: this.generateMitigationStrategies(signals),
            responsePriority,
            confidence: signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length,
        };
    }
    generateMitigationStrategies(signals) {
        const strategies = [];
        for (const signal of signals) {
            strategies.push({
                id: (0, uuid_1.v4)(),
                name: `Mitigate ${signal.threatType}`,
                description: `Mitigation strategy for ${signal.threatType} threat`,
                threatTypes: [signal.threatType],
                effectiveness: 0.8,
                cost: 0.3,
                timeRequired: 5000, // 5 seconds
                prerequisites: [],
                sideEffects: ['Temporary performance impact'],
            });
        }
        return strategies;
    }
}
class MemoryIntegrator {
    async process(signal) {
        // Apply memory decay
        const age = Date.now() - signal.timestamp;
        const decayFactor = Math.pow(0.95, age / 60000); // 5% decay per minute
        return {
            ...signal,
            recallStrength: signal.recallStrength * decayFactor,
            emotionalImpact: signal.emotionalImpact * decayFactor,
        };
    }
}
class SocialProcessor {
    async process(signal) {
        // Enhance social signal processing
        const enhancedSignal = { ...signal };
        // Adjust trust level based on communication intent
        if (signal.communicationIntent === CommunicationIntent.FRIENDLY) {
            enhancedSignal.trustLevel = Math.min(1, signal.trustLevel + 0.1);
        }
        else if (signal.communicationIntent === CommunicationIntent.HOSTILE) {
            enhancedSignal.trustLevel = Math.max(0, signal.trustLevel - 0.2);
        }
        return enhancedSignal;
    }
}
//# sourceMappingURL=advanced-signal-processor.js.map