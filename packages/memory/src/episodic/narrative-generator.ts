/**
 * Narrative generation system for episodic memories.
 *
 * Creates coherent stories and narratives from episodic memory collections
 * for self-reflection, communication, and memory consolidation.
 *
 * @author @darianrosebrook
 */

import { Experience, ExperienceType } from '../types';

/**
 * Narrative style configuration
 */
export interface NarrativeStyle {
  tone: 'reflective' | 'descriptive' | 'analytical' | 'storytelling';
  detailLevel: 'brief' | 'moderate' | 'comprehensive';
  focus: 'temporal' | 'thematic' | 'causal' | 'emotional';
  length: 'brief' | 'moderate' | 'extensive';
}

/**
 * Narrative theme for story generation
 */
export interface NarrativeTheme {
  theme: string;
  description: string;
  keywords: string[];
  emotionalTone: 'positive' | 'negative' | 'neutral' | 'mixed';
}

/**
 * Generated narrative
 */
export interface GeneratedNarrative {
  id: string;
  title: string;
  content: string;
  style: NarrativeStyle;
  theme?: NarrativeTheme;
  memories: string[];
  confidence: number;
  coherence: number;
  timestamp: number;
}

/**
 * Autobiographical narrative
 */
export interface AutobiographicalNarrative extends GeneratedNarrative {
  timePeriod: {
    start: number;
    end: number;
    duration: number;
  };
  developmentArc: 'growth' | 'challenge' | 'achievement' | 'learning';
  keyInsights: string[];
}

/**
 * Temporal narrative showing development over time
 */
export interface TemporalNarrative extends GeneratedNarrative {
  timeline: TimelineEvent[];
  milestones: Milestone[];
  patterns: TemporalPattern[];
}

/**
 * Explanatory narrative for decision-making contexts
 */
export interface ExplanatoryNarrative extends GeneratedNarrative {
  decision: string;
  reasoning: string[];
  alternatives: string[];
  outcome: string;
  lessons: string[];
}

/**
 * Comparative narrative showing change and growth
 */
export interface ComparativeNarrative extends GeneratedNarrative {
  comparisonPeriods: ComparisonPeriod[];
  changes: Change[];
  continuities: Continuity[];
  insights: string[];
}

/**
 * Summative narrative for memory consolidation
 */
export interface SummativeNarrative extends GeneratedNarrative {
  summary: string;
  keyEvents: string[];
  patterns: string[];
  implications: string[];
}

/**
 * Timeline event for temporal narratives
 */
export interface TimelineEvent {
  timestamp: number;
  description: string;
  significance: number;
  type: ExperienceType;
  memoryId: string;
}

/**
 * Milestone in temporal development
 */
export interface Milestone {
  timestamp: number;
  description: string;
  importance: number;
  type: 'achievement' | 'challenge' | 'discovery' | 'change';
  memoryIds: string[];
}

/**
 * Temporal pattern in narrative
 */
export interface TemporalPattern {
  pattern: string;
  frequency: number;
  significance: number;
  examples: string[];
}

/**
 * Comparison period for comparative narratives
 */
export interface ComparisonPeriod {
  start: number;
  end: number;
  label: string;
  characteristics: string[];
  memories: string[];
}

/**
 * Change between comparison periods
 */
export interface Change {
  aspect: string;
  from: string;
  to: string;
  significance: number;
  evidence: string[];
}

/**
 * Continuity between comparison periods
 */
export interface Continuity {
  aspect: string;
  value: string;
  consistency: number;
  evidence: string[];
}

/**
 * Narrative generation system
 */
export class NarrativeGenerator {
  private memories: Experience[] = [];
  private themes: Map<string, NarrativeTheme> = new Map();

  constructor() {
    this.initializeThemes();
  }

  /**
   * Add memories for narrative generation
   */
  addMemories(newMemories: Experience[]): void {
    this.memories.push(...newMemories);
  }

