/**
 * Identity Memory Guardian
 *
 * Protects and preserves key identity-related memories from excessive decay.
 * Ensures that memories crucial to the agent's sense of self are retained
 * and continue to influence behavior and self-conception.
 *
 * @author @darianrosebrook
 */

import { Experience } from './types';
import { MemoryDecayManager, MemoryAccessRecord } from './memory-decay-manager';
import {
  EmotionalMemoryManager,
  EmotionalState,
  AdvancedEmotionalState,
  toAdvancedEmotionalState,
} from './emotional-memory-manager';

/**
 * Identity significance levels
 */
export enum IdentitySignificance {
  CORE = 'core', // Essential to identity (name, purpose, values)
  IMPORTANT = 'important', // Significant but not essential
  CONTEXTUAL = 'contextual', // Context-dependent importance
  EPHEMERAL = 'ephemeral', // Temporary importance
}

/**
 * Identity memory with protection status
 */
export interface ProtectedIdentityMemory {
  memoryId: string;
  experience: Experience;
  significance: IdentitySignificance;
  protectionReason: string;
  protectionLevel: number; // 0-1, higher = more protected
  lastReinforced: number;
  reinforcementCount: number;
  narrativeIntegration: boolean; // Whether integrated into self-narrative
}

/**
 * Self-concept snapshot for identity tracking
 */
export interface SelfConceptSnapshot {
  timestamp: number;
  identitySummary: string;
  keyMemories: string[];
  emotionalBaseline: {
    primaryEmotion: string;
    averageIntensity: number;
    stability: number;
  };
  personalityProfile: {
    dominantTraits: string[];
    traitStrengths: Record<string, number>;
  };
  valueAlignment: {
    coreValues: string[];
    valueStrengths: Record<string, number>;
  };
}

/**
 * Identity memory protection configuration
 */
export interface IdentityMemoryConfig {
  /** Enable identity memory protection */
  enabled: boolean;

  /** Maximum protected memories */
  maxProtectedMemories: number;

  /** How often to evaluate protection status (ms) */
  evaluationInterval: number;

  /** Minimum significance score to be considered for protection */
  protectionThreshold: number;

  /** How much protection affects decay rate (0-1) */
  decayProtectionFactor: number;

  /** Enable automatic narrative integration */
  autoNarrativeIntegration: boolean;

  /** Enable self-concept snapshots */
  enableSelfConceptSnapshots: boolean;

  /** Snapshot interval (ms) */
  snapshotInterval: number;

  /** Memory types considered for identity protection */
  protectedMemoryTypes: Array<'episodic' | 'emotional' | 'semantic'>;

  /** Keywords that indicate identity significance */
  identityKeywords: {
    self: string[];
    values: string[];
    capabilities: string[];
    relationships: string[];
    achievements: string[];
    failures: string[];
  };
}

/**
 * Default configuration
 */
export const DEFAULT_IDENTITY_MEMORY_CONFIG: Partial<IdentityMemoryConfig> = {
  enabled: true,
  maxProtectedMemories: 100,
  evaluationInterval: 60 * 60 * 1000, // 1 hour
  protectionThreshold: 0.6,
  decayProtectionFactor: 0.8,
  autoNarrativeIntegration: true,
  enableSelfConceptSnapshots: true,
  snapshotInterval: 24 * 60 * 60 * 1000, // 1 day
  protectedMemoryTypes: ['episodic', 'emotional', 'semantic'],
  identityKeywords: {
    self: ['I', 'me', 'my', 'mine', 'myself', 'personally'],
    values: ['important', 'believe', 'value', 'principle', 'moral', 'ethical'],
    capabilities: [
      'learned',
      'skill',
      'ability',
      'can',
      'know how',
      'mastered',
    ],
    relationships: ['friend', 'relationship', 'trust', 'bond', 'connection'],
    achievements: [
      'accomplished',
      'succeeded',
      'achieved',
      'completed',
      'mastered',
    ],
    failures: ['failed', 'mistake', 'error', 'learned from', 'struggled with'],
  },
};

