/**
 * Narrative management for identity continuity.
 *
 * Maintains the agent's life story, integrates experiences into
 * coherent narratives, and tracks personal development over time.
 *
 * @author @darianrosebrook
 */

import {
  NarrativeStory,
  NarrativeChapter,
  ExperienceIntegration,
  IdentityImpact,
  CoherenceChange,
  IdentityAspect,
  ImpactType,
  NarrativeStorySchema,
} from './types';

/**
 * Narrative story management and synthesis
 */
export class NarrativeManager {
  private stories: NarrativeStory[] = [];
  private maxStories = 50;
  private currentChapter?: NarrativeChapter;

  constructor() {
    this.initializeFoundationStory();
  }

  /**
   * Get all narrative stories
   */
  getStories(): NarrativeStory[] {
    return [...this.stories];
  }

  /**
   * Get current story in progress
   */
  getCurrentStory(): NarrativeStory | undefined {
    return this.stories.find((story) => !story.timespan.end);
  }

  /**
   * Get most significant stories
   */
  getMostSignificantStories(count: number = 5): NarrativeStory[] {
    return [...this.stories]
      .sort((a, b) => b.significance - a.significance)
      .slice(0, count);
  }

  /**
   * Integrate an experience into the narrative
   */
  integrateExperience(
    experienceId: string,
    experienceDescription: string,
    context: {
      timestamp: number;
      location?: string;
      participants?: string[];
      emotions?: any;
      outcomes?: string[];
    }
  ): ExperienceIntegration {
    if (!experienceDescription?.trim()) {
      throw new Error('Experience description is required');
    }

    const currentStory = this.getCurrentStory();
    if (!currentStory) {
      this.startNewStory(
        'Life Journey',
        'The ongoing story of experiences and growth'
      );
    }

    const integration: ExperienceIntegration = {
      experienceId,
      integrationDate: Date.now(),
      narrativeContext: this.determineNarrativeContext(
        experienceDescription,
        context
      ),
      lessonsExtracted: this.extractLessons(experienceDescription, context),
      identityImpact: this.assessIdentityImpact(experienceDescription, context),
      coherenceChanges: this.assessCoherenceChanges(
        experienceDescription,
        context
      ),
    };

    this.addExperienceToCurrentChapter(
      experienceDescription,
      integration,
      context
    );
    this.updateStoryCoherence();

    return integration;
  }

  /**
   * Start a new narrative story
   */
  startNewStory(
    title: string,
    description: string,
    themes: string[] = []
  ): string {
    // End current story if it exists
    const currentStory = this.getCurrentStory();
    if (currentStory) {
      this.endStory(currentStory.id);
    }

    const now = Date.now();
    const story: NarrativeStory = {
      id: `story-${now}`,
      title,
      description,
      chapters: [],
      themes: [...themes],
      timespan: {
        start: now,
      },
      significance: 0.5, // Will be calculated based on experiences
      coherenceScore: 1.0, // Start with perfect coherence
      lastUpdated: now,
    };

    // Start with an initial chapter
    this.currentChapter = this.createChapter(
      'Beginning',
      'The start of a new journey'
    );
    story.chapters.push(this.currentChapter);

    this.stories.push(story);

    // Manage story capacity
    if (this.stories.length > this.maxStories) {
      // Remove least significant completed stories
      const completedStories = this.stories.filter((s) => s.timespan.end);
      if (completedStories.length > 0) {
        completedStories.sort((a, b) => a.significance - b.significance);
        const toRemove = completedStories[0];
        this.stories = this.stories.filter((s) => s.id !== toRemove.id);
      }
    }

    // Validate the story
    const validation = NarrativeStorySchema.safeParse(story);
    if (!validation.success) {
      console.warn('Story validation failed:', validation.error);
    }

    console.log(`Started new story: ${title}`);
    return story.id;
  }