  /**
   * Generate autobiographical narrative from memory collection
   */
  generateAutobiographicalNarrative(
    memoryCollection: Experience[],
    style: NarrativeStyle
  ): AutobiographicalNarrative {
    const sortedMemories = this.sortMemoriesByTime(memoryCollection);
    const theme = this.identifyNarrativeTheme(sortedMemories);
    const developmentArc = this.identifyDevelopmentArc(sortedMemories);
    const keyInsights = this.extractKeyInsights(sortedMemories);

    const narrative: AutobiographicalNarrative = {
      id: `narrative-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: this.generateAutobiographicalTitle(sortedMemories, theme),
      content: this.generateAutobiographicalContent(sortedMemories, style, theme),
      style,
      theme,
      memories: sortedMemories.map(m => m.id),
      confidence: this.calculateNarrativeConfidence(sortedMemories),
      coherence: this.calculateNarrativeCoherence(sortedMemories),
      timestamp: Date.now(),
      timePeriod: {
        start: sortedMemories[0]?.timestamp || 0,
        end: sortedMemories[sortedMemories.length - 1]?.timestamp || 0,
        duration: this.calculateTimeDuration(sortedMemories),
      },
      developmentArc,
      keyInsights,
    };

    return narrative;
  }

  /**
   * Create temporal narrative sequences showing development over time
   */
  generateTemporalNarrative(
    timespan: { start: number; end: number },
    theme: NarrativeTheme
  ): TemporalNarrative {
    const relevantMemories = this.memories.filter(
      m => m.timestamp >= timespan.start && m.timestamp <= timespan.end
    );
    
    const sortedMemories = this.sortMemoriesByTime(relevantMemories);
    const timeline = this.createTimeline(sortedMemories);
    const milestones = this.identifyMilestones(sortedMemories);
    const patterns = this.identifyTemporalPatterns(sortedMemories);

    const narrative: TemporalNarrative = {
      id: `temporal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: this.generateTemporalTitle(timespan, theme),
      content: this.generateTemporalContent(sortedMemories, timeline, milestones),
      style: {
        tone: 'descriptive',
        detailLevel: 'moderate',
        focus: 'temporal',
        length: 'moderate',
      },
      theme,
      memories: sortedMemories.map(m => m.id),
      confidence: this.calculateNarrativeConfidence(sortedMemories),
      coherence: this.calculateNarrativeCoherence(sortedMemories),
      timestamp: Date.now(),
      timeline,
      milestones,
      patterns,
    };

    return narrative;
  }

  /**
   * Generate explanatory narratives for decision-making contexts
   */
  generateExplanatoryNarrative(
    decision: string,
    relevantMemories: Experience[]
  ): ExplanatoryNarrative {
    const reasoning = this.extractReasoningFromMemories(relevantMemories);
    const alternatives = this.identifyAlternatives(relevantMemories);
    const outcome = this.identifyOutcome(relevantMemories);
    const lessons = this.extractLessons(relevantMemories);

    const narrative: ExplanatoryNarrative = {
      id: `explanatory-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: `Decision: ${decision}`,
      content: this.generateExplanatoryContent(decision, reasoning, outcome, lessons),
      style: {
        tone: 'analytical',
        detailLevel: 'moderate',
        focus: 'causal',
        length: 'moderate',
      },
      memories: relevantMemories.map(m => m.id),
      confidence: this.calculateNarrativeConfidence(relevantMemories),
      coherence: this.calculateNarrativeCoherence(relevantMemories),
      timestamp: Date.now(),
      decision,
      reasoning,
      alternatives,
      outcome,
      lessons,
    };

    return narrative;
  }

  /**
   * Create comparative narratives showing change and growth
   */
  generateComparativeNarrative(
    comparisonPeriods: ComparisonPeriod[]
  ): ComparativeNarrative {
    const changes = this.identifyChanges(comparisonPeriods);
    const continuities = this.identifyContinuities(comparisonPeriods);
    const insights = this.extractComparativeInsights(comparisonPeriods, changes, continuities);

    const allMemories = comparisonPeriods.flatMap(p => 
      this.memories.filter(m => p.memories.includes(m.id))
    );

    const narrative: ComparativeNarrative = {
      id: `comparative-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: this.generateComparativeTitle(comparisonPeriods),
      content: this.generateComparativeContent(comparisonPeriods, changes, continuities),
      style: {
        tone: 'analytical',
        detailLevel: 'moderate',
        focus: 'thematic',
        length: 'extensive',
      },
      memories: allMemories.map(m => m.id),
      confidence: this.calculateNarrativeConfidence(allMemories),
      coherence: this.calculateNarrativeCoherence(allMemories),
      timestamp: Date.now(),
      comparisonPeriods,
      changes,
      continuities,
      insights,
    };

    return narrative;
  }

