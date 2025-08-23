/**
 * Sophisticated narrative intelligence system.
 *
 * Provides advanced story synthesis, experience integration,
 * and narrative coherence maintenance for deep self-understanding.
 *
 * @author @darianrosebrook
 */

import { LLMInterface } from '../cognitive-core/llm-interface';
import {
  NarrativeStory,
  NarrativeChapter,
  ExperienceIntegration,
  StorySynthesis,
  NarrativeCoherence,
  ExperienceAnalysis,
  ThemeExtraction,
  PlotDevelopment,
  CharacterArc,
  NarrativeInsight,
  CoherenceMetric,
  StoryElement,
  IdentityImpact,
  IdentityAspect,
  ImpactType,
  CoherenceChange,
} from './types';

/**
 * Configuration for narrative intelligence
 */
export interface NarrativeIntelligenceConfig {
  enableStorySynthesis: boolean;
  enableExperienceIntegration: boolean;
  enableCoherenceMaintenance: boolean;
  enableThemeExtraction: boolean;
  synthesisFrequency: number; // milliseconds
  coherenceThreshold: number; // 0-1, minimum coherence score
  maxStoryElements: number;
  maxThemesPerStory: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: NarrativeIntelligenceConfig = {
  enableStorySynthesis: true,
  enableExperienceIntegration: true,
  enableCoherenceMaintenance: true,
  enableThemeExtraction: true,
  synthesisFrequency: 7200000, // 2 hours
  coherenceThreshold: 0.7,
  maxStoryElements: 50,
  maxThemesPerStory: 8,
};

/**
 * Sophisticated narrative intelligence system
 */
export class NarrativeIntelligence {
  private llm: LLMInterface;
  private config: NarrativeIntelligenceConfig;
  private storyHistory: NarrativeStory[] = [];
  private synthesisHistory: StorySynthesis[] = [];
  private lastSynthesis: number = 0;

