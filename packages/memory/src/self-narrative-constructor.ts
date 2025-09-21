/**
 * Self-Narrative Constructor
 *
 * Generates coherent narrative summaries of the agent's experiences at
 * milestones (every 10-24 game days) to reinforce identity and values
 * over time. Integrates with emotional memories to create meaningful
 * self-stories that persist and evolve.
 *
 * @author @darianrosebrook
 */

import { Experience, ExperienceType } from './types';
import {
  NarrativeGenerator,
  AutobiographicalNarrative,
  NarrativeStyle,
} from './episodic/narrative-generator';
import {
  EmotionalMemoryManager,
  EmotionalState,
} from './emotional-memory-manager';
import {
  IdentityMemoryGuardian,
  ProtectedIdentityMemory,
} from './identity-memory-guardian';

/**
 * Narrative milestone configuration
 */
export interface NarrativeMilestone {
  id: string;
  name: string;
  description: string;
  triggerCondition: {
    timeSinceLastNarrative?: number; // Minimum days between narratives
    experienceThreshold?: number; // Minimum experiences since last narrative
    emotionalIntensity?: number; // Average emotional intensity threshold
    identityChange?: number; // Identity change threshold
  };
  narrativeStyle: NarrativeStyle;
  focusAreas: string[];
  includeEmotionalContext: boolean;
  reinforceIdentity: boolean;
}

/**
 * Self-narrative construction configuration
 */
export interface SelfNarrativeConfig {
  /** Enable automatic narrative construction */
  enabled: boolean;

  /** Milestone interval range (min-max days) */
  milestoneIntervalDays: { min: number; max: number };

  /** How often to check for milestone conditions (ms) */
  checkInterval: number;

  /** Minimum experiences needed to trigger narrative */
  minExperiencesForNarrative: number;

  /** Default narrative style for milestones */
  defaultNarrativeStyle: NarrativeStyle;

  /** Enable emotional memory integration */
  enableEmotionalIntegration: boolean;

  /** Enable identity reinforcement through narrative */
  enableIdentityReinforcement: boolean;

  /** Maximum narratives to retain */
  maxNarratives: number;

  /** Narrative milestones */
  milestones: NarrativeMilestone[];

  /** Game time tracking */
  gameTimeConfig: {
    /** Enable game time tracking */
    enabled: boolean;
    /** Current game time (in game days) */
    currentGameDay?: number;
    /** Last milestone day */
    lastMilestoneDay?: number;
  };
}

/**
 * Self-narrative entry
 */
export interface SelfNarrative {
  id: string;
  milestone: NarrativeMilestone;
  narrative: AutobiographicalNarrative;
  timestamp: number;
  gameDay?: number;
  emotionalContext?: {
    dominantEmotions: string[];
    averageIntensity: number;
    moodStability: number;
  };
  identityImpact?: {
    reinforcedTraits: string[];
    reinforcedValues: string[];
    newInsights: string[];
  };
  significance: number; // 0-1 narrative importance
}

/**
 * Default configuration
 */