  /**
   * Generate summative narratives for memory consolidation
   */
  generateSummativeNarrative(
    memoryCluster: Experience[],
    summaryParameters: {
      focus: 'achievements' | 'challenges' | 'learning' | 'growth' | 'overall';
      detailLevel: 'brief' | 'moderate' | 'comprehensive';
    }
  ): SummativeNarrative {
    const summary = this.generateSummary(memoryCluster, summaryParameters.focus);
    const keyEvents = this.identifyKeyEvents(memoryCluster);
    const patterns = this.identifyPatterns(memoryCluster);
    const implications = this.extractImplications(memoryCluster, patterns);

    const narrative: SummativeNarrative = {
      id: `summative-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: this.generateSummativeTitle(memoryCluster, summaryParameters.focus),
      content: this.generateSummativeContent(summary, keyEvents, patterns, implications),
      style: {
        tone: 'reflective',
        detailLevel: summaryParameters.detailLevel,
        focus: 'thematic',
        length: summaryParameters.detailLevel === 'brief' ? 'brief' : 'moderate',
      },
      memories: memoryCluster.map(m => m.id),
      confidence: this.calculateNarrativeConfidence(memoryCluster),
      coherence: this.calculateNarrativeCoherence(memoryCluster),
      timestamp: Date.now(),
      summary,
      keyEvents,
      patterns,
      implications,
    };

    return narrative;
  }

  /**
   * Initialize narrative themes
   */
  private initializeThemes(): void {
    const themes: NarrativeTheme[] = [
      {
        theme: 'exploration',
        description: 'Discovery and exploration of new areas and resources',
        keywords: ['explore', 'discover', 'find', 'new', 'unknown'],
        emotionalTone: 'positive',
      },
      {
        theme: 'survival',
        description: 'Challenges and survival situations',
        keywords: ['survive', 'danger', 'threat', 'safe', 'escape'],
        emotionalTone: 'negative',
      },
      {
        theme: 'achievement',
        description: 'Goal accomplishment and skill development',
        keywords: ['achieve', 'complete', 'master', 'success', 'goal'],
        emotionalTone: 'positive',
      },
      {
        theme: 'social',
        description: 'Interactions with other entities',
        keywords: ['meet', 'talk', 'trade', 'help', 'cooperate'],
        emotionalTone: 'positive',
      },
      {
        theme: 'learning',
        description: 'Knowledge acquisition and skill improvement',
        keywords: ['learn', 'understand', 'improve', 'practice', 'skill'],
        emotionalTone: 'positive',
      },
      {
        theme: 'challenge',
        description: 'Difficulties and problem-solving',
        keywords: ['challenge', 'difficult', 'problem', 'struggle', 'overcome'],
        emotionalTone: 'mixed',
      },
    ];

    for (const theme of themes) {
      this.themes.set(theme.theme, theme);
    }
  }

  /**
   * Sort memories by timestamp
   */
  private sortMemoriesByTime(memories: Experience[]): Experience[] {
    return [...memories].sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Identify narrative theme from memories
   */
  private identifyNarrativeTheme(memories: Experience[]): NarrativeTheme | undefined {
    const themeScores = new Map<string, number>();

    for (const memory of memories) {
      const description = memory.description.toLowerCase();
      
      for (const [themeName, theme] of this.themes) {
        let score = 0;
        
        for (const keyword of theme.keywords) {
          if (description.includes(keyword)) {
            score += 1;
          }
        }
        
        if (score > 0) {
          themeScores.set(themeName, (themeScores.get(themeName) || 0) + score);
        }
      }
    }

    if (themeScores.size === 0) return undefined;

    const bestTheme = Array.from(themeScores.entries())
      .sort((a, b) => b[1] - a[1])[0];

    return this.themes.get(bestTheme[0]);
  }

  /**
   * Identify development arc from memories
   */
  private identifyDevelopmentArc(memories: Experience[]): 'growth' | 'challenge' | 'achievement' | 'learning' {
    const typeCounts = new Map<ExperienceType, number>();
    
    for (const memory of memories) {
      typeCounts.set(memory.type, (typeCounts.get(memory.type) || 0) + 1);
    }

    const achievementCount = typeCounts.get(ExperienceType.GOAL_ACHIEVEMENT) || 0;
    const failureCount = typeCounts.get(ExperienceType.GOAL_FAILURE) || 0;
    const learningCount = typeCounts.get(ExperienceType.SKILL_IMPROVEMENT) || 0;
    const explorationCount = typeCounts.get(ExperienceType.EXPLORATION) || 0;

    if (achievementCount > failureCount && achievementCount > learningCount) {
      return 'achievement';
    } else if (failureCount > achievementCount) {
      return 'challenge';
    } else if (learningCount > 0 || explorationCount > 0) {
      return 'learning';
    } else {
      return 'growth';
    }
  }

  /**
   * Extract key insights from memories
   */
  private extractKeyInsights(memories: Experience[]): string[] {
    const insights: string[] = [];
    
    // Extract insights from high-salience memories
    const highSalienceMemories = memories.filter(m => m.salienceScore > 0.7);
    
    for (const memory of highSalienceMemories) {
      if (memory.type === ExperienceType.SKILL_IMPROVEMENT) {
        insights.push(`Learned: ${memory.description}`);
      } else if (memory.type === ExperienceType.GOAL_ACHIEVEMENT) {
        insights.push(`Achieved: ${memory.description}`);
      } else if (memory.type === ExperienceType.GOAL_FAILURE) {
        insights.push(`Failed but learned: ${memory.description}`);
      }
    }

    return insights.slice(0, 5); // Limit to top 5 insights
  }

  /**
   * Generate autobiographical title
   */
  private generateAutobiographicalTitle(memories: Experience[], theme?: NarrativeTheme): string {
    if (theme) {
      return `My Journey of ${theme.theme.charAt(0).toUpperCase() + theme.theme.slice(1)}`;
    }
    
    const timeSpan = this.calculateTimeDuration(memories);
    if (timeSpan > 7 * 24 * 60 * 60 * 1000) { // More than a week
      return 'My Extended Adventure';
    } else if (timeSpan > 24 * 60 * 60 * 1000) { // More than a day
      return 'A Day of Discovery';
    } else {
      return 'Recent Experiences';
    }
  }

  /**
   * Generate autobiographical content
   */
  private generateAutobiographicalContent(
    memories: Experience[],
    style: NarrativeStyle,
    theme?: NarrativeTheme
  ): string {
    let content = '';

    if (style.tone === 'reflective') {
      content += 'Looking back on my experiences, ';
    } else if (style.tone === 'storytelling') {
      content += 'Let me tell you about ';
    }

    if (theme) {
      content += `I've been focused on ${theme.description.toLowerCase()}. `;
    }

    // Group memories by type and generate content
    const memoriesByType = this.groupMemoriesByType(memories);
    
    for (const [type, typeMemories] of memoriesByType) {
      if (typeMemories.length > 0) {
        content += this.generateTypeContent(type, typeMemories, style);
      }
    }

    // Add concluding thoughts
    if (style.tone === 'reflective') {
      content += ' These experiences have shaped my understanding and growth.';
    }

    return content;
  }

