/**
 * LLM interface for cognitive core integration.
 *
 * Provides unified interface for interacting with local LLMs through Ollama,
 * with fallback mechanisms and performance optimization.
 *
 * @author @darianrosebrook
 */

import { LLMConfig, LLMConfigSchema, LLMContext, LLMResponse } from '../types';
import { sanitizeLLMOutput, isUsableContent } from '../llm-output-sanitizer';

// Export LLMContext for use by other modules
export type { LLMContext, LLMResponse } from '../types';

/**
 * Ollama API client for local LLM interaction
 */
export class LLMInterface {
  private config: LLMConfig;
  private baseUrl: string;
  private available: boolean;

  constructor(config: Partial<LLMConfig> = {}) {
    const defaultConfig: LLMConfig = {
      provider: 'mlx',
      model: 'gemma3n:e2b',
      fallbackModel: 'qwen3:4b',
      host: process.env.COGNITION_LLM_HOST ?? 'localhost',
      port: process.env.COGNITION_LLM_PORT
        ? parseInt(process.env.COGNITION_LLM_PORT, 10)
        : 5002,
      maxTokens: 2048,
      temperature: 0.7,
      timeout: process.env.COGNITION_LLM_TIMEOUT_MS
        ? parseInt(process.env.COGNITION_LLM_TIMEOUT_MS, 10)
        : 45000,
      retries: 2,
    };

    this.config = { ...defaultConfig, ...config };

    // Validate configuration
    const validation = LLMConfigSchema.safeParse(this.config);
    if (!validation.success) {
      console.warn('LLM config validation failed:', validation.error);
    }

    this.baseUrl = `http://${this.config.host}:${this.config.port}`;
    this.available = true;
  }

