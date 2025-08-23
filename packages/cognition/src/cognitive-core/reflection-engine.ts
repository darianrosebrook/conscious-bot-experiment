/**
 * Advanced reflection engine for meta-cognitive analysis.
 *
 * Provides comprehensive experience analysis, pattern recognition,
 * and learning synthesis for continuous improvement and growth.
 *
 * @author @darianrosebrook
 */

import { LLMInterface } from './llm-interface';
import {
  Experience,
  ExperienceAnalysis,
  Pattern,
  LearningSynthesis,
  Insight,
  Plan,
} from '../types';

/**
 * Configuration for reflection engine
 */
export interface ReflectionEngineConfig {
  enablePatternAnalysis: boolean;
  enableLearningSynthesis: boolean;
  enableInsightGeneration: boolean;
  enableImprovementPlanning: boolean;
  maxExperiencesPerAnalysis: number;
  patternDetectionThreshold: number;
  insightGenerationFrequency: number; // milliseconds
  learningSynthesisInterval: number; // milliseconds
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ReflectionEngineConfig = {
  enablePatternAnalysis: true,
  enableLearningSynthesis: true,
  enableInsightGeneration: true,
  enableImprovementPlanning: true,
  maxExperiencesPerAnalysis: 20,
  patternDetectionThreshold: 0.6,
  insightGenerationFrequency: 3600000, // 1 hour
  learningSynthesisInterval: 86400000, // 24 hours
};

/**
 * Advanced reflection engine
 */
export class AdvancedReflectionEngine {
  private llm: LLMInterface;
  private config: ReflectionEngineConfig;
  private experiences: Experience[] = [];
  private patterns: Pattern[] = [];
  private insights: Insight[] = [];
  private learningSyntheses: LearningSynthesis[] = [];
  private lastInsightGeneration: number = 0;
  private lastLearningSynthesis: number = 0;

