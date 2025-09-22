/**
 * Emotional Memory LLM Adapter
 *
 * Adapts the LLM interface to incorporate emotional memories and self-narratives
 * for identity-aware responses. Fine-tunes the LLM with emotional context to
 * create responses that reflect the agent's accumulated emotional experiences
 * and sense of self.
 *
 * @author @darianrosebrook
 */

import {
  MemoryAwareLLMInterface,
  MemoryEnhancedLLMContext,
  MemoryEnhancedResponse,
} from './memory-aware-llm';
import { LLMConfig } from '../types';
import {
  EmotionalMemoryManager,
  SelfNarrativeConstructor,
  SelfNarrative,
  IdentityMemoryGuardian,
} from '../../../memory/src/index';

/**
 * Emotional context for LLM adaptation
 */
export interface EmotionalLLMContext extends MemoryEnhancedLLMContext {
  /** Current emotional state */
  currentEmotionalState?: {
    primaryEmotion: string;
    intensity: number;
    stability: number;
    triggers: string[];
  };

  /** Include emotional memory context */
  includeEmotionalMemories?: boolean;

  /** Include self-narrative context */
  includeSelfNarratives?: boolean;

  /** Emotional focus for response */
  emotionalFocus?:
    | 'current_state'
    | 'recent_experiences'
    | 'identity_reinforcement'
    | 'emotional_processing'
    | 'identity_narrative'
    | 'balanced';

  /** Emotional regulation mode */
  emotionalRegulation?: boolean;

  /** Self-reflection mode */
  selfReflection?: boolean;
}

/**
 * Emotional context for LLM adaptation with memory data
 */
export interface EmotionalMemoryContext {
  /** Emotional memories for context */
  emotionalMemories: Array<{
    id: string;
    content: string;
    emotionalImpact: number;
    recency: number;
  }>;

  /** Self-narratives for identity context */
  selfNarratives: Array<{
    id: string;
    content: string;
    emotionalSignificance: number;
    identityImpact: number;
  }>;

  /** Emotional baseline */
  emotionalBaseline: {
    primaryEmotion: string;
    averageIntensity: number;
    moodStability: number;
  };

  /** Emotional focus for response */
  emotionalFocus?:
    | 'current_state'
    | 'recent_experiences'
    | 'identity_reinforcement'
    | 'emotional_processing'
    | 'identity_narrative'
    | 'balanced';
}

/**
 * Emotional memory enhanced response
 */
export interface EmotionalMemoryResponse extends MemoryEnhancedResponse {
  /** Emotional context used */
  emotionalContext?: {
    emotionalMemories: Array<{
      id: string;
      content: string;
      emotionalImpact: number;
      recency: number;
    }>;
    selfNarratives: Array<{
      id: string;
      content: string;
      emotionalSignificance: number;
      identityImpact: number;
    }>;
    emotionalBaseline: {
      primaryEmotion: string;
      averageIntensity: number;
      moodStability: number;
    };
  };

  /** Identity reinforcement */
  identityReinforcement?: {
    reinforcedTraits: string[];
    reinforcedValues: string[];
    narrativeIntegration: boolean;
    selfConceptUpdate: boolean;
  };

  /** Emotional processing */
  emotionalProcessing?: {
    emotionalValidation: boolean;
    copingStrategySuggested: boolean;
    identityReflectionTriggered: boolean;
  };
}

/**
 * Emotional memory LLM configuration
 */
export interface EmotionalMemoryLLMConfig {
  /** Enable emotional memory integration */
  enabled: boolean;

  /** Maximum emotional memories to include */
  maxEmotionalMemories: number;

  /** Maximum self-narratives to include */
  maxSelfNarratives: number;

  /** Emotional memory recency threshold (hours) */
  emotionalRecencyThreshold: number;

  /** Minimum emotional intensity to include */
  minEmotionalIntensity: number;

  /** Enable automatic emotional state tracking */
  autoEmotionalStateTracking: boolean;