export const DEFAULT_SELF_NARRATIVE_CONFIG: Partial<SelfNarrativeConfig> = {
  enabled: true,
  milestoneIntervalDays: { min: 10, max: 24 }, // 10-24 game days
  checkInterval: 60 * 60 * 1000, // 1 hour
  minExperiencesForNarrative: 5,
  enableEmotionalIntegration: true,
  enableIdentityReinforcement: true,
  maxNarratives: 50,
  defaultNarrativeStyle: {
    tone: 'reflective',
    detailLevel: 'moderate',
    focus: 'emotional',
    length: 'moderate',
  },
  milestones: [
    {
      id: 'growth-reflection',
      name: 'Growth Reflection',
      description: 'Reflect on personal growth and learning experiences',
      triggerCondition: {
        timeSinceLastNarrative: 15,
        experienceThreshold: 10,
        emotionalIntensity: 0.3,
        identityChange: 0.2,
      },
      narrativeStyle: {
        tone: 'reflective',
        detailLevel: 'comprehensive',
        focus: 'emotional',
        length: 'extensive',
      },
      focusAreas: ['learning', 'growth', 'challenges', 'achievements'],
      includeEmotionalContext: true,
      reinforceIdentity: true,
    },
    {
      id: 'achievement-celebration',
      name: 'Achievement Celebration',
      description: 'Celebrate accomplishments and milestones',
      triggerCondition: {
        timeSinceLastNarrative: 20,
        experienceThreshold: 8,
        emotionalIntensity: 0.6,
        identityChange: 0.1,
      },
      narrativeStyle: {
        tone: 'storytelling',
        detailLevel: 'moderate',
        focus: 'thematic',
        length: 'moderate',
      },
      focusAreas: ['achievements', 'success', 'progress'],
      includeEmotionalContext: true,
      reinforceIdentity: true,
    },
    {
      id: 'emotional-processing',
      name: 'Emotional Processing',
      description: 'Process and integrate emotional experiences',
      triggerCondition: {
        timeSinceLastNarrative: 12,
        experienceThreshold: 6,
        emotionalIntensity: 0.7,
        identityChange: 0.3,
      },
      narrativeStyle: {
        tone: 'analytical',
        detailLevel: 'moderate',
        focus: 'emotional',
        length: 'moderate',
      },
      focusAreas: ['emotions', 'feelings', 'coping', 'resilience'],
      includeEmotionalContext: true,
      reinforceIdentity: true,
    },
  ],
  gameTimeConfig: {
    enabled: true,
    currentGameDay: 0,
    lastMilestoneDay: 0,
  },
};

/**
 * Constructs and manages self-narratives at identity milestones
 */
export class SelfNarrativeConstructor {
  private config: Required<SelfNarrativeConfig>;
  private narratives: SelfNarrative[] = [];
  private lastCheck: number = 0;
  private narrativeGenerator: NarrativeGenerator;
  private emotionalManager?: EmotionalMemoryManager;
  private identityGuardian?: IdentityMemoryGuardian;

  constructor(
    config: Partial<SelfNarrativeConfig> = {},
    emotionalManager?: EmotionalMemoryManager,
    identityGuardian?: IdentityMemoryGuardian
  ) {
    this.config = {
      ...DEFAULT_SELF_NARRATIVE_CONFIG,
      ...config,
    } as Required<SelfNarrativeConfig>;

    this.narrativeGenerator = new NarrativeGenerator();
    this.emotionalManager = emotionalManager;
    this.identityGuardian = identityGuardian;
  }

  /**
   * Initialize the narrative constructor
   */
  async initialize(): Promise<void> {
    if (this.config.enabled) {
      console.log('📖 Self-Narrative Constructor initialized');
      this.narrativeGenerator = new NarrativeGenerator();
    }
  }

  /**
   * Check if milestone conditions are met and construct narrative
   */
  async checkAndConstructNarrative(
    recentExperiences: Experience[],
    currentGameDay?: number
  ): Promise<SelfNarrative | null> {
    if (!this.config.enabled) return null;

    const now = Date.now();

    // Update game time
    if (currentGameDay !== undefined) {
      this.config.gameTimeConfig.currentGameDay = currentGameDay;
    }

    // Check if enough time has passed since last check
    if (now - this.lastCheck < this.config.checkInterval) {
      return null;
    }

    this.lastCheck = now;

    // Check milestone conditions
    const eligibleMilestone =
      await this.findEligibleMilestone(recentExperiences);
    if (!eligibleMilestone) {
      return null;
    }

    console.log(
      `📖 Milestone reached: ${eligibleMilestone.name} - constructing narrative`
    );

    // Construct the narrative
    const narrative = await this.constructNarrative(
      eligibleMilestone,
      recentExperiences
    );

    if (narrative) {
      this.narratives.push(narrative);

      // Manage narrative capacity
      if (this.narratives.length > this.config.maxNarratives) {
        // Remove least significant narratives
        this.narratives.sort((a, b) => a.significance - b.significance);
        this.narratives = this.narratives.slice(-this.config.maxNarratives);
      }

      // Update milestone tracking
      if (
        this.config.gameTimeConfig.enabled &&
        this.config.gameTimeConfig.currentGameDay
      ) {
        this.config.gameTimeConfig.lastMilestoneDay =
          this.config.gameTimeConfig.currentGameDay;
      }

      // Reinforce identity if enabled
      if (this.config.enableIdentityReinforcement && this.identityGuardian) {
        await this.reinforceIdentityThroughNarrative(narrative);
      }

      console.log(
        `📖 Narrative constructed: ${narrative.narrative.title} (significance: ${narrative.significance.toFixed(2)})`
      );
    }

    return narrative;
  }

