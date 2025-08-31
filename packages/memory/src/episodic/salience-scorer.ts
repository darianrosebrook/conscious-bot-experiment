/**
 * Salience scoring for episodic memories.
 *
 * Determines the importance and memorability of experiences using
 * multiple factors with safe defaults and guard clauses.
 *
 * @author @darianrosebrook
 */

import { Experience, ExperienceType } from '../types';

/**
 * Factors that influence salience scoring
 */
export interface SalienceFactors {
  novelty: number; // How novel/unexpected the experience was
  emotionalIntensity: number; // Strength of emotional response
  goalRelevance: number; // How relevant to current goals
  socialImportance: number; // Social significance
  learningValue: number; // Potential for learning
  recency: number; // How recent the experience is
}

/**
 * Configuration for salience calculation
 */
export interface SalienceConfig {
  weights: {
    novelty: number;
    emotionalIntensity: number;
    goalRelevance: number;
    socialImportance: number;
    learningValue: number;
    recency: number;
  };
  decayRate: number; // How quickly salience decays over time
  boostThreshold: number; // Threshold for salience boosting
}

/**
 * Default salience configuration
 */
const DEFAULT_CONFIG: SalienceConfig = {
  weights: {
    novelty: 0.25,
    emotionalIntensity: 0.25,
    goalRelevance: 0.2,
    socialImportance: 0.1,
    learningValue: 0.15,
    recency: 0.05,
  },
  decayRate: 0.95, // 5% decay per day
  boostThreshold: 0.8,
};

/**
 * Salience scorer for episodic memories
 */
export class SalienceScorer {
  private config: SalienceConfig;