  /** Enable emotional regulation assistance */
  enableEmotionalRegulation: boolean;

  /** Enable identity reinforcement */
  enableIdentityReinforcement: boolean;

  /** Enable self-reflection prompts */
  enableSelfReflection: boolean;

  /** Emotional memory weight in prompt */
  emotionalMemoryWeight: number; // 0-1

  /** Self-narrative weight in prompt */
  selfNarrativeWeight: number; // 0-1

  /** Emotional context injection strategy */
  emotionalContextStrategy: 'prepend' | 'interleave' | 'append' | 'contextual';
}

/**
 * Default configuration
 */
export const DEFAULT_EMOTIONAL_MEMORY_CONFIG: Partial<EmotionalMemoryLLMConfig> =
  {
    enabled: true,
    maxEmotionalMemories: 3,
    maxSelfNarratives: 2,
    emotionalRecencyThreshold: 72, // 3 days
    minEmotionalIntensity: 0.4,
    autoEmotionalStateTracking: true,
    enableEmotionalRegulation: true,
    enableIdentityReinforcement: true,
    enableSelfReflection: true,
    emotionalMemoryWeight: 0.3,
    selfNarrativeWeight: 0.2,
    emotionalContextStrategy: 'contextual',
  };

/**
 * Adapts LLM responses with emotional memory and identity context
 */
export class EmotionalMemoryLLMAdapter extends MemoryAwareLLMInterface {
  private emotionalManager?: EmotionalMemoryManager;
  private narrativeConstructor?: SelfNarrativeConstructor;
  private identityGuardian?: IdentityMemoryGuardian;
  private emotionalConfig: Required<EmotionalMemoryLLMConfig>;

  constructor(
    memoryAwareConfig: Partial<LLMConfig> = {},
    emotionalConfig: Partial<EmotionalMemoryLLMConfig> = {},
    emotionalManager?: EmotionalMemoryManager,
    narrativeConstructor?: SelfNarrativeConstructor,
    identityGuardian?: IdentityMemoryGuardian
  ) {
    super(memoryAwareConfig);

    this.emotionalConfig = {
      enabled: true,
      maxEmotionalMemories: 10,
      maxSelfNarratives: 5,
      emotionalRecencyThreshold: 24,
      minEmotionalIntensity: 0.5,
      autoEmotionalStateTracking: false,
      emotionalContextStrategy: 'prepend' as const,
      enableEmotionalRegulation: true,
      enableIdentityReinforcement: true,
      enableNarrativeIntegration: true,
      enableEmotionalHealthMonitoring: true,
      enableSelfConceptTracking: true,
      enablePatternLearning: true,
      ...emotionalConfig,
    } as Required<EmotionalMemoryLLMConfig>;

    this.emotionalManager = emotionalManager;
    this.narrativeConstructor = narrativeConstructor;
    this.identityGuardian = identityGuardian;
  }

  /**
   * Initialize emotional memory adapter
   */
  async initialize(): Promise<void> {
    if (this.emotionalConfig.enabled) {
      console.log('🧠 Emotional Memory LLM Adapter initialized');
      // Initialize base class if it has an initialize method
      if (typeof super.initialize === 'function') {
        await super.initialize();
      }
    }
  }

  /**
   * Generate response with emotional memory and identity context
   */
  async generateEmotionalResponse(
    prompt: string,
    context: EmotionalLLMContext = {},
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): Promise<EmotionalMemoryResponse> {
    if (!this.emotionalConfig.enabled) {
      return (await super.generateMemoryEnhancedResponse(
        prompt,
        context,
        options
      )) as EmotionalMemoryResponse;
    }

    const startTime = performance.now();

    // Get emotional context
    const emotionalContext = await this.buildEmotionalContext(context);

    // Enhance prompt with emotional and identity context
    const enhancedPrompt = await this.enhancePromptWithEmotionalContext(
      prompt,
      emotionalContext,
      context
    );

    // Generate base response
    const baseResponse = await super.generateMemoryEnhancedResponse(
      enhancedPrompt,
      context,
      options
    );

    // Add emotional processing
    const emotionalResponse = await this.addEmotionalProcessing(
      baseResponse as EmotionalMemoryResponse,
      emotionalContext,
      context
    );

    const endTime = performance.now();

    return {
      ...emotionalResponse,
      latency: endTime - startTime,
    };
  }

