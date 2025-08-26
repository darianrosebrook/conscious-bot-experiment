/**
 * Sensory Feedback Processor - Real-time feedback processing and learning
 *
 * Processes sensory feedback from motor actions to enable adaptive control
 * and predictive learning for embodied intelligence.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  ISensoryFeedbackProcessor,
  RawSensoryData,
  ProcessedFeedback,
  SensoryPrediction,
  ObservedOutcome,
  DiscrepancyAnalysis,
  SensorimotorConfig,
  validateProcessedFeedback,
} from './types';

export interface FeedbackProcessorEvents {
  'feedback-processed': [ProcessedFeedback];
  'discrepancy-detected': [DiscrepancyAnalysis];
  'learning-signal-generated': [{ actionId: string; learningWeight: number }];
  'pattern-recognized': [{ pattern: string; confidence: number }];
  'anomaly-detected': [{ anomaly: string; severity: number }];
}

/**
 * Feedback processing pipeline stage
 */
interface ProcessingStage {
  name: string;
  process: (data: any, actionId?: string) => any;
  latency: number;
  successRate: number;
}

/**
 * Learned feedback pattern
 */
interface FeedbackPattern {
  id: string;
  actionType: string;
  feedbackSignature: string;
  expectedOutcome: string;
  confidence: number;
  observationCount: number;
  lastSeen: number;
}

/**
 * Advanced sensory feedback processing system
 */