  /**
   * End a story and calculate final metrics
   */
  endStory(storyId: string, conclusion?: string): boolean {
    const story = this.stories.find((s) => s.id === storyId);
    if (!story) {
      console.warn(`Story '${storyId}' not found`);
      return false;
    }

    if (story.timespan.end) {
      console.warn(`Story '${story.title}' already ended`);
      return false;
    }

    const now = Date.now();
    story.timespan.end = now;
    story.lastUpdated = now;

    // End current chapter if it belongs to this story
    if (this.currentChapter && story.chapters.includes(this.currentChapter)) {
      this.currentChapter.timespan.end = now;
      if (conclusion) {
        this.currentChapter.connectionToNext = conclusion;
      }
      this.currentChapter = undefined;
    }

    // Calculate final significance based on chapters and themes
    story.significance = this.calculateStorySignificance(story);

    console.log(
      `Ended story: ${story.title} (significance: ${story.significance.toFixed(2)})`
    );
    return true;
  }

  /**
   * Start a new chapter in the current story
   */
  startNewChapter(title: string, summary: string): boolean {
    const currentStory = this.getCurrentStory();
    if (!currentStory) {
      console.warn('No current story to add chapter to');
      return false;
    }

    // End current chapter
    if (this.currentChapter) {
      this.currentChapter.timespan.end = Date.now();
      this.currentChapter.connectionToNext = `Transitioning to: ${title}`;
    }

    // Create new chapter
    this.currentChapter = this.createChapter(title, summary);

    // Connect to previous chapter
    if (currentStory.chapters.length > 0) {
      const previousChapter =
        currentStory.chapters[currentStory.chapters.length - 1];
      this.currentChapter.connectionToPrevious = `Following from: ${previousChapter.title}`;
    }

    currentStory.chapters.push(this.currentChapter);
    currentStory.lastUpdated = Date.now();

    console.log(`Started new chapter: ${title}`);
    return true;
  }

  /**
   * Generate a narrative summary of recent experiences
   */
  generateNarrativeSummary(timeWindowMs: number = 86400000): string {
    const cutoff = Date.now() - timeWindowMs;
    const recentStories = this.stories.filter(
      (story) => story.lastUpdated >= cutoff || !story.timespan.end
    );

    if (recentStories.length === 0) {
      return 'No recent narrative activity to summarize.';
    }

    const summaryParts: string[] = [];

    for (const story of recentStories) {
      const recentChapters = story.chapters.filter(
        (chapter) => chapter.timespan.start >= cutoff || !chapter.timespan.end
      );

      if (recentChapters.length > 0) {
        summaryParts.push(`**${story.title}**`);
        summaryParts.push(story.description);

        for (const chapter of recentChapters) {
          summaryParts.push(`- ${chapter.title}: ${chapter.summary}`);
          if (chapter.keyEvents.length > 0) {
            summaryParts.push(
              `  Key events: ${chapter.keyEvents.slice(-3).join(', ')}`
            );
          }
          if (chapter.lessons.length > 0) {
            summaryParts.push(
              `  Lessons: ${chapter.lessons.slice(-2).join(', ')}`
            );
          }
        }

        if (story.themes.length > 0) {
          summaryParts.push(`Themes: ${story.themes.join(', ')}`);
        }

        summaryParts.push(''); // Add spacing
      }
    }

    return summaryParts.join('\n');
  }

  /**
   * Get narrative themes and patterns
   */
  getNarrativeThemes(): {
    theme: string;
    frequency: number;
    significance: number;
  }[] {
    const themeMap = new Map<
      string,
      { count: number; totalSignificance: number }
    >();

    for (const story of this.stories) {
      for (const theme of story.themes) {
        const existing = themeMap.get(theme) || {
          count: 0,
          totalSignificance: 0,
        };
        existing.count++;
        existing.totalSignificance += story.significance;
        themeMap.set(theme, existing);
      }
    }

    return Array.from(themeMap.entries())
      .map(([theme, data]) => ({
        theme,
        frequency: data.count,
        significance: data.totalSignificance / data.count,
      }))
      .sort((a, b) => b.significance - a.significance);
  }

  /**
   * Initialize foundation story for the agent's existence
   */
  private initializeFoundationStory(): void {
    this.startNewStory(
      'Emergence of Consciousness',
      'The beginning of self-aware existence and initial experiences',
      ['awakening', 'discovery', 'learning', 'identity-formation']
    );
  }