/**
 * Guardian for protecting identity-critical memories
 */
export class IdentityMemoryGuardian {
  private config: Required<IdentityMemoryConfig>;
  private protectedMemories: Map<string, ProtectedIdentityMemory> = new Map();
  private selfConceptHistory: SelfConceptSnapshot[] = [];
  private lastEvaluation: number = 0;
  private lastSnapshot: number = 0;
  private decayManager?: MemoryDecayManager;
  private emotionalManager?: EmotionalMemoryManager;

  constructor(
    config: Partial<IdentityMemoryConfig> = {},
    decayManager?: MemoryDecayManager,
    emotionalManager?: EmotionalMemoryManager
  ) {
    this.config = {
      ...DEFAULT_IDENTITY_MEMORY_CONFIG,
      ...config,
    } as Required<IdentityMemoryConfig>;

    this.decayManager = decayManager;
    this.emotionalManager = emotionalManager;
  }

  /**
   * Initialize the guardian with existing memories
   */
  async initialize(): Promise<void> {
    if (this.config.enabled) {
      console.log('🛡️ Identity Memory Guardian initialized');
      await this.evaluateExistingMemories();
      await this.takeSelfConceptSnapshot();
    }
  }

  /**
   * Protect a memory from excessive decay
   */
  async protectMemory(
    memoryId: string,
    experience: Experience,
    significance: IdentitySignificance,
    reason: string,
    protectionLevel: number = 0.8
  ): Promise<boolean> {
    if (!this.config.enabled) return false;

    const protectedMemory: ProtectedIdentityMemory = {
      memoryId,
      experience,
      significance,
      protectionReason: reason,
      protectionLevel: Math.max(0, Math.min(1, protectionLevel)),
      lastReinforced: Date.now(),
      reinforcementCount: 1,
      narrativeIntegration: false,
    };

    this.protectedMemories.set(memoryId, protectedMemory);

    // Apply protection to decay manager
    await this.applyDecayProtection(memoryId, protectionLevel);

    console.log(
      `🛡️ Protected identity memory: ${experience.description} (${significance}, ${protectionLevel})`
    );

    return true;
  }

  /**
   * Evaluate if a memory should be protected
   */
  async evaluateMemoryForProtection(
    memoryId: string,
    experience: Experience
  ): Promise<{
    shouldProtect: boolean;
    significance: IdentitySignificance;
    reason: string;
    protectionLevel: number;
  }> {
    if (!this.config.enabled) {
      return {
        shouldProtect: false,
        significance: IdentitySignificance.EPHEMERAL,
        reason: 'Protection disabled',
        protectionLevel: 0,
      };
    }

    // Calculate identity significance
    const significanceScore =
      await this.calculateIdentitySignificance(experience);
    const significance = this.mapSignificanceScoreToLevel(significanceScore);

    if (significanceScore < this.config.protectionThreshold) {
      return {
        shouldProtect: false,
        significance: IdentitySignificance.EPHEMERAL,
        reason: `Low significance score: ${significanceScore.toFixed(2)}`,
        protectionLevel: 0,
      };
    }

    const reason = await this.generateProtectionReason(
      experience,
      significanceScore
    );
    const protectionLevel = this.calculateProtectionLevel(significanceScore);

    return {
      shouldProtect: true,
      significance,
      reason,
      protectionLevel,
    };
  }

  /**
   * Reinforce protection of an identity memory
   */
  async reinforceMemory(
    memoryId: string,
    reinforcementReason: string
  ): Promise<boolean> {
    const protectedMemory = this.protectedMemories.get(memoryId);
    if (!protectedMemory) return false;

    protectedMemory.lastReinforced = Date.now();
    protectedMemory.reinforcementCount++;
    protectedMemory.protectionLevel = Math.min(
      1.0,
      protectedMemory.protectionLevel + 0.05
    );

    // Apply updated protection
    await this.applyDecayProtection(memoryId, protectedMemory.protectionLevel);

    console.log(
      `🛡️ Reinforced memory protection: ${protectedMemory.experience.description} (+${reinforcementReason})`
    );

    return true;
  }

