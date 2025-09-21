/**
 * Creative Paraphrasing System
 *
 * Provides context-aware task rephrasing and creative language generation
 * for improved user interaction and task understanding.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import {
  EnvironmentalContext,
  EnvironmentalContextSchema,
  TaskDefinition,
  TaskDefinitionSchema,
  ChatMessage,
  Command,
} from './types';

import {
  DualChannelPrompting,
  ChannelType,
  TaskParaphraseResult,
  PromptResult,
} from './dual-channel-prompting';

// ===== CREATIVE PARAPHRASING SCHEMAS =====

/**
 * Paraphrasing style enumeration
 */
export const ParaphrasingStyleSchema = z.enum([
  'casual',
  'formal',
  'technical',
  'storytelling',
  'instructional',
  'conversational',
  'poetic',
]);

export type ParaphrasingStyle = z.infer<typeof ParaphrasingStyleSchema>;

/**
 * Context adaptation type
 */
export const ContextAdaptationSchema = z.enum([
  'simplify_language',
  'add_context',
  'adjust_tone',
  'include_emotion',
  'add_urgency',
  'remove_complexity',
  'enhance_clarity',
]);

export type ContextAdaptation = z.infer<typeof ContextAdaptationSchema>;

/**
 * Creative paraphrasing configuration
 */
export const CreativeParaphrasingConfigSchema = z.object({
  enable_context_adaptation: z.boolean(),
  enable_style_matching: z.boolean(),
  enable_emotion_integration: z.boolean(),
  enable_cultural_adaptation: z.boolean(),
  max_paraphrase_length: z.number().positive(),
  min_confidence_threshold: z.number().min(0).max(1),
  enable_fallback_paraphrasing: z.boolean(),
  max_adaptation_attempts: z.number().nonnegative(),
});

export type CreativeParaphrasingConfig = z.infer<
  typeof CreativeParaphrasingConfigSchema
>;

/**
 * Paraphrasing context
 */
export const ParaphrasingContextSchema = z.object({
  user_personality: z.string().optional(),
  user_expertise_level: z
    .enum(['beginner', 'intermediate', 'expert'])
    .optional(),
  user_preferred_style: ParaphrasingStyleSchema.optional(),
  cultural_context: z.string().optional(),
  emotional_state: z.string().optional(),
  urgency_level: z.number().min(0).max(1).optional(),
  previous_interactions: z.array(z.string()).optional(),
});

export type ParaphrasingContext = z.infer<typeof ParaphrasingContextSchema>;

/**
 * Enhanced paraphrase result
 */
export const EnhancedParaphraseResultSchema = z.object({
  id: z.string(),
  original_task: z.string(),
  paraphrased_task: z.string(),
  style_used: ParaphrasingStyleSchema,
  adaptations_applied: z.array(ContextAdaptationSchema),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  context_adaptations: z.array(z.string()),
  user_feedback_score: z.number().min(0).max(1).optional(),
  metadata: z.record(z.any()),
});

export type EnhancedParaphraseResult = z.infer<
  typeof EnhancedParaphraseResultSchema
>;

/**
 * Language generation request
 */
export const LanguageGenerationRequestSchema = z.object({
  task: TaskDefinitionSchema,
  environmental_context: EnvironmentalContextSchema,
  paraphrasing_context: z.any(), // Use any to avoid circular dependency
  target_style: z.any(), // Use any to avoid circular dependency
  target_length: z.number().positive().optional(),
  include_emotion: z.boolean().optional(),
  include_context: z.boolean().optional(),
});

export type LanguageGenerationRequest = z.infer<
  typeof LanguageGenerationRequestSchema
> & {
  paraphrasing_context: ParaphrasingContext; // Override the any type
  target_style: ParaphrasingStyle; // Override the any type
};

// ===== DEFAULT CONFIGURATIONS =====

/**
 * Default creative paraphrasing configuration
 */