  /**
   * Create a new narrative chapter
   */
  private createChapter(title: string, summary: string): NarrativeChapter {
    const now = Date.now();

    return {
      id: `chapter-${now}`,
      title,
      summary,
      keyEvents: [],
      lessons: [],
      timespan: {
        start: now,
        end: now, // Will be updated when chapter ends
      },
      significance: 0.5,
      connectionToPrevious: '',
    };
  }

  /**
   * Add experience to current chapter
   */
  private addExperienceToCurrentChapter(
    experienceDescription: string,
    integration: ExperienceIntegration,
    context: any
  ): void {
    if (!this.currentChapter) return;

    // Add as key event if significant
    if (
      integration.identityImpact.length > 0 ||
      integration.lessonsExtracted.length > 0
    ) {
      this.currentChapter.keyEvents.push(experienceDescription);

      // Limit key events
      if (this.currentChapter.keyEvents.length > 20) {
        this.currentChapter.keyEvents =
          this.currentChapter.keyEvents.slice(-20);
      }
    }

    // Add lessons
    for (const lesson of integration.lessonsExtracted) {
      this.currentChapter.lessons.push(lesson);
    }

    // Limit lessons
    if (this.currentChapter.lessons.length > 10) {
      this.currentChapter.lessons = this.currentChapter.lessons.slice(-10);
    }

    // Update chapter significance
    this.updateChapterSignificance(this.currentChapter, integration);
  }

  /**
   * Determine narrative context for an experience
   */
  private determineNarrativeContext(description: string, context: any): string {
    const contextParts: string[] = [];

    if (context.location) {
      contextParts.push(`at ${context.location}`);
    }

    if (context.participants && context.participants.length > 0) {
      contextParts.push(`with ${context.participants.join(', ')}`);
    }

    const time = new Date(context.timestamp).toLocaleTimeString();
    contextParts.push(`at ${time}`);

    return `${description} ${contextParts.join(' ')}`;
  }

  /**
   * Extract lessons from an experience
   */
  private extractLessons(description: string, context: any): string[] {
    const lessons: string[] = [];

    // Simple pattern-based lesson extraction
    if (
      description.toLowerCase().includes('failed') ||
      description.toLowerCase().includes('error')
    ) {
      lessons.push('Learning from failure builds resilience');
      if (context.outcomes) {
        lessons.push(`Specific learning: ${context.outcomes[0]}`);
      }
    }

    if (
      description.toLowerCase().includes('helped') ||
      description.toLowerCase().includes('assist')
    ) {
      lessons.push('Helping others creates positive outcomes');
    }

    if (
      description.toLowerCase().includes('explored') ||
      description.toLowerCase().includes('discovered')
    ) {
      lessons.push('Exploration leads to new understanding');
    }

    if (
      description.toLowerCase().includes('careful') ||
      description.toLowerCase().includes('safe')
    ) {
      lessons.push('Caution prevents harmful consequences');
    }

    return lessons;
  }

  /**
   * Assess identity impact from experience
   */
  private assessIdentityImpact(
    description: string,
    context: any
  ): IdentityImpact[] {
    const impacts: IdentityImpact[] = [];

    // Simple impact assessment based on keywords
    if (
      description.toLowerCase().includes('curious') ||
      description.toLowerCase().includes('explore')
    ) {
      impacts.push({
        aspect: IdentityAspect.PERSONALITY,
        type: ImpactType.REINFORCEMENT,
        magnitude: 0.3,
        description: 'Reinforced curiosity trait through exploration',
        evidence: [description],
        timestamp: Date.now(),
      });
    }

    if (
      description.toLowerCase().includes('help') ||
      description.toLowerCase().includes('assist')
    ) {
      impacts.push({
        aspect: IdentityAspect.VALUES,
        type: ImpactType.REINFORCEMENT,
        magnitude: 0.4,
        description: 'Reinforced value of helping others',
        evidence: [description],
        timestamp: Date.now(),
      });
    }

    if (
      description.toLowerCase().includes('learned') ||
      description.toLowerCase().includes('skill')
    ) {
      impacts.push({
        aspect: IdentityAspect.CAPABILITIES,
        type: ImpactType.EXPANSION,
        magnitude: 0.5,
        description: 'Expanded capability through learning',
        evidence: [description],
        timestamp: Date.now(),
      });
    }

    return impacts;
  }

