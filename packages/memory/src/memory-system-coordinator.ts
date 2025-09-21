/**
 * Memory System Coordinator
 *
 * Coordinates between different memory systems (emotional, episodic, semantic, etc.)
 * and manages milestones for self-narrative construction. Ensures that identity
 * memories are properly integrated and narrative milestones are triggered at
 * appropriate intervals (10-24 game days).
 *
 * @author @darianrosebrook
 */

import { Experience } from './types';
import { EmotionalMemoryManager } from './emotional-memory-manager';
import { MemoryDecayManager } from './memory-decay-manager';
import {
  SelfNarrativeConstructor,
  SelfNarrative,
} from './self-narrative-constructor';
import { IdentityMemoryGuardian } from './identity-memory-guardian';

/**
 * Memory system coordination configuration
 */
export interface MemorySystemCoordinationConfig {
  /** Enable coordination system */
  enabled: boolean;

  /** How often to check for coordination opportunities (ms) */
  coordinationInterval: number;

  /** Game time tracking */
  gameTimeConfig: {
    /** Enable game time tracking */
    enabled: boolean;
    /** Current game day */
    currentGameDay?: number;
    /** Last coordination check day */
    lastCoordinationDay?: number;
  };

  /** Milestone coordination settings */
  milestoneCoordination: {
    /** Minimum game days between narrative milestones */
    minDaysBetweenNarratives: number;
    /** Maximum game days between narrative milestones */
    maxDaysBetweenNarratives: number;
    /** Minimum experiences for narrative construction */
    minExperiencesForNarrative: number;
    /** Enable emotional milestone triggers */
    enableEmotionalTriggers: boolean;
    /** Enable identity milestone triggers */
    enableIdentityTriggers: boolean;
  };

  /** Memory integration settings */
  memoryIntegration: {
    /** Auto-protect high-salience memories */
    autoProtectHighSalience: boolean;
    /** Salience threshold for auto-protection */
    autoProtectionThreshold: number;
    /** Auto-integrate emotional memories */
    autoIntegrateEmotionalMemories: boolean;
    /** Emotional intensity threshold for auto-integration */
    emotionalIntegrationThreshold: number;
  };

  /** Cross-system communication */
  crossSystemCommunication: {
    /** Share emotional context with episodic memory */
    shareEmotionalContext: boolean;
    /** Share identity insights with narrative system */
    shareIdentityInsights: boolean;
    /** Enable memory consolidation across systems */
    enableMemoryConsolidation: boolean;
  };
}

/**
 * Coordination event types
 */
export enum CoordinationEventType {
  NARRATIVE_MILESTONE = 'narrative_milestone',
  EMOTIONAL_INTEGRATION = 'emotional_integration',
  IDENTITY_PROTECTION = 'identity_protection',
  MEMORY_CONSOLIDATION = 'memory_consolidation',
  SELF_CONCEPT_UPDATE = 'self_concept_update',
  CROSS_SYSTEM_SYNC = 'cross_system_sync',
}

/**
 * Coordination event
 */
export interface CoordinationEvent {
  id: string;
  type: CoordinationEventType;
  timestamp: number;
  description: string;
  systems: string[];
  data: Record<string, any>;
  result?: any;
}

/**
 * Memory system coordination status
 */