export const DEFAULT_CREATIVE_PARAPHRASING_CONFIG: CreativeParaphrasingConfig =
  {
    enable_context_adaptation: true,
    enable_style_matching: true,
    enable_emotion_integration: true,
    enable_cultural_adaptation: true,
    max_paraphrase_length: 200,
    min_confidence_threshold: 0.7,
    enable_fallback_paraphrasing: true,
    max_adaptation_attempts: 3,
  };

/**
 * Style-specific prompt templates
 */
export const STYLE_PROMPT_TEMPLATES: Record<ParaphrasingStyle, string> = {
  casual: `Rephrase this task in a casual, friendly way that feels natural and conversational. Use simple language and make it sound like you're talking to a friend.`,
  formal: `Rephrase this task in a formal, professional manner. Use precise language and maintain a respectful tone appropriate for business or academic contexts.`,
  technical: `Convert this task into technical language suitable for system implementation. Focus on precision, clarity, and technical accuracy.`,
  storytelling: `Transform this task into a narrative format. Make it engaging and story-like while maintaining the core task requirements.`,
  instructional: `Rephrase this task as clear, step-by-step instructions. Make it easy to follow and understand for someone who needs guidance.`,
  conversational: `Rephrase this task in a conversational style that encourages dialogue and interaction. Make it feel like part of a natural conversation.`,
  poetic: `Rephrase this task using poetic language and creative expression. Make it beautiful and inspiring while preserving the task's meaning.`,
};

// ===== CREATIVE PARAPHRASING SYSTEM =====

/**
 * Creative Paraphrasing System
 *
 * Provides advanced task rephrasing and language generation capabilities
 * with context-aware adaptations and style matching.
 */
export class CreativeParaphrasing extends EventEmitter {
  private config: CreativeParaphrasingConfig;
  private dualChannelPrompting: DualChannelPrompting;
  private paraphraseHistory: Map<string, EnhancedParaphraseResult> = new Map();
  private stylePerformanceStats: Map<ParaphrasingStyle, number> = new Map();
  private performanceMetrics = {
    average_confidence: 0,
    style_effectiveness: {} as Record<ParaphrasingStyle, number>,
    adaptation_success_rate: 0,
    user_satisfaction_score: 0,
  };

  constructor(
    dualChannelPrompting: DualChannelPrompting,
    config: Partial<CreativeParaphrasingConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CREATIVE_PARAPHRASING_CONFIG, ...config };
    this.dualChannelPrompting = dualChannelPrompting;

