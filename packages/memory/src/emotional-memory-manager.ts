/**
 * Emotional Memory Manager
 *
 * Tracks emotional responses, patterns, and triggers to enable
 * sophisticated emotional reasoning and response optimization.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';
import { EmotionalState } from './types';

// Re-export for backward compatibility
export type { EmotionalState } from './types';

// ============================================================================
// Advanced Emotional State Interface
// ============================================================================

/**
 * Advanced emotional state interface for sophisticated emotional reasoning
 */
export interface AdvancedEmotionalState {
  id: string;
  primaryEmotion:
    | 'happy'
    | 'sad'
    | 'angry'
    | 'fearful'
    | 'surprised'
    | 'disgusted'
    | 'neutral'
    | 'excited'
    | 'anxious'
    | 'content';
  intensity: number; // 0-1
  secondaryEmotions: Array<{
    emotion: string;
    intensity: number;
  }>;
  triggers: string[]; // What caused this emotional state
  context: string; // Situation context
  timestamp: number;
  duration?: number; // How long the state lasted
  outcome?: string; // What happened as a result
  copingStrategies?: string[]; // What strategies were used
  effectiveness?: number; // 0-1 effectiveness of coping strategies
}

// ============================================================================
// Conversion Utilities
// ============================================================================

/**
 * Convert simple EmotionalState to AdvancedEmotionalState
 */
