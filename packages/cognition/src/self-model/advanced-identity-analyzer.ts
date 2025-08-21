/**
 * Advanced identity analysis and evolution tracking.
 *
 * Provides sophisticated personality trait analysis, value system
 * tracking, and identity evolution monitoring for deep self-understanding.
 *
 * @author @darianrosebrook
 */

import { LLMInterface } from '../cognitive-core/llm-interface';
import {
  IdentityCore,
  PersonalityTrait,
  CoreValue,
  Capability,
  IdentityAnalysis,
  PersonalityAnalysis,
  ValueSystemAnalysis,
  IdentityEvolution,
  BehaviorPattern,
  IdentityCoherence,
  TraitInteraction,
  ValueConflict,
  EvolutionTrigger,
} from './types';

/**
 * Configuration for advanced identity analysis
 */
export interface AdvancedIdentityAnalyzerConfig {
  enablePersonalityAnalysis: boolean;
  enableValueSystemTracking: boolean;
  enableEvolutionMonitoring: boolean;
  enableCoherenceAnalysis: boolean;
  analysisFrequency: number; // milliseconds
  evolutionThreshold: number; // 0-1, minimum change to trigger evolution
  coherenceThreshold: number; // 0-1, minimum coherence score
  maxBehaviorPatterns: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AdvancedIdentityAnalyzerConfig = {
  enablePersonalityAnalysis: true,
  enableValueSystemTracking: true,
  enableEvolutionMonitoring: true,
  enableCoherenceAnalysis: true,
  analysisFrequency: 3600000, // 1 hour
  evolutionThreshold: 0.15,
  coherenceThreshold: 0.7,
  maxBehaviorPatterns: 20,
};

/**
 * Advanced identity analyzer
 */
export class AdvancedIdentityAnalyzer {
  private llm: LLMInterface;
  private config: AdvancedIdentityAnalyzerConfig;
  private behaviorHistory: BehaviorPattern[] = [];
  private analysisHistory: IdentityAnalysis[] = [];
  private lastAnalysis: number = 0;