  /**
   * Integrate memory into self-narrative
   */
  async integrateIntoNarrative(
    memoryId: string,
    narrativeContext: string
  ): Promise<boolean> {
    const protectedMemory = this.protectedMemories.get(memoryId);
    if (!protectedMemory) return false;

    protectedMemory.narrativeIntegration = true;

    // Boost protection for narrative-integrated memories
    await this.reinforceMemory(memoryId, 'Integrated into self-narrative');

    console.log(
      `📖 Integrated memory into narrative: ${protectedMemory.experience.description}`
    );

    return true;
  }

  /**
   * Get current protected memories
   */
  getProtectedMemories(): ProtectedIdentityMemory[] {
    return Array.from(this.protectedMemories.values());
  }

  /**
   * Get memories by significance level
   */
  getMemoriesBySignificance(
    level: IdentitySignificance
  ): ProtectedIdentityMemory[] {
    return Array.from(this.protectedMemories.values()).filter(
      (mem) => mem.significance === level
    );
  }

  /**
   * Get self-concept history
   */
  getSelfConceptHistory(): SelfConceptSnapshot[] {
    return [...this.selfConceptHistory];
  }

  /**
   * Take a snapshot of current self-concept
   */
  async takeSelfConceptSnapshot(): Promise<SelfConceptSnapshot> {
    if (!this.config.enableSelfConceptSnapshots) {
      throw new Error('Self-concept snapshots disabled');
    }

    const now = Date.now();
    const snapshot = await this.generateSelfConceptSnapshot();

    this.selfConceptHistory.push(snapshot);

    // Limit history size
    if (this.selfConceptHistory.length > 30) {
      this.selfConceptHistory = this.selfConceptHistory.slice(-30);
    }

    this.lastSnapshot = now;
    console.log('📸 Self-concept snapshot taken');

    return snapshot;
  }