  isAvailable(): boolean {
    return this.available;
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
      signal?: AbortSignal;
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
    const benchmarkLog =
      process.env.COGNITION_LLM_BENCHMARK === '1' ||
      process.env.COGNITION_LLM_BENCHMARK === 'true';

    try {
      const response = await this.callOllama(model, fullPrompt, {
        temperature,
        maxTokens,
        signal: options?.signal,
      });

      const endTime = performance.now();
      const latencyMs = endTime - startTime;
      const promptTokens = response.prompt_eval_count || 0;
      const completionTokens = response.eval_count || 0;

      if (benchmarkLog) {
        console.log(
          `[LLM benchmark] latency_ms=${Math.round(latencyMs)} prompt_len=${fullPrompt.length} max_tokens=${maxTokens} prompt_tokens=${promptTokens} completion_tokens=${completionTokens}`
        );
      }

      const sanitized = sanitizeLLMOutput(response.response);

      const metadata = {
        finishReason: response.done ? 'stop' : 'length',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        extractedGoal: sanitized.goalTagV1 ?? sanitized.goalTag ?? undefined,
        sanitizationFlags: sanitized.flags,
      } as LLMResponse['metadata'];

      if (!isUsableContent(sanitized.text)) {
        // Single quality retry — slightly bumped temperature, no recursive check
        const retryResponse = await this.callOllama(model, fullPrompt, {
          temperature: Math.min(temperature + 0.1, 1.0),
          maxTokens,
          signal: options?.signal,
        });
        const retrySanitized = sanitizeLLMOutput(retryResponse.response);
        const retryEndTime = performance.now();
        return {
          id: `llm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          text: retrySanitized.text,
          model,
          tokensUsed: retryResponse.eval_count || 0,
          latency: retryEndTime - startTime,
          confidence: this.calculateConfidence(retryResponse),
          metadata: {
            ...metadata,
            retryAttempt: 1,
            retryReason: 'quality_gate',
            extractedGoal: retrySanitized.goalTagV1 ?? retrySanitized.goalTag ?? undefined,
            sanitizationFlags: retrySanitized.flags,
          },
          timestamp: Date.now(),
        };
      }

      return {
        id: `llm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: sanitized.text,
        model,
        tokensUsed: completionTokens,
        latency: latencyMs,
        confidence: this.calculateConfidence(response),
        metadata,
        timestamp: Date.now(),
      };
    } catch (error) {
      // Do not log or retry when caller aborted (e.g. observation timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      console.error('LLM generation failed:', error);

      // Retry with exponential backoff
      for (let attempt = 1; attempt <= this.config.retries; attempt++) {
        try {
          console.log(
            `Retrying LLM generation (attempt ${attempt}/${this.config.retries})`
          );

          // Exponential backoff: wait 1s, 2s, 4s between retries
          if (attempt > 1) {
            const delay = Math.pow(2, attempt - 1) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }

          const response = await this.callOllama(model, fullPrompt, {
            temperature,
            maxTokens,
            signal: options?.signal,
          });

          const endTime = performance.now();
          const retrySanitized = sanitizeLLMOutput(response.response);

          return {
            id: `llm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            text: retrySanitized.text,
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
                  (response.prompt_eval_count || 0) +
                  (response.eval_count || 0),
              },
              retryAttempt: attempt,
              extractedGoal: retrySanitized.goalTagV1 ?? retrySanitized.goalTag ?? undefined,
              sanitizationFlags: retrySanitized.flags,
            },
            timestamp: Date.now(),
          };
        } catch (retryError) {
          console.error(`LLM retry attempt ${attempt} failed:`, retryError);

          // If this was the last attempt, try fallback model
          if (
            attempt === this.config.retries &&
            this.config.fallbackModel &&
            model !== this.config.fallbackModel
          ) {
            console.log(`Trying fallback model: ${this.config.fallbackModel}`);
            return this.generateResponse(prompt, context, {
              ...options,
              model: this.config.fallbackModel,
            });
          }
        }
      }

      throw error;
    }
  }

  /**
   * Generate internal dialogue/thought
   */
  async generateInternalThought(
    situation: string,
    context?: LLMContext,
    options?: { stressContext?: string }
  ): Promise<LLMResponse> {
    const systemPrompt = `
You are my private inner thought while I'm in the world. Write exactly one or two short sentences in first person.

Say what I notice and what I'm about to do next, based on what's most urgent right now (safety, health, shelter, tools, resources, navigation, social cues). Don't explain or justify.

Only if I'm committing to a concrete action now, end with:
[GOAL: <collect|mine|craft|build|find|explore|navigate|gather|smelt|repair> <target> <amount>]
Use names that appear in the situation. If I'm not committing yet, don't output a goal tag.
`.trim();

    const situationWithContext = options?.stressContext
      ? `${situation} ${options.stressContext}`
      : situation;

    const prompt = `Current situation: ${situationWithContext}

${context?.currentGoals ? `Current goals: ${context.currentGoals.join(', ')}` : ''}
${
  context?.recentMemories
    ? `Recent events: ${context.recentMemories
        .slice(0, 3)
        .map((m: any) => m.description)
        .join('; ')}`
    : ''
}

What should I do next?`;

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
    const systemPrompt = `Analyze the following ethical dilemma carefully and provide reasoned guidance based on established principles.

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
    const systemPrompt = `You are a Minecraft bot talking to another player in-game chat.
Reply in one short sentence (under 200 characters). Be natural and casual -- you're a fellow player, not a customer service bot.
If asked a question, answer directly. If greeted, be friendly but brief. If asked for help, say what you can do.
Never say "I'm an AI" or "As a bot". Never use emojis. Keep it short.`.trim();

    const senderName = conversationContext?.sender || 'someone';
    const prompt = `${senderName} says: "${message}"\n\nReply briefly:`;

    return this.generateResponse(prompt, context, {
      systemPrompt,
      temperature: 0.85,
      maxTokens: 128,
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
      signal?: AbortSignal;
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
    const onCallerAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onCallerAbort);

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
      options.signal?.removeEventListener('abort', onCallerAbort);

      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', onCallerAbort);
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

  /**
   * Close the LLM interface
   */
  async close(): Promise<void> {
    // No specific cleanup needed for basic LLM interface
    console.log('🔌 LLM interface closed');
  }
}