  constructor(llm: LLMInterface, config: Partial<ReflectionEngineConfig> = {}) {
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze experiences for patterns and insights
   */
  async analyzeExperiencePatterns(
    experiences: Experience[]
  ): Promise<Pattern[]> {
    if (!this.config.enablePatternAnalysis || experiences.length === 0) {
      return [];
    }

    const recentExperiences = experiences
      .slice(-this.config.maxExperiencesPerAnalysis)
      .filter((exp) => exp.timestamp > Date.now() - 86400000); // Last 24 hours

    if (recentExperiences.length < 3) {
      return []; // Need at least 3 experiences for pattern detection
    }

    const patterns: Pattern[] = [];

    // Analyze behavioral patterns
    const behavioralPatterns =
      await this.analyzeBehavioralPatterns(recentExperiences);
    patterns.push(...behavioralPatterns);

    // Analyze decision-making patterns
    const decisionPatterns =
      await this.analyzeDecisionPatterns(recentExperiences);
    patterns.push(...decisionPatterns);

    // Analyze outcome patterns
    const outcomePatterns =
      await this.analyzeOutcomePatterns(recentExperiences);
    patterns.push(...outcomePatterns);

    // Analyze emotional patterns
    const emotionalPatterns =
      await this.analyzeEmotionalPatterns(recentExperiences);
    patterns.push(...emotionalPatterns);

    // Filter patterns by significance
    const significantPatterns = patterns.filter(
      (pattern) => pattern.significance >= this.config.patternDetectionThreshold
    );

    this.patterns = [...this.patterns, ...significantPatterns];
    return significantPatterns;
  }

  /**
   * Analyze behavioral patterns across experiences
   */
  private async analyzeBehavioralPatterns(
    experiences: Experience[]
  ): Promise<Pattern[]> {
    const prompt = `Analyze these experiences for behavioral patterns:

${experiences.map((exp) => `- ${exp.description} (${exp.outcome})`).join('\n')}

Look for:
1. Recurring behaviors or approaches
2. Successful behavioral strategies
3. Problematic behavioral patterns
4. Behavioral adaptations over time

Identify patterns with:
- Pattern name
- Description
- Frequency of occurrence
- Significance (0-1)
- Associated outcomes
- Recommendations`;

    try {
      const response = await this.llm.generateResponse(
        prompt,
        {
          systemPrompt:
            'You are analyzing behavioral patterns in experiences. Be objective and identify meaningful patterns.',
        },
        {
          temperature: 0.4,
          maxTokens: 1024,
        }
      );

      return this.parsePatternResponse(response.text, 'behavioral');
    } catch (error) {
      console.error('Error analyzing behavioral patterns:', error);
      return [];
    }
  }

  /**
   * Analyze decision-making patterns
   */
  private async analyzeDecisionPatterns(
    experiences: Experience[]
  ): Promise<Pattern[]> {
    const decisionExperiences = experiences.filter(
      (exp) =>
        exp.description.toLowerCase().includes('decide') ||
        exp.description.toLowerCase().includes('choice') ||
        exp.description.toLowerCase().includes('option')
    );

    if (decisionExperiences.length < 2) return [];

    const prompt = `Analyze these decision-making experiences for patterns:

${decisionExperiences.map((exp) => `- ${exp.description} (${exp.outcome})`).join('\n')}

Look for:
1. Decision-making approaches used
2. Factors considered in decisions
3. Decision quality patterns
4. Decision-making biases or heuristics
5. Successful decision strategies

Identify patterns with:
- Pattern name
- Description
- Frequency of occurrence
- Significance (0-1)
- Decision quality impact
- Improvement suggestions`;

    try {
      const response = await this.llm.generateResponse(
        prompt,
        {
          systemPrompt:
            'You are analyzing decision-making patterns. Focus on quality and effectiveness.',
        },
        {
          temperature: 0.4,
          maxTokens: 1024,
        }
      );

      return this.parsePatternResponse(response.text, 'decision');
    } catch (error) {
      console.error('Error analyzing decision patterns:', error);
      return [];
    }
  }

  /**
   * Analyze outcome patterns
   */
  private async analyzeOutcomePatterns(
    experiences: Experience[]
  ): Promise<Pattern[]> {
    const prompt = `Analyze these experiences for outcome patterns:

${experiences.map((exp) => `- ${exp.description} (${exp.outcome})`).join('\n')}

Look for:
1. Factors leading to successful outcomes
2. Common causes of failures
3. Outcome patterns by context
4. Performance trends over time
5. External factors affecting outcomes

Identify patterns with:
- Pattern name
- Description
- Frequency of occurrence
- Significance (0-1)
- Outcome correlation
- Causal factors`;

    try {
      const response = await this.llm.generateResponse(
        prompt,
        {
          systemPrompt:
            'You are analyzing outcome patterns. Focus on causality and predictability.',
        },
        {
          temperature: 0.4,
          maxTokens: 1024,
        }
      );

      return this.parsePatternResponse(response.text, 'outcome');
    } catch (error) {
      console.error('Error analyzing outcome patterns:', error);
      return [];
    }
  }

  /**
   * Analyze emotional patterns
   */
  private async analyzeEmotionalPatterns(
    experiences: Experience[]
  ): Promise<Pattern[]> {
    const emotionalExperiences = experiences.filter(
      (exp) => exp.emotionalState && Object.keys(exp.emotionalState).length > 0
    );

    if (emotionalExperiences.length < 2) return [];

    const prompt = `Analyze these experiences for emotional patterns:

${emotionalExperiences.map((exp) => `- ${exp.description} (Emotions: ${JSON.stringify(exp.emotionalState)})`).join('\n')}

Look for:
1. Emotional responses to different situations
2. Emotional regulation patterns
3. Impact of emotions on decisions
4. Emotional triggers
5. Emotional resilience patterns

Identify patterns with:
- Pattern name
- Description
- Frequency of occurrence
- Significance (0-1)
- Emotional impact
- Regulation strategies`;

    try {
      const response = await this.llm.generateResponse(
        prompt,
        {
          systemPrompt:
            'You are analyzing emotional patterns. Focus on understanding and regulation.',
        },
        {
          temperature: 0.4,
          maxTokens: 1024,
        }
      );

      return this.parsePatternResponse(response.text, 'emotional');
    } catch (error) {
      console.error('Error analyzing emotional patterns:', error);
      return [];
    }
  }

  /**
   * Parse pattern analysis response
   */
  private parsePatternResponse(response: string, type: string): Pattern[] {
    const patterns: Pattern[] = [];
    const sections = response
      .split(/\d+\./)
      .filter((section) => section.trim());

    sections.forEach((section, index) => {
      const lines = section
        .trim()
        .split('\n')
        .filter((line) => line.trim());
      if (lines.length >= 3) {
        const nameMatch = lines[0].match(/Pattern:?\s*(.+)/i);
        const name = nameMatch ? nameMatch[1].trim() : `Pattern ${index + 1}`;

        const description = lines[1].replace(/Description:?\s*/i, '').trim();

        const significanceMatch = response.match(/significance.*?(\d+\.?\d*)/i);
        const significance = significanceMatch
          ? parseFloat(significanceMatch[1])
          : 0.5;

        patterns.push({
          id: `${type}-pattern-${Date.now()}-${index}`,
          name,
          description,
          type,
          significance,
          frequency: 1,
          evidence: lines.slice(2).map((line) => line.trim()),
          timestamp: Date.now(),
        });
      }
    });

    return patterns;
  }

  /**
   * Synthesize learning from experiences and patterns
   */
  async synthesizeLearning(
    experiences: Experience[]
  ): Promise<LearningSynthesis> {
    if (!this.config.enableLearningSynthesis) {
      return this.createEmptyLearningSynthesis();
    }

    const recentExperiences = experiences.slice(
      -this.config.maxExperiencesPerAnalysis
    );
    const recentPatterns = this.patterns.filter(
      (pattern) => pattern.timestamp > Date.now() - 86400000
    );

    const prompt = `Synthesize learning from these experiences and patterns:

Experiences:
${recentExperiences.map((exp) => `- ${exp.description} (${exp.outcome})`).join('\n')}

Patterns:
${recentPatterns.map((pattern) => `- ${pattern.name}: ${pattern.description}`).join('\n')}

Generate a learning synthesis that includes:
1. Key insights learned
2. Skills or capabilities developed
3. Areas for improvement
4. Knowledge gained
5. Behavioral changes needed
6. Future learning goals

Provide specific, actionable learning outcomes.`;

    try {
      const response = await this.llm.generateResponse(
        prompt,
        {
          systemPrompt:
            'You are synthesizing learning from experiences and patterns. Focus on actionable insights.',
        },
        {
          temperature: 0.5,
          maxTokens: 1024,
        }
      );

      const synthesis = this.parseLearningSynthesis(
        response.text,
        recentExperiences,
        recentPatterns
      );
      this.learningSyntheses.push(synthesis);
      this.lastLearningSynthesis = Date.now();

      return synthesis;
    } catch (error) {
      console.error('Error synthesizing learning:', error);
      return this.createEmptyLearningSynthesis();
    }
  }

  /**
   * Parse learning synthesis response
   */
  private parseLearningSynthesis(
    response: string,
    experiences: Experience[],
    patterns: Pattern[]
  ): LearningSynthesis {
    const lines = response.split('\n').filter((line) => line.trim());

    const insights: string[] = [];
    const skills: string[] = [];
    const improvements: string[] = [];
    const knowledge: string[] = [];
    const behavioralChanges: string[] = [];
    const learningGoals: string[] = [];

    let currentSection = '';

    lines.forEach((line) => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('insight')) currentSection = 'insights';
      else if (lowerLine.includes('skill') || lowerLine.includes('capability'))
        currentSection = 'skills';
      else if (lowerLine.includes('improvement'))
        currentSection = 'improvements';
      else if (lowerLine.includes('knowledge')) currentSection = 'knowledge';
      else if (lowerLine.includes('behavioral') || lowerLine.includes('change'))
        currentSection = 'behavioral';
      else if (lowerLine.includes('goal') || lowerLine.includes('future'))
        currentSection = 'goals';
      else if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
        const content = line.replace(/^[-•]\s*/, '').trim();
        switch (currentSection) {
          case 'insights':
            insights.push(content);
            break;
          case 'skills':
            skills.push(content);
            break;
          case 'improvements':
            improvements.push(content);
            break;
          case 'knowledge':
            knowledge.push(content);
            break;
          case 'behavioral':
            behavioralChanges.push(content);
            break;
          case 'goals':
            learningGoals.push(content);
            break;
        }
      }
    });