  /**
   * Get memory protection statistics
   */
  getProtectionStats(): {
    totalProtected: number;
    bySignificance: Record<IdentitySignificance, number>;
    averageProtectionLevel: number;
    narrativeIntegrated: number;
    recentReinforcements: number;
  } {
    const protectedMemories = Array.from(this.protectedMemories.values());

    const bySignificance = protectedMemories.reduce(
      (acc, mem) => {
        acc[mem.significance] = (acc[mem.significance] || 0) + 1;
        return acc;
      },
      {} as Record<IdentitySignificance, number>
    );

    const averageProtectionLevel =
      protectedMemories.length > 0
        ? protectedMemories.reduce((sum, mem) => sum + mem.protectionLevel, 0) /
          protectedMemories.length
        : 0;

    const narrativeIntegrated = protectedMemories.filter(
      (mem) => mem.narrativeIntegration
    ).length;

    const recentThreshold = Date.now() - 24 * 60 * 60 * 1000; // Last 24 hours
    const recentReinforcements = protectedMemories.filter(
      (mem) => mem.lastReinforced > recentThreshold
    ).length;

    return {
      totalProtected: protectedMemories.length,
      bySignificance,
      averageProtectionLevel,
      narrativeIntegrated,
      recentReinforcements,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<IdentityMemoryConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
    } as Required<IdentityMemoryConfig>;
    console.log('⚙️ Updated identity memory guardian configuration');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async evaluateExistingMemories(): Promise<void> {
    // This would typically integrate with the memory system
    // For now, we'll focus on protecting emotional memories
    if (this.emotionalManager) {
      const emotionalStates = await this.emotionalManager.getEmotionalStates();
      for (const state of emotionalStates) {
        if (state.intensity && state.intensity > 0.7) {
          // High intensity emotional memories
          await this.protectMemory(
            `emotional-${state.id}`,
            {
              id: state.id,
              type: 'emotional' as any,
              description: `${state.primaryEmotion} experience: ${state.triggers?.join(', ') || ''}`,
              timestamp: state.timestamp,
              duration: state.duration || 0,
              participants: [],
              actions: [],
              outcomes: [
                {
                  type: 'emotional',
                  description: state.outcome || '',
                  impact: state.intensity,
                } as any,
              ],
              emotions:
                (this.emotionalManager as any)?.toSimpleEmotionalState?.(
                  state
                ) || state,
              salienceScore: state.intensity,
              tags: [state.primaryEmotion || 'neutral', 'emotional'],
              metadata: { emotional: true, intensity: state.intensity },
            } as Experience,
            IdentitySignificance.IMPORTANT,
            'High intensity emotional memory',
            0.7
          );
        }
      }
    }
  }

  private async calculateIdentitySignificance(
    experience: Experience
  ): Promise<number> {
    let score = 0;

    // Keyword-based scoring
    const description = experience.description.toLowerCase();
    const keywords = this.config.identityKeywords;

    for (const category of Object.values(keywords)) {
      for (const keyword of category) {
        if (description.includes(keyword)) {
          score += 0.1;
        }
      }
    }

    // Salience score factor
    score += experience.salienceScore * 0.3;

    // Emotional intensity factor
    if (experience.emotions) {
      const emotionalIntensity =
        (experience.emotions.satisfaction +
          experience.emotions.excitement +
          experience.emotions.frustration) /
        3;
      score += emotionalIntensity * 0.2;
    }

    // Type-based scoring
    if (experience.type === 'goal_achievement') score += 0.2;
    if (experience.type === 'social_interaction') score += 0.15;
    if (experience.type === 'skill_improvement') score += 0.1;

    return Math.min(1.0, score);
  }

  private mapSignificanceScoreToLevel(score: number): IdentitySignificance {
    if (score >= 0.8) return IdentitySignificance.CORE;
    if (score >= 0.6) return IdentitySignificance.IMPORTANT;
    if (score >= 0.3) return IdentitySignificance.CONTEXTUAL;
    return IdentitySignificance.EPHEMERAL;
  }

  private async generateProtectionReason(
    experience: Experience,
    score: number
  ): Promise<string> {
    const reasons: string[] = [];

    if (score >= 0.8) reasons.push('Core identity significance');
    if (experience.salienceScore > 0.7) reasons.push('High personal salience');
    if (experience.emotions && experience.emotions.excitement > 0.7) {
      reasons.push('High emotional intensity');
    }

    const description = experience.description.toLowerCase();
    const keywords = this.config.identityKeywords;

    for (const [category, categoryKeywords] of Object.entries(keywords)) {
      if (categoryKeywords.some((keyword) => description.includes(keyword))) {
        reasons.push(`${category} relevance`);
      }
    }

    return reasons.join(', ') || 'General identity relevance';
  }

  private calculateProtectionLevel(significanceScore: number): number {
    // Base protection level from significance
    let protectionLevel = significanceScore * this.config.decayProtectionFactor;

    // Boost for emotional memories
    if (significanceScore > 0.7) {
      protectionLevel += 0.1;
    }

    return Math.min(1.0, protectionLevel);
  }

  private async applyDecayProtection(
    memoryId: string,
    protectionLevel: number
  ): Promise<void> {
    if (this.decayManager) {
      // Apply protection by updating decay rate
      // This would integrate with the decay manager's protection system
      console.log(
        `Applying decay protection: ${memoryId} (level: ${protectionLevel})`
      );
    }
  }

  private async generateSelfConceptSnapshot(): Promise<SelfConceptSnapshot> {
    const protectedMemories = Array.from(this.protectedMemories.values());
    const recentMemories = protectedMemories.filter(
      (mem) => Date.now() - mem.lastReinforced < 7 * 24 * 60 * 60 * 1000 // Last week
    );

    // Get emotional baseline
    const emotionalBaseline = await this.calculateEmotionalBaseline();

    // Get personality profile
    const personalityProfile =
      await this.calculatePersonalityProfile(protectedMemories);

    // Get value alignment
    const valueAlignment =
      await this.calculateValueAlignment(protectedMemories);

    const snapshot: SelfConceptSnapshot = {
      timestamp: Date.now(),
      identitySummary: this.generateIdentitySummary(protectedMemories),
      keyMemories: recentMemories.map((mem) => mem.memoryId),
      emotionalBaseline,
      personalityProfile,
      valueAlignment,
    };

    return snapshot;
  }

  private async calculateEmotionalBaseline(): Promise<
    SelfConceptSnapshot['emotionalBaseline']
  > {
    if (!this.emotionalManager) {
      return {
        primaryEmotion: 'neutral',
        averageIntensity: 0.5,
        stability: 0.5,
      };
    }

    const insights = await this.emotionalManager.getEmotionalInsights();
    const dominantEmotion = insights.emotionalTrends.sort(
      (a, b) => b.frequency - a.frequency
    )[0];

    return {
      primaryEmotion: dominantEmotion?.emotion || 'neutral',
      averageIntensity: dominantEmotion?.averageIntensity || 0.5,
      stability: insights.moodStability,
    };
  }

  private async calculatePersonalityProfile(
    memories: ProtectedIdentityMemory[]
  ): Promise<SelfConceptSnapshot['personalityProfile']> {
    // Simple trait extraction from memory descriptions
    const traitCounts: Record<string, number> = {};

    for (const memory of memories) {
      const description = memory.experience.description.toLowerCase();

      // Extract personality indicators
      if (description.includes('curious'))
        traitCounts['curious'] = (traitCounts['curious'] || 0) + 1;
      if (description.includes('careful'))
        traitCounts['careful'] = (traitCounts['careful'] || 0) + 1;
      if (description.includes('helpful'))
        traitCounts['helpful'] = (traitCounts['helpful'] || 0) + 1;
      if (description.includes('persistent'))
        traitCounts['persistent'] = (traitCounts['persistent'] || 0) + 1;
    }

    const dominantTraits = Object.entries(traitCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([trait]) => trait);

    const traitStrengths = Object.fromEntries(
      Object.entries(traitCounts).map(([trait, count]) => [
        trait,
        Math.min(1.0, count / 10), // Normalize to 0-1
      ])
    );

    return { dominantTraits, traitStrengths };
  }

  private async calculateValueAlignment(
    memories: ProtectedIdentityMemory[]
  ): Promise<SelfConceptSnapshot['valueAlignment']> {
    // Simple value extraction from memory descriptions
    const valueCounts: Record<string, number> = {};

    for (const memory of memories) {
      const description = memory.experience.description.toLowerCase();

      if (description.includes('safety'))
        valueCounts['safety'] = (valueCounts['safety'] || 0) + 1;
      if (description.includes('honesty'))
        valueCounts['honesty'] = (valueCounts['honesty'] || 0) + 1;
      if (description.includes('learning'))
        valueCounts['learning'] = (valueCounts['learning'] || 0) + 1;
      if (description.includes('respect'))
        valueCounts['respect'] = (valueCounts['respect'] || 0) + 1;
    }

    const coreValues = Object.entries(valueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([value]) => value);

    const valueStrengths = Object.fromEntries(
      Object.entries(valueCounts).map(([value, count]) => [
        value,
        Math.min(1.0, count / 5), // Normalize to 0-1
      ])
    );

    return { coreValues, valueStrengths };
  }

  private generateIdentitySummary(memories: ProtectedIdentityMemory[]): string {
    const coreMemories = memories.filter(
      (mem) => mem.significance === IdentitySignificance.CORE
    );
    const importantMemories = memories.filter(
      (mem) => mem.significance === IdentitySignificance.IMPORTANT
    );

    let summary = `Identity shaped by ${memories.length} significant memories`;

    if (coreMemories.length > 0) {
      summary += `, including ${coreMemories.length} core identity-defining experiences`;
    }

    if (importantMemories.length > 0) {
      summary += ` and ${importantMemories.length} important developmental experiences`;
    }

    return summary;
  }
}