  /**
   * Group memories by type
   */
  private groupMemoriesByType(memories: Experience[]): Map<ExperienceType, Experience[]> {
    const grouped = new Map<ExperienceType, Experience[]>();
    
    for (const memory of memories) {
      if (!grouped.has(memory.type)) {
        grouped.set(memory.type, []);
      }
      grouped.get(memory.type)!.push(memory);
    }
    
    return grouped;
  }

  /**
   * Generate content for a specific memory type
   */
  private generateTypeContent(
    type: ExperienceType,
    memories: Experience[],
    style: NarrativeStyle
  ): string {
    const count = memories.length;
    
    switch (type) {
      case ExperienceType.GOAL_ACHIEVEMENT:
        return `I successfully achieved ${count} goal${count > 1 ? 's' : ''}, including "${memories[0].description}". `;
      
      case ExperienceType.GOAL_FAILURE:
        return `I faced ${count} setback${count > 1 ? 's' : ''}, such as "${memories[0].description}", but learned from each one. `;
      
      case ExperienceType.SKILL_IMPROVEMENT:
        return `I improved my skills in ${count} area${count > 1 ? 's' : ''}, particularly "${memories[0].description}". `;
      
      case ExperienceType.EXPLORATION:
        return `I explored ${count} new area${count > 1 ? 's' : ''} and discovered "${memories[0].description}". `;
      
      case ExperienceType.SOCIAL_INTERACTION:
        return `I had ${count} meaningful interaction${count > 1 ? 's' : ''}, including "${memories[0].description}". `;
      
      default:
        return `I experienced ${count} significant event${count > 1 ? 's' : ''}, including "${memories[0].description}". `;
    }
  }