  /**
   * Get current emotional state
   */
  async getCurrentEmotionalState(): Promise<
    EmotionalLLMContext['currentEmotionalState']
  > {
    if (!this.emotionalManager) {
      return {
        primaryEmotion: 'neutral',
        intensity: 0.5,
        stability: 0.5,
        triggers: [],
      };
    }

    const insights = await this.emotionalManager.getEmotionalInsights();
    const dominantEmotion = insights.emotionalTrends.sort(
      (a, b) => b.frequency - a.frequency
    )[0];

    return {
      primaryEmotion: dominantEmotion?.emotion || 'neutral',
      intensity: dominantEmotion?.averageIntensity || 0.5,
      stability: insights.moodStability,
      triggers: insights.commonTriggers.slice(0, 3).map((t) => t.trigger),
    };
  }

  /**
   * Update emotional state from interaction
   */
  async updateEmotionalState(emotionalState: {
    primaryEmotion: string;
    intensity: number;
    triggers?: string[];
    context?: string;
  }): Promise<void> {
    if (!this.emotionalManager) return;

    await this.emotionalManager.recordEmotionalState({
      primaryEmotion: emotionalState.primaryEmotion as any,
      intensity: emotionalState.intensity,
      triggers: emotionalState.triggers || [],
      context: emotionalState.context || 'LLM interaction',
      secondaryEmotions: [],
    });

    console.log(
      `💭 Updated emotional state: ${emotionalState.primaryEmotion} (${emotionalState.intensity})`
    );
  }

  /**
   * Get emotional memory insights
   */
  async getEmotionalMemoryInsights(): Promise<{
    emotionalTrends: Array<{
      emotion: string;
      frequency: number;
      averageIntensity: number;
    }>;
    emotionalHealthScore: number;
    moodStability: number;
    copingEffectiveness: number;
  }> {
    if (!this.emotionalManager) {
      return {
        emotionalTrends: [],
        emotionalHealthScore: 0.5,
        moodStability: 0.5,
        copingEffectiveness: 0.5,
      };
    }

    const insights = await this.emotionalManager.getEmotionalInsights();

    return {
      emotionalTrends: insights.emotionalTrends,
      emotionalHealthScore: insights.emotionalHealthScore,
      moodStability: insights.moodStability,
      copingEffectiveness:
        insights.effectiveCopingStrategies.length > 0
          ? insights.effectiveCopingStrategies[0].effectiveness
          : 0.5,
    };
  }

  /**
   * Get recent self-narratives
   */
  getRecentSelfNarratives(count: number = 3): SelfNarrative[] {
    if (!this.narrativeConstructor) return [];

    return this.narrativeConstructor.getRecentNarratives(count);
  }