  constructor(
    llm: LLMInterface,
    config: Partial<NarrativeIntelligenceConfig> = {}
  ) {
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Synthesize advanced story from experiences
   */
  async synthesizeStory(
    experiences: ExperienceAnalysis[],
    storyId?: string
  ): Promise<StorySynthesis> {
    if (!this.config.enableStorySynthesis) {
      return this.createEmptyStorySynthesis();
    }

    const now = Date.now();
    if (now - this.lastSynthesis < this.config.synthesisFrequency) {
      return this.getLastSynthesis();
    }

    const synthesis: StorySynthesis = {
      id: storyId || `synthesis-${Date.now()}`,
      timestamp: now,
      storyElements: await this.extractStoryElements(experiences),
      themes: await this.extractThemes(experiences),
      plotDevelopment: await this.analyzePlotDevelopment(experiences),
      characterArc: await this.analyzeCharacterArc(experiences),
      coherence: await this.assessCoherence(experiences),
      insights: [],
    };

    // Generate narrative insights
    synthesis.insights = await this.generateNarrativeInsights(synthesis);

    this.synthesisHistory.push(synthesis);
    this.lastSynthesis = now;

    return synthesis;
  }

  /**
   * Extract story elements from experiences
   */
  async extractStoryElements(
    experiences: ExperienceAnalysis[]
  ): Promise<StoryElement[]> {
    const prompt = `Extract story elements from these experiences:

${experiences.map((exp) => `- ${exp.description} (${exp.outcome})`).join('\n')}

Identify story elements including:
1. Key events and turning points
2. Character development moments
3. Conflicts and resolutions
4. Settings and contexts
5. Relationships and interactions
6. Goals and motivations
7. Obstacles and challenges
8. Achievements and failures

Provide specific story elements with their narrative significance.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are extracting story elements from experiences. Be specific and narrative-focused.',
        temperature: 0.4,
        maxTokens: 1024,
      });

      return this.parseStoryElements(response.text, experiences);
    } catch (error) {
      console.error('Error extracting story elements:', error);
      return [];
    }
  }

  /**
   * Parse story elements from response
   */
  private parseStoryElements(
    response: string,
    experiences: ExperienceAnalysis[]
  ): StoryElement[] {
    const elements: StoryElement[] = [];
    const lines = response.split('\n').filter((line) => line.trim());

    let currentCategory = '';

    lines.forEach((line) => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('event') || lowerLine.includes('turning point'))
        currentCategory = 'event';
      else if (
        lowerLine.includes('character') ||
        lowerLine.includes('development')
      )
        currentCategory = 'character';
      else if (
        lowerLine.includes('conflict') ||
        lowerLine.includes('resolution')
      )
        currentCategory = 'conflict';
      else if (lowerLine.includes('setting') || lowerLine.includes('context'))
        currentCategory = 'setting';
      else if (
        lowerLine.includes('relationship') ||
        lowerLine.includes('interaction')
      )
        currentCategory = 'relationship';
      else if (lowerLine.includes('goal') || lowerLine.includes('motivation'))
        currentCategory = 'goal';
      else if (
        lowerLine.includes('obstacle') ||
        lowerLine.includes('challenge')
      )
        currentCategory = 'obstacle';
      else if (
        lowerLine.includes('achievement') ||
        lowerLine.includes('failure')
      )
        currentCategory = 'achievement';
      else if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
        const content = line.replace(/^[-•]\s*/, '').trim();
        elements.push({
          id: `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          category: currentCategory,
          description: content,
          significance: 0.7,
          timestamp: Date.now(),
        });
      }
    });

    return elements.slice(0, this.config.maxStoryElements);
  }

  /**
   * Extract themes from experiences
   */
  async extractThemes(
    experiences: ExperienceAnalysis[]
  ): Promise<ThemeExtraction[]> {
    if (!this.config.enableThemeExtraction) {
      return [];
    }

    const prompt = `Extract recurring themes from these experiences:

${experiences.map((exp) => `- ${exp.description} (${exp.outcome})`).join('\n')}

Identify themes including:
1. Personal growth and development
2. Relationships and social dynamics
3. Challenges and resilience
4. Learning and discovery
5. Values and principles
6. Goals and aspirations
7. Change and adaptation
8. Identity and self-understanding

For each theme, provide:
- Theme name
- Description
- Evidence from experiences
- Significance level (0-1)
- Development pattern`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are extracting themes from experiences. Be insightful about recurring patterns.',
        temperature: 0.5,
        maxTokens: 1024,
      });

      return this.parseThemeExtraction(response.text, experiences);
    } catch (error) {
      console.error('Error extracting themes:', error);
      return [];
    }
  }

  /**
   * Parse theme extraction from response
   */
  private parseThemeExtraction(
    response: string,
    experiences: ExperienceAnalysis[]
  ): ThemeExtraction[] {
    const themes: ThemeExtraction[] = [];
    const sections = response
      .split(/\d+\./)
      .filter((section) => section.trim());

    sections.forEach((section, index) => {
      const lines = section
        .trim()
        .split('\n')
        .filter((line) => line.trim());
      if (lines.length >= 3) {
        const nameMatch = lines[0].match(/Theme:?\s*(.+)/i);
        const name = nameMatch ? nameMatch[1].trim() : `Theme ${index + 1}`;

        const description = lines[1].replace(/Description:?\s*/i, '').trim();

        const evidence = lines
          .filter(
            (line) => line.includes('evidence') || line.includes('example')
          )
          .slice(0, 2);

        const significanceMatch = response.match(/significance.*?(\d+\.?\d*)/i);
        const significance = significanceMatch
          ? parseFloat(significanceMatch[1])
          : 0.7;

        themes.push({
          id: `theme-${Date.now()}-${index}`,
          name,
          description,
          evidence: evidence.map((e) => e.replace(/^[-•]\s*/, '').trim()),
          significance,
          developmentPattern: 'emerging',
          timestamp: Date.now(),
        });
      }
    });

    return themes.slice(0, this.config.maxThemesPerStory);
  }

  /**
   * Analyze plot development
   */
  async analyzePlotDevelopment(
    experiences: ExperienceAnalysis[]
  ): Promise<PlotDevelopment> {
    const prompt = `Analyze plot development from these experiences:

${experiences.map((exp) => `- ${exp.description} (${exp.outcome})`).join('\n')}

Analyze:
1. Plot structure and progression
2. Rising and falling action
3. Climax and resolution points
4. Subplots and parallel developments
5. Pacing and rhythm
6. Narrative tension and release
7. Story arcs and cycles

Provide insights about plot development patterns.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are analyzing plot development. Focus on narrative structure and progression.',
        temperature: 0.4,
        maxTokens: 1024,
      });

      return this.parsePlotDevelopment(response.text, experiences);
    } catch (error) {
      console.error('Error analyzing plot development:', error);
      return this.createEmptyPlotDevelopment();
    }
  }

  /**
   * Parse plot development from response
   */
  private parsePlotDevelopment(
    response: string,
    experiences: ExperienceAnalysis[]
  ): PlotDevelopment {
    const lines = response.split('\n').filter((line) => line.trim());

    const structure: string[] = [];
    const climaxPoints: string[] = [];
    const subplots: string[] = [];
    const pacing: string[] = [];

    let currentSection = '';

    lines.forEach((line) => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('structure') || lowerLine.includes('progression'))
        currentSection = 'structure';
      else if (lowerLine.includes('climax') || lowerLine.includes('resolution'))
        currentSection = 'climax';
      else if (lowerLine.includes('subplot') || lowerLine.includes('parallel'))
        currentSection = 'subplots';
      else if (lowerLine.includes('pacing') || lowerLine.includes('rhythm'))
        currentSection = 'pacing';
      else if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
        const content = line.replace(/^[-•]\s*/, '').trim();
        switch (currentSection) {
          case 'structure':
            structure.push(content);
            break;
          case 'climax':
            climaxPoints.push(content);
            break;
          case 'subplots':
            subplots.push(content);
            break;
          case 'pacing':
            pacing.push(content);
            break;
        }
      }
    });

    return {
      structure,
      climaxPoints,
      subplots,
      pacing,
      complexity: this.calculatePlotComplexity(experiences),
      coherence: 0.8,
    };
  }

  /**
   * Parse character arc from response
   */
  private parseCharacterArc(
    response: string,
    experiences: ExperienceAnalysis[]
  ): CharacterArc {
    const lines = response.split('\n').filter((line) => line.trim());

    const growthAreas: string[] = [];
    const personalityChanges: string[] = [];
    const skillDevelopment: string[] = [];
    const relationshipDevelopment: string[] = [];
    const valueEvolution: string[] = [];

    let currentSection = '';

    lines.forEach((line) => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('growth') || lowerLine.includes('development'))
        currentSection = 'growth';
      else if (
        lowerLine.includes('personality') ||
        lowerLine.includes('change')
      )
        currentSection = 'personality';
      else if (lowerLine.includes('skill') || lowerLine.includes('capability'))
        currentSection = 'skills';
      else if (
        lowerLine.includes('relationship') ||
        lowerLine.includes('social')
      )
        currentSection = 'relationships';
      else if (lowerLine.includes('value') || lowerLine.includes('belief'))
        currentSection = 'values';
      else if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
        const content = line.replace(/^[-•]\s*/, '').trim();
        switch (currentSection) {
          case 'growth':
            growthAreas.push(content);
            break;
          case 'personality':
            personalityChanges.push(content);
            break;
          case 'skills':
            skillDevelopment.push(content);
            break;
          case 'relationships':
            relationshipDevelopment.push(content);
            break;
          case 'values':
            valueEvolution.push(content);
            break;
        }
      }
    });

    return {
      growthAreas,
      personalityChanges,
      skillDevelopment,
      relationshipDevelopment,
      valueEvolution,
      arcType: this.determineArcType(experiences),
      completeness: this.calculateArcCompleteness(experiences),
    };
  }

  /**
   * Assess narrative coherence
   */
  async assessCoherence(
    experiences: ExperienceAnalysis[]
  ): Promise<NarrativeCoherence> {
    if (!this.config.enableCoherenceMaintenance) {
      return this.createEmptyCoherence();
    }

    const prompt = `Assess narrative coherence from these experiences:

${experiences.map((exp) => `- ${exp.description} (${exp.outcome})`).join('\n')}

Assess:
1. Story consistency and continuity
2. Character consistency
3. Theme coherence and development
4. Plot logic and causality
5. Setting and world consistency
6. Tone and style consistency
7. Pacing and rhythm coherence
8. Overall narrative flow

Provide insights about narrative coherence.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are assessing narrative coherence. Be objective about consistency and flow.',
        temperature: 0.3,
        maxTokens: 1024,
      });

      return this.parseCoherenceAssessment(response.text, experiences);
    } catch (error) {
      console.error('Error assessing coherence:', error);
      return this.createEmptyCoherence();
    }
  }

  /**
   * Parse coherence assessment from response
   */
  private parseCoherenceAssessment(
    response: string,
    experiences: ExperienceAnalysis[]
  ): NarrativeCoherence {
    const lines = response.split('\n').filter((line) => line.trim());

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const inconsistencies: string[] = [];
    const improvements: string[] = [];

    let currentSection = '';

    lines.forEach((line) => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('strength') || lowerLine.includes('positive'))
        currentSection = 'strengths';
      else if (lowerLine.includes('weakness') || lowerLine.includes('issue'))
        currentSection = 'weaknesses';
      else if (
        lowerLine.includes('inconsistency') ||
        lowerLine.includes('contradiction')
      )
        currentSection = 'inconsistencies';
      else if (
        lowerLine.includes('improvement') ||
        lowerLine.includes('suggestion')
      )
        currentSection = 'improvements';
      else if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
        const content = line.replace(/^[-•]\s*/, '').trim();
        switch (currentSection) {
          case 'strengths':
            strengths.push(content);
            break;
          case 'weaknesses':
            weaknesses.push(content);
            break;
          case 'inconsistencies':
            inconsistencies.push(content);
            break;
          case 'improvements':
            improvements.push(content);
            break;
        }
      }
    });

    return {
      strengths,
      weaknesses,
      inconsistencies,
      improvements,
      overallCoherence: this.calculateOverallCoherence(experiences),
      metrics: this.calculateCoherenceMetrics(experiences),
    };
  }

  /**
   * Generate narrative insights
   */
  async generateNarrativeInsights(
    synthesis: StorySynthesis
  ): Promise<NarrativeInsight[]> {
    const prompt = `Generate narrative insights from this story synthesis:

Story Elements: ${synthesis.storyElements.map((e) => e.description).join(', ')}
Themes: ${synthesis.themes.map((t) => t.name).join(', ')}
Plot Development: ${synthesis.plotDevelopment.structure.join(', ')}
Character Arc: ${synthesis.characterArc.growthAreas.join(', ')}

Generate insights about:
1. Story meaning and significance
2. Character development patterns
3. Theme development and resolution
4. Narrative structure effectiveness
5. Personal growth implications
6. Future story directions

Provide 3-5 specific narrative insights.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are generating narrative insights. Be insightful about story meaning and development.',
        temperature: 0.6,
        maxTokens: 512,
      });

      return response.text
        .split('\n')
        .filter(
          (line) => line.trim().startsWith('-') || line.trim().startsWith('•')
        )
        .map((line, index) => ({
          id: `insight-${Date.now()}-${index}`,
          description: line.replace(/^[-•]\s*/, '').trim(),
          type: 'narrative',
          significance: 0.8,
          timestamp: Date.now(),
        }))
        .slice(0, 5);
    } catch (error) {
      console.error('Error generating narrative insights:', error);
      return [];
    }
  }

  /**
   * Integrate experience into narrative
   */
  async integrateExperience(
    experience: ExperienceAnalysis
  ): Promise<ExperienceIntegration> {
    if (!this.config.enableExperienceIntegration) {
      return this.createEmptyExperienceIntegration(experience);
    }

    const prompt = `Integrate this experience into the narrative:

Experience: ${experience.description}
Outcome: ${experience.outcome}
Context: ${JSON.stringify(experience.context || {})}

Analyze:
1. How this experience fits into the overall story
2. What story elements it contributes
3. How it affects character development
4. What themes it reinforces or introduces
5. How it impacts plot development
6. What narrative significance it has

Provide integration analysis.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are integrating experiences into narrative. Focus on story coherence and development.',
        temperature: 0.4,
        maxTokens: 512,
      });

      return this.parseExperienceIntegration(response.text, experience);
    } catch (error) {
      console.error('Error integrating experience:', error);
      return this.createEmptyExperienceIntegration(experience);
    }
  }

  /**
   * Parse experience integration from response
   */
  private parseExperienceIntegration(
    response: string,
    experience: ExperienceAnalysis
  ): ExperienceIntegration {
    const lines = response.split('\n').filter((line) => line.trim());

    const narrativeContext =
      lines.find(
        (line) => line.includes('story') || line.includes('narrative')
      ) || '';
    const lessonsExtracted = lines
      .filter((line) => line.includes('lesson') || line.includes('learn'))
      .slice(0, 2);
    const identityImpact =
      lines.find(
        (line) => line.includes('character') || line.includes('development')
      ) || '';
    const coherenceChanges =
      lines.find(
        (line) => line.includes('coherence') || line.includes('consistency')
      ) || '';

    return {
      experienceId: experience.id || `exp-${Date.now()}`,
      integrationDate: Date.now(),
      narrativeContext: narrativeContext.replace(/^[-•]\s*/, '').trim(),
      lessonsExtracted: lessonsExtracted.map((l) =>
        l.replace(/^[-•]\s*/, '').trim()
      ),
      identityImpact: this.parseIdentityImpacts(identityImpact),
      coherenceChanges: this.parseCoherenceChanges(coherenceChanges),
    };
  }

  /**
   * Calculate plot complexity
   */
  private calculatePlotComplexity(experiences: ExperienceAnalysis[]): number {
    if (experiences.length === 0) return 0;

    // Simple complexity calculation based on experience variety and outcomes
    const uniqueOutcomes = new Set(experiences.map((exp) => exp.outcome)).size;
    const complexity = Math.min(
      1,
      uniqueOutcomes / experiences.length + experiences.length / 20
    );

    return complexity;
  }

  /**
   * Determine character arc type
   */
  private determineArcType(experiences: ExperienceAnalysis[]): string {
    const outcomes = experiences
      .map((exp) => exp.outcome)
      .filter((outcome) => outcome != null);
    if (outcomes.length === 0) return 'growth';

    const positiveOutcomes = outcomes.filter(
      (outcome) =>
        outcome.toLowerCase().includes('success') ||
        outcome.toLowerCase().includes('achieved') ||
        outcome.toLowerCase().includes('learned')
    ).length;

    const ratio = positiveOutcomes / outcomes.length;

    if (ratio > 0.7) return 'growth';
    if (ratio > 0.4) return 'redemption';
    if (ratio > 0.2) return 'struggle';
    return 'tragic';
  }

  /**
   * Calculate arc completeness
   */
  private calculateArcCompleteness(experiences: ExperienceAnalysis[]): number {
    if (experiences.length === 0) return 0;

    // Simple completeness calculation
    const recentExperiences = experiences.slice(-5);
    const hasResolution = recentExperiences.some(
      (exp) =>
        exp.outcome &&
        (exp.outcome.toLowerCase().includes('resolved') ||
          exp.outcome.toLowerCase().includes('completed') ||
          exp.outcome.toLowerCase().includes('achieved'))
    );

    return hasResolution ? 0.8 : 0.4;
  }

  /**
   * Calculate overall coherence
   */
  private calculateOverallCoherence(experiences: ExperienceAnalysis[]): number {
    if (experiences.length === 0) return 0;

    // Simple coherence calculation
    const outcomes = experiences
      .map((exp) => exp.outcome)
      .filter((outcome) => outcome != null);
    if (outcomes.length === 0) return 0;

    const consistentOutcomes = outcomes.filter(
      (outcome) =>
        outcome.toLowerCase().includes('success') ||
        outcome.toLowerCase().includes('achieved') ||
        outcome.toLowerCase().includes('learned')
    ).length;

    return consistentOutcomes / outcomes.length;
  }

  /**
   * Calculate coherence metrics
   */
  private calculateCoherenceMetrics(
    experiences: ExperienceAnalysis[]
  ): CoherenceMetric[] {
    return [
      {
        name: 'Story Consistency',
        value: this.calculateOverallCoherence(experiences),
        threshold: this.config.coherenceThreshold,
        trend: 'stable',
      },
      {
        name: 'Character Consistency',
        value: 0.8,
        threshold: 0.7,
        trend: 'improving',
      },
      {
        name: 'Theme Coherence',
        value: 0.75,
        threshold: 0.6,
        trend: 'stable',
      },
    ];
  }

  /**
   * Get last synthesis
   */
  private getLastSynthesis(): StorySynthesis {
    return (
      this.synthesisHistory[this.synthesisHistory.length - 1] ||
      this.createEmptyStorySynthesis()
    );
  }

  /**
   * Create empty story synthesis
   */
  private createEmptyStorySynthesis(): StorySynthesis {
    return {
      id: `empty-synthesis-${Date.now()}`,
      timestamp: Date.now(),
      storyElements: [],
      themes: [],
      plotDevelopment: this.createEmptyPlotDevelopment(),
      characterArc: this.createEmptyCharacterArc(),
      coherence: this.createEmptyCoherence(),
      insights: [],
    };
  }

  /**
   * Create empty plot development
   */
  private createEmptyPlotDevelopment(): PlotDevelopment {
    return {
      structure: [],
      climaxPoints: [],
      subplots: [],
      pacing: [],
      complexity: 0,
      coherence: 0,
    };
  }

  /**
   * Create empty character arc
   */
  private createEmptyCharacterArc(): CharacterArc {
    return {
      growthAreas: [],
      personalityChanges: [],
      skillDevelopment: [],
      relationshipDevelopment: [],
      valueEvolution: [],
      arcType: 'growth',
      completeness: 0,
    };
  }

  /**
   * Create empty coherence
   */
  private createEmptyCoherence(): NarrativeCoherence {
    return {
      strengths: [],
      weaknesses: [],
      inconsistencies: [],
      improvements: [],
      overallCoherence: 0,
      metrics: [],
    };
  }

  /**
   * Create empty experience integration
   */
  private createEmptyExperienceIntegration(
    experience: ExperienceAnalysis
  ): ExperienceIntegration {
    return {
      experienceId: experience.id || `exp-${Date.now()}`,
      integrationDate: Date.now(),
      narrativeContext: '',
      lessonsExtracted: [],
      identityImpact: [],
      coherenceChanges: [],
    };
  }

  /**
   * Get synthesis history
   */
  getSynthesisHistory(): StorySynthesis[] {
    return [...this.synthesisHistory];
  }

  /**
   * Develop plot from experiences
   */
  async developPlot(
    experiences: ExperienceAnalysis[]
  ): Promise<PlotDevelopment> {
    return this.analyzePlotDevelopment(experiences);
  }

  /**
   * Analyze character arc from experiences
   */
  async analyzeCharacterArc(
    experiences: ExperienceAnalysis[]
  ): Promise<CharacterArc> {
    const prompt = `Analyze character arc development from these experiences:

${experiences.map((exp) => `- ${exp.description} (${exp.outcome})`).join('\n')}

Analyze:
1. Character growth and development
2. Personality changes and evolution
3. Skill and capability development
4. Relationship development
5. Value and belief evolution
6. Identity formation and change
7. Character strengths and weaknesses
8. Character motivations and goals

Provide insights about character development patterns.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are analyzing character arc development. Focus on personal growth and change.',
        temperature: 0.5,
        maxTokens: 1024,
      });

      return this.parseCharacterArc(response.text, experiences);
    } catch (error) {
      console.error('Error analyzing character arc:', error);
      return this.createEmptyCharacterArc();
    }
  }

  /**
   * Evaluate narrative coherence
   */
  async evaluateCoherence(
    narrativeElements: any[]
  ): Promise<NarrativeCoherence> {
    const mockExperiences: ExperienceAnalysis[] = narrativeElements.map(
      (elem, index) => ({
        id: `exp-${index}`,
        description: elem.name || `Element ${index}`,
        outcome: 'analyzed',
        timestamp: Date.now(),
      })
    );

    return this.assessCoherence(mockExperiences);
  }

  /**
   * Generate insights from narrative
   */
  async generateInsights(narrative: any): Promise<NarrativeInsight[]> {
    const mockSynthesis: StorySynthesis = {
      id: 'insight-synthesis',
      timestamp: Date.now(),
      storyElements: [],
      themes: [],
      plotDevelopment: this.createEmptyPlotDevelopment(),
      characterArc: this.createEmptyCharacterArc(),
      coherence: this.createEmptyCoherence(),
      insights: [],
    };

    return this.generateNarrativeInsights(mockSynthesis);
  }

  /**
   * Get narrative intelligence statistics
   */
  getStats() {
    const totalInsights = this.synthesisHistory.reduce(
      (sum, s) => sum + s.insights.length,
      0
    );

    return {
      totalSyntheses: this.synthesisHistory.length,
      averageCoherence:
        this.synthesisHistory.length > 0
          ? this.synthesisHistory.reduce(
              (sum, s) => sum + (s.coherence.overallCoherence || 0),
              0
            ) / this.synthesisHistory.length
          : 0,
      averageComplexity:
        this.synthesisHistory.length > 0
          ? this.synthesisHistory.reduce(
              (sum, s) => sum + (s.plotDevelopment.complexity || 0),
              0
            ) / this.synthesisHistory.length
          : 0,
      totalThemes: this.synthesisHistory.reduce(
        (sum, s) => sum + s.themes.length,
        0
      ),
      totalInsights: totalInsights,
      config: this.config,
    };
  }

  /**
   * Parse identity impacts from string
   */
  private parseIdentityImpacts(impactText: string): IdentityImpact[] {
    if (!impactText || impactText.trim() === '') {
      return [];
    }

    return [
      {
        aspect: IdentityAspect.PERSONALITY,
        type: ImpactType.REINFORCEMENT,
        magnitude: 0.5,
        description: impactText.replace(/^[-•]\s*/, '').trim(),
        evidence: [impactText.replace(/^[-•]\s*/, '').trim()],
        timestamp: Date.now(),
      },
    ];
  }

  /**
   * Parse coherence changes from string
   */
  private parseCoherenceChanges(changesText: string): CoherenceChange[] {
    if (!changesText || changesText.trim() === '') {
      return [];
    }

    return [
      {
        area: 'narrative',
        previousScore: 0.5,
        newScore: 0.7,
        reasoning: changesText.replace(/^[-•]\s*/, '').trim(),
        supportingEvidence: [changesText.replace(/^[-•]\s*/, '').trim()],
      },
    ];
  }
}
