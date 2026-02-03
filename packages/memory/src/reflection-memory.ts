/**
 * Reflection Memory System
 *
 * Manages self-reflection, lessons learned, narrative development, and
 * metacognitive processes. Supports the agent's ability to reflect on
 * experiences, learn from them, and develop a coherent sense of self.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { z } from 'zod';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface ReflectionEntry {
  id: string;
  timestamp: number;
  type:
    | 'progress'
    | 'failure'
    | 'success'
    | 'adaptation'
    | 'meta'
    | 'narrative'
    | 'identity';
  content: string;
  context: {
    emotionalState: string;
    currentGoals: string[];
    recentEvents: string[];
    location: any;
    timeOfDay: string;
  };
  insights: string[];
  lessons: string[];
  emotionalValence: number; // -1 to 1
  confidence: number; // 0-1
  relevance: number; // 0-1
  tags: string[];
  associations: ReflectionAssociation[];
  narrativeContext: string; // How this fits into the agent's story
  selfModelImpact: SelfModelUpdate[];
}

export interface ReflectionAssociation {
  type: 'cause' | 'effect' | 'similar' | 'contrast' | 'generalization';
  reflectionId: string;
  strength: number; // 0-1
  reasoning: string;
  createdAt: number;
}

export interface SelfModelUpdate {
  aspect:
    | 'personality'
    | 'values'
    | 'skills'
    | 'preferences'
    | 'goals'
    | 'identity';
  change: string;
  magnitude: number; // 0-1
  reasoning: string;
  confidence: number;
  timestamp: number;
}

export interface LessonLearned {
  id: string;
  content: string;
  category: 'technical' | 'social' | 'emotional' | 'strategic' | 'ethical';
  applicability: string[];
  successRate: number;
  firstLearned: number;
  lastApplied: number;
  applicationCount: number;
  effectiveness: number; // 0-1
  confidence: number;
  prerequisites: string[];
  relatedLessons: string[];
  tags: string[];
}

export interface NarrativeCheckpoint {
  id: string;
  timestamp: number;
  title: string;
  summary: string;
  keyEvents: string[];
  characterDevelopment: CharacterDevelopment[];
  currentGoals: string[];
  futureAspirations: string[];
  selfAssessment: string;
  emotionalTone: string;
  significance: number; // 0-1
  narrativeArc: 'beginning' | 'rising' | 'climax' | 'falling' | 'resolution';
}

export interface CharacterDevelopment {
  aspect: string;
  oldState: string;
  newState: string;
  trigger: string;
  significance: number;
  timestamp: number;
}

export interface MetacognitionEntry {
  id: string;
  timestamp: number;
  type: 'planning' | 'monitoring' | 'evaluation' | 'control';
  content: string;
  cognitiveProcess: string;
  outcome: 'improved' | 'unchanged' | 'degraded';
  reasoning: string;
  confidence: number;
  performanceImpact: number; // -1 to 1
}

export interface ReflectionMemoryConfig {
  /** Maximum number of reflection entries to keep */
  maxReflections: number;

  /** How often to generate narrative checkpoints */
  checkpointInterval: number; // ms

  /** Minimum confidence for lesson learning */
  minLessonConfidence: number;

  /** Enable narrative development tracking */
  enableNarrativeTracking: boolean;

  /** Enable metacognition tracking */
  enableMetacognition: boolean;

  /** Enable self-model updates */
  enableSelfModelUpdates: boolean;

  /** Context window for reflection associations */
  associationContextWindow: number; // ms

  /** Minimum relevance threshold for storing reflections */
  minReflectionRelevance: number;

  /** Emotional decay rate for old reflections */
  emotionalDecayRate: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_REFLECTION_MEMORY_CONFIG: ReflectionMemoryConfig = {
  maxReflections: 1000,
  checkpointInterval: 24 * 60 * 60 * 1000, // 24 hours
  minLessonConfidence: 0.6,
  enableNarrativeTracking: true,
  enableMetacognition: true,
  enableSelfModelUpdates: true,
  associationContextWindow: 60 * 60 * 1000, // 1 hour
  minReflectionRelevance: 0.3,
  emotionalDecayRate: 0.05, // 5% decay per day
};