  /**
   * Update configuration
   */
  updateEmotionalConfig(newConfig: Partial<EmotionalMemoryLLMConfig>): void {
    this.emotionalConfig = {
      ...this.emotionalConfig,
      ...newConfig,
    };
    console.log('⚙️ Updated emotional memory LLM adapter configuration');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async buildEmotionalContext(
    _context: EmotionalLLMContext
  ): Promise<EmotionalMemoryContext | undefined> {
    if (!this.emotionalManager && !this.narrativeConstructor) {
      return {
        emotionalMemories: [],
        selfNarratives: [],
        emotionalBaseline: {
          primaryEmotion: 'neutral',
          averageIntensity: 0.5,
          moodStability: 0.5,
        },
      };
    }

    const emotionalMemories: EmotionalMemoryContext['emotionalMemories'] = [];
    const selfNarratives: EmotionalMemoryContext['selfNarratives'] = [];

    // Get emotional memories
    if (this.emotionalManager) {
      await this.emotionalManager.getEmotionalInsights();

      // Get recent high-intensity emotional memories
      const emotionalStates = await this.emotionalManager.getEmotionalStates();
      const recentThreshold =
        Date.now() -
        this.emotionalConfig.emotionalRecencyThreshold * 60 * 60 * 1000;

      for (const state of emotionalStates) {
        if (
          state.intensity >= this.emotionalConfig.minEmotionalIntensity &&
          state.timestamp >= recentThreshold
        ) {
          emotionalMemories.push({
            id: state.id,
            content: `${state.primaryEmotion} experience: ${state.triggers.join(', ')}`,
            emotionalImpact: state.intensity,
            recency: (Date.now() - state.timestamp) / (1000 * 60 * 60), // Hours ago
          });

          if (
            emotionalMemories.length >=
            this.emotionalConfig.maxEmotionalMemories
          )
            break;
        }
      }
    }

    // Get relevant self-narratives
    if (this.narrativeConstructor) {
      const recentNarratives = this.narrativeConstructor.getRecentNarratives(5);

      for (const narrative of recentNarratives) {
        if (narrative.emotionalContext) {
          selfNarratives.push({
            id: narrative.id,
            content: narrative.narrative.content,
            emotionalSignificance: narrative.emotionalContext.averageIntensity,
            identityImpact: narrative.significance,
          });

          if (selfNarratives.length >= this.emotionalConfig.maxSelfNarratives)
            break;
        }
      }
    }

    // Get emotional baseline
    const emotionalBaseline = await this.getCurrentEmotionalState();

    return {
      emotionalMemories,
      selfNarratives,
      emotionalBaseline: {
        primaryEmotion: emotionalBaseline?.primaryEmotion || 'neutral',
        averageIntensity: emotionalBaseline?.intensity || 0.5,
        moodStability: emotionalBaseline?.stability || 0.5,
      },
    };
  }

  private async enhancePromptWithEmotionalContext(
    prompt: string,
    emotionalContext: EmotionalMemoryContext | undefined,
    context: EmotionalLLMContext
  ): Promise<string> {
    if (
      !emotionalContext ||
      (!(emotionalContext as any).emotionalMemories.length &&
        !(emotionalContext as any).selfNarratives.length)
    ) {
      return prompt;
    }

    const emotionalPrompts: string[] = [];

    // Add emotional state context
    if (context.currentEmotionalState) {
      emotionalPrompts.push(
        `Current emotional state: ${context.currentEmotionalState.primaryEmotion} ` +
          `(${context.currentEmotionalState.intensity.toFixed(2)} intensity)`
      );
    }

    // Add emotional baseline
    if (emotionalContext.emotionalBaseline) {
      emotionalPrompts.push(
        `Emotional baseline: ${emotionalContext.emotionalBaseline?.primaryEmotion || 'neutral'} ` +
          `(stability: ${emotionalContext.emotionalBaseline?.moodStability?.toFixed(2) || '0.50'})`
      );
    }

    // Add emotional memories
    if (
      emotionalContext?.emotionalMemories &&
      emotionalContext.emotionalMemories.length > 0
    ) {
      const memoryTexts = emotionalContext.emotionalMemories
        .sort((a, b) => b.emotionalImpact - a.emotionalImpact)
        .map((mem) => `[Emotional Memory] ${mem.content}`)
        .join('\n');

      emotionalPrompts.push(`Relevant emotional experiences:\n${memoryTexts}`);
    }

    // Add self-narratives
    if (
      emotionalContext?.selfNarratives &&
      emotionalContext.selfNarratives.length > 0
    ) {
      const narrativeTexts = emotionalContext.selfNarratives
        .sort((a, b) => b.identityImpact - a.identityImpact)
        .map((nar) => `[Self-Narrative] ${nar.content.substring(0, 200)}...`)
        .join('\n');

      emotionalPrompts.push(`Personal narrative context:\n${narrativeTexts}`);
    }

    // Add emotional focus guidance
    if (emotionalContext.emotionalFocus) {
      switch (emotionalContext.emotionalFocus) {
        case 'current_state':
          emotionalPrompts.push('Focus on processing current emotional state.');
          break;
        case 'recent_experiences':
          emotionalPrompts.push('Draw from recent emotional experiences.');
          break;
        case 'identity_narrative':
          emotionalPrompts.push(
            'Consider how this relates to your identity and values.'
          );
          break;
        case 'balanced':
          emotionalPrompts.push(
            'Balance emotional context with rational analysis.'
          );
          break;
      }
    }

    // Add emotional regulation guidance
    if (context.emotionalRegulation) {
      emotionalPrompts.push(
        'Provide emotional regulation strategies if appropriate. ' +
          'Help process emotions constructively.'
      );
    }

    // Add self-reflection guidance
    if (context.selfReflection) {
      emotionalPrompts.push(
        'Encourage self-reflection and identity integration. ' +
          'Help connect experiences to personal growth.'
      );
    }

    // Inject emotional context into prompt
    const emotionalContextText = emotionalPrompts.join('\n\n');

    switch (this.emotionalConfig.emotionalContextStrategy) {
      case 'prepend':
        return `${emotionalContextText}\n\n---\n\n${prompt}`;
      case 'append':
        return `${prompt}\n\n---\n\n${emotionalContextText}`;
      case 'interleave':
        // Insert emotional context at natural break points
        const sentences = prompt.split(/[.!?]+/).filter((s) => s.trim());
        const midPoint = Math.floor(sentences.length / 2);
        const firstPart = sentences.slice(0, midPoint).join('. ') + '.';
        const secondPart = sentences.slice(midPoint).join('. ') + '.';

        return `${firstPart}\n\n[Emotional Context]\n${emotionalContextText}\n\n${secondPart}`;
      case 'contextual':
      default:
        return `You are an AI assistant with access to emotional memories and self-narratives that inform your identity and emotional processing.

${emotionalContextText}

Based on this emotional and identity context, please respond to:

${prompt}

Your response should reflect the emotional awareness and self-understanding gained from these experiences.`;
    }
  }

  private async addEmotionalProcessing(
    response: EmotionalMemoryResponse,
    emotionalContext: EmotionalMemoryContext | undefined,
    context: EmotionalLLMContext
  ): Promise<EmotionalMemoryResponse> {
    if (
      !emotionalContext ||
      (!(emotionalContext as any).emotionalMemories.length &&
        !(emotionalContext as any).selfNarratives.length)
    ) {
      return response;
    }

    // Analyze emotional reinforcement
    const identityReinforcement = await this.analyzeIdentityReinforcement(
      response,
      emotionalContext
    );

    // Analyze emotional processing
    const emotionalProcessing = await this.analyzeEmotionalProcessing(
      response,
      context
    );

    // Update emotional state based on response
    if (this.emotionalConfig.autoEmotionalStateTracking && emotionalContext) {
      await this.updateEmotionalStateFromResponse(response, emotionalContext);
    }

    return {
      ...response,
      emotionalContext: emotionalContext || undefined,
      identityReinforcement,
      emotionalProcessing,
    };
  }

  private async analyzeIdentityReinforcement(
    response: EmotionalMemoryResponse,
    emotionalContext: EmotionalMemoryResponse['emotionalContext']
  ): Promise<EmotionalMemoryResponse['identityReinforcement']> {
    if (!this.identityGuardian) {
      return {
        reinforcedTraits: [],
        reinforcedValues: [],
        narrativeIntegration: false,
        selfConceptUpdate: false,
      };
    }

    const text = response.text.toLowerCase();
    const reinforcedTraits: string[] = [];
    const reinforcedValues: string[] = [];

    // Check for trait reinforcement
    const traitKeywords = {
      curious: ['curious', 'explore', 'discover', 'learn'],
      careful: ['careful', 'safe', 'caution', 'risk'],
      helpful: ['help', 'assist', 'support', 'aid'],
      persistent: ['persist', 'continue', 'try', 'effort'],
      brave: ['brave', 'courage', 'face', 'confront'],
    };

    for (const [trait, keywords] of Object.entries(traitKeywords)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        reinforcedTraits.push(trait);
      }
    }

    // Check for value reinforcement
    const valueKeywords = {
      safety: ['safe', 'protect', 'secure', 'harm'],
      honesty: ['honest', 'truth', 'transparent', 'genuine'],
      learning: ['learn', 'grow', 'improve', 'knowledge'],
      respect: ['respect', 'dignity', 'consideration', 'value'],
    };

    for (const [value, keywords] of Object.entries(valueKeywords)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        reinforcedValues.push(value);
      }
    }