  /**
   * Calculate narrative confidence
   */
  private calculateNarrativeConfidence(memories: Experience[]): number {
    if (memories.length === 0) return 0;
    
    const averageSalience = memories.reduce((sum, m) => sum + m.salienceScore, 0) / memories.length;
    const memoryCount = Math.min(memories.length / 10, 1); // More memories = higher confidence
    
    return Math.min(1, (averageSalience + memoryCount) / 2);
  }

  /**
   * Calculate narrative coherence
   */
  private calculateNarrativeCoherence(memories: Experience[]): number {
    if (memories.length < 2) return 1;
    
    const sortedMemories = this.sortMemoriesByTime(memories);
    let coherence = 0;
    
    // Check temporal coherence
    for (let i = 1; i < sortedMemories.length; i++) {
      const timeGap = sortedMemories[i].timestamp - sortedMemories[i - 1].timestamp;
      const dayInMs = 24 * 60 * 60 * 1000;
      
      if (timeGap < dayInMs) {
        coherence += 0.1; // Memories close in time are more coherent
      }
    }
    
    // Check thematic coherence
    const theme = this.identifyNarrativeTheme(memories);
    if (theme) {
      coherence += 0.3;
    }
    
    return Math.min(1, coherence);
  }

  /**
   * Calculate time duration
   */
  private calculateTimeDuration(memories: Experience[]): number {
    if (memories.length < 2) return 0;
    
    const sortedMemories = this.sortMemoriesByTime(memories);
    return sortedMemories[sortedMemories.length - 1].timestamp - sortedMemories[0].timestamp;
  }

  /**
   * Create timeline from memories
   */
  private createTimeline(memories: Experience[]): TimelineEvent[] {
    return memories.map(memory => ({
      timestamp: memory.timestamp,
      description: memory.description,
      significance: memory.salienceScore,
      type: memory.type,
      memoryId: memory.id,
    }));
  }