  /**
   * Get all self-narratives
   */
  getNarratives(): SelfNarrative[] {
    return [...this.narratives];
  }

  /**
   * Get most recent narratives
   */
  getRecentNarratives(count: number = 5): SelfNarrative[] {
    return [...this.narratives]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count);
  }

  /**
   * Get narratives by milestone type
   */
  getNarrativesByMilestone(milestoneId: string): SelfNarrative[] {
    return this.narratives.filter(
      (narrative) => narrative.milestone.id === milestoneId
    );
  }

  /**
   * Get narrative statistics
   */
  getNarrativeStats(): {
    totalNarratives: number;
    byMilestone: Record<string, number>;
    averageSignificance: number;
    lastNarrativeAge: number;
    emotionalIntegrationRate: number;
    identityReinforcementRate: number;
  } {
    const byMilestone = this.narratives.reduce(
      (acc, narrative) => {
        acc[narrative.milestone.id] = (acc[narrative.milestone.id] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const averageSignificance =
      this.narratives.length > 0
        ? this.narratives.reduce((sum, n) => sum + n.significance, 0) /
          this.narratives.length
        : 0;

    const lastNarrativeAge =
      this.narratives.length > 0
        ? Date.now() - this.narratives[this.narratives.length - 1].timestamp
        : 0;

    const emotionalIntegrationRate =
      this.narratives.filter((n) => n.emotionalContext).length /
      this.narratives.length;

    const identityReinforcementRate =
      this.narratives.filter((n) => n.identityImpact).length /
      this.narratives.length;

    return {
      totalNarratives: this.narratives.length,
      byMilestone,
      averageSignificance,
      lastNarrativeAge,
      emotionalIntegrationRate,
      identityReinforcementRate,
    };
  }

  /**
   * Update game day for milestone tracking
   */
  updateGameDay(gameDay: number): void {
    this.config.gameTimeConfig.currentGameDay = gameDay;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SelfNarrativeConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
    } as Required<SelfNarrativeConfig>;
    console.log('⚙️ Updated self-narrative constructor configuration');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async findEligibleMilestone(
    recentExperiences: Experience[]
  ): Promise<NarrativeMilestone | null> {
    // Check time-based milestone
    if (
      this.config.gameTimeConfig.enabled &&
      this.config.gameTimeConfig.currentGameDay
    ) {
      const daysSinceLastMilestone =
        this.config.gameTimeConfig.currentGameDay -
        (this.config.gameTimeConfig.lastMilestoneDay || 0);

      if (daysSinceLastMilestone >= this.config.milestoneIntervalDays.min) {
        // Find appropriate milestone for time range
        const potentialMilestones = this.config.milestones.filter(
          (milestone) =>
            daysSinceLastMilestone >=
            (milestone.triggerCondition.timeSinceLastNarrative || 0)
        );

        if (potentialMilestones.length > 0) {
          return this.selectBestMilestone(
            potentialMilestones,
            recentExperiences
          );
        }
      }
    }

    // Check experience threshold
    if (recentExperiences.length >= this.config.minExperiencesForNarrative) {
      const potentialMilestones = this.config.milestones.filter(
        (milestone) =>
          recentExperiences.length >=
          (milestone.triggerCondition.experienceThreshold || 0)
      );

      if (potentialMilestones.length > 0) {
        return this.selectBestMilestone(potentialMilestones, recentExperiences);
      }
    }

    return null;
  }

  private async selectBestMilestone(
    milestones: NarrativeMilestone[],
    experiences: Experience[]
  ): Promise<NarrativeMilestone> {
    // For now, select the first milestone (could be enhanced with more sophisticated logic)
    const milestone = milestones[0];

    // Check emotional intensity condition
    if (this.config.enableEmotionalIntegration && this.emotionalManager) {
      const insights = await this.emotionalManager.getEmotionalInsights();
      const avgIntensity = insights.emotionalTrends.reduce(
        (sum, trend) => sum + trend.averageIntensity * trend.frequency,
        0
      );

      if (avgIntensity < (milestone.triggerCondition.emotionalIntensity || 0)) {
        // Emotional intensity too low, try next milestone
        const nextMilestone = milestones.find(
          (m) => (m.triggerCondition.emotionalIntensity || 0) <= avgIntensity
        );
        if (nextMilestone) return nextMilestone;
      }
    }

    return milestone;
  }

  private async constructNarrative(
    milestone: NarrativeMilestone,
    experiences: Experience[]
  ): Promise<SelfNarrative | null> {
    try {
      // Filter experiences based on milestone focus areas
      const relevantExperiences = this.filterExperiencesByFocus(
        experiences,
        milestone.focusAreas
      );

      if (relevantExperiences.length < 3) {
        console.warn(
          `Insufficient experiences for milestone ${milestone.name}: ${relevantExperiences.length}`
        );
        return null;
      }

      // Generate the narrative
      const narrative =
        this.narrativeGenerator.generateAutobiographicalNarrative(
          relevantExperiences,
          milestone.narrativeStyle
        );

      // Calculate emotional context if enabled
      const emotionalContext = milestone.includeEmotionalContext
        ? await this.calculateEmotionalContext(relevantExperiences)
        : undefined;

      // Calculate identity impact if enabled
      const identityImpact = this.config.enableIdentityReinforcement
        ? await this.calculateIdentityImpact(relevantExperiences, narrative)
        : undefined;

      // Calculate narrative significance
      const significance = this.calculateNarrativeSignificance(
        narrative,
        emotionalContext,
        identityImpact
      );

      const selfNarrative: SelfNarrative = {
        id: `narrative-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        milestone,
        narrative,
        timestamp: Date.now(),
        gameDay: this.config.gameTimeConfig.currentGameDay,
        emotionalContext,
        identityImpact,
        significance,
      };

      return selfNarrative;
    } catch (error) {
      console.error('Failed to construct narrative:', error);
      return null;
    }
  }

  private filterExperiencesByFocus(
    experiences: Experience[],
    focusAreas: string[]
  ): Experience[] {
    return experiences.filter((experience) => {
      const description = experience.description.toLowerCase();
      const type = experience.type;

      // Match focus areas
      return focusAreas.some((area) => {
        switch (area) {
          case 'learning':
            return (
              type === ExperienceType.SKILL_IMPROVEMENT ||
              type === ExperienceType.LEARNING ||
              description.includes('learn') ||
              description.includes('skill')
            );
          case 'growth':
            return (
              type === ExperienceType.GOAL_ACHIEVEMENT ||
              type === ExperienceType.SKILL_IMPROVEMENT ||
              description.includes('improve') ||
              description.includes('better')
            );
          case 'challenges':
            return (
              type === ExperienceType.GOAL_FAILURE ||
              description.includes('challenge') ||
              description.includes('difficult')
            );
          case 'achievements':
            return (
              type === ExperienceType.GOAL_ACHIEVEMENT ||
              description.includes('success') ||
              description.includes('achieve')
            );
          case 'emotions':
          case 'feelings':
            return (
              experience.emotions &&
              (experience.emotions.satisfaction > 0.5 ||
                experience.emotions.excitement > 0.5 ||
                experience.emotions.frustration > 0.5)
            );
          default:
            return description.includes(area);
        }
      });
    });
  }

  private async calculateEmotionalContext(
    experiences: Experience[]
  ): Promise<SelfNarrative['emotionalContext']> {
    if (!this.emotionalManager) {
      return undefined;
    }

    const insights = await this.emotionalManager.getEmotionalInsights({
      start: experiences[0]?.timestamp || 0,
      end: experiences[experiences.length - 1]?.timestamp || Date.now(),
    });

    const dominantEmotions = insights.emotionalTrends
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3)
      .map((trend) => trend.emotion);

    return {
      dominantEmotions,
      averageIntensity: insights.emotionalTrends.reduce(
        (sum, trend) => sum + trend.averageIntensity * trend.frequency,
        0
      ),
      moodStability: insights.moodStability,
    };
  }

  private async calculateIdentityImpact(
    experiences: Experience[],
    narrative: AutobiographicalNarrative
  ): Promise<SelfNarrative['identityImpact']> {
    const reinforcedTraits: string[] = [];
    const reinforcedValues: string[] = [];
    const newInsights: string[] = [];

    // Extract traits from narrative content
    const content = narrative.content.toLowerCase();
    const traits = [
      'curious',
      'careful',
      'helpful',
      'persistent',
      'brave',
      'creative',
    ];

    for (const trait of traits) {
      if (content.includes(trait)) {
        reinforcedTraits.push(trait);
      }
    }

    // Extract values from narrative content
    const values = ['safety', 'honesty', 'learning', 'respect', 'growth'];
    for (const value of values) {
      if (content.includes(value)) {
        reinforcedValues.push(value);
      }
    }

    // Extract insights from key insights
    newInsights.push(...narrative.keyInsights);

    return {
      reinforcedTraits,
      reinforcedValues,
      newInsights,
    };
  }

  private calculateNarrativeSignificance(
    narrative: AutobiographicalNarrative,
    emotionalContext?: SelfNarrative['emotionalContext'],
    identityImpact?: SelfNarrative['identityImpact']
  ): number {
    let significance = 0.5; // Base significance

    // Boost for narrative confidence
    significance += narrative.confidence * 0.2;

    // Boost for emotional integration
    if (emotionalContext) {
      significance += 0.1;
      significance += emotionalContext.averageIntensity * 0.1;
    }

    // Boost for identity reinforcement
    if (identityImpact) {
      significance += identityImpact.reinforcedTraits.length * 0.05;
      significance += identityImpact.reinforcedValues.length * 0.05;
      significance += identityImpact.newInsights.length * 0.05;
    }

    // Boost for development arc
    if (narrative.developmentArc === 'growth') significance += 0.1;
    if (narrative.developmentArc === 'achievement') significance += 0.05;

    return Math.max(0.1, Math.min(1.0, significance));
  }

  private async reinforceIdentityThroughNarrative(
    narrative: SelfNarrative
  ): Promise<void> {
    if (!this.identityGuardian) return;

    // Integrate significant memories into narrative
    for (const memoryId of narrative.narrative.memories) {
      await this.identityGuardian.integrateIntoNarrative(
        memoryId,
        narrative.narrative.content
      );
    }

    // Take a self-concept snapshot if emotional integration was significant
    if (
      narrative.emotionalContext &&
      narrative.emotionalContext.averageIntensity > 0.6
    ) {
      try {
        await this.identityGuardian.takeSelfConceptSnapshot();
      } catch (error) {
        console.warn('Failed to take self-concept snapshot:', error);
      }
    }
  }
}