export interface CoordinationStatus {
  lastCoordination: number;
  currentGameDay: number;
  systemsOnline: string[];
  pendingEvents: CoordinationEvent[];
  recentEvents: CoordinationEvent[];
  milestoneStatus: {
    daysSinceLastNarrative: number;
    experiencesAccumulated: number;
    emotionalIntensity: number;
    identityChangeScore: number;
    nextMilestoneEligible: boolean;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_COORDINATION_CONFIG: Partial<MemorySystemCoordinationConfig> =
  {
    enabled: true,
    coordinationInterval: 60 * 60 * 1000, // 1 hour
    gameTimeConfig: {
      enabled: true,
      currentGameDay: 0,
      lastCoordinationDay: 0,
    },
    milestoneCoordination: {
      minDaysBetweenNarratives: 10,
      maxDaysBetweenNarratives: 24,
      minExperiencesForNarrative: 5,
      enableEmotionalTriggers: true,
      enableIdentityTriggers: true,
    },
    memoryIntegration: {
      autoProtectHighSalience: true,
      autoProtectionThreshold: 0.7,
      autoIntegrateEmotionalMemories: true,
      emotionalIntegrationThreshold: 0.6,
    },
    crossSystemCommunication: {
      shareEmotionalContext: true,
      shareIdentityInsights: true,
      enableMemoryConsolidation: true,
    },
  };

/**
 * Coordinates memory systems and manages narrative milestones
 */
export class MemorySystemCoordinator {
  private config: Required<MemorySystemCoordinationConfig>;
  private coordinationEvents: CoordinationEvent[] = [];
  private lastCoordination: number = 0;

  // System references
  private emotionalManager?: EmotionalMemoryManager;
  private decayManager?: MemoryDecayManager;
  private narrativeConstructor?: SelfNarrativeConstructor;
  private identityGuardian?: IdentityMemoryGuardian;

  // Recent experiences for milestone evaluation
  private recentExperiences: Experience[] = [];

  constructor(
    config: Partial<MemorySystemCoordinationConfig> = {},
    emotionalManager?: EmotionalMemoryManager,
    decayManager?: MemoryDecayManager,
    narrativeConstructor?: SelfNarrativeConstructor,
    identityGuardian?: IdentityMemoryGuardian
  ) {
    this.config = {
      ...DEFAULT_COORDINATION_CONFIG,
      ...config,
    } as Required<MemorySystemCoordinationConfig>;

    this.emotionalManager = emotionalManager;
    this.decayManager = decayManager;
    this.narrativeConstructor = narrativeConstructor;
    this.identityGuardian = identityGuardian;
  }

  /**
   * Initialize the coordinator
   */
  async initialize(): Promise<void> {
    if (this.config.enabled) {
      console.log('🔄 Memory System Coordinator initialized');
      console.log(
        `📅 Milestone interval: ${this.config.milestoneCoordination.minDaysBetweenNarratives}-` +
          `${this.config.milestoneCoordination.maxDaysBetweenNarratives} game days`
      );
    }
  }

  /**
   * Add an experience for coordination processing
   */
  async addExperience(experience: Experience): Promise<void> {
    if (!this.config.enabled) return;

    this.recentExperiences.push(experience);

    // Limit recent experiences buffer
    if (this.recentExperiences.length > 100) {
      this.recentExperiences = this.recentExperiences.slice(-100);
    }

    // Check for immediate coordination opportunities
    await this.checkImmediateCoordination(experience);
  }

  /**
   * Coordinate memory systems and check for milestones
   */
  async coordinateSystems(
    currentGameDay?: number
  ): Promise<CoordinationEvent[]> {
    if (!this.config.enabled) return [];

    const now = Date.now();

    // Update game day if provided
    if (currentGameDay !== undefined) {
      this.config.gameTimeConfig.currentGameDay = currentGameDay;
    }

    // Check if coordination interval has passed
    if (now - this.lastCoordination < this.config.coordinationInterval) {
      return [];
    }

    this.lastCoordination = now;
    console.log('🔄 Coordinating memory systems...');

    const events: CoordinationEvent[] = [];

    // Update coordination day
    if (
      this.config.gameTimeConfig.enabled &&
      this.config.gameTimeConfig.currentGameDay
    ) {
      this.config.gameTimeConfig.lastCoordinationDay =
        this.config.gameTimeConfig.currentGameDay;
    }

    // Check for narrative milestone
    const milestoneEvent = await this.checkNarrativeMilestone();
    if (milestoneEvent) {
      events.push(milestoneEvent);
    }

    // Check for emotional integration opportunities
    const emotionalEvent = await this.checkEmotionalIntegration();
    if (emotionalEvent) {
      events.push(emotionalEvent);
    }

    // Check for identity protection opportunities
    const identityEvent = await this.checkIdentityProtection();
    if (identityEvent) {
      events.push(identityEvent);
    }

    // Perform cross-system synchronization
    const syncEvent = await this.performCrossSystemSync();
    if (syncEvent) {
      events.push(syncEvent);
    }

    // Execute coordination events
    for (const event of events) {
      await this.executeCoordinationEvent(event);
    }

    // Limit event history
    if (this.coordinationEvents.length > 100) {
      this.coordinationEvents = this.coordinationEvents.slice(-100);
    }

    console.log(`✅ Coordination complete: ${events.length} events processed`);
    return events;
  }

  /**
   * Get coordination status
   */
  getCoordinationStatus(): CoordinationStatus {
    const systemsOnline: string[] = [];
    if (this.emotionalManager) systemsOnline.push('emotional');
    if (this.decayManager) systemsOnline.push('decay');
    if (this.narrativeConstructor) systemsOnline.push('narrative');
    if (this.identityGuardian) systemsOnline.push('identity');

    const now = Date.now();
    const daysSinceLastNarrative = this.calculateDaysSinceLastNarrative();

    const milestoneStatus = {
      daysSinceLastNarrative,
      experiencesAccumulated: this.recentExperiences.length,
      emotionalIntensity: 0.5, // Would calculate from emotional manager
      identityChangeScore: 0.3, // Would calculate from identity guardian
      nextMilestoneEligible:
        daysSinceLastNarrative >=
        this.config.milestoneCoordination.minDaysBetweenNarratives,
    };

    const recentEvents = this.coordinationEvents.slice(-10);

    return {
      lastCoordination: this.lastCoordination,
      currentGameDay: this.config.gameTimeConfig.currentGameDay || 0,
      systemsOnline,
      pendingEvents: [],
      recentEvents,
      milestoneStatus,
    };
  }

  /**
   * Get recent coordination events
   */
  getRecentEvents(count: number = 10): CoordinationEvent[] {
    return this.coordinationEvents.slice(-count);
  }

  /**
   * Update game day
   */
  updateGameDay(gameDay: number): void {
    this.config.gameTimeConfig.currentGameDay = gameDay;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MemorySystemCoordinationConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
    } as Required<MemorySystemCoordinationConfig>;
    console.log('⚙️ Updated memory system coordinator configuration');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async checkImmediateCoordination(
    experience: Experience
  ): Promise<void> {
    // Auto-protect high-salience memories
    if (
      this.config.memoryIntegration.autoProtectHighSalience &&
      this.identityGuardian &&
      experience.salienceScore >=
        this.config.memoryIntegration.autoProtectionThreshold
    ) {
      const evaluation =
        await this.identityGuardian.evaluateMemoryForProtection(
          experience.id,
          experience
        );

      if (evaluation.shouldProtect) {
        await this.identityGuardian.protectMemory(
          experience.id,
          experience,
          evaluation.significance,
          evaluation.reason,
          evaluation.protectionLevel
        );
      }
    }

    // Auto-integrate high-intensity emotional memories
    if (
      this.config.memoryIntegration.autoIntegrateEmotionalMemories &&
      this.identityGuardian &&
      experience.emotions &&
      (experience.emotions.excitement >
        this.config.memoryIntegration.emotionalIntegrationThreshold ||
        experience.emotions.satisfaction >
          this.config.memoryIntegration.emotionalIntegrationThreshold ||
        experience.emotions.frustration >
          this.config.memoryIntegration.emotionalIntegrationThreshold)
    ) {
      const evaluation =
        await this.identityGuardian.evaluateMemoryForProtection(
          experience.id,
          experience
        );

      if (evaluation.shouldProtect) {
        await this.identityGuardian.protectMemory(
          experience.id,
          experience,
          evaluation.significance,
          evaluation.reason,
          evaluation.protectionLevel
        );
      }
    }
  }

  private async checkNarrativeMilestone(): Promise<CoordinationEvent | null> {
    if (!this.narrativeConstructor) return null;

    const daysSinceLastNarrative = this.calculateDaysSinceLastNarrative();
    const minDays = this.config.milestoneCoordination.minDaysBetweenNarratives;
    const maxDays = this.config.milestoneCoordination.maxDaysBetweenNarratives;

    // Check if milestone interval has been reached
    if (daysSinceLastNarrative < minDays) {
      return null; // Too soon for next milestone
    }

    // If we've exceeded max days, trigger milestone regardless
    if (daysSinceLastNarrative >= maxDays) {
      return this.createCoordinationEvent(
        CoordinationEventType.NARRATIVE_MILESTONE,
        'Maximum milestone interval exceeded - triggering narrative construction',
        ['narrative', 'emotional', 'identity'],
        {
          daysSinceLast: daysSinceLastNarrative,
          reason: 'max_interval_exceeded',
          experienceCount: this.recentExperiences.length,
        }
      );
    }

    // Check if we have enough experiences
    if (
      this.recentExperiences.length <
      this.config.milestoneCoordination.minExperiencesForNarrative
    ) {
      return null;
    }

    // Check emotional intensity if enabled
    if (this.config.milestoneCoordination.enableEmotionalTriggers) {
      const emotionalIntensity = await this.calculateEmotionalIntensity();
      if (emotionalIntensity < 0.3) {
        return null; // Not enough emotional intensity for milestone
      }
    }

    // Check identity change if enabled
    if (this.config.milestoneCoordination.enableIdentityTriggers) {
      const identityChange = await this.calculateIdentityChangeScore();
      if (identityChange < 0.2) {
        return null; // Not enough identity change for milestone
      }
    }

    return this.createCoordinationEvent(
      CoordinationEventType.NARRATIVE_MILESTONE,
      `Narrative milestone ready: ${daysSinceLastNarrative} days, ${this.recentExperiences.length} experiences`,
      ['narrative', 'emotional', 'identity'],
      {
        daysSinceLast: daysSinceLastNarrative,
        reason: 'milestone_conditions_met',
        experienceCount: this.recentExperiences.length,
        emotionalIntensity: await this.calculateEmotionalIntensity(),
        identityChangeScore: await this.calculateIdentityChangeScore(),
      }
    );
  }

  private async checkEmotionalIntegration(): Promise<CoordinationEvent | null> {
    if (!this.config.crossSystemCommunication.shareEmotionalContext)
      return null;

    // Check if emotional memories need integration with other systems
    if (this.emotionalManager) {
      const insights = await this.emotionalManager.getEmotionalInsights();
      const highIntensityStates = insights.emotionalTrends.filter(
        (t) => t.averageIntensity > 0.7
      );

      if (highIntensityStates.length > 0) {
        return this.createCoordinationEvent(
          CoordinationEventType.EMOTIONAL_INTEGRATION,
          `${highIntensityStates.length} high-intensity emotional states detected for integration`,
          ['emotional', 'episodic', 'identity'],
          {
            highIntensityCount: highIntensityStates.length,
            dominantEmotions: highIntensityStates.map((t) => t.emotion),
          }
        );
      }
    }

    return null;
  }

  private async checkIdentityProtection(): Promise<CoordinationEvent | null> {
    if (!this.identityGuardian) return null;

    const stats = this.identityGuardian.getProtectionStats();
    const recentThreshold = Date.now() - 24 * 60 * 60 * 1000; // Last 24 hours

    // Check if significant identity changes have occurred
    const recentReinforcements = stats.recentReinforcements;
    if (recentReinforcements > 5) {
      return this.createCoordinationEvent(
        CoordinationEventType.IDENTITY_PROTECTION,
        `Significant identity reinforcement detected: ${recentReinforcements} recent changes`,
        ['identity', 'emotional'],
        {
          recentReinforcements,
          totalProtected: stats.totalProtected,
        }
      );
    }

    return null;
  }

  private async performCrossSystemSync(): Promise<CoordinationEvent | null> {
    if (!this.config.crossSystemCommunication.enableMemoryConsolidation)
      return null;

    // Perform periodic synchronization between systems
    const syncData = {
      emotionalHealthScore: 0.5,
      protectedMemoriesCount: 0,
      recentNarrativesCount: 0,
      decayCleanupNeeded: false,
    };

    if (this.emotionalManager) {
      const insights = await this.emotionalManager.getEmotionalInsights();
      syncData.emotionalHealthScore = insights.emotionalHealthScore;
    }

    if (this.identityGuardian) {
      const stats = this.identityGuardian.getProtectionStats();
      syncData.protectedMemoriesCount = stats.totalProtected;
    }

    if (this.narrativeConstructor) {
      const narrativeStats = this.narrativeConstructor.getNarrativeStats();
      syncData.recentNarrativesCount = narrativeStats.totalNarratives;
    }

    if (this.decayManager) {
      const accessRecords = this.decayManager.getAllAccessRecords();
      const forgottenMemories = accessRecords.filter(
        (record) => record.accessPattern === 'forgotten'
      );
      syncData.decayCleanupNeeded = forgottenMemories.length > 10;
    }

    return this.createCoordinationEvent(
      CoordinationEventType.CROSS_SYSTEM_SYNC,
      'Periodic cross-system synchronization',
      ['emotional', 'identity', 'narrative', 'decay'],
      syncData
    );
  }

  private async executeCoordinationEvent(
    event: CoordinationEvent
  ): Promise<void> {
    console.log(`🔄 Executing ${event.type}: ${event.description}`);

    try {
      switch (event.type) {
        case CoordinationEventType.NARRATIVE_MILESTONE:
          await this.executeNarrativeMilestone(event);
          break;
        case CoordinationEventType.EMOTIONAL_INTEGRATION:
          await this.executeEmotionalIntegration(event);
          break;
        case CoordinationEventType.IDENTITY_PROTECTION:
          await this.executeIdentityProtection(event);
          break;
        case CoordinationEventType.CROSS_SYSTEM_SYNC:
          await this.executeCrossSystemSync(event);
          break;
      }

      event.result = { success: true };
      console.log(`✅ ${event.type} executed successfully`);
    } catch (error) {
      console.error(`❌ Failed to execute ${event.type}:`, error);
      event.result = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    this.coordinationEvents.push(event);
  }

  private async executeNarrativeMilestone(
    event: CoordinationEvent
  ): Promise<void> {
    if (!this.narrativeConstructor) return;

    const narrative =
      await this.narrativeConstructor.checkAndConstructNarrative(
        this.recentExperiences,
        this.config.gameTimeConfig.currentGameDay
      );

    if (narrative) {
      event.result = {
        success: true,
        narrativeId: narrative.id,
        narrativeTitle: narrative.narrative.title,
        significance: narrative.significance,
      };
    }
  }

  private async executeEmotionalIntegration(
    event: CoordinationEvent
  ): Promise<void> {
    // Share emotional context with other systems
    if (
      this.config.crossSystemCommunication.shareEmotionalContext &&
      this.identityGuardian
    ) {
      await this.identityGuardian.takeSelfConceptSnapshot();
    }
  }

  private async executeIdentityProtection(
    event: CoordinationEvent
  ): Promise<void> {
    // Trigger identity protection review
    if (this.identityGuardian) {
      const stats = this.identityGuardian.getProtectionStats();
      console.log(
        `🛡️ Identity protection status: ${stats.totalProtected} memories protected`
      );
    }
  }

  private async executeCrossSystemSync(
    event: CoordinationEvent
  ): Promise<void> {
    // Perform memory consolidation if needed
    if (event.data.decayCleanupNeeded && this.decayManager) {
      await this.decayManager.forceCleanup();
    }
  }

  private calculateDaysSinceLastNarrative(): number {
    if (!this.narrativeConstructor) return 0;

    const narratives = this.narrativeConstructor.getNarratives();
    if (narratives.length === 0) return Infinity;

    const lastNarrative = narratives[narratives.length - 1];
    const daysSince =
      (Date.now() - lastNarrative.timestamp) / (1000 * 60 * 60 * 24);
    return Math.floor(daysSince);
  }

  private async calculateEmotionalIntensity(): Promise<number> {
    if (!this.emotionalManager) return 0.5;

    const insights = await this.emotionalManager.getEmotionalInsights();
    const avgIntensity = insights.emotionalTrends.reduce(
      (sum, trend) => sum + trend.averageIntensity * trend.frequency,
      0
    );

    return avgIntensity;
  }

  private async calculateIdentityChangeScore(): Promise<number> {
    if (!this.identityGuardian) return 0.3;

    const stats = this.identityGuardian.getProtectionStats();
    const recentThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000; // Last week

    // Simple calculation based on recent reinforcements
    const changeScore = Math.min(1.0, stats.recentReinforcements / 20);
    return changeScore;
  }

  private createCoordinationEvent(
    type: CoordinationEventType,
    description: string,
    systems: string[],
    data: Record<string, any>
  ): CoordinationEvent {
    return {
      id: `coord-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: Date.now(),
      description,
      systems,
      data,
    };
  }
}