    // Initialize style performance stats
    Object.values(ParaphrasingStyleSchema.enum).forEach((style) => {
      this.stylePerformanceStats.set(style, 0.5); // Default neutral score
    });
  }

  /**
   * Generate a creative paraphrase of a task
   */
  async generateCreativeParaphrase(
    task: TaskDefinition,
    environmentalContext: EnvironmentalContext,
    paraphrasingContext: ParaphrasingContext,
    targetStyle?: ParaphrasingStyle
  ): Promise<EnhancedParaphraseResult> {
    const startTime = Date.now();
    const paraphraseId = uuidv4();

    // Validate task type
    const validTaskTypes = [
      'gathering',
      'crafting',
      'building',
      'exploration',
      'combat',
      'social',
    ];
    if (!validTaskTypes.includes(task.type)) {
      throw new Error(
        `Invalid task type: ${task.type}. Valid types are: ${validTaskTypes.join(', ')}`
      );
    }

    try {
      // Determine the best style to use
      const style =
        targetStyle ||
        this.selectOptimalStyle(paraphrasingContext, environmentalContext);

      // Generate the paraphrase using dual-channel prompting
      const paraphraseResult = await this.dualChannelPrompting.paraphraseTask(
        task,
        environmentalContext,
        'user'
      );

      // Apply context adaptations
      const adaptations = this.determineContextAdaptations(
        paraphrasingContext,
        environmentalContext
      );
      const adaptedParaphrase = await this.applyContextAdaptations(
        paraphraseResult.paraphrased_task,
        adaptations,
        paraphrasingContext
      );

      // Apply style-specific transformations
      const styledParaphrase = await this.applyStyleTransformations(
        adaptedParaphrase,
        style,
        paraphrasingContext
      );

      // Calculate confidence and reasoning
      const confidence = this.calculateParaphraseConfidence(
        styledParaphrase,
        task,
        paraphrasingContext,
        style
      );

      const processingTime = Date.now() - startTime;

      const result: EnhancedParaphraseResult = {
        id: paraphraseId,
        original_task: JSON.stringify(task),
        paraphrased_task: styledParaphrase,
        style_used: style,
        adaptations_applied: adaptations,
        confidence,
        reasoning: this.generateReasoning(
          task,
          styledParaphrase,
          style,
          adaptations
        ),
        context_adaptations:
          this.generateContextAdaptationDescriptions(adaptations),
        metadata: {
          processing_time: processingTime,
          paraphrasing_context: paraphrasingContext,
          environmental_context: environmentalContext,
        },
      };

      // Store in history
      this.storeParaphraseResult(result);
      this.updateStylePerformanceStats(style, confidence);
      this.updatePerformanceMetrics(result);

      this.emit('paraphrase_generated', result);
      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;

      // Handle fallback paraphrasing
      if (this.config.enable_fallback_paraphrasing) {
        this.emit('fallback_paraphrasing', { error, task, processingTime });
        return this.generateFallbackParaphrase(
          task,
          environmentalContext,
          paraphrasingContext
        );
      }

      throw error;
    }
  }

  /**
   * Generate language for a specific request
   */
  async generateLanguage(request: LanguageGenerationRequest): Promise<string> {
    try {
      const paraphraseResult = await this.generateCreativeParaphrase(
        request.task as any,
        request.environmental_context as any,
        request.paraphrasing_context,
        request.target_style
      );

      // Apply additional customizations based on request
      let finalLanguage = paraphraseResult.paraphrased_task;

      if (request.include_emotion) {
        finalLanguage = await this.addEmotionalContext(
          finalLanguage,
          request.paraphrasing_context,
          request.environmental_context
        );
      }

      if (request.include_context) {
        finalLanguage = await this.addEnvironmentalContext(
          finalLanguage,
          request.environmental_context
        );
      }

      // Adjust length if specified
      if (request.target_length) {
        finalLanguage = this.adjustLength(
          finalLanguage,
          request.target_length || 100
        );
      }

      return finalLanguage;
    } catch (error) {
      this.emit('language_generation_error', { error, request });
      throw error;
    }
  }

  /**
   * Generate multiple paraphrasing options
   */
  async generateParaphrasingOptions(
    task: TaskDefinition,
    environmentalContext: EnvironmentalContext,
    paraphrasingContext: ParaphrasingContext,
    styles: ParaphrasingStyle[] = ['casual', 'formal', 'instructional']
  ): Promise<EnhancedParaphraseResult[]> {
    const results: EnhancedParaphraseResult[] = [];
    const errors: Error[] = [];

    for (const style of styles) {
      try {
        const result = await this.generateCreativeParaphrase(
          task,
          environmentalContext,
          paraphrasingContext,
          style
        );
        results.push(result);
      } catch (error) {
        this.emit('style_generation_error', { error, style, task });
        errors.push(error instanceof Error ? error : new Error(String(error)));
        // Continue with other styles
      }
    }

    // If all styles failed, throw an error
    if (results.length === 0 && errors.length > 0) {
      throw new Error(
        `All paraphrasing styles failed: ${errors.map((e) => e.message).join(', ')}`
      );
    }

    // Sort by confidence
    results.sort((a, b) => b.confidence - a.confidence);

    this.emit('paraphrasing_options_generated', { results, task });
    return results;
  }

  /**
   * Provide user feedback for paraphrase quality
   */
  provideUserFeedback(
    paraphraseId: string,
    feedbackScore: number,
    feedback?: string
  ): void {
    const paraphrase = this.paraphraseHistory.get(paraphraseId);
    if (paraphrase) {
      paraphrase.user_feedback_score = feedbackScore;

      // Update style performance based on feedback
      this.updateStylePerformanceFromFeedback(
        paraphrase.style_used,
        feedbackScore
      );

      // Update overall performance metrics
      this.updateUserSatisfactionMetrics(feedbackScore);

      this.emit('user_feedback_received', {
        paraphraseId,
        feedbackScore,
        feedback,
      });
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Select optimal paraphrasing style based on context
   */
  private selectOptimalStyle(
    paraphrasingContext: ParaphrasingContext,
    environmentalContext: EnvironmentalContext
  ): ParaphrasingStyle {
    // If user has a preferred style, use it
    if (paraphrasingContext.user_preferred_style) {
      return paraphrasingContext.user_preferred_style;
    }

    // Consider user expertise level
    if (paraphrasingContext.user_expertise_level === 'beginner') {
      return 'instructional';
    } else if (paraphrasingContext.user_expertise_level === 'expert') {
      return 'technical';
    }

    // Consider environmental context
    if (environmentalContext.threat_level > 0.8) {
      return 'formal'; // More serious tone for dangerous situations
    }

    // Consider urgency
    if (
      paraphrasingContext.urgency_level &&
      paraphrasingContext.urgency_level > 0.8
    ) {
      return 'instructional'; // Clear instructions for urgent tasks
    }

    // Default to conversational for general use
    return 'conversational';
  }

  /**
   * Determine context adaptations needed
   */
  private determineContextAdaptations(
    paraphrasingContext: ParaphrasingContext,
    environmentalContext: EnvironmentalContext
  ): ContextAdaptation[] {
    const adaptations: ContextAdaptation[] = [];

    // Simplify language for beginners
    if (paraphrasingContext.user_expertise_level === 'beginner') {
      adaptations.push('simplify_language');
      adaptations.push('remove_complexity');
    }

    // Add context for complex environmental situations
    if (environmentalContext.threat_level > 0.5) {
      adaptations.push('add_context');
      adaptations.push('add_urgency');
    }

    // Adjust tone based on user personality
    if (paraphrasingContext.user_personality?.includes('formal')) {
      adaptations.push('adjust_tone');
    }

    // Include emotion for expressive users
    if (
      paraphrasingContext.emotional_state &&
      this.config.enable_emotion_integration
    ) {
      adaptations.push('include_emotion');
    }

    // Enhance clarity for all cases
    adaptations.push('enhance_clarity');

    return adaptations;
  }

  /**
   * Apply context adaptations to paraphrase
   */
  private async applyContextAdaptations(
    paraphrase: string,
    adaptations: ContextAdaptation[],
    paraphrasingContext: ParaphrasingContext
  ): Promise<string> {
    let adaptedParaphrase = paraphrase;

    for (const adaptation of adaptations) {
      switch (adaptation) {
        case 'simplify_language':
          adaptedParaphrase = this.simplifyLanguage(adaptedParaphrase);
          break;
        case 'add_context':
          adaptedParaphrase = await this.addContextualInformation(
            adaptedParaphrase,
            paraphrasingContext
          );
          break;
        case 'adjust_tone':
          adaptedParaphrase = this.adjustTone(
            adaptedParaphrase,
            paraphrasingContext
          );
          break;
        case 'include_emotion':
          adaptedParaphrase = await this.addEmotionalContext(
            adaptedParaphrase,
            paraphrasingContext
          );
          break;
        case 'add_urgency':
          adaptedParaphrase = this.addUrgency(
            adaptedParaphrase,
            paraphrasingContext
          );
          break;
        case 'remove_complexity':
          adaptedParaphrase = this.removeComplexity(adaptedParaphrase);
          break;
        case 'enhance_clarity':
          adaptedParaphrase = this.enhanceClarity(adaptedParaphrase);
          break;
      }
    }

    return adaptedParaphrase;
  }

  /**
   * Apply style-specific transformations
   */
  private async applyStyleTransformations(
    paraphrase: string,
    style: ParaphrasingStyle,
    paraphrasingContext: ParaphrasingContext
  ): Promise<string> {
    const styleTemplate = STYLE_PROMPT_TEMPLATES[style];

    // Use dual-channel prompting to apply style transformation
    const promptResult = await this.dualChannelPrompting.generatePrompt(
      'expressive',
      `Style: ${styleTemplate}\n\nOriginal: ${paraphrase}\n\nUser Context: ${JSON.stringify(paraphrasingContext)}\n\nApply the style transformation.`,
      {} as EnvironmentalContext, // Minimal context for style transformation
      { style, original_paraphrase: paraphrase }
    );

    return promptResult.response;
  }

  /**
   * Calculate paraphrase confidence
   */
  private calculateParaphraseConfidence(
    paraphrase: string,
    originalTask: TaskDefinition,
    paraphrasingContext: ParaphrasingContext,
    style: ParaphrasingStyle
  ): number {
    let confidence = 0.8; // Base confidence

    // Check if paraphrase contains key task elements
    const taskKeywords = this.extractTaskKeywords(originalTask);
    const paraphraseLower = paraphrase.toLowerCase();

    const keywordMatches = taskKeywords.filter((keyword) =>
      paraphraseLower.includes(keyword.toLowerCase())
    ).length;

    confidence += (keywordMatches / taskKeywords.length) * 0.2;

    // Adjust based on style performance history
    const stylePerformance = this.stylePerformanceStats.get(style) || 0.5;
    confidence += stylePerformance * 0.1;

    // Adjust based on user expertise match
    if (
      paraphrasingContext.user_expertise_level === 'beginner' &&
      style === 'instructional'
    ) {
      confidence += 0.1;
    } else if (
      paraphrasingContext.user_expertise_level === 'expert' &&
      style === 'technical'
    ) {
      confidence += 0.1;
    }

    // Adjust based on length appropriateness
    if (paraphrase.length > 50 && paraphrase.length < 200) {
      confidence += 0.1;
    } else if (paraphrase.length > 200) {
      confidence -= 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Generate reasoning for paraphrase
   */
  private generateReasoning(
    task: TaskDefinition,
    paraphrase: string,
    style: ParaphrasingStyle,
    adaptations: ContextAdaptation[]
  ): string {
    const reasoning = [
      `Applied ${style} style for better user engagement`,
      `Used ${adaptations.length} context adaptations for improved clarity`,
      `Maintained task integrity while enhancing user experience`,
      `Adapted language complexity to match user needs`,
    ];

    return reasoning.join('. ');
  }

  /**
   * Generate context adaptation descriptions
   */
  private generateContextAdaptationDescriptions(
    adaptations: ContextAdaptation[]
  ): string[] {
    const descriptions: Record<ContextAdaptation, string> = {
      simplify_language: 'Simplified technical terms for better understanding',
      add_context: 'Added environmental and situational context',
      adjust_tone: 'Adjusted tone to match user preferences',
      include_emotion: 'Incorporated emotional context for engagement',
      add_urgency: 'Added urgency indicators for time-sensitive tasks',
      remove_complexity: 'Removed complex concepts for clarity',
      enhance_clarity: 'Enhanced overall clarity and readability',
    };

    return adaptations.map((adaptation) => descriptions[adaptation]);
  }

  /**
   * Language simplification
   */
  private simplifyLanguage(text: string): string {
    // Simple word replacement for common technical terms
    const replacements: Record<string, string> = {
      utilize: 'use',
      implement: 'do',
      execute: 'run',
      terminate: 'stop',
      initiate: 'start',
      facilitate: 'help',
      optimize: 'improve',
      synthesize: 'combine',
    };

    let simplified = text;
    Object.entries(replacements).forEach(([complex, simple]) => {
      simplified = simplified.replace(new RegExp(complex, 'gi'), simple);
    });

    return simplified;
  }

  /**
   * Add contextual information
   */
  private async addContextualInformation(
    paraphrase: string,
    paraphrasingContext: ParaphrasingContext
  ): Promise<string> {
    // Add user-specific context
    if (paraphrasingContext.user_personality) {
      paraphrase = `Given your ${paraphrasingContext.user_personality} approach, ${paraphrase}`;
    }

    if (paraphrasingContext.user_expertise_level) {
      paraphrase = `As a ${paraphrasingContext.user_expertise_level} user, ${paraphrase}`;
    }

    return paraphrase;
  }

  /**
   * Adjust tone based on user preferences
   */
  private adjustTone(
    paraphrase: string,
    paraphrasingContext: ParaphrasingContext
  ): string {
    if (paraphrasingContext.user_personality?.includes('formal')) {
      return paraphrase
        .replace(/gonna/g, 'going to')
        .replace(/wanna/g, 'want to')
        .replace(/gotta/g, 'got to');
    } else if (paraphrasingContext.user_personality?.includes('casual')) {
      return paraphrase
        .replace(/utilize/g, 'use')
        .replace(/implement/g, 'do')
        .replace(/execute/g, 'run');
    }

    return paraphrase;
  }

  /**
   * Add emotional context
   */
  private async addEmotionalContext(
    paraphrase: string,
    paraphrasingContext: ParaphrasingContext,
    environmentalContext?: EnvironmentalContext
  ): Promise<string> {
    if (paraphrasingContext.emotional_state) {
      const emotionalPrefixes: Record<string, string> = {
        excited: "I'm excited to help you with this! ",
        worried: 'I understand your concern. Let me help you with this: ',
        frustrated: "I can see this is frustrating. Here's what we can do: ",
        curious: "That's an interesting request! ",
        confident: "Great! I'm confident we can handle this: ",
      };

      const prefix =
        emotionalPrefixes[paraphrasingContext.emotional_state] || '';
      return prefix + paraphrase;
    }

    return paraphrase;
  }

  /**
   * Add environmental context
   */
  private async addEnvironmentalContext(
    paraphrase: string,
    environmentalContext: EnvironmentalContext
  ): Promise<string> {
    let contextInfo = '';

    if (environmentalContext.threat_level > 0.7) {
      contextInfo = 'Given the current dangerous situation, ';
    } else if (environmentalContext.time_of_day === 'night') {
      contextInfo = "Since it's nighttime, ";
    } else if (environmentalContext.weather === 'storm') {
      contextInfo = 'With the current storm conditions, ';
    }

    return contextInfo + paraphrase;
  }

  /**
   * Add urgency indicators
   */
  private addUrgency(
    paraphrase: string,
    paraphrasingContext: ParaphrasingContext
  ): string {
    if (
      paraphrasingContext.urgency_level &&
      paraphrasingContext.urgency_level > 0.7
    ) {
      return `This is urgent! ${paraphrase}`;
    }
    return paraphrase;
  }

  /**
   * Remove complexity
   */
  private removeComplexity(paraphrase: string): string {
    // Remove complex sentence structures
    return paraphrase
      .replace(/however, /gi, 'but ')
      .replace(/furthermore, /gi, 'also, ')
      .replace(/additionally, /gi, 'also, ')
      .replace(/consequently, /gi, 'so ');
  }

  /**
   * Enhance clarity
   */
  private enhanceClarity(paraphrase: string): string {
    // Add clarifying phrases
    return paraphrase.replace(/\./g, '. ').replace(/,/g, ', ').trim();
  }

  /**
   * Adjust length
   */
  private adjustLength(paraphrase: string, targetLength: number): string {
    if (paraphrase.length <= targetLength) {
      return paraphrase;
    }

    // Simple truncation with ellipsis
    return paraphrase.substring(0, targetLength - 3) + '...';
  }

  /**
   * Extract task keywords
   */
  private extractTaskKeywords(task: TaskDefinition): string[] {
    const keywords: string[] = [];

    // Add task type
    keywords.push(task.type);

    // Add parameter keys
    Object.keys(task.parameters).forEach((key) => {
      keywords.push(key);
    });

    // Add parameter values
    Object.values(task.parameters).forEach((value) => {
      if (typeof value === 'string') {
        keywords.push(value);
      }
    });

    return keywords;
  }

  /**
   * Generate fallback paraphrase
   */
  private async generateFallbackParaphrase(
    task: TaskDefinition,
    environmentalContext: EnvironmentalContext,
    paraphrasingContext: ParaphrasingContext
  ): Promise<EnhancedParaphraseResult> {
    // Simple fallback using basic task description
    const fallbackParaphrase = `I need to ${task.type} ${Object.entries(
      task.parameters
    )
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ')}`;

    return {
      id: uuidv4(),
      original_task: JSON.stringify(task),
      paraphrased_task: fallbackParaphrase,
      style_used: 'instructional',
      adaptations_applied: ['simplify_language', 'enhance_clarity'],
      confidence: 0.6,
      reasoning: 'Fallback paraphrase generated due to processing error',
      context_adaptations: ['Simplified language', 'Enhanced clarity'],
      metadata: { is_fallback: true },
    };
  }

  /**
   * Store paraphrase result
   */
  private storeParaphraseResult(result: EnhancedParaphraseResult): void {
    this.paraphraseHistory.set(result.id, result);

    // Maintain history size limit
    if (this.paraphraseHistory.size > 1000) {
      const oldestKey = this.paraphraseHistory.keys().next().value;
      if (oldestKey) {
        this.paraphraseHistory.delete(oldestKey);
      }
    }
  }

  /**
   * Update style performance stats
   */
  private updateStylePerformanceStats(
    style: ParaphrasingStyle,
    confidence: number
  ): void {
    const currentScore = this.stylePerformanceStats.get(style) || 0.5;
    const newScore = (currentScore + confidence) / 2;
    this.stylePerformanceStats.set(style, newScore);
  }

  /**
   * Update style performance from user feedback
   */
  private updateStylePerformanceFromFeedback(
    style: ParaphrasingStyle,
    feedbackScore: number
  ): void {
    const currentScore = this.stylePerformanceStats.get(style) || 0.5;
    const newScore = (currentScore + feedbackScore) / 2;
    this.stylePerformanceStats.set(style, newScore);
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(result: EnhancedParaphraseResult): void {
    const allResults = Array.from(this.paraphraseHistory.values());

    if (allResults.length > 0) {
      this.performanceMetrics.average_confidence =
        allResults.reduce((sum, r) => sum + r.confidence, 0) /
        allResults.length;
    }

    // Update style effectiveness
    Object.values(ParaphrasingStyleSchema.enum).forEach((style) => {
      const styleResults = allResults.filter((r) => r.style_used === style);
      if (styleResults.length > 0) {
        this.performanceMetrics.style_effectiveness[style] =
          styleResults.reduce((sum, r) => sum + r.confidence, 0) /
          styleResults.length;
      }
    });
  }

  /**
   * Update user satisfaction metrics
   */
  private updateUserSatisfactionMetrics(feedbackScore: number): void {
    const allResults = Array.from(this.paraphraseHistory.values());
    const resultsWithFeedback = allResults.filter(
      (r) => r.user_feedback_score !== undefined
    );

    if (resultsWithFeedback.length > 0) {
      this.performanceMetrics.user_satisfaction_score =
        resultsWithFeedback.reduce(
          (sum, r) => sum + (r.user_feedback_score || 0),
          0
        ) / resultsWithFeedback.length;
    }
  }

  // ===== PUBLIC GETTERS =====

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  /**
   * Get style performance statistics
   */
  getStylePerformanceStats() {
    return new Map(this.stylePerformanceStats);
  }

  /**
   * Get configuration
   */
  getConfig(): CreativeParaphrasingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CreativeParaphrasingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get paraphrase history
   */
  getParaphraseHistory(): EnhancedParaphraseResult[] {
    return Array.from(this.paraphraseHistory.values());
  }

  /**
   * Clear paraphrase history
   */
  clearParaphraseHistory(): void {
    this.paraphraseHistory.clear();
  }
}