  constructor(
    llm: LLMInterface,
    config: Partial<AdvancedIdentityAnalyzerConfig> = {}
  ) {
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Perform comprehensive identity analysis
   */
  async analyzeIdentity(identity: IdentityCore): Promise<IdentityAnalysis> {
    const now = Date.now();
    if (now - this.lastAnalysis < this.config.analysisFrequency) {
      return this.getLastAnalysis();
    }

    const analysis: IdentityAnalysis = {
      id: `analysis-${Date.now()}`,
      timestamp: now,
      personalityAnalysis: await this.analyzePersonality(identity),
      valueSystemAnalysis: await this.analyzeValueSystem(identity),
      evolutionAnalysis: await this.analyzeEvolution(identity),
      coherenceAnalysis: await this.analyzeCoherence(identity),
      behaviorPatterns: this.extractBehaviorPatterns(),
      recommendations: [],
    };

    // Generate recommendations
    analysis.recommendations = await this.generateRecommendations(analysis);

    this.analysisHistory.push(analysis);
    this.lastAnalysis = now;

    return analysis;
  }

  /**
   * Analyze personality traits and interactions
   */
  async analyzePersonality(
    identity: IdentityCore
  ): Promise<PersonalityAnalysis> {
    if (!this.config.enablePersonalityAnalysis) {
      return this.createEmptyPersonalityAnalysis();
    }

    const prompt = `Analyze these personality traits for patterns and interactions:

${identity.personalityTraits
  .map(
    (trait) =>
      `- ${trait.name}: ${trait.description} (Strength: ${trait.strength}, Stability: ${trait.stability})`
  )
  .join('\n')}

Analyze:
1. Trait interactions and synergies
2. Potential conflicts between traits
3. Dominant trait patterns
4. Trait stability and consistency
5. Personality coherence and balance

Provide specific insights about trait dynamics.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are analyzing personality traits for patterns and interactions. Be insightful and specific.',
        temperature: 0.4,
        maxTokens: 1024,
      });

      return this.parsePersonalityAnalysis(
        response.text,
        identity.personalityTraits
      );
    } catch (error) {
      console.error('Error analyzing personality:', error);
      return this.createEmptyPersonalityAnalysis();
    }
  }

  /**
   * Parse personality analysis response
   */
  private parsePersonalityAnalysis(
    response: string,
    traits: PersonalityTrait[]
  ): PersonalityAnalysis {
    const lines = response.split('\n').filter((line) => line.trim());

    const interactions: TraitInteraction[] = [];
    const dominantPatterns: string[] = [];
    const potentialConflicts: string[] = [];
    const stabilityInsights: string[] = [];

    let currentSection = '';

    lines.forEach((line) => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('interaction') || lowerLine.includes('synergy'))
        currentSection = 'interactions';
      else if (lowerLine.includes('dominant') || lowerLine.includes('pattern'))
        currentSection = 'patterns';
      else if (lowerLine.includes('conflict') || lowerLine.includes('tension'))
        currentSection = 'conflicts';
      else if (
        lowerLine.includes('stability') ||
        lowerLine.includes('consistency')
      )
        currentSection = 'stability';
      else if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
        const content = line.replace(/^[-•]\s*/, '').trim();
        switch (currentSection) {
          case 'interactions':
            interactions.push({
              traits: this.extractTraitNames(content, traits),
              type: 'synergy',
              description: content,
              strength: 0.7,
            });
            break;
          case 'patterns':
            dominantPatterns.push(content);
            break;
          case 'conflicts':
            potentialConflicts.push(content);
            break;
          case 'stability':
            stabilityInsights.push(content);
            break;
        }
      }
    });

    return {
      traitInteractions: interactions,
      dominantPatterns,
      potentialConflicts,
      stabilityInsights,
      overallCoherence: this.calculatePersonalityCoherence(traits),
      recommendations: [],
    };
  }

  /**
   * Analyze value system and conflicts
   */
  async analyzeValueSystem(
    identity: IdentityCore
  ): Promise<ValueSystemAnalysis> {
    if (!this.config.enableValueSystemTracking) {
      return this.createEmptyValueSystemAnalysis();
    }

    const prompt = `Analyze this value system for coherence and conflicts:

${identity.coreValues
  .map(
    (value) =>
      `- ${value.name}: ${value.description} (Importance: ${value.importance}, Consistency: ${value.consistency})
   Conflicts: ${value.conflicts.join(', ') || 'None'}`
  )
  .join('\n\n')}

Analyze:
1. Value hierarchy and priorities
2. Potential value conflicts and resolutions
3. Value consistency across different contexts
4. Value evolution and learning
5. Value manifestation in behavior

Provide insights about value system dynamics.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are analyzing value systems for coherence and conflicts. Be thoughtful and practical.',
        temperature: 0.4,
        maxTokens: 1024,
      });