export function toAdvancedEmotionalState(
  simple: EmotionalState,
  options: {
    id?: string;
    primaryEmotion?: AdvancedEmotionalState['primaryEmotion'];
    triggers?: string[];
    context?: string;
  } = {}
): AdvancedEmotionalState {
  const { id, primaryEmotion, triggers = [], context = '' } = options;

  return {
    id: id || `simple-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    primaryEmotion: primaryEmotion || 'neutral',
    intensity: Math.max(
      simple.satisfaction,
      simple.excitement,
      1 - simple.frustration
    ),
    secondaryEmotions: [
      { emotion: 'satisfaction', intensity: simple.satisfaction },
      { emotion: 'excitement', intensity: simple.excitement },
      { emotion: 'frustration', intensity: simple.frustration },
      { emotion: 'curiosity', intensity: simple.curiosity },
      { emotion: 'confidence', intensity: simple.confidence },
    ].filter((e) => e.intensity > 0),
    triggers,
    context,
    timestamp: simple.timestamp,
  };
}

/**
 * Convert AdvancedEmotionalState to simple EmotionalState
 */
export function toSimpleEmotionalState(
  advanced: AdvancedEmotionalState
): EmotionalState {
  const satisfaction =
    advanced.secondaryEmotions?.find((e) => e.emotion === 'satisfaction')
      ?.intensity || 0.5;
  const excitement =
    advanced.secondaryEmotions?.find((e) => e.emotion === 'excitement')
      ?.intensity || 0.3;
  const frustration =
    advanced.secondaryEmotions?.find((e) => e.emotion === 'frustration')
      ?.intensity || 0.1;
  const curiosity =
    advanced.secondaryEmotions?.find((e) => e.emotion === 'curiosity')
      ?.intensity || 0.4;
  const confidence =
    advanced.secondaryEmotions?.find((e) => e.emotion === 'confidence')
      ?.intensity || 0.5;

  return {
    satisfaction,
    frustration,
    excitement,
    curiosity,
    confidence,
    timestamp: advanced.timestamp,
  };
}

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface EmotionalPattern {
  id: string;
  name: string;
  triggerPattern: {
    situationType: string;
    contextElements: string[];
    timeOfDay?: string;
    locationType?: string;
  };
  emotionalResponse: {
    primaryEmotion: string;
    expectedIntensity: number;
    commonSecondaryEmotions: string[];
  };
  frequency: number;
  lastTriggered: number;
  averageDuration: number;
  typicalOutcomes: Array<{
    outcome: string;
    frequency: number;
  }>;
  copingEffectiveness: number;
  confidence: number; // How predictable this pattern is
}

export interface EmotionalTrigger {
  id: string;
  name: string;
  category: 'social' | 'environmental' | 'task' | 'physiological' | 'cognitive';
  description: string;
  emotionalImpact: {
    primaryEmotion: string;
    intensityRange: { min: number; max: number };
    probability: number; // 0-1 likelihood of triggering
  };
  contextFactors: string[];
  frequency: number;
  lastTriggered: number;
  avoidanceStrategies?: string[];
  copingStrategies?: string[];
}

export interface EmotionalMemoryConfig {
  enabled: boolean;
  maxEmotionalStates: number;
  maxPatterns: number;
  patternSignificanceThreshold: number;
  emotionalRetentionDays: number;
  patternLearningEnabled: boolean;
  triggerAnalysisEnabled: boolean;
  emotionalRegulationEnabled: boolean;
  moodTrackingEnabled: boolean;
}

export const DEFAULT_EMOTIONAL_MEMORY_CONFIG: Partial<EmotionalMemoryConfig> = {
  enabled: true,
  maxEmotionalStates: 1000,
  maxPatterns: 200,
  patternSignificanceThreshold: 0.3,
  emotionalRetentionDays: 30,
  patternLearningEnabled: true,
  triggerAnalysisEnabled: true,
  emotionalRegulationEnabled: true,
  moodTrackingEnabled: true,
};

// ============================================================================
// Emotional Memory Manager
// ============================================================================

export class EmotionalMemoryManager {
  private config: Required<EmotionalMemoryConfig>;
  private emotionalStates: AdvancedEmotionalState[] = [];
  private patterns: EmotionalPattern[] = [];
  private triggers: EmotionalTrigger[] = [];
  private lastCleanup: number = 0;
  private currentMood: {
    primaryEmotion: string;
    intensity: number;
    stability: number; // 0-1 how stable the mood is
    lastUpdated: number;
  } | null = null;

  constructor(config: Partial<EmotionalMemoryConfig> = {}) {
    this.config = {
      ...DEFAULT_EMOTIONAL_MEMORY_CONFIG,
      ...config,
    } as Required<EmotionalMemoryConfig>;
  }

  /**
   * Record an emotional state
   */
  async recordEmotionalState(
    state: Omit<AdvancedEmotionalState, 'id' | 'timestamp'>
  ): Promise<void> {
    if (!this.config.enabled) return;

    const fullState: AdvancedEmotionalState = {
      id: this.generateId(),
      timestamp: Date.now(),
      ...state,
    };

    this.emotionalStates.push(fullState);

    // Update current mood
    if (this.config.moodTrackingEnabled) {
      await this.updateCurrentMood(fullState);
    }

    // Learn patterns if enabled
    if (this.config.patternLearningEnabled) {
      await this.learnEmotionalPatterns(fullState);
    }

    // Analyze triggers if enabled
    if (this.config.triggerAnalysisEnabled) {
      await this.analyzeTriggers(fullState);
    }

    // Clean up periodically
    if (this.emotionalStates.length > this.config.maxEmotionalStates) {
      await this.cleanupOldStates();
    }

    console.log(
      `💭 Recorded emotional state: ${fullState.primaryEmotion} (${(fullState.intensity * 100).toFixed(0)}%) - ${fullState.triggers.join(', ')}`
    );
  }

  /**
   * Get emotional recommendations for a situation
   */
  async getEmotionalRecommendations(
    situation: {
      type: string;
      context: string;
      currentEmotionalState?: string;
      timeOfDay?: string;
      location?: string;
    },
    limit: number = 5
  ): Promise<
    Array<{
      strategy: string;
      confidence: number;
      reasoning: string;
      expectedEffectiveness: number;
      emotionalOutcome: string;
    }>
  > {
    if (!this.config.enabled) return [];

    const recommendations = [];

    // Get relevant patterns
    const relevantPatterns = this.getRelevantPatterns(situation);

    // Generate recommendations based on patterns
    for (const pattern of relevantPatterns.slice(0, 3)) {
      const strategies = this.generateCopingStrategies(pattern, situation);
      recommendations.push(...strategies);
    }

    // Add general emotional regulation strategies
    if (this.config.emotionalRegulationEnabled) {
      const regulationStrategies =
        this.getEmotionalRegulationStrategies(situation);
      recommendations.push(...regulationStrategies);
    }

    return recommendations
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  /**
   * Analyze emotional triggers in a situation
   */
  async analyzeEmotionalTriggers(situation: {
    context: string;
    entities?: string[];
    environment?: string;
    currentActivity?: string;
  }): Promise<
    Array<{
      trigger: EmotionalTrigger;
      probability: number;
      potentialImpact: number;
      recommendedActions: string[];
    }>
  > {
    if (!this.config.enabled || !this.config.triggerAnalysisEnabled) return [];

    const analysis = this.triggers
      .map((trigger) => {
        const probability = this.calculateTriggerProbability(
          trigger,
          situation
        );
        const potentialImpact = this.calculateEmotionalImpact(
          trigger,
          situation
        );

        return {
          trigger,
          probability,
          potentialImpact,
          recommendedActions: this.getTriggerAvoidanceStrategies(
            trigger,
            situation
          ),
        };
      })
      .filter((analysis) => analysis.probability > 0.3)
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);

    return analysis;
  }

  /**
   * Get emotional insights for reflection
   */
  async getEmotionalInsights(timeRange?: {
    start: number;
    end: number;
  }): Promise<{
    emotionalTrends: Array<{
      emotion: string;
      frequency: number;
      averageIntensity: number;
      trend: 'increasing' | 'decreasing' | 'stable';
    }>;
    commonTriggers: Array<{
      trigger: string;
      frequency: number;
      mostCommonEmotion: string;
    }>;
    effectiveCopingStrategies: Array<{
      strategy: string;
      effectiveness: number;
      usageCount: number;
    }>;
    moodStability: number;
    emotionalHealthScore: number;
  }> {
    if (!this.config.enabled)
      return {
        emotionalTrends: [],
        commonTriggers: [],
        effectiveCopingStrategies: [],
        moodStability: 0,
        emotionalHealthScore: 0,
      };

    const states = timeRange
      ? this.emotionalStates.filter(
          (s) => s.timestamp >= timeRange.start && s.timestamp <= timeRange.end
        )
      : this.emotionalStates;

    const emotionalTrends = this.calculateEmotionalTrends(states);
    const commonTriggers = this.identifyCommonTriggers(states);
    const effectiveCopingStrategies = this.evaluateCopingStrategies(states);
    const moodStability = this.calculateMoodStability(states);

    const emotionalHealthScore = this.calculateEmotionalHealthScore(
      states,
      moodStability
    );

    return {
      emotionalTrends,
      commonTriggers,
      effectiveCopingStrategies,
      moodStability,
      emotionalHealthScore,
    };
  }

  /**
   * Learn emotional patterns from states
   */
  private async learnEmotionalPatterns(
    state: AdvancedEmotionalState
  ): Promise<void> {
    // Look for similar situations to create or update patterns
    const similarStates = this.emotionalStates.filter(
      (s) =>
        s.context === state.context ||
        (s.triggers.some((t) => state.triggers.includes(t)) &&
          s.primaryEmotion === state.primaryEmotion)
    );

    if (similarStates.length >= 2) {
      const pattern: EmotionalPattern = {
        id: this.generateId(),
        name: `${state.primaryEmotion} in ${state.context}`,
        triggerPattern: {
          situationType: state.context,
          contextElements: state.triggers,
        },
        emotionalResponse: {
          primaryEmotion: state.primaryEmotion,
          expectedIntensity: state.intensity,
          commonSecondaryEmotions: state.secondaryEmotions.map(
            (s) => s.emotion
          ),
        },
        frequency: similarStates.length,
        lastTriggered: state.timestamp,
        averageDuration:
          similarStates.reduce((sum, s) => sum + (s.duration || 0), 0) /
            similarStates.length || 0,
        typicalOutcomes: this.calculateTypicalOutcomes(similarStates),
        copingEffectiveness:
          this.calculatePatternCopingEffectiveness(similarStates),
        confidence: Math.min(1, similarStates.length / 5), // Confidence increases with frequency
      };

      this.patterns.push(pattern);
    }
  }

  /**
   * Analyze triggers from emotional state
   */
  private async analyzeTriggers(state: AdvancedEmotionalState): Promise<void> {
    for (const trigger of state.triggers) {
      let existingTrigger = this.triggers.find((t) => t.name === trigger);

      if (!existingTrigger) {
        existingTrigger = {
          id: this.generateId(),
          name: trigger,
          category: this.categorizeTrigger(trigger),
          description: `Trigger: ${trigger}`,
          emotionalImpact: {
            primaryEmotion: state.primaryEmotion,
            intensityRange: {
              min: state.intensity * 0.8,
              max: state.intensity * 1.2,
            },
            probability: 0.5,
          },
          contextFactors: [state.context],
          frequency: 1,
          lastTriggered: state.timestamp,
        };
        this.triggers.push(existingTrigger);
      } else {
        // Update existing trigger
        existingTrigger.frequency++;
        existingTrigger.lastTriggered = state.timestamp;
        existingTrigger.emotionalImpact.probability = Math.min(
          1,
          existingTrigger.frequency / 10
        );
        existingTrigger.contextFactors.push(state.context);
      }
    }
  }

  /**
   * Update current mood based on emotional state
   */
  private async updateCurrentMood(
    state: AdvancedEmotionalState
  ): Promise<void> {
    const now = Date.now();
    const timeWeight = Math.exp(-(now - state.timestamp) / (1000 * 60 * 60)); // Decay over hours

    if (!this.currentMood) {
      this.currentMood = {
        primaryEmotion: state.primaryEmotion,
        intensity: state.intensity * timeWeight,
        stability: 0.5, // Initial stability
        lastUpdated: now,
      };
    } else {
      // Blend with existing mood
      const blendFactor = timeWeight;
      const oldIntensity = this.currentMood.intensity * (1 - blendFactor);
      const newIntensity = state.intensity * blendFactor;

      this.currentMood.primaryEmotion = this.blendEmotions(
        this.currentMood.primaryEmotion,
        state.primaryEmotion,
        blendFactor
      );
      this.currentMood.intensity = oldIntensity + newIntensity;
      this.currentMood.stability = this.calculateMoodStability(
        this.emotionalStates.slice(-10)
      );
      this.currentMood.lastUpdated = now;
    }
  }

  /**
   * Get relevant patterns for situation
   */
  private getRelevantPatterns(situation: any): EmotionalPattern[] {
    return this.patterns
      .filter(
        (pattern) =>
          pattern.triggerPattern.situationType === situation.type ||
          pattern.triggerPattern.contextElements.some((element) =>
            situation.context.includes(element)
          )
      )
      .filter(
        (pattern) =>
          pattern.confidence > this.config.patternSignificanceThreshold
      )
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Generate coping strategies for pattern
   */
  private generateCopingStrategies(
    pattern: EmotionalPattern,
    situation: any
  ): Array<{
    strategy: string;
    confidence: number;
    reasoning: string;
    expectedEffectiveness: number;
    emotionalOutcome: string;
  }> {
    const strategies = [];

    // Emotion-specific strategies
    switch (pattern.emotionalResponse.primaryEmotion) {
      case 'angry':
        strategies.push({
          strategy: 'Take deep breaths and count to 10',
          confidence: 0.8,
          reasoning:
            'Anger patterns show breathing exercises reduce intensity by 60%',
          expectedEffectiveness: 0.7,
          emotionalOutcome: 'Reduced anger, increased calm',
        });
        strategies.push({
          strategy: 'Remove yourself from the triggering situation',
          confidence: 0.9,
          reasoning:
            'Pattern analysis shows situation removal is 90% effective for anger',
          expectedEffectiveness: 0.85,
          emotionalOutcome: 'Immediate anger reduction',
        });
        break;

      case 'anxious':
        strategies.push({
          strategy:
            'Practice grounding techniques - focus on physical sensations',
          confidence: 0.75,
          reasoning: 'Anxiety patterns respond well to sensory grounding',
          expectedEffectiveness: 0.7,
          emotionalOutcome:
            'Reduced anxiety, increased present-moment awareness',
        });
        strategies.push({
          strategy: 'Break the situation into smaller, manageable steps',
          confidence: 0.8,
          reasoning:
            'Task breakdown reduces anxiety in 75% of similar situations',
          expectedEffectiveness: 0.8,
          emotionalOutcome: 'Anxiety transformed into focused action',
        });
        break;

      case 'sad':
        strategies.push({
          strategy: 'Engage in comforting activities (favorite food, music)',
          confidence: 0.7,
          reasoning:
            'Sadness patterns show comfort activities improve mood by 50%',
          expectedEffectiveness: 0.6,
          emotionalOutcome: 'Improved mood, temporary comfort',
        });
        strategies.push({
          strategy: 'Reach out to supportive entities for companionship',
          confidence: 0.8,
          reasoning: 'Social support is effective in 80% of sadness patterns',
          expectedEffectiveness: 0.75,
          emotionalOutcome: 'Reduced isolation, increased connection',
        });
        break;

      default:
        strategies.push({
          strategy: 'Take a moment to acknowledge and accept the emotion',
          confidence: 0.6,
          reasoning:
            'General emotional pattern shows acceptance reduces negative impact',
          expectedEffectiveness: 0.5,
          emotionalOutcome: 'Better emotional regulation',
        });
    }

    return strategies;
  }

  /**
   * Get emotional regulation strategies
   */
  private getEmotionalRegulationStrategies(situation: any): Array<{
    strategy: string;
    confidence: number;
    reasoning: string;
    expectedEffectiveness: number;
    emotionalOutcome: string;
  }> {
    const strategies = [];

    if (
      situation.currentEmotionalState === 'angry' ||
      situation.currentEmotionalState === 'anxious'
    ) {
      strategies.push({
        strategy: 'Practice progressive muscle relaxation',
        confidence: 0.7,
        reasoning:
          'Body-focused techniques are effective for high-arousal emotions',
        expectedEffectiveness: 0.65,
        emotionalOutcome: 'Reduced physical tension, calmer mind',
      });
    }

    strategies.push({
      strategy: 'Use positive self-talk to reframe the situation',
      confidence: 0.6,
      reasoning:
        'Cognitive reframing improves emotional response in most situations',
      expectedEffectiveness: 0.55,
      emotionalOutcome:
        'More balanced perspective, reduced emotional intensity',
    });

    strategies.push({
      strategy: 'Engage in a brief mindfulness exercise',
      confidence: 0.65,
      reasoning:
        'Mindfulness reduces emotional reactivity across all emotion types',
      expectedEffectiveness: 0.6,
      emotionalOutcome: 'Increased emotional awareness and control',
    });

    return strategies;
  }

  /**
   * Calculate emotional trends
   */
  private calculateEmotionalTrends(states: AdvancedEmotionalState[]): Array<{
    emotion: string;
    frequency: number;
    averageIntensity: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  }> {
    const emotionGroups = new Map<string, AdvancedEmotionalState[]>();

    for (const state of states) {
      if (!emotionGroups.has(state.primaryEmotion)) {
        emotionGroups.set(state.primaryEmotion, []);
      }
      emotionGroups.get(state.primaryEmotion)!.push(state);
    }

    const trends = [];

    for (const [emotion, emotionStates] of emotionGroups) {
      const frequency = emotionStates.length / states.length;
      const averageIntensity =
        emotionStates.reduce((sum, s) => sum + s.intensity, 0) /
        emotionStates.length;

      // Calculate trend based on recent vs older states
      const recentStates = emotionStates.filter(
        (s) => s.timestamp > Date.now() - 24 * 60 * 60 * 1000
      );
      const olderStates = emotionStates.filter(
        (s) => s.timestamp <= Date.now() - 24 * 60 * 60 * 1000
      );

      const recentAvg =
        recentStates.length > 0
          ? recentStates.reduce((sum, s) => sum + s.intensity, 0) /
            recentStates.length
          : 0;
      const olderAvg =
        olderStates.length > 0
          ? olderStates.reduce((sum, s) => sum + s.intensity, 0) /
            olderStates.length
          : 0;

      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (recentAvg > olderAvg + 0.1) trend = 'increasing';
      else if (recentAvg < olderAvg - 0.1) trend = 'decreasing';

      trends.push({
        emotion,
        frequency,
        averageIntensity,
        trend,
      });
    }

    return trends.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Identify common triggers
   */
  private identifyCommonTriggers(states: AdvancedEmotionalState[]): Array<{
    trigger: string;
    frequency: number;
    mostCommonEmotion: string;
  }> {
    const triggerCounts = new Map<
      string,
      { count: number; emotions: string[] }
    >();

    for (const state of states) {
      for (const trigger of state.triggers) {
        if (!triggerCounts.has(trigger)) {
          triggerCounts.set(trigger, { count: 0, emotions: [] });
        }
        const data = triggerCounts.get(trigger)!;
        data.count++;
        if (!data.emotions.includes(state.primaryEmotion)) {
          data.emotions.push(state.primaryEmotion);
        }
      }
    }

    return Array.from(triggerCounts.entries())
      .map(([trigger, data]) => ({
        trigger,
        frequency: data.count / states.length,
        mostCommonEmotion: data.emotions.sort(
          (a, b) =>
            data.emotions.filter((e) => e === b).length -
            data.emotions.filter((e) => e === a).length
        )[0],
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);
  }

  /**
   * Evaluate coping strategies
   */
  private evaluateCopingStrategies(states: AdvancedEmotionalState[]): Array<{
    strategy: string;
    effectiveness: number;
    usageCount: number;
  }> {
    const strategyEffectiveness = new Map<
      string,
      { totalEffectiveness: number; count: number }
    >();

    for (const state of states) {
      if (state.copingStrategies && state.effectiveness !== undefined) {
        for (const strategy of state.copingStrategies) {
          if (!strategyEffectiveness.has(strategy)) {
            strategyEffectiveness.set(strategy, {
              totalEffectiveness: 0,
              count: 0,
            });
          }
          const data = strategyEffectiveness.get(strategy)!;
          data.totalEffectiveness += state.effectiveness!;
          data.count++;
        }
      }
    }

    return Array.from(strategyEffectiveness.entries())
      .map(([strategy, data]) => ({
        strategy,
        effectiveness: data.totalEffectiveness / data.count,
        usageCount: data.count,
      }))
      .sort((a, b) => b.effectiveness - a.effectiveness)
      .slice(0, 10);
  }

  /**
   * Calculate mood stability
   */
  private calculateMoodStability(states: AdvancedEmotionalState[]): number {
    if (states.length < 2) return 0.5;

    const intensities = states.map((s) => s.intensity);
    const mean =
      intensities.reduce((sum, i) => sum + i, 0) / intensities.length;
    const variance =
      intensities.reduce((sum, i) => sum + Math.pow(i - mean, 2), 0) /
      intensities.length;

    // Convert variance to stability score (lower variance = higher stability)
    return Math.max(0, Math.min(1, 1 - Math.sqrt(variance)));
  }

  /**
   * Calculate emotional health score
   */
  private calculateEmotionalHealthScore(
    states: AdvancedEmotionalState[],
    moodStability: number
  ): number {
    let healthScore = 0.5; // Base score

    // Positive emotions factor
    const positiveStates = states.filter((s) =>
      ['happy', 'excited', 'content'].includes(s.primaryEmotion)
    );
    const positiveRatio = positiveStates.length / states.length;
    healthScore += positiveRatio * 0.2;

    // Negative emotions factor
    const negativeStates = states.filter((s) =>
      ['sad', 'angry', 'fearful', 'anxious'].includes(s.primaryEmotion)
    );
    const negativeRatio = negativeStates.length / states.length;
    healthScore -= negativeRatio * 0.2;

    // Intensity factor (extreme emotions are less healthy)
    const averageIntensity =
      states.reduce((sum, s) => sum + s.intensity, 0) / states.length;
    if (averageIntensity > 0.8) healthScore -= 0.1;
    else if (averageIntensity < 0.3) healthScore -= 0.05; // Too low intensity might indicate suppression

    // Mood stability factor
    healthScore += moodStability * 0.3;

    // Coping effectiveness factor
    const copingStates = states.filter((s) => s.effectiveness !== undefined);
    if (copingStates.length > 0) {
      const averageCopingEffectiveness =
        copingStates.reduce((sum, s) => sum + (s.effectiveness || 0), 0) /
        copingStates.length;
      healthScore += averageCopingEffectiveness * 0.2;
    }

    return Math.max(0, Math.min(1, healthScore));
  }

  /**
   * Blend two emotions
   */
  private blendEmotions(
    emotion1: string,
    emotion2: string,
    weight2: number
  ): string {
    // Simple blending - in reality this would be more sophisticated
    if (weight2 > 0.5) return emotion2;
    return emotion1;
  }

  /**
   * Categorize trigger
   */
  private categorizeTrigger(trigger: string): EmotionalTrigger['category'] {
    if (
      trigger.includes('social') ||
      trigger.includes('player') ||
      trigger.includes('villager')
    ) {
      return 'social';
    }
    if (
      trigger.includes('environment') ||
      trigger.includes('biome') ||
      trigger.includes('weather')
    ) {
      return 'environmental';
    }
    if (
      trigger.includes('task') ||
      trigger.includes('mining') ||
      trigger.includes('building')
    ) {
      return 'task';
    }
    if (
      trigger.includes('hunger') ||
      trigger.includes('health') ||
      trigger.includes('tired')
    ) {
      return 'physiological';
    }
    return 'cognitive';
  }

  /**
   * Calculate trigger probability
   */
  private calculateTriggerProbability(
    trigger: EmotionalTrigger,
    situation: any
  ): number {
    let probability = trigger.emotionalImpact.probability;

    // Context factors
    const contextMatches = trigger.contextFactors.filter((factor) =>
      situation.context.includes(factor)
    ).length;
    probability += (contextMatches / trigger.contextFactors.length) * 0.2;

    // Situation type
    if (trigger.category === 'task' && situation.currentActivity) {
      probability += 0.1;
    }

    return Math.max(0, Math.min(1, probability));
  }

  /**
   * Calculate emotional impact
   */
  private calculateEmotionalImpact(
    trigger: EmotionalTrigger,
    situation: any
  ): number {
    const baseImpact =
      (trigger.emotionalImpact.intensityRange.min +
        trigger.emotionalImpact.intensityRange.max) /
      2;
    return baseImpact * trigger.emotionalImpact.probability;
  }

  /**
   * Get trigger avoidance strategies
   */
  private getTriggerAvoidanceStrategies(
    trigger: EmotionalTrigger,
    situation: any
  ): string[] {
    const strategies = [];

    if (trigger.category === 'social' && trigger.avoidanceStrategies) {
      strategies.push(...trigger.avoidanceStrategies);
    }

    if (trigger.category === 'environmental') {
      strategies.push('Avoid triggering environments when possible');
      strategies.push('Prepare for environmental challenges in advance');
    }

    if (trigger.category === 'task') {
      strategies.push('Break complex tasks into smaller steps');
      strategies.push('Take breaks during challenging tasks');
    }

    return strategies.slice(0, 3);
  }

  /**
   * Calculate typical outcomes
   */
  private calculateTypicalOutcomes(states: AdvancedEmotionalState[]): Array<{
    outcome: string;
    frequency: number;
  }> {
    const outcomes = new Map<string, number>();

    for (const state of states) {
      if (state.outcome) {
        outcomes.set(state.outcome, (outcomes.get(state.outcome) || 0) + 1);
      }
    }

    return Array.from(outcomes.entries())
      .map(([outcome, count]) => ({
        outcome,
        frequency: count / states.length,
      }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Calculate pattern coping effectiveness
   */
  private calculatePatternCopingEffectiveness(
    states: AdvancedEmotionalState[]
  ): number {
    const copingStates = states.filter((s) => s.effectiveness !== undefined);
    if (copingStates.length === 0) return 0.5;

    return (
      copingStates.reduce((sum, s) => sum + (s.effectiveness || 0), 0) /
      copingStates.length
    );
  }

  /**
   * Clean up old emotional states
   */
  private async cleanupOldStates(): Promise<void> {
    const cutoff =
      Date.now() - this.config.emotionalRetentionDays * 24 * 60 * 60 * 1000;

    // Keep intense emotions and recent states
    const statesToKeep = this.emotionalStates.filter(
      (state) => state.intensity > 0.8 || state.timestamp > cutoff
    );

    this.emotionalStates = statesToKeep;

    console.log(
      `🧹 Cleaned up emotional memory: kept ${statesToKeep.length} states`
    );
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `emotional_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get emotional memory statistics
   */
  getEmotionalMemoryStats(): {
    totalStates: number;
    emotionDistribution: Record<string, number>;
    averageIntensity: number;
    patternCount: number;
    triggerCount: number;
    currentMood?: string;
    mostCommonEmotions: string[];
    emotionalHealthScore: number;
  } {
    const emotionDistribution = this.emotionalStates.reduce(
      (dist, state) => {
        dist[state.primaryEmotion] = (dist[state.primaryEmotion] || 0) + 1;
        return dist;
      },
      {} as Record<string, number>
    );

    const averageIntensity =
      this.emotionalStates.reduce((sum, s) => sum + s.intensity, 0) /
        this.emotionalStates.length || 0;

    const mostCommonEmotions = Object.entries(emotionDistribution)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([emotion]) => emotion);

    const emotionalHealthScore = this.calculateEmotionalHealthScore(
      this.emotionalStates.slice(-20), // Last 20 states
      this.currentMood?.stability || 0.5
    );

    return {
      totalStates: this.emotionalStates.length,
      emotionDistribution,
      averageIntensity,
      patternCount: this.patterns.length,
      triggerCount: this.triggers.length,
      currentMood: this.currentMood?.primaryEmotion || undefined,
      mostCommonEmotions,
      emotionalHealthScore,
    };
  }

  /**
   * Get all emotional states (for guardian integration)
   */
  getEmotionalStates(): AdvancedEmotionalState[] {
    return [...this.emotionalStates];
  }

  /**
   * Convert emotional state to simple format for integration
   */
  toSimpleEmotionalState(state: AdvancedEmotionalState): {
    id: string;
    primaryEmotion: string;
    intensity: number;
    secondaryEmotions: Array<{ emotion: string; intensity: number }>;
    triggers: string[];
    context: string;
    timestamp: number;
    duration?: number;
    outcome?: string;
    copingStrategies?: string[];
    effectiveness?: number;
  } {
    return {
      id: state.id,
      primaryEmotion: state.primaryEmotion,
      intensity: state.intensity,
      secondaryEmotions: state.secondaryEmotions,
      triggers: state.triggers,
      context: state.context,
      timestamp: state.timestamp,
      duration: state.duration,
      outcome: state.outcome,
      copingStrategies: state.copingStrategies,
      effectiveness: state.effectiveness,
    };
  }
}