  /**
   * Assess coherence changes from experience
   */
  private assessCoherenceChanges(
    description: string,
    context: any
  ): CoherenceChange[] {
    const changes: CoherenceChange[] = [];

    // Simple coherence assessment
    if (
      description.toLowerCase().includes('conflict') ||
      description.toLowerCase().includes('dilemma')
    ) {
      changes.push({
        area: 'value-alignment',
        previousScore: 0.8,
        newScore: 0.7,
        reasoning: 'Experience created value conflict requiring resolution',
        supportingEvidence: [description],
      });
    }

    return changes;
  }

  /**
   * Update story coherence based on recent additions
   */
  private updateStoryCoherence(): void {
    const currentStory = this.getCurrentStory();
    if (!currentStory) return;

    // Simple coherence calculation based on chapter connections
    const connectedChapters = currentStory.chapters.filter(
      (c) => c.connectionToPrevious || c.connectionToNext
    ).length;

    const coherenceRatio =
      currentStory.chapters.length > 1
        ? connectedChapters / currentStory.chapters.length
        : 1.0;

    currentStory.coherenceScore = Math.max(0.3, Math.min(1.0, coherenceRatio));
    currentStory.lastUpdated = Date.now();
  }

  /**
   * Calculate story significance
   */
  private calculateStorySignificance(story: NarrativeStory): number {
    let significance = 0;

    // Base significance from themes
    const themeImportance = {
      awakening: 0.9,
      discovery: 0.7,
      learning: 0.6,
      growth: 0.8,
      challenge: 0.7,
      success: 0.6,
      failure: 0.5,
      relationship: 0.7,
    };

    for (const theme of story.themes) {
      significance +=
        themeImportance[theme as keyof typeof themeImportance] || 0.3;
    }

    // Normalize by number of themes
    if (story.themes.length > 0) {
      significance /= story.themes.length;
    } else {
      significance = 0.3;
    }

    // Adjust based on chapter count and significance
    const avgChapterSignificance =
      story.chapters.length > 0
        ? story.chapters.reduce((sum, ch) => sum + ch.significance, 0) /
          story.chapters.length
        : 0.3;

    significance = (significance + avgChapterSignificance) / 2;

    return Math.max(0.1, Math.min(1.0, significance));
  }

  /**
   * Update chapter significance based on integration
   */
  private updateChapterSignificance(
    chapter: NarrativeChapter,
    integration: ExperienceIntegration
  ): void {
    let significanceBoost = 0;

    // Boost for identity impacts
    significanceBoost += integration.identityImpact.length * 0.1;

    // Boost for lessons learned
    significanceBoost += integration.lessonsExtracted.length * 0.05;

    // Boost for coherence changes
    significanceBoost += integration.coherenceChanges.length * 0.1;

    chapter.significance = Math.max(
      0.1,
      Math.min(1.0, chapter.significance + significanceBoost)
    );
  }

  /**
   * Get narrative statistics
   */
  getStats() {
    const completedStories = this.stories.filter((s) => s.timespan.end);
    const totalChapters = this.stories.reduce(
      (sum, s) => sum + s.chapters.length,
      0
    );
    const avgCoherence =
      this.stories.length > 0
        ? this.stories.reduce((sum, s) => sum + s.coherenceScore, 0) /
          this.stories.length
        : 0;

    return {
      totalStories: this.stories.length,
      completedStories: completedStories.length,
      activeStories: this.stories.length - completedStories.length,
      totalChapters,
      averageCoherence: avgCoherence,
      currentChapter: this.currentChapter?.title || 'None',
      mostSignificantStory:
        this.getMostSignificantStories(1)[0]?.title || 'None',
    };
  }
}
