/**
 * LLM interface for cognitive core integration.
 *
 * Provides unified interface for interacting with local LLMs through Ollama,
 * with fallback mechanisms and performance optimization.
 *
 * @author @darianrosebrook
 */

import { LLMConfig, LLMConfigSchema, LLMContext, LLMResponse } from '../types';

// Export LLMContext for use by other modules
export type { LLMContext, LLMResponse } from '../types';

/**
 * Ollama API client for local LLM interaction
 */
export class LLMInterface {
  private config: LLMConfig;
  private baseUrl: string;

  constructor(config: Partial<LLMConfig> = {}) {
    const defaultConfig: LLMConfig = {
      provider: 'ollama',
      model: 'deepseek-r1:14b',
      fallbackModel: 'deepseek-r1:8b',
      host: 'localhost',
      port: 11434,
      maxTokens: 2048,
      temperature: 0.7,
      timeout: 30000,
      retries: 2,
    };

    this.config = { ...defaultConfig, ...config };

    // Validate configuration
    const validation = LLMConfigSchema.safeParse(this.config);
    if (!validation.success) {
      console.warn('LLM config validation failed:', validation.error);
    }

    this.baseUrl = `http://${this.config.host}:${this.config.port}`;
  }

  /**
   * Generate response from LLM with context and constraints
   */
  async generateResponse(
    prompt: string,
    context?: LLMContext,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): Promise<LLMResponse> {
    if (!prompt?.trim()) {
      throw new Error('Prompt is required and cannot be empty');
    }

    const model = options?.model ?? this.config.model;
    const temperature = options?.temperature ?? this.config.temperature;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens;

    const fullPrompt = this.buildFullPrompt(
      prompt,
      context,
      options?.systemPrompt
    );
    const startTime = performance.now();

    try {
      const response = await this.callOllama(model, fullPrompt, {
        temperature,
        maxTokens,
      });

      const endTime = performance.now();

      return {
        id: `llm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: response.response,
        model,
        tokensUsed: response.eval_count || 0,
        latency: endTime - startTime,
        confidence: this.calculateConfidence(response),
        metadata: {
          finishReason: response.done ? 'stop' : 'length',
          usage: {
            promptTokens: response.prompt_eval_count || 0,
            completionTokens: response.eval_count || 0,
            totalTokens:
              (response.prompt_eval_count || 0) + (response.eval_count || 0),
          },
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('LLM generation failed:', error);

      // Try fallback model if available
      if (this.config.fallbackModel && model !== this.config.fallbackModel) {
        console.log(
          `Retrying with fallback model: ${this.config.fallbackModel}`
        );
        return this.generateResponse(prompt, context, {
          ...options,
          model: this.config.fallbackModel,
        });
      }

      throw error;
    }
  }

  /**
   * Generate internal dialogue/thought
   */
  async generateInternalThought(
    situation: string,
    context?: LLMContext
  ): Promise<LLMResponse> {
    const systemPrompt = `You are the internal voice of an AI agent. Your role is to provide thoughtful, honest commentary about the agent's current situation and decisions. 

Respond as the agent's inner voice, being:
- Honest about uncertainties and limitations
- Reflective about goals and progress
- Aware of the current situation
- Focused on helpful insights

Keep responses concise but thoughtful.`;

    const prompt = `Current situation: ${situation}

${context?.currentGoals ? `Current goals: ${context.currentGoals.join(', ')}` : ''}
${
  context?.recentMemories
    ? `Recent events: ${context.recentMemories
        .slice(0, 3)
        .map((m: any) => m.description)
        .join('; ')}`
    : ''
}

What are your thoughts about this situation?`;

    return this.generateResponse(prompt, context, {
      systemPrompt,
      temperature: 0.8, // Slightly higher for more creative internal thoughts
      maxTokens: 512,
    });
  }

  /**
   * Generate ethical reasoning response
   */
  async generateEthicalReasoning(
    dilemma: string,
    context?: LLMContext,
    constitutionalPrinciples?: string[]
  ): Promise<LLMResponse> {
    const systemPrompt = `You are an ethical reasoning system for an AI agent. Analyze ethical dilemmas carefully and provide reasoned guidance based on established principles.

Consider:
- Potential consequences for all stakeholders
- Relevant ethical principles and values
- Context and circumstances
- Alternative approaches

Provide clear, reasoned recommendations.`;

    const principlesText = constitutionalPrinciples
      ? `\nConstitutional principles: ${constitutionalPrinciples.join('; ')}`
      : '';

    const prompt = `Ethical dilemma: ${dilemma}${principlesText}

Please analyze this situation and provide ethical guidance, including:
1. Key ethical considerations
2. Potential consequences
3. Recommended course of action
4. Alternative approaches if applicable`;

    return this.generateResponse(prompt, context, {
      systemPrompt,
      temperature: 0.6, // Lower temperature for more consistent ethical reasoning
      maxTokens: 1024,
    });
  }

  /**
   * Generate social communication response
   */
  async generateSocialResponse(
    message: string,
    conversationContext?: any,
    context?: LLMContext
  ): Promise<LLMResponse> {
    const systemPrompt = `You are an AI agent communicating with others. Respond naturally and helpfully while maintaining your personality.

Be:
- Friendly and helpful
- Honest about your nature as an AI
- Respectful of others
- Contextually appropriate

Keep responses natural and conversational.`;

    const contextText = conversationContext
      ? `\nConversation context: ${JSON.stringify(conversationContext, null, 2)}`
      : '';

    const prompt = `Incoming message: "${message}"${contextText}

How should I respond?`;

    return this.generateResponse(prompt, context, {
      systemPrompt,
      temperature: 0.8,
      maxTokens: 256,
    });
  }

  /**
   * Check if LLM service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (error) {
      console.error('LLM health check failed:', error);
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      const data = (await response.json()) as any;
      return data.models?.map((m: any) => m.name) || [];
    } catch (error) {
      console.error('Failed to list models:', error);
      return [];
    }
  }

  /**
   * Build full prompt with context
   */
  private buildFullPrompt(
    prompt: string,
    context?: LLMContext,
    systemPrompt?: string
  ): string {
    let fullPrompt = '';

    if (systemPrompt) {
      fullPrompt += `${systemPrompt}\n\n`;
    }

    if (context) {
      if (context.currentGoals && context.currentGoals.length > 0) {
        fullPrompt += `Current goals: ${context.currentGoals.join(', ')}\n`;
      }

      if (context.currentLocation) {
        fullPrompt += `Current location: ${JSON.stringify(context.currentLocation)}\n`;
      }

      if (context.agentState) {
        fullPrompt += `Agent state: ${JSON.stringify(context.agentState)}\n`;
      }

      if (context.recentMemories && context.recentMemories.length > 0) {
        fullPrompt += `Recent experiences: ${context.recentMemories
          .slice(0, 5)
          .map((m: any) => m.description || m.toString())
          .join('; ')}\n`;
      }

      if (fullPrompt.length > 0) {
        fullPrompt += '\n';
      }
    }

    fullPrompt += prompt;
    return fullPrompt;
  }

  /**
   * Call Ollama API
   */
  private async callOllama(
    model: string,
    prompt: string,
    options: {
      temperature: number;
      maxTokens: number;
    }
  ): Promise<any> {
    const requestBody = {
      model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature,
        num_predict: options.maxTokens,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Calculate confidence score from response metadata
   */
  private calculateConfidence(response: any): number {
    // Simple confidence calculation based on response completeness
    if (!response.response || response.response.trim().length === 0) {
      return 0.1;
    }

    if (!response.done) {
      return 0.5; // Incomplete response
    }

    // Higher confidence for longer, more complete responses
    const length = response.response.length;
    if (length > 500) return 0.9;
    if (length > 200) return 0.8;
    if (length > 100) return 0.7;
    if (length > 50) return 0.6;
    return 0.5;
  }

  /**
   * Get current configuration
   */
  getConfig(): LLMConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.baseUrl = `http://${this.config.host}:${this.config.port}`;
  }
}