export class SensoryFeedbackProcessor
  extends EventEmitter<FeedbackProcessorEvents>
  implements ISensoryFeedbackProcessor
{
  private feedbackBuffer: RawSensoryData[] = [];
  private processingPipeline: ProcessingStage[] = [];
  private learnedPatterns = new Map<string, FeedbackPattern>();
  private predictionHistory = new Map<string, SensoryPrediction>();
  private processingMetrics = {
    totalProcessed: 0,
    averageLatency: 0,
    successRate: 1.0,
    patternMatchRate: 0.8,
  };

  constructor(private config: SensorimotorConfig) {
    super();

    this.initializeProcessingPipeline();
    this.startFeedbackProcessor();
  }

  /**
   * Process sensory feedback from recent motor actions
   */
  processFeedback(
    actionId: string,
    rawData: RawSensoryData
  ): ProcessedFeedback {
    const startTime = Date.now();

    try {
      // Add to buffer for temporal processing
      this.feedbackBuffer.push(rawData);
      this.maintainBufferSize();

      // Data preprocessing
      const filteredData = this.filterNoise(rawData);
      const alignedData = this.temporalAlignment(filteredData, actionId);

      // Feature extraction
      const relevantFeatures = this.extractRelevantFeatures(
        alignedData,
        actionId
      );
      const recognizedPatterns = this.recognizePatterns(relevantFeatures);

      // Feedback interpretation
      const interpretation = this.interpretFeedback(
        relevantFeatures,
        recognizedPatterns,
        actionId
      );

      // Learning signal generation
      const learningSignal = this.generateLearningSignal(
        interpretation,
        actionId
      );

      // Create processed feedback
      const processedFeedback: ProcessedFeedback = {
        actionId,
        feedbackType: this.classifyFeedbackType(interpretation),
        confidence: this.calculateFeedbackConfidence(
          interpretation,
          recognizedPatterns
        ),
        relevance: this.calculateRelevance(rawData, actionId),
        interpretation: {
          success: interpretation.success,
          accuracy: interpretation.accuracy,
          deviation: interpretation.deviation,
          unexpectedOutcomes: interpretation.unexpectedOutcomes || [],
        },
        learningSignal: learningSignal.adjustmentRequired
          ? {
              predictionError: learningSignal.predictionError,
              adjustmentRequired: learningSignal.adjustmentRequired,
              learningWeight: learningSignal.learningWeight,
            }
          : undefined,
        timestamp: Date.now(),
      };

      // Update metrics
      const processingLatency = Date.now() - startTime;
      this.updateProcessingMetrics(processingLatency, true);

      // Emit events
      this.emit('feedback-processed', processedFeedback);

      if (learningSignal.adjustmentRequired) {
        this.emit('learning-signal-generated', {
          actionId,
          learningWeight: learningSignal.learningWeight,
        });
      }

      return validateProcessedFeedback(processedFeedback);
    } catch (error) {
      const errorFeedback: ProcessedFeedback = {
        actionId,
        feedbackType: 'error_detection',
        confidence: 0,
        relevance: 0,
        interpretation: {
          success: false,
          unexpectedOutcomes: [
            `Feedback processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ],
        },
        timestamp: Date.now(),
      };

      this.updateProcessingMetrics(Date.now() - startTime, false);
      this.emit('feedback-processed', errorFeedback);

      return errorFeedback;
    }
  }

  /**
   * Detect discrepancies between expected and actual action outcomes
   */
  detectOutcomeDiscrepancies(
    prediction: SensoryPrediction,
    outcome: ObservedOutcome
  ): DiscrepancyAnalysis {
    const discrepancies: DiscrepancyAnalysis['majorDiscrepancies'] = [];
    let totalDiscrepancyMagnitude = 0;

    // Compare predicted vs actual outcomes
    for (const predictedOutcome of prediction.predictedOutcomes) {
      const actualOutcome = outcome.actualOutcomes.find(
        (ao) => ao.outcome === predictedOutcome.outcome
      );

      if (!actualOutcome) {
        if (predictedOutcome.probability > 0.5) {
          // False positive - predicted but didn't occur
          discrepancies.push({
            type: 'false_positive',
            description: `Predicted ${predictedOutcome.outcome} but it didn't occur`,
            severity: predictedOutcome.probability,
            potentialCauses: ['model_overconfidence', 'environmental_change'],
          });
          totalDiscrepancyMagnitude += predictedOutcome.probability;
        }
      } else {
        // Check timing discrepancies
        if (
          actualOutcome.timing &&
          Math.abs(actualOutcome.timing - predictedOutcome.timeToOutcome) > 100
        ) {
          discrepancies.push({
            type: 'timing_error',
            description: `Timing mismatch for ${predictedOutcome.outcome}`,
            severity: Math.min(
              1.0,
              Math.abs(actualOutcome.timing - predictedOutcome.timeToOutcome) /
                1000
            ),
            potentialCauses: ['temporal_model_error', 'execution_delay'],
          });
        }
      }
    }

    // Check for unexpected outcomes (false negatives)
    for (const actualOutcome of outcome.actualOutcomes) {
      const wasPredicted = prediction.predictedOutcomes.some(
        (po) => po.outcome === actualOutcome.outcome
      );

      if (!wasPredicted && actualOutcome.occurred) {
        discrepancies.push({
          type: 'false_negative',
          description: `Unexpected outcome: ${actualOutcome.outcome}`,
          severity: actualOutcome.intensity || 0.5,
          potentialCauses: ['incomplete_model', 'novel_situation'],
        });
        totalDiscrepancyMagnitude += actualOutcome.intensity || 0.5;
      }
    }

    // Calculate prediction accuracy
    const correctPredictions = prediction.predictedOutcomes.filter((po) =>
      outcome.actualOutcomes.some(
        (ao) => ao.outcome === po.outcome && ao.occurred
      )
    ).length;

    const predictionAccuracy =
      prediction.predictedOutcomes.length > 0
        ? correctPredictions / prediction.predictedOutcomes.length
        : 0;

    // Generate learning opportunities
    const learningOpportunities =
      this.generateLearningOpportunities(discrepancies);

    const analysis: DiscrepancyAnalysis = {
      actionId: prediction.actionId,
      predictionAccuracy,
      majorDiscrepancies: discrepancies,
      learningOpportunities,
      overallDiscrepancyMagnitude: totalDiscrepancyMagnitude,
      timestamp: Date.now(),
    };

    if (discrepancies.length > 0) {
      this.emit('discrepancy-detected', analysis);
    }

    return analysis;
  }

  /**
   * Integrate multi-modal sensory feedback
   */
  integrateMultimodalFeedback(
    visualFeedback: any,
    proprioceptiveFeedback: any,
    environmentalFeedback: any
  ): any {
    const integration: {
      timestamp: number;
      confidence: number;
      consensus: any;
      conflicts: string[];
      weightedOutcome: any;
    } = {
      timestamp: Date.now(),
      confidence: 0,
      consensus: {},
      conflicts: [],
      weightedOutcome: {},
    };

    // Weight each modality based on reliability and relevance
    const visualWeight = this.calculateModalityWeight(visualFeedback, 'visual');
    const proprioceptiveWeight = this.calculateModalityWeight(
      proprioceptiveFeedback,
      'proprioceptive'
    );
    const environmentalWeight = this.calculateModalityWeight(
      environmentalFeedback,
      'environmental'
    );

    const totalWeight =
      visualWeight + proprioceptiveWeight + environmentalWeight;

    if (totalWeight > 0) {
      integration.confidence = totalWeight / 3; // Normalized confidence

      // Integrate outcomes using weighted voting
      integration.weightedOutcome = this.weightedIntegration(
        {
          visual: { data: visualFeedback, weight: visualWeight },
          proprioceptive: {
            data: proprioceptiveFeedback,
            weight: proprioceptiveWeight,
          },
          environmental: {
            data: environmentalFeedback,
            weight: environmentalWeight,
          },
        },
        totalWeight
      );

      // Detect conflicts between modalities
      integration.conflicts = this.detectModalityConflicts([
        visualFeedback,
        proprioceptiveFeedback,
        environmentalFeedback,
      ]);
    }

    return integration;
  }

  /**
   * Learn from feedback patterns to improve future predictions
   */
  async learnFromFeedback(feedbackHistory: ProcessedFeedback[]): Promise<void> {
    try {
      // Extract learning patterns from feedback history
      const patterns = this.extractLearningPatterns(feedbackHistory);

      // Update learned patterns database
      for (const pattern of patterns) {
        const existingPattern = this.learnedPatterns.get(pattern.id);

        if (existingPattern) {
          // Update existing pattern
          existingPattern.confidence = this.updatePatternConfidence(
            existingPattern,
            pattern
          );
          existingPattern.observationCount++;
          existingPattern.lastSeen = Date.now();
        } else {
          // Add new pattern
          this.learnedPatterns.set(pattern.id, {
            ...pattern,
            observationCount: 1,
            lastSeen: Date.now(),
          });
        }
      }

      // Remove obsolete patterns
      this.pruneObsoletePatterns();

      // Update learning metrics
      this.updateLearningMetrics(patterns.length);
    } catch (error) {
      console.error('Feedback learning failed:', error);
    }
  }

  /**
   * Get processing statistics
   */
  getProcessingStatistics(): {
    totalProcessed: number;
    averageLatency: number;
    successRate: number;
    patternMatchRate: number;
    learnedPatterns: number;
    bufferUtilization: number;
  } {
    return {
      ...this.processingMetrics,
      learnedPatterns: this.learnedPatterns.size,
      bufferUtilization: this.feedbackBuffer.length / 100, // Assuming max buffer size of 100
    };
  }

  // ===== PRIVATE METHODS =====

  private initializeProcessingPipeline(): void {
    this.processingPipeline = [
      {
        name: 'noise_filtering',
        process: this.filterNoise.bind(this),
        latency: 5,
        successRate: 0.98,
      },
      {
        name: 'temporal_alignment',
        process: this.temporalAlignment.bind(this),
        latency: 10,
        successRate: 0.95,
      },
      {
        name: 'feature_extraction',
        process: this.extractRelevantFeatures.bind(this),
        latency: 15,
        successRate: 0.92,
      },
      {
        name: 'pattern_recognition',
        process: this.recognizePatterns.bind(this),
        latency: 20,
        successRate: 0.85,
      },
    ];
  }

  private startFeedbackProcessor(): void {
    const processingInterval =
      1000 / this.config.feedbackProcessing.processingFrequency;

    setInterval(() => {
      this.processBatchedFeedback();
      this.cleanupExpiredPredictions();
    }, processingInterval);
  }

  private filterNoise(data: RawSensoryData): RawSensoryData {
    // Simple noise filtering based on quality threshold
    if (data.quality < 0.3) {
      return {
        ...data,
        data: {},
        quality: 0,
      };
    }

    // Filter out obviously invalid data
    const filteredData = { ...data.data };
    Object.keys(filteredData).forEach((key) => {
      if (
        typeof filteredData[key] === 'number' &&
        !isFinite(filteredData[key])
      ) {
        delete filteredData[key];
      }
    });

    return {
      ...data,
      data: filteredData,
    };
  }

  private temporalAlignment(data: RawSensoryData, actionId?: string): any {
    // Find related data within temporal window
    const currentTime = data.timestamp;
    const temporalWindow = this.config.feedbackProcessing.bufferDuration;

    const relatedData = this.feedbackBuffer.filter(
      (bufferedData) =>
        Math.abs(bufferedData.timestamp - currentTime) <= temporalWindow &&
        bufferedData.source === data.source
    );

    return {
      primary: data,
      temporal_context: relatedData,
      actionId,
    };
  }

  private extractRelevantFeatures(alignedData: any, actionId?: string): any {
    const features = {
      actionId,
      primary_features: {},
      temporal_features: {},
      cross_modal_features: {},
    };

    // Extract primary features from main data
    const primaryData = alignedData.primary.data;
    features.primary_features = {
      magnitude: this.calculateMagnitude(primaryData),
      duration: alignedData.primary.latency || 0,
      quality: alignedData.primary.quality,
      source_reliability: this.getSourceReliability(alignedData.primary.source),
    };

    // Extract temporal features
    if (alignedData.temporal_context.length > 0) {
      features.temporal_features = {
        consistency: this.calculateTemporalConsistency(
          alignedData.temporal_context
        ),
        trend: this.calculateTrend(alignedData.temporal_context),
        stability: this.calculateStability(alignedData.temporal_context),
      };
    }

    return features;
  }

  private recognizePatterns(features: any): string[] {
    const recognizedPatterns: string[] = [];

    // Match against learned patterns
    for (const [patternId, pattern] of this.learnedPatterns) {
      const similarity = this.calculatePatternSimilarity(features, pattern);

      if (similarity > this.config.feedbackProcessing.confidenceThreshold) {
        recognizedPatterns.push(patternId);

        this.emit('pattern-recognized', {
          pattern: patternId,
          confidence: similarity,
        });
      }
    }

    // Detect anomalies (features that don't match any patterns)
    if (
      recognizedPatterns.length === 0 &&
      features.primary_features.magnitude > 0.7
    ) {
      this.emit('anomaly-detected', {
        anomaly: 'unrecognized_feedback_pattern',
        severity: features.primary_features.magnitude,
      });
    }

    return recognizedPatterns;
  }

  private interpretFeedback(
    features: any,
    patterns: string[],
    actionId: string
  ): {
    success: boolean;
    accuracy?: number;
    deviation?: number;
    unexpectedOutcomes?: string[];
  } {
    const interpretation = {
      success: true,
      accuracy: 1.0,
      deviation: 0,
      unexpectedOutcomes: [] as string[],
    };

    // Base interpretation on pattern matches
    if (patterns.length > 0) {
      const avgPatternConfidence = this.getAveragePatternConfidence(patterns);
      interpretation.accuracy = avgPatternConfidence;
      interpretation.success = avgPatternConfidence > 0.6;
    } else {
      // No pattern match - interpret based on features
      if (features.primary_features.magnitude > 0.8) {
        interpretation.unexpectedOutcomes.push(
          'high_magnitude_unrecognized_feedback'
        );
        interpretation.success = false;
      }
    }

    // Calculate deviation from expected
    const expectedMagnitude = this.getExpectedMagnitude(actionId);
    if (expectedMagnitude > 0) {
      interpretation.deviation = Math.abs(
        features.primary_features.magnitude - expectedMagnitude
      );
    }

    return interpretation;
  }

  private generateLearningSignal(
    interpretation: any,
    actionId: string
  ): {
    predictionError: number;
    adjustmentRequired: boolean;
    learningWeight: number;
  } {
    const predictionError = interpretation.deviation || 0;
    const adjustmentRequired = predictionError > 0.2 || !interpretation.success;
    const learningWeight = Math.min(1.0, predictionError * 2); // Scale learning weight

    return {
      predictionError,
      adjustmentRequired,
      learningWeight,
    };
  }

  private classifyFeedbackType(
    interpretation: any
  ): ProcessedFeedback['feedbackType'] {
    if (!interpretation.success) {
      return 'error_detection';
    }

    if (interpretation.accuracy && interpretation.accuracy < 0.8) {
      return 'performance_assessment';
    }

    if (
      interpretation.unexpectedOutcomes &&
      interpretation.unexpectedOutcomes.length > 0
    ) {
      return 'environmental_change';
    }

    if (interpretation.deviation && interpretation.deviation > 0.1) {
      return 'outcome_verification';
    }

    return 'action_confirmation';
  }

  private calculateFeedbackConfidence(
    interpretation: any,
    patterns: string[]
  ): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on pattern matches
    if (patterns.length > 0) {
      confidence += 0.3 * (patterns.length / this.learnedPatterns.size);
    }

    // Adjust based on interpretation quality
    if (interpretation.accuracy) {
      confidence = (confidence + interpretation.accuracy) / 2;
    }

    return Math.min(1.0, Math.max(0.0, confidence));
  }

  private calculateRelevance(data: RawSensoryData, actionId: string): number {
    // Simple relevance calculation based on data quality and timing
    let relevance = data.quality;

    // Higher relevance for more recent data
    const age = Date.now() - data.timestamp;
    const ageDecay = Math.exp(-age / 1000); // Exponential decay over 1 second
    relevance *= ageDecay;

    return Math.min(1.0, Math.max(0.0, relevance));
  }

  private maintainBufferSize(): void {
    const maxBufferSize = 100; // Keep last 100 items
    if (this.feedbackBuffer.length > maxBufferSize) {
      this.feedbackBuffer = this.feedbackBuffer.slice(-maxBufferSize);
    }
  }

  private processBatchedFeedback(): void {
    // Process any buffered feedback that requires batch processing
    if (this.feedbackBuffer.length > 10) {
      // Analyze trends across buffered data
      const trends = this.analyzeTrends(this.feedbackBuffer);
      if (trends.anomalies.length > 0) {
        for (const anomaly of trends.anomalies) {
          this.emit('anomaly-detected', anomaly);
        }
      }
    }
  }

  private cleanupExpiredPredictions(): void {
    const currentTime = Date.now();
    const maxAge = this.config.prediction.maxPredictionAge;

    for (const [actionId, prediction] of this.predictionHistory) {
      if (currentTime - prediction.timestamp > maxAge) {
        this.predictionHistory.delete(actionId);
      }
    }
  }

  private generateLearningOpportunities(
    discrepancies: DiscrepancyAnalysis['majorDiscrepancies']
  ): DiscrepancyAnalysis['learningOpportunities'] {
    const opportunities: DiscrepancyAnalysis['learningOpportunities'] = [];

    for (const discrepancy of discrepancies) {
      switch (discrepancy.type) {
        case 'false_positive':
          opportunities.push({
            modelComponent: 'outcome_probability_estimation',
            adjustmentType: 'reduce_confidence',
            expectedImprovement: discrepancy.severity * 0.7,
          });
          break;
        case 'false_negative':
          opportunities.push({
            modelComponent: 'outcome_detection',
            adjustmentType: 'expand_coverage',
            expectedImprovement: discrepancy.severity * 0.8,
          });
          break;
        case 'timing_error':
          opportunities.push({
            modelComponent: 'temporal_prediction',
            adjustmentType: 'timing_calibration',
            expectedImprovement: discrepancy.severity * 0.6,
          });
          break;
        case 'intensity_error':
          opportunities.push({
            modelComponent: 'intensity_estimation',
            adjustmentType: 'magnitude_calibration',
            expectedImprovement: discrepancy.severity * 0.5,
          });
          break;
      }
    }

    return opportunities;
  }

  private calculateModalityWeight(feedback: any, modality: string): number {
    if (!feedback) return 0;

    const baseWeights = {
      visual: 0.4,
      proprioceptive: 0.3,
      environmental: 0.3,
    };

    return baseWeights[modality as keyof typeof baseWeights] || 0.2;
  }

  private weightedIntegration(
    modalityData: Record<string, { data: any; weight: number }>,
    totalWeight: number
  ): any {
    const integrated: Record<string, number> = {};

    // Combine data using weighted average where applicable
    for (const [modality, { data, weight }] of Object.entries(modalityData)) {
      if (data && typeof data === 'object') {
        Object.keys(data).forEach((key) => {
          if (typeof data[key] === 'number') {
            integrated[key] =
              (integrated[key] || 0) + (data[key] * weight) / totalWeight;
          }
        });
      }
    }

    return integrated;
  }

  private detectModalityConflicts(feedbacks: any[]): string[] {
    const conflicts: string[] = [];

    // Simple conflict detection between boolean values
    for (let i = 0; i < feedbacks.length; i++) {
      for (let j = i + 1; j < feedbacks.length; j++) {
        if (feedbacks[i] && feedbacks[j]) {
          const conflict = this.compareModalityData(feedbacks[i], feedbacks[j]);
          if (conflict) {
            conflicts.push(conflict);
          }
        }
      }
    }

    return conflicts;
  }

  private compareModalityData(data1: any, data2: any): string | null {
    // Simple conflict detection logic
    if (
      data1.success !== undefined &&
      data2.success !== undefined &&
      data1.success !== data2.success
    ) {
      return 'success_status_conflict';
    }

    return null;
  }

  private extractLearningPatterns(
    feedbackHistory: ProcessedFeedback[]
  ): FeedbackPattern[] {
    const patterns: FeedbackPattern[] = [];

    // Group feedback by action type
    const groupedFeedback = this.groupFeedbackByActionType(feedbackHistory);

    for (const [actionType, feedbacks] of groupedFeedback) {
      if (feedbacks.length >= 3) {
        // Enough samples to identify a pattern
        const pattern = this.identifyPattern(actionType, feedbacks);
        if (pattern) {
          patterns.push(pattern);
        }
      }
    }

    return patterns;
  }

  private updateProcessingMetrics(latency: number, success: boolean): void {
    this.processingMetrics.totalProcessed++;

    // Update average latency
    this.processingMetrics.averageLatency =
      (this.processingMetrics.averageLatency *
        (this.processingMetrics.totalProcessed - 1) +
        latency) /
      this.processingMetrics.totalProcessed;

    // Update success rate
    const successCount = Math.floor(
      this.processingMetrics.successRate *
        (this.processingMetrics.totalProcessed - 1)
    );
    const newSuccessCount = successCount + (success ? 1 : 0);
    this.processingMetrics.successRate =
      newSuccessCount / this.processingMetrics.totalProcessed;
  }

  // Helper methods (simplified implementations)
  private calculateMagnitude(data: any): number {
    if (!data || typeof data !== 'object') return 0;

    const values = Object.values(data).filter(
      (v) => typeof v === 'number'
    ) as number[];
    if (values.length === 0) return 0;

    return Math.sqrt(values.reduce((sum, v) => sum + v * v, 0)) / values.length;
  }

  private getSourceReliability(source: string): number {
    const reliabilityMap = {
      visual: 0.8,
      auditory: 0.6,
      tactile: 0.9,
      proprioceptive: 0.95,
      environmental: 0.7,
    };
    return reliabilityMap[source as keyof typeof reliabilityMap] || 0.5;
  }

  private calculateTemporalConsistency(data: RawSensoryData[]): number {
    if (data.length < 2) return 1.0;

    const qualities = data.map((d) => d.quality);
    const variance = this.calculateVariance(qualities);
    return Math.max(0, 1 - variance);
  }

  private calculateTrend(data: RawSensoryData[]): number {
    if (data.length < 2) return 0;

    // Simple linear trend calculation
    const qualities = data.map((d) => d.quality);
    const n = qualities.length;
    const sumX = (n * (n + 1)) / 2;
    const sumY = qualities.reduce((sum, q) => sum + q, 0);
    const sumXY = qualities.reduce((sum, q, i) => sum + q * (i + 1), 0);
    const sumX2 = (n * (n + 1) * (2 * n + 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return Math.max(-1, Math.min(1, slope));
  }

  private calculateStability(data: RawSensoryData[]): number {
    if (data.length < 2) return 1.0;

    const qualities = data.map((d) => d.quality);
    const variance = this.calculateVariance(qualities);
    return Math.max(0, 1 - variance * 2); // Scale variance to stability measure
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map((v) => (v - mean) ** 2);
    return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
  }

  private calculatePatternSimilarity(
    features: any,
    pattern: FeedbackPattern
  ): number {
    // Simplified pattern similarity calculation
    const featureMagnitude = features.primary_features?.magnitude || 0;
    const patternMagnitude = 0.5; // Simplified reference magnitude

    const similarity = 1 - Math.abs(featureMagnitude - patternMagnitude);
    return Math.max(0, Math.min(1, similarity));
  }

  private getAveragePatternConfidence(patterns: string[]): number {
    if (patterns.length === 0) return 0;

    const confidences = patterns.map(
      (id) => this.learnedPatterns.get(id)?.confidence || 0
    );
    return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  }

  private getExpectedMagnitude(actionId: string): number {
    // Simplified expected magnitude lookup
    return 0.5; // Default expected magnitude
  }

  private updatePatternConfidence(
    existing: FeedbackPattern,
    newPattern: FeedbackPattern
  ): number {
    // Simple confidence update using exponential moving average
    const alpha = 0.1; // Learning rate
    return alpha * newPattern.confidence + (1 - alpha) * existing.confidence;
  }

  private pruneObsoletePatterns(): void {
    const currentTime = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [id, pattern] of this.learnedPatterns) {
      if (
        currentTime - pattern.lastSeen > maxAge &&
        pattern.observationCount < 5
      ) {
        this.learnedPatterns.delete(id);
      }
    }
  }

  private updateLearningMetrics(newPatternsCount: number): void {
    // Update pattern match rate based on new patterns learned
    if (newPatternsCount > 0) {
      this.processingMetrics.patternMatchRate = Math.min(
        1.0,
        this.processingMetrics.patternMatchRate + 0.01
      );
    }
  }

  private analyzeTrends(buffer: RawSensoryData[]): {
    anomalies: Array<{ anomaly: string; severity: number }>;
  } {
    const anomalies: Array<{ anomaly: string; severity: number }> = [];

    // Check for quality degradation trend
    const recentQualities = buffer.slice(-10).map((d) => d.quality);
    const trend = this.calculateTrend(buffer.slice(-10));

    if (trend < -0.5) {
      anomalies.push({
        anomaly: 'feedback_quality_degradation',
        severity: Math.abs(trend),
      });
    }

    return { anomalies };
  }

  private groupFeedbackByActionType(
    feedbacks: ProcessedFeedback[]
  ): Map<string, ProcessedFeedback[]> {
    const grouped = new Map<string, ProcessedFeedback[]>();

    for (const feedback of feedbacks) {
      const actionType = feedback.actionId.split('_')[0] || 'unknown';

      if (!grouped.has(actionType)) {
        grouped.set(actionType, []);
      }

      grouped.get(actionType)!.push(feedback);
    }

    return grouped;
  }

  private identifyPattern(
    actionType: string,
    feedbacks: ProcessedFeedback[]
  ): FeedbackPattern | null {
    if (feedbacks.length < 3) return null;

    // Create a simple pattern based on feedback characteristics
    const avgConfidence =
      feedbacks.reduce((sum, f) => sum + f.confidence, 0) / feedbacks.length;
    const successRate =
      feedbacks.filter((f) => f.interpretation.success).length /
      feedbacks.length;

    if (avgConfidence > 0.6 && successRate > 0.7) {
      return {
        id: `${actionType}_success_pattern`,
        actionType,
        feedbackSignature: `high_confidence_success`,
        expectedOutcome: 'successful_action_completion',
        confidence: avgConfidence,
        observationCount: feedbacks.length,
        lastSeen: Date.now(),
      };
    }

    return null;
  }
}
