/**
 * Event logging for episodic memory.
 *
 * Captures significant experiences and stores them with appropriate metadata.
 * Uses early-return guards and safe defaults for robust operation.
 *
 * @author @darianrosebrook
 */

import {
  Experience,
  ExperienceType,
  ExperienceSchema,
  EmotionalState,
  Outcome,
  Action,
  Location,
} from '../types';

/**
 * Default emotional state for experiences
 */
function getDefaultEmotionalState(): EmotionalState {
  return {
    satisfaction: 0.5,
    frustration: 0.1,
    excitement: 0.3,
    curiosity: 0.4,
    confidence: 0.5,
    timestamp: Date.now(),
  };
}

/**
 * Event logger for capturing significant experiences
 */
export class EventLogger {
  private events: Experience[] = [];
  private maxEvents = 10000;

  /**
   * Log a significant experience with safe defaults
   */
  logExperience(
    type: ExperienceType,
    description: string,
    options: Partial<Experience> = {}
  ): Experience {
    if (!description) {
      // Fail-fast guard for invalid input
      throw new Error('Experience description is required');
    }

    const now = Date.now();
    const experience: Experience = {
      id: `exp-${now}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      description,
      location: options.location,
      timestamp: now,
      duration: options.duration ?? 0,
      participants: options.participants ?? [],
      actions: options.actions ?? [],
      outcomes: options.outcomes ?? [],
      emotions: options.emotions ?? getDefaultEmotionalState(),
      salienceScore: options.salienceScore ?? this.calculateBaseSalience(type),
      tags: options.tags ?? [],
      metadata: options.metadata ?? {},
    };

    // Validate the experience
    const validationResult = ExperienceSchema.safeParse(experience);
    if (!validationResult.success) {
      console.warn('Experience validation failed:', validationResult.error);
      // Continue with the experience but mark it as potentially invalid
      experience.metadata.validationWarning = true;
    }

    this.events.push(experience);

    // Manage memory capacity
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents); // Keep most recent
    }

    return experience;
  }

  /**
   * Log goal achievement
   */
  logGoalAchievement(
    goalDescription: string,
    satisfaction: number = 0.8,
    duration: number = 0
  ): Experience {
    return this.logExperience(
      ExperienceType.GOAL_ACHIEVEMENT,
      `Achieved goal: ${goalDescription}`,
      {
        duration,
        emotions: {
          ...getDefaultEmotionalState(),
          satisfaction: Math.max(0, Math.min(1, satisfaction)),
          confidence: Math.max(0, Math.min(1, satisfaction * 0.9)),
        },
        salienceScore: 0.8, // Goal achievements are highly salient
        tags: ['goal', 'achievement', 'success'],
      }
    );
  }

  /**
   * Log goal failure
   */
  logGoalFailure(
    goalDescription: string,
    frustration: number = 0.7,
    duration: number = 0
  ): Experience {
    return this.logExperience(
      ExperienceType.GOAL_FAILURE,
      `Failed to achieve goal: ${goalDescription}`,
      {
        duration,
        emotions: {
          ...getDefaultEmotionalState(),
          frustration: Math.max(0, Math.min(1, frustration)),
          satisfaction: Math.max(0, Math.min(1, 1 - frustration * 0.8)),
          confidence: Math.max(0, Math.min(1, 1 - frustration * 0.6)),
        },
        salienceScore: 0.7, // Failures are also quite salient for learning
        tags: ['goal', 'failure', 'learning'],
      }
    );
  }

  /**
   * Log exploration activity
   */
  logExploration(
    description: string,
    location?: Location,
    discoveries: string[] = []
  ): Experience {
    const curiosity = discoveries.length > 0 ? 0.8 : 0.6;
    const excitement = discoveries.length > 0 ? 0.7 : 0.4;

    return this.logExperience(
      ExperienceType.EXPLORATION,
      description,
      {
        location,
        emotions: {
          ...getDefaultEmotionalState(),
          curiosity,
          excitement,
        },
        salienceScore: discoveries.length > 0 ? 0.6 : 0.4,
        tags: ['exploration', 'discovery', ...discoveries],
        metadata: { discoveries },
      }
    );
  }

  /**
   * Get all logged experiences
   */
  getAllExperiences(): Experience[] {
    return [...this.events];
  }

  /**
   * Get experiences by type
   */
  getExperiencesByType(type: ExperienceType): Experience[] {
    return this.events.filter((exp) => exp.type === type);
  }

  /**
   * Get recent experiences within time window
   */
  getRecentExperiences(windowMs: number = 3600000): Experience[] {
    // Default: last hour
    const cutoff = Date.now() - windowMs;
    return this.events.filter((exp) => exp.timestamp >= cutoff);
  }

  /**
   * Get most salient experiences
   */
  getMostSalientExperiences(count: number = 10): Experience[] {
    return [...this.events]
      .sort((a, b) => b.salienceScore - a.salienceScore)
      .slice(0, count);
  }

  /**
   * Calculate base salience score for experience type
   */
  private calculateBaseSalience(type: ExperienceType): number {
    const baseSalience: Record<ExperienceType, number> = {
      [ExperienceType.GOAL_ACHIEVEMENT]: 0.8,
      [ExperienceType.GOAL_FAILURE]: 0.7,
      [ExperienceType.DANGER_ENCOUNTER]: 0.9,
      [ExperienceType.SOCIAL_INTERACTION]: 0.6,
      [ExperienceType.LEARNING]: 0.7,
      [ExperienceType.SKILL_IMPROVEMENT]: 0.75,
      [ExperienceType.EXPLORATION]: 0.5,
      [ExperienceType.CREATIVE_ACTIVITY]: 0.6,
      [ExperienceType.ROUTINE_ACTION]: 0.2,
    };

    return baseSalience[type] ?? 0.5;
  }

  /**
   * Clear all experiences (for testing/reset)
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get memory usage statistics
   */
  getStats() {
    return {
      totalExperiences: this.events.length,
      capacity: this.maxEvents,
      utilizationRatio: this.events.length / this.maxEvents,
      byType: Object.values(ExperienceType).reduce(
        (acc, type) => {
          acc[type] = this.events.filter((exp) => exp.type === type).length;
          return acc;
        },
        {} as Record<ExperienceType, number>
      ),
    };
  }
}