    return {
      id: `synthesis-${Date.now()}`,
      timestamp: Date.now(),
      insights,
      skills,
      improvements,
      knowledge,
      behavioralChanges,
      learningGoals,
      experienceCount: experiences.length,
      patternCount: patterns.length,
      confidence: 0.8,
    };
  }

  /**
   * Generate insights from analysis
   */
  async generateInsights(analysis: ExperienceAnalysis): Promise<Insight[]> {
    if (!this.config.enableInsightGeneration) {
      return [];
    }

    const now = Date.now();
    if (
      now - this.lastInsightGeneration <
      this.config.insightGenerationFrequency
    ) {
      return []; // Too soon for new insights
    }

    const prompt = `Generate insights from this experience analysis:

Patterns Found:
${analysis.patterns.map((pattern) => `- ${pattern.name}: ${pattern.description}`).join('\n')}

Learning Synthesis:
${analysis.learningSynthesis ? `- Insights: ${analysis.learningSynthesis.insights.join(', ')}` : 'None'}

Generate actionable insights that include:
1. Insight description
2. Evidence supporting the insight
3. Actionable recommendations
4. Expected impact
5. Implementation priority (0-1)

Focus on insights that can drive improvement.`;

    try {
      const response = await this.llm.generateResponse(
        prompt,
        {
          systemPrompt:
            'You are generating actionable insights from analysis. Be specific and practical.',
        },
        {
          temperature: 0.6,
          maxTokens: 1024,
        }
      );

      const insights = this.parseInsightsResponse(response.text);
      this.insights.push(...insights);
      this.lastInsightGeneration = now;

      return insights;
    } catch (error) {
      console.error('Error generating insights:', error);
      return [];
    }
  }

  /**
   * Parse insights response
   */
  private parseInsightsResponse(response: string): Insight[] {
    const insights: Insight[] = [];
    const sections = response
      .split(/\d+\./)
      .filter((section) => section.trim());

    sections.forEach((section, index) => {
      const lines = section
        .trim()
        .split('\n')
        .filter((line) => line.trim());
      if (lines.length >= 3) {
        const description = lines[0].trim();
        const evidence = lines
          .filter(
            (line) => line.includes('evidence') || line.includes('support')
          )
          .slice(0, 2);
        const recommendations = lines
          .filter(
            (line) => line.includes('recommend') || line.includes('action')
          )
          .slice(0, 2);

        const impactMatch = response.match(/impact.*?(\d+\.?\d*)/i);
        const impact = impactMatch ? parseFloat(impactMatch[1]) : 0.5;

        const priorityMatch = response.match(/priority.*?(\d+\.?\d*)/i);
        const priority = priorityMatch ? parseFloat(priorityMatch[1]) : 0.5;

        insights.push({
          id: `insight-${Date.now()}-${index}`,
          description,
          evidence: evidence.map((e) => e.replace(/^[-•]\s*/, '').trim()),
          recommendations: recommendations.map((r) =>
            r.replace(/^[-•]\s*/, '').trim()
          ),
          impact,
          priority,
          timestamp: Date.now(),
        });
      }
    });

    return insights;
  }

  /**
   * Generate improvement plans from insights
   */
  async generateImprovementPlans(insights: Insight[]): Promise<Plan[]> {
    if (!this.config.enableImprovementPlanning || insights.length === 0) {
      return [];
    }

    const highPriorityInsights = insights
      .filter((insight) => insight.priority >= 0.7)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5);

    const prompt = `Generate improvement plans for these high-priority insights:

${highPriorityInsights
  .map(
    (insight) =>
      `Insight: ${insight.description}
   Priority: ${insight.priority}
   Recommendations: ${insight.recommendations.join(', ')}`
  )
  .join('\n\n')}

For each insight, create a detailed improvement plan with:
1. Specific goals
2. Actionable steps
3. Timeline
4. Success metrics
5. Potential obstacles
6. Resources needed

Make plans specific, measurable, and achievable.`;

    try {
      const response = await this.llm.generateResponse(
        prompt,
        {
          systemPrompt:
            'You are creating improvement plans. Make them specific and actionable.',
        },
        {
          temperature: 0.4,
          maxTokens: 1024,
        }
      );

      return this.parseImprovementPlans(response.text, highPriorityInsights);
    } catch (error) {
      console.error('Error generating improvement plans:', error);
      return [];
    }
  }

  /**
   * Parse improvement plans response
   */
  private parseImprovementPlans(response: string, insights: Insight[]): Plan[] {
    const plans: Plan[] = [];
    const sections = response
      .split(/\d+\./)
      .filter((section) => section.trim());

    sections.forEach((section, index) => {
      const lines = section
        .trim()
        .split('\n')
        .filter((line) => line.trim());
      if (lines.length >= 4 && insights[index]) {
        const goals = lines
          .filter((line) => line.includes('goal') || line.includes('objective'))
          .slice(0, 2);
        const steps = lines
          .filter((line) => line.includes('step') || line.includes('action'))
          .slice(0, 3);
        const timeline = lines.find(
          (line) => line.includes('timeline') || line.includes('schedule')
        );
        const metrics = lines
          .filter((line) => line.includes('metric') || line.includes('measure'))
          .slice(0, 2);

        plans.push({
          id: `plan-${Date.now()}-${index}`,
          insightId: insights[index].id,
          goals: goals.map((g) => g.replace(/^[-•]\s*/, '').trim()),
          steps: steps.map((s) => s.replace(/^[-•]\s*/, '').trim()),
          timeline: timeline?.replace(/^[-•]\s*/, '').trim() || '2-4 weeks',
          successMetrics: metrics.map((m) => m.replace(/^[-•]\s*/, '').trim()),
          obstacles: [],
          resources: [],
          priority: insights[index].priority,
          status: 'pending',
          timestamp: Date.now(),
        });
      }
    });

    return plans;
  }

  /**
   * Create empty learning synthesis
   */
  private createEmptyLearningSynthesis(): LearningSynthesis {
    return {
      id: `empty-synthesis-${Date.now()}`,
      timestamp: Date.now(),
      insights: [],
      skills: [],
      improvements: [],
      knowledge: [],
      behavioralChanges: [],
      learningGoals: [],
      experienceCount: 0,
      patternCount: 0,
      confidence: 0,
    };
  }

  /**
   * Add experience to the reflection engine
   */
  addExperience(experience: Experience): void {
    this.experiences.push(experience);

    // Limit experience history
    if (this.experiences.length > 100) {
      this.experiences = this.experiences.slice(-100);
    }
  }

  /**
   * Get recent experiences
   */
  getRecentExperiences(limit: number = 20): Experience[] {
    return this.experiences.slice(-limit);
  }

  /**
   * Get all patterns
   */
  getPatterns(): Pattern[] {
    return [...this.patterns];
  }

  /**
   * Get all insights
   */
  getInsights(): Insight[] {
    return [...this.insights];
  }

  /**
   * Get all learning syntheses
   */
  getLearningSyntheses(): LearningSynthesis[] {
    return [...this.learningSyntheses];
  }

  /**
   * Get reflection engine statistics
   */
  getStats() {
    return {
      totalExperiences: this.experiences.length,
      totalPatterns: this.patterns.length,
      totalInsights: this.insights.length,
      totalSyntheses: this.learningSyntheses.length,
      averagePatternSignificance:
        this.patterns.length > 0
          ? this.patterns.reduce((sum, p) => sum + p.significance, 0) /
            this.patterns.length
          : 0,
      averageInsightPriority:
        this.insights.length > 0
          ? this.insights.reduce((sum, i) => sum + i.priority, 0) /
            this.insights.length
          : 0,
      config: this.config,
    };
  }
}
