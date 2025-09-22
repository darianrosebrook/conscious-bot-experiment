/**
 * Advanced Signal Processor
 *
 * Implements complex signal fusion, intrusion detection, memory signal integration,
 * and social signal processing for sophisticated signal management in the conscious bot.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Core Types
// ============================================================================

export interface Signal {
  id: string;
  type: SignalType;
  source: SignalSource;
  priority: number; // 0-1
  urgency: number; // 0-1
  confidence: number; // 0-1
  timestamp: number;
  data: SignalData;
  metadata: SignalMetadata;
  processed: boolean;
  fused: boolean;
}

export interface SignalData {
  content: string;
  intensity: number; // 0-1
  direction: SignalDirection;
  duration: number; // milliseconds
  frequency: number; // Hz
  amplitude: number; // 0-1
  pattern?: string;
  context?: Record<string, any>;
}

export interface SignalMetadata {
  location: string;
  environment: string;
  socialContext: string;
  emotionalValence: number; // -1 to 1
  novelty: number; // 0-1
  relevance: number; // 0-1
  reliability: number; // 0-1
  tags: string[];
}

export interface FusedSignal extends Signal {
  componentSignals: string[]; // IDs of signals that were fused
  fusionMethod: FusionMethod;
  fusionConfidence: number; // 0-1
  correlationStrength: number; // 0-1
  redundancyScore: number; // 0-1
}

export interface IntrusionSignal extends Signal {
  threatLevel: ThreatLevel;
  threatType: ThreatType;
  sourceIdentity?: string;
  attackVector?: string;
  mitigationRequired: boolean;
  responseUrgency: number; // 0-1
}

export interface MemorySignal extends Signal {
  memoryType: MemoryType;
  recallStrength: number; // 0-1
  emotionalImpact: number; // -1 to 1
  learningValue: number; // 0-1
  decayRate: number; // 0-1
  associations: string[];
}

export interface SocialSignal extends Signal {
  socialType: SocialSignalType;
  agentId?: string;
  relationshipStrength: number; // 0-1
  trustLevel: number; // 0-1
  cooperationLevel: number; // 0-1
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
  fusionQuality: number; // 0-1
}

export interface RedundancyAnalysis {
  redundantSignals: string[];
  redundancyScore: number; // 0-1
  informationGain: number; // 0-1
  noiseReduction: number; // 0-1
}

export interface ConfidenceFactor {
  factor: string;
  weight: number; // 0-1
  value: number; // 0-1
  contribution: number; // 0-1
}

export interface SignalPattern {
  id: string;
  name: string;
  description: string;
  signals: string[];
  frequency: number; // occurrences per minute
  confidence: number; // 0-1
  significance: number; // 0-1
  lastSeen: number;
  firstSeen: number;
  duration: number; // average duration in milliseconds
}

export interface ThreatAssessment {
  overallThreat: number; // 0-1
  threatSignals: IntrusionSignal[];
  threatPatterns: SignalPattern[];
  mitigationStrategies: MitigationStrategy[];
  responsePriority: number; // 0-1
  confidence: number; // 0-1
}

export interface MitigationStrategy {
  id: string;
  name: string;
  description: string;
  threatTypes: ThreatType[];
  effectiveness: number; // 0-1
  cost: number; // 0-1
  timeRequired: number; // milliseconds
  prerequisites: string[];
  sideEffects: string[];
}

export enum SignalType {
  HOMEOSTATIC = 'homeostatic',
  INTRUSION = 'intrusion',
  MEMORY = 'memory',
  SOCIAL = 'social',
  ENVIRONMENTAL = 'environmental',
  COGNITIVE = 'cognitive',
  EMOTIONAL = 'emotional',
  PHYSICAL = 'physical',
}

export enum SignalSource {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
  SOCIAL = 'social',
  ENVIRONMENTAL = 'environmental',
  COGNITIVE = 'cognitive',
  MEMORY = 'memory',
}

export enum SignalDirection {
  INCOMING = 'incoming',
  OUTGOING = 'outgoing',
  BIDIRECTIONAL = 'bidirectional',
  INTERNAL = 'internal',
}

export enum FusionMethod {
  WEIGHTED_AVERAGE = 'weighted_average',
  BAYESIAN = 'bayesian',
  DEMPSTER_SHAFER = 'dempster_shafer',
  FUZZY_LOGIC = 'fuzzy_logic',
  NEURAL_NETWORK = 'neural_network',
  CORRELATION = 'correlation',
  TEMPORAL = 'temporal',
  SPATIAL = 'spatial',
}

export enum ThreatLevel {
  NONE = 'none',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ThreatType {
  PHYSICAL = 'physical',
  SOCIAL = 'social',
  COGNITIVE = 'cognitive',
  ENVIRONMENTAL = 'environmental',
  RESOURCE = 'resource',
  INFORMATION = 'information',
}

export enum MemoryType {
  EXPERIENCE = 'experience',
  KNOWLEDGE = 'knowledge',
  EMOTIONAL = 'emotional',
  PROCEDURAL = 'procedural',
  EPISODIC = 'episodic',
  SEMANTIC = 'semantic',
}

export enum SocialSignalType {
  COMMUNICATION = 'communication',
  GESTURE = 'gesture',
  EMOTION = 'emotion',
  INTENTION = 'intention',
  THREAT = 'threat',
  COOPERATION = 'cooperation',
  COMPETITION = 'competition',
}

export enum CommunicationIntent {
  FRIENDLY = 'friendly',
  HOSTILE = 'hostile',
  NEUTRAL = 'neutral',
  COOPERATIVE = 'cooperative',
  COMPETITIVE = 'competitive',
  INFORMATIVE = 'informative',
  PERSUASIVE = 'persuasive',
}

// ============================================================================
// Configuration
// ============================================================================

export interface AdvancedSignalProcessorConfig {
  maxSignals: number;
  fusionThreshold: number; // 0-1, minimum correlation for fusion
  threatThreshold: number; // 0-1, minimum threat level to trigger response
  memoryDecayRate: number; // 0-1, how quickly memory signals decay
  socialTrustThreshold: number; // 0-1, minimum trust for social signals
  enableAdvancedFusion: boolean;
  enableIntrusionDetection: boolean;
  enableMemoryIntegration: boolean;
  enableSocialProcessing: boolean;
  enablePatternRecognition: boolean;
}

const DEFAULT_CONFIG: AdvancedSignalProcessorConfig = {
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

export class AdvancedSignalProcessor extends EventEmitter {
  private config: AdvancedSignalProcessorConfig;
  private signals: Map<string, Signal> = new Map();
  private fusedSignals: Map<string, FusedSignal> = new Map();
  private signalPatterns: Map<string, SignalPattern> = new Map();
  private threatSignals: Map<string, IntrusionSignal> = new Map();
  private memorySignals: Map<string, MemorySignal> = new Map();
  private socialSignals: Map<string, SocialSignal> = new Map();
  private fusionHistory: SignalFusion[] = [];
  private patternRecognizer: PatternRecognizer;
  private threatDetector: ThreatDetector;
  private memoryIntegrator: MemoryIntegrator;
  private socialProcessor: SocialProcessor;

  constructor(config: Partial<AdvancedSignalProcessorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.patternRecognizer = new PatternRecognizer();
    this.threatDetector = new ThreatDetector();
    this.memoryIntegrator = new MemoryIntegrator();
    this.socialProcessor = new SocialProcessor();
  }

  /**
   * Process incoming signals with advanced fusion and analysis
   */
  async processSignals(signals: Signal[]): Promise<ProcessedSignals> {
    const processedSignals: Signal[] = [];
    const newFusedSignals: FusedSignal[] = [];
    const threatAssessments: ThreatAssessment[] = [];

    for (const signal of signals) {
      // Add signal to storage
      this.signals.set(signal.id, signal);

      // Process based on type
      switch (signal.type) {
        case SignalType.INTRUSION:
          const intrusionSignal = await this.processIntrusionSignal(
            signal as IntrusionSignal
          );
          if (intrusionSignal) {
            this.threatSignals.set(signal.id, intrusionSignal);
            processedSignals.push(intrusionSignal);
          }
          break;

        case SignalType.MEMORY:
          const memorySignal = await this.processMemorySignal(
            signal as MemorySignal
          );
          if (memorySignal) {
            this.memorySignals.set(signal.id, memorySignal);
            processedSignals.push(memorySignal);
          }
          break;

        case SignalType.SOCIAL:
          const socialSignal = await this.processSocialSignal(
            signal as SocialSignal
          );
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
  private async performSignalFusion(signals: Signal[]): Promise<FusedSignal[]> {
    const fusedSignals: FusedSignal[] = [];
    const signalGroups = this.groupSignalsForFusion(signals);

    for (const group of signalGroups) {
      if (group.length < 2) continue;

      const fusionMethod = this.selectFusionMethod(group);
      const fusedSignal = await this.fuseSignalGroup(group, fusionMethod);

      if (fusedSignal) {
        this.fusedSignals.set(fusedSignal.id, fusedSignal);
        fusedSignals.push(fusedSignal);

        // Record fusion
        const fusion: SignalFusion = {
          id: uuidv4(),
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
  private groupSignalsForFusion(signals: Signal[]): Signal[][] {
    const groups: Signal[][] = [];
    const processed = new Set<string>();

    for (const signal of signals) {
      if (processed.has(signal.id)) continue;

      const group = [signal];
      processed.add(signal.id);

      // Find correlated signals
      for (const otherSignal of signals) {
        if (processed.has(otherSignal.id)) continue;

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
  private calculateCorrelation(signal1: Signal, signal2: Signal): number {
    // Temporal correlation
    const timeDiff = Math.abs(signal1.timestamp - signal2.timestamp);
    const temporalCorrelation = Math.max(0, 1 - timeDiff / 60000); // 1 minute window

    // Spatial correlation
    const spatialCorrelation =
      signal1.metadata.location === signal2.metadata.location ? 1 : 0;

    // Type correlation
    const typeCorrelation = signal1.type === signal2.type ? 1 : 0.5;

    // Content correlation (simplified)
    const contentCorrelation = this.calculateContentSimilarity(
      signal1.data,
      signal2.data
    );

    // Weighted average
    return (
      temporalCorrelation * 0.3 +
      spatialCorrelation * 0.2 +
      typeCorrelation * 0.2 +
      contentCorrelation * 0.3
    );
  }

  /**
   * Calculate content similarity between signal data
   */
  private calculateContentSimilarity(
    data1: SignalData,
    data2: SignalData
  ): number {
    // Simple similarity based on intensity and direction
    const intensityDiff = Math.abs(data1.intensity - data2.intensity);
    const directionMatch = data1.direction === data2.direction ? 1 : 0;

    return (1 - intensityDiff) * 0.7 + directionMatch * 0.3;
  }

  /**
   * Select appropriate fusion method for signal group
   */
  private selectFusionMethod(signals: Signal[]): FusionMethod {
    const types = new Set(signals.map((s) => s.type));
    const sources = new Set(signals.map((s) => s.source));

    if (types.size === 1 && sources.size === 1) {
      return FusionMethod.WEIGHTED_AVERAGE;
    } else if (signals.length > 5) {
      return FusionMethod.NEURAL_NETWORK;
    } else if (types.has(SignalType.INTRUSION)) {
      return FusionMethod.BAYESIAN;
    } else {
      return FusionMethod.CORRELATION;
    }
  }

  /**
   * Fuse a group of signals using specified method
   */
  private async fuseSignalGroup(
    signals: Signal[],
    method: FusionMethod
  ): Promise<FusedSignal | null> {
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
  private weightedAverageFusion(signals: Signal[]): FusedSignal {
    const totalWeight = signals.reduce((sum, s) => sum + s.confidence, 0);

    const fusedData: SignalData = {
      content: signals.map((s) => s.data.content).join('; '),
      intensity:
        signals.reduce((sum, s) => sum + s.data.intensity * s.confidence, 0) /
        totalWeight,
      direction: this.mostCommonDirection(signals),
      duration: Math.max(...signals.map((s) => s.data.duration)),
      frequency:
        signals.reduce((sum, s) => sum + s.data.frequency * s.confidence, 0) /
        totalWeight,
      amplitude:
        signals.reduce((sum, s) => sum + s.data.amplitude * s.confidence, 0) /
        totalWeight,
    };

    const fusedMetadata: SignalMetadata = {
      location: this.mostCommonLocation(signals),
      environment: this.mostCommonEnvironment(signals),
      socialContext: this.mostCommonSocialContext(signals),
      emotionalValence:
        signals.reduce(
          (sum, s) => sum + s.metadata.emotionalValence * s.confidence,
          0
        ) / totalWeight,
      novelty: Math.max(...signals.map((s) => s.metadata.novelty)),
      relevance:
        signals.reduce(
          (sum, s) => sum + s.metadata.relevance * s.confidence,
          0
        ) / totalWeight,
      reliability:
        signals.reduce(
          (sum, s) => sum + s.metadata.reliability * s.confidence,
          0
        ) / totalWeight,
      tags: this.mergeTags(signals),
    };

    const fusionConfidence =
      signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
    const correlationStrength = this.calculateGroupCorrelation(signals);

    return {
      id: uuidv4(),
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
  private bayesianFusion(signals: Signal[]): FusedSignal {
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
  private correlationFusion(signals: Signal[]): FusedSignal {
    const correlations = [];
    for (let i = 0; i < signals.length; i++) {
      for (let j = i + 1; j < signals.length; j++) {
        correlations.push(this.calculateCorrelation(signals[i], signals[j]));
      }
    }

    const avgCorrelation =
      correlations.reduce((sum, c) => sum + c, 0) / correlations.length;
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
  private async processIntrusionSignal(
    signal: IntrusionSignal
  ): Promise<IntrusionSignal | null> {
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
  private async processMemorySignal(
    signal: MemorySignal
  ): Promise<MemorySignal | null> {
    if (!this.config.enableMemoryIntegration) {
      return signal;
    }

    return await this.memoryIntegrator.process(signal);
  }

  /**
   * Process social signals
   */
  private async processSocialSignal(
    signal: SocialSignal
  ): Promise<SocialSignal | null> {
    if (!this.config.enableSocialProcessing) {
      return signal;
    }

    return await this.socialProcessor.process(signal);
  }

  /**
   * Detect patterns in signals
   */
  private async detectPatterns(signals: Signal[]): Promise<void> {
    const patterns = await this.patternRecognizer.detectPatterns(signals);

    for (const pattern of patterns) {
      this.signalPatterns.set(pattern.id, pattern);
      this.emit('patternDetected', pattern);
    }
  }

  /**
   * Assess threats from intrusion signals
   */
  private async assessThreats(): Promise<ThreatAssessment[]> {
    const assessments: ThreatAssessment[] = [];
    const threatGroups = this.groupThreatsByType();

    for (const [threatType, signals] of Array.from(threatGroups.entries())) {
      const assessment = await this.threatDetector.assessThreats(signals);
      assessments.push(assessment);
    }

    return assessments;
  }

  /**
   * Group threats by type
   */
  private groupThreatsByType(): Map<ThreatType, IntrusionSignal[]> {
    const groups = new Map<ThreatType, IntrusionSignal[]>();

    for (const signal of Array.from(this.threatSignals.values())) {
      const type = signal.threatType;
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      groups.get(type)!.push(signal);
    }

    return groups;
  }

  /**
   * Clean up old signals
   */
  private cleanupOldSignals(): void {
    const cutoffTime = Date.now() - 3600000; // 1 hour ago

    // Clean up regular signals
    for (const [id, signal] of Array.from(this.signals.entries())) {
      if (signal.timestamp < cutoffTime) {
        this.signals.delete(id);
      }
    }

    // Clean up memory signals with decay
    for (const [id, signal] of Array.from(this.memorySignals.entries())) {
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

  private mostCommonDirection(signals: Signal[]): SignalDirection {
    const counts = new Map<SignalDirection, number>();
    for (const signal of signals) {
      counts.set(
        signal.data.direction,
        (counts.get(signal.data.direction) || 0) + 1
      );
    }
    return Array.from(counts.entries()).reduce((a, b) =>
      a[1] > b[1] ? a : b
    )[0];
  }

  private mostCommonLocation(signals: Signal[]): string {
    const counts = new Map<string, number>();
    for (const signal of signals) {
      counts.set(
        signal.metadata.location,
        (counts.get(signal.metadata.location) || 0) + 1
      );
    }
    return Array.from(counts.entries()).reduce((a, b) =>
      a[1] > b[1] ? a : b
    )[0];
  }

  private mostCommonEnvironment(signals: Signal[]): string {
    const counts = new Map<string, number>();
    for (const signal of signals) {
      counts.set(
        signal.metadata.environment,
        (counts.get(signal.metadata.environment) || 0) + 1
      );
    }
    return Array.from(counts.entries()).reduce((a, b) =>
      a[1] > b[1] ? a : b
    )[0];
  }

  private mostCommonSocialContext(signals: Signal[]): string {
    const counts = new Map<string, number>();
    for (const signal of signals) {
      counts.set(
        signal.metadata.socialContext,
        (counts.get(signal.metadata.socialContext) || 0) + 1
      );
    }
    return Array.from(counts.entries()).reduce((a, b) =>
      a[1] > b[1] ? a : b
    )[0];
  }

  private mergeTags(signals: Signal[]): string[] {
    const tagCounts = new Map<string, number>();
    for (const signal of signals) {
      for (const tag of signal.metadata.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    return Array.from(tagCounts.entries())
      .filter(([_, count]) => count > signals.length / 2)
      .map(([tag, _]) => tag);
  }

  private calculateGroupCorrelation(signals: Signal[]): number {
    if (signals.length < 2) return 1;

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

  private calculateRedundancyScore(signals: Signal[]): number {
    if (signals.length < 2) return 0;

    let redundancy = 0;
    for (let i = 0; i < signals.length; i++) {
      for (let j = i + 1; j < signals.length; j++) {
        const similarity = this.calculateContentSimilarity(
          signals[i].data,
          signals[j].data
        );
        redundancy += similarity;
      }
    }

    return redundancy / ((signals.length * (signals.length - 1)) / 2);
  }

  private determineFusedType(signals: Signal[]): SignalType {
    const typeCounts = new Map<SignalType, number>();
    for (const signal of signals) {
      typeCounts.set(signal.type, (typeCounts.get(signal.type) || 0) + 1);
    }
    return Array.from(typeCounts.entries()).reduce((a, b) =>
      a[1] > b[1] ? a : b
    )[0];
  }

  private determineFusedSource(signals: Signal[]): SignalSource {
    const sourceCounts = new Map<SignalSource, number>();
    for (const signal of signals) {
      sourceCounts.set(
        signal.source,
        (sourceCounts.get(signal.source) || 0) + 1
      );
    }
    return Array.from(sourceCounts.entries()).reduce((a, b) =>
      a[1] > b[1] ? a : b
    )[0];
  }

  private calculateFusionMetadata(
    signals: Signal[],
    fusedSignal: FusedSignal
  ): FusionMetadata {
    const correlationMatrix = [];
    for (let i = 0; i < signals.length; i++) {
      const row = [];
      for (let j = 0; j < signals.length; j++) {
        row.push(this.calculateCorrelation(signals[i], signals[j]));
      }
      correlationMatrix.push(row);
    }

    const redundancyAnalysis: RedundancyAnalysis = {
      redundantSignals: signals
        .filter((s) => s.metadata.relevance < 0.3)
        .map((s) => s.id),
      redundancyScore: fusedSignal.redundancyScore,
      informationGain: 1 - fusedSignal.redundancyScore,
      noiseReduction: Math.min(1, signals.length * 0.1),
    };

    const confidenceFactors: ConfidenceFactor[] = [
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
      fusionQuality: confidenceFactors.reduce(
        (sum, f) => sum + f.contribution,
        0
      ),
    };
  }

  // ============================================================================
  // Public Interface
  // ============================================================================

  getSignals(): Signal[] {
    return Array.from(this.signals.values());
  }

  getFusedSignals(): FusedSignal[] {
    return Array.from(this.fusedSignals.values());
  }

  getThreatSignals(): IntrusionSignal[] {
    return Array.from(this.threatSignals.values());
  }

  getMemorySignals(): MemorySignal[] {
    return Array.from(this.memorySignals.values());
  }

  getSocialSignals(): SocialSignal[] {
    return Array.from(this.socialSignals.values());
  }

  getSignalPatterns(): SignalPattern[] {
    return Array.from(this.signalPatterns.values());
  }

  getFusionHistory(): SignalFusion[] {
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

// ============================================================================
// Helper Classes
// ============================================================================

class PatternRecognizer {
  async detectPatterns(signals: Signal[]): Promise<SignalPattern[]> {
    const patterns: SignalPattern[] = [];

    // Simple pattern detection based on signal frequency and timing
    const signalGroups = this.groupSignalsByType(signals);

    for (const [type, typeSignals] of Array.from(signalGroups.entries())) {
      const frequency = this.calculateFrequency(typeSignals);
      if (frequency > 0.1) {
        // More than 1 signal per 10 minutes
        patterns.push({
          id: uuidv4(),
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

  private groupSignalsByType(signals: Signal[]): Map<SignalType, Signal[]> {
    const groups = new Map<SignalType, Signal[]>();
    for (const signal of signals) {
      if (!groups.has(signal.type)) {
        groups.set(signal.type, []);
      }
      groups.get(signal.type)!.push(signal);
    }
    return groups;
  }

  private calculateFrequency(signals: Signal[]): number {
    if (signals.length < 2) return 0;
    const timeSpan =
      Math.max(...signals.map((s) => s.timestamp)) -
      Math.min(...signals.map((s) => s.timestamp));
    return signals.length / (timeSpan / 60000); // signals per minute
  }

  private calculateAverageDuration(signals: Signal[]): number {
    return (
      signals.reduce((sum, s) => sum + s.data.duration, 0) / signals.length
    );
  }
}

class ThreatDetector {
  async process(signal: IntrusionSignal): Promise<IntrusionSignal> {
    // Enhance threat assessment
    const enhancedSignal = { ...signal };

    // Adjust threat level based on signal characteristics
    if (signal.data.intensity > 0.8) {
      enhancedSignal.threatLevel = ThreatLevel.HIGH;
    } else if (signal.data.intensity > 0.5) {
      enhancedSignal.threatLevel = ThreatLevel.MEDIUM;
    }

    // Set response urgency based on threat level and urgency
    enhancedSignal.responseUrgency =
      (signal.threatLevel === ThreatLevel.CRITICAL ? 1 : 0.5) * signal.urgency;

    return enhancedSignal;
  }

  async assessThreats(signals: IntrusionSignal[]): Promise<ThreatAssessment> {
    const overallThreat =
      signals.reduce((sum, s) => sum + s.data.intensity, 0) / signals.length;
    const responsePriority = Math.max(...signals.map((s) => s.responseUrgency));

    return {
      overallThreat,
      threatSignals: signals,
      threatPatterns: [],
      mitigationStrategies: this.generateMitigationStrategies(signals),
      responsePriority,
      confidence:
        signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length,
    };
  }

  private generateMitigationStrategies(
    signals: IntrusionSignal[]
  ): MitigationStrategy[] {
    const strategies: MitigationStrategy[] = [];

    for (const signal of signals) {
      strategies.push({
        id: uuidv4(),
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
  async process(signal: MemorySignal): Promise<MemorySignal> {
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
  async process(signal: SocialSignal): Promise<SocialSignal> {
    // Enhance social signal processing
    const enhancedSignal = { ...signal };

    // Adjust trust level based on communication intent
    if (signal.communicationIntent === CommunicationIntent.FRIENDLY) {
      enhancedSignal.trustLevel = Math.min(1, signal.trustLevel + 0.1);
    } else if (signal.communicationIntent === CommunicationIntent.HOSTILE) {
      enhancedSignal.trustLevel = Math.max(0, signal.trustLevel - 0.2);
    }

    return enhancedSignal;
  }
}

// ============================================================================
// Additional Types
// ============================================================================

export interface ProcessedSignals {
  processedSignals: Signal[];
  fusedSignals: FusedSignal[];
  threatAssessments: ThreatAssessment[];
  patterns: SignalPattern[];
}