  /**
   * Identify milestones in temporal development
   */
  private identifyMilestones(memories: Experience[]): Milestone[] {
    const milestones: Milestone[] = [];
    
    for (const memory of memories) {
      if (memory.salienceScore > 0.8) {
        let milestoneType: 'achievement' | 'challenge' | 'discovery' | 'change';
        
        switch (memory.type) {
          case ExperienceType.GOAL_ACHIEVEMENT:
            milestoneType = 'achievement';
            break;
          case ExperienceType.GOAL_FAILURE:
            milestoneType = 'challenge';
            break;
          case ExperienceType.EXPLORATION:
            milestoneType = 'discovery';
            break;
          default:
            milestoneType = 'change';
        }
        
        milestones.push({
          timestamp: memory.timestamp,
          description: memory.description,
          importance: memory.salienceScore,
          type: milestoneType,
          memoryIds: [memory.id],
        });
      }
    }
    
    return milestones.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Identify temporal patterns
   */
  private identifyTemporalPatterns(memories: Experience[]): TemporalPattern[] {
    const patterns: TemporalPattern[] = [];
    
    // Group by type and look for patterns
    const memoriesByType = this.groupMemoriesByType(memories);
    
    for (const [type, typeMemories] of memoriesByType) {
      if (typeMemories.length >= 3) {
        patterns.push({
          pattern: `Frequent ${type} activities`,
          frequency: typeMemories.length,
          significance: typeMemories.reduce((sum, m) => sum + m.salienceScore, 0) / typeMemories.length,
          examples: typeMemories.slice(0, 3).map(m => m.description),
        });
      }
    }
    
    return patterns;
  }

  /**
   * Generate temporal title
   */
  private generateTemporalTitle(timespan: { start: number; end: number }, theme: NarrativeTheme): string {
    const duration = timespan.end - timespan.start;
    const days = Math.ceil(duration / (24 * 60 * 60 * 1000));
    
    if (days === 1) {
      return `A Day of ${theme.theme.charAt(0).toUpperCase() + theme.theme.slice(1)}`;
    } else if (days <= 7) {
      return `${days} Days of ${theme.theme.charAt(0).toUpperCase() + theme.theme.slice(1)}`;
    } else {
      return `Extended Period of ${theme.theme.charAt(0).toUpperCase() + theme.theme.slice(1)}`;
    }
  }

  /**
   * Generate temporal content
   */
  private generateTemporalContent(
    memories: Experience[],
    timeline: TimelineEvent[],
    milestones: Milestone[]
  ): string {
    let content = `Over this period, I experienced ${memories.length} significant events. `;
    
    if (milestones.length > 0) {
      content += `Key milestones included: ${milestones.map(m => m.description).join(', ')}. `;
    }
    
    if (timeline.length > 0) {
      const recentEvents = timeline.slice(-3);
      content += `Recent activities included: ${recentEvents.map(e => e.description).join(', ')}. `;
    }
    
    return content;
  }

  /**
   * Extract reasoning from memories
   */
  private extractReasoningFromMemories(memories: Experience[]): string[] {
    const reasoning: string[] = [];
    
    for (const memory of memories) {
      if (memory.actions.length > 0) {
        reasoning.push(`Based on ${memory.actions[0].type}: ${memory.description}`);
      }
    }
    
    return reasoning.slice(0, 3);
  }

  /**
   * Identify alternatives from memories
   */
  private identifyAlternatives(memories: Experience[]): string[] {
    // This would require more sophisticated analysis
    // For now, return basic alternatives
    return ['Continue current approach', 'Try different strategy', 'Seek help from others'];
  }

  /**
   * Identify outcome from memories
   */
  private identifyOutcome(memories: Experience[]): string {
    const lastMemory = memories[memories.length - 1];
    return lastMemory ? lastMemory.description : 'Outcome unclear';
  }

  /**
   * Extract lessons from memories
   */
  private extractLessons(memories: Experience[]): string[] {
    const lessons: string[] = [];
    
    for (const memory of memories) {
      if (memory.type === ExperienceType.SKILL_IMPROVEMENT) {
        lessons.push(`Learned: ${memory.description}`);
      } else if (memory.type === ExperienceType.GOAL_FAILURE) {
        lessons.push(`Avoid: ${memory.description}`);
      }
    }
    
    return lessons.slice(0, 3);
  }

  /**
   * Generate explanatory content
   */
  private generateExplanatoryContent(
    decision: string,
    reasoning: string[],
    outcome: string,
    lessons: string[]
  ): string {
    let content = `When faced with the decision to ${decision}, `;
    
    if (reasoning.length > 0) {
      content += `I considered: ${reasoning.join(', ')}. `;
    }
    
    content += `The outcome was: ${outcome}. `;
    
    if (lessons.length > 0) {
      content += `Key lessons: ${lessons.join(', ')}.`;
    }
    
    return content;
  }

  /**
   * Identify changes between comparison periods
   */
  private identifyChanges(comparisonPeriods: ComparisonPeriod[]): Change[] {
    const changes: Change[] = [];
    
    if (comparisonPeriods.length < 2) return changes;
    
    // Compare adjacent periods
    for (let i = 1; i < comparisonPeriods.length; i++) {
      const prev = comparisonPeriods[i - 1];
      const curr = comparisonPeriods[i];
      
      changes.push({
        aspect: 'activity focus',
        from: prev.characteristics[0] || 'unknown',
        to: curr.characteristics[0] || 'unknown',
        significance: 0.7,
        evidence: [prev.label, curr.label],
      });
    }
    
    return changes;
  }

  /**
   * Identify continuities between comparison periods
   */
  private identifyContinuities(comparisonPeriods: ComparisonPeriod[]): Continuity[] {
    const continuities: Continuity[] = [];
    
    if (comparisonPeriods.length < 2) return continuities;
    
    // Find common characteristics
    const allCharacteristics = comparisonPeriods.flatMap(p => p.characteristics);
    const characteristicCounts = new Map<string, number>();
    
    for (const char of allCharacteristics) {
      characteristicCounts.set(char, (characteristicCounts.get(char) || 0) + 1);
    }
    
    for (const [char, count] of characteristicCounts) {
      if (count >= comparisonPeriods.length * 0.5) { // Present in at least half of periods
        continuities.push({
          aspect: char,
          value: char,
          consistency: count / comparisonPeriods.length,
          evidence: comparisonPeriods.map(p => p.label),
        });
      }
    }
    
    return continuities;
  }

  /**
   * Extract comparative insights
   */
  private extractComparativeInsights(
    comparisonPeriods: ComparisonPeriod[],
    changes: Change[],
    continuities: Continuity[]
  ): string[] {
    const insights: string[] = [];
    
    if (changes.length > 0) {
      insights.push(`I evolved from ${changes[0].from} to ${changes[0].to}`);
    }
    
    if (continuities.length > 0) {
      insights.push(`I consistently maintained ${continuities[0].aspect}`);
    }
    
    insights.push(`I experienced ${comparisonPeriods.length} distinct phases of development`);
    
    return insights;
  }

  /**
   * Generate comparative title
   */
  private generateComparativeTitle(comparisonPeriods: ComparisonPeriod[]): string {
    return `My Evolution: ${comparisonPeriods.map(p => p.label).join(' → ')}`;
  }

  /**
   * Generate comparative content
   */
  private generateComparativeContent(
    comparisonPeriods: ComparisonPeriod[],
    changes: Change[],
    continuities: Continuity[]
  ): string {
    let content = `I've gone through ${comparisonPeriods.length} distinct phases: ${comparisonPeriods.map(p => p.label).join(', ')}. `;
    
    if (changes.length > 0) {
      content += `Key changes include evolving from ${changes[0].from} to ${changes[0].to}. `;
    }
    
    if (continuities.length > 0) {
      content += `I've consistently maintained ${continuities[0].aspect}. `;
    }
    
    return content;
  }

  /**
   * Generate summary
   */
  private generateSummary(memories: Experience[], focus: string): string {
    const focusMemories = this.filterMemoriesByFocus(memories, focus);
    
    if (focusMemories.length === 0) {
      return 'No significant experiences in this category.';
    }
    
    const typeCounts = new Map<ExperienceType, number>();
    for (const memory of focusMemories) {
      typeCounts.set(memory.type, (typeCounts.get(memory.type) || 0) + 1);
    }
    
    const summary = `During this period, I experienced ${focusMemories.length} significant events. `;
    const typeSummary = Array.from(typeCounts.entries())
      .map(([type, count]) => `${count} ${type} events`)
      .join(', ');
    
    return summary + typeSummary + '.';
  }

  /**
   * Filter memories by focus
   */
  private filterMemoriesByFocus(memories: Experience[], focus: string): Experience[] {
    switch (focus) {
      case 'achievements':
        return memories.filter(m => m.type === ExperienceType.GOAL_ACHIEVEMENT);
      case 'challenges':
        return memories.filter(m => m.type === ExperienceType.GOAL_FAILURE);
      case 'learning':
        return memories.filter(m => m.type === ExperienceType.SKILL_IMPROVEMENT);
      case 'growth':
        return memories.filter(m => m.salienceScore > 0.6);
      default:
        return memories;
    }
  }

  /**
   * Identify key events
   */
  private identifyKeyEvents(memories: Experience[]): string[] {
    return memories
      .filter(m => m.salienceScore > 0.7)
      .slice(0, 5)
      .map(m => m.description);
  }

  /**
   * Identify patterns
   */
  private identifyPatterns(memories: Experience[]): string[] {
    const patterns: string[] = [];
    const memoriesByType = this.groupMemoriesByType(memories);
    
    for (const [type, typeMemories] of memoriesByType) {
      if (typeMemories.length >= 2) {
        patterns.push(`Frequent ${type} activities (${typeMemories.length} occurrences)`);
      }
    }
    
    return patterns;
  }

  /**
   * Extract implications
   */
  private extractImplications(memories: Experience[], patterns: string[]): string[] {
    const implications: string[] = [];
    
    if (patterns.length > 0) {
      implications.push(`I should focus on ${patterns[0]}`);
    }
    
    const highSalienceCount = memories.filter(m => m.salienceScore > 0.8).length;
    if (highSalienceCount > 0) {
      implications.push(`I had ${highSalienceCount} highly significant experiences`);
    }
    
    return implications;
  }

  /**
   * Generate summative title
   */
  private generateSummativeTitle(memories: Experience[], focus: string): string {
    const count = memories.length;
    return `Summary of ${count} ${focus} experiences`;
  }

  /**
   * Generate summative content
   */
  private generateSummativeContent(
    summary: string,
    keyEvents: string[],
    patterns: string[],
    implications: string[]
  ): string {
    let content = summary + ' ';
    
    if (keyEvents.length > 0) {
      content += `Key events included: ${keyEvents.join(', ')}. `;
    }
    
    if (patterns.length > 0) {
      content += `Notable patterns: ${patterns.join(', ')}. `;
    }
    
    if (implications.length > 0) {
      content += `Implications: ${implications.join(', ')}.`;
    }
    
    return content;
  }
}