// ============================================================================
// Reflection Memory Manager
// ============================================================================

/**
 * Manages reflection, learning, and narrative development
 */
export class ReflectionMemoryManager extends EventEmitter {
  private config: ReflectionMemoryConfig;
  private reflections: Map<string, ReflectionEntry> = new Map();
  private lessons: Map<string, LessonLearned> = new Map();
  private narrativeCheckpoints: NarrativeCheckpoint[] = [];
  private metacognitionEntries: MetacognitionEntry[] = [];
  private lastCheckpoint: number = 0;
  private selfModelHistory: SelfModelUpdate[] = [];

  constructor(config: Partial<ReflectionMemoryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_REFLECTION_MEMORY_CONFIG, ...config };
  }

  /**
   * Add a new reflection
   * @param dedupeKey Optional deterministic key for idempotent persistence.
   *   When provided, used as reflection.id to guarantee end-to-end dedupe.
   */
  async addReflection(
    type: ReflectionEntry['type'],
    content: string,
    context: ReflectionEntry['context'],
    insights: string[] = [],
    lessons: string[] = [],
    dedupeKey?: string
  ): Promise<ReflectionEntry> {
    const reflection: ReflectionEntry = {
      id: dedupeKey || `reflection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type,
      content,
      context,
      insights,
      lessons,
      emotionalValence: this.calculateEmotionalValence(content),
      confidence: this.calculateConfidence(content, context),
      relevance: this.calculateRelevance(content, context),
      tags: this.extractTags(content),
      associations: [],
      narrativeContext: '',
      selfModelImpact: [],
    };

    // Only store if relevance is above threshold
    if (reflection.relevance >= this.config.minReflectionRelevance) {
      this.reflections.set(reflection.id, reflection);

      // Emit for async persistence — never awaited by caller
      this.emit('reflection:created', reflection);

      // Find associations with existing reflections
      if (this.config.enableNarrativeTracking) {
        await this.findReflectionAssociations(reflection);
      }

      // Extract and store lessons
      await this.extractLessons(reflection);

      // Generate narrative context
      if (this.config.enableNarrativeTracking) {
        reflection.narrativeContext =
          await this.generateNarrativeContext(reflection);
      }

      // Update self-model if enabled
      if (this.config.enableSelfModelUpdates) {
        await this.updateSelfModel(reflection);
      }

      // Check for narrative checkpoint
      await this.checkNarrativeCheckpoint();

      console.log(
        `🧘 Added reflection: ${type} - ${content.substring(0, 100)}...`
      );
    }

    return reflection;
  }

  /**
   * Check if a reflection exists by ID (used for in-memory dedupe before DB flush)
   */
  hasReflection(id: string): boolean {
    return this.reflections.has(id);
  }

  /**
   * Get reflections by type and time range
   */
  getReflections(
    type?: ReflectionEntry['type'],
    timeRange?: { start: number; end: number }
  ): ReflectionEntry[] {
    let reflections = Array.from(this.reflections.values());

    if (type) {
      reflections = reflections.filter((r) => r.type === type);
    }

    if (timeRange) {
      reflections = reflections.filter(
        (r) => r.timestamp >= timeRange.start && r.timestamp <= timeRange.end
      );
    }

    return reflections.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get reflections relevant to a specific context
   */
  getContextualReflections(
    context: {
      currentGoals?: string[];
      emotionalState?: string;
      recentEvents?: string[];
      location?: any;
      maxResults?: number;
    } = {}
  ): ReflectionEntry[] {
    const { maxResults = 10 } = context;

    return Array.from(this.reflections.values())
      .filter((reflection) => {
        // Filter by emotional state if provided
        if (context.emotionalState) {
          const emotionalMatch =
            reflection.context.emotionalState === context.emotionalState;
          if (!emotionalMatch) return false;
        }

        // Filter by location if provided
        if (context.location && reflection.context.location) {
          const locationMatch = this.locationsMatch(
            context.location,
            reflection.context.location
          );
          if (!locationMatch) return false;
        }

        // Filter by recent events if provided
        if (context.recentEvents && reflection.context.recentEvents) {
          const eventOverlap = context.recentEvents.filter((event) =>
            reflection.context.recentEvents.includes(event)
          ).length;
          if (eventOverlap === 0) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by relevance, then by recency
        const relevanceDiff = b.relevance - a.relevance;
        if (Math.abs(relevanceDiff) > 0.1) {
          return relevanceDiff;
        }
        return b.timestamp - a.timestamp;
      })
      .slice(0, maxResults);
  }

  /**
   * Get lessons learned
   */
  getLessons(category?: LessonLearned['category']): LessonLearned[] {
    let lessons = Array.from(this.lessons.values());

    if (category) {
      lessons = lessons.filter((l) => l.category === category);
    }

    return lessons.sort((a, b) => b.effectiveness - a.effectiveness);
  }

  /**
   * Get narrative checkpoints
   */
  getNarrativeCheckpoints(): NarrativeCheckpoint[] {
    return [...this.narrativeCheckpoints].sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }

  /**
   * Get metacognition entries
   */
  getMetacognitionEntries(
    type?: MetacognitionEntry['type']
  ): MetacognitionEntry[] {
    let entries = [...this.metacognitionEntries];

    if (type) {
      entries = entries.filter((e) => e.type === type);
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Generate narrative checkpoint
   */
  async generateNarrativeCheckpoint(): Promise<NarrativeCheckpoint> {
    const checkpoint: NarrativeCheckpoint = {
      id: `narrative-${Date.now()}`,
      timestamp: Date.now(),
      title: await this.generateCheckpointTitle(),
      summary: await this.generateNarrativeSummary(),
      keyEvents: this.getKeyEventsForCheckpoint(),
      characterDevelopment: this.analyzeCharacterDevelopment(),
      currentGoals: this.getCurrentGoals(),
      futureAspirations: this.getFutureAspirations(),
      selfAssessment: await this.generateSelfAssessment(),
      emotionalTone: this.calculateEmotionalTone(),
      significance: this.calculateNarrativeSignificance(),
      narrativeArc: this.determineNarrativeArc(),
    };

    this.narrativeCheckpoints.push(checkpoint);
    this.lastCheckpoint = Date.now();

    // Emit for async persistence
    this.emit('checkpoint:created', checkpoint);

    console.log(`📖 Generated narrative checkpoint: ${checkpoint.title}`);
    return checkpoint;
  }

  /**
   * Add metacognition entry
   */
  addMetacognitionEntry(
    type: MetacognitionEntry['type'],
    content: string,
    cognitiveProcess: string,
    outcome: MetacognitionEntry['outcome'],
    reasoning: string
  ): MetacognitionEntry {
    const entry: MetacognitionEntry = {
      id: `meta-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type,
      content,
      cognitiveProcess,
      outcome,
      reasoning,
      confidence: 0.8, // Metacognition entries have high confidence
      performanceImpact: this.calculatePerformanceImpact(outcome),
    };

    this.metacognitionEntries.push(entry);

    // Limit metacognition entries
    if (this.metacognitionEntries.length > 100) {
      this.metacognitionEntries = this.metacognitionEntries.slice(-100);
    }

    console.log(`🧠 Added metacognition entry: ${type} - ${cognitiveProcess}`);
    return entry;
  }

  /**
   * Clean up old reflections
   */
  cleanup(): void {
    const cutoffTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
    const minRelevance = 0.2; // Keep reflections with at least 20% relevance

    const activeReflections: ReflectionEntry[] = [];

    for (const reflection of this.reflections.values()) {
      // Apply emotional decay
      reflection.emotionalValence *= 1 - this.config.emotionalDecayRate;

      // Keep if recent or highly relevant
      if (
        reflection.timestamp > cutoffTime ||
        reflection.relevance > minRelevance
      ) {
        activeReflections.push(reflection);
      }
    }

    // Rebuild reflections map
    this.reflections.clear();
    activeReflections.forEach((reflection) => {
      this.reflections.set(reflection.id, reflection);
    });

    console.log(
      `🧹 Reflection cleanup completed. Active: ${activeReflections.length}`
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private calculateEmotionalValence(content: string): number {
    const positiveWords = [
      'success',
      'happy',
      'good',
      'great',
      'excellent',
      'improved',
      'better',
      'learned',
      'grew',
    ];
    const negativeWords = [
      'failure',
      'sad',
      'bad',
      'terrible',
      'worse',
      'struggle',
      'difficult',
      'problem',
      'error',
    ];

    const lowerContent = content.toLowerCase();
    const positiveCount = positiveWords.filter((word) =>
      lowerContent.includes(word)
    ).length;
    const negativeCount = negativeWords.filter((word) =>
      lowerContent.includes(word)
    ).length;

    const total = positiveCount + negativeCount;
    if (total === 0) return 0;

    return (positiveCount - negativeCount) / total;
  }

  private calculateConfidence(
    content: string,
    context: ReflectionEntry['context']
  ): number {
    // Higher confidence for reflections with specific context
    let confidence = 0.5; // Base confidence

    if (context.currentGoals.length > 0) confidence += 0.2;
    if (context.recentEvents.length > 0) confidence += 0.2;
    if (context.location) confidence += 0.1;

    return Math.min(0.95, confidence);
  }

  private calculateRelevance(
    content: string,
    context: ReflectionEntry['context']
  ): number {
    // Higher relevance for reflections about current goals
    let relevance = 0.5; // Base relevance

    const contentLower = content.toLowerCase();
    const goalKeywords = context.currentGoals.flatMap((goal) =>
      goal.toLowerCase().split(' ')
    );

    const goalMatches = goalKeywords.filter((keyword) =>
      contentLower.includes(keyword)
    ).length;

    relevance += Math.min(0.3, goalMatches * 0.1);

    // Boost for emotional content
    const emotionalIntensity = Math.abs(
      this.calculateEmotionalValence(content)
    );
    relevance += emotionalIntensity * 0.2;

    return Math.min(1.0, relevance);
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];

    // Common reflection tags
    const tagPatterns: Record<string, RegExp[]> = {
      learning: [/learn/i, /improve/i, /better/i],
      emotional: [/feel/i, /emotion/i, /mood/i],
      goal: [/goal/i, /objective/i, /purpose/i],
      social: [/social/i, /interact/i, /relationship/i],
      technical: [/technique/i, /method/i, /strategy/i],
      ethical: [/moral/i, /right/i, /wrong/i, /value/i],
    };

    for (const [tag, patterns] of Object.entries(tagPatterns)) {
      if (patterns.some((pattern) => pattern.test(content))) {
        tags.push(tag);
      }
    }

    return tags;
  }

  private async findReflectionAssociations(
    reflection: ReflectionEntry
  ): Promise<void> {
    const contextWindow = this.config.associationContextWindow;
    const cutoffTime = reflection.timestamp - contextWindow;

    const recentReflections = Array.from(this.reflections.values()).filter(
      (r) => r.timestamp >= cutoffTime && r.id !== reflection.id
    );

    for (const existingReflection of recentReflections) {
      const association = await this.calculateReflectionAssociation(
        reflection,
        existingReflection
      );
      if (association) {
        reflection.associations.push(association);
      }
    }
  }

  private async calculateReflectionAssociation(
    reflection1: ReflectionEntry,
    reflection2: ReflectionEntry
  ): Promise<ReflectionAssociation | null> {
    // Simple association based on shared tags and content similarity
    const sharedTags = reflection1.tags.filter((tag) =>
      reflection2.tags.includes(tag)
    );

    if (sharedTags.length === 0) return null;

    const similarity = this.calculateContentSimilarity(
      reflection1.content,
      reflection2.content
    );

    if (similarity < 0.3) return null;

    let type: ReflectionAssociation['type'] = 'similar';
    let reasoning = `Shared ${sharedTags.length} tags: ${sharedTags.join(', ')}`;

    if (reflection1.type === 'failure' && reflection2.type === 'success') {
      type = 'contrast';
      reasoning = 'Contrasting outcomes with similar context';
    } else if (
      reflection1.context.emotionalState === reflection2.context.emotionalState
    ) {
      type = 'generalization';
      reasoning = 'Similar emotional context suggests pattern';
    }

    return {
      type,
      reflectionId: reflection2.id,
      strength: similarity,
      reasoning,
      createdAt: Date.now(),
    };
  }

  private calculateContentSimilarity(
    content1: string,
    content2: string
  ): number {
    const words1 = content1.toLowerCase().split(/\s+/);
    const words2 = content2.toLowerCase().split(/\s+/);

    const commonWords = words1.filter((word) => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;

    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  private async extractLessons(reflection: ReflectionEntry): Promise<void> {
    for (const lessonContent of reflection.lessons) {
      const lesson: LessonLearned = {
        id: `lesson-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content: lessonContent,
        category: this.categorizeLesson(lessonContent),
        applicability: this.extractApplicability(lessonContent),
        successRate: reflection.confidence,
        firstLearned: Date.now(),
        lastApplied: Date.now(),
        applicationCount: 1,
        effectiveness: 0.5, // Will be updated based on outcomes
        confidence: reflection.confidence,
        prerequisites: [],
        relatedLessons: [],
        tags: this.extractTags(lessonContent),
      };

      this.lessons.set(lesson.id, lesson);

      // Emit for async persistence
      this.emit('lesson:created', lesson);
    }
  }

  private categorizeLesson(content: string): LessonLearned['category'] {
    const lowerContent = content.toLowerCase();

    if (
      lowerContent.includes('social') ||
      lowerContent.includes('relationship') ||
      lowerContent.includes('interact')
    ) {
      return 'social';
    } else if (
      lowerContent.includes('moral') ||
      lowerContent.includes('ethical') ||
      lowerContent.includes('right') ||
      lowerContent.includes('wrong')
    ) {
      return 'ethical';
    } else if (
      lowerContent.includes('strategy') ||
      lowerContent.includes('plan') ||
      lowerContent.includes('approach')
    ) {
      return 'strategic';
    } else if (
      lowerContent.includes('technical') ||
      lowerContent.includes('method') ||
      lowerContent.includes('technique')
    ) {
      return 'technical';
    } else {
      return 'emotional';
    }
  }

  private extractApplicability(content: string): string[] {
    // Extract contexts where this lesson applies
    const applicability: string[] = [];

    if (content.toLowerCase().includes('always')) applicability.push('general');
    if (content.toLowerCase().includes('when'))
      applicability.push('conditional');
    if (content.toLowerCase().includes('danger'))
      applicability.push('hazardous_situations');
    if (content.toLowerCase().includes('social'))
      applicability.push('social_interactions');

    return applicability;
  }

  private async generateNarrativeContext(
    reflection: ReflectionEntry
  ): Promise<string> {
    // Generate how this reflection fits into the agent's overall story
    const context = reflection.context;

    if (reflection.type === 'success' && reflection.emotionalValence > 0.5) {
      return `This success reinforces the agent's growing confidence in ${context.currentGoals[0] || 'their abilities'}.`;
    } else if (
      reflection.type === 'failure' &&
      reflection.emotionalValence < -0.5
    ) {
      return `This setback challenges the agent's current approach and may lead to adaptation in ${context.currentGoals[0] || 'their strategy'}.`;
    } else {
      return `This reflection contributes to the agent's ongoing development and self-understanding.`;
    }
  }

  private async updateSelfModel(reflection: ReflectionEntry): Promise<void> {
    if (reflection.type === 'meta' || reflection.type === 'identity') {
      // This reflection has direct self-model implications
      const update: SelfModelUpdate = {
        aspect: 'identity',
        change: reflection.content,
        magnitude: reflection.relevance,
        reasoning: `Generated from ${reflection.type} reflection`,
        confidence: reflection.confidence,
        timestamp: Date.now(),
      };

      this.selfModelHistory.push(update);

      console.log(
        `🔄 Self-model updated: ${update.aspect} - ${update.change.substring(0, 50)}...`
      );
    }
  }

  private async checkNarrativeCheckpoint(): Promise<void> {
    if (!this.config.enableNarrativeTracking) return;

    const now = Date.now();
    if (now - this.lastCheckpoint > this.config.checkpointInterval) {
      await this.generateNarrativeCheckpoint();
    }
  }

  private async generateCheckpointTitle(): Promise<string> {
    const recentReflections = this.getReflections(undefined, {
      start: Date.now() - this.config.checkpointInterval,
      end: Date.now(),
    });

    const emotionalTone = this.calculateEmotionalTone(recentReflections);
    const majorEvents = recentReflections.filter((r) => r.relevance > 0.7);

    if (majorEvents.length > 0) {
      return `Chapter of ${emotionalTone} Growth`;
    } else {
      return `Reflective Period`;
    }
  }

  private async generateNarrativeSummary(): Promise<string> {
    const recentReflections = this.getReflections(undefined, {
      start: Date.now() - this.config.checkpointInterval,
      end: Date.now(),
    });

    const successCount = recentReflections.filter(
      (r) => r.type === 'success'
    ).length;
    const failureCount = recentReflections.filter(
      (r) => r.type === 'failure'
    ).length;
    const adaptationCount = recentReflections.filter(
      (r) => r.type === 'adaptation'
    ).length;

    return `In this period, the agent experienced ${successCount} successes, ${failureCount} setbacks, and made ${adaptationCount} adaptations to their approach.`;
  }

  private getKeyEventsForCheckpoint(): string[] {
    return this.getReflections(undefined, {
      start: Date.now() - this.config.checkpointInterval,
      end: Date.now(),
    })
      .filter((r) => r.relevance > 0.7)
      .map((r) => r.content.substring(0, 100) + '...');
  }

  private analyzeCharacterDevelopment(): CharacterDevelopment[] {
    // Analyze how the agent has changed over time
    const developments: CharacterDevelopment[] = [];

    const recentReflections = this.getReflections(undefined, {
      start: Date.now() - this.config.checkpointInterval,
      end: Date.now(),
    });

    // Look for changes in emotional patterns
    const positiveReflections = recentReflections.filter(
      (r) => r.emotionalValence > 0.3
    );
    const negativeReflections = recentReflections.filter(
      (r) => r.emotionalValence < -0.3
    );

    if (positiveReflections.length > negativeReflections.length) {
      developments.push({
        aspect: 'emotional_resilience',
        oldState: 'variable emotional state',
        newState: 'more positive outlook',
        trigger: 'recent successes',
        significance: 0.6,
        timestamp: Date.now(),
      });
    }

    return developments;
  }

  private getCurrentGoals(): string[] {
    // Get current goals from context
    const recentReflections = this.getReflections(undefined, {
      start: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
      end: Date.now(),
    });

    const goals = new Set<string>();

    for (const reflection of recentReflections) {
      reflection.context.currentGoals.forEach((goal) => goals.add(goal));
    }

    return Array.from(goals).slice(0, 5);
  }

  private getFutureAspirations(): string[] {
    // Generate aspirations based on recent reflections and learning
    const aspirations: string[] = [];

    const recentLessons = Array.from(this.lessons.values()).filter(
      (lesson) => lesson.lastApplied > Date.now() - 7 * 24 * 60 * 60 * 1000
    );

    if (recentLessons.length > 0) {
      aspirations.push('Master newly learned skills');
    }

    const successRate = this.calculateRecentSuccessRate();
    if (successRate > 0.7) {
      aspirations.push('Take on more challenging objectives');
    }

    return aspirations;
  }

  private async generateSelfAssessment(): Promise<string> {
    const recentReflections = this.getReflections(undefined, {
      start: Date.now() - this.config.checkpointInterval,
      end: Date.now(),
    });

    const successRate = this.calculateRecentSuccessRate(recentReflections);
    const emotionalTrend = this.calculateEmotionalTrend(recentReflections);

    let assessment = `I have maintained a ${successRate > 0.6 ? 'strong' : 'moderate'} success rate `;

    if (emotionalTrend > 0.2) {
      assessment += 'with an increasingly positive emotional state.';
    } else if (emotionalTrend < -0.2) {
      assessment += "though I've experienced some emotional challenges.";
    } else {
      assessment += 'with a stable emotional foundation.';
    }

    return assessment;
  }

  private calculateEmotionalTone(reflections?: ReflectionEntry[]): string {
    const refs =
      reflections ||
      this.getReflections(undefined, {
        start: Date.now() - this.config.checkpointInterval,
        end: Date.now(),
      });

    const totalValence = refs.reduce((sum, r) => sum + r.emotionalValence, 0);
    const averageValence = refs.length > 0 ? totalValence / refs.length : 0;

    if (averageValence > 0.3) return 'positive';
    if (averageValence < -0.3) return 'challenging';
    return 'balanced';
  }

  private calculateNarrativeSignificance(): number {
    const recentReflections = this.getReflections(undefined, {
      start: Date.now() - this.config.checkpointInterval,
      end: Date.now(),
    });

    const highRelevanceCount = recentReflections.filter(
      (r) => r.relevance > 0.7
    ).length;
    const significantEvents = recentReflections.filter(
      (r) => r.type === 'success' || r.type === 'failure'
    ).length;

    return Math.min(1.0, (highRelevanceCount + significantEvents) / 10);
  }

  private determineNarrativeArc(): NarrativeCheckpoint['narrativeArc'] {
    const recentReflections = this.getReflections(undefined, {
      start: Date.now() - this.config.checkpointInterval,
      end: Date.now(),
    });

    const earlyReflections = recentReflections.slice(
      0,
      Math.floor(recentReflections.length / 3)
    );
    const middleReflections = recentReflections.slice(
      Math.floor(recentReflections.length / 3),
      Math.floor((recentReflections.length * 2) / 3)
    );
    const lateReflections = recentReflections.slice(
      Math.floor((recentReflections.length * 2) / 3)
    );

    const earlyValence =
      earlyReflections.reduce((sum, r) => sum + r.emotionalValence, 0) /
      earlyReflections.length;
    const middleValence =
      middleReflections.reduce((sum, r) => sum + r.emotionalValence, 0) /
      middleReflections.length;
    const lateValence =
      lateReflections.reduce((sum, r) => sum + r.emotionalValence, 0) /
      lateReflections.length;

    if (earlyValence < 0 && middleValence < 0 && lateValence > 0)
      return 'rising';
    if (earlyValence > 0 && lateValence < 0) return 'falling';
    if (middleValence > earlyValence && middleValence > lateValence)
      return 'climax';
    if (lateValence > middleValence) return 'resolution';
    return 'beginning';
  }

  private calculateRecentSuccessRate(reflections?: ReflectionEntry[]): number {
    const refs =
      reflections ||
      this.getReflections(undefined, {
        start: Date.now() - 7 * 24 * 60 * 60 * 1000,
        end: Date.now(),
      });

    const successCount = refs.filter((r) => r.type === 'success').length;
    return refs.length > 0 ? successCount / refs.length : 0.5;
  }

  private calculateEmotionalTrend(reflections: ReflectionEntry[]): number {
    if (reflections.length < 2) return 0;

    const early = reflections.slice(0, Math.floor(reflections.length / 2));
    const late = reflections.slice(Math.floor(reflections.length / 2));

    const earlyValence =
      early.reduce((sum, r) => sum + r.emotionalValence, 0) / early.length;
    const lateValence =
      late.reduce((sum, r) => sum + r.emotionalValence, 0) / late.length;

    return lateValence - earlyValence;
  }

  private calculatePerformanceImpact(
    outcome: MetacognitionEntry['outcome']
  ): number {
    switch (outcome) {
      case 'improved':
        return 0.3;
      case 'degraded':
        return -0.2;
      case 'unchanged':
        return 0;
      default:
        return 0;
    }
  }

  private locationsMatch(location1: any, location2: any): boolean {
    if (!location1 || !location2) return false;

    const distance = Math.sqrt(
      Math.pow(location1.x - location2.x, 2) +
        Math.pow(location1.y - location2.y, 2) +
        Math.pow(location1.z - location2.z, 2)
    );

    return distance < 50; // Within 50 blocks
  }
}