      return this.parseValueSystemAnalysis(response.text, identity.coreValues);
    } catch (error) {
      console.error('Error analyzing value system:', error);
      return this.createEmptyValueSystemAnalysis();
    }
  }

  /**
   * Parse value system analysis response
   */
  private parseValueSystemAnalysis(
    response: string,
    values: CoreValue[]
  ): ValueSystemAnalysis {
    const lines = response.split('\n').filter((line) => line.trim());

    const valueHierarchy: string[] = [];
    const conflicts: ValueConflict[] = [];
    const consistencyInsights: string[] = [];
    const evolutionPatterns: string[] = [];

    let currentSection = '';

    lines.forEach((line) => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('hierarchy') || lowerLine.includes('priority'))
        currentSection = 'hierarchy';
      else if (lowerLine.includes('conflict') || lowerLine.includes('tension'))
        currentSection = 'conflicts';
      else if (
        lowerLine.includes('consistency') ||
        lowerLine.includes('alignment')
      )
        currentSection = 'consistency';
      else if (
        lowerLine.includes('evolution') ||
        lowerLine.includes('learning')
      )
        currentSection = 'evolution';
      else if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
        const content = line.replace(/^[-•]\s*/, '').trim();
        switch (currentSection) {
          case 'hierarchy':
            valueHierarchy.push(content);
            break;
          case 'conflicts':
            conflicts.push({
              values: this.extractValueNames(content, values),
              description: content,
              severity: 0.6,
              resolution: '',
            });
            break;
          case 'consistency':
            consistencyInsights.push(content);
            break;
          case 'evolution':
            evolutionPatterns.push(content);
            break;
        }
      }
    });

    return {
      valueHierarchy,
      conflicts,
      consistencyInsights,
      evolutionPatterns,
      overallCoherence: this.calculateValueSystemCoherence(values),
      recommendations: [],
    };
  }

  /**
   * Analyze identity evolution over time
   */
  async analyzeEvolution(identity: IdentityCore): Promise<IdentityEvolution> {
    if (!this.config.enableEvolutionMonitoring) {
      return this.createEmptyEvolutionAnalysis();
    }

    const recentAnalyses = this.analysisHistory.slice(-5);
    if (recentAnalyses.length < 2) {
      return this.createEmptyEvolutionAnalysis();
    }

    const prompt = `Analyze identity evolution based on recent changes:

Current Identity:
${identity.personalityTraits.map((trait) => `- ${trait.name}: ${trait.strength}`).join('\n')}

Recent Changes:
${recentAnalyses
  .map(
    (analysis) =>
      `- ${new Date(analysis.timestamp).toLocaleDateString()}: ${analysis.personalityAnalysis?.dominantPatterns.join(', ')}`
  )
  .join('\n')}

Analyze:
1. Evolution patterns and trends
2. Triggers for identity changes
3. Stability vs. adaptability balance
4. Authentic vs. reactive changes
5. Future evolution predictions

Provide insights about identity development.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are analyzing identity evolution patterns. Be insightful about development trends.',
        temperature: 0.5,
        maxTokens: 1024,
      });

      return this.parseEvolutionAnalysis(response.text, recentAnalyses);
    } catch (error) {
      console.error('Error analyzing evolution:', error);
      return this.createEmptyEvolutionAnalysis();
    }
  }

  /**
   * Parse evolution analysis response
   */
  private parseEvolutionAnalysis(
    response: string,
    recentAnalyses: IdentityAnalysis[]
  ): IdentityEvolution {
    const lines = response.split('\n').filter((line) => line.trim());

    const evolutionPatterns: string[] = [];
    const triggers: EvolutionTrigger[] = [];
    const stabilityInsights: string[] = [];
    const predictions: string[] = [];

    let currentSection = '';

    lines.forEach((line) => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('pattern') || lowerLine.includes('trend'))
        currentSection = 'patterns';
      else if (lowerLine.includes('trigger') || lowerLine.includes('cause'))
        currentSection = 'triggers';
      else if (lowerLine.includes('stability') || lowerLine.includes('balance'))
        currentSection = 'stability';
      else if (lowerLine.includes('prediction') || lowerLine.includes('future'))
        currentSection = 'predictions';
      else if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
        const content = line.replace(/^[-•]\s*/, '').trim();
        switch (currentSection) {
          case 'patterns':
            evolutionPatterns.push(content);
            break;
          case 'triggers':
            triggers.push({
              type: 'experience',
              description: content,
              impact: 0.6,
              timestamp: Date.now(),
            });
            break;
          case 'stability':
            stabilityInsights.push(content);
            break;
          case 'predictions':
            predictions.push(content);
            break;
        }
      }
    });

    return {
      evolutionPatterns,
      triggers,
      stabilityInsights,
      predictions,
      evolutionRate: this.calculateEvolutionRate(recentAnalyses),
      authenticityScore: 0.8,
    };
  }

  /**
   * Analyze identity coherence
   */
  async analyzeCoherence(identity: IdentityCore): Promise<IdentityCoherence> {
    if (!this.config.enableCoherenceAnalysis) {
      return this.createEmptyCoherenceAnalysis();
    }

    const prompt = `Analyze identity coherence across all components:

Personality Traits:
${identity.personalityTraits.map((trait) => `- ${trait.name}: ${trait.description}`).join('\n')}

Core Values:
${identity.coreValues.map((value) => `- ${value.name}: ${value.description}`).join('\n')}

Capabilities:
${identity.capabilities.map((cap) => `- ${cap.name}: ${cap.description}`).join('\n')}

Analyze:
1. Internal consistency across components
2. Alignment between traits, values, and capabilities
3. Potential incoherencies or contradictions
4. Strengths of the identity system
5. Areas for improvement

Provide insights about identity coherence.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are analyzing identity coherence. Be objective and constructive.',
        temperature: 0.3,
        maxTokens: 1024,
      });

      return this.parseCoherenceAnalysis(response.text, identity);
    } catch (error) {
      console.error('Error analyzing coherence:', error);
      return this.createEmptyCoherenceAnalysis();
    }
  }

  /**
   * Parse coherence analysis response
   */
  private parseCoherenceAnalysis(
    response: string,
    identity: IdentityCore
  ): IdentityCoherence {
    const lines = response.split('\n').filter((line) => line.trim());

    const strengths: string[] = [];
    const incoherencies: string[] = [];
    const alignments: string[] = [];
    const improvements: string[] = [];

    let currentSection = '';

    lines.forEach((line) => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('strength') || lowerLine.includes('positive'))
        currentSection = 'strengths';
      else if (
        lowerLine.includes('incoherence') ||
        lowerLine.includes('contradiction')
      )
        currentSection = 'incoherencies';
      else if (
        lowerLine.includes('alignment') ||
        lowerLine.includes('consistency')
      )
        currentSection = 'alignments';
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
          case 'incoherencies':
            incoherencies.push(content);
            break;
          case 'alignments':
            alignments.push(content);
            break;
          case 'improvements':
            improvements.push(content);
            break;
        }
      }
    });

    return {
      strengths,
      incoherencies,
      alignments,
      improvements,
      overallCoherence: this.calculateOverallCoherence(identity),
      confidence: 0.8,
    };
  }

  /**
   * Generate recommendations based on analysis
   */
  async generateRecommendations(analysis: IdentityAnalysis): Promise<string[]> {
    const prompt = `Based on this identity analysis, generate actionable recommendations:

Personality Analysis:
- Dominant Patterns: ${analysis.personalityAnalysis?.dominantPatterns.join(', ')}
- Potential Conflicts: ${analysis.personalityAnalysis?.potentialConflicts.join(', ')}

Value System Analysis:
- Value Hierarchy: ${analysis.valueSystemAnalysis?.valueHierarchy.join(', ')}
- Conflicts: ${analysis.valueSystemAnalysis?.conflicts.map((c) => c.description).join(', ')}

Evolution Analysis:
- Patterns: ${analysis.evolutionAnalysis?.evolutionPatterns.join(', ')}
- Triggers: ${analysis.evolutionAnalysis?.triggers.map((t) => t.description).join(', ')}

Coherence Analysis:
- Strengths: ${analysis.coherenceAnalysis?.strengths.join(', ')}
- Incoherencies: ${analysis.coherenceAnalysis?.incoherencies.join(', ')}

Generate 3-5 specific, actionable recommendations for identity development.`;

    try {
      const response = await this.llm.generateResponse(prompt, {
        systemPrompt:
          'You are generating identity development recommendations. Be specific and actionable.',
        temperature: 0.5,
        maxTokens: 512,
      });

      return response.text
        .split('\n')
        .filter(
          (line) => line.trim().startsWith('-') || line.trim().startsWith('•')
        )
        .map((line) => line.replace(/^[-•]\s*/, '').trim())
        .slice(0, 5);
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return [];
    }
  }

  /**
   * Add behavior pattern for analysis
   */
  addBehaviorPattern(pattern: BehaviorPattern): void {
    this.behaviorHistory.push(pattern);

    // Limit history size
    if (this.behaviorHistory.length > this.config.maxBehaviorPatterns) {
      this.behaviorHistory = this.behaviorHistory.slice(
        -this.config.maxBehaviorPatterns
      );
    }
  }

  /**
   * Extract behavior patterns from history
   */
  private extractBehaviorPatterns(): BehaviorPattern[] {
    return [...this.behaviorHistory];
  }

  /**
   * Get last analysis
   */
  private getLastAnalysis(): IdentityAnalysis {
    return (
      this.analysisHistory[this.analysisHistory.length - 1] ||
      this.createEmptyAnalysis()
    );
  }

  /**
   * Calculate personality coherence
   */
  private calculatePersonalityCoherence(traits: PersonalityTrait[]): number {
    if (traits.length === 0) return 0;

    const avgStrength =
      traits.reduce((sum, trait) => sum + trait.strength, 0) / traits.length;
    const avgStability =
      traits.reduce((sum, trait) => sum + trait.stability, 0) / traits.length;

    return (avgStrength + avgStability) / 2;
  }

  /**
   * Calculate value system coherence
   */
  private calculateValueSystemCoherence(values: CoreValue[]): number {
    if (values.length === 0) return 0;

    const avgImportance =
      values.reduce((sum, value) => sum + value.importance, 0) / values.length;
    const avgConsistency =
      values.reduce((sum, value) => sum + value.consistency, 0) / values.length;

    return (avgImportance + avgConsistency) / 2;
  }

  /**
   * Calculate evolution rate
   */
  private calculateEvolutionRate(recentAnalyses: IdentityAnalysis[]): number {
    if (recentAnalyses.length < 2) return 0;

    // Simple evolution rate calculation
    const timeSpan =
      recentAnalyses[recentAnalyses.length - 1].timestamp -
      recentAnalyses[0].timestamp;
    const days = timeSpan / (1000 * 60 * 60 * 24);

    return Math.min(1, recentAnalyses.length / Math.max(1, days));
  }

  /**
   * Calculate overall coherence
   */
  private calculateOverallCoherence(identity: IdentityCore): number {
    const personalityCoherence = this.calculatePersonalityCoherence(
      identity.personalityTraits
    );
    const valueCoherence = this.calculateValueSystemCoherence(
      identity.coreValues
    );

    return (personalityCoherence + valueCoherence) / 2;
  }

  /**
   * Extract trait names from text
   */
  private extractTraitNames(
    text: string,
    traits: PersonalityTrait[]
  ): string[] {
    return traits
      .filter((trait) => text.toLowerCase().includes(trait.name.toLowerCase()))
      .map((trait) => trait.name);
  }

  /**
   * Extract value names from text
   */
  private extractValueNames(text: string, values: CoreValue[]): string[] {
    return values
      .filter((value) => text.toLowerCase().includes(value.name.toLowerCase()))
      .map((value) => value.name);
  }

  /**
   * Create empty analysis
   */
  private createEmptyAnalysis(): IdentityAnalysis {
    return {
      id: `empty-analysis-${Date.now()}`,
      timestamp: Date.now(),
      personalityAnalysis: this.createEmptyPersonalityAnalysis(),
      valueSystemAnalysis: this.createEmptyValueSystemAnalysis(),
      evolutionAnalysis: this.createEmptyEvolutionAnalysis(),
      coherenceAnalysis: this.createEmptyCoherenceAnalysis(),
      behaviorPatterns: [],
      recommendations: [],
    };
  }

  /**
   * Create empty personality analysis
   */
  private createEmptyPersonalityAnalysis(): PersonalityAnalysis {
    return {
      traitInteractions: [],
      dominantPatterns: [],
      potentialConflicts: [],
      stabilityInsights: [],
      overallCoherence: 0,
      recommendations: [],
    };
  }

  /**
   * Create empty value system analysis
   */
  private createEmptyValueSystemAnalysis(): ValueSystemAnalysis {
    return {
      valueHierarchy: [],
      conflicts: [],
      consistencyInsights: [],
      evolutionPatterns: [],
      overallCoherence: 0,
      recommendations: [],
    };
  }

  /**
   * Create empty evolution analysis
   */
  private createEmptyEvolutionAnalysis(): IdentityEvolution {
    return {
      evolutionPatterns: [],
      triggers: [],
      stabilityInsights: [],
      predictions: [],
      evolutionRate: 0,
      authenticityScore: 0,
    };
  }

  /**
   * Create empty coherence analysis
   */
  private createEmptyCoherenceAnalysis(): IdentityCoherence {
    return {
      strengths: [],
      incoherencies: [],
      alignments: [],
      improvements: [],
      overallCoherence: 0,
      confidence: 0,
    };
  }

  /**
   * Get analysis history
   */
  getAnalysisHistory(): IdentityAnalysis[] {
    return [...this.analysisHistory];
  }

  /**
   * Get behavior history
   */
  getBehaviorHistory(): BehaviorPattern[] {
    return [...this.behaviorHistory];
  }

  /**
   * Get analyzer statistics
   */
  getStats() {
    return {
      totalAnalyses: this.analysisHistory.length,
      totalBehaviorPatterns: this.behaviorHistory.length,
      averageCoherence:
        this.analysisHistory.length > 0
          ? this.analysisHistory.reduce(
              (sum, a) => sum + (a.coherenceAnalysis?.overallCoherence || 0),
              0
            ) / this.analysisHistory.length
          : 0,
      averageEvolutionRate:
        this.analysisHistory.length > 0
          ? this.analysisHistory.reduce(
              (sum, a) => sum + (a.evolutionAnalysis?.evolutionRate || 0),
              0
            ) / this.analysisHistory.length
          : 0,
      config: this.config,
    };
  }
}