  constructor(config: Partial<SalienceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate salience score for an experience
   */
  calculateSalience(
    experience: Experience,
    context?: {
      currentGoals?: string[];
      recentExperiences?: Experience[];
      socialContext?: any;
    }
  ): number {
    if (!experience) {
      return 0; // Early return guard
    }

    const factors = this.analyzeSalienceFactors(experience, context);
    const baseScore = this.weightedSum(factors);
    const adjustedScore = this.applyAdjustments(baseScore, experience, factors);

    return Math.max(0, Math.min(1, adjustedScore));
  }

  /**
   * Analyze factors that contribute to salience
   */
  private analyzeSalienceFactors(
    experience: Experience,
    context?: {
      currentGoals?: string[];
      recentExperiences?: Experience[];
      socialContext?: any;
    }
  ): SalienceFactors {
    return {
      novelty: this.calculateNovelty(experience, context?.recentExperiences),
      emotionalIntensity: this.calculateEmotionalIntensity(experience),
      goalRelevance: this.calculateGoalRelevance(
        experience,
        context?.currentGoals
      ),
      socialImportance: this.calculateSocialImportance(
        experience,
        context?.socialContext
      ),
      learningValue: this.calculateLearningValue(experience),
      recency: this.calculateRecency(experience),
    };
  }

  /**
   * Calculate novelty based on similarity to recent experiences
   */
  private calculateNovelty(
    experience: Experience,
    recentExperiences?: Experience[]
  ): number {
    if (!recentExperiences || recentExperiences.length === 0) {
      return 0.5; // Default novelty
    }

    // Simple novelty calculation based on type and description similarity
    const similarExperiences = recentExperiences.filter(
      (exp) =>
        exp.type === experience.type &&
        this.calculateSimilarity(exp.description, experience.description) > 0.7
    );

    // More similar experiences = less novelty
    const noveltyScore = Math.max(
      0.1,
      1 - similarExperiences.length / recentExperiences.length
    );

    return noveltyScore;
  }

  /**
   * Calculate emotional intensity from emotional state
   */
  private calculateEmotionalIntensity(experience: Experience): number {
    if (!experience.emotions) {
      return 0.3; // Default intensity
    }

    const emotions = experience.emotions;
    const intensityFactors = [
      emotions.satisfaction > 0.8 ? emotions.satisfaction : 0,
      emotions.frustration > 0.6 ? emotions.frustration : 0,
      emotions.excitement > 0.7 ? emotions.excitement : 0,
      emotions.curiosity > 0.6 ? emotions.curiosity : 0,
    ];

    const maxIntensity = Math.max(...intensityFactors);
    const avgIntensity =
      intensityFactors.reduce((sum, val) => sum + val, 0) /
      intensityFactors.length;

    // Combine max and average for final intensity
    return (maxIntensity * 0.7 + avgIntensity * 0.3);
  }

  /**
   * Calculate relevance to current goals
   */
  private calculateGoalRelevance(
    experience: Experience,
    currentGoals?: string[]
  ): number {
    if (!currentGoals || currentGoals.length === 0) {
      return 0.3; // Default relevance
    }

    // Goal-related experience types have higher base relevance
    const goalTypeBonus =
      experience.type === ExperienceType.GOAL_ACHIEVEMENT ||
      experience.type === ExperienceType.GOAL_FAILURE
        ? 0.5
        : 0;

    // Check if experience relates to current goals
    const goalRelatedness = currentGoals.some((goal) =>
      experience.description.toLowerCase().includes(goal.toLowerCase())
    )
      ? 0.4
      : 0;

    return Math.min(1, goalTypeBonus + goalRelatedness + 0.1);
  }

  /**
   * Calculate social importance
   */
  private calculateSocialImportance(
    experience: Experience,
    socialContext?: any
  ): number {
    if (experience.type === ExperienceType.SOCIAL_INTERACTION) {
      return 0.7; // Social interactions are inherently socially important
    }

    if (experience.participants && experience.participants.length > 0) {
      return 0.5; // Experiences with other participants have social value
    }

    return 0.1; // Minimal social importance for solo activities
  }

  /**
   * Calculate learning value potential
   */
  private calculateLearningValue(experience: Experience): number {
    const learningTypeBonus: Partial<Record<ExperienceType, number>> = {
      [ExperienceType.GOAL_FAILURE]: 0.8, // Failures teach valuable lessons
      [ExperienceType.LEARNING]: 0.9, // Explicit learning experiences
      [ExperienceType.SKILL_IMPROVEMENT]: 0.95, // Skill improvement is high-value learning
      [ExperienceType.EXPLORATION]: 0.6, // Exploration reveals new information
      [ExperienceType.DANGER_ENCOUNTER]: 0.7, // Dangerous situations teach caution
      [ExperienceType.CREATIVE_ACTIVITY]: 0.5, // Creativity builds skills
      [ExperienceType.GOAL_ACHIEVEMENT]: 0.4, // Success reinforces strategies
      [ExperienceType.SOCIAL_INTERACTION]: 0.4, // Social learning
      [ExperienceType.ROUTINE_ACTION]: 0.1, // Limited learning from routine
      [ExperienceType.TASK_REFLECTION]: 0.85, // Reflections consolidate learning from tasks
    };

    return learningTypeBonus[experience.type] ?? 0.3;
  }

  /**
   * Calculate recency factor
   */
  private calculateRecency(experience: Experience): number {
    const ageMs = Date.now() - experience.timestamp;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    // Recency decays exponentially
    return Math.pow(this.config.decayRate, ageDays);
  }

  /**
   * Calculate weighted sum of factors
   */
  private weightedSum(factors: SalienceFactors): number {
    const weights = this.config.weights;
    return (
      factors.novelty * weights.novelty +
      factors.emotionalIntensity * weights.emotionalIntensity +
      factors.goalRelevance * weights.goalRelevance +
      factors.socialImportance * weights.socialImportance +
      factors.learningValue * weights.learningValue +
      factors.recency * weights.recency
    );
  }

  /**
   * Apply final adjustments to salience score
   */
  private applyAdjustments(
    baseScore: number,
    experience: Experience,
    factors: SalienceFactors
  ): number {
    let adjustedScore = baseScore;

    // Boost highly novel or emotionally intense experiences
    if (
      factors.novelty > this.config.boostThreshold ||
      factors.emotionalIntensity > this.config.boostThreshold
    ) {
      adjustedScore *= 1.2;
    }

    // Boost experiences with multiple outcomes
    if (experience.outcomes && experience.outcomes.length > 1) {
      adjustedScore *= 1.1;
    }

    return adjustedScore;
  }

  /**
   * Simple text similarity calculation
   */
  private calculateSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);

    const intersection = words1.filter((word) => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];

    return intersection.length / union.length;
  }

  /**
   * Update salience scores for existing experiences
   */
  updateSalienceScores(
    experiences: Experience[],
    context?: {
      currentGoals?: string[];
      recentExperiences?: Experience[];
      socialContext?: any;
    }
  ): Experience[] {
    return experiences.map((exp) => ({
      ...exp,
      salienceScore: this.calculateSalience(exp, context),
    }));
  }
}