    const narrativeIntegration =
      (emotionalContext as any)?.selfNarratives?.length > 0;
    const selfConceptUpdate =
      reinforcedTraits.length > 0 || reinforcedValues.length > 0;

    return {
      reinforcedTraits,
      reinforcedValues,
      narrativeIntegration,
      selfConceptUpdate,
    };
  }

  private async analyzeEmotionalProcessing(
    response: EmotionalMemoryResponse,
    _context: EmotionalLLMContext
  ): Promise<EmotionalMemoryResponse['emotionalProcessing']> {
    const text = response.text.toLowerCase();

    const emotionalValidation =
      text.includes('feel') ||
      text.includes('emotion') ||
      text.includes('understand') ||
      text.includes('valid');

    const copingStrategySuggested =
      text.includes('try') ||
      text.includes('breathe') ||
      text.includes('step') ||
      text.includes('approach') ||
      text.includes('manage');

    const identityReflectionTriggered =
      text.includes('you') ||
      text.includes('your') ||
      text.includes('self') ||
      text.includes('identity') ||
      text.includes('experience');

    return {
      emotionalValidation,
      copingStrategySuggested,
      identityReflectionTriggered,
    };
  }

  private async updateEmotionalStateFromResponse(
    response: EmotionalMemoryResponse,
    _emotionalContext?: EmotionalMemoryContext | undefined
  ): Promise<void> {
    // Analyze response sentiment to infer emotional state changes
    const text = response.text.toLowerCase();

    let primaryEmotion: string = 'neutral';
    let intensity: number = 0.3;

    // Simple sentiment analysis
    if (
      text.includes('happy') ||
      text.includes('great') ||
      text.includes('excellent')
    ) {
      primaryEmotion = 'happy';
      intensity = 0.6;
    } else if (
      text.includes('sad') ||
      text.includes('sorry') ||
      text.includes('unfortunate')
    ) {
      primaryEmotion = 'sad';
      intensity = 0.5;
    } else if (
      text.includes('angry') ||
      text.includes('frustrated') ||
      text.includes('annoyed')
    ) {
      primaryEmotion = 'angry';
      intensity = 0.4;
    } else if (
      text.includes('excited') ||
      text.includes('looking forward') ||
      text.includes('eager')
    ) {
      primaryEmotion = 'excited';
      intensity = 0.7;
    } else if (
      text.includes('anxious') ||
      text.includes('worried') ||
      text.includes('concerned')
    ) {
      primaryEmotion = 'anxious';
      intensity = 0.5;
    }

    if (primaryEmotion !== 'neutral') {
      await this.updateEmotionalState({
        primaryEmotion,
        intensity,
        context: 'LLM response processing',
      });
    }
  }

  /**
   * Close the emotional memory adapter
   */
  async close(): Promise<void> {
    // Call base class close method if it exists
    if (typeof super.close === 'function') {
      await super.close();
    }
  }
}
